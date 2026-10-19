// D=2 art (owner: UI lead; docs/UI.md "Density"). Hand-drawn / procedural HD versions of the library sprites the
// user called out (pins, the social palette's swatches, the toolbar glyphs, the clock dial), plus the hooks that make
// the 1x drawers pick them up through a density view. Pure JS (no three.js), deterministic, token colours only.
//
//   prepareHD(T)          attach .hd to the memoized 1x sprites for a token set (emotes pin swatches / pin glyph / glove)
//                         and wrap hud GLYPH factories (close, notebook, gear, help) once: after it, E.drawDock(view, ...)
//                         and HA.drawKeyHint(view, ...) draw HD swatches / glyphs with no other change
//   pinHD(color, T)                36x52 world pin (= markers pin_<color> 18x26 at D=2; anchor ANCHORS_HD.pin)
//   pinWithIconHD(color, icon, T)  + the dropper's portrait in the 24-px socket (a 24x24 avatar 1:1, a 12x12 icon x2)
//   swatchHD(color, T, {icon})     18x24 palette pin (= emotes pinIcon 9x12): a crisp socket + a clear icon
//   pinGlyphHD(color, T)           14x18 small pin (= emotes pinIconSmall 7x9, the Pin toggle / armed pill)
//   gloveHD(T)                     18x18 pointing glove (= emotes emotePointSmall 9x9)
//   glyphHD.notebook|gear|help|close|bulb(T[, lit])   toolbar glyphs (16x16 class)
//   toolButtonHD(key, state, T, {lit})  a 30x30 toolbar button (= the demo's 15x15 tool buttons)
//   drawClockChipHD(view, x, y, T, o)   hud drawClockChip through a view with an HD frame + a 30-px dial
// Language (docs/UI.md §2 at D=2): lines 1 HD px in the material's own line tone, 3 tones lit from the upper left, a
// cream rim glint, binary alpha. Sizes are exactly 2x the 1x sprites (anchors x2), so layouts and anchors carry over.
import { PixelImage, ramp, drawBox, drawText, textWidth, withHD, hdPiece, DensityView, upscale, PIN_COLORS } from '../kit.js';
import * as E from '../emotes/art.js';
import * as HA from '../hud/art.js';
import { PIN_ART, ANCHORS, paintGrid } from '../markers/art.js';
import { LABEL, DISPLAY } from '../hud/font.js';

/** Anchors of the HD sprites (x2 of markers ANCHORS). */
export const ANCHORS_HD = Object.fromEntries(Object.entries(ANCHORS).map(([k, a]) => [k, { x: a.x * 2, y: a.y * 2 }]));
const cache = new Map();
const memo = (k, fn) => { let v = cache.get(k); if (!v) { v = fn(); cache.set(k, v); } return v; };
const tk = (T) => `${T.ink}${T.gold}${T.parchment}`;

