// Fire drawings (owner: fire; docs/AMBIENT.md). Every flame, core, coal bed, smoke puff and ember of the fire system
// is a hand-animation-style PIXEL DRAWING generated once, deterministically, into ONE palette-index atlas (R8): the
// shader maps index -> palette colour, so the whole system keeps to ~17 colours and a day/night smoke swap is a uniform
// change. Drawings are authored in TEXELS at the scene's texel size (360 / viewHeight texels per metre), so a 0.75 m
// campfire flame is 27 texels tall at vh 10 and stays that size in metres at another zoom.
//
// Flame drawing = a union of stepped "tongues" (teardrops whose centre line sways with the frame phase), banded by
// heat (outer red rim on the upper half, orange body, yellow heart), plus a detached "lick" that pinches off the tip
// on 2 of the 6 frames (the classic hand-drawn fire beat). Sizes s = 0.3 .. 1.5 (relight / extinguish / normal /
// flare) x lean -1 / 0 / +1 (a passing walker drags the flame along) x 6 frames (7.5 fps loop = 0.8 s).
import { hash, TAU, clamp } from '../core.js';

// ---- palette indices (0 = empty). EMISSIVE: 1-5 flame, 12-14 embers, 15-17 coals. SOLID (non-emissive): 6-11 smoke.
export const PI = {
  CORE: 1, YELLOW: 2, ORANGE: 3, RED: 4, DEEP: 5,
  SMOKE_HI: 6, SMOKE_MID: 7, SMOKE_SH: 8, WARM_HI: 9, WARM_MID: 10, WARM_SH: 11,
  EMBER_HI: 12, EMBER_MID: 13, EMBER_LO: 14, COAL_HOT: 15, COAL_RED: 16, COAL_DARK: 17,
  GLOW_HI: 18, GLOW_LO: 19, GLOW_HALO: 20,  // ADDITIVE night glow (light thrown by a fire that owns no PointLight)
};
export const PAL_SIZE = 21;
export const isSolid = (i) => i >= 6 && i <= 11;
export const isGlow = (i) => i >= 18;
// sRGB hex. Fire ramp traces to the town night palette (fire #FF9A4A, lamp glow #FFC46B, the stage lantern light
// #FF8A3A); smoke traces to the stone ramp by day (#BBAC97 / #8C7E72 / #5B5A64 cooled) and the night stone ramp
// (#8C8FA6 / #5F6079 / #383A52) by night; the warm smoke is the night smoke lit from below by the flame.
export const PALETTE = {
  day: {
    1: '#FFF1C8', 2: '#FFC46B', 3: '#FF8A3A', 4: '#D2483A', 5: '#8E2E3E',
    6: '#CBC4C2', 7: '#A49EA6', 8: '#7D7A8A', 9: '#D6C2B0', 10: '#B29C98', 11: '#867C88',
    12: '#FFE59A', 13: '#FF9A4A', 14: '#C8463A', 15: '#FFB25E', 16: '#D0503C', 17: '#7A2E3A',
    18: '#000000', 19: '#000000', 20: '#000000',
  },
  night: {
    1: '#FFF1C8', 2: '#FFC46B', 3: '#FF8A3A', 4: '#D2483A', 5: '#8E2E3E',
    6: '#6A6C86', 7: '#4E5068', 8: '#383A52', 9: '#A8705C', 10: '#7C5254', 11: '#55404E',
    12: '#FFE59A', 13: '#FF9A4A', 14: '#C8463A', 15: '#FFB25E', 16: '#D0503C', 17: '#6A2A36',
    // glow = what the flame ADDS to the lit stone / wall (linear add after sRGB decode): a red-orange so warm x
    // cool stone lands on a brown, never on the olive that orange x teal gives
    18: '#8A4A24', 19: '#5E3018', 20: '#C07032',
  },
};

export const SIZES = [0.3, 0.55, 0.8, 1.0, 1.25, 1.5];
export const S_NORMAL = 3;
export const LEANS = [-1, 0, 1];
export const NF = 6;        // flame frames (k = 2: 7.5 fps, 0.8 s loop)
export const NC = 4;        // core frames (k = 3: 5 fps)
export const NCOAL = 3;     // coal frames per level (k = 4: 3.75 fps)
export const SMOKE_R = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];   // texels (authored at vh 10, scaled by tpm / 36)
export const SMOKE_FADE = 3;

