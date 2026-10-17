// UI kit (owner: UI lead; docs/UI.md §2 language, §3 contract). Shared, deterministic pixel-art helpers every UI
// group uses to author the Clocktower v2 UI in the pixel3d style. Pure JS (no three.js): runs in the browser
// (scenes/ui-*.js, scenes/ui-bake.js) and in Node. Three.js glue (layers over the 3D frame) lives in src/ui/layer.js.
//
//   import { PixelImage, tokens, drawText, textWidth, drawBox, ramp, frameAt, packAtlas } from '../src/ui/kit.js';
//
// Units: 1 UI px = 1 scene texel (640x360 internal, integer-upscaled by the pipeline). Never scale UI art by a
// non-integer, never rotate it, never filter it. Colours are sRGB '#rrggbb' / '#rrggbbaa' strings or [r,g,b,a].
//
// Contents
//   PixelImage            RGBA buffer: set/get/rect/hline/vline/line/dotted/disc/ellipse/ring/blit/outline/flip/crop
//   hex / rgba / mix      colour parsing + sRGB mixing;  ramp(mid) -> {hi, mid, sh, line} (OKLab, warm lights / cool shadows)
//   TOKENS, tokens(tod)   colour tokens, day / golden / night variants (docs/UI.md §2.6)
//   FONTS, drawText, textWidth, wrapText   bitmap fonts 'body' (cap 6, x 4, desc 2) and 'tiny' (3x5 caps/digits)
//   FRAMES, drawBox       procedural 9-slice frames (panel, raised, pressed, sunk, parchment, gold, bubble, chip, ...)
//   nineSlice             9-slice from baked art (panels group)
//   GRID_HZ, holdsFor, frameAt, popScale, dissolve   stepped animation on the 30 Hz game grid
//   packAtlas, atlasJson  shelf packer + v2-shaped manifest (frame names kept verbatim)

// ------------------------------------------------------------------------------------------------ colour
const _hexCache = new Map();
/** '#rgb' | '#rrggbb' | '#rrggbbaa' | [r,g,b,a?] -> [r,g,b,a] (0..255). */
export function rgba(c) {
  if (Array.isArray(c)) return c.length === 4 ? c : [c[0], c[1], c[2], 255];
  if (c && typeof c === 'object' && 'r' in c) return [c.r, c.g, c.b, c.a ?? 255];
  let v = _hexCache.get(c);
  if (v) return v;
  let s = String(c).replace('#', '');
  if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
  v = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255];
  _hexCache.set(c, v);
  return v;
}
export const hex = (c) => '#' + rgba(c).slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
/** Mix two colours in sRGB (k = 0 -> a, 1 -> b); result rounded to bytes. */
export function mix(a, b, k) {
  const A = rgba(a), B = rgba(b);
  return [0, 1, 2, 3].map((i) => Math.round(A[i] + (B[i] - A[i]) * k));
}
export const withAlpha = (c, a) => { const v = rgba(c); return [v[0], v[1], v[2], Math.round(a)]; };

