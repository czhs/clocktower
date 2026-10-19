// Indicators art (owner: indicators group; docs/UI.md §1 rows 13–21, §4 "indicators"). Pure, deterministic pixel
// art built from the kit (no three.js): used at runtime by hud.js (drawn into the UI layers every frame) and by
// bake.js (packed into out/ui/indicators.{png,json}). 1 px = 1 scene texel; colours = tokens or ramp(token).
//
// v2 had NO atlas for this group (labels = Phaser Text, bubbles / talk glyph / arrows / rings = Phaser graphics,
// door tokens = canvas textures), so every frame name here is new-style; the v2 constants each one replaces are listed
// in bake.js meta.v2 (SPEECH, talking WAVE / PULSE_MS, label colours, token sizes ...).
//
//   label(img, cx, top, name, variant, T)        name label (player | st | ghost | you), returns the drawn box
//   talkGlyph(step, kind, T)                     9x9 glyph beside the name: 'talk' | 'self' | 'selfIdle' | 'muted'
//   bubble(lines, tailX | null, T) / bubbleSize  speech bubble (kit 'bubble' frame + stepped tail), SPEECH wrap rules
//   youChevron(k, T) youSeat(k, T) youRing(k, T) "you are here": chevron over your name, own-seat "You", ground ring
//   guideArrow(dir8, T) guideDot(lit, T) doorRing(k, T) doorChevron(T)   guidance arrow + trail (ground), door marker
//   compassDisc(dir8, T) compassPill(img, x, y, w, steps, dir8, T)       home compass pill (screen)
//   callout(name, style, T)                                               house-name callout (band + tail)
//   token(icon, ghost, T) tokenPlus(n, T)                                 door-board occupant tokens
//   edgeDisc(icon, T) edgeDiscPointer(disc, dir8, T) (edgeArrow: legacy)  offscreen-player discs + attached pointer (S)
//   ghostWisp(T) labelLineOf(variant, T) talkLineOf(kind, T)              ghost label glyph, line colours (r2)
//   talkRing(k, T)                                                        ground voice ripple (low tier, no outline pass)
import { PixelImage, drawText, textWidth, drawBox, ramp, rgba, hex } from '../kit.js';

// ------------------------------------------------------------------------------------------------ v2 constants
/** v2 apps/client/src/game/social/speech.ts SPEECH (kept verbatim; lineChars is applied as a pixel width, below). */
export const SPEECH = { maxChars: 80, lineChars: 28, maxLines: 4, minMs: 5000, maxMs: 7000, perCharMs: 25, fadeInMs: 140, fadeOutMs: 600, maxBubbles: 6, maxBubblesLow: 4, staleMs: 15000 };
/** v2's 28-character line in the body font: same width relative to a character as v2 (bubble ≈ 2.2 character heights). */
export const BUBBLE_TEXT_W = 92;
/** v2 talking.ts: WAVE bar heights per pulse step, PULSE_MS 900 / 4 steps. */
export const WAVE = [[2, 4, 3], [3, 2, 4], [4, 3, 2], [3, 4, 3]];
export const PULSE_MS = 900;
/** Label geometry: cap top 11 px above the head anchor (box incl. outline = 10 px, 1 px above the anchor). */
export const LABEL_DY = -11;
/** v2 ghost labels sit 4 px higher; a pixel3d ghost hovers spec.ghost.hover 0.14 m (≈ 5 texels at vh 12). */
export const GHOST_LIFT_M = 0.14;

export const DIR8 = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];   // v2 point_<dir> names
/** Index into DIR8 of a screen vector (x right, y down). */
export const dir8Of = (dx, dy) => ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;

// ------------------------------------------------------------------------------------------------ helpers
const T_RAMP = new Map();
/** ramp() of a token colour, cached. */
export const rampOf = (c) => { const k = hex(c); let r = T_RAMP.get(k); if (!r) { r = ramp(k); T_RAMP.set(k, r); } return r; };

/** 3-tone fill of every opaque pixel of colour `mid`: lit from the upper left (hi where the up/left neighbour is empty,
 *  sh where the down/right neighbour is empty). Then a 1-px outline in `line`. Used for every solid UI sprite. */
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
/** Rasterise a polygon (array of [x, y], pixel space) into img with colour c (pixel centres inside). */
export function poly(img, pts, c) {
  const ys = pts.map((p) => p[1]), xs = pts.map((p) => p[0]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      const px = x + 0.5, py = y + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) img.set(x, y, c);
    }
  return img;
}
/** Elliptic annulus (ground ring): pixel centres inside (rx, ry) and outside (rx - tx, ry - ty). keep(x, y) filters. */
export function annulus(img, cx, cy, rx, ry, c, { tx = 2, ty = 1, keep = null } = {}) {
  const ins = (x, y, a, b) => { const dx = (x + 0.5 - cx) / a, dy = (y + 0.5 - cy) / b; return dx * dx + dy * dy <= 1; };
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++)
      if (ins(x, y, rx, ry) && !ins(x, y, rx - tx, ry - ty) && (!keep || keep(x, y))) img.set(x, y, c);
  return img;
}
/** Bitmap from rows ('#' = c1, '+' = c2, '-' = c3, '.' = empty). */
export function bits(rows, c1, c2 = c1, c3 = c1) {
  const img = new PixelImage(Math.max(...rows.map((r) => r.length)), rows.length);
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const ch = r[x]; if (ch !== '.') img.set(x, y, ch === '#' ? c1 : ch === '+' ? c2 : c3); } });
  return img;
}
/** Exact 90° transforms (pixel permutations, not rotations of art): transpose / flips. */
export function transpose(src) { const o = new PixelImage(src.h, src.w); for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) o.set(y, x, src.get(x, y)); return o; }
export function flip(src, fx, fy) { const o = new PixelImage(src.w, src.h); o.blit(src, 0, 0, { flipX: fx, flipY: fy }); return o; }
/** 8 directions from an authored 'right' and 'down-right' drawing (both centred in a square). */
export function eightWay(right, downRight) {
  const down = transpose(right), dr = downRight;
  return [right, dr, down, flip(dr, true, false), flip(right, true, false), flip(dr, true, true), flip(down, false, true), flip(dr, false, true)];
}

