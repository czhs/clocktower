// Smear + FX test (owner: fx). Horizontal slash, overhead chop, jumping spin (4 smear keys), front kick (limb
// smear), run-contact dust, landing ring, slash sparks and a hit flash on a training dummy.
//   ?clip=all|slash|chop|spin|kick   ?yaw=<deg, 45>   ?vh=<viewHeight, 10>   ?bg=grass|dark   ?tod=noon|golden
//   ?run=0 (no run-in)   ?inner=<blade fraction, 0>   ?smear=0   ?fx=0   ?dummy=0
//   ?np=discard (A/B: smear normal pass discards instead of writing FLAG_NONE -> outline ring, see LEARNINGS)
//   ?rig=spike (old stand-in: the lead's spike body driven by a tiny Character-API stand-in)
// Default = the real Character (src/chars/character.js) with the mannequin + a sword part on handR:
//   run-in 0.2-1.5 s (run-contact dust), then clips played at slash 2.0, chop 3.2, spin 4.4, kick 5.6
//   (a single ?clip= plays at 2.0). Contacts: slash/chop f8 (2.2667 for a single clip), spin smear keys f6/8/10/12
//   (2.2, 2.2667, 2.3333, 2.4 for a single clip; land f12), kick f6 (2.2).
// rig=spike timeline: slash 0.5 (contact 0.7667), chop 2.0, spin 3.5, kick 5.0.
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { toonMesh, rampFromTones } from '../src/materials/toon.js';
import { buildSpikeCharacter, chamferBox } from '../src/chars/spike.js';
import { attachSmears } from '../src/chars/smear.js';
import { attachFx } from '../src/chars/fx.js';
import { Character } from '../src/chars/character.js';
import * as K from '../src/chars/kit.js';
import { make as makeMannequin, PALETTE as MANNEQUIN_PALETTE } from '../characters/mannequin.js';

const B = (w, h, d, c) => chamferBox(w, h, d, c);
const D = THREE.MathUtils.degToRad;

// ---- stand-in for Character (event API only) ------------------------------------------------------------------
class StandIn {
  constructor(engine, rig, clips, timeline, { idle = 'idle' } = {}) {
    Object.assign(this, { engine, rig, clips, timeline, idle, root: rig.root });
    this.h = { pose: [], event: [], clip: [] };
    this.lastF = -1; this.cur = null; this.state = {};
    this.base = { pos: rig.root.position.clone(), yaw: rig.root.rotation.y };
    engine.onUpdate((t) => this.update(t));
  }
  on(ev, fn) { (this.h[ev] ??= []).push(fn); return () => { this.h[ev] = this.h[ev].filter((f) => f !== fn); }; }
  emit(ev, e) { for (const fn of this.h[ev] ?? []) fn(e); }
  at(F) {               // displayed clip + key at grid frame F
    let c = { name: this.idle, f: F, start: 0 };
    for (const e of this.timeline) {
      const clip = this.clips[e.clip];
      if (F >= e.start && F < e.start + clip.len) c = { name: e.clip, f: F - e.start, start: e.start };
    }
    const keys = this.clips[c.name].keys;
    let ki = 0;
    for (let i = 0; i < keys.length; i++) if (keys[i].f <= c.f) ki = i;
    return { ...c, ki, key: keys[ki] };
  }
  apply(key) {
    const { bones, root } = this.rig;
    for (const b of Object.values(bones)) b.rotation.set(0, 0, 0);
    for (const [n, r] of Object.entries(key.pose)) bones[n]?.rotation.set(D(r[0]), D(r[1]), D(r[2]));
    const off = key.root?.pos ?? [0, 0, 0];
    root.position.copy(this.base.pos).add(new THREE.Vector3(...off).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.base.yaw));
    root.rotation.y = this.base.yaw + D(key.root?.yaw ?? 0);
    root.updateMatrixWorld(true);
  }
  update(t) {
    const F = Math.floor(t * 30 + 1e-6);
    if (F < this.lastF) { this.lastF = -1; this.cur = null; }
    for (let f = this.lastF + 1; f <= F; f++) {
      const s = this.at(f), tf = f / 30;
      if (!this.cur || this.cur.name !== s.name) this.emit('clip', { t: tf, from: this.cur?.name ?? null, to: s.name });
      if (!this.cur || this.cur.name !== s.name || this.cur.ki !== s.ki || (this.cur.start !== s.start)) {
        this.apply(s.key);
        this.emit('pose', { t: tf, clip: s.name, frame: s.f, key: s.key, keyIndex: s.ki });
      }
      const ev = this.clips[s.name].events?.[s.f];
      if (ev) for (const n of [].concat(ev)) this.emit('event', { t: tf, clip: s.name, name: n });
      this.cur = s;
    }
    this.lastF = Math.max(this.lastF, F);
    this.state = this.cur;
  }
}

