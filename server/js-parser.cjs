// Syntax-only analysis: the pinned compiler parses source; project code is never loaded.
const ts = require('./typescript.cjs');
const path = require('node:path');
function parse(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const line = pos => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const range = node => ({line:line(node.getStart(sf)), end_line:line(Math.max(node.getStart(sf),node.end-1))});
  const name = node => node.name?.getText(sf) || 'default';
  const imports=[], calls=[], exports=new Map(), buildings=[], nodeOwners=new Map();
  const confidence=sf.parseDiagnostics.length?'low':'high';
  const analysis={parser:'typescript',version:ts.version,source:'syntax AST',confidence,
    diagnostics:sf.parseDiagnostics.map(d=>({line:line(d.start||0),message:ts.flattenDiagnosticMessageText(d.messageText,' ')})),
    limitations:['Syntax counts only; dynamic dispatch and external libraries are not resolved.']};
  const complexity=node=>{let n=1; const walk=x=>{if([ts.SyntaxKind.IfStatement,ts.SyntaxKind.ForStatement,ts.SyntaxKind.ForInStatement,ts.SyntaxKind.ForOfStatement,ts.SyntaxKind.WhileStatement,ts.SyntaxKind.DoStatement,ts.SyntaxKind.CaseClause,ts.SyntaxKind.CatchClause,ts.SyntaxKind.ConditionalExpression].includes(x.kind))n++;
    if(ts.isBinaryExpression(x)&&[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(x.operatorToken.kind))n++;ts.forEachChild(x,walk);};walk(node);return n;};
  const member=(n,kind,label=name(n))=>{const r=range(n);return {name:label,kind,...r,loc:r.end_line-r.line+1,...(kind==='method'?{complexity:complexity(n)}:{})};};
  function make(n,label,kind,members) {
    const r=range(n), methods=members.filter(m=>m.kind==='method'), attrs=members.filter(m=>m.kind==='attribute');
    const b={id:`${file}::${kind}:${label}`,name:label,kind,file,district:path.posix.dirname(file),language:/\.[cm]?tsx?$/.test(file)?'typescript':'javascript',start_line:r.line,end_line:r.end_line,
      loc:r.end_line-r.line+1,methods:methods.length,nom:methods.length,attributes:attrs.length,noa:attrs.length,functions:kind==='module'?methods.length:0,deps:0,members,complexity:methods.reduce((s,m)=>s+m.complexity,0),analysis};
    buildings.push(b);nodeOwners.set(n,b);return b;
  }
  const moduleMembers=[];
  function declarations(n,prefix='') {
    if(ts.isClassDeclaration(n)||ts.isClassExpression(n)||ts.isInterfaceDeclaration(n)) {
      const label=prefix+name(n),ms=[];
      for(const m of n.members) {
        if(ts.isMethodDeclaration(m)||ts.isMethodSignature(m)||ts.isConstructorDeclaration(m)||ts.isGetAccessorDeclaration(m)||ts.isSetAccessorDeclaration(m))ms.push(member(m,'method',ts.isConstructorDeclaration(m)?'constructor':name(m)));
        if(ts.isPropertyDeclaration(m)||ts.isPropertySignature(m))ms.push(member(m,'attribute'));
        if(ts.isConstructorDeclaration(m))for(const p of m.parameters)if(p.modifiers?.some(x=>[ts.SyntaxKind.PublicKeyword,ts.SyntaxKind.PrivateKeyword,ts.SyntaxKind.ProtectedKeyword,ts.SyntaxKind.ReadonlyKeyword].includes(x.kind)))ms.push(member(p,'attribute'));
      }
      // Unique this.x assignments also count as fields, excluding declared duplicates.
      const fields=new Set(ms.filter(m=>m.kind==='attribute').map(m=>m.name));
      const walk=x=>{if(ts.isBinaryExpression(x)&&x.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(x.left)&&x.left.expression.kind===ts.SyntaxKind.ThisKeyword&&!fields.has(x.left.name.text)){fields.add(x.left.name.text);ms.push(member(x,'attribute',x.left.name.text));}ts.forEachChild(x,walk);};walk(n);
      const b=make(n,label,'class',ms);exports.set(name(n),b.id);return;
    }
    if(ts.isFunctionDeclaration(n)) {moduleMembers.push(member(n,'method'));return;}
    if(ts.isVariableStatement(n))for(const d of n.declarationList.declarations)moduleMembers.push(member(d,d.initializer&&(ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer))?'method':'attribute'));
    if(ts.isModuleDeclaration(n)) {ts.forEachChild(n,x=>declarations(x,prefix+name(n)+'.'));return;}
    if(ts.isModuleBlock(n))for(const x of n.statements)declarations(x,prefix);
  }
  for(const n of sf.statements)declarations(n);
  const nonClasses=sf.statements.filter(n=>!nodeOwners.has(n));
  let module;
  if(!buildings.length||nonClasses.length) {
    module=make(sf,path.posix.basename(file),'module',moduleMembers);
    // Module LOC counts only physical lines outside top-level type declarations.
    const occupied=new Set();for(const b of buildings)if(b!==module)for(let i=b.start_line;i<=b.end_line;i++)occupied.add(i);
    module.loc=text.split(/\r?\n/).filter((s,i)=>s.trim()&&!occupied.has(i+1)).length;
    for(const m of moduleMembers)exports.set(m.name,module.id);
  }
  for(const n of sf.statements) {
    const owner=nodeOwners.get(n)||module||buildings[0];
    if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)) {
      const ref=n.moduleSpecifier.text,c=n.importClause,bindings=[];
      if(c?.name)bindings.push({local:c.name.text,imported:'default'});
      if(c?.namedBindings) {
        if(ts.isNamespaceImport(c.namedBindings))bindings.push({local:c.namedBindings.name.text,imported:'*'});
        else for(const e of c.namedBindings.elements)bindings.push({local:e.name.text,imported:(e.propertyName||e.name).text});
      }
      imports.push({ref,bindings,owner:owner.id,...range(n)});
    }
    if(ts.isExportDeclaration(n)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))imports.push({ref:n.moduleSpecifier.text,bindings:[],owner:owner.id,...range(n)});
    if(n.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword))exports.set('default',owner.id);
    function walk(x) {
      if(ts.isCallExpression(x)||ts.isNewExpression(x)) {
        const expr=x.expression;
        if(ts.isIdentifier(expr))calls.push({local:expr.text,owner:owner.id,...range(x)});
        else if(ts.isPropertyAccessExpression(expr)&&ts.isIdentifier(expr.expression))calls.push({local:expr.expression.text,symbol:expr.name.text,owner:owner.id,...range(x)});
        if(ts.isCallExpression(x)&&(expr.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(expr)&&expr.text==='require'))&&x.arguments[0]&&ts.isStringLiteral(x.arguments[0])) {
          const bindings=ts.isVariableDeclaration(x.parent)&&ts.isIdentifier(x.parent.name)?[{local:x.parent.name.text,imported:'*'}]:[];
          imports.push({ref:x.arguments[0].text,bindings,owner:owner.id,...range(x)});
        }
      }
      if((ts.isJsxOpeningElement(x)||ts.isJsxSelfClosingElement(x))&&ts.isIdentifier(x.tagName))calls.push({local:x.tagName.text,owner:owner.id,...range(x)});
      ts.forEachChild(x,walk);
    }
    walk(n);
  }
  // Disambiguate repeated declarations without making ordinary identities depend on line numbers.
  const seen=new Map();for(const b of buildings){const k=b.id,n=seen.get(k)||0;seen.set(k,n+1);if(n)b.id+=`#${n+1}`;}
  const headerComments=(ts.getLeadingCommentRanges(text,0)||[]).map(r=>text.slice(r.pos,r.end)).concat(sf.statements.flatMap(n=>n.pos<1024?(ts.getLeadingCommentRanges(text,n.pos)||[]).filter(r=>r.pos<1024).map(r=>text.slice(r.pos,r.end)):[]));
  return {file,lang:buildings[0]?.language,loc:text.split(/\r?\n/).length-(text.endsWith('\n')?1:0),buildings,imports:imports.map(i=>i.ref),importBindings:imports,calls,exports:Object.fromEntries(exports),text,_sourceFile:sf,_nodeOwners:nodeOwners,_headerComments:headerComments};
}

