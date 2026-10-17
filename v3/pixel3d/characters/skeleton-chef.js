// Bones (char-skeleton-chef) — cast member "skeleton-chef", villager: "The baker. Nobody asks how long he has been dead."
// Design sheet (## Unique to me, timing charts, ## Self-critique): characters/skeleton-chef.md. Identity source (read
// only): pipgws/packages/assets/scripts/cast/skeleton-chef.ts + refs/cast/skeleton-chef.png.
// Body plan: upright CHIBI (chibi(), skull 0.44 m = 2.3 heads under a 0.4 m toque, legs 0.26 H) driven by the
// LEGACY biped Gait (CAST_PORTING §8 chibi recipe, legIK 'pose') at game speed = a stiff rattle-scurry. The arms carry
// the basket in the REST geometry (authored bent) and the gait's arm swing is 0; the authored clips.walk / clips.run
// (one key per gait drawing) drive the upper body: jaw clack on every contact, toque wobble, skull rattle.
// LegGait 'biped' was rejected: its reach drop crouched these 0.36 m legs until he ran seated (module issue).
// Structure: palette → skeleton (chibi + toque/bow chains + basket/loaf/jaw2 bones, bent carry arms) → parts → clips → spec.
import * as THREE from 'three';
import { chibi, chain } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const H = 1.40;                       // ground → toque top (castHeight(35))
export const V_GAME = 3.95 * H;              // 5.53 m/s: v2 150 px/s on a 38 px sprite, relative to body height
const BODY = { height: 1.0, heads: 2.3, legs: 1.0, arms: 0.95, snout: 0, ears: false, tail: false, shoulders: 0.36, hips: 0.15 };
const FACE = { eye: [0.088, 0.29, 0.222], brow: false, mouth: false };
const EYE_OUT = -12;   // socket yaw outward (deg); v2's 20° made the far socket a 1-px sliver at SE (dir 1)

// [hi, mid, sh] sRGB. 5 slots + 1 accent (bread).
// v3: bone dropped to a cooler grey-cream so the toque/skull step survives the golden-hour multiply (critic: in golden
// sun #F4C381 toque vs #EFBA6E skull merged into one peach blob); toque cloth pushed to near-white.
export const PALETTE = {
  bone: ['#D8CCB2', '#B8AC96', '#8C7C84'],    // signature 2: the round skull; bony hands, forearms, shins (grey-cream)
  cloth: ['#FFFDF8', '#E8E2D8', '#A49CB0'],   // signature 1: the puffy toque; apron, bow, teeth (cool near-white)
  shirt: ['#4A5688', '#3C4570', '#3C3456'],   // dark navy shirt + trousers (v2 #323A5A; only sh lifted for the night rule)
  dark: ['#6E4A44', '#4A3236', '#382833'],    // eye sockets, nose, mouth, boots
  wicker: ['#C88A48', '#9A6634', '#5E3E38'],  // the basket
  bread: ['#FFD27A', '#E09A44', '#A0603C'],   // accent: loaves
};

