// Water (owner: water). docs/TECHNIQUES.md §7.
//
//   const water = createWater(engine, terrain, opts)
//
// Architecture [decision, §7.1]: water is NOT a mesh. It is
//   1. a pipeline.preRender hook that renders an ORTHO PLANAR REFLECTION into a low-res RT on the SAME
//      texel grid as the main camera (mirrored camera position + oblique near plane = the water plane,
//      Aras P. / Lengyel general form, so it works for ortho and with every material, no clip planes),
//   2. a low-res post pass (default name 'water', order 120: after outlines 100, before godrays 150).
// Every pixel solves its own ortho ray ∩ water plane. Where the opaque scene lies BEHIND that plane
// point (and inside the water shape) the pixel is water:
//   - refraction: the already-outlined colour under the water, shifted by whole texels (8 fps,
//     depth-scaled, keyed on world-stable texel rows, guarded so shore objects are never smeared in),
//   - 3 hard depth bands (shallow/mid/deep body colour + opacity) from the ortho linear depth difference,
//   - a POSTERISED reflection: each reflected texel is classified sky / foliage / solid. Sky = sky colour
//     (+ banded clouds) at skyReflect; foliage = NOT the leaf texture but the sky-lit surface darkened by
//     one of 2 flat steps (lit / shade mass, 5x5 majority -> silhouettes, no leaf mottle); solid = the
//     reflected tone itself (shaded walls stay dark), tinted, at solidReflect,
//   - an exactly-1px shore highlight: water texels whose 4-neighbour is land/object within ~1 texel of
//     the water plane (T: "background 1 pixel behind the water texel"); covers walls, banks, rocks, reeds,
//   - view-aligned 1px wave lines from world cells (H) that grow/shrink at a stepped fps, 1px sparkles.
// Normal-pass interaction [decision]: water writes NOTHING to rtNormal (no mesh), so it can never create
// outlines on the underwater terrain or around the surface. Submerged solids keep their own outlines
// (refraction of the outlined image, art direction). FLAG_NONE pixels (grass, reeds, lily pads, leaves)
// are never treated as water (their tDepth is the ground behind them), so overhanging sprites stay
// sprite-coloured, and they get a 1px shore ring where they meet the water.
//
// opts (all optional):
//   level            water height (default terrain.waterLevel if finite, else 0)
//   bounds           {x0, z0, x1, z1} | {min:[x,z], max:[x,z]} world rect
//   shape            {kind:'rect', x0,z0,x1,z1} | {kind:'circle'|'ellipse', center:[x,z], radius | radii:[rx,rz]}
//                    | {kind:'polygon', points:[[x,z],...] (<=16)}       (small slots: fountain basins)
//   seed             [x,z]: flood-fill the terrain below `level` from this point into a mask (needs
//                    terrain.heightAt). Used when neither bounds nor shape is given. maskCell (0.25 m),
//                    maskExtent (half size, default terrain.size/2 or 32)
//   name, order      pass name ('water', auto-suffixed if taken) and order (120)
//   reflect          reflection amount (0.35); reflection:false skips the reflection render entirely
//   skyReflect       weight of the sky where the reflection ray misses (reflect + 0.05)
//   solidReflect     weight of reflected solids (reflect + 0.2), reflectTint (#C4E4EA) multiplies them
//   foliage          true: posterise reflected foliage (false: treat it as a solid, the old leaf texture)
//   foliageHi/Lo     multipliers on the sky-lit surface for lit / shaded reflected canopy (#F2FBF6 / #D6E6E6:
//                    ~1/3 and ~1 band step darker), foliageSplit (0.3 x sky luma) splits lit from shade
//   refractStep      luma bucket of the refracted floor (0.12, 0 = off); below the shallow band the floor
//                    is greyscale (one flat tone per band + submerged shapes)
//   shallow/mid/deep sRGB body colours (#A5D2CE / #88BCD6 / #5A94B8), opacity [0.45, 0.65, 0.85]
//   transmit         tint on the refracted colour (#D8F0F5)
//   depthMax         vertical depth (m) spanned by the 3 bands (0.9)
//   shoreColor       #E8FBFF, waveColor #D6F1F5, sparkleColor #F2FCFF, cloudColor #F4FAFA
//   skyColor         colour reflected where nothing is (default engine.style.sky, read every frame)
//   wobble           max refraction displacement in texels (1), wobbleFps (8)
//   waveCell (1.3 m; 0.95 for polygon / ellipse basins), waveLife (2.5 s), waveLen (max half length, 5 px),
//   waveFps (6), waveMinDepth (0.1 m), waves:false
//   sparkleCell (0.5 m), sparkleRate (0.035), sparkleFps (6), sparkles:false
//   cloudReflect (0.5), cloudShade (0.25) — reflected clouds / cloud shadow dimming of the surface
//   underOutline     1 = refraction shows the outlined image (tColor), 0 = raw scene colour (tScene)
//   foam             0.35: share of lapping-foam dashes one texel inside the shore (shallow band only; 0 = off)
//   spriteShore      'below' (default) | 'all' | 'none': shore texels next to FLAG_NONE sprites. 'below' = only
//                    the water texel right under a sprite whose background (tDepth) is bank ground at least
//                    spriteFlat (0.015 m) above the water: no shore under blades leaning over the water and
//                    none around flat on-surface meshes (lily pads at level + 0.01)
//   debug            'reflect' | 'bands' (also via URL ?waterDebug=...)
//   reflectCrop      false: render the reflection over the whole frame (default: cropped to the on-screen water)
//   reflectFps       reflection refresh rate while the camera is still (30; 0 = every frame; any camera move re-renders)
//                    URL ?waterCrop=0 = the old path (whole frame, every frame, no figure cull) for A/B
//   shoreWidth       shore threshold in "wall rows" (1.05). light: fixed scalar light level for the body colours (default: auto from the sky colour)
//
// returns { pass, uniforms, level, setLevel(y), isWater(x,z), reflectTarget, dispose() }
import * as THREE from 'three';
import { NOISE_GLSL, CLOUD_GLSL, ensureToonUniforms } from '../materials/toon.js';
import { LAYERS } from '../core/PixelPipeline.js';

