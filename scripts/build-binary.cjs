const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {buildSync}=require('esbuild');
const {inject}=require('postject');
async function main() {
  require('./build-parsers.cjs');
  const root=path.resolve(__dirname,'..');
  const argv=process.argv.slice(2);
  if(argv.length&&!(argv.length===2&&argv[0]==='--output-dir'))throw Error('Use --output-dir FOLDER to build into a separate folder.');
  const out=argv.length?path.resolve(argv[1]):path.join(root,'dist');fs.mkdirSync(out,{recursive:true});
  buildSync({entryPoints:[path.join(root,'server/cli.cjs')],bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'codecity.cjs')});
  const assets={};
  for(const file of ['index.html','styles.css']) assets[file]=path.join(root,file);
  for(const dir of ['src','vendor']) for(const file of fs.readdirSync(path.join(root,dir))) if(file.endsWith('.js')) assets[dir+'/'+file]=path.join(root,dir,file);
  for(const file of fs.readdirSync(path.join(root,'assets'))) assets['assets/'+file]=path.join(root,'assets',file);
  assets['server/analysis-worker.cjs']=path.join(root,'server/analysis-worker.cjs');
  for(const file of fs.readdirSync(path.join(root,'server/grammars')))assets['server/grammars/'+file]=path.join(root,'server/grammars',file);
  const config=path.join(out,'sea-config.json'),blob=path.join(out,'codecity.blob');
  fs.writeFileSync(config,JSON.stringify({main:path.join(out,'codecity.cjs'),output:blob,disableExperimentalSEAWarning:true,useSnapshot:false,useCodeCache:false,assets}));
  execFileSync(process.execPath,['--experimental-sea-config',config],{stdio:'inherit'});
  const binary=path.join(out,process.platform==='win32'?'codecity.exe':'codecity');fs.copyFileSync(process.execPath,binary);
  if(process.platform==='darwin') execFileSync('codesign',['--remove-signature',binary]);
  await inject(binary,'NODE_SEA_BLOB',fs.readFileSync(blob),{sentinelFuse:'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',...(process.platform==='darwin'?{machoSegmentName:'NODE_SEA'}:{})});
  if(process.platform==='darwin') execFileSync('codesign',['--sign','-',binary]);
  fs.chmodSync(binary,0o755);console.log(`Standalone executable: ${binary}`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
