// Character runtime (motion owner). docs/CHARACTERS.md §5. The thing scenes use:
//
//   const ch = new Character(engine, spec, { ground: terrain, facingSteps: 8 });
//   engine.scene.add(ch.root);
//   ch.drive((t) => ({ pos: pathAt(t), face: undefined, action: t > 3 && t < 3.1 ? 'attack' : null }));
//   ch.on('pose', (e) => …); ch.on('event', (e) => …); ch.on('clip', (e) => …);
//
// TIME MODEL (what makes it read as pixel animation, CHARACTER_TECHNIQUES §4):
//   * Simulation: a FIXED step (dynamicsFps, 60 Hz) from t = 0: drive sampling, velocity, gait (stride wheel,
//     planted feet), facing, SecondOrder dynamics (lean, chest/head lag, chains). Re-simulated from 0 when t goes
//     backwards or jumps > 1 s, so any capture time is deterministic.
//   * Pose clock: the 30 Hz key grid. A new pose is DISPLAYED only on a grid frame and only when something changed:
//     the clip's displayed frame (idle/action), a gait drawing (quantised stride phase, `poses` per cycle), a facing
//     step, an idle recovery step, or a dynamics channel that moved by more than its quantum. EVERY drawing is held
//     ≥ `minHold` grid frames (no 1-grid-frame drawings); only clip switches and smear keys cut in early, and optional
//     redraws (facing, dynamics, idle steps) skip a frame that an authored key follows within minHold-1 frames.
//     Between pose frames every bone rotation is held.
//   * Root: moves EVERY frame (drive(t) evaluated at the exact render time) and is snapped to the camera texel grid
//     (engine.camera.snapWorld + snapObjectToTexel), so the body glides in whole texels while the drawing holds.
//   * Feet: planted in world space. legIK 'plant' (DEFAULT since motion r5): the drawing holds (legs included) and
//     only legs whose DISPLAYED foot is planted are re-pinned every frame while the root glides and the spot is within
//     reach → 0 world slide during the stance; past reach the leg keeps its shape and rides the body to the next
//     drawing; swing legs/hips stay as drawn; standing still nothing re-solves (= 'pose'). Feet are exact at every
//     drawing change in all modes. 'pose': the whole
//     drawing holds (planted feet exact at pose frames, they ride the root inside a hold). 'frame': both legs
//     re-solved every frame onto the held foot targets (+ per-frame hip dip).
//   * Body plans: spec.locomotion.plan ('biped'|'bird'|'quadruped'|'hop'|'glide'|'fly') → LegGait (locomotion.js;
//     N legs, quantised-phase planting tuned for the game speed 4 H/s); no plan → legacy biped Gait.
//     Squash/stretch uses the rig's '<bone>.s' / '<bone>.p' pose channels (gait poses and clips alike).
//   * Action holds: one-shot clips default to clip.dynamics 'hold' (no dynamics-only redraws while they play; chains
//     snap to rest on the return drawing);
//     'snap' also snaps chains to their rigid-follow direction on every key; 'free' = redraw on chain changes.
//   * Facing: quantised to `facingSteps` directions relative to the camera yaw, with hysteresis; a turn steps one
//     direction per `turnHold` grid frames (stop-motion; each intermediate facing is held ≥ minHold grid frames).
//
// drive(fn): fn(t) → { pos: Vector3, face?: radians (else the movement direction), action?: clip name | null
//   (a new name starts that one-shot clip; return null in between to re-trigger), look?: Vector3 (head target) }.
// play(name, {restart, speed, at}): one-shot clips play once then return to locomotion; loop clips replace idle.
//   clip.hold (default true for 'vote' and 'die'): the one-shot stays on its last key until another clip is played
//   (play('idle') releases it) or, when the drive started it, until drive(t).action stops returning its name.
//   A one-shot that keys leg bones while standing: each key's FK ankles are dropped to the ground and planted
//   (IK), so lunges stretch the stance instead of sliding/floating feet; clip.legs = 'fk' → raw FK legs.
//   Recorded with their start time, so re-simulation replays them (deterministic).
// Events: 'pose' {t, clip, frame, key, keyIndex, facing}, 'event' {t, clip, name, …} (clip events; footsteps
//   {name:'step', side, pos}), 'clip' {t, from, to}, 'reset' {t} (re-simulation from 0 starts).
// opts: { ground, facingSteps 8, snap true, dynamicsFps 60, gridFps 30, legIK 'plant'|'pose'|'frame', turnHold 2,
//   hysteresis 8 (deg), minHold 2, look: Vector3|null, lookLimits {yaw, pitch}, debug, rig (prebuilt), face 0,
//   autoUpdate true, quant {lean 1.5, yaw 3 (also the step of the DISPLAYED chest/head lag), chain 12} }. spec.character = per-character defaults for these opts (scene opts still win).
import * as THREE from 'three';
import { buildCharacter, ghostOpts } from './rig.js';
import { updateLook } from './look.js';
import { evaluateClip, eventsBetween, clipInfo } from './anim.js';
import { SecondOrder, SecondOrderAngle, resolveParams } from './dynamics.js';
import { solveTwoBone, lookAt, aimBone } from './ik.js';
import { createGait } from './locomotion.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const EPS = 1e-6;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (a) => a - Math.round(a / TAU) * TAU;
const UP = new THREE.Vector3(0, 1, 0);

/** Procedural idle (breathing, 1-texel bob, extremes held long, 2 in-betweens) for bones the rig has. */
export function defaultIdle(rig) {
  const has = (n) => !!rig.bones?.[n];
  const P = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k === 'pos' || has(k)));
  const up = P({ pos: [0, -0.012, 0], spine: [2, 0, 0], chest: [1, 0, 0], head: [-2, 0, 0], upperArmL: [0, 0, 4], upperArmR: [0, 0, 4], forearmL: [8, 0, 0], forearmR: [8, 0, 0] });
  const mid = P({ pos: [0, -0.026, 0], spine: [3, 0, 0], chest: [2, 0, 0], head: [-2, 0, 0], upperArmL: [0, 0, 5], upperArmR: [0, 0, 5], forearmL: [10, 0, 0], forearmR: [10, 0, 0] });
  const down = P({ pos: [0, -0.041, 0], spine: [4, 0, 0], chest: [3, 0, 0], head: [-1, 0, 0], upperArmL: [0, 0, 6], upperArmR: [0, 0, 6], forearmL: [13, 0, 0], forearmR: [13, 0, 0] });
  return { fps: 30, loop: true, interp: 'step', length: 84, keys: [
    { f: 0, pose: up }, { f: 36, pose: mid }, { f: 42, pose: down }, { f: 78, pose: mid },
  ] };
}

