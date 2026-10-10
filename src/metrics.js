import * as THREE from 'three';

// CodeCity canonical metric definitions (Wettel & Lanza, 2007).
export const METRICS = {
  nom: { label: 'methods (NOM)', short: 'NOM', get: (b) => b.nom },
  noa: { label: 'attributes (NOA)', short: 'NOA', get: (b) => b.noa },
  loc: { label: 'lines of code (LOC)', short: 'LOC', get: (b) => b.loc },
  deps: { label: 'dependencies', short: 'DEPS', get: (b) => b.deps || 0 },
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

// semantic colour: language (stable hue per language name)
export function languageColor(lang) {
  let h = 0;
  const s = String(lang || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return new THREE.Color().setHSL(h / 360, 0.5, 0.56);
}

export function districtHue(i, depth = 0) {
  const hue = ((i * 0.618033988749895) + depth * 0.07) % 1;
  // nesting depth (paper: package level) also drives saturation + lightness
  const sat = clamp01(0.30 + depth * 0.08);
  const light = clamp01(0.22 + depth * 0.05);
  return new THREE.Color().setHSL(hue, sat, light);
}

// ---------------------------------------------------------------------------
// Categorical mapping (Wettel & Lanza): buildings take one of 5 discrete sizes
// so the city stays readable instead of one giant building dwarfing the rest.
// ---------------------------------------------------------------------------

// The two variants from the paper.
export const MAPPING_MODES = ['boxplot', 'threshold', 'linear'];

const CAT_HEIGHTS = [6, 13, 22, 34, 48];   // very small .. very tall
const CAT_FOOT = [1, 2, 4, 7, 12];         // treemap weights, very small .. very tall

export function categoryHeights() { return CAT_HEIGHTS; }
export function categoryFootprints() { return CAT_FOOT; }

// Boxplot statistics (Q1/median/Q3 + Tukey whiskers) over a metric's values.
export function boxplot(values) {
  const v = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!v.length) return { q1: 0, med: 0, q3: 0, lower: 0, upper: 0, min: 0, max: 0 };
  const q = (p) => {
    const i = (v.length - 1) * p;
    const lo = Math.floor(i); const hi = Math.ceil(i);
    return v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  const q1 = q(0.25); const med = q(0.5); const q3 = q(0.75);
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  let lower = v[0];
  for (const x of v) { if (x >= loFence) { lower = x; break; } }
  let upper = v[v.length - 1];
  for (let i = v.length - 1; i >= 0; i--) { if (v[i] <= hiFence) { upper = v[i]; break; } }
  return { q1, med, q3, lower, upper, min: v[0], max: v[v.length - 1] };
}

export function boxplotCategory(x, s) {
  if (x < s.lower) return 0;
  if (x < s.q1) return 1;
  if (x < s.q3) return 2;
  if (x <= s.upper) return 3;
  return 4;
}

// Empirically-set thresholds (approximate, from Lanza & Marinescu) for the
// threshold-based variant.
const BOUNDS = {
  nom: [5, 10, 20, 40],
  noa: [5, 10, 20, 40],
  loc: [100, 300, 700, 1500],
  deps: [5, 15, 40, 100],
};

export function thresholdCategory(x, key) {
  const b = BOUNDS[key] || BOUNDS.nom;
  let c = 0;
  for (const t of b) { if (x >= t) c++; }
  return Math.min(c, 4);
}

// category (0..4) for a building's metric under the chosen mapping mode
export function categoryFor(value, stats, mode, key) {
  return mode === 'boxplot' ? boxplotCategory(value, stats) : thresholdCategory(value, key);
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
  cv.width = 128;
  cv.height = 16;
  const ctx = cv.getContext('2d');
  for (let x = 0; x < 128; x++) {
    const t = x / 127;
    const c = ramp(t);
    ctx.fillStyle = `#${c.getHexString()}`;
    ctx.fillRect(x, 0, 1, 16);
  }
  return cv;
}
