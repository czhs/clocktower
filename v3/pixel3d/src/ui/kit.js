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
//   FONTS, drawText, textWidth, wrapText, drawRuns, registerFont   bitmap fonts 'body' (cap 6, x 4, desc 2), 'tiny' (= 'label':
//                         caps/digits, 3x5 with 5-wide M/W, 4-wide N), 'display' (hud group face, registered by the pages)
//   annulus, shade        clean elliptic rings; lit-from-upper-left 3-tone shading + line for flat sprites
//   PIN_LIT, VARIANT_RAMPS, variantRamps, steps   pin ramps with a dark line for every colour; ghost/spent/dead ramps
//   FRAMES, drawBox       procedural 9-slice frames (panel, raised, pressed, sunk, parchment, gold, bubble, chip, ...)
//   nineSlice             9-slice from baked art (panels group)
//   GRID_HZ, holdsFor, frameAt, popScale, dissolve   stepped animation on the 30 Hz game grid
//   packAtlas, atlasJson  shelf packer + v2-shaped manifest (frame names kept verbatim)
//   (density round, additive; docs/UI.md §2.10) DensityView / densityView / hdPiece / withHD / upscale (draw any 1x art
//                         into a D=2 image), fontAt / derive2x / HD_TEXT + FONTS['body@2' | 'tiny@2' | 'label@2'] (+ 'display@2'
//                         from src/ui/fonts.js), drawText/textWidth/wrapText/drawRuns `density`, drawBoxHD / HD_FRAME.
//                         Default behaviour (density 1) is byte-identical to before (shots/ui-hd/regress.mjs).

import { BODY2_GLYPHS, BODY2_METRICS, TINY2_GLYPHS, TINY2_METRICS } from './fonts-hd.js';

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
/** Night variant of a light tone: OKLab L - dL, b shifted toward blue (cooler), a kept. Deterministic. */
function nightTone(c, dL = 0.05) { const [L, a, b] = toOklab(c); return hex(fromOklab([L - dL, a, b * 0.85 - 0.006])); }
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
  bedtime: '#6F7FD0',                                            // v2 clock.css bedtime periwinkle (module fix: hud request)
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
  bedtime: '#6874C0',
  // (module fix) world-anchored parchment (finger, hands, pin sockets, callouts) a touch dimmer + cooler at night, like
  // v2's dimmer house names (docs/UI.md §2.7). Derived in OKLab from the day values (L -0.05, chroma kept, cooler).
  parchment: nightTone('#E6D7B2'), parchmentHi: nightTone('#F4ECD4'), parchmentSh: nightTone('#C2AE86'),
};
const GOLDEN = { ...DAY, ink: '#2D2433', inkRaised: '#3D3145', iron: '#665663', ironHi: '#8E7A86', text: '#F3E2C2', labelText: '#F6E6C8' };
export const TOKENS = { day: DAY, golden: GOLDEN, night: NIGHT };

/** n-step OKLab ramp from a (dark) to b (light), hex strings. */
export function steps(a, b, n = 5) {
  const A = toOklab(a), B = toOklab(b);
  return Array.from({ length: n }, (_, i) => hex(fromOklab(A.map((v, j) => v + (B[j] - v) * (i / (n - 1))))));
}
/**
 * Shared variant ramps (5 steps, dark -> light) for ghost / spent ghost / dead art (module fix: portraits request; the
 * same values as src/ui/portraits/style.js variantRamp()). ghost / spent = the cast's ghost material (src/chars/rig.js
 * ghostOpts defaults), dead = a warm memorial tone on the parchment tokens. Use VARIANT_RAMPS.ghost etc. or
 * variantRamps(T) for the token set of a time of day (dead follows the night parchment).
 */
export function variantRamps(T = DAY) {
  return { ghost: steps('#3A5696', '#E2EEFA'), spent: steps('#3A4260', '#98A2BA'),
    dead: [ramp(T.parchmentLine).line, T.parchmentLine, hex(mix(T.parchmentLine, T.parchmentSh, 0.5)), T.parchmentSh, T.parchment] };
}
export const VARIANT_RAMPS = variantRamps(DAY);
/** Token set for a time-of-day preset name (sky.js: morning|noon|golden|night). */
export const tokens = (tod = 'noon') => (tod === 'night' ? NIGHT : tod === 'golden' ? GOLDEN : DAY);

