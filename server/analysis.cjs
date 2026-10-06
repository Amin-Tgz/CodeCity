const {Worker}=require('node:worker_threads');
const fs=require('node:fs');
const path=require('node:path');
const sea=require('node:sea');
let active=0;const queue=[];
function runAnalysis(task,root,hash) {
  if(queue.length>=8)return Promise.reject(Error('Analysis queue is full. Please wait for the current snapshot.'));
  return new Promise((resolve,reject)=>{queue.push({task,root,hash,resolve,reject});pump();});
}
function pump() {
  while(active<2&&queue.length){const job=queue.shift();active++;Promise.resolve().then(()=>executeAnalysis(job.task,job.root,job.hash)).then(job.resolve,job.reject).finally(()=>{active--;pump();});}
}
function executeAnalysis(task,root,hash) {
  const read=name=>sea.isSea()?Buffer.from(sea.getAsset('server/'+name)):fs.readFileSync(path.join(__dirname,name));
  const grammars={};for(const name of ['tree-sitter','tree-sitter-python','tree-sitter-java','tree-sitter-c_sharp','tree-sitter-go'])grammars[name+'.wasm']=read('grammars/'+name+'.wasm');
  return new Promise((resolve,reject)=>{
    const worker=new Worker(read('analysis-worker.cjs').toString(),{eval:true,workerData:{task,root,hash,grammars},resourceLimits:{maxOldGenerationSizeMb:768}});
    const timer=setTimeout(()=>{worker.terminate();reject(Error('Project analysis exceeded the two-minute limit.'));},120000);
    worker.once('message',result=>{clearTimeout(timer);worker.terminate();if(result.error){const e=Error(result.error.message);e.code=result.error.code;reject(e);}else resolve(result.model);});
    worker.once('error',error=>{clearTimeout(timer);reject(error);});worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('Analysis worker stopped.'));});
  });
}
module.exports={runAnalysis};
