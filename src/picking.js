// A uniform X/Z index narrows ray candidates using their three-dimensional AABBs.
export class PickingIndex {
  constructor(entries,cell=12) {
    this.cell=cell;this.cells=new Map();
    for(const e of entries){const minX=e.center.x-e.half.w,maxX=e.center.x+e.half.w,minZ=e.center.z-e.half.d,maxZ=e.center.z+e.half.d;
      for(let x=Math.floor(minX/cell);x<=Math.floor(maxX/cell);x++)for(let z=Math.floor(minZ/cell);z<=Math.floor(maxZ/cell);z++){const k=x+','+z;if(!this.cells.has(k))this.cells.set(k,[]);this.cells.get(k).push(e);}}
  }
  candidates(ray,offset,side) {
    const ox=ray.origin.x-offset.x,oz=ray.origin.z-offset.z,dx=ray.direction.x,dz=ray.direction.z;
    let enter=0,exit=Infinity;
    for(const [o,d] of [[ox,dx],[oz,dz]]){if(Math.abs(d)<1e-10){if(o<0||o>side)return [];}else{const a=-o/d,b=(side-o)/d;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}}
    if(exit<enter)return [];
    const found=new Set(),cell=this.cell;
    const check=(x,z)=>{for(const e of this.cells.get(x+','+z)||[])if(e.group.visible)found.add(e.body);};
    if(!Number.isFinite(exit)){check(Math.floor(ox/cell),Math.floor(oz/cell));return [...found];}
    // DDA traverses every crossed cell (sampling could miss thin footprints).
    let x=Math.floor((ox+dx*enter)/cell),z=Math.floor((oz+dz*enter)/cell);
    const sx=Math.sign(dx),sz=Math.sign(dz),tx=dx?cell/Math.abs(dx):Infinity,tz=dz?cell/Math.abs(dz):Infinity;
    let nx=dx?(((sx>0?x+1:x)*cell-ox)/dx):Infinity,nz=dz?(((sz>0?z+1:z)*cell-oz)/dz):Infinity;
    for(let steps=0;steps<Math.ceil(side/cell)*2+8;steps++){check(x,z);if(Math.min(nx,nz)>exit)break;if(nx<nz){x+=sx;nx+=tx;}else{z+=sz;nz+=tz;}}
    return [...found];
  }
}
