// Ambient core (owner: ambient-core). The contract + shared helpers of the interactive ambient animation library:
// bird flocks that scatter when someone walks up, fire, fireflies, critters, foliage that parts for walkers,
// cloth / smoke / dust, props that react to proximity. Full contract and rules: docs/AMBIENT.md.
//
// A SYSTEM is a module src/ambient/<system>.js whose default export is defineSystem({ name, owner, budget, create }).
//   create(ctx, opts) -> { update(t, dt, actors), setTimeOfDay(tod), dispose(), stats() }   (+ optional api, debug())
//   ctx (built by createAmbient in ./index.js): { engine, root (Group, world space, identity), actors (Actors),
//        anchors { perches: [Vector3], spots: {name: Vector3}, lights: [...], ... } (docs/TOWN.md §4 shape),
//        heightAt(x, z), seed, rng(salt), tod (todInfo), name }
//
// Everything here is DETERMINISTIC: a system's image at time t is a pure function of t (and of the actors' pure
// at(t) paths). Reactions that need history (idle -> alert -> flee ...) run on a fixed-step Ticker that re-simulates
// from t = 0 whenever time goes backwards (replay mode), exactly like the Character runtime.
//
// THE AMBIENT GRID. Every ambient clock is a whole number of ticks of ONE 15 Hz grid (= the 30 Hz character key
// grid on twos). A clock of k ticks runs at 15/k fps: k=1 15 fps (travel), 2 -> 7.5, 3 -> 5, 4 -> 3.75, 5 -> 3 fps.
// So inside one system every change lands on an even 30 Hz frame and every drawing is held >= 2 frames at 30 Hz
// (>= 4 at 60 Hz). Drawings (wing flaps, flame shapes, pecks) use k >= 2 (<= 7.5 fps; a startled burst may flap on
// k = 1 for <= 0.5 s); TRAVEL (a bird crossing the
// screen) may use k = 1. Positions are snapped to the camera texel grid (camera.snapWorld). Nothing glides
// sub-pixel, nothing changes on an odd 30 Hz frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng as mulberry } from '../core/noise.js';
import { toonMaterial, depthMaterial } from '../materials/toon.js';
import { LAYERS } from '../core/PixelPipeline.js';

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, f) => a + (b - a) * f;
export const smooth = (f) => { f = clamp(f); return f * f * (3 - 2 * f); };

// ------------------------------------------------------------------------------------------------ game speed
// Clocktower v2 (live game): 38 px sprite, 16 px = 1 m tile, PLAYER_SPEED 150 px/s -> ~4 body heights per second,
// a walk cycle of ~0.31 s. Ambient reactions must be tuned for walkers moving THAT fast relative to their size.
export const GAME = { bodyHeightsPerSec: 4, cycleSec: 0.31, gridHz: 30 };
/** Travel speed (m/s) of a walker of height h at game speed. */
export const gameSpeed = (h = 1.4) => GAME.bodyHeightsPerSec * h;
/**
 * Minimum trigger radius so a critter reacts `lead` seconds before a walker at `speed` reaches `contact` metres.
 * A game-speed wanderer (1.38 m -> 5.5 m/s) with lead 0.4 s and contact 0.6 m needs >= 2.8 m.
 */
export const triggerRadius = (speed, lead = 0.4, contact = 0.6) => contact + speed * lead;

