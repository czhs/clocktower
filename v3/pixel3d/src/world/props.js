// Shrine architecture kit (owner: props). Ruined stone pillars, octagonal stepped basin with a goblet
// fountain and a water slot, ruined walls, steps, paving, stone lanterns, slabs, debris, fallen arch.
//
// Every prop is a THREE.Group holding ONE merged, flat-shaded mesh per material (few draw calls), built
// from convex stone blocks: boxes / prisms / frusta whose corners and edges are chipped by plane clipping.
// All faces are 45°-aligned (k·45° yaws, 45° chamfers), so at a 45°-yaw camera every edge rasterises as a
// clean horizontal / 2:1 / vertical pixel line. Offsets are quantized to 1/32 m (~1 texel at
// viewHeight 10), so each protruding ledge produces exactly the cream-rim-on-top / dark-line-below pair.
//
// Public API (docs/PIPELINE.md; signatures stable, all options optional):
//   createPillar(engine, {height, seed, broken, toppled, width, position, yaw, terrain, plinth, cap, debris})
//   createShrine(engine, {radius, seed, position, terrain, fountain, water, cracks, ...})  (= createOctagonBasin)
//     group.userData.water = {level, floorY, center, apothem, polygon:[[x,z]..], shape:{kind:'polygon',points},
//       bounds:{x0,z0,x1,z1}}  -> createWater(engine, terrain, {level, shape, bounds}) fills the basin.
//     The terrain must be carved below floorY inside the inner octagon (terrain basins:[{x,z,rx:2.5,depth:0.7}]).
//   createWall(engine, {length, height, thickness, seed, ruin, position, yaw, terrain, rubble})
//   createSteps(engine, {width, count, rise, run, seed, position, yaw, terrain, cheeks})  (ascend toward local -Z)
//   createPaving(engine, terrain, {center, radius, seed, stone, gap, density, falloff, thickness, yaw, kind})
//   createLantern(engine, {height, seed, position, yaw, terrain, lit, flicker, light})
//   createSlab(engine, {seed, position, yaw, terrain, w, h, d, side 0.8})  (side = albedo of the steep faces)
//   createDebris / createFallenArch(engine, {from, to, blocks, seed, size, sweep 0.8, side, sideTone}) / createGoblet
//   createPillar: `cap` true/false forces the capital; left undefined the seed decides (~40 % get one).
//   createShrine: three clean octagonal bands (footing, plinth, wall + coping), 1 stone per side (coping 1–2),
//     straight joints perpendicular to the faces, level tops; `cracks` displaced coping stones never on the
//     three faces fronting engine.camera.yaw. wallTop default 0.6.
//   stoneMaterial(engine, {tones, patches}), STONE (sRGB tone hexes)
// Positions: `position` is the footprint centre on the ground; with `terrain` the prop is dropped onto
// terrain.heightAt (minimum under the footprint, so nothing floats).
// Masks: every prop group has userData.covers(x, z, margin = 0) -> bool (world xz footprint: plinths,
// octagon, wall/steps/slab rects, every paving stone / debris cube / arch stone). Use it to keep grass,
// flowers and scatter off the stone: createGrass(engine, terrain, {mask: (x, z) => !props.some(p => p.userData.covers(x, z, 0.04))}).
// Pillar yaw: 0 (default) = world-axis aligned, a corner faces the 45° camera (two faces visible, like the
// refs); π/4 = one face square-on. Lantern / wall / steps default yaw π/4 (front face square-on).
import * as THREE from 'three';
import { rng, noise2 } from '../core/noise.js';
import { toonMaterial, rampFromTones } from '../materials/toon.js';

/** Stone ramp measured from t3ssel8r's Ruined Shrine (sRGB). */
export const STONE = { hi: '#BBAC97', mid: '#8C7E72', sh: '#5B5A64' };

const Q = 1 / 32;                                   // ~1 texel at viewHeight 10
const q = (v) => Math.round(v / Q) * Q;
const D45 = Math.PI / 4;
const EPS = 1e-7;

// ---------------------------------------------------------------------------------------------------
// Convex polyhedra as face lists (arrays of THREE.Vector3). Orientation is fixed at emit time.
// ---------------------------------------------------------------------------------------------------

/** Frustum between two regular-ish polygons given in XZ (same vertex count), from y0 to y1. */
function frustumFaces(bot, top, y0, y1) {
  const n = bot.length, faces = [];
  const B = bot.map(([x, z]) => new THREE.Vector3(x, y0, z));
  const T = top.map(([x, z]) => new THREE.Vector3(x, y1, z));
  faces.push(B.slice(), T.slice());
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([B[i].clone(), B[j].clone(), T[j].clone(), T[i].clone()]);
  }
  return faces;
}
const prismFaces = (pts, y0, y1) => frustumFaces(pts, pts, y0, y1);
const rectPts = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
/** Regular n-gon with across-flats half-width `a`; face normals at k·(2π/n) (k·45° for n = 8). */
function ngonPts(a, n = 8, cx = 0, cz = 0) {
  const R = a / Math.cos(Math.PI / n), pts = [];
  for (let k = 0; k < n; k++) { const t = Math.PI / n + k * 2 * Math.PI / n; pts.push([cx + R * Math.cos(t), cz + R * Math.sin(t)]); }
  return pts;
}

/** Keep the half-space n·p <= c. Returns new face list (cap added when something was cut). */
function clip(faces, n, c) {
  const out = [], cap = [];
  let cut = false;
  for (const f of faces) {
    const res = [];
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const da = n.dot(a) - c, db = n.dot(b) - c;
      if (da > 1e-6) cut = true;
      if (da <= 1e-6) res.push(a);
      if (Math.abs(da) <= 1e-6) cap.push(a);
      if ((da < -1e-6 && db > 1e-6) || (da > 1e-6 && db < -1e-6)) {
        const p = a.clone().lerp(b, da / (da - db));
        res.push(p); cap.push(p);
      }
    }
    const clean = dedupe(res);
    if (clean.length >= 3) out.push(clean);
  }
  if (cut) {
    const pts = dedupe(cap, true);
    if (pts.length >= 3) {
      const cen = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
      const nn = n.clone().normalize();
      const u = Math.abs(nn.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(nn).normalize() : new THREE.Vector3(1, 0, 0).cross(nn).normalize();
      const v = nn.clone().cross(u);
      pts.sort((p1, p2) => {
        const a1 = Math.atan2(p1.clone().sub(cen).dot(v), p1.clone().sub(cen).dot(u));
        const a2 = Math.atan2(p2.clone().sub(cen).dot(v), p2.clone().sub(cen).dot(u));
        return a1 - a2;
      });
      out.push(pts);
    }
  }
  return out;
}
function dedupe(pts, global = false) {
  const out = [];
  for (const p of pts) {
    if (global ? out.some((o) => o.distanceToSquared(p) < 1e-10) : (out.length && out[out.length - 1].distanceToSquared(p) < 1e-10)) continue;
    out.push(p);
  }
  if (!global && out.length > 1 && out[0].distanceToSquared(out[out.length - 1]) < 1e-10) out.pop();
  return out;
}

// Chips -------------------------------------------------------------------------------------------
// Block local frame: x ∈ [-w/2, w/2], y ∈ [0, h], z ∈ [-d/2, d/2].
function applyChip(faces, ch, w, h, d) {
  const { kind, sx, sy, sz, s, s2 = s, s3 = s } = ch;
  const P = new THREE.Vector3(sx * w / 2, sy > 0 ? h : 0, sz * d / 2);
  let n;
  if (kind === 'corner') n = new THREE.Vector3(sx / s, sy / s2, sz / s3);
  else if (kind === 'vert') n = new THREE.Vector3(sx / s, 0, sz / s);
  else if (kind === 'edgeX') n = new THREE.Vector3(0, sy / s, sz / s);      // horizontal edge along x
  else if (kind === 'edgeZ') n = new THREE.Vector3(sx / s, sy / s, 0);      // horizontal edge along z
  else if (kind === 'break') {                                              // slanted fracture of the top
    n = new THREE.Vector3(sx * Math.sin(s2), Math.cos(s2), sz * Math.sin(s2) * s3).normalize();
    return clip(faces, n, n.dot(new THREE.Vector3(0, h - s, 0)));
  }
  return clip(faces, n, n.dot(P) - 1);
}