/** v2 pin colours (social.json meta.pinColorHex) as 3-tone ramps. Keys = v2 PinColor ids. */
export const PIN_HEX = { gold: '#e6b632', crimson: '#c42c3c', violet: '#8a52cc', teal: '#22a6b4', green: '#5cb23a', orange: '#e8701e', white: '#ece6da', black: '#2c2636' };
export const PIN_COLORS = Object.keys(PIN_HEX);
// NOTE (module fix): PIN_RAMPS.black.line is a LIGHT tone (#A49CB4) kept for compatibility (the emotes dock uses it as the
// lit edge of a black swatch on ink panels); it is also exposed as `rim`. Art that outlines a black pin with its own
// `line` (world pins, sockets) should use PIN_LIT (black = a dark body with a dark line, as markers art.js PIN_ART).
export const PIN_RAMPS = Object.fromEntries(PIN_COLORS.map((k) => [k, k === 'white' ? { hi: '#F4EEE2', mid: '#DCD3C4', sh: '#A79CB0', line: '#5B5168' }
  : k === 'black' ? { hi: '#5A5168', mid: '#3A3346', sh: '#2A2434', line: '#A49CB4', rim: '#A49CB4' } : ramp(PIN_HEX[k])]));
/** Pin ramps whose `line` is always the darkest tone (black: own dark ramp around #2c2636, = markers PIN_ART.black). */
export const PIN_LIT = { ...PIN_RAMPS, black: { ...ramp(PIN_HEX.black, { light: 0.2, dark: 0.05, line: 0.1 }), mid: PIN_HEX.black, rim: '#A49CB4' } };

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

// ------------------------------------------------------------------------------------------------ density (D=2 UI)
/**
 * (density round, docs/UI.md "Density") A density VIEW: a PixelImage-compatible window onto an HD image `base` whose
 * pixels are D times smaller than the view's logical (1x) pixels. Every 1x art function draws through it unchanged:
 *   - set / rect / line / disc / outline ... paint D x D blocks (the 1x look, at the same on-screen size);
 *   - drawText / drawRuns draw the D=2 faces (twice the detail, identical layout: advances are exactly D x);
 *   - drawBox draws the D=2 frames (drawBoxHD: finer line, rounder corners, same content rect);
 *   - blit(src) uses src.hd when present (a D x larger hand-drawn version, optionally offset by src.hdOff = {x, y}
 *     HD px), else blocks: attach HD art to a 1x sprite once (withHD(sprite, hd)) and every caller that blits it gets it.
 * (ox, oy) = where the view's logical origin sits in `base` (HD px; may be any integer). w / h = floor(base / D).
 * Direct writers of img.data do not see a view (use the HD image itself).
 */