// OKLab (Björn Ottosson) for ramp derivation
const s2l = (u) => { u /= 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); };
const l2s = (u) => { u = Math.max(0, Math.min(1, u)); return Math.round(255 * (u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055)); };
export function toOklab(c) {
  const [R, G, B] = rgba(c), r = s2l(R), g = s2l(G), b = s2l(B);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
export function fromOklab([L, a, b], alpha = 255) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [l2s(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), l2s(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    l2s(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s), alpha];
}
/**
 * 3-tone ramp + line from one mid colour, following ART_DIRECTION (warm light, cool shadow, outline = darker,
 * cooler shade of the object's own colour, never black). opts: {light 0.09, dark 0.11, line 0.26}.
 */
export function ramp(mid, { light = 0.09, dark = 0.11, line = 0.26 } = {}) {
  const [L, a, b] = toOklab(mid);
  const hi = fromOklab([Math.min(0.97, L + light), a * 0.92 + 0.004, b * 0.92 + 0.018]);          // lighter, warmer, a bit less chroma
  const sh = fromOklab([Math.max(0.12, L - dark), a * 0.95 + 0.006, b * 0.9 - 0.03]);              // darker, cooler (toward violet-blue)
  const ln = fromOklab([Math.max(0.10, L - line), a * 0.7 + 0.008, b * 0.6 - 0.035]);              // outline: darker + cooler again
  return { hi: hex(hi), mid: hex(mid), sh: hex(sh), line: hex(ln) };
}

// ------------------------------------------------------------------------------------------------ tokens
// docs/UI.md §2.6. Derived from the v2 theme (apps/client/src/ui/common/theme.css: Panel ink #211f2c, Frame iron
// #454250, Parchment #e4d8ba, Focus gold #d5b56a, good #7fa8d8, evil #e0625a) re-tuned to ART_DIRECTION: no pure
// black/white, warm lights, cool (violet/slate) shadows, every line a darker+cooler shade of its own fill.
const DAY = {
  outline: '#1A1524',     // outermost UI line (darkest token; mauve-navy, never black)
  shadow: '#120E19',      // 1-px drop shadow under floating UI
  ink: '#2B2536', inkRaised: '#3A3247', inkSunk: '#211C2B',     // panel body, rows/buttons, wells/inputs
  iron: '#5E566C', ironHi: '#857A90', ironSh: '#3F3849',         // keyline + bevel
  text: '#EEE3C8', textDim: '#B9AEBF', textInk: '#2E2838',       // parchment text on ink / muted / text on parchment
  parchment: '#E6D7B2', parchmentHi: '#F4ECD4', parchmentSh: '#C2AE86', parchmentLine: '#7C6546',
  gold: '#E3BD62', goldHi: '#F7E0A0', goldSh: '#A57B36', goldLine: '#5E4220',
  good: '#8DB8E6', evil: '#E36E5E', ok: '#96C77E', warn: '#E8A24A', danger: '#D9584A',
  st: '#EBC96B', stViolet: '#8A5ACF',                            // Storyteller label gold / robe violet
  ghost: '#CFE6EE', ghostSh: '#7FA6B8',                          // ghost label / mist
  talk: '#FFE7A3', self: '#FF9A8F',                              // talking outline + glyph (others / yourself on air)
  labelText: '#F2E8CF', labelLine: '#1E1828',                    // in-world name labels
  bubble: '#2B2536', bubbleEdge: '#8C7650', bubbleHi: '#3D3548',  // speech bubble (v2 #211f2c / #8a7448 / #343042)
  scrim: [20, 15, 30, 150],                                      // the ONE translucent token: full-screen dim behind modals
};
const NIGHT = {
  ...DAY,
  outline: '#13121F', shadow: '#0C0B16',
  ink: '#221F33', inkRaised: '#2E2A44', inkSunk: '#1A1828',
  iron: '#4E5170', ironHi: '#6E7396', ironSh: '#33354B',
  text: '#E2DDD3', textDim: '#A3A3BA', labelText: '#E4E0D6', labelLine: '#141325',
  gold: '#D9B766', goldHi: '#EED9A2', goldSh: '#94743E', goldLine: '#4A3A26',
  st: '#E2C473', ghost: '#BFDCEB',
  bubble: '#221F33', bubbleEdge: '#7A6A55', bubbleHi: '#33304A',
  scrim: [12, 11, 26, 165],
};
const GOLDEN = { ...DAY, ink: '#2D2433', inkRaised: '#3D3145', iron: '#665663', ironHi: '#8E7A86', text: '#F3E2C2', labelText: '#F6E6C8' };
export const TOKENS = { day: DAY, golden: GOLDEN, night: NIGHT };
/** Token set for a time-of-day preset name (sky.js: morning|noon|golden|night). */
export const tokens = (tod = 'noon') => (tod === 'night' ? NIGHT : tod === 'golden' ? GOLDEN : DAY);

/** v2 pin colours (social.json meta.pinColorHex) as 3-tone ramps. Keys = v2 PinColor ids. */
export const PIN_HEX = { gold: '#e6b632', crimson: '#c42c3c', violet: '#8a52cc', teal: '#22a6b4', green: '#5cb23a', orange: '#e8701e', white: '#ece6da', black: '#2c2636' };
export const PIN_COLORS = Object.keys(PIN_HEX);
export const PIN_RAMPS = Object.fromEntries(PIN_COLORS.map((k) => [k, k === 'white' ? { hi: '#F4EEE2', mid: '#DCD3C4', sh: '#A79CB0', line: '#5B5168' }
  : k === 'black' ? { hi: '#5A5168', mid: '#3A3346', sh: '#2A2434', line: '#A49CB4' } : ramp(PIN_HEX[k])]));

// ------------------------------------------------------------------------------------------------ PixelImage
export class PixelImage {
  constructor(w, h, data = null) {
    this.w = w | 0; this.h = h | 0;
    this.data = data || new Uint8ClampedArray(this.w * this.h * 4);
  }
  static from(imageData) { return new PixelImage(imageData.width, imageData.height, new Uint8ClampedArray(imageData.data)); }
  clone() { return new PixelImage(this.w, this.h, new Uint8ClampedArray(this.data)); }
  clear() { this.data.fill(0); return this; }
  fill(c) { const v = rgba(c); for (let i = 0; i < this.data.length; i += 4) this.data.set(v, i); return this; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  /** [r,g,b,a] at (x, y) (transparent outside). */
  get(x, y) { if (!this.inside(x, y)) return [0, 0, 0, 0]; const i = (y * this.w + x) * 4, d = this.data; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; }
  alpha(x, y) { return this.inside(x, y) ? this.data[(y * this.w + x) * 4 + 3] : 0; }
  /** Plot one pixel. Opaque colours replace; partial alpha composites "over" (only glows / scrims use it). */
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const v = rgba(c), a = v[3];
    if (a <= 0) return this;
    const i = (y * this.w + x) * 4, d = this.data;
    if (a >= 255 || d[i + 3] === 0) { d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = a; return this; }
    const k = a / 255, da = d[i + 3] / 255, oa = k + da * (1 - k);
    for (let j = 0; j < 3; j++) d[i + j] = (v[j] * k + d[i + j] * da * (1 - k)) / oa;
    d[i + 3] = oa * 255;
    return this;
  }
  erase(x, y) { if (this.inside(x, y)) this.data[(y * this.w + x) * 4 + 3] = 0; return this; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); return this; }
  hline(x, y, w, c) { return this.rect(x, y, w, 1, c); }
  vline(x, y, h, c) { return this.rect(x, y, 1, h, c); }
  /** Rectangle outline (1 px). */
  frame(x, y, w, h, c) { this.hline(x, y, w, c); this.hline(x, y + h - 1, w, c); this.vline(x, y, h, c); this.vline(x + w - 1, y, h, c); return this; }
  /** Bresenham line (1 px, no AA). */
  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
    return this;
  }
  /** Dotted / dashed line: `on` px drawn, `off` px skipped, starting `phase` px into the pattern (marching ants). */
  dotted(x0, y0, x1, y1, c, { on = 1, off = 2, phase = 0, skipStart = 0, skipEnd = 0 } = {}) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    const per = on + off;
    for (let k = skipStart; k <= n - skipEnd; k++) {
      if (((k + phase) % per + per) % per >= on) continue;
      const t = n ? k / n : 0;
      this.set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c);
    }
    return this;
  }
  /** Filled pixel disc of radius r (centre on a pixel centre when cx, cy are integers + 0.5, else a pixel corner). */
  disc(cx, cy, r, fill, line = null) {
    const r2 = r * r, ri = Math.ceil(r) + 1;
    for (let y = Math.floor(cy - ri); y <= Math.ceil(cy + ri); y++)
      for (let x = Math.floor(cx - ri); x <= Math.ceil(cx + ri); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, fill);
      }
    if (line) this.outline(line, { only: [cx - ri - 1, cy - ri - 1, 2 * ri + 3, 2 * ri + 3] });
    return this;
  }
  /** Filled ellipse (rx, ry radii), same pixel rules as disc. */
  ellipse(cx, cy, rx, ry, fill) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, fill);
      }
    return this;
  }
  /** 1-px ellipse ring (pixels inside rx/ry whose 4-neighbour falls outside). */
  ring(cx, cy, rx, ry, c) {
    const ins = (x, y) => { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy <= 1; };
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++)
        if (ins(x, y) && (!ins(x + 1, y) || !ins(x - 1, y) || !ins(x, y + 1) || !ins(x, y - 1))) this.set(x, y, c);
    return this;
  }
  /**
   * Copy src into this at (dx, dy). opts: {sx, sy, sw, sh} source rect, flipX, flipY, tint (replaces colour, keeps
   * alpha), scale (INTEGER only; >1 makes "big pixels" and is allowed for previews/sheets only, never in-game).
   */
  blit(src, dx, dy, { sx = 0, sy = 0, sw = src.w, sh = src.h, flipX = false, flipY = false, tint = null, scale = 1 } = {}) {
    dx |= 0; dy |= 0; scale = Math.max(1, scale | 0);
    const T = tint ? rgba(tint) : null;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const px = sx + (flipX ? sw - 1 - x : x), py = sy + (flipY ? sh - 1 - y : y);
      const v = src.get(px, py);
      if (!v[3]) continue;
      const c = T ? [T[0], T[1], T[2], v[3]] : v;
      if (scale === 1) this.set(dx + x, dy + y, c);
      else this.rect(dx + x * scale, dy + y * scale, scale, scale, c);
    }
    return this;
  }
  /**
   * 1-px outline around every opaque pixel (alpha >= 128) in colour c, on transparent pixels only.
   * diag = true also fills the 4 diagonal neighbours (box outline; use for text and round icons).
   * only = [x, y, w, h] restricts the scan.
   */
  outline(c, { diag = false, only = null } = {}) {
    const [x0, y0, w, h] = only ? only.map((v) => v | 0) : [0, 0, this.w, this.h];
    const hits = [];
    const solid = (x, y) => this.alpha(x, y) >= 128;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (!this.inside(x, y) || this.alpha(x, y) > 0) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1) ||
        (diag && (solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1)))) hits.push(x, y);
    }
    for (let i = 0; i < hits.length; i += 2) this.set(hits[i], hits[i + 1], c);
    return this;
  }
  crop(x, y, w, h) { const o = new PixelImage(w, h); o.blit(this, 0, 0, { sx: x, sy: y, sw: w, sh: h }); return o; }
  /** Bounding box of opaque pixels {x, y, w, h} (null if empty). */
  bbox() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.alpha(x, y)) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  /** Set of distinct opaque colours (hex) — palette audits (≤ 3 tones per material + line + rim). */
  colors() { const s = new Set(); for (let i = 0; i < this.data.length; i += 4) if (this.data[i + 3]) s.add(hex([this.data[i], this.data[i + 1], this.data[i + 2]])); return s; }
}

