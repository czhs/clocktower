// Chonk (char-chonk) — cast member "chonk", mascot 15-122: "A goose the size of a person. Nobody argues."
// Design sheet (incl. ## Unique to me, ## Self-critique): characters/chonk.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/chonk.ts + refs/cast/chonk.png.
// Body plan: BIRD, horizontal BALL (custom skeleton): hips root (legs) → spine (waddle roll pivot) → ball (leaf SQUASH
// bone, 'ball.s') + chest → neck → head, wingL/R → wingTipL/R, tail (squash riders via '.p'). Locomotion: LEGACY Gait
// with authored clips.walk/run (waddle-hop: squash + roll on every contact drawing, airborne pass drawings) — LegGait
// ignores authored walk poses (backlog M1) and has no squash in its bird branch.
// Structure: constants → palette → skeleton → geometry → parts → clips → spec.
import * as THREE from 'three';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.5;                       // v2 37 px → 1.48 m (castHeight), mascot +1 %
const H = HEIGHT;
export const V_GAME = 3.95 * H;                  // 5.93 m/s: v2 150 px/s on a 38 px sprite, relative to body height
const HIP_Y = 0.30, ANKLE_Y = 0.04;
const FR_GAME = V_GAME * V_GAME / (9.81 * HIP_Y);   // legacy Gait picks run above runFroude[1]: keep v_game on WALK

export const PALETTE = {
  down: ['#F6EEE6', '#DCD3D8', '#9C8EA6'],       // ball + head (signature, lightest mass; v1 #dcd5dc)
  wing: ['#CCC2CE', '#A89EB2', '#776B8A'],       // folded wings, tail tuft (v1 wing = darker down)
  beak: ['#F7AA52', '#E2802C', '#A0502E'],       // beak, shins, feet (v1 #e8892e)
  ink: ['#5C4660', '#3F3046', '#3A2C40'],        // ^ eyes, mouth inside (no black)
  blush: ['#F2AAA6', '#E0908E', '#B07078'],      // accent: cheeks
  halo: ['#FFEFA8', '#F2C65A', '#B8863A'],       // (t3) ghost halo ring only (untinted gold; v1 ghost row)
};

