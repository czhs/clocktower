// Reference system "_ref-birds" (owner: ambient-core): a flock of pigeons pecking on the ground that ALERTS when a
// walker comes near, bursts up and FLEES to the nearest perches in the away half-plane (or off-screen), waits there
// (AWAY), and glides back (RETURN) once everyone has gone. It is the worked example of the ambient contract —
// copy it to start a real system (docs/AMBIENT.md §Writing a system); the production birds system owns
// src/ambient/birds.js.
//
// What it shows: createReaction (with hysteresis + per-bird jitter + flock contagion), a replay Ticker, the Actors
// proximity query, ONE instanced pose batch (7 drawings, all birds = 1 draw call per pass), the ambient grid clocks
// (travel k=1 15 fps, takeoff flap k=1, idle pecks k=2 7.5 fps, perch head turns k=4 3.75 fps), texel snapping.
//
// opts: { center: Vector3 (flock home), count = 9, spread = 1.1 (m), perchSlots = 3, reaction: {...}, seed }
// api:  { birds (read-only state), events (flee log: [{i, t, d, speed}]) }
import * as THREE from 'three';
import * as K from '../chars/kit.js';
import {
  defineSystem, createReaction, createPoseBatch, Ticker, STATE, STATE_NAMES, paint, mergePose,
  gridTime, clockIndex, cycleFrame, quantYaw, hash, clamp, lerp, TAU, GRID_HZ,
} from './core.js';

// [hi, mid, sh] sRGB (rock-dove grey-violet, iridescent green neck, coral feet): off-hue against grass, sh tones
// differ in hue (violet / teal / wine)
const PAL = {
  body: ['#D4D2E4', '#9C9CBC', '#5E5C84'],
  wing: ['#B2B0CA', '#7C7CA2', '#4C4A6E'],
  neck: ['#A6DCBC', '#62A08E', '#3C6468'],
  foot: ['#F4BCA4', '#D2887A', '#8E5464'],
};
const P = { STAND: 0, PECK: 1, ALERT: 2, UP: 3, MID: 4, DOWN: 5, LAND: 6 };
const V = (x, y, z) => [x, y, z];

