// D=2 art for the hud group (owner: hud; wave 2 of the density round, docs/UI-HD-WAVE2.md). Pure JS, deterministic,
// token colours only (tokens / kit ramp() of a token). Every sprite is EXACTLY 2x its 1x sprite (same anchors x2), drawn
// on the HD grid (1-px lines, 1-px light/shadow bands, round curves), never a nearest-neighbour upscale.
//
//   prepareHudHD()                     once: wrap every hud GLYPH factory (their sprites carry .hd) and install the hud
//                                      HD hooks (HA.HD_HOOKS): after it every hud drawer drawn THROUGH A DENSITY VIEW
//                                      (L.hd.screenView, hdPiece) is HD - glyphs, dial, chip, toasts, role card, voice,
//                                      joystick, spinner, badges, italics. 1x callers (plain PixelImage) are unchanged.
//   GLYPH_HD[name](T, ...args)         the HD glyphs (14x14 for the 7x7 set, 18x18 for 9x9, 10x10 for 5x5 ...)
//   dialHD(T, {stage, frac, paused})   30x30 clock medallion (bezel, ticks, wedge, 2-tone hand, hub; paused bars)
//   drawClockChipHD2(view, x, y, T, o) the clock chip through a view: HD frame + dialHD + urgent glow + paused dashes + "+ time"
//   badgeHD(n, T) · voiceDotHD(state, T, t, reduced) · waveHD(T, k, color) · spinnerHD(T, k, tones) · knobHD(T)
//   drawJoystickHD(view, x, y, T, o) · drawItalicHD(view, x, y, s, color) · toastRuleHD(view, x, y, h, st, T)
//   helpers shared by the wave-2 HD files: memo, tkey, field, paint, GOLD
import { PixelImage, ramp, drawBox, drawText, textWidth, withHD, hdPiece, shade as kshade, withAlpha, fontAt } from '../kit.js';
import * as HA from '../hud/art.js';
import { LABEL, DISPLAY, italicize } from '../hud/font.js';
import { glyphHD } from './art.js';

// ------------------------------------------------------------------------------------------------ helpers
const _tk = new WeakMap();
/** A cache key for a token set (every string token: day and night sets differ). */
export function tkey(T) {
  let k = _tk.get(T);
  if (!k) { k = Object.values(T).filter((v) => typeof v === 'string').join(''); _tk.set(T, k); }
  return k;
}
const cache = new Map();
/** Memoize fn() under key (bounded: the oldest entries go past 3000). */
export function memo(key, fn) {
  let v = cache.get(key);
  if (v === undefined) { v = fn(); cache.set(key, v); if (cache.size > 3000) cache.delete(cache.keys().next().value); }
  return v;
}
/** w x h image from f(px, py, x, y) -> colour | null (px, py = pixel centre). */
export function field(w, h, f) {
  const im = new PixelImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x + 0.5, y + 0.5, x, y); if (c) im.set(x, y, c); }
  return im;
}
/** String art (one char per HD px) through a colour key; asserts the rows are w wide. */
export function paint(rows, key, w = rows[0].length) {
  const im = new PixelImage(w, rows.length);
  rows.forEach((r, j) => {
    if (r.length !== w) throw new Error(`hd paint: row ${j} is ${r.length} wide, want ${w}: ${r}`);
    for (let i = 0; i < r.length; i++) { const c = key[r[i]]; if (c) im.set(i, j, c); }
  });
  return im;
}
export const GOLD = (T) => ({ hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine });
const KEY = (T) => ({ H: T.goldHi, M: T.gold, S: T.goldSh, L: T.goldLine, h: T.parchmentHi, P: T.parchment, p: T.parchmentSh,
  l: T.parchmentLine, D: T.inkSunk, O: T.outline, I: T.ironHi, i: T.iron, j: T.ironSh, g: T.ghost, s: T.ghostSh });
/** A filled mask in R.mid, lit from the upper left (1-px hi / sh bands) with an optional 1-px line. */
function lit(w, h, inside, R, { line = R.line, diag = false } = {}) {
  const im = field(w, h, (px, py, x, y) => (inside(px, py, x, y) ? R.mid : null));
  return kshade(im, { hi: R.hi, mid: R.mid, sh: R.sh, line }, { diag });
}

