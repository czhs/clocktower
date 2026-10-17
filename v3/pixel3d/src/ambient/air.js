// Ambient system "air" (owner: ambient-air): cloth, smoke and air. Banners / flags / pennant bunting / laundry lines /
// market awnings moving in a gusting wind (keyed cloth, stepped), chimney smoke puffs that lean with the gusts, dust
// motes in sunbeams that swirl away from a runner, footstep dust puffs + skid / kick-off bursts, puddle splash rings
// and droplets under walkers, and wind gust lines that travel with each gust front. docs/AMBIENT.md (contract).
//
// ---------------------------------------------------------------------------------------------- unique-to-me sheet
// EXTRA ANIMATED PARTS: cloth panels (grid-faceted; FOLD BAND: a facet the ripple turns away from the sun drops one
//   band; a baked 1-texel own-shadow-colour BORDER), bunting triangles, awning valance flaps; PIXEL-DRAWN FX (air/fx.js,
//   one palette atlas): smoke puffs (lumpy discs r 2..9 texels, 3 tones lit from the upper left; the upper column
//   merges pairs into elongated lobes; last drawings eroded rim-inward through a Bayer mask), dust puffs (3-clump
//   clusters in lifted-dirt tones, eroded in 2x2 clumps, rising), 2x2 -> 1-texel droplets, puddle glints, 1-texel motes,
//   gust lines (groups of 2-3 parallel lines with a 2-texel curl at the head); splash rings (concentric pair, 4 radii,
//   a broken 5-arc last drawing, kept inside the water) stay ground geometry; SUNBEAM (fx glow batch, colour only):
//   3 hard slanted bands with stepped alpha + a dithered lit patch drawn over the grass, motes inside the shaft.
// OWN MOTION: one WIND for the whole system: a base breeze + gusts whose FRONT sweeps across the stage at 6 m/s along
//   the wind direction (pure f(t)). Everything samples the same front: a gust line appears where the front is, then
//   the flags snap out, the bunting lifts, the laundry swings, the smoke column kinks, in order across the screen.
//   Cloth is keyed (no integrator): swing about the attach edge (lower rows swing more) + an IN-PLANE shear (the hem
//   trails along the cloth's width: the part that reads when a rope runs across the screen) + a travelling ripple, on
//   a 7.5 fps clock (k=2), amplitude from the QUANTISED wind level (4 steps), so a gust is a visible step, not a fade.
// EXPRESSIONS: a runner passing within ~1.6 m kicks hanging cloth away along his motion (whole-texel jump in 1 tick,
//   then a damped 2-swing recovery over ~2 s, held drawings); laundry items react one after another as he runs the
//   line (each item tests the walker itself: a wave runs down the line); a stop throws a skid burst of 3 big puffs
//   forward; a start kicks 2 puffs back; a foot in a puddle = ring + second ring + 6 droplets (2x2 crown, then 1 texel) instead of dust.
// READABILITY AT GAME SPEED: dust / splash are AT the foot on the step tick (no lead needed: they are the walker's own
//   wake); the cloth kick starts when the runner is still ~1.2-1.6 m away (lookahead on approach); every drawing is
//   held >= 2 frames at 30 Hz (all clocks on the 15 Hz ambient grid); puffs 4-9 texels, rings >= 2 texels thick.
//
// DRAW CALLS: cloth + rigging = ONE dynamic toon mesh (colour + normal + shadow = 3 GL calls); puddles / rings = ONE
//   pose batch, no outline, no shadow (2); smoke / dust / droplets / glints / motes / gust lines = ONE palette-atlas
//   point batch (colour + FLAG_NONE normal pass so no outline crosses a puff = 2); sunbeam glow = ONE colour-only
//   point batch (1). Total 8: this module bundles three planned systems (cloth, smoke, dust/air), under their 3 x 3.
//
// opts (all optional; world-space Vector3s; anything missing is simply not built):
//   wind:     { dir: Vector3 (horizontal), strength 0.4 (base 0..1), every 5.4 (s between gusts), speed 6 (m/s),
//               first 1.4 (s: first gust reaches `center`), center: Vector3, spots: [Vector3 (y = height)] (gust-line
//               groups: put them upwind of the cloth and over dark ground) }
//   flags:    [{ pos (pole foot), poleH 3.2, w 0.95, h 0.6, tones: 'red' | [[hi,mid,sh], ...stripes] }]
//   banners:  [{ pos (post foot), postH 2.3, w 0.55, h 1.05, yaw (attach edge direction, rad), tones }]
//   laundry:  [{ a, b (rope ends: post TOPS), sag 0.16, posts true, items: [{ u (0..1 along the rope), w, h, tones,
//               taper }] }]
//   bunting:  [{ a, b (rope ends), sag 0.25, n 9, size 0.24 (triangle height), tones: [...] }]
//   awnings:  [{ pos (centre foot), yaw, w 1.8, d 1.0, hBack 2.05, hFront 1.7, flaps 6, flapH 0.2, tones: [a, b] }]
//   chimneys: [{ pos (top of the stack) }]  (or anchors.chimneys)
//   puddles:  [{ pos, r 0.5 }]
//   beams:    [{ pos (ground), r 0.8, h 2.2, count 36, sun: Vector3 (towards the sun; beam slant), tods: ['noon', ...]
//               (default: every tod but night; put the beam over SHADE at that tod: motes vanish on light ground),
//               alpha 1 }]
//   dustAt(x, z) -> bool  (default: true; feet raise dust only where it returns true, e.g. dirt)
// api: { wind: { levelAt(x, z, t), gustAt(x, z, t) }, events (dust/splash/push log) }
import * as THREE from 'three';
import * as K from '../chars/kit.js';
import { toonMaterial } from '../materials/toon.js';
import { createAirFx, createAirGlow, PX } from './air/fx.js';
import {
  defineSystem, Ticker, createPoseBatch, paint, mergePose,
  gridIndex, gridTime, clockIndex, clockTime, hash, clamp, lerp, TAU, GRID_HZ,
} from './core.js';

// ------------------------------------------------------------------------------------------------ palette
// [hi, mid, sh] sRGB. Cloth accents come from the scene tables (ART_DIRECTION: mushroom red, flower lilac / yellow /
// white, water blue); shadows shift cool (wine, slate, violet), never black.
export const TONES = {
  red: ['#E07A64', '#B5443F', '#6E2E4A'],
  wine: ['#B4505A', '#8E3135', '#56283E'],
  linen: ['#F4F0DC', '#D8D0B8', '#8E8C9E'],
  blue: ['#B8DCE8', '#84B7D2', '#4F6E96'],
  ochre: ['#F2E08A', '#D4B44E', '#8A6E50'],
  lilac: ['#DCB8F2', '#A875D7', '#5E4C8C'],
  sage: ['#C6D69A', '#94AA6F', '#566E5E'],
  wood: ['#A88878', '#7A5A5E', '#4E4A5C'],
  rope: ['#CBB394', '#9C8270', '#5C4E5C'],
  // (smoke / dust / droplet / mote / gust colours: the FX palette in air/fx.js)
  puddle: ['#C4E4EC', '#8CBCD2', '#5E86A6'],
  puddleNight: ['#7E9CB8', '#4E6A88', '#3A4E6A'],
  wet: ['#8E7066', '#76605A', '#544652'],
  ring: ['#E8FBFF', '#D6F1F5', '#A6CAD8'],
  ringNight: ['#A6BED4', '#8AA4C0', '#5E7A98'],
  // sunbeam ground patch (lit grass under the beam) and its golden-hour variant
  beam: ['#8CB46A', '#6E9C5C', '#4E7C52'],
  beamGold: ['#C4B060', '#A69454', '#7A7650'],
};
const SPRITE = {
  mote: '#FFF2C8', moteDim: '#E8D6A6', moteGold: '#FFD890', moteGoldDim: '#E0B070',
  drop: '#E8FBFF', glint: '#F4FEFF', gust: '#F2F4E4', gustNight: '#7E90B4', glintNight: '#B8C8E8',
};
const tonesOf = (t, fallback = 'linen') => (Array.isArray(t) ? t : TONES[t] ?? TONES[fallback]);

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DOWN = V3(0, -1, 0);
const UPV = V3(0, 1, 0);

// ------------------------------------------------------------------------------------------------ wind
/**
 * One wind for the whole system, pure f(t): base breeze + gusts. Gust k reaches the wind centre at
 * T_k = first + k*every + jitter and its front sweeps along `dir` at `speed`, so it reaches a point s metres
 * downwind of the centre s/speed later. The envelope at a point: 4-tick rise, 0.4 s hold, 0.9 s decay.
 */
