import * as THREE from 'three';
import {PickingIndex} from './picking.js';
import { treemap, inset, packageLayout } from './layout.js';
import {
  METRICS, locColor, heatColor, districtHue, norm, heightFor, hash01,
  boxplot, categoryFor, categoryHeights, categoryFootprints,
  languageColor,
} from './metrics.js';

function colorFor(b, cKey, cMin, cMax) {
  if (cKey === 'language') return languageColor(b.language);
  const t = norm(METRICS[cKey].get(b), cMin, cMax);
  return cKey === 'loc' ? locColor(t) : heatColor(t);
}
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
  constructor(model, scene, { onHover, asyncRouting=false } = {}) {
    this.model = model;
    this.asyncRouting=asyncRouting;
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
    this.highlightSet = null;
    this.filterId = null;
    this.historyFrame = null;
    this.diffBase = null;
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
    const next={...this.mapping,...mapping};
    if(next.height===this.mapping.height&&next.footprint===this.mapping.footprint&&next.mode===this.mapping.mode) {
      this.mapping=next;
      const vals=METRICS[next.color]?(this.scaleReference?.buildings||this.model.buildings).map(b=>METRICS[next.color].get(b)):[0];
      const max=vals.reduce((m,v)=>Math.max(m,v),1),min=vals.reduce((m,v)=>Math.min(m,v),max);
      for(const e of this.byBuilding.values())for(const mat of e.materials)mat.color.copy(colorFor(e.building,next.color,min,max));
      this._refreshAppearance();return;
    }
    this.mapping=next;this.rebuild();
  }

  setStructuralModel(model,reference=this.currentModel||this.model) {
    this.currentModel=reference;this.scaleReference=reference;
    this.layoutReference||=new Map(reference.buildings.map(b=>[b.id,b]));
    for(const b of model.buildings)if(!this.layoutReference.has(b.id))this.layoutReference.set(b.id,b);
    this.model=model;this.historyFrame=null;this.graph=null;this._computeDegrees();this.rebuild();
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

  dispose() {
    clearTimeout(this._pulseT);
    this.street?.dispose();
    for (const e of this.byBuilding.values()) e.matFull.dispose();
    this._disposeGroup(this.buildingGroup);
    this._disposeGroup(this.platesGroup);
    for (const mat of this._extraMats) mat.dispose();
    this.scene.remove(this.root);
  }

  setLodDistance(d) { this._lodDist2 = d * d; }

  // brief emissive flash on a building (used by the member drill-down)
  pulseBuilding(id) {
    const e = this.byBuilding.get(id);
    if (!e) return;
    clearTimeout(this._pulseT);
    const previous = this.pulseId;
    this.pulseId = id;
    if (previous) this._restore(previous);
    this._restore(id);
    this._pulseT = setTimeout(() => {
      this.pulseId = null;
      this._restore(id);
    }, 900);
  }

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
      if(this.instances){this.instances.geometry.getAttribute("instanceFacade").setX(e.instanceIndex,far?0:1);this.instances.geometry.getAttribute("instanceFacade").needsUpdate=true;}
    }
  }

  _disposeGroup(group) {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
      // NOTE: building materials share the facade atlas and streets share the
      // cached road/street textures, so we only dispose the material wrappers
      // here - never the textures.
      if (o.material) o.material.dispose();
    });
    group.clear();
  }

  rebuild() {
    const selectedId = this.selected?.userData.buildingId;
    clearTimeout(this._pulseT);
    this.pulseId = null;
    // Both LOD materials must be released, including the one not on the mesh.
    for (const e of this.byBuilding.values()) e.matFull.dispose();
    this._disposeGroup(this.buildingGroup);
    this._disposeGroup(this.platesGroup);
    if (this.street) {
      this.root.remove(this.street.group, this.street.walkerGroup, this.street.focusGroup);
      this.street.dispose();
      this.street = null;
    }
    for (const m of this._extraMats) m.dispose();
    this._extraMats = [];
    this.instances=null;
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

    const reference = this.scaleReference?.buildings || buildings;
    const hVals = reference.map((b) => METRICS[hKey].get(b));
    const fVals = reference.map((b) => METRICS[fKey].get(b));
    const hStats = boxplot(hVals);
    const fStats = boxplot(fVals);
    const hCats = categoryHeights();
    const fCats = categoryFootprints();
    const hMax = hVals.reduce((max, v) => Math.max(max, v), 1);
    // footprint treemap weight + height base, per the chosen mapping mode
    const footValue = (b) => (mode === 'linear'
      ? Math.max(METRICS[fKey].get(b), 1)
      : fCats[categoryFor(METRICS[fKey].get(b), fStats, mode, fKey)]);
    const heightBase = (b) => (mode === 'linear'
      ? heightFor(METRICS[hKey].get(b), hMax)
      : hCats[categoryFor(METRICS[hKey].get(b), hStats, mode, hKey)]);

    const isMetricColor = !!METRICS[cKey];
    const cVals = isMetricColor ? reference.map((b) => METRICS[cKey].get(b)) : [0];
    const cMax = cVals.reduce((max, v) => Math.max(max, v), 1);
    const cMin = cVals.reduce((min, v) => Math.min(min, v), cMax);

    const side = Math.min(GROUND_SIZE, Math.max(80, Math.sqrt(reference.length) * 11));
    const layout=packageLayout(this.layoutReference?[...this.layoutReference.values()]:buildings,{x:0,y:0,w:side,h:side},footValue);
    const placedDistricts=layout.packages;
    this.packageRects=placedDistricts.map(p=>({id:p.item.key,rect:p.rect,altitude:p.item.depth*PLATFORM_STEP}));
    this.packageBounds=new Map(this.packageRects.map(p=>[p.id,p.rect]));

    placedDistricts.forEach((pd, di) => {
      const altitude = (pd.item.depth || 0) * PLATFORM_STEP;
      const dColor = districtHue(di, pd.item.depth || 0);
      const inner = inset(pd.rect, Math.min(.5, Math.min(pd.rect.w, pd.rect.h) * 0.01));

      if (inner.w > 1 && inner.h > 1) {
        // curb (slightly larger, darker) + plate, raised to this package's tier
        const curbGeo = new THREE.BoxGeometry(inner.w, 0.35, inner.h);
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

    });
    const activeById=new Map(buildings.map(b=>[b.id,b]));
    for(const p of layout.buildings){const b=activeById.get(p.b.id);if(b)this._addBuilding(b,p.rect,{
      cKey,cMin,cMax,altitude:p.depth*PLATFORM_STEP,heightBase:heightBase(b),flat:mode!=='linear',
    });}

    this.street = new StreetNetwork(this.model, this.byBuilding, side, hash01,this.packageRects);
    this.ready=this.asyncRouting?this.street.buildAsync():Promise.resolve(this.street.build());
    this.ready.catch(error=>{if(this.street?.worker){this.street.worker.terminate();this.street.worker=null;}window.dispatchEvent(new CustomEvent("routingerror",{detail:error.message}));});
    this.street.setMode(this.streetMode);
    this.street.setFocus(this.focusId);
    this.root.add(this.street.group, this.street.walkerGroup, this.street.focusGroup);
    this.root.position.set(-side / 2, 0, -side / 2);
    this.groundSide = side;
    // precompute world centres for distance-based LOD
    for (const e of this.byBuilding.values()) {
      e.world = e.center.clone().add(this.root.position);
    }
    this.selected = this.byBuilding.get(selectedId)?.body || null;
    this.pickingIndex=new PickingIndex(this.byBuilding.values());
    if(buildings.length>=500)this._makeInstances();
    this._refreshVisibility();
    this._refreshAppearance();
  }

  _addBuilding(b, rect, { cKey, cMin, cMax, heightBase, flat, altitude = 0 }) {
    const group = new THREE.Group();

    const w = Math.max(.01, Math.min(rect.w*.85,Math.max(rect.w * BODY_FACTOR - 2 * BODY_MARGIN, .5)));
    const d = Math.max(.01, Math.min(rect.h*.85,Math.max(rect.h * BODY_FACTOR - 2 * BODY_MARGIN, .5)));
    const hVar = flat ? 1 : 0.86 + 0.28 * hash01(b.id + 'h');
    const h = Math.max(3.2, heightBase * hVar);

    const color = colorFor(b, cKey, cMin, cMax);

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
      district:b.district,packageRect:this.packageBounds.get(b.district),
      center: new THREE.Vector3(rect.x + rect.w / 2, 0.62 + altitude + h / 2, rect.y + rect.h / 2),
      ground: new THREE.Vector3(rect.x + rect.w / 2, altitude + STREET_Y, rect.y + rect.h / 2),
      half: { w: w / 2, d: d / 2 },
      roofY: altitude + .62 + h,
    });
    this.buildingMeshes.set(b.id, group);
  }

  _makeInstances() {
    const count=this.byBuilding.size,geometry=new THREE.BoxGeometry(1,1,1);
    geometry.setAttribute('instanceOpacity',new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1),1));
    geometry.setAttribute('instanceGlow',new THREE.InstancedBufferAttribute(new Float32Array(count*3),3));
    geometry.setAttribute('instanceFacade',new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1),1));
    const material=new THREE.MeshStandardMaterial({map:this._facade.map,roughness:.72,metalness:.08,alphaHash:true});
    material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float instanceOpacity; attribute float instanceFacade; attribute vec3 instanceGlow; varying float vInstanceOpacity; varying float vInstanceFacade; varying vec3 vInstanceGlow;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvInstanceOpacity=instanceOpacity;vInstanceGlow=instanceGlow;vInstanceFacade=instanceFacade;');
      shader.fragmentShader='varying float vInstanceOpacity; varying float vInstanceFacade; varying vec3 vInstanceGlow;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= vInstanceOpacity;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','if(vInstanceFacade > 0.5) {\n#include <map_fragment>\n}');
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vInstanceGlow;');
    };
    this.instances=new THREE.InstancedMesh(geometry,material,count);this.instances.receiveShadow=true;this.instances.castShadow=false;
    this.buildingGroup.add(this.instances);let i=0;
    for(const e of this.byBuilding.values()){e.instanceIndex=i++;e.body.visible=false;this._syncInstance(e);}
    this.instances.computeBoundingBox();this.instances.computeBoundingSphere();
  }

  _syncInstance(e) {
    const mesh=this.instances;if(!mesh||e.instanceIndex==null)return;
    const matrix=new THREE.Matrix4(),p=new THREE.Vector3(e.center.x,e.body.position.y,e.center.z),size=new THREE.Vector3(e.half.w*2,e.body.geometry.parameters.height*e.body.scale.y,e.half.d*2);
    if(!e.group.visible)size.set(0,0,0);matrix.compose(p,new THREE.Quaternion(),size);mesh.setMatrixAt(e.instanceIndex,matrix);mesh.instanceMatrix.needsUpdate=true;
    const m=e.matFull;mesh.setColorAt(e.instanceIndex,m.color);mesh.instanceColor.needsUpdate=true;
    const opacity=mesh.geometry.getAttribute('instanceOpacity'),glow=mesh.geometry.getAttribute('instanceGlow');
    opacity.setX(e.instanceIndex,m.opacity);opacity.needsUpdate=true;glow.setXYZ(e.instanceIndex,m.emissive.r*m.emissiveIntensity,m.emissive.g*m.emissiveIntensity,m.emissive.b*m.emissiveIntensity);glow.needsUpdate=true;
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
    this.revision=(this.revision||0)+1;
    const e = this.byBuilding.get(id);
    if (!e) return;
    let color = null;
    let intensity = 0;
    let opacity = 1;
    if (this.diffBase) {
      const prev = this.diffBase.get(id);
      const delta = e.building.comparison_status==='removed'?-prev.loc:prev ? e.building.loc - prev.loc : null;
      color = new THREE.Color(delta === null || delta < 0 ? '#22c55e' : delta > 0 ? '#ef4444' : '#64748b');
      intensity = delta === 0 ? 0.12 : 0.8;
      if(e.building.comparison_status==='changed'&&delta===0){color=new THREE.Color('#f59e0b');intensity=.8;}
      else if (delta === 0) opacity = 0.35;
    }
    if (this.highlightSet) {
      if (this.highlightSet.has(id)) { color = HOVER; intensity = 0.55; }
      else opacity = 0.12;
    }
    if (id === this.hoveredId) { color = HOVER; intensity = 0.45; }
    if (id === this.selected?.userData.buildingId) { color = SELECT; intensity = 0.5; }
    if (id === this.pulseId) { color = new THREE.Color('#ffd166'); intensity = 1.3; }
    for (const m of e.materials) {
      m.emissive.copy(color || m.userData.baseEmissive);
      m.emissiveIntensity = color ? intensity : m.userData.baseIntensity;
      m.transparent = opacity < 1;
      m.opacity = opacity;
    }
    if(this.instances)this._syncInstance(e);
  }

  _refreshAppearance() {
    for (const id of this.byBuilding.keys()) this._restore(id);
  }

  // Compare mode: tint by LOC delta against a baseline model (red grew,
  // green shrank, grey unchanged, brighter green = new).
  applyDiff(baseMap) {
    this.diffActive = true;
    this.diffBase = baseMap;
    this._refreshAppearance();
  }

  clearDiff() {
    this.diffActive = false;
    this.diffBase = null;
    this._refreshAppearance();
  }

  // Tagging (paper's colour + transparency): dim everything except `ids`, which
  // are tinted. Pass null to clear.
  highlightSubset(ids) {
    this.highlightSet = ids ? new Set(ids) : null;
    this._refreshAppearance();
  }

  hover(ndc, camera) {
    this.raycaster.setFromCamera(ndc, camera);
    const hits = this.raycaster.intersectObjects((this.pickingIndex?.candidates(this.raycaster.ray,this.root.position,this.groundSide)||this.pickables.filter((o)=>o.parent.visible)), false);
    const hit = hits.length ? hits[0].object : null;
    const id = hit ? hit.userData.buildingId : null;

    const prev = this.hoveredId;
    this.hoveredId = id;
    if (prev) this._restore(prev);
    if (id) this._restore(id);
    if (this.onHover) this.onHover(id ? this.byBuilding.get(id).building : null, hit);
    return hit;
  }

  select(hit) {
    const prev = this.selected && this.selected.userData.buildingId;
    this.selected = hit || null;
    if (prev) this._restore(prev);
    this.setFocusBuilding(hit?.userData.buildingId);
    if (!this.selected) return null;
    this._restore(this.selected.userData.buildingId);
    const e = this.byBuilding.get(this.selected.userData.buildingId);
    return e ? e.building : null;
  }

  applyFilter(districtId) {
    this.filterId = districtId || null;
    this._refreshVisibility();
  }

  setHistoryFrame(frame, finalFiles) {
    this.historyFrame = frame;
    this.finalFiles = finalFiles;
    this._refreshVisibility();
  }

  _refreshVisibility() {
    this.revision=(this.revision||0)+1;
    const districtId = this.filterId;
    for (const [, e] of this.byBuilding) {
      const frame = this.historyFrame;
      const loc = frame?.files[e.building.file] || 0;
      const finalLoc = this.finalFiles?.[e.building.file] || 0;
      e.group.visible = (!districtId || (districtId==='.' || e.building.district === districtId || e.building.district.startsWith(districtId+'/'))) && (!frame || loc > 0);
      const ratio = frame ? Math.max(0.05, Math.min(1.25, loc / (finalLoc || loc || 1))) : 1;
      const h = e.body.geometry.parameters.height * ratio;
      e.body.scale.y = ratio;
      e.body.position.y = 0.62 + e.altitude + h / 2;
      e.center.y = e.body.position.y;
      if (e.world) e.world.y = e.center.y;
    }
    if(this.instances)for(const e of this.byBuilding.values())this._syncInstance(e);
    for (const plate of this.platesGroup.children) {
      plate.visible = !districtId || districtId==='.' || plate.userData.district === districtId || plate.userData.district.startsWith(districtId+'/') || districtId.startsWith(plate.userData.district+'/') || plate.userData.district==='.';
    }
    const visible = new Set([...this.byBuilding].filter(([, e]) => e.group.visible).map(([id]) => id));
    if (this.street) this.street.setVisibleBuildings(visible);
    if (this.hoveredId && !visible.has(this.hoveredId)) this.hoveredId = null;
    if (this.selected && !visible.has(this.selected.userData.buildingId)) this.select(null);
  }

  focusOn(buildingId) {
    const e = this.byBuilding.get(buildingId);
    return e ? e.center.clone() : null;
  }

}
