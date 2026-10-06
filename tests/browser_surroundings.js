import * as THREE from 'three';
import { Landscape, riverX } from '../src/landscape.js';
import { Construction } from '../src/construction.js';

// Run alongside browser_checks.js in a browser with the viewer's import map.
export async function runSurroundingsChecks() {
  const results=[];
  const assert=(v,message)=>{if(!v)throw Error(message);};
  const test=async(name,run)=>{try{await run();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});}};
  await test('trees leave code geometry, perimeter roads and river unobstructed',()=>{
    for(const side of [80,160,350]) {
      const world=new Landscape(side);
      try {
        assert(world.treePositions.length===250,'missing forest');
        for(const p of world.treePositions) {
          assert(Math.abs(p.x)>=side/2+25||Math.abs(p.z)>=side/2+25,'tree inside urban boundary');
          assert(Math.abs(p.x-riverX(p.z,side))>=side*.07,'tree inside river');
        }
      }finally{world.dispose();}
    }
  });
  await test('decorative birds animate and respect reduced motion',()=>{
    for(const reducedMotion of [false,true]) {
      const world=new Landscape(160,{reducedMotion});
      try {
        const before=Array.from(world.birds.instanceMatrix.array);world.update(1);
        const changed=before.some((v,i)=>v!==world.birds.instanceMatrix.array[i]);
        assert(changed===!reducedMotion,'motion preference ignored');
      }finally{world.dispose();}
    }
  });
  await test('replacing scenery releases shared GPU resources once',()=>{
    const world=new Landscape(160),scene=new THREE.Scene();scene.add(world.root);
    const resources=new Set(),counts=new Map();
    world.root.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of [].concat(o.material||[])){resources.add(m);if(m.map)resources.add(m.map);}});
    for(const r of resources){counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));}
    world.dispose();assert(scene.children.length===0,'landscape stays attached');
    assert([...counts.values()].every(n=>n===1),'shared geometry, material or texture leaked or double-disposed');
  });
  await test('landscape never enters the code building picker',()=>{
    assert(window.__landscape&&window.__codecity,'viewer missing');
    const ids=new Set();window.__landscape.root.traverse(o=>ids.add(o.uuid));
    const code=window.__codecity;
    for(const entry of code.byBuilding.values())assert(!ids.has(entry.body.uuid),'decoration is selectable code');
    assert(!document.getElementById('infra'),'infrastructure UI still present');
    assert(document.querySelectorAll('.quality-example svg').length===2,'illustrated quality guide missing');
  });
  await test('construction respects pause and reduced motion and releases resources',()=>{
    for(const reducedMotion of [false,true]) {
      const props=new Construction(160,{reducedMotion}),scene=new THREE.Scene();scene.add(props.root);
      const before=props.loaders[0].loader.position.clone();props.update(1);
      assert(props.loaders[0].loader.position.equals(before),'idle machinery moves');
      props.setPlaying(true);props.update(1);
      assert(props.loaders[0].loader.position.equals(before)===reducedMotion,'motion setting ignored');
      props.setPlaying(false);assert(!props.root.visible,'paused machinery remains');
      const resources=new Set(),counts=new Map();props.root.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)resources.add(o.material);});
      for(const r of resources){counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));}
      props.dispose();assert(scene.children.length===0&&[...counts.values()].every(n=>n===1),'construction resources leaked');
    }
  });
  return {passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
}