/** Random chip list. Facets stay >= ~3 px (0.07 m) and <= 30% of the block. */
function randomChips(r, w, h, d, { count = 1, topBias = 0.75, scale = 1 } = {}) {
  const out = [], m = Math.min(w, h, d);
  for (let i = 0; i < count; i++) {
    const sx = r() < 0.5 ? -1 : 1, sz = r() < 0.5 ? -1 : 1, sy = r() < topBias ? 1 : -1;
    const k = r();
    const S = (lo, hi) => Math.min(m * 0.32, (lo + r() * (hi - lo)) * scale);
    if (k < 0.45) out.push({ kind: 'corner', sx, sy, sz, s: S(0.07, 0.17), s2: S(0.06, 0.14), s3: S(0.07, 0.17) });
    else if (k < 0.7) out.push({ kind: 'vert', sx, sy, sz, s: S(0.06, 0.12) });
    else if (k < 0.85) out.push({ kind: 'edgeX', sx, sy, sz, s: S(0.05, 0.08) });
    else out.push({ kind: 'edgeZ', sx, sy, sz, s: S(0.05, 0.08) });
  }
  return out;
}

function boxBlock(w, h, d, chips = []) {
  let f = prismFaces(rectPts(w, d), 0, h);
  for (const c of chips) f = applyChip(f, c, w, h, d);
  return f;
}

// ---------------------------------------------------------------------------------------------------
// Builder: accumulates transformed faces into one non-indexed, flat-normal geometry with a tint colour.
// ---------------------------------------------------------------------------------------------------
class Builder {
  constructor() { this.pos = []; this.nrm = []; this.col = []; }
  /**
   * faces in local space, `m` Matrix4 (or null), tint [r,g,b] linear multiplier of the stone mid tone.
   * side: extra albedo multiplier for steep faces (|n.y| < 0.5), so thin blocks keep a top / front contrast.
   */
  add(faces, m = null, tint = [1, 1, 1], { side = 1 } = {}) {
    const F = faces.map((f) => f.map((p) => (m ? p.clone().applyMatrix4(m) : p.clone())));
    const cen = new THREE.Vector3(); let cnt = 0;
    for (const f of F) for (const p of f) { cen.add(p); cnt++; }
    cen.multiplyScalar(1 / Math.max(cnt, 1));
    for (let f of F) {
      const nrm = new THREE.Vector3();
      for (let i = 0; i < f.length; i++) {             // Newell normal
        const a = f[i], b = f[(i + 1) % f.length];
        nrm.x += (a.y - b.y) * (a.z + b.z); nrm.y += (a.z - b.z) * (a.x + b.x); nrm.z += (a.x - b.x) * (a.y + b.y);
      }
      if (nrm.lengthSq() < 1e-12) continue;
      const fc = f.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / f.length);
      if (nrm.dot(fc.sub(cen)) < 0) { f = f.slice().reverse(); nrm.negate(); }
      nrm.normalize();
      const k = side !== 1 && Math.abs(nrm.y) < 0.5 ? side : 1;
      for (let i = 1; i < f.length - 1; i++) {
        for (const p of [f[0], f[i], f[i + 1]]) {
          this.pos.push(p.x, p.y, p.z); this.nrm.push(nrm.x, nrm.y, nrm.z); this.col.push(tint[0] * k, tint[1] * k, tint[2] * k);
        }
      }
    }
    return this;
  }
  get empty() { return this.pos.length === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** Matrix: translate(x,y,z) · rotY(yaw) · rotations about a pivot (tilts in radians about local x / z). */
function M(x = 0, y = 0, z = 0, yaw = 0, tiltX = 0, tiltZ = 0, pivot = null) {
  const m = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(yaw));
  if (tiltX || tiltZ) {
    const pv = pivot || new THREE.Vector3();
    m.multiply(new THREE.Matrix4().makeTranslation(pv.x, pv.y, pv.z))
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tiltX, 0, tiltZ)))
      .multiply(new THREE.Matrix4().makeTranslation(-pv.x, -pv.y, -pv.z));
  }
  return m;
}

/** Per-block albedo tint: ±6% value, slight warm/cool drift (keeps the 3-tone ramp intact). */
function tintFor(r, base = 1, spread = 1) {
  const v = base * (1 + (r() * 2 - 1) * 0.06 * spread), h = (r() * 2 - 1) * 0.025 * spread;
  return [v * (1 + h), v, v * (1 - h)];
}

// ---------------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------------
const MATS = new WeakMap();
/**
 * Shared flat-shaded stone toon material (cached per engine + options).
 * patches: 0..1 strength of world-space pale weathering blotches (hard-edged, 2 levels).
 */
export function stoneMaterial(engine, { tones = STONE, patches = 0.5, outline = 'full' } = {}) {
  let cache = MATS.get(engine);
  if (!cache) { cache = new Map(); MATS.set(engine, cache); }
  const key = JSON.stringify([tones, patches, outline]);
  if (cache.has(key)) return cache.get(key);
  const { color, ramp } = rampFromTones(tones.hi, tones.mid, tones.sh);
  const mat = toonMaterial(engine, {
    color, ramp, vertexColors: true, flatShading: true, outline,
    uniforms: { uStonePatch: { value: patches } },
    fragmentHead: 'uniform float uStonePatch;',
    albedo: patches > 0 ? /* glsl */`
      {
        // weathering blotches: world-space, so they are pixel-stable; hard 2-level threshold
        vec3 sp = floor(vToonWorld * 32.0 + 0.5) / 32.0;               // 1/32 m cells (~1 texel)
        vec2 pq = vec2(sp.x + sp.y * 0.61, sp.z - sp.y * 0.47) * 1.7;
        float pn = fbm(pq + 3.1);
        float pm = step(0.58, pn) + step(0.68, pn) * 0.7;
        diffuseColor.rgb *= 1.0 + 0.12 * pm * uStonePatch;
        float dk = step(fbm(pq * 2.3 + 11.7), 0.24);                    // a few darker stains
        diffuseColor.rgb *= 1.0 - 0.07 * dk * uStonePatch;
      }` : '',
  });
  cache.set(key, mat);
  return mat;
}

function finish(engine, group, builder, matOpts = {}, { castShadow = true, receiveShadow = true, name } = {}) {
  if (builder.empty) return null;
  const mesh = new THREE.Mesh(builder.geometry(), matOpts.isMaterial ? matOpts : stoneMaterial(engine, matOpts));
  mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

/** Place a group on the terrain: y = min height under a footprint of half-size `ext` (minus sink). */
function placeGroup(group, { position, yaw = 0, terrain = null, ext = 0.6, sink = 0.02, foot = null } = {}) {
  const p = position ? new THREE.Vector3(position.x ?? 0, position.y ?? 0, position.z ?? 0) : new THREE.Vector3();
  if (terrain && terrain.heightAt) {
    let h = Infinity;
    for (const [dx, dz] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [0, 1], [1, 0], [0, -1], [-1, 0]])
      h = Math.min(h, terrain.heightAt(p.x + dx * ext, p.z + dz * ext));
    p.y = h - sink + (position?.y ?? 0);
  }
  group.position.copy(p);
  group.rotation.y = yaw;
  if (foot) setCovers(group, foot);
  return group;
}

/**
 * Footprint for grass / flower / scatter masks: group.userData.covers(x, z, margin = 0) -> bool (world xz).
 * foot = [{cx, cz, hw, hd, yaw?} rects | {cx, cz, r} circles | {oct: apothem}] in the group's local frame.
 */
function setCovers(group, foot) {
  const p = group.position.clone(), c = Math.cos(group.rotation.y), s = Math.sin(group.rotation.y);
  const items = foot.map((f) => ({ cx: 0, cz: 0, yaw: 0, ...f, c: Math.cos(f.yaw ?? 0), s: Math.sin(f.yaw ?? 0) }));
  group.userData.footprint = items;
  group.userData.covers = (x, z, m = 0) => {
    const dx = x - p.x, dz = z - p.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;                 // world -> group local
    for (const f of items) {
      const ux = lx - f.cx, uz = lz - f.cz;
      if (f.oct !== undefined) {
        let d = 0;
        for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(ux * Math.cos(k * D45) + uz * Math.sin(k * D45)));
        if (d <= f.oct + m) return true;
      } else if (f.r !== undefined) {
        if (ux * ux + uz * uz <= (f.r + m) * (f.r + m)) return true;
      } else {
        const ax = ux * f.c - uz * f.s, az = ux * f.s + uz * f.c;
        if (Math.abs(ax) <= f.hw + m && Math.abs(az) <= f.hd + m) return true;
      }
    }
    return false;
  };
}