// Kind shapes in metres (converted to texels with tpm = 360 / viewHeight).
// flareGain: how much taller the flare sizes (> 1) draw (torch: a small flame needs a bigger jump to read).
// glow: night glow for a fire WITHOUT a PointLight: [rx, ry-on-screen ratio] in metres (ground 0.5 = the 30° pitch,
// wall 0.87), halo = a 1-texel plus-dilated rim around each flame drawing (candles).
export const SHAPES = {
  campfire: { w: 0.2, h: 0.78, tongues: 3, spread: 0.62, licks: true, core: true, coal: [0.5, 0.1], glow: [0.95, 0.5] },
  brazier: { w: 0.17, h: 0.62, tongues: 3, spread: 0.6, licks: true, core: true, coal: [0.36, 0.07], glow: [0.62, 0.5] },
  torch: { w: 0.075, h: 0.36, tongues: 2, spread: 0.7, licks: true, core: false, coal: [0.11, 0.06], flareGain: 2.2, glow: [0.34, 0.87] },
  forge: { w: 0.24, h: 0.3, tongues: 5, spread: 0.5, licks: false, core: true, coal: [0.64, 0.1], bed: true, glow: [0.8, 0.5] },
  candle: { w: 0.03, h: 0.15, tongues: 1, spread: 0, licks: false, core: false, coal: [0.03, 0.03], candle: true, glow: [0.24, 0.5], halo: true },
};
/** Drawn height scale of size s for shape p (flare sizes > 1 are stretched by p.flareGain). */
export const heightScale = (p, s) => (s > 1 ? 1 + (s - 1) * (p.flareGain ?? 1) : s);

const even = (x) => 2 * Math.ceil(x / 2);

// ------------------------------------------------------------------------------------------------ flame shapes
/** Half-width profile of one tongue at height fraction u (0 base .. 1 tip): round shoulder, pointed tip. */
function profile(u, bed) {
  if (u < 0 || u > 1) return -1;
  const shoulder = bed ? Math.min(1, 0.8 + u * 2.0) : Math.min(1, 0.55 + u * 2.6);
  return shoulder * Math.pow(1 - u, bed ? 0.75 : 0.95);
}

/** Tongues of drawing (s, lean, frame) in texels. Pure f(args). */
function tongues(p, s, lean, f, n, seed) {
  const th = (TAU * f) / n;
  const H = p.h * heightScale(p, s), W = p.w * (s < 1 ? Math.max(0.55, 0.45 + 0.55 * s) : 0.8 + 0.2 * s);
  const out = [];
  // main tongue: height breathes over the loop (one tall beat, one short), sways at its tip
  out.push({ ox: 0, h: H * (0.9 + 0.1 * Math.sin(th + 0.4) + 0.05 * Math.sin(2 * th)), w: W, ph: 0, amp: 0.3 });
  const k = p.tongues - 1;
  for (let i = 0; i < k; i++) {
    const side = k === 1 ? (hash(i, 7, seed) < 0.5 ? -1 : 1) : (i % 2 ? 1 : -1) * (1 + Math.floor(i / 2) * 0.9);
    const ph = TAU * hash(i, 3, seed), m = 1 + (i % 2);
    out.push({
      ox: side * W * p.spread, h: H * (0.48 + 0.16 * Math.sin(m * th + ph) + 0.06 * hash(i, 5, seed)),
      w: W * (p.bed ? 0.62 : 0.55), ph, amp: 0.45,
    });
  }
  return { list: out, H, W, th, lean };
}
function centreX(tg, T, u, sc = 1) {
  const sway = T.W * tg.amp * u * Math.sin(T.th + tg.ph + u * 3.2);
  return tg.ox * (1 - 0.35 * u) * sc + T.lean * T.H * 0.26 * u * u + sway * sc;
}
function insideFlame(T, x, y, bed, hs = 1, ws = 1) {
  for (const tg of T.list) {
    const h = tg.h * hs;
    const u = y / h;
    const pr = profile(u, bed);
    if (pr < 0) continue;
    if (Math.abs(x - centreX(tg, T, u, ws)) <= tg.w * ws * pr) return true;
  }
  return false;
}

