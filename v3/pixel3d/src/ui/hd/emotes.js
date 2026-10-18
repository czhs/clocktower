// D=2 art for the emotes group (owner: emotes; wave 2 of the density round, docs/UI-HD-WAVE2.md). Pure JS, deterministic,
// token colours only. Sizes are exactly 2x the 1x sprites (anchors x2).
//
//   prepareEmotesHD(T)        attach .hd to the memoized emotes sprites of token set T (pie Point glove, pop glove, remove,
//                             ! / ?, pin swatches, dock dot) and (once) install E.HD_HOOKS: E.drawPie / E.drawKbd through a
//                             density view draw HD, E.dockButton / E.popFrame return 1x images carrying `.hd`.
//   pieImageHD(T, opts)       the radial pie at D=2 (same options as E.pieImage): 1-px wedge lines + bands, 1-2 px gaps,
//                             a finer rim, dotted hub ring at 1 HD px, HD icons, the current-colour arc on the HD rim
//   drawPieHD(view, cx, cy, T, st)   E.drawPie through a view (open fan / commit / cancel stepping, HD press dot + caption)
//   popFrameHD(kind, f, T, color)    30x40 in-world emote pop (anchor POP_HD.anchor = (14, 36))
//   dockButtonHD(T, {state, color, size}) · dockDotHD(color, T) · emotePointHD(T) · emotePointPopHD(T) · removeIconHD(T)
//   drawKbdHD(view, x, y, s, T)
import { PixelImage, PIN_RAMPS, PIN_COLORS, ramp, drawBoxHD, drawText, textWidth, withHD, dissolve, fontAt, HD_FRAME, upscale } from '../kit.js';
import * as E from '../emotes/art.js';
import { swatchHD } from './art.js';
import { memo, tkey, field } from './hud.js';

export const POP_HD = { w: 30, h: 40, anchor: { x: E.POP.anchor.x * 2, y: E.POP.anchor.y * 2 } };
const parchMat = (T) => ({ hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh, line: T.parchmentLine });
const goldMat = (T) => ({ hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine });

// ------------------------------------------------------------------------------------------------ grid helpers
/** EPX / Scale2x of a char grid (rows of chars, '.' empty): 2x the size with diagonals rounded (not blocks). */
export function epx(rows) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const at = (x, y) => (y >= 0 && y < h && x >= 0 && x < w ? rows[y][x] || '.' : '.');
  const out = Array.from({ length: 2 * h }, () => Array(2 * w).fill('.'));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    let p1 = P, p2 = P, p3 = P, p4 = P;
    if (C === A && C !== D && A !== B) p1 = A;
    if (A === B && A !== C && B !== D) p2 = B;
    if (D === C && D !== B && C !== A) p3 = C;
    if (B === D && B !== A && D !== C) p4 = D;
    out[2 * y][2 * x] = p1; out[2 * y][2 * x + 1] = p2; out[2 * y + 1][2 * x] = p3; out[2 * y + 1][2 * x + 1] = p4;
  }
  return out.map((r) => r.join(''));
}
/**
 * Shade a char grid on the HD grid (the emotes shade() at D=2): per material {hi, mid, sh, line} or {flat, line}, lit
 * from the upper left with 1-px bands (+ a 1-px form shadow 2 px in from the lower-right edge), then a 1-px line in the
 * touching material's line tone (first in `prefer`). pad = canvas margin.
 */