// arm segment directions at rest: [out°, fwd°] (L side; R mirrored): elbows bent, hands forward on the basket rim
const ARM = { up: [10, 62], fore: [-4, 88] };
const armDir = ([o, f]) => { const O = o * Math.PI / 180, F = f * Math.PI / 180; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
// basket centre in CHARACTER space (rest), loaf offsets inside it
const BASKET = { y: 0.45, z: 0.235 };
const TOQUE_AT = [0, 0.405, -0.01];
const HALO_AT = [0, 0.53, 0];            // toque0-local: ≈ 0.12 m over the top puff (toque top ≈ 0.43 above the band joint)
const HALO_MICRO = 0.001;
const BAGUETTE = [0.2, 0.075, -0.005];   // handR-local centre of the 0.46 m baguette (grip end at the hand)

export function skeleton() {
  const S0 = chibi({ ...BODY, face: FACE });
  const m = S0.meta;
  const S = S0.map((b) => ({ ...b }));
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    for (const [n, a] of [[`forearm${s}`, ARM.up], [`hand${s}`, ARM.fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a);
      const len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  // jaw hinge at the BACK of the mandible (frog lesson: a front hinge barely moves the chin); jaw2 = child hinge the
  // gait drives on the other footfall (jaw opens on L touchdown, jaw2 on R → a clack every step)
  S.find((b) => b.name === 'jaw').pos = [0, 0.105, -0.05];
  S.push({ name: 'jaw2', parent: 'jaw', pos: [0, 0, 0], axis: 'fwd', limits: { fwd: [-5, 40], twist: [-10, 10], out: [-10, 10] } });
  // basket on the chest (midline, moves with the torso); the baguette lies across it from the LEFT hand (talk / vote)
  S.push({ name: 'basket', parent: 'chest', pos: [0, BASKET.y - m.chestY, BASKET.z], axis: 'up' });
  S.push(...chain('toque', { n: 1, parent: 'head', at: TOQUE_AT, dir: [0, 1, 0], len: 0.36 }));
  S.push(...chain('bow', { n: 1, parent: 'spine', at: [0, 0.0, -0.15], dir: [0, -1, -0.3], len: 0.13 }));
  // touch-up (ghost clips): the gold HALO floats over the toque puffs (microscopic rest ring, 'halo.s' ×1000 in `ghost`
  // only) and GHOSTK, a part-less control bone on the hips whose scale is the ghost level the material reads
  // (0 alive, 'ghostK.s' 1 → ghost, 2 → ghost-spent; crow scheme, see GHOST_GLSL)
  S.push({ name: 'halo', parent: 'toque0', pos: HALO_AT, axis: 'up' });
  S.push({ name: 'ghostK', parent: 'hips', pos: [0, 0, 0], axis: 'up' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: m } });
}

// bbox-centred ball (8-sided lathe), r = radius
const ball = (r, o = {}) => K.lathe([[0.001, 0], [0.71 * r, 0.29 * r], [r, r], [0.71 * r, 1.71 * r], [0.001, 2 * r]], 8, o);
const segRot = (d) => {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z].map((r) => r * 180 / Math.PI);
};

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── skull (head joint = chin): cranium lathe above the smile line, mandible on the jaw bone ──
  const CR = [[0.15, 0], [0.235, 0.06], [0.262, 0.15], [0.248, 0.24], [0.18, 0.31], [0, 0.345]];
  add('head', K.lathe(CR, 8, { sz: 0.94 }), [0, 0.095 + 0.345 / 2, 0.0], 'bone', { name: 'skull' });
  // mouth cavity (shows only when the jaw opens); kept in front of z −0.05 so it never pokes out of the nape at N
  add('head', K.box(0.28, 0.06, 0.14), [0, 0.085, 0.03], 'dark', { name: 'mouthIn' });
  // nose hole: small and raised so a cream gap ≥ 1 texel separates it from the teeth (v2 read as a moustache)
  add('head', K.box(0.04, 0.032, 0.04), [0, 0.182, 0.238], 'dark', { name: 'nose' });
  // mandible: chamfered block hinged at the back; its top face carries the dark mouth floor (shows when open)
  add('jaw2', K.chamferBox(0.30, 0.10, 0.27, 0.3), [0, -0.045, 0.13], 'bone', { name: 'skull' });
  add('jaw2', K.box(0.2, 0.02, 0.12), [0, 0.006, 0.07], 'dark', { name: 'mouthFloor' });
  // v1 tooth row: a LIGHT band (cloth near-white, ≥ 2 texels tall) across the front of the mandible with three 1-px dark
  // gaps, on jaw2 so it drops with the jaw (replaces v2's dark smile bar)
  add('jaw2', K.box(0.21, 0.065, 0.03), [0, -0.022, 0.262], 'cloth', { name: 'teeth' });
  for (const x of [-0.052, 0, 0.052]) add('jaw2', K.box(0.022, 0.065, 0.03), [x, -0.022, 0.268], 'dark', { name: 'toothGap' });
  // eye sockets: big dark insets (3×4 texels) with a 1-texel glint (friendly, not scary)
  // (turned 20° outward and sunk to follow the skull: a straight box poked out of the silhouette at SE/SW/E/W)
  add('eyeL', K.xf(K.box(0.11, 0.115, 0.05), { rot: [0, EYE_OUT, 0] }), [0, 0, -0.012], 'dark', { name: 'socket', mirror: true });
  add('eyeL', K.xf(K.box(0.036, 0.036, 0.02), { rot: [0, EYE_OUT, 0] }), [0.022, 0.026, 0.014], 'cloth', { name: 'glint', mirror: true });
  // neck vertebrae: three stacked bones hidden inside the skull at rest; when the skull pops 0.28 m (offer) they show
  // as a segmented cream stalk 2.5 texels wide between the collar and the jaw
  for (const y of [0.05, 0.15, 0.25]) add('neck', K.box(0.075, 0.08, 0.075), [0, y, 0], 'bone', { name: 'vertebra' });

  // ── toque on its 1-link chain (joint = band bottom): band + a cluster of puffs (same slot + bone → no inner lines
  // between them; the bumps are the silhouette) ──
  // (silhouette) the puff ring (Ø ≈ 0.56) overhangs a narrower band (Ø 0.38): the chef-hat neck-in reads at 25 %
  add('toque0', K.frustum(8, 0.19, 0.195, 0.10), [0, 0.05, 0], 'cloth', { name: 'toque' });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    add('toque0', ball(0.135), [Math.sin(a) * 0.145, 0.215, Math.cos(a) * 0.145], 'cloth', { name: 'toque' });
  }
  add('toque0', ball(0.16), [0, 0.2, 0], 'cloth', { name: 'toque' });
  add('toque0', ball(0.125), [-0.02, 0.31, 0.0], 'cloth', { name: 'toque' });

  // ── torso: shirt, apron bib + skirt on the front, bow at the back ──
  const chestH = m.shoulderY - m.chestY + 0.05;
  add('chest', K.chamferBox(0.34, chestH, 0.27, 0.3), [0, chestH / 2 - 0.01, 0], 'shirt', { name: 'shirt' });
  add('chest', K.box(0.22, chestH - 0.03, 0.03), [0, chestH / 2 - 0.02, 0.135], 'cloth', { name: 'apron' });
  const waistH = m.chestY - m.spineY + 0.02;
  add('spine', K.chamferBox(0.32, waistH, 0.26, 0.3), [0, waistH / 2, 0], 'shirt', { name: 'waist' });
  add('spine', K.box(0.24, waistH, 0.03), [0, waistH / 2, 0.13], 'cloth', { name: 'apron' });
  const pelY = m.spineY - m.hipsY;
  add('hips', K.chamferBox(0.31, 0.11, 0.25, 0.3), [0, pelY - 0.04, 0], 'shirt', { name: 'pelvis' });
  add('hips', K.box(0.26, 0.14, 0.03), [0, pelY - 0.06, 0.125], 'cloth', { name: 'apron' });
  // bow loops at the back of the waist + the tails on the bow chain
  for (const s of [-1, 1]) add('spine', K.hull([[0, 0, 0], [s * 0.1, 0.045, -0.02], [s * 0.1, -0.045, -0.02], [s * 0.02, 0, 0.02], [s * 0.08, 0, -0.04]]),
    [0, waistH / 2, -0.15], 'cloth', { name: 'bowLoop' });
  add('bow0', K.hull([[-0.03, 0, 0], [0.03, 0, 0], [-0.07, -0.13, 0], [0.07, -0.13, 0], [-0.03, 0, -0.03], [0.03, 0, -0.03], [-0.07, -0.13, -0.03], [0.07, -0.13, -0.03]].map(([x, y, z]) => [x, y, z - 0.3 * -y])),
    [0, 0, 0], 'cloth', { name: 'bowTail' });

  // ── arms: rolled shirt sleeve (upper arm), bony forearm + hand, along the bent rest directions ──
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    const du = m3(armDir(ARM.up)), df = m3(armDir(ARM.fore));
    add('upperArm' + sd, K.xf(K.frustum(4, 0.07, 0.078, m.upperArm + 0.03), { rot: segRot(du) }), du.map((v) => v * m.upperArm / 2), 'shirt', { name: 'sleeve' + sd });
    add('forearm' + sd, K.xf(K.frustum(4, 0.042, 0.046, m.forearm), { rot: segRot(df) }), df.map((v) => v * m.forearm / 2), 'bone', { name: 'forearm' + sd });
    add('hand' + sd, K.chamferBox(0.08, 0.075, 0.085, 0.35), df.map((v) => v * 0.03), 'bone', { name: 'hand' + sd });
  }

  // ── legs: trousers to the knee, bone shins, brown boots ──
  add('thighL', K.frustum(4, 0.075, 0.068, m.thigh + 0.03), [0, -m.thigh / 2 + 0.01, 0], 'shirt', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.042, 0.042, m.shin), [0, -m.shin / 2, 0], 'bone', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.11, m.ankleY + 0.04, 0.17, 0.35), [0, -m.ankleY / 2 + 0.02, 0.035], 'dark', { name: 'boot', mirror: true });

  // ── basket (wicker frustum + rim) with three loaves; the middle loaf rides its own bone (vote) ──
  add('basket', K.frustum(8, 0.13, 0.17, 0.11, { sz: 0.66 }), [0, -0.025, 0], 'wicker', { name: 'basket' });
  add('basket', K.frustum(8, 0.185, 0.185, 0.04, { sz: 0.68 }), [0, 0.04, 0], 'wicker', { name: 'basketRim' });
  add('basket', K.xf(ball(0.06), { scale: [1.4, 1, 1] }), [-0.07, 0.08, 0.04], 'bread', { name: 'loaf' });
  add('basket', K.xf(ball(0.06), { scale: [1.4, 1, 1] }), [0.07, 0.08, -0.035], 'bread', { name: 'loaf' });
  // the baguette: held at its end by the RIGHT hand (the near side at the game facing SE), lying across the basket top (the hand's rest frame = character axes)
  add('handR', K.xf(ball(0.055), { scale: [4.2, 1, 1] }), BAGUETTE, 'bread', { name: 'baguette' });
  // halo (ghost only): an open octagonal ring r 0.17 m, bar 0.045 m (≥ 1.5 texels), built at 1/1000 size (crow recipe)
  const ring = [];
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * Math.PI / 4;
    ring.push(K.xf(K.box(0.15, 0.045, 0.05), { rot: [0, a * 180 / Math.PI, 0], at: [Math.sin(a) * 0.165, 0, Math.cos(a) * 0.165] }));
  }
  add('halo', K.xf(K.merge(...ring), { scale: HALO_MICRO }), [0, 0, 0], 'bread', { name: 'halo' });
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; deltas from the bent carry rest) ────────────────────────────────────
const EYES = (sy, sx = 0) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const SHUT = EYES(-0.7), WIDE = EYES(0.25, 0.2), HALF = EYES(-0.4);
const base = (y = -0.012) => ({ pos: [0, y, 0] });
// vote: the RIGHT arm (near side at SE) up and out as far as a chibi arm goes (the hand reaches only skull height),
// the wrist turns the 0.46 m baguette upright-out like a torch so it breaks the silhouette beside the toque; the body
// leans to its left to lift the right shoulder (tuned on 8-facing stills: shots/char-skeleton-chef/wv-vote-*.png)
// v3: the chibi arm cannot lift the loaf above the toque, so the SKELETON arm telescopes: forearm and hand slide out of
// their joints along the bone (`.p` offsets, cream gaps at 1x) and the chest twists the right shoulder back so the loaf
// clears the toque on the screen-left side at the game facing (tuned on v3/vt*-x4.png: vt15)
const TELE = (seg, d) => { const v = armDir(seg); return [-v[0] * d, v[1] * d, v[2] * d]; };   // R-side rest direction × d
const VOTE_UP = { pos: [0, 0.04, 0], spine: [-3, 0, 8], chest: [-4, -20, 8], head: [-8, 12, -10], jaw: [18, 0, 0], ...WIDE,
  upperArmR: [70, 0, 110], forearmR: [-40, 0, 0], handR: [-70, 0, -90], 'forearmR.p': TELE(ARM.up, 0.26), 'handR.p': TELE(ARM.fore, 0.2) };
