const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createApp}=require('../server/app.cjs');
const {DEFAULT_PROFILE}=require('../server/profile.cjs');

test('metric profile persists across app restarts and ports; unauthorized and invalid saves cannot overwrite it',async t=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'codecity-profile-'));
  t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  const stateFile=path.join(folder,'recent.json'),profileFile=path.join(folder,'profile.json');
  async function start() {
    const app=createApp({stateFile});await app.ready;
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    t.after(()=>new Promise(resolve=>app.server.close(resolve)));
    const base=`http://127.0.0.1:${app.server.address().port}`;
    const {token}=await(await fetch(base+'/api/session')).json();
    return {app,base,request:(method,body,headers={})=>fetch(base+'/api/profile',{method,headers:{'X-CodeCity-Token':token,...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})})};
  }
  const first=await start();
  assert.deepEqual((await(await first.request('GET')).json()).profile,DEFAULT_PROFILE);
  const desired={version:1,mapping:{height:'deps',footprint:'loc',color:'language',mode:'linear'}};
  assert.equal((await first.request('POST',desired,{'X-CodeCity-Token':'wrong'})).status,403);
  assert.equal((await first.request('POST',desired,{Origin:'https://example.org'})).status,403);
  assert.equal((await first.request('POST',desired)).status,200);
  assert.deepEqual(JSON.parse(await fs.readFile(profileFile,'utf8')),desired);
  assert.equal((await first.request('POST',{mapping:{...desired.mapping,height:'invalid'}})).status,400);
  assert.equal((await first.request('POST',{mapping:{color:'loc'}})).status,400);
  assert.deepEqual(JSON.parse(await fs.readFile(profileFile,'utf8')),desired);
  await new Promise(resolve=>first.app.server.close(resolve));
  const second=await start();
  assert.notEqual(second.base,first.base);
  assert.deepEqual((await(await second.request('GET')).json()).profile,desired);
  assert.deepEqual((await fs.readdir(folder)).sort(),['profile.json']);
});

test('a corrupt profile falls back to usable defaults without modifying the file',async t=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'codecity-profile-bad-'));
  t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  const profileFile=path.join(folder,'profile.json');await fs.writeFile(profileFile,'broken');
  const app=createApp({stateFile:path.join(folder,'recent.json')});await app.ready;
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>app.server.close(resolve)));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const {token}=await(await fetch(base+'/api/session')).json();
  const res=await fetch(base+'/api/profile',{headers:{'X-CodeCity-Token':token}});
  assert.deepEqual((await res.json()).profile,DEFAULT_PROFILE);
  assert.equal(await fs.readFile(profileFile,'utf8'),'broken');
});
