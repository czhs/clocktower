// foliage (owner: foliage agent) - every tree, bush, hedge, stump, flower patch, toadstool and fern of Hollowmere.
// USER NOTE 3 (user, again): the trees must be SPRING trees, definitely NOT winter trees: fresh, bright, saturated
// spring greens (yellow-green new growth on the canopy tops), full leafy canopies, blossom (white/pink fruit-tree
// blossom, a few flowering shrubs), wildflowers in the grass. No bare branches, no frosty/blue-grey dark pines, no
// sombre near-black greens; pines get fresh light-green tips. Gothic mood comes from the buildings and the night, not dead trees.
// docs/TOWN.md §4 (ownership), §6 (south rim / occlusion), §11 (user notes). v1 art: pipgws packages/assets/scripts/
// props.ts oakTree / pineTree / bush / stump (read only).
//
// DESIGN NOTE ----------------------------------------------------------------------------------------------------
// Signature: the town sits in a SPRING clearing of a mixed wood. v1 drew a wall of tiered pines along the top edge,
//   a thick forest border all round and two broad oaks in the bottom corners (one in another colour), a few round
//   bushes (blossom, berries), a stump and scattered tufts / flowers / toadstools. The 3D port keeps that and makes
//   it spring (user §11): no bare trees, no near-black pines, blossom, new growth and wildflowers everywhere.
// 3D: every tree is a t3ssel8r leaf-sprite canopy (src/world/trees.js look: clumped sprites lit with the lump
//   normal, 4 quantized levels, stepped wind). Pines are TIERED sprite pines (tieredPine: a leafless pine trunk +
//   3-5 flattened leaf-clump skirts narrowing upward + a pointed spire; each skirt has a lit top and a dark
//   underside band), never cones. To stay cheap the rim forest is ~30 template trees (createTree, add:false,
//   composed) stamped hundreds of times (quarter-turn yaw, 0.85-1.15 scale) and MERGED: one leaf mesh per 16 m chunk
//   (one shared leaf program), one core mesh per palette, one trunk mesh. Leaves hidden inside a neighbour's opaque
//   core are culled at build time.
// Palette rows (docs/TOWN.md §3): pine #6E9A6A #48745A #2A4A48 core #1C3536 + new-growth tips mossTuft hi #B4C474
//   (pines only); leaf #86AA5A #5E8A4E #345A4E core #24413E (oak, ~30 % broadleaf rim rounds, bushes, hedges);
//   mossTuft #B4C474 #86A05A #4A6450 (young lime-green rim trees + every other hedge bush); blossom trees = leaf
//   ramp with flowerWhite or PINK (flowerRed 55 % to flowerWhite) tips + blossom star sprites (oak2 = the pink one,
//   the clock-tower pair, a few rim fruit trees); trunk #8A6E66 #64504F #3E3646; accents flowerRed / Violet /
//   White / Yellow, berry, toadstool + ivory. No autumn ramp anywhere.
// Must read at 640x360: tiered pine silhouettes behind the top row, a bright mixed wood at the sides, LOW
//   shrubs and a hedgerow on the south rim (the camera looks north: anything south of the lower ring is in front of
//   it; heights rise only with distance; the belt beyond the hedge is spaced 1.5x and alternates pine / broadleaf so
//   crowns separate), wildflower patches of 3x3 blossoms, bushes with berry / blossom dots, a mossy stump.
// Occlusion caps (on the drawn top = highest leaf + one sprite): south  h <= (z - 35.4) / 1.73 + 0.1 (tops stay below
//   the 0.7 m hedgerow line, so the cart road and every lower-ring front stay clear at yaw 0); east / south-east
//   h <= max(x - 44, z - 36) / 1.22 + 1.5 (the iso camera looks from the south-east). Trees keep off the ground
//   piece's api.clear(x, z) (river, banks, road out of town, bridge) and stand on ctx.heightAt.
// Cost: only trees the build camera can see get leaf sprites (others keep a decimated core: shadows + a smooth crown
//   if a pan reveals them); composite cores are vertex-clustered. See docs/TOWN_LEARNINGS.md for measured numbers.
//   Off-view trees merge into their own 16 m chunks (culled in colour / normal; shadow only where the box reaches).
//   ?quality=low: first rim row + town trees on coreLo, every rim tree beyond on coreFar, ~half the leaf sprites
//   (hashed; raised clumps kept), far-side leaves (normal turned away from the build camera) dropped, off-view trees
//   whose sun shadow cannot reach the view do not cast. Fix round (render-host, ?tris=1, frame tris colour+normal+shadow):
//   foliage at the gameplay square 150k -> 43k, focus house-14 252k -> 107k, house-5's door 297k -> 112k.
// Light: warm presets keep spring hues (springPatch: hi sun colour pulled to its luminance, tips keep their hue);
//   canopy cores cast DAPPLED shadows (dappleDepthMaterial; ?dapple=0 off, ?dapple=<threshold> to tune).
// Exports: default build (piece API: anchors perches / spots, api {trees, ivy, capHeight}), ivy(engine, opts) helper
//   (2-texel leaves by default; {big:false} for the old 1-texel creeper).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTree } from '../../world/trees.js';
import { toonMaterial } from '../../materials/toon.js';
import { FLOWER_LIGHT_GLSL } from '../../world/flowers.js';
import { createGrass, viewArea } from '../../world/grass.js';
import { rng } from '../../core/noise.js';
import { Builder } from '../kit.js';
import { TOWN_PALETTE as P, CORES } from '../palette.js';
import { TOWN_TOD } from '../api.js';

// ------------------------------------------------------------------------------------------------ palettes
// sRGB mix of two palette tones (linear lerp, back to sRGB hex): every derived tone still traces to §3.
const mixHex = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString().toUpperCase();
// fruit-blossom pink = flowerRed softened 55 % toward flowerWhite (CONTRACT-REQUEST: lead, add `blossomPink` to §3)
const PINK = mixHex(P.flowerRed, P.flowerWhite, 0.55);
const NEW_GROWTH = P.mossTuft[0];                                   // yellow-green spring tips (#B4C474)
const LEAFY = { hi: P.leaf[0], mid: P.leaf[1], sh: P.leaf[2], core: CORES.leaf, trunk: P.trunk };
const PAL = {
  // pines keep the pine ramp but every raised sun-side clump wears the new-growth tone (spring tips)
  pine: { hi: P.pine[0], mid: P.pine[1], sh: P.pine[2], core: CORES.pine, tip: NEW_GROWTH, trunk: P.trunk },
  leaf: { ...LEAFY, tip: P.leaf[0] },
  rim: { ...LEAFY, tip: NEW_GROWTH },                                // broadleaf rim trees: the bright leaf ramp
  // young spring trees: the lighter moss-green ramp, tips lifted toward flowerYellow (fresh lime crowns)
  young: { hi: P.mossTuft[0], mid: P.mossTuft[1], sh: P.mossTuft[2], core: CORES.leaf, tip: mixHex(P.mossTuft[0], P.flowerYellow, 0.4), trunk: P.trunk },
  oak: { ...LEAFY, tip: NEW_GROWTH },
  blossomW: { ...LEAFY, tip: P.flowerWhite },                        // white fruit blossom (the old snag slots)
  blossomP: { ...LEAFY, tip: PINK },                                 // pink blossom (oak2: v1's "one oak in another colour")
};
const BLOSSOM_TINT = { blossomW: P.flowerWhite, blossomP: PINK };

// ------------------------------------------------------------------------------------------------ spring light
// SPRING UNDER WARM LIGHT (verifier, afternoon / golden): the warm sky presets multiply their orange hi ramp
// (afternoon/golden rampHi 0.92,0.58,0.24) straight into the sun-lit leaf tone, so canopies went mustard / olive-gold and
// pink blossom salmon = autumn. trees.js already keeps only the LUMINANCE of the mid / shadow ramps on leaves
// (uLeafTint 0); this does the same for the hi band of every foliage material (leaves, leaf rims, canopy cores,
// foliage sprites): under a warm ramp the hi sun colour is pulled most of the way to its own luminance (keeps
// uFoliageSun.x = 35 % of its hue), and the tip tones (blossom white / pink, new growth) and sprite accents
// (flowers, blossom stars, berries) keep their palette hue entirely - only the brightness band changes.
// Neutral (noon) and cool (night) ramps are untouched (the pull is weighted by the ramp's warmth).
const SPRING_GLSL = /* glsl */`
  uniform vec4 uFoliageSun;   // x hue share kept by the hi sun colour on leaves, y warmth gain
  uniform vec3 uFoliageCounter;   // green-keeping counter tint of the leaf body under a warm ramp (vs the warm grade / fog)
  float fWarm(vec3 r) { return clamp((r.r - r.b) / max(r.r, 1e-3) * uFoliageSun.y, 0.0, 1.0); }
  vec3 fSpringHi(vec3 r, float tip) {
    float l = dot(r, vec3(0.2126, 0.7152, 0.0722));
    return mix(r, mix(vec3(l), r, uFoliageSun.x * (1.0 - tip)), fWarm(r));
  }`;
const HI_FROM = 'toonW.z * toonHi * rampFor(uRampHi, toonHi)';
const MID_FROM = 'toonW.y * toonMid * rampFor(uRampMid, toonMid)';
function springUniforms(engine) {
  engine._foliageSpring ??= {
    uFoliageSun: { value: new THREE.Vector4(0.35, 2.5, 0, 0) },
    uFoliageCounter: { value: new THREE.Vector3(0.86, 1.0, 0.93) },
  };
  return engine._foliageSpring;
}
/**
 * Patch a toon material in place (our own materials) so its hi band uses fSpringHi. `tip` = GLSL float expr in the
 * lighting block's scope: 1 where the fragment shows a tip / accent tone that keeps its palette hue.
 */
function springPatch(engine, mat, tip = '0.0', { mid = false } = {}) {
  if (!mat || mat.userData.foliageSpring) return mat;
  const prev = mat.onBeforeCompile, key0 = mat.customProgramCacheKey();
  const U = springUniforms(engine);
  mat.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    Object.assign(shader.uniforms, U);
    if (!shader.fragmentShader.includes(HI_FROM)) throw new Error('foliage: toon hi-band line not found (spring patch)');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${SPRING_GLSL}\nvoid main() {`)
      .replace(HI_FROM, `toonW.z * toonHi * fSpringHi(rampFor(uRampHi, toonHi), ${tip})`)
      // the warm grade + distance fog still pull the leaf body toward olive: a small counter tint on the green
      // body (never on tips / accents) keeps spring leaves green under a warm sun; neutral / cool ramps: identity
      .replace('#include <opaque_fragment>', `outgoingLight *= mix(vec3(1.0), uFoliageCounter, fWarm(uRampHi) * (1.0 - ${tip}));
  #include <opaque_fragment>`);
    // sprites put bumped accents (flowers, blossom stars) in the MID band too, which takes the warm mid ramp
    if (mid) shader.fragmentShader = shader.fragmentShader.replace(MID_FROM, `toonW.y * toonMid * fSpringHi(rampFor(uRampMid, toonMid), ${tip})`);
  };
  mat.customProgramCacheKey = () => `${key0}-fspring`;
  mat.userData.foliageSpring = true;
  mat.needsUpdate = true;
  return mat;
}
/**
 * A spring-patched COPY of a shared trees.js material (the original stays untouched for other users of createTree).
 * Cached per source material. The copy shares the toon uniforms (closure of the source's onBeforeCompile).
 */
function springCopy(engine, src, tip = '0.0') {
  if (!src) return src;
  engine._foliageSpringMats ??= new Map();
  const C = engine._foliageSpringMats;
  if (C.has(src)) return C.get(src);
  const m = src.clone();
  m.defines = { ...(src.defines ?? {}) };
  m.userData = { toon: src.userData.toon };                     // keep the live per-material uniforms (not a JSON copy)
  m.onBeforeCompile = src.onBeforeCompile;
  m.customProgramCacheKey = src.customProgramCacheKey;
  springPatch(engine, m, tip);
  C.set(src, m);
  return m;
}
// leaf sprites: the tip tone replaced the hi tone (raised new-growth clump, blossom, back-light rim) -> keep its hue
const LEAF_TIP_EXPR = '(length(toonHi - toneSat(vToneHi)) > 0.003 ? 1.0 : 0.0)';

// ------------------------------------------------------------------------------------------------ dappled shadows
// DAPPLED CANOPY SHADOWS (user §11 "dappled leaf-canopy shadows under trees"): the canopy cores cast through a
// shadow-only depth material with world-anchored holes. The holes live in the LIGHT plane (the world position
// projected along the sun direction), quantised to uDapple.x-metre cells, so every surface of a crown along one sun
// ray shares the same hole -> clean sun flecks on the ground and on lower leaves, in clusters (a coarse value noise
// gates a per-cell hash). A few cells open / close at the stepped 3 fps wind rate (uDapple.w). Pure function of the
// world position, the sun direction and stepped time: whole-texel pans cannot crawl it.
const DAPPLE_GLSL = /* glsl */`
  uniform vec3 uSunDir; uniform float uTime; uniform vec4 uDapple;   // x cell (m), y open threshold, z cluster freq, w wind
  varying vec3 vDapW;
  float dapHash(vec2 p) { uvec2 q = uvec2(ivec2(floor(p)) + 32768) * uvec2(1597334673u, 3812015801u);
    return float((q.x ^ q.y) * 1597334673u) * (1.0 / 4294967295.0); }
  float dapNoise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dapHash(i), dapHash(i + vec2(1, 0)), u.x), mix(dapHash(i + vec2(0, 1)), dapHash(i + vec2(1, 1)), u.x), u.y); }
  bool dapOpen(vec3 w) {
    vec3 L = normalize(uSunDir);
    vec3 e1 = normalize(cross(L, abs(L.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
    vec3 e2 = cross(L, e1);
    vec2 cell = floor(vec2(dot(w, e1), dot(w, e2)) / uDapple.x);
    float tq = floor(uTime * 3.0) / 3.0;
    // blobs: a value noise of ~1 / uDapple.z m features, edges roughened per cell (sun flecks, not salt-and-pepper)
    float n = 0.85 * dapNoise((cell + 0.5) * uDapple.x * uDapple.z) + 0.15 * dapHash(cell + 11.0);
    n += uDapple.w * step(0.5, fract(tq * 0.5 + dapHash(cell + 37.0)));   // wind: some cells flicker at 3 fps
    return n > uDapple.y;
  }`;