// ------------------------------------------------------------------------------------------------ name labels
/** Label colour for a variant: 'player' | 'st' | 'ghost' | 'you'. v2: #efe6cf / #e8c76a / #cfe6ee, stroke #0b0812. */
export const labelColor = (variant, T) => (variant === 'st' ? T.st : variant === 'ghost' ? T.ghost : T.labelText);
/** Max label width (px): longer names end in '…' (v2 had no cap; 15 chars of body ≈ 72 px). */
export const LABEL_MAX_W = 72;
export function fitName(name, maxW = LABEL_MAX_W) {
  let s = String(name).replace(/\s+/g, ' ').trim() || '?';
  if (textWidth(s) <= maxW) return s;
  while (s.length > 1 && textWidth(s + '…') > maxW) s = s.slice(0, -1).trimEnd();
  return s + '…';
}
/** Draw a name label centred on cx, cap top at `top`. Returns the box {x, y, w, h} incl. the 1-px outline ring. */
export function label(img, cx, top, name, variant, T) {
  return drawText(img, cx, top, fitName(name), { color: labelColor(variant, T), outline: labelLineOf(variant, T), align: 'center' });
}
/** Label outline: ghosts get their own cool line (ramp(ghostSh).line) so the variant is not colour-of-text only (r2). */
export const labelLineOf = (variant, T) => (variant === 'ghost' ? rampOf(T.ghostSh).line : T.labelLine);
/**
 * 7x7 wisp glyph drawn LEFT of a ghost's name (r2: the ghost label variant must not be colour-only): a little sheet
 * ghost (rounded top, 2 eye dots, wavy hem) in the ghost ramp + ghost line.
 */
export function ghostWisp(T) {
  const R = rampOf(T.ghost);
  const img = bits(['.###.', '#####', '#-#-#', '#####', '#.#.#'], T.ghost, T.ghost, T.ghostSh);
  img.set(1, 0, R.hi); img.set(0, 1, R.hi); img.set(4, 3, T.ghostSh); img.set(4, 4, T.ghostSh);
  const o = new PixelImage(7, 7); o.blit(img, 1, 1); o.outline(rampOf(T.ghostSh).line);
  return o;
}
/** Standalone label image (bake samples); ghosts carry the wisp glyph at the left. */
export function labelImage(name, variant, T) {
  const w = textWidth(fitName(name)) + 2, gw = variant === 'ghost' ? 6 : 0;
  const img = new PixelImage(w + gw, 10);
  label(img, gw + Math.floor((w - 2) / 2) + 1, 1, name, variant, T);
  if (gw) img.blit(ghostWisp(T), 0, 2);
  return img;
}

// ------------------------------------------------------------------------------------------------ talk glyph (9x9)
/** Plate behind the inline glyphs: labelLine, 1-px notched corners (reads as the label's outline ring, widened). */
function plate(T) {
  const g = new PixelImage(9, 9).fill(T.labelLine);
  for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) g.erase(x, y);
  return g;
}
/**
 * kind 'talk' (pale gold, others), 'self' (rose: your mic is on air), 'selfIdle' (your mic open, silent: flat dim bars),
 * 'muted' (a mic with a red slash). step = v2 pulse step 0..3 (WAVE heights + 1 so the 7-px plate is used).
 */
