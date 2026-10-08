const path=require('node:path');
// Mask common declaration annotations, preserving byte positions and source lines.
function maskAnnotations(text) {
  const blank=s=>s.replace(/[^\r\n]/g,' ');
  return text.replace(/\b(?:CV_EXPORTS(?:_W(?:_SIMPLE|_MAP|_AS)?|_AS)?|CV_WRAP(?:_AS)?|CV_PROP(?:_RW)?|CV_OUT|CV_IN_OUT|CV_NODISCARD_STD|CV_NODISCARD|CV_FINAL|CV_OVERRIDE|CV_NOEXCEPT|CV_DEPRECATED)\b(?:\([^\n()]*\))?/g,blank)
    .replace(/\b(class|struct)\s+([A-Z][A-Z0-9_]*(?:_API|_EXPORT|_EXPORTS))(?=\s+\w)/g,(s,kind)=>kind+blank(s.slice(kind.length)));
}
function parse(file,text,lang,parser) {
  const masked=maskAnnotations(text),tree=parser.parse(masked),root=tree.rootNode;
  const buildings=[],classRanges=[],moduleMembers=[],includes=[],diagnostics=[];
  const walk=(n,fn)=>{const stack=[n];while(stack.length){const current=stack.pop();fn(current);stack.push(...current.namedChildren);}};
  const range=n=>({line:n.startPosition.row+1,end_line:Math.max(n.startPosition.row+1,n.endPosition.row+(n.endPosition.column?1:0))});
  const original=n=>text.slice(n.startIndex,n.endIndex);
  const analysis={parser:'tree-sitter-'+lang,version:'wasms 0.1.13 / runtime 0.20.8',source:'syntax AST',confidence:root.hasError()?'low':masked===text?'high':'medium',diagnostics,
    limitations:['Syntax analysis without preprocessing; conditional branches are all represented.','Include edges connect files; virtual dispatch, templates and runtime calls require a compiler.','Common export/wrapper annotations are masked while preserving source ranges.']};
  const functionNode=n=>{let d=n.childForFieldName('declarator');while(d){if(d.type==='function_declarator')return d;d=d.childForFieldName('declarator');}return null;};
  const member=(n,kind,label)=>{const r=range(n);let complexity=1;
    if(kind==='method')walk(n,c=>{if(['if_statement','for_statement','for_range_loop','while_statement','do_statement','case_statement','catch_clause','conditional_expression'].includes(c.type))complexity++;});
    return {name:label,kind,...r,loc:r.end_line-r.line+1,...(kind==='method'?{complexity}:{})};};
  const pending=[];
  const enqueue=(children,owner,prefix)=>{for(let i=children.length-1;i>=0;i--)pending.push([children[i],owner,prefix]);};
  function visit(n,owner=null,prefix='') {
    if(n.type==='ERROR'||n.isMissing()){if(diagnostics.length<100)diagnostics.push({line:range(n).line,message:'Unsupported syntax or macro near '+original(n).slice(0,80)});}
    if(n.type==='preproc_include'){
      const ref=n.childForFieldName('path');if(ref&&['string_literal','system_lib_string'].includes(ref.type))includes.push({ref:original(ref).slice(1,-1),quoted:ref.type==='string_literal',line:range(n).line});return;
    }
    if(n.type==='namespace_definition') {
      const name=n.childForFieldName('name')?.text||'(anonymous)';
      enqueue(n.namedChildren,owner,prefix+name+'::');return;
    }
    if(['class_specifier','struct_specifier','union_specifier','enum_specifier'].includes(n.type)&&n.childForFieldName('body')) {
      const r=range(n),label=prefix+(n.childForFieldName('name')?.text||'(anonymous)'),b={id:`${file}::class:${label}`,name:label,kind:'class',file,district:path.posix.dirname(file),language:lang,start_line:r.line,end_line:r.end_line,loc:r.end_line-r.line+1,members:[],analysis};
      buildings.push(b);classRanges.push(r);
      enqueue(n.childForFieldName('body').namedChildren,b,label+'::');return;
    }
    const fn=functionNode(n);
    if(fn&&['function_definition','field_declaration','declaration'].includes(n.type)) {
      const d=fn.childForFieldName('declarator');(owner?.members||moduleMembers).push(member(n,'method',d?.text||'anonymous'));return;
    }
    if(owner&&n.type==='field_declaration') {
      for(const c of n.children.filter(c=>n.childForFieldName('type')?.id!==c.id&&['field_identifier','pointer_declarator','reference_declarator','array_declarator','init_declarator'].includes(c.type))) {
        let d=c;while(d.childForFieldName('declarator'))d=d.childForFieldName('declarator');owner.members.push(member(n,'attribute',d.text));
      }
      // A declaration can also contain a nested type.
    }
    enqueue(n.namedChildren,owner,prefix);
  }
  pending.push([root,null,'']);while(pending.length)visit(...pending.pop());
  const lines=text.split(/\r?\n/),loc=lines.length-(text.endsWith('\n')?1:0);
  const occupied=new Set();for(const r of classRanges)for(let i=r.line;i<=r.end_line;i++)occupied.add(i);
  const outside=lines.reduce((sum,s,i)=>sum+(s.trim()&&!occupied.has(i+1)?1:0),0);
  // Keep one file endpoint even for class-only headers: an include is a file dependency.
  buildings.push({id:`${file}::module`,name:path.posix.basename(file),kind:'module',file,district:path.posix.dirname(file),language:lang,start_line:1,end_line:Math.max(1,loc),loc:buildings.length?outside:loc,members:moduleMembers,analysis});
  for(const b of buildings){const methods=b.members.filter(m=>m.kind==='method'),attrs=b.members.filter(m=>m.kind==='attribute');Object.assign(b,{methods:methods.length,nom:methods.length,attributes:attrs.length,noa:attrs.length,functions:b.kind==='module'?methods.length:0,deps:0,complexity:methods.reduce((s,m)=>s+m.complexity,0)});}
  // Identity includes namespace and occurrence; copies in other files remain distinct.
  const seen=new Map();for(const b of buildings){const id=b.id,count=seen.get(id)||0;seen.set(id,count+1);if(count)b.id+='#'+(count+1);}
  const headerComments=root.namedChildren.filter(n=>n.type==='comment'&&n.startIndex<1024).map(original);
  tree.delete();return {file,lang,loc,buildings,text,imports:[...new Set(includes.map(i=>i.ref))],includes,_headerComments:headerComments};
}
module.exports={parse,maskAnnotations};
