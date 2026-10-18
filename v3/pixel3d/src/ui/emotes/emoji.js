// Emoji emotes (owner: emotes; docs/UI-EMOJI.md). Pure kit drawing, no three.js, deterministic (functions of the clock on
// the 30 Hz grid). Additive: nothing in src/ui/emotes/art.js changes for its existing callers.
//
//   import * as EJ from '../ui/emotes/emoji.js';
//   EJ.EMOJI / EJ.EMOJI_ALT               the 7 chosen reactions (key order = number keys 1..7) / the 3 alternates
//   EJ.emojiIcon(key, T)                  13x13 glyph (11x11 art + its own line), .hd = 26x26 after prepareEmojiHD
//   EJ.emojiPopFrame(key, f, T)           in-world pop above a head, f 0 pop, 1..2 burst, 3 hold, 4..6 dissolve
//   EJ.emojiPopState(t, t0, {reduced})    {f, bob} for a pop shown at t0 (f -1 = hidden)
//   EJ.drawEmojiPop(img, x, top, key, T, t, t0, o)   state + blit (tail tip 1 px above `top`, the label stack top)
//   EJ.pieItemsEmoji({name, self, removable, color})  the new pie: Point, 7 emoji, [Remove], Pin (current colour)
//   EJ.drawEmoteDock(img, x, y, T, o)     the new social dock: Point / Pin (+ colour button), 7 emoji, Clear, key hints
//   EJ.drawPinPicker(img, x, y, T, o)     compact pin-colour popover (AUTO + 8 dots); EJ.drawPinColorRow for a settings row
//   EJ.autoPinColor(seatOrId, {taken})    the automatic per-player pin colour (default until the player picks one)
//   EJ.EMOJI_KEYS / EJ.emojiForCode(code) Digit1..7 -> emoji key
//
// Art language as art.js (docs/UI.md §2): 1 px = 1 texel, lit from the upper left, every glyph outlined in its own line
// tone, binary alpha, token colours only (gold / parchment / ink / crimson pin ramp / danger ramp / good).
import { PixelImage, PIN_COLORS, PIN_RAMPS, ramp, drawBox, drawText, textWidth, dissolve, GRID_HZ, withHD } from '../kit.js';
import * as E from './art.js';

/** Empty unless src/ui/hd/emoji.js prepareEmojiHD() fills it: then emojiIcon / emojiPopFrame return 1x images with `.hd`. */
export const HD_HOOKS = {};

// ------------------------------------------------------------------------------------------------ the set
/**
 * The 7 reactions, in number-key order (1..7) = the dock row order. `with(name)` = the pie caption when the pie was
 * opened on a person (the emoji still pops over YOUR head; the target only words the caption and turns you to face them).
 */
export const EMOJI = [
  { key: 'agree', label: 'Agree', with: (n) => `Agree with ${n}` },
  { key: 'disagree', label: 'Disagree', with: (n) => `Disagree with ${n}` },
  { key: 'question', label: 'Question', with: (n) => `Question ${n}` },
  { key: 'suspicious', label: 'Suspicious', with: (n) => `Suspicious of ${n}` },
  { key: 'shocked', label: 'Gasp', with: (n) => `Gasp at ${n}` },
  { key: 'laugh', label: 'Laugh', with: null },
  { key: 'heart', label: 'Trust', with: (n) => `Trust ${n}` },
];
/** Drawn and reviewed, not in the set (docs/UI-EMOJI.md "Why these 7"). Same API: emojiIcon('alarm', T) etc. */
export const EMOJI_ALT = [
  { key: 'alarm', label: 'Alarm', with: null },
  { key: 'thinking', label: 'Thinking', with: null },
  { key: 'shush', label: 'Shush', with: null },
];
const BY = Object.fromEntries([...EMOJI, ...EMOJI_ALT].map((e) => [e.key, e]));
export const emojiInfo = (key) => BY[key] ?? null;
/** Pie order clockwise from Point (12 o'clock): warm reactions on the right, doubt on the left, Pin at 11 o'clock. */
export const PIE_ORDER = ['agree', 'heart', 'laugh', 'shocked', 'question', 'suspicious', 'disagree'];
/** Number keys (while the emote dock is open, docs/UI-EMOJI.md "Keys"). */
export const EMOJI_KEYS = EMOJI.map((e, i) => ({ key: e.key, code: `Digit${i + 1}`, hint: String(i + 1) }));
export const emojiForCode = (code) => EMOJI_KEYS.find((k) => k.code === code)?.key ?? null;

