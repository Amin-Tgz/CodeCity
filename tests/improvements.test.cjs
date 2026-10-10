const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {modelFromFiles}=require('../server/scanner.cjs');
before(()=>require('../server/language-parsers.cjs').initialize());
const model=files=>modelFromFiles(files.map(([file,text])=>({file,text})),'project');

test('1. JS/TS grammar, aliases, source evidence, generated classification and stable IDs',()=>{
  const files=[['src/a.ts',`import { Target as Alias } from './b.js';
export class A<T> {
  #private = '}';
  readonly value: T;
  async run(arg: T): Promise<void> { if(arg) new Alias().work(); }
  field = (n: number) => n;
}`],['src/b.ts','export class Target { work() {} }'],['src/generated/g.ts','// @generated\nexport class Auto {}']];
  const m=model(files),a=m.buildings.find(b=>b.name==='A');
  assert.equal(a.nom,1);assert.equal(a.noa,3);assert.equal(a.analysis.parser,'typescript');assert.equal(a.analysis.confidence,'high');
  assert.equal(a.members.find(m=>m.name==='run').end_line,5);assert.equal(a.complexity,2);
  assert.equal(a.metric_evidence.nom.value,1);assert.ok(m.buildings.find(b=>b.name==='Auto').generated);
  assert.ok(m.roads.some(r=>r.kind==='call'&&r.a===a.id&&m.buildings.find(b=>b.id===r.b).name==='Target'&&r.evidence.some(e=>e.alias==='Alias')));
  const shifted=model(files.map(([f,t])=>[f,'\n\n'+t]));assert.equal(shifted.buildings.find(b=>b.name==='A').id,a.id);
});
test('1. Python, Java, C# and Go use grammar adapters with exact member ranges',()=>{
  for(const [file,text,name,methods,attrs] of [
    ['a.py','class A:\n    count=0\n    async def run(self):\n        self.x=1\n','A',1,2],
    ['A.java','class A {\n int x, y;\n void run() { if (x>0) x--; }\n}\n','A',1,2],
    ['A.cs','class A {\n int x;\n public int Value { get; set; }\n void Run() {}\n}\n','A',1,2],
    ['a.go','package a\ntype A struct {\n x int\n}\nfunc (a *A) Run() {}\n','A',1,1],
  ]){const b=model([[file,text]]).buildings.find(b=>b.name===name);assert.ok(b,file);assert.ok(b.analysis.parser.startsWith('tree-sitter-'));assert.equal(b.analysis.confidence,'high',file);assert.equal(b.nom,methods,file);assert.equal(b.noa,attrs,file);assert.ok(b.members.every(m=>m.end_line>=m.line));}
});
test('1. Unsupported syntax is disclosed rather than marked exact',()=>{
  for(const [file,text] of [['a.ts','class A { run( {'],['a.py','class A:\n    def broken(\n']]) {const b=model([[file,text]]).buildings[0];assert.equal(b.analysis.confidence,'low');assert.ok(b.analysis.diagnostics.length);}
});
test('1. Generated markers inside literals do not misclassify authored JS/Python',()=>{
  const m=model([['a.ts',"const fixture = '// @generated do not edit'; export class Authored {}"],['a.py',"message = '# @generated do not edit'\nclass Authored:\n    pass\n"],['generated.ts','// @generated do not edit\nexport class Auto {}']]);
  assert.ok(m.buildings.filter(b=>b.name==='Authored').every(b=>b.generated===false));assert.equal(m.buildings.find(b=>b.name==='Auto').generated,true);
});
test('1. Checker follows re-exports and namespace aliases without fabricating shadowed calls',()=>{
  const m=model([['a.ts',"import * as ns from './barrel'; import {Target as Alias} from './b'; function local(Alias: () => void) { Alias(); } export function run() { new ns.Target(); }"],['barrel.ts',"export {Target} from './b';"],['b.ts','export class Target { work() {} }']]);
  const calls=m.roads.filter(r=>r.kind==='call');assert.equal(calls.length,1);assert.equal(calls[0].weight,1);assert.equal(calls[0].evidence[0].alias,'ns.Target');
});

