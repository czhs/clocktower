// Camera-aware cut-away (owner: town foundation lead). docs/TOWN.md §11 / §12.
//
// The standard top-down-RPG answer to "the cottage in front hides the one I am standing at": every town material
// (toon materials of every piece except life) discards the fragments that sit IN FRONT of a protected volume along
// the camera's view ray. Protected volumes:
//   - the voting circle: a vertical cylinder (CIRCLE, r 6.9 = everything the dais owns, top 1.6 m = a standing
//     character) whenever the camera looks at the square (target inside the plaza, gameplay zooms),
//   - the focus: the focused cottage's box (town.js houseBox: a south-facing cottage's footprint + doorstep up to its
//     roof; a SIDE-ROW cottage only its door wall + doorstep + door tile up to 2.6 m, so its neighbours lose only
//     what hides the entrance) or a 0.9 x 1.8 m box around the player point (?focus=x,z).
// A fragment INSIDE a protected volume is never cut (the protected thing itself, the dais' banners above the circle).
// A box's cut is also limited to a ROUNDED window: its screen-space rectangle with rounded corners (radius 0.7 x the
// shorter half side, <= 1.6 m), so a neighbour loses a soft-cornered window, never a hard notch.
// The tests are pure world-space geometry evaluated per fragment (ortho ray vs box / cylinder, screen coordinates
// relative to the world origin), so they are texel-stable: a whole-texel pan rasterises the cut identically.
// SECTION RIM: a kept (opaque, non-sprite, unprotected) fragment whose 4-neighbour pixel ray is cut is darkened to a
// cool section tone, so every cut edge (vertical cut planes included) gets a clean 1-px dark line, on top of the
// outline pass' own silhouette line. Shadows are unaffected (casters use the depth material), so a cut roof still
// throws its shadow - the town stays one lit place.
//
// Sprites (grass, leaves) are tested at their lighting root (vToonLightPos = the leaf clump / tuft root), so a tree
// canopy is cut by whole leaves together with its core. Water post passes (props' fountain bowl / wells) skip the
// pixels whose water-plane point is cut (no blue disc floating where the basin was cut away).
//
// The same per-material patch also gives the town's point-light pools (night lamps) an ordered-dither edge: a
// world-anchored Bayer 4x4 (screen-texel cells, moves with whole-texel pans) between the quantized pool bands plus a
// faint outer band, instead of hard concentric decal discs.
//
//   const cut = installCutaway(engine, root, {mode})    patch the materials under root (once, before the first render)
//   cut.setCircle({cx, cz, r, top} | null); cut.enabled = b
//   cut.setBoxes([{min: [x,y,z], max: [x,y,z]} | {center: [x, z], half: [hx, hz], y: [y0, y1], ry}, ...] (<= 3))
//   (box bottoms are clamped to y >= 0.03: the flat town floor is never cut)
//   cut.setKeep({center, half, y, ry} | null, piece)   a volume that is never cut (the focused cottage's whole body); piece =
//                              its aTownPiece id (pieceTag): other cottages' fragments inside it are still cut
//   cut.setLifts([{center, half, y: [y0, y1], ry}, ...] (<= 4))   ROOF-OFF volumes: everything inside is cut (object-aware:
//                              the composer lifts the roof / upper storey of a cottage the focus window bites into, so no
//                              sliver of its roof is left floating around the window; its walls keep the window + rim)
//   cut.isCut(v) -> bool       CPU twin of the shader test (world Vector3 / {x,y,z}): life skips perches / spots on
//                              cut geometry (also engine.townCutaway.isCut)
//   cut.patchWater()           (called by installCutaway; again if a water pass is added later)
//   sectionMaterial(engine, mesh)  BackSide section-interior material in the mesh's own shadow tone (the composer twins
//                              the meshes of lifted cottages)
//   pieceTag(id)               aTownPiece id (the composer tags every cottage / tower mesh before installCutaway)
//   cut.update() (registered automatically: camera basis each frame, from camera yaw / pitch)
import * as THREE from 'three';
import { FLAGS_GLSL } from '../core/glsl.js';

const MAX_BOXES = 3;
const MAX_LIFTS = 4;

const BAYER_GLSL = /* glsl */`
float townBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float townBayer4(vec2 a) { return townBayer2(0.5 * a) * 0.25 + townBayer2(a); }   // 0..15/16, ordered
`;

