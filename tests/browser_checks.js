import * as THREE from 'three';
import { City } from '../src/city.js';
import { METRICS, boxplot, categoryFor, makeRampCanvas, locColor } from '../src/metrics.js';
import { t } from '../src/i18n.js';

// Run in the viewer: (await import('./tests/browser_checks.js')).runBrowserChecks()
export async function runBrowserChecks() {
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const test = async (name, run, skip = false) => {
    if (skip) { results.push({name, skipped:true}); return; }
    try { await run(); results.push({name, passed:true}); }
    catch (e) { results.push({name, passed:false, error:e.message}); }
  };
  const b = (id, district, n) => ({id, name:id, file:`${district}/${id}.py`, district, kind:'class', language:'python', loc:n*10, methods:n, attributes:n, functions:0, nom:n, noa:n, start_line:1, members:[]});
  const model = {meta:{totals:{buildings:3,districts:2,roads:2,loc:60},languages:{python:3}},
    districts:[{id:'a',name:'a',depth:1},{id:'b',name:'b',depth:2}],
    buildings:[b('one','a',1),b('two','a',2),b('three','b',3)],
    roads:[{a:'one',b:'two',weight:2},{a:'two',b:'three',weight:1}]};
  const scene = new THREE.Scene();
  const city = new City(model, scene);
  await test('unroutable dependencies do not produce intersecting fallback roads', () => {
    const nearest = city.street._nearestFree;
    city.street._nearestFree = () => null;
    try { assert(city.street._routeEdge(model.roads[0], {}, 0) === null, 'unsafe road fabricated'); }
    finally { city.street._nearestFree = nearest; }
  });
  await test('dependency degrees include both endpoints', () => assert(model.buildings[1].deps === 3 && METRICS.deps.get({deps:0}) === 0, 'wrong degrees'));
  await test('all 240 mapping combinations produce finite building geometry', () => {
    const matrix = new City({...model,roads:[]}, new THREE.Scene());
    for (const height of ['nom','noa','loc','deps']) for (const footprint of ['nom','noa','loc','deps'])
      for (const color of ['nom','noa','loc','deps','language']) for (const mode of ['boxplot','linear','threshold']) {
        matrix.setMapping({height,footprint,color,mode});
        assert(matrix.byBuilding.size === 3 && matrix.root.children.length === 5, 'missing buildings or leaked groups');
        for (const e of matrix.byBuilding.values()) assert(Object.values(e.body.geometry.parameters).every(Number.isFinite), 'nonfinite geometry');
      }
    matrix._disposeGroup(matrix.buildingGroup); matrix._disposeGroup(matrix.platesGroup); matrix.street.dispose();
  });
  await test('coverage distinguishes unknown from zero', () => {
    city.model.buildings[0].coverage = 0;
    city.setMapping({color:'coverage'});
    assert(city.byBuilding.get('one').matFull.color.getHexString() !== city.byBuilding.get('two').matFull.color.getHexString(), 'unknown shown as zero');
  });
  await test('district filter and selection survive a mapping rebuild', () => {
    city.applyFilter('a'); city.select(city.byBuilding.get('one').body); city.setMapping({height:'loc'});
    assert(!city.byBuilding.get('three').group.visible && city.selected.userData.buildingId === 'one', 'state lost');
  });
  await test('filtered roads exclude invisible endpoints', () => {
    assert(city.street.walkers.length === 2, 'hidden road pedestrians remain');
    assert(city.street.visibleIds.size === 2, 'wrong road filter');
  });
  await test('hidden meshes are excluded from picking', () => {
    city.raycaster.setFromCamera = () => {};
    city.raycaster.intersectObjects = (meshes) => {
      assert(meshes.every((m) => m.parent.visible), 'hidden mesh passed to raycaster'); return [];
    };
    city.hover(new THREE.Vector2(), new THREE.PerspectiveCamera());
  });
  await test('comparison colour is restored after hover and remapping', () => {
    city.select(null); city.applyDiff(new Map(model.buildings.map((x) => [x.id,{...x,loc:x.loc-2}])));
    city.hoveredId = 'one'; city._restore('one'); city.hoveredId = null; city._restore('one');
    city.setMapping({height:'nom'});
    assert(city.byBuilding.get('one').matFull.emissive.getHexString() === 'ef4444', 'diff tint lost');
  });
  await test('clearing compare preserves query highlighting', () => {
    city.highlightSubset(['one']); city.clearDiff();
    assert(city.querySet.has('one') && city.byBuilding.get('two').matFull.opacity === .12, 'query cleared');
  });
  await test('history and district filters compose and survive remapping', () => {
    city.setHistoryFrame({files:{'a/one.py':5,'b/three.py':15}}, {'a/one.py':10,'b/three.py':30});
    city.setMapping({footprint:'loc'});
    assert(city.byBuilding.get('one').group.visible && !city.byBuilding.get('two').group.visible && !city.byBuilding.get('three').group.visible, 'wrong history visibility');
    assert(city.byBuilding.get('one').body.scale.y === .5, 'history height lost');
    city.setHistoryFrame(null, {}); city.applyFilter(null);
    assert([...city.byBuilding.values()].every((e) => e.group.visible && e.body.scale.y === 1), 'current model not restored');
  });
  await test('mapping categories and horizontal ramp', () => {
    const stats = boxplot([0,1,2,3,100]);
    assert(categoryFor(100,stats,'boxplot','nom') === 4, 'outlier not classified');
    const ramp = makeRampCanvas(locColor), ctx = ramp.getContext('2d', {willReadFrequently:true});
    assert(ramp.width > ramp.height, 'vertical legend');
    assert(ctx.getImageData(0,0,1,1).data[0] !== ctx.getImageData(127,0,1,1).data[0], 'no horizontal colour change');
  });
  await test('empty city renders without invalid geometry', () => {
    const empty = new City({meta:{},buildings:[],districts:[],roads:[]}, new THREE.Scene());
    assert(empty.byBuilding.size === 0 && empty.groundSide === 80, 'empty model failed');
    empty.street.dispose();
  });
  const actual = window.__codecity;
  const change = (id, value) => { const el=document.getElementById(id); el.value=value; el.dispatchEvent(new Event('change')); };
  await test('search opens building details and selects incident streets', () => {
    const first=actual.model.buildings[0];
    document.getElementById('search').value=first.name;
    document.getElementById('search-form').dispatchEvent(new Event('submit',{cancelable:true}));
    assert(actual.focusId === first.id && document.getElementById('details').classList.contains('open'), 'search failed');
  });
  await test('query UI tags matches and clear restores it', () => {
    document.getElementById('query').value='loc>=0';
    document.getElementById('query-form').dispatchEvent(new Event('submit',{cancelable:true}));
    assert(actual.querySet.size === actual.model.buildings.length, 'query count incorrect');
    document.getElementById('query-clear').click(); assert(actual.querySet === null, 'clear failed');
  });
  await test('all dropdown options and legend update without group leaks', () => {
    for (const id of ['sel-height','sel-footprint','sel-color','sel-mode']) {
      for (const option of document.getElementById(id).options) {
        change(id,option.value);
        assert(actual.root.children.length === 5 && actual.byBuilding.size === actual.model.buildings.length, 'rebuild lost buildings or leaked groups');
      }
    }
    assert(document.querySelector('.legend-notes').textContent.includes(t('test coverage')), 'legend stayed on LOC');
    change('sel-height','nom'); change('sel-footprint','noa'); change('sel-color','loc'); change('sel-mode','boxplot');
  });
  await test('street all, selected and off modes', () => {
    change('sel-streets','selected'); assert(actual.street.focusGroup.visible === !!actual.focusId && !actual.street.group.visible, 'selected mode failed');
    change('sel-streets','off'); assert(!actual.street.group.visible && !actual.street.focusGroup.visible && !actual.street.walkerGroup.visible, 'off mode failed');
    change('sel-streets','all'); assert(actual.street.group.visible, 'all mode failed');
  });
  await test('building list filter and selection', () => {
    document.getElementById('list-btn').click();
    const input=document.getElementById('list-filter'); input.value=actual.model.buildings[0].name; input.dispatchEvent(new Event('input'));
    const row=document.querySelector('.list-row'); assert(row, 'missing list result'); row.click();
    assert(actual.selected.userData.buildingId === row.dataset.id, 'list did not select');
    document.getElementById('list-close').click();
  });
  await test('help open and Escape close', () => {
    document.getElementById('help-btn').click(); assert(document.getElementById('help').classList.contains('open'), 'help closed');
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); assert(!document.getElementById('help').classList.contains('open'), 'help stayed open');
  });
  await test('auto-orbit, reset and grid toggles', () => {
    const button=document.getElementById('auto-rotate'); button.click(); assert(button.classList.contains('active'), 'orbit failed'); button.click();
    const grid=document.getElementById('chk-grid'); grid.click(); grid.click(); document.getElementById('reset-view').click();
  });
  await test('member drill-down pulses selected building', () => {
    const building=actual.model.buildings.find((b) => b.members?.length);
    if (!building) throw new Error('model has no members for this check');
    document.getElementById('search').value=building.name;
    document.getElementById('search-form').dispatchEvent(new Event('submit',{cancelable:true}));
    document.querySelector('.member-row').click(); assert(actual.pulseId === actual.selected.userData.buildingId, 'member pulse missing');
  });
  await test('history current snapshot and playback start/stop', async () => {
    const range=document.getElementById('tl-range'); range.value='0'; range.dispatchEvent(new Event('input'));
    const snapshot = actual.historyFrame;
    change('filter', actual.model.districts.at(-1).id);
    assert(actual.historyFrame === snapshot, 'district UI reset the timeline');
    change('filter', '');
    change('sel-height','loc'); assert(actual.historyFrame, 'history lost on remap');
    document.getElementById('tl-play').click(); await new Promise((r)=>setTimeout(r,350)); document.getElementById('tl-play').click();
    range.value=range.max; range.dispatchEvent(new Event('input'));
    assert([...actual.byBuilding.values()].every((e)=>e.group.visible), 'current snapshot hides uncommitted files');
    change('sel-height','nom');
  }, !actual.model.meta.history);
  // Clean up the synthetic scene's materials and return structured results.
  city._disposeGroup(city.buildingGroup); city._disposeGroup(city.platesGroup); city.street.dispose();
  document.getElementById('details-close')?.click();
  return {passed:results.filter((r)=>r.passed).length, failed:results.filter((r)=>!r.passed&&!r.skipped).length, skipped:results.filter(r=>r.skipped).length, results};
}
