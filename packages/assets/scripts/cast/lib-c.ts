// Shared helpers for the cast-c mascots (honk, chonk, polly, clarabelle, requin, progress,
// preservation). v1 conventions: flat 5-step ramp shading lit from the upper-left, 1 px dark
// outline (darken 0.72), semi-transparent ground shadow that never bobs.
import { CAST_FH, CAST_FW } from '../../src/cast.js';
import { Img, mix, ramp, type Color, type Ramp, type RGBA } from '../lib/img.js';
import type { DrawnDir, FrameIndex } from './types.js';

export { Img, mix, ramp, type Color, type Ramp, type RGBA };
export const FW = CAST_FW;
export const FH = CAST_FH;
/** Bottom row of the feet (ground contact); the outline lands on row 38 = anchor. */
export const GY = 37;

export interface Pose {
  /** 0 or -1 (raised one pixel on the passing frames). */
  bob: number;
  /** -1 left foot forward, +1 right foot forward, 0 together. */
  step: number;
  /** Waddle lean (-1/0/+1) for the geese; 0 for everybody else. */
  sway: number;
  frame: FrameIndex;
}
export function pose(frame: FrameIndex, waddle = false): Pose {
  const step = frame === 1 ? -1 : frame === 3 ? 1 : 0;
  const bob = frame === 2 || frame === 4 ? -1 : 0;
  return { bob, step, sway: waddle ? step : 0, frame };
}

export const newFrame = () => new Img(FW, FH);

/** Flat ramp pick (v in 0..1), like v1's characters (no dithering on tiny sprites). */
export function sh(r: Ramp, v: number): RGBA {
  const pal = [r.d2, r.d1, r.b, r.l1, r.l2];
  return pal[Math.max(0, Math.min(4, Math.round(v * 4)))]!;
}

/** Light value for a normalised ellipse position (upper-left light). */
export function lightAt(nx: number, ny: number, bias = 0): number {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return 0.52 - nx * 0.3 - ny * 0.34 + nz * 0.12 + bias;
}

/** Shaded ellipse. `fn` may override per pixel (return null to keep the default shade). */
export function ball(img: Img, cx: number, cy: number, rx: number, ry: number, r: Ramp, bias = 0, fn?: (x: number, y: number, nx: number, ny: number, v: number) => Color | null | undefined) {
  img.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    const v = lightAt(nx, ny, bias);
    const o = fn ? fn(x, y, nx, ny, v) : null;
    return o ?? sh(r, v);
  });
}

/** Draw into a temporary layer, outline it, then composite it (gives internal outlines between parts). */
export function layer(img: Img, draw: (l: Img) => void, darken = 0.72) {
  const l = new Img(img.w, img.h);
  draw(l);
  l.outline({ darken });
  img.blit(l, 0, 0);
}

/** Final outline + v1 ground shadow (drawn only under/around the sprite, never bobbing). */
export function finish(img: Img, rx = 7, ry = 1.8, cx = 16) {
  img.outline({ darken: 0.72 });
  img.ellipse(cx, GY + 0.5, rx, ry, (x, y) => (img.alpha(x, y) > 0 ? null : ([12, 6, 20, 90] as const)));
}

export function mirror(src: Img): Img {
  const o = new Img(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) o.set(src.w - 1 - x, y, src.get(x, y));
  return o;
}
export const MIRROR_OF: Record<'left' | 'up-left' | 'down-left', DrawnDir> = { left: 'right', 'up-left': 'up-right', 'down-left': 'down-right' };

export const INK = '#1a1020';
export const GLINT = '#f4ecd8';

/** Set a list of [x, y] pixels relative to (ox, oy). */
export function pix(img: Img, ox: number, oy: number, pts: readonly (readonly [number, number])[], c: Color) {
  for (const [x, y] of pts) img.set(ox + x, oy + y, c);
}
/** Pixel stamp from a string grid; chars map to colours ('.' / ' ' = skip). */
export function stamp(img: Img, ox: number, oy: number, rows: readonly string[], cols: Record<string, Color>, flip = false) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]!;
      const c = cols[ch];
      if (!c) continue;
      img.set(ox + (flip ? row.length - 1 - i : i), oy + j, c);
    }
  });
}
