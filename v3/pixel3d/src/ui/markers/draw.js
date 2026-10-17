// Markers runtime (owner: markers group): how the v2 game uses the marker frames, re-timed on the 30 Hz grid. Pure JS
// over the UI layers (src/ui/layer.js): everything takes integer layer pixels (L.at(worldPoint)) and an age in
// seconds, so it is a pure function of the stage time (deterministic, freezable with ?t=).
//
//   import { drawPoint, drawPlacePin, drawPersonPins, drawPick } from './draw.js';
//   drawPoint(L, F, { head, aim, spot, person: true, age });        // finger + trail (L.world), ping (L.ground)
//   drawPlacePin(L, F, { spot, color: 'teal', icon, age });          // shadow + drop sparkle (L.ground), pin (L.world)
//   drawPersonPins(L, F, { cx, labelTop, pins: [{color, icon, age}], t });
//
// v2 durations kept (docs/UI.md §2.8): EMOTE_POINT_MS 3500, DROP_MS 460 (fall + dig-in curve of v2 index.ts), POP_MS 170
// (removal = 3-step Bayer dissolve over 5 grid frames), SETTLE_MS 900 (pins already present when you arrive do not
// drop). Appear = 2-grid-frame pop, disappear = 3-step dissolve at 15 fps; never alpha fades. still = reduced motion.
//
// Phases (r2). One scene function is called once per phase with a phase-tagged layer object (stage.js M.phase / M.register):
//   'pins'   the depth-tested pin pass (pinPass.js, order 301, masked by L.world): place-pin bodies + their shadow / drop sparkle
//   'trail'  L at z 15, BELOW the indicators (labels / chat bubbles, z 20): the marching point trail, so it never
//            prints over bubble text (critic r1)
//   'main'   L at z 30: finger, ping, place chevron, person pins, remove badges, the ST crosshair
//   (none)   the 2D drop-in fallback: everything on L.world / L.ground in one call (no depth test)
import { PixelImage, GRID_HZ, frameAt, dissolve, drawText, textWidth, loadImage } from '../kit.js';
import { ANCHORS, POINT, POINT_DIRS, POINT_VEC, PIN_ICON, FPS, inIconInner } from './art.js';

const wants = (L, ph) => L.phase === undefined || L.phase === ph;

export const TIMING = {
  EMOTE_POINT_MS: 3500, DROP_MS: 460, POP_MS: 170, SETTLE_MS: 900,
  DROP_PX: 16,          // v2 30 css px / camera zoom ~ 16 texels of fall
  LAND_K: 0.68,         // v2: the needle touches down at 68 % of DROP_MS (sparkle starts on that drawing)
  TRAIL_GAP: 6,         // trail dot spacing (px), marching 1 px per 7.5 fps step
  OUT_FRAMES: 6,        // disappear: 3 dissolve steps x 2 grid frames (15 fps)
  POP_FRAMES: 5,        // pin removal: 170 ms = 5 grid frames, 3 dissolve steps (holds 2, 2, 1)
};
const gf = (s) => Math.floor(s * GRID_HZ + 1e-6);

/** v2 nearestDir: the direction whose vector is closest (max dot) to (dx, dy) in screen space (y down). */
export function nearestDir(dx, dy) {
  let best = POINT_DIRS[0], bd = -Infinity;
  const l = Math.hypot(dx, dy) || 1;
  for (const d of POINT_DIRS) { const [vx, vy] = POINT_VEC[d], v = (dx * vx + dy * vy) / l; if (v > bd + 1e-9) { bd = v; best = d; } }
  return best;
}

/** Blit frame `name` with its anchor on (x, y); k > 0 = Bayer dissolve anchored to the layer grid (no swimming). */
export function put(img, F, name, x, y, akey, k = 0) {
  const src = F.get(name);
  if (!src) throw new Error(`markers: no frame ${name}`);
  const a = ANCHORS[akey], dx = Math.round(x) - a.x, dy = Math.round(y) - a.y;
  if (k > 0) { const c = src.clone(); dissolve(c, k, dx, dy); img.blit(c, dx, dy); } else img.blit(src, dx, dy);
}

