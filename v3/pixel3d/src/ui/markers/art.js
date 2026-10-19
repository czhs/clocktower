// Markers art (owner: markers group; docs/UI.md §1 rows 1-8, §4 "markers"). Pure JS, deterministic: every frame of the
// v2 social markers (pins, pin shadow, pin drop, pointing finger, ping) re-drawn in the pixel3d UI language, plus the
// new-style extras (pin remove badge, trail dots, place-point chevron, Storyteller pick crosshair).
//
//   import { markerFrames } from './art.js';
//   const F = markerFrames(tokens('night'));   // Map name -> PixelImage (cached per token set), v2 names kept verbatim
//
// Language (docs/UI.md §2): 1 px = 1 scene texel, binary alpha, light from the upper left, 3 tones per material + a
// 1-px line in the material's own darker/cooler shade (+ an optional cream rim), never black, never rotated or scaled.
// Colours come from the kit tokens (gold, parchment, danger, ironSh/outline) and PIN_RAMPS (kit), nothing else.
import { PixelImage, ramp, PIN_COLORS, PIN_RAMPS, PIN_HEX } from '../kit.js';

// ------------------------------------------------------------------------------------------------ v2 contract
export const POINT_DIRS = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
export const POINT_VEC = {
  right: [1, 0], 'down-right': [0.7071, 0.7071], down: [0, 1], 'down-left': [-0.7071, 0.7071],
  left: [-1, 0], 'up-left': [-0.7071, -0.7071], up: [0, -1], 'up-right': [0.7071, -0.7071],
};
/** v2 meta.point, kept verbatim (size/offset in px = texels). */
export const POINT = { dirs: POINT_DIRS, frames: 3, sequence: [0, 1, 2, 1], vectors: POINT_VEC, size: 20, offset: 14 };
export const PIN_W = 18, PIN_H = 26;
/** v2 meta.pinIcon: the 12x12 icon_<castId> goes at (left, top) inside the pin frame. */
export const PIN_ICON = { x: 9, y: 9, r: 6, left: 3, top: 3 };
/** Anchors: v2 keys verbatim (pin, pin_shadow, pin_drop, point, ping) + new-style extras. */
export const ANCHORS = {
  pin: { x: 8, y: 25 }, pin_shadow: { x: 6, y: 2 }, pin_drop: { x: 13, y: 12 }, point: { x: 10, y: 10 }, ping: { x: 14, y: 7 },
  pin_remove: { x: 4, y: 4 }, trail: { x: 1, y: 1 }, ping_mark: { x: 4, y: 5 }, pick: { x: 12, y: 12 },
};
/** New-style rates on the 30 Hz grid (docs/UI.md §2.8): v2 14 -> 15 (hold 2), 8 -> 7.5 (hold 4), 10 -> 10 (hold 3). */
export const FPS = { pin_drop: 15, point: 7.5, ping: 10, pick: 7.5 };
export const V2_FPS = { pin_drop: 14, point: 8, ping: 10 };

// ------------------------------------------------------------------------------------------------ palette
/** Materials for one token set (tokens(tod)). Lines = the material's own ramp line (darker, cooler), never black. */
export function palette(T) {
  return {
    T,
    // the glove: parchment ramp; its line is the parchment ramp pushed darker (the token parchmentLine #7C6546 has the
    // same value as the cobbles and vanished on them; ramp(parchment, {line: .44}) keeps the hue family, reads on grass,
    // cobbles and the night ground)
    // r2 (critic: the glove vanished on noon cobbles of the same value): a deeper own-family line (.58, near the
    // labelLine value that makes names read on the same cobbles) and a darker shade band (dark .2) so the lower-right
    // half of the glove separates from the sunlit cobble tops; hi/mid stay parchment (the v2 glove colour)
    glove: { hi: T.parchmentHi, mid: T.parchment, sh: ramp(T.parchment, { dark: 0.2 }).sh, line: ramp(T.parchment, { line: 0.58 }).line },
    gold: { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine },
    dust: { hi: T.parchmentHi, mid: T.parchmentSh, sh: T.parchmentLine },
    danger: ramp(T.danger),
    shadow: { mid: T.ironSh, core: T.outline },
    rim: T.parchmentHi,          // cream rim (top-left convex edges only)
  };
}

// ------------------------------------------------------------------------------------------------ helpers
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/**
 * Paint a label grid (rows of chars) with auto shading lit from the upper left, then a 1-px 4-neighbour outline in the
 * line colour of the material it borders. mats: {char: {hi, mid, sh, line, flat?}}; flat materials keep one colour.
 */
