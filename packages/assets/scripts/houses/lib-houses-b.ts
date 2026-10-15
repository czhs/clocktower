// Shared helpers for the houses drawn by "houses-b": the four WEST-facing houses on the right of
// the ring (house-5..8: gable end to the camera, door in the visible LEFT side wall) and house-9.
//
// Everything is drawn directly in west coordinates (no mirroring), so light still comes from the
// upper left: the side wall (on the left, facing west) is lit, the gable end faces the camera.
//
//   x: 0 ........ SW-1 | SW ................ W-1
//      side wall strip  | gable-end (front) wall
//      rises to the left| ground row H-1
//
// NOTE: buildings.ts imports the house registry, which imports this file, so nothing here may
// read a buildings.ts constant at module top level (only inside functions).
import type { BuildingDef } from '@ct/protocol';
import { TS } from '../../src/layout.js';
import { cutDoor, doorAssembly, type BuildingSprite, type DoorOut, type DoorSpec, type Tf } from '../buildings.js';
import { type Color, dpick, hash, Img, mix, vnoise } from '../lib/img.js';

export type Pt = { x: number; y: number };
export type V2 = [number, number];

// ---------------------------------------------------------------------------------------
// Palettes (literals: see the note above)

export const P = {
  sage: ['#38443c', '#4c5a4c', '#62705e', '#7c8a74', '#98a48c', '#b4bca4'],
  ochre: ['#4a3418', '#664a20', '#86642c', '#a6803a', '#c09a4e', '#d8b46a'],
  cream: ['#4e4638', '#6c6250', '#8c826a', '#ada284', '#c9bf9e', '#e2d9b8'],
  capRed: ['#1c060e', '#320a18', '#4c1220', '#661a28', '#80262e', '#983634', '#b0503e'],
  spot: ['#6a5c4c', '#908268', '#b4a688', '#d0c4a2', '#e6dcbe'],
  gill: ['#3a2a28', '#5a4238', '#7a5e4c', '#9a7e64'],
  logs: ['#1e130c', '#2e1e12', '#43301c', '#5a4228', '#745636', '#8e6c46'],
  endGrain: ['#4a3420', '#7a5c38', '#a8885a', '#ccb07c'],
  chink: ['#5a5244', '#7a7060', '#958a76'],
  shakes: ['#1c140e', '#2a1e14', '#3c2a1a', '#523a22', '#6a4c2c', '#846238'],
  river: ['#2a262e', '#3c3640', '#524a52', '#6a6064', '#847a78', '#a0948a'],
  copper: ['#0e1818', '#132522', '#1a352e', '#244a3e', '#30604e', '#427a62', '#5c947a'],
  verdigris: ['#1c3a32', '#2c5a4a', '#428066', '#64a488', '#94c8aa'],
  bronze: ['#2a1a0c', '#4a2e14', '#6e4820', '#94662e', '#bc8a40', '#e0b460'],
  greyStone: ['#22202a', '#2e2b36', '#3c3844', '#4c4754', '#5e5866', '#736c7a'],
  plum: ['#1c1220', '#271a2e', '#33233c', '#402d4c', '#4f395e', '#604872'],
  redTile: ['#260f12', '#3a1618', '#521e1c', '#6a2a24', '#82382e', '#9a4a3a', '#b05e44'],
  tealSlate: ['#0f1824', '#152232', '#1c2d42', '#253a54', '#304a68', '#3e5c7c', '#527292'],
  beam: ['#1a110c', '#271a12', '#36241a', '#462f22', '#5a3e2c'],
  darkGreen: ['#0e1a14', '#16261c', '#203626', '#2c4830'],
  rose: ['#5a1420', '#8a2030', '#b83444', '#de5a64', '#f08a88'],
  glass: ['#7a3e1a', '#c06a24', '#eda040', '#ffd27a', '#fff0c0'],
  iron: ['#0f0d14', '#1b1822', '#2a2632', '#3c3746', '#524c5e'],
  brass: ['#3a2a10', '#5e4518', '#8a6a24', '#b8913a', '#e0c060', '#f6e098'],
  leaf: ['#122016', '#1c3220', '#28482a', '#3a6232', '#567e3e', '#76984e'],
  dstone: ['#3a3138', '#574b4e', '#786a69', '#9a8a7c', '#bba891', '#d9c8a8'],
  stone: ['#24212c', '#312d3a', '#3f3a48', '#4e4858', '#5f5869', '#726a7a'],
} as const;

