import { parseAppFile, groupByType } from './parser.js';
import { loadReportLayout, renderLayoutPreview } from './layoutViewer.js';
import { renderRDLPreview } from './previewRDL.js';
import { showERDiagramAll } from './er-diagram.js';
import { APP_VERSION } from './version.js';
import { saveLastState, loadLastState, clearLastState, storageSupported } from './storage.js';
import { generatePseudoAL } from './alsyntax.js';

// Entry point for the client-side AL Explorer
document.addEventListener('DOMContentLoaded', () => {
  const typesSidebarEl = document.getElementById('typesSidebar');
  const selectedTypeNameEl = document.getElementById('selectedTypeName');
  const objectTableEl = document.getElementById('objectTable');
  const emptyListMsgEl = document.getElementById('emptyListMsg');
  const codePanelEl = document.getElementById('codePanel');
  const codeTitleEl = document.getElementById('codeTitle');
  const codeContentEl = document.getElementById('codeContent');
  const noSourceMsgEl = document.getElementById('noSourceMsg');
  const listCodeResizerEl = document.getElementById('listCodeResizer');
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const viewERAllBtn = document.getElementById('viewERAllBtn');
  const closeCodeBtn = document.getElementById('closeCodeBtn');
  const landingOverlayEl = document.getElementById('landingOverlay');
  const overlayUploadBtn = document.getElementById('overlayUploadBtn');
  const globalSearchEl = document.getElementById('globalSearch');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const listWrapEl = document.querySelector('.listwrap');
  const settingsBtn = document.getElementById('settingsBtn');
  const appSettingsModalEl = document.getElementById('appSettingsModal');
    const erDiagramModalEl = document.getElementById('erDiagramModal');
    const erDiagramCloseBtn = document.getElementById('erDiagramCloseBtn');
    const erDiagramFsBtn = document.getElementById('erDiagramFsBtn');
    const erDiagramContainerEl = document.getElementById('erDiagramContainer');
    const erLoadingMsgEl = document.getElementById('erLoadingMsg');
    const erDiagramTitleEl = document.getElementById('erDiagramTitle');
    const erExportPngBtn = document.getElementById('erExportPngBtn');
    const erModalContentEl = erDiagramModalEl?.querySelector('.modal-content');
    const erModalFooterEl = erDiagramModalEl?.querySelector('.modal-footer');
    const erModalBodyEl = erDiagramModalEl?.querySelector('.modal-body');
    // Layout modal
    const layoutModalEl = document.getElementById('layoutModal');
    const layoutCloseBtn = document.getElementById('layoutCloseBtn');
    const layoutToggleBtn = document.getElementById('layoutToggleBtn');
    const layoutFsBtn = document.getElementById('layoutFsBtn');
    const layoutModalTitleEl = document.getElementById('layoutModalTitle');
    const layoutContainerEl = document.getElementById('layoutContainer');
    const layoutLoadingMsgEl = document.getElementById('layoutLoadingMsg');
    const viewLayoutBtn = document.getElementById('viewLayoutBtn');
    const layoutModalContentEl = layoutModalEl?.querySelector('.modal-content');
    const layoutModalBodyEl = layoutModalEl?.querySelector('.modal-body');
  const appSettingsCloseBtn = document.getElementById('appSettingsCloseBtn');
  const copyAppInfoModalBtn = document.getElementById('copyAppInfoModalBtn');
  const appNameValEl = document.getElementById('appNameVal');
  const appPublisherValEl = document.getElementById('appPublisherVal');
  const appVersionValEl = document.getElementById('appVersionVal');
  const appRuntimeValEl = document.getElementById('appRuntimeVal');
  const appIdValEl = document.getElementById('appIdVal');
  const appFilenameValEl = document.getElementById('appFilenameVal');
  const appSymbolCountValEl = document.getElementById('appSymbolCountVal');

  function setStatus(text){ document.getElementById('status').textContent = text; }

  // Show application version in the top bar
  const versionEl = document.getElementById('toolVersion');
  if (versionEl) { versionEl.textContent = `bc-object-designer v: ${APP_VERSION}`; }

  let state = { objects: [], groups: [], filename: '', selectedType: '', appInfo: null, currentSourceText: '', searchQuery: '', searchActive: false, currentObject: null, currentLayout: null, layoutViewMode: 'visual' };

  // Attempt to extract RuntimeVersion from raw metadata
  function extractRuntimeVersion(obj){
    try {
      const seen = new Set();
      function walk(o){
        if (!o || typeof o !== 'object') return undefined;
        if (seen.has(o)) return undefined; seen.add(o);
        for (const [k,v] of Object.entries(o)){
          const kl = String(k).toLowerCase();
          if (kl.includes('runtimeversion') || kl === 'runtime'){
            if (typeof v === 'string') return v;
            if (typeof v === 'number') return String(v);
            if (v && typeof v === 'object'){
              const maj = v.Major ?? v.major; const min = v.Minor ?? v.minor; const b = v.Build ?? v.build;
              if (maj != null && min != null) return [maj, min, b].filter(x => x!=null).join('.');
            }
          }
          const nested = (typeof v === 'object') ? walk(v) : undefined;
          if (nested) return nested;
        }
        return undefined;
      }
      return walk(obj) || '';
    } catch { return ''; }
  }

  function updateAppInfo(raw){
    const name = raw && (raw.Name || raw.name) || '';
    const version = raw && (raw.Version || raw.version) || '';
    const publisher = raw && (raw.Publisher || raw.publisher) || '';
    const appId = raw && (raw.AppId || raw.appId || raw.AppID) || '';
    const runtimeVersion = extractRuntimeVersion(raw);
    const hasAny = !!(name || version || publisher || appId);

    // Update centered uploaded app name
    const uploadedNameEl = document.getElementById('uploadedAppName');
    if (uploadedNameEl) uploadedNameEl.textContent = name || '';

    // Store app info and toggle copy button visibility
    state.appInfo = hasAny ? { AppId: appId || undefined, Name: name || undefined, Publisher: publisher || undefined, Version: version || undefined, RuntimeVersion: runtimeVersion || undefined } : null;
    if (settingsBtn) settingsBtn.classList.toggle('hidden', !hasAny);
  }

  // Sidebar rendering: list all available types
  function renderTypeSidebar(groups){
    if (!typesSidebarEl) return;
    typesSidebarEl.innerHTML = '';
    if (!Array.isArray(groups) || groups.length === 0){
      typesSidebarEl.textContent = 'Load a .app package to begin…';
      return;
    }
    const TYPE_ICON_MAP = {
      'Table': 'table',
      'Page': 'page',
      'Report': 'report',
      'XmlPort': 'xmlport',
      'Query': 'query',
      'Codeunit': 'codeunit',
      'ControlAddIn': 'controladdin',
      'Enum': 'enum',
      'EnumType': 'enum',
      'EnumExtension': 'enumext',
      'Interface': 'interface',
      'ReportExtension': 'reportext',
      'PageExtension': 'pageext',
      'TableExtension': 'tableext',
      'PermissionSet': 'permissionset',
      'PermissionSetExtension': 'permissionsetext',
      'Profile': 'profile',
      'PageCustomization': 'pagecustom',
      'Entitlement': 'entitlement',
      'DotNetPackage': 'dotnet'
    };
    const frag = document.createDocumentFragment();
    for (const g of groups){
      const item = document.createElement('div');
      item.className = 'type-item';
      item.dataset.type = g.type;
      const iconName = TYPE_ICON_MAP[g.type] || 'default';
      const iconEl = document.createElement('span');
      iconEl.className = 'type-icon type-' + iconName;
      item.appendChild(iconEl);
      const nameEl = document.createElement('span');
      nameEl.className = 'name';
      nameEl.textContent = `${g.type} (${g.items?.length ?? 0})`;
      item.appendChild(nameEl);
      item.addEventListener('click', () => {
        selectType(g.type);
      });
      frag.appendChild(item);
    }
    typesSidebarEl.appendChild(frag);
    // Highlight selected type
    highlightSelectedType(state.selectedType);
  }

  function highlightSelectedType(type){
    if (!typesSidebarEl) return;
    const items = typesSidebarEl.querySelectorAll('.type-item');
    items.forEach(el => {
      el.classList.toggle('selected', el.dataset.type === type);
    });
  }

  // Table header management
  function setTableHeaders(mode){
    const thead = objectTableEl?.querySelector('thead');
    if (!thead) return;
    const tr = thead.querySelector('tr');
    if (!tr) return;
    tr.innerHTML = '';
    if (mode === 'search'){
      const thType = document.createElement('th'); thType.textContent = 'Type'; thType.className = 'col-type';
      const thId = document.createElement('th'); thId.textContent = 'ID'; thId.className = 'col-id';
      const thName = document.createElement('th'); thName.textContent = 'Name'; thName.className = 'col-name';
      tr.appendChild(thType); tr.appendChild(thId); tr.appendChild(thName);
    } else {
      const thId = document.createElement('th'); thId.textContent = 'ID'; thId.className = 'col-id';
      const thName = document.createElement('th'); thName.textContent = 'Name'; thName.className = 'col-name';
      tr.appendChild(thId); tr.appendChild(thName);
    }
  }

  // Render global search results across all objects
  function renderSearchResults(query){
    const tbody = objectTableEl?.querySelector('tbody');
    if (!tbody) return;
    const q = (query || '').trim();
    state.searchQuery = q;
    state.searchActive = !!q.length;
    if (!state.searchActive){
      // Restore normal view
      setTableHeaders('normal');
      selectedTypeNameEl.textContent = state.selectedType || 'No type selected';
      renderObjectList(state.selectedType || '');
      return;
    }

    // Prepare headers and message
    setTableHeaders('search');
    selectedTypeNameEl.textContent = `Search results`;
    tbody.innerHTML = '';

    // Determine matching strategy (range, numeric substring, name/type)
    const rangeMatch = q.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
    const digitsOnly = /^\d+$/.test(q);
    const results = [];
    if (rangeMatch){
      const from = Number(rangeMatch[1]);
      const to = Number(rangeMatch[2]);
      const lo = Math.min(from, to), hi = Math.max(from, to);
      for (const o of (state.objects || [])){
        if (typeof o.id === 'number' && o.id >= lo && o.id <= hi) results.push(o);
      }
    } else if (digitsOnly) {
      // Numeric-only query: match any ID containing the digits
      for (const o of (state.objects || [])){
        const idStr = o.id != null ? String(o.id) : '';
        if (idStr.includes(q)) results.push(o);
      }
    } else {
      const ql = q.toLowerCase();
      for (const o of (state.objects || [])){
        const name = String(o.name || '').toLowerCase();
        const type = String(o.type || '').toLowerCase();
        if (name.includes(ql) || type.includes(ql)) results.push(o);
      }
    }

    if (!results.length){
      objectTableEl.classList.add('hidden');
      emptyListMsgEl.textContent = 'No matching objects for this search.';
      emptyListMsgEl.classList.remove('hidden');
      hideCodePanel();
      return;
    }

    objectTableEl.classList.remove('hidden');
    emptyListMsgEl.classList.add('hidden');
    const frag = document.createDocumentFragment();
    for (const o of results){
      const tr = document.createElement('tr');
      tr.tabIndex = 0;
      tr.dataset.type = String(o.type || '');
      tr.dataset.id = String(o.id ?? '');
      const tdType = document.createElement('td'); tdType.textContent = o.type || '';
      const tdId = document.createElement('td'); tdId.textContent = o.id != null ? String(o.id) : '';
      const tdName = document.createElement('td'); tdName.textContent = o.name || '';
      tr.appendChild(tdType); tr.appendChild(tdId); tr.appendChild(tdName);
      tr.addEventListener('click', () => openCodeForObject(o.type, o.id));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') openCodeForObject(o.type, o.id); });
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  // Debounce helper
  function debounce(fn, wait){
    let t; return function(...args){ clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
  }

  const onSearchInput = debounce(() => {
    const val = globalSearchEl?.value || '';
    renderSearchResults(val);
  }, 200);

  globalSearchEl?.addEventListener('input', onSearchInput);
  globalSearchEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      globalSearchEl.value = '';
      renderSearchResults('');
      e.preventDefault();
    }
    if (e.key === 'Enter') {
      renderSearchResults(globalSearchEl.value || '');
      e.preventDefault();
    }
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (!globalSearchEl) return;
    globalSearchEl.value = '';
    renderSearchResults('');
    globalSearchEl.focus();
  });

  // Shortcut: Ctrl+K focuses search; '/' quick focus
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k')){
      globalSearchEl?.focus();
      e.preventDefault();
    }
    if (!e.ctrlKey && !e.metaKey && e.key === '/'){
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag !== 'input' && tag !== 'textarea'){
        globalSearchEl?.focus();
        e.preventDefault();
      }
    }
  });

  // Render object list for a type
  function renderObjectList(type){
    const tbody = objectTableEl?.querySelector('tbody');
    if (!tbody || !Array.isArray(state.groups)) return;
    tbody.innerHTML = '';
    setTableHeaders('normal');
    const group = state.groups.find(g => g.type === type);
    selectedTypeNameEl.textContent = group ? group.type : 'No type selected';
    if (!group || !Array.isArray(group.items) || group.items.length === 0){
      objectTableEl.classList.add('hidden');
      emptyListMsgEl.classList.remove('hidden');
      hideCodePanel();
      return;
    }
    objectTableEl.classList.remove('hidden');
    emptyListMsgEl.classList.add('hidden');
    const frag = document.createDocumentFragment();
    for (const o of group.items){
      const tr = document.createElement('tr');
      tr.tabIndex = 0;
      tr.dataset.type = group.type;
      tr.dataset.id = String(o.id ?? '');
      const tdId = document.createElement('td'); tdId.textContent = o.id != null ? String(o.id) : '';
      const tdName = document.createElement('td'); tdName.textContent = o.name || '';
      tr.appendChild(tdId); tr.appendChild(tdName);

      // No layout button on list page as requested
      tr.addEventListener('click', () => openCodeForObject(group.type, o.id));
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') openCodeForObject(group.type, o.id);
      });
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  function selectType(type){
    if (state.searchActive){
      if (globalSearchEl) globalSearchEl.value = '';
      state.searchActive = false;
      setTableHeaders('normal');
    }
    state.selectedType = type;
    // Close any previously opened code view and clear prior selection
    hideCodePanel();
    highlightSelectedType(type);
    renderObjectList(type);
    // Ensure the list scrolls to top when switching types
    const listWrap = objectTableEl?.closest('.listwrap');
    if (listWrap) listWrap.scrollTop = 0;
    // Toggle global ER button only on Table type
    viewERAllBtn?.classList.toggle('hidden', String(type) !== 'Table');
  }

  // Find object by type and id
  function findObject(type, id){
    const group = state.groups.find(g => g.type === type);
    if (!group) return undefined;
    return group.items.find(x => x.id === id);
  }

  // Render current layout (visual RDLC or raw XML)
  function renderCurrentLayout(){
    if (!layoutContainerEl) return;
    const data = state.currentLayout;
    layoutContainerEl.innerHTML = '';
    if (!data) return;
    const { content, entryPath, kind } = data;
    const isRdl = kind === 'rdlc';
    const mode = state.layoutViewMode;
    if (isRdl && mode === 'visual'){
      const header = document.createElement('div');
      header.className = 'layout-header';
      header.textContent = entryPath;
      const host = document.createElement('div');
      layoutContainerEl.appendChild(header);
      layoutContainerEl.appendChild(host);
      renderRDLPreview(host, content);
    } 
    else {
      renderLayoutPreview(layoutContainerEl, data);
    }
    if (layoutToggleBtn){
      if (isRdl){
        layoutToggleBtn.classList.remove('hidden');
        layoutToggleBtn.textContent = (mode === 'visual') ? 'Show XML' : 'Show Visual';
      } else {
        layoutToggleBtn.classList.add('hidden');
      }
    }
  }

  // Open layout viewer modal for a report
  async function openReportLayout(reportObj){
    if (!layoutModalEl || !layoutContainerEl) return;
    layoutContainerEl.innerHTML = '';
    layoutLoadingMsgEl?.classList.remove('hidden');
    layoutModalEl.classList.remove('hidden');
    if (layoutModalTitleEl) layoutModalTitleEl.textContent = `Report Layout · ${reportObj.name || ''}`;
    try {
      if (!state.appArrayBuffer) {
        throw new Error('No app buffer available. Please re-upload the .app to view layouts.');
      }
      const { content, entryPath, kind } = await loadReportLayout(state.appArrayBuffer, reportObj.refSrc, reportObj.rdlcLayout, reportObj.wordLayout);
      state.currentLayout = { content, entryPath, kind };
      state.layoutViewMode = (kind === 'rdlc') ? 'visual' : 'xml';
      renderCurrentLayout();
    } catch (err) {
      const msg = document.createElement('div');
      msg.className = 'empty-msg';
      msg.textContent = 'Failed to load layout: ' + (err?.message || 'Unknown error');
      layoutContainerEl.appendChild(msg);
    } finally {
      layoutLoadingMsgEl?.classList.add('hidden');
    }
  }
  layoutCloseBtn?.addEventListener('click', () => { layoutModalEl?.classList.add('hidden'); });

  layoutToggleBtn?.addEventListener('click', () => {
    if (!state.currentLayout) return;
    if (state.currentLayout.kind !== 'rdlc') return;
    state.layoutViewMode = (state.layoutViewMode === 'visual') ? 'xml' : 'visual';
    renderCurrentLayout();
  });

  function highlightSelectedRow(type, id){
    const rows = objectTableEl?.querySelectorAll('tbody tr') || [];
    rows.forEach(r => {
      const match = r.dataset.type === type && r.dataset.id === String(id ?? '');
      r.classList.toggle('selected', match);
    });
  }

  // Open code viewer for selected object
  function openCodeForObject(type, id){
    const obj = findObject(type, id);
    highlightSelectedRow(type, id);
    if (!obj){
      codeTitleEl.textContent = 'Object not found';
      setCodeContent('');
      showNoSourceMsg();
      showCodePanel();
      return;
    }
    state.currentObject = obj;
    codeTitleEl.textContent = `${obj.type || type}${obj.id!=null?` #${obj.id}`:''}${obj.name?` · ${obj.name}`:''}`;
    if (obj.sourceText){
      hideNoSourceMsg();
      setCodeContent(String(obj.sourceText));
    } else {
      const pseudo = generatePseudoAL(obj);
      if (pseudo) {
        hideNoSourceMsg();
        setCodeContent(pseudo + '\n\n// Note: Full source requires ShowMyCode=true in the extension.');
      } else {
        setCodeContent('');
        showNoSourceMsg();
      }
    }
    showCodePanel();
    // Scroll to top for new selection
    codeContentEl.scrollTop = 0;

    // ER button is controlled at the list header when Table type is selected
    // Toggle View Layout button for Report objects only
    if (viewLayoutBtn){
      const isReport = String(obj.type || type) === 'Report';
      viewLayoutBtn.classList.toggle('hidden', !isReport);
      if (isReport){
        viewLayoutBtn.disabled = !(obj.rdlcLayout || obj.wordLayout);
        viewLayoutBtn.title = obj.rdlcLayout || obj.wordLayout || 'No layout referenced';
        viewLayoutBtn.onclick = async (e) => {
          console.log(obj);
          e?.stopPropagation?.();
          await openReportLayout(obj);
        };
      } else {
        viewLayoutBtn.onclick = null;
      }
    }
  }

  async function ensureHighlighter() {
    if (!window.__alHighlighterFactory) {
      // dynamic import in case of deferred loading
      const mod = await import('./highlightAL.js');
      window.__alHighlighterFactory = mod.createALHighlighter;
    }
    return window.__alHighlighterFactory();
  }

  function setCodeContent(text){
    if (!codeContentEl) return;
    const src = text || '';
    state.currentSourceText = src;
    // Render with line numbers: split into lines and create divs
    codeContentEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    const parts = src.split('\n');
    // Create a highlighter that keeps block-comment state across lines
    let highlightLine = null;
    const useHighlighting = true;
    const render = async () => {
      if (useHighlighting) {
        highlightLine = await ensureHighlighter();
      }
      for (let i = 0; i < parts.length; i++) {
        const lineEl = document.createElement('div');
        lineEl.className = 'code-line';
        if (useHighlighting && highlightLine) {
          lineEl.innerHTML = highlightLine(parts[i]);
        } else {
          lineEl.textContent = parts[i];
        }
        frag.appendChild(lineEl);
      }
      codeContentEl.appendChild(frag);
    };
    // kick off rendering; no need to await for UI responsiveness
    render();
  }

  function showCodePanel(){
    if (!codePanelEl) return;
    // Always open in fullscreen: hide list and resizer
    codePanelEl.classList.add('fullscreen');
    codePanelEl.classList.remove('hidden');
    if (listCodeResizerEl) listCodeResizerEl.classList.add('hidden');
    if (listWrapEl) listWrapEl.classList.add('hidden');
  }

  function hideCodePanel(){
    if (!codePanelEl) return;
    // Restore list view and hide code panel
    codePanelEl.classList.add('hidden');
    codePanelEl.classList.remove('fullscreen');
    if (listWrapEl) listWrapEl.classList.remove('hidden');
    if (listCodeResizerEl) listCodeResizerEl.classList.add('hidden');
  }

  // Application settings modal helpers
  function openSettingsModal(){
    if (!appSettingsModalEl) return;
    // Populate fields
    const info = state.appInfo || {};
    if (appNameValEl) appNameValEl.textContent = info.Name || '';
    if (appPublisherValEl) appPublisherValEl.textContent = info.Publisher || '';
    if (appVersionValEl) appVersionValEl.textContent = info.Version || '';
    if (appRuntimeValEl) appRuntimeValEl.textContent = info.RuntimeVersion || '';
    if (appIdValEl) appIdValEl.textContent = info.AppId || '';
    if (appFilenameValEl) appFilenameValEl.textContent = state.filename || '';
    if (appSymbolCountValEl) appSymbolCountValEl.textContent = String((state.objects || []).length || 0);
    appSettingsModalEl.classList.remove('hidden');
  }
  function closeSettingsModal(){ appSettingsModalEl?.classList.add('hidden'); }

  function showNoSourceMsg(){ noSourceMsgEl?.classList.remove('hidden'); }
  function hideNoSourceMsg(){ noSourceMsgEl?.classList.add('hidden'); }

  // Copy to clipboard
    copyCodeBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(state.currentSourceText || '');
        const prev = copyCodeBtn.textContent;
        copyCodeBtn.textContent = 'Copied!';
        copyCodeBtn.classList.add('copy-success');
        setTimeout(() => {
          copyCodeBtn.textContent = prev || 'Copy';
          copyCodeBtn.classList.remove('copy-success');
        }, 1500);
      } catch (err) {
        setStatus('Failed to copy source');
      }
    });

  // Close code panel
  closeCodeBtn?.addEventListener('click', () => {
    hideCodePanel();
    highlightSelectedRow('', '');
  });
  // ER Diagram (global): open modal and render across all tables
  viewERAllBtn?.addEventListener('click', async () => {
    if (state.selectedType !== 'Table') return;
    erLoadingMsgEl?.classList.remove('hidden');
    erDiagramContainerEl.innerHTML = '';
    if (erDiagramTitleEl) erDiagramTitleEl.textContent = 'ER Diagram · All Tables';
    erDiagramModalEl?.classList.remove('hidden');
    setTimeout(() => {
      try {
        showERDiagramAll(state.objects, erDiagramContainerEl);
      } finally {
        erLoadingMsgEl?.classList.add('hidden');
      }
    }, 30);
  });
  erDiagramCloseBtn?.addEventListener('click', async () => {
    if (isInFullscreen()) await exitDiagramFullscreen();
    erDiagramModalEl?.classList.add('hidden');
  });

  // Export ER diagram to PNG
  function exportErDiagramToPng(){
    try {
      const svg = erDiagramContainerEl?.querySelector('svg');
      if (!svg) return;
      const clone = svg.cloneNode(true);

      // Resolve CSS variables to absolute colors for portability
      const rootStyle = getComputedStyle(document.documentElement);
      const vars = ['--surface','--text','--muted','--primary','--accent','--border','--hover'];
      const colors = {};
      vars.forEach(v => { colors[v] = (rootStyle.getPropertyValue(v) || '').trim() || '#000000'; });
      const replaceVars = (val) => val && val.replace(/var\(--([a-zA-Z0-9-]+)\)/g, (_, n) => colors[`--${n}`] || '#000000');

      // Replace fill/stroke/background attributes/styles
      const all = clone.querySelectorAll('*');
      all.forEach(el => {
        ['fill','stroke'].forEach(attr => {
          const a = el.getAttribute(attr);
          if (a && a.includes('var(')) el.setAttribute(attr, replaceVars(a));
        });
        if (el.style) {
          const bg = el.style.background || '';
          if (bg && bg.includes('var(')) el.style.background = replaceVars(bg);
        }
      });
      // Ensure root background is a concrete color
      const bgColor = colors['--surface'] || '#ffffff';
      clone.style.background = bgColor;

      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(clone);
      const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);

      // Canvas size based on viewBox for crisp export
      const vb = (svg.getAttribute('viewBox') || '').split(/\s+/);
      let vw = Number(vb[2]) || (erDiagramContainerEl?.clientWidth || 800);
      let vh = Number(vb[3]) || (erDiagramContainerEl?.clientHeight || 600);
      const ratio = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vw * ratio);
      canvas.height = Math.ceil(vh * ratio);
      const ctx = canvas.getContext('2d');
      ctx.scale(ratio, ratio);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, vw, vh);

      const img = new Image();
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0, vw, vh);
          canvas.toBlob((blob) => {
            if (!blob) return;
            const a = document.createElement('a');
            let out = state.filename || 'diagram.app';
            if (/\.app$/i.test(out)) out = out.replace(/\.app$/i, '.png');
            else if (/\.zip$/i.test(out)) out = out.replace(/\.zip$/i, '.png');
            else out = out + '.png';
            a.download = out;
            const url = URL.createObjectURL(blob);
            a.href = url;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
          }, 'image/png');
        } catch {}
      };
      img.src = dataUrl;
    } catch {}
  }

  erExportPngBtn?.addEventListener('click', exportErDiagramToPng);

  // Fullscreen: toggle via button or F11
  function isInFullscreen(){ return !!document.fullscreenElement; }
  async function enterDiagramFullscreen(){
    try {
      if (erModalContentEl?.requestFullscreen) {
        await erModalContentEl.requestFullscreen();
        // Expand modal content to viewport while in fullscreen
        erModalContentEl.style.width = '100vw';
        erModalContentEl.style.height = '100vh';
        erModalContentEl.style.margin = '0';
        erModalContentEl.classList.add('fullscreen');
        // Let body+diagram fill the screen
        if (erModalBodyEl) {
          erModalBodyEl.style.flex = '1 1 auto';
          erModalBodyEl.style.display = 'flex';
          erModalBodyEl.style.flexDirection = 'column';
        }
        if (erDiagramContainerEl) {
          erDiagramContainerEl.style.flex = '1 1 auto';
          erDiagramContainerEl.style.height = '100%';
          // Update SVG viewBox to current size to ensure full export
          const svg = erDiagramContainerEl.querySelector('svg');
          if (svg) {
            const w = erDiagramContainerEl.clientWidth || 800;
            const h = erDiagramContainerEl.clientHeight || 600;
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
          }
        }
        if (erDiagramFsBtn) erDiagramFsBtn.textContent = 'Normal view';
        // Hide footer tips while in fullscreen
        if (erModalFooterEl) erModalFooterEl.classList.add('hidden');
      }
    } catch {}
  }
  async function exitDiagramFullscreen(){
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
    } catch {}
  }
  erDiagramFsBtn?.addEventListener('click', async () => {
    if (!isInFullscreen()) await enterDiagramFullscreen(); else await exitDiagramFullscreen();
  });
  // Keyboard F11 toggle while modal is open
  window.addEventListener('keydown', async (e) => {
    if (erDiagramModalEl?.classList.contains('hidden')) return;
    if (e.key === 'F11'){
      e.preventDefault();
      if (!isInFullscreen()) await enterDiagramFullscreen(); else await exitDiagramFullscreen();
    }
  });
  // Cleanup styles on fullscreen change, specific to the element in fullscreen
  document.addEventListener('fullscreenchange', () => {
    const fsEl = document.fullscreenElement;
    // ER modal handling
    if (fsEl === erModalContentEl) {
      if (erDiagramFsBtn) erDiagramFsBtn.textContent = 'Normal view';
      if (erModalFooterEl) erModalFooterEl.classList.add('hidden');
    } else {
      if (erModalContentEl){
        erModalContentEl.style.width = '';
        erModalContentEl.style.height = '';
        erModalContentEl.style.margin = '';
        erModalContentEl.classList.remove('fullscreen');
      }
      if (erModalBodyEl) {
        erModalBodyEl.style.flex = '';
        erModalBodyEl.style.display = '';
        erModalBodyEl.style.flexDirection = '';
      }
      if (erDiagramContainerEl) {
        erDiagramContainerEl.style.flex = '';
        erDiagramContainerEl.style.height = '';
      }
      if (erDiagramFsBtn) erDiagramFsBtn.textContent = 'Fullscreen';
      if (erModalFooterEl) erModalFooterEl.classList.remove('hidden');
    }

    // Layout modal handling
    if (fsEl === layoutModalContentEl) {
      if (layoutFsBtn) layoutFsBtn.textContent = 'Normal view';
    } else {
      if (layoutModalContentEl){
        layoutModalContentEl.style.width = '';
        layoutModalContentEl.style.height = '';
        layoutModalContentEl.style.margin = '';
        layoutModalContentEl.classList.remove('fullscreen');
      }
      if (layoutModalBodyEl) {
        layoutModalBodyEl.style.flex = '';
        layoutModalBodyEl.style.display = '';
        layoutModalBodyEl.style.flexDirection = '';
      }
      if (layoutContainerEl) {
        layoutContainerEl.style.flex = '';
        layoutContainerEl.style.height = '';
      }
      // Restore rdl viewport height when exiting fullscreen
      const rdlViewport = layoutContainerEl?.querySelector('.rdl-viewport');
      if (rdlViewport) rdlViewport.style.height = '';
      if (layoutFsBtn) layoutFsBtn.textContent = 'Fullscreen';
    }
  });

  // Layout fullscreen helpers
  async function enterLayoutFullscreen(){
    try {
      if (layoutModalContentEl?.requestFullscreen) {
        await layoutModalContentEl.requestFullscreen();
        layoutModalContentEl.style.width = '100vw';
        layoutModalContentEl.style.height = '100vh';
        layoutModalContentEl.style.margin = '0';
        layoutModalContentEl.classList.add('fullscreen');
        if (layoutModalBodyEl) {
          layoutModalBodyEl.style.flex = '1 1 auto';
          layoutModalBodyEl.style.display = 'flex';
          layoutModalBodyEl.style.flexDirection = 'column';
        }
        if (layoutContainerEl) {
          layoutContainerEl.style.flex = '1 1 auto';
          layoutContainerEl.style.height = '100%';
        }
        const rdlViewport = layoutContainerEl?.querySelector('.rdl-viewport');
        if (rdlViewport) rdlViewport.style.height = '100%';
        if (layoutFsBtn) layoutFsBtn.textContent = 'Normal view';
      }
    } catch {}
  }
  async function exitLayoutFullscreen(){
    try { if (document.exitFullscreen) await document.exitFullscreen(); } catch {}
  }
  layoutFsBtn?.addEventListener('click', async () => {
    if (!document.fullscreenElement) await enterLayoutFullscreen(); else await exitLayoutFullscreen();
  });
  // Keyboard F11 toggle while layout modal is open
  window.addEventListener('keydown', async (e) => {
    if (layoutModalEl?.classList.contains('hidden')) return;
    if (e.key === 'F11'){
      e.preventDefault();
      if (!document.fullscreenElement) await enterLayoutFullscreen(); else await exitLayoutFullscreen();
    }
  });

  // Resizer logic (vertical split between list and code)
  (function initResizer(){
    if (!listCodeResizerEl || !codePanelEl) return;
    let dragging = false; let startY = 0; let startHeight = 0;
    listCodeResizerEl.addEventListener('mousedown', (e) => {
      dragging = true; startY = e.clientY; startHeight = codePanelEl.offsetHeight;
      document.body.style.cursor = 'row-resize';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      const newH = Math.max(120, startHeight + dy);
      codePanelEl.style.flex = `0 0 ${newH}px`;
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false; document.body.style.cursor = '';
    });
  })();

  function findObjectBySymbol(symbol){
    // left tree objects nodes carry id + name; find in state.objects
    if (!symbol || symbol.id == null) return undefined;
    const name = (symbol.name || symbol.fullName || '').replace(/"/g, '');
    // match by id and name (case-insensitive), then by id only
    let found = state.objects.find(o => o.id === symbol.id && String(o.name||'').toLowerCase() === name.toLowerCase());
    if (!found) found = state.objects.find(o => o.id === symbol.id);
    return found;
  }

  async function processFile(file){
    if (!file) return;
    // Hide overlay once user starts uploading
    landingOverlayEl?.classList.add('hidden');

    const progressEl = document.getElementById('uploadProgress');
    const showProgress = () => { progressEl.classList.remove('hidden'); progressEl.value = 0; };
    const hideProgress = () => { progressEl.classList.add('hidden'); };
    const setProgress = (pct) => { progressEl.value = Math.max(0, Math.min(100, Math.round(pct))); };

    setStatus('Reading package…');
    showProgress();

    try {
      // Read file with progress
      const reader = new FileReader();
      const loadPromise = new Promise((resolve, reject) => {
        reader.onerror = () => reject(reader.error);
        reader.onabort = () => reject(new Error('File read aborted'));
        reader.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const pct = (evt.loaded / evt.total) * 100;
            setProgress(pct);
          }
        };
        reader.onload = () => resolve(reader.result);
      });
      reader.readAsArrayBuffer(file);
      const arrayBuf = await loadPromise;
      // Save raw buffer for layout extraction later
      state.appArrayBuffer = arrayBuf;

      setProgress(100);
      setStatus('Parsing symbols…');
      const { raw, objects } = await parseAppFile(arrayBuf);
      console.log(raw);
      updateAppInfo(raw);

      state.objects = Array.isArray(objects) ? objects : [];
      state.filename = file.name;
      if (!state.objects.length){
        renderTypeSidebar([]);
        renderObjectList('');
        hideCodePanel();
        hideProgress();
        setStatus('No symbols found in package');
        return;
      }
      state.groups = groupByType(state.objects);
      renderTypeSidebar(state.groups);
      const firstType = state.groups[0]?.type;
      if (firstType){ selectType(firstType); } else { selectType(''); }
      hideProgress();
      setStatus(`Loaded ${state.objects.length} symbols from ${state.filename}`);

      try { await saveLastState({ filename: state.filename, info: state.appInfo, objects: state.objects }); }
      catch (persistErr) { console.warn('Failed to persist state:', persistErr); }
    } catch (err){
      console.error(err);
      hideProgress();
      setStatus('Failed to parse symbols');
      if (settingsBtn) settingsBtn.classList.add('hidden');
      // If parsing failed, show overlay again for retry
      landingOverlayEl?.classList.remove('hidden');
    }
  }

  // Hook file input to shared handler
  document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    await processFile(file);
    if (globalSearchEl) { globalSearchEl.value = ''; }
    state.searchActive = false;
  });

  // Overlay interactions: click button to open file picker
  overlayUploadBtn?.addEventListener('click', () => {
    document.getElementById('fileInput')?.click();
  });
  // Drag & drop on overlay
  landingOverlayEl?.addEventListener('dragover', (e) => {
    e.preventDefault(); landingOverlayEl.classList.add('dragover');
  });
  landingOverlayEl?.addEventListener('dragleave', () => {
    landingOverlayEl.classList.remove('dragover');
  });
  landingOverlayEl?.addEventListener('drop', (e) => {
    e.preventDefault(); landingOverlayEl.classList.remove('dragover');
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      const f = files[0];
      // Accept .app or .zip
      const name = (f.name || '').toLowerCase();
      if (name.endsWith('.app') || name.endsWith('.zip')) {
        processFile(f);
      } else {
        setStatus('Please drop a .app (or .zip) file');
      }
    }
  });

  // Removed legacy left filter tied to tree control

  // Clear cache button
  const clearBtn = document.getElementById('clearCacheBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      setStatus('Clearing cache…');
      const progressEl = document.getElementById('uploadProgress');
      progressEl.classList.remove('hidden');
      progressEl.value = 0;
      try {
        await clearLastState();
        state = { objects: [], groups: [], filename: '', selectedType: '' };
        if (typesSidebarEl) typesSidebarEl.innerHTML = 'Load a .app package to begin…';
        renderObjectList('');
        // Toggle settings button
        if (settingsBtn) { settingsBtn.classList.add('hidden'); }
        const uploadedNameEl = document.getElementById('uploadedAppName');
        if (uploadedNameEl) uploadedNameEl.textContent = '';
        selectedTypeNameEl.textContent = 'No type selected';
        // Show landing overlay to prompt for upload again
        landingOverlayEl?.classList.remove('hidden');
        setStatus('Cache cleared');
      } catch (err) {
        console.error(err);
        setStatus('Failed to clear cache');
      } finally {
        progressEl.classList.add('hidden');
      }
    });
  }

  // Auto-restore from IndexedDB on load
  (async () => {
    if (!storageSupported) {
      setStatus('Ready');
      return;
    }
    const progressEl = document.getElementById('uploadProgress');
    progressEl.classList.remove('hidden');
    progressEl.value = 25;
    setStatus('Restoring previous session…');
    try {
      const rec = await loadLastState();
      progressEl.value = 60;
      if (rec && Array.isArray(rec.objects) && rec.objects.length) {
        state.objects = rec.objects;
        state.filename = rec.filename || '(cached)';
        updateAppInfo(rec.info);
        state.groups = groupByType(state.objects);
        renderTypeSidebar(state.groups);
        const firstType = state.groups[0]?.type;
        if (firstType){ selectType(firstType); } else { selectType(''); }
        progressEl.value = 100;
        setStatus(`Restored ${state.objects.length} symbols from cache${state.filename ? ` (${state.filename})` : ''}`);
        // Hide landing overlay when we have a restored session
        landingOverlayEl?.classList.add('hidden');
      } else {
        setStatus('Ready');
        // Show landing overlay on first visit / empty cache
        landingOverlayEl?.classList.remove('hidden');
      }
    } catch (err) {
      console.warn('Auto-restore failed:', err);
      setStatus('Ready');
    } finally {
      progressEl.classList.add('hidden');
    }
  })();

  // Settings button opens modal
  settingsBtn?.addEventListener('click', () => { openSettingsModal(); });
  // Close modal
  appSettingsCloseBtn?.addEventListener('click', () => { closeSettingsModal(); });
  // Copy app info JSON from modal
  copyAppInfoModalBtn?.addEventListener('click', async () => {
    try {
      const info = state.appInfo || {};
      const payload = {
        id: info.AppId || '',
        name: info.Name || '',
        publisher: info.Publisher || '',
        version: info.Version || ''
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      const prev = copyAppInfoModalBtn.textContent;
      copyAppInfoModalBtn.textContent = 'Copied!';
      copyAppInfoModalBtn.classList.add('copy-success');
      setTimeout(() => {
        copyAppInfoModalBtn.textContent = prev || 'Copy app info as JSON';
        copyAppInfoModalBtn.classList.remove('copy-success');
      }, 1500);
    } catch (err) {
      setStatus('Failed to copy app info');
    }
  });
});

// Render selected object's properties in the left panel table
// Properties panel removed in new layout; details view can be reintroduced later.