export const EMOJI_TIMING = {
  POP_MS: 2700,          // burst (5 grid frames) + hold (~2.53 s) before the dissolve starts
  BURST_FRAMES: [1, 2, 2],   // grid frames of f0 (small bubble), f1 (burst, lifted 2), f2 (burst out, lifted 1)
  BOB_FPS: 2,            // 1-px bob during the hold (as the existing pops)
  DISSOLVE_FRAMES: 6,    // 3 Bayer steps at 15 fps
  COOLDOWN_MS: 800,      // one reaction per player per 0.8 s (a new one replaces the old pop: one pop per head)
};

// ------------------------------------------------------------------------------------------------ cache
const _tk = new WeakMap();
const tkey = (T) => { let k = _tk.get(T); if (!k) { k = Object.values(T).filter((v) => typeof v === 'string').join(''); _tk.set(T, k); } return k; };
const cache = new Map();
const memo = (key, fn) => { let v = cache.get(key); if (!v) { v = fn(); cache.set(key, v); } return v; };

// ------------------------------------------------------------------------------------------------ glyph art (11x11)
// Materials: f face (gold, lit), w glove / eye white (parchment, lit), c cuff (gold), k crease, e / m dark features
// (flat textInk), t tongue (flat danger), d tear (flat good), h heart (crimson pin ramp), g glint, q '?' (gold), x '!'.
const FACE = (rows) => rows;
const GRID = {
  agree: [
    '....ww.....',
    '...www.....',
    '...www.....',
    '..wwww.....',
    'cwwwwwkkkw.',
    'cwwwwwwwwww',
    'cwwwwkkkkw.',
    'cwwwwwwwwww',
    'cwwwwkkkkw.',
    'cwwwwwwwww.',
    '.cwwwwwww..',
  ],
  shocked: FACE([
    '...fffff...',
    '..fffffff..',
    '.feefffeef.',
    'fffffffffff',
    'ffeefffeeff',
    'ffeefffeeff',
    'fffffffffff',
    'ffffmmmffff',
    '.fffmtmfff.',
    '..ffmmmff..',
    '...fffff...',
  ]),
  laugh: FACE([
    '...fffff...',
    '..fffffff..',
    '.fffffffff.',
    'ffefffffeff',
    'fefefffefef',
    'dfffffffffd',
    'dfmmmmmmmfd',
    'fffmtttmfff',
    '.fffffffff.',
    '..fffffff..',
    '...fffff...',
  ]),
  suspicious: [
    '...........',
    '...........',
    '.www...www.',
    'wwwww.wwwww',
    'ppwww.ppwww',
    'ppwww.ppwww',
    'ppwww.ppwww',
    'wwwww.wwwww',
    '.www...www.',
    '...........',
    '...........',
  ],
  heart: [
    '.hhh...hhh.',
    'hhhhh.hhhhh',
    'hhghhhhhhhh',
    'hhhhhhhhhhh',
    'hhhhhhhhhhh',
    '.hhhhhhhhh.',
    '..hhhhhhh..',
    '...hhhhh...',
    '....hhh....',
    '.....h.....',
    '...........',
  ],
  question: [
    '...qqqqq...',
    '..qqqqqqq..',
    '..qq...qq..',
    '.......qq..',
    '......qqq..',
    '.....qqq...',
    '.....qq....',
    '.....qq....',
    '...........',
    '.....qq....',
    '.....qq....',
  ],
  alarm: [
    '....xxx....',
    '....xxx....',
    '....xxx....',
    '....xxx....',
    '....xxx....',
    '.....x.....',
    '.....x.....',
    '...........',
    '....xxx....',
    '....xxx....',
    '...........',
  ],
  thinking: FACE([
    '...fffff...',
    '..fffffff..',
    '.ffffffeef.',
    'ffeefffffff',
    'fffefffefff',
    'fffefffefff',
    'fffffffffff',
    'ffffffmmmff',
    '.wwwwwffff.',
    'cwwwwffff..',
    'cwwwffff...',
  ]),
  shush: FACE([
    '...fffff...',
    '..fffffff..',
    '.fffffffff.',
    'ffeefffeeff',
    'fffffffffff',
    'fffffwwffff',
    'fffffwwffff',
    'fffttwwtfff',
    '.ffffwwfff.',
    '..fwwwwwf..',
    '...wwwww...',
  ]),
};
GRID.disagree = [...GRID.agree].reverse();   // thumbs down: the same glove flipped, then re-lit by the shader
export const EMOJI_GRID = GRID;

