// Events group art (owner: events group; docs/UI.md §1 rows 50–59, §4 "events"). Pure kit drawing (no three.js):
// every frame of out/ui/events.{png,json} is built here from the colour tokens of one time-of-day set, so the same
// functions serve the bake (src/ui/events/bake.js) and the live layers (src/ui/events/draw.js).
//
// v2 frame names kept verbatim (square-props.json): poof_0..5 (32x40, anchor 16,38, 15 fps once), glow_warm, glow_cool
// (32x32 additive, anchor 16,16). Everything else is new-style (meta.newStyle.events lists each one):
//   seat_stone / seat_you_0..3 / seat_dead_0..1 / seat_nominee       nomination-circle plaques (Ag; digits = tiny font)
//   vote_pulse_0..2, nominee_ring, vote_hub, vote_tip_<dir>           vote clock in the world (Ag)
//   hand_raised_0..1, hand_pop, hand_locked, hand_lock_0..2, hand_ghost   raised / locked hands (A)
//   vc_face, vc_seat_<state>                                          HUD vote clock (S)
//   caption_end, caption_mid, glyph_moon|sun|bell|candle|hand          phase caption ribbon (S)
//   veil_0..3                                                          night-fall dither tiles (S, 4x4, tile them)
//   toll_0..3, bell_0..2, wisp_0..5, reveal_0..3, candle_0..2          execution / night death / ghost reveal (Ag / A)
//   banner_end, banner_mid, emblem_start|good|evil, ghost_halo_0..1    game start / end banners (S), halo drop-in (A)
// Light from the upper left everywhere; lines = darker, cooler shade of their own fill; binary alpha except the banded
// light FX (glow_*, the dawn wash: ≤ 3 alpha steps).
import { PixelImage, ramp, mix, hex, rgba, drawText, textWidth } from '../kit.js';

// ------------------------------------------------------------------------------------------------ timing (v2, grid)
/** v2 durations (game UX tuning) in ms, kept exactly; grid conversions in draw.js (whole 1/30 s frames). */
export const V2_MS = {
  nightOut: 650, nightIn: 1600,          // TownScene.onPhaseChange: cam.fadeOut(650) -> fadeIn(1600) to #04020a
  dawnFlash: 900,                        // cam.flash(900, 70, 40, 50)
  captionNight: 4200, captionBell: 4200, captionDawn: 3500,
  poofFrameMs: 1000 / 14,                // v2 14 fps -> 15 fps here (2 grid frames per drawing)
};
export const FPS = { poof: 15, vote_pulse: 5, hand_raised: 2.5, hand_lock: 15, seat_you: 2.5, seat_dead: 2, toll: 10, bell: 7.5, wisp: 10, reveal: 15, candle: 7.5, ghost_halo: 2 };
export const V2_FPS = { poof: 14 };
/** Anchors (x, y inside the frame) — v2 keys first. */
export const ANCHORS = {
  poof: { x: 16, y: 38 }, glow_warm: { x: 16, y: 16 }, glow_cool: { x: 16, y: 16 },
  seat: { x: 9, y: 5 }, seat_you: { x: 9, y: 5 }, seat_dead: { x: 9, y: 13 },
  vote_pulse: { x: 16, y: 9 }, nominee_ring: { x: 16, y: 9 }, vote_hub: { x: 3, y: 2 }, vote_tip: { x: 3, y: 3 },
  hand: { x: 4, y: 12 }, hand_lock: { x: 9, y: 11 },
  vc_seat: { x: 5, y: 5 }, caption_end: { x: 0, y: 0 }, glyph: { x: 4, y: 4 },
  toll: { x: 20, y: 9 }, bell: { x: 6, y: 0 }, wisp: { x: 16, y: 38 }, reveal: { x: 16, y: 30 }, candle: { x: 3, y: 11 },
  banner_end: { x: 0, y: 0 }, emblem: { x: 10, y: 10 }, ghost_halo: { x: 5, y: 2 },
};

// ------------------------------------------------------------------------------------------------ helpers
const _ramps = new Map();
export const rampOf = (c, o) => { const k = hex(c) + JSON.stringify(o || {}); let r = _ramps.get(k); if (!r) { r = ramp(hex(c), o); _ramps.set(k, r); } return r; };
/** v2 nominee clay #a65f4b, nudged warmer so it reads as red on the cobbles (and on noon grass). */
export const CLAY = '#B85A48';
/** Pale smoke of the Storyteller's poof (v2 RING_SMOKE mid #9a8cbc). */
export const SMOKE = '#9C8EBE';
export const SPARK_VIOLET = { core: '#EFE4FF', arm: '#B99CEC', tip: '#8A5ACF' };    // tip = stViolet token
const sparkGold = (T) => ({ core: T.goldHi, arm: T.gold, tip: T.goldSh });
const sparkGhost = (T) => ({ core: '#EEF6F9', arm: T.ghost, tip: T.ghostSh });