const breath = (d, extra = {}) => ({ ...base(-0.012 - 0.028 * d), chest: [4 * d, 0, 0], head: [-4 * d, 0, 0], ...extra });

const ARMS0 = { upperArmL: [0, 0, 0], upperArmR: [0, 0, 0], forearmL: [0, 0, 0], forearmR: [0, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0] };
// moving, he hugs the basket 0.08 m higher (forearms curl up with it) so the bone shins and boots show below it in
// every drawing (critic v2: the run sank until the legs vanished behind the basket); tuned on v3/gE, gF vs gD
const CARRY_UP = { 'basket.p': [0, 0.08, 0.03], forearmL: [-32, 0, 0], forearmR: [-32, 0, 0] };

function GAIT(jaw, tq, tw, back) {
  const k = (f, open, side) => ({ f, pose: { ...ARMS0, ...CARRY_UP, jaw: [open ? jaw : 0, 0, 0], head: [back * 0.5, side * tw, 0], toque0: [back, 0, side * tq] } });
  return [k(0, true, 1), k(1, false, 1), k(2, true, -1), k(3, false, -1)];
}
export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breath(0) },
    { f: 30, pose: breath(1) },
    { f: 36, pose: breath(1, SHUT) },
    { f: 38, pose: breath(1) },
    { f: 60, pose: breath(0, { head: [0, 22, 6], jaw: [10, 0, 0] }) },
    { f: 66, pose: breath(0) },
  ] },
  // talk (loop 24): chin-up / nod, jaw open 30° on alternating keys, the RIGHT hand (near side at SE) waves the
  // baguette up-out on the open keys and returns it to the basket on the closed ones
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { ...base(), chest: [-4, -25, 0], head: [-10, 20, 4], jaw: [30, 0, 0], upperArmR: [40, 0, 70], forearmR: [-60, 0, 0], handR: [-90, 0, -80] } },
    { f: 6, pose: { ...base(-0.035), chest: [3, -2, 0], head: [1, -4, -4], jaw: [0, 0, 0], upperArmR: [6, 0, 6] } },
    { f: 12, pose: { ...base(), chest: [-4, -8, 0], head: [-10, -10, 0], jaw: [26, 0, 0], upperArmR: [60, 0, 100], forearmR: [-35, 0, 0], handR: [-70, 0, -95] } },
    { f: 18, pose: { ...base(-0.035), chest: [3, 4, 0], head: [1, 6, -4], jaw: [4, 0, 0], upperArmR: [6, 0, 6] } },
  ] },
  // vote: dip, then the LEFT arm up-forward-out holding the baguette upright like a torch, sockets wide, HELD
  // walk / run (legacy Gait, authored UPPER body, one step key per gait drawing, f0 = left contact): the jaw clacks
  // open on each contact and shuts on the passing drawing, the toque wobbles side to side with the steps (± 9°), the
  // skull rattles (twist ± 6°); arms stay on the basket (keyed at rest so the procedural swing never moves them)
  walk: { fps: 30, loop: true, interp: 'step', length: 4, keys: GAIT(22, 9, 6, 0) },
  run: { fps: 30, loop: true, interp: 'step', length: 4, keys: GAIT(30, 12, 8, -10) },
  vote: { fps: 30, loop: false, interp: 'step', events: { 4: 'vote@tip' }, keys: [
    { f: 0, pose: { ...base(-0.05), spine: [6, 0, 0], chest: [6, 0, 0], head: [-6, 0, 0], upperArmR: [-15, 0, 10], jaw: [0, 0, 0] } },
    { f: 4, pose: VOTE_UP },
  ] },
  // die (touch-up, Clocktower rule: no hurt reaction): no `hurt` flash, no startled gasp — a resigned sigh (chin up, jaw
  // a little open, sockets half shut, arms settling on the basket) held 14 frames, then he gently falls apart
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 22: ['die', 'land'] }, keys: [
    { f: 0, pose: { ...base(-0.03), spine: [-4, 0, 0], chest: [-6, 0, 0], head: [-10, -8, 4], jaw: [14, 0, 0], ...HALF,
      upperArmR: [-6, 0, 4], upperArmL: [-6, 0, 4] } },
    { f: 14, pose: { pos: [0, -0.128, 0], spine: [18, 0, 0], chest: [10, 0, 0], head: [-24, 0, 0], jaw: [12, 0, 0], ...SHUT,
      thighL: [55, 0, 0], shinL: [-110, 0, 0], footL: [55, 0, 0], thighR: [55, 0, 0], shinR: [-110, 0, 0], footR: [55, 0, 0], upperArmR: [-10, 0, 20], upperArmL: [-10, 0, 20] } },
    { f: 18, pose: { pos: [0, -0.15, 0.0], spine: [26, 0, 0], chest: [12, 0, 0], head: [-34, 15, 10], 'head.p': [0.03, 0.06, 0.10], jaw: [34, 0, 0], ...SHUT,
      toque0: [-20, 0, 35], 'toque0.p': [0, 0.06, 0], 'basket.p': [-0.05, -0.1, 0.06],
      thighL: [60, 0, 0], shinL: [-120, 0, 0], footL: [60, 0, 0], thighR: [60, 0, 0], shinR: [-120, 0, 0], footR: [60, 0, 0], upperArmR: [20, 0, 60], upperArmL: [20, 0, 60] } },
    { f: 22, pose: DEAD() },
  ] },
  offer: { fps: 30, loop: false, interp: 'step', events: { 6: 'emote:heart@crown', 26: 'poof@crown' }, keys: [
    { f: 0, pose: { ...base(-0.03), spine: [-6, 0, 0], chest: [-4, 0, 0], head: [4, 0, 0], 'basket.p': [0, 0, -0.04], upperArmL: [-8, 0, 0], upperArmR: [-8, 0, 0] } },
    { f: 6, pose: { ...base(-0.03), spine: [8, 0, 0], chest: [4, 0, 0], head: [-16, 0, 10], jaw: [18, 0, 0], ...WIDE,
      'basket.p': [-0.04, 0.32, 0.2], basket: [-14, 0, 0], upperArmL: [75, 0, 0], upperArmR: [75, 0, 0], forearmL: [-40, 0, 0], forearmR: [-40, 0, 0] } },
    { f: 20, pose: { ...base(-0.01), spine: [6, 0, 0], chest: [2, 0, 0], head: [-8, 0, 0], 'head.p': [0, 0.28, 0], jaw: [36, 0, 0], ...WIDE,
      'basket.p': [0, 0.03, 0.03], upperArmL: [10, 0, 0], upperArmR: [10, 0, 0], forearmL: [-12, 0, 0], forearmR: [-12, 0, 0] } },
    { f: 26, pose: { ...base(-0.04), chest: [4, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0], toque0: [-10, 0, 0] } },
    { f: 32, pose: breath(0) },
  ] },
};
// DEAD = he falls apart: sits down hard (boots in the air), the skull rolls off to his front-right and lies face-up
// with the toque askew on it, the basket spills to his left (tuned on self/g8-die-f18-x5.png at 8 facings)
function DEAD() {
  return { pos: [0, -0.265, -0.04], spine: [10, 0, -6], chest: [8, 0, -4], neck: [0, 0, 0], head: [-60, -25, 15], 'head.p': [-0.24, -0.31, 0.26], jaw: [26, 0, 0], ...SHUT,
    toque0: [-35, 0, 10], 'basket.p': [0.26, -0.11, 0.12], basket: [20, 0, -25],
    thighL: [102, 0, 24], shinL: [-12, 0, 0], footL: [-25, 0, 0], thighR: [98, 0, 18], shinR: [-18, 0, 0], footR: [-25, 0, 0],
    upperArmR: [-40, 0, 45], forearmR: [-60, 0, 0], upperArmL: [-40, 0, 45], forearmL: [-60, 0, 0] };
}

