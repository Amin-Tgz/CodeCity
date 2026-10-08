const {test,before}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {modelFromFiles,scan}=require('../server/scanner.cjs');
const {matcher,validateRules}=require('../server/exclusions.cjs');
before(()=>require('../server/language-parsers.cjs').initialize());
const model=(files,options)=>modelFromFiles(files.map(([file,text])=>({file,text})),'project',options);
const validate=async m=>(await import('../src/model.js')).validateModel(m);
test('copies, repeated heuristic declarations and normalized duplicate paths keep valid identities',async()=>{
  const m=model([['a.custom','class A {};\nclass A {};\n'],['copy/a.custom','class A {};\nclass A {};\n'],['./a.custom','class B {};']]);
  await validate(m);assert.equal(m.buildings.filter(b=>b.kind==='class').length,4);
  assert.ok(m.buildings.some(b=>b.id==='a.custom::class:A#2'));assert.ok(m.meta.warnings.some(w=>w.includes('repeated source paths')));
  const shifted=model([['a.custom','\nclass A {};\nclass A {};\n']]);assert.deepEqual(shifted.buildings.map(b=>b.id),m.buildings.filter(b=>b.file==='a.custom').map(b=>b.id));
});
test('documentation and snapshots with code examples are not treated as source',()=>{
  const {isSource}=require('../server/scanner.cjs');for(const file of ['doc.txt','doc.rst','spec.ts.snap','yarn.lock'])assert.equal(isSource(file,'class Example {}'),false);
  assert.equal(isSource('code.custom','class Example {}'),true);
});
test('C++ namespaces, export annotations, overloads, fields and multiline declarations use syntax ranges',async()=>{
  const text=`namespace cv {
class CV_EXPORTS_W Mat {
public:
  Mat();
  int rows, cols;
  void work(
    int count) const;
  void work(double count) { if (count) {} }
  struct Inner { int field; };
};
}
namespace other { class Mat {}; }
`;
  const m=model([['mat.h',text]]);await validate(m);const mat=m.buildings.find(b=>b.name==='cv::Mat');
  assert.equal(mat.analysis.parser,'tree-sitter-cpp');assert.equal(mat.nom,3);assert.equal(mat.noa,2);assert.equal(mat.start_line,2);assert.equal(mat.end_line,10);
  assert.equal(mat.members.find(m=>m.name==='work').end_line,7);assert.ok(m.buildings.some(b=>b.name==='cv::Mat::Inner'));assert.ok(m.buildings.some(b=>b.name==='other::Mat'));
  const aliases=model([['alias.hpp','class CV_EXPORTS_W_AS(Alias) Exported { public: CV_WRAP_AS(run) void work(); };']]);assert.equal(aliases.buildings.find(b=>b.name==='Exported').nom,1);assert.equal(aliases.buildings[0].analysis.confidence,'medium');
});
test('C++ literal/comment includes are ignored; public include folders resolve and ambiguous headers stay unresolved',async()=>{
  const m=model([['modules/img/src/a.cpp','#include "precomp.hpp"\n#include <opencv2/core.hpp>\n#include <duplicate.hpp>\n// #include <fake.hpp>\nconst char *s = "#include <fake.hpp>";\n'],['modules/img/src/precomp.hpp','#include <opencv2/img.hpp>'],['modules/core/include/opencv2/core.hpp','namespace cv { class Core {}; }'],['modules/img/include/opencv2/img.hpp','namespace cv { class Img {}; }'],['one/include/duplicate.hpp','class One {};'],['two/include/duplicate.hpp','class Two {};'],['fake.hpp','class Fake {};']]);
  await validate(m);assert.equal(m.roads.length,3);assert.ok(m.roads.every(r=>r.kind==='include'&&r.evidence[0].line));
  assert.equal(m.meta.dependencies.ambiguous,1);assert.ok(m.meta.dependencies.samples[0].candidates.length===2);
});
test('deep conditional syntax does not overflow traversal on large C++ files',async()=>{
  const depth=2500,text='#if ENABLED\n'.repeat(depth)+'struct Deep { int value; };\n'+'#endif\n'.repeat(depth);
  const m=model([['deep.hpp',text]]);await validate(m);assert.ok(m.buildings.some(b=>b.name==='Deep'));assert.equal(m.buildings.find(b=>b.name==='Deep').noa,1);
});
test('compilation database honors include order, per-file flags, and does not run command strings',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'codecity-compile-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const dir of ['src','one','two','quote'])await fs.mkdir(path.join(root,dir));
  await fs.writeFile(path.join(root,'src/a.cpp'),'#include <duplicate.h>\n#include "local.h"\n');
  await fs.writeFile(path.join(root,'src/b.cpp'),'#include <duplicate.h>\n');
  for(const file of ['one/duplicate.h','two/duplicate.h','quote/local.h'])await fs.writeFile(path.join(root,file),'struct Value { int x; };');
  await fs.writeFile(path.join(root,'compile_commands.json'),JSON.stringify([
    {directory:root,file:'src/a.cpp',arguments:['c++','-Itwo','-I','one','-iquote','quote','-c','src/a.cpp']},
    {directory:root,file:'src/b.cpp',command:'c++ -I"one" -I two -c src/b.cpp && touch SHOULD_NOT_EXIST'}]));
  const m=await scan(root);await validate(m);const byId=new Map(m.buildings.map(b=>[b.id,b]));
  const pairs=m.roads.map(r=>byId.get(r.a).file+' -> '+byId.get(r.b).file);
  assert.ok(pairs.includes('src/a.cpp -> two/duplicate.h'));assert.ok(pairs.includes('src/a.cpp -> quote/local.h'));assert.ok(pairs.includes('src/b.cpp -> one/duplicate.h'));
  assert.equal(m.meta.dependencies.compilationDatabase,'compile_commands.json');assert.equal(m.meta.dependencies.ambiguous,0);await assert.rejects(fs.stat(path.join(root,'SHOULD_NOT_EXIST')));
});
test('exclusions remove files/folders/symbols and dangling connections; globs include nested paths',async()=>{
  const files=[['src/a.ts',"import {B} from './b'; export class A {run(){new B();}} export class Kept {}"],['src/b.ts','export class B {}'],['tests/a.ts','export class Test {}'],['src/nested/tests/a.ts','export class Nested {}']];
  const m=model(files,{exclusions:[{kind:'symbol',value:'src/a.ts::class:A'},{kind:'pattern',value:'**/tests/**'}]});await validate(m);
  assert.ok(m.buildings.some(b=>b.name==='Kept'));assert.ok(!m.buildings.some(b=>['A','Test','Nested'].includes(b.name)));assert.ok(!m.roads.some(r=>r.a.endsWith('class:A')));
  const gone=model(files,{exclusions:[{kind:'folder',value:'src'}]});await validate(gone);assert.ok(gone.buildings.every(b=>b.file.startsWith('tests/')));
  const match=matcher([{kind:'pattern',value:'**/*.generated.?s'}]);assert.ok(match.file('a.generated.ts'));assert.ok(match.file('deep/a.generated.js'));assert.equal(match.file('a.ts'),false);
  assert.ok(matcher([{kind:'pattern',value:'samples/'}]).file('samples/deep/a.cpp'));
  assert.throws(()=>validateRules([{kind:'folder',value:'../outside'}]));assert.throws(()=>validateRules([{kind:'file',value:'C:/outside'}]));
});
test('exclusion API persists per project across reopen/restart and clearing restores source',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'codecity-exclusions-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const project=path.join(root,'project'),other=path.join(root,'other');for(const dir of [project,other]){await fs.mkdir(dir);await fs.writeFile(path.join(dir,'a.ts'),'export class A {} export class B {}');}
  const stateFile=path.join(root,'recent.json');
  async function launch(){const app=require('../server/app.cjs').createApp({root:project,stateFile});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));const base=`http://127.0.0.1:${app.server.address().port}`,session=await(await fetch(base+'/api/session')).json();return {base,post:(action,body)=>fetch(base+'/api/'+action,{method:'POST',headers:{'X-CodeCity-Token':session.token,'Content-Type':'application/json'},body:JSON.stringify(body)})};}
  const first=await launch();const rules=[{kind:'symbol',value:'a.ts::class:A'}];
  let res=await first.post('project/exclusions',{root:project,rules});assert.equal(res.status,200);let m=(await res.json()).model;await validate(m);assert.ok(!m.buildings.some(b=>b.name==='A'));
  assert.equal((await first.post('project/exclusions',{root:other,rules:[]})).status,409);
  assert.equal((await first.post('project/exclusions',{root:project,rules:[{kind:'file',value:'../a.ts'}]})).status,400);
  m=(await(await first.post('project/open',{path:other})).json()).model;assert.ok(m.buildings.some(b=>b.name==='A'));
  m=(await(await first.post('project/open',{path:project})).json()).model;assert.ok(!m.buildings.some(b=>b.name==='A'));
  const second=await launch();m=await(await fetch(second.base+'/city.json')).json();assert.ok(!m.buildings.some(b=>b.name==='A'));
  m=(await(await second.post('project/exclusions',{root:project,rules:[]})).json()).model;assert.ok(m.buildings.some(b=>b.name==='A'));assert.equal(await fs.readFile(path.join(project,'a.ts'),'utf8'),'export class A {} export class B {}');
});
