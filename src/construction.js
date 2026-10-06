import * as THREE from 'three';

// Props stay separate from code metrics and picking.
export class Construction {
  constructor(side,{reducedMotion=false}={}) {
    this.side=side;this.reducedMotion=reducedMotion;this.time=0;
    this.root=new THREE.Group();this.root.name='construction';this.root.visible=false;
    this.cranes=[];this.loaders=[];
    const yellow=new THREE.MeshStandardMaterial({color:'#eab846',roughness:.7});
    const dark=new THREE.MeshStandardMaterial({color:'#30383c',roughness:.9});
    const glass=new THREE.MeshStandardMaterial({color:'#75adc1',roughness:.3,metalness:.15});
    const box=(parent,size,position,mat=yellow)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);m.position.set(...position);m.castShadow=true;parent.add(m);return m;};
    const beam=(parent,a,b,width,mat=yellow)=>{
      const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b);
      const m=new THREE.Mesh(new THREE.CylinderGeometry(width,width,start.distanceTo(end),5),mat);
      m.position.copy(start).add(end).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());parent.add(m);return m;
    };
    const h=side/2+6,height=side*.22+12;
    for(const [x,z] of [[-h,-h],[h,h]]) {
      const crane=new THREE.Group();crane.position.set(x,.2,z);this.root.add(crane);
      box(crane,[5,1,5],[0,.5,0],dark);
      for(const x of [-.8,.8])for(const z of [-.8,.8])beam(crane,[x,1,z],[x,height,z],.13);
      for(let y=1;y<height;y+=3){beam(crane,[-.8,y,-.8],[.8,Math.min(height,y+3),-.8],.09);beam(crane,[.8,y,.8],[-.8,Math.min(height,y+3),.8],.09);}
      const jib=new THREE.Group();jib.position.y=height;crane.add(jib);
      const reach=side*.16+8;
      box(jib,[reach*1.4,.6,1.3],[reach*.3,0,0]);
      beam(jib,[-reach*.4,0,0],[0,4,0],.14);beam(jib,[0,4,0],[reach,0,0],.14);
      box(jib,[3,2,2],[-reach*.34,-1.2,0],dark);box(jib,[1.8,2,1.8],[1,-1.2,0],glass);
      const cable=beam(jib,[reach*.75,0,0],[reach*.75,-height*.45,0],.045,dark);
      const cargo=box(jib,[2.5,1.2,2],[reach*.75,-height*.45,0],dark);
      this.cranes.push({jib,cable,cargo,height});
    }
    for(let i=0;i<3;i++) {
      const loader=new THREE.Group();this.root.add(loader);
      box(loader,[4,1.3,2.3],[0,1.6,0]);box(loader,[1.9,1.8,1.8],[-.5,3,0],glass);box(loader,[2.2,.3,2.1],[-.5,4,0]);
      const wheels=[];
      for(const x of [-1.3,1.3])for(const z of [-1.25,1.25]) {
        const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.9,.9,.65,12),dark);wheel.rotation.x=Math.PI/2;wheel.position.set(x,.95,z);loader.add(wheel);wheels.push(wheel);
      }
      const arm=new THREE.Group();loader.add(arm);
      for(const z of [-.85,.85])beam(arm,[1,1.8,z],[3.7,.9,z],.2);
      box(arm,[1.6,.65,3.1],[3.6,.55,0]);box(arm,[.3,1.3,3.1],[4.2,.95,0]);
      this.loaders.push({loader,wheels,arm,phase:i/3});
    }
    this.update(0);
  }
  setPlaying(value){this.root.visible=!!value;}
  update(dt) {
    if(dt&&(!this.root.visible||this.reducedMotion))return;
    this.time+=dt;const t=this.time,h=this.side/2+7;
    this.cranes.forEach((c,i)=>{c.jib.rotation.y=-Math.PI*.25+i*Math.PI+Math.sin(t*.32+i)*.3;c.cargo.position.y=-c.height*(.4+Math.sin(t*.7+i)*.04);c.cable.position.y=c.cargo.position.y/2;c.cable.scale.y=-c.cargo.position.y/(c.height*.45);});
    this.loaders.forEach((v,i)=>{
      const distance=(t*.018+v.phase)%1*4,edge=Math.floor(distance),u=distance-edge;
      const points=[[-h,-h],[h,-h],[h,h],[-h,h],[-h,-h]],a=points[edge],b=points[edge+1];
      v.loader.position.set(a[0]+(b[0]-a[0])*u,.1,a[1]+(b[1]-a[1])*u);v.loader.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);
      v.arm.rotation.z=Math.sin(t*.8+i)*.07;for(const wheel of v.wheels)wheel.rotation.y=t*2;
    });
  }
  dispose(){const g=new Set(),m=new Set();this.root.traverse(o=>{if(o.geometry)g.add(o.geometry);if(o.material)m.add(o.material);});for(const v of g)v.dispose();for(const v of m)v.dispose();this.root.removeFromParent();this.root.clear();}
}
