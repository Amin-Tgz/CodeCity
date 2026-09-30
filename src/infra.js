import * as THREE from 'three';

// ---------------------------------------------------------------------------
// DevOps layer: the project's infrastructure shown below the city - a HUD band
// with CPU/RAM gauges + detected components, and a small 3D foundation podium
// (two bars) in front of the city.
// ---------------------------------------------------------------------------

const CAT_COLOR = {
  'ai/compute': '#a855f7',
  database: '#22c55e',
  web: '#38bdf8',
  frontend: '#f472b6',
  container: '#94a3b8',
  dependency: '#8a97b3',
};

function gauge(label, val, color) {
  const pct = Math.max(2, Math.min(100, val.pct));
  return `<div class="gauge">
    <div class="gauge-top"><span>${label}</span><span class="gauge-pct">${val.pct}%</span></div>
    <div class="gauge-bar"><i style="width:${pct}%;background:${color}"></i></div>
    <div class="gauge-est">${val.estimate}</div>
  </div>`;
}

export function renderInfraHUD(infra) {
  const el = document.getElementById('infra');
  if (!el) return null;
  if (!infra) { el.innerHTML = '<div class="infra-head">Infrastructure — no data (rebuild city.json)</div>'; return el; }
  const cat = {};
  for (const s of infra.services) (cat[s.category] = cat[s.category] || []).push(s.name);
  const chips = Object.entries(cat).map(([c, names]) => `
    <div class="infra-group">
      <span class="infra-cat" style="color:${CAT_COLOR[c] || '#8a97b3'}">${c}</span>
      <span class="infra-names">${names.slice(0, 9).join(', ')}${names.length > 9 ? ` +${names.length - 9}` : ''}</span>
    </div>`).join('');
  el.innerHTML = `
    <div class="infra-head"><b>Infrastructure</b>
      <span class="muted">· ${infra.services.length} components detected (total)</span></div>
    <div class="infra-gauges">
      ${gauge('CPU', infra.cpu, '#38bdf8')}
      ${gauge('RAM', infra.ram, '#f59e0b')}
    </div>
    <div class="infra-chips">${chips}</div>
    <div class="infra-note" id="infra-note">${infra.note || ''}</div>`;
  return el;
}

// live override (used by the optional metrics agent)
export function setInfraLive(cpuPct, ramPct, note) {
  const el = document.getElementById('infra');
  if (!el) return;
  const bars = el.querySelectorAll('.gauge');
  if (bars[0]) {
    bars[0].querySelector('.gauge-pct').textContent = `${cpuPct}%`;
    bars[0].querySelector('.gauge-bar i').style.width = `${Math.max(2, cpuPct)}%`;
    bars[0].querySelector('.gauge-est').textContent = 'live (local agent)';
  }
  if (bars[1]) {
    bars[1].querySelector('.gauge-pct').textContent = `${ramPct}%`;
    bars[1].querySelector('.gauge-bar i').style.width = `${Math.max(2, ramPct)}%`;
    bars[1].querySelector('.gauge-est').textContent = 'live (local agent)';
  }
  if (note) { const n = document.getElementById('infra-note'); if (n) n.textContent = note; }
}

function textSprite(text, color) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '700 40px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.font = font;
  const w = ctx.measureText(text).width + 28;
  c.width = Math.ceil(w);
  c.height = 60;
  const g = c.getContext('2d');
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(8,12,22,0.78)';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = color;
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set((c.width / c.height) * 3.2, 3.2, 1);
  return sprite;
}

export function buildFoundation(infra, side) {
  const group = new THREE.Group();
  if (!infra) return group;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(34, 1.2, 14),
    new THREE.MeshStandardMaterial({ color: '#0e1524', roughness: 1, metalness: 0 }),
  );
  slab.position.y = 0.6;
  slab.receiveShadow = true;
  group.add(slab);

  const bars = [
    ['CPU', infra.cpu.score || 0, '#38bdf8', -8],
    ['RAM', infra.ram.score || 0, '#f59e0b', 8],
  ];
  for (const [label, score, color, dx] of bars) {
    const h = Math.max(2, score * 26);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(7, h, 7),
      new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.45, roughness: 0.5 }),
    );
    bar.position.set(dx, 1.2 + h / 2, 0);
    bar.castShadow = true;
    group.add(bar);
    const s = textSprite(`${label} ${Math.round(score * 100)}%`, color);
    s.position.set(dx, 1.2 + h + 3, 0);
    group.add(s);
  }
  // sits directly in front of the city, on the ground
  group.position.set(0, 0, side + 22);
  return group;
}