// ------------------------------------------------------------------------------------------------ pins
/** A teardrop pin (head circle + cone to a 2-px tip) at any size; returns the drawn image. Shared by all HD pins. */
function teardrop({ W, H, cx, cy, hr, tipX, tipY, sockR, color, T, lip = 2, rim = true }) {
  const R = PIN_ART[color], img = new PixelImage(W, H);
  const d = tipY - cy, a = Math.acos(Math.min(1, hr / d)), tx = hr * Math.sin(a), ty = cy + hr * Math.cos(a);
  const ins = (px, py) => {
    if ((px - cx) ** 2 + (py - cy) ** 2 <= hr * hr) return true;
    if (py >= ty && py <= tipY) {
      const t = (py - ty) / (tipY - ty), l = cx - tx + (tipX - (cx - tx)) * t, r = cx + tx + (tipX - (cx + tx)) * t;
      return px >= l - 0.25 && px <= r + 0.25;
    }
    return false;
  };
  const M = (x, y) => x >= 0 && y >= 0 && x < W && y < H && ins(x + 0.5, y + 0.5);
  const sd = (x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  const tipCol = Math.floor(tipX - 0.5);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!M(x, y)) continue;
    if (!M(x - 1, y) || !M(x + 1, y) || !M(x, y - 1) || !M(x, y + 1)) { img.set(x, y, R.line); continue; }
    const r = sd(x, y), dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (sockR && r <= sockR) {
      if (r > sockR - 1) {                                   // the socket's 1-px wall: upper-left in shadow, lower-right lit
        const ul = dx + dy < 0;
        img.set(x, y, color === 'white' ? (ul ? R.line : R.sh) : ul ? T.parchmentSh : T.parchmentHi);
      } else img.set(x, y, T.parchment);
      continue;
    }
    let c;
    if (y + 0.5 > cy + hr * 0.62 && r > hr - 1.4) {         // the cone: left face lit, right face in shade
      c = x < tipCol ? R.mid : R.sh;
      if (x === tipCol - 1 || (x < tipCol && !M(x - 2, y))) c = R.hi;
    } else {
      const v = -(dx * 0.62 + dy * 0.78) / Math.max(1, r);
      c = v > 0.42 ? R.hi : v > -0.3 ? R.mid : R.sh;
      if (sockR && r <= sockR + lip) c = v > 0.2 ? R.sh : v < -0.3 ? R.hi : R.mid;   // the inner lip (a donut)
    }
    img.set(x, y, c);
  }
  if (rim) {                                                   // cream rim glint on the upper-left, just inside the line
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!M(x, y)) continue;
      const r = sd(x, y), ang = Math.atan2(y + 0.5 - cy, x + 0.5 - cx) * 180 / Math.PI;
      if (r > hr - 2.6 && r <= hr - 1.5 && ang > -150 && ang < -112) img.set(x, y, color === 'white' ? R.hi : T.parchmentHi);
    }
  }
  return img;
}
/** 36x52 world pin (markers pin_<color> at D=2): 24-px socket at (6, 6), tip anchor ANCHORS_HD.pin = (16, 50). */
export const pinHD = (color, T) => memo(`pin${color}${tk(T)}`, () =>
  teardrop({ W: 36, H: 52, cx: 18, cy: 18, hr: 17.7, tipX: 17, tipY: 51.95, sockR: 12, color, T }));
/** The 24-px socket's inner disc (icon-local coords, 24x24). */
export const inSocketHD = (x, y) => (x + 0.5 - 12) ** 2 + (y + 0.5 - 12) ** 2 <= 11 * 11;
/**
 * The world pin with the dropper's portrait: icon = a 24x24 avatar (portraits atlas avatar / roster thumb: 1:1, the
 * sharpest), a 12x12 icon (block x2: the 1x look) or an HD-ready image. Masked to the socket's inner disc. key = cache key.
 */
export function pinWithIconHD(color, icon, T, key = '') {
  // (wave 1) an icon carrying `.hd` (portraits loader {hd: true}: the 24x24 HD re-render) goes in as that, 1:1
  return memo(`piw${color}|${key}|${icon?.hd ? 'hd' : ''}|${tk(T)}`, () => {
    const im = pinHD(color, T).clone();
    if (!icon) return im;
    const s0 = icon.hd ?? icon, src = s0.w <= 12 ? upscale(s0, 2) : s0;
    const ox = Math.floor((24 - src.w) / 2), oy = Math.floor((24 - src.h) / 2);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      if (!inSocketHD(x, y)) continue;
      const c = src.get(x - ox, y - oy);
      if (c[3]) im.set(6 + x, 6 + y, c);
    }
    return im;
  });
}
/** A bust silhouette (head + shoulders) clipped to a disc: the "a person's pin" mark of the palette swatches. */
function bust(img, cx, cy, r, c) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const px = x + 0.5, py = y + 0.5;
    if ((px - cx) ** 2 + (py - cy) ** 2 > r * r) continue;
    const head = (px - cx) ** 2 + (py - (cy - r * 0.32)) ** 2 <= (r * 0.42) ** 2;
    const sh = ((px - cx) / (r * 0.86)) ** 2 + ((py - (cy + r * 0.98)) / (r * 0.78)) ** 2 <= 1;
    if (head || sh) img.set(x, y, c);
  }
}
/**
 * 18x24 palette swatch pin (emotes pinIcon at D=2, tip (8..9, 23)): a round socket (crisp, never a square) holding a
 * clear icon. icon: 'bust' (default: a person's mark in ink) | 'dot' | 'none' | a PixelImage (e.g. your 12x12 portrait
 * icon, masked to the socket).
 */
