import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { City } from './city.js';
import * as UI from './ui.js';
import { groundTexture, skyTexture } from './textures.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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
  const applyMapping = () => {
    city.setMapping({ height: selH.value, footprint: selF.value, color: selC.value });
    UI.renderLegend(selC.value);
    city.setRoadsVisible(document.getElementById('chk-roads').checked);
  };
  selH.onchange = selF.onchange = selC.onchange = applyMapping;

  document.getElementById('chk-roads').onchange = (e) => city.setRoadsVisible(e.target.checked);
  document.getElementById('chk-grid').onchange = (e) => { grid.visible = e.target.checked; };

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
  UI.renderLegend(selC.value);
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

function focusBuilding(b) {
  const p = city.focusOn(b.id);
  if (!p) return;
  const target = p.clone().add(city.root.position);
  controls.target.copy(target);
  camera.position.copy(target).add(new THREE.Vector3(groundSide * 0.5, groundSide * 0.5, groundSide * 0.5));
  const e = city.byBuilding.get(b.id);
  if (e) city.select(e.group.children[0]);
  UI.renderDetails(b);
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
  UI.renderDetails(b);
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
  buildWorld(groundSide);
  resetView();
  controls.update();
  wireUI(model);
  initHelp();
  UI.setLoading(null);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    controls.update();
    if (city) city.update(dt);
    renderer.render(scene, camera);
  });
}

boot();