// ------------------------------------------------------------------------------------------------ point
/** Point emote envelope: null = hidden; {pop, dis} (pop on the first 2 grid frames, 3-step dissolve at the end). */
export function pointEnvelope(age, still = false) {
  const life = TIMING.EMOTE_POINT_MS / 1000;
  if (age < 0 || age >= life) return null;
  const out = gf(life) - TIMING.OUT_FRAMES, g = gf(age);
  return { pop: !still && g < 2, dis: g >= out ? [0.25, 0.5, 0.75][Math.min(2, (g - out) >> 1)] : 0 };
}
/**
 * The point emote. head = emoter head point (layer px), aim = where the finger aims (a person: mid-body; a place: the
 * spot), spot = where the ping lies (a person: their feet), person = target is a character (no chevron).
 */
export function drawPoint(L, F, { head, aim, spot, person = true, age, still = false }) {
  const e = pointEnvelope(age, still);
  if (!e || L.phase === 'pins') return null;
  const dir = nearestDir(aim.x - head.x, aim.y - head.y), [vx, vy] = POINT_VEC[dir];
  const off = POINT.offset - (e.pop ? 3 : 0);                 // pop: the hand starts 3 px closer to the head
  const hx = Math.round(head.x + vx * off), hy = Math.round(head.y + vy * off);
  // ping on the ground at the spot (under characters)
  const pf = e.pop ? 0 : still ? 1 : frameAt(age, FPS.ping, 4);
  const main = wants(L, 'main');
  if (main) put(L.ground, F, `ping_${pf}`, spot.x, spot.y, 'ping', e.dis);
  if (main && !person) put(L.world, F, 'ping_mark', spot.x, spot.y - 4 - (still ? 0 : frameAt(age, 2, 2)), 'ping_mark', e.dis);
  // dotted trail from the fingertip toward the aim point, marching away from the hand
  const tx = hx + vx * (POINT.size / 2), ty = hy + vy * (POINT.size / 2);
  const ddx = aim.x - tx, ddy = aim.y - ty, dist = Math.hypot(ddx, ddy), gap = TIMING.TRAIL_GAP;
  if (wants(L, 'trail') && !e.pop && dist > gap * 2) {
    const ux = ddx / dist, uy = ddy / dist, end = dist - 6;
    const phase = still ? 0 : frameAt(age, 7.5, gap);
    for (let d = 3 + phase; d < end; d += gap)
      put(L.world, F, d < 3 + gap - 1 ? 'trail_1' : 'trail_0', tx + ux * d, ty + uy * d, 'trail', e.dis);
  }
  const f = still ? 0 : frameAt(age, FPS.point, 3, { seq: POINT.sequence });
  if (main) put(L.world, F, `point_${dir}_${f}`, hx, hy, 'point', e.dis);
  return { dir, f, hand: { x: hx, y: hy } };
}

// ------------------------------------------------------------------------------------------------ pins
/** Drop curve of v2 (fall with gravity, touch down at 68 %, a 2 px dig-in), sampled per 15 fps drawing. */
export function pinFall(age, still = false) {
  if (still || age < 0) return { yOff: 0, spark: -1 };
  const d = gf(age) >> 1, kk = (d * 2 / GRID_HZ) / (TIMING.DROP_MS / 1000);
  const land = Math.ceil(TIMING.LAND_K * (TIMING.DROP_MS / 1000) * GRID_HZ / 2 - 1e-9);
  const spark = d >= land && d - land < 4 ? d - land : -1;
  if (kk >= 1) return { yOff: 0, spark };
  const fall = kk < TIMING.LAND_K ? 1 - (kk / TIMING.LAND_K) ** 2 : -0.14 * Math.sin(((kk - TIMING.LAND_K) / (1 - TIMING.LAND_K)) * Math.PI);
  return { yOff: -Math.round(fall * TIMING.DROP_PX), spark };
}
/** Removal: null = gone, else the dissolve level (0 = not removing). */
export function pinRemoval(age, removeAt) {
  if (removeAt == null || age < removeAt) return 0;
  const g = gf(age - removeAt);
  return g >= TIMING.POP_FRAMES ? null : [0.25, 0.25, 0.5, 0.5, 0.75][g];
}
const _pins = new Map();
/**
 * pin_<color> with the dropper's 12x12 icon in its socket (cached composite). icon = PixelImage | null.
 * r2: the icon goes on the INNER disc only (inIconInner); the socket's 1-px edge ring of the pin frame stays, so a
 * teal frog in a teal pin (or any icon in a same-colour pin) no longer melts into the pin body.
 */
