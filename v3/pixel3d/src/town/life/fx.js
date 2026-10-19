// life fx (owner: life agent): closed-form particle emitters written into the shared sprite system (sprites.js).
// Every emitter is a pure function of t: particle k of an emitter is born at a hashed time, its age is stepped at
// the emitter's fps, and its position / size / dissolve are formulas of that stepped age. Nothing is integrated.
//
//   smoke(sp, t, chim, opts)     chimney puffs (smokeStyle per chimney: own rate / life / phase / lean): 3-4 puffs
//                                growing 4 -> 9-10 texels, bending with the town wind (+x, a little north), 6 fps,
//                                3-step dither dissolve; cream mid / stone hi / stone mid (never above plaster)
//   fountain(sp, t, f, opts)     4 arcing jets + a crown spurt, splashes and flat ripple rings on the basin, 8 fps
//   moths(sp, t, light, opts)    2-3 moths orbiting a lamp at night (emissive, wing frames at 8 fps)
//   embers(sp, t, at, t0, opts)  a burst of rising sparks from t0 (brazier flare), 10 fps
//   glints(sp, t, at, t0, opts)  bell strike "ding" sparkles around the belfry
import * as THREE from 'three';
import { SHAPE } from './sprites.js';
import { hash, step, clamp, TAU, lin } from './util.js';
import { TOWN_PALETTE as PAL } from '../palette.js';

export const WIND = new THREE.Vector3(0.3, 0, -0.1);     // m/s: the town breeze (smoke, bunting, leaves agree)

// colours (linear) - every tone is a palette ramp entry
const C = {
  smokeLit: lin(PAL.cream[1]), smokeMid: lin(PAL.stone[0]), sootLit: lin(PAL.stone[0]), sootMid: lin(PAL.stone[1]),
  nightLit: lin(PAL.stone[0]), nightMid: lin(PAL.stone[1]),
  waterLit: lin(PAL.cream[0]), waterMid: lin(PAL.holyGlow), waterDeep: lin(PAL.glass[0]),
  moth: lin(PAL.cream[0]), mothB: lin(PAL.glow[0]),
  ember: lin(PAL.glow[0]), emberB: lin(PAL.fireGlow), emberC: lin(PAL.glow[2]),
  glint: lin(PAL.glow[0]), glintB: lin(PAL.brass[0]),
  fly: lin(PAL.flowerYellow), flyB: lin(PAL.leaf[0]), flyDim: lin(PAL.glow[1]),
};
export const FX_COLORS = C;
// day smoke (art-director round): NO cream-hi core (it was the brightest value on screen). Lit side cream mid,
// body stone hi, shadow side stone mid: always a step below the plaster walls' lit tone, and the toon ramp tint
// (uRampHi / uRampMid) dims it further with the time of day.
export const SMOKE_DAY = { lit: lin(PAL.cream[1]), mid: lin(PAL.stone[0]), rim: lin(PAL.stone[1]), emissive: false };
/**
 * Night smoke: the toon world at night is blue and dark, and a toon-tinted puff went darker than the setts (a slab).
 * Instead the puff is drawn EMISSIVE in the slate ramp (the moonlit cool scheme: slate hi core, a hi/mid blend body,
 * slate mid rim), which sits a clear step lighter than the night setts (~#4D5B77 lit, #253047 joints).
 */
export function smokeNight(k = 1) {
  const c = (hex) => lin(hex).multiplyScalar(k);
  const mid = lin(PAL.slate[0]).lerp(lin(PAL.slate[1]), 0.45).multiplyScalar(k);
  return { lit: mid.clone(), mid, rim: c(PAL.slate[1]), emissive: true };
}

/**
 * Per-chimney smoke character (seeded): every chimney gets its own puff interval, puff life, phase, lean and size,
 * so no two columns match. Returns {rate, life, phase, lean, size, gustSeed}.
 */
export function smokeStyle(seed, { night = false } = {}) {
  const h = (k) => hash(seed, 900 + k);
  const life = (night ? 2.3 : 2.4) + h(1) * 1.1;                // 2.4 .. 3.5 s
  const puffs = 3 + h(2) * 1.0;                                  // 3..4 puffs alive at once
  return { life, rate: life / puffs, phase: h(3) * 7, lean: 0.75 + h(4) * 0.6, size: h(5) < 0.5 ? 0 : 1, gustSeed: seed * 7 + 3 };
}

/**
 * Chimney smoke at `chim` (Vector3, layout space): 3-4 puffs alive at once (seeded per chimney: smokeStyle). Each puff
 * is born small (4 texels) at the flue and GROWS as it rises (to 9-10 texels), its centre bends downwind with the
 * shared WIND (the lean grows with height: the column leans and curves, and a slow per-chimney gust swings it), and
 * it dissolves in 3 ordered-dither steps. Puffs are lit upper-left (cream mid), body stone hi, stone-mid shadow side.
 * opts: {seed, rate (s between puffs), life, strength, colors: {lit, mid, rim, emissive}, style (smokeStyle)}.
 */
