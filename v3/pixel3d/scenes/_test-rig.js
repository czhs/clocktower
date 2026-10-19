// Rig test scene (rig owner). A character from characters/<char>.js on a flat meadow at noon.
//   ?char=mannequin   characters/<name>.js (default export = spec)
//   &pose=<pose>      preset (rest|tpose|walk|run|crouch|wave|point|cheer|windup|strike|mirror:<preset>) or tokens
//                     '<bone>_<fwd|twist|out><deg>' joined by ',' (aliases armL/elbowL/legL/kneeL), e.g. armL_fwd45
//   &poses=a;b;c      one character per pose in a row (all facing `face`)
//   &grid=1           8 facings (0,45,…,315° world yaw, left → right) in a row = turnaround
//   &face=<deg>       character world yaw (0 = facing +Z; + turns it to its left). Default 0.
//   &yaw=<deg>        camera yaw (default −45 → a character at face 0 shows a 3/4 front view, lit side to the right)
//   &vh=<m>           viewHeight (default 10 = 36 px/m, the character reference zoom)
//   &tod=noon|golden|morning|night   &sockets=1 (tiny markers on the sockets)   &gap=<m> spacing in a row
//   built-in: char=_kit (every kit shape), _quad (quadruped template), _chains (cape/ear/tail chains + blend)
//   char=_plan&plan=<biped|chibi|upright|quadruped|longneck|bird|moth|hopper|limbless|blob>  body-plan blockout
//            (characters/mannequin.js makePlan; slots from the template meta) &popts=<json template opts>
//            &face=1 (brow/mouth parts) &blockout=1 (bbox boxes). Plan presets: pose=bird.vote etc. (rig PLAN_POSES)
//   &gait=game        GAME-SPEED travel demo (rig owner): the character crosses the screen at GAME_SPEED (3.95 body
//                     heights/s, 0.31 s cycle) with a stride-wheel footfall per meta.gaits[&g=<name>] and 2-bone IK
//                     per meta.legs, drawings held cycle/&drawings (4) — legs exact at drawing frames (legIK 'pose').
//                     &rootStep=1 moves the root only at drawing frames (stop-motion travel); &tc=<s> time it passes
//                     the centre (default 1); &travel=right|toward. Stats: engine.stats.rig.gait {slide (texels, max
//                     planted-foot drift between consecutive drawing frames), clamp (IK reach clamps), gs (planGameSpeed)}
//   &height= &heads= &legs= &arms= &shoulders= &hips=  proportions (characters exporting make(opts), e.g. mannequin)
//   &look=0 skips updateLook (no far-half shadow)
//   &bg=meadow|plain  &relAz=<deg> sun azimuth  &clouds=1 (cloud shadows, off by default)
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { toonMesh, rampFromTones } from '../src/materials/toon.js';
import { buildCharacter, parsePose, quadruped, biped, planGameSpeed, squashPose, PLAN_POSES } from '../src/chars/rig.js';
import { solveTwoBone } from '../src/chars/ik.js';
import { foot as strideFoot } from '../src/chars/locomotion.js';
import * as K from '../src/chars/kit.js';
import { updateLook } from '../src/chars/look.js';