// ── body geometry (world metres, character faces +Z) ──
const BALL_Y = 0.13;                              // ball bottom = the squash bone's joint
// ball profile [r, y above BALL_Y]: flatter bottom (v1 "sits flat on its feet"), round top
const BALL_P = [[0.15, 0], [0.34, 0.04], [0.46, 0.125], [0.525, 0.27], [0.535, 0.435], [0.51, 0.60], [0.44, 0.755], [0.31, 0.885], [0.13, 0.955], [0, 0.97]];
const BALL_N = 12;
const rAt = (P, y) => { if (y <= P[0][1]) return P[0][0]; for (let i = 1; i < P.length; i++) if (y <= P[i][1]) { const [r0, y0] = P[i - 1], [r1, y1] = P[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return 0; };
const ballR = (yw) => rAt(BALL_P, yw - BALL_Y) * Math.cos(Math.PI / BALL_N);   // apothem (flat-face radius)
// head: 10-sided lathe ball 0.43 tall, on the FRONT-top of the ball (v1 E view: head forward of the body centre)
const HEAD_P = [[0.09, 0], [0.17, 0.045], [0.212, 0.14], [0.215, 0.25], [0.185, 0.35], [0.11, 0.415], [0, 0.43]];
const HEAD_SZ = 0.95;
const J = {                                        // joint positions (world)
  hips: [0, HIP_Y, 0], chest: [0, 1.0, 0.14], neck: [0, 1.04, 0.18], head: [0, 1.08, 0.22],
  wing: [ballR(0.85) + 0.02, 0.85, -0.02], wingTip: [ballR(0.58) + 0.03, 0.58, -0.04], tail: [0, 0.90, -0.40],
};
const sub = (a, b) => a.map((v, i) => v - b[i]);
// (t3, ghost) halo: a ring authored at HALO_K scale around a joint buried INSIDE the head ball (never seen while alive);
// the ghost clip keys 'halo.s' = 1/HALO_K − 1 (full size, HALO_UP over the joint = ~0.17 m over the crown). Its world
// scale relative to the head is also the GHOST SIGNAL the shader reads: 1 alive, 2 ghost-spent, 1000 ghost.
const HALO_K = 0.001, HALO_J = [0, 0.2, 0], HALO_UP = 0.4;

export function skeleton() {
  const S = [
    { name: 'hips', pos: J.hips, axis: 'up' },
    { name: 'spine', parent: 'hips', pos: [0, 0, 0], axis: 'up' },
    { name: 'ball', parent: 'spine', pos: [0, BALL_Y - HIP_Y, 0], axis: 'up' },
    { name: 'chest', parent: 'spine', pos: sub(J.chest, J.hips), axis: 'up' },
    { name: 'neck', parent: 'chest', pos: sub(J.neck, J.chest), axis: 'up' },
    { name: 'head', parent: 'neck', pos: sub(J.head, J.neck), axis: 'up' },
    { name: 'jaw', parent: 'head', pos: [0, 0.125, 0.17], axis: 'fwd' },
    { name: 'eyeL', parent: 'head', pos: [0.076, 0.255, 0.168], axis: 'fwd' },
    { name: 'eyeR', parent: 'head', pos: [-0.076, 0.255, 0.168], axis: 'fwd' },
    { name: 'tail', parent: 'spine', pos: sub(J.tail, J.hips), axis: [0, 0.6, -0.8] },
  ];
  for (const s of ['L', 'R']) {
    const x = s === 'L' ? 1 : -1, mx = (v) => [x * v[0], v[1], v[2]];
    S.push(
      { name: `wing${s}`, parent: 'spine', pos: mx(sub(J.wing, J.hips)), axis: 'down' },
      { name: `wingTip${s}`, parent: `wing${s}`, pos: mx(sub(J.wingTip, J.wing)), axis: 'down' },
      { name: `thigh${s}`, parent: 'hips', pos: [x * 0.19, 0, 0.02], axis: 'down' },
      { name: `shin${s}`, parent: `thigh${s}`, pos: [0, -0.13, 0.02], axis: 'down' },
      { name: `foot${s}`, parent: `shin${s}`, pos: [0, -(HIP_Y - 0.13 - ANKLE_Y), -0.02], axis: 'fwd' },
    );
  }
  // (t3) halo bone appended LAST (after every L/R bone): every living bone keeps its index = living renders unchanged
  S.push({ name: 'halo', parent: 'head', pos: HALO_J, axis: 'up' });
  const sockets = {
    head: { bone: 'head', at: [0, 0.43, 0] }, hat: { bone: 'head', at: [0, 0.42, -0.02] },
    beak: { bone: 'head', at: [0, 0.15, 0.31] }, mouth: { bone: 'head', at: [0, 0.12, 0.29] },
    back: { bone: 'spine', at: [0, 0.5, -0.5] }, tail: { bone: 'tail', at: [0, 0.16, -0.2] },
    wingTipL: { bone: 'wingTipL', at: [0.02, -0.26, -0.02] }, wingTipR: { bone: 'wingTipR', at: [-0.02, -0.26, -0.02] },
  };
  const meta = { kind: 'bird', plan: 'ball', height: H, hipY: HIP_Y, ankleY: ANKLE_Y, ballY: BALL_Y,
    restY: { ball: BALL_Y, chest: J.chest[1], wingL: J.wing[1], wingR: J.wing[1], tail: J.tail[1] } };
  return Object.defineProperties(S, { sockets: { value: sockets }, meta: { value: meta } });
}

// ── geometry helpers ──
function lathe0(P, n, o) { const g = K.lathe(P, n, o); g.computeBoundingBox(); return g.translate(0, P[0][1] - g.boundingBox.min.y, 0); }
const D2R = Math.PI / 180;
// a curved paddle hugging the ball flank: rows (world y, half angular width°) around azimuth th0 (° from +Z toward +X)
function flankHull(rows, th0, out, inn, joint) {
  const P = [];
  for (const [y, hw] of rows) {
    const R = ballR(y);
    for (const a of [-hw, 0, hw]) {
      const t = (th0 + a) * D2R;
      for (const r of [R + out, R - inn]) P.push(sub([r * Math.sin(t), y, r * Math.cos(t)], joint));
    }
  }
  return K.hull(P);
}

export function parts(S) {
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });
  // ball (signature): one 12-sided lathe on the squash bone
  add('ball', lathe0(BALL_P, BALL_N), [0, 0, 0], 'down', { name: 'ball' });
  // head: 10-sided ball, front-top of the body
  add('head', lathe0(HEAD_P, 12, { sz: HEAD_SZ }), [0, -0.01, 0], 'down', { name: 'headBall' });
  // r2 nape collar: a down lathe blending head into ball (rear views were a snowman sphere on a ball)
  add('head', lathe0([[0.34, -0.2], [0.32, -0.05], [0.27, 0.08], [0.2, 0.19]], 10), [0, 0, -0.11], 'down', { name: 'nape' });   // same bone + slot as the head ball: no part line
  // beak: upper (head) wedge pointing +Z, sunk into the face; lower mandible on the jaw; ink mouth slot between
  add('head', K.hull([[-0.07, -0.035, 0], [0.07, -0.035, 0], [-0.07, 0.04, 0], [0.07, 0.04, 0],
    [-0.03, -0.012, 0.13], [0.03, -0.012, 0.13], [-0.022, 0.018, 0.12], [0.022, 0.018, 0.12]]), [0, 0.15, 0.155], 'beak', { name: 'beak' });
  add('jaw', K.hull([[-0.055, -0.03, -0.02], [0.055, -0.03, -0.02], [-0.055, 0.0, -0.02], [0.055, 0.0, -0.02],
    [-0.022, -0.022, 0.095], [0.022, -0.022, 0.095], [-0.022, -0.002, 0.095], [0.022, -0.002, 0.095]]), [0, 0, 0], 'beak', { name: 'lowerBeak' });
  add('head', K.box(0.1, 0.042, 0.09), [0, 0.12, 0.182], 'ink', { name: 'mouth' });
  // ^ eyes: a chevron extruded 0.04 deep, proud of the head, turned 20° out
  const chev = K.extrude([[-0.05, 0], [-0.017, 0], [0, 0.032], [0.017, 0], [0.05, 0], [0, 0.065]], 0.04);
  add('eyeL', chev, [0, 0, 0.004], 'ink', { name: 'eye', rot: [0, 26, 0] });
  add('eyeR', chev, [0, 0, 0.004], 'ink', { name: 'eye', rot: [0, -26, 0] });
  // blush on the cheeks (accent)
  add('head', K.box(0.065, 0.036, 0.03), [0.138, 0.17, 0.135], 'blush', { name: 'blush', rot: [0, 45, 0], mirror: false });
  add('head', K.box(0.065, 0.036, 0.03), [-0.138, 0.17, 0.135], 'blush', { name: 'blush', rot: [0, -45, 0] });
  // wings: coverts (wingL) + primaries (wingTipL) hugging the flank; mirrored to R
  add('wingL', flankHull([[0.88, 13], [0.74, 19], [0.60, 18]], 92, 0.045, 0.06, J.wing), [0, 0, 0], 'wing', { name: 'wing', mirror: true });
  add('wingTipL', flankHull([[0.62, 16], [0.46, 15], [0.32, 6]], 96, 0.05, 0.06, J.wingTip), [0, 0, 0], 'wing', { name: 'wingTip', mirror: true });
  // tail tuft: pointed, up and back (v1 E view), base sunk into the back of the ball
  // r2: a flatter BLADE rising ~28° (its broad top face catches the light: a light spike from behind, not the dark
  // 4x5 end cap of r1), tip lower so it can't pop above the head at S
  add('tail', K.hull([[-0.12, -0.08, 0.12], [0.12, -0.08, 0.12], [-0.10, -0.11, 0.0], [0.10, -0.11, 0.0], [-0.06, 0.03, 0.08], [0.06, 0.03, 0.08],
    [0, 0.10, -0.25], [-0.03, 0.08, -0.22], [0.03, 0.08, -0.22], [0, 0.05, -0.23]]), [0, 0, 0], 'down', { name: 'tailTuft' });
  // legs: shins + webbed feet (orange)
  add('shinL', K.box(0.05, 0.13, 0.05), [0, -0.065, -0.008], 'beak', { name: 'shin', mirror: true });
  // r2: webbed feet TOED OUT ~35° (goose stance) so the planted foot pokes past the ball contour in the squashed contacts
  add('footL', K.hull([[-0.035, -0.04, -0.03], [0.035, -0.04, -0.03], [-0.03, 0.0, -0.03], [0.03, 0.0, -0.03],
    [-0.005, -0.04, 0.23], [0.175, -0.04, 0.15], [0.005, -0.012, 0.21], [0.16, -0.012, 0.14]]), [0, 0, 0], 'beak', { name: 'foot', mirror: true });
  // (t3) ghost halo: flat gold ring, authored at HALO_K (a speck inside the head ball)
  const ring = K.lathe([[0.09, 0], [0.16, 0], [0.16, 0.04], [0.09, 0.04], [0.09, 0]], 12);
  add('halo', K.xf(ring, { at: [0, HALO_UP * HALO_K, 0], scale: HALO_K }), [0, 0, 0], 'halo', { name: 'halo' });
  return P;
}

