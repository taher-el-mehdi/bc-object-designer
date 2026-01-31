// RDLC visual preview module: parses .rdl XML and renders a simplified layout
let __rdlStylesInjected = false;

function ensureStyles() {
  if (__rdlStylesInjected) return;
  const css = `
    .rdl-controls{
      display:flex;
      gap:6px;
      align-items:center;
      justify-content:flex-end;
      margin-bottom:6px;
      font-family:Segoe UI, Tahoma, Arial, sans-serif;
    }

    .rdl-controls .btn{
      background:#fff;
      color:#000;
      border:1px solid #000;
      padding:2px 6px;
      font-size:12px;
      cursor:pointer;
    }

    .rdl-controls .btn:hover{
      background:#eaeaea;
    }

    .rdl-controls .lbl{
      color:#000;
      font-size:12px;
      margin:0 6px;
    }

    .rdl-viewport{
      height:60vh;
      min-height:320px;
      overflow:auto;
      border:1px solid #000;
      background:#fff;
      padding:8px;
      font-family:Segoe UI, Tahoma, Arial, sans-serif;
    }

    .page{
      background:#fff;
      margin:0 auto 16px;
      border:1px solid #000;
      position:relative;
      transform-origin:top center;
      min-height:200px;
    }

    .body-section{
      position:relative;
      overflow:visible;
      padding:6px;
      border-bottom:1px dashed #000;
    }

    .footer-section{
      position:relative;
      border-top:1px dashed #000;
      background:#fff;
      padding:4px;
    }

    .abs-item{
      position:absolute;
      overflow:visible;
      border:1px dashed #000;
      padding:2px;
      background:#fff;
    }

    .rel-item{
      position:relative;
      overflow:visible;
      border:1px dashed #000;
      padding:2px;
      background:#fff;
    }

    .textbox{
      white-space:pre-wrap;
      word-wrap:break-word;
      font-size:12px;
      color:#000;
    }

    .textbox > div{
      line-height:1.3;
    }

    .rdl-table{
      border-collapse:collapse;
      table-layout:fixed;
      width:100%;
      border:1px solid #000;
      font-size:12px;
    }

    .rdl-table td{
      vertical-align:middle;
      padding:2px;
      border:1px dashed #000;
    }

    .image-placeholder{
      background:#fff;
      display:flex;
      align-items:center;
      justify-content:center;
      color:#000;
      font-size:11px;
      border:1px dashed #000;
      min-height:30px;
    }

    .field-tag{
      background:#fff;
      color:#000;
      padding:1px 4px;
      border:1px dashed #000;
      font-family:Consolas, monospace;
      font-size:.8em;
      display:inline-block;
      white-space:nowrap;
      margin:1px;
    }

    .unsupported{
      background:#fff;
      border:1px dashed #000;
      padding:4px;
      color:#000;
      font-size:11px;
      text-align:center;
    }

    .rdl-infobar{
      color:#000;
      font-size:12px;
      margin-top:6px;
      font-family:Segoe UI, Tahoma, Arial, sans-serif;
    }

    .error-box{
      border:1px solid #000;
      padding:10px;
      font-family:Segoe UI, Tahoma, Arial, sans-serif;
      color:#000;
    }

    .error-box h3{
      margin:0 0 6px 0;
      font-size:14px;
    }
  `;

  const style = document.createElement('style');
  style.id = 'rdlPreviewStyles';
  style.textContent = css;
  document.head.appendChild(style);
  __rdlStylesInjected = true;
}


function parseXmlSafe(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('XML Parse Error: ' + err.textContent.substring(0, 200));
  return doc;
}

function child(n, tag) {
  if (!n || !n.children) return null;
  for (let i = 0; i < n.children.length; i++) {
    if (n.children[i].localName === tag) return n.children[i];
  }
  return null;
}

function children(n, tag) {
  const arr = [];
  if (n && n.children) {
    for (let i = 0; i < n.children.length; i++) {
      if (n.children[i].localName === tag) arr.push(n.children[i]);
    }
  }
  return arr;
}

