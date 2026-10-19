// Town building kit (owner: town foundation lead). docs/TOWN.md §5. Piece owners may use, wrap or ignore it.
//
// ONE IDEA: a piece accumulates all its static geometry in a Builder (local metres, y up, origin wherever the
// piece likes) and emits ONE merged mesh per material layer -> a whole cottage is 2-3 draw calls. Colour lives
// in per-vertex tones ([hi, mid, sh] ramps from palette.js), and wall / roof texture is a world-anchored,
// screen-exact (1-px) procedural pattern chosen per vertex - so every building in town shares 3 shader programs.
//
//   const b = new Builder(engine);
//   b.box(5, 2.6, 4, { at: [0, 0, 0], tones: 'plaster', pattern: 'plaster' });   // base at y = 0, centred in x/z
//   gableRoof(b, { w: 5, d: 4, eave: 2.6, ridge: 4.6, kind: 'slate' });
//   const win = window_(b, { at: [1.4, 1.5, 2.0], w: 0.7, h: 0.9, shutters: paintRamp('#6b2f2f') });
//   const smoke = chimney(b, { at: [1.8, -0.8], base: 3.0, top: 5.4 });
//   const group = b.build();                       // THREE.Group with <= 3 meshes (solid, soft, glass)
//   const d = door(engine, { w: 1.0, h: 2.0, hinge: 'left' }); d.pivot.position.set(...); group.add(d.pivot);
//
// LAYERS (shared, cached materials per engine):
//   'solid' outline 'full'  - walls, roofs, trim (default)
//   'soft'  outline 'depth' - organic bits that must not get cream edge rims (thatch bundles, flowers, ivy, hay)
//   'glass' outline 'none'  - window panes / lantern cores / door-interior backs: toon-lit dark glass by day,
//           EMISSIVE at night (writes rtScene.a = 0, the PIPELINE emissive rule, so fog / god rays leave it alone).
//           Per-vertex glow colour + kind (opts.glow: hex; opts.glowKind 1 = steady window, 2 = flickering flame,
//           0 = never glows). Global switch: setNightGlow(engine, f) (scenes/town.js calls it per time of day);
//           per piece: setGlowLit(mesh, bool) (unlit / boarded houses).
// PATTERNS (opts.pattern): none plaster ashlar brick boards vboards shingle thatch rubble logs scales planks
//   world-anchored on each face's own plane (u = horizontal along the face, v = up / up-slope), lines are exactly
//   1 screen pixel (fwidth) and fade out when their period drops below 3 px (overview camera -> no moiré).
//   opts.scale multiplies the pattern period. Patterns only darken/lighten the face's own ramp (palette-safe).
// TONES (opts.tones): a palette ramp name ('stone'), an [hi, mid, sh] hex array (paintRamp(...)), or a single hex
//   (flat accent: hi = mid = hex, sh = cool derivative). opts.tint scales all three (keep within 0.94..1.06).
// TRANSFORMS: b.push(matrix) / b.pop() - every add() is pre-multiplied by the current stack; M({at, ry, rx, rz, s}).
// HELPERS: box, hexa, prism, cylinder, add (any BufferGeometry) | gableRoof, hipRoof, wallWithOpenings, window_,
//   doorway, door, chimney, steps, flowerBox, lantern, timbers, frameOf (house local frame from a layout record).
// FRAMES: window_(), lantern(), doorway(), chimney() return points in the CURRENT (pushed) frame, not the builder
//   root: inside b.push(...) convert them yourself (b.matrix.clone() at call time, or kit.toRoot(b, v)).
// OPTIONS added in the integration round (defaults unchanged): gableRoof/hipRoof {courses: false} (one slab per side,
//   no stepped courses: small dormers / hoods), gableRoof {bargeboards: true | {w, h, tones}} (a flat board per rake
//   over the course ends), Builder.build({layers: {soft: {castShadow: false}}}) per-layer shadow flags, door {swing:
//   'in'|'out', maxAngle, pivotInset, strap}, lantern {glass, lightOut, lightDown, nudge}.
// Units: metres; at the gameplay camera 1 texel = 12/360 = 0.0333 m (TEXEL). Relief offsets of 1-2 texels give the
// t3ssel8r outline-below / cream-rim-on-top pair; anything thinner than ~1 texel just flickers in and out.
import * as THREE from 'three';
import { toonMaterial } from '../materials/toon.js';
import { rng } from '../core/noise.js';
import { TOWN_PALETTE, ramp as palRamp } from './palette.js';

export const TEXEL = 12 / 360;          // world size of one texel at the gameplay camera (viewHeight 12)
export const PATTERN = { none: 0, plaster: 1, ashlar: 2, brick: 3, boards: 4, vboards: 5, shingle: 6, thatch: 7, rubble: 8, logs: 9, scales: 10, planks: 11 };
const ROOF = {
  slate: { ramp: 'slate', pattern: 'shingle', course: 0.26, thick: 0.07, lift: 0.035 },
  red: { ramp: 'red', pattern: 'shingle', course: 0.24, thick: 0.07, lift: 0.035 },
  blue: { ramp: 'blue', pattern: 'shingle', course: 0.26, thick: 0.07, lift: 0.035 },
  plum: { ramp: 'plum', pattern: 'scales', course: 0.26, thick: 0.07, lift: 0.035 },
  moss: { ramp: 'moss', pattern: 'shingle', course: 0.28, thick: 0.08, lift: 0.04, patches: { ramp: 'mossTuft', chance: 0.22 } },
  thatch: { ramp: 'thatch', pattern: 'thatch', course: 0.42, thick: 0.16, lift: 0.07, layer: 'soft' },
  copper: { ramp: 'copper', pattern: 'vboards', course: 0.5, thick: 0.05, lift: 0.0 },
};
export const ROOF_KINDS = ROOF;

// ------------------------------------------------------------------------------------------------ tones
const _c = new THREE.Color();
const SLATE = new THREE.Color('#3A3F5C');
/** {hi, mid, sh} linear Colors from a ramp spec (name | [hi, mid, sh] | single hex | {hi, mid, sh}). */
export function toTones(spec, tint = 1) {
  let hi, mid, sh;
  if (typeof spec === 'string' && spec.startsWith('#')) {
    mid = new THREE.Color(spec); hi = mid.clone(); sh = mid.clone().multiplyScalar(0.55).lerp(SLATE, 0.3);
  } else if (typeof spec === 'string' || Array.isArray(spec)) {
    const a = typeof spec === 'string' ? palRamp(spec) : spec;
    hi = new THREE.Color(a[0]); mid = new THREE.Color(a[1]); sh = new THREE.Color(a[2]);
  } else { hi = spec.hi.clone(); mid = spec.mid.clone(); sh = spec.sh.clone(); }
  if (tint !== 1) { hi.multiplyScalar(tint); mid.multiplyScalar(tint); sh.multiplyScalar(tint); }
  return { hi, mid, sh };
}