export const OUT = '#0b0714';
export const IVORY = '#fff1cc';

export const lighten = (c: Color, t: number) => mix(c, IVORY, t);
export const darken = (c: Color, t: number) => mix(c, OUT, t);

// ---------------------------------------------------------------------------------------
// Geometry for a west-facing side-door house

export class West {
  readonly img: Img;
  readonly W: number;
  readonly H: number;
  /** Visible side-wall strip width (on the left). */
  readonly SW: number;
  /** Gable-end (front) wall width. */
  readonly FW: number;
  readonly windows: Pt[] = [];
  constructor(b: BuildingDef, extra: number, SW = 22) {
    this.W = b.footprint.w * TS;
    this.H = b.footprint.h * TS + extra;
    this.SW = SW;
    this.FW = this.W - SW;
    this.img = new Img(this.W, this.H);
  }
  /** How much the side wall's ground line has risen k px back from the front corner. */
  rise(k: number) {
    return Math.floor((k + 1) / 2);
  }
  /** Ground row (last opaque row) at column x: rises to the left along the side wall. */
  base(x: number) {
    return x >= this.SW ? this.H - 1 : this.H - 1 - this.rise(this.SW - 1 - x);
  }
  /** Transform for an upright local image on the side wall: bottom-left at column x0, its bottom row h0 px above the ground. */
  sideT(x0: number, h0: number, lh: number): Tf {
    return (i, j) => {
      const x = x0 + i;
      return [x, this.base(x) - h0 - (lh - 1 - j)];
    };
  }
  /** Paste an upright texture (column i = sprite column x0+i) onto the side wall; its last row sits on the ground. */
  sideTex(tex: Img, x0 = 0, lit = 0.05) {
    for (let i = 0; i < tex.w; i++)
      for (let j = 0; j < tex.h; j++) {
        const c = tex.get(i, j);
        if (c[3] === 0) continue;
        const x = x0 + i;
        const y = this.base(x) - (tex.h - 1) + j;
        this.img.set(x, y, lit >= 0 ? mix(c, IVORY, lit) : mix(c, OUT, -lit));
      }
  }
  /** The ridge direction (from the front gable apex backwards over the side wall). */
  get R(): V2 {
    return [-this.SW, -this.rise(this.SW - 1)];
  }
}

/** Fill the parallelogram a, a+S, a+S+R, a+R. f gets u (along R, 0..1) and v (along S, 0..1). */
export function quad(img: Img, a: V2, S: V2, R: V2, f: (u: number, v: number, x: number, y: number) => Color | null) {
  const det = R[0] * S[1] - R[1] * S[0];
  const xs = [a[0], a[0] + S[0], a[0] + S[0] + R[0], a[0] + R[0]];
  const ys = [a[1], a[1] + S[1], a[1] + S[1] + R[1], a[1] + R[1]];
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      const px = x + 0.5 - a[0];
      const py = y + 0.5 - a[1];
      const u = (px * S[1] - py * S[0]) / det;
      const v = (R[0] * py - R[1] * px) / det;
      if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) continue;
      const c = f(u, v, x, y);
      if (c) img.set(x, y, c);
    }
}

/** Side door + pale step + outputs. Door leaf w x h, its near edge dk px back from the front corner. */
export function westDoor(w: West, spec: DoorSpec, dk: number, jamb: number, seed: number): { d: DoorOut; T: Tf; x0: number } {
  const x0 = w.SW - dk - spec.w;
  const T = w.sideT(x0, 4, spec.h);
  const d = doorAssembly(w.img, T, spec, jamb, seed);
  return { d, T, x0 };
}

