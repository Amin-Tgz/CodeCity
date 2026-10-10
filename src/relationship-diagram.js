import {t} from './i18n.js';
import {relationshipNeighbors} from './relationships.js';

export function drawRelationshipDiagram(host, building, city, onSelect) {
  const section=document.createElement('section');section.className='relationship-diagram';
  const heading=document.createElement('h3');heading.textContent=t('Dependency map');section.append(heading);
  const legend=document.createElement('p');legend.className='relationship-legend';
  for(const [role,label] of [['incoming','Incoming'],['outgoing','Outgoing'],['both','Both directions']]){
    const item=document.createElement('span');item.className=role;item.textContent=t(label);legend.append(item);
  }
  section.append(legend);
  const note=document.createElement('p');note.className='muted-note';note.textContent=t('Select a node to explore its connections.');section.append(note);
  const canvas=document.createElement('div');section.append(canvas);
  const neighbors=relationshipNeighbors(city.model.roads,building.id);
  const incoming=[...neighbors].filter(([,e])=>e.incoming).sort((a,b)=>b[1].incoming-a[1].incoming||a[0].localeCompare(b[0]));
  const outgoing=[...neighbors].filter(([,e])=>e.outgoing).sort((a,b)=>b[1].outgoing-a[1].outgoing||a[0].localeCompare(b[0]));
  const self=city.model.roads.filter(e=>e.a===building.id&&e.b===building.id);
  if(self.length){const note=document.createElement('p');note.className='muted-note';note.textContent=t('Self connections: {n}',{n:self.length});section.append(note);}
  if(!neighbors.size){note.textContent=t(self.length?'Self connections: {n}':'No connection was identified in the project analysis. This does not prove independence.',{n:self.length});}
  let limit=6;
  const more=document.createElement('button');more.type='button';more.className='mini-btn';
  const ns='http://www.w3.org/2000/svg';
  const element=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,value);return n;};
  const draw=()=>{
    canvas.replaceChildren();
    const rows=Math.max(1,Math.min(limit,Math.max(incoming.length,outgoing.length))),height=rows*46+30,cy=height/2;
    const svg=element('svg',{viewBox:`0 0 330 ${height}`,role:'group','aria-label':t('Dependency map'),dir:'ltr'});
    const defs=element('defs');
    for(const role of ['incoming','outgoing']){const marker=element('marker',{id:`dependency-arrow-${role}`,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});marker.append(element('path',{d:'M 0 0 L 10 5 L 0 10 z',class:role}));defs.append(marker);}
    svg.append(defs);
    const node=(id,x,y,role)=>{
      const b=city.byBuilding.get(id)?.building;if(!b)return;
      const g=element('g',{class:`dependency-node ${role}`,role:'button',tabindex:'0','aria-label':b.name,'data-building':id});
      const title=element('title');title.textContent=`${b.name} · ${b.file}`;
      const rect=element('rect',{x:x-48,y:y-15,width:96,height:30,rx:6});
      const text=element('text',{x,y:y+4,'text-anchor':'middle'});text.textContent=b.name.length>12?b.name.slice(0,11)+'…':b.name;
      g.append(title,rect,text);g.onclick=()=>onSelect(b);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(b);}};svg.append(g);
    };
    for(const [side,list]of [['incoming',incoming],['outgoing',outgoing]]){
      list.slice(0,limit).forEach(([id,edge],i)=>{
        const y=30+i*46,x=side==='incoming'?50:280;
        const d=side==='incoming'?`M 98 ${y} C 109 ${y}, 109 ${cy}, 117 ${cy}`:`M 213 ${cy} C 221 ${cy}, 221 ${y}, 232 ${y}`;
        const path=element('path',{d,class:`dependency-edge ${side}`,'marker-end':`url(#dependency-arrow-${side})`});
        const title=element('title');title.textContent=`${t(side==='incoming'?'Incoming':'Outgoing')} × ${edge[side]}`;path.append(title);svg.append(path);
        node(id,x,y,edge.incoming&&edge.outgoing?'both':side);
      });
    }
    node(building.id,165,cy,'selected');canvas.append(svg);
    const remaining=Math.max(0,incoming.length-limit)+Math.max(0,outgoing.length-limit);
    more.hidden=!remaining;more.textContent=t('Show more ({n} remaining)',{n:remaining});
  };
  more.onclick=()=>{limit+=6;draw();};section.append(more);draw();host.prepend(section);
}
