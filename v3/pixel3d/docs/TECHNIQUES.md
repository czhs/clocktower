# pixel3d: technique guide (authoritative)

This guide is synthesised from `research/01-holland.md` (H), `research/02-t3ssel8r.md` (T),
`research/03-implementations.md` (I), `research/04-videos.md` (V) and the reference images in `refs/`.
Read `docs/PIPELINE.md` first. Each builder reads **§0 plus its own section**. The visual targets are in
`docs/ART_DIRECTION.md`.

Tags: **[src]** = a value quoted from a source. **[measured]** = sampled from reference pixels.
**[suggested]** = a starting value to tune, not from a source. **[decision]** = sources disagree or are
silent, and this is the pick.

---

## 0. Cross-cutting rules (everyone)

### 0.1 Units, resolution, scale
- 1 world unit = 1 metre. Internal image = **640×360**. `tools/shot.sh` captures at 1280×720, so
  `pixelScale` = 2 (`Engine` computes `round(innerHeight/360)`). The render target is 644×364 because
  `MARGIN = 2`. *PIPELINE.md still says "default 4 → 320×180". That line is stale: author every
  scene for 360 rows.*
- `uTexelWorld = viewHeight / 360`. **Default scene scale: `viewHeight = 10` → 0.0278 m per texel,
  36 px per metre** [src H: ortho size 10 at 640×360]. This matches T's shrine [measured: the octagon
  is about 255 px wide and the pillars 32–47 px wide at 640×360]. (T's "16 px/m" suggestion contradicts his
  own images, so ignore it.)
- Camera: orthographic, **pitch 30°**, **yaw a multiple of 45°** [src T, H]. A world X/Z edge at yaw 45°
  projects as a clean 2:1 pixel line. A vertical edge shows at cos 30° = 0.866 of its length. Ground
  depth is foreshortened by sin 30° = 0.5, so the visible ground depth is `2 × viewHeight`.
- Model everything on **45° angles** [src T]. Low-poly, flat faces, features ≥ 3 px (≥ 0.08 m at the
  default scale).

### 0.2 Colour
- Hex codes in these docs are **sRGB**. Always go through `new THREE.Color('#75A558')`. In r170, with
  ColorManagement on, that yields **linear** values, which is what uniforms and render targets need.
  Never put `hex/255` into a uniform. The render targets are linear HalfFloat, and the final pass applies
  `colorspace_fragment`.
- **No pure black and no pure white anywhere** [measured T: the darkest day value is ≈ #374B58]. Shadows
  are cool (teal, slate, blue-violet) and lights are warm (cream, yellow-green, ochre).
- No smooth gradients on lit surfaces. Every colour boundary is a deliberate band, a texture-pixel
  edge, or a sprite edge.

### 0.3 Determinism and performance
- Only use `rng(seed)`, `noise2` and `fbm2` from `src/core/noise.js`. Animation is a pure function of
  `uTime`/`t`. Stepped animations use `floor(uTime * fps) / fps`.
- Budget: 640×360 is tiny, so fill-rate is free. Costs come from draw calls and instance counts. Keep
  calls under 300 and grass under 80k instances.

### 0.4 Outline-flag and depth policy for sprites [decision, applies to grass, flowers, leaves, reeds and canopy cores]
The current pipeline gives the outline pass **colour-pass depth** (`tDepth`) plus **normal-pass
normals and flags**. To reproduce T/H ("grass and leaves are not in the prepass"), every
**sprite-like** object follows this rule:

| object | colour pass | normal pass (uPassMode 1) | why |
|---|---|---|---|
| solids: terrain, rocks, ruins, trunks | opaque, depthWrite on | normal + `FLAG_FULL` (or `FLAG_DEPTH_ONLY`) | they create and receive outlines |
| grass, flowers, leaf sprites, reeds | `transparent:true`, **`depthWrite:false`**, **`blending: NoBlending`**, alphaTest 0.5 | writes `FLAG_NONE` (toonMaterial `outline:'none'`) | `tDepth` keeps the **ground behind the tuft**, so silhouettes of stones are computed against the ground, as in T. The `FLAG_NONE` pixel tells the outline pass never to paint on the sprite |
| tree canopy core (dark proxy) | opaque, depthWrite on | `FLAG_NONE` | hides back leaves, takes no outline |
| particles, sky | layer `LAYERS.COLOR_ONLY` | skipped | — |
| water | low-res **post pass** (see §7), not a mesh | — | no feedback loop, refraction includes the outlines |

- `NoBlending` is **mandatory** on transparent materials. With NormalBlending, `rtNormal.a` (the flag) gets
  blended, for example 0.25 + dst·0.75, and every flag breaks.
- `transparent:true` puts the object in three's back-to-front sorted list (per object). Within one
  InstancedMesh, the builder sorts instances far→near for the scene's camera yaw.
- The outline pass treats a `FLAG_NONE` neighbour as **depth-only**: its depth is valid (the ground
  behind), its normal is not.

### 0.5 Requests to the lead (CONTRACT-REQUESTs this doc depends on)
1. [FIXED by lead] **Shadow snapping bug, `Engine._updateSun`.** It snaps in a frame built by
   `Quaternion.setFromUnitVectors(z, dir)`, whose roll differs from the shadow camera's `lookAt` basis.
   Snapping is therefore not aligned with shadow texels, and edges shimmer when the target pans. Snap in
   the lookAt basis instead:
   ```js
   const z = dir.clone().normalize();                                   // shadow cam looks along -z
   const x = new THREE.Vector3(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x);
   const cx = Math.round(center.dot(x) / texel) * texel, cy = Math.round(center.dot(y) / texel) * texel;
   center.addScaledVector(x, cx - center.dot(x)).addScaledVector(y, cy - center.dot(y));
   ```
2. Fix the stale "pixelScale default 4" line in PIPELINE.md (see §0.1). Adopt §0.4 as the sprite contract.
3. [RESOLVED: atmosphere owns src/post/fog.js] Atmosphere needs a home for the fog/mist pass. Either allow `src/post/fog.js`, or atmosphere exports
   `addFog` from `src/post/godrays.js` (assumed below).

---

## 1. camera — `src/core/PixelCamera.js`, final pass in `PixelPipeline.js`, `tools/crawl.*`, `scenes/_test-camera.js`

### 1.1 Texel snapping (already implemented; keep it, verify it)
Algorithm [src H `camera_3d_texel_snapped`, I §3]:
```
t = viewHeight / lowH
R, U = camera right/up (world), from the CURRENT yaw/pitch
a = P·R, b = P·U                       // P = true (unsnapped) camera position
a' = round(a/t)·t, b' = round(b/t)·t
P_render = P + (a'-a)R + (b'-b)U       // depth along F unchanged
offset = ((a-a')/t, (b-b')/t)          // texels, each in [-0.5, 0.5], y-UP
```
`PixelCamera.update()` does exactly this. The grid is anchored at the world origin and spanned by the
camera axes.

**Re-anchoring on rotation.** Holland keeps a "snap space" equal to the camera transform at the last
rotation change, and rebuilds it whenever the rotation changes. Our version recomputes R and U every frame,
which amounts to re-anchoring instantly on any rotation. The two are equivalent while the rotation is
constant, and that is the only case that can be stable. While yaw or pitch changes, the grid itself rotates
and **crawl is unavoidable** ("rotation changes are always unstable", H. Red Giraffe calls it
"unsolvable"). Policy:
- Scenes and captures use a fixed yaw (multiple of 45°) and a fixed pitch of 30°.
- Interactive yaw changes animate to the next 45° stop with `yaw += (target-yaw)·(1-2^(-4·dt·4))`, then
  snap exactly when `|target-yaw| < 0.02` rad [src H `camera_rig.gd`]. Expect crawl only during that
  transition.
- **Zoom** (changing `viewHeight`) changes `t` and crawls as well. Allow only a ladder of values, or change
  `pixelScale`. Never animate `viewHeight` in captures.
- Pan speed forward divided by `sin(pitch)` (already in `_pan`) [src H].
- T: "extra projections are needed at 45°". With camera-space snapping this is automatic, because the snap
  never uses world axes.

**Moving objects** (bobbing cube, a character) must sit on the same grid or they shimmer against the
static world [src H part03, T]. Add an additive helper:
```js
// PixelCamera: returns a copy of world point p snapped to the texel grid in camera right/up (depth kept)
snapWorld(p) {
  const t = this.texelWorld, R = this._right, U = this._up;   // cache from update()
  const a = p.dot(R), b = p.dot(U);
  return p.clone().addScaledVector(R, Math.round(a / t) * t - a).addScaledVector(U, Math.round(b / t) * t - b);
}
```
Scenes compute an animated position from `t`, then assign `obj.position.copy(engine.camera.snapWorld(p))`.
No restore step is needed because the next frame recomputes from `t`. R and U only depend on yaw/pitch,
so using last frame's axes is fine while the rotation is fixed.

### 1.2 Sub-texel offset and the exact t3ssel8r upscale
Upscale lookup (texel units of the padded RT, GL y-up):
`p = gl_FragCoord.xy / uScale + uMargin + uOffset`.
Sign check [I §3]: camera moved +0.3 texel right → `offset.x = +0.3` → we sample +0.3 → the image moves
left on screen, which is correct.

The current final pass uses the **IQ** variant (linear within a 1-screen-pixel band). Replace it with
**t3ssel8r's exact filter** [src T, from the "Crafting a Better Shader" transcript and Patreon notes; the
Godot port "based on code by t3ssel8r" is in H §1.3]:
```glsl
vec2 off = uOffset;
if (uSnapScreen > 0.5) off = floor(off * uScale + 0.5) / uScale;   // [decision] see below
vec2 p   = gl_FragCoord.xy / uScale + uMargin + off;               // texel coords
vec2 box = clamp(fwidth(p), 1e-5, 1.0);                             // pixel footprint in texels (= 1/uScale)
vec2 tx  = p - 0.5 * box;                                           // box min corner
vec2 o   = smoothstep(vec2(1.0) - box, vec2(1.0), fract(tx));       // quadratic-window AA ramp
vec2 uv  = (floor(tx) + 0.5 + o) / uLowSize;
vec4 c   = textureGrad(tFinal, uv, dFdx(p / uLowSize), dFdy(p / uLowSize));  // or texture2D: no mips
```
- `tFinal` must be **LinearFilter** (rtA/rtB are). If every post pass is disabled, `src` is `rtScene`
  (Nearest) and the AA ramp silently degrades to nearest. That is acceptable, but be aware of it.
