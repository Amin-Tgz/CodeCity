const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {createServerManager}=require('../extensions/vscode/server-manager.cjs');
function harness(timeoutMs=1000){
  const children=[];
  const manager=createServerManager({cliPath:'cli.cjs',timeoutMs,spawnProcess:()=>{
    const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
    child.killed=false;child.kill=()=>{child.killed=true;};children.push(child);return child;
  }});
  return {manager,children};
}
test('extension buffers split UTF-8 banners and shares pending launches only for the same root',async()=>{
  const {manager,children}=harness();const first=manager.start('one');assert.equal(manager.start('one'),first);
  const second=manager.start('two');assert.equal(children.length,2);
  const banner=Buffer.from('CodeCity → http://127.0.0.1:8123/\n');
  const split=Buffer.from('CodeCity ').length+1;
  children[0].stdout.write(banner.subarray(0,split));children[0].stdout.write(banner.subarray(split));
  children[1].stdout.write('CodeCity → http://127.0.0.1:8124/\n');
  assert.equal((await first).url,'http://127.0.0.1:8123/');assert.equal((await second).url,'http://127.0.0.1:8124/');
  manager.stopAll();assert.ok(children.every(c=>c.killed));
});
test('extension kills timed out children, includes diagnostics and allows retry',async()=>{
  const {manager,children}=harness(15);const pending=manager.start('root');children[0].stderr.write('useful diagnostic');
  await assert.rejects(pending,/Timed out.*\nuseful diagnostic/);assert.ok(children[0].killed);
  const retry=manager.start('root');children[1].stdout.write('CodeCity → http://127.0.0.1:8123/');await retry;manager.stopAll();
});
test('extension rejects exited processes immediately and cancels pending launches on deactivation',async()=>{
  const {manager,children}=harness();const pending=manager.start('root');children[0].emit('close',1,null);
  await assert.rejects(pending,/exited before startup/);
  const retry=manager.start('root');manager.stopAll();await assert.rejects(retry,/cancelled/);assert.ok(children[1].killed);
});
test('large JS/TS models bound syntax retention while retaining module references and exact metrics',()=>{
  const {modelFromFiles}=require('../server/scanner.cjs');
  const files=Array.from({length:300},(_,i)=>({file:`f${i}.ts`,text:`${i?`import { C${i-1} } from './f${i-1}.js';`:''}export class C${i} { run() { if(true) return 1; } }`}));
  const model=modelFromFiles(files,'large');assert.equal(model.meta.analysis.symbolResolution,'module-references');
  assert.equal(model.buildings.filter(b=>b.kind==='class').length,300);assert.equal(model.roads.length,299);
  assert.ok(model.meta.warnings.some(w=>w.includes('call edges are unavailable')));
  assert.ok(model.buildings.filter(b=>b.kind==='class').every(b=>b.nom===1&&b.complexity===2));
});
test('a few very large JS sources also skip whole-program retention',()=>{
  const {modelFromFiles}=require('../server/scanner.cjs');
  const model=modelFromFiles([{file:'a.ts',text:'/*'+'x'.repeat(4*1024*1024)+'*/\nexport class A {}'}],'large');
  assert.equal(model.meta.analysis.symbolResolution,'module-references');
});
test('static UI remains available during startup analysis and after an initial scan failure',async t=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'codecity-startup-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const {server,ready}=require('../server/app.cjs').createApp({root:path.join(dir,'missing'),stateFile:path.join(dir,'recent.json')});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base)).status,200);await assert.rejects(ready);
  const response=await fetch(base+'/city.json');assert.equal(response.status,404);
  assert.equal((await fetch(base+'/src/main.js')).status,200);
  const session=await(await fetch(base+'/api/session')).json();assert.ok(session.token);
  const project=path.join(dir,'valid');await fs.mkdir(project);await fs.writeFile(path.join(project,'a.ts'),'export class A {}');
  const opened=await fetch(base+'/api/project/open',{method:'POST',headers:{'Content-Type':'application/json','X-CodeCity-Token':session.token},body:JSON.stringify({path:project})});
  assert.equal(opened.status,200);assert.equal((await fetch(base+'/city.json')).status,200);
});
