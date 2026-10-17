// Character rig (rig owner): skeleton templates, spec → ONE SkinnedMesh, pose-triple convention.
// docs/CHARACTERS.md §1, §3, §5. Geometry helpers: src/chars/kit.js. Example spec: characters/mannequin.js.
//
// ─── SKELETON FORMAT ────────────────────────────────────────────────────────────────────────────────────────────
//   [{ name, parent?, pos:[x,y,z], axis?, limits? }]   (parents listed before children is NOT required)
//   pos   = joint position RELATIVE TO THE PARENT JOINT (root bone: relative to the character root at the feet).
//   Every bone has an identity rest rotation, so every bone's local frame = character space at rest
//   (x = character's LEFT, y up, z = facing). axis = the bone's rest direction (joint → child end): a vector or
//   'up'|'down'|'fwd'|'back'|'left'|'right'|'out' ('out' = +X for L bones, −X for R bones). Default: towards the
//   first child joint, else parent → this joint, else up. The axis is SNAPPED to its dominant world axis and only
//   decides which rotation axes the pose triple uses (table below).
//   limits = { fwd:[min,max], twist:[…], out:[…] } degrees, applied when applyPose(…, { clamp: true }).
//   Templates attach (non-enumerable) `skeleton.sockets` (default sockets) and `skeleton.meta` (joint heights,
//   segment lengths; author parts relative to these so proportions can change).
//
// ─── SIDES AND NAMES ────────────────────────────────────────────────────────────────────────────────────────────
//   A name ending in L / R (optionally followed by digits: earL0, hairR2) is sided; L = +X = the character's
//   LEFT. Everything else is midline. biped(): hips, spine, chest, neck, head, upperArmL/R, forearmL/R, handL/R,
//   thighL/R, shinL/R, footL/R, plus chains (cape0.., tail0.., hair0.., earL0../earR0..).
//   BODY PLANS (round 6; full lists in each template's doc comment, registry RIG_PLANS): uprightAnimal() = biped
//   names + jaw, ear/tail chains, face bones; quadruped(): body (ROOT, mid-torso), rump, chest, neck(, neck1…), head,
//   jaw, thighL/R → shinL/R → footL/R (HIND), upperArmL/R → forearmL/R → handL/R (FORE), tail0.., earL0..; longNeck();
//   bird(): body, chest, neck…, head, jaw (lower beak), upperArm/forearm/hand = WING paddles, thigh/shin/foot, tail0,
//   crest0..; hopper(): body (pelvis), chest, head, jaw, thigh/shin/foot (Z-folded hind), upperArm/forearm/hand (fore);
//   limbless(): base (ROOT anchor), body (SQUASH bone), snail front/back/neck/head/stalk*/shell | blob top/nub*.
//   face(S) adds eyeL/R (blink by scale), browL/R (axis out), mouth. Every template's .meta: plan, H, legs (IK chains
//   with group + pole), gaits (footfall phases), gait, bones (spec.locomotion.bones), restY, faceAt, slots, guide;
//   planGameSpeed(S) → what the plan must do at the v2 game speed (GAME_SPEED: 3.95 body heights/s, 0.31 s cycle).
//
// ─── EXTRA POSE CHANNELS ────────────────────────────────────────────────────────────────────────────────────────
//   '<bone>.s': [sx−1, sy−1, sz−1] scale OFFSET (0 = identity, so clip zero-fill is safe): squash/stretch, blink
//   ('eyeL.s': [0,−0.75,0]), expression swaps, hide a part ([−1,−1,−1]). '<bone>.p': [x,y,z] position offset (m, parent
//   frame) from the bone's rest position. Scale is inherited by child bones (put rigid props on a sibling and ride them
//   with .p — squashPose()). Never scale a leg bone the Gait IKs (IK lengths are the rest lengths).
//
// ─── POSE TRIPLE [fwd, twist, out] (degrees) → bone quaternion q = qFwd · qOut · qTwist ───────────────────────
//   (twist is applied first about the bone's own long axis, then out, then fwd; all axes are the bone's REST
//   axes in its parent's frame, so a triple means the same thing whatever the parent is doing.)
//   "outward" X' = +X for L bones and midline bones, −X for R bones.
//
//   rest dir (snapped)       | fwd +  (tip moves …)           | out + (tip moves …)        | twist + (about long axis)
//   -------------------------|--------------------------------|----------------------------|--------------------------------
//   down (limbs, cape, hair) | forward (+Z)                   | outward X'                 | the bone's front turns outward X'
//   up (spine, neck, head)   | forward (+Z): bend / nod       | towards X' (midline: LEFT) | front turns to X' (midline: LEFT)
//   fwd/back (foot, tail,    | DOWN (−Y): toe points, head    | towards X' (midline: LEFT  | top turns to X' (roll)
//     quadruped spine/head)  |   nods, tail droops            |   = yaw left for a head)   |
//   left/right (ear, wing)   | forward (+Z)                   | UP (+Y)                    | top turns forward (+Z)
//
//   Consequences (all verified on renders, scenes/_test-rig.js):
//     upperArmL [90,0,0] = arm straight forward; [0,0,90] = arm straight out to the side (T-pose), both sides.
//     forearmL [90,0,0] = elbow bent 90°, forearm forward (positive folds; negative hyper-extends).
//     shinL [-90,0,0] = knee bent 90°, shin back (NEGATIVE folds; positive hyper-extends). thighL [60,0,0] = leg
//     kicks forward. footL [20,0,0] = toes point down. head [20,0,0] nods forward; head [0,30,0] looks LEFT;
//     head [0,0,15] tilts LEFT. chest [0,25,0] turns the shoulders LEFT.
//     R bones mirror L bones: the rig flips 'out' and 'twist' for R (axes are built from the mirrored outward X'),
//     so a triple on armR does the mirror image of the same triple on armL.
//   mirrorPose(p): swaps L/R names; for MIDLINE bones it negates twist and out (a true mirror: chest twisting left
//   becomes twisting right) and negates pos.x. Sided triples are copied unchanged.
//   Root position: pose.pos = [x,y,z] or pose[<root>] = { rot:[f,t,o], pos:[x,y,z] } — an OFFSET in metres
//   (character space) from the root bone's rest position (crouch: pos [0,-0.08,0]).
//   Bones missing from a pose map are reset to rest (identity) by applyPose unless { reset: false }.
//
// ─── SPEC → MESH (buildCharacter) ───────────────────────────────────────────────────────────────────────────────
//   part = { bone, shape (BufferGeometry from kit.js; `geo` also accepted), at:[x,y,z] (offset from the bone joint,
//            character axes), rot:[x,y,z] deg (Euler XYZ, applied before `at`), scale, color: '<slot>' | [hi,mid,sh],
//            mirror: true (also emit the mirror copy: L bone → R bone with x negated; on a midline bone the copy stays
//            on the same bone at −x), blend: true | { with: '<bone>' (default parent), span: 0.05 (m), weight }
//            (2-bone skinning: weight to `bone` = smoothstep(−span, span, distance past the joint along the bone's
//            rest axis), or a constant `weight`), name }
//   One SkinnedMesh, per-vertex attributes: color (mid), toneHi, toneSh (linear, from the palette's sRGB hex),
//   skinIndex/skinWeight (rigid = one bone at weight 1). Material: look.characterMaterial(engine, spec.material).
//   castShadow/receiveShadow true, frustumCulled false. Sockets: Object3D 'socket:<name>' children of bones.
//
// API: biped(opts), uprightAnimal(opts), chibi(opts) (the cast plan), castHeight(v2px), planInfo(name), quadruped(opts), longNeck(opts), bird(opts), hopper(opts), limbless(opts),
//      face(S, opts), RIG_PLANS, planGameSpeed(S), GAME_SPEED, squashPose(S, amount, {bone, riders}), restPositions(S),
//      chain(name, {n, parent, at, dir, len, mirror, limits, dirs, curl, curlAxis, lens}), buildCharacter(engine, spec),
//      poseToQuaternions(rig, pose), tripleToQuaternion(rig, bone, triple, out?), mirrorPose(pose), extraKey(key),
//      sideOf(name), swapSide(name), parsePose(str) (test helper: 'upperArmL_fwd45,head_twist-20' → pose map),
//      PRESET_POSES (biped), PLAN_POSES ('<plan>.<pose>').
import * as THREE from 'three';
import { characterMaterial } from './look.js';

const D2R = Math.PI / 180;
const SIDE_RE = /(?<=[a-z0-9])([LR])(\d*)$/;

/** 'L' | 'R' | null from the bone name. */
export function sideOf(name) { const m = SIDE_RE.exec(name); return m ? m[1] : null; }
/** armL ↔ armR, earL1 ↔ earR1; midline names unchanged. */
export function swapSide(name) { return name.replace(SIDE_RE, (_, s, d) => (s === 'L' ? 'R' : 'L') + d); }

const DIRS = { up: [0, 1, 0], down: [0, -1, 0], fwd: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] };
function dirVec(a, side) {
  if (Array.isArray(a)) return new THREE.Vector3(...a);
  if (a?.isVector3) return a.clone();
  if (a === 'out') return new THREE.Vector3(side === 'R' ? -1 : 1, 0, 0);
  if (DIRS[a]) return new THREE.Vector3(...DIRS[a]);
  return null;
}

// ─── skeleton templates ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * A chain of n bones named `${name}0..n-1` (or `${name}L0..`/`${name}R0..` with mirror: true, where `at`/`dir` are
 * given for the L side and the R side is mirrored). at = first joint relative to the parent joint; dir = direction
 * (vector or name); len = total length.
 */
export function chain(name, { n = 3, parent, at = [0, 0, 0], dir = 'down', len = 0.4, mirror = false, limits, dirs, curl = 0, curlAxis, lens } = {}) {
  // CURVED chains (backlog: duelist overwrote axis/pos after biped()): `dirs` = per-link directions (L side), or
  // `curl` = degrees each link turns from the previous one about `curlAxis` (default: the axis that bends the chain
  // UP/back in its own plane: dir × left for vertical-ish chains, dir × up otherwise); `lens` = per-link lengths
  // (default len / n each). Link i's joint sits at the end of link i−1 along link i−1's own direction, and every
  // link's axis is its own direction, so chain dynamics keep the curve as the rest shape.
  const out = [];
  const sides = mirror ? ['L', 'R'] : [''];
  const d0 = dirVec(dir, 'L').normalize(); // authored for the L side (or midline)
  const linkDirs = [];
  if (dirs) for (let i = 0; i < n; i++) linkDirs.push(dirVec(dirs[Math.min(i, dirs.length - 1)], 'L').normalize());
  else if (curl) {
    const ax = curlAxis ? dirVec(curlAxis, 'L').normalize()
      : (Math.abs(d0.y) > 0.7 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(d0, new THREE.Vector3(0, 1, 0)).normalize());
    for (let i = 0; i < n; i++) linkDirs.push(d0.clone().applyAxisAngle(ax, curl * i * D2R));
  } else for (let i = 0; i < n; i++) linkDirs.push(d0.clone());
  const L = (i) => (lens ? lens[Math.min(i, lens.length - 1)] : len / n);
  for (const s of sides) {
    const sx = s === 'R' ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const d = linkDirs[i].clone(); if (s === 'R') d.x *= -1;
      let p;
      if (i === 0) p = [at[0] * sx, at[1], at[2]];
      else { const q = linkDirs[i - 1].clone().multiplyScalar(L(i - 1)); if (s === 'R') q.x *= -1; p = [q.x, q.y, q.z]; }
      const par = i === 0 ? (s === 'R' && sideOf(parent) ? swapSide(parent) : parent) : `${name}${s}${i - 1}`;
      out.push({ name: `${name}${s}${i}`, parent: par, pos: p, axis: [d.x, d.y, d.z], ...(limits ? { limits } : {}) });
    }
  }
  return out;
}

// meta.gait (rig's footfall name) → spec.locomotion.plan of motion's LegGait (src/chars/locomotion.js PLANS)
const LOCO_PLAN = { stride: 'biped', run: 'biped', skip: 'biped', waddle: 'bird', flutter: 'fly', hop: 'hop', glide: 'glide', trot: 'quadruped' };
function withMeta(arr, sockets, meta) {
  // meta.locomotion: the LegGait plan for this template — `locomotion: { plan: S.meta.locomotion }` in a spec
  if (meta && meta.locomotion === undefined && meta.gait) meta.locomotion = LOCO_PLAN[meta.gait] ?? null;
  Object.defineProperty(arr, 'sockets', { value: sockets, enumerable: false });
  Object.defineProperty(arr, 'meta', { value: meta, enumerable: false });
  return arr;
}

/**
 * Humanoid skeleton. All lengths scale with `height` (k = height / 1.4).
 *   height 1.4      ground → top of the head (incl. hair)
 *   heads 4         head length = height / heads (chin → top)
 *   shoulders       distance between the shoulder joints (default 0.40·k; the arm hangs centred on the joint)
 *   hips            distance between the hip (thigh) joints (default 0.17·k)
 *   legs 1, arms 1  length multipliers (legs > 1 shortens the torso; height stays)
 *   neck            neck bone length (default 0.04·k)
 *   footLen         ankle → toe length (default 0.14·k), ankle height 0.075·k
 *   chains          { name: chain opts } e.g. { cape: { n: 3, parent: 'chest', at: [0, 0.2, -0.12], len: 0.55 } }
 * Returns [{name,parent,pos,axis,limits}] + .sockets {handL, handR, back, head} + .meta (joint heights/lengths).
 */
