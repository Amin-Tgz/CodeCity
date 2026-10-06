// City comparison: diff the current model against an earlier city.json.

export function diffAgainst(model, baseline) {
  if (!baseline || !Array.isArray(baseline.buildings)) throw new Error('baseline must contain a buildings array');
  const base = new Map();
  for (const b of baseline.buildings) {
    if (!b || typeof b.id !== 'string' || !Number.isFinite(b.loc) || b.loc < 0 || base.has(b.id)) {
      throw new Error('baseline has invalid or duplicate buildings');
    }
    base.set(b.id, b);
  }
  let added = 0;
  let changed = 0;
  let removed = 0;
  let locDelta = 0;
  const changedIds=[];
  const signature=b=>JSON.stringify([b.kind,b.loc,b.nom,b.noa,b.complexity,(b.members||[]).map(m=>[m.name,m.kind,m.line,m.end_line,m.loc])]);
  const edgeSignatures=model=>{const map=new Map();for(const r of model.roads||[])for(const id of [r.a,r.b]){if(!map.has(id))map.set(id,[]);map.get(id).push([r.a,r.b,r.kind,r.weight].join('\0'));}return new Map([...map].map(([id,rows])=>[id,rows.sort().join('\n')]));};
  const nowEdges=edgeSignatures(model),oldEdges=edgeSignatures(baseline);
  for (const b of model.buildings) {
    const prev = base.get(b.id);
    if (!prev) { added++; locDelta += b.loc || 0; continue; }
    const dl = (b.loc || 0) - (prev.loc || 0);
    if (signature(b)!==signature(prev)||(nowEdges.get(b.id)||'')!==(oldEdges.get(b.id)||'')) {changed++;changedIds.push(b.id);}
    locDelta += dl;
  }
  const now = new Set(model.buildings.map((b) => b.id));
  for (const [id, b] of base) if (!now.has(id)) { removed++; locDelta -= b.loc || 0; }
  return { base, changedIds, stats: { added, changed, removed, locDelta } };
}