function dappleDepthMaterial(engine) {
  engine._foliageDapple ??= (() => {
    const U = { uSunDir: engine.uniforms.uSunDir, uTime: engine.uniforms.uTime, uDapple: { value: new THREE.Vector4(0.09, 0.61, 2.4, 0.05) } };
    const p = engine.params;
    if (p?.has?.('dapple')) U.uDapple.value.y = Number(p.get('dapple'));          // review: ?dapple=<threshold> (1.1 = off)
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDapW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDapW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${DAPPLE_GLSL}`)
        .replace('void main() {', 'void main() {\n  if (dapOpen(vDapW)) discard;');
    };
    m.customProgramCacheKey = () => 'foliage-dapple-depth';
    m.userData.uniforms = U;
    return m;
  })();
  return engine._foliageDapple;
}

// ------------------------------------------------------------------------------------------------ templates
/** createTree without adding it or registering its sorter (our merged chunks re-sort the leaves). */
function grab(engine, spec) {
  const n0 = engine._treeSorters?.length ?? 0;
  const g = createTree(engine, { ...spec, palette: PAL[spec.pal], add: false });
  if (engine._treeSorters) engine._treeSorters.length = n0;
  return g;
}
/**
 * A template tree: one or more createTree parts (each placed at `at` with scale s and an extra vertical squash
 * sy) merged into one transformable tree + a polar core profile for culling. Parts must share one palette.
 */
function makeTemplate(engine, spec) {
  if (spec.kind === 'tierpine') return tieredPine(engine, spec);
  return composeTemplate(spec, [{ g: grab(engine, spec), trunk: true }]);
}
/**
 * Tiered spring pine (the v1 top-row signature): a pine trunk (leafless) + 3-5 flattened leaf-clump tiers that
 * narrow upward, each lit with its own squashed lump normals (lit top, dark underside), so every tier reads as a
 * separate skirt with a shadow band and a glimpse of trunk beneath it, crowned by a small pointed spire.
 */
function tieredPine(engine, spec) {
  const H = spec.height, r = rng(spec.seed * 977 + 13);
  const parts = [{ g: grab(engine, { kind: 'pine', pal: spec.pal, seed: spec.seed, height: H * 1.2, maxLeaves: 1 }), trunk: true, noLeaves: true, noCore: true }];
  const k = H < 3.2 ? 3 : H < 5.6 ? 4 : 5;
  const Rb = THREE.MathUtils.clamp(H * 0.2, 0.55, 1.45), sy = 0.52;
  const R = [];
  for (let i = 0; i < k; i++) R.push(Rb * (1 - 0.6 * i / (k - 1)) * (0.94 + r() * 0.12));
  // tier i+1's skirt bottom sits just above tier i's dome shoulder: step = 0.5 R_i + 0.2 R_{i+1} (in squashed units)
  const ys = [0];
  for (let i = 1; i < k; i++) ys.push(ys[i - 1] + (0.95 * R[i - 1] + 0.38 * R[i]) * sy);
  const spireH = Math.max(0.7, H * 0.17);
  const y0 = H * 0.2, span = H - spireH * 0.75 - y0, top = ys[k - 1] + 1.4 * R[k - 1] * sy;
  const f = span / top;                                         // fit the stack between y0 and the spire
  for (let i = 0; i < k; i++) {
    const g = grab(engine, { kind: 'bush', pal: spec.pal, seed: spec.seed * 31 + i * 7 + 1, radius: R[i], leafTexels: spec.leafTexels });
    parts.push({ g, at: [(r() - 0.5) * 0.08, y0 + ys[i] * f, (r() - 0.5) * 0.08], s: 1, sy: sy * Math.min(1.25, f) });
  }
  const sp = grab(engine, { kind: 'pine', pal: spec.pal, seed: spec.seed * 53 + 5, height: spireH * 1.25, radius: Math.max(0.22, R[k - 1] * 0.5), leafTexels: spec.leafTexels });
  parts.push({ g: sp, at: [0, H - spireH * 1.2, 0], s: 1, sy: 1 });
  const t = composeTemplate(spec, parts);
  t.h = H;
  return t;
}
function composeTemplate(spec, parts) {
  const m = new THREE.Matrix4();
  const leafParts = [], coreGeos = [];
  let trunk = null, coreMat = null, leafMat = null, renderOrder = 0, Hmax = 0;
  for (const p of parts) {
    const [ax, ay, az] = p.at ?? [0, 0, 0], s = p.s ?? 1, sy = p.sy ?? 1;
    m.makeScale(s, s * sy, s).setPosition(ax, ay, az);
    const nsc = [1 / s, 1 / (s * sy), 1 / s];                 // inverse-transpose of the scale (normals)
    const tr = p.g.getObjectByName('trunk'), core = p.g.getObjectByName('core'), leaves = p.g.getObjectByName('leaves');
    Hmax = Math.max(Hmax, ay + p.g.userData.tree.height * s * sy);
    if (p.trunk && tr) trunk = { geo: tr.geometry, mat: tr.material };
    if (!p.noCore) {
      const cg = (core.geometry.index ? core.geometry.toNonIndexed() : core.geometry).clone();
      for (const name of Object.keys(cg.attributes)) {
        const a = cg.attributes[name];
        if (name === 'position' || name === 'aLeafPos') a.applyMatrix4(m);
        else if (name === 'normal') for (let i = 0; i < a.count; i++) {
          const x = a.getX(i) * nsc[0], y = a.getY(i) * nsc[1], z = a.getZ(i) * nsc[2], l = Math.hypot(x, y, z) || 1;
          a.setXYZ(i, x / l, y / l, z / l);
        }
      }
      coreGeos.push(cg);
      coreMat ??= core.material;
    }
    if (!p.noLeaves) {
      const lg = leaves.geometry, n = lg.instanceCount, A = {};
      for (const k of LEAF_ATTRS) A[k] = lg.attributes[k].array.slice(0, n * lg.attributes[k].itemSize);
      for (let i = 0; i < n; i++) {
        A.aBase[i * 3] = A.aBase[i * 3] * s + ax; A.aBase[i * 3 + 1] = A.aBase[i * 3 + 1] * s * sy + ay; A.aBase[i * 3 + 2] = A.aBase[i * 3 + 2] * s + az;
        const x = A.aN[i * 3] * nsc[0], y = A.aN[i * 3 + 1] * nsc[1], z = A.aN[i * 3 + 2] * nsc[2], l = Math.hypot(x, y, z) || 1;
        A.aN[i * 3] = x / l; A.aN[i * 3 + 1] = y / l; A.aN[i * 3 + 2] = z / l;
        A.aRad[i] *= s;
      }
      leafParts.push({ A, n });
      leafMat ??= leaves.material;
      renderOrder = Math.max(renderOrder, leaves.renderOrder);
    }
  }
  const n = leafParts.reduce((a, p) => a + p.n, 0), attrs = {};
  for (const k of LEAF_ATTRS) {
    attrs[k] = new Float32Array(n * LEAF_SIZE[k]);
    let o = 0;
    for (const p of leafParts) { attrs[k].set(p.A[k], o); o += p.n * LEAF_SIZE[k]; }
  }
  if (parts.length > 1) for (let i = 0; i < n; i++) attrs.aVar[i * 4 + 2] = THREE.MathUtils.clamp(attrs.aBase[i * 3 + 1] / Hmax, 0, 1) ** 1.5;
  gateTips(attrs, n, spec);
  if (coreGeos.length > 1) {                                  // keep only the attributes every part has
    const common = Object.keys(coreGeos[0].attributes).filter((k) => coreGeos.every((g) => g.attributes[k]));
    for (const g of coreGeos) for (const k of Object.keys(g.attributes)) if (!common.includes(k)) g.deleteAttribute(k);
  }
  let coreGeo = coreGeos.length === 1 ? coreGeos[0] : mergeGeometries(coreGeos);
  if (!coreGeo) throw new Error(`foliage: could not merge the core parts of ${spec.kind}`);
  // composite cores (5-6 lumps) are mostly hidden behind their sprites: a light vertex-cluster pass keeps the
  // triangle budget at the single-tree level without visible faceting (cells ~4 texels at the gameplay zoom)
  // (rim rounds too, via spec.coreCell; the town's own oak / bushes keep their full cores)
  if (coreGeos.length > 1 || spec.coreCell) coreGeo = clusterGeometry(coreGeo, spec.coreCell ?? 0.19);
  let leafTop = 0;
  for (let i = 0; i < n; i++) leafTop = Math.max(leafTop, attrs.aBase[i * 3 + 1]);
  // polar profile of the opaque core: max radius per (0.25 m height bin, 8 sectors), local frame
  const pos = coreGeo.attributes.position, bins = new Map();
  let yMax = 0, ext = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z), s = sectorOf(x, z), b = Math.floor(y / 0.25);
    const k = b * 8 + s;
    bins.set(k, Math.max(bins.get(k) ?? 0, r));
    yMax = Math.max(yMax, y); ext = Math.max(ext, r);
  }
  return {
    spec, h: parts[0].g.userData.tree.height, top: Math.max(yMax, leafTop), ext, n,
    trunk,
    core: { geo: coreGeo, mat: coreMat },
    coreLo: { geo: clusterGeometry(coreGeo, spec.kind === 'tierpine' ? 0.85 : spec.kind === 'round' ? 0.7 : 0.5), mat: coreMat },
    // LEAD (perf, ?quality=low): a coarse shadow / silhouette core for trees whose leaves are not drawn (off-view)
    coreFar: { geo: clusterGeometry(coreGeo, spec.kind === 'tierpine' ? 1.5 : spec.kind === 'round' ? 1.3 : 0.8), mat: coreMat },
    leaves: { attrs, mat: leafMat, renderOrder },
    coreR: (x, y, z) => {                     // core radius at a local point's (height, sector); 0 = outside
      const b = Math.floor(y / 0.25), s = sectorOf(x, z);
      return bins.get(b * 8 + s) ?? 0;
    },
  };
}
/**
 * Vertex-clustering decimation of a non-indexed core geometry (cell metres): vertices snap to their cell's
 * average (attributes averaged, normals renormalised, aOcc max), collapsed triangles are dropped. Used for the
 * cores of trees whose leaves are not drawn (off-view) and at the far cameras: the core is then mostly a
 * shadow caster / distant silhouette and 5-10x fewer triangles is invisible.
 */
function clusterGeometry(geo, cell) {
  const pos = geo.attributes.position, names = Object.keys(geo.attributes);
  const key = (i) => `${Math.floor(pos.getX(i) / cell)},${Math.floor(pos.getY(i) / cell)},${Math.floor(pos.getZ(i) / cell)}`;
  const cl = new Map(), ids = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let c = cl.get(k);
    if (!c) { c = { id: cl.size, n: 0, sum: {} }; for (const a of names) c.sum[a] = new Float64Array(geo.attributes[a].itemSize); cl.set(k, c); }
    c.n++; ids[i] = c.id;
    for (const a of names) {
      const at = geo.attributes[a];
      for (let j = 0; j < at.itemSize; j++) {
        const v = at.array[i * at.itemSize + j];
        c.sum[a][j] = a === 'aOcc' ? Math.max(c.sum[a][j], v) : c.sum[a][j] + v;
      }
    }
  }
  const reps = [...cl.values()];
  const tris = [];
  for (let t = 0; t < pos.count; t += 3) {
    const a = ids[t], b = ids[t + 1], c = ids[t + 2];
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  for (const a of names) {
    const sz = geo.attributes[a].itemSize, arr = new Float32Array(tris.length * sz);
    tris.forEach((id, k) => {
      const c = reps[id];
      const v = [];
      for (let j = 0; j < sz; j++) v.push(a === 'aOcc' ? c.sum[a][j] : c.sum[a][j] / c.n);
      if (a === 'normal') { const l = Math.hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; }
      arr.set(v, k * sz);
    });
    out.setAttribute(a, new THREE.BufferAttribute(arr, sz));
  }
  return out;
}
/**
 * Rim / new-growth gating (per leaf, baked into aTip). The leaf shader (trees.js) paints a lit leaf with aTip when
 * (a) a RAISED clump faces the sun hard (noon / morning: the new-growth tips) or (b) under BACK light (the north-west
 * golden sun) for EVERY lit sun-side leaf, which turned every crown into dense saturated yellow speckle. So:
 *   ~2/3 of the raised clumps keep a new-growth tip, half-way to the palette hi (blossom trees keep white / pink);
 *   ~10-18 % of the other leaves (hashed, upper half of the crown) get the palette hi = the 1-px-ish sun-side rim;
 *   the rest get the mid tone, so under back light the body stays one calm band and only a sparse rim + the
 *   new-growth clumps catch the sun. Noon is unchanged except the softened tips (non-raised leaves never tip there).
 */
function gateTips(A, n, spec) {
  const blossom = !!BLOSSOM_TINT[spec.pal];
  const r = rng((spec.seed ?? 1) * 7919 + 17);
  let yMax = 0;
  for (let i = 0; i < n; i++) yMax = Math.max(yMax, A.aBase[i * 3 + 1]);
  for (let i = 0; i < n; i++) {
    const raised = A.aVar[i * 4 + 3] > 0.5, u = r(), j = i * 3;
    const up = A.aBase[j + 1] / Math.max(1e-3, yMax);
    for (let c = 0; c < 3; c++) {
      const hi = A.toneHi[j + c], mid = A.color[j + c], tip = A.aTip[j + c];
      A.aTip[j + c] = raised ? (blossom ? tip : u < 0.65 ? hi + (tip - hi) * 0.5 : hi)
        : (u < 0.1 + 0.08 * up ? hi : mid);
    }
  }
}
const LEAF_ATTRS = ['aBase', 'aN', 'aVar', 'aRad', 'color', 'toneHi', 'toneSh', 'aCore', 'aTip', 'aOcc'];
const LEAF_SIZE = { aBase: 3, aN: 3, aVar: 4, aRad: 1, color: 3, toneHi: 3, toneSh: 3, aCore: 3, aTip: 3, aOcc: 1 };
/** Deterministic per-(tree, leaf) hash in [0, 1) (LOW tier leaf thinning). */
function leafHash(a, b) { let h = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; }
function sectorOf(x, z) { return ((Math.floor((Math.atan2(z, x) / (Math.PI * 2)) * 8 + 8.5)) % 8 + 8) % 8; }

// ------------------------------------------------------------------------------------------------ forest merger
/**
 * Collects placed template trees and emits merged meshes: leaves per 16 m chunk (sorted far->near, re-sorted when
 * the camera yaw/pitch changes), cores per material, trunks per material.
 */
class Forest {
  constructor(engine) { this.engine = engine; this.trees = []; this.grid = new Map(); }
  add(tpl, x, y, z, { quarter = 0, scale = 1, sway = 1 } = {}) {
    const t = { tpl, x, y, z, q: quarter & 3, s: scale, sway, i: this.trees.length };
    t.top = y + tpl.top * scale; t.ext = tpl.ext * scale;
    this.trees.push(t);
    const k = `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push(t);
    return t;
  }
  near(x, z, r) {
    const out = [];
    for (let i = Math.floor((x - r) / 4); i <= Math.floor((x + r) / 4); i++)
      for (let j = Math.floor((z - r) / 4); j <= Math.floor((z + r) / 4); j++) for (const t of this.grid.get(`${i},${j}`) ?? []) out.push(t);
    return out;
  }
  /** world -> tree local (inverse quarter turn + scale) */
  static local(t, px, py, pz, out) {
    const th = -t.q * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
    const dx = (px - t.x) / t.s, dz = (pz - t.z) / t.s;
    out.x = dx * c + dz * s; out.y = (py - t.y) / t.s; out.z = -dx * s + dz * c;
    return out;
  }
  hidden(self, px, py, pz) {
    const L = { x: 0, y: 0, z: 0 };
    for (const u of this.near(px, pz, 4)) {
      if (u === self) continue;
      if (Math.hypot(px - u.x, pz - u.z) > u.ext + 0.2) continue;
      Forest.local(u, px, py, pz, L);
      if (L.y < 0) continue;
      const r = u.tpl.coreR(L.x, L.y, L.z);
      if (r > 0 && Math.hypot(L.x, L.z) < r * 0.9) return true;
    }
    return false;
  }
  build(group, { cull = true, chunk = 16, visible = null, farOff = null, lowDetail = false, farCores = false, farRow = null, leafKeep = null, backCull = null, noCast = null, offChunk = 32, rimMat = null, outline = () => false, dapple = true } = {}) {
    const engine = this.engine;
    const stats = { leaves: 0, culled: 0, offview: 0, trees: this.trees.length, chunks: 0 };
    // ---- leaves, per chunk
    const chunks = new Map();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), nv = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    for (const t of this.trees) {
      const A = t.tpl.leaves.attrs, n = t.tpl.n;
      // trees the build camera cannot see keep only their core (+ trunk): lit with the same leaf bands, so a pan
      // that reveals one shows a smooth crown, never a hole
      if (visible && !visible(t)) { stats.offview++; t.lo = true; t.far = farOff ? farOff(t) : false; continue; }
      // LOW tier: rim trees beyond the first row from the town edge keep their leaves but sit on the coarse coreFar
      // (the sprites carry the crown; the core only fills gaps and casts the shadow)
      if (farRow?.(t)) { t.farRow = true; stats.farRow = (stats.farRow ?? 0) + 1; }
      const keep = leafKeep ? leafKeep(t) : 1;
      q.setFromAxisAngle(Y, t.q * Math.PI / 2);
      m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      const ck = `${Math.floor(t.x / chunk)},${Math.floor(t.z / chunk)}`;
      let C = chunks.get(ck);
      if (!C) {
        C = { cx: (Math.floor(t.x / chunk) + 0.5) * chunk, cz: (Math.floor(t.z / chunk) + 0.5) * chunk, rows: [], order: t.tpl.leaves.renderOrder };
        chunks.set(ck, C);
      }
      C.order = Math.max(C.order, t.tpl.leaves.renderOrder);
      for (let i = 0; i < n; i++) {
        // LOW tier thinning: keep a hashed `keep` share of the leaves (raised clumps first: they carry the shape)
        if (keep < 1 && A.aVar[i * 4 + 3] < 0.5 && leafHash(t.i, i) >= keep) { stats.thinned = (stats.thinned ?? 0) + 1; continue; }
        v.set(A.aBase[i * 3], A.aBase[i * 3 + 1], A.aBase[i * 3 + 2]).applyMatrix4(m);
        if (cull && this.hidden(t, v.x, v.y, v.z)) { stats.culled++; continue; }
        nv.set(A.aN[i * 3], A.aN[i * 3 + 1], A.aN[i * 3 + 2]).applyQuaternion(q);
        // LOW tier: leaves on the far side of a crown (normal turned away from the build camera) are hidden by the
        // opaque core: dropped (a later 45-degree turn shows the lit core there, never a hole)
        if (backCull && nv.dot(backCull) > 0.3) { stats.backCulled = (stats.backCulled ?? 0) + 1; continue; }
        C.rows.push({ t, i, x: v.x, y: v.y, z: v.z, nx: nv.x, ny: nv.y, nz: nv.z });
      }
    }
    const leafMat = springCopy(engine, this.trees[0]?.tpl.leaves.mat, LEAF_TIP_EXPR);
    const rimMatS = springCopy(engine, rimMat, '0.0');
    for (const C of chunks.values()) {
      const N = C.rows.length;
      if (!N) continue;
      stats.leaves += N; stats.chunks++;
      const geo = new THREE.InstancedBufferGeometry();
      const quad = new THREE.PlaneGeometry(12, 12);
      geo.index = quad.index;
      geo.setAttribute('position', quad.attributes.position);
      geo.setAttribute('uv', quad.attributes.uv);
      geo.setAttribute('normal', quad.attributes.normal);
      const O = {};
      for (const k of LEAF_ATTRS) { O[k] = new Float32Array(N * LEAF_SIZE[k]); geo.setAttribute(k, new THREE.InstancedBufferAttribute(O[k], LEAF_SIZE[k])); }
      geo.instanceCount = N;
      let r2 = 0;
      for (const row of C.rows) r2 = Math.max(r2, (row.x - C.cx) ** 2 + (row.z - C.cz) ** 2 + (row.y - 4) ** 2);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), Math.sqrt(r2) + 1.5);
      const fill = (rows) => {
        rows.forEach((row, j) => {
          const A = row.t.tpl.leaves.attrs, i = row.i;
          O.aBase[j * 3] = row.x - C.cx; O.aBase[j * 3 + 1] = row.y; O.aBase[j * 3 + 2] = row.z - C.cz;
          O.aN[j * 3] = row.nx; O.aN[j * 3 + 1] = row.ny; O.aN[j * 3 + 2] = row.nz;
          O.aVar[j * 4] = A.aVar[i * 4]; O.aVar[j * 4 + 1] = A.aVar[i * 4 + 1];
          O.aVar[j * 4 + 2] = A.aVar[i * 4 + 2] * row.t.sway; O.aVar[j * 4 + 3] = A.aVar[i * 4 + 3];
          O.aRad[j] = A.aRad[i] * row.t.s; O.aOcc[j] = A.aOcc[i];
          for (const k of ['color', 'toneHi', 'toneSh', 'aCore', 'aTip']) for (let c = 0; c < 3; c++) O[k][j * 3 + c] = A[k][i * 3 + c];
        });
        for (const k of LEAF_ATTRS) geo.attributes[k].needsUpdate = true;
      };
      const sortFor = (f) => {
        for (const row of C.rows) row.d = row.x * f.x + row.y * f.y + row.z * f.z - row.t.tpl.leaves.attrs.aVar[row.i * 4 + 3] * 0.1;
        C.rows.sort((a, b) => b.d - a.d);
        fill(C.rows);
      };
      C.sortFor = sortFor;
      if (rimMat && outline(C)) {
        // 1-px dilated, darker leaf rim (trees.js outline look) drawn first: only survives outside the crowns, so
        // each low crown gets its own outline against the meadow and the next crown (one extra call per chunk)
        const rm = new THREE.Mesh(geo, rimMatS);
        rm.position.set(C.cx, 0, C.cz);
        rm.renderOrder = C.order; rm.castShadow = false; rm.receiveShadow = true; rm.name = 'foliage-leaf-rim';
        group.add(rm);
        stats.rims = (stats.rims ?? 0) + 1;
      }
      const mesh = new THREE.Mesh(geo, leafMat);
      mesh.position.set(C.cx, 0, C.cz);
      mesh.renderOrder = C.order; mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.name = 'foliage-leaves';
      group.add(mesh);
    }
    let last = '';
    const resort = () => {
      const c = engine.camera, key = `${c.yaw.toFixed(4)},${c.pitch.toFixed(4)}`;
      if (key === last) return;
      last = key;
      const f = new THREE.Vector3(-Math.cos(c.pitch) * Math.sin(c.yaw), -Math.sin(c.pitch), -Math.cos(c.pitch) * Math.cos(c.yaw));
      for (const C of chunks.values()) C.sortFor?.(f);
    };
    resort();
    engine.onUpdate(resort);

    // ---- cores and trunks, merged per material
    const merge = (part, name, shadow) => {
      const byMat = new Map();
      for (const t of this.trees) {
        const p = part === 'core' && (t.lo || t.farRow) && farCores ? t.tpl.coreFar : part === 'core' && (t.lo || lowDetail) ? t.tpl.coreLo : t.tpl[part];
        if (!p || (part === 'trunk' && t.far)) continue;      // trunks far outside the view: never seen, skip
        t[`_${part}`] = p;
        if (part === 'core') { const cat = t.lo ? 'off' : t.farRow ? 'far' : p === t.tpl.coreLo ? 'lo' : 'full'; stats.coreBy ??= {}; stats.coreBy[cat] = (stats.coreBy[cat] ?? 0) + p.geo.attributes.position.count / 3; }
        // LEAD (perf): merged per material AND per 32 m chunk, so frustum culling (colour, normal, shadow camera)
        // drops the rim chunks a view never sees instead of drawing the whole belt three times a frame
        // trees the build camera cannot see go into their own 16 m chunks (they are mostly shadow casters): the colour
        // / normal passes cull them entirely and the shadow pass keeps only the chunks inside the shadow box
        // (cores only: trunks are cheap, and a split costs draw calls; offChunk 16 m at low, 32 m at high)
        const nc = shadow && t.lo && noCast?.(t);              // LOW: off-view trees whose shadow cannot reach the view
        if (nc) stats[`${part}NoCast`] = (stats[`${part}NoCast`] ?? 0) + 1;
        const ck = t.lo ? offChunk : 32;
        const key = part === 'core' ? `${t.lo ? (nc ? 'n' : 'o') : 'v'}${Math.floor(t.x / ck)},${Math.floor(t.z / ck)}` : `${Math.floor(t.x / 32)},${Math.floor(t.z / 32)}`;
        if (!byMat.has(p.mat)) byMat.set(p.mat, new Map());
        const bk = byMat.get(p.mat);
        if (!bk.has(key)) bk.set(key, []);
        bk.get(key).push(t);
      }
      for (const [mat, list] of [...byMat].flatMap(([mt, bk]) => [...bk.values()].map((l) => [mt, l]))) {
        const first = list[0][`_${part}`].geo;
        const names = Object.keys(first.attributes);
        let total = 0;
        for (const t of list) total += t[`_${part}`].geo.attributes.position.count;
        const out = {};
        for (const k of names) out[k] = new Float32Array(total * first.attributes[k].itemSize);
        let o = 0;
        for (const t of list) {
          const g = t[`_${part}`].geo, cnt = g.attributes.position.count;
          q.setFromAxisAngle(Y, t.q * Math.PI / 2);
          m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
          for (const k of names) {
            const a = g.attributes[k], sz = a.itemSize;
            for (let i = 0; i < cnt; i++) {
              if (k === 'position' || k === 'aLeafPos') { v.fromBufferAttribute(a, i).applyMatrix4(m); out[k].set([v.x, v.y, v.z], (o + i) * 3); }
              else if (k === 'normal') { v.fromBufferAttribute(a, i).applyQuaternion(q); out[k].set([v.x, v.y, v.z], (o + i) * 3); }
              else for (let c = 0; c < sz; c++) out[k][(o + i) * sz + c] = a.array[i * sz + c];
            }
          }
          o += cnt;
        }
        const geo = new THREE.BufferGeometry();
        for (const k of names) geo.setAttribute(k, new THREE.BufferAttribute(out[k], first.attributes[k].itemSize));
        geo.computeBoundingSphere(); geo.computeBoundingBox();
        const mesh = new THREE.Mesh(geo, part === 'core' ? springCopy(engine, mat) : mat);
        stats[`${part}Tris`] = (stats[`${part}Tris`] ?? 0) + total / 3;
        mesh.castShadow = shadow && !(part === 'core' && list[0].lo && noCast?.(list[0])); mesh.receiveShadow = true; mesh.name = name;
        // canopy cores cast DAPPLED shadows (holes in the light plane, see dappleDepthMaterial)
        if (part === 'core' && dapple) mesh.customDepthMaterial = dappleDepthMaterial(engine);
        group.add(mesh);
      }
    };
    merge('core', 'foliage-cores', true);
    merge('trunk', 'foliage-trunks', true);
    return stats;
  }
}