/** Recolour an opaque mask: hi where the up/left neighbour is empty, sh where the down/right one is, mid inside; + line. */
export function shade(img, { hi, mid, sh, line }, { lineOut = true, keepHi = null } = {}) {
  const o = new PixelImage(img.w, img.h);
  const on = (x, y) => img.alpha(x, y) > 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!on(x, y)) continue;
    let c = mid;
    if (!on(x - 1, y) || !on(x, y - 1)) c = hi;
    else if (sh && (!on(x + 1, y) || !on(x, y + 1))) c = sh;
    o.set(x, y, c);
  }
  if (keepHi) keepHi(o);
  if (lineOut && line) o.outline(line);
  return o;
}
/** Bits template ('#'/'.' rows, any other char = a second colour key) -> mask PixelImage at offset. */
export function bits(rows, map = { '#': [255, 255, 255, 255] }, w = null, h = null, ox = 0, oy = 0) {
  const R = Array.isArray(rows) ? rows : rows.split('/');
  const img = new PixelImage(w ?? Math.max(...R.map((r) => r.length)) + 2 * ox, h ?? R.length + 2 * oy);
  R.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (map[r[i]]) img.set(ox + i, oy + j, map[r[i]]); });
  return img;
}
const insideE = (x, y, cx, cy, rx, ry) => { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy <= 1; };
/** Elliptic annulus (inside outer, outside inner rx-tx / ry-ty), shaded top-left hi / bottom-right sh, + line ring. */
export function annulus(img, cx, cy, rx, ry, R, { tx = 2, ty = 1, line = true } = {}) {
  const m = new PixelImage(img.w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++)
    if (insideE(x, y, cx, cy, rx, ry) && !insideE(x, y, cx, cy, rx - tx, ry - ty)) {
      const ax = x + 0.5 - cx, ay = y + 0.5 - cy;
      const k = (-ax / rx - ay / ry);                 // > 0 on the upper-left half
      m.set(x, y, k > 0.55 ? R.hi : k < -0.55 ? R.sh : R.mid);
    }
  if (line) m.outline(R.line);
  img.blit(m, 0, 0);
  return img;
}
/** Plus-shaped sparkle: r 0 = 1 px core, 1 = plus, 2 = long plus (tips), 3 = long plus + diagonal glints. */
export function spark(img, x, y, r, S) {
  x |= 0; y |= 0;
  if (r <= 0) { img.set(x, y, S.arm); return img; }
  for (let k = 1; k <= r; k++) {
    const c = k === r && r > 1 ? S.tip : S.arm;
    img.set(x + k, y, c); img.set(x - k, y, c); img.set(x, y + k, c); img.set(x, y - k, c);
  }
  if (r >= 3) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) img.set(x + dx, y + dy, S.tip);
  img.set(x, y, S.core);
  return img;
}
/** Smoke / cloud blob from discs [cx, cy, r], shaded by the nearest disc's normal (light upper-left) + own line. */
export function blob(w, h, discs, R, { line = true } = {}) {
  const img = new PixelImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = null, bd = -1;
    for (const [cx, cy, r] of discs) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = 1 - Math.hypot(dx, dy) / r;
      if (d >= 0 && d > bd) { bd = d; best = [dx / r, dy / r]; }
    }
    if (!best) continue;
    const l = -0.7 * best[0] - 0.7 * best[1];
    img.set(x, y, l > 0.38 ? R.hi : l < -0.3 ? R.sh : R.mid);
  }
  if (line) img.outline(R.line);
  return img;
}

// ------------------------------------------------------------------------------------------------ poof (v2 names)
/**
 * Billowing cloud from discs [cx, cy, r] painted back to front (list order). r3 (critic: "a pile of stones"): no dark
 * seams inside the cloud. Each puff gets a 2-px hi crescent on its upper-left (painted over the puffs behind it, so the
 * lumps separate with LIGHT: convex), a 1-px cream rim only where that crescent is on the OUTER silhouette, and the sh
 * band and the line follow the outer silhouette only (bottom-right edge of the union). light = [x0, x1] columns lit
 * from inside (the light column shining through the smoke). line = the outline colour (thinning puffs use a lighter one).
 */
export function cloud(w, h, discs, R, { rim, light = null, line = R.line } = {}) {
  const img = new PixelImage(w, h);
  const inD = (x, y, cx, cy, r) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
  const union = (x, y) => discs.some(([cx, cy, r]) => inD(x, y, cx, cy, r));
  for (const [cx, cy, r] of discs) {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
        if (!inD(x, y, cx, cy, r)) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), l = (-0.7 * dx - 0.7 * dy) / Math.max(0.5, d);
        let c = R.mid;
        if (l > 0.3 && r - d < 2.1) c = (!union(x - 1, y) || !union(x, y - 1)) ? rim : R.hi;
        if (light && x >= light[0] && x <= light[1] && c === R.mid) c = R.hi;
        img.set(x, y, c);
      }
    }
  }
  // sh: the outer silhouette's lower-right band (1 px; 2 px on the bottom rows), never between puffs
  const on = (x, y) => img.alpha(x, y) > 0;
  const sh = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    if (!on(x + 1, y) || !on(x, y + 1) || (!on(x + 1, y + 1) && !on(x, y + 2))) sh.push(x, y);
  }
  for (let i = 0; i < sh.length; i += 2) img.set(sh[i], sh[i + 1], R.sh);
  img.outline(line);
  return img;
}
/** Poof cloud layouts (32x40 cell, feet (16,38)), back to front. 1 and 3 hide the Storyteller (vanish at poof_2, appear
 *  at poof_3), 2 is the light frame (a crown of smoke, low in the middle, the beam rising out of it). */
export const POOF_PUFFS = {
  0: [[11, 36.2, 2.4], [14.5, 35.2, 2.9], [18, 35.6, 2.6], [21, 36.4, 2.2]],
  1: [[15, 7.5, 3.6], [19.5, 10, 3.4], [12, 12, 4], [16, 14, 4.5], [11, 19, 5], [21.5, 18, 5.5], [16, 23, 6], [9.5, 28, 5.5], [22.5, 28, 5.5], [16, 31, 6.5], [7, 34, 4], [25, 34, 4], [12, 34.5, 4.5], [20, 34.5, 4.5]],
  2: [[9, 10, 4], [23, 9.5, 4], [7, 16, 5], [25, 15.5, 5], [16, 21.5, 5], [9.5, 23, 5.5], [22.5, 22.5, 5.5], [16, 28, 6.5], [6.5, 30, 5], [25.5, 30, 5], [11.5, 34, 4.5], [20.5, 34, 4.5], [16, 34.5, 4.5]],
  3: [[13, 9, 3.5], [20, 8, 3], [16, 13, 4.5], [10, 17, 5], [22.5, 16.5, 5], [15.5, 21, 5.5], [8, 25, 5], [24, 24.5, 5], [16, 28.5, 6], [5.5, 32, 4.5], [26.5, 32, 4.5], [11, 34, 4.5], [21, 34, 4.5]],
  // 4-5: the cloud breaks into small cloudlets (2-3 overlapping puffs each, never single balls) that drift out and up
  4: [[7, 11, 2.4], [10.5, 9.5, 2.8], [12.5, 12, 2.2], [20.5, 8.5, 2.4], [23.5, 10, 2.7], [4, 22, 2.5], [7.5, 21, 3], [9.5, 23.5, 2.3],
    [23, 20.5, 2.6], [26.5, 22, 2.8], [12.5, 31.5, 2.4], [16.5, 30, 3], [20, 32, 2.4]],
  5: [[8, 6, 1.6], [10.5, 5, 2], [22, 4.5, 1.8], [24.5, 5.5, 1.6], [3.5, 15, 1.6], [6, 14, 1.9], [26, 13.5, 1.9], [28.5, 15, 1.5]],
};
/**
 * Storyteller teleport poof, 6 drawings, 32x40, feet at (16,38) (v2 scripts/fx/particles.ts poof()): 0 sparkles in a
 * ground ring + a first puff; 1 the smoke billows up to ~29 texels and hides the figure; 2 a crown of smoke with the
 * light column rising out of its middle (the vanish / appear moment); 3 the cloud breathes out, still covering (the
 * Storyteller is shown again under it); 4-5 it breaks into separate puffs that drift and thin out. Violet and gold
 * plus-sparkles fill the upper half (v2 refs/ui/events/v2-poof-glow.png).
 */
