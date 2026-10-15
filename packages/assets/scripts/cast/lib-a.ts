// Shared helpers for the cast-a characters (frog, mushroom, fox, owl, crow, moth, goat).
// v1 look: flat 5-step ramp shading lit from the upper-left, 1 px darkened outline, the v1
// semi-transparent ground shadow. Characters are built from parts placed on a small turntable
// (a yaw per direction) so all 8 directions are the same character turning.
import { col, Img, mix, ramp, type Color, type Ramp, type RGBA } from '../lib/img.js';
import type { DrawnDir, FrameIndex } from './types.js';

export { col, Img, mix, ramp, type Color, type Ramp, type RGBA };

export const W = 32;
export const H = 40;
export const CX = 16;
/** Bottom row of the feet (the anchor line y=38 is just below it). */
export const FOOT = 37;

export interface Pose {
  f: FrameIndex;
  /** 0 or -1 (passing frames rise 1 px). */
  bob: number;
  /** -1: the character's right leg forward, +1: left leg forward, 0: together. */
  step: number;
  walking: boolean;
  /** cape/tail lag: 0 idle, 1 on contact frames, 2 on passing frames (trailing cloth). */
  lag: number;
}
const POSES: readonly [number, number][] = [
  [0, 0],
  [0, -1],
  [-1, 0],
  [0, 1],
  [-1, 0],
];
export function pose(f: FrameIndex): Pose {
  const [bob, step] = POSES[f]!;
  return { f, bob, step, walking: f !== 0, lag: f === 0 ? 0 : f % 2 === 1 ? 1 : 2 };
}

export interface View {
  dir: DrawnDir;
  /** degrees: 0 = facing the camera, 90 = facing right, 180 = back. */
  yaw: number;
  s: number; // sin(yaw)
  c: number; // cos(yaw)
  down: boolean;
  dr: boolean;
  right: boolean;
  ur: boolean;
  up: boolean;
  /** Face visible (down, down-right, right). */
  face: boolean;
}
const YAW: Record<DrawnDir, number> = { down: 0, 'down-right': 45, right: 90, 'up-right': 135, up: 180 };
export function view(dir: DrawnDir): View {
  const yaw = YAW[dir];
  const r = (yaw * Math.PI) / 180;
  return {
    dir,
    yaw,
    s: Math.round(Math.sin(r) * 1e6) / 1e6,
    c: Math.round(Math.cos(r) * 1e6) / 1e6,
    down: dir === 'down',
    dr: dir === 'down-right',
    right: dir === 'right',
    ur: dir === 'up-right',
    up: dir === 'up',
    face: yaw <= 90,
  };
}

const D2R = Math.PI / 180;
/** Normalise degrees into (-180, 180]. */
export const wrapDeg = (a: number) => {
  let x = ((a % 360) + 360) % 360;
  if (x > 180) x -= 360;
  return x;
};

/** A point on the turntable. */
export interface Pt {
  x: number;
  y: number;
  /** >0 toward the camera. */
  z: number;
  /** cos of the screen angle (1 = facing camera, -1 = facing away). */
  vis: number;
}
/**
 * Point at angle `th` (deg; 0 = the character's front, +90 = its left side which is screen-right
 * when facing the camera) on a ring of radius r at height y, pushed `fwd` px along the facing direction.
 */
export function at(v: View, r: number, th: number, y: number, fwd = 0, cx = CX): Pt {
  const ph = (th + v.yaw) * D2R;
  const sx = Math.sin(ph);
  const cz = Math.cos(ph);
  return { x: cx + r * sx + fwd * v.s, y, z: r * cz + fwd * v.c, vis: cz };
}
export const R = Math.round;
/** Left pixel of a w-px feature centred at continuous x, mirror-symmetric about CX (so 'left' = mirrored 'right'). */
export function pxl(x: number, w: number): number {
  if (x >= CX) return Math.floor(x - w / 2 + 0.5);
  const m = Math.floor(2 * CX - x - w / 2 + 0.5);
  return 2 * CX - 1 - (m + w - 1);
}