const MAX_POLY = 16;
const SKY_REF = new THREE.Color('#CFE6EC'); // the day sky the default colours were tuned for

const col = (c, d) => (c === undefined ? new THREE.Color(d) : c.isColor ? c.clone() : Array.isArray(c) ? new THREE.Color(...c) : new THREE.Color(c));
const luma = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** Aras P. general oblique near plane (works for ortho): replace row 2 of P so the near plane = clipPlaneCam. */
export function obliqueNearPlane(P, clipPlaneCam) {
  const inv = P.clone().invert();
  const q = new THREE.Vector4(Math.sign(clipPlaneCam.x), Math.sign(clipPlaneCam.y), 1, 1).applyMatrix4(inv);
  const c = clipPlaneCam.clone().multiplyScalar(2 / clipPlaneCam.dot(q));
  const e = P.elements;
  e[2] = c.x - e[3]; e[6] = c.y - e[7]; e[10] = c.z - e[11]; e[14] = c.w - e[15];
  return P;
}

// Reflection renderer for one water body (one extra scene render per frame, at the low-res grid).
// PERF (south bay): the reflection used to render the WHOLE mirrored frustum (more draw calls than the colour pass:
// 101 vs 87 at the bay). Only the RT texels the water pass can sample matter, so the mirrored camera is cropped to
// the RT rect under the on-screen water (+ margin for the wobble and the 5x5 vote) and renders into that viewport
// only: same texel grid (crop edges are whole texels), so the reflection stays pixel-exact, but everything whose
// reflection cannot land on visible water is frustum-culled. No water on screen = no scene render at all.
const CROP_STEP = 8;   // sample spacing (low-res texels) of the on-screen water scan
const CROP_PAD = CROP_STEP + 4;
const _F = new THREE.Vector3(), _P0 = new THREE.Vector3(), _PX = new THREE.Vector3(), _PY = new THREE.Vector3();
/** RT texel rect [x0,y0,x1,y1) the water pass can sample (null = none on screen), from the main camera. */
function reflCropRect(main, level, viewProj, w, h, inShape) {
  _F.set(0, 0, -1).applyQuaternion(main.quaternion);
  if (_F.y > -1e-3) return [0, 0, w, h];
  const at = (v, nx, ny) => { v.set(nx, ny, -1).unproject(main); return v.addScaledVector(_F, (v.y - level) / -_F.y); };
  at(_P0, -1, -1); at(_PX, 1, -1).sub(_P0); at(_PY, -1, 1).sub(_P0);   // W(u,v) = P0 + PX*u + PY*v, u,v in [0,1]
  const e = viewProj.elements;                                         // ortho: affine, w = 1
  const px = (x, y, z) => ((e[0] * x + e[4] * y + e[8] * z + e[12]) * 0.5 + 0.5) * w;
  const py = (x, y, z) => ((e[1] * x + e[5] * y + e[9] * z + e[13]) * 0.5 + 0.5) * h;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ni = Math.ceil(w / CROP_STEP), nj = Math.ceil(h / CROP_STEP);
  for (let j = 0; j <= nj; j++) {
    const v = Math.min(1, j / nj);
    for (let i = 0; i <= ni; i++) {
      const u = Math.min(1, i / ni);
      const x = _P0.x + _PX.x * u + _PY.x * v, y = _P0.y + _PX.y * u + _PY.y * v, z = _P0.z + _PX.z * u + _PY.z * v;
      if (!inShape(x, z)) continue;
      const a = px(x, y, z), b = py(x, y, z);
      if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b;
    }
  }
  if (x0 > x1) return null;
  return [Math.max(0, Math.floor(x0) - CROP_PAD), Math.max(0, Math.floor(y0) - CROP_PAD),
    Math.min(w, Math.ceil(x1) + CROP_PAD), Math.min(h, Math.ceil(y1) + CROP_PAD)];
}