// ---------------------------------------------------------------------------------------------------
// Pillar
// ---------------------------------------------------------------------------------------------------
/**
 * Stacked-block ruin pillar. Default yaw 0 = world-axis aligned (a corner faces a 45° camera, so two
 * faces show: lit front-left, shaded right). yaw = π/4 shows one face square-on.
 */
export function createPillar(engine, opts = {}) {
  const {
    seed = 1, broken = false, toppled = false, width = 0.68, position, yaw = 0, terrain = null,
    plinth = true, debris = true, material,
  } = opts;
  const r = rng(seed * 7919 + 101);
  const height = opts.height ?? (broken ? 0.6 + r() * 0.8 : 2.3 + r() * 1.1);
  const B = new Builder();
  const group = new THREE.Group();
  group.name = `pillar-${seed}`;
  let y = 0;
  const foot = [{ hw: width / 2 + 0.12, hd: width / 2 + 0.12 }];

  // plinth: wide footing + step (sometimes a third thin tier)
  if (plinth) {
    const pw = q(width + 0.4 + r() * 0.14), pd = q(pw + (r() * 2 - 1) * 0.06), ph = q(0.26 + r() * 0.06), sink = 0.08;
    foot[0] = { hw: pw / 2, hd: pd / 2 };
    B.add(boxBlock(pw, ph, pd, randomChips(r, pw, ph, pd, { count: 2 + Math.floor(r() * 2), topBias: 0.9 })),
      M(q((r() * 2 - 1) * 0.03), -sink, q((r() * 2 - 1) * 0.03)), tintFor(r, 0.96));
    y = ph - sink;
    const sw = q(width + 0.2 + r() * 0.08), sd = q(sw + (r() * 2 - 1) * 0.06), sh = q(0.14 + r() * 0.05);
    B.add(boxBlock(sw, sh, sd, randomChips(r, sw, sh, sd, { count: 1 + Math.floor(r() * 2) })), M(q((r() * 2 - 1) * 0.04), y, q((r() * 2 - 1) * 0.04)), tintFor(r));
    y += sh;
    if (r() < 0.35 && !broken) {
      const tw = q(width + 0.1 + r() * 0.04), th = q(0.09);
      B.add(boxBlock(tw, th, tw), M(0, y, 0), tintFor(r));
      y += th;
    }
  }

  // cap: explicit true/false, or (default) decided by the seed, so a ring of pillars is not all top-heavy
  const cap = opts.cap ?? (r() < 0.4);
  const capV = q(0.26 + r() * 0.08);
  const capH = broken || toppled || !cap ? 0 : capV;
  const shaftTop = toppled ? y + q(0.35 + r() * 0.4) : Math.max(y + 0.25, height - capH);
  const y0 = y;
  let prevSlab = true, idx = 0, prevJog = false;
  const blocks = [];
  // irregular stack: tall drums of ±20 % width / depth (independently, so the two visible faces differ),
  // occasional ±0.12 m jogs, few thin wide slabs (each ledge draws a full-width rim: too many and a
  // square-on face reads as a slatted radiator), and a slight taper toward the top.
  while (y < shaftTop - 0.06) {
    let h = q(0.2 + r() * 0.26);
    let kind = r();
    if (prevSlab && kind < 0.25) kind = 0.5;
    const isSlab = kind < 0.14;
    if (isSlab) h = q(0.11 + r() * 0.07);
    if (shaftTop - (y + h) < 0.18) h = Math.max(q(shaftTop - y), 0.12);
    const taper = 1 - 0.1 * THREE.MathUtils.clamp((y - y0) / Math.max(shaftTop - y0, 0.5), 0, 1);
    const w = isSlab ? q(width * (1.1 + r() * 0.14)) : q(width * taper * (0.82 + r() * 0.36));
    const d = isSlab ? q(w * (0.92 + r() * 0.1)) : q(width * taper * (0.82 + r() * 0.36));
    const jog = !isSlab && !prevJog && r() < 0.4;
    const amp = isSlab ? 0.025 : jog ? 0.12 : 0.04;
    let ox = q((r() * 2 - 1) * amp), oz = q((r() * 2 - 1) * amp);
    if (jog && Math.max(Math.abs(ox), Math.abs(oz)) < 0.07) { if (r() < 0.5) ox = q(Math.sign(ox || 1) * (0.08 + r() * 0.04)); else oz = q(Math.sign(oz || 1) * (0.08 + r() * 0.04)); }
    // keep the stone over its support (at most 1/4 of its width overhangs)
    ox = THREE.MathUtils.clamp(ox, -w * 0.22, w * 0.22); oz = THREE.MathUtils.clamp(oz, -d * 0.22, d * 0.22);
    blocks.push({ y, h, w, d, ox: q(ox), oz: q(oz), kind, isSlab, i: idx++ });
    y += h; prevSlab = isSlab; prevJog = jog;
  }

  const last = blocks.length - 1;
  for (const b of blocks) {
    const tint = tintFor(r);
    const top = b.i === last;
    // face plates: thin proud panels on a random side (the small carved rectangles of the refs)
    if (!b.isSlab && !(top && broken) && r() < 0.4) {
      const side = Math.floor(r() * 4), alongX = side < 2, sg = side % 2 ? 1 : -1;
      const L = alongX ? b.w : b.d, pl = q(L * (0.3 + r() * 0.35)), ph = q(Math.max(0.07, b.h * (0.3 + r() * 0.35)));
      const po = q((r() * 2 - 1) * (L - pl) * 0.4), py = b.y + q((b.h - ph) * (0.2 + r() * 0.6));
      const t = 2 * Q, n = (alongX ? b.d : b.w) / 2 + t / 2 - Q;
      B.add(boxBlock(alongX ? pl : t, ph, alongX ? t : pl), M(b.ox + (alongX ? po : sg * n), py, b.oz + (alongX ? sg * n : po)), tintFor(r, 1.04));
    }
    if (top && broken) {
      // top block: fractured (slanted break plane) and tilted 6–14° about a bottom edge
      const ang = THREE.MathUtils.degToRad(6 + r() * 8) * (r() < 0.5 ? -1 : 1);
      const alongX = r() < 0.5;
      const pivot = new THREE.Vector3(alongX ? 0 : Math.sign(ang) * b.w / 2, 0, alongX ? -Math.sign(ang) * b.d / 2 : 0);
      const brk = { kind: 'break', sx: r() < 0.5 ? -1 : 1, sz: r() < 0.5 ? -1 : 1, s: b.h * (0.25 + r() * 0.2), s2: THREE.MathUtils.degToRad(14 + r() * 14), s3: r() * 0.6 };
      const hh = b.h + 0.08;
      const faces = boxBlock(b.w, hh, b.d, [brk, ...randomChips(r, b.w, hh, b.d, { count: 2 })]);
      B.add(faces, M(b.ox, b.y, b.oz, 0, alongX ? ang : 0, alongX ? 0 : ang, pivot), tint);
      continue;
    }
    if (b.isSlab) {
      B.add(boxBlock(b.w, b.h, b.d, randomChips(r, b.w, b.h, b.d, { count: 1 + Math.floor(r() * 3), topBias: 0.85 })), M(b.ox, b.y, b.oz), tint);
    } else if (b.kind < 0.40 && b.h > 0.22) {
      // notched: lower course + 2–3 smaller boxes leaving a missing corner / side
      const h1 = q(b.h * (0.35 + r() * 0.2)), h2 = b.h - h1;
      B.add(boxBlock(b.w, h1, b.d, randomChips(r, b.w, h1, b.d, { count: 1, topBias: 0.2 })), M(b.ox, b.y, b.oz), tint);
      const sx = r() < 0.5 ? -1 : 1, sz = r() < 0.5 ? -1 : 1;
      const cw = q(b.w * (0.45 + r() * 0.15)), cd = q(b.d * (0.45 + r() * 0.15));
      // piece A: full depth on the far x side; piece B: the remaining strip minus the notch corner
      const aw = b.w - cw;
      B.add(boxBlock(aw, h2, b.d, randomChips(r, aw, h2, b.d, { count: 1 })), M(b.ox - sx * (b.w / 2 - aw / 2), b.y + h1, b.oz), tintFor(r));
      const bd = b.d - cd;
      if (r() < 0.75) B.add(boxBlock(cw, h2 * (r() < 0.5 ? 1 : 0.6), bd), M(b.ox + sx * (b.w / 2 - cw / 2), b.y + h1, b.oz - sz * (b.d / 2 - bd / 2)), tintFor(r));
      // a small recessed filler in the notch so it reads as a broken, not missing, stone
      if (r() < 0.6) {
        const fw = q(cw * 0.6), fd = q(cd * 0.6), fh = q(h2 * 0.45);
        B.add(boxBlock(fw, fh, fd, randomChips(r, fw, fh, fd, { count: 1 })), M(b.ox + sx * (b.w / 2 - cw / 2 - Q * 2), b.y + h1, b.oz + sz * (b.d / 2 - cd / 2 - Q * 2)), tintFor(r, 0.95));
      }
    } else if (b.kind < 0.50 && b.h > 0.3) {
      // seamed: two stones with a recessed mortar course between them (horizontal groove line)
      const g = q(0.06), h1 = q((b.h - g) * (0.4 + r() * 0.2)), h2 = b.h - g - h1;
      B.add(boxBlock(b.w, h1, b.d, randomChips(r, b.w, h1, b.d, { count: 1 })), M(b.ox, b.y, b.oz), tint);
      B.add(boxBlock(b.w - 0.1, g, b.d - 0.1), M(b.ox, b.y + h1, b.oz), tintFor(r, 0.9));
      const o2x = q(b.ox + (r() * 2 - 1) * 0.04), o2z = q(b.oz + (r() * 2 - 1) * 0.04);
      B.add(boxBlock(b.w, h2, b.d, randomChips(r, b.w, h2, b.d, { count: 1 + Math.floor(r() * 2) })), M(o2x, b.y + h1 + g, o2z), tintFor(r));
    } else if (b.kind < 0.82) {
      // split course: two stones side by side (vertical joint), slightly different depth / height
      const alongX = r() < 0.5, f = 0.35 + r() * 0.3;
      const L = alongX ? b.w : b.d, l1 = q(L * f) - Q / 2, l2 = L - l1 - Q;
      const dh = q((r() * 2 - 1) * 0.04), push = q((r() * 2 - 1) * 0.04);
      for (const [l, sgn, hh, pp] of [[l1, -1, b.h, 0], [l2, 1, b.h + dh, push]]) {
        const w = alongX ? l : b.w, d = alongX ? b.d : l;
        const off = sgn * (L / 2 - l / 2);
        B.add(boxBlock(w, hh, d, randomChips(r, w, hh, d, { count: 1 })),
          M(b.ox + (alongX ? off : pp), b.y, b.oz + (alongX ? pp : off)), tintFor(r));
      }
    } else {
      B.add(boxBlock(b.w, b.h, b.d, randomChips(r, b.w, b.h, b.d, { count: 1 + Math.floor(r() * 2) })), M(b.ox, b.y, b.oz), tint);
    }
  }

  // cap: under-slab + wide capital (+ sometimes a small crowning block)
  if (capH > 0) {
    const uw = q(width + 0.08 + r() * 0.05), uh = q(0.08 + r() * 0.04);
    B.add(boxBlock(uw, uh, uw, randomChips(r, uw, uh, uw, { count: 1 })), M(q((r() * 2 - 1) * 0.04), y, q((r() * 2 - 1) * 0.04)), tintFor(r));
    y += uh;
    const cw = q(width * (1.1 + r() * 0.16)), cd = q(cw * (0.9 + r() * 0.12)), ch = q(capH - uh + 0.04);
    B.add(boxBlock(cw, ch, cd, randomChips(r, cw, ch, cd, { count: 2 + Math.floor(r() * 2), topBias: 0.9, scale: 1.2 })), M(q((r() * 2 - 1) * 0.05), y, q((r() * 2 - 1) * 0.05)), tintFor(r, 1.03));
    y += ch;
    if (r() < 0.4) {
      const tw = q(width * (0.5 + r() * 0.3)), th = q(0.1 + r() * 0.06);
      B.add(boxBlock(tw, th, tw, randomChips(r, tw, th, tw, { count: 1 })), M(q((r() * 2 - 1) * 0.15), y, q((r() * 2 - 1) * 0.15)), tintFor(r));
      y += th;
    }
  }

  // toppled: the shaft lies on the ground next to the stump as a broken row of drums
  if (toppled) {
    const dir = (Math.floor(r() * 8)) * D45;
    const n = 3 + Math.floor(r() * 3);
    let s = 0.9 + r() * 0.3;
    const s0 = s;
    for (let i = 0; i < n; i++) {
      const L = q(0.3 + r() * 0.25), w = q(width * (0.88 + r() * 0.12));
      const tilt = THREE.MathUtils.degToRad((r() * 2 - 1) * 5);
      const faces = boxBlock(w, L, w, randomChips(r, w, L, w, { count: 2, topBias: 0.5 }));
      // block stands on y in its frame; lay it down along `dir`: rotate -90° about local x (y -> -z)
      const m = new THREE.Matrix4().makeTranslation(Math.sin(dir) * s, w / 2 - 0.1 + r() * 0.04, Math.cos(dir) * s)
        .multiply(new THREE.Matrix4().makeRotationY(dir + tilt))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 + THREE.MathUtils.degToRad((r() * 2 - 1) * 4)))
        .multiply(new THREE.Matrix4().makeTranslation(0, 0, -w / 2 + w / 2));
      B.add(faces, m, tintFor(r));
      s += L + q(0.03 + r() * 0.12);
    }
    foot.push({ cx: Math.sin(dir) * (s0 + s) / 2, cz: Math.cos(dir) * (s0 + s) / 2, hw: width / 2, hd: (s - s0) / 2, yaw: dir });
  }

  // rubble at the foot
  if (debris) {
    const n = (broken || toppled ? 3 : 1) + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rr = width + 0.15 + r() * 0.45, s = q(0.08 + r() * (broken ? 0.18 : 0.12));
      const sy = q(s * (0.6 + r() * 0.5));
      B.add(boxBlock(s, sy, s * (0.8 + r() * 0.4), randomChips(r, s, sy, s, { count: 1 })),
        M(Math.cos(a) * rr, -sy * (0.3 + r() * 0.2), Math.sin(a) * rr, Math.floor(r() * 8) * D45), tintFor(r, 0.97));
    }
  }

  finish(engine, group, B, material ?? {});
  group.userData = { height: y, radius: 0.75, kind: 'pillar' };
  return placeGroup(group, { position, yaw, terrain, ext: 0.6, foot });
}