// Built-in test specs (names start with '_'): '_kit' = every kit shape on one bone (winding / flat normals check),
// '_quad' = quadruped() template blockout (axis check), '_chains' = biped + cape/ear/tail chains with blend.
const PAL = { a: ['#F2D9A6', '#C9A26B', '#7A6070'], b: ['#9FC3E0', '#6A8FB8', '#475077'], c: ['#F0A7A0', '#C86F6A', '#7C4560'] };
function testSpec(name) {
  if (name === '_kit') {
    const shapes = [
      K.box(0.3, 0.3, 0.3), K.chamferBox(0.32, 0.3, 0.32, 0.35, { top: 0.05, bottom: 0.03 }), K.frustum(4, 0.2, 0.12, 0.35),
      K.frustum(0.2, 0.06, 0.35, 6), K.prism(8, 0.17, 0.3), K.wedge(0.3, 0.3, 0.35), K.lathe([[0.18, 0], [0.2, 0.1], [0.12, 0.25], [0, 0.4]], 6),
      K.hull([[0, 0, 0], [0.3, 0, 0.05], [0.1, 0.35, 0], [0.15, 0.1, 0.3], [0.05, 0.05, -0.15]]),
      K.extrude([[-0.15, 0], [0.15, 0], [0.05, 0.12], [0.18, 0.35], [-0.05, 0.2], [-0.15, 0.3]], 0.08),
      K.extrude([[0, 0], [0.12, 0.05], [0.3, 0.35], [0.02, 0.15]], 0.06, { axis: 'x' }),
      K.bend(K.box(0.4, 0.5, 0.06, { segY: 4 }), { taper: [0.8, 1.3], bend: 50, flare: 0.05 }),
      K.mirrorX(K.wedge(0.3, 0.3, 0.35, { top: 'front' })),
      K.merge(K.xf(K.box(0.12, 0.3, 0.12), { at: [-0.08, 0, 0], rot: [0, 0, 20] }), K.xf(K.wedge(0.25, 0.2, 0.2), { at: [0.08, 0, 0], scale: [-1, 1, 1] })),
    ];
    const parts = shapes.map((g, i) => ({ bone: 'root', shape: g, at: [((i % 6) - 2.5) * 0.5, 0.25, Math.floor(i / 6) * -0.6 + 0.3], color: 'abc'[i % 3] }));
    return { name: '_kit', height: 0.6, palette: PAL, skeleton: [{ name: 'root', pos: [0, 0, 0] }], parts };
  }
  if (name === '_quad') {
    const S = quadruped({ height: 0.8, length: 0.9 });
    const m = S.meta;
    const parts = [
      { bone: 'hips', shape: K.chamferBox(0.36, 0.3, 0.4, 0.3), at: [0, 0.02, 0.1], color: 'a' },
      { bone: 'spine', shape: K.box(0.34, 0.28, 0.42), at: [0, 0.0, 0.2], color: 'a' },
      { bone: 'chest', shape: K.chamferBox(0.38, 0.34, 0.3, 0.3), at: [0, 0.02, 0.05], color: 'a' },
      { bone: 'neck', shape: K.box(0.16, 0.26, 0.16), at: [0, 0.1, 0.05], rot: [35, 0, 0], color: 'a' },
      { bone: 'head', shape: K.chamferBox(0.24, 0.2, 0.34, 0.4), at: [0, 0.02, 0.12], color: 'c' },
      { bone: 'earL0', shape: K.frustum(4, 0.06, 0.02, 0.14), at: [0, 0.06, 0], color: 'b', mirror: true },
      { bone: 'thighL', shape: K.box(0.12, m.leg * 0.5, 0.14), at: [0, -m.leg * 0.22, 0], color: 'b', mirror: true },
      { bone: 'shinL', shape: K.box(0.09, m.leg * 0.45, 0.1), at: [0, -m.leg * 0.2, 0], color: 'b', mirror: true },
      { bone: 'footL', shape: K.box(0.1, 0.06, 0.14), at: [0, -0.03, 0.04], color: 'c', mirror: true },
      { bone: 'upperArmL', shape: K.box(0.12, m.leg * 0.5, 0.13), at: [0, -m.leg * 0.22, 0], color: 'b', mirror: true },
      { bone: 'forearmL', shape: K.box(0.09, m.leg * 0.45, 0.1), at: [0, -m.leg * 0.2, 0], color: 'b', mirror: true },
      { bone: 'handL', shape: K.box(0.1, 0.06, 0.14), at: [0, -0.03, 0.04], color: 'c', mirror: true },
      { bone: 'tail0', shape: K.frustum(4, 0.06, 0.05, 0.2), at: [0, 0.03, -0.08], rot: [-70, 0, 0], color: 'c' },
      { bone: 'tail1', shape: K.frustum(4, 0.05, 0.04, 0.2), at: [0, 0.03, -0.08], rot: [-70, 0, 0], color: 'c' },
      { bone: 'tail2', shape: K.frustum(4, 0.04, 0.0, 0.2), at: [0, 0.03, -0.08], rot: [-70, 0, 0], color: 'a' },
    ];
    return { name: '_quad', height: 1.0, palette: PAL, skeleton: S, parts };
  }
  if (name === '_chains') {
    const S = biped({ chains: {
      cape: { n: 3, parent: 'chest', at: [0, 0.2, -0.13], dir: 'down', len: 0.5 },
      ear: { n: 2, parent: 'head', at: [0.15, 0.17, -0.02], dir: [1, 0.5, -0.2], len: 0.16, mirror: true },
      tail: { n: 3, parent: 'hips', at: [0, -0.02, -0.12], dir: [0, -0.3, -1], len: 0.45 },
    } });
    const m = S.meta;
    const parts = [
      { bone: 'hips', shape: K.box(0.28, 0.2, 0.2), at: [0, 0.0, 0], color: 'a' },
      { bone: 'chest', shape: K.box(0.3, 0.26, 0.22), at: [0, 0.1, 0], color: 'a', blend: true },
      { bone: 'head', shape: K.chamferBox(0.3, 0.3, 0.28, 0.35), at: [0, 0.15, 0], color: 'c' },
      { bone: 'upperArmL', shape: K.box(0.09, m.upperArm, 0.09), at: [0, -m.upperArm / 2, 0], color: 'a', mirror: true },
      { bone: 'forearmL', shape: K.box(0.08, m.forearm, 0.08), at: [0, -m.forearm / 2, 0], color: 'c', mirror: true },
      { bone: 'thighL', shape: K.box(0.11, m.thigh, 0.11), at: [0, -m.thigh / 2, 0], color: 'b', mirror: true },
      { bone: 'shinL', shape: K.box(0.1, m.shin, 0.11), at: [0, -m.shin / 2, 0], color: 'b', mirror: true },
      { bone: 'footL', shape: K.box(0.1, 0.07, 0.2), at: [0, -0.04, 0.04], color: 'b', mirror: true },
      ...[0, 1, 2].map((i) => ({ bone: `cape${i}`, shape: K.box(0.34 + i * 0.04, 0.5 / 3 + 0.01, 0.04), at: [0, -0.5 / 6, 0], color: 'b', blend: i ? { span: 0.04 } : false })),
      ...[0, 1].map((i) => ({ bone: `earL${i}`, shape: K.extrude([[0, -0.03], [0.09, 0], [0, 0.03]], 0.03), at: [0.04, 0.0, 0], rot: [0, 0, 27], color: 'c', mirror: true })),
      ...[0, 1, 2].map((i) => ({ bone: `tail${i}`, shape: K.box(0.07 - i * 0.012, 0.07 - i * 0.012, 0.16), at: [0, -0.02, -0.07], rot: [-17, 0, 0], color: 'c' })),
    ];
    return { name: '_chains', height: 1.4, palette: PAL, skeleton: S, parts };
  }
  return null;
}