export function poof(f, T) {
  const img = new PixelImage(32, 40);
  const SM = rampOf(SMOKE, { light: 0.1, dark: 0.12, line: 0.3 });
  const G = sparkGold(T), V = SPARK_VIOLET;
  const N = 14, cx = 16, gy = 37;
  const motes = [];
  for (let i = 0; i < N; i++) {
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
    if (f === 5 && i % 3) continue;          // most wink out
    if (f === 4 && i % 4 === 3) continue;
    const a = base + spin;
    let x = Math.max(2, Math.min(29, Math.round(cx + Math.cos(a) * rad)));
    if (f === 2 && Math.abs(x - cx) < 4) x = cx + (x < cx ? -4 : 4);       // never across the beam (a crossbar = a hilt)
    motes.push({ x, y: Math.max(2, Math.round(gy - h + Math.sin(a) * rad * 0.35)), r, S: gold ? G : V, back: Math.sin(a) < 0 });
  }
  const drawMotes = (back) => { for (const m of motes) if (m.back === back) spark(img, m.x, m.y, m.r, m.S); };
  drawMotes(true);
  if (f === 2) {
    // the light column: 3 bands (gold | goldHi | gold) + goldLine sides, solid out of the smoke's dip, breaking into
    // ever shorter dashes toward the top. No crossbar, no knob (r2 read as a candle / sword stub).
    const col = new PixelImage(32, 40);
    const dashes = [[1, 1], [3, 4], [6, 8], [10, 22]];          // segments, all 3 bands wide (a beam breaking up)
    for (const [y0, y1] of dashes) for (let y = y0; y <= y1; y++) { col.set(cx, y, T.goldHi); col.set(cx - 1, y, T.gold); col.set(cx + 1, y, T.gold); }
    col.outline(T.goldLine);
    img.blit(col, 0, 0);
  }
  const light = f === 2 ? [14, 18] : f === 3 ? [15, 17] : null;
  img.blit(cloud(32, 40, POOF_PUFFS[f], SM, { rim: T.parchmentHi, light, line: f >= 4 ? SM.sh : SM.line }), 0, 0);   // thinning puffs: lighter line
  if (f === 2) {                        // the beam goes on over the cloud's dip (light in front of the smoke)
    for (let y = 10; y <= 19; y++) { img.set(cx, y, T.goldHi); img.set(cx - 1, y, T.gold); img.set(cx + 1, y, T.gold); }
    spark(img, 9, 4, 2, G); spark(img, 24, 3, 2, V); spark(img, 5, 9, 1, V); spark(img, 27, 7, 1, G);
  }
  drawMotes(false);
  return img;
}

/** Light blobs (v2 additive 32x32 soft discs) as BANDED glows: 3 alpha steps, light FX only (docs/UI.md §2.3). */
export function glow(kind, T) {
  const img = new PixelImage(32, 32);
  const c = rgba(kind === 'warm' ? '#FFC46B' : '#8FA4E8');     // lantern #FFC46B (ART_DIRECTION glade night) / moon blue
  const bands = [[15.5, 34], [10.5, 70], [5.5, 120]];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
    let a = 0;
    for (const [r, al] of bands) if (d <= r) a = al;
    if (a) img.data.set([c[0], c[1], c[2], a], (y * 32 + x) * 4);
  }
  return img;
}

// ------------------------------------------------------------------------------------------------ seat plaques (Ag)
/**
 * A seat plaque: a small slate slab lying on the cobbles (top face rx 8 ry 4 + a 2-px side, own line), lit from the
 * upper left: 1-px chalk rim on the upper-left arc of the top face. v2 seat marker = stone ellipse 14x8 + chalk edge
 * + contact shadow, own spot gold, dead = mist + wisp. Digits are drawn at runtime (tiny font) at anchor (9,5) - 2.
 */
