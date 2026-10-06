import {request} from './projects.js';
import {editorLink,graphIndex,PRESETS,rankCandidates,importCoverage} from './investigation.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
export function attachInspector(host,b,{city,onSelect=()=>{}}={}) {
  const graph=city.graph||(city.graph=graphIndex(city.model));
  const crumb=el('nav',null,'package-crumbs');crumb.setAttribute('aria-label','Package breadcrumbs');
  const pieces=b.district==='.'?[]:b.district.split('/');
  for(let i=0;i<=pieces.length;i++){const id=i?pieces.slice(0,i).join('/'):'',button=el('button',i?pieces[i-1]:'Project','mini-btn');button.onclick=()=>{city.applyFilter(id);document.getElementById('filter').value=id;};crumb.append(button);}
  host.prepend(crumb);
  const evidence=el('details',null,'metric-evidence'),summary=el('summary','How these metrics were obtained');evidence.append(summary);
  const a=b.analysis||{parser:'legacy model',version:'unknown',source:city.model.meta.source,confidence:'unknown'};
  evidence.append(el('p',`${a.parser} ${a.version} · ${a.source} · confidence: ${a.confidence}`,'muted-note'));
  evidence.append(el('p',b.generated?'Generated source · '+a.generatedReason:'Authored source · '+(a.generatedReason||'classification unavailable'),'muted-note'));
  for(const [key,v] of Object.entries(b.metric_evidence||{})){const row=el('p',`${key.toUpperCase()} ${v.value}: ${v.rule}${v.range?` (lines ${v.range.join('–')})`:''}${v.members?.length?': '+v.members.join(', '):''}`,'muted-note');row.dataset.metric=key;evidence.append(row);}
  evidence.append(el('p',`DEPS ${b.deps}: sum of weights of incoming and outgoing model edges. Fan-in ${new Set(graph.incoming.get(b.id).map(r=>r.a)).size}; fan-out ${new Set(graph.outgoing.get(b.id).map(r=>r.b)).size}.`,'muted-note'));
  for(const note of a.limitations||[])evidence.append(el('p',note,'muted-note'));
  for(const d of a.diagnostics||[])evidence.append(el('p',`Line ${d.line}: ${d.message}`,'muted-note'));
  host.append(evidence);
  const preview=el('section',null,'source-section'),show=el('button','Preview source','mini-btn'),status=el('p','','muted-note'),code=el('pre',null,'source-preview');code.dir='ltr';code.tabIndex=0;code.setAttribute('aria-label','Source preview');
  const editor=el('a','Open selected lines in editor','mini-btn');editor.hidden=true;
  const setting=el('details'),settingTitle=el('summary','Editor link settings'),input=el('input');input.type='text';input.setAttribute('aria-label','Editor URL template');input.placeholder='vscode://file/{path}:{line}';
  try{input.value=localStorage.getItem('codecity.editor')||'vscode://file/{path}:{line}';}catch{input.value='vscode://file/{path}:{line}';}
  setting.append(settingTitle,input,el('p','Placeholders: {path}, {line}, {end}.','muted-note'));preview.append(show,status,editor,code,setting);host.append(preview);
  let current=null,serial=0;
  const updateEditor=()=>{if(!current)return;try{if(city.model.meta.commit||b.comparison_status==='removed'){editor.hidden=true;return;}editor.href=editorLink(input.value,current.path,current.start,current.end);editor.hidden=false;try{localStorage.setItem('codecity.editor',input.value);}catch{}}catch(e){editor.hidden=true;status.textContent=e.message;}};
  input.onchange=updateEditor;
  const source=async member=>{
    const seq=++serial;status.textContent='Loading source…';code.replaceChildren();editor.hidden=true;
    try {
      let data;
      const historical=(city.model.meta.snapshotSources|| (b.comparison_status==='removed'?city.model.meta.comparisonSources:null))?.[b.file];
      if(historical!=null){const m=member!=null?b.members[member]:null,start=m?.line||b.start_line,end=m?.end_line||b.end_line,from=Math.max(1,start-3),lines=historical.split(/\r?\n/);data={path:city.model.meta.root.replace(/[\\/]$/,'')+'/'+b.file,start,end,from,lines:lines.slice(from-1,Math.min(end+3,from+399)),truncated:end>from+399};}
      else data=await request('source',{id:b.id,...(member!=null?{member}:{})});if(seq!==serial||!host.isConnected)return;current=data;
      status.textContent=data.stale?'Source changed since scanning; rescan before trusting the highlighted range.':`Lines ${data.start}–${data.end}${data.truncated?' · preview limited to 400 lines':''}`;
      data.lines.forEach((text,i)=>{const line=data.from+i,row=el('span',`${String(line).padStart(4)}  ${text}\n`,line>=data.start&&line<=data.end?'source-line selected-line':'source-line');row.dataset.line=String(line);code.append(row);});
      updateEditor();code.querySelector('.selected-line')?.scrollIntoView({block:'nearest'});
    }catch(e){if(seq===serial)status.textContent=e.message;}
  };
  show.onclick=()=>source();host.querySelectorAll('.member-row').forEach(button=>button.addEventListener('click',()=>source(Number(button.dataset.mi))));
  const deps=el('details');deps.open=true;deps.append(el('summary','Dependencies and cycles'));
  const cycle=graph.components.get(b.id);deps.append(el('p',cycle?`Cycle component: ${cycle.map(id=>graph.byId.get(id).name).join(' → ')}. Members are mutually reachable; this order is not a cycle path.`:'No directed cycle in the available graph.','muted-note'));
  const routed=new Set((city.street?.paths||[]).map(p=>p.a+'\0'+p.b));
  const skipped=new Map((city.street?.unroutedEdges||[]).map(e=>[e.a+'\0'+e.b,e.reason]));
  for(const [label,edges,target] of [['Outgoing',graph.outgoing.get(b.id),'b'],['Incoming',graph.incoming.get(b.id),'a']]) {
    deps.append(el('p',`${label} (${edges.length})`,'details-section'));
    for(const r of edges){const button=el('button',`${graph.byId.get(r[target])?.name} · ${r.kind||'dependency'} × ${r.weight}${routed.has(r.a+'\0'+r.b)?'':' · no street'}`,'member-row');button.title=(skipped.get(r.a+'\0'+r.b)||'')+' '+JSON.stringify(r.evidence||[]);if(r.historical)button.textContent+=' · historical edge';button.onclick=()=>onSelect(graph.byId.get(r[target]));deps.append(button);
      for(const e of r.evidence||[])deps.append(el('p',e.file?`${e.file}:${e.line} · ${e.symbol||e.ref||''}${e.alias?' as '+e.alias:''}`:e.description,'muted-note'));}
  }
  host.append(deps);
}