// ---- poses (raw Euler degrees on the spike bones; XYZ order) -------------------------------------------------
const STANCE = { legL: [-12, 0, 6], shinL: [-10, 0, 0], legR: [14, 0, -6], shinR: [-14, 0, 0], hips: [0, 0, 0] };
const READY = { ...STANCE, chest: [6, 0, 0], armR: [-25, 0, -30], foreR: [-35, 0, 0], armL: [-10, 0, 18], foreL: [-30, 0, 0] };
const CLIPS = {
  idle: { len: 1, keys: [{ f: 0, pose: READY }] },
  slash: {                        // horizontal right -> left, ~160 deg in one key
    len: 28, events: { 8: ['hit', 'stepL'] },
    keys: [
      { f: 0, pose: { ...STANCE, hips: [0, -15, 0], chest: [-4, -30, 0], head: [0, 25, 0], armR: [0, -20, -82], foreR: [0, 0, 0], armL: [-30, 0, 25], foreL: [-40, 0, 0] } },
      { f: 8, smear: 'weapon', root: { pos: [0, 0, 0.16] }, pose: { legL: [-35, 0, 6], shinL: [-25, 0, 0], legR: [25, 0, -8], shinR: [-10, 0, 0],
        hips: [0, 20, 0], chest: [10, 25, 0], head: [0, -20, 0], armR: [0, 50, -85], foreR: [0, 0, 0], armL: [25, 0, 35], foreL: [-20, 0, 0] } },
      { f: 9, root: { pos: [0, 0, 0.16] }, pose: { legL: [-35, 0, 6], shinL: [-25, 0, 0], legR: [25, 0, -8], shinR: [-10, 0, 0],
        hips: [0, 24, 0], chest: [12, 30, 0], head: [0, -24, 0], armR: [0, 58, -84], foreR: [0, 0, 0], armL: [28, 0, 38], foreL: [-20, 0, 0] } },
      { f: 18, root: { pos: [0, 0, 0.16] }, pose: { ...STANCE, hips: [0, 10, 0], chest: [8, 10, 0], armR: [-10, 30, -40], foreR: [-20, 0, 0], armL: [-5, 0, 20], foreL: [-30, 0, 0] } },
      { f: 24, root: { pos: [0, 0, 0.08] }, pose: READY },
    ],
  },
  chop: {                         // overhead, ~160 deg (arm 120 + chest 40) in one key (forearm twisted so the edge faces forward)
    len: 28, events: { 8: ['hit', 'stepL'] },
    keys: [
      { f: 0, pose: { ...STANCE, chest: [-15, 0, 0], head: [-10, 0, 0], armR: [-150, 180, 12], foreR: [0, 0, 0], armL: [-150, 0, 20], foreL: [-30, 0, 0] } },
      { f: 8, smear: 'weapon', root: { pos: [0, -0.06, 0.12] }, pose: { legL: [-40, 0, 6], shinL: [-30, 0, 0], legR: [30, 0, -6], shinR: [-25, 0, 0],
        chest: [25, 0, 0], head: [-10, 0, 0], armR: [-30, 180, 12], foreR: [0, 0, 0], armL: [-20, 0, 25], foreL: [-30, 0, 0] } },
      { f: 9, root: { pos: [0, -0.07, 0.12] }, pose: { legL: [-40, 0, 6], shinL: [-30, 0, 0], legR: [30, 0, -6], shinR: [-25, 0, 0],
        chest: [28, 0, 0], head: [-12, 0, 0], armR: [-24, 180, 12], foreR: [0, 0, 0], armL: [-15, 0, 25], foreL: [-30, 0, 0] } },
      { f: 18, root: { pos: [0, -0.02, 0.12] }, pose: { ...STANCE, chest: [14, 0, 0], armR: [-10, 0, -20], foreR: [-20, 0, 0], armL: [-10, 0, 18], foreL: [-30, 0, 0] } },
      { f: 24, root: { pos: [0, 0, 0.06] }, pose: READY },
    ],
  },
  spin: {                         // jumping spin: 4 smear keys of <= 135 deg
    len: 30, events: { 12: ['land'], 8: ['hit'] },
    keys: (() => {
      const crouch = { legL: [-25, 0, 8], shinL: [-40, 0, 0], legR: [20, 0, -8], shinR: [-40, 0, 0] };
      const out = { armR: [0, 30, -86], foreR: [0, 0, 0], armL: [0, 0, 70], foreL: [0, 0, 0], chest: [0, 30, 0] };
      return [
        { f: 0, root: { pos: [0, -0.08, 0] }, pose: { ...crouch, chest: [10, -40, 0], armR: [0, -30, -80], foreR: [0, 0, 0], armL: [-20, 0, 30], foreL: [-40, 0, 0], head: [0, 25, 0] } },
        { f: 6, smear: 'weapon', root: { pos: [0, 0.1, 0], yaw: 0 }, pose: { ...STANCE, ...out } },
        { f: 8, smear: 'weapon', root: { pos: [0, 0.14, 0], yaw: 120 }, pose: { ...STANCE, ...out } },
        { f: 10, smear: 'weapon', root: { pos: [0, 0.1, 0], yaw: 240 }, pose: { ...STANCE, ...out } },
        { f: 12, smear: 'weapon', root: { pos: [0, -0.06, 0], yaw: 330 }, pose: { ...crouch, ...out, chest: [12, 45, 0], armR: [0, 40, -80] } },
        { f: 20, root: { pos: [0, 0, 0], yaw: 360 }, pose: READY },
      ];
    })(),
  },
  kick: {                         // front kick, limb smear on the right leg
    len: 24, events: { 6: ['hit@kickR'], 14: ['stepR'] },
    keys: [
      { f: 0, pose: { ...STANCE, legR: [35, 0, -4], shinR: [-60, 0, 0], chest: [-10, 0, 0], armR: [-25, 0, -40], foreR: [-40, 0, 0], armL: [20, 0, 30], foreL: [-40, 0, 0] } },
      { f: 6, smear: 'kickR', pose: { legL: [10, 0, 4], shinL: [-12, 0, 0], legR: [-100, 0, -4], shinR: [-5, 0, 0], chest: [-18, 0, 0], armR: [20, 0, -50], foreR: [-30, 0, 0], armL: [30, 0, 40], foreL: [-30, 0, 0] } },
      { f: 7, pose: { legL: [10, 0, 4], shinL: [-12, 0, 0], legR: [-104, 0, -4], shinR: [-5, 0, 0], chest: [-20, 0, 0], armR: [22, 0, -50], foreR: [-30, 0, 0], armL: [32, 0, 40], foreL: [-30, 0, 0] } },
      { f: 14, pose: { ...STANCE, legR: [-20, 0, -6], shinR: [-30, 0, 0], armR: [-25, 0, -35], foreR: [-35, 0, 0] } },
      { f: 20, pose: READY },
    ],
  },
};
const HURT = {
  idle: { len: 1, keys: [{ f: 0, pose: { armL: [0, 0, 8], armR: [0, 0, -8] } }] },
  hurt: { len: 10, events: { 0: 'hurt' }, keys: [
    { f: 0, root: { pos: [0, 0, -0.05] }, pose: { chest: [-18, 10, 0], head: [-15, 0, 0], armL: [-30, 0, 30], armR: [-30, 0, -30], foreL: [-30, 0, 0], foreR: [-30, 0, 0] } },
    { f: 4, pose: { chest: [-6, 4, 0], armL: [-10, 0, 14], armR: [-10, 0, -14] } },
    { f: 8, pose: { armL: [0, 0, 8], armR: [0, 0, -8] } },
  ] },
};