export function biped({ height = 1.4, heads = 4, shoulders, hips, legs = 1, arms = 1, neck, footLen, chains = {} } = {}) {
  const k = height / 1.4;
  const hl = height / heads;
  shoulders ??= 0.40 * k; hips ??= 0.17 * k; neck ??= 0.04 * k; footLen ??= 0.14 * k;
  const chin = height - hl;
  const headY = chin - 0.01 * k;
  const neckY = headY - neck;
  const ankleY = 0.075 * k;
  const legLen = 0.51 * k * legs;
  const thighY = ankleY + legLen;
  const T = neckY - thighY; // torso: thigh joints → neck base
  if (T < 0.15 * k) throw new Error(`biped: legs/heads leave no torso (torso ${T.toFixed(2)} m)`);
  const shoulderY = neckY - 0.072 * T, chestY = neckY - 0.554 * T, spineY = neckY - 0.747 * T, hipsY = neckY - 0.916 * T;
  const kneeY = ankleY + 0.49 * legLen;
  const upperArm = 0.21 * k * arms, forearm = 0.19 * k * arms, hand = 0.08 * k;
  const sx = shoulders / 2, hx = hips / 2;
  const S = [
    { name: 'hips', pos: [0, hipsY, 0], axis: 'up' },
    { name: 'spine', parent: 'hips', pos: [0, spineY - hipsY, 0], axis: 'up', limits: { fwd: [-40, 60], twist: [-50, 50], out: [-35, 35] } },
    { name: 'chest', parent: 'spine', pos: [0, chestY - spineY, 0], axis: 'up', limits: { fwd: [-40, 60], twist: [-50, 50], out: [-35, 35] } },
    { name: 'neck', parent: 'chest', pos: [0, neckY - chestY, 0], axis: 'up' },
    { name: 'head', parent: 'neck', pos: [0, headY - neckY, 0], axis: 'up', limits: { fwd: [-50, 60], twist: [-80, 80], out: [-40, 40] } },
  ];
  for (const s of ['L', 'R']) {
    const x = s === 'L' ? 1 : -1;
    S.push(
      { name: `upperArm${s}`, parent: 'chest', pos: [x * sx, shoulderY - chestY, 0], axis: 'down' },
      { name: `forearm${s}`, parent: `upperArm${s}`, pos: [0, -upperArm, 0], axis: 'down', limits: { fwd: [-5, 150], twist: [-90, 90], out: [-30, 30] } },
      { name: `hand${s}`, parent: `forearm${s}`, pos: [0, -forearm, 0], axis: 'down' },
      { name: `thigh${s}`, parent: 'hips', pos: [x * hx, thighY - hipsY, 0], axis: 'down', limits: { fwd: [-60, 120], twist: [-45, 45], out: [-25, 70] } },
      { name: `shin${s}`, parent: `thigh${s}`, pos: [0, kneeY - thighY, 0], axis: 'down', limits: { fwd: [-150, 3], twist: [-20, 20], out: [-10, 10] } },
      { name: `foot${s}`, parent: `shin${s}`, pos: [0, ankleY - kneeY, 0], axis: 'fwd', limits: { fwd: [-45, 60], twist: [-30, 30], out: [-30, 30] } },
    );
  }
  for (const [name, o] of Object.entries(chains)) S.push(...chain(name, o));
  const sockets = {
    handL: { bone: 'handL', at: [0, -hand * 0.55, 0.0] },
    handR: { bone: 'handR', at: [0, -hand * 0.55, 0.0] },
    back: { bone: 'chest', at: [0, (shoulderY - chestY) * 0.75, -0.13 * k] },
    head: { bone: 'head', at: [0, hl, 0] },
  };
  const meta = { kind: 'biped', height, heads, k, hl, chin, headY, neckY, shoulderY, chestY, spineY, hipsY, thighY, kneeY, ankleY,
    upperArm, forearm, hand, thigh: thighY - kneeY, shin: kneeY - ankleY, footLen, shoulderX: sx, hipX: hx, torso: T };
  // body-plan meta (round 6; the bones above are unchanged)
  const W = restPositions(S);
  Object.assign(meta, { plan: 'biped', H: height, restY: restYs(W),
    legs: [legOf(S, W, 'L', BIPED_BONES.legL, 'legs'), legOf(S, W, 'R', BIPED_BONES.legR, 'legs')],
    gaits: { stride: { duty: 0.56, phase: { L: 0, R: 0.5 } }, run: { duty: 0.3, phase: { L: 0, R: 0.5 } } }, gait: 'stride',
    bones: { ...BIPED_BONES }, faceAt: { parent: 'head', eye: [0.068 * k, 0.015 * k + 0.127 * k, 0.135 * k], brow: 0.06 * k, mouth: [0, 0.07 * k, 0.15 * k] },
    guide: [
      '46-52 texels tall at viewHeight 10 (≈ 1.3-1.45 m), 3.8-4 heads; torso depth ≥ 0.72 × width; feet ≥ 0.22 m long',
      'arms in a slot ≠ torso; shoulder joints ≥ 0.04 m outside the chest half-width',
      'game speed: leg 0.36·H → stance span 0.33·H vs 1.2·H per cycle → duty ≈ 0.27 (run with flight) at 4 H/s',
    ] });
  meta.slots = [...bipedSlots(meta, k), { name: 'head', bone: 'head', kind: 'chamfer', size: [0.30 * k, 0.27 * k, 0.29 * k], at: [0, 0.15 * k, 0.005 * k], color: 'light' },
    ...faceSlots(hl, { eye: 0.13 })];
  return withMeta(S, sockets, meta);
}

// ─── body plans (rig owner, round 6) ────────────────────────────────────────────────────────────────────────────
//
// Every template returns the same thing: a skeleton array + non-enumerable `.sockets` + `.meta`. Beyond the biped,
// meta carries what other modules and authors need to work with the plan WITHOUT knowing its anatomy:
//   meta.plan     'biped' | 'upright' | 'quadruped' | 'bird' | 'hopper' | 'limbless' (long-neck = a quadruped or
//                 upright with meta.neckN > 1)
//   meta.H        overall height (ground → top of the head / shell / stalks): the "body height" game speed scales by
//   meta.legs     [{ id, side, group, bones: [upper, lower, end], hip: [x,y,z] rest world, ankleY, L1, L2, len, pole }]
//                 IK chains in Gait order (2-bone IK places the END joint; `pole` = poleLocal for ik.solveTwoBone:
//                 +Z knees, −Z elbows / hind hocks).
//   meta.gaits    { <name>: { duty, phase: { <leg id>: 0..1 } } } footfall patterns the plan supports.
//   meta.gait     the default gait name at game speed.
//   meta.locomotion  the matching motion LegGait plan (biped|bird|quadruped|hop|glide|fly): use it as
//                 spec.locomotion.plan (names differ from RIG_PLANS: hopper → hop, limbless → glide, moth → fly).
//   meta.bones    spec.locomotion.bones mapping (hips/spine/chest/neck/head/legL/legR/armL/armR) for the biped Gait.
//   meta.restY    { bone: rest world y } (squashPose riders, foot heights).
//   meta.faceAt   { eye: [x,y,z], mouth: [x,y,z], parent } default face anchor (head-local) for face().
//   meta.slots    blockout part slots [{ name, bone, kind, size, at, color, mirror?, to?, rot? }] — where the masses
//                 go; characters/mannequin.js planParts(S) turns them into kit boxes (the demo blockout).
//   meta.guide    proportions guidance (strings; the numbers that made earlier characters read).
// planGameSpeed(S) turns meta into the travel numbers the plan must hit at the v2 game speed (GAME_SPEED).

/** v2 Clocktower game speed, RELATIVE TO BODY SIZE (sprites ≈ 38 px tall, PLAYER_SPEED 150 px/s, walk = 4 drawings
 *  at ≈ 13 fps). A cast member of height H travels heightsPerSec·H m/s with a full cycle of `cycle` seconds. */
export const GAME_SPEED = Object.freeze({ heightsPerSec: 150 / 38, cycle: 4 / 13, drawings: 4, gridFps: 30, texel: 10 / 360 });

const G0 = 9.81;
/**
 * What a body plan must do to travel at game speed with 0 foot slide at pose frames (stride wheel, Gait reach 0.45).
 * Returns { H, speed (m/s), cycle (s), cycleLen (m per full cycle), step (m between alternate plants), legLen (m,
 * shortest leg group), span (max stance span = 2·reach·legLen), duty (largest duty factor whose stance fits the
 * span), gait ('walk' ≥ 0.5 · 'run' ≥ 0.3 · 'scurry' ≥ 0.15 · 'bound' < 0.15 · 'glide' (no legs)), flight (s per
 * airborne phase for alternating legs), bounce (m: ballistic apex for that flight, g·T²/8; 'hop' plans: one leap per
 * cycle), drawings, framesPerDrawing (30 Hz grid frames), holdGlide (m the root travels during one held drawing),
 * texels: { speed per drawing, bounce, holdGlide } at viewHeight 10 }.
 */
export function planGameSpeed(skel, { heightsPerSec = GAME_SPEED.heightsPerSec, cycle = GAME_SPEED.cycle, reach = 0.45, drawings = GAME_SPEED.drawings } = {}) {
  const m = skel?.meta ?? skel;
  const H = m.H ?? m.height;
  const speed = heightsPerSec * H, C = speed * cycle;
  const legs = m.legs || [];
  const legLen = legs.length ? Math.min(...legs.map((l) => l.len)) : 0;
  const span = 2 * reach * legLen;
  const duty = legs.length ? Math.min(0.75, span / C) : 0;
  const hop = m.gait === 'hop';
  let gait = !legs.length ? 'glide' : duty >= 0.5 ? 'walk' : duty >= 0.3 ? 'run' : duty >= 0.15 ? 'scurry' : 'bound';
  if (hop && legs.length) gait = 'hop';
  // alternating legs: two flights per cycle of (0.5 − duty)·cycle each; a hop: one flight of (1 − duty)·cycle
  const flight = !legs.length ? 0 : hop ? (1 - duty) * cycle : Math.max(0, 0.5 - duty) * cycle;
  const bounce = G0 * flight * flight / 8;
  const hold = cycle / drawings;
  const tx = GAME_SPEED.texel;
  return {
    H: +H.toFixed(3), speed: +speed.toFixed(3), cycle: +cycle.toFixed(3), cycleLen: +C.toFixed(3), step: +(C / 2).toFixed(3),
    legLen: +legLen.toFixed(3), span: +span.toFixed(3), duty: +duty.toFixed(3), gait, flight: +flight.toFixed(3),
    bounce: +bounce.toFixed(3), drawings, framesPerDrawing: +(hold * GAME_SPEED.gridFps).toFixed(2), holdGlide: +(speed * hold).toFixed(3),
    texels: { perDrawing: +(speed * hold / tx).toFixed(1), bounce: +(bounce / tx).toFixed(1), height: +(H / tx).toFixed(1) },
  };
}