export class DensityView extends PixelImage {
  constructor(base, D = 2, ox = 0, oy = 0) {
    super(0, 0, new Uint8ClampedArray(0));
    this.base = base; this.density = D; this.ox = ox | 0; this.oy = oy | 0; this.isView = true;
    this.w = Math.floor((base.w - this.ox) / D); this.h = Math.floor((base.h - this.oy) / D);
  }
  clone() { return new DensityView(this.base.clone(), this.density, this.ox, this.oy); }
  clear() { this.base.clear(); return this; }
  fill(c) { this.base.fill(c); return this; }
  get(x, y) { if (!this.inside(x, y)) return [0, 0, 0, 0]; return this.base.get(x * this.density + this.ox, y * this.density + this.oy); }
  alpha(x, y) { return this.inside(x, y) ? this.base.alpha(x * this.density + this.ox, y * this.density + this.oy) : 0; }
  set(x, y, c) { x |= 0; y |= 0; const D = this.density; this.base.rect(x * D + this.ox, y * D + this.oy, D, D, c); return this; }
  rect(x, y, w, h, c) { const D = this.density; this.base.rect(x * D + this.ox, y * D + this.oy, w * D, h * D, c); return this; }
  erase(x, y) { const D = this.density; for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) this.base.erase(x * D + this.ox + i, y * D + this.oy + j); return this; }
  blit(src, dx, dy, opts = {}) {
    const D = this.density, { sx = 0, sy = 0, sw = src.w, sh = src.h, flipX = false, flipY = false, tint = null, scale = 1 } = opts;
    const full = sx === 0 && sy === 0 && sw === src.w && sh === src.h;
    if (scale === 1 && src.hd && (full || !src.hdOff)) {
      const o = src.hdOff ?? { x: 0, y: 0 };
      this.base.blit(src.hd, (dx | 0) * D + this.ox + o.x, (dy | 0) * D + this.oy + o.y,
        full ? { flipX, flipY, tint } : { sx: sx * D, sy: sy * D, sw: sw * D, sh: sh * D, flipX, flipY, tint });
      return this;
    }
    if (scale === 1 && src.isView && src.density === D) {      // a view into a view of the same density: copy the HD pixels
      this.base.blit(src.base, (dx | 0) * D + this.ox, (dy | 0) * D + this.oy, { sx: sx * D + src.ox, sy: sy * D + src.oy, sw: sw * D, sh: sh * D, flipX, flipY, tint });
      return this;
    }
    return super.blit(src, dx, dy, opts);
  }
  crop(x, y, w, h) { const D = this.density; return new DensityView(this.base.crop(x * D + this.ox, y * D + this.oy, w * D, h * D), D); }
  bbox() { const b = this.base.bbox(); if (!b) return null; const D = this.density; const x0 = Math.floor((b.x - this.ox) / D), y0 = Math.floor((b.y - this.oy) / D); return { x: x0, y: y0, w: Math.ceil((b.x + b.w - this.ox) / D) - x0, h: Math.ceil((b.y + b.h - this.oy) / D) - y0 }; }
  colors() { return this.base.colors(); }
}
/** densityView(hdImage, D = 2, ox = 0, oy = 0) -> a DensityView (see there). */
export const densityView = (base, D = 2, ox = 0, oy = 0) => new DensityView(base, D, ox, oy);
/** Attach a hand-drawn D x version to a 1x sprite (returns the sprite). Views blit `hd` instead of blocks. */
export function withHD(sprite, hd, off = null) { sprite.hd = hd; if (off) sprite.hdOff = off; return sprite; }
/** Nearest-neighbour integer upscale (the compat path for 1x art that has no HD version yet). */
export function upscale(img, D = 2) {
  const o = new PixelImage(img.w * D, img.h * D);
  o.blit(img, 0, 0, { scale: D });
  return o;
}
/**
 * An HD piece: draw 1x art through a view into a fresh (w·D x h·D) image. fn(view) gets the view (logical size w x h);
 * returns the HD PixelImage (its `.view` = the view). Cache it like any sprite and blit it into an HD layer.
 */
