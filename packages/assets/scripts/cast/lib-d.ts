// Shared helpers for the cast-d characters (opal, cilantro, mincut, maxflow, theo-rem, greenting
// and the four NPC townsfolk). v1 look: flat 5-step ramp shading lit from the upper-left, 1 px
// darkened outline, v1 semi-transparent ground shadow that never bobs.
//
// Mascots are built as a little "turntable doll": parts are placed in character-local space
// (lx = lateral, +lx is screen-right when facing the camera; lz = forward; h = height above the
// ground), projected for the facing angle, depth-sorted and drawn. All 8 directions are therefore
// the same character turning.
import { col, Img, mix, ramp, type Color, type Ramp, type RGBA } from '../lib/img.js';
import type { DrawnDir, FrameIndex } from './types.js';

export { col, Img, mix, ramp, type Color, type Ramp, type RGBA };

export const FW = 32;
export const FH = 40;
export const CX = 16;
/** Continuous ground line: the bottom edge of pixel row 37 (outline lands on row 38 = anchor). */
export const GROUND = 38;
/** How much "toward the camera" depth pushes things down the screen (3/4 top-down tilt). */
export const TILT = 0.3;
export const INK = '#1a1020';

export interface Pose {
  f: FrameIndex;
  /** 0 or -1: the passing frames rise one pixel. */
  bob: number;
  /** -1: the -lx foot forward, +1: the +lx foot forward, 0: together. */
  step: number;
  walking: boolean;
}
export function pose(f: FrameIndex): Pose {
  return { f, bob: f === 2 || f === 4 ? -1 : 0, step: f === 1 ? -1 : f === 3 ? 1 : 0, walking: f !== 0 };
}

const YAW: Record<DrawnDir, number> = { down: 0, 'down-right': 45, right: 90, 'up-right': 135, up: 180 };

export class View {
  readonly yaw: number;
  readonly c: number;
  readonly s: number;
  constructor(
    readonly dir: DrawnDir,
    readonly p: Pose,
  ) {
    this.yaw = YAW[dir];
    const r = (this.yaw * Math.PI) / 180;
    this.c = Math.abs(Math.cos(r)) < 1e-9 ? 0 : Math.cos(r);
    this.s = Math.abs(Math.sin(r)) < 1e-9 ? 0 : Math.sin(r);
  }
  get down() {
    return this.dir === 'down';
  }
  get dr() {
    return this.dir === 'down-right';
  }
  get right() {
    return this.dir === 'right';
  }
  get ur() {
    return this.dir === 'up-right';
  }
  get up() {
    return this.dir === 'up';
  }
  /** Face visible. */
  get face() {
    return this.c > -0.1;
  }
  x(lx: number, lz: number) {
    return CX + lx * this.c + lz * this.s;
  }
  /** Depth toward the camera (bigger = nearer = drawn later). */
  d(lx: number, lz: number) {
    return -lx * this.s + lz * this.c;
  }
  /** Screen y of a point at height h (bobbing unless `ground`). */
  y(h: number, lx = 0, lz = 0, ground = false) {
    return GROUND - h + this.d(lx, lz) * TILT + (ground ? 0 : this.p.bob);
  }
  /** Projected half-width of something with lateral half-size ax and forward half-size az. */
  rx(ax: number, az: number) {
    return Math.sqrt((ax * this.c) ** 2 + (az * this.s) ** 2);
  }
}

/** Flat ramp pick (v in 0..1), like v1's characters. */
export function flat(r: Ramp, v: number): RGBA {
  const pal = [r.d2, r.d1, r.b, r.l1, r.l2];
  return pal[Math.max(0, Math.min(4, Math.round(v * 4)))]!;
}
/** Light value for a normalised ellipse position (upper-left light). */
export function light(nx: number, ny: number, bias = 0): number {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return 0.5 - nx * 0.3 - ny * 0.36 + nz * 0.14 + bias;
}

export type PaintFn = (x: number, y: number, nx: number, ny: number, v: number) => Color | null | undefined;
/** Shaded ellipse (sphere-lit). `paint` may override the colour per pixel (patterns). */
export function ball(img: Img, cx: number, cy: number, rx: number, ry: number, r: Ramp, bias = 0, paint?: PaintFn) {
  img.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    const v = light(nx, ny, bias);
    const o = paint?.(x, y, nx, ny, v);
    if (o === null) return null;
    return o ?? flat(r, v);
  });
}