export function shadeGrid(rows, mats, { pad = 1, prefer = null, w: W = null, h: H = null } = {}) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const at = (x, y) => (y >= 0 && y < h && x >= 0 && x < w ? rows[y][x] || '.' : '.');
  const img = new PixelImage(W ?? w + 2 * pad, H ?? h + 2 * pad);
  const solid = (x, y) => at(x, y) !== '.';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = at(x, y);
    if (ch === '.') continue;
    const m = mats[ch];
    if (m.flat) { img.set(x + pad, y + pad, m.flat); continue; }
    const out = (xx, yy) => (m.by === 'self' ? at(xx, yy) !== ch : !solid(xx, yy));
    const lit = out(x, y - 1) || out(x - 1, y), dark = out(x, y + 1) || out(x + 1, y);
    const deep = !dark && !lit && (out(x + 1, y + 1) || out(x, y + 2) || out(x + 2, y));
    img.set(x + pad, y + pad, lit && !dark ? m.hi : (dark && !lit) || deep ? m.sh : m.mid);
  }
  const order = prefer || Object.keys(mats);
  const hits = [];
  for (let y = -pad; y < h + pad; y++) for (let x = -pad; x < w + pad; x++) {
    if (solid(x, y)) continue;
    const t = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => at(x + dx, y + dy)).filter((c) => c !== '.');
    if (!t.length) continue;
    const ch = order.find((k) => t.includes(k)) ?? t[0];
    if (mats[ch].line) hits.push([x + pad, y + pad, mats[ch].line]);
  }
  for (const [x, y, c] of hits) img.set(x, y, c);
  return img;
}

// ------------------------------------------------------------------------------------------------ icons
const GLOVE12 = ['..........ww', '.........www', '........www.', '.......www..', '...wwwwww...', '..wwwwwwkk..', '.cwwwwwwwww.',
  'ccwwwwwwkk..', 'cwwwwwwwww..', 'ccwwwwwwk...', '.ccwwwwww...', '..ccwww.....'];
const GLOVE9 = ['.www.....', 'cwwwwwwww', 'cwwwwwwww', 'cwkkkk...', 'cwwwww...', 'cwkkkk...', 'cwwwww...', 'cwwww....', '.www.....'];
/** EPX of a glove grid, then the curled-finger creases thinned to 1 HD row (k on the lower row of each 2-row crease). */
function gloveGridHD(rows) {
  const g = epx(rows).map((r) => [...r]);
  for (let y = 0; y < g.length - 1; y++) for (let x = 0; x < g[0].length; x++) if (g[y][x] === 'k' && g[y + 1][x] === 'k') g[y][x] = 'w';
  return g.map((r) => r.join(''));
}
const gloveMats = (T) => ({ w: parchMat(T), k: { flat: T.parchmentSh, line: T.parchmentLine }, c: goldMat(T) });
/** 28x28 Point glove (E.emotePoint at D=2: the pie / palette icon). */
export const emotePointHD = (T) => memo(`ept${tkey(T)}`, () => shadeGrid(gloveGridHD(GLOVE12), gloveMats(T), { pad: 2, prefer: ['w', 'c', 'k'] }));
/** 22x22 Point glove of the in-world pop (E.emotePointPop at D=2). */
export const emotePointPopHD = (T) => memo(`epp${tkey(T)}`, () => shadeGrid(gloveGridHD(GLOVE9), gloveMats(T), { pad: 2, prefer: ['w', 'c', 'k'] }));
/** 18x18 Remove glyph: a danger cross, 3-px arms with 1-px bands, own line. */
export const removeIconHD = (T) => memo(`rm${tkey(T)}`, () => {
  const D = ramp(T.danger);
  const rows = Array.from({ length: 14 }, (_, y) => Array.from({ length: 14 }, (_, x) => (Math.abs(x - y) <= 1.2 || Math.abs(x + y - 13) <= 1.2 ? 'x' : '.')).join(''));
  return shadeGrid(rows, { x: { hi: D.hi, mid: D.mid, sh: D.sh, line: D.line } }, { pad: 2 });
});
/** 14x18 '!' / '?' pop glyphs (EPX of the 1x art, 1-px bands + line). */
export const alertIconHD = (T) => memo(`al${tkey(T)}`, () => shadeGrid(epx(['##', '##', '##', '##', '..', '##', '##']), { '#': goldMat(T) }, { pad: 1, w: 14, h: 18 }));
export const questionIconHD = (T) => memo(`qu${tkey(T)}`, () => shadeGrid(epx(['.###.', '##.##', '...##', '..##.', '..#..', '.....', '..#..']), { '#': parchMat(T) }, { pad: 2, w: 14, h: 18 }));
/** 14x14 pin-colour dot (E.dockDot at D=2): a lit disc r 5.4 + glint, own line (black: dark body, iron line). */
export const dockDotHD = (color, T) => memo(`dot${color}${tkey(T)}`, () => {
  const R = PIN_RAMPS[color], m = color === 'black' ? { hi: T.ironHi, mid: R.hi, sh: R.mid, line: T.outline } : { hi: R.hi, mid: R.mid, sh: R.sh, line: R.line };
  return field(14, 14, (px, py) => {
    const dx = px - 7, dy = py - 7, d = Math.hypot(dx, dy);
    if (d > 6.4) return null;
    if (d > 5.4) return m.line;
    const s = (dx + dy) / Math.max(1, d);
    return d < 1.6 && dx < 0 && dy < 0 ? m.hi : s < -0.5 && d > 2.6 ? m.hi : s > 0.5 && d > 3 ? m.sh : m.mid;
  });
});