// ------------------------------------------------------------------------------------------------ sprites
// Small screen-aligned pixel sprites (1 sprite texel = 1 screen texel, root snapped to the world-anchored texel
// grid like grass / leaves): flower clumps, toadstools, meadow tufts, ferns, berry and blossom dots. One shared
// material (one program), one InstancedBufferGeometry per field, sorted far->near. Sprite pixel kinds (atlas R):
//   0 green part (instance ramp: color / toneHi / toneSh), 1 accent (aTint), 2 accent highlight (lighter),
//   3 secondary accent (aTint2: toadstool spots + stems, blossom eyes), 4 accent shade (gills, berry undersides).
// Accents use hi = tint, mid = tint*.85, sh = tint*(.5,.52,.78) (the grass-flower recipe); `bump` lifts them a
// band (flowers / berries stay bright in shade, Holland's "bumped a cut").
const SCELL = 16, SPR = { flowerA: 0, flowerB: 1, flowerC: 2, toadstools: 3, toadstool: 4, tuftA: 5, tuftB: 6, fernA: 7, fernB: 8, berries: 9, blossoms: 10, bracken: 11, ivy: 12, patchA: 13, patchB: 14, ivyBig: 15 };
const NSPR = 16;
let SPRITE_ATLAS = null;
function spriteAtlas() {
  if (SPRITE_ATLAS) return SPRITE_ATLAS;
  const W = SCELL * NSPR, H = SCELL * 2, data = new Uint8Array(W * H * 4);
  const art = [];
  const px = (list, x, y, k) => list.push([x, y, k]);
  const stem = (L, x, h, lean = 0) => { for (let y = 0; y < h; y++) px(L, x + (lean && y >= h - 2 ? lean : 0), y, 0); return x + lean; };
  const blossom2 = (L, x, y) => { px(L, x, y, 1); px(L, x + 1, y, 1); px(L, x, y + 1, 2); px(L, x + 1, y + 1, 1); };
  const plus = (L, x, y) => { px(L, x, y, 2); px(L, x - 1, y, 1); px(L, x + 1, y, 1); px(L, x, y + 1, 1); px(L, x, y - 1, 1); };
  { // 0 flower clump A: three stems, 2x2 blossoms, a leaf or two
    const L = [];
    let x = stem(L, 5, 4, -1); blossom2(L, x - 1, 4);
    x = stem(L, 8, 6); blossom2(L, x, 6);
    x = stem(L, 11, 3, 1); blossom2(L, x, 3);
    px(L, 7, 1, 0); px(L, 9, 2, 0); px(L, 6, 0, 0); px(L, 10, 0, 0);
    art.push({ L, bend: 4 });
  }
  { // 1 flower clump B: five short stems with plus-shaped blossoms
    const L = [];
    for (const [x, h] of [[3, 2], [6, 4], [8, 2], [10, 5], [13, 3]]) { stem(L, x, h); plus(L, x, h + 1); }
    px(L, 5, 0, 0); px(L, 9, 0, 0); px(L, 12, 0, 0);
    art.push({ L, bend: 4 });
  }
  { // 2 flower clump C: tall leaning stems with drooping bells
    const L = [];
    for (const [x, h, lean] of [[5, 7, -1], [8, 9, 0], [11, 6, 1]]) {
      const xt = stem(L, x, h, lean);
      px(L, xt, h, 1); px(L, xt + 1, h, 1); px(L, xt + 1, h - 1, 4); px(L, xt, h + 1, 2);
    }
    px(L, 6, 1, 0); px(L, 7, 2, 0); px(L, 10, 1, 0); px(L, 9, 3, 0);
    art.push({ L, bend: 5 });
  }
  { // 3 toadstool cluster: a big cap and a small one (ivory stems + spots)
    const L = [];
    for (let y = 0; y < 3; y++) { px(L, 7, y, 3); px(L, 8, y, 3); }
    for (let x = 5; x <= 10; x++) px(L, x, 3, 4);
    for (let x = 4; x <= 11; x++) px(L, x, 4, 1);
    for (let x = 5; x <= 10; x++) px(L, x, 5, 1);
    for (let x = 6; x <= 9; x++) px(L, x, 6, 1);
    px(L, 6, 6, 2); px(L, 5, 5, 2); px(L, 7, 5, 3); px(L, 10, 4, 3); px(L, 8, 6, 3); px(L, 5, 4, 3);
    px(L, 12, 0, 3); px(L, 12, 1, 3); for (let x = 11; x <= 13; x++) { px(L, x, 2, 4); px(L, x, 3, 1); }
    px(L, 11, 3, 2); px(L, 12, 4, 1); px(L, 13, 3, 3);
    px(L, 3, 0, 0); px(L, 4, 1, 0); px(L, 14, 0, 0);
    art.push({ L, bend: 99 });
  }
  { // 4 single toadstool + a button mushroom
    const L = [];
    for (let y = 0; y < 2; y++) { px(L, 6, y, 3); px(L, 7, y, 3); }
    for (let x = 4; x <= 9; x++) px(L, x, 2, 4);
    for (let x = 4; x <= 9; x++) px(L, x, 3, 1);
    for (let x = 5; x <= 8; x++) px(L, x, 4, 1);
    px(L, 5, 4, 2); px(L, 4, 3, 2); px(L, 6, 3, 3); px(L, 8, 4, 3); px(L, 9, 3, 3);
    px(L, 11, 0, 3); px(L, 11, 1, 4); px(L, 12, 1, 4); px(L, 11, 2, 1); px(L, 12, 2, 1); px(L, 11, 3, 2);
    px(L, 2, 0, 0); px(L, 3, 1, 0); px(L, 13, 0, 0);
    art.push({ L, bend: 99 });
  }
  const tuft = (blades) => {
    const L = [];
    for (const [x, h, lean] of blades) for (let y = 0; y < h; y++) px(L, x + (y > h * 0.55 ? lean : 0) + (y > h * 0.85 ? lean : 0), y, 0);
    for (let x = blades[0][0]; x <= blades[blades.length - 1][0]; x++) px(L, x, 0, 0);
    return L;
  };
  art.push({ L: tuft([[3, 5, -1], [5, 9, -1], [6, 6, 0], [7, 11, 0], [8, 8, 1], [10, 10, 1], [12, 6, 1]]), bend: 5 });   // 5
  art.push({ L: tuft([[4, 7, -1], [6, 10, 0], [8, 12, 0], [9, 7, 1], [11, 9, 1]]), bend: 6 });                       // 6
  const fern = (fronds) => {
    const L = [];
    for (const f of fronds) {
      let x = 8, y = 0;
      f.forEach(([dx, dy], i) => {
        x += dx; y += dy; px(L, x, y, 0);
        if (i % 2 === 1 && i < f.length - 1) px(L, x, y + 1, 0);          // leaflets above the rachis
        if (i % 2 === 0 && i > 0 && i < f.length - 1) px(L, x - Math.sign(dx || 1), y - 1 < 0 ? 0 : y - 1, 0);
      });
    }
    return L;
  };
  // 7 fern rosette: four arching fronds + a crozier
  art.push({ L: fern([[[-1, 1], [-1, 1], [-1, 1], [-1, 0], [-1, 0], [-1, -1], [-1, -1]], [[1, 1], [1, 1], [1, 1], [1, 0], [1, 0], [1, -1], [1, -1]],
    [[0, 1], [-1, 1], [0, 1], [-1, 1], [0, 1], [-1, 0], [-1, -1]], [[0, 1], [1, 1], [0, 1], [1, 1], [1, 1], [1, 0], [1, -1]]]), bend: 5 });
  // 8 fern, lower and wider
  art.push({ L: fern([[[-1, 1], [-1, 0], [-1, 1], [-1, 0], [-1, 0], [-1, -1], [-1, 0]], [[1, 1], [1, 0], [1, 1], [1, 0], [1, 0], [1, -1], [1, 0]],
    [[0, 1], [0, 1], [-1, 1], [0, 1], [-1, 0], [-1, -1]], [[1, 1], [0, 1], [1, 1], [1, 0], [1, -1]]]), bend: 4 });
  { // 9 berries: three 2x2 berries, lit top-left, shaded underside
    const L = [];
    for (const [x, y] of [[5, 5], [8, 7], [10, 4], [7, 3]]) { px(L, x, y, 2); px(L, x + 1, y, 1); px(L, x, y - 1, 1); px(L, x + 1, y - 1, 4); }
    art.push({ L, bend: 99 });
  }
  { // 10 blossoms: white five-petal stars with a yellow eye
    const L = [];
    for (const [x, y] of [[5, 6], [10, 8], [9, 3], [3, 3]]) { px(L, x, y, 3); px(L, x - 1, y, 1); px(L, x + 1, y, 1); px(L, x, y + 1, 2); px(L, x, y - 1, 1); }
    art.push({ L, bend: 99 });
  }
  { // 11 bracken / dry leaf litter clump (forest floor)
    const L = [];
    for (const [x, y] of [[4, 0], [5, 1], [6, 1], [7, 2], [9, 1], [10, 0], [11, 1], [6, 0], [8, 0], [12, 0], [3, 1], [8, 3], [9, 4]]) px(L, x, y, 0);
    for (const [x, y] of [[5, 0], [9, 0], [10, 1], [7, 1], [8, 2]]) px(L, x, y, 1);
    art.push({ L, bend: 3 });
  }
  { // 12 ivy: a trailing cluster of small lobed leaves (wall creeper; see ivy() below)
    const L = [];
    for (const [x, y] of [[7, 9], [6, 8], [8, 8], [7, 7], [4, 6], [5, 6], [4, 5], [10, 6], [11, 6], [11, 5], [6, 3], [7, 3], [7, 2],
      [9, 3], [10, 2], [9, 2], [3, 2], [4, 2], [12, 1], [12, 2], [8, 0], [8, 1], [7, 5], [9, 5]]) px(L, x, y, 0);
    for (const [x, y] of [[6, 9], [3, 6], [10, 7], [5, 3], [11, 3]]) px(L, x, y, 0);
    art.push({ L, bend: 99 });
  }
  // 13 / 14 wildflower patches: 3x3 (A) and mixed 3x3 + 2x2 (B) blossoms on short stems over a leafy base, so a
  // patch reads as flowers at 640x360 (each blossom: lit top-left texel, shaded bottom-right, a tint2 eye)
  const bloom3 = (L, x, y) => {
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) px(L, x + dx, y + dy, 1);
    px(L, x, y + 2, 2); px(L, x + 1, y + 2, 2); px(L, x + 2, y, 4); px(L, x + 1, y + 1, 3);
  };
  const leafBase = (L) => { for (const [x, y] of [[1, 0], [2, 0], [3, 1], [4, 0], [6, 0], [7, 1], [8, 0], [9, 0], [11, 0], [12, 1], [13, 0], [14, 0], [5, 1], [10, 1], [2, 1], [13, 1]]) px(L, x, y, 0); };
  {
    const L = [];
    leafBase(L);
    for (const [x, y] of [[1, 3], [5, 6], [10, 4], [12, 8], [7, 10], [2, 9]]) { for (let yy = 1; yy < y; yy++) px(L, x + 1, yy, 0); bloom3(L, x, y); }
    art.push({ L, bend: 6 });
  }
  {
    const L = [];
    leafBase(L);
    for (const [x, y] of [[0, 4], [4, 2], [8, 6], [12, 3], [5, 9]]) { for (let yy = 1; yy < y; yy++) px(L, x + 1, yy, 0); bloom3(L, x, y); }
    for (const [x, y] of [[3, 6], [11, 9], [14, 6], [9, 11]]) { for (let yy = 1; yy < y; yy++) px(L, x, yy, 0); blossom2(L, x, y); }
    art.push({ L, bend: 6 });
  }
  { // 15 big ivy: 2x2 lobed leaves (green + a lighter accent texel) on a wandering vine, ~12 px tall
    const L = [];
    const leaf2 = (x, y, lit) => { px(L, x, y, 0); px(L, x + 1, y, 0); px(L, x, y + 1, lit ? 1 : 0); px(L, x + 1, y + 1, 0); };
    for (const [x, y] of [[7, 0], [7, 1], [8, 2], [8, 3], [7, 4], [7, 5], [8, 6], [8, 7], [7, 8], [7, 9], [8, 10]]) px(L, x, y, 0);
    for (const [x, y, lit] of [[5, 1, 0], [9, 2, 1], [4, 4, 1], [9, 5, 0], [10, 7, 1], [5, 7, 1], [3, 9, 0], [9, 10, 1], [6, 11, 1], [11, 3, 0], [2, 6, 0], [12, 9, 1]]) leaf2(x, y, lit);
    art.push({ L, bend: 99 });
  }
  art.forEach(({ L, bend }, v) => {
    for (let f = 0; f < 2; f++) for (const [x, y, k] of L) {
      const xx = x + (f === 1 && y >= bend ? 1 : 0);
      if (xx < 0 || xx >= SCELL || y < 0 || y >= SCELL) continue;
      const i = ((f * SCELL + y) * W + v * SCELL + xx) * 4;
      data[i] = k * 50; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
    }
  });
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false; tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  SPRITE_ATLAS = tex;
  return tex;
}

