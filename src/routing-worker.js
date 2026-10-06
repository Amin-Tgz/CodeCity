import {StreetRouter,Point3} from './routing.js';
self.onmessage=event=>{
  try {
    const {roads,buildings,side,terraces}=event.data,by=new Map(buildings.map(b=>[b.id,{ground:new Point3(b.ground.x,b.ground.y,b.ground.z),half:b.half,district:b.district,packageRect:b.packageRect}]));
    self.postMessage(new StreetRouter({roads},by,side,terraces).routePlan());
  }catch(error){self.postMessage({error:error.message});}
};