const CUT_GLSL = /* glsl */`
uniform float uCutOn;
uniform vec3 uCutFwd;            // camera forward (world), components never exactly 0
uniform vec3 uCutR, uCutU;       // camera right / up (world): screen coordinates relative to the world origin
uniform vec4 uCutCyl;            // cx, cz, r (0 = off), top
uniform vec4 uCutBoxC[${MAX_BOXES}];  // oriented boxes: centre x, z, cos(ry), sin(ry)
uniform vec4 uCutBoxH[${MAX_BOXES}];  // half x, y0, y1, half z (in the box frame)
uniform vec4 uCutBoxS[${MAX_BOXES}];  // screen window: centre (m along R, U), half extents (m)
uniform float uCutBoxN;
uniform vec4 uCutKeepC, uCutKeepH;    // keep box (the focused cottage's whole volume): never cut; H.z <= H.y = off
uniform vec4 uCutLiftC[${MAX_LIFTS}];  // roof-off volumes (an occluding cottage's footprint above its cut height)
uniform vec4 uCutLiftH[${MAX_LIFTS}];
uniform float uCutLiftP[${MAX_LIFTS}];  // aTownPiece tag of the lifted cottage (a lift only cuts ITS fragments)
uniform float uCutLiftN;
uniform float uCutLiftHi;        // lift plane for wildcard fragments (life's smoke Points: townPiece -1)
// toon materials set this per fragment: a fragment inside the keep box is kept only if it belongs to the KEPT piece
// (aTownPiece, written by the composer on every cottage / tower mesh) or to no cottage at all - a neighbour's eave
// tiles / lantern string / chimney poking into the focused cottage's keep box are still cut / lifted
uniform float uCutKeepPiece;
bool townKeepPart = true;
bool townInBox(vec3 Pw, vec4 C, vec4 H) {
  vec2 d = Pw.xz - C.xy;
  vec3 P = vec3(d.x * C.z - d.y * C.w, Pw.y, d.x * C.w + d.y * C.z);
  return all(greaterThan(P, vec3(-H.x, H.y, -H.w))) && all(lessThan(P, vec3(H.x, H.z, H.w)));
}
// the fragment's cottage (toon / section materials: aTownPiece; -1 = wildcard: smoke Points; 0 = not a cottage)
float townPiece = 0.0;
// lift volume i: only the lifted cottage's own fragments (above its LOW plane: a uniform cut ground storey) and
// wildcard smoke (above the high plane); props, lamps and other cottages standing in the lift pad are untouched
bool townInLift(vec3 P, int i) {
  if (townPiece < -0.5) { vec4 H = uCutLiftH[i]; H.y = max(H.y, uCutLiftHi); return townInBox(P, uCutLiftC[i], H); }
  if (townPiece < 0.5 || abs(townPiece - uCutLiftP[i]) > 0.5) return false;
  return townInBox(P, uCutLiftC[i], uCutLiftH[i]);
}
bool townLiftedPiece() {
  if (townPiece < 0.5) return false;
  for (int i = 0; i < ${MAX_LIFTS}; i++) {
    if (float(i) >= uCutLiftN) break;
    if (abs(townPiece - uCutLiftP[i]) < 0.5) return true;
  }
  return false;
}
bool townCutBox(vec3 Pw, vec4 C, vec4 H, vec4 S) {
  // rounded screen window first (cheap reject)
  vec2 s = vec2(dot(Pw, uCutR), dot(Pw, uCutU)) - S.xy;
  float rad = min(0.7 * min(S.z, S.w), 1.6);
  vec2 q = abs(s) - S.zw + rad;
  if (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) > rad) return false;
  // into the box frame (rotation by -ry about the centre)
  vec2 d = Pw.xz - C.xy;
  vec3 P = vec3(d.x * C.z - d.y * C.w, Pw.y, d.x * C.w + d.y * C.z);
  vec3 f = vec3(uCutFwd.x * C.z - uCutFwd.z * C.w, uCutFwd.y, uCutFwd.x * C.w + uCutFwd.z * C.z);
  f = sign(f) * max(abs(f), vec3(1e-5));
  vec3 bmin = vec3(-H.x, H.y, -H.w), bmax = vec3(H.x, H.z, H.w);
  // inside the box: the protected thing itself is kept; a NEIGHBOUR cottage's fragment inside the focused cottage's box
  // (a wall standing in its margin / door apron, e.g. house-6's far wall 0.75 m in front of house-5) is cut
  if (all(greaterThan(P, bmin)) && all(lessThan(P, bmax))) return !townKeepPart;
  vec3 inv = 1.0 / f;
  vec3 t0 = (bmin - P) * inv, t1 = (bmax - P) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float tN = max(max(tn.x, tn.y), tn.z), tF = min(min(tf.x, tf.y), tf.z);
  return tF > max(tN, 0.0);
}
bool townCutCyl(vec3 P) {
  vec2 d0 = P.xz - uCutCyl.xy;
  float r2 = uCutCyl.z * uCutCyl.z;
  if (dot(d0, d0) < r2) return false;                                        // over the circle: never cut
  float k = max(-uCutFwd.y, 1e-3);                                           // the view ray goes down k per metre
  float s0 = max((P.y - uCutCyl.w) / k, 0.0), s1 = P.y / k;                  // ray inside the slab y 0..top
  if (s1 <= s0) return false;
  vec2 A = d0 + s0 * uCutFwd.xz, AB = (s1 - s0) * uCutFwd.xz;
  float t = clamp(-dot(A, AB) / max(dot(AB, AB), 1e-6), 0.0, 1.0);
  vec2 q = A + t * AB;
  return dot(q, q) < r2;
}
bool townCut(vec3 P) {
  if (uCutOn < 0.5) return false;
  if (townKeepPart && uCutKeepH.z > uCutKeepH.y && townInBox(P, uCutKeepC, uCutKeepH)) return false;
  if (uCutCyl.z > 0.0 && townCutCyl(P)) return true;
  for (int i = 0; i < ${MAX_LIFTS}; i++) {
    if (float(i) >= uCutLiftN) break;
    if (townInLift(P, i)) return true;
  }
  // a LIFTED cottage is cut uniformly at its low lift plane (one clean cut ground storey, no window bites / slanted
  // ray slices / orphaned wall slabs); only its fragments inside a focus box (hugging the focused cottage) go too
  bool lifted = townLiftedPiece();
  for (int i = 0; i < ${MAX_BOXES}; i++) {
    if (float(i) >= uCutBoxN) break;
    if (lifted) { if (!townKeepPart && townInBox(P, uCutBoxC[i], uCutBoxH[i])) return true; }
    else if (townCutBox(P, uCutBoxC[i], uCutBoxH[i], uCutBoxS[i])) return true;
  }
  return false;
}
// inside a protected volume (the protected things never get a section rim)
bool townProtected(vec3 P) {
  if (uCutKeepH.z > uCutKeepH.y && townInBox(P, uCutKeepC, uCutKeepH)) return true;
  if (uCutCyl.z > 0.0) { vec2 d0 = P.xz - uCutCyl.xy; if (dot(d0, d0) < uCutCyl.z * uCutCyl.z) return true; }
  for (int i = 0; i < ${MAX_BOXES}; i++) {
    if (float(i) >= uCutBoxN) break;
    if (townInBox(P, uCutBoxC[i], uCutBoxH[i])) return true;
  }
  return false;
}
`;

