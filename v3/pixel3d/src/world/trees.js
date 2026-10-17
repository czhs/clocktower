// Trees, bushes and pines (t3ssel8r "jagged spheres + leaf sprites lit with the sphere normal").
// Owner: trees agent. docs/TECHNIQUES.md §6.
//
//   const tree = createTree(engine, { position, seed, height, kind, ...opts })
//     kind: 'round' (default) | 'tall' | 'bush' | 'pine'
//     opts: radius (crown R), palette {hi, mid, sh, core, tip, rim, trunk:[hi,mid,sh]} (sRGB, merged over
//           TREE_PALETTES[kind]), outline (false; true: 1-px dark silhouette line), add (true: engine.scene.add),
//           leafTexels (3.5: leaf spacing in screen texels), leafSpacing (metres, overrides leafTexels),
//           leafJitter (outward jitter, m), raiseThreshold (0.6), maxLeaves (4000), renderOrder (trees 1, bushes 0)
//     -> THREE.Group at `position` (trunk base). group.userData.tree = { kind, seed, crowns:[{c, r}], leaves, height }
//     Create trees AFTER engine.camera.set({viewHeight}) — leaf density follows the texel size.
//   const trees = scatterTrees(engine, terrain, { count, area: {x0, z0, w, h}, minDist, seed, avoid: [{x, z, r}],
//                                                kind | kinds: [...], heightRange, radiusRange, maxSlopeDeg, treeOpts })
//     -> THREE.Group[] (Poisson spacing, skips steep slopes, water and avoid circles)
//   treeUniforms(engine) -> { uLeafPush, uWind: (sway texels, gust speed, fps, frame threshold), uAtlasGrid,
//                             uLeafBands: (N·L hi, N·L mid, N·L core, world-down core), uLeafTint }
//
// Per tree (≤ 4 draw calls in the colour pass):
//   trunk   opaque, flat-shaded toon, FLAG_FULL (trunk + branches + root flares merged), casts/receives shadow
//   core    the jagged crown blobs scaled 0.85 (sphere normals), opaque, FLAG_NONE, the shadow caster. Lit with
//           the same 4-level leaf quantization as the leaves, so a gap between sprites shows the tone of the
//           leaves around it (no 1-px dark holes); the dark core tone appears only on the shade side/underside.
//   rim     (outline:true only) leaf instances with a 1-px dilated sprite and darker tones, drawn before the
//           leaves and sunk to the blob-centre depth so only a 1-px line around the canopy silhouette survives.
//   leaves  screen-aligned sprites (1 sprite texel = 1 screen texel, base snapped to a world-anchored texel
//           corner: crawl-free on whole-texel pans) at Poisson points on the 3-5 sub-crown lumps, lit at their
//           base with their lump's sphere normal and receiving the core's shadow, then quantized to exactly
//           4 levels per palette: hi (sun-facing + unshadowed; raised clumps there use the tip tone), mid, sh,
//           core (turned away from the sun or facing down). Cloud shadow drops a leaf 1-2 levels but keeps the
//           lump structure. No per-leaf / per-tree tone jitter. Transparent + depthWrite off + NoBlending,
//           FLAG_NONE. Sorted far→near (re-sorted when the camera yaw/pitch changes).
//           Leaves/core keep only uLeafTint of the global mid/shadow ramp tint (golden's blue shadow ramp would
//           turn the dark crown navy); the hi/tip tones take the full warm ramp.
//   wind    2 sprite frames swapped at ~3 fps + whole-texel crown sway (tops move most) + 1-texel bob of raised clumps
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, poissonDisk2D } from '../core/noise.js';
import { toonMaterial, rampFromTones } from '../materials/toon.js';

// ---------------------------------------------------------------------------------------------------
// Palettes (sRGB hex). Leaves [measured T Forgotten Gate], trunk [shrine refs], bush [measured].
export const TREE_PALETTES = {
  round: { hi: '#84B35B', mid: '#689763', sh: '#46726C', core: '#2F5552', tip: '#B6CC77', rim: 0.72,
    trunk: ['#8B8590', '#6B6470', '#4E4A5C'] },
  tall: { hi: '#7FAE5A', mid: '#5F8E60', sh: '#3B6464', core: '#284A4A', tip: '#ACC671', rim: 0.72,
    trunk: ['#8B8590', '#6B6470', '#4E4A5C'] },
  bush: { hi: '#87AA46', mid: '#6E944B', sh: '#4C7254', core: '#2F5248', tip: '#A9C460', rim: 0.72,
    trunk: ['#8B8590', '#6B6470', '#4E4A5C'] },
  pine: { hi: '#6FA262', mid: '#4E7F5E', sh: '#335A58', core: '#21403E', tip: '#93B86B', rim: 0.72,
    trunk: ['#7A5A5E', '#654853', '#574E68'] },
};

// Leaf sprite atlas: 8 variants (0-3 broadleaf clusters, 4-7 needle clusters) × 2 wind frames, 12×12 px cells.
const CELL = 12, NVAR = 8, NFRAME = 2;

/** Tunables shared by every tree material of an engine (attach, don't copy). */
export function treeUniforms(engine) {
  engine._treeUniforms ??= {
    uAtlasGrid: { value: new THREE.Vector2(NVAR, NFRAME) },
    uLeafPush: { value: 0.25 },                                 // view-z push so quads aren't cut by the core
    uWind: { value: new THREE.Vector4(1.0, 1.7, 3.0, 0.55) },   // x sway texels, y gust speed, z fps, w frame-swap threshold
    // leaf levels from the lump's sphere normal: hi if N·L > x, mid if N·L > y (both unshadowed), sh if N·L > z
    // and world normal y > w, else core
    uLeafBands: { value: new THREE.Vector4(0.55, 0.1, -0.2, -0.55) },
    uLeafTint: { value: 0.0 },                                   // share of the global mid/sh ramp tint leaves keep
    uLeafTipThr: { value: 0.8 },
    // x: shaded leaves facing up more than this keep the sh tone (else core); y: back light when the sun's view-z
    // is below this; z: back light rim = lit leaves whose view-normal z is below this (crown silhouette)
    uLeafShade: { value: new THREE.Vector3(0.55, -0.1, 0.35) },                                // raised clumps with N·L above this take the tip tone
  };
  return engine._treeUniforms;
}

