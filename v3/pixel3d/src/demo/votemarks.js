// (B) The VOTE MARKS (pass B; docs/DEMO.md §4.9 "vote marks"): every voter's vote state, unmistakable in the vote
// camera, day and night, animated in the town's gothic-cozy pixel style (stepped drawings on the 30 Hz grid, pure
// functions of the demo clock, no lights, no new shader programs: drawn into the game UI's pixel layers, gameui.layers).
// The user: "whether a character is voting or not also needs to be extremely obvious - and whether their vote
// registered"; "do this with on-theme animations / effects".
//
// THE RULE (Blood on the Clocktower): the clock hand sweeps the circle seat by seat from the nominee; a vote COUNTS when
// the hand reaches a voter whose hand is up. Voters raise their hands as the vote opens (gameui's events vote: raise
// times; seatcast.js: the 3D 'vote' clip at the same moment), so the pending state is readable for the whole sweep.
// Per seat: a SEAT RING round the feet (ground tier: the figure hides its back half), a VOTE CANDLE on a brass dish in
// front of the feet, a mark above the name:
//   (1) waiting       no ring; the candle UNLIT (pale wax, black wick); nothing above the name
//   (2) voting        the candle FLARES ALIGHT (2-drawing flare + thrown sparks) and burns in a warm dithered glow
//                     (3-drawing flicker); a flickering ember-orange ring; the parchment hand pops up above the name and
//                     bobs (the events group's hand_raised)
//   (3) COUNTED       the hand reaches them with the hand up: a brass CHIME RING pulses out (3 rings, 15 fps), a WAX
//                     SEAL STAMPS above the name (lands at 2x, settles, the lock sparks), candle-gold sparks fall from the
//                     seal to the candle; then: a gold candle with a tall white-gold flame in a gold halo, the red seal on
//                     its wax, a thick gold ring round the feet, the seal over the name - until the vote ends
//   (4) passed, NO    the hand reaches them with the hand down: the candle GUTTERS (3 drawings), a curl of smoke rises
//                     (5 drawings), a dark burnt stub with a smoke thread stays; a thin dark iron ring
//   (5) ghosts        a dead player's ONE ghost vote: a pale candle with a blue spirit flame swaying in a pale glow + a
//                     shimmering dotted pale ring; the ghost hand when raised; counted = a pale-blue wax seal, then the
//                     spirit flame snuffs into a pale curl of smoke (spent). Spent / unavailable: a cracked grey stub
// The current voter: the gold pulse ring + the clock hand drawn on the ground from the staging's hub (the court has no
// 3D dais hand; on the stones the dais' own brass hand sweeps). The TALLY PLAQUE (screen, bottom centre above the
// action bar): "VOTES CAST 5 / 7 NEEDED 2 MORE", the number flips (2-drawing flap) on each count; the THRESHOLD: the
// tower bell swings (time.ringBell), a ripple of gold runs round the counted seats, the plaque flips to gold "ON THE
// BLOCK". The gather puffs (votestage.js): the Storyteller's poof at the stone and at the vote spot.
//
// DENSITY D=2 (docs/UI.md §2.10, the game UI's HD tiers; the rest of the UI is D=2 since pass B): when the game UI's
// layers carry L.hd at art density 2 every mark is drawn at 2 UI px per scene texel, with its OWN HD art (not 2x2
// blocks): candles / dishes / flames / glows / smoke / rings / seals / snuffers / hands / sparks re-rasterised on the HD
// grid (rounder ellipses and flames, 1-px lines and light bands, a finer glow dither, 1-px spark arms; the hands and the
// snuffer EPX'd + re-lit like the wave-2 glove) at the SAME on-screen size as the 1x art (k = HD px per texel: 2 at
// 720p; 4/3 of the 1x size at 1080p 'round', as every HD HUD piece). Tiers: the candles / hands / seals / sparks on
// L.hd.world, the rings / the pulse / the court's clock hand as ground decals on the HD depth tier (putGroundHD: hidden
// under the figures like L.ground), the puffs through worldLayerHD (the events group's HD poof), the tally plaque
// through the screen tier's density view (D=2 frame + the D=2 faces) on L.hd.screen. ?uidensity=1 = the 1x art.
//   createVoteMarks(demo) -> marks { info(), states(t), topOf(seat), update(), dispose() }
import * as THREE from 'three';
import * as EV from '../ui/events/draw.js';
import * as A from '../ui/events/art.js';
import { PixelImage, frameAt, dissolve, drawText, textWidth, drawBox, GRID_HZ, hdPiece } from '../ui/kit.js';
import { epx, shadeGrid } from '../ui/hd/emotes.js';
import { putGroundHD } from '../ui/markers/hd.js';
import { worldLayerHD } from '../ui/hd/wave2.js';
import { GATHER_STAGGER } from './votestage.js';

const N = 15;
const gk = (dt) => Math.floor(dt * GRID_HZ + 1e-6);          // whole grid frames since an event
const WAX = { hi: '#D8705E', mid: '#B03A3A', sh: '#7A2430', line: '#3A1418' };
const GWAX = { hi: '#E6F2F8', mid: '#9FC4D6', sh: '#6A8EA6', line: '#2C4050' };
const SMOKE = { hi: '#C9C0DA', mid: '#9C8EBE', sh: '#6E6390' };
const TOKEN = { w: 21, h: 44, ax: 10, ay: 41 };              // the candle frame; anchor = the dish centre on the ground
const SMOKE_UP = 14;                                         // the smoke frame reaches this many px above the candle frame
const T_FLARE = 4, T_SPARKS = 12, T_GUTTER = 9, T_SMOKE = 20, T_SNUFF = 10;   // grid frames
export const KINDS = ['waiting', 'raised', 'counted', 'passed', 'ghost', 'ghost-raised', 'ghost-counted', 'ghost-passed', 'spent'];

/** (perf) blit a cached sprite straight into a layer's bytes (PixelImage.blit allocates an array per pixel): opaque
 *  texels replace, partial alpha composites through set(); marks the runtime layer's dirty bands (gameui's fastBlit) */
function fastBlit(dst, src, x, y) {
  x |= 0; y |= 0;
  const W = dst.w, H = dst.h, sw = src.w, sd = src.data, dd = dst.data;
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + sw), y1 = Math.min(H, y + src.h);
  if (x1 <= x0 || y1 <= y0) return;
  for (let yy = y0; yy < y1; yy++) {
    let si = ((yy - y) * sw + (x0 - x)) * 4, di = (yy * W + x0) * 4;
    for (let xx = x0; xx < x1; xx++, si += 4, di += 4) {
      const a = sd[si + 3];
      if (!a) continue;
      if (a === 255 || !dd[di + 3]) { dd[di] = sd[si]; dd[di + 1] = sd[si + 1]; dd[di + 2] = sd[si + 2]; dd[di + 3] = a; }
      else dst.set(xx, yy, [sd[si], sd[si + 1], sd[si + 2], a]);
    }
  }
  dst.mark?.(x0, y0, x1 - 1, y1 - 1);
}

// ------------------------------------------------------------------------------------------------ art (cached per T)
const cache = new Map();
const memo = (k, fn) => { let v = cache.get(k); if (!v) { v = fn(); cache.set(k, v); if (cache.size > 900) cache.delete(cache.keys().next().value); } return v; };
const ghostLine = (T) => A.rampOf(T.ghostSh, { line: 0.3 }).line;

/** A dithered (checker) glow disc: the pixel-art read of light round a flame (no real light, no blending) */
function glowDisc(img, cx, cy, rx, ry, c, inner = null) {
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
    if (d > 1 || img.alpha(x, y)) continue;
    if (inner && d < 0.3) img.set(x, y, inner);
    else if ((x + y) % 2 === 0) img.set(x, y, c);
  }
}
/** A flame from its base (cx, baseY) up `h` rows, half width `hw`, the tip swaying `sway` px; pal {out, mid, core, line};
 *  coreW 2 = the HD flame's 2-px core (the 1x flame keeps its 1-px core) */
