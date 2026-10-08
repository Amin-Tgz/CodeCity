const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {scan,modelFromFiles,emptyModel}=require('../server/scanner.cjs');
const {createApp,revealCommand}=require('../server/app.cjs');
const {readHistory,framesFromLog}=require('../server/history.cjs');
const {execFileSync,spawnSync}=require('node:child_process');

test('history counts additions/deletions, ignores unrelated files, and samples endpoints',()=>{
  const log='@@abc123\t100\n3\t0\tsrc/نام file.js\n9\t0\tignored.js\n@@def456\t200\n0\t2\tsrc/نام file.js\n@@fff789\t300\n0\t1\tsrc/نام file.js\n';
  const frames=framesFromLog(log,['src/نام file.js']);
  assert.deepEqual(frames.map(f=>f.total),[3,1,0]);assert.equal(frames[2].files['src/نام file.js'],undefined);
  const long=Array.from({length:100},(_,i)=>`@@${i.toString(16)}\t${i+1}\n1\t0\tx.js\n`).join('');
  const sampled=framesFromLog(long,['x.js'],3);assert.equal(sampled.length,3);assert.equal(sampled[0].total,1);assert.equal(sampled.at(-1).total,100);
});
test('missing Git leaves project scanning usable and reports a clear history status',async()=>{
  const state=await readHistory('root',[],{run:async()=>{const e=Error('not installed');e.code='ENOENT';throw e;}});
  assert.deepEqual(state,{historyStatus:'no-git'});
});

test('Git ownership exception uses canonical slashes for Windows roots',async()=>{
  const calls=[];
  const state=await readHistory('D:\\Projects\\OpenCV',['a.cpp'],{run:async(command,args)=>{
    calls.push(args);return {stdout:args.includes('--numstat')?'@@'+'a'.repeat(40)+'\t100\n1\t0\ta.cpp\n':''};
  }});
  assert.equal(state.historyStatus,'available');
  assert.ok(calls.every(args=>args.includes('safe.directory=D:/Projects/OpenCV')));
});
test('portable history reads real commits for nested folders with Persian and spaced paths',{skip:spawnSync('git',['--version']).status!==0},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'codecity-history-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const hooks=path.join(root,'no-hooks');await fs.mkdir(hooks);
  const git=(...args)=>execFileSync('git',['-c','user.name=CodeCity Test','-c','user.email=test@example.invalid','-c',`core.hooksPath=${hooks}`,'-C',root,...args],{stdio:'pipe'});
  git('init');const sub=path.join(root,'backend');await fs.mkdir(sub);
  const file=path.join(sub,'نام file.js');await fs.writeFile(file,'function work() {\n}\n');
  git('add','.');git('commit','--no-gpg-sign','-m','first');
  await fs.appendFile(file,'function other() {\n}\n');git('add','.');git('commit','--no-gpg-sign','-m','grow');
  const state=await readHistory(sub,['نام file.js']);assert.equal(state.historyStatus,'available');
  assert.deepEqual(state.history.frames.map(f=>f.files['نام file.js']),[2,4]);
  const model=await scan(sub);assert.equal(model.meta.history.frames.length,2);
});

