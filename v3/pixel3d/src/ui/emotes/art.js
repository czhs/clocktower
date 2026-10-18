// Emotes group art (owner: emotes; docs/UI.md §4 "emotes", inventory 9–12). Pure kit drawing, no three.js, deterministic.
//
//   import * as E from '../src/ui/emotes/art.js';
//   E.emotePoint(T)                       14x14 v2 'emote_point' (glove pointing up-right, gold cuff)
//   E.pinIcon(color)                      9x12 mini map pin (pie wedges, dock swatches, Pin button)
//   E.popFrame(kind, f, T)                in-world emote pop, f 0 = pop, 1 = full, 2..4 = dissolve (15 fps)
//   E.pieImage(T, opts)                   the radial pie (screen tier S): back disc, wedges, hub, icons
//   E.drawPie(img, cx, cy, T, opts)       pie + caption + press dot, with open / commit / cancel stepping
//   E.drawDock(img, x, y, T, opts)        the social dock panel (Point / Pin, 8 swatches, Clear my pins, key hints)
//   E.drawDockButton / drawArmed / drawHint / drawPinTip
//
// Language (docs/UI.md §2): 1 px = 1 texel, light from the upper left, every sprite outlined in its own line tone,
// binary alpha, stepped 30 Hz motion (pop = 1 smaller grid frame, disappear = 3-step Bayer dissolve at 15 fps).
import { PixelImage, PIN_RAMPS, PIN_COLORS, ramp, drawBox, drawText, textWidth, wrapText, dissolve, GRID_HZ, hex } from '../kit.js';

// ------------------------------------------------------------------------------------------------ constants (v2)
/** v2 apps/client/src/game/social/radial.ts PIE_RADIUS (CSS px) and radialLogic.ts DEAD_ZONE_PX. */
export const V2_PIE = { radius: { mouse: 84, touch: 104 }, dead: { mouse: 20, touch: 28 } };
/** Texel geometry at the x2 game scale (640x360 at 720p): R wedge outer radius, r0 wedge inner radius, dead zone. */
export const PIE = {
  mouse: { R: 36, r0: 12, dead: 10, rm: 25 },
  touch: { R: 46, r0: 16, dead: 14, rm: 32 },
};
export const TIMING = {
  RIGHT_HOLD_MS: 250, LONG_PRESS_MS: 450, PIE_STICKY_MS: 8000, RIGHT_DRAG_PX: 6,
  PIE_OPEN_FRAMES: 4,            // grid frames: 1 pop + 3 wedge steps (133 ms ~ v2 ctp-pop 130 ms)
  PIE_COMMIT_FRAMES: 8,          // 4 steps x 2 grid frames: others dissolve, chosen holds, chosen dissolves
  PIE_CANCEL_FRAMES: 6,          // 3-step dissolve at 15 fps
  DOCK_OPEN_FRAMES: 2,           // pop (1 px low, frame only) then final (~v2 cts-in 140 ms)
  DOCK_CLOSE_FRAMES: 6,
  EMOTE_POP_MS: 3500,            // = v2 EMOTE_POINT_MS (the pop rides the emote it announces)
  MAX_PINS_PER_MEMBER: 6,
};
export const PIN_LABEL = { gold: 'Gold', crimson: 'Crimson', violet: 'Violet', teal: 'Teal', green: 'Green', orange: 'Orange', white: 'White', black: 'Black' };

/** v2 radialLogic.pieItems: Point at 12 o'clock, 4 colours, [Remove at 6 o'clock], 4 colours. */
export function pieItems({ name = null, self = false, removable = null } = {}) {
  const who = name === null ? null : self ? 'yourself' : name;
  const items = [{ key: 'point', kind: 'point', label: who ? `Point at ${who}` : 'Point here' }];
  const pin = (c) => ({ key: `pin:${c}`, kind: 'pin', color: c, label: who ? `Pin ${who} · ${PIN_LABEL[c].toLowerCase()}` : `${PIN_LABEL[c]} pin here` });
  PIN_COLORS.slice(0, 4).forEach((c) => items.push(pin(c)));
  if (removable) items.push({ key: 'unpin', kind: 'unpin', label: removable.mine ? 'Remove my pin' : `Remove ${removable.byName}’s pin` });
  PIN_COLORS.slice(4).forEach((c) => items.push(pin(c)));
  return items;
}
/** v2 wedgeAngle: centre angle (rad, screen coords, 0 = right, +y down), wedge 0 at the top. */
export const wedgeAngle = (i, n) => -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);

/** Grid frame index of t (s), tolerant to capture times rounded to 1e-4 s (0.8333 - 0.8 must be frame 1, not 0). */
export const gridK = (t, per = 1) => Math.floor(t * GRID_HZ / per + 0.01);

// ------------------------------------------------------------------------------------------------ template shading
const cache = new Map();
const memo = (key, fn) => { let v = cache.get(key); if (!v) { v = fn(); cache.set(key, v); } return v; };
const tkey = (T) => T.ink + T.gold + T.bubble;

/**
 * Shade a character template (rows of chars, '.' empty) with materials {ch: {hi, mid, sh, line, by?: 'opaque'|'self',
 * flat?: colour}} lit from the upper left: a pixel whose up/left neighbour is "outside" gets hi, down/right gets sh,
 * both or neither: mid. 'outside' = transparent (by 'opaque') or another material (by 'self'). Then a 1-px 4-neighbour
 * outline in the line tone of the touching material (first material in `prefer` wins). pad = outline margin.
 */