/** Rounded vertical limb (leg/arm/neck) from (x, y0) to (x, y1), w px wide, shaded left-lit. */
export function limb(img: Img, x: number, y0: number, y1: number, w: number, r: Ramp, bias = 0) {
  const x0 = Math.round(x - w / 2);
  const ya = Math.round(Math.min(y0, y1));
  const yb = Math.round(Math.max(y0, y1));
  for (let y = ya; y < yb; y++)
    for (let i = 0; i < w; i++) {
      const v = 0.62 - (w > 1 ? i / (w - 1) : 0.3) * 0.4 + bias;
      img.set(x0 + i, y, flat(r, v));
    }
}

interface Part {
  d: number;
  n: number;
  fn: (img: Img) => void;
  /** Inner outline darkness (drawn only over parts behind); 0 = none. */
  ol: number;
}

/** Depth-sorted parts, composited with optional inner outlines, then the silhouette outline + shadow. */
export class Scene {
  private parts: Part[] = [];
  constructor(readonly v: View) {}
  add(d: number, fn: (img: Img) => void, ol = 0) {
    this.parts.push({ d, n: this.parts.length, fn, ol });
    return this;
  }
  /** Shaded ellipsoid at local (lx, lz, h) with lateral/forward/vertical radii. */
  ball(lx: number, lz: number, h: number, ax: number, az: number, ay: number, r: Ramp, o: { bias?: number; ol?: number; dz?: number; ground?: boolean; paint?: PaintFn; rx?: number } = {}) {
    const v = this.v;
    const cx = v.x(lx, lz);
    const cy = v.y(h, lx, lz, o.ground);
    const rx = o.rx ?? v.rx(ax, az);
    return this.add(v.d(lx, lz) + (o.dz ?? 0), (img) => ball(img, cx, cy, rx, ay, r, o.bias ?? 0, o.paint), o.ol ?? 0);
  }
  render(o: { shadow?: number; outline?: number } = {}): Img {
    const img = new Img(FW, FH);
    const sorted = [...this.parts].sort((a, b) => a.d - b.d || a.n - b.n);
    for (const p of sorted) {
      if (!p.ol) {
        p.fn(img);
        continue;
      }
      const t = new Img(FW, FH);
      p.fn(t);
      const body = t.clone();
      t.outline({ darken: p.ol });
      for (let y = 0; y < FH; y++)
        for (let x = 0; x < FW; x++) {
          const a = t.alpha(x, y);
          if (!a) continue;
          if (body.alpha(x, y)) img.set(x, y, t.get(x, y));
          else if (img.alpha(x, y)) img.set(x, y, t.get(x, y));
        }
    }
    img.outline({ darken: o.outline ?? 0.72 });
    groundShadow(img, o.shadow ?? 7);
    return img;
  }
}

/** v1 ground shadow, only on empty pixels (never bobs). */
export function groundShadow(img: Img, rx: number, cx = CX) {
  img.ellipse(cx, 37.5, rx, 1.7, (x, y) => (img.alpha(x, y) ? null : ([12, 6, 20, 90] as const)));
}

/** Eye of w x h px at continuous centre (x, y); optional 1 px glint at its top-left. */
export function eye(img: Img, x: number, y: number, w = 2, h = 2, glint: Color | null = '#f4ecdc', color: Color = INK) {
  const x0 = Math.round(x - w / 2);
  const y0 = Math.round(y - h / 2);
  img.rect(x0, y0, w, h, color);
  if (glint && w >= 2) img.set(x0, y0, glint);
}

/**
 * A pair of eyes on a head (ellipsoid with lateral radius R, forward radius RZ), `spread` radians
 * from the nose line. Eyes whose surface faces away are skipped.
 */
export function eyes(sc: Scene, o: { lz0?: number; h: number; R: number; RZ: number; spread: number; w?: number; hgt?: number; glint?: Color | null; color?: Color; min?: number; dz?: number; edge?: number }) {
  const v = sc.v;
  for (const sgn of [-1, 1]) {
    const lx = sgn * o.R * Math.sin(o.spread);
    const lz = (o.lz0 ?? 0) + o.RZ * Math.cos(o.spread);
    const dn = v.d(sgn * Math.sin(o.spread), Math.cos(o.spread));
    if (dn < (o.min ?? 0.15)) continue;
    let x = v.x(lx, lz);
    // keep eyes off the silhouette edge
    const lim = v.rx(o.R, o.RZ) - (o.edge ?? 1.5);
    const cx0 = v.x(0, o.lz0 ?? 0);
    x = Math.max(cx0 - lim, Math.min(cx0 + lim, x));
    const y = v.y(o.h, lx, lz);
    sc.add(v.d(lx, lz) + 50 + (o.dz ?? 0), (img) => eye(img, x, y, o.w ?? 2, o.hgt ?? 2, o.glint === undefined ? '#f4ecdc' : o.glint, o.color ?? INK));
  }
}