// ── pose helpers ──
// squash a (> 0 squash: flatter + wider; < 0 stretch) on the ball bone; riders follow the top/sides of the ball.
// dy (m) lifts the whole ball (+ riders) off the hips (not limited by the leg-reach dip): r2 contacts lift the ball so
// the planted foot shows under it, pass drawings fly. cx (m): lateral chest (neck, head) shift (roll compensation).
const SQ = (a, dy = 0, cx = 0) => {
  const k = 1 / Math.sqrt(1 - a) - 1, f = (v) => +v.toFixed(4);
  const o = { 'ball.s': [f(k), f(-a), f(k)], 'chest.p': [f(cx), f(dy - a * (J.chest[1] - BALL_Y)), f(J.chest[2] * k)],
    'wingL.p': [f(J.wing[0] * k), f(dy - a * (J.wing[1] - BALL_Y)), 0], 'wingR.p': [f(-J.wing[0] * k), f(dy - a * (J.wing[1] - BALL_Y)), 0],
    'tail.p': [0, f(dy - a * (J.tail[1] - BALL_Y)), f(J.tail[2] * k)] };
  if (dy) o['ball.p'] = [0, f(dy), 0];
  return o;
};
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const OPEN = EYES(-0.3, 0.6), SHUT = EYES(0.05, -0.62);
const WINGS = (fwd, out, tip = 0, tw = 0) => ({ wingL: [fwd, tw, out], wingR: [fwd, tw, out], wingTipL: [0, 0, tip], wingTipR: [0, 0, tip] });
const LEGS = (th, sh, out = 0) => ({ thighL: [th, 0, out], shinL: [sh, 0, 0], thighR: [th, 0, out], shinR: [sh, 0, 0] });

