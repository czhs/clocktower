// Rocks & pebbles (owner: terrain agent). docs/TECHNIQUES.md §4.4.
//
//   const rocks = createRocks(engine, terrain, {count, seed, area, size, ...})
//   rocks.group      THREE.Group (already added to the scene) holding a few InstancedMeshes
//   rocks.items      [{x, z, y, r, kind}] placed boulders/pebbles (scenes pass these to grass `avoid`)
//   rocks.avoid      [{x, z, r}] footprints (convenience for scatterTrees / grass avoid lists)
//
// Shape: a stretched rhombicuboctahedron cut from random 45°-family half-spaces (axis faces + 45° bevels +
// corner facets), "built on 45°", with facets >= 3 px. Boulders are 'soft': a big flat top facet with a crisp
// rim, and the side facets share smoothed normals (creases < 58° merge), so the sides shade as one rounded
// lump in 2-3 bands with no ridge lines; outcrops and large pebbles stay flat-shaded.
// Instances get yaw = k·45°, a 20-35 % burial, small tilt and +-5 % tone jitter. Moss: a cap on the
// upward-facing top (light #94AA6F-family tones, frayed by a world-space fbm), creeping onto the shoulders.
// Pebbles with r < 0.15 m: 2 flat tones (lit / shade), depth outline only, no edge highlight (no 1-px speckle).
//
// Options:
//   kind 'boulder'      'boulder' | 'outcrop' (blocky chamfered blocks stacked 2-4 high, flat tops)
//   count 12            boulders (clusters add 0-3 satellites each, counted separately)
//   seed 1
//   area {x, z, r} | {x, z, w, h}   (default: centre 0,0 r = terrain.size * 0.3)
//   size [0.35, 1.1]    main boulder radius range (m)
//   cluster 0.55        probability a boulder gets 1-3 smaller satellites
//   pebbles count*3     small stones 0.05-0.14 m (pebbleSize [min,max])
//   pebbleArea          defaults to `area`
//   palette [hi, mid, sh] sRGB (default T 2021 purple rock), pebblePalette (default shrine stone)
//   moss 0.45           moss amount on tops: lower = more (0.4 ~ full caps, 0.7 patchy, 1 = none), mossPalette
//   soft true           boulder kind: smooth-shaded sides + flat top (false = the old fully faceted look)
//   avoid [{x,z,r}]     keep-out circles; minSpacing 0.3 (extra gap between boulders)
//   submerged false     allow boulders whose centre is under water (half-submerged pond rocks)
//   bury [0.2, 0.35]    fraction of the height below ground
//   maxSlope 0.8        min terrain normal.y at the placement
//   outline 'full'
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { rng } from '../core/noise.js';
import { toonMaterial, rampFromTones } from '../materials/toon.js';

export const ROCK_PALETTE = ['#6F6882', '#524E6E', '#45425F'];
export const PEBBLE_PALETTE = ['#BBAC97', '#8C7E72', '#5B5A64'];
export const MOSS_PALETTE = ['#A9BD7E', '#94AA6F', '#7A9466'];

/**
 * One chunky faceted rock geometry (unit-ish radius, centred, flat normals).
 * Built as the intersection of half-spaces whose normals are the 26 directions of a rhombicuboctahedron
 * (axis, 45° edge bevels, corner facets), each nudged a few degrees and pushed in/out at random, so
 * every face is exactly planar (no diagonal creases inside a facet) and the rock reads as "built on 45°".
 */