// ------------------------------------------------------------------------------------------------ rng / hash
/** Integer hash -> [0, 1). Stable everywhere (no Math.random). */
export function hash(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Seeded RNG () => [0, 1) (Mulberry32, = src/core/noise.js rng). */
export const rng = (seed = 1) => mulberry(seed);
/** Stable 32-bit seed from a string (FNV-1a): seedOf('birds') -> same number on every run. */
export function seedOf(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ------------------------------------------------------------------------------------------------ stepped time
export const GRID_HZ = 15;            // the ambient grid (30 Hz key grid on twos)
const EPS = 1e-6;
/** Index of the ambient grid tick at or before t. */
export const gridIndex = (t) => Math.floor(t * GRID_HZ + EPS);
/** Time of that tick (the "stepped" time every pose / position is evaluated at). */
export const gridTime = (t) => gridIndex(t) / GRID_HZ;
/** Index of a clock of `k` grid ticks (15/k fps), with an integer tick phase (per-agent offset). */
export const clockIndex = (t, k = 2, phase = 0) => Math.floor((gridIndex(t) + (phase | 0)) / k);
/** Start time of the current tick of that clock (evaluate continuous curves here: whole-step motion). */
export const clockTime = (t, k = 2, phase = 0) => (clockIndex(t, k, phase) * k - (phase | 0)) / GRID_HZ;
/** Frame `0..n-1` of a looping n-drawing cycle on a k-tick clock. */
export const cycleFrame = (t, n, k = 2, phase = 0) => ((clockIndex(t, k, phase) % n) + n) % n;
/** fps of a k-tick clock. */
export const clockFps = (k) => GRID_HZ / k;
/** Quantise an angle to n stops (default 8 = 45°: the camera's own stops). */
export const quantYaw = (a, n = 8) => Math.round(a / (TAU / n)) * (TAU / n);
/** Copy of p snapped to the camera texel grid (right/up; depth kept). */
export const snapTexel = (engine, p, out = new THREE.Vector3()) => engine.camera.snapWorld(p, out);

// ------------------------------------------------------------------------------------------------ layout helpers
/**
 * Ground basis of the camera from its yaw / pitch (integration r1; fire + props each had a private copy, and the fire
 * lesson: engine.camera.right / forward are stale at create() time). R = screen-right on the ground, F = screen-up
 * on the ground (unit), scr(sx, sy, origin?) = the ground point sx screen metres right / sy screen metres up of origin.
 */
export function groundBasis(engine) {
  const yaw = engine.camera.yaw ?? Math.PI / 4, pitch = engine.camera.pitch ?? Math.PI / 6;
  const R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const scr = (sx, sy, origin = null) => (origin ? origin.clone().setY(0) : new THREE.Vector3())
    .addScaledVector(R, sx).addScaledVector(F, sy / Math.sin(pitch));
  return { R, F, yaw, pitch, scr };
}
/** Distance (m, on the ground plane) from (x, z) to a polyline of {x, z} points (closed = the last joins the first). */
export function polylineDistance(x, z, pts, closed = true) {
  let best = Infinity;
  const n = pts.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
    const u = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2);
    best = Math.min(best, Math.hypot(x - a.x - dx * u, z - a.z - dz * u));
  }
  return n === 1 ? Math.hypot(x - pts[0].x, z - pts[0].z) : best;
}

// ------------------------------------------------------------------------------------------------ actors
/**
 * Proximity registry of the characters walking through the scene (the "actors" every system reacts to).
 *   actors.add({ id, at(t) -> Vector3|{x,y,z}, height = 1.4, radius = 0.3, kind = 'walker' })  sampled: pure f(t)
 *   actors.set(id, pos, vel?, extra?)                                 live (game): pushed every frame
 *   actors.snapshot(t) -> Snapshot { t, items: [{ id, kind, x, y, z, vx, vz, speed, height, radius }],
 *                                    near(x, z, r) -> [hit], nearest(x, z, r = Infinity) -> hit | null }
 *   hit = { item, d, ax, az (unit vector FROM the actor TO the point = the flee direction), speed,
 *           approach (m/s the actor closes in on the point, < 0 = moving away) }
 * Sampled actors give exact positions at any (past) tick time, so reactions can re-simulate from 0 (replay).
 * Velocity of a sampled actor = backward difference over 1/30 s. Snapshots are cached (last 8 times).
 */