/** One flame drawing: Uint8Array N*N of palette indices, rows top-down, base on row N-2, centred on column N/2. */
export function flameDrawing(p, N, s, lean, f, seed) {
  const T = tongues(p, s, lean, f, NF, seed);
  const out = new Uint8Array(N * N);
  const base = N - 2;                        // row of y = 0 (one empty row below for the coal overlap)
  const at = (c, r) => ({ x: c + 0.5 - N / 2, y: base - r + 0.5 });
  const filled = (c, r) => { if (c < 0 || r < 0 || c >= N || r >= N) return false; const q = at(c, r); return insideFlame(T, q.x, q.y, p.bed); };
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const { x, y } = at(c, r);
    if (!insideFlame(T, x, y, p.bed)) continue;
    let idx = PI.ORANGE;
    if (insideFlame(T, x, y, p.bed, 0.6, 0.55)) idx = PI.YELLOW;
    const u = y / T.H;
    const edge = !filled(c - 1, r) || !filled(c + 1, r) || !filled(c, r - 1);
    if (edge && idx === PI.ORANGE && u > 0.42) idx = PI.RED;
    out[r * N + c] = idx;
  }
  // candle: the classic 3-tone teardrop with a blue-less dark base dot is too small to band: core + yellow + red tip
  if (p.candle) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const i = r * N + c; if (!out[i]) continue;
      const { y } = at(c, r); const u = y / T.H;
      out[i] = u < 0.38 ? PI.CORE : u < 0.75 ? PI.YELLOW : PI.ORANGE;
    }
  }
  // detached lick: pinches off the tallest tongue tip on frames 2-3 and rises (2x2 / 2x3 texel blob)
  if (p.licks && s >= 0.8 && (f === 2 || f === 3)) {
    const tg = T.list[0];
    const rise = f === 2 ? 1.6 : 4.2;
    const lx = centreX(tg, T, 1) + T.lean * 1.0;
    const ly = tg.h + rise;
    const rw = Math.max(1, Math.round(T.W * 0.22)), rh = rw + 1;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const { x, y } = at(c, r);
      const dx = (x - lx) / rw, dy = (y - ly) / rh;
      if (dx * dx + dy * dy <= 1.0) out[r * N + c] = f === 2 ? PI.ORANGE : PI.RED;
    }
  }
  return out;
}

/** Core overlay (k = 3, own rhythm): the pale heart low in the flame, 4 frames. */
export function coreDrawing(p, N, s, f, seed) {
  const out = new Uint8Array(N * N);
  const base = N - 2;
  const th = (TAU * f) / NC;
  const H = p.h * s * (p.bed ? 0.55 : 0.36) * (0.85 + 0.15 * Math.sin(th + hash(1, 2, seed) * TAU));
  const W = p.w * s * (p.bed ? 0.8 : 0.42);
  const sway = Math.round(Math.sin(th) * Math.max(0, W * 0.25));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = c + 0.5 - N / 2 - sway, y = base - r + 0.5;
    const u = y / H; if (u < 0 || u > 1) continue;
    const pr = profile(u, p.bed);
    if (Math.abs(x) <= W * pr) out[r * N + c] = Math.abs(x) <= W * pr * 0.55 && u < 0.7 ? PI.CORE : PI.YELLOW;
  }
  return out;
}

/** Coal bed: a flat seeded ellipse of coal texels just under the flame base. level 3 bright .. 1 dying; 3 frames. */
export function coalDrawing(p, N, tpm, level, f, seed) {
  const out = new Uint8Array(N * N);
  const cw = Math.max(1, p.coal[0] * tpm / 2), ch = Math.max(1, p.coal[1] * tpm / 2);
  const cy = N - 2 - ch * 0.4;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = c + 0.5 - N / 2, y = r + 0.5;
    const dx = x / cw, dy = (y - cy) / ch;
    if (dx * dx + dy * dy > 1) continue;
    const h = hash(c * 31 + r, Math.floor(f + hash(c, r, seed) * NCOAL) % NCOAL, seed + level);
    let idx = 0;
    if (level >= 3) idx = h < 0.28 ? PI.COAL_HOT : h < 0.78 ? PI.COAL_RED : PI.COAL_DARK;
    else if (level === 2) idx = h < 0.1 ? PI.COAL_HOT : h < 0.5 ? PI.COAL_RED : PI.COAL_DARK;
    else idx = h < 0.22 ? PI.COAL_RED : h < 0.55 ? PI.COAL_DARK : 0;
    out[r * N + c] = idx;
  }
  return out;
}

/**
 * Smoke puff: a pixel disc of radius r, lit from upper-left (3 tones). Fading is a SILHOUETTE change, never a
 * stipple (a 50 % checker read as a golf-ball waffle at the gameplay zoom): fade 1 = one texel smaller with a ragged
 * bite out of the shadow side and a smaller highlight, fade 2 = (the caller already shrinks it by 2) two bites and
 * only the mid / shadow tones (the last drawing before it is gone).
 */