const SPEC = (palette) => ({
  palette,
  outline: 'depth',
  bones: [
    { name: 'hips', pos: [0, 0.55, 0] }, { name: 'chest', parent: 'hips', pos: [0, 0.22, 0] },
    { name: 'head', parent: 'chest', pos: [0, 0.3, 0] },
    { name: 'armL', parent: 'chest', pos: [0.2, 0.22, 0] }, { name: 'foreL', parent: 'armL', pos: [0, -0.2, 0] },
    { name: 'armR', parent: 'chest', pos: [-0.2, 0.22, 0] }, { name: 'foreR', parent: 'armR', pos: [0, -0.2, 0] },
    { name: 'legL', parent: 'hips', pos: [0.09, -0.04, 0] }, { name: 'shinL', parent: 'legL', pos: [0, -0.25, 0] },
    { name: 'legR', parent: 'hips', pos: [-0.09, -0.04, 0] }, { name: 'shinR', parent: 'legR', pos: [0, -0.25, 0] },
  ],
  parts: [
    { bone: 'hips', geo: B(0.32, 0.18, 0.22), at: [0, 0.04, 0], color: 'cloak' },
    { bone: 'chest', geo: B(0.36, 0.3, 0.24), at: [0, 0.1, 0], color: 'cloak' },
    { bone: 'head', geo: B(0.34, 0.3, 0.3, 0.4), at: [0, 0.14, 0], color: 'skin' },
    { bone: 'head', geo: B(0.38, 0.12, 0.34, 0.4), at: [0, 0.28, -0.01], color: 'hair' },
    { bone: 'armL', geo: B(0.1, 0.22, 0.1), at: [0, -0.09, 0], color: 'cloak' },
    { bone: 'foreL', geo: B(0.09, 0.2, 0.09), at: [0, -0.09, 0], color: 'skin' },
    { bone: 'armR', geo: B(0.1, 0.22, 0.1), at: [0, -0.09, 0], color: 'cloak' },
    { bone: 'foreR', geo: B(0.09, 0.2, 0.09), at: [0, -0.09, 0], color: 'skin' },
    { bone: 'legL', geo: B(0.12, 0.26, 0.12), at: [0, -0.12, 0], color: 'dark' },
    { bone: 'shinL', geo: B(0.11, 0.26, 0.14), at: [0, -0.15, 0.015], color: 'dark' },
    { bone: 'legR', geo: B(0.12, 0.26, 0.12), at: [0, -0.12, 0], color: 'dark' },
    { bone: 'shinR', geo: B(0.11, 0.26, 0.14), at: [0, -0.15, 0.015], color: 'dark' },
  ],
});