/** A pale stone slab step along the side wall under the door (x0..x1 inclusive). */
export function westStep(w: West, x0: number, x1: number) {
  for (let x = x0; x <= x1; x++) {
    const y = w.base(x) - 3;
    w.img.set(x, y, dpick(P.dstone, 0.92, x, y));
    w.img.set(x, y + 1, dpick(P.dstone, 0.74, x, y + 1));
    w.img.set(x, y + 2, dpick(P.dstone, 0.42, x, y + 2));
    w.img.set(x, y + 3, dpick(P.dstone, 0.22, x, y + 3));
  }
}

/** Outline, cut the door, return the sprite. */
export function finish(img: Img, windows: Pt[], d: DoorOut, hinge: 'left' | 'right', chimney: Pt | null): BuildingSprite {
  img.outline({ darken: 0.72 });
  const cut = cutDoor(img, d, hinge);
  return { img, windows, chimney, ...cut };
}

// ---------------------------------------------------------------------------------------
// Textures

/** Limewash plaster with soft mottling, a few cracks; shade(i,j) adds to the value. */
export function plaster(img: Img, x0: number, y0: number, w: number, h: number, pal: readonly Color[], seed: number, shade: (i: number, j: number) => number = () => 0) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const y = y0 + j;
      let v = 0.56 + (vnoise(x, y, 6, seed) - 0.5) * 0.26 + shade(i, j);
      if (hash(x, y, seed + 1) < 0.025) v -= 0.2;
      img.set(x, y, dpick(pal, v, x, y));
    }
}

/** Horizontal round logs (log-cabin wall): each log `lh` rows with a lit top, a chinked seam. */
export function logWall(img: Img, x0: number, y0: number, w: number, h: number, seed: number, lh = 5, bias = 0, rowOff = 0) {
  for (let j = 0; j < h; j++) {
    const lj = (j + rowOff) % lh;
    const row = Math.floor((j + rowOff) / lh);
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const y = y0 + j;
      if (lj === lh - 1) {
        img.set(x, y, dpick(P.chink, 0.35 + (hash(x, row, seed) - 0.5) * 0.4 + bias, x, y));
        continue;
      }
      // round log profile: bright upper third, dark underside
      const t = lj / (lh - 2);
      let v = 0.78 - t * 0.55 + bias + (vnoise(x * 0.5, row * 7, 5, seed + row) - 0.5) * 0.18;
      if (hash(Math.floor(x / 3), row * 31 + lj, seed) < 0.05) v -= 0.18; // knots / checks
      img.set(x, y, dpick(P.logs, v, x, y));
    }
  }
}

/** Round river-stone masonry (fieldstone chimney). */
export function fieldstone(img: Img, x0: number, y0: number, w: number, h: number, seed: number, shade: (i: number, j: number) => number = () => 0, cw = 5, chh = 4) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const y = y0 + j;
      // Worley-ish cells: nearest of jittered points on a 5x4 grid
      const cx = Math.floor(i / cw);
      const cy = Math.floor(j / chh);
      let best = 9;
      let second = 9;
      let id = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const gx = cx + dx;
          const gy = cy + dy;
          const off = gy % 2 ? cw / 2 : 0;
          const px = gx * cw + off + hash(gx, gy, seed) * (cw * 0.6);
          const py = gy * chh + hash(gx, gy, seed + 1) * (chh * 0.6);
          const d = Math.hypot((i - px) / 1.15, j - py);
          if (d < best) {
            second = best;
            best = d;
            id = hash(gx, gy, seed + 2) * 1000;
          } else if (d < second) second = d;
        }
      if (second - best < 0.7) {
        img.set(x, y, '#141118');
        continue;
      }
      const tone = (id % 7) / 7;
      let v = 0.5 + tone * 0.32 - best * 0.07 + shade(i, j);
      const tint = id % 3 === 0 ? '#5e5244' : id % 3 === 1 ? '#4a4e58' : null;
      const c = dpick(P.river, v, x, y);
      img.set(x, y, tint ? mix(c, tint, 0.25) : c);
    }
}

