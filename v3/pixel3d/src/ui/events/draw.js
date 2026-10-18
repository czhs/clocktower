// Events group runtime drawing (owner: events group). Pure functions of the stage time over the UI layers
// (src/ui/layer.js L.world / L.ground / L.screen) using the frames of art.js. Used by the HUD slot (hud.js), the group
// scene (scenes/ui-events.js) and documented for the Clocktower port in meta.newStyle.events (bake.js).
//
// Timelines are expressed in whole 30 Hz grid frames (docs/UI.md §2.8); v2 durations are kept exactly (V2_MS -> TIMING).
import * as THREE from 'three';
import { PixelImage, drawText, textWidth, wrapText, drawBox, frameAt, dissolve, GRID_HZ, withHD } from '../kit.js';
import * as A from './art.js';
import { tokens } from '../kit.js';
const TOK_NIGHT = tokens('night');

/**
 * (density wave 2, additive; docs/UI-HD-WAVE2.md) Empty unless src/ui/hd/events.js prepareEventsHD() fills it: then
 * drawCaption / drawBanner / the vote-clock hand draw HD when L.screen is a density VIEW. With no hooks (the default)
 * every function here is byte-identical to before (shots/ui-hd-wave2/regress.mjs).
 */
export const HD_HOOKS = {};
export const gf = (ms) => Math.round((ms * GRID_HZ) / 1000);          // ms -> whole grid frames
/** Grid frame index of a time since an event (0.01-frame tolerance: capture times come back rounded, docs/UI.md §6). */
export const gridK = (dt) => Math.floor(dt * GRID_HZ + 0.01);

export const TIMING = {
  night: { outF: gf(A.V2_MS.nightOut), inF: gf(A.V2_MS.nightIn), outHold: 2, inHold: 3, band: 72, levels: 4 },   // 20 + 48 frames
  dawn: { f: gf(A.V2_MS.dawnFlash), coverF: 2, coverA: 214, hold: 2, band: 18, alpha: [96, 64, 36] },            // 27 frames: 2 cover + 13 drawings
  caption: { nightF: gf(A.V2_MS.captionNight), bellF: gf(A.V2_MS.captionBell), dawnF: gf(A.V2_MS.captionDawn), popF: 2, outHold: 2 },
  poof: { hold: 2, frames: 6, hideAt: 2, showAt: 3 },                                                            // 15 fps, 12 frames
  vote: { perVoterF: 36, turnDrawings: 4, turnHold: 2, lockAtF: 15, popF: 2 },                                   // 1.2 s per voter
  banner: { unfurlDrawings: 4, unfurlHold: 2, holdF: 105, outHold: 2 },
  execution: { tollsAtF: [0, 24, 48], dieAtF: 30, wispAtF: 96, ghostAtF: 108, dimInF: 6, dimOutAtF: 126, bellOutAtF: 126, captionF: gf(A.V2_MS.captionBell) },
};

// ------------------------------------------------------------------------------------------------ frames
const _frames = new Map();
/** name -> PixelImage for a token set (built once per set). */
export function framesFor(T) {
  let f = _frames.get(T);
  if (!f) { f = Object.fromEntries(A.buildFrames(T)); _frames.set(T, f); }
  return f;
}
/** Blit frame `name` with its anchor at (x, y). */
export function put(img, F, name, x, y, anchorKey = null) {
  const im = F[name];
  if (!im) return;
  const a = A.ANCHORS[anchorKey ?? name] ?? A.ANCHORS[name.replace(/_\d+$/, '')] ?? { x: im.w >> 1, y: im.h >> 1 };
  img.blit(im, Math.round(x) - a.x, Math.round(y) - a.y);
}
const _cache = new Map();
export const cached = (key, fn) => { let v = _cache.get(key); if (!v) { v = fn(); _cache.set(key, v); if (_cache.size > 600) _cache.delete(_cache.keys().next().value); } return v; };
/** A copy of an image with a Bayer dissolve applied (k 0..1). */
export const dissolved = (im, k) => (k <= 0 ? im : im.hd ? withHD(dissolve(im.clone(), k), dissolve(im.hd.clone(), k), im.hdOff) : dissolve(im.clone(), k));
/** Standard group envelope on grid frames: pop for popF frames, then hold, then a 3-step dissolve (15 fps). */
export function env(k, durF, { popF = 2, outHold = 2 } = {}) {
  if (k < 0) return null;
  if (k < durF) return { pop: k < popF, k: 0 };
  const s = Math.floor((k - durF) / outHold);
  return s >= 3 ? null : { pop: false, k: [0.25, 0.5, 0.75][s] };
}

