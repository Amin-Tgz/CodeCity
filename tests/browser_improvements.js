import * as THREE from 'three';
import {City} from '../src/city.js';
export async function runImprovementChecks() {
  const results=[],assert=(ok,message)=>{if(!ok)throw Error(message);};
  const check=async(name,run)=>{try{results.push({name,passed:true,...await run()});}catch(e){results.push({name,passed:false,error:e.message});}};
  const actual=window.__codecity;
  await check('2. Member source highlights its range and metrics open their evidence',async()=>{
    const b=actual.model.buildings.find(b=>b.members?.some(m=>m.kind==='method'));assert(b,'fixture has no method');
    document.getElementById('list-btn').click();const f=document.getElementById('list-filter');f.value=b.name;f.dispatchEvent(new Event('input'));[...document.querySelectorAll('.list-row')].find(row=>row.dataset.id===b.id).click();document.getElementById('list-close').click();
    const i=b.members.findIndex(m=>m.kind==='method');document.querySelector(`.member-list [data-mi="${i}"]`).click();
    for(let n=0;n<30&&!document.querySelector('.selected-line');n++)await new Promise(r=>setTimeout(r,100));
    assert(Number(document.querySelector('.selected-line')?.dataset.line)===b.members[i].line,'member highlight starts at wrong line');
    document.querySelector('.metric-explain[data-metric="nom"]').click();assert(document.querySelector('.metric-evidence').open,'metric evidence stayed closed');document.getElementById('details-close').click();
  });
  await check('3. Recolouring preserves meshes, positions, routes and selected/filter state',()=>{
    const street=actual.street,entries=[...actual.byBuilding.values()],positions=entries.map(e=>e.center.toArray()),first=entries[0];
    actual.select(first.body);actual.applyFilter(first.building.district);actual.setMapping({color:'language'});
    assert(actual.street===street,'streets rebuilt');assert(JSON.stringify(positions)===JSON.stringify([...actual.byBuilding.values()].map(e=>e.center.toArray())),'positions moved');assert(actual.selected===first.body,'selection lost');assert(actual.filterId===first.building.district,'filter lost');actual.applyFilter(null);actual.select(null);actual.setMapping({color:'loc'});
  });
  const fixture=n=>({meta:{root:'fixture',source:'scan',languages:{typescript:n},totals:{buildings:n,districts:2,roads:n-1,loc:n*10}},districts:[{id:'.',name:'Fixture',depth:0},{id:'src',name:'src',depth:1}],buildings:Array.from({length:n},(_,i)=>({id:'b'+i,name:'B'+i,file:'src/B'+i+'.ts',kind:'class',language:'typescript',district:'src',start_line:1,end_line:10,loc:10,nom:1,noa:1,methods:1,attributes:1,functions:0,members:[]})),roads:Array.from({length:n-1},(_,i)=>({a:'b'+i,b:'b'+(i+1),kind:'import',weight:1}))});
  const benchmarks=[];
  for(const n of [100,500,2000])await check(`6. ${n} buildings: worker routes, picking parity and GPU rendering`,async()=>{
    const scene=new THREE.Scene(),model=fixture(n),start=performance.now(),city=new City(model,scene,{asyncRouting:true});
    let renderer;
    try {
      const camera=new THREE.PerspectiveCamera(50,1,.1,2000);camera.position.set(300,300,300);camera.lookAt(0,0,0);camera.updateMatrixWorld();
      await city.ready;const buildMs=performance.now()-start;
      const canvas=document.createElement('canvas');renderer=new THREE.WebGLRenderer({canvas});renderer.setSize(128,128);scene.add(new THREE.AmbientLight(0xffffff,2));renderer.render(scene,camera);
      assert(n<500?!city.instances:city.instances?.count===n,'instancing threshold/count incorrect');
      assert(city.street.worker===null&&city.street._built,'worker did not finish');assert(city.street.paths.reduce((n,p)=>n+(p.shared?p.edges.length:1),0)+city.street.unroutedEdges.length===model.roads.length,'edges disappeared');
      assert(n<500||renderer.info.render.calls<10,'buildings still render one mesh per draw call');
      for(let i=0;i<20;i++) {
        const e=city.byBuilding.get('b'+Math.floor(i*n/20)),target=e.center.clone().add(city.root.position),ray=new THREE.Raycaster(new THREE.Vector3(target.x,1000,target.z),new THREE.Vector3(0,-1,0));
        const all=ray.intersectObjects(city.pickables,false),subset=ray.intersectObjects(city.pickingIndex.candidates(ray.ray,city.root.position,city.groundSide),false);
        assert(all[0]?.object===subset[0]?.object,'spatial picking differs from exhaustive raycast');
      }
      const first=city.byBuilding.get('b0');city.select(first.body);city.highlightSubset(['b0']);city.applyFilter('src');renderer.render(scene,camera);assert(first.matFull.opacity===1,'selection visibility wrong');
      const row={buildings:n,buildMs:Math.round(buildMs),drawCalls:renderer.info.render.calls,routed:city.street.paths.length};benchmarks.push(row);return row;
    }finally{city.dispose();renderer?.dispose();renderer?.forceContextLoss();}
  });
  await check('6. Paused motion renders only on changes',async()=>{
    const pause=document.getElementById('pause-motion');pause.checked=true;pause.dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,900));const before=window.__renderCount;await new Promise(r=>setTimeout(r,400));assert(window.__renderCount===before,'static scene keeps rendering');document.getElementById('reset-view').click();await new Promise(r=>setTimeout(r,100));assert(window.__renderCount>before,'scene did not redraw after interaction');pause.checked=false;pause.dispatchEvent(new Event('change'));
  });
  return {passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results,benchmarks};
}