/** Rest world position of every joint of a skeleton array (character space). */
export function restPositions(S) {
  const by = new Map(S.map((b) => [b.name, b]));
  const memo = {};
  const get = (n, d = 0) => {
    if (memo[n]) return memo[n];
    const b = by.get(n);
    if (!b || d > 256) throw new Error(`restPositions: bad bone '${n}'`);
    const p = b.parent ? get(b.parent, d + 1) : [0, 0, 0];
    return (memo[n] = [p[0] + b.pos[0], p[1] + b.pos[1], p[2] + b.pos[2]]);
  };
  for (const b of S) get(b.name);
  return memo;
}
const _len = (p) => Math.hypot(p[0], p[1], p[2]);
function legOf(S, W, id, bones, group, pole = [0, 0, 1]) {
  const by = new Map(S.map((b) => [b.name, b]));
  const L1 = _len(by.get(bones[1]).pos), L2 = _len(by.get(bones[2]).pos);
  return { id, side: sideOf(bones[0]), group, bones, hip: W[bones[0]], ankleY: W[bones[2]][1], L1, L2, len: L1 + L2, pole };
}
function restYs(W) { const o = {}; for (const [n, p] of Object.entries(W)) o[n] = p[1]; return o; }
const BIPED_BONES = { legL: ['thighL', 'shinL', 'footL'], legR: ['thighR', 'shinR', 'footR'], armL: ['upperArmL', 'forearmL'],
  armR: ['upperArmR', 'forearmR'], hips: 'hips', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head' };

/**
 * Face bones for any template (head-local anchors; sided names so parts can `mirror`):
 *   eyeL/eyeR (axis fwd)  — part = the eye; BLINK / squint / wide by scale: pose `'eyeL.s': [0, -0.75, 0]`
 *                           (a 2-texel eye becomes a 1-texel line); look by rotation (fwd + = down, out + = outward)
 *   browL/browR (axis out) — a small brow block at the INNER end: out + = outer end UP (angry), − = sad
 *   mouth (axis fwd)       — mouth part; open / smile swaps by scale (`'mouth.s': [0, 1, 0]` doubles its height),
 *                           hide = [−1, −1, −1]
 * Opts: { parent='head', eye: [x,y,z] (L eye joint), brow: dy above the eye | false, mouth: [x,y,z] | false }.
 * Defaults come from skeleton.meta.faceAt. Brows/mouth are hidden unless parts are put on them. Look sides bones by
 * name, so give the face parts `material.sides { eyeL: 'mid', eyeR: 'mid', browL: 'mid', browR: 'mid' }` (an eye in
 * the far-forced shadow tone reads as a socket).
 */
export function face(S, opts = {}) {
  const fa = S.meta?.faceAt || {};
  const parent = opts.parent ?? fa.parent ?? 'head';
  const eye = opts.eye ?? fa.eye ?? [0.07, 0.12, 0.14];
  const brow = opts.brow ?? fa.brow ?? 0.07;
  const mouth = opts.mouth ?? fa.mouth ?? [0, 0.04, 0.15];
  const out = [...S];
  for (const s of ['L', 'R']) {
    const x = s === 'L' ? 1 : -1;
    out.push({ name: `eye${s}`, parent, pos: [x * eye[0], eye[1], eye[2]], axis: 'fwd', limits: { fwd: [-30, 30], twist: [-30, 30], out: [-30, 30] } });
    if (brow !== false) out.push({ name: `brow${s}`, parent, pos: [x * Math.max(0.01, eye[0] - 0.035), eye[1] + brow, eye[2] + 0.005], axis: 'out', limits: { out: [-35, 35] } });
  }
  if (mouth !== false) out.push({ name: 'mouth', parent: opts.mouthParent ?? fa.mouthParent ?? parent, pos: mouth, axis: 'fwd' });
  return withMeta(out, { ...(S.sockets || {}) }, { ...(S.meta || {}), face: { parent, eye, brow, mouth } });
}

/**
 * Upright animal: a biped (same bone names → the biped Gait, look, smears work unchanged) with a snout, a jaw
 * (talk), ears and a tail. Chibi defaults (3.2 heads, legs 0.9). Covers fox / goat / red panda / otter / mole /
 * cow / shark-in-a-beret (tail = fin, ears: false) / skeleton.
 *   height 1.1, heads 3.2, legs 0.9, arms 0.9, snout 0.45 (× head length, 0 = flat face), jaw true,
 *   ears {n, len, dir, at} | false (default: 1-link, 0.45·head long, up and out), tail {n, len, dir, at} | false
 *   (default 3 links, 0.45·height, back and down from the hips), neckN 1 / neckExtra 0 (long neck: extra metres of
 *   neck in neckN − 1 extra links neck1…; the head stays at the top), face true (eye/brow/mouth bones).
 * Sockets: biped's + snout (tip), mouth, tailTip, hat (top of the head, between the ears).
 */
export function uprightAnimal({ height = 1.1, heads = 3.2, legs = 0.9, arms = 0.9, snout = 0.45, jaw = true, ears = {},
  tail = {}, neckN = 1, neckExtra = 0, face: faceOpts = {}, shoulders, hips, footLen, neck, chains = {} } = {}) {
  // (module fix, rig row) `neck` (neck bone length, m) is passed through to biped() (default unchanged: 0.04·k), so a big
  // chibi head can sit above the shoulders instead of on them. `jaw: { back: true }` hinges the jaw at the BACK of the
  // mouth (z −0.10·head) for a wide frog/toad mouth; `jaw: true` (default) keeps the front hinge.
  const B = biped({ height: height - neckExtra, heads: (height - neckExtra) / (height / heads), legs, arms, shoulders, hips, footLen, neck, chains });
  const jawBack = !!(jaw && typeof jaw === 'object' && jaw.back);
  const m = { ...B.meta };
  const hl = m.hl, k = m.k;
  const S = B.map((b) => ({ ...b }));
  // long neck: insert neck1… between neck and head; the head (and everything on it) rises by neckExtra
  if (neckN > 1 && neckExtra > 0) {
    const head = S.find((b) => b.name === 'head');
    const seg = neckExtra / (neckN - 1);
    let par = 'neck';
    for (let i = 1; i < neckN; i++) {
      S.push({ name: `neck${i}`, parent: par, pos: i === 1 ? [...head.pos] : [0, seg, 0], axis: 'up', limits: { fwd: [-40, 60], twist: [-40, 40], out: [-30, 30] } });
      par = `neck${i}`;
    }
    head.parent = par; head.pos = [0, seg, 0];
    for (const key of ['height', 'chin', 'headY']) m[key] += neckExtra;
  }
  const snoutLen = snout * hl;
  const jawZ = jawBack ? -0.10 * hl : 0.30 * hl;              // hinge: front (default) or back of the mouth
  if (jaw) S.push({ name: 'jaw', parent: 'head', pos: [0, 0.22 * hl, jawZ], axis: 'fwd', limits: { fwd: [-5, 40], twist: [-10, 10], out: [-10, 10] } });
  if (ears) S.push(...chain('ear', { n: 1, parent: 'head', at: [0.27 * hl, 0.9 * hl, -0.05 * hl], dir: [0.35, 1, -0.12], len: 0.45 * hl, mirror: true, ...ears }));
  if (tail) S.push(...chain('tail', { n: 3, parent: 'hips', at: [0, -0.02 * k, -0.13 * k], dir: [0, -0.5, -1], curl: 32, len: 0.4 * height, ...tail }));
  const tailN = tail ? (tail.n ?? 3) : 0;
  const W0 = restPositions(S);
  const H = height;
  const meta = { ...m, plan: 'upright', H, height: m.height, snout: snoutLen, neckN, neckExtra, restY: restYs(W0),
    legs: [legOf(S, W0, 'L', BIPED_BONES.legL, 'legs'), legOf(S, W0, 'R', BIPED_BONES.legR, 'legs')],
    // skip = the chibi game-speed gait (CAST_PORTING §8: leg ≤ 0.3 H must bounce to cover 1.2 H per 0.31 s cycle)
    gaits: { stride: { duty: 0.56, phase: { L: 0, R: 0.5 } }, run: { duty: 0.3, phase: { L: 0, R: 0.5 } },
      skip: { duty: 0.18, phase: { L: 0, R: 0.5 } } }, gait: 'stride',
    bones: { ...BIPED_BONES, head: 'head', neck: neckN > 1 ? `neck${neckN - 1}` : 'neck' },
    faceAt: { parent: 'head', eye: [0.24 * hl, 0.5 * hl, 0.40 * hl], brow: 0.2 * hl, mouth: [0, 0.2 * hl, 0.42 * hl + snoutLen * 0.9], mouthParent: jaw ? 'head' : 'head' },
    guide: [
      'head 0.30-0.36 of H (chibi); snout ≥ 0.20 m on companions (hound r2: 0.16 m read as a lamb), slight drop',
      'ears are the species read from S/N: ≥ 3 texels wide at the base, leaning out ≥ 15°; tail ≥ 0.3·H breaks the back silhouette',
      'arms/forearms in a slot ≠ torso (hue or ≥ 15 % value); torso depth ≥ 0.72 × width',
      'game speed: legs 0.9 → stance span ≈ 0.3·H → scurry (duty ≈ 0.2): bounce ≥ 1 texel, key ears/tail per drawing pair',
    ] };
  const sockets = { ...B.sockets, snout: { bone: 'head', at: [0, 0.35 * hl, 0.45 * hl + snoutLen] }, mouth: { bone: jaw ? 'jaw' : 'head', at: [0, 0, 0.12 * hl + snoutLen * 0.8 + (jawBack ? 0.4 * hl : 0)] },
    hat: { bone: 'head', at: [0, hl * 0.98, -0.02 * hl] }, ...(tail ? { tailTip: { bone: `tail${tailN - 1}`, at: [0, 0, 0] } } : {}) };
  const sw = 0.30 * hl * 1.0;
  meta.slots = [
    ...bipedSlots(m, k),
    { name: 'head', bone: 'head', kind: 'chamfer', size: [0.86 * hl, 0.82 * hl, 0.8 * hl], at: [0, 0.45 * hl, 0.02 * hl], color: 'main' },
    ...(snoutLen > 0 ? [{ name: 'snout', bone: 'head', kind: 'chamfer', size: [0.42 * hl, 0.34 * hl, snoutLen + 0.1 * hl], at: [0, 0.3 * hl, 0.4 * hl + snoutLen / 2], color: 'light' },
      { name: 'nose', bone: 'head', kind: 'box', size: [0.2 * hl, 0.14 * hl, 0.1 * hl], at: [0, 0.42 * hl, 0.42 * hl + snoutLen + 0.04 * hl], color: 'dark' }] : []),
    ...(jaw ? [{ name: 'jaw', bone: 'jaw', kind: 'box', size: [0.34 * hl, 0.12 * hl, Math.max(0.3 * hl, snoutLen * 0.9)], at: [0, -0.04 * hl, Math.max(0.15 * hl, snoutLen * 0.45) + (jawBack ? 0.4 * hl : 0)], color: 'dark' }] : []),
    ...(ears ? [{ name: 'ear', bone: 'earL0', kind: 'leaf', size: [sw, (ears.len ?? 0.45 * hl), 0.07 * hl], to: 'tip', color: 'second', mirror: true }] : []),
    ...(tail ? Array.from({ length: tailN }, (_, i) => ({ name: `tail${i}`, bone: `tail${i}`, kind: 'seg', size: [0.16 * k * (1 - 0.2 * i), 0.16 * k * (1 - 0.2 * i)], to: i + 1 < tailN ? `tail${i + 1}` : 'tip', color: i === tailN - 1 ? 'light' : 'second' })) : []),
    ...(neckN > 1 ? Array.from({ length: neckN - 1 }, (_, i) => ({ name: `neck${i + 1}`, bone: `neck${i + 1}`, kind: 'seg', size: [0.13 * k, 0.13 * k], to: i + 2 < neckN ? `neck${i + 2}` : 'head', color: 'main' })) : []),
    ...faceSlots(hl),
  ];
  if (meta.legs[0].len / H < 0.3) meta.gait = 'skip';
  let out = withMeta(S, sockets, meta);
  if (faceOpts !== false) out = face(out, faceOpts || {});
  return out;
}

/**
 * Upright CHIBI (rig r6, from refs/cast): the plan of ~24 of the 32 Clocktower cast members — clothed animals and small
 * people drawn upright in v2 with heads 40–55 % of the height and 3–6 px legs. = uprightAnimal at heads 2.5, legs 0.7
 * (leg ≈ 0.25 H, so the game-speed gait is the 'skip', duty ≈ 0.18), height from the v2 sprite (castHeight(px)).
 *   chibi({ px: 30 })  → H 1.2 (frog);  chibi({ height, heads 2.2–2.8, legs 0.6–0.8, snout 0 (flat face: frog, owl,
 *   mushroom, people), ears false, tail false, … any uprightAnimal opts })
 */
export function chibi({ px, height, heads = 2.5, legs = 0.7, arms = 0.85, snout = 0.3, ...o } = {}) {
  height ??= px ? castHeight(px) : 1.2;
  return withPlan(uprightAnimal({ height, heads, legs, arms, snout, ...o }), 'chibi');
}

/** v2 sprite height (px at the SE facing, refs/cast/_lineup.png) → pixel3d body height H (m): 0.04 m/px, ≥ 1.05 m
 *  (CAST_PORTING §4). Keeps the cast's relative sizes; mascots may add 10 % on top. */
export function castHeight(px) { return Math.max(1.05, +(0.04 * px).toFixed(3)); }

// biped body slots (mannequin-like masses from biped meta) — shared by biped / upright
function bipedSlots(m, k) {
  const chestH = m.shoulderY - m.chestY + 0.04 * k;
  return [
    { name: 'neck', bone: 'neck', kind: 'box', size: [0.11 * k, 0.08 * k, 0.10 * k], at: [0, 0.02 * k, 0], color: 'main' },
    { name: 'chest', bone: 'chest', kind: 'chamfer', size: [0.32 * k, chestH, 0.24 * k], at: [0, chestH / 2 - 0.01 * k, 0], color: 'second' },
    { name: 'waist', bone: 'spine', kind: 'chamfer', size: [0.28 * k, (m.chestY - m.spineY) + 0.02 * k, 0.22 * k], at: [0, (m.chestY - m.spineY) / 2, 0], color: 'second' },
    { name: 'pelvis', bone: 'hips', kind: 'chamfer', size: [0.29 * k, 0.12 * k, 0.22 * k], at: [0, m.spineY - m.hipsY - 0.04 * k, 0], color: 'dark' },
    { name: 'upperArm', bone: 'upperArmL', kind: 'seg', size: [0.085 * k, 0.085 * k], to: 'forearmL', color: 'main', mirror: true },
    { name: 'forearm', bone: 'forearmL', kind: 'seg', size: [0.08 * k, 0.08 * k], to: 'handL', color: 'main', mirror: true },
    { name: 'hand', bone: 'handL', kind: 'box', size: [0.09 * k, 0.09 * k, 0.095 * k], at: [0, -0.035 * k, 0.005 * k], color: 'main', mirror: true },
    { name: 'thigh', bone: 'thighL', kind: 'seg', size: [0.12 * k, 0.125 * k], to: 'shinL', color: 'dark', mirror: true },
    { name: 'shin', bone: 'shinL', kind: 'seg', size: [0.11 * k, 0.115 * k], to: 'footL', color: 'dark', mirror: true },
    { name: 'foot', bone: 'footL', kind: 'box', size: [0.115 * k, m.ankleY, m.footLen + 0.06 * k], at: [0, -m.ankleY / 2, m.footLen / 2 - 0.02 * k], color: 'dark', mirror: true },
  ];
}
function faceSlots(hl, { eye = 0.13, brow = true, mouth = true } = {}) {
  return [
    { name: 'eye', bone: 'eyeL', kind: 'box', size: [eye * hl, Math.max(0.065, 0.2 * hl), 0.05 * hl], at: [0, 0, 0], color: 'eye', mirror: true },
    ...(brow ? [{ name: 'brow', bone: 'browL', kind: 'box', size: [0.2 * hl, 0.06, 0.05 * hl], at: [0.07 * hl, 0, 0], color: 'eye', mirror: true, optional: true }] : []),
    ...(mouth ? [{ name: 'mouth', bone: 'mouth', kind: 'box', size: [0.2 * hl, 0.06, 0.04 * hl], at: [0, 0, 0], color: 'eye', optional: true }] : []),
  ];
}

/**
 * Four-legged skeleton, facing +Z (dog / fox on all fours / goat / cow / hedgehog / giraffe with longNeck()).
 * The ROOT `body` sits mid-torso (z 0), so the character root (feet centre) is under the middle of the body and a
 * yaw turns about the middle; `rump` and `chest` hang back / forward from it (spine flex: rump fwd + drops the rear,
 * chest fwd + dips the front).
 *   height 0.8 ground → withers (top of the shoulders)      length 0.9·k hip joint → shoulder joint along z
 *   legs 1 (leg = 0.6·height·legs)   width 0.26·k (left ↔ right legs)   neck 0.28·k, neckN 1 (long neck: n links
 *   neck, neck1, …), neckDir [0, 0.8, 0.6]   head 0.3·k (skull + snout length)   jaw true
 *   tail {n:2, len:0.4·k, dir, at} | false   ears {n:1, len:0.12·k, dir, at} | false   face true
 * Names: body, rump, chest, neck(…), head, jaw, thighL/R → shinL/R → footL/R (HIND: knee forward, hock back, paw),
 * upperArmL/R → forearmL/R → handL/R (FORE: elbow back, paw), tail0.., earL0../earR0.., + face bones.
 * Sockets: head (top), mouth, snout, back (saddle), chest, tailTip, hat.
 */
export function quadruped({ height = 0.8, length, legs = 1, neck, neckN = 1, neckDir = [0, 0.8, 0.6], head, tail = {}, ears = {},
  width, jaw = true, face: faceOpts = {}, chains = {} } = {}) {
  const k = height / 0.8;
  length ??= 0.75 * k; neck ??= 0.28 * k; head ??= 0.3 * k; width ??= 0.26 * k;
  const leg = 0.6 * height * legs;
  const ankleY = 0.05 * k;
  const shoY = ankleY + leg;                 // shoulder / hip joint height
  const bodyY = shoY + 0.04 * k;             // spine line
  const wx = width / 2;
  const nd = (() => { const l = Math.hypot(...neckDir); return neckDir.map((v) => v / l); })();
  const S = [
    { name: 'body', pos: [0, bodyY, 0], axis: 'fwd', limits: { fwd: [-40, 40], twist: [-30, 30], out: [-30, 30] } },
    // lumbar / thoracic pivots near the middle; hip and shoulder sockets 0.38·length further out (a sit rotates the
    // pelvis about the lumbar pivot, a rear-up the chest about the thoracic one)
    { name: 'rump', parent: 'body', pos: [0, 0, -0.12 * length], axis: 'back', limits: { fwd: [-30, 60], twist: [-25, 25], out: [-25, 25] } },
    { name: 'chest', parent: 'body', pos: [0, 0.01 * k, 0.12 * length], axis: 'fwd', limits: { fwd: [-50, 35], twist: [-25, 25], out: [-25, 25] } },
  ];
  // neck chain from the withers, head on its tip
  const seg = neck / neckN;
  let par = 'chest';
  for (let i = 0; i < neckN; i++) {
    const nm = i === 0 ? 'neck' : `neck${i}`;
    S.push({ name: nm, parent: par, pos: i === 0 ? [0, 0.06 * k, 0.38 * length + 0.03 * k] : [nd[0] * seg, nd[1] * seg, nd[2] * seg], axis: 'up',
      limits: { fwd: [-50, 80], twist: [-50, 50], out: [-40, 40] } });
    par = nm;
  }
  S.push({ name: 'head', parent: par, pos: [nd[0] * seg, nd[1] * seg, nd[2] * seg], axis: 'fwd', limits: { fwd: [-35, 60], twist: [-40, 40], out: [-50, 50] } });
  if (jaw) S.push({ name: 'jaw', parent: 'head', pos: [0, -0.05 * k, 0.07 * k], axis: 'fwd', limits: { fwd: [-5, 40] } });
  const hipDrop = 0.04 * k;
  const hindUp = (shoY - ankleY) * 0.5, hindLo = (shoY - ankleY) * 0.5;
  for (const s of ['L', 'R']) {
    const x = s === 'L' ? 1 : -1;
    S.push(
      // hind: hip → knee (forward) → hock/ankle (back) → paw
      { name: `thigh${s}`, parent: 'rump', pos: [x * wx, -hipDrop, -0.38 * length], axis: 'down', limits: { fwd: [-70, 90], twist: [-20, 20], out: [-20, 40] } },
      { name: `shin${s}`, parent: `thigh${s}`, pos: [0, -hindUp, 0.18 * hindUp], axis: 'down', limits: { fwd: [-130, 10] } },
      { name: `foot${s}`, parent: `shin${s}`, pos: [0, -hindLo, -0.22 * hindLo], axis: 'fwd', limits: { fwd: [-60, 80] } },
      // fore: shoulder → elbow (back) → wrist (forward, under the shoulder) → paw
      { name: `upperArm${s}`, parent: 'chest', pos: [x * wx, -hipDrop - 0.01 * k, 0.38 * length], axis: 'down', limits: { fwd: [-70, 130], twist: [-20, 20], out: [-20, 60] } },
      { name: `forearm${s}`, parent: `upperArm${s}`, pos: [0, -hindUp, -0.15 * hindUp], axis: 'down', limits: { fwd: [-10, 130] } },
      { name: `hand${s}`, parent: `forearm${s}`, pos: [0, -hindLo, 0.15 * hindLo], axis: 'fwd', limits: { fwd: [-60, 90] } },
    );
  }
  if (tail) S.push(...chain('tail', { n: 2, parent: 'rump', at: [0, 0.05 * k, -0.38 * length - 0.09 * k], dir: [0, 0.5, -1], curl: 15, len: 0.36 * k, ...tail }));
  if (ears) S.push(...chain('ear', { n: 1, parent: 'head', at: [0.065 * k, 0.09 * k, -0.03 * k], dir: [0.45, 1, -0.2], len: 0.12 * k, mirror: true, ...ears }));
  for (const [name, o] of Object.entries(chains)) S.push(...chain(name, o));
  const W = restPositions(S);
  const headTop = W.head[1] + 0.13 * k;
  const tailN = tail ? (tail.n ?? 2) : 0;
  const lastNeck = neckN > 1 ? `neck${neckN - 1}` : 'neck';
  const sockets = {
    head: { bone: 'head', at: [0, 0.12 * k, 0.02 * k] }, hat: { bone: 'head', at: [0, 0.12 * k, -0.01 * k] },
    mouth: { bone: jaw ? 'jaw' : 'head', at: [0, -0.01 * k, head * 0.7] }, snout: { bone: 'head', at: [0, 0.0, head] },
    back: { bone: 'body', at: [0, 0.12 * k, 0] }, chest: { bone: 'chest', at: [0, -0.02 * k, 0.38 * length + 0.1 * k] },
    ...(tail ? { tailTip: { bone: `tail${tailN - 1}`, at: [0, 0, 0] } } : {}),
  };
  const legs4 = [
    legOf(S, W, 'hindL', ['thighL', 'shinL', 'footL'], 'hind', [0, 0, 1]), legOf(S, W, 'hindR', ['thighR', 'shinR', 'footR'], 'hind', [0, 0, 1]),
    legOf(S, W, 'foreL', ['upperArmL', 'forearmL', 'handL'], 'fore', [0, 0, -1]), legOf(S, W, 'foreR', ['upperArmR', 'forearmR', 'handR'], 'fore', [0, 0, -1]),
  ];
  const bodyW = width + 0.1 * k, bodyH = 0.26 * k;
  const meta = { kind: 'quadruped', plan: 'quadruped', height, H: headTop, length, k, leg, bodyY, shoY, ankleY, neck, neckN, head, width,
    legs: legs4, restY: restYs(W), gait: 'trot',
    gaits: {
      walk: { duty: 0.62, phase: { hindL: 0, foreL: 0.25, hindR: 0.5, foreR: 0.75 } },
      trot: { duty: 0.45, phase: { hindL: 0, foreR: 0, hindR: 0.5, foreL: 0.5 } },
      gallop: { duty: 0.3, phase: { hindL: 0, hindR: 0.1, foreL: 0.5, foreR: 0.6 } },
    },
    bones: { legL: ['thighL', 'shinL', 'footL'], legR: ['thighR', 'shinR', 'footR'], armL: ['upperArmL', 'forearmL'], armR: ['upperArmR', 'forearmR'],
      hips: 'body', spine: 'rump', chest: 'chest', neck: lastNeck, head: 'head' },
    faceAt: { parent: 'head', eye: [0.075 * k, 0.05 * k, 0.11 * k], brow: 0.045 * k, mouth: [0, -0.03 * k, head * 0.85] },
    guide: [
      'species read lives in the PROFILE head: snout ≥ 0.20 m (or ≥ 0.6 × skull), ears tilted out; check S/N thumbnails (front = a block)',
      'paws centred under the hock in stance (hound r1: J-hook/hoof); lower legs ≥ 3 texels wide, a darker slot than the body',
      'head world pitch within ±35° in held keys (nose-down shows the skull top at dir 0, nose-up a throat box)',
      'game speed: leg 0.6·height vs cycle 1.2·H → trot/gallop with flight; bob ≥ 1 texel; 4-leg phases in meta.gaits',
    ],
    slots: [
      { name: 'rump', bone: 'rump', kind: 'chamfer', size: [bodyW * 0.92, bodyH * 0.95, length * 0.5 + 0.06 * k], at: [0, -0.01 * k, -0.3 * length], color: 'main' },
      { name: 'chest', bone: 'chest', kind: 'chamfer', size: [bodyW, bodyH * 1.05, length * 0.5 + 0.08 * k], at: [0, -0.005 * k, 0.3 * length], color: 'main' },
      { name: 'back', bone: 'body', kind: 'box', size: [bodyW * 0.88, bodyH * 0.85, length * 0.4], at: [0, 0.0, 0], color: 'main' },
      ...Array.from({ length: neckN }, (_, i) => ({ name: `neck${i}`, bone: i === 0 ? 'neck' : `neck${i}`, kind: 'seg', size: [0.15 * k, 0.15 * k], to: i + 1 < neckN ? `neck${i + 1}` : 'head', color: 'main', extend: 0.04 * k })),
      { name: 'skull', bone: 'head', kind: 'chamfer', size: [0.27 * k, 0.23 * k, 0.24 * k], at: [0, 0.03 * k, 0.03 * k], color: 'main' },
      { name: 'snout', bone: 'head', kind: 'chamfer', size: [0.14 * k, 0.11 * k, head * 0.55], at: [0, -0.01 * k, 0.11 * k + head * 0.27], color: 'light' },
      { name: 'nose', bone: 'head', kind: 'box', size: [0.07 * k, 0.05 * k, 0.04 * k], at: [0, 0.03 * k, 0.12 * k + head * 0.55], color: 'dark' },
      ...(jaw ? [{ name: 'jaw', bone: 'jaw', kind: 'box', size: [0.1 * k, 0.045 * k, head * 0.5], at: [0, -0.02 * k, head * 0.3], color: 'dark' }] : []),
      ...(ears ? [{ name: 'ear', bone: 'earL0', kind: 'leaf', size: [0.08 * k, ears.len ?? 0.12 * k, 0.03 * k], to: 'tip', color: 'second', mirror: true }] : []),
      ...(tail ? Array.from({ length: tailN }, (_, i) => ({ name: `tail${i}`, bone: `tail${i}`, kind: 'seg', size: [0.08 * k * (1 - 0.2 * i), 0.08 * k * (1 - 0.2 * i)], to: i + 1 < tailN ? `tail${i + 1}` : 'tip', color: i === tailN - 1 ? 'light' : 'second' })) : []),
      { name: 'thigh', bone: 'thighL', kind: 'seg', size: [0.11 * k, 0.15 * k], to: 'shinL', color: 'main', mirror: true, extend: 0.03 * k },
      { name: 'shin', bone: 'shinL', kind: 'seg', size: [0.075 * k, 0.085 * k], to: 'footL', color: 'dark', mirror: true },
      { name: 'paw', bone: 'footL', kind: 'box', size: [0.085 * k, 0.05 * k, 0.11 * k], at: [0, -0.025 * k, 0.03 * k], color: 'dark', mirror: true },
      { name: 'upperArm', bone: 'upperArmL', kind: 'seg', size: [0.1 * k, 0.12 * k], to: 'forearmL', color: 'main', mirror: true, extend: 0.03 * k },
      { name: 'forearm', bone: 'forearmL', kind: 'seg', size: [0.075 * k, 0.08 * k], to: 'handL', color: 'dark', mirror: true },
      { name: 'forepaw', bone: 'handL', kind: 'box', size: [0.085 * k, 0.05 * k, 0.11 * k], at: [0, -0.025 * k, 0.03 * k], color: 'dark', mirror: true },
      ...faceSlots(0.3 * k, { eye: 0.24, brow: false, mouth: false }),
    ] };
  let out = withMeta(S, sockets, meta);
  if (faceOpts !== false) out = face(out, { brow: false, mouth: false, ...(faceOpts || {}) });
  return out;
}

/**
 * Long neck: a quadruped (giraffe, llama) or an upright animal (giraffe in a waistcoat) whose neck is a chain of
 * neckN links that look / graze / bob as one curve (spread neck pitch over the links: 0.25/0.35/0.4 of the total).
 *   longNeck({ base: 'quadruped' | 'upright', neckN: 3, neck (m, quadruped) | neckExtra (m, upright), ...base opts })
 */
export function longNeck({ base = 'quadruped', neckN = 3, ...o } = {}) {
  if (base === 'upright') {
    const h = o.height ?? 1.5;
    return withPlan(uprightAnimal({ height: h, heads: 4.6, neckN, neckExtra: o.neckExtra ?? 0.32 * h, ...o }), 'longneck-upright');
  }
  const k = (o.height ?? 0.9) / 0.8;
  return withPlan(quadruped({ height: 0.9, legs: 1.25, neckN, neck: 0.95 * k, neckDir: [0, 0.94, 0.34], ...o }), 'longneck');
}
function withPlan(S, variant) { return withMeta([...S], S.sockets, { ...S.meta, variant }); }

/**
 * Bird: egg body on short legs, wings as arm-like PADDLES (bone names upperArm/forearm/hand, so the biped Gait's
 * arm swing flaps them and smears / props on handR work), a neck chain, a beak (jaw = lower beak), a tail fan and an
 * optional crest. Covers goose / duck (neckLen long, heads 3), owl (neckLen ~0, heads 2.2), crow, parrot, and with
 * hover > 0 + insectWings a moth.
 *   height 0.8 (top of the head), heads 2.6, legs 1 (hip → ankle = 0.2·height·legs), neckN 1, neckLen 0.05·k,
 *   neckDir [0, 1, 0.25], wingLen 0.34·k, width 0.34·k (body), beak 0.35 (× head length), tail {n, len, dir} | false,
 *   crest {n, len, dir} | false, hover 0 (m: body floats, legs dangle — gait 'flutter'), insectWings false (adds
 *   wingL0/R0 + wingL1/R1 on the back, axis 'out': out + = UP = flap), antennae false (chain on the head).
 * Wing convention (= arm): rest hangs down-back at the side (folded); upperArm out 85 = spread level, out 150-165
 * = raised (vote), fwd = swing forward/back, twist = turn the feather plane; forearm out bends the wing tip.
 * Sockets: head, beak (tip), wingTipL/R, back, tail, hat.
 */
export function bird({ height = 0.8, heads = 2.6, legs = 1, neckN = 1, neckLen, neckDir = [0, 1, 0.25], wingLen, width,
  beak = 0.35, tail = {}, crest = false, hover = 0, insectWings = false, antennae = false, face: faceOpts = {}, chains = {} } = {}) {
  const k = height / 0.8;
  const hl = height / heads;
  neckLen ??= 0.05 * k; wingLen ??= 0.34 * k; width ??= 0.34 * k;
  const ankleY = 0.03 * k + hover;
  const leg = 0.2 * height * legs;
  const hipY = ankleY + leg;
  const headY = height + hover - hl;
  const nd = (() => { const l = Math.hypot(...neckDir); return neckDir.map((v) => v / l); })();
  const neckBase = headY - neckLen * nd[1];
  const T = neckBase - hipY;                 // torso span hips → neck base
  if (T < 0.12 * k) throw new Error(`bird: legs/neck/heads leave no body (torso ${T.toFixed(2)} m)`);
  const bodyY = hipY + 0.03 * k, chestY = hipY + 0.5 * T;
  const neckZ = 0.04 * k - neckLen * nd[2];
  const S = [
    { name: 'body', pos: [0, bodyY, 0], axis: 'up', limits: { fwd: [-30, 80], twist: [-40, 40], out: [-30, 30] } },
    { name: 'chest', parent: 'body', pos: [0, chestY - bodyY, 0.01 * k], axis: 'up', limits: { fwd: [-30, 50], twist: [-40, 40], out: [-25, 25] } },
  ];
  const seg = neckLen / neckN;
  let par = 'chest';
  for (let i = 0; i < neckN; i++) {
    const nm = i === 0 ? 'neck' : `neck${i}`;
    S.push({ name: nm, parent: par, pos: i === 0 ? [0, neckBase - chestY, neckZ - 0.01 * k] : [nd[0] * seg, nd[1] * seg, nd[2] * seg], axis: 'up',
      limits: { fwd: [-60, 90], twist: [-80, 80], out: [-45, 45] } });
    par = nm;
  }
  S.push({ name: 'head', parent: par, pos: [nd[0] * seg, nd[1] * seg, nd[2] * seg], axis: 'up', limits: { fwd: [-50, 60], twist: [-170, 170], out: [-40, 40] } });
  const beakLen = beak * hl;
  S.push({ name: 'jaw', parent: 'head', pos: [0, 0.32 * hl, 0.38 * hl], axis: 'fwd', limits: { fwd: [-5, 45] } });
  const shoY = neckBase - chestY - 0.05 * k, shoX = width * 0.5 - 0.005 * k;
  const l1 = wingLen * 0.55, l2 = wingLen * 0.35, back = Math.sin(18 * D2R);
  for (const s of ['L', 'R']) {
    const x = s === 'L' ? 1 : -1;
    S.push(
      { name: `upperArm${s}`, parent: 'chest', pos: [x * shoX, shoY, -0.02 * k], axis: 'down' },
      { name: `forearm${s}`, parent: `upperArm${s}`, pos: [0, -l1 * Math.cos(18 * D2R), -l1 * back], axis: 'down', limits: { fwd: [-40, 60], twist: [-60, 60], out: [-60, 60] } },
      { name: `hand${s}`, parent: `forearm${s}`, pos: [0, -l2 * Math.cos(18 * D2R), -l2 * back], axis: 'down' },
      { name: `thigh${s}`, parent: 'body', pos: [x * 0.07 * k, hipY - bodyY, 0], axis: 'down', limits: { fwd: [-60, 100], twist: [-30, 30], out: [-20, 50] } },
      { name: `shin${s}`, parent: `thigh${s}`, pos: [0, -leg * 0.5, 0.015 * k], axis: 'down', limits: { fwd: [-140, 5] } },
      { name: `foot${s}`, parent: `shin${s}`, pos: [0, -leg * 0.5, -0.015 * k], axis: 'fwd', limits: { fwd: [-50, 70] } },
    );
    if (insectWings) {
      S.push({ name: `wing${s}0`, parent: 'chest', pos: [x * 0.04 * k, shoY + 0.02 * k, -width * 0.4], axis: 'out' },
        { name: `wing${s}1`, parent: 'chest', pos: [x * 0.04 * k, shoY - 0.06 * k, -width * 0.4], axis: 'out' });
    }
  }
  if (tail) S.push(...chain('tail', { n: 1, parent: 'body', at: [0, 0.03 * k, -width * 0.42], dir: [0, 0.25, -1], len: 0.16 * k, ...tail }));
  if (crest) S.push(...chain('crest', { n: 2, parent: 'head', at: [0, 0.95 * hl, -0.05 * hl], dir: [0, 1, -0.4], len: 0.4 * hl, ...(crest === true ? {} : crest) }));
  if (antennae) S.push(...chain('antenna', { n: 2, parent: 'head', at: [0.15 * hl, 0.9 * hl, 0.1 * hl], dir: [0.5, 1, 0.3], len: 0.5 * hl, mirror: true, ...(antennae === true ? {} : antennae) }));
  for (const [name, o] of Object.entries(chains)) S.push(...chain(name, o));
  const W = restPositions(S);
  const sockets = {
    head: { bone: 'head', at: [0, hl, 0] }, hat: { bone: 'head', at: [0, hl * 0.97, -0.03 * hl] },
    beak: { bone: 'head', at: [0, 0.38 * hl, 0.45 * hl + beakLen] }, mouth: { bone: 'head', at: [0, 0.3 * hl, 0.45 * hl + 0.6 * beakLen] }, back: { bone: 'chest', at: [0, 0.02 * k, -width * 0.45] },
    wingTipL: { bone: 'handL', at: [0, -0.06 * k, -0.02 * k] }, wingTipR: { bone: 'handR', at: [0, -0.06 * k, -0.02 * k] },
    ...(tail ? { tail: { bone: `tail${(tail.n ?? 1) - 1}`, at: [0, 0, 0] } } : {}),
  };
  const bodyH = T + 0.1 * k;
  const meta = { kind: 'bird', plan: 'bird', height, H: height + hover, heads, k, hl, leg, hipY, ankleY, bodyY, chestY, neckBase, headY, neckN, neckLen,
    wingLen, width, beak: beakLen, hover, footLen: 0.12 * k,
    legs: hover > 0 ? [] : [legOf(S, W, 'L', BIPED_BONES.legL, 'legs'), legOf(S, W, 'R', BIPED_BONES.legR, 'legs')],
    restY: restYs(W), gait: hover > 0 ? 'flutter' : 'waddle',
    gaits: { waddle: { duty: 0.5, phase: { L: 0, R: 0.5 } }, hop: { duty: 0.35, phase: { L: 0, R: 0 } } },
    bones: { ...BIPED_BONES, hips: 'body', spine: 'body', chest: 'chest', neck: neckN > 1 ? `neck${neckN - 1}` : 'neck', head: 'head' },
    faceAt: { parent: 'head', eye: [0.25 * hl, 0.55 * hl, 0.33 * hl], brow: 0.17 * hl, mouth: false },
    guide: [
      'wings are paddles ≥ 3 texels thick in a slot ≠ body (or a ≥ 15 % value step), visible outside the body at S/N — they ARE the hands (vote = out 150-165)',
      'beak ≥ 2 texels long from the side and a hue ≥ 30° off the head; the beak + eyes carry expression (no mouth bone)',
      'short legs (0.2·H) cannot cover 1.2·H per 0.3 s cycle on foot: waddle = body roll ±12-18° about z + wing flutter, or a two-footed hop (crows); meta.gait',
      'long necks (goose): neckN 2-3, pitch spread over the links; head world pitch within ±35° in held keys',
    ],
    slots: [
      { name: 'body', bone: 'body', kind: 'chamfer', size: [width, bodyH * 0.62, width * 1.25], at: [0, bodyH * 0.22, -0.03 * k], color: 'main' },
      { name: 'breast', bone: 'chest', kind: 'chamfer', size: [width * 0.9, (neckBase - chestY) + 0.08 * k, width * 1.0], at: [0, (neckBase - chestY) * 0.45, 0.02 * k], color: 'light' },
      ...Array.from({ length: neckN }, (_, i) => ({ name: `neck${i}`, bone: i === 0 ? 'neck' : `neck${i}`, kind: 'seg', size: [0.12 * k, 0.12 * k], to: i + 1 < neckN ? `neck${i + 1}` : 'head', color: 'main', extend: 0.04 * k })),
      { name: 'head', bone: 'head', kind: 'chamfer', size: [0.78 * hl, 0.78 * hl, 0.76 * hl], at: [0, 0.48 * hl, 0], color: 'main' },
      { name: 'beak', bone: 'head', kind: 'frustum4', size: [0.3 * hl, 0.22 * hl, beakLen + 0.05 * hl], at: [0, 0.4 * hl, 0.38 * hl + beakLen / 2], color: 'accent', point: 'fwd' },
      { name: 'lowerBeak', bone: 'jaw', kind: 'box', size: [0.22 * hl, 0.08 * hl, beakLen * 0.8], at: [0, -0.03 * hl, beakLen * 0.45], color: 'accent' },
      { name: 'wing', bone: 'upperArmL', kind: 'seg', size: [0.06 * k, 0.15 * k], to: 'forearmL', color: 'second', mirror: true, extend: 0.03 * k },
      { name: 'wingTip', bone: 'forearmL', kind: 'seg', size: [0.05 * k, 0.12 * k], to: 'handL', color: 'second', mirror: true, extend: 0.04 * k },
      ...(tail ? [{ name: 'tail', bone: 'tail0', kind: 'leaf', size: [0.18 * k, tail.len ?? 0.16 * k, 0.04 * k], to: 'tip', color: 'second', flat: true }] : []),
      ...(crest ? [{ name: 'crest', bone: 'crest0', kind: 'leaf', size: [0.05 * k, 0.4 * hl, 0.04 * k], to: 'tip', color: 'accent' }] : []),
      ...(hover > 0 ? [] : [
        { name: 'thigh', bone: 'thighL', kind: 'seg', size: [0.05 * k, 0.05 * k], to: 'shinL', color: 'accent', mirror: true },
        { name: 'shin', bone: 'shinL', kind: 'seg', size: [0.045 * k, 0.045 * k], to: 'footL', color: 'accent', mirror: true },
        { name: 'foot', bone: 'footL', kind: 'box', size: [0.1 * k, 0.03 * k, 0.12 * k], at: [0, -0.015 * k, 0.04 * k], color: 'accent', mirror: true }]),
      ...(insectWings ? [
        { name: 'foreWing', bone: 'wingL0', kind: 'box', size: [0.34 * k, 0.04 * k, 0.24 * k], at: [0.17 * k, 0, -0.02 * k], color: 'second', mirror: true },
        { name: 'hindWing', bone: 'wingL1', kind: 'box', size: [0.24 * k, 0.04 * k, 0.18 * k], at: [0.12 * k, 0, -0.03 * k], color: 'second', mirror: true }] : []),
      ...(antennae ? [{ name: 'antenna', bone: 'antennaL0', kind: 'seg', size: [0.04 * k, 0.04 * k], to: 'antennaL1', color: 'dark', mirror: true }] : []),
      ...faceSlots(hl, { eye: 0.16, brow: false, mouth: false }),
    ] };
  let out = withMeta(S, sockets, meta);
  if (faceOpts !== false) out = face(out, { mouth: false, brow: false, ...(faceOpts || {}) });
  return out;
}

/**
 * Hopper (frog / toad / rabbit): the REST pose is the SIT — torso leaning forward 35-40° over Z-folded hind legs
 * (knee forward and out, shin back, long foot flat forward) and short fore legs planted in front. Bone names are the
 * biped's (thigh/shin/foot hind, upperArm/forearm/hand fore) so IK, look and smears work; meta.gaits.hop puts both
 * hind feet in phase (fore feet land first, take off last).
 *   height 0.6 (top of the head when sitting), heads 2.2, legs 1, width 0.3·k, jaw true (wide mouth: talk),
 *   ears {n:2, len:0.35·k} | false (rabbit: ears {}), tail {n:1, len} | false (rabbit puff), splay 0.35 (knee out, frog)
 * Sockets: head, hat, mouth, back, tailTip.
 */
export function hopper({ height = 0.6, heads = 2.5, legs = 1, width, jaw = true, ears = false, tail = false, splay = 0.5,
  face: faceOpts = {}, chains = {} } = {}) {
  const k = height / 0.6;
  const hl = height / heads;
  width ??= 0.38 * k;
  const L = legs;
  const ankleY = 0.035 * k;
  const hipY = 0.15 * k * L + 0.02 * k, hipZ = -0.1 * k;
  const headY = height - hl;
  const chestY = Math.max(hipY + 0.06 * k, headY - 0.07 * k), chestZ = 0.08 * k;
  const S = [
    { name: 'body', pos: [0, hipY + 0.01 * k, hipZ], axis: 'up', limits: { fwd: [-60, 90], twist: [-40, 40], out: [-30, 30] } },
    { name: 'chest', parent: 'body', pos: [0, chestY - hipY - 0.01 * k, chestZ - hipZ], axis: 'up', limits: { fwd: [-50, 60], twist: [-40, 40], out: [-30, 30] } },
    { name: 'head', parent: 'chest', pos: [0, headY - chestY, 0.03 * k], axis: 'up', limits: { fwd: [-45, 50], twist: [-70, 70], out: [-35, 35] } },
  ];
  if (jaw) S.push({ name: 'jaw', parent: 'head', pos: [0, 0.2 * hl, 0.3 * hl], axis: 'fwd', limits: { fwd: [-5, 45] } });
  const hx = width * 0.36, kx = hx + splay * 0.15 * k;
  const thighV = [kx - hx, 0.0 * k - 0.01 * k, 0.15 * k * L];             // hip → knee: forward (and out)
  const kneeY = hipY + thighV[1];
  const shinV = [0, ankleY - kneeY, -(0.15 * k * L) - 0.01 * k];            // knee → ankle: back and down
  const footLen = 0.17 * k * L;
  for (const s of ['L', 'R']) {
    const x = s === 'L' ? 1 : -1;
    S.push(
      { name: `thigh${s}`, parent: 'body', pos: [x * hx, -0.01 * k, 0], axis: 'down', limits: { fwd: [-120, 120], twist: [-30, 30], out: [-20, 60] } },
      { name: `shin${s}`, parent: `thigh${s}`, pos: [x * thighV[0], thighV[1], thighV[2]], axis: 'down' },
      { name: `foot${s}`, parent: `shin${s}`, pos: [0, shinV[1], shinV[2]], axis: 'fwd', limits: { fwd: [-80, 80] } },
      { name: `upperArm${s}`, parent: 'chest', pos: [x * width * 0.33, -0.02 * k, 0.05 * k], axis: 'down' },
      { name: `forearm${s}`, parent: `upperArm${s}`, pos: [0, -(chestY - 0.02 * k - ankleY) * 0.5, -0.01 * k], axis: 'down', limits: { fwd: [-10, 140] } },
      { name: `hand${s}`, parent: `forearm${s}`, pos: [0, -(chestY - 0.02 * k - ankleY) * 0.5, 0.02 * k], axis: 'fwd' },
    );
  }
  if (ears) S.push(...chain('ear', { n: 2, parent: 'head', at: [0.14 * hl, 0.88 * hl, -0.08 * hl], dir: [0.2, 1, -0.18], len: 0.35 * k, mirror: true, ...ears }));
  if (tail) S.push(...chain('tail', { n: 1, parent: 'body', at: [0, 0.0, -0.08 * k], dir: [0, 0.4, -1], len: 0.06 * k, ...tail }));
  for (const [name, o] of Object.entries(chains)) S.push(...chain(name, o));
  const W = restPositions(S);
  const sockets = { head: { bone: 'head', at: [0, hl, 0] }, hat: { bone: 'head', at: [0, hl * 0.95, -0.03 * hl] },
    mouth: { bone: jaw ? 'jaw' : 'head', at: [0, 0, 0.25 * hl] }, back: { bone: 'chest', at: [0, 0.02 * k, -0.1 * k] },
    ...(tail ? { tailTip: { bone: 'tail0', at: [0, 0, 0] } } : {}) };
  const bodyW = width;
  const torsoL = Math.hypot(chestY - hipY, chestZ - hipZ);
  const meta = { kind: 'hopper', plan: 'hopper', height, H: height, heads, k, hl, hipY, chestY, headY, ankleY, footLen, width,
    legs: [legOf(S, W, 'L', BIPED_BONES.legL, 'hind', [0, 0, 1]), legOf(S, W, 'R', BIPED_BONES.legR, 'hind', [0, 0, 1]),
      legOf(S, W, 'foreL', ['upperArmL', 'forearmL', 'handL'], 'fore', [0, 0, -1]), legOf(S, W, 'foreR', ['upperArmR', 'forearmR', 'handR'], 'fore', [0, 0, -1])],
    restY: restYs(W), gait: 'hop',
    gaits: { hop: { duty: 0.4, phase: { L: 0, R: 0, foreL: 0.62, foreR: 0.62 } }, crawl: { duty: 0.7, phase: { L: 0, foreR: 0.25, R: 0.5, foreL: 0.75 } } },
    bones: { ...BIPED_BONES, hips: 'body', spine: 'body', chest: 'chest', neck: 'head', head: 'head' },
    faceAt: { parent: 'head', eye: [0.34 * hl, 0.8 * hl, 0.28 * hl], brow: 0.18 * hl, mouth: [0, 0.18 * hl, 0.55 * hl] },
    guide: [
      'the hop is the read: launch key = hind legs fully extended (foot pointed) with the body stretched ≥ 1.3 × sit length; land = squash (body.s y −0.2)',
      'one hop per game cycle covers 1.2·H: flight ≈ 0.18 s → ballistic apex ≈ 0.04 m; draw the apex higher (≥ 0.25·H) and hold it — readable over physical',
      'frog eyes sit ON TOP of the head (≥ 2×2 texels, light rim) so they read from behind; toads: wider body, shorter legs (legs 0.8)',
      'rabbit: ears ≥ 0.5·H (2 links), the ears lag the hop by one drawing',
    ],
    slots: [
      { name: 'belly', bone: 'body', kind: 'chamfer', size: [bodyW, 0.16 * k, 0.22 * k], at: [0, 0.03 * k, 0.03 * k], color: 'main' },
      { name: 'torso', bone: 'body', kind: 'seg', size: [bodyW * 0.9, 0.2 * k], to: 'chest', extend: 0.07 * k, color: 'light' },
      { name: 'head', bone: 'head', kind: 'chamfer', size: [1.2 * hl, 0.66 * hl, 1.0 * hl], at: [0, 0.36 * hl, 0.08 * hl], color: 'main' },
      ...(jaw ? [{ name: 'jaw', bone: 'jaw', kind: 'box', size: [1.0 * hl, 0.12 * hl, 0.62 * hl], at: [0, -0.05 * hl, 0.02 * hl], color: 'light' }] : []),
      { name: 'eyeDome', bone: 'head', kind: 'chamfer', size: [0.32 * hl, 0.3 * hl, 0.32 * hl], at: [0.34 * hl, 0.76 * hl, 0.14 * hl], color: 'main', mirror: true },
      { name: 'thigh', bone: 'thighL', kind: 'seg', size: [0.1 * k, 0.12 * k], to: 'shinL', color: 'main', mirror: true, extend: 0.03 * k },
      { name: 'shin', bone: 'shinL', kind: 'seg', size: [0.08 * k, 0.09 * k], to: 'footL', color: 'main', mirror: true },
      { name: 'foot', bone: 'footL', kind: 'box', size: [0.1 * k, 0.04 * k, footLen], at: [0, -0.015 * k, footLen * 0.4], color: 'second', mirror: true },
      { name: 'arm', bone: 'upperArmL', kind: 'seg', size: [0.06 * k, 0.06 * k], to: 'forearmL', color: 'main', mirror: true },
      { name: 'forearm', bone: 'forearmL', kind: 'seg', size: [0.055 * k, 0.055 * k], to: 'handL', color: 'main', mirror: true },
      { name: 'hand', bone: 'handL', kind: 'box', size: [0.08 * k, 0.03 * k, 0.07 * k], at: [0, -0.01 * k, 0.025 * k], color: 'second', mirror: true },
      ...(ears ? [{ name: 'ear', bone: 'earL0', kind: 'leaf', size: [0.09 * k, (ears.len ?? 0.35 * k) / 2 + 0.02 * k, 0.03 * k], to: 'earL1', color: 'main', mirror: true },
        { name: 'earTip', bone: 'earL1', kind: 'leaf', size: [0.08 * k, (ears.len ?? 0.35 * k) / 2, 0.03 * k], to: 'tip', color: 'light', mirror: true }] : []),
      ...(tail ? [{ name: 'tail', bone: 'tail0', kind: 'chamfer', size: [0.1 * k, 0.1 * k, 0.1 * k], at: [0, 0, -0.03 * k], color: 'light' }] : []),
      ...faceSlots(hl, { eye: 0.17, brow: false }),
    ] };
  let out = withMeta(S, sockets, meta);
  if (faceOpts !== false) out = face(out, { brow: false, ...(faceOpts || {}) });
  return out;
}

/**
 * Limbless (snail / slug / blob / greenting): no legs — the body is a SQUASH bone (`body`, joint on the ground, so
 * scaling it keeps the sole on the ground) under an anchor root (`base`); travel = a glide with a squash/stretch pulse
 * per game cycle (squashPose). Rigid props ride the squash with `.p` offsets (squashPose riders).
 *   kind 'snail' | 'blob'. height 0.5 (shell top / blob top), length 0.6·k (sole), width 0.26·k
 *   snail: front/back sole links (front fwd + = head end dips, back fwd + = tail end drops), neck → head on the
 *     front, eye stalks (stalkL0/1, stalkR0/1), shell on `base` (rigid; ride offsets) — shell: false for a slug.
 *   blob: `top` (wobble/lean, carries the face), optional nubs (nubL0/nubR0, axis out: out + = UP — the "hands":
 *     vote = one nub up).
 * Sockets: head/hat, shellTop, back, mouth.
 */
export function limbless({ kind = 'snail', height = 0.5, length, width, shell = true, stalks = true, nubs = kind === 'blob',
  face: faceOpts = {}, chains = {} } = {}) {
  const k = height / 0.5;
  length ??= 0.6 * k; width ??= 0.26 * k;
  const S = [
    { name: 'base', pos: [0, 0, 0], axis: 'up' },
    { name: 'body', parent: 'base', pos: [0, 0, 0], axis: 'up', limits: { fwd: [-20, 20], twist: [-30, 30], out: [-20, 20] } },
  ];
  let sockets, slots, faceAt, hl;
  if (kind === 'blob') {
    hl = height * 0.55;
    S.push({ name: 'top', parent: 'body', pos: [0, height * 0.45, 0], axis: 'up', limits: { fwd: [-35, 35], twist: [-45, 45], out: [-30, 30] } });
    if (nubs) S.push(...chain('nub', { n: 1, parent: 'body', at: [width * 0.95, height * 0.3, 0.02 * k], dir: [1, -0.25, 0.1], len: 0.13 * k, mirror: true, ...(nubs === true ? {} : nubs) }));
    sockets = { head: { bone: 'top', at: [0, height * 0.55, 0] }, hat: { bone: 'top', at: [0, height * 0.53, 0] }, back: { bone: 'body', at: [0, height * 0.4, -width] },
      mouth: { bone: 'top', at: [0, 0.02 * k, width * 0.95] } };
    faceAt = { parent: 'top', eye: [0.075 * k, 0.09 * k, width * 0.92], brow: 0.07 * k, mouth: [0, -0.04 * k, width * 0.95] };
    slots = [
      { name: 'skirt', bone: 'body', kind: 'chamfer', size: [width * 2.2, height * 0.42, width * 2.1], at: [0, height * 0.21, 0], color: 'main' },
      { name: 'dome', bone: 'top', kind: 'lathe', profile: 'dome', size: [width * 1.0, height * 0.6], at: [0, height * 0.24 - 0.01 * k, 0], color: 'main' },
      ...(nubs ? [{ name: 'nub', bone: 'nubL0', kind: 'seg', size: [0.09 * k, 0.09 * k], to: 'tip', len: (nubs.len ?? 0.13 * k), color: 'light', mirror: true, extend: 0.04 * k }] : []),
      ...faceSlots(0.5 * k, { eye: 0.16 }),
    ];
  } else {
    hl = 0.2 * k;
    S.push(
      { name: 'front', parent: 'body', pos: [0, 0.06 * k, 0.05 * k], axis: 'fwd', limits: { fwd: [-40, 30] } },
      { name: 'back', parent: 'body', pos: [0, 0.05 * k, -0.06 * k], axis: 'back', limits: { fwd: [-30, 30] } },
      { name: 'neck', parent: 'front', pos: [0, 0.0, length * 0.33], axis: 'up', limits: { fwd: [-40, 70], twist: [-50, 50], out: [-40, 40] } },
      { name: 'head', parent: 'neck', pos: [0, 0.12 * k, 0.02 * k], axis: 'up', limits: { fwd: [-40, 50], twist: [-60, 60], out: [-35, 35] } },
    );
    if (stalks) S.push(...chain('stalk', { n: 2, parent: 'head', at: [0.04 * k, 0.07 * k, 0.0], dir: [0.35, 1, 0.1], len: 0.15 * k, mirror: true, ...(stalks === true ? {} : stalks) }));
    if (shell) S.push({ name: 'shell', parent: 'base', pos: [0, 0.07 * k, -0.06 * k], axis: 'up', limits: { fwd: [-25, 25], twist: [-20, 20], out: [-20, 20] } });
    sockets = { head: { bone: 'head', at: [0, 0.09 * k, 0] }, hat: { bone: 'head', at: [0, 0.08 * k, 0] }, mouth: { bone: 'head', at: [0, 0.01 * k, 0.07 * k] },
      back: { bone: shell ? 'shell' : 'body', at: [0, shell ? 0.3 * k : 0.1 * k, 0] }, ...(shell ? { shellTop: { bone: 'shell', at: [0, 0.33 * k, 0] } } : {}) };
    faceAt = { parent: 'head', eye: false, brow: false, mouth: [0, 0.015 * k, 0.065 * k] };
    slots = [
      { name: 'sole', bone: 'body', kind: 'chamfer', size: [width * 0.9, 0.08 * k, length * 0.45], at: [0, 0.04 * k, 0], color: 'main' },
      { name: 'soleFront', bone: 'front', kind: 'chamfer', size: [width * 0.8, 0.09 * k, length * 0.38], at: [0, -0.015 * k, length * 0.16], color: 'main' },
      { name: 'soleBack', bone: 'back', kind: 'chamfer', size: [width * 0.6, 0.06 * k, length * 0.3], at: [0, -0.02 * k, -length * 0.12], color: 'main' },
      { name: 'neck', bone: 'neck', kind: 'seg', size: [0.12 * k, 0.12 * k], to: 'head', color: 'main', extend: 0.03 * k },
      { name: 'head', bone: 'head', kind: 'chamfer', size: [0.15 * k, 0.12 * k, 0.15 * k], at: [0, 0.03 * k, 0.02 * k], color: 'main' },
      ...(stalks ? [{ name: 'stalk', bone: 'stalkL0', kind: 'seg', size: [0.045 * k, 0.045 * k], to: 'stalkL1', color: 'main', mirror: true, extend: 0.02 * k },
        { name: 'stalkTip', bone: 'stalkL1', kind: 'seg', size: [0.04 * k, 0.04 * k], to: 'tip', len: 0.075 * k, color: 'main', mirror: true },
        { name: 'stalkEye', bone: 'stalkL1', kind: 'chamfer', size: [0.07 * k, 0.07 * k, 0.07 * k], at: 'tip', len: 0.075 * k, color: 'eye', mirror: true }] : []),
      ...(shell ? [{ name: 'shell', bone: 'shell', kind: 'lathe', profile: 'wheel', size: [0.17 * k, 0.17 * k], at: [0, 0.2 * k, -0.02 * k], color: 'second' },
        { name: 'shellCore', bone: 'shell', kind: 'lathe', profile: 'wheel', size: [0.1 * k, 0.19 * k], at: [0, 0.22 * k, -0.01 * k], color: 'light' }] : []),
      { name: 'mouth', bone: 'mouth', kind: 'box', size: [0.06 * k, 0.03 * k, 0.02 * k], at: [0, 0, 0], color: 'eye', optional: true },
    ];
  }
  for (const [name, o] of Object.entries(chains)) S.push(...chain(name, o));
  const W = restPositions(S);
  const H = kind === 'blob' ? height : Math.max(height, (W.stalkL1?.[1] ?? 0) + 0.08 * k);
  const meta = { kind: 'limbless', plan: 'limbless', variant: kind, height, H, k, hl, length, width, legs: [], restY: restYs(W), gait: 'glide',
    gaits: { glide: { duty: 1, pulse: { stretch: [-0.12, 0.18, -0.12], squash: [0.18, -0.22, 0.18] } } },
    bones: { hips: 'base', spine: 'body', chest: kind === 'blob' ? 'top' : 'front', neck: kind === 'blob' ? 'top' : 'neck', head: kind === 'blob' ? 'top' : 'head' },
    faceAt, slots,
    guide: [
      'a glide reads as alive only with a pulse: one squash → stretch per game cycle (0.3 s), ≥ 2 texels of height change, the sole leading',
      'squash keeps volume: body.s = [a, −b, a] with (1+a)²(1−b) ≈ 1 (squashPose); props ride with .p (squashPose riders), never scale with the body',
      'snail: stalks + head are the face (eyes on the stalk tips ≥ 2×2 texels); the shell is the signature (spiral = lathe bands, ≥ 0.05 m)',
      'blob: the face is the only detail — eyes ≥ 2×3 texels, blink by eye scale; nubs are the hands (vote = one nub up, out ≥ 70)',
    ] };
  let out = withMeta(S, sockets, meta);
  if (faceOpts !== false) {
    if (kind === 'blob') out = face(out, faceOpts || {});
    else out = face(out, { eye: [0.0001, 0.0, 0.0], brow: false, ...(faceOpts || {}) }); // snail: eyes live on the stalks; eyeL/R bones exist for API symmetry
  }
  return out;
}

/**
 * Volume-preserving squash/stretch pose entries for a squash bone, plus ride offsets for rigid riders.
 *   squashPose(S | rig, amount, { bone: 'body', riders: ['shell'] })  amount > 0 squashes (flatter, wider), < 0
 *   stretches. Returns { '<bone>.s': [a, −amount, a], '<rider>.p': [0, Δy, 0] } (a = 1/√(1 − amount) − 1).
 */
export function squashPose(skel, amount, { bone = 'body', riders = [], ride = 1 } = {}) {
  const m = skel?.meta ?? skel?.spec?.skeleton?.meta ?? skel;
  const sy = 1 - amount, a = 1 / Math.sqrt(Math.max(0.05, sy)) - 1;
  const out = { [`${bone}.s`]: [+a.toFixed(4), +(-amount).toFixed(4), +a.toFixed(4)] };
  const y0 = m?.restY?.[bone] ?? 0;
  for (const r of riders) { const y = (m?.restY?.[r] ?? 0) - y0; out[`${r}.p`] = [0, +(y * (sy - 1) * ride).toFixed(4), 0]; }
  return out;
}

/** Body-plan registry: name → { build(opts), about, check, cast }. Templates for the Clocktower cast (docs/CHARACTERS.md,
 *  docs/CAST_PORTING.md §6). `build({})` gives the plan at CAST SCALE (heights from refs/cast/_lineup.png via
 *  castHeight; the bare template functions keep their older, smaller defaults). `check` = spec.bodyPlan (the CHARACTERS.md §3 /
 *  charcheck PLANS vocabulary: biped|uprightAnimal|quadruped|bird|hopper|limbless|flier|longNeck|blob), `cast` = the cast members the plan is for (pick from the REF, not the species word). */
export const RIG_PLANS = {
  biped: { build: (o) => biped(o), check: 'biped', about: 'humanoid 4 heads (mannequin, wanderer, keeper, duelist)', cast: [] },
  chibi: { build: (o) => chibi(o), check: 'uprightAnimal', about: 'upright chibi: 2.5 heads, leg 0.25 H, snout/ears/tail optional — clothed animals and small people',
    cast: ['frog', 'fox', 'owl', 'goat', 'skeleton-chef', 'rabbit', 'mole', 'toad', 'polly', 'clarabelle', 'requin', 'progress',
      'preservation', 'opal', 'mincut', 'maxflow', 'theo-rem', 'greenting', 'mushroom', 'green-hood', 'crow', 'storyteller',
      'npc-sweeper', 'npc-vendor', 'npc-elder', 'npc-porter'] },
  upright: { build: (o) => uprightAnimal({ height: 1.3, ...o }), check: 'uprightAnimal', about: 'upright animal 3.2 heads: snout, jaw, ears, tail (taller animals; chibi for the cast)', cast: [] },
  quadruped: { build: (o) => quadruped(o), check: 'quadruped', about: 'four legs, root mid-body (hound); NOT for the cast animals (v2 draws them upright)', cast: [] },
  longneck: { build: (o) => longNeck({ base: 'upright', height: 1.52, ...o }), check: 'longNeck', about: 'upright (or base: quadruped) with a 3-link neck chain', cast: ['cilantro'] },
  bird: { build: (o) => bird({ height: 1.24, ...o }), check: 'bird', about: 'egg body, wing paddles, short legs, beak, waddle (goose)', cast: ['honk', 'chonk'] },
  moth: { build: (o) => bird({ height: 1.1, heads: 2.4, hover: 0.26, legs: 0.6, insectWings: true, antennae: true, tail: false, beak: 0.12, ...o }), check: 'flier',
    about: 'flyer: bird body hovering, 4 insect wings (out + = up), antennae; v2 moth walks — use chibi + wing parts unless it hovers', cast: ['moth (hover emote)'] },
  hopper: { build: (o) => hopper({ height: 1.0, ...o }), check: 'hopper', about: 'sitting hopper: Z-folded hind legs, true hop (optional frog / toad / rabbit)', cast: [] },
  limbless: { build: (o) => limbless({ height: 1.05, ...o }), check: 'limbless', about: 'snail / slug: squash body, sole links, stalks, rigid shell', cast: ['snail'] },
  blob: { build: (o) => limbless({ kind: 'blob', height: 1.12, ...o }), check: 'blob', about: 'blob: squash body, wobble top with the face, nubs (a limbless greenting variant)', cast: [] },
};
// names other docs/modules use for the same plans (CAST_PORTING spec.bodyPlan words, charcheck plans, LegGait plans)
const PLAN_ALIAS = { uprightAnimal: 'chibi', upright_chibi: 'chibi', longNeck: 'longneck', flier: 'moth', fly: 'moth', glider: 'limbless',
  glide: 'limbless', snail: 'limbless', hop: 'hopper' };
/** Resolve any plan word → { rig (RIG_PLANS key), check (spec.bodyPlan for charcheck), locomotion (spec.locomotion.plan
 *  for motion's LegGait; null = legacy biped Gait), build }. planInfo('uprightAnimal').rig === 'chibi'. */
export function planInfo(name) {
  const rig = RIG_PLANS[name] ? name : PLAN_ALIAS[name];
  const P = RIG_PLANS[rig];
  if (!P) throw new Error(`planInfo: unknown plan '${name}' (${[...Object.keys(RIG_PLANS), ...Object.keys(PLAN_ALIAS)].join(', ')})`);
  const loco = { biped: null, chibi: 'biped', upright: 'biped', quadruped: 'quadruped', longneck: 'biped', bird: 'bird', moth: 'fly', hopper: 'hop', limbless: 'glide', blob: 'glide' }[rig];
  return { rig, check: P.check, locomotion: loco, build: P.build, about: P.about };
}

// ─── pose convention ────────────────────────────────────────────────────────────────────────────────────────────

/** Axes for a bone with rest direction `dir` (Vector3) and side 'L'|'R'|null. Returns {fwd, twist, out} unit axes. */
function boneAxes(dir, side) {
  const ax = Math.abs(dir.x), ay = Math.abs(dir.y), az = Math.abs(dir.z);
  const D = new THREE.Vector3();
  let kind;
  if (ay >= ax && ay >= az) { D.set(0, Math.sign(dir.y) || 1, 0); kind = 'vert'; }
  else if (az >= ax) { D.set(0, 0, Math.sign(dir.z)); kind = 'z'; }
  else { D.set(Math.sign(dir.x), 0, 0); kind = 'x'; }
  const Xo = new THREE.Vector3(side === 'R' ? -1 : 1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0), mY = new THREE.Vector3(0, -1, 0);
  let mFwd, mOut, ref, target;
  if (kind === 'vert') { mFwd = Z; mOut = Xo; ref = Z; target = Xo; }
  else if (kind === 'z') { mFwd = mY; mOut = Xo; ref = Y; target = Xo; }
  else { mFwd = Z; mOut = Y; ref = Y; target = Z; }
  // rotating about axis a moves the tip D in direction a × D; choose a = D × m so that a × D = m.
  const fwd = new THREE.Vector3().crossVectors(D, mFwd).normalize();
  const out = new THREE.Vector3().crossVectors(D, mOut).normalize();
  const sgn = new THREE.Vector3().crossVectors(D, ref).dot(target) >= 0 ? 1 : -1;
  const twist = D.clone().multiplyScalar(sgn);
  return { fwd, twist, out, dir: D, kind };
}

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
function tripleQuat(axes, t, out, limits) {
  let [f = 0, tw = 0, o = 0] = t;
  if (limits) {
    if (limits.fwd) f = THREE.MathUtils.clamp(f, limits.fwd[0], limits.fwd[1]);
    if (limits.twist) tw = THREE.MathUtils.clamp(tw, limits.twist[0], limits.twist[1]);
    if (limits.out) o = THREE.MathUtils.clamp(o, limits.out[0], limits.out[1]);
  }
  _q1.setFromAxisAngle(axes.fwd, f * D2R);
  _q2.setFromAxisAngle(axes.out, o * D2R);
  _q3.setFromAxisAngle(axes.twist, tw * D2R);
  return out.copy(_q1).multiply(_q2).multiply(_q3);
}

function entryOf(pose, name) {
  const v = pose?.[name];
  if (!v) return null;
  if (Array.isArray(v)) return { rot: v };
  return v; // { rot, pos }
}

/** Quaternion for one bone from a pose triple (uses the rig's per-bone axes). */
export function tripleToQuaternion(rig, bone, triple, out = new THREE.Quaternion(), { clamp = false } = {}) {
  const info = rig.info[bone];
  if (!info) throw new Error(`tripleToQuaternion: unknown bone '${bone}'`);
  return tripleQuat(info.axes, triple || [0, 0, 0], out, clamp ? info.limits : null);
}

/** { boneName: Quaternion } for EVERY bone (missing → identity), plus `pos` (root offset Vector3) if given. */
export function poseToQuaternions(rig, pose = {}, { clamp = false } = {}) {
  const res = {};
  for (const name of rig.boneNames) {
    const e = entryOf(pose, name);
    res[name] = e?.rot ? tripleToQuaternion(rig, name, e.rot, new THREE.Quaternion(), { clamp }) : new THREE.Quaternion();
  }
  const rootE = entryOf(pose, rig.rootName);
  const pos = pose?.pos ?? rootE?.pos;
  if (pos) res.pos = new THREE.Vector3(...pos);
  for (const [key, v] of Object.entries(pose || {})) { const x = extraKey(key); if (x && rig.bones[x.bone] && Array.isArray(v)) res[key] = new THREE.Vector3(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0); }
  return res;
}

/**
 * Extra pose channels (round 6): '<bone>.s' = SCALE OFFSET [sx−1, sy−1, sz−1] (so a missing / zero-filled key is
 * identity: squash/stretch, blink, expression swaps, hiding a part with [−1,−1,−1]); '<bone>.p' = POSITION OFFSET
 * [x,y,z] m from the bone's rest position (in its parent's frame: riders on a squash, a sliding mouth). Both lerp
 * like triples in anim.js clips; mirrorPose swaps the bone's side (and negates .p x).
 */
export function extraKey(key) { const m = /^(.+)\.([spl])$/.exec(key); return m ? { bone: m[1], ch: m[2] } : null; }

/** Mirror a pose map: swap L/R names, negate twist/out of midline bones and pos.x. */
export function mirrorPose(pose = {}) {
  const res = {};
  const mirT = (name, t) => (sideOf(name) ? [...t] : [t[0] ?? 0, -(t[1] ?? 0), -(t[2] ?? 0)]);
  for (const [name, v] of Object.entries(pose)) {
    if (name === 'pos') { res.pos = [-v[0], v[1], v[2]]; continue; }
    const xk = extraKey(name);
    if (xk) { res[`${swapSide(xk.bone)}.${xk.ch}`] = xk.ch === 'p' ? [-(v[0] ?? 0), v[1] ?? 0, v[2] ?? 0] : [...v]; continue; }
    const n2 = swapSide(name);
    if (Array.isArray(v)) res[n2] = mirT(name, v);
    else if (v && typeof v === 'object') {
      res[n2] = { ...v };
      if (v.rot) res[n2].rot = mirT(name, v.rot);
      if (v.pos) res[n2].pos = [-v.pos[0], v.pos[1], v.pos[2]];
    } else res[n2] = v;
  }
  return res;
}

// ─── build ──────────────────────────────────────────────────────────────────────────────────────────────────────

// '.l' stretch: a child bone's local matrix cancels its parent's length stretch (S, diagonal in the parent's frame) so the
// child stays rigid while its joint moves out: M = T(p) · S⁻¹ · T(−p) · (T(p) R S) = T(p) · S⁻¹ · R · S
const _lm = new THREE.Matrix4(), _lt = new THREE.Matrix4();
function counterUpdate() {
  this.matrix.compose(this.position, this.quaternion, this.scale);
  const s = this.parent?.userData?.lStretch;
  if (s) {
    const inv = 1 / s.k;
    _lm.makeScale(s.ax === 'x' ? inv : 1, s.ax === 'y' ? inv : 1, s.ax === 'z' ? inv : 1);
    _lt.makeTranslation(this.position.x, this.position.y, this.position.z).multiply(_lm);
    _lm.makeTranslation(-this.position.x, -this.position.y, -this.position.z);
    this.matrix.premultiply(_lt.multiply(_lm));
  }
  this.matrixWorldNeedsUpdate = true;
}

/** spec.ghost (shared ghost look) with defaults; see docs/CHARACTERS.md §5 "Ghost". */
export function ghostOpts(g = {}) {
  const o = g === true ? {} : g;
  const halo = o.halo === false ? null : { bone: 'head', at: null, lift: 0.12, radius: 0.15, bar: 0.045, tilt: 0, color: '#FFE08A', ...(o.halo || {}) };
  return {
    ramp: o.ramp || ['#3A5696', '#E2EEFA'], spent: o.spent || ['#3A4260', '#98A2BA'], mist: o.mist || '#D4E0F2',
    lo: o.lo ?? 0.12, slope: o.slope ?? 1.35, keepHue: o.keepHue ?? 0, glow: o.glow || [0.3, 0.12],
    fade: o.fade || [0.08, 0.14, 0.2, 0.3], mistK: o.mistK || [0.55, 0.25], keep: o.keep || [], halo,
    hover: o.hover ?? 0,
  };
}

const _sm = (e0, e1, x) => { const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Build a character from a spec (docs/CHARACTERS.md §3). Returns
 * { root, mesh, bones, boneList, boneNames, rootName, skeleton, sockets, spec, height, info, stats,
 *   applyPose(pose, {reset=true, clamp=spec.clampLimits, update=true}), restPose(), setQuaternions(qMap, pos?),
 *   dispose() }.
 */
export function buildCharacter(engine, spec) {
  const skel = spec.skeleton || spec.bones;
  if (!Array.isArray(skel) || !skel.length) throw new Error(`buildCharacter(${spec.name}): spec.skeleton missing`);
  const byName = new Map(skel.map((b) => [b.name, b]));
  if (byName.size !== skel.length) throw new Error(`buildCharacter(${spec.name}): duplicate bone names`);

  // topological order (parents first)
  const order = [], seen = new Set();
  const visit = (b, depth = 0) => {
    if (seen.has(b.name)) return;
    if (depth > 256) throw new Error('buildCharacter: bone parent cycle');
    if (b.parent) {
      const p = byName.get(b.parent);
      if (!p) throw new Error(`buildCharacter(${spec.name}): bone '${b.name}' has unknown parent '${b.parent}'`);
      visit(p, depth + 1);
    }
    seen.add(b.name); order.push(b);
  };
  skel.forEach((b) => visit(b));

  const root = new THREE.Group();
  root.name = `char:${spec.name || 'character'}`;
  const bones = {}, boneList = [], restWorld = {}, info = {};
  const children = {};
  for (const b of order) if (b.parent) (children[b.parent] ||= []).push(b);
  for (const b of order) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.fromArray(b.pos || [0, 0, 0]);
    (b.parent ? bones[b.parent] : root).add(bone);
    bones[b.name] = bone; boneList.push(bone);
    restWorld[b.name] = (b.parent ? restWorld[b.parent].clone() : new THREE.Vector3()).add(bone.position);
  }
  const rootName = order.find((b) => !b.parent).name;
  for (const b of order) {
    const side = sideOf(b.name);
    let dir = dirVec(b.axis, side);
    if (!dir) {
      const c = children[b.name]?.[0];
      if (c) dir = new THREE.Vector3(...c.pos);
      else if (b.parent && new THREE.Vector3(...b.pos).lengthSq() > 1e-8) dir = new THREE.Vector3(...b.pos);
      else dir = new THREE.Vector3(0, 1, 0);
    }
    if (dir.lengthSq() < 1e-10) dir.set(0, 1, 0);
    info[b.name] = { side, axes: boneAxes(dir.normalize(), side), limits: b.limits || null, rest: bones[b.name].position.clone(),
      restWorld: restWorld[b.name].clone(), index: boneList.indexOf(bones[b.name]), parent: b.parent || null };
  }
  // (module fix, wave 3: shared ghost) spec.ghost.halo → one extra bone 'ghostHalo', appended AFTER every spec bone (the
  // living bones keep their texture index) and outside the axis/children pass (no parent's rest axis changes). Its joint is
  // the parent's joint (inside the head); it is scaled to 0 except in ghost level 1 (rig.setGhost), so it draws nothing.
  const G = spec.ghost ? ghostOpts(spec.ghost) : null;
  if (G?.halo && !bones.ghostHalo) {
    const pn = bones[G.halo.bone] ? G.halo.bone : (bones.head ? 'head' : order.find((b) => !b.parent).name);
    const hb = new THREE.Bone();
    hb.name = 'ghostHalo';
    bones[pn].add(hb);
    bones.ghostHalo = hb; boneList.push(hb);
    restWorld.ghostHalo = restWorld[pn].clone();
    info.ghostHalo = { side: null, axes: boneAxes(new THREE.Vector3(0, 1, 0), null), limits: null, rest: hb.position.clone(),
      restWorld: restWorld.ghostHalo.clone(), index: boneList.length - 1, parent: pn };
    byName.set('ghostHalo', { name: 'ghostHalo', parent: pn, pos: [0, 0, 0], axis: 'up' });
  }
  root.updateMatrixWorld(true);

  // parts → one geometry in bind space (rest world, relative to root)
  const palette = spec.palette || {};
  const lin = (hex) => new THREE.Color(hex); // sRGB hex → linear working colour
  const toneOf = (c, partName) => {
    const t = Array.isArray(c) ? c : palette[c];
    if (!t) throw new Error(`buildCharacter(${spec.name}): part '${partName}' uses unknown palette slot '${c}'`);
    const [H, M, S] = (t.length === 3 ? t : [t[0], t[0], t[0]]).map(lin);
    return { H, M, S };
  };
  const pos = [], nrm = [], col = [], hi = [], sh = [], si = [], sw = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), nv = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const emitted = [];
  const emit = (p, mirrored) => {
    const boneName = mirrored ? swapSide(p.bone) : p.bone;
    const bone = bones[boneName];
    const label = p.name || `${p.bone}#${spec.parts.indexOf(p)}`;
    if (!bone) throw new Error(`buildCharacter(${spec.name}): part '${label}' uses unknown bone '${boneName}'`);
    const src = p.shape || p.geo;
    if (!src?.isBufferGeometry) throw new Error(`buildCharacter(${spec.name}): part '${label}' has no shape`);
    const g = src.index ? src.toNonIndexed() : src;
    const at = p.at || [0, 0, 0], rot = p.rot || [0, 0, 0];
    const sc = Array.isArray(p.scale) ? p.scale : [p.scale ?? 1, p.scale ?? 1, p.scale ?? 1];
    e.set(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R);
    m.compose(new THREE.Vector3(...at), q.setFromEuler(e), new THREE.Vector3(...sc));
    if (mirrored) m.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
    const bw = restWorld[boneName];
    m.premultiply(new THREE.Matrix4().makeTranslation(bw.x, bw.y, bw.z));
    const flip = m.determinant() < 0;
    nm.getNormalMatrix(m);
    const { H, M, S } = toneOf(p.color, label);
    const bi = boneList.indexOf(bone);
    // blend partner
    let bi2 = -1, blendFn = null;
    if (p.blend) {
      const bo = p.blend === true ? {} : p.blend;
      const withName0 = bo.with ?? byName.get(p.bone).parent;
      const withName = withName0 && mirrored ? swapSide(withName0) : withName0;
      if (withName && bones[withName]) {
        bi2 = boneList.indexOf(bones[withName]);
        const span = bo.span ?? 0.05;
        const D = info[boneName].axes.dir, J = bw;
        blendFn = bo.weight !== undefined ? () => bo.weight
          : (x, y, z) => _sm(-span, span, (x - J.x) * D.x + (y - J.y) * D.y + (z - J.z) * D.z);
      }
    }
    const P = g.attributes.position, N = g.attributes.normal;
    const nTri = P.count / 3;
    for (let t = 0; t < nTri; t++) {
      const idx = flip ? [3 * t, 3 * t + 2, 3 * t + 1] : [3 * t, 3 * t + 1, 3 * t + 2];
      for (const i of idx) {
        v.fromBufferAttribute(P, i).applyMatrix4(m);
        if (N) nv.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        pos.push(v.x, v.y, v.z); nrm.push(nv.x, nv.y, nv.z);
        col.push(M.r, M.g, M.b); hi.push(H.r, H.g, H.b); sh.push(S.r, S.g, S.b);
        if (blendFn) { const w = THREE.MathUtils.clamp(blendFn(v.x, v.y, v.z), 0, 1); si.push(bi, bi2, 0, 0); sw.push(w, 1 - w, 0, 0); }
        else { si.push(bi, 0, 0, 0); sw.push(1, 0, 0, 0); }
      }
    }
    emitted.push({ name: label + (mirrored ? '~' : ''), bone: boneName, tris: nTri });
  };
  for (const p of spec.parts || []) {
    emit(p, false);
    if (p.mirror) emit(p, true);
  }
  // living geometry ends here: the ghost halo (below) is excluded from the height, part ids, part options and the
  // self-shadow hull, so adding spec.ghost leaves every living render identical
  const ghostFrom = pos.length / 3;
  let liveTop = 0;
  for (let i = 1; i < pos.length; i += 3) liveTop = Math.max(liveTop, pos[i]);
  if (bones.ghostHalo) {
    // open octagon of boxes (the v1 ghost halo; polly/crow/snail recipe: 8 bars ≥ 1.5 texels), `at` above the joint
    const H = G.halo, slot = Object.keys(palette)[0];
    const ring = [];
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * Math.PI / 4;
      const bx = new THREE.BoxGeometry(2 * H.radius * Math.sin(Math.PI / 8) * 1.08, H.bar, H.bar * 1.1).toNonIndexed();
      bx.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(a) * H.radius, 0, Math.cos(a) * H.radius),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), new THREE.Vector3(1, 1, 1)));
      ring.push(bx);
    }
    const n = ring.reduce((s, g) => s + g.attributes.position.count, 0);
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
    let o = 0;
    for (const g of ring) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(P, 3)); hg.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (slot) emit({ bone: 'ghostHalo', shape: hg, at: H.at || [0, liveTop - restWorld.ghostHalo.y + H.lift, 0], rot: [H.tilt, 0, 0], color: slot, name: 'ghostHalo' }, false);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('toneHi', new THREE.Float32BufferAttribute(hi, 3));
  geo.setAttribute('toneSh', new THREE.Float32BufferAttribute(sh, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  // flat normals from the final (bind-space) triangles: robust to any part transform
  geo.computeVertexNormals();
  geo.computeBoundingBox(); geo.computeBoundingSphere();

  if (G) geo.userData.charGhostFrom = ghostFrom;
  const material = characterMaterial(engine, G ? { ...(spec.material || {}), ghost: G, ghostHaloBone: bones.ghostHalo ? boneList.indexOf(bones.ghostHalo) : -1, ghostHeight: liveTop } : (spec.material || {}));
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.name = `${root.name}:mesh`;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList);
  mesh.bind(skeleton);

  // sockets
  const sockets = {};
  const sockDefs = { ...(skel.sockets || {}), ...(spec.sockets || {}) };
  const warnings = [];
  for (const [name, s] of Object.entries(sockDefs)) {
    if (!s || !bones[s.bone]) { warnings.push(`socket '${name}': unknown bone '${s?.bone}'`); continue; }
    const o = new THREE.Object3D();
    o.name = `socket:${name}`;
    o.position.fromArray(s.at || [0, 0, 0]);
    const r = s.rot || [0, 0, 0];
    o.rotation.set(r[0] * D2R, r[1] * D2R, r[2] * D2R);
    bones[s.bone].add(o);
    sockets[name] = o;
  }

  const boneNames = boneList.map((b) => b.name);
  const stretched = new Set();                // bones carrying a '.l' stretch this pose
  const rig = {
    root, mesh, bones, boneList, boneNames, rootName, skeleton, sockets, spec, info, warnings,
    height: bones.ghostHalo ? liveTop : geo.boundingBox.max.y,
    ghostLevel: 0, ghostHalo: bones.ghostHalo || null,
    /** (module fix, shared ghost) 0 living, 1 ghost (pale ramp + halo), 2 ghost-spent (dimmer, no halo). spec.ghost only. */
    setGhost(level = 0) {
      const lv = G ? (level === 2 || level === 0.5 || level === 'spent' ? 2 : level ? 1 : 0) : 0;
      rig.ghostLevel = lv;
      for (const m of [].concat(mesh.material)) { const u = m?.userData?.look?.uniforms?.uCharGhost; if (u) u.value.x = lv; }
      if (rig.ghostHalo) { rig.ghostHalo.scale.setScalar(lv === 1 ? 1 : 0); rig.ghostHalo.updateMatrixWorld(true); }
      return rig;
    },
    stats: { bones: boneList.length, tris: pos.length / 9, parts: emitted.length },
    parts: emitted,
    pose: {},
    /** Set the pose from a pose map (docs §1). Missing bones → rest unless reset:false. */
    applyPose(pose = {}, { reset = true, clamp = !!spec.clampLimits, update = true } = {}) {
      for (const name of boneNames) {
        const e2 = entryOf(pose, name);
        const bone = bones[name];
        if (e2?.rot) tripleQuat(info[name].axes, e2.rot, bone.quaternion, clamp ? info[name].limits : null);
        else if (reset) bone.quaternion.identity();
        if (reset) { bone.position.copy(info[name].rest); if (bone.scale.x !== 1 || bone.scale.y !== 1 || bone.scale.z !== 1) bone.scale.set(1, 1, 1); }
      }
      const rp = pose.pos ?? entryOf(pose, rootName)?.pos;
      if (rp) bones[rootName].position.copy(info[rootName].rest).add(new THREE.Vector3(rp[0], rp[1], rp[2]));
      if (reset && stretched.size) { for (const b of stretched) b.userData.lStretch = null; stretched.clear(); }
      let lens = null;
      for (const key in pose) {
        if (key.length < 3 || key[key.length - 2] !== '.') continue;
        const xk = extraKey(key), bone = xk && bones[xk.bone], v = pose[key];
        if (!bone || !Array.isArray(v)) continue;
        if (xk.ch === 's') bone.scale.set(1 + (v[0] ?? 0), 1 + (v[1] ?? 0), 1 + (v[2] ?? 0));
        else if (xk.ch === 'l') (lens ||= []).push([bone, xk.bone, Number(v[0]) || 0]);
        else bone.position.set(info[xk.bone].rest.x + (v[0] ?? 0), info[xk.bone].rest.y + (v[1] ?? 0), info[xk.bone].rest.z + (v[2] ?? 0));
      }
      // (module fix, wave 3: per-key arm reach) '<bone>.l': [k] lengthens the segment by k (fraction) along its rest axis
      // only: thickness unchanged, child joints move out, child bones are NOT stretched (their matrix cancels the
      // parent's stretch: M = T · S⁻¹ · R · S). Replaces the `.s` 1.5-1.95x arm that thickened into a stick + counter-scaled prop.
      if (lens) for (const [bone, name, k] of lens) {
        if (Math.abs(k) < 1e-6) continue;
        const d = info[name].axes.dir, ax = Math.abs(d.x) > 0.5 ? 'x' : Math.abs(d.y) > 0.5 ? 'y' : 'z';
        bone.scale[ax] *= 1 + k;
        bone.userData.lStretch = { ax, k: 1 + k };
        stretched.add(bone);
        for (const c of bone.children) if (c.isBone && !c.userData.lCounter) { c.userData.lCounter = true; c.updateMatrix = counterUpdate; }
      }
      if (rig.ghostHalo) {                    // shared ghost: the halo draws only in ghost level 1 (scale 0 = no triangles)
        if (rig.ghostLevel !== 1) rig.ghostHalo.scale.set(0, 0, 0);
      }
      rig.pose = pose;
      if (update) root.updateMatrixWorld(true);
      return rig;
    },
    /** Set bone quaternions directly ({name: Quaternion}; missing → untouched) and optionally the root offset. */
    setQuaternions(qMap, rootOffset, { update = true } = {}) {
      for (const [name, qq] of Object.entries(qMap)) if (bones[name] && qq?.isQuaternion) bones[name].quaternion.copy(qq);
      const off = rootOffset ?? qMap.pos;
      if (off) bones[rootName].position.copy(info[rootName].rest).add(off);
      if (update) root.updateMatrixWorld(true);
      return rig;
    },
    restPose() { return rig.applyPose({}); },
    dispose() {
      root.parent?.remove(root);
      geo.dispose(); material.dispose?.(); skeleton.dispose();
    },
  };
  rig.restPose();
  return rig;
}