- **[decision] `uSnapScreen = 1` whenever `pixelScale` is an integer (always, in captures).** The offset is
  rounded to whole screen pixels, so every fragment lands outside the smoothstep ramps. The output is then
  **bit-identical to nearest-neighbour**: palette-pure, zero blur, and motion still glides in 1-screen-pixel
  steps. Holland notes that the bilinear ramp adds "a slight blurriness at certain camera positions, even at
  integer scaling". Use the ramp only for non-integer scales (windowed mode, HiDPI).
- Debug views keep the nearest `uvN` lookup.

### 1.3 Crawl test (the camera owner builds `scenes/_test-camera.js` and `tools/crawl.*`)
Goal: prove that static geometry rasterises identically under camera translation.
1. `_test-camera.js`: a static scene (a pillar of stacked blocks, a rock, flat-shaded terrain, a 45° box, a
   thin 1-px-wide post). Read `?camdx=<texels>&camdy=<texels>` and move the target with
   `camera.target.addScaledVector(R, camdx*t).addScaledVector(U, camdy*t)`, where R and U are the camera
   right and up axes and t = `texelWorld`. Moving along U (not along the ground) is fine for an ortho test.
   Render every frame at the **same `t`** so clouds and wind are identical.
2. Render `camdx = 0, 0.25, 0.5, 1, 3, 7.5` at `--size 1280x720` (scale 2).
3. For each frame, shift the camdx=0 image by `round(camdx·scale)` screen pixels and diff it over the
   interior (ignore a 16 px border). **Pass = 0 differing pixels.**
4. Negative control: `?snap=0` must produce differences, which proves the test can fail.
5. Repeat with outlines on and with the default post chain. The diff must still be 0.
6. Shadow check: same test with a caster on terrain. Shadow edges must not change. If they do, the
   shadow-snap bug (§0.5.1) is not fixed.

Acceptance (screenshot level): pillar edges keep the same staircase pattern across the frames. The 1-px
post never changes width. GIF the frames with `sheet.py gif`: no boiling.

### 1.4 Pitfalls
- `lowW = ceil(W/scale)`: with a non-divisible canvas the image is anchored bottom-left. That is fine.
- `MARGIN = 2` covers `|offset| ≤ 0.5` plus a 1-texel kernel. Passes reading ±1 neighbours never see
  the clamped edge on screen.
- Never snap with world axes. Never snap the camera *target* instead of the position. Both crawl at
  yaw 45°.
- Perspective cameras can't be made stable. Stay orthographic (T's ortho-near/perspective-far blend is out
  of scope).

---

## 2. outlines — `src/post/outline.js`, `scenes/_test-outline.js`

Keep the pass name `'outline'` and order 100. It runs on the lit colour, so the "outline colour" is
derived from the local lit colour.

### 2.1 Rules (what the line must look like)
- **Depth outline (silhouette):** 1 px, drawn on the **nearer** pixel, the inner line of the foreground
  object [src T, H, I]. Its colour is the **object's own lit colour darkened and shifted cool**, never black
  [src T: outline swatch #858780 vs midtone #908968; measured crop_final: lit stone #BBAC97 → outline
  ≈ #8A8090].
- **Convex edge highlight:** 1 px, **lighter, warm cream**, only on **convex** creases, never concave
  [src T "only outward-facing edges", H]. It is drawn on the **more oblique face** (the smaller view-space
  `n.z`, usually the top face at 30° pitch, giving a cream rim on block tops). Ties go to left and up
  [src H].
- The outline overrides the edge highlight. Grass, leaves and other `FLAG_NONE` pixels are never painted.
- Edges are **light-aware**: full strength on sun-facing lit faces, about 35% in shadow [src T 2021
  "light-aware edge coloration"; strength suggested].

### 2.2 Silhouette test: T's predicted depth from the normal [src T Reddit: "each pixel can predict neighbour pixel depths based on its own depth and normal … outline points that have a neighbour whose depth is greater than predicted"]
In ortho view space a 1-texel step `o` (texels) moves `o·t` in view x/y. On the centre pixel's plane,
`n·Δ = 0` gives the predicted neighbour distance:
`pred = d0 + dot(n0.xy, o) · t / n0.z`. Here `d0 = linDepth` (distance from the camera plane, growing away).
Check: flat ground at 30° has view normal (0, 0.866, 0.5). One texel up predicts `d0 + 1.73t`, which is
farther, as expected.

Outline if `dN − pred > thr`. **Why prediction, and not H's plain `pos.z` difference with a 1..2×
obliqueness factor:** prediction is exact on planar faces at any angle, so no false lines appear on grazing
terrain or long walls, which is the "blue filled faces at shallow angles" artefact H describes. Keep
H's 1..2× factor as extra margin on oblique faces.

Thresholds (world units) [suggested; H used 0.25 m at the same scale with plain depth]:
`thr = (uDepthThr + uDepthThrTexels·uTexelWorld) · mix(1, 2, clamp((0.5 − n0.z)/0.5, 0, 1))`,
with `uDepthThr = 0.06`, `uDepthThrTexels = 1.5` (≈ 0.10 m at viewHeight 10). Clamp `n0.z ≥ 0.2`
in the prediction.

### 2.3 Convex test: H's cross product with the three.js y-flip [src H `outline_and_edge.gdshader`]
Godot's `SCREEN_UV` is y-down, while our `vUv` and offsets are y-up. The convexity axis `vec3(off.yx, 0)`
becomes `vec3(-o.y, o.x, 0)`:
```
convexity_i = dot(cross(n0, ni), vec3(-o.y, o.x, 0.0))   // > 0 => convex across this neighbour
edge if: |dN − pred| < thr (same surface patch, no silhouette)
      && ni.z + bias_i > n0.z (centre is the more oblique face → exactly one side draws)
      && convexity_i > uConvexThr
bias_i = 1e-4 for left and up neighbours, else 0 (tie-break)
```
Verified by hand: for a cube's top/front edge at 30° pitch (top n = (0, .866, .5), front n = (0, −.5,
.866)) the centre is on top and the neighbour is below, o = (0, −1), giving convexity = +1.0, and the top
owns the line. For a wall foot meeting the ground (concave), convexity = −1.0, so there is no line.
T's simpler form `dot(ni.xy − n0.xy, o)` agrees to first order. Use H's form, because its sign
behaviour is proven on rotated cubes. `uConvexThr = 0.25` [suggested; H effectively uses 0.5·n.z].
The optional concave veto from H's "but_more" (3×3 neighbourhood: suppress the edge if any neighbour has
convexity < −0.01 with |Δd| < 0.5) helps only if false cream pixels show up in inner corners.