function shade(rows, mats, { pad = 1, prefer = null, diag = false } = {}) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const at = (x, y) => (y >= 0 && y < h && x >= 0 && x < w ? rows[y][x] || '.' : '.');
  const img = new PixelImage(w + 2 * pad, h + 2 * pad);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = at(x, y);
    if (ch === '.') continue;
    const m = mats[ch];
    if (m.flat) { img.set(x + pad, y + pad, m.flat); continue; }
    const out = (xx, yy) => (m.by === 'self' ? at(xx, yy) !== ch : at(xx, yy) === '.');
    const lit = out(x, y - 1) || out(x - 1, y), dark = out(x, y + 1) || out(x + 1, y);
    img.set(x + pad, y + pad, lit && !dark ? m.hi : dark && !lit ? m.sh : m.mid);
  }
  const order = prefer || Object.keys(mats);
  const nb = diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const hits = [];
  for (let y = -pad; y < h + pad; y++) for (let x = -pad; x < w + pad; x++) {
    if (at(x, y) !== '.') continue;
    const touching = nb.map(([dx, dy]) => at(x + dx, y + dy)).filter((c) => c !== '.');
    if (!touching.length) continue;
    const ch = order.find((k) => touching.includes(k)) ?? touching[0];
    hits.push([x + pad, y + pad, mats[ch].line]);
  }
  for (const [x, y, c] of hits) img.set(x, y, c);
  return img;
}
const parchMat = (T) => ({ hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh, line: T.parchmentLine });
const goldMat = (T) => ({ hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine });

// ------------------------------------------------------------------------------------------------ icons
// Glove pointing up-right (v2 scripts/social/point.ts UPRIGHT silhouette, re-shaded): w glove, k curled-finger
// crease, c cuff. 12x12 + outline = the v2 14x14 'emote_point'.
const GLOVE12 = [
  '..........ww',
  '.........www',
  '........www.',
  '.......www..',
  '...wwwwww...',
  '..wwwwwwkk..',
  '.cwwwwwwwww.',
  'ccwwwwwwkk..',
  'cwwwwwwwww..',
  'ccwwwwwwk...',
  '.ccwwwwww...',
  '..ccwww.....',
];
// 7x7 + outline = 9x9 inline glyph (row 0 blank: the art is bottom-aligned on the 9x9 inline grid, UI.md 2.6)
const GLOVE7 = [   // pointing right: thumb on the fist, a 1-row index finger, two curled fingers split by flat creases (k)
  '.ww....',
  'cwwwwww',
  'cwkkk..',
  'cwwww..',
  'cwkkk..',
  'cwwww..',
  '.www...',
];
// 9x9 + outline = 11x11 pop glyph: a 2-row index finger (lit top row / shaded bottom row) 4 px past the fist, the thumb
// over it, two curled-finger creases and a 1-column gold cuff (critic r1: the 7-px glove read as a mitten in the pop).
const GLOVE9 = [   // r3: the classic pointing hand - thumb over the fist, a 2-row finger 4 px past it, curled fingers split by creases
  '.www.....',
  'cwwwwwwww',
  'cwwwwwwww',
  'cwkkkk...',
  'cwwwww...',
  'cwkkkk...',
  'cwwwww...',
  'cwwww....',
  '.www.....',
];
function glove(rows, T) {
  const P = parchMat(T), G = goldMat(T);
  return shade(rows, { w: P, k: { flat: T.parchmentSh, line: T.parchmentLine }, c: G }, { prefer: ['w', 'c', 'k'] });
}
/** v2 'emote_point' (14x14): the palette / pie Point icon. */
export const emotePoint = (T) => memo('ep' + tkey(T), () => glove(GLOVE12, T));
/** 9x9 Point glyph (inline next to text, emote pop). */
export const emotePointSmall = (T) => memo('eps' + tkey(T), () => glove(GLOVE7, T));
/** 11x11 Point glyph for the in-world emote pop. */
export const emotePointPop = (T) => memo('epp' + tkey(T), () => glove(GLOVE9, T));

// Mini map pin (teardrop head + cream icon disc like the v2 18x26 pins), 7x10 + outline = 9x12. Tip = (4, 11).
const PIN7 = [
  '..###..',
  '.#####.',
  '##ooo##',
  '##ooo##',
  '##ooo##',
  '.#####.',
  '.#####.',
  '..###..',
  '..###..',
  '...#...',
];
const PIN5 = [   // 5x7 + outline = 7x9 (pop glyph)
  '.###.',
  '##o##',
  '#ooo#',
  '##o##',
  '.###.',
  '..#..',
  '..#..',
];
function pinOf(rows, color, T) {
  const R = PIN_RAMPS[color];
  const disc = color === 'white' ? { hi: T.parchmentHi, mid: T.parchmentHi, sh: T.parchment, line: R.line, by: 'self' } : { ...parchMat(T), line: R.line, by: 'self' };
  // black (r3, critic r2): a SOLID dark body (black hi tone) in the dark UI outline, lit rim iron-hi on the upper left:
  // a light outline around a dark body read as a hollow / disabled pin next to the grey disabled wedges.
  // UI integration r2 (whole-screen critic): that body (#5A5168) on ink (#2B2536) still vanished in the pie and the dock
  // at 1x. Now a darker body (black mid / sh) inside an IRON line (lighter than every ink token, darker than the
  // body's lit ironHi rim): the pin reads as a dark pin with a metal rim, not a hollow light ring.
  const body = color === 'black' ? { hi: T.ironHi, mid: R.mid, sh: R.sh, line: T.iron } : { hi: R.hi, mid: R.mid, sh: R.sh, line: R.line };
  const img = shade(rows, { '#': body, o: disc }, { prefer: ['#'] });
  return img;
}
export const pinIcon = (color, T) => memo('pin' + color + tkey(T), () => pinOf(PIN7, color, T));
export const pinIconSmall = (color, T) => memo('pins' + color + tkey(T), () => pinOf(PIN5, color, T));

