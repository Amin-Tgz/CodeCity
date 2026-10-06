#!/usr/bin/env node
const {createApp,launch} = require('./app.cjs');
async function main() {
  const args=process.argv.slice(2),opts={port:8137,host:'127.0.0.1',open:true};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--no-open') opts.open=false;
    else if(args[i]==='--port') opts.port=Number(args[++i]);
    else if(args[i]==='--host') opts.host=args[++i];
    else if(args[i]==='--root') opts.root=args[++i];
    else if(args[i]==='--help'||args[i]==='-h') {console.log('CodeCity [--root FOLDER] [--port 8137] [--no-open]\nStarts with an empty city. Open a project from the menu. No Python or CodeGraph needed.');return;}
    else if(!args[i].startsWith('-')&&!opts.root) opts.root=args[i];
    else throw Error(`Unknown option: ${args[i]}`);
  }
  if(!Number.isInteger(opts.port)||opts.port<0||opts.port>65535) throw Error('Invalid port.');
  if(!['127.0.0.1','localhost','0.0.0.0','::1'].includes(opts.host)) throw Error('Use a loopback host, or 0.0.0.0 for Docker.');
  const {server,ready}=createApp(opts);await ready;
  const listen=port=>new Promise((resolve,reject)=>{
    const failed=err=>{server.removeListener('listening',started);reject(err);};
    const started=()=>{server.removeListener('error',failed);resolve();};
    server.once('error',failed);server.once('listening',started);server.listen(port,opts.host);
  });
  try {await listen(opts.port);}catch(err){
    if(!['EACCES','EADDRINUSE'].includes(err.code)||opts.port===0)throw err;
    await listen(0);
    console.log(`Port ${opts.port} unavailable; using ${server.address().port}.`);
  }
  const url=`http://127.0.0.1:${server.address().port}/`;
  console.log(`CodeCity → ${url}\nOpen a project from the menu. Ctrl+C to stop.`);
  if(opts.open) {
    const cmd=process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
    launch(...cmd).catch(()=>console.log('Open the URL above in your browser.'));
  }
  const stop=()=>server.close(()=>process.exit(0));process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
main().catch(err=>{console.error(`CodeCity: ${err.message}`);process.exitCode=1;});