// point (the game's shared emote, touch-up): the LEFT hand lets go of the basket rim and points at the one he faces;
// the bony arm STRETCHES along its own bone ('upperArmL.s' z +0.6, 'forearmL.s' z +0.3: the rest frames are character
// axes and both segments run mostly along +z) so the chibi arm reaches past the basket and the skull at 1x — only a
// skeleton can. Telescoping (sliding `.p` like the vote) was tried first: the gaps broke the arm into specks at SE
// (tu/c-p.png); a straight arm without stretch hid inside the basket (tu/c-pv.png). Skull turned to the target, jaw
// shut, knowing half-lids. No jab: one small lift of the hand as the emphasis, then the arm shrinks back home.
const POINT_AT = { upperArmL: [40, 0, 12], forearmL: [-26, 0, 0], handL: [-10, 0, 0], 'upperArmL.s': [0.3, 0.3, 0.6], 'forearmL.s': [0, 0, 0.3] };
const POINT = (extra = {}) => ({ ...base(-0.012), chest: [-2, 14, 0], head: [-4, -10, 0], ...HALF, ...POINT_AT, ...extra });
CLIPS.point = { fps: 30, loop: false, interp: 'step', keys: [
  { f: 0, pose: { ...base(-0.03), chest: [-2, -8, 0], head: [-2, 6, 0], upperArmL: [-10, 0, 14], forearmL: [20, 0, 0] } },
  { f: 4, pose: POINT() },
  { f: 22, pose: POINT({ upperArmL: [POINT_AT.upperArmL[0] + 10, 0, 12], head: [-8, -12, 0], jaw: [12, 0, 0] }) },
  { f: 28, pose: POINT() },
  { f: 42, pose: breath(0, { upperArmL: [8, 0, 4] }) },
  { f: 48, pose: breath(0) },
] };