export function pinWithIcon(F, color, icon, key = '') {
  const id = `${color}|${key}|${F.size}`;
  let im = _pins.get(id);
  if (!im) {
    im = F.get(`pin_${color}`).clone();
    if (icon) for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++)
      if (inIconInner(x, y) && icon.alpha(x, y)) im.set(PIN_ICON.left + x, PIN_ICON.top + y, icon.get(x, y));
    _pins.set(id, im);
  }
  return im;
}
function blitPin(img, F, p, x, y, k) {
  const src = pinWithIcon(F, p.color, p.icon, p.iconKey), a = ANCHORS.pin, dx = Math.round(x) - a.x, dy = Math.round(y) - a.y;
  if (k > 0) { const c = src.clone(); dissolve(c, k, dx, dy); img.blit(c, dx, dy); } else img.blit(src, dx, dy);
}
/** Frame `name` by its anchor into the depth-tested pin pass (phase 'pins'). */
function putD(P, F, name, x, y, akey, d, k = 0) {
  const a = ANCHORS[akey];
  P.blitD(F.get(name), Math.round(x) - a.x, Math.round(y) - a.y, d, k);
}
/**
 * A place pin on the ground: spot = {x, y, d} (layer px of the marked point + its view depth, stage.js M.ground).
 * {color, icon, iconKey, age, removeAt, hover, settled, still}. Phase 'pins' (depth-tested, the default in the scenes):
 * shadow + sparkle + body + remove badge, hidden by whatever stands nearer the camera. No phase (2D fallback): shadow
 * and sparkle on L.ground, body on L.world (always on top).
 */
export function drawPlacePin(L, F, p) {
  const { spot, age, still = false } = p;
  if (age < 0 || L.phase === 'trail' || L.phase === 'main') return;
  const k = pinRemoval(age, p.removeAt);
  if (k === null) return;
  const { yOff, spark } = pinFall(p.settled ? 99 : age, still);
  const bx = spot.x - ANCHORS.pin.x + 15, by = spot.y + yOff - ANCHORS.pin.y + 2;
  if (L.phase === 'pins') {
    if (spot.d === undefined) throw new Error('markers: a depth-tested place pin needs spot.d (stage.js M.ground)');
    const d = spot.d;
    putD(L, F, 'pin_shadow', spot.x, spot.y, 'pin_shadow', d + 0.02, k);
    if (spark >= 0) putD(L, F, `pin_drop_${spark}`, spot.x, spot.y, 'pin_drop', d + 0.02);
    const src = pinWithIcon(F, p.color, p.icon, p.iconKey);
    L.blitD(src, Math.round(spot.x) - ANCHORS.pin.x, Math.round(spot.y + yOff) - ANCHORS.pin.y, d, k);
    if (p.hover && !k) putD(L, F, 'pin_remove', bx, by, 'pin_remove', d - 0.01);
    return;
  }
  put(L.ground, F, 'pin_shadow', spot.x, spot.y, 'pin_shadow', k);
  if (spark >= 0) put(L.ground, F, `pin_drop_${spark}`, spot.x, spot.y, 'pin_drop');
  blitPin(L.world, F, p, spot.x, spot.y + yOff, k);
  if (p.hover && !k) put(L.world, F, 'pin_remove', bx, by, 'pin_remove');
}
/**
 * Pins on a person: tip 1 px above the name label (labelTop = label box top), fanned (v2 fanSlot without the
 * rotation: new-style sprites never rotate), 1-px bob at 2 fps, later pins on top. pins: [{color, icon, iconKey, age}].
 */