// ---------------------------------------------------------------------------------------------------
// Small deterministic 3D value noise (local; noise.js only has 2D).
function hash3(ix, iy, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1103515245) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz, seed);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), ux), l(c(0, 1, 0), c(1, 1, 0), ux), uy),
    l(l(c(0, 0, 1), c(1, 0, 1), ux), l(c(0, 1, 1), c(1, 1, 1), ux), uy), uz);
}
function fbm3(x, y, z, seed = 0, oct = 3) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z, seed + i * 31); n += a; x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return s / n;
}

// ---------------------------------------------------------------------------------------------------
// Procedural leaf atlas (alpha only; white RGB). Built once per page.
let ATLAS = null;
export function leafAtlas() {
  if (ATLAS) return ATLAS;
  const W = CELL * NVAR, H = CELL * NFRAME;
  const A = new Uint8Array(W * H);
  const set = (cx, cy, x, y) => { if (x >= 1 && y >= 1 && x <= CELL - 2 && y <= CELL - 2) A[(cy * CELL + y) * W + cx * CELL + x] = 255; };
  for (let v = 0; v < NVAR; v++) {
    const r = rng(9100 + v * 13);
    const needle = v >= 4;
    const leaves = [];
    let knot;
    if (!needle) {
      // a clump: 3-5 pointed leaves fanning down/out from a small rounded top (t3ssel8r leaf clusters)
      const k = 3 + (v % 3 === 0 ? 2 : v % 2);
      for (let i = 0; i < k; i++) {
        const f = k === 1 ? 0.5 : i / (k - 1);
        const ang = -Math.PI / 2 + (f - 0.5) * 2.5 + (r() * 2 - 1) * 0.25;
        leaves.push({ x: 5.8 + (f - 0.5) * 2.2 + (r() - 0.5) * 0.8, y: 7.4 + (r() - 0.5) * 0.8, ang, L: 4.6 + r() * 1.4, w: 3.2 + r() * 0.7 });
      }
      if (v % 2 === 1) leaves.push({ x: 5.6 + (r() - 0.5) * 2, y: 7.0, ang: Math.PI / 2 + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.3), L: 3.6, w: 2.9 });
      knot = { x: 5.8, y: 7.6, rad: 1.6 + r() * 0.4 };
    } else {
      // needle spray: 6-8 one-pixel needles drooping from a knot
      const k = 6 + (v % 3);
      for (let i = 0; i < k; i++) {
        const f = i / (k - 1);
        const ang = -Math.PI / 2 + (f - 0.5) * 3.0 + (r() * 2 - 1) * 0.15;
        leaves.push({ x: 5.7 + (f - 0.5) * 1.6, y: 7.8, ang, L: 3.8 + r() * 2.2, w: 1.35, needle: true });
      }
      knot = { x: 5.7, y: 7.9, rad: 1.5 + r() * 0.3 };
    }
    for (let f = 0; f < NFRAME; f++) {
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const px = x + 0.5, py = y + 0.5;
        let hit = (px - knot.x) ** 2 + (py - knot.y) ** 2 < knot.rad * knot.rad;
        for (const l of leaves) {
          if (hit) break;
          const ang = l.ang + (f ? 0.2 : 0);                               // frame 1: tips swing toward +x
          const lx = l.x;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const dx = px - lx, dy = py - l.y;
          const u = dx * ca + dy * sa, w = -dx * sa + dy * ca;            // along / across the leaf
          if (u < -0.6 || u > l.L) continue;
          const t = Math.max(0, u) / l.L;
          const half = l.needle ? l.w / 2 : (l.w / 2) * (t < 0.35 ? 0.55 + 0.45 * Math.sqrt(t / 0.35) : Math.pow((1 - t) / 0.65, 0.85));
          if (Math.abs(w) <= half) hit = true;
        }
        if (hit) set(v, f, x, y);
      }
    }
  }
  // 1-px (4-neighbour) dilation for the silhouette rim sprite
  const D = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = (xx, yy) => (xx >= 0 && yy >= 0 && xx < W && yy < H ? A[yy * W + xx] : 0);
    D[y * W + x] = a(x, y) || a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1) ? 255 : 0;
  }
  const tex = (alpha) => {
    const data = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) data.set([255, 255, 255, alpha[i]], i * 4);
    const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false; t.flipY = false; t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  ATLAS = { leaf: tex(A), rim: tex(D) };
  return ATLAS;
}

// ---------------------------------------------------------------------------------------------------
// Crown shapes: jagged ellipsoid blobs and jagged cones (pine tiers). All in tree-local space.
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