/** Socket on `bone` at `at` whose +Z = bone −Y (along the limb), +X = bone +Z (forward edge), +Y = bone −X. */
function limbSocket(rig, bone, at) {
  const s = new THREE.Object3D();
  s.position.set(...at);
  s.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0)));
  rig.bones[bone].add(s);
  return s;
}

// ---- real Character mode (default): mannequin + sword, clips in pose triples [fwd, twist, out] ---------------
const REAL_CLIPS = {
  slash: {                        // horizontal right -> left: arm out 70 -> -25 + spine/chest twist -25 -> +20 (140 deg)
    fps: 30, interp: 'step', events: { 8: ['hit', 'stepL'] },
    keys: [
      { f: 0, pose: { pos: [0, -0.05, 0], spine: [6, -15, 0], chest: [4, -10, 0], head: [0, 25, 0],
        upperArmR: [90, 0, 70], forearmR: [0, 0, 0], upperArmL: [20, 0, 25], forearmL: [60, 0, 0],
        thighL: [30, 0, 8], shinL: [-30, 0, 0], thighR: [-15, 0, 6], shinR: [-20, 0, 0] } },
      { f: 8, smear: 'weapon', pose: { pos: [0, -0.08, 0.1], spine: [10, 10, 0], chest: [6, 10, 0], head: [-6, -20, 0],
        upperArmR: [90, 0, -25], forearmR: [0, 0, 0], upperArmL: [-30, 0, 30], forearmL: [40, 0, 0],
        thighL: [45, 0, 8], shinL: [-35, 0, 0], footL: [-10, 0, 0], thighR: [-30, 0, 6], shinR: [-25, 0, 0], footR: [25, 0, 0] } },
      { f: 9, pose: { pos: [0, -0.08, 0.1], spine: [11, 16, 0], chest: [7, 16, 0], head: [-6, -24, 0],
        upperArmR: [88, 0, -32], forearmR: [0, 0, 0], upperArmL: [-32, 0, 32], forearmL: [40, 0, 0],
        thighL: [45, 0, 8], shinL: [-35, 0, 0], footL: [-10, 0, 0], thighR: [-30, 0, 6], shinR: [-25, 0, 0], footR: [25, 0, 0] } },
      { f: 18, pose: { pos: [0, -0.03, 0.05], spine: [4, 6, 0], upperArmR: [25, 0, 20], forearmR: [35, 0, 0], upperArmL: [0, 0, 12], forearmL: [25, 0, 0],
        thighL: [15, 0, 6], shinL: [-15, 0, 0], thighR: [-10, 0, 4], shinR: [-12, 0, 0] } },
      { f: 24, pose: {} },
    ],
  },
  chop: {                         // overhead: arm fwd 165 -> 35 (twist -90 puts the edge forward) + spine 20 + chest 6
    fps: 30, interp: 'step', events: { 8: ['hit', 'stepL'] },
    keys: [
      { f: 0, pose: { pos: [0, -0.02, 0], spine: [-6, 0, 0], chest: [0, 0, 0], head: [-10, 0, 0],
        upperArmR: [165, -90, 12], forearmR: [0, 0, 0], upperArmL: [140, 0, 15], forearmL: [20, 0, 0],
        thighL: [10, 0, 6], thighR: [-10, 0, 6] } },
      { f: 8, smear: 'weapon', pose: { pos: [0, -0.1, 0.1], spine: [14, 0, 0], chest: [6, 0, 0], head: [-15, 0, 0],
        upperArmR: [35, -90, 8], forearmR: [0, 0, 0], upperArmL: [30, 0, 20], forearmL: [40, 0, 0],
        thighL: [55, 0, 8], shinL: [-50, 0, 0], thighR: [-25, 0, 6], shinR: [-30, 0, 0], footR: [25, 0, 0] } },
      { f: 9, pose: { pos: [0, -0.11, 0.1], spine: [16, 0, 0], chest: [7, 0, 0], head: [-16, 0, 0],
        upperArmR: [28, -90, 8], forearmR: [0, 0, 0], upperArmL: [26, 0, 20], forearmL: [40, 0, 0],
        thighL: [55, 0, 8], shinL: [-50, 0, 0], thighR: [-25, 0, 6], shinR: [-30, 0, 0], footR: [25, 0, 0] } },
      { f: 18, pose: { pos: [0, -0.03, 0.05], spine: [6, 0, 0], upperArmR: [15, 0, 15], forearmR: [30, 0, 0], upperArmL: [5, 0, 12], forearmL: [25, 0, 0],
        thighL: [15, 0, 6], shinL: [-15, 0, 0] } },
      { f: 24, pose: {} },
    ],
  },
  spin: {                         // jumping spin on the hips twist: 4 smear keys of 110-125 deg
    fps: 30, interp: 'step', events: { 8: ['hit'], 12: ['land'] },
    keys: (() => {
      const crouch = { thighL: [45, 0, 10], shinL: [-60, 0, 0], thighR: [35, 0, 10], shinR: [-60, 0, 0], footL: [15, 0, 0], footR: [15, 0, 0] };
      const air = { thighL: [30, 0, 8], shinL: [-50, 0, 0], thighR: [10, 0, 8], shinR: [-70, 0, 0] };
      const arms = { upperArmR: [90, 0, 90], forearmR: [0, 0, 0], upperArmL: [60, 0, 70], forearmL: [30, 0, 0] };
      return [
        { f: 0, pose: { pos: [0, -0.12, 0], hips: [0, -40, 0], spine: [10, -15, 0], head: [0, 25, 0], ...crouch, upperArmR: [90, 0, 80], upperArmL: [20, 0, 20], forearmL: [50, 0, 0] } },
        { f: 6, smear: 'weapon', pose: { pos: [0, 0.1, 0], hips: [0, 60, 0], spine: [0, 10, 0], ...air, ...arms } },
        { f: 8, smear: 'weapon', pose: { pos: [0, 0.16, 0], hips: [0, 180, 0], spine: [0, 10, 0], ...air, ...arms } },
        { f: 10, smear: 'weapon', pose: { pos: [0, 0.1, 0], hips: [0, 300, 0], spine: [0, 10, 0], ...air, ...arms } },
        { f: 12, smear: 'weapon', pose: { pos: [0, -0.12, 0], hips: [0, 390, 0], spine: [12, 30, 0], ...crouch, ...arms } },
        { f: 20, pose: { pos: [0, -0.04, 0], hips: [0, 360, 0], spine: [4, 0, 0], thighL: [15, 0, 6], shinL: [-15, 0, 0], upperArmR: [30, 0, 30] } },
        { f: 26, pose: { hips: [0, 360, 0] } },
      ];
    })(),
  },
  kick: {                         // front kick: limb smear on the right thigh socket (fwd -40 -> 100)
    fps: 30, interp: 'step', events: { 6: ['hit@kickR'], 14: ['stepR'] },
    keys: [
      { f: 0, pose: { pos: [0, -0.04, 0], spine: [-4, 0, 0], thighR: [-40, 0, 4], shinR: [-70, 0, 0], thighL: [10, 0, 4], shinL: [-15, 0, 0],
        upperArmR: [30, 0, 30], forearmR: [70, 0, 0], upperArmL: [30, 0, 20], forearmL: [80, 0, 0] } },
      { f: 6, smear: 'kickR', pose: { pos: [0, 0, -0.04], spine: [-20, 0, 0], head: [10, 0, 0], thighR: [100, 0, 4], shinR: [-5, 0, 0], footR: [30, 0, 0],
        thighL: [-10, 0, 4], shinL: [-10, 0, 0], upperArmR: [-20, 0, 40], forearmR: [40, 0, 0], upperArmL: [-10, 0, 40], forearmL: [40, 0, 0] } },
      { f: 7, pose: { pos: [0, 0, -0.04], spine: [-22, 0, 0], head: [10, 0, 0], thighR: [104, 0, 4], shinR: [-4, 0, 0], footR: [30, 0, 0],
        thighL: [-10, 0, 4], shinL: [-10, 0, 0], upperArmR: [-22, 0, 42], forearmR: [40, 0, 0], upperArmL: [-12, 0, 42], forearmL: [40, 0, 0] } },
      { f: 14, pose: { pos: [0, -0.03, 0.05], thighR: [20, 0, 4], shinR: [-30, 0, 0], upperArmR: [20, 0, 20], forearmR: [40, 0, 0] } },
      { f: 20, pose: {} },
    ],
  },
};