function makeReflection(level, inShape = null, fps = 30) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const key = new Float64Array(23), cur = new Float64Array(23);
  const frustum = new THREE.Frustum(), sphere = new THREE.Sphere(), m4 = new THREE.Matrix4();
  let keyed = false, bucket = NaN, figures = [], figuresAge = Infinity;
  const hidden = [];
  return {
    level, cam, rt: null, viewProj: new THREE.Matrix4(), crop: null, cropOn: inShape !== null, fps, cullFigures: true,
    render(eng) {
      const { renderer, scene, pipeline } = eng;
      const main = eng.camera.cam;
      const { x: w, y: h } = pipeline.size;
      let fresh = false;
      if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
        this.rt?.dispose();
        this.rt = new THREE.WebGLRenderTarget(w, h, {
          type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
          generateMipmaps: false, depthBuffer: true,
        });
        fresh = true;
      }
      // PERF (south bay): the camera key (main camera matrix + ortho box + level + RT size) decides whether the crop
      // must be recomputed, and - with the camera unchanged - the reflection is refreshed at `fps` (30: a pure step
      // of eng.time, so a capture sequence renders the same frames) instead of every frame: the reflected scene is
      // mostly static, figures' stepped animation reads the same at 30 Hz. A rotation / zoom re-renders at once; a
      // small pan within the step reuses the RT (below).
      const me = main.matrixWorld.elements;
      for (let i = 0; i < 16; i++) cur[i] = me[i];
      cur[16] = main.left; cur[17] = main.right; cur[18] = main.top; cur[19] = main.bottom; cur[20] = this.level; cur[21] = w; cur[22] = h;
      let same = keyed && !fresh, pose = same;
      for (let i = 0; i < 23 && pose; i++) if (i < 12 || i > 14) pose = key[i] === cur[i];   // all but the translation
      for (let i = 12; i < 15 && same; i++) same = key[i] === cur[i];
      same = same && pose;
      const b = this.fps > 0 ? Math.floor((eng.time ?? 0) * this.fps) : NaN;
      if (b === bucket && pose) {
        // a pure pan (the follow camera while walking) inside the same refresh step: the RT keeps the previous
        // camera's view and viewProj, which is world-correct on the shared texel grid; only a pan of < 6 texels
        // (inside the crop pad and the pipeline margin) may reuse it
        const tw = (cur[18] - cur[19]) / h, dx = cur[12] - key[12], dy = cur[13] - key[13], dz = cur[14] - key[14];
        if (same || dx * dx + dy * dy + dz * dz < 36 * tw * tw) return;
      }
      bucket = b;

      // mirrored camera: same ortho box, position mirrored about y = level, forward mirrored (F.y -> -F.y).
      // Right vector is unchanged and up is the mirrored up negated, so pixel centres map 1:1 (flipped
      // rows) onto the snapped main grid: reflections are pixel-exact, no resampling.
      cam.left = main.left; cam.right = main.right; cam.top = main.top; cam.bottom = main.bottom;
      cam.near = main.near; cam.far = main.far;
      cam.updateProjectionMatrix();
      const F = new THREE.Vector3(0, 0, -1).applyQuaternion(main.quaternion);
      F.y = -F.y;
      cam.position.copy(main.position); cam.position.y = 2 * this.level - main.position.y;
      cam.up.set(0, 1, 0);
      cam.lookAt(cam.position.clone().add(F));
      cam.updateMatrixWorld(true);
      // oblique near plane = water plane (keep y >= level). Plane to camera space: transpose(matrixWorld).
      const plane = new THREE.Vector4(0, 1, 0, -this.level + 1e-3);
      const clip = plane.applyMatrix4(cam.matrixWorld.clone().transpose());
      obliqueNearPlane(cam.projectionMatrix, clip);
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      cam.layers.mask = main.layers.mask | (1 << LAYERS.COLOR_ONLY);
      this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      // crop (see reflCropRect): recomputed only when the camera key changed
      if (!same) { key.set(cur); keyed = true; this.crop = this.cropOn ? reflCropRect(main, this.level, this.viewProj, w, h, inShape) : [0, 0, w, h]; }
      const crop = this.crop;                                // null: no water on screen -> clear only, no scene render
      const full = !crop || (crop[0] === 0 && crop[1] === 0 && crop[2] === w && crop[3] === h);
      if (!full) {                                          // sub-frustum on whole-texel edges (same texel grid)
        const sx = (main.right - main.left) / w, sy = (main.top - main.bottom) / h;
        cam.left = main.left + crop[0] * sx; cam.right = main.left + crop[2] * sx;
        cam.bottom = main.bottom + crop[1] * sy; cam.top = main.bottom + crop[3] * sy;
        cam.updateProjectionMatrix();
      }
      // figures (skinned characters: frustumCulled = false, ~2 m tall) whose reflection cannot reach the cropped
      // frustum are hidden for this render only (tested before the oblique near plane: a plain ortho box)
      hidden.length = 0;
      if (crop && this.cullFigures) {
        if (++figuresAge > 30) {                            // re-collect every 30 refreshes (characters swap in / out)
          figuresAge = 0; figures = [];
          scene.traverse((o) => { if (o.isSkinnedMesh && o.frustumCulled === false && o.skeleton?.bones?.length) figures.push(o); });
        }
        frustum.setFromProjectionMatrix(m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        for (const o of figures) {
          if (!o.visible) continue;
          sphere.center.setFromMatrixPosition(o.skeleton.bones[0].matrixWorld);
          sphere.radius = 3;
          if (!frustum.intersectsSphere(sphere)) { o.visible = false; hidden.push(o); }
        }
      }
      if (!full) {
        obliqueNearPlane(cam.projectionMatrix, clip);
        cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
        this.rt.viewport.set(crop[0], crop[1], crop[2] - crop[0], crop[3] - crop[1]);
      }

      const prevMode = eng.uniforms.uPassMode.value;
      eng.uniforms.uPassMode.value = 0;
      const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
      renderer.setRenderTarget(this.rt);
      renderer.setClearColor(eng.style.sky, 0); // alpha 0 marks "sky" for the cloud reflection
      renderer.clear(true, true, true);
      // this render never refreshes the frame's shadow map (the pipeline renders it once, in the first render of the
      // frame): with figures hidden it would lose their shadows, and a shadow render into this half-float target
      // needs its own depth programs (a mid-game compile whenever it happens). The colour pass renders it; the
      // reflection reuses the previous frame's shadow map.
      const sm = renderer.shadowMap, smNeeds = sm.needsUpdate, smAuto = sm.autoUpdate;
      sm.needsUpdate = false; sm.autoUpdate = false;
      try {
        if (crop) renderer.render(scene, cam);
      } finally {
        sm.needsUpdate = smNeeds; sm.autoUpdate = smAuto;
        for (const o of hidden) o.visible = true;
        hidden.length = 0;
        if (!full) this.rt.viewport.set(0, 0, w, h);
        renderer.setClearColor(prevClear, prevAlpha);
        renderer.setRenderTarget(null);
        eng.uniforms.uPassMode.value = prevMode;
      }
    },
    dispose() { this.rt?.dispose(); this.rt = null; },
  };
}