function paintGrid(img, g, ox, oy, mats, alias = {}) {
  const at = (x, y) => (g[y - oy]?.[x - ox] ?? '.');
  const solid = (x, y) => at(x, y) !== '.';
  const H = g.length, W = g[0].length;
  for (let y = oy; y < oy + H; y++) for (let x = ox; x < ox + W; x++) {
    const ch = at(x, y);
    if (ch === '.') continue;
    const m = mats[ch];
    if (m.flat) { img.set(x, y, m.flat); continue; }
    const lit = !solid(x - 1, y) || !solid(x, y - 1);
    const dark = !solid(x + 1, y) || !solid(x, y + 1);
    // form shadow: the lower-right body two texels in from an open edge below-right reads as volume
    const deep = !dark && (!solid(x + 1, y + 1) || !solid(x, y + 2)) && !lit;
    img.set(x, y, lit && !dark ? m.hi : (dark && !lit) || deep ? m.sh : m.mid);
  }
  const hits = [];
  for (let y = oy - 1; y <= oy + H; y++) for (let x = ox - 1; x <= ox + W; x++) {
    if (solid(x, y)) continue;
    for (const [dx, dy] of N4) {
      const n = at(x + dx, y + dy);
      if (n !== '.') { hits.push(x, y, mats[alias[n] ?? n].line); break; }
    }
  }
  for (let i = 0; i < hits.length; i += 3) img.set(hits[i], hits[i + 1], hits[i + 2]);
  return img;
}
/** 1-px ellipse ring (same pixel rule as PixelImage.ring) with a per-pixel colour (null = skip). */
function ellipseRing(img, cx, cy, rx, ry, colorAt) {
  const ins = (x, y) => { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy <= 1; };
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++)
      if (ins(x, y) && (!ins(x + 1, y) || !ins(x - 1, y) || !ins(x, y + 1) || !ins(x, y - 1))) {
        const c = colorAt(x, y);
        if (c) img.set(x, y, c);
      }
  return ins;
}

// ------------------------------------------------------------------------------------------------ pointing finger
// A parchment glove with a gold cuff, index finger out, lit from the upper left (shading is computed AFTER the grid
// is rotated, so every direction keeps the same light). 'g' glove, 'c' cuff, 'k' knuckle crease, '.' empty.
const RIGHT = [
  '...ggg.......',
  'ccgggggg.....',
  'ccggggggggggg',
  'ccggggggggggg',
  'ccggggggkk...',
  'ccgggggggg...',
  'ccggggggkk...',
  'ccggggggg....',
  '..gggggg.....',
];
const UPRIGHT = [
  '..........gg',
  '.........ggg',
  '........ggg.',
  '.......ggg..',
  '...gggggg...',
  '..ggggggkk..',
  '.cggggggggg.',
  'ccgggggggk..',
  'cggggggggg..',
  'ccggggggk...',
  '.ccgggggg...',
  '..ccggg.....',
];
const rotCW = (g) => { const h = g.length, w = g[0].length; return Array.from({ length: w }, (_, y) => Array.from({ length: h }, (_, x) => g[h - 1 - x][y]).join('')); };
const flipX = (g) => g.map((r) => [...r].reverse().join(''));
function handGrid(dir) {
  switch (dir) {
    case 'right': return RIGHT;
    case 'left': return flipX(RIGHT);
    case 'down': return rotCW(RIGHT);
    case 'up': return rotCW(rotCW(rotCW(RIGHT)));
    case 'up-right': return UPRIGHT;
    case 'up-left': return flipX(UPRIGHT);
    case 'down-right': return rotCW(UPRIGHT);
    case 'down-left': return flipX(rotCW(UPRIGHT));
  }
  throw new Error(`markers: unknown point dir ${dir}`);
}
/** Fist centre (centroid weighted toward interior texels, as v2) so every direction pivots on the same point. */
function fistCentre(g) {
  let sx = 0, sy = 0, n = 0;
  g.forEach((r, y) => [...r].forEach((v, x) => {
    if (v === '.') return;
    let k = 0;
    for (const [dx, dy] of N4) if ((g[y + dy]?.[x + dx] ?? '.') !== '.') k++;
    const w = k === 4 ? 3 : 1;
    sx += (x + 0.5) * w; sy += (y + 0.5) * w; n += w;
  }));
  return [sx / n, sy / n];
}
/** point_<dir>_<f>: 20x20, fist centre on anchor (10,10), jab 0/1/2 texels along the direction (v2 JAB x1.2). */
export function drawHand(dir, f, P) {
  const g = handGrid(dir), [fx, fy] = fistCentre(g), [vx, vy] = POINT_VEC[dir];
  const j = [0, 1, 2][f] * 1.2;
  const S = POINT.size, gw = g[0].length, gh = g.length;
  // keep shape + outline inside the frame (a clipped fingertip would read as a different finger length per frame)
  const ox = Math.max(1, Math.min(S - 1 - gw, Math.round(ANCHORS.point.x - fx + vx * j)));
  const oy = Math.max(1, Math.min(S - 1 - gh, Math.round(ANCHORS.point.y - fy + vy * j)));
  const img = new PixelImage(S, S);
  const glove = P.glove;
  paintGrid(img, g, ox, oy, { g: glove, c: P.gold, k: { flat: glove.sh, line: glove.line } }, { k: 'g' });
  if (f === 2) {
    // speed ticks behind the fist on the jab frame (2-texel dashes, glove shadow tone, no line: they are air)
    const px = -vy, py = vx;
    for (const s of [-1, 1]) {
      const bx = ANCHORS.point.x - vx * 8 + px * s * 3, by = ANCHORS.point.y - vy * 8 + py * s * 3;
      for (const d of [0, 1]) {
        const x = Math.round(bx - vx * d), y = Math.round(by - vy * d);
        if (!img.alpha(x, y)) img.set(x, y, glove.sh);
      }
    }
  }
  return img;
}