/** Two feet (and legs from the hip) that step with the walk cycle. */
export function legs(sc: Scene, o: { sep: number; hip: number; w: number; foot: Ramp; leg?: Ramp; stride?: number; footW?: number; footL?: number; footH?: number; ol?: number }) {
  const v = sc.v;
  const stride = o.stride ?? 1.6;
  for (const sgn of [-1, 1]) {
    const lz = v.p.step * sgn * stride;
    const lx = sgn * o.sep;
    const fx = v.x(lx, lz);
    const legR = o.leg ?? o.foot;
    const fH = o.footH ?? 1.5;
    const top = v.y(o.hip, lx, 0);
    const bot = v.y(fH, lx, lz, true);
    sc.add(v.d(lx, lz) - 0.5, (img) => {
      limb(img, fx, top, bot, o.w, legR);
      const fl = o.footL ?? 1.5;
      const fw = o.footW ?? o.w / 2 + 0.3;
      ball(img, v.x(lx, lz + 0.6), v.y(fH, lx, lz + 0.6, true), v.rx(fw, fl), fH, o.foot, 0.05);
    }, o.ol ?? 0);
  }
}

/** Hue-preserving ramp from a hex, slightly desaturated toward grey (for NPCs). */
export function muted(c: Color, t = 0.35): Ramp {
  return ramp(mix(c, '#7a7270', t));
}

/** Shaded polygon from local points [lx, lz, h] (ears, spines, beaks); lit by bbox position. */
export function shape(sc: Scene, pts: [number, number, number][], r: Ramp, o: { bias?: number; ol?: number; dz?: number; ground?: boolean } = {}) {
  const v = sc.v;
  const scr = pts.map(([lx, lz, h]) => [v.x(lx, lz), v.y(h, lx, lz, o.ground)] as [number, number]);
  const d = pts.reduce((a, [lx, lz]) => a + v.d(lx, lz), 0) / pts.length + (o.dz ?? 0);
  const xs = scr.map((q) => q[0]);
  const ys = scr.map((q) => q[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  sc.add(d, (img) =>
    img.poly(scr, (x, y) => {
      const nx = ((x + 0.5 - x0) / Math.max(1, x1 - x0)) * 2 - 1;
      const ny = ((y + 0.5 - y0) / Math.max(1, y1 - y0)) * 2 - 1;
      return flat(r, 0.55 - nx * 0.25 - ny * 0.2 + (o.bias ?? 0));
    }),
    o.ol ?? 0,
  );
}

/**
 * Spiky ellipse (hedgehog spines): radius modulated by a sawtooth around the rim, spine streaks,
 * lighter tips. `tip` colours the outermost ring.
 */
export function spiky(img: Img, cx: number, cy: number, rx: number, ry: number, r: Ramp, o: { n?: number; amp?: number; phase?: number; tip?: Color; bias?: number } = {}) {
  const n = o.n ?? 14;
  const amp = o.amp ?? 0.16;
  const ph = o.phase ?? 0;
  const R = 1 + amp;
  for (let y = Math.floor(cy - ry * R); y <= Math.ceil(cy + ry * R); y++)
    for (let x = Math.floor(cx - rx * R); x <= Math.ceil(cx + rx * R); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const a = Math.atan2(ny, nx);
      const t = (((a / (Math.PI * 2)) * n + ph) % 1 + 1) % 1;
      const saw = 1 - Math.abs(t - 0.5) * 2; // 0..1..0
      const lim = 1 + amp * (saw * 2 - 0.6);
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d > lim) continue;
      let v = light(Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, ny)), o.bias ?? 0);
      // spine streaks radiating out
      if (d > 0.35 && Math.abs(t - 0.5) > 0.32) v -= 0.25;
      const c = o.tip && d > lim - 0.16 && saw > 0.45 ? col(o.tip) : flat(r, v);
      img.set(x, y, c);
    }
}

/** Little round spectacles ring (4x4, corners open) around a 2x2 eye centred at (x, y). */
export function specs(img: Img, x: number, y: number, c: Color) {
  const x0 = Math.round(x - 1) - 1;
  const y0 = Math.round(y - 1) - 1;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const edge = i === 0 || i === 3 || j === 0 || j === 3;
      const corner = (i === 0 || i === 3) && (j === 0 || j === 3);
      if (edge && !corner) img.set(x0 + i, y0 + j, c);
    }
}