export class Character {
  constructor(engine, spec, opts = {}) {
    this.engine = engine;
    this.spec = spec;
    this.opts = {
      ground: null, facingSteps: 8, snap: true, dynamicsFps: 60, gridFps: 30, legIK: 'plant', turnHold: 2,
      hysteresis: 8, minHold: 2, dip: true, look: null, lookLimits: { yaw: 60, pitch: 30 }, debug: false, face: 0, autoUpdate: true,
      ...(spec.character || {}),   // (lead) per-character runtime defaults, e.g. { legIK: 'pose', minHold: 2 }
      ...opts,
    };
    this.rig = this.opts.rig || buildCharacter(engine, spec);
    this.root = this.rig.root;
    this.bones = this.rig.bones;
    this.gait = createGait(this.rig, spec, { minHold: this.opts.minHold, ground: this.opts.ground, ...(this.opts.gait || {}) });
    this.idleClip = spec.clips?.idle || defaultIdle(this.rig);
    this.home = (this.opts.position || this.root.position).clone();
    this._listeners = { pose: [], event: [], clip: [], reset: [] };
    this._drive = null;
    this._plays = [];            // [{name, at, speed, restart}] recorded play() calls
    this._n = -1;
    this._legBones = this.gait ? this.gait.legBones() : [];
    this._chains = this._buildChains(spec.chains || []);
    if (this.opts.snap) engine.camera.snapObjectToTexel(this.root);
    if (this.opts.autoUpdate) engine.onUpdate((t) => this.update(t));
  }

  // ------------------------------------------------------------------------------------------------ public API
  /** fn(t) → { pos, face?, action?, look? } — a pure function of t. */
  drive(fn) { this._drive = fn; this._n = -1; return this; }

  /** Play a clip from engine time (or opts.at). One-shots return to locomotion when done. */
  play(name, { restart = true, speed = 1, at } = {}) {
    if (!this.spec.clips?.[name] && name !== 'idle') { console.warn(`Character.play: unknown clip '${name}'`); return this; }
    const t = at ?? this.engine.time ?? 0;
    this._plays.push({ name, at: t, speed, restart });
    this._plays.sort((a, b) => a.at - b.at);
    if (this._n >= 0 && t <= this._n / this.opts.dynamicsFps) this._n = -1; // in the past → re-simulate
    return this;
  }

  on(ev, fn) { (this._listeners[ev] ||= []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const l = this._listeners[ev]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } return this; }
  _emit(ev, e) { for (const fn of this._listeners[ev] || []) fn(e); }

  get state() {
    const s = this._s;
    if (!s) return { clip: 'idle', frame: 0 };
    return { clip: s.shown.clip, frame: s.shown.frame, keyIndex: s.shown.keyIndex, facing: s.k, facingYaw: s.facingYaw,
      mode: this.gait?.mode ?? 'idle', run: this.gait?.run ?? false, speed: this.gait?.speed ?? 0, phase: this.gait?.phi ?? 0,
      action: s.action?.name ?? null, poseCount: s.poseCount };
  }

  /** World ankle targets of the displayed feet (planted feet are exactly fixed in the world). */
  feet() {
    const f = this._s?.shownFeet;
    if (!f) return null;
    const out = {};
    for (const [k, v] of Object.entries(f)) out[k] = { pos: v.pos.clone(), planted: v.planted, yaw: v.yaw };
    return out;
  }

  // ------------------------------------------------------------------------------------------------ update
  update(t) {
    const fps = this.opts.dynamicsFps;
    const N = Math.max(0, Math.floor(t * fps + 0.01));   // 0.01-step tolerance: capture times like 5.0333 hit step 302
    if (this._n < 0 || N < this._n || N - this._n > fps) {
      this._emit('reset', { t });
      this._resetSim();
    }
    while (this._n < N) this._step(this._n + 1);
    this._placeRoot(t);
    this._clockUniforms(t);
  }

  // (module fix, look rows) uCharTime = this Character's clock on every character material (a frozen stage t= freezes
  // glow/flicker written against it), and spec.lights: [{ socket | bone, color '#FFB060', intensity 2.6 (night) or
  // [day, dusk, night], distance 2.4, decay 1.5, nightOnly true, flicker { fps 7.5, levels [0.62, 0.78, 0.9, 1], seed 17 }
  // | false, at [x,y,z] }] — PointLights under the socket (they exist at every time of day: constant light count),
  // night factor from the toon ramp like the keeper/moth scene lights, flicker stepped on the Character clock.
  _clockUniforms(t) {
    if (!this._lookMats?.length) {
      this._lookMats = [];
      this.root.traverse((o) => { for (const m of [].concat(o.material || [])) if (m?.userData?.look?.uniforms?.uCharTime) this._lookMats.push(m.userData.look.uniforms.uCharTime); });
    }
    if (!this._lights) {
      this._lights = (this.spec.lights || []).map((L) => {
        const s = this.rig.sockets?.[L.socket] ?? this.bones[L.bone ?? L.socket];
        if (!s) { console.warn(`spec.lights: no socket/bone '${L.socket ?? L.bone}'`); return null; }
        const pl = new THREE.PointLight(new THREE.Color(L.color ?? '#FFB060'), 0, L.distance ?? 2.4, L.decay ?? 1.5);
        pl.name = `char-light:${L.socket ?? L.bone}`;
        if (L.at) pl.position.fromArray(L.at);
        s.add(pl);
        return { pl, L };
      }).filter(Boolean);
    }
    for (const u of this._lookMats) u.value = t;
    if (!this._lights.length) return;
    const c = this.engine.toonUniforms?.uRampHi?.value;
    const l = c ? 0.299 * c.r + 0.587 * c.g + 0.114 * c.b : 1;
    const u = Math.min(1, Math.max(0, (l - 0.35) / 0.25)), night = 1 - u * u * (3 - 2 * u);
    const lvl = l < 0.45 ? 2 : l < 0.85 ? 1 : 0;
    for (const { pl, L } of this._lights) {
      let I = Array.isArray(L.intensity) ? L.intensity[lvl] : (L.intensity ?? 2.6) * (L.nightOnly === false ? 1 : night);
      const F = L.flicker === false ? null : { fps: 7.5, levels: [0.62, 0.78, 0.9, 1.0], seed: 17, ...(L.flicker || {}) };
      if (F) {
        const step = Math.floor(t * F.fps + 0.001);
        const qx = Math.imul(step | 0, 1597334673) >>> 0, qy = Math.imul(F.seed, 3812015801 | 0) >>> 0;
        const h = (Math.imul((qx ^ qy) >>> 0, 1597334673) >>> 0) / 4294967295;
        I *= F.levels[Math.min(F.levels.length - 1, Math.floor(h * F.levels.length))];
      }
      pl.intensity = I;
    }
  }