export function hdPiece(w, h, fn, D = 2) {
  const im = new PixelImage(w * D, h * D), v = new DensityView(im, D);
  im.r = fn(v) ?? null;
  im.view = v;
  return im;
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
  '★': G('..#../#####/.###./.#.#.', 1),   // (density round, additive) the notebook's trust mark; body@2 has the same advance
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
// (module fix) the 3-wide M / W / N read as H / H / П at 1x ("RMB" -> "RHB", "NOMINATIONS" -> "NOHINATIONS"): 5-wide M + W,
// 4-wide N, plus '#', ',', '·', '—', '–', "'" — the same glyphs as the hud group's LABEL face (src/ui/hud/font.js), so
// FONTS.tiny and LABEL now render identically (FONTS.label is an alias).
// (UI integration r2, critic) the 3-wide D (110/101/101/101/110) read as O at 1x on keycaps ('DRAG' -> 'ORAG'): 4-wide D.
Object.assign(TINY_GLYPHS, Object.fromEntries(Object.entries({
  d: '###./#..#/#..#/#..#/###.', m: '#...#/##.##/#.#.#/#...#/#...#', w: '#...#/#...#/#.#.#/##.##/#...#', n: '#..#/##.#/#.##/#..#/#..#',
  '#': '.#.#./#####/.#.#./#####/.#.#.', ',': '.../.../.../.#./#..', '·': './././#/.', '—': '...../...../#####/...../.....',
  '–': '..../..../####/..../....', "'": '#/#/./././.'.slice(0, 9),
}).map(([k, r]) => [k, { rows: r.split('/'), top: 0 }])));

function makeFont(name, glyphs, { lineH, space, tracking = 1, cap, xh, desc = 0, upper = false, density = 1, base = null }) {
  const map = new Map();
  for (const [ch, g] of Object.entries(glyphs)) map.set(ch, { ...g, w: g.w ?? Math.max(...g.rows.map((r) => r.length)) });
  return { name, map, lineH, space, tracking, cap, xh, desc, upper, density, base };
}
export const FONTS = {
  body: makeFont('body', BODY_GLYPHS, { lineH: 9, space: 2, cap: 6, xh: 4, desc: 2 }),
  tiny: makeFont('tiny', TINY_GLYPHS, { lineH: 6, space: 2, cap: 5, xh: 5, upper: true }),
};
FONTS.label = { ...FONTS.tiny, name: 'label' };     // alias (hud LABEL = tiny with the wide M/W/N, now the kit's own)
// (density round, additive) the D=2 faces (src/ui/fonts-hd.js): same advances x2, twice the detail. Keyed '<name>@2';
// fontAt(font, 2) / drawText({density: 2}) / a density view pick them. 'display@2' is registered by src/ui/fonts.js.
FONTS['body@2'] = makeFont('body@2', BODY2_GLYPHS, { ...BODY2_METRICS, density: 2, base: 'body' });
FONTS['tiny@2'] = makeFont('tiny@2', TINY2_GLYPHS, { ...TINY2_METRICS, density: 2, base: 'tiny' });
FONTS['label@2'] = { ...FONTS['tiny@2'], name: 'label@2', base: 'label' };
/**
 * Register a font object under a FONTS key (module fix). kit.js cannot import group modules (circular + ownership),
 * so pages register group faces at load: scenes/ui-hud.js and scenes/ui-bake.js register the hud group's DISPLAY face
 * as FONTS.display (src/ui/hud/font.js). Accepts a ready font ({map, lineH, ...}) or a glyph table + metrics.
 * Until registered, drawText({font: 'display'}) falls back to body (and warns once).
 */
export function registerFont(key, font, metrics = null) {
  FONTS[key] = metrics ? makeFont(key, font, metrics) : font;
  return FONTS[key];
}
const _fold = new Map();
const _scaledGlyphs = new WeakMap();
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
  // (density round) a D>1 face without this glyph: the 1x face's glyph, block-scaled (same advance, never a '?' that
  // the 1x face would not show)
  if (f.density > 1 && f.base) {
    const b = fontOf(f.base);
    if (b !== FONTS.body || f.base === 'body') {
      let m = _scaledGlyphs.get(f);
      if (!m) { m = new Map(); _scaledGlyphs.set(f, m); }
      if (!m.has(ch)) m.set(ch, scaleGlyph(glyphOf(b, ch), f.density));
      return m.get(ch);
    }
  }
  return f.map.get('?');
}
const _warned = new Set();
const fontOf = (font) => {
  const f = typeof font === 'string' ? FONTS[font] : font;
  if (f) return f;
  if (typeof font === 'string' && !_warned.has(font)) { _warned.add(font); console.warn(`kit: font '${font}' not registered, using body`); }
  return FONTS.body;
};
/** One glyph block-scaled by an integer D (rows, top, advance x D). */
function scaleGlyph(g, D) {
  const rows = [];
  for (const r of g.rows) { const s = [...r].map((c) => c.repeat(D)).join(''); for (let k = 0; k < D; k++) rows.push(s); }
  return { rows, top: g.top * D, w: g.w * D };
}
/** Scale2x (EPX) of a binary glyph: 2x the rows with 45-degree steps smoothed and convex corners kept (AdvMAME2x rule). */
function scale2xGlyph(g) {
  const h = g.rows.length, w = Math.max(0, ...g.rows.map((r) => r.length));
  const at = (x, y) => (y >= 0 && y < h && x >= 0 && x < w && g.rows[y][x] === '#');
  const out = Array.from({ length: 2 * h }, () => Array(2 * w).fill('.'));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const E = at(x, y), B = at(x, y - 1), D = at(x - 1, y), F = at(x + 1, y), H = at(x, y + 1);
    const e0 = D === B && B !== F && D !== H ? D : E, e1 = B === F && B !== D && F !== H ? F : E;
    const e2 = D === H && D !== B && H !== F ? D : E, e3 = H === F && D !== H && B !== F ? F : E;
    out[2 * y][2 * x] = e0 ? '#' : '.'; out[2 * y][2 * x + 1] = e1 ? '#' : '.';
    out[2 * y + 1][2 * x] = e2 ? '#' : '.'; out[2 * y + 1][2 * x + 1] = e3 ? '#' : '.';
  }
  return { rows: out.map((r) => r.join('')), top: g.top * 2, w: g.w * 2 };
}
/**
 * (density round) A D=2 face derived from a 1x face: every glyph Scale2x-smoothed (smooth, default) or block-scaled,
 * advances / metrics x2, so layouts stay identical. thin = 1-px horizontal hairlines: a 1x pixel with no ink above or
 * below (a horizontal stroke) keeps one of its two HD rows (the top row in the upper half of the cap, else the bottom
 * one), which gives the thick/thin contrast of the hand-drawn D=2 faces. Used for faces without a hand-drawn D=2
 * version (display@2 = derive2x(DISPLAY), src/ui/fonts.js) and as the fallback of fontAt().
 */
