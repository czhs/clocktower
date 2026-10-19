// Outline + convex edge-highlight pass (t3ssel8r / David Holland model). Owner: "outlines".
// docs/TECHNIQUES.md §2. Pass name 'outline', order 100, runs on the lit colour.
//
// Per low-res pixel, against its 4 neighbours (never diagonals → lines stay exactly 1 px):
//  * Depth outline (silhouette), drawn on the NEARER pixel only. Each pixel predicts its neighbour's
//    depth from its own depth + normal (t3ssel8r: "outline points that have a neighbour whose depth is
//    greater than predicted"), so planar slopes and grazing ground never produce lines. To make the line
//    strictly one-sided and to keep convex creases (where both pixels lie *behind* each other's plane)
//    from turning into outlines, the reverse prediction (neighbour plane → this pixel) must say that this
//    pixel is IN FRONT of the neighbour's plane: occlusion = fwd > thr && rev < -thr/2; convex = fwd > 0 && rev > 0.
//    The threshold is isotropic per face (slope tolerance uses the full depth-gradient magnitude, not the
//    component towards the neighbour), so a step between two parallel faces gets the same verdict for
//    horizontal and vertical neighbours: a solid line or none, never a dashed staircase that crawls.
//  * Convex edge highlight (rim): only on block-top edges, like the refs. The crease must be convex
//    (Holland's cross product, |sin| > convexThr ≈ 25°), the owning pixel's face must be top-facing
//    (world n.y > topY) and its neighbour clearly less so (Δ world n.y > rimDrop): vertical-vs-vertical
//    creases (trunks), low terrain/rock dihedrals and terrain-triangulation tents never fire. Exactly one
//    side owns it (the top face). A FLAG_DEPTH_ONLY neighbour also vetoes the crease (terrain risers/banks).
//  * Colours come from the local lit colour: outline = luminance compressed towards a floor (t3ssel8r:
//    lit stone #BBAC97 → #8A8090, mid #8C7E72 → #706D74, shade faces barely darker), desaturated and pulled
//    cool (never black); highlight = lightened + pulled towards the rim colour (cream at noon, orange at
//    golden hour via engine.style.outline.rim). Both are light-aware: the rim needs a sun-facing, unshadowed
//    top face (edgeShadow ≈ 0.1 → creases inside shade get almost nothing).
//  * Crawl safety (whole-texel pans must be bit-stable): decisions compare only flat-face quantities with
//    margins; the sun shadow lookup is a bilinear 2×2 PCF (continuous in the reconstructed world position,
//    so float jitter of the depth can't flip a rim between lit and shadowed); the output can be rounded to
//    8-bit sRGB (quantize).
//  * Flags (rtNormal.a): FLAG_NONE pixels (grass, leaves, canopy cores) are never painted and act as
//    depth-only neighbours (their depth is the ground behind them, §0.4). FLAG_DEPTH_ONLY → no edges,
//    FLAG_EDGES_ONLY → no depth outline. Background (flag 0) is never painted.
//    FLAG_CHAR (characters, look owner): a character pixel tests only its FLAG_CHAR neighbours (inner lines:
//    arm over body, cape over tunic), never the world/background (no silhouette line), and never gets an edge
//    highlight. A world pixel treats a FLAG_CHAR neighbour as a depth-only neighbour: a pillar in front of a
//    character keeps its normal line, the ground around the feet never gets a rim.
//    Inner lines only between different PARTS: look.js encodes a part id (dominant bone + palette colour) in the
//    flag (FLAG_CHAR + id·2^-11); equal ids → no line (a lathe's crown over its own back brim stays clean).
//
// Tunables are uniforms (see DEFAULTS); scenes call applyOutlineStyle(engine, {...}).
// Debug: ?outlineDebug=1 → grey image, outlines red, edge highlights green (also opts.debug).
//        ?outlineDebug=2 → as 1, plus decisions within fragEps (1 %) of flipping: yellow (outline), cyan (rim).
import * as THREE from 'three';

