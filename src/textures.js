import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Procedural textures (no external assets, keeps the viewer offline).
// ---------------------------------------------------------------------------

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, { repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

let facadeCache = null;

/**
 * A building facade: light wall with a grid of windows, plus a matching
 * emissive map (a subset of windows) used for hover/selection highlighting.
 */
export function facadeTextures() {
  if (facadeCache) return facadeCache;

  const COLS = 6;
  const ROWS = 10;
  const W = COLS * 32;
  const H = ROWS * 32;

  const wall = canvas(W, H);
  const wc = wall.getContext('2d');
  const glow = canvas(W, H);
  const gc = glow.getContext('2d');

  // wall base + subtle vertical shading
  wc.fillStyle = '#f4f6fb';
  wc.fillRect(0, 0, W, H);
  const grad = wc.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(150,165,195,0.28)');
  wc.fillStyle = grad;
  wc.fillRect(0, 0, W, H);

  gc.fillStyle = '#000000';
  gc.fillRect(0, 0, W, H);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * 32 + 7;
      const y = r * 32 + 8;
      const w = 18;
      const h = 16;
      // window frame
      wc.fillStyle = '#9aa7bf';
      roundRect(wc, x - 1, y - 1, w + 2, h + 2, 2);
      wc.fill();
      // glass
      wc.fillStyle = r % 2 ? '#c3cede' : '#b6c3d7';
      wc.fillRect(x, y, w, h);
      // reflection
      wc.fillStyle = 'rgba(255,255,255,0.35)';
      wc.fillRect(x, y, w, h * 0.4);

      // a small share of windows belong to the highlight emissive map
      if (Math.random() < 0.18) {
        const warm = Math.random() < 0.8 ? '#ffd79a' : '#fff2cf';
        gc.fillStyle = warm;
        roundRect(gc, x, y, w, h, 1.5);
        gc.fill();
      }
    }
  }

  facadeCache = { map: tex(wall), emissiveMap: tex(glow) };
  return facadeCache;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Roads / streets (markings run along the ribbon length = texture u axis, so
// lane lines are horizontal in the canvas and follow the street).
// ---------------------------------------------------------------------------

function asphalt(ctx, w, h, base) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h * 0.02; i++) {
    const v = 16 + Math.random() * 26;
    ctx.fillStyle = `rgba(${v},${v},${v + 6},0.45)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
  }
}

function hLine(ctx, w, y, th, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, y - th / 2, w, th);
}

function hDash(ctx, w, y, th, color, dash = 34, gap = 26) {
  ctx.fillStyle = color;
  for (let x = 0; x < w; x += dash + gap) ctx.fillRect(x, y - th / 2, dash, th);
}

/** Big road: dark asphalt with yellow lane lines (2 or 4 lanes). */
export function roadTexture(lanes = 2) {
  const W = 128; // along the length
  const H = 80;  // across the width
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  asphalt(ctx, W, H, '#181a1f');
  const Y = '#e7b12f';
  if (lanes >= 4) {
    hLine(ctx, W, H * 0.5 - 3, 3, Y);
    hLine(ctx, W, H * 0.5 + 3, 3, Y);
    hDash(ctx, W, H * 0.24, 2.5, Y);
    hDash(ctx, W, H * 0.76, 2.5, Y);
  } else {
    hLine(ctx, W, H * 0.5, 3, Y);
  }
  return tex(c);
}

/** Narrow street / alley: near-black with a white dashed centre line. */
export function streetTexture() {
  const W = 128;
  const H = 56;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  asphalt(ctx, W, H, '#0c0d11');
  hDash(ctx, W, H * 0.5, 3, '#d9dde6', 22, 20);
  return tex(c);
}

// ---------------------------------------------------------------------------
// Sky dome gradient
// ---------------------------------------------------------------------------

export function skyTexture(top, bottom) {
  const c = canvas(2, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.55, bottom);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const t = tex(c, { repeat: false });
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

export function groundTexture() {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#161c2e';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const v = 20 + Math.random() * 26;
    ctx.fillStyle = `rgba(${v + 10},${v + 16},${v + 30},0.5)`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  const t = tex(c);
  t.repeat.set(28, 28);
  return t;
}

export function grassTexture() {
  const S=256,c=canvas(S,S),ctx=c.getContext('2d');
  ctx.fillStyle='#93ad70';ctx.fillRect(0,0,S,S);
  let seed=19;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<7000;i++) {
    const light=random()>.45;
    ctx.strokeStyle=light?'rgba(196,211,143,.25)':'rgba(65,102,49,.18)';
    const x=random()*S,y=random()*S;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+random()*2-1,y-2-random()*3);ctx.stroke();
  }
  const map=tex(c);map.repeat.set(110,110);return map;
}

/** Scale a box geometry's UVs so windows tile at a sensible density. */
export function applyWindowUV(geometry, w, h) {
  const uv = geometry.attributes.uv;
  const cols = Math.max(1, Math.round(w / 1.9));
  const rows = Math.max(1, Math.round(h / 1.9));
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * cols, uv.getY(i) * rows);
  }
  uv.needsUpdate = true;
  return geometry;
}