export function derive2x(font, { smooth = true, thin = false, name = null } = {}) {
  const f = fontOf(font), glyphs = {};
  for (const [ch, g] of f.map) {
    let o = smooth ? scale2xGlyph(g) : scaleGlyph(g, 2);
    if (thin) {
      const at = (x, y) => (y >= 0 && y < g.rows.length && g.rows[y][x] === '#');
      const rows = o.rows.map((r) => [...r]);
      g.rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) {
        if (r[x] !== '#' || at(x, y - 1) || at(x, y + 1) || !(at(x - 1, y) || at(x + 1, y))) continue;
        const drop = g.top + y < f.cap / 2 ? 1 : 0;              // upper half: keep the top row
        rows[2 * y + drop][2 * x] = '.'; rows[2 * y + drop][2 * x + 1] = '.';
      } });
      o = { ...o, rows: rows.map((r) => r.join('')) };
    }
    glyphs[ch] = o;
  }
  return makeFont(name ?? `${f.name}@2`, glyphs, { lineH: f.lineH * 2, space: f.space * 2, tracking: f.tracking * 2, cap: f.cap * 2,
    xh: f.xh * 2, desc: f.desc * 2, upper: f.upper, density: 2, base: f.name });
}
const _derivedFonts = new WeakMap();
/**
 * (density round) The face to draw `font` with at UI density d: d = 1 -> the font itself; d = 2 -> FONTS['<name>@2']
 * (body@2, tiny@2, label@2, display@2 once src/ui/fonts.js registered it), else a derive2x() of it (cached). A font
 * that already is a D>1 face is returned as is.
 */
export function fontAt(font, d = 1) {
  const f = fontOf(font);
  if (!(d > 1) || (f.density ?? 1) > 1) return f;
  const reg = FONTS[`${f.name}@${d}`];
  if (reg) return reg;
  let m = _derivedFonts.get(f);
  if (!m) { m = new Map(); _derivedFonts.set(f, m); }
  if (!m.has(d)) {
    if (d === 2) m.set(d, derive2x(f));
    else {                                            // other densities: block-scaled (no hand-drawn faces exist)
      const glyphs = {};
      for (const [ch, g] of f.map) glyphs[ch] = scaleGlyph(g, d);
      m.set(d, makeFont(`${f.name}@${d}`, glyphs, { lineH: f.lineH * d, space: f.space * d, tracking: f.tracking * d, cap: f.cap * d,
        xh: f.xh * d, desc: f.desc * d, upper: f.upper, density: d, base: f.name }));
    }
  }
  return m.get(d);
}
/** Width in px of a single line of text (no outline). density d > 1: the D=d face's width (= d x the 1x width). */
export function textWidth(s, font = 'body', d = 1) {
  const f = fontAt(font, d);
  let w = 0, n = 0;
  for (const ch of String(s)) { w += ch === ' ' ? f.space : glyphOf(f, ch).w; n++; }
  return n ? w + (n - 1) * f.tracking : 0;
}
/**
 * Word-wrap to maxW px; at most maxLines lines (the last one is cut with '…' if needed). Returns string[].
 * density d: maxW is in D=d px (the wrap points are the same as at 1x with maxW / d).
 */
