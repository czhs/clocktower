// D=2 art for the emoji emotes (owner: emotes; docs/UI-EMOJI.md). Pure JS, deterministic, token colours only. Every
// sprite is EXACTLY 2x its 1x sprite (anchors x2), drawn on the HD grid: 1-px lines, 1-px light / shadow bands, round
// curves (faces, eyes, heart, '?' are rasterised from shapes at D=2, the gloves are EPX + re-lit like the wave-2 glove).
//
//   prepareEmojiHD(T)            install EJ.HD_HOOKS once: EJ.emojiIcon / EJ.emojiPopFrame return 1x images with `.hd`,
//                                the dock's caret + auto underline draw HD through a view. Call after prepareWave2HD(T)
//                                (the dock's Point glove, pin glyph, dots and key caps come from the wave-2 prepares).
//   emojiIconHD(key, T)          26x26 glyph (the 13x13 at D=2)
//   emojiPopFrameHD(key, f, T)   62x62 pop frame (anchor EMOJI_POP_HD.anchor = (30, 58))
import { PixelImage, dissolve, HD_FRAME } from '../kit.js';
import * as EJ from '../emotes/emoji.js';
import { epx, shadeGrid } from './emotes.js';
import { memo, tkey } from './hud.js';

export const EMOJI_POP_HD = { w: EJ.EMOJI_POP.w * 2, h: EJ.EMOJI_POP.h * 2, anchor: { x: EJ.EMOJI_POP.anchor.x * 2, y: EJ.EMOJI_POP.anchor.y * 2 } };

