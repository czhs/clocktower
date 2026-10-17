// life critters (owner: life agent): the town's crows and cats.
//
// DESIGN
//  - Crows (v1 had pigeons on the square; the brief asks for crows: Hollowmere is gothic): a stubby wedge body, a
//    square head with a pale-iron beak and a fan tail, all in the iron ramp (violet-black, cool shadow). ~9x7 texels
//    perched at the gameplay zoom, 20 texels across in flight. Signature read at 640x360: a dark "comma" on a ridge,
//    or a dark V with a body in the air.
//  - Cats: the v1 ginger tabby (paintRamp of v1 FUR #c07a3e, cream chest/socks) and a grey one (stone ramp); sitting
//    upright with the tail wrapped round the feet (the classic cat silhouette: head + ears on a pear), loafing,
//    grooming, walking on 4 legs with the tail up.
//  - Every pose is its own tiny merged geometry (kit solid material, so the town's lines / rims / bands apply) drawn
//    as ONE InstancedMesh per pose: all crows = <= 6 draw calls, all cats <= 4. Poses change on a stepped clock
//    (8 fps wings, 3-frame tail flicks), facings are 45-degree stops, positions are texel-snapped (snapLocal).
//  - Behaviour is a SCHEDULE computed at build from the known event list (bell strikes, the hound, walkers): perched
//    segments and flights; at render time the crow's state is a lookup of t (pure f(t)).
import * as THREE from 'three';
import { Builder, kitMaterial, M } from '../kit.js';
import { TOWN_PALETTE as PAL, paintRamp } from '../palette.js';
import { hash, step, clamp, TAU, quantAngle, snapLocal, lerp } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------------------------------------ crow geometry
// art-director round: the near-black iron sh mid made crows featureless smudges at gameplay. Now iron mid (lit back),
// a DARK-VIOLET mid (plum sh) and iron sh in shadow; an amber beak (brass mid) and a 1-px cream eye make the head read.
const IRON = [PAL.iron[1], PAL.plum[2], PAL.iron[2]];
const BEAK = [PAL.brass[0], PAL.brass[1], PAL.brass[2]];
const EYE = PAL.cream[0];