  _sample(t) {
    const d = this._drive ? this._drive(t) || {} : {};
    const pos = d.pos ? d.pos.clone() : this.home.clone();
    const g = this.opts.ground;
    if (g && d.pos) pos.y = g.heightAt(pos.x, pos.z);
    return { pos, face: d.face, action: d.action ?? null, look: d.look ?? this.opts.look };
  }

  _resetSim() {
    const d0 = this._sample(0);
    const pers = this.spec.personality || {};
    const camYaw = this.engine.camera.targetYaw ?? 0;
    const step = TAU / this.opts.facingSteps;
    const face0 = d0.face ?? this.opts.face ?? 0;
    const k0 = Math.round((face0 - camYaw) / step);
    const yaw0 = camYaw + k0 * step;
    const bodyP = resolveParams(pers.body || 'lean'), headP = resolveParams(pers.head || 'head');
    this._s = {
      prevPos: d0.pos.clone(), vel: new THREE.Vector3(), heading: face0, desired: face0, k: k0, facingYaw: yaw0, lastTurnG: -99,
      velF: new SecondOrder(3, 1, 0, new THREE.Vector3()), prevVelF: new THREE.Vector3(),
      lean: new SecondOrder(bodyP.f, bodyP.z, bodyP.r, new THREE.Vector2()),
      chestYaw: new SecondOrderAngle(bodyP.f, Math.max(0.5, bodyP.z), 0, yaw0),
      headYaw: new SecondOrderAngle(headP.f, headP.z, headP.r, yaw0),
      lastDriveAction: null, pending: [], playIdx: 0,
      action: null, loopClip: null, idleG0: 0, g: -1,
      shown: { clip: null, frame: -1, keyIndex: -1, key: null, sig: null, g: -99, gaitG: -99, dyn: null },
      queued: [], lastEvG: -1, poseCount: 0, look: d0.look, actionLegs: false,
      shownFeet: null, rootOffset: null,
    };
    if (this.gait) this.gait.reset(d0.pos, yaw0, this.opts.ground);
    // (lead) cached rigid shape too: re-sim must start like the first run. (motion r5) and every link's L.dir: a stale
    // direction from the previous run was aimed on the first drawing → 6-13 px chain pop at frame 4 of every clip
    for (const c of this._chains) { c.init = false; c.cached = false; for (const L of c.links) L.dir = null; }
    this._n = -1;
    this.root.position.copy(d0.pos);
    this.root.rotation.set(0, yaw0, 0);
    this.root.updateMatrixWorld(true);
  }

  _step(n) {
    const s = this._s, o = this.opts, dt = 1 / o.dynamicsFps, t = n / o.dynamicsFps;
    this._n = n;
    const d = this._sample(t);
    if (n === 0) s.prevPos.copy(d.pos);
    s.vel.subVectors(d.pos, s.prevPos).divideScalar(dt); s.vel.y = 0;
    s.prevPos.copy(d.pos);
    const speed = Math.hypot(s.vel.x, s.vel.z);
    if (speed > 0.05) s.heading = Math.atan2(s.vel.x, s.vel.z);
    if (d.face !== undefined) s.desired = d.face;
    else if (speed > 0.2) s.desired = s.heading;
    s.look = d.look;
    // drive-triggered actions / recorded play() calls → start on the next grid frame
    if (d.action && d.action !== s.lastDriveAction && this.spec.clips?.[d.action]) s.pending.push({ name: d.action, speed: 1, drive: true });
    // (motion r5) a HELD one-shot started by the drive (vote, die) is released when the drive stops returning its name
    if (s.action?.held && s.action.drive && d.action !== s.action.name && !s.pending.length) s.release = true;
    s.lastDriveAction = d.action;
    while (s.playIdx < this._plays.length && this._plays[s.playIdx].at <= t + EPS) s.pending.push(this._plays[s.playIdx++]);

    // dynamics at the fixed step
    const vf = s.velF.update(dt, s.vel);
    const acc = new THREE.Vector3().subVectors(vf, s.prevVelF).divideScalar(dt); s.prevVelF.copy(vf);
    const fx = Math.sin(s.facingYaw), fz = Math.cos(s.facingYaw);
    const aF = acc.x * fx + acc.z * fz, aS = acc.x * fz - acc.z * fx;   // forward, left
    // (module fix M4) locomotion.accelLean = [back, fwd, side] degree caps of the acceleration lean (default [10, 14, 10];
    // a number = all three). A tall held prop tipped 25-30° under the 14° standing-start lean: e.g. accelLean 4
    const AL = this._accelLean ||= (() => { const a = this.spec.locomotion?.accelLean; return Array.isArray(a) ? a : a !== undefined ? [a, a, a] : [10, 14, 10]; })();
    s.lean.update(dt, new THREE.Vector2(clamp(aF * 3, -AL[0], AL[1]), clamp(aS * 3, -AL[2], AL[2])));
    s.chestYaw.update(dt, s.facingYaw);
    s.headYaw.update(dt, s.facingYaw);

    if (this.gait) {
      this.gait.step({ dt, t, body: d.pos, vel: s.vel, heading: s.heading, facing: s.facingYaw, ground: o.ground,
        frozenLegs: s.actionLegs });
      for (const e of this.gait.takeEvents()) s.queued.push(e);
    }
    this._stepChains(dt, d.pos, s.facingYaw);

    const g = Math.floor((n * o.gridFps) / o.dynamicsFps + EPS);  // integer maths: n/60*30 can land at 150.99999
    if (g !== s.g) { s.g = g; this._gridFrame(g, t, d); }
  }

