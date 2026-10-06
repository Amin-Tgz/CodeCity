// Accessibility: a keyboard- and screen-reader-friendly list view of the city,
// plus [ / ] to step through buildings.
import {t} from './i18n.js';
import {registerAutoHidePanel} from './panels.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function initA11y(model, city, { onSelect } = {}) {
  const controller = new AbortController();
  const btn = document.getElementById('list-btn');
  const panel = document.getElementById('citylist');
  if (!btn || !panel) return;
  const buildings = model.buildings.slice().sort((a, b) => a.name.localeCompare(b.name));
  let built = false;

  const build = () => {
    panel.innerHTML = `
      <header class="list-head">
        <b id="list-title">Buildings</b>
        <input id="list-filter" type="search" placeholder="filter…" aria-label="filter buildings" />
        <button id="list-minimize" class="icon-btn" aria-label="Minimize" aria-expanded="true" aria-controls="list-items">−</button>
        <button id="list-close" class="icon-btn" aria-label="close list">&times;</button>
      </header>
      <ul id="list-items" role="list" class="list-items" aria-labelledby="list-title"></ul>`;
    const ul = panel.querySelector('#list-items');
    let limit = 400;
    let query = '';
    const render = (q) => {
      const qq = String(q || '').toLowerCase();
      const matches = buildings.filter((b) => !qq || b.name.toLowerCase().includes(qq) || b.file.toLowerCase().includes(qq));
      ul.innerHTML = matches
        .slice(0, limit)
        .map((b) => `<li role="listitem"><button class="list-row" data-id="${escapeHtml(b.id)}"
            aria-label="${escapeHtml(b.name)} — ${b.loc} lines, NOM ${b.methods}, NOA ${b.attributes}, ${escapeHtml(b.district)}">
            <span class="lr-name">${escapeHtml(b.name)}</span>
            <span class="lr-meta">${b.loc} LOC · ${escapeHtml(b.district)}</span>
          </button></li>`).join('');
      if (matches.length > limit) {
        const li = document.createElement('li');
        const more = document.createElement('button');
        more.className = 'list-row';
        more.textContent = t('Show more ({n} remaining)',{n:matches.length-limit});
        more.onclick = () => { limit += 400; render(query); };
        li.appendChild(more); ul.appendChild(li);
      }
      ul.querySelectorAll('.list-row[data-id]').forEach((row) => {
        row.onclick = () => {
          const b = buildings.find((x) => x.id === row.dataset.id);
          if (b) onSelect(b);
        };
      });
    };
    render('');
    panel.querySelector('#list-filter').oninput = (e) => { limit = 400; query = e.target.value; render(query); };
    panel.querySelector('#list-close').onclick = () => close();
    panel.querySelector('#list-minimize').onclick = e => {
      ul.hidden = !ul.hidden;
      e.currentTarget.textContent = ul.hidden ? '+' : '−';
      e.currentTarget.setAttribute('aria-expanded',String(!ul.hidden));
    };
    built = true;
  };

  const open = () => {
    if (!built) build();
    panel.classList.add('open');
    registerAutoHidePanel(panel);
    btn.setAttribute('aria-expanded', 'true');
    const f = panel.querySelector('#list-filter');
    if (f) f.focus();
  };
  const close = () => {
    panel.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  };

  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'citylist');
  btn.onclick = () => (panel.classList.contains('open') ? close() : open());

  // keyboard: step through buildings in name order
  let idx = -1;
  window.addEventListener('keydown', (e) => {
    if (document.getElementById('help')?.classList.contains('open')) return;
    if (e.key === 'Escape' && panel.classList.contains('open')) { close(); return; }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.key !== '[' && e.key !== ']') return;
    e.preventDefault();
    idx = e.key === ']' ? Math.min(buildings.length - 1, idx + 1) : Math.max(0, idx - 1);
    if (buildings[idx]) onSelect(buildings[idx]);
  }, {signal: controller.signal});
  return () => controller.abort();
}