// ------------------------------------------------------------------------------------------------ world positions
/** Ground unit vector toward the camera (screen-down on the ground), from the stage placement helper. */
export function towardCamera(hud) { return hud.place(1, 180).sub(hud.place(0, 0)).setY(0).normalize(); }
/** r3: 0.55 -> 0.9 m: at 0.55 m the feet hid the digit (Gus 7, Finn 6) and the rings sat on it (Cleo 3; critic c1/z/). */
export const PLAQUE_M = 0.9;
/** Plaque centre of a seat (ground), PLAQUE_M toward the camera from the seat spot (clear of the feet). */
export function plaqueOf(hud, m) { const p = m.pos.clone().addScaledVector(towardCamera(hud), PLAQUE_M); p.y = hud.terrain.heightAt(p.x, p.z); return p; }
/** Ring centre (nominee ring, voter pulse): the seat spot, i.e. around the feet (r3; r2 centred it between the seat and
 *  the plaque, over the digit). */
export function ringOf(hud, m) { const p = m.pos.clone(); p.y = hud.terrain.heightAt(p.x, p.z); return p; }
/** Top of the name label (indicators) or the stack above it (person pins / chevron), in L.world pixels. */
export function stackTopOf(hud, L, m) {
  if (hud.indicators?.stackTop) return hud.indicators.stackTop(m, L);
  return L.at(m.head()).y - 12;
}
/**
 * Where a raised hand goes (wrist point, anchors.hand): BESIDE the name label, its wrist on the label's bottom row
 * (v2 drew it beside the head). r1 put it on the stack above the label, where chat bubbles also live (indicators'
 * stackTop excludes bubbles): it covered Bram's bubble text (shots/ui-events/r1/z-hud-bram.png). Right side; left
 * when the talk glyph sits on the right (talking members), the ghost wisp then shares the left with a 1-px gap.
 */
export function handSpot(hud, L, m) {
  const cx = L.at(m.head()).x, top = labelTopOf(hud, L, m);
  const half = (textWidth(m.name.length > 14 ? m.name.slice(0, 14) : m.name) + 2) >> 1;
  const talking = (hud._ind?.talk || []).some((x) => x.m === m) || (hud._ind?.muted || []).includes(m);
  const ghostL = m.ghost ? 7 : 0;
  return talking ? { x: cx - half - 7 - ghostL, y: top + 10 } : { x: cx + half + 6, y: top + 10 };
}
export function labelTopOf(hud, L, m) { return hud.indicators?.labelTop ? hud.indicators.labelTop(m, L) : L.at(m.head()).y - 11; }

// ------------------------------------------------------------------------------------------------ seat plaques (Ag)
/**
 * Seat plaques for the gathered circle. states: {[seat]: 'stone'|'you'|'dead'|'nominee'}; digits = v2 seat numbers
 * (1-based) on the plaque, tiny font. still = reduced motion (no pulse, no sway).
 */
export function drawSeats(hud, L, F, { states = {}, digits = true, t = L.t, still = false } = {}) {
  const T = L.tok;
  const list = [...hud.cast].sort((a, b) => L.at(plaqueOf(hud, a)).y - L.at(plaqueOf(hud, b)).y);
  for (const m of list) {
    const st = states[m.seat] ?? (m.ghost ? 'dead' : m.you ? 'you' : 'stone');
    const p = L.at(plaqueOf(hud, m));
    if (st === 'you') put(L.ground, F, `seat_you_${still ? 2 : frameAt(t, A.FPS.seat_you, 4, { seq: [0, 1, 2, 1] })}`, p.x, p.y, 'seat_you');
    else if (st === 'dead') put(L.ground, F, `seat_dead_${still ? 0 : frameAt(t + m.seat * 0.37, A.FPS.seat_dead, 2)}`, p.x, p.y, 'seat_dead');
    else put(L.ground, F, st === 'nominee' ? 'seat_nominee' : 'seat_stone', p.x, p.y, 'seat');
    if (digits) seatDigit(L, m, st, p);
  }
}
/** The tiny seat number on a plaque (p = plaque pixel; computed when omitted). */
export function seatDigit(L, m, st, p = null, hud = null) {
  const T = L.tok;
  p ??= L.at(plaqueOf(hud, m));
  const col = st === 'you' ? T.goldHi : st === 'dead' ? A.rampOf(T.ghostSh, { line: 0.3 }).line : T.text;   // nominee: parchment digit (the clay edge marks it; clay-on-clay was illegible)
  drawText(L.ground, p.x, p.y - 2, String(m.seat), { font: 'tiny', color: col, align: 'center' });
}

// ------------------------------------------------------------------------------------------------ vote (world + HUD)
/**
 * A nomination vote. order = seats in voting order (clockwise from the seat after the nominee, nominee last, v2);
 * raise = {[seat]: seconds after t0 when the hand goes up} (absent = never raises); ghosts = seats voting with their
 * ghost vote; dead = seats without a vote. needed = votes to put the nominee on the block.
 */