// ---------------------------------------------------------------------------------------------------
// Goblet fountain
// ---------------------------------------------------------------------------------------------------
/** Octagonal goblet: base 1.2 across, stem 0.35, collar, bowl frustum 0.6→1.3, hollow rim. y0 = base bottom. */
export function createGoblet(engine, { seed = 3, y0 = -0.3, top = 1.55, position, yaw = 0, terrain = null, scale = 1, builder = null } = {}) {
  const r = rng(seed * 131 + 7);
  const B = builder ?? new Builder();
  const s = scale;
  const yb = 0.45 * s, ys = 0.7 * s, yw = 0.4 * s;
  const y1 = top - yw - ys;                                 // top of the base
  const T = (base = 1) => tintFor(r, base, 0.6);
  // base: a wide low footing + the octagonal block with a chamfered top edge (frustum)
  B.add(prismFaces(ngonPts(0.62 * s), y0, y1 - 0.12 * s), null, T(0.97));
  B.add(frustumFaces(ngonPts(0.6 * s), ngonPts(0.48 * s), y1 - 0.12 * s, y1), null, T());
  B.add(prismFaces(ngonPts(0.28 * s), y1, y1 + 0.08 * s), null, T());
  // stem with a collar ring
  B.add(prismFaces(ngonPts(0.175 * s), y1, top - yw), null, T(0.96));
  B.add(prismFaces(ngonPts(0.235 * s), top - yw - 0.1 * s, top - yw - 0.03 * s), null, T());
  // bowl: frustum + rim ring (8 trapezoid segments around a recessed basin top)
  const rb = 0.3 * s, rt = 0.65 * s, rim = 0.09 * s, yr = top - 0.07 * s;
  B.add(frustumFaces(ngonPts(rb), ngonPts(rt), top - yw, yr), null, T(1.02));
  B.add(prismFaces(ngonPts(rt - rim), yr - 0.02, yr + 0.02 * s), null, T(0.86)); // recessed inner surface
  const o = ngonPts(rt), i = ngonPts(rt - rim);
  for (let k = 0; k < 8; k++) {
    const j = (k + 1) % 8;
    B.add(prismFaces([o[k], o[j], i[j], i[k]], yr, top), null, T(1.03));
  }
  if (!builder) {
    const group = new THREE.Group(); group.name = 'goblet';
    finish(engine, group, B, {});
    group.userData = { top, kind: 'goblet' };
    return placeGroup(group, { position, yaw, terrain, ext: 0.4, sink: 0, foot: [{ oct: 0.62 * s }] });
  }
  return B;
}