export const OUTLINE_DEFAULTS = {
  depthThr: 0.02,          // world units, constant part of the silhouette threshold
  depthThrTexels: 1.0,     // + this many texels (× uTexelWorld)
  slopeTol: 0.12,          // + this × |depth gradient| (texels/texel) × texel: grazing smooth slopes
  obliqueBoost: 1.0,       // threshold × (1 + boost·obliqueness) on faces with view n.z < 0.5 (H's 1..2×)
  convexThr: 0.42,         // min |cross| convexity for an edge highlight (≈ 25° crease)
  topY: 0.55,              // rim owner must be top-facing: world n.y above this
  rimDrop: 0.35,           // ... and its neighbour's world n.y at least this much lower (a block edge; > 1-cos45 so
                           //     45° chamfers, the commonest bevel, sit clear of the knife edge)
  tieEps: 0.06,            // kept for API compatibility (ownership is now decided by world n.y)
  outlineDark: 0.35,       // outline luma = min(l·outlineMax, l·outlineDark + outlineFloor) (linear)
  outlineFloor: 0.08,      //   → hi stone .42 → .23, mid .22 → .16 (refs), shade faces ≈ l·outlineMax
  outlineMax: 0.82,        //   (never lighter than this fraction of the face)
  outlineDesat: 0.55,      // 0 = keep local hue, 1 = fully re-tinted by outlineTint
  outlineTint: [1.04, 0.95, 1.24],  // cool tint (≈ unit luma) the outline is pulled towards
  outlineShadow: 0.8,      // outline strength on unlit / shadowed faces (1 = same as lit)
  edgeMul: [1.25, 1.25, 1.15],      // highlight = mix(col·edgeMul, edgeCream, edgeLift)
  edgeCream: [1.0, 0.965, 0.79],    // linear #FFFBE6 (t3ssel8r "corner brightness")
  edgeLift: 0.32,          // pull towards the cream (keeps dark materials rimmed, hue-preserving-ish)
  edgeShadow: 0.1,         // highlight strength on unlit / shadowed top faces (0..1)
  rimWarm: 2.0,            // warm time of day: rim colour = cream × (rim/noonRim)^(1 + rimWarm·warmth)
  rimWarmLift: 0.62,       //   and the pull towards it rises to this (golden rims read orange, #D98C4A)
  litSoft: 0.12,           // N·L smoothstep width for the lit factor
  useShadowMap: true,      // light-aware strengths include cast shadows
  quantize: true,          // round the output to 8-bit sRGB (float jitter below ½ LSB can't change a byte)
  depth: true,             // global enable for depth outlines
  edges: true,             // global enable for edge highlights
  debug: 0,                // 1 = red outlines / green edges over grey, 2 = + near-flip decisions
  // (module fix, wave 4; characters only) inner lines of TONE parts (look.js material.innerLine / slots.<x>.line
  // 'tone'): colour from the DARKER of the two adjacent pixels, hue kept (desat charToneDesat instead of outlineDesat)
  charToneDesat: 0.2,
};

