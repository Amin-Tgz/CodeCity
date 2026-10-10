import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { City } from './city.js';
import * as UI from './ui.js';
import { skyTexture } from './textures.js';
import { Landscape } from './landscape.js';
import { Construction } from './construction.js';
import { validateModel } from './model.js';
import { initTimeline } from './history.js';
import { initA11y } from './accessible.js';
import { initI18n, t, translate } from './i18n.js';
import { initProjects } from './projects.js';
import { initPanels, initAutoHide, setSelectionPanelState } from './panels.js';
import {initInvestigations,drawMinimap,renderSharedConnections} from './inspection-ui.js';
import {graphIndex} from './investigation.js';
import {initMode} from './mode.js';
import {initProfile} from './profile.js';
import {renderHelp} from './help.js';

const canvas = document.getElementById('scene');
let renderDirty=true;
for(const name of ['click','input','change','pointermove','wheel','keydown'])document.addEventListener(name,()=>{renderDirty=true;},true);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  UI.setError('The 3D view needs WebGL. Enable hardware acceleration or use a browser with WebGL support.');
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc4d5b8, 600, 2100);

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
scene.background = skyTexture('#91bde1', '#d6e4cb');

let landscape = null;
let construction = null;
let grid = null;

function buildWorld(side, hasCity) {
  landscape?.dispose();
  construction?.dispose();
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  landscape = new Landscape(side, {hasCity, reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches});
  scene.add(landscape.root);
  window.__landscape = landscape;
  construction=new Construction(side,{reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches});
  scene.add(construction.root);window.__construction=construction;

  // lines every 4u (5 routing cells) so the street grid reads as aligned
  grid = new THREE.GridHelper(side, Math.max(4, Math.round(side / 4)), 0x62736b, 0x68756c);
  grid.position.y = 0.04;
  scene.add(grid);
}

// --- state ----------------------------------------------------------------
let city = null;
let groundSide = 160;
let cleanupA11y = () => {};
let cleanupTimeline = () => {};
let activeBuilding = null;
let activeConnection = null;
const pointer = new THREE.Vector2();
let downPos = null;

function resize() {
  renderDirty=true;
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  updateHudOffset();
}
function updateHudOffset() {
  const bar = document.getElementById('topbar');
  const offset = Math.ceil(bar.getBoundingClientRect().bottom + 12) + 'px';
  if (document.documentElement.style.getPropertyValue('--hud-offset') !== offset) document.documentElement.style.setProperty('--hud-offset',offset);
  const panel=document.getElementById('controls');
  document.documentElement.style.setProperty('--details-top',Math.ceil(panel.getBoundingClientRect().bottom+12)+'px');
}
window.addEventListener('resize', resize);
window.addEventListener('modechange',()=>{renderDirty=true;updateHudOffset();});
new ResizeObserver(updateHudOffset).observe(document.getElementById('topbar'));
resize();

// --- UI wiring ------------------------------------------------------------
function wireUI(model) {
  UI.renderStats(model);
  UI.renderRoadStats(city);
  UI.buildDistrictList(model, (id) => {
    city.applyFilter(id);
    const first = model.buildings.find((b) => city.byBuilding.get(b.id)?.group.visible);
    if (id && first) focusBuilding(first);
    else if (id) showDetails(null);
  });

  const selH = document.getElementById('sel-height');
  const selF = document.getElementById('sel-footprint');
  const selC = document.getElementById('sel-color');
  const selM = document.getElementById('sel-mode');
  const applyMapping = () => {
    city.setMapping({ height: selH.value, footprint: selF.value, color: selC.value, mode: selM.value });
    UI.renderRoadStats(city);
    UI.renderLegend(selC.value, model, city.mapping);
    drawMinimap(city,focusBuilding);
  };
  selH.onchange = selF.onchange = selC.onchange = selM.onchange = applyMapping;

  const selStreets = document.getElementById('sel-streets');
  selStreets.onchange = (e) => city.setStreetMode(e.target.value);
  city.setStreetMode(selStreets.value);

  document.getElementById('chk-grid').onchange = (e) => { grid.visible = e.target.checked; };

  const simpleMode=()=>{
    if(document.documentElement.dataset.mode!=='simple')return;
    document.getElementById('filter').value='';city.applyFilter(null);
    const preset=document.querySelector('#investigations select');
    if(preset?.value){preset.value='';preset.dispatchEvent(new Event('change'));}
  };
  if(wireUI.modeListener)window.removeEventListener('modechange',wireUI.modeListener);
  wireUI.modeListener=simpleMode;window.addEventListener('modechange',simpleMode);
  simpleMode();

  document.getElementById('auto-rotate').onclick = (e) => {
    controls.autoRotate = !controls.autoRotate;
    e.currentTarget.classList.toggle('active', controls.autoRotate);
  };


  document.getElementById('reset-view').onclick = () => resetView();
  UI.renderLegend(selC.value, model, city.mapping);
  applyMapping();
  city.graph=graphIndex(model);
  initInvestigations(model,city,focusBuilding);drawMinimap(city,focusBuilding);
  renderSharedConnections(city,showConnection);
}