/** v1's flat (non-dithered) ramp pick. */
export function shade(r: Ramp, v: number): RGBA {
  const pal = [r.d2, r.d1, r.b, r.l1, r.l2];
  return pal[Math.max(0, Math.min(4, Math.round(v * 4)))]!;
}
const LX = -0.62;
const LY = -0.78;
/** Sphere light value for a normalised ellipse coordinate (lit from the upper-left). */
export function lit(nx: number, ny: number, bias = 0): number {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return 0.5 + (nx * LX + ny * LY) * 0.42 + nz * 0.14 - 0.04 + bias;
}
/** Turntable angle (deg) and elevation (-1 top .. 1 bottom) of a visible sphere point. */
export function sphereTh(v: View, nx: number, ny: number): { th: number; el: number } {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return { th: wrapDeg(Math.atan2(nx, nz) / D2R - v.yaw), el: ny };
}
/** Shaded ellipse. `paint` may override the colour (return a colour) or veto (return null) per pixel. */
export function ball(img: Img, cx: number, cy: number, rx: number, ry: number, r: Ramp, bias = 0, paint?: (x: number, y: number, nx: number, ny: number, base: RGBA) => Color | null | undefined) {
  img.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    const base = shade(r, lit(nx, ny, bias));
    if (!paint) return base;
    const c = paint(x, y, nx, ny, base);
    return c === undefined ? base : c;
  });
}

export interface LatheHit {
  x: number;
  y: number;
  /** turntable angle of the visible surface point, (-180,180] */
  th: number;
  /** screen-space horizontal normal -1..1 */
  nx: number;
  /** 0 at y0 .. 1 at y1 */
  t: number;
  /** light value 0..1 (lit from the left, darker toward the bottom) */
  v: number;
}
export interface LatheOpts {
  cx?: number;
  y0: number;
  y1: number;
  /** half width (side to side) per row; <=0 skips the row */
  rx: (y: number, t: number) => number;
  /** half depth (front to back) per row; defaults to rx */
  rz?: (y: number, t: number) => number;
  /** horizontal offset per row (sway / lag), applied along the screen x */
  dx?: (y: number, t: number) => number;
  /** restrict to an arc of turntable angles [a, b] (deg, may wrap, a<b) */
  arc?: [number, number];
  /** 'front': draw where the arc is the visible surface; 'back': draw the arc's inside where it is hidden (behind the body) */
  layer?: 'front' | 'back';
  color: (h: LatheHit) => Color | null;
  /** vertical shading drop per row (default 0.012) */
  vdrop?: number;
}
const inArc = (th: number, a: number, b: number) => {
  const t = ((th - a) % 360 + 360) % 360;
  return t <= b - a;
};
/** Draw a surface of revolution (elliptic cross-section) seen from the view's yaw. */
export function lathe(img: Img, v: View, o: LatheOpts) {
  const cx = o.cx ?? CX;
  const layer = o.layer ?? 'front';
  const cy = Math.cos(v.yaw * D2R);
  const sy = Math.sin(v.yaw * D2R);
  const vd = o.vdrop ?? 0.012;
  for (let y = o.y0; y <= o.y1; y++) {
    const t = o.y1 === o.y0 ? 0 : (y - o.y0) / (o.y1 - o.y0);
    const rx = o.rx(y, t);
    if (rx <= 0) continue;
    const rz = o.rz ? o.rz(y, t) : rx;
    const ox = o.dx ? o.dx(y, t) : 0;
    const hw = Math.sqrt((rx * cy) ** 2 + (rz * sy) ** 2);
    const best = new Map<number, { z: number; th: number }>();
    const bestArc = new Map<number, { z: number; th: number }>();
    for (let k = 0; k < 360; k++) {
      const th = k;
      const px = rx * Math.sin(th * D2R);
      const pz = rz * Math.cos(th * D2R);
      const sx = px * cy + pz * sy;
      const z = -px * sy + pz * cy;
      const c = Math.floor(cx + ox + sx);
      const b = best.get(c);
      if (!b || z > b.z) best.set(c, { z, th });
      if (o.arc && inArc(th, o.arc[0], o.arc[1])) {
        const ba = bestArc.get(c);
        if (layer === 'back' ? !ba || z < ba.z : !ba || z > ba.z) bestArc.set(c, { z, th });
      }
    }
    for (const [c, b] of best) {
      const xc = c + 0.5 - cx - ox;
      if (Math.abs(xc) > hw + 1e-6) continue;
      let th = b.th;
      if (o.arc) {
        const vis = inArc(b.th, o.arc[0], o.arc[1]);
        if (layer === 'front' && !vis) continue;
        if (layer === 'back') {
          const ba = bestArc.get(c);
          if (!ba) continue;
          th = ba.th;
        }
      }
      const nx = Math.max(-1, Math.min(1, xc / hw));
      const lv = 0.6 - nx * 0.34 - Math.abs(nx) ** 3 * 0.12 - t * (o.y1 - o.y0) * vd + (layer === 'back' ? -0.25 : 0);
      const col2 = o.color({ x: c, y, th: wrapDeg(th), nx, t, v: lv });
      if (col2) img.set(c, y, col2);
    }
  }
}

