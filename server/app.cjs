const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {emptyModel} = require('./scanner.cjs');
const {runAnalysis}=require('./analysis.cjs');
const {validateRules}=require('./exclusions.cjs');
const ASSET_ROOT = path.resolve(__dirname,'..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml'};
function launch(command,args) {
  return new Promise((resolve,reject)=>{
    const explorer=process.platform==='win32'&&path.win32.basename(command).toLowerCase()==='explorer.exe';
    const child=spawn(command,args,{stdio:'ignore',detached:true,windowsHide:true,windowsVerbatimArguments:explorer});
    child.once('error',reject);
    child.once('spawn',()=>{child.unref();resolve();});
  });
}
function revealCommand(file, platform=process.platform) {
  if(platform==='win32') {
    if(/["\r\n]/.test(file))throw Error('Invalid file path.');
    return [path.win32.join(process.env.SystemRoot||'C:\\Windows','explorer.exe'),[`/select,"${path.win32.normalize(file)}"`]];
  }
  if(platform==='darwin') return ['open',['-R',file]];
  return ['xdg-open',[path.dirname(file)]];
}
async function readBody(req) {
  const chunks=[];let bytes=0;
  for await(const chunk of req) {bytes+=chunk.length;if(bytes>131072) throw Error('Request too large.');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
}
function createApp({root=null,stateFile=path.join(os.homedir(),'.codecity','recent.json'),reveal=launch}={}) {
  const token=crypto.randomBytes(32).toString('hex');
  let model=emptyModel(),recent=[],busy=false,exclusionsByRoot={};
  const exclusionsFile=stateFile+'.exclusions.json';
  const snapshots=new Map();
  const pendingSnapshots=new Map();let projectEpoch=0;
  const ready=(async()=>{
    try { const data=JSON.parse(await fs.readFile(stateFile,'utf8'));if(Array.isArray(data)) recent=data.filter(p=>typeof p==='string').slice(0,10); } catch {}
    try{const saved=JSON.parse(await fs.readFile(exclusionsFile,'utf8'));if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const [key,value] of Object.entries(saved)){try{exclusionsByRoot[key]=validateRules(value);}catch{}}}catch{}
    if(root){const project=await fs.realpath(path.resolve(root));model=await runAnalysis('scan',project,undefined,{exclusions:exclusionsByRoot[project]||[]});}
  })();
  const saveRecent=async()=>{try {await fs.mkdir(path.dirname(stateFile),{recursive:true});await fs.writeFile(stateFile,JSON.stringify(recent));}catch{/* Read-only home does not prevent using projects. */}};
  const saveExclusions=async()=>{try{await fs.mkdir(path.dirname(exclusionsFile),{recursive:true});await fs.writeFile(exclusionsFile,JSON.stringify(exclusionsByRoot));}catch{model.meta.warnings.push('Exclusions apply for this session; settings could not be saved on this computer.');}};
  const server=http.createServer(async(req,res)=>{
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
    try {
      await ready;
      const host=req.headers.host||'';
      // Reject DNS rebinding and cross-origin websites before exposing local paths.
      if(!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) return json(403,{error:'Use localhost to access CodeCity.'});
      if(req.headers.origin&&req.headers.origin!==`http://${host}`) return json(403,{error:'Cross-origin requests are not allowed.'});
      const url=new URL(req.url,`http://${host}`);
      if(url.pathname==='/api/session'&&req.method==='GET') return json(200,{token,root:model.meta.root,recent,canReveal:true});
      if(url.pathname==='/city.json'&&req.method==='GET') return json(200,model);
      if(url.pathname.startsWith('/api/')) {
        if(req.headers['x-codecity-token']!==token) return json(403,{error:'Refresh CodeCity to reconnect.'});
        if(url.pathname==='/api/folders'&&req.method==='GET') {
          const requested=url.searchParams.get('path')||model.meta.root||os.homedir();
          const dir=await fs.realpath(path.resolve(requested));
          const entries=await fs.readdir(dir,{withFileTypes:true});
          const folders=entries.filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>({name:e.name,path:path.join(dir,e.name)})).sort((a,b)=>a.name.localeCompare(b.name));
          const roots=process.platform==='win32'?(await Promise.all('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(async l=>{try{await fs.access(l+':\\');return l+':\\';}catch{return null;}}))).filter(Boolean):['/'];
          return json(200,{path:dir,parent:path.dirname(dir),folders,roots});
        }
        if(req.method!=='POST') return json(405,{error:'Method not allowed.'});
        const body=await readBody(req);
        if(url.pathname==='/api/history/snapshot') {
          if(!model.meta.history?.frames.some(f=>f.hash===body.hash))return json(400,{error:'Choose a commit from this project timeline.'});
          const project=model.meta.root,epoch=projectEpoch;
          if(!snapshots.has(body.hash)) {
            const key=epoch+':'+body.hash;
            if(!pendingSnapshots.has(key))pendingSnapshots.set(key,runAnalysis('snapshot',project,body.hash,{exclusions:model.meta.exclusions?.rules||[]}).finally(()=>pendingSnapshots.delete(key)));
            const snapshot=await pendingSnapshots.get(key);
            if(epoch!==projectEpoch)return json(409,{error:'The open project changed. Select the commit again.'});
            if(snapshots.size>=3)snapshots.delete(snapshots.keys().next().value);snapshots.set(body.hash,snapshot);
          }
          return json(200,{model:snapshots.get(body.hash)});
        }
        if(url.pathname==='/api/source') {
          const building=model.buildings.find(b=>b.id===body.id);
          if(!building||!model.meta.root) return json(400,{error:'Select a building in the open project.'});
          const file=await fs.realpath(path.resolve(model.meta.root,building.file));
          const relative=path.relative(model.meta.root,file);
          if(relative.startsWith('..')||path.isAbsolute(relative))return json(403,{error:'File is outside the project.'});
          const stat=await fs.stat(file);if(stat.size>2_000_000)return json(400,{error:'Source exceeds the preview size limit.'});
          const text=await fs.readFile(file,'utf8');
          const member=Number.isInteger(body.member)?building.members?.[body.member]:null;
          if(body.member!=null&&!member)return json(400,{error:'Unknown member.'});
          const start=member?.line||building.start_line,end=member?.end_line||((member?.line||building.start_line)+(member?.loc||building.loc||1)-1);
          const lines=text.split(/\r?\n/),from=Math.max(1,start-3),to=Math.min(lines.length,end+3,from+399);
          return json(200,{file:building.file,path:file,start,end,from,lines:lines.slice(from-1,to),truncated:end>to,
            stale:!!building.source_hash&&crypto.createHash('sha256').update(text).digest('hex')!==building.source_hash});
        }
        if(url.pathname==='/api/project/open') {
          if(busy) return json(409,{error:'A project is already being scanned. Please wait.'});
          if(typeof body.path!=='string'||!body.path.trim()) return json(400,{error:'Choose a project folder.'});
          busy=true;
          try {const project=await fs.realpath(path.resolve(body.path.trim()));const rules=validateRules([...(exclusionsByRoot[project]||[]),...validateRules(body.exclusions)]);const next=await runAnalysis('scan',project,undefined,{exclusions:rules});model=next;projectEpoch++;snapshots.clear();exclusionsByRoot[project]=rules;await saveExclusions();recent=[model.meta.root,...recent.filter(p=>p!==model.meta.root)].slice(0,10);await saveRecent();return json(200,{model,recent});}finally{busy=false;}
        }
        if(url.pathname==='/api/project/exclusions') {
          if(busy)return json(409,{error:'Please wait for the scan.'});
          if(!model.meta.root||body.root!==model.meta.root)return json(409,{error:'The open project changed. Open exclusions again.'});
          const rules=validateRules(body.rules),project=model.meta.root;busy=true;
          try{const next=await runAnalysis('scan',project,undefined,{exclusions:rules});model=next;exclusionsByRoot[project]=rules;projectEpoch++;snapshots.clear();await saveExclusions();return json(200,{model});}finally{busy=false;}
        }
        if(url.pathname==='/api/project/close') {if(busy) return json(409,{error:'Please wait for the scan.'});model=emptyModel();projectEpoch++;snapshots.clear();return json(200,{model});}
        if(url.pathname==='/api/reveal') {
          if(!model.meta.root||typeof body.file!=='string'||!model.buildings.some(b=>b.file===body.file)) return json(400,{error:'Select a file from the open project.'});
          const file=await fs.realpath(path.resolve(model.meta.root,body.file));
          const relative=path.relative(model.meta.root,file);
          if(relative.startsWith('..')||path.isAbsolute(relative)) return json(403,{error:'File is outside the project.'});
          await reveal(...revealCommand(file));return json(200,{ok:true});
        }
        return json(404,{error:'Unknown action.'});
      }
      if(req.method!=='GET'&&req.method!=='HEAD') return json(405,{error:'Method not allowed.'});
      const name=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
      if(!/^(index\.html|styles\.css|(?:src|vendor)\/[\w.-]+\.js|assets\/[\w.-]+\.svg)$/.test(name)) return json(404,{error:'Not found.'});
      const data=await fs.readFile(path.join(ASSET_ROOT,name));
      res.writeHead(200,{'Content-Type':MIME[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"frame-ancestors 'none'"});
      res.end(req.method==='HEAD'?undefined:data);
    }catch(err){json(err.code==='ENOENT'?404:400,{error:err.code==='ENOENT'?'Folder or file no longer exists.':['EACCES','EPERM'].includes(err.code)?'Cannot access this folder. Choose a folder you have permission to read.':err.message});}
  });
  return {server,ready};
}
module.exports={createApp,revealCommand,launch};