export function makeVote({ nominee, order, raise = {}, ghosts = [], dead = [], t0 = 0, needed = 3 }) {
  return { nominee, order, raise, ghosts: new Set(ghosts), dead: new Set(dead), t0, needed };
}
/** Pure vote state at time t. */
export function voteAt(v, t) {
  const V = TIMING.vote;
  const k = gridK(t - v.t0);
  const idx = Math.floor(k / V.perVoterF);
  const cur = k < 0 ? -1 : Math.min(idx, v.order.length);          // order.length = finished
  const seats = {};
  let tally = 0;
  v.order.forEach((s, i) => {
    const lockF = i * V.perVoterF + V.lockAtF;
    const rT = v.raise[s];
    const rF = rT == null ? null : gridK(rT);
    const raised = rF != null && k >= rF;
    const decided = k >= lockF;
    const yes = decided && rF != null && rF <= lockF;
    if (yes) tally++;
    seats[s] = { raised: raised && !(decided && !yes), raisedF: rF == null ? null : k - rF, yes, no: decided && !yes, lockedF: yes ? k - lockF : null, dead: v.dead.has(s) && !v.ghosts.has(s), ghost: v.ghosts.has(s) };
  });
  // clock hand: turns from the previous voter to the current one over 4 drawings at 15 fps, then holds
  let from = cur <= 0 ? 0 : cur - 1, to = Math.max(0, Math.min(cur, v.order.length - 1)), u = 1;
  if (cur > 0 && cur < v.order.length) {
    const into = k - cur * V.perVoterF;
    u = Math.min(1, (Math.floor(into / V.turnHold) + 1) / V.turnDrawings);
  }
  return { k, cur, current: cur >= 0 && cur < v.order.length ? v.order[cur] : null, seats, tally, passed: tally >= v.needed, hand: { from: v.order[from], to: v.order[to], u }, done: cur >= v.order.length };
}
const angOf = (p) => Math.atan2(p.x, p.z);
/** World end point of the clock hand between two seats (angle lerp, stepped by u). */
function handEnd(hud, a, b, u, centre, shorten = 0.85) {
  const pa = hud.bySeat(a).pos, pb = hud.bySeat(b).pos;
  let a0 = angOf(pa.clone().sub(centre)), a1 = angOf(pb.clone().sub(centre));
  let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const ang = a0 + d * u;
  const r = (pa.clone().sub(centre).setY(0).length() * (1 - u) + pb.clone().sub(centre).setY(0).length() * u) - shorten;
  const p = centre.clone().add(new THREE.Vector3(Math.sin(ang) * r, 0, Math.cos(ang) * r));
  p.y = hud.terrain.heightAt(p.x, p.z);
  return p;
}
/** Fraction of the centre -> voter hand that is drawn (the outer part, ending at the voter). */
export const HAND_SPAN = 0.4;
/** The vote in the world: nominee ring, voter pulse + clock hand (Ag), raised / locked hands over the voters (A). */
export function drawVoteWorld(hud, L, F, v, { t = L.t, still = false, centre = null } = {}) {
  const T = L.tok, S = voteAt(v, t);
  const c0 = centre || (hud.st ? hud.st.pos : new THREE.Vector3());
  const nom = hud.bySeat(v.nominee);
  if (nom && !S.done) { const p = L.at(ringOf(hud, nom)); put(L.ground, F, 'nominee_ring', p.x, p.y); }
  if (S.current != null) {
    const vm = hud.bySeat(S.current);
    const p = L.at(ringOf(hud, vm));
    put(L.ground, F, `vote_pulse_${still ? 1 : frameAt(t, A.FPS.vote_pulse, 3, { seq: [0, 1, 2, 1] })}`, p.x, p.y, 'vote_pulse');
    // UI integration r2 (whole-screen critic: a 1-px gold line from the circle centre read as a spear / staff crossing
    // the Storyteller): only the outer HAND_SPAN of the hand is drawn, near the voter; its hub caps the inner end.
    const eW = handEnd(hud, S.hand.from, S.hand.to, still ? 1 : S.hand.u, c0);
    const e = L.at(eW), c = L.at(c0.clone().lerp(eW, 1 - HAND_SPAN));
    A.drawVoteHand(L.ground, c.x, c.y, e.x, e.y, T, { night: T === TOK_NIGHT });
  }
  // the digits of the nominee and the current voter stay on top of the rings / shaft (critic: Cleo's 3 under the ring)
  for (const s of [v.nominee, S.current]) {
    const m = s != null && hud.bySeat(s);
    if (m) seatDigit(L, m, s === v.nominee ? 'nominee' : m.ghost ? 'dead' : m.you ? 'you' : 'stone', null, hud);
  }
  // hands (A): 1 px above the label stack of each voter who raised
  for (const [seat, s] of Object.entries(S.seats)) {
    const m = hud.bySeat(Number(seat));
    if (!m || (!s.raised && !s.yes)) continue;
    const { x, y } = handSpot(hud, L, m);
    if (s.yes) {
      put(L.world, F, s.ghost ? 'hand_ghost_locked' : 'hand_locked', x, y, 'hand');
      if (!still && s.lockedF < 6) put(L.world, F, `hand_lock_${Math.floor(s.lockedF / 2)}`, x, y, 'hand_lock');
    } else {
      if (!still && s.raisedF < TIMING.vote.popF) { put(L.world, F, 'hand_pop', x, y, 'hand'); continue; }
      const k = still ? 0 : frameAt(t + Number(seat) * 0.13, A.FPS.hand_raised, 2);
      put(L.world, F, s.ghost ? 'hand_ghost' : `hand_raised_${k}`, x, y - k, 'hand');
    }
  }
  return S;
}
/**
 * Ghost votes spent (r3, critic z2/v287esme.png: the halo stayed after Esme's vote was counted). From the grid frame a
 * ghost's hand is counted, that ghost is "ghost-spent" (v2 cast <id>/ghost-spent: no halo, dimmer).
 *  - ghostLockTimes(v): {seat: stage time (s) of the lock} for every ghost who votes yes (pure, from the timeline).
 *  - scheduleGhostSpent(hud, v, {loop, loops}): pixel3d actors showing the 'ghost' clip get Character.play('ghost-spent')
 *    at the lock time (deterministic: Character re-simulates scheduled plays, so single-frame captures agree), and
 *    'ghost' again at each loop start when the vote repeats (the HUD slot loops every `loop` s).
 *  - spentSeats(v, t): the Set of seats whose ghost vote is spent at t (2D renderers: stop drawing ghost_halo_* there).
 */