export function wrapText(s, maxW, { font: font0 = 'body', maxLines = 99, density = 1 } = {}) {
  const font = fontAt(font0, density);
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
 * (density round, additive) density d: draw the D=d face (fontAt) at (x, y) in px of `img` (an HD image).
 * outlineW: rings of the outline (default 1). img = a density view (densityView(hd, D)): x, y, align and the returned
 * box are in the view's logical (1x) px, the glyphs are the D=d face drawn into the HD image underneath
 * (outlineW default HD_TEXT.outlineW, shadow HD_TEXT.shadowDy HD px down).
 */
export function drawText(img, x, y, s, opts = {}) {
  if (img?.isView) return drawTextView(img, x, y, s, opts);
  const { font = 'body', color = DAY.text, outline = null, shadow = null, align = 'left', density = 1, outlineW = 1, shadowDy = 1 } = opts;
  const f = fontAt(font, density);
  const w = textWidth(s, f);
  if (align === 'center') x -= Math.floor(w / 2); else if (align === 'right') x -= w;
  x |= 0; y |= 0;
  const H = f.cap + f.desc, ow = outline ? Math.max(1, outlineW | 0) : 0;
  const target = outline ? new PixelImage(w + 2 * ow, H + 2 * ow) : img;
  const ox = outline ? ow : x, oy = outline ? ow : y;
  const pass = (dst, col, dy) => {
    let cx = ox;
    for (const ch of String(s)) {
      if (ch === ' ') { cx += f.space + f.tracking; continue; }
      const g = glyphOf(f, ch), gx = cx + (g.dx || 0);
      g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') dst.set(gx + i, oy + g.top + j + dy, col); });
      cx += g.w + f.tracking;
    }
  };
  if (shadow && !outline) pass(img, shadow, shadowDy);   // shadow first, glyphs on top
  pass(target, color, 0);
  if (outline) {
    for (let k = 0; k < ow; k++) target.outline(outline, { diag: true });
    img.blit(target, x - ow, y - ow);
    return { x: x - ow, y: y - ow, w: w + 2 * ow, h: H + 2 * ow };
  }
  return { x, y, w, h: H + (shadow ? shadowDy : 0) };
}
/** Defaults for text drawn through a density view (tunable per call: outlineW / shadowDy). */
export const HD_TEXT = { outlineW: 2, shadowDy: 1 };   // outline 2 HD px = the 1x ring's weight (finer glyphs inside)
function drawTextView(view, x, y, s, opts) {
  const D = view.density, { font = 'body', align = 'left', outline = null, shadow = null } = opts;
  const f1 = fontOf(font), w = textWidth(s, f1);
  if (align === 'center') x -= Math.floor(w / 2); else if (align === 'right') x -= w;
  x |= 0; y |= 0;
  drawText(view.base, x * D + view.ox, y * D + view.oy, s, { ...opts, font: fontAt(f1, D), density: 1, align: 'left',
    outlineW: opts.outlineW ?? (D > 1 ? HD_TEXT.outlineW : 1), shadowDy: opts.shadowDy ?? (D > 1 ? HD_TEXT.shadowDy : 1) });
  const H = f1.cap + f1.desc;
  return outline ? { x: x - 1, y: y - 1, w: w + 2, h: H + 2 } : { x, y, w, h: H + (shadow ? 1 : 0) };
}

/**
 * Draw coloured runs on one line (module fix: hud request): runs = [[text, color], ...] (or [text, {color, ...opts}]).
 * Advances textWidth(run) + tracking between runs (textWidth leaves out the trailing tracking, so a naive
 * x += textWidth(run) glues the next run's first glyph to the last one). opts as drawText (font, outline, shadow);
 * align 'left' | 'center' | 'right' applies to the whole line. Returns {x, y, w, h} of the line.
 */
export function drawRuns(img, x, y, runs, { font = 'body', outline = null, shadow = null, align = 'left', density = 1 } = {}) {
  const f = img?.isView ? fontOf(font) : fontAt(font, density);   // a view lays out in logical px (drawText draws HD)
  const list = runs.map((r) => (Array.isArray(r) ? r : [r.text, r])).map(([t, c]) => [String(t), typeof c === 'object' && c && !Array.isArray(c) ? c : { color: c }]);
  const w = list.reduce((a, [t], i) => a + textWidth(t, f) + (i ? f.tracking : 0), 0);
  if (align === 'center') x -= Math.floor(w / 2); else if (align === 'right') x -= w;
  let cx = x | 0;
  for (const [t, o] of list) {
    if (t) drawText(img, cx, y, t, { font: f, outline, shadow, ...o, align: 'left' });
    cx += textWidth(t, f) + f.tracking;
  }
  const H = f.cap + f.desc;
  return outline ? { x: (x | 0) - 1, y: (y | 0) - 1, w: w + 2, h: H + 2 } : { x: x | 0, y: y | 0, w, h: H + (shadow ? 1 : 0) };
}

// ------------------------------------------------------------------------------------------------ shapes + shading
/**
 * Elliptic annulus (module fix: promoted from src/ui/indicators/art.js): pixel centres inside (rx, ry) and outside
 * (rx - tx, ry - ty) -> 2 px wide at the sides, 1 px at the poles, no pole spurs (two concentric ring() calls leave
 * 1-px spurs). keep(x, y) filters pixels (e.g. only the front of a ground ring).
 */
export function annulus(img, cx, cy, rx, ry, c, { tx = 2, ty = 1, keep = null } = {}) {
  const ins = (x, y, a, b) => { const dx = (x + 0.5 - cx) / a, dy = (y + 0.5 - cy) / b; return dx * dx + dy * dy <= 1; };
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++)
      if (ins(x, y, rx, ry) && !ins(x, y, rx - tx, ry - ty) && (!keep || keep(x, y))) img.set(x, y, c);
  return img;
}
/**
 * Lit-from-the-upper-left shading of a flat sprite (module fix: promoted from src/ui/indicators/art.js): every `mid`
 * pixel with an empty neighbour above/left becomes `hi`, else with an empty neighbour below/right becomes `sh`; then a
 * 1-px `line` outline (diag = 8-neighbour). Shade AFTER flips/transposes so every direction keeps the same light.
 * R = {hi, mid, sh, line} (a ramp()).
 */
