// Shared helpers for the cast-b characters (skeleton-chef, rabbit, mole, snail, toad, green-hood,
// storyteller). v1 look: flat 5-step ramp shading lit from the upper-left, 1 px darkened outline
// per layer (like v1's body/outfit/hair layers), the v1 semi-transparent ground shadow.
//
// Turning: every part lives on a little turntable. Local coordinates are u (lateral, + = the
// character's LEFT, i.e. screen-right when it faces the camera) and w (forward). The yaw per
// direction is 0 (down) .. 180 (up); `P` maps (u, w) to a screen x offset and a depth (+ = toward
// the camera), and `revolve` paints bodies of revolution whose surface features (folds, trims,
// buttons, eyes) slide around as the character turns, so the 8 directions are one character.
import { col, Img, mix, ramp, type Color, type Ramp, type RGBA } from '../lib/img.js';
import type { DrawnDir, FrameIndex } from './types.js';

export { col, Img, mix, ramp, type Color, type Ramp, type RGBA };
export type { DrawnDir, FrameIndex };

export const CX = 16;
/** Bottom row of the feet; the outline lands on row 38 = the anchor. */
export const GY = 37;

export const PHI: Record<DrawnDir, number> = { down: 0, 'down-right': Math.PI / 4, right: Math.PI / 2, 'up-right': (3 * Math.PI) / 4, up: Math.PI };

export interface Pose {
  f: FrameIndex;
  walk: boolean;
  /** 0, or -1 on the passing frames (rise 1 px). */
  bob: number;
  /** +1: the left leg (u>0) is forward, -1: the right leg, 0: together. */
  step: number;
}
export function pose(f: FrameIndex): Pose {
  return { f, walk: f !== 0, bob: f === 2 || f === 4 ? -1 : 0, step: f === 1 ? 1 : f === 3 ? -1 : 0 };
}

export interface View {
  dir: DrawnDir;
  phi: number;
  s: number;
  c: number;
  down: boolean;
  dr: boolean;
  right: boolean;
  ur: boolean;
  up: boolean;
}
export function view(dir: DrawnDir): View {
  const phi = PHI[dir];
  return { dir, phi, s: Math.sin(phi), c: Math.cos(phi), down: dir === 'down', dr: dir === 'down-right', right: dir === 'right', ur: dir === 'up-right', up: dir === 'up' };
}

/** Local (u, w) -> screen x offset and depth (+ toward the camera). */
export function P(v: View, u: number, w: number): { x: number; d: number } {
  return { x: u * v.c + w * v.s, d: -u * v.s + w * v.c };
}
/** A point on a circle of radius r at azimuth az (0 = front, +pi/2 = the character's left). */
export function onRing(v: View, r: number, az: number): { x: number; d: number } {
  return P(v, r * Math.sin(az), r * Math.cos(az));
}
export const wrap = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
};

/** Flat (non-dithered) ramp pick like v1: v in [0,1] -> d2 d1 b l1 l2. */
export const tone = (r: Ramp, v: number): RGBA => [r.d2, r.d1, r.b, r.l1, r.l2][Math.max(0, Math.min(4, Math.round(v * 4)))]!;

const LX = -0.62;
const LY = -0.78;
/** Ellipse shaded like a sphere lit from the upper left (flat ramp). */
export function ball(l: Img, cx: number, cy: number, rx: number, ry: number, r: Ramp, bias = 0, k = 0.5) {
  l.ellipse(cx, cy, rx, ry, (_x, _y, nx, ny) => {
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    return tone(r, 0.5 + (nx * LX + ny * LY) * k + nz * 0.18 - 0.06 + bias);
  });
}

/**
 * Paint a body of revolution: rows y0..y1 with half-width hw(y) around cx. `paint` gets the
 * surface azimuth (0 = the character's front), the row, s in [-1,1] (screen position across the
 * row, -1 = left/lit edge) and x; it returns a colour or null (hole).
 */
export function revolve(l: Img, v: View, cx: number | ((y: number) => number), y0: number, y1: number, hw: (y: number) => number, paint: (az: number, y: number, s: number, x: number) => Color | null) {
  for (let y = y0; y <= y1; y++) {
    const h = hw(y);
    if (h <= 0) continue;
    const c = typeof cx === 'function' ? cx(y) : cx;
    for (let x = Math.floor(c - h); x <= Math.ceil(c + h); x++) {
      const s = (x + 0.5 - c) / h;
      if (s < -1 || s > 1) continue;
      const az = wrap(Math.asin(s) - v.phi);
      const col = paint(az, y, s, x);
      if (col) l.set(x, y, col);
    }
  }
}
/** Standard cylinder lighting across a row: lit left, dark right rim. */
export const litS = (s: number) => 0.62 - s * 0.32 - (s > 0.8 ? 0.12 : 0) + (s < -0.8 ? 0.05 : 0);
/** Is surface azimuth `az` within `half` radians of feature azimuth `at`? */
export const near = (az: number, at: number, half: number) => Math.abs(wrap(az - at)) <= half;