export function talkGlyph(step, kind, T) {
  const g = plate(T);
  if (kind === 'muted') {
    const m = T.textDim, ms = rampOf(T.textDim).sh;
    // mic capsule (3x4, rounded), cradle, stem, foot
    g.rect(3, 1, 3, 4, m); g.erase(3, 1); g.set(3, 1, T.labelLine); g.set(5, 1, T.labelLine);
    g.set(4, 1, m); g.set(5, 4, ms); g.set(5, 3, ms);
    g.set(2, 4, ms); g.set(6, 4, ms); g.set(3, 5, ms); g.set(4, 5, ms); g.set(5, 5, ms);
    g.set(4, 6, ms); g.rect(3, 7, 3, 1, ms);
    // slash, lower-left to upper-right, 1 px wide
    const d = rampOf(T.danger);
    for (let i = 0; i < 7; i++) g.set(1 + i, 7 - i, i < 1 || i > 5 ? d.sh : T.danger);
    return g;
  }
  const base = kind === 'self' || kind === 'selfIdle' ? T.self : T.talk;
  const R = rampOf(base);
  const hs = kind === 'selfIdle' ? [1, 1, 1] : WAVE[((step % 4) + 4) % 4].map((h) => h + 1);
  hs.forEach((h, i) => {
    const x = 2 + i * 2, y0 = 4 - Math.floor((h - 1) / 2);
    for (let j = 0; j < h; j++) g.set(x, y0 + j, kind === 'selfIdle' ? R.sh : j === h - 1 && h > 2 ? R.sh : base);
  });
  return g;
}
/** Drawing index of the talk glyph at t (s): v2 PULSE_MS 900 / 4 → 225 ms per step = 7 grid frames (4.3 fps). */
export const talkStep = (t) => Math.floor(Math.max(0, t) * 30 / 7 + 1e-6) % 4;

/**
 * Ground voice ripple (tier Ag; new): 3 drawings expanding from the feet, for renderers without the outline pass.
 * r2: wide enough to clear a body at vh 12 (outer rx 14 → 22 ≈ body width + 6) and only the FRONT ~60 % of each
 * ellipse is drawn (beside + below the feet, where the ground is visible), 3-tone + a dark own-colour line so it holds
 * on noon cobbles. 47x20, feet anchor (23, 8) (ellipse centre 1 px below the feet).
 */
export const TALK_RING_W = 47, TALK_RING_H = 20;
export function talkRing(k, kind, T) {
  const c = kind === 'self' ? T.self : T.talk, R = rampOf(c);
  const img = new PixelImage(TALK_RING_W, TALK_RING_H);
  const cx = 23.5, cy = 9.5, rx = [14, 18, 22][k], ry = [5, 6.5, 8][k];
  annulus(img, cx, cy, rx, ry, c, { tx: 2, ty: 1, keep: (x, y) => y + 0.5 >= cy - ry * 0.3 });
  const line = kind === 'self' ? talkLineOf('self', T) : talkLineOf('talk', T);
  return k === 2 ? shade(recolor(img, c, R.sh), { mid: R.sh, line }) : shade(img, { hi: R.hi, mid: c, sh: R.sh, line });
}
/** Replace one colour (exact) with another. */
export function recolor(img, from, to) {
  const F = rgba(from);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const v = img.get(x, y);
    if (v[3] && v[0] === F[0] && v[1] === F[1] && v[2] === F[2]) img.set(x, y, to);
  }
  return img;
}
/**
 * Dark under-line of the talking cues (r2): the pale talk gold (#FFE7A3) vanished on noon cobbles at 1x, like the
 * markers' gold ring (UI.md §6), so the silhouette outline gets a second ring 1 texel further out in this colour:
 * talk → goldLine (token), self → ramp(danger).line (a dark rose, never black).
 */
export const talkLineOf = (kind, T) => (kind === 'self' ? rampOf(T.danger).line : T.goldLine);

// ------------------------------------------------------------------------------------------------ speech bubbles
/** v2 bubbleText: whitespace collapsed, controls stripped, cut at maxChars with '…'. */
export function bubbleText(raw, maxChars = SPEECH.maxChars) {
  // eslint-disable-next-line no-control-regex
  const t = String(raw).replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim();
  const ch = Array.from(t);
  return ch.length <= maxChars ? t : ch.slice(0, maxChars - 1).join('').trimEnd() + '…';
}
/** v2 wrapLines in pixels: greedy word wrap to BUBBLE_TEXT_W; over-long words are broken; > maxLines ends in '…'. */
export function bubbleLines(raw, maxW = BUBBLE_TEXT_W, maxLines = SPEECH.maxLines) {
  const text = bubbleText(raw);
  const lines = [];
  let cur = '';
  for (let word of text.split(' ')) {
    while (textWidth(word) > maxW) {                     // break an over-long word onto lines of its own
      if (cur) { lines.push(cur); cur = ''; }
      let k = word.length;
      while (k > 1 && textWidth(word.slice(0, k)) > maxW) k--;
      lines.push(word.slice(0, k)); word = word.slice(k);
    }
    if (!word) continue;
    if (!cur) cur = word;
    else if (textWidth(cur + ' ' + word) <= maxW) cur += ' ' + word;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && textWidth(last + '…') > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = last.trimEnd() + '…';
    return kept;
  }
  return lines;
}
/** v2 bubbleDurationMs. */
export const bubbleDurationMs = (text) => Math.max(SPEECH.minMs, Math.min(SPEECH.maxMs, SPEECH.minMs + Array.from(bubbleText(text)).length * SPEECH.perCharMs));
/** Box size (w, h) excluding the tail (2 rows) and the drop shadow (1 row). */
export function bubbleSize(lines) {
  return { w: Math.max(...lines.map((l) => textWidth(l))) + 10, h: lines.length * 9 + 5 };
}
export const BUBBLE_TAIL_H = 2;
/**
 * Bubble image: kit 'bubble' frame (outline line, brass edge, ink fill, hi row, notched corners, 1-px shadow) + a
 * stepped 2-row tail pointing down at tailX (box-local; null = no tail, v2: a bubble lifted above another loses it).
 * Image size: (w + 1) x (h + 3); text cap tops at y 3 + 9 i, centred.
 */