// ------------------------------------------------------------------------------------------------ fonts
// 'body': cap height 6, x-height 4, descender 2 (rows 0..7, baseline under row 5), proportional, 1 px tracking,
// line advance 9 (10 with an outline). 'tiny': 3x5 caps + digits (v2 scripts/fx/font.ts glyphs, upper-cased) for
// badges, seat numbers and counters. docs/UI.md §2.4. Unknown characters: accents are stripped (NFD), then '?'.
function G(rows, top = 0) { return { rows: rows.split('/'), top }; }
const BODY_GLYPHS = {
  A: G('.##./#..#/#..#/####/#..#/#..#'), B: G('###./#..#/###./#..#/#..#/###.'), C: G('.###/#.../#.../#.../#.../.###'),
  D: G('###./#..#/#..#/#..#/#..#/###.'), E: G('####/#.../###./#.../#.../####'), F: G('####/#.../###./#.../#.../#...'),
  G: G('.###/#.../#.../#.##/#..#/.###'), H: G('#..#/#..#/####/#..#/#..#/#..#'), I: G('###/.#./.#./.#./.#./###'),
  J: G('..##/...#/...#/...#/#..#/.##.'), K: G('#..#/#.#./##../#.#./#..#/#..#'), L: G('#.../#.../#.../#.../#.../####'),
  M: G('#...#/##.##/#.#.#/#...#/#...#/#...#'), N: G('#..#/##.#/#.##/#..#/#..#/#..#'), O: G('.##./#..#/#..#/#..#/#..#/.##.'),
  P: G('###./#..#/#..#/###./#.../#...'), Q: G('.##./#..#/#..#/#..#/#.#./.#.#'), R: G('###./#..#/#..#/###./#.#./#..#'),
  S: G('.###/#.../.##./...#/...#/###.'), T: G('#####/..#../..#../..#../..#../..#..'), U: G('#..#/#..#/#..#/#..#/#..#/.##.'),
  V: G('#...#/#...#/#...#/.#.#./.#.#./..#..'), W: G('#...#/#...#/#...#/#.#.#/##.##/#...#'), X: G('#...#/.#.#./..#../..#../.#.#./#...#'),
  Y: G('#...#/#...#/.#.#./..#../..#../..#..'), Z: G('####/...#/..#./.#../#.../####'),
  a: G('.###/#..#/#..#/.###', 2), b: G('#.../#.../###./#..#/#..#/###.'), c: G('.##/#../#../.##', 2),
  d: G('...#/...#/.###/#..#/#..#/.###'), e: G('.##./####/#.../.###', 2), f: G('.##/#../###/#../#../#..'),
  g: G('.###/#..#/#..#/.###/...#/###.', 2), h: G('#.../#.../###./#..#/#..#/#..#'), i: G('#/./#/#/#/#'),
  j: G('.#/../.#/.#/.#/.#/.#/#.'), k: G('#../#../#.#/##./#.#/#.#'), l: G('#./#./#./#./#./.#'),
  m: G('####./#.#.#/#.#.#/#.#.#', 2), n: G('###./#..#/#..#/#..#', 2), o: G('.##./#..#/#..#/.##.', 2),
  p: G('###./#..#/#..#/###./#.../#...', 2), q: G('.###/#..#/#..#/.###/...#/...#', 2), r: G('#.#/##./#../#..', 2),
  s: G('.###/##../..##/###.', 2), t: G('.#./###/.#./.#./..#', 1), u: G('#..#/#..#/#..#/.###', 2),
  v: G('#.#/#.#/#.#/.#.', 2), w: G('#...#/#.#.#/#.#.#/.#.#.', 2), x: G('#..#/.##./.##./#..#', 2),
  y: G('#..#/#..#/#..#/.###/...#/.##.', 2), z: G('####/..#./.#../####', 2),
  0: G('.##./#..#/#.##/##.#/#..#/.##.'), 1: G('.#./##./.#./.#./.#./###'), 2: G('.##./#..#/..#./.#../#.../####'),
  3: G('###./...#/.##./...#/...#/###.'), 4: G('#..#/#..#/####/...#/...#/...#'), 5: G('####/#.../###./...#/...#/###.'),
  6: G('.##./#.../###./#..#/#..#/.##.'), 7: G('####/...#/..#./.#../.#../.#..'), 8: G('.##./#..#/.##./#..#/#..#/.##.'),
  9: G('.##./#..#/#..#/.###/...#/.##.'),
  '.': G('#', 5), ',': G('.#/#.', 5), ':': G('#/./#', 3), ';': G('.#/../.#/#.', 3), '!': G('#/#/#/#/./#'),
  '?': G('.##./#..#/..#./.#../..../.#..'), "'": G('#/#'), '"': G('#.#/#.#'), '-': G('###', 3), '+': G('.#./###/.#.', 2),
  '=': G('###/.../###', 2), '/': G('...#/..#./..#./.#../.#../#...'), '\\': G('#.../.#../.#../..#./..#./...#'),
  '(': G('.#/#./#./#./#./.#'), ')': G('#./.#/.#/.#/.#/#.'), '[': G('##/#./#./#./#./##'), ']': G('##/.#/.#/.#/.#/##'),
  '<': G('..#/.#./#../.#./..#', 1), '>': G('#../.#./..#/.#./#..', 1), '*': G('#.#/.#./#.#', 1),
  '#': G('.#.#./#####/.#.#./#####/.#.#.', 0), '%': G('#..#/...#/..#./.#../#.../#..#'), '&': G('.#../#.#./.#../#.##/#.#./.#.#'),
  _: G('####', 6), '|': G('#/#/#/#/#/#/#/#'), '·': G('#', 3), '…': G('#.#.#', 5), '×': G('#.#/.#./#.#', 2),
  '—': G('#####', 3), '–': G('####', 3), '←': G('..#../.#.../#####/.#.../..#..', 1), '→': G('..#../...#./#####/...#./..#..', 1),
  '↑': G('..#../.###./#.#.#/..#../..#../..#..'), '↓': G('..#../..#../..#../#.#.#/.###./..#..'),
  '✓': G('....#/...#./#.#../.#...', 1), '≡': G('###/.../###/.../###', 1), '⚙': G('.#.#./#####/##.##/#####/.#.#.', 1), '♪': G('.##/.#./.#./##./##.', 0), '☾': G('.##/#../#../#../.##', 1),
};
const TINY_SRC = {
  a: '010101111101101', b: '110101110101110', c: '011100100100011', d: '110101101101110', e: '111100110100111', f: '111100110100100',
  g: '011100101101011', h: '101101111101101', i: '111010010010111', j: '001001001101010', k: '101101110101101', l: '100100100100111',
  m: '101111111101101', n: '110101101101101', o: '010101101101010', p: '110101110100100', q: '010101101110011', r: '110101110101101',
  s: '011100010001110', t: '111010010010010', u: '101101101101111', v: '101101101101010', w: '101101111111101', x: '101101010101101',
  y: '101101010010010', z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
  _: '000000000000111', '-': '000000111000000', '.': '000000000000010', '+': '000010111010000', ':': '000010000010000',
  '/': '001001010100100', '!': '010010010000010', '?': '110001010000010', '×': '000101010101000', '%': '101001010100101', '…': '000000000000101',
};
const TINY_GLYPHS = Object.fromEntries(Object.entries(TINY_SRC).map(([k, s]) => [k, { rows: [0, 1, 2, 3, 4].map((j) => s.slice(j * 3, j * 3 + 3).replace(/1/g, '#').replace(/0/g, '.')), top: 0 }]));

