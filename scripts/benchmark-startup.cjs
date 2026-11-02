// Measure the same CLI/runtime launch used by the VS Code extension.
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const [root,runtime=process.execPath,cli=path.resolve(__dirname,'../server/cli.cjs')]=process.argv.slice(2);
if(!root)throw Error('Usage: node scripts/benchmark-startup.cjs ROOT [RUNTIME] [CLI]');
const started=Date.now(),child=spawn(runtime,[cli,'--root',path.resolve(root),'--port','0','--no-open'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true});
const report={root:path.resolve(root),runtime,cli},output=[];
let stdout='',reading=false;
child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
const timer=setTimeout(()=>{report.error='Benchmark exceeded 180 seconds';child.kill();},180000);
child.stderr.on('data',s=>output.push(s));
child.on('error',e=>{report.error=e.message;});
child.stdout.on('data',async s=>{
  stdout+=s;const url=stdout.match(/CodeCity → (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1];
  if(!url||reading)return;reading=true;report.urlMs=Date.now()-started;
  try {
    const page=await fetch(url);report.pageMs=Date.now()-started;report.pageStatus=page.status;await page.text();
    const response=await fetch(url+'city.json');const model=await response.json();
    report.cityMs=Date.now()-started;report.cityStatus=response.status;report.scan=model.meta?.scan;report.totals=model.meta?.totals;report.analysis=model.meta?.analysis;report.error=model.error;
  }catch(e){report.error=e.message;}finally{child.kill();}
});
child.on('exit',(code,signal)=>{
  clearTimeout(timer);report.exitCode=code;report.signal=signal;report.elapsedMs=Date.now()-started;report.stderr=output.join('').slice(-4000);
  console.log(JSON.stringify(report,null,2));
  if(process.env.CODECITY_BENCHMARK_REPORT)fs.writeFileSync(process.env.CODECITY_BENCHMARK_REPORT,JSON.stringify(report,null,2)+'\n');
});