export function bubble(lines, tailX, T) {
  const { w, h } = bubbleSize(lines);
  const img = new PixelImage(w + 1, h + BUBBLE_TAIL_H + 1);
  drawBox(img, 0, 0, w, h, 'bubble', T);
  if (tailX !== null && tailX !== undefined) {
    const tx = Math.max(4, Math.min(w - 4, tailX | 0));
    // open the bottom edge + line rows, then two stepped rows down to a 2-px point (v2 drawBox tail, 1-px outline)
    img.rect(tx - 2, h - 2, 4, 1, T.bubble);
    img.set(tx - 3, h - 1, T.bubbleEdge); img.rect(tx - 2, h - 1, 4, 1, T.bubble); img.set(tx + 2, h - 1, T.bubbleEdge);
    img.set(tx - 3, h, T.outline); img.set(tx - 2, h, T.bubbleEdge); img.rect(tx - 1, h, 2, 1, T.bubble); img.set(tx + 1, h, T.bubbleEdge); img.set(tx + 2, h, T.outline);
    img.set(tx - 2, h + 1, T.outline); img.rect(tx - 1, h + 1, 2, 1, T.bubbleEdge); img.set(tx + 1, h + 1, T.outline);
    img.rect(tx - 1, h + 2, 2, 1, T.outline);
    img.set(tx + 2, h + 1, T.shadow);   // drop shadow continues under the tail's right side
    img.set(tx + 3, h, T.shadow);
  }
  lines.forEach((l, i) => drawText(img, Math.floor(w / 2), 3 + i * 9, l, { color: T.text, align: 'center' }));
  return img;
}
/**
 * "Pop" drawing (first 2 grid frames of a new bubble). r2: no longer an empty slab (it flashed hard): the SAME text
 * in a box one step smaller (2 px in at each side, 1 px lower top), short tail in place, so the pop reads as the
 * bubble settling, not a blank card.
 */
export function bubblePop(lines, tailX, T) {
  const { w, h } = bubbleSize(lines);
  const img = new PixelImage(w + 1, h + BUBBLE_TAIL_H + 1);
  drawBox(img, 2, 1, w - 4, h - 1, 'bubble', T);
  if (tailX !== null && tailX !== undefined) {
    const tx = Math.max(5, Math.min(w - 5, tailX | 0));
    img.rect(tx - 1, h - 2, 2, 1, T.bubble);
    img.set(tx - 2, h - 1, T.bubbleEdge); img.rect(tx - 1, h - 1, 2, 1, T.bubble); img.set(tx + 1, h - 1, T.bubbleEdge);
    img.set(tx - 2, h, T.outline); img.rect(tx - 1, h, 2, 1, T.bubbleEdge); img.set(tx + 1, h, T.outline);
    img.rect(tx - 1, h + 1, 2, 1, T.outline);
  }
  lines.forEach((l, i) => drawText(img, Math.floor(w / 2), 3 + i * 9, l, { color: T.text, align: 'center' }));
  return img;
}
/**
 * Connector from a LIFTED bubble down to its speaker (r2: v2 dropped the tail when stacking and attribution got
 * ambiguous): a 1-px dotted bubbleEdge line, each dot with an outline pixel to its right (holds on light cobbles).
 * Drawn into img at column x from y0 (top) to y1 (bottom, inclusive); dots on even rows of the absolute grid.
 */
export function bubbleConnector(img, x, y0, y1, T) {
  for (let y = y0; y <= y1; y++) if (((y % 2) + 2) % 2 === 0) { img.set(x, y, T.bubbleEdge); img.set(x + 1, y, T.outline); }
  return img;
}
/** 9-slice source of the bubble body (bake): 12x12 incl. shadow, insets l/t/r 3, b 4 (docs/UI.md §2.5). */
export function bubbleNine(T) { const img = new PixelImage(12, 13); drawBox(img, 0, 0, 12, 12, 'bubble', T); return img; }
/** Tail piece (bake): 6x4, its top row overlaps the box's 2 bottom rows; tip at x 2..3. */
export function bubbleTail(T) {
  const img = new PixelImage(7, 5);
  img.rect(1, 0, 4, 1, T.bubble);
  img.set(0, 1, T.bubbleEdge); img.rect(1, 1, 4, 1, T.bubble); img.set(5, 1, T.bubbleEdge);
  img.set(0, 2, T.outline); img.set(1, 2, T.bubbleEdge); img.rect(2, 2, 2, 1, T.bubble); img.set(4, 2, T.bubbleEdge); img.set(5, 2, T.outline); img.set(6, 2, T.shadow);
  img.set(1, 3, T.outline); img.rect(2, 3, 2, 1, T.bubbleEdge); img.set(4, 3, T.outline); img.set(5, 3, T.shadow);
  img.rect(2, 4, 2, 1, T.outline);
  return img;
}
/**
 * v2 stackBubbles: boxes oldest first {x (centre), y (bottom), w, h} → sets .lift so no newer bubble overlaps an older
 * one (gap px). Verbatim port (pixel units).
 */
