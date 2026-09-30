import { makeRampCanvas, locColor, heatColor } from './metrics.js';

const $ = (id) => document.getElementById(id);

export function renderStats(model) {
  const t = model.meta.totals;
  $('stats').innerHTML = [
    `<span><b>${t.buildings}</b> buildings</span>`,
    `<span><b>${t.districts}</b> districts</span>`,
    `<span><b>${t.roads}</b> roads</span>`,
    `<span><b>${t.loc.toLocaleString()}</b> LOC</span>`,
  ].join('');
  $('source-badge').textContent = model.meta.source === 'codegraph'
    ? `indexed · ${t.nodes} nodes / ${t.edges} edges`
    : `source scan`;
  $('source-badge').title = model.meta.root;
}

export function renderLegend(colorKey) {
  const ramp = colorKey === 'loc' ? locColor : heatColor;
  const cv = makeRampCanvas(ramp);
  const host = $('ramp');
  host.innerHTML = '';
  cv.style.width = '100%';
  cv.style.height = '100%';
  host.appendChild(cv);
  const metricLabel = { loc: 'lines of code (LOC)', nom: 'methods (NOM)', noa: 'attributes (NOA)', deps: 'dependencies' };
  $('ramp-lo').textContent = 'low';
  $('ramp-hi').textContent = 'high';
  $('ramp-title').textContent = metricLabel[colorKey] || colorKey;
}

export function renderDetails(building) {
  const box = $('details');
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
  ];
  box.innerHTML = `
    <div class="details-head">
      <div>
        <div class="details-name">${escapeHtml(building.name)}</div>
        <div class="details-sub">${escapeHtml(building.district)}</div>
      </div>
      <button id="details-close" class="icon-btn" title="close">&times;</button>
    </div>
    <table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${escapeHtml(String(v))}</td></tr>`).join('')}</table>
    <div class="details-actions">
      <button id="details-open-file" class="mini-btn">copy path</button>
    </div>`;
  box.classList.add('open');
  $('details-close').onclick = () => renderDetails(null);
  $('details-open-file').onclick = (e) => {
    navigator.clipboard?.writeText(building.file);
    e.target.textContent = 'copied';
    setTimeout(() => { e.target.textContent = 'copy path'; }, 1200);
  };
}

export function buildDistrictList(model, onPick) {
  const sel = $('filter');
  const opts = ['<option value="">all districts</option>']
    .concat(model.districts.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${d.buildings})</option>`));
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
    <br><span class="muted">NOM ${building.methods + building.functions} · NOA ${building.attributes} · LOC ${building.loc}</span>`;
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
