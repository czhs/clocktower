// Minimal RGBA pixel canvas used by the deterministic asset generator.
import { PNG } from 'pngjs';

export type RGBA = readonly [number, number, number, number];

const hexCache = new Map<string, RGBA>();
/** '#rrggbb' or '#rrggbbaa' -> RGBA. */
export function hex(s: string): RGBA {
  let c = hexCache.get(s);
  if (c) return c;
  const h = s.replace('#', '');
  c = [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255,
  ] as const;
  hexCache.set(s, c);
  return c;
}
export type Color = string | RGBA;
export const col = (c: Color): RGBA => (typeof c === 'string' ? hex(c) : c);

export function mix(a: Color, b: Color, t: number): RGBA {
  const x = col(a);
  const y = col(b);
  return [
    Math.round(x[0] + (y[0] - x[0]) * t),
    Math.round(x[1] + (y[1] - x[1]) * t),
    Math.round(x[2] + (y[2] - x[2]) * t),
    Math.round(x[3] + (y[3] - x[3]) * t),
  ] as const;
}
export function withAlpha(c: Color, a: number): RGBA {
  const x = col(c);
  return [x[0], x[1], x[2], Math.round(a * 255)] as const;
}
export function toHex(c: Color): string {
  const x = col(c);
  return '#' + [x[0], x[1], x[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Hue-shifted ramp: shadows drift to violet, highlights to warm ivory (gothic palette). */
export interface Ramp {
  o: RGBA; // outline
  d2: RGBA;
  d1: RGBA;
  b: RGBA;
  l1: RGBA;
  l2: RGBA;
}
export function ramp(base: Color): Ramp {
  return {
    o: mix(base, '#0b0714', 0.72),
    d2: mix(base, '#160d2a', 0.5),
    d1: mix(base, '#1d1436', 0.26),
    b: col(base),
    l1: mix(base, '#fff1cc', 0.2),
    l2: mix(base, '#fff6e0', 0.4),
  };
}

export class Img {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  inb(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x: number, y: number): RGBA {
    if (!this.inb(x, y)) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    const d = this.data;
    return [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!];
  }
  alpha(x: number, y: number): number {
    if (!this.inb(x, y)) return 0;
    return this.data[(y * this.w + x) * 4 + 3]!;
  }
  /** Overwrite pixel. */
  set(x: number, y: number, c: Color) {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inb(x, y)) return;
    const v = col(c);
    const i = (y * this.w + x) * 4;
    this.data[i] = v[0];
    this.data[i + 1] = v[1];
    this.data[i + 2] = v[2];
    this.data[i + 3] = v[3];
  }
  /** Source-over blend. */
  blend(x: number, y: number, c: Color, a = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inb(x, y)) return;
    const v = col(c);
    const sa = (v[3] / 255) * a;
    if (sa <= 0) return;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    const da = d[i + 3]! / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    d[i] = (v[0] * sa + d[i]! * da * (1 - sa)) / oa;
    d[i + 1] = (v[1] * sa + d[i + 1]! * da * (1 - sa)) / oa;
    d[i + 2] = (v[2] * sa + d[i + 2]! * da * (1 - sa)) / oa;
    d[i + 3] = oa * 255;
  }
  /** Darken/lighten an existing opaque pixel by mixing toward a colour. */
  tint(x: number, y: number, c: Color, t: number) {
    if (!this.inb(x, y) || this.alpha(x, y) === 0) return;
    const p = this.get(x, y);
    const m = mix(p, c, t);
    this.set(x, y, [m[0], m[1], m[2], p[3]]);
  }
  rect(x: number, y: number, w: number, h: number, c: Color) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  blendRect(x: number, y: number, w: number, h: number, c: Color, a = 1) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.blend(i, j, c, a);
  }
  hline(x0: number, x1: number, y: number, c: Color) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c);
  }
  vline(x: number, y0: number, y1: number, c: Color) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Color) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  /** Filled ellipse; `fn` may choose the colour per pixel (for shading). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color | ((x: number, y: number, nx: number, ny: number) => Color | null)) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const cc = typeof c === 'function' ? c(x, y, nx, ny) : c;
        if (cc) this.set(x, y, cc);
      }
  }
  blendEllipse(cx: number, cy: number, rx: number, ry: number, c: Color, a: number) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.blend(x, y, c, a);
      }
  }
  /** Fill a polygon (even-odd, pixel centres). */
  poly(pts: [number, number][], c: Color | ((x: number, y: number) => Color | null)) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i]!;
        const [x1, y1] = pts[(i + 1) % pts.length]!;
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil(xs[k]! - 0.5); x <= Math.floor(xs[k + 1]! - 0.5); x++) {
          const cc = typeof c === 'function' ? c(x, y) : c;
          if (cc) this.set(x, y, cc);
        }
    }
  }
  /** Draw `src` onto this image (source-over). */
  blit(src: Img, dx: number, dy: number, opts: { flipX?: boolean; alpha?: number; sx?: number; sy?: number; sw?: number; sh?: number } = {}) {
    const sx = opts.sx ?? 0;
    const sy = opts.sy ?? 0;
    const sw = opts.sw ?? src.w;
    const sh = opts.sh ?? src.h;
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        const px = opts.flipX ? sx + sw - 1 - x : sx + x;
        const c = src.get(px, sy + y);
        if (c[3] === 0) continue;
        this.blend(dx + x, dy + y, c, opts.alpha ?? 1);
      }
  }
  /** Copy (no blending) a region from src. */
  copy(src: Img, dx: number, dy: number, sx = 0, sy = 0, sw = src.w, sh = src.h) {
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        if (!this.inb(dx + x, dy + y)) continue;
        const i = ((sy + y) * src.w + sx + x) * 4;
        const o = ((dy + y) * this.w + dx + x) * 4;
        for (let k = 0; k < 4; k++) this.data[o + k] = src.data[i + k]!;
      }
  }
  flipped(): Img {
    const out = new Img(this.w, this.h);
    out.blit(this, 0, 0, { flipX: true });
    return out;
  }
  /**
   * Selective outline: transparent pixels 4-adjacent to opaque ones get a darkened version of
   * that neighbour (or a fixed colour). `skip` suppresses outline on a side (e.g. 'up' means
   * no outline is added ABOVE opaque pixels).
   */
  outline(opts: { color?: Color; darken?: number; skip?: ('up' | 'down' | 'left' | 'right')[]; minAlpha?: number } = {}) {
    const src = new Uint8ClampedArray(this.data);
    const a = (x: number, y: number) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[(y * this.w + x) * 4 + 3]!);
    const min = opts.minAlpha ?? 100;
    const skip = new Set(opts.skip ?? []);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (a(x, y) !== 0) continue;
        // neighbour that would "own" this outline pixel
        const cand: [number, number, string][] = [
          [x, y + 1, 'up'], // opaque below -> outline above it
          [x, y - 1, 'down'],
          [x + 1, y, 'left'],
          [x - 1, y, 'right'],
        ];
        for (const [nx, ny, side] of cand) {
          if (skip.has(side as 'up')) continue;
          if (a(nx, ny) >= min) {
            const i = (ny * this.w + nx) * 4;
            const nc: RGBA = [src[i]!, src[i + 1]!, src[i + 2]!, 255];
            this.set(x, y, opts.color ? col(opts.color) : mix(nc, '#08040e', opts.darken ?? 0.7));
            break;
          }
        }
      }
  }
  clone(): Img {
    const o = new Img(this.w, this.h);
    o.data.set(this.data);
    return o;
  }
  /** Multiply all pixels' alpha. */
  fade(a: number) {
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = this.data[i]! * a;
  }
  toPNG(): Buffer {
    const png = new PNG({ width: this.w, height: this.h });
    png.data = Buffer.from(this.data.buffer, this.data.byteOffset, this.data.byteLength);
    return PNG.sync.write(png, { colorType: 6 });
  }
  static fromPNG(buf: Buffer): Img {
    const png = PNG.sync.read(buf);
    const img = new Img(png.width, png.height);
    img.data.set(png.data);
    return img;
  }
  /** Nearest-neighbour downscale by an integer factor (for previews). */
  downscale(f: number): Img {
    const o = new Img(Math.floor(this.w / f), Math.floor(this.h / f));
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, this.get(x * f, y * f));
    return o;
  }
}