// ------------------------------------------------------------------------------------------------ glyphs (art)
const STAR = ['......HH......', '......HH......', '......HM......', '.....HHMM.....', '.....HMMM.....', '....HHMMMS....',
  'HHHHHHMMMMMSSS', 'HHHMMMMMMMSSSS', '....HMMMMS....', '.....MMMS.....', '.....MMSS.....', '......MS......', '......SS......', '......SS......'];
const DAWN = ['......HH......', '..H...HH...M..', '...H......M...', '.....HHHM.....', '....HhHMMM....', '...HHMMMMMS...',
  '...HMMMMMMS...', '..HMMMMMMMMS..', 'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS', '..............', '..SS..SS..SS..', '..............', '....SS..SS....'];
const BELL = ['......HM......', '......MS......', '....HHMMMS....', '...HHMMMMMS...', '...HhMMMMMS...', '...HhMMMMMS...',
  '...HHMMMMMS...', '..HHHMMMMMSS..', '..HHMMMMMMMS..', '.HHMMMMMMMMSS.', 'HHHMMMMMMMMSSS', 'SSSSSSSSSSSSSS', '.....SMMS.....', '......SS......'];
const CANDLE = ['....H.....', '...HH.....', '..HHhM....', '..HhhM....', '...MMS....', '....S.....', '....L.....',
  '..hPPPPp..', '..hPPPPp..', '..hPPPPp..', '..hPPPPp..', '..hPPPPp..', 'SSSSSSSSSS', 'LLLLLLLLLL'];
const HOUSE = ['......HM......', '.....HHMM.....', '....HHMMMM....', '...HHMMMMMS...', '..HHMMMMMMMS..', '.HHMMMMMMMMSS.',
  'SSSSSSSSSSSSSS', '.LLLLLLLLLLLL.', '..hPPPPPPPPp..', '..hPPPDDPPPp..', '..hPPDDDDPPp..', '..hPPDDDDPPp..', '..hPPDDDDPPp..', '..hPPDDDDPPp..'];
const GHOST = ['....gggggs....', '..gggggggsss..', '.ggggggggssss.', '.ggggggggssss.', 'gggOOgggOOssss', 'gggOOgggOOssss',
  'ggggggggggssss', 'ggggggggggssss', 'gggggggggsssss', 'gggggggggsssss', 'ggggggggssssss', 'gggg.gggss.sss', 'ggg...ggs...ss', 'gg.....s.....s'];
const SKULL = ['...hhhhhh...', '.hhPPPPPPpp.', 'hPPPPPPPPPPp', 'hPPPPPPPPPPp', 'hPDDDPPDDDPp', 'hPDDDPPDDDpp',
  'hPPPPPPPPPpp', '.pPPPPPPPPp.', '..pPPDDPPp..', '..PPPPPPPP..', '..PpPpPpPp..', '..P.P.P.p...'];
const LOCK = ['....HMMMMS....', '...HS....MS...', '..HS......MS..', '..HS......MS..', '..HS......MS..', '..HS......MS..',
  'HHHHHHHHHHHHHM', 'HMMMMMMMMMMMMS', 'HMMMMMDDMMMMMS', 'HMMMMDDDDMMMMS', 'HMMMMMDDMMMMMS', 'HMMMMMDDMMMMMS', 'HMMMMMMMMMMMMS', 'SSSSSSSSSSSSSS'];
const HAND = ['...h...h...h..', '..hPp.hPp.hPp.', '..hPp.hPp.hPp.', '..hPplhPplhPp.', '..hPplhPplhPp.', '..hPPPPPPPPPp.',
  'hhhPPPPPPPPPp.', 'hPPPPPPPPPPPp.', '.hPPPPPPPPPPp.', '..PPPPPPPPPPp.', '...PPPPPPPPp..', '....PPPPPPp...', '....ppppppp...', '.....pppp.....'];