function makeBlob(c, R, sy, seed, jag = 0.16) {
  const radius = (d) => R * (1 + jag * (2 * fbm3(d.x * 1.6 + 7, d.y * 1.6 + 3, d.z * 1.6 - 5, seed) - 1));
  const surf = (d, s = 1, out = new THREE.Vector3()) => {
    const r = radius(d) * s;
    return out.set(c.x + d.x * r, c.y + d.y * r * sy, c.z + d.z * r);
  };
  return {
    type: 'blob', c, R, sy,
    area: 4 * Math.PI * R * R * (0.35 + 0.65 * sy),
    top: c.y + R * sy * 1.15, bottom: c.y - R * sy * 1.15, extent: R * Math.max(1, sy) * 1.2,
    inside(p, s) {
      _a.set(p.x - c.x, (p.y - c.y) / sy, p.z - c.z);
      const len = _a.length();
      if (len < 1e-5) return true;
      return len < radius(_a.divideScalar(len)) * s;
    },
    sample(r) {
      const z = 2 * r() - 1, ph = 2 * Math.PI * r(), q = Math.sqrt(1 - z * z);
      const d = new THREE.Vector3(q * Math.cos(ph), z, q * Math.sin(ph));
      const p = surf(d);
      // sphere normal (ellipsoid gradient) mixed 0.7 / 0.3 with the jagged face normal [src T]
      const ns = new THREE.Vector3(d.x, d.y / sy, d.z).normalize();
      _t1.set(0, 1, 0); if (Math.abs(d.y) > 0.9) _t1.set(1, 0, 0);
      _t1.cross(d).normalize(); _t2.copy(d).cross(_t1);
      const p1 = surf(_a.copy(d).addScaledVector(_t1, 0.09).normalize(), 1, new THREE.Vector3());
      const p2 = surf(_b.copy(d).addScaledVector(_t2, 0.09).normalize(), 1, new THREE.Vector3());
      const nf = p1.sub(p).cross(p2.sub(p)).normalize();
      if (nf.dot(ns) < 0) nf.negate();
      // (mostly the sphere normal: the lump must read as one ball with a lit top and a dark underside)
      return { p, ns, rad: p.distanceTo(c), n: ns.clone().multiplyScalar(0.85).addScaledVector(nf, 0.15).normalize() };
    },
    core(s, cc = null, k = 0, occAt = null) {
      const g = new THREE.IcosahedronGeometry(1, 2);
      const pos = g.attributes.position, d = new THREE.Vector3(), o = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        d.fromBufferAttribute(pos, i).normalize();
        surf(d, s, o); pos.setXYZ(i, o.x, o.y, o.z);
      }
      g.deleteAttribute('uv');
      // sphere (ellipsoid-gradient) normals, like the leaves: a gap between sprites shows the same level
      const nrm = g.attributes.normal;
      const occ = new Float32Array(pos.count), lp = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        d.fromBufferAttribute(nrm, i).normalize();
        o.set(d.x, d.y / sy, d.z).normalize();
        surf(d, 1, _b).addScaledVector(o, 0.06);               // the leaf shell above this core vertex
        lp.set([_b.x, _b.y, _b.z], i * 3);
        if (occAt) occ[i] = occAt(surf(d, 1, _b), o);           // the leaves' crease test at the surface above

        if (cc && k > 0) {                                     // same lump/crown normal blend as the leaves
          _a.fromBufferAttribute(pos, i).sub(cc).normalize();
          o.multiplyScalar(1 - k).addScaledVector(_a, k).normalize();
        }
        nrm.setXYZ(i, o.x, o.y, o.z);
      }
      g.setAttribute('aOcc', new THREE.BufferAttribute(occ, 1));
      g.setAttribute('aLeafPos', new THREE.BufferAttribute(lp, 3));
      return g;
    },
  };
}