function buildReal(engine, params) {
  const base = makeMannequin();
  const spec = {
    ...base,
    palette: { ...MANNEQUIN_PALETTE, steel: ['#EEF2F4', '#B4BEC8', '#66708A'] },
    parts: [
      ...base.parts,
      { bone: 'handR', shape: K.box(0.085, 0.56, 0.03), at: [0, -0.37, 0], color: 'steel', name: 'blade' },  // width along the edge (bone X)
      { bone: 'handR', shape: K.box(0.17, 0.035, 0.06), at: [0, -0.085, 0], color: 'hair', name: 'guard' },
    ],
    sockets: { ...base.sockets, kickR: { bone: 'thighR', at: [0, 0, 0], rot: [90, 0, 90] } },  // +Z down the leg, +X forward
    clips: { ...base.clips, ...REAL_CLIPS },
  };
  const ch = new Character(engine, spec, {});
  engine.scene.add(ch.root);
  const run = params.get('run') !== '0';
  const from = new THREE.Vector3(-4, 0, 0), home = new THREE.Vector3(0, 0, 0);
  ch.drive((t) => {
    if (!run) return { pos: home.clone(), face: 0 };
    const u = Math.min(1, Math.max(0, (t - 0.2) / 1.3));
    const s = u * u * (3 - 2 * u);
    return { pos: from.clone().lerp(home, s), face: t > 1.5 ? 0 : undefined };
  });
  const which = params.get('clip') || 'all';
  const plan = which === 'all' ? [['slash', 2.0], ['chop', 3.2], ['spin', 4.4], ['kick', 5.6]] : [[which, 2.0]];
  for (const [name, at] of plan) ch.play(name, { at });
  return { ch, plan };
}