function text(n, tag) { const c = child(n, tag); return c ? c.textContent : null; }
function attr(n, name) { return (n && n.getAttribute) ? n.getAttribute(name) : null; }
function unit(v){ if(!v) return '0'; v=String(v).trim(); if (/^[\d.]+$/.test(v)) return v+'px'; return v; }
function px(v){ if(!v) return 0; v=String(v).trim().toLowerCase(); const n=parseFloat(v); if(isNaN(n)) return 0; if(v.endsWith('in')) return n*96; if(v.endsWith('cm')) return n*37.8; if(v.endsWith('mm')) return n*3.78; if(v.endsWith('pt')) return n*1.33; if(v.endsWith('pc')) return n*16; return n; }
function esc(t){ if(!t) return ''; const d=document.createElement('div'); d.textContent=String(t); return d.innerHTML; }

function expr(val){
  if(!val) return '';
  val = String(val);

  // Plain text
  if(!val.startsWith('=')) return esc(val);

  try{
    // Capture Fields and Parameters
    const fieldMatches = (val.match(/Fields!(\w+)/g) || [])
      .map(m => m.replace('Fields!',''));

    const paramMatches = (val.match(/Parameters!(\w+)/g) || [])
      .map(m => m.replace('Parameters!',''));

    const tags = [];

    fieldMatches.forEach(f => {
      tags.push('<span class="field-tag">Field: ' + esc(f) + '</span>');
    });

    paramMatches.forEach(p => {
      tags.push('<span class="field-tag">Param: ' + esc(p) + '</span>');
    });

    if (tags.length) return tags.join(' ');

    // Fallback simple replacements
    let r = val.slice(1);

    r = r.replace(/Today\(\)/gi, new Date().toLocaleDateString());
    r = r.replace(/Now\(\)/gi, new Date().toLocaleString());
    r = r.replace(/Globals!PageNumber/gi, '1');
    r = r.replace(/Globals!TotalPages/gi, '1');
    r = r.replace(/Globals!ReportName/gi, 'Report');
    r = r.replace(/User!UserID/gi, 'User');

    r = r.replace(/["\\&]/g, ' ');

    return esc(r.trim() || val);

  } catch {
    return esc(val);
  }
}


function isHidden(item){
  try{ const vis=child(item,'Visibility'); if(!vis) return false; const hidden=text(vis,'Hidden'); return hidden==='true'||hidden==='True'; }catch{ return false; }
}

function applyStyle(el,item){
  try{
    const style=child(item,'Style'); if(!style) return;
    const border=child(style,'Border');
    if(border){ const bs=text(border,'Style'); const bc=text(border,'Color'); const bw=text(border,'Width'); if(bs&&bs.toLowerCase()!=='none'){ el.style.borderStyle=bs; if(bc&&!bc.startsWith('=')) el.style.borderColor=bc; if(bw&&!bw.startsWith('=')) el.style.borderWidth=bw; } }
    ['Top','Bottom','Left','Right'].forEach(side=>{ const b=child(style,'Border'+side); if(b){ const bs=text(b,'Style'); const bc=text(b,'Color'); const bw=text(b,'Width'); if(bs&&bs.toLowerCase()!=='none'){ el.style['border'+side+'Style']=bs; if(bc&&!bc.startsWith('=')) el.style['border'+side+'Color']=bc; if(bw&&!bw.startsWith('=')) el.style['border'+side+'Width']=bw; } } });
    const map={FontFamily:'fontFamily',FontSize:'fontSize',FontWeight:'fontWeight',FontStyle:'fontStyle',Color:'color',BackgroundColor:'backgroundColor',TextAlign:'textAlign',VerticalAlign:'verticalAlign',PaddingLeft:'paddingLeft',PaddingRight:'paddingRight',PaddingTop:'paddingTop',PaddingBottom:'paddingBottom',LineHeight:'lineHeight',TextDecoration:'textDecoration'};
    for(const [rdlProp,cssProp] of Object.entries(map)){ const v=text(style,rdlProp); if(v&&!v.startsWith('=')) el.style[cssProp]=v; }
  }catch{}
}

function renderTextbox(div,item){
  try{
    const paras=child(item,'Paragraphs');
    if(!paras){ const v=text(item,'Value'); if(v) div.innerHTML=expr(v); return; }
    const paraNodes=children(paras,'Paragraph');
    for(const para of paraNodes){ const pDiv=document.createElement('div'); const ps=child(para,'Style'); if(ps){ const ta=text(ps,'TextAlign'); if(ta) pDiv.style.textAlign=ta; }
      const runs=child(para,'TextRuns'); if(runs){ const runNodes=children(runs,'TextRun'); for(const run of runNodes){ const span=document.createElement('span'); span.innerHTML=expr(text(run,'Value')); const rs=child(run,'Style'); if(rs) applyStyle(span,run); pDiv.appendChild(span); } }
      if(pDiv.innerHTML) div.appendChild(pDiv); }
  }catch{}
}

function renderTextboxInCell(td,textbox){
  try{
    const paras=child(textbox,'Paragraphs');
    if(!paras){ const v=text(textbox,'Value'); if(v) td.innerHTML+=expr(v); applyStyle(td,textbox); return; }
    const paraNodes=children(paras,'Paragraph');
    for(const para of paraNodes){ const pDiv=document.createElement('div'); const ps=child(para,'Style'); if(ps){ const ta=text(ps,'TextAlign'); if(ta) pDiv.style.textAlign=ta; }
      const runs=child(para,'TextRuns'); if(runs){ const runNodes=children(runs,'TextRun'); for(const run of runNodes){ const span=document.createElement('span'); span.innerHTML=expr(text(run,'Value')); const rs=child(run,'Style'); if(rs) applyStyle(span,run); pDiv.appendChild(span); } }
      if(pDiv.innerHTML) td.appendChild(pDiv); }
    applyStyle(td,textbox);
  }catch{}
}

function renderTablix(container,tablix){
  try{
    const body=child(tablix,'TablixBody'); if(!body) return;
    const colsNode=child(body,'TablixColumns'); const cols=children(colsNode,'TablixColumn');
    const rowsNode=child(body,'TablixRows'); const rows=children(rowsNode,'TablixRow'); if(rows.length===0) return;
    let isContainer=false; if(cols.length===1){ for(const row of rows){ const cells=children(child(row,'TablixCells'),'TablixCell'); for(const cell of cells){ const contents=child(cell,'CellContents'); if(contents&&contents.children){ for(let i=0;i<contents.children.length;i++){ if(contents.children[i].localName==='Rectangle'){ isContainer=true; break; } } } } if(isContainer) break; } }
    if(isContainer){ renderContainerTablix(container,rows); } else { renderTableTablix(container,cols,rows); }
  }catch{}
}

function renderContainerTablix(container,rows){
  let totalHeight=0;
  for(const row of rows){ const rowH=px(text(row,'Height'))||50; const rowDiv=document.createElement('div'); rowDiv.className='abs-item'; rowDiv.style.top=totalHeight+'px'; rowDiv.style.left='0'; rowDiv.style.width='100%'; rowDiv.style.height=rowH+'px';
    const cells=children(child(row,'TablixCells'),'TablixCell');
    for(const cell of cells){ const contents=child(cell,'CellContents'); if(contents&&contents.children){ for(let i=0;i<contents.children.length;i++){ const c=contents.children[i]; if(c.localName==='Rectangle'){ const items=child(c,'ReportItems'); if(items&&items.children){ for(let j=0;j<items.children.length;j++){ renderItem(items.children[j],rowDiv,true); } } } else { renderItem(c,rowDiv,true); } } } }
    container.appendChild(rowDiv); totalHeight+=rowH; }
  container.style.height=totalHeight+'px';
}

function renderTableTablix(container,cols,rows){
  const table=document.createElement('table'); table.className='rdl-table';
  if(cols.length>0){ const colgroup=document.createElement('colgroup'); for(const col of cols){ const colEl=document.createElement('col'); const w=text(col,'Width'); if(w) colEl.style.width=unit(w); colgroup.appendChild(colEl);} table.appendChild(colgroup); }
  for(const row of rows){ const tr=document.createElement('tr'); const rowH=text(row,'Height'); if(rowH) tr.style.height=unit(rowH); const cells=children(child(row,'TablixCells'),'TablixCell'); for(let i=0;i<cells.length;i++){ const td=document.createElement('td'); if(cols[i]){ const w=text(cols[i],'Width'); if(w) td.style.width=unit(w); } const colSpan=text(cells[i],'ColSpan'); if(colSpan) td.colSpan=parseInt(colSpan)||1; const rowSpan=text(cells[i],'RowSpan'); if(rowSpan) td.rowSpan=parseInt(rowSpan)||1; const contents=child(cells[i],'CellContents'); if(contents&&contents.children){ for(let j=0;j<contents.children.length;j++){ const c=contents.children[j]; if(c.localName==='Textbox'){ renderTextboxInCell(td,c); } else if(c.localName==='Rectangle'){ const items=child(c,'ReportItems'); if(items&&items.children){ for(let k=0;k<items.children.length;k++){ const item=items.children[k]; if(item.localName==='Textbox'){ renderTextboxInCell(td,item); } else if(item.localName==='Tablix'){ const nestedDiv=document.createElement('div'); nestedDiv.style.position='relative'; renderTablix(nestedDiv,item); td.appendChild(nestedDiv); } else { renderItem(item,td,false); } } } applyStyle(td,c); } else if(c.localName==='Image'){ td.innerHTML='<div class="image-placeholder">🖼️</div>'; } } }
      tr.appendChild(td); }
    table.appendChild(tr); }
  container.appendChild(table);
}

function renderItem(item,container,positioned){
  if(!item||!item.localName) return; if(isHidden(item)) return; const type=item.localName; const div=document.createElement('div'); div.className=positioned?'abs-item':'rel-item'; if(positioned){ div.style.top=unit(text(item,'Top')||'0'); div.style.left=unit(text(item,'Left')||'0'); }
  const w=text(item,'Width'); const h=text(item,'Height'); if(w) div.style.width=unit(w); if(h) div.style.height=unit(h);
  switch(type){ case 'Textbox': div.classList.add('textbox'); renderTextbox(div,item); applyStyle(div,item); break; case 'Rectangle': applyStyle(div,item); const rectItems=child(item,'ReportItems'); if(rectItems&&rectItems.children){ for(let i=0;i<rectItems.children.length;i++){ renderItem(rectItems.children[i],div,true); } } break; case 'Tablix': renderTablix(div,item); break; case 'Image': const imgName=attr(item,'Name')||'Image'; div.innerHTML='<div class="image-placeholder">🖼️ '+esc(imgName)+'</div>'; break; case 'Line': div.style.borderTop='1px solid #000'; break; case 'Chart': div.innerHTML='<div class="unsupported">📊 Chart: '+esc(attr(item,'Name')||'Chart')+'</div>'; break; case 'Gauge': div.innerHTML='<div class="unsupported">🎯 Gauge: '+esc(attr(item,'Name')||'Gauge')+'</div>'; break; case 'Subreport': div.innerHTML='<div class="unsupported">📄 Subreport: '+esc(attr(item,'Name')||text(item,'ReportName')||'Subreport')+'</div>'; break; case 'Map': div.innerHTML='<div class="unsupported">🗺️ Map: '+esc(attr(item,'Name')||'Map')+'</div>'; break; default: const items=child(item,'ReportItems'); if(items&&items.children){ for(let i=0;i<items.children.length;i++){ renderItem(items.children[i],div,true); } } break; }
  container.appendChild(div);
}

export function renderRDLPreview(containerEl, rdlXml){
  if (!containerEl) return;
  ensureStyles();
  containerEl.innerHTML = '';
  const controls = document.createElement('div');
  controls.className = 'rdl-controls';
  const btnMinus = document.createElement('button'); btnMinus.className='btn'; btnMinus.textContent='−';
  const lbl = document.createElement('span'); lbl.className='lbl'; lbl.textContent='100%';
  const btnPlus = document.createElement('button'); btnPlus.className='btn'; btnPlus.textContent='+';
  const btnFit = document.createElement('button'); btnFit.className='btn'; btnFit.textContent='Fit';
  controls.appendChild(btnMinus); controls.appendChild(lbl); controls.appendChild(btnPlus); controls.appendChild(btnFit);
  const viewport = document.createElement('div'); viewport.className='rdl-viewport';
  const info = document.createElement('div'); info.className='rdl-infobar'; info.textContent='Loading…';
  containerEl.appendChild(controls); containerEl.appendChild(viewport); containerEl.appendChild(info);

  let scale = 0.9;
  function applyScale(){ Array.from(viewport.querySelectorAll('.page')).forEach(p=>p.style.transform='scale('+scale+')'); lbl.textContent = Math.round(scale*100)+'%'; }
  btnMinus.onclick = () => { scale = Math.max(0.3, scale - 0.1); applyScale(); };
  btnPlus.onclick = () => { scale = Math.min(2, scale + 0.1); applyScale(); };
  btnFit.onclick = () => { scale = 0.9; applyScale(); };

  try {
    const doc = parseXmlSafe(rdlXml);
    const report = child(doc, 'Report');
    if (!report) throw new Error('Invalid RDL: No Report element found');
    let bodyNode = null, pageNode = null;
    const sections = child(report, 'ReportSections');
    if (sections){ const section = child(sections, 'ReportSection'); if (section){ bodyNode = child(section, 'Body'); pageNode = child(section, 'Page'); } }
    if (!bodyNode){ bodyNode = child(report, 'Body'); pageNode = child(report, 'Page'); }
    if (!bodyNode) throw new Error('Invalid RDL: No Body element found');

    const page = document.createElement('div'); page.className='page';
    const pageWidth = text(pageNode, 'PageWidth') || text(report, 'PageWidth') || '8.5in'; page.style.width = unit(pageWidth);
    const leftMargin = text(pageNode, 'LeftMargin') || text(report, 'LeftMargin');
    const rightMargin = text(pageNode, 'RightMargin') || text(report, 'RightMargin');
    const topMargin = text(pageNode, 'TopMargin') || text(report, 'TopMargin');

    const pageHeader = pageNode ? child(pageNode, 'PageHeader') : null;
    if (pageHeader){ const headerDiv = document.createElement('div'); headerDiv.className='body-section'; headerDiv.style.borderBottom='1px solid #ddd'; headerDiv.style.background='#fafafa'; const hHeight=text(pageHeader,'Height'); if(hHeight) headerDiv.style.minHeight=unit(hHeight); const hItems=child(pageHeader,'ReportItems'); if(hItems&&hItems.children){ for (let i=0;i<hItems.children.length;i++){ renderItem(hItems.children[i], headerDiv, true); } } page.appendChild(headerDiv); }

    const bodyDiv = document.createElement('div'); bodyDiv.className='body-section'; const bodyHeight=text(bodyNode,'Height'); if(bodyHeight) bodyDiv.style.minHeight=unit(bodyHeight); if(leftMargin) bodyDiv.style.paddingLeft=unit(leftMargin); if(rightMargin) bodyDiv.style.paddingRight=unit(rightMargin); if(topMargin) bodyDiv.style.paddingTop=unit(topMargin);
    const items = child(bodyNode,'ReportItems'); if(items&&items.children){ for(let i=0;i<items.children.length;i++){ renderItem(items.children[i], bodyDiv, true); } }
    page.appendChild(bodyDiv);

    const pageFooter = pageNode ? child(pageNode, 'PageFooter') : null;
    if (pageFooter){ const footerDiv = document.createElement('div'); footerDiv.className='footer-section'; const fHeight=text(pageFooter,'Height'); if(fHeight) footerDiv.style.minHeight=unit(fHeight); const fItems=child(pageFooter,'ReportItems'); if(fItems&&fItems.children){ for(let i=0;i<fItems.children.length;i++){ renderItem(fItems.children[i], footerDiv, true); } } page.appendChild(footerDiv); }

    viewport.innerHTML=''; viewport.appendChild(page); applyScale();
    info.textContent = 'Preview ready';
  } catch(e){
    viewport.innerHTML = '<div class="error-box"><h3>⚠️ Preview Error</h3><p>' + esc(e.message) + '</p></div>';
    info.textContent = 'Preview error';
  }
}

export default { renderRDLPreview };