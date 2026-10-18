// D=2 art for the events group (owner: events; wave 2 of the density round, docs/UI-HD-WAVE2.md). Pure JS (no three.js),
// deterministic, token colours (+ the events group's own smoke / clay ramps). Every frame is EXACTLY 2x its 1x frame and
// keeps the 1x anchor x2, so `put(view, F, name, x, y)` / a density view's blit places it where the 1x frame was.
//
//   prepareEventsHD(T)          attach .hd to the events frames of token set T (EV.framesFor(T)): vote clock face + seat
//                               pips, caption ribbon + glyphs, banner ribbon + emblems, the execution bell, wisp, ghost
//                               reveal, Storyteller poof, memorial candle; and (once) install EV.HD_HOOKS: drawCaption /
//                               drawBanner / the vote-clock hand draw HD when L.screen is a density view.
//   captionImageHD(text, glyph, T, {narrow})   the phase caption ribbon at D=2 (2 x the 1x width, 30 tall)
//   drawCaptionHD(L, F, o) · drawBannerHD(L, F, kind, k, o) · drawVoteHandHD(view, fx, fy, a, T)
//   vcFaceHD · vcSeatHD · captionEndHD · captionMidHD · captionGlyphHD · bannerEndHD · bannerMidHD · emblemHD
//   bellHD · wispHD · revealHD · poofHD · candleHD   (the HD frames; anchors = 2 x events ANCHORS)
import { PixelImage, ramp, drawText, textWidth, wrapText, withHD, dissolve, fontAt, derive2x } from '../kit.js';
import * as A from '../events/art.js';
import * as EV from '../events/draw.js';
import { GLYPH_HD, memo, tkey, field, paint, GOLD } from './hud.js';
import { epx, shadeGrid } from './emotes.js';

const body2 = () => fontAt('body', 2);
/** 1-px goldLine (or `line`) outline round an image, on a canvas grown by `pad` px each side. */
function outlined(im, line, pad = 1) { const o = new PixelImage(im.w + 2 * pad, im.h + 2 * pad); o.blit(im, pad, pad); o.outline(line); return o; }

// ------------------------------------------------------------------------------------------------ vote clock (HUD)
/** 122x122 vote clock face: 1-px line, a 2-px lit iron bevel, the dark well, the inner ink disc with a lip, 24 ticks
 *  (every 6th a gold 1x3 radial bar, the rest 2-px dots). */
export const vcFaceHD = (T) => memo(`vcface${tkey(T)}`, () => {
  const S = 122, c = 61;
  const im = field(S, S, (px, py) => {
    const dx = px - c, dy = py - c, d = Math.hypot(dx, dy);
    if (d > 59.5) return null;
    if (d > 58.5) return T.outline;
    if (d > 56.5) { const k = (-dx - dy) / d; return k > 0.5 ? T.ironHi : k < -0.5 ? T.ironSh : T.iron; }
    if (d > 55.5) return T.outline;
    if (d > 35.5) return T.inkSunk;
    if (d > 34.5) { const k = (-dx - dy) / d; return k > 0.3 ? T.shadow : T.ironSh; }
    return T.ink;
  });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
    if (i % 6 === 0) for (let r = 29.5; r <= 33.5; r += 0.5) im.set(Math.floor(c + cs * r), Math.floor(c + sn * r), T.goldSh);
    else im.disc(c + cs * 31.5, c + sn * 31.5, 0.8, T.ironSh);
  }
  return im;
});
const SEAT_TONES = (state, T) => ({
  fill: { idle: T.inkRaised, yes: T.gold, no: T.inkSunk, raised0: T.goldSh, raised1: A.rampOf(T.goldSh).sh, dead: T.inkSunk, nominee: T.inkRaised, current: T.inkRaised }[state],
  edge: { idle: T.iron, yes: T.goldHi, no: T.ironSh, raised0: T.gold, raised1: T.goldSh, dead: T.ghostSh, nominee: A.rampOf(A.CLAY).hi, current: T.goldHi }[state],
  line: state === 'yes' || state.startsWith('raised') || state === 'current' ? T.goldLine : state === 'nominee' ? A.rampOf(A.CLAY).line : T.outline,
});
/** 22x22 seat pip: 1-px line, a 2-px edge ring lit upper-left, the fill (yes: a gold coin with a glint), dead = dashed rim. */
export const vcSeatHD = (state, T) => memo(`vcseat${state}${tkey(T)}`, () => {
  const S = SEAT_TONES(state, T), er = ramp(S.edge);
  return field(22, 22, (px, py) => {
    const dx = px - 11, dy = py - 11, d = Math.hypot(dx, dy);
    if (d > 10.6) return null;
    if (d > 9.6) return S.line;
    if (d > 7.6) {
      if (state === 'dead' && Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 16) % 2) return T.inkSunk;
      const k = (-dx - dy) / d; return k > 0.6 ? er.hi : S.edge;
    }
    if (state === 'yes') { const k = (-dx - dy) / Math.max(1, d); return k > 0.55 && d > 4.5 ? T.goldHi : k < -0.6 && d > 5 ? T.goldSh : T.gold; }
    return S.fill;
  });
});
/**
 * The vote-clock hand + hub at D=2 into the view's HD image: a 1-px gold shaft with a 1-px goldLine edge from the hub
 * (the face centre) toward angle a (rad), at the 1x length (VC.r - 7 texels), then the hub (r 5.2 gold, lit crescent).
 */
