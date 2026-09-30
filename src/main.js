import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { City } from './city.js';
import * as UI from './ui.js';
import { groundTexture, starField, dynamicSky } from './textures.js';

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

// --- lights ---------------------------------------------------------------
const hemi = new THREE.HemisphereLight('#cfe0ff', '#1b2438', 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
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

// --- sky, moon, ground, stars --------------------------------------------
const sky = dynamicSky();
scene.background = sky.texture;

const moonGroup = new THREE.Group();
// sits low in the sky behind the city so it is in frame for the default view
moonGroup.position.set(-620, 20, -620);
moonGroup.visible = false;
const moon = new THREE.Mesh(
  new THREE.SphereGeometry(16, 32, 32),
  new THREE.MeshBasicMaterial({ color: '#eaf0ff', transparent: true, opacity: 0, fog: false, depthWrite: false }),
);
const moonHalo = new THREE.Mesh(
  new THREE.SphereGeometry(30, 32, 32),
  new THREE.MeshBasicMaterial({
    color: '#9fb6ff', transparent: true, opacity: 0,
    fog: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }),
);
moonGroup.add(moon, moonHalo);
scene.add(moonGroup);

const moonLight = new THREE.DirectionalLight('#b9ccff', 0);
moonLight.position.copy(moonGroup.position);
moonLight.castShadow = false;
scene.add(moonLight);

let stars = null;
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

  grid = new THREE.GridHelper(side * 1.5, 30, 0x2b3852, 0x1b2438);
  grid.position.y = 0.03;
  scene.add(grid);

  if (!stars) {
    stars = starField();
    scene.add(stars);
  }
}

// --- time of day: one continuous cycle (~60 s), longer day ---------------
const CYCLE_SECONDS = 60;
const PHASE_START = { day: 0.0, dusk: 0.68, night: 0.85 };

const DAY = {
  fog: '#9db4d8', fogNear: 240, fogFar: 620, hemi: 1.05, hemiSky: '#cfe0ff',
  sun: 2.4, sunColor: '#fff6e0', sunPos: [150, 240, 100],
  exposure: 1.05, stars: 0, windowGlow: 0, moon: 0, moonLight: 0,
  skyTop: '#6ea8ff', skyBottom: '#dbe7ff',
};
const DUSK = {
  fog: '#6a5a72', fogNear: 180, fogFar: 520, hemi: 0.6, hemiSky: '#ffd2a0',
  sun: 1.7, sunColor: '#ff9d5c', sunPos: [220, 70, 60],
  exposure: 1.0, stars: 0.35, windowGlow: 0.6, moon: 0.3, moonLight: 0.08,
  skyTop: '#242a5c', skyBottom: '#ff9d5c',
};
const NIGHT = {
  fog: '#070a16', fogNear: 160, fogFar: 520, hemi: 0.32, hemiSky: '#4a5a90',
  sun: 0.55, sunColor: '#8ea2ff', sunPos: [120, 160, 90],
  exposure: 1.15, stars: 1, windowGlow: 1.3, moon: 1, moonLight: 0.5,
  skyTop: '#03050c', skyBottom: '#0b1024',
};

function key(at, o) {
  return {
    at,
    fogColor: new THREE.Color(o.fog), fogNear: o.fogNear, fogFar: o.fogFar,
    hemiIntensity: o.hemi, hemiSky: new THREE.Color(o.hemiSky),
    sunIntensity: o.sun, sunColor: new THREE.Color(o.sunColor), sunPos: o.sunPos,
    exposure: o.exposure, stars: o.stars, windowGlow: o.windowGlow,
    moon: o.moon, moonLight: o.moonLight,
    skyTop: new THREE.Color(o.skyTop), skyBottom: new THREE.Color(o.skyBottom),
  };
}

// day holds ~33 s, then day->dusk, dusk, dusk->night, night, dawn.
const KEYS = [
  key(0.00, DAY),
  key(0.55, DAY),
  key(0.68, DUSK),
  key(0.75, DUSK),
  key(0.85, NIGHT),
  key(0.95, NIGHT),
  key(1.00, DAY),
];

