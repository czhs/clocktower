// Indicators at UI DENSITY D=2 (owner: indicators group; docs/UI.md §2.10 "Density", wave 1). The in-world indicators
// redrawn at twice the detail on the same on-screen footprint (sizes and anchors exactly 2x the 1x art in art.js),
// pure JS, deterministic, tokens only. The 1x art.js is unchanged (byte-identical).
//
//   bubbleHD(lines, tailX, T, {pop})       speech bubble: the D=2 'bubble' frame (kit drawBoxHD), crisp body@2 text and
//                                          a stepped HD tail grown out of the frame; (2w + 2) x (2h + 6) = 2x art.bubble
//   bubbleInto(img, x, y, lines, tailX, T, {pop})   draw INTO a given image: a density view -> the HD bubble (logical
//                                          x, y), a 1x image -> art.bubble / bubblePop (unchanged)
//   talkGlyphHD(step, kind, T)             18x18 glyph beside the name ('talk' | 'self' | 'selfIdle' | 'muted')
//   youChevronHD(T)                        18x12 gold chevron over your name (2-HD-px goldLine, holds on cobbles)
//   youRingHD(k, T)                        66x34 "you are here" ground ring (k 0..3 as art.youRing; a ground decal:
//                                          markers hd.js putGroundHD on the depth tier, or L.hd.world)
//   edgeDiscHD(icon, T, name, ghost, ghostReady) / edgeDiscPointerHD(disc, dir8, T)   off-screen discs (S): a 48x48
//                                          avatar (portraits-hd) -> 56x56, a 24x24 icon -> 36x36; the tail 14 px
// Language at D=2: 1-HD-px lines in own-colour tones (2 px for the chevron and the disc tails over the world), 1-px
// lit edges from the upper left, binary alpha. Text inside: kit body@2 (drawText through a density view).
import { PixelImage, drawText, drawBox, hdPiece, ramp, densityView } from '../kit.js';
import * as IA from './art.js';

const D = 2;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const rampOf = IA.rampOf;
const cache = new Map();
const memo = (k, fn) => { let v = cache.get(k); if (!v) { v = fn(); cache.set(k, v); if (cache.size > 600) cache.delete(cache.keys().next().value); } return v; };

// ------------------------------------------------------------------------------------------------ speech bubbles
/**
 * The HD speech bubble (2x art.bubble: same box, same tail column, same text layout; line 1 HD px, keyline 2, rounder
 * corners, body@2 text). lines = art.bubbleLines(text); tailX = box-local logical px (null = no tail); pop = the
 * one-step-smaller first drawing (art.bubblePop). Returns an HD PixelImage of (w + 1)·2 x (h + 3)·2; place it at
 * (logical x·2, y·2) where art.bubble would go at (x, y).
 */
export function bubbleHD(lines, tailX, T, { pop = false } = {}) {
  const key = `b${pop ? 'p' : ''}|${lines.join('\n')}|${tailX}|${T.bubble}|${T.bubbleEdge}|${T.text}`;
  return memo(key, () => {
    const { w, h } = IA.bubbleSize(lines);
    const im = hdPiece(w + 1, h + IA.BUBBLE_TAIL_H + 1, (v) => {
      if (pop) drawBox(v, 2, 1, w - 4, h - 1, 'bubble', T); else drawBox(v, 0, 0, w, h, 'bubble', T);
    }, D);
    if (tailX !== null && tailX !== undefined) {
      const tx = pop ? Math.max(5, Math.min(w - 5, tailX | 0)) : Math.max(4, Math.min(w - 4, tailX | 0));
      tailHD(im, tx * D, h * D, T, pop ? 3 : 5, pop ? 3 : 5);
    }
    lines.forEach((l, i) => drawText(im.view, Math.floor(w / 2), 3 + i * 9, l, { color: T.text, align: 'center' }));
    return im;
  });
}
/**
 * Grow a stepped tail out of an HD bubble frame: the union of the box and a tail (half-width hw over the box's bottom
 * 6 rows, then narrowing 1 px per row for `rows` rows to a 2-px point at column TX) is re-coloured near the joint by
 * 4-neighbour distance to the outside (1-px outline, 2-px bubbleEdge keyline, bubble fill), as drawBoxHD does, and
 * its drop shadow (2 px right, 2 down) continues under the tail.
 */