const parchMat = (T) => ({ hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh, line: T.parchmentLine });
const goldMat = (T) => ({ hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine });
/** Materials per glyph (shared by the HD art in src/ui/hd/emoji.js). */
export function emojiMats(key, T) {
  const P = parchMat(T), G = goldMat(T), C = PIN_RAMPS.crimson, D = ramp(T.danger);
  const dark = { flat: T.textInk, line: G.line };
  switch (key) {
    case 'agree': case 'disagree':
      return { mats: { w: P, k: { flat: T.parchmentSh, line: T.parchmentLine }, c: G }, prefer: ['w', 'c', 'k'] };
    case 'suspicious':
      return { mats: { w: { hi: T.parchmentHi, mid: T.parchmentHi, sh: T.parchment, line: T.parchmentLine }, p: { flat: T.textInk, line: T.parchmentLine } }, prefer: ['w', 'p'] };
    case 'heart':
      return { mats: { h: { hi: C.hi, mid: C.mid, sh: C.sh, line: C.line }, g: { flat: T.parchmentHi, line: C.line } }, prefer: ['h'] };
    case 'question':
      return { mats: { q: G }, prefer: ['q'] };
    case 'alarm':
      return { mats: { x: { hi: D.hi, mid: D.mid, sh: D.sh, line: D.line } }, prefer: ['x'] };
    default:   // faces (+ the thinking / shush hand)
      return { mats: { f: G, e: dark, m: dark, t: { flat: D.mid, line: G.line }, d: { flat: T.good, line: G.line }, w: P, c: { ...G } }, prefer: ['f', 'w', 'c'] };
  }
}
/** 13x13 glyph of emoji `key` (pie wedge, dock cell, pop). `.hd` (26x26) after src/ui/hd/emoji.js prepareEmojiHD(T). */
export function emojiIcon(key, T) {
  const im = memo(`ej${key}${tkey(T)}`, () => {
    const { mats, prefer } = emojiMats(key, T);
    return E.shadeRows(GRID[key], mats, { prefer });
  });
  if (HD_HOOKS.icon && !im.hd) withHD(im, HD_HOOKS.icon(key, T));
  return im;
}