function spriteMaterial(engine) {
  engine._foliageSpriteMat ??= (() => {
    const m = toonMaterial(engine, {
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.NoBlending, alphaTest: 0.5,
      outline: 'none', toneAttributes: true, lightPos: 'aBase',
      uniforms: { tSprAtlas: { value: spriteAtlas() }, uSprGrid: { value: new THREE.Vector2(NSPR, 2) } },
      vertexHead: /* glsl */`
        attribute vec3 aBase, aN, aTint, aTint2; attribute vec4 aVar;   // aVar: variant, phase, bump, view push (m)
        uniform vec2 uSprGrid; varying vec2 vSUv; varying vec3 vTint, vTint2; varying float vBump;`,
      objectNormal: 'objectNormal = aN;',
      vertex: /* glsl */`
        {
          float tq = floor(uTime * 3.0) / 3.0;                                  // stepped 3 fps, pure f(t)
          float ph = dot(aBase.xz, vec2(0.37, 0.23)) + aVar.y * 6.283;
          float g = sin(tq * 1.9 + ph) * 0.6 + sin(tq * 4.1 + ph * 1.7) * 0.4;
          vSUv = (uv + vec2(aVar.x, g > 0.35 ? 1.0 : 0.0)) / uSprGrid;
          vTint = aTint; vTint2 = aTint2; vBump = aVar.z;
        }`,
      viewVertex: /* glsl */`
        {
          vec4 b = viewMatrix * modelMatrix * vec4(aBase, 1.0);
          vec3 wb = (modelMatrix * vec4(aBase, 1.0)).xyz;
          vec3 rr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 uu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          b.x = floor(dot(wb, rr) / uTexelWorld + 0.5) * uTexelWorld + viewMatrix[3][0];   // world-anchored texel corner
          b.y = floor(dot(wb, uu) / uTexelWorld + 0.5) * uTexelWorld + viewMatrix[3][1];
          b.z += 0.05 + aVar.w;
          mvPosition = b + vec4(position.xy * uTexelWorld, 0.0, 0.0);
        }`,
      fragmentHead: /* glsl */`uniform sampler2D tSprAtlas; varying vec2 vSUv; varying vec3 vTint, vTint2; varying float vBump;
        ${FLOWER_LIGHT_GLSL}`,
      albedo: /* glsl */`
        vec4 sA = texture2D(tSprAtlas, vSUv);
        if (sA.a < 0.5) discard;`,
      tones: /* glsl */`
        int sk = int(sA.r * 255.0 / 50.0 + 0.5);
        if (sk > 0) {
          vec3 tint = sk == 3 ? vTint2 : vTint;
          if (sk == 2) tint = min(tint * 1.22 + 0.03, vec3(1.0));
          if (sk == 4) tint = tint * vec3(0.62, 0.6, 0.78);
          vec3 fh = tint, fm = tint * 0.85, fs = tint * vec3(0.50, 0.52, 0.78);
          if (vBump > 0.5) { toonHi = fh; toonMid = fh; toonSh = fm; } else { toonHi = fh; toonMid = fm; toonSh = fs; }
          toonHi = flowerTone(toonHi, tint, uRampHi, true);
          toonMid = flowerTone(toonMid, tint, uRampMid, false);
        }`,
    });
    m.depthWrite = false; m.blending = THREE.NoBlending;
    // greens (ferns, tufts, ivy) follow the leaf rule; accents (flowers, blossom stars, berries) keep their hue
    springPatch(engine, m, '(sk > 0 ? 1.0 : 0.0)', { mid: true });
    return m;
  })();
  return engine._foliageSpriteMat;
}

