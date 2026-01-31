// Layout viewer utilities for RDLC/Word report layouts
// Pure JS, uses global JSZip (loaded in index.html)

function normalizePath(p){
  return String(p || '').replace(/\\/g, '/');
}
function joinPath(base, rel){
  const a = normalizePath(base);
  const b = normalizePath(rel);
  const baseDir = a.endsWith('/') ? a : a.substring(0, a.lastIndexOf('/') + 1);
  const raw = (b.startsWith('/') ? b.slice(1) : b).replace(/^\.\//, '');
  const parts = (baseDir + raw).split('/');
  const out = [];
  for (const part of parts){
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return out.join('/');
}
function prettyXml(xml){
  try {
    // Basic pretty print fallback
    const PADDING = '  ';
    const reg = /(>)(<)(\/*)/g;
    let formatted = '';
    let pad = 0;
    xml = xml.replace(reg, '$1\n$2$3');
    xml.split('\n').forEach((node) => {
      let indent = 0;
      if (node.match(/.+<\/.+>$/)) indent = 0;
      else if (node.match(/^<\/.+/)) { if (pad) pad -= 1; }
      else if (node.match(/^<[^!?].*>$/)) indent = 1;
      formatted += PADDING.repeat(pad) + node + '\n';
      pad += indent;
    });
    return formatted.trim();
  } catch {
    return xml;
  }
}

export async function loadReportLayout(appArrayBuffer, refSrc, rdlcPath, wordPath){
  if (!appArrayBuffer) throw new Error('No app buffer available');
  const jszip = new (window.JSZip || JSZip)();
  const zip = await jszip.loadAsync(appArrayBuffer);
  const entries = Object.values(zip.files || {});
  const base = normalizePath(refSrc || '');
  const tryPaths = [];
  if (rdlcPath) {
    const clean = String(rdlcPath).replace(/^["']|["'];?$/g, '').trim();
    tryPaths.push(joinPath(base, clean));
    tryPaths.push(normalizePath(clean).replace(/^\.\//, ''));
  }
  if (wordPath) {
    const cleanW = String(wordPath).replace(/^["']|["'];?$/g, '').trim();
    tryPaths.push(joinPath(base, cleanW));
    tryPaths.push(normalizePath(cleanW).replace(/^\.\//, ''));
  }

  // Try exact path first (case-sensitive), then case-insensitive, then suffix match
  let entry = null;
  for (const p of tryPaths){
    entry = entries.find(e => normalizePath(e.name) === p);
    if (entry) break;
    const pl = p.toLowerCase();
    entry = entries.find(e => normalizePath(e.name).toLowerCase() === pl);
    if (entry) break;
    entry = entries.find(e => normalizePath(e.name).toLowerCase().endsWith('/' + pl) || normalizePath(e.name).toLowerCase().endsWith(pl));
    if (entry) break;
  }

  // Fallback: find any .rdl/.rdlc/.docx in Layouts folder
  if (!entry){
    entry = entries.find(e => /layouts\/.+\.(rdl|rdlc|docx)$/i.test(e.name));
  }
  if (!entry){
    // Basename fallback: match file name anywhere
    const want = (rdlcPath || wordPath || '').split(/[\\\/]/).pop()?.toLowerCase?.() || '';
    if (want) {
      entry = entries.find(e => normalizePath(e.name).split('/').pop().toLowerCase() === want);
    }
  }
  if (!entry){
    throw new Error('Layout file not found in package');
  }

  const lower = entry.name.toLowerCase();
  let kind = 'xml';
  if (/(\.docx)$/i.test(lower)) kind = 'word';
  else if (/(\.rdl|\.rdlc)$/i.test(lower)) kind = 'rdlc';

  const content = await entry.async('string');
  return { content, entryPath: entry.name, kind };
}

export function renderLayoutPreview(containerEl, data){
  if (!containerEl) return;
  containerEl.innerHTML = '';
  const { content, entryPath, kind } = data;
  const header = document.createElement('div');
  header.className = 'layout-header';
  header.textContent = entryPath;

  const pre = document.createElement('pre');
  pre.className = 'layout-pre';
  if (kind === 'rdlc' || kind === 'xml') {
    pre.textContent = prettyXml(content);
  } else {
    pre.textContent = '(Binary layout: ' + entryPath + ')';
  }

  containerEl.appendChild(header);
  containerEl.appendChild(pre);
}