// --- help tab -------------------------------------------------------------
function initHelp() {
  const help = document.getElementById('help');
  const body = help.querySelector('.help-body');
  renderHelp(body);
  window.addEventListener('languagechange',()=>renderHelp(body));
  const isOpen = () => help.classList.contains('open');
  let previousFocus = null;
  const setOpen = (v) => {
    if (v === isOpen()) return;
    help.classList.toggle('open', v);
    for (const el of document.body.children) if (el !== help && el.tagName !== 'SCRIPT') el.inert = v;
    document.getElementById('help-btn').setAttribute('aria-expanded', String(v));
    if (v) { previousFocus = document.activeElement; document.getElementById('help-close').focus(); }
    else previousFocus?.focus();
  };

  document.getElementById('help-btn').onclick = () => setOpen(!isOpen());
  document.getElementById('help-close').onclick = () => setOpen(false);
  help.addEventListener('click', (e) => { if (e.target === help) setOpen(false); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Tab' && isOpen()) {
      const items = [...help.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')];
      if (items.length && ((e.shiftKey && document.activeElement === items[0]) || (!e.shiftKey && document.activeElement === items.at(-1)))) {
        e.preventDefault(); (e.shiftKey ? items.at(-1) : items[0]).focus();
      }
    }
    if (e.key === '?' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      e.preventDefault();
      setOpen(!isOpen());
    }
  });
}

function showDetails(b) {
  if(activeConnection)city?.highlightSubset(null);
  activeConnection=null;
  activeBuilding = b;
  setSelectionPanelState(!!b);
  UI.renderDetails(b, {
    city, onSelect: focusBuilding,
    onMember: (building, member) => { if (member) city.pulseBuilding(building.id); },
    onClose: () => { showDetails(null); city.select(null); },
  });
  updateHudOffset();
}
function showConnection(path) {
  activeBuilding=null;activeConnection=path;city.select(null);
  city.highlightSubset(path.edges.flatMap(e=>[e.a,e.b]));setSelectionPanelState(true);
  UI.renderConnectionDetails(path,{city,onSelect:focusBuilding,onClose:()=>{city.highlightSubset(null);showDetails(null);}});updateHudOffset();
}
window.addEventListener('streetsready',event=>{renderDirty=true;if(city?.street===event.detail){UI.renderRoadStats(city);renderSharedConnections(city,showConnection);if(activeBuilding)showDetails(activeBuilding);}});
window.addEventListener('routingerror',()=>{document.getElementById('project-status').textContent=t('Ground routing is unavailable. Connections remain available in the dependency map.');});
window.addEventListener('exploreopen',()=>{showDetails(null);city?.select(null);});

function focusBuilding(b) {
  if(activeConnection)city.highlightSubset(null);
  if (!city.byBuilding.get(b.id)?.group.visible) {
    const timeline = document.getElementById('tl-range');
    if (timeline) { timeline.value = timeline.max; timeline.dispatchEvent(new Event('input')); }
    document.getElementById('filter').value = '';
    city.applyFilter(null);
  }
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
  camera.position.set(groundSide * 1.16, groundSide * .88, groundSide * 1.16);
}

