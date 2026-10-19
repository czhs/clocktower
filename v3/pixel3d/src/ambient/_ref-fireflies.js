// Reference system "_ref-fireflies" (owner: ambient-core): emissive point sprites that hover over the grass at
// golden hour / night, blink, and SCATTER up and away from a walker that passes through them, then drift back. The
// second worked example of the contract: a sprite batch (1 draw call), a reaction per sprite without a pose batch,
// time-of-day gating, clocks on the ambient grid. The production system owns src/ambient/fireflies.js.
//
// opts: { center: Vector3, radius = 2.2, count = 28, height = [0.25, 1.1], colors: [core, halo], reaction: {...} }
import * as THREE from 'three';
import { defineSystem, createReaction, createSpriteBatch, Ticker, STATE, STATE_NAMES, gridTime, clockIndex, clockTime, hash, clamp, lerp, TAU, GRID_HZ } from './core.js';

export default defineSystem({
  name: '_ref-fireflies', owner: 'ambient-core', budget: { glCalls: 1 },
  create(ctx, opts = {}) {
    const { engine, actors } = ctx;
    const count = opts.count ?? 28, radius = opts.radius ?? 2.2;
    const [h0, h1] = opts.height ?? [0.25, 1.1];
    const center = opts.center ? opts.center.clone() : new THREE.Vector3();
    const core = new THREE.Color(opts.colors?.[0] ?? '#F0F890'), dim = new THREE.Color(opts.colors?.[1] ?? '#9DC050');
    const sprites = createSpriteBatch(engine, { max: count, emissive: true, haloGain: 0.5, name: 'ambient-ref-fireflies', parent: ctx.root });
    // small creatures: short radii, fast decisions, quick return
    const R = createReaction({ alertR: 1.6, fleeR: 1.2, calmR: 2.4, calmTime: 0.8, fleeTime: 0.8, awayMin: 0.6, returnTime: 2.0, lookahead: 0.3, ...(opts.reaction || {}) });
    const seed = ctx.seed;
    const r = ctx.rng(2);
    const flies = Array.from({ length: count }, (_, i) => {
      const a = r() * TAU, d = Math.sqrt(r()) * radius;
      return { i, home: new THREE.Vector3(center.x + Math.cos(a) * d, lerp(h0, h1, r()), center.z + Math.sin(a) * d),
        rec: R.init(seed + i), ox: 0, oy: 0, oz: 0, cur: new THREE.Vector3(), from: new THREE.Vector3() };
    });
    // wander: slow loops evaluated at the 7.5 fps clock time (whole-step motion, ~0.35 m/s -> 1-2 texels a step)
    const wander = (f, t, out) => {
      const ts = clockTime(t, 2, f.i % 2 ? 0 : 0), ph = hash(f.i, 1, seed) * TAU;
      out.set(f.home.x + 0.45 * Math.sin(ts * 0.6 + ph) + 0.2 * Math.sin(ts * 1.37 + ph * 2.1),
        f.home.y + 0.18 * Math.sin(ts * 0.83 + ph * 1.3),
        f.home.z + 0.45 * Math.cos(ts * 0.47 + ph * 0.7) + 0.2 * Math.cos(ts * 1.11 + ph * 1.7));
      return out;
    };
    const tmp = new THREE.Vector3();
    function posAt(f, t, out) {
      wander(f, t, out);
      const rec = f.rec, age = Math.max(0, gridTime(t) - rec.t0);
      // scatter offset: up and away, eased out over the flee, held while AWAY, eased back on RETURN
      let k = 0;
      if (rec.s === STATE.FLEE) k = 1 - Math.pow(1 - clamp(age / R.opts.fleeTime), 2);
      else if (rec.s === STATE.AWAY) k = 1;
      else if (rec.s === STATE.RETURN) k = 1 - clamp(age / R.opts.returnTime) ** 2 * (3 - 2 * clamp(age / R.opts.returnTime));
      if (k > 0) out.add(tmp.set(f.ox * k, f.oy * k, f.oz * k));
      return out;
    }
    const ticker = new Ticker({
      hz: GRID_HZ,
      reset() { for (const f of flies) { f.rec = R.init(seed + f.i); f.ox = f.oy = f.oz = 0; } },
      tick(t, dt) {
        const snap = actors.snapshot(t);
        for (const f of flies) {
          const s0 = f.rec.s;
          posAt(f, t, f.cur);
          R.step(f.rec, t, snap.nearest(f.cur.x, f.cur.z, R.range), dt);
          if (f.rec.s === STATE.FLEE && s0 !== STATE.FLEE) {
            const d = 1.4 + hash(f.i, f.rec.changes, seed) * 1.2;
            const sp = (hash(f.i, f.rec.changes, 9) - 0.5) * 1.6, c = Math.cos(sp), s = Math.sin(sp);
            f.ox = (f.rec.ax * c - f.rec.az * s) * d; f.oz = (f.rec.ax * s + f.rec.az * c) * d;
            f.oy = 0.6 + hash(f.i, f.rec.changes, 4) * 0.8;
          }
        }
      },
    });
    let tod = ctx.tod;
    const counts = new Array(STATE_NAMES.length).fill(0);
    return {
      update(t) {
        ticker.advance(t);
        counts.fill(0);
        const on = tod?.dark;
        for (const f of flies) {
          counts[f.rec.s]++;
          if (!on) { sprites.hide(f.i); continue; }
          // blink on a 3.75 fps clock: on ~2.1 s, off 1-3 s; scared flies glow steadily (no blinking while fleeing)
          const period = 12 + Math.floor(hash(f.i, 3, seed) * 8);          // beats of 4 grid ticks
          const b = (clockIndex(t, 4, f.i) + Math.floor(hash(f.i, 5, seed) * period)) % period;
          const scared = f.rec.s === STATE.FLEE || f.rec.s === STATE.ALERT;
          const lit = scared || b < 8;
          if (!lit) { sprites.hide(f.i); continue; }
          const fade = !scared && (b === 0 || b === 7);
          posAt(f, t, tmp);
          sprites.set(f.i, tmp, fade ? dim : core, fade ? 1 : 3, fade ? 0 : 1);
        }
        sprites.commit();
      },
      setTimeOfDay(info) { tod = info; },
      stats() {
        return { agents: flies.length, visible: sprites.visible, ...Object.fromEntries(STATE_NAMES.map((n, k) => [n, counts[k]])),
          calls: 1, lights: 0, on: tod?.dark ? 1 : 0, resets: ticker.resets };
      },
      dispose() { sprites.dispose(); },
    };
  },
});