function makeFont(name, glyphs, { lineH, space, tracking = 1, cap, xh, desc = 0, upper = false }) {
  const map = new Map();
  for (const [ch, g] of Object.entries(glyphs)) map.set(ch, { ...g, w: Math.max(...g.rows.map((r) => r.length)) });
  return { name, map, lineH, space, tracking, cap, xh, desc, upper };
}
export const FONTS = {
  body: makeFont('body', BODY_GLYPHS, { lineH: 9, space: 2, cap: 6, xh: 4, desc: 2 }),
  tiny: makeFont('tiny', TINY_GLYPHS, { lineH: 6, space: 2, cap: 5, xh: 5, upper: true }),
};
const _fold = new Map();
function glyphOf(font, ch) {
  const f = typeof font === 'string' ? FONTS[font] : font;
  if (f.upper) ch = ch.toLowerCase();
  let g = f.map.get(ch);
  if (g) return g;
  let k = _fold.get(ch);
  if (k === undefined) {
    k = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (k === ch) k = { '’': "'", '‘': "'", '“': '"', '”': '"', '⇦': '←', '⇨': '→', '✗': '×', '✕': '×' }[ch] ?? null;
    _fold.set(ch, k);
  }
  if (k && k !== ch) { g = f.map.get(f.upper ? k.toLowerCase() : k); if (g) return g; }
  return f.map.get('?');
}
const fontOf = (font) => (typeof font === 'string' ? FONTS[font] : font) || FONTS.body;
/** Width in px of a single line of text (no outline). */
export function textWidth(s, font = 'body') {
  const f = fontOf(font);
  let w = 0, n = 0;
  for (const ch of String(s)) { w += ch === ' ' ? f.space : glyphOf(f, ch).w; n++; }
  return n ? w + (n - 1) * f.tracking : 0;
}
/**
 * Word-wrap to maxW px; at most maxLines lines (the last one is cut with '…' if needed). Returns string[].
 */
