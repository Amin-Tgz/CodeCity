const {spawn}=require('node:child_process');
const path=require('node:path');

// Keep one process/pending launch per project, including while startup is in flight.
function createServerManager({cliPath,runtime=process.execPath,spawnProcess=spawn,timeoutMs=30000}={}) {
  const sessions=new Map();
  function start(root) {
    const key=path.resolve(root);
    if(sessions.has(key))return sessions.get(key).promise;
    const entry={};sessions.set(key,entry);
    entry.promise=new Promise((resolve,reject)=>{
      let settled=false,stdout='',stderr='',timer;
      const forget=()=>{if(sessions.get(key)===entry)sessions.delete(key);};
      const fail=error=>{
        if(settled)return;settled=true;clearTimeout(timer);forget();
        entry.child?.kill();reject(new Error(`${error.message}${stderr.trim()?`\n${stderr.trim()}`:''}`));
      };
      entry.stop=()=>{if(!settled)fail(new Error('CodeCity launch cancelled.'));else{forget();entry.child?.kill();}};
      try {
        const child=entry.child=spawnProcess(runtime,[cliPath,'--root',key,'--port','0','--no-open'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true});
        child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
        child.stdout.on('data',text=>{
          stdout=(stdout+text).slice(-16384);
          const match=stdout.match(/CodeCity → (http:\/\/127\.0\.0\.1:\d+\/)/);
          if(match&&!settled){settled=true;clearTimeout(timer);resolve({url:match[1],process:child});}
        });
        child.stderr.on('data',text=>{stderr=(stderr+text).slice(-8192);});
        child.once('error',fail);
        child.once('close',(code,signal)=>{forget();fail(new Error(`CodeCity server exited before startup (${signal||code}).`));});
        timer=setTimeout(()=>fail(new Error('Timed out waiting for CodeCity server to start.')),timeoutMs);
      }catch(error){fail(error);}
    });
    return entry.promise;
  }
  function stopAll(){for(const entry of [...sessions.values()])entry.stop();}
  return {start,stopAll};
}
module.exports={createServerManager};