// ------------------------------------------------------------------------------------------------ in-world pop
// The emote pop's speech bubble (art.js bubble: outline / bubbleEdge / bubble / bubbleHi, 3-row tail, 1-px shadow) at
// 17x17 so it holds the 13x13 glyph, on a larger canvas that leaves room for the burst and the bounce. Anchor = the
// outline pixel under the tail tip (as E.POP.anchor). Frames:
//   0  small bubble (13x13, empty)                         1 grid frame   (= the existing pops' f0)
//   1  full bubble + glyph, lifted 2 px, 6 short gold rays   2 grid frames  (the burst + the bounce up)
//   2  lifted 1 px, the rays now single sparks 2 px further  2 grid frames
//   3  full, resting (hold; the caller adds the 1-px bob at 2 fps)
//   4..6  Bayer dissolve 25 / 50 / 75 % (15 fps)
export const EMOJI_POP = { w: 31, h: 31, anchor: { x: 15, y: 29 }, box: 17, small: 13, frames: 7 };
const BUBBLE = { line: 'outline', edge: 'bubbleEdge', fill: 'bubble', hi: 'bubbleHi', sh: null, corner: 2, shadow: false };
function bubbleAt(T, bw, bh, lift) {
  const img = new PixelImage(EMOJI_POP.w, EMOJI_POP.h);
  const cx = EMOJI_POP.anchor.x, x0 = cx - Math.floor(bw / 2), y0 = EMOJI_POP.anchor.y - lift - 2 - bh;
  drawBox(img, x0, y0, bw, bh, BUBBLE, T);
  const b = y0 + bh - 1;   // the tail, exactly as art.js bubble()
  img.rect(cx - 1, b - 1, 3, 1, T.bubble); img.rect(cx - 1, b, 3, 1, T.bubble);
  img.set(cx - 2, b, T.bubbleEdge); img.set(cx + 2, b, T.bubbleEdge);
  img.set(cx - 1, b + 1, T.bubbleEdge); img.set(cx, b + 1, T.bubble); img.set(cx + 1, b + 1, T.bubbleEdge);
  img.set(cx, b + 2, T.bubbleEdge);
  img.outline(T.outline);
  const sh = [];
  for (let y = 1; y < img.h; y++) for (let x = 0; x < img.w; x++) if (!img.alpha(x, y) && img.alpha(x, y - 1)) sh.push([x, y]);
  for (const [x, y] of sh) img.set(x, y, T.shadow);
  return { img, x0, y0, x1: x0 + bw - 1 };
}
/** Burst sparks around a bubble box (1x): stage 1 = 6 two-px rays 3 px out, stage 2 = 6 single sparks 5-6 px out. */
export function burstPoints(stage, x0, y0, x1, cy, cx) {
  if (stage === 1) return [[cx, y0 - 4], [cx, y0 - 3], [x0 - 4, cy], [x0 - 3, cy], [x1 + 3, cy], [x1 + 4, cy],
    [x0 - 4, y0 - 4], [x0 - 3, y0 - 3], [x1 + 4, y0 - 4], [x1 + 3, y0 - 3], [x0 - 3, cy + 6], [x1 + 3, cy + 6]];
  return [[cx, y0 - 6], [x0 - 6, cy], [x1 + 6, cy], [x0 - 5, y0 - 5], [x1 + 5, y0 - 5], [x0 - 5, cy + 7], [x1 + 5, cy + 7]];
}
function burst(img, stage, x0, y0, x1, T) {
  const s = new PixelImage(img.w, img.h), cx = EMOJI_POP.anchor.x, cy = y0 + 8;
  for (const [x, y] of burstPoints(stage, x0, y0, x1, cy, cx)) s.set(x, y, stage === 1 ? T.goldHi : T.gold);
  s.outline(T.goldLine);
  const out = new PixelImage(img.w, img.h); out.blit(s, 0, 0); out.blit(img, 0, 0);
  return out;
}
/** Pop frame f (0..6) of emoji `key`. Canvas EMOJI_POP.w x h for every frame (the anchor never moves). `.hd` after prepareEmojiHD. */
export function emojiPopFrame(key, f, T) {
  const im = memo(`ejpop${key}${f}${tkey(T)}`, () => {
    if (f === 0) return bubbleAt(T, EMOJI_POP.small, EMOJI_POP.small, 0).img;
    const lift = f === 1 ? 2 : f === 2 ? 1 : 0;
    const { img, x0, y0, x1 } = bubbleAt(T, EMOJI_POP.box, EMOJI_POP.box, lift);
    img.blit(emojiIcon(key, T), x0 + 2, y0 + 2);
    let out = f === 1 || f === 2 ? burst(img, f, x0, y0, x1, T) : img;
    if (f >= 4) out = dissolve(out, [0.25, 0.5, 0.75][f - 4]);
    return out;
  });
  if (HD_HOOKS.popFrame && !im.hd) withHD(im, HD_HOOKS.popFrame(key, f, T));
  return im;
}
const gridK = (t) => Math.floor(t * GRID_HZ + 0.01);
/**
 * {f, bob} of a pop shown at t0 (s): f0 1 frame, f1 2 frames, f2 2 frames, then f3 + a 1-px bob at 2 fps until
 * t0 + ms, then 3 dissolve steps at 15 fps; f -1 = hidden. reduced: f3 for the whole hold, no bob, no dissolve.
 */