export function ghostLockTimes(v) {
  const V = TIMING.vote, out = {};
  v.order.forEach((s, i) => {
    const r = v.raise[s], lockF = i * V.perVoterF + V.lockAtF;
    if (v.ghosts.has(s) && r != null && gridK(r) <= lockF) out[s] = v.t0 + lockF / GRID_HZ;
  });
  return out;
}
export function spentSeats(v, t, { loop = null } = {}) {
  const tt = loop ? ((t % loop) + loop) % loop : t, L = ghostLockTimes(v), out = new Set();
  for (const [s, tl] of Object.entries(L)) if (tt >= tl - 1e-6) out.add(Number(s));
  return out;
}
export function scheduleGhostSpent(hud, v, { loop = null, loops = 40 } = {}) {
  for (const [seat, tl] of Object.entries(ghostLockTimes(v))) {
    const ch = hud.bySeat(Number(seat))?.actor;
    if (!ch?.ch || ch.st.clip !== 'ghost' || !ch.spec.clips?.['ghost-spent']) continue;
    const n = loop ? loops : 1, t0 = (ch.ch.engine?.time ?? 0) + 1e-3;   // after the actor's own play('ghost') at creation
    for (let i = 0; i < n; i++) {
      const o = loop ? i * loop : 0;
      if (i > 0) ch.ch.play('ghost', { at: o });
      ch.ch.play('ghost-spent', { at: Math.max(t0, o + tl) });
    }
  }
}
/** HUD vote clock panel (S) in rect {x, y, w, h}: title, clock face, seat pips, hand, tally. */
export function drawVoteHud(hud, L, F, v, r, { t = L.t, still = false, title = null } = {}) {
  const T = L.tok, S = voteAt(v, t);
  const inner = drawBox(L.screen, r.x, r.y, r.w, r.h, 'panel', T);
  const nm = hud.bySeat(v.nominee)?.name ?? `Seat ${v.nominee}`;
  drawText(L.screen, inner.x + 3, inner.y + 2, title ?? 'VOTE', { font: 'tiny', color: T.textDim });
  drawText(L.screen, inner.x + inner.w - 3, inner.y + 1, nm, { color: A.rampOf(A.CLAY).hi, align: 'right' });
  const fx = r.x + Math.floor((r.w - A.VC.size) / 2), fy = inner.y + 11;
  L.screen.blit(F.vc_face, fx, fy);
  const c = A.VC.size / 2, seats = [...hud.cast].sort((a, b) => a.seat - b.seat), n = seats.length;
  const pos = (i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return { x: Math.round(fx + c + A.VC.r * Math.cos(a) - 0.5), y: Math.round(fy + c + A.VC.r * Math.sin(a) - 0.5) }; };
  // hand (screen): 1-px gold shaft with goldLine sides, from the hub toward the current pip
  if (S.current != null) {
    const i0 = seats.findIndex((m) => m.seat === S.hand.from), i1 = seats.findIndex((m) => m.seat === S.hand.to);
    let d = i1 - i0; if (d < 0) d += n;
    const fi = i0 + d * (still ? 1 : S.hand.u), a = (fi / n) * Math.PI * 2 - Math.PI / 2;
    const ex = Math.round(fx + c - 0.5 + Math.cos(a) * (A.VC.r - 7)), ey = Math.round(fy + c - 0.5 + Math.sin(a) * (A.VC.r - 7));
    if (L.screen.isView && HD_HOOKS.voteHand) HD_HOOKS.voteHand(L.screen, fx, fy, a, T, { hand: true });
    else {
      const hm = new PixelImage(A.VC.size, A.VC.size);
      hm.line(Math.round(c - 0.5), Math.round(c - 0.5), ex - fx, ey - fy, T.gold);
      hm.outline(T.goldLine);
      L.screen.blit(hm, fx, fy);
    }
  }
  if (L.screen.isView && HD_HOOKS.voteHand) HD_HOOKS.voteHand(L.screen, fx, fy, 0, T, { hand: false });
  else { L.screen.disc(fx + c, fy + c, 2.6, T.gold); L.screen.set(fx + c - 1, fy + c - 1, T.goldHi); }
  seats.forEach((m, i) => {
    const s = S.seats[m.seat] || {};
    const raisedK = still ? 0 : frameAt(t, 2.5, 2);
    let st = m.seat === v.nominee ? 'nominee' : s.yes ? 'yes' : s.no ? 'no' : s.raised ? `raised${raisedK}` : s.dead ? 'dead' : S.current === m.seat ? 'current' : 'idle';
    if (st === 'no' && s.dead) st = 'dead';
    const p = pos(i);
    put(L.screen, F, `vc_seat_${st}`, p.x, p.y, 'vc_seat');
    drawText(L.screen, p.x + 1, p.y - 2, String(m.seat), { font: 'tiny', color: A.vcDigit(st, T), align: 'center' });
  });
  // tally: "3 OF 3" votes / needed, gold when enough
  const ty = fy + A.VC.size + 2;
  const s1 = `${S.tally}`, s2 = ` / ${v.needed}`;
  const w = textWidth(s1) + textWidth(s2) + 1 + textWidth('VOTES', 'tiny') + 4;
  let x = r.x + Math.floor((r.w - w) / 2);
  drawText(L.screen, x, ty + 1, 'VOTES', { font: 'tiny', color: T.textDim }); x += textWidth('VOTES', 'tiny') + 4;
  drawText(L.screen, x, ty, s1, { color: S.passed ? T.gold : T.text }); x += textWidth(s1) + 1;
  drawText(L.screen, x, ty, s2, { color: T.textDim });
  return S;
}