// ---------------------------------------------------------------------------------------------------
// Shrine: octagonal stepped basin with inner fountain and a water slot
// ---------------------------------------------------------------------------------------------------
/**
 * Octagonal stepped basin (ART_DIRECTION §1). Faces normals lie on k·45°, so at a 45°-yaw camera a face
 * fronts the viewer with a perfectly horizontal top edge. All dimensions in metres; `radius` = outer
 * plinth across-flats / 2 (others scale with it unless given).
 */
export function createShrine(engine, opts = {}) {
  const radius = opts.radius ?? 3.6;
  const k = radius / 3.6;
  const {
    seed = 5, position, terrain = null, fountain = true, water = true, cracks = 2,
    plinthTop = 0.35, wallTop = 0.6, floorY = -0.30, waterLevel = -0.08, footing = true, bench = true,
  } = opts;
  const aPl = radius, aWo = opts.wallOuter ?? 2.8 * k, wallT = opts.wallThickness ?? 0.5 * k, aWi = aWo - wallT;
  const r = rng(seed * 977 + 31);
  const B = new Builder();
  const group = new THREE.Group(); group.name = 'shrine';

  // the face that fronts the camera (and its two 45° neighbours) stays clean: no cracks, no chips, so the
  // near face's top edge is one horizontal line. Face s lies between vertices s and s+1, normal at (s+1)·45°.
  const camYaw = engine.camera?.yaw ?? D45;
  const nearFace = (((Math.round(Math.atan2(Math.cos(camYaw), Math.sin(camYaw)) / D45) - 1) % 8) + 8) % 8;
  const isFront = (s) => { const d = Math.min((s - nearFace + 8) % 8, (nearFace - s + 8) % 8); return d <= 1; };
  const crackSet = new Set();
  const nCracks = Math.min(cracks, 5);
  for (let guard = 0; crackSet.size < nCracks && guard < 64; guard++) {
    const s = Math.floor(r() * 8);
    if (!isFront(s) && !crackSet.has((s + 1) % 8) && !crackSet.has((s + 7) % 8)) crackSet.add(s);
  }
  const lerp2 = (A, Bp, t) => [A[0] + (Bp[0] - A[0]) * t, A[1] + (Bp[1] - A[1]) * t];
  /**
   * One octagonal band: 8 segments (mitred at the corners), each split into `pieces` stones by joints
   * perpendicular to the face (straight seams). Tops are level (jitter in whole 1/32 m steps, default 0);
   * a cracked segment is split in two with a 0.08 m gap and its second stone tilted 4° and dropped.
   */
  const ring = (aOut, aIn, y0, y1, { pieces = [1, 1], gap = 1.5 * Q, miter = 2 * Q, chip = 0, tint = 1, cracked = null, jitter = 0, outDrop = 0 } = {}) => {
    const O = ngonPts(aOut), I = ngonPts(aIn);
    for (let s = 0; s < 8; s++) {
      const j = (s + 1) % 8;
      const crack = cracked && cracked.has(s);
      let n = pieces[0] + Math.floor(r() * (pieces[1] - pieces[0] + 1));
      if (crack) n = Math.max(n, 2);
      const tx = O[j][0] - O[s][0], tz = O[j][1] - O[s][1], tl = Math.hypot(tx, tz);
      const ux = tx / tl, uz = tz / tl;
      const U = new THREE.Vector3(ux, 0, uz);
      // centre line of the segment: midpoint + half-length (joints are measured along it)
      const mo = lerp2(O[s], O[j], 0.5), mi = lerp2(I[s], I[j], 0.5);
      const mc = [(mo[0] + mi[0]) / 2, (mo[1] + mi[1]) / 2];
      const halfC = (tl + Math.hypot(I[j][0] - I[s][0], I[j][1] - I[s][1])) / 4;
      const uc = ux * mc[0] + uz * mc[1];
      // joint positions (unequal stones, never shorter than ~0.6 m)
      const cuts = [-halfC];
      for (let c = 1; c < n; c++) cuts.push(-halfC + 2 * halfC * (c / n + (r() * 2 - 1) * 0.14 / n));
      cuts.push(halfC);
      // the whole segment, mitred, shrunk by half a joint at both corner ends
      const g0 = miter / 2;                                     // mitre joints: 2 texels so the 22.5° line stays unbroken
      const sh = (p, sgn) => [p[0] + ux * g0 * sgn, p[1] + uz * g0 * sgn];
      const P = [sh(O[s], 1), sh(O[j], -1), sh(I[j], -1), sh(I[s], 1)];
      for (let c = 0; c < n; c++) {
        const crackStone = crack && c === n - 1;
        const jg = (crack && c === n - 1 ? 0.08 : gap) / 2;    // half of the joint below this stone (crack: 0.08 m)
        const dy = jitter && !crack ? Q * Math.round((r() * 2 - 1) * jitter / Q) : 0;
        let faces = prismFaces(P, y0, y1 + dy);
        if (c < n - 1) faces = clip(faces, U, uc + cuts[c + 1] - (crack && c === n - 2 ? 0.08 : gap) / 2);
        if (c > 0) faces = clip(faces, U.clone().negate(), -(uc + cuts[c] + jg));
        // optional chip: a small vertical cut at an outer corner end of the segment (never on the front faces)
        if (chip && !isFront(s) && (c === 0 || c === n - 1) && r() < chip) {
          const end = c === 0 ? P[0] : P[1], sg = c === 0 ? -1 : 1;
          const out = Math.sign(-uz * mc[0] + ux * mc[1]);
          const nn = new THREE.Vector3(-uz * out + ux * sg, 0, ux * out + uz * sg).normalize();
          const sz = 0.05 + r() * 0.05;
          faces = clip(faces, nn, nn.dot(new THREE.Vector3(end[0], 0, end[1])) - sz);
        }
        let m = null;
        if (crackStone) {
          // displaced stone: tilted 4° about its tangent axis and dropped outward a little
          const nx = -uz, nz = ux;
          const out = Math.sign(nx * mc[0] + nz * mc[1]);
          const axis = new THREE.Vector3(ux, 0, uz);
          const ang = THREE.MathUtils.degToRad(4) * (r() < 0.5 ? 1 : -1);
          const piv = new THREE.Vector3(mc[0], y0, mc[1]);
          m = new THREE.Matrix4().makeTranslation(nx * 0.03 * out, -0.03 - outDrop, nz * 0.03 * out)
            .multiply(new THREE.Matrix4().makeTranslation(piv.x, piv.y, piv.z))
            .multiply(new THREE.Matrix4().makeRotationAxis(axis, ang))
            .multiply(new THREE.Matrix4().makeTranslation(-piv.x, -piv.y, -piv.z));
        }
        B.add(faces, m, tintFor(r, tint, 0.8));
      }
    }
  };

  // three clean concentric bands: low footing step, the plinth (one long stone per side, unbroken top rim),
  // and the low wall with an overhanging coping (the overhang gives the rim-above / line-below pair).
  const copeH = 0.12;
  if (footing) ring(aPl + 0.16 * k, aPl - 0.3 * k, -0.2, 0.1, { pieces: [1, 1], chip: 0.25, tint: 0.95 });
  ring(aPl, aWo - 0.02, -0.15, plinthTop, { pieces: [1, 1], tint: 0.99 });
  ring(aWo, aWi, floorY - 0.1, wallTop - copeH, { pieces: [1, 1], tint: 0.96 });
  ring(aWo + 0.06 * k, aWi - 0.06 * k, wallTop - copeH, wallTop, { pieces: [1, 2], chip: 0.3, cracked: crackSet, tint: 1.03 });
  // inner submerged bench + floor (darker, read through the water)
  if (bench) ring(aWi, aWi - 0.28 * k, floorY - 0.05, floorY + 0.14, { pieces: [1, 1], tint: 0.9 });
  B.add(prismFaces(ngonPts(aWi + 0.01), floorY - 0.2, floorY), null, [0.82, 0.82, 0.84]);

  if (fountain) createGoblet(engine, { seed: seed + 1, y0: floorY, top: opts.fountainTop ?? 1.55, scale: opts.fountainScale ?? 1, builder: B });

  finish(engine, group, B, {});
  placeGroup(group, { position, yaw: 0, terrain: null, foot: [{ oct: footing ? aPl + 0.16 * k : aPl }] });
  if (terrain && position) group.position.y = (position.y ?? terrain.heightAt(position.x ?? 0, position.z ?? 0));
  const c = group.position;
  const poly = ngonPts(aWi).map(([x, z]) => [x + c.x, z + c.z]);
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  group.userData = {
    kind: 'shrine', radius: aPl, innerApothem: aWi, wallTop: c.y + wallTop,
    water: water ? {
      level: c.y + waterLevel, floorY: c.y + floorY, center: new THREE.Vector3(c.x, c.y + waterLevel, c.z), apothem: aWi,
      polygon: poly,
      // ready for createWater(engine, terrain, {level, shape, bounds}) (water.js accepts these forms)
      shape: { kind: 'polygon', points: poly },
      bounds: { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) },
    } : null,
  };
  return group;
}
export const createOctagonBasin = createShrine;