function crowBody(b, { tilt = 0.12, headDy = 0, headDz = 0, tailUp = 0.0, crouch = 0 } = {}) {
  // local: facing +z, feet at y 0. body as a hexa (chest high, back low), rotated by `tilt` about x (nose up +)
  b.push(M({ at: [0, 0.07 - crouch, 0], rx: -tilt }));
  const c = [];
  // index = x + 2y + 4z bits
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? 1 : -1, y = i & 2 ? 1 : 0, z = i & 4 ? 1 : 0;
    const zz = z ? 0.1 : -0.12;
    const w = z ? 0.068 : 0.05;
    const yy = y ? (z ? 0.15 : 0.12) : (z ? 0.02 : 0.04);
    c.push(V(x * w, yy, zz));
  }
  b.hexa(c, { tones: IRON });
  // tail fan
  b.hexa([V(-0.04, 0.085, -0.1), V(0.04, 0.085, -0.1), V(-0.04, 0.115, -0.1), V(0.04, 0.115, -0.1),
    V(-0.065, 0.05 + tailUp, -0.27), V(0.065, 0.05 + tailUp, -0.27), V(-0.065, 0.08 + tailUp, -0.27), V(0.065, 0.08 + tailUp, -0.27)], { tones: IRON, tint: 0.96 });
  // head + beak
  b.box(0.11, 0.1, 0.11, { tones: IRON, at: [0, 0.135 + headDy, 0.11 + headDz] });
  b.hexa([V(-0.028, 0.155 + headDy, 0.16 + headDz), V(0.028, 0.155 + headDy, 0.16 + headDz), V(-0.028, 0.2 + headDy, 0.16 + headDz), V(0.028, 0.2 + headDy, 0.16 + headDz),
    V(-0.018, 0.16 + headDy, 0.25 + headDz), V(0.018, 0.16 + headDy, 0.25 + headDz), V(-0.018, 0.182 + headDy, 0.25 + headDz), V(0.018, 0.182 + headDy, 0.25 + headDz)], { tones: BEAK });
  // eyes: a 1-texel cream dot on each side of the head (proud of the head box by 5 mm: no coplanar faces)
  for (const sx of [-1, 1]) b.box(0.012, 0.028, 0.028, { tones: [EYE, EYE, PAL.cream[1]], at: [sx * 0.058, 0.165 + headDy, 0.14 + headDz] });
  b.pop();
  // legs (2 texels, so they never flicker)
  if (crouch < 0.03) for (const sx of [-1, 1]) b.box(0.05, 0.08, 0.05, { tones: IRON, tint: 0.92, at: [sx * 0.035, -0.005, 0.0] });
}
function crowWings(b, tipY, { span = 0.32, sweep = -0.04 } = {}) {
  for (const sx of [-1, 1]) {
    const r0 = 0.05, r1 = span;
    const ry = 0.14;
    // 8 corners: inner edge (x = r0) chord z -0.07..0.07, outer (x = r1) chord shorter + swept back
    const c = [];
    for (let i = 0; i < 8; i++) {
      const outer = i & 1, top = i & 2, front = i & 4;
      const x = sx * (outer ? r1 : r0);
      const y = (outer ? ry + tipY : ry) + (top ? 0.05 : 0);            // 2 texels thick: never a 1-px plank
      const z = outer ? (front ? 0.06 + sweep : -0.09 + sweep) : (front ? 0.09 : -0.1);
      c.push(V(x, y, z));
    }
    b.hexa(c, { tones: IRON, tint: 0.98 });
    // primaries: a notched tip (one more small plate)
    const tipC = [];
    for (let i = 0; i < 8; i++) {
      const outer = i & 1, top = i & 2, front = i & 4;
      const x = sx * (outer ? r1 + 0.08 : r1 - 0.01);
      const y = (outer ? ry + tipY * 1.3 : ry + tipY) + (top ? 0.05 : 0);
      const z = outer ? (front ? 0.02 + sweep * 2 : -0.09 + sweep * 2) : (front ? 0.06 + sweep : -0.09 + sweep);
      tipC.push(V(x, y, z));
    }
    b.hexa(tipC, { tones: IRON, tint: 0.94 });
  }
}

export const CROW_POSES = ['perch', 'peck', 'crouch', 'up', 'mid', 'down', 'look', 'bob'];
function crowPoseGeometry(engine, pose) {
  const b = new Builder(engine, { name: `crow-${pose}` });
  if (pose === 'perch') crowBody(b, {});
  else if (pose === 'look') crowBody(b, { tilt: 0.2, headDy: 0.015, tailUp: -0.02 });
  else if (pose === 'bob') crowBody(b, { tilt: 0.02, headDy: -0.03, headDz: 0.035, tailUp: 0.02 });   // head-bob drawing B
  else if (pose === 'peck') crowBody(b, { tilt: -0.5, headDy: -0.06, headDz: 0.03, tailUp: 0.06 });
  else if (pose === 'crouch') crowBody(b, { tilt: 0.05, crouch: 0.035, tailUp: 0.03 });
  else {
    // flying: body level, legs tucked (crouch flag drops the legs), wings by pose
    // wings always in a DIHEDRAL (a V seen from any side; a level 'mid' read as a '+' cross): up steep, mid ~35 deg,
    // down only just below level; a wedge tail (tailUp) keeps the comma
    crowBody(b, { tilt: 0.0, crouch: 0.04, tailUp: 0.02 });
    // (art-director round) the 'down' drawing (tips just below level) read as a flat '+' at night: every drawing now
    // keeps a clear V (down 0.13, mid 0.22, up 0.34) and the wings sweep back (an arrow / comma, not a cross)
    crowWings(b, pose === 'up' ? 0.34 : pose === 'mid' ? 0.22 : 0.13, { sweep: pose === 'mid' ? -0.07 : -0.1 });
  }
  const g = b.build({ name: `crow-${pose}` });
  const mesh = g.children[0];
  return mesh.geometry;
}

