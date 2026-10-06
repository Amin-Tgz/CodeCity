// Portable heuristic scanner. Never runs project code or loads its dependencies.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {parse:parseJS} = require('./js-parser.cjs');
const languageParsers=require('./language-parsers.cjs');
const SKIP = new Set(['.git','.hg','.svn','.codegraph','node_modules','vendor','third_party','__pycache__','.venv','venv','env','.next','dist','build','out','output','coverage','target','bin','obj','.gradle','.idea','.cache','.tox','.playwright-mcp']);
const GROUPS = {
  python:'py pyi pyw', javascript:'js jsx mjs cjs', typescript:'ts tsx mts cts',
  c:'c h', cpp:'cpp cc cxx hpp hh hxx ino', csharp:'cs', java:'java', kotlin:'kt kts',
  go:'go', rust:'rs', ruby:'rb rake', php:'php phtml', swift:'swift', scala:'scala sc',
  vue:'vue', svelte:'svelte', qml:'qml', qt:'ui qrc', html:'html htm', css:'css scss sass less',
  dart:'dart', objectivec:'m mm', shell:'sh bash zsh fish', powershell:'ps1 psm1',
  lua:'lua', r:'r', julia:'jl', elixir:'ex exs', erlang:'erl hrl', haskell:'hs lhs',
  clojure:'clj cljs cljc', fsharp:'fs fsx', ocaml:'ml mli', perl:'pl pm', sql:'sql',
  fortran:'f f90 f95', cobol:'cob cbl', assembly:'asm s', zig:'zig', nim:'nim',
  groovy:'groovy', solidity:'sol', config:'json yaml yml toml xml cmake', markdown:'md mdx',
};
const EXT = Object.fromEntries(Object.entries(GROUPS).flatMap(([lang, exts]) => exts.split(' ').map(e => ['.'+e, lang])));
const MAX_BYTES = 2_000_000;
const MAX_FILES = 20_000;
const normalize = s => s.replaceAll('\\','/');

