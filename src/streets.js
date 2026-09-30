import * as THREE from 'three';
import { roadTexture, streetTexture } from './textures.js';

// ---------------------------------------------------------------------------
// Street network: dependency edges routed as orthogonal (grid-aligned) lanes
// that avoid building footprints, with pedestrians walking each lane.
//
// Routing works on a fine world-axis grid. A cell is "blocked" for a given
// street width if its centre is closer to a building than width/2 + CLEAR, so
// a path found on the grid is guaranteed not to intersect a building. A short
// fallback ladder (wider -> narrower) is tried per edge.
// ---------------------------------------------------------------------------

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

// Distance from a box centre to its boundary along `dir`.
function boxExit(half, dir) {
  const tx = Math.abs(dir.x) > 1e-4 ? half.w / Math.abs(dir.x) : Infinity;
  const tz = Math.abs(dir.z) > 1e-4 ? half.d / Math.abs(dir.z) : Infinity;
  return Math.min(tx, tz);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Orthogonal connector from a building rectangle to a grid point `g`:
// [point on the face, optional elbow, g] - all three axis-aligned.
function connectOrtho(center, half, g, y = STREET_Y) {
  const cx = clamp(g.x, center.x - half.w, center.x + half.w);
  const cz = clamp(g.z, center.z - half.d, center.z + half.d);
  const cp = new THREE.Vector3(cx, y, cz);
  const dx = Math.abs(g.x - cx);
  const dz = Math.abs(g.z - cz);
  if (dx < 1e-3 || dz < 1e-3) return [cp, g.clone()];
  const outside = (p) => (
    p.x < center.x - half.w - 1e-3 || p.x > center.x + half.w + 1e-3
    || p.z < center.z - half.d - 1e-3 || p.z > center.z + half.d + 1e-3
  );
  const e1 = new THREE.Vector3(g.x, y, cz);
  const elbow = outside(e1) ? e1 : new THREE.Vector3(cx, y, g.z);
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

export class StreetNetwork {
  constructor(model, byBuilding, side, hash01) {
    this.model = model;
    this.by = byBuilding;
    this.side = side;
    this.hash01 = hash01;
    this.group = new THREE.Group();
    this.walkerGroup = new THREE.Group();
    this.focusGroup = new THREE.Group();
    this.walkers = [];
    this.walkerMesh = null;
    this.focusWalkers = [];
    this.focusWalkerMesh = null;
    this.mode = 'all';      // all | selected | off
    this.focusId = null;
    this._mats = [];
    this._focusMats = [];
    this._tex = {
      road2: roadTexture(2),
      road4: roadTexture(4),
      street: streetTexture(),
      alley: streetTexture(),
    };
    this.tiers = TIERS;
    this._built = false;
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
    if (!blocked[cj * nx + ci]) return [ci, cj];
    for (let r = 1; r <= 24; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di; const j = cj + dj;
          if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
          if (!blocked[j * nx + i]) return [i, j];
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
      pts.push(new THREE.Vector3((cells[n][0] + 0.5) * CELL, STREET_Y, (cells[n][1] + 0.5) * CELL));
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
      const grid = grids[t.name];
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
    // last resort: orthogonal L between the two building faces
    const t = TIERS[TIERS.length - 1];
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.8) return null;
    dir.divideScalar(len);
    const level = Math.max(a.y, b.y);
    const p0 = a.clone().addScaledVector(dir, Math.min(boxExit(ea.half, dir), len * 0.45));
    const p1 = b.clone().addScaledVector(dir, -Math.min(boxExit(eb.half, dir), len * 0.45));
    p0.y = level; p1.y = level;
    const elbow = new THREE.Vector3(p1.x, level, p0.z);
    return { tier: t, pts: [p0, elbow, p1] };
  }

  build() {
    const grids = this._grids();
    const paths = [];
    for (const r of this.model.roads) {
      const idx = tierIndexFor(r.weight);
      const res = this._routeEdge(r, grids, idx);
      if (!res) continue;
      paths.push({ pts: res.pts, width: res.tier.width, tier: res.tier.name, weight: r.weight, a: r.a, b: r.b });
    }
    this.paths = paths;
    // building id -> incident path indices (relationship-on-demand)
    this._index = new Map();
    paths.forEach((p, i) => {
      for (const id of [p.a, p.b]) {
        if (!this._index.has(id)) this._index.set(id, []);
        this._index.get(id).push(i);
      }
    });
    this._meshFromPaths(paths, this.group, this._mats);
    this._buildWalkers(paths);
    this._refreshVisibility();
    this._built = true;
  }

  // Merge a set of paths into per-tier ribbon meshes added to `group`.
  _meshFromPaths(paths, group, matsArr) {
    const buckets = new Map();
    for (const p of paths) {
      if (!buckets.has(p.tier)) buckets.set(p.tier, { pos: [], uv: [], idx: [], count: 0 });
      this._emitQuads(buckets.get(p.tier), p.pts, p.width);
    }
    for (const [name, bk] of buckets) {
      if (!bk.count) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(bk.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(bk.uv, 2));
      geo.setIndex(bk.idx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        map: this._tex[name],
        roughness: 0.92,
        metalness: 0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      group.add(mesh);
      matsArr.push(mat);
    }
    return group;
  }

  _emitQuads(bk, pts, width) {
    const hw = width / 2;
    let acc = 0;
    const nrm = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const L = Math.hypot(dx, dz);
      if (L < 1e-4) continue;
      const ux = dx / L;
      const uz = dz / L;
      const nx = -uz;
      const nz = ux;
      const y = p0.y;
      // extend each end by hw so corners are filled by the overlap
      const a = new THREE.Vector3(p0.x - ux * hw, y, p0.z - uz * hw);
      const b = new THREE.Vector3(p1.x + ux * hw, y, p1.z + uz * hw);
      const base = bk.count;
      bk.pos.push(
        a.x + nx * hw, y, a.z + nz * hw,
        b.x + nx * hw, y, b.z + nz * hw,
        b.x - nx * hw, y, b.z - nz * hw,
        a.x - nx * hw, y, a.z - nz * hw,
      );
      const u0 = acc / TILE;
      const u1 = (acc + L + hw) / TILE;
      bk.uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
      bk.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      bk.count += 4;
      acc += L + hw;
    }
  }

  _makeWalkerMesh(paths) {
    const walkers = [];
    for (const p of paths) {
      const pts = p.pts;
      const cum = [0];
      let total = 0;
      for (let i = 1; i < pts.length; i++) { total += pts[i].distanceTo(pts[i - 1]); cum.push(total); }
      if (total < 1) continue;
      const count = Math.min(6, Math.max(1, Math.round(p.weight)));
      const spread = Math.max(0.2, p.width - 0.2);
      for (let k = 0; k < count; k++) {
        const seed = p.a + p.b + k;
        walkers.push({
          pts, cum, total, baseY: pts[0].y,
          d: this.hash01(seed) * total,
          speed: 1.8 + 2.2 * this.hash01(seed + 's'),
          dir: (k % 2) ? -1 : 1,
          off: (this.hash01(seed + 'o') - 0.5) * spread,
        });
      }
    }
    if (!walkers.length) return null;
    const geo = new THREE.CapsuleGeometry(0.11, 0.34, 4, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: '#f4d9b0', emissive: new THREE.Color('#ffbf73'), emissiveIntensity: 0.35,
      roughness: 0.8, metalness: 0,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, walkers.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    return { mesh, walkers };
  }

  _buildWalkers(paths) {
    const wm = this._makeWalkerMesh(paths);
    if (!wm) return;
    this.walkerGroup.add(wm.mesh);
    this.walkerMesh = wm.mesh;
    this.walkers = wm.walkers;
    this._stepWalkers(this.walkers, this.walkerMesh, 0);
  }

  // --- relationship-on-demand ---------------------------------------------
  setMode(mode) {
    this.mode = mode;
    this._refreshVisibility();
  }

  setFocus(id) {
    id = id || null;
    if (id === this.focusId && this._built) { this._refreshVisibility(); return; }
    this.focusId = id;
    for (const c of [...this.focusGroup.children]) {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    this.focusGroup.clear();
    this._focusMats = [];
    this.focusWalkers = [];
    this.focusWalkerMesh = null;
    if (this.focusId && this._index && this._index.has(this.focusId)) {
      const subset = this._index.get(this.focusId).map((i) => this.paths[i]);
      this._meshFromPaths(subset, this.focusGroup, this._focusMats);
      const wm = this._makeWalkerMesh(subset);
      if (wm) {
        this.focusGroup.add(wm.mesh);
        this.focusWalkerMesh = wm.mesh;
        this.focusWalkers = wm.walkers;
        this._stepWalkers(this.focusWalkers, this.focusWalkerMesh, 0);
      }
    }
    this._refreshVisibility();
  }

  _refreshVisibility() {
    const showAll = this.mode === 'all';
    this.group.visible = showAll;
    this.walkerGroup.visible = showAll;
    this.focusGroup.visible = this.mode === 'selected' && !!this.focusId;
  }

  _pointAt(w) {
    const t = Math.min(Math.max(w.d, 0), w.total);
    let i = 1;
    while (i < w.cum.length && w.cum[i] < t) i++;
    i = Math.min(i, w.cum.length - 1);
    const seg = w.cum[i] - w.cum[i - 1] || 1;
    const f = (t - w.cum[i - 1]) / seg;
    const p0 = w.pts[i - 1];
    const p1 = w.pts[i];
    const dx = p1.x - p0.x; const dz = p1.z - p0.z;
    const L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L; const nz = dx / L;
    return {
      x: p0.x + dx * f + nx * w.off,
      z: p0.z + dz * f + nz * w.off,
    };
  }

  _stepWalkers(list, mesh, dt) {
    if (!mesh || !list.length) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      w.d += dt * w.speed * w.dir;
      if (w.d >= w.total) { w.d = w.total; w.dir = -1; }
      else if (w.d <= 0) { w.d = 0; w.dir = 1; }
      const p = this._pointAt(w);
      m.makeTranslation(p.x, (w.baseY || STREET_Y) + 0.3, p.z);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    if (this.walkerGroup.visible) this._stepWalkers(this.walkers, this.walkerMesh, dt);
    if (this.focusGroup.visible) this._stepWalkers(this.focusWalkers, this.focusWalkerMesh, dt);
  }

  setVisible(v) {
    this._refreshVisibility();
  }

  dispose() {
    for (const child of [...this.group.children, ...this.walkerGroup.children, ...this.focusGroup.children]) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    this.group.clear();
    this.walkerGroup.clear();
    this.focusGroup.clear();
    this.walkerMesh = null;
    this.focusWalkerMesh = null;
    this.walkers = [];
    this.focusWalkers = [];
    this._mats = [];
    this._focusMats = [];
  }
}
