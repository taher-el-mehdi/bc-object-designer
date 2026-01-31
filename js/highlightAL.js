// Lightweight AL syntax highlighter
// Exports: createALHighlighter() -> (line: string) => string (HTML)

/** Escapes HTML special characters in a string */
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const KEYWORDS = new Set([
  'table','page','report','query','codeunit','xmlport','enum','interface','permissions','entitlements',
  'extends','implements','trigger','procedure','local','internal','protected','external','event',
  'var','begin','end','with','if','then','else','case','of','do','while','repeat','until','for','to','downto',
  'exit','return','break','continue','div','mod','and','or','not','in','as','is','try','catch','finally',
  'temporary','field','key','group','area','actions','layout','add','modify','moveafter','movebefore','addafter','addbefore',
  'action','part','dataset','requestpage','currpage','currreport','true','false'
]);

const TYPES = new Set([
  'Integer','BigInteger','Decimal','Text','Code','Char','Date','Time','DateTime','Duration','Boolean','Option','Enum','Guid',
  'Record','Report','Page','Codeunit','Query','XmlPort','Blob','Media','MediaSet','Variant','Label','List','Dictionary',
  'JsonObject','JsonArray','JsonToken','JsonValue'
]);

const DIRECTIVES = new Set(['#if','#else','#endif','#region','#endregion','#pragma','#error','#warning']);

export function createALHighlighter() {
  let inBlockComment = false;

  function wrap(cls, txt) { return `<span class="${cls}">${txt}</span>`; }

  function processWord(word) {
    const w = word;
    const wl = w.toLowerCase();
    if (DIRECTIVES.has(wl)) return wrap('tok-directive', escapeHtml(w));
    if (KEYWORDS.has(wl)) return wrap('tok-keyword', escapeHtml(w));
    if (TYPES.has(w)) return wrap('tok-type', escapeHtml(w));
    if (/^[0-9]+(\.[0-9_]+)?$/.test(w)) return wrap('tok-number', escapeHtml(w));
    return escapeHtml(w);
  }

  function processAttr(s, i) {
    // parse [AttributeName(...)] until ]
    let j = i + 1;
    while (j < s.length && s[j] !== ']') j++;
    const content = s.slice(i, Math.min(j + 1, s.length));
    return { html: wrap('tok-attr', escapeHtml(content)), next: Math.min(j + 1, s.length) };
  }

  function processString(s, i, quote) {
    let j = i + 1;
    while (j < s.length) {
      const ch = s[j];
      if (ch === '\\') { j += 2; continue; }
      if (ch === quote) {
        // AL uses doubled quotes inside strings as escape as well; the above handles \\" but we also accept '' inside '
        if (quote === "'" && s[j+1] === "'" ) { j += 2; continue; }
        if (quote === '"' && s[j+1] === '"') { j += 2; continue; }
        j++; break;
      }
      j++;
    }
    const content = s.slice(i, Math.min(j, s.length));
    const cls = quote === "'" ? 'tok-string-sq' : 'tok-string-dq';
    return { html: wrap(cls, escapeHtml(content)), next: Math.min(j, s.length) };
  }

  function highlightLine(line) {
    let i = 0;
    const s = line;
    let out = '';

    if (inBlockComment) {
      const end = s.indexOf('*/');
      if (end === -1) {
        return wrap('tok-comment', escapeHtml(s));
      } else {
        out += wrap('tok-comment', escapeHtml(s.slice(0, end + 2)));
        i = end + 2;
        inBlockComment = false;
      }
    }

    while (i < s.length) {
      const ch = s[i];
      const next = s[i+1];

      // Start of block comment
      if (ch === '/' && next === '*') {
        const end = s.indexOf('*/', i + 2);
        if (end === -1) {
          inBlockComment = true;
          out += wrap('tok-comment', escapeHtml(s.slice(i)));
          return out;
        } else {
          out += wrap('tok-comment', escapeHtml(s.slice(i, end + 2)));
          i = end + 2;
          continue;
        }
      }

      // Line comment
      if (ch === '/' && next === '/') {
        out += wrap('tok-comment', escapeHtml(s.slice(i)));
        return out;
      }

      // Attribute [ ... ]
      if (ch === '[') {
        const { html, next: ni } = processAttr(s, i);
        out += html; i = ni; continue;
      }

      // String literals: both ' and " (treat both as string-like for readability)
      if (ch === '"' || ch === "'") {
        const { html, next: ni } = processString(s, i, ch);
        out += html; i = ni; continue;
      }

      // Directives starting with #
      if (ch === '#') {
        // take until whitespace
        let j = i + 1;
        while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
        const dir = s.slice(i, j);
        if (DIRECTIVES.has(dir.toLowerCase())) {
          out += wrap('tok-directive', escapeHtml(dir));
          i = j; continue;
        }
      }

      // Words / numbers
      if (/[A-Za-z_]/.test(ch)) {
        let j = i + 1;
        while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
        const w = s.slice(i, j);
        out += processWord(w);
        i = j; continue;
      }
      if (/[0-9]/.test(ch)) {
        let j = i + 1;
        while (j < s.length && /[0-9_\.]/.test(s[j])) j++;
        const num = s.slice(i, j);
        out += wrap('tok-number', escapeHtml(num));
        i = j; continue;
      }

      // default char
      out += escapeHtml(ch);
      i++;
    }

    return out;
  }

  return highlightLine;
}

export { escapeHtml };
