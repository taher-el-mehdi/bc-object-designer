(function(){
  const API = location.origin; // same origin as server

  const objTree = new SymbolsTreeControl('objects', 'objidsbtn', true);
  const symTree = new SymbolsTreeControl('symbols', 'symidsbtn', false);
  symTree.enableSimpleFilter('selobjfilter', 'selobjfilterbtn');
  objTree.enableSimpleFilter('filter', 'filterbtn');

  objTree.emptyContent = 'There is nothing to show.';
  objTree.nodeSelected = (node) => {
    const symbol = node && node.alsymbolnode;
    if (!symbol) return;
    if (isObjectKind(symbol.kind)) {
      selectObject(symbol);
    }
  };

  document.getElementById('uploadBtn').addEventListener('click', uploadSymbols);

  Split(['#olpanel', '#odpanel'], {
    minSize: 0,
    gutter: function (index, direction) {
      var gutter = document.createElement('div')
      gutter.className = 'gutter gutter-' + direction
      return gutter
    },
    gutterSize: 6
  });

  // Helpers
  function setStatus(text, cls) {
    const el = document.getElementById('status');
    el.textContent = text;
    if (cls) el.className = 'status ' + cls;
  }

  function fmt(x){ return x == null ? '' : String(x); }

  function isObjectKind(kind){
    return [
      ALSymbolKind.TableObject,
      ALSymbolKind.PageObject,
      ALSymbolKind.ReportObject,
      ALSymbolKind.XmlPortObject,
      ALSymbolKind.QueryObject,
      ALSymbolKind.CodeunitObject,
      ALSymbolKind.ControlAddInObject,
      ALSymbolKind.PageExtensionObject,
      ALSymbolKind.TableExtensionObject,
      ALSymbolKind.ProfileObject,
      ALSymbolKind.PageCustomizationObject,
      ALSymbolKind.EnumType,
      ALSymbolKind.EnumExtensionType,
      ALSymbolKind.DotNetPackage,
      ALSymbolKind.Interface,
      ALSymbolKind.ReportExtensionObject,
      ALSymbolKind.PermissionSet,
      ALSymbolKind.PermissionSetExtension,
      ALSymbolKind.Entitlement
    ].includes(kind);
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
      [ALSymbolKind.SymbolGroup]: 'module'
    };
    return map[kind] || 'undefined';
  }

  function buildRootTree(groups){
    const root = {
      fullName: 'Objects',
      name: 'Objects',
      kind: ALSymbolKind.SymbolGroup,
      icon: iconForKind(ALSymbolKind.SymbolGroup),
      childSymbols: []
    };
    for (const group of groups) {
      const listKind = listKindForType(group.type);
      const typeNode = {
        fullName: group.type,
        name: group.type,
        kind: listKind,
        icon: iconForKind(listKind),
        childSymbols: []
      };
      for (const item of group.items) {
        const objKind = kindForType(group.type);
        const objNode = {
          id: item.id,
          fullName: fmt(item.name),
          name: fmt(item.name),
          kind: objKind,
          icon: iconForKind(objKind),
          childSymbols: [],
        };
        typeNode.childSymbols.push(objNode);
      }
      root.childSymbols.push(typeNode);
    }
    root.showIds = true;
    return root;
  }

  function buildSelectedObjectTree(obj){
    const root = {
      fullName: fmt(obj.name),
      name: fmt(obj.name),
      id: obj.id,
      kind: kindForType(obj.type),
      icon: iconForKind(kindForType(obj.type)),
      childSymbols: []
    };

    // Fields group
    if (obj.fields && obj.fields.length){
      const grp = { fullName: 'Fields', name: 'Fields', kind: ALSymbolKind.FieldList, icon: 'codeunit', childSymbols: [] };
      for (const f of obj.fields){
        grp.childSymbols.push({ id: f.id, fullName: fmt(f.name), name: fmt(f.name), kind: ALSymbolKind.Field, icon: iconForKind(ALSymbolKind.Field) });
      }
      root.childSymbols.push(grp);
    }

    // Controls group (simplified mapping)
    if (obj.controls && obj.controls.length){
      const grp = { fullName: 'Controls', name: 'Controls', kind: ALSymbolKind.PageLayout, icon: 'pagelayout', childSymbols: [] };
      for (const c of obj.controls){
        const kind = (/action/i.test(c.subtype)) ? ALSymbolKind.PageAction : (/group|area|repeater/i.test(c.subtype)) ? ALSymbolKind.PageGroup : ALSymbolKind.PageField;
        grp.childSymbols.push({ id: c.id, fullName: fmt(c.name), name: fmt(c.name), kind, icon: iconForKind(kind) });
      }
      root.childSymbols.push(grp);
    }

    // Enum values
    if (obj.values && obj.values.length){
      const grp = { fullName: 'Values', name: 'Values', kind: ALSymbolKind.EnumType, icon: 'enum', childSymbols: [] };
      for (const v of obj.values){
        grp.childSymbols.push({ id: v.id, fullName: fmt(v.name), name: fmt(v.name), kind: ALSymbolKind.EnumValue, icon: iconForKind(ALSymbolKind.EnumValue) });
      }
      root.childSymbols.push(grp);
    }

    // Relationships
    if (obj.relations && obj.relations.length){
      const grp = { fullName: 'Relationships', name: 'Relationships', kind: ALSymbolKind.SymbolGroup, icon: 'module', childSymbols: [] };
      for (const r of obj.relations){
        grp.childSymbols.push({ fullName: `${fmt(r.field)} → ${fmt(r.relation)}`, name: `${fmt(r.field)} → ${fmt(r.relation)}`, kind: ALSymbolKind.Parameter, icon: 'parameter' });
      }
      root.childSymbols.push(grp);
    }

    root.showIds = true;
    return root;
  }

  async function uploadSymbols(){
    const file = document.getElementById('fileInput').files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setStatus('Uploading…');
    try {
      const res = await fetch(API + '/upload', { method: 'POST', body: form });
      const data = await res.json();
      setStatus(data.message || 'Loaded');
      await loadObjects();
    } catch(err){
      setStatus('Upload failed');
    }
  }

  async function loadObjects(){
    setStatus('Loading…');
    const res = await fetch(API + '/objects');
    const groups = await res.json();
    const data = buildRootTree(groups);
    objTree.setData(data);
    symTree.setData(undefined);
    setStatus('Ready');
  }

  async function selectObject(symbol){
    // symbol is the object node in the left tree
    // fetch details and build right tree
    const type = symbol && symbol.kind ? typeNameFromKind(symbol.kind) : undefined;
    if (!type) return;
    const res = await fetch(`${API}/objects/${encodeURIComponent(type)}/${symbol.id}`);
    const obj = await res.json();
    const data = buildSelectedObjectTree(obj);
    symTree.setData(data);
  }

  function typeNameFromKind(kind){
    const map = {
      [ALSymbolKind.TableObject]: 'Table',
      [ALSymbolKind.PageObject]: 'Page',
      [ALSymbolKind.ReportObject]: 'Report',
      [ALSymbolKind.XmlPortObject]: 'XmlPort',
      [ALSymbolKind.QueryObject]: 'Query',
      [ALSymbolKind.CodeunitObject]: 'Codeunit',
      [ALSymbolKind.ControlAddInObject]: 'ControlAddIn',
      [ALSymbolKind.PageExtensionObject]: 'PageExtension',
      [ALSymbolKind.TableExtensionObject]: 'TableExtension',
      [ALSymbolKind.ProfileObject]: 'Profile',
      [ALSymbolKind.PageCustomizationObject]: 'PageCustomization',
      [ALSymbolKind.EnumType]: 'Enum',
      [ALSymbolKind.EnumExtensionType]: 'EnumExtension',
      [ALSymbolKind.DotNetPackage]: 'DotNetPackage',
      [ALSymbolKind.Interface]: 'Interface',
      [ALSymbolKind.ReportExtensionObject]: 'ReportExtension',
      [ALSymbolKind.PermissionSet]: 'PermissionSet',
      [ALSymbolKind.PermissionSetExtension]: 'PermissionSetExtension',
      [ALSymbolKind.Entitlement]: 'Entitlement'
    };
    return map[kind];
  }

  // Initialize
  setStatus('Ready');
  loadObjects();
})();