// ------------------------------------------------------------------------------------------------ captions (S)
/** Caption ribbon image for a text (+ glyph): caption_end + mid tile + flipped end. */
/** Caption layout (r3, critic c1/z/cap.png: ~1 px between the text and the caps): the ribbon fill starts 3 px inside
 *  each swallowtail end; content = 8 px padding + glyph (9) + 4 px gap + text + 8 px padding. Long lines are cut to
 *  CAPTION_MAX_W with an ellipsis (kit wrapText) so the ribbon never outgrows the slot. */
export const CAPTION = { capIn: 3, pad: 8, glyphW: 9, gap: 4, maxW: 300 };
export function captionImage(F, text, glyphName, T, { narrow = 0 } = {}) {
  const C = CAPTION;
  const line = wrapText(text, C.maxW, { maxLines: 1 })[0] ?? '';
  const gw = glyphName ? C.glyphW + C.gap : 0;
  const tw = textWidth(line);
  const full = 2 * (C.capIn + C.pad) + gw + tw;
  const w = Math.max(24, full - narrow * 2);
  const img = new PixelImage(w, 15);
  const E = F.caption_end, M = F.caption_mid;
  for (let x = 7; x < w - 7; x++) img.blit(M, x, 0);
  img.blit(E, 0, 0); img.blit(E, w - 7, 0, { flipX: true });
  if (!narrow) {
    const x0 = C.capIn + C.pad;
    if (glyphName) img.blit(F[`glyph_${glyphName}`], x0, 3);
    drawText(img, x0 + gw, 4, line, { color: T.text });
  }
  return img;
}
/** Phase caption in the events slot (screen, centred at cx, top y): pop (2 frames, narrower), hold durF, dissolve. */
export function drawCaption(L, F, opts) {
  if (L.screen.isView && HD_HOOKS.drawCaption) return HD_HOOKS.drawCaption(L, F, opts);
  const { text, glyph = null, k, durF, cx = null, y = 23, still = false } = opts;
  const e = env(k, durF);
  if (!e) return;
  const T = L.tok;
  const img = cached(`cap|${text}|${glyph}|${e.pop && !still ? 1 : 0}|${T.ink}`, () => captionImage(F, text, glyph, T, { narrow: e.pop && !still ? 8 : 0 }));
  const x = Math.floor((cx ?? L.screen.w / 2) - img.w / 2);
  L.screen.blit(e.k ? dissolved(img, e.k) : img, x, y);
}

// ------------------------------------------------------------------------------------------------ night / dawn (S)
/**
 * Night falls (v2 fadeOut 650 -> fadeIn 1600 ms to #04020a): the veil descends from the top in 4 dither levels over a
 * 72-px leading band (10 drawings, 15 fps), then dissolves in 16 Bayer steps (10 fps). k = grid frames since start.
 * Returns 'out' | 'covered' | 'in' | null (scene: swap the preset while 'covered').
 */