const SCALES = ['........HM........', '........HM........', '.HHHHHHHHMMMMMMSS.', '..H.....HM.....S..', '..H.....HM.....S..',
  '.H.H....HM....S.S.', '.H.H....HM....S.S.', 'H...H...HM...S...S', 'HHMMMS..HM..HMMSS.', '.HMMS...HM...MMS..', '..SS....HM....SS..',
  '........HM........', '........HM........', '........HM........', '.....HHHMMMMS.....', '....HMMMMMMMMS....', '...SSSSSSSSSSSS...', '..................'];
const MIC = ['...####...', '..######..', '..######..', '..######..', '..######..', '#.######.#', '#..####..#', '##......##',
  '.##....##.', '..######..', '....##....', '....##....', '..######..', '..######..'];

/** The HD glyph set: same names and arguments as hud GLYPH, every sprite exactly 2x the 1x one. */
export const GLYPH_HD = {
  // toolbar (9x9 / 7x9 at 1x): the density round's 16-px toolbar art, centred in the 2x cell (prepareHudHD offsets)
  notebook: (T) => glyphHD.notebook(T),
  gear: (T) => glyphHD.gear(T),
  help: (T) => glyphHD.help(T),
  close: (T, c = T.textDim) => glyphHD.close(T, c),
  leave: (T) => memo(`leave${tkey(T)}`, () => lit(14, 14, (px, py, x, y) =>
    (x >= 1 && x <= 6 && Math.abs(py - 7) <= x - 0.5) || (x >= 6 && x <= 12 && y >= 5 && y <= 8), GOLD(T))),
  abort: (T) => memo(`abort${tkey(T)}`, () => {
    const r = ramp(T.warn);
    const im = lit(14, 14, (px, py, x, y) => {
      if (x < 1 || y < 1 || x > 12 || y > 12) return false;
      const u = x - 1, v = y - 1;
      return Math.min(u, 11 - u) + Math.min(v, 11 - v) >= 2;          // rounded 12x12 plate (+ the 1-px line = 14)
    }, r);
    im.set(3, 3, r.hi); im.set(4, 3, r.hi); im.set(3, 4, r.hi);
    return im;
  }),
  // phase / inline (7x7 at 1x)
  sun: (T) => memo(`sun${tkey(T)}`, () => {
    const im = field(14, 14, (px, py) => (Math.hypot(px - 7, py - 7) <= 3.45 ? T.gold : null));
    kshade(im, { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: null });
    im.set(5, 5, T.parchmentHi);
    const rays = [[6, 0], [7, 0], [6, 1], [7, 1], [6, 12], [7, 12], [6, 13], [7, 13], [0, 6], [0, 7], [1, 6], [1, 7], [12, 6], [12, 7], [13, 6], [13, 7],
      [2, 2], [3, 3], [11, 2], [10, 3], [2, 11], [3, 10], [11, 11], [10, 10]];
    for (const [x, y] of rays) { const s = x + y - 13; im.set(x, y, s < -4 ? T.goldHi : s > 4 ? T.goldSh : T.gold); }
    return im;
  }),
  dawn: (T) => memo(`dawn${tkey(T)}`, () => paint(DAWN, KEY(T))),
  moon: (T) => memo(`moon${tkey(T)}`, () => {
    const g = ramp(T.good);
    return field(14, 14, (px, py) => {
      if (Math.hypot(px - 7, py - 7) > 6.8 || Math.hypot(px - 10, py - 5.2) <= 5.7) return null;
      const s = px + py;
      return s < 10.5 ? g.hi : s > 16 ? g.sh : T.good;
    });
  }),
  star: (T) => memo(`star${tkey(T)}`, () => paint(STAR, KEY(T))),
  bell: (T) => memo(`bell${tkey(T)}`, () => paint(BELL, KEY(T))),
  ring: (T) => memo(`ring${tkey(T)}`, () => field(14, 14, (px, py) => {
    const dx = px - 7, dy = py - 7, r = Math.hypot(dx, dy);
    if (r > 6.7 || r < 4.5) return null;
    const s = (dx + dy) / r;
    return s < -0.6 && r > 5.6 ? T.goldHi : s > 0.5 ? T.goldSh : T.gold;
  })),
  candle: (T) => memo(`candle${tkey(T)}`, () => paint(CANDLE, KEY(T))),
  house: (T) => memo(`house${tkey(T)}`, () => paint(HOUSE, KEY(T))),
  ghost: (T) => memo(`ghost${tkey(T)}`, () => paint(GHOST, KEY(T))),
  skull: (T) => memo(`skull${tkey(T)}`, () => paint(SKULL, KEY(T))),
  lock: (T) => memo(`lock${tkey(T)}`, () => paint(LOCK, KEY(T))),
  door: (T) => memo(`door${tkey(T)}`, () => {
    const G = GOLD(T), ins = (x, y) => y >= 1 && y <= 16 && x >= 1 && x <= 16 && (y >= 9 || Math.hypot(x + 0.5 - 9, y + 0.5 - 9) <= 8);
    const im = lit(18, 18, (px, py, x, y) => ins(x, y), G);
    const inner = (x, y) => ins(x - 1, y) && ins(x + 1, y) && ins(x, y - 1) && ins(x, y + 1);
    for (let y = 3; y <= 15; y++) for (const x of [6, 11]) if (inner(x, y)) im.set(x, y, T.goldSh);   // plank seams
    for (const y of [5, 12]) for (let x = 2; x <= 15; x++) if (inner(x, y)) im.set(x, y, T.goldLine);   // iron straps
    im.set(13, 8, T.goldHi); im.set(14, 8, T.goldSh); im.set(13, 9, T.parchmentHi); im.set(14, 9, T.goldSh);   // handle
    return im;
  }),
  hand: (T) => memo(`hand${tkey(T)}`, () => paint(HAND, KEY(T))),
  snow: (T) => memo(`snow${tkey(T)}`, () => {
    const im = new PixelImage(14, 14), px = [];
    for (let k = 1; k <= 12; k++) px.push([6, k], [7, k], [k, 6], [k, 7]);
    for (let k = 2; k <= 3; k++) px.push([6 - k, 6 - k], [7 + k, 6 - k], [6 - k, 7 + k], [7 + k, 7 + k]);
    for (const [a, b] of [[5, 2], [8, 2], [5, 11], [8, 11], [2, 5], [2, 8], [11, 5], [11, 8]]) px.push([a, b]);   // a V tick on each arm end
    for (const [x, y] of px) im.set(x, y, x + y < 13 ? T.ghost : T.ghostSh);
    im.set(6, 6, ramp(T.ghost).hi);
    return im;
  }),
  scales: (T) => memo(`scales${tkey(T)}`, () => paint(SCALES, KEY(T))),
  // controls (5x5 / 4x5 / 5x1 / 5x3 at 1x): one flat colour like the 1x, rounder shapes
  pause: (T, c = T.text) => memo(`pause${c}`, () => field(10, 10, (px, py, x, y) => ((x <= 3 || x >= 6) && !((y === 0 || y === 9) && (x === 0 || x === 3 || x === 6 || x === 9)) ? c : null))),
  play: (T, c = T.text) => memo(`play${c}`, () => field(8, 10, (px, py) => (px <= 0.6 + 7.6 * (1 - Math.abs(py - 5) / 5) ? c : null))),
  minus: (T, c = T.text) => memo(`minus${c}`, () => field(10, 2, () => c)),
  plus: (T, c = T.text) => memo(`plus${c}`, () => field(10, 10, (px, py, x, y) => ((x === 4 || x === 5) || (y === 4 || y === 5) ? c : null))),
  caretUp: (T, c = T.gold) => memo(`cu${c}`, () => field(10, 6, (px, py) => (Math.abs(px - 5) <= py * 0.95 + 0.6 ? c : null))),
  caretDown: (T, c = T.gold) => memo(`cd${c}`, () => field(10, 6, (px, py) => (Math.abs(px - 5) <= (6 - py) * 0.95 + 0.6 ? c : null))),
  mic: (T, c = T.text, off = false) => memo(`mic${c}${off}${tkey(T)}`, () => {
    const im = paint(MIC, { '#': c });
    if (off) { const r = ramp(T.danger); for (let i = 0; i < 14; i++) { const x = Math.round(i * 9 / 13); im.set(x, i, r.hi); im.set(x + 1, i, r.line); } }
    return im;
  }),
};