// walk (legacy Gait authored upper body, length 4, f0 = left contact): WADDLE-HOP
// r2: the ball ROLLS onto the planted foot but the chest (neck, head) is shifted back over the centre (ROLL_C), so the
// head only bobs (the r1 roll swung it 0.12 m sideways = ±2 texels of screen y at SE/E: a one-sided limp). Contacts
// keep the root up (the planted foot splays out past the ball, locomotion.spacing) and squash; pass drawings fly
// (locomotion.lift keeps the swing feet tucked within reach, so the reach net no longer cancels the hop).
const ROLL = 7, ROLL_C = 0.66, C_LIFT = 0.11, C_SQ = 0.22, P_LIFT = 0.07;
const contact = (s, k = 1) => ({ pos: [0, 0.035 * k, 0], hips: [0, 0, 0], spine: [0, 0, ROLL * s * k], chest: [0, 0, 0], neck: [0, 0, 0],
  head: [-8, -3, -ROLL * s * k], ...SQ(C_SQ * k, C_LIFT * k, -ROLL_C * Math.sin(ROLL * s * k * D2R)),
  ...WINGS(18, 6, 0), tail: [8, 0, -24 * s], jaw: [0, 0, 0] });
const pass = (s, k = 1) => ({ pos: [0, 0.06 * k, 0], hips: [0, 0, 0], spine: [6, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0],
  head: [-6, 0, 0], ...SQ(-0.04 * k, P_LIFT * k), ...WINGS(-38 * k, 34 * k, 22), tail: [6, 0, 14 * s], jaw: [0, 0, 0] });
const runContact = (s) => ({ pos: [0, -0.02, 0], hips: [0, 0, 0], spine: [10, 0, 9 * s], chest: [0, 0, 0], neck: [0, 0, 0],
  head: [-16, -3, -8 * s], ...SQ(0.1), ...WINGS(12, 4, 0), tail: [10, 0, -18 * s], jaw: [0, 0, 0] });