function floodMask(terrain, level, seed, cell, ext) {
  const n = Math.max(4, Math.ceil((2 * ext) / cell));
  const x0 = seed[0] - ext, z0 = seed[1] - ext;
  const wet = new Uint8Array(n * n), seen = new Uint8Array(n * n);
  const below = (i, j) => terrain.heightAt(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell) < level + 0.02;
  const si = Math.floor((seed[0] - x0) / cell), sj = Math.floor((seed[1] - z0) / cell);
  const stack = [[si, sj]];
  seen[sj * n + si] = 1;
  while (stack.length) {
    const [i, j] = stack.pop();
    if (!below(i, j)) continue;
    wet[j * n + i] = 1;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n || seen[b * n + a]) continue;
      seen[b * n + a] = 1; stack.push([a, b]);
    }
  }
  // dilate by 2 cells: the true waterline is decided per pixel by depth, the mask only separates basins
  const data = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let v = 0;
    for (let b = -2; b <= 2 && !v; b++) for (let a = -2; a <= 2; a++) {
      const p = i + a, q = j + b;
      if (p >= 0 && q >= 0 && p < n && q < n && wet[q * n + p]) { v = 255; break; }
    }
    data[j * n + i] = v;
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  const rect = new THREE.Vector4(x0, z0, x0 + n * cell, z0 + n * cell);
  const at = (x, z) => {
    const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell);
    return i >= 0 && j >= 0 && i < n && j < n && data[j * n + i] > 0;
  };
  return { tex, rect, at };
}