/** Remove wedge glyph (9x9): a danger-red cross, own ramp. */
export const removeIcon = (T) => memo('rm' + tkey(T), () => {
  const D = ramp(T.danger);
  return shade(['x...x', 'xx.xx', '.xxx.', 'xx.xx', 'x...x'], { x: { hi: D.hi, mid: D.mid, sh: D.sh, line: D.line } }, { pad: 2 })
    .crop(0, 0, 9, 9);
});
/** Clear-my-pins glyph (9x9): a small pin with a cross badge. */
export const clearIcon = (T) => memo('clr' + tkey(T), () => {
  const img = new PixelImage(9, 9);
  img.blit(pinIconSmall('crimson', T), 0, 0);
  const x = removeIcon(T).crop(2, 2, 5, 5);
  const b = new PixelImage(9, 9); b.blit(x, 4, 4);
  img.blit(b, 0, 0);
  return img;
});
/** '!' and '?' pop glyphs (gold alert, parchment question), 7x9 incl. outline. */
export const alertIcon = (T) => memo('al' + tkey(T), () => shade(['##', '##', '##', '##', '..', '##', '##'], { '#': goldMat(T) }));
export const questionIcon = (T) => memo('qu' + tkey(T), () => shade(['.###.', '##.##', '...##', '..##.', '..#..', '.....', '..#..'], { '#': parchMat(T) }));

// ------------------------------------------------------------------------------------------------ in-world emote pop
// A rounded speech bubble (bubble tokens: outline / bubbleEdge / bubble / bubbleHi, light from the upper left, 2-px
// rounded corners) holding an 11x12 glyph, with a 3-row tail; tip = anchor. Frames: 0 = pop (smaller bubble, no glyph),
// 1 = full, 2..4 = Bayer dissolve 25 / 50 / 75 % (15 fps). Canvas 15x20 for every frame so the anchor never moves.
// r2 (critic r1): glyphs grew from 7-9 px to the 11x11 glove / the 9x12 map pin with its cream disc, and the pin pop is
// tinted per pin colour (emote_pop_pin_<color>_<f>), so the pop says which pin was dropped.
export const POP = { w: 15, h: 20, anchor: { x: 7, y: 18 }, kinds: ['point', 'pin', 'alert', 'question'] };
function bubble(T, bw, bh) {
  const img = new PixelImage(POP.w, POP.h);
  const x0 = Math.floor((POP.w - bw) / 2), y0 = POP.anchor.y - 2 - bh;   // box bottom row = y0 + bh - 1; tail 3 rows below it
  const S = { line: 'outline', edge: 'bubbleEdge', fill: 'bubble', hi: 'bubbleHi', sh: null, corner: 2, shadow: false };
  drawBox(img, x0, y0, bw, bh, S, T);
  const cx = POP.anchor.x, b = y0 + bh - 1;
  // open the keyline + outline under the tail, then the tail itself (fill / edge), then re-outline
  img.rect(cx - 1, b - 1, 3, 1, T.bubble); img.rect(cx - 1, b, 3, 1, T.bubble);
  img.set(cx - 2, b, T.bubbleEdge); img.set(cx + 2, b, T.bubbleEdge);
  img.set(cx - 1, b + 1, T.bubbleEdge); img.set(cx, b + 1, T.bubble); img.set(cx + 1, b + 1, T.bubbleEdge);
  img.set(cx, b + 2, T.bubbleEdge);
  img.outline(T.outline);
  // 1-px solid drop shadow (no blur): under every bottom-facing opaque pixel
  const sh = [];
  for (let y = 1; y < img.h; y++) for (let x = 0; x < img.w; x++) if (!img.alpha(x, y) && img.alpha(x, y - 1)) sh.push([x, y]);
  for (const [x, y] of sh) img.set(x, y, T.shadow);
  return { img, x0, y0 };
}
export function popGlyph(kind, T, color = 'gold') {
  return kind === 'point' ? emotePointPop(T) : kind === 'pin' ? pinIcon(color, T) : kind === 'alert' ? alertIcon(T) : questionIcon(T);
}
/** Pop frame f of kind (color = the dropped pin's colour for kind 'pin'). */
export function popFrame(kind, f, T, color = 'gold') {
  return memo(`pop${kind}${kind === 'pin' ? color : ''}${f}` + tkey(T), () => {
    if (f === 0) return bubble(T, 11, 12).img;
    const { img, x0, y0 } = bubble(T, 15, 16);
    const g = popGlyph(kind, T, color);
    img.blit(g, x0 + 2 + Math.floor((11 - g.w) / 2), y0 + 2 + Math.floor((12 - g.h) / 2));
    if (f >= 2) dissolve(img, [0.25, 0.5, 0.75][f - 2]);
    return img;
  });
}
/**
 * Pop frame index (or -1 = hidden) at time t for a pop shown at t0 (s): 1 grid frame of pop, hold until t0 + ms,
 * then 3 dissolve steps at 15 fps. bob = 1-px lift at 2 fps during the hold (0 under reduced motion).
 */
export function popState(t, t0, { ms = TIMING.EMOTE_POP_MS, reduced = false } = {}) {
  if (t < t0) return { f: -1, bob: 0 };
  const k = gridK(t - t0), hold = Math.round(ms / 1000 * GRID_HZ);
  if (k < hold) return { f: !reduced && k < 1 ? 0 : 1, bob: !reduced && k >= 1 && Math.floor((k - 1) / 15) % 2 === 1 ? 1 : 0 };
  if (reduced) return { f: -1, bob: 0 };
  const d = Math.floor((k - hold) / 2);
  return d < 3 ? { f: 2 + d, bob: 0 } : { f: -1, bob: 0 };
}