export function stackBubbles(boxes, gap = 2, maxLift = 120) {
  const n = boxes.length;
  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    b.lift = 0;
    for (let pass = 0; pass < n; pass++) {
      let moved = false;
      for (let j = 0; j < i; j++) {
        const o = boxes[j];
        if (Math.abs(b.x - o.x) * 2 >= b.w + o.w + gap * 2) continue;
        const bTop = b.y - b.lift - b.h, bBot = b.y - b.lift, oTop = o.y - o.lift - o.h, oBot = o.y - o.lift;
        if (bBot <= oTop - gap || bTop >= oBot + gap) continue;
        b.lift = Math.min(maxLift, b.y - (oTop - gap));
        moved = true;
      }
      if (!moved || b.lift >= maxLift) break;
    }
  }
  return boxes;
}

// ------------------------------------------------------------------------------------------------ "you are here"
/** Gold chevron (7x4 + outline = 9x6) pointing down at your name; k = bob drawing (the caller offsets 1 px). */
export function youChevron(T) {
  const img = bits(['#######', '.#####.', '..###..', '...#...'], T.gold);
  for (let x = 0; x < 7; x++) img.set(x, 0, T.goldHi);
  img.set(3, 3, T.goldSh); img.set(2, 2, T.gold); img.set(4, 2, T.goldSh); img.set(5, 1, T.goldSh);
  const o = new PixelImage(9, 6); o.blit(img, 1, 1); o.outline(T.goldLine);
  return o;
}
/** Own-seat marker (v2 gameplay markers: gold "You" + chevron), bob 1 px at 2 fps (k 0/1). */
export function youSeat(k, T) {
  const tw = textWidth('You');
  const img = new PixelImage(Math.max(tw + 2, 9), 18);
  drawText(img, Math.floor(img.w / 2), 1, 'You', { color: T.gold, outline: T.labelLine, align: 'center' });
  img.blit(youChevron(T), Math.floor(img.w / 2) - 4, 11 + (k ? 1 : 0));
  return img;
}
/**
 * "You are here" ground ring (tier Ag, under your feet): 4 gold arcs (a broken ring: reads as a locator, not a seat
 * stone) with a goldLine contour, pulsing 2 sizes; k = drawing 0..3 (sizes 0,1,1,0 → hold 12 grid frames = v2's
 * sin(t·4) own-spot pulse, period 1.6 s).
 */
export function youRing(k, T) {
  const big = k === 1 || k === 2 ? 1 : 0;
  const img = new PixelImage(33, 17);
  const rx = 13 + big, ry = 6 + big * 0.5;
  // 4 arcs around the diagonals (gaps at the cardinal points: a bracket-like locator, not a seat stone)
  annulus(img, 16.5, 8.5, rx, ry, T.gold, { keep: (x, y) => Math.abs(x + 0.5 - 16.5) / rx >= 0.3 && Math.abs(y + 0.5 - 8.5) / ry >= 0.4 });
  return shade(img, { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine });
}

// ------------------------------------------------------------------------------------------------ guidance arrow (Ag)
/**
 * Ground arrow toward your home door / your seat (v2 gameplay hints `arrow`): drawn ON the ground, i.e. foreshortened
 * like a decal at the 30° camera pitch (screen y = ground depth × sin 30°). dir16 = ground heading, 0 = screen-right,
 * clockwise in 22.5° steps (4 = toward the camera). 15x15 frame, centre (7, 7). Gold 3-tone + goldLine.
 */
// r2: the r1 arrow was a rotated + foreshortened polygon in 16 headings → mushy 10x6 blobs. Now 3 hand-authored
// bitmaps (screen right, down, down-right; drawn flat like a ground decal: the down arrow is foreshortened) with a
// 2-px shaft and a clear stepped head, the other 5 headings by exact flips, shaded AFTER the flip (upper-left light
// on every heading), goldLine ring. right/left 15x10, down/up 12x11, diagonals 14x14 (incl. the line).
const GUIDE_R = [
  '.......#.....',
  '.......###...',
  '.......####..',
  '#############',
  '#############',
  '.......####..',
  '.......###...',
  '.......#.....'];
const GUIDE_D = [
  '....##....',
  '....##....',
  '....##....',
  '....##....',
  '##########',
  '.########.',
  '..######..',
  '...####...',
  '....##....'];