export function shade(img, { hi, mid, sh, line }, { diag = false } = {}) {
  const M = rgba(mid);
  const isMid = (x, y) => { const v = img.get(x, y); return v[3] && v[0] === M[0] && v[1] === M[1] && v[2] === M[2]; };
  const empty = (x, y) => img.alpha(x, y) === 0;
  const set = [];
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!isMid(x, y)) continue;
    if (hi && (empty(x, y - 1) || empty(x - 1, y))) set.push([x, y, hi]);
    else if (sh && (empty(x, y + 1) || empty(x + 1, y))) set.push([x, y, sh]);
  }
  for (const [x, y, c] of set) img.set(x, y, c);
  if (line) img.outline(line, { diag });
  return img;
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
  if (img?.isView) {                       // (density round) a density view: the D=2 frame, same logical content rect
    const D = img.density;
    drawBoxHD(img.base, x * D + img.ox, y * D + img.oy, w * D, h * D, style, T, D);
    return { x: x + 2, y: y + 2, w: w - 4, h: h - 4 };
  }
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
/**
 * (density round) Geometry of the D=2 frames (drawBoxHD; a density view's drawBox). The 1x frame is line 1 + edge 1
 * texels (= 4 HD px) before the content; at D=2 the same 4 px are a finer 1-px line, a 2-px keyline (edge) and 1 px
 * of fill (or the 1-px hi bevel row), so the logical content rect is unchanged. Corners are rounder: per-row cuts from
 * each corner (1x notch -> [2, 1], 1x pill -> [4, 2, 1, 1]); the ring distance is 4-neighbour, so the line and the
 * keyline follow the rounded corner. Drop shadow: 2 HD rows (= the 1x 1-texel row), the box shape shifted 2 px.
 */