// ------------------------------------------------------------------------------------------------ pie menu
const PIE_FAN = (n) => {   // wedge reveal order: Point first, then fanning out both ways (0, 1, n-1, 2, n-2, ...)
  const o = [0];
  for (let k = 1; o.length < n; k++) { o.push(k); if (o.length < n) o.push(n - k); }
  return o;
};
function wedgeStyle(it, state, T) {
  if (state === 'off') return { edge: T.ironSh, fill: T.inkSunk, hi: T.inkSunk, sh: T.inkSunk };
  if (it.kind === 'unpin') {
    const D = ramp(T.danger);
    return state === 'hot' ? { edge: D.hi, fill: D.line, hi: D.sh, sh: D.line } : { edge: D.sh, fill: T.ink, hi: T.inkRaised, sh: D.line };
  }
  if (state === 'hot') {
    if (it.kind === 'pin') { const R = PIN_RAMPS[it.color]; return it.color === 'black' ? { edge: R.line, fill: R.sh, hi: R.mid, sh: R.sh } : { edge: R.hi, fill: R.line, hi: R.sh, sh: R.line }; }
    return { edge: T.goldHi, fill: T.goldLine, hi: T.goldSh, sh: T.goldLine };
  }
  return { edge: T.iron, fill: T.ink, hi: T.inkRaised, sh: T.inkSunk };
}
/**
 * The pie as one image (size 2*(R+3)+1, centre pixel c = R+3). opts: size 'mouse'|'touch', items (pieItems()),
 * hot (index|null), color (the current pin colour: marked by a small gold notch in its wedge), off (Set of disabled
 * indices), show (Set of wedge indices to draw; default all), back, hub (draw the back disc / hub), icons, idleHub
 * (dotted gold hub ring = waiting for a choice), phase (marching phase of the idle ring), shrink (px, pop frame).
 * backShow (Set): draw the back disc only behind these wedges' sectors (+ the hub well), so open / commit steps never
 * show a featureless near-black disc (critic r1); ring: the pop frame = a 2-px ring (outline + iron) + hub only.
 */
