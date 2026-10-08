const fs=require('node:fs/promises'),path=require('node:path');
const normalize=s=>s.replaceAll('\\','/');
async function readCompileCommands(root,warnings) {
  for(const relative of ['compile_commands.json','build/compile_commands.json']) {
    const filename=path.join(root,relative);
    try {
      if((await fs.stat(filename)).size>20_000_000){warnings.push('Compilation database exceeds 20 MB: '+relative);continue;}
      const entries=JSON.parse(await fs.readFile(filename,'utf8'));
      if(!Array.isArray(entries))throw Error('expected an array');
      const commands=[];
      for(const entry of entries.slice(0,20000)) {
        if(typeof entry.file!=='string'||typeof entry.directory!=='string')continue;
        const directory=path.resolve(root,entry.directory),file=normalize(path.relative(root,path.resolve(directory,entry.file)));
        const tokens=Array.isArray(entry.arguments)?entry.arguments:typeof entry.command==='string'?(entry.command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)||[]).map(s=>s.replace(/["']/g,'')):[];
        const dirs=[],quoteDirs=[];
        for(let i=0;i<tokens.length;i++) {
          const token=tokens[i];if(typeof token!=='string')continue;
          const m=token.match(/^(-I|-isystem|-iquote|\/I)(.*)$/);if(!m)continue;
          const value=m[2]||tokens[++i];if(typeof value!=='string')continue;
          const dir=normalize(path.relative(root,path.resolve(directory,value)));
          // Only scanned project sources can become graph endpoints.
          if(dir==='..'||dir.startsWith('../')||path.isAbsolute(dir))continue;
          (m[1]==='-iquote'?quoteDirs:dirs).push(dir||'.');
        }
        commands.push({file,dirs,quoteDirs});
      }
      return {source:relative,commands};
    }catch(e){if(e.code!=='ENOENT')warnings.push('Cannot read compilation database '+relative+': '+e.message);}
  }
  return {source:null,commands:[]};
}
function createResolver(parsed,{commands=[]}={}) {
  const byFile=new Map(parsed.map(f=>[f.file,f])),refs=new Map(),commandsByFile=new Map();
  for(const c of commands){if(!commandsByFile.has(c.file))commandsByFile.set(c.file,[]);commandsByFile.get(c.file).push(c);}
  const add=(ref,file)=>{if(!refs.has(ref))refs.set(ref,new Set());refs.get(ref).add(file);};
  for(const f of parsed.filter(f=>['c','cpp'].includes(f.lang))) {
    add(path.posix.basename(f.file),f.file);
    // Public include roots, including OpenCV's modules/*/include/opencv2/… .
    for(const m of f.file.matchAll(/(?:^|\/)(?:include|includes|inc)\//g))add(f.file.slice(m.index+m[0].length),f.file);
  }
  return (f,include)=>{
    const ref=normalize(include.ref);
    if(include.quoted){const local=path.posix.normalize(path.posix.join(path.posix.dirname(f.file),ref));if(byFile.has(local))return {target:local,reason:'relative include',confidence:'high'};}
    const qt=path.posix.join(path.posix.dirname(f.file),ref.replace(/(^|\/)ui_([^/]+)\.h$/,'$1$2.ui'));
    if(byFile.has(qt)&&qt.endsWith('.ui'))return {target:qt,reason:'Qt generated header maps to UI source',confidence:'medium'};
    const configs=commandsByFile.get(f.file);
    if(configs?.length) {
      const targets=new Set();
      for(const c of configs)for(const dir of [...(include.quoted?c.quoteDirs:[]),...c.dirs]) {
        const candidate=path.posix.normalize(path.posix.join(dir,ref));if(byFile.has(candidate)){targets.add(candidate);break;}
      }
      if(targets.size===1)return {target:[...targets][0],reason:'compilation database include path',confidence:'high'};
      return {reason:targets.size?'ambiguous compilation configurations':'unresolved include in compilation database',candidates:[...targets]};
    }
    if(byFile.has(ref))return {target:ref,reason:'project-relative include',confidence:'medium'};
    const candidates=[...(refs.get(ref)||[])];
    if(candidates.length===1)return {target:candidates[0],reason:'unique inferred include root',confidence:'medium'};
    return {reason:candidates.length?'ambiguous include':'unresolved include (external, generated or missing)',candidates};
  };
}
module.exports={readCompileCommands,createResolver};