/** Cedar shakes / roof tile courses for a texture coordinate (ux along the eave, ly from the ridge). */
export function shakes(ux: number, ly: number, seed: number, course = 4, width = 4): number {
  const row = Math.floor(ly / course);
  const rl = ly % course;
  const off = (row % 2) * Math.floor(width / 2) + Math.floor(hash(row, 3, seed) * 2);
  const sx = Math.floor((ux + off) / width);
  let v = (hash(sx, row, seed) - 0.5) * 0.3;
  if (rl === course - 1) v -= 0.32;
  else if ((ux + off) % width === 0) v -= 0.2;
  else if (rl === 0) v += 0.1;
  return v;
}

/** Fish-scale (rounded) slates. */
export function scales(ux: number, ly: number, seed: number): number {
  const row = Math.floor(ly / 4);
  const off = (row % 2) * 2;
  const sx = Math.floor((ux + off) / 4);
  const lx = ((ux + off) % 4) - 1.5;
  const lyy = ly % 4;
  let v = (hash(sx, row, seed) - 0.5) * 0.22;
  if (lyy === 3 && Math.abs(lx) < 1.6) v -= 0.32; // the rounded bottom of each scale
  if (lyy === 2 && Math.abs(lx) > 1.4) v -= 0.3;
  if (lyy === 0) v += 0.1;
  return v;
}

// ---------------------------------------------------------------------------------------
// Small decorative painters

/** Upright window image: frame + glass (+ optional leaded diamond panes / cross bars). */
export function glassWindow(w: number, h: number, opts: { arch?: boolean; diamond?: boolean; bars?: boolean; frame?: Color; seed?: number } = {}): Img {
  const img = new Img(w + 2, h + 2);
  const frame = opts.frame ?? P.beam[0]!;
  const inside = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= w || j >= h) return false;
    if (!opts.arch) return true;
    const r = w / 2;
    if (j >= r) return true;
    return Math.hypot(i + 0.5 - r, j + 0.5 - r) <= r + 0.1;
  };
  for (let j = -1; j <= h; j++)
    for (let i = -1; i <= w; i++) {
      if (inside(i, j)) continue;
      if (inside(i + 1, j) || inside(i - 1, j) || inside(i, j + 1) || inside(i, j - 1) || inside(i + 1, j + 1) || inside(i - 1, j + 1)) img.set(i + 1, j + 1, frame);
    }
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!inside(i, j)) continue;
      let v = 0.9 - j / (h * 1.8) - Math.abs(i + 0.5 - w / 2) / (w * 2.6) + (hash(i, j, opts.seed ?? 1) < 0.05 ? 0.12 : 0);
      let c = dpick(P.glass, v, i, j);
      if (opts.diamond && ((i + j) % 4 === 0 || (i - j + 400) % 4 === 0)) c = mix(c, '#2a1a10', 0.62);
      img.set(i + 1, j + 1, c);
    }
  if (opts.bars) {
    if (w >= 5) for (let j = 0; j < h; j++) if (inside(Math.floor(w / 2), j)) img.set(Math.floor(w / 2) + 1, j + 1, frame);
    if (h >= 6) for (let i = 0; i < w; i++) if (inside(i, Math.floor(h / 2))) img.set(i + 1, Math.floor(h / 2) + 1, frame);
  }
  return img;
}

/** Paste an upright local image through a transform (opaque pixels only). */
export function put(dst: Img, local: Img, T: Tf) {
  for (let j = 0; j < local.h; j++)
    for (let i = 0; i < local.w; i++) {
      const c = local.get(i, j);
      if (c[3] === 0) continue;
      const [x, y] = T(i, j);
      dst.set(x, y, c);
    }
}

/** A small hanging lantern (cord from (x, y)), body 3x4 with a warm pane; returns the glow point. */
export function hangLantern(img: Img, x: number, y: number, cord: number, tone: Color = '#ffd27a'): Pt {
  img.vline(x, y, y + cord - 1, P.iron[2]!);
  const t = y + cord;
  img.hline(x - 1, x + 1, t, P.iron[1]!);
  img.rect(x - 1, t + 1, 3, 3, tone);
  img.set(x - 1, t + 1, mix(tone, IVORY, 0.55));
  img.vline(x + 1, t + 1, t + 3, mix(tone, '#7a3e1a', 0.45));
  img.hline(x - 1, x + 1, t + 4, P.iron[1]!);
  return { x, y: t + 2 };
}