export function puffDrawing(N, rad, fade, warm) {
  const out = new Uint8Array(N * N);
  const c0 = N / 2;
  const [hi, mid, sh] = warm ? [PI.WARM_HI, PI.WARM_MID, PI.WARM_SH] : [PI.SMOKE_HI, PI.SMOKE_MID, PI.SMOKE_SH];
  const R = rad - 0.15 - (fade === 1 && rad >= 3 ? 1 : 0);
  // bites: discs centred just outside the rim (lower-right = away from the light; fade 2 adds one upper-right)
  const bites = [];
  if (fade >= 1 && R >= 1.6) bites.push([Math.cos(0.35 + 0.4 * (rad % 3)) * R * 1.05, Math.sin(0.35 + 0.4 * (rad % 3)) * R * 1.05, Math.max(1.1, R * 0.5)]);
  if (fade === 2 && R >= 2.6) bites.push([Math.cos(-1.1) * R * 1.05, Math.sin(-1.1) * R * 1.05, Math.max(1.1, R * 0.4)]);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = c + 0.5 - c0, y = r + 0.5 - c0;
    const d = Math.hypot(x, y);
    if (d > R + (rad === 1 ? 0.45 : 0)) continue;
    if (bites.some(([bx, by, br]) => Math.hypot(x - bx, y - by) < br)) continue;
    const l = (-x * 0.6 - y * 0.8) / Math.max(1, R);
    let idx = rad <= 1 ? mid : l > 0.35 ? hi : l < -0.3 ? sh : mid;
    if (fade === 1 && idx === hi && l < 0.55) idx = mid;
    if (fade === 2) idx = l > 0.05 ? mid : sh;
    out[r * N + c] = idx;
  }
  return out;
}

/** Night glow: a 2-ring quantised ellipse (inner GLOW_HI, outer GLOW_LO), rx / ry in texels; grow = inner +1. */
export function glowDrawing(N, rx, ry, grow) {
  const out = new Uint8Array(N * N);
  const c0 = N / 2;
  const ix = rx * 0.52 + grow, iy = ry * 0.52 + grow * 0.5;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = c + 0.5 - c0, y = r + 0.5 - c0;
    const o = (x / rx) ** 2 + (y / ry) ** 2, i = (x / ix) ** 2 + (y / iy) ** 2;
    if (o <= 1) out[r * N + c] = i <= 1 ? PI.GLOW_HI : PI.GLOW_LO;
  }
  return out;
}

