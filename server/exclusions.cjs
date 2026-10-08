const normalize=s=>s.replaceAll('\\','/').replace(/^\.\//,'').replace(/\/+$/,'');
function validateRules(rules=[]) {
  if(!Array.isArray(rules)||rules.length>200)throw Error('Use at most 200 exclusion rules.');
  const seen=new Set();
  return rules.map(r=>{
    if(!r||!['folder','file','symbol','pattern'].includes(r.kind)||typeof r.value!=='string'||!r.value.trim()||r.value.length>512)throw Error('Invalid exclusion rule.');
    const value=normalize(r.value.trim());
    if(value.startsWith('/')||/^[A-Za-z]:/.test(value)||value.split('/').includes('..')||/[\r\n\0]/.test(value))throw Error('Exclusions must use paths relative to the project.');
    return {kind:r.kind,value};
  }).filter(r=>{const key=r.kind+'\0'+r.value;if(seen.has(key))return false;seen.add(key);return true;});
}
function glob(pattern) {
  let source='';
  for(let i=0;i<pattern.length;i++) {
    const c=pattern[i];
    if(c==='*'&&pattern[i+1]==='*'){i++;if(pattern[i+1]==='/'){i++;source+='(?:.*/)?';}else source+='.*';}
    else if(c==='*')source+='[^/]*';else if(c==='?')source+='[^/]';else source+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }
  return new RegExp('^'+source+'$');
}
function matcher(rules=[]) {
  const compiled=validateRules(rules).map(r=>({...r,re:r.kind==='pattern'?glob(r.value):null}));
  const file=(name,isDirectory=false)=>compiled.some(r=>r.kind==='folder'&&(r.value==='.'||name===r.value||name.startsWith(r.value+'/'))||r.kind==='file'&&!isDirectory&&name===r.value||r.kind==='pattern'&&(r.re.test(name)||name.split('/').slice(0,-1).some((_,i)=>r.re.test(name.split('/').slice(0,i+1).join('/')))));
  return {file,building:b=>file(b.file)||compiled.some(r=>r.kind==='symbol'&&b.id===r.value)};
}
module.exports={validateRules,matcher};
