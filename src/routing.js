import {sharedConnections} from './connections.js';
export const STREET_Y = 0.66;
const TILE = 6;

const CELL = 0.8;      // routing grid cell size (world units)
const CLEAR = 0.1;     // clearance kept between a street edge and a building
const MAX_EXPANSIONS = 260000;

// tier by dependency weight; wider = heavier. min = lower weight bound.
const TIERS = [
  { name: 'road4', width: 1.6, min: 12, lanes: 4 },
  { name: 'road2', width: 1.2, min: 8, lanes: 2 },
  { name: 'street', width: 0.8, min: 3 },
  { name: 'alley', width: 0.5, min: 0 },
];

function tierIndexFor(weight) {
  for (let i = 0; i < TIERS.length; i++) if (weight >= TIERS[i].min) return i;
  return TIERS.length - 1;
}

// Distance from a point to a rectangle (0 inside).
function pointRectDist(px, py, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Orthogonal connector from a building rectangle to a grid point `g`:
// [point on the face, optional elbow, g] - all three axis-aligned.
function connectOrtho(center, half, g, y = STREET_Y) {
  const cx = clamp(g.x, center.x - half.w, center.x + half.w);
  const cz = clamp(g.z, center.z - half.d, center.z + half.d);
  const cp = new Point3(cx, y, cz);
  const dx = Math.abs(g.x - cx);
  const dz = Math.abs(g.z - cz);
  if (dx < 1e-3 || dz < 1e-3) return [cp, g.clone()];
  const outside = (p) => (
    p.x < center.x - half.w - 1e-3 || p.x > center.x + half.w + 1e-3
    || p.z < center.z - half.d - 1e-3 || p.z > center.z + half.d + 1e-3
  );
  const e1 = new Point3(g.x, y, cz);
  const elbow = outside(e1) ? e1 : new Point3(cx, y, g.z);
  return [cp, elbow, g.clone()];
}

// Minimal binary min-heap keyed by f-score.
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node) {
    const a = this.a;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}


export class Point3 {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  clone(){return new Point3(this.x,this.y,this.z);}
  distanceTo(p){return Math.hypot(this.x-p.x,this.y-p.y,this.z-p.z);}
}
export class StreetRouter {
  constructor(model,by,side,terraces=[]){this.model=model;this.by=by;this.side=side;this.terraces=terraces;this.levelGrids=new Map();}