// ---------------------------------------------------------------------------------------------------
// Wall
// ---------------------------------------------------------------------------------------------------
/** Ruined wall along local X (centred), courses of running-bond blocks with an eroded top profile. */
export function createWall(engine, opts = {}) {
  const { length = 4, height = 1.6, thickness = 0.5, seed = 9, ruin = 0.6, position, yaw = D45, terrain = null, rubble = true, footing = true } = opts;
  const r = rng(seed * 4241 + 3);
  const B = new Builder();
  const group = new THREE.Group(); group.name = 'wall';
  // eroded top: a slanted break line between two random end heights, roughened by noise
  const e0 = 1 - ruin * r() * 0.5, e1 = 1 - ruin * (0.35 + r() * 0.55);
  const flip = r() < 0.5;
  const prof = (x) => {
    let u = (x + length / 2) / length; if (flip) u = 1 - u;
    const n = noise2(x * 1.1 + seed * 3.1, seed * 1.7);
    const base = e0 + (e1 - e0) * u;
    return height * THREE.MathUtils.clamp(base + ruin * (n - 0.5) * 0.9, 0.14, 1);
  };
  let y = 0;
  if (footing) {
    const fh = q(0.18);
    B.add(boxBlock(length + 0.14, fh + 0.06, thickness + 0.16, randomChips(r, length, fh, thickness, { count: 3 })), M(0, -0.06, 0), tintFor(r, 0.95));
    y = fh;
  }
  let course = 0;
  while (y < height - 0.05) {
    const ch = q(0.24 + r() * 0.14);
    let x = -length / 2 + (course % 2 ? q(0.15 + r() * 0.25) : 0);
    if (x > -length / 2) {
      const w0 = x + length / 2;
      if (y + ch <= prof(-length / 2 + w0 / 2) + 0.06) B.add(boxBlock(w0 - Q, ch - Q / 2, thickness, randomChips(r, w0, ch, thickness, { count: 1 })), M(-length / 2 + w0 / 2, y, q((r() * 2 - 1) * 0.03)), tintFor(r));
    }
    while (x < length / 2 - 0.05) {
      let bl = q(0.45 + r() * 0.45);
      if (length / 2 - (x + bl) < 0.25) bl = length / 2 - x;
      const cx = x + bl / 2;
      const p = prof(cx);
      if (y + ch <= p + 0.06) {
        const topmost = y + ch * 2 > p;
        const oz = q((r() * 2 - 1) * 0.035);
        const chips = randomChips(r, bl, ch, thickness, { count: topmost ? 2 + Math.floor(r() * 2) : (r() < 0.4 ? 1 : 0), topBias: 0.8 });
        const tilt = topmost && r() < 0.35 ? THREE.MathUtils.degToRad((r() * 2 - 1) * 5) : 0;
        if (r() < 0.12 && thickness > 0.35) {
          // two half-thickness stones (through-joint visible on the top)
          const t2 = thickness / 2 - Q / 2;
          B.add(boxBlock(bl - Q, ch - Q / 2, t2, chips), M(cx, y, -thickness / 4 + oz, 0, 0, tilt), tintFor(r));
          B.add(boxBlock(bl - Q, ch - Q / 2 - (topmost ? q(r() * 0.1) : 0), t2), M(cx, y, thickness / 4 + oz), tintFor(r));
        } else {
          B.add(boxBlock(bl - Q, ch - Q / 2, thickness, chips), M(cx, y, oz, 0, 0, tilt, new THREE.Vector3(0, 0, 0)), tintFor(r));
        }
      } else if (rubble && r() < 0.35) {
        // a fallen stone from this course at the foot of the wall
        const s = q(0.18 + r() * 0.16), side = r() < 0.5 ? -1 : 1;
        B.add(boxBlock(s * 1.4, s * 0.8, s, randomChips(r, s * 1.4, s * 0.8, s, { count: 2 })),
          M(cx + (r() * 2 - 1) * 0.3, -0.05, side * (thickness / 2 + 0.25 + r() * 0.5), Math.floor(r() * 4) * D45, 0, THREE.MathUtils.degToRad((r() * 2 - 1) * 8)), tintFor(r, 0.96));
      }
      x += bl;
    }
    y += ch; course++;
  }
  finish(engine, group, B, {});
  group.userData = { kind: 'wall', length, height, thickness };
  return placeGroup(group, { position, yaw, terrain, ext: Math.min(length / 2, 1), foot: [{ hw: length / 2 + 0.07, hd: thickness / 2 + 0.08 }] });
}

// ---------------------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------------------
/** Stone stair: `count` steps of rise/run, front edge at local z = 0, ascending toward local -Z. */
export function createSteps(engine, opts = {}) {
  const { width = 2.4, count = 4, rise = 0.18, run = 0.38, seed = 11, position, yaw = D45, terrain = null, cheeks = true, worn = 0.6 } = opts;
  const r = rng(seed * 613 + 5);
  const B = new Builder();
  const group = new THREE.Group(); group.name = 'steps';
  const depth = count * run;
  for (let i = 0; i < count; i++) {
    const y0 = i * rise - (i === 0 ? 0.08 : 0), y1 = (i + 1) * rise;
    const z0 = -i * run, z1 = -depth;        // each step spans from its nose to the back
    const n = 2 + Math.floor(r() * 2);
    let x = -width / 2;
    for (let s = 0; s < n; s++) {
      const w = s === n - 1 ? width / 2 - x : q(width / n * (0.8 + r() * 0.4));
      const d = z0 - z1, h = y1 - y0 + q((r() * 2 - 1) * Q * 0.5);
      const chips = [];
      if (r() < worn) chips.push({ kind: 'edgeX', sx: 1, sy: 1, sz: 1, s: 0.05 + r() * 0.03 });
      chips.push(...randomChips(r, w, h, d, { count: r() < 0.5 ? 1 : 0, topBias: 1 }).filter((c) => c.sz > 0));
      const nose = q(r() * 0.03);
      B.add(boxBlock(w - Q, h, d, chips), M(x + w / 2, y0, (z0 + z1) / 2 + nose), tintFor(r));
      x += w;
    }
  }
  if (cheeks) {
    for (const sx of [-1, 1]) {
      const cw = 0.32, ch = count * rise + 0.12;
      // a sloped cheek wall: box clipped by a 2:1-ish plane parallel to the stair pitch
      let f = boxBlock(cw, ch, depth + 0.1, randomChips(r, cw, ch, depth, { count: 1, topBias: 1 }));
      const n = new THREE.Vector3(0, run, rise).normalize();
      f = clip(f, n, n.dot(new THREE.Vector3(0, rise * 1.6, (depth + 0.1) / 2)));
      B.add(f, M(sx * (width / 2 + cw / 2), -0.08, -depth / 2), tintFor(r, 0.96));
    }
  }
  finish(engine, group, B, {});
  group.userData = { kind: 'steps', top: count * rise, depth };
  return placeGroup(group, { position, yaw, terrain, ext: 0.4, sink: 0, foot: [{ cz: -depth / 2, hw: width / 2 + (cheeks ? 0.32 : 0), hd: depth / 2 + 0.05 }] });
}

// ---------------------------------------------------------------------------------------------------
// Paving
// ---------------------------------------------------------------------------------------------------
/**
 * Scattered flat paving stones following terrain.heightAt. Rows (running bond) on a k·45° grid; density
 * falls off toward the rim so the patch dissolves into the ground. kind 'flag' (default) or 'cobble'.
 */
