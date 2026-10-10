import assert from 'node:assert/strict';
import { diffAgainst } from '../src/compare.js';
import { treemap } from '../src/layout.js';
import { validateModel } from '../src/model.js';
import {StreetRouter,Point3} from '../src/routing.js';
import {sharedConnections,directConnections,connectionWidth} from '../src/connections.js';
import inspectionMessages from '../src/inspection-strings.js';
import {validateProfile} from '../server/profile.cjs';

let passed = 0;
function test(name, run) { run(); passed++; console.log(`PASS ${name}`); }
test('comparison accounts for new, changed and deleted LOC', () => {
  const diff = diffAgainst({buildings: [{id:'a',loc:10}, {id:'b',loc:7}]}, {buildings:[{id:'a',loc:8}, {id:'c',loc:4}]});
  assert.deepEqual(diff.stats, {added:1, changed:1, removed:1, locDelta:5});
});
test('invalid baselines are rejected', () => {
  for (const value of [null, {}, {buildings:[{id:'a',loc:-1}]}, {buildings:[{id:'a',loc:1},{id:'a',loc:2}]}]) assert.throws(() => diffAgainst({buildings:[]}, value));
});
test('treemap preserves area, bounds, identity and non-overlap', () => {
  const items = Array.from({length:80}, (_, i) => ({value:1 + i % 13, id:i}));
  const result = treemap(items, {x:2,y:3,w:100,h:70});
  const total = items.reduce((s, b) => s + b.value, 0);
  assert.equal(result.length, items.length);
  for (const {item, rect:r} of result) {
    assert.ok([r.x,r.y,r.w,r.h].every(Number.isFinite));
    assert.ok(r.x >= 2-1e-8 && r.y >= 3-1e-8 && r.x+r.w <= 102+1e-8 && r.y+r.h <= 73+1e-8);
    assert.ok(Math.abs(r.w*r.h - 7000*item.value/total) < 1e-7);
  }
  for (let i=0;i<result.length;i++) for(let j=i+1;j<result.length;j++) {
    const a=result[i].rect, b=result[j].rect;
    assert.ok(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x) < 1e-7 || Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y) < 1e-7);
  }
  assert.deepEqual(treemap([{value:0}], {x:0,y:0,w:10,h:10}), []);
});
test('malformed models report a useful error', () => {
  assert.throws(() => validateModel({}), /Invalid city model/);
  const model = {meta:{totals:{buildings:0,districts:0,roads:0,loc:0}},buildings:[],districts:[],roads:[]};
  assert.equal(validateModel(model), model);
  assert.throws(() => validateModel({...model,roads:[{a:'ghost',b:'other',weight:1}]}), /invalid road/);
});
test('more than 2500 links across terraces retain every edge and its evidence',()=>{
  const by=new Map([['a',{ground:new Point3(3,1,3),half:{w:.5,d:.5},district:'core',roofY:10}],['b',{ground:new Point3(15,2,15),half:{w:.5,d:.5},district:'ui',roofY:20}]]);
  const roads=Array.from({length:2502},(_,i)=>({a:'a',b:'b',kind:i%2?'call':'import',weight:i%3+1,evidence:[{line:i+1}]}));
  roads.push({a:'b',b:'a',weight:2});
  const plan=new StreetRouter({roads},by,20).routePlan();
  assert.equal(plan.unroutedEdges.length,0);assert.equal(plan.paths.length,2);
  const edges=plan.paths.flatMap(p=>p.edges);assert.equal(edges.length,roads.length);
  assert.deepEqual(edges.flatMap(e=>e.evidence||[]).map(e=>e.line).sort((a,b)=>a-b),roads.flatMap(e=>e.evidence||[]).map(e=>e.line).sort((a,b)=>a-b));
  assert.equal(plan.paths[0].weight,roads.slice(0,-1).reduce((n,e)=>n+e.weight,0));
  assert.ok(plan.paths.every(p=>p.pts.every(point=>point.y>20)));
  assert.notDeepEqual(plan.paths[0].pts,plan.paths[1].pts);
  const direct=directConnections(roads,by);assert.equal(direct.length,roads.length);
  assert.equal(direct[0].pts[0].y,10.6);assert.equal(direct[0].pts.at(-1).y,20.6);
});
test('internal bundles and self dependencies have nonzero paths; filters preserve correct weight',()=>{
  const by=new Map([['a',{ground:new Point3(3,1,3),district:'core'}],['b',{ground:new Point3(15,1,15),district:'core'}]]);
  const edges=[{a:'a',b:'a',weight:1},{a:'a',b:'b',weight:12}];
  const bundle=sharedConnections(edges,by)[0];assert.equal(bundle.weight,13);
  assert.ok(bundle.pts.some(p=>p.x!==bundle.pts[0].x));
  assert.ok(connectionWidth(13)>connectionWidth(1));
  assert.equal(sharedConnections(edges.filter(e=>e.b==='a'),by)[0].weight,1);
  assert.ok(directConnections([edges[0]],by)[0].pts.some(p=>p.z!==3));
});
test('all investigation and relationship messages cover all seven translated languages',()=>{
  for(const [key,values] of Object.entries(inspectionMessages)){
    assert.equal(values.length,7,key);for(const value of values){assert.ok(value.length,key);assert.deepEqual([...value.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),[...key.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),key);}
  }
});
test('old coverage profiles migrate to lines without losing other preferences',()=>{
  assert.deepEqual(validateProfile({mapping:{height:'deps',footprint:'loc',color:'coverage',mode:'linear'}}).mapping,{height:'deps',footprint:'loc',color:'loc',mode:'linear'});
});
console.log(`${passed} frontend unit tests passed`);
