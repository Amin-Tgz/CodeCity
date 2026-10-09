const {spawn}=require('node:child_process');
const scanner=require('./scanner.cjs');

// Parse one cat-file response at a time. Binary assets never accumulate in RAM.
function readSourceBlobs(root,args,entries,{maxSourceBytes=128*1024*1024,maxReadBytes=256*1024*1024}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn('git',[...args,'cat-file','--batch'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const files=[];let pending=Buffer.alloc(0),parts=[],remaining=null,index=0,readBytes=0,sourceBytes=0,stderr='',failure=null;
    const fail=error=>{if(failure)return;failure=error;clearTimeout(timer);child.kill();};
    const timer=setTimeout(()=>fail(Error('Historical source read timed out.')),30000);
    child.stdout.on('data',chunk=>{
      if(failure)return;
      readBytes+=chunk.length;
      if(readBytes>maxReadBytes)return fail(Error('Historical objects exceed the 256 MB read limit.'));
      pending=pending.length?Buffer.concat([pending,chunk]):chunk;
      try {
        while(pending.length) {
          if(remaining===null) {
            const end=pending.indexOf(10);if(end<0)break;
            const header=pending.subarray(0,end).toString('ascii').match(/^([a-f0-9]+) blob (\d+)$/);
            if(!header||header[1]!==entries[index]?.oid)throw Error('Invalid historical object.');
            remaining=Number(header[2]);
            if(remaining>scanner.MAX_BYTES)throw Error('Historical file exceeds the source file size limit.');
            parts=[];pending=pending.subarray(end+1);
          }
          if(remaining>0) {
            const count=Math.min(remaining,pending.length);
            parts.push(pending.subarray(0,count));pending=pending.subarray(count);remaining-=count;
            if(remaining>0)break;
          }
          if(!pending.length)break; // The trailing newline may arrive in the next chunk.
          if(pending[0]!==10)throw Error('Invalid historical object boundary.');
          const entry=entries[index++],buffer=Buffer.concat(parts);
          pending=pending.subarray(1);parts=[];remaining=null;
          if(buffer.includes(0))continue;
          const text=buffer.toString('utf8');
          if(!scanner.isSource(entry.file,text))continue;
          sourceBytes+=buffer.length;
          if(sourceBytes>maxSourceBytes)throw Error('Historical source exceeds the 128 MB snapshot limit.');
          files.push({file:entry.file,text});
        }
      }catch(error){fail(error);}
    });
    child.stderr.on('data',chunk=>{stderr+=chunk.toString();});
    child.on('error',fail);
    child.on('close',code=>{
      clearTimeout(timer);if(failure)return reject(failure);
      if(code!==0)return reject(Error(stderr||'Could not read historical sources.'));
      if(index!==entries.length||remaining!==null||pending.length)return reject(Error('Incomplete historical source.'));
      resolve(files);
    });
    child.stdin.on('error',()=>{});
    child.stdin.end(entries.map(entry=>entry.oid).join('\n')+(entries.length?'\n':''));
  });
}
module.exports={readSourceBlobs};