// ------------------------------------------------------------------------------------------------ dial / chip
/**
 * 30x30 clock medallion (hud dial at D=2): 1-px goldLine rim, a 3-px lit bezel (hi upper-left, sh lower-right, a cream
 * glint), the bezel's inner lip, a dark face with 4 hour ticks, the stage wedge, a 2-tone hand with a hub. Paused: the
 * wedge in a 1-px checker (v2 35 %) and two parchment bars.
 */
export function dialHD(T, { stage = 'discussion', frac = 1, paused = false } = {}) {
  const P = HA.stagePal(stage, T), q = Math.round(frac * 240) / 240;
  return memo(`dial${stage}${q}${paused}${tkey(T)}`, () => {
    const S = 30, c = 15, R = 14.8, Rb = R - 1, Rf = Rb - 3, im = new PixelImage(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
      if (d > R) continue;
      if (d > Rb) { im.set(x, y, T.goldLine); continue; }
      if (d > Rf) {
        const s = (dx + dy) / d;
        im.set(x, y, s < -0.55 ? T.goldHi : s > 0.55 ? T.goldSh : T.gold);
        if (s < -0.9 && d > Rf + 1 && d <= Rf + 2) im.set(x, y, T.parchmentHi);   // the glint
        continue;
      }
      if (d > Rf - 1) { im.set(x, y, T.goldLine); continue; }
      let col = T.inkSunk;
      const a = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
      const inW = q >= 0.999 || (q > 0.002 && a < q);
      if (inW && (!paused || ((x + y) & 1) === 0)) col = P.wedge;
      im.set(x, y, col);
    }
    for (const [x, y] of [[14, 5], [15, 5], [14, 6], [15, 6], [14, 23], [15, 23], [14, 24], [15, 24], [5, 14], [5, 15], [6, 14], [6, 15], [23, 14], [23, 15], [24, 14], [24, 15]]) {
      const a = (Math.atan2(x + 0.5 - c, -(y + 0.5 - c)) / (2 * Math.PI) + 1) % 1;
      if (!(q >= 0.999 || (q > 0.002 && a < q))) im.set(x, y, T.ironSh);         // hour ticks on the empty face
    }
    if (paused) { im.rect(11, 10, 3, 10, T.parchment); im.rect(16, 10, 3, 10, T.parchment); im.vline(11, 10, 10, T.parchmentHi); im.vline(16, 10, 10, T.parchmentHi); }
    else {
      const a = (q > 0.002 ? q : 0) * 2 * Math.PI, r = Rf - 2.2, ex = c + Math.sin(a) * r, ey = c - Math.cos(a) * r;
      const steep = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
      im.line(Math.floor(c) + (steep ? 1 : 0), Math.floor(c) + (steep ? 0 : 1), Math.floor(ex) + (steep ? 1 : 0), Math.floor(ey) + (steep ? 0 : 1), T.parchmentSh);
      im.line(Math.floor(c), Math.floor(c), Math.floor(ex), Math.floor(ey), T.parchmentHi);
      im.rect(14, 14, 2, 2, T.gold); im.set(14, 14, T.goldHi);
    }
    return im;
  });
}
const chipStyle = (edge) => ({ line: 'outline', edge, fill: 'ink', hi: 'inkRaised', sh: null, corner: 2, shadow: false });
/** Glow bands round the opaque shape of an HD image by Euclidean distance (rounded corners): n = 1 -> 2 HD px at
 *  alpha 110; n = 2 -> 2 px at 150 + 2 px at 70 (the 1x 1-texel rings, 2 alpha steps, light FX only). */