export function initInvestigations(model,city,onSelect) {
  const host=document.getElementById('investigations');if(!host)return;
  host.replaceChildren();const select=el('select'),sort=el('select'),note=el('p','','muted-note'),results=el('div',null,'investigation-results');
  select.setAttribute('aria-label','Investigation preset');sort.setAttribute('aria-label','Sort investigation results');
  select.append(new Option('Choose an investigation',''));for(const [key,p] of Object.entries(PRESETS))select.append(new Option(p.label,key));
  for(const [key,label] of [['loc','Lines'],['fanOut','Fan-out'],['complexity','Complexity'],['churn','Churn'],['coverage','Coverage']])sort.append(new Option(label,key));
  const draw=()=>{const p=PRESETS[select.value];note.textContent=p?.explain||'Evidence-based candidates for review. Generated code is excluded.';results.replaceChildren();city.highlightSubset(null);if(!p)return;
    const rows=rankCandidates(model,select.value,sort.value,city.graph);city.highlightSubset(rows.map(b=>b.id));results.append(el('p',`${rows.length} candidates`,'muted-note'));
    for(const b of rows.slice(0,300)){const button=el('button',`${b.name} · LOC ${b.loc} · out ${b.fanOut} · complexity ${b.complexity??'?'} · churn ${b.churn??'?'} · coverage ${b.coverage==null?'unknown':Math.round(b.coverage*100)+'%'}`,'member-row');button.onclick=()=>onSelect(b);results.append(button);}
    if(rows.length>300)results.append(el('p','Showing the first 300; use sorting or a query to narrow results.','muted-note'));
  };
  select.onchange=()=>{sort.value=PRESETS[select.value]?.sort||'loc';draw();};sort.onchange=draw;
  const upload=el('input');upload.type='file';upload.accept='.json,application/json';upload.setAttribute('aria-label','Import file coverage JSON');
  const uploadLabel=el('label','Import coverage JSON','muted-note');uploadLabel.append(upload);
  upload.onchange=async()=>{const file=upload.files[0];if(!file)return;try{if(file.size>8_000_000)throw Error('Coverage report exceeds 8 MB.');const n=importCoverage(model,JSON.parse(await file.text()),file.name);draw();note.textContent=`Coverage imported for ${n} buildings. `+note.textContent;document.getElementById('opt-coverage').style.display='';city.setMapping({color:city.mapping.color});}catch(e){note.textContent=e.message;}};
  host.append(select,sort,note,uploadLabel,results);draw();
}

export function drawMinimap(city,onSelect) {
  const map=document.getElementById('minimap');if(!map)return;map.replaceChildren();
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${city.groundSide} ${city.groundSide}`);svg.setAttribute('aria-label','City package minimap');
  for(const d of city.packageRects||[]) {const r=document.createElementNS(ns,'rect');for(const [k,v] of Object.entries({x:d.rect.x,y:d.rect.y,width:d.rect.w,height:d.rect.h}))r.setAttribute(k,v);r.setAttribute('class','map-package');svg.append(r);}
  for(const e of city.byBuilding.values()){const r=document.createElementNS(ns,'rect'),title=document.createElementNS(ns,'title');title.textContent=e.building.name;r.append(title);for(const [k,v] of Object.entries({x:e.center.x-e.half.w,y:e.center.z-e.half.d,width:e.half.w*2,height:e.half.d*2}))r.setAttribute(k,v);r.setAttribute('fill','#'+e.matFull.color.getHexString());r.setAttribute('class','map-building');r.onclick=()=>onSelect(e.building);svg.append(r);}
  map.append(svg);
}
