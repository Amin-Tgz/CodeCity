const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {validateRules,matcher}=require('../server/exclusions.cjs');
const {modelFromFiles}=require('../server/scanner.cjs');
before(()=>require('../server/language-parsers.cjs').initialize());

test('root folder explains the old failure but cannot be newly submitted',()=>{
  assert.equal(matcher([{kind:'folder',value:'.'}]).file('src/a.ts'),true);
  for(const value of ['.','./.','.\\.'])assert.throws(()=>validateRules([{kind:'folder',value}],{allowRoot:false}),/project root/);
  for(const value of ['./','/'])assert.throws(()=>validateRules([{kind:'folder',value}],{allowRoot:false}));
  assert.equal(validateRules([{kind:'folder',value:'.'}]).length,1,'legacy settings remain readable');
});

test('nested and Persian folders exclude exact descendants and keep sibling names and declarations',async()=>{
  const files=[['main.ts','export class A {} export class B {}'],['src/nested/a.ts','export class Nested {}'],['src/nested-other/a.ts','export class Other {}'],['پوشه با فاصله/a.ts','export class Persian {}'],['outside/a.ts','export class Outside {}']].map(([file,text])=>({file,text}));
  const initial=modelFromFiles(files,'project');
  const target=initial.buildings.find(b=>b.name==='A');
  const next=modelFromFiles(files,'project',{exclusions:[{kind:'symbol',value:target.id},{kind:'folder',value:'src/nested'},{kind:'folder',value:'پوشه با فاصله'}]});
  (await import('../src/model.js')).validateModel(next);
  assert.deepEqual(new Set(next.buildings.filter(b=>b.kind==='class').map(b=>b.name)),new Set(['B','Other','Outside']));
  const ids=new Set(next.buildings.map(b=>b.id));assert.ok(next.roads.every(r=>ids.has(r.a)&&ids.has(r.b)));
});

test('API rejects new root exclusions, restores legacy root and isolates persisted projects',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'codecity-root-exclusion-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const a=path.join(dir,'a'),b=path.join(dir,'b'),stateFile=path.join(dir,'recent.json');
  for(const project of [a,b]){await fs.mkdir(project);await fs.writeFile(path.join(project,'main.ts'),'export class A {} export class B {}');}
  const canonical=await fs.realpath(a);
  await fs.writeFile(stateFile+'.exclusions.json',JSON.stringify({[canonical]:[{kind:'folder',value:'.'}]}));
  async function launch(){const app=require('../server/app.cjs').createApp({root:a,stateFile});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));const base=`http://127.0.0.1:${app.server.address().port}`,session=await(await fetch(base+'/api/session')).json();return {get:async()=>(await fetch(base+'/city.json')).json(),post:async(action,body)=>{const response=await fetch(base+'/api/'+action,{method:'POST',headers:{'X-CodeCity-Token':session.token,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};}};}
  const app=await launch();let m=await app.get();assert.equal(m.buildings.length,0);assert.equal(m.meta.exclusions.rules[0].value,'.');
  assert.equal((await app.post('project/exclusions',{root:canonical,rules:[{kind:'folder',value:'.'}]})).status,400);
  assert.equal((await app.post('project/open',{path:b,exclusions:[{kind:'folder',value:'.'}]})).status,400);
  m=(await app.post('project/exclusions',{root:canonical,rules:[]})).data.model;assert.ok(m.buildings.some(x=>x.name==='A'));
  const id=m.buildings.find(x=>x.name==='A').id,rules=[{kind:'symbol',value:id}];
  m=(await app.post('project/exclusions',{root:canonical,rules})).data.model;assert.ok(!m.buildings.some(x=>x.id===id));assert.ok(m.buildings.some(x=>x.name==='B'));
  m=(await app.post('project/open',{path:b})).data.model;assert.ok(m.buildings.some(x=>x.name==='A'));assert.equal(m.meta.exclusions.rules.length,0);
  m=(await app.post('project/open',{path:a})).data.model;assert.deepEqual(m.meta.exclusions.rules,rules);
  const restarted=await launch();m=await restarted.get();assert.deepEqual(m.meta.exclusions.rules,rules);
  m=(await restarted.post('project/exclusions',{root:canonical,rules:[]})).data.model;assert.ok(m.buildings.some(x=>x.name==='A'));
  assert.equal(await fs.readFile(path.join(a,'main.ts'),'utf8'),'export class A {} export class B {}');
});