export function rockGeometry(rand, { squash = [0.6, 0.9], tilt = 0.28, bevel = [0.8, 0.96], corner = [0.9, 1.1], drop = 0.42, chips = [0, 2], top = 1, soft = 0, tallChance = 0.2, taper = 0 } = {}) {
  const planes = [];
  const add = (x, y, z, d) => {
    const n = new THREE.Vector3(x + (rand() - 0.5) * tilt, y + (rand() - 0.5) * tilt, z + (rand() - 0.5) * tilt).normalize();
    planes.push({ n, d });
  };
  for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
    const v = [0, 0, 0]; v[a] = s; add(...v, (0.92 + rand() * 0.16) * (a === 1 && s > 0 ? top : 1));
  }
  const bv = bevel[0] + rand() * (bevel[1] - bevel[0]);
  for (let a = 0; a < 3; a++) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
    if (rand() < drop) continue; // missing bevel -> sharper corner, bigger neighbouring facets
    const w = [0, 0, 0]; w[(a + 1) % 3] = s1; w[(a + 2) % 3] = s2;
    add(w[0] * Math.SQRT1_2, w[1] * Math.SQRT1_2, w[2] * Math.SQRT1_2, bv * (0.94 + rand() * 0.12));
  }
  const cr = corner[0] + rand() * (corner[1] - corner[0]);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    if (rand() < drop * 0.5) continue;
    const k = 1 / Math.sqrt(3); add(sx * k, sy * k, sz * k, cr * (0.94 + rand() * 0.12));
  }
  // a few random chips: extra cuts on 45°-snapped directions (+ small nudge) close to the surface
  const nChips = chips[0] + Math.floor(rand() * (chips[1] - chips[0] + 1));
  for (let i = 0; i < nChips; i++) {
    const az = Math.floor(rand() * 8) * Math.PI / 4 + Math.PI / 8 * (rand() < 0.5 ? 1 : 0), el = (Math.floor(rand() * 5) - 2) * Math.PI / 8;
    const dx = Math.cos(el) * Math.cos(az), dy = Math.sin(el), dz = Math.cos(el) * Math.sin(az);
    // support of the current solid along d is ~ max(|d|·axis): approximate with the dominant offsets
    const sup = Math.max(Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1.5 ? cr : bv, 0.85);
    add(dx, dy, dz, sup * (0.9 + rand() * 0.07));
  }
  // vertices = feasible intersections of plane triples
  const pts = [], M = new THREE.Matrix3(), b = new THREE.Vector3(), x = new THREE.Vector3();
  for (let i = 0; i < planes.length; i++) for (let j = i + 1; j < planes.length; j++) for (let k = j + 1; k < planes.length; k++) {
    const A = planes[i].n, B = planes[j].n, C = planes[k].n;
    M.set(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
    if (Math.abs(M.determinant()) < 1e-4) continue;
    x.set(planes[i].d, planes[j].d, planes[k].d).applyMatrix3(M.invert());
    if (planes.every((p) => p.n.dot(x) <= p.d + 1e-5)) pts.push(x.clone());
  }
  // proportions: mostly squat boulders, some elongated, ~1 in 5 standing tall
  const tall = rand() < tallChance;
  const sx = 0.8 + rand() * 0.45, sz = 0.75 + rand() * 0.3;
  const sy = tall ? 1.05 + rand() * 0.35 : squash[0] + rand() * (squash[1] - squash[0]);
  for (const p of pts) p.set(p.x * sx, p.y * sy, p.z * sz);
  if (taper > 0) {
    // narrower toward the top (boulders sit wide on the ground); the top plane stays planar
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    for (const p of pts) { const k = 1 - taper * (p.y - y0) / (y1 - y0 || 1); p.x *= k; p.z *= k; }
  }
  const g = new ConvexGeometry(pts);
  g.computeBoundingBox();
  const c = new THREE.Vector3();
  g.boundingBox.getCenter(c);
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingBox();
  if (soft > 0) softNormals(g, soft);
  g.userData.halfHeight = (g.boundingBox.max.y - g.boundingBox.min.y) / 2;
  g.userData.radius = Math.max(g.boundingBox.max.x - g.boundingBox.min.x, g.boundingBox.max.z - g.boundingBox.min.z) / 2;
  return g;
}

/**
 * Smoothed normals for a non-indexed hull: faces are split into two classes, the flat top (n.y > topY) and
 * everything else. Each corner averages the (area-weighted) normals of the faces of its own class around its
 * position (class-wide, so the normal is continuous across the whole side: no per-face seams, no edge lines)
 * -> one rounded lump of a side, one flat top with a crisp rim. `deg` > 0 limits the merge on the sides.
 */