// ------------------------------------------------------------------------------------------------ ping (ground)
/** ping_<f>: 28x14 ground ring pulse at anchor (14,7), 4 frames looped at 10 fps. Tier Ag (hidden under characters). */
export function drawPing(f, P) {
  const img = new PixelImage(28, 14), G = P.gold, cx = 14, cy = 7;
  // a 1-px goldLine just OUTSIDE a ring (readability on light cobbles and grass; v2 had a dark under-stroke)
  const lineOut = (ins) => {
    const hits = [];
    for (let y = 0; y < 14; y++) for (let x = 0; x < 28; x++)
      if (!ins(x, y) && !img.alpha(x, y) && N4.some(([dx, dy]) => ins(x + dx, y + dy) && img.alpha(x + dx, y + dy))) hits.push([x, y]);
    for (const [x, y] of hits) img.set(x, y, G.line);
  };
  // the expanding wave first (the steady base ring stays on top where they touch)
  if (f === 1) lineOut(ellipseRing(img, cx, cy, 9, 4.5, (x, y) => (y < cy ? G.hi : G.mid)));
  if (f === 2) lineOut(ellipseRing(img, cx, cy, 12, 6, (x, y) => (y < cy ? G.mid : G.sh)));
  if (f === 3) ellipseRing(img, cx, cy, 13, 6.5, (x, y) => (((x + y) & 1) ? G.sh : null));   // dissolving: no line
  // steady base ring: lit far-left arc, gold elsewhere, outlined (its near-side line = contact on the ground)
  const base = new PixelImage(28, 14);
  const ins = ellipseRing(base, cx, cy, 6, 3, (x, y) => (y < cy && x < cx ? G.hi : G.mid));
  for (let y = 0; y < 14; y++) for (let x = 0; x < 28; x++) if (base.alpha(x, y)) img.set(x, y, base.get(x, y));
  for (let y = 0; y < 14; y++) for (let x = 0; x < 28; x++)
    if (!base.alpha(x, y) && N4.some(([dx, dy]) => base.alpha(x + dx, y + dy)) && !ins(x, y)) img.set(x, y, G.line);
  if (f === 0) { img.rect(cx - 2, cy - 1, 4, 2, G.mid); img.rect(cx - 1, cy - 1, 2, 1, G.hi); }
  return img;
}