const FRAG = /* glsl */`
#include <packing>
uniform float uDepthThr, uDepthThrTexels, uObliqueBoost, uConvexThr, uSlopeTol, uTopY, uRimDrop;
uniform float uOutlineDark, uOutlineFloor, uOutlineMax, uOutlineDesat, uOutlineShadow, uEdgeShadow, uLitSoft;
uniform vec3 uOutlineTint, uEdgeMul, uEdgeCream; uniform float uEdgeLift, uEdgeStrength;
uniform float uEnableDepth, uEnableEdges, uQuantize, uCharToneDesat;
uniform int uDebug; uniform float uFragEps;
uniform sampler2D tShadow; uniform mat4 uShadowMatrix; uniform float uShadowBias, uHasShadow; uniform vec2 uShadowSize;

// (module fix, wave 4) world flags are exact half floats (0.25 / 0.5 / 0.75 / 1.0): ± 0.02 classifies them exactly as
// ± 0.05 did; the character band is FLAG_CHAR ± 0.08 (part ids ±1..±78, inner-line TONE parts ±79..±156 = ± 0.0762)
bool isNone(float f) { return abs(f - FLAG_NONE) < 0.05; }
bool isDepthOnly(float f) { return abs(f - FLAG_DEPTH_ONLY) < 0.02; }
bool isChar(float f) { return abs(f - FLAG_CHAR) < 0.08; }
// FLAG_CHAR pixels carry a part id (look.js: FLAG_CHAR + id·2^-11, 1 ≤ |id| ≤ 156; same id = same part; 0 = no part info)
float charPart(float f) { return floor((f - FLAG_CHAR) * 2048.0 + 0.5); }
bool charTone(float f) { return abs(charPart(f)) > 78.5; }   // look.js inner-line tone part

float shadowTap(vec2 st, float z) {
  return step(z + uShadowBias, unpackRGBAToDepth(texture2D(tShadow, (st + 0.5) / uShadowSize)));
}
// bilinear 2×2 PCF: continuous in wp, so sub-texel float jitter of the reconstructed position never
// flips the result between lit and shadowed (a nearest lookup did, at shadow-texel boundaries)
float sunLitAt(vec3 wp) {
  if (uHasShadow < 0.5) return 1.0;
  vec4 sc = uShadowMatrix * vec4(wp, 1.0);
  if (any(lessThan(sc.xyz, vec3(0.0))) || any(greaterThan(sc.xyz, vec3(1.0)))) return 1.0; // outside: assume lit
  vec2 p = sc.xy * uShadowSize - 0.5, b = floor(p), f = p - b;
  float s00 = shadowTap(b, sc.z), s10 = shadowTap(b + vec2(1.0, 0.0), sc.z);
  float s01 = shadowTap(b + vec2(0.0, 1.0), sc.z), s11 = shadowTap(b + vec2(1.0, 1.0), sc.z);
  return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
}

vec3 toSRGB(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec4 outC(vec4 c) {
  if (uQuantize > 0.5 && all(lessThanEqual(c.rgb, vec3(1.0))))   // HDR (>1) texels pass through untouched
    c.rgb = toLin(floor(toSRGB(c.rgb) * 255.0 + 0.5) / 255.0);
  return c;
}

void main() {
  vec4 col = texture2D(tColor, vUv);
  float f0 = flagAt(vUv);
  if (f0 < 0.1 || isNone(f0)) {                       // background, grass, leaves, cores: never painted
    if (uDebug >= 1) col.rgb = vec3(luma(col.rgb)) * 0.55;
    gl_FragColor = outC(col); return;
  }
  vec2 tx = texel();
  float tw = uTexelWorld;
  float d0 = linDepth(vUv);
  vec3 n0 = viewNormal(vUv);
  float nz0 = max(n0.z, 0.05);
  float thr = (uDepthThr + uDepthThrTexels * tw) * (1.0 + uObliqueBoost * clamp((0.5 - n0.z) / 0.5, 0.0, 1.0));
  // isotropic: |depth gradient| of my face (texels of depth per texel), same for all 4 neighbours
  float tF = thr + uSlopeTol * min(length(n0.xy) / nz0, 8.0) * tw;

  vec3 sunW = normalize(uSunDir);
  vec3 nW = normalize(mat3(uCamWorld) * n0);
  float l0 = dot(nW, sunW);
  bool outline = false, edge = false, fragO = false, fragE = false;
  bool topFace = nW.y > uTopY;
  bool char0 = isChar(f0);
  bool tone0 = char0 && charTone(f0);
  vec3 lineSrc = col.rgb;                                      // tone lines: the darkest pixel of the line's pairs
  for (int i = 0; i < 4; i++) {
    // L, D, U, R in texels (y-up, matches vUv)
    vec2 o = i == 0 ? vec2(-1.0, 0.0) : i == 1 ? vec2(0.0, -1.0) : i == 2 ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
    vec2 uv = vUv + o * tx;
    float fi = flagAt(uv);
    bool charN = isChar(fi);
    if (char0 && !charN) continue;                              // FLAG_CHAR: inner lines only, never vs the world
    if (char0 && charPart(f0) == charPart(fi) && charPart(f0) != 0.0) continue;  // ... only between DIFFERENT parts
                                                                // (look.js part ids; id 0 = unknown → old rule)
    float di = linDepth(uv);
    float sF = dot(n0.xy, o) / nz0;                              // predicted step (texels of depth)
    float fwd = di - (d0 + sF * tw);                             // > 0: neighbour behind my plane
    bool solidN = fi > 0.1 && !isNone(fi);                      // neighbour has a valid normal
    vec3 ni = solidN ? viewNormal(uv) : vec3(0.0, 0.0, 1.0);    // bg clears to (0,0,1)
    float nzi = max(ni.z, 0.05);
    float sR = dot(ni.xy, o) / nzi;
    float rev = isNone(fi) ? -1e9                               // sprite: depth-only (ground behind it)
                           : d0 - (di - sR * tw);              // > 0: I am behind the neighbour's plane
    float tR = thr + uSlopeTol * min(length(ni.xy) / nzi, 8.0) * tw;
    bool cF = fwd > tF, cR = rev < -0.5 * tR;
    if (uDebug == 2 && ((abs(fwd - tF) < uFragEps * tF && cR) || (abs(rev + 0.5 * tR) < uFragEps * tR && cF))) fragO = true;
    if (cF && cR) {
      outline = true;
      if (tone0) { vec3 cn = texture2D(tColor, uv).rgb; if (luma(cn) < luma(lineSrc)) lineSrc = cn; }
      continue;
    }
    if (!solidN || isDepthOnly(fi) || charN || !topFace) continue;   // a character never makes a world rim
    float convex = dot(cross(n0, ni), vec3(-o.y, o.x, 0.0));
    if (convex <= uConvexThr || fwd <= -2.0 * tF || rev <= -2.0 * tR) {   // (2×: corner pixels sit near 1×)
      if (uDebug == 2 && ((abs(convex - uConvexThr) < uFragEps && fwd > -2.0 * tF && rev > -2.0 * tR) ||
          (convex > uConvexThr && (abs(fwd + 2.0 * tF) < uFragEps * tF || abs(rev + 2.0 * tR) < uFragEps * tR)))) fragE = true;
      continue;
    }
    // owner: the top-facing face of a block edge (world n.y clearly above its neighbour's)
    float dy = nW.y - normalize(mat3(uCamWorld) * ni).y;
    if (uDebug == 2 && (abs(dy - uRimDrop) < uFragEps || abs(nW.y - uTopY) < uFragEps)) fragE = true;
    if (dy > uRimDrop) edge = true;
  }

  bool canDepth = abs(f0 - FLAG_EDGES_ONLY) > 0.02 && uEnableDepth > 0.5;
  bool canEdge  = !isDepthOnly(f0) && !char0 && uEnableEdges > 0.5;
  bool doO = outline && canDepth;
  bool doE = !doO && edge && canEdge;

  if (uDebug >= 1) {
    vec3 g = vec3(luma(col.rgb)) * 0.55;
    vec3 c = doO ? vec3(1.0, 0.05, 0.05) : doE ? vec3(0.05, 1.0, 0.1) : g;
    if (uDebug == 2) {
      if (doO) c = vec3(0.45, 0.0, 0.0); else if (doE) c = vec3(0.0, 0.4, 0.0);
      if (fragE && canEdge) c = vec3(0.0, 1.0, 1.0);
      if (fragO && canDepth) c = vec3(1.0, 1.0, 0.0);
    }
    gl_FragColor = vec4(c, col.a);
    return;
  }
  if (!doO && !doE) { gl_FragColor = outC(col); return; }

  // light-aware strength: sun-facing (N·L) × cast shadow (continuous; see sunLitAt)
  float lit = smoothstep(0.0, uLitSoft, l0);
  // FLAG_CHAR (look owner): no shadow-map term — the figure's own self-shadow is exempt in its material (look.js), and
  // the continuous PCF lookup made inner-line colours creep by 1-11/255 every frame while the root glides
  if (lit > 0.0 && !char0) lit *= sunLitAt(worldPos(vUv) + nW * (2.0 * tw));

  if (doO) {
    vec3 src = tone0 ? lineSrc : col.rgb;
    float l = luma(src);
    float tl = min(l * uOutlineMax, l * uOutlineDark + uOutlineFloor);   // compressed towards a floor
    vec3 base = mix(src, l * uOutlineTint, tone0 ? uCharToneDesat : uOutlineDesat);
    vec3 o = base * (tl / max(luma(base), 1e-5));
    col.rgb = mix(col.rgb, o, mix(uOutlineShadow, 1.0, lit));
  } else {
    vec3 h = mix(col.rgb * uEdgeMul, uEdgeCream, uEdgeLift);
    col.rgb = mix(col.rgb, h, mix(uEdgeShadow, 1.0, lit) * uEdgeStrength);
  }
  gl_FragColor = outC(col);
}`;

