import * as THREE from 'three';
import { treemap, inset } from './layout.js';
import {
  METRICS, locColor, heatColor, districtHue, norm, heightFor, hash01,
} from './metrics.js';
import { facadeTextures, applyWindowUV, roadTexture, streetTexture } from './textures.js';

const GROUND_SIZE = 260;
const STREET_Y = 0.66;
const STREET_TILE = 6;
const HOVER = new THREE.Color('#38bdf8');
const SELECT = new THREE.Color('#f8fafc');

// Distance from a box centre to its boundary along `dir` (for trimming streets
// so they start at the edge of a building instead of under it).
function boxExit(half, dir) {
  const tx = Math.abs(dir.x) > 1e-4 ? half.w / Math.abs(dir.x) : Infinity;
  const tz = Math.abs(dir.z) > 1e-4 ? half.d / Math.abs(dir.z) : Infinity;
  return Math.min(tx, tz);
}

export class City {
  constructor(model, scene, { onHover } = {}) {
    this.model = model;
    this.scene = scene;
    this.onHover = onHover;
    this.mapping = { height: 'nom', footprint: 'noa', color: 'loc' };
    this.raycaster = new THREE.Raycaster();

    this.root = new THREE.Group();
    scene.add(this.root);

    this.platesGroup = new THREE.Group();
    this.buildingGroup = new THREE.Group();
    this.roadGroup = new THREE.Group();
    this.walkerGroup = new THREE.Group();
    this.root.add(this.buildingGroup, this.platesGroup, this.roadGroup, this.walkerGroup);

    this.pickables = [];
    this.byBuilding = new Map();
    this.buildingMeshes = new Map();
    this.selected = null;
    this.hoveredId = null;
    this._facade = facadeTextures();
    this._streetTex = {
      road2: roadTexture(2),
      road4: roadTexture(4),
      street: streetTexture(),
      alley: streetTexture(),
    };
    this._streetMats = [];
    this._walkers = [];
    this.walkerMesh = null;

    this._computeDegrees();
    this.rebuild();
  }

  _computeDegrees() {
    const deg = new Map();
    for (const b of this.model.buildings) deg.set(b.id, 0);
    for (const r of this.model.roads) {
      deg.set(r.a, (deg.get(r.a) || 0) + r.weight);
      deg.set(r.b, (deg.get(r.b) || 0) + r.weight);
    }
    for (const b of this.model.buildings) b.deps = deg.get(b.id) || 0;
  }

  setMapping(mapping) {
    this.mapping = { ...this.mapping, ...mapping };
    this.rebuild();
  }

  setRoadsVisible(v) {
    this.roadGroup.visible = v;
    this.walkerGroup.visible = v;
  }

  // Walk the pedestrians back and forth along their street.
  update(dt) {
    if (!this.walkerMesh || !this._walkers.length) return;
    const m = new THREE.Matrix4();
    const y = STREET_Y + 0.3;
    for (let i = 0; i < this._walkers.length; i++) {
      const w = this._walkers[i];
      w.t += (dt * w.speed * w.dir) / Math.max(w.len, 0.5);
      if (w.t >= 1) { w.t = 1; w.dir = -1; }
      else if (w.t <= 0) { w.t = 0; w.dir = 1; }
      m.makeTranslation(
        w.s0.x + (w.s1.x - w.s0.x) * w.t + w.nx * w.off,
        y,
        w.s0.z + (w.s1.z - w.s0.z) * w.t + w.nz * w.off,
      );
      this.walkerMesh.setMatrixAt(i, m);
    }
    this.walkerMesh.instanceMatrix.needsUpdate = true;
  }