// ------------------------------------------------------------------------------------------------ map pins
const HC = 9, HR = 9;
/** Teardrop mask (v2 pins.ts geometry, so the anchor and icon disc stay identical): head circle + cone to the tip. */
const PIN_MASK = (() => {
  const m = [], tip = ANCHORS.pin;
  const d = tip.y + 0.9 - HC, a = Math.acos(HR / d), tx = HR * Math.sin(a), ty = HC + HR * Math.cos(a);
  const ax = tip.x + 0.5, ay = tip.y + 0.9;
  for (let y = 0; y < PIN_H; y++) {
    const row = [];
    for (let x = 0; x < PIN_W; x++) {
      const px = x + 0.5, py = y + 0.5;
      let inside = (px - HC) ** 2 + (py - HC) ** 2 <= HR * HR - 0.6;
      if (!inside && py >= ty && py <= ay) {
        const t = (py - ty) / (ay - ty), l = HC - tx + (ax - (HC - tx)) * t, r = HC + tx + (ax - (HC + tx)) * t;
        inside = px >= l - 0.15 && px <= r + 0.15;
      }
      row.push(inside);
    }
    m.push(row);
  }
  for (let x = 0; x < PIN_W; x++) m[tip.y][x] = x === tip.x;
  return m;
})();
/** Inside the 12x12 icon disc (icon-local coords). */
export const inIconDisc = (x, y) => (x + 0.5 - 6) ** 2 + (y + 0.5 - 6) ** 2 <= 36;
/** Inside the disc AND not on its 1-px edge (4-neighbour): where a dropper icon goes; the edge = the socket ring. */
export const inIconInner = (x, y) => inIconDisc(x, y) && inIconDisc(x - 1, y) && inIconDisc(x + 1, y) && inIconDisc(x, y - 1) && inIconDisc(x, y + 1);
/**
 * Pin ramps used by the art: PIN_RAMPS (kit) except black. The kit's black ramp has a LIGHT line (#A49CB4), so pin_black
 * read as a grey hollow ring (critic r1). Here black is a real dark body (the v2 hex #2c2636 as mid), a lifted hi band
 * for the lit upper-left, and a deeper own-family line; the cream rim glint gives the edge on dark ground.
 */
export const PIN_ART = { ...PIN_RAMPS, black: { ...ramp(PIN_HEX.black, { light: 0.2, dark: 0.05, line: 0.1 }), mid: PIN_HEX.black } };
/**
 * pin_<color>: 18x26, tip anchor (8,25). A small lit object: a ring around a recessed parchment socket (icon goes in
 * at pinIcon), hi / mid / sh by the upper-left light, the inner lip shaded opposite to the outer (it is a donut), a
 * cone lit on its left face, a cream rim glint top-left, and the 1-px line from the pin's own ramp.
 */
export function drawPin(color, P) {
  const R = PIN_ART[color], T = P.T, img = new PixelImage(PIN_W, PIN_H);
  const M = (x, y) => x >= 0 && y >= 0 && x < PIN_W && y < PIN_H && PIN_MASK[y][x];
  const sock = (x, y) => inIconDisc(x - PIN_ICON.left, y - PIN_ICON.top);
  const tip = ANCHORS.pin;
  for (let y = 0; y < PIN_H; y++) for (let x = 0; x < PIN_W; x++) {
    if (!M(x, y)) continue;
    if (!M(x - 1, y) || !M(x + 1, y) || !M(x, y - 1) || !M(x, y + 1)) { img.set(x, y, R.line); continue; }
    if (sock(x, y)) {
      // recessed socket. r2: its 1-px edge is a ring the icon never covers (icons go on inIconInner only), so any
      // icon separates from any pin colour (the teal frog in the teal pin read as an empty disc): upper-left wall in
      // shadow, lower-right wall lit; the white pin (body = cream) rings in its own line instead
      const ix = x - PIN_ICON.left, iy = y - PIN_ICON.top;
      if (!inIconInner(ix, iy)) {
        const ul = ix + iy < 11;
        img.set(x, y, color === 'white' ? (ul ? R.line : R.sh) : ul ? T.parchmentSh : T.parchmentHi);
      } else img.set(x, y, T.parchment);
      continue;
    }
    const dx = x + 0.5 - HC, dy = y + 0.5 - HC, r = Math.hypot(dx, dy);
    let c;
    if (y + 0.5 > HC + 6.2 && r > HR - 1.2) {
      c = x < tip.x ? R.mid : R.sh;                         // cone: left face lit, right face shade
      if (x === tip.x - 1 && !M(x - 1, y)) c = R.mid;
    } else {
      const v = -(dx * 0.62 + dy * 0.78) / Math.max(1, r);
      c = v > 0.5 ? R.hi : v > -0.35 ? R.mid : R.sh;
      const nearSock = sock(x + 1, y) || sock(x, y + 1) || sock(x - 1, y) || sock(x, y - 1);
      if (nearSock && v > 0.3) c = R.sh;                     // inner lip facing away from the light
      else if (nearSock && v < -0.45) c = R.hi;              // inner lip facing the light
    }
    img.set(x, y, c);
  }
  // cream rim on the upper-left convex edge (3 texels just inside the line); white pin: its own hi already is cream
  for (const [x, y] of [[3, 3], [2, 5], [5, 2]]) if (M(x, y)) img.set(x, y, color === 'white' ? R.hi : P.rim);
  return img;
}
/** pin_shadow: 12x5 at anchor (6,2): a solid cool contact ellipse (binary alpha) with a darker core under the tip. */
export function drawPinShadow(P) {
  const img = new PixelImage(12, 5);
  img.ellipse(6, 2.5, 6, 2.5, P.shadow.mid);
  img.rect(4, 2, 4, 1, P.shadow.core);
  img.rect(3, 2, 1, 1, P.shadow.mid);
  return img;
}
/**
 * pin_drop_<f>: 26x16 landing sparkle at anchor (13,12), 4 frames once at 15 fps: f0 impact star + dust ring,
 * f1 twinkles fan out + dust kicks, f2 smaller twinkles, f3 last motes. Gold sparks, parchment dust.
 */