function softNormals(g, deg, topY = 0.8) {
  const pos = g.attributes.position, n = pos.count, cos = deg >= 180 ? -2 : Math.cos(THREE.MathUtils.degToRad(deg));
  const fn = [], key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const around = new Map();
  for (let t = 0; t < n / 3; t++) {
    a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2);
    const w = b.clone().sub(a).cross(c.clone().sub(a));   // |w| = 2·area
    fn.push(w);
    for (let k = 0; k < 3; k++) {
      const kk = key(t * 3 + k);
      if (!around.has(kk)) around.set(kk, []);
      around.get(kk).push(t);
    }
  }
  const nrm = new Float32Array(n * 3), s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = (i / 3) | 0, f = fn[t].clone().normalize(), top = f.y > topY;
    s.set(0, 0, 0);
    for (const o of around.get(key(i))) {
      const fo = fn[o], l = fo.length() || 1;
      if ((fo.y / l > topY) !== top) continue;
      if ((fo.x * f.x + fo.y * f.y + fo.z * f.z) / l >= cos) s.add(fo);
    }
    if (s.lengthSq() < 1e-12) s.copy(f);
    s.normalize();
    nrm[i * 3] = s.x; nrm[i * 3 + 1] = s.y; nrm[i * 3 + 2] = s.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
}

function rockMaterial(engine, palette, mossPal, moss, outline, seedOff, { flat = true, twoTone = false } = {}) {
  // twoTone (small pebbles): lit faces all take the hi tone, shaded faces the mid tone
  const rt = twoTone ? rampFromTones(palette[0], palette[0], palette[1]) : rampFromTones(...palette);
  const mHi = new THREE.Color(mossPal[0]), mMid = new THREE.Color(mossPal[1]), mSh = new THREE.Color(mossPal[2]);
  return toonMaterial(engine, {
    color: rt.color, ramp: rt.ramp, flatShading: flat, outline,
    uniforms: {
      uMoss: { value: new THREE.Vector3(moss, seedOff, 0) },
      uMossHi: { value: mHi }, uMossMid: { value: mMid }, uMossSh: { value: mSh },
    },
    vertexHead: 'varying vec3 vRockN;',
    vertex: /* glsl */`
      {
        vec3 rn = objectNormal;
        #ifdef USE_INSTANCING
          rn = mat3(instanceMatrix) * rn;
        #endif
        vRockN = normalize(mat3(modelMatrix) * rn);
      }`,
    fragmentHead: 'varying vec3 vRockN; uniform vec3 uMoss; uniform vec3 uMossHi, uMossMid, uMossSh;',
    tones: /* glsl */`
      if (uMoss.x < 1.0) {
        // cap: the up-facing top is mossy, the fbm only frays its edge and creeps it onto the shoulders
        vec3 rn = normalize(vRockN);
        float m = fbm(vToonWorld.xz * 2.6 + uMoss.y);
        float cap = (rn.y - 0.8) * 4.0 + (m - 0.5) * 0.9 + (0.55 - uMoss.x);
        if (rn.y > 0.66 && cap > 0.0) { toonHi = uMossHi; toonMid = uMossMid; toonSh = uMossSh; }
      }`,
  });
}