function glowHD(shape, color, n) {
  const g = new PixelImage(shape.w, shape.h), pts = [];
  for (let y = 0; y < shape.h; y++) for (let x = 0; x < shape.w; x++) if (shape.alpha(x, y) >= 128) pts.push([x, y]);
  const near = (x, y, r) => { for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) if (i * i + j * j <= r * r && shape.alpha(x + i, y + j) >= 128) return true; return false; };
  for (let y = 0; y < shape.h; y++) for (let x = 0; x < shape.w; x++) {
    if (shape.alpha(x, y)) continue;
    if (near(x, y, 2.3)) g.set(x, y, withAlpha(color, n === 2 ? 150 : 110));
    else if (n === 2 && near(x, y, 4.3)) g.set(x, y, withAlpha(color, 70));
  }
  void pts;
  return g;
}
/**
 * hud drawClockChip at D=2 through a density view (falls back to the 1x drawer on a plain image). Same logical
 * geometry and state object as the 1x chip: HD frame, dialHD, LABEL / DISPLAY in label@2 / display@2, urgent glow
 * (2 rings of 2 HD px, 2 alpha steps, rounded corners), paused = dashed keyline (3 on / 3 off HD px), "+ time" pill.
 */
export function drawClockChipHD2(view, x, y, T, o) {
  if (!view.isView) return HA.drawClockChip(view, x, y, T, o);
  const P = HA.stagePal(o.paused ? 'paused' : o.stage, T), w = HA.clockChipWidth(o), H = 15, D = view.density;
  const edge = o.urgent ? T.danger : P.edge;
  const shape = memo(`chip${w}${edge}${o.stage}${Math.round((o.frac ?? 1) * 240)}${!!o.paused}${tkey(T)}`, () => {
    const s = hdPiece(w + 4, H + 4, (v) => drawBox(v, 9, 2, w - 7, H, chipStyle(edge), T), D);
    s.blit(dialHD(T, { stage: o.stage, frac: o.frac, paused: o.paused }), 2 * D, 2 * D);
    if (P.dashed) {                                     // v2 border-style: dashed (paused), on the 2-px keyline rows
      const X0 = 9 * D, Y0 = 2 * D, W = (w - 7) * D, Hh = H * D;
      for (let i = 10; i < W - 6; i++) if (Math.floor((i - 10) / 3) % 2 === 1) for (const yy of [Y0 + 1, Y0 + 2, Y0 + Hh - 3, Y0 + Hh - 2]) s.set(X0 + i, yy, T.ink);
    }
    return s;
  });
  const bx = (x - 2) * D + view.ox, by = (y - 2) * D + view.oy;
  if (o.urgent && !o.reduced) { const n = HA.pulseBands(o.t || 0); if (n) view.base.blit(memo(`glow${n}${w}${tkey(T)}${shape.w}`, () => glowHD(shape, T.danger, n)), bx, by); }
  view.base.blit(shape, bx, by);
  let cx = x + 19;
  const label = o.label.toUpperCase();
  drawText(view, cx, y + 5, label, { color: o.due ? T.goldHi : P.label, font: LABEL });
  cx += textWidth(label, LABEL) + 5;
  if (o.time) drawText(view, cx, y + 2, o.time, { color: o.urgent ? ramp(T.danger).hi : P.time, font: DISPLAY });
  if (o.plus) HA.drawPlus(view, x + w - 2 - (textWidth('+ time') + 10), y + 2, o.plus, T);
  return { w, h: H };
}