export function createPaving(engine, terrain, opts = {}) {
  const {
    center = new THREE.Vector3(), radius = 3, seed = 13, stone = 0.55, gap = Q * 1.5, density = 0.85,
    falloff = 0.45, thickness = 0.1, yaw = D45, kind = 'flag', lift = 0.035, tones, patches = 0.5, exclude = null,
  } = opts;
  const r = rng(seed * 3331 + 17);
  const H = terrain?.heightAt ? (x, z) => terrain.heightAt(x, z) : () => 0;
  const B = new Builder();
  const group = new THREE.Group(); group.name = 'paving';
  const cx = center.x ?? 0, cz = center.z ?? 0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const toWorld = (u, v) => [cx + u * cy + v * sy, cz - u * sy + v * cy];
  const foot = [];
  const rowD = kind === 'cobble' ? stone * 0.5 : stone;
  for (let v = -radius; v < radius; v += rowD) {
    let u = -radius - r() * stone;
    while (u < radius) {
      const L = kind === 'cobble' ? q(stone * (0.42 + r() * 0.2)) : q(stone * (0.7 + r() * 0.6));
      const uc = u + L / 2 + q((r() * 2 - 1) * 0.03), vc = v + rowD / 2 + q((r() * 2 - 1) * 0.03);
      u += L;
      const dist = Math.hypot(uc, vc);
      const edge = 1 - THREE.MathUtils.smoothstep(dist, radius * (1 - falloff), radius);
      const n = noise2(uc * 0.7 + seed, vc * 0.7 - seed, seed);
      if (r() > density * edge * (0.55 + 0.9 * n)) continue;
      const [wx, wz] = toWorld(uc, vc);
      if (exclude && exclude(wx, wz)) continue;
      const w = L - gap - (1 - edge) * q(r() * 0.12), d = rowD - gap - (1 - edge) * q(r() * 0.1);
      if (w < 0.1 || d < 0.1) continue;
      const th = thickness * (0.8 + r() * 0.4);
      // fit the slab to the terrain under its corners
      const [ax, az] = toWorld(uc - w / 2, vc), [bx, bz] = toWorld(uc + w / 2, vc);
      const [ex, ez] = toWorld(uc, vc - d / 2), [fx, fz] = toWorld(uc, vc + d / 2);
      const hU = H(bx, bz) - H(ax, az), hV = H(fx, fz) - H(ex, ez);
      const tiltZ = Math.atan2(hU, w) + THREE.MathUtils.degToRad((r() * 2 - 1) * 1.5 * (1.5 - edge));
      const tiltX = -Math.atan2(hV, d) + THREE.MathUtils.degToRad((r() * 2 - 1) * 1.5 * (1.5 - edge));
      const sunk = r() < 0.18 ? 0.03 : 0;
      const y = H(wx, wz) + lift * (0.5 + edge * 0.5) - th - sunk;
      let faces;
      if (kind === 'cobble') {
        faces = boxBlock(w, th, d, [0, 1, 2, 3].map((i) => ({ kind: 'vert', sx: i & 1 ? 1 : -1, sy: 1, sz: i & 2 ? 1 : -1, s: Math.min(w, d) * (0.22 + r() * 0.1) })));
      } else {
        faces = boxBlock(w, th, d, randomChips(r, w, th, d, { count: r() < 0.5 ? 1 : 0, topBias: 1 }).filter((c) => c.kind !== 'corner' || r() < 0.5));
      }
      // local (u, v) frame -> world: rotate by yaw about Y (u = local x, v = local z)
      const m = new THREE.Matrix4().makeTranslation(wx, y, wz)
        .multiply(new THREE.Matrix4().makeRotationY(yaw))
        .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tiltX, 0, tiltZ)));
      B.add(faces, m, tintFor(r, 1, 1.4));
      foot.push({ cx: wx, cz: wz, hw: w / 2, hd: d / 2, yaw });
    }
  }
  finish(engine, group, B, { tones: tones ?? STONE, patches }, { castShadow: true });
  group.userData = { kind: 'paving' };
  setCovers(group, foot);
  return group;
}

// ---------------------------------------------------------------------------------------------------
// Lantern
// ---------------------------------------------------------------------------------------------------
/**
 * Stone lantern (tōrō): footing, chamfered post, platform, open firebox around a glowing core, hip roof,
 * finial. `lit` glows (emissive, stepped 8 fps flicker with 4 levels); `light` adds a PointLight.
 */
export function createLantern(engine, opts = {}) {
  const { height = 1.5, seed = 21, position, yaw = D45, terrain = null, lit = false, flicker = true, light = false, glowColor = '#FFC46B' } = opts;
  const r = rng(seed * 89 + 1);
  const s = height / 1.5;
  const B = new Builder();
  const group = new THREE.Group(); group.name = 'lantern';
  const chamf = (w) => [0, 1, 2, 3].map((i) => ({ kind: 'vert', sx: i & 1 ? 1 : -1, sy: 1, sz: i & 2 ? 1 : -1, s: w * 0.22 }));
  let y = -0.06;
  const add = (w, h, d, chips, tint = 1, ox = 0, oz = 0) => { B.add(boxBlock(w, h, d, chips), M(ox, y, oz), tintFor(r, tint, 0.6)); y += h; };
  add(0.62 * s, 0.16 * s, 0.62 * s, randomChips(r, 0.62, 0.16, 0.62, { count: 2 }), 0.95);
  add(0.42 * s, 0.1 * s, 0.42 * s, chamf(0.42 * s));
  add(0.22 * s, 0.5 * s, 0.22 * s, chamf(0.22 * s), 0.97, q((r() * 2 - 1) * 0.02));
  add(0.5 * s, 0.09 * s, 0.5 * s, randomChips(r, 0.5, 0.09, 0.5, { count: 1 }));
  // firebox: 4 corner posts + glowing core
  const fb = 0.38 * s, fh = 0.27 * s, pw = 0.075 * s;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
    B.add(boxBlock(pw, fh, pw), M(sx * (fb / 2 - pw / 2), y, sz * (fb / 2 - pw / 2)), tintFor(r));
  const glowY = y;
  y += fh;
  // hip roof: a wide slab with its top clipped by four 45°-ish planes, plus a finial
  const rw = 0.72 * s, rh = 0.24 * s;
  let roof = boxBlock(rw, rh, rw);
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = new THREE.Vector3(nx, 1.25, nz).normalize();
    roof = clip(roof, n, n.dot(new THREE.Vector3(nx * rw / 2, 0.07 * s, nz * rw / 2)));
  }
  B.add(roof, M(0, y, 0), tintFor(r, 1.04));
  y += rh;
  B.add(boxBlock(0.11 * s, 0.1 * s, 0.11 * s, chamf(0.11 * s)), M(0, y - 0.05 * s, 0), tintFor(r));
  finish(engine, group, B, {});

  // glowing core (own material: emissive warm light; unlit look in the hi band)
  const gc = new THREE.Color(glowColor);
  const glowMat = toonMaterial(engine, { color: gc.clone().multiplyScalar(0.5), outline: 'depth', ramp: { hi: [1, 1, 1], sh: [0.9, 0.9, 0.9] } });
  glowMat.emissive = gc.clone().multiplyScalar(lit ? 0.9 : 0.15);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(fb - pw * 1.6, fh * 0.92, fb - pw * 1.6).translate(0, fh * 0.46, 0), glowMat);
  glow.position.y = glowY; glow.castShadow = false; glow.receiveShadow = false;
  group.add(glow);
  let pl = null;
  if (light) {
    pl = new THREE.PointLight(gc, lit ? 1.6 : 0, 3.5 * s, 1.5);
    pl.position.set(0, glowY + fh / 2, 0);
    group.add(pl);
  }
  if (lit && flicker) {
    const ph = r() * 10, levels = [0.72, 0.84, 0.94, 1.0];
    engine.onUpdate((t) => {
      const k = Math.floor(t * 8 + ph);
      const f = levels[Math.floor(((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1 * 4)];
      glowMat.emissive.copy(gc).multiplyScalar(0.9 * f);
      if (pl) {
        pl.intensity = 1.6 * f;
        pl.position.set(Math.sin(k * 7.13) * 0.03 * s, glowY + fh / 2 + Math.sin(k * 3.71) * 0.02 * s, Math.cos(k * 5.31) * 0.03 * s);
      }
    });
  }
  group.userData = { kind: 'lantern', glow, light: pl, top: y };
  return placeGroup(group, { position, yaw, terrain, ext: 0.3, foot: [{ hw: 0.31 * s, hd: 0.31 * s }] });
}

// ---------------------------------------------------------------------------------------------------
// Slabs, debris, fallen arch
// ---------------------------------------------------------------------------------------------------
/** A fallen flat slab lying with a 2–5° tilt, partly buried on one edge. */
export function createSlab(engine, opts = {}) {
  const { seed = 31, position, yaw = D45, terrain = null, side = 0.8 } = opts;
  const r = rng(seed * 59 + 3);
  const w = opts.w ?? q(1.0 + r() * 0.4), d = opts.d ?? q(0.8 + r() * 0.4), h = opts.h ?? q(0.12 + r() * 0.06);
  const B = new Builder();
  const group = new THREE.Group(); group.name = 'slab';
  const tx = THREE.MathUtils.degToRad((2 + r() * 3) * (r() < 0.5 ? -1 : 1)), tz = THREE.MathUtils.degToRad((r() * 2 - 1) * 3);
  // only vertical corner cuts: a 45° chamfer along a top edge would draw a second cream rim 2–3 texels
  // below the first and the slab would read as a flat card. Steep faces take the darker `side` albedo so
  // the front face sits a band below the top.
  const vchips = (cw, ch, cd, n) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ kind: 'vert', sx: r() < 0.5 ? -1 : 1, sy: 1, sz: r() < 0.5 ? -1 : 1, s: Math.min(cw, cd) * (0.1 + r() * 0.14) });
    return out;
  };
  B.add(boxBlock(w, h, d, vchips(w, h, d, 1 + Math.floor(r() * 2))), M(0, -0.04, 0, 0, tx, tz), tintFor(r, 1.02), { side });
  if (r() < 0.5) {   // a broken-off piece next to it
    const s = q(0.2 + r() * 0.15);
    B.add(boxBlock(s, h * 0.9, s * 0.8, vchips(s, h, s * 0.8, 1)), M(w / 2 + 0.12 + r() * 0.1, -0.03, (r() * 2 - 1) * d * 0.3, D45 * Math.floor(r() * 2)), tintFor(r), { side });
  }
  finish(engine, group, B, {});
  group.userData = { kind: 'slab' };
  return placeGroup(group, { position, yaw, terrain, ext: Math.min(w, d) * 0.4, sink: 0, foot: [{ hw: w / 2, hd: d / 2 }] });
}