// whole-part roof-off (toon materials): a mesh primitive (kit: one Builder call; other meshes: a connected component, see
// town.js addPartAttribute) whose centroid lies inside a lift volume and whose lowest point is less than 0.6 m below the
// lift plane is dropped as a whole - no sign board, cap window, chimney pot or ladder rung left floating under the plane
const PART_GLSL = /* glsl */`
varying vec4 vTownPart;          // world centroid, w = 2 + world bottom y (0 = no part data)
varying float vTownPiece;        // 1 + cottage index (16 = the clock tower), 0 = not a cottage
varying float vTownPartS;        // the part's horizontal size (m)
bool townPartLift() {
  if (uCutOn < 0.5 || vTownPart.w < 1.5) return false;
  vec3 C = vTownPart.xyz;
  if (townKeepPart && uCutKeepH.z > uCutKeepH.y && townInBox(C, uCutKeepC, uCutKeepH)) return false;
  for (int i = 0; i < ${MAX_LIFTS}; i++) {
    if (float(i) >= uCutLiftN) break;
    if (vTownPart.w - 2.0 > uCutLiftH[i].y - 0.6 && townInLift(C, i)) return true;
  }
  return false;
}
// SMALL parts (posts, chimneys, signs, tiles, rungs, lanterns: <= 1.2 m across) are cut or kept WHOLE by their centroid
// (object-aware): no sliver of a chimney or half a sign left at the edge of a cut window, no lone post
bool townSmallPart() { return vTownPart.w > 1.5 && vTownPartS < 1.2; }
bool townLiftAt(vec3 P) {   // the roof-off plane still cuts small parts by fragment (one clean horizontal line)
  if (uCutOn < 0.5 || (townKeepPart && uCutKeepH.z > uCutKeepH.y && townInBox(P, uCutKeepC, uCutKeepH))) return false;
  for (int i = 0; i < ${MAX_LIFTS}; i++) {
    if (float(i) >= uCutLiftN) break;
    if (townInLift(P, i)) return true;
  }
  return false;
}
bool townDiscard(vec3 P) {
  if (townSmallPart()) return (vTownPart.y > 0.1 && townCut(vTownPart.xyz)) || townLiftAt(P) || townPartLift();
  return townCut(P) || townPartLift();
}
`;
const PART_VERT = /* glsl */`
#ifdef USE_INSTANCING
  vTownPart = vec4(0.0);
#else
  {
    vec4 tpc = modelMatrix * vec4(aTownPart.xyz, 1.0);
    vec4 tpb = modelMatrix * vec4(aTownPart.x, aTownPart.w - 2.0, aTownPart.z, 1.0);
    vTownPart = vec4(tpc.xyz, aTownPart.w > 1.5 ? 2.0 + tpb.y : 0.0);
  }
#endif`;

