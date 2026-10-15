// Ambient particles + the Storyteller's teleport poof.
import { hash, Img } from '../lib/img.js';
import { clamp01, glowMax, lerp, puff, softBlob, star } from './common.js';

// Chimney smoke: one puff growing and fading (10x10, partial alpha). Emit at the chimney top
// (anchor = bottom centre) and drift it up/sideways in the client.
export function smoke(f: number): Img {
  const img = new Img(10, 10);
  const t = f / 4;
  const r = lerp(1.6, 4.4, t);
  const a = lerp(0.62, 0.14, Math.pow(t, 0.8));
  const cy = lerp(7.2, 4.6, t);
  puff(img, 5 - t * 0.6, cy, r, a, 11 + f);
  if (f >= 1) puff(img, 5.6 + t * 0.8, cy + 0.6 - t, r * 0.6, a * 0.8, 31 + f);
  return img;
}

// Firefly pulse (5x5, binary alpha, no outline - it's a light).
export function firefly(f: number): Img {
  const img = new Img(5, 5);
  const CORE = ['#a8b040', '#d8e868', '#f4ffb0', '#d8e868'];
  const HALO = ['', '#6a7a2a', '#9aaa3a', '#6a7a2a'];
  if (f > 0) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) img.set(2 + dx, 2 + dy, HALO[f]!);
  if (f === 2) {
    img.set(2, 2, CORE[2]!);
    img.set(3, 2, CORE[1]!);
    img.set(2, 3, CORE[1]!);
  } else img.set(2, 2, CORE[f]!);
  return img;
}

// Rising ember (4x6): bright spark with a short trail, cooling to dark red.
export function ember(f: number): Img {
  const img = new Img(4, 6);
  const C = [
    ['#fff0b0', '#ffb040', '#d06020'],
    ['#ffd070', '#f08a30', '#a83c1c'],
    ['#f09a3a', '#c0501e', '#702418'],
    ['#c0501e', '#7a2a18', ''],
  ][f]!;
  const x = f % 2 === 0 ? 1 : 2;
  img.set(x, 1, C[0]!);
  if (f < 2) img.set(x + 1, 1, C[1]!);
  img.set(x, 2, C[1]!);
  if (C[2]) img.set(x + (f % 2 ? -1 : 0), 3, C[2]!);
  return img;
}

// Soft round light blobs for additive blending (32x32, alpha falloff, constant colour).
export function glow(kind: 'warm' | 'cool'): Img {
  const img = new Img(32, 32);
  glowMax(img, 16, 16, 15.5, 15.5, kind === 'warm' ? '#ffb45a' : '#8c9cff', 0.85, 2.2);
  return img;
}

// Water glint for fountains/wells (8x8, binary alpha, no outline).
export function sparkle(f: number): Img {
  const img = new Img(8, 8);
  const W = '#f4fbff';
  const A = '#a8d4ec';
  const T = '#5a8aac';
  if (f === 0) img.set(3, 4, A);
  else if (f === 1) star(img, 3, 4, 1, W, A);
  else if (f === 2) {
    star(img, 3, 4, 3, W, A, T);
    img.set(6, 1, A);
  } else {
    star(img, 3, 4, 1, A, T);
    img.set(6, 1, W);
  }
  return img;
}

// Warm light pool in front of a door (additive, partial alpha). Anchor (20,0) = door bottom centre.
export function doorglow(): Img {
  const img = new Img(40, 20);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const nx = (x + 0.5 - 20) / 19;
      const ny = (y + 0.5) / 17;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d >= 1) continue;
      // brighter in a door-wide band directly in front of the threshold
      const band = Math.max(0, 1 - Math.abs(x + 0.5 - 20) / 9) * Math.max(0, 1 - y / 14);
      const a = 0.42 * Math.pow(1 - d, 1.7) + 0.22 * band * band;
      img.set(x, y, [255, 186, 104, Math.round(255 * clamp01(a))]);
    }
  return img;
}

// ---------------------------------------------------------------------------------------
// Teleport poof (32x40, feet at (16,38)). 0-2: sparkles spiral in from the ground ring, gather,
// soft flash; 3-5: a smoke ring breathes out and the sparkles drift away and wink out.

const VIOLET = { core: '#f2e4ff', arm: '#c49cf4', tip: '#8a5cc8' };
const GOLD = { core: '#fff6d6', arm: '#ffd36a', tip: '#c89030' };
const RING_SMOKE = ['#6a5c8c', '#8072a4', '#9a8cbc', '#b4a8d0', '#cec4e2', '#e6e0f2'];

interface Mote {
  ang: number; // angle around the column
  rad: number; // radius (px, x axis)
  h: number; // height above the feet
  size: number;
  gold: boolean;
}