export function pieImage(T, { size = 'mouse', items = pieItems({ name: 'Bram' }), hot = null, color = null, off = null,
  show = null, back = true, hub = true, icons = true, idleHub = false, phase = 0, shrink = 0, backShow = null, ring = false } = {}) {
  const key = 'pie' + tkey(T) + JSON.stringify([size, items.map((i) => i.key), hot, color, off && [...off], show && [...show], back, hub, icons, idleHub, phase % 4, shrink, backShow && [...backShow], ring]);
  return memo(key, () => pieImage0(T, { size, items, hot, color, off, show, back, hub, icons, idleHub, phase, shrink, backShow, ring })).clone();
}
function pieImage0(T, { size, items, hot, color, off, show, back, hub, icons, idleHub, phase, shrink, backShow, ring }) {
  const G = PIE[size];
  const R = G.R - shrink, r0 = Math.max(4, G.r0 - Math.round(shrink / 2));
  const c = G.R + 3, S = 2 * c + 1;
  const img = new PixelImage(S, S + 1);
  const n = items.length, step = (2 * Math.PI) / n;
  const wedgeOf = (dx, dy, Rw) => {
    const d = Math.hypot(dx, dy);
    if (d < r0 || d > Rw) return -1;
    let rel = Math.atan2(dy, dx) + Math.PI / 2;
    rel = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const i = Math.round(rel / step) % n;
    const off = Math.abs(rel - Math.round(rel / step) * step);          // angle from the wedge centre
    if (d * Math.sin(Math.abs(step / 2 - off)) < 0.8) return -1;        // 1-2 px radial gap between wedges
    return i;
  };
  // UI integration r2 (whole-screen critic): the popped-out hot wedge (R + 2, re-outlined outside the back disc) read
  // as a straight-chord trapezoid poking 2-4 texels past the round rim. The hot wedge now stays inside the same annulus;
  // hot still reads without colour: lit edge (ramp hi), icon 1 px out + up, and the caption plate names it.
  const Rhot = R;
  const inW = (i, x, y) => { const dx = x - c, dy = y - c; return wedgeOf(dx, dy, i === hot ? Rhot : R) === i; };
  const edgeAt = (i, x, y) => inW(i, x, y) && (!inW(i, x + 1, y) || !inW(i, x - 1, y) || !inW(i, x, y + 1) || !inW(i, x, y - 1));
  // back disc + hub well + drop shadow
  const sectorOf = (dx, dy) => {   // wedge index of a direction (no gap, no radius test)
    let rel = Math.atan2(dy, dx) + Math.PI / 2;
    rel = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return Math.round(rel / step) % n;
  };
  if (back && ring) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d <= R + 2.5 && d > R + 0.5) img.set(x, y, T.outline);
      else if (d <= R + 0.5 && d > R - 0.5) img.set(x, y, d > R - 0.5 && (y - c) + (x - c) < -R * 0.5 ? T.ironHi : T.iron);
      else if (d <= R - 0.5 && d > R - 1.5) img.set(x, y, T.outline);
    }
  } else if (back) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d > R + 2.5) continue;
      if (backShow && (d > r0 - 1 ? !backShow.has(sectorOf(x - c, y - c)) : !hub)) continue;   // no hub: no well disc either
      img.set(x, y, T.outline);
    }
    for (let x = 0; x < S; x++) for (let y = S; y >= 1; y--) if (!img.alpha(x, y) && img.alpha(x, y - 1) && Math.hypot(x - c, y - 1 - c) > R) { img.set(x, y, T.shadow); break; }
  }
  // wedges
  const vis = show || new Set(items.map((_, i) => i));
  for (let i = 0; i < n; i++) {
    if (!vis.has(i)) continue;
    const st = off?.has(i) ? 'off' : i === hot ? 'hot' : 'normal';
    const W = wedgeStyle(items[i], st, T);
    const Rw = i === hot ? Rhot : R;
    for (let y = c - Rw - 1; y <= c + Rw + 1; y++) for (let x = c - Rw - 1; x <= c + Rw + 1; x++) {
      if (!inW(i, x, y)) continue;
      const edge = edgeAt(i, x, y);
      let col = W.fill;
      if (edge) col = W.edge;
      else {
        const ul = edgeAt(i, x, y - 1) || edgeAt(i, x - 1, y), dr = edgeAt(i, x, y + 1) || edgeAt(i, x + 1, y);
        if (ul && !dr) col = W.hi; else if (dr && !ul) col = W.sh;
      }
      img.set(x, y, col);
    }
    if (st === 'hot') {
      // re-outline the popped-out rim where it overhangs the back disc
      for (let y = c - Rhot - 2; y <= c + Rhot + 2; y++) for (let x = c - Rhot - 2; x <= c + Rhot + 2; x++) {
        if (inW(i, x, y) || Math.hypot(x - c, y - c) <= R + 2.5) continue;
        if (inW(i, x + 1, y) || inW(i, x - 1, y) || inW(i, x, y + 1) || inW(i, x, y - 1)) img.set(x, y, T.outline);
      }
    }
  }
  // hub: sunk well + ring (iron; dotted gold marching while idle / sticky)
  if (hub) {
    const rh = r0 - 3;
    for (let y = c - rh - 1; y <= c + rh + 1; y++) for (let x = c - rh - 1; x <= c + rh + 1; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d > rh + 0.5) continue;
      img.set(x, y, d > rh - 0.5 ? T.iron : T.inkSunk);
    }
    if (idleHub) {
      // dotted gold ring: 2 on / 2 off around the circle, marching 1 px per step
      const pts = [];
      for (let y = c - rh - 1; y <= c + rh + 1; y++) for (let x = c - rh - 1; x <= c + rh + 1; x++) {
        const d = Math.hypot(x - c, y - c);
        if (d <= rh + 0.5 && d > rh - 0.5) pts.push([x, y, Math.atan2(y - c, x - c)]);
      }
      pts.sort((a, b) => a[2] - b[2]);
      pts.forEach(([x, y], k) => { if (((k + phase) % 4 + 4) % 4 < 2) img.set(x, y, T.gold); });
    }
  }
  // icons (+ current-colour notch)
  if (icons) {
    for (let i = 0; i < n; i++) {
      if (!vis.has(i)) continue;
      const it = items[i], a = wedgeAngle(i, n), isHot = i === hot;
      const rm = G.rm - Math.round(shrink / 2) + (isHot ? 1 : 0);
      let ic = it.kind === 'point' ? emotePoint(T) : it.kind === 'unpin' ? removeIcon(T) : pinIcon(it.color, T);
      if (off?.has(i)) { const s = new PixelImage(ic.w, ic.h); s.blit(ic, 0, 0, { tint: T.ironSh }); ic = s; }
      const ix = Math.round(c + rm * Math.cos(a) - ic.w / 2), iy = Math.round(c + rm * Math.sin(a) - ic.h / 2) - (isHot ? 1 : 0);
      img.blit(ic, ix, iy);
      // (r3) no text labels on touch wedges: v2 PieMenu draws none, and 'Point' / 'Remove' overflowed into the hub and
      // the neighbouring wedges at 46 texels; the caption plate names the hot wedge.
      if (it.kind === 'pin' && it.color === color && !off?.has(i)) {
        // v2 .ctp-current. UI integration r2 (whole-screen critic: the 2x2 colour dot beside the pin read as a stray
        // dot): the current colour is marked as a gold arc ON the wedge's outer rim (the hub's gold = "yours / chosen"),
        // 7 rim texels centred on the wedge's centre line, so it reads as part of the pie, not as a speck.
        const Rw = isHot ? Rhot : R;
        for (let y = c - Rw - 1; y <= c + Rw + 1; y++) for (let x = c - Rw - 1; x <= c + Rw + 1; x++) {
          if (!edgeAt(i, x, y) || Math.hypot(x - c, y - c) < Rw - 1.5) continue;
          const da = Math.atan2(y - c, x - c) - a, w = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) * Rw;
          if (w <= 3.5) img.set(x, y, w <= 1.5 ? T.goldHi : T.gold);
        }
      }
    }
  }
  return img;
}

/**
 * Draw the pie centred at (cx, cy) on img with its caption and the press dot, stepped by the menu clock.
 * st = { size, items, hot, color, off, sticky, title, input: 'mouse'|'touch', tOpen (s since open), commit: {i, t} (s
 * since commit), cancel: t (s since cancel), reduced }. Returns false when nothing is drawn.
 */
