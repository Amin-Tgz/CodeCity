import {t} from './i18n.js';
const listeners = new Map();
const panels = new Map();
const folds = new Map();
let autoHide = false;
let selectionActive = false;
export function setSelectionPanelState(active) {
  selectionActive=active;
  folds.get('controls')?.();
}
export function registerAutoHidePanel(panel) {
  if(!panel)return;
  if(panels.has(panel)) {panels.get(panel).show();panels.get(panel).schedule();return;}
  let timer=null,hovered=false;
  const expanded=v=>{
    const button=panel.querySelector('.panel-fold,#details-minimize,#list-minimize');
    const body=panel.querySelector('.panel-body,#details-body,.list-items');
    if(button&&body)button.setAttribute('aria-expanded',String(v&&!body.hidden));
  };
  const show=()=>{clearTimeout(timer);panel.classList.remove('auto-hidden');expanded(true);};
  const schedule=()=>{
    clearTimeout(timer);
    if(!autoHide||hovered||panel.contains(document.activeElement))return;
    timer=setTimeout(()=>{if(autoHide&&!hovered&&!panel.contains(document.activeElement)){panel.classList.add('auto-hidden');expanded(false);}},1500);
  };
  panel.addEventListener('pointerenter',()=>{hovered=true;show();});
  panel.addEventListener('pointerleave',()=>{hovered=false;schedule();});
  panel.addEventListener('focusin',show);
  panel.addEventListener('focusout',()=>queueMicrotask(schedule));
  panels.set(panel,{show,schedule});schedule();
}
export function initAutoHide() {
  try {autoHide=localStorage.getItem('codecity.autoHide')==='1';}catch{}
  const button=document.getElementById('auto-hide-panels');
  const apply=()=>{
    button.setAttribute('aria-pressed',String(autoHide));button.classList.toggle('active',autoHide);
    for(const state of panels.values()) {state.show();state.schedule();}
  };
  button.onclick=()=>{autoHide=!autoHide;try{localStorage.setItem('codecity.autoHide',autoHide?'1':'0');}catch{}apply();};
  for(const id of ['controls','legend','hint','details','citylist'])registerAutoHidePanel(document.getElementById(id));
  apply();
}
export function initPanels() {
  for(const [id,label] of [['controls','Explore'],['legend','Legend'],['hint','Navigation']]) {
    const panel=document.getElementById(id);if(!panel||panel.querySelector(':scope > .panel-fold'))continue;
    const body=document.createElement('div');body.className='panel-body';
    while(panel.firstChild)body.append(panel.firstChild);
    const btn=document.createElement('button');btn.type='button';btn.className='panel-fold';
    btn.setAttribute('aria-controls',id+'-body');body.id=id+'-body';
    const text=document.createElement('span');text.textContent=t(label);btn.append(text);
    const arrow=document.createElement('span');arrow.textContent='−';btn.append(arrow);
    let folded=false;try{folded=localStorage.getItem('codecity.panel.'+id)==='1';}catch{}
    const apply=()=>{const collapsed=folded||(id==='controls'&&selectionActive);panel.classList.toggle('folded',collapsed);body.hidden=collapsed;btn.setAttribute('aria-expanded',String(!collapsed));arrow.textContent=collapsed?'+':'−';panel.scrollTop=0;};
    folds.set(id,apply);
    btn.onclick=()=>{
      if(id==='controls'&&selectionActive){window.dispatchEvent(new Event('exploreopen'));folded=false;}
      else folded=!folded;
      panels.get(panel)?.show();apply();try{localStorage.setItem('codecity.panel.'+id,folded?'1':'0');}catch{}
    };
    if (listeners.has(id)) window.removeEventListener('languagechange',listeners.get(id));
    const listener=()=>{text.textContent=t(label);};
    listeners.set(id,listener);window.addEventListener('languagechange',listener);
    panel.append(btn,body);apply();
    registerAutoHidePanel(panel);
  }
}