// ------------------------------------------------------------------------------------------------ cat geometry
const GINGER = paintRamp('#c07a3e', { lightness: 0.5 });   // v1 FUR base, lifted to the town's noon range
const GREY = 'stone';

function catPose(b, pose, fur) {
  const cream = 'cream';
  const sock = { tones: cream, tint: 0.98 };
  const eye = PAL.flowerYellow;
  if (pose.startsWith('sit') || pose === 'groom') {
    // haunches + upright chest (a pear), tail wrapped round the front feet
    b.hexa([V(-0.11, 0.0, -0.12), V(0.11, 0.0, -0.12), V(-0.08, 0.2, -0.07), V(0.08, 0.2, -0.07),
      V(-0.1, 0.0, 0.09), V(0.1, 0.0, 0.09), V(-0.065, 0.24, 0.04), V(0.065, 0.24, 0.04)], { tones: fur });
    b.box(0.1, 0.14, 0.05, { tones: cream, at: [0, 0.07, 0.085] });                        // chest bib
    for (const sx of [-1, 1]) b.box(0.05, 0.05, 0.06, { ...sock, at: [sx * 0.04, 0.0, 0.11] });   // front paws
    const groom = pose === 'groom';
    const hy = groom ? 0.2 : 0.25, hz = groom ? 0.1 : 0.04;
    b.push(M({ at: [0, hy, hz], rx: groom ? 0.5 : 0 }));
    b.box(0.16, 0.12, 0.13, { tones: fur });                                               // head
    for (const sx of [-1, 1]) b.hexa([V(sx * 0.03, 0.115, -0.03), V(sx * 0.075, 0.115, -0.03), V(sx * 0.03, 0.115, 0.03), V(sx * 0.075, 0.115, 0.03),
      V(sx * 0.055, 0.185, 0.0), V(sx * 0.06, 0.185, 0.0), V(sx * 0.055, 0.185, 0.005), V(sx * 0.06, 0.185, 0.005)], { tones: fur, tint: 1.04 });  // ears
    if (!groom) {
      for (const sx of [-1, 1]) b.box(0.04, 0.035, 0.02, { tones: eye, at: [sx * 0.04, 0.05, 0.066] });   // eyes
      b.box(0.06, 0.04, 0.04, { tones: cream, at: [0, 0.01, 0.07] });                      // muzzle
    }
    b.pop();
    if (groom) b.box(0.05, 0.12, 0.05, { ...sock, at: [0.035, 0.13, 0.14] });              // raised paw
    // tail: 3 segments; pose variants: sitA wrapped, sitB tip up, sitC flick out
    const tail = pose === 'sitB' ? [[0.1, 0.02, -0.08], [0.15, 0.06, 0.0], [0.15, 0.13, 0.05]]
      : pose === 'sitC' ? [[0.1, 0.02, -0.1], [0.19, 0.04, -0.12], [0.26, 0.09, -0.1]]
        : [[0.1, 0.02, -0.06], [0.11, 0.02, 0.05], [0.04, 0.02, 0.14]];
    let p = V(0.06, 0.03, -0.11);
    for (let i = 0; i < tail.length; i++) {
      const q = V(...tail[i]);
      const mid = p.clone().add(q).multiplyScalar(0.5), len = p.distanceTo(q) + 0.04;
      const yaw = Math.atan2(q.x - p.x, q.z - p.z), pitch = -Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z));
      b.push(M({ at: [mid.x, mid.y, mid.z], ry: yaw, rx: pitch }));
      b.box(0.055, 0.055, len, { tones: i === tail.length - 1 ? cream : fur, tint: i === tail.length - 1 ? 0.98 : 0.96, origin: 'center' });
      b.pop();
      p = q;
    }
  } else if (pose === 'loaf') {
    b.hexa([V(-0.11, 0.0, -0.17), V(0.11, 0.0, -0.17), V(-0.09, 0.15, -0.15), V(0.09, 0.15, -0.15),
      V(-0.11, 0.0, 0.1), V(0.11, 0.0, 0.1), V(-0.09, 0.16, 0.08), V(0.09, 0.16, 0.08)], { tones: fur });
    b.box(0.16, 0.12, 0.13, { tones: fur, at: [0, 0.12, 0.1] });
    for (const sx of [-1, 1]) b.hexa([V(sx * 0.03, 0.235, 0.07), V(sx * 0.075, 0.235, 0.07), V(sx * 0.03, 0.235, 0.13), V(sx * 0.075, 0.235, 0.13),
      V(sx * 0.055, 0.3, 0.1), V(sx * 0.06, 0.3, 0.1), V(sx * 0.055, 0.3, 0.105), V(sx * 0.06, 0.3, 0.105)], { tones: fur, tint: 1.04 });
    for (const sx of [-1, 1]) b.box(0.04, 0.02, 0.02, { tones: PAL.cream[2], at: [sx * 0.04, 0.17, 0.166] });   // eyes shut (sleepy)
    b.box(0.055, 0.055, 0.3, { tones: fur, tint: 0.96, at: [0.12, 0.0, -0.02] });          // tail along the side
  } else {
    // walk / stand: body horizontal on 4 legs, tail up in a hook
    const f = pose === 'walkB' ? 1 : 0;
    b.hexa([V(-0.085, 0.13, -0.17), V(0.085, 0.13, -0.17), V(-0.08, 0.27, -0.17), V(0.08, 0.27, -0.17),
      V(-0.085, 0.13, 0.13), V(0.085, 0.13, 0.13), V(-0.08, 0.28, 0.13), V(0.08, 0.28, 0.13)], { tones: fur });
    b.box(0.09, 0.08, 0.04, { tones: cream, at: [0, 0.14, 0.14] });
    const legs = [[0.05, 0.1], [-0.05, 0.1], [0.05, -0.13], [-0.05, -0.13]];
    legs.forEach(([lx, lz], i) => {
      const swing = ((i === 0 || i === 3) ? 1 : -1) * (f ? 1 : -1) * 0.035;
      b.box(0.05, 0.14, 0.055, { tones: i < 2 ? cream : fur, tint: 0.97, at: [lx, 0.0, lz + swing] });
    });
    b.box(0.15, 0.12, 0.13, { tones: fur, at: [0, 0.27, 0.17] });                           // head forward
    for (const sx of [-1, 1]) b.hexa([V(sx * 0.03, 0.385, 0.14), V(sx * 0.07, 0.385, 0.14), V(sx * 0.03, 0.385, 0.2), V(sx * 0.07, 0.385, 0.2),
      V(sx * 0.05, 0.45, 0.17), V(sx * 0.055, 0.45, 0.17), V(sx * 0.05, 0.45, 0.175), V(sx * 0.055, 0.45, 0.175)], { tones: fur, tint: 1.04 });
    for (const sx of [-1, 1]) b.box(0.035, 0.035, 0.02, { tones: eye, at: [sx * 0.04, 0.32, 0.236] });
    b.box(0.055, 0.2, 0.055, { tones: fur, tint: 0.96, at: [0, 0.25, -0.19 - f * 0.01] });  // tail up
    b.box(0.055, 0.055, 0.1, { tones: cream, at: [0, 0.43, -0.16 + (f ? 0.02 : 0)] });       // hooked tip
  }
}
export const CAT_POSES = ['sitA', 'sitB', 'sitC', 'groom', 'loaf', 'walkA', 'walkB'];