export function createRocks(engine, terrain, opts = {}) {
  const {
    count = 12, seed = 1, size = [0.35, 1.1], cluster = 0.55, palette = ROCK_PALETTE, pebblePalette = PEBBLE_PALETTE,
    moss = 0.45, mossPalette = MOSS_PALETTE, avoid = [], minSpacing = 0.3, submerged = false, bury = [0.2, 0.35],
    maxSlope = 0.8, outline = 'full', pebbleSize = [0.05, 0.14], variants = 6, kind = 'boulder', soft = true,
  } = opts;
  const outcrop = kind === 'outcrop';
  const area = opts.area ?? { x: 0, z: 0, r: terrain.size * 0.3 };
  const pebbleArea = opts.pebbleArea ?? area;
  const pebbleCount = opts.pebbles ?? count * 3;
  const rand = rng(seed * 7919 + 13);
  const group = new THREE.Group();
  group.name = 'rocks';

  const inArea = (A, r) => {
    if (A.r !== undefined) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * A.r; return [A.x + Math.cos(a) * d, A.z + Math.sin(a) * d]; }
    return [A.x - A.w / 2 + r() * A.w, A.z - A.h / 2 + r() * A.h];
  };
  const items = [];
  const free = (x, z, r) => {
    for (const a of avoid) if (Math.hypot(x - a.x, z - a.z) < a.r + r) return false;
    for (const it of items) if (it.kind !== 'pebble' && Math.hypot(x - it.x, z - it.z) < it.r + r + minSpacing * 0.5) return false;
    return true;
  };
  const _n = new THREE.Vector3();
  const okGround = (x, z, r) => {
    if (terrain.normalAt(x, z, _n).y < maxSlope) return false;
    const h = terrain.heightAt(x, z);
    if (!submerged && h < terrain.waterLevel + 0.05) return false;
    if (submerged && h < terrain.waterLevel - r * 0.9) return false;
    return true;
  };

  // geometry variants
  const geos = [], pgeos = [];
  // outcrop: blocky chamfered blocks (small 45° bevels, flat tops), stacked in place() below
  const OUTCROP = { squash: [0.45, 0.7], tilt: 0.06, bevel: [0.97, 1.05], corner: [1.12, 1.25], drop: 0.15, chips: [0, 1] };
  // soft boulder: nearly every 45° bevel kept (they merge into rounded sides), corners cut lightly, a lowered
  // top plane -> one broad flat top facet (moss cap, cream rim), few chips
  const SOFT = { squash: [0.62, 0.85], tilt: 0.14, bevel: [0.84, 0.94], corner: [1.0, 1.12], drop: 0.05, chips: [0, 1], top: 0.8, soft: 180, tallChance: 0.08, taper: 0.22 };
  const softRocks = soft && !outcrop;
  if (softRocks) {
    // soft shapes come from their own stream; the main stream is advanced exactly as the faceted builder
    // would, so boulder placement (and every scene composed around it) does not move
    const grand = rng(seed * 7919 + 101);
    for (let i = 0; i < variants; i++) { rockGeometry(rand, {}).dispose(); geos.push(rockGeometry(grand, SOFT)); }
  } else for (let i = 0; i < variants; i++) geos.push(rockGeometry(rand, outcrop ? OUTCROP : {}));
  for (let i = 0; i < 3; i++) pgeos.push(rockGeometry(rand, { squash: [0.5, 0.75], drop: 0.5, tilt: 0.2 }));

  // ---- placement
  const place = (x, z, r, kind) => {
    const vi = Math.floor(rand() * (kind === 'pebble' ? pgeos.length : geos.length));
    const g = (kind === 'pebble' ? pgeos : geos)[vi];
    const s = r / g.userData.radius;
    const hh = g.userData.halfHeight * s;
    const b = bury[0] + rand() * (bury[1] - bury[0]);
    // lowest ground under the footprint, so no edge floats on a slope
    let hmin = terrain.heightAt(x, z);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      hmin = Math.min(hmin, terrain.heightAt(x + Math.cos(a) * r * 0.75, z + Math.sin(a) * r * 0.75));
    }
    const y = hmin + hh * (1 - 2 * b);
    const yaw = Math.floor(rand() * 8) * Math.PI / 4;
    const tilt = (rand() - 0.5) * 0.08, tilt2 = (rand() - 0.5) * 0.08;
    items.push({ x, z, y, r, kind, vi, s, yaw, tilt, tilt2, tone: 0.93 + rand() * 0.12 });
  };
  let guard = 0;
  for (let n = 0; n < count && guard < count * 60; guard++) {
    const [x, z] = inArea(area, rand);
    const r = size[0] + Math.pow(rand(), 1.6) * (size[1] - size[0]);
    if (!okGround(x, z, r) || !free(x, z, r)) continue;
    place(x, z, r, 'boulder'); n++;
    if (outcrop) {
      // 1-3 smaller blocks stacked on / leaning against the base block, offset on 45° directions
      const base = items[items.length - 1], g0 = geos[base.vi];
      const levels = 1 + Math.floor(rand() * 3);
      let top = base.y + g0.userData.halfHeight * base.s, rr = r;
      for (let k = 0; k < levels; k++) {
        rr *= 0.55 + rand() * 0.2;
        const a = Math.floor(rand() * 8) * Math.PI / 4, off = r * (0.15 + rand() * 0.35);
        const vi = Math.floor(rand() * geos.length), g = geos[vi], sc = rr / g.userData.radius;
        const hh = g.userData.halfHeight * sc;
        items.push({ x: x + Math.cos(a) * off, z: z + Math.sin(a) * off, y: top + hh * 0.7, r: rr, kind: 'small', vi, s: sc,
          yaw: Math.floor(rand() * 8) * Math.PI / 4, tilt: (rand() - 0.5) * 0.1, tilt2: (rand() - 0.5) * 0.1, tone: 0.93 + rand() * 0.12 });
        top += hh * 1.6;
      }
    }
    if (rand() < cluster) {
      const sat = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < sat; k++) {
        const rs = r * (0.3 + rand() * 0.35), a = rand() * Math.PI * 2, d = r + rs * (0.6 + rand() * 0.6);
        const sx = x + Math.cos(a) * d, sz = z + Math.sin(a) * d;
        if (okGround(sx, sz, rs) && free(sx, sz, rs * 0.5)) place(sx, sz, rs, 'small');
      }
    }
  }
  guard = 0;
  for (let n = 0; n < pebbleCount && guard < pebbleCount * 30; guard++) {
    // half the pebbles gather around boulders, the rest scatter
    let x, z;
    const bl = items.filter((it) => it.kind !== 'pebble');
    if (bl.length && rand() < 0.5) {
      const it = bl[Math.floor(rand() * bl.length)], a = rand() * Math.PI * 2, d = it.r * (1.05 + rand() * 0.9);
      x = it.x + Math.cos(a) * d; z = it.z + Math.sin(a) * d;
    } else [x, z] = inArea(pebbleArea, rand);
    const r = pebbleSize[0] + rand() * (pebbleSize[1] - pebbleSize[0]);
    if (!okGround(x, z, r)) continue;
    if (avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r + r)) continue;
    if (items.some((it) => it.kind !== 'pebble' && Math.hypot(x - it.x, z - it.z) < it.r * 0.95)) continue;
    place(x, z, r, 'pebble'); n++;
  }

  // ---- instanced meshes (one per geometry variant and material)
  const matRock = rockMaterial(engine, palette, mossPalette, moss, outline, seed * 3.7, { flat: !softRocks });
  const matPeb = rockMaterial(engine, pebblePalette, mossPalette, 1.0, outline, 0);
  const SMALL = 0.2;    // pebbles below this radius: 2 flat tones, depth outline only (no edge highlight)
  const matPebS = rockMaterial(engine, pebblePalette, mossPalette, 1.0, 'depth', 0, { twoTone: true });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  const build = (gs, filter, mat) => {
    gs.forEach((g, vi) => {
      const list = items.filter((it) => filter(it) && it.vi === vi);
      if (!list.length) return;
      const im = new THREE.InstancedMesh(g, mat, list.length);
      list.forEach((it, i) => {
        e.set(it.tilt, it.yaw, it.tilt2, 'YXZ'); q.setFromEuler(e);
        m4.compose(p.set(it.x, it.y, it.z), q, sc.setScalar(it.s));
        im.setMatrixAt(i, m4);
        im.setColorAt(i, col.setScalar(it.tone));
      });
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
    });
  };
  build(geos, (it) => it.kind !== 'pebble', matRock);
  build(pgeos, (it) => it.kind === 'pebble' && it.r >= SMALL, matPeb);
  build(pgeos, (it) => it.kind === 'pebble' && it.r < SMALL, matPebS);
  engine.scene.add(group);

  return {
    group, items: items.map(({ x, z, y, r, kind }) => ({ x, z, y, r, kind })),
    avoid: items.filter((it) => it.kind !== 'pebble').map(({ x, z, r }) => ({ x, z, r })),
  };
}
