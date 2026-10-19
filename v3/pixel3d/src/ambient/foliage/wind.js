// Foliage wind (owner: foliage). One wind for every foliage drawing and particle: a steady breeze plus GUSTS that
// roll across the world as fronts (a band of bent grass you can watch travel), all a pure function of t.
//
// Gust j starts at tj = j*P + hash(j)*0.45P with amplitude aj; its front passes a point p at
//   ta(p) = tj + (dot(p, dir) - sRef) / speed        (sRef: 18 m upwind of the scene centre)
// and the gust there is aj * env(t - ta): rise 0.4 s, hold 1.2 s, decay 1.6 s (piecewise linear). The shader gets
// the 3 gusts that can be active (uGust[3] = (tj - sRef/speed, aj, speed, 0)); JS uses the same formula for particles.
import { hash, gridTime } from '../core.js';

export const GUST_ENV = { rise: 0.4, hold: 1.2, decay: 1.6 };
export const gustEnv = (tau) => (tau < 0 ? 0 : tau < GUST_ENV.rise ? tau / GUST_ENV.rise
  : tau < GUST_ENV.rise + GUST_ENV.hold ? 1 : Math.max(0, 1 - (tau - GUST_ENV.rise - GUST_ENV.hold) / GUST_ENV.decay));

export function createWind(opts = {}, seed = 1, center = { x: 0, z: 0 }) {
  const dir0 = opts.dir ?? [1, 0.35];
  const len = Math.hypot(dir0[0], dir0[1]) || 1;
  const W = {
    dir: [dir0[0] / len, dir0[1] / len],
    strength: opts.strength ?? 0.55,      // steady breeze (0 = still)
    gust: opts.gust ?? 1,                 // gust gain (0 = no gusts)
    period: opts.period ?? 6.5,           // s between gusts (jittered)
    speed: opts.speed ?? 6.0,             // m/s the gust front travels
    drift: opts.drift ?? 0.55,            // m/s particle drift per unit of breeze
  };
  const sRef = center.x * W.dir[0] + center.z * W.dir[1] - 18;
  const ev = (j) => ({ t: j * W.period + hash(j, 1, seed) * W.period * 0.45, a: W.gust * (0.55 + 0.6 * hash(j, 2, seed)) });
  const along = (x, z) => x * W.dir[0] + z * W.dir[1];
  return {
    W, sRef,
    event: ev,
    /** The 3 gust events that can be active at time t (for the shader uniforms). */
    events(t, out = []) {
      const J = Math.floor(t / W.period);
      out.length = 0;
      for (let j = J - 2; j <= J; j++) { const e = ev(j); out.push({ j, t0: e.t - sRef / W.speed, a: e.a, speed: W.speed }); }
      return out;
    },
    /** Gust strength 0..~1.15 at (x, z), time t (evaluate at a stepped time). */
    gust(x, z, t) {
      if (W.gust <= 0) return 0;
      const s = along(x, z), J = Math.floor(t / W.period);
      let g = 0;
      for (let j = J - 2; j <= J; j++) { const e = ev(j); g = Math.max(g, e.a * gustEnv(t - (e.t + (s - sRef) / W.speed))); }
      return g;
    },
    /** Wind speed (m/s, along dir) felt by a particle at (x, z), time t. */
    speedAt(x, z, t) { return W.drift * (W.strength + 2.2 * this.gust(x, z, t)); },
    /** Distance drifted along dir between t0 and t1 by a particle anchored near (x, z): sum over 15 Hz ticks. */
    driftBetween(x, z, t0, t1) {
      let d = 0;
      const a = Math.ceil(t0 * 15 - 1e-6), b = Math.floor(t1 * 15 + 1e-6);
      for (let i = a; i < b; i++) d += this.speedAt(x, z, i / 15) / 15;
      return d;
    },
    along,
    stepped: gridTime,
  };
}
