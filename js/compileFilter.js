/**
 * Compile a lightweight filter function.
 * - type "text": supports wildcards with '*' and case-insensitive match
 * - type "int": supports n, n..m, ..m, n.., >n, >=n, <n, <=n
 * @param {"text"|"int"} type
 * @param {string} expression
 * @returns {(row: {TEXT?: string, INT?: number|string}) => boolean}
 */
export function compileFilter(type, expression) {
  if (!expression) return () => true;
  if (type === 'text') {
    const expr = String(expression).replace(/^@/, '').trim();
    const esc = expr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const re = new RegExp('^' + esc + '$', 'i');
    return ({ TEXT }) => re.test(TEXT || '');
  }
  if (type === 'int') {
    const ex = String(expression).trim();
    // very small subset: n, n..m, ..m, n.., >n, >=n, <n, <=n
    return ({ INT }) => {
      const n = Number(INT);
      if (!ex) return true;
      const m = ex.match(/^\s*(>=|<=|>|<)\s*(\d+)\s*$/);
      if (m) {
        const op = m[1], v = Number(m[2]);
        if (op === '>') return n > v;
        if (op === '>=') return n >= v;
        if (op === '<') return n < v;
        if (op === '<=') return n <= v;
      }
      const r = ex.match(/^\s*(\d+)?\s*\.\.\s*(\d+)?\s*$/);
      if (r) {
        const a = r[1] != null ? Number(r[1]) : -Infinity;
        const b = r[2] != null ? Number(r[2]) : Infinity;
        return n >= a && n <= b;
      }
      const eq = ex.match(/^\s*(\d+)\s*$/);
      if (eq) return n === Number(eq[1]);
      return true;
    };
  }
  return () => true;
}