const runUp = (s) => ({ pos: [0, 0.12, 0], hips: [0, 0, 0], spine: [18, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0],
  head: [-16, 0, 0], ...SQ(-0.05), ...WINGS(-52, 36, 12), tail: [-6, 0, 8 * s], jaw: [0, 0, 0] });

const breath = (d, extra = {}) => ({ pos: [0, -0.012, 0], ...SQ(-0.035 * d), ...WINGS(0, 3 * d, 0), head: [-3 * d, 0, 0], ...extra });

export const VOTE_UP = { pos: [0, 0.03, 0], spine: [-4, 0, 0], head: [-12, 0, 0], ...SQ(-0.06), ...OPEN, jaw: [14, 0, 0],
  ...WINGS(-15, 162, 36), tail: [-8, 0, 0] };
const DIE_TOE = 80;   // r2 die: toes along the shin (pointing out of the silhouette), not at the camera (flat triangle)
const DEAD = { pos: [0.1, 0.2, 0], hips: [0, 0, 84], spine: [0, 0, 0], head: [0, 0, -28], ...SHUT, jaw: [12, 0, 0],
  wingL: [0, 0, 0], wingR: [-10, 0, 40], wingTipR: [0, 0, 14], tail: [0, 0, 0], ...LEGS(10, 0, 22), 'shinL.s': [0, 1.3, 0], 'shinR.s': [0, 1.3, 0],
  footL: [DIE_TOE, 0, 0], footR: [DIE_TOE, 0, 0] };
const PUFF = (k) => ({ pos: [0, 0.02 + 0.03 * k, 0], spine: [-4 * k, 0, 0], head: [-14 - 2 * k, 0, 0], ...SQ(-0.08 - 0.02 * k), ...SHUT,
  wingL: [0, -10, 58], wingR: [0, -10, 58], wingTipL: [0, 0, -40], wingTipR: [0, 0, -40], tail: [-8, 0, 0] });
const SIT = (a, y, extra = {}) => ({ pos: [0, y, 0.04], ...SQ(a), ...LEGS(75, -20, 12), ...WINGS(0, 42, 10), head: [4, 0, 0], tail: [10, 0, 0], ...extra });