  // one 30 Hz key-grid frame: facing steps, clip switches, decide whether a new drawing is shown
  _gridFrame(g, t, d) {
    const s = this._s, o = this.opts;
    const cam = this.engine.camera.targetYaw ?? 0;
    const step = TAU / o.facingSteps;
    // facing: target sector with hysteresis, then one step per turnHold grid frames
    const rel = wrap(s.desired - (cam + s.k * step));
    let target = s.k;
    if (Math.abs(rel) > step / 2 + o.hysteresis * D2R) target = s.k + Math.round(rel / step);
    // the step itself is applied in "decide" below: it is a new drawing, so it waits for minHold like every other
    const wantTurn = target !== s.k && g - s.lastTurnG >= o.turnHold;
    s.facingYaw = cam + s.k * step;

    // clips
    let switched = false;
    while (s.pending.length) {
      const p = s.pending.shift();
      const clip = p.name === 'idle' ? this.idleClip : this.spec.clips?.[p.name];
      if (!clip) continue;
      if (p.name === 'idle' && s.action?.held) { s.action = null; s.release = false; s.snapChains = true; switched = true; }   // play('idle') releases a hold
      if (clip.loop && !['walk', 'run'].includes(p.name)) { s.loopClip = p.name === 'idle' ? null : { name: p.name, clip, g0: g }; s.idleG0 = g; switched = true; continue; }
      if (s.action && s.action.name === p.name && p.restart === false) continue;
      // clip.hold: stay on the last key until another clip is played / the drive releases it (default for 'vote'
      // and 'die', the cast's raise-and-hold and collapse-and-stay clips; hold: false opts out)
      const held = !!(clip.hold ?? ['vote', 'die'].includes(p.name));
      s.action = { name: p.name, clip, g0: g, speed: p.speed ?? 1, legs: this._clipHasLegs(clip), held, drive: !!p.drive };
      s.release = false;
      s.lastEvG = g - 1;
      switched = true;
    }
    let layer, ev = null;
    if (s.action) {
      ev = evaluateClip(s.action.clip, (g - s.action.g0) / o.gridFps * s.action.speed + EPS);
      const gc = Math.floor((g - s.action.g0) * s.action.speed + EPS);
      for (const e of eventsBetween(s.action.clip, s.lastEvG - s.action.g0, gc)) s.queued.push({ name: e.name, clip: s.action.name, frame: e.frame });
      s.lastEvG = s.action.g0 + gc;
      // the clip's last key is held ≥ minHold grid frames before returning to idle/locomotion (no 1-frame end key)
      if (ev.done && s.shown.clip === s.action.name && g - s.shown.g < o.minHold) ev = { ...ev, done: false };
      if (ev.done && s.action.held && !s.release) ev = { ...ev, done: false };       // held on the last key
      if (ev.done) {
        if (s.action.legs && this.gait) this._replantFeet();
        // 'hold' actions end with the chains snapped to rest on the return drawing (the big body change hides the
        // jump) instead of 4-6 settle drawings after it
        if ((s.action.clip.dynamics ?? 'hold') === 'hold') s.snapChains = true;
        s.action = null; s.idleG0 = g; ev = null; switched = true;
      }
    }
    const moving = this.gait && this.gait.mode === 'move';
    s.actionLegs = !!(s.action && s.action.legs && !moving);
    const ik = this.gait?.idleKey?.() ?? null;                 // gait-owned idle drawings (fly: hover flap)
    if (s.action) layer = { clip: s.action.name, frame: ik ? `${ev.frame}|${ik}` : ev.frame, clipFrame: ev.frame, keyIndex: ev.keyIndex, key: ev.key };
    else if (moving) {
      const b = this.gait.bucket();
      layer = { clip: this.gait.clipName, frame: b, keyIndex: Number(String(b).split(':')[1]) || 0, key: null, gait: true };
    } else {
      const lc = s.loopClip?.clip || this.idleClip;
      const name = s.loopClip?.name || 'idle';
      ev = evaluateClip(lc, (g - s.idleG0) / o.gridFps + EPS);
      const gc = g - s.idleG0;
      for (const e of eventsBetween(lc, gc - 1, gc)) s.queued.push({ name: e.name, clip: name, frame: e.frame });
      layer = { clip: name, frame: ik ? `${ev.frame}|${ik}` : ev.frame, clipFrame: ev.frame, keyIndex: ev.keyIndex, key: ev.key };
    }

    // decide. EVERY new drawing is held ≥ minHold grid frames (CHARACTERS.md §1: turns are 45° steps held ≥ 2 grid
    // frames; no 1-grid-frame drawings) — authored key / gait bucket / locomotion-mode changes, facing steps, idle
    // recovery steps, dynamics-only redraws and touchdowns alike. Only real clip switches (play / action start / end)
    // and smear keys (an action key that is, or follows, a smear contact) cut in immediately. Optional redraws
    // (facing steps, dynamics, idle steps) are also skipped when an authored key lands within minHold-1 frames, so the
    // optional drawing can never be the one left on screen for a single frame; a pending facing step instead rides
    // on the next drawing that is shown anyway.
    const sh = s.shown;
    const since = g - sh.g;
    const first = sh.clip === null;
    const ready = since >= o.minHold;
    const smearKey = !!(s.action && (layer.key?.smear || (sh.clip === layer.clip && sh.key?.smear)));
    // (module fix, equal-key pop) an authored key whose pose equals the drawing on screen is NOT a new drawing (honk die:
    // keys f22 and f60 both DIE_END redrew 105 px at f60 from the dynamics that had drifted during the hold)
    const samePose = !switched && !layer.gait && !smearKey && !!ev && layer.clip === sh.clip && layer.frame !== sh.frame &&
      String(layer.frame) === String(layer.clipFrame) && sh.poseSig !== undefined && JSON.stringify(ev.poseMap) === sh.poseSig;
    const keyChange = (layer.frame !== sh.frame || layer.clip !== sh.clip) && !samePose;
    const quiet = ready && !this._keyAhead(g, layer);
    let show = first || switched;
    if (!show && keyChange && (ready || smearKey)) show = true;
    // (motion r5c) LegGait: idle → walk/run is a clip switch and cuts in on the first grid frame (a game player starts
    // at full speed: 4 H/s glides 0.27 m in a 2-frame idle hold, the idle feet ran out of reach and rode the body)
    if (!show && layer.gait && this.gait.plan !== undefined && sh.clip !== 'walk' && sh.clip !== 'run') show = true;
    let turned = false;
    if (wantTurn && (show || quiet)) {
      s.k += Math.sign(target - s.k); s.lastTurnG = g; turned = true; show = true;
      s.facingYaw = cam + s.k * step;
    }
    const dyn = this._dynQuant();
    const quietDyn = quiet && since >= 2;
    // LegGait while moving: its quantised drawings (every ~2 grid frames) are the only redraws — a dynamics or
    // touchdown redraw of the same drawing would re-solve the planted legs at a later body position (extra drawing,
    // out of reach); lean/chains are picked up by the next gait drawing
    const gaitOwns = moving && this.gait.plan !== undefined;
    // idle steps. (module fix M8) a recovery / stop step is two drawings (mid-swing at its start, then the landing):
    // redraw when the gait's stepKey changes, not on twos for the whole swing (robed chibis: ~11 redraws after a turn)
    const stepKey = this.gait?.stepKey ? this.gait.stepKey() : null;
    if (!show && this.gait && !moving && (stepKey !== null ? stepKey !== (sh.stepKey ?? '') && ready : quietDyn && this.gait.airborne)) show = true;
    // (motion r5) action holds stay still: no dynamics-only redraws while a one-shot plays (clip.dynamics 'hold',
    // default; 'snap' also snaps chains to their rigid-follow direction on every key; 'free' = old behaviour)
    // (module fix M5) loop clips (idle, talk, ghost) honour clip.dynamics too; their default stays 'free' (unchanged)
    const dynMode = s.action ? (s.action.clip.dynamics ?? 'hold') : moving ? 'free' : ((s.loopClip?.clip || this.idleClip).dynamics ?? 'free');
    if (!show && quietDyn && dyn !== sh.dyn && dynMode === 'free' && !gaitOwns) show = true;      // dynamics
    if (!show && ready && !gaitOwns && s.queued.some((e) => e.name === 'step')) show = true;       // touchdown frame
    if (!show) {
      // (module fix, fx: events mid-hold) clip events fire on their own grid frame, not at the next drawing (footsteps
      // still wait for their drawing)
      if (s.queued.some((e) => e.name !== 'step')) {
        const q = s.queued.filter((e) => e.name !== 'step'); s.queued = s.queued.filter((e) => e.name === 'step');
        for (const e of q) this._emit('event', { t, ...e });
      }
      return;
    }

    if (sh.clip !== layer.clip) this._emit('clip', { t, from: sh.clip, to: layer.clip });
    sh.clip = layer.clip; sh.frame = layer.frame; sh.keyIndex = layer.keyIndex; sh.key = layer.key;
    sh.g = g; if (layer.gait) sh.gaitG = g; sh.dyn = dyn;
    sh.poseSig = ev && !layer.gait ? JSON.stringify(ev.poseMap) : undefined;
    sh.stepKey = stepKey ?? '';
    this._showPose(t, d, ev);
    sh.dyn = this._dynQuant();                                   // after the pose: chain init/snap inside it is not a change
    s.poseCount++;
    this._emit('pose', { t, clip: sh.clip, frame: sh.frame, key: sh.key, keyIndex: sh.keyIndex, facing: s.k });
    const q = s.queued; s.queued = [];
    for (const e of q) this._emit('event', { t, ...e });
  }