export function swatchHD(color, T, { icon = 'bust' } = {}) {
  const key = typeof icon === 'string' ? icon : `img${icon.w}x${icon.h}${icon.data[0]}${icon.data[icon.data.length >> 1]}`;
  return memo(`sw${color}${key}${tk(T)}`, () => {
    const img = teardrop({ W: 18, H: 24, cx: 9, cy: 8.6, hr: 8.55, tipX: 9, tipY: 23.95, sockR: 5.2, color, T, lip: 1, rim: true });
    const ink = color === 'black' ? T.inkSunk : T.textInk;
    if (icon === 'bust') bust(img, 9, 8.6, 4.2, ink);
    else if (icon === 'dot') img.disc(9, 8.6, 1.7, ink);
    else if (icon && typeof icon === 'object') {
      const s = icon.w > 9 ? icon : icon;
      for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) {
        if ((x + 0.5 - 9) ** 2 + (y + 0.5 - 8.6) ** 2 > 4.2 * 4.2) continue;
        const c = s.get(x - Math.floor(9 - s.w / 2), y - Math.floor(8.6 - s.h / 2));
        if (c[3]) img.set(x, y, c);
      }
    }
    return img;
  });
}
/** 14x18 small pin (emotes pinIconSmall at D=2): socket with an ink dot. */
export const pinGlyphHD = (color, T) => memo(`pg${color}${tk(T)}`, () => {
  const img = teardrop({ W: 14, H: 18, cx: 7, cy: 6.6, hr: 6.55, tipX: 7, tipY: 17.95, sockR: 3.4, color, T, lip: 1, rim: false });
  img.rect(6, 6, 2, 2, color === 'black' ? T.inkSunk : T.textInk);
  return img;
});

// ------------------------------------------------------------------------------------------------ glove
const GLOVE_HD = [
  '...wwww........',
  '..wwwwww.......',
  'ccwwwwwwwwwwwww',
  'ccwwwwwwwwwwwww',
  'ccwwwwwwww.....',
  'ccwkkkkkkw.....',
  'ccwwwwwwwww....',
  'ccwwwwwwwww....',
  'ccwkkkkkkw.....',
  'ccwwwwwwwww....',
  'ccwwwwwwwww....',
  'ccwwwwwwww.....',
  '..wwwwwwww.....',
  '...wwwwww......',
];
/** 18x18 pointing glove (emotes emotePointSmall 9x9 at D=2): parchment glove, gold cuff, curled-finger creases. */
export const gloveHD = (T) => memo(`gl${tk(T)}`, () => {
  const img = new PixelImage(18, 18);
  const glove = { hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh, line: T.parchmentLine };
  paintGrid(img, GLOVE_HD, 1, 2, { w: glove, c: { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine }, k: { flat: T.parchmentSh, line: T.parchmentLine } }, { k: 'w' });
  return img;
});

// ------------------------------------------------------------------------------------------------ toolbar glyphs
const gk = (T) => ({ H: T.goldHi, M: T.gold, S: T.goldSh, L: T.goldLine, P: T.parchment, p: T.parchmentSh, h: T.parchmentHi, D: T.inkSunk,
  n: T.parchmentLine, I: T.ironHi, i: T.iron, O: T.outline, r: T.danger });