export function drawVoteHandHD(view, fx, fy, a, T, { hand = true } = {}) {
  const D = view.density, c = (A.VC.size / 2) * D, X = fx * D + view.ox, Y = fy * D + view.oy;
  if (hand) {
    const L = (A.VC.r - 7) * D, hm = new PixelImage(A.VC.size * D, A.VC.size * D);
    hm.line(Math.floor(c), Math.floor(c), Math.floor(c + Math.cos(a) * L), Math.floor(c + Math.sin(a) * L), T.gold);
    hm.line(Math.floor(c) - 1, Math.floor(c), Math.floor(c + Math.cos(a) * L) - 1, Math.floor(c + Math.sin(a) * L), T.gold);
    hm.outline(T.goldLine);
    view.base.blit(hm, X, Y);
  }
  const hub = memo(`vhub${tkey(T)}`, () => field(12, 12, (px, py) => {
    const dx = px - 6, dy = py - 6, d = Math.hypot(dx, dy);
    if (d > 5.2) return null;
    if (d > 4.3) return T.goldLine;
    const k = (-dx - dy) / Math.max(1, d);
    return d < 1.3 ? T.inkSunk : k > 0.5 ? T.goldHi : k < -0.5 ? T.goldSh : T.gold;
  }));
  view.base.blit(hub, X + c - 6, Y + c - 6);
}

// ------------------------------------------------------------------------------------------------ caption ribbon
/** HD column of the ribbon (top to bottom, 25 of 30 rows): 1-px line, 2-px gold keyline (lit top), 1-px bevel, 16 rows
 *  of ink, 2-px keyline, 1-px line, 2 shadow rows. The text / glyph rows match the 1x ribbon x 2. */
const capRows = (T) => [T.outline, T.gold, T.goldSh, T.inkRaised, ...Array(16).fill(T.ink), T.goldSh, T.goldSh, T.outline, T.shadow, T.shadow];
const CAP_RIBBON = 23;   // rows 0..22 = the ribbon (line to line), 23..24 shadow
export const captionMidHD = (T) => memo(`capmid${tkey(T)}`, () => { const im = new PixelImage(1, 30); capRows(T).forEach((c, j) => im.set(0, j, c)); return im; });
/** Left ribbon end (14x30, the right end = flipX): a swallowtail cut on the HD grid (tips at rows 4 / 18, notch 5 px
 *  deep), the line following the cut 1 px wide and the gold keyline 2 px inside it. */
