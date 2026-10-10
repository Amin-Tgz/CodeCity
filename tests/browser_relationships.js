import * as THREE from 'three';
import {City} from '../src/city.js';
import {drawRelationshipDiagram} from '../src/relationship-diagram.js';
import {setLocale} from '../src/i18n.js';

export async function runRelationshipChecks() {
  const results=[],assert=(ok,message)=>{if(!ok)throw Error(message);};
  const check=async(name,run)=>{try{await run();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});}};
  const fixture=n=>({meta:{source:'scan',root:'fixture',totals:{buildings:n,districts:1,roads:4,loc:n*10}},districts:[{id:'src',name:'src',depth:1}],buildings:Array.from({length:n},(_,i)=>({id:'b'+i,name:'Building '+i,file:`src/b${i}.ts`,district:'src',kind:'class',language:'typescript',loc:10,nom:1,noa:1,methods:1,attributes:1,start_line:1,end_line:10,members:[]})),roads:[{a:'b0',b:'b1',weight:2},{a:'b1',b:'b0',weight:1},{a:'b2',b:'b0',weight:3},{a:'b0',b:'b0',weight:1}]});
  for(const n of [4,500])await check(`selection, finite pulse and restore with ${n} buildings`,()=>{
    const city=new City(fixture(n),new THREE.Scene());
    try {
      const a=city.byBuilding.get('b0'),b=city.byBuilding.get('b1'),c=city.byBuilding.get('b2'),other=city.byBuilding.get('b3');
      city.select(a.body);
      assert(!city.street.group.visible&&city.street.focusGroup.children.length===0,'default shows streets');
      assert(b.matFull.emissive.getHexString()==='c084fc'&&c.matFull.emissive.getHexString()==='38bdf8','direction colors wrong');
      assert(other.matFull.opacity===.24&&b.matFull.opacity===1&&a.matFull.opacity===1,'dimming wrong');
      const initial=b.matFull.emissiveIntensity;city.update(.2);assert(b.matFull.emissiveIntensity>initial,'pulse did not brighten');
      for(let i=0;i<8;i++)city.update(.1);
      assert(city.relationshipPulse===0&&b.matFull.emissiveIntensity===.45,'pulse did not settle');
      city.select(c.body);assert(b.matFull.opacity===.24&&a.matFull.emissive.getHexString()==='fbbf24','new selection kept old neighbors');
      city.setStreetMode('off');assert(b.matFull.opacity===1,'off kept dimming');city.setStreetMode('selected');
      city.select(null);assert([...city.byBuilding.values()].every(e=>e.matFull.opacity===1),'clear kept dimming');
      city.setStreetMode('all');assert(city.street.group.children.every(m=>!m.userData.connection),'floating shared mesh remains');
      if(city.instances)assert(city.instances.geometry.getAttribute('instanceOpacity').getX(other.instanceIndex)===1,'instance not restored');
      const pause=document.getElementById('pause-motion'),before=pause.checked;pause.checked=true;city.select(a.body);assert(city.relationshipPulse===0,'pause allowed pulse');pause.checked=before;
    }finally{city.dispose();}
  });
  await check('dependency map preserves directions, self links and keyboard navigation in Persian',()=>{
    const city=new City(fixture(4),new THREE.Scene()),host=document.createElement('div');document.body.append(host);
    try{
      setLocale('fa');let selected=null;drawRelationshipDiagram(host,city.model.buildings[0],city,b=>selected=b.id);
      assert(host.querySelector('h3').textContent==='نقشهٔ وابستگی‌ها','Persian heading missing');
      assert(host.querySelectorAll('.dependency-edge.incoming').length===2&&host.querySelectorAll('.dependency-edge.outgoing').length===1,'edges wrong');
      const node=host.querySelector('[data-building="b2"]');node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert(selected==='b2','keyboard node did not select');
      assert(host.textContent.includes('ارتباط با خودش: 1'),'self link missing');
    }finally{host.remove();city.dispose();}
  });
  return {passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
}