export function emojiPopState(t, t0, { ms = EMOJI_TIMING.POP_MS, reduced = false } = {}) {
  if (t < t0) return { f: -1, bob: 0 };
  const k = gridK(t - t0), hold = Math.round(ms / 1000 * GRID_HZ);
  if (k < hold) {
    if (reduced) return { f: 3, bob: 0 };
    const [a, b, c] = EMOJI_TIMING.BURST_FRAMES;
    if (k < a) return { f: 0, bob: 0 };
    if (k < a + b) return { f: 1, bob: 0 };
    if (k < a + b + c) return { f: 2, bob: 0 };
    return { f: 3, bob: Math.floor((k - a - b - c) / (GRID_HZ / EMOJI_TIMING.BOB_FPS)) % 2 === 1 ? 1 : 0 };
  }
  if (reduced) return { f: -1, bob: 0 };
  const d = Math.floor((k - hold) / 2);
  return d < 3 ? { f: 4 + d, bob: 0 } : { f: -1, bob: 0 };
}
/** Seconds a pop stays on screen (for pruning a pops list). */
export const emojiPopLife = (ms = EMOJI_TIMING.POP_MS) => Math.round(ms / 1000 * GRID_HZ) / GRID_HZ + EMOJI_TIMING.DISSOLVE_FRAMES / GRID_HZ;
/**
 * Draw the pop of `key` shown at t0 over a member: x = the member's screen x, top = the top row of its label stack
 * (the tail tip sits 1 px above it, like E.popFrame). img may be a density world view (then the .hd frame is drawn).
 * Returns false when hidden.
 */
export function drawEmojiPop(img, x, top, key, T, t, t0, { reduced = false, ms } = {}) {
  const ps = emojiPopState(t, t0, { reduced, ms });
  if (ps.f < 0) return false;
  img.blit(emojiPopFrame(key, ps.f, T), x - EMOJI_POP.anchor.x, top - 1 - EMOJI_POP.anchor.y - ps.bob);
  return true;
}

// ------------------------------------------------------------------------------------------------ pie
/**
 * The new pie layout (same wedge-count rule as E.pieItems: 9 wedges, 10 with Remove at 6 o'clock):
 *   0 Point (12 o'clock) · 1 agree · 2 heart · 3 laugh · 4 shocked · [Remove] · question · suspicious · disagree · Pin
 * Pin = ONE wedge in the player's current colour (kind 'pin', color, current: true: no current-colour arc).
 * Emoji items: { key: 'emoji:<k>', kind: 'emoji', emoji: k, label, icon: (T) => emojiIcon(k, T) }.
 */
export function pieItemsEmoji({ name = null, self = false, removable = null, color = 'crimson' } = {}) {
  const who = name === null ? null : self ? 'yourself' : name;
  const items = [{ key: 'point', kind: 'point', label: who ? `Point at ${who}` : 'Point here' }];
  const em = (k) => { const e = BY[k]; return { key: `emoji:${k}`, kind: 'emoji', emoji: k, label: name !== null && !self && e.with ? e.with(name) : e.label, icon: (T) => emojiIcon(k, T) }; };
  PIE_ORDER.slice(0, 4).forEach((k) => items.push(em(k)));
  if (removable) items.push({ key: 'unpin', kind: 'unpin', label: removable.mine ? 'Remove my pin' : `Remove ${removable.byName}’s pin` });
  PIE_ORDER.slice(4).forEach((k) => items.push(em(k)));
  const L = E.PIN_LABEL[color] ?? color;
  items.push({ key: `pin:${color}`, kind: 'pin', color, current: true, label: who ? `Pin ${who} · ${L.toLowerCase()}` : `${L} pin here` });
  return items;
}
export const PIE_TITLE = 'Point, pin or react';