function makeCone(c, Rb, H, seed, jag = 0.14) {
  const rj = (ph, y) => Rb * (1 - y / H) * (1 + jag * (2 * fbm3(Math.cos(ph) * 1.5 + 4, y * 1.3, Math.sin(ph) * 1.5, seed) - 1));
  return {
    type: 'cone', c, R: Rb, sy: H / Rb,
    area: Math.PI * Rb * Math.hypot(Rb, H),
    top: c.y + H, bottom: c.y - 0.1, extent: Math.max(Rb, H) * 1.1,
    inside(p, s) {
      const y = p.y - c.y;
      if (y < -0.05 || y > H) return false;
      const dx = p.x - c.x, dz = p.z - c.z;
      return Math.hypot(dx, dz) < rj(Math.atan2(dz, dx), y) * s;
    },
    sample(r) {
      const y = H * (1 - Math.sqrt(r())) * 0.97, ph = 2 * Math.PI * r();
      const rr = rj(ph, y);
      const p = new THREE.Vector3(c.x + Math.cos(ph) * rr, c.y + y, c.z + Math.sin(ph) * rr);
      const ns = new THREE.Vector3(Math.cos(ph) * H, Rb, Math.sin(ph) * H).normalize();
      // the tier's lower skirt reads as the underside: tilt its normal down a bit
      if (y < H * 0.3) ns.y -= 0.9 * (1 - y / (H * 0.3));
      ns.normalize();
      return { p, ns, rad: Math.max(rr, 0.3), n: ns.clone() };
    },
    core(s) {
      const g = new THREE.ConeGeometry(1, 1, 12, 4, false);
      const pos = g.attributes.position, o = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        o.fromBufferAttribute(pos, i);
        const y = (o.y + 0.5) * H, ph = Math.atan2(o.z, o.x);
        const rr = Math.hypot(o.x, o.z) > 1e-4 ? rj(ph, Math.min(y, H * 0.999)) * s : 0;
        pos.setXYZ(i, c.x + Math.cos(ph) * rr, c.y + y, c.z + Math.sin(ph) * rr);
      }
      g.deleteAttribute('uv');
      g.computeVertexNormals();
      g.setAttribute('aOcc', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
      g.setAttribute('aLeafPos', g.attributes.position.clone());
      return g;
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Shared materials (one program each per engine + palette).
function cached(engine, key, make) {
  engine._treeMats ??= new Map();
  if (!engine._treeMats.has(key)) engine._treeMats.set(key, make());
  return engine._treeMats.get(key);
}

const LEAF_HEAD = /* glsl */`
  attribute vec3 aBase; attribute vec3 aN; attribute vec4 aVar;   // aVar: variant, phase, sway 0..1, raised 0/1
  attribute float aRad;                                           // distance of the leaf from its blob centre
  attribute vec3 aCore; attribute vec3 aTip;                     // core / sun-tip tones (linear) of this leaf's tree
  attribute float aOcc;                                           // 1 = in a crease between lumps / under a lump: -1 level
  varying vec3 vLeafCore; varying vec3 vLeafTip; varying float vLeafRaise; varying float vLeafOcc;
  uniform vec2 uAtlasGrid; uniform float uLeafPush; uniform vec4 uWind;`;

// Leaf / core lighting (fragment head). Replaces the toon band weights, shadow definition and hemispheric term
// for tree materials only (macros expand at their call sites in the lighting block, where toonNdotL / toonShadow /
// toonCloud / toonN / toonHi / toonSh are in scope), so every leaf lands on exactly one palette tone:
//   2 hi (sun-facing, unshadowed; raised clumps strongly facing the sun take the tip tone), 1 mid (lit),
//   0 sh, -1 core (turned away from the sun or facing down). Thin cloud drops one level, thick cloud two.
const LEAF_LIGHT = /* glsl */`
  uniform vec4 uLeafBands; uniform vec3 uLeafShade; uniform float uLeafTint; uniform float uLeafTipThr;
  #ifdef TREE_CORE
    uniform vec3 uLeafCore;
    #define LEAF_CORE_TONE uLeafCore
    varying float vCoreOcc;
    #define LEAF_RAISE 0.0
    #define LEAF_OCC step(0.5, vCoreOcc)
    #define LEAF_TIP_TONE hi
  #else
    varying vec3 vLeafCore; varying vec3 vLeafTip; varying float vLeafRaise; varying float vLeafOcc;
    #define LEAF_CORE_TONE vLeafCore
    #define LEAF_RAISE vLeafRaise
    #define LEAF_OCC vLeafOcc
    #define LEAF_TIP_TONE vLeafTip
  #endif
  vec3 leafRamp(vec3 ramp) { return mix(vec3(dot(ramp, vec3(0.2126, 0.7152, 0.0722))), ramp, uLeafTint); }
  vec3 leafBands(float NdotL, float shadow, float cloud, float upY, float nz, inout vec3 hi, inout vec3 sh) {
    bool lit = shadow > 0.5;
    // back light (sun behind the subject): the camera sees the crowns' shade side; only the sun-facing silhouette
    // (view normal turned away from the camera) is lit, as one hi rim in the tip tone -> dark body + bright rim
    float sunZ = dot(normalize(uSunDir), vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
    bool back = sunZ < uLeafShade.y;
    bool tip = false;
    float lv;
    // (the rim ignores cast shadows: a leaf facing the sun is never shaded by its own core, and a forest canopy
    // above the frame must not erase the rim light the scene is composed around)
    if (back ? (nz < uLeafShade.z && NdotL > uLeafBands.x) : (lit && NdotL > uLeafBands.y)) {
      lv = NdotL > uLeafBands.x ? 2.0 : 1.0;
      tip = back || (LEAF_RAISE > 0.5 && NdotL > uLeafTipThr);
    } else {
      // shade: sky-facing leaves (lump tops) keep the shadow tone, the rest (undersides, away from the sun) is core
      lv = (upY > uLeafShade.x || (NdotL > uLeafBands.z && upY > uLeafBands.w)) ? 0.0 : -1.0;
    }
    float drop = step(cloud, 0.75) + step(cloud, 0.25);           // thin cloud: -1 level
    if (drop > 1.5) lv = lv > 0.5 ? 0.0 : -1.0;                   // thick cloud: lit -> sh, shade -> core
    else lv -= drop;
    lv = max(lv - LEAF_OCC, -1.0);                                // creases / lump undersides: -1 level
    if (back && lv > 0.5 && lv < 1.5) lv = 0.0;                   // back light: no mid on the body
    if (tip && lv > 1.5) hi = LEAF_TIP_TONE;
    if (lv < -0.5) sh = LEAF_CORE_TONE;
    return lv > 1.5 ? vec3(0.0, 0.0, 1.0) : (lv > 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0));
  }
  #define bandWeights(L, c) leafBands(toonNdotL, toonShadow, toonCloud, dot(toonN, viewMatrix[1].xyz), toonN.z, toonHi, toonSh)
  #define shadowDefinition(x) 1.0
  #define hemiTerm(y) (leafRamp(uRampSh) / max(uRampSh, vec3(1e-4)))
`;
const LEAF_TONES = 'toonMid *= leafRamp(uRampMid) / max(uRampMid, vec3(1e-4));';
const LEAF_VERTEX = /* glsl */`
  vec3 leafW = (modelMatrix * vec4(aBase, 1.0)).xyz;
  float leafTq = floor(uTime * uWind.z) / uWind.z;                       // stepped time (~3 fps)
  float leafPh = dot(leafW.xz, vec2(0.31, 0.17)) + aVar.y * 0.9;         // gusts travel across the wood
  float leafG = sin(leafTq * uWind.y + leafPh) * 0.65 + sin(leafTq * uWind.y * 2.3 + leafPh * 1.7 + 1.3) * 0.35;
  float leafFrame = leafG > uWind.w ? 1.0 : 0.0;
  // silhouette leaves point outward: flip the clump (tips hang down by default) on the upper rim of the
  // crown and mirror it on the left, so the canopy edge breaks into leaf tips all the way round
  vec3 leafNv = normalize(normalMatrix * aN);
  vec2 leafUv = uv;
  if (leafNv.z < 0.5 && leafNv.y > 0.05) leafUv.y = 1.0 - leafUv.y;
  if (leafNv.x < -0.25) leafUv.x = 1.0 - leafUv.x;
  vMapUv = (leafUv + vec2(aVar.x, leafFrame)) / uAtlasGrid;
  vLeafCore = aCore; vLeafTip = aTip; vLeafRaise = aVar.w; vLeafOcc = aOcc;`;
const LEAF_VIEW = /* glsl */`
  {
    vec4 b = viewMatrix * vec4(leafW, 1.0);
    // base on a texel corner of the WORLD-anchored camera grid: the snap only sees the world position and the
    // camera rotation, so a whole-texel pan can never flip a leaf that sits near a rounding boundary (crawl)
    vec3 leafR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 leafU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    b.x = floor(dot(leafW, leafR) / uTexelWorld + 0.5) * uTexelWorld + viewMatrix[3][0];
    b.y = floor(dot(leafW, leafU) / uTexelWorld + 0.5) * uTexelWorld + viewMatrix[3][1];
    float gTree = sin(leafTq * uWind.y * 0.6 + dot(modelMatrix[3].xz, vec2(0.21, 0.13)));
    b.x += floor(gTree * uWind.x * aVar.z + 0.5) * uTexelWorld;          // whole-texel crown sway, tops move most
    b.y += aVar.w * step(0.5, fract(leafTq * 0.5 + aVar.y)) * uTexelWorld; // raised clumps bob 1 texel
    #ifdef TREE_RIM
      // rim quads sink to the blob centre depth: the opaque core hides them inside the crown, so the
      // dilated rim only survives outside the canopy silhouette (no lines between leaves)
      b.z -= aRad * max((normalMatrix * aN).z, 0.0) + 0.05;
    #else
      b.z += uLeafPush + aVar.w * 0.10;                                  // toward the camera (raised more)
    #endif
    mvPosition = b + vec4(position.xy * uTexelWorld, 0.0, 0.0);          // 1 sprite texel = 1 screen texel
  }`;

function leafMaterial(engine, rim, rimK) {
  const U = treeUniforms(engine);
  const atlas = leafAtlas();
  return cached(engine, rim ? `rim-${rimK}` : 'leaf', () => {
    const m = toonMaterial(engine, {
      map: rim ? atlas.rim : atlas.leaf, alphaTest: 0.5, transparent: true, depthWrite: false, blending: THREE.NoBlending,
      vertexColors: true, outline: 'none', toneAttributes: true, cutMod: 'aVar.w',
      lightPos: '(modelMatrix * vec4(aBase, 1.0)).xyz',
      uniforms: U, vertexHead: LEAF_HEAD, fragmentHead: rim ? '' : LEAF_LIGHT,
      objectNormal: 'objectNormal = aN;', vertex: LEAF_VERTEX, viewVertex: LEAF_VIEW,
      // rim = a darker, cooler shade of the canopy: never brighter than the mid tone (no pale halo on lit tops)
      tones: rim ? `toonHi = toonMid * ${rimK.toFixed(3)}; toonMid = mix(toonMid, toonSh, 0.5) * ${rimK.toFixed(3)}; toonSh *= ${(rimK * 0.9).toFixed(3)};` : LEAF_TONES,
      normalOverride: rim ? 'if (uPassMode == 1) discard;' : '',
    });
    m.depthWrite = false; m.blending = THREE.NoBlending;
    if (rim) m.defines.TREE_RIM = '';
    return m;
  });
}

function coreMaterial(engine, pal) {
  return cached(engine, `core-${pal.hi}-${pal.mid}-${pal.sh}-${pal.core}`, () => {
    const { color, ramp } = rampFromTones(pal.hi, pal.mid, pal.sh);
    const m = toonMaterial(engine, { color, ramp, outline: 'none', fragmentHead: LEAF_LIGHT, tones: LEAF_TONES,
      // lit, shadowed and clouded at the leaf shell above it (not 15 % deeper inside the crown), so a gap between
      // sprites shows the same level as the leaves around it
      vertexHead: 'attribute float aOcc; attribute vec3 aLeafPos; varying float vCoreOcc;', vertex: 'vCoreOcc = aOcc;',
      lightPos: '(modelMatrix * vec4(aLeafPos, 1.0)).xyz',
      uniforms: { ...treeUniforms(engine), uLeafCore: { value: new THREE.Color(pal.core) } } });
    m.defines.TREE_CORE = '';
    return m;
  });
}

function trunkMaterial(engine, tones) {
  return cached(engine, `trunk-${tones.join()}`, () => {
    const { color, ramp } = rampFromTones(...tones);
    return toonMaterial(engine, { color, ramp, flatShading: true, outline: 'full' });
  });
}

// ---------------------------------------------------------------------------------------------------
// Leaf-instance sorting (no depth write → draw far→near). Re-sorted when the camera yaw/pitch changes.
function camForward(cam) {
  return new THREE.Vector3(-Math.cos(cam.pitch) * Math.sin(cam.yaw), -Math.sin(cam.pitch), -Math.cos(cam.pitch) * Math.cos(cam.yaw));
}
function registerSorter(engine, sorter) {
  if (!engine._treeSorters) {
    engine._treeSorters = [];
    let last = '';
    engine.onUpdate(() => {
      const c = engine.camera, key = `${c.yaw.toFixed(4)},${c.pitch.toFixed(4)}`;
      if (key === last) return;
      last = key;
      const f = camForward(c);
      for (const s of engine._treeSorters) s(f);
    });
  }
  engine._treeSorters.push(sorter);
}

// ---------------------------------------------------------------------------------------------------
function crownLayout(kind, r, height, radius) {
  const shapes = [];
  const sd = () => Math.floor(r() * 1e6);
  if (kind === 'pine') {
    const h = height ?? 5 + r() * 2;
    const Rb = radius ?? h * 0.25;
    const tiers = 4 + (r() < 0.4 ? 1 : 0);
    const y0 = h * 0.24, span = h - y0;
    const step = span / (tiers + 0.6);
    for (let i = 0; i < tiers; i++) {
      const f = i / (tiers - 1);
      const rb = Rb * (1 - f * 0.68) * (0.95 + r() * 0.1);
      const hh = i === tiers - 1 ? step * 1.9 : step * 1.75;          // each tier's skirt overhangs the next
      shapes.push(makeCone(new THREE.Vector3((r() - 0.5) * 0.1, y0 + i * step, (r() - 0.5) * 0.1), rb, hh, sd(), 0.18));
    }
    return { shapes, h, trunkTop: h * 0.6, r0: 0.12 + r() * 0.05 };
  }
  if (kind === 'bush') {
    const R = radius ?? 0.7 + r() * 0.45;
    shapes.push(makeBlob(new THREE.Vector3(0, R * 0.55, 0), R, 0.78, sd(), 0.18));
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = R * (0.45 + r() * 0.3), rr = R * (0.55 + r() * 0.2);
      shapes.push(makeBlob(new THREE.Vector3(Math.cos(a) * d, rr * 0.5, Math.sin(a) * d), rr, 0.8, sd(), 0.18));
    }
    return { shapes, h: R * 1.3, trunkTop: 0, r0: 0 };
  }
  if (kind === 'tall') {
    const h = height ?? 6.5 + r() * 1.5;
    const R = radius ?? 1.8 + r() * 0.6;
    // a taller stack of leaf-ball lumps than 'round': top puff, an upper ring, a wider lower ring (crown base ~h-1.7R)
    const top = new THREE.Vector3(0, h - R * 0.62, 0);
    shapes.push(makeBlob(top, R * 0.58, 0.95, sd()));
    const a0 = r() * Math.PI * 2;
    const n1 = 3 + Math.floor(r() * 2), n2 = 4 + Math.floor(r() * 2);
    for (let i = 0; i < n1; i++) {
      const a = a0 + (i / n1) * Math.PI * 2 + (r() - 0.5) * 0.6, d = R * (0.46 + r() * 0.1), rr = R * (0.44 + r() * 0.08);
      shapes.push(makeBlob(new THREE.Vector3(Math.cos(a) * d, top.y - R * (0.24 + r() * 0.1), Math.sin(a) * d), rr, 0.9, sd()));
    }
    for (let i = 0; i < n2; i++) {
      const a = a0 + ((i + 0.5) / n2) * Math.PI * 2 + (r() - 0.5) * 0.5, d = R * (0.7 + r() * 0.1), rr = R * (0.4 + r() * 0.08);
      shapes.push(makeBlob(new THREE.Vector3(Math.cos(a) * d, top.y - R * (0.62 + r() * 0.12), Math.sin(a) * d), rr, 0.88, sd()));
    }
    return { shapes, h, trunkTop: top.y, r0: 0.17 + r() * 0.06 };
  }
  // round
  const h = height ?? 4 + r() * 1.2;
  const R = radius ?? Math.min(2.2, Math.max(1.2, h * 0.37));
  // 4-5 leaf-ball lumps: a top puff over a ring of side lumps one tier lower. Each lump is lit with its own
  // sphere normal (lit top, dark underside), so the tiers read as stacked scallops; the crown bottom sits at
  // ~0.35 h so the trunk shows below it.
  const top = new THREE.Vector3(0, h - R * 0.55, 0);
  shapes.push(makeBlob(top, R * 0.52, 0.9, sd()));                  // crown top puff
  const a0 = r() * Math.PI * 2;
  const n1 = 3 + Math.floor(r() * 2), n2 = 4 + Math.floor(r() * 2);
  for (let i = 0; i < n1; i++) {                                        // upper tier
    const a = a0 + (i / n1) * Math.PI * 2 + (r() - 0.5) * 0.5, d = R * (0.46 + r() * 0.1), rr = R * (0.4 + r() * 0.08);
    shapes.push(makeBlob(new THREE.Vector3(Math.cos(a) * d, top.y - R * (0.16 + r() * 0.1), Math.sin(a) * d), rr, 0.86, sd()));
  }
  for (let i = 0; i < n2; i++) {                                        // lower tier, offset half a step
    const a = a0 + ((i + 0.5) / n2) * Math.PI * 2 + (r() - 0.5) * 0.5, d = R * (0.7 + r() * 0.1), rr = R * (0.36 + r() * 0.08);
    shapes.push(makeBlob(new THREE.Vector3(Math.cos(a) * d, top.y - R * (0.48 + r() * 0.1), Math.sin(a) * d), rr, 0.86, sd()));
  }
  return { shapes, h, trunkTop: top.y, r0: 0.19 + r() * 0.08 };
}

function buildTrunk(kind, layout, r) {
  const geos = [];
  const { r0, trunkTop } = layout;
  if (r0 <= 0) return null;
  const sides = kind === 'pine' ? 6 : 8;
  const lean = THREE.MathUtils.degToRad(3 + r() * 3), la = Math.round(r() * 8) * Math.PI / 4;
  const top = new THREE.Vector3(Math.sin(lean) * Math.cos(la) * trunkTop, trunkTop, Math.sin(lean) * Math.sin(la) * trunkTop);
  const len = top.length();
  const add = (g, from, to) => {
    const dir = to.clone().sub(from), l = dir.length();
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, l / 2, 0));
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    g.translate(from.x, from.y, from.z);
    geos.push(g.index ? g.toNonIndexed() : g);
  };
  const cyl = new THREE.CylinderGeometry(r0 * 0.72, r0, len, sides, 2);
  cyl.rotateY(Math.PI / sides);
  add(cyl, new THREE.Vector3(0, -0.15, 0), top);
  // branches toward the satellite blobs
  if (kind !== 'pine') {
    layout.shapes.slice(1).forEach((s, i) => {
      if (i > 2) return;
      const from = top.clone().multiplyScalar(0.62 + r() * 0.15);
      const to = from.clone().lerp(s.c, 0.75);
      const th = r0 * (0.38 + r() * 0.12);
      add(new THREE.BoxGeometry(th, from.distanceTo(to), th), from, to);
    });
  }
  // root flares on 45° multiples
  const nr = 2 + Math.floor(r() * 3);
  for (let i = 0; i < nr; i++) {
    const a = (Math.floor(r() * 8) + i * 2) * Math.PI / 4;
    const from = new THREE.Vector3(0, r0 * 1.1, 0), to = new THREE.Vector3(Math.cos(a) * r0 * 1.7, -0.12, Math.sin(a) * r0 * 1.7);
    const g = new THREE.BoxGeometry(r0 * 0.6, from.distanceTo(to), r0 * 0.6);
    add(g, from, to);
  }
  const merged = mergeGeometries(geos.map((g) => { g.deleteAttribute('uv'); return g; }));
  merged.computeVertexNormals();
  return merged;
}