export const CLIPS = {
  walk: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    { f: 0, pose: contact(1) }, { f: 1, pose: pass(1) }, { f: 2, pose: contact(-1) }, { f: 3, pose: pass(-1) }] },
  run: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    { f: 0, pose: runContact(1) }, { f: 1, pose: runUp(1) }, { f: 2, pose: runContact(-1) }, { f: 3, pose: runUp(-1) }] },
  // idle: breathe (extremes held 30 / 18), a goose glance toward the camera side with eyes open + tail flick, a blink
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breath(0) },
    { f: 30, pose: breath(1) },
    { f: 36, pose: breath(1, { head: [-4, -24, -10], neck: [0, -6, 0], ...OPEN, tail: [0, 0, 22] }) },
    { f: 54, pose: breath(0) },
  ] },
  // talk (loop 24, r2): a WING GESTURE every 12 frames, alternating sides (f0 near R wing out 60; f12 far L wing out 58
  // and R back in: ≥ 50° change per 12 frames), beak OPEN (jaw 44-48, ink slot behind) with the chin UP on f0/f12; the
  // 6-frame beats shut the beak, level the head, squash and fold the gesturing wing halfway (talk.micro)
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, -0.012, 0], spine: [0, -4, -5], head: [-18, -8, -8], jaw: [48, 0, 0], ...SQ(-0.03), wingR: [30, 0, 60], wingTipR: [0, 0, 22] } },
    { f: 6, pose: { pos: [0, -0.03, 0], head: [2, 0, 5], jaw: [0, 0, 0], ...SQ(0.05), wingR: [14, 0, 30], wingTipR: [0, 0, 10] } },
    { f: 12, pose: { pos: [0, -0.012, 0], spine: [0, 4, 5], head: [-18, 4, 8], jaw: [44, 0, 0], ...SQ(-0.03), wingL: [30, 0, 58], wingTipL: [0, 0, 22], wingR: [0, 0, 2] } },
    { f: 18, pose: { pos: [0, -0.03, 0], head: [2, -4, -3], jaw: [0, 0, 0], ...SQ(0.05), wingL: [14, 0, 28], wingTipL: [0, 0, 10] } },
  ] },
  // vote: a 3-frame dip (squash, wings in) → BOTH wings up in a V, chin up, eyes open → held
  vote: { fps: 30, loop: false, interp: 'step', events: { 3: 'vote@wingTipL' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], head: [6, 0, 0], ...SQ(0.12), ...WINGS(8, 2, 0), tail: [10, 0, 0] } },
    { f: 3, pose: VOTE_UP },
    { f: 30, pose: VOTE_UP },
  ] },
  // die (gentle): surprised wobble → tips over onto its left side → lands (squash) → settles, feet out, eyes shut
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', keys: [
    { f: 0, pose: { pos: [0, 0.02, 0], spine: [0, 0, -10], head: [-10, 0, 8], ...SQ(-0.06), ...OPEN, jaw: [22, 0, 0], ...WINGS(-10, 45, 10) } },
    { f: 8, pose: { pos: [0.04, 0.07, 0], hips: [0, 0, 42], head: [0, 0, -14], ...SHUT, jaw: [16, 0, 0], ...WINGS(-10, 70, 20), ...LEGS(10, -20, 20) } },
    { f: 13, pose: { ...DEAD, pos: [0.1, 0.17, 0], hips: [0, 0, 90], 'ball.s': [-0.1, 0.05, 0.05], wingR: [-10, 0, 62] } },
    { f: 17, pose: { ...DEAD, wingR: [-10, 0, 30] } },
    { f: 24, pose: DEAD },
    { f: 60, pose: DEAD },
  ] },
  // plop (emote "nobody argues"): puffs up tall, wings akimbo, chin up, eyes shut (smug) → hop → PLOPS into a sit (big
  // squash + dust) like a dropped cushion → settles → stands
  plop: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 18: 'land' }, keys: [
    { f: 0, pose: PUFF(0) },
    { f: 4, pose: PUFF(1) },
    { f: 14, pose: { pos: [0, 0.12, 0], ...SQ(-0.05), ...WINGS(-10, 72, 26), head: [-6, 0, 0], tail: [-8, 0, 0], ...LEGS(30, -50) } },
    { f: 18, pose: SIT(0.22, -0.11, { 'head.p': [0, -0.03, 0] }) },
    { f: 22, pose: SIT(0.1, -0.06) },
    { f: 26, pose: SIT(0.16, -0.08) },
    { f: 36, pose: { ...breath(0), pos: [0, 0.03, 0], ...SQ(-0.04) } },
    { f: 40, pose: breath(0) },
  ] },
};

// ── (t3) point — the game's shared emote ("that one!"; the game turns the avatar toward the target and draws the trail).
// Chonk singles someone out with the FAR (left) wing stretched forward-up past its beak like a finger (wingL.s y +0.5),
// the body turned 25° so the left flank leads and the head counter-turned to stare down the wing, beak open. At the game
// facing SE the wing is a screen-horizontal slab ahead of the face (probe tu3 f10: right wing / straight-forward / lower
// variants vanished into the ball at SE). S (pointing at the camera) hides it behind the ball: accepted.
// Gather (squash, wing cocked back, 4 f) → POINT (held 26) → firmer jab, lean in (held 32) → wing folds (10) → rest.
const PT_W = [110, 0, 45], PT_YAW = -25;
const POINT = (d = 0) => ({ pos: [0, 0.02, 0.03 * d], spine: [4 + 6 * d, PT_YAW, 0], chest: [0, 0, 0], neck: [10 + 4 * d, 0, 0],
  head: [-10 - 4 * d, -PT_YAW, 0], 'head.p': [0, 0, 0.05 + 0.02 * d], jaw: [d ? 18 : 32, 0, 0], ...OPEN, ...SQ(-0.04),
  wingL: [PT_W[0] - 8 * d, PT_W[1], PT_W[2]], wingTipL: [0, 0, 0], 'wingL.s': [0, 0.5, 0], wingR: [0, 0, 8], tail: [-6, 0, -10] });