export const HD_FRAME = { lineW: 1, edgeW: 2, shadowH: 2, cuts: { 0: [], 1: [2, 1], 2: [4, 2, 1, 1] } };
const _cornerDist = new Map();
function cornerDist(cuts) {                     // 4-neighbour distance to the outside in an 8x8 corner patch
  const k = cuts.join(',');
  if (_cornerDist.has(k)) return _cornerDist.get(k);
  const P = 8, out = (i, j) => i < 0 || j < 0 || (j < cuts.length && i < cuts[j]);
  const d = Array.from({ length: P }, (_, j) => Array.from({ length: P }, (_, i) => (out(i, j) ? -1 : 99)));
  for (let pass = 0; pass < 2 * P; pass++) for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
    if (d[j][i] < 0) continue;
    const nb = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].map(([a, b]) => (out(a, b) ? -1 : a >= P || b >= P ? 99 : d[b][a]));
    d[j][i] = Math.min(d[j][i], Math.min(...nb) + 1);
  }
  _cornerDist.set(k, d);
  return d;
}
/**
 * The D=2 frame of a FRAMES style at (x, y, w, h) in HD px of `img` (w, h = D x the logical size). Same tokens and
 * styles as drawBox; returns the HD content rect (inset 2·D). Other densities: the 1x frame block-scaled.
 */
export function drawBoxHD(img, x, y, w, h, style = 'panel', T = DAY, D = 2) {
  if (D !== 2) {
    const t = new PixelImage(Math.ceil(w / D), Math.ceil(h / D) + 1);
    drawBox(t, 0, 0, t.w, t.h - 1, style, T);
    img.blit(t, x, y, { scale: D });
    return { x: x + 2 * D, y: y + 2 * D, w: w - 4 * D, h: h - 4 * D };
  }
  const S = typeof style === 'string' ? FRAMES[style] : style;
  const line = tok(T, S.line), edge = tok(T, S.edge), fill = tok(T, S.fill), hi = tok(T, S.hi), sh = tok(T, S.sh);
  const cuts = HD_FRAME.cuts[S.corner || 0] ?? [], cd = cornerDist(cuts), lw = HD_FRAME.lineW, bw = lw + HD_FRAME.edgeW;
  const dist = (i, j) => {
    if (i < 0 || j < 0 || i >= w || j >= h) return -1;
    const dx = Math.min(i, w - 1 - i), dy = Math.min(j, h - 1 - j);
    return dx < 8 && dy < 8 ? cd[dy][dx] : Math.min(dx, dy);
  };
  if (S.shadow) for (let r = 0; r < HD_FRAME.shadowH; r++) for (let i = 2; i < w; i++) if (dist(i - 2, h - HD_FRAME.shadowH + r) >= 0) img.set(x + i, y + h + r, T.shadow);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const d = dist(i, j);
    if (d < 0) continue;
    let col = fill;
    if (d < lw) col = line;
    else if (d < bw) col = edge;
    else if (hi && (j === bw || (i === bw && S.press))) col = hi;
    else if (sh && j === h - 1 - bw) col = sh;
    img.set(x + i, y + j, col);
  }
  return { x: x + 4, y: y + 4, w: w - 8, h: h - 8 };
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
 * returns {visible, dissolve (0..1, stepped 3 levels), pop (1 during the first popFrames grid frames)}.
 * Default dissolve = 3 steps of 2 grid frames (200 ms, 15 fps). opts (module fix, additive):
 *   outMs       total dissolve time; the 3 steps are held round(outMs / 3 / 33.3) grid frames each (v2 bubble 600 -> 6)
 *   holdFrames  grid frames per dissolve step (overrides outMs)
 *   popFrames   grid frames of the pop drawing (default 2; 0 = no pop, e.g. reduced motion)
 * tOut = the moment the element starts to dissolve (it is gone 3 * hold grid frames later).
 */
export function envelope(t, tIn, tOut = Infinity, { outMs = null, holdFrames = null, popFrames = 2 } = {}) {
  if (t < tIn) return { visible: false, dissolve: 1, pop: 0 };
  const a = Math.floor((t - tIn) * GRID_HZ + 1e-6);
  if (t < tOut) return { visible: true, dissolve: 0, pop: a < popFrames ? 1 : 0 };
  const hold = Math.max(1, holdFrames ?? (outMs != null ? Math.round(outMs / 3 / (1000 / GRID_HZ)) : 2));
  const b = Math.floor((t - tOut) * GRID_HZ / hold + 1e-6);
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