// ---------------------------------------------------------------------------------------------------
/** Build one tree / bush / pine. Returns a THREE.Group positioned at `position` (base of the trunk). */
export function createTree(engine, opts = {}) {
  const { position = new THREE.Vector3(), seed = 1, height, radius, kind = 'round', outline = false, add = true,
    leafSpacing, maxLeaves = 4000, renderOrder } = opts;
  const r = rng((seed * 2654435761) >>> 0 || 1);
  const pal = { ...(TREE_PALETTES[kind] ?? TREE_PALETTES.round), ...(opts.palette ?? {}) };
  const layout = crownLayout(kind, r, height, radius);
  const { shapes } = layout;
  const group = new THREE.Group();
  group.name = `tree-${kind}-${seed}`;
  group.position.copy(position);

  // trunk ---------------------------------------------------------------------------------------
  const trunkGeo = buildTrunk(kind, layout, r);
  if (trunkGeo) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMaterial(engine, pal.trunk));
    trunk.castShadow = true; trunk.receiveShadow = true;
    trunk.name = 'trunk';
    group.add(trunk);
  }

  // core (dark interior + shadow caster) -----------------------------------------------------------
  // lighting normal = the lump's sphere normal blended with the whole crown's: each lump reads as a ball (lit top,
  // dark underside) and the crown as a whole still has a lit sun side and a dark shade side
  const crownBlend = kind === 'pine' ? 0 : 0.35;
  const cc = shapes.reduce((a, sh) => a.add(sh.c), new THREE.Vector3()).divideScalar(shapes.length);
  // creases: a point just outside another lump (where two lumps meet) or on its own lump's underside drops one
  // level -> each lump is outlined by a darker scallop seam, like t3ssel8r's stacked leaf balls (leaves + core)
  const creaseK = opts.crease ?? (kind === 'pine' ? 0 : 1.2), creaseUnder = kind === 'pine' ? 2 : 0.45;
  const creaseAt = (si) => (p, ns) => {
    if (ns.y < -creaseUnder) return 1;
    for (let j = 0; j < shapes.length; j++) if (j !== si && creaseK > 0 && shapes[j].inside(p, creaseK)) return 1;
    return 0;
  };
  const core = new THREE.Mesh(mergeGeometries(shapes.map((s, si) => s.core(0.85, cc, crownBlend, creaseAt(si)))), coreMaterial(engine, pal));
  core.castShadow = true; core.receiveShadow = true; core.name = 'core';
  group.add(core);

  // leaves: Poisson dart throwing on the union of the shape surfaces -------------------------------
  // sprites are a fixed number of screen texels, so the spacing is defined in texels (≈4.5 px apart)
  const tw = engine.camera.texelWorld || 10 / 360;
  const spacing = leafSpacing ?? THREE.MathUtils.clamp(tw * (opts.leafTexels ?? 3.5), 0.07, 0.3);
  const cell = spacing / Math.sqrt(3), grid = new Map(), pts = [];
  const key = (x, y, z) => ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
  const totalArea = shapes.reduce((a, sh) => a + sh.area, 0);
  for (let si = 0; si < shapes.length; si++) {
    const sh = shapes[si];
    const budget = Math.ceil(maxLeaves * sh.area / totalArea);   // per-shape cap: later blobs never starve
    const tries = Math.ceil((sh.area / (spacing * spacing)) * 4);
    let got = 0;
    for (let k = 0; k < tries && got < budget; k++) {
      const s = sh.sample(r);
      const { p } = s;
      let hidden = false;
      for (let j = 0; j < shapes.length && !hidden; j++) if (j !== si && shapes[j].inside(p, 0.94)) hidden = true;
      if (hidden) continue;
      const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
      let ok = true;
      for (let dx = -2; dx <= 2 && ok; dx++) for (let dy = -2; dy <= 2 && ok; dy++) for (let dz = -2; dz <= 2 && ok; dz++) {
        const q = grid.get(key(cx + dx, cy + dy, cz + dz));
        if (q && q.distanceToSquared(p) < spacing * spacing) ok = false;
      }
      if (!ok) continue;
      grid.set(key(cx, cy, cz), p);
      pts.push({ ...s, si });
      got++;
    }
  }

  const yMin = Math.min(...shapes.map((s) => s.bottom)), yMax = Math.max(...shapes.map((s) => s.top));
  r();                                                       // (was a per-tree tone jitter: keeps the rng stream)
  const lin = (hex) => new THREE.Color(hex);                 // exact palette tones: no per-tree / per-leaf jitter
  const cHi = lin(pal.hi), cMid = lin(pal.mid), cSh = lin(pal.sh), cTip = lin(pal.tip), cCore = lin(pal.core);
  const raiseThr = opts.raiseThreshold ?? 0.6;
  const jitterOut = opts.leafJitter ?? (kind === 'bush' ? 0.12 : 0.22);
  const rs = Math.floor(r() * 1000);
  const leaves = pts.map((l) => {
    const raised = fbm3(l.p.x * 2.2, l.p.y * 2.2, l.p.z * 2.2, rs) > raiseThr ? 1 : 0;
    // random outward jitter breaks the silhouette into protruding clumps; raised clumps stick out further [src H]
    const base = l.p.clone().addScaledVector(l.ns, 0.03 + r() * r() * jitterOut + raised * jitterOut * 0.5);
    const variant = Math.floor(r() * 4) + (kind === 'pine' ? 4 : 0);
    const occ = creaseAt(l.si)(l.p, l.ns);
    const n = l.n.clone().multiplyScalar(1 - crownBlend).addScaledVector(_a.copy(l.p).sub(cc).normalize(), crownBlend).normalize();
    return { base, n, occ, rad: l.rad, variant, phase: r(), sway: THREE.MathUtils.clamp((base.y - yMin) / Math.max(0.1, yMax - yMin), 0, 1) ** 1.5, raised };
  });

  const N = leaves.length;
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(CELL, CELL);
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  geo.setAttribute('normal', quad.attributes.normal);
  const A = {
    aBase: new Float32Array(N * 3), aN: new Float32Array(N * 3), aVar: new Float32Array(N * 4), aRad: new Float32Array(N),
    color: new Float32Array(N * 3), toneHi: new Float32Array(N * 3), toneSh: new Float32Array(N * 3), aCore: new Float32Array(N * 3),
    aTip: new Float32Array(N * 3), aOcc: new Float32Array(N),
  };
  const size = { aBase: 3, aN: 3, aVar: 4, aRad: 1, color: 3, toneHi: 3, toneSh: 3, aCore: 3, aTip: 3, aOcc: 1 };
  for (const k in A) geo.setAttribute(k, new THREE.InstancedBufferAttribute(A[k], size[k]));
  geo.instanceCount = N;
  const crownC = new THREE.Vector3(0, (yMin + yMax) / 2, 0);
  const crownR = Math.max(...shapes.map((s) => s.c.distanceTo(crownC) + s.extent)) + 0.8;
  geo.boundingSphere = new THREE.Sphere(crownC, crownR);
  geo.boundingBox = new THREE.Box3().setFromCenterAndSize(crownC, new THREE.Vector3(1, 1, 1).multiplyScalar(crownR * 2));

  const fill = (order) => {
    order.forEach((l, i) => {
      A.aBase.set([l.base.x, l.base.y, l.base.z], i * 3);
      A.aN.set([l.n.x, l.n.y, l.n.z], i * 3);
      A.aVar.set([l.variant, l.phase, l.sway, l.raised], i * 4);
      A.aRad[i] = l.rad;
      A.aOcc[i] = l.occ;
      A.color.set([cMid.r, cMid.g, cMid.b], i * 3);
      A.toneHi.set([cHi.r, cHi.g, cHi.b], i * 3);
      A.aTip.set([cTip.r, cTip.g, cTip.b], i * 3);
      A.toneSh.set([cSh.r, cSh.g, cSh.b], i * 3);
      A.aCore.set([cCore.r, cCore.g, cCore.b], i * 3);
    });
    for (const k in A) geo.attributes[k].needsUpdate = true;
  };
  const sortFor = (fwd) => {
    // far → near along the view direction; raised clumps count as 0.10 m nearer
    const d = leaves.map((l) => l.base.dot(fwd) - l.raised * 0.1);
    const idx = leaves.map((_, i) => i).sort((a, b) => d[b] - d[a]);
    fill(idx.map((i) => leaves[i]));
  };
  sortFor(camForward(engine.camera));
  registerSorter(engine, sortFor);

  const order = renderOrder ?? (kind === 'bush' ? 0 : 1);   // canopies above the grass: draw after grass chunks
  if (outline) {
    const rim = new THREE.Mesh(geo, leafMaterial(engine, true, pal.rim ?? 0.72));
    rim.castShadow = false; rim.receiveShadow = true; rim.renderOrder = order; rim.name = 'leaf-rim';
    group.add(rim);                                         // created before the leaves → drawn first
  }
  const leafMesh = new THREE.Mesh(geo, leafMaterial(engine, false));
  leafMesh.castShadow = false; leafMesh.receiveShadow = true; leafMesh.renderOrder = order; leafMesh.name = 'leaves';
  group.add(leafMesh);

  group.userData.tree = { kind, seed, crowns: shapes.map((s) => ({ c: s.c.clone(), r: s.R })), leaves: N, height: layout.h };
  if (add) engine.scene.add(group);
  return group;
}