/** A field of sprites: add(kind, x, y, z, {ramp, tint, tint2, n, bump, push}) then build(renderOrder). */
class SpriteField {
  constructor(engine, name) { this.engine = engine; this.name = name; this.items = []; }
  add(kind, x, y, z, { ramp = P.grass, tint = P.flowerWhite, tint2 = P.ivory, n = [0, 1, 0], bump = 0, push = 0, phase = 0 } = {}) {
    this.items.push({ v: SPR[kind], x, y, z, ramp, tint, tint2, n, bump, push, phase });
  }
  build(renderOrder) {
    const N = this.items.length;
    if (!N) return null;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(SCELL, SCELL).translate(0, SCELL / 2, 0);
    geo.index = quad.index;
    for (const k of ['position', 'uv', 'normal']) geo.setAttribute(k, quad.attributes[k]);
    const S = { aBase: 3, aN: 3, aTint: 3, aTint2: 3, aVar: 4, color: 3, toneHi: 3, toneSh: 3 };
    const O = {};
    for (const k in S) { O[k] = new Float32Array(N * S[k]); geo.setAttribute(k, new THREE.InstancedBufferAttribute(O[k], S[k])); }
    geo.instanceCount = N;
    const col = new Map(), C = (hex) => { if (!col.has(hex)) col.set(hex, new THREE.Color(hex)); return col.get(hex); };
    const fill = () => {
      this.items.forEach((it, j) => {
        O.aBase.set([it.x, it.y, it.z], j * 3); O.aN.set(it.n, j * 3);
        const t = C(it.tint), t2 = C(it.tint2), hi = C(it.ramp[0]), mid = C(it.ramp[1]), sh = C(it.ramp[2]);
        O.aTint.set([t.r, t.g, t.b], j * 3); O.aTint2.set([t2.r, t2.g, t2.b], j * 3);
        O.color.set([mid.r, mid.g, mid.b], j * 3); O.toneHi.set([hi.r, hi.g, hi.b], j * 3); O.toneSh.set([sh.r, sh.g, sh.b], j * 3);
        O.aVar.set([it.v, it.phase, it.bump, it.push], j * 4);
      });
      for (const k in S) geo.attributes[k].needsUpdate = true;
    };
    let last = '';
    const sort = () => {
      const c = this.engine.camera, key = `${c.yaw.toFixed(4)},${c.pitch.toFixed(4)}`;
      if (key === last) return;
      last = key;
      const fx = -Math.cos(c.pitch) * Math.sin(c.yaw), fy = -Math.sin(c.pitch), fz = -Math.cos(c.pitch) * Math.cos(c.yaw);
      for (const it of this.items) it.d = it.x * fx + it.y * fy + it.z * fz - it.push;
      this.items.sort((a, b) => b.d - a.d);
      fill();
    };
    sort();
    this.engine.onUpdate(sort);
    const mesh = new THREE.Mesh(geo, spriteMaterial(this.engine));
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.renderOrder = renderOrder; mesh.name = this.name;
    return mesh;
  }
}

// ------------------------------------------------------------------------------------------------ ivy helper (export)
/**
 * Optional helper for building owners: ivy / creeper sprites on a wall (one draw call, the foliage sprite program).
 *   const m = ivy(engine, { x0, x1, y0, y1, at: [x, z] wall-plane point, normal: [nx, nz], seed, density, ramp });
 *   group.add(m);   // world coordinates (the composer's town root adds the anti-tie nudge)
 * Leaves cluster in a few climbing stems from the foot of the wall (denser low down), lit with the wall normal,
 * pushed 0.05 m off the wall toward the camera. `ramp` defaults to the leaf ramp; pass P.mossTuft for a lighter vine.
 * x0..x1 run along the wall (local, metres from `at`), y0..y1 heights.
 */
export function ivy(engine, { x0 = -0.5, x1 = 0.5, y0 = 0, y1 = 2, at = [0, 0], normal = [0, 1], seed = 1, density = 1, ramp = P.leaf, big = true } = {}) {
  const r = rng(seed * 7349 + 11);
  const f = new SpriteField(engine, 'ivy');
  const n = [normal[0], 0, normal[1]], t = [-normal[1], normal[0]];
  const stems = Math.max(1, Math.round((x1 - x0) * 1.2 * density));
  // big (default): 2-texel leaves, the lighter accent texel in the ramp's hi lifted toward new growth
  const tint = mixHex(ramp[0], NEW_GROWTH, 0.5);
  for (let s = 0; s < stems; s++) {
    let u = x0 + (s + 0.2 + r() * 0.6) * (x1 - x0) / stems, y = y0;
    const top = y0 + (y1 - y0) * (0.45 + r() * 0.55);
    while (y < top) {
      f.add(big ? 'ivyBig' : 'ivy', at[0] + t[0] * u + n[0] * 0.05, y, at[1] + t[1] * u + n[2] * 0.05, { ramp, n, tint, phase: r(), push: 0.12 });
      y += (big ? 0.2 : 0.16) + r() * 0.12; u += (r() - 0.5) * 0.22;
      u = Math.min(x1, Math.max(x0, u));
    }
  }
  return f.build(1);
}

// ------------------------------------------------------------------------------------------------ kit helpers
/**
 * Spring fruit trees at the forest margin (where v1-port dead snags stood; the user's §11 spring rule: no bare
 * trees): [x, z, height, crown radius, palette, seed]. The two by the clock tower flank its spire with blossom.
 */
const BLOSSOM_SLOTS = [[19.63, 2.37, 4.0, 1.25, 'blossomW', 3], [26.13, 1.71, 3.8, 1.2, 'blossomP', 7], [-0.62, 33.43, 3.5, 1.2, 'blossomW', 11]];
const V = (a) => new THREE.Vector3(...a);
/** A tapered square limb from p0 to p1 (radii r0 -> r1), its faces turned 45 deg about the axis. */
function limb(b, p0, p1, r0, r1, tones, opts = {}) {
  const a = V(p0), c = V(p1), ax = c.clone().sub(a).normalize();
  const ref = Math.abs(ax.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(ax, ref).normalize(), v = new THREE.Vector3().crossVectors(ax, u).normalize();
  const U = u.clone().add(v).multiplyScalar(Math.SQRT1_2), W = u.clone().sub(v).multiplyScalar(Math.SQRT1_2);
  const C = [];
  for (let i = 0; i < 8; i++) {
    const end = i & 4 ? c : a, r = i & 4 ? r1 : r0;
    C.push(end.clone().addScaledVector(U, (i & 1 ? 1 : -1) * r).addScaledVector(W, (i & 2 ? 1 : -1) * r));
  }
  b.hexa(C, { tones, ...opts });
}

/** The v1 stump (props.ts stump): bark sides, pale ring top, root flares, moss, shelf fungi (Toadstool Hollow's spores). */
function stump(b, x, z) {
  b.cylinder(0.37, 0.31, 0.43, { segments: 8, tones: 'trunk', at: [x, -0.06, z] });
  b.cylinder(0.285, 0.285, 0.05, { segments: 8, tones: 'plank', tint: 1.04, at: [x, 0.36, z] });          // cut face
  b.cylinder(0.165, 0.165, 0.038, { segments: 8, tones: 'plank', tint: 0.94, at: [x + 0.011, 0.403, z - 0.013] });   // inner rings
  b.cylinder(0.06, 0.06, 0.04, { segments: 8, tones: 'trunk', at: [x + 0.011, 0.435, z - 0.013] });                 // heart
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 + 17) * Math.PI / 180, L1 = 0.36 + (i % 2) * 0.12;
    limb(b, [x + Math.cos(a) * 0.2, 0.2, z + Math.sin(a) * 0.2], [x + Math.cos(a) * (0.32 + L1), -0.03, z + Math.sin(a) * (0.32 + L1)], 0.085, 0.04, 'trunk');
  }
  b.box(0.26, 0.07, 0.2, { tones: 'mossTuft', layer: 'soft', at: [x - 0.12, 0.37, z - 0.12], ry: Math.PI / 4 });   // moss cushion
  b.box(0.2, 0.06, 0.16, { tones: 'mossTuft', layer: 'soft', at: [x + 0.31, 0.0, z + 0.2], ry: Math.PI / 4 });
  for (const [dx, y, w] of [[-0.13, 0.19, 0.105], [0.17, 0.12, 0.085]]) {               // shelf fungi, south face
    b.prism([[-w, 0], [w, 0], [w * 0.7, 0.05], [0, 0.068], [-w * 0.7, 0.05]], 0.09, { tones: 'dial', at: [x + dx, y, z + 0.33], rx: -Math.PI / 2 });
  }
}