/** Matrix from {at:[x,y,z], ry, rx, rz, s} (rotation order Y * X * Z, then translate). */
export function M({ at = [0, 0, 0], ry = 0, rx = 0, rz = 0, s = 1 } = {}) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  if (s !== 1) m.multiply(new THREE.Matrix4().makeScale(...(Array.isArray(s) ? s : [s, s, s])));
  m.setPosition(at[0], at[1], at[2]);
  return m;
}
/** Wall-normal name -> yaw that turns local +z onto it. */
export const NORMAL_RY = { '+z': 0, '+x': Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 };

// ------------------------------------------------------------------------------------------------ materials
const KIT = new WeakMap();
function kitState(engine) {
  let s = KIT.get(engine);
  if (!s) KIT.set(engine, (s = { mats: {}, uGlow: { value: 0 } }));
  return s;
}

const PATTERN_GLSL = /* glsl */`
varying vec2 vKitPat; varying vec3 vKitWN;
float kitLine(float v, float period, float fw) {          // 1 on a 1-px line at the start of each period
  if (period < 3.0 * fw) return 0.0;                      // < 3 px per period: no lines (overview, no moire)
  return step(fract(v / period) * period, fw);
}
float kitTint(vec2 cell, float salt) {                    // 3-level per-block tint (crisp, never noise)
  float h = hash12(cell + salt * 13.7);
  return h < 0.22 ? 0.95 : (h > 0.82 ? 1.05 : 1.0);
}
float kitBlocks(vec2 uv, vec2 fw, float ch, float bw, float joint, float salt) {
  float row = floor(uv.y / ch);
  float u = uv.x + mod(row, 2.0) * 0.5 * bw;
  float f = (ch > 3.0 * fw.y) ? kitTint(vec2(floor(u / bw), row), salt) : 1.0;
  if (kitLine(uv.y, ch, fw.y) > 0.5 || kitLine(u, bw, fw.x) > 0.5) f = joint;
  return f;
}
float kitPattern(vec3 p, vec3 n, float kind, float sc) {
  int k = int(kind + 0.5);
  if (k == 0) return 1.0;
  vec3 t = abs(n.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), n));
  vec3 b = normalize(cross(n, t));
  // + a non-lattice phase: joints at round metric values would otherwise sit exactly on pixel centres (texel grid
  // anchored at the origin: centres at odd multiples of 1/60 m at the gameplay zoom) -> ties that flicker on a pan
  vec2 uv = (vec2(dot(p, t), dot(p, b)) + vec2(0.0037, 0.0061)) / max(sc, 1e-3);
  vec2 fw = max(fwidth(uv), vec2(1e-5));
  if (k == 1) {                                           // plaster: big soft stains, 2 tones
    return vnoise(uv * 1.1 + 3.1) > 0.68 ? 0.95 : 1.0;
  } else if (k == 2) { return kitBlocks(uv, fw, 0.32, 0.58, 0.76, 2.0);          // ashlar
  } else if (k == 3) { return kitBlocks(uv, fw, 0.15, 0.32, 0.74, 3.0);          // brick
  } else if (k == 4) {                                    // horizontal weatherboards: lap shadow + lit lip
    float bh = 0.21;
    if (bh < 3.0 * fw.y) return 1.0;
    float r = fract(uv.y / bh) * bh;
    return r < fw.y ? 0.7 : (r < 2.0 * fw.y ? 1.07 : 1.0);
  } else if (k == 5) {                                    // vertical boards (board-and-batten, doors, copper seams)
    float f = (0.18 > 3.0 * fw.x) ? kitTint(vec2(floor(uv.x / 0.18), 0.0), 5.0) : 1.0;
    return kitLine(uv.x, 0.18, fw.x) > 0.5 ? 0.72 : f;
  } else if (k == 6) { return kitBlocks(uv, fw, 0.26, 0.30, 0.8, 6.0);           // shingles / tiles (roofs)
  } else if (k == 7) {                                    // thatch: straw streaks + bundle rows
    float h = hash12(vec2(floor(uv.x / 0.07), floor(uv.y / 0.42)) + 7.0);
    float f = (0.07 > 2.0 * fw.x) ? (h < 0.3 ? 0.92 : (h > 0.86 ? 1.06 : 1.0)) : 1.0;
    return kitLine(uv.y, 0.42, fw.y) > 0.5 ? 0.84 : f;
  } else if (k == 8) {                                    // rubble: voronoi fieldstones with 1-px joints
    vec2 q = uv / 0.3, i = floor(q), f = q - i; float d1 = 9.0, d2 = 9.0; vec2 c1 = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(hash12(i + g + vec2(31.0, 7.0)), hash12(i + g + vec2(5.0, 113.0))) * 0.8 + 0.1;
      vec2 r = g + o - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; c1 = i + g; } else if (d < d2) d2 = d;
    }
    float edge = (sqrt(d2) - sqrt(d1)) * 0.3;            // metres-ish (pattern units) to the cell border
    float px = max(fw.x, fw.y);
    if (0.3 < 3.0 * px) return 1.0;
    return edge < px * 1.2 ? 0.72 : kitTint(c1, 8.0);
  } else if (k == 9) {                                    // logs: dark seam + lower half of each log a step darker
    float lh = 0.26;
    if (lh < 3.0 * fw.y) return 1.0;
    float r = fract(uv.y / lh) * lh;
    return r < fw.y ? 0.62 : (r < lh * 0.38 ? 0.9 : 1.0);
  } else if (k == 10) {                                   // fish scales: staggered rows of round tile butts
    float rh = 0.17, sw = 0.22;
    if (rh < 4.0 * fw.y) return 1.0;
    float row = floor(uv.y / rh);
    float u = uv.x + mod(row, 2.0) * 0.5 * sw;
    vec2 c = vec2((floor(u / sw) + 0.5) * sw, row * rh + rh);
    float d = length(vec2((u - c.x) * 1.0, (uv.y - c.y) * 0.9));
    float f = kitTint(vec2(floor(u / sw), row), 10.0);
    return (abs(d - sw * 0.55) < max(fw.x, fw.y) && uv.y < c.y) ? 0.74 : f;
  } else if (k == 11) {                                   // floor / deck planks along u
    return kitBlocks(uv.yx, fw.yx, 0.16, 1.1, 0.74, 11.0);
  }
  return 1.0;
}
`;