// ------------------------------------------------------------------------------------------------ pop bubble
/** HD bubble (30x40 canvas): rounded box (HD frame corners) + a smooth 1-px-lined tail to the anchor, 2-row shadow. */
function bubbleHD(T, bw, bh) {
  const W = POP_HD.w, H = POP_HD.h, ax = POP_HD.anchor.x, ay = POP_HD.anchor.y;
  const x0 = Math.floor((E.POP.w - bw) / 2) * 2, y0 = (E.POP.anchor.y - 2 - bh) * 2, BW = bw * 2, BH = bh * 2;
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
  return { img, x0, y0 };
}
/** In-world emote pop frame f at D=2 (30x40): 0 = pop (smaller bubble), 1 = full + HD glyph, 2..4 = HD Bayer dissolve. */
export function popFrameHD(kind, f, T, color = 'gold') {
  return memo(`popHD${kind}${kind === 'pin' ? color : ''}${f}${tkey(T)}`, () => {
    if (f === 0) return bubbleHD(T, 11, 12).img;
    const { img, x0, y0 } = bubbleHD(T, 15, 16);
    const g = kind === 'point' ? emotePointPopHD(T) : kind === 'pin' ? swatchHD(color, T, { icon: 'dot' }) : kind === 'alert' ? alertIconHD(T) : questionIconHD(T);
    img.blit(g, x0 + 4 + Math.floor((22 - g.w) / 2), y0 + 4 + Math.floor((24 - g.h) / 2));
    if (f >= 2) dissolve(img, [0.25, 0.5, 0.75][f - 2]);
    return img;
  });
}

// ------------------------------------------------------------------------------------------------ dock button / kbd
/** The dock toggle ring at D=2 ((size + 2) x 2 square): HD frame (1-px line, 2-px keyline lit on the open state), the
 *  1-px inner rim, the transparent hole (same as 1x), the 14x14 colour dot. */
