const {parentPort,workerData}=require('node:worker_threads');
(async()=>{
  await require('./language-parsers.cjs').initialize(workerData.grammars);
  const model=workerData.task==='snapshot'?await require('./history.cjs').readSnapshot(workerData.root,workerData.hash):await require('./scanner.cjs').scan(workerData.root);
  parentPort.postMessage({model});
})().catch(error=>parentPort.postMessage({error:{message:error.message,code:error.code}}));