test('portable scanner resolves mixed Python, React, C++, Qt and Rust projects',()=>{
  const files=[
    ['backend/main.py','from .helper import run\nclass Server:\n    async def serve(self):\n        self.port = 80\n        run()\n'],
    ['backend/helper.py','def run():\n    return 1\n'],
    ['frontend/App.tsx',"import { Button } from './Button.js';\nexport function App() { return <Button/>; }\n"],
    ['frontend/Button.tsx','export function Button() { return <button/>; }\n'],
    ['native/main.cpp','#include "widget.hpp"\n#include "ui_window.h"\nint main() { return 0; }\n'],
    ['native/widget.hpp','class Widget {\npublic:\n  void show() { }\n};\n'],
    ['native/window.ui','<ui><class>Window</class><widget class="QWidget"/></ui>'],
    ['src/lib.rs','mod helper;\nfn entry() { }\n'],
    ['src/helper.rs','fn work() { }\n'],
  ].map(([file,text])=>({file,text}));
  const model=modelFromFiles(files,'project');
  for(const lang of ['python','typescript','cpp','qt','rust']) assert.ok(model.meta.languages[lang]);
  const connected=model.roads.map(r=>[model.buildings.find(b=>b.id===r.a).file,model.buildings.find(b=>b.id===r.b).file]);
  for(const pair of [['backend/main.py','backend/helper.py'],['frontend/App.tsx','frontend/Button.tsx'],['native/main.cpp','native/widget.hpp'],['native/main.cpp','native/window.ui'],['src/lib.rs','src/helper.rs']]) assert.ok(connected.some(p=>p.join('|')===pair.join('|')),JSON.stringify(pair));
  const server=model.buildings.find(b=>b.name==='Server');assert.equal(server.methods,1);assert.equal(server.attributes,1);
});
test('scanner ignores dependency trees, binary files and symlinks; unknown source still gets a building',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'codecity-scan-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.mkdir(path.join(dir,'node_modules'));await fs.writeFile(path.join(dir,'node_modules','ignored.js'),'function ignored() {}');
  await fs.writeFile(path.join(dir,'data.cpp'),Buffer.from([0,1,2]));
  await fs.writeFile(path.join(dir,'logic.custom'),'function custom() {}');
  await fs.writeFile(path.join(dir,'readme.md'),'# Hello');
  const model=await scan(dir);assert.equal(model.buildings.length,1);assert.equal(model.buildings[0].language,'other');
  await assert.rejects(()=>scan(path.join(dir,'absent')));
});
test('ambiguous package names do not create fabricated roads',()=>{
  const model=modelFromFiles([{file:'entry.js',text:"import 'thing';"},{file:'a/thing.js',text:'function a() {}'},{file:'b/thing.js',text:'function b() {}'}],'root');
  assert.equal(model.roads.length,0);
});
test('file manager commands work on Windows and Linux without a shell',()=>{
  const command=revealCommand('C:\\Project space\\file.cpp','win32');
  assert.equal(path.win32.basename(command[0]).toLowerCase(),'explorer.exe');
  assert.deepEqual(command[1],['/select,"C:\\Project space\\file.cpp"']);
  assert.throws(()=>revealCommand('C:\\bad"name.cpp','win32'));
  assert.deepEqual(revealCommand('/home/user/Project space/file.cpp','linux'),['xdg-open',['/home/user/Project space']]);
  assert.deepEqual(revealCommand('/Users/user/file.cpp','darwin'),['open',['-R','/Users/user/file.cpp']]);
});
test('project lifecycle persists recents, rejects cross-origin actions and reveals only project files',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'codecity-api-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const root=path.join(dir,'project');await fs.mkdir(root);await fs.writeFile(path.join(root,'entry.py'),'def entry():\n    return 1\n');
  const stateFile=path.join(dir,'state','recent.json'),revealed=[];
  const {server,ready}=createApp({stateFile,reveal:async(...args)=>revealed.push(args)});await ready;
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  let res=await fetch(base+'/city.json');assert.deepEqual(await res.json(),emptyModel());
  const session=await(await fetch(base+'/api/session')).json();
  const post=(action,body,extra={})=>fetch(base+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-CodeCity-Token':session.token,...extra},body:JSON.stringify(body)});
  assert.equal((await post('project/open',{path:root},{Origin:'https://evil.example'})).status,403);
  assert.equal((await post('project/open',{path:root},{'X-CodeCity-Token':'wrong'})).status,403);
  assert.equal((await fetch(base+'/server/app.cjs')).status,404);
  assert.equal((await fetch(base+'/.git/config')).status,404);
  res=await post('project/open',{path:root});assert.equal(res.status,200);const opened=await res.json();assert.equal(opened.model.buildings.length,1);
  assert.equal((await post('project/open',{path:path.join(root,'missing')})).status,404);
  assert.equal((await(await fetch(base+'/city.json')).json()).buildings.length,1);
  assert.equal((await post('reveal',{file:'../outside.py'})).status,400);
  assert.equal((await post('reveal',{file:'entry.py'})).status,200);assert.equal(revealed.length,1);
  const folders=await(await fetch(base+'/api/folders?path='+encodeURIComponent(dir),{headers:{'X-CodeCity-Token':session.token}})).json();assert.ok(folders.folders.some(f=>f.name==='project'));
  res=await post('project/close',{});assert.equal((await res.json()).model.buildings.length,0);
  assert.equal((await post('reveal',{file:'entry.py'})).status,400);
  assert.deepEqual(JSON.parse(await fs.readFile(stateFile,'utf8')),[opened.model.meta.root]);
});