export function dockButtonHD(T, { state = 'normal', color = null, size = 24 } = {}) {
  return memo(`dbtn${state}${color}${size}${tkey(T)}`, () => {
    const S2 = (size + 2) * 2, img = new PixelImage(S2, S2), s = size * 2;
    const st = { line: 'outline', edge: state === 'open' ? 'gold' : state === 'hover' ? 'ironHi' : 'iron', fill: 'outline', hi: null, sh: null, corner: 2, shadow: false };
    drawBoxHD(img, 0, 0, s, s, st, T);
    for (let y = 6; y < s - 6; y++) for (let x = 6; x < s - 6; x++) img.erase(x, y);
    if (state === 'open') {                      // the lit inner keyline (top + left), 1 HD px
      for (let x = 5; x < s - 5; x++) if (img.get(x, 2)[3]) img.set(x, 1, T.goldHi);
      for (let y = 5; y < s - 5; y++) if (img.get(2, y)[3]) img.set(1, y, T.goldHi);
    }
    if (color) img.blit(dockDotHD(color, T), s - 12, s - 12);
    return img;
  });
}
/** E.drawKbd at D=2 through a view: a rounded gold-keyline cap (1-px line), raised fill with a 1-px lit top, ironSh foot, tiny@2. */
export function drawKbdHD(view, x, y, s, T) {
  const D = view.density, w = textWidth(s, 'tiny') + 4, X = x * D + view.ox, Y = y * D + view.oy, W = w * D, H = E.KBD_H * D;
  const b = view.base;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const dx = Math.min(i, W - 1 - i), dy = Math.min(j, H - 1 - j);
    if (dx + dy < 1) continue;
    const ring = dx === 0 || dy === 0 || dx + dy < 2;
    b.set(X + i, Y + j, ring ? T.goldSh : j === 1 ? T.ironHi : j >= H - 3 ? T.ironSh : T.inkRaised);
  }
  drawText(b, X + 2 * D, Y + 2 * D, s, { font: fontAt('tiny', 2), color: T.text });
  return w;
}

// ------------------------------------------------------------------------------------------------ pie
function wedgeStyle(it, state, T) {
  if (state === 'off') return { edge: T.ironSh, fill: T.inkSunk, hi: T.inkSunk, sh: T.inkSunk };
  if (it.kind === 'unpin') { const D = ramp(T.danger); return state === 'hot' ? { edge: D.hi, fill: D.line, hi: D.sh, sh: D.line } : { edge: D.sh, fill: T.ink, hi: T.inkRaised, sh: D.line }; }
  if (state === 'hot') {
    if (it.kind === 'pin') { const R = PIN_RAMPS[it.color]; return it.color === 'black' ? { edge: R.line, fill: R.sh, hi: R.mid, sh: R.sh } : { edge: R.hi, fill: R.line, hi: R.sh, sh: R.line }; }
    return { edge: T.goldHi, fill: T.goldLine, hi: T.goldSh, sh: T.goldLine };
  }
  return { edge: T.iron, fill: T.ink, hi: T.inkRaised, sh: T.inkSunk };
}
// (emoji emotes, additive) an item with its own icon factory (it.icon(T), docs/UI-EMOJI.md) uses that icon's .hd
// (attached by src/ui/hd/emoji.js prepareEmojiHD), else the 1x icon block-scaled
const iconHDOf = (ic) => ic.hd ?? upscale(ic, 2);
const pieIconHD = (it, T) => (it.icon ? iconHDOf(it.icon(T)) : it.kind === 'point' ? emotePointHD(T) : it.kind === 'unpin' ? removeIconHD(T) : swatchHD(it.color, T, { icon: 'dot' }));
/**
 * The pie at D=2: an image of (2·(2c+1)) px, c = R + 3 (the 1x centre pixel), drawn on the HD grid: wedge annulus
 * (2R .. 2r0) with 1-2 HD px radial gaps, 1-px wedge line + hi / sh bands, the back disc 4 HD px past the rim with a
 * 2-row drop shadow, the hub well (1-px iron ring, dotted gold ring 3 on / 3 off), HD icons, the current-colour arc.
 */