function flame(img, cx, baseY, h, hw, sway, pal, coreW = 1) {
  const f = new PixelImage(img.w, img.h);
  for (let j = 0; j < h; j++) {
    const u = (j + 0.6) / (h + 0.6), w = Math.max(0.5, hw * Math.pow(Math.sin(Math.PI * Math.min(0.92, 0.25 + u * 0.75)), 0.8) * (1 - u * 0.55));
    const xo = Math.round(sway * u * u), y = baseY - j;
    const x0 = Math.round(cx + xo - w), x1 = Math.round(cx + xo + w) - 1;
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) f.set(x, y, x === x0 || x === x1 ? pal.out : pal.mid);
    if (j < h * 0.6 && x1 - x0 >= 2) { f.set(Math.round(cx + xo), y, pal.core); if (coreW > 1 && x1 - x0 >= 4) f.set(Math.round(cx + xo) - 1, y, pal.core); }
  }
  f.outline(pal.line);
  img.blit(f, 0, 0);
}
const WARM = (T) => ({ out: T.warn, mid: T.gold, core: T.goldHi, line: T.goldLine });
const GOLDF = (T) => ({ out: T.gold, mid: T.goldHi, core: '#FFFFFF', line: T.goldLine });
const GHOSTF = (T) => ({ out: T.ghostSh, mid: T.ghost, core: '#FFFFFF', line: ghostLine(T) });
/** dish / wax materials of a candle kind (shared by the 1x and the HD art) */
function candleMats(kind, k, T) {
  const cold = kind === 'cold' || (kind === 'gutter' && k >= 2);
  const stub = kind === 'cold' || kind === 'ghostcold';
  const D = stub || cold ? { hi: T.ironHi, mid: T.iron, sh: T.ironSh, line: T.outline }
    : kind === 'gold' ? { hi: '#FFFFFF', mid: T.goldHi, sh: T.gold, line: T.goldLine } : { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine };
  const W = kind === 'gold' ? { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine }
    : kind === 'ghost' ? { hi: '#EEF6F9', mid: T.ghost, sh: T.ghostSh, line: ghostLine(T) }
    : kind === 'ghostcold' ? { hi: T.ghostSh, mid: T.iron, sh: T.ironSh, line: T.outline }
    : cold ? { hi: T.iron, mid: T.ironSh, sh: T.outline, line: T.outline }
    : kind === 'unlit' ? { hi: T.parchment, mid: T.parchmentSh, sh: A.rampOf(T.parchmentSh).sh, line: A.rampOf(T.parchment, { line: 0.58 }).line }
    : { hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh, line: A.rampOf(T.parchment, { line: 0.58 }).line };
  const lit = kind === 'lit' || kind === 'flare' || kind === 'gold' || (kind === 'gutter' && k < 2);
  return { cold, stub, D, W, lit };
}

/** The vote candle: kind 'unlit' | 'lit' | 'flare' | 'gold' | 'gutter' | 'cold' | 'ghost' | 'ghostcold'; k = drawing.
 *  21 x 44 frame, anchor (10, 41) = the dish centre on the ground. */
function token(kind, k, T) {
  return memo(`tok|${kind}|${k}|${T.gold}`, () => {
    const img = new PixelImage(TOKEN.w, TOKEN.h);
    const { cold, stub, D, W, lit } = candleMats(kind, k, T);
    const top = stub ? 32 : 24, cx = 10.5;                          // the wax top (a burnt-down stub when spent)
    // the glow behind the flame first
    const glow = new PixelImage(TOKEN.w, TOKEN.h);
    if (kind === 'lit' || kind === 'flare') glowDisc(glow, cx, top - 7, 9.5, 11, T.warn);
    if (kind === 'gold') glowDisc(glow, cx, top - 8, 10.4, 12.5, T.gold, null);
    if (kind === 'ghost') glowDisc(glow, cx, top - 7, 8.5, 10, T.ghost);
    // the dish: brass (bright once counted), iron when spent / passed
    const dish = new PixelImage(TOKEN.w, TOKEN.h);
    dish.ellipse(cx, 40.5, 9.4, 3.1, D.mid);
    for (let x = 0; x < TOKEN.w; x++) for (let y = 36; y < 44; y++) {
      if (!dish.alpha(x, y)) continue;
      if (!dish.alpha(x, y - 1)) dish.set(x, y, D.hi); else if (!dish.alpha(x, y + 1)) dish.set(x, y, D.sh);
    }
    dish.outline(D.line);
    // the wax
    const body = new PixelImage(TOKEN.w, TOKEN.h);
    body.rect(7, top, 7, 39 - top, W.mid);
    for (let y = top; y < 39; y++) { body.set(7, y, W.hi); body.set(8, y, W.hi); body.set(13, y, W.sh); }
    if (!stub && !cold) { body.set(6, top + 2, W.hi); body.set(6, top + 3, W.hi); body.set(6, top + 4, W.hi); body.set(14, top + 1, W.sh); }   // wax drips
    if (stub) { body.set(9, top, W.sh); body.set(11, top, W.sh); }                                       // the melted rim
    body.outline(W.line);
    img.blit(glow, 0, 0); img.blit(dish, 0, 0); img.blit(body, 0, 0);
    if (kind === 'ghostcold') for (const [x, y] of [[10, top + 1], [11, top + 2], [10, top + 3], [11, top + 4]]) img.set(x, y, T.outline);   // the crack
    if (kind === 'gold') {                                                 // the counted vote's seal pressed on the wax
      const s = new PixelImage(TOKEN.w, TOKEN.h);
      s.disc(10.5, 31.5, 3.1, WAX.mid); s.set(9, 30, WAX.hi); s.set(10, 30, WAX.hi); s.set(10, 31, T.goldHi); s.set(11, 31, T.goldHi); s.set(10, 32, T.gold); s.set(12, 33, WAX.sh);
      s.outline(WAX.line);
      img.blit(s, 0, 0);
    }
    // the wick
    img.set(10, top - 1, T.outline); img.set(10, top - 2, lit ? T.goldLine : T.outline);
    // the flame
    if (kind === 'lit') flame(img, 10.5, top - 2, 9, 2.3, [-1, 0, 1][k], WARM(T));
    if (kind === 'flare') { flame(img, 10.5, top - 2, k ? 13 : 16, k ? 3.2 : 3.8, k ? 1 : 0, { ...WARM(T), core: '#FFFFFF' }); }
    if (kind === 'gold') flame(img, 10.5, top - 2, 13, 3.2, k ? 1 : 0, GOLDF(T));
    if (kind === 'gutter') { if (k === 0) flame(img, 10.5, top - 2, 5, 1.6, 0, WARM(T)); if (k === 1) flame(img, 10.5, top - 2, 3, 1.1, 1, WARM(T)); if (k === 2) img.set(10, top - 2, T.danger); }
    if (kind === 'ghost') flame(img, 10.5, top - 3, 11, 2.4, k ? 2 : -2, GHOSTF(T));
    if (kind === 'gold') { const h = new PixelImage(TOKEN.w, TOKEN.h); h.ring(cx, top - 8, 8.6 + (k ? 0.6 : 0), 10.5 + (k ? 0.6 : 0), T.goldHi); img.blit(h, 0, 0); }
    if (kind === 'flare') for (const [x, y] of (k ? [[2, 10], [19, 9], [1, 18], [20, 17]] : [[4, 11], [17, 10], [3, 17], [18, 16], [10, 3]])) A.spark(img, x, y, k ? 0 : 1, { core: T.goldHi, arm: T.gold, tip: T.goldSh });
    if (kind === 'cold') for (const [x, y, c] of [[10, top - 3, SMOKE.mid], [11, top - 4, SMOKE.mid], [11, top - 5, SMOKE.hi], [10, top - 6, SMOKE.mid], [10, top - 7, SMOKE.hi]]) img.set(x, y, c);   // the snuffed wick's thread
    return img;
  });
}
/** A curl of smoke rising from a snuffed wick (5 drawings, 10 fps; ghost = pale blue): token-sized frame, same anchor */
const SMOKE_PUFFS = (b) => [[[10, b, 2.0]], [[10, b - 2, 2.4], [11, b - 7, 2.0]], [[11, b - 4, 2.8], [12, b - 10, 2.4], [10, b - 15, 1.8]],
  [[10, b - 8, 3.0], [12, b - 14, 2.8], [10, b - 20, 2.2]], [[11, b - 13, 3.2], [9, b - 20, 2.6], [11, b - 26, 1.8]]];
function smoke(k, T, ghost = false, stubTop = 32) {
  return memo(`smoke|${k}|${ghost}|${stubTop}|${T.gold}`, () => {
    // SMOKE_UP rows taller than the candle frame (the curl rises above it): blit at the candle's anchor - SMOKE_UP
    const img = new PixelImage(TOKEN.w, TOKEN.h + SMOKE_UP);
    const S = ghost ? { hi: '#EEF6F9', mid: T.ghost, sh: T.ghostSh, line: ghostLine(T) } : { ...SMOKE, line: '#4E4668' };
    const b = stubTop - 4 + SMOKE_UP;
    // a curl: puffs leave the wick, swell and drift up-right then back left as they rise (the curl), then thin out
    for (const [x, y, r] of SMOKE_PUFFS(b)[k]) img.disc(x + 0.5, y + 0.5, r, S.mid);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < TOKEN.w; x++) {
      if (!img.alpha(x, y)) continue;
      if (!img.alpha(x - 1, y) || !img.alpha(x, y - 1)) img.set(x, y, S.hi);
      else if (!img.alpha(x + 1, y) || !img.alpha(x, y + 1)) img.set(x, y, S.sh);
    }
    img.outline(S.line);
    return k >= 3 ? dissolve(img, k === 3 ? 0.25 : 0.5) : img;
  });
}
/** The ring round a seat's feet (rx, ry px): 'raised' ember (k flicker), 'counted' thick gold, 'passed' thin iron,
 *  'ghost' dotted pale (k shimmer), 'chime' k = 0..2 an expanding bright ring (the count) */