export function drawPinDrop(f, P) {
  const img = new PixelImage(26, 16), G = P.gold, D = P.dust, ax = 13, ay = 12;
  // dust: a 2:1 ground ring kicked out from the tip, then puffs drifting sideways
  if (f === 0) ellipseRing(img, ax, ay + 0.5, 4, 1.5, (x, y) => (y <= ay ? D.mid : D.sh));
  if (f === 1) ellipseRing(img, ax, ay + 0.5, 7, 2.5, (x, y) => (((x + y) & 1) ? (y <= ay ? D.mid : D.sh) : null));
  const dd = [5, 8, 10, 11][f];
  for (const s of [-1, 1]) {
    const x = ax + s * dd - (s < 0 ? 1 : 0);
    if (f === 1) { img.set(x, ay - 1, D.mid); img.set(x + s, ay - 1, D.sh); }
    else if (f === 2) { img.set(x, ay - 1, D.mid); img.set(x + s, ay - 2, D.sh); }
    else if (f === 3) img.set(x, ay - 2, D.sh);
  }
  // r2: the gold sparks go on their own image and get a 1-px goldLine ring (as the ping rings), so they read on calm
  // noon grass of the same value (critic r1: invisible there); f1 adds a cream flash at the impact point
  const sp = new PixelImage(26, 16);
  const star = (x, y, core, arm, tipC) => {
    sp.set(x, y, core);
    for (const [ox, oy] of N4) sp.set(x + ox, y + oy, arm);
    if (tipC) for (const [ox, oy] of [[2, 0], [-2, 0], [0, -2]]) sp.set(x + ox, y + oy, tipC);
  };
  if (f === 0) star(ax, ay - 4, G.hi, G.mid, G.sh);
  else {
    const r = [0, 7, 9, 10][f];
    [-150, -112, -68, -30].forEach((deg, k) => {
      const a = (deg * Math.PI) / 180;
      const x = Math.round(ax - 0.5 + Math.cos(a) * r * 1.15), y = Math.round(ay - 4 + Math.sin(a) * r * 0.8);
      if (f === 1 && k % 3 === 0) star(x, y, G.hi, G.sh, null);
      else if (f === 1) { sp.set(x, y, G.hi); sp.set(x, y + 1, G.sh); }
      else if (f === 2) { sp.set(x, y, k % 3 === 0 ? G.hi : G.mid); sp.set(x, y + 1, G.sh); }
      else if (k % 3 === 0) sp.set(x, y, G.sh);
    });
    if (f === 1) { sp.set(ax - 1, ay + 1, P.rim); sp.set(ax, ay + 1, G.hi); }     // flash on the ground in front of the tip
  }
  sp.outline(G.line);
  img.blit(sp, 0, 0);
  return img;
}