export function pieImageHD(T, { size = 'mouse', items = E.pieItems({ name: 'Bram' }), hot = null, color = null, off = null,
  show = null, back = true, hub = true, icons = true, idleHub = false, phase = 0, shrink = 0, backShow = null, ring = false } = {}) {
  const key = 'pieHD' + tkey(T) + JSON.stringify([size, items.map((i) => i.key), hot, color, off && [...off], show && [...show], back, hub, icons, idleHub, phase % 4, shrink, backShow && [...backShow], ring]);
  return memo(key, () => pieHD0(T, { size, items, hot, color, off, show, back, hub, icons, idleHub, phase, shrink, backShow, ring }));
}
function pieHD0(T, { size, items, hot, color, off, show, back, hub, icons, idleHub, phase, shrink, backShow, ring }) {
  const G = E.PIE[size];
  const R1 = G.R - shrink, r01 = Math.max(4, G.r0 - Math.round(shrink / 2)), c1 = G.R + 3;
  const R = 2 * R1, r0 = 2 * r01, C = 2 * c1 + 1, S = 2 * (2 * c1 + 1);
  const img = new PixelImage(S, S + 2);
  const n = items.length, step = (2 * Math.PI) / n;
  const rel = (dx, dy) => { let a = Math.atan2(dy, dx) + Math.PI / 2; return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); };
  const wedgeOf = (dx, dy) => {
    const d = Math.hypot(dx, dy);
    if (d < r0 || d > R) return -1;
    const a = rel(dx, dy), i = Math.round(a / step) % n, o = Math.abs(a - Math.round(a / step) * step);
    if (d * Math.sin(Math.abs(step / 2 - o)) < 1.1) return -1;
    return i;
  };
  const P = (x, y) => [x + 0.5 - C, y + 0.5 - C];
  const inW = (i, x, y) => wedgeOf(...P(x, y)) === i;
  const edgeAt = (i, x, y) => inW(i, x, y) && (!inW(i, x + 1, y) || !inW(i, x - 1, y) || !inW(i, x, y + 1) || !inW(i, x, y - 1));
  const sectorOf = (dx, dy) => Math.round(rel(dx, dy) / step) % n;
  if (back && ring) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const [dx, dy] = P(x, y), d = Math.hypot(dx, dy);
      if (d <= R + 4 && d > R + 1) img.set(x, y, T.outline);
      else if (d <= R + 1 && d > R - 1) img.set(x, y, dy + dx < -R * 0.5 ? T.ironHi : T.iron);
      else if (d <= R - 1 && d > R - 2) img.set(x, y, T.outline);
    }
  } else if (back) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const [dx, dy] = P(x, y), d = Math.hypot(dx, dy);
      if (d > R + 4) continue;
      if (backShow && (d > r0 - 2 ? !backShow.has(sectorOf(dx, dy)) : !hub)) continue;
      img.set(x, y, T.outline);
    }
    for (let x = 0; x < S; x++) for (let y = S + 1; y >= 2; y--) {
      if (!img.alpha(x, y) && img.alpha(x, y - 1) && Math.hypot(...P(x, y - 1)) > R) { img.set(x, y, T.shadow); if (!img.alpha(x, y + 1)) img.set(x, y + 1, T.shadow); break; }
    }
  }
  const vis = show || new Set(items.map((_, i) => i));
  for (let i = 0; i < n; i++) {
    if (!vis.has(i)) continue;
    const st = off?.has(i) ? 'off' : i === hot ? 'hot' : 'normal', W = wedgeStyle(items[i], st, T);
    for (let y = C - R - 2; y <= C + R + 2; y++) for (let x = C - R - 2; x <= C + R + 2; x++) {
      if (!inW(i, x, y)) continue;
      let col = W.fill;
      if (edgeAt(i, x, y)) col = W.edge;
      else {
        const ul = edgeAt(i, x, y - 1) || edgeAt(i, x - 1, y), dr = edgeAt(i, x, y + 1) || edgeAt(i, x + 1, y);
        if (ul && !dr) col = W.hi; else if (dr && !ul) col = W.sh;
      }
      img.set(x, y, col);
    }
  }
  if (hub) {
    const rh = 2 * (r01 - 3);
    for (let y = C - rh - 2; y <= C + rh + 2; y++) for (let x = C - rh - 2; x <= C + rh + 2; x++) {
      const [dx, dy] = P(x, y), d = Math.hypot(dx, dy);
      if (d > rh + 0.5) continue;
      img.set(x, y, d > rh - 0.5 ? T.iron : d > rh - 1.5 && dx + dy < 0 ? T.shadow : T.inkSunk);
    }
    if (idleHub) {
      const pts = [];
      for (let y = C - rh - 2; y <= C + rh + 2; y++) for (let x = C - rh - 2; x <= C + rh + 2; x++) {
        const [dx, dy] = P(x, y), d = Math.hypot(dx, dy);
        if (d <= rh + 0.5 && d > rh - 0.5) pts.push([x, y, Math.atan2(dy, dx)]);
      }
      pts.sort((a, b) => a[2] - b[2]);
      pts.forEach(([x, y], k) => { if (((k + 2 * phase) % 6 + 6) % 6 < 3) img.set(x, y, T.gold); });
    }
  }
  if (icons) {
    for (let i = 0; i < n; i++) {
      if (!vis.has(i)) continue;
      const it = items[i], a = E.wedgeAngle(i, n), isHot = i === hot;
      const rm = 2 * (G.rm - Math.round(shrink / 2) + (isHot ? 1 : 0));
      let ic = pieIconHD(it, T);
      if (off?.has(i)) { const s = new PixelImage(ic.w, ic.h); s.blit(ic, 0, 0, { tint: T.ironSh }); ic = s; }
      img.blit(ic, Math.round(C + rm * Math.cos(a) - ic.w / 2), Math.round(C + rm * Math.sin(a) - ic.h / 2) - (isHot ? 2 : 0));
      if (it.kind === 'pin' && it.color === color && !it.current && !off?.has(i)) {
        for (let y = C - R - 2; y <= C + R + 2; y++) for (let x = C - R - 2; x <= C + R + 2; x++) {
          if (!edgeAt(i, x, y)) continue;
          const [dx, dy] = P(x, y);
          if (Math.hypot(dx, dy) < R - 2.5) continue;
          const da = Math.atan2(dy, dx) - a, w = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) * R;
          if (w <= 7) { img.set(x, y, w <= 3 ? T.goldHi : T.gold); }
        }
        for (let y = C - R - 2; y <= C + R + 2; y++) for (let x = C - R - 2; x <= C + R + 2; x++) {   // a 2nd (inner) row of the arc
          const [dx, dy] = P(x, y), d = Math.hypot(dx, dy);
          if (!inW(i, x, y) || edgeAt(i, x, y) || d < R - 2.5) continue;
          const da = Math.atan2(dy, dx) - a, w = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) * R;
          if (w <= 5) img.set(x, y, T.goldSh);
        }
      }
    }
  }
  return img;
}
/** Press dot at D=2 into an HD image at HD centre (X, Y) = the 1x pixel's HD block: gold disc + lit glint + goldLine ring. */
function pressDotHD(b, X, Y, T) {
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
    const d = Math.hypot(i + 0.5 - 1, j + 0.5 - 1);
    if (d > 4.1) continue;
    b.set(X + i, Y + j, d > 3.1 ? T.goldLine : d < 1.2 && i <= 0 && j <= 0 ? T.goldHi : i + j > 2 ? T.goldSh : T.gold);
  }
}
/** E.drawPie through a density view (same stepping as the 1x: open pop ring + fan, commit, cancel, caption, press dot). */
export function drawPieHD(view, cx, cy, T, st) {
  const D = view.density, b = view.base, at = (x, y) => [x * D + view.ox, y * D + view.oy];
  if (st.pressOnly) { pressDotHD(b, ...at(cx, cy), T); return true; }
  const size = st.size || 'mouse', G = E.PIE[size];
  const items = st.items || E.pieItems({ name: 'Bram' }), n = items.length;
  const kOpen = st.reduced ? 99 : E.gridK(st.tOpen ?? 99);
  const c = G.R + 3;
  const base = { size, items, hot: st.hot ?? null, color: st.color ?? null, off: st.off ?? null, idleHub: st.hot == null, phase: st.reduced ? 0 : Math.floor((st.tOpen ?? 0) * 7.5) };
  let pie;
  if (st.commit) {
    const k = st.reduced ? 99 : E.gridK(st.commit.t, 2);
    if (k >= 4) return false;
    const i = st.commit.i, others = new Set(items.map((_, j) => j).filter((j) => j !== i));
    pie = pieImageHD(T, { ...base, hot: i, show: new Set(), icons: false, idleHub: false, hub: k === 0, backShow: new Set([i]) }).clone();
    if (k === 0) pie.blit(dissolve(pieImageHD(T, { ...base, hot: i, show: others, hub: false, idleHub: false, backShow: others }).clone(), 0.5), 0, 0);
    pie.blit(pieImageHD(T, { ...base, hot: i, show: new Set([i]), back: false, hub: false, idleHub: false }), 0, 0);
    if (k >= 2) dissolve(pie, k === 2 ? 0.5 : 0.75);
  } else if (st.cancel != null) {
    const k = E.gridK(st.cancel, 2);
    if (k >= 3 || st.reduced) return false;
    pie = dissolve(pieImageHD(T, base).clone(), [0.25, 0.5, 0.75][k]);
  } else if (kOpen < 1) {
    pie = pieImageHD(T, { ...base, shrink: Math.round(G.R * 0.3), icons: false, show: new Set(), idleHub: false, ring: true });
  } else if (kOpen < E.TIMING.PIE_OPEN_FRAMES) {
    const fan = [0]; for (let k = 1; fan.length < n; k++) { fan.push(k); if (fan.length < n) fan.push(n - k); }
    const per = Math.ceil(n / 3), shown = new Set(fan.slice(0, per * kOpen));
    pie = pieImageHD(T, { ...base, show: shown, backShow: shown });
  } else pie = pieImageHD(T, base);
  b.blit(pie, ...at(cx - c, cy - c));
  const px = cx + (st.press?.dx ?? 0), py = cy + (st.press?.dy ?? 0);
  if (!st.noPress && st.cancel == null && (!st.commit || E.gridK(st.commit.t, 2) < 1)) pressDotHD(b, ...at(px, py), T);
  const showCap = !st.noCaption && !(st.commit && E.gridK(st.commit.t, 2) >= 2) && st.cancel == null && kOpen >= 1;
  if (showCap) {
    const touch = (st.input || size) === 'touch';
    const hotIt = st.hot != null ? items[st.hot] : st.commit ? items[st.commit.i] : null;
    const title = st.title || 'Point or pin';
    const cap = hotIt ? hotIt.label : st.sticky ? `${title} — ${touch ? 'tap' : 'click'} one` : `${title} — ${touch ? 'slide' : 'drag'} to choose`;
    E.drawCaption(view, cx, cy, G.R, cap, T);
  }
  return true;
}