const vec3 = (v) => (v?.isColor ? new THREE.Vector3(v.r, v.g, v.b) : v?.isVector3 ? v.clone() : new THREE.Vector3(...v));

// noon preset's engine.style.outline (src/world/sky.js): the reference the ToD tint is relative to
const NOON_LINE = new THREE.Vector3(0.62, 0.62, 0.72), NOON_RIM = new THREE.Vector3(1.0, 0.98, 0.90);
const ratio = (c, ref) => { const v = vec3(c); return v.set(v.x / ref.x, v.y / ref.y, v.z / ref.z); };

export function createOutlinePass(pipeline) {
  const D = OUTLINE_DEFAULTS;
  const params = pipeline.engine?.params;
  const material = pipeline.makeLowresMaterial({
    uniforms: {
      uDepthThr: { value: D.depthThr },
      uDepthThrTexels: { value: D.depthThrTexels },
      uObliqueBoost: { value: D.obliqueBoost },
      uConvexThr: { value: D.convexThr },
      uTopY: { value: D.topY },
      uRimDrop: { value: D.rimDrop },
      uSlopeTol: { value: D.slopeTol },
      uOutlineDark: { value: D.outlineDark },
      uOutlineFloor: { value: D.outlineFloor },
      uOutlineMax: { value: D.outlineMax },
      uOutlineDesat: { value: D.outlineDesat },
      uOutlineTint: { value: vec3(D.outlineTint) },
      uOutlineShadow: { value: D.outlineShadow },
      uEdgeMul: { value: vec3(D.edgeMul) },
      uEdgeCream: { value: vec3(D.edgeCream) },
      uEdgeLift: { value: D.edgeLift },
      uEdgeShadow: { value: D.edgeShadow },
      uEdgeStrength: { value: 1 },
      uLitSoft: { value: D.litSoft },
      uEnableDepth: { value: D.depth ? 1 : 0 },
      uEnableEdges: { value: D.edges ? 1 : 0 },
      uQuantize: { value: D.quantize ? 1 : 0 },
      uCharToneDesat: { value: D.charToneDesat },
      uFragEps: { value: 0.01 },
      uDebug: { value: Number(params?.get('outlineDebug') || D.debug) },
      tShadow: { value: null },
      uShadowMatrix: { value: new THREE.Matrix4() },
      uShadowBias: { value: 0 },
      uHasShadow: { value: 0 },
      uShadowSize: { value: new THREE.Vector2(1, 1) },
    },
    fragment: FRAG,
  });
  const pass = {
    name: 'outline', order: 100, material, useShadowMap: D.useShadowMap,
    // Time-of-day tint (lead, lighting contract): applyTimeOfDay publishes engine.style.outline =
    // {line, rim, rimStrength}. The pass keeps its own base tint/cream/lift (OUTLINE_DEFAULTS or
    // applyOutlineStyle) and scales them by the preset's ratio to the noon preset, so noon is unchanged,
    // golden rims go orange (warm presets also saturate the rim colour and pull harder towards it:
    // rimWarm / rimWarmLift), night rims dim blue. followStyle:false ignores engine.style.outline.
    followStyle: true,
    base: { tint: vec3(D.outlineTint), cream: vec3(D.edgeCream), lift: D.edgeLift, rimWarm: D.rimWarm, rimWarmLift: D.rimWarmLift },
    update(engine) {
      const u = material.uniforms;
      const st = pass.followStyle ? engine.style?.outline : null;
      u.uOutlineTint.value.copy(pass.base.tint);
      u.uEdgeCream.value.copy(pass.base.cream);
      u.uEdgeLift.value = pass.base.lift;
      u.uEdgeStrength.value = 1;
      if (st) {
        if (st.line) u.uOutlineTint.value.multiply(ratio(st.line, NOON_LINE));
        if (st.rim) {
          const r = ratio(st.rim, NOON_RIM);
          // warmth 0 (noon, night) .. 1 (golden: rim ratio ≈ (1, .82, .61))
          const warm = THREE.MathUtils.clamp((r.x - r.z) / 0.4, 0, 1);
          const k = 1 + pass.base.rimWarm * warm;
          u.uEdgeCream.value.multiply(r.set(r.x ** k, r.y ** k, r.z ** k));
          u.uEdgeLift.value = pass.base.lift + (Math.max(pass.base.rimWarmLift, pass.base.lift) - pass.base.lift) * warm;
        }
        if (st.rimStrength !== undefined) u.uEdgeStrength.value = st.rimStrength;
      }
      const sh = engine.sun?.shadow;
      const tex = sh?.map?.texture ?? null;
      const on = pass.useShadowMap && engine.sun?.castShadow && engine.renderer.shadowMap.enabled && !!tex;
      u.tShadow.value = on ? tex : null;
      u.uHasShadow.value = on ? 1 : 0;
      if (on) {
        u.uShadowMatrix.value = sh.matrix; u.uShadowBias.value = sh.bias;
        u.uShadowSize.value.set(tex.image?.width || sh.mapSize.x, tex.image?.height || sh.mapSize.y);
      }
    },
  };
  // A/B tuning from the URL: ?outlineOpts=slopeTol:0.1,edgeShadow:0.2 (numbers / 0|1 booleans only)
  const qo = params?.get('outlineOpts');
  if (qo) {
    const o = {};
    for (const kv of qo.split(',')) { const [k, v] = kv.split(':'); if (k && v !== undefined) o[k.trim()] = Number(v); }
    setOpts(pass, o);
  }
  return pass;
}