const GLOW_GLSL = /* glsl */`
uniform float uKitGlow;
varying vec4 vKitGlow;
float kitFlicker(vec3 p) {                                // stepped 8 fps flame flicker, 4 levels, per light
  float k = floor(uTime * 8.0) + floor(hash12(floor(p.xz * 2.0)) * 50.0);
  float h = fract(sin(k * 12.9898) * 43758.5453);
  return h < 0.25 ? 0.78 : (h < 0.5 ? 0.88 : (h < 0.75 ? 0.95 : 1.0));
}
`;

/** Shared kit material for a layer ('solid' | 'soft' | 'glass'), cached per engine (3 programs for the town). */
export function kitMaterial(engine, layer = 'solid') {
  const st = kitState(engine);
  if (st.mats[layer]) return st.mats[layer];
  const glass = layer === 'glass';
  const opts = {
    color: 0xffffff, vertexColors: true, toneAttributes: true, flatShading: true,
    outline: glass ? 'none' : layer === 'soft' ? 'depth' : 'full',
    vertexHead: `attribute vec2 aPat; varying vec2 vKitPat; varying vec3 vKitWN;${glass ? ' attribute vec4 aGlow; varying vec4 vKitGlow;' : ''}`,
    vertex: `vKitPat = aPat; vKitWN = normalize(mat3(modelMatrix) * objectNormal);${glass ? ' vKitGlow = aGlow;' : ''}`,
    fragmentHead: PATTERN_GLSL + (glass ? GLOW_GLSL : ''),
    uniforms: glass ? { uKitGlow: st.uGlow } : {},
    tones: /* glsl */`
      {
        float pf = kitPattern(vToonWorld, normalize(vKitWN), vKitPat.x, vKitPat.y);
        toonHi *= pf; toonMid *= pf; toonSh *= pf;
        ${glass ? `
        float gk = vKitGlow.a;
        if (gk > 0.5 && uKitGlow > 0.5) {               // emissive: flat glow colour, rtScene.a = 0
          float fl = gk > 1.5 ? kitFlicker(vToonWorld) : 1.0;
          totalEmissiveRadiance = vKitGlow.rgb * fl;
          toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0);
          diffuseColor.a = 0.0;
        } else diffuseColor.a = 1.0;` : ''}
      }`,
  };
  const mat = toonMaterial(engine, opts);
  if (glass) {
    // not OPAQUE (so the shader's alpha survives), but a pure replace: alpha 0 marks emissive texels in rtScene
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.ZeroFactor;
    mat.blendEquationAlpha = THREE.AddEquation; mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.ZeroFactor;
  }
  mat.name = `town-kit-${layer}`;
  st.mats[layer] = mat;
  return mat;
}

/** Night switch for every kit glass texel (0 = day glass, 1 = glowing). scenes/town.js sets it per time of day. */
export function setNightGlow(engine, f) { kitState(engine).uGlow.value = f; }
export function nightGlow(engine) { return kitState(engine).uGlow.value; }

/** Turn a built glass mesh's glow on/off (per piece: an unlit / boarded house). Keeps each vertex's kind. */
export function setGlowLit(mesh, lit) {
  const a = mesh?.geometry?.getAttribute('aGlow');
  if (!a) return;
  const keep = mesh.userData.glowKinds ??= Float32Array.from({ length: a.count }, (_, i) => a.getW(i));
  for (let i = 0; i < a.count; i++) a.setW(i, lit ? keep[i] : 0);
  a.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------------ Builder
const HEXA_FACES = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]];