export function wrapText(s, maxW, { font = 'body', maxLines = 99 } = {}) {
  const words = String(s).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (textWidth(t, font) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines);
    let last = keep[maxLines - 1] + '…';
    while (textWidth(last, font) > maxW && last.length > 1) last = last.slice(0, -2) + '…';
    keep[maxLines - 1] = last;
    return keep;
  }
  return lines.map((l) => { let v = l; while (textWidth(v, font) > maxW && v.length > 1) v = v.slice(0, -2) + '…'; return v; });
}
/**
 * Draw one line of text. (x, y) = top-left of the glyph box (row 0 = cap top); align 'left'|'center'|'right'
 * moves x. opts: font, color, outline (1-px 8-neighbour ring, for text over the 3D world), shadow (1 px down,
 * for text on panels that needs lift). Returns {x, y, w, h} of the drawn box (incl. outline).
 */
export function drawText(img, x, y, s, { font = 'body', color = DAY.text, outline = null, shadow = null, align = 'left' } = {}) {
  const f = fontOf(font);
  const w = textWidth(s, f);
  if (align === 'center') x -= Math.floor(w / 2); else if (align === 'right') x -= w;
  x |= 0; y |= 0;
  const H = f.cap + f.desc;
  const target = outline ? new PixelImage(w + 2, H + 2) : img;
  const ox = outline ? 1 : x, oy = outline ? 1 : y;
  const pass = (dst, col, dy) => {
    let cx = ox;
    for (const ch of String(s)) {
      if (ch === ' ') { cx += f.space + f.tracking; continue; }
      const g = glyphOf(f, ch);
      g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') dst.set(cx + i, oy + g.top + j + dy, col); });
      cx += g.w + f.tracking;
    }
  };
  if (shadow && !outline) pass(img, shadow, 1);   // shadow first, glyphs on top
  pass(target, color, 0);
  if (outline) { target.outline(outline, { diag: true }); img.blit(target, x - 1, y - 1); return { x: x - 1, y: y - 1, w: w + 2, h: H + 2 }; }
  return { x, y, w, h: H + (shadow ? 1 : 0) };
}