// ---------------------------------------------------------------------------------------------------
/**
 * Scatter trees on a terrain. Poisson spacing `minDist`, skips slopes steeper than maxSlopeDeg and the
 * `avoid` circles. Returns the created groups (already added to the scene).
 */
export function scatterTrees(engine, terrain, opts = {}) {
  const size = terrain.size ?? 48;
  const { count = 8, minDist = 4, seed = 1, avoid = [], maxSlopeDeg = 30, heightRange, radiusRange,
    area = { x0: -size * 0.4, z0: -size * 0.4, w: size * 0.8, h: size * 0.8 }, sink = 0.12 } = opts;
  const kinds = opts.kinds ?? [opts.kind ?? 'round'];
  const r = rng(seed * 7919 + 13);
  const cosMax = Math.cos(THREE.MathUtils.degToRad(maxSlopeDeg));
  const pts = poissonDisk2D({ x0: area.x0, z0: area.z0, w: area.w, h: area.h, r: minDist, seed: seed * 31 + 7 })
    .filter(([x, z]) => {
      if (avoid.some((a) => (x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r)) return false;
      if (terrain.normalAt && terrain.normalAt(x, z).y < cosMax) return false;
      if (terrain.waterLevel !== undefined && terrain.heightAt(x, z) < terrain.waterLevel + 0.2) return false;
      return true;
    });
  // deterministic shuffle, then take `count`
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  return pts.slice(0, count).map(([x, z], i) => {
    const kind = kinds[Math.floor(r() * kinds.length)];
    const height = heightRange ? heightRange[0] + r() * (heightRange[1] - heightRange[0]) : undefined;
    const radius = radiusRange ? radiusRange[0] + r() * (radiusRange[1] - radiusRange[0]) : undefined;
    return createTree(engine, {
      ...opts.treeOpts, kind, height, radius, seed: seed * 1000 + i * 17 + 1,
      position: new THREE.Vector3(x, terrain.heightAt(x, z) - sink, z),
    });
  });
}