export default async function build(engine, params) {
  if (params.get('rig') !== 'spike') return buildRealScene(engine, params);
  return buildSpikeScene(engine, params);
}

function setupWorld(engine, params) {
  const vh = Number(params.get('vh') ?? 10);
  const yaw = D(Number(params.get('yaw') ?? 45));
  engine.camera.set({ target: new THREE.Vector3(0, 0.6, 0.3), yaw, pitch: Math.PI / 6, viewHeight: vh });
  applyTimeOfDay(engine, params.get('tod') || 'noon', { shadowExtent: 6 });
  setClouds(engine, { scale: 0 });
  const dark = params.get('bg') === 'dark';
  const ground = dark ? rampFromTones('#4A4A55', '#3A3A44', '#2A2A33') : rampFromTones('#BBD985', '#75A558', '#3B6B5A');
  engine.scene.add(toonMesh(engine, new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), { ...ground, normalNoise: dark ? 0 : 0.12 }));
}

function addDummy(engine, params, hits) {
  const dummy = buildSpikeCharacter(engine, SPEC({
    cloak: ['#9AA6C8', '#6C7698', '#46496A'], skin: ['#D8C8A8', '#B49E80', '#7A6A70'],
    hair: ['#B49E80', '#8E7A62', '#5E5058'], dark: ['#7E7A90', '#5C586E', '#3E3B50'],
  }));
  dummy.root.position.set(1.05, 0, 1.0);
  dummy.root.rotation.y = Math.PI + 0.8;
  dummy.root.updateMatrixWorld(true);
  engine.scene.add(dummy.root);
  engine.camera.snapObjectToTexel(dummy.root);
  const dch = new StandIn(engine, dummy, HURT, hits.map((start) => ({ clip: 'hurt', start })));
  dch.rig = dummy;
  if (params.get('fx') !== '0') attachFx(engine, dch, {});
}