// ---------------------------------------------------------------------------------------
// Deterministic noise

export function hash(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Value noise; if `period` is given, the lattice wraps (tileable texture). */
export function vnoise(x: number, y: number, cell: number, seed = 0, period = 0): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smooth(gx - x0);
  const ty = smooth(gy - y0);
  const p = period > 0 ? Math.round(period / cell) : 0;
  const w = (v: number) => (p > 0 ? ((v % p) + p) % p : v);
  const a = hash(w(x0), w(y0), seed);
  const b = hash(w(x0 + 1), w(y0), seed);
  const c = hash(w(x0), w(y0 + 1), seed);
  const d = hash(w(x0 + 1), w(y0 + 1), seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
export function fbm(x: number, y: number, cell: number, seed = 0, period = 0, oct = 3): number {
  let s = 0;
  let amp = 1;
  let tot = 0;
  for (let o = 0; o < oct; o++) {
    s += vnoise(x, y, cell, seed + o * 17, period) * amp;
    tot += amp;
    amp *= 0.5;
    cell /= 2;
    if (cell < 1) break;
  }
  return s / tot;
}
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither threshold in [0,1). */
export function bayer(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
}
/** Pick from a ramp of colours by value v in [0,1] with ordered dithering. */
export function dpick(colors: readonly Color[], v: number, x: number, y: number): RGBA {
  const n = colors.length;
  const f = Math.max(0, Math.min(0.9999, v)) * (n - 1);
  const i = Math.floor(f);
  const t = f - i;
  return col(t > bayer(x, y) ? colors[Math.min(n - 1, i + 1)]! : colors[i]!);
}