### 2.4 Reference implementation (drop-in replacement for the current fragment)
```glsl
uniform float uDepthThr, uDepthThrTexels, uConvexThr, uEdgeShadow;
uniform vec3 uOutlineMul, uEdgeMul;
bool isNone(float f) { return abs(f - FLAG_NONE) < 0.05; }
void main() {
  vec4 col = texture2D(tColor, vUv);
  float f0 = flagAt(vUv);
  if (f0 < 0.1 || isNone(f0)) { gl_FragColor = col; return; }     // bg, grass, leaves, cores
  vec2 tx = texel();
  float d0 = linDepth(vUv);
  vec3 n0 = viewNormal(vUv);
  float nz = max(n0.z, 0.2);
  float thr = (uDepthThr + uDepthThrTexels * uTexelWorld) * mix(1.0, 2.0, clamp((0.5 - n0.z) / 0.5, 0.0, 1.0));
  const vec2 O[4] = vec2[4](vec2(-1.0, 0.0), vec2(0.0, -1.0), vec2(0.0, 1.0), vec2(1.0, 0.0)); // L, D, U, R
  bool outline = false, edge = false;
  for (int i = 0; i < 4; i++) {
    vec2 uv = vUv + O[i] * tx;
    float fi = flagAt(uv);
    float resid = linDepth(uv) - (d0 + dot(n0.xy, O[i]) * uTexelWorld / nz);
    if (resid > thr) { outline = true; continue; }       // bg depth = far → outline against sky
    if (fi < 0.1 || isNone(fi)) continue;                 // sprite neighbour: depth-only
    vec3 ni = viewNormal(uv);
    float convex = dot(cross(n0, ni), vec3(-O[i].y, O[i].x, 0.0));
    float bias = (i == 0 || i == 2) ? 1e-4 : 0.0;         // left & up win ties
    if (abs(resid) < thr && ni.z + bias > n0.z && convex > uConvexThr) edge = true;
  }
  bool canDepth = abs(f0 - FLAG_EDGES_ONLY) > 0.05;
  bool canEdge  = abs(f0 - FLAG_DEPTH_ONLY) > 0.05;
  vec3 nW = normalize(mat3(uCamWorld) * n0);
  float lit = smoothstep(0.0, 0.25, dot(nW, uSunDir));     // × sunLit(worldPos(vUv)) if you bind the shadow map (§9.2)
  if (outline && canDepth) col.rgb *= uOutlineMul;
  else if (edge && canEdge) col.rgb *= mix(vec3(1.0) + (uEdgeMul - 1.0) * uEdgeShadow, uEdgeMul, lit);
  gl_FragColor = col;
}
```
Uniform defaults (linear multipliers) [suggested from T's swatches]: `uOutlineMul = (0.50, 0.48, 0.58)`
(darker and cooler), `uEdgeMul = (1.40, 1.34, 1.18)` (from "Corner Brightness" #FFFBE6, warm),
`uEdgeShadow = 0.35`. For light-aware edges that respect cast shadows, sample the sun shadow map at
`worldPos(vUv)` with the `sunLit()` helper from §9.2, binding `tShadow`/`uShadowMatrix` in `update()`.

### 2.5 Flags (who sets what)
| flag | use |
|---|---|
| `FLAG_FULL` (default) | rocks, ruins, pillars, shrine, trunks, terrain |
| `FLAG_DEPTH_ONLY` | smooth/organic solids whose creases would be noisy (e.g. rounded boulders if they speckle) |
| `FLAG_EDGES_ONLY` | terrain, if hill-crest outlines look wrong (keeps the cliff-top rims) |
| `FLAG_NONE` | grass, flowers, leaves, reeds, canopy cores, lily pads (§0.4) |

### 2.6 Pitfalls
- 4-neighbour only (no diagonals), or lines get 2 px thick at corners [src H, V].
- Smooth or subdivided meshes speckle with edge pixels. Builders: flat-shade solids and keep facets ≥ 3 px.
  Detail goes into geometry steps, not normal noise. Normal noise is a lighting-only input (§3.5) and must
  not reach the normal pass.
- `rtNormal` is HalfFloat, so 8-bit normal precision issues don't apply [I gotcha].
- Thin geometry under 2 px wide becomes "all outline". Keep posts and rails ≥ 3 px.

### 2.7 Acceptance (screenshots: `--q debug=flags`, `debug=normal`, final at 4× zoom with Read)
- Every silhouette line is exactly 1 px, sits inside the nearer object, and is a darker same-hue shade.
- Block tops have a 1-px cream rim on the top face. Inner (concave) corners have none.
- Flat ground, long walls and gentle hills show no lines. Grass tufts are never outlined or darkened.
- Test scene `_test-outline.js`: a cube rotated 0/45°, an L-shaped wall, a stepped pyramid, a 45°
  chamfered rock, a sphere (flat-shaded, ico detail 1), and a plane at a grazing angle.

---

## 3. lighting — `src/materials/toon.js` (lighting block + hooks), `src/world/sky.js`, `src/post/grade.js`, `scenes/_test-lighting.js`

### 3.1 Model [src T: "white PBR → artist colour ramp → × albedo"; 3 colours per material]
```
L = max(N·Lsun, 0) · shadowMap · cloud(lightPos)            // "white" light, 0..1
w = bandWeights(L)                                          // (w_sh, w_mid, w_hi), sum = 1
col = w_hi·tHi·uRampHi + w_mid·tMid·uRampMid + w_sh·tSh·uRampSh·def
```
- **Tones** (per material, linear; GLSL names `toonHi/toonMid/toonSh`): `tMid = albedo` (`diffuseColor.rgb`, which already includes
  vertex/instance colours and map). By default `tHi = tMid·uMatHi` and `tSh = tMid·uMatSh`, with
  `DEFAULT_HI = (1.90, 1.95, 1.80)` and `DEFAULT_SH = (0.40, 0.49, 0.76)`
  [measured T Ruined Shrine stone, linear ratio of #BBAC97 and #5B5A64 to #8C7E72]. Shadows come out
  cool and highlights warm with no per-material work.
- **`uRampHi/Mid/Sh`** are global time-of-day tints (= 1,1,1 at day) owned by `sky.js` (§3.7).
- **The shadow is folded into the ramp**: cast shadow and cloud shadow just lower L. There is no separate
  shadow colour or ambient term. Retire `uShadowColor`/`uAmbient`, or keep them at neutral values.
- **[decision] multiply, not H's `NdotL + (shadow−1)`**. It matches T's "white light → ramp" and keeps
  the threshold semantics simple. The two are nearly identical with hard shadows.

### 3.2 Banding
```glsl
uniform vec2 uBandThr;    // (0.10, 0.50) [suggested; T "Shadow Threshold 0.05"] shadow|mid, mid|hi
uniform float uBandSoft;  // 0.012 [suggested; H uses smoothstep blends; T stone "Blending 0"]
vec3 bandWeights(float L, float cutMod) {
  float s = max(uBandSoft, 1e-4);                       // smoothstep(e,e,x) is undefined
  float hi  = smoothstep(uBandThr.y - s, uBandThr.y + s, L);
  float mid = smoothstep(uBandThr.x - s, uBandThr.x + s, L);
  vec3 w = vec3(1.0 - mid, mid - hi, hi);               // sh, mid, hi
  if (cutMod > 0.5) w = vec3(0.0, w.x, w.y + w.z);       // "bumped up a cut" (H accent grass, raised leaves)
  return w;
}
```
- On flat ground under a 50° sun (N·L ≈ 0.77) the result is: clear sky → hi, half cloud → mid, cast or full
  cloud shadow → shadow. That gives the 3-tone meadow in the refs.
- `uBandSoft` ≈ 0.01 leaves at most 1–2 px of blended colour at curved band edges. It exists to stop
  flicker on a moving sun (H). Materials may set 0 for perfectly crisp bands. Never go above 0.03, or the
  gradients become visible.

### 3.3 Shadowed-area definition [src T: "for fully-shadowed objects I also shade based off LoN to fake ambient … shadowed pillars still have shading definition"; Imgur "Ambient Shading 0.3"]
```glsl
float lam = floor(clamp(dot(N, Lsun) * 0.5 + 0.5, 0.0, 1.0) * 3.0) / 3.0;   // quantized: no gradients
float def = 1.0 - uAmbShading * (1.0 - lam);                                 // uAmbShading = 0.3
```
Apply `def` to the shadow tone only. Faces in shadow that face the sun stay slightly lighter than faces
that face away, so pillar sides stay readable inside shadows.

### 3.4 Cloud shadows [src H: global world-space noise in the light function, "not perfectly sharp"; T: 3D FBM scrolling and evolving, banded; V Red Giraffe: project the sun ray to a cloud plane, banded not blurred]
```glsl
uniform vec4 uCloud;       // x scale(1/m)=0.045, y cover=0.52, z soft=0.02, w height=30  [suggested]
uniform vec2 uCloudWind;   // noise-uv/s = wind(m/s) × scale: (0.016, 0.005) ≈ 0.35 m/s  [suggested]
float cloudAtten(vec3 wp) {
  vec3 Ls = normalize(uSunDir);
  vec3 p = wp + Ls * ((uCloud.w - wp.y) / max(Ls.y, 0.1));   // march to the cloud plane along the sun
  float n = fbm(p.xz * uCloud.x + uCloudWind * uTime + vec2(0.0, uTime * 0.01));
  float a = smoothstep(uCloud.y - uCloud.z, uCloud.y + uCloud.z, n);
  float b = smoothstep(uCloud.y + 0.10 - uCloud.z, uCloud.y + 0.10 + uCloud.z, n);
  return 1.0 - 0.5 * a - 0.5 * b;                             // 1 clear, 0.5 thin, 0 thick (banded)
}
```
- Target **35–45% of the ground** under cloud [measured T shrine]. Tune with `cover`.
- Export the snippet as `export const CLOUD_GLSL` together with the noise from toon.js, and put the
  uniforms in `engine.toonUniforms`, so water, godrays and fog can reuse the same clouds.
- GLSL noise (WebGL2 integer hash, no `sin` hash):
```glsl
float hash12(vec2 p) { uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673u, 3812015801u);
  return float((q.x ^ q.y) * 1597334673u) * (1.0 / 4294967295.0); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
```

### 3.5 World-space normal noise [src T: "a slight world-space perturbation to the normals … pretty important on flat ground"; H "noise to normals for shadow popping"]
```glsl
vec2 q = vToonLightPos.xz * 0.35;                                // static, world-anchored, low frequency
vec3 nn = vec3(vnoise(q) - 0.5, 0.0, vnoise(q + 7.3) - 0.5);
N = normalize(N + mat3(viewMatrix) * nn * uNormalNoise);         // N is view-space; terrain 0.15, solids 0
```
This is applied to the **lighting** normal only, never to the normal pass. It is evaluated at the
**light position**, so grass tufts get exactly the ground's perturbed value at their root (§5).

### 3.6 toon.js hooks — ALREADY IMPLEMENTED by the lead (see src/materials/toon.js header); lighting owner tunes, does not rename
| option | semantics |
|---|---|
| `lightPos` | GLSL vec3 expression (vertex scope, after project_vertex): the world position where lighting is evaluated. Implementation: `varying vec3 vToonLightPos`. Before `#include <shadowmap_vertex>` insert `worldPosition = vec4(vToonLightPos, 1.0);` so the shadow coordinate is computed there (r170 builds `vDirectionalShadowCoord` from `worldPosition` + `shadowWorldNormal·normalBias` in the vertex shader). Cloud, normal noise and `toonLight` use `vToonLightPos`. Default: `vToonWorld` |
| `viewVertex` | GLSL after project_vertex. It may modify `vec4 mvPosition`; toon then sets `gl_Position = projectionMatrix * mvPosition`. Inject it before `vViewPosition = -mvPosition.xyz` (Lambert order, verified r170). Used for billboards and texel snapping |
| `cutMod` | number, or a GLSL float expression in vertex scope (e.g. `'aAccent'`) → varying, band bump (§3.2) |
| `ramp: {hi, sh}` | per-material `uMatHi`/`uMatSh` (THREE.Color or [r,g,b] linear multipliers). Helper `rampFromTones(hiHex, midHex, shHex)` → `{color: mid, ramp: {hi: hi/mid, sh: sh/mid}}` |
| `toneAttributes: true` | read `attribute vec3 toneHi, toneSh` (per-vertex, or InstancedBufferAttribute) as absolute tones. tMid stays the albedo |
| `tones` | GLSL run after `albedo`. It may overwrite `vec3 toonHi, toonMid, toonSh`, which are initialised from the rules above (e.g. the terrain picks per-zone tones from a uniform table) |
| `normalNoise` | float amount (§3.5), default 0 |
| `unlit: 'sh'` | output `tSh·uRampSh` flat (canopy cores) |

Initialise `engine.toonUniforms ??= {...}` inside `toonMaterial()` (uRampHi/Mid/Sh, uBandThr,
uBandSoft, uAmbShading, uCloud, uCloudWind), so every material shares the uniform objects by reference.

### 3.7 Time-of-day presets — `applyTimeOfDay(engine, name, {relAz, elev} = {})` in sky.js
Sun direction is given **relative to the camera**, so presets read the same at any yaw:
```js
// relAz: 0 = sun on screen-right, +90 = behind the camera (front-lit), -90 = behind the scene (back-lit)
export function sunDirFor(camYaw, relAzDeg, elevDeg) {
  const R = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));   // PixelCamera right
  const B = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));    // horizontal, toward camera
  const a = THREE.MathUtils.degToRad(relAzDeg), e = THREE.MathUtils.degToRad(elevDeg);
  return R.multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)).multiplyScalar(Math.cos(e)).setY(Math.sin(e)).normalize();
}
```
| preset | relAz / elev | uRampHi | uRampMid | uRampSh | sky (clear) | sunColor (rays/grade) |
|---|---|---|---|---|---|---|
| morning | +60° / 35° | (1.00, 0.97, 0.92) | (0.97, 0.97, 1.00) | (0.95, 0.98, 1.08) | #CFE6EC | #FFE9C8 |
| noon | +25° / 52° | (1, 1, 1) | (1, 1, 1) | (1, 1, 1) | #BFE0EA | #FFF6E0 |
| golden | −135° / 24° | (0.86, 0.46, 0.18) * | (1.00, 0.43, 0.76) * | (0.87, 0.48, 0.96) * | #E8C9A0 | #FFC27A |
| night | +40° / 45° (moon) | (0.30, 0.42, 0.62) | (0.20, 0.30, 0.48) | (0.13, 0.19, 0.33) | #141B33 | #9FB6E8 |

\* Golden values are **derived** [measured T "Golden hill" vs shrine grass: lit #AF993A / #75704D /
#374B58 against #BBD985 / #75A558 / #3B6B5A]. Each is the linear ratio golden tone ÷ day tone for that
band, so applying it to the day tones reproduces the measured golden grass exactly. Stone comes out
orange-rimmed, which is intended ("rim orange" [measured T]). Desaturate Hi slightly if foliage turns too
brown. Night is [suggested]: "swap a few palettes and add a dynamic light" [src T], plus a blue sun and
vignette and grain [src H].

Point lights (night lanterns) [src T "Nighttime Lighting"]: additive, **ignoring the ramp**, quantized
to 4 levels, and the position/intensity wiggled at ≈ 8 fps:
```glsl
#if NUM_POINT_LIGHTS > 0
  for (int i = 0; i < NUM_POINT_LIGHTS; i++) {         // unrolled by three
    PointLight pl = pointLights[i];
    vec3 lv = pl.position - geometryPosition;           // view space; geometryPosition = -vViewPosition
    float a = getDistanceAttenuation(length(lv), pl.distance, pl.decay) * max(dot(N, normalize(lv)), 0.0);
    col += albedo * pl.color * floor(a * 4.0 + 0.5) / 4.0;
  }
#endif
```

### 3.8 Grade / vignette / grain — `addGrade(engine, opts)` in grade.js (orders 200, 250)
```glsl
// order 200: grade, all in linear
c = mix(vec3(luma(c)), c, uSat);                                     // uSat 1.05 day, 0.85 night
c = c * uGain + uLift * (1.0 - clamp(luma(c) * 2.0, 0.0, 1.0));      // cool lift in darks: uLift (0.004,0.008,0.016)
// optional OKLab palette snap (off by default; T/H use none [src I §5h])
// order 250: vignette + grain, both BANDED and per-texel
vec2 q = (vUv - 0.5) * vec2(uLowSize.x / uLowSize.y, 1.0);
float v = floor(clamp(dot(q, q) * 1.6, 0.0, 1.0) * 4.0) / 4.0;      // 4 hard steps
c *= 1.0 - uVignette * v;                                            // 0.12 day, 0.35 night
float g = hash12(floor(gl_FragCoord.xy) + floor(uTime * 12.0) * 61.0) - 0.5;
c += g * uGrain * (0.5 + luma(c));                                   // 0 day, 0.035 night [src H night grain]
```
OKLab quantization (optional, `addGrade(engine,{palette:[hex…]})`): use I §5h `linearToOklab` and
nearest-colour search over ≤ 32 entries, weight L×1, a/b×0.5. **No Bayer dither by default**: dither swims
under camera motion (V runevision), and T shades without dither.

### 3.9 Pitfalls
- `directionalLights[0].direction` is view space. `uSunDir` is world space. Don't mix them.
- r170 `getShadow(map, size, intensity, bias, radius, coord)` includes `shadowIntensity` (verified). Use
  `BasicShadowMap` (hard, 1 lookup). PCFSoft still exists in r170, but don't use it (it blurs band edges).
- Shadow acne at low res is huge. Use `normalBias ≈ 1–2 shadow texels` (`2·ext/mapSize`), with the
  shadowExtent sized so a shadow texel ≤ 1 screen texel (ext 18–24 at viewHeight 10).
- Never band each light channel separately: compute L as a scalar.

### 3.10 Acceptance (`_test-lighting.js`: flat ground, hill, box row at 0/45/90°, a sphere, a caster)
- A flat lit area is **exactly one colour** (Read at 4× zoom, or `sheet.py`: unique-colour count in a
  64×64 crop ≤ 3, excluding grass).
- Every material shows ≤ 3 tones (+ outline + rim). Shadows are visibly cooler than lights.
- Cloud shadows cover about 40% of the ground with 2 shadow strengths. Moving `t` slides them without
  crawling.
- Shadowed pillar faces facing the sun differ from faces facing away (definition term).
- Night: blue, readable silhouettes, banded vignette, texel-sized grain.

---

## 4. terrain & rocks — `src/world/terrain.js`, `src/world/rocks.js`, `scenes/_test-terrain.js`

### 4.1 Heightfield
- Keep the API. Add **`terrain.tonesAt(x,z) → {hi, mid, sh}`** (linear THREE.Color, day). Grass copies
  these into instance attributes, which guarantees tuft colour = ground colour.
- Smooth hills: `h = fbm2(x·0.035, z·0.035)·A`, A = 1.5–3 m. Mesh spacing ≤ 0.25 m (`segments =
  size/0.25`) with smooth normals (`computeVertexNormals`), so band boundaries follow the curvature
  smoothly.
- Cliffs and terraces [src T 2021 terrain: "heightmap as a tile map → terraces and slopes"]:
  `terrace(h) = (floor(h/s) + smoothstep(0.5−w, 0.5+w, fract(h/s)))·s`, with s = 1.0–1.5 m and
  w = 0.08–0.12. Risers are near vertical. Faces with `normal.y < 0.6` → rock zone, flagged FULL so the
  cliff tops get a cream rim (see `refs/thumb_mZjSmJ3dxHw.jpg`).
- Flatten under architecture: `h = mix(h, h_pad, smoothstep(r1, r0, dist))` around the shrine and ruin
  footprints.
- `heightAt` must stay analytic and match the mesh (grass bases sit on it).

### 4.2 Colour zones [decision: zone map texture, not interpolated vertex colours]
Interpolated vertex colours make gradients at zone borders, which breaks the "flat colour" rule.
- Build a `zoneMap` once in JS: R8 `DataTexture`, **1/16 m per texel** (1024² for 64 m), `NearestFilter`,
  world-aligned. Ids: 0 grass, 1 dirt path, 2 cobble, 3 rock/cliff, 4 sand/shore, 5 moss/dark grass.
- Rules: rock = slope; sand = `h < waterLevel + 0.25`; path = distance to a polyline < width +
  `noise·0.25`; cobble = noise patches near ruins and path ends; dark-grass patches = fbm threshold
  (≤ 10% of the area).
- Fragment `tones` hook (§3.6): `zone = int(texture(tZone, (vToonWorld.xz - origin)/size).r * 255.0 + 0.5)`,
  then set `toonHi/toonMid/toonSh` from a `uZoneTones[3*6]` uniform array (absolute, linear). Pattern
  zones (cobble, dirt) modulate those tones per fragment (§4.3).
- **`colorAt`, `tonesAt` and `isGrass` read the same JS array** (nearest lookup), so they can never
  disagree with the GPU.
- Zone edges come out as tiny diagonal staircases of ~2 px, a pixel-art-like border. Grass tufts overhang
  them and break them up.

### 4.3 Procedural ground patterns (fragment, world space, pixel-stable under the snapped camera)
- **Cobblestone** [measured T: #606C77 stones, #535B6B shade]: Voronoi on `xz / 0.32 m`. Grout where
  `F2 − F1 < 0.045 m` (≈ 1.5 px) uses grout tone #3F4656 [suggested]. Each cell takes one of 2 stone tones by
  hash. The ramp still applies, so the cobble darkens in cloud shadow.
- **Dirt** [measured ref #9C7A66; suggested shade #7E5F52]: flat, plus sparse 1-px pebbles from a hash
  threshold (density 0.5%).
- **Cracked dirt** (pond scene variant): the cobble Voronoi with cell 0.6 m and paler grout (#B09A7C on
  #C2A584).
- All patterns must be functions of world xz evaluated per fragment. Never screen space.

### 4.4 Rocks [src T: subsurfed cube → displacement → remesh/decimate; 45°-aligned; moss on tops]
`createRocks(engine, terrain, {count, area, seed, kind:'boulder'|'slab'|'outcrop'})`:
- **Boulder**: `IcosahedronGeometry(r, 1)`. Displace vertices radially by `(fbm−0.5)·0.35r`, scale y by
  0.7–1.0, `flatShading:true`. Yaw = k·45° (k random), sink 20–30% into the ground. r = 0.3–1.2 m.
  Colours [measured T 2021]: hi #646076 / mid #4C4B6C / sh #484566 via `rampFromTones`. Moss [src T
  "procedural moss on tops"] uses the `tones` hook:
  `vec3 nw = inverseTransformDirection(normal, viewMatrix); if (nw.y > 0.72 && fbm(vToonWorld.xz * 2.0) > 0.45)`
  → tones moss #94AA6F / #71924B / #4E6B55 [moss hi measured; others suggested].
- **Chamfered block rock / outcrop**: `BoxGeometry` with corners cut at 45° (truncate each corner by
  15–25%). Stack 2–4 at offsets on k·45° yaws. This gives the "rocks built on 45°" look and catches
  rims cleanly.
- Facets ≥ 3 px (≥ 0.1 m at the default scale). Never subdivide past ico detail 1.

### 4.5 Ruins and pillars — OWNED BY THE **props** AGENT in `src/world/props.js` (lead decision; terrain owns only terrain.js + rocks.js)
From the shrine refs (`refs/small_pass_01.png`, `refs/mbXsO6F.png`: Blender stacks of boxes):
- **Pillar** = plinth + shaft of stacked blocks + cap:
  - plinth: box 1.4×0.3×1.4, plus a step 1.15×0.15×1.15
  - shaft: 5–9 blocks, each `w = 0.78–0.95`, `h = 0.22–0.5`, offset x/z by ±0.03–0.10 (quantized to
    1/32 m). 25% are protruding slabs (w 1.05–1.2, h 0.12–0.2). 15% have a notch (a missing corner,
    carved by replacing that block with 2–3 smaller boxes).
  - cap: 1.1–1.25 wide, 0.25 tall
  - height 2.2–3.4 m. Broken pillars: 1–4 blocks, the top block tilted 6–14° about a horizontal axis.
- Merge each pillar into one BufferGeometry (`mergeGeometries` from `three/addons`), flat-shaded, one
  stone material, `castShadow`. Yaw k·45°.
- **Slab**: 1.0–1.4 × 0.12–0.18 × 0.8–1.2, lying with a 2–5° tilt. **Debris**: cubes 0.08–0.3 m, k·45° yaw,
  half buried.
- **Fallen arch**: 6–9 blocks (0.6×0.45×0.5) on a gentle arc with alternating ±8° tilts, one end raised on
  a broken pillar.
- **Octagon basin**: `CylinderGeometry(r, r, h, 8)` rotated by **π/8 (22.5°)** about Y, so the face normals
  lie on multiples of 45°. At yaw 45° one face then fronts the camera with a horizontal top edge, like the
  ref. Rings are built as the difference of two octagons (8 trapezoid segments as boxes, or a lathe with
  8 segments). Leave 1–2 segments cracked or displaced (a 0.08 m gap and a 4° tilt).
- Stone tones [measured T shrine]: hi #BBAC97 / mid #8C7E72 / sh #5B5A64.

### 4.6 Acceptance
- No visible terrain triangle facets on hills. Band edges on hills are smooth curves broken only by grass.
- Zone borders are crisp (no blended colours) and colorAt matches the screen: grass tufts on a zone edge
  are invisible inside their band.
- Pillars read as stacked, offset blocks with a cream rim on every protruding top. No outline speckle on
  boulders.
- 2:1 staircase edges on the octagon at yaw 45°.

---

## 5. grass — `src/world/grass.js`, `src/world/flowers.js`, `scenes/_test-grass.js`

### 5.1 The idea [src T: "each grass sprite is shaded with the same toon colouring as the terrain it sits on … boundaries between colours get broken up by a grassy pattern"; v2: "transferring the world position and normal of the base terrain"]
Inside a lighting band a tuft has exactly the ground's colour and is **invisible**. At band, shadow and
cloud edges it shows as jagged blade fringes. Every input to lighting must be identical to the ground's at
the root: albedo, tones, normal, normal noise, shadow lookup, cloud lookup.

### 5.2 Geometry and placement
- `InstancedBufferGeometry` of a unit quad authored **in texel units**: x ∈ [−w/2, w/2], y ∈ [0, h]
  (e.g. 12×12). Build one Mesh per **8×8 m chunk** (`mesh.position` = chunk centre, `aBase` relative to it)
  so three's transparent sort orders the chunks. **Sort instances far→near** along the camera forward
  inside each chunk, and re-sort in `update()` if the yaw changes.
- Placement: `poissonDisk2D` with **r = 0.20 m** (range 0.15–0.30) [suggested; T "blue noise, dense,
  overlapping"; H "can be sparser"]. That is ≈ 16 tufts/m², about 6k on screen at viewHeight 10. Cap at
  80k total. Keep only points with `terrain.isGrass(x,z)`. Allow a 0.05 m margin to zone edges so tufts
  overhang paths.
- Per-instance attributes: `aBase` (vec3, local to the chunk), `aBaseN` (`terrain.normalAt`), `color` (=
  tones.mid), `toneHi`, `toneSh` (from `terrain.tonesAt`), `aVar` (vec2: variant, phase), `aAccent`
  (0/1).
- `castShadow = false`, `receiveShadow = true` [src H].

### 5.3 Material (uses the §3.6 hooks)
```js
const mat = toonMaterial(engine, {
  map: atlas, alphaTest: 0.5, transparent: true, vertexColors: true, outline: 'none',
  toneAttributes: true, normalNoise: 0.15,          // MUST equal the terrain's value
  lightPos: '(modelMatrix * vec4(aBase, 1.0)).xyz', cutMod: 'aAccent',
  uniforms: { uAtlasGrid: { value: new THREE.Vector2(6, 3) } },
  vertexHead: `attribute vec3 aBase, aBaseN; attribute vec2 aVar; attribute float aAccent; uniform vec2 uAtlasGrid;`,
  objectNormal: `objectNormal = aBaseN;`,           // the ground normal → lighting and shadow normalBias
  vertex: /* glsl */`
    vec3 bw = (modelMatrix * vec4(aBase, 1.0)).xyz;
    float ph = dot(bw.xz, vec2(0.21, 0.09)) + aVar.y;                 // gusts travel across the field
    float f = mod(floor(uTime * 3.0 + ph * 3.0), 4.0);                // [src H] ~3 fps, stepped
    float frame = f > 2.5 ? 1.0 : f;                                  // 0,1,2,1 ping-pong
    vMapUv = (uv + vec2(aVar.x, frame)) / uAtlasGrid;`,
  viewVertex: /* glsl */`
    vec4 b = viewMatrix * modelMatrix * vec4(aBase, 1.0);
    b.xy = floor(b.xy / uTexelWorld + 0.5) * uTexelWorld;              // base on a texel corner
    b.z += aAccent * 0.12;  b.y += aAccent * 2.0 * uTexelWorld;        // accents lift toward the camera [src H]
    mvPosition = b + vec4(position.xy * uTexelWorld, 0.0, 0.0);        // 1 sprite texel = 1 screen texel`,
});
mat.depthWrite = false; mat.blending = THREE.NoBlending;
```
- **Screen-aligned** quad (view x/y) [decision: matches Godot `BILLBOARD_ENABLED` per H, and gives exact
  1:1 texel mapping]. It has a constant view depth equal to the base depth, so tufts never clip into rising
  ground behind them.
- Snapping the base in view space is **pixel-stable** because the camera itself is texel-snapped: the view
  x/y of a static point only changes by whole texels. With `MARGIN = 2`, the view-space origin falls on a
  texel corner.
- The result is one flat colour per tuft, because all lighting inputs are per-instance.
- **No outlines**: `FLAG_NONE` plus depthWrite off (§0.4).

### 5.4 Atlas (procedural, no external art)
Draw the atlas in JS into a `DataTexture` (RGBA8, white RGB, alpha 0/255, `NearestFilter`,
`generateMipmaps=false`, `flipY` consistent).
- 6 tuft variants × 3 wind frames, 12×12 px cells.
- Each tuft has 3–7 blades. A blade is 1 px wide, 4–11 px tall, leaning ±1 px every 3–4 rows. 2-px-wide
  bases are allowed.
- Frames: 0 = rest, 1 = tips shifted 1 px with the wind, 2 = tips shifted 2 px and the upper third
  shifted 1 px.
- The silhouette is spiky upward with a flat bottom [measured crop_final: blades 1 px, tips 2–3 px apart].

### 5.5 Flowers (`flowers.js`, same material recipe)
- 3–6% of grass points become flowers [suggested; T "random subset with a different sprite and randomized
  colour"]. Sprites are 3×5 to 5×6 px: a 1–2 px stem in the **grass tone at the base** and a 2×2 or 3×2
  blossom.
- Implementation: either two instances (stem + blossom), or one sprite where alpha 128 = stem (tinted
  with the grass tones) and alpha 255 = blossom (flower tones).
- Blossom tones: hi = tint, mid = tint·0.85, sh = tint·(0.50, 0.52, 0.78). Tints: lilac #A875D7 / #CA91E3 /
  #DC9EFF [measured T], yellow #E6D36A, white #EDEBDA [suggested].
- `aAccent = 1` (bumped a band, lifted toward the camera) [src H]. Cluster them in patches with
  `fbm > 0.6` and avoid uniform sprinkling.

### 5.6 Pitfalls
- If the tuft's normal noise, tones, cloud or shadow differ by even one input, tufts appear as speckle
  inside a band. Test this explicitly (§5.7).
- Normal bias: the r170 shadow coordinate uses `shadowWorldNormal` from `transformedNormal`, which is the
  ground normal through `objectNormal`. That is identical to the terrain's.
- InstancedBufferGeometry needs `instanceCount` and a manual `boundingSphere` per chunk, or
  `frustumCulled = false`.
- Don't put grass under water (`isGrass` false below `waterLevel + 0.3`) or on rock or cobble.

### 5.7 Acceptance (`_test-grass.js`: terrain + a caster + clouds, `?grass=0|1`)
- Diff of grass=1 vs grass=0 (`sheet.py diff`): changed pixels lie **only** within about 12 px of band,
  shadow and cloud boundaries and object bases. Flat uniformly-lit areas show 0 changed pixels.
- Boundaries read as blade fringes (lit blades poking into shadow and vice versa). No outlines on tufts.
  Sprite texels are exactly 1 screen texel.
- Over `--times 0,0.34,0.67,1.0` the tufts change frame in unison at about 3 fps, and the wave visibly
  travels.

---

## 6. trees — `src/world/trees.js`, `scenes/_test-trees.js`

### 6.1 Structure [src T: "jagged spheres as shadow casters and leaf sprites drawn over them, lit using the sphere normal"; "a leaf sprite on each vertex … transfer the normals of the mesh"; H: dome + ~1000 Poisson-disk leaf quads, raised clumps bumped one cut]
`createTree(engine, {position, seed, height, kind:'round'|'tall'|'bush'})` → Group:
1. **Trunk**: `CylinderGeometry(r0·0.75, r0, h, 6)` rotated π/6, or 8 sides rotated π/8 (faces on 45°
   multiples). r0 = 0.18–0.35. A slight lean of 3–6°. 1–3 branches as boxes at ±45° pitch toward the
   canopy blobs, plus 2–4 root-flare boxes at the base. Flat-shaded, `FLAG_FULL`. Tones: grey trunk
   #8B8590 / #6B6470 / #4E4A5C (shrine refs), or red-brown #7A5A5E / #654853 / #574E68 [measured T 2021].
2. **Canopy blobs**: 2–5 jagged spheres (`IcosahedronGeometry(R, 2)`, radial noise ±15%, centres within
   0.6R of each other). R = 1.0–2.2 m.
   - **Core** = the same blob scaled to 0.85, `unlit:'sh'` (deepest tone #2F5552 [suggested]), opaque,
     `outline:'none'`, `castShadow:true`. One mesh is both the shadow caster and the dark interior that
     fills gaps.
3. **Leaves**: one InstancedBufferGeometry per tree. Points = blob vertices plus `poissonOnMesh`
   (I §5j) at r = 0.16–0.20 m → **600–1200 leaves per tree** [src H ~1000]. Per leaf:
   - `aBase` = point + n·0.04
   - `aN` = **sphere normal** `normalize(p − blobCentre)`, mixed 0.7/0.3 with the face normal [src T]
   - `aVar` = variant and phase
   - `aRaise` = `fbm3(p·1.3) > 0.6` [src H: noise-chosen clumps, suggested threshold]
4. Leaf material = the grass recipe: `lightPos` = leaf base, `objectNormal = aN`, `cutMod: 'aRaise'`, raised
   leaves pushed `+0.10 m` toward the camera, every leaf pushed `+0.25 m` toward the camera in view z so the
   quad isn't cut by the core's near bulge, base snapped to texel corners, `transparent`, depthWrite off,
   NoBlending, `FLAG_NONE`.
5. Leaf sprites: 4 variants × 2 wind frames, 7×7 to 9×8 px clusters of 3–5 leaf shapes [src T
   "6–12 px"]. Wind: frame swap at ~3 fps with phase from world x, plus a 1-texel stepped bob for raised
   leaves.

### 6.2 Tones [measured T Forgotten Gate]
Leaves hi #84B35B / mid #689763 / sh #46726C, core #2F5552. Sun-tip accent: give raised leaves
(`aRaise = 1`) `toneHi = #B6CC77` through `toneAttributes`, so the bumped clumps on the sun side pop
yellow-green [measured T Forgotten Gate lit grass, used as the leaf tip]. Bush variant: hi #87AA46 / sh #5C7A52 [measured]. Canopies must be **darker in the shadow
tone than the grass shadow tone**, or trees merge into shaded meadow.

### 6.3 Lighting and shadows
- Each leaf is lit at its base with the sphere normal. The canopy reads as one ball: a lit sun side, a mid
  rim, a dark underside.
- Leaves `receiveShadow` (they self-shadow through the core: leaves on the far side are in shadow) and do
  not cast shadows. Set `normalBias` so sun-side leaves aren't acned by their own core.
- The core casts the tree's ground shadow (a jagged round blob, as in the refs).

### 6.4 Outline handling
Trunks and branches get outlines. Leaves and cores get none, so the canopy silhouette comes from the
leaf-cluster shapes. Because leaves don't write depth, a pillar in front of a canopy is outlined against
the core, and the canopy never draws lines over the trunk.

### 6.5 `scatterTrees(engine, terrain, {count, area, minDist, avoid:[{x,z,r}], seed})`
Poisson with `minDist` 3–5 m, skipping slopes > 30° and `avoid` circles (the shrine, the pond). Scale and
seed vary per tree.

### 6.6 Acceptance
- At 4× zoom the canopy edge is made of leaf-cluster shapes (no straight polygon edges) and has 3 tones +
  the dark core. No outlines.
- Shadow blobs on the ground match the canopy positions. Back-lit canopies (golden) show a mid/hi rim and
  a dark centre.
- 600–1200 leaves per tree and fewer than 3 draw calls per tree (trunk, core, leaves).

---

## 7. water — `src/world/water.js`, `scenes/_test-water.js`

### 7.1 Architecture [decision]
`createWater(engine, terrain, {level, bounds})` registers:
1. a **preRender reflection hook** → `rtReflect` (same size as `pipeline.size`, HalfFloat, Nearest,
   depth buffer)
2. a **low-res post pass `'water'` at order 120** (after outlines at 100, before godrays at 150)

Why a post pass and not a mesh: a mesh drawn in the colour pass can't sample `rtScene` (feedback loop
[I gotcha]) and would need an extra full scene render. As a post pass it gets the opaque colour, *with
outlines already applied*, so submerged pillars keep their outlines and wobble with the refraction
(H: "refraction shows the outlined objects under the water"). Nothing about water enters the normal pass,
so it has no outline interaction to manage.

### 7.2 Per-pixel water surface (ortho ray ∩ plane)
```glsl
vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
vec3 O = (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;          // ray origin on the near plane
vec3 F = normalize(uCameraDir);
float tW = (O.y - uLevel) / max(-F.y, 1e-4);                 // ray distance to the plane
vec3 W = O + F * tW;                                         // world point on the surface
float dW = uNear + tW, dS = linDepth(vUv);
bool water = dS > dW + 1e-3 && inBounds(W.xz) && !isNoneOverhang(vUv);
```
`isNoneOverhang`: if `flagAt(vUv)` is `FLAG_NONE` and the colour depth would put that sprite above the
surface (a leaf or reed over the pond), skip it. The cheap rule: skip all `FLAG_NONE` pixels.
`sinP = -F.y` (0.5 at 30°).

### 7.3 Colour [src T: transparent pale water #84B7D2, #A5D2CE, #79B5C9; H opacity 0.5; Catlike/Roystan depth colour]
```glsl
float thick = dS - dW;                                       // along the view ray
float vdepth = thick * sinP;                                 // vertical water depth
float band = floor(clamp(vdepth / uDepthMax, 0.0, 0.999) * 3.0) / 2.0;   // 3 hard bands, uDepthMax 0.9
vec3 tint = mix(uShallow, uDeep, band);                      // #A5D2CE → #4F86A6 [deep suggested]
vec3 under = texture2D(tColor, refrUV).rgb;
vec3 col = mix(under * tint, tint, uMurk * band);            // uMurk 0.5
col = mix(col, texture2D(tReflect, reflUV).rgb, uReflect);  // uReflect 0.35 (ortho → constant fresnel)
```

### 7.4 Pixel-exact refraction wobble [src T: "screenspace pixel-perfect horizontal displacement"]
```glsl
float st = floor(uTime * 8.0) / 8.0;                                           // 8 fps
float wob = floor((vnoise(vec2(W.z * 2.2, st * 1.1)) - 0.5) * 3.0 + 0.5);      // −1, 0, +1 texels
vec2 refrUV = vUv + vec2(wob, 0.0) * texel();
// guard: the sampled pixel must also be under water, or we'd smear shore objects into the water
if (!isWaterAt(refrUV)) refrUV = vUv;
```
The noise is keyed on **world z** (rows of the surface), not the screen, so it doesn't swim when the camera
pans. Offsets are integers, so no texel is ever blended.

### 7.5 Shore highlight, exactly 1 px [src T: "drawing the highlight only if the depth of the background is 1 pixel behind the depth of the water texel"]
One screen row on the plane moves `t/sinP` horizontally, which along the view ray to a vertical wall is
`t/(sinP·cosP)` (2.31·t at 30°). So:
```glsl
float shoreThr = uTexelWorld / (sinP * sqrt(1.0 - sinP * sinP));
if (thick < shoreThr) col = uShoreCol;                        // #E8FBFF, tinted toward sky [src T]
```
This draws a 1-px line along every waterline on vertical walls and pillars (the horizontal cyan lines in
`refs/thumb_YJSal0UocLY.jpg`), and a slightly wider, natural band on gentle banks. As a fallback for
grazing banks that come out too wide, add a neighbour test so a pixel is shore only if a 4-neighbour is
non-water or also `thick < shoreThr`.

### 7.6 Ortho planar reflection (preRender hook) [src H: ortho reflection camera; T: "orthographic light probe from the perspective of the viewer"]
```js
pipeline.preRender.push((engine) => {
  const cam = engine.camera.cam, F = engine.uniforms.uCameraDir.value;
  // centre ray hits the plane at Q; the mirrored camera looks at Q along the mirrored direction
  const s = (cam.position.y - level) / -F.y, Q = cam.position.clone().addScaledVector(F, s);
  refl.copy(cam); refl.position.y = 2 * level - cam.position.y;
  refl.up.set(0, 1, 0); refl.lookAt(Q); refl.updateMatrixWorld();
  reflViewProj.multiplyMatrices(refl.projectionMatrix, refl.matrixWorldInverse);
  renderer.clippingPlanes = [clipPlane];       // new THREE.Plane(new Vector3(0,1,0), -level): keep y ≥ level
  engine.uniforms.uPassMode.value = 0;
  renderer.setRenderTarget(rtReflect); renderer.setClearColor(engine.style.sky, 1); renderer.clear();
  renderer.render(engine.scene, refl);
  renderer.clippingPlanes = [];
});
```
- In the pass, `reflUV = (uReflViewProj · W).xy·0.5 + 0.5`. All points along the mirrored ortho ray
  through W share one pixel, so the camera roll is irrelevant and `lookAt` is safe. Add the same `wob`
  offset.
- [decision] **Global `renderer.clippingPlanes`** instead of Aras' oblique ortho projection (H/I). It is
  simpler and works with every patched material (Lambert includes the clipping chunks; the program cache
  key includes the clipping-plane count). Three disables global planes during the shadow render.
- Optional: make the reflection frustum 1.2× larger if reflections are cut off near the frame edges.

### 7.7 Waves and foam lines [src H: world-space, view-aligned 1-px horizontal lines from Voronoi cells; inferred]
Per world cell (1.6 m grid): `centre = cell + hash2·cell`, `phase = hash`, life 2.5 s. Project the centre
with `uProjView` (set in `update()`) to low-res pixel coordinates `cpx = floor(...)`. A water pixel is on
the line if `floor(gl_FragCoord.y) == cpx.y && abs(floor(gl_FragCoord.x) − cpx.x) ≤ halfLen`, with
`halfLen = floor(5·sin(π·life01))` stepped at 6 fps. Check the 3×3 neighbouring cells. Colour #D6F1F5.
The lines are exactly 1 px and stable under camera snapping. Add sparse 1-px sparkles (hash per 0.5 m
cell, on for 1 of every 6 frames). Optional: shore foam as `thick < 2·shoreThr` with a hash-dashed pattern.

### 7.8 Pitfalls
- Particles over water get refracted (they're in `tColor`). Keep fireflies off the pond, or accept it.
- Lily pads and reeds are scene geometry above `level`, so `dS < dW` and the water pass leaves them alone.
  Submerged reed bases refract correctly.
- `inBounds` is essential if the terrain dips below `level` anywhere else.
- Reflections are raw colour (no outlines or post), which is fine at `uReflect ≤ 0.4`.

### 7.9 Acceptance
- Where a pillar stands in water: a 1-px light line along its waterline, its reflection below it touching
  the waterline, and its submerged part tinted and wobbling by whole texels.
- 2–3 discrete depth tints and no gradients. Wave lines exactly 1 px tall, appearing and disappearing.
- Pond edges have no outline artefacts, and leaves overhanging the water stay leaf-coloured.

---

## 8. atmosphere — `src/post/godrays.js` (+ `addFog`), `src/world/particles.js`, `scenes/_test-atmos.js`

### 8.1 God rays: a fullscreen low-res raymarch through light-parallel planes (order 150) [src H 2025 single-pass version: "a mathematically defined plane parallel to the sun … solve for a point on the plane … check shadow attenuation … ray march using a defined gap", 1.7 ms on a GTX 1060; T: "hard edges on the rays"]
**Accessing three's shadow map in r170 (verified in `node_modules/three` 0.170.0):**
- `engine.sun.shadow.map` is a `WebGLRenderTarget` (Nearest, RGBA). It is **`null` until the first
  shadowed render**, so bind it in `pass.update()`:
  `u.tShadow.value = engine.sun.shadow.map?.texture ?? null`. The post chain runs after the colour pass,
  so on frame 1 the map already exists.
- It stores **RGBA-packed depth** (`MeshDepthMaterial` with `RGBADepthPacking`), read with
  `unpackRGBAToDepth` from `#include <packing>`. r170 uses a `sampler2D`, not `sampler2DShadow`. (That
  changed after r170, and research quoting r186 does not apply.)
- `engine.sun.shadow.matrix` is the world → shadow texture matrix [0,1]³, including the bias. It is updated
  in place each shadow render, so bind it **by reference**: `uShadowMatrix: { value: engine.sun.shadow.matrix }`.
- The lit test mirrors `getShadow`: `lit = step(sc.z + bias, depth)` with `bias = sun.shadow.bias`.
```glsl
#include <packing>
uniform sampler2D tShadow; uniform mat4 uShadowMatrix; uniform float uShadowBias;
uniform float uGap, uTop, uFade, uPerPlane, uLevels, uStrength; uniform int uPlanes; uniform vec3 uRayColor;
float sunLit(vec3 wp) {                       // shared helper (copy into outline.js for light-aware edges)
  vec4 sc = uShadowMatrix * vec4(wp, 1.0);
  if (any(lessThan(sc.xyz, vec3(0.0))) || any(greaterThan(sc.xyz, vec3(1.0)))) return 0.0;
  return step(sc.z + uShadowBias, unpackRGBAToDepth(texture2D(tShadow, sc.xy)));
}
void main() {
  vec4 col = texture2D(tColor, vUv);
  vec3 F = normalize(uCameraDir), L = normalize(uSunDir);
  vec3 n = F - dot(F, L) * L; float fl = length(n);          // plane normal ⊥ sun, faces the camera most
  if (fl < 1e-3) { gl_FragColor = col; return; }
  n /= fl;
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 O = (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;          // ortho ray origin (near plane)
  float sceneT = linDepth(vUv) - uNear;
  float t = max(0.0, (O.y - uTop) / max(-F.y, 1e-3));         // start below the "ceiling" uTop
  float fn = dot(F, n);                                        // > 0
  float s0 = dot(O + F * t, n);
  t += (ceil(s0 / uGap) * uGap - s0) / fn;                     // first world-anchored plane (no swimming)
  float dt = uGap / fn, acc = 0.0;
  for (int i = 0; i < 48; i++) {
    if (i >= uPlanes || t > sceneT) break;
    acc += sunLit(O + F * t) * smoothstep(0.0, uFade, sceneT - t);   // soft meet with geometry
    t += dt;
  }
  float q = floor(min(acc * uPerPlane, 1.0) * uLevels) / uLevels;  // HARD bands [src T]
  col.rgb = 1.0 - (1.0 - col.rgb) * (1.0 - uRayColor * q * uStrength);   // screen blend
  gl_FragColor = col;
}
```
Parameters [suggested]: `uGap 0.45 m`, `uPlanes 32`, `uTop = target.y + 7 m`, `uFade 0.8 m`, `uPerPlane
0.06`, `uLevels 4`, `uStrength 0.45` (golden) / 0.25 (noon) / 0 (night, unless moonbeams), `uRayColor =
sunColor·(1.0, 0.86, 0.72)`. Measured shaft colours: #9D9391 / #C5ABAB on haze #5C666B [T god-ray
forest].
- Planes are anchored to world `dot(X, n) = k·gap`, so camera pans don't move the shafts. Shafts come from
  canopy-core shadows and are parallel diagonal bands in ortho.
- **Depth blur isn't needed.** H blurred depth (r≈7 px) only because grass was in his depth buffer. Ours
  isn't (§0.4). If ray ends look harsh on solids, raise `uFade`.
- Shadow coverage: the march must stay inside the shadow camera (`shadowExtent` ≥ view radius + tree height).
  Outside it, `sunLit` returns 0.

### 8.2 Fog and mist (`addFog(engine, opts)`, order 50, banded)
```glsl
vec3 wp = worldPos(vUv); float d = linDepth(vUv);
float h = clamp((uMistTop - wp.y) / uMistDepth, 0.0, 1.0)
        * smoothstep(0.35, 0.75, fbm(wp.xz * 0.12 + vec2(uTime * 0.03, 0.0)));   // valley/ground mist
float dist = smoothstep(uFogNear, uFogFar, d - uFocusDepth);                    // depth fog behind the subject
float f = floor(max(h * uMistAmt, dist * uFogAmt) * 4.0) / 4.0;                   // 4 hard steps
col.rgb = mix(col.rgb, uFogColor, f);
```
`uFocusDepth` = the linear depth of `camera.target` (computed in `update()`). Fog colours: #757881 /
#787380 [measured T misty hill], golden haze #C9B9A6 [suggested], night #1E2A44 [suggested]. Mist
mostly on low ground (`uMistTop` = ground + 0.8 m). Background (sky) pixels are skipped.

### 8.3 Particles (`createParticles(engine, {kind, bounds, count})`)
Use `THREE.Points` with a custom `ShaderMaterial` on `LAYERS.COLOR_ONLY` (`points.layers.set(1)`). Declare
`uniform int uPassMode;` and `discard` when it is 1 (the contract). `gl_PointSize` is in **render-target
pixels**, because the RT is low-res and pixel ratio is 1.
```glsl
// vertex: pixel-snapped point sprite
vec3 p = position + motion(aSeed, uTime);                     // pure function of time
vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);      // ortho → w = 1
vec2 px = (clip.xy * 0.5 + 0.5) * uLowSize;                    // uLowSize: pipeline.common.uLowSize (by ref)
px = (uSize == 2.0) ? floor(px + 0.5) : floor(px) + 0.5;       // odd sizes on texel centres, even on corners
clip.xy = px / uLowSize * 2.0 - 1.0;
gl_Position = clip; gl_PointSize = uSize;
```
| kind | look | count / size / colour [suggested] | motion |
|---|---|---|---|
| dust | 1 px motes, **only inside sun shafts**: sample `sunLit(p)` in the vertex shader (bind `tShadow`/`uShadowMatrix` as in §8.1 from an `onUpdate`) and hide when 0 | 200–400, 1 px, sunColor·0.9 at α 0.7 | slow drift 0.05 m/s and swirl. Twinkle by toggling visibility at 4 fps |
| fireflies | 1 px core + 4-neighbour halo (3-px point, plus-shaped mask from `gl_PointCoord`), additive | 60–120, #E8F27A core, halo #8FB04A·0.5 | wander (sum of 2 sines per axis, 0.2–0.5 m/s), blink: on for 2 s, off for 1–3 s, stepped 6 fps |
| leaves | 2×2 or 3×2 px flat sprite, 2-frame flip | 20–40, leaf hi/mid tones | fall at 0.4 m/s, sideways `sin` flutter 0.3 m, loop in `bounds` |
| rain | 1×4 px streak (point size 4, keep the centre column), 2:1 slant optional | 600–1200, #A9C4D8 α 0.6 | 9 m/s fall, loop. Pair with grade desaturation 0.8 |

Particles are not in the normal pass, so they never get outlines. Size in world terms equals pixels, so
they stay 1–3 px at any zoom. That is intended.

### 8.4 Night
`applyTimeOfDay(engine,'night')` (lighting) + fireflies + grade vignette 0.35 and grain 0.035 + optional
1–2 lanterns (PointLight, warm #FFC46B, quantized, 8-fps wiggle §3.7) + optional moonbeams (godrays
strength 0.15, colour #9FB6E8).

### 8.5 Acceptance
- God rays: hard-edged diagonal bands with 2–4 discrete brightness levels and no noise or dithering.
  Shafts line up with gaps between canopy shadows and stay put when the camera pans (crawl test).
- Fog and mist: ≤ 4 discrete steps, and distant objects lift toward the fog colour.
- Particles: every particle is 1–3 px, on the texel grid, never blurred, and frame-stepped.

---

## 9. scene composition (scene-* agents; also read ART_DIRECTION.md)

### 9.1 What the refs do (`refs/small_pass_0*.png`, `thumb_JMhDEPIJths.jpg`, `thumb_ZsMHY4LDyRE.jpg`, `thumb_fSNdZ82I-eQ.jpg`)
1. **One clear subject, framed by a ring.** The octagon sits slightly below centre. Pillars ring it at
   about 1.5× its radius. Trees frame the corners and are cut by the frame edges.
2. **Big flat value shapes.** About 40% of the ground is in cloud or tree shadow, as large blobs. Their
   edges are grass fringes. Lit patches are the brightest areas of the image. Stone sits between grass-hi
   and grass-shadow in value.
3. **Warm light, cool shadow.** Lit grass is yellow-green (#BBD985), shade grass teal (#3B6B5A), stone
   shadow blue-violet (#5B5A64). Saturation carries the light more than value does [src T].
4. **Hard architecture in a soft field.** Outlined, faceted, 45°-aligned solids against outline-free
   organic grass and leaves. That contrast is the style.
5. **Detail at three scales.** Large (pillars, trees, 60–150 px), medium (slabs, boulders, debris 10–40
   px), small (pebbles, flowers, 1-px rims, 1–5 px).
6. **One saturated accent**, ≤ 1–2% of pixels: the cyan cube, lilac flowers, red mushrooms.
7. **Corners are never empty.** Cobble, dirt or a tree crown occupies each corner to break the green.
   Terrain extends well past the frame, so no world edge or sky shows at 30° pitch.
8. **Layering.** Foreground occluders (tree crowns or bushes at the bottom edge, 10–20% of the frame)
   create depth in an otherwise flat ortho image. Back-layer fog or desaturation separates distant trees
   (golden and misty scenes).

### 9.2 Practical framing rules
- `engine.camera.set({ target, yaw: k·π/4, pitch: π/6, viewHeight })`, with viewHeight 9–12 for 640×360.
  The visible ground is `(640/360)·viewHeight` wide × `2·viewHeight` deep.
- Set the sun with `sunDirFor(yaw, relAz, elev)` (§3.7). Classic: sun from screen-right/front (relAz
  +20…+45°, elev 45–55°), so shadows fall up-left and objects show a lit front and a shadowed right side.
  Back-light (relAz −120…−150°) for god rays.
- `setSun({shadowExtent})` ≈ 0.9 × the view's ground half-diagonal (18–24) keeps a shadow texel ≤ a
  screen texel.
- Value check: render with `debug=raw` and look at it as greyscale. The subject must separate from the
  ground in value or hue in at least one band.
- Animate only through `t`: cloud drift, wind frames, bobbing accent (snapped with `camera.snapWorld`),
  water and particles. Static camera in captures.
- Scene acceptance: score the render against the rubric in ART_DIRECTION.md §4 before reporting.
