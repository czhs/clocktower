// Locomotion (motion owner): distance-phased gait with world-planted feet. CHARACTER_TECHNIQUES §5, research/06.
//
// The gait is a STRIDE WHEEL: the cycle phase φ advances with the distance travelled (φ += ds / C, C = stride =
// distance between two plants of the same foot), so feet never slide at any speed. Each foot has a phase offset
// (L 0, R 0.5) and a duty factor β (fraction of the cycle on the ground: walk ≈ 0.62 → double support, run ≈ 0.36 →
// flight). Pure 1-D form on a straight path (exported as `foot`):
//
//   p = frac(s/C + o)
//   stance (p < β):  z = βC/2 − p·C                         (foot fixed in the world, body moves over it)
//   swing  (p ≥ β):  u = (p − β)/(1 − β);  z = βC/2 − p·C + C·smooth(u);  y = h·sin(πu)
//
// The stateful `Gait` below does the same on any 2-D path: a foot is planted in WORLD space at touchdown and
// stays exactly there for the whole stance; the swing goes from the lift-off point to the predicted touchdown point
// (body + heading·((1−u)(1−β)C + βC/2)). Legs are IK'd onto the planted ankles (ik.solveTwoBone). Stops only
// happen on double support: when the body stops, a swinging foot finishes its swing in time, then idle "recovery
// steps" (one foot at a time) bring the feet back under the hips — also used for turning on the spot.
//
// Body (pose triples, displayed on pose frames only): hip bob twice per cycle (classic contact / down / pass / up;
// ≥ 1 texel, from the QUANTISED phase so a steady walk shows exactly `poses` drawings per cycle), hip drop for
// reach, pelvis twist + tilt, chest counter-twist, arms swinging opposite to the legs (elbows bend more when
// running), forward lean with speed. Walk/run is chosen by the Froude number Fr = v²/(g·hipHeight) (run above
// 0.5, back to walk below 0.4) and blended with a SecondOrder over ≈ 0.3 s. Authored `spec.clips.walk/run` (loop
// clips, keys over one cycle, f 0 = left foot contact) take precedence for the upper body; legs always come from the
// gait.
//
// spec.locomotion (all optional): walkSpeed 1.4, runSpeed 3.4, stride (STEP length at walkSpeed, m, one foot plant to
// the other: cycle = 2·stride; default 0.68·hip height), runStride (step length at runSpeed; default 1.8·stride);
// both are clamped to the leg reach (stance half-span ≤ reach·legLength, reach 0.45), duty [0.56, 0.36], lift [0.07, 0.12] (m), bob
// [0.028, 0.035] (m, ½ peak-to-peak), arms [34, 55] (deg), elbows [14, 80], lean [4, 12], twist [7, 11],
// poses [8, 6] (drawings per cycle), spacing (foot spacing, default hip width), runFroude [0.4, 0.5],
// bones: { legL: [thigh, shin, foot], legR: […], armL: [upper, fore], armR: […], hips, spine, chest, neck, head }.
import * as THREE from 'three';
import { SecondOrder } from './dynamics.js';
import { evaluateClipAtPhase, clipInfo } from './anim.js';

const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (u) => u * u * (3 - 2 * u);
const pair = (v, d) => (Array.isArray(v) ? v : v === undefined ? d : [v, v]);

/** Pure stride-wheel foot (see header). Returns {z, y, stance, u, p}: z along the path relative to the body. */
export function foot(s, S, o, beta, h) {
  const p = frac(s / S + o);
  if (p < beta) return { z: beta * S / 2 - p * S, y: 0, stance: true, u: 0, p };
  const u = (p - beta) / (1 - beta);
  return { z: beta * S / 2 - p * S + S * smooth(u), y: h * Math.sin(Math.PI * u), stance: false, u, p };
}

export const DEFAULT_BONES = {
  legL: ['thighL', 'shinL', 'footL'], legR: ['thighR', 'shinR', 'footR'],
  armL: ['upperArmL', 'forearmL'], armR: ['upperArmR', 'forearmR'],
  hips: 'hips', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head',
};
const SIDES = ['L', 'R'];
const G = 9.81;

/** Rest measurements of a biped rig (character space). */
export function measureLegs(rig, bones = DEFAULT_BONES) {
  const out = {};
  for (const s of SIDES) {
    const [th, sh, ft] = bones['leg' + s];
    const iT = rig.info[th], iS = rig.info[sh], iF = rig.info[ft];
    if (!iT || !iS || !iF) return null;
    out[s] = { hip: iT.restWorld.clone(), L1: iS.rest.length(), L2: iF.rest.length(), ankleY: iF.restWorld.y };
  }
  out.hipY = (out.L.hip.y + out.R.hip.y) / 2;
  out.legLen = (out.L.L1 + out.L.L2);
  out.ankleY = out.L.ankleY;
  out.hipWidth = Math.abs(out.L.hip.x - out.R.hip.x);
  return out;
}

export class Gait {
  constructor(rig, spec = {}, opts = {}) {
    this.rig = rig;
    const L = spec.locomotion || {};
    this.bones = { ...DEFAULT_BONES, ...(L.bones || {}) };
    this.m = measureLegs(rig, this.bones);
    if (!this.m) throw new Error('Gait: rig has no biped legs (spec.locomotion.bones)');
    const m = this.m;
    this.p = {
      walkSpeed: L.walkSpeed ?? 1.4, runSpeed: L.runSpeed ?? 3.4,
      stride: L.stride ?? 0.68 * m.hipY, runStride: L.runStride ?? null,
      duty: pair(L.duty, [0.56, 0.36]), lift: pair(L.lift, [0.07, 0.12]), bob: pair(L.bob, [0.028, 0.035]),
      arms: pair(L.arms, [34, 55]), elbows: pair(L.elbows, [14, 80]), lean: pair(L.lean, [4, 12]),
      twist: pair(L.twist, [7, 11]), poses: pair(L.poses, [8, 6]), spacing: L.spacing ?? m.hipWidth,
      runFroude: pair(L.runFroude, [0.4, 0.5]), reach: L.reach ?? 0.45,
      vStart: L.vStart ?? 0.25, vStop: L.vStop ?? 0.12,
      stepTime: L.stepTime ?? 0.27, maxSwing: L.maxSwing ?? 0.3, stepLift: L.stepLift ?? 0.05, stepTol: L.stepTol ?? 0.07, stepYaw: L.stepYaw ?? 35,
    };
    this.p.runStride ??= 1.8 * this.p.stride;
    this.walkClip = spec.clips?.walk || null;
    this.runClip = spec.clips?.run || null;
    this.reset();
  }

  reset(bodyPos = new THREE.Vector3(), yaw = 0, ground = null) {
    this.phi = 0; this.mode = 'idle'; this.run = false;
    this.runW = new SecondOrder(2.2, 1, 0, 0);
    this.speedF = new SecondOrder(4, 1, 0, 0);
    this.cycle = this.p.stride;
    this.time = 0; this.lastSpeed = 0; this.lastLand = -1;
    this.events = [];
    this.feet = {};
    for (const s of SIDES) {
      const f = { side: s, sign: s === 'L' ? 1 : -1, o: s === 'L' ? 0 : 0.5, state: 'plant', pos: new THREE.Vector3(), yaw,
        pitch: 0, lift: new THREE.Vector3(), liftYaw: yaw, land: new THREE.Vector3(), u: 0, t0: 0, dur: 0, h: 0, landYaw: yaw };
      this._idleSpot(bodyPos, yaw, f.sign, f.pos, ground);
      this.feet[s] = f;
    }
  }

  _ground(ground, x, z) { return ground ? ground.heightAt(x, z) : 0; }
  _idleSpot(body, yaw, sign, out, ground) {
    const sp = this.p.spacing / 2;
    out.set(body.x + Math.cos(yaw) * sp * sign, 0, body.z - Math.sin(yaw) * sp * sign);
    out.y = this._ground(ground, out.x, out.z) + this.m.ankleY;
    return out;
  }
  duty(w) { return lerp(this.p.duty[0], this.p.duty[1], w); }
  /** Cycle length (m) for speed v and run weight w, clamped so the stance half-span stays within leg reach. */
  cycleLength(v, w) {
    const { walkSpeed, runSpeed, stride, runStride } = this.p;
    const cw = 2 * stride * Math.pow(Math.max(0.2, v / walkSpeed), 0.45);
    const cr = 2 * runStride * Math.pow(Math.max(0.3, v / runSpeed), 0.6);
    const beta = this.duty(w);
    const maxC = 2 * this.p.reach * this.m.legLen / beta;
    return clamp(lerp(cw, cr, w), 0.15, maxC);
  }
  /** Hip drop (m) so the stance half-span is reachable with a slightly bent knee. */
  hipDrop(C, w) {
    const half = this.duty(w) * C / 2, L = this.m.legLen * 0.95, H = this.m.hipY - this.m.ankleY;
    return Math.max(0, H - Math.sqrt(Math.max(0, L * L - half * half))) + lerp(0.006, 0.03, w);
  }

