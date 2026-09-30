// City comparison: diff the current model against an earlier city.json.

export function diffAgainst(model, baseline) {
  const base = new Map((baseline.buildings || []).map((b) => [b.id, b]));
  let added = 0;
  let changed = 0;
  let removed = 0;
  let locDelta = 0;
  for (const b of model.buildings) {
    const prev = base.get(b.id);
    if (!prev) { added++; continue; }
    const dl = (b.loc || 0) - (prev.loc || 0);
    if (dl !== 0) changed++;
    locDelta += dl;
  }
  const now = new Set(model.buildings.map((b) => b.id));
  for (const id of base.keys()) if (!now.has(id)) removed++;
  return { base, stats: { added, changed, removed, locDelta } };
}