// ------------------------------------------------------------------------------------------------ frames (9-slice)
// Procedural frames: every box = 1-px outer line + (optional) 1-px bevel (light top-left, shadow bottom-right) + flat
// fill. corner: 0 square, 1 = 1-px notch, 2 = 2-px rounded (pill ends for chips). shadow: 1-px drop shadow below.
// docs/UI.md §2.5. Colours are token NAMES resolved against the token set passed to drawBox (day/night aware).
export const FRAMES = {
  panel:     { line: 'outline', edge: 'iron', fill: 'ink', hi: 'ironSh', sh: null, corner: 1, shadow: true },
  raised:    { line: 'outline', edge: 'iron', fill: 'inkRaised', hi: 'ironHi', sh: 'ironSh', corner: 1, shadow: false },
  hover:     { line: 'outline', edge: 'ironHi', fill: 'inkRaised', hi: 'ironHi', sh: 'ironSh', corner: 1, shadow: false },
  pressed:   { line: 'outline', edge: 'iron', fill: 'inkSunk', hi: 'ironSh', sh: null, corner: 1, shadow: false, press: 1 },
  disabled:  { line: 'outline', edge: 'ironSh', fill: 'ink', hi: null, sh: null, corner: 1, shadow: false },
  sunk:      { line: 'outline', edge: 'ironSh', fill: 'inkSunk', hi: null, sh: 'iron', corner: 0, shadow: false },
  gold:      { line: 'goldLine', edge: 'gold', fill: 'goldSh', hi: 'goldHi', sh: null, corner: 1, shadow: false },
  parchment: { line: 'parchmentLine', edge: 'parchmentSh', fill: 'parchment', hi: 'parchmentHi', sh: 'parchmentSh', corner: 1, shadow: true },
  bubble:    { line: 'outline', edge: 'bubbleEdge', fill: 'bubble', hi: 'bubbleHi', sh: null, corner: 1, shadow: true },
  tooltip:   { line: 'outline', edge: 'goldSh', fill: 'ink', hi: null, sh: null, corner: 1, shadow: true },
  chip:      { line: 'outline', edge: 'iron', fill: 'ink', hi: 'ironSh', sh: null, corner: 2, shadow: false },
  chipGold:  { line: 'outline', edge: 'goldSh', fill: 'ink', hi: null, sh: null, corner: 2, shadow: false },
  danger:    { line: 'outline', edge: 'danger', fill: 'ink', hi: null, sh: null, corner: 1, shadow: false },
};
const tok = (T, k) => (k == null ? null : T[k] ?? k);
/**
 * Draw a framed box at (x, y, w, h) (outer size incl. line, excl. drop shadow). style = FRAMES key or object;
 * T = token set (tokens(tod)). Returns the inner content rect {x, y, w, h} (inside line + edge + 1 px padding 0).
 */
