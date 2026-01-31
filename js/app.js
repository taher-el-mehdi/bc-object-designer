import { parseAppFile, groupByType } from './parser.js';
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
  const closeCodeBtn = document.getElementById('closeCodeBtn');
  const landingOverlayEl = document.getElementById('landingOverlay');
  const overlayUploadBtn = document.getElementById('overlayUploadBtn');
  const globalSearchEl = document.getElementById('globalSearch');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  function setStatus(text){ document.getElementById('status').textContent = text; }

  // Show application version in the top bar
  const versionEl = document.getElementById('toolVersion');
  if (versionEl) { versionEl.textContent = `bc-object-designer v: ${APP_VERSION}`; }

  let state = { objects: [], groups: [], filename: '', selectedType: '', appInfo: null, currentSourceText: '', searchQuery: '', searchActive: false };

  function updateAppInfo(raw){
    const name = raw && (raw.Name || raw.name) || '';
    const version = raw && (raw.Version || raw.version) || '';
    const publisher = raw && (raw.Publisher || raw.publisher) || '';
    const appId = raw && (raw.AppId || raw.appId || raw.AppID) || '';
    const hasAny = !!(name || version || publisher || appId);

    // Update centered uploaded app name
    const uploadedNameEl = document.getElementById('uploadedAppName');
    if (uploadedNameEl) uploadedNameEl.textContent = name || '';

    // Store app info and toggle copy button visibility
    state.appInfo = hasAny ? { AppId: appId || undefined, Name: name || undefined, Publisher: publisher || undefined, Version: version || undefined } : null;
    const copyBtn = document.getElementById('copyAppInfoBtn');
    if (copyBtn) copyBtn.classList.toggle('hidden', !hasAny);
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
  }

  // Find object by type and id
  function findObject(type, id){
    const group = state.groups.find(g => g.type === type);
    if (!group) return undefined;
    return group.items.find(x => x.id === id);
  }

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
    if (!codePanelEl || !listCodeResizerEl) return;
    listCodeResizerEl.classList.remove('hidden');
    codePanelEl.classList.remove('hidden');
  }

  function hideCodePanel(){
    if (!codePanelEl || !listCodeResizerEl) return;
    listCodeResizerEl.classList.add('hidden');
    codePanelEl.classList.add('hidden');
  }

  function showNoSourceMsg(){ noSourceMsgEl?.classList.remove('hidden'); }
  function hideNoSourceMsg(){ noSourceMsgEl?.classList.add('hidden'); }

  // Copy to clipboard
  copyCodeBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.currentSourceText || '');
      setStatus('Source copied to clipboard');
    } catch (err) {
      setStatus('Failed to copy source');
    }
  });

  // Close code panel
  closeCodeBtn?.addEventListener('click', () => {
    hideCodePanel();
    highlightSelectedRow('', '');
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
      const copyBtn = document.getElementById('copyAppInfoBtn');
      if (copyBtn) copyBtn.classList.add('hidden');
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
        // badges removed; only toggle copy button
        const copyBtn = document.getElementById('copyAppInfoBtn');
        if (copyBtn) { copyBtn.classList.add('hidden'); copyBtn.classList.remove('copy-success'); copyBtn.textContent = 'Copy app info JSON'; }
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

  // Copy app info JSON to clipboard
  const copyAppInfoBtn = document.getElementById('copyAppInfoBtn');
  if (copyAppInfoBtn) {
    copyAppInfoBtn.addEventListener('click', async () => {
      try {
        const info = state.appInfo || {};
        const payload = {
          id: info.AppId || '',
          name: info.Name || '',
          publisher: info.Publisher || '',
          version: info.Version || ''
        };
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        const prev = copyAppInfoBtn.textContent;
        copyAppInfoBtn.textContent = 'Copied!';
        copyAppInfoBtn.classList.add('copy-success');
        setTimeout(() => {
          copyAppInfoBtn.textContent = prev || 'Copy app info JSON';
          copyAppInfoBtn.classList.remove('copy-success');
        }, 1500);
      } catch (err) {
        setStatus('Failed to copy app info');
      }
    });
  }
});

// Render selected object's properties in the left panel table
// Properties panel removed in new layout; details view can be reintroduced later.
