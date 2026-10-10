// Graph evidence is independent of whether an edge has a drawable street.
export function graphIndex(model) {
  const incoming=new Map(),outgoing=new Map(),byId=new Map(model.buildings.map(b=>[b.id,b]));
  for(const b of model.buildings){incoming.set(b.id,[]);outgoing.set(b.id,[]);}
  for(const edge of model.roads){incoming.get(edge.b)?.push(edge);outgoing.get(edge.a)?.push(edge);}
  // Iterative Kosaraju avoids call-stack failure on deep repository graphs.
  const visited=new Set(),order=[];
  for(const id of byId.keys())if(!visited.has(id)) {
    const stack=[[id,false]];
    while(stack.length){const [v,done]=stack.pop();if(done){order.push(v);continue;}if(visited.has(v))continue;visited.add(v);stack.push([v,true]);for(const r of outgoing.get(v))if(!visited.has(r.b))stack.push([r.b,false]);}
  }
  const components=new Map();visited.clear();
  for(const id of order.reverse())if(!visited.has(id)) {
    const group=[],stack=[id];visited.add(id);
    while(stack.length){const v=stack.pop();group.push(v);for(const r of incoming.get(v))if(!visited.has(r.a)){visited.add(r.a);stack.push(r.a);}}
    if(group.length>1||outgoing.get(id).some(r=>r.b===id))for(const v of group)components.set(v,group);
  }
  return {incoming,outgoing,byId,components};
}
export const PRESETS={
  'fan-out':{label:'High fan-out',explain:'At least 5 distinct outgoing dependency targets. Import/call duplicates count once.',sort:'fanOut',match:b=>b.fanOut>=5},
  complexity:{label:'Complex behavior',explain:'Known syntactic complexity ≥ 15: 1 per method plus branch/loop decisions. Estimates and unknowns are labelled.',sort:'complexity',match:b=>b.complexity!=null&&b.complexity>=15},
  churn:{label:'Frequent changes',explain:'At least 3 commits touching the file in the available timeline. File evidence is shared by its classes.',sort:'churn',match:b=>b.churn>=3},
  cycles:{label:'Dependency cycles',explain:'Buildings in a strongly connected component; follow the directed edges to investigate.',sort:'fanOut',match:b=>b.cycleSize>0},
};
export function rankCandidates(model,preset,sort=PRESETS[preset]?.sort||'loc',graph=graphIndex(model)) {
  const spec=PRESETS[preset];if(!spec)return [];
  return model.buildings.map(b=>({...b,fanOut:new Set(graph.outgoing.get(b.id).map(r=>r.b)).size,fanIn:new Set(graph.incoming.get(b.id).map(r=>r.a)).size,cycleSize:graph.components.get(b.id)?.length||0,churn:b.churn??model.meta.churn?.[b.file]??null}))
    .filter(b=>!b.generated&&spec.match(b)).sort((a,b)=>(b[sort]??-1)-(a[sort]??-1)||a.name.localeCompare(b.name));
}
export function editorLink(template,path,line,end=line) {
  if(!/^(vscode|vscode-insiders|idea|https?):\/\//.test(template))throw Error('Use a vscode://, idea://, or http(s):// editor link.');
  return template.replaceAll('{path}',path.split(/[\\/]/).map(encodeURIComponent).join('/')).replaceAll('{line}',String(line)).replaceAll('{end}',String(end));
}