// ------------------------------------------------------------------------------------------------ instanced pose sets
/** One InstancedMesh per pose geometry (kit solid material: life's own instance of it, see below). */
export function poseSet(engine, group, geoms, max, name, scale = 1) {
  // (perf) the instanced figures get their OWN copy of the kit solid material ('solid-life': the same shader, options
  // and uniforms): three keeps one program per material, and an InstancedMesh needs the instancing variant, so sharing
  // the town's material made three switch + re-derive (getProgram: parameters + cache key) its program on every
  // instanced <-> plain transition in the depth-sorted draw list (~18 per frame). ?rtopt=0: the shared one (A/B).
  const own = engine.params?.get?.('rtopt') !== '0';
  const mat = kitMaterial(engine, own ? 'solid-life' : 'solid');
  const meshes = {};
  for (const [pose, g] of Object.entries(geoms)) {
    const m = new THREE.InstancedMesh(g, mat, max);
    m.name = `${name}-${pose}`;
    m.count = 0; m.visible = false;
    m.castShadow = true; m.receiveShadow = true;
    m.frustumCulled = false;
    group.add(m);
    meshes[pose] = m;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1).multiplyScalar(scale), up = V(0, 1, 0);
  const list = Object.values(meshes), dirty = new Set();
  return {
    meshes,
    begin() { for (const m of list) m.count = 0; },
    put(pose, pos, yaw) {
      const m = meshes[pose]; if (!m || m.count >= max) return;
      _q.setFromAxisAngle(up, yaw);
      _m.compose(pos, _q, _s);
      // (perf) upload the instance buffer only when a matrix really changed (most frames every figure holds)
      const a = m.instanceMatrix.array, o = m.count * 16, e = _m.elements;
      for (let k = 0; k < 16; k++) if (a[o + k] !== e[k]) { _m.toArray(a, o); dirty.add(m); break; }
      m.count++;
    },
    // warm (the first frame): every pose mesh draws one instance far below the ground, so all shader variants
    // (colour, normal, shadow depth) compile in frame 0 and the program count never changes later
    end(warm = false) {
      for (const m of list) {
        if (warm && m.count === 0) { _m.makeTranslation(0, -200, 0); m.setMatrixAt(m.count++, _m); dirty.add(m); }
        m.visible = m.count > 0;
        if (m.count !== m.userData.lastCount) { m.userData.lastCount = m.count; dirty.add(m); }
        if (dirty.has(m)) { m.instanceMatrix.needsUpdate = true; }
      }
      dirty.clear();
    },
  };
}