// ------------------------------------------------------------------------------------------------ dock (emote palette)
export const EMOTE_DOCK = { w: 112, h: 90, cell: { w: 15, h: 23 }, colorW: 11 };
const ON = { line: 'outline', edge: 'gold', fill: 'goldLine', hi: 'goldSh', sh: null, corner: 1, shadow: false, press: 1 };
const CELL_ON = { line: 'outline', edge: 'goldHi', fill: 'inkRaised', hi: null, sh: null, corner: 1, shadow: false };
const CELL_HOVER = { line: 'outline', edge: 'ironHi', fill: 'inkRaised', hi: null, sh: null, corner: 1, shadow: false };
const CLEAR_HOVER = { line: 'outline', edge: 'goldSh', fill: 'inkRaised', hi: 'ironHi', sh: 'ironSh', corner: 1, shadow: false };
const grey = (im, T) => {
  const s = new PixelImage(im.w, im.h); s.blit(im, 0, 0, { tint: T.ironSh });
  if (im.hd) { const h = new PixelImage(im.hd.w, im.hd.h); h.blit(im.hd, 0, 0, { tint: T.ironSh }); withHD(s, h, im.hdOff); }
  return s;
};
/** 5x3 caret (the colour button's "opens a menu" mark) in c. */
function caret(img, x, y, c) {
  if (img.isView && HD_HOOKS.caret) return HD_HOOKS.caret(img, x, y, c);
  img.hline(x, y, 5, c); img.hline(x + 1, y + 1, 3, c); img.set(x + 2, y + 2, c);
}
/** w x 1 rule (the auto-colour underline). */
function underline(img, x, y, w, c) {
  if (img.isView && HD_HOOKS.underline) return HD_HOOKS.underline(img, x, y, w, c);
  img.hline(x, y, w, c);
}
/**
 * The emote dock (replaces E.drawDock's swatch row): EMOTE_DOCK.w x h (112 x 90) at (x, y).
 *   row 1  Point | Pin (pin glyph in the current colour) + a colour button (dot + caret: opens drawPinPicker)
 *   row 2  the 7 emoji (13x13) with their number keys 1..7
 *   row 3  Clear my pins (n) · rows 4-5 key hints · 'Click your pin: remove'
 * o = { mode: 'idle'|'point'|'pin', color, mine (pins placed), hover: 'point'|'pin'|'pinColor'|'clear'|'emoji:<k>'|null,
 *       active (emoji key just sent: gold cell), picker (the colour popover is open: colour button lit), off (Set of
 *       emoji keys greyed), touch, framesOnly }.
 * Returns the hit rects: point, pin, pinColor, 'emoji:<k>' x7, clear.
 */