CLIPS.point = { fps: 30, loop: false, interp: 'step', length: 84, keys: [
  { f: 0, pose: { pos: [0, -0.03, 0], spine: [-6, -10, 0], head: [8, 10, 0], ...SQ(0.1), wingL: [-30, 0, 30], wingTipL: [0, 0, 10], tail: [8, 0, -8] } },
  { f: 4, pose: POINT(0) },
  { f: 30, pose: POINT(1) },
  { f: 62, pose: { pos: [0, -0.01, 0], spine: [0, -8, 0], head: [-4, 8, 0], ...SQ(0.04), wingL: [20, 0, 18], wingTipL: [0, 0, 6], tail: [0, 0, -4] } },
  { f: 72, pose: breath(0) },
] };

// ── (t3) ghost / ghost-spent. Dead players hover as a pale-blue ghost (v1 ghost row: the ball in monochrome ice blue,
// fading out toward the bottom, a gold halo over the head while the ghost vote is unspent).
//   * hover: root up (the loop clip keeps the legacy Gait's ground IK: the hips dip ≤ 0.1 m toward the hidden feet,
//     so pos carries hover + 0.1), a 1-texel bob in held step keys 0.6 s apart, a slow ±4° roll, wings eased open;
//     the shins (+ feet, children) are scaled away;
//   * pale: material.tones (GHOST_GLSL) remaps every tone by luminance onto a pale-blue ramp when the halo bone's world
//     scale says "ghost" (spent: greyer and darker); the bottom of the ball dissolves with a 2×2 ordered dither
//     (discard) between bind heights GF (gone → solid);
//   * halo: 'halo.s' grows the buried ring (ghost only, flat emissive gold).
const GH = [0.27, 0.23, 0.21, 0.18];          // ghost root y: [hi, lo] unspent, [hi, lo] spent (m, incl. the 0.1 IK dip)
const GF = [0.16, 0.62, 0.16, 0.56];          // dissolve bind heights: [gone, solid] unspent, [gone, solid] spent (m)
const GHOST_UP = 1 / HALO_K - 1, GHOST_SPENT = 1;
const HIDE_LEGS = { 'shinL.s': [-0.98, -0.98, -0.98], 'shinR.s': [-0.98, -0.98, -0.98] };
const GHOST = (y, roll, halo, extra = {}) => ({ pos: [0, y, 0], spine: [0, 0, roll], chest: [0, 0, 0], head: [-6, 0, -roll], ...SQ(-0.03),
  ...WINGS(4, 22, 8), tail: [-4, 0, 0], ...HIDE_LEGS, 'halo.s': [halo, halo, halo], ...extra });
const ghostClip = (hi, lo, roll, halo, extra = {}) => ({ fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
  { f: 0, pose: GHOST(hi, roll, halo, extra) },
  { f: 18, pose: GHOST((hi + lo) / 2, 0, halo, extra) },
  { f: 36, pose: GHOST(lo, -roll, halo, extra) },
  { f: 54, pose: GHOST((hi + lo) / 2, 0, halo, extra) },
] });
CLIPS.ghost = ghostClip(GH[0], GH[1], 4, GHOST_UP);
// spent: lower, heavier hover, head bowed, eyes flatter, wings hanging, tail down, no halo, dimmer (shader)
CLIPS['ghost-spent'] = ghostClip(GH[2], GH[3], 3, GHOST_SPENT, { head: [10, 0, 0], ...EYES(0.05, -0.35), ...WINGS(0, 6, 0), tail: [8, 0, 0], ...SQ(0.04) });