  /**
   * One fixed simulation step. ctx = { dt, t, body: Vector3 (ground point under the root), vel: Vector3,
   * heading: rad (movement direction), facing: rad (displayed facing), ground, frozenLegs: bool }
   */
  step(ctx) {
    const { dt, body, vel, ground } = ctx;
    this.time = ctx.t;
    const v = Math.hypot(vel.x, vel.z);
    const vf = this.speedF.update(dt, v);
    const Fr = (vf * vf) / (G * this.m.hipY);
    if (!this.run && Fr > this.p.runFroude[1]) this.run = true;
    else if (this.run && Fr < this.p.runFroude[0]) this.run = false;
    const w = clamp(this.runW.update(dt, this.run ? 1 : 0), 0, 1);
    this.w = w; this.speed = vf;
    const heading = ctx.heading;
    const hx = Math.sin(heading), hz = Math.cos(heading);
    const lat = (sign) => [Math.cos(heading) * sign * this.p.spacing / 2 * lerp(1, 0.6, w), -Math.sin(heading) * sign * this.p.spacing / 2 * lerp(1, 0.6, w)];

    if (ctx.frozenLegs) return;
    // ---- mode switches
    if (this.mode === 'idle' && vf > this.p.vStart && v > 0.05) this._start(body, heading);
    else if (this.mode === 'move' && vf < this.p.vStop) this._stop(ctx);

    if (this.mode === 'move') {
      const C = this.cycle = this.cycleLength(vf, w);
      const beta = this.duty(w);
      const ds = v * dt;
      // a swinging foot always lands within maxSwing s (decelerating bodies never leave a foot hanging mid-air);
      // the stance part of the cycle stays purely distance-driven, so planted feet never slide
      const swinging = SIDES.some((s) => frac(this.phi + this.feet[s].o) >= beta);
      this.phi += swinging ? Math.max(ds / C, dt * (1 - beta) / this.p.maxSwing) : ds / C;
      this.lastSpeed = Math.max(v, 0.3);
      for (const s of SIDES) {
        const f = this.feet[s];
        const p = frac(this.phi + f.o);
        const [lx, lz] = lat(f.sign);
        if (p < beta) {
          if (f.state !== 'plant') {                       // touchdown: plant where the stride wheel says
            const ahead = beta * C / 2 - p * C;
            f.pos.set(body.x + hx * ahead + lx, 0, body.z + hz * ahead + lz);
            f.pos.y = this._ground(ground, f.pos.x, f.pos.z) + this.m.ankleY;
            f.state = 'plant'; f.yaw = heading; f.pitch = 0; f.u = 0;
            this.events.push({ name: 'step', side: s, pos: f.pos.clone(), clip: w > 0.5 ? 'run' : 'walk' });
          }
        } else {
          if (f.state === 'plant') { f.state = 'swing'; f.lift.copy(f.pos); f.liftYaw = f.yaw; }
          else if (f.state === 'step') { f.state = 'swing'; f.lift.copy(f.pos); f.liftYaw = f.yaw; }
          const u = (p - beta) / (1 - beta);
          const ahead = (1 - u) * (1 - beta) * C + beta * C / 2;
          f.land.set(body.x + hx * ahead + lx, 0, body.z + hz * ahead + lz);
          this._swingPose(f, u, f.lift, f.land, f.liftYaw, heading, lerp(this.p.lift[0], this.p.lift[1], w) * clamp(vf / 0.8, 0.4, 1), ground);
        }
      }
    } else {
      this._idleFeet(ctx);
    }
  }

  _swingPose(f, u, from, to, yaw0, yaw1, h, ground) {
    f.u = u;
    const e = smooth(u);
    f.pos.lerpVectors(from, to, e);
    const g0 = from.y - this.m.ankleY, g1 = this._ground(ground, to.x, to.z);
    f.pos.y = lerp(g0, g1, e) + this.m.ankleY + h * Math.sin(Math.PI * u);
    let dy = yaw1 - yaw0; dy -= Math.round(dy / TAU) * TAU;
    f.yaw = yaw0 + dy * e;
    // toe-off (toe down) then toe up before the heel strike
    f.pitch = u < 0.5 ? 28 * Math.sin(Math.PI * u / 0.5) : -14 * Math.sin(Math.PI * (u - 0.5) / 0.5);
  }

  _start(body, heading) {
    this.mode = 'move';
    // the foot further BEHIND lifts first; the other stays planted
    const hx = Math.sin(heading), hz = Math.cos(heading);
    const rel = (f) => (f.pos.x - body.x) * hx + (f.pos.z - body.z) * hz;
    const rear = rel(this.feet.L) <= rel(this.feet.R) ? this.feet.L : this.feet.R;
    const beta = this.duty(this.w ?? 0);
    this.phi = beta - rear.o + 1e-6;
    for (const s of SIDES) { const f = this.feet[s]; if (f.state === 'step') { f.state = 'plant'; f.pos.copy(f.land); f.yaw = f.landYaw; f.pitch = 0; } }
  }

  _stop(ctx) {
    this.mode = 'idle';
    for (const s of SIDES) {
      const f = this.feet[s];
      if (f.state === 'swing') {                            // finish the swing in time, land under the hips
        f.state = 'step'; f.lift.copy(f.pos); f.liftYaw = f.yaw; f.t0 = ctx.t;
        const swingT = (1 - this.duty(this.w)) * this.cycle / this.lastSpeed;
        f.dur = clamp((1 - f.u) * swingT, 0.1, 0.3); f.h = this.p.stepLift * (1 - f.u);
        this._idleSpot(ctx.body, ctx.facing, f.sign, f.land, ctx.ground); f.landYaw = ctx.facing;
      }
    }
  }

  _idleFeet(ctx) {
    const { t, body, facing, ground } = ctx;
    let stepping = false;
    for (const s of SIDES) {
      const f = this.feet[s];
      if (f.state !== 'step') continue;
      stepping = true;
      const u = clamp((t - f.t0) / f.dur, 0, 1);
      this._swingPose(f, u, f.lift, f.land, f.liftYaw, f.landYaw, f.h, ground);
      if (u >= 1) {
        f.state = 'plant'; f.pos.copy(f.land); f.yaw = f.landYaw; f.pitch = 0; f.u = 0; this.lastLand = t;
        this.events.push({ name: 'step', side: s, pos: f.pos.clone(), clip: 'idle' });
      }
    }
    if (stepping || t - this.lastLand < 0.08) return;
    // recovery step: the foot furthest from its idle spot (position or yaw), one at a time
    let worst = null, worstErr = 0;
    const spot = new THREE.Vector3();
    for (const s of SIDES) {
      const f = this.feet[s];
      this._idleSpot(body, facing, f.sign, spot, ground);
      let dy = f.yaw - facing; dy -= Math.round(dy / TAU) * TAU;
      const err = Math.max(Math.hypot(f.pos.x - spot.x, f.pos.z - spot.z) / this.p.stepTol, Math.abs(dy) * 57.2958 / this.p.stepYaw);
      if (err > 1 && err > worstErr) { worst = f; worstErr = err; }
    }
    if (worst) {
      const f = worst;
      f.state = 'step'; f.lift.copy(f.pos); f.liftYaw = f.yaw; f.t0 = t; f.dur = this.p.stepTime; f.h = this.p.stepLift;
      this._idleSpot(body, facing, f.sign, f.land, ground); f.landYaw = facing;
    }
  }

  /** True while any foot is off the ground (idle recovery steps included). */
  get airborne() { return this.feet.L.state !== 'plant' || this.feet.R.state !== 'plant'; }

  /**
   * Bucket id for the pose clock: changes when a new drawing should be shown. Moving: quantised phase
   * (`poses` per cycle, or the authored clip's displayed frame). Idle steps: null (caller shows them on twos).
   */
  bucket() {
    if (this.mode !== 'move') return null;
    const clip = this.w > 0.5 ? this.runClip : this.walkClip;
    if (clip) return `${this.w > 0.5 ? 'run' : 'walk'}:${evaluateClipAtPhase(clip, this.phi).frame}:${Math.floor(this.phi)}`;
    const n = Math.round(lerp(this.p.poses[0], this.p.poses[1], this.w > 0.5 ? 1 : 0));
    // (lead r6) '<gait>:<drawing in cycle>:<cycle>' like the authored-clip ids (charcheck reads the cycle counter); same
    // change points as the old cumulative index, so the displayed drawings are unchanged
    const k = Math.floor(this.phi * n);
    return `${this.w > 0.5 ? 'run' : 'walk'}:${((k % n) + n) % n}:${Math.floor(k / n)}`;
  }

  /** Displayed gait clip name. */
  get clipName() { return this.mode === 'move' ? (this.w > 0.5 ? 'run' : 'walk') : 'idle'; }

  /**
   * Upper-body + hips pose (pose triples, degrees) for the current state; legs are NOT included (IK).
   * extra = { lean: [fwd, side] degrees (dynamic lean), heading, facing }.
   */
  bodyPose(extra = {}) {
    const B = this.bones, w = this.w ?? 0, P = this.p;
    if (this.mode !== 'move') return this._idleBody();
    const n = Math.round(lerp(P.poses[0], P.poses[1], w > 0.5 ? 1 : 0));
    const phq = Math.floor(this.phi * n) / n;                           // quantised phase: N clean drawings per cycle
    const beta = this.duty(w), C = this.cycle;
    const amp = clamp(this.speed / P.walkSpeed, 0.35, 1.2);
    // bob: walk = contact mid / down low / pass mid / up high; run = low at mid-stance, high in flight
    const bobWalk = -Math.cos(2 * TAU * (phq - 1 / 8));
    const bobRun = -Math.cos(2 * TAU * (phq - beta / 2));
    const bob = lerp(P.bob[0] * bobWalk, P.bob[1] * bobRun, w) * Math.min(1, amp);
    const drop = this.hipDrop(C, w);
    const sL = Math.cos(TAU * phq);                                    // +1 at left contact (L foot forward)
    const stanceL = frac(phq) < beta ? 1 : 0, stanceR = frac(phq + 0.5) < beta ? 1 : 0;
    const sway = (stanceL - stanceR) * 0.016 * (1 - w);
    const A = lerp(P.arms[0], P.arms[1], w) * Math.min(1, amp);
    const tw = lerp(P.twist[0], P.twist[1], w) * Math.min(1, amp);
    const lean = lerp(P.lean[0], P.lean[1], w) * Math.min(1, amp) + (extra.lean?.[0] ?? 0);
    const side = extra.lean?.[1] ?? 0;
    const elbow = lerp(P.elbows[0], P.elbows[1], w);
    const pelvisTilt = (stanceR - stanceL) * 3 * (1 - w);              // swing side drops
    const pose = {
      pos: [sway, -drop + bob, 0],
      [B.hips]: [lean * 0.25, -tw * sL, pelvisTilt + side * 0.3],
      [B.spine]: [lean * 0.45, tw * sL * 0.6, -pelvisTilt * 0.6 + side * 0.4],
      [B.chest]: [lean * 0.3, tw * sL * 0.9, -pelvisTilt * 0.4 + side * 0.3],
      [B.neck]: [-lean * 0.3, -tw * sL * 0.5, 0],
      [B.head]: [-lean * 0.45, -tw * sL * 0.4, -side * 0.5],
      [B.armL[0]]: [lerp(0, 12, w) - A * sL, 0, 6 + 4 * w],
      [B.armR[0]]: [lerp(0, 12, w) + A * sL, 0, 6 + 4 * w],
      [B.armL[1]]: [elbow + Math.max(0, -sL) * A * 0.5, 0, 0],
      [B.armR[1]]: [elbow + Math.max(0, sL) * A * 0.5, 0, 0],
    };
    // authored cycles override the upper body (legs stay on the gait; clip 'pos' replaces the bob)
    const clip = w > 0.5 ? this.runClip : this.walkClip;
    if (clip) {
      const ev = evaluateClipAtPhase(clip, this.phi).poseMap;
      for (const [k, val] of Object.entries(ev)) {
        if (this._isLeg(k)) continue;
        if (k === 'pos') pose.pos = [val[0], val[1] - drop, val[2]];
        else pose[k] = val;
      }
    }
    return pose;
  }