// ── touch-up: GHOST look (spec-only, no shared code; crow scheme). Dead players hover as a pale blue ghost (v2 ghost
// row: the whole sprite re-toned pale blue, lower body fading, gold halo while the ghost vote is unspent). The clip sets
// the scale of the part-less bone `ghostK`; the vertex shader reads det(ghostK)/det(hips) = (1 + s)³ → ghost level
// 0 / 1 / 2. Fragment (`tones`): every tone (hi, mid, sh separately: the shading steps survive) is mapped by lightness
// onto a pale ramp (ghost: slate blue → ice white; spent: a dimmer grey-blue); in BIND height the trousers fade to mist
// (y < 0.40 / 0.30), the shins dissolve (y < 0.22 checker) and the boots are gone (y < 0.13); the halo keeps its gold.
const lin3 = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`; };
export const GHOST = {
  ghost: ['#4E6098', '#F2F8FF'],   // [dark end, light end] sRGB: pale blue (v2 ghost row)
  spent: ['#46506C', '#AEB8CE'],   // dimmer grey-blue: the spent ghost (no halo)
  mist: '#DCE6F6',
};
function boneOrder(S) {   // = rig.js buildCharacter topological order (the bone texture index)
  const by = new Map(S.map((b) => [b.name, b])), seen = new Set(), out = [];
  const visit = (b) => { if (seen.has(b.name)) return; if (b.parent) visit(by.get(b.parent)); seen.add(b.name); out.push(b.name); };
  S.forEach(visit);
  return out;
}
function restWorld(S, name) {
  const by = new Map(S.map((b) => [b.name, b]));
  const p = [0, 0, 0];
  for (let b = by.get(name); b; b = b.parent ? by.get(b.parent) : null) for (let i = 0; i < 3; i++) p[i] += (b.pos || [0, 0, 0])[i];
  return p;
}
function ghostMaterial(S) {
  const order = boneOrder(S), iG = order.indexOf('ghostK'), iH = order.indexOf('hips');
  const h = restWorld(S, 'halo');
  return {
    vertexHead: 'varying float vBonesGhost;',
    vertex: `
      vBonesGhost = 0.0;
      #ifdef USE_SKINNING
      {
        float dG = determinant(mat3(getBoneMatrix(${iG}.0))), dH = determinant(mat3(getBoneMatrix(${iH}.0)));
        float rg = dG / max(abs(dH), 1e-6);
        vBonesGhost = rg > 16.0 ? 2.0 : (rg > 4.0 ? 1.0 : 0.0);
      }
      #endif`,
    fragmentHead: `varying float vBonesGhost;
      vec3 bonesGhostTone(vec3 c, vec3 d, vec3 l) {
        float v = sqrt(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0));   // perceptual lightness of the linear tone
        return mix(d, l, clamp((v - 0.10) * 1.15, 0.0, 1.0));   // crow 1.55 saturated skull AND toque → one white blob
      }`,
    tones: `
      if (vBonesGhost > 0.5) {
        bool bonesHalo = distance(vCharBind, vec3(${h.map((v) => v.toFixed(4)).join(', ')})) < 0.01;
        if (!bonesHalo) {
          bool sp = vBonesGhost > 1.5;
          vec3 gd = sp ? ${lin3(GHOST.spent[0])} : ${lin3(GHOST.ghost[0])};
          vec3 gl = sp ? ${lin3(GHOST.spent[1])} : ${lin3(GHOST.ghost[1])};
          float y = vCharBind.y;
          ivec2 px = ivec2(gl_FragCoord.xy);
          if (y < 0.13) discard;
          if (y < 0.22 && ((px.x + px.y) & 1) == 1) discard;
          float fm = y < 0.30 ? 0.6 : (y < 0.40 ? 0.3 : 0.0);
          vec3 mist = sp ? ${lin3(GHOST.spent[1])} : ${lin3(GHOST.mist)};
          toonHi = mix(bonesGhostTone(toonHi, gd, gl), mist, fm);
          toonMid = mix(bonesGhostTone(toonMid, gd, gl), mist, fm);
          toonSh = mix(bonesGhostTone(toonSh, gd, gl), mist, fm);
        }
      }`,
  };
}
// ghost pose: hovering (legs fk, dangling, toes down), still hugging his basket, the toque swaying slowly, jaw a little
// slack; spent: lower, head bowed, sockets half shut, no halo
const GHOSTK = (lv) => ({ 'ghostK.s': [lv, lv, lv] });
const HALO = { 'halo.s': [1 / HALO_MICRO - 1, 1 / HALO_MICRO - 1, 1 / HALO_MICRO - 1] };
const LEGS_HANG = { thighL: [14, 0, 0], shinL: [-24, 0, 0], footL: [40, 0, 0], thighR: [8, 0, 0], shinR: [-16, 0, 0], footR: [36, 0, 0] };
const ghostPose = (lv, up, d, extra = {}) => ({ pos: [0, up, 0], ...GHOSTK(lv), ...(lv === 1 ? HALO : {}), ...LEGS_HANG,
  chest: [3 * d + (lv === 2 ? 6 : 0), 0, 0], head: [-3 * d + (lv === 2 ? 4 : -4), 0, 0], jaw: [lv === 2 ? 6 : 10, 0, 0],
  toque0: [0, 0, (d - 0.5) * 8], ...(lv === 2 ? EYES(-0.2) : {}), ...extra });