const GUIDE_DR = (() => {
  const rows = [];
  for (let y = 0; y < 12; y++) {
    let r = '';
    for (let x = 0; x < 12; x++) r += (x + y >= 15) || ((x === y || x === y + 1) && x + y < 16) ? '#' : '.';
    rows.push(r);
  }
  return rows;
})();
let _guide8 = null;
/** Ground guidance arrow, screen heading dir8 (DIR8 order). Anchor = image centre. */
export function guideArrow(dir8, T) {
  if (!_guide8) {
    const R = bits(GUIDE_R, '#ffffff'), D = bits(GUIDE_D, '#ffffff'), DR = bits(GUIDE_DR, '#ffffff');
    _guide8 = [R, DR, D, flip(DR, true, false), flip(R, true, false), flip(DR, true, true), flip(D, false, true), flip(DR, false, true)];
  }
  const src = _guide8[((dir8 % 8) + 8) % 8];
  const img = new PixelImage(src.w + 2, src.h + 2);
  img.blit(src, 1, 1, { tint: T.gold });
  return shade(img, { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine });
}
/** Marching trail dot (2x2 + goldLine = 4x4); lit = the dot the march is on (goldHi). */
export function guideDot(lit, T) {
  const img = new PixelImage(4, 4);
  img.rect(1, 1, 2, 2, lit ? T.goldHi : T.gold);
  if (!lit) { img.set(1, 1, T.goldHi); img.set(2, 2, T.goldSh); }
  img.outline(T.goldLine);
  return img;
}

/** Bedtime door marker (tier Ag, at the door): a gold ellipse ring, 2 pulse sizes (k 0..3: 0,1,1,0). */
export function doorRing(k, T) {
  const big = k === 1 || k === 2 ? 1 : 0;
  const img = new PixelImage(31, 15);
  annulus(img, 15.5, 7.5, 12 + 2 * big, 5.5 + big, T.gold);
  return shade(img, { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine });
}
/** Bobbing chevron over the door (tier A): bigger than youChevron (9x5 + outline). */
export function doorChevron(T) {
  const img = bits(['#########', '.#######.', '..#####..', '...###...', '....#....'], T.gold);
  for (let x = 0; x < 9; x++) img.set(x, 0, T.goldHi);
  img.set(4, 4, T.goldSh); img.set(5, 3, T.goldSh); img.set(6, 2, T.goldSh); img.set(7, 1, T.goldSh);
  const o = new PixelImage(11, 7); o.blit(img, 1, 1); o.outline(T.goldLine);
  return o;
}

// ------------------------------------------------------------------------------------------------ compass (S)
const ARROW_R = ['....#..', '.....#.', '#######', '.....#.', '....#..'];
const ARROW_DR = ['#......', '.#.....', '..#..#.', '...#.#.', '....##.', '..####.', '.......'];
let _arrows8 = null;
/** 7x7 arrow glyphs in 8 directions (DIR8 order), colour placeholder #fff (tinted by the caller). */
export function arrows8() {
  if (_arrows8) return _arrows8;
  const r = new PixelImage(7, 7); r.blit(bits(ARROW_R, '#ffffff'), 0, 1);
  _arrows8 = eightWay(r, bits(ARROW_DR, '#ffffff'));
  return _arrows8;
}
/** 15x15 compass disc: inkSunk well, gold ring + goldLine, arrow toward home (DIR8 index). */
export function compassDisc(dir8, T) {
  const img = new PixelImage(15, 15);
  img.disc(7.5, 7.5, 7, T.goldLine);
  img.disc(7.5, 7.5, 6, T.gold);
  img.disc(7.5, 7.5, 5, T.inkSunk);
  img.set(4, 2, T.goldHi); img.set(3, 3, T.goldHi); img.set(2, 4, T.goldHi);   // ring lit upper-left
  img.set(10, 12, T.goldSh); img.set(11, 11, T.goldSh); img.set(12, 10, T.goldSh);
  img.blit(arrows8()[dir8], 4, 4, { tint: T.goldHi });
  return img;
}
/** Home compass pill (v2 .ct-compass: arrow disc + "Your home · 22 steps"), drawn into a screen image. */
export function compassPill(img, x, y, w, { steps, dir8, title = 'Your home' }, T) {
  const h = 15;
  drawBox(img, x, y, w, h, 'chipGold', T);
  img.blit(compassDisc(dir8, T), x, y);
  const tx = x + 18;
  drawText(img, tx, y + 4, title, { color: T.text });
  const sx = tx + textWidth(title) + 3;
  drawText(img, sx, y + 4, '·', { color: T.textDim });
  drawText(img, sx + 4, y + 5, `${steps} STEPS`, { font: 'tiny', color: T.textDim });
  return { x, y, w, h };
}

// ------------------------------------------------------------------------------------------------ house-name callouts
/**
 * Owner name over a door (v2 houseNames: your home gold, a dead owner pale blue, others parchment, dimmer at night):
 * an ink band with a 1-px line, notched corners, 1 hi row, and a 3-row stepped tail down at the door.
 * style: 'player' | 'mine' | 'ghost'. Returns the image; anchor = (tailX, h - 1) (tail tip).
 */