  _idleBody() { return {}; }
  _isLeg(name) { const B = this.bones; return B.legL.includes(name) || B.legR.includes(name); }
  legBones() { return [...this.bones.legL, ...this.bones.legR]; }

  /** Pop and return the events (footsteps) gathered since the last call. */
  takeEvents() { const e = this.events; this.events = []; return e; }

  /** Info for debugging / checks. */
  debug() {
    const f = (x) => ({ state: x.state, pos: x.pos.toArray().map((v) => +v.toFixed(4)), yaw: +x.yaw.toFixed(3) });
    return { mode: this.mode, run: this.run, w: +(this.w ?? 0).toFixed(3), phi: +this.phi.toFixed(4), cycle: +this.cycle.toFixed(3),
      speed: +(this.speed ?? 0).toFixed(3), L: f(this.feet.L), R: f(this.feet.R) };
  }
}

/** Phase-driven info of an authored locomotion clip (for tools). */
export function locomotionClipInfo(clip) { return clipInfo(clip); }

// ================================================================================================================
// BODY PLANS (motion, round 5): spec.locomotion.plan = 'biped' | 'bird' | 'quadruped' | 'hop' | 'glide' | 'fly'
// selects LegGait below (specs WITHOUT `plan` keep the legacy biped Gait above, pixel-identical).
//
// GAME SPEED (Clocktower v2, docs/CHARACTER_PLAYBOOK.md): players travel 4 body heights per second (150 px/s on a
// 38 px sprite) and the v2 walk is 4 drawings in ~0.3 s (1.2 body heights per cycle). LegGait defaults are derived
// from the body height H (locomotion.height ?? spec.height ?? rig height): walkSpeed = 4·H (THE game speed),
// runSpeed = 6.5·H, cycleTime [0.3, 0.3] s, poses [4, 4] drawings per cycle, duty [0.25, 0.25].
//
// WHY duty 0.25 with 4 drawings: the displayed feet come from the QUANTISED phase k/n (the drawing's nominal phase),
// not from the continuous phase at the pose frame. A foot is shown planted in the drawings that START inside its
// stance (frac(k/n + o) < β): β = 1/n = exactly ONE drawing per plant, the touchdown drawing, with the foot C/2n ahead
// of its hip anchor. The root glides on during that drawing's hold (2-3 grid frames = C/n of travel at 4 H/s), so the
// body crosses the plant symmetrically (+C/2n → −C/2n) and legIK 'plant' (Character default) re-pins the stance
// leg every 60 Hz frame: 0 world slide at every frame, the rest of the drawing holds. (r5 showed the plant in TWO
// drawings — touchdown and push-off — which is 0 slide between pose frames but runs the foot 3C/2n behind the hip in
// the push-off hold: out of reach → the foot rode the body 9 texels per hold at 4 H/s.) Swing drawings show the swing
// at the middle of their interval, so the first swing drawing is already off the ground. With β = 0.5 at 4 H/s the
// stance half-span (0.3 H) is out of reach for any chibi leg. The drawing index is taken half a grid frame AHEAD
// (phi + v/(60·C)), so the displayed drawing is within ±½ grid frame of its nominal phase; the body drops (crouches)
// just enough for the longest hold's reach, see `drop`.
// The cycle is clamped so every drawing can be held ≥ 2 grid frames (C ≥ v·n·2/30) and so the stance stays within
// `reach`·leg; if both can't hold, β shrinks (the touchdown drawing stays the planted one).
//
// PLANT MODES (module fix, cast wave 1 → M2/M3). locomotion.plant = 'auto' (default) | 'pin' | 'hold', per gait branch
// (walk at walkSpeed, run at runSpeed; `gait.plantMode`):
//   'pin'  the r5c design above: the touchdown plant is re-pinned every 60 Hz frame (legIK 'plant') for the whole held
//          drawing, the body drops so the plant stays reachable over the hold. The drop is capped at maxDrop·leg
//          (default 0.5): past it the IK reach clamp absorbs the rest (it used to seat short legs: drop ≈ the whole
//          hip height, hem under the ground — fox/crow/goat 0.28-0.36 m).
//   'hold' legs that cannot pin a plant through a held drawing (every chibi at 4 H/s) are DRAWN like a sprite cycle:
//          one clean leg drawing per gait drawing, laid out relative to the body at the pose frame; the contact
//          drawing plants the foot contactAhead in front of its anchor (exact at the pose frame, fixed in the world for
//          the rest of that stance), swing drawings arc from contactAhead behind to contactAhead in front. Character
//          does NOT re-pin inside the hold (the leg holds like every other bone: no 60 Hz leg redraws, off_grid/flicker
//          legs 0) and the body only drops for the drawn contact (≤ holdDrop·leg, default 0.1). The surge is off.
//          The planted foot rides the root inside the hold (as it does in a baked sprite sheet at game speed).
//   'auto' 'pin' when the pin drop at the branch speed is ≤ maxDrop·leg for every leg, else 'hold' (r5c mannequin
//          biped/upright/quadruped/hopper walks stay 'pin'; chibis, the bird and every 2·v run go 'hold').
// Options: maxDrop 0.5, holdDrop 0.1 (fractions of leg length), contactReach (fraction of leg; overrides holdDrop for
// the contact offset), surge default: on only when every leg is > 0.25 H.
//
// legs: { key: [upper, lower, end] } (end joint = ankle/wrist, IK target; planted flat). Plan defaults:
//   biped / bird   L, R = thigh/shin/foot                       walk offsets L 0 R .5; bird run = HOP (L 0 R 0)
//   quadruped      HL, HR = thigh/shin/foot (hind), FL, FR = upperArm/forearm/hand (front)
//                  walk = TROT (diagonal pairs HL+FR 0, HR+FL .5), run = BOUND (hinds 0, fronts .5)
//   hop            HL, HR (+ FL, FR if the rig has arms/front legs): all 0 = every foot together (frog/rabbit/toad)
//   glide, fly     no legs (snail, slime: squash-stretch pulses; moth: hover + flap, time-driven drawings)
// Options (spec.locomotion, all optional; [walk, run] pairs): plan, style (body curves: biped|bird|quad|hop|glide|fly),
//   height, walkSpeed, runSpeed, runAt (m/s where walk → run; default midway), cycleTime [0.3, 0.3] (s, at the
//   two speeds), cycleLength (m, overrides cycleTime at walkSpeed), poses [4, 4], duty [0.25, 0.25], reach 0.6
//   (stance half-span / leg), lift [0.08H, 0.12H], bob [0.025H, 0.035H], lean [8, 14] deg, hop [0.22H, 0.3H] (hop
//   arc), offsets {walk:{key:o}, run:{key:o}}, legs, poles {key: +1 knee forward | −1 back}, spacing 1 (lateral
//   scale), arms [30, 50], elbows [40, 80], twist [6, 10], roll [6, 4] (bird waddle, deg), headBob [8, 6] deg,
//   flex [6, 14] (quad spine flex), squash: { bones: ['body'], amount 0.12 (glide 0.2), riders } ('<bone>.s' scale offsets),
//   wings: [[wingL bones..], [wingR bones..]] + flap { period 0.267 s, angles [55, 15, -30, 15] deg on 'out' },
//   hover 0.3H (fly), bones {hips, spine, chest, neck, head, armL, armR, body, tail}.
// Interface used by Character (same as the legacy Gait): mode, run, w, speed, phi, p.poses, bones, legs
//   [{key, bones, foot, ankleY, legLen, pole, side}], reset, step, bucket, clipName, bodyPose, displayFeet,
//   idleKey/idleOverlay (fly), legBones, takeEvents, airborne, debug.
// ================================================================================================================

const PLANS = {
  biped: { style: 'biped', legs: { L: ['thighL', 'shinL', 'footL'], R: ['thighR', 'shinR', 'footR'] },
    offsets: { walk: { L: 0, R: 0.5 }, run: { L: 0, R: 0.5 } } },
  bird: { style: 'bird', legs: { L: ['thighL', 'shinL', 'footL'], R: ['thighR', 'shinR', 'footR'] },
    offsets: { walk: { L: 0, R: 0.5 }, run: { L: 0, R: 0 } } },
  quadruped: { style: 'quad', legs: { HL: ['thighL', 'shinL', 'footL'], HR: ['thighR', 'shinR', 'footR'],
    FL: ['upperArmL', 'forearmL', 'handL'], FR: ['upperArmR', 'forearmR', 'handR'] },
    offsets: { walk: { HL: 0, FR: 0, HR: 0.5, FL: 0.5 }, run: { HL: 0, HR: 0, FL: 0.5, FR: 0.5 } } },
  hop: { style: 'hop', legs: { HL: ['thighL', 'shinL', 'footL'], HR: ['thighR', 'shinR', 'footR'],
    FL: ['upperArmL', 'forearmL', 'handL'], FR: ['upperArmR', 'forearmR', 'handR'] },
    offsets: { walk: { HL: 0, HR: 0, FL: 0, FR: 0 }, run: { HL: 0, HR: 0, FL: 0, FR: 0 } } },
  glide: { style: 'glide', legs: {}, offsets: { walk: {}, run: {} } },
  fly: { style: 'fly', legs: {}, offsets: { walk: {}, run: {} } },
};
export const BODY_PLANS = Object.keys(PLANS);
/** Game-speed constants (Clocktower v2): 4 body heights / s, 4 drawings in ~0.3 s. */
export const GAME = { heightsPerSec: 4, cycleTime: 0.3, drawings: 4, gridFps: 30 };
/** Game travel speed (m/s) for a body of height H (m). */
export const gameSpeed = (H) => GAME.heightsPerSec * H;