export class Actors {
  constructor() { this.list = []; this._cache = new Map(); this.version = 0; }
  get live() { return this.list.some((a) => !a.at); }
  add(a) {
    if (!a || a.id === undefined) throw new Error('Actors.add: id required');
    this.remove(a.id);
    this.list.push({ height: 1.4, radius: 0.3, kind: 'walker', ...a, _p: new THREE.Vector3(), _v: new THREE.Vector3() });
    this._dirty();
    return this;
  }
  set(id, pos, vel = null, extra = {}) {
    let a = this.list.find((x) => x.id === id);
    if (!a) { this.list.push(a = { id, height: 1.4, radius: 0.3, kind: 'walker', _p: new THREE.Vector3(), _v: new THREE.Vector3() }); }
    Object.assign(a, extra);
    a._p.set(pos.x, pos.y ?? 0, pos.z);
    if (vel) a._v.set(vel.x, 0, vel.z);
    this._dirty();
    return this;
  }
  remove(id) { const n = this.list.length; this.list = this.list.filter((a) => a.id !== id); if (n !== this.list.length) this._dirty(); return this; }
  _dirty() { this.version++; this._cache.clear(); }
  snapshot(t) {
    const key = Math.round(t * 1e6);
    const hit = this._cache.get(key);
    if (hit && !this.live) return hit;
    const items = [];
    const h = 1 / 30;
    for (const a of this.list) {
      let x, y, z, vx = 0, vz = 0;
      if (a.at) {
        const p = a.at(t); if (!p) continue;          // null = not in the scene at t
        const q = a.at(Math.max(0, t - h)) || p, dt = t >= h ? h : Math.max(t, 1e-9);
        x = p.x; y = p.y ?? 0; z = p.z;
        if (t > 0) { vx = (p.x - q.x) / dt; vz = (p.z - q.z) / dt; }
      } else { x = a._p.x; y = a._p.y; z = a._p.z; vx = a._v.x; vz = a._v.z; }
      items.push({ id: a.id, kind: a.kind, x, y, z, vx, vz, speed: Math.hypot(vx, vz), height: a.height, radius: a.radius });
    }
    const snap = new Snapshot(t, items);
    if (!this.live) { if (this._cache.size >= 8) this._cache.delete(this._cache.keys().next().value); this._cache.set(key, snap); }
    return snap;
  }
}

class Snapshot {
  constructor(t, items) { this.t = t; this.items = items; }
  _hit(it, x, z) {
    const dx = x - it.x, dz = z - it.z, d = Math.hypot(dx, dz);
    const ax = d > 1e-6 ? dx / d : 1, az = d > 1e-6 ? dz / d : 0;
    return { item: it, d, ax, az, speed: it.speed, approach: it.vx * ax + it.vz * az };
  }
  near(x, z, r, out = []) {
    out.length = 0;
    for (const it of this.items) if (Math.abs(it.x - x) <= r && Math.abs(it.z - z) <= r) { const h = this._hit(it, x, z); if (h.d <= r) out.push(h); }
    return out;
  }
  nearest(x, z, r = Infinity) {
    let best = null;
    for (const it of this.items) {
      if (Math.abs(it.x - x) > r || Math.abs(it.z - z) > r) continue;
      const h = this._hit(it, x, z);
      if (h.d <= r && (!best || h.d < best.d)) best = h;
    }
    return best;
  }
}

// ------------------------------------------------------------------------------------------------ fixed-step sim
/**
 * Fixed-step ticker on the ambient grid (15 Hz by default). advance(t) runs tick(tickTime, dt, n) for every tick
 * up to t. replay (default): if t goes backwards it calls reset() and re-simulates from tick 0, so the state at t
 * is a pure function of t (sampled actors). live: on a backwards jump it resets and continues from t (no history).
 */
export class Ticker {
  /**
   * Host-wide defaults for Tickers built while a system is created (integration r1). createAmbient(engine,
   * { ticker: { mode, window } }) sets them around each system's create(), so a host (the town, the game) can run
   * every system forward-only or with a bounded catch-up without touching the systems. Defaults = the old behaviour.
   *   mode 'replay' | 'live'    window: s of history a cold start / far jump re-simulates (Infinity = from t 0)
   */
  static defaults = { mode: 'replay', window: Infinity };
  constructor({ hz = GRID_HZ, reset, tick, mode = Ticker.defaults.mode, maxTicks = 1e6, window = Ticker.defaults.window } = {}) {
    Object.assign(this, { hz, resetFn: reset, tickFn: tick, mode, maxTicks, window });
    this.n = null; this.ticks = 0; this.resets = 0;
  }
  advance(t) {
    const target = Math.floor(t * this.hz + EPS);
    let fresh = false;
    if (this.n === null || target < this.n) {
      this.resets++;
      this.resetFn?.();
      fresh = true;
      // live: no history (a cold start at t = 3600 s must not simulate an hour; was: replayed from 0 on the first
      // call); replay: from tick 0
      this.n = this.mode === 'live' ? target - 1 : -1;
    }
    // bounded catch-up (window < Infinity): a cold start or a forward jump longer than the window starts the
    // simulation `window` seconds before t instead of at 0 / at the stale state (deterministic for a cold start)
    const W = Number.isFinite(this.window) ? Math.max(1, Math.round(this.window * this.hz)) : Infinity;
    if (target - this.n > W) {
      if (!fresh) { this.resets++; this.resetFn?.(); }
      this.n = target - W - 1;
    }
    let budget = this.maxTicks;
    while (this.n < target && budget-- > 0) { this.n++; this.ticks++; this.tickFn(this.n / this.hz, 1 / this.hz, this.n); }
    return this.n;
  }
}

