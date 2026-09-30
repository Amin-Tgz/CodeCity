import * as THREE from 'three';
import { treemap, inset } from './layout.js';
import {
  METRICS, locColor, heatColor, districtHue, norm, heightFor, hash01,
  boxplot, categoryFor, categoryHeights, categoryFootprints,
} from './metrics.js';
import { facadeTextures, applyWindowUV } from './textures.js';
import { StreetNetwork, STREET_Y } from './streets.js';

const GROUND_SIZE = 260;
const HOVER = new THREE.Color('#38bdf8');
const SELECT = new THREE.Color('#f8fafc');
// Buildings are shrunk + margined to leave orthogonal street corridors between
// them (with the default treemap packing the median gap is only ~0.9u).
const BODY_FACTOR = 0.6;
const BODY_MARGIN = 0.5;
// nested packages sit on progressively raised platform terraces (article
// topology): a district's elevation follows its package nesting depth.
const PLATFORM_STEP = 1.2;

export class City {
  constructor(model, scene, { onHover } = {}) {
    this.model = model;
    this.scene = scene;
    this.onHover = onHover;
    this.mapping = { height: 'nom', footprint: 'noa', color: 'loc', mode: 'boxplot' };
    this.raycaster = new THREE.Raycaster();

    this.root = new THREE.Group();
    scene.add(this.root);

    this.platesGroup = new THREE.Group();
    this.buildingGroup = new THREE.Group();
    this.root.add(this.buildingGroup, this.platesGroup);

    this.pickables = [];
    this.byBuilding = new Map();
    this.buildingMeshes = new Map();
    this.selected = null;
    this.hoveredId = null;
    this._facade = facadeTextures();
    this.street = null;
    this.streetMode = 'all';
    this.focusId = null;
    this.camera = null;
    this._lodDist2 = Infinity;
    this._extraMats = [];
    this._lodAcc = 0;

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

  setStreetMode(mode) {
    this.streetMode = mode;
    if (this.street) this.street.setMode(mode);
  }

  setRoadsVisible(v) { this.setStreetMode(v ? 'all' : 'off'); }

  // relationship-on-demand: focus a building's incident streets
  setFocusBuilding(id) {
    this.focusId = id || null;
    if (this.street) this.street.setFocus(this.focusId);
  }

  setLodDistance(d) { this._lodDist2 = d * d; }

  // Walk the pedestrians and apply distance-based level of detail.
  update(dt) {
    if (this.street) this.street.update(dt);
    this._lodAcc += dt;
    if (this._lodAcc > 0.4) { this._lodAcc = 0; this._updateLOD(); }
  }

  _updateLOD() {
    const cam = this.camera;
    if (!cam || !isFinite(this._lodDist2)) return;
    const cp = cam.position;
    for (const e of this.byBuilding.values()) {
      if (!e.world || !e.body) continue;
      const far = e.world.distanceToSquared(cp) > this._lodDist2;
      if (far === e.far) continue;
      e.far = far;
      e.body.material = far ? e.matSimple : e.matFull;
      e.body.castShadow = !far;
    }
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
    if (this.street) {
      this.root.remove(this.street.group, this.street.walkerGroup);
      this.street.dispose();
      this.street = null;
    }
    for (const m of this._extraMats) m.dispose();
    this._extraMats = [];
    this.pickables = [];
    this.byBuilding.clear();
    this.buildingMeshes.clear();
    this.selected = null;
    this.hoveredId = null;
    this._plateMats = [];

    const buildings = this.model.buildings;
    const hKey = this.mapping.height;
    const fKey = this.mapping.footprint;
    const cKey = this.mapping.color;
    const mode = this.mapping.mode || 'boxplot';

    const hVals = buildings.map((b) => METRICS[hKey].get(b));
    const fVals = buildings.map((b) => METRICS[fKey].get(b));
    const hStats = boxplot(hVals);
    const fStats = boxplot(fVals);
    const hCats = categoryHeights();
    const fCats = categoryFootprints();
    const hMax = Math.max(1, ...hVals);
    // footprint treemap weight + height base, per the chosen mapping mode
    const footValue = (b) => (mode === 'linear'
      ? Math.max(METRICS[fKey].get(b), 1)
      : fCats[categoryFor(METRICS[fKey].get(b), fStats, mode, fKey)]);
    const heightBase = (b) => (mode === 'linear'
      ? heightFor(METRICS[hKey].get(b), hMax)
      : hCats[categoryFor(METRICS[hKey].get(b), hStats, mode, hKey)]);

    const cVals = buildings.map((b) => METRICS[cKey].get(b));
    const cMax = Math.max(1, ...cVals);
    const cMin = Math.min(...cVals);

    const depthById = new Map(this.model.districts.map((d) => [d.id, d.depth || 0]));
    const districtAgg = new Map();
    for (const b of buildings) {
      const d = b.district;
      if (!districtAgg.has(d)) districtAgg.set(d, { key: d, value: 0, buildings: [], depth: depthById.get(d) || 0 });
      const a = districtAgg.get(d);
      a.value += footValue(b);
      a.buildings.push(b);
    }
    const districts = [...districtAgg.values()].sort((a, b2) => a.key.localeCompare(b2.key));

    const side = Math.min(GROUND_SIZE, Math.max(80, Math.sqrt(buildings.length) * 11));
    const placedDistricts = treemap(districts, { x: 0, y: 0, w: side, h: side });

    placedDistricts.forEach((pd, di) => {
      const altitude = (pd.item.depth || 0) * PLATFORM_STEP;
      const dColor = districtHue(di, pd.item.depth || 0);
      const inner = inset(pd.rect, Math.min(2.6, Math.min(pd.rect.w, pd.rect.h) * 0.07));

      if (inner.w > 1 && inner.h > 1) {
        // curb (slightly larger, darker) + plate, raised to this package's tier
        const curbGeo = new THREE.BoxGeometry(inner.w + 1.0, 0.35, inner.h + 1.0);
        const curbMat = new THREE.MeshStandardMaterial({
          color: dColor.clone().multiplyScalar(0.5), roughness: 1, metalness: 0,
        });
        const curb = new THREE.Mesh(curbGeo, curbMat);
        curb.position.set(inner.x + inner.w / 2, altitude + 0.18, inner.y + inner.h / 2);
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
        plate.position.set(inner.x + inner.w / 2, altitude + 0.42, inner.y + inner.h / 2);
        plate.receiveShadow = true;
        plate.userData.district = pd.item.key;
        this.platesGroup.add(plate);
        this._plateMats.push(plateMat, curbMat);
      }

      const pad = Math.min(1.4, Math.min(inner.w, inner.h) * 0.035);
      const buildingArea = inset(inner, pad);
      if (buildingArea.w <= 0.5 || buildingArea.h <= 0.5) return;
      const placed = treemap(
        pd.item.buildings.map((b) => ({ value: footValue(b), b })),
        buildingArea
      );
      for (const { item, rect } of placed) {
        this._addBuilding(item.b, rect, {
          cKey, cMin, cMax, altitude, heightBase: heightBase(item.b), flat: mode !== 'linear',
        });
      }
    });

    this.street = new StreetNetwork(this.model, this.byBuilding, side, hash01);
    this.street.build();
    this.street.setMode(this.streetMode);
    this.street.setFocus(this.focusId);
    this.root.add(this.street.group, this.street.walkerGroup, this.street.focusGroup);
    this.root.position.set(-side / 2, 0, -side / 2);
    this.groundSide = side;
    // precompute world centres for distance-based LOD
    for (const e of this.byBuilding.values()) {
      e.world = e.center.clone().add(this.root.position);
    }
  }

  _addBuilding(b, rect, { cKey, cMin, cMax, heightBase, flat, altitude = 0 }) {
    const group = new THREE.Group();

    const w = Math.max(rect.w * BODY_FACTOR - 2 * BODY_MARGIN, 0.5);
    const d = Math.max(rect.h * BODY_FACTOR - 2 * BODY_MARGIN, 0.5);
    const hVar = flat ? 1 : 0.86 + 0.28 * hash01(b.id + 'h');
    const h = Math.max(3.2, heightBase * hVar);

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

    // low-detail material (no facade map) used for distant buildings
    const matSimple = new THREE.MeshStandardMaterial({
      color: color.clone(), emissive: new THREE.Color('#ffd79a'), emissiveIntensity: 0,
      roughness: 0.78, metalness: 0.05,
    });
    matSimple.userData.window = true;
    matSimple.userData.baseEmissive = mat.userData.baseEmissive;
    matSimple.userData.baseIntensity = 0;
    this._extraMats.push(matSimple);

    const body = new THREE.Mesh(geo, mat);
    body.position.y = 0.62 + altitude + h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.buildingId = b.id;
    group.add(body);
    this.pickables.push(body);

    group.position.set(rect.x + rect.w / 2, 0, rect.y + rect.h / 2);
    this.buildingGroup.add(group);
    this.byBuilding.set(b.id, {
      group, materials: [mat, matSimple], building: b,
      body, matFull: mat, matSimple, far: false, altitude,
      center: new THREE.Vector3(rect.x + rect.w / 2, 0.62 + altitude + h / 2, rect.y + rect.h / 2),
      ground: new THREE.Vector3(rect.x + rect.w / 2, altitude + STREET_Y, rect.y + rect.h / 2),
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