export function drawPersonPins(L, F, { cx, labelTop, pins, t, still = false, hover = -1 }) {
  if (!wants(L, 'main')) return;
  const n = pins.length, mid = (n - 1) / 2, spread = Math.min(0.62, 2.4 / Math.max(1, n));
  pins.forEach((p, i) => {
    if (p.age < 0) return;
    const k = pinRemoval(p.age, p.removeAt);
    if (k === null) return;
    const kk = i - mid;
    const dx = n > 1 ? Math.round(kk * 18 * spread) : 0, dy = n > 1 ? Math.round(Math.abs(kk) * 1.5) : 0;
    const bob = still ? 0 : frameAt(t + i * 0.65, 2, 4, { seq: [0, 0, 1, 1] });
    const { yOff, spark } = pinFall(p.settled ? 99 : p.age, still);
    const x = cx + dx, y = labelTop - 1 + dy - bob + yOff;
    blitPin(L.world, F, p, x, y, k);
    if (spark >= 0) put(L.world, F, `pin_drop_${spark}`, x, labelTop - 1 + dy, 'pin_drop');
    if (hover === i && !k) put(L.world, F, 'pin_remove', x - ANCHORS.pin.x + 15, y - ANCHORS.pin.y + 2, 'pin_remove');
  });
}

// ------------------------------------------------------------------------------------------------ storyteller pick
/**
 * The ST pick crosshair + its label (and an optional tiny hint line under it). r2: the label block takes the first of
 * right-below / left-below / right-above / left-above that does not overlap `avoid` (world label / bubble rects
 * {x, y, w, h} in layer px; stage.js M.labelRects), so it never lands on a name label (critic r1: on Dov's name).
 * Returns the chosen block rect.
 */
export function drawPick(L, F, { at, label, hint = null, t, still = false, T, avoid = [] }) {
  if (!wants(L, 'main')) return null;
  const f = still ? 0 : frameAt(t, FPS.pick, 3, { seq: POINT.sequence });
  put(L.world, F, `pick_${f}`, at.x, at.y, 'pick');
  if (!label) return null;
  const w = Math.max(textWidth(label), hint ? textWidth(hint, 'tiny') : 0) + 2, h = hint ? 19 : 10;
  const cands = [[at.x + 10, at.y + 6], [at.x - 10 - w, at.y + 6], [at.x + 10, at.y - 6 - h], [at.x - 10 - w, at.y - 6 - h]];
  const hit = (x, y) => avoid.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
  const [x, y] = cands.find(([cx, cy]) => !hit(cx, cy)) ?? cands[0];
  drawText(L.world, x + 1, y + 1, label, { color: T.st, outline: T.labelLine });
  if (hint) drawText(L.world, x + 1, y + 11, hint, { font: 'tiny', color: T.textDim, outline: T.labelLine });
  return { x, y, w, h };
}

// ------------------------------------------------------------------------------------------------ icons
/** Stand-in icon (until the portraits group bakes icon_<castId>): the dropper's initial in the parchment socket. */
export function initialIcon(letter, T) {
  const im = new PixelImage(12, 12);
  drawText(im, 6, 3, letter, { color: T.textInk, align: 'center' });
  return im;
}
/** icon_<id> from the portraits atlas (out/ui/portraits.{json,png}) when it exists, else null for every id. */
export async function loadCastIcons() {
  try {
    const r = await fetch('out/ui/portraits.json');
    if (!r.ok) return null;
    const j = await r.json();
    const atlas = await loadImage(`out/ui/${j.image || 'portraits.png'}`);
    const out = new Map();
    for (const [n, fr] of Object.entries(j.frames || {})) if (n.startsWith('icon_')) out.set(n.slice(5), atlas.crop(fr.x, fr.y, fr.w, fr.h));
    return out;
  } catch { return null; }
}
