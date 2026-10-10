import { makeRampCanvas, locColor, heatColor, languageColor } from './metrics.js';
import {t} from './i18n.js';
import {revealFile,canReveal} from './projects.js';
import {attachInspector} from './inspection-ui.js';
import {registerAutoHidePanel} from './panels.js';
import {getMode, setMode} from './mode.js';

const $ = (id) => document.getElementById(id);

export function renderStats(model) {
  const totals = model.meta.totals;
  $('stats').innerHTML = [
    `<span>${escapeHtml(t('{n} buildings', {n:totals.buildings}))}</span>`,
    `<span>${escapeHtml(t('{n} districts', {n:totals.districts}))}</span>`,
    `<span id="roads-stat" data-advanced ${getMode()==='simple'?'hidden':''}>${escapeHtml(t('{n} roads', {n:totals.roads}))}</span>`,
    `<span data-advanced ${getMode()==='simple'?'hidden':''}><b>${totals.loc.toLocaleString()}</b> LOC</span>`,
  ].join('');
  $('source-badge').textContent = model.meta.source === 'codegraph'
    ? t('indexed · {n} nodes / {e} edges', {n:totals.nodes,e:totals.edges})
    : model.meta.analysis ? 'source scan · AST + estimates' : t('source scan · estimated');
  $('source-badge').title = model.meta.root;
  if (model.meta.warnings?.length) $('source-badge').title += '\n' + model.meta.warnings.join('\n');
}

export function renderRoadStats(city) {
  const el = $('roads-stat');
  if(!el||!city.street)return;
  const count=city.street.paths.reduce((n,p)=>n+(p.shared?p.edges.length:1),0);
  el.textContent=t('{shown}/{total} connections represented',{shown:count,total:city.model.roads.length});
  el.title=t('Shared routes combine dependencies. Width and pedestrian density indicate total weight. Arrows show direction; pedestrians represent code links, not users.');
}

export function renderConnectionDetails(path,{city,onSelect,onClose}) {
  const box=$('details');box.replaceChildren();box.classList.add('open');
  const head=document.createElement('div');head.className='details-head';
  const title=document.createElement('div');title.className='details-name';title.dir='ltr';title.textContent=`${path.from} → ${path.to}`;
  const close=document.createElement('button');close.id='details-close';close.className='icon-btn';close.textContent='×';close.title=t('close');close.setAttribute('aria-label',t('close'));close.onclick=onClose;head.append(title,close);box.append(head);
  const body=document.createElement('div');body.id='details-body';box.append(body);
  const note=document.createElement('p');note.className='muted-note';note.textContent=t('{n} connections · weight {weight}',{n:path.edges.length,weight:path.weight});body.append(note);
  let shown=0;
  const more=document.createElement('button');more.className='mini-btn';
  const append=()=>{
    more.remove();
    for(const edge of path.edges.slice(shown,shown+300)){
      const row=document.createElement('div');row.className='connection-row';row.dir='ltr';
      for(const [index,id] of [edge.a,edge.b].entries()){const button=document.createElement('button');button.className='member-row';button.textContent=city.byBuilding.get(id).building.name;button.title=t('Select this building and inspect its details.');button.onclick=()=>onSelect(city.byBuilding.get(id).building);row.append(button);if(index===0){const arrow=document.createElement('span');arrow.textContent='→';row.append(arrow);}}
      const weight=document.createElement('span');weight.className='connection-weight';weight.textContent=`${t(edge.kind||'dependency')} × ${edge.weight}`;row.append(weight);body.append(row);
    }
    shown=Math.min(shown+300,path.edges.length);
    if(shown<path.edges.length){more.textContent=t('Show more ({n} remaining)',{n:path.edges.length-shown});more.title=more.textContent;body.append(more);}
  };
  more.onclick=append;append();
  registerAutoHidePanel(box);
}