export function drawPie(img, cx, cy, T, st) {
  if (st.pressOnly) { pressDot(img, cx, cy, T); return true; }
  const size = st.size || 'mouse', G = PIE[size];
  const items = st.items || pieItems({ name: 'Bram' }), n = items.length;
  const kOpen = st.reduced ? 99 : gridK(st.tOpen ?? 99);
  const c = G.R + 3;
  const base = { size, items, hot: st.hot ?? null, color: st.color ?? null, off: st.off ?? null, idleHub: st.hot == null,
    phase: st.reduced ? 0 : Math.floor((st.tOpen ?? 0) * 7.5) };
  let pie;
  if (st.commit) {
    // 15 fps steps: 0 others 50 % dissolved (back + hub + chosen solid), 1 back + hub + chosen, 2 / 3 that at 50 / 75 %
    const k = st.reduced ? 99 : gridK(st.commit.t, 2);
    if (k >= 4) return false;
    const i = st.commit.i, others = new Set(items.map((_, j) => j).filter((j) => j !== i));
    // back disc only behind the chosen wedge (+ hub); the others dissolve WITH their part of the back (critic r1)
    // r3 (critic r2): from step 1 the hub well goes too - a lone 24-px near-black hub disc still blinked as a hole
    pie = pieImage(T, { ...base, hot: i, show: new Set(), icons: false, idleHub: false, hub: k === 0, backShow: new Set([i]) });
    if (k === 0) pie.blit(dissolve(pieImage(T, { ...base, hot: i, show: others, hub: false, idleHub: false, backShow: others }), 0.5), 0, 0);
    pie.blit(pieImage(T, { ...base, hot: i, show: new Set([i]), back: false, hub: false, idleHub: false }), 0, 0);
    if (k >= 2) dissolve(pie, k === 2 ? 0.5 : 0.75);
  } else if (st.cancel != null) {
    const k = gridK(st.cancel, 2);
    if (k >= 3 || st.reduced) return false;
    pie = dissolve(pieImage(T, base), [0.25, 0.5, 0.75][k]);
  } else if (kOpen < 1) {
    pie = pieImage(T, { ...base, shrink: Math.round(G.R * 0.3), icons: false, show: new Set(), idleHub: false, ring: true });
  } else if (kOpen < TIMING.PIE_OPEN_FRAMES) {
    const fan = PIE_FAN(n), per = Math.ceil(n / 3), shown = new Set(fan.slice(0, per * kOpen));
    pie = pieImage(T, { ...base, show: shown, backShow: shown });
  } else pie = pieImage(T, base);
  img.blit(pie, cx - c, cy - c);
  // press dot (v2 .ctp-press): gold 3x3 with its own line, at the press point (= centre unless clamped)
  const px = cx + (st.press?.dx ?? 0), py = cy + (st.press?.dy ?? 0);
  if (!st.noPress && st.cancel == null && (!st.commit || gridK(st.commit.t, 2) < 1)) pressDot(img, px, py, T);
  // caption plate: above the pie, below it near the top of the screen (v2 capBelow)
  const showCap = !st.noCaption && !(st.commit && gridK(st.commit.t, 2) >= 2) && st.cancel == null && kOpen >= 1;
  if (showCap) {
    const touch = (st.input || size) === 'touch';
    const hot = st.hot != null ? items[st.hot] : st.commit ? items[st.commit.i] : null;
    const title = st.title || 'Point or pin';
    const cap = hot ? hot.label : st.sticky ? `${title} — ${touch ? 'tap' : 'click'} one` : `${title} — ${touch ? 'slide' : 'drag'} to choose`;
    drawCaption(img, cx, cy, G.R, cap, T);
  }
  return true;
}
/** Press dot (v2 .ctp-press): gold 3x3, lit top-left, in a gold-line ring (7x7 incl. the ring). */
function pressDot(img, px, py, T) {
  img.rect(px - 1, py - 1, 3, 3, T.gold); img.set(px - 1, py - 1, T.goldHi); img.set(px + 1, py + 1, T.goldSh);
  for (const [dx, dy] of [[-2, -1], [-2, 0], [-2, 1], [2, -1], [2, 0], [2, 1], [-1, -2], [0, -2], [1, -2], [-1, 2], [0, 2], [1, 2]]) img.set(px + dx, py + dy, T.goldLine);
}
/** Caption plate (v2 .ctp-caption: panel ink, gold keyline) centred over x, bottom at cy - R - 5 (or below when no room). */
export function drawCaption(img, cx, cy, R, text, T) {
  const w = Math.min(img.w - 4, textWidth(text) + 10), h = 13;
  let x = Math.round(cx - w / 2); x = Math.max(2, Math.min(img.w - w - 2, x));
  let y = cy - R - 6 - h;
  if (y < 2) y = cy + R + 6;
  drawBox(img, x, y, w, h, 'tooltip', T);
  const s = wrapText(text, w - 10, { maxLines: 1 })[0];
  drawText(img, x + Math.floor(w / 2), y + 4, s, { color: T.text, align: 'center' });
  return { x, y, w, h };
}

// ------------------------------------------------------------------------------------------------ dock (social palette)
export const DOCK = { w: 96, h: 83 };   // r2: +9 for the 3rd key-hint row; UI integration r2: +4 for the 9-px key caps
const ON = { line: 'outline', edge: 'gold', fill: 'goldLine', hi: 'goldSh', sh: null, corner: 1, shadow: false, press: 1 };
const SWATCH_ON = { line: 'outline', edge: 'goldHi', fill: 'inkRaised', hi: null, sh: null, corner: 1, shadow: false };
const SWATCH_HOVER = { line: 'outline', edge: 'ironHi', fill: 'inkRaised', hi: null, sh: null, corner: 1, shadow: false };
const CLEAR_HOVER = { line: 'outline', edge: 'goldSh', fill: 'inkRaised', hi: 'ironHi', sh: 'ironSh', corner: 1, shadow: false };
/**
 * Keyboard chip (v2 <kbd>): 9 px tall, gold-shadow keyline (notched corners) on a RAISED ink cap with 1 px of padding
 * left / right and 1 row above / below the caps, tiny caps in parchment text; returns its width. UI integration r2 (whole-screen critic): the 7-px cap had
 * the 5-row caps touching its gold keyline and gold text on it, so 'DRAG' read as 'ORAG' at 1x.
 */