test('2. Source API serves only scanned sources, validates member ranges and detects stale content',async t=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'codecity-source-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.writeFile(path.join(dir,'a.ts'),'export class A {\n  run() {\n    return 1;\n  }\n}\n');
  const {server,ready}=require('../server/app.cjs').createApp({root:dir,stateFile:path.join(dir,'recent.json')});await ready;
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`,session=await(await fetch(base+'/api/session')).json(),m=await(await fetch(base+'/city.json')).json(),b=m.buildings.find(b=>b.name==='A');
  const source=body=>fetch(base+'/api/source',{method:'POST',headers:{'Content-Type':'application/json','X-CodeCity-Token':session.token},body:JSON.stringify(body)});
  assert.equal((await source({id:'../outside'})).status,400);assert.equal((await source({id:b.id,member:99})).status,400);
  const data=await(await source({id:b.id,member:0})).json();assert.equal(data.start,2);assert.equal(data.end,4);assert.equal(data.stale,false);assert.ok(data.lines.some(s=>s.includes('return 1')));
  await fs.appendFile(path.join(dir,'a.ts'),'// changed\n');assert.equal((await(await source({id:b.id})).json()).stale,true);
});

test('3. Nested packages contain child rectangles and never overlap siblings/buildings',async()=>{
  const {packageLayout}=await import('../src/layout.js');
  const bs=[{id:'a',district:'src',noa:3},{id:'b',district:'src/core',noa:2},{id:'c',district:'src/core/deep',noa:1},{id:'d',district:'test',noa:5}];
  const layout=packageLayout(bs,{x:0,y:0,w:100,h:80}),packages=new Map(layout.packages.map(p=>[p.item.key,p]));
  const inside=(a,b)=>a.x>=b.x&&a.y>=b.y&&a.x+a.w<=b.x+b.w+1e-8&&a.y+a.h<=b.y+b.h+1e-8;
  for(const p of layout.packages)if(p.item.key!=='.'){const parts=p.item.key.split('/');assert.ok(inside(p.rect,packages.get(parts.length>1?parts.slice(0,-1).join('/'):'.').rect));}
  for(const p of layout.buildings)assert.ok(inside(p.rect,packages.get(p.district).rect));
  for(const [i,a] of layout.buildings.entries())for(const b of layout.buildings.slice(i+1)){const overlap=Math.min(a.rect.x+a.rect.w,b.rect.x+b.rect.w)-Math.max(a.rect.x,b.rect.x)>1e-8&&Math.min(a.rect.y+a.rect.h,b.rect.y+b.rect.h)-Math.max(a.rect.y,b.rect.y)>1e-8;assert.equal(overlap,false);}
});
test('4. Presets use explicit evidence, distinct fan-out and cycles',async()=>{
  const {graphIndex,rankCandidates,editorLink}=await import('../src/investigation.js');
  const buildings=Array.from({length:7},(_,i)=>({id:String(i),name:String(i),loc:300,coverage:i===0?0:i===1?null:.8,complexity:i===0?20:null,generated:i===2,churn:4}));
  const roads=buildings.slice(1).map(b=>({a:'0',b:b.id,kind:'import',weight:1}));roads.push({a:'0',b:'1',kind:'call',weight:3},{a:'1',b:'0',kind:'call',weight:1});
  const m={buildings,roads,meta:{}},graph=graphIndex(m);assert.deepEqual(graph.components.get('0').sort(),['0','1']);
  assert.equal(rankCandidates(m,'fan-out')[0].fanOut,6);assert.deepEqual(rankCandidates(m,'complexity').map(b=>b.id),['0']);assert.equal(rankCandidates(m,'churn').length,6);
  assert.throws(()=>editorLink('javascript:{path}','x',1));assert.equal(editorLink('vscode://file/{path}:{line}','D:/a b/x.ts',12),'vscode://file/D%3A/a%20b/x.ts:12');
});

test('5. Real commit snapshots restore deleted classes, old calls and member boundaries; file renames retain identity',async t=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'codecity-structure-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',['-c','user.name=Test','-c','user.email=test@example.invalid','-c','core.hooksPath='+path.join(root,'nohooks'),'-C',root,...args],{encoding:'utf8'}).trim();
  git('init');await fs.mkdir(path.join(root,'nested'));const file=path.join(root,'nested','old.ts');
  await fs.writeFile(file,'export class Kept {\n run() {\n return 1;\n }\n}\nexport class Deleted {gone() {}}\n');
  await fs.writeFile(path.join(root,'nested','entry.ts'),"import {Deleted} from './old';\nexport function run() { new Deleted(); }\n");
  git('add','.');git('commit','--no-gpg-sign','-m','first');const first=git('rev-parse','HEAD');
  git('mv','nested/old.ts','nested/renamed.ts');git('commit','--no-gpg-sign','-am','rename');const renamed=git('rev-parse','HEAD');
  await fs.writeFile(path.join(root,'nested','renamed.ts'),'export class Kept { changed() {} }\n');await fs.writeFile(path.join(root,'nested','entry.ts'),'export function run() {}\n');git('commit','--no-gpg-sign','-am','remove');
  const {readSnapshot}=require('../server/history.cjs'),a=await readSnapshot(path.join(root,'nested'),first),b=await readSnapshot(path.join(root,'nested'),renamed),c=await readSnapshot(path.join(root,'nested'),git('rev-parse','HEAD'));
  const kept=a.buildings.find(b=>b.name==='Kept');assert.equal(kept.id,b.buildings.find(b=>b.name==='Kept').id);assert.equal(kept.id,c.buildings.find(b=>b.name==='Kept').id);assert.equal(kept.file,'old.ts');
  assert.equal(kept.members[0].end_line,4);assert.ok(a.buildings.some(b=>b.name==='Deleted'));assert.ok(!c.buildings.some(b=>b.name==='Deleted'));
  assert.ok(a.roads.some(r=>r.kind==='call'));assert.equal(c.roads.length,0);assert.ok(a.meta.snapshotSources['old.ts'].includes('Deleted'));
  const excluded=await readSnapshot(path.join(root,'nested'),first,{exclusions:[{kind:'symbol',value:'renamed.ts::class:Kept'}]});assert.ok(!excluded.buildings.some(b=>b.name==='Kept'));assert.ok(excluded.buildings.some(b=>b.name==='Deleted'));
  const {diffAgainst}=await import('../src/compare.js');const diff=diffAgainst(c,a);assert.ok(diff.stats.removed>=1);assert.ok(diff.stats.changed>=1);
  const history=await require('../server/history.cjs').readHistory(path.join(root,'nested'),['renamed.ts','entry.ts']);assert.equal(history.churn['renamed.ts'],3,'rename should retain earlier file-touch evidence');
});

test('6. Analysis workers match direct scanning and release the event loop',async t=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'codecity-worker-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.writeFile(path.join(dir,'a.ts'),'export class A {run() {}}');let ticks=0;const timer=setInterval(()=>ticks++,5);
  try{const result=await require('../server/analysis.cjs').runAnalysis('scan',dir);const direct=await require('../server/scanner.cjs').scan(dir);assert.deepEqual(result.buildings,direct.buildings);assert.ok(ticks>=2,'event loop blocked during analysis');}finally{clearInterval(timer);}
});