const cur = {
  fogColor: new THREE.Color(), hemiSky: new THREE.Color(), sunColor: new THREE.Color(),
  skyTop: new THREE.Color(), skyBottom: new THREE.Color(),
  fogNear: 0, fogFar: 0, hemiIntensity: 0, sunIntensity: 0, sunX: 0, sunY: 0, sunZ: 0,
  exposure: 1, stars: 0, windowGlow: 0, moon: 0, moonLight: 0,
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function sampleTime(p) {
  let i = 0;
  while (i < KEYS.length - 2 && p >= KEYS[i + 1].at) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const span = b.at - a.at;
  const t = span <= 0 ? 0 : smoothstep((p - a.at) / span);
  cur.fogColor.copy(a.fogColor).lerp(b.fogColor, t);
  cur.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
  cur.sunColor.copy(a.sunColor).lerp(b.sunColor, t);
  cur.skyTop.copy(a.skyTop).lerp(b.skyTop, t);
  cur.skyBottom.copy(a.skyBottom).lerp(b.skyBottom, t);
  cur.fogNear = lerp(a.fogNear, b.fogNear, t);
  cur.fogFar = lerp(a.fogFar, b.fogFar, t);
  cur.hemiIntensity = lerp(a.hemiIntensity, b.hemiIntensity, t);
  cur.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, t);
  cur.sunX = lerp(a.sunPos[0], b.sunPos[0], t);
  cur.sunY = lerp(a.sunPos[1], b.sunPos[1], t);
  cur.sunZ = lerp(a.sunPos[2], b.sunPos[2], t);
  cur.exposure = lerp(a.exposure, b.exposure, t);
  cur.stars = lerp(a.stars, b.stars, t);
  cur.windowGlow = lerp(a.windowGlow, b.windowGlow, t);
  cur.moon = lerp(a.moon, b.moon, t);
  cur.moonLight = lerp(a.moonLight, b.moonLight, t);
  return cur;
}

const css = (c) => `#${c.getHexString()}`;

function applyTime(p) {
  const c = sampleTime(p);
  scene.fog.color.copy(c.fogColor);
  scene.fog.near = c.fogNear;
  scene.fog.far = c.fogFar;
  hemi.intensity = c.hemiIntensity;
  hemi.color.copy(c.hemiSky);
  sun.intensity = c.sunIntensity;
  sun.color.copy(c.sunColor);
  sun.position.set(c.sunX, c.sunY, c.sunZ);
  renderer.toneMappingExposure = c.exposure;
  if (stars) stars.material.opacity = c.stars;
  sky.set(css(c.skyTop), css(c.skyBottom));
  moonGroup.visible = c.moon > 0.02;
  moon.material.opacity = c.moon;
  moonHalo.material.opacity = c.moon * 0.35;
  moonLight.intensity = c.moonLight;
  if (city) city.setWindowGlow(c.windowGlow);
}

function phaseName(p) {
  if (p < 0.55) return 'day';
  if (p < 0.85) return 'dusk';
  return 'night';
}

function setActivePhase(name) {
  document.querySelectorAll('#time-mode button').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === name);
  });
}

let time = 0;
let playing = true;
const clock = new THREE.Clock();

function jumpToPhase(mode) {
  time = (PHASE_START[mode] ?? 0) * CYCLE_SECONDS;
  applyTime(time / CYCLE_SECONDS);
  setActivePhase(mode);
}

function updatePlayIcon() {
  const btn = document.getElementById('time-play');
  if (!btn) return;
  btn.textContent = playing ? '⏸' : '▶';
  btn.title = playing ? 'pause' : 'play';
  btn.classList.toggle('active', playing);
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

  document.querySelectorAll('#time-mode button').forEach((b) => {
    b.onclick = () => jumpToPhase(b.dataset.mode);
  });

  document.getElementById('time-play').onclick = () => {
    playing = !playing;
    updatePlayIcon();
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
    if (e.key === ' ' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      e.preventDefault();
      playing = !playing;
      updatePlayIcon();
    }
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
  jumpToPhase('day');
  updatePlayIcon();
  resetView();
  controls.update();
  wireUI(model);
  initHelp();
  UI.setLoading(null);

  clock.getDelta();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    controls.update();
    if (city) city.update(dt);
    if (playing) {
      time = (time + dt) % CYCLE_SECONDS;
      applyTime(time / CYCLE_SECONDS);
      setActivePhase(phaseName(time / CYCLE_SECONDS));
    }
    renderer.render(scene, camera);
  });
}

boot();