/**
 * Scattered debris cubes (0.08–0.3 m, k·45° yaws, half-buried), clustered around `around` points
 * [{x, z, r}] or uniformly in a disc (center, radius). One merged mesh.
 */
export function createDebris(engine, terrain, opts = {}) {
  const { center = new THREE.Vector3(), radius = 3, count = 30, seed = 41, min = 0.08, max = 0.3, around = null, avoid = null } = opts;
  const r = rng(seed * 7 + 99);
  const H = terrain?.heightAt ? (x, z) => terrain.heightAt(x, z) : () => 0;
  const B = new Builder();
  const group = new THREE.Group(); group.name = 'debris';
  const foot = [];
  let placed = 0, tries = 0;
  while (placed < count && tries++ < count * 20) {
    let x, z;
    if (around && around.length) {
      const c = around[Math.floor(r() * around.length)];
      const a = r() * Math.PI * 2, rr = (c.r ?? 1) * (0.5 + r() * 0.7);
      x = c.x + Math.cos(a) * rr; z = c.z + Math.sin(a) * rr;
    } else {
      const a = r() * Math.PI * 2, rr = radius * Math.sqrt(r());
      x = (center.x ?? 0) + Math.cos(a) * rr; z = (center.z ?? 0) + Math.sin(a) * rr;
    }
    if (avoid && avoid(x, z)) continue;
    const s = q(min + Math.pow(r(), 1.8) * (max - min)), sy = q(Math.max(min * 0.8, s * (0.55 + r() * 0.5))), sd = q(s * (0.75 + r() * 0.5));
    const faces = boxBlock(s, sy, sd, randomChips(r, s, sy, sd, { count: s > 0.15 ? 2 : 1 }));
    const y = H(x, z) - sy * (0.25 + r() * 0.3);
    B.add(faces, M(x, y, z, Math.floor(r() * 8) * D45, THREE.MathUtils.degToRad((r() * 2 - 1) * 6), THREE.MathUtils.degToRad((r() * 2 - 1) * 6)), tintFor(r, 0.98, 1.3));
    foot.push({ cx: x, cz: z, r: s * 0.6 });
    placed++;
  }
  finish(engine, group, B, {});
  group.userData = { kind: 'debris', count: placed };
  setCovers(group, foot);
  return group;
}

/**
 * Fallen arch: the voussoir ring of an arch that toppled sideways, lying as ONE rigid ring (no per-stone
 * wobble, so it reads as a continuous chain, not tumbling blocks). `blocks` wedge stones (radial joints of
 * 1.5 texels, so each is narrower on its inner edge) of varied length / width / height tile a gentle plan arc
 * (sweep `sweep` rad, bulging toward `side`) from `from` to `to`. The ring's underside runs straight from
 * `from.y` (e.g. a broken pillar's top) down to `to.y`; stone heights vary on top, so the upper edge steps.
 * The middle stone (keystone) is a little longer and taller.
 */
export function createFallenArch(engine, opts = {}) {
  const { seed = 51, blocks = 7, terrain = null, size = [0.6, 0.45, 0.5], sweep = 0.8, side = 1, sideTone = 0.88 } = opts;
  const from = opts.from ?? new THREE.Vector3(-2, 1, 0), to = opts.to ?? new THREE.Vector3(2, 0, 0);
  const r = rng(seed * 17 + 5);
  const B = new Builder();
  const group = new THREE.Group(); group.name = 'arch';
  const foot = [];
  const dx = to.x - from.x, dz = to.z - from.z, chord = Math.max(Math.hypot(dx, dz), 0.5);
  const sw = Math.max(sweep, 0.05);
  const Rm = chord / (2 * Math.sin(sw / 2));
  const ringW = size[2], ringH = size[1];
  // local frame: from-end at the origin, chord along +z, arc bulging toward side·x; pitched so that local
  // y = 0 runs from from.y down to to.y along the chord
  const arcPt = (phi, rad) => [side * (rad * Math.cos(phi) - Rm * Math.cos(sw / 2)), rad * Math.sin(phi) + Rm * Math.sin(sw / 2)];
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(from.y - to.y, chord);
  const frame = new THREE.Matrix4().makeTranslation(from.x, from.y, from.z)
    .multiply(new THREE.Matrix4().makeRotationY(yaw))
    .multiply(new THREE.Matrix4().makeRotationX(pitch));
  const mid = (blocks - 1) / 2;
  const wts = Array.from({ length: blocks }, (_, i) => (0.75 + r() * 0.5) * (Math.abs(i - mid) < 0.6 ? 1.2 : 1));
  const tot = wts.reduce((a, b) => a + b, 0);
  const hg = 0.75 * Q / Rm;                                                  // half joint (angle)
  let acc = 0;
  for (let i = 0; i < blocks; i++) {
    const p0 = -sw / 2 + (acc / tot) * sw + hg;
    acc += wts[i];
    const p1 = -sw / 2 + (acc / tot) * sw - hg;
    const key = Math.abs(i - mid) < 0.6;
    const w = q(ringW * (0.88 + r() * 0.24)), h = q(ringH * (0.85 + r() * 0.25) * (key ? 1.12 : 1));
    const pts = [arcPt(p0, Rm - w / 2), arcPt(p1, Rm - w / 2), arcPt(p1, Rm + w / 2), arcPt(p0, Rm + w / 2)];
    let faces = prismFaces(pts, -0.04, h);
    // a vertical chip at one outer corner (keeps the top rim a single line)
    if (r() < 0.45) {
      const k = r() < 0.5 ? 2 : 3, P = pts[k];
      const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4, cz = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
      const dir = new THREE.Vector3(P[0] - cx, 0, P[1] - cz).normalize();
      faces = clip(faces, dir, dir.dot(new THREE.Vector3(P[0], 0, P[1])) - (0.06 + r() * 0.06));
    }
    B.add(faces, frame, tintFor(r), { side: sideTone });
    const [mx, mz] = arcPt((p0 + p1) / 2, Rm);
    const wc = new THREE.Vector3(mx, 0, mz).applyMatrix4(frame);
    foot.push({ cx: wc.x, cz: wc.z, r: Math.max(w, Rm * (p1 - p0)) * 0.62 });
  }
  void terrain;                                    // the ring may dip into uneven ground (half-buried): fine
  finish(engine, group, B, {});
  group.userData = { kind: 'arch' };
  setCovers(group, foot);
  return group;
}
