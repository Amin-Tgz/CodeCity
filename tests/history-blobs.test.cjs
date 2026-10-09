const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {readSnapshot}=require('../server/history.cjs');
const {readSourceBlobs}=require('../server/git-blob-reader.cjs');

test('commit snapshots discard more than 80 MB of binary assets while retaining source and unknown-language text',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'codecity-blob-stream-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',['-c','user.name=Test','-c','user.email=test@example.invalid','-c','core.hooksPath='+path.join(root,'nohooks'),'-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init');
  await fs.writeFile(path.join(root,'a.ts'),'export class Kept {run() {return 1;}}\n');
  await fs.writeFile(path.join(root,'unknown.custom'),'class Custom { method() {} }\n');
  await fs.writeFile(path.join(root,'ignored.md'),'class DocumentationOnly {}\n');
  await fs.writeFile(path.join(root,'empty.ts'),'');
  await fs.writeFile(path.join(root,'oversized.ts'),'x'.repeat(2_000_001));
  // Repeated Git object IDs also exercise exact response ordering across chunk boundaries.
  const binary=Buffer.alloc(1_800_000);
  await Promise.all(Array.from({length:48},(_,i)=>fs.writeFile(path.join(root,`asset-${i}.bin`),binary)));
  git('add','.');git('commit','--no-gpg-sign','-m','source and large assets');
  const hash=git('rev-parse','HEAD'),model=await readSnapshot(root,hash);
  const {validateModel}=await import('../src/model.js');validateModel(model);
  assert.ok(model.buildings.some(b=>b.name==='Kept'));
  assert.ok(model.buildings.some(b=>b.file==='unknown.custom'));
  assert.deepEqual(Object.keys(model.meta.snapshotSources).sort(),['a.ts','empty.ts','unknown.custom']);
  assert.equal(model.meta.snapshotSources['empty.ts'],'');
  const oid=git('rev-parse',`${hash}:a.ts`),args=['-c','safe.directory='+root.replaceAll('\\','/')];
  await assert.rejects(readSourceBlobs(root,args,[{file:'a.ts',oid}],{maxSourceBytes:1}),/snapshot limit/);
  await assert.rejects(readSourceBlobs(root,args,[{file:'a.ts',oid}],{maxReadBytes:1}),/read limit/);
  await assert.rejects(readSourceBlobs(root,args,[{file:'a.ts',oid:'0'.repeat(40)}]),/Invalid historical object/);
});