export function drawNightVeil(L, k, Tn) {
  const N = TIMING.night;
  if (k < 0) return null;
  const img = L.screen, W = img.w, H = img.h, d = img.data, c = [...A.rgbaOf(A.veilColor(Tn))];
  let phase, limAt;
  if (k < N.outF) {
    const dr = Math.floor(k / N.outHold), nD = Math.ceil(N.outF / N.outHold);
    const p = (dr + 1) / nD, front = p * (H + N.band);
    limAt = (y) => { const cov = Math.max(0, Math.min(1, (front - y) / N.band)); return Math.ceil(cov * N.levels) * (16 / N.levels); };
    phase = dr === nD - 1 ? 'covered' : 'out';
  } else if (k < N.outF + N.inF) {
    // r3: the veil LIFTS behind the same moving 4-level leading band (bottom first, the far edge last), 16 drawings at
    // 10 fps. r2 stepped a uniform full-frame Bayer coverage 15/16 -> 0: a static screen door for 1.6 s (critic z2/n46.png).
    const dr = Math.floor((k - N.outF) / N.inHold), nD = Math.ceil(N.inF / N.inHold);   // 0..15
    const front = (1 - dr / (nD - 1)) * (H + N.band);
    limAt = (y) => { const cov = Math.max(0, Math.min(1, (front - y) / N.band)); return Math.ceil(cov * N.levels) * (16 / N.levels); };
    phase = dr === 0 ? 'covered' : 'in';
  } else return null;
  for (let y = 0; y < H; y++) {
    const lim = limAt(y);
    if (lim <= 0) continue;
    for (let x = 0; x < W; x++) if (A.BAYER4[(y & 3) * 4 + (x & 3)] < lim) { const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  }
  return phase;
}
/**
 * Dawn (v2 cam.flash 900 ms, rgb 70,40,50). r3 (critic: three straight translucent stripes = a colour filter that tinted
 * the name labels, violet over the square, and a one-frame night -> noon cut):
 *  - grid frames 0-1: a full-coverage cream light (the v2 flash) hides the preset swap (the scene swaps at frame 1);
 *  - then the light pulls back toward the far (top) edge as a SHAPE: an irregular, dithered leading edge (4 Bayer
 *    levels over 18 px, column-wise wobble in whole 2-px steps) that moves up every 2 frames, its alpha stepping down
 *    in 3 levels; violet only in the top rows, rose under it, gold to the edge;
 *  - drawn into L.world (tier A) at a z BELOW the labels (scenes/ui-events.js z 2): labels, hands and pins are drawn
 *    over it later and keep their exact colours; only empty texels are washed.
 * Returns 'cover' | 'light' | false (scene: swap the preset at 'cover' frame 1).
 */
export function drawDawn(L, k, T) {
  const D = TIMING.dawn;
  if (k < 0 || k >= D.f) return false;
  const img = L.world, W = img.w, H = img.h, d = img.data;
  const put1 = (x, y, c, al) => { const i = (y * W + x) * 4; if (d[i + 3]) return; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = al; };
  if (k < D.coverF) {
    const c = A.rgbaOf(T.parchmentHi);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put1(x, y, c, D.coverA);
    return 'cover';
  }
  const dr = Math.floor((k - D.coverF) / D.hold), nD = Math.ceil((D.f - D.coverF) / D.hold);   // 0..12
  const a = D.alpha[Math.min(2, Math.floor((dr * 3) / nD))];
  // the edge: from 0.92 H up to 0.22 H, fast first then slowing (light settles at the horizon)
  const p = 1 - Math.pow(1 - (dr + 1) / nD, 1.6);
  const front = H * (0.92 - 0.7 * p);
  const band = D.band;
  const vio = A.rgbaOf(T.stViolet), rose = A.rgbaOf(T.self), gold = A.rgbaOf(T.goldHi);
  const violetH = Math.round(H * 0.06), roseH = Math.round(H * 0.15);
  for (let x = 0; x < W; x++) {
    const wob = Math.round((5 * Math.sin(x * 0.045 + dr * 0.35) + 3 * Math.sin(x * 0.13 + 1.7)) / 2) * 2;
    const fx = Math.round(front + wob);
    for (let y = 0; y < Math.min(H, fx); y++) {
      const into = fx - y;                                // px above the edge
      if (into < band) {
        const lim = Math.ceil((into / band) * 4) * 4;     // 4, 8, 12, 16 /16
        if (A.BAYER4[(y & 3) * 4 + (x & 3)] >= lim) continue;
      }
      const c = y < violetH ? vio : y < roseH ? rose : gold;
      const m = y < violetH ? 0.55 : y < roseH ? 0.8 : 1;
      put1(x, y, c, Math.round(a * m));
    }
  }
  return 'light';
}

// ------------------------------------------------------------------------------------------------ banners (S)
export const BANNERS = {
  start: { title: 'THE GAME BEGINS', sub: 'FIRST NIGHT FALLS ON HOLLOWMERE', emblem: 'emblem_start', style: 'ink', color: 'gold' },
  good: { title: 'GOOD WINS', sub: 'THE DEMON IS SLAIN', emblem: 'emblem_good', style: 'ink', color: 'good' },
  evil: { title: 'EVIL WINS', sub: 'THE TOWN HAS FALLEN', emblem: 'emblem_evil', style: 'ink', color: 'evil' },
};
/** Banner title: body font, 1-px extra tracking, drawn at 2x (whole 2x2 texel blocks) with a 2x shadow: a stand-in
 *  for the hud group's display font (docs/UI.md §2.4) until it is registered in FONTS. */
function titleImage(s, col, T) {
  const w = A.trackedWidth(s, 1), t = new PixelImage(w, 9);
  A.drawTracked(t, 0, 0, s, { color: col, shadow: T.shadow, extra: 1 });
  const o = new PixelImage(w * 2, 18);
  o.blit(t, 0, 0, { scale: 2 });
  return o;
}
function bannerImage(F, kind, T, frac = 1, showText = true) {
  const B = BANNERS[kind];
  const sfx = B.style === 'parchment' ? '_parchment' : '';
  const title = titleImage(B.title, T[B.color], T);
  const tw = Math.max(title.w, textWidth(B.sub, 'tiny'));
  const full = tw + 40;
  const w = Math.max(30, Math.round(full * frac / 2) * 2);
  const oy = 14;
  const img = new PixelImage(full, oy + A.BANNER_H);
  const ox = Math.floor((full - w) / 2);
  for (let x = ox + 12; x < ox + w - 12; x++) img.blit(F[`banner_mid${sfx}`], x, oy);
  img.blit(F[`banner_end${sfx}`], ox, oy); img.blit(F[`banner_end${sfx}`], ox + w - 12, oy, { flipX: true });
  if (showText) {
    img.blit(title, Math.floor((full - title.w) / 2), oy + 8);
    drawText(img, Math.floor(full / 2), oy + 25, B.sub, { font: 'tiny', color: T.textDim, align: 'center' });
  }
  return img;
}
/** Game start / end banner centred at (cx, y top): ribbon unfurls (4 drawings), emblem pops, hold, dissolve. */
/** Banner top y (r3): the upper third, 4 px under the caption slot (caption rows 23..37): clear of the Storyteller in
 *  the centre of the square and of the bottom pills (critic c1/banner-start-night.png); the emblem rows are mostly empty. */
export const BANNER_Y = 42;
export function drawBanner(L, F, kind, k, opts = {}) {
  if (L.screen.isView && HD_HOOKS.drawBanner) return HD_HOOKS.drawBanner(L, F, kind, k, opts);
  const { cx = null, y = BANNER_Y, still = false } = opts;
  const B = TIMING.banner, T = L.tok;
  if (k < 0) return;
  const unF = B.unfurlDrawings * B.unfurlHold;
  const dur = unF + B.holdF;
  const e = env(k, dur, { popF: 0 });
  if (!e) return;
  const dr = still ? B.unfurlDrawings : Math.min(B.unfurlDrawings, Math.floor(k / B.unfurlHold) + 1);
  const frac = dr / B.unfurlDrawings;
  const img0 = cached(`ban|${kind}|${dr}|${T.ink}`, () => {
    const im = bannerImage(F, kind, T, frac, dr === B.unfurlDrawings);
    if (dr === B.unfurlDrawings) { const em = F[BANNERS[kind].emblem]; im.blit(em, Math.floor(im.w / 2) - 10, 0); }
    return im;
  });
  let img = img0;
  if (!still && k >= unF && k < unF + 2) img = cached(`banpop|${kind}|${T.ink}`, () => { const im = bannerImage(F, kind, T, 1, true); const em = F[BANNERS[kind].emblem]; im.blit(em, Math.floor(im.w / 2) - 10, 2); return im; });
  const x = Math.floor((cx ?? L.screen.w / 2) - img.w / 2);
  L.screen.blit(e.k ? dissolved(img, e.k) : img, x, y);
}

// ------------------------------------------------------------------------------------------------ poof (A)
/** Storyteller poof at a ground point (world pixel of the feet): 6 drawings at 15 fps; returns {visible} for the ST. */
export function drawPoof(L, F, feet, k, { appear = true } = {}) {
  const P = TIMING.poof;
  if (k < 0) return { st: !appear };
  const dr = Math.floor(k / P.hold);
  if (dr < P.frames) put(L.world, F, `poof_${dr}`, feet.x, feet.y, 'poof');
  return { st: appear ? dr >= P.hideAt + 1 : dr < P.hideAt };
}

// ------------------------------------------------------------------------------------------------ death (A / Ag)
/** The wisp starts at the fallen body middle, not its feet (r2: from the feet it never cleared the head). */
export const WISP_LIFT = 12;
/**
 * One wisp drawing wd (0..5) at anchor (x, y), never over the name label (r3, critic sh/dawn-c.png #54-56): the first
 * drawing whose spirit (head + tail) overlaps the label box (labelTop .. +10, 1-px margin) is drawn half dissolved,
 * later ones are skipped. labelFrom = first drawing at which the label is shown (a night death has no label until the
 * ghost appears). wd 5 (motes only) is always half dissolved.
 */
export function drawWisp(L, F, wd, x, y, labelTop, { labelFrom = 0 } = {}) {
  if (wd < 0 || wd >= 6) return;
  const P = A.WISP_PATH, oy = y - A.ANCHORS.wisp.y;
  const hits = (i) => {
    if (i < labelFrom || i >= 5) return false;
    const top = oy + P.cy[i] - Math.ceil(P.sz[i]) - 1, bottom = oy + P.cy[i] + Math.round(P.sz[i] * 0.6) + Math.round(P.sz[i] * 2.2) + 1;
    return top <= labelTop + 11 && bottom >= labelTop - 1;
  };
  let first = -1;
  for (let i = 0; i <= Math.min(wd, 4); i++) if (hits(i)) { first = i; break; }
  if (first >= 0 && wd > first) return;            // already gone
  const im = F[`wisp_${wd}`], a = A.ANCHORS.wisp;
  L.world.blit(first === wd || wd === 5 ? dissolved(im, 0.5) : im, x - a.x, y - a.y);
}
/** The town hushes: the world dims (night scrim token, 3 steps) except an oval around the condemned. lvl 0..3. */
export function drawDim(L, cx, cy, lvl, Tn, { rx = 34, ry = 30 } = {}) {
  if (lvl <= 0) return;
  // r2: the scrim token (the one translucent token, night set) at 3 stepped strengths, the hole's rim banded at half
  // strength. r1 used Bayer dots (6/16, then 4/16): a screen door over the square (gifs/s-exec-b.png, s-exec2-a.png).
  const img = L.world, W = img.w, H = img.h, d = img.data, s = Tn.scrim;
  const a = Math.round(s[3] * [0, 0.3, 0.55, 0.8][lvl]), a2 = a >> 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, q = dx * dx + dy * dy;
    const al = q < 1 ? 0 : q < 1.45 ? a2 : a;
    const i = (y * W + x) * 4;
    if (!al || d[i + 3]) continue;
    d[i] = s[0]; d[i + 1] = s[1]; d[i + 2] = s[2]; d[i + 3] = al;
  }
}
/**
 * Execution moment for member m starting at t0 (seconds): dim + bell + three tolls, then (the scene plays the die clip at
 * dieAtF) the wisp rises and the ghost is revealed. Returns {ghost: bool (show the ghost actor), dead: bool}.
 */