export const captionEndHD = (T) => memo(`capend${tkey(T)}`, () => {
  const W = 14, rows = capRows(T);
  const Lx = (j) => (j <= 4 ? 4 - j : j <= 11 ? Math.round((j - 4) * 5 / 7) : j <= 18 ? Math.round((18 - j) * 5 / 7) : j - 18);
  const inside = (x, j) => j >= 0 && j < CAP_RIBBON && x >= Lx(j);
  const im = new PixelImage(W, 30);
  const dist = (x, j) => {                     // 4-neighbour distance to the cut (0 = the line ring)
    let d = 9;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const m = Math.abs(dx) + Math.abs(dy); if (m && m <= 4 && !inside(x + dx, j + dy)) d = Math.min(d, m - 1); }
    return d;
  };
  for (let j = 0; j < CAP_RIBBON; j++) for (let x = 0; x < W; x++) {
    if (!inside(x, j)) continue;
    const d = dist(x, j);
    let c = rows[j];
    if (j > 0 && j < CAP_RIBBON - 1) { if (d <= 0) c = T.outline; else if (d <= 2 && j > 2 && j < CAP_RIBBON - 3) c = T.goldSh; }
    im.set(x, j, c);
  }
  for (let j = CAP_RIBBON; j < CAP_RIBBON + 2; j++) for (let x = Lx(CAP_RIBBON - 1) + 2; x < W; x++) im.set(x, j, T.shadow);
  return im;
});
/** 18x18 caption glyphs (1x 9x9: 7x7 art + line): the hud HD glyph art (gold) + a 1-px goldLine, centred. */
export const captionGlyphHD = (name, T) => memo(`capg${name}${tkey(T)}`, () => {
  let art;
  if (name === 'hand') art = paint(HAND_GOLD, { H: T.goldHi, M: T.gold, S: T.goldSh, L: T.goldLine });
  else if (name === 'moon') art = field(14, 14, (px, py) => (Math.hypot(px - 7, py - 7) > 6.6 || Math.hypot(px - 10, py - 5.2) <= 5.6 ? null : px + py < 10.5 ? T.goldHi : px + py > 16 ? T.goldSh : T.gold));
  else if (name === 'candle') {
    const P = { hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh, line: ramp(T.parchment, { line: 0.58 }).line };
    art = new PixelImage(14, 14);
    const body = field(14, 14, (px, py, x, y) => (y >= 6 && y <= 13 && x >= 4 && x <= 9) || (y >= 12 && x >= 2 && x <= 11) ? P.mid : null);
    art.blit(A.shade(body, P), 0, 0);
    for (const [x, y, c] of [[6, 0, T.goldHi], [6, 1, T.goldHi], [7, 1, T.gold], [6, 2, T.parchmentHi], [7, 2, T.gold], [6, 3, T.goldHi], [7, 3, T.goldSh], [6, 4, T.goldSh]]) art.set(x, y, c);
    const o = new PixelImage(18, 18); o.blit(art, 2, 2); return o;
  } else art = GLYPH_HD[name](T);
  const o = new PixelImage(18, 18); o.blit(outlined(art, T.goldLine), 1, 1); return o;
});
const HAND_GOLD = ['...H...H...H..', '..HMS.HMS.HMS.', '..HMS.HMS.HMS.', '..HMSLHMSLHMS.', '..HMSLHMSLHMS.', '..HMMMMMMMMMS.',
  'HHHMMMMMMMMMS.', 'HMMMMMMMMMMMS.', '.HMMMMMMMMMMS.', '..MMMMMMMMMMS.', '...MMMMMMMMS..', '....MMMMMMS...', '....SSSSSSS...', '.....SSSS.....'];
/** The phase caption ribbon at D=2 (same layout as events captionImage, every 1x px = 2 HD px; text in body@2). */
export function captionImageHD(text, glyphName, T, { narrow = 0 } = {}) {
  const C = EV.CAPTION;
  const line = wrapText(text, C.maxW, { maxLines: 1 })[0] ?? '';
  const gw = glyphName ? C.glyphW + C.gap : 0;
  const full = 2 * (C.capIn + C.pad) + gw + textWidth(line);
  const w = Math.max(24, full - narrow * 2), D = 2;
  const img = new PixelImage(w * D, 30);
  const E = captionEndHD(T), M = captionMidHD(T);
  for (let x = 14; x < w * D - 14; x++) img.blit(M, x, 0);
  img.blit(E, 0, 0); img.blit(E, w * D - 14, 0, { flipX: true });
  if (!narrow) {
    const x0 = C.capIn + C.pad;
    if (glyphName) img.blit(captionGlyphHD(glyphName, T), x0 * D, 3 * D);
    drawText(img, (x0 + gw) * D, 4 * D, line, { color: T.text, font: body2() });
  }
  img.w1 = w;
  return img;
}
/** events drawCaption at D=2 (L.screen = a density view): same envelope / pop / dissolve, the HD ribbon, HD dissolve. */
export function drawCaptionHD(L, F, { text, glyph = null, k, durF, cx = null, y = 23, still = false }) {
  const e = EV.env(k, durF);
  if (!e) return;
  const T = L.tok, v = L.screen, D = v.density;
  const pop = e.pop && !still;
  const img = memo(`capHD|${text}|${glyph}|${pop ? 1 : 0}|${tkey(T)}`, () => captionImageHD(text, glyph, T, { narrow: pop ? 8 : 0 }));
  const x = Math.floor((cx ?? v.w / 2) - img.w1 / 2);
  v.base.blit(e.k ? dissolve(img.clone(), e.k) : img, x * D + v.ox, y * D + v.oy);
}