const FRAG = /* glsl */`
${NOISE_GLSL}
${CLOUD_GLSL}
#define MAX_POLY ${MAX_POLY}
uniform float uLevel;
uniform int uShapeKind;          // 0 none, 1 rect, 2 ellipse, 3 polygon, 4 mask
uniform vec4 uShapeA;            // rect x0,z0,x1,z1 | ellipse cx,cz,rx,rz | mask rect
uniform vec2 uPoly[MAX_POLY];
uniform int uPolyN;
uniform int uDebug;              // 1 = reflection only, 2 = depth bands only
uniform sampler2D tMask, tReflect;
uniform mat4 uReflViewProj;
uniform float uHasReflect, uReflect, uCloudReflect, uCloudShade, uUnderOutline, uDepthMax, uShoreW;
uniform vec3 uLight;              // light tint for the body/line colours (sky colour relative to day sky)
uniform vec3 uSky, uCloudCol, uBand0, uBand1, uBand2, uOpacity, uTransmit, uShoreCol, uWaveCol, uSparkCol;
uniform float uWobble, uWobbleFps, uSpriteShore, uSpriteFlat, uFoam;
uniform float uRefrStep, uSkyReflect, uSolidReflect, uFoliage, uFoliageSplit;
uniform vec3 uReflTint, uFoliageHi, uFoliageLo;
uniform float uWaves, uWaveCell, uWaveLife, uWaveLen, uWaveFps, uWaveMinDepth;
uniform float uSparkles, uSparkCell, uSparkRate, uSparkFps;

bool inShape(vec2 p) {
  if (uShapeKind == 0) return true;
  if (uShapeKind == 1) return p.x >= uShapeA.x && p.y >= uShapeA.y && p.x <= uShapeA.z && p.y <= uShapeA.w;
  if (uShapeKind == 2) { vec2 q = (p - uShapeA.xy) / uShapeA.zw; return dot(q, q) <= 1.0; }
  if (uShapeKind == 3) {
    bool inside = false;
    for (int i = 0; i < MAX_POLY; i++) {
      if (i >= uPolyN) break;
      int j = i == 0 ? uPolyN - 1 : i - 1;
      vec2 a = uPoly[i], b = uPoly[j];
      if (((a.y > p.y) != (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
    }
    return inside;
  }
  vec2 m = (p - uShapeA.xy) / (uShapeA.zw - uShapeA.xy);
  if (any(lessThan(m, vec2(0.0))) || any(greaterThan(m, vec2(1.0)))) return false;
  return texture2D(tMask, m).r > 0.5;
}

// ortho ray through uv ∩ water plane -> world point W; returns the plane's linear depth
float surfDepth(vec2 uv, out vec3 W) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, -1.0, 1.0);
  vec3 O = (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;
  vec3 F = normalize(uCameraDir);
  float tW = (O.y - uLevel) / max(-F.y, 1e-4);
  W = O + F * tW;
  return uNear + tW;
}

// thick = scene depth - plane depth along the view ray (> 0: the opaque scene is under the water)
bool waterAt(vec2 uv, out float thick, out vec3 W) {
  float dW = surfDepth(uv, W);
  thick = linDepth(uv) - dW;
  if (abs(flagAt(uv) - FLAG_NONE) < 0.05) return false;   // sprites (and what they hide) stay untouched
  return thick > 1e-3 && inShape(W.xz);
}

float h2(vec2 c, float k) { return hash12(c + vec2(37.0, 91.0) * k); }

// green-dominant reflected texel = foliage (leaves, canopy cores, far-bank grass); stone/trunks are not
bool isFoliage(vec3 c) { return c.g > c.r * 1.1 && c.g > c.b * 0.92 && c.g - min(c.r, c.b) > 0.006; }

void main() {
  vec4 base = texture2D(tColor, vUv);
  float thick; vec3 W;
  if (!waterAt(vUv, thick, W)) { gl_FragColor = base; return; }

  vec2 tx = texel();
  float tw = uTexelWorld;
  vec3 F = normalize(uCameraDir);
  float sinP = clamp(-F.y, 0.05, 1.0), cosP = sqrt(1.0 - sinP * sinP);
  // vertical water depth under this texel. + 4 mm: authored shelves sit at round depths (0.3 = depthMax/3)
  // exactly on a band threshold, where depth-buffer noise flipped whole rows between bands on a camera pan.
  float vdepth = thick * sinP + 0.004;
  vec3 R = normalize(uCamWorld[0].xyz), U = normalize(uCamWorld[1].xyz);
  vec2 ip = floor(vec2(dot(W, R), dot(W, U)) / tw);             // world-stable texel coords (snapped cam)

  // ---- 3 hard depth bands
  float band = floor(clamp(vdepth / uDepthMax, 0.0, 0.999) * 3.0);
  vec3 body = band < 0.5 ? uBand0 : (band < 1.5 ? uBand1 : uBand2);
  float op = band < 0.5 ? uOpacity.x : (band < 1.5 ? uOpacity.y : uOpacity.z);

  // ---- pixel-exact horizontal refraction wobble (rows, 8 fps, deeper = more)
  float st = floor(uTime * uWobbleFps) / uWobbleFps;
  float amp = floor(uWobble * clamp(vdepth / (uDepthMax / 3.0), 0.0, 1.0) + 0.5);
  float wn = vnoise(vec2(ip.y * 0.55 + st * 2.3, ip.x * 0.045 - st * 0.9 + ip.y * 0.13));
  float wob = clamp(floor((wn - 0.5) * 3.2 * amp + 0.5), -amp, amp);
  vec2 ruv = vUv + vec2(wob, 0.0) * tx;
  float th2; vec3 W2;
  if (wob != 0.0 && !waterAt(ruv, th2, W2)) { ruv = vUv; wob = 0.0; }
  vec3 under = mix(texture2D(tScene, ruv).rgb, texture2D(tColor, ruv).rgb, uUnderOutline);
  // posterised refraction [decision]: the floor's luma snaps to uRefrStep buckets (near-identical floor
  // tones collapse into one, real changes become a clear step); below the shallow band the floor's hue
  // is dropped (grey * transmit), so mid / deep water stays one flat tone per band + submerged shapes.
  if (uRefrStep > 0.0) {
    float lu = max(luma(under), 1e-4);
    float lq = (floor(lu / uRefrStep) + 0.5) * uRefrStep;
    under = band < 0.5 ? under * (lq / lu) : vec3(lq);
  }
  vec3 colr = mix(under * uTransmit, body * uLight, op);

  // ---- ortho planar reflection (same texel grid, flipped rows) + banded cloud reflection in the sky
  vec3 sky = uSky;
  if (uCloud.x > 0.0 && uCloudReflect > 0.0) {
    vec3 D = vec3(F.x, -F.y, F.z);
    vec3 Pc = W + D * ((uCloud.w - uLevel) / max(D.y, 0.05));
    float cn = fbm(Pc.xz * uCloud.x + uCloudWind * uTime + vec2(0.0, uTime * 0.01));
    float cm = step(uCloud.y, cn) * 0.5 + step(uCloud.y + 0.1, cn) * 0.5;
    sky = mix(sky, uCloudCol * uLight, cm * uCloudReflect);
  }
  // Posterised reflection [decision]: the reflected texel is classified as sky (ray misses: alpha 0),
  // foliage (green-dominant: canopies, far-bank grass) or solid (stone, trunks, props).
  //   sky     -> the sky colour (+ banded clouds) at uSkyReflect: the pale cyan lift of the refs
  //   foliage -> NOT the leaf texture: the sky-lit surface darkened by one of 2 flat steps (lit / shade
  //              mass, decided by a 5x5 majority so canopies read as silhouettes, not leaf mottle)
  //   solid   -> the reflected tone itself, tinted (uReflTint) at uSolidReflect: shaded walls stay dark
  vec3 refl = sky;
  float rk = 0.0, folLit = 1.0;                  // rk: 0 sky, 1 solid, 2 foliage
  if (uHasReflect > 0.5) {
    vec4 rc = uReflViewProj * vec4(W, 1.0);
    vec2 ruvR = rc.xy / rc.w * 0.5 + 0.5 + vec2(wob, 0.0) * tx;
    vec4 r = texture2D(tReflect, ruvR);
    bool solid = r.a > 0.25 && !isFoliage(r.rgb);
    if (uFoliage > 0.5) {
      // 5x5 vote (world-stable: the reflection shares the snapped texel grid). A solid texel stays solid
      // (crisp pillar / trunk edges) when it belongs to a solid mass (>= 7 of 25); isolated dark leaf
      // texels inside a canopy fall back to the foliage / sky majority.
      float nf = 0.0, ns = 0.0, no = 0.0, lf = 0.0;
      for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
        vec4 q = texture2D(tReflect, ruvR + vec2(float(i), float(j)) * tx);
        if (q.a <= 0.25) ns += 1.0;
        else if (isFoliage(q.rgb)) { nf += 1.0; lf += luma(q.rgb); }
        else no += 1.0;
      }
      if (solid && no >= 7.0 && no >= nf) { rk = 1.0; refl = r.rgb; }
      else if (nf > ns) { rk = 2.0; folLit = step(uFoliageSplit * luma(uSky), lf / nf); }
    } else if (r.a > 0.25) { rk = 1.0; refl = r.rgb; }
  }
  if (uDebug == 1) {
    vec3 dbg = rk < 0.5 ? sky : (rk < 1.5 ? refl : mix(uFoliageLo, uFoliageHi, folLit) * 0.5);
    gl_FragColor = vec4(dbg, 1.0); return;
  }
  if (uDebug == 2) { gl_FragColor = vec4(body, 1.0); return; }
  if (rk < 0.5) colr = mix(colr, sky, uSkyReflect);
  else if (rk < 1.5) colr = mix(colr, refl * uReflTint, uSolidReflect);
  else colr = mix(colr, sky, uSkyReflect) * mix(uFoliageLo, uFoliageHi, folLit);
  // cloud shadow dims the surface a little (the floor is already shadowed through the refraction)
  // (stepped to 3 levels: the soft cloud edge must not grade the flat water bands)
  if (uCloudShade > 0.0) colr *= mix(1.0, floor(cloudAtten(W) * 2.0 + 0.5) * 0.5, uCloudShade);

  // ---- view-aligned 1px wave lines: one per world cell, grows and shrinks, new spot every cycle
  if (uWaves > 0.5 && vdepth > uWaveMinDepth) {
    float wst = floor(uTime * uWaveFps) / uWaveFps;
    vec2 c0 = floor(W.xz / uWaveCell);
    float crest = 0.0;
    for (int dz = -1; dz <= 1; dz++) for (int dx = -1; dx <= 1; dx++) {
      vec2 c = c0 + vec2(float(dx), float(dz));
      float period = uWaveLife * (0.8 + 0.6 * h2(c, 1.0));
      float ph = wst / period + h2(c, 2.0);
      float cyc = floor(ph), u = fract(ph);
      const float ACTIVE = 0.6;
      if (u > ACTIVE) continue;
      vec2 j = vec2(h2(c + vec2(cyc * 7.0, 0.0), 3.0), h2(c + vec2(0.0, cyc * 5.0), 4.0));
      vec3 C = vec3((c.x + 0.1 + 0.8 * j.x) * uWaveCell, uLevel, (c.y + 0.1 + 0.8 * j.y) * uWaveCell);
      vec2 ipc = floor(vec2(dot(C, R), dot(C, U)) / tw);
      float hl = floor(uWaveLen * sin(3.14159265 * u / ACTIVE) * (0.6 + 0.4 * h2(c, 5.0)) + 0.5);
      if (hl < 1.0) continue;
      if (ip.y == ipc.y && abs(ip.x - ipc.x) <= hl) crest = 1.0;
      else if (ip.y == ipc.y - 1.0 && abs(ip.x - ipc.x) <= hl - 1.0 && crest < 0.5) crest = -1.0;
    }
    if (crest > 0.5) colr = uWaveCol * uLight;
    else if (crest < -0.5) colr *= 0.92;                       // faint trough under the crest
  }

  // ---- 1px sparkles (blink at a stepped fps)
  if (uSparkles > 0.5 && vdepth > uWaveMinDepth) {
    float sf = floor(uTime * uSparkFps);
    vec2 c0 = floor(W.xz / uSparkCell);
    for (int dz = -1; dz <= 1; dz++) for (int dx = -1; dx <= 1; dx++) {
      vec2 c = c0 + vec2(float(dx), float(dz));
      if (h2(c + vec2(sf * 13.0, sf * 7.0), 6.0) > uSparkRate) continue;
      vec3 S = vec3((c.x + h2(c, 7.0)) * uSparkCell, uLevel, (c.y + h2(c, 8.0)) * uSparkCell);
      vec2 ips = floor(vec2(dot(S, R), dot(S, U)) / tw);
      if (ips == ip) colr = uSparkCol * uLight;
    }
  }

  // ---- exactly-1px shore highlight: a 4-neighbour is land/object within ~1 texel above the plane
  float thr = uShoreW * tw / (sinP * cosP);
  const vec2 O4[4] = vec2[4](vec2(0.0, 1.0), vec2(-1.0, 0.0), vec2(1.0, 0.0), vec2(0.0, -1.0));
  bool shore = false;
  for (int i = 0; i < 4; i++) {
    vec2 nuv = vUv + O4[i] * tx;
    float thn; vec3 Wn;
    if (waterAt(nuv, thn, Wn) || thn <= -thr) continue;
    // sprites (FLAG_NONE: reeds, lily pads, grass) have no depth of their own: only the texel right under
    // a sprite's lower edge gets the line (uSpriteShore 1), every side (2), or none (0).
    // 'below' only where the sprite stands on the bank: the surface behind it (tDepth) must lie above the
    // water by more than uSpriteFlat (vertical m). Blades leaning over the water (ground behind = the
    // underwater floor) and flat on-surface meshes (lily pads at level + 0.01) get no shore texel.
    if (abs(flagAt(nuv) - FLAG_NONE) < 0.05) {
      if (uSpriteShore < 0.5) continue;
      if (uSpriteShore < 1.5 && (i != 0 || thn > -uSpriteFlat / sinP)) continue;
    }
    shore = true;
  }
  if (shore) colr = uShoreCol * uLight;
  else if (uFoam > 0.0 && band < 0.5) {
    // lapping foam: a dashed, intermittent 1px line one texel inside the shore (3 fps, world-stable dashes)
    bool near2 = false;
    for (int i = 0; i < 4; i++) {
      vec2 nuv = vUv + O4[i] * tx * 2.0;
      float thn; vec3 Wn;
      if (!waterAt(nuv, thn, Wn) && thn > -thr && abs(flagAt(nuv) - FLAG_NONE) > 0.05) near2 = true;
    }
    float fs = floor(uTime * 3.0);
    if (near2 && hash12(vec2(floor(ip.x / 3.0), ip.y) + vec2(fs * 3.0, fs * 11.0)) < uFoam) colr = mix(colr, uWaveCol * uLight, 0.6);
  }

  gl_FragColor = vec4(colr, base.a);
}`;