// --- pointer --------------------------------------------------------------
canvas.addEventListener('pointermove', (e) => {
  if (!city) return;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  const hit = city.hover(pointer, camera);
  UI.showTooltip(hit ? city.byBuilding.get(hit.userData.buildingId).building : null, e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => {
  UI.showTooltip(null);
  if (city?.hoveredId) { const id = city.hoveredId; city.hoveredId = null; city._restore(id); }
});
canvas.addEventListener('pointerdown', (e) => { downPos = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; });
canvas.addEventListener('pointerup', (e) => {
  if (!city || !downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 5) return;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  const hit = city.hover(pointer, camera);
  const b = city.select(hit);
  showDetails(b);
});

// --- boot -----------------------------------------------------------------
async function loadModel(model) {
  validateModel(model);
  UI.setLoading(t('building the city …'));
  await new Promise(r => setTimeout(r, 30));
  cleanupA11y(); cleanupTimeline();
  showDetails(null); UI.showTooltip(null);
  city?.dispose();
  city = new City(model, scene, {asyncRouting:true});
  window.__codecity = city;
  await city.ready;
  groundSide = city.groundSide;
  city.camera = camera;
  city.setLodDistance(groundSide * 0.5);
  buildWorld(groundSide, model.buildings.length > 0);
  grid.visible = document.getElementById('chk-grid').checked && model.buildings.length > 0;
  cleanupTimeline = initTimeline(model.meta.history, city,{status:model.meta.historyStatus,onModelChanged:next=>{city.select(null);showDetails(null);cleanupA11y();cleanupA11y=initA11y(next,city,{onSelect:focusBuilding})||(()=>{});wireUI(next);},onPlaying:playing=>{
    construction.setPlaying(playing);
    if(playing){showDetails(null);city.select(null);resetView();}
  }}) || (() => {});
  cleanupA11y = initA11y(model, city, {onSelect: b => focusBuilding(b)}) || (() => {});
  document.getElementById('citylist').classList.remove('open');
  document.getElementById('empty-city').hidden = !!model.meta.root;
  document.body.classList.toggle('has-project',!!model.meta.root);
  wireUI(model); initPanels(); resetView(); controls.update(); translate();
  UI.setLoading(null);
  window.dispatchEvent(new CustomEvent('codecitymodelchange',{detail:model}));
}

async function boot() {
  initI18n(); initMode(); initHelp(); initAutoHide();
  const pauseMotion=document.getElementById('pause-motion');
  try{pauseMotion.checked=localStorage.getItem('codecity.pauseMotion')==='true';}catch{}
  pauseMotion.onchange=()=>{renderDirty=true;try{localStorage.setItem('codecity.pauseMotion',String(pauseMotion.checked));}catch{}};
  await initProjects(loadModel);
  await initProfile();
  UI.setLoading(t('loading city.json …'));
  let model;
  try {
    const res = await fetch('./city.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    model = await res.json();
    validateModel(model);
  } catch (err) {
    UI.setError(`Could not load the project (${err.message}). Start CodeCity with npm.`);
    return;
  }

  await loadModel(model);
  window.addEventListener('languagechange', () => {
    if (!city) return;
    UI.renderStats(city.model); UI.renderRoadStats(city);
    UI.renderLegend(city.mapping.color, city.model, city.mapping);
    initInvestigations(city.model,city,focusBuilding);renderSharedConnections(city,showConnection);
    if(activeConnection){showConnection(activeConnection);return;}
    showDetails(activeBuilding);
    updateHudOffset();
  });

  const clock = new THREE.Clock();
  let revision=-1;window.__renderCount=0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const moved=controls.update();
    const animated=!document.hidden&&!pauseMotion.checked&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(animated){landscape?.update(dt);construction?.update(dt);}
    if (city) {
      // detailed buildings near the camera target, low-detail ones far away
      city.setLodDistance(camera.position.distanceTo(controls.target) * 0.75);
      if(animated||moved||renderDirty)city.update(animated?dt:0);
      if(moved&&!animated)city._updateLOD();
    }
    if(moved||renderDirty||animated||revision!==city?.revision){
      renderer.render(scene,camera);window.__renderCount++;revision=city?.revision;renderDirty=false;
    }
  });
}

boot().catch((err) => UI.setError(`Could not build the city: ${err.message}. Check city.json and rebuild the model.`));
