// Scan real repositories without building them or executing their code.
const fs=require('node:fs/promises'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {scan}=require(process.env.CODECITY_SCANNER?path.resolve(process.env.CODECITY_SCANNER):'../server/scanner.cjs');
async function main() {
  const [root,out='output/research/latest.json']=process.argv.slice(2);
  if(!root)throw Error('Usage: node scripts/audit-project.cjs PROJECT [REPORT]');
  const start=performance.now(),model=await scan(root);
  const {validateModel}=await import('../src/model.js');let validation='passed';
  try{validateModel(model);}catch(e){validation=e.message;}
  const ids=new Set(),duplicates=[];for(const b of model.buildings){if(ids.has(b.id))duplicates.push(b.id);ids.add(b.id);}
  let revision;try{revision=require('node:child_process').execFileSync('git',['-c',`safe.directory=${model.meta.root}`,'-C',model.meta.root,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
  const byId=new Map(model.buildings.map(b=>[b.id,b])),pairs=new Set(model.roads.map(r=>byId.get(r.a)?.file+' -> '+byId.get(r.b)?.file));
  const report={root:model.meta.root,revision,analysisMs:Math.round(performance.now()-start),validation,
    scan:model.meta.scan,
    historyStatus:model.meta.historyStatus,historyFrames:model.meta.history?.frames.length||0,
    totals:model.meta.totals,languages:model.meta.languages,duplicateIds:duplicates.slice(0,50),
    parsers:Object.fromEntries([...new Set(model.buildings.map(b=>b.analysis.parser))].map(p=>[p,model.buildings.filter(b=>b.analysis.parser===p).length])),
    lowConfidenceBuildings:model.buildings.filter(b=>b.analysis.confidence==='low').length,
    connectedFilePairs:pairs.size,warnings:model.meta.warnings,dependencies:model.meta.dependencies,
    sampleConnections:[...pairs].slice(0,40),
    opencvChecks:root.includes('opencv')?Object.fromEntries([
      ['modules/imgproc/src/filter.dispatch.cpp','modules/core/include/opencv2/core/utils/logger.hpp'],
      ['modules/imgproc/src/precomp.hpp','modules/imgproc/include/opencv2/imgproc.hpp'],
      ['modules/core/include/opencv2/core.hpp','modules/core/include/opencv2/core/mat.hpp']
    ].map(([a,b])=>[a+' -> '+b,pairs.has(a+' -> '+b)])):undefined};
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,sampleConnections:undefined,dependencies:report.dependencies?{...report.dependencies,samples:undefined}:undefined}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