function slab(T, { top, rim, side, line, edge = null }) {
  const W = 18, H = 12, cx = 9, cy = 5, rx = 8, ry = 4;
  const img = new PixelImage(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inTop = insideE(x, y, cx, cy, rx, ry), inSide = insideE(x, y, cx, cy + 2, rx, ry);
    if (inTop) {
      const border = !insideE(x - 1, y, cx, cy, rx, ry) || !insideE(x, y - 1, cx, cy, rx, ry) || !insideE(x + 1, y, cx, cy, rx, ry) || !insideE(x, y + 1, cx, cy, rx, ry);
      const ul = (x + 0.5 - cx) / rx + (y + 0.5 - cy) / ry < -0.35;
      img.set(x, y, edge && border ? edge : border && ul ? rim : top);
    } else if (inSide) img.set(x, y, side);
  }
  img.outline(line);
  return img;
}
export const seatStoneTones = (T) => ({ top: T.iron, rim: T.textDim, side: T.ironSh, line: T.outline });
export const seatStone = (T) => slab(T, seatStoneTones(T));
/** Own seat: the plaque with a gold edge + a pulsing gold ring around it (4 drawings, 2.5 fps, seq 0,1,2,1... = 0..3). */
export function seatYou(k, T) {
  // r1: the pulse lives in the plaque's own gold edge (goldSh -> gold -> goldHi -> gold) and its gold top glint; an
  // outer ring doubled the indicators group's "you are here" ring under the same feet (shots/ui-events/r1/all-noon.png)
  const edge = [T.goldSh, T.gold, T.goldHi, T.gold][k];
  return slab(T, { top: k === 2 ? T.goldSh : T.iron, rim: k === 2 ? T.gold : T.textDim, side: T.ironSh, line: T.goldLine, edge });
}
/** Dead seat: pale mist plaque with a small spirit wisp rising behind it (2 drawings: sway, 2 fps). */
export function seatDead(k, T) {
  const img = new PixelImage(18, 20);
  const GH = rampOf(T.ghostSh, { light: 0.12, dark: 0.1, line: 0.3 });
  img.blit(slab(T, { top: T.ghostSh, rim: T.ghost, side: GH.sh, line: GH.line }), 0, 8);
  // a small floating flame (1-px gap above the plaque), its tip swaying 1 px
  const rows = k ? ['..#', '.#.', '.##', '###', '.#.'] : ['#..', '.#.', '##.', '###', '.#.'];
  const w = bits(rows, undefined, 5, 7, 1, 1);
  img.blit(shade(w, { hi: '#EEF6F9', mid: T.ghost, sh: T.ghostSh, line: GH.line }), 6, 0);
  return img;
}
/** Nominee seat (v2 clay ring): the plaque with a clay edge. */
export const seatNominee = (T) => slab(T, { top: T.iron, rim: T.textDim, side: T.ironSh, line: T.outline, edge: rampOf(CLAY).hi });

// ------------------------------------------------------------------------------------------------ vote clock (Ag)
/** Ring around the current voter (encloses feet + plaque): gold annulus, 3 drawings (seq 0,1,2,1 at 5 fps). */
export function votePulse(k, T) {
  const img = new PixelImage(32, 19);
  const rr = [[14, 7.5], [14.5, 8], [15, 8.5]][k];
  annulus(img, 16, 9.5, rr[0], rr[1], { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine }, { tx: 2, ty: 1 });
  return img;
}
/** Nominee ring (v2 2-px clay ellipse 20x11): clay annulus, its own line. */
export function nomineeRing(T) {
  const img = new PixelImage(32, 19);
  annulus(img, 16, 9.5, 14, 7.5, rampOf(CLAY, { line: 0.3 }), { tx: 2, ty: 1 });
  return img;
}
/** Hub of the clock hand at the circle centre (v2: ink disc r3): ink disc with a gold rim, 7x5 (r3: was 9x7). */
export function voteHub(T) {
  const img = new PixelImage(7, 5);
  img.ellipse(3.5, 2.5, 2.6, 1.6, T.gold);
  img.set(3, 2, T.inkSunk);
  img.set(2, 1, T.goldHi);
  img.outline(T.goldLine);
  return img;
}
export const DIRS8 = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
const DIRV = { right: [1, 0], 'down-right': [1, 1], down: [0, 1], 'down-left': [-1, 1], left: [-1, 0], 'up-left': [-1, -1], up: [0, -1], 'up-right': [1, -1] };
/**
 * Arrow tip of the clock hand for one of 8 screen headings, 5x5 (+1-px line = 7x7 frame), centre (3,3) = the shaft end.
 * r3: was 11x11 on a 3-px shaft ("a spear thrown across the square", critic); now a small chevron head on a 1-px hand.
 */
export function voteTip(dir, T) {
  const m = new PixelImage(7, 7);
  const [vx, vy] = DIRV[dir], n = Math.hypot(vx, vy), ux = vx / n, uy = vy / n, px = -uy, py = ux;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const dx = x + 0.5 - 3.5, dy = y + 0.5 - 3.5;
    const a = dx * ux + dy * uy, b = Math.abs(dx * px + dy * py);
    if (a >= -1.6 && a <= 2.3 && b <= (2.3 - a) * 0.62 + 0.15) m.set(x, y, T.gold);
  }
  return shade(m, { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine });
}
/** Shaft colours: day = gold with a goldLine shadow side; night = the lower-value goldSh (the nominee ring and the
 *  hands stay the focus at night, critic c1/live-busy-night.png). */
export const handTones = (T, night = false) => (night ? { c: T.goldSh, side: T.goldLine } : { c: T.gold, side: T.goldLine });
/**
 * The clock hand from the centre (x0,y0) to the voter end (x1,y1): a 1-px shaft + a 1-px goldLine shadow side (below /
 * right of it: light from the upper left), the 5x5 tip, a small hub. Drawn into `img` (L.ground: hidden under
 * characters). 2 px total (v2 drew a thin line).
 */