/** Legacy Gait or LegGait, by spec.locomotion.plan. Returns null when the rig cannot walk with either. */
export function createGait(rig, spec = {}, opts = {}) {
  if (spec.locomotion?.plan) return new LegGait(rig, spec, opts);
  try { return new Gait(rig, spec, opts); } catch (e) { return null; }
}

function measureLeg(rig, key, names, poleOpt) {
  const [a, b, c] = names.map((n) => rig.info[n]);
  const hip = a.restWorld.clone(), knee = b.restWorld.clone(), ankle = c.restWorld.clone();
  const L1 = knee.distanceTo(hip), L2 = ankle.distanceTo(knee);
  // knee side from the rest pose (keeps the authored bend); straight legs: knees forward, front legs (F*) back
  const ax = ankle.clone().sub(hip), t = ax.lengthSq() > 1e-9 ? knee.clone().sub(hip).dot(ax) / ax.lengthSq() : 0;
  const off = knee.clone().sub(hip.clone().addScaledVector(ax, t));
  const pole = poleOpt ?? (Math.abs(off.z) > 0.004 ? Math.sign(off.z) : (key[0] === 'F' ? -1 : 1));
  // anchor = the REST ankle (x, z): where the foot sits when standing (under the hip for bipeds, far forward of the
  // hip for a sitting hopper's Z-folded hind leg)
  return { key, bones: names, hip, L1, L2, legLen: L1 + L2, ankleY: ankle.y, anchor: [ankle.x, ankle.z], pole,
    side: hip.x >= 0 ? 1 : -1, foot: null };
}

export class LegGait {
  constructor(rig, spec = {}, opts = {}) {
    const L = spec.locomotion || {};
    const plan = PLANS[L.plan];
    if (!plan) throw new Error(`LegGait: unknown plan '${L.plan}' (${BODY_PLANS.join(', ')})`);
    this.rig = rig; this.plan = L.plan; this.style = L.style ?? plan.style; this.opts = opts;
    const has = (n) => !!rig.bones[n];
    const legDefs = L.legs ?? plan.legs;
    this.legs = [];
    for (const [key, names] of Object.entries(legDefs)) if (names.every(has)) this.legs.push(measureLeg(rig, key, names, L.poles?.[key]));
    // (module fix M6) 'hop' default legs: the front pair (upperArm/forearm/hand) only counts as legs when its end joint
    // rests on the ground (a sitting frog/rabbit). An UPRIGHT chibi's hands hang well above the ground: they are arms,
    // not legs — planting them dragged the arms down to the grass. Explicit locomotion.legs is unchanged.
    if (!L.legs && L.plan === 'hop') {
      const Hr = L.height ?? spec.height ?? rig.height ?? 1;
      this.legs = this.legs.filter((l) => l.key[0] !== 'F' || l.ankleY <= 0.12 * Hr);
    }
    if (['biped', 'bird', 'quadruped'].includes(this.plan) && this.legs.length < 2) throw new Error(`LegGait(${this.plan}): rig lacks the plan's leg bones`);
    const pick = (...c) => c.find(has) ?? null;
    const Bo = L.bones || {};
    this.bones = {
      hips: Bo.hips ?? pick('hips', 'body', rig.rootName), spine: Bo.spine ?? pick('spine'), chest: Bo.chest ?? pick('chest'),
      neck: Bo.neck ?? pick('neck'), head: Bo.head ?? pick('head'), body: Bo.body ?? pick('body', 'hips', rig.rootName),
      armL: Bo.armL ?? (has('upperArmL') ? ['upperArmL', 'forearmL'] : null), armR: Bo.armR ?? (has('upperArmR') ? ['upperArmR', 'forearmR'] : null),
      tail: Bo.tail ?? null,
    };
    // legs used by the gait must not double as swinging arms
    const legSet = new Set(this.legs.flatMap((l) => l.bones));
    if (this.bones.armL?.some((n) => legSet.has(n))) this.bones.armL = null;
    if (this.bones.armR?.some((n) => legSet.has(n))) this.bones.armR = null;
    const H = this.H = L.height ?? spec.height ?? rig.height ?? 1;
    const hipY = this.legs.length ? Math.max(...this.legs.map((l) => l.hip.y)) : H * 0.5;
    const walkSpeed = L.walkSpeed ?? gameSpeed(H), runSpeed = L.runSpeed ?? 6.5 * H;
    const ct = pair(L.cycleTime, [GAME.cycleTime, GAME.cycleTime]);
    this.p = {
      walkSpeed, runSpeed, runAt: L.runAt ?? (walkSpeed + runSpeed) / 2,
      cycleWalk: L.cycleLength ?? walkSpeed * ct[0], cycleRun: L.runCycleLength ?? runSpeed * ct[1],
      poses: pair(L.poses, [GAME.drawings, GAME.drawings]), duty: pair(L.duty, [0.25, 0.25]), reach: L.reach ?? 0.6,
      lift: pair(L.lift, [0.08 * H, 0.12 * H]), bob: pair(L.bob, [0.025 * H, 0.035 * H]), lean: pair(L.lean, [8, 14]),
      hop: pair(L.hop, [0.22 * H, 0.3 * H]), arms: pair(L.arms, [30, 50]), elbows: pair(L.elbows, [40, 80]),
      twist: pair(L.twist, [6, 10]), roll: pair(L.roll, [6, 4]), headBob: pair(L.headBob, [8, 6]), flex: pair(L.flex, [6, 14]),
      spacing: L.spacing ?? 1, vStart: L.vStart ?? 0.06 * H + 0.05, vStop: L.vStop ?? 0.03 * H + 0.03,
      stepTime: L.stepTime ?? 0.2, maxSwing: L.maxSwing ?? 0.25, stepLift: L.stepLift ?? 0.05 * H, stepTol: L.stepTol ?? 0.06 * H,
      stepYaw: L.stepYaw ?? 35, hipY, minHold: opts.minHold ?? spec.character?.minHold ?? 2,
      squash: L.squash ?? null, hover: L.hover ?? (rig.spec?.skeleton?.meta?.hover ? 0 : 0.3 * H),
      flap: { period: 0.267, angles: [55, 15, -30, 15], ...(L.flap || {}) },
      wings: L.wings ?? this._defaultWings(),
      // (module fix M3) the stance surge only helps legs that can pin a plant for a whole hold; chibi legs (≤ 0.25 H)
      // never can, and the surge redrew the whole figure inside holds (cast wave 1: upper flicker 6721-21754 px)
      surge: L.surge ?? (this.legs.length ? Math.min(...this.legs.map((l) => l.legLen)) > 0.25 * H : true),
      surgeMin: L.surgeMin ?? 0.75, surgeReach: L.surgeReach ?? 0.85,
      // (module fix M2/M3) plant mode + body-drop cap, see PLANT MODES in the header
      crouch: L.crouch ?? null,   // (module fix M11) hop touchdown crouch depth (m); default 0.06·height (unchanged)
      plant: L.plant ?? 'auto', maxDrop: L.maxDrop ?? 0.5, holdDrop: L.holdDrop ?? 0.1, contactReach: L.contactReach ?? null,
    };
    const offs = L.offsets ?? plan.offsets;
    this.offW = {}; this.offR = {};
    for (const l of this.legs) {
      const ow = offs.walk?.[l.key] ?? 0; let orr = offs.run?.[l.key] ?? ow;
      orr = ow + (orr - ow) - Math.round(orr - ow);              // shortest way between walk and run timing
      this.offW[l.key] = ow; this.offR[l.key] = orr;
    }
    this.walkClip = spec.clips?.walk || null;
    this.runClip = spec.clips?.run || null;
    this._legSet = new Set(this.legs.flatMap((l) => l.bones));
    // plant mode per gait branch, decided once at the branch's speed (walkSpeed = the game speed, runSpeed)
    this.plantW = this._resolvePlant(walkSpeed, 0);
    this.plantR = this._resolvePlant(runSpeed, 1);
    this.reset();
  }

  /** (module fix M2/M3) 'pin' when every leg can keep its plant through the longest held drawing at speed v with a
   *  body drop ≤ maxDrop·leg (the r5c design), else 'hold' (see PLANT MODES). Explicit locomotion.plant wins. */
  _resolvePlant(v, w) {
    const P = this.p;
    if (P.plant === 'pin' || P.plant === 'hold') return P.plant;
    if (!this.legs.length || ['glide', 'fly'].includes(this.style)) return 'pin';
    const wSave = this.w, rhoSave = this.rho;
    this.w = w; this.rho = 1;
    const { C, beta, n } = this.cycleAt(v, w);
    if (P.surge !== false) {                                    // the surge shortens the stance the pin must cover
      const hNom = C / (n * v), hMax = Math.ceil(30 * hNom - 1e-3) / 30;
      const reachH = P.surgeReach * Math.min(...this.legs.map((l) => l.legLen));
      this.rho = clamp(reachH / Math.max(1e-4, v * (hMax - hNom / 2)), P.surgeMin, 1);
    }
    const need = this._pinDrops(C, beta, v, n);
    this.w = wSave; this.rho = rhoSave;
    return this.legs.every((l, i) => need[i] <= P.maxDrop * l.legLen + 1e-6) ? 'pin' : 'hold';
  }

  /** Current plant mode ('pin' | 'hold') of the displayed gait branch. */
  get plantMode() { return this.w > 0.5 ? this.plantR : this.plantW; }