function seatRing(kind, k, rx, ry, T) {
  return memo(`ring|${kind}|${k}|${rx}|${ry}|${T.gold}`, () => {
    const R = Math.ceil(rx) + 6, Rv = Math.ceil(ry) + 5;
    const img = new PixelImage(2 * R + 1, 2 * Rv + 1);
    const cx = R + 0.5, cy = Rv + 0.5;
    if (kind === 'raised') A.annulus(img, cx, cy, rx + (k ? 0.5 : 0), ry + (k ? 0.5 : 0), { hi: T.goldHi, mid: T.warn, sh: T.goldSh, line: T.goldLine }, { tx: 2, ty: 1 });
    if (kind === 'counted') {
      A.annulus(img, cx, cy, rx + 1, ry + 1, { hi: '#FFFFFF', mid: T.goldHi, sh: T.gold, line: T.goldLine }, { tx: 3, ty: 2 });
      const m = new PixelImage(img.w, img.h); m.ring(cx, cy, rx - 4, ry - 2.5, T.gold); img.blit(m, 0, 0);
    }
    if (kind === 'passed') A.annulus(img, cx, cy, rx, ry, { hi: T.iron, mid: T.ironSh, sh: T.outline, line: T.outline }, { tx: 1, ty: 1, line: false });
    if (kind === 'ghost') {
      A.annulus(img, cx, cy, rx, ry, { hi: '#EEF6F9', mid: T.ghost, sh: T.ghostSh, line: ghostLine(T) }, { tx: 2, ty: 1 });
      for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (((x >> 1) + k) % 3 === 0) img.erase(x, y);
    }
    if (kind === 'chime') {
      const s = 1 + 0.22 * (k + 1);
      const o = new PixelImage(2 * (R + 12) + 1, 2 * (Rv + 6) + 1);
      o.ring(R + 12.5, Rv + 6.5, rx * s, ry * s, k === 0 ? '#FFFFFF' : k === 1 ? T.goldHi : T.gold);
      o.ring(R + 12.5, Rv + 6.5, rx * s - 1, ry * s - 0.5, k === 2 ? T.goldSh : T.gold);
      if (k === 2) for (let x = 0; x < o.w; x += 2) for (let y = 0; y < o.h; y++) o.erase(x, y);
      o.outline(T.goldLine);
      return o;
    }
    return img;
  });
}
const ringOff = (im) => ({ x: (im.w - 1) >> 1, y: (im.h - 1) >> 1 });
/** The wax seal of a counted vote (15 x 15): a red (ghost: pale-blue) wax disc with a rough rim and a gold hand. */
function seal(T, ghost = false) {
  return memo(`seal|${ghost}|${T.gold}`, () => {
    const W = ghost ? GWAX : WAX;
    const m = new PixelImage(13, 13);
    m.disc(6.5, 6.5, 5.6, W.mid);
    for (const [x, y] of [[6, 0], [0, 6], [12, 6], [6, 12], [2, 1], [10, 2], [1, 10], [11, 10]]) m.set(x, y, W.mid);   // the rough rim
    const o = new PixelImage(13, 13);
    for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
      if (!m.alpha(x, y)) continue;
      const dx = x - 6, dy = y - 6, d = Math.hypot(dx, dy);
      o.set(x, y, d > 3.6 && d < 4.6 ? W.sh : (dx + dy < -5 ? W.hi : dx + dy > 6 ? W.sh : W.mid));
    }
    // the gold hand pressed in the middle
    const hand = ['.#.#.', '.#.#.', '#####', '#####', '.###.'];
    hand.forEach((r, j) => { for (let i = 0; i < 5; i++) if (r[i] === '#') o.set(4 + i, 4 + j, j === 0 ? T.goldHi : T.gold); });
    o.outline(W.line);
    const f = new PixelImage(15, 15);
    f.blit(o, 1, 1);
    return f;
  });
}
/** The candle SNUFFER over the name of a seat the hand passed without a vote (11 x 13): an iron cone on a crooked
 *  stem; k = 1 is the snuff stroke (the cone 1 px lower, a puff under its lip) */
function snuffer(k, T) {
  return memo(`snuff|${k}|${T.gold}`, () => {
    const m = new PixelImage(11, 13);
    const cone = ['...#...', '..###..', '..###..', '.#####.', '#######'];
    cone.forEach((r, j) => { for (let i = 0; i < 7; i++) if (r[i] === '#') m.set(1 + i, 6 + j + k, T.iron); });
    for (const [x, y] of [[5, 5], [6, 4], [7, 3], [8, 2], [9, 1]]) m.set(x, y + k, T.ironHi);   // the stem
    for (let x = 0; x < 11; x++) for (let y = 0; y < 13; y++) if (m.alpha(x, y) && !m.alpha(x - 1, y) && y > 5) m.set(x, y, T.ironHi);
    m.outline(T.outline);
    if (k) { m.set(2, 12, SMOKE.mid); m.set(8, 12, SMOKE.mid); m.set(1, 11, SMOKE.hi); m.set(9, 11, SMOKE.hi); }
    return m;
  });
}
const handFrame = (name, T) => memo(`hand|${name}|${T.gold}`, () => (name === 'pop' ? A.handPop(T) : name === 'r0' ? A.handRaised(0, T) : name === 'r1' ? A.handRaised(1, T) : name === 'ghost' ? A.handGhost(T) : A.handLocked(T)));
const lockFrame = (k, T) => memo(`lock|${k}|${T.gold}`, () => A.handLock(k, T));
const pulseFrame = (k, T) => memo(`pulse|${k}|${T.gold}`, () => A.votePulse(k, T));

