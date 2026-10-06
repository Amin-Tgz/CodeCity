import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import fs from 'node:fs/promises';
import {packageLayout} from '../src/layout.js';
import {StreetRouter,Point3} from '../src/routing.js';
import {PickingIndex} from '../src/picking.js';
const require=createRequire(import.meta.url),{modelFromFiles}=require('../server/scanner.cjs'),results=[];
for(const size of [100,500,2000]) {
  const files=Array.from({length:size},(_,i)=>({file:`src/group${Math.floor(i/25)}/type${i}.ts`,text:`export class Type${i} { value=1; run() {if(this.value) return this.value;} }`}));
  const start=performance.now(),model=modelFromFiles(files,'benchmark'),analysisMs=performance.now()-start;
  // Separate linear-chain fixture for reproducible routing workload (all one terrace).
  const buildings=model.buildings.filter(b=>b.kind==='class').map(b=>({...b,district:'src'})),side=Math.min(260,Math.max(80,Math.sqrt(size)*11));
  const t=performance.now(),layout=packageLayout(buildings,{x:0,y:0,w:side,h:side}),layoutMs=performance.now()-t;
  const by=new Map(layout.buildings.map(p=>[p.b.id,{body:{id:p.b.id},group:{visible:true},center:{x:p.rect.x+p.rect.w/2,z:p.rect.y+p.rect.h/2},ground:new Point3(p.rect.x+p.rect.w/2,1.86,p.rect.y+p.rect.h/2),half:{w:p.rect.w*.25,d:p.rect.h*.25}}]));
  const roads=buildings.slice(1).map((b,i)=>({a:buildings[i].id,b:b.id,kind:'import',weight:1}));
  const rt=performance.now(),plan=new StreetRouter({roads},by,side).routePlan(),routingMs=performance.now()-rt;
  const index=new PickingIndex(by.values());let candidates=0;const pt=performance.now();
  for(let i=0;i<1000;i++)candidates+=index.candidates({origin:{x:(i%100)/100*side,y:100,z:-10},direction:{x:0,y:-.7,z:1}},{x:0,z:0},side).length;
  results.push({buildings:size,analysisMs:+analysisMs.toFixed(1),layoutMs:+layoutMs.toFixed(1),routingMs:+routingMs.toFixed(1),routed:plan.paths.length,unrouted:plan.unroutedEdges.length,pick1000Ms:+(performance.now()-pt).toFixed(1),averagePickCandidates:Math.round(candidates/1000)});
}
await fs.mkdir('output/benchmarks',{recursive:true});await fs.writeFile('output/benchmarks/latest.json',JSON.stringify({environment:{node:process.version,platform:process.platform},fixture:'synthetic classes + same-terrace linear dependencies',results},null,2));
console.table(results);