/** Thick line (square brush). */
export function stroke(img: Img, x0: number, y0: number, x1: number, y1: number, w: number, c: Color | ((x: number, y: number, t: number) => Color)) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) * 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const lx = pxl(x, w);
    const ly = Math.floor(y - w / 2 + 0.5);
    for (let j = 0; j < w; j++)
      for (let k = 0; k < w; k++) {
        const cc = typeof c === 'function' ? c(lx + k, ly + j, t) : c;
        img.set(lx + k, ly + j, cc);
      }
  }
}

/** Composition of parts drawn back-to-front; parts with `ol` get their own outline (internal lines). */
export class Comp {
  private parts: { z: number; i: number; fn: (img: Img) => void; ol: number }[] = [];
  add(z: number, fn: (img: Img) => void, ol: number | boolean = false) {
    this.parts.push({ z, i: this.parts.length, fn, ol: ol === true ? 0.72 : ol === false ? 0 : ol });
    return this;
  }
  render(into?: Img): Img {
    const img = into ?? new Img(W, H);
    const ps = [...this.parts].sort((a, b) => a.z - b.z || a.i - b.i);
    for (const p of ps) {
      if (!p.ol) p.fn(img);
      else {
        const t = new Img(W, H);
        p.fn(t);
        t.outline({ darken: p.ol });
        img.blit(t, 0, 0);
      }
    }
    return img;
  }
}

/** Final pass: v1 outline + the ground shadow under the feet. */
export function finish(body: Img, shadowRx = 7): Img {
  body.outline({ darken: 0.72 });
  const out = new Img(W, H);
  out.ellipse(CX, FOOT + 0.5, shadowRx, 1.8, [12, 6, 20, 90]);
  out.blit(body, 0, 0);
  return out;
}

/** Forward offset of a foot (side -1 = right, +1 = left): +1 leading, -1 trailing, 0 together. */
export const legFwd = (p: Pose, side: number) => (p.step === 0 ? 0 : p.step === -side ? 1 : -1);
/** Arms swing opposite the legs. */
export const armFwd = (p: Pose, side: number) => -legFwd(p, side);

export interface FeetOpts {
  /** half distance between the feet centres in the front view */
  sep: number;
  /** leg top (hip) y, before bob */
  hip: number;
  leg?: Ramp;
  legW?: number;
  boot: Ramp;
  bootW?: number;
  bootH?: number;
  stride?: number;
  /** base z of the legs (default -3: behind the body) */
  z?: number;
  cx?: number;
  /** toe colour/shape: 'boot' (default) or 'webbed' (3 toes) or 'talon' */
  kind?: 'boot' | 'webbed' | 'talon';
}
/**
 * Two stubby legs + feet. Front/back views: feet side by side, the trailing foot lifts 1 px.
 * Side views: feet split along the facing direction.
 */
export function feet(comp: Comp, v: View, p: Pose, o: FeetOpts) {
  const legW = o.legW ?? 3;
  const bootW = o.bootW ?? 4;
  const bootH = o.bootH ?? 2;
  const stride = o.stride ?? 2.5;
  const cx = o.cx ?? CX;
  for (const side of [-1, 1]) {
    const fw = legFwd(p, side);
    const pt = at(v, o.sep, side * 90, FOOT, fw * stride, cx);
    const lift = fw < 0 ? 1 : 0;
    const fy = FOOT - lift;
    const hip = o.hip + p.bob;
    const z = (o.z ?? -3) + pt.z * 0.05;
    comp.add(z, (img) => {
      const far = pt.vis < -0.3 || (v.right && side > 0);
      if (o.leg) {
        const lx = pxl(pt.x, legW);
        for (let y = hip; y <= fy - bootH; y++) for (let i = 0; i < legW; i++) img.set(lx + i, y, shade(o.leg, 0.62 - i * 0.18 - (far ? 0.25 : 0)));
      }
      const toe = v.right || v.dr ? 1 : 0;
      const bx = pxl(pt.x, bootW) - (v.right ? 0 : 0);
      for (let j = 0; j < bootH; j++) {
        const yy = fy - bootH + 1 + j;
        const extra = j === bootH - 1 ? toe : 0;
        for (let i = 0; i < bootW + extra; i++) {
          let c: RGBA = j === 0 ? (i === 0 ? o.boot.l1 : o.boot.b) : i === 0 ? o.boot.b : o.boot.d1;
          if (far) c = mix(c, '#160d2a', 0.25);
          img.set(bx + i, yy, c);
        }
      }
      if (o.kind === 'webbed' || o.kind === 'talon') {
        // toe notches on the bottom row (front views)
        if (!v.right) {
          const yy = fy;
          img.set(bx + 1, yy, o.boot.d2);
          if (bootW > 3) img.set(bx + bootW - 2, yy, o.boot.d2);
        }
      }
    });
  }
}