// ------------------------------------------------------------------------------------------------ HD art (D=2)
// Every HD sprite is EXACTLY 2x its 1x frame, anchors x 2 (TOKEN.ax * 2 ...), drawn on the HD grid (1-px lines, 1-px
// light bands, rounder curves): never the 1x sprite block-scaled.
/** A 1x spark (r 0..3) on the HD grid at HD (x, y): r 0 = a 2x2 mote, r >= 1 = a 1-px plus with arms 2r (as hd/events.js) */
function sparkHD(img, x, y, r, S) {
  x |= 0; y |= 0;
  if (r <= 0) { img.rect(x, y, 2, 2, S.arm); img.set(x, y, S.core); return; }
  A.spark(img, x, y, 2 * r, S);
  if (r >= 2) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) img.set(x + dx, y + dy, S.arm);
}
/** The vote candle at D=2: 42 x 88, anchor (20, 82) */
function tokenHD(kind, k, T) {
  return memo(`tokHD|${kind}|${k}|${T.gold}`, () => {
    const Wd = TOKEN.w * 2, Hd = TOKEN.h * 2, img = new PixelImage(Wd, Hd);
    const { cold, stub, D, W, lit } = candleMats(kind, k, T);
    const top = stub ? 64 : 48, cx = 21, bot = 78;
    const glow = new PixelImage(Wd, Hd);
    if (kind === 'lit' || kind === 'flare') glowDisc(glow, cx, top - 14, 19, 22, T.warn);
    if (kind === 'gold') glowDisc(glow, cx, top - 16, 20.8, 25, T.gold);
    if (kind === 'ghost') glowDisc(glow, cx, top - 14, 17, 20, T.ghost);
    // the dish: a rounder ellipse, a 1-px lit rim on top, a 2-px shade along its foot, the bowl's inner lip
    const dish = new PixelImage(Wd, Hd);
    dish.ellipse(cx, 81, 18.8, 6.2, D.mid);
    for (let x = 0; x < Wd; x++) for (let y = 70; y < Hd; y++) {
      if (!dish.alpha(x, y)) continue;
      if (!dish.alpha(x, y - 1)) dish.set(x, y, D.hi); else if (!dish.alpha(x, y + 1) || !dish.alpha(x, y + 2)) dish.set(x, y, D.sh);
    }
    const lip = new PixelImage(Wd, Hd); lip.ring(cx, 80.5, 13.5, 3.6, D.sh);
    for (let y = 81; y < Hd; y++) for (let x = 0; x < Wd; x++) lip.erase(x, y);   // the far half only (the near rim hides it)
    dish.blit(lip, 0, 0);
    dish.outline(D.line);
    // the wax: a 3-px lit side, a 2-px shade side, a lit rim with the melt pool under it, rounded drips
    const body = new PixelImage(Wd, Hd);
    body.rect(14, top, 14, bot - top, W.mid);
    for (let y = top; y < bot; y++) { body.set(14, y, W.hi); body.set(15, y, W.hi); body.set(16, y, W.hi); body.set(26, y, W.sh); body.set(27, y, W.sh); }
    for (let x = 15; x < 27; x++) body.set(x, top, W.hi);
    if (!stub && !cold) {
      for (let x = 18; x < 25; x++) body.set(x, top + 1, W.sh);                       // the melt pool round the wick
      body.rect(12, top + 4, 2, 6, W.hi); body.set(13, top + 10, W.hi);              // wax drips
      body.rect(28, top + 2, 1, 4, W.sh); body.set(28, top + 6, W.sh);
    }
    if (stub) { body.set(18, top, W.sh); body.set(19, top + 1, W.sh); body.set(23, top, W.sh); body.set(24, top + 1, W.sh); }   // the melted rim
    body.outline(W.line);
    img.blit(glow, 0, 0); img.blit(dish, 0, 0); img.blit(body, 0, 0);
    if (kind === 'ghostcold') for (const [x, y] of [[20, top + 2], [21, top + 3], [22, top + 4], [21, top + 5], [20, top + 6], [21, top + 7], [22, top + 8]]) img.set(x, y, T.outline);   // the crack
    if (kind === 'gold') {                                                 // the counted vote's seal pressed on the wax
      const s = new PixelImage(Wd, Hd);
      s.disc(21, 63, 6.2, WAX.mid);
      for (let y = 55; y < 72; y++) for (let x = 13; x < 30; x++) {
        if (!s.alpha(x, y)) continue;
        const v = x + 0.5 - 21 + y + 0.5 - 63;
        if (v < -4.5) s.set(x, y, WAX.hi); else if (v > 5) s.set(x, y, WAX.sh);
      }
      for (const [x, y] of [[20, 61], [22, 61], [20, 62], [21, 62], [22, 62], [20, 63], [21, 63], [22, 63], [21, 64]]) s.set(x, y, y === 61 ? T.goldHi : T.gold);
      s.outline(WAX.line);
      img.blit(s, 0, 0);
    }
    // the wick: 2 px at its foot, 1 px above (a finer stroke than the 1x 1-texel wick)
    img.set(20, top - 1, T.outline); img.set(21, top - 1, T.outline); img.set(20, top - 2, T.outline); img.set(20, top - 3, lit ? T.goldLine : T.outline);
    // the flame (re-rasterised at twice the rows and width: a smooth teardrop, a 2-px core)
    if (kind === 'lit') flame(img, 21, top - 4, 18, 4.6, [-2, 0, 2][k], WARM(T), 2);
    if (kind === 'flare') flame(img, 21, top - 4, k ? 26 : 32, k ? 6.4 : 7.6, k ? 2 : 0, { ...WARM(T), core: '#FFFFFF' }, 2);
    if (kind === 'gold') flame(img, 21, top - 4, 26, 6.4, k ? 2 : 0, GOLDF(T), 2);
    if (kind === 'gutter') {
      if (k === 0) flame(img, 21, top - 4, 10, 3.2, 0, WARM(T), 2);
      if (k === 1) flame(img, 21, top - 4, 6, 2.2, 2, WARM(T), 2);
      if (k === 2) { img.set(20, top - 4, T.danger); img.set(21, top - 4, T.warn); img.set(20, top - 5, T.danger); }   // the dying ember
    }
    if (kind === 'ghost') flame(img, 21, top - 6, 22, 4.8, k ? 4 : -4, GHOSTF(T), 2);
    if (kind === 'gold') { const h = new PixelImage(Wd, Hd); h.ring(cx, top - 16, 17.2 + (k ? 1.2 : 0), 21 + (k ? 1.2 : 0), T.goldHi); img.blit(h, 0, 0); }
    if (kind === 'flare') for (const [x, y] of (k ? [[2, 10], [19, 9], [1, 18], [20, 17]] : [[4, 11], [17, 10], [3, 17], [18, 16], [10, 3]])) sparkHD(img, x * 2, y * 2, k ? 0 : 1, { core: T.goldHi, arm: T.gold, tip: T.goldSh });
    if (kind === 'cold') for (const [x, y, c] of [[20, top - 6, SMOKE.mid], [21, top - 7, SMOKE.mid], [22, top - 8, SMOKE.hi], [22, top - 9, SMOKE.mid], [21, top - 10, SMOKE.hi], [20, top - 11, SMOKE.mid], [20, top - 12, SMOKE.hi], [21, top - 13, SMOKE.mid], [21, top - 14, SMOKE.hi]]) img.set(x, y, c);   // the snuffed wick's thread
    return img;
  });
}
/** The smoke curl at D=2 (42 x 116, the candle's anchor - 2 x SMOKE_UP): the same puffs at 2x radii, 1-px bands + line */
function smokeHD(k, T, ghost = false, stubTop = 32) {
  return memo(`smokeHD|${k}|${ghost}|${stubTop}|${T.gold}`, () => {
    const img = new PixelImage(TOKEN.w * 2, (TOKEN.h + SMOKE_UP) * 2);
    const S = ghost ? { hi: '#EEF6F9', mid: T.ghost, sh: T.ghostSh, line: ghostLine(T) } : { ...SMOKE, line: '#4E4668' };
    for (const [x, y, r] of SMOKE_PUFFS(stubTop - 4 + SMOKE_UP)[k]) img.disc((x + 0.5) * 2, (y + 0.5) * 2, r * 2, S.mid);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      if (!img.alpha(x, y)) continue;
      if (!img.alpha(x - 1, y) || !img.alpha(x, y - 1)) img.set(x, y, S.hi);
      else if (!img.alpha(x + 1, y) || !img.alpha(x, y + 1)) img.set(x, y, S.sh);
    }
    img.outline(S.line);
    return k >= 3 ? dissolve(img, k === 3 ? 0.25 : 0.5) : img;
  });
}
/** The seat ring at D=2 (rx, ry = HD px): the same kinds, finer bands (1-px line, 1-px light / shade), finer dashes */
function seatRingHD(kind, k, rx, ry, T) {
  return memo(`ringHD|${kind}|${k}|${rx}|${ry}|${T.gold}`, () => {
    const R = Math.ceil(rx) + 12, Rv = Math.ceil(ry) + 10;
    const img = new PixelImage(2 * R + 1, 2 * Rv + 1);
    const cx = R + 0.5, cy = Rv + 0.5;
    if (kind === 'raised') A.annulus(img, cx, cy, rx + (k ? 1 : 0), ry + (k ? 1 : 0), { hi: T.goldHi, mid: T.warn, sh: T.goldSh, line: T.goldLine }, { tx: 3, ty: 2 });
    if (kind === 'counted') {
      A.annulus(img, cx, cy, rx + 2, ry + 2, { hi: '#FFFFFF', mid: T.goldHi, sh: T.gold, line: T.goldLine }, { tx: 5, ty: 3 });
      const m = new PixelImage(img.w, img.h); m.ring(cx, cy, rx - 7, ry - 4.5, T.gold); m.ring(cx, cy, rx - 9, ry - 5.5, T.goldSh); img.blit(m, 0, 0);
    }
    if (kind === 'passed') A.annulus(img, cx, cy, rx, ry, { hi: T.iron, mid: T.ironSh, sh: T.outline, line: T.outline }, { tx: 2, ty: 1, line: false });
    if (kind === 'ghost') {
      A.annulus(img, cx, cy, rx, ry, { hi: '#EEF6F9', mid: T.ghost, sh: T.ghostSh, line: ghostLine(T) }, { tx: 3, ty: 2 });
      for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (((x >> 2) + k) % 3 === 0) img.erase(x, y);
    }
    if (kind === 'chime') {
      const s = 1 + 0.22 * (k + 1);
      const o = new PixelImage(2 * (R + 24) + 1, 2 * (Rv + 12) + 1);
      const ox = R + 24.5, oy = Rv + 12.5;
      o.ring(ox, oy, rx * s, ry * s, k === 0 ? '#FFFFFF' : k === 1 ? T.goldHi : T.gold);
      o.ring(ox, oy, rx * s - 1, ry * s - 0.6, k === 0 ? T.goldHi : T.gold);
      o.ring(ox, oy, rx * s - 2, ry * s - 1.2, k === 2 ? T.goldSh : T.gold);
      if (k === 2) for (let x = 0; x < o.w; x += 2) for (let y = 0; y < o.h; y++) o.erase(x, y);
      o.outline(T.goldLine);
      return o;
    }
    return img;
  });
}
/** The wax seal at D=2 (30 x 30): a round disc with a 1-px rim groove, a bumpy edge, lit upper-left, the gold hand EPX'd */
function sealHD(T, ghost = false) {
  return memo(`sealHD|${ghost}|${T.gold}`, () => {
    const W = ghost ? GWAX : WAX;
    const m = new PixelImage(26, 26);
    m.disc(13, 13, 11.2, W.mid);
    for (const [x, y] of [[6, 0], [0, 6], [12, 6], [6, 12], [2, 1], [10, 2], [1, 10], [11, 10]]) m.disc(x * 2 + 1, y * 2 + 1, 1.4, W.mid);   // the rough rim
    const o = new PixelImage(26, 26);
    for (let y = 0; y < 26; y++) for (let x = 0; x < 26; x++) {
      if (!m.alpha(x, y)) continue;
      const dx = x + 0.5 - 13, dy = y + 0.5 - 13, d = Math.hypot(dx, dy);
      o.set(x, y, d > 7.6 && d < 8.7 ? W.sh : (dx + dy < -10 ? W.hi : dx + dy > 12 ? W.sh : W.mid));
    }
    const hand = epx(['.#.#.', '.#.#.', '#####', '#####', '.###.']);
    hand.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') o.set(8 + i, 8 + j, j < 2 ? T.goldHi : i >= 8 || j >= 8 ? T.goldSh : T.gold); });
    o.outline(W.line);
    const f = new PixelImage(30, 30);
    f.blit(o, 2, 2);
    return f;
  });
}
/** The snuffer at D=2 (22 x 26): the 1x mask EPX'd (a smooth cone, a stepped crooked stem) and re-lit, 1-px line */
function snufferHD(k, T) {
  return memo(`snuffHD|${k}|${T.gold}`, () => {
    const g = Array.from({ length: 13 }, () => Array(11).fill('.'));
    ['...#...', '..###..', '..###..', '.#####.', '#######'].forEach((r, j) => { for (let i = 0; i < 7; i++) if (r[i] === '#' && 6 + j + k < 13) g[6 + j + k][1 + i] = '#'; });
    for (const [x, y] of [[5, 5], [6, 4], [7, 3], [8, 2], [9, 1]]) g[y + k][x] = 's';
    const rows = epx(g.map((r) => r.join('')));
    const im = shadeGrid(rows, { '#': { hi: T.ironHi, mid: T.iron, sh: T.ironSh, line: T.outline }, s: { hi: T.ironHi, mid: T.ironHi, sh: T.iron, line: T.outline } }, { pad: 0, w: 22, h: 26, prefer: ['#', 's'] });
    if (k) for (const [x, y, c] of [[4, 24, SMOKE.mid], [16, 24, SMOKE.mid], [2, 22, SMOKE.hi], [18, 22, SMOKE.hi]]) { im.rect(x, y, 2, 1, c); im.set(x, y + 1, c); }
    return im;
  });
}
// the events group's hand grids (src/ui/events/art.js HAND / HAND_TILT / handPop: 8 x 11 in a 10 x 13 frame at (1, 1))
const HAND_ROWS = { r0: ['...#.#..', '.#.#.#..', '.#.#.#.#', '.#.#.#.#', '##.#.#.#', '########', '.#######', '..######', '..#####.', '..ccccc.', '..ccccc.'],
  r1: ['....#.#.', '..#.#.#.', '..#.#.#.', '.##.#.#.', '########', '.#######', '..######', '..######', '..#####.', '..ccccc.', '..ccccc.'],
  pop: ['', '', '', '', '..#.#.#.', '.#######', '.#######', '..######', '..#####.', '..ccccc.', '..ccccc.'] };