// ------------------------------------------------------------------------------------------------ crow schedule
/**
 * Build the crows. perches: [{pos, ground?: bool, tag}] (layout space); scares: [{t, pos, r, kind}] sorted by t;
 * opts: {count, seed, horizon (s), walkerAt(t) -> [Vector3] for ground-crow flushing}.
 */
export function createCrows(engine, group, perches, scares, { count = 8, seed = 7, horizon = 240, startAt = null, walkerAt = null, restless = true } = {}) {
  const geoms = Object.fromEntries(CROW_POSES.map((p) => [p, crowPoseGeometry(engine, p)]));
  const set = poseSet(engine, group, geoms, count, 'crow', 1.3);
  const N = perches.length;
  if (!N) return { update() {}, crows: [], set };
  // perch reservations to keep one crow per perch
  const busy = perches.map(() => []);
  const free = (j, t0, t1) => busy[j].every(([a, b]) => t1 <= a || t0 >= b);
  const crows = [];
  for (let i = 0; i < count; i++) {
    let j = startAt ? startAt[i % startAt.length] : Math.floor(hash(seed, i, 1) * N);
    let tries = 0; while (busy[j].length && tries++ < N) j = (j + 1) % N;
    const segs = [];
    let t = 0;
    let guard = 0;
    while (t < horizon && guard++ < 200) {
      const P = perches[j];
      // when does this crow leave perch j? spontaneous restlessness, or the first scare that reaches it
      // (roosting at night: restless = false, a crow only leaves when scared)
      let leave = restless ? t + 7 + 14 * hash(seed, i, 100 + segs.length) : horizon + 1;
      let scare = null;
      for (const s of scares) {
        if (s.t < t + 0.4 || s.t > leave) continue;
        if (s.pos.distanceTo(P.pos) <= s.r && (!s.ground || P.ground)) { scare = s; leave = s.t + 0.06 + 0.35 * hash(seed, i, 7 + segs.length); break; }
      }
      // ground crows are flushed by walkers passing close by
      if (P.ground && walkerAt) {
        for (let tt = t + 0.5; tt < leave; tt += 0.2) {
          if (walkerAt(tt).some((w) => w.distanceTo(P.pos) < 1.3)) { leave = tt + 0.05; scare = { kind: 'walker', pos: P.pos }; break; }
        }
      }
      // perched facings: the 6 stops that show a profile or a 3/4 view (+-45, +-90, +-135 deg), never 0 / 180
      const YAWS = [1, 2, 3, 5, 6, 7];
      segs.push({ kind: 'perch', j, t0: t, t1: leave, yaw: YAWS[Math.floor(hash(seed, i, 200 + segs.length) * 6)] * (TAU / 8) });
      busy[j].push([t, leave]);
      // pick a destination: scared crows go far and high (roofs / tower), restless ones nearby
      const cand = [];
      for (let k = 0; k < N; k++) {
        if (k === j) continue;
        const d = perches[k].pos.distanceTo(P.pos);
        if (scare && scare.kind !== 'walker' && perches[k].pos.distanceTo(scare.pos) < Math.min(scare.r * 0.6, 7)) continue;
        if (scare && perches[k].ground && scare.kind !== 'walker') continue;
        if (d < 2 || d > (scare ? 26 : 14)) continue;
        cand.push(k);
      }
      if (!cand.length) { t = leave + 2; continue; }
      let k = cand[Math.floor(hash(seed, i, 300 + segs.length) * cand.length)];
      const Q = perches[k];
      const dist = Q.pos.distanceTo(P.pos);
      const dur = 0.9 + dist / 4.2 + (scare && scare.circle ? 2.2 : 0);
      let tries2 = 0; while (!free(k, leave + dur, leave + dur + 3) && tries2++ < cand.length) k = cand[(cand.indexOf(k) + 1) % cand.length];
      const Qk = perches[k];
      // circling scatter: fly out round a waypoint above / beside the scare origin
      let via = null;
      if (scare && scare.circle) {
        const a = hash(seed, i, 400) * TAU;
        via = scare.pos.clone().add(V(Math.cos(a) * 3.5, 2.5 + hash(seed, i, 401) * 2, Math.sin(a) * 2.5));
      }
      segs.push({ kind: 'fly', from: P.pos.clone(), to: Qk.pos.clone(), via, t0: leave, t1: leave + dur, scared: !!scare });
      t = leave + dur; j = k;
    }
    crows.push({ segs, i });
  }

  const tmp = V(0, 0, 0), snapped = V(0, 0, 0);
  const bez = (a, b, c, u, out) => out.set(
    (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * b.x + u * u * c.x,
    (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * b.y + u * u * c.y,
    (1 - u) * (1 - u) * a.z + 2 * (1 - u) * u * b.z + u * u * c.z);
  // (perf) one reused result object (the caller consumes it at once) and a cached segment index per crow
  const R = { pose: 'perch', pos: null, yaw: 0 };
  const ret = (pose, pos, yaw) => { R.pose = pose; R.pos = pos; R.yaw = yaw; return R; };
  function segAt(c, t) {
    const S = c.segs, n = S.length;
    let i = c._i ?? 0;
    if (i >= n) i = 0;
    if (!(t >= S[i].t0 && t < S[i].t1)) {
      // the same segment segs.find(t0 <= t < t1) returns: scan from the cached one, then from 0 (gaps / jumps)
      let k = -1;
      for (let j = i; j < n; j++) if (t >= S[j].t0 && t < S[j].t1) { k = j; break; }
      if (k < 0) for (let j = 0; j < i; j++) if (t >= S[j].t0 && t < S[j].t1) { k = j; break; }
      if (k < 0) return S[n - 1];
      i = k;
    }
    c._i = i;
    return S[i];
  }
  function stateAt(c, t) {
    const s = segAt(c, t);
    if (s.kind === 'perch') {
      const P = perches[s.j];
      const local = t - s.t0;
      // last 0.25 s before take-off: crouch (anticipation)
      if (s.t1 - t < 0.25) return ret('crouch', P.pos, s.yaw);
      // first 0.25 s after landing: wings-up flare then settle (handled in fly), then idle micro-actions
      const beat = Math.floor((local + hash(c.i, s.j) * 2) / 1.6);
      const h = hash(c.i, beat, 31 + s.j);
      const inBeat = (local + hash(c.i, s.j) * 2) - beat * 1.6;
      let yaw = s.yaw + quantAngle((Math.floor(hash(c.i, Math.floor(beat / 2), 41) * 3) - 1) * (TAU / 8));
      // never head-on / tail-on to the gameplay camera (the body, tail fan and head stack into a '+'): keep diagonals / profiles
      if (Math.abs(Math.sin(yaw)) < 0.3) yaw = s.yaw;
      let pose = 'perch', pos = P.pos, dy = 0;
      const f4 = Math.floor(step(inBeat, 4) * 4 + 1e-6) % 2;                                   // 2-drawing clock, 4 fps
      if (P.ground && h < 0.55 && inBeat < 1.0) pose = f4 ? 'perch' : 'peck';                   // peck-peck (4 fps)
      else if (h > 0.84 && inBeat < 0.25) { pose = 'crouch'; }
      else if (h > 0.84 && inBeat < 0.5) { pose = 'perch'; dy = 0.07; }                        // a little hop
      else if (h > 0.66 && inBeat < 0.75) pose = 'look';
      else if (inBeat < 1.0) pose = f4 ? 'perch' : 'bob';                                       // head-bob (4 fps)
      if (dy) { tmp.copy(pos); tmp.y += dy; pos = tmp; }
      return ret(pose, pos, yaw);
    }
    const u = clamp((t - s.t0) / (s.t1 - s.t0));
    const a = s.from, b = s.to;
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    let pose;
    if (s.via) {
      // two quadratic halves through the waypoint
      if (u < 0.5) bez(a, a.clone().lerp(s.via, 0.5).setY(s.via.y), s.via, u * 2, tmp);
      else bez(s.via, s.via.clone().lerp(b, 0.5).setY(s.via.y + 0.5), b, (u - 0.5) * 2, tmp);
    } else {
      tmp.lerpVectors(a, b, u);
      tmp.y += (0.8 + 0.1 * dist) * 4 * u * (1 - u);
    }
    // facing: 8-direction travel heading (sampled a little ahead)
    const ua = Math.min(1, u + 0.04);
    const ahead = s.via ? null : V(lerp(a.x, b.x, ua), 0, lerp(a.z, b.z, ua));
    const dx = s.via ? (u < 0.5 ? s.via.x - a.x : b.x - s.via.x) : ahead.x - tmp.x;
    const dz = s.via ? (u < 0.5 ? s.via.z - a.z : b.z - s.via.z) : ahead.z - tmp.z;
    let yaw = quantAngle(Math.atan2(dx, dz));
    // a pure side view (yaw +-90 deg) collapses the dihedral: the near wing projects onto the body and the far one
    // stands up as a column. Flying crows bank to the nearest diagonal instead (a V / comma at every heading).
    const side = Math.abs(Math.abs(Math.sin(yaw)) - 1) < 1e-3;
    if (side) yaw += (Math.cos(Math.atan2(dx, dz)) >= 0 ? -1 : 1) * Math.sign(Math.sin(yaw)) * (TAU / 8);
    const fl = Math.floor((t - s.t0) * 8);
    if (u > 0.86) pose = fl % 2 ? 'up' : 'mid';                         // landing: backwing flare
    else if (u < 0.38 || (s.scared && u < 0.6)) pose = ['up', 'mid', 'down', 'mid'][fl % 4];   // climbing: flap hard
    else pose = Math.floor((t - s.t0) * 2.5) % 3 === 0 ? ['up', 'mid', 'down', 'mid'][fl % 4] : 'mid';   // glide + bursts
    return ret(pose, tmp, yaw);
  }
  return {
    crows, set, perches,
    update(t, rootOffset, warm = false) {
      set.begin();
      for (const c of crows) {
        const s = stateAt(c, t);
        set.put(s.pose, snapLocal(engine, rootOffset, s.pos, snapped), s.yaw);
      }
      set.end(warm);
    },
  };
}

// ------------------------------------------------------------------------------------------------ cats
/**
 * Cats with scripted routines. cats: [{fur: 'ginger'|'grey'|'sandy', script: [{t, pose|walk:[from, to], yaw}]}] where each
 * key holds from its t; walk keys move from `from` to `to` over [t, next t] in walkA/walkB steps (6 fps), facing the
 * path. Or {fur, fn(t) -> {pose, pos, yaw}}: a cat driven by the caller (the child-and-cat chase).
 */
export function createCats(engine, group, cats) {
  const geoms = {};
  const FURS = { ginger: GINGER, grey: GREY, sandy: 'thatch' };
  const furs = [...new Set(cats.map((c) => c.fur))];
  for (const fur of furs) for (const p of CAT_POSES) {
    const b = new Builder(engine, { name: `cat-${fur}-${p}` });
    catPose(b, p, FURS[fur] ?? GREY);
    geoms[`${fur}-${p}`] = b.build().children[0].geometry;
  }
  const set = poseSet(engine, group, geoms, 4, 'cat');
  const snapped = V(0, 0, 0), tmp = V(0, 0, 0);
  // (perf) '<fur>-<pose>' mesh keys built once (a template string per cat per frame before)
  const keyOf = Object.fromEntries(furs.map((f) => [f, Object.fromEntries(CAT_POSES.map((p) => [p, `${f}-${p}`]))]));
  const R = { pose: 'sitA', pos: null, yaw: 0 };
  const ret = (pose, pos, yaw) => { R.pose = pose; R.pos = pos; R.yaw = yaw; return R; };
  function stateAt(cat, t) {
    if (cat.fn) return cat.fn(t);                                       // a driven cat (the chase): {pose, pos, yaw}
    const sc = cat.script;
    let i = 0; while (i + 1 < sc.length && t >= sc[i + 1].t) i++;
    const k = sc[i], next = sc[i + 1];
    if (k.walk) {
      const [a, b] = k.walk;
      const dur = (next?.t ?? k.t + 4) - k.t;
      const u = clamp((t - k.t) / dur);
      const us = step(u * dur, 6) / dur;                               // stepped trot
      tmp.lerpVectors(a, b, clamp(us));
      const yaw = quantAngle(Math.atan2(b.x - a.x, b.z - a.z));
      return ret(Math.floor((t - k.t) * 6) % 2 ? 'walkA' : 'walkB', tmp, yaw);
    }
    // sitting: tail flick cycle on a 3-pose stepped clock, occasional groom / look
    let pose = k.pose ?? 'sitA';
    if (pose === 'sit') {
      const beat = Math.floor((t - k.t) / 2.2), inB = (t - k.t) - beat * 2.2, h = hash(cat.seed, beat);
      pose = inB < 0.5 && h > 0.35 ? (inB < 0.17 ? 'sitB' : inB < 0.34 ? 'sitC' : 'sitB') : 'sitA';
      if (h < 0.18 && inB > 0.6) pose = Math.floor(inB * 4) % 2 ? 'groom' : 'sitA';
    }
    let yaw = k.yaw ?? 0;
    if (k.look) {                                                      // head-turn: whole cat turns 45 deg stops
      const lb = Math.floor((t - k.t) / 3.1);
      yaw += quantAngle((Math.floor(hash(cat.seed, lb, 9) * 3) - 1) * (TAU / 8));
    }
    return ret(pose, k.at, yaw);
  }
  return {
    set,
    update(t, rootOffset, warm = false) {
      set.begin();
      for (const c of cats) {
        const s = stateAt(c, t);
        set.put(keyOf[c.fur]?.[s.pose] ?? `${c.fur}-${s.pose}`, snapLocal(engine, rootOffset, s.pos, snapped), s.yaw);
      }
      set.end(warm);
    },
  };
}
