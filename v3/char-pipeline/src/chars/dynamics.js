// Second-order dynamics (motion owner). t3ssel8r, "Giving Personality to Procedural Animations using Math"
// (research/05 §5, §8.1; CHARACTER_TECHNIQUES §6):
//
//     y + k1·ẏ + k2·ÿ = x + k3·ẋ        k1 = ζ/(πf)   k2 = 1/(2πf)²   k3 = rζ/(2πf)
//
//   f  natural frequency (Hz): speed of the response, not its shape
//   ζ  damping: 0 never settles, < 1 rings, 1 critical, > 1 sluggish
//   r  initial response: < 0 anticipates (moves the wrong way first), 0 eases in, 1 tracks at once, > 1 overshoots
//
// Integrator = his shipped "v3" update (on-screen code at 14:13): semi-implicit Euler, position first; when
// ω·T < ζ the k2 term is clamped to max(k2, T²/2 + T·k1/2, T·k1) (stable AND no frame-to-frame jitter from
// negative eigenvalues), otherwise pole matching (exact discrete poles for very fast systems).
//
// Determinism: the filters are stateful. Characters step them at a FIXED 1/60 s (character.js re-simulates from
// t = 0 when time goes backwards or jumps), so the same t always gives the same value. The k's for a fixed T are
// cached, so a step is a handful of multiply-adds.
//
//   const s = new SecondOrder(2, 0.5, -2, 0);         // number
//   const v = new SecondOrder(presets.lean, new THREE.Vector3());   // preset object {f, zeta, r}
//   y = s.update(1 / 60, x);                          // optional 3rd arg: known input velocity ẋ
//   const q = new SecondOrderQuat(presets.head, quat0); q.update(1 / 60, targetQuat) → THREE.Quaternion (normalised)
//
// Personality presets (CHARACTER_TECHNIQUES §6): snappy = f 4–6, ζ 0.5; heavy = f 1–1.5, ζ 1; bouncy = ζ 0.3,
// r 1.5; anticipating = r < 0; sluggish = r 0, f low. On a 15 Hz pose clock anything above ~5 Hz reads as noise.
import * as THREE from 'three';

/** Named (f, zeta, r) presets. Sources: [src] = t3ssel8r's robot inspector, the rest suggested + tuned here. */
export const presets = {
  body: { f: 2, zeta: 0.5, r: -2 },          // [src] robot body follow with anticipation
  turn: { f: 3, zeta: 1, r: 0 },             // [src ζ, r] body orientation
  head: { f: 1.75, zeta: 1, r: 0 },          // [src "smaller f"] head lags the body
  lean: { f: 2.5, zeta: 0.7, r: 0 },         // lean toward velocity / acceleration
  weapon: { f: 3, zeta: 0.7, r: 0 },         // weapon / held-prop follow
  cape: { f: 3.2, zeta: 0.45, r: 0.5 },      // cloth links (0.85× f per link down a chain)
  scarf: { f: 3.6, zeta: 0.4, r: 0.5 },
  hair: { f: 4.5, zeta: 0.5, r: 0.5 },
  tail: { f: 3, zeta: 0.4, r: 1 },
  ear: { f: 5, zeta: 0.4, r: 1 },
  rope: { f: 3, zeta: 0.4, r: 0 },           // [src] quadratic-Bézier mid handle
  camera: { f: 1.25, zeta: 1, r: 0 },
  // personality shorthands
  snappy: { f: 5, zeta: 0.5, r: 0.5 },
  heavy: { f: 1.25, zeta: 1, r: 0 },
  bouncy: { f: 3, zeta: 0.3, r: 1.5 },
  anticipating: { f: 2, zeta: 0.5, r: -2 },
  sluggish: { f: 1, zeta: 1, r: 0 },
};

/** Resolve a preset name / {f, zeta|z, r} object / (f, z, r) triple to {f, z, r}. */
export function resolveParams(f, z, r) {
  if (typeof f === 'string') { const p = presets[f]; if (!p) throw new Error(`dynamics: unknown preset '${f}'`); f = p; }
  if (f && typeof f === 'object') return { f: f.f, z: f.zeta ?? f.z ?? 1, r: f.r ?? 0 };
  return { f, z: z ?? 1, r: r ?? 0 };
}