  _disposeGroup(group) {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      // NOTE: building materials share the facade atlas and streets share the
      // cached road/street textures, so we only dispose the material wrappers
      // here - never the textures.
      if (o.material) o.material.dispose();
    });
    group.clear();
  }

  rebuild() {
    this._disposeGroup(this.buildingGroup);
    this._disposeGroup(this.platesGroup);
    this._disposeGroup(this.roadGroup);
    this._disposeGroup(this.walkerGroup);
    this.walkerMesh = null;
    this._walkers = [];
    this.pickables = [];
    this.byBuilding.clear();
    this.buildingMeshes.clear();
    this.selected = null;
    this.hoveredId = null;
    this._streetMats = [];
    this._plateMats = [];

    const buildings = this.model.buildings;
    const hKey = this.mapping.height;
    const fKey = this.mapping.footprint;
    const cKey = this.mapping.color;

    const hMax = Math.max(1, ...buildings.map((b) => METRICS[hKey].get(b)));
    const cVals = buildings.map((b) => METRICS[cKey].get(b));
    const cMax = Math.max(1, ...cVals);
    const cMin = Math.min(...cVals);

    const districtAgg = new Map();
    for (const b of buildings) {
      const d = b.district;
      if (!districtAgg.has(d)) districtAgg.set(d, { key: d, value: 0, buildings: [] });
      const a = districtAgg.get(d);
      a.value += Math.max(METRICS[fKey].get(b), 1);
      a.buildings.push(b);
    }
    const districts = [...districtAgg.values()].sort((a, b2) => a.key.localeCompare(b2.key));

    const side = Math.min(GROUND_SIZE, Math.max(80, Math.sqrt(buildings.length) * 11));
    const placedDistricts = treemap(districts, { x: 0, y: 0, w: side, h: side });

    placedDistricts.forEach((pd, di) => {
      const dColor = districtHue(di, 1);
      const inner = inset(pd.rect, Math.min(2.6, Math.min(pd.rect.w, pd.rect.h) * 0.07));

      if (inner.w > 1 && inner.h > 1) {
        // curb (slightly larger, darker) + plate
        const curbGeo = new THREE.BoxGeometry(inner.w + 1.0, 0.35, inner.h + 1.0);
        const curbMat = new THREE.MeshStandardMaterial({
          color: dColor.clone().multiplyScalar(0.5), roughness: 1, metalness: 0,
        });
        const curb = new THREE.Mesh(curbGeo, curbMat);
        curb.position.set(inner.x + inner.w / 2, 0.18, inner.y + inner.h / 2);
        curb.receiveShadow = true;
        curb.userData.district = pd.item.key;
        this.platesGroup.add(curb);

        const plateGeo = new THREE.BoxGeometry(inner.w, 0.4, inner.h);
        const plateMat = new THREE.MeshStandardMaterial({
          color: dColor.clone().multiplyScalar(0.72),
          roughness: 0.98, metalness: 0,
          transparent: true, opacity: 0.92,
        });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.position.set(inner.x + inner.w / 2, 0.42, inner.y + inner.h / 2);
        plate.receiveShadow = true;
        plate.userData.district = pd.item.key;
        this.platesGroup.add(plate);
        this._plateMats.push(plateMat, curbMat);
      }

      const pad = Math.min(1.4, Math.min(inner.w, inner.h) * 0.035);
      const buildingArea = inset(inner, pad);
      if (buildingArea.w <= 0.5 || buildingArea.h <= 0.5) return;
      const placed = treemap(
        pd.item.buildings.map((b) => ({ value: Math.max(METRICS[fKey].get(b), 1), b })),
        buildingArea
      );
      for (const { item, rect } of placed) {
        this._addBuilding(item.b, rect, { hKey, cKey, hMax, cMin, cMax });
      }
    });

    this._buildStreets();
    this._buildWalkers();
    this.root.position.set(-side / 2, 0, -side / 2);
    this.groundSide = side;
  }

  _addBuilding(b, rect, { hKey, cKey, hMax, cMin, cMax }) {
    const group = new THREE.Group();

    const w = Math.max(rect.w * 0.84, 0.6);
    const d = Math.max(rect.h * 0.84, 0.6);
    const hVar = 0.86 + 0.28 * hash01(b.id + 'h');
    const h = Math.max(3.2, heightFor(METRICS[hKey].get(b), hMax) * hVar);

    const t = norm(METRICS[cKey].get(b), cMin, cMax);
    const color = cKey === 'loc' ? locColor(t) : heatColor(t);

    // plain box building
    const geo = new THREE.BoxGeometry(w, h, d);
    applyWindowUV(geo, w, h);
    const mat = new THREE.MeshStandardMaterial({
      color,
      map: this._facade.map,
      emissiveMap: this._facade.emissiveMap,
      emissive: new THREE.Color('#ffd79a'),
      emissiveIntensity: 0,
      roughness: 0.72,
      metalness: 0.08,
    });
    mat.userData.window = true;
    mat.userData.baseEmissive = new THREE.Color('#ffd79a');
    mat.userData.baseIntensity = 0;

    const body = new THREE.Mesh(geo, mat);
    body.position.y = 0.62 + h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.buildingId = b.id;
    group.add(body);
    this.pickables.push(body);

    group.position.set(rect.x + rect.w / 2, 0, rect.y + rect.h / 2);
    this.buildingGroup.add(group);
    this.byBuilding.set(b.id, {
      group, materials: [mat], building: b,
      center: new THREE.Vector3(rect.x + rect.w / 2, 0.62 + h / 2, rect.y + rect.h / 2),
      ground: new THREE.Vector3(rect.x + rect.w / 2, STREET_Y, rect.y + rect.h / 2),
      half: { w: w / 2, d: d / 2 },
    });
    this.buildingMeshes.set(b.id, group);
  }

  _apply(id, color, intensity, force) {
    const e = this.byBuilding.get(id);
    if (!e) return;
    for (const m of e.materials) {
      if (m.userData.window && !force && color === null) continue;
      m.emissive.copy(color || m.userData.baseEmissive);
      m.emissiveIntensity = color ? intensity : m.userData.baseIntensity;
    }
  }

  _restore(id) {
    const e = this.byBuilding.get(id);
    if (!e) return;
    for (const m of e.materials) {
      m.emissive.copy(m.userData.baseEmissive);
      m.emissiveIntensity = m.userData.baseIntensity;
    }
  }

  hover(ndc, camera) {
    this.raycaster.setFromCamera(ndc, camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    const hit = hits.length ? hits[0].object : null;
    const id = hit ? hit.userData.buildingId : null;

    if (this.hoveredId && this.hoveredId !== id) {
      if (this.hoveredId !== (this.selected && this.selected.userData.buildingId)) {
        this._restore(this.hoveredId);
      } else {
        this._apply(this.hoveredId, SELECT, 0.5, true);
      }
    }
    if (id && id !== this.hoveredId && id !== (this.selected && this.selected.userData.buildingId)) {
      this._apply(id, HOVER, 0.45, true);
    }
    this.hoveredId = id;
    if (this.onHover) this.onHover(id ? this.byBuilding.get(id).building : null, hit);
    return hit;
  }

  select(hit) {
    const prev = this.selected && this.selected.userData.buildingId;
    if (prev) this._restore(prev);
    this.selected = hit || null;
    if (!this.selected) return null;
    this._apply(this.selected.userData.buildingId, SELECT, 0.5, true);
    const e = this.byBuilding.get(this.selected.userData.buildingId);
    return e ? e.building : null;
  }

  // Trimmed ground segment for one dependency edge: starts at the edge of A's
  // footprint and ends at the edge of B's, offset sideways so parallel edges
  // do not stack exactly on top of each other.
  _edgeSegment(r) {
    const ea = this.byBuilding.get(r.a);
    const eb = this.byBuilding.get(r.b);
    if (!ea || !eb) return null;
    const p0 = ea.ground;
    const p1 = eb.ground;
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const len = dir.length();
    if (len < 0.4) return null;
    dir.divideScalar(len);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const off = (hash01(r.a + r.b + r.kind) - 0.5) * 0.55;
    const t0 = Math.min(boxExit(ea.half, dir), len * 0.45);
    const t1 = Math.min(boxExit(eb.half, dir), len * 0.45);
    const s0 = p0.clone().addScaledVector(dir, t0).addScaledVector(side, off);
    const s1 = p1.clone().addScaledVector(dir, -t1).addScaledVector(side, off);
    if (s0.distanceTo(s1) < 0.5) return null;
    return { s0, s1 };
  }

  // weight -> street tier (roads are widest with yellow lanes, alleys narrowest)
  _tier(weight) {
    if (weight >= 12) return { name: 'road4', width: 2.8 };
    if (weight >= 8) return { name: 'road2', width: 2.1 };
    if (weight >= 3) return { name: 'street', width: 1.1 };
    return { name: 'alley', width: 0.6 };
  }

  _buildStreets() {
    const buckets = new Map();
    for (const r of this.model.roads) {
      const seg = this._edgeSegment(r);
      if (!seg) continue;
      const tier = this._tier(r.weight);
      if (!buckets.has(tier.name)) {
        buckets.set(tier.name, { width: tier.width, pos: [], uv: [], idx: [], count: 0 });
      }
      const bk = buckets.get(tier.name);
      const { s0, s1 } = seg;
      const dx = s1.x - s0.x;
      const dz = s1.z - s0.z;
      const L = Math.hypot(dx, dz);
      const nx = -dz / L;
      const nz = dx / L;
      const hw = tier.width / 2;
      const uEnd = L / STREET_TILE;
      const base = bk.count;
      bk.pos.push(
        s0.x + nx * hw, STREET_Y, s0.z + nz * hw,
        s1.x + nx * hw, STREET_Y, s1.z + nz * hw,
        s1.x - nx * hw, STREET_Y, s1.z - nz * hw,
        s0.x - nx * hw, STREET_Y, s0.z - nz * hw,
      );
      bk.uv.push(0, 0, uEnd, 0, uEnd, 1, 0, 1);
      bk.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      bk.count += 4;
    }

    for (const [name, bk] of buckets) {
      if (!bk.count) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(bk.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(bk.uv, 2));
      geo.setIndex(bk.idx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        map: this._streetTex[name],
        roughness: 0.92,
        metalness: 0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      this.roadGroup.add(mesh);
      this._streetMats.push(mat);
    }
  }

  _buildWalkers() {
    const walkers = [];
    for (const r of this.model.roads) {
      const seg = this._edgeSegment(r);
      if (!seg) continue;
      const { s0, s1 } = seg;
      const dx = s1.x - s0.x;
      const dz = s1.z - s0.z;
      const L = Math.hypot(dx, dz);
      if (L < 1) continue;
      const nx = -dz / L;
      const nz = dx / L;
      // number of people = number of node connections this street carries
      const count = Math.min(6, Math.max(1, Math.round(r.weight)));
      const spread = Math.max(0.3, this._tier(r.weight).width - 0.2);
      for (let i = 0; i < count; i++) {
        const seed = r.a + r.b + i;
        walkers.push({
          s0, s1, len: L, nx, nz,
          t: hash01(seed),
          speed: 1.6 + 2.2 * hash01(seed + 's'),
          dir: (i % 2) ? -1 : 1,
          off: (hash01(seed + 'o') - 0.5) * spread,
        });
      }
    }
    if (!walkers.length) return;
    const geo = new THREE.CapsuleGeometry(0.11, 0.34, 4, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: '#f4d9b0',
      emissive: new THREE.Color('#ffbf73'),
      emissiveIntensity: 0.35,
      roughness: 0.8,
      metalness: 0,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, walkers.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    this.walkerGroup.add(mesh);
    this.walkerMesh = mesh;
    this._walkers = walkers;
    this.update(0);
  }

  applyFilter(districtId) {
    for (const [, e] of this.byBuilding) {
      e.group.visible = !districtId || e.building.district === districtId;
    }
    for (const plate of this.platesGroup.children) {
      plate.visible = !districtId || plate.userData.district === districtId;
    }
  }

  focusOn(buildingId) {
    const e = this.byBuilding.get(buildingId);
    return e ? e.center.clone() : null;
  }

  findBuilding(query) {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    let best = null;
    for (const b of this.model.buildings) {
      const name = b.name.toLowerCase();
      const file = b.file.toLowerCase();
      if (name === q || file === q) return b;
      if (!best && (name.includes(q) || file.includes(q))) best = b;
    }
    return best;
  }
}
