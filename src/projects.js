import {t, translate} from './i18n.js';
import {initExclusions} from './exclusions.js';
let session=null;
export async function request(action, body, method='POST') {
  if(!session) throw Error(t('Start CodeCity with npm to use project controls.'));
  const res=await fetch(`/api/${action}`,{method,headers:{'X-CodeCity-Token':session.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json();
  if(!res.ok) throw Error(t(data.error||'Could not open project.'));
  return data;
}
export async function initProjects(onModel) {
  try {const res=await fetch('/api/session');if(res.ok) session=await res.json();}catch{}
  const menu=document.getElementById('project-menu'),button=document.getElementById('project-menu-btn');
  const status=document.getElementById('project-status'),dialog=document.getElementById('folder-dialog');
  const input=document.getElementById('folder-path'),error=document.getElementById('folder-error');
  const setMenu=v=>{menu.hidden=!v;button.setAttribute('aria-expanded',String(v));};
  button.onclick=()=>setMenu(menu.hidden);
  document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&e.target!==button) setMenu(false);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setMenu(false);});
  let working=false;
  let browseSequence=0;
  initExclusions(onModel,()=>session,()=>working,v=>{working=v;});
  const open=async path=>{
    if(working)return;working=true;browseSequence++;
    const submit=document.getElementById('folder-submit');submit.disabled=true;status.textContent=t('Scanning project…');error.textContent='';
    const progress=document.getElementById('folder-progress');progress.textContent=t('Scanning project…');
    try {const exclusions=document.getElementById('folder-exclusions').value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean).map(value=>({kind:'pattern',value}));const data=await request('project/open',{path,exclusions});session.root=data.model.meta.root;await onModel(data.model);session.recent=data.recent;renderRecent();dialog.close();setMenu(false);status.textContent='';document.getElementById('folder-exclusions').value='';}
    catch(e){error.textContent=e.message;status.textContent=e.message;}
    finally{working=false;submit.disabled=false;progress.textContent='';}
  };
  const renderRecent=()=>{
    const host=document.getElementById('project-recent');host.replaceChildren();
    for(const path of session?.recent||[]) {
      const b=document.createElement('button');b.className='recent-project';b.textContent=path;b.dir='ltr';b.title=path;b.onclick=()=>open(path);host.append(b);
    }
    if(!host.childElementCount)host.textContent=t('No recent projects');
  };
  const browse=async path=>{
    const sequence=++browseSequence,previousInput=input.value;
    error.textContent='';
    try {
      const data=await request('folders?path='+encodeURIComponent(path||''),null,'GET');
      if(sequence!==browseSequence||input.value!==previousInput)return;
      input.value=data.path;
      const host=document.getElementById('folder-list');host.replaceChildren();
      for(const folder of data.folders) {const b=document.createElement('button');b.type='button';b.className='folder-row';b.textContent='▸ '+folder.name;b.dir='auto';b.onclick=()=>browse(folder.path);host.append(b);}
      document.getElementById('folder-parent').onclick=()=>browse(data.parent);
      const roots=document.getElementById('folder-roots');roots.replaceChildren();
      for(const root of data.roots){const b=document.createElement('button');b.type='button';b.className='mini-btn';b.textContent=root;b.onclick=()=>browse(root);roots.append(b);}
    }catch(e){error.textContent=e.message;}
  };
  const showOpen=()=>{
    if(!session){setMenu(true);status.textContent=t('Start CodeCity with npm to use project controls.');return;}
    setMenu(false);error.textContent='';dialog.showModal();browse(session.root||'');
  };
  document.getElementById('project-open').onclick=document.getElementById('empty-open').onclick=showOpen;
  document.getElementById('folder-cancel').onclick=()=>dialog.close();
  document.getElementById('folder-browse').onclick=()=>browse(input.value);
  document.getElementById('folder-form').onsubmit=e=>{e.preventDefault();open(input.value);};
  document.getElementById('project-close').onclick=async()=>{
    if(working)return;
    try{const data=await request('project/close',{});await onModel(data.model);session.root='';setMenu(false);}catch(e){status.textContent=e.message;}
  };
  window.addEventListener('languagechange',renderRecent);
  renderRecent();translate();
  return session;
}
export async function revealFile(file) {return request('reveal',{file});}
export function canReveal() {return !!session?.canReveal;}