/**
 * Tune the outline pass from a scene. Any subset of OUTLINE_DEFAULTS keys, plus `enabled` and
 * `followStyle` (false = ignore the time-of-day tint in engine.style.outline).
 * Colours/vectors accept [r,g,b] (linear), THREE.Color or THREE.Vector3.
 *   applyOutlineStyle(engine, { outlineDark: 0.55, edgeShadow: 0.3, edges: false })
 */
export function applyOutlineStyle(engine, opts = {}) {
  const pass = engine.pipeline.getPass('outline');
  if (!pass) return null;
  return setOpts(pass, opts);
}

function setOpts(pass, opts) {
  const u = pass.material.uniforms;
  const num = { depthThr: 'uDepthThr', depthThrTexels: 'uDepthThrTexels', obliqueBoost: 'uObliqueBoost',
    convexThr: 'uConvexThr', topY: 'uTopY', rimDrop: 'uRimDrop', slopeTol: 'uSlopeTol', outlineDark: 'uOutlineDark',
    outlineFloor: 'uOutlineFloor', outlineMax: 'uOutlineMax', outlineDesat: 'uOutlineDesat',
    outlineShadow: 'uOutlineShadow', edgeShadow: 'uEdgeShadow', litSoft: 'uLitSoft', debug: 'uDebug', fragEps: 'uFragEps', charToneDesat: 'uCharToneDesat' };
  const vec = { outlineTint: 'uOutlineTint', edgeMul: 'uEdgeMul', edgeCream: 'uEdgeCream' };
  for (const [k, v] of Object.entries(opts)) {
    if (v === undefined) continue;
    if (num[k]) u[num[k]].value = Number(v);
    else if (k === 'outlineTint') pass.base.tint.copy(vec3(v));
    else if (k === 'edgeCream') pass.base.cream.copy(vec3(v));
    else if (k === 'edgeLift') pass.base.lift = Number(v);
    else if (k === 'rimWarm') pass.base.rimWarm = Number(v);
    else if (k === 'rimWarmLift') pass.base.rimWarmLift = Number(v);
    else if (k === 'followStyle') pass.followStyle = !!v;
    else if (vec[k]) u[vec[k]].value.copy(vec3(v));
    else if (k === 'depth') u.uEnableDepth.value = v ? 1 : 0;
    else if (k === 'edges') u.uEnableEdges.value = v ? 1 : 0;
    else if (k === 'quantize') u.uQuantize.value = v ? 1 : 0;
    else if (k === 'useShadowMap') pass.useShadowMap = !!v;
    else if (k === 'enabled') pass.enabled = !!v;
    // tieEps: accepted for compatibility, no longer used (rim ownership = the top-facing face)
  }
  return pass;
}