function makeWind(o = {}, seed = 1) {
  const dir = (o.dir ? o.dir.clone() : V3(1, 0, 0)).setY(0).normalize();
  const center = o.center ? o.center.clone() : V3();
  const base = o.strength ?? 0.4, every = o.every ?? 5.4, speed = o.speed ?? 6, first = o.first ?? 1.4;
  const RISE = 4 / GRID_HZ, HOLD = 0.4, DECAY = 0.9, DUR = RISE + HOLD + DECAY;
  const Tk = (k) => first + k * every + hash(k + 11, seed, 3) * Math.min(1.6, every - DUR);
  const gain = (k) => 0.75 + 0.25 * hash(k + 5, seed, 9);
  const along = (x, z) => (x - center.x) * dir.x + (z - center.z) * dir.z;
  function gustAt(x, z, t) {
    const lag = along(x, z) / speed;
    const k0 = Math.floor((t - lag - first) / every);
    let g = 0;
    for (let k = Math.max(0, k0 - 1); k <= k0 + 1; k++) {
      const a = t - (Tk(k) + lag);
      if (a < 0 || a >= DUR) continue;
      const e = a < RISE ? (a + 1 / GRID_HZ) / (RISE + 1 / GRID_HZ) : a < RISE + HOLD ? 1 : 1 - (a - RISE - HOLD) / DECAY;
      g = Math.max(g, e * gain(k));
    }
    return g;
  }
  /** Quantised wind level 0..1 in 4 steps (calm, breeze, strong, gust) at a stepped time. */
  const levelAt = (x, z, t) => Math.round(clamp(base + 0.62 * gustAt(x, z, t)) * 3) / 3;
  /** Gust k's arrival time at a point (for one-shot effects: gust lines, smoke kinks). */
  const arrival = (k, x, z) => Tk(k) + along(x, z) / speed;
  return { dir, center, base, every, speed, first, gustAt, levelAt, arrival, along, DUR };
}

// ------------------------------------------------------------------------------------------------ rigging geometry
/** Box beam from a to b (square section `th`), painted. */
function beam(a, b, th, tones) {
  const d = b.clone().sub(a), L = d.length();
  const g = K.box(th, th, L);
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), d.normalize()), V3(1, 1, 1));
  g.applyMatrix4(m);
  return paint(g, tones);
}
const post = (foot, h, th, tones) => paint(K.xf(K.box(th, h, th), { at: [foot.x, foot.y + h / 2, foot.z] }), tones);
/** Rope polyline a -> b with a parabolic sag, n segments. */
function ropePts(a, b, sag, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const u = i / n; const p = a.clone().lerp(b, u); p.y -= sag * 4 * u * (1 - u); pts.push(p); }
  return pts;
}
const ropeAt = (a, b, sag, u, out = V3()) => { out.copy(a).lerp(b, u); out.y -= sag * 4 * u * (1 - u); return out; };

// ------------------------------------------------------------------------------------------------ puff drawings
function ring(r, w, tones, seg = 20, broken = false) {
  // broken = the ring's last drawing: 5 arcs of 44 deg with 28 deg gaps (it breaks up instead of popping)
  const arcs = broken ? [0, 1, 2, 3, 4].map((k) => [k * 0.4 * Math.PI + 0.3, 0.245 * Math.PI]) : [[0, TAU]];
  return mergePose(arcs.map(([a0, len]) => {
    const g = new THREE.RingGeometry(Math.max(0.005, r - w / 2), r + w / 2, broken ? 5 : seg, 1, a0, len);
    g.rotateX(-Math.PI / 2);
    return paint(g.toNonIndexed(), tones);
  }));
}
const lobe = (cx, cz, r, y, tones) => { const g = new THREE.CircleGeometry(r, 18); g.rotateX(-Math.PI / 2); g.translate(cx, y, cz); return paint(g.toNonIndexed(), tones); };
function puddleDisc(seed, night) {
  // irregular puddle: two overlapping lobes, a darker wet rim under the water (unit radius, scaled per puddle)
  const a = 0.35 + hash(seed, 1) * 0.3, W = night ? TONES.puddleNight : TONES.puddle;
  return mergePose([
    lobe(0, 0, 1.14, 0.0, TONES.wet), lobe(Math.cos(a) * 0.55, Math.sin(a) * 0.4, 0.78, 0.0, TONES.wet),
    lobe(0, 0, 1.0, 0.004, W), lobe(Math.cos(a) * 0.55, Math.sin(a) * 0.4, 0.64, 0.004, W),
  ]);
}
const RING_R = [0.1, 0.19, 0.29, 0.4];
/** Pose set for the current light: night swaps the puddle / ring ramps (batch rebuilt on a tod change). */
function puffPoses(seed, { night = false } = {}) {
  // ground-plane drawings only (true 3D depth against walkers' feet); smoke / dust / droplets are pixel sprites (fx.js);
  // the sunbeam's lit patch is a glow sprite OVER the grass (r3: a ground pose was hidden under the blades)
  const P = [];
  RING_R.forEach((r) => P.push(ring(r, 0.062, night ? TONES.ringNight : TONES.ring)));                    // 0..3
  RING_R.forEach((r) => P.push(ring(r, 0.062, night ? TONES.ringNight : TONES.ring, 20, true)));          // 4..7 broken
  P.push(puddleDisc(seed, night));                                                                          // 8
  return P;
}
const PZ = { RING: 0, RING_BROKEN: 4, PUDDLE: 8 };

// ------------------------------------------------------------------------------------------------ cloth pieces
// A piece is a grid of nu x nv facets; points(t) writes its (nu+1)(nv+1) grid points; tone(i, j) picks the facet's
// [hi, mid, sh]. Kinds: 'hang' (top edge fixed: banners, laundry, bunting, valance), 'flag' (pole edge fixed, flows
// downwind), 'sheet' (awning canopy: back + front edges fixed, billows between).
const respKick = (age) => {
  // push response: 1-tick kick to full, then a damped 2-swing recovery (~2 s). age in s (stepped).
  if (age < 0) return 0;
  if (age < 1 / GRID_HZ + 1e-6) return 0.7;
  const a = age - 1 / GRID_HZ;
  return Math.exp(-a / 0.6) * Math.cos(TAU * a / 0.95);
};