// foliage-only ramp multipliers (town ToD presets: golden / afternoon keep canopies spring green, not amber / teal-black)
// + uVegLift: a small additive green fill on the shadow band (backlit crowns and canopy cores stay green, never teal-black)
const VEG_FROM = ['rampFor(uRampHi, toonHi)', 'rampFor(uRampMid, toonMid)', 'rampFor(uRampSh, toonSh)', 'toonW.x * toonShTone;'];
const VEG_TO = ['rampFor(uRampHi * uVegHi, toonHi)', 'rampFor(uRampMid * uVegMid, toonMid)', 'rampFor(uRampSh * uVegSh, toonSh)', 'toonW.x * (toonShTone + uVegLift);'];

// section rim (colour pass of toon materials only): 1 = this kept pixel borders a cut pixel
const RIM_GLSL = /* glsl */`
float townCutRim(vec3 P, vec3 Pl) {
  if (uCutOn < 0.5 || P.y < 0.03 || distance(P, Pl) > 0.01 || townProtected(P)) return 0.0;  // floor, sprites, protected
  vec3 r = uCutR * uTexelWorld, u = uCutU * uTexelWorld;
  return (townCut(P + r) || townCut(P - r) || townCut(P + u) || townCut(P - u)) ? 1.0 : 0.0;
}
`;

// dithered point-light pool bands (replaces toon.js' plain rounding inside the point-light loop)
const POOL_FROM = 'float pq = floor(clamp(pa, 0.0, 1.0) * uPointLevels + 0.5) / uPointLevels;';
const POOL_TO = `float pq;
              {
                float px = clamp(pa, 0.0, 1.0) * uPointLevels;
                float pb = townBayer4(vec2(dot(vToonLightPos, uCutR), dot(vToonLightPos, uCutU)) / uTexelWorld) + 1.0 / 32.0;
                float lev = floor(px);
                lev += step(0.3 + 0.4 * pb, px - lev);                       // dithered step between two bands
                pq = lev / uPointLevels;
                if (lev < 0.5) pq = step(0.06 + 0.3 * pb, px) * 0.4 / uPointLevels;   // faint outer band, dithered in
              }`;

export function cutUniforms(engine) {
  return (engine._townCut ??= {
    uCutOn: { value: 0 },
    uCutFwd: { value: new THREE.Vector3(0, -0.5, -0.866) },
    uCutR: { value: new THREE.Vector3(1, 0, 0) },
    uCutU: { value: new THREE.Vector3(0, 0.866, -0.5) },
    uCutCyl: { value: new THREE.Vector4(0, 0, 0, 1.6) },
    uCutBoxC: { value: Array.from({ length: MAX_BOXES }, () => new THREE.Vector4(0, 0, 1, 0)) },
    uCutBoxH: { value: Array.from({ length: MAX_BOXES }, () => new THREE.Vector4()) },
    uCutBoxS: { value: Array.from({ length: MAX_BOXES }, () => new THREE.Vector4()) },
    uCutBoxN: { value: 0 },
    uCutKeepC: { value: new THREE.Vector4(0, 0, 1, 0) },
    uCutKeepH: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCutLiftC: { value: Array.from({ length: MAX_LIFTS }, () => new THREE.Vector4(0, 0, 1, 0)) },
    uCutLiftH: { value: Array.from({ length: MAX_LIFTS }, () => new THREE.Vector4()) },
    uCutLiftP: { value: new Array(MAX_LIFTS).fill(0) },
    uCutLiftN: { value: 0 },
    uCutLiftHi: { value: 2.0 },
    uCutKeepPiece: { value: 0 },
    uVegHi: { value: new THREE.Vector3(1, 1, 1) },
    uVegMid: { value: new THREE.Vector3(1, 1, 1) },
    uVegSh: { value: new THREE.Vector3(1, 1, 1) },
    uVegLift: { value: new THREE.Vector3(0, 0, 0) },
  });
}