  _defaultWings() {
    const b = this.rig.bones, out = [];
    for (const s of ['L', 'R']) {
      const list = [];
      if (b['wing' + s]) list.push('wing' + s);
      for (let i = 0; b[`wing${s}${i}`]; i++) list.push(`wing${s}${i}`);
      if (list.length) out.push(list);
    }
    // birds: the wing paddles are the arm bones (rig.bird)
    if (!out.length && this.style === 'bird' && b.upperArmL && b.upperArmR) return [['upperArmL', 'forearmL'], ['upperArmR', 'forearmR']];
    return out.length ? out : null;
  }

  get m() { return { ankleY: this.legs[0]?.ankleY ?? 0, legLen: this.legs[0]?.legLen ?? 1, hipY: this.p.hipY }; }

  reset(bodyPos = new THREE.Vector3(), yaw = 0, ground = null) {
    this.phi = 0; this.mode = 'idle'; this.run = false; this.w = 0; this.speed = 0;
    this.runW = new SecondOrder(2.2, 1, 0, 0);
    this.speedF = new SecondOrder(4, 1, 0, 0);
    this.cycle = this.p.cycleWalk; this.beta = this.p.duty[0];
    this.time = 0; this.lastSpeed = 0; this.lastLand = -1; this.facing = yaw; this.heading = yaw;
    this.rho = 1; this.surgeOff = 0; this.shownPlanted = false;
    this.events = []; this.feet = {};
    for (const l of this.legs) {
      const f = { key: l.key, side: l.key, sign: l.side, state: 'plant', pos: new THREE.Vector3(), yaw, pitch: 0,
        lift: new THREE.Vector3(), liftYaw: yaw, land: new THREE.Vector3(), u: 0, t0: 0, dur: 0, h: 0, landYaw: yaw };
      this._spot(l, bodyPos, yaw, f.pos, ground);
      this.feet[l.key] = f; l.foot = f;
    }
  }

  _ground(g, x, z) { return g ? g.heightAt(x, z) : 0; }
  /** Idle spot of a leg: under its hip anchor (facing frame). */
  _spot(l, body, yaw, out, ground, ahead = 0, heading = yaw) {
    const ax = l.anchor[0] * this.p.spacing, az = l.anchor[1];
    const c = Math.cos(yaw), s = Math.sin(yaw);
    out.set(body.x + c * ax + s * az + Math.sin(heading) * ahead, 0, body.z - s * ax + c * az + Math.cos(heading) * ahead);
    out.y = this._ground(ground, out.x, out.z) + l.ankleY;
    return out;
  }
  _off(l) { return lerp(this.offW[l.key], this.offR[l.key], this.w); }

  /** Cycle length and effective duty at speed v, run weight w (see header: hold + reach clamps). */
  cycleAt(v, w) {
    const P = this.p;
    const cw = P.cycleWalk * Math.pow(Math.max(0.15, v / P.walkSpeed), 0.5);
    const cr = P.cycleRun * Math.pow(Math.max(0.3, v / P.runSpeed), 0.6);
    const n = Math.round(lerp(P.poses[0], P.poses[1], w > 0.5 ? 1 : 0));
    let C = lerp(cw, cr, w);
    const Cmin = v * n * P.minHold / 30 + 1e-4;                 // every drawing can be held ≥ minHold grid frames
    C = Math.max(C, Cmin);
    let beta = lerp(P.duty[0], P.duty[1], w);
    if (this.legs.length) {
      const reachH = P.reach * Math.min(...this.legs.map((l) => l.legLen));
      const room = Math.max(0.02 * reachH, reachH - v / 60);
      if (beta * C / 2 > room) beta = Math.max(0.06, 2 * room / C);
    }
    return { C, beta, n };
  }
  /** 'pin' body drop per leg (m, uncapped): the planted stance must stay reachable over a whole held drawing. */
  _pinDrops(C, beta, v, n = this._drawing().n) {
    // reach over a whole planted hold: from βC/2 + ½ frame ahead to (longest hold's travel − βC/2) behind.
    // (module fix M2) hMax epsilon 1e-3 grid frames: Cmin carries +1e-4 m, which made every clamped cycle's 2-frame
    // hold count as 3 frames (hMax always 3/30 → half ≈ the whole chibi leg)
    const hMax = Math.ceil(30 * C / (n * Math.max(v, 1e-3)) - 1e-3) / 30;
    const r = this.rho ?? 1, a = (this.rho ?? 1) * Math.max(beta, 1 / n) * C / 2;
    const half = v > 1e-3 ? Math.max(a + r * v / 60, r * v * hMax - a) : beta * C / 2;
    return this.legs.map((l) => {
      const Lg = l.legLen * 0.95, Hh = l.hip.y - l.ankleY;
      return Hh - Math.sqrt(Math.max(0, Lg * Lg - half * half));
    });
  }
  /** (module fix M2/M3) 'hold' contact offset of a leg (m ahead of its anchor): the plan's plant spot, limited to what
   *  the leg reaches with a body drop of holdDrop·leg (contactReach·leg when set). */
  _contactAhead(l, C, beta) {
    const P = this.p, Lg = l.legLen * 0.95, Hh = l.hip.y - l.ankleY;
    const aMax = P.contactReach != null ? P.contactReach * l.legLen
      : Math.sqrt(Math.max(0, Lg * Lg - Math.max(0, Hh - P.holdDrop * l.legLen) ** 2));
    return Math.min(Math.max(beta, 1 / this._drawing().n) * C / 2, aMax);
  }
  /** Body drop (m) so every stance is reachable with a slightly bent leg. 'pin': over the whole held drawing (capped at
   *  maxDrop·leg — module fix M2: short legs used to seat the hips on the ground, the IK reach clamp now absorbs the
   *  rest); 'hold': only the drawn contact (≤ holdDrop·leg by construction). */
  drop(C, beta, v) {
    let d = 0;
    if (this.plantMode === 'hold') {
      for (const l of this.legs) {
        const Lg = l.legLen * 0.95, Hh = l.hip.y - l.ankleY, a = this._contactAhead(l, C, beta);
        d = Math.max(d, Hh - Math.sqrt(Math.max(0, Lg * Lg - a * a)));
      }
      return Math.max(0, d);
    }
    const need = this._pinDrops(C, beta, v);
    this.legs.forEach((l, i) => { d = Math.max(d, Math.min(need[i], this.p.maxDrop * l.legLen)); });
    return d;
  }

  step(ctx) {
    const { dt, body, vel, ground } = ctx;
    this.time = ctx.t; this.facing = ctx.facing; this.heading = ctx.heading;
    const v = Math.hypot(vel.x, vel.z);
    const vf = this.speedF.update(dt, v);
    if (!this.run && vf > this.p.runAt) this.run = true;
    else if (this.run && vf < this.p.runAt * 0.85) this.run = false;
    const w = this.w = clamp(this.runW.update(dt, this.run ? 1 : 0), 0, 1);
    this.speed = vf;
    if (ctx.frozenLegs) return;
    if (this.mode === 'idle' && vf > this.p.vStart && v > 0.05) this._start(body, ctx.heading);
    else if (this.mode === 'move' && vf < this.p.vStop) this._stop(ctx);
    if (this.mode !== 'move') { this._idleFeet(ctx); return; }
    // (module fix M7) the cycle follows max(filtered, actual) speed: a start at full drive speed used to measure the
    // distance with v but the cycle with the still-rising filtered speed (short C) → the phase raced and drawing 0 of
    // the first two cycles was skipped (owl: walk:1:0,2:0,3:0,1:1). Steady state is unchanged (vf → v).
    const { C, beta, n } = this.cycleAt(Math.max(vf, v), w);
    this.cycle = C; this.beta = beta;
    const ds = v * dt;
    const phi0 = this.phi;
    const swinging = this.legs.some((l) => frac(this.phi + this._off(l)) >= beta);
    this.phi += this.legs.length && swinging ? Math.max(ds / C, dt * (1 - beta) / this.p.maxSwing) : ds / C;
    this._surge(C, beta, n, vf, ds, this.phi - phi0);
    this.lastSpeed = Math.max(v, 0.3);
    const lift = lerp(this.p.lift[0], this.p.lift[1], w) * clamp(vf / (0.5 * this.p.walkSpeed), 0.4, 1);
    const hopArc = this.style === 'hop' || (this.style === 'bird' && w > 0.5) ? lerp(this.p.hop[0], this.p.hop[1], w) : 0;
    for (const l of this.legs) {
      const f = l.foot, p = frac(this.phi + this._off(l));
      if (p < beta) {
        if (f.state !== 'plant') {
          this._spot(l, body, ctx.facing, f.pos, ground, this._plantAhead(C, beta, l) - p * C, ctx.heading);
          f.state = 'plant'; f.yaw = ctx.facing; f.pitch = 0; f.u = 0;
          this.events.push({ name: 'step', side: l.key, pos: f.pos.clone(), clip: w > 0.5 ? 'run' : 'walk' });
        }
      } else {
        if (f.state !== 'swing') { f.state = 'swing'; f.lift.copy(f.pos); f.liftYaw = f.yaw; }
        const u = (p - beta) / (1 - beta);
        this._spot(l, body, ctx.facing, f.land, ground, (1 - u) * (1 - beta) * C + this._plantAhead(C, beta, l), ctx.heading);
        this._swingPose(l, f, u, f.lift, f.land, f.liftYaw, ctx.facing, lift + hopArc, ground);
      }
    }
  }

  /** Plant spot ahead of the hip anchor at touchdown: the planted drawing's hold is crossed symmetrically. */
  _plantAhead(C, beta, l = null) {
    if (l && this.plantMode === 'hold') return this._contactAhead(l, C, beta);   // (module fix M3) reachable contact
    return (this.rho ?? 1) * Math.max(beta, 1 / this._drawing().n) * C / 2;
  }