/** A round paper lantern (lantern-maker's string), 4x4, coloured; returns glow point. */
export function paperLantern(img: Img, x: number, y: number, tone: Color): Pt {
  img.set(x, y - 1, P.iron[1]!);
  img.set(x + 1, y - 1, P.iron[1]!);
  img.rect(x - 1, y, 4, 4, tone);
  img.hline(x, x + 1, y - 0, mix(tone, IVORY, 0.35));
  img.set(x - 1, y + 1, mix(tone, IVORY, 0.5));
  img.vline(x + 2, y + 1, y + 3, mix(tone, '#3a0a10', 0.4));
  img.set(x - 1, y, mix(tone, '#3a0a10', 0.2));
  img.set(x + 2, y, mix(tone, '#3a0a10', 0.4));
  img.hline(x, x + 1, y + 4, P.iron[1]!);
  return { x: x + 1, y: y + 2 };
}

/** Climbing rose briar: thorny dark stems wandering upward with leaves and roses. */
export function briar(img: Img, x0: number, y0: number, w: number, h: number, seed: number, density = 0.5, mask?: (x: number, y: number) => boolean) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      if (mask && !mask(x, y)) continue;
      const t = (y - y0) / h; // 0 top .. 1 bottom
      const n = vnoise(x, y, 3, seed);
      const thr = 0.66 - density * 0.25 - t * 0.18;
      if (n < thr) continue;
      let c = dpick(P.leaf, 0.25 + (n - thr) * 1.6 + (hash(x, y, seed) < 0.12 ? 0.2 : 0) - (y - y0 < 1 ? 0.1 : 0), x, y);
      img.set(x, y, c);
    }
  // roses on top
  for (let y = y0; y < y0 + h; y += 1)
    for (let x = x0; x < x0 + w; x += 1) {
      if (mask && !mask(x, y)) continue;
      if (img.alpha(x, y) === 0) continue;
      if (hash(x, y, seed + 7) > 0.035 + density * 0.03) continue;
      if (vnoise(x, y, 3, seed) < 0.6 - density * 0.25) continue;
      const pink = hash(x, y, seed + 8) < 0.35;
      const R = pink ? ['#8a3a5a', '#c0607a', '#e894a0'] : ['#6a1424', '#a8243a', '#d8485a'];
      img.set(x, y, R[1]!);
      img.set(x + 1, y, R[0]!);
      img.set(x, y + 1, R[0]!);
      img.set(x + 1, y + 1, R[0]!);
      img.set(x, y, R[2]!);
    }
}

/** A gear (cog) disc: outer radius r, teeth n; brass shaded from the upper left. */
export function gear(img: Img, cx: number, cy: number, r: number, teeth: number, pal: readonly Color[] = P.brass, hole = 0.35) {
  const R0 = r - 1.4;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const tooth = Math.cos(a * teeth) > 0.15;
      const outer = tooth ? r : R0;
      if (d > outer) continue;
      if (d < r * hole) continue;
      let v = 0.62 - (dx / r) * 0.3 - (dy / r) * 0.28;
      if (d > R0 - 0.6 && !tooth) v -= 0.12;
      if (d < r * hole + 1) v -= 0.25; // the hub's inner edge
      if (d > r * 0.5 && d < r * 0.62) v -= 0.15; // a turned groove
      img.set(x, y, dpick(pal, v, x, y));
    }
}

/** Little clock dial: ivory face, brass bezel, hands at the given angles (radians from 12). */
export function dial(img: Img, cx: number, cy: number, r: number, hA: number, mA: number) {
  img.ellipse(cx, cy, r + 1, r + 1, (x, y, nx, ny) => {
    const d = Math.hypot(nx, ny) * (r + 1);
    if (d > r) return dpick(P.brass, 0.75 - nx * 0.35 - ny * 0.35, x, y);
    const dd = d / r;
    const a = Math.atan2(ny, nx);
    const hourA = Math.round(a / (Math.PI / 6)) * (Math.PI / 6);
    if (r >= 5 && dd > 0.72 && Math.abs(a - hourA) * d < 0.55) return '#2a2030';
    return dpick(['#8a8270', '#b0a68c', '#d4ccb0', '#ece4cc', '#f8f2de'], 0.92 - dd * 0.3 - nx * 0.15 - ny * 0.12, x, y);
  });
  const hand = (ang: number, len: number) => img.line(cx - 0.5, cy - 0.5, cx - 0.5 + Math.sin(ang) * len, cy - 0.5 - Math.cos(ang) * len, '#1a1420');
  hand(mA, r * 0.85);
  hand(hA, r * 0.55);
}