// ------------------------------------------------------------------------------------------------ banners
const BH = A.BANNER_H * 2;   // 68
const bannerTones = (T, style) => (style === 'parchment'
  ? { f: T.parchment, h: T.parchmentHi, s: T.parchmentSh, o: A.rampOf(T.parchment, { line: 0.5 }).line, g: T.goldSh, g2: T.gold }
  : { f: T.ink, h: T.inkRaised, s: T.inkSunk, o: T.outline, g: T.gold, g2: T.goldSh });
/** HD banner rows: line 1, keyline 2 (gold / goldSh), bevel 1 ... keyline 2, line 1, shadow 2 (= BANNER_H x 2). */
function bannerRow(j, P, T) {
  const last = BH - 3;                       // the bottom line row; BH-2, BH-1 = shadow
  if (j === 0 || j === last) return P.o;
  if (j === 1) return P.g; if (j === 2) return P.g2;
  if (j === last - 2 || j === last - 1) return P.g2;
  if (j === 3) return P.h;
  if (j > last) return T.shadow;
  return P.f;
}
export const bannerMidHD = (T, style = 'ink') => memo(`banmid${style}${tkey(T)}`, () => {
  const P = bannerTones(T, style), im = new PixelImage(1, BH); for (let j = 0; j < BH; j++) im.set(0, j, bannerRow(j, P, T)); return im;
});
/** Banner end (24 x 68, right = flipX): the swallowtail cut 10 HD px deep on a straight diagonal, 1-px line, 2-px keyline. */
export const bannerEndHD = (T, style = 'ink') => memo(`banend${style}${tkey(T)}`, () => {
  const P = bannerTones(T, style), W = 24, last = BH - 3, mid = last / 2;
  const notch = (j) => Math.round(10 * (1 - Math.abs(j + 0.5 - mid - 0.5) / (mid + 0.5)));
  const inside = (x, j) => j >= 0 && j <= last && x >= notch(j) && x < W + 4;
  const im = new PixelImage(W, BH);
  for (let j = 0; j < BH; j++) for (let x = 0; x < W; x++) {
    if (j > last) { if (x >= notch(last) + 2) im.set(x, j, T.shadow); continue; }
    if (!inside(x, j)) continue;
    let c = bannerRow(j, P, T);
    if (j > 0 && j < last) {
      const edge = (k) => !inside(x - k, j) || !inside(x - k, j - 1) || !inside(x - k, j + 1);
      if (edge(1)) c = P.o; else if ((edge(2) || edge(3)) && j > 2 && j < last - 2) c = P.g;
    }
    im.set(x, j, c);
  }
  return im;
});
/** 42x42 banner emblem: a lit medallion (1-px line, 2-band rim), the dark well, the motif in HD (bell / sun / horned moon + star). */
export const emblemHD = (kind, T) => memo(`emb${kind}${tkey(T)}`, () => {
  const base = kind === 'good' ? A.rampOf(T.good, { line: 0.34 }) : kind === 'evil' ? A.rampOf(T.evil, { line: 0.34 }) : { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine };
  const im = field(42, 42, (px, py) => {
    const dx = px - 21, dy = py - 21, d = Math.hypot(dx, dy);
    if (d > 19.6) return null;
    if (d > 18.6) return base.line;
    if (d > 15) { const k = (-dx - dy) / d; return k > 0.45 ? base.hi : k < -0.45 ? base.sh : base.mid; }
    if (d > 14.2) return base.line;
    return kind === 'start' ? T.inkSunk : T.ink;
  });
  const motif = {
    start: ['....#....', '...###...', '..#####..', '..#####..', '..#####..', '.#######.', '#########', '....#....'],
    good: ['....#....', '.#..#..#.', '..#####..', '..#####..', '#########', '..#####..', '..#####..', '.#..#..#.', '....#....'],
    evil: ['...####..', '..##.....', '.##...#..', '.##..###.', '.##...#..', '.##......', '..##.....', '...####..'],
  }[kind];
  const M = kind === 'evil' ? { hi: T.evil, mid: A.rampOf(T.evil).sh, sh: A.rampOf(T.evil).line } : { hi: T.goldHi, mid: T.gold, sh: T.goldSh };
  const art = shadeGrid(epx(motif), { '#': M }, { pad: 0 });      // Scale2x of the 1x motif, re-lit with 1-px bands
  im.blit(art, 12, 2 * Math.round(10.5 - motif.length / 2));
  return im;
});
/** Banner title at D=2. The 1x title is body at 2x blocks (cap 12 texels); at D=2 it is drawn 1:1 in body@4 = the
 *  Scale2x-smoothed body@2 (cap 24 HD px: the same size and 4-px stems, but round bowls and clean diagonals instead of
 *  2x2 blocks), the same tracking, a 2-HD-px shadow. */