function motes(f: number): Mote[] {
  const out: Mote[] = [];
  const N = 12;
  for (let i = 0; i < N; i++) {
    const gold = i % 3 === 0;
    const base = (i / N) * Math.PI * 2;
    const lift = (i % 4) / 4; // stagger in height
    let rad: number;
    let h: number;
    let size: number;
    let spin: number;
    switch (f) {
      case 0:
        rad = 10;
        h = lift * 4;
        size = i % 2 ? 0 : 1;
        spin = 0;
        break;
      case 1:
        rad = 7.5;
        h = 5 + lift * 16;
        size = i % 3 === 1 ? 2 : 1;
        spin = 1.1;
        break;
      case 2:
        rad = 4;
        h = 10 + lift * 18;
        size = i % 2 ? 1 : 2;
        spin = 2.2;
        break;
      case 3:
        rad = 9;
        h = 8 + lift * 22;
        size = i % 3 === 0 ? 2 : 1;
        spin = 3.0;
        break;
      case 4:
        rad = 12;
        h = 12 + lift * 22;
        size = i % 2 ? 0 : 1;
        spin = 3.6;
        break;
      default:
        if (i % 3 !== 1) continue;
        rad = 13;
        h = 16 + lift * 20;
        size = i % 2 ? 1 : 0;
        spin = 4.0;
    }
    out.push({ ang: base + spin, rad, h, size, gold });
  }
  return out;
}

function smokeRing(img: Img, rx: number, a: number, rise: number, seed: number) {
  const cy = 36 - rise;
  const ry = rx * 0.36;
  const n = Math.max(8, Math.round(rx * 1.6));
  // draw back half first, then front half (so the ring has depth)
  for (const front of [false, true])
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + 0.3;
      const thin = (rx - 6) / 6.5; // 0 fresh .. 1 dissolving
      if (hash(k, 5, 7) < thin * 0.5) continue; // the ring breaks up as it fades
      const s = Math.sin(ang);
      if (front !== s > 0) continue;
      const x = 16 + Math.cos(ang) * rx;
      const y = cy + s * ry - hash(k, 9, 2) * thin * 4;
      const r = (1.7 + 0.8 * hash(k, seed, 3)) * (front ? 1 : 0.8) * (0.8 + rx / 30);
      puff(img, x, y - r * 0.4, r, a * (front ? 1 : 0.7), seed * 7 + k, RING_SMOKE);
    }
}

export function poof(f: number): Img {
  const img = new Img(32, 40);
  // soft magical light column (behind everything)
  const colA = [0.1, 0.24, 0.5, 0.26, 0.12, 0.04][f]!;
  softBlob(img, 16, 24, 8 + f * 0.6, 16, '#9a78d8', colA, 1.6);
  // ground ring of light where the sparkles gather
  if (f <= 2) softBlob(img, 16, 36, 12 - f * 2, 4 - f * 0.5, '#c8a8f8', [0.35, 0.4, 0.5][f]!, 1.4);
  // smoke ring
  if (f >= 2) {
    const t = (f - 2) / 3;
    smokeRing(img, lerp(6, 12.5, t), lerp(0.8, 0.12, Math.pow(t, 0.7)), t * 2.5, f);
    // a couple of wisps rising off the ring
    if (f >= 3) {
      puff(img, 6 + f, 28 - f * 2, 2.2, 0.4 - (f - 3) * 0.12, 91 + f, RING_SMOKE);
      puff(img, 26 - f, 26 - f * 2, 1.8, 0.35 - (f - 3) * 0.1, 97 + f, RING_SMOKE);
    }
  }
  // flash at the gather point
  if (f === 2) {
    softBlob(img, 16, 22, 7, 13, '#fff0d0', 0.75, 1.3);
    softBlob(img, 16, 22, 3, 6, '#ffffff', 0.9, 1);
    // tall slim beam
    for (let y = 4; y < 38; y++) {
      const t = Math.abs(y - 22) / 18;
      img.blend(16, y, '#fff6e0', 0.85 * (1 - t));
      img.blend(15, y, '#e8d0ff', 0.4 * (1 - t));
      img.blend(17, y, '#e8d0ff', 0.4 * (1 - t));
    }
  }
  if (f === 3) softBlob(img, 16, 22, 6, 10, '#f0e0ff', 0.35, 1.5);
  // sparkles (opaque, crisp) - back ones first
  const ms = motes(f).sort((a, b) => Math.sin(a.ang) - Math.sin(b.ang));
  for (const m of ms) {
    const x = 16 + Math.cos(m.ang) * m.rad;
    const y = 37 - m.h + Math.sin(m.ang) * m.rad * 0.34;
    const back = Math.sin(m.ang) < -0.3;
    const p = m.gold ? GOLD : VIOLET;
    star(img, x, y, back ? Math.max(0, m.size - 1) : m.size, back ? p.arm : p.core, back ? p.tip : p.arm, p.tip);
  }
  // the big twinkle on top of the flash
  if (f === 2) star(img, 16, 18, 5, '#ffffff', '#fff2c0', '#e0b050');
  if (f === 1) star(img, 16, 20, 2, GOLD.core, GOLD.arm, GOLD.tip);
  if (f === 3) star(img, 16, 16, 3, VIOLET.core, VIOLET.arm, VIOLET.tip);
  return img;
}