// ------------------------------------------------------------------------------------------------ shape raster
const N = 22;   // HD content grid (the 1x 11x11 at D=2); shadeGrid pads 2 -> 26x26
/** rows of N chars: for each pixel centre (px, py), the LAST rule [ch, fn(px, py, x, y)] that matches wins. */
function raster(rules, n = N) {
  const out = [];
  for (let y = 0; y < n; y++) {
    let s = '';
    for (let x = 0; x < n; x++) {
      let ch = '.';
      for (const [c, f] of rules) if (f(x + 0.5, y + 0.5, x, y)) ch = c;
      s += ch;
    }
    out.push(s);
  }
  return out;
}
const disc = (cx, cy, r) => (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
const ell = (cx, cy, rx, ry) => (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
const seg = (ax, ay, bx, by, w) => (px, py) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= w;
};
const or = (...fs) => (px, py, x, y) => fs.some((f) => f(px, py, x, y));
const and = (...fs) => (px, py, x, y) => fs.every((f) => f(px, py, x, y));
const at = (...pts) => (px, py, x, y) => pts.some(([a, b]) => a === x && b === y);
const FACE = disc(11, 11, 10.9);

/** EPX of a glove grid, then the curled-finger creases thinned to 1 HD row (as hd/emotes.js gloveGridHD). */
function gloveGrid(rows) {
  const g = epx(rows).map((r) => [...r]);
  for (let y = 0; y < g.length - 1; y++) for (let x = 0; x < g[0].length; x++) if (g[y][x] === 'k' && g[y + 1][x] === 'k') g[y][x] = 'w';
  return g.map((r) => r.join(''));
}

/** The HD content grid (22x22) of each emoji. */
const GRID_HD = {
  laugh: () => raster([
    ['f', FACE],
    ['e', or(...[5.3, 16.7].map((ex) => (px, py) => Math.abs(Math.hypot(px - ex, py - 9.7) - 2.9) <= 0.8 && py <= 9.9))],
    ['d', or(...[2.0, 20.0].map((sx) => or(disc(sx, 12.9, 1.45), seg(sx, 10.2, sx, 12.4, 0.62))))],
    ['m', and((px, py) => py >= 12.4, disc(11, 12.4, 6.7))],
    ['h', and((px, py) => py >= 12.4 && py <= 14.1, disc(11, 12.4, 5.9))],
    ['t', and((px, py) => py >= 12.4, disc(11, 12.4, 6.0), disc(11, 19.6, 3.4))],
  ]),
  shocked: () => raster([
    ['f', FACE],
    ['e', or(seg(3.3, 5.5, 7.7, 4.1, 0.75), seg(18.7, 5.5, 14.3, 4.1, 0.75))],
    ['e', or(ell(6.3, 9.8, 1.9, 2.4), ell(15.7, 9.8, 1.9, 2.4))],
    ['g', at([5, 8], [15, 8])],
    ['m', ell(11, 16.4, 3.1, 3.8)],
    ['t', ell(11, 17.5, 1.6, 2.1)],
  ]),
  suspicious: () => raster([
    ['w', or(ell(5.6, 11, 4.9, 6.8), ell(16.4, 11, 4.9, 6.8))],
    ['p', or(disc(3.7, 12.0, 2.5), disc(14.5, 12.0, 2.5))],
    ['g', at([3, 10], [14, 10])],
  ]),
  heart: () => raster([
    ['h', or(disc(5.9, 6.4, 5.9), disc(16.1, 6.4, 5.9), (px, py) => py >= 6.4 && Math.abs(px - 11) <= 11 - (py - 6.4) * (11 / 14.4))],
    ['g', or(ell(5.0, 5.1, 1.5, 1.1))],
  ]),
  question: () => raster([
    ['q', (px, py) => { const d = Math.hypot(px - 11.2, py - 7.0), a = Math.atan2(py - 7.0, px - 11.2); return Math.abs(d - 5.3) <= 1.45 && a >= -0.94 * Math.PI && a <= 0.44 * Math.PI; }],
    ['q', (px, py) => px >= 9.9 && px <= 12.9 && py >= 11.4 && py <= 15.8],
    ['q', disc(11.4, 19.7, 1.75)],
  ]),
  agree: () => gloveGrid(EJ.EMOJI_GRID.agree),
  disagree: () => gloveGrid(EJ.EMOJI_GRID.disagree),
};
/** 26x26 HD glyph of emoji `key` (alternates: EPX of the 1x grid, re-lit). */
export function emojiIconHD(key, T) {
  return memo(`ejHD${key}${tkey(T)}`, () => {
    const { mats, prefer } = EJ.emojiMats(key, T);
    const m = { ...mats };
    // HD-only materials: teeth (h on a face) and the glints (g)
    if (!['heart'].includes(key)) { m.h = m.h ?? { flat: T.parchmentHi, line: T.goldLine }; m.g = { flat: T.parchmentHi, line: T.parchmentLine }; }
    const rows = GRID_HD[key] ? GRID_HD[key]() : epx(EJ.EMOJI_GRID[key]);
    return shadeGrid(rows, m, { pad: 2, prefer });
  });
}

// ------------------------------------------------------------------------------------------------ pop
/** HD bubble (rounded box with HD frame corners + a smooth 1-px-lined tail + 2-row shadow) of 1x size bw x bh, lifted. */
function bubbleHD(T, bw, bh, lift) {
  const W = EMOJI_POP_HD.w, H = EMOJI_POP_HD.h, A = EJ.EMOJI_POP.anchor;
  const x0 = (A.x - Math.floor(bw / 2)) * 2, y0 = (A.y - lift - 2 - bh) * 2, BW = bw * 2, BH = bh * 2;
  const ax = A.x * 2, ay = (A.y - lift) * 2;
  const cuts = HD_FRAME.cuts[2];
  const inBox = (x, y) => {
    if (x < x0 || y < y0 || x >= x0 + BW || y >= y0 + BH) return false;
    const i = x - x0, j = y - y0, dx = Math.min(i, BW - 1 - i), dy = Math.min(j, BH - 1 - j);
    return !(dy < cuts.length && dx < cuts[dy]) && !(dx < cuts.length && dy < cuts[dx]);
  };
  const tip = ay + 1, by = y0 + BH - 1;
  const inTail = (x, y) => y > by - 4 && y <= tip && Math.abs(x + 0.5 - (ax + 1)) <= 0.5 + 3.2 * (tip - y) / (tip - by + 4);
  const ins = (x, y) => inBox(x, y) || inTail(x, y);
  const img = new PixelImage(W, H);
  const dist = (x, y) => { let d = 9; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const m = Math.abs(i) + Math.abs(j); if (m && m <= 3 && !ins(x + i, y + j)) d = Math.min(d, m - 1); } return d; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!ins(x, y)) continue;
    const d = dist(x, y);
    img.set(x, y, d === 0 ? T.outline : d <= 2 ? T.bubbleEdge : y === y0 + 3 && inBox(x, y) ? T.bubbleHi : T.bubble);
  }
  const sh = [];
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) if (!img.alpha(x, y) && (img.alpha(x, y - 1) || img.alpha(x, y - 2))) sh.push([x, y]);
  for (const [x, y] of sh) img.set(x, y, T.shadow);
  return { img, x0, y0, bw, bh };
}
/** HD burst: the 1x spark layout EPX'd (diagonal rays become smooth 1-px-stepped strokes), 1-px goldLine line. */
function burstHD(stage, bx0, by0, bw, T) {
  const W = EJ.EMOJI_POP.w, H = EJ.EMOJI_POP.h;
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const x1 = bx0 + bw - 1, cy = by0 + 8, cx = EJ.EMOJI_POP.anchor.x;
  for (const [x, y] of EJ.burstPoints(stage, bx0, by0, x1, cy, cx)) if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = stage === 1 ? 'a' : 'b';
  const rows = epx(g.map((r) => r.join('')));
  // stage 2 sparks: a 4-point star per spark (the 2x2 block loses its corners: a finer '+' than the 1x dot)
  const img = shadeGrid(rows, { a: { flat: T.goldHi, line: T.goldLine }, b: { flat: T.gold, line: T.goldLine } }, { pad: 0, w: W * 2, h: H * 2 });
  return img;
}
/** In-world pop frame f at D=2 (62x62): same frames and timing as EJ.emojiPopFrame. */
export function emojiPopFrameHD(key, f, T) {
  return memo(`ejpopHD${key}${f}${tkey(T)}`, () => {
    if (f === 0) return bubbleHD(T, EJ.EMOJI_POP.small, EJ.EMOJI_POP.small, 0).img;
    const lift = f === 1 ? 2 : f === 2 ? 1 : 0;
    const { img, x0, y0 } = bubbleHD(T, EJ.EMOJI_POP.box, EJ.EMOJI_POP.box, lift);
    img.blit(emojiIconHD(key, T), x0 + 4, y0 + 4);
    let out = img;
    if (f === 1 || f === 2) {
      const bx0 = x0 / 2, by0 = y0 / 2;
      out = burstHD(f, bx0, by0, EJ.EMOJI_POP.box, T);
      out.blit(img, 0, 0);
    }
    if (f >= 4) dissolve(out, [0.25, 0.5, 0.75][f - 4]);
    return out;
  });
}