  /** STANCE SURGE (motion r5c): short legs (≤ ~0.25 H) cannot keep a foot pinned for a whole held drawing at 4 H/s
   *  (2-3 grid frames = 0.27-0.4 m of travel). While a planted drawing is SHOWN the displayed body travels at ρ × the
   *  drive speed (ρ = surgeReach·leg / longest planted hold's travel, clamped to [surgeMin 0.75, 1]) and catches up during the flight
   *  drawings (offset returns to 0 by the next touchdown): average speed unchanged, the figure surges ±2-4 texels
   *  around the drive position like a hop/scurry. locomotion.surge false = off (ρ 1). rootOffset() → Character. */
  _surge(C, beta, n, v, ds, dphi) {
    if (!this.legs.length || this.p.surge === false || v < 1e-3 || this.plantMode === 'hold') { this.rho = 1; this.surgeOff = 0; return; }
    const hNom = C / (n * v), hMax = Math.ceil(30 * hNom - 1e-6) / 30;
    // budget = surgeReach × leg (the crouch + clamped IK cover the rest); ≥ surgeMin: a stronger surge reads as a lurch
    // of the whole figure (ρ 0.48 on the bird: 7 texels back and forth at 7.5 Hz, shots/motion/r5c-bird/s60-game.png)
    const reachH = this.p.surgeReach * Math.min(...this.legs.map((l) => l.legLen));
    this.rho = clamp(reachH / Math.max(1e-4, v * (hMax - hNom / 2)), this.p.surgeMin, 1);
    if (this.shownPlanted) { this.surgeOff -= (1 - this.rho) * ds; return; }
    // flight: return linearly (in phase) to 0 by the start of the next planted drawing
    const { k } = this._drawing();
    let j = k + 1;
    for (; j <= k + n; j++) if (this.legs.some((l) => frac(j / n + this._off(l) + 1e-9) < beta - 1e-6)) break;
    const rem = Math.max(dphi, j / n - this.phi);
    this.surgeOff *= Math.max(0, 1 - dphi / rem);
  }
  /** World offset of the displayed body (along the heading) — see _surge. */
  rootOffset(out = new THREE.Vector3()) {
    if (this.mode !== 'move' || !this.surgeOff) return out.set(0, 0, 0);
    return out.set(Math.sin(this.heading) * this.surgeOff, 0, Math.cos(this.heading) * this.surgeOff);
  }

  _swingPose(l, f, u, from, to, yaw0, yaw1, h, ground, out = f) {
    const e = smooth(u);
    out.pos.lerpVectors(from, to, e);
    const g0 = from.y - l.ankleY, g1 = this._ground(ground, to.x, to.z);
    out.pos.y = lerp(g0, g1, e) + l.ankleY + h * Math.sin(Math.PI * u);
    let dy = yaw1 - yaw0; dy -= Math.round(dy / TAU) * TAU;
    out.yaw = yaw0 + dy * e;
    out.pitch = u < 0.5 ? 28 * Math.sin(Math.PI * u / 0.5) : -14 * Math.sin(Math.PI * (u - 0.5) / 0.5);
    out.u = u;
    return out;
  }

  _start(body, heading) {
    this.mode = 'move';
    if (!this.legs.length) { this.phi = 0; return; }
    const hx = Math.sin(heading), hz = Math.cos(heading);
    // the group whose feet are furthest BEHIND lifts first (its offset → phase = β)
    let rear = this.legs[0], best = Infinity;
    // (module fix) ties (feet side by side) keep the first leg: float noise in sin/cos(heading) used to pick the other
    // foot at some headings, so copies facing different ways started half a cycle (2 drawings) apart
    for (const l of this.legs) { const r = (l.foot.pos.x - body.x) * hx + (l.foot.pos.z - body.z) * hz - l.anchor[1]; if (r < best - 1e-6) { best = r; rear = l; } }
    this.phi = this.cycleAt(this.speed || 0.5, this.w).beta - this._off(rear) + 1e-6;
    for (const l of this.legs) { const f = l.foot; f.hold = null; if (f.state === 'step') { f.state = 'plant'; f.pos.copy(f.land); f.yaw = f.landYaw; f.pitch = 0; } }
  }

  _stop(ctx) {
    const hold = this.plantMode === 'hold' && this._shown;
    this.mode = 'idle'; this.surgeOff = 0; this.shownPlanted = false;
    for (const l of this.legs) {
      const f = l.foot;
      // (module fix M3) 'hold': the feet on screen are body-relative drawings, not the continuous stride-wheel feet —
      // stop from what was SHOWN (a drawn contact stays planted, the others step to their idle spot)
      const sh = hold ? this._shown[l.key] : null;
      if (sh) {
        f.pos.copy(sh.pos); f.yaw = sh.yaw;
        if (sh.planted) { f.state = 'plant'; f.pitch = 0; f.u = 0; continue; }
        f.state = 'swing'; f.u = 0.5;
      }
      if (f.state !== 'swing') continue;
      f.state = 'step'; f.lift.copy(f.pos); f.liftYaw = f.yaw; f.t0 = ctx.t;
      const swingT = (1 - this.beta) * this.cycle / this.lastSpeed;
      f.dur = clamp((1 - f.u) * swingT, 0.08, 0.25); f.h = this.p.stepLift * (1 - f.u);
      this._spot(l, ctx.body, ctx.facing, f.land, ctx.ground); f.landYaw = ctx.facing;
    }
  }

  _idleFeet(ctx) {
    const { t, body, facing, ground } = ctx;
    let stepping = false;
    for (const l of this.legs) {
      const f = l.foot;
      if (f.state !== 'step') continue;
      stepping = true;
      const u = clamp((t - f.t0) / f.dur, 0, 1);
      this._swingPose(l, f, u, f.lift, f.land, f.liftYaw, f.landYaw, f.h, ground);
      if (u >= 1) {
        f.state = 'plant'; f.pos.copy(f.land); f.yaw = f.landYaw; f.pitch = 0; f.u = 0; this.lastLand = t;
        this.events.push({ name: 'step', side: l.key, pos: f.pos.clone(), clip: 'idle' });
      }
    }
    if (stepping || t - this.lastLand < 0.08 || !this.legs.length) return;
    // recovery: the GROUP (legs sharing a walk offset: a biped foot, a trot diagonal, all feet of a hopper) with the
    // largest error steps together
    const spot = new THREE.Vector3(), groups = new Map();
    for (const l of this.legs) {
      const f = l.foot; this._spot(l, body, facing, spot, ground);
      let dy = f.yaw - facing; dy -= Math.round(dy / TAU) * TAU;
      const err = Math.max(Math.hypot(f.pos.x - spot.x, f.pos.z - spot.z) / this.p.stepTol, Math.abs(dy) * 57.2958 / this.p.stepYaw);
      const gk = this.offW[l.key].toFixed(3);
      const g = groups.get(gk) || { err: 0, legs: [] }; g.err = Math.max(g.err, err); g.legs.push(l); groups.set(gk, g);
    }
    let worst = null;
    for (const g of groups.values()) if (g.err > 1 && (!worst || g.err > worst.err)) worst = g;
    if (worst) for (const l of worst.legs) {
      const f = l.foot;
      f.state = 'step'; f.lift.copy(f.pos); f.liftYaw = f.yaw; f.t0 = t; f.dur = this.p.stepTime; f.h = this.p.stepLift;
      this._spot(l, body, facing, f.land, ground); f.landYaw = facing;
    }
  }

  get airborne() { return this.legs.some((l) => l.foot.state !== 'plant'); }
  /** (module fix M8) id of the idle steps in flight: changes when a step starts or lands (Character redraws then). */
  stepKey() { return this.legs.filter((l) => l.foot.state === 'step').map((l) => `${l.key}@${l.foot.t0}`).join(','); }
  get clipName() { return this.mode === 'move' ? (this.w > 0.5 ? 'run' : 'walk') : 'idle'; }
  legBones() { return this.legs.flatMap((l) => l.bones); }
  takeEvents() { const e = this.events; this.events = []; return e; }

  /** Drawing index (half a grid frame ahead, see header) and its nominal phase. */
  _drawing() {
    const n = Math.round(lerp(this.p.poses[0], this.p.poses[1], this.w > 0.5 ? 1 : 0));
    const ahead = this.speed / (60 * Math.max(1e-3, this.cycle));
    const k = Math.floor((this.phi + ahead) * n + 1e-9);
    return { k, n, phq: k / n };
  }
  _flapK() { const P = this.p.flap; const hold = Math.max(this.p.minHold, Math.round(P.period * 30 / P.angles.length)); return Math.floor(this.time * 30 + 1e-3) / hold | 0; }

  bucket() {
    if (this.mode !== 'move') return null;
    const name = this.w > 0.5 ? 'run' : 'walk';
    // (lead r6) ids are '<gait>:<drawing in cycle>:<cycle>' (charcheck game.readable reads the cycle counter); the change
    // points are the same as the old cumulative index, so the displayed drawings are unchanged
    const cyc = (k, n) => `${((k % n) + n) % n}:${Math.floor(k / n)}`;
    if (this.style === 'fly') return `${name}:${cyc(this._flapK(), this.p.flap.angles.length)}`;
    const clip = this.w > 0.5 ? this.runClip : this.walkClip;
    const D = this._drawing();
    if (clip) return `${name}:k${D.k}:${evaluateClipAtPhase(clip, D.phq).frame}:${Math.floor(D.k / D.n)}`;   // k keeps the change points
    return `${name}:${cyc(D.k, D.n)}`;
  }
  /** Idle drawings that the gait owns (fly: the hover flap). */
  idleKey() { return this.style === 'fly' ? `fly:${this._flapK()}` : null; }
  /** Add the gait's idle layer (fly: hover height + flap) to an idle/action pose (bones the clip keys win). */
  idleOverlay(pose, keyed = null) {
    if (this.style !== 'fly') return pose;
    const o = this._flyPose(0);
    for (const [k, v] of Object.entries(o)) {
      if (k === 'pos') { const b = pose.pos ?? [0, 0, 0]; pose.pos = [b[0] + v[0], b[1] + v[1], b[2] + v[2]]; }
      else if (!keyed || !keyed.has(k)) pose[k] = v;
    }
    return pose;
  }