// ------------------------------------------------------------------------------------------------ drawings
function body({ pitch = 0, lift = 0.05, tailUp = 0 } = {}) {
  // ellipsoid-ish hull, chest forward (+z) and high; ~0.30 m long, 0.13 m wide: 11 x 5 texels at vh 10
  const pts = [];
  for (const [z, y0, y1, w] of [[0.11, 0.05, 0.15, 0.05], [0.04, 0.02, 0.17, 0.068], [-0.05, 0.03, 0.15, 0.062], [-0.12, 0.07, 0.12, 0.04]])
    for (const sx of [-1, 1]) for (const y of [y0, y1]) pts.push(V(sx * w, y, z));
  const g = K.xf(K.hull(pts), { rot: [-pitch, 0, 0], at: [0, lift, 0] });
  const tail = K.xf(K.hull([V(-0.04, 0.09, -0.1), V(0.04, 0.09, -0.1), V(-0.035, 0.12, -0.1), V(0.035, 0.12, -0.1),
    V(-0.055, 0.08 + tailUp, -0.24), V(0.055, 0.08 + tailUp, -0.24), V(-0.05, 0.1 + tailUp, -0.24), V(0.05, 0.1 + tailUp, -0.24)]), { rot: [-pitch, 0, 0], at: [0, lift, 0] });
  return [paint(g, PAL.body), paint(tail, PAL.wing)];
}
function head(at, { neck = 0.06 } = {}) {
  // 3x3 texel head + 1-texel beak; the neck block carries the green accent
  const [x, y, z] = at;
  return [
    paint(K.xf(K.box(0.075, neck + 0.02, 0.07), { at: [x, y - neck / 2, z - 0.01] }), PAL.neck),
    paint(K.xf(K.box(0.08, 0.075, 0.085), { at: [x, y + 0.02, z] }), PAL.body),
    paint(K.xf(K.box(0.035, 0.03, 0.05), { at: [x, y + 0.012, z + 0.06] }), PAL.foot),
  ];
}
function legs(h = 0.06) {
  return [-1, 1].map((sx) => paint(K.xf(K.box(0.05, h, 0.05), { at: [sx * 0.035, h / 2, 0.0] }), PAL.foot));
}
function foldedWings(pitch = 0, lift = 0.05) {
  // folded wings: a darker saddle over the back with the wing-bar step
  return [-1, 1].map((sx) => paint(K.xf(K.hull([V(sx * 0.03, 0.15, 0.05), V(sx * 0.072, 0.13, 0.04), V(sx * 0.07, 0.06, 0.03),
    V(sx * 0.03, 0.13, -0.16), V(sx * 0.06, 0.1, -0.17), V(sx * 0.06, 0.07, -0.12)]), { rot: [-pitch, 0, 0], at: [0, lift, 0] }), PAL.wing));
}
function wings(angle, { span = 0.22, sweep = 0 } = {}) {
  // open wings: broad tapered paddles from the shoulder (a pigeon's wing is as wide at the root as the body is
  // long: long thin plates read as an aeroplane / a cross at 10 texels); angle (deg) + = up
  const out = [];
  for (const sx of [-1, 1]) {
    const plate = K.hull([V(0, 0, 0.08), V(0, 0, -0.09), V(0, 0.04, 0.08), V(0, 0.04, -0.09),
      V(sx * span * 0.6, 0, 0.06 - sweep * 0.5), V(sx * span * 0.6, 0.035, 0.06 - sweep * 0.5),
      V(sx * span, 0.0, 0.0 - sweep), V(sx * span, 0.0, -0.08 - sweep), V(sx * span, 0.03, 0.0 - sweep), V(sx * span, 0.03, -0.08 - sweep)]);
    out.push(paint(K.xf(plate, { rot: [0, 0, sx * angle], at: [sx * 0.045, 0.15, -0.01] }), PAL.wing));
  }
  return out;
}
function drawings() {
  const D = [];
  // 0 STAND: head up and forward
  D[P.STAND] = mergePose([...body(), ...foldedWings(), ...head([0, 0.24, 0.12]), ...legs()]);
  // 1 PECK: body pitched down, head at the ground in front
  D[P.PECK] = mergePose([...body({ pitch: 22, tailUp: 0.03 }), ...foldedWings(22), ...head([0, 0.07, 0.2], { neck: 0.03 }), ...legs()]);
  // 2 ALERT: neck stretched tall, tail up (a distinct, taller silhouette: the beat before the burst)
  D[P.ALERT] = mergePose([...body({ pitch: -12, tailUp: 0.03 }), ...foldedWings(-12), ...head([0, 0.31, 0.1], { neck: 0.12 }), ...legs(0.07)]);
  // flight: body level, legs tucked; wings up / mid / down (a 4-drawing flap: UP MID DOWN MID)
  const fly = () => [...body({ pitch: 4, lift: 0.0 }), ...head([0, 0.2, 0.17], { neck: 0.04 })];
  D[P.UP] = mergePose([...fly(), ...wings(62, { span: 0.2, sweep: 0.04 })]);
  D[P.MID] = mergePose([...fly(), ...wings(8, { span: 0.24, sweep: 0.02 })]);
  D[P.DOWN] = mergePose([...fly(), ...wings(-38, { span: 0.2, sweep: 0.03 })]);
  // 6 LAND: upright flare, wings high and forward, feet down
  D[P.LAND] = mergePose([...body({ pitch: -35 }), ...head([0, 0.29, 0.06], { neck: 0.06 }), ...wings(72, { span: 0.2, sweep: -0.03 }), ...legs(0.07)]);
  return D;
}

const FLAP = [P.UP, P.MID, P.DOWN, P.MID];