function resolveSymbols(parsed) {
  const files=new Map(parsed.filter(f=>f._sourceFile).map(f=>[f.file,f]));
  if(!files.size)return [];
  const canonical=s=>s.replaceAll('\\','/').replace(/^\.\//,'');
  const resolve=(ref,from)=>{
    if(!ref.startsWith('.'))return undefined;
    const base=path.posix.normalize(path.posix.join(path.posix.dirname(from),ref)),stem=base.replace(/\.(?:[cm]?js)$/,'');
    for(const c of [base,...['.ts','.tsx','.mts','.cts','.js','.jsx','.mjs','.cjs'].map(e=>stem+e),...['/index.ts','/index.tsx','/index.js'].map(e=>base+e)])if(files.has(c))return {resolvedFileName:c,extension:path.extname(c)};
  };
  const program=ts.createProgram([...files.keys()],{noLib:true,allowJs:true,checkJs:true,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.Latest}, {
    getSourceFile:file=>files.get(canonical(file))?._sourceFile,
    getDefaultLibFileName:()=>'',writeFile:()=>{},getCurrentDirectory:()=>'.',getDirectories:()=>[],fileExists:file=>files.has(canonical(file)),readFile:file=>files.get(canonical(file))?.text,
    getCanonicalFileName:canonical,useCaseSensitiveFileNames:()=>true,getNewLine:()=> '\n',resolveModuleNames:(names,from)=>names.map(ref=>resolve(ref,canonical(from))),
  });
  const checker=program.getTypeChecker(),edges=[];
  const owner=(f,node)=>{for(let n=node;n;n=n.parent){const b=f._nodeOwners.get(n);if(b)return b;}return f.buildings.find(b=>b.kind==='module')||f.buildings[0];};
  function target(symbol) {
    if(!symbol)return null;
    if(symbol.flags&ts.SymbolFlags.Alias)symbol=checker.getAliasedSymbol(symbol);
    const d=symbol.declarations?.[0];if(!d)return null;
    const sf=d.getSourceFile(),f=files.get(canonical(sf.fileName));if(!f)return null;
    const b=owner(f,d);return b&&{b,symbol:symbol.name};
  }
  for(const f of files.values()) {
    const sf=f._sourceFile;
    function walk(n) {
      const line=sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,a=owner(f,n);
      const add=(node,kind,alias)=>{const found=target(checker.getSymbolAtLocation(node));if(found&&found.b.id!==a.id)edges.push({a:a.id,b:found.b.id,kind,weight:1,confidence:'high',evidence:[{file:f.file,line,symbol:found.symbol,alias}]});};
      if(ts.isImportSpecifier(n))add(n.name,'import',n.name.text);
      if(ts.isImportClause(n)&&n.name)add(n.name,'import',n.name.text);
      if(ts.isCallExpression(n)||ts.isNewExpression(n))add(ts.isPropertyAccessExpression(n.expression)?n.expression.name:n.expression,'call',n.expression.getText(sf));
      if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n))add(n.tagName,'call',n.tagName.getText(sf));
      ts.forEachChild(n,walk);
    }
    walk(sf);
  }
  return edges;
}
module.exports={parse,resolveSymbols};