export function drawBox(img, x, y, w, h, style = 'panel', T = DAY) {
  const S = typeof style === 'string' ? FRAMES[style] : style;
  const line = tok(T, S.line), edge = tok(T, S.edge), fill = tok(T, S.fill), hi = tok(T, S.hi), sh = tok(T, S.sh);
  const c = S.corner || 0;
  const cut = (i, j) => {   // corner cut test on the outer box (i, j local)
    const dx = Math.min(i, w - 1 - i), dy = Math.min(j, h - 1 - j);
    if (c === 1) return dx === 0 && dy === 0;
    if (c === 2) return (dx === 0 && dy <= 1) || (dy === 0 && dx <= 1);
    return false;
  };
  if (S.shadow) for (let i = 1; i < w; i++) if (!cut(i, h - 1) || c === 0) img.set(x + i, y + h, T.shadow);
  if (S.shadow && c) img.set(x + w - 1 - (c === 2 ? 1 : 0), y + h, T.shadow);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (cut(i, j)) continue;
    const ring = i === 0 || j === 0 || i === w - 1 || j === h - 1 || (c === 2 && (cut(i - 1, j) || cut(i + 1, j) || cut(i, j - 1) || cut(i, j + 1)));
    let col = fill;
    if (ring) col = line;
    else if (i === 1 || j === 1 || i === w - 2 || j === h - 2) col = edge;
    else if (hi && (j === 2 || (i === 2 && S.press))) col = hi;
    else if (sh && j === h - 3) col = sh;
    img.set(x + i, y + j, col);
  }
  return { x: x + 2, y: y + 2, w: w - 4, h: h - 4 };
}
/** 9-slice from baked art: src image with insets {l, t, r, b}; returns draw(img, x, y, w, h). Edges/centre TILE. */
export function nineSlice(src, { l, t, r, b }) {
  return (img, x, y, w, h) => {
    const cw = src.w - l - r, ch = src.h - t - b;
    const part = (sx, sy, sw, sh, dx, dy, dw, dh) => {
      for (let j = 0; j < dh; j += sh) for (let i = 0; i < dw; i += sw)
        img.blit(src, dx + i, dy + j, { sx, sy, sw: Math.min(sw, dw - i), sh: Math.min(sh, dh - j) });
    };
    part(0, 0, l, t, x, y, l, t); part(src.w - r, 0, r, t, x + w - r, y, r, t);
    part(0, src.h - b, l, b, x, y + h - b, l, b); part(src.w - r, src.h - b, r, b, x + w - r, y + h - b, r, b);
    part(l, 0, cw, t, x + l, y, w - l - r, t); part(l, src.h - b, cw, b, x + l, y + h - b, w - l - r, b);
    part(0, t, l, ch, x, y + t, l, h - t - b); part(src.w - r, t, r, ch, x + w - r, y + t, r, h - t - b);
    part(l, t, cw, ch, x + l, y + t, w - l - r, h - t - b);
  };
}