export function renderLegend(colorKey, model, mapping) {
  if (mapping) {
    const labels = { nom: 'methods (NOM)', noa: 'attributes (NOA)', loc: 'lines of code (LOC)', deps: 'dependencies', language: 'language' };
    document.querySelector('.legend-notes').innerHTML = ['height', 'footprint', 'colour'].map((key) =>
      `<div><b>${escapeHtml(t(key))}</b> = ${escapeHtml(t(labels[mapping[key === 'colour' ? 'color' : key]]))}</div>`).join('')
      + `<div><b>${escapeHtml(t('district'))}</b> = ${escapeHtml(t('folder / package'))}</div>`;
  }
  const host = $('ramp');
  if (colorKey === 'language') {
    const langs = Object.keys((model && model.meta && model.meta.languages) || {});
    host.innerHTML = '<div class="legend-swatches">' + langs.map((l) =>
      `<span class="swatch"><i style="background:#${languageColor(l).getHexString()}"></i>${escapeHtml(l)}</span>`).join('') + '</div>';
    host.style.height = 'auto';
    $('ramp-lo').textContent = '';
    $('ramp-hi').textContent = '';
    $('ramp-title').textContent = t('language');
    return;
  }
  host.style.height = '';
  const ramp = colorKey === 'loc' ? locColor : heatColor;
  const cv = makeRampCanvas(ramp);
  host.innerHTML = '';
  cv.style.width = '100%';
  cv.style.height = '100%';
  host.appendChild(cv);
  const metricLabel = {
    loc: 'lines of code (LOC)', nom: 'methods (NOM)', noa: 'attributes (NOA)',
    deps: 'dependencies',
  };
  $('ramp-lo').textContent = t('low');
  $('ramp-hi').textContent = t('high');
  $('ramp-title').textContent = t(metricLabel[colorKey] || colorKey);
}