/** Wooden signboard (w x h) with a bracket from (bx, by) going left/right; glyph painter gets the board's top-left. */
export function bracketSign(img: Img, bx: number, by: number, len: number, toLeft: boolean, w: number, h: number, glyph: (gx: number, gy: number) => void) {
  const s = toLeft ? -1 : 1;
  for (let k = 0; k <= len; k++) img.set(bx + s * k, by, P.iron[2]!);
  img.set(bx + s, by + 1, P.iron[2]!);
  img.set(bx + s * 2, by + 1, P.iron[1]!);
  const x0 = toLeft ? bx - len : bx + len - w + 1;
  img.vline(x0 + 1, by + 1, by + 2, P.iron[3]!);
  img.vline(x0 + w - 2, by + 1, by + 2, P.iron[3]!);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) img.set(x0 + i, by + 3 + j, dpick(['#2a1a10', '#3e2818', '#5a3a22', '#7a5230'], 0.5 + (i === 0 || j === 0 ? 0.3 : 0) - (i === w - 1 || j === h - 1 ? 0.3 : 0), x0 + i, by + 3 + j));
  glyph(x0 + 1, by + 4);
}

// ---------------------------------------------------------------------------------------
// Roof pieces

/**
 * One roof slope: the parallelogram from the eave corner `a` up to the gable apex, extruded back
 * along R. Courses run parallel to the eave; tex(ux, ly) adds texture (ux along the eave, ly px
 * down from the ridge).
 */
export function slope(img: Img, a: V2, apex: V2, R: V2, pal: readonly Color[], tex: (ux: number, ly: number) => number, lit: number, opts: { moss?: (x: number, y: number) => boolean; eaveRows?: number } = {}) {
  const S: V2 = [apex[0] - a[0], apex[1] - a[1]];
  const L = Math.hypot(S[0], S[1]);
  const RL = Math.hypot(R[0], R[1]);
  const eave = (opts.eaveRows ?? 1.5) / L;
  quad(img, a, S, R, (u, v, x, y) => {
    const ly = Math.floor((1 - v) * L);
    const ux = Math.floor(u * RL);
    let val = 0.84 - (1 - v) * 0.42 + lit + tex(ux, ly);
    if (ly <= 0) val = 0.97;
    if (v < eave) return dpick(pal, 0.04, x, y);
    if (opts.moss && opts.moss(x, y) && ly % 4 !== 3) return dpick(['#1e3220', '#2a4428', '#3a5a32', '#4a6a3a', '#5a7a44'], val, x, y);
    return dpick(pal, val, x, y);
  });
}

/** A barge board / verge along p0 -> p1: `th` rows thick, bright upper edge. */
export function barge(img: Img, p0: V2, p1: V2, pal: readonly Color[], th = 4, bias = 0) {
  const steps = Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = p0[0] + (p1[0] - p0[0]) * t;
    const y = p0[1] + (p1[1] - p0[1]) * t;
    for (let k = 0; k < th; k++) {
      const v = k < 1 ? 0.95 : k < th - 1 ? 0.55 : 0.1;
      img.set(x, y + k - Math.floor(th / 2), dpick(pal, v + bias, Math.round(x), Math.round(y + k)));
    }
  }
}

/** Fill a polygon with a texture painted into a scratch image (wall textures clipped to a gable). */
export function texPoly(img: Img, pts: V2[], paint: (tmp: Img) => void) {
  const tmp = new Img(img.w, img.h);
  paint(tmp);
  img.poly(pts, (x, y) => {
    const c = tmp.get(x, y);
    return c[3] ? c : null;
  });
}