export default defineSystem({
  name: '_ref-birds', owner: 'ambient-core', budget: { glCalls: 3 },
  create(ctx, opts = {}) {
    const { engine, actors, anchors, heightAt } = ctx;
    const count = opts.count ?? 9;
    const center = opts.center ? opts.center.clone() : new THREE.Vector3();
    const spread = opts.spread ?? 1.1;
    const R = createReaction({ fleeTime: 0.9, returnTime: 1.6, ...(opts.reaction || {}) });
    const batch = createPoseBatch(engine, { poses: drawings(), max: count, name: 'ambient-ref-birds', parent: ctx.root });
    const seed = ctx.seed;

    // home spots: seeded dart throwing, >= 0.38 m apart
    const r = ctx.rng(1);
    const homes = [];
    for (let tries = 0; homes.length < count && tries < 4000; tries++) {
      const a = r() * TAU, d = Math.sqrt(r()) * spread;
      const p = new THREE.Vector3(center.x + Math.cos(a) * d, 0, center.z + Math.sin(a) * d);
      if (homes.every((h) => h.distanceTo(p) > 0.38)) homes.push(p);
    }
    const perches = (anchors.perches || []).map((p) => p.clone());
    const slots = opts.perchSlots ?? 3;
    const groundY = (x, z) => heightAt(x, z) ?? 0;

    // ---- idle (pure f(t)): pecks on a 7.5 fps clock, hops between seeded spots near home
    const PERIOD = 12; // beats of 2 grid ticks (1.6 s)
    const isHop = (i, p) => p % 6 === 0 || hash(i, p, seed) < 0.4;
    const hopOff = (i, p) => { const a = hash(i, p, seed + 1) * TAU, d = 0.12 + 0.2 * hash(i, p, seed + 2); return [Math.cos(a) * d, Math.sin(a) * d]; };
    const lastHop = (i, p) => { while (!isHop(i, p)) p--; return p; };
    function idleAt(i, t, out) {
      const ph = Math.floor(hash(i, 9, seed) * PERIOD);
      const beat = clockIndex(t, 2, ph * 2);
      const p = Math.floor(beat / PERIOD), b = beat - p * PERIOD;
      const h = lastHop(i, p), h0 = lastHop(i, h - 1);
      const o1 = hopOff(i, h), o0 = hopOff(i, h0);
      const hopping = h === p && b < 2;                // 2-beat hop at the start of a hop period (0.27 s)
      const f = hopping ? (b + 1) / 3 : 1;
      const ox = lerp(o0[0], o1[0], f), oz = lerp(o0[1], o1[1], f);
      out.pos.set(homes[i].x + ox, 0, homes[i].z + oz);
      out.pos.y = groundY(out.pos.x, out.pos.z) + (hopping ? 0.056 : 0);   // 2 texels up
      out.yaw = quantYaw(Math.atan2(o1[0] - o0[0], o1[1] - o0[1]) + (h === h0 ? hash(i, p, 3) * TAU : 0));
      const pat = Math.floor(hash(i, p, seed + 5) * 3);
      const PECKS = [[6, 7, 9, 10], [3, 4, 8], [5, 6, 7, 10, 11]][pat];
      out.pose = hopping ? P.STAND : PECKS.includes(b) ? P.PECK : P.STAND;
      return out;
    }

    // ---- reaction simulation (15 Hz replay ticker)
    const birds = homes.map((h, i) => ({ i, rec: R.init(seed + i), cur: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), perch: -1, off: false, pending: -1 }));
    const events = [];
    const tmp = { pos: new THREE.Vector3(), yaw: 0, pose: 0 };
    const occ = new Int32Array(Math.max(1, perches.length));
    function choosePerch(b, ax, az, from) {
      occ.fill(0);
      for (const o of birds) if (o !== b && o.perch >= 0 && o.rec.s !== STATE.IDLE && o.rec.s !== STATE.RETURN) occ[o.perch]++;
      let best = -1, bestScore = Infinity;
      perches.forEach((p, k) => {
        if (occ[k] >= slots) return;
        const dx = p.x - from.x, dz = p.z - from.z, d = Math.hypot(dx, dz);
        if (d < 1.2 || d > 9) return;
        const cos = (dx * ax + dz * az) / d;
        if (cos < 0.15) return;
        const score = d * (2 - cos) + hash(b.i, k, seed) * 1.5;
        if (score < bestScore) { bestScore = score; best = k; }
      });
      return best;
    }
    function startFlee(b, t, speed, dist) {
      const rec = b.rec;
      b.from.copy(b.cur);                              // where it was drawn right before the burst
      // per-bird spread around the away direction
      const sp = (hash(b.i, rec.changes, seed + 7) - 0.5) * 1.2;
      const c = Math.cos(sp), s = Math.sin(sp);
      const ax = rec.ax * c - rec.az * s, az = rec.ax * s + rec.az * c;
      rec.ax = ax; rec.az = az;
      b.perch = choosePerch(b, ax, az, b.from);
      if (b.perch >= 0) {
        const k = birds.filter((o) => o !== b && o.perch === b.perch && o.rec.s !== STATE.IDLE).length;
        const pp = perches[b.perch];
        b.to.set(pp.x + (k - 1) * 0.22, pp.y, pp.z + (k - 1) * 0.08);
        b.off = false;
      } else {
        b.to.set(b.from.x + ax * 9, b.from.y + 5, b.from.z + az * 9);
        b.off = true;
      }
      if (events.length < 64) events.push({ i: b.i, t: +t.toFixed(3), d: +dist.toFixed(2), speed: +speed.toFixed(2) });
    }
    const ticker = new Ticker({
      hz: GRID_HZ,
      reset() { for (const b of birds) { b.rec = R.init(seed + b.i); b.perch = -1; b.off = false; b.pending = -1; } events.length = 0; },
      tick(t, dt, n) {
        const snap = actors.snapshot(t);
        const fled = [];
        for (const b of birds) {
          const s0 = b.rec.s;
          posAt(b, t, tmp);
          b.cur.copy(tmp.pos);
          const hit = snap.nearest(tmp.pos.x, tmp.pos.z, R.range);
          if (b.pending >= 0 && n >= b.pending && (s0 === STATE.IDLE || s0 === STATE.ALERT)) {
            b.pending = -1;
            R.force(b.rec, STATE.FLEE, t);
          } else R.step(b.rec, t, hit, dt);
          if (b.rec.s === STATE.FLEE && s0 !== STATE.FLEE) {
            startFlee(b, t, hit?.speed ?? 0, hit?.d ?? -1);
            fled.push(b);
          }
          if (b.rec.s === STATE.RETURN && s0 !== STATE.RETURN) {
            b.from.copy(b.cur);
            idleAt(b.i, t + R.opts.returnTime, tmp); b.to.copy(tmp.pos);
          }
          if (b.rec.s === STATE.IDLE && s0 !== STATE.IDLE) b.perch = -1;
        }
        // flock contagion: neighbours within 1.6 m follow 1-3 ticks later, same away direction
        for (const f of fled) for (const o of birds) {
          if (o === f || o.pending >= 0 || (o.rec.s !== STATE.IDLE && o.rec.s !== STATE.ALERT)) continue;
          if (homes[o.i].distanceTo(homes[f.i]) < 1.6) { o.pending = n + 1 + Math.floor(hash(o.i, n, seed) * 3); o.rec.ax = f.rec.ax; o.rec.az = f.rec.az; }
        }
      },
    });

    // ---- drawing at time t (state from the last tick <= t)
    function posAt(b, t, out) {
      const rec = b.rec, tg = gridTime(t);
      const age = Math.max(0, tg - rec.t0);
      switch (rec.s) {
        case STATE.IDLE: return idleAt(b.i, t, out);
        case STATE.ALERT: {
          idleAt(b.i, rec.t0, out);                      // freeze where it stood, head up, face the threat
          out.pose = P.ALERT;
          out.yaw = quantYaw(Math.atan2(-rec.ax, -rec.az));
          return out;
        }
        case STATE.FLEE: {
          const u = clamp(age / R.opts.fleeTime);
          const e = 1 - (1 - u) * (1 - u);
          out.pos.set(lerp(b.from.x, b.to.x, e), 0, lerp(b.from.z, b.to.z, e));
          out.pos.y = lerp(b.from.y, b.to.y, 1 - Math.pow(1 - u, 3)) + 0.5 * Math.sin(Math.PI * u) * (b.off ? 0.4 : 1);
          out.yaw = quantYaw(Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z));
          // takeoff: frantic flap on 15 fps for 0.4 s, then 7.5 fps; perch arrival: the landing flare
          const k = age < 0.4 ? 1 : 2;
          out.pose = !b.off && u > 0.85 ? P.LAND : FLAP[cycleFrame(t, 4, k, b.i)];
          return out;
        }
        case STATE.AWAY: {
          if (b.off) { out.pose = -1; out.pos.copy(b.to); return out; }
          out.pos.copy(b.to);
          const beat = clockIndex(t, 4, b.i);              // 3.75 fps: perch head turns every ~1.1 s
          const look = Math.floor(beat / 4);
          out.yaw = quantYaw(Math.atan2(-rec.ax, -rec.az) + (hash(b.i, look, seed) < 0.5 ? -1 : 1) * (Math.PI / 4) * Math.floor(hash(b.i, look, 2) * 2));
          out.pose = hash(b.i, look, 4) < 0.35 ? P.ALERT : P.STAND;
          return out;
        }
        case STATE.RETURN: {
          const u = clamp(age / R.opts.returnTime);
          const e = u * u * (3 - 2 * u);
          out.pos.set(lerp(b.from.x, b.to.x, e), 0, lerp(b.from.z, b.to.z, e));
          out.pos.y = lerp(b.from.y, b.to.y, e) + 0.35 * Math.sin(Math.PI * u);
          out.yaw = quantYaw(Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z));
          out.pose = u > 0.86 ? P.LAND : u > 0.45 ? P.MID : FLAP[cycleFrame(t, 4, 2, b.i)];
          return out;
        }
      }
      return out;
    }

    const counts = new Array(STATE_NAMES.length).fill(0);
    let tod = ctx.tod;
    return {
      api: { birds, events, homes },
      update(t) {
        if (opts.sheet) {   // look-dev: every drawing in a row along screen-right at yaw opts.sheetYaw (no sim)
          const Rr = new THREE.Vector3(Math.cos(engine.camera.yaw), 0, -Math.sin(engine.camera.yaw));
          for (let i = 0; i < count; i++) {
            if (i >= batch.poseCount) { batch.hide(i); continue; }
            const p = center.clone().addScaledVector(Rr, (i - 3) * 0.55); p.y = groundY(p.x, p.z) + (i >= P.UP && i <= P.DOWN ? 0.3 : 0);
            batch.set(i, p, opts.sheetYaw ?? 0, i);
          }
          batch.commit();
          return;
        }
        ticker.advance(t);
        counts.fill(0);
        for (const b of birds) {
          counts[b.rec.s]++;
          posAt(b, t, tmp);
          if (tmp.pose < 0) batch.hide(b.i);
          else batch.set(b.i, tmp.pos, tmp.yaw, tmp.pose);
        }
        batch.commit();
      },
      setTimeOfDay(info) { tod = info; },
      stats() {
        const st = Object.fromEntries(STATE_NAMES.map((n, k) => [n, counts[k]]));
        const first = events[0];
        return { agents: birds.length, visible: batch.visible, ...st, calls: 3, lights: 0, tris: Math.round(batch.tris * batch.visible),
          flees: events.length, fleeLog: events.map((e) => `${e.i}:${e.t}@${e.d}`).join(" "), firstFlee: first ? `${first.t}s@${first.d}m/${first.speed}mps` : '', resets: ticker.resets, tod: tod?.name };
      },
      debug() { return { events: events.slice(), states: birds.map((b) => b.rec.s) }; },
      dispose() { batch.dispose(); },
    };
  },
});