// ---- value adapters: everything is integrated on a Float64Array of n components ----
function dimOf(x) {
  if (typeof x === 'number') return 1;
  if (x && x.isVector2) return 2;
  if (x && x.isVector3) return 3;
  if (x && (x.isVector4 || x.isQuaternion)) return 4;
  if (Array.isArray(x) || ArrayBuffer.isView(x)) return x.length;
  throw new Error('dynamics: value must be a number, Vector2/3/4, Quaternion or array');
}
function read(x, out) {
  if (typeof x === 'number') { out[0] = x; return out; }
  if (x.isVector2) { out[0] = x.x; out[1] = x.y; return out; }
  if (x.isVector3) { out[0] = x.x; out[1] = x.y; out[2] = x.z; return out; }
  if (x.isVector4 || x.isQuaternion) { out[0] = x.x; out[1] = x.y; out[2] = x.z; out[3] = x.w; return out; }
  for (let i = 0; i < out.length; i++) out[i] = x[i];
  return out;
}

/**
 * Stable integration constants for step T (his v3). Returns {k1, k2} to use in
 *   yd += T * (x + k3*xd - y - k1*yd) / k2
 */
export function stableK(f, z, T) {
  const w = 2 * Math.PI * f;
  const k1 = z / (Math.PI * f), k2 = 1 / (w * w);
  if (w * T < z) return { k1, k2: Math.max(k2, T * T / 2 + T * k1 / 2, T * k1), pole: false };
  const d = w * Math.sqrt(Math.abs(z * z - 1));
  const t1 = Math.exp(-z * w * T);
  const alpha = 2 * t1 * (z <= 1 ? Math.cos(T * d) : Math.cosh(T * d));
  const beta = t1 * t1, t2 = T / (1 + beta - alpha);
  return { k1: (1 - beta) * t2, k2: T * t2, pole: true };
}

export class SecondOrder {
  /**
   * @param {number|string|object} f  Hz, or a preset name, or {f, zeta, r}
   * @param {number} [z] damping (ignored when f is a preset)
   * @param {number} [r] initial response (ignored when f is a preset)
   * @param {number|THREE.Vector2|THREE.Vector3|THREE.Vector4|number[]} [x0=0] initial value (also defines the type)
   * When f is a preset/object, the 2nd argument may be x0: new SecondOrder(presets.lean, new Vector3()).
   */
  constructor(f, z, r, x0) {
    if (typeof f === 'string' || (f && typeof f === 'object')) { x0 = z; z = undefined; r = undefined; }
    const p = resolveParams(f, z, r);
    if (x0 === undefined) x0 = 0;
    this.kind = typeof x0 === 'number' ? 'number' : x0.isVector2 ? 'v2' : x0.isVector3 ? 'v3' : x0.isVector4 ? 'v4' : 'array';
    this.n = dimOf(x0);
    this.xp = new Float64Array(this.n); this.y = new Float64Array(this.n); this.yd = new Float64Array(this.n);
    this._x = new Float64Array(this.n); this._xd = new Float64Array(this.n);
    this.value = this.kind === 'number' ? 0 : x0.clone ? x0.clone() : Array.from(x0);
    this.setParams(p.f, p.z, p.r);
    this.reset(x0);
  }

  setParams(f, z, r) {
    const p = resolveParams(f, z, r);
    this.f = p.f; this.z = p.z; this.r = p.r;
    this.instant = !(this.f < Infinity) || this.f <= 0;          // f = ∞ (or 0 = off) → y = x
    if (!this.instant) {
      this.w = 2 * Math.PI * this.f;
      this.k1 = this.z / (Math.PI * this.f);
      this.k2 = 1 / (this.w * this.w);
      this.k3 = this.r * this.z / this.w;                         // = rζ/(2πf)
    }
    this._kT = -1;                                                // invalidate the stable-k cache
    return this;
  }

  /** Reset the state to rest at x0 (velocity 0, previous input x0). */
  reset(x0) {
    if (x0 === undefined) x0 = this.kind === 'number' ? 0 : this.value;
    read(x0, this.y); this.xp.set(this.y); this.yd.fill(0);
    return this._out();
  }

  /**
   * One step of length T towards input x. xd = optional known input velocity (same type as x).
   * Returns the filtered value (a number, or this.value — reused object, copy it if you keep it).
   */
  update(T, x, xd) {
    const X = read(x, this._x);
    if (!(T > 0)) return this._out();
    if (this.instant) { this.y.set(X); this.yd.fill(0); this.xp.set(X); return this._out(); }
    const XD = this._xd;
    if (xd === undefined || xd === null) { for (let i = 0; i < this.n; i++) XD[i] = (X[i] - this.xp[i]) / T; }
    else read(xd, XD);
    this.xp.set(X);
    if (T !== this._kT) { const k = stableK(this.f, this.z, T); this._k1s = k.k1; this._k2s = k.k2; this.pole = k.pole; this._kT = T; }
    const k1 = this._k1s, k2 = this._k2s, k3 = this.k3, y = this.y, yd = this.yd;
    for (let i = 0; i < this.n; i++) {
      y[i] += T * yd[i];
      yd[i] += T * (X[i] + k3 * XD[i] - y[i] - k1 * yd[i]) / k2;
    }
    return this._out();
  }