// ------------------------------------------------------------------------------------------------ reactions
export const STATE = { IDLE: 0, ALERT: 1, FLEE: 2, AWAY: 3, RETURN: 4 };
export const STATE_NAMES = ['idle', 'alert', 'flee', 'away', 'return'];
export const REACTION_DEFAULTS = {
  alertR: 3.4,      // m: effective distance that alerts (enter)
  fleeR: 2.0,       // m: effective distance that triggers the flee (enter)
  exitScale: 1.3,   // hysteresis: leave ALERT only beyond alertR * exitScale
  calmR: 4.5,       // m: AWAY -> RETURN needs every actor beyond this ...
  calmTime: 1.4,    // s: ... for this long
  lookahead: 0.35,  // s: effective distance = d - max(0, approach) * lookahead (fast walkers trigger earlier)
  stillScale: 1.35, // an actor slower than stillSpeed counts as this many times farther (standing people scare less)
  stillSpeed: 0.3,  // m/s
  alertHold: 0.4,   // s: minimum time in ALERT (a readable beat: >= 6 grid ticks)
  fleeTime: 0.9,    // s: duration of FLEE (then AWAY)
  awayMin: 1.5,     // s: minimum time AWAY
  returnTime: 1.2,  // s: duration of RETURN (then IDLE)
  jitter: 0.12,     // +-12 % per-agent radius scatter (flocks don't react as one block)
};
/**
 * Reaction state machine with hysteresis, stepped on a Ticker:  IDLE -> ALERT -> FLEE -> AWAY -> RETURN -> IDLE.
 *   const R = createReaction({ fleeR: 2.2, ... });  const rec = R.init(seed);
 *   R.step(rec, tickTime, hit)       hit = Snapshot.nearest(x, z, R.range) (or null) -> true when the state changed
 *   R.force(rec, STATE.FLEE, t, ax, az)   (flock contagion: a neighbour fled)
 * rec: { s, t0 (entered at), age(t), u (0..1 progress of timed states: FLEE, RETURN), ax, az (flee direction: away
 * from the threat at the moment the flee started), prev, changes, j (per-agent scale), d (last effective distance) }.
 * States change only on ticks, so a state is held >= 1 tick (and ALERT >= alertHold).
 */