export class Builder {
  constructor(engine, { name = 'kit' } = {}) {
    this.engine = engine; this.name = name; this.layers = {}; this.stack = [new THREE.Matrix4()];
  }
  get matrix() { return this.stack[this.stack.length - 1]; }
  /** Push a local frame (Matrix4 or M() options); everything added until pop() is transformed by it. */
  push(m) { this.stack.push(this.matrix.clone().multiply(m.isMatrix4 ? m : M(m))); return this; }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }

  _layer(name) {
    return (this.layers[name] ??= { pos: [], col: [], hi: [], sh: [], pat: [], glow: [], part: [], partS: [] });
  }
  /** Raw triangles (flat array of xyz, CCW = outward) in the current frame. */
  tris(positions, opts = {}) {
    const { tones = 'plaster', pattern = 'none', scale = 1, layer = 'solid', tint = 1, glow = null, glowKind = 1 } = opts;
    const L = this._layer(layer);
    const T = toTones(tones, tint);
    const pk = typeof pattern === 'number' ? pattern : (PATTERN[pattern] ?? 0);
    const g = glow ? new THREE.Color(glow) : null;
    const m = this.matrix, v = new THREE.Vector3();
    for (let i = 0; i < positions.length; i += 3) {
      v.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(m);
      L.pos.push(v.x, v.y, v.z);
      L.col.push(T.mid.r, T.mid.g, T.mid.b); L.hi.push(T.hi.r, T.hi.g, T.hi.b); L.sh.push(T.sh.r, T.sh.g, T.sh.b);
      L.pat.push(pk, scale);
      if (layer === 'glass') L.glow.push(g ? g.r : 0, g ? g.g : 0, g ? g.b : 0, g ? glowKind : 0);
    }
    // per-primitive PART attribute (cut-away roof-off, src/town/cutaway.js): every vertex of this call carries the call's
    // centroid + 2 + its lowest y, so a lifted cottage drops whole small parts (signs, cap windows, chimney pots)
    // instead of leaving fragments of them floating under the lift plane
    {
      const n = positions.length / 3, base = L.pos.length / 3 - n;
      let cx = 0, cy = 0, cz = 0, y0 = Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = base; k < base + n; k++) {
        const x = L.pos[k * 3], y = L.pos[k * 3 + 1], z = L.pos[k * 3 + 2];
        cx += x; cy += y; cz += z; y0 = Math.min(y0, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      cx /= n; cy /= n; cz /= n;
      const ext = Math.max(x1 - x0, z1 - z0);          // horizontal size: small parts are cut whole (cutaway.js)
      for (let k = 0; k < n; k++) { L.part.push(cx, cy, cz, 2 + y0); L.partS.push(ext); }
    }
    // a mirroring frame (negative determinant) flips winding: fix it
    if (m.determinant() < 0) {
      const n = positions.length / 3, base = L.pos.length / 3 - n;
      for (let t = 0; t < n; t += 3) {
        for (const arr of [L.pos, L.col, L.hi, L.sh]) for (let c = 0; c < 3; c++) {
          const a = (base + t + 1) * 3 + c, b2 = (base + t + 2) * 3 + c; const tmp = arr[a]; arr[a] = arr[b2]; arr[b2] = tmp;
        }
      }
    }
    return this;
  }
  /** Any THREE.BufferGeometry (indexed or not) with an optional extra matrix. Faces become flat-shaded. */
  add(geometry, matrix = null, opts = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.getAttribute('position');
    const arr = new Float32Array(p.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); if (matrix) v.applyMatrix4(matrix);
      arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
    }
    if (matrix && matrix.determinant() < 0) for (let t = 0; t < arr.length; t += 9) for (let c = 0; c < 3; c++) {
      const tmp = arr[t + 3 + c]; arr[t + 3 + c] = arr[t + 6 + c]; arr[t + 6 + c] = tmp;
    }
    if (g !== geometry) g.dispose();
    return this.tris(arr, opts);
  }
  /** Convex hexahedron from 8 corners (index = x + 2y + 4z bits, like a box). Winding is fixed automatically. */
  hexa(c, opts = {}) {
    const ctr = new THREE.Vector3();
    c.forEach((p) => ctr.add(p)); ctr.multiplyScalar(1 / 8);
    const out = [];
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), fc = new THREE.Vector3();
    for (const f of HEXA_FACES) {
      let q = f.map((i) => c[i]);
      // Newell normal: robust when corners coincide (collapsed edges of prisms / hips / attic triangles)
      n.set(0, 0, 0);
      for (let i = 0; i < 4; i++) {
        const a = q[i], d2 = q[(i + 1) % 4];
        n.x += (a.y - d2.y) * (a.z + d2.z); n.y += (a.z - d2.z) * (a.x + d2.x); n.z += (a.x - d2.x) * (a.y + d2.y);
      }
      fc.copy(q[0]).add(q[1]).add(q[2]).add(q[3]).multiplyScalar(0.25);
      if (n.dot(fc.sub(ctr)) < 0) q = [q[0], q[3], q[2], q[1]];
      for (const [a, b2, d] of [[0, 1, 2], [0, 2, 3]]) {
        // skip degenerate triangles (a hexa whose top edge collapses to a line: prisms, hips)
        e1.subVectors(q[b2], q[a]); e2.subVectors(q[d], q[a]);
        if (e1.cross(e2).lengthSq() < 1e-12) continue;
        out.push(q[a].x, q[a].y, q[a].z, q[b2].x, q[b2].y, q[b2].z, q[d].x, q[d].y, q[d].z);
      }
    }
    return this.tris(out, opts);
  }
  /** Axis box w x h x d; `at` = bottom centre (origin 'bottom', default) or centre (origin 'center'). */
  box(w, h, d, opts = {}) {
    const { at = [0, 0, 0], ry = 0, rx = 0, rz = 0, origin = 'bottom' } = opts;
    const y0 = origin === 'center' ? -h / 2 : 0;
    const c = [];
    for (let i = 0; i < 8; i++) c.push(new THREE.Vector3((i & 1 ? 0.5 : -0.5) * w, y0 + (i & 2 ? h : 0), (i & 4 ? 0.5 : -0.5) * d));
    if (at[0] || at[1] || at[2] || ry || rx || rz) { const m = M({ at, ry, rx, rz }); c.forEach((p) => p.applyMatrix4(m)); }
    return this.hexa(c, opts);
  }
  /** Prism: polygon [[x, y], ...] in the local XY plane extruded `depth` along z (centred). Convex or not. */
  prism(points, depth, opts = {}) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -depth / 2);
    const { at = [0, 0, 0], ry = 0, rx = 0, rz = 0 } = opts;
    this.add(g, M({ at, ry, rx, rz }), opts);
    g.dispose();
    return this;
  }
  /** Vertical cylinder / cone frustum (segments 8 = octagon; keep segments a multiple of 4 for clean pixels). */
  cylinder(rBot, rTop, h, opts = {}) {
    const { segments = 8, at = [0, 0, 0], ry = Math.PI / segments, open = false } = opts;
    const g = new THREE.CylinderGeometry(rTop, rBot, h, segments, 1, open);
    g.translate(0, h / 2, 0);
    this.add(g, M({ at, ry }), opts);
    g.dispose();
    return this;
  }
  /** Emit THREE.Group with one mesh per non-empty layer (shared kit materials). */
  build({ castShadow = true, receiveShadow = true, name, layers = {} } = {}) {
    const group = new THREE.Group();
    group.name = name ?? this.name;
    for (const [layer, L] of Object.entries(this.layers)) {
      if (!L.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(L.pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(L.col, 3));
      g.setAttribute('toneHi', new THREE.Float32BufferAttribute(L.hi, 3));
      g.setAttribute('toneSh', new THREE.Float32BufferAttribute(L.sh, 3));
      g.setAttribute('aPat', new THREE.Float32BufferAttribute(L.pat, 2));
      if (layer === 'glass') g.setAttribute('aGlow', new THREE.Float32BufferAttribute(L.glow, 4));
      if (L.part.length === L.pos.length / 3 * 4 && L.partS.length === L.pos.length / 3) {
        g.setAttribute('aTownPart', new THREE.Float32BufferAttribute(L.part, 4));
        g.setAttribute('aTownPartS', new THREE.Float32BufferAttribute(L.partS, 1));
      }
      g.computeVertexNormals();               // non-indexed: one normal per face (flat)
      g.computeBoundingBox(); g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, kitMaterial(this.engine, layer));
      mesh.name = `${group.name}-${layer}`;
      const lo = layers[layer] ?? {};
      mesh.castShadow = layer === 'glass' ? false : (lo.castShadow ?? castShadow);
      mesh.receiveShadow = lo.receiveShadow ?? receiveShadow;
      mesh.userData.layer = layer;
      group.add(mesh);
    }
    group.userData.kitStats = this.stats();
    return group;
  }
  stats() {
    let tris = 0;
    for (const L of Object.values(this.layers)) tris += L.pos.length / 9;
    return { tris, layers: Object.keys(this.layers).filter((k) => this.layers[k].pos.length).length };
  }
}

// ------------------------------------------------------------------------------------------------ roofs
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Gable roof with stepped courses (each course's lower edge lifted ~1 texel -> one dark line + one cream rim per
 * course, the t3ssel8r roof look), ridge cap and an attic prism closing the gable ends (wall tones).
 *   {x, z} centre of the roof footprint (local), w along the ridge, d across, eave / ridge heights (the wall top and
 *   the ridge line), axis 'x' (ridge along x, slopes face +-z: a 'side' roof at yaw 0) | 'z' (gable end faces the
 *   camera), overhang (eaves), gableOverhang, kind (ROOF_KINDS) or ramp/pattern overrides, gable: tones of the
 *   attic triangle ('plaster', ...; null = no attic), gablePattern, sides: [+1, -1] (one side = lean-to), seed.
 * Returns {slope (rad), ridgeY, eaveY (lowest eave edge)}.
 */
