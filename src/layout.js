// Squarified treemap (Bruls, Huizing & van Wijk, 2000).
// Used to lay out districts on the ground and buildings inside each district.

function sum(items) {
  let s = 0;
  for (const it of items) s += it.value;
  return s;
}

function worst(row, side) {
  let s = 0;
  let rmax = -Infinity;
  let rmin = Infinity;
  for (const r of row) {
    s += r.area;
    if (r.area > rmax) rmax = r.area;
    if (r.area < rmin) rmin = r.area;
  }
  if (s <= 0 || side <= 0) return Infinity;
  return Math.max((side * side * rmax) / (s * s), (s * s) / (side * side * rmin));
}

/**
 * @param {Array<{value:number}>} children
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns {Array<{item:object, rect:{x:number,y:number,w:number,h:number}}>}
 */
export function treemap(children, rect) {
  const items = children.filter((c) => c.value > 0);
  if (!items.length || rect.w <= 0 || rect.h <= 0) return [];

  const total = sum(items);
  const scale = (rect.w * rect.h) / total;
  const scaled = items
    .map((c) => ({ item: c, area: Math.max(c.value * scale, 1e-6) }))
    .sort((a, b) => b.area - a.area);

  const out = [];
  let free = { ...rect };
  let i = 0;

  while (i < scaled.length) {
    const side = Math.min(free.w, free.h);
    const row = [scaled[i]];
    let j = i + 1;
    while (j < scaled.length && worst([...row, scaled[j]], side) <= worst(row, side)) {
      row.push(scaled[j]);
      j++;
    }

    const rowArea = row.reduce((a, c) => a + c.area, 0);
    if (free.w >= free.h) {
      const rw = Math.min(rowArea / free.h, free.w);
      let cy = free.y;
      for (const c of row) {
        const ch = (c.area / rowArea) * free.h;
        out.push({ item: c.item, rect: { x: free.x, y: cy, w: rw, h: ch } });
        cy += ch;
      }
      free = { x: free.x + rw, y: free.y, w: free.w - rw, h: free.h };
    } else {
      const rh = Math.min(rowArea / free.w, free.h);
      let cx = free.x;
      for (const c of row) {
        const cw = (c.area / rowArea) * free.w;
        out.push({ item: c.item, rect: { x: cx, y: free.y, w: cw, h: rh } });
        cx += cw;
      }
      free = { x: free.x, y: free.y + rh, w: free.w, h: free.h - rh };
    }
    i = j;
  }
  return out;
}

export function inset(rect, pad) {
  const w = Math.max(rect.w - pad * 2, 0.001);
  const h = Math.max(rect.h - pad * 2, 0.001);
  return { x: rect.x + pad, y: rect.y + pad, w, h };
}