// ------------------------------------------------------------------------------------------------ small marks (dock / picker)
/** The colour button's caret at D=2 through a view: a 10x5 triangle with a 1-px darker foot (finer than 2x2 blocks). */
function caretHD(view, x, y, c) {
  const D = view.density, X = x * D + view.ox, Y = y * D + view.oy;
  for (let j = 0; j < 5; j++) for (let i = j; i < 10 - j; i++) view.base.set(X + i, Y + j, c);
}
/** The auto-colour underline at D=2: a 1-HD-px rule (the 1x 1-texel rule is 2 HD rows), same length. */
function underlineHD(view, x, y, w, c) {
  const D = view.density, X = x * D + view.ox, Y = y * D + view.oy;
  for (let i = 0; i < w * D; i++) view.base.set(X + i, Y + 1, c);
}

// ------------------------------------------------------------------------------------------------ prepare
let hooked = false;
/**
 * Install EJ.HD_HOOKS once (idempotent; T is accepted for symmetry with the wave-2 prepares, the hooks are per call).
 * After it: EJ.emojiIcon / EJ.emojiPopFrame carry `.hd`, so the emoji pie wedges (through hd/emotes.js pieIconHD), the
 * dock cells and the world pop are HD when drawn through a density view. 1x callers see byte-identical images.
 */
export function prepareEmojiHD(T) {
  if (!hooked) {
    hooked = true;
    Object.assign(EJ.HD_HOOKS, { icon: emojiIconHD, popFrame: emojiPopFrameHD, caret: caretHD, underline: underlineHD });
  }
  if (T) for (const e of [...EJ.EMOJI, ...EJ.EMOJI_ALT]) EJ.emojiIcon(e.key, T);   // attach .hd to the memoized icons now
}
