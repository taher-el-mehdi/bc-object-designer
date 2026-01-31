import { ALSymbolKind } from './alsymbolkind.js';

/**
 * Parse Business Central symbol package (.app/.zip or JSON) and build
 * normalized objects + tree data for the UI.
 * Exports:
 * - parseAppFile(file)
 * - groupByType(objects)
 * - buildLeftTree(groups, packageName)
 * - buildRightTree(object)
 */

/**
 * Read and parse SymbolReferences.json from an .app/.zip ArrayBuffer or
 * fallback to a JSON string/ArrayBuffer. When reading from a zip, also
 * return the JSZip instance for optional source extraction.
 * @param {ArrayBuffer|string} file
 * @returns {Promise<{json:any, zip?:JSZip}>}
 */
async function readSymbolsJson(file){
    // Try .app/.zip first, then fall back to plain JSON content
    try {
      const jszip = new JSZip();
      const zip = await jszip.loadAsync(file);
      // Find SymbolReferences.json (case-insensitive)
      let entry = Object.values(zip.files).find(e => /symbolreferences\.json$/i.test(e.name));
      if (!entry) entry = Object.values(zip.files).find(e => /symbol.*\.json$/i.test(e.name));
      if (!entry) entry = Object.values(zip.files).find(e => /\.json$/i.test(e.name));
      if (!entry) throw new Error('SymbolReferences.json not found in app package');

      // Read as string and sanitize BOM/whitespace before JSON.parse
      const rawText = await entry.async('string');
      const cleaned = stripBOM(String(rawText)).trim();
      return { json: JSON.parse(cleaned), zip };
    } catch (zipErr) {
      // Not a zip? Try decode ArrayBuffer or direct JSON string
      let text;
      if (typeof file === 'string') {
        text = file;
      } else if (file && (file instanceof ArrayBuffer)) {
        text = new TextDecoder('utf-8').decode(new Uint8Array(file));
      } else {
        throw zipErr;
      }
      const cleaned = stripBOM(String(text)).trim();
      return { json: JSON.parse(cleaned), zip: undefined };
    }
  }

  function stripBOM(s){
    if (!s || !s.length) return s;
    if (s.charCodeAt(0) === 0xFEFF) return s.slice(1);
    // Some zips can prepend BOM-like chars; defensively remove leading \uFEFF if present
    return s.replace(/^\uFEFF/, '');
  }

  function collectSymbolsArrays(obj, out){
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { for (const it of obj) collectSymbolsArrays(it, out); return; }
    for (const [k,v] of Object.entries(obj)){
      const kl = k.toLowerCase();
      if ((kl === 'symbols' || kl === 'objects') && Array.isArray(v)) out.push(v);
      collectSymbolsArrays(v, out);
    }
  }

  // Extract objects from common BC sections when 'Symbols' is not present
  function extractObjectsFromKnownSections(raw){
    const sections = [
      ['Tables', 'Table'],
      ['TableExtensions', 'TableExtension'],
      ['Pages', 'Page'],
      ['Reports', 'Report'],
      ['XmlPorts', 'XmlPort'],
      ['Queries', 'Query'],
      ['Codeunits', 'Codeunit'],
      ['ControlAddIns', 'ControlAddIn'],
      ['EnumTypes', 'EnumType'],
      ['EnumExtensions', 'EnumExtension'],
      ['Interfaces', 'Interface'],
      ['PermissionSets', 'PermissionSet'],
      ['PermissionSetExtensions', 'PermissionSetExtension'],
      ['ReportExtensions', 'ReportExtension'],
      ['PageExtensions', 'PageExtension'],
      // Optional/rare
      ['DotNetPackages', 'DotNetPackage'],
      ['Profiles', 'Profile'],
      ['PageCustomizations', 'PageCustomization'],
      ['Entitlements', 'Entitlement']
    ];

    const out = [];

    function harvest(obj){
      if (!obj || typeof obj !== 'object') return;
      for (const [key, typeName] of sections){
        const arr = obj[key];
        if (Array.isArray(arr)){
          for (const item of arr){
            // Enrich item with a Type for downstream normalization
            out.push({ ...item, Type: typeName, type: typeName });
          }
        }
      }
      // Generic 'Objects' array with embedded type per item
      const generic = obj.Objects;
      if (Array.isArray(generic)){
        for (const item of generic){
          const t = item.Type || item.type || 'Undefined';
          out.push({ ...item, Type: t, type: t });
        }
      }
      // Recurse Namespaces if present
      const ns = obj.Namespaces;
      if (Array.isArray(ns)){
        for (const n of ns) harvest(n);
      }
    }

    harvest(raw);
    return out;
  }

  function normalizeSymbol(sym){
    const kind = String(sym.Kind || sym.kind || sym.Type || sym.type || '');
    const id = Number(sym.Id || sym.id || sym.ObjectId || sym.objectId || 0) || undefined;
    const name = sym.Name || sym.name || sym.ObjectName || sym.objectName || '';
    const caption = sym.Caption || sym.caption;

    const members = sym.Members || sym.members || [];
    const fields = [];
    const controls = [];
    const actions = [];
    const keys = [];
    const values = [];
    let relations = [];

    // Helper: property retrieval across different shapes/casing
    function getProp(obj, names){
      for (const n of names){
        const v = obj[n]; if (v !== undefined) return v;
        const lc = obj[n?.toLowerCase?.() || n]; if (lc !== undefined) return lc;
      }
      const props = obj.Properties || obj.properties;
      if (props && typeof props === 'object'){
        if (Array.isArray(props)){
          for (const p of props){
            const pn = String(p.Name || p.name || '');
            if (names.some(nn => pn.toLowerCase() === nn.toLowerCase())){ return p.Value ?? p.value; }
          }
        } else {
          for (const nn of names){
            const v = props[nn] ?? props[nn.toLowerCase?.() || nn];
            if (v !== undefined) return v;
          }
        }
      }
      return undefined;
    }

    // Robust field extraction for Tables and TableExtensions
    function extractTableFields(src){
      const out = [];
      const arrays = [];
      if (Array.isArray(src.Fields)) arrays.push(src.Fields);
      if (Array.isArray(src.fields)) arrays.push(src.fields);
      if (Array.isArray(members)) arrays.push(members);
      for (const arr of arrays){
        for (const f of arr){
          const mkind = String(f.Kind || f.kind || f.Type || f.type || '');
          const isLikelyField = /field|column/i.test(mkind) || (!!(f.Name || f.name) && (f.TypeDefinition || f.Type || f.type));
          if (!isLikelyField) continue;
          const fid = Number(f.Id || f.id || 0) || undefined;
          const fname = f.Name || f.name || '';
          const fcaption = f.Caption || f.caption;
          const ftype = (f.TypeDefinition && f.TypeDefinition.Name) || f.Type || f.type || undefined;
          const frel = getProp(f, ['TableRelation','Relation']);
          const isFF = /flowfield/i.test(String(getProp(f, ['FieldClass','Class']) || '')) || !!getProp(f, ['CalcFormula']);
          out.push({ id: fid, name: fname, caption: fcaption, type: ftype, relation: frel, flowfield: isFF });
          if (frel) relations.push({ field: fname, relation: frel });
        }
      }
      const seen = new Set(); const uniq = [];
      for (const x of out){
        const k = `${x.id ?? ''}|${(x.name||'').toLowerCase()}`;
        if (seen.has(k)) continue; seen.add(k); uniq.push(x);
      }
      return uniq;
    }

    if (/^table$/i.test(kind) || /^tableextension$/i.test(kind)){
      fields.push(...extractTableFields(sym));
    } else if (Array.isArray(members)){
      for (const m of members){
        const mkind = String(m.Kind || m.kind || m.Type || m.type || '');
        const mid = Number(m.Id || m.id || 0) || undefined;
        const mname = m.Name || m.name || '';
        const mcaption = m.Caption || m.caption;
        const fieldType = (m.TypeDefinition && m.TypeDefinition.Name) || m.Type || m.type || undefined;
        const tableRelation = m.TableRelation || m.tableRelation || m.Relation || m.relation || undefined;
        const controlSubtype = m.SubType || m.subType || m.ControlType || m.controlType || undefined;

        const base = { id: mid, name: mname, caption: mcaption };
        if (/field/i.test(mkind) || /column/i.test(mkind)){
          const isFlowField = /flowfield/i.test(String(m.FieldClass || m.fieldClass || m.Class || '')) || !!(m.CalcFormula || m.calcFormula);
          fields.push({ ...base, type: fieldType, relation: tableRelation, flowfield: isFlowField });
          if (tableRelation) relations.push({ field: mname, relation: tableRelation });
        } else if (/action/i.test(mkind)){
          actions.push({ ...base });
        } else if (/key/i.test(mkind)){
          const keyFields = m.KeyFields || m.Fields || m.FieldNames || undefined;
          keys.push({ ...base, fields: keyFields });
        } else if (/group|area|part|label|control|field|repeater/i.test(mkind)){
          controls.push({ ...base, subtype: controlSubtype });
        } else if (/enumvalue/i.test(mkind) || /value/i.test(mkind)){
          values.push(base);
        }
      }
    }

    // Some BC JSONs store Page controls separately
    if (Array.isArray(sym.Controls || sym.controls)){
      for (const c of (sym.Controls || sym.controls)){
        const cid = Number(c.Id || c.id || 0) || undefined;
        const cname = c.Name || c.name || '';
        const csub = (c.TypeDefinition && c.TypeDefinition.Name) || c.SubType || c.subType || c.ControlType || c.controlType || undefined;
        controls.push({ id: cid, name: cname, subtype: csub });
      }
    }

    // Some Page JSONs store Actions separately
    if (Array.isArray(sym.Actions || sym.actions)){
      for (const a of (sym.Actions || sym.actions)){
        const aid = Number(a.Id || a.id || 0) || undefined;
        const aname = a.Name || a.name || '';
        actions.push({ id: aid, name: aname });
      }
    }

    // Table JSONs may store Keys in dedicated collection
    if (Array.isArray(sym.Keys || sym.keys)){
      for (const k of (sym.Keys || sym.keys)){
        const kid = Number(k.Id || k.id || 0) || undefined;
        const kname = k.Name || k.name || '';
        const kfields = k.KeyFields || k.Fields || k.FieldNames || undefined;
        keys.push({ id: kid, name: kname, fields: kfields });
      }
    }

    relations = relations.filter(Boolean);

    // Reference source file if available
    const refSrc = sym.ReferenceSourceFileName || sym.SourceFile || sym.Source;
    // Collect common + type-specific properties for properties panel
    const properties = collectPropertiesFor(sym, kind);
    // Try to capture embedded source text when available
    const sourceText = sym.Source || sym.SourceText || sym.SourceCode || sym.Content || undefined;

    // Capture extension target for TableExtension
    let extendsTarget = undefined;
    if (/^tableextension$/i.test(kind)){
      extendsTarget = sym.TargetTable || sym.Target || sym.TargetObject || undefined;
    }

    // Report layouts (RDLC/Word)
    let rdlcLayout = undefined;
    let wordLayout = undefined;
    if (/^report$/i.test(kind)){
      rdlcLayout = getProp(sym, ['RDLCLayout', 'RdlcLayout']);
      wordLayout = getProp(sym, ['WordLayout']);
      if (typeof rdlcLayout === 'string') rdlcLayout = rdlcLayout.trim().replace(/^["']|["'];?$/g, ''); else rdlcLayout = undefined;
      if (typeof wordLayout === 'string') wordLayout = wordLayout.trim().replace(/^["']|["'];?$/g, ''); else wordLayout = undefined;
    }

    return { type: kind, id, name, caption, fields, controls, actions, keys, values, relations, refSrc, properties, sourceText, extendsTarget, rdlcLayout, wordLayout };
  }

  /**
   * Group normalized objects by their type.
   * @param {Array<any>} objects
   */
  function groupByType(objects){
    const byType = new Map();
    for (const o of objects){
      const t = o.type || 'Undefined';
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(o);
    }
    return Array.from(byType.entries()).map(([type, items]) => ({ type, items }));
  }

  // Mapping helpers mirroring extension kinds
  function kindForType(type){
    const map = {
      'Table': ALSymbolKind.TableObject,
      'Page': ALSymbolKind.PageObject,
      'Report': ALSymbolKind.ReportObject,
      'XmlPort': ALSymbolKind.XmlPortObject,
      'Query': ALSymbolKind.QueryObject,
      'Codeunit': ALSymbolKind.CodeunitObject,
      'ControlAddIn': ALSymbolKind.ControlAddInObject,
      'PageExtension': ALSymbolKind.PageExtensionObject,
      'TableExtension': ALSymbolKind.TableExtensionObject,
      'Profile': ALSymbolKind.ProfileObject,
      'PageCustomization': ALSymbolKind.PageCustomizationObject,
      'Enum': ALSymbolKind.EnumType,
      'EnumType': ALSymbolKind.EnumType,
      'EnumExtension': ALSymbolKind.EnumExtensionType,
      'Interface': ALSymbolKind.Interface,
      'ReportExtension': ALSymbolKind.ReportExtensionObject,
      'PermissionSet': ALSymbolKind.PermissionSet,
      'PermissionSetExtension': ALSymbolKind.PermissionSetExtension,
      'Entitlement': ALSymbolKind.Entitlement,
      'DotNetPackage': ALSymbolKind.DotNetPackage,
    };
    return map[type] || ALSymbolKind.Undefined;
  }

  function listKindForType(type){
    const map = {
      'Table': ALSymbolKind.TableObjectList,
      'Page': ALSymbolKind.PageObjectList,
      'Report': ALSymbolKind.ReportObjectList,
      'XmlPort': ALSymbolKind.XmlPortObjectList,
      'Query': ALSymbolKind.QueryObjectList,
      'Codeunit': ALSymbolKind.CodeunitObjectList,
      'ControlAddIn': ALSymbolKind.ControlAddInObjectList,
      'PageExtension': ALSymbolKind.PageExtensionObjectList,
      'TableExtension': ALSymbolKind.TableExtensionObjectList,
      'Profile': ALSymbolKind.ProfileObjectList,
      'PageCustomization': ALSymbolKind.PageCustomizationObjectList,
      'Enum': ALSymbolKind.EnumObjectList,
      'EnumType': ALSymbolKind.EnumTypeList,
      'EnumExtension': ALSymbolKind.EnumExtensionTypeList,
      'Interface': ALSymbolKind.InterfaceObjectList,
      'ReportExtension': ALSymbolKind.ReportExtensionObjectList,
      'PermissionSet': ALSymbolKind.PermissionSetList,
      'PermissionSetExtension': ALSymbolKind.PermissionSetExtensionList,
      'Entitlement': ALSymbolKind.EntitlementList,
      'DotNetPackage': ALSymbolKind.DotNetPackageList,
    };
    return map[type] || ALSymbolKind.SymbolGroup;
  }

  function iconForKind(kind){
    const map = {
      [ALSymbolKind.TableObject]: 'table',
      [ALSymbolKind.CodeunitObject]: 'codeunit',
      [ALSymbolKind.PageObject]: 'page',
      [ALSymbolKind.ReportObject]: 'report',
      [ALSymbolKind.QueryObject]: 'query',
      [ALSymbolKind.XmlPortObject]: 'xmlport',
      [ALSymbolKind.TableExtensionObject]: 'tableextension',
      [ALSymbolKind.PageExtensionObject]: 'pageextension',
      [ALSymbolKind.ControlAddInObject]: 'controladdin',
      [ALSymbolKind.ProfileObject]: 'profile',
      [ALSymbolKind.PageCustomizationObject]: 'pagecustomization',
      [ALSymbolKind.EnumType]: 'enum',
      [ALSymbolKind.EnumExtensionType]: 'enumext',
      [ALSymbolKind.DotNetPackage]: 'dotnetlib',
      [ALSymbolKind.Interface]: 'interface',
      [ALSymbolKind.ReportExtensionObject]: 'report',
      [ALSymbolKind.PermissionSet]: 'profile',
      [ALSymbolKind.PermissionSetExtension]: 'profile',
      [ALSymbolKind.Entitlement]: 'profile',
      [ALSymbolKind.Field]: 'field',
      [ALSymbolKind.PageField]: 'field',
      [ALSymbolKind.PageGroup]: 'group',
      [ALSymbolKind.PageAction]: 'action',
      [ALSymbolKind.EnumValue]: 'enumval',
      [ALSymbolKind.SymbolGroup]: 'module',
      [ALSymbolKind.Document]: 'module',
      [ALSymbolKind.Package]: 'module'
    };
    return map[kind] || 'undefined';
  }

  function setIdxAndIcons(node){
    if (!node) return;
    node.icon = iconForKind(node.kind);
    if (Array.isArray(node.childSymbols)){
      for (let i=0; i<node.childSymbols.length; i++){
        node.childSymbols[i].idx = i;
        setIdxAndIcons(node.childSymbols[i]);
      }
    }
  }

  /**
   * Build the left-side tree (objects grouped by type).
   * @param {Array<{type:string, items:any[]}>} groups
   * @param {string} packageName
   */
  function buildLeftTree(groups, packageName){
    const root = { fullName: 'Objects', name: 'Objects', kind: ALSymbolKind.Document, childSymbols: [], collapsed: false };
    let totalCount = 0;
    for (const g of groups){
      const listKind = listKindForType(g.type);
      const typeNode = { fullName: g.type, name: g.type, kind: listKind, childSymbols: [], collapsed: true };
      typeNode.subCount = Array.isArray(g.items) ? g.items.length : 0;
      totalCount += typeNode.subCount;
      for (const o of g.items){
        const objKind = kindForType(o.type);
        const displayName = (o.name && String(o.name).trim()) || (o.id != null ? `Object ${o.id}` : 'Unnamed');
        const objNode = { id: o.id, fullName: displayName, name: displayName, kind: objKind, childSymbols: [], collapsed: true };
        const fieldsCount = Array.isArray(o.fields) ? o.fields.length : 0;
        const controlsCount = Array.isArray(o.controls) ? o.controls.length : 0;
        const actionsCount = Array.isArray(o.actions) ? o.actions.length : 0;
        const keysCount = Array.isArray(o.keys) ? o.keys.length : 0;
        const valuesCount = Array.isArray(o.values) ? o.values.length : 0;
        objNode.subCount = fieldsCount + keysCount + controlsCount + actionsCount + valuesCount;
        typeNode.childSymbols.push(objNode);
      }
      root.childSymbols.push(typeNode);
    }
    root.subCount = totalCount;
    root.showIds = true;
    setIdxAndIcons(root);
    return root;
  }

  /**
   * Build the right-side tree (details for a selected object).
   * @param {any} obj Normalized object
   */
  function buildRightTree(obj){
    const objKind = kindForType(obj.type);
    const root = { id: obj.id, fullName: obj.name || '', name: obj.name || '', kind: objKind, childSymbols: [] };

    if (obj.fields && obj.fields.length){
      const grp = { fullName: 'Fields', name: 'Fields', kind: ALSymbolKind.FieldList, childSymbols: [] };
      for (const f of obj.fields){
        grp.childSymbols.push({ id: f.id, fullName: f.name || '', name: f.name || '', kind: ALSymbolKind.Field, childSymbols: [] });
      }
      root.childSymbols.push(grp);
    }

    // Table keys
    if (obj.keys && obj.keys.length){
      const grp = { fullName: 'Keys', name: 'Keys', kind: ALSymbolKind.KeyList, childSymbols: [] };
      for (const k of obj.keys){
        grp.childSymbols.push({ id: k.id, fullName: k.name || '', name: k.name || '', kind: ALSymbolKind.Key, childSymbols: [] });
      }
      root.childSymbols.push(grp);
    }

    if (obj.controls && obj.controls.length){
      const grp = { fullName: 'Controls', name: 'Controls', kind: ALSymbolKind.PageLayout, childSymbols: [] };
      for (const c of obj.controls){
        let kind = ALSymbolKind.PageField;
        const s = String(c.subtype || '');
        if (/action/i.test(s)) kind = ALSymbolKind.PageAction;
        else if (/group|area|repeater/i.test(s)) kind = ALSymbolKind.PageGroup;
        grp.childSymbols.push({ id: c.id, fullName: c.name || '', name: c.name || '', kind, childSymbols: [] });
      }
      root.childSymbols.push(grp);
    }

    // Page actions (separate list)
    if (obj.actions && obj.actions.length){
      const grp = { fullName: 'Actions', name: 'Actions', kind: ALSymbolKind.PageActionList, childSymbols: [] };
      for (const a of obj.actions){
        grp.childSymbols.push({ id: a.id, fullName: a.name || '', name: a.name || '', kind: ALSymbolKind.PageAction, childSymbols: [] });
      }
      root.childSymbols.push(grp);
    }

    if (obj.values && obj.values.length){
      const grp = { fullName: 'Values', name: 'Values', kind: ALSymbolKind.EnumType, childSymbols: [] };
      for (const v of obj.values){
        grp.childSymbols.push({ id: v.id, fullName: v.name || '', name: v.name || '', kind: ALSymbolKind.EnumValue, childSymbols: [] });
      }
      root.childSymbols.push(grp);
    }

    setIdxAndIcons(root);
    root.showIds = true;
    return root;
  }

  // Build properties list (key/val) for a symbol
  /**
   * Build properties key/value list for the properties panel.
   * @param {any} sym Raw symbol JSON
   * @param {string} type Object type
   */
  function collectPropertiesFor(sym, type){
    const props = [];
    pushKV(props, 'Id', sym.Id || sym.id || sym.ObjectId || sym.objectId);
    pushKV(props, 'Name', sym.Name || sym.name || sym.ObjectName || sym.objectName);
    pushKV(props, 'Type', type);
    pushKV(props, 'Caption', sym.Caption || sym.caption);
    pushKV(props, 'Source File', sym.ReferenceSourceFileName || sym.SourceFile || sym.Source);
    pushKV(props, 'Namespace', sym.Namespace || sym.NamespaceName);
    pushKV(props, 'Application Area', sym.ApplicationArea);

    switch (String(type)){
      case 'Table':
        pushKV(props, 'Data Classification', sym.DataClassification);
        pushKV(props, 'DrillDown Page Id', sym.DrillDownPageId);
        pushKV(props, 'Lookup Page Id', sym.LookupPageId);
        break;
      case 'Page':
        pushKV(props, 'Page Type', sym.PageType);
        pushKV(props, 'Source Table', sym.SourceTable || sym.SourceTableName);
        pushKV(props, 'UsageCategory', sym.UsageCategory);
        break;
      case 'Report':
        pushKV(props, 'DefaultLayout', sym.DefaultLayout);
        break;
      case 'Query':
        // No common extras
        break;
      case 'Codeunit':
        pushKV(props, 'Subtype', sym.Subtype);
        pushKV(props, 'SingleInstance', sym.SingleInstance);
        break;
      case 'Enum':
      case 'EnumType':
        pushKV(props, 'Extensible', sym.Extensible);
        break;
      case 'XmlPort':
        pushKV(props, 'Direction', sym.Direction);
        break;
      case 'Interface':
        // No extras
        break;
      case 'PermissionSet':
        pushKV(props, 'Assignable', sym.Assignable);
        break;
      case 'PageExtension':
        pushKV(props, 'Target Page', sym.TargetPage || sym.Target || sym.TargetObject);
        break;
      case 'ReportExtension':
        pushKV(props, 'Target Report', sym.TargetReport || sym.Target || sym.TargetObject);
        break;
      case 'PermissionSetExtension':
        pushKV(props, 'Target', sym.Target || sym.TargetObject);
        break;
      case 'TableExtension':
        pushKV(props, 'Target Table', sym.TargetTable || sym.Target || sym.TargetObject);
        break;
      default:
        break;
    }
    return props.filter(p => p.val !== undefined && p.val !== null && p.val !== '');
  }

  function pushKV(list, key, val){ list.push({ key, val }); }

  /**
   * Parse a symbol package or JSON into normalized objects
   * and return raw + objects.
   * @param {ArrayBuffer|string} file
   * @returns {Promise<{raw:any, objects:any[]}>}
   */
  async function parseAppFile(file){
    const { json: raw, zip } = await readSymbolsJson(file);
    console.log(raw);
    let objects = [];
    // Prefer 'Symbols' arrays if present
    const arrays = [];
    collectSymbolsArrays(raw, arrays);
    if (arrays.length){
      for (const arr of arrays) for (const s of arr) objects.push(normalizeSymbol(s));
    } else {
      // Fallback to known BC sections (Tables, Pages, etc.)
      const flat = extractObjectsFromKnownSections(raw);
      objects = flat.map(normalizeSymbol);
    }

    // Attempt to attach source code from the .app package if ShowMyCode is enabled
    if (zip && typeof zip === 'object') {
      try {
        const sourceMap = await buildSourceMapFromZip(zip);
        if (sourceMap && sourceMap.size) {
          for (const o of objects) {
            if (!o.sourceText) {
              const key = basename((o.refSrc || '').toString()).toLowerCase();
              let src = key ? sourceMap.get(key) : undefined;
              if (!src && o.name) {
                // Fallback: try name-based matching (e.g., MyTable.al)
                const nameKey = (o.name.replace(/"/g, '') + '.al').toLowerCase();
                src = sourceMap.get(nameKey);
              }
              if (src) o.sourceText = src;
            }
          }
        }
      } catch (e) {
        // Silent failure: Source may not be available
      }
    }
    // Merge TableExtensions into base Tables for unified schema
    objects = mergeTableExtensions(objects);
    return { raw, objects };
  }

  export { parseAppFile, groupByType, buildLeftTree, buildRightTree };

  /** Build a map of basename(.al) -> source content from the app zip */
  async function buildSourceMapFromZip(zip){
    const map = new Map();
    const entries = Object.values(zip.files || {});
    // Read all .al files; store by lowercase basename
    const readers = entries.filter(e => /\.al$/i.test(e.name)).map(async (e) => {
      const content = await e.async('string');
      map.set(basename(e.name).toLowerCase(), stripBOM(String(content)));
    });
    await Promise.all(readers);
    return map;
  }

  function basename(path){
    const s = String(path || '');
    const parts = s.split(/[\\\/]/);
    return parts[parts.length - 1] || s;
  }

  /**
   * Merge TableExtension content into base Tables (fields, keys, relations).
   * Keeps TableExtension entries intact while updating Tables.
   */
  function mergeTableExtensions(objects){
    const tables = objects.filter(o => String(o.type) === 'Table');
    const exts = objects.filter(o => String(o.type) === 'TableExtension');
    const byName = new Map();
    const byId = new Map();
    for (const t of tables){
      const nm = String(t.name || '').replace(/"/g, '').toLowerCase();
      byName.set(nm, t);
      if (t.id != null) byId.set(Number(t.id), t);
    }
    for (const e of exts){
      let target = e.extendsTarget;
      if (!target){
        const prop = (e.properties || []).find(p => String(p.key || '').toLowerCase().includes('target'));
        target = prop?.val;
      }
      let base = undefined;
      if (typeof target === 'number'){
        base = byId.get(Number(target));
      } else if (typeof target === 'string'){
        const key = target.replace(/"/g, '').toLowerCase();
        base = byName.get(key) || (Number(target) ? byId.get(Number(target)) : undefined);
      }
      if (!base) continue;
      base.fields = [...(base.fields || []), ...(e.fields || [])];
      base.keys = [...(base.keys || []), ...(e.keys || [])];
      base.relations = [...(base.relations || []), ...(e.relations || [])];
    }
    return objects;
  }