// ─── test helpers ───────────────────────────────────────────────────────────────────────────────────────────────

const ALIAS = { arm: 'upperArm', elbow: 'forearm', fore: 'forearm', leg: 'thigh', knee: 'shin' };

/** Named poses for the biped template (verification + a starting point for clips). */
export const PRESET_POSES = {
  rest: {},
  tpose: { upperArmL: [0, 0, 90], upperArmR: [0, 0, 90] },
  // walk contact: left foot forward, right arm forward; arms swing wide and flat so it reads from every yaw
  walk: {
    pos: [0, -0.02, 0], spine: [4, -6, 0], chest: [2, -8, 0], head: [-4, 12, 0],
    thighL: [32, 0, 0], shinL: [-8, 0, 0], footL: [-14, 0, 0],
    thighR: [-24, 0, 0], shinR: [-28, 0, 0], footR: [18, 0, 0],
    upperArmL: [-30, 0, 8], forearmL: [18, 0, 0], upperArmR: [34, 0, 8], forearmR: [38, 0, 0],
  },
  run: {
    pos: [0, 0.02, 0], spine: [14, -10, 0], chest: [6, -12, 0], head: [-14, 20, 0],
    thighL: [62, 0, 0], shinL: [-70, 0, 0], footL: [10, 0, 0],
    thighR: [-30, 0, 0], shinR: [-60, 0, 0], footR: [30, 0, 0],
    upperArmL: [-45, 0, 14], forearmL: [70, 0, 0], upperArmR: [55, 0, 12], forearmR: [95, 0, 0],
  },
  crouch: {
    pos: [0, -0.17, 0], spine: [22, 0, 0], chest: [12, 0, 0], head: [-26, 0, 0],
    thighL: [75, 0, 12], shinL: [-110, 0, 0], footL: [35, 0, 0],
    thighR: [40, 0, 10], shinR: [-100, 0, 0], footR: [60, 0, 0],
    upperArmL: [30, 0, 18], forearmL: [55, 0, 0], upperArmR: [10, 0, 20], forearmR: [70, 0, 0],
  },
  wave: {
    chest: [0, 0, -4], head: [4, 10, -10], upperArmL: [0, 0, 150], forearmL: [30, 0, 0], handL: [0, 0, 20],
    upperArmR: [10, 0, 6], forearmR: [20, 0, 0], thighR: [0, 0, 6], spine: [0, 0, -3],
  },
  point: {
    chest: [0, 30, 0], spine: [0, 10, 0], head: [0, 20, 0],
    upperArmR: [80, 0, 30], forearmR: [5, 0, 0], upperArmL: [-10, 0, 10], forearmL: [30, 0, 0],
    thighL: [10, 0, 6], thighR: [-6, 0, 4], shinR: [-8, 0, 0],
  },
  cheer: {
    pos: [0, 0.03, 0], head: [-18, 0, 0], chest: [-8, 0, 0],
    upperArmL: [30, 0, 140], forearmL: [20, 0, 0], upperArmR: [30, 0, 140], forearmR: [20, 0, 0],
    thighL: [0, 0, 10], thighR: [0, 0, 10],
  },
  // attack anticipation / contact (for smear tests): wide flat swing of the right arm
  windup: {
    pos: [0, -0.05, 0], spine: [6, 25, 0], chest: [4, 30, 0], head: [0, -35, 0],
    upperArmR: [30, 0, 70], forearmR: [60, 0, 0], upperArmL: [20, 0, 20], forearmL: [50, 0, 0],
    thighL: [30, 0, 8], shinL: [-25, 0, 0], thighR: [-20, 0, 6], shinR: [-20, 0, 0], footR: [15, 0, 0],
  },
  strike: {
    pos: [0, -0.07, 0.04], spine: [14, -30, 0], chest: [8, -35, 0], head: [-8, 40, 0],
    upperArmR: [80, 0, 10], forearmR: [5, 0, 0], upperArmL: [-30, 0, 25], forearmL: [40, 0, 0],
    thighL: [45, 0, 8], shinL: [-30, 0, 0], footL: [-10, 0, 0], thighR: [-30, 0, 6], shinR: [-25, 0, 0], footR: [25, 0, 0],
  },
};

/**
 * Starting poses per body plan (verified on _test-rig turnarounds, default template sizes; scale `pos` with height).
 * Names '<plan>.<pose>'. They are axis references and blocking starts, not finished keys.
 */
export const PLAN_POSES = {
  'upright.vote': { chest: [-4, 0, 6], head: [-10, -14, 0], upperArmR: [35, 0, 150], forearmR: [10, 0, 0], upperArmL: [8, 0, 10], forearmL: [25, 0, 0] },
  'upright.talk': { chest: [4, 10, 0], head: [6, 14, 5], upperArmR: [40, 0, 22], forearmR: [80, 0, 0], handR: [0, -30, 0], jaw: [24, 0, 0], 'mouth.s': [0, 0.8, 0] },
  'upright.blink': { 'eyeL.s': [0, -0.75, 0], 'eyeR.s': [0, -0.75, 0] },
  'upright.die': { pos: [0, -0.33, -0.08], hips: [-84, 0, 0], head: [12, 25, 0], thighL: [8, 0, 8], thighR: [20, 0, -2], shinR: [-30, 0, 0],
    upperArmL: [10, 0, 70], upperArmR: [-10, 0, 60], forearmR: [30, 0, 0], 'eyeL.s': [0, -0.75, 0], 'eyeR.s': [0, -0.75, 0] },
  'quad.vote': { pos: [0, 0.01, 0], chest: [-14, 0, 0], head: [-12, 15, 0], upperArmR: [125, 0, 12], forearmR: [-70, 0, 0], handR: [40, 0, 0] },
  'quad.sit': { pos: [0, -0.1, -0.04], rump: [42, 0, 0], chest: [-22, 0, 0], head: [-6, 0, 0], thighL: [80, 0, 4], thighR: [80, 0, 4],
    shinL: [-120, 0, 0], shinR: [-120, 0, 0], footL: [40, 0, 0], footR: [40, 0, 0], upperArmL: [20, 0, 0], upperArmR: [20, 0, 0], tail0: [40, 0, 0] },
  'quad.die': { pos: [0, -0.35, 0], body: [0, 86, 0], head: [10, 0, 0], thighL: [20, 0, 0], upperArmL: [-20, 0, 0], thighR: [35, 0, 0], upperArmR: [-35, 0, 0],
    'eyeL.s': [0, -0.75, 0], 'eyeR.s': [0, -0.75, 0] },
  'bird.spread': { upperArmL: [0, 0, 85], upperArmR: [0, 0, 85], forearmL: [0, 0, 10], forearmR: [0, 0, 10] },
  'bird.vote': { chest: [0, 0, -6], head: [-10, -15, 0], upperArmR: [10, 0, 160], forearmR: [0, 0, 12] },
  'bird.honk': { body: [12, 0, 0], neck: [30, 0, 0], head: [-28, 0, 0], jaw: [32, 0, 0], upperArmL: [-10, 0, 45], upperArmR: [-10, 0, 45] },
  'bird.waddle': { body: [6, 0, 14], head: [0, 0, -12], thighL: [28, 0, 0], shinL: [-10, 0, 0], thighR: [-22, 0, 0], shinR: [-30, 0, 0], footR: [25, 0, 0], upperArmL: [0, 0, 22], upperArmR: [0, 0, 8] },
  'bird.die': { pos: [0, -0.13, -0.06], body: [-84, 0, 0], head: [20, 30, 0], thighL: [50, 0, 10], thighR: [40, 0, 6], upperArmL: [0, 0, 60], upperArmR: [0, 0, 50],
    'eyeL.s': [0, -0.75, 0], 'eyeR.s': [0, -0.75, 0] },
  'hop.crouch': { pos: [0, -0.025, 0], body: [10, 0, 0], chest: [10, 0, 0], head: [-18, 0, 0] },
  'hop.leap': { pos: [0, 0.12, 0.05], body: [48, 0, 0], chest: [8, 0, 0], head: [-45, 0, 0], thighL: [-95, 0, 0], thighR: [-95, 0, 0], shinL: [70, 0, 0], shinR: [70, 0, 0],
    footL: [70, 0, 0], footR: [70, 0, 0], upperArmL: [55, 0, 0], upperArmR: [55, 0, 0] },
  'hop.vote': { chest: [-8, 0, 4], head: [-14, -10, 0], upperArmR: [20, 0, 150], forearmR: [0, 0, 0] },
  'snail.squash': { 'body.s': [0.135, -0.22, 0.135], 'shell.p': [0, -0.015, 0], neck: [20, 0, 0], head: [-14, 0, 0] },
  'snail.stretch': { 'body.s': [-0.1, 0.24, -0.1], 'shell.p': [0, 0.017, 0], neck: [-12, 0, 0], head: [8, 0, 0] },
  'snail.vote': { front: [-30, 0, 0], neck: [12, 0, 0], head: [-6, 0, 0], stalkR0: [-25, 0, 30] },
  'blob.squash': { 'body.s': [0.135, -0.22, 0.135] },
  'blob.stretch': { 'body.s': [-0.1, 0.24, -0.1], top: [-6, 0, 0] },
  'blob.vote': { top: [0, -8, -10], nubR0: [10, 0, 85] },
  'blob.blink': { 'eyeL.s': [0, -0.75, 0], 'eyeR.s': [0, -0.75, 0] },
  'neck.graze': { chest: [20, 0, 0], neck: [55, 0, 0], neck1: [25, 0, 0], neck2: [20, 0, 0], head: [25, 0, 0] },
  'neck.tall': { neck: [-18, 0, 0], neck1: [-10, 0, 0], neck2: [-6, 0, 0], head: [12, 0, 0] },
};
// the cast's chibi plan is an uprightAnimal: same bones, same starting poses (scale `pos` with height)
for (const [k, v] of Object.entries(PLAN_POSES)) if (k.startsWith('upright.')) PLAN_POSES[`chibi.${k.slice(8)}`] ??= v;

/**
 * Parse a pose string (test scenes): comma/plus separated tokens, each a preset name, `mirror:<preset>`, or
 * `<bone>_<fwd|twist|out><deg>` (bone aliases: arm → upperArm, elbow/fore → forearm, leg → thigh, knee → shin),
 * `pos_<x|y|z><m>`, or `<bone>_<s|p><x|y|z><v>` (extra channels: body_sy-0.3 = squash, eyeL_sy-0.75 = blink).
 * Plan presets are named '<plan>.<pose>' (PLAN_POSES, e.g. 'bird.vote'). Example: 'armL_fwd45,head_twist-30'.
 */
export function parsePose(str) {
  const pose = {};
  if (!str || str === 'rest') return pose;
  for (const tok0 of String(str).split(/[,+ ]/).filter(Boolean)) {
    let tok = tok0;
    let mirror = false;
    if (tok.startsWith('mirror:')) { mirror = true; tok = tok.slice(7); }
    const pre = PRESET_POSES[tok] ?? PLAN_POSES[tok];
    if (pre) { Object.assign(pose, mirror ? mirrorPose(pre) : pre); continue; }
    let mm = /^pos_([xyz])(-?[\d.]+)$/.exec(tok);
    if (mm) { const p = pose.pos ? [...pose.pos] : [0, 0, 0]; p['xyz'.indexOf(mm[1])] = Number(mm[2]); pose.pos = p; continue; }
    mm = /^([A-Za-z0-9]+?)_([sp])([xyz])(-?[\d.]+)$/.exec(tok);
    if (mm) { const key = `${mm[1]}.${mm[2]}`; const v = pose[key] ? [...pose[key]] : [0, 0, 0]; v['xyz'.indexOf(mm[3])] = Number(mm[4]); pose[key] = v; continue; }
    mm = /^([A-Za-z0-9]+?)_(fwd|twist|out)(-?[\d.]+)$/.exec(tok);
    if (!mm) throw new Error(`parsePose: bad token '${tok0}'`);
    let bone = mm[1];
    for (const [a, b] of Object.entries(ALIAS)) if (bone === a + 'L' || bone === a + 'R') bone = b + bone.slice(-1);
    const t = pose[bone] ? [...pose[bone]] : [0, 0, 0];
    t[['fwd', 'twist', 'out'].indexOf(mm[2])] = Number(mm[3]);
    pose[bone] = t;
  }
  return pose;
}