function tailHD(im, TX, HB, T, hw, rows) {
  const W = im.w, Hh = im.h, y0 = HB - 7, y1 = HB + rows;
  const box = (i, j) => im.alpha(i, j) > 0 && j < HB;            // the frame itself (its shadow rows are j >= HB)
  const half = (j) => (j < HB ? hw : hw - (j - HB) - 1);
  const tail = (i, j) => j >= y0 && j < y1 && half(j) > 0 && Math.abs(i + 0.5 - TX) <= half(j);
  const M = (i, j) => i >= 0 && j >= 0 && i < W && j < Hh && (box(i, j) || tail(i, j));
  const xa = TX - hw - 4, xb = TX + hw + 4;
  // steps to the outside (1 = the border pixel), Manhattan, capped at 4
  const dist = (i, j) => { for (let d = 1; d <= 3; d++) for (let a = -d; a <= d; a++) { const b = d - Math.abs(a); if (!M(i + a, j + b) || !M(i + a, j - b)) return d; } return 4; };
  const set = [];
  for (let j = y0; j < Math.min(Hh, y1 + 3); j++) for (let i = xa; i <= xb; i++) {
    if (M(i, j)) {
      if (!tail(i, j) && j < HB - 4) continue;                    // keep the box rows above the joint as drawn
      const d = dist(i, j);
      set.push([i, j, d === 1 ? T.outline : d <= 3 ? T.bubbleEdge : T.bubble]);
    } else if (M(i - 2, j - 2) && j >= HB) set.push([i, j, T.shadow]);   // the drop shadow continues under the tail
  }
  for (const [i, j, c] of set) im.set(i, j, c);
}
/** Draw a speech bubble INTO img at logical (x, y): a density view -> bubbleHD; a 1x PixelImage -> art.bubble(Pop). */
export function bubbleInto(img, x, y, lines, tailX, T, { pop = false } = {}) {
  if (img?.isView && img.density === D) {
    img.base.blit(bubbleHD(lines, tailX, T, { pop }), (x | 0) * D + img.ox, (y | 0) * D + img.oy);
    return img;
  }
  return img.blit(pop ? IA.bubblePop(lines, tailX, T) : IA.bubble(lines, tailX, T), x, y);
}

// ------------------------------------------------------------------------------------------------ talk glyph
/** The 18x18 plate (labelLine, rounded corners): the label outline widened, as the 1x 9x9 plate. */
function plateHD(T) {
  const g = new PixelImage(18, 18).fill(T.labelLine);
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [17, 0], [16, 0], [17, 1], [0, 17], [1, 17], [0, 16], [17, 17], [16, 17], [17, 16]]) g.erase(x, y);
  return g;
}
/**
 * 18x18 talk glyph (art.talkGlyph at D=2): three 2-px voice bars with rounded caps (hi cap, sh foot) on the plate,
 * heights 2x the v2 WAVE (+1) steps; 'selfIdle' = flat dim dashes; 'muted' = a mic (rounded capsule with a grille
 * slot, cradle, stem, foot) crossed by a 2-px danger slash.
 */