let BODY4 = null;
function titleImageHD(s, col, T) {
  BODY4 ??= derive2x(fontAt('body', 2), { smooth: true, name: 'body@4' });
  const w1 = A.trackedWidth(s, 1), t = new PixelImage(w1 * 4, 40);
  let cx = 0;
  for (const ch of s) { drawText(t, cx, 0, ch, { color: col, shadow: T.shadow, font: BODY4, shadowDy: 2 }); cx += 4 * ((ch === ' ' ? 2 : textWidth(ch)) + 1 + 1); }
  return t;
}
function bannerImageHD(kind, T, frac = 1, showText = true, emblemDy = null) {
  const B = EV.BANNERS[kind], style = B.style === 'parchment' ? 'parchment' : 'ink';
  const title = titleImageHD(B.title, T[B.color], T);
  const full = Math.max(2 * A.trackedWidth(B.title, 1), textWidth(B.sub, 'tiny')) + 40;
  const w = Math.max(30, Math.round(full * frac / 2) * 2), oy = 14, D = 2;
  const img = new PixelImage(full * D, (oy + A.BANNER_H) * D);
  const ox = Math.floor((full - w) / 2) * D;
  for (let x = ox + 24; x < ox + w * D - 24; x++) img.blit(bannerMidHD(T, style), x, oy * D);
  img.blit(bannerEndHD(T, style), ox, oy * D); img.blit(bannerEndHD(T, style), ox + w * D - 24, oy * D, { flipX: true });
  if (showText) {
    img.blit(title, Math.floor((full * D - title.w) / 2), (oy + 8) * D);
    drawText(img, full, (oy + 25) * D, B.sub, { font: fontAt('tiny', 2), color: T.textDim, align: 'center' });
  }
  if (emblemDy !== null) img.blit(emblemHD(kind, T), Math.floor(full / 2) * D - 20, emblemDy * D);
  img.w1 = full;
  return img;
}
/** events drawBanner at D=2 (L.screen = a density view): same unfurl / emblem pop / hold / dissolve. */
export function drawBannerHD(L, F, kind, k, { cx = null, y = EV.BANNER_Y, still = false } = {}) {
  const B = EV.TIMING.banner, T = L.tok, v = L.screen, D = v.density;
  if (k < 0) return;
  const unF = B.unfurlDrawings * B.unfurlHold, e = EV.env(k, unF + B.holdF, { popF: 0 });
  if (!e) return;
  const dr = still ? B.unfurlDrawings : Math.min(B.unfurlDrawings, Math.floor(k / B.unfurlHold) + 1);
  const done = dr === B.unfurlDrawings, pop = !still && k >= unF && k < unF + 2;
  const img = memo(`banHD|${kind}|${dr}|${pop}|${tkey(T)}`, () => bannerImageHD(kind, T, dr / B.unfurlDrawings, done, done ? (pop ? 2 : 0) : null));
  const x = Math.floor((cx ?? v.w / 2) - img.w1 / 2);
  v.base.blit(e.k ? dissolve(img.clone(), e.k) : img, x * D + v.ox, y * D + v.oy);
}

