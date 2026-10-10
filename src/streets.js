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

import {StreetRouter,STREET_Y,TIERS} from './routing.js';
import {sharedConnections} from './connections.js';
export {STREET_Y} from './routing.js';
const TILE=6;
function disposeObject(object) {
  object.traverse(child=>{child.geometry?.dispose();if(Array.isArray(child.material))child.material.forEach(m=>m.dispose());else child.material?.dispose();child.dispose?.();});
}

export class StreetNetwork extends StreetRouter {
  constructor(model, byBuilding, side, hash01,terraces=[]) {
    super(model,byBuilding,side,terraces);
    this.paths=[];this.unroutedEdges=[];this.unrouted=model.roads.length;
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
    this.mode = 'selected';      // all | selected | off
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

  build() {this._applyPlan(this.routePlan());}

  buildAsync() {
    if(!this.model.roads.length||typeof Worker==='undefined'){this.build();return Promise.resolve();}
    const worker=new Worker(new URL('./routing-worker.js',import.meta.url),{type:'module'});this.worker=worker;
    return new Promise((resolve,reject)=>{
      this._resolveWorker=resolve;
      const finish=reason=>{clearTimeout(this._workerTimer);worker.terminate();this.worker=null;if(!this._disposed){this._applyPlan({paths:[],unroutedEdges:this.model.roads.map(r=>({...r,reason}))});window.dispatchEvent(new CustomEvent('routingerror',{detail:reason}));}resolve();};
      this._workerTimer=setTimeout(()=>finish('Street routing timed out; dependencies remain available in the inspector.'),45000);
      worker.onmessage=e=>{clearTimeout(this._workerTimer);worker.terminate();this.worker=null;if(e.data.error){finish(e.data.error);return;}if(!this._disposed)this._applyPlan(e.data);resolve();};
      worker.onerror=e=>finish(e.message||'Street routing failed.');
      worker.postMessage({roads:this.model.roads,side:this.side,terraces:this.terraces,buildings:[...this.by].map(([id,e])=>({id,ground:{x:e.ground.x,y:e.ground.y,z:e.ground.z},half:e.half,roofY:e.roofY,district:e.district,packageRect:e.packageRect}))});
    });
  }

  _applyPlan({paths,unroutedEdges}) {
    // Retain grouped evidence for the inspector, without floating city roads.
    if(unroutedEdges.length){paths=[...paths,...sharedConnections(unroutedEdges,this.by)];unroutedEdges=unroutedEdges.filter(e=>!this.by.has(e.a)||!this.by.has(e.b));}
    for(const p of paths)p.pts=p.pts.map(v=>new THREE.Vector3(v.x,v.y,v.z));
    this.paths=paths;this.unroutedEdges=unroutedEdges;this.unrouted=unroutedEdges.length;
    this._meshFromPaths(paths, this.group, this._mats);
    this._buildWalkers(paths);
    this._refreshVisibility();
    this._built = true;
    this._visibleKey=null;
    if(this.visibleIds)this.setVisibleBuildings(this.visibleIds);
    this.setFocus(this.focusId,true);
    window.dispatchEvent(new CustomEvent('streetsready',{detail:this}));
  }

  // Merge a set of paths into per-tier ribbon meshes added to `group`.
  _meshFromPaths(paths, group, matsArr) {
    const buckets = new Map();
    for (const p of paths) {
      if(p.shared || p.tier==='direct') continue;
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
      if(p.shared || p.tier==='direct') continue;
      const pts = p.pts;
      const cum = [0];
      let total = 0;
      for (let i = 1; i < pts.length; i++) { total += pts[i].distanceTo(pts[i - 1]); cum.push(total); }
      if (total < 1) continue;
      const count = Math.min(p.shared?48:6, Math.max(1, Math.round(p.shared?Math.log2(1+p.weight)*4:p.weight)));
      const spread = Math.max(0.2, p.width - 0.2);
      for (let k = 0; k < count; k++) {
        const seed = p.a + p.b + k;
        walkers.push({
          a: p.a, b: p.b, shared:!!p.shared,
          pts, cum, total, baseY: pts[0].y,
          d: this.hash01(seed) * total,
          speed: 1.8 + 2.2 * this.hash01(seed + 's'),
          dir: p.shared||p.tier==='direct'?1:(k % 2) ? -1 : 1,
          directed:p.shared||p.tier==='direct',
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

  setVisibleBuildings(ids) {
    const key = [...ids].join('\n');
    if (key === this._visibleKey) return;
    this._visibleKey = key;
    this.visibleIds = ids;
    for (const group of [this.group, this.walkerGroup]) {
      for (const child of group.children) {
        disposeObject(child);
      }
      group.clear();
    }
    this._mats = [];
    this.walkers = [];
    this.walkerMesh = null;
    const paths = this.paths.filter(p=>!p.shared&&ids.has(p.a)&&ids.has(p.b));
    for(const p of paths)p.pts=p.pts.map(v=>new THREE.Vector3(v.x,v.y,v.z));
    this._meshFromPaths(paths, this.group, this._mats);
    this._buildWalkers(paths);
    this.setFocus(this.focusId, true);
  }

  // --- relationship-on-demand ---------------------------------------------
  setMode(mode) {
    this.mode = mode;
    this._refreshVisibility();
  }

  setFocus(id, force = false) {
    id = id || null;
    if (!force && id === this.focusId && this._built) { this._refreshVisibility(); return; }
    this.focusId = id;
    for (const c of [...this.focusGroup.children]) {
      disposeObject(c);
    }
    this.focusGroup.clear();
    this._focusMats = [];
    this.focusWalkers = [];
    this.focusWalkerMesh = null;
    this._refreshVisibility();
  }

  _refreshVisibility() {
    const showAll = this.mode === 'all';
    this.group.visible = showAll;
    this.walkerGroup.visible = showAll;
    this.focusGroup.visible = this.mode !== 'off' && !!this.focusId;
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
      y:p0.y+(p1.y-p0.y)*f,
    };
  }

  _stepWalkers(list, mesh, dt) {
    if (!mesh || !list.length) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      w.d += dt * w.speed * w.dir;
      if (w.d >= w.total) { w.d = w.directed?0:w.total; if(!w.directed)w.dir = -1; }
      else if (w.d <= 0) { w.d = 0; w.dir = 1; }
      const p = this._pointAt(w);
      m.makeTranslation(p.x, p.y + 0.3, p.z);
      // Focus pedestrians replace the originals on incident paths, avoiding duplicates.
      if (mesh === this.walkerMesh && !w.shared && this.focusId && (w.a === this.focusId || w.b === this.focusId)) m.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    if (this.walkerGroup.visible) this._stepWalkers(this.walkers, this.walkerMesh, dt);
    if (this.focusGroup.visible) this._stepWalkers(this.focusWalkers, this.focusWalkerMesh, dt);
  }

  setVisible(v) {
    this.setMode(v ? 'all' : 'off');
  }

  dispose() {
    this._disposed=true;clearTimeout(this._workerTimer);this.worker?.terminate();this.worker=null;this._resolveWorker?.();
    for (const child of [...this.group.children, ...this.walkerGroup.children, ...this.focusGroup.children]) {
      disposeObject(child);
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
