import * as THREE from 'three';

// CodeCity canonical metric definitions (Wettel & Lanza, 2007).
export const METRICS = {
  nom: { label: 'methods (NOM)', short: 'NOM', get: (b) => b.nom },
  noa: { label: 'attributes (NOA)', short: 'NOA', get: (b) => b.noa },
  loc: { label: 'lines of code (LOC)', short: 'LOC', get: (b) => b.loc },
  deps: { label: 'dependencies', short: 'DEPS', get: (b) => b.deps || 1 },
};

export const METRIC_KEYS = Object.keys(METRICS);

// LOC ramp: slate -> teal -> gold -> crimson (reads well from low to high and
// keeps the low end from collapsing into one flat grey).
const RAMP = [
  new THREE.Color('#5b6b82'),
  new THREE.Color('#2f8f9d'),
  new THREE.Color('#e0b53a'),
  new THREE.Color('#d1462f'),
];

export function rampColor(t, stops = RAMP) {
  t = clamp01(t);
  const n = stops.length - 1;
  const x = t * n;
  const i = Math.min(Math.floor(x), n - 1);
  const f = x - i;
  return new THREE.Color().lerpColors(stops[i], stops[i + 1], f);
}

export function locColor(t) {
  return rampColor(t, RAMP);
}

const HEAT = [
  new THREE.Color('#2dd4bf'),
  new THREE.Color('#f59e0b'),
  new THREE.Color('#dc2626'),
];

export function heatColor(t) {
  return rampColor(t, HEAT);
}

export function districtHue(i, depth) {
  const hue = ((i * 0.618033988749895) + depth * 0.07) % 1;
  return new THREE.Color().setHSL(hue, 0.42, 0.30);
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function norm(value, min, max) {
  if (max <= min) return 0;
  return clamp01((value - min) / (max - min));
}

// Deterministic 0..1 hash from a string id, so the same building always gets
// the same roof/variance across rebuilds.
export function hash01(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 8) / 0xffffff;
}

// World height for a building from its height metric value.
// Compressed scale (pow < 1) so one 35-method class does not dwarf the city,
// while single-method buildings still stay visibly low.
export function heightFor(value, maxValue) {
  const v = Math.max(1, value || 1);
  const m = Math.max(1, maxValue || 1);
  const t = clamp01(v / m);
  return 1.6 + Math.pow(t, 0.6) * 46;
}

export function makeRampCanvas(ramp) {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 128;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < 128; y++) {
    const t = 1 - y / 127;
    const c = ramp(t);
    ctx.fillStyle = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
    ctx.fillRect(0, y, 16, 1);
  }
  return cv;
}
