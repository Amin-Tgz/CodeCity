const fs=require('node:fs');
const path=require('node:path');
const sea=require('node:sea');
const Parser=require('./tree-sitter.cjs');
const parsers=new Map();let ready,provided;
const assets=name=>provided?.[name]||(sea.isSea()?new Uint8Array(sea.getAsset('server/grammars/'+name)):fs.readFileSync(path.join(__dirname,'grammars',name)));
async function initialize(grammarAssets) {
  if(grammarAssets)provided=grammarAssets;
  return ready ||= (async()=>{
    await Parser.init({wasmBinary:assets('tree-sitter.wasm')});
    for(const [lang,grammar] of Object.entries({python:'python',java:'java',csharp:'c_sharp',go:'go'})) {
      const parser=new Parser();parser.setLanguage(await Parser.Language.load(assets('tree-sitter-'+grammar+'.wasm')));parsers.set(lang,parser);
    }
  })();
}
const TYPES={
  python:{classes:['class_definition'],methods:['function_definition'],attrs:[],branches:['if_statement','for_statement','while_statement','except_clause','conditional_expression','boolean_operator']},
  java:{classes:['class_declaration','interface_declaration','enum_declaration','record_declaration'],methods:['method_declaration','constructor_declaration'],attrs:['field_declaration'],branches:['if_statement','for_statement','enhanced_for_statement','while_statement','do_statement','switch_label','catch_clause','ternary_expression']},
  csharp:{classes:['class_declaration','interface_declaration','struct_declaration','record_declaration'],methods:['method_declaration','constructor_declaration','local_function_statement'],attrs:['field_declaration','property_declaration','event_field_declaration'],branches:['if_statement','for_statement','foreach_statement','while_statement','do_statement','switch_section','catch_clause','conditional_expression']},
  go:{classes:['type_spec'],methods:['method_declaration','function_declaration'],attrs:['field_declaration'],branches:['if_statement','for_statement','expression_case','type_case','communication_case']},
};
function parse(file,text,lang) {
  const parser=parsers.get(lang);if(!parser)return null;
  const tree=parser.parse(text),root=tree.rootNode,spec=TYPES[lang],buildings=[],diagnostics=[];
  const analysis={parser:'tree-sitter-'+lang,version:'wasms 0.1.13 / runtime 0.20.8',source:'syntax AST',confidence:root.hasError()?'low':'high',diagnostics,
    limitations:['Syntax counts only; dependencies for this language remain module-level estimates.']};
  const r=n=>({line:n.startPosition.row+1,end_line:Math.max(n.startPosition.row+1,n.endPosition.row+(n.endPosition.column?1:0))});
  const named=n=>n.childForFieldName('name')?.text||n.namedChildren.find(c=>['identifier','field_identifier'].includes(c.type))?.text||'anonymous';
  const walk=(n,fn)=>{fn(n);for(const c of n.namedChildren)walk(c,fn);};
  const complexity=n=>{let count=1;walk(n,x=>{if(spec.branches.includes(x.type))count++;});return count;};
  const member=(n,kind,label=named(n))=>{const range=r(n);return {name:label,kind,...range,loc:range.end_line-range.line+1,...(kind==='method'?{complexity:complexity(n)}:{})};};
  const moduleMembers=[],classNodes=[],methodNodes=new Map();
  function visit(n,owner=null,prefix='') {
    if(n.type==='ERROR'||n.isMissing())diagnostics.push({line:r(n).line,message:'Syntax unsupported or incomplete near '+n.text.slice(0,80)});
    if(spec.classes.includes(n.type)) {
      if(lang==='go'&&!n.namedChildren.some(c=>c.type==='struct_type'||c.type==='interface_type'))return;
      const range=r(n),label=prefix+named(n),b={id:`${file}::class:${label}`,name:label,kind:'class',file,district:path.posix.dirname(file),language:lang,start_line:range.line,end_line:range.end_line,loc:range.end_line-range.line+1,members:[],analysis};
      buildings.push(b);classNodes.push(n);
      for(const c of n.namedChildren)visit(c,b,label+'.');return;
    }
    if(spec.methods.includes(n.type)) {
      const m=member(n,'method');(owner?.members||moduleMembers).push(m);methodNodes.set(m,n);
      // Field assignments belong to the class; nested functions are not methods.
      if(owner&&lang==='python')walk(n,x=>{if(x.type==='assignment') {const left=x.childForFieldName('left');if(left?.type==='attribute'&&left.childForFieldName('object')?.text==='self'){const attr=left.childForFieldName('attribute');if(attr&&!owner.members.some(m=>m.kind==='attribute'&&m.name===attr.text))owner.members.push(member(left,'attribute',attr.text));}}});
      return;
    }
    if(owner&&spec.attrs.includes(n.type)) {
      const labels=[];walk(n,x=>{if(x.type==='variable_declarator')labels.push(named(x));});
      if(lang==='go')labels.push(...n.namedChildren.filter(x=>x.type==='field_identifier').map(x=>x.text));
      if(!labels.length)labels.push(named(n));for(const label of labels)owner.members.push(member(n,'attribute',label));return;
    }
    if(owner&&lang==='python'&&n.type==='assignment'){const left=n.childForFieldName('left');if(left?.type==='identifier')owner.members.push(member(left,'attribute',left.text));}
    for(const c of n.namedChildren)visit(c,owner,prefix);
  }
  visit(root);
  if(lang==='go')for(const m of [...moduleMembers]) {
    const n=methodNodes.get(m),receiver=n?.type==='method_declaration'?n.childForFieldName('receiver'):null;
    const type=receiver?.text.replace(/[()*]/g,' ').trim().split(/\s+/).at(-1),b=buildings.find(b=>b.name===type);
    if(b){b.members.push(m);moduleMembers.splice(moduleMembers.indexOf(m),1);}
  }
  const lines=text.split(/\r?\n/),loc=lines.length-(text.endsWith('\n')?1:0),outside=lines.filter((s,i)=>s.trim()&&!classNodes.some(n=>i>=n.startPosition.row&&i<n.endPosition.row+1)).length;
  if(!buildings.length||moduleMembers.length||outside)buildings.push({id:`${file}::module:${path.posix.basename(file)}`,name:path.posix.basename(file),kind:'module',file,district:path.posix.dirname(file),language:lang,start_line:1,end_line:Math.max(1,loc),loc:buildings.length?outside:loc,members:moduleMembers,analysis});
  for(const b of buildings){const methods=b.members.filter(m=>m.kind==='method'),attrs=b.members.filter(m=>m.kind==='attribute');Object.assign(b,{methods:methods.length,nom:methods.length,attributes:attrs.length,noa:attrs.length,functions:b.kind==='module'?methods.length:0,deps:0,complexity:methods.reduce((s,m)=>s+m.complexity,0)});}
  const seen=new Map();for(const b of buildings){const k=b.id,count=seen.get(k)||0;seen.set(k,count+1);if(count)b.id+='#'+(count+1);}
  const headerComments=root.namedChildren.filter(n=>n.type==='comment'&&n.startIndex<1024).map(n=>n.text);
  tree.delete();return {file,lang,loc,buildings,text,_headerComments:headerComments};
}
module.exports={initialize,parse};