// ------------------------------------------------------------------------------------------------ prepare / hooks
const prepared = new Set();
let hooked = false;
/**
 * Attach the HD sprites to the memoized 1x emotes sprites of token set T (idempotent) and install E.HD_HOOKS once.
 * After it, through a density view: E.drawPie / E.drawKbd / E.drawDock / E.drawArmed / E.drawPinTip / E.drawCaption are HD;
 * E.dockButton(T, o) and E.popFrame(kind, f, T, color) return 1x images with `.hd` (blit through a view, or take `.hd`
 * and fastBlit it into L.hd.world at 2x / the anchor POP_HD.anchor).
 */
export function prepareEmotesHD(T) {
  const k = tkey(T);
  if (!prepared.has(k)) {
    prepared.add(k);
    withHD(E.emotePoint(T), emotePointHD(T));
    withHD(E.emotePointPop(T), emotePointPopHD(T));
    withHD(E.removeIcon(T), removeIconHD(T));
    withHD(E.alertIcon(T), alertIconHD(T));
    withHD(E.questionIcon(T), questionIconHD(T));
    for (const c of PIN_COLORS) { withHD(E.dockDot(c, T), dockDotHD(c, T)); const p = E.pinIcon(c, T); if (!p.hd) withHD(p, swatchHD(c, T, { icon: 'dot' })); }
  }
  if (!hooked) {
    hooked = true;
    Object.assign(E.HD_HOOKS, { drawPie: drawPieHD, drawKbd: drawKbdHD, dockButton: dockButtonHD, popFrame: popFrameHD });
  }
}