export function createReaction(opts = {}) {
  const O = { ...REACTION_DEFAULTS, ...opts };
  const range = Math.max(O.alertR * O.exitScale, O.calmR) * (1 + O.jitter) + O.lookahead * 8;
  const enter = (rec, s, t) => { rec.prev = rec.s; rec.s = s; rec.t0 = t; rec.changes++; rec.calm = 0; return true; };
  const eff = (hit) => {
    if (!hit) return Infinity;
    let d = hit.d - Math.max(0, hit.approach) * O.lookahead;
    if (hit.speed < O.stillSpeed) d = hit.d * O.stillScale;
    return d;
  };
  return {
    opts: O, range,
    init(seed = 0) {
      return { s: STATE.IDLE, t0: 0, prev: STATE.IDLE, changes: 0, calm: 0, ax: 1, az: 0, d: Infinity, u: 0,
        j: 1 + (hash(seed, 77) * 2 - 1) * O.jitter, age(t) { return t - this.t0; } };
    },
    force(rec, s, t, ax, az) {
      if (rec.s === s) return false;
      if (ax !== undefined) { rec.ax = ax; rec.az = az; }
      return enter(rec, s, t);
    },
    step(rec, t, hit, dt = 1 / GRID_HZ) {
      const d = eff(hit) / rec.j;
      rec.d = d;
      const age = t - rec.t0;
      const flee = () => { if (hit) { rec.ax = hit.ax; rec.az = hit.az; } return enter(rec, STATE.FLEE, t); };
      let ch = false;
      switch (rec.s) {
        case STATE.IDLE:
          if (d < O.fleeR) ch = flee();
          else if (d < O.alertR) { if (hit) { rec.ax = hit.ax; rec.az = hit.az; } ch = enter(rec, STATE.ALERT, t); }
          break;
        case STATE.ALERT:
          if (hit) { rec.ax = hit.ax; rec.az = hit.az; }
          if (d < O.fleeR) ch = flee();
          else if (d > O.alertR * O.exitScale && age >= O.alertHold) ch = enter(rec, STATE.IDLE, t);
          break;
        case STATE.FLEE:
          if (age >= O.fleeTime) ch = enter(rec, STATE.AWAY, t);
          break;
        case STATE.AWAY: {
          const raw = hit ? hit.d : Infinity;
          rec.calm = raw > O.calmR ? rec.calm + dt : 0;
          if (rec.calm >= O.calmTime && age >= O.awayMin) ch = enter(rec, STATE.RETURN, t);
          break;
        }
        case STATE.RETURN:
          if (d < O.fleeR) ch = flee();
          else if (age >= O.returnTime) ch = enter(rec, STATE.IDLE, t);
          break;
      }
      const a2 = t - rec.t0;
      rec.u = rec.s === STATE.FLEE ? clamp(a2 / O.fleeTime) : rec.s === STATE.RETURN ? clamp(a2 / O.returnTime) : 0;
      return ch;
    },
  };
}

// ------------------------------------------------------------------------------------------------ lights
/**
 * Quantised flicker level in [1 - depth, 1] with `levels` steps, changing on a k-tick ambient clock (default k=2:
 * 7.5 fps). A slow "gust" component (every 6 steps) dips the whole flame now and then. Pure f(t).
 */
export function flickerLevel(t, { k = 2, levels = 4, depth = 0.3, seed = 1, gust = 0.35 } = {}) {
  const i = clockIndex(t, k, seed % k);
  const fast = hash(i, seed, 11), slow = hash(Math.floor(i / 6), seed, 23);
  const v = clamp((1 - gust) * fast + gust * slow);
  const q = levels > 1 ? Math.round(v * (levels - 1)) / (levels - 1) : 1;
  return 1 - depth + depth * q;
}
/**
 * A flickering PointLight (lamps, fires, braziers). Keep the light in the scene for the whole session (adding or
 * removing a PointLight recompiles every material); "off" = intensity 0. The toon shader quantises the pool
 * (uPointLevels), this quantises the intensity in time. Pure f(t).
 *   const fl = createFlickerLight(engine, { position, color, intensity, distance, k, levels, depth, seed, wobble, parent })
 *   fl.update(t, on = true)   (call from the system's update) -> level
 *   fl.level(t) (for syncing an emissive mesh), fl.light, fl.dispose()
 */
export function createFlickerLight(engine, opts = {}) {
  const { position = new THREE.Vector3(), color = '#FF9A4A', intensity = 1.4, distance = 3, decay = 1.5, k = 2, levels = 4,
    depth = 0.3, seed = 1, wobble = 0, parent = engine.scene } = opts;
  const light = new THREE.PointLight(new THREE.Color(color), 0, distance, decay);
  light.castShadow = false;
  light.position.copy(position);
  light.name = 'ambient-flicker';
  parent.add(light);
  const base = position.clone();
  const level = (t) => flickerLevel(t, { k, levels, depth, seed });
  return {
    light, level, base: intensity,
    update(t, on = true) {
      const f = level(t);
      light.intensity = on ? this.base * f : 0;
      if (wobble > 0) {
        const i = clockIndex(t, k, seed % k);
        light.position.set(base.x + (hash(i, seed, 3) - 0.5) * 2 * wobble, base.y + (hash(i, seed, 5) - 0.5) * wobble, base.z + (hash(i, seed, 7) - 0.5) * 2 * wobble);
      }
      return f;
    },
    dispose() { light.removeFromParent(); light.dispose?.(); },
  };
}