const NOTEBOOK = [
  '.LLLLLLLLLLLLLL.',
  'LHMLhhhhhhhhhhpL',
  'LHMLhPPPPPPPPPpL',
  'LHMLhPnnnnnnPPpL',
  'LHMLhPPPPPPPPPpL',
  'LHMLhPnnnnnPPPpL',
  'LHMLhPPPPPPPPPpL',
  'LMSLhPnnnnnnPPpL',
  'LMSLhPPPPPPPPPpL',
  'LMSLhPnnnPPPPPpL',
  'LMSLhPPPPPPPPrpL',
  'LSSLhPPPPPPPPrpL',
  'LSSLppppppppprpL',
  '.LLLLLLLLLLLLrLL',
  '.............L..',
];
const BULB_OFF = [
  '....hhhhh....',
  '..hhPPPPPpp..',
  '.hPPPPPPPPPp.',
  'hPPPDPPPDPPPp',
  'hPPPPDPDPPPPp',
  'hPPPPPDPPPPPp',
  'hPPPPPDPPPPPp',
  '.pPPPPDPPPPp.',
  '..pPPPDPPPp..',
  '...pPPPPPp...',
  '....IIIIi....',
  '....iiiii....',
  '....IIIIi....',
  '.....iii.....',
];
const BULB_ON = [
  '....HHHHH....',
  '..HHhhhhHMM..',
  '.HhhhhhhhHMM.',
  'HhhhPhhhPhMMS',
  'HhhhhPhPhhMMS',
  'HHhhhhPhhhMMS',
  'HHhhhhPhhMMMS',
  '.HHhhhPhhMMS.',
  '..HMhhPhMMS..',
  '...SMMMMMS...',
  '....IIIIi....',
  '....iiiii....',
  '....IIIIi....',
  '.....iii.....',
];
const HELP = [
  '..HHHHHH..',
  '.HHMMMMMS.',
  'HHMS..MMMS',
  'HMS....MMS',
  '.......MMS',
  '......MMS.',
  '.....MMS..',
  '....MMS...',
  '....MMS...',
  '..........',
  '....MMS...',
  '....MSS...',
];
const sprite = (rows, key) => HA.sprite(rows, key);
const lined = (im, line) => { const o = new PixelImage(im.w + 2, im.h + 2); o.blit(im, 1, 1); o.outline(line, {}); return o; };
export const glyphHD = {
  notebook: (T) => memo(`nb${tk(T)}`, () => sprite(NOTEBOOK, gk(T))),
  /** a cog: 8 teeth round a hub with a hole, lit from the upper left (procedural on the HD grid) */
  gear: (T) => memo(`gear${tk(T)}`, () => {
    const im = new PixelImage(16, 16), c = 8;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const tooth = Math.cos(8 * a) > 0.25;
      if (r > (tooth ? 7.4 : 5.6) || r < 2.3) continue;
      const s = (dx + dy) / Math.max(1, r);
      im.set(x, y, s < -0.45 ? T.goldHi : s > 0.55 ? T.goldSh : T.gold);
    }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {   // hub ring: a 1-px line round the hole
      const r = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (r >= 2.3 && r < 3.3 && im.alpha(x, y)) im.set(x, y, T.goldLine);
    }
    im.outline(T.goldLine, {});
    return im;
  }),
  help: (T) => memo(`help${tk(T)}`, () => lined(sprite(HELP, gk(T)), T.goldLine)),
  close: (T, c = T.textDim) => memo(`cl${c}${tk(T)}`, () => {
    const im = new PixelImage(10, 10);
    for (let k = 0; k < 9; k++) { im.set(k, k, c); im.set(k + 1, k, c); im.set(8 - k, k, c); im.set(9 - k, k, c); }
    return im;
  }),
  bulb: (T, lit = false) => memo(`bulb${lit}${tk(T)}`, () => {
    const g = lined(sprite(lit ? BULB_ON : BULB_OFF, gk(T)), lit ? T.goldLine : T.outline);
    if (!lit) return g;
    const o = new PixelImage(g.w + 6, g.h + 4);
    o.blit(g, 3, 2);
    for (const [x, y] of [[10, 0], [11, 0], [2, 3], [1, 2], [19, 3], [20, 2], [0, 8], [21, 8]]) o.set(x, y, T.goldHi);
    return o;
  }),
};
/** A toolbar button at D=2: 30x30 HD (= the demo's 15x15 tool buttons), frame state raised|hover|pressed|gold. */
export function toolButtonHD(key, state, T, { lit = false } = {}) {
  return memo(`tb${key}${state}${lit}${tk(T)}`, () => hdPiece(15, 15, (v) => {
    drawBox(v, 0, 0, 15, 15, lit && state !== 'pressed' ? 'gold' : state, T);
    const g = key === 'tip' ? glyphHD.bulb(T, lit) : glyphHD[key](T), q = state === 'pressed' ? 2 : 0;
    v.base.blit(g, Math.floor((30 - g.w) / 2) + q, Math.floor((30 - g.h) / 2) + q);
  }));
}