export function drawVoteHand(img, x0, y0, x1, y1, T, { night = false } = {}) {
  const minx = Math.min(x0, x1) - 6, miny = Math.min(y0, y1) - 6;
  const w = Math.abs(x1 - x0) + 13, h = Math.abs(y1 - y0) + 13;
  const s = new PixelImage(w, h);
  const ax = x0 - minx, ay = y0 - miny, bx = x1 - minx, by = y1 - miny;
  const steep = Math.abs(by - ay) > Math.abs(bx - ax);
  const H = handTones(T, night);
  s.line(ax + (steep ? 1 : 0), ay + (steep ? 0 : 1), bx + (steep ? 1 : 0), by + (steep ? 0 : 1), H.side);
  s.line(ax, ay, bx, by, H.c);
  const ang = Math.atan2(by - ay, bx - ax), d = DIRS8[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
  s.blit(voteTip(d, T), bx - 3, by - 3);
  s.blit(voteHub(T), ax - 3, ay - 2);
  img.blit(s, minx, miny);
}

// ------------------------------------------------------------------------------------------------ hands (A)
// v2 gameplay hand(): 7x11 (4 fingers, palm, wrist), soot contour; raised = parchment + gold cuff, bobbing; locked yes
// = solid gold. Here 8x11 + 1-px line (10x13 frame, wrist bottom-centre at (4,12)), with a thumb, lit from the upper left.
const HAND = [
  '...#.#..',
  '.#.#.#..',
  '.#.#.#.#',
  '.#.#.#.#',
  '##.#.#.#',
  '########',
  '.#######',
  '..######',
  '..#####.',
  '..ccccc.',
  '..ccccc.',
];
const HAND_TILT = [
  '....#.#.',
  '..#.#.#.',
  '..#.#.#.',
  '.##.#.#.',
  '########',
  '.#######',
  '..######',
  '..######',
  '..#####.',
  '..ccccc.',
  '..ccccc.',
];
const handLine = (T) => rampOf(T.parchment, { line: 0.58 }).line;
function handImg(rows, P, cuff, line) {
  const m = bits(rows, { '#': P.mid, c: cuff.mid }, 10, 13, 1, 1);
  const o = new PixelImage(10, 13);
  const on = (x, y) => m.alpha(x, y) > 0;
  for (let y = 0; y < 13; y++) for (let x = 0; x < 10; x++) {
    if (!on(x, y)) continue;
    const isCuff = hex(m.get(x, y)) === hex(cuff.mid);
    const R = isCuff ? cuff : P;
    let c = R.mid;
    if (!on(x - 1, y) || (!on(x, y - 1) && !isCuff)) c = R.hi;
    else if (!on(x + 1, y) || !on(x, y + 1)) c = R.sh;
    o.set(x, y, c);
  }
  o.outline(line);
  return o;
}
const PARCH = (T) => ({ hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh });
const GOLDR = (T) => ({ hi: T.goldHi, mid: T.gold, sh: T.goldSh });
/** Raised, not yet counted: parchment hand + gold cuff; k 0 = upright, 1 = tilted (a little wave). */
export const handRaised = (k, T) => handImg(k ? HAND_TILT : HAND, PARCH(T), GOLDR(T), handLine(T));
/** Locked yes (counted): solid gold hand, darker gold cuff. */
export const handLocked = (T) => handImg(HAND, GOLDR(T), { hi: T.gold, mid: T.goldSh, sh: T.goldSh }, T.goldLine);
/** A ghost spending its one vote: pale ghost hand, gold cuff (the halo's gold). */
export const handGhost = (T) => handImg(HAND, { hi: '#EEF6F9', mid: T.ghost, sh: T.ghostSh }, GOLDR(T), rampOf(T.ghostSh, { line: 0.3 }).line);
/** A ghost's vote once the clock hand counts it (r3): the gold locked hand with the pale ghost cuff, so the count is
 *  visible in the world like every other voter's (r2 kept the pale hand_ghost: critic z2/v287esme.png). */
export const handGhostLocked = (T) => handImg(HAND, GOLDR(T), { hi: '#EEF6F9', mid: T.ghost, sh: T.ghostSh }, T.goldLine);
/** Appear pop (frame 0 of the reveal, 1 grid step smaller): a fist rising, 10x13, wrist on the same anchor. */
export function handPop(T) {
  const rows = ['', '', '', '', '..#.#.#.', '.#######', '.#######', '..######', '..#####.', '..ccccc.', '..ccccc.'];
  return handImg(rows, PARCH(T), GOLDR(T), handLine(T));
}
/** Lock flash around the hand when the clock hand counts it: 3 drawings at 15 fps, 19x16, hand wrist at (9,11). */
export function handLock(k, T) {
  const img = new PixelImage(19, 16);
  const G = sparkGold(T);
  const pts = [[[3, 3], [15, 3], [2, 10], [16, 10]], [[1, 1], [17, 1], [0, 9], [18, 9], [9, 0]], [[0, 0], [18, 0], [9, 0]]][k];
  pts.forEach(([x, y], i) => spark(img, x, y, k === 0 ? 1 : k === 1 ? (i % 2 ? 2 : 1) : 0, G));
  return img;
}

// ------------------------------------------------------------------------------------------------ HUD vote clock (S)
export const VC = { size: 61, r: 23 };
/** HUD vote clock face (v2 .ct-voteclock svg 150 px: dark ring + seats): 61x61 ink disc, iron bevel ring, tick dots. */
export function vcFace(T) {
  const S = VC.size, c = S / 2, img = new PixelImage(S, S);
  img.disc(c, c, 29.5, T.outline);
  img.disc(c, c, 28.5, T.iron);
  img.disc(c, c, 27.5, T.inkSunk);
  // bevel: lit upper-left arc of the iron ring, shadow lower right
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
    if (d > 27.5 && d <= 28.5) { const k = (-dx - dy) / d; img.set(x, y, k > 0.5 ? T.ironHi : k < -0.5 ? T.ironSh : T.iron); }
  }
  img.disc(c, c, 17.5, T.ink);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    img.set(Math.floor(c + Math.cos(a) * 15.5), Math.floor(c + Math.sin(a) * 15.5), i % 6 === 0 ? T.goldSh : T.ironSh);
  }
  return img;
}
/** Seat pip on the HUD clock, 11x11 disc (digit drawn at runtime): idle / yes / no / raised0..1 / dead / nominee / current. */
export function vcSeat(state, T) {
  const img = new PixelImage(11, 11);
  const fill = { idle: T.inkRaised, yes: T.gold, no: T.inkSunk, raised0: T.goldSh, raised1: rampOf(T.goldSh).sh, dead: T.inkSunk, nominee: T.inkRaised, current: T.inkRaised }[state];
  const edge = { idle: T.iron, yes: T.goldHi, no: T.ironSh, raised0: T.gold, raised1: T.goldSh, dead: T.ghostSh, nominee: rampOf(CLAY).hi, current: T.goldHi }[state];
  img.disc(5.5, 5.5, 5.4, edge);
  img.disc(5.5, 5.5, 4.2, fill);
  if (state === 'yes') { img.set(3, 3, T.goldHi); img.set(4, 2, T.goldHi); }
  if (state === 'dead') for (const [x, y] of [[2, 4], [4, 2], [8, 6], [6, 8]]) img.erase(x, y), img.set(x, y, T.inkSunk);   // broken (dashed) rim
  img.outline(state === 'yes' || state.startsWith('raised') || state === 'current' ? T.goldLine : state === 'nominee' ? rampOf(CLAY).line : T.outline);
  return img;
}
/** Digit colour on a pip. */
export const vcDigit = (state, T) => (state === 'yes' ? T.textInk : state === 'no' || state === 'dead' ? T.textDim : state.startsWith('raised') ? T.goldHi : T.text);