// ------------------------------------------------------------------------------------------------ geometry
/**
 * Paint a non-indexed geometry (src/chars/kit.js shapes) with a [hi, mid, sh] sRGB tone triple: adds the
 * color (mid), toneHi, toneSh attributes the toon material reads with toneAttributes: true.
 */
export function paint(geo, tones) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const [hi, mid, sh] = tones.map((c) => new THREE.Color(c));
  const A = (c) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); return new THREE.BufferAttribute(a, 3); };
  g.setAttribute('color', A(mid)); g.setAttribute('toneHi', A(hi)); g.setAttribute('toneSh', A(sh));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
/**
 * Merge painted parts into one pose geometry (attributes position, normal, color, toneHi, toneSh).
 * opts.keep (integration r1, birds / critters CONTRACT-REQUEST): extra per-vertex attributes to keep, as
 * { name: { size = 1, fill = 0 } } (or a list of names = size 1, fill 0): a part that lacks one gets it filled, so
 * per-part flags (aFx outline / eyeshine flags) survive the merge without a private copy of this function.
 *   mergePose(parts, { keep: { aFx: { size: 2 } } })
 */
export function mergePose(parts, opts = {}) {
  const base = ['position', 'normal', 'color', 'toneHi', 'toneSh'];
  const extra = Array.isArray(opts.keep) ? Object.fromEntries(opts.keep.map((k) => [k, {}])) : (opts.keep || {});
  const keep = [...base, ...Object.keys(extra)];
  const gs = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p.clone();
    for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    for (const [k, { size = 1, fill = 0 }] of Object.entries(extra)) {
      if (!g.attributes[k]) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n * size).fill(fill), size));
    }
    return g;
  });
  return mergeGeometries(gs, false);
}

// ------------------------------------------------------------------------------------------------ batches
/**
 * Instanced POSE batch: every pose (drawing) of a critter merged into ONE geometry, every critter one instance,
 * the instance's pose chosen by an instanced attribute (vertices of the other poses collapse to a degenerate
 * point). => 1 draw call per pass for the whole system (colour + normal pass + 1 shadow call), whatever the number
 * of critters or drawings. Lit by the toon material (3 bands, outlines, shadows) like the world.
 *   const b = createPoseBatch(engine, { poses: [geo, ...], max: 64, outline: 'full', castShadow: true, name, parent })
 *   b.set(i, pos, yaw, pose, scale = 1)   pos snapped to the texel grid (unless snap: false); yaw radians
 *   b.hide(i);  b.commit()                 (call once per update after the sets)
 *   shadowMask: true (integration r1, birds CONTRACT-REQUEST) -> b.setShadow(i, on): a per-instance switch for the
 *     shadow pass (0 extra calls; an airborne bird casts no smear on a wall face). Without it nothing changes.
 * Pose geometries: painted (paint / mergePose), feet at y = 0, facing +Z, centred on x/z.
 */