  _atLevel(grids,level) {
    if(this.levelGrids.has(level))return this.levelGrids.get(level);
    const out={};
    for(const [name,grid] of Object.entries(grids)) {
      const blocked=grid.blocked.slice(),{nx,ny}=grid;
      for(const t of this.terraces)if(t.altitude>level+.01) {
        const r=t.rect;
        for(let j=Math.max(0,Math.floor((r.y-grid.rad)/CELL));j<=Math.min(ny-1,Math.ceil((r.y+r.h+grid.rad)/CELL));j++)
          for(let i=Math.max(0,Math.floor((r.x-grid.rad)/CELL));i<=Math.min(nx-1,Math.ceil((r.x+r.w+grid.rad)/CELL));i++)blocked[j*nx+i]=1;
      }
      out[name]={...grid,blocked};
    }
    this.levelGrids.set(level,out);return out;
  }
  // Occupancy grids (one per tier width) + a "wall proximity" count used to
  // keep lanes centred in their corridor.
  _grids() {
    const nx = Math.ceil(this.side / CELL) + 1;
    const ny = nx;
    const rects = [];
    for (const e of this.by.values()) {
      rects.push({ x: e.ground.x - e.half.w, y: e.ground.z - e.half.d, w: e.half.w * 2, h: e.half.d * 2 });
    }
    const grids = {};
    for (const t of TIERS) {
      const rad = t.width / 2 + CLEAR;
      const blocked = new Uint8Array(nx * ny);
      for (const r of rects) {
        const i0 = Math.max(0, Math.floor((r.x - rad) / CELL));
        const i1 = Math.min(nx - 1, Math.ceil((r.x + r.w + rad) / CELL));
        const j0 = Math.max(0, Math.floor((r.y - rad) / CELL));
        const j1 = Math.min(ny - 1, Math.ceil((r.y + r.h + rad) / CELL));
        for (let j = j0; j <= j1; j++) {
          const py = (j + 0.5) * CELL;
          for (let i = i0; i <= i1; i++) {
            const px = (i + 0.5) * CELL;
            if (pointRectDist(px, py, r) < rad) blocked[j * nx + i] = 1;
          }
        }
      }
      const near = new Uint8Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          let c = 0;
          for (let dj = -2; dj <= 2; dj++) {
            for (let di = -2; di <= 2; di++) {
              if (!di && !dj) continue;
              const x = i + di; const y = j + dj;
              if (x < 0 || y < 0 || x >= nx || y >= ny) { c += 1; continue; }
              if (blocked[y * nx + x]) c += 1;
            }
          }
          near[j * nx + i] = c;
        }
      }
      grids[t.name] = { nx, ny, blocked, near, rad };
    }
    return grids;
  }

  _nearestFree(grid, x, y) {
    const { nx, ny, blocked } = grid;
    const ci = Math.min(nx - 1, Math.max(0, Math.floor(x / CELL)));
    const cj = Math.min(ny - 1, Math.max(0, Math.floor(y / CELL)));
    const inside=(i,j)=>!grid.bounds||((i+.5)*CELL>=grid.bounds.x&&(j+.5)*CELL>=grid.bounds.y&&(i+.5)*CELL<=grid.bounds.x+grid.bounds.w&&(j+.5)*CELL<=grid.bounds.y+grid.bounds.h);
    if (!blocked[cj * nx + ci]&&inside(ci,cj)) return [ci, cj];
    for (let r = 1; r <= 24; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di; const j = cj + dj;
          if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
          if (!blocked[j * nx + i]&&inside(i,j)) return [i, j];
        }
      }
    }
    return null;
  }

  // A* over the orthogonal grid with a turn penalty, returning cell centres.
  _route(grid, start, goal) {
    const { nx, ny, blocked, near } = grid;
    const si = start[0] + start[1] * nx;
    const gi = goal[0] + goal[1] * nx;
    if (blocked[si] || blocked[gi]) return null;
    const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const g = new Map();
    const came = new Map();
    const heur = (i, j) => Math.abs(i - goal[0]) + Math.abs(j - goal[1]);
    const heap = new Heap();
    const startKey = si * 4; // dir ignored at start
    g.set(startKey, 0);
    heap.push({ k: startKey, i: start[0], j: start[1], d: -1, f: heur(start[0], start[1]) });
    let expansions = 0;
    let endKey = -1;
    while (heap.size) {
      const cur = heap.pop();
      if (cur.i === goal[0] && cur.j === goal[1]) { endKey = cur.k; break; }
      if (++expansions > MAX_EXPANSIONS) break;
      const cg = g.get(cur.k);
      for (let d = 0; d < 4; d++) {
        const ni = cur.i + DIRS[d][0];
        const nj = cur.j + DIRS[d][1];
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        if(grid.bounds&&((ni+.5)*CELL<grid.bounds.x||(nj+.5)*CELL<grid.bounds.y||(ni+.5)*CELL>grid.bounds.x+grid.bounds.w||(nj+.5)*CELL>grid.bounds.y+grid.bounds.h))continue;
        const idx = nj * nx + ni;
        if (blocked[idx]) continue;
        const turn = cur.d === -1 || cur.d === d ? 0 : 0.6;
        const step = 1 + turn + near[idx] * 0.05;
        const nk = idx * 4 + d;
        const ng = cg + step;
        if (g.has(nk) && g.get(nk) <= ng) continue;
        g.set(nk, ng);
        came.set(nk, cur.k);
        heap.push({ k: nk, i: ni, j: nj, d, g: ng, f: ng + heur(ni, nj) * 1.0 });
      }
    }
    if (endKey < 0) return null;
    const cells = [];
    let k = endKey;
    while (k !== undefined) {
      const idx = (k / 4) | 0;
      cells.push([idx % nx, (idx / nx) | 0]);
      if (k === startKey) break;
      k = came.get(k);
    }
    cells.reverse();
    // merge collinear runs
    const pts = [];
    for (let n = 0; n < cells.length; n++) {
      if (n > 0 && n < cells.length - 1) {
        const a = cells[n - 1]; const b = cells[n]; const c = cells[n + 1];
        if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) continue;
      }
      pts.push(new Point3((cells[n][0] + 0.5) * CELL, STREET_Y, (cells[n][1] + 0.5) * CELL));
    }
    return pts;
  }

  _edgePoints(r) {
    const ea = this.by.get(r.a);
    const eb = this.by.get(r.b);
    if (!ea || !eb) return null;
    return { ea, eb };
  }

  // Try each tier from `tierIdx` down to the narrowest until a path is found.
  _routeEdge(r, grids, tierIdx) {
    const ends = this._edgePoints(r);
    if (!ends) return null;
    const { ea, eb } = ends;
    const a = ea.ground;
    const b = eb.ground;
    if (a.distanceTo(b) < 0.6) return null;
    for (let ti = tierIdx; ti < TIERS.length; ti++) {
      const t = TIERS[ti];
      const grid = {...grids[t.name],bounds:ea.packageRect};
      const start = this._nearestFree(grid, a.x, a.z);
      const goal = this._nearestFree(grid, b.x, b.z);
      if (!start || !goal) continue;
      const mid = this._route(grid, start, goal);
      if (!mid || !mid.length) continue;
      // run the lane at the higher platform level of the two buildings
      const level = Math.max(a.y, b.y);
      for (const p of mid) p.y = level;
      // orthogonal connectors from each building face to the first/last cells
      const head = connectOrtho(a, ea.half, mid[0], level);
      const tail = connectOrtho(b, eb.half, mid[mid.length - 1], level);
      const pts = [...head];
      for (let n = 1; n < mid.length; n++) pts.push(mid[n]);
      for (let n = tail.length - 2; n >= 0; n--) pts.push(tail[n]);
      // dedupe and snap near-axis segments so every lane is orthogonal
      const clean = [];
      for (const p of pts) {
        const q = p.clone();
        if (clean.length) {
          const prev = clean[clean.length - 1];
          const ddx = Math.abs(q.x - prev.x);
          const ddz = Math.abs(q.z - prev.z);
          if (ddx < 1e-6 && ddz < 1e-6) continue;
          if (ddx < 0.08 && ddz > ddx) q.x = prev.x;
          else if (ddz < 0.08 && ddx > ddz) q.z = prev.z;
        }
        clean.push(q);
      }
      if (clean.length >= 2) return { tier: t, pts: clean };
    }
    // Keep the dependency in the model, but omit a road with no clear route.
    return null;
  }


  routePlan(limit=2500) {
    this.levelGrids.clear();
    const grids=this.model.roads.length?this._grids():{},paths=[],unroutedEdges=[];
    for(const [index,r] of [...this.model.roads].sort((a,b)=>b.weight-a.weight).entries()){
      const ends=this._edgePoints(r);let reason;
      if(index>=limit)reason='Drawing budget (2,500 links)';
      else if(!ends)reason='Missing endpoint';
      else if(Math.abs(ends.ea.ground.y-ends.eb.ground.y)>.01)reason='Different terrace levels; use dependency inspector';
      else if(ends.ea.district&&ends.eb.district&&ends.ea.district!==ends.eb.district)reason='Package boundary; use dependency inspector';
      const res=reason?null:this._routeEdge(r,this._atLevel(grids,ends.ea.ground.y-STREET_Y),tierIndexFor(r.weight));
      if(!res)unroutedEdges.push({...r,reason:reason||'No clear street route'});
      else paths.push({pts:res.pts,width:res.tier.width,tier:res.tier.name,weight:r.weight,a:r.a,b:r.b});
    }
    const sharedPaths=sharedConnections(unroutedEdges,this.by);
    const represented=new Set(sharedPaths.flatMap(p=>p.edges));
    return {paths:[...paths,...sharedPaths],unroutedEdges:unroutedEdges.filter(e=>!represented.has(e))};
  }
}
export {TIERS,tierIndexFor};