export function callout(name, style, T) {
  const s = fitName(name, 64);
  const tw = textWidth(s), w = tw + 8, h = 12;
  const img = new PixelImage(w + 1, h + 3);
  drawBox(img, 0, 0, w, h - 1, { line: 'outline', edge: style === 'mine' ? 'goldSh' : 'iron', fill: 'ink', hi: 'inkRaised', sh: null, corner: 1, shadow: true }, T);
  const color = style === 'mine' ? T.gold : style === 'ghost' ? T.ghost : T.text;
  drawText(img, Math.floor(w / 2), 2, s, { color, align: 'center' });
  const tx = Math.floor(w / 2);
  const edge = style === 'mine' ? T.goldSh : T.iron;
  img.rect(tx - 1, h - 3, 2, 2, T.ink);
  img.set(tx - 2, h - 2, edge); img.set(tx + 1, h - 2, edge);
  img.set(tx - 2, h - 1, T.outline); img.rect(tx - 1, h - 1, 2, 1, edge); img.set(tx + 1, h - 1, T.outline); img.set(tx + 2, h - 1, T.shadow);
  img.rect(tx - 1, h, 2, 1, T.outline); img.set(tx + 1, h, T.shadow);
  return img;
}

// ------------------------------------------------------------------------------------------------ door tokens
/** Ghost recolour of an icon: luminance → ghost ramp (hi / ghost / ghostSh / line), identity kept by value. */
export function ghostIcon(icon, T, { stretch = false } = {}) {
  const R = { hi: rampOf(T.ghost).hi, mid: T.ghost, sh: T.ghostSh, line: rampOf(T.ghostSh).line };
  const o = new PixelImage(icon.w, icon.h);
  const lum = (v) => 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2];
  // stretch (r2, door tokens): an already-pale ghost bust's luminance range is spread over the 4 ghost tones, so its
  // eyes / mouth survive at 12 px instead of a blank pale disc
  let lo = 0, hi = 255;
  if (stretch) {
    lo = 255; hi = 0;
    for (let y = 0; y < icon.h; y++) for (let x = 0; x < icon.w; x++) { const v = icon.get(x, y); if (v[3]) { lo = Math.min(lo, lum(v)); hi = Math.max(hi, lum(v)); } }
    if (hi - lo < 1) { lo = 0; hi = 255; }
  }
  for (let y = 0; y < icon.h; y++) for (let x = 0; x < icon.w; x++) {
    const v = icon.get(x, y);
    if (!v[3]) continue;
    const l = ((lum(v) - lo) / (hi - lo)) * 255;
    o.set(x, y, l > 190 ? R.hi : l > 120 ? R.mid : l > 60 ? R.sh : R.line);
  }
  return o;
}
/** Fallback 12x12 icon when no portrait atlas is loaded: parchment disc + the initial. */
export function initialIcon(name, T) {
  const img = new PixelImage(12, 12);
  img.disc(6, 6, 6, T.parchment);
  img.disc(5, 5, 4, T.parchmentHi); img.disc(6, 6, 4, T.parchment);
  drawText(img, 6, 3, (String(name)[0] || '?').toUpperCase(), { color: T.textInk, align: 'center' });
  return img;
}
/**
 * Occupant token (v2 boardTokens: round token, ghost = pale blue spirit): 12x12 icon in a 1-px ring + line = 16x16,
 * a gold pin head on top (it is pinned to the door board). icon = PixelImage 12x12 (or null → initial of name).
 */
export function token(icon, ghost, T, name = '?', ghostReady = false) {
  const img = new PixelImage(16, 17);
  const ringC = ghost ? T.ghostSh : T.parchmentSh, lineC = ghost ? rampOf(T.ghostSh).line : T.parchmentLine;
  img.disc(8, 9, 7, lineC);
  img.disc(8, 9, 6, ringC);
  img.disc(8, 9, 5, ghost ? rampOf(T.ghost).sh : T.inkSunk);
  let ic = icon || initialIcon(name, T);
  if (ghost) ic = ghostIcon(ic, T, { stretch: ghostReady });
  // the icon inside the ring: clip to r 5 (10 px live disc)
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const v = ic.get(x, y);
    if (!v[3]) continue;
    const dx = x + 2 + 0.5 - 8, dy = y + 3 + 0.5 - 9;
    if (dx * dx + dy * dy <= 25) img.set(x + 2, y + 3, v);
  }
  // r2: a ghost icon with no readable features (< 5 % of the live disc's texels differ from the mean luminance by
  // > 35: a pale ghost bust with 1-2 stray dark texels) gets a dimmed initial in the ghost line colour, so the token
  // is never a blank pale disc
  if (ghost) {
    const ls = [];
    for (let y = 3; y < 15; y++) for (let x = 2; x < 14; x++) {
      const dx = x + 0.5 - 8, dy = y + 0.5 - 9; if (dx * dx + dy * dy > 25) continue;
      const v = img.get(x, y); if (!v[3]) continue;
      ls.push(0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2]);
    }
    const mean = ls.reduce((a, b) => a + b, 0) / Math.max(1, ls.length);
    const feat = ls.filter((l) => Math.abs(l - mean) > 35).length / Math.max(1, ls.length);
    if (feat < 0.05) drawText(img, 8, 6, (String(name)[0] || '?').toUpperCase(), { color: rampOf(T.ghostSh).line, align: 'center' });
  }
  // pin head (2x2 + line) at the top
  img.rect(7, 0, 2, 2, T.gold); img.set(7, 0, T.goldHi); img.set(8, 1, T.goldSh);
  img.set(6, 0, T.goldLine); img.set(9, 0, T.goldLine); img.set(6, 1, T.goldLine); img.set(9, 1, T.goldLine);
  return img;
}
/** "+N" overflow badge (v2 overflowText, capped +99): tiny font on an ink chip. */
export function tokenPlus(n, T) {
  const s = n > 99 ? '+99' : `+${Math.max(0, Math.floor(n))}`;
  const w = textWidth(s, 'tiny') + 6;
  const img = new PixelImage(w + 1, 11);
  drawBox(img, 0, 0, w, 10, { line: 'outline', edge: 'parchmentSh', fill: 'ink', hi: null, sh: null, corner: 1, shadow: true }, T);
  drawText(img, 3, 3, s, { font: 'tiny', color: T.parchment });
  return img;
}
/** v2 tokenGrid in px: 1–2 in a row, 3–4 as 2 + 1|2 rows; t = token size, gap 1. Returns slot offsets from the centre. */
export function tokenGrid(n, t = 16, gap = 1) {
  const count = Math.max(0, Math.min(4, n | 0));
  const cols = count <= 1 ? count : 2, rows = count === 0 ? 0 : count <= 2 ? 1 : 2;
  const w = cols ? cols * t + (cols - 1) * gap : 0, h = rows ? rows * t + (rows - 1) * gap : 0;
  const slots = [];
  for (let i = 0; i < count; i++) {
    const row = i < 2 ? 0 : 1, inRow = row === 0 ? Math.min(2, count) : count - 2, col = row === 0 ? i : i - 2;
    const rowW = inRow * t + (inRow - 1) * gap;
    slots.push({ dx: Math.round(-rowW / 2 + col * (t + gap)), dy: Math.round(-h / 2 + row * (t + gap)) });
  }
  return { slots, w, h };
}