export function createPoseBatch(engine, opts = {}) {
  const { poses, max = 64, outline = 'full', castShadow = true, receiveShadow = true, name = 'ambient-batch', parent = null, snap = true, shadowMask = false } = opts;
  if (!poses?.length) throw new Error('createPoseBatch: poses required');
  const tagged = poses.map((g, i) => {
    const c = g.index ? g.toNonIndexed() : g.clone();
    const n = c.attributes.position.count;
    c.setAttribute('aPose', new THREE.BufferAttribute(new Float32Array(n).fill(i), 1));
    return c;
  });
  const geo = mergeGeometries(tagged, false);
  const iPose = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  iPose.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPose', iPose);
  const vertexHead = 'attribute float aPose; attribute float iPose;';
  const vertex = 'if (abs(aPose - iPose) > 0.5) transformed = vec3(0.0);';
  const mat = toonMaterial(engine, { vertexColors: true, toneAttributes: true, flatShading: true, outline, vertexHead, vertex, ...(opts.material || {}) });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
  let iNoShadow = null;
  if (shadowMask) {
    iNoShadow = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    iNoShadow.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iNoShadow', iNoShadow);
    mesh.customDepthMaterial = depthMaterial(engine, { vertexHead: `${vertexHead} attribute float iNoShadow;`,
      vertex: 'if (abs(aPose - iPose) > 0.5 || iNoShadow > 0.5) transformed = vec3(0.0);' });
  } else mesh.customDepthMaterial = depthMaterial(engine, { vertexHead, vertex });
  mesh.frustumCulled = false;
  mesh.name = name;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) mesh.setMatrixAt(i, zero);
  (parent || engine.scene).add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  let visible = 0;
  const shown = new Uint8Array(max);
  return {
    mesh, max, poseCount: poses.length, tris: geo.attributes.position.count / 3 / poses.length,
    set(i, pos, yaw = 0, pose = 0, scale = 1) {
      if (i < 0 || i >= max) return;
      p.copy(pos);
      if (snap) engine.camera.snapWorld(p, p);
      q.setFromAxisAngle(Y, yaw); s.setScalar(scale);
      mesh.setMatrixAt(i, m4.compose(p, q, s));
      iPose.array[i] = pose;
      shown[i] = 1;
    },
    hide(i) { if (i >= 0 && i < max) { mesh.setMatrixAt(i, zero); shown[i] = 0; } },
    setShadow(i, on = true) { if (iNoShadow && i >= 0 && i < max) iNoShadow.array[i] = on ? 0 : 1; },
    commit() {
      mesh.instanceMatrix.needsUpdate = true; iPose.needsUpdate = true;
      if (iNoShadow) iNoShadow.needsUpdate = true;
      visible = 0; for (let i = 0; i < max; i++) visible += shown[i];
    },
    get visible() { return visible; },
    dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); mesh.customDepthMaterial.dispose(); },
  };
}

const SPRITE_VERT = /* glsl */`
uniform int uPassMode;
uniform vec2 uLowSize;
attribute vec3 aColor;
attribute float aSize;   // texels (1..7); 0 = hidden
attribute float aShape;  // 0 square, 1 plus (core + 4-neighbour halo), 2 diamond (radius size/2)
varying vec3 vColor; varying float vShape, vSize;
void main() {
  vColor = aColor; vShape = aShape; vSize = aSize;
  if (uPassMode == 1 || aSize < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec2 px = (clip.xy / clip.w * 0.5 + 0.5) * uLowSize;
  px = (mod(aSize, 2.0) < 0.5) ? floor(px + 0.5) : floor(px) + 0.5;     // odd sizes on texel centres, even on corners
  clip.xy = (px / uLowSize * 2.0 - 1.0) * clip.w;
  gl_Position = clip;
  gl_PointSize = aSize;
}`;
const SPRITE_FRAG = /* glsl */`
uniform int uPassMode;
uniform float uHaloGain;
varying vec3 vColor; varying float vShape, vSize;
void main() {
  if (uPassMode == 1) discard;
  ivec2 c = ivec2(floor(gl_PointCoord * vSize));
  int ctr = int(vSize) / 2;
  int m = abs(c.x - ctr) + abs(c.y - ctr);
  vec3 col = vColor;
  if (vShape > 0.5 && vShape < 1.5) { if (m > 1) discard; if (m == 1) col *= uHaloGain; }
  else if (vShape > 1.5) { if (m > ctr) discard; if (m == ctr && ctr > 0) col *= uHaloGain; }
  gl_FragColor = vec4(col, 1.0);
}`;
/**
 * Texel-exact point-sprite batch (fireflies, embers, sparks, dust motes, falling petals seen from afar): ONE
 * THREE.Points = 1 draw call, colour pass only (no outlines), every sprite centre snapped to the low-res texel
 * grid in the vertex shader, sizes in whole texels. emissive: additive + marks rtScene.a = 0 (fog / godrays skip it,
 * it glows through mist), like src/world/particles.js fireflies.
 *   const s = createSpriteBatch(engine, { max: 128, emissive: true, haloGain: 0.55, name, parent })
 *   s.set(i, pos, color (THREE.Color, linear), size = 1, shape = 0);  s.hide(i);  s.commit()
 */