export function gableRoof(b, opts = {}) {
  const { x = 0, z = 0, w, d, eave, ridge, axis = 'x', overhang = 0.3, gableOverhang = 0.25, kind = 'slate',
    gable = null, gablePattern = 'plaster', sides = [1, -1], seed = 1, ridgeCap = true, attic = true, courses = true, bargeboards = false } = opts;
  const K = { ...ROOF[kind] ?? ROOF.slate, ...opts.roof };
  const tones = opts.tones ?? K.ramp, pattern = opts.pattern ?? K.pattern, layer = opts.layer ?? K.layer ?? 'solid';
  const half = d / 2, rise = ridge - eave, th = Math.atan2(rise, half);
  const r = rng(seed * 7919 + 17);
  const L = w / 2 + gableOverhang;
  const run = half + overhang, slopeLen = run / Math.cos(th);
  const n = courses ? Math.max(2, Math.round(slopeLen / K.course)) : 1, cl = slopeLen / n;
  const overlap = K.lift > 0 ? 0.02 : 0;                       // lift-0 kinds (copper) must not overlap coplanar
  const y0 = eave - overhang * Math.tan(th);
  // frame: local "a" along the ridge, "p" across (perpendicular), y up
  const P = (a, p, y) => (axis === 'x' ? V3(x + a, y, z + p) : V3(x + p, y, z - a));
  for (const side of sides) {
    const nP = side * Math.sin(th), nY = Math.cos(th);           // slope outward normal (p, y)
    for (let k = 0; k < n; k++) {
      const s0 = k * cl, s1 = Math.min(slopeLen, (k + 1) * cl + overlap);
      const lift = k === n - 1 ? 0 : K.lift;
      const pAt = (s) => side * (run - s * Math.cos(th)), yAt = (s) => y0 + s * Math.sin(th);
      // split a course into 1-3 segments (patches of another ramp, slight tint changes)
      let a0 = -L;
      const segs = [];
      while (a0 < L - 1e-6) {
        const len = Math.min(L - a0, 0.8 + r() * 1.4);
        segs.push([a0, a0 + (L - a0 - len < 0.4 ? L - a0 : len)]);
        a0 = segs[segs.length - 1][1];
      }
      for (const [sa, sb] of segs) {
        const patch = K.patches && r() < K.patches.chance;
        const tint = patch ? 1 : [0.97, 1, 1, 1.03][Math.floor(r() * 4)];
        const top = (a, s, lf) => P(a, pAt(s) + nP * lf, yAt(s) + nY * lf);
        const bot = (a, s, lf) => P(a, pAt(s) + nP * (lf - K.thick), yAt(s) + nY * (lf - K.thick));
        // corners: x bit = along ridge, y bit = top/bottom surface, z bit = upper edge
        b.hexa([bot(sa, s0, lift), bot(sb, s0, lift), top(sa, s0, lift), top(sb, s0, lift),
          bot(sa, s1, 0), bot(sb, s1, 0), top(sa, s1, 0), top(sb, s1, 0)],
        { tones: patch ? K.patches.ramp : tones, pattern, layer, tint, scale: opts.scale ?? 1 });
      }
    }
  }
  if (bargeboards) {
    // one flat board per rake, standing just outside the course ends (hides the stepped end grain)
    const B = { w: 0.06, h: 0.2, tones: 'timber', ...(typeof bargeboards === 'object' ? bargeboards : {}) };
    for (const side of sides) for (const ae of [-1, 1]) {
      const a0 = ae * (L + 0.005), a1 = ae * (L + 0.005 + B.w);
      const lo = (s) => [side * (run - s * Math.cos(th)), y0 + s * Math.sin(th)];
      const [pE, yE] = lo(0), [pR, yR] = lo(slopeLen);
      const nP = side * Math.sin(th), nY = Math.cos(th), up = K.lift * 2 + 0.03;
      const c = [];
      for (let i = 0; i < 8; i++) {
        const aa = i & 1 ? a1 : a0, top = i & 2, ridgeEnd = i & 4;
        const [pp, yy] = ridgeEnd ? [pR, yR] : [pE, yE];
        const off = top ? up : up - B.h;
        c.push(P(aa, pp + nP * off, yy + nY * off));
      }
      b.hexa(c, { tones: B.tones, pattern: 'none' });
    }
  }
  if (ridgeCap && sides.length === 2) {
    const cw = 0.12, ch = 0.12;
    b.hexa([P(-L, -cw, ridge - 0.02), P(L, -cw, ridge - 0.02), P(-L, -cw, ridge + ch), P(L, -cw, ridge + ch),
      P(-L, cw, ridge - 0.02), P(L, cw, ridge - 0.02), P(-L, cw, ridge + ch), P(L, cw, ridge + ch)],
    { tones: opts.capTones ?? tones, pattern: 'none', tint: 0.9 });
  }
  if (attic && gable !== null) {
    // the attic: triangular prism under the roof (gable-end triangles in wall tones)
    const tri = sides.length === 2 ? [[-half, eave], [half, eave], [0, ridge - 0.04]] : [[0, eave], [half * sides[0], eave], [0, ridge - 0.04]];
    for (const [aA, aB] of [[-w / 2, w / 2]]) {
      const c = [];
      // hexa from the triangle (top edge collapsed): bits x=along, y=up(apex), z=across side
      const pt = (a, i) => P(a, tri[i][0], tri[i][1]);
      c.push(pt(aA, 0), pt(aB, 0), pt(aA, 2), pt(aB, 2), pt(aA, 1), pt(aB, 1), pt(aA, 2), pt(aB, 2));
      b.hexa(c, { tones: gable, pattern: gablePattern });
    }
  }
  return { slope: th, ridgeY: ridge, eaveY: y0 };
}

/**
 * Hip roof (all four sides slope; w >= d gives a ridge along x, w == d a pyramid). Same course logic as gableRoof.
 *   {x, z, w, d, eave, ridge, overhang, kind, seed, ry (rotate the whole roof about its centre)}
 */