export function talkGlyphHD(step, kind, T) {
  return memo(`tg${step}|${kind}|${T.labelLine}|${T.talk}|${T.self}`, () => {
    const g = plateHD(T);
    if (kind === 'muted') {
      const m = T.textDim, ms = rampOf(T.textDim).sh, mh = rampOf(T.textDim).hi;
      // capsule 6x9 (x 6..11, y 2..10), round top + bottom, lit left column, grille slot
      for (let y = 2; y <= 10; y++) for (let x = 6; x <= 11; x++) {
        if ((y === 2 || y === 10) && (x === 6 || x === 11)) continue;
        g.set(x, y, x === 6 || y === 2 ? mh : x === 11 ? ms : m);
      }
      g.rect(8, 4, 2, 1, ms); g.rect(8, 6, 2, 1, ms);
      // cradle (a U under the capsule), stem, foot
      for (const [x, y] of [[4, 8], [4, 9], [5, 10], [5, 11], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12], [11, 12], [12, 11], [12, 10], [13, 9], [13, 8]]) g.set(x, y, ms);
      g.rect(8, 13, 2, 2, ms); g.rect(6, 15, 6, 1, ms);
      const d = rampOf(T.danger);
      for (let i = 0; i < 13; i++) { const x = 2 + i, y = 15 - i; g.set(x, y, i < 1 || i > 11 ? d.sh : T.danger); g.set(x + 1, y, i > 11 ? d.sh : d.sh); }
      return g;
    }
    const base = kind === 'self' || kind === 'selfIdle' ? T.self : T.talk, R = rampOf(base);
    if (kind === 'selfIdle') { for (const x of [4, 8, 12]) { g.rect(x, 8, 2, 2, R.sh); g.set(x, 8, base); } return g; }
    const hs = IA.WAVE[((step % 4) + 4) % 4].map((h) => (h + 1) * 2);
    hs.forEach((h, i) => {
      const x = 4 + i * 4, y0 = 9 - (h >> 1);
      for (let j = 0; j < h; j++) {
        const c = j === 0 ? R.hi : j === h - 1 ? R.sh : base;
        g.set(x, y0 + j, c); g.set(x + 1, y0 + j, j === 0 ? base : j >= h - 2 ? R.sh : base);
      }
    });
    return g;
  });
}

// ------------------------------------------------------------------------------------------------ "you are here"
/** 18x12 gold chevron (art.youChevron at D=2): a 14x8 stepped chevron with a lit top bevel and a centre crease toward
 *  the point, shaded right flank, 2-HD-px goldLine. */
export function youChevronHD(T) {
  return memo(`ych|${T.gold}|${T.goldLine}`, () => {
    const g = [
      'hhhhhhhhhhhhhh',
      'mmmmmmmmmmmmms',
      '.mmmmmmhmmmss.',
      '..mmmmmhmmss..',
      '...mmmmhmss...',
      '....mmmhss....',
      '.....mmss.....',
      '......ms......',
    ];
    const C = { h: T.goldHi, m: T.gold, s: T.goldSh };
    const img = new PixelImage(18, 12);
    g.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') img.set(2 + x, 2 + y, C[ch]); }));
    img.outline(T.goldLine); img.outline(T.goldLine);
    return img;
  });
}
/**
 * 66x34 "you are here" ground ring (art.youRing at D=2): the same 4 arcs round the diagonals (gaps at the cardinal
 * points), a 3-px band (2 px at the poles) lit on its far-left arc, a 1-px goldLine contour on both sides; k = drawing
 * 0..3 (sizes 0, 1, 1, 0: the v2 own-spot pulse). Anchor = (32, 16) (2x the 1x (16, 8)).
 */
export function youRingHD(k, T) {
  return memo(`yr${k}|${T.gold}|${T.goldLine}`, () => {
    const big = k === 1 || k === 2 ? 1 : 0;
    const img = new PixelImage(66, 34), cx = 33, cy = 17, rx = 26 + 2 * big, ry = 12 + big;
    const band = new PixelImage(66, 34);
    const keep = (x, y) => Math.abs(x + 0.5 - cx) / rx >= 0.3 && Math.abs(y + 0.5 - cy) / ry >= 0.4;
    const ins = (x, y, a, b) => ((x + 0.5 - cx) / a) ** 2 + ((y + 0.5 - cy) / b) ** 2 <= 1;
    for (let y = 0; y < 34; y++) for (let x = 0; x < 66; x++) {
      if (!ins(x, y, rx, ry) || ins(x, y, rx - 3, ry - 1.6) || !keep(x, y)) continue;
      const far = y + 0.5 < cy, left = x + 0.5 < cx, outer = !ins(x, y, rx - 1, ry - 0.55);
      band.set(x, y, far && left ? (outer ? T.goldHi : T.gold) : far ? (outer ? T.gold : T.goldHi) : outer ? T.goldSh : T.gold);
    }
    img.blit(band, 0, 0);
    img.outline(T.goldLine);
    return img;
  });
}

// ------------------------------------------------------------------------------------------------ off-screen discs (S)
/** The HD tail length (2x art.EDGE_TAIL). */
export const EDGE_TAIL_HD = IA.EDGE_TAIL * D;
/**
 * Portrait disc for an off-screen player at D=2 (art.edgeDisc 2x): a 48x48 avatar (portraits-hd) clipped to r 23 ->
 * 56x56; a 24x24 icon (portraits-hd icon, or a 1x avatar) -> 36x36; a 12x12 icon is block-scaled x2 first; none ->
 * the initial in body@2. Rings: 1-px outline, 2-px iron (ghost: ghostSh) lit by an ironHi glint arc upper-left, a 1-px
 * inkSunk well. ghost / ghostReady as art.edgeDisc.
 */