export function renderDetails(building, { onMember, onClose, city, onSelect } = {}) {
  const box = $('details');
  const minimized = box.querySelector('#details-body')?.hidden || false;
  if (!building) {
    box.classList.remove('open');
    return;
  }
  const rows = [
    ['kind', building.kind],
    ['language', building.language],
    ['file', building.file],
    ['line', building.start_line],
    ['LOC', building.loc.toLocaleString()],
    ['methods (NOM)', building.methods],
    ['attributes (NOA)', building.attributes],
    ['top-level funcs', building.functions],
    ['dependencies', building.deps || 0],
    ['complexity',building.complexity??'unknown'],
    ['source type',building.generated?'generated':'authored / unclassified'],
  ];
  const members = building.members || [];
  const membersHtml = members.length ? `
    <div class="details-section">${escapeHtml(t('members ({n}) · click to highlight',{n:members.length}))}</div>
    <div class="member-list">${members.map((m, i) => `
      <button class="member-row" data-mi="${i}" title="${escapeHtml(t('line'))} ${m.line}">
        <span class="member-name">${escapeHtml(m.name)}</span>
        <span class="member-meta">${escapeHtml(t(m.kind))} · ${m.loc} LOC</span>
      </button>`).join('')}</div>` : '';
  box.innerHTML = `
    <div class="details-head">
      <div>
        <div class="details-name">${escapeHtml(building.name)}</div>
        <div class="details-sub">${escapeHtml(building.district)}</div>
      </div>
      <button id="details-minimize" class="icon-btn" title="Minimize" aria-label="Minimize" aria-expanded="true">−</button>
      <button id="details-close" class="icon-btn" title="close" aria-label="close">&times;</button>
    </div>
    <div id="details-body">
    <table>${rows.map(([k, v]) => `<tr ${['kind','line','top-level funcs','complexity','source type'].includes(k)?'data-advanced':''}><td>${escapeHtml(t(k))}</td><td ${k === 'file' ? 'dir="ltr"' : ''}>${['LOC','methods (NOM)','attributes (NOA)','dependencies','complexity'].includes(k)?`<button class="metric-explain mini-btn" data-metric="${({'LOC':'loc','methods (NOM)':'nom','attributes (NOA)':'noa','dependencies':'deps','complexity':'complexity'})[k]}" title="Explain this metric">${escapeHtml(String(v))}</button>`:escapeHtml(k==='kind'?t(String(v)):String(v))}</td></tr>`).join('')}</table>
    <div data-advanced>${membersHtml}</div>
    <div class="details-actions">
      <button id="details-open-file" class="mini-btn">copy path</button>
      <button id="details-reveal" class="mini-btn" ${canReveal()?'':'disabled title="File manager requires the native launcher."'}>Open in file manager</button>
    </div>
    <div id="details-status" class="muted-note" role="status"></div></div>`;
  box.classList.add('open');
  registerAutoHidePanel(box);
  $('details-body').hidden = minimized;
  $('details-minimize').textContent = minimized ? '+' : '−';
  $('details-minimize').setAttribute('aria-expanded',String(!minimized));
  $('details-minimize').onclick = e => {
    const hidden = !$('details-body').hidden;
    $('details-body').hidden = hidden;
    e.currentTarget.textContent = hidden ? '+' : '−';
    e.currentTarget.setAttribute('aria-expanded',String(!hidden));
  };
  $('details-close').onclick = () => { renderDetails(null); onClose?.(); };
  $('details-open-file').onclick = async (e) => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      const root = window.__codecity?.model.meta.root || '';
      const separator = root.includes('\\') ? '\\' : '/';
      await navigator.clipboard.writeText(root ? root.replace(/[\\/]$/,'') + separator + building.file.replaceAll('/',separator) : building.file);
      e.target.textContent = t('copied');
    } catch { e.target.textContent = t('copy unavailable'); }
    setTimeout(() => { e.target.textContent = t('copy path'); }, 1200);
  };
  $('details-reveal').onclick = async e => {
    const btn=e.currentTarget,status=$('details-status');btn.disabled=true;status.textContent=t('Opening…');
    try {await revealFile(building.file);status.textContent=t('Opened in file manager.');}
    catch(err){status.textContent=err.message;}
    finally{btn.disabled=false;}
  };
  if(city) attachInspector($('details-body'),building,{city,onSelect});
  setMode(getMode(), {persist:false});
  box.querySelectorAll('.metric-explain').forEach(button=>button.onclick=()=>{setMode('advanced');const evidence=box.querySelector('.metric-evidence');if(evidence){evidence.open=true;(evidence.querySelector(`[data-metric="${button.dataset.metric}"]`)||evidence).scrollIntoView({block:'nearest'});}});
  box.querySelectorAll('.member-list .member-row').forEach((row) => {
    row.onclick = () => {
      box.querySelectorAll('.member-row.active').forEach((r) => r.classList.remove('active'));
      row.classList.add('active');
      if (onMember) onMember(building, members[+row.dataset.mi]);
    };
  });
}

export function buildDistrictList(model, onPick) {
  const sel = $('filter');
  const opts = ['<option value="">all districts</option>']
    .concat(model.districts.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${d.subtree_buildings??d.buildings})</option>`));
  sel.innerHTML = opts.join('');
  sel.onchange = () => onPick(sel.value);
}

export function showTooltip(building, x, y) {
  const tip = $('tooltip');
  if (!building) {
    tip.style.display = 'none';
    return;
  }
  tip.innerHTML = `<b>${escapeHtml(building.name)}</b><br><span>${escapeHtml(building.file)}</span>
    <br><span class="muted">NOM ${building.nom} · NOA ${building.noa} · LOC ${building.loc}</span>`;
  tip.style.display = 'block';
  const pad = 14;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  tip.style.left = Math.min(x + pad, window.innerWidth - w - 8) + 'px';
  tip.style.top = Math.min(y + pad, window.innerHeight - h - 8) + 'px';
}

export function setLoading(text) {
  const el = $('loading');
  const label = $('loading-text');
  if (label) label.textContent = text || '';
  if (text) {
    el.style.display = 'flex';
  } else {
    el.style.display = 'none';
  }
}

export function setError(text) {
  setLoading(text);
  document.querySelector('#loading .spinner').style.display = 'none';
  $('loading').setAttribute('role', 'alert');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