export default async function build(engine, params) {
  const charName = params.get('char') || 'mannequin';
  const vh = Number(params.get('vh') ?? 10);
  const yaw = THREE.MathUtils.degToRad(Number(params.get('yaw') ?? -45));
  const face = Number(params.get('face') ?? 0);
  const grid = params.get('grid') === '1';
  const poseStrs = params.get('poses') ? params.get('poses').split(';') : null;
  const pose = params.get('pose') || 'rest';

  const mod = charName.startsWith('_') ? null : await import(`../characters/${charName}.js`);
  let planSpec = null;
  if (charName === '_plan') {
    const mq = await import('../characters/mannequin.js');
    planSpec = mq.makePlan(params.get('plan') || 'quadruped', { ...JSON.parse(params.get('popts') || '{}'), face: params.get('face') === '1', blockout: params.get('blockout') === '1' });
  }
  // proportion overrides for modules that export make(opts) (mannequin): &height= &heads= &legs= &arms=
  const prop = {};
  for (const k of ['height', 'heads', 'legs', 'arms', 'shoulders', 'hips']) if (params.get(k)) prop[k] = Number(params.get(k));
  const spec = planSpec ?? testSpec(charName) ?? (Object.keys(prop).length && mod.make ? mod.make(prop) : mod.default);
  const items = grid
    ? Array.from({ length: 8 }, (_, i) => ({ face: face + i * 45, pose }))
    : poseStrs ? poseStrs.map((p) => ({ face, pose: p })) : [{ face, pose }];
  const gap = Number(params.get('gap') ?? (spec.height ?? 1.4) * 0.95);

  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const midY = (spec.height ?? 1.4) * 0.5;
  engine.camera.set({ target: new THREE.Vector3(0, midY, 0), yaw, pitch: Math.PI / 6, viewHeight: vh });
  const relAz = params.get('relAz'); // sun azimuth relative to the camera (sky.js); default = the preset's
  applyTimeOfDay(engine, params.get('tod') || 'noon', { shadowExtent: Math.max(8, items.length * gap), ...(relAz ? { relAz: Number(relAz) } : {}) });
  if (params.get('clouds') !== '1') setClouds(engine, { scale: 0 });

  // flat meadow ground (same tones as the world's grass mid)
  const bg = params.get('bg') || 'meadow';
  const tones = bg === 'plain' ? ['#C9C4B8', '#A8A396', '#6F6F80'] : ['#BBD985', '#75A558', '#3B6B5A'];
  const ground = toonMesh(engine, new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), { ...rampFromTones(...tones), normalNoise: 0 });
  ground.receiveShadow = true;
  engine.scene.add(ground);

  const rigs = [];
  items.forEach((it, i) => {
    const rig = buildCharacter(engine, spec);
    const off = (i - (items.length - 1) / 2) * gap;
    rig.root.position.copy(right).multiplyScalar(off);
    rig.root.rotation.y = THREE.MathUtils.degToRad(it.face);
    rig.applyPose(parsePose(it.pose));
    if (params.get('look') !== '0') updateLook(engine, rig); // far-half shadow flags (look owner)
    engine.scene.add(rig.root);
    engine.camera.snapObjectToTexel(rig.root);
    if (params.get('sockets') === '1') {
      for (const s of Object.values(rig.sockets)) {
        const mk = toonMesh(engine, new THREE.BoxGeometry(0.05, 0.05, 0.12).toNonIndexed(), rampFromTones('#7FF0FF', '#30C8E0', '#1878A0'));
        mk.position.z = 0.06; s.add(mk);
      }
    }
    rigs.push(rig);
  });
  const r0 = rigs[0];
  engine.stats.rig = { char: charName, plan: spec.skeleton?.meta?.plan, bones: r0.stats.bones, tris: r0.stats.tris, parts: r0.stats.parts,
    height: +r0.height.toFixed(3), texels: +(r0.height / (vh / 360)).toFixed(1), warnings: r0.warnings.length };
  if (params.get('gait') === 'game') gameGait(engine, r0, spec, params, { right, yaw, pose, midY });
  window.__rig = rigs; // debugging (page-side only)
}