export function createSpriteBatch(engine, opts = {}) {
  const { max = 128, emissive = false, haloGain = 0.55, name = 'ambient-sprites', parent = null } = opts;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max), shape = new Float32Array(max);
  const attr = (a, n) => { const b = new THREE.BufferAttribute(a, n); b.setUsage(THREE.DynamicDrawUsage); return b; };
  geo.setAttribute('position', attr(pos, 3)); geo.setAttribute('aColor', attr(col, 3));
  geo.setAttribute('aSize', attr(size, 1)); geo.setAttribute('aShape', attr(shape, 1));
  const U = { uPassMode: engine.uniforms.uPassMode, uLowSize: engine.pipeline.common.uLowSize, uHaloGain: { value: haloGain } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, transparent: true, depthWrite: false, depthTest: true });
  if (emissive) {
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor;
    mat.blendEquationAlpha = THREE.AddEquation; mat.blendSrcAlpha = THREE.ZeroFactor; mat.blendDstAlpha = THREE.ZeroFactor;
  }
  const points = new THREE.Points(geo, mat);
  points.layers.set(LAYERS.COLOR_ONLY);
  points.frustumCulled = false; points.renderOrder = 10; points.name = name;
  (parent || engine.scene).add(points);
  let visible = 0;
  return {
    points, max,
    set(i, p, c, s = 1, sh = 0) {
      if (i < 0 || i >= max) return;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      size[i] = s; shape[i] = sh;
    },
    hide(i) { if (i >= 0 && i < max) size[i] = 0; },
    commit() {
      for (const k of ['position', 'aColor', 'aSize', 'aShape']) geo.attributes[k].needsUpdate = true;
      visible = 0; for (let i = 0; i < max; i++) visible += size[i] > 0.5 ? 1 : 0;
    },
    get visible() { return visible; },
    dispose() { points.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}

// ------------------------------------------------------------------------------------------------ time of day
const NIGHT = { noon: 0, morning: 0.1, golden: 0.55, dusk: 0.7, night: 1 };
// integration r1: host time-of-day names that systems should treat as one of theirs (systems switch on tod.name):
// the town's TOWN_TOD 'afternoon' (the old golden: low warm sun, glowing windows, PointLights) plays as 'golden'.
// tod.host keeps the host's own name.
export const TOD_ALIAS = { afternoon: 'golden' };
/** Normalised time-of-day info handed to systems: { name, host, night 0..1, dark (golden/night: lights on) }. */
export function todInfo(engine, name) {
  const host = name ?? engine.style?.timeOfDay ?? 'noon';
  const n = TOD_ALIAS[host] ?? host;
  const night = NIGHT[n] ?? 0;
  return { name: n, host, night, dark: night >= 0.5, sunColor: engine.uniforms.uSunColor.value.clone() };
}

// ------------------------------------------------------------------------------------------------ systems
/** Per-system budgets (docs/AMBIENT.md §Budgets). Draw calls are GL calls per frame incl. normal + shadow pass. */
export const BUDGET = {
  glCalls: 3,           // a lit pose batch = colour + normal + shadow; a sprite batch = 1
  updateMs: 0.3,        // CPU per update at the system's max agents (median, RTX 4090 host's Chrome)
  tris: 8000,           // per visible frame (all instances x the active pose)
  lights: 2,            // PointLights a system may own (each one costs every lit fragment)
  instances: 256,
  // all systems of one scene. glCalls (integration r1): the seven built systems declare 3+5+2+4+2+8+8 = 32 (air
  // bundles the planned cloth + smoke + dust systems, props its fixtures + two sprite batches); 36 leaves room for a
  // reflective pond. Hosts with their own props / lights pass fixtures: false, lights: [] (docs/AMBIENT.md §12).
  total: { systems: 10, glCalls: 36, updateMs: 1.5, lights: 4 },
};
/**
 * Define a system. create(ctx, opts) must return { update(t, dt, actors), setTimeOfDay(tod), dispose(), stats() }.
 * stats() -> { agents, visible, states?: {idle, alert, ...}, calls, lights, tris?, ... } (numbers only).
 */
export function defineSystem(def) {
  if (!def?.name || typeof def.create !== 'function') throw new Error('defineSystem: { name, create } required');
  return {
    budget: { ...BUDGET, ...(def.budget || {}) }, owner: def.owner || 'unknown', ...def,
    create(ctx, opts = {}) {
      const s = def.create(ctx, opts);
      for (const k of ['update', 'setTimeOfDay', 'dispose', 'stats']) if (typeof s?.[k] !== 'function') throw new Error(`ambient system '${def.name}': create() result lacks ${k}()`);
      return s;
    },
  };
}