const lin = (h) => new THREE.Color(h).convertSRGBToLinear().toArray().map((v) => v.toFixed(4)).join(', ');
const GHOST_GLSL = {
  vertexHead: 'flat varying float vGhost; flat varying float vGhostHalo;',
  vertex: (headI, haloI) => `
    vGhost = 0.0; vGhostHalo = 0.0;
    #ifdef USE_SKINNING
      {
        float gH = length(getBoneMatrix(${headI}.0)[0].xyz);
        float gS = length(getBoneMatrix(${haloI}.0)[0].xyz) / max(gH, 1e-6);
        vGhost = gS > 100.0 ? 1.0 : (gS > 1.5 ? 2.0 : 0.0);
        vGhostHalo = abs(skinIndex.x - ${haloI}.0) < 0.5 ? 1.0 : 0.0;
      }
    #endif`,
  // chonk is almost all LIGHT (down, wing grey): perceptual lightness √luma onto a mid-blue → ice ramp with a gentle
  // slope keeps the down's hi/mid/sh steps, the grey wings one step below and the ^ eyes dark blue
  fragmentHead: `flat varying float vGhost; flat varying float vGhostHalo;
    vec3 ghostTone(vec3 c, float spent) {
      float l = clamp((sqrt(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0)) - 0.12) * 1.2, 0.0, 1.0);
      vec3 g = mix(vec3(${lin('#4A64A0')}), vec3(${lin('#E4F6FF')}), l);
      return spent > 0.5 ? mix(g, vec3(dot(g, vec3(0.2126, 0.7152, 0.0722))), 0.45) * 0.62 : g;
    }`,
  tones: `
    if (vGhost > 0.5) {
      if (vGhostHalo < 0.5) {
        float gSpent = vGhost > 1.5 ? 1.0 : 0.0;
        float gLo = mix(${GF[0].toFixed(3)}, ${GF[2].toFixed(3)}, gSpent), gHi = mix(${GF[1].toFixed(3)}, ${GF[3].toFixed(3)}, gSpent);
        float gA = clamp((vCharBind.y - gLo) / (gHi - gLo), 0.0, 1.0);
        ivec2 gq = ivec2(gl_FragCoord.xy) & 1;
        float gT = gq.x == 0 ? (gq.y == 0 ? 0.125 : 0.625) : (gq.y == 0 ? 0.875 : 0.375);
        if (gA < gT) discard;
        toonHi = ghostTone(toonHi, gSpent); toonMid = ghostTone(toonMid, gSpent); toonSh = ghostTone(toonSh, gSpent);
        float kNight = 1.0 - smoothstep(0.35, 0.6, dot(uRampHi, vec3(0.299, 0.587, 0.114)));
        totalEmissiveRadiance += toonMid * (gSpent > 0.5 ? 0.12 : 0.3) * kNight;
      } else {
        totalEmissiveRadiance = vec3(${lin(PALETTE.halo[0])});
        toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0);
      }
    }`,
};

export function make() {
  const S = skeleton();
  return {
    name: 'chonk',
    height: H,
    palette: PALETTE,
    signature: 'down',
    faceSlot: 'down',
    bodyPlan: 'bird',
    heightPx: [48, 60],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'waddle' },
    emote: 'plop',
    skeleton: S,
    parts: parts(S),
    sockets: S.sockets,
    feet: ['footL', 'footR'],
    chains: [],
    personality: { body: { f: 3.5, zeta: 0.8, r: 0 }, head: { f: 4, zeta: 0.8, r: 0 } },
    locomotion: { walkSpeed: V_GAME, runSpeed: 2 * V_GAME, stride: 0.6 * H, runStride: 1.05 * H, duty: [0.08, 0.06], reach: 0.6, poses: [4, 4],
      lift: [0.28, 0.08], spacing: 0.5, bob: [0.035, 0.035], lean: [0, 0], runFroude: [FR_GAME * 1.5, FR_GAME * 2],
      bones: { hips: 'hips', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head', armL: ['wingL', 'wingTipL'], armR: ['wingR', 'wingTipR'],
        legL: ['thighL', 'shinL', 'footL'], legR: ['thighR', 'shinR', 'footR'] } },
    character: { legIK: 'pose', quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    // r2: plop dust = the 'land' ring only (motes fly out to the sides) in light tones above the grass value (r1 poof@hips
    // left three beige 8x4 'eggs' under the goose)
    fx: { feather: [PALETTE.wing[0], PALETTE.wing[2]], vote: { node: 'wingTipL' }, dust: ['#F4EEE2', '#DED5C4', '#BDB2A0'] },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', footL: 'mid', footR: 'mid', shinL: 'mid', shinR: 'mid' },
      // (t3) ghost / ghost-spent look (GHOST_GLSL; bone index = skeleton order = rig.js topological order, parents first)
      vertexHead: GHOST_GLSL.vertexHead, fragmentHead: GHOST_GLSL.fragmentHead, tones: GHOST_GLSL.tones,
      vertex: GHOST_GLSL.vertex(S.findIndex((b) => b.name === 'head'), S.findIndex((b) => b.name === 'halo')) },
  };
}

export default make();