  // an authored key change (or the end of the action) within the next minHold-1 grid frames? (actions + idle/loop
  // clips; gait buckets are not predictable and are held by minHold anyway)
  _keyAhead(g, layer) {
    const s = this._s, o = this.opts;
    if (layer.gait) return false;
    for (let j = 1; j < o.minHold; j++) {
      let e;
      if (s.action) e = evaluateClip(s.action.clip, (g + j - s.action.g0) / o.gridFps * s.action.speed + EPS);
      else e = evaluateClip(s.loopClip?.clip || this.idleClip, (g + j - s.idleG0) / o.gridFps + EPS);
      if (e.done && s.action?.held && !s.release) e = { ...e, done: false };
      if (e.done || e.frame !== (layer.clipFrame ?? layer.frame)) return true;
    }
    return false;
  }

  // quantised dynamics channels (a change → a new drawing on twos)
  _dynQuant() {
    const s = this._s;
    const l = s.lean.value;
    const c = wrap(s.chestYaw.value - s.facingYaw) * R2D, h = wrap(s.headYaw.value - s.facingYaw) * R2D;
    // quanta (lead: opts.quant, default {lean 1.5°, yaw 3°, chain 12 steps per unit}); coarser quanta = fewer, bigger
    // dynamics-only drawings (a 90° turn's 3° head/chest catch-up redrew on twos for ~1 s)
    const Q = { lean: 1.5, yaw: 3, chain: 12, ...(this.opts.quant || {}) };
    // (module fix, head-lag / M8 tail) quant.lag 'settle' (default): the chest/head yaw lag after a facing step does not
    // trigger its own redraws while it creeps back (4-11 dynamics-only drawings per turn); it shows on the drawings that
    // happen anyway (facing steps, keys) plus ONE settle drawing when it is back inside one quantum. 'step' = old.
    const cq = Math.round(c / Q.yaw), hq = Math.round(h / Q.yaw);
    const lagSig = (this.opts.quant?.lag ?? 'settle') === 'step' ? `${cq}|${hq}` : (cq || hq ? 'lag' : '0|0');
    let sig = `${Math.round(l.x / Q.lean)}|${Math.round(l.y / Q.lean)}|${lagSig}`;
    for (const ch of this._chains) for (const L of ch.links) if (L.dir) sig += `|${Math.round(L.dir.x * Q.chain)},${Math.round(L.dir.y * Q.chain)},${Math.round(L.dir.z * Q.chain)}`;
    return sig;
  }

  _clipHasLegs(clip) {
    const bones = clipInfo(clip).bones;
    return this._legBones.some((b) => bones.includes(b));
  }

  // action clips that key the legs (idle): the FK ankle of each key is dropped onto the ground and PLANTED there
  // (feet move only on key frames; a lunge's smooth root offset then stretches the stance instead of sliding feet)
  _groundActionFeet() { this._replantFeet(); }

  _replantFeet() {
    const g = this.opts.ground;
    for (const l of this.gait.legs) {
      const f = l.foot;
      const ft = this.bones[l.bones[2]];
      ft.updateWorldMatrix(true, false);
      f.pos.setFromMatrixPosition(ft.matrixWorld);
      f.pos.y = (g ? g.heightAt(f.pos.x, f.pos.z) : 0) + l.ankleY;
      f.state = 'plant'; f.yaw = this._s.facingYaw; f.pitch = 0;
    }
  }

