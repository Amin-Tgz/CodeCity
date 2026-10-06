import * as THREE from 'three';
import { grassTexture, roadTexture } from './textures.js';

// Decorative surroundings are separate from the code model and never pickable.
export function riverX(z, side) {
  return side * .87 + Math.sin(z / (side * .43)) * side * .09 + Math.sin(z / (side * .19)) * side * .025;
}
export class Landscape {
  constructor(side, { hasCity = true, reducedMotion = false } = {}) {
    this.side = side;
    this.reducedMotion = reducedMotion;
    this.root = new THREE.Group();
    this.root.name = 'landscape';
    this.elapsed = 0;
    const h = side / 2;
    let seed = 4719;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const add = (geometry, material, x=0, y=0, z=0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x,y,z); this.root.add(mesh); return mesh;
    };
    const grass = new THREE.MeshStandardMaterial({map:grassTexture(),roughness:1,color:'#b8d489'});
    const meadow = add(new THREE.PlaneGeometry(side*16,side*16),grass);
    meadow.rotation.x = -Math.PI/2; meadow.receiveShadow=true;
    this.ground = meadow;

    if(hasCity) {
      const plaza=add(new THREE.PlaneGeometry(side+4,side+4),new THREE.MeshStandardMaterial({color:'#59645a',roughness:1}),0,.025);
      plaza.rotation.x=-Math.PI/2; plaza.receiveShadow=true;
      const tex=roadTexture(2);tex.repeat.set((side+34)/8,1);
      const asphalt=new THREE.MeshStandardMaterial({map:tex,roughness:1});
      for(const z of [-h-16,h+16]) {const road=add(new THREE.PlaneGeometry(side+36,4),asphalt,0,.07,z);road.rotation.x=-Math.PI/2;}
      for(const x of [-h-16,h+16]) {const road=add(new THREE.PlaneGeometry(side+36,4),asphalt,x,.07);road.rotation.set(-Math.PI/2,0,Math.PI/2);}
    }