function buildRealScene(engine, params) {
  setupWorld(engine, params);
  const { ch, plan } = buildReal(engine, params);
  if (params.get('smear') !== '0') {
    attachSmears(engine, ch, {
      normalPass: params.get('np') === 'discard' ? 'discard' : 'none',
      sockets: {
        weapon: { length: 0.62, inner: Number(params.get('inner') ?? 0.0) },
        kickR: { kind: 'limb', length: 0.62, inner: 0.45, palette: ['#8F8AA6', '#A6A2BC'] },
      },
    });
  }
  if (params.get('fx') !== '0') attachFx(engine, ch, { weapon: { socket: 'weapon', length: 0.62 }, sockets: { kickR: { length: 0.62, tip: 1 } } });
  const contact = { slash: 8, chop: 8, spin: 8, kick: 6 };
  if (params.get('dummy') !== '0') addDummy(engine, params, plan.map(([n, at]) => Math.round(at * 30) + contact[n]));
}

function buildSpikeScene(engine, params) {
  const vh = Number(params.get('vh') ?? 10);
  const yaw = D(Number(params.get('yaw') ?? 45));
  engine.camera.set({ target: new THREE.Vector3(0, 0.6, 0.3), yaw, pitch: Math.PI / 6, viewHeight: vh });
  applyTimeOfDay(engine, params.get('tod') || 'noon', { shadowExtent: 6 });
  setClouds(engine, { scale: 0 });

  const dark = params.get('bg') === 'dark';
  const ground = dark ? rampFromTones('#4A4A55', '#3A3A44', '#2A2A33') : rampFromTones('#BBD985', '#75A558', '#3B6B5A');
  engine.scene.add(toonMesh(engine, new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), { ...ground, normalNoise: dark ? 0 : 0.12 }));

  // hero (sword in the right hand)
  const heroSpec = SPEC({
    cloak: ['#C49A72', '#8E6650', '#5A4452'], skin: ['#F2D2B0', '#D9A982', '#8C6A78'],
    hair: ['#F4F2EE', '#DCDAD8', '#9A9AAE'], dark: ['#7A6A70', '#58494F', '#3A3240'],
    steel: ['#E8ECEF', '#A9B4BE', '#5F6A82'], guard: ['#C8A060', '#8E6A3C', '#5A4038'],
  });
  heroSpec.parts.push(
    { bone: 'foreR', geo: B(0.035, 0.56, 0.085, 0), at: [0, -0.5, 0], color: 'steel' },   // blade, edge along bone Z
    { bone: 'foreR', geo: B(0.06, 0.04, 0.17, 0), at: [0, -0.215, 0], color: 'guard' },
  );
  const hero = buildSpikeCharacter(engine, heroSpec);
  hero.root.updateMatrixWorld(true);
  hero.sockets = {
    weapon: limbSocket(hero, 'foreR', [0, -0.2, 0]),        // hilt at the fist; blade 0.58 m
    kickR: limbSocket(hero, 'legR', [0, 0, 0]),             // hip joint; thigh + shin + foot ≈ 0.6 m
  };
  engine.scene.add(hero.root);
  engine.camera.snapObjectToTexel(hero.root);

  const which = params.get('clip') || 'all';
  const T0 = 15; // 0.5 s
  const timeline = which === 'all'
    ? [{ clip: 'slash', start: T0 }, { clip: 'chop', start: 60 }, { clip: 'spin', start: 105 }, { clip: 'kick', start: 150 }]
    : [{ clip: which, start: T0 }];
  const ch = new StandIn(engine, hero, CLIPS, timeline);
  ch.rig = hero;

  if (params.get('smear') !== '0') {
    attachSmears(engine, ch, {
      normalPass: params.get('np') === 'discard' ? 'discard' : 'none',
      sockets: {
        weapon: { length: 0.58, inner: Number(params.get('inner') ?? 0.0) },
        kickR: { kind: 'limb', length: 0.6, inner: 0.45, palette: ['#8A7A80', '#A0929A'] },
      },
    });
  }
  if (params.get('fx') !== '0') attachFx(engine, ch, { weapon: { socket: 'weapon', length: 0.58 }, sockets: { kickR: { length: 0.62, tip: 1 } } });

  // training dummy, hit on every contact frame
  if (params.get('dummy') !== '0') {
    const dummy = buildSpikeCharacter(engine, SPEC({
      cloak: ['#9AA6C8', '#6C7698', '#46496A'], skin: ['#D8C8A8', '#B49E80', '#7A6A70'],
      hair: ['#B49E80', '#8E7A62', '#5E5058'], dark: ['#7E7A90', '#5C586E', '#3E3B50'],
    }));
    dummy.root.position.set(1.05, 0, 1.0);
    dummy.root.rotation.y = Math.PI + 0.8;
    dummy.root.updateMatrixWorld(true);
    engine.scene.add(dummy.root);
    engine.camera.snapObjectToTexel(dummy.root);
    const contacts = { slash: 8, chop: 8, spin: 8, kick: 6 };
    const dtl = timeline.map((e) => ({ clip: 'hurt', start: e.start + contacts[e.clip] }));
    const dch = new StandIn(engine, dummy, HURT, dtl);
    dch.rig = dummy;
    if (params.get('fx') !== '0') attachFx(engine, dch, {});
  }
}