/** Lawn grass when the ground piece does not provide it (createGrass on the ground's terrain, or a flat stand-in). */
function townGrass(engine, ctx, terrain) {
  const L = ctx.layout;
  const UP = new THREE.Vector3(0, 1, 0);
  const T = terrain ?? {
    size: 120, center: [22.5, 14], heightAt: () => 0, normalAt: () => UP, isGrass: () => true,
    tonesAt: (() => { const t = { hi: new THREE.Color(P.grass[0]), mid: new THREE.Color(P.grass[1]), sh: new THREE.Color(P.grass[2]) }; return () => t; })(),
  };
  const fps = [...L.houses, L.clocktower].map((h) => h.footprint);
  const onFoot = (x, z) => fps.some((f) => x > f.x - 0.12 && x < f.x + f.w + 0.12 && z > f.z - 0.12 && z < f.z + f.d + 0.12);
  const onObj = (x, z) => L.objects.some((o) => o.owner !== 'house' && x > o.rect.x - 0.05 && x < o.rect.x + o.rect.w + 0.05 && z > o.rect.z - 0.05 && z < o.rect.z + o.rect.d + 0.05);
  const mask = (x, z) => {
    const g = L.groundAt(Math.floor(x), Math.floor(z));
    if (g !== '.' && g !== ',' && g !== ' ' && g !== 'T') return false;
    if (Math.hypot(x - L.PLAZA.cx, z - L.PLAZA.cz) < L.PLAZA.r + 0.15) return false;
    return !onFoot(x, z) && !onObj(x, z);
  };
  const g = createGrass(engine, T, { area: viewArea(engine, 3), r: 0.24, seed: 4, accent: 0.03, mask, flowers: { fraction: 0.02, seed: 9 } });
  for (const m of g.meshes) m.removeFromParent();
  return g;
}