// ------------------------------------------------------------------------------------------------ offscreen arrows (S)
/**
 * r2: the pointer is ATTACHED to the disc as a tail (like the bubble tail), not a speck floating 1-2 px off it: a gold
 * wedge whose base sits under the disc ring and whose tip reaches EDGE_TAIL (7) px past the disc edge, 3-tone + goldLine, then the
 * disc drawn over its base. Returns {img, pad}: img = disc padded by `pad` px on every side (disc centre = img centre).
 */
export const EDGE_TAIL = 7;
export function edgeDiscPointer(disc, dir8, T) {
  const pad = EDGE_TAIL + 2, S = disc.w + 2 * pad, c = S / 2, r = disc.w / 2;
  const img = new PixelImage(S, S);
  const a = (dir8 * Math.PI) / 4, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
  const tip = r + EDGE_TAIL, base = r - 2, hw = 6;
  poly(img, [[c + ux * tip, c + uy * tip], [c + ux * base + vx * hw, c + uy * base + vy * hw], [c + ux * base - vx * hw, c + uy * base - vy * hw]], T.gold);
  shade(img, { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine });
  // the disc over the wedge's base; its outline ring meets the tail's goldLine (shared edge, like the bubble tail)
  img.blit(disc, pad, pad);
  return { img, pad };
}
/** 7x7 gold pointer for the screen edge (DIR8 index), 3-tone + goldLine (9x9). */
export function edgeArrow(dir8, T) {
  const tri = new PixelImage(7, 7);
  // authored 'right' and 'down-right' wedges, derived exactly for the 8 directions
  const R = bits(['##.....', '####...', '######.', '#######', '######.', '####...', '##.....'], T.gold);
  const DR = bits(['.......', '.....#.', '....##.', '...###.', '..####.', '.#####.', '.......'], T.gold);
  const im = eightWay(R, DR)[dir8];
  tri.blit(im, 0, 0);
  const o = new PixelImage(9, 9); o.blit(tri, 1, 1);
  return shade(o, { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine });
}
/**
 * Portrait disc for an offscreen player: a 24x24 avatar (portraits group `avatar_<id>`, docs/UI.md §2.6 24x24 grid)
 * clipped to r 12 → 28x28 (ink well, iron / ghost ring, outline); a 12x12 icon → 18x18; none → the initial.
 * ghostReady = the icon is already the portraits group's ghost variant (no recolour).
 */
export function edgeDisc(icon, T, name = '?', ghost = false, ghostReady = false) {
  const big = icon && icon.w === 24, S = big ? 28 : 18, c = S / 2, n = big ? 24 : 12, o = (S - n) / 2;
  const img = new PixelImage(S, S);
  img.disc(c, c, c, T.outline);
  img.disc(c, c, c - 1, ghost ? T.ghostSh : T.iron);
  img.disc(c, c, c - 2, T.inkSunk);
  for (let k = 0; k < 3; k++) img.set(Math.round(c - 4 + k - c * 0.35), Math.round(c - 2 - k - c * 0.35), ghost ? T.ghost : T.ironHi);
  let ic = icon || initialIcon(name, T);
  if (ghost && !ghostReady) ic = ghostIcon(ic, T);
  const r2 = (c - 2) * (c - 2);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = ic.get(x, y);
    if (!v[3]) continue;
    const dx = x + o + 0.5 - c, dy = y + o + 0.5 - c;
    if (dx * dx + dy * dy <= r2) img.set(x + o, y + o, v);
  }
  return img;
}