export function smoke(sp, t, chim, { seed = 0, rate = null, life = null, strength = 1, fps = 6, colors = null, style = null } = {}) {
  const st = style ?? smokeStyle(seed);
  rate = rate ?? st.rate; life = life ?? st.life;
  const ph = st.phase;
  const kMax = Math.floor((t + ph) / rate), kMin = Math.floor((t + ph - life) / rate);
  const col = colors ?? SMOKE_DAY;
  const wl = Math.hypot(WIND.x, WIND.z), wx = WIND.x / wl, wz = WIND.z / wl;
  // oldest first, youngest last: the young (small, lower) puff draws over the older one above it, so the column
  // reads as separate growing puffs, not a merged tube
  for (let k = kMin + 1; k <= kMax; k++) {
    const born = k * rate - ph + (hash(seed, k, 3) - 0.5) * rate * 0.35;      // uneven spacing
    const a = step(t - born, fps);
    if (a < 0 || a > life) continue;
    const u = a / life;
    const h1 = hash(seed, k, 5), h2 = hash(seed, k, 7), h3 = hash(seed, k, 9);
    // slow gusts per chimney (held 4-7 s): the whole column swings between a gentle and a strong lean
    const gp = 4 + 3 * hash(st.gustSeed, 1);
    const gust = 0.7 + 0.6 * hash(st.gustSeed, Math.floor((born + 50) / gp), 11);
    const rise = (1.45 * Math.pow(u, 0.85)) * strength * (0.9 + 0.2 * h3);    // decelerating climb
    const drift = (0.35 * u + 0.75 * u * u) * gust * st.lean;                  // bends more the higher it gets
    const wob = 0.06 * Math.sin(1.7 * a + h1 * TAU) * Math.min(1, a * 1.5);
    const x = chim.x + wx * drift + wob;
    const z = chim.z + wz * drift + (h2 - 0.5) * 0.08;
    const y = chim.y + 0.08 + rise;
    // grows as it rises, +-1 per puff
    let sz = 4 + Math.min(5 + st.size, Math.floor(u * 7.6 + h2 * 0.9));     // 4 -> 9/10 texels (radius 2 -> 5)
    if (h1 > 0.72 && u > 0.2) sz += 1;
    const fade = u < 0.66 ? 0 : u < 0.79 ? 0.34 : u < 0.9 ? 0.67 : 1;        // 3 dissolve steps
    if (fade >= 1) continue;
    sp.push(x, y, z, sz * Math.sqrt(strength), sz <= 5 ? SHAPE.PUFF2 : SHAPE.PUFF, fade, !!col.emissive,
      col.lit, col.mid, h1, 3, col.rim);
  }
}

/**
 * Fountain water. f = {x, z, spoutY, waterY, basinR} (layout space). Jets arc from the spout into the basin.
 */
export function fountain(sp, t, f, { seed = 9, fps = 8, jets = 4, night = false } = {}) {
  const ts = step(t, fps);
  const land = Math.min(0.78, f.basinR * 0.62);                 // landing radius
  const top = 0.32;                                              // arc apex above the spout
  for (let j = 0; j < jets; j++) {
    const ang = (j / jets) * TAU + Math.PI / 4;                 // diagonals: no jet edge-on to the camera
    const dx = Math.sin(ang), dz = Math.cos(ang);
    const K = 7;
    for (let k = 0; k < K; k++) {
      const u = (ts * 1.25 + k / K + hash(seed, j) * 0.13) % 1;
      const r = u * land;
      const y = f.spoutY + 4 * top * u * (1 - u) - (f.spoutY - f.waterY) * u * u;
      sp.push(f.x + dx * r, y, f.z + dz * r, k % 3 === 0 ? 2 : 1, SHAPE.DOT, 0, false, C.waterLit, C.waterMid);
    }
    // splash where the jet lands: a 2-frame burst cycling at the jet rate
    const sf = Math.floor(ts * fps) % 3;
    sp.push(f.x + dx * land, f.waterY + 0.05 + sf * 0.03, f.z + dz * land, 3, sf === 2 ? SHAPE.DOT : SHAPE.SPARK, sf === 1 ? 1 : 0, false, C.waterLit, C.waterMid);
    // ripple rings spreading from the landing point
    const ru = (ts * 0.5 + hash(seed, j, 2)) % 1;
    sp.push(f.x + dx * land, f.waterY + 0.01, f.z + dz * land, 5 + Math.floor(ru * 4) * 2, SHAPE.RIPPLE, ru < 0.5 ? 0 : (ru - 0.5) * 1.6, false, C.waterLit, C.waterDeep);
  }
  // the crown: a short upward spurt bubbling on the spout
  const bf = Math.floor(ts * fps) % 4;
  for (let k = 0; k < 3; k++) {
    const hh = [0.06, 0.13, 0.2][(k + bf) % 3];
    sp.push(f.x + (k - 1) * 0.04, f.spoutY + hh, f.z, k === 1 ? 2 : 1, SHAPE.DOT, 0, false, C.waterLit, C.waterMid);
  }
}

