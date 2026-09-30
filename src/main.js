import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { City } from './city.js';
import * as UI from './ui.js';
import { groundTexture, skyTexture } from './textures.js';
import { parseQuery, loadQueries, saveQuery } from './query.js';
import { renderInfraHUD, buildFoundation, setInfraLive } from './infra.js';
import { initTimeline } from './history.js';
import { diffAgainst } from './compare.js';
import { initA11y } from './accessible.js';

const canvas = document.getElementById('scene');
// preserveDrawingBuffer so the "PNG" export can read the canvas back
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9db4d8, 240, 620);

const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 4000);
camera.position.set(140, 105, 140);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 12;
controls.maxDistance = 900;
controls.autoRotate = false;
controls.autoRotateSpeed = 0.45;

// --- lights (fixed daytime) ----------------------------------------------
const hemi = new THREE.HemisphereLight('#cfe0ff', '#1b2438', 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff6e0', 2.4);
sun.position.set(150, 240, 100);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 900;
sun.shadow.camera.left = -220;
sun.shadow.camera.right = 220;
sun.shadow.camera.top = 220;
sun.shadow.camera.bottom = -220;
sun.shadow.bias = -0.0004;
scene.add(sun);
const rim = new THREE.DirectionalLight('#5b7cff', 0.5);
rim.position.set(-180, 90, -140);
scene.add(rim);

// --- sky, ground ----------------------------------------------------------
scene.background = skyTexture('#6ea8ff', '#dbe7ff');

let ground = null;
let grid = null;

function buildWorld(side) {
  if (ground) { scene.remove(ground); ground.geometry.dispose(); ground.material.dispose(); }
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(side * 3, side * 3),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // lines every 4u (5 routing cells) so the street grid reads as aligned
  grid = new THREE.GridHelper(side * 1.5, Math.max(4, Math.round((side * 1.5) / 4)), 0x2b3852, 0x1b2438);
  grid.position.y = 0.03;
  scene.add(grid);
}

// --- state ----------------------------------------------------------------
let city = null;
let groundSide = 160;
const pointer = new THREE.Vector2();
let downPos = null;

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- UI wiring ------------------------------------------------------------
function wireUI(model) {
  UI.renderStats(model);
  UI.buildDistrictList(model, (id) => {
    city.applyFilter(id);
    const first = model.buildings.find((b) => !id || b.district === id);
    if (id && first) focusBuilding(first);
  });

  const selH = document.getElementById('sel-height');
  const selF = document.getElementById('sel-footprint');
  const selC = document.getElementById('sel-color');
  const selM = document.getElementById('sel-mode');
  if (model.buildings.some((b) => b.coverage != null)) {
    const opt = document.getElementById('opt-coverage');
    if (opt) opt.style.display = '';
  }
  const applyMapping = () => {
    city.setMapping({ height: selH.value, footprint: selF.value, color: selC.value, mode: selM.value });
    UI.renderLegend(selC.value, model);
  };
  selH.onchange = selF.onchange = selC.onchange = selM.onchange = applyMapping;

  const selStreets = document.getElementById('sel-streets');
  selStreets.onchange = (e) => city.setStreetMode(e.target.value);
  city.setStreetMode(selStreets.value);

  document.getElementById('chk-grid').onchange = (e) => { grid.visible = e.target.checked; };

  // query / tagging engine
  const qInput = document.getElementById('query');
  const qCount = document.getElementById('query-count');
  const qSaved = document.getElementById('query-saved');
  const runQuery = (text) => {
    const parsed = parseQuery(text);
    if (parsed.empty) { city.highlightSubset(null); qCount.textContent = ''; return; }
    const ids = model.buildings.filter(parsed.test).map((b) => b.id);
    city.highlightSubset(ids);
    qCount.textContent = `${ids.length} of ${model.buildings.length} tagged · ${parsed.describe}`;
  };
  const refreshSaved = () => {
    const all = loadQueries();
    qSaved.innerHTML = '<option value="">saved…</option>'
      + Object.keys(all).map((k) => `<option value="${k}">${k}</option>`).join('');
  };
  document.getElementById('query-form').onsubmit = (e) => { e.preventDefault(); runQuery(qInput.value); };
  document.getElementById('query-clear').onclick = () => {
    qInput.value = ''; city.highlightSubset(null); qCount.textContent = '';
  };
  document.getElementById('query-save').onclick = () => {
    const name = window.prompt('save query as'); if (!name) return;
    saveQuery(name, qInput.value); refreshSaved(); qSaved.value = name;
  };
  qSaved.onchange = () => {
    const all = loadQueries();
    const t = all[qSaved.value];
    if (t != null) { qInput.value = t; runQuery(t); }
  };
  refreshSaved();

  // export + compare
  const download = (href, name) => {
    const a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  };
  document.getElementById('export-png').onclick = () => {
    renderer.render(scene, camera);
    download(renderer.domElement.toDataURL('image/png'), 'codecity.png');
  };
  document.getElementById('export-json').onclick = () => {
    const blob = new Blob([JSON.stringify(model)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    download(url, 'city.json');
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const cmpFile = document.getElementById('compare-file');
  const cmpCount = document.getElementById('compare-count');
  document.getElementById('compare-btn').onclick = () => cmpFile.click();
  cmpFile.onchange = async () => {
    const f = cmpFile.files && cmpFile.files[0];
    if (!f) return;
    try {
      const baseline = JSON.parse(await f.text());
      const { base, stats } = diffAgainst(model, baseline);
      city.applyDiff(base);
      cmpCount.textContent = `${stats.added} new · ${stats.changed} changed · ${stats.removed} removed · LOC ${stats.locDelta >= 0 ? '+' : ''}${stats.locDelta}`;
    } catch (err) {
      cmpCount.textContent = `could not read baseline (${err.message})`;
    }
    cmpFile.value = '';
  };
  document.getElementById('compare-clear').onclick = () => {
    city.clearDiff(); cmpCount.textContent = '';
  };

  document.getElementById('auto-rotate').onclick = (e) => {
    controls.autoRotate = !controls.autoRotate;
    e.currentTarget.classList.toggle('active', controls.autoRotate);
  };

  const form = document.getElementById('search-form');
  form.onsubmit = (e) => {
    e.preventDefault();
    const b = city.findBuilding(document.getElementById('search').value);
    if (b) focusBuilding(b);
  };

  document.getElementById('reset-view').onclick = () => resetView();
  UI.renderLegend(selC.value, model);
}

// --- help tab -------------------------------------------------------------
function initHelp() {
  const help = document.getElementById('help');
  const isOpen = () => help.classList.contains('open');
  const setOpen = (v) => help.classList.toggle('open', v);

  document.getElementById('help-btn').onclick = () => setOpen(!isOpen());
  document.getElementById('help-close').onclick = () => setOpen(false);
  help.addEventListener('click', (e) => { if (e.target === help) setOpen(false); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
    if (e.key === '?' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      e.preventDefault();
      setOpen(!isOpen());
    }
  });
}

function showDetails(b) {
  UI.renderDetails(b, {
    onMember: (building, member) => { if (member) city.pulseBuilding(building.id); },
  });
}

function focusBuilding(b) {
  const p = city.focusOn(b.id);
  if (!p) return;
  const target = p.clone().add(city.root.position);
  controls.target.copy(target);
  camera.position.copy(target).add(new THREE.Vector3(groundSide * 0.5, groundSide * 0.5, groundSide * 0.5));
  const e = city.byBuilding.get(b.id);
  if (e) city.select(e.group.children[0]);
  showDetails(b);
}

function resetView() {
  controls.target.set(0, 12, 0);
  camera.position.set(groundSide * 0.82, groundSide * 0.66, groundSide * 0.82);
}

// --- pointer --------------------------------------------------------------
canvas.addEventListener('pointermove', (e) => {
  if (!city) return;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  const hit = city.hover(pointer, camera);
  if (city.streetMode === 'selected') city.setFocusBuilding(hit ? hit.userData.buildingId : null);
  UI.showTooltip(hit ? city.byBuilding.get(hit.userData.buildingId).building : null, e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => UI.showTooltip(null));
canvas.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!city || !downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 5) return;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  const hit = city.hover(pointer, camera);
  const b = hit ? city.select(hit) : null;
  city.setFocusBuilding(b ? b.id : null);
  showDetails(b);
});

// --- boot -----------------------------------------------------------------
async function boot() {
  UI.setLoading('loading city.json …');
  let model;
  try {
    const res = await fetch('./city.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    model = await res.json();
  } catch (err) {
    UI.setLoading(`could not load city.json (${err.message}). Run: python build_city.py`);
    return;
  }

  UI.setLoading('building the city …');
  await new Promise((r) => setTimeout(r, 30));

  city = new City(model, scene, {});
  window.__codecity = city;
  groundSide = city.groundSide;
  city.camera = camera;
  city.setLodDistance(groundSide * 0.5);
  buildWorld(groundSide);
  renderInfraHUD(model.meta.infra);
  scene.add(buildFoundation(model.meta.infra, groundSide));
  initTimeline(model.meta.history, city);
  resetView();
  initA11y(model, city, { onSelect: (b) => focusBuilding(b) });
  controls.update();
  wireUI(model);
  initHelp();
  UI.setLoading(null);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    controls.update();
    if (city) {
      // detailed buildings near the camera target, low-detail ones far away
      city.setLodDistance(camera.position.distanceTo(controls.target) * 0.75);
      city.update(dt);
    }
    renderer.render(scene, camera);
  });
}

boot();