    const ribbon = (width,y,color) => {
      const points=[],index=[],length=side*5,segments=130;
      for(let i=0;i<=segments;i++) {
        const z=-length/2+i*length/segments,x=riverX(z,side);
        points.push(x-width/2,y,z,x+width/2,y,z);
        if(i<segments) {const k=i*2;index.push(k,k+2,k+1,k+1,k+2,k+3);}
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geo.setIndex(index);geo.computeVertexNormals();
      const water=add(geo,new THREE.MeshStandardMaterial({color,roughness:.32,metalness:.12,side:THREE.DoubleSide}));
      return water;
    };
    ribbon(side*.105,.06,'#c7bb91');
    this.river=ribbon(side*.075,.1,'#59b8c5');
    // A few pale ribbons give the river a readable direction from above.
    const foamPoints=[];
    for(let i=0;i<=100;i++){const z=-side*2.5+i*side*.05;foamPoints.push(new THREE.Vector3(riverX(z,side)+Math.sin(i*.2)*side*.018,.12,z));}
    const foamGeo=new THREE.BufferGeometry().setFromPoints(foamPoints);
    this.root.add(new THREE.Line(foamGeo,new THREE.LineBasicMaterial({color:'#b6e4db',transparent:true,opacity:.55})));

    const treePositions=[];
    for(let attempts=0;treePositions.length<250&&attempts<4000;attempts++) {
      const x=(random()-.5)*side*4.6,z=(random()-.5)*side*4.6;
      if(Math.abs(x)<h+25&&Math.abs(z)<h+25)continue;
      if(Math.abs(x-riverX(z,side))<side*.07)continue;
      const scale=.75+random()*1.1;
      treePositions.push({x,z,scale});
    }
    this.treePositions=treePositions;
    const trunkGeo=new THREE.CylinderGeometry(.45,.72,1,7);
    const crownGeo=new THREE.IcosahedronGeometry(1,1);
    const trunks=new THREE.InstancedMesh(trunkGeo,new THREE.MeshStandardMaterial({color:'#6c5036',roughness:1}),treePositions.length);
    const crowns=new THREE.InstancedMesh(crownGeo,new THREE.MeshStandardMaterial({color:'#4f803c',roughness:1}),treePositions.length*3);
    trunks.castShadow=crowns.castShadow=true; crowns.receiveShadow=true;
    const dummy=new THREE.Object3D(),color=new THREE.Color();
    treePositions.forEach((p,i)=>{
      const height=(side*.015+2.4)*p.scale;
      dummy.position.set(p.x,height/2,p.z);dummy.scale.set(p.scale,height,p.scale);dummy.rotation.set(0,0,0);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
      for(let j=0;j<3;j++) {
        const radius=(side*.012+2)*p.scale;
        dummy.position.set(p.x+(j-1)*radius*.45,height+radius*(.45+j*.18),p.z+Math.sin(j*2)*radius*.45);
        dummy.scale.set(radius,radius*(1.15-j*.12),radius);dummy.rotation.set(random(),random(),0);dummy.updateMatrix();crowns.setMatrixAt(i*3+j,dummy.matrix);
        color.setHSL(.23+random()*.06,.28+random()*.18,.23+random()*.13);crowns.setColorAt(i*3+j,color);
      }
    });
    this.root.add(trunks,crowns);

    // Soft hills sit beyond the urban square, preserving its flat metric geometry.
    const hills=new THREE.InstancedMesh(new THREE.SphereGeometry(1,16,10),new THREE.MeshStandardMaterial({color:'#86a46b',roughness:1}),14);
    for(let i=0;i<14;i++) {
      const angle=i/14*Math.PI*2,dist=side*(2+random()*.7);
      dummy.position.set(Math.cos(angle)*dist,-side*.1,Math.sin(angle)*dist);
      dummy.rotation.set(0,random()*Math.PI,0);dummy.scale.set(side*(.35+random()*.3),side*(.15+random()*.07),side*(.35+random()*.3));dummy.updateMatrix();hills.setMatrixAt(i,dummy.matrix);
    }
    this.root.add(hills);

    // Mature trees nearer the boundary make the city's edge legible.
    if(hasCity) {
      const bridgeLength=riverX(0,side)-(h+18)+side*.11;
      const bridge=add(new THREE.BoxGeometry(bridgeLength,.45,3.8),new THREE.MeshStandardMaterial({color:'#b39f77',roughness:1}),(h+18)+bridgeLength/2,.42,0);
      bridge.receiveShadow=true;
      const railMaterial=new THREE.MeshStandardMaterial({color:'#7b705b',roughness:1});
      for(const z of [-2,2])add(new THREE.BoxGeometry(bridgeLength,.35,.2),railMaterial,(h+18)+bridgeLength/2,1.2,z);
    }

    const wingGeo=new THREE.BufferGeometry();
    wingGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1.3,0,-.3,.5,0,.25],3));wingGeo.computeVertexNormals();
    this.birds=new THREE.InstancedMesh(wingGeo,new THREE.MeshStandardMaterial({color:'#35453d',side:THREE.DoubleSide,roughness:1}),36);
    this.birds.frustumCulled=false;this.root.add(this.birds);
    this.flight=Array.from({length:18},(_,i)=>({angle:i/18*Math.PI*2,radius:side*(.9+random()*.55),height:side*(.14+random()*.11),speed:.035+random()*.025}));
    this._dummy=new THREE.Object3D();
    this.update(0);
  }
  update(dt) {
    if(this.reducedMotion&&this._birdsInitialized)return;
    if(!this.reducedMotion)this.elapsed+=dt;
    const time=this.elapsed,dummy=this._dummy;
    this.flight.forEach((bird,i)=>{
      const angle=bird.angle+time*bird.speed;
      for(let wing=0;wing<2;wing++) {
        dummy.position.set(Math.cos(angle)*bird.radius,bird.height+Math.sin(time+i)*.7,Math.sin(angle)*bird.radius);
        dummy.rotation.set(0,-angle,Math.sin(time*5+i)*.4*(wing?1:-1));
        const size=Math.max(1.3,this.side*.009);
        dummy.scale.set(wing?-size:size,size,size);dummy.updateMatrix();this.birds.setMatrixAt(i*2+wing,dummy.matrix);
      }
    });
    this.birds.instanceMatrix.needsUpdate=true;
    this._birdsInitialized=true;
  }
  dispose() {
    const geometries=new Set(),materials=new Set(),textures=new Set();
    this.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [].concat(o.material||[])){materials.add(m);if(m.map)textures.add(m.map);}if(o.isInstancedMesh)o.dispose();});
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const tex of textures)tex.dispose();
    this.root.removeFromParent();this.root.clear();
  }
}