// ------------------------------------------------------------------------------------------------ world FX frames
const sparkGold = (T) => ({ core: T.goldHi, arm: T.gold, tip: T.goldSh });
const sparkGhost = (T) => ({ core: ramp(T.ghost).hi, arm: T.ghost, tip: T.ghostSh });
/** A 1x spark (r 0..3) at D=2: r 0 = a 2x2 mote, r >= 1 = a 1-px plus with arms 2r (+ diagonal glints at r 3). */
function sparkHD(img, x, y, r, S) {
  if (r <= 0) { img.rect(2 * x, 2 * y, 2, 2, S.arm); img.set(2 * x, 2 * y, S.core); return; }
  A.spark(img, 2 * x, 2 * y, 2 * r, S);
  if (r >= 2) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) img.set(2 * x + dx, 2 * y + dy, S.arm);
}
/** Bell over the condemned at D=2 (26x24): flared bronze bell on the HD grid, a highlight streak, swing = sheared rows. */
export const bellHD = (k, T) => memo(`bellhd${k}${tkey(T)}`, () => {
  const widths = [2, 2, 4, 6, 8, 10, 10, 12, 12, 12, 12, 12, 12, 14, 14, 16, 18, 22];
  const m = new PixelImage(26, 24);
  widths.forEach((w, j) => m.rect(13 - w / 2, 2 + j, w, 1, T.gold));
  m.rect(12, 20, 2, 2, T.gold);                        // clapper
  const s = A.shade(m, GOLD(T));
  for (let j = 6; j <= 16; j++) s.set(13 - Math.floor(widths[j - 2] / 2) + 2, j, T.goldHi);
  if (k === 1) return s;
  const o = new PixelImage(26, 24), dir = k === 0 ? -1 : 1;
  for (let y = 0; y < 24; y++) { const sh = Math.round(dir * Math.max(0, y - 4) / 8); for (let x = 0; x < 26; x++) { const v = s.get(x, y); if (v[3]) o.set(x + sh, y, v); } }
  return o;
});
/** The soul wisp at D=2 (64x80): the same path / size per drawing, a round head + a tapering curled tail on the HD grid,
 *  1-px hi / sh bands and line, 2x2 eyes once it is big, HD motes. */
export const wispHD = (k, T) => memo(`wisphd${k}${tkey(T)}`, () => {
  const img = new PixelImage(64, 80);
  const GR = { hi: ramp(T.ghost).hi, mid: T.ghost, sh: T.ghostSh, line: A.rampOf(T.ghostSh, { line: 0.3 }).line };
  const cy = A.WISP_PATH.cy[k] * 2, sz = A.WISP_PATH.sz[k] * 2;
  if (k < 5) {
    const flame = new PixelImage(64, 80);
    flame.disc(32, cy, sz, '#ffffff');
    const len = Math.round(sz * 2.2);
    for (let j = 1; j <= len; j++) {
      const w = Math.max(0.5, sz * (1 - j / (len + 1))), off = Math.sin(j * 0.4 + k * 1.3) * Math.min(4, j / 3);
      flame.rect(Math.round(32 - w + off), Math.round(cy + sz * 0.6 + j), Math.max(1, Math.round(2 * w)), 1, '#ffffff');
    }
    const s = A.shade(flame, GR);
    if (sz >= 8) { s.rect(27, cy - 1, 2, 2, GR.line); s.rect(35, cy - 1, 2, 2, GR.line); }
    img.blit(s, 0, 0);
  }
  const mot = [[[10, 36, 0], [22, 35, 0]], [[9, 33, 1], [23, 32, 0], [14, 37, 0]], [[8, 28, 1], [24, 26, 1], [12, 34, 0], [21, 33, 0]],
    [[7, 22, 1], [25, 20, 1], [11, 28, 0], [21, 27, 1]], [[6, 15, 0], [26, 14, 1], [10, 22, 1], [22, 20, 0]], [[5, 8, 0], [27, 9, 0], [9, 16, 2], [23, 13, 2], [16, 4, 3]]][k];
  for (const [x, y, r] of mot) sparkHD(img, x, y, r, sparkGhost(T));
  return img;
});
/** Ghost reveal burst at D=2 (66x68): the same ring of sparks on the HD grid (finer arms). */
export const revealHD = (k, T) => memo(`revhd${k}${tkey(T)}`, () => {
  const img = new PixelImage(66, 68), S = sparkGhost(T), G = sparkGold(T), R = [7, 11, 14, 16][k];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const x = 32 + Math.cos(a) * R * 2, y = 36 + Math.sin(a) * R * 1.5;
    const r = k === 3 ? 0 : i % 2 ? 1 : 2, Sx = i % 4 === 0 ? G : S;
    if (r === 0) { img.rect(Math.round(x), Math.round(y), 2, 2, Sx.arm); img.set(Math.round(x), Math.round(y), Sx.core); }
    else A.spark(img, Math.round(x), Math.round(y), 2 * r, Sx);
  }
  if (k === 0) { A.spark(img, 32, 12, 6, G); for (const [dx, dy] of [[2, 2], [-2, 2], [2, -2], [-2, -2]]) img.set(32 + dx, 12 + dy, G.tip); }
  return img;
});
/** The Storyteller poof at D=2 (64x80, feet (32, 76)): the same puffs at 2x radii (2-px rim crescents = finer billows,
 *  1-px sh band and line), the light column 5 HD px wide, HD sparkles. */