export function hipRoof(b, opts = {}) {
  const { x = 0, z = 0, w, d, eave, ridge, overhang = 0.3, kind = 'slate', seed = 2, ry = 0, courses = true } = opts;
  const K = { ...ROOF[kind] ?? ROOF.slate, ...opts.roof };
  const tones = opts.tones ?? K.ramp, pattern = opts.pattern ?? K.pattern, layer = opts.layer ?? K.layer ?? 'solid';
  const r = rng(seed * 104729 + 3);
  const W = w / 2 + overhang, D = d / 2 + overhang;          // eave rectangle half sizes
  const rise = ridge - eave, th = Math.atan2(rise, d / 2), run = D, slopeLen = run / Math.cos(th);
  const y0 = eave - overhang * Math.tan(th);
  const n = courses ? Math.max(2, Math.round(slopeLen / K.course)) : 1, cl = slopeLen / n;
  const overlap = K.lift > 0 ? 0.02 : 0;
  const ridgeHalf = Math.max(0, W - D);
  b.push(M({ at: [x, 0, z], ry }));
  // 4 sides: [normal dir in xz, half-length of the eave edge, inset rate]
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const along = nx === 0 ? W : D;                            // eave-edge half length
    const across = nx === 0 ? D : W;                           // distance from centre to this eave
    for (let k = 0; k < n; k++) {
      const s0 = k * cl, s1 = Math.min(slopeLen, (k + 1) * cl + overlap);
      const lift = k === n - 1 ? 0 : K.lift;
      const q = (s) => s * Math.cos(th);                        // horizontal inset from the eave
      const halfAt = (s) => Math.max(nx === 0 ? ridgeHalf : 0, along - q(s));
      const pt = (t, s, lf) => {                                // t in [-1, 1] along the edge
        const h = halfAt(s) * t, dist = across - q(s);
        const px = nx === 0 ? h : nx * dist, pz = nx === 0 ? nz * dist : -h * nx;
        return V3(px + nx * Math.sin(th) * lf, y0 + s * Math.sin(th) + Math.cos(th) * lf, pz + nz * Math.sin(th) * lf);
      };
      const tint = K.patches && r() < K.patches.chance ? null : [0.97, 1, 1, 1.03][Math.floor(r() * 4)];
      const T = tint === null ? K.patches.ramp : tones;
      const lo = (t, s, lf) => pt(t, s, lf - K.thick);
      b.hexa([lo(-1, s0, lift), lo(1, s0, lift), pt(-1, s0, lift), pt(1, s0, lift), lo(-1, s1, 0), lo(1, s1, 0), pt(-1, s1, 0), pt(1, s1, 0)],
        { tones: T, pattern, layer, tint: tint ?? 1 });
    }
  }
  if (ridgeHalf > 0.05) {
    const cw = 0.12;
    b.hexa([V3(-ridgeHalf, ridge - 0.02, -cw), V3(ridgeHalf, ridge - 0.02, -cw), V3(-ridgeHalf, ridge + 0.12, -cw), V3(ridgeHalf, ridge + 0.12, -cw),
      V3(-ridgeHalf, ridge - 0.02, cw), V3(ridgeHalf, ridge - 0.02, cw), V3(-ridgeHalf, ridge + 0.12, cw), V3(ridgeHalf, ridge + 0.12, cw)],
    { tones, pattern: 'none', tint: 0.9 });
  }
  b.pop();
  return { slope: th, ridgeY: ridge, eaveY: y0 };
}

// ------------------------------------------------------------------------------------------------ walls & openings
/**
 * A wall slab in the local XY plane facing +z (front face at z = z0, back at z0 - thick), from x0..x1, y0..y1, with
 * rectangular openings [{x, y, w, h}] (x = centre, y = sill). Use b.push(M({ry: NORMAL_RY['+x'], ...})) for other
 * walls. Pattern continuity across the pieces is automatic (world-anchored).
 */
export function wallWithOpenings(b, { x0, x1, y0 = 0, y1, z0 = 0, thick = 0.3, openings = [], tones = 'plaster', pattern = 'plaster', layer, tint } = {}) {
  const o = layer ? { tones, pattern, layer, tint } : { tones, pattern, tint };
  const xs = [...new Set([x0, x1, ...openings.flatMap((q) => [q.x - q.w / 2, q.x + q.w / 2])])].sort((a, c) => a - c);
  const cz = z0 - thick / 2;
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], c = xs[i + 1], mx = (a + c) / 2, w = c - a;
    if (w < 1e-4) continue;
    const holes = openings.filter((q) => mx > q.x - q.w / 2 && mx < q.x + q.w / 2).sort((p, q) => p.y - q.y);
    let y = y0;
    for (const h of holes) {
      if (h.y - y > 1e-4) b.box(w, h.y - y, thick, { ...o, at: [mx, y, cz] });
      y = h.y + h.h;
    }
    if (y1 - y > 1e-4) b.box(w, y1 - y, thick, { ...o, at: [mx, y, cz] });
  }
  return b;
}

/**
* Window on a wall facing +z, centred at local (x, y) on the wall plane z (call inside b.push for other walls):
 * glass (glass layer: dark by day, glows at night), frame + mullions, sill, optional open shutters and arched head.
 * By default it sits ON a plain wall (no hole needed); pass inset > 0 to recess the glass into a hole you left
 * with wallWithOpenings. Returns {center, glowPos} (current frame).
 *   {at: [x, y, z], w 0.6, h 0.8, panes [2, 2], frame 'cream', shutters null | ramp, sill true, arch false,
 *    glow '#FFC46B' | null (never glows), glowKind 1 steady | 2 flicker, inset 0, bar 0.05}
 */
export function window_(b, opts = {}) {
  const { at = [0, 1.4, 0], w = 0.6, h = 0.8, panes = [2, 2], frame = 'cream', shutters = null, sill = true, arch = false,
    glow = TOWN_PALETTE.glow[1], inset = 0, bar = 0.05, glowKind = 1 } = opts;
  const [x, y, z] = at;
  const gz = z - inset;                                    // glass plane
  b.box(w, h, 0.02, { at: [x, y - h / 2, gz], tones: 'glass', layer: 'glass', glow, glowKind });
  const fr = { tones: frame, pattern: 'none' };
  const fz = z + 0.025;                                    // frame bars stand ~1.5 texels proud of the wall
  b.box(w + bar * 2, bar, 0.05 + inset, { ...fr, at: [x, y + h / 2, fz - inset / 2] });                 // head
  b.box(w + bar * 2, bar, 0.05 + inset, { ...fr, at: [x, y - h / 2 - bar, fz - inset / 2] });           // foot
  b.box(bar, h, 0.05 + inset, { ...fr, at: [x - w / 2 - bar / 2, y - h / 2, fz - inset / 2] });
  b.box(bar, h, 0.05 + inset, { ...fr, at: [x + w / 2 + bar / 2, y - h / 2, fz - inset / 2] });
  for (let i = 1; i < panes[0]; i++) b.box(bar * 0.7, h, 0.03, { ...fr, at: [x - w / 2 + (w * i) / panes[0], y - h / 2, gz + 0.02] });
  for (let j = 1; j < panes[1]; j++) b.box(w, bar * 0.7, 0.03, { ...fr, at: [x, y - h / 2 + (h * j) / panes[1] - bar * 0.35, gz + 0.02] });
  if (arch) b.prism([[-w / 2 - bar, 0], [w / 2 + bar, 0], [w / 4, w * 0.32], [-w / 4, w * 0.32]], 0.05, { ...fr, at: [x, y + h / 2 + bar, fz] });
  if (sill) b.box(w + bar * 4, 0.06, 0.16, { tones: opts.sillTones ?? 'ashlar', pattern: 'none', at: [x, y - h / 2 - bar - 0.06, z + 0.06] });
  if (shutters) {
    const sw = w / 2 + 0.02;
    for (const s of [-1, 1]) b.box(sw, h + 0.04, 0.04, { tones: shutters, pattern: 'vboards', scale: 0.5, at: [x + s * (w / 2 + bar + sw / 2 + 0.02), y - h / 2 - 0.02, z + 0.02] });
  }
  return { center: V3(x, y, z), glowPos: V3(x, y, z + 0.3) };
}