const ghostClip = (lv, hi, lo) => ({ fps: 30, loop: true, interp: 'step', length: 64, legs: 'fk', dynamics: 'hold', keys: [
  { f: 0, pose: ghostPose(lv, hi, 0) },
  { f: 16, pose: ghostPose(lv, (hi + lo) / 2, 0.5) },
  { f: 32, pose: ghostPose(lv, lo, 1) },
  { f: 48, pose: ghostPose(lv, (hi + lo) / 2, 0.5, { head: [lv === 2 ? 8 : -6, 16, 4] }) },   // a slow look aside
] });
CLIPS.ghost = ghostClip(1, 0.24, 0.18);
CLIPS['ghost-spent'] = ghostClip(2, 0.15, 0.11);

const holdTo = (clip, f) => clip.keys.push({ f, pose: clip.keys[clip.keys.length - 1].pose });
holdTo(CLIPS.vote, 30);
holdTo(CLIPS.die, 60);

export function make() {
  const S = skeleton();
  const FR_GAME = V_GAME * V_GAME / (9.81 * S.meta.hipsY);
  return {
    name: 'skeleton-chef',
    height: H,
    palette: PALETTE,
    signature: [{ part: 'toque' }, { part: 'skull' }],
    faceSlot: 'bone',
    bodyPlan: 'uprightAnimal',
    heightPx: [44, 56],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'scurry' },
    emote: 'offer',
    skeleton: S,
    parts: parts(S),
    sockets: { ...(S.sockets || {}), crown: { bone: 'head', at: [0, 0.86, 0] }, tip: { bone: 'handR', at: [BAGUETTE[0] + 0.23, BAGUETTE[1], BAGUETTE[2]] } },
    chains: [
      { name: 'bow', f: 4, zeta: 0.6, r: 0, gravity: 0.6, drag: 1, limit: 50, falloff: 1, noForward: true },
    ],
    personality: { body: { f: 2.2, zeta: 1, r: 0 }, head: { f: 2.2, zeta: 1, r: 0 } },
    // legacy biped Gait, CAST_PORTING §8 chibi recipe (walk = THE game speed on the WALK branch, runFroude raised):
    // LegGait 'biped' crouched the full leg (its reach drop Hh − √(Lg² − half²) with half ≈ 0.28 m > Lg 0.29 m on
    // these 0.30 m legs → he 'sat' while running; A/B shots/char-skeleton-chef/dir2 vs gv2). The legacy Gait also plays
    // the authored clips.walk / clips.run (upper body): jaw clack + toque wobble per drawing, arms held on the basket.
    // v3: run 1.5× (not 2×) game speed, stride 0.8 H, bob 0.03: the 2× run sank 7 texels until the legs hid (critic v2).
    locomotion: { walkSpeed: V_GAME, runSpeed: 1.5 * V_GAME, stride: 0.55 * H, runStride: 0.8 * H, duty: [0.18, 0.1], reach: 0.6,
      poses: [4, 4], lift: [0.05, 0.065], bob: [0.04, 0.03], lean: [3, 10], arms: [0, 0], elbows: [0, 0], twist: [5, 7],
      runFroude: [FR_GAME * 1.5, FR_GAME * 2] },
    character: { legIK: 'pose', quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { speech: { node: 'head' } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid' }, ...ghostMaterial(S) },
  };
}

export default make();