// ------------------------------------------------------------------------------------------------ caption (S)
/** Ribbon end (left; the right end = flipX): swallowtail notch, 7x15, ink band with gold keylines + drop shadow. */
export function captionEnd(T) {
  const img = new PixelImage(7, 15);
  const rows = ['..ooooo', '.oggggg', 'ogffffff', '.ogfffff', '..offfff', '..offfff', '..offfff', '..offfff', '..offfff', '.ogfffff', 'ogffffff', '.oggggg.', '..oooooo', '...sssss', ''];
  const map = { o: T.outline, g: T.goldSh, f: T.ink, s: T.shadow };
  rows.forEach((r, j) => { for (let i = 0; i < Math.min(7, r.length); i++) if (map[r[i]]) img.set(i, j, map[r[i]]); });
  return img;
}
/** 1-px ribbon middle tile (15 tall: line, gold keyline, ink x8 with a 1-px ink-raised top row, keyline, line, shadow). */
export function captionMid(T) {
  const img = new PixelImage(1, 15);
  [T.outline, T.goldSh, T.inkRaised, T.ink, T.ink, T.ink, T.ink, T.ink, T.ink, T.ink, T.goldSh, T.outline, T.shadow].forEach((c, j) => img.set(0, j, c));
  return img;
}
/** 9x9 caption glyphs (pixel3d mini objects, 2-3 tones + own line, lit upper left). */
export function glyph(name, T) {
  const G = { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine };
  const rows = {
    moon: ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
    sun: ['...#...', '.#...#.', '..###..', '#.###.#', '..###..', '.#...#.', '...#...'],
    bell: ['...#...', '..###..', '.#####.', '.#####.', '.#####.', '#######', '...#...'],
    candle: ['...#...', '..###..', '...#...', '..###..', '..###..', '..###..', '.#####.'],
    hand: ['.#.#.#.', '.#.#.#.', '##.#.##', '#######', '.######', '..####.', '..###..'],
  }[name];
  const m = bits(rows, undefined, 9, 9, 1, 1);
  if (name === 'candle') {
    const o = new PixelImage(9, 9);
    const P = { hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh, line: handLine(T) };
    o.blit(shade(bits(['', '', '', '..###..', '..###..', '..###..', '.#####.'], undefined, 9, 9, 1, 1), P), 0, 0);
    o.set(4, 1, T.goldHi); o.set(4, 2, T.gold); o.set(4, 3, T.goldSh);
    return o;
  }
  return shade(m, G);
}

/** Night-fall dither tiles (4x4 Bayer, coverage 4/16, 8/16, 12/16, 16/16) in the night shadow colour. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function veilTile(k, c) {
  const img = new PixelImage(4, 4), lim = (k + 1) * 4;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (BAYER4[y * 4 + x] < lim) img.set(x, y, c);
  return img;
}
/** The night veil colour (v2 fades to #04020a; no pure black here: the night shadow token, a deep indigo). */
export const veilColor = (Tn) => Tn.shadow;

// ------------------------------------------------------------------------------------------------ execution / death
/** Bell-toll ripple on the ground (Ag): an expanding 1-px iron-chalk ring, 4 drawings at 10 fps, 41x19. */
export function toll(k, T) {
  const img = new PixelImage(41, 19);
  const rr = [[7, 3.5], [11, 5.5], [15, 7.5], [19.5, 9]][k];
  const c = k < 2 ? T.goldHi : k === 2 ? T.gold : T.goldSh;
  const m = new PixelImage(41, 19);
  m.ring(20.5, 9.5, rr[0], rr[1], c);
  if (k === 3) for (let x = 0; x < 41; x += 2) for (let y = 0; y < 19; y++) m.erase(x, y);   // the last ring breaks up
  m.outline(T.goldLine);
  img.blit(m, 0, 0);
  return img;
}
/** A small bell over the condemned (the town bell tolls): 13x14, swinging 3 drawings (seq 0,1,2,1 at 7.5 fps). */
export function bell(k, T) {
  // dome, straight waist, flared lip, clapper (a bell, not a tree)
  const base = ['.....#.....', '....###....', '...#####...', '..#######..', '..#######..', '..#######..', '..#######..', '.#########.', '###########', '.....#.....'];
  const m = bits(base, undefined, 13, 12, 1, 1);
  const s = shade(m, { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine });
  if (k === 1) return s;
  // swing = whole-texel skew (rows shift by 0/1 px with depth), no rotation
  const o = new PixelImage(13, 12), dir = k === 0 ? -1 : 1;
  for (let y = 0; y < 12; y++) { const sh = Math.round(dir * Math.max(0, y - 2) / 8); for (let x = 0; x < 13; x++) { const v = s.get(x, y); if (v[3]) o.set(x + sh, y, v); } }
  return o;
}
/** Spirit head centre row + radius per wisp drawing (cell rows; the runtime clips the path below name labels). */
export const WISP_PATH = { cy: [32, 26, 18, 11, 5, 3], sz: [2, 3, 4, 4.5, 4, 3] };
/**
 * The soul wisp leaving the fallen body (A), 6 drawings at 10 fps, 32x40, anchor (16,38) = the body's centre on the
 * ground: a pale spirit flame gathers (0-1), rises (2-4) and opens into the ghost (5). Non-graphic: light, not a body.
 */