/**
 * Doorway on a wall facing +z: jambs + head (+ hood 'pent' | 'arch' | 'lintel'), a dark interior back plate in the
 * glass layer (warm hearth glow at night when the door is open) and a threshold. Leaves the hole: build the wall
 * with wallWithOpenings({openings: [{x, y: 0, w, h}]}). Returns {hingeLeft: Vector3, hingeRight: Vector3} on the
 * inner face of the opening (where door() pivots go, current frame).
 */
export function doorway(b, { at = [0, 0, 0], w = 1.0, h = 2.0, thick = 0.3, hood = 'lintel', frame = 'ashlar', hoodTones = 'slate', interior = '#2A1A20' } = {}) {
  const [x, y, z] = at;
  const fr = { tones: frame, pattern: 'none' };
  b.box(0.12, h, 0.1, { ...fr, at: [x - w / 2 - 0.06, y, z + 0.02] });
  b.box(0.12, h, 0.1, { ...fr, at: [x + w / 2 + 0.06, y, z + 0.02] });
  b.box(w + 0.36, 0.14, 0.12, { ...fr, at: [x, y + h, z + 0.03] });
  b.box(w + 0.1, 0.05, 0.36, { ...fr, at: [x, y, z + 0.06] });                              // threshold
  b.box(w, h, 0.02, { tones: interior, layer: 'glass', glow: TOWN_PALETTE.fireGlow, glowKind: 2, at: [x, y, z - thick + 0.02] });
  if (hood === 'pent') {
    b.hexa([V3(x - w / 2 - 0.3, y + h + 0.16, z), V3(x + w / 2 + 0.3, y + h + 0.16, z), V3(x - w / 2 - 0.3, y + h + 0.5, z), V3(x + w / 2 + 0.3, y + h + 0.5, z),
      V3(x - w / 2 - 0.3, y + h + 0.06, z + 0.55), V3(x + w / 2 + 0.3, y + h + 0.06, z + 0.55), V3(x - w / 2 - 0.3, y + h + 0.14, z + 0.55), V3(x + w / 2 + 0.3, y + h + 0.14, z + 0.55)],
    { tones: hoodTones, pattern: 'shingle' });
  } else if (hood === 'arch') {
    b.prism([[-w / 2 - 0.12, 0], [w / 2 + 0.12, 0], [w / 2 - 0.05, w * 0.35], [-w / 2 + 0.05, w * 0.35]], 0.12, { ...fr, at: [x, y + h + 0.14, z + 0.03] });
  }
  return { hingeLeft: V3(x - w / 2, y, z - 0.06), hingeRight: V3(x + w / 2, y, z - 0.06) };
}

/**
 * Hinged door leaf as its own small mesh (shared kit material, 1 draw call): returns {pivot: Group (place it at a
 * hinge point, rotate it with the wall), leaf, open(f)} - f 0 = closed, 1 = swung ~100 deg inward (into -z).
 *   {w 1.0, h 2.0, kind 'planks'|'panel'|'arched'|'dutch', tones ramp, hinge 'left'|'right', studs true,
 *    swing 'in'|'out' (out: toward +z), maxAngle 1.75 rad, pivotInset 0 (m, shifts the leaf off the hinge axis so a
 *    wide-open leaf clears the jamb), strap 0.05 (strap-hinge height; 0.07 avoids 1-texel flicker on turned leaves)}
 */
export function door(engine, { w = 1.0, h = 2.0, kind = 'planks', tones = 'timber', hinge = 'left', thick = 0.06, name = 'door',
  swing = 'in', maxAngle = 1.75, pivotInset = 0, strap = 0.05 } = {}) {
  const b = new Builder(engine, { name });
  const s = hinge === 'left' ? 1 : -1;                     // leaf extends along +x (left hinge) or -x
  const cx = (s * w) / 2;
  if (kind === 'arched') {
    const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, h - w * 0.3], [w * 0.3, h - w * 0.08], [0, h], [-w * 0.3, h - w * 0.08], [-w / 2, h - w * 0.3]];
    b.prism(pts, thick, { tones, pattern: 'vboards', scale: 0.6, at: [cx, 0, 0] });
  } else {
    b.box(w, h, thick, { tones, pattern: kind === 'panel' ? 'none' : 'vboards', scale: 0.6, at: [cx, 0, 0] });
    if (kind === 'panel') for (const py of [0.25, 1.1]) for (const px of [-0.22, 0.22]) b.box(w * 0.32, 0.65, 0.03, { tones, tint: 1.05, at: [cx + px * w, py, thick / 2] });
    if (kind === 'dutch') b.box(w, 0.06, 0.05, { tones, tint: 0.9, at: [cx, h * 0.5, thick / 2] });
  }
  for (const hy of [0.35, h - 0.45]) b.box(w * 0.55, strap, 0.03, { tones: 'iron', at: [s * w * 0.27, hy, thick / 2] });   // strap hinges
  b.box(0.06, 0.06, 0.06, { tones: 'brass', at: [s * (w - 0.14), h * 0.48, thick / 2 + 0.02] });                        // handle
  const leaf = b.build({ name });
  const pivot = new THREE.Group(); pivot.name = `${name}-pivot`;
  pivot.add(leaf);
  leaf.position.z = -thick / 2;
  leaf.position.x = s * pivotInset;           // pivotInset > 0: the leaf clears the jamb stone when swung wide
  const dir = swing === 'out' ? -1 : 1;
  const open = (f) => { pivot.rotation.y = dir * s * Math.max(0, Math.min(1, f)) * maxAngle; };
  return { pivot, leaf, open };
}

/** Chimney stack from y=base to y=top centred at local (x, z): body, cap course, pots. Returns the smoke anchor. */
export function chimney(b, { at = [0, 0], base = 2.5, top = 5.0, w = 0.6, d = 0.55, tones = 'stone', pattern = 'ashlar', pots = 1, potTones = 'red' } = {}) {
  const [x, z] = at;
  b.box(w, top - base, d, { tones, pattern, at: [x, base, z] });
  b.box(w + 0.1, 0.1, d + 0.1, { tones, pattern: 'none', tint: 1.05, at: [x, top, z] });
  const ph = 0.22;
  for (let i = 0; i < pots; i++) {
    const px = x + (pots === 1 ? 0 : (i - (pots - 1) / 2) * 0.24);
    b.cylinder(0.09, 0.08, ph, { at: [px, top + 0.1, z], tones: potTones });
  }
  return V3(x, top + 0.1 + ph, z);
}