// ------------------------------------------------------------------------------------------------ build
export default function build(engine, ctx) {
  const t0 = performance.now();
  const L = ctx.layout;
  const R = rng(ctx.seed);
  const group = new THREE.Group();
  group.name = 'foliage';
  const heightAt = (x, z) => (x > 1 && x < 44 && z > 1 && z < 36 ? 0 : ctx.heightAt(x, z));
  // the ground piece's no-tree mask (river + banks, the road out of town, the bridge); none on a pad
  const gapi = ctx.registry?.get('ground')?.api;
  const clear = typeof gapi?.clear === 'function' ? (x, z) => gapi.clear(x, z) : () => false;

  // quality tier (docs/TOWN.md §12.4): low = ~30 % fewer rim leaves (bigger leaf spacing), no rim outlines, a
  // thinner far belt. The layout's own trees (oak, bushes, the clock-tower pair) keep their full look.
  const low = ctx.params?.get('quality') === 'low';
  const lt = low ? 1.22 : 1;
  // ---- templates
  const T = {};
  const tms = {};
  const tpl = (key, spec) => { const a = performance.now(); T[key] = makeTemplate(engine, spec); tms[spec.kind] = (tms[spec.kind] ?? 0) + performance.now() - a; return T[key]; };
  let seedK = 1;
  const pines = [], rounds = [], youngs = [], blooms = [], bushes = [];
  // tiered spring pines (flattened leaf-clump skirts with light new-growth tips), never cones
  for (const [h, nv] of [[2.4, 1], [3.4, 1], [4.4, 2], [5.4, 2], [6.6, 2], [8.0, 1]]) for (let k = 0; k < nv; k++) pines.push(tpl(`pine${h}-${k}`, { kind: 'tierpine', pal: 'pine', seed: 100 + seedK++ * 7, height: h, leafTexels: 4.6 * lt }));
  // broadleaf rim trees: the bright leaf ramp, some young lime-green crowns, a few blossoming fruit trees
  for (const [h, nv] of [[3.6, 1], [4.8, 2], [6.0, 2]]) for (let k = 0; k < nv; k++) rounds.push(tpl(`round${h}-${k}`, { kind: 'round', pal: 'rim', seed: 300 + seedK++ * 7, height: h, leafTexels: 4.6 * lt }));
  for (const h of [4.4, 5.6]) youngs.push(tpl(`young${h}`, { kind: 'round', pal: 'young', seed: 400 + seedK++ * 7, height: h, leafTexels: 4.6 * lt }));
  for (const [h, pal] of [[3.6, 'blossomW'], [4.4, 'blossomP'], [4.0, 'blossomW']]) blooms.push(tpl(`bloom${h}-${pal}`, { kind: 'round', pal, seed: 450 + seedK++ * 7, height: h, radius: h * 0.32, leafTexels: 4.0 * lt, raiseThreshold: 0.45 }));
  for (const r of [0.45, 0.65, 0.9]) for (let k = 0; k < 2; k++) bushes.push(tpl(`bush${r}-${k}`, { kind: 'bush', pal: k ? 'young' : 'leaf', seed: 500 + seedK++ * 7, radius: r, leafTexels: 4.0 * lt }));
  // flowering shrubs (hawthorn white / wild-rose pink): the hedgerow and the low south belt
  const fbushes = [];
  for (const [r, pal] of [[0.5, 'blossomW'], [0.6, 'blossomP'], [0.75, 'blossomW']]) fbushes.push(tpl(`fbush${r}-${pal}`, { kind: 'bush', pal, seed: 560 + seedK++ * 7, radius: r, leafTexels: 3.8 * lt, raiseThreshold: 0.5 }));
  // low spring trees for the south belt (beyond the river): short broad crowns in the bright leaf / young ramps
  const lows = [];
  for (const [h, pal] of [[2.4, 'rim'], [2.8, 'young'], [3.2, 'rim'], [2.6, 'blossomW'], [3.0, 'blossomP'], [2.2, 'young']]) lows.push(tpl(`low${h}-${pal}`, { kind: 'round', pal, seed: 620 + seedK++ * 7, height: h, radius: h * 0.42, leafTexels: 4.2 * lt, raiseThreshold: BLOSSOM_TINT[pal] ? 0.48 : 0.6 }));
  const pick = (list, h) => {                                  // nearest height; ties (the variants) at random
    let best = list[0];
    for (const t of list) if (Math.abs(t.h - h) < Math.abs(best.h - h)) best = t;
    const tie = list.filter((t) => Math.abs(Math.abs(t.h - h) - Math.abs(best.h - h)) < 0.05);
    return tie[Math.floor(R() * tie.length)] ?? best;
  };

  const tplMs = Math.round(performance.now() - t0);
  const forest = new Forest(engine);
  const layoutBushes = [];
  const anchors = { perches: [], spots: {}, lights: [] };
  const topPines = [];                                         // the v1 top-row pine slots (no round trees near them)

  // ---- the layout's own trees (owner 'foliage')
  for (const o of ctx.record.objects) {
    let { x, z } = o.center;
    const r = rng(Math.floor(x * 131 + z * 71));
    if (o.kind === 'pine' || o.kind === 'pinetall') {
      const h = o.kind === 'pinetall' ? 5.4 : 4.4;
      const t = forest.add(pick(pines, h), x, -0.12, z, { quarter: Math.floor(r() * 4), scale: 0.95 + r() * 0.1, sway: 0.6 + r() * 0.4 });
      anchors.perches.push(new THREE.Vector3(x, t.top + 0.05, z));
      if (z <= 3) topPines.push({ x, z });
    } else if (o.kind === 'oak' || o.kind === 'oak2') {
      // oak: the green town oak; oak2: a pink-blossom tree (v1's "one oak in another colour", spring not autumn),
      // a touch smaller and nudged east/south inside its tile so the crown clears house-7's corner and porch
      // SHADOWS (verifier, user §11 "no missing shadows"): each oak stands beside a forest-edge street lamp (oak2 by
      // the (41,33) lamp, the green oak by the (3,33) lamp). At noon the lamp's long post shadow runs ~2.9 m east and
      // a little north (sun relAz 158, elev 46); oak2's trunk stood right on that line (+0.5, +0.45) and the green
      // oak's crown shadow sat along it, so both lamp shadows vanished into the tree. oak2's trunk now stands ~0.5 m
      // north of the line (+0.4, -0.25), the green oak ~0.5 m further from it (-0.4, -0.4): both stay inside their
      // collision tile, oak2's crown clears house-7's east wall as before, and the post shadows read on open lawn.
      const two = o.kind === 'oak2';
      if (two) { x += 0.4; z -= 0.25; } else { x -= 0.4; z -= 0.4; }
      const t = forest.add(tpl(o.kind, two
        ? { kind: 'round', pal: 'blossomP', seed: 77, height: 3.8, radius: 1.4, leafTexels: 3.5, raiseThreshold: 0.45 }
        : { kind: 'round', pal: 'oak', seed: 41, height: 4.4, radius: 1.7, leafTexels: 3.5 }), x, -0.12, z, { sway: 0.8 });
      t.oak = !two; t.bloom = two ? 'blossomP' : null;
      anchors.perches.push(new THREE.Vector3(x, t.top + 0.05, z));
    } else if (o.kind === 'bush' || o.kind === 'bushberry') {
      const k = o.kind === 'bushberry' ? 'bushberry' : `bush-${x}`;
      const t = forest.add(tpl(k, { kind: 'bush', pal: 'oak', seed: 600 + Math.floor(x * 3 + z), radius: 0.55, leafTexels: 3.2 }), x, -0.05, z);
      layoutBushes.push({ t, berry: o.kind === 'bushberry' });
      anchors.spots[`${o.kind}-${o.x}-${o.z}`] = new THREE.Vector3(x, 0, z);
    }
  }

  // ---- the forest rim (dense 'T' border + the belt beyond the map)
  const fps = [...L.houses, L.clocktower].map((h) => h.footprint);
  const distToFootprint = (x, z) => {
    let d = Infinity;
    for (const f of fps) {
      const dx = Math.max(f.x - x, 0, x - (f.x + f.w)), dz = Math.max(f.z - z, 0, z - (f.z + f.d));
      d = Math.min(d, Math.hypot(dx, dz));
    }
    return d;
  };
  const fixed = forest.trees.map((t) => ({ x: t.x, z: t.z, r: 1.6 }));
  // spring fruit trees in the old snag slots (crow perches on their crowns)
  const bloomSlots = [];
  for (const [x, z, h, , pal, sd] of BLOSSOM_SLOTS) {
    if (clear(x, z)) continue;
    const bt = blooms.filter((u) => u.spec.pal === pal).sort((u, w) => Math.abs(u.h - h) - Math.abs(w.h - h))[0];
    const t = forest.add(bt, x, heightAt(x, z) - 0.12, z, { quarter: sd & 3, scale: THREE.MathUtils.clamp(h / bt.h, 0.85, 1.1), sway: 0.7 });
    t.bloom = pal;
    bloomSlots.push(t);
    fixed.push({ x, z, r: 2.1 });
  }
  const inTown = (x, z) => x > 0.9 && x < 44.1 && z > 0.9 && z < 36.1;
  // the river's south reach: z of its centre line per 1 m column (from the ground piece's sampled polyline), so the
  // trees on its far bank can be capped to keep the water clear on screen (no crowns over it = no water flecks
  // in canopy holes): a point h m up at z covers the ground at z - 1.73 h from the gameplay camera
  const riverZ = new Map(), waterY = gapi?.waterLevel ?? 0;
  for (const [rx, rz] of gapi?.river ?? []) if (rz > 37) { const k = Math.round(rx); riverZ.set(k, Math.max(riverZ.get(k) ?? -Infinity, rz)); }
  const capH = (x, z) => {
    let h = 9;
    if (z > 35) h = Math.min(h, (z - 35.4) / 1.73 + 0.1);                       // yaw-0: tops stay below the hedge line (the cart road stays clear)
    if (x > 44 || z > 36) h = Math.min(h, Math.max(x - 44, z - 36) / 1.22 + 1.5); // iso from the south-east
    const rz = riverZ.get(Math.round(x));
    // far bank: keep the water open (the bank rises south of the river: the cap is on the absolute top above the water)
    if (rz !== undefined && z > rz) h = Math.min(h, Math.max(0, (z - rz - 2.1) / 1.73 + waterY - heightAt(x, z)));
    return h;
  };
  const accepted = [];
  const cand = [];
  // hedgerow on the south 'T' row (z 36..37): a LOW, light, mixed spring hedge ~0.8 m apart, the town's southern
  // edge: young lime-green and leaf-green shrubs with hawthorn-white / wild-rose flowering shrubs between them
  const hedgeGreen = [bushes[1], bushes[3], bushes[0], bushes[1], bushes[2]];   // young-heavy (lighter than the wood)
  for (let x = 0.6; x < 44.6; x += 0.72 + R() * 0.3) {
    const z = 36.55 + (R() - 0.5) * 0.35;
    const flower = R() < 0.36;
    const t = flower ? fbushes[Math.floor(R() * 2)] : hedgeGreen[Math.floor(R() * hedgeGreen.length)];
    const ft = forest.add(t, x, -0.06, z, { quarter: Math.floor(R() * 4), scale: Math.min(1.1, 0.72 / t.h) * (0.9 + R() * 0.2), sway: 0.3 });
    if (flower) ft.bloom = t.spec.pal;
    ft.hedge = true;
    fixed.push({ x, z, r: 1.05 });
  }
  for (let i = 0; i < 19000; i++) cand.push([-21 + R() * 88, -33 + R() * 90]);
  // LEAD: one random stream per candidate, so a per-tree decision that differs between quality tiers (a template's
  // drawn top) never re-deals the rest of the forest: both tiers place the same trees
  for (let ci = 0; ci < cand.length; ci++) {
    const [x, z] = cand[ci];
    const R = rng(((ctx.seed ?? 1) * 7919 + ci * 104729 + 17) >>> 0);
    if (inTown(x, z) || clear(x, z)) continue;
    const far = z < -12 || x < -9 || x > 54 || z > 44 ? 1 : 0;
    const vfar = z < -24 || x < -15 || x > 60 || z > 50;
    const cap = capH(x, z);
    const dF = distToFootprint(x, z);
    let kind, h;
    const south = z > 36.9;
    if (cap < 0.45) continue;                                    // the open meadow in front of the river
    if (cap < 1.7) { kind = 'bush'; h = cap; }
    else if (south && cap < 4.2) { kind = 'low'; h = cap; }       // the low spring belt: short broad crowns, fruit blossom
    else {
      // ~30 % broadleaf rounds mixed into the pine belt (spring wood, not a teal wall); the south belt is mostly
      // broadleaf (pines only far out), neighbours alternating so each crown reads against the next one's band
      kind = R() < (z < 1 ? 0.72 : south ? 0.28 : 0.66) ? 'pine' : 'round';
      if (south) {
        let nb = null, nd = 9;
        for (const a of accepted) { const d = (a.x - x) ** 2 + (a.z - z) ** 2; if (d < nd) { nd = d; nb = a; } }
        if (nb && nb.kind === 'pine' && R() < 0.75) kind = 'round';
      }
      const base = far ? 6.4 + R() * 2.2 : z < -5 ? 5.4 + R() * 2.0 : 4.2 + R() * 2.4;
      h = Math.min(base, cap);
      if (kind === 'round' && h < 3.2) kind = 'pine';
      if (kind === 'round' && topPines.some((p) => Math.hypot(p.x - x, p.z - z) < 2.0 + 1.2)) kind = 'pine';
    }
    // the south belt is spaced 1.4x so meadow / forest-floor gaps show between the low crowns
    const rad = (kind === 'bush' ? (south ? 1.5 : 1.0) : kind === 'low' ? 2.1 : (vfar ? 3.4 : far ? 2.9 : 2.25) * (0.75 + 0.25 * Math.min(1, h / 6))) * (south && kind !== 'bush' ? 1.4 : 1);   // LEAD: same placement at both tiers (low cuts per-tree geometry, never the layout)
    let ok = true;
    for (const a of accepted) if ((a.x - x) ** 2 + (a.z - z) ** 2 < Math.min(rad, a.rad) ** 2) { ok = false; break; }
    for (const a of fixed) if ((a.x - x) ** 2 + (a.z - z) ** 2 < a.r * a.r) ok = false;
    if (!ok) continue;
    const bushList = south ? [...bushes, ...fbushes, ...fbushes] : bushes;
    let list = kind === 'pine' ? pines : kind === 'round' ? rounds : kind === 'low' ? lows : bushList;
    if (kind === 'round') {
      const u = R();
      const edge = Math.min(Math.abs(x - 0.5), Math.abs(x - 44.5), Math.abs(z - 0.5), Math.abs(z - 36.5));
      if (u < (south ? 0.22 : 0.14) && edge < 9 && !far) list = blooms;   // blossoming fruit trees near the clearing
      else if (u < 0.42) list = youngs;
    }
    let t = kind === 'bush' ? bushList[Math.floor(R() * bushList.length)] : kind === 'low' ? lows[Math.floor(R() * lows.length)] : pick(list, h);
    let s = kind === 'bush' ? 0.8 + R() * 0.4 : THREE.MathUtils.clamp(h / t.h, 0.85, 1.15);
    // the cap holds for what is drawn: the highest leaf base + a sprite (~0.35 m at the gameplay zoom)
    const reach = (tt, ss) => tt.top * ss + 0.35;
    if (reach(t, s) > cap + 0.12) {
      const pool = kind === 'round' ? [...rounds, ...youngs] : kind === 'low' ? lows : list;
      const fit = pool.filter((u) => reach(u, 0.85) <= cap + 0.12).sort((u, w) => w.top - u.top)[0];
      if (fit) { t = fit; s = THREE.MathUtils.clamp((cap + 0.12 - 0.35) / fit.top, 0.85, 1.15); }
      else {
        const bb = bushList.filter((u) => reach(u, 0.8) <= cap + 0.12).sort((u, w) => w.top - u.top)[0];
        if (!bb) continue;
        t = bb; s = THREE.MathUtils.clamp((cap + 0.12 - 0.35) / bb.top, 0.8, 1.2);
      }
    }
    if (t.ext * s > dF - 0.2) {                    // keep crowns off the buildings
      if (dF < 0.9) continue;
      t = bushes[Math.floor(R() * bushes.length)]; s = 0.9;
      if (t.ext * s > dF - 0.2) continue;
    }
    accepted.push({ x, z, rad, kind: t.spec.kind === 'tierpine' ? 'pine' : t.spec.kind === 'bush' ? 'bush' : 'round' });
    const ft = forest.add(t, x, heightAt(x, z) - 0.12, z, { quarter: Math.floor(R() * 4), scale: s, sway: 0.35 + R() * 0.65 });
    if (BLOSSOM_TINT[t.spec.pal]) ft.bloom = t.spec.pal;
  }

  // what the build camera can see (+3 m margin for whole-texel pans): only those trees get leaf sprites
  const cam = engine.camera, yaw = cam.yaw, pit = cam.pitch, vh = cam.viewHeight, tg = cam.target;
  const Rv = [Math.cos(yaw), 0, -Math.sin(yaw)], Uv = [-Math.sin(pit) * Math.sin(yaw), Math.cos(pit), -Math.sin(pit) * Math.cos(yaw)];
  const visible = (t, m = 3) => {
    const hw = (vh * 640 / 360) / 2 + m, hh = vh / 2 + m;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (const y of [t.y, t.top]) {
      const px = t.x + dx * t.ext - tg.x, py = y - tg.y, pz = t.z + dz * t.ext - tg.z;
      const sx = px * Rv[0] + pz * Rv[2], sy = px * Uv[0] + py * Uv[1] + pz * Uv[2];
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return x1 > -hw && x0 < hw && y1 > -hh && y0 < hh;
  };
  const placeMs = Math.round(performance.now() - t0);
  // trunks of trees > 10 m outside the view are dropped (the decimated core still casts the crown's shadow)
  // the leaf-rim material of trees.js (createTree outline:true), borrowed from a tiny throwaway bush; high tier only
  const rimMat = low ? null : grab(engine, { kind: 'bush', pal: 'leaf', seed: 9, radius: 0.3, outline: true, maxLeaves: 8 }).getObjectByName('leaf-rim')?.material ?? null;
  // LOW tier (verifier perf-tier: foliage <= ~60k frame tris at the square, <= ~120k at house-14): only the first row of
  // the rim (<= 3.2 m outside the town edge) and the town's own trees keep the decimated coreLo; every rim tree beyond
  // it sits on the coarse coreFar (colour + shadow), and every tree keeps about half of its leaf sprites
  const edgeDist = (t) => Math.max(0.9 - t.x, t.x - 44.1, 0.9 - t.z, t.z - 36.1);
  const farRow = low ? (t) => edgeDist(t) > 3.2 : null;
  const leafKeep = low ? (t) => (edgeDist(t) > 3.2 ? 0.42 : 0.55) : null;
  // LOW: an off-view tree casts only if its shadow (base -> tip of the sun shadow of its top) can reach the view
  const sd = engine.uniforms.uSunDir?.value, sl = sd && sd.y > 0.05 ? [-sd.x / sd.y, -sd.z / sd.y] : null;
  const noCast = low && sl ? (t) => {
    if (t._nc !== undefined) return t._nc;
    const h = t.top - t.y;
    let reach = false;
    for (const k of [0, 0.35, 0.7, 1]) if (visible({ x: t.x + sl[0] * h * k, z: t.z + sl[1] * h * k, y: 0, top: 0, ext: t.ext }, 4)) { reach = true; break; }
    return (t._nc = !reach);
  } : null;
  const F = new THREE.Vector3(-Math.cos(pit) * Math.sin(yaw), -Math.sin(pit), -Math.cos(pit) * Math.cos(yaw));
  const fst = forest.build(group, { cull: true, visible, farOff: (t) => low || !visible(t, 10), lowDetail: vh > 20 || low, farCores: low, farRow, leafKeep, backCull: low ? F : null, noCast, offChunk: low ? 16 : 32, rimMat, outline: (C) => C.cz > 30, dapple: ctx.params?.get('dapple') !== '0' });
  fst.tplMs = tplMs; fst.tms = Object.fromEntries(Object.entries(tms).map(([k, v]) => [k, Math.round(v)])); fst.placeMs = placeMs; fst.forestMs = Math.round(performance.now() - t0);
  engine.stats.foliage = fst;
  if (ctx.params?.get('ftpl') === '1') fst.tpl = Object.fromEntries(Object.entries(T).map(([k, t]) => [k, [t.core.geo.attributes.position.count / 3, t.coreLo.geo.attributes.position.count / 3, t.coreFar.geo.attributes.position.count / 3, t.n, forest.trees.filter((u) => u.tpl === t).length]]));

  // ---- sprites: decal flowers / toadstools / tufts, ferns at the forest margin, berries + blossoms on bushes
  const ground = new SpriteField(engine, 'foliage-sprites');
  // SHADOW KEEP-OFF (verifier, user §11 shadows): ground sprites are lit at their root, so a fern / flower patch /
  // tuft rooted beside a lamp's or the stump's noon shadow is drawn lit OVER the shadowed lawn (a sprite stands up
  // to ~0.5 m tall on screen) and hides it. No ground sprite roots inside, or up to 0.5 m south (in front) of, the
  // noon sun shadow of a lamp (3.0 m post + head) or the stump: the ground's shadow shows through.
  {
    const N = TOWN_TOD.noon, a = THREE.MathUtils.degToRad(N.relAz), e = THREE.MathUtils.degToRad(N.elev);
    const dx = -Math.cos(a), dz = -Math.sin(a), k = 1 / Math.tan(e);        // gameplay yaw 0: shadow dir on the ground, length per m height
    const casters = [];
    for (const o of L.objects) {
      // the stump's own shadow is short (0.45 m tall) and its root flares cover half of it: a tighter zone that keeps
      // most of the red wildflower decal beside it
      if (o.kind === 'lamp') casters.push({ x: o.center.x, z: o.center.z, len: 3.0 * k, hw: 0.3, front: 0.5 });
      else if (o.kind === 'stump') casters.push({ x: o.center.x, z: o.center.z, len: 0.45 * k + 0.1, hw: 0.42, front: 0.2 });
    }
    const inShadow = (x, z) => casters.some((c) => [0, c.front / 2, c.front].some((n) => {
      const px = x - c.x, pz = z - n - c.z, s = px * dx + pz * dz, l = px * dz - pz * dx;
      return s > -c.hw && s < c.len + c.hw && Math.abs(l) < c.hw;
    }));
    const add0 = ground.add.bind(ground);
    ground.add = (kind, x, y, z, o) => { if (!inShadow(x, z)) add0(kind, x, y, z, o); };
    ground.addFree = add0;                                        // the stump's own toadstools sit at its foot
  }
  const FLOWER = { flowers_red: P.flowerRed, flowers_violet: P.flowerViolet, flowers_white: P.flowerWhite, flowers_yellow: P.flowerYellow };
  const jit = (r, tx, tz, m = 0.18) => [tx + m + r() * (1 - 2 * m), tz + m + r() * (1 - 2 * m)];
  for (const d of ctx.record.decals) {
    const r = rng(d.x * 9173 + d.z * 131 + 7);
    if (FLOWER[d.name]) {
      // a patch: 3-6 clumps of 3x3 / 2x2 blossoms clustered over ~1 m around the tile centre (+ a few stems)
      const n = 3 + Math.floor(r() * 4), cx = d.x + 0.5 + (r() - 0.5) * 0.2, cz = d.z + 0.5 + (r() - 0.5) * 0.2;
      const eye = d.name === 'flowers_yellow' ? P.flowerWhite : P.flowerYellow;
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, rr = 0.42 * Math.sqrt(r());
        ground.add(r() < 0.5 ? 'patchA' : 'patchB', cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr * 0.8, { ramp: P.grass, tint: FLOWER[d.name], tint2: eye, bump: 1, phase: r() });
      }
      for (let i = 0; i < 3; i++) {
        const [x, z] = jit(r, d.x, d.z, 0.06);
        ground.add(['flowerA', 'flowerB', 'flowerC'][Math.floor(r() * 3)], x, 0, z, { ramp: P.grass, tint: FLOWER[d.name], tint2: eye, bump: 1, phase: r() });
      }
    } else if (d.name === 'mushrooms') {
      const [x, z] = jit(r, d.x, d.z, 0.3);
      ground.add(r() < 0.5 ? 'toadstools' : 'toadstool', x, 0, z, { ramp: P.grass, tint: P.toadstool, tint2: P.ivory, phase: r() });
      const [x2, z2] = jit(r, d.x, d.z);
      ground.add('tuftB', x2, 0, z2, { ramp: P.leaf, phase: r() });
    } else if (d.name === 'tuft' || d.name === 'tuft2') {
      const n = d.name === 'tuft' ? 2 : 3;
      for (let i = 0; i < n; i++) { const [x, z] = jit(r, d.x, d.z); ground.add(r() < 0.5 ? 'tuftA' : 'tuftB', x, 0, z, { ramp: P.leaf, phase: r() }); }
    }
  }
  // the forest margin: ferns, bracken and long grass where the town meets the wood (forest-floor ',' row, the
  // inner edge of the side borders) and on the forest floor just outside the map
  const blockedTile = (tx, tz) => L.blocked(tx, tz);
  const marginTile = (tx, tz) => {
    const g = L.groundAt(tx, tz);
    if (g === ',') return true;
    if (g !== '.' || blockedTile(tx, tz)) return false;
    return tx <= 1 || tx >= 43 || tz <= 3;
  };
  for (let tz = 1; tz < 36; tz++) for (let tx = 1; tx < 44; tx++) {
    if (!marginTile(tx, tz)) continue;
    const r = rng(tx * 7919 + tz * 104729 + 3);
    const n = 1 + Math.floor(r() * 2.6);
    for (let i = 0; i < n; i++) {
      const [x, z] = jit(r, tx, tz, 0.1);
      const u = r();
      ground.add(u < 0.5 ? (r() < 0.5 ? 'fernA' : 'fernB') : u < 0.75 ? 'bracken' : (r() < 0.5 ? 'tuftA' : 'tuftB'), x, 0, z,
        { ramp: u < 0.5 ? P.forest : P.leaf, tint: P.dirt[0], phase: r() });
    }
  }
  {
    const r = rng(ctx.seed ^ 0x51ab);
    for (let i = 0; i < 2600; i++) {
      const x = -6 + r() * 57, z = -4 + r() * 44;
      if (inTown(x, z) || (z > 36 && z < 37.6)) continue;
      const edge = Math.min(Math.abs(x - 0.5), Math.abs(x - 44.5), Math.abs(z - 0.5));
      if (edge > 4 || r() > 0.55 || clear(x, z)) continue;
      const u = r();
      ground.add(u < 0.6 ? (r() < 0.5 ? 'fernA' : 'fernB') : u < 0.85 ? 'bracken' : 'tuftB', x, heightAt(x, z), z,
        { ramp: u < 0.6 ? P.forest : P.leaf, tint: P.dirt[0], phase: r() });
    }
  }
  // spring wildflower drifts: along the forest margin (~1 tile in 4) and at the south foot of the hedgerow
  {
    const r = rng(ctx.seed ^ 0x7f11);
    const tints = [P.flowerWhite, P.flowerYellow, P.flowerViolet, P.flowerWhite, PINK, P.flowerRed];
    const drift = (x, z, k) => {
      const tint = tints[k % tints.length], eye = tint === P.flowerYellow ? P.flowerWhite : P.flowerYellow;
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) ground.add(r() < 0.5 ? 'patchA' : 'patchB', x + (r() - 0.5) * 0.7, heightAt(x, z), z + (r() - 0.5) * 0.35, { ramp: P.grass, tint, tint2: eye, bump: 1, phase: r() });
    };
    let k = 0;
    for (let tz = 1; tz < 36; tz++) for (let tx = 1; tx < 44; tx++) {
      if (!marginTile(tx, tz) || r() > 0.27) continue;
      drift(tx + 0.5, tz + 0.5, k++);
    }
    // the meadow strip between the hedgerow and the river (z 37..38.5) and the far-bank meadow the river cap keeps
    // open: drifts of wildflowers + long-grass tufts (never in the water: the ground piece's isWater)
    const isW = typeof gapi?.isWater === 'function' ? (x, z) => gapi.isWater(x, z) : () => false;
    const wet = (x, z) => isW(x, z) || isW(x, z + 0.4) || isW(x, z - 0.4);
    for (let x = 0.6; x < 44.6; x += 0.9 + r() * 1.1) {
      const z = 37.1 + r() * 0.3;
      if (!wet(x, z)) drift(x, z, k++);
      const z2 = 37.75 + r() * 0.6;
      if (r() < 0.6 && !wet(x + 0.4, z2)) drift(x + 0.4, z2, k++);
      if (r() < 0.7 && !wet(x, z + 0.2)) ground.add(r() < 0.5 ? 'tuftA' : 'tuftB', x + (r() - 0.5) * 0.8, 0, z + 0.25 + r() * 0.6, { ramp: P.leaf, phase: r() });
    }
    for (const [x, z0] of [...riverZ.entries()].sort((a, b) => a[0] - b[0])) {
      if (x < -3 || x > 47) continue;
      for (let j = 0; j < 2; j++) {
        const xx = x + r() - 0.5, z = z0 + 1.9 + r() * 1.6;
        if (wet(xx, z) || r() < 0.3) continue;
        drift(xx, z, k++);
        ground.add(r() < 0.5 ? 'tuftA' : 'tuftB', xx + 0.3, heightAt(xx, z), z + 0.2, { ramp: P.leaf, phase: r() });
      }
    }
  }
  // berries on the berry bush, white blossoms on the others: dots on the upper leaf shell, drawn after the leaves
  const dots = new SpriteField(engine, 'foliage-bush-dots');
  for (const { t, berry } of layoutBushes) {
    const A = t.tpl.leaves.attrs, r = rng(Math.floor(t.x * 31 + t.z * 17));
    const cand = [];
    for (let i = 0; i < t.tpl.n; i++) if (A.aN[i * 3 + 1] > 0.25) cand.push(i);
    for (let k = 0; k < 7 && cand.length; k++) {
      const i = cand.splice(Math.floor(r() * cand.length), 1)[0];
      dots.add(berry ? 'berries' : 'blossoms', t.x + A.aBase[i * 3], t.y + A.aBase[i * 3 + 1] - 0.12, t.z + A.aBase[i * 3 + 2],
        { ramp: P.leaf, tint: berry ? P.berry : P.flowerWhite, tint2: P.flowerYellow, n: [A.aN[i * 3], A.aN[i * 3 + 1], A.aN[i * 3 + 2]], bump: 1, push: 0.42, phase: r() });
    }
  }

  // fruit blossom: white / pink five-petal stars over the upper, sunward leaf shell of every blossom tree with drawn
  // leaves (the oak2 pink tree, the clock-tower pair, the rim fruit trees), skipping leaves culled inside a neighbour
  const leafWorld = (t, i, out) => {
    const A = t.tpl.leaves.attrs, th = t.q * Math.PI / 2, c = Math.cos(th), sn = Math.sin(th);
    const lx = A.aBase[i * 3] * t.s, ly = A.aBase[i * 3 + 1] * t.s, lz = A.aBase[i * 3 + 2] * t.s;
    out.set(t.x + lx * c + lz * sn, t.y + ly, t.z - lx * sn + lz * c);
    const nx = A.aN[i * 3], nz = A.aN[i * 3 + 2];
    return [nx * c + nz * sn, A.aN[i * 3 + 1], -nx * sn + nz * c];
  };
  let bloomDots = 0;
  for (const t of forest.trees) {
    if (!t.bloom || t.lo) continue;
    const A = t.tpl.leaves.attrs, r = rng(Math.floor(t.x * 53 + t.z * 29) + 5), w = new THREE.Vector3();
    const cand = [...Array(t.tpl.n).keys()];
    const want = Math.min(90, Math.round(t.tpl.n * (t.bloom === 'blossomP' ? 0.075 : 0.065)));
    for (let k = 0, got = 0; got < want && cand.length && k < want * 6; k++) {
      const i = cand.splice(Math.floor(r() * cand.length), 1)[0];
      const n = leafWorld(t, i, w);
      // only the shell the cameras see (top, south, east): blossom on the far side would be wasted
      if (!(n[1] > 0.2 || n[2] > 0.05 || n[0] > 0.35) || forest.hidden(t, w.x, w.y, w.z)) continue;
      got++;
      dots.add('blossoms', w.x, w.y - 0.1, w.z, { ramp: P.leaf, tint: BLOSSOM_TINT[t.bloom], tint2: t.bloom === 'blossomP' ? P.flowerWhite : P.flowerYellow, n, bump: 1, push: 0.42, phase: r() });
      bloomDots++;
    }
  }

  // ---- kit pieces: the mossy stump, gnarled oak roots
  const b = new Builder(engine, { name: 'foliage-kit' });
  for (const o of ctx.record.objects) if (o.kind === 'stump') {
    const { x, z } = o.center;
    stump(b, x, z);
    anchors.perches.push(new THREE.Vector3(x + 0.013, 0.47, z + 0.011));
    anchors.spots.stump = new THREE.Vector3(x, 0.47, z);
    ground.addFree('toadstools', x + 0.33, 0, z + 0.31, { ramp: P.grass, tint: P.toadstool, tint2: P.ivory });
    ground.addFree('toadstool', x - 0.38, 0, z + 0.22, { ramp: P.grass, tint: P.toadstool, tint2: P.ivory, phase: 0.4 });
  }
  for (const t of forest.trees) if (t.oak) {
    const r = rng(Math.floor(t.x * 97));
    for (let i = 0; i < 6; i++) {
      const a = (i * 2 + (r() < 0.5 ? 0 : 1)) * Math.PI / 6 + 0.13, L1 = 0.42 + r() * 0.26;
      const p0 = [t.x + Math.cos(a) * 0.12, 0.3 + r() * 0.1, t.z + Math.sin(a) * 0.12];
      const p1 = [t.x + Math.cos(a) * (L1 * 0.55), 0.11, t.z + Math.sin(a) * (L1 * 0.55)];
      const p2 = [t.x + Math.cos(a + 0.25) * L1, -0.04, t.z + Math.sin(a + 0.25) * L1];
      limb(b, p0, p1, 0.085, 0.062, 'trunk');
      limb(b, p1, p2, 0.062, 0.036, 'trunk');
    }
  }
  // crow perches on the blossom trees' crowns (the clock-tower pair): the top leaf + two high side clumps
  for (const t of bloomSlots) {
    const A = t.tpl.leaves.attrs, w = new THREE.Vector3(), idx = [...Array(t.tpl.n).keys()].sort((a, c) => A.aBase[c * 3 + 1] - A.aBase[a * 3 + 1]);
    for (const i of [idx[0], idx[Math.floor(idx.length * 0.04)], idx[Math.floor(idx.length * 0.09)]]) { leafWorld(t, i, w); anchors.perches.push(w.clone().setY(w.y + 0.06)); }
  }
  group.add(b.build());
  // ivy up the south face of the green oak's trunk (the ivy() helper, as offered to building owners)
  for (const t of forest.trees) if (t.oak && t.tpl.spec.pal === 'oak') {
    const m = ivy(engine, { x0: -0.26, x1: 0.28, y0: 0.05, y1: 1.7, at: [t.x + 0.013, t.z + 0.34], normal: [0, 1], seed: 5, density: 4 });
    if (m) group.add(m);
  }
  const sprites = ground.build(-5);
  if (sprites) group.add(sprites);
  const dm = dots.build(3);
  if (dm) group.add(dm);

  // ---- grass: the ground piece paints the lawn; if it does not (pad turntables, or a ground without grass),
  // foliage grows it, masked off cobbles, the plaza, buildings and every object footprint
  const gp = ctx.registry?.get('ground');
  const groundHasGrass = !!(gp && (gp.stats?.grass || gp.api?.grass));
  let grassCount = 0;
  if (!groundHasGrass || ctx.params?.get('fgrass') === '1') {
    const g = townGrass(engine, ctx, gp?.api?.terrain ?? null);
    if (g) { group.add(...g.meshes); grassCount = g.count; }
  }

  // anchors for life: perches (pine tips, oak crowns, blossom-tree crowns, the stump), spots (bushes, the stump, forest
  // margins where fireflies / deer / crows can appear), no lights (foliage never glows)
  Object.assign(anchors.spots, {
    blossomWest: bloomSlots[0] ? new THREE.Vector3(bloomSlots[0].x, 0, bloomSlots[0].z) : undefined,
    forestNW: new THREE.Vector3(2.2, 1.2, 3.4), forestNE: new THREE.Vector3(42.8, 1.2, 3.6),
    forestW: new THREE.Vector3(1.4, 1.0, 26.5), forestE: new THREE.Vector3(43.6, 1.0, 20.5),
    hedgeSouth: new THREE.Vector3(22.5, 0.6, 36.6),
  });
  for (const k of Object.keys(anchors.spots)) if (!anchors.spots[k]) delete anchors.spots[k];
  // review: ?fhide=<mesh name>,... hides those foliage meshes (bisecting a pass / shadow problem)
  const fhide = ctx.params?.get('fhide');
  if (fhide) { const hs = fhide.split(','); group.traverse((o) => { if (o.isMesh && hs.some((h) => o.name.startsWith(h))) o.visible = false; }); }
  const treeList = forest.trees.map((t) => ({ x: t.x, z: t.z, top: t.top, r: t.ext, kind: t.tpl.spec.kind }));
  return {
    group, anchors,
    api: {
      trees: treeList,                                   // [{x, z, top, r, kind}] every tree / bush (world)
      ivy: (opts) => ivy(engine, opts),                  // see ivy() above
      capHeight: capH,                                   // the rim's occlusion cap at (x, z)
    },
    stats: { grass: grassCount, trees: fst.trees, leaves: fst.leaves, culled: fst.culled, chunks: fst.chunks, templates: Object.keys(T).length, bloomDots, coreTris: fst.coreTris, trunkTris: fst.trunkTris, offview: fst.offview, ms: Math.round(performance.now() - t0) },
  };
}