/** The raised / locked / ghost hand at D=2 (20 x 26, wrist at (8, 24)): the 1x grid EPX'd (rounder knuckles, 2-px
 *  fingers with 1-px lines between them) and re-lit with 1-px bands; materials as the events group's hands */
function handHD(name, T) {
  return memo(`handHD|${name}|${T.gold}`, () => {
    const rows = HAND_ROWS[name === 'pop' ? 'pop' : name === 'r1' ? 'r1' : 'r0'];
    const g = Array.from({ length: 13 }, (_, y) => Array.from({ length: 10 }, (_, x) => (rows[y - 1]?.[x - 1] ?? '.') || '.'));
    const line = name === 'ghost' ? A.rampOf(T.ghostSh, { line: 0.3 }).line : name === 'locked' ? T.goldLine : A.rampOf(T.parchment, { line: 0.58 }).line;
    const P = name === 'ghost' ? { hi: '#EEF6F9', mid: T.ghost, sh: T.ghostSh } : name === 'locked' ? { hi: T.goldHi, mid: T.gold, sh: T.goldSh } : { hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh };
    const C = name === 'locked' ? { hi: T.gold, mid: T.goldSh, sh: T.goldSh } : { hi: T.goldHi, mid: T.gold, sh: T.goldSh };
    return shadeGrid(epx(g.map((r) => r.join(''))), { '#': { ...P, line }, c: { ...C, line } }, { pad: 0, w: 20, h: 26, prefer: ['#', 'c'] });
  });
}
/** The lock flash at D=2 (38 x 32): the 1x spark layout at 2x positions, 1-px spark arms */
function lockHD(k, T) {
  return memo(`lockHD|${k}|${T.gold}`, () => {
    const img = new PixelImage(38, 32), G = { core: T.goldHi, arm: T.gold, tip: T.goldSh };
    const pts = [[[3, 3], [15, 3], [2, 10], [16, 10]], [[1, 1], [17, 1], [0, 9], [18, 9], [9, 0]], [[0, 0], [18, 0], [9, 0]]][k];
    pts.forEach(([x, y], i) => sparkHD(img, x * 2 + 1, y * 2 + 1, k === 0 ? 1 : k === 1 ? (i % 2 ? 2 : 1) : 0, G));
    return img;
  });
}
/** The current voter's pulse ring at D=2 (64 x 38, centre (32, 19)): a finer band (3 x 2 px) with a 1-px line */
function pulseHD(k, T) {
  return memo(`pulseHD|${k}|${T.gold}`, () => {
    const img = new PixelImage(64, 38);
    const rr = [[14, 7.5], [14.5, 8], [15, 8.5]][k];
    A.annulus(img, 32, 19, rr[0] * 2, rr[1] * 2, { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine }, { tx: 3, ty: 2 });
    return img;
  });
}
const DIRV = { right: [1, 0], 'down-right': [1, 1], down: [0, 1], 'down-left': [-1, 1], left: [-1, 0], 'up-left': [-1, -1], up: [0, -1], 'up-right': [1, -1] };
/** The clock hand's chevron tip at D=2 (14 x 14, centre (7, 7)) and its hub (14 x 10, centre (7, 5)) */
const tipHD = (dir, T) => memo(`htipHD|${dir}|${T.gold}`, () => {
  const m = new PixelImage(14, 14);
  const [vx, vy] = DIRV[dir], n = Math.hypot(vx, vy), ux = vx / n, uy = vy / n, px = -uy, py = ux;
  for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
    const dx = x + 0.5 - 7, dy = y + 0.5 - 7, a = dx * ux + dy * uy, b = Math.abs(dx * px + dy * py);
    if (a >= -3.2 && a <= 4.6 && b <= (4.6 - a) * 0.62 + 0.3) m.set(x, y, T.gold);
  }
  return A.shade(m, { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine });
});
const hubHD = (T) => memo(`hhubHD|${T.gold}`, () => {
  const img = new PixelImage(14, 10);
  img.ellipse(7, 5, 5.2, 3.2, T.gold);
  img.rect(6, 4, 2, 2, T.inkSunk); img.set(4, 2, T.goldHi); img.set(5, 2, T.goldHi); img.set(4, 3, T.goldHi);
  img.outline(T.goldLine);
  return img;
});
const DIRS8 = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
/** The court's clock hand on the ground at D=2 from (x0, y0) to (x1, y1) (HD px): a 2-px shaft + a 1-px shadow side,
 *  the HD tip + hub. -> { im, x, y } (top-left in HD px) */