export function drawEmoteDock(img, x, y, T, o = {}) {
  const { mode = 'idle', color = 'crimson', mine = 2, hover = null, active = null, picker = false, off = null, framesOnly = false } = o;
  const full = mine >= E.TIMING.MAX_PINS_PER_MEMBER;
  const r = {};
  const inner = drawBox(img, x, y, EMOTE_DOCK.w, EMOTE_DOCK.h, 'panel', T);
  if (framesOnly) return r;
  const ix = inner.x, iw = inner.w, bh = 15, by = inner.y + 1;
  const bw = Math.floor((iw - 3) / 2), cw = EMOTE_DOCK.colorW;
  const btn = (k, bx, w, icon, label, { capped = false } = {}) => {
    const on = mode === k && !capped;
    drawBox(img, bx, by, w, bh, capped ? 'disabled' : on ? ON : hover === k ? 'hover' : 'raised', T);
    if (capped) icon = grey(icon, T);
    const tw = textWidth(label), gx = bx + Math.floor((w - icon.w - 3 - tw) / 2), dy = on ? 1 : 0;
    img.blit(icon, gx, by + 3 + dy);
    drawText(img, gx + icon.w + 3, by + 4 + dy, label, { color: capped ? T.textDim : on ? T.goldHi : T.text });
    r[k] = { x: bx, y: by, w, h: bh };
  };
  btn('point', ix + 1, bw, E.emotePointSmall(T), 'Point');
  const px = ix + 1 + bw + 1, pw = bw - cw;
  btn('pin', px, pw, E.pinIconSmall(color, T), full ? `Pin ${mine}/${E.TIMING.MAX_PINS_PER_MEMBER}` : 'Pin', { capped: full });
  // the colour button (split off the Pin button): the current colour's dot over a caret
  const cx = px + pw;
  drawBox(img, cx, by, cw, bh, picker ? ON : hover === 'pinColor' ? 'hover' : 'raised', T);
  const pd = picker ? 1 : 0;
  img.blit(E.dockDot(color, T), cx + 2, by + 2 + pd);
  caret(img, cx + 3, by + 10 + pd, picker ? T.goldHi : hover === 'pinColor' ? T.text : T.textDim);
  r.pinColor = { x: cx, y: by, w: cw, h: bh };
  // the 7 emoji
  const C = EMOTE_DOCK.cell, sy = by + bh + 1, sx0 = ix + Math.floor((iw - C.w * EMOJI.length) / 2);
  EMOJI.forEach((e, i) => {
    const ex = sx0 + i * C.w, k = `emoji:${e.key}`, dis = off?.has(e.key);
    const st = dis ? null : active === e.key ? CELL_ON : hover === k ? CELL_HOVER : null;
    if (st) drawBox(img, ex, sy, C.w, C.h, st, T);
    const ic = emojiIcon(e.key, T);
    img.blit(dis ? grey(ic, T) : ic, ex + 1, sy + 2);
    drawText(img, ex + 7, sy + 16, String(i + 1), { font: 'tiny', align: 'center', color: dis ? T.ironSh : st ? T.goldHi : T.textDim });
    r[k] = { x: ex, y: sy, w: C.w, h: C.h };
  });
  // Clear my pins (n)
  const cy = sy + C.h + 1, ch = 12, dis = !mine, hov = !dis && hover === 'clear';
  drawBox(img, ix + 1, cy, iw - 2, ch, dis ? 'disabled' : hov ? CLEAR_HOVER : 'raised', T);
  drawText(img, ix + Math.floor(iw / 2), cy + 3, `Clear my pins${mine ? ` (${mine})` : ''}`, { color: dis ? T.textDim : hov ? T.goldHi : T.text, align: 'center' });
  r.clear = { x: ix + 1, y: cy, w: iw - 2, h: ch };
  // key hints
  let hx = ix + 1, hy = cy + ch + 3;
  if (o.touch) {
    drawText(img, hx, hy + 1, 'Hold the town, slide', { color: T.textDim });
    drawText(img, hx, hy + 10, 'to point, pin or react', { color: T.textDim });
  } else {
    const row = (parts) => { hx = ix + 1; for (const [k, w] of parts) { hx += E.drawKbd(img, hx, hy, k, T) + 2; drawText(img, hx, hy + 1, w, { color: T.textDim }); hx += textWidth(w) + 3; } hy += E.KBD_H + 2; };
    row([['RIGHT', 'point'], ['DRAG', 'menu']]);
    row([['F', 'pin'], ['1-7', 'react']]);
    drawText(img, ix + 1, hy, 'Click your pin: remove', { color: T.textDim });
  }
  return r;
}