/** A sprite built from outlined layers (v1 composited separately-outlined layers). */
export class Sprite {
  readonly im = new Img(32, 40);
  /** Draw `fn` on a fresh layer, outline it, composite it on top. */
  layer(fn: (l: Img) => void, o: { darken?: number; outline?: boolean; skip?: ('up' | 'down' | 'left' | 'right')[]; color?: Color } = {}): this {
    const l = new Img(32, 40);
    fn(l);
    if (o.outline !== false) l.outline({ darken: o.darken ?? 0.72, skip: o.skip, color: o.color });
    this.im.blit(l, 0, 0);
    return this;
  }
  /** Paint directly on the composite (no outline), e.g. small details over existing pixels. */
  paint(fn: (l: Img) => void): this {
    fn(this.im);
    return this;
  }
  /** Add the v1 ground shadow (never bobs, only on empty pixels) and return the frame. */
  done(rx = 7, cx = CX): Img {
    const im = this.im;
    im.ellipse(cx, GY + 0.5, rx, 1.7, (x, y) => (im.alpha(x, y) ? null : ([12, 6, 20, 90] as const)));
    return im;
  }
}

/** Run parts back-to-front by depth. */
export function byDepth(parts: { d: number; draw: () => void }[]) {
  for (const p of [...parts].sort((a, b) => a.d - b.d)) p.draw();
}

/**
 * Two legs + boots. spread = lateral half-distance of the leg centres; stride = forward offset of
 * a stepping foot. Back foot lifts 1 px on contact frames. Legs run from hip to the boot top.
 */
export function legs(
  l: Img,
  v: View,
  p: Pose,
  o: { hip: number; spread: number; stride?: number; legW?: number; pants: Ramp; boot: Ramp; bootH?: number; cx?: number; only?: 'far' | 'near' },
) {
  const cx = o.cx ?? CX;
  const legW = o.legW ?? 2;
  const bootH = o.bootH ?? 2;
  const stride = o.stride ?? 2;
  const ls = [-1, 1].map((side) => {
    const f = p.step === 0 ? 0 : side === p.step ? 1 : -1;
    const q = P(v, side * o.spread, f * stride);
    return { side, f, x: cx + q.x, d: q.d };
  });
  ls.sort((a, b) => a.d - b.d);
  ls.forEach((g, k) => {
    if (o.only === 'far' && k !== 0) return;
    if (o.only === 'near' && k !== 1) return;
    const far = k === 0 && Math.abs(ls[0]!.d - ls[1]!.d) > 0.4;
    const lift = g.f < 0 ? 1 : 0;
    const foot = GY - lift;
    const x0 = Math.round(g.x - legW / 2);
    for (let y = o.hip; y <= foot - bootH; y++)
      for (let i = 0; i < legW; i++) l.set(x0 + i, y, tone(o.pants, (far ? 0.3 : 0.55) - i * 0.15));
    // boot: toe points the way the character faces
    const toe = v.s > 0.5 ? 1 : 0;
    const bw = legW + 1;
    const bx = Math.round(g.x - bw / 2) + (v.s > 0.9 ? 0 : 0);
    for (let j = 0; j < bootH; j++)
      for (let i = 0; i < bw + toe; i++) {
        const top = j === 0;
        l.set(bx + i, foot - bootH + 1 + j, tone(o.boot, (far ? 0.25 : top ? 0.6 : 0.4) - i * 0.06));
      }
  });
}

/** Little gold four-point sparkle (+). */
export function sparkle(l: Img, x: number, y: number, c: Color, dim: Color, big = true) {
  l.set(x, y, c);
  if (!big) return;
  l.set(x - 1, y, dim);
  l.set(x + 1, y, dim);
  l.set(x, y - 1, dim);
  l.set(x, y + 1, dim);
}

/** v1-style hand lantern (5 wide); (x, y) = top of the handle. */
export function lantern(l: Img, x: number, y: number, frameCol: Color = '#2a2632', small = false) {
  const w = small ? 1 : 2;
  l.vline(x, y, y + 1, frameCol);
  l.rect(x - w, y + 2, 2 * w + 1, 1, frameCol);
  const glass = ['#c06a24', '#eda040', '#ffd27a', '#fff0c0'];
  const gh = small ? 3 : 4;
  for (let j = 0; j < gh; j++)
    for (let i = -w; i <= w; i++) {
      const v = 0.95 - Math.abs(i) * (small ? 0.3 : 0.22) - j * 0.07;
      l.set(x + i, y + 3 + j, glass[Math.max(0, Math.min(3, Math.round(v * 3)))]!);
    }
  l.rect(x - w, y + 3 + gh, 2 * w + 1, 1, frameCol);
}

/** Set if inside the frame and currently empty (for adding bits behind). */
export function under(l: Img, x: number, y: number, c: Color) {
  if (l.alpha(x, y) === 0) l.set(x, y, c);
}

/**
 * A face feature on a head of centre hc: returns its screen x (centre), visibility (cos of the screen
 * angle) and foreshortening (true near the rim). Features sit on a flatter "face" of radius r.
 */
export function feat(v: View, hc: number, r: number, az: number): { x: number; vis: number; fore: boolean } {
  const a = az + v.phi;
  return { x: hc + r * Math.sin(a), vis: Math.cos(a), fore: Math.abs(Math.sin(a)) > 0.72 };
}
/** Stamp a rectangle of pixels centred at continuous x (even/odd widths stay symmetric), only over existing pixels. */
export function stamp(l: Img, cx: number, y: number, w: number, h: number, c: Color | ((i: number, j: number) => Color | null), clip = true) {
  const x0 = Math.round(cx - w / 2);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (clip && l.alpha(x0 + i, y + j) === 0) continue;
      const cc = typeof c === 'function' ? c(i, j) : c;
      if (cc) l.set(x0 + i, y + j, cc);
    }
}
/** Deterministic hash in [0,1). */
export function hashB(x: number, y: number, seed = 7): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
