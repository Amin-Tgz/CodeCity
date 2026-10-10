// Every model edge remains represented, including links without a ground route.
// Elevated shared routes are a diagram of dependencies, not physical city roads.
export function connectionWidth(weight) {
  return .6 + Math.min(3.4, Math.log2(1 + weight) * .3);
}

function anchor(entries) {
  const rect=entries[0].packageRect;
  if(rect)return {x:rect.x+rect.w/2,z:rect.y+rect.h/2};
  return {x:entries.reduce((n,e)=>n+e.ground.x,0)/entries.length,z:entries.reduce((n,e)=>n+e.ground.z,0)/entries.length};
}

export function sharedConnections(edges, by) {
  const groups=new Map();
  const roof=[...by.values()].reduce((height,e)=>Math.max(height,e.roofY??e.ground.y),0);
  for(const edge of edges){
    const a=by.get(edge.a),b=by.get(edge.b);if(!a||!b)continue;
    const from=a.district||'.',to=b.district||'.',key=JSON.stringify([from,to]);
    if(!groups.has(key))groups.set(key,{from,to,edges:[]});
    groups.get(key).edges.push(edge);
  }
  return [...groups.values()].map(group=>{
    const idsA=[...new Set(group.edges.map(e=>e.a))],idsB=[...new Set(group.edges.map(e=>e.b))];
    const a=anchor(idsA.map(id=>by.get(id))),b=anchor(idsB.map(id=>by.get(id)));
    const weight=group.edges.reduce((n,e)=>n+e.weight,0),y=roof+8;
    // Opposite directions use separate corridors. Internal bundles form a loop.
    const sign=group.from<group.to?1:-1,offset=sign*(5+connectionWidth(weight));
    const pts=group.from===group.to
      ? [{...a,y},{x:a.x+8,y,z:a.z},{x:a.x+8,y,z:a.z+8},{x:a.x,y,z:a.z+8},{...a,y}]
      : [{...a,y},{x:a.x,y,z:a.z+offset},{x:b.x,y,z:b.z+offset},{...b,y}];
    return {...group,a:group.edges[0].a,b:group.edges[0].b,weight,pts,width:connectionWidth(weight),tier:'shared',shared:true};
  });
}

export function directConnections(edges,by) {
  return edges.flatMap(edge=>{
    const a=by.get(edge.a),b=by.get(edge.b);if(!a||!b)return [];
    const start={x:a.ground.x,y:(a.roofY??a.ground.y)+.6,z:a.ground.z};
    const end={x:b.ground.x,y:(b.roofY??b.ground.y)+.6,z:b.ground.z};
    const y=Math.max(start.y,end.y)+5;
    const pts=edge.a===edge.b
      ? [start,{x:start.x+4,y,z:start.z},{x:start.x+4,y,z:start.z+4},{x:start.x,y,z:start.z+4},end]
      : [start,{x:start.x,y,z:start.z},{x:end.x,y,z:end.z},end];
    return [{...edge,pts,width:.35,tier:'direct'}];
  });
}