// ------------------------------------------------------------------------------------------------ new-style extras
/** pin_remove: 9x9 badge (v2 BADGE: red disc + white cross) at anchor (4,4); danger ramp, cream cross. */
export function drawRemoveBadge(P) {
  const img = new PixelImage(9, 9), D = P.danger;
  const inD = (x, y) => (x - 4) ** 2 + (y - 4) ** 2 <= 4.6 * 4.6 - 0.5;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (!inD(x, y)) continue;
    const edge = !inD(x - 1, y) || !inD(x + 1, y) || !inD(x, y - 1) || !inD(x, y + 1);
    const v = -((x - 4) * 0.62 + (y - 4) * 0.78);
    img.set(x, y, edge ? D.line : v > 2.6 ? D.hi : v < -2.2 ? D.sh : D.mid);
  }
  for (let k = -2; k <= 2; k++) { img.set(4 + k, 4 + k, P.rim); img.set(4 + k, 4 - k, P.rim); }
  return img;
}
/** trail_0 (bright dot) / trail_1 (dim dot, nearest the hand): 3x3 plus-shaped dots, anchor (1,1). */
export function drawTrailDot(k, P) {
  const img = new PixelImage(3, 3), G = P.gold;
  for (const [ox, oy] of N4) img.set(1 + ox, 1 + oy, G.line);
  img.set(1, 1, k === 0 ? G.hi : G.sh);
  return img;
}
/** ping_mark: 9x6 chevron over a pointed PLACE (v2 drew a gold triangle there), tip anchor (4,5). */
export function drawPingMark(P) {
  const g = ['ggggggg', '.ggggg.', '..ggg..', '...g...'];
  const img = new PixelImage(9, 6);
  paintGrid(img, g, 1, 1, { g: P.gold });
  return img;
}
/**
 * pick_<f>: 25x25 Storyteller "pick a point" crosshair at anchor (12,12): gold ring r5 between two goldLine rings
 * (v2: soot r6 + gold r5), centre texel, 4 ticks that breathe outward 0/1/2 texels (seq 0,1,2,1 at 7.5 fps).
 */
export function drawPick(f, P) {
  const img = new PixelImage(25, 25), G = P.gold, c = 12.5;
  img.disc(c, c, 6.6, G.line); img.disc(c, c, 5.6, G.mid); img.disc(c, c, 4.6, G.line);
  // erase the ring's inside (a crosshair, not a disc), keep the line ring
  const ins = (x, y) => (x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2 <= 3.6 * 3.6;
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) if (ins(x, y)) img.erase(x, y);
  // lit upper-left arc of the gold ring
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
    const v = img.get(x, y); if (!v[3]) continue;
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    if (d > 4.6 && d <= 5.6 && x + y < 22) img.set(x, y, G.hi);
  }
  img.set(12, 12, G.hi);
  // ticks: 1-px gold strokes with their own goldLine outline (outlined apart, so the rings keep single lines)
  const t = new PixelImage(25, 25), d0 = 7 + f;
  for (let k = 0; k < 3; k++) {
    t.set(12 + d0 + k, 12, G.mid); t.set(12 - d0 - k, 12, G.mid);
    t.set(12, 12 + d0 + k, G.mid); t.set(12, 12 - d0 - k, G.mid);
  }
  t.set(12 - d0, 12, G.hi); t.set(12, 12 - d0, G.hi);   // the inner tip of the lit ticks
  t.outline(G.line);
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) if (t.alpha(x, y) && !img.alpha(x, y)) img.set(x, y, t.get(x, y));
  return img;
}

// ------------------------------------------------------------------------------------------------ the frame set
/** Every frame of the group, v2 order first (social.json layout), then the new-style extras. [[name, PixelImage]]. */
export function buildFrames(T) {
  const P = palette(T), out = [];
  for (const c of PIN_COLORS) out.push([`pin_${c}`, drawPin(c, P)]);
  out.push(['pin_shadow', drawPinShadow(P)]);
  for (let f = 0; f < 4; f++) out.push([`pin_drop_${f}`, drawPinDrop(f, P)]);
  for (const d of POINT_DIRS) for (let f = 0; f < 3; f++) out.push([`point_${d}_${f}`, drawHand(d, f, P)]);
  for (let f = 0; f < 4; f++) out.push([`ping_${f}`, drawPing(f, P)]);
  out.push(['pin_remove', drawRemoveBadge(P)]);
  out.push(['trail_0', drawTrailDot(0, P)], ['trail_1', drawTrailDot(1, P)]);
  out.push(['ping_mark', drawPingMark(P)]);
  for (let f = 0; f < 3; f++) out.push([`pick_${f}`, drawPick(f, P)]);
  return out;
}
const _cache = new Map();
/** Cached Map name -> PixelImage for a token set. */
export function markerFrames(T) {
  let m = _cache.get(T);
  if (!m) { m = new Map(buildFrames(T)); _cache.set(T, m); }
  return m;
}
export { PIN_COLORS };
// (variants task, additive) shared with the v2-size finger variant (v2size.js): same painter, so both sizes keep one look
export { paintGrid, fistCentre, rotCW, flipX as flipGridX };