export const KBD_H = 9;
export function drawKbd(img, x, y, s, T) {
  const w = textWidth(s, 'tiny') + 4;
  img.rect(x + 1, y, w - 2, KBD_H, T.goldSh); img.rect(x, y + 1, w, KBD_H - 2, T.goldSh);   // 1-px notched corners
  img.rect(x + 1, y + 1, w - 2, KBD_H - 2, T.inkRaised);
  img.hline(x + 1, y + KBD_H - 2, w - 2, T.ironSh);                                           // cap bottom (lit from above)
  drawText(img, x + 2, y + 2, s, { font: 'tiny', color: T.text });
  return w;
}
/**
 * The open dock panel at (x, y) (96x70). o = { mode: 'idle'|'point'|'pin', color, mine (pins placed), hover: 'point'|
 * 'pin'|'clear'|'swatch:<c>'|null, touch (touch hint text), framesOnly (empty panel: the open-pop frame) }.
 * At the cap (mine >= MAX_PINS_PER_MEMBER) the Pin toggle shows 'n/6' in dim text and the swatches are drawn as grey
 * silhouettes (the disabled-wedge treatment), so the dock says why the pie's pin wedges are off.
 * Returns the rects of the controls (hit areas, for the port).
 */
export function drawDock(img, x, y, T, o = {}) {
  const { mode = 'idle', color = 'crimson', mine = 2, hover = null, framesOnly = false } = o;
  const full = mine >= TIMING.MAX_PINS_PER_MEMBER;
  const grey = (im) => { const s = new PixelImage(im.w, im.h); s.blit(im, 0, 0, { tint: T.ironSh }); return s; };
  const r = {};
  const inner = drawBox(img, x, y, DOCK.w, DOCK.h, 'panel', T);
  if (framesOnly) return r;
  const ix = inner.x, iw = inner.w;
  // Point / Pin toggles (15 tall: 9x9 glove / 7x9 pin glyph + label)
  const bw = Math.floor((iw - 3) / 2), bh = 15, by = inner.y + 1;
  [['point', 'Point'], ['pin', full ? `Pin ${mine}/${TIMING.MAX_PINS_PER_MEMBER}` : 'Pin']].forEach(([k, label], j) => {
    const bx = ix + 1 + j * (bw + 1);
    const capped = k === 'pin' && full;
    const on = mode === k && !capped;
    const style = capped ? 'disabled' : on ? ON : hover === k ? 'hover' : 'raised';
    drawBox(img, bx, by, bw, bh, style, T);
    let icon = k === 'point' ? emotePointSmall(T) : pinIconSmall(color, T);
    if (capped) icon = grey(icon);
    const tw = textWidth(label), gx = bx + Math.floor((bw - icon.w - 3 - tw) / 2), dy = on ? 1 : 0;
    img.blit(icon, gx, by + 3 + dy);
    drawText(img, gx + icon.w + 3, by + 4 + dy, label, { color: capped ? T.textDim : on ? T.goldHi : T.text });
    r[k] = { x: bx, y: by, w: bw, h: bh };
  });
  // 8 swatches (the pins themselves; selected = gold keyline cell, hover = iron-hi cell)
  const sy = by + bh + 1, cw = 11, sh = 16, sx0 = ix + Math.floor((iw - cw * 8) / 2);
  PIN_COLORS.forEach((c, i) => {
    const cx = sx0 + i * cw;
    if (c === color && !full) drawBox(img, cx, sy, cw, sh, SWATCH_ON, T);
    else if (hover === `swatch:${c}` && !full) drawBox(img, cx, sy, cw, sh, SWATCH_HOVER, T);
    img.blit(full ? grey(pinIcon(c, T)) : pinIcon(c, T), cx + 1, sy + 2);
    r[`swatch:${c}`] = { x: cx, y: sy, w: cw, h: sh };
  });
  // Clear my pins (n) — disabled at 0
  const cy = sy + sh + 1, ch = 12;
  const dis = !mine;
  const hov = !dis && hover === 'clear';   // hover: gold keyline + gold text (critic r1: iron-hi alone was invisible)
  drawBox(img, ix + 1, cy, iw - 2, ch, dis ? 'disabled' : hov ? CLEAR_HOVER : 'raised', T);
  const label = `Clear my pins${mine ? ` (${mine})` : ''}`;
  drawText(img, ix + Math.floor(iw / 2), cy + 3, label, { color: dis ? T.textDim : hov ? T.goldHi : T.text, align: 'center' });
  r.clear = { x: ix + 1, y: cy, w: iw - 2, h: ch };
  // key hints (v2 .cts-tip): [RIGHT] point [DRAG] menu / [F] pin / click your pin: remove (v2 copy). The mouse button is
  // spelled RIGHT: the tiny font's M reads as H ('RMB' -> 'RHB').
  let hx = ix + 1, hy = cy + ch + 3;
  if (o.touch) {
    drawText(img, hx, hy + 1, 'Hold the town,', { color: T.textDim });
    drawText(img, hx, hy + 10, 'slide to choose', { color: T.textDim });
  } else {
    const row = (parts) => { hx = ix + 1; for (const [k, w] of parts) { hx += drawKbd(img, hx, hy, k, T) + 2; drawText(img, hx, hy + 1, w, { color: T.textDim }); hx += textWidth(w) + 3; } hy += KBD_H + 2; };
    row([['RIGHT', 'point'], ['DRAG', 'menu']]);
    row([['F', 'pin']]);
    drawText(img, ix + 1, hy, 'Click your pin: remove', { color: T.textDim });
  }
  return r;
}
/**
 * The dock toggle ring (24x24) around the portraits group's portrait button: transparent centre (the portrait shows
 * through), keyline iron / iron-hi (hover) / gold (open), and the current pin colour as a dot (v2 .cts-toggle-pin).
 */