  /** Displayed feet at a pose frame: quantised-phase planting (see header). */
  displayFeet(body, ground = null) {
    const out = {};
    if (this.mode !== 'move' || !body) {
      for (const l of this.legs) {
        const f = l.foot;
        // (module fix M8) an idle recovery / stop step is TWO drawings: the foot at mid-swing (u 0.5) from the step's
        // start, then the landing (Character redraws only when stepKey() changes)
        if (f.state === 'step') {
          const tmp = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, u: 0 };
          this._swingPose(l, f, 0.5, f.lift, f.land, f.liftYaw, f.landYaw, f.h, ground, tmp);
          out[l.key] = { pos: tmp.pos.clone(), yaw: tmp.yaw, pitch: tmp.pitch, planted: false }; continue;
        }
        out[l.key] = { pos: f.pos.clone(), yaw: f.yaw, pitch: f.pitch, planted: f.state === 'plant' };
      }
      return out;
    }
    const { phq, n } = this._drawing(), beta = this.beta, C = this.cycle;
    this.shownPlanted = this.legs.some((l) => frac(phq + this._off(l) + 1e-9) < beta - 1e-6);
    const lift = lerp(this.p.lift[0], this.p.lift[1], this.w) * clamp(this.speed / (0.5 * this.p.walkSpeed), 0.4, 1);
    const hopArc = this.style === 'hop' || (this.style === 'bird' && this.w > 0.5) ? lerp(this.p.hop[0], this.p.hop[1], this.w) : 0;
    const tmp = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, u: 0 }, land = new THREE.Vector3();
    if (this.plantMode === 'hold') return (this._shown = this._holdFeet(body, ground, phq, n, beta, C, lift + hopArc));
    for (const l of this.legs) {
      const f = l.foot, o = this._off(l);
      const pq = frac(phq + o + 1e-9), pc = frac(this.phi + o);
      // (motion r5c) planted only in drawings that START inside the stance (strict <): at β = 1/n that is the ONE
      // touchdown drawing, whose hold the body crosses symmetrically over the plant (+C/2n → −C/2n, within reach), so
      // legIK 'plant' keeps the foot pinned for the whole hold. The push-off drawing (pq = β) used to be shown planted
      // too and its hold ran the foot 3C/2n behind the hip → out of reach → the foot rode the body (9 texels at 4 H/s).
      let pos = null;
      if (pq < beta - 1e-6) {
        if (f.state === 'plant') pos = f.pos;
        else if (pc - beta < 0.5 * (1 - beta)) pos = f.lift;      // the continuous foot just lifted: still its plant
        else pos = f.land;                                         // about to land: the predicted plant
        // a plant already out of reach at the pose frame (walk ↔ run offset blend, sharp turns) is shown lifting
        this._spot(l, body, this.facing, land, ground);
        if (Math.hypot(pos.x - land.x, pos.z - land.z) > 0.9 * l.legLen) pos = null;
      }
      if (pos) out[l.key] = { pos: pos.clone(), yaw: f.state === 'plant' ? f.yaw : this.facing, pitch: 0, planted: true };
      else {
        // swing drawings show the swing at the MIDDLE of the drawing's interval (a just-lifted foot is already off the
        // ground in its drawing, so it can ride the gliding body without reading as a slide)
        const u = pq < beta - 1e-6 ? 0.12 : clamp((frac(pq + 0.5 / n) - beta) / (1 - beta), 0, 1);
        const from = f.state === 'plant' ? f.pos : f.lift;
        this._spot(l, body, this.facing, land, ground, (1 - u) * (1 - beta) * C + this._plantAhead(C, beta), this.heading);
        this._swingPose(l, f, u, from, land, f.state === 'plant' ? f.yaw : f.liftYaw, this.facing, lift + hopArc, ground, tmp);
        out[l.key] = { pos: tmp.pos.clone(), yaw: tmp.yaw, pitch: tmp.pitch, planted: false };
      }
    }
    return out;
  }

  /** (module fix M3) 'hold' feet: one clean drawing per gait drawing, laid out relative to the body at the pose frame
   *  (a sprite cycle). Contact drawing(s): the foot is planted contactAhead in front of its anchor, fixed in the world
   *  for the rest of that stance (drawn exact at every pose frame; Character does NOT re-pin it inside the hold, so the
   *  leg holds like every other bone). Swing drawings: the foot travels from contactAhead behind to contactAhead in
   *  front of its anchor along an arc (lift · sin πu), u = the swing at the middle of the drawing's interval. */
  _holdFeet(body, ground, phq, n, beta, C, lift) {
    const out = {}, p = new THREE.Vector3();
    for (const l of this.legs) {
      const f = l.foot, o = this._off(l);
      const pq = frac(phq + o + 1e-9), a = this._contactAhead(l, C, beta);
      if (pq < beta - 1e-6) {
        const key = Math.floor(phq + o + 1e-9);                        // stance id (cycle of this foot)
        if (!f.hold || f.hold.key !== key) f.hold = { key, pos: this._spot(l, body, this.facing, new THREE.Vector3(), ground, a, this.heading) };
        this._spot(l, body, this.facing, p, ground);
        const far = Math.hypot(f.hold.pos.x - p.x, f.hold.pos.z - p.z) > 0.9 * l.legLen;
        if (!far) { out[l.key] = { pos: f.hold.pos.clone(), yaw: this.facing, pitch: 0, planted: true }; continue; }
      }
      const u = pq < beta - 1e-6 ? 0.12 : clamp((frac(pq + 0.5 / n) - beta) / (1 - beta), 0, 1);
      const e = smooth(u);
      this._spot(l, body, this.facing, p, ground, lerp(-a, a, e), this.heading);
      p.y += lift * Math.sin(Math.PI * u);
      const pitch = u < 0.5 ? 28 * Math.sin(Math.PI * u / 0.5) : -14 * Math.sin(Math.PI * (u - 0.5) / 0.5);
      out[l.key] = { pos: p.clone(), yaw: this.facing, pitch, planted: false };
    }
    return out;
  }

  // ---- body curves -------------------------------------------------------------------------------------------
  /** pose triple for a midline bone from (pitch fwd+, yaw left+, roll left+) degrees, by the bone's rest axis. */
  _rot(bone, pitch, yaw, roll) {
    const i = this.rig.info[bone];
    if (!i) return null;
    const vert = Math.abs(i.axes.twist.y) > 0.7;               // vertical bone: twist = yaw, out = roll
    return vert ? [pitch, yaw, roll] : [pitch, roll, yaw];
  }
  _put(pose, bone, pitch, yaw = 0, roll = 0) {
    if (!bone || !this.rig.bones[bone]) return;
    const r = this._rot(bone, pitch, yaw, roll);
    const b = pose[bone] ?? [0, 0, 0];
    pose[bone] = [b[0] + r[0], b[1] + r[1], b[2] + r[2]];
  }

  bodyPose(extra = {}) {
    if (this.mode !== 'move') return {};
    const P = this.p, w = this.w, B = this.bones;
    const amp = clamp(this.speed / P.walkSpeed, 0.35, 1.2), a1 = Math.min(1, amp);
    const { phq } = this._drawing();
    const beta = this.beta, C = this.cycle;
    const drop = this.drop(C, beta, this.speed);
    const lean = lerp(P.lean[0], P.lean[1], w) * a1 + (extra.lean?.[0] ?? 0), side = extra.lean?.[1] ?? 0;
    const pose = { pos: [0, -drop, 0] };
    const st = this.style;
    if (st === 'biped' || (st === 'bird' && w <= 0.5)) {
      const sL = Math.cos(TAU * phq);                            // +1 at the L touchdown drawing
      const bob = -Math.cos(2 * TAU * phq) * lerp(P.bob[0], P.bob[1], w) * a1;   // low on touchdown drawings
      pose.pos[1] += bob;
      if (st === 'biped') {
        const tw = lerp(P.twist[0], P.twist[1], w) * a1, A = lerp(P.arms[0], P.arms[1], w) * a1, el = lerp(P.elbows[0], P.elbows[1], w);
        this._put(pose, B.hips, lean * 0.25, -tw * sL, side * 0.3);
        this._put(pose, B.spine, lean * 0.45, tw * sL * 0.6, side * 0.4);
        this._put(pose, B.chest, lean * 0.3, tw * sL * 0.9, side * 0.3);
        this._put(pose, B.neck, -lean * 0.3, -tw * sL * 0.5);
        this._put(pose, B.head, -lean * 0.45, -tw * sL * 0.4, -side * 0.5);
        if (B.armL) { pose[B.armL[0]] = [lerp(0, 12, w) - A * sL, 0, 6 + 4 * w]; if (B.armL[1]) pose[B.armL[1]] = [el + Math.max(0, -sL) * A * 0.5, 0, 0]; }
        if (B.armR) { pose[B.armR[0]] = [lerp(0, 12, w) + A * sL, 0, 6 + 4 * w]; if (B.armR[1]) pose[B.armR[1]] = [el + Math.max(0, sL) * A * 0.5, 0, 0]; }
      } else {
        // WADDLE: the body rolls over the stance foot, yaws toward it, the head thrusts on each touchdown
        const R = P.roll[0] * a1, hb = P.headBob[0] * a1;
        const touch = Math.cos(2 * TAU * phq);                   // +1 on touchdown drawings, −1 on push-off
        this._put(pose, B.hips, lean * 0.3, sL * R * 0.6, sL * R);
        this._put(pose, B.spine, lean * 0.4, 0, sL * R * 0.4);
        this._put(pose, B.neck, -lean * 0.3 + hb * touch, 0, -sL * R * 0.5);
        this._put(pose, B.head, -lean * 0.4 - hb * touch * 0.8, 0, -sL * R * 0.6);
        if (P.wings) P.wings.forEach((list, i) => { pose[list[0]] = [0, 0, 6 + 6 * Math.max(0, i ? -sL : sL)]; });
        // (module fix M9) a squashable bird (locomotion.squash on a leaf 'ball' bone + riders): squash on each touchdown
        // drawing, stretch on push-off. No locomotion.squash = unchanged.
        if (P.squash) this._squash(pose, 0.6 * touch * a1);
      }
    } else if (st === 'quad') {
      // TROT (walk): bob twice per cycle, head nods against it; BOUND (run): spine flexes/extends once per cycle
      const bob = -Math.cos(2 * TAU * phq) * lerp(P.bob[0], P.bob[1], w) * a1;
      const flexW = P.flex[0] * a1 * (1 - w), flexR = P.flex[1] * a1 * w;
      const fx = Math.sin(TAU * phq);                            // + mid-stance of the hind pair (bound: gathered)
      pose.pos[1] += bob * (1 - w) + w * lerp(P.bob[0], P.bob[1], 1) * 1.5 * -Math.cos(TAU * (phq - 0.375)) * a1;
      this._put(pose, B.hips, -fx * flexR * 0.6 + lean * 0.1, Math.cos(TAU * phq) * flexW * 0.5);
      this._put(pose, B.spine, fx * flexR * 0.6, -Math.cos(TAU * phq) * flexW * 0.4);
      this._put(pose, B.chest, fx * flexR * 0.4);
      const hb = lerp(P.headBob[0], P.headBob[1], w) * a1;
      this._put(pose, B.neck, -Math.cos(2 * TAU * phq) * hb * (1 - w) + fx * hb * w);
      this._put(pose, B.head, -lean * 0.2);
    } else if (st === 'hop' || st === 'bird') {
      // HOP: stance drawings crouch (touchdown = squash, push-off = stretch nose-up), flight drawings arc
      const lead = this.legs.find((l) => l.key[0] === 'H') ?? this.legs[0];
      const p = lead ? frac(phq + this._off(lead) + 1e-9) : phq;
      const hop = lerp(P.hop[0], P.hop[1], w);
      const nD = this._drawing().n;
      let y = 0, pitch = 0, sq = 0;
      // same drawing classes as displayFeet: stance drawings start inside the stance (touchdown = squash crouch),
      // flight drawings arc at their interval's middle (rise · apex · fall at n = 4)
      if (p < beta - 1e-6) { const u = beta > 0 ? p / beta : 0; y = -(this.p.crouch ?? 0.06 * this.H) * (1 - u); pitch = lerp(10, -12, u); sq = lerp(1, -0.6, u); }
      else { const u = clamp((frac(p + 0.5 / nD) - beta) / (1 - beta), 0, 1); y = hop * Math.sin(Math.PI * u); pitch = lerp(-14, 12, u); sq = u < 0.35 ? -0.6 : -0.5 * Math.sin(Math.PI * u); }
      pose.pos[1] += y * a1;
      this._put(pose, B.hips, pitch * a1 * 0.6 + lean * 0.3);
      this._put(pose, B.spine, pitch * a1 * 0.3);
      this._put(pose, B.head, -pitch * a1 * 0.5);
      this._squash(pose, sq * a1);
    } else if (st === 'glide') {
      // limbless pulse: squash → mid → stretch (long, low, reaching forward) → mid, one pulse per cycle
      const c = -Math.cos(TAU * phq);                            // −1 squash … +1 stretch
      // (module fix, snail r6) the pulse alone gave drawings k and n−k the SAME pose (n 4 → 3 distinct): the rising
      // half (squash → stretch) leans INTO the push (head down, body forward), the falling half trails (head up)
      const sx = Math.sin(TAU * phq);                            // +1 drawing 1 (rising), −1 drawing 3 (falling)
      pose.pos[1] = -0.015 * this.H * c * a1;
      pose.pos[2] = 0.04 * this.H * c * a1 + 0.02 * this.H * sx * a1;
      this._squash(pose, -c * a1);
      this._put(pose, B.head, -c * 6 * a1 - lean * 0.3 + 8 * sx * a1);
      this._put(pose, B.neck, c * 4 * a1 + 5 * sx * a1);
    } else if (st === 'fly') {
      Object.assign(pose, this._flyPose(a1));
    }
    // (module fix M1) authored clips.walk / clips.run drive the UPPER body, evaluated at the displayed drawing's phase
    // (the same phase bucket() uses for the pose id, so a key change is always a new drawing). Legs stay on the gait.
    // Default = replace (legacy Gait semantics): every bone the clip keys anywhere takes the clip's value on every
    // drawing; a keyed 'pos' replaces the plan's bob/hop arc (the reach drop is kept). clip.blend 'add' adds the
    // clip's triples / pos / '.s' '.p' channels on top of the plan's procedural body instead.
    const clip = w > 0.5 ? this.runClip : this.walkClip;
    if (clip) {
      const len = this.p.flap.angles.length;
      const ph = st === 'fly' ? (this._flapK() % len) / len : phq;
      const ev = evaluateClipAtPhase(clip, ph).poseMap;
      const add = clip.blend === 'add';
      for (const [k, val] of Object.entries(ev)) {
        if (this._legSet.has(k) || !Array.isArray(val)) continue;
        const b = pose[k];
        if (k === 'pos') pose.pos = add ? [pose.pos[0] + val[0], pose.pos[1] + val[1], pose.pos[2] + val[2]] : [val[0], val[1] - drop, val[2]];
        else pose[k] = add && b ? [b[0] + val[0], b[1] + val[1], b[2] + val[2]] : [...val];
      }
    }
    return pose;
  }

  /** Squash/stretch through the rig's '<bone>.s' scale-offset channel (rig.js, round 6): s > 0 squash (flatter,
   *  wider), s < 0 stretch; volume-preserving like rig.squashPose. locomotion.squash = { bones: ['body'], amount 0.12,
   *  riders: ['shell'] (rigid parts on '<rider>.p' ride the squash; needs skeleton meta.restY) }. Default for glide
   *  plans: the 'body' bone (limbless template: joint on the ground, so the sole stays down). Bones with IK'd children
   *  must not be squashed (the IK assumes unscaled parents). */
  _squash(pose, s) {
    const Q = this.p.squash ?? (this.style === 'glide' && this.rig.bones.body ? { bones: ['body'] } : null);
    if (!Q || !Q.bones?.length || Math.abs(s) < 1e-4) return;
    const amt = (Q.amount ?? (this.style === 'glide' ? 0.2 : 0.12)) * s, sy = 1 - amt, a = 1 / Math.sqrt(Math.max(0.05, sy)) - 1;
    const meta = this.rig.spec?.skeleton?.meta;
    const restY = (n) => meta?.restY?.[n] ?? this.rig.info[n].restWorld.y;
    const sq = Q.bones.filter((b) => this.rig.bones[b]);
    for (const b of sq) pose[`${b}.s`] = [+a.toFixed(4), +(-amt).toFixed(4), +a.toFixed(4)];
    // (module fix M10) each rider rides the squashed bone it hangs from (its nearest ancestor in squash.bones); riders
    // under none of them keep the old reference (the last squash bone). Single-bone squash: unchanged.
    const set = new Set(sq);
    for (const r of Q.riders || []) if (this.rig.bones[r] && sq.length) {
      let p = this.rig.bones[r].parent;
      while (p && !set.has(p.name)) p = p.parent;
      const ref = p ? p.name : sq[sq.length - 1];
      pose[`${r}.p`] = [0, +((restY(r) - restY(ref)) * (sy - 1)).toFixed(4), 0];
    }
  }

  _flyPose(a1) {
    const P = this.p, B = this.bones;
    const A = P.flap.angles, k = this._flapK() % A.length;
    const ang = A[k] * (1 + 0.25 * a1 * this.w);
    const down = Math.min(1, Math.max(-1, -A[k] / Math.max(1, Math.max(...A.map(Math.abs)))));
    const pose = { pos: [0, P.hover + down * 0.03 * this.H, 0] };
    if (P.wings) for (const list of P.wings) list.forEach((b, i) => { pose[b] = [0, 0, ang * (i ? 0.5 : 1)]; });
    const lean = lerp(P.lean[0], P.lean[1], this.w) * a1;
    this._put(pose, B.hips, lean);
    this._put(pose, B.head, -lean * 0.6);
    return pose;
  }

  debug() {
    const out = { plan: this.plan, mode: this.mode, run: this.run, w: +this.w.toFixed(3), phi: +this.phi.toFixed(4),
      cycle: +this.cycle.toFixed(3), beta: +this.beta.toFixed(3), speed: +this.speed.toFixed(3) };
    for (const l of this.legs) out[l.key] = { state: l.foot.state, pos: l.foot.pos.toArray().map((v) => +v.toFixed(4)) };
    return out;
  }
}