export const poofHD = (f, T) => memo(`poofhd${f}${tkey(T)}`, () => {
  const img = new PixelImage(64, 80);
  const SM = A.rampOf(A.SMOKE, { light: 0.1, dark: 0.12, line: 0.3 }), G = sparkGold(T), V = A.SPARK_VIOLET;
  const N = 14, cx = 16, gy = 37, motes = [];
  for (let i = 0; i < N; i++) {             // the 1x mote layout (same positions, x 2)
    const base = (i / N) * Math.PI * 2, gold = i % 3 === 0, lift = (i % 5) / 4;
    let rad, h, r, spin;
    switch (f) {
      case 0: rad = 12 - lift * 2; h = 1 + lift * 4; r = i % 2 ? 0 : 1; spin = 0; break;
      case 1: rad = 12 - lift; h = 12 + lift * 18; r = i % 3 === 1 ? 2 : 1; spin = 0.9; break;
      case 2: rad = 9 + lift * 3; h = 18 + lift * 17; r = i % 3 === 0 ? 2 : 1; spin = 1.8; break;
      case 3: rad = 12 + lift * 2; h = 20 + lift * 15; r = i % 4 === 0 ? 2 : 1; spin = 2.4; break;
      case 4: rad = 13 + lift * 2; h = 22 + lift * 14; r = i % 4 === 0 ? 1 : 0; spin = 2.8; break;
      default: rad = 14 + lift; h = 24 + lift * 12; r = 0; spin = 3.1;
    }
    if (f === 5 && i % 3) continue;
    if (f === 4 && i % 4 === 3) continue;
    const a = base + spin;
    let x = Math.max(2, Math.min(29, Math.round(cx + Math.cos(a) * rad)));
    if (f === 2 && Math.abs(x - cx) < 4) x = cx + (x < cx ? -4 : 4);
    motes.push({ x, y: Math.max(2, Math.round(gy - h + Math.sin(a) * rad * 0.35)), r, S: gold ? G : V, back: Math.sin(a) < 0 });
  }
  const drawMotes = (back) => { for (const m of motes) if (m.back === back) sparkHD(img, m.x, m.y, m.r, m.S); };
  drawMotes(true);
  const beam = (y0, y1, im) => { for (let y = y0; y <= y1; y++) { im.set(31, y, T.gold); im.set(32, y, T.goldHi); im.set(33, y, T.parchmentHi); im.set(34, y, T.goldHi); im.set(35, y, T.gold); } };
  if (f === 2) {
    const col = new PixelImage(64, 80);
    for (const [y0, y1] of [[2, 3], [6, 9], [12, 17], [20, 45]]) beam(y0, y1, col);
    col.outline(T.goldLine);
    img.blit(col, 0, 0);
  }
  const light = f === 2 ? [29, 37] : f === 3 ? [31, 35] : null;
  const puffs = A.POOF_PUFFS[f].map(([x, y, r]) => [x * 2, y * 2, r * 2]);
  img.blit(A.cloud(64, 80, puffs, SM, { rim: T.parchmentHi, light, line: f >= 4 ? SM.sh : SM.line }), 0, 0);
  if (f === 2) {
    beam(20, 39, img);
    sparkHD(img, 9, 4, 2, G); sparkHD(img, 24, 3, 2, V); sparkHD(img, 5, 9, 1, V); sparkHD(img, 27, 7, 1, G);
  }
  drawMotes(false);
  return img;
});
/** Memorial candle at D=2 (14x26): parchment candle with 1-px bands + line, a teardrop flame (cream core, gold, warn
 *  base) leaning per drawing, own goldLine. */
