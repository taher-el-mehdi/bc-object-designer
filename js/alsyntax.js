/**
 * Generate a lightweight pseudo-AL outline for an object when full source is unavailable.
 * This is not a full compiler output; it’s intended to help developers quickly understand
 * structure and main elements (fields, keys, controls, values).
 */
export function generatePseudoAL(obj){
  if (!obj || !obj.type) return '';
  const id = obj.id != null ? obj.id : '';
  const name = obj.name || '';
  const hdr = (kind) => `${kind} ${id} "${name}"`;
  const lines = [];

  switch(String(obj.type)){
    case 'Table': {
      lines.push(hdr('table')); lines.push('{');
      // Fields
      if (Array.isArray(obj.fields) && obj.fields.length){
        lines.push('  fields'); lines.push('  {');
        for (const f of obj.fields){
          const fid = f.id != null ? f.id : '';
          const ft = f.type || 'Any';
          lines.push(`    field(${fid}; ${safeName(f.name)}) ${ft} {}`);
        }
        lines.push('  }');
      }
      // Keys
      if (Array.isArray(obj.keys) && obj.keys.length){
        lines.push('  keys'); lines.push('  {');
        for (const k of obj.keys){
          const fields = Array.isArray(k.fields) ? k.fields.join(', ') : '';
          lines.push(`    key(${safeName(k.name)}; ${fields}) {}`);
        }
        lines.push('  }');
      }
      lines.push('}');
      break;
    }
    case 'Page': {
      lines.push(hdr('page')); lines.push('{');
      // Layout
      if (Array.isArray(obj.controls) && obj.controls.length){
        lines.push('  layout'); lines.push('  {');
        for (const c of obj.controls){
          const kind = controlKind(c.subtype);
          const cid = c.id != null ? c.id : '';
          lines.push(`    ${kind}(${cid}; ${safeName(c.name)}) {}`);
        }
        lines.push('  }');
      }
      // Actions
      if (Array.isArray(obj.actions) && obj.actions.length){
        lines.push('  actions'); lines.push('  {');
        for (const a of obj.actions){
          const aid = a.id != null ? a.id : '';
          lines.push(`    action(${aid}; ${safeName(a.name)}) {}`);
        }
        lines.push('  }');
      }
      lines.push('}');
      break;
    }
    case 'Codeunit': {
      lines.push(hdr('codeunit')); lines.push('{');
      lines.push('  // Methods not available in symbols-only packages');
      lines.push('}');
      break;
    }
    case 'Enum':
    case 'EnumType': {
      lines.push(hdr('enum')); lines.push('{');
      if (Array.isArray(obj.values) && obj.values.length){
        for (const v of obj.values){
          const vid = v.id != null ? v.id : '';
          lines.push(`  value(${vid}; ${safeName(v.name)}) {}`);
        }
      }
      lines.push('}');
      break;
    }
    default: {
      lines.push(hdr(obj.type.toLowerCase())); lines.push('{');
      lines.push('  // Outline only');
      lines.push('}');
    }
  }
  return lines.join('\n');
}

function safeName(n){
  const s = String(n || '').trim();
  const needsQuotes = /[^A-Za-z0-9_]/.test(s);
  return needsQuotes ? `"${s}"` : s;
}

function controlKind(subtype){
  const s = String(subtype || '').toLowerCase();
  if (s.includes('group') || s.includes('area') || s.includes('repeater')) return 'group';
  if (s.includes('action')) return 'action';
  return 'field';
}