/** Halo: the flame drawing's mask dilated by a 1-texel plus (GLOW_HALO rim; the flame paints over its own texels). */
export function haloDrawing(flame, N) {
  const out = new Uint8Array(N * N);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const on = (cc, rr) => cc >= 0 && rr >= 0 && cc < N && rr < N && flame[rr * N + cc] > 0;
    if (on(c, r) || on(c - 1, r) || on(c + 1, r) || on(c, r - 1) || on(c, r + 1)) out[r * N + c] = PI.GLOW_HALO;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ atlas
/**
 * Build the atlas for the given kinds at tpm texels / metre. Returns { data (Uint8Array R8), width, height, cols,
 * cell, kinds: { [kind]: { N, flame(sIdx, lean, f), core(sIdx, f), coal(level, f), light[f] } }, puff(r, fade, warm),
 * ember(i, size) }.
 */
export function buildAtlas(kindNames, tpm, seed = 1) {
  const cells = [];
  const add = (N, arr) => { cells.push({ N, arr }); return cells.length - 1; };
  const kinds = {};
  let cell = 0;
  for (const name of kindNames) {
    const sh = SHAPES[name];
    const p = { ...sh, w: sh.w * tpm, h: sh.h * tpm };
    const N = Math.min(64, even(Math.max(p.w * 2 * 1.3 * (1 + p.spread * (p.tongues - 1) * 0.5) + 6, p.h * heightScale(p, SIZES[SIZES.length - 1]) * 1.08 + 10, 8)));
    cell = Math.max(cell, N);
    const ks = seed * 13 + name.length * 101 + name.charCodeAt(0);
    const fl = {}, co = {}, cl = {};
    for (let si = 0; si < SIZES.length; si++) for (const ln of LEANS) for (let f = 0; f < NF; f++)
      fl[`${si}:${ln}:${f}`] = add(N, flameDrawing(p, N, SIZES[si], ln, f, ks));
    if (p.core) for (let si = 2; si < SIZES.length; si++) for (let f = 0; f < NC; f++) co[`${si}:${f}`] = add(N, coreDrawing(p, N, SIZES[si], f, ks));
    for (let lv = 1; lv <= 3; lv++) for (let f = 0; f < NCOAL; f++) cl[`${lv}:${f}`] = add(N, coalDrawing(p, N, tpm, lv, f, ks));
    // light flicker in sync with the drawing: rank of each frame's flame area -> 4 levels
    const area = Array.from({ length: NF }, (_, f) => cells[fl[`${S_NORMAL}:0:${f}`]].arr.reduce((a, v) => a + (v ? 1 : 0), 0));
    const sorted = [...area].sort((a, b) => a - b);
    const light = area.map((a) => Math.min(3, Math.floor((sorted.indexOf(a) / NF) * 4)));
    // night glow per size index x 2 flicker widths (only used when the fire owns no PointLight)
    const gl = {}, ha = {};
    let GN = 0;
    if (p.glow) {
      const [gm, ratio] = p.glow;
      for (let si = 0; si < SIZES.length; si++) for (const g of [0, 1]) {
        const k = 0.6 + 0.4 * Math.min(1.25, SIZES[si]);
        let rx = gm * tpm * k, ry = rx * ratio;
        const n = Math.min(64, even(2 * rx + 2));
        if (2 * rx + 2 > n) { const f = (n - 2) / (2 * rx); rx *= f; ry *= f; }
        GN = Math.max(GN, n);
        gl[`${si}:${g}`] = { cell: add(n, glowDrawing(n, rx, ry, g)), N: n };
      }
    }
    if (p.halo) for (let si = 0; si < SIZES.length; si++) for (const ln of LEANS) for (let f = 0; f < NF; f++)
      ha[`${si}:${ln}:${f}`] = add(N, haloDrawing(cells[fl[`${si}:${ln}:${f}`]].arr, N));
    cell = Math.max(cell, GN);
    kinds[name] = {
      N, p, light,
      glow: (si, g) => gl[`${clamp(si, 0, SIZES.length - 1)}:${g}`] ?? null,
      halo: (si, ln, f) => ha[`${clamp(si, 0, SIZES.length - 1)}:${ln}:${f}`] ?? -1,
      flame: (si, ln, f) => fl[`${clamp(si, 0, SIZES.length - 1)}:${ln}:${f}`],
      core: (si, f) => co[`${si}:${f}`] ?? -1,
      coal: (lv, f) => (lv >= 1 ? cl[`${Math.min(3, lv)}:${f}`] : -1),
    };
  }
  const PN = 26;
  const pf = {};
  for (const r of SMOKE_R) for (let fd = 0; fd < SMOKE_FADE; fd++) for (const w of [0, 1]) pf[`${r}:${fd}:${w}`] = add(PN, puffDrawing(PN, r, fd, w));
  const em = {};
  for (const [k, idx] of [[0, PI.EMBER_HI], [1, PI.EMBER_MID], [2, PI.EMBER_LO]]) {
    const a1 = new Uint8Array(1); a1[0] = idx; em[`${k}:1`] = add(1, a1);
    const a2 = new Uint8Array(4).fill(idx); em[`${k}:2`] = add(2, a2);
  }
  const wk = new Uint8Array(1); wk[0] = PI.COAL_RED; em.wick = add(1, wk);    // a snuffed candle wick's ember
  cell = Math.max(cell, PN);
  const cols = Math.max(1, Math.floor(2048 / cell));
  const rows = Math.ceil(cells.length / cols);
  const width = cols * cell, height = rows * cell;
  const data = new Uint8Array(width * height);
  cells.forEach(({ N, arr }, i) => {
    const ox = (i % cols) * cell, oy = Math.floor(i / cols) * cell;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) data[(oy + r) * width + ox + c] = arr[r * N + c];
  });
  return {
    data, width, height, cols, cell, count: cells.length, kinds,
    puff: (r, fd, warm) => pf[`${clamp(Math.round(r), 1, SMOKE_R[SMOKE_R.length - 1])}:${fd}:${warm ? 1 : 0}`],
    puffN: PN,
    ember: (k, size = 1) => em[`${k}:${size}`],
    wick: em.wick,
    cells,
  };
}
