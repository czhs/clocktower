// Shared helpers for the square props + ambient FX sheet (v1 procedural style).
import { col, hash, Img, mix, type Color } from '../lib/img.js';

export const STONE = ['#24212c', '#312d3a', '#3f3a48', '#4e4858', '#5f5869', '#726a7a'];
export const IRON = ['#0f0d14', '#1b1822', '#2a2632', '#3c3746', '#4e4858'];
export const WOOD = ['#22160f', '#311f15', '#422b1d', '#543826', '#674630'];
export const WOOD_LIGHT = ['#3a2618', '#4d3421', '#61432c', '#755438', '#8a6646'];
/** Grey, sun-bleached planks for boarded-up houses. */
export const WOOD_OLD = ['#2a2420', '#3c342c', '#524638', '#6a5c4a', '#83745e', '#9c8c74'];
export const BRASS = ['#3a2a10', '#5e4518', '#8a6a24', '#b8913a', '#e0c060'];
/** Fire, dark edge -> white-hot core. */
export const FIRE = ['#6a1c14', '#a8381c', '#e0702a', '#ffa83c', '#ffd770', '#fff4cc'];
export const PARCH = ['#8a7a5c', '#b4a27c', '#d6c6a0', '#e8dcbc', '#f4ecd4'];

/** Ground shadow with BINARY alpha: a checker-dithered dark plum ellipse (props/critters). */
export function ditherShadow(img: Img, cx: number, cy: number, rx: number, ry: number) {
  img.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    if (img.alpha(x, y) > 0) return null;
    const d = nx * nx + ny * ny;
    // solid-ish core, checker towards the rim
    if (d < 0.35 || (x + y) % 2 === 0) return '#140c1e';
    return null;
  });
}

/** Paint an ASCII template; '.' and ' ' are transparent. */
export function tpl(img: Img, rows: string[], pal: Record<string, Color>, ox = 0, oy = 0, flip = false) {
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j]!;
    for (let i = 0; i < r.length; i++) {
      const ch = r[i]!;
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (!c) throw new Error(`tpl: no colour for '${ch}'`);
      img.set(flip ? img.w - 1 - (ox + i) : ox + i, oy + j, c);
    }
  }
}

/** Accumulate a soft blob with smooth alpha falloff (source-over). */
export function softBlob(img: Img, cx: number, cy: number, rx: number, ry: number, c: Color, peak: number, power = 2) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d >= 1) continue;
      img.blend(x, y, c, peak * Math.pow(1 - d, power));
    }
}

/** Write a soft glow (colour fixed, alpha = falloff) — max-combines alpha so blobs merge cleanly. */
export function glowMax(img: Img, cx: number, cy: number, rx: number, ry: number, c: Color, peak: number, power = 2) {
  const cc = col(c);
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      if (!img.inb(x, y)) continue;
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d >= 1) continue;
      const a = Math.round(255 * peak * Math.pow(1 - d, power));
      const p = img.get(x, y);
      if (a > p[3]) img.set(x, y, [cc[0], cc[1], cc[2], a]);
    }
}

/**
 * Smoke puff with partial alpha: lumpy edge, lit from the upper-left, soft rim.
 * `a` is the peak alpha (0..1).
 */
export function puff(img: Img, cx: number, cy: number, r: number, a: number, seed: number, pal: readonly Color[] = SMOKE) {
  if (r <= 0 || a <= 0) return;
  for (let y = Math.floor(cy - r * 1.3); y <= Math.ceil(cy + r * 1.3); y++)
    for (let x = Math.floor(cx - r * 1.3); x <= Math.ceil(cx + r * 1.3); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const ang = Math.atan2(dy, dx);
      const rr = r * (1 + 0.14 * Math.sin(ang * 3 + seed * 1.7) + 0.08 * Math.sin(ang * 5 + seed));
      const d = Math.hypot(dx, dy) / rr;
      if (d >= 1) continue;
      // light from upper-left
      const v = 0.55 - (dx / rr) * 0.3 - (dy / rr) * 0.35 + (hash(x, y, seed) - 0.5) * 0.08;
      const i = Math.max(0, Math.min(pal.length - 1, Math.round(v * (pal.length - 1))));
      const edge = d > 0.7 ? 1 - (d - 0.7) / 0.3 : 1;
      img.blend(x, y, pal[i]!, a * (0.55 + 0.45 * edge) * (d > 0.85 ? 0.6 : 1));
    }
}
export const SMOKE = ['#5e5676', '#787090', '#928aa8', '#aca6c0', '#c6c0d4', '#dedae6'];

/** 4-point twinkle star (binary alpha). size 0 = dot, 1 = plus, 2/3 = longer arms. */
export function star(img: Img, x: number, y: number, size: number, core: Color, arm: Color, tip?: Color) {
  x = Math.round(x);
  y = Math.round(y);
  img.set(x, y, core);
  if (size <= 0) return;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    for (let k = 1; k <= size; k++) img.set(x + dx * k, y + dy * k, k === size && tip && size > 1 ? tip : arm);
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const shade = (c: Color, t: number) => mix(c, '#0b0714', t);