// ------------------------------------------------------------------------------------------------ clock chip
const chipStyle = (edge) => ({ line: 'outline', edge, fill: 'ink', hi: 'inkRaised', sh: null, corner: 2, shadow: false });
/**
 * hud drawClockChip at D=2 through a view: the chip frame as an HD frame, the dial medallion at 30 px (hud dial(),
 * size 30: a 1-px bezel, a smooth wedge and a 1-px hand), the LABEL / DISPLAY text in label@2 / display@2. Same
 * logical geometry as the 1x chip (x, y = the dial's left edge). Urgent glow / paused dashes: not drawn (follow-up).
 */
export function drawClockChipHD(view, x, y, T, o) {
  if (!view.isView) return HA.drawClockChip(view, x, y, T, o);
  const P = HA.stagePal(o.paused ? 'paused' : o.stage, T), w = HA.clockChipWidth(o), H = 15, D = view.density;
  const edge = o.urgent ? T.danger : P.edge;
  const shape = hdPiece(w + 4, H + 4, (v) => drawBox(v, 9, 2, w - 7, H, chipStyle(edge), T), D);
  shape.blit(HA.dial(T, { stage: o.stage, frac: o.frac, paused: o.paused, size: 15 * D }), 2 * D, 2 * D);
  view.base.blit(shape, (x - 2) * D + view.ox, (y - 2) * D + view.oy);
  let cx = x + 19;
  const label = o.label.toUpperCase();
  drawText(view, cx, y + 5, label, { color: o.due ? T.goldHi : P.label, font: LABEL });
  cx += textWidth(label, LABEL) + 5;
  if (o.time) drawText(view, cx, y + 2, o.time, { color: o.urgent ? ramp(T.danger).hi : P.time, font: DISPLAY });
  return { w, h: H };
}

// ------------------------------------------------------------------------------------------------ hooks
let glyphsWrapped = false;
/**
 * Attach the HD sprites to the 1x sprites of token set T (idempotent, cheap after the first call): emotes pinIcon
 * (swatches) -> swatchHD, pinIconSmall -> pinGlyphHD, emotePointSmall -> gloveHD; and (once) wrap hud GLYPH.close /
 * notebook / gear / help so the sprites they return carry .hd. 1x callers are unaffected (they never read .hd).
 * swatchIcon: the swatches' icon ('bust' | 'dot' | 'none' | PixelImage).
 */
export function prepareHD(T, { swatchIcon = 'dot' } = {}) {
  for (const c of PIN_COLORS) {
    withHD(E.pinIcon(c, T), swatchHD(c, T, { icon: swatchIcon }));
    withHD(E.pinIconSmall(c, T), pinGlyphHD(c, T));
  }
  withHD(E.emotePointSmall(T), gloveHD(T));
  if (!glyphsWrapped) {
    glyphsWrapped = true;
    const G = HA.GLYPH;
    for (const k of ['notebook', 'gear', 'help']) {
      const f = G[k];
      if (typeof f === 'function') G[k] = (TT, ...a) => { const s = f(TT, ...a); const h = glyphHD[k](TT); return withHD(s, h, { x: Math.floor((s.w * 2 - h.w) / 2), y: Math.floor((s.h * 2 - h.h) / 2) }); };
    }
    const fc = G.close;
    if (typeof fc === 'function') G.close = (TT, c) => { const s = fc(TT, c); return withHD(s, glyphHD.close(TT, c ?? TT.textDim)); };
  }
}
export { DensityView };