/** Steps in front of a +z wall: count steps of rise x run descending toward +z from `at` (top step at the wall). */
export function steps(b, { at = [0, 0, 0], w = 1.2, count = 2, rise = 0.1, run = 0.26, tones = 'ashlar', pattern = 'none' } = {}) {
  const [x, y, z] = at;
  for (let i = 0; i < count; i++) b.box(w + i * 0.1, rise * (count - i), run, { tones, pattern, tint: i % 2 ? 0.97 : 1, at: [x, y, z + run * (i + 0.5)] });
  return b;
}

/** Planter under a +z window: plank box + 2-px leaves + single-colour flowers (soft layer, no rims). */
export function flowerBox(b, { at = [0, 1, 0], w = 0.8, seed = 1, colors = [TOWN_PALETTE.flowerRed, TOWN_PALETTE.flowerWhite, TOWN_PALETTE.flowerViolet] } = {}) {
  const [x, y, z] = at;
  const r = rng(seed * 31 + 7);
  b.box(w, 0.16, 0.18, { tones: 'plank', pattern: 'boards', at: [x, y - 0.16, z + 0.09] });
  b.box(w - 0.04, 0.08, 0.14, { tones: 'leaf', layer: 'soft', at: [x, y, z + 0.09] });
  const n = Math.max(3, Math.round(w / 0.13));
  for (let i = 0; i < n; i++) {
    const fx = x - w / 2 + 0.07 + (i * (w - 0.14)) / (n - 1);
    b.box(0.07, 0.07, 0.07, { tones: colors[Math.floor(r() * colors.length)], layer: 'soft', at: [fx, y + 0.06 + r() * 0.04, z + 0.06 + r() * 0.08] });
  }
  return b;
}

/**
 * Wall lantern on a +z wall (iron bracket + glowing flame box). Returns a light anchor {pos, color, r, kind} in the
 * current frame. Options: glass 0.12 (flame box size; 0.16-0.18 reads better than a 1-px flame), lightOut 0.24 /
 * lightDown 0.04 (anchor offset from the wall / below the bracket; out + down puts the pool on the ground, the
 * composer also pulls wall lights back to the wall plane), nudge [dx, dy, dz] (sub-texel anti-tie offset of the whole
 * lantern, e.g. [0.0031, 0.0023, 0.0017] when round authoring values tie on a whole-texel pan).
 */
export function lantern(b, { at = [0, 2.1, 0], color = TOWN_PALETTE.lampGlow, bracket = true, r = 3, glass = 0.12, lightOut = 0.24, lightDown = 0.04, nudge = null } = {}) {
  const [x, y, z] = nudge ? [at[0] + nudge[0], at[1] + nudge[1], at[2] + nudge[2]] : at;
  if (bracket) b.box(0.05, 0.05, 0.26, { tones: 'iron', at: [x, y + 0.12, z + 0.13] });
  b.box(0.2, 0.04, 0.2, { tones: 'iron', at: [x, y - 0.18, z + 0.24] });
  b.box(glass, 0.2 * (glass / 0.12) ** 0.5, glass, { tones: 'glass', layer: 'glass', glow: color, glowKind: 2, at: [x, y - 0.14, z + 0.24] });
  b.hexa([V3(x - 0.13, y + 0.06, z + 0.11), V3(x + 0.13, y + 0.06, z + 0.11), V3(x - 0.02, y + 0.17, z + 0.22), V3(x + 0.02, y + 0.17, z + 0.22),
    V3(x - 0.13, y + 0.06, z + 0.37), V3(x + 0.13, y + 0.06, z + 0.37), V3(x - 0.02, y + 0.17, z + 0.26), V3(x + 0.02, y + 0.17, z + 0.26)], { tones: 'iron' });
  return { pos: V3(x, y - lightDown, z + lightOut), color, r, kind: 'lantern' };
}

/**
 * Timber framing on a +z wall face: posts (x list), rails (y list), braces ([[x0, y0, x1, y1], ...]) as boxes
 * standing `proud` in front of the wall plane z. Frame extents x0..x1, y0..y1.
 */
export function timbers(b, { x0, x1, y0 = 0, y1, z = 0, posts = [], rails = [], braces = [], size = 0.12, proud = 0.04, tones = 'timber' } = {}) {
  const o = { tones, pattern: 'none' };
  const zc = z + proud / 2 - 0.02;
  for (const px of posts) b.box(size, y1 - y0, proud + 0.04, { ...o, at: [px, y0, zc] });
  for (const ry of rails) b.box(x1 - x0, size, proud + 0.04, { ...o, at: [(x0 + x1) / 2, ry - size / 2, zc] });
  for (const [ax, ay, cx, cy] of braces) {
    const len = Math.hypot(cx - ax, cy - ay), ang = Math.atan2(cy - ay, cx - ax);
    b.box(len, size, proud + 0.03, { ...o, origin: 'center', at: [(ax + cx) / 2, (ay + cy) / 2, zc], rz: ang });
  }
  return b;
}

/**
 * Local frame of a house from its layout record: local +z = the door's outward normal, local x along the door wall.
 * Returns {position: Vector3 (footprint centre, y 0), rotationY, width (along the door wall), depth, doorX (local x of
 * the door centre on the door wall), doorZ (= depth / 2), apply(group)}. South-facing: identity. East: the door wall
 * is the east wall, its south end is local -x. West: south end is local +x.
 */
export function frameOf(record) {
  const f = record.footprint, c = record.center;
  const rotationY = record.facing === 'east' ? Math.PI / 2 : record.facing === 'west' ? -Math.PI / 2 : 0;
  const width = record.facing === 'south' ? f.w : f.d, depth = record.facing === 'south' ? f.d : f.w;
  const dp = record.doorPoint;
  const doorX = record.facing === 'south' ? dp.x - c.x : record.facing === 'east' ? -(dp.z - c.z) : dp.z - c.z;
  return {
    position: V3(c.x, 0, c.z), rotationY, width, depth, doorX, doorZ: depth / 2,
    apply(group) { group.position.copy(this.position); group.rotation.y = rotationY; group.updateMatrixWorld(true); return group; },
  };
}

/** A point given in the builder's CURRENT (pushed) frame -> the builder root frame (for window_ / lantern results). */
export function toRoot(b, v) { return v.clone().applyMatrix4(b.matrix); }
