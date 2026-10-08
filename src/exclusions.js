import {request} from './projects.js';
let showWithRule=null;
export function excludePart(rule) {showWithRule?.(rule);}
export function initExclusions(onModel,getSession,isWorking,setWorking) {
  const dialog=document.getElementById('exclusions-dialog'),open=document.getElementById('project-exclusions');
  const kind=document.getElementById('exclusion-kind'),value=document.getElementById('exclusion-value'),error=document.getElementById('exclusions-error'),status=document.getElementById('exclusions-status');
  let model=null,draft=[],project='',applying=false;
  const classLabel=b=>`${b.name} · ${b.file} (line ${b.start_line})`;
  const ruleLabel=r=>{
    if(r.kind==='symbol'){const b=model?.buildings.find(b=>b.id===r.value);if(b)return `Class / module: ${classLabel(b)}`;const split=r.value.indexOf('::');return `Class / module: ${split<0?r.value:r.value.slice(split+2).replace(/^(class|module):?/,'')+' · '+r.value.slice(0,split)}`;}
    return `${({folder:'Folder',file:'File',pattern:'Pattern'})[r.kind]}: ${r.value}`;
  };
  const render=()=>{
    const list=document.getElementById('exclusion-rules');list.replaceChildren();
    if(!draft.length){const li=document.createElement('li');li.textContent='No exclusions';list.append(li);}
    draft.forEach((r,i)=>{const li=document.createElement('li'),label=document.createElement('span'),remove=document.createElement('button');label.textContent=ruleLabel(r);label.dir='ltr';remove.type='button';remove.className='mini-btn';remove.textContent='Remove';remove.setAttribute('aria-label',`Remove ${ruleLabel(r)}`);remove.disabled=applying;remove.onclick=()=>{draft.splice(i,1);render();};li.append(label,remove);list.append(li);});
  };
  const suggestions=()=>{
    const query=value.value.toLowerCase(),host=document.getElementById('exclusion-suggestions');host.replaceChildren();
    const candidates=kind.value==='folder'?(model?.districts||[]).map(d=>[d.id,d.name]):kind.value==='file'?[...new Set((model?.buildings||[]).map(b=>b.file))].map(f=>[f,f]):kind.value==='symbol'?(model?.buildings||[]).map(b=>[b.id,classLabel(b)]):[];
    for(const [key,label] of candidates.filter(([key,label])=>key.toLowerCase().includes(query)||label.toLowerCase().includes(query)).slice(0,100)){const option=document.createElement('option');option.value=kind.value==='symbol'?label:key;option.label=label;host.append(option);}
    document.querySelector('label[for="exclusion-value"]').textContent=kind.value==='symbol'?'Select a class or module':'Select or type a project path';
    document.getElementById('exclusion-hint').textContent=kind.value==='pattern'?'Paths are relative to the project. * matches within a folder; ** matches nested folders. Example: **/tests/**':kind.value==='symbol'?'Choose a class or module. Other declarations in its file stay visible.':'Start typing to find a path, or choose a suggestion. Rules are saved for this project.';
  };
  const add=rule=>{let normalized=rule.value.trim().replaceAll('\\','/').replace(/^\.\//,'').replace(/\/+$/,'');if(!normalized)return;if(rule.kind==='symbol'){const b=model?.buildings.find(b=>b.id===normalized||classLabel(b)===normalized);if(!b)throw Error('Choose a class or module from the suggestions.');normalized=b.id;}if(draft.length>=200)throw Error('Use at most 200 exclusion rules.');if(!draft.some(r=>r.kind===rule.kind&&r.value===normalized))draft.push({kind:rule.kind,value:normalized});render();};
  const show=rule=>{
    if(isWorking()||!getSession()?.root)return;
    project=getSession().root;draft=(model?.meta.exclusions?.rules||[]).map(r=>({...r}));error.textContent='';status.textContent='';value.value='';kind.value=rule?.kind||'folder';
    document.getElementById('exclusions-root').textContent=project;
    if(rule)add(rule);else render();suggestions();dialog.showModal();value.focus();
    const d=model?.meta.dependencies;
    document.getElementById('scan-diagnostics-summary').textContent=d?`${d.references} references · ${d.resolved} resolved · ${d.unresolved} unresolved · ${d.ambiguous} ambiguous\nCompilation database: ${d.compilationDatabase||'none; include folders inferred'}\n${(model.meta.warnings||[]).join('\n')}`:'No scan diagnostics available.';
  };
  showWithRule=show;open.onclick=()=>show();
  kind.onchange=()=>{value.value='';suggestions();};value.oninput=suggestions;
  document.getElementById('exclusions-add-form').onsubmit=e=>{e.preventDefault();try{add({kind:kind.value,value:value.value});value.value='';error.textContent='';suggestions();}catch(err){error.textContent=err.message;}};
  const close=()=>{if(!applying)dialog.close();};
  document.getElementById('exclusions-close').onclick=document.getElementById('exclusions-cancel').onclick=close;
  dialog.addEventListener('cancel',e=>{if(applying)e.preventDefault();});
  document.getElementById('exclusions-apply').onclick=async()=>{
    if(isWorking())return;
    applying=true;setWorking(true);error.textContent='';status.textContent='Scanning with exclusions…';
    for(const button of dialog.querySelectorAll('button,input,select'))button.disabled=true;
    try{const data=await request('project/exclusions',{root:project,rules:draft});await onModel(data.model);dialog.close();}
    catch(err){error.textContent=err.message;}
    finally{applying=false;setWorking(false);status.textContent='';for(const button of dialog.querySelectorAll('button,input,select'))button.disabled=false;render();}
  };
  document.getElementById('scan-diagnostics-export').onclick=()=>{
    if(!model)return;const report={root:model.meta.root,totals:model.meta.totals,languages:model.meta.languages,analysis:model.meta.analysis,scan:model.meta.scan,exclusions:model.meta.exclusions,dependencies:model.meta.dependencies,warnings:model.meta.warnings};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='codecity-scan-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  window.addEventListener('codecitymodelchange',e=>{model=e.detail;open.disabled=!model.meta.root||!getSession();});
}