// ------------------------------------------------------------------------------------------------ small sprites
/** cth-badge at D=2: 18x18 danger disc, lit crescent + glint, 1-px own line, the count in label@2. */
export function badgeHD(n, T) {
  return memo(`badge${Math.min(n, 9)}${tkey(T)}`, () => {
    const r = ramp(T.danger), im = field(18, 18, (px, py) => {
      const dx = px - 9, dy = py - 9, d = Math.hypot(dx, dy);
      if (d > 8.8) return null;
      if (d > 7.8) return r.line;
      const s = (dx + dy) / Math.max(1, d);
      return s < -0.6 && d > 5.2 ? r.hi : s > 0.6 && d > 5.6 ? r.sh : T.danger;
    });
    im.set(5, 4, T.parchmentHi);
    drawText(im, 9, 4, String(Math.min(n, 9)), { font: fontAt(LABEL, 2), color: T.parchmentHi, align: 'center' });
    return im;
  });
}
/** ctv-dot at D=2 (18x18): a lit disc (r 5.2) + glint; live = 2 glow rings x 2 HD px; bad = a ring; wait pulses. */
export function voiceDotHD(state, T, t = 0, reduced = false) {
  const dim = state === 'wait' && !reduced && HA.gf(t) % Math.round(HA.TIMING.WAIT_PULSE_MS / 1000 * 30) >= 15;
  return memo(`vdot${state}${dim}${tkey(T)}`, () => {
    const tones = state === 'ok' ? ramp(T.ok) : state === 'live' || state === 'bad' ? ramp(T.danger)
      : state === 'wait' ? (dim ? { hi: T.gold, mid: T.goldSh, sh: T.goldLine } : { hi: T.goldHi, mid: T.gold, sh: T.goldSh }) : { hi: T.ironHi, mid: T.iron, sh: T.ironSh };
    const disc = () => field(18, 18, (px, py) => {
      const dx = px - 9, dy = py - 9, d = Math.hypot(dx, dy);
      if (d > 5.2) return null;
      if (state === 'bad' && d < 2.4) return null;
      const s = (dx + dy) / Math.max(0.5, d);
      return s < -0.5 && d > 2.2 ? tones.hi : s > 0.5 && d > 3.2 ? tones.sh : tones.mid;
    });
    const im = disc();
    if (state !== 'bad') im.set(7, 6, T.parchmentHi);
    if (state === 'bad') { const rr = ramp(T.danger); for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) { const d = Math.hypot(x + 0.5 - 9, y + 0.5 - 9); if (d >= 2.4 && d < 3.3) im.set(x, y, rr.line); } }
    if (state === 'live') { const g = im.clone(); [140, 140, 60, 60].forEach((a, i) => g.outline(withAlpha(T.danger, a), { diag: i % 2 === 1 })); g.blit(im, 0, 0); return g; }
    return im;
  });
}
/** ctv-wave at D=2 (14x14): the same 4 drawings, 3 bars 2 HD px wide with lit tops (heights in HD px). */
export function waveHD(T, k, color = T.ok) {
  return memo(`wave${k % 4}${color}`, () => {
    const im = new PixelImage(14, 14), r = ramp(color);
    HA.WAVE[k % 4].forEach((h, i) => {
      const H = 2 * h, top = 7 - h, x = 2 + i * 4;
      im.rect(x, top, 2, H, color); im.hline(x, top, 2, r.hi); im.hline(x, top + H - 1, 2, r.sh);
    });
    return im;
  });
}
/** ct-spinner at D=2 (18x18): 8 round dots (r 1.5) on a true circle, the same comet tail and 10 fps drawings. */
export function spinnerHD(T, k, { head = T.goldHi, mid = T.gold, tail = T.goldSh, rest = T.ironSh } = {}) {
  return memo(`spin${k % 8}${head}${mid}${tail}${rest}`, () => {
    const im = new PixelImage(18, 18);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, d = (k - i + 8) % 8, c = d === 0 ? head : d === 1 ? mid : d === 2 ? tail : rest;
      im.disc(9 + Math.sin(a) * 6.2, 9 - Math.cos(a) * 6.2, d === 0 ? 1.9 : 1.5, c);
    }
    return im;
  });
}
/** The joystick knob at D=2 (56x56): a gold sphere, 4 tone bands round the light spot, 1-px goldLine, cream glint. */
export function knobHD(T) {
  return memo(`knob${tkey(T)}`, () => {
    const im = field(56, 56, (px, py) => {
      const dx = px - 28, dy = py - 28, d = Math.hypot(dx, dy), r = 26;
      if (d > r) return null;
      if (d > r - 1) return T.goldLine;
      const l = Math.hypot((dx + 9) / r, (dy + 9) / r);
      return l < 0.3 ? T.goldHi : l < 0.62 ? T.goldHi : l < 1.12 ? T.gold : l < 1.3 ? T.goldSh : T.goldLine;
    });
    for (let y = 0; y < 56; y++) for (let x = 0; x < 56; x++) { const d = Math.hypot(x + 0.5 - 18.5, y + 0.5 - 18); if (d <= 2.6 && im.alpha(x, y)) im.set(x, y, T.parchmentHi); }
    return im;
  });
}
/** ct-touch-stick at D=2 through a view: 128 HD px, finer rim (2-px gold keyline, 2-px bevel arc, groove), knob 56. */
export function drawJoystickHD(view, x, y, T, { active = false, kx = 0, ky = 0 } = {}) {
  const Dn = view.density, S = 64 * Dn, c = S / 2;
  const ring = memo(`stick${active}${S}${tkey(T)}`, () => field(S, S, (px, py) => {
    const dx = px - c, dy = py - c, d = Math.hypot(dx, dy);
    if (d > c) return null;
    const s = (dx + dy) / Math.max(1, d);
    if (d > c - 1) return T.outline;
    if (d > c - 3) return s < -0.6 ? (active ? T.goldHi : T.gold) : active ? T.gold : T.goldSh;
    if (d > c - 5) return s < -0.75 ? T.ironHi : s > 0.75 ? T.ironSh : T.inkSunk;
    if (d > c - 14) return Math.abs(d - (c - 9.5)) < 0.5 && s > -0.2 ? T.ink : T.inkSunk;
    if (d > c - 15) return active ? T.goldSh : T.iron;
    if (d > c - 16) return active ? T.goldLine : T.ironSh;
    return T.scrim;
  }));
  const X = x * Dn + view.ox, Y = y * Dn + view.oy;
  view.base.blit(ring, X, Y);
  const m = Math.hypot(kx, ky), lim = 18, s = m > lim ? lim / m : 1;
  view.base.blit(knobHD(T), X + c - 28 + Math.round(kx * s * Dn), Y + c - 28 + Math.round(ky * s * Dn));
  return { w: 64, h: 64 };
}
/** drawItalic at D=2: the body@2 line sheared 1 HD px per 3 rows (the 1x slant, half-size steps). Returns the 1x width. */
export function drawItalicHD(view, x, y, s, color) {
  const D = view.density, w = textWidth(s) + 4;
  const tmp = new PixelImage(w * D, 9 * D);
  drawText(tmp, D, 0, s, { color, font: fontAt('body', D) });
  view.base.blit(italicize(tmp, 0, 6 * D), (x - 1) * D + view.ox, y * D + view.oy);
  return w;
}
/** The toast's left rule at D=2 (replaces the 1x 2-texel rule): 3 HD px inside the line, lit left column + top row, sh foot. */
export function toastRuleHD(view, x, y, h, st, T) {
  const D = view.density, X = x * D + view.ox, Y = y * D + view.oy, H = h * D, r = ramp(st.rule);
  view.base.rect(X + 1, Y + 2, 3, H - 4, st.rule);
  view.base.vline(X + 1, Y + 2, H - 4, st.ruleHi);
  view.base.hline(X + 1, Y + 2, 3, st.ruleHi);
  view.base.hline(X + 2, Y + H - 3, 2, r.sh);
}