  // compose + apply the displayed pose for the state at time t (a grid frame)
  _showPose(t, d, ev) {
    const s = this._s, rig = this.rig, B = this.gait?.bones;
    let pose;
    const moving = this.gait && this.gait.mode === 'move';
    const lean = [s.lean.value.x, s.lean.value.y];
    if (moving) pose = this.gait.bodyPose({ lean });
    else {
      const lc = s.loopClip?.clip || this.idleClip;
      pose = { ...evaluateClip(lc, (s.g - s.idleG0) / this.opts.gridFps + EPS).poseMap };
      // idle lean (after stops: the overshoot of the body dynamics); pitch / roll by each bone's rest axis
      if (B) this._addRot(pose, B.spine, lean[0] * 0.5, 0, lean[1] * 0.4), this._addRot(pose, B.chest, lean[0] * 0.4, 0, lean[1] * 0.3), this._addRot(pose, B.head, -lean[0] * 0.4, 0, -lean[1] * 0.3);
    }
    let keyed = null;
    if (s.action && ev) {
      keyed = new Set(Object.keys(ev.poseMap));
      for (const [k, v] of Object.entries(ev.poseMap)) {
        if (moving && this._legBones.includes(k)) continue;
        if (k === 'pos') { if (!moving) pose.pos = v; continue; }
        pose[k] = v;
      }
    }
    if (!moving && this.gait?.idleOverlay) this.gait.idleOverlay(pose, keyed);   // fly: hover + flap under idle/actions
    // (module fix, wave 3: shared ghost) spec.ghost: the displayed clip's ghost level (clip.ghost 1 | 2/'spent'/0.5 | 0;
    // default 1 for 'ghost', 2 for 'ghost-spent'; ch.ghost overrides, e.g. a dead player walking) drives the material and
    // the halo; ghost loop clips hover by spec.ghost.hover and keep FK legs (no leg-IK hip dip, which ate ≤ 0.1 m of
    // every hover: the "+0.1 on pos" workaround). clip.legs 'float' does the same on any loop clip.
    const lc0 = s.action ? s.action.clip : moving ? null : (s.loopClip?.clip || this.idleClip);
    const gLv = this.spec.ghost ? this._ghostLevel(lc0, s.action ? s.action.name : moving ? null : (s.loopClip?.name || 'idle')) : 0;
    const floatLegs = !moving && !s.action && !!lc0 && (lc0.legs === 'float' || (gLv > 0 && lc0.legs !== 'ik'));
    if (this.spec.ghost) {
      this._ghostO ||= ghostOpts(this.spec.ghost);
      if (gLv > 0 && this._ghostO.hover && !moving) { const b = pose.pos ?? [0, 0, 0]; pose.pos = [b[0], b[1] + this._ghostO.hover, b[2]]; }
      rig.setGhost(gLv, s.g);   // (halo boost) + the displayed grid frame: the halo's stepped glint / glow (rig.js HALO)
    }
    // personality: chest lags the facing steps, head leads/lags with its own filter. (motion r5) the displayed offsets
    // are QUANTISED to quant.yaw, so a post-turn settle is a few whole steps (≤ 30/quant drawings), not a 1° crawl
    if (B) {
      const Qy = Math.max(0.5, this.opts.quant?.yaw ?? 3);
      const qz = (x) => Math.round(x / Qy) * Qy;
      const chestOff = qz(clamp(wrap(s.chestYaw.value - s.facingYaw) * R2D, -30, 30));
      const headOff = qz(clamp(wrap(s.headYaw.value - s.chestYaw.value) * R2D, -40, 40));
      this._addRot(pose, B.spine, 0, chestOff * 0.4, 0);
      this._addRot(pose, B.chest, 0, chestOff * 0.6, 0);
      this._addRot(pose, B.head, 0, headOff, 0);
    }
    rig.applyPose(pose, { update: false });
    if (B && this.bones[B.hips]) s.hipsBase = this.bones[B.hips].position.clone();
    // root at the pose time
    this._setRoot(d.pos, t);
    this.root.updateMatrixWorld(true);
    // legs
    if (this.gait && this.gait.legs.length) {
      if (s.actionLegs && s.action.clip.legs !== 'fk' && s.action.groundKey !== s.shown.keyIndex) { this._groundActionFeet(); s.action.groundKey = s.shown.keyIndex; }
      if ((s.actionLegs && s.action.clip.legs === 'fk') || floatLegs) s.shownFeet = null;
      else {
        s.shownFeet = this.gait.displayFeet(d.pos, this.opts.ground);
        this._solveLegs();
        s.poseRoot = this.root.position.clone();
      }
    }
    this._applyChains(d.pos);
    if (s.look) lookAt(rig, [B?.neck ?? 'neck', B?.head ?? 'head'].filter((n) => this.bones[n]), s.look, { ...this.opts.lookLimits, weights: [0.35, 0.65] });
    this.root.updateMatrixWorld(true);
    updateLook(this.engine, rig);
  }

  _ghostLevel(clip, name) {
    if (this.ghost !== undefined && this.ghost !== null) return this.ghost;
    const g = clip?.ghost;
    if (g !== undefined) return g === 2 || g === 0.5 || g === 'spent' ? 2 : g ? 1 : 0;
    return name === 'ghost' ? 1 : name === 'ghost-spent' ? 2 : 0;
  }

  _add(pose, bone, v) {
    if (!bone || !this.bones[bone]) return;
    const b = pose[bone] ?? [0, 0, 0];
    pose[bone] = [b[0] + v[0], b[1] + v[1], b[2] + v[2]];
  }
  // add a rotation given as (pitch fwd+, yaw left+, roll left+) degrees to a midline bone: vertical bones (biped spine)
  // take [pitch, yaw, roll], horizontal ones (quadruped spine, fish body) [pitch, roll, yaw] (rig.js triple table)
  _addRot(pose, bone, pitch, yaw, roll) {
    if (!bone || !this.bones[bone]) return;
    const vert = Math.abs(this.rig.info[bone].axes.twist.y) > 0.7;
    this._add(pose, bone, vert ? [pitch, yaw, roll] : [pitch, roll, yaw]);
  }