export function createWater(engine, terrain = null, opts = {}) {
  const { pipeline } = engine;
  const level0 = opts.level ?? (Number.isFinite(terrain?.waterLevel) ? terrain.waterLevel : 0);
  const T = ensureToonUniforms(engine);

  // ---- shape
  const U = {
    uLevel: { value: level0 },
    uShapeKind: { value: 0 },
    uShapeA: { value: new THREE.Vector4() },
    uPoly: { value: Array.from({ length: MAX_POLY }, () => new THREE.Vector2()) },
    uPolyN: { value: 0 },
    tMask: { value: null },
  };
  let jsInShape = () => true;
  const b = opts.bounds, s = opts.shape;
  if (s && s.kind === 'polygon') {
    const pts = s.points.slice(0, MAX_POLY);
    pts.forEach((p, i) => U.uPoly.value[i].set(p[0], p[1]));
    U.uPolyN.value = pts.length; U.uShapeKind.value = 3;
    jsInShape = (x, z) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[j];
        if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
      }
      return inside;
    };
  } else if (s && (s.kind === 'circle' || s.kind === 'ellipse')) {
    const [cx, cz] = s.center ?? [0, 0];
    const [rx, rz] = s.radii ?? [s.radius, s.radius];
    U.uShapeA.value.set(cx, cz, rx, rz); U.uShapeKind.value = 2;
    jsInShape = (x, z) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 <= 1;
  } else if ((s && s.kind === 'rect') || b) {
    const r = s ?? b;
    const x0 = r.min ? r.min[0] : r.x0, z0 = r.min ? r.min[1] : r.z0, x1 = r.max ? r.max[0] : r.x1, z1 = r.max ? r.max[1] : r.z1;
    U.uShapeA.value.set(x0, z0, x1, z1); U.uShapeKind.value = 1;
    jsInShape = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  } else if (opts.seed && terrain?.heightAt) {
    const m = floodMask(terrain, level0, opts.seed, opts.maskCell ?? 0.25, opts.maskExtent ?? (terrain.size ? terrain.size / 2 : 32));
    U.tMask.value = m.tex; U.uShapeA.value.copy(m.rect); U.uShapeKind.value = 4;
    jsInShape = m.at;
  }

  // ---- reflection
  const useRefl = opts.reflection !== false;
  const refl = useRefl ? makeReflection(level0, (opts.reflectCrop === false || engine.params?.get?.('waterCrop') === '0') ? null : (x, z) => jsInShape(x, z),
    engine.params?.get?.('waterCrop') === '0' ? 0 : (opts.reflectFps ?? 30)) : null;
  if (refl && engine.params?.get?.('waterCrop') === '0') refl.cullFigures = false;   // ?waterCrop=0: the old full render
  const hook = (eng) => { if (refl && pass.enabled) refl.render(eng); };
  pipeline.preRender.push(hook);

  const lin = (k, d) => col(opts[k], d);
  const uniforms = {
    ...U,
    tReflect: { value: null },
    uReflViewProj: { value: new THREE.Matrix4() },
    uHasReflect: { value: useRefl ? 1 : 0 },
    uReflect: { value: opts.reflect ?? 0.35 },
    uCloudReflect: { value: opts.cloudReflect ?? 0.5 },
    uCloudShade: { value: opts.cloudShade ?? 0.25 },
    uUnderOutline: { value: opts.underOutline ?? 1 },
    uLight: { value: new THREE.Color(1, 1, 1) },
    uDebug: { value: { reflect: 1, bands: 2 }[opts.debug ?? engine.params?.get?.('waterDebug')] ?? 0 },
    uDepthMax: { value: opts.depthMax ?? 0.9 },
    uShoreW: { value: opts.shoreWidth ?? 1.05 },
    uSky: { value: new THREE.Color() },
    uCloudCol: { value: lin('cloudColor', '#F4FAFA') },
    uBand0: { value: lin('shallow', '#A5D2CE') },
    uBand1: { value: lin('mid', '#88BCD6') },
    uBand2: { value: lin('deep', '#5A94B8') },
    uOpacity: { value: new THREE.Vector3(...(opts.opacity ?? [0.45, 0.65, 0.85])) },
    uTransmit: { value: lin('transmit', '#D8F0F5') },
    uShoreCol: { value: lin('shoreColor', '#E8FBFF') },
    uWaveCol: { value: lin('waveColor', '#D6F1F5') },
    uSparkCol: { value: lin('sparkleColor', '#F2FCFF') },
    uSpriteShore: { value: { none: 0, below: 1, all: 2 }[opts.spriteShore ?? 'below'] ?? 1 },
    uRefrStep: { value: opts.refractStep ?? 0.12 },
    uSpriteFlat: { value: opts.spriteFlat ?? 0.015 },
    uSkyReflect: { value: opts.skyReflect ?? Math.min(1, (opts.reflect ?? 0.35) + 0.05) },
    uSolidReflect: { value: opts.solidReflect ?? Math.min(1, (opts.reflect ?? 0.35) + 0.2) },
    uReflTint: { value: lin('reflectTint', '#C4E4EA') },
    uFoliage: { value: opts.foliage === false ? 0 : 1 },
    uFoliageSplit: { value: opts.foliageSplit ?? 0.3 },
    uFoliageHi: { value: lin('foliageHi', '#F2FBF6') },
    uFoliageLo: { value: lin('foliageLo', '#D6E6E6') },
    uFoam: { value: opts.foam ?? 0.35 },
    uWobble: { value: opts.wobble ?? 1 },
    uWobbleFps: { value: opts.wobbleFps ?? 8 },
    uWaves: { value: opts.waves === false ? 0 : 1 },
    uWaveCell: { value: opts.waveCell ?? (U.uShapeKind.value === 3 || U.uShapeKind.value === 2 ? 0.95 : 1.3) }, // small basins: denser cells
    uWaveLife: { value: opts.waveLife ?? 2.5 },
    uWaveLen: { value: opts.waveLen ?? 5 },
    uWaveFps: { value: opts.waveFps ?? 6 },
    uWaveMinDepth: { value: opts.waveMinDepth ?? 0.1 },
    uSparkles: { value: opts.sparkles === false ? 0 : 1 },
    uSparkCell: { value: opts.sparkleCell ?? 0.5 },
    uSparkRate: { value: opts.sparkleRate ?? 0.035 },
    uSparkFps: { value: opts.sparkleFps ?? 6 },
    uCloud: T.uCloud, uCloudWind: T.uCloudWind,
  };
  const material = pipeline.makeLowresMaterial({ fragment: FRAG, uniforms });

  let name = opts.name ?? 'water';
  if (!opts.name) for (let i = 2; pipeline.getPass(name); i++) name = `water-${i}`;
  const skyOverride = opts.skyColor !== undefined ? col(opts.skyColor) : null;
  const pass = pipeline.addPass({
    name, order: opts.order ?? 120, material,
    update(eng) {
      const sky = skyOverride ?? eng.style.sky;
      material.uniforms.uSky.value.copy(sky);
      // body / shore / wave colours follow the sky: half luminance ratio, half per-channel ratio
      const L = material.uniforms.uLight.value;
      if (opts.light !== undefined) L.setScalar(opts.light);
      else {
        const lr = luma(sky) / luma(SKY_REF), cl = (v) => THREE.MathUtils.clamp(v, 0.06, 1.15);
        L.setRGB(cl(0.5 * lr + 0.5 * sky.r / SKY_REF.r), cl(0.5 * lr + 0.5 * sky.g / SKY_REF.g), cl(0.5 * lr + 0.5 * sky.b / SKY_REF.b));
      }
      if (refl) {
        material.uniforms.tReflect.value = refl.rt?.texture ?? null;
        material.uniforms.uReflViewProj.value.copy(refl.viewProj);
        material.uniforms.uHasReflect.value = refl.rt ? 1 : 0;
      }
    },
  });

  pass.reflection = refl;   // A/B hook for perf probes: .cropOn / .fps / .cullFigures (set before a camera move)
  const water = {
    pass, uniforms: material.uniforms, material,
    get level() { return material.uniforms.uLevel.value; },
    get reflectTarget() { return refl?.rt ?? null; },
    /** Move the water surface (dynamic water level: call from engine.onUpdate, a pure function of t). */
    setLevel(y) {
      material.uniforms.uLevel.value = y;
      if (refl) refl.level = y;
    },
    /** True if (x,z) is inside the water shape and the terrain there is below the surface. */
    isWater(x, z) {
      if (!jsInShape(x, z)) return false;
      return terrain?.heightAt ? terrain.heightAt(x, z) < material.uniforms.uLevel.value : true;
    },
    dispose() {
      pipeline.passes = pipeline.passes.filter((p) => p !== pass);
      pipeline.preRender.splice(pipeline.preRender.indexOf(hook), 1);
      refl?.dispose();
      U.tMask.value?.dispose();
      material.dispose();
    },
  };
  return water;
}