/** Wrap a toon material's onBeforeCompile: cut test first (colour + normal pass), section rim + dithered light pools. */
export function patchCutMaterial(engine, mat) {
  if (!mat || !mat.userData?.toon || mat.userData.townCut) return false;
  const U = cutUniforms(engine);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    Object.assign(shader.uniforms, U);
    const veg = !!mat.userData.townVeg;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute vec4 aTownPart;\nattribute float aTownPiece;\nattribute float aTownPartS;\nvarying vec4 vTownPart;\nvarying float vTownPiece;\nvarying float vTownPartS;\nvoid main() {\n  vTownPiece = aTownPiece; vTownPartS = aTownPartS;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${PART_VERT}`);
    let fs = shader.fragmentShader.replace('void main() {', `${CUT_GLSL}
${PART_GLSL}
${RIM_GLSL}
${BAYER_GLSL}
${veg ? 'uniform vec3 uVegHi, uVegMid, uVegSh, uVegLift;' : ''}
void main() {
  townKeepPart = vTownPiece < 0.5 || uCutKeepPiece < 0.5 || abs(vTownPiece - uCutKeepPiece) < 0.5;
  townPiece = vTownPiece;
  if (townDiscard(vToonLightPos)) discard;`);
    if (veg) VEG_FROM.forEach((f, i) => { fs = fs.replace(f, VEG_TO[i]); });
    fs = fs.replace(POOL_FROM, POOL_TO);
    // section rim on the final colour (the normal pass returned long before this point)
    fs = fs.replace('#include <opaque_fragment>', `if (!townSmallPart() && townCutRim(vToonWorld, vToonLightPos) > 0.5) outgoingLight = outgoingLight * vec3(0.34, 0.34, 0.4) + vec3(0.012, 0.012, 0.022);
  #include <opaque_fragment>`);
    shader.fragmentShader = fs;
  };
  // program cache: the veg variant differs in source but not in onBeforeCompile's text - key it explicitly
  const k0 = mat.customProgramCacheKey?.() ?? '', veg = !!mat.userData.townVeg;
  mat.customProgramCacheKey = () => `${k0}-tcut${veg ? 'veg' : ''}`;
  mat.userData.townCut = true;
  mat.needsUpdate = true;
  return true;
}

/** Patch a custom ShaderMaterial whose `position` attribute is in model space (life's smoke / dust Points). */
export function patchCutShader(engine, mat) {
  if (!mat || !mat.isShaderMaterial || mat.userData.townCut || !mat.vertexShader.includes('void main()')) return false;
  Object.assign(mat.uniforms, cutUniforms(engine));
  mat.vertexShader = mat.vertexShader.replace('void main() {', 'varying vec3 vCutW;\nvoid main() {\n  vCutW = (modelMatrix * vec4(position, 1.0)).xyz;');
  mat.fragmentShader = mat.fragmentShader.replace('void main() {', `varying vec3 vCutW;\n${CUT_GLSL}\nvoid main() {\n  townPiece = -1.0;\n  if (townCut(vCutW)) discard;`);
  mat.userData.townCut = true;
  mat.needsUpdate = true;
  return true;
}

/**
 * Baked lamp light pools (props' 'props-lamp-pools' ShaderMaterial: hard concentric additive rings) -> ordered-dither
 * ring transitions (world-anchored Bayer 4x4 in screen-texel cells, ~0.3 m wide) plus a faint dithered outer band, so
 * the pool reads as light falling off, not a decal on the grass. Pure world geometry: crawl-free on whole-texel pans.
 */
const POOL_RING_FROM = 'float lv = d < uRings.x ? uLevels.x : d < uRings.y ? uLevels.y : d < uRings.z ? uLevels.z : 0.0;';
const POOL_RING_TO = `float pb = townBayer4(vec2(dot(vPoolW, uCutR), dot(vPoolW, uCutU)) / uTexelWorld) + 1.0 / 32.0;
        float dd = d + (pb - 0.5) * 0.34;                                    // dithered ring edges
        float lv = dd < uRings.x ? uLevels.x : dd < uRings.y ? uLevels.y : dd < uRings.z ? uLevels.z
                 : dd < uRings.z + 0.45 ? uLevels.z * 0.45 * step(pb, 0.5) : 0.0;  // faint 50 % outer band`;
export function patchPoolShader(engine, mat) {
  if (!mat?.isShaderMaterial || mat.userData.townPool || !mat.fragmentShader.includes(POOL_RING_FROM)) return false;
  Object.assign(mat.uniforms, cutUniforms(engine), { uTexelWorld: engine.uniforms.uTexelWorld });
  mat.vertexShader = mat.vertexShader
    .replace('void main() {', 'varying vec3 vPoolW;\nvoid main() {')
    // the discs end 5 cm past the outer ring: grow them 25 % about each lamp so the faint outer band fits
    .replace('vec4 wp = modelMatrix * vec4(position, 1.0);', `vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.xz += (wp.xz - (modelMatrix * vec4(aCenter.x, position.y, aCenter.y, 1.0)).xz) * 0.25;
        vPoolW = wp.xyz;`)
    .replace('vRel = position.xz - aCenter;', 'vRel = (position.xz - aCenter) * 1.25;');
  mat.fragmentShader = mat.fragmentShader
    .replace('void main() {', `varying vec3 vPoolW; uniform vec3 uCutR, uCutU; uniform float uTexelWorld;\n${BAYER_GLSL}\nvoid main() {`)
    .replace(POOL_RING_FROM, POOL_RING_TO);
  mat.userData.townPool = true;
  mat.needsUpdate = true;
  return true;
}

/** Water post passes (src/world/water.js): leave a pixel to the scene when its water-plane point is cut. */
const WATER_FROM = 'if (!waterAt(vUv, thick, W)) { gl_FragColor = base; return; }';
export function patchCutWater(engine) {
  let n = 0;
  for (const p of engine.pipeline?.passes ?? []) {
    const m = p.material;
    if (!m?.isShaderMaterial || m.userData.townCut || !m.fragmentShader.includes(WATER_FROM)) continue;
    Object.assign(m.uniforms, cutUniforms(engine));
    m.fragmentShader = m.fragmentShader
      .replace('void main() {', `${CUT_GLSL}\nvoid main() {`)
      .replace(WATER_FROM, 'if (!waterAt(vUv, thick, W) || townCut(W)) { gl_FragColor = base; return; }');
    m.userData.townCut = true;
    m.needsUpdate = true;
    n++;
  }
  return n;
}

/**
 * Patch the materials under root. `mode(o)` per object (inherited by its subtree unless it returns a value):
 *   'all' (toon materials + model-space Points shaders), 'points' (only Points shaders: life's smoke, not its
 *   characters - people are what the cut protects), 'none'.
 */
/**
 * SECTION INTERIOR of a lifted / cut cottage: a BackSide twin of each of its meshes (shared geometry) that draws the
 * back faces left visible through the cut - the inside of the far walls, the inside of a toadstool stalk - in the
 * MESH'S OWN SHADOW TONE (kit meshes: the per-vertex `toneSh`; others: the material colour x 0.3), darkened a little
 * and following the time-of-day shadow ramp, so a cut cottage reads as its own walls seen from inside, not as black
 * slabs over the grass. Same cut / roof-off tests (nothing above the lift plane). FLAG_NONE in the normal pass (no
 * outlines inside), never casts. One extra call per mesh; two programs (tone attribute or not).
 *   sectionMaterial(engine, mesh) -> the twin's material for that mesh
 */
const SECTION_VERT = /* glsl */`
  attribute vec4 aTownPart;
  attribute float aTownPiece;
  attribute float aTownPartS;
  #ifdef SEC_TONE
  attribute vec3 toneSh;
  #endif
  uniform vec3 uSecCol;
  varying vec4 vTownPart;
  varying float vTownPiece;
  varying float vTownPartS;
  varying vec3 vSecW;
  varying vec3 vSecN;
  varying vec3 vSecCol;
  void main() {
    vTownPiece = aTownPiece; vTownPartS = aTownPartS;
    #ifdef SEC_TONE
    vSecCol = toneSh;
    #else
    vSecCol = uSecCol;
    #endif
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vSecW = wp.xyz;
    vSecN = normalize(mat3(viewMatrix) * mat3(modelMatrix) * -normal);
    ${PART_VERT}
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const SECTION_FRAG = /* glsl */`
  ${FLAGS_GLSL}
  uniform int uPassMode;
  uniform vec3 uRampSh;
  varying vec3 vSecW;
  varying vec3 vSecN;
  varying vec3 vSecCol;
  ${CUT_GLSL}
  ${PART_GLSL}
  void main() {
    townKeepPart = vTownPiece < 0.5 || uCutKeepPiece < 0.5 || abs(vTownPiece - uCutKeepPiece) < 0.5;
    townPiece = vTownPiece;
    if (uCutOn < 0.5 || townDiscard(vSecW)) discard;
    if (uPassMode == 1) { gl_FragColor = vec4(normalize(vSecN) * 0.5 + 0.5, FLAG_NONE); return; }
    // the inside of the wall: its own shadow tone, half-way to a limewashed interior wall in shade (a soot-black or
    // tarred cottage reads as a cut room, not a black box), following the time-of-day shadow ramp
    vec3 inner = mix(vSecCol, vec3(0.16, 0.135, 0.115), 0.5);
    gl_FragColor = vec4(inner * uRampSh * vec3(0.8, 0.8, 0.86), 1.0);
  }`;
export function sectionMaterial(engine, mesh) {
  const tone = !!mesh?.geometry?.attributes?.toneSh;
  const T = engine.toonUniforms ?? {};
  const make = (col) => {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      // pushed back a little: at silhouettes the twin's back face ties with the mesh's own front face - the front wins
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
      defines: tone ? { SEC_TONE: '' } : {},
      uniforms: {
        ...cutUniforms(engine), uPassMode: engine.uniforms.uPassMode,
        uRampSh: T.uRampSh ?? { value: new THREE.Vector3(1, 1, 1) },
        uSecCol: { value: col },
      },
      vertexShader: SECTION_VERT,
      fragmentShader: SECTION_FRAG,
    });
    m.name = 'town-section';
    return m;
  };
  if (tone) return (engine._townSection ??= make(new THREE.Color(0, 0, 0)));
  const c = mesh?.material?.color ? mesh.material.color.clone().multiplyScalar(0.3) : new THREE.Color(0.06, 0.06, 0.07);
  return make(c);
}

/** aTownPiece id of a piece: 1 + cottage index, 16 = the clock tower, 0 = anything else. */
export function pieceTag(id) {
  if (id === 'clocktower') return 16;
  const m = /^house-(\d+)$/.exec(id ?? '');
  return m ? 1 + Number(m[1]) : 0;
}

export function installCutaway(engine, root, { mode = () => undefined } = {}) {
  const U = cutUniforms(engine);
  let patched = 0, pools = 0;
  const visit = (o, inherited) => {
    const m = mode(o) ?? inherited;
    if (m !== 'none') {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const mt of mats) {
        if (m === 'all' && (o.isMesh || o.isInstancedMesh) && patchCutMaterial(engine, mt)) patched++;
        else if (o.isPoints && patchCutShader(engine, mt)) patched++;
        else if (o.isMesh && patchPoolShader(engine, mt)) pools++;
      }
    }
    for (const c of o.children) visit(c, m);
  };
  visit(root, 'all');
  let boxes = [], keep = null, lifts = [];   // CPU copies for isCut / screen windows: {c: [cx, cz, cos, sin], h: [hx, y0, y1, hz]}
  const cyl = { on: false, cx: 0, cz: 0, r: 0, top: 1.6 };
  const fwd = new THREE.Vector3(), R = new THREE.Vector3(), Up = new THREE.Vector3();
  const api = {
    patched, pools,
    water: patchCutWater(engine),
    get enabled() { return U.uCutOn.value > 0.5; },
    set enabled(v) { U.uCutOn.value = v ? 1 : 0; },
    setCircle(c) {
      if (!c) { U.uCutCyl.value.z = 0; cyl.on = false; return; }
      U.uCutCyl.value.set(c.cx, c.cz, c.r, c.top ?? 1.6);
      Object.assign(cyl, { on: c.r > 0, cx: c.cx, cz: c.cz, r: c.r, top: c.top ?? 1.6 });
    },
    setBoxes(list = []) {
      const n = Math.min(MAX_BOXES, list.length);
      boxes = [];
      for (let i = 0; i < n; i++) {
        const b = list[i];
        // {min, max} axis-aligned, or {center: [x, z], half: [hx, hz], y: [y0, y1], ry} oriented
        const B = b.min
          ? { c: [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2, 1, 0], h: [(b.max[0] - b.min[0]) / 2, Math.max(0.03, b.min[1]), b.max[1], (b.max[2] - b.min[2]) / 2] }
          : { c: [b.center[0], b.center[1], Math.cos(b.ry ?? 0), Math.sin(b.ry ?? 0)], h: [b.half[0], Math.max(0.03, b.y[0]), b.y[1], b.half[1]] };
        U.uCutBoxC.value[i].set(...B.c);
        U.uCutBoxH.value[i].set(...B.h);
        boxes.push(B);
      }
      U.uCutBoxN.value = n;
      api.update();
    },
    /** Keep box: a volume that is never cut (the focused cottage's whole body when its cut box is smaller), or null. */
    setKeep(b, piece = 0) {
      U.uCutKeepPiece.value = piece;
      if (!b) { U.uCutKeepH.value.set(0, 0, 0, 0); keep = null; return; }
      keep = { c: [b.center[0], b.center[1], Math.cos(b.ry ?? 0), Math.sin(b.ry ?? 0)], h: [b.half[0], Math.max(0.03, b.y[0]), b.y[1], b.half[1]] };
      U.uCutKeepC.value.set(...keep.c); U.uCutKeepH.value.set(...keep.h);
    },
    /** Roof-off volumes: [{center: [x, z], half: [hx, hz], y: [y0, y1], ry, piece}] (<= 4). Everything of cottage
     *  `piece` (aTownPiece tag) inside is cut (except the keep box): an occluding cottage is cut down to one uniform ground
     *  storey (y0), never left as slivers; wildcard smoke Points are cut above `hi` (the old 2 m plane). */
    setLifts(list = [], { hi = 2.0 } = {}) {
      U.uCutLiftHi.value = hi;
      const n = Math.min(MAX_LIFTS, list.length);
      lifts = [];
      for (let i = 0; i < n; i++) {
        const b = list[i];
        const B = { c: [b.center[0], b.center[1], Math.cos(b.ry ?? 0), Math.sin(b.ry ?? 0)], h: [b.half[0], Math.max(0.03, b.y[0]), b.y[1], b.half[1]] };
        U.uCutLiftC.value[i].set(...B.c); U.uCutLiftH.value[i].set(...B.h);
        U.uCutLiftP.value[i] = b.piece ?? 0;
        lifts.push(B);
      }
      U.uCutLiftN.value = n;
    },
    get lifts() { return lifts.length; },
    /** World corners of box i (8 x Vector3). */
    corners(i) {
      const { c, h } = boxes[i], out = [];
      for (let k = 0; k < 8; k++) {
        const lx = k & 1 ? h[0] : -h[0], ly = k & 2 ? h[2] : h[1], lz = k & 4 ? h[3] : -h[3];
        // box frame -> world: inverse of the shader's rotation by -ry
        out.push(new THREE.Vector3(c[0] + lx * c[2] + lz * c[3], ly, c[1] - lx * c[3] + lz * c[2]));
      }
      return out;
    },
    update() {
      const c = engine.camera;
      fwd.set(-Math.cos(c.pitch) * Math.sin(c.yaw), -Math.sin(c.pitch), -Math.cos(c.pitch) * Math.cos(c.yaw));
      for (const k of ['x', 'y', 'z']) if (Math.abs(fwd[k]) < 1e-5) fwd[k] = 1e-5;
      R.set(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
      Up.crossVectors(R, fwd).normalize();
      U.uCutFwd.value.copy(fwd); U.uCutR.value.copy(R); U.uCutU.value.copy(Up);
      // rounded screen windows: the box's projected bounds (metres along R / U from the world origin)
      for (let i = 0; i < boxes.length; i++) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const p of api.corners(i)) {
          const sx = p.dot(R), sy = p.dot(Up);
          x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        }
        U.uCutBoxS.value[i].set((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2);
      }
    },
    /** CPU twin of townCut(P): is a world point cut away right now? (life: skip perches / spots on cut geometry) */
    isCut(p) {
      if (!api.enabled) return false;
      const P = new THREE.Vector3(p.x, p.y, p.z);
      const inside = ({ c, h }) => {
        const dx = P.x - c[0], dz = P.z - c[1], lx = dx * c[2] - dz * c[3], lz = dx * c[3] + dz * c[2];
        return lx > -h[0] && lx < h[0] && P.y > h[1] && P.y < h[2] && lz > -h[3] && lz < h[3];
      };
      if (keep && inside(keep)) return false;
      if (lifts.some(inside)) return true;
      if (cyl.on) {
        const dx = P.x - cyl.cx, dz = P.z - cyl.cz, r2 = cyl.r * cyl.r;
        if (dx * dx + dz * dz >= r2) {
          const k = Math.max(-fwd.y, 1e-3), s0 = Math.max((P.y - cyl.top) / k, 0), s1 = P.y / k;
          if (s1 > s0) {
            const ax = dx + s0 * fwd.x, az = dz + s0 * fwd.z, bx = (s1 - s0) * fwd.x, bz = (s1 - s0) * fwd.z;
            const t = THREE.MathUtils.clamp(-(ax * bx + az * bz) / Math.max(bx * bx + bz * bz, 1e-6), 0, 1);
            const qx = ax + t * bx, qz = az + t * bz;
            if (qx * qx + qz * qz < r2) return true;
          }
        }
      }
      for (let i = 0; i < boxes.length; i++) {
        const { c, h } = boxes[i], S = U.uCutBoxS.value[i];
        const sx = P.dot(R) - S.x, sy = P.dot(Up) - S.y, rad = Math.min(0.7 * Math.min(S.z, S.w), 1.6);
        const qx = Math.abs(sx) - S.z + rad, qy = Math.abs(sy) - S.w + rad;
        if (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) > rad) continue;
        const dx = P.x - c[0], dz = P.z - c[1];
        const L = [dx * c[2] - dz * c[3], P.y, dx * c[3] + dz * c[2]];
        const F = [fwd.x * c[2] - fwd.z * c[3], fwd.y, fwd.x * c[3] + fwd.z * c[2]].map((v) => Math.sign(v) * Math.max(Math.abs(v), 1e-5));
        const lo = [-h[0], h[1], -h[3]], hi = [h[0], h[2], h[3]];
        if (L.every((v, k) => v > lo[k] && v < hi[k])) continue;
        let tN = -Infinity, tF = Infinity;
        for (let k = 0; k < 3; k++) {
          const a = (lo[k] - L[k]) / F[k], b = (hi[k] - L[k]) / F[k];
          tN = Math.max(tN, Math.min(a, b)); tF = Math.min(tF, Math.max(a, b));
        }
        if (tF > Math.max(tN, 0)) return true;
      }
      return false;
    },
    patchWater: () => patchCutWater(engine),
  };
  api.update();
  engine.onUpdate(() => api.update());
  engine.townCutaway = api;
  return api;
}
