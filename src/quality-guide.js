import {t} from './i18n.js';

// Isometric cuboids share one projection; streets stay on district plates.
function diagram(outlier) {
  const point=(x,z,y=4)=>[180+(x-z),110+(x+z)*.46-y].join(',');
  const block=(x,z,w,d,h,color)=>{
    const polygon=(points,fill)=>`<polygon points="${points.join(' ')}" fill="${fill}" stroke="#132b39" stroke-width=".8"/>`;
    return polygon([point(x,z+d),point(x+w,z+d),point(x+w,z+d,h+4),point(x,z+d,h+4)],color)
      +polygon([point(x+w,z),point(x+w,z+d),point(x+w,z+d,h+4),point(x+w,z,h+4)],outlier&&h>60?'#94342b':'#296978')
      +polygon([point(x,z,h+4),point(x+w,z,h+4),point(x+w,z+d,h+4),point(x,z+d,h+4)],outlier&&h>60?'#e78360':'#68b7ba');
  };
  const street=points=>`<polyline points="${points.map(([x,z])=>point(x,z,5)).join(' ')}" fill="none" stroke="#152b36" stroke-width="7" stroke-linejoin="round"/><polyline points="${points.map(([x,z])=>point(x,z,5.1)).join(' ')}" fill="none" stroke="#e7be6a" stroke-width="1.3" stroke-dasharray="4 3"/>`;
  let svg='<svg viewBox="60 15 330 240" aria-hidden="true" focusable="false">';
  for(const x of [0,100]) svg+=`<polygon points="${[point(x,0,0),point(x+80,0,0),point(x+80,100,0),point(x,100,0)].join(' ')}" fill="#142634"/><polygon points="${[point(x,0),point(x+80,0),point(x+80,100),point(x,100)].join(' ')}" fill="#334f58" stroke="#6d8990"/>`;
  if(outlier) {
    for(const x of [120,157])svg+=street([[x,35],[x,50],[95,50],[95,95],[40,95],[40,80]]);
    for(const x of [120,157])svg+=street([[x,85],[x,95],[40,95],[40,80]]);
    svg+=block(15,35,50,45,88,'#d1462f');
    for(const z of [15,65])for(const x of [110,147])svg+=block(x,z,20,20,25,'#2f8f9d');
  } else {
    for(const offset of [0,100]) {
      svg+=street([[offset+20,35],[offset+20,50],[offset+58,50],[offset+58,35]]);
      svg+=street([[offset+20,65],[offset+20,50],[offset+58,50],[offset+58,65]]);
      for(const z of [15,65])for(const x of [offset+10,offset+48])svg+=block(x,z,20,20,x%100<30?25:32,'#2f8f9d');
    }
  }
  return svg+'</svg>';
}

// Relative visual signals, not an invented code-quality score.
export function renderQualityGuide(host) {
  const section=document.createElement('section');section.className='quality-guide';
  const heading=document.createElement('h3');heading.textContent='Recognizing code quality visually';section.append(heading);
  const intro=document.createElement('p');intro.textContent='Use the default mapping for these examples: height = methods, footprint = attributes, colour = lines of code. Language and comparison colours have different meanings.';section.append(intro);
  const examples=document.createElement('div');examples.className='quality-examples';
  for(const [title,text,outlier] of [
    ['More balanced','Related buildings have comparable sizes, and most streets stay inside their district.',false],
    ['Worth investigating','One unusually tall, wide, warm-coloured building attracts many streets from other districts.',true],
  ]) {
    const card=document.createElement('figure');card.className='quality-example';card.innerHTML=diagram(outlier);
    const label=document.createElement('b');label.textContent=title;
    const p=document.createElement('p');p.textContent=text;card.append(label,p);examples.append(card);
  }
  section.append(examples);
  const rows=[
    ['Similar-sized neighbours','A tall, warm-coloured outlier','Inspect long methods and multiple responsibilities; a large class may need splitting.'],
    ['Compact, coherent districts','A district dominates the city','Check whether the folder mixes unrelated features; consider clearer module boundaries.'],
    ['Mostly local streets','Many streets cross district boundaries','Inspect coupling and dependency direction. A shared core can be legitimate; look for cycles and costly changes.'],
    ['A proportionate footprint','A very wide base with few methods','Inspect stored state and field ownership. Data models and DTOs can correctly look like this.'],
  ];
  const table=document.createElement('table');table.className='help-table quality-table';
  const head=document.createElement('thead');const tr=document.createElement('tr');
  for(const title of ['Healthier signal','Review signal','What to check']){const th=document.createElement('th');th.textContent=title;tr.append(th);}head.append(tr);table.append(head);
  const body=document.createElement('tbody');
  for(const row of rows){const tr=document.createElement('tr');for(const text of row){const td=document.createElement('td');td.textContent=text;tr.append(td);}body.append(tr);}table.append(body);section.append(table);
  const note=document.createElement('p');note.className='help-note';note.textContent='Compare buildings with their peers, select outliers to trace their streets, then open the source and tests. Small or green does not prove good code, and large or red does not prove bad code. The city points to review candidates; it cannot judge correctness, security, or architecture by itself.';section.append(note);
  const decor=document.createElement('p');decor.textContent='The meadow, river, trees, birds, and outer road are decoration. Only buildings, districts, and inner dependency streets represent your code.';section.append(decor);
  for(const node of section.querySelectorAll('h3,p,b,th,td'))node.textContent=t(node.textContent);
  host.append(section);
}