export function wisp(k, T) {
  const img = new PixelImage(32, 40);
  const GR = { hi: '#EEF6F9', mid: T.ghost, sh: T.ghostSh, line: rampOf(T.ghostSh, { line: 0.3 }).line };
  const S = sparkGhost(T);
  const cy = WISP_PATH.cy[k], sz = WISP_PATH.sz[k];   // r2: rises clear of the head (r1 stayed inside the body)
  const flame = new PixelImage(32, 40);
  if (k < 5) {
    // a little spirit: round head, a tail that tapers DOWN and curls (whole-texel sway), two dark eyes once it is big
    flame.disc(16, cy, sz, '#fff');
    const len = Math.round(sz * 2.2);
    for (let j = 1; j <= len; j++) {
      const w = Math.max(0.5, sz * (1 - j / (len + 1)));
      const off = Math.round(Math.sin(j * 0.8 + k * 1.3) * Math.min(2, j / 3));
      flame.rect(Math.round(16 - w + off), Math.round(cy + sz * 0.6 + j), Math.max(1, Math.round(2 * w)), 1, '#fff');
    }
    const s = shade(flame, GR);
    if (sz >= 4) { s.set(14, cy, GR.line); s.set(17, cy, GR.line); }
    img.blit(s, 0, 0);
  }
  // motes rising with it
  const mot = [[[10, 36, 0], [22, 35, 0]], [[9, 33, 1], [23, 32, 0], [14, 37, 0]], [[8, 28, 1], [24, 26, 1], [12, 34, 0], [21, 33, 0]],
    [[7, 22, 1], [25, 20, 1], [11, 28, 0], [21, 27, 1]], [[6, 15, 0], [26, 14, 1], [10, 22, 1], [22, 20, 0]], [[5, 8, 0], [27, 9, 0], [9, 16, 2], [23, 13, 2], [16, 4, 3]]][k];
  for (const [x, y, r] of mot) spark(img, x, y, r, S);
  return img;
}
/** Ghost reveal burst around the new ghost (A), 4 drawings at 15 fps, 33x34, anchor (16,30) = feet. */
export function reveal(k, T) {
  const img = new PixelImage(33, 34);
  const S = sparkGhost(T), G = sparkGold(T);
  const R = [7, 11, 14, 16][k];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const x = Math.round(16 + Math.cos(a) * R), y = Math.round(18 + Math.sin(a) * R * 0.75);
    spark(img, x, y, k === 3 ? 0 : i % 2 ? 1 : 2, i % 4 === 0 ? G : S);
  }
  if (k === 0) spark(img, 16, 6, 3, G);
  return img;
}
/** Memorial candle beside a seat whose player died in the night (A on the ground), 7x13, flame 3 drawings at 7.5 fps. */
export function candle(k, T) {
  const img = new PixelImage(7, 13);
  const P = { hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh, line: handLine(T) };
  const body = bits(['', '', '', '', '', '..###..', '..###..', '..###..', '..###..', '..###..', '.#####.', '.#####.'], undefined, 7, 13);
  img.blit(shade(body, P), 0, 0);
  const fl = [[[3, 2], [3, 3], [3, 4]], [[3, 1], [3, 2], [2, 3], [3, 3], [3, 4]], [[3, 2], [4, 2], [3, 3], [3, 4]]][k];
  const fm = new PixelImage(7, 13);
  fl.forEach(([x, y], i) => fm.set(x, y, i === fl.length - 1 ? T.gold : T.goldHi));
  fm.set(3, 4, T.warn);
  fm.outline(T.goldLine);
  img.blit(fm, 0, 0);
  return img;
}
/** 2D halo (drop-in for renderers whose character has no 3D halo; pixel3d ghosts carry their own): 11x5, 2 shimmer drawings. */
export function ghostHalo(k, T) {
  const img = new PixelImage(11, 5);
  img.ring(5.5, 2.5, 5, 2, T.gold);
  img.set(k ? 7 : 3, 1, T.goldHi); img.set(k ? 8 : 2, 1, T.goldHi);
  img.outline(T.goldLine);
  return img;
}

// ------------------------------------------------------------------------------------------------ banners (S)
/** Banner height (rows incl. the 1-px drop shadow): room for a 2x title + a tiny subtitle. */
export const BANNER_H = 34;
const bannerTones = (T, style) => (style === 'parchment'
  ? { f: T.parchment, h: T.parchmentHi, s: T.parchmentSh, o: rampOf(T.parchment, { line: 0.5 }).line, g: T.goldSh }
  : { f: T.ink, h: T.inkRaised, s: T.inkSunk, o: T.outline, g: T.gold });
/** Colour of banner row j for the ribbon body (shared by the end and the middle tile). */
function bannerRow(j, P, T) {
  const H = BANNER_H;
  if (j === 0 || j === H - 2) return P.o;
  if (j === 1 || j === H - 3) return P.g;
  if (j === 2) return P.h;
  if (j === H - 1) return T.shadow;
  return P.f;
}
/**
 * Banner ribbon end (left; the right end = flipX), 12 x BANNER_H: a swallowtail notch cut into the outer 5 px (a V
 * whose edge is the ribbon line, a gold keyline just inside), the ribbon body with gold keylines top and bottom.
 */