function emptyModel(root = '') {
  return {meta:{root,source:'scan',languages:{},totals:{buildings:0,districts:0,roads:0,loc:0,nodes:0,edges:0},warnings:[],scanner:'portable',precision:'estimated'},buildings:[],districts:[],roads:[]};
}
function language(file) { return EXT[path.extname(file).toLowerCase()] || 'other'; }
function isSource(file, text) {
  const ext = path.extname(file).toLowerCase();
  if (['config','markdown'].includes(language(file))) return false;
  return !!EXT[ext] || /^(Dockerfile|Makefile|CMakeLists\.txt|Rakefile)$/i.test(path.basename(file)) ||
    /\b(class|function|def|func|fn|module|package|import|include)\s+\w/.test(text);
}
function imports(text, lang) {
  const found = new Set();
  const rules = [
    /\b(?:from|import|export)\s+(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/g,
    /\b(?:require|import|include|include_once|require_once)\s*\(?\s*["']([^"']+)["']/g,
    /#\s*include\s*[<"]([^>"\n]+)[>"]/g,
    /\b(?:use|using|import)\s+([\w.:\\/]+)\s*[;\n]/g,
    /\bmod\s+(\w+)\s*;/g,
    /\b(?:require_relative|require|load)\s+["']([^"']+)["']/g,
    /\b(?:source|\.)\s+["']?([\w./-]+)/g,
    /(?:src|href)\s*=\s*["']([^"']+)["']/g,
  ];
  if (lang === 'python') {
    for (const m of text.matchAll(/^\s*from\s+([.\w]+)\s+import\s+([^\n#]+)/gm)) {
      found.add(m[1]);
      for (const item of m[2].replace(/[()]/g,'').split(',')) {
        const name = item.trim().split(/\s/)[0];
        if (/^\w+$/.test(name)) found.add(m[1] + (m[1].endsWith('.') ? '' : '.') + name);
      }
    }
    for (const m of text.matchAll(/^\s*import\s+([^\n#]+)/gm))
      for (const item of m[1].split(',')) found.add(item.trim().split(/\s/)[0]);
  }
  for (const re of rules) for (const m of text.matchAll(re)) found.add(m[1]);
  return [...found];
}
function analyzeFile(file, text) {
  const lang = language(file), lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  const loc = lines.length;
  if(['javascript','typescript'].includes(lang)) return parseJS(file,text);
  const syntax=languageParsers.parse(file,text,lang);if(syntax)return {...syntax,imports:imports(text,lang)};
  const district = normalize(path.dirname(file));
  const members = [];
  for (let i=0;i<lines.length;i++) {
    const line = lines[i];
    const match = line.match(/^\s*(?:async\s+)?(?:def|function|func|fn|fun|sub|procedure)\s+(?:\([^)]*\)\s*)?([\w$]+)\s*\(/) ||
      line.match(/^\s*(?:(?:public|private|protected|static|virtual|override|async|export|inline|const|final|abstract)\s+)*(?:[\w:<>,*&?\[\]]+\s+)?([\w$]+)\s*\([^;]*\)\s*(?:const\s*)?(?:\{|=>)/) ||
      line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/);
    if (match && !['if','for','while','switch','catch','with','return','new','throw','else','try'].includes(match[1])) members.push({name:match[1],kind:'method',line:i+1,loc:1});
  }
  const attrs = new Set([...text.matchAll(/\b(?:self|this)\.([\w$]+)\s*(?::[^=\n]+)?=(?!=)/g)].map(m=>m[1]));
  const classRE = /^\s*(?:(?:export|default|public|private|abstract|final|sealed|partial|data|open)\s+)*(?:class|struct|interface|trait|enum)\s+([\w$]+)/;
  const classes = [];
  for (let i=0;i<lines.length;i++) {
    const m=lines[i].match(classRE); if (!m) continue;
    let end=i+1;
    if (lang==='python') {
      const indent=lines[i].search(/\S/);
      while(end<lines.length && (!lines[end].trim() || lines[end].search(/\S/)>indent)) end++;
    } else {
      let depth=0, opened=false;
      for(;end<=lines.length;end++) {
        const code=lines[end-1].replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*$/g,'');
        for(const ch of code) { if(ch==='{'){depth++;opened=true;} if(ch==='}') depth--; }
        if(opened && depth<=0) break;
        if(!opened && /;\s*$/.test(code)) break;
      }
      end=Math.min(lines.length,end);
    }
    const body=lines.slice(i,end).join('\n');
    classes.push({name:m[1],start:i,end,attrs:new Set([...body.matchAll(/\b(?:self|this)\.([\w$]+)\s*(?::[^=\n]+)?=(?!=)/g)].map(x=>x[1])).size});
  }
  const make = (name,kind,start,count,ms,noa) => ({id:`${file}::${kind}:${name}`,name,kind,file,district,language:lang,loc:count,methods:ms.length,attributes:noa,functions:kind==='module'?ms.length:0,nom:ms.length,noa,deps:0,start_line:start,end_line:start+Math.max(0,count-1),members:ms,analysis:{parser:lang+'-heuristic',version:'2',source:'source scan',confidence:'low',limitations:['Language adapter estimates declarations; no compiler or complete call graph.']}});
  const buildings=classes.map(c=>make(c.name,'class',c.start+1,c.end-c.start,members.filter(m=>m.line>c.start && m.line<=c.end),c.attrs));
  const outside=members.filter(m=>!classes.some(c=>m.line>c.start && m.line<=c.end));
  const remainder=lines.filter((line,i)=>line.trim()&&!classes.some(c=>i>=c.start&&i<c.end)).length;
  if(!classes.length || outside.length || remainder) buildings.push(make(path.basename(file),'module',1,classes.length?remainder:loc,outside,classes.length?0:attrs.size));
  return {file,lang,loc,buildings,imports:imports(text,lang),text};
}
function modelFromFiles(files, root) {
  const model=emptyModel(root), parsed=files.map(f=>analyzeFile(normalize(f.file),f.text));
  const byFile=new Map(parsed.map(f=>[f.file,f]));
  const aliases=new Map();
  const alias = (name, file) => { if(!aliases.has(name)) aliases.set(name,file); else if(aliases.get(name)!==file) aliases.set(name,null); };
  for(const f of parsed) {
    model.buildings.push(...f.buildings);
    model.meta.totals.loc+=f.loc;
    model.meta.languages[f.lang]=(model.meta.languages[f.lang]||0)+1;
    const stem=f.file.replace(/\.[^/.]+$/,'');
    alias(stem,f.file); alias(stem.replace(/\//g,'.'),f.file); alias(path.basename(stem),f.file);
    if(/\/__init__$/.test(stem)) alias(stem.replace(/\/__init__$/,'').replace(/\//g,'.'),f.file);
    const pkg=f.text.match(/\b(?:package|namespace)\s+([\w.]+)/);
    if(pkg) alias(pkg[1]+'.'+path.basename(stem),f.file);
  }
  const resolve = (f, ref) => {
    if(/^(https?:|data:)/.test(ref)) return null;
    const candidates=[];
    if(f.lang==='python') {
      const dots=ref.match(/^\.+/)?.[0].length||0;
      const suffix=ref.slice(dots).replaceAll('.','/');
      const base=dots?path.posix.join(path.posix.dirname(f.file),'../'.repeat(dots-1),suffix):suffix;
      candidates.push(base,base+'/__init__');
    } else {
      const cleaned=ref.replace(/::/g,'/').replace(/^crate\//,'').replace(/^@\//,'src/').replace(/\\/g,'/');
      candidates.push(path.posix.join(path.posix.dirname(f.file),cleaned), cleaned, cleaned.replaceAll('.','/'));
      if(f.lang==='rust') candidates.push('src/'+cleaned,'src/'+cleaned+'/mod');
    }
    for(const c of [...candidates]) candidates.push(c+'/index');
    for(const c of candidates) {
      if(byFile.has(c)) return c;
      if(aliases.get(c)) return aliases.get(c);
      // TS imports commonly spell the emitted .js suffix.
      const stem=c.replace(/\.(?:js|mjs|cjs)$/,''); if(aliases.get(stem)) return aliases.get(stem);
      const qt=c.replace(/(^|\/)ui_([^/]+)\.h$/,'$1$2.ui'); if(byFile.has(qt)) return qt;
    }
    return aliases.get(ref)||null;
  };
  const roads=new Map();
  for(const f of parsed) for(const ref of f.imports) {
    const target=resolve(f,ref); if(!target||target===f.file) continue;
    const a=f.buildings.find(b=>b.kind==='module')||f.buildings[0];
    const b=byFile.get(target)?.buildings[0]; if(!a||!b) continue;
    const key=a.id+'\0'+b.id;
    if(!roads.has(key)) roads.set(key,{a:a.id,b:b.id,kind:'import',weight:1});
  }
  const ownerFile=new Map(parsed.flatMap(f=>f.buildings.map(b=>[b.id,f])));
  // The compiler checker resolves aliases/re-exports and respects lexical shadowing.
  for(const edge of require('./js-parser.cjs').resolveSymbols(parsed)) {
    const source=ownerFile.get(edge.a),target=ownerFile.get(edge.b);
    if(source&&target){const primary=source.buildings.find(b=>b.kind==='module')||source.buildings[0];roads.delete(primary.id+'\0'+target.buildings[0].id);}
    const key=edge.a+'\0'+edge.b+'\0'+edge.kind;
    if(roads.has(key)){const r=roads.get(key);r.weight+=edge.weight;r.evidence.push(...edge.evidence);}else roads.set(key,edge);
  }
  model.roads=[...roads.values()];
  for(const r of model.roads){r.confidence ||= 'low';r.evidence ||= [{description:'Resolved module reference; endpoints aggregate file imports.'}];}
  for(const f of parsed) {
    const comments=f._headerComments||[...f.text.slice(0,1024).matchAll(/^\s*(?:\/\/|#|\/\*+|\*|<!--|--|;|%).*$/gm)].map(m=>m[0]);
    const generated=/(^|\/)(generated|__generated__)(\/|$)|\.(g|generated|min)\./i.test(f.file)||comments.some(c=>/@generated|auto[- ]generated|do not edit/i.test(c));
    const digest=crypto.createHash('sha256').update(f.text).digest('hex');
    for(const b of f.buildings){b.generated=generated;b.source_hash=digest;b.analysis.generatedReason=generated?'Generated path or header marker':'No generated marker detected';
      b.metric_evidence={loc:{value:b.loc,rule:b.analysis.source==='syntax AST'?'Physical declaration range; module excludes type ranges':'Estimated source range',range:[b.start_line,b.end_line]},nom:{value:b.nom,rule:'Declared methods/functions',members:b.members.filter(m=>m.kind==='method').map(m=>m.name)},noa:{value:b.noa,rule:'Declared/assigned fields',members:b.members.filter(m=>m.kind==='attribute').map(m=>m.name)}};
      if(b.complexity!=null)b.metric_evidence.complexity={value:b.complexity,rule:'1 per declared method plus syntactic branch/loop decisions; not runtime paths'};
    }
  }
  const stableIds=new Map();for(const b of model.buildings){const id=b.kind==='module'?`${b.file}::module`:b.id;stableIds.set(b.id,id);b.id=id;}
  for(const r of model.roads){r.a=stableIds.get(r.a);r.b=stableIds.get(r.b);}
  model.meta.schemaVersion=2;
  model.meta.analysis={source:'scan',version:'2',parsers:[...new Set(model.buildings.map(b=>b.analysis.parser))],limitations:['Languages without bundled grammars use estimated adapters.','Generated classification uses file/header markers.','Only statically resolved local references are represented.']};
  model.meta.precision='mixed';
  const byId=new Map(model.buildings.map(b=>[b.id,b]));
  for(const r of model.roads) {byId.get(r.a).deps+=r.weight;byId.get(r.b).deps+=r.weight;}
  const districts=new Map();
  for(const b of model.buildings) {
    if(!districts.has(b.district)) districts.set(b.district,{id:b.district,name:b.district==='.'?path.basename(root)||'Project':b.district,depth:b.district==='.'?0:b.district.split('/').length,buildings:0,loc:0,methods:0});
    const d=districts.get(b.district);d.buildings++;d.loc+=b.loc;d.methods+=b.methods;
  }
  for(const d of [...districts.values()]) {
    let id=d.id;
    while(id!=='.') {const parent=path.posix.dirname(id);if(!districts.has(parent))districts.set(parent,{id:parent,name:parent==='.'?path.basename(root)||'Project':parent,depth:parent==='.'?0:parent.split('/').length,buildings:0,loc:0,methods:0});id=parent;}
  }
  model.districts=[...districts.values()].map(d=>({...d,parent:d.id==='.'?null:path.posix.dirname(d.id),subtree_buildings:0}));
  const packageById=new Map(model.districts.map(d=>[d.id,d]));
  for(const b of model.buildings){let id=b.district;while(id){packageById.get(id).subtree_buildings++;id=packageById.get(id).parent;}}
  Object.assign(model.meta.totals,{buildings:model.buildings.length,districts:model.districts.length,roads:model.roads.length,nodes:model.buildings.length,edges:model.roads.length});
  return model;
}
async function scan(root) {
  root=await fs.realpath(path.resolve(root));
  if(!(await fs.stat(root)).isDirectory()) throw Error('Choose a project folder.');
  await languageParsers.initialize();
  const files=[],warnings=[];
  async function walk(dir) {
    let entries; try {entries=await fs.readdir(dir,{withFileTypes:true});} catch {warnings.push(`Cannot read ${path.relative(root,dir)}`);return;}
    entries.sort((a,b)=>a.name.localeCompare(b.name));
    for(const e of entries) {
      if(e.isSymbolicLink()) continue;
      const full=path.join(dir,e.name),file=normalize(path.relative(root,full));
      if(e.isDirectory()) {if(!SKIP.has(e.name)&&!e.name.startsWith('.')) await walk(full);continue;}
      if(!e.isFile()||files.length>=MAX_FILES) continue;
      try {
        if((await fs.stat(full)).size>MAX_BYTES) {warnings.push(`Skipped large file: ${file}`);continue;}
        const buf=await fs.readFile(full);if(buf.includes(0)) continue;
        const text=buf.toString('utf8');
        if(isSource(file,text)) files.push({file,text});
      } catch {warnings.push(`Cannot read ${file}`);}
    }
  }
  await walk(root);
  const model=modelFromFiles(files,root);
  if(files.length>=MAX_FILES) warnings.push(`Scan limited to ${MAX_FILES} files.`);
  model.meta.warnings=warnings;
  Object.assign(model.meta,await require('./history.cjs').readHistory(root,model.buildings.map(b=>b.file)));
  return model;
}
module.exports={scan,emptyModel,modelFromFiles,analyzeFile,imports,isSource,SKIP,MAX_BYTES};