// ─── game-speed gait demo (rig owner) ───────────────────────────────────────────────────────────────────────────
// A deliberately simple stride-wheel locomotion for ANY body plan, from the template meta only (legs, gaits, restY):
// it proves the plan can travel at the game speed with planted feet (0 slide at drawing frames) and shows how the
// motion reads at real time. Not the runtime Gait (motion owner) — a reference for it.
function gameGait(engine, rig, spec, params, { right, yaw, pose, midY }) {
  const S = spec.skeleton, m = S.meta;
  const gs = planGameSpeed(S, params.get('cycle') ? { cycle: Number(params.get('cycle')) } : {});
  const drawings = Number(params.get('drawings') ?? 4);
  const cycle = gs.cycle, hold = cycle / drawings, speed = gs.speed, C = gs.cycleLen;
  const gName = params.get('g') || m.gait;
  const gdef = m.gaits?.[gName] || { duty: 0.5, phase: {} };
  const beta = m.legs.length ? Math.max(0.12, Math.min(gdef.duty ?? 0.5, gs.duty)) : 1;
  const tc = Number(params.get('tc') ?? 1);
  const rootStep = params.get('rootStep') === '1';
  const travel = params.get('travel') || 'right';
  const camF = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));  // camera looks along −(sin yaw, 0, cos yaw)
  const dir = travel === 'toward' ? camF.clone().negate() : right.clone();
  const faceYaw = Math.atan2(dir.x, dir.z);
  const base = parsePose(pose === 'rest' ? '' : pose);
  const tx = 10 / 360 * (Number(params.get('vh') ?? 10) / 10);
  const lift = Math.max(2 * tx, 0.12 * (m.legs[0]?.len ?? 0.3));
  const hop = gName === 'hop';
  const stat = { gait: gName, beta: +beta.toFixed(3), gs, slide: 0, clamp: 0, frames: 0 };
  engine.stats.rig.gait = stat;
  let prev = null;
  const q = new THREE.Quaternion();
  engine.onUpdate((t) => {
    const n = Math.floor(t / hold + 1e-6), td = n * hold;
    const tr = rootStep ? td : t;
    const s = speed * (td - tc);                         // distance at the drawing time (stride-wheel phase)
    const phi = ((s / C) % 1 + 1) % 1;
    // body: base pose + plan-specific motion, evaluated at the drawing time
    const P = { ...base };
    const add = (b, v) => { if (!rig.bones[b]) return; const o = P[b] ? [...(Array.isArray(P[b]) ? P[b] : P[b].rot)] : [0, 0, 0]; P[b] = [o[0] + v[0], o[1] + v[1], o[2] + v[2]]; };
    let bob = 0;
    if (!m.legs.length) {                                 // glide: squash/stretch pulse once per cycle (+ hover flap)
      const k = Math.sin(2 * Math.PI * phi);
      if (m.plan === 'limbless') Object.assign(P, squashPose(S, 0.2 * k, { riders: S.some((b) => b.name === 'shell') ? ['shell'] : [] }));
      if (m.hover) { bob = 0.03 * m.H * Math.sin(2 * Math.PI * phi); const f = n % 2 ? 50 : -25; add('wingL0', [0, 0, f]); add('wingR0', [0, 0, f]); add('wingL1', [0, 0, f * 0.8]); add('wingR1', [0, 0, f * 0.8]); add('body', [25, 0, 0]); }
    } else if (hop) {                                      // one leap per cycle: airborne while the hind feet swing
      const p = phi; const u = p < beta ? 0 : (p - beta) / (1 - beta);
      bob = Math.max(0.25 * m.H, gs.bounce) * Math.sin(Math.PI * u);
      add('body', [u > 0 ? 35 * Math.sin(Math.PI * u) : -5, 0, 0]); add('head', [u > 0 ? -30 * Math.sin(Math.PI * u) : 5, 0, 0]);
    } else {                                               // alternating: bob twice per cycle (≥ 1 texel) + plan accents
      bob = Math.max(tx, gs.bounce) * Math.abs(Math.sin(2 * Math.PI * phi));
      const side = Math.sin(2 * Math.PI * phi);
      if (m.plan === 'bird') { add('body', [8, 0, 16 * side]); add('head', [0, 0, -10 * side]); add('upperArmL', [0, 0, 18 + 14 * side]); add('upperArmR', [0, 0, 18 - 14 * side]); }
      else if (m.plan === 'quadruped') { add('chest', [4 * side, 0, 0]); add('rump', [-4 * side, 0, 0]); add('head', [-4 * side, 0, 0]); if (rig.bones.tail0) add('tail0', [-20 * side, 0, 15 * side]); }
      else { add(m.bones.spine, [8, -6 * side, 0]); add(m.bones.chest, [4, -8 * side, 0]); add('upperArmL', [-35 * side, 0, 8]); add('upperArmR', [35 * side, 0, 8]); add('forearmL', [40, 0, 0]); add('forearmR', [40, 0, 0]); if (rig.bones.tail0) add('tail0', [0, 0, 20 * side]); }
    }
    // hip drop for reach: the farthest stance target (half span βC/2 ahead/behind) must sit within 0.96 of the leg
    const drop = m.legs.length ? Math.max(...m.legs.map((l) => {
      const hH = l.hip[1] - l.ankleY, half = beta * C / 2, R = 0.96 * l.len;
      return Math.max(0.04 * l.len, hH - Math.sqrt(Math.max(0, R * R - half * half)));
    })) : 0;
    P.pos = [(P.pos?.[0] ?? 0), (P.pos?.[1] ?? 0) + bob - drop, (P.pos?.[2] ?? 0)];
    rig.applyPose(P);
    // root: continuous (game-like) or stepped at drawing frames
    const rootPos = dir.clone().multiplyScalar(speed * (tr - tc));
    rig.root.position.copy(rootPos);
    rig.root.rotation.y = faceYaw;
    rig.root.updateMatrixWorld(true);
    // legs at the drawing time: stance feet fixed in the world (stride wheel), swing arcs; IK onto them
    const bodyD = dir.clone().multiplyScalar(speed * (td - tc));
    const fwd = dir, lat = new THREE.Vector3(fwd.z, 0, -fwd.x);   // lat = character LEFT
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), faceYaw);
    const feetNow = {};
    for (const leg of m.legs) {
      const o = gdef.phase?.[leg.id] ?? (leg.side === 'R' ? 0.5 : 0);
      const f = strideFoot(s, C, o, beta, lift);
      const hip = leg.hip;                                 // rest world (character space)
      const tgt = bodyD.clone().addScaledVector(fwd, hip[2] + f.z).addScaledVector(lat, hip[0]);
      tgt.y = leg.ankleY + f.y;
      // the IK sees the body at the drawing time: shift the target into the CURRENT root frame (rootPos vs bodyD)
      const tIK = tgt.clone().add(rootPos).sub(bodyD);
      const hipW = new THREE.Vector3(...hip).applyQuaternion(q).add(rootPos);
      const pole = hipW.clone().addScaledVector(fwd, leg.pole[2] >= 0 ? 1 : -1);
      const r = solveTwoBone(rig, leg.bones[0], leg.bones[1], leg.bones[2], tIK, pole, { poleLocal: leg.pole, endQuat: q });
      if (r && r.reached === false) stat.clamp++;
      const ft = new THREE.Vector3().setFromMatrixPosition(rig.bones[leg.bones[2]].matrixWorld).sub(rootPos).add(bodyD); // world at td
      feetNow[leg.id] = { p: ft, stance: f.stance };
    }
    rig.root.updateMatrixWorld(true);
    if (prev && prev.n === n - 1) for (const [id, F] of Object.entries(feetNow)) {
      const G = prev.feet[id];
      if (G && G.stance && F.stance) stat.slide = Math.max(stat.slide, +(F.p.distanceTo(G.p) / tx).toFixed(2));
    }
    if (!prev || prev.n !== n) { prev = { n, feet: feetNow }; stat.frames++; }
    updateLook(engine, rig);
  });
}