export async function runStructuralHistoryChecks() {
  const c=window.__codecity,assert=(ok,message)=>{if(!ok)throw Error(message);},range=document.getElementById('tl-range'),mode=document.getElementById('history-mode'),current=c.model;
  assert(current.meta.history?.frames.length,'Use the three-commit history fixture.');
  mode.value='structural';mode.dispatchEvent(new Event('change'));range.value='0';range.dispatchEvent(new Event('input'));
  for(let i=0;i<80&&!c.model.meta.commit;i++)await new Promise(r=>setTimeout(r,100));await c.ready;
  assert(c.model.buildings.some(b=>b.name==='Deleted'),'deleted class absent');assert(c.model.roads.some(r=>r.kind==='call'),'old calls absent');
  const positions=new Map([...c.byBuilding].map(([id,e])=>[id,[e.center.x,e.center.z]]));
  document.getElementById('list-btn').click();[...document.querySelectorAll('.list-row')].find(row=>row.textContent.includes('Deleted')).click();document.getElementById('list-close').click();document.querySelector('.source-section > button').click();
  assert(document.querySelector('.source-preview').textContent.includes('gone()'),'old source absent');assert(document.querySelector('.source-section > a').hidden,'historical preview linked to current editor file');
  document.getElementById('history-compare').click();await c.ready;
  assert([...positions].every(([id,p])=>c.byBuilding.get(id).center.x===p[0]&&c.byBuilding.get(id).center.z===p[1]),'comparison moved buildings');
  const ghost=c.model.buildings.find(b=>b.comparison_status==='removed');assert(ghost?.name==='Deleted','removed ghost absent');assert(c.byBuilding.get(ghost.id).matFull.emissive.getHexString()==='22c55e','removed ghost colour incorrect');
  range.value=range.max;range.dispatchEvent(new Event('input'));await c.ready;assert(c.model===current&&c.model.roads.length===0,'current structure not restored');
  mode.value='approximate';mode.dispatchEvent(new Event('change'));range.value='0';range.dispatchEvent(new Event('input'));assert(c.historyFrame&&!c.model.meta.commit,'approximate growth not explicitly separate');range.value=range.max;range.dispatchEvent(new Event('input'));
  return {deletedClass:true,oldGraph:true,historicalPreview:true,fixedComparisonPositions:true,removedGhost:true,currentRestored:true,approximateMode:true};
}