// ------------------------------------------------------------------------------------------------ pin colour picker
/** Automatic pin colour: seat n -> PIN_COLORS[(n - 1) % 8]; a string id -> an FNV-1a hash; `taken` (Set) skips used colours. */
export function autoPinColor(who, { taken = null } = {}) {
  let i;
  if (typeof who === 'number' && Number.isFinite(who)) i = (((Math.round(who) - 1) % 8) + 8) % 8;
  else { let h = 2166136261; for (const ch of String(who ?? '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } i = h % 8; }
  if (taken) for (let k = 0; k < 8; k++) { const c = PIN_COLORS[(i + k) % 8]; if (!taken.has(c)) return c; }
  return PIN_COLORS[i];
}
export const PIN_PICKER = { cellW: 9, cellH: 11, autoLabel: 'AUTO' };
const autoW = () => textWidth(PIN_PICKER.autoLabel, 'tiny') + 6;
/** Width of the AUTO chip + 8 dot cells (the picker's content row). */
export const pinCellsWidth = () => autoW() + 2 + PIN_PICKER.cellW * PIN_COLORS.length;
/**
 * AUTO + 8 colour dots at (x, y), PIN_PICKER.cellH tall. o = { color (current), auto (true: following the automatic
 * colour), autoColor (what auto resolves to: marked by a gold underline while auto), hover: 'color:auto'|'color:<c>' }.
 */
export function drawPinCells(img, x, y, T, { color = 'crimson', auto = false, autoColor = null, hover = null } = {}) {
  const r = {}, H = PIN_PICKER.cellH, aw = autoW();
  const aSt = auto ? CELL_ON : hover === 'color:auto' ? CELL_HOVER : null;
  if (aSt) drawBox(img, x, y, aw, H, aSt, T);
  drawText(img, x + Math.floor(aw / 2), y + 3, PIN_PICKER.autoLabel, { font: 'tiny', align: 'center', color: auto ? T.goldHi : hover === 'color:auto' ? T.text : T.textDim });
  r['color:auto'] = { x, y, w: aw, h: H };
  const dx0 = x + aw + 2;
  PIN_COLORS.forEach((c, i) => {
    const cx = dx0 + i * PIN_PICKER.cellW, k = `color:${c}`;
    const st = !auto && c === color ? CELL_ON : hover === k ? CELL_HOVER : null;
    if (st) drawBox(img, cx, y, PIN_PICKER.cellW, H, st, T);
    img.blit(E.dockDot(c, T), cx + 1, y + 2);
    if (auto && c === (autoColor ?? color)) underline(img, cx + 3, y + 9, 3, T.gold);
    r[k] = { x: cx, y, w: PIN_PICKER.cellW, h: H };
  });
  return r;
}
/** Size of the picker popover. */
export const pinPickerSize = () => ({ w: pinCellsWidth() + 8, h: PIN_PICKER.cellH + 8 });
/**
 * The compact pin-colour popover (tooltip frame, AUTO + 8 dots, a tail down to the dock's colour button at tailX).
 * Opened from the dock's `pinColor` rect (or anywhere the demo likes). Returns the hit rects ('color:auto' /
 * 'color:<c>') + {w, h}.
 */
export function drawPinPicker(img, x, y, T, o = {}) {
  const { w, h } = pinPickerSize();
  drawBox(img, x, y, w, h, 'tooltip', T);
  const r = drawPinCells(img, x + 4, y + 4, T, o);
  if (o.tailX != null) {   // the tooltip tail (art.js drawHint's), pointing down
    const tx = Math.max(x + 4, Math.min(x + w - 5, o.tailX)), b = y + h - 1;
    img.rect(tx - 1, b - 1, 3, 2, T.ink); img.set(tx - 2, b, T.goldSh); img.set(tx + 2, b, T.goldSh);
    img.set(tx - 1, b + 1, T.goldSh); img.set(tx, b + 1, T.ink); img.set(tx + 1, b + 1, T.goldSh); img.set(tx, b + 2, T.goldSh);
    img.set(tx - 3, b, T.outline); img.set(tx + 3, b, T.outline); img.set(tx - 2, b + 1, T.outline); img.set(tx + 2, b + 1, T.outline);
    img.set(tx - 1, b + 2, T.outline); img.set(tx + 1, b + 2, T.outline); img.set(tx, b + 3, T.outline);
  }
  return { ...r, w, h };
}
/** Where to open the picker over the dock: right-aligned with the dock, 3 px above it, tail on the colour button. */
export function pinPickerAt(dockX, dockY, rects) {
  const { w, h } = pinPickerSize(), b = rects.pinColor;
  return { x: dockX + EMOTE_DOCK.w - w, y: dockY - h - 4, tailX: b.x + Math.floor(b.w / 2) };
}
/** A settings-panel row: 'Pin colour' + AUTO + 8 dots (no frame). Returns the hit rects + {w, h}. */
export function drawPinColorRow(img, x, y, T, o = {}) {
  const label = o.label ?? 'Pin colour', lw = textWidth(label);
  drawText(img, x, y + 3, label, { color: T.text });
  const r = drawPinCells(img, x + lw + 6, y, T, o);
  return { ...r, w: lw + 6 + pinCellsWidth(), h: PIN_PICKER.cellH };
}