export const candleHD = (k, T) => memo(`candlehd${k}${tkey(T)}`, () => {
  const img = new PixelImage(14, 26);
  const P = { hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh, line: A.rampOf(T.parchment, { line: 0.58 }).line };
  const body = field(14, 26, (px, py, x, y) => ((y >= 11 && y <= 19 && x >= 5 && x <= 8) || (y >= 20 && y <= 23 && x >= 3 && x <= 10) ? P.mid : null));
  img.blit(A.shade(body, P), 0, 0);
  const lean = [0, -1, 1][k], top = [4, 2, 4][k];
  const fm = field(14, 26, (px, py, x, y) => {
    if (y < top || y > 9) return null;
    const t = (py - top) / (10 - top), cxl = 7 + lean * (1 - t), hw = 0.6 + 1.6 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62);
    if (Math.abs(px - cxl) > hw) return null;
    return y >= 9 ? T.warn : Math.abs(px - cxl) < hw - 1 && y > top + 1 ? T.parchmentHi : t < 0.35 ? T.goldHi : T.gold;
  });
  fm.outline(T.goldLine);
  img.blit(fm, 0, 0);
  img.set(7, 10, T.goldLine);                   // the wick
  return img;
});

// ------------------------------------------------------------------------------------------------ prepare / hooks
const prepared = new WeakSet();
let hooked = false;
/**
 * Attach the HD frames to the events frames of token set T (idempotent) and install EV.HD_HOOKS once. After it a
 * density view gets: put(view, F, 'vc_seat_*' | 'bell_*' | 'wisp_*' | 'reveal_*' | 'poof_*' | 'candle_*' | ...) = HD,
 * EV.drawVoteHud(hud, LS, ...) with LS.screen = a view = HD face / pips / hand / text, EV.drawCaption / drawBanner = HD.
 */
export function prepareEventsHD(T) {
  const F = EV.framesFor(T);
  if (!prepared.has(F)) {
    prepared.add(F);
    const at = (n, hd) => { if (F[n]) withHD(F[n], hd); };
    at('vc_face', vcFaceHD(T));
    for (const s of ['idle', 'yes', 'no', 'raised0', 'raised1', 'dead', 'nominee', 'current']) at(`vc_seat_${s}`, vcSeatHD(s, T));
    at('caption_end', captionEndHD(T)); at('caption_mid', captionMidHD(T));
    for (const g of ['moon', 'sun', 'bell', 'candle', 'hand']) at(`glyph_${g}`, captionGlyphHD(g, T));
    at('banner_end', bannerEndHD(T)); at('banner_mid', bannerMidHD(T));
    at('banner_end_parchment', bannerEndHD(T, 'parchment')); at('banner_mid_parchment', bannerMidHD(T, 'parchment'));
    for (const e of ['start', 'good', 'evil']) at(`emblem_${e}`, emblemHD(e, T));
    for (let k = 0; k < 3; k++) at(`bell_${k}`, bellHD(k, T));
    for (let k = 0; k < 6; k++) at(`wisp_${k}`, wispHD(k, T));
    for (let k = 0; k < 4; k++) at(`reveal_${k}`, revealHD(k, T));
    for (let f = 0; f < 6; f++) at(`poof_${f}`, poofHD(f, T));
    for (let k = 0; k < 3; k++) at(`candle_${k}`, candleHD(k, T));
  }
  if (!hooked) {
    hooked = true;
    Object.assign(EV.HD_HOOKS, { drawCaption: drawCaptionHD, drawBanner: drawBannerHD, voteHand: drawVoteHandHD });
  }
  return F;
}