export function dockButton(T, { state = 'normal', color = null, size = 24 } = {}) {
  const img = new PixelImage(size + 2, size + 2);
  const S = { line: 'outline', edge: state === 'open' ? 'gold' : state === 'hover' ? 'ironHi' : 'iron', fill: 'outline', hi: null, sh: null, corner: 2, shadow: false };
  drawBox(img, 0, 0, size, size, S, T);
  // inner rim: 1 px of the line tone, then a transparent hole (the portrait group's art)
  for (let y = 3; y < size - 3; y++) for (let x = 3; x < size - 3; x++) img.erase(x, y);
  if (state === 'open') { img.hline(3, 2, size - 6, T.goldHi); img.vline(2, 3, size - 6, T.goldHi); }
  if (color) img.blit(dockDot(color, T), size - 6, size - 6);
  return img;
}
/** 7x7 pin-colour dot (the dock button's corner badge). Black: solid body in the dark UI outline (like the black pin). */
export const dockDot = (color, T) => memo('dot' + color + (T ? tkey(T) : ''), () => {
  const R = PIN_RAMPS[color];
  const m = color === 'black' && T ? { hi: T.ironHi, mid: R.hi, sh: R.hi, line: T.outline } : { hi: R.hi, mid: R.mid, sh: R.sh, line: R.line };
  return shade(['.###.', '#####', '#####', '#####', '.###.'], { '#': m }, { diag: false });
});
/** Armed pill size for a mode: one line of text + icon + Cancel, sized from the text (critic r1: the fixed 96-px pill
 * wrapped to 2 lines and jammed 'Cancel' against its frame). */
export function armedText(mode, touch) { const v = touch ? 'Tap' : 'Click'; return mode === 'point' ? `${v} what to point at` : `${v} to drop your pin`; }
export function armedSize(T, { mode = 'pin', touch = false } = {}) {
  const icon = mode === 'point' ? emotePointSmall(T) : pinIconSmall('crimson', T);
  const cw = textWidth('Cancel') + 10;
  return { w: 2 + 3 + icon.w + 4 + textWidth(armedText(mode, touch)) + 6 + cw + 2 + 2, h: 17, cw, icon };
}
/** Armed pill (v2 .cts-armed): icon + "Click to drop your pin" + Cancel, gold keyline on dark gold, one line, 17 tall. */
export function drawArmed(img, x, y, T, { mode = 'pin', touch = false, hover = false } = {}) {
  const { w, h, cw, icon } = armedSize(T, { mode, touch });
  const S = { line: 'outline', edge: 'gold', fill: 'goldLine', hi: 'goldSh', sh: null, corner: 2, shadow: true };
  drawBox(img, x, y, w, h, S, T);
  // content rect = inset 2 (line + keyline); icon 3 px in from it, vertically centred
  img.blit(icon, x + 5, y + Math.floor((h - icon.h) / 2));
  drawText(img, x + 5 + icon.w + 4, y + 6, armedText(mode, touch), { color: T.goldHi });
  const cb = { x: x + w - 4 - cw, y: y + 2, w: cw, h: 13 };
  drawBox(img, cb.x, cb.y, cb.w, cb.h, hover ? 'hover' : 'raised', T);
  drawText(img, cb.x + Math.floor(cb.w / 2), cb.y + 4, 'Cancel', { color: T.text, align: 'center' });
  return { cancel: cb, w, h };
}
/** First-run hint (v2 .cts-hint): tooltip with a tail pointing down-right at the dock button. Returns height. */
export function drawHint(img, xr, yb, T, { w = DOCK.w, touch = false, tailX = null } = {}) {
  const text = touch ? 'Point & pins: hold a finger on the town, then slide to choose.' : 'Point & pins: right-click to point, right-drag for the pin menu, F to pin.';
  const lines = wrapText(text, w - 10, { maxLines: 4 });
  const h = lines.length * 9 + 6, x = xr - w, y = yb - h - 3;
  drawBox(img, x, y, w, h, 'tooltip', T);
  lines.forEach((l, i) => drawText(img, x + 5, y + 4 + i * 9, l, { color: i === 0 ? T.goldHi : T.text }));
  const tx = tailX ?? xr - 10, b = y + h - 1;
  img.rect(tx - 1, b - 1, 3, 2, T.ink); img.set(tx - 2, b, T.goldSh); img.set(tx + 2, b, T.goldSh);
  img.set(tx - 1, b + 1, T.goldSh); img.set(tx, b + 1, T.ink); img.set(tx + 1, b + 1, T.goldSh); img.set(tx, b + 2, T.goldSh);
  img.set(tx - 3, b, T.outline); img.set(tx + 3, b, T.outline); img.set(tx - 2, b + 1, T.outline); img.set(tx + 2, b + 1, T.outline);
  img.set(tx - 1, b + 2, T.outline); img.set(tx + 1, b + 2, T.outline); img.set(tx, b + 3, T.outline);
  return h;
}
/** Pin tooltip (v2 .cts-tooltip): "<name>'s pin on <target>", anchored with its bottom centre at (cx, yb). */
export function drawPinTip(img, cx, yb, text, T, { removable = false } = {}) {
  const w = textWidth(text) + 10, h = 13, x = cx - Math.floor(w / 2), y = yb - h;
  const S = { line: 'outline', edge: removable ? 'danger' : 'iron', fill: 'ink', hi: null, sh: null, corner: 1, shadow: true };
  drawBox(img, x, y, w, h, S, T);
  drawText(img, cx, y + 4, text, { color: T.text, align: 'center' });
  return { x, y, w, h };
}
