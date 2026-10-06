// Validate imported data before constructing meshes or rendering model text.
export function validateModel(model) {
  const fail = (message) => { throw new Error(`Invalid city model: ${message}`); };
  if (!model || !model.meta || !model.meta.totals) fail('missing metadata');
  for (const key of ['buildings', 'districts', 'roads']) if (!Array.isArray(model[key])) fail(`${key} must be an array`);
  for (const key of ['buildings', 'districts', 'roads', 'loc']) {
    if (!Number.isFinite(model.meta.totals[key]) || model.meta.totals[key] < 0) fail(`invalid total ${key}`);
  }
  const districts = new Set();
  for (const d of model.districts) {
    if (!d || typeof d.id !== 'string' || typeof d.name !== 'string' || districts.has(d.id)) fail('invalid or duplicate district');
    if (d.depth != null && (!Number.isFinite(d.depth) || d.depth < 0)) fail('invalid district depth');
    if(d.parent!=null&&typeof d.parent!=='string')fail('invalid district parent');
    for (const key of ['buildings','loc','methods']) if (d[key] != null && (!Number.isFinite(d[key]) || d[key] < 0)) fail(`invalid district ${key}`);
    districts.add(d.id);
  }
  const ids = new Set();
  for (const b of model.buildings) {
    if (!b || typeof b.id !== 'string' || ids.has(b.id)) fail('invalid or duplicate building');
    for (const key of ['name', 'file', 'district', 'kind', 'language']) if (typeof b[key] !== 'string') fail(`missing building ${key}`);
    if (!districts.has(b.district)) fail(`unknown district for ${b.id}`);
    for (const key of ['loc', 'nom', 'noa', 'methods', 'attributes', 'functions', 'start_line']) {
      if (!Number.isFinite(b[key]) || b[key] < 0) fail(`invalid ${key} for ${b.id}`);
    }
    if (b.coverage != null && (!Number.isFinite(b.coverage) || b.coverage < 0 || b.coverage > 1)) fail('coverage must be between 0 and 1');
    if(b.end_line!=null&&(!Number.isInteger(b.end_line)||b.end_line<b.start_line))fail('invalid source range');
    if(b.complexity!=null&&(!Number.isFinite(b.complexity)||b.complexity<0))fail('invalid complexity');
    if(b.generated!=null&&typeof b.generated!=='boolean')fail('invalid generated classification');
    if(b.analysis&&(['parser','version','source','confidence'].some(k=>typeof b.analysis[k]!=='string')))fail('invalid analysis evidence');
    if (b.members != null && (!Array.isArray(b.members) || b.members.some((m) => !m || typeof m.name !== 'string' || typeof m.kind !== 'string' || !Number.isFinite(m.loc) || !Number.isFinite(m.line)))) fail('invalid members');
    ids.add(b.id);
  }
  for (const r of model.roads) {
    if (!r || !ids.has(r.a) || !ids.has(r.b) || !Number.isFinite(r.weight) || r.weight <= 0) fail('invalid road');
    if(r.kind!=null&&typeof r.kind!=='string')fail('invalid edge kind');
  }
  const history = model.meta.history;
  if (history && (!Array.isArray(history.frames) || history.frames.some((f) =>
    !f || typeof f.hash !== 'string' || !Number.isFinite(f.t) || !Number.isFinite(f.total) || !f.files || typeof f.files !== 'object' ||
    Object.values(f.files).some((v) => !Number.isFinite(v) || v < 0)))) fail('invalid history');
  const infra = model.meta.infra;
  if (infra) {
    if (!Array.isArray(infra.services) || infra.services.some((s) => !s || typeof s.name !== 'string' || typeof s.category !== 'string')) fail('invalid infrastructure services');
    for (const key of ['cpu','ram']) {
      const val = infra[key];
      if (!val || !Number.isFinite(val.pct) || val.pct < 0 || val.pct > 100 || !Number.isFinite(val.score) || val.score < 0 || val.score > 1 || typeof val.estimate !== 'string') fail(`invalid infrastructure ${key}`);
    }
  }
  return model;
}