  /** Push an impulse into the velocity (the "jiggle" pattern: target stays put, motion goes into ẏ). */
  impulse(v) {
    const V = read(v, new Float64Array(this.n));
    for (let i = 0; i < this.n; i++) this.yd[i] += V[i];
    return this;
  }

  /** Current velocity (number or array). */
  get velocity() { return this.n === 1 ? this.yd[0] : Array.from(this.yd); }

  _out() {
    const y = this.y;
    switch (this.kind) {
      case 'number': this.value = y[0]; return y[0];
      case 'v2': this.value.set(y[0], y[1]); return this.value;
      case 'v3': this.value.set(y[0], y[1], y[2]); return this.value;
      case 'v4': this.value.set(y[0], y[1], y[2], y[3]); return this.value;
      default: for (let i = 0; i < this.n; i++) this.value[i] = y[i]; return this.value;
    }
  }
}

/**
 * Quaternion follow (Patreon recipe): orient the input to the same hemisphere as the state, step the 4-vector,
 * normalise the output. The previous input is sign-aligned too, so a hemisphere flip never kicks the k3·ẋ term.
 */
export class SecondOrderQuat {
  constructor(f, z, r, q0) {
    if (typeof f === 'string' || (f && typeof f === 'object')) { q0 = z; z = undefined; r = undefined; }
    const p = resolveParams(f, z, r);
    this.sod = new SecondOrder(p.f, p.z, p.r, [0, 0, 0, 1]);
    this.value = new THREE.Quaternion();
    this._t = [0, 0, 0, 1];
    this.reset(q0 || this.value);
  }
  setParams(f, z, r) { this.sod.setParams(f, z, r); return this; }
  reset(q) {
    this.sod.reset([q.x, q.y, q.z, q.w]);
    this.value.copy(q).normalize();
    return this.value;
  }
  update(T, q) {
    const s = this.sod, y = s.y, t = this._t;
    let dot = q.x * y[0] + q.y * y[1] + q.z * y[2] + q.w * y[3];
    const sg = dot < 0 ? -1 : 1;
    t[0] = sg * q.x; t[1] = sg * q.y; t[2] = sg * q.z; t[3] = sg * q.w;
    // keep the previous input in the same hemisphere as the new one (no ẋ spike)
    const xp = s.xp; dot = xp[0] * t[0] + xp[1] * t[1] + xp[2] * t[2] + xp[3] * t[3];
    if (dot < 0) for (let i = 0; i < 4; i++) xp[i] = -xp[i];
    s.update(T, t);
    this.value.set(y[0], y[1], y[2], y[3]).normalize();
    return this.value;
  }
}

/**
 * Angle follow (radians) that never spins the long way: the target is unwrapped to within ±π of the previous
 * target before filtering. Output is unwrapped too (add/subtract 2π multiples freely).
 */
export class SecondOrderAngle {
  constructor(f, z, r, a0 = 0) {
    if (typeof f === 'string' || (f && typeof f === 'object')) { a0 = z ?? 0; z = undefined; r = undefined; }
    const p = resolveParams(f, z, r);
    this.sod = new SecondOrder(p.f, p.z, p.r, a0);
    this._prev = a0;
    this.value = a0;
  }
  reset(a) { this._prev = a; this.value = this.sod.reset(a); return this.value; }
  update(T, a) {
    let x = a;
    while (x - this._prev > Math.PI) x -= 2 * Math.PI;
    while (x - this._prev < -Math.PI) x += 2 * Math.PI;
    this._prev = x;
    this.value = this.sod.update(T, x);
    return this.value;
  }
}

/**
 * Simulate a step response (testing / tuning). Returns {ys, min, max, tMin, tMax, settle} for a unit step at t = 0
 * from rest at 0, n steps of T. settle = first time after which |y − 1| stays < tol.
 */
export function stepResponse(f, z, r, { T = 1 / 60, seconds = 3, tol = 0.02 } = {}) {
  const s = new SecondOrder(f, z, r, 0);
  const n = Math.round(seconds / T), ys = [];
  for (let i = 0; i < n; i++) ys.push(s.update(T, 1));
  let min = Infinity, max = -Infinity, iMin = 0, iMax = 0, settle = 0;
  ys.forEach((y, i) => { if (y < min) { min = y; iMin = i; } if (y > max) { max = y; iMax = i; } if (Math.abs(y - 1) >= tol) settle = (i + 1) * T; });
  return { ys, min, max, tMin: (iMin + 1) * T, tMax: (iMax + 1) * T, settle };
}