// legacy Gait: the same leg interface as LegGait (Character iterates `legs`, calls displayFeet)
Object.defineProperty(Gait.prototype, 'legs', {
  get() {
    if (!this._legs) this._legs = SIDES.map((s) => ({ key: s, bones: this.bones['leg' + s], ankleY: this.m[s].ankleY, legLen: this.m.legLen, pole: 1, side: s === 'L' ? 1 : -1, legacy: true }));
    for (const l of this._legs) l.foot = this.feet[l.key];
    return this._legs;
  },
});
Gait.prototype.displayFeet = function displayFeet(body, ground = null) {
  const out = {};
  for (const s of SIDES) {
    const f = this.feet[s];
    // (module fix M8) idle recovery / stop steps: mid-swing drawing, then the landing (see LegGait.displayFeet)
    if (f.state === 'step' && this.mode !== 'move') {
      const tmp = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, u: 0 };
      this._swingPose(tmp, 0.5, f.lift, f.land, f.liftYaw, f.landYaw, f.h, ground);
      out[s] = { pos: tmp.pos.clone(), yaw: tmp.yaw, pitch: tmp.pitch, planted: false }; continue;
    }
    out[s] = { pos: f.pos.clone(), yaw: f.yaw, pitch: f.pitch, planted: f.state === 'plant' };
  }
  return out;
};
Gait.prototype.stepKey = function stepKey() { return SIDES.filter((s) => this.feet[s].state === 'step').map((s) => `${s}@${this.feet[s].t0}`).join(','); };