export default defineSystem({
  name: 'air', owner: 'ambient-air', budget: { glCalls: 8 },
  create(ctx, opts = {}) {
    const { engine, actors, anchors, heightAt } = ctx;
    const seed = ctx.seed;
    const groundY = (x, z) => heightAt?.(x, z) ?? 0;
    const wind = makeWind({ center: opts.wind?.center ?? anchors?.spots?.flock, ...(opts.wind || {}) }, seed);
    const dustAt = opts.dustAt ?? (() => true);
    const events = [];
    const log = (e) => { if (events.length < 96) events.push(e); };

    // ================================================================ CLOTH (one dynamic mesh)
    const rig = [];          // static painted geometries (posts, ropes)
    const pieces = [];       // dynamic cloth
    const WOOD = TONES.wood, ROPE = TONES.rope;

    const addHang = (P) => pieces.push({ kind: 'hang', taper: 1, react: true, ph: pieces.length, ...P });
    for (const f of opts.flags ?? []) {
      const H = f.poleH ?? 3.2, top = f.pos.clone().setY(f.pos.y + H);
      rig.push(post(f.pos, H + 0.06, 0.08, WOOD));
      rig.push(paint(K.xf(K.box(0.12, 0.08, 0.12), { at: [top.x, top.y + 0.07, top.z] }), TONES.ochre));
      const stripes = Array.isArray(f.tones?.[0]) ? f.tones : [tonesOf(f.tones ?? 'red'), TONES.linen, tonesOf(f.tones ?? 'red')];
      pieces.push({ kind: 'flag', O: top.clone().setY(top.y - 0.02), w: f.w ?? 0.95, h: f.h ?? 0.6, nu: 8, nv: 3, react: false,
        tone: (i, j) => stripes[Math.min(stripes.length - 1, Math.floor((j / 3) * stripes.length))], ph: pieces.length });
    }
    for (const b of opts.banners ?? []) {
      const H = b.postH ?? 2.3, w = b.w ?? 0.55, yaw = b.yaw ?? 0;
      const aU = V3(Math.cos(yaw), 0, -Math.sin(yaw));
      rig.push(post(b.pos, H, 0.09, WOOD));
      const top = b.pos.clone().setY(b.pos.y + H - 0.1);
      const bar0 = top.clone().addScaledVector(aU, -0.12), bar1 = top.clone().addScaledVector(aU, w + 0.12);
      rig.push(beam(bar0, bar1, 0.06, WOOD));
      const tA = tonesOf(b.tones ?? 'wine'), tB = TONES.ochre;
      addHang({ O: top.clone().addScaledVector(aU, 0.04).setY(top.y - 0.04), aU, w: w - 0.08, len: b.h ?? 1.05, nu: 3, nv: 6,
        tone: (i, j) => (j === 1 || j === 4 ? tB : tA), taper: 1, notch: true, reach: 1.8, banner: true });
    }
    for (const L of opts.laundry ?? []) {
      const sag = L.sag ?? 0.16;
      if (L.posts !== false) for (const p of [L.a, L.b]) rig.push(post(p.clone().setY(groundY(p.x, p.z)), p.y - groundY(p.x, p.z) + 0.05, 0.08, WOOD));
      const rp = ropePts(L.a, L.b, sag, 10);
      for (let i = 0; i < rp.length - 1; i++) rig.push(beam(rp[i], rp[i + 1], 0.028, ROPE));
      for (const it of L.items ?? []) {
        const w = it.w ?? 0.4, du = w / L.a.distanceTo(L.b);
        const p0 = ropeAt(L.a, L.b, sag, it.u - du / 2), p1 = ropeAt(L.a, L.b, sag, it.u + du / 2);
        const aU = p1.clone().sub(p0).setY(0).normalize();
        const tn = tonesOf(it.tones ?? 'linen');
        const band = it.band ? tonesOf(it.band) : null;
        // pegs (2 x 1-texel wood dots)
        for (const p of [p0, p1]) rig.push(paint(K.xf(K.box(0.04, 0.06, 0.04), { at: [p.x, p.y - 0.01, p.z] }), TONES.wood));
        addHang({ O: p0.clone().setY((p0.y + p1.y) / 2 - 0.01), aU, w, len: it.h ?? 0.55, nu: Math.max(2, Math.round(w / 0.13)), nv: Math.max(3, Math.round((it.h ?? 0.55) / 0.13)),
          tone: (i, j, nu, nv) => (band && j === nv - 1 ? band : tn), taper: it.taper ?? 1, reach: 1.7, mass: it.mass ?? 1 });
      }
    }
    for (const B of opts.bunting ?? []) {
      const n = B.n ?? 9, sag = B.sag ?? 0.25, size = B.size ?? 0.24;
      if (B.posts) for (const p of B.posts === true ? [B.a, B.b] : B.posts) rig.push(post(p.clone().setY(groundY(p.x, p.z)), p.y - groundY(p.x, p.z) + 0.05, 0.08, WOOD));
      const rp = ropePts(B.a, B.b, sag, 12);
      for (let i = 0; i < rp.length - 1; i++) rig.push(beam(rp[i], rp[i + 1], 0.028, ROPE));
      const cols = (B.tones ?? ['red', 'ochre', 'linen', 'blue']).map((t) => tonesOf(t));
      const wTri = Math.min(size * 0.95, B.a.distanceTo(B.b) / n * 0.72);   // >= 6 texels wide: colour inside the line
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n, du = wTri / B.a.distanceTo(B.b);
        const p0 = ropeAt(B.a, B.b, sag, u - du / 2), p1 = ropeAt(B.a, B.b, sag, u + du / 2);
        const aU = p1.clone().sub(p0).setY(0).normalize();
        const tn = cols[k % cols.length];
        addHang({ O: p0.clone().setY((p0.y + p1.y) / 2 - 0.005), aU, w: wTri, len: size, nu: 2, nv: 2, tone: () => tn, taper: 0, reach: 1.5, light: true });
      }
    }
    for (const A of opts.awnings ?? []) {
      const w = A.w ?? 1.8, d = A.d ?? 1.0, yaw = A.yaw ?? 0, hB = A.hBack ?? 2.05, hF = A.hFront ?? 1.7;
      const aU = V3(Math.cos(yaw), 0, -Math.sin(yaw)), fw = V3(Math.sin(yaw), 0, Math.cos(yaw));   // fw: towards the front
      const c = A.pos.clone();
      const corner = (su, sf, h) => c.clone().addScaledVector(aU, su * w / 2).addScaledVector(fw, sf * d / 2).setY(c.y + h);
      const BL = corner(-1, -1, hB), BR = corner(1, -1, hB), FL = corner(-1, 1, hF), FR = corner(1, 1, hF);
      for (const p of [BL, BR, FL, FR]) rig.push(post(p.clone().setY(groundY(p.x, p.z)), p.y - groundY(p.x, p.z), 0.08, WOOD));
      rig.push(beam(FL.clone().addScaledVector(aU, -0.06), FR.clone().addScaledVector(aU, 0.06), 0.06, WOOD));
      rig.push(beam(BL.clone().addScaledVector(aU, -0.06), BR.clone().addScaledVector(aU, 0.06), 0.06, WOOD));
      const [tA, tB] = (A.tones ?? ['linen', 'red']).map((t) => tonesOf(t));
      const nu = 6;
      pieces.push({ kind: 'sheet', BL, BR, FL, FR, nu, nv: 3, react: true, reach: 1.8, ph: pieces.length,
        tone: (i) => (i % 2 ? tB : tA), center: c.clone().setY((hB + hF) / 2) });
      // side cheeks: a triangle of cloth under each end (back top -> front top -> front valance foot) so the slope
      // reads as a silhouette, with the underside tone (the shadow band) facing out
      const flapH = A.flapH ?? 0.2;
      if (A.cheeks !== false) for (const [Bk, Fr, sgn] of [[BL, FL, -1], [BR, FR, 1]]) {
        const g = new THREE.BufferGeometry();
        const o = aU.clone().multiplyScalar(sgn * 0.01);
        const a = Bk.clone().add(o), b = Fr.clone().add(o), cc = Fr.clone().add(o).setY(Fr.y - flapH * 0.9);
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z, cc.x, cc.y, cc.z]), 3));
        g.computeVertexNormals();
        rig.push(paint(g, [tA[1], tA[2], tA[2]]));
      }
      const nf = A.flaps ?? 6;
      for (let k = 0; k < nf; k++) {
        const u0 = k / nf, u1 = (k + 1) / nf;
        const p0 = FL.clone().lerp(FR, u0), p1 = FL.clone().lerp(FR, u1);
        addHang({ O: p0.clone().addScaledVector(fw, 0.02).setY(p0.y + 0.01), aU, w: p0.distanceTo(p1), len: flapH, nu: 2, nv: 2,
          tone: () => (Math.floor(u0 * nu + 1e-6) % 2 ? tB : tA), taper: 1, scallop: true, reach: 2.2, light: true, valance: true,
          edgeU: 'none', edgeV: 'bottom' });
      }
    }

    // geometry: static rig first, then the dynamic cloth facets (6 verts per facet, non-indexed, flat)
    const rigGeo = rig.length ? mergePose(rig) : null;
    const nRig = rigGeo ? rigGeo.attributes.position.count : 0;
    let nCloth = 0;
    for (const p of pieces) {
      p.v0 = nRig + nCloth; nCloth += p.nu * p.nv * 6; p.grid = new Float32Array((p.nu + 1) * (p.nv + 1) * 3); p.key = -1;
      p.lit = new Float32Array(p.nu * p.nv);
    }
    const NV = nRig + nCloth;
    let clothMesh = null, posArr = null, nrmArr = null, foldArr = null, geo = null;
    if (NV > 0) {
      geo = new THREE.BufferGeometry();
      posArr = new Float32Array(NV * 3); nrmArr = new Float32Array(NV * 3);
      const col = new Float32Array(NV * 3), hi = new Float32Array(NV * 3), sh = new Float32Array(NV * 3);
      if (rigGeo) {
        posArr.set(rigGeo.attributes.position.array); nrmArr.set(rigGeo.attributes.normal.array);
        col.set(rigGeo.attributes.color.array); hi.set(rigGeo.attributes.toneHi.array); sh.set(rigGeo.attributes.toneSh.array);
      }
      const C = (hex) => new THREE.Color(hex);
      for (const p of pieces) {
        let v = p.v0;
        for (let j = 0; j < p.nv; j++) for (let i = 0; i < p.nu; i++) {
          const [h, m, s] = p.tone(i, j, p.nu, p.nv).map(C);
          for (let q = 0; q < 6; q++, v++) { col.set([m.r, m.g, m.b], v * 3); hi.set([h.r, h.g, h.b], v * 3); sh.set([s.r, s.g, s.b], v * 3); }
        }
      }
      // cloth (u, v) for the baked 1-texel own-colour border (fragment: within 1 texel of a 0 / 1 edge); 0.5 = no
      // edge in that direction (rig, valance sides). edgeV 'bottom' maps v to 0.5..1 so only the hem gets a line.
      const uv = new Float32Array(NV * 2).fill(0.5);
      for (const p of pieces) {
        const mu = (u) => (p.edgeU === 'none' ? 0.5 : u), mv = (v) => (p.edgeV === 'none' ? 0.5 : p.edgeV === 'bottom' ? 0.5 + 0.5 * v : v);
        let v = p.v0;
        for (let j = 0; j < p.nv; j++) for (let i = 0; i < p.nu; i++) {
          for (const [di, dj] of [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]]) { uv[v * 2] = mu((i + di) / p.nu); uv[v * 2 + 1] = mv((j + dj) / p.nv); v++; }
        }
      }
      foldArr = new Float32Array(NV);
      const dyn = (a, n = 3) => { const b = new THREE.BufferAttribute(a, n); b.setUsage(THREE.DynamicDrawUsage); return b; };
      geo.setAttribute('position', dyn(posArr)); geo.setAttribute('normal', dyn(nrmArr));
      geo.setAttribute('aFold', dyn(foldArr, 1)); geo.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('toneHi', new THREE.BufferAttribute(hi, 3));
      geo.setAttribute('toneSh', new THREE.BufferAttribute(sh, 3));
      // thin cloth is lit through (and hangs vertical under a high sun): cloth facets get one band up (aCut = 1),
      // the wooden rig keeps the plain ramp
      const cut = new Float32Array(NV); cut.fill(1, nRig);
      geo.setAttribute('aCut', new THREE.BufferAttribute(cut, 1));
      // FOLD BAND (aFold = 1): a facet whose ripple turns it away from the sun drops one band (hi -> mid, mid -> sh),
      // so a rippling panel shows its folds instead of one flat tone. BORDER: the facets' (u, v) put a 1-texel line
      // of the cloth's own shadow tone along its edges (the shared outline pass only gives cloth a pale line).
      const mat = toonMaterial(engine, { vertexColors: true, toneAttributes: true, flatShading: true, side: THREE.DoubleSide, outline: 'full',
        vertexHead: 'attribute float aCut; attribute float aFold; attribute vec2 aUV; varying float vClothFold; varying vec2 vClothUV;',
        vertex: 'vClothFold = aFold; vClothUV = aUV;',
        fragmentHead: 'varying float vClothFold; varying vec2 vClothUV;',
        tones: `
          if (vClothFold > 0.5) { toonHi = toonMid; toonMid = toonSh; }
          {
            vec2 cfw = max(fwidth(vClothUV), vec2(1e-5));
            vec2 ce = min(vClothUV, 1.0 - vClothUV) / cfw;
            if (min(ce.x, ce.y) < 1.0) { vec3 cb = vToneSh * 0.82; toonHi = cb; toonMid = cb; toonSh = cb; }
          }`,
        cutMod: 'aCut' });
      clothMesh = new THREE.Mesh(geo, mat);
      clothMesh.castShadow = true; clothMesh.receiveShadow = true; clothMesh.frustumCulled = false; clothMesh.name = 'ambient-air-cloth';
      ctx.root.add(clothMesh);
    }

    // piece frames + reaction state
    for (const p of pieces) {
      if (p.kind === 'hang') {
        p.n = p.aU.clone().cross(DOWN).normalize();               // plane normal (horizontal)
        p.center = p.O.clone().addScaledVector(p.aU, p.w / 2).setY(p.O.y - p.len / 2);
      } else if (p.kind === 'flag') {
        p.center = p.O.clone().setY(p.O.y - p.h / 2);
      }
      p.push = { t0: -9, mag: 0, sgn: 1 };
      p.k = 2; p.phase = (p.ph * 7) % 2;
    }

    const tmpA = V3(), tmpB = V3(), tmpC = V3();
    // grid writers -------------------------------------------------------------------------------------------
    function hangPoints(p, t) {
      const ts = clockTime(t, p.k, p.phase);
      const lvl = wind.levelAt(p.center.x, p.center.z, ts);
      const cw = wind.dir.dot(p.n);                                // + : wind blows along +n through the plane
      const light = p.light ? 1.5 : 1, mass = p.mass ?? 1;
      const kick = p.push.mag * respKick(ts - p.push.t0) * p.push.sgn;
      // swing (rad): steady lean with the wind + slow sway + the kick
      const sway = Math.sin(TAU * (ts * 0.55) + p.ph * 1.7) * (0.06 + 0.16 * lvl) * light;
      // a gust and a kick must not stack into an edge-on sliver: the kick shrinks by how far the wind already leans
      // the cloth, and the sum is clamped to 0.6 rad (>= 4 texels of face stay visible). Valance flaps get a stronger
      // kick (they are short) under the same clamp.
      const LIM = 0.6;
      const lean = clamp(Math.sign(cw) * Math.sqrt(Math.abs(cw)) * lvl * 0.55 * light / mass, -LIM, LIM);
      const kk = kick * (p.valance ? 1.7 : p.banner ? 1.1 : 0.8) * light / mass * (1 - Math.abs(lean) / LIM * (Math.sign(kick) === Math.sign(lean) ? 1 : 0.3));
      const theta = clamp(lean + sway + kk, -LIM, LIM);
      // IN-PLANE shear: the bottom edge trails along the cloth's own width (a parallelogram silhouette). The laundry /
      // bunting ropes run across the screen, so a swing about the rope only foreshortens (invisible); the shear is
      // what reads: wind along the rope + a runner passing along it drag the hems sideways, then they swing back.
      const cu = wind.dir.dot(p.aU);
      const kickU = p.push.mag * respKick(ts - p.push.t0) * (p.push.su ?? 0);
      const swayU = Math.sin(TAU * (ts * 0.42) + p.ph * 2.9) * (0.02 + 0.05 * lvl);
      // valance flaps (r3): the laundry shear treatment, kicked harder (each flap tests the runner itself, so the kick
      // ripples along the front as he passes) with the hem trailing
      const shear = clamp(cu * lvl * 0.3 * light / mass + kickU * (p.valance ? 1.7 : 1.0) * light / mass + swayU, -0.5, 0.5) * (p.valance ? 0.9 : 1);
      const pushEnv = Math.abs(p.push.mag * Math.exp(-Math.max(0, ts - p.push.t0) / 0.6)) * (ts >= p.push.t0 ? 1 : 0);
      const amp = (0.012 + 0.03 * lvl + 0.05 * pushEnv) * light;
      const nu = p.nu, nv = p.nv, g = p.grid;
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        // cumulative hang: lower rows swing more (cloth bends at the top, not a rigid board)
        let px = 0, py = 0, pz = 0;
        for (let j = 0; j <= nv; j++) {
          const v = j / nv;
          const xw = p.taper === 1 ? u : 0.5 + (u - 0.5) * lerp(1, p.taper, v);
          let o = (j * (nu + 1) + i) * 3;
          if (j > 0) {
            const th = theta * (0.5 + 0.5 * (v - 0.5 / nv));
            const seg = p.len / nv;
            px += (p.n.x * Math.sin(th)) * seg; py += -Math.cos(th) * seg; pz += (p.n.z * Math.sin(th)) * seg;
          }
          const rip = amp * v * Math.sin(TAU * (xw * 1.3 + v * 0.7 - ts * 1.6) + p.ph * 2.3);
          let hem = 0;
          if (p.scallop && j === nv) hem = (i === 0 || i === nu ? 0.03 : -0.035);  // scalloped valance (2-texel dip)
          if (p.notch && j === nv && i > 0 && i < nu) hem = 0.12;                  // swallow-tail banner
          const sh = shear * p.len * Math.pow(v, 1.35);
          g[o] = p.O.x + p.aU.x * (xw * p.w + sh) + px + p.n.x * rip;
          g[o + 1] = p.O.y + py + hem + 0.5 * shear * shear * p.len * v;
          g[o + 2] = p.O.z + p.aU.z * (xw * p.w + sh) + pz + p.n.z * rip;
        }
      }
    }
    function flagPoints(p, t) {
      const ts = clockTime(t, p.k, p.phase);
      const lvl = wind.levelAt(p.O.x, p.O.z, ts);
      const droop = (1 - lvl) * 0.95 + 0.08;                       // rad below horizontal: limp in a calm
      const f = wind.dir, side = tmpA.copy(f).cross(DOWN).normalize();
      const gx = f.x * Math.cos(droop), gy = -Math.sin(droop), gz = f.z * Math.cos(droop);
      const amp = 0.03 + 0.07 * lvl, sp = 1.4 + 1.2 * lvl;
      const nu = p.nu, nv = p.nv, g = p.grid;
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv;
        const L = u * p.w * (1 - 0.05 * lvl * Math.abs(Math.sin(TAU * (u - ts * sp))));
        const wav = amp * u * Math.sin(TAU * (u * 1.15 - ts * sp) + v * 0.5 + p.ph);
        const lift = 0.04 * u * lvl * Math.sin(TAU * (u * 0.8 - ts * sp) + 1.3);
        const o = (j * (nu + 1) + i) * 3;
        g[o] = p.O.x + gx * L + side.x * wav;
        g[o + 1] = p.O.y - v * p.h + gy * L + lift;
        g[o + 2] = p.O.z + gz * L + side.z * wav;
      }
    }
    function sheetPoints(p, t) {
      const ts = clockTime(t, p.k, p.phase);
      const gst = Math.round(wind.gustAt(p.center.x, p.center.z, ts) * 3) / 3;
      const lvl = wind.levelAt(p.center.x, p.center.z, ts);
      const kick = p.push.mag * respKick(ts - p.push.t0);
      // canopy billow: lifts in a gust (wind under the cloth), small breathing otherwise, a dip when kicked
      // (a runner passing kicks it UP: the canopy pops then settles with the damped swing)
      const bil = 0.035 * Math.sin(TAU * ts * 0.7 + p.ph) * (0.4 + lvl) + 0.18 * gst + 0.12 * kick;
      const nu = p.nu, nv = p.nv, g = p.grid;
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv;
        tmpA.copy(p.BL).lerp(p.BR, u); tmpB.copy(p.FL).lerp(p.FR, u);
        tmpC.copy(tmpA).lerp(tmpB, v);
        const s = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        const ripple = 0.02 * lvl * Math.sin(TAU * (u * 1.5 - ts * 1.3) + p.ph) * Math.sin(Math.PI * v);
        const o = (j * (nu + 1) + i) * 3;
        g[o] = tmpC.x; g[o + 1] = tmpC.y + bil * s + ripple - 0.03 * s; g[o + 2] = tmpC.z;
      }
    }
    const e1 = V3(), e2 = V3(), fn = V3(), toCam = V3(), sunW = V3();
    const q00 = V3(), q10 = V3(), q01 = V3(), q11 = V3();
    const FOLD_DROP = 0.07;    // a facet this much less sun-facing than its panel's mean is a fold
    function writePiece(p) {
      const g = p.grid, nu = p.nu;
      let v = p.v0;
      const P = (i, j, out) => { const o = (j * (nu + 1) + i) * 3; return out.set(g[o], g[o + 1], g[o + 2]); };
      const tri = (a, b, c) => {
        e1.subVectors(b, a); e2.subVectors(c, a); fn.crossVectors(e1, e2).normalize();
        for (const q of [a, b, c]) { posArr[v * 3] = q.x; posArr[v * 3 + 1] = q.y; posArr[v * 3 + 2] = q.z; nrmArr[v * 3] = fn.x; nrmArr[v * 3 + 1] = fn.y; nrmArr[v * 3 + 2] = fn.z; v++; }
      };
      let mean = 0;
      for (let j = 0, f = 0; j < p.nv; j++) for (let i = 0; i < nu; i++, f++) {
        P(i, j, q00); P(i + 1, j, q10); P(i, j + 1, q01); P(i + 1, j + 1, q11);
        tri(q00, q01, q10); tri(q10, q01, q11);
        // facet normal from the diagonals, turned to the camera side (double-sided cloth): how sun-facing it reads
        e1.subVectors(q11, q00); e2.subVectors(q01, q10); fn.crossVectors(e1, e2);
        const l = fn.length();
        if (l < 1e-9) { p.lit[f] = 0; continue; }
        fn.multiplyScalar(1 / l);
        if (fn.dot(toCam) < 0) fn.negate();
        p.lit[f] = fn.dot(sunW); mean += p.lit[f];
      }
      mean /= p.lit.length;
      v = p.v0;
      for (let f = 0; f < p.lit.length; f++) {
        const fold = p.kind !== 'sheet' && p.lit[f] < mean - FOLD_DROP ? 1 : 0;   // canopy facets are too big for folds
        for (let q = 0; q < 6; q++) foldArr[v++] = fold;
      }
    }

    // ================================================================ PUFFS (pose batch) + SPRITES
    const chimneys = (opts.chimneys ?? anchors?.chimneys ?? []).map((c) => (c.pos ?? c).clone());
    const puddles = (opts.puddles ?? []).map((p, i) => ({ pos: p.pos.clone().setY(groundY(p.pos.x, p.pos.z) + 0.012), r: p.r ?? 0.5, yaw: hash(i, 3, seed) * TAU }));
    // a beam: shaft from pos up towards `sun` (slant = sun.xz / sun.y, capped), only at the tods it lists
    const beams = (opts.beams ?? []).map((b) => {
      const sun = (b.sun ?? V3(-0.9, 1, -0.1)).clone().normalize(), h = b.h ?? 2.2, k = h / Math.max(0.55, sun.y);
      return { pos: b.pos.clone(), r: b.r ?? 0.8, h, count: b.count ?? 36, sun, top: V3(b.pos.x + sun.x * k, b.pos.y + h, b.pos.z + sun.z * k),
        tods: b.tods ?? null, alpha: b.alpha ?? 1 };
    });
    const beamOn = (b) => (b.tods ? b.tods.includes(tod?.name) : tod?.name !== 'night');
    // smoke: a puff every SMOKE_P ticks (0.2 s: ~1 radius apart near the stack = one column), each with its own life
    // (60-100 % of SMOKE_LIFE s) so the top of the column breaks into clumps; lean saturates at SMOKE_LEAN_MAX
    const SMOKE_P = 4, SMOKE_LIFE = 3.4, SMOKE_RISE = 0.7, SMOKE_LEAN_MAX = 1.2;
    const MAX_DUST = 30, MAX_SPLASH = 8;
    const nPuff = puddles.length + MAX_SPLASH * 2;
    const lightKey = (td) => ((td?.night ?? 0) >= 0.8 || td?.name === 'night' ? 'night' : td?.name === 'golden' ? 'gold' : 'day');
    let puffKey = lightKey(ctx.tod);
    const makePuffs = (k) => createPoseBatch(engine, { poses: puffPoses(seed, { night: k === 'night' }), max: Math.max(1, nPuff),
      outline: 'none', castShadow: false, name: 'ambient-air-puffs', parent: ctx.root });
    let puffs = makePuffs(puffKey);
    const fx = createAirFx(engine, { max: 512, parent: ctx.root });
    const glow = beams.length ? createAirGlow(engine, { max: beams.length * 2, parent: ctx.root }) : null;
    const AT = fx.atlas, tw0 = 1 / fx.tpm;

    // motes
    const mr = ctx.rng(4);
    const motes = [];
    {
      // homes INSIDE the drawn shaft: along the beam axis, spread across it mostly along the screen's x (the bright
      // band is ~0.4 r wide on each side of the axis), a little in depth
      const cy0 = engine.camera.yaw ?? Math.PI / 4, cr = V3(Math.cos(cy0), 0, -Math.sin(cy0)), cf = V3(-Math.sin(cy0), 0, -Math.cos(cy0));
      beams.forEach((b, bi) => {
        for (let i = 0; i < b.count; i++) {
          const s = 0.04 + 0.86 * mr(), x = (mr() + mr() - 1) * 0.5 * b.r, z = (mr() - 0.5) * 0.5 * b.r;
          const home = b.pos.clone().lerp(b.top, s).addScaledVector(cr, x).addScaledVector(cf, z);
          motes.push({ i: motes.length, b: bi, home, push: { t0: -9, x: 0, y: 0, z: 0, sw: 1 } });
        }
      });
    }

    // ================================================================ REACTION TICKER (15 Hz replay)
    // cloth kicks, mote stirs, footstep dust / skid / kick-off / splash events. Pure f(t) through replay.
    const feet = new Map();
    const dust = [];            // {t0, x, y, z, dx, dz, big}
    const splash = [];          // {t0, p (puddle idx), x, z, s}
    let pushes = 0, firstPush = '', steps = 0;
    const inPuddle = (x, z, k = 1.1) => puddles.findIndex((p) => Math.hypot(x - p.pos.x, z - p.pos.z) < p.r * k);
    const FOOT_REACH = 0.15;    // m: the feet land up to ~0.15 m off the body path (side step + stride spread)
    const addDust = (e) => { dust.push(e); if (dust.length > MAX_DUST) dust.shift(); };
    const addSplash = (t, pi, x, z, sp, f, forced = false) => {
      splash.push({ t0: t, p: pi, x, z, s: clamp(sp / 5.5, 0.4, 1), k: steps + (forced ? 500 : 0) });
      if (splash.length > MAX_SPLASH) splash.shift();
      if (f) f.wet[pi] = 2;                                              // this crossing has splashed
      log({ k: 'splash', t: +t.toFixed(3), ...(forced ? { forced: 1 } : {}) });
    };
    function footfall(t, it, side, f) {
      steps++;
      const sp = Math.max(1e-3, it.speed), dx = it.vx / sp, dz = it.vz / sp;
      const x = it.x - dx * 0.1 + dz * 0.09 * side, z = it.z - dz * 0.1 - dx * 0.09 * side;
      const pi = inPuddle(x, z);
      if (pi >= 0) {
        addSplash(t, pi, x, z, sp, f);
      } else if (dustAt(x, z) && inPuddle(x, z, 1.5) < 0) {        // no dry dust on the wet rim
        addDust({ t0: t, x, y: groundY(x, z), z, dx: -dx, dz: -dz, big: sp > 4 ? 1 : 0, k: steps });
      }
    }
    const ticker = new Ticker({
      hz: GRID_HZ,
      reset() {
        feet.clear(); dust.length = 0; splash.length = 0; events.length = 0; pushes = 0; firstPush = ''; steps = 0;
        for (const p of pieces) p.push = { t0: -9, mag: 0, sgn: 1 };
        for (const m of motes) m.push = { t0: -9, x: 0, y: 0, z: 0, sw: 1 };
      },
      tick(t, dt) {
        const snap = actors.snapshot(t);
        // ---- feet
        for (const it of snap.items) {
          let f = feet.get(it.id);
          if (!f) { f = { acc: 0, side: 1, last: 0, vx: 0, vz: 0, still: 0, px: it.x, pz: it.z, wet: new Uint8Array(puddles.length) }; feet.set(it.id, f); }
          const sp = it.speed;
          // puddle crossings: the body path since the last tick (a 0.4 m segment at a run) against each puddle; the
          // stride (~0.9 m) can jump a 1 m puddle, so a crossing with no footfall splash gets a forced one below
          const touched = [];
          for (let i = 0; i < puddles.length; i++) {
            const P = puddles[i], ex = it.x - f.px, ez = it.z - f.pz, l2 = ex * ex + ez * ez;
            const u = l2 > 1e-9 ? clamp(((P.pos.x - f.px) * ex + (P.pos.z - f.pz) * ez) / l2) : 1;
            const cx = f.px + ex * u, cz = f.pz + ez * u, d = Math.hypot(cx - P.pos.x, cz - P.pos.z);
            if (d < P.r * 1.1 + FOOT_REACH && sp > 1.0) { if (!f.wet[i]) f.wet[i] = 1; touched.push([i, cx, cz, d]); } else f.wet[i] = 0;
          }
          if (f.last > 2.5 && sp < 0.5) {                                 // instant stop: skid burst forward
            const l = Math.hypot(f.vx, f.vz) || 1, dx = f.vx / l, dz = f.vz / l;
            for (let k = 0; k < 3; k++) {
              const a = (k - 1) * 0.7, c = Math.cos(a), s = Math.sin(a);
              const ex = dx * c - dz * s, ez = dx * s + dz * c;
              const x = it.x + ex * 0.22, z = it.z + ez * 0.22;
              if (dustAt(x, z) && inPuddle(x, z) < 0) addDust({ t0: t, x, y: groundY(x, z), z, dx: ex, dz: ez, big: 2, k: 100 + k });
            }
            log({ k: 'skid', t: +t.toFixed(3) });
            f.acc = 0;
          } else if (f.last < 0.5 && sp > 2.5) {                          // start: kick-off puffs behind
            const dx = it.vx / sp, dz = it.vz / sp;
            for (let k = 0; k < 2; k++) {
              const x = it.x - dx * 0.25 + dz * (k ? 0.12 : -0.12), z = it.z - dz * 0.25 - dx * (k ? 0.12 : -0.12);
              if (dustAt(x, z) && inPuddle(x, z) < 0) addDust({ t0: t, x, y: groundY(x, z), z, dx: -dx, dz: -dz, big: 1, k: 200 + k });
            }
            log({ k: 'kick', t: +t.toFixed(3) });
          }
          if (sp > 1.0) {
            f.acc += sp * dt;
            const stride = clamp(sp * 0.155, 0.32, 0.95);
            while (f.acc >= stride) { f.acc -= stride; f.side = -f.side; footfall(t, it, f.side, f); }
            f.vx = it.vx; f.vz = it.vz;
          }
          for (const [i, cx, cz, d] of touched) {
            if (f.wet[i] !== 1) continue;
            // forced splash at the path's closest point to the puddle centre (pulled inside the water)
            const P = puddles[i], k = d > P.r * 0.75 ? (P.r * 0.75) / d : 1;
            addSplash(t, i, P.pos.x + (cx - P.pos.x) * k, P.pos.z + (cz - P.pos.z) * k, sp, f, true);
          }
          f.px = it.x; f.pz = it.z;
          f.last = sp;
        }
        // ---- cloth kicks (each piece tests the actors itself: a wave runs down a laundry line)
        for (const p of pieces) {
          if (!p.react) continue;
          const hit = snap.nearest(p.center.x, p.center.z, 4);
          if (!hit || hit.speed < 1.0) continue;
          const eff = hit.d - Math.max(0, hit.approach) * 0.25;           // a runner kicks it a little before he is there
          const reach = p.reach ?? 1.6;
          if (eff > reach) continue;
          const mag = clamp(hit.speed / 5.5, 0.25, 1) * clamp(1.15 - eff / reach, 0.35, 1);
          if (t - p.push.t0 < 0.45 && mag <= p.push.mag + 0.15) continue;
          // direction: away from the actor + along his motion, projected on the cloth normal
          const sp = hit.speed, mx = hit.item.vx / sp * 0.6 + hit.ax * 0.4, mz = hit.item.vz / sp * 0.6 + hit.az * 0.4;
          const nrm = p.n ?? UPV;
          const s = p.kind === 'sheet' ? 1 : Math.sign(mx * nrm.x + mz * nrm.z) || 1;
          const ml = Math.hypot(mx, mz) || 1;
          p.push = { t0: t, mag, sgn: s, su: p.aU ? (mx * p.aU.x + mz * p.aU.z) / ml : 0 };
          pushes++;
          if (!firstPush) firstPush = `${t.toFixed(2)}s@${hit.d.toFixed(2)}m/${hit.speed.toFixed(1)}mps`;
        }
        // ---- motes: stirred by a moving actor through the beam
        for (const m of motes) {
          if (t - m.push.t0 < 0.5) continue;
          const hit = snap.nearest(m.home.x, m.home.z, 1.2);
          if (!hit || hit.speed < 0.8 || hit.d > 0.95) continue;
          const sp = hit.speed, k = 0.35 + 0.45 * hash(m.i, gridIndex(t), seed);
          const dx = hit.item.vx / sp * 0.55 + hit.ax * 0.45, dz = hit.item.vz / sp * 0.55 + hit.az * 0.45;
          m.push = { t0: t, x: dx * k * clamp(sp / 4, 0.5, 1.2), y: 0.15 + 0.3 * hash(m.i, 7, seed), z: dz * k * clamp(sp / 4, 0.5, 1.2), sw: hash(m.i, 9, seed) < 0.5 ? -1 : 1 };
        }
      },
    });

    // ================================================================ DRAW
    let tod = ctx.tod;
    const camR = V3(), camU = V3();
    let lastKey = -1, nVisPuff = 0, nVisDust = 0, nVisRing = 0, nGustLines = 0, nMoteVis = 0;
    const tmpP = V3();
    const yawR = () => { const y = engine.camera.yaw ?? Math.PI / 4, pt = engine.camera.pitch ?? Math.PI / 6;
      camR.set(Math.cos(y), 0, -Math.sin(y)); camU.set(-Math.sin(y) * Math.sin(pt), Math.cos(pt), -Math.cos(y) * Math.sin(pt)); };   // screen right / up

    const SMOKE_MERGE = 0.45;    // u above which neighbouring puffs merge into one elongated lobe
    function drawSmoke(t) {
      // pixel puffs, oldest first (younger, lower puffs paint over the older ones above them). Travel on a 5 fps clock
      // (k = 3) per chimney; drawings change with it. Rises first, bends later (lean ~ a^2, saturating), a gust kinks
      // the column where the front passes; per-puff life / radius / wander break the string-of-pearls look. In the
      // UPPER column each even puff and the odd one under it merge into ONE elongated lobe at their midpoint (r3: the
      // column read as a chain of round cotton balls).
      const per = SMOKE_P / GRID_HZ, maxLife = SMOKE_LIFE;
      for (let c = 0; c < chimneys.length; c++) {
        const top = chimneys[c];
        const ts = clockTime(t, 3, c % 3);
        const puff = (j) => {
          const tb = j * per;
          const hj = hash(c, j, seed + 9);
          const lj = maxLife * (0.6 + 0.4 * hj);
          const a = ts - tb; if (a < 0 || a > lj) return null;
          const u = a / maxLife, uj = a / lj;
          const lvl = wind.levelAt(top.x, top.z, tb + Math.min(a, 1));
          const g = wind.gustAt(top.x, top.z, ts);
          const raw = (0.1 + 0.3 * lvl) * a * a / (1 + 0.3 * a) + 0.05 * a + 0.32 * g * Math.min(a, 1.2);
          const lean = SMOKE_LEAN_MAX * Math.tanh(raw / SMOKE_LEAN_MAX);
          const ph = TAU * hash(c, j, seed + 3);
          const wob = (0.025 + 0.06 * a) * Math.sin(ph + a * 1.7) + (hash(c, j, seed + 4) - 0.5) * 0.06;
          const rise = SMOKE_RISE * (0.88 + 0.24 * hash(c, j, seed + 5)) * a * (1 - 0.2 * u);
          const p = V3(top.x + wind.dir.x * lean + camR.x * wob, top.y + 0.1 + rise, top.z + wind.dir.z * lean + camR.z * wob);
          let rad = 2.5 + 6.5 * Math.sqrt(u) + (hash(c, j, seed + 7) < 0.3 ? -1 : 0);
          if (uj > 0.9) rad = Math.max(1, rad - 2);                     // last drawing: shrink + erode, no pop
          const fade = uj > 0.92 ? 3 : uj > 0.82 ? 2 : uj > 0.68 ? 1 : 0;
          return { p, u, rad, fade, v: hash(c, j, seed + 6) < 0.5 ? 0 : 1 };
        };
        const j0 = Math.floor((ts - maxLife) / per), j1 = Math.floor(ts / per + 1e-6);
        for (let j = j0; j <= j1; j++) {
          const P = puff(j);
          if (!P) continue;
          if (P.u > SMOKE_MERGE) {
            const odd = ((j % 2) + 2) % 2 === 1;
            if (odd) { const Q = puff(j - 1); if (Q && Q.u > SMOKE_MERGE) continue; }   // drawn inside j - 1's lobe
            else {
              const Q = puff(j + 1);
              if (Q && Q.u > SMOKE_MERGE) {
                fx.put(tmpP.copy(P.p).lerp(Q.p, 0.5), AT.smoke(Math.max(P.rad, Q.rad), Math.min(P.fade, Q.fade), 2), 0, 0);
                nVisPuff++;
                continue;
              }
            }
          }
          fx.put(P.p, AT.smoke(P.rad, P.fade, P.v), 0, 0);
          nVisPuff++;
        }
      }
    }
    // dust drawings per 2-tick frame: [radius (texels at vh 10), fade (rim erosion)]. A footfall lives 3 drawings
    // (0.4 s: a run leaves a short wake, not a row of stamps); the burst 5.
    const DUST_SEQ = [
      [[3, 0], [5, 1], [6, 2]],                                         // jog footfall
      [[4, 0], [6, 1], [7, 2]],                                         // run footfall (> 4 m/s)
      [[5, 0], [7, 0], [8, 1], [8, 2], [8, 3]],                         // skid / kick-off burst
    ];
    function drawDust(t) {
      const tg = gridTime(t);
      for (const d of dust) {
        const a = Math.round((tg - d.t0) * GRID_HZ);
        const seq = DUST_SEQ[d.big];
        const f = Math.floor(a / 2);                                     // drawings on a 7.5 fps clock
        if (a < 0 || f >= seq.length) continue;
        const ta = (f * 2) / GRID_HZ;
        // drifts back along the stride and downwind while it grows, and RISES ~1.5 texels per drawing
        const back = (d.big === 2 ? 0.38 : 0.2) * (1 - Math.exp(-ta * 6));
        tmpP.set(d.x + d.dx * back + wind.dir.x * 0.3 * ta, d.y + 0.02 + 0.06 * f, d.z + d.dz * back + wind.dir.z * 0.3 * ta);
        const [r, fade] = seq[f];
        const cell = AT.dust(r, fade, hash(d.k, 3, seed) < 0.5 ? 0 : 1);
        fx.put(tmpP, cell, Math.ceil(Math.round(r * AT.scale) * 0.62) + (f ? 1 : 0), 0.12);   // base on the ground, then lifts off
        nVisDust++;
      }
    }
    function drawSplash(t, bi) {
      const tg = gridTime(t);
      // (rings sit 3 cm over the water: the texel snap moves a ground drawing up to 1.2 cm in y, and a 1 cm lift let
      // the snapped ring sink under the snapped water: r3 rings vanished)
      // rings: only the NEWEST splash of each puddle draws rings (<= 2 visible per puddle), both CONCENTRIC on one
      // centre (pulled in so the biggest ring stays inside the water); ring B starts 2 ticks after ring A, so it is
      // always one radius step inside it; the last drawing of each ring is the broken (5-arc) version.
      const newest = new Map();
      for (const s of splash) { const a = Math.round((tg - s.t0) * GRID_HZ); if (a >= 0) newest.set(s.p, s); }
      for (const s of splash) {
        const a = Math.round((tg - s.t0) * GRID_HZ);
        const P = puddles[s.p];
        if (newest.get(s.p) === s && a >= 0) {
          const k = P.r / 0.5 * 0.9, lim = Math.max(0, P.r * 0.92 - RING_R[3] * k);
          const dx = s.x - P.pos.x, dz = s.z - P.pos.z, d = Math.hypot(dx, dz), kk = d > lim ? lim / d : 1;
          const cx = P.pos.x + dx * kk, cz = P.pos.z + dz * kk;
          const fA = Math.floor(a / 2), fB = Math.floor((a - 2) / 2);
          if (fA < 4) { puffs.set(bi.i++, tmpP.set(cx, P.pos.y + 0.032, cz), 0, (fA === 3 ? PZ.RING_BROKEN : PZ.RING) + fA, k); nVisRing++; }
          if (a >= 2 && fB < 3) { puffs.set(bi.i++, tmpP.set(cx, P.pos.y + 0.034, cz), 0, (fB === 2 ? PZ.RING_BROKEN : PZ.RING) + fB, k); nVisRing++; }
        }
        // droplets: ballistic on the 15 Hz travel clock, 6 per splash; 2x2 on the first 2 ticks (the crown), then 1 texel
        if (a >= 0 && a < 9) {
          const ta = a / GRID_HZ;
          for (let k = 0; k < 6; k++) {
            const ang = TAU * (k / 6 + hash(s.k, k, seed) * 0.15), vh = (0.5 + 0.6 * hash(s.k, k + 9, seed)) * s.s, vy = (1.7 + 1.0 * hash(s.k, k + 4, seed)) * s.s;
            const y = vy * ta - 4.9 * ta * ta;
            if (y < -0.005 && a > 1) continue;
            tmpP.set(s.x + Math.cos(ang) * vh * ta, P.pos.y + Math.max(0, y) + 0.02, s.z + Math.sin(ang) * vh * ta);
            fx.put(tmpP, a < 2 ? AT.drop2 : AT.px(PX.DROP), 0, 0.3);
          }
        }
      }
    }
    // gust spots: where the lines are drawn (scene: over dark grass and just UPWIND of the cloth, so the lines arrive
    // a tick or two before the flag snaps / the laundry swings); default = 4 seeded spots around the wind centre
    const gustSpots = (opts.wind?.spots ?? [0, 1, 2, 3].map((m) => wind.center.clone()
      .addScaledVector(V3(1, 0, -1).normalize(), (hash(m, 1, seed + 21) - 0.5) * 12).setY(0.8 + 1.4 * hash(m, 2, seed + 21))))
      .map((p) => p.clone());
    function drawGusts(t) {
      // per gust and spot: a GROUP of 2-3 parallel lines, 4 texels apart, staggered 5 texels and 1 tick, each born 1
      // tick before the front reaches its spot; 9 ticks of life: grows 3 -> 18 texels while the tail catches up,
      // travels 2 texels per tick, the head curls up 2 texels (fx gust drawing). ONE sprite per line.
      const n = gridIndex(t);
      const kNow = Math.floor((t - wind.first) / wind.every);
      for (let k = Math.max(0, kNow - 2); k <= kNow + 1; k++) {
        for (let m = 0; m < gustSpots.length; m++) {
          const S = gustSpots[m];
          const jx = (hash(k, m, seed + 22) - 0.5) * 0.8, jy = (hash(k, m, seed + 23) - 0.5) * 0.3;
          const sx = S.x + camR.x * jx, sz = S.z + camR.z * jx, y = S.y + jy;
          const lines = hash(k, m, seed + 24) < 0.5 ? 2 : 3;
          const born0 = Math.ceil(wind.arrival(k, sx, sz) * GRID_HZ - 1e-6) - 1;
          for (let i = 0; i < lines; i++) {
            const a = n - (born0 + i);
            if (a < 0 || a >= 9) continue;
            const head = 3 + Math.min(a, 5) * 2 + a * 2, tail = a < 4 ? 0 : (a - 3) * 3 + a * 2;
            const len = Math.min(AT.GUST_N - 2, head - tail);
            if (len < 2) continue;
            nGustLines++;
            tmpP.set(sx, y, sz).addScaledVector(camR, (tail + (AT.GUST_N - 1) / 2 + (i === 1 ? 5 : i === 2 ? -4 : 0)) * tw0);
            fx.put(tmpP, AT.gust(len), i === 1 ? -4 : i === 2 ? 4 : 0, 0);
          }
        }
      }
    }
    const GLOW_A = 0.17;
    function drawBeams() {
      // the shaft (3 hard bands, stepped alpha, eroded top) + the lit patch on the ground, both OVER the grass
      if (!glow) return;
      glow.begin();
      for (const b of beams) {
        if (!beamOn(b)) continue;
        tmpP.subVectors(b.top, b.pos);
        const dx = tmpP.dot(camR) * fx.tpm, dy = tmpP.dot(camU) * fx.tpm, w = 1.3 * b.r * fx.tpm;
        const S = 2 * Math.ceil((Math.max(Math.abs(dx) + w, dy) + 4) / 2);
        glow.put(tmpP.copy(b.pos).lerp(b.top, 0.5), 1, S, 1.2, GLOW_A * b.alpha, dx, dy, w);
        const rx = 1.05 * b.r * fx.tpm;
        glow.put(b.pos, 2, 2 * Math.ceil(rx + 2), 0.9, GLOW_A * b.alpha, 0, 0, rx);
      }
      glow.commit();
    }
    function drawMotes(t) {
      if (!motes.length) return;
      const tg = gridTime(t);
      for (const m of motes) {
        if (!beamOn(beams[m.b])) continue;
        // twinkle on a 3.75 fps clock; ~75 % lit, two brightness steps
        const blink = clockIndex(t, 4, m.i % 4);
        const h = hash(m.i, blink, seed + 31);
        if (h > 0.78) continue;
        const ts = clockTime(t, 3, m.i % 3), ph = hash(m.i, 1, seed) * TAU;
        tmpP.set(m.home.x + 0.12 * Math.sin(ts * 0.4 + ph), m.home.y + 0.1 * Math.sin(ts * 0.31 + ph * 1.7), m.home.z + 0.12 * Math.cos(ts * 0.35 + ph * 0.6));
        const age = tg - m.push.t0;
        if (age >= 0 && age < 4) {
          // stirred: out along the runner (fast, 15 fps), swirl, then sink back home over ~3 s (5 fps)
          const tq = age < 0.8 ? age : clockTime(t, 3, m.i % 3) - m.push.t0;
          const out = tq < 0.35 ? 1 - Math.pow(1 - tq / 0.35, 2) : Math.exp(-(tq - 0.35) / 1.1);
          const sw = 0.16 * out * m.push.sw;
          tmpP.x += m.push.x * out + Math.cos(tq * 7) * sw; tmpP.y += m.push.y * out + Math.sin(tq * 7) * Math.abs(sw);
          tmpP.z += m.push.z * out + Math.sin(tq * 7) * sw;
        }
        fx.put(tmpP, AT.px(h < 0.3 ? PX.MOTE : PX.MOTE_DIM), 0, 0);
        nMoteVis++;
      }
    }
    function drawGlints(t) {
      for (let i = 0; i < puddles.length; i++) {
        const P = puddles[i], b = clockIndex(t, 4, i);
        if (hash(i, b, seed + 41) > 0.55) continue;
        const a = hash(i, b, seed + 42) * TAU, d = Math.sqrt(hash(i, b, seed + 43)) * P.r * 0.7;
        fx.put(tmpP.set(P.pos.x + Math.cos(a) * d, P.pos.y + 0.012, P.pos.z + Math.sin(a) * d * 0.8), AT.px(PX.GLINT), 0, 0.05);
      }
    }
    const applyTod = () => { fx.setPalette(lightKey(tod)); glow?.setColor(lightKey(tod) === 'gold' ? '#FFD48A' : '#FFF2C4'); };
    applyTod();

    return {
      api: { wind, events, pieces, puddles },
      update(t) {
        ticker.advance(t);
        const key = gridIndex(t);
        if (key === lastKey) return;                                    // everything changes on grid ticks only
        lastKey = key;
        // cloth
        if (geo) {
          const cy = engine.camera.yaw ?? Math.PI / 4, cp = engine.camera.pitch ?? Math.PI / 6;
          toCam.set(cp * Math.sin(cy), Math.sin(cp), cp * Math.cos(cy));
          sunW.copy(engine.uniforms.uSunDir.value);
          for (const p of pieces) {
            if (p.kind === 'hang') hangPoints(p, t); else if (p.kind === 'flag') flagPoints(p, t); else sheetPoints(p, t);
            writePiece(p);
          }
          geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true; geo.attributes.aFold.needsUpdate = true;
        }
        // ground drawings (pose batch) + pixel FX (one point batch, painted in this order: smoke, dust, glints,
        // droplets, motes, gust lines on top)
        nVisPuff = nVisDust = nVisRing = nGustLines = nMoteVis = 0;
        yawR();
        const bi = { i: 0 };
        puddles.forEach((P) => puffs.set(bi.i++, P.pos, P.yaw, PZ.PUDDLE, P.r));
        fx.begin();
        drawSmoke(t); drawDust(t); drawGlints(t);
        drawSplash(t, bi);
        for (let i = bi.i; i < puffs.max; i++) puffs.hide(i);
        puffs.commit();
        drawMotes(t); drawGusts(t);
        fx.commit();
        drawBeams();
      },
      setTimeOfDay(info) {
        tod = info; applyTod(); lastKey = -1;
        const k = lightKey(info);
        if (k !== puffKey) { puffs.dispose(); puffKey = k; puffs = makePuffs(k); }
      },
      stats() {
        return {
          pieces: pieces.length, clothVerts: nCloth, rigVerts: nRig, chimneys: chimneys.length, puddles: puddles.length, motes: motes.length,
          puffsVisible: nVisPuff, dustVisible: nVisDust, ringsVisible: nVisRing, gustLines: nGustLines, motesVisible: nMoteVis,
          sprites: fx.visible, instances: puffs.visible, pushes, firstPush, steps,
          splashes: events.filter((e) => e.k === 'splash').length, skids: events.filter((e) => e.k === 'skid').length,
          wind: +wind.levelAt(wind.center.x, wind.center.z, gridTime(lastKey / GRID_HZ)).toFixed(2),
          calls: (geo ? 3 : 0) + 2 + 2 + (glow ? 1 : 0), beams: glow?.visible ?? 0, lights: 0, resets: ticker.resets, tod: tod?.name,
        };
      },
      debug() { return { events: events.slice(), pieces: pieces.map((p) => ({ kind: p.kind, push: p.push })) }; },
      dispose() {
        if (clothMesh) { clothMesh.removeFromParent(); geo.dispose(); clothMesh.material.dispose(); }
        puffs.dispose(); fx.dispose(); glow?.dispose();
      },
    };
  },
});
