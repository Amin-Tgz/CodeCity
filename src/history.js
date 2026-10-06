import {request} from './projects.js';
import {validateModel} from './model.js';
import {diffAgainst} from './compare.js';
import {t,translate} from './i18n.js';
export function initTimeline(history,city,{status,onPlaying=()=>{},onModelChanged=()=>{}}={}) {
  const host=document.getElementById('timeline-host'),row=document.getElementById('timeline-row'),quick=document.getElementById('history-toggle');
  if(!host||!row)return;
  row.style.display='';quick.hidden=true;quick.onclick=null;host.replaceChildren();
  const frames=history?.frames||[];
  if(!frames.length) {
    const note=document.createElement('div');note.className='muted-note';
    note.textContent=t(status==='no-git'?'Install Git to play project history.':status==='unavailable'?'Git history could not be read.':'No Git commits for this folder.');host.append(note);onPlaying(false);return;
  }
  quick.hidden=false;
  const finalFiles=frames.at(-1).files,current=city.model;
  let sequence=0,disposed=false,snapshot=null,waiting=false;
  host.innerHTML='<button id="tl-play" class="mini-btn" title="play history">▶</button><input id="tl-range" aria-label="history snapshot" type="range" min="0"/><div id="tl-label" class="tl-label" role="status"></div>';
  const mode=document.createElement('select');mode.id='history-mode';mode.setAttribute('aria-label','History accuracy');mode.append(new Option('Approximate growth','approximate'),new Option('Commit structure','structural'));host.prepend(mode);
  const compare=document.createElement('button');compare.id='history-compare';compare.className='mini-btn';compare.textContent='Compare with current';compare.disabled=true;host.append(compare);
  const range=host.querySelector('#tl-range'),label=host.querySelector('#tl-label'),play=host.querySelector('#tl-play');
  range.max=String(frames.length);range.value=range.max;
  row.title='Approximate growth uses net file lines. Commit structure parses Git blobs without checking out or executing source; symbol renames appear as additions/removals.';
  const apply=i=>{
    const seq=++sequence;compare.disabled=true;snapshot=null;
    if(mode.value==='structural'&&i<frames.length) {
      waiting=true;label.textContent='Reading commit structure…';const f=frames[i];
      return request('history/snapshot',{hash:f.hash}).then(data=>{
        if(disposed||sequence!==seq)return;validateModel(data.model);snapshot=data.model;city.clearDiff();city.setStructuralModel(snapshot,current);onModelChanged(snapshot);compare.disabled=false;
        label.textContent=`${f.hash.slice(0,7)} · ${new Date(f.t*1000).toISOString().slice(0,10)} · ${snapshot.buildings.length} buildings · commit structure · scales fixed to current model`;
      }).catch(err=>{if(!disposed&&sequence===seq){label.textContent=err.message;stop();}}).finally(()=>{if(sequence===seq)waiting=false;});
    }
    waiting=false;
    if(city.model!==current){city.clearDiff();city.setStructuralModel(current,current);onModelChanged(current);}

    if(i===frames.length){city.setHistoryFrame(null,finalFiles);label.textContent=t('Current model · includes uncommitted files');return;}
    const f=frames[i];city.setHistoryFrame(f,finalFiles);
    label.textContent='Approximate · '+t('{hash} · {date} · {n} buildings · {lines} lines',{hash:f.hash.slice(0,7),date:new Date(f.t*1000).toISOString().slice(0,10),n:[...city.byBuilding.values()].filter(e=>e.group.visible).length,lines:f.total});
  };
  let timer=null;
  const buttons=()=>{const playing=timer!==null;play.textContent=playing?'⏸':'▶';quick.textContent=t(playing?'Pause construction':'Build history');quick.classList.toggle('active',playing);play.setAttribute('aria-pressed',String(playing));quick.setAttribute('aria-pressed',String(playing));};
  const stop=()=>{if(timer!==null)clearInterval(timer);timer=null;onPlaying(false);buttons();};
  range.oninput=()=>{stop();apply(Number(range.value));};
  mode.onchange=()=>{stop();apply(Number(range.value));};
  compare.onclick=()=>{
    if(!snapshot)return;const diff=diffAgainst(current,snapshot),currentIds=new Set(current.buildings.map(b=>b.id)),buildings=[...current.buildings.map(b=>({...b,comparison_status:!diff.base.has(b.id)?'added':diff.changedIds.includes(b.id)?'changed':null})),...snapshot.buildings.filter(b=>!currentIds.has(b.id)).map(b=>({...b,comparison_status:'removed'}))];
    const ds=new Map([...snapshot.districts,...current.districts].map(d=>[d.id,d]));
    const roads=[...current.roads],keys=new Set(roads.map(r=>r.a+'\0'+r.b+'\0'+r.kind));
    for(const r of snapshot.roads)if(!keys.has(r.a+'\0'+r.b+'\0'+r.kind))roads.push({...r,historical:true});
    const combined={meta:{...current.meta,comparisonCommit:snapshot.meta.commit,comparisonSources:snapshot.meta.snapshotSources,totals:{...current.meta.totals,buildings:buildings.length,districts:ds.size,roads:roads.length}},buildings,districts:[...ds.values()],roads};
    city.setStructuralModel(combined,current);city.applyDiff(diff.base);onModelChanged(combined);
    label.textContent=`Against ${snapshot.meta.commit.slice(0,7)}: ${diff.stats.added} added · ${diff.stats.changed} changed · ${diff.stats.removed} removed (green ghosts)`;
  };
  const toggle=()=>{
    if(timer!==null){stop();return;}
    if(Number(range.value)>=frames.length)range.value='0';
    apply(Number(range.value));onPlaying(true);
    timer=setInterval(()=>{if(waiting)return;const i=Math.min(frames.length,Number(range.value)+1);range.value=String(i);apply(i);if(i===frames.length)stop();},800);
    buttons();
  };
  play.onclick=quick.onclick=toggle;
  const language=()=>{buttons();apply(Number(range.value));translate(host);};
  window.addEventListener('languagechange',language);buttons();apply(frames.length);translate(host);
  return ()=>{disposed=true;sequence++;stop();quick.onclick=null;window.removeEventListener('languagechange',language);};
}