export function bannerEnd(T, style = 'ink') {
  const P = bannerTones(T, style), H = BANNER_H, W = 12, mid = (H - 2) / 2;
  const img = new PixelImage(W, H);
  const notch = (j) => Math.round(5 * (1 - Math.abs(j + 0.5 - mid) / mid));   // 0 at the corners, 5 at the middle
  const inside = (x, j) => j >= 0 && j <= H - 2 && x >= notch(j) && x < W;
  for (let j = 0; j < H; j++) for (let x = 0; x < W; x++) {
    if (j === H - 1) { if (x >= notch(j - 1) + 1) img.set(x, j, T.shadow); continue; }
    if (!inside(x, j)) continue;
    let c = bannerRow(j, P, T);
    if (j > 0 && j < H - 2) {
      if (!inside(x - 1, j) || !inside(x - 1, j - 1) || !inside(x - 1, j + 1)) c = P.o;
      else if ((!inside(x - 2, j) || !inside(x - 2, j - 1) || !inside(x - 2, j + 1)) && j > 1 && j < H - 3) c = P.g;
    }
    img.set(x, j, c);
  }
  return img;
}
/** 1-px banner middle tile (BANNER_H tall), the same rows as bannerEnd. */
export function bannerMid(T, style = 'ink') {
  const P = bannerTones(T, style), img = new PixelImage(1, BANNER_H);
  for (let j = 0; j < BANNER_H; j++) img.set(0, j, bannerRow(j, P, T));
  return img;
}
/** Banner emblems, 21x21 medallions (lit discs + a motif): start = the town bell, good = sun, evil = horned moon. */
export function emblem(kind, T) {
  const img = new PixelImage(21, 21);
  const base = kind === 'good' ? rampOf(T.good, { line: 0.34 }) : kind === 'evil' ? rampOf(T.evil, { line: 0.34 }) : { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine };
  const disc = new PixelImage(21, 21);
  disc.disc(10.5, 10.5, 9.5, base.mid);
  img.blit(shade(disc, base), 0, 0);
  img.disc(10.5, 10.5, 7.2, kind === 'start' ? T.inkSunk : T.ink);
  const motif = {
    start: ['....#....', '...###...', '..#####..', '..#####..', '..#####..', '.#######.', '#########', '....#....'],
    good: ['....#....', '.#..#..#.', '..#####..', '..#####..', '#########', '..#####..', '..#####..', '.#..#..#.', '....#....'],
    evil: ['...####..', '..##.....', '.##...#..', '.##..###.', '.##...#..', '.##......', '..##.....', '...####..'],   // crescent + star
  }[kind];
  const M = kind === 'evil' ? { hi: T.evil, mid: rampOf(T.evil).sh, sh: rampOf(T.evil).line, line: T.outline } : { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.outline };
  const mm = bits(motif, undefined, 21, 21);
  const mo = new PixelImage(21, 21);
  mo.blit(mm, 6, Math.round(10.5 - motif.length / 2));
  const sh = shade(mo, { ...M, line: null }, { lineOut: false });
  img.blit(sh, 0, 0);
  return img;
}
/** Text helper used by banners/captions: tracked small caps-ish title (body font, 2-px tracking). */
export function trackedWidth(s, extra = 1) { return textWidth(s) + Math.max(0, [...s].length - 1) * extra; }
export function drawTracked(img, x, y, s, { color, shadow = null, extra = 1 } = {}) {
  let cx = x;
  for (const ch of s) {
    drawText(img, cx, y, ch, { color, shadow });
    cx += (ch === ' ' ? 2 : textWidth(ch)) + 1 + extra;
  }
}

// ------------------------------------------------------------------------------------------------ frame list
/** Every frame of the events atlas, in pack order (v2 names first). */
export function buildFrames(T) {
  const F = [];
  for (let f = 0; f < 6; f++) F.push([`poof_${f}`, poof(f, T)]);
  F.push(['glow_warm', glow('warm', T)], ['glow_cool', glow('cool', T)]);
  F.push(['seat_stone', seatStone(T)]);
  for (let k = 0; k < 4; k++) F.push([`seat_you_${k}`, seatYou(k, T)]);
  for (let k = 0; k < 2; k++) F.push([`seat_dead_${k}`, seatDead(k, T)]);
  F.push(['seat_nominee', seatNominee(T)]);
  for (let k = 0; k < 3; k++) F.push([`vote_pulse_${k}`, votePulse(k, T)]);
  F.push(['nominee_ring', nomineeRing(T)], ['vote_hub', voteHub(T)]);
  for (const d of DIRS8) F.push([`vote_tip_${d}`, voteTip(d, T)]);
  F.push(['hand_pop', handPop(T)], ['hand_raised_0', handRaised(0, T)], ['hand_raised_1', handRaised(1, T)], ['hand_locked', handLocked(T)], ['hand_ghost', handGhost(T)], ['hand_ghost_locked', handGhostLocked(T)]);
  for (let k = 0; k < 3; k++) F.push([`hand_lock_${k}`, handLock(k, T)]);
  F.push(['vc_face', vcFace(T)]);
  for (const s of ['idle', 'yes', 'no', 'raised0', 'raised1', 'dead', 'nominee', 'current']) F.push([`vc_seat_${s}`, vcSeat(s, T)]);
  F.push(['caption_end', captionEnd(T)], ['caption_mid', captionMid(T)]);
  for (const g of ['moon', 'sun', 'bell', 'candle', 'hand']) F.push([`glyph_${g}`, glyph(g, T)]);
  for (let k = 0; k < 4; k++) F.push([`veil_${k}`, veilTile(k, T.shadow)]);
  for (let k = 0; k < 4; k++) F.push([`toll_${k}`, toll(k, T)]);
  for (let k = 0; k < 3; k++) F.push([`bell_${k}`, bell(k, T)]);
  for (let k = 0; k < 6; k++) F.push([`wisp_${k}`, wisp(k, T)]);
  for (let k = 0; k < 4; k++) F.push([`reveal_${k}`, reveal(k, T)]);
  for (let k = 0; k < 3; k++) F.push([`candle_${k}`, candle(k, T)]);
  for (let k = 0; k < 2; k++) F.push([`ghost_halo_${k}`, ghostHalo(k, T)]);
  F.push(['banner_end', bannerEnd(T)], ['banner_mid', bannerMid(T)], ['banner_end_parchment', bannerEnd(T, 'parchment')], ['banner_mid_parchment', bannerMid(T, 'parchment')]);
  for (const e of ['start', 'good', 'evil']) F.push([`emblem_${e}`, emblem(e, T)]);
  return F;
}
export { mix };
export const rgbaOf = (c) => rgba(c);