/** Hand position for an arm: shoulder ring radius r at height y (bob applied by caller). */
export function hand(v: View, p: Pose, side: number, r: number, y: number, swing = 1.5, cx = CX): Pt {
  return at(v, r, side * 90, y, armFwd(p, side) * swing, cx);
}

/** Arm from shoulder to hand: sleeve (w px) + a 2x2 hand/paw. */
export function arm(img: Img, sh: Pt, hd: Pt, sleeve: Ramp, paw: Ramp | null, w = 2, far = false) {
  const k = far ? -0.2 : 0;
  stroke(img, sh.x, sh.y, hd.x, hd.y - 1, w, (x) => shade(sleeve, 0.55 + k - (x - hd.x) * 0.08));
  if (paw) {
    const lx = pxl(hd.x, 2);
    img.set(lx, hd.y, shade(paw, 0.7 + k));
    img.set(lx + 1, hd.y, shade(paw, 0.5 + k));
    img.set(lx, hd.y + 1, shade(paw, 0.45 + k));
    img.set(lx + 1, hd.y + 1, shade(paw, 0.25 + k));
  }
}

/** Round eye: dark iris w x h with a 1 px highlight top-left. */
export function eyeDot(img: Img, x: number, y: number, w: number, h: number, color: Color = '#140c1c', glint: Color | null = '#fff6e0') {
  img.rect(x, y, w, h, color);
  if (glint && w >= 2 && h >= 2) img.set(x, y, glint);
}

/** The v1 warm lantern (5 px wide glass). */
export function lantern(img: Img, x: number, y: number, frame = '#2a2632') {
  img.vline(x, y - 1, y, frame);
  img.rect(x - 2, y + 1, 5, 1, frame);
  const glow = ['#c06a24', '#eda040', '#ffd27a', '#fff0c0'];
  for (let yy = y + 2; yy < y + 6; yy++)
    for (let xx = x - 2; xx <= x + 2; xx++) {
      const v = 0.95 - Math.abs(xx - x) * 0.22 - (yy - y - 2) * 0.08;
      img.set(xx, yy, glow[Math.max(0, Math.min(3, Math.round(v * 3)))]!);
    }
  img.vline(x - 2, y + 2, y + 5, frame);
  img.vline(x + 2, y + 2, y + 5, frame);
  img.rect(x - 2, y + 6, 5, 1, frame);
}

/** Point on an ellipsoid head (centre hx,hy; radii rx,ry) at turntable angle th and elevation el (-1 top .. 1 bottom). */
export function onHead(v: View, hx: number, hy: number, rx: number, ry: number, th: number, el: number): Pt {
  const ph = (th + v.yaw) * D2R;
  const k = Math.sqrt(Math.max(0, 1 - el * el));
  return { x: hx + rx * k * Math.sin(ph), y: hy + ry * el, z: rx * k * Math.cos(ph), vis: Math.cos(ph) };
}

/** A chain of shaded balls along a 3D path (tails). Returns [behind, inFront] draw functions split by z. */
export function chain(v: View, pts: { r: number; th: number; y: number; rad: number; ramp: Ramp; fwd?: number }[], cx = CX): [(img: Img) => void, (img: Img) => void] {
  const placed = pts.map((q) => ({ q, pt: at(v, q.r, q.th, q.y, q.fwd ?? 0, cx) }));
  const drawSet = (front: boolean) => (img: Img) => {
    const sel = placed.filter((e) => (e.pt.z > 0.5) === front);
    // far-to-near along the camera, then along the path
    for (const e of sel) ball(img, e.pt.x, e.pt.y, e.q.rad, e.q.rad, e.q.ramp, 0.02);
  };
  return [drawSet(false), drawSet(true)];
}