export function drawExecution(hud, L, F, m, t0, { t = L.t, still = false, layer = 'all', Tn } = {}) {
  const X = TIMING.execution, k = gridK(t - t0);
  const out = { ghost: k >= X.ghostAtF, dying: k >= X.dieAtF, k };
  if (k < 0 || !m) return out;
  const feet = L.at(m.feet());
  if (layer === 'dim' || layer === 'all') {
    const lvl = k < X.dimInF ? 1 + Math.floor(k / 2) : k < X.dimOutAtF ? 3 : 3 - Math.floor((k - X.dimOutAtF) / 2) - 1;
    drawDim(L, feet.x, feet.y - 18, Math.max(0, Math.min(3, still ? (k < X.dimOutAtF ? 3 : 0) : lvl)), Tn || L.tok);
    if (layer === 'dim') return out;
  }
  // tolls (Ag)
  for (const a of X.tollsAtF) {
    const dr = Math.floor((k - a) / 3);
    if (k >= a && dr < 4) put(L.ground, F, `toll_${dr}`, feet.x, feet.y, 'toll');
  }
  // bell over the label (A), swinging seq 0,1,2,1
  const be = env(k, X.bellOutAtF);
  if (be) {
    const y = stackTopOf(hud, L, m) - 1, x = L.at(m.head()).x;
    const name = `bell_${still ? 1 : frameAt(t - t0, A.FPS.bell, 3, { seq: [0, 1, 2, 1] })}`;
    const im = F[name];
    if (be.pop && !still) L.world.blit(im, x - 6, y - im.h + 2);
    else L.world.blit(be.k ? dissolved(im, be.k) : im, x - 6, y - im.h);
  }
  // wisp (A) from the body, then the reveal burst at the ghost's feet
  if (k >= X.wispAtF) drawWisp(L, F, Math.floor((k - X.wispAtF) / 3), feet.x, feet.y - WISP_LIFT, labelTopOf(hud, L, m));
  const rd = Math.floor((k - X.ghostAtF) / 2);
  if (k >= X.ghostAtF && rd < 4 && !still) put(L.world, F, `reveal_${rd}`, feet.x, feet.y - 6, 'reveal');
  return out;
}
/** Night death at dawn: wisp + reveal at the seat (k from the reveal start), memorial candle beside the plaque. */
export function drawNightDeath(hud, L, F, m, k, { t = L.t, still = false, candle = true } = {}) {
  if (!m || k < 0) return { ghost: false };
  const feet = L.at(m.feet());
  // r3: from the seat spot at HEAD height (there is no body after a night death; r2 rose from the plaque), and it
  // dissolves before the label it would cross (the label returns with the ghost at k 12)
  const head = L.at(m.head());
  drawWisp(L, F, Math.floor(k / 3), feet.x, head.y + 6, labelTopOf(hud, L, m), { labelFrom: 4 });
  const rk = k - 12, rd = Math.floor(rk / 2);
  if (rk >= 0 && rd < 4 && !still) put(L.world, F, `reveal_${rd}`, feet.x, feet.y - 6, 'reveal');
  if (candle && k >= 12) {
    const p = L.at(plaqueOf(hud, m));
    put(L.world, F, `candle_${still ? 0 : frameAt(t, A.FPS.candle, 3)}`, p.x + 12, p.y + 2, 'candle');
  }
  return { ghost: k >= 12 };
}