// ------------------------------------------------------------------------------------------------ animation
// The game grid is 30 Hz (CAST_PORTING §8). A UI drawing is held a whole number of grid frames: 2 (15 fps),
// 3 (10 fps), 4 (7.5 fps) ... docs/UI.md §2.7. All UI animation is a pure function of t (engine time, seconds).
export const GRID_HZ = 30;
/** Grid frames per drawing for a wanted fps (v2 14 fps -> 2, 10 -> 3, 8 -> 4). */
export const holdsFor = (fps) => Math.max(1, Math.round(GRID_HZ / fps));
/**
 * Drawing index at time t (seconds since the animation started). fps is snapped to the grid (holdsFor).
 * opts: loop (default true), seq (index sequence, e.g. v2 point [0,1,2,1]); one-shots clamp on the last drawing.
 */
export function frameAt(t, fps, count, { loop = true, seq = null } = {}) {
  const n = seq ? seq.length : count;
  const k = Math.floor(Math.max(0, t) * GRID_HZ / holdsFor(fps) + 1e-6);
  const i = loop ? k % n : Math.min(k, n - 1);
  return seq ? seq[i] : i;
}
/** Whole-grid-frame time (seconds) of t: quantise any UI timer to the grid before using it. */
export const gridTime = (t) => Math.floor(t * GRID_HZ + 1e-6) / GRID_HZ;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered (Bayer 4x4) dissolve: k = 0 keeps everything, 1 removes everything. Steps of 1/16, anchored to (ox, oy). */
export function dissolve(img, k, ox = 0, oy = 0) {
  if (k <= 0) return img;
  const lim = Math.round(k * 16);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++)
    if (BAYER4[((y + oy) & 3) * 4 + ((x + ox) & 3)] < lim) img.erase(x, y);
  return img;
}
/**
 * Standard appear / disappear envelope (docs/UI.md §2.7) for an element shown at tIn (s), hidden at tOut (s):
 * returns {visible, dissolve (0..1, stepped 3 levels at 15 fps), pop (1 during the first 2 grid frames)}.
 */
export function envelope(t, tIn, tOut = Infinity) {
  if (t < tIn) return { visible: false, dissolve: 1, pop: 0 };
  const a = Math.floor((t - tIn) * GRID_HZ + 1e-6);
  if (t < tOut) return { visible: true, dissolve: 0, pop: a < 2 ? 1 : 0 };
  const b = Math.floor((t - tOut) * GRID_HZ / 2 + 1e-6);        // 15 fps steps
  return b >= 3 ? { visible: false, dissolve: 1, pop: 0 } : { visible: true, dissolve: [0.25, 0.5, 0.75][b], pop: 0 };
}

// ------------------------------------------------------------------------------------------------ atlas
/**
 * Shelf packer in insertion order with a 1-px gutter (same as v2 packages/assets/scripts/fx/index.ts pack()).
 * frames: [[name, PixelImage], ...]. Returns { img, rects: {name: {x, y, w, h}} }.
 */
export function packAtlas(frames, { width = 256, pad = 1 } = {}) {
  const rects = {};
  let x = pad, y = pad, rowH = 0, maxW = 0;
  const W = Math.max(width, ...frames.map(([, i]) => i.w + 2 * pad));
  for (const [n, i] of frames) {
    if (rects[n]) throw new Error(`packAtlas: duplicate frame name '${n}'`);
    if (x + i.w + pad > W) { x = pad; y += rowH + pad; rowH = 0; }
    rects[n] = { x, y, w: i.w, h: i.h };
    x += i.w + pad; rowH = Math.max(rowH, i.h); maxW = Math.max(maxW, x);
  }
  const img = new PixelImage(W, y + rowH + pad);
  for (const [n, i] of frames) img.blit(i, rects[n].x, rects[n].y);
  return { img, rects };
}
/** v2-shaped manifest: { image, width, height, frames, meta } (social.json / square-props.json layout). */
export function atlasJson({ image, img, rects, meta = {} }) {
  return { image, width: img.w, height: img.h, frames: rects, meta };
}

// ------------------------------------------------------------------------------------------------ browser helpers
/** PixelImage -> canvas (browser only). scale = integer preview scale. */
export function toCanvas(img, scale = 1) {
  const c = document.createElement('canvas');
  c.width = img.w * scale; c.height = img.h * scale;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const id = new ImageData(new Uint8ClampedArray(img.data), img.w, img.h);
  if (scale === 1) { g.putImageData(id, 0, 0); return c; }
  const t = document.createElement('canvas'); t.width = img.w; t.height = img.h;
  t.getContext('2d').putImageData(id, 0, 0);
  g.drawImage(t, 0, 0, c.width, c.height);
  return c;
}
/** Load a PNG (URL relative to the page) into a PixelImage (browser only). */
export async function loadImage(url) {
  const im = new Image();
  im.src = url;
  await im.decode();
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  return PixelImage.from(g.getImageData(0, 0, im.width, im.height));
}