  // legIK 'plant' | 'frame' | 'pose' (see header). onlyPlanted: per-frame re-pin of planted feet ('plant'), hips held.
  _solveLegs(onlyPlanted = false) {
    const s = this._s, G = this.gait, F = s.shownFeet;
    if (!F) return;
    const hipsName = G.bones.hips;
    const hipsBone = hipsName ? this.bones[hipsName] : null;
    if (hipsBone && this.opts.dip !== false && !onlyPlanted) {
      // reach safety net: if a planted ankle is out of reach (root glided on during a hold, lunges), dip the hips
      // (whole texels, ≤ 0.1 m) instead of letting the IK clamp drag the foot
      if (s.hipsBase) { hipsBone.position.copy(s.hipsBase); hipsBone.updateMatrixWorld(true); }
      let dy = 0;
      for (const l of G.legs) {
        // (module fix M15) only PLANTED feet pull the hips down: a swing foot out of reach (an authored airborne `pos`, a
        // hop's tucked feet) used to cancel the lift by dipping the whole body
        if (F[l.key] && F[l.key].planted === false) continue;
        const f = F[l.key]?.pos; if (!f) continue;
        const hip = new THREE.Vector3().setFromMatrixPosition(this.bones[l.bones[0]].matrixWorld);
        const Lr = l.legLen * 0.995;
        const h = Math.hypot(f.x - hip.x, f.z - hip.z), v = hip.y - f.y;
        if (h < Lr && Math.hypot(h, v) > Lr) dy = Math.max(dy, v - Math.sqrt(Lr * Lr - h * h));
      }
      if (dy > 0) {
        const tw = this.engine.camera.texelWorld || 0.0278;
        dy = Math.min(0.1, Math.ceil(dy / tw - 1e-3) * tw);
        hipsBone.position.y -= dy; hipsBone.updateMatrixWorld(true);
      }
    }
    const fwd = new THREE.Vector3(Math.sin(s.facingYaw), 0, Math.cos(s.facingYaw));
    const left = new THREE.Vector3(Math.cos(s.facingYaw), 0, -Math.sin(s.facingYaw));
    for (const l of G.legs) {
      const f = F[l.key];
      if (!f || (onlyPlanted && !f.planted)) continue;
      const [th, sh, ft] = l.bones;
      const hip = new THREE.Vector3().setFromMatrixPosition(this.bones[th].matrixWorld);
      // per-frame re-pin: past reach (short legs at game speed, the last frame of a 3-frame hold) the IK clamps the
      // foot onto the hip→plant line at full extension — the toe trails and lifts a little (a push-off) and drifts
      // only by the excess over reach (motion r5c; r5 kept the last shape and rode the body: 6 texels for the bird)
      const fy = new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
      const pole = l.legacy
        ? hip.clone().add(fwd.clone().add(fy).normalize()).addScaledVector(left, l.side * 0.12)
        : hip.clone().add(fwd.clone().add(fy).normalize().multiplyScalar(l.pole)).addScaledVector(left, l.side * 0.12);
      const endQuat = new THREE.Quaternion().setFromAxisAngle(UP, f.yaw)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), f.pitch * D2R));
      const r = solveTwoBone(this.rig, th, sh, ft, f.pos, pole, { endQuat });
      (this.ikInfo ||= {})[l.key] = +r.stretch.toFixed(4);
    }
  }

  _setRoot(pos, t) {
    const s = this._s;
    const p = pos.clone();
    // smooth root offset of the action clip (lunges), character space → world
    if (s.action) {
      const r = evaluateClip(s.action.clip, Math.max(0, t - s.action.g0 / this.opts.gridFps) * s.action.speed).root;
      if (r) p.add(new THREE.Vector3(r[0], r[1], r[2]).applyAxisAngle(UP, s.facingYaw));
    }
    // (motion r5c) LegGait stance surge: short legs at game speed slow the displayed body while a foot is planted
    if (this.gait?.rootOffset) p.add(this.gait.rootOffset(new THREE.Vector3()));
    if (this.opts.snap) this.engine.camera.snapWorld(p, p);
    this.root.position.copy(p);
    this.root.rotation.set(0, s.facingYaw, 0);
  }

  // every rendered frame: the root glides (snapped); the drawing is held; planted feet stay put
  _placeRoot(t) {
    const s = this._s;
    const d = this._sample(t);
    this._setRoot(d.pos, t);
    this.root.updateMatrixWorld(true);
    if (this.opts.legIK === 'frame' && this.gait && s.shownFeet) {
      this._solveLegs();
      this.root.updateMatrixWorld(true);
    } else if (this.opts.legIK === 'plant' && this.gait && s.shownFeet && s.poseRoot && !s.poseRoot.equals(this.root.position) &&
        !(this.gait.plantMode === 'hold' && (this.gait.mode === 'move' || this._holdStart()))) {   // (module fix M3) 'hold' plants: drawn once per drawing
      // (motion r5) the drawing holds; only legs whose displayed foot is PLANTED are re-pinned while the root glides
      // (0 world slide at every frame; swing legs and hips stay as drawn). Standing still: nothing re-solves.
      this._solveLegs(true);
      this.root.updateMatrixWorld(true);
    }
  }

  // (module fix M18, wave 3) a LegGait 'hold' walk starting: the root already travels at drive speed while the idle
  // drawing is still on screen (the walk cuts in on the next grid frame). Re-pinning the idle feet on that 60 Hz frame
  // redrew the legs alone (50-105 px "same-pose" flicker, once per walk start: requin, opal, cilantro, progress, mincut,
  // polly); a hold-mode leg holds like every other bone until the next drawing. Slow root moves (turns) keep the re-pin.
  _holdStart() {
    const g = this.gait, v = this._s?.vel;
    return g.plan !== undefined && !!v && Math.hypot(v.x, v.z) > (g.p?.vStart ?? 0.25);
  }

  // ------------------------------------------------------------------------------------------------ chains
  // spec.chains: [{ name, bones?: [...] (default name0..), f, zeta, r | preset, gravity 0..1, drag 1, limit 70 (deg from
  //   the rigid-follow direction), falloff 0.85 (f per link), noForward (capes: never swing in front of the body) }]
  _buildChains(list) {
    const out = [];
    const skel = this.spec.skeleton || this.spec.bones || [];
    const skelAxis = (n) => { const e = Array.isArray(skel) ? skel.find((b) => b.name === n) : null; return Array.isArray(e?.axis) ? new THREE.Vector3(...e.axis).normalize() : null; };
    for (const c of list) {
      let names = c.bones;
      if (!names) { names = []; for (let i = 0; this.bones[`${c.name}${i}`]; i++) names.push(`${c.name}${i}`); }
      names = names.filter((n) => this.bones[n]);
      if (!names.length) continue;
      const p = resolveParams(c.preset || (c.f ? { f: c.f, zeta: c.zeta, r: c.r } : 'cape'));
      const links = names.map((n, i) => {
        const bone = this.bones[n];
        const next = this.bones[names[i + 1]];
        // tip link (no child): its OWN rest axis × its length (motion r5; was the previous link's offset, so curved
        // chains aimed the tip along the parent). Single-link chains keep the legacy 'down' lever unless tip: 'axis'.
        const ax = skelAxis(n);
        let childLocal;
        if (next) childLocal = next.position.clone();
        else if (i > 0 && this.bones[names[i - 1]].children.includes(bone)) childLocal = ax ? ax.multiplyScalar(bone.position.length()) : bone.position.clone();
        else childLocal = c.tip === 'axis' && ax ? ax.multiplyScalar(c.len ?? 0.12) : new THREE.Vector3(0, -0.12, 0);
        const f = p.f * Math.pow(c.falloff ?? 0.85, i);
        return { name: n, bone, childLocal, len: childLocal.length(), sod: new SecondOrder(f, p.z, p.r, new THREE.Vector3()),
          restDirChar: new THREE.Vector3(0, -1, 0), originChar: new THREE.Vector3(), dir: null };
      });
      out.push({ name: c.name, links, gravity: c.gravity ?? 0.5, drag: c.drag ?? 1, limit: (c.limit ?? 70) * D2R, noForward: !!c.noForward, rigid: !!c.rigid, init: false });
    }
    return out;
  }

  // cache the rigid-follow shape of each chain (character space) from the just-applied base pose
  _cacheChains() {
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const q = new THREE.Quaternion(), rq = new THREE.Quaternion();
    this.root.getWorldQuaternion(rq); rq.invert();
    for (const c of this._chains) {
      c.links[0].bone.updateWorldMatrix(true, false);
      c.links[0].originChar.setFromMatrixPosition(c.links[0].bone.matrixWorld).applyMatrix4(inv);
      for (const L of c.links) {
        L.bone.updateWorldMatrix(true, false);
        L.bone.getWorldQuaternion(q);
        L.restDirChar.copy(L.childLocal).normalize().applyQuaternion(q).applyQuaternion(rq);
      }
      c.cached = true;
    }
  }

  _stepChains(dt, pos, yaw) {
    if (!this._chains.length) return;
    const rq = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const down = new THREE.Vector3(0, -1, 0);
    for (const c of this._chains) {
      if (!c.cached) continue;
      const o = c.links[0].originChar.clone().applyQuaternion(rq).add(pos);
      const oR = o.clone();
      for (const L of c.links) {
        const dirT = L.restDirChar.clone().applyQuaternion(rq).addScaledVector(down, 0.3 * c.gravity).normalize();
        // (module fix, multi-link settle) chain option rigid: true aims every link's spring at the RIGID chain shape
        // (tip targets accumulate the rest directions), so link k no longer chases link k-1's lag (one settle cascade
        // per drawing whatever f/zeta: wanderer scarf idle 4 settle redraws -> 2, stiff f 30 -> 0). Default: follow the parent.
        oR.addScaledVector(dirT, L.len);
        const tip = c.rigid ? oR.clone() : o.clone().addScaledVector(dirT, L.len);
        if (!c.init) L.sod.reset(tip);
        const D = L.sod.update(dt, tip);
        let dir = D.clone().sub(o);
        if (dir.lengthSq() < 1e-10) dir.copy(dirT); else dir.normalize();
        dir.lerpVectors(dirT, dir, c.drag).normalize();
        if (c.noForward) {                                    // capes: never swing forward into the body
          const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
          const lim = Math.max(0, dirT.dot(f)) + 0.05, fz = dir.dot(f);
          if (fz > lim) dir.addScaledVector(f, lim - fz).normalize();
        }
        const ang = dir.angleTo(dirT);
        if (ang > c.limit) { const ax = new THREE.Vector3().crossVectors(dirT, dir).normalize(); dir.copy(dirT).applyAxisAngle(ax, c.limit); }
        L.dir = dir;
        o.addScaledVector(dir, L.len);
      }
      c.init = true;
    }
  }

  _applyChains(pos) {
    if (!this._chains.length) return;
    this._cacheChains();
    const s = this._s;
    let snap = !!(s.action && s.action.clip.dynamics === 'snap' && s.action.snapKey !== s.shown.keyIndex);
    if (snap) s.action.snapKey = s.shown.keyIndex;
    // (module fix M5) a LOOP clip with dynamics 'snap' or 'hold' snaps its chains on every authored key change
    const lc = !s.action && !(this.gait && this.gait.mode === 'move') ? (s.loopClip?.clip || this.idleClip) : null;
    const lk = lc ? `${s.shown.clip}:${s.shown.keyIndex}` : null;
    if (lc && (lc.dynamics === 'snap' || lc.dynamics === 'hold') && s.loopSnapKey !== lk) { snap = true; s.loopSnapKey = lk; }
    const snapAll = snap || !!s.snapChains; s.snapChains = false;
    for (const c of this._chains) {
      // (motion r5) first drawing after a (re)start, or a 'snap' action key: aim at the rigid-follow target now
      // (gravity sag included) instead of showing the un-aimed rest shape and popping 2 frames later
      if (!c.init || snapAll) this._initChain(c, pos ?? this.root.position, s.facingYaw);
      for (const L of c.links) if (L.dir) aimBone(L.bone, L.dir, L.childLocal);
    }
  }

  _initChain(c, pos, yaw) {
    const rq = new THREE.Quaternion().setFromAxisAngle(UP, yaw), down = new THREE.Vector3(0, -1, 0);
    const o = c.links[0].originChar.clone().applyQuaternion(rq).add(pos);
    for (const L of c.links) {
      const dirT = L.restDirChar.clone().applyQuaternion(rq).addScaledVector(down, 0.3 * c.gravity).normalize();
      L.sod.reset(o.clone().addScaledVector(dirT, L.len));
      L.dir = dirT;
      o.addScaledVector(dirT, L.len);
    }
    c.init = true;
  }

  dispose() { this.engine.camera.snapObjectToTexel(this.root, { enabled: false }); this.rig.dispose?.(); }
}