function voteHandHD(x0, y0, x1, y1, T, night) {
  const minx = Math.min(x0, x1) - 12, miny = Math.min(y0, y1) - 12;
  const w = Math.abs(x1 - x0) + 25, h = Math.abs(y1 - y0) + 25;
  const s = new PixelImage(w, h);
  const ax = x0 - minx, ay = y0 - miny, bx = x1 - minx, by = y1 - miny;
  const steep = Math.abs(by - ay) > Math.abs(bx - ax);
  const H = A.handTones(T, night);
  const off = (q) => (steep ? [q, 0] : [0, q]);
  s.line(ax + off(2)[0], ay + off(2)[1], bx + off(2)[0], by + off(2)[1], H.side);
  s.line(ax + off(1)[0], ay + off(1)[1], bx + off(1)[0], by + off(1)[1], H.c);
  s.line(ax, ay, bx, by, H.c);
  const ang = Math.atan2(by - ay, bx - ax), d = DIRS8[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
  s.blit(tipHD(d, T), bx - 7, by - 7);
  s.blit(hubHD(T), ax - 7, ay - 5);
  return { im: s, x: minx, y: miny };
}

// ------------------------------------------------------------------------------------------------ the module
export function createVoteMarks(demo) {
  const { engine, store, events } = demo;
  const gameui = demo.gameui, L = gameui?.layers;
  if (!L?.add || typeof gameui.voteOf !== 'function') return null;
  const params = demo.params ?? new URLSearchParams();
  if (params.get('voteMarks') === '0') return null;
  const reduced = params.get('rm') === '1';
  const stage = () => demo.passB?.stage ?? null;
  const seats = () => demo.passB?.seats ?? null;
  const cam = engine.camera;
  const P = new THREE.Vector3();

  // the last vote (kept for the dissolve after the vote phase ends)
  let last = null;          // { v, V, endedAt, passedAt, rippleOrder, lastTally, flipAt }
  const info = { phase: null, seats: {}, tally: 0, needed: 0, passed: false, passedAt: null, bell: 0, current: null, plaque: null, hand: false, poofs: 0, drawn: 0, events: [], hd: null };
  const log = (e) => { info.events.push(e); if (info.events.length > 40) info.events.shift(); };
  const markTop = new Map();   // seat -> the top row (L.world texels) of the mark over its name, last frame (the pops stand above)

  /** clock (the events vote's clock, s) -> demo time (inverse of gameui's piecewise-linear voteClock) */
  const realOfClock = (V, c) => {
    const { reach, per } = V, n = reach.length;
    if (c < 0) return reach[0] + c;
    const i = Math.min(n - 1, Math.floor(c / per));
    if (i >= n - 1) return reach[n - 1] + (c - (n - 1) * per);
    return reach[i] + ((c - i * per) / per) * (reach[i + 1] - reach[i]);
  };
  /** every seat's state at demo time t (pure: from the events vote + the store) */
  function states(t) {
    const s = store.state, ph = s.phase, out = {};
    const V = gameui.voteOf(t);
    if (V && ph === 'vote') {
      if (!last || last.v !== V.v) last = { v: V.v, V, endedAt: null, passedAt: null, rippleOrder: null, lastTally: null, flipAt: null, bell: false };
      last.V = V;
      last.endedAt = null;
    } else if (last && last.endedAt === null) last.endedAt = t;
    const live = last && (last.endedAt === null || t - last.endedAt < 0.5) ? last : null;
    // after the vote phase: its final state, dissolving out
    const S = live ? EV.voteAt(live.v, live.endedAt === null ? live.V.clock : 1e9) : null;
    const PERF = EV.TIMING.vote;
    for (let i = 0; i < N; i++) {
      const st = s.seats[i];
      if (!(st.occupied || st.dead)) continue;
      const seat = i + 1, d = S?.seats?.[seat];
      const ghost = !!st.dead;
      const ghostVote = ghost && st.ghostVote !== false;
      let kind = ghost ? (ghostVote ? 'ghost' : 'spent') : 'waiting', since = 0;
      if (d && live) {
        const idx = live.v.order.indexOf(seat);
        const lockReal = realOfClock(live.V, idx * PERF.perVoterF / GRID_HZ + PERF.lockAtF / GRID_HZ);
        const raiseReal = live.v.raise[seat] != null ? realOfClock(live.V, live.v.raise[seat]) : null;
        if (d.yes) { kind = d.ghost ? 'ghost-counted' : 'counted'; since = t - lockReal; }
        else if (d.no) { kind = ghost ? (ghostVote ? 'ghost-passed' : 'spent') : 'passed'; since = t - lockReal; }
        else if (d.raised) { kind = d.ghost ? 'ghost-raised' : 'raised'; since = raiseReal != null ? t - raiseReal : 0; }
      }
      out[i] = { kind, since, ghost, current: S?.current === seat, nominee: live?.v?.nominee === seat };
    }
    return { seats: out, S, live };
  }

  // the staging's hub for the 2D clock hand (null on the stones: the dais' brass hand sweeps there)
  const hubOf = () => {
    const st = stage();
    if (!st || st.onStones || !st.active) return null;
    if (st.hub) return st.hub;
    let x = 0, z = 0;
    for (const p of st.spots) { x += p.x; z += p.z; }
    return new THREE.Vector3(x / N, 0, z / N + 1.6);
  };
  const towardCam = () => { const y = cam.yaw; return new THREE.Vector3(Math.sin(y), 0, Math.cos(y)); };
  const prevKind = new Map();

  const draw = (LL) => {
    const T = LL.tok, t = LL.t, ph = store.state.phase;
    // (D=2) the HD tiers when the game UI draws at art density 2 (else the 1x art on L.world / L.ground / L.screen)
    const HD = LL.hd && LL.hd.d > 1 ? LL.hd : null, dd = HD ? HD.d : 1, kk = HD ? HD.k : 1;
    const atW = (p) => (HD ? HD.at(p) : LL.at(p));                 // world point -> the tier's px (HD px | texels)
    const Wimg = HD ? HD.world : LL.world;
    info.drawn = 0; info.hd = HD ? { d: dd, k: +kk.toFixed(3) } : null;
    const sc = seats();
    // ---- the gather puffs (votestage.js): the Storyteller's poof on the stone and on the vote spot
    const stg = stage(), g = stg?.gather;
    info.poofs = 0;
    if (g && !stg.onStones && sc && !reduced) {
      const F = EV.framesFor(T), LP = HD ? worldLayerHD(LL) : LL;   // (HD: the events group's HD poof, logical px)
      for (let i = 0; i < N; i++) {
        const st = store.state.seats[i];
        if (!(st.occupied || st.dead)) continue;
        const k = gk(t - (g.t0 + i * GATHER_STAGGER));
        if (k < 0 || k >= 12) continue;
        const stone = demo.layout.seatPos(i, N), spot = stg.spots[i];
        for (const p of [[stone.x, 0.235, stone.z], [spot.x, spot.y ?? 0, spot.z]]) EV.drawPoof(LP, F, LP.at(P.set(...p)), k, { appear: true });
        info.poofs++;
      }
      // a seat taken while staged (the ceremony fills the circle one by one): it appears on its vote spot in a puff
      if (stg.active) for (let i = 0; i < N; i++) {
        const at = sc.spotOf(i);
        if (!at?.shown || !at.staged || at.shownAt == null) continue;
        const k = gk(t - at.shownAt);
        if (k >= 0 && k < 12) { EV.drawPoof(LP, F, LP.at(at.pos), k, { appear: true }); info.poofs++; }
      }
    }
    if (ph !== 'vote' && ph !== 'nomination' && !(last && last.endedAt !== null && t - last.endedAt < 0.5)) { info.phase = ph; info.seats = {}; markTop.clear(); return; }
    if (!sc) return;
    const { seats: S, S: VS, live } = states(t);
    info.phase = ph;
    const toCam = towardCam();
    const fade = live?.endedAt != null ? Math.min(0.75, Math.floor((t - live.endedAt) / 0.125) * 0.25) : 0;
    const blitF = (img, im, x, y, scale = 1) => {
      const q = fade > 0 ? dissolve(im.clone(), fade, x & 3, y & 3) : im;
      if (scale === 1) fastBlit(img, q, x, y); else img.blit(q, x, y, { scale });   // (the 2x stamp: 2 grid frames per count)
      info.drawn++;
    };
    /** a ground decal (the ring, the pulse, the clock hand): L.ground (1x) or the HD depth tier (hidden under figures) */
    const ground = (im, x, y, p, anchorRow) => {
      if (HD) putGroundHD(HD, im, x, y, p, { anchorRow, k: fade });
      else blitF(LL.ground, im, x, y);
      info.drawn++;
    };
    const tw = cam.texelWorld, sp = Math.sin(cam.pitch);
    const courtSize = !!stg && !stg.onStones;    // the staged court (1.35x cast): the full-size candles
    // ---- the clock hand on the ground (staged) + the pulse at the current voter
    const hub = hubOf();
    info.hand = false;
    if (VS && VS.current != null && !VS.done && live?.endedAt == null) {
      const i = VS.current - 1, at = sc.spotOf(i);
      if (at) {
        const f = atW(at.pos);
        const pk = reduced ? 1 : frameAt(t, A.FPS.vote_pulse, 3, { seq: [0, 1, 2, 1] });
        if (HD) ground(pulseHD(pk, T), f.x - 32, f.y - 19, at.pos, 19); else ground(pulseFrame(pk, T), f.x - 16, f.y - 9, at.pos, 9);
        if (hub) {
          // the hand from the hub to the voter's feet (it turns voter to voter in the events vote's stepped drawings)
          const from = live.v.order[Math.max(0, live.v.order.indexOf(VS.current) - 1)], a = sc.spotOf(from - 1)?.pos ?? at.pos;
          const u = reduced ? 1 : Math.min(1, VS.hand.u);
          const end = a.clone().lerp(at.pos, u).setY(0), dir = end.clone().sub(hub).setY(0), len = dir.length();
          const tip = hub.clone().addScaledVector(dir.normalize(), Math.max(0.4, len - 0.75 * at.scale));
          const h0 = atW(hub), h1 = atW(tip), night = T.labelLine === '#141325';
          if (HD) { const hh = voteHandHD(h0.x, h0.y, h1.x, h1.y, T, night); ground(hh.im, hh.x, hh.y, hub, h0.y - hh.y); }
          else A.drawVoteHand(LL.ground, h0.x, h0.y, h1.x, h1.y, T, { night });
          info.hand = true;
        }
      }
    }
    // ---- per seat (far first: nearer candles print over farther ones)
    const marks = {};
    const spots = {};
    for (const i of Object.keys(S)) spots[i] = sc.spotOf(Number(i));
    const order = Object.keys(S).map(Number).sort((a, b) => (spots[a]?.pos.z ?? 0) - (spots[b]?.pos.z ?? 0));
    markTop.clear();
    for (const i of order) {
      const m = S[i], at = spots[i];
      if (!at || !at.shown) continue;
      if (prevKind.get(i) !== m.kind) { if (prevKind.has(i)) log({ seat: i, kind: m.kind, t: +t.toFixed(2) }); prevKind.set(i, m.kind); }
      const k = gk(m.since);
      const ff = atW(at.pos);
      // the ring round the feet (size from the figure's scale and the camera: 0.55 m x the cast scale; HD: x k, so the
      // ring keeps its world size and gets the finer bands)
      const rx1 = Math.max(10, Math.round((0.55 * at.scale) / tw)), ry1 = Math.max(5, Math.round(rx1 * sp * 1.04));
      const rx = HD ? Math.round(rx1 * kk) : rx1, ry = HD ? Math.round(ry1 * kk) : ry1;
      const ringK = { raised: 'raised', 'ghost-raised': 'ghost', counted: 'counted', 'ghost-counted': 'counted', passed: 'passed', ghost: 'ghost', 'ghost-passed': 'ghost' }[m.kind];
      const ringOf = (kind, kq) => (HD ? seatRingHD(kind, kq, rx, ry, T) : seatRing(kind, kq, rx, ry, T));
      if (ringK) {
        const im = ringOf(ringK, reduced ? 0 : ringK === 'raised' ? frameAt(t + i * 0.21, 7.5, 2) : ringK === 'ghost' ? frameAt(t, 5, 3) : 0), o = ringOff(im);
        ground(im, ff.x - o.x, ff.y - o.y, at.pos, o.y);
      }
      const fresh = m.kind === 'counted' || m.kind === 'ghost-counted';
      if (fresh && k < 9 && !reduced) { const im = ringOf('chime', Math.min(2, Math.floor(k / 3))), o = ringOff(im); ground(im, ff.x - o.x, ff.y - o.y, at.pos, o.y); }
      // the candle, a step in front of the feet (toward the camera): nearer than the figure, so it is drawn in the world
      // tier over the figure's own feet (the ground tier would hide its flame behind the body)
      const f = atW(at.pos.clone().addScaledVector(toCam, 1.0 * at.scale));
      let tok = 'unlit', tk = 0, sm = null;
      const flick = reduced ? 0 : frameAt(t + i * 0.17, A.FPS.candle, 3);
      switch (m.kind) {
        case 'raised': tok = k < T_FLARE && !reduced ? 'flare' : 'lit'; tk = k < T_FLARE ? (k < 2 ? 0 : 1) : flick; break;
        case 'counted': tok = 'gold'; tk = reduced ? 0 : frameAt(t, 2.5, 2); break;
        case 'passed': if (k < T_GUTTER && !reduced) { tok = 'gutter'; tk = Math.min(2, Math.floor(k / 3)); } else tok = 'cold'; if (k >= T_GUTTER - 3 && k < T_GUTTER - 3 + T_SMOKE && !reduced) sm = [Math.floor((k - T_GUTTER + 3) / 4), false, 30]; break;
        case 'ghost': case 'ghost-raised': case 'ghost-passed': tok = 'ghost'; tk = reduced ? 0 : frameAt(t + i * 0.3, 2.5, 2); break;
        case 'ghost-counted': if (k < T_SNUFF) { tok = 'ghost'; tk = 0; } else tok = 'ghostcold'; if (k >= T_SNUFF && k < T_SNUFF + T_SMOKE && !reduced) sm = [Math.floor((k - T_SNUFF) / 4), true, 32]; break;
        case 'spent': tok = 'ghostcold'; break;
        default: tok = 'unlit';
      }
      // the threshold: a ripple of gold runs round the counted seats in voting order
      let ripple = false;
      if (live?.passedAt != null && fresh) {
        const j = live.rippleOrder?.indexOf(i + 1) ?? -1, k2 = gk(t - live.passedAt - 0.1 - j * 0.07);
        ripple = j >= 0 && k2 >= 0 && k2 < 6;
      }
      if (HD && !courtSize) {
        // on the stones (stage A: figures ~28 texels tall) the candle stands at HALF the court's size: the 1x drawing at
        // 1 HD px per art px (crisp, finer; the court's candle was taller than a seated figure there)
        blitF(Wimg, token(tok, tk, T), f.x - TOKEN.ax, f.y - TOKEN.ay);
        if (sm) blitF(Wimg, smoke(Math.min(4, sm[0]), T, sm[1], sm[2]), f.x - TOKEN.ax, f.y - TOKEN.ay - SMOKE_UP);
      } else if (HD) {
        blitF(Wimg, tokenHD(tok, tk, T), f.x - TOKEN.ax * 2, f.y - TOKEN.ay * 2);
        if (sm) blitF(Wimg, smokeHD(Math.min(4, sm[0]), T, sm[1], sm[2]), f.x - TOKEN.ax * 2, f.y - (TOKEN.ay + SMOKE_UP) * 2);
      } else {
        blitF(Wimg, token(tok, tk, T), f.x - TOKEN.ax, f.y - TOKEN.ay);
        if (sm) blitF(Wimg, smoke(Math.min(4, sm[0]), T, sm[1], sm[2]), f.x - TOKEN.ax, f.y - TOKEN.ay - SMOKE_UP);
      }
      if (ripple && !reduced) { const im = ringOf('chime', 0), o = ringOff(im); ground(im, ff.x - o.x, ff.y - o.y, at.pos, o.y); }
      // above the name: the raised hand / the seal (positions in texels; HD: x k, art offsets x d)
      const head = at.pos.clone(); head.y += at.height + 0.1;
      const hp = atW(head), top1 = gameui.labelTopOf?.(1000 + i) ?? LL.at(head).y - 11;
      // the staged court reserves a slot between the head and the name (gameui MARK_SLOT): the mark stands on the head;
      // else it stands on the name label (2 px above it)
      const slot = gameui.markSlotOf?.(1000 + i) ?? 0;
      const x = hp.x, q = dd, y = slot ? hp.y - q : HD ? Math.round(top1 * kk) - 2 * dd : top1 - 2;
      let topMark = null;
      if (m.kind === 'raised' || m.kind === 'ghost-raised') {
        const bob = (k < 2 && !reduced) ? -1 : reduced ? 0 : frameAt(t + i * 0.13, A.FPS.hand_raised, 2);
        const nm = bob < 0 ? 'pop' : m.kind === 'ghost-raised' ? 'ghost' : bob ? 'r1' : 'r0', b = Math.max(0, bob);
        blitF(Wimg, HD ? handHD(nm, T) : handFrame(nm, T), x - 4 * q, y - (12 + b) * q);
        topMark = y - 12 * q;
      } else if (m.kind === 'passed' || m.kind === 'ghost-passed') {
        // the snuffer comes down over the name (the stroke drawing for 4 grid frames), then rests
        const sk = k < 4 && !reduced ? 1 : 0;
        blitF(Wimg, HD ? snufferHD(sk, T) : snuffer(sk, T), x - 5 * q, y - 13 * q);
        topMark = y - 13 * q;
      } else if (fresh) {
        const sl = HD ? sealHD(T, m.kind === 'ghost-counted') : seal(T, m.kind === 'ghost-counted');
        if (k < 2 && !reduced) blitF(Wimg, sl, x - 15 * q, y - 30 * q, 2);                  // the stamp lands big ...
        else blitF(Wimg, sl, x - 7 * q, y - (15 + (k < 4 && !reduced ? 1 : 0)) * q);       // ... and settles
        if (k >= 1 && k < 7 && !reduced) { const lk = Math.min(2, Math.floor((k - 1) / 2)); blitF(Wimg, HD ? lockHD(lk, T) : lockFrame(lk, T), x - 9 * q, y - 19 * q); }
        topMark = y - 16 * q;
        // candle-gold sparks falling from the seal to the candle
        if (k >= 2 && k < T_SPARKS + 2 && !reduced) {
          const u = (k - 2) / T_SPARKS, y0 = y - 4 * q, y1 = f.y - 20 * q;
          const G = m.kind === 'ghost-counted' ? { core: '#FFFFFF', arm: T.ghost, tip: T.ghostSh } : { core: T.goldHi, arm: T.gold, tip: T.goldSh };
          for (let s2 = 0; s2 < 5; s2++) {
            const uu = Math.min(1, u + s2 * 0.1), sx = x + ([-6, 5, -2, 7, 1][s2] + Math.round(Math.sin((k + s2 * 2) * 0.9))) * q, sy = Math.round(y0 + (y1 - y0) * uu);
            if (HD) sparkHD(Wimg, sx, sy, (k + s2) % 3 === 0 ? 1 : 0, G); else A.spark(Wimg, sx, sy, (k + s2) % 3 === 0 ? 1 : 0, G);
          }
        }
      }
      if (topMark !== null) markTop.set(i, HD ? Math.floor(topMark / kk) : topMark);
      marks[i] = { kind: m.kind, token: tok, ring: ringK ?? null, current: m.current, at: [f.x, f.y] };
    }
    info.seats = marks;
    // ---- the tally plaque + the threshold
    if (VS && live) {
      const tally = VS.tally, needed = live.v.needed;
      // the moment the tally reached `needed`: the demo time of that voter's count
      if (VS.passed && live.passedAt == null) {
        const PERF = EV.TIMING.vote;
        let n = 0, at = t;
        for (let j = 0; j < live.v.order.length; j++) {
          const sd = VS.seats[live.v.order[j]];
          if (sd?.yes) { n++; if (n === needed) { at = realOfClock(live.V, j * PERF.perVoterF / GRID_HZ + PERF.lockAtF / GRID_HZ); break; } }
        }
        live.passedAt = at;
        live.rippleOrder = live.v.order.filter((s) => VS.seats[s]?.yes);
        if (!live.bell && live.endedAt == null) { live.bell = true; info.bell++; try { demo.time?.ringBell?.(); } catch { /* no bell */ } log({ threshold: true, tally, needed, t: +t.toFixed(2) }); events?.emit?.('vote:threshold', { tally, needed }); }
      }
      if (live.lastTally !== tally) { if (live.lastTally !== null) live.flipAt = t; live.lastTally = tally; }
      drawPlaque(LL, T, t, tally, needed, live, HD);
      Object.assign(info, { tally, needed, passed: VS.passed, passedAt: live.passedAt, current: VS.current });
    } else { info.plaque = null; Object.assign(info, { tally: 0, needed: 0, passed: false, passedAt: null, current: null }); }
  };

  /** The plaque face drawn into img (a PixelImage, or a density view: the D=2 frame + the D=2 faces) at (0, 0). */
  function plaqueInto(P0, w, h, T, { tally, needed, passed, gold, flap, lit, gflap }) {
    if (gflap >= 0) { drawBox(P0, 0, Math.floor(h / 2) - 3 + gflap * 2, w, 6 - gflap * 2 + 1, 'gold', T); return; }
    drawBox(P0, 0, 0, w, h, gold ? 'gold' : 'panel', T);
    const ink = gold ? T.textInk : T.text, dim = gold ? T.goldLine : T.textDim;
    drawText(P0, 6, 5, gold ? 'ON THE' : 'VOTES', { font: 'tiny', color: dim });
    drawText(P0, 6, 13, gold ? 'BLOCK' : 'CAST', { font: 'tiny', color: dim });
    // the number: a split-flap flip on change (the flap across for 3 grid frames, then the new number lit gold)
    const num = String(tally), nx = 38;
    if (flap) { P0.rect(nx - 3, 6, 24, 3, T.outline); P0.rect(nx - 3, 9, 24, 1, gold ? T.goldSh : T.ironHi); P0.rect(nx - 3, 10, 24, 3, T.outline); }
    else drawText(P0, nx, 4, num, { font: 'display', color: lit ? T.goldHi : gold ? T.textInk : passed ? T.goldHi : T.text });
    drawText(P0, nx + textWidth(num, 'display') + 4, 8, `/ ${needed}`, { color: ink });
    drawText(P0, w - 6, 5, 'NEEDED', { font: 'tiny', color: dim, align: 'right' });
    drawText(P0, w - 6, 13, passed ? 'ENOUGH' : `${Math.max(0, needed - tally)} MORE`, { font: 'tiny', color: passed ? (gold ? T.textInk : T.goldHi) : dim, align: 'right' });
  }
  // the tally plaque (screen tier): bottom centre of the visible area, above the action bar (the game UI's own bar rect
  // when it has one: the plaque and the bar share the visible area's centre; logical px = screen texels at 720p)
  function drawPlaque(LL, T, t, tally, needed, live, HD) {
    if (!LL.screenEnabled) return;
    const dd = HD ? HD.d : 1, img = HD ? HD.screenView : LL.screen;
    if (!img) return;
    const w = 124, h = 24, bar = gameui.barRect ?? null, card = gameui.voteCardRect ?? null;
    let cx, y;
    // with the vote clock card up (the stones, stage A) the plaque hangs under the card, top left (votecam keeps that
    // column clear); the staged court has no card: bottom centre above the action bar
    // (a narrow screen - a phone, < 400 logical px - keeps it bottom centre: top right it met the chips' second row)
    if (card && img.w >= 400) { const tb = gameui.toolbarRect; const rx = tb ? tb.x + tb.w : img.w - 4; cx = rx - (w >> 1); y = (tb ? tb.y + tb.h : 19) + 5; }
    else if (bar) { cx = Math.floor(bar.x + bar.w / 2); y = bar.y - 5 - h; }
    else {
      const right = (demo.passB?.votecam?.info?.cover?.right ?? 0) / (gameui.texPerLogical ?? 1);
      cx = Math.floor((img.w - right) / 2); y = img.h - 26 - h - 3;
    }
    const x = cx - (w >> 1);
    const passed = live.passedAt != null && t >= live.passedAt;
    const fk = live.flipAt != null ? gk(t - live.flipAt) : 99;
    const goldK = passed ? gk(t - live.passedAt) : -1;
    const gold = passed && (goldK >= 2 || reduced);
    const fade = live.endedAt != null ? Math.min(0.75, Math.floor((t - live.endedAt) / 0.125) * 0.25) : 0;
    const flap = fk < 3 && !reduced, lit = fk < 9 && !reduced, gflap = passed && goldK < 2 && !reduced ? goldK : -1;
    const o = { tally, needed, passed, gold, flap, lit, gflap };
    // drawn once per visual state (a handful per vote), then blitted (HD: through a density view = the D=2 frame and
    // faces, byte-blitted into L.hd.screen at logical x d)
    let im = memo(`plaque|${dd}|${tally}|${needed}|${passed}|${gold}|${flap}|${lit}|${gflap}|${T.gold}|${T.ink}`, () => {
      if (HD) return hdPiece(w + 1, h + 1, (v) => plaqueInto(v, w, h, T, o), dd);
      const P0 = new PixelImage(w + 1, h + 1); plaqueInto(P0, w, h, T, o); return P0;
    });
    const dst = HD ? HD.screen : img;
    if (fade > 0) im = dissolve(im.clone(), fade, (x * dd) & 3, (y * dd) & 3);
    fastBlit(dst, im, x * dd, y * dd);
    if (passed && goldK >= 2 && goldK < 14 && !reduced) {
      const G = { core: T.goldHi, arm: T.gold, tip: T.goldSh }, r = goldK < 8 ? 2 : 1;
      for (const [sx, sy] of [[x - 2, y - 2], [x + w + 1, y - 2], [x - 2, y + h], [x + w + 1, y + h]]) { if (HD) sparkHD(dst, sx * dd, sy * dd, r, G); else A.spark(dst, sx, sy, r, G); }
    }
    dst.mark?.((x - 3) * dd, (y - 3) * dd, (x + w + 3) * dd, (y + h + 3) * dd);
    info.plaque = { x, y, w, h, tally, needed, passed, gold, flipping: fk < 3, hd: !!HD, text: passed ? `ON THE BLOCK ${tally} / ${needed}` : `VOTES CAST ${tally} / ${needed} NEEDED` };
  }

  L.add(draw, 40);
  return {
    info: () => JSON.parse(JSON.stringify(info)),
    states: (t = engine.time) => { const r = states(t); return Object.fromEntries(Object.entries(r.seats).map(([i, s]) => [i, s.kind])); },
    /** the top row (L.world texels) of the mark over seat i's name as drawn last frame (the hand / seal / snuffer), or null */
    topOf: (i) => markTop.get(i) ?? null,
    /** the tally plaque's rect as drawn last frame (logical px), or null (gameui keeps its toasts clear of it) */
    get plaque() { return info.plaque; },
    update() { /* drawn by the UI layer pass (gameui.layers) */ },
    dispose() { L.remove?.(draw); },
  };
}

/** The art of the vote states for review strips (tools / shots): { name: PixelImage } for one token set (hd: the D=2 art) */
export function voteStateArt(T, { hd = false } = {}) {
  const out = {};
  const tok = hd ? tokenHD : token, smk = hd ? smokeHD : smoke, ring = hd ? seatRingHD : seatRing, sl = hd ? sealHD : seal, sn = hd ? snufferHD : snuffer;
  const s = hd ? 2 : 1;
  for (const [kind, n] of [['unlit', 1], ['flare', 2], ['lit', 3], ['gold', 2], ['gutter', 3], ['cold', 1], ['ghost', 2], ['ghostcold', 1]]) for (let k = 0; k < n; k++) out[`candle_${kind}_${k}`] = tok(kind, k, T);
  for (let k = 0; k < 5; k++) { out[`smoke_${k}`] = smk(k, T, false, 24); out[`smoke_ghost_${k}`] = smk(k, T, true, 32); }
  for (const kind of ['raised', 'counted', 'passed', 'ghost']) out[`ring_${kind}`] = ring(kind, 0, 18 * s, 9 * s, T);
  for (let k = 0; k < 3; k++) out[`ring_chime_${k}`] = ring('chime', k, 18 * s, 9 * s, T);
  out.seal = sl(T); out.seal_ghost = sl(T, true);
  out.snuffer_0 = sn(0, T); out.snuffer_1 = sn(1, T);
  if (hd) { for (const nm of ['pop', 'r0', 'r1', 'ghost', 'locked']) out[`hand_${nm}`] = handHD(nm, T); for (let k = 0; k < 3; k++) { out[`pulse_${k}`] = pulseHD(k, T); out[`lock_${k}`] = lockHD(k, T); } }
  else { for (const nm of ['pop', 'r0', 'r1', 'ghost', 'locked']) out[`hand_${nm}`] = handFrame(nm, T); for (let k = 0; k < 3; k++) { out[`pulse_${k}`] = pulseFrame(k, T); out[`lock_${k}`] = lockFrame(k, T); } }
  return out;
}