export function edgeDiscHD(icon, T, name = '?', ghost = false, ghostReady = false) {
  const key = `ed|${icon ? `${icon.w}x${icon.h}:${icon.data[(icon.w * (icon.h >> 1) + (icon.w >> 1)) * 4]}:${icon.data[icon.data.length >> 2]}` : 'none'}|${name}|${ghost}|${ghostReady}|${T.iron}|${T.inkSunk}`;
  return memo(key, () => {
    let ic = icon || initialIconHD(name, T);
    if (ic.w <= 12) { const u = new PixelImage(ic.w * 2, ic.h * 2); u.blit(ic, 0, 0, { scale: 2 }); ic = u; }
    const big = ic.w >= 48, S = big ? 56 : 36, c = S / 2, n = ic.w, o = (S - n) / 2;
    const img = new PixelImage(S, S);
    const R = (x, y) => Math.hypot(x + 0.5 - c, y + 0.5 - c);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = R(x, y);
      if (r > c) continue;
      if (r > c - 1) img.set(x, y, T.outline);
      else if (r > c - 3) {
        const a = Math.atan2(y + 0.5 - c, x + 0.5 - c) * 180 / Math.PI;
        img.set(x, y, a > -165 && a < -105 && r > c - 2 ? (ghost ? T.ghost : T.ironHi) : ghost ? T.ghostSh : T.iron);
      } else img.set(x, y, T.inkSunk);
    }
    if (ghost && !ghostReady) ic = IA.ghostIcon(ic, T);
    const rc = big ? c - 5.5 : c - 4;   // a 48-px avatar: inside its own frame ring (r 23)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = ic.get(x, y);
      if (!v[3]) continue;
      if (R(x + o, y + o) <= rc + 0.5) img.set(x + o, y + o, v);
    }
    return img;
  });
}
/**
 * The HD disc with its attached pointer (art.edgeDiscPointer at D=2): a gold wedge whose base sits under the disc ring
 * and whose tip reaches EDGE_TAIL_HD past the disc edge, lit from the upper left (1-px hi / sh edges), a 2-px goldLine;
 * the disc drawn over the wedge's base. Returns {img, pad} (img = disc padded by `pad` on every side; centre = centre).
 */
export function edgeDiscPointerHD(disc, dir8, T) {
  return memo(`edp|${dir8}|${disc.w}|${disc.data[(disc.w * (disc.h >> 1) + (disc.w >> 1)) * 4]}|${disc.data[disc.data.length >> 2]}|${T.gold}`, () => {
    const pad = EDGE_TAIL_HD + 4, S = disc.w + 2 * pad, c = S / 2, r = disc.w / 2;
    const img = new PixelImage(S, S);
    const a = (dir8 * Math.PI) / 4, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    const tip = r + EDGE_TAIL_HD, base = r - 4, hw = 12;
    IA.poly(img, [[c + ux * tip, c + uy * tip], [c + ux * base + vx * hw, c + uy * base + vy * hw], [c + ux * base - vx * hw, c + uy * base - vy * hw]], T.gold);
    IA.shade(img, { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine });
    img.outline(T.goldLine);
    img.blit(disc, pad, pad);
    return { img, pad };
  });
}
export { N4, ramp };
/** 24x24 HD stand-in icon (art.initialIcon at D=2): a parchment disc with a lit crescent and the initial in body@2. */
export function initialIconHD(name, T) {
  return memo(`ii|${String(name)[0]}|${T.parchment}|${T.textInk}`, () => {
    const im = new PixelImage(24, 24);
    im.disc(12, 12, 12, T.parchment); im.disc(10.5, 10.5, 8.5, T.parchmentHi); im.disc(12, 12, 8.5, T.parchment);
    drawText(densityView(im, D), 6, 3, (String(name)[0] || '?').toUpperCase(), { color: T.textInk, align: 'center' });
    return im;
  });
}