/** Moths fluttering round a lamp (light anchor pos): 2x2-texel cream / glow-hi flutterers on 8 fps orbits within 0.5 m. */
export function moths(sp, t, at, { seed = 0, n = 4, fps = 8 } = {}) {
  const ts = step(t, fps);
  for (let i = 0; i < n; i++) {
    const h = hash(seed, i, 13);
    const w = (1.4 + h * 1.4) * (i % 2 ? 1 : -1), r = 0.22 + 0.24 * hash(seed, i, 17);
    const a = ts * w + h * TAU + 0.8 * Math.sin(ts * 3.3 + i * 1.7);
    const y = at.y + 0.05 + 0.2 * Math.sin(ts * 2.1 + h * 9) + ((i % 3) - 1) * 0.1;
    const frame = (Math.floor(ts * fps) + i) % 2;
    sp.push(at.x + Math.cos(a) * r, y, at.z + 0.12 + Math.sin(a) * r * 0.7, 2, SHAPE.MOTH2, frame, true, C.moth, C.mothB, 0, 2);
  }
}

/**
 * Fireflies over a box {x0, x1, z0, z1, y0, y1}: `n` flies drifting on slow stepped (4 fps) Lissajous paths, each
 * blinking on a hashed 2.4-3.4 s period (on ~1 s: 2-texel cluster, a 1-texel flicker either side, then dark).
 */
// (perf) the 6 per-fly hashes are constants of (seed, i): cached once instead of an array + 6 hashes per fly per frame
const FLY_H = new Map();
function flyHashes(seed, n) {
  const key = seed * 4096 + n;
  let a = FLY_H.get(key);
  if (!a) {
    a = new Float64Array(n * 6);
    for (let i = 0; i < n; i++) for (let k = 0; k < 6; k++) a[i * 6 + k] = hash(seed, i, 51 + k);
    FLY_H.set(key, a);
  }
  return a;
}
export function fireflies(sp, t, box, { seed = 0, n = 30 } = {}) {
  const ts = step(t, 4);
  const H = flyHashes(seed, n);
  const h = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 6; k++) h[k] = H[i * 6 + k];
    const per = 2.4 + h[0], ph = (ts + h[1] * per) % per;
    if (ph > 1.15) continue;                                            // dark part of the blink
    const fr = ph < 0.2 || ph > 0.9 ? 1 : 0;                            // flicker in / out = 1 texel
    const peak = ph > 0.4 && ph < 0.7;                                  // the bright beat: a 3-texel plus with a dim halo
    const x = box.x0 + (box.x1 - box.x0) * (0.5 + 0.45 * Math.sin(ts * (0.11 + 0.08 * h[2]) + h[3] * TAU));
    const z = box.z0 + (box.z1 - box.z0) * (0.5 + 0.45 * Math.sin(ts * (0.09 + 0.07 * h[4]) + h[5] * TAU + i));
    const y = box.y0 + (box.y1 - box.y0) * (0.5 + 0.5 * Math.sin(ts * 0.6 + i * 2.1));
    if (peak) sp.push(x, y, z, 3, SHAPE.SPARK, 0, true, i % 3 ? C.fly : C.flyB, C.flyDim, 0, 3);
    else sp.push(x, y, z, 2, SHAPE.FLY, fr, true, i % 3 ? C.fly : C.flyB, C.flyDim, 0, 2);
  }
}

/** Rising sparks from `at` starting at t0 (a brazier flare). */
export function embers(sp, t, at, t0, { seed = 0, n = 10, life = 1.4, fps = 10, spread = 0.25 } = {}) {
  const a0 = t - t0;
  if (a0 < 0 || a0 > life + 0.5) return;
  for (let i = 0; i < n; i++) {
    const d = hash(seed, i, 3) * 0.5;
    const a = step(a0 - d, fps);
    if (a < 0 || a > life * (0.6 + 0.4 * hash(seed, i, 4))) continue;
    const h = hash(seed, i, 5), g = hash(seed, i, 6);
    const x = at.x + (h - 0.5) * spread + WIND.x * a * 0.8 + 0.06 * Math.sin(a * 7 + i);
    const z = at.z + (g - 0.5) * spread * 0.6;
    const y = at.y + 0.1 + a * (0.9 + 0.6 * g);
    const cool = a > life * 0.55;
    sp.push(x, y, z, a < 0.25 ? 2 : 1, SHAPE.DOT, 0, true, cool ? C.emberC : C.ember, C.emberB);
  }
}

/** Bell "ding": sparkles that pop beside the belfry for ~0.5 s after each swing extreme in `hits` (times). */
export function glints(sp, t, at, hits, { fps = 8 } = {}) {
  for (let h = 0; h < hits.length; h++) {
    const a = step(t - hits[h], fps);
    if (a < 0 || a > 0.5) continue;
    const side = h % 2 ? 1 : -1;
    const r = 0.55 + a * 1.1;
    for (let k = 0; k < 3; k++) {
      const ang = (k - 1) * 0.55;
      sp.push(at.x + side * r * Math.cos(ang), at.y + r * Math.sin(ang) * 0.9, at.z + 0.3, 3, SHAPE.SPARK, a > 0.3 ? 1 : 0, true, C.glint, C.glintB);
    }
  }
}

export { clamp };