// ------------------------------------------------------------------------------------------------ hooks
const OFF16 = { notebook: true, gear: true, help: true };
let installed = false;
/**
 * Install the hud D=2 path (idempotent, global, cheap): every HA.GLYPH factory returns its 1x sprite with `.hd` (the
 * GLYPH_HD art; the 16-px toolbar glyphs centred), and HA.HD_HOOKS route the drawers that build their own images
 * (clock chip, italic, joystick, toast rule) and the small sprite factories (badge, voice dot, wave, spinner, knob,
 * dial) to the HD versions WHEN the target is a density view. 1x drawing is byte-identical (shots/ui-hd-wave2/regress.mjs).
 */
export function prepareHudHD() {
  if (installed) return;
  installed = true;
  const G = HA.GLYPH;
  for (const k of Object.keys(GLYPH_HD)) {
    const f = G[k];
    if (typeof f !== 'function') continue;
    G[k] = (TT, ...a) => {
      const s = f(TT, ...a);
      if (!s.hd) { const h = GLYPH_HD[k](TT, ...a); withHD(s, h, OFF16[k] ? { x: Math.floor((s.w * 2 - h.w) / 2), y: Math.floor((s.h * 2 - h.h) / 2) } : null); }
      return s;
    };
  }
  Object.assign(HA.HD_HOOKS, {
    drawClockChip: drawClockChipHD2,
    drawItalic: drawItalicHD,
    drawJoystick: drawJoystickHD,
    toastRule: toastRuleHD,
    badge: badgeHD,
    voiceDot: voiceDotHD,
    wave: waveHD,
    spinner: spinnerHD,
    knob: knobHD,
    dial: (T, o) => ((o.size ?? 15) === 15 ? dialHD(T, o) : null),
  });
}
