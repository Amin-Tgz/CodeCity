// Tiny query language for filtering/tagging the city.
//
//   name:foo file:bar type:class lang:python district:backend ext:ts
//   nom>5  noa<=2  loc>=200  deps>10
//   bareword            -> matches name or file
//
// Terms are AND-combined. Returns { test, describe } where test(building) is a
// predicate; `deps` is available on the runtime building object.

const FIELDS = {
  name: (b) => b.name,
  file: (b) => b.file,
  type: (b) => b.kind,
  kind: (b) => b.kind,
  lang: (b) => b.language,
  language: (b) => b.language,
  district: (b) => b.district,
  ext: (b) => (b.file.split('.').pop() || ''),
};

const METRICS = ['nom', 'noa', 'loc', 'deps'];
const LANG_ALIASES = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', cs: 'csharp' };

function cmp(a, op, b) {
  switch (op) {
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    default: return a === b;
  }
}

export function parseQuery(q) {
  const terms = String(q || '').trim().split(/\s+/).filter(Boolean);
  const preds = [];
  const labels = [];
  for (const term of terms) {
    const fieldm = term.match(/^(name|file|type|kind|lang|language|district|ext):(.+)$/i);
    if (fieldm) {
      const k = fieldm[1].toLowerCase();
      let v = fieldm[2].toLowerCase();
      if (k === 'lang' || k === 'language') v = LANG_ALIASES[v] || v;
      preds.push((b) => {
        let value = String(FIELDS[k](b) || '').toLowerCase();
        if (k === 'lang' || k === 'language') value = LANG_ALIASES[value] || value;
        return value.includes(v);
      });
      labels.push(`${k}~${v}`);
      continue;
    }
    const metricm = term.match(/^(nom|noa|loc|deps)(>=|<=|>|<|=|:)\s*(\d+)$/i);
    if (metricm) {
      const k = metricm[1].toLowerCase();
      const op = metricm[2] === ':' ? '=' : metricm[2];
      const n = Number(metricm[3]);
      if (METRICS.includes(k)) {
        preds.push((b) => cmp(Number(b[k] || 0), op, n));
        labels.push(`${k}${op}${n}`);
        continue;
      }
    }
    const v = term.toLowerCase();
    preds.push((b) => b.name.toLowerCase().includes(v) || b.file.toLowerCase().includes(v));
    labels.push(v);
  }
  const test = (b) => preds.every((p) => p(b));
  return { test, describe: labels.join(' + '), empty: preds.length === 0 };
}

const KEY = 'codecity.queries';

export function loadQueries() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!data || Array.isArray(data) || typeof data !== 'object') return {};
    return Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === 'string'));
  } catch { return {}; }
}

export function saveQuery(name, text) {
  const all = loadQueries();
  Object.defineProperty(all, name, { value: String(text), enumerable: true, configurable: true });
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { return null; }
  return all;
}
