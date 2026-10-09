const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);

function framesFromLog(log, paths, maxFrames=96) {
  const lines=log.split(/\r?\n/),count=lines.filter(l=>/^@@[a-f0-9]+\t\d+$/.test(l)).length;
  if(!count)return [];
  const wanted=new Set(Array.from({length:Math.min(count,maxFrames)},(_,i)=>Math.round(i*(count-1)/Math.max(1,Math.min(count,maxFrames)-1))));
  const allowed=new Set(paths),files=Object.create(null),frames=[];
  let current=null,index=-1;
  const save=()=>{if(current&&wanted.has(index))frames.push({...current,files:{...files},total:Object.values(files).reduce((a,b)=>a+b,0)});};
  for(const line of lines) {
    const match=line.match(/^@@([a-f0-9]+)\t(\d+)$/);
    if(match){save();index++;current={hash:match[1],t:Number(match[2])};continue;}
    const stat=line.match(/^(\d+)\t(\d+)\t(.+)$/);
    if(!stat||!current)continue;
    let file=stat[3];
    if(file.startsWith('"')){try{file=JSON.parse(file);}catch{continue;}}
    if(!allowed.has(file))continue;
    const loc=Math.max(0,(files[file]||0)+Number(stat[1])-Number(stat[2]));
    if(loc)files[file]=loc;else delete files[file];
  }
  save();return frames;
}
async function readHistory(root, paths, {run=execute}={}) {
  const options={cwd:root,encoding:'utf8',timeout:12000,maxBuffer:24*1024*1024,windowsHide:true};
  const args=['-c',`safe.directory=${root.replaceAll('\\','/')}`,'-c','core.quotepath=false','--no-pager'];
  try {
    await run('git',[...args,'rev-parse','--is-inside-work-tree'],options);
    const {stdout}=await run('git',[...args,'log','--reverse','--topo-order','--no-merges','--no-renames','--no-ext-diff','--no-textconv','--relative','--format=@@%H%x09%ct','--numstat','--','.'],options);
    const frames=framesFromLog(stdout,paths);
    const renames=(await run('git',[...args,'log','--format=','--name-status','-z','--relative','--find-renames=50%','--','.'],options)).stdout;
    const canonical=renameMap(renames),churn=Object.create(null),allowed=new Set(paths);let touched=new Set();
    const save=()=>{for(const file of touched)churn[file]=(churn[file]||0)+1;touched=new Set();};
    for(const line of stdout.split(/\r?\n/)) {
      if(line.startsWith('@@')){save();continue;}
      const m=line.match(/^\d+\t\d+\t(.+)$/);if(m){const file=canonical.get(m[1])||m[1];if(allowed.has(file))touched.add(file);}
    }
    save();
    return frames.length?{history:{unit:'net lines',approximate:true,frames},churn,historyStatus:'available'}:{historyStatus:'empty'};
  }catch(err) {
    return {historyStatus:err.code==='ENOENT'?'no-git':/not a git repository/i.test(err.stderr||'')?'not-repository':/does not have any commits/i.test(err.stderr||'')?'empty':'unavailable'};
  }
}

function renameMap(log) {
  const fields=log.split('\0'),canonical=new Map();
  for(let i=0;i<fields.length;i++)if(/^R\d+$/.test(fields[i].trim())){const old=fields[++i],next=fields[++i];canonical.set(old,canonical.get(next)||next);}
  return canonical;
}

async function readSnapshot(root,hash,{run=execute,exclusions=[]}={}) {
  if(!/^[a-f0-9]{40,64}$/.test(hash))throw Error('Invalid commit.');
  const scanner=require('./scanner.cjs');await require('./language-parsers.cjs').initialize();
  const options={cwd:root,encoding:'utf8',timeout:30000,maxBuffer:64*1024*1024,windowsHide:true};
  const args=['-c',`safe.directory=${root.replaceAll('\\','/')}`,'-c','core.quotepath=false','--no-pager'];
  const prefix=(await run('git',[...args,'rev-parse','--show-prefix'],options)).stdout.trim();
  const renames=(await run('git',[...args,'log','--format=','--name-status','-z','--relative','--find-renames=50%',`${hash}..HEAD`,'--','.'],options)).stdout;
  const canonical=renameMap(renames);
  const listing=(await run('git',[...args,'ls-tree','-rz','--long','--full-tree',hash,'--',prefix||'.'],options)).stdout;
  const entries=[];
  const exclude=require('./exclusions.cjs').matcher(exclusions);
  for(const row of listing.split('\0')) {
    const m=row.match(/^(100644|100755) blob ([a-f0-9]+)\s+(\d+)\t(.+)$/s);if(!m)continue;
    const file=m[4].slice(prefix.length);if(file.split('/').some(p=>scanner.SKIP.has(p)||p.startsWith('.')))continue;
    // Match the scanner's size limit and skip files it rejects regardless of content.
    if(Number(m[3])>scanner.MAX_BYTES||!scanner.isSource(file,'class Candidate'))continue;
    if(exclude.file(file)||exclude.file(canonical.get(file)||file))continue;
    entries.push({file,oid:m[2]});
  }
  if(entries.length>20000)throw Error('Historical tree exceeds the 20,000-file snapshot limit.');
  const files=await require('./git-blob-reader.cjs').readSourceBlobs(root,args,entries);
  const model=scanner.modelFromFiles(files,root,{exclusions,canonicalFiles:canonical});
  // Follow detected Git renames forward to HEAD, retaining commit-local paths for previews.
  const ids=new Map();
  for(const b of model.buildings){const file=canonical.get(b.file)||b.file;const id=file+b.id.slice(b.file.length);ids.set(b.id,id);b.id=id;b.canonical_file=file;}
  for(const r of model.roads){r.a=ids.get(r.a);r.b=ids.get(r.b);}
  Object.assign(model.meta,{commit:hash,historyMode:'structural',identity:'Git-detected file renames + qualified declaration names; symbol renames are additions/removals.'});
  model.meta.snapshotSources=Object.fromEntries(files.map(f=>[f.file,f.text]));
  return model;
}
module.exports={readHistory,framesFromLog,readSnapshot};
