import {request} from './projects.js';
import {excludePart} from './exclusions.js';
import {editorLink,graphIndex} from './investigation.js';
import {t} from './i18n.js';
import {drawRelationshipDiagram} from './relationship-diagram.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
export function attachInspector(host,b,{city,onSelect=()=>{}}={}) {
  const graph=city.graph||(city.graph=graphIndex(city.model));
  const crumbSection=el('div',null,'package-crumbs-section');
  const crumbTitle=el('div',t('District filter'),'package-crumbs-title');
  const crumbHint=el('p',t('Click a folder level to filter the 3D city to that district, or click again to restore all buildings.'),'package-crumbs-hint');
  const crumb=el('nav',null,'package-crumbs');crumb.setAttribute('aria-label','Package breadcrumbs');
  const pieces=b.district==='.'?[]:b.district.split('/');
  const buttons=[];
  const updateActive=()=>{
    const current=city.filterId;
    for(const item of buttons){
      const isActive=(current===item.id)||(item.id===''&&current===null);
      item.button.classList.toggle('active',isActive);
      item.button.setAttribute('aria-pressed',String(isActive));
    }
  };
  for(let i=0;i<=pieces.length;i++){
    const id=i?pieces.slice(0,i).join('/'):'';
    const button=el('button',i?pieces[i-1]:'Project','mini-btn');
    button.onclick=()=>{
      if(city.filterId===id||(id===''&&city.filterId===null)){
        city.applyFilter(null);
        const f=document.getElementById('filter');if(f)f.value='';
      } else {
        city.applyFilter(id);
        const f=document.getElementById('filter');if(f)f.value=id;
      }
      updateActive();
    };
    buttons.push({id,button});
    crumb.append(button);
  }
  updateActive();
  crumbSection.append(crumbTitle,crumbHint,crumb);
  host.prepend(crumbSection);
  drawRelationshipDiagram(host,b,city,onSelect);
  if(city.model.meta.source==='scan'&&!city.model.meta.commit&&!city.model.meta.comparisonSources) {
    const actions=el('div',null,'query-actions'),button=el('button',t('Exclude this building'),'mini-btn'),error=el('p','','muted-note');error.setAttribute('role','alert');
    button.onclick=async()=>{button.disabled=true;error.textContent='';try{await excludePart({kind:'symbol',value:b.id});}catch(err){error.textContent=err.message;}finally{button.disabled=false;}};
    actions.append(button,error);
    host.append(actions);
  }
  const evidence=el('details',null,'metric-evidence'),summary=el('summary','How these metrics were obtained');evidence.append(summary);
  evidence.dataset.advanced='';
  const a=b.analysis||{parser:'legacy model',version:'unknown',source:city.model.meta.source,confidence:'unknown'};
  evidence.append(el('p',`${a.parser} ${a.version} · ${a.source} · confidence: ${a.confidence}`,'muted-note'));
  evidence.append(el('p',b.generated?'Generated source · '+a.generatedReason:'Authored source · '+(a.generatedReason||'classification unavailable'),'muted-note'));
  for(const [key,v] of Object.entries(b.metric_evidence||{})){const row=el('p',`${key.toUpperCase()} ${v.value}: ${v.rule}${v.range?` (lines ${v.range.join('–')})`:''}${v.members?.length?': '+v.members.join(', '):''}`,'muted-note');row.dataset.metric=key;evidence.append(row);}
  evidence.append(el('p',`DEPS ${b.deps}: sum of weights of incoming and outgoing model edges. Fan-in ${new Set(graph.incoming.get(b.id).map(r=>r.a)).size}; fan-out ${new Set(graph.outgoing.get(b.id).map(r=>r.b)).size}.`,'muted-note'));
  for(const note of a.limitations||[])evidence.append(el('p',note,'muted-note'));
  for(const d of a.diagnostics||[])evidence.append(el('p',`Line ${d.line}: ${d.message}`,'muted-note'));
  host.append(evidence);
  const editorSection=el('section',null,'editor-section query-actions');
  const openEditorBtn=el('button',t('Open in editor'),'mini-btn');
  openEditorBtn.id='details-open-editor';
  const editorSelect=el('select',null,'mini-btn');
  editorSelect.id='details-editor-select';
  editorSelect.setAttribute('aria-label',t('Choose editor'));
  for(const [val,label] of [['vscode','VS Code'],['cursor','Cursor'],['system','System Default']]){
    const opt=new Option(t(label),val);
    editorSelect.append(opt);
  }
  try{editorSelect.value=localStorage.getItem('codecity.editor_choice')||'vscode';}catch{}
  editorSelect.onchange=()=>{try{localStorage.setItem('codecity.editor_choice',editorSelect.value);}catch{}};
  const editorStatus=el('p','','muted-note');
  editorStatus.id='details-editor-status';
  const doOpen=async(lineNum)=>{
    openEditorBtn.disabled=true;editorStatus.textContent=t('Opening in editor…');
    try{
      await request('editor/open',{file:b.file,line:lineNum||b.start_line||1,editor:editorSelect.value});
      editorStatus.textContent=t('Opened in editor.');
    }catch(err){
      editorStatus.textContent=err.message;
    }finally{
      openEditorBtn.disabled=false;
    }
  };
  openEditorBtn.onclick=()=>doOpen(b.start_line);
  host.querySelectorAll('.member-row').forEach(button=>button.addEventListener('click',()=>{
    const mi=Number(button.dataset.mi);
    const m=b.members?.[mi];
    if(m?.line)doOpen(m.line);
  }));
  editorSection.append(openEditorBtn,editorSelect,editorStatus);
  host.append(editorSection);
  const deps=el('details');deps.open=true;deps.append(el('summary',t('Dependencies and cycles')));
  const cycle=graph.components.get(b.id);deps.append(el('p',cycle?t('Mutually reachable: {names}. This list is not a cycle path.',{names:cycle.map(id=>graph.byId.get(id).name).join(' → ')}):t('No directed cycle in the available graph.'),'muted-note'));
  if(!graph.incoming.get(b.id).length&&!graph.outgoing.get(b.id).length)deps.append(el('p',t('No connection was identified in the project analysis. This does not prove independence.'),'muted-note'));
  for(const [label,edges,target] of [['Outgoing',graph.outgoing.get(b.id),'b'],['Incoming',graph.incoming.get(b.id),'a']]) {
    deps.append(el('p',`${t(label)} (${edges.length})`,'details-section'));
    for(const r of edges){const button=el('button',`${graph.byId.get(r[target])?.name} · ${t(r.kind||'dependency')} × ${r.weight}`,'member-row');button.title=t('Select this building and inspect its details.');if(r.historical)button.textContent+=' · '+t('historical edge');button.onclick=()=>onSelect(graph.byId.get(r[target]));deps.append(button);
      for(const e of r.evidence||[])deps.append(el('p',e.file?`${e.file}${e.line?':'+e.line:''} · ${e.symbol||e.ref||''}${e.alias?' as '+e.alias:''}${e.description?' · '+e.description:''}`:e.description,'muted-note'));}
  }
  host.append(deps);
}

export function drawMinimap(city,onSelect) {
  const map=document.getElementById('minimap');if(!map)return;map.replaceChildren();
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${city.groundSide} ${city.groundSide}`);svg.setAttribute('aria-label','City package minimap');
  for(const d of city.packageRects||[]) {const r=document.createElementNS(ns,'rect');for(const [k,v] of Object.entries({x:d.rect.x,y:d.rect.y,width:d.rect.w,height:d.rect.h}))r.setAttribute(k,v);r.setAttribute('class','map-package');svg.append(r);}
  for(const e of city.byBuilding.values()){const r=document.createElementNS(ns,'rect'),title=document.createElementNS(ns,'title');title.textContent=e.building.name;r.append(title);for(const [k,v] of Object.entries({x:e.center.x-e.half.w,y:e.center.z-e.half.d,width:e.half.w*2,height:e.half.d*2}))r.setAttribute(k,v);r.setAttribute('fill','#'+e.matFull.color.getHexString());r.setAttribute('class','map-building');r.onclick=()=>onSelect(e.building);svg.append(r);}
  map.append(svg);
}
