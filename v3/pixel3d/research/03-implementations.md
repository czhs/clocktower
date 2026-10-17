# 03 — Existing implementations of "3D pixel art" rendering (for a three.js WebGL2 build)

Researched 2026-10-15. three.js latest release at time of writing: **r186** (dev branch read directly).
Everything marked **verbatim** was copied from the source file at the given URL. Everything marked **adapted**
is my rewrite for three.js WebGL2/GLSL3 and has **not been run yet**. Licence is noted for each source.

Contents
1. three.js `RenderPixelatedPass` and `webgl_postprocessing_pixel` (Kody King), MIT
2. Kody King's original repo `hello-threejs` (no licence)
3. Sub-pixel camera snapping: formulas and three.js code
4. Pixel-art upscaling filters (t3ssel8r / sharp-bilinear / fat-pixel / Klems / IQ / Cole Cecil)
5. Other engines and techniques (Godot outline shader, Unity isometric pipeline, ProPixelizer, Pixelat3D, Acerola, toon bands + shadows, Bayer + palette, Poisson on meshes, instanced grass, toon water)
6. three.js gotchas checklist
7. Recommended architecture for a modular three.js 3D pixel-art renderer

---

## 1. three.js `RenderPixelatedPass` + `webgl_postprocessing_pixel` (Kody King)

- Pass: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/postprocessing/RenderPixelatedPass.js
- Example: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_postprocessing_pixel.html
- Live: https://threejs.org/examples/webgl_postprocessing_pixel.html
- Licence: MIT (three.js).

### Summary
- Renders the scene **twice** at `floor(W/pixelSize) x floor(H/pixelSize)`:
  1. A beauty pass into `_beautyRenderTarget`: `HalfFloatType`, `NearestFilter`, with a `DepthTexture` attached.
  2. A normal pass into `_normalRenderTarget`, using `scene.overrideMaterial = new MeshNormalMaterial()`. The normals are view-space and packed as `n*0.5+0.5`.
- A fullscreen quad then upsamples to the composer's write buffer. The beauty and normal textures use Nearest filtering. At each low-res texel the shader computes:
  - **Depth edge (silhouette, inner outline):** the sum of the positive depth differences to the 4 neighbours, i.e. how much farther each neighbour is than the centre. A pixel on the *near* side of a silhouette darkens. The result is quantized to {0, 0.5, 1} with `floor(smoothstep(0.01,0.02,diff)*2.)/2.`.
  - **Normal edge (crease highlight):** the sum over the 4 neighbours of `(1 - dot(n, nNeighbour)) * depthIndicator * normalIndicator`, followed by `step(0.1, ...)`.
    - `depthIndicator` keeps only the *shallower* pixel of a pair. This is what makes highlights land on **convex** edges: on a concave crease, the crease pixels are the farthest ones and so are rejected.
    - `normalIndicator` keeps only the side whose normal is "more toward" `normalEdgeBias = (1,1,1)` in view space (right, up, toward the camera). This gives a 1-px line on one side of the edge instead of a 2-px line.
  - The output is `texel * (dei>0 ? 1 - depthEdgeStrength*dei : 1 + normalEdgeStrength*nei)`. Edges darken or brighten the underlying colour; they are not drawn in a flat colour.
- Defaults: `pixelSize 6`, `normalEdgeStrength 0.3`, `depthEdgeStrength 0.4`. The GUI ranges are pixelSize 1–16, normal 0–2 and depth 0–1.

### Verbatim GLSL (fragment shader, three.js dev, MIT)
```glsl
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec4 resolution;
uniform float normalEdgeStrength;
uniform float depthEdgeStrength;
varying vec2 vUv;

float getDepth(int x, int y) {
    return texture2D( tDepth, vUv + vec2(x, y) * resolution.zw ).r;
}

vec3 getNormal(int x, int y) {
    return texture2D( tNormal, vUv + vec2(x, y) * resolution.zw ).rgb * 2.0 - 1.0;
}

float depthEdgeIndicator(float depth, vec3 normal) {
    float diff = 0.0;
    diff += clamp(getDepth(1, 0) - depth, 0.0, 1.0);
    diff += clamp(getDepth(-1, 0) - depth, 0.0, 1.0);
    diff += clamp(getDepth(0, 1) - depth, 0.0, 1.0);
    diff += clamp(getDepth(0, -1) - depth, 0.0, 1.0);
    return floor(smoothstep(0.01, 0.02, diff) * 2.) / 2.;
}

float neighborNormalEdgeIndicator(int x, int y, float depth, vec3 normal) {
    float depthDiff = getDepth(x, y) - depth;
    vec3 neighborNormal = getNormal(x, y);

    // Edge pixels should yield to faces who's normals are closer to the bias normal.
    vec3 normalEdgeBias = vec3(1., 1., 1.); // This should probably be a parameter.
    float normalDiff = dot(normal - neighborNormal, normalEdgeBias);
    float normalIndicator = clamp(smoothstep(-.01, .01, normalDiff), 0.0, 1.0);

    // Only the shallower pixel should detect the normal edge.
    float depthIndicator = clamp(sign(depthDiff * .25 + .0025), 0.0, 1.0);

    return (1.0 - dot(normal, neighborNormal)) * depthIndicator * normalIndicator;
}

float normalEdgeIndicator(float depth, vec3 normal) {
    float indicator = 0.0;
    indicator += neighborNormalEdgeIndicator(0, -1, depth, normal);
    indicator += neighborNormalEdgeIndicator(0, 1, depth, normal);
    indicator += neighborNormalEdgeIndicator(-1, 0, depth, normal);
    indicator += neighborNormalEdgeIndicator(1, 0, depth, normal);
    return step(0.1, indicator);
}

void main() {
    vec4 texel = texture2D( tDiffuse, vUv );
    float depth = 0.0;
    vec3 normal = vec3(0.0);
    if (depthEdgeStrength > 0.0 || normalEdgeStrength > 0.0) {
        depth = getDepth(0, 0);
        normal = getNormal(0, 0);
    }
    float dei = 0.0;
    if (depthEdgeStrength > 0.0)
        dei = depthEdgeIndicator(depth, normal);
    float nei = 0.0;
    if (normalEdgeStrength > 0.0)
        nei = normalEdgeIndicator(depth, normal);
    float Strength = dei > 0.0 ? (1.0 - depthEdgeStrength * dei) : (1.0 + normalEdgeStrength * nei);
    gl_FragColor = texel * Strength;
}
```

### Verbatim JS: the example's pixel-alignment tricks (three.js dev, MIT)
The current dev example adds snapping that older versions lacked: camera rotation and zoom snapping, frustum alignment, object position snapping and object rotation snapping. All of these are applied **only for the render** and then restored, so OrbitControls and animation keep the true values.

```js
function pixelAlignFrustum( camera, aspectRatio, pixelsPerScreenWidth, pixelsPerScreenHeight ) {
    // 0. Get Pixel Grid Units
    const worldScreenWidth = ( ( camera.right - camera.left ) / camera.zoom );
    const worldScreenHeight = ( ( camera.top - camera.bottom ) / camera.zoom );
    const pixelWidth = worldScreenWidth / pixelsPerScreenWidth;
    const pixelHeight = worldScreenHeight / pixelsPerScreenHeight;
    // 1. Project the current camera position along its local rotation bases
    const camPos = new THREE.Vector3(); camera.getWorldPosition( camPos );
    const camRot = new THREE.Quaternion(); camera.getWorldQuaternion( camRot );
    const camRight = new THREE.Vector3( 1.0, 0.0, 0.0 ).applyQuaternion( camRot );
    const camUp = new THREE.Vector3( 0.0, 1.0, 0.0 ).applyQuaternion( camRot );
    const camPosRight = camPos.dot( camRight );
    const camPosUp = camPos.dot( camUp );
    // 2. Find how far along its position is along these bases in pixel units
    const camPosRightPx = camPosRight / pixelWidth;
    const camPosUpPx = camPosUp / pixelHeight;
    // 3. Find the fractional pixel units and convert to world units
    const fractX = camPosRightPx - Math.round( camPosRightPx );
    const fractY = camPosUpPx - Math.round( camPosUpPx );
    // 4. Add fractional world units to the left/right top/bottom to align with the pixel grid
    camera.left = - aspectRatio - ( fractX * pixelWidth );
    camera.right = aspectRatio - ( fractX * pixelWidth );
    camera.top = 1.0 - ( fractY * pixelHeight );
    camera.bottom = - 1.0 - ( fractY * pixelHeight );
    camera.updateProjectionMatrix();
}

function pixelAlignObject( object, camera, pixelWidth, pixelHeight ) {
    const camRot = new THREE.Quaternion(); camera.getWorldQuaternion( camRot );
    const camRight = new THREE.Vector3( 1.0, 0.0, 0.0 ).applyQuaternion( camRot );
    const camUp = new THREE.Vector3( 0.0, 1.0, 0.0 ).applyQuaternion( camRot );
    const camForward = new THREE.Vector3( 0.0, 0.0, - 1.0 ).applyQuaternion( camRot );
    const pos = object.position;
    const posRight = pos.dot( camRight );
    const posUp = pos.dot( camUp );
    const posForward = pos.dot( camForward );
    const snappedRight = Math.round( posRight / pixelWidth ) * pixelWidth;
    const snappedUp = Math.round( posUp / pixelHeight ) * pixelHeight;
    pos.set( 0, 0, 0 );
    pos.addScaledVector( camRight, snappedRight );
    pos.addScaledVector( camUp, snappedUp );
    pos.addScaledVector( camForward, posForward );
}
```
The example also includes `pixelAlignCamera`, which snaps the orbit azimuth and polar angle to `rotationIncrementDegrees` in spherical coordinates and then re-runs `lookAt`. It snaps zoom to `zoomIncrement` as well. Defaults are `cameraRotationSnap 9°`, `cameraZoomSnap 0.1` and `rotationSnap 15°` for objects. Separately, the crystal's emissive pulse is quantized to 6 brightness levels: `Math.round(x*(L-1))/(L-1)`.

**What the frustum trick does:** it shifts the projection window by `-fract * pixelWidth`, the same as moving the camera to the nearest texel-grid point. This removes **pixel creep** for static geometry. However, the image then moves in whole-texel steps, which look choppy at large `pixelSize`. The example has no sub-pixel compensation; Section 3 adds it.

### Weaknesses to fix in our own version
- **Thresholds are in raw depth-buffer units** (0.01–0.02 of `[near, far]`), so they depend on `far - near`. For an orthographic camera, depth is linear, so 0.01 means 1% of the depth range. Convert to view-space Z and use world-unit thresholds instead.
- **The normal pass uses an `overrideMaterial`.** It ignores `alphaTest` and maps (cut-out grass cards turn into full quads), ignores `onBeforeCompile` vertex animation (wind), and doubles the draw calls. Use MRT, or give each custom material a matching normal variant (see §6).
- `floor(W/pixelSize)` followed by stretching to W gives **non-uniform pixel widths** whenever W is not divisible by `pixelSize`. Use `ceil` and crop instead (§3).
- Sampling uses `texture2D` with UV offsets and Nearest filtering. `texelFetch(tex, ivec2(gl_FragCoord.xy) + off, 0)` is exact and cheaper.
- `renderer.setPixelRatio( devicePixelRatio )` is commented out in the example. On HiDPI screens, decide whether `pixelSize` is counted in CSS pixels or device pixels. Read the drawing-buffer size with `renderer.getDrawingBufferSize()`.

---

## 2. Kody King's original: `KodyJKing/hello-threejs`

- Repo: https://github.com/KodyJKing/hello-threejs. Its README describes it as "A 3D pixel-art style shader with clean outlines and edge highlights". Video: https://www.youtube.com/watch?v=jFevm02NJ5M
- Files: `src/RenderPixelatedPass.ts`, `src/PixelatePass.ts`, `src/index.ts`, `src/math.ts` (raw: `https://raw.githubusercontent.com/KodyJKing/hello-threejs/main/src/...`)
- **Licence: none declared** (the GitHub API returns `license: null`). The README says "feel free to adapt and use this however you like", but there is no formal licence. Reuse the MIT three.js port in §1 instead, which is the same algorithm.
- Differences from the three.js port (paraphrased):
  - The normal term uses `distance(normal, neighbourNormal)` instead of `1 - dot(...)`.
  - The strengths are hard-coded at 0.3 and 0.4, and a commented-out variant modulates them by luminance.
  - Pipeline order: `RenderPixelatedPass` (low res, which also does the edge pass) → **`UnrealBloomPass` at full screen resolution** → `PixelatePass`. The last pass re-quantizes the bloomed image to the low-res grid using `iuv = (floor(res*vUv)+.5)/res`. This keeps bloom chunky, because bloom is computed at high res and then point-sampled back onto the art-pixel grid.
  - The renderer is created with `antialias:false`. All textures use `NearestFilter` with `generateMipmaps=false` (a `pixelTex()` helper).
  - The camera is orthographic with `(-aspect, aspect, 1, -1, 0.1, 10)` at `y = 2*tan(30°)`, `z = 2`, which gives an isometric-ish 30° pitch.
- The forum project "Return of the Earthmover" (https://discourse.threejs.org/t/return-of-the-earthmover-3d-pixel-art-game/56454) uses this repo almost unmodified, with render resolution set to screen size divided by pixel size.

---

## 3. Sub-pixel ("smooth pixel-perfect") camera snapping

Sources:
- aarthificial, 2D explanation: https://youtu.be/jguyR4yJb1M (video; I could not fetch a transcript, so the technique below is as described by the two articles that cite it).
- David Holland, 3D adaptation in Godot: https://www.davidhol.land/articles/3d-pixel-art-rendering/ and video https://youtu.be/LQfAGAj9oNQ. Holland describes two steps: "Snap the camera to a view-aligned, texel-sized grid", then "shift it back in screen space by the snap error".
- `bababuyyy/unity-isometric-pixel-pipeline` (Unity 6 URP, **MIT**), which has working code: https://github.com/bababuyyy/unity-isometric-pixel-pipeline (`Assets/Scripts/Systems/IsometricCameraController.cs`, `Assets/Shaders/PostProcess/SharpUpscaleShader.shader`).
- GameMaker equivalent (yal.cc): https://yal.cc/gamemaker-smooth-pixel-perfect-camera/. It makes the view one pixel larger, keeps the camera rounded, and draws the surface offset by the fractional part.
- Unity 2D `Pixel Perfect Camera` (URP package): its "Upscale Render Texture" and "Pixel Snapping" options do the snap but not the sub-pixel shift. A forum thread on adding the shift: https://discussions.unity.com/t/need-help-with-cropping-camera-output-in-a-shader-using-a-custom-render-pass/1586409
- Godot: the asset "PixelPerfectSmoother" (https://godotengine.org/asset-library/asset/4846) and the godotshaders "Subpixel-Perfect Display" (https://godotshaders.com/?p=8497). Neither has been verified.

### Verbatim C# snapping core (bababuyyy, MIT)
```csharp
int pixelRenderHeight = pixelRendererFeature != null ? pixelRendererFeature.settings.height : 360;
float texelSize = _cam.orthographicSize * 2f / pixelRenderHeight;
// Convert to local space of the camera's visual perspective.
Vector3 localPos = _cam.transform.InverseTransformPoint(_truePosition);
// Snap XY to texel grid.
float snappedX = Mathf.Round(localPos.x / texelSize) * texelSize;
float snappedY = Mathf.Round(localPos.y / texelSize) * texelSize;
// Calculate rounding error.
Vector2 snapError = new Vector2(localPos.x - snappedX, localPos.y - snappedY);
// Convert error to UV space.
float uvOffsetX = snapError.x / (_cam.orthographicSize * 2f * _cam.aspect);
float uvOffsetY = snapError.y / (_cam.orthographicSize * 2f);
Vector3 snappedPos = new Vector3(snappedX, snappedY, localPos.z);
transform.position = _cam.transform.TransformPoint(snappedPos);
Shader.SetGlobalVector("_PixelPanOffset", new Vector4(uvOffsetX, uvOffsetY, 0, 0));
```
The upscale shader then does `uv += _PixelPanOffset.xy;` before sampling. This pipeline renders **no margin**, so the screen edges show a sliver of clamped texels of up to half a texel. That is the reason for adding 1 px of margin below.

### Exact formulas (orthographic camera)
Definitions:
- `W, H` = drawing-buffer size in device pixels.
- `p` = art-pixel size in screen pixels. Integer gives perfectly uniform pixels; non-integer is fine with the sharp-bilinear upscale in §4.
- `t` = world units per art pixel, i.e. the **texel world size**.
  - Unity style: `t = orthoSize*2 / renderHeight`, where `orthoSize` is the half-height.
  - three.js: `t = (camera.top - camera.bottom) / camera.zoom / renderHeight`.
  - Recommended: fix `t` directly (for example 1/16 world unit = 16 art px per metre) and derive the frustum from it, so zoom changes `p` instead of `t`.
- Core low-res size: `w = ceil(W/p)`, `h = ceil(H/p)`. Margin `m = 1`; use 2 if `ceil` adds slack. The render target is `(w+2m) x (h+2m)`.
- Frustum, with `camera.zoom = 1`:
  `left = -(w/2+m)*t; right = +(w/2+m)*t; top = +(h/2+m)*t; bottom = -(h/2+m)*t`
- The camera basis comes from the (already rotation-snapped) quaternion `q`: `R = (1,0,0)·q`, `U = (0,1,0)·q`, `F = (0,0,-1)·q`.
- Snap, with `P` = true camera position:
  - `a = P·R`, `b = P·U`
  - `a' = round(a/t)*t`, `b' = round(b/t)*t`
  - `P' = P + (a'-a)·R + (b'-b)·U` is the position actually rendered. The depth component along F is unchanged.
  - The remainder in texels is `ex = (a-a')/t` and `ey = (b-b')/t`, both in `[-0.5, 0.5]`.
- Upscale lookup in **RT texel units**, where `vUv` is the screen UV in `[0,1]` and `y` is up as in three.js:
  `tex = origin + (ex, ey) + vUv * (W/p, H/p)`, with `origin = (m + (w - W/p)/2, m + (h - H/p)/2)`
  `uv_rt = tex / (w+2m, h+2m)`
  - Check: the screen centre maps to `m + w/2`, which is the RT centre. ✓
  - Sign check: if the camera moved +0.3 texel to the right while still snapped to the old grid point, then `ex = +0.3`. Sampling at +0.3 shifts the image left, which is correct for a camera moving right. ✓
- In UV terms, Unity's `uvOffset = snapError / viewWidthWorld` is the same thing: `ex / w` in UV when there is no margin.

### Adapted three.js code
```js
import * as THREE from 'three';
const _R = new THREE.Vector3(), _U = new THREE.Vector3();

/** Positions `cam` at the texel-snapped version of truePos and returns the sub-texel remainder. */
export function snapOrthoCamera(cam, truePos, trueQuat, t) {
  _R.set(1, 0, 0).applyQuaternion(trueQuat);
  _U.set(0, 1, 0).applyQuaternion(trueQuat);
  const a = truePos.dot(_R), b = truePos.dot(_U);
  const sa = Math.round(a / t) * t, sb = Math.round(b / t) * t;
  cam.quaternion.copy(trueQuat);
  cam.position.copy(truePos).addScaledVector(_R, sa - a).addScaledVector(_U, sb - b);
  cam.updateMatrixWorld(true);
  return { ex: (a - sa) / t, ey: (b - sb) / t };   // texels, [-0.5, 0.5]
}

export function layoutPixelFrame(renderer, cam, rt, p, t, m = 1) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const W = size.x, H = size.y;
  const w = Math.ceil(W / p), h = Math.ceil(H / p);
  rt.setSize(w + 2 * m, h + 2 * m);
  cam.left = -(w / 2 + m) * t; cam.right = (w / 2 + m) * t;
  cam.top = (h / 2 + m) * t;   cam.bottom = -(h / 2 + m) * t;
  cam.zoom = 1; cam.updateProjectionMatrix();
  return {
    rtSize: new THREE.Vector2(w + 2 * m, h + 2 * m),
    screenTexels: new THREE.Vector2(W / p, H / p),
    origin: new THREE.Vector2(m + (w - W / p) / 2, m + (h - H / p) / 2),
  };
}
```

### Notes and gotchas
- **Rotation:** creep cannot be avoided while the camera rotates, because the grid itself rotates. Either snap yaw and pitch to increments (as the three.js example does) or accept it during rotation. For a fixed isometric view, rotate only in discrete 90° or 45° steps with a fade or snap.
- **Zoom:** changing `t` continuously makes the image crawl. Zoom by changing integer `p`, or snap `t` to a ladder of values.
- **Moving objects** should also be snapped to the `R/U` texel grid at render time (`pixelAlignObject`, then restore), or their silhouettes shimmer.
  - Trade-off for the object the camera *follows*: if both are snapped, the followed object jitters by up to ±0.5 px relative to screen centre as the remainder changes. If you render the followed object *unsnapped*, it stays exactly centred but its silhouette re-rasterizes, a small shimmer.
  - Pick one per game. Holland's and aarthificial's approach is to snap everything.
- **Integer `p`:** with a plain Nearest upscale, the sub-pixel offset is effectively quantized to whole screen pixels (1/p texel). That is already smooth, and Nearest keeps palette purity. The sharp-bilinear filter (§4) is needed only for non-integer `p` or extra smoothness.
- **Shadows creep too.** Snap the directional light's shadow camera to *its* texel grid in light space using the same formula, with `t_shadow = (shadowCam.right - shadowCam.left) / mapSize.x`. This is the standard "stable cascaded shadows" trick.
- Keep the *true* transform for gameplay and controls. Snap only inside `render()` and restore afterwards, as the three.js example does.
- Use float64 in JS for the dot products. For very large worlds, re-centre the origin to avoid float32 jitter in shaders.

---

## 4. Pixel-art upscaling shaders (smooth sub-pixel motion without shimmer)

### 4a. t3ssel8r, "Crafting a Better Shader for Pixel Art Upscaling" (YouTube)
t3ssel8r publishes no official repo. His Patreon notes ("Pixel Art AA Video Notes", https://www.patreon.com/posts/pixel-art-aa-83276362, returns 403 to fetchers) are paraphrased in search snippets as follows:
- The bilinear sampler acts as a box filter. Compute the screen-pixel box size in texels, then **clamp it to 1** so the GPU's bilinear filtering takes over when minifying.
- Remap with smoothstep inside the band at each texel edge.
- Pass the original UV gradient (`textureGrad`) to keep mip selection correct.

The community-standard form below appears in the Unity forum thread https://discussions.unity.com/t/pixel-art-filter-to-fix-creep-and-jitter/1610967 (excerpt: `float2 boxSize = clamp(fwidth(data.uv) * _MainTex_TexelSize.zw, 1e-5, 1);`). It also appears in the MIT bababuyyy repo.

Verbatim from `SharpUpscaleShader.shader` (bababuyyy, **MIT**):
```hlsl
float2 uv = input.texcoord;
// Apply snap error compensation during texture sampling.
uv += _PixelPanOffset.xy;
float2 px = _BlitTexture_TexelSize.xy;
float2 fw = clamp(fwidth(uv) / px, 1e-5, 1.0);
float2 grid = uv / px - 0.5 * fw;
float2 blend = smoothstep(1.0 - fw, float2(1.0, 1.0), frac(grid));
float2 finalUV = (floor(grid) + 0.5 + blend) * px;
half4 color = SAMPLE_TEXTURE2D_LOD(_BlitTexture, sampler_LinearClamp, finalUV, 0);
```

**Adapted for three.js (GLSL3 `ShaderMaterial`), combined with the §3 margin and offset.** The low-res texture **must use `LinearFilter`**, because the trick relies on hardware bilinear filtering inside the ~1-screen-pixel edge band.
```glsl
precision highp float;
uniform sampler2D tLow;        // LinearFilter, no mipmaps
uniform vec2 rtSize;           // (w+2m, h+2m)
uniform vec2 screenTexels;     // (W/p, H/p)
uniform vec2 origin;           // (m + (w-W/p)/2, m + (h-H/p)/2)
uniform vec2 subpixel;         // (ex, ey) texels
in vec2 vUv;
out vec4 outColor;

vec4 sharpSample(vec2 tex) {                 // tex in texel units
  vec2 boxSize = clamp(fwidth(tex), 1e-5, 1.0);   // = 1/p for a fullscreen pass
  vec2 tx = tex - 0.5 * boxSize;
  vec2 txOffset = smoothstep(1.0 - boxSize, vec2(1.0), fract(tx));
  vec2 uv = (floor(tx) + 0.5 + txOffset) / rtSize;
  return textureLod(tLow, uv, 0.0);
}

void main() {
  vec2 tex = origin + subpixel + vUv * screenTexels;
  outColor = sharpSample(tex);
  // colour space: see §6 — convert linear->sRGB here if this pass writes to the canvas
}
```
For a fullscreen pass, `fwidth(tex)` is the constant `1/p`, so `boxSize` can be a uniform. Keep `fwidth` if the same function will be used on in-world textures; t3ssel8r's original targets textures on 3D surfaces, where it replaces nearest-neighbour sampling of pixel-art textures.

### 4b. Other filters (all from https://jorenjoestar.github.io/post/pixel_art_filtering/; that page states no licence, and the originals are Shadertoy, which defaults to CC BY-NC-SA unless the author says otherwise)
Short verbatim quotes of the core lines, for comparison:
- **Inigo Quilez** (posted in the comments of Klems' Shadertoy): `seam = floor(pixel + 0.5); dudv = fwidth(pixel); pixel = seam + clamp((pixel - seam) / dudv, -0.5, 0.5);`. This is the shortest version; it is "linear" inside a one-screen-pixel band.
- **Klems** (Shadertoy MllBWf): `pixels = uv*size + 0.5; fr = smoothstep(0.5 - aa, 0.5 + aa, fract(pixels)); aa = fwidth(pixels)*0.75; uv = (floor(pixels) + fr - 0.5)/size`.
- **Fat pixel** (Shadertoy ltBGWc, after Casey Muratori): `fat = floor(pixel) + 0.5; fat += 1 - clamp((1 - fract(pixel)) * texelsPerPixel, 0, 1);`.
- **Cole Cecil**, "Scaling Pixel Art Without Destroying It" (https://colececil.dev/blog/2017/scaling-pixel-art-without-destroying-it/): nearest-neighbour in texel interiors, blending only within `texelsPerPixel` of the borders; `texelsPerPixel` is computed on the CPU. The article is "All rights reserved", so don't copy its code; the IQ and fat-pixel forms are equivalent.
- **Mārtiņš Možeiko** (Handmade Network thread https://hero.handmade.network/forums/code-discussion/t/8239/p/25584): the same idea as IQ.
- **Themaister**, "Why coverage based pixel art filtering is terrible" (https://themaister.net/blog/2018/08/): a bandlimited alternative (`bandlimited_pixel_filter.h` in Granite). Higher quality and higher cost.
- **Sharp-bilinear** (libretro / rsn8887, https://github.com/rsn8887/Sharp-Bilinear-Shaders): integer-prescale with nearest, then bilinear for the remaining fraction. A good fallback with no derivatives.
- **Firerabbit "3D Pixelart Upscaler/Filter"** (godotshaders, MIT, https://godotshaders.com/shader/pixelart-upscaler-filter/): a different idea. It samples 4 corners plus a filtered sample and picks the corner colour closest to the filtered one, which produces palette-pure edges with no blending. Useful if the upscale must never produce off-palette colours.

**Choice for us:** at integer `p`, use Nearest plus the integer-quantized sub-pixel offset. That gives palette-pure output and is already smooth. At non-integer `p` or on HiDPI, use the t3ssel8r/IQ filter. It emits at most a 1-screen-pixel blended seam per texel edge, which is invisible in practice.

---

## 5. Other engines and techniques

### 5a. Godot: "3D Pixel art outline & highlight Shader (Post-processing/object)", by Leo Peltola
- https://godotshaders.com/shader/3d-pixel-art-outline-highlight-post-processing-shader/
- Licence: the code header says MIT; the page says CC0. Either way it is permissive.
- The code says it is a port of the three.js pass. Differences:
  - It **linearizes depth to view-space distance** (`-view_space.z` via `INV_PROJECTION_MATRIX`), so thresholds are in world units.
  - Silhouette: `depth_diff = smoothstep(0.2, 0.3, Σclamp(neighbour - centre, 0, 1))`, in world units.
  - It adds a **concave suppressor** `neg_depth_diff = 0.5 + Σ(centre - neighbour)`, clamped and pushed through `smoothstep(0.5,0.5,x)*10`. This kills highlights where the centre is behind its neighbours.
  - Highlight: `normal_diff = smoothstep(0.2, 0.8, Σ normalIndicator) - neg_depth_diff`.
  - It mixes toward configurable `highlight_color` and `shadow_color` (strengths 0.1 and 0.4) instead of multiplying.
- Variants:
  - Perspective-camera fix by Riley Evans: https://godotshaders.com/shader/3d-pixel-art-outline-highlight-shader-perspective-camera/
  - In-editor quad version by ARez: https://godotshaders.com/shader/3d-pixel-art-outline-highlight-shader-adapted-for-in-editor-perspective/

Verbatim core (MIT/CC0):
```glsl
float normalIndicator(vec3 normalEdgeBias, vec3 baseNormal, vec3 newNormal, float depth_diff){
	float normalDiff = dot(baseNormal - newNormal, normalEdgeBias);
	float normalIndicator = clamp(smoothstep(-.01, .01, normalDiff), 0.0, 1.0);
	float depthIndicator = clamp(sign(depth_diff * .25 + .0025), 0.0, 1.0);
	return (1.0 - dot(baseNormal, newNormal)) * depthIndicator * normalIndicator;
}
// ... in fragment():
neg_depth_diff = clamp(neg_depth_diff, 0., 1.);
neg_depth_diff = clamp(smoothstep(0.5, 0.5, neg_depth_diff)*10., 0., 1.);
depth_diff = smoothstep(0.2, 0.3, depth_diff);
...
normal_diff = smoothstep(0.2, 0.8, normal_diff);
normal_diff = clamp(normal_diff-neg_depth_diff, 0., 1.);
```

### 5b. Unity 6 URP "Isometric Pixel Pipeline" (bababuyyy, MIT), a full reference pipeline
https://github.com/bababuyyy/unity-isometric-pixel-pipeline

Inspired by t3ssel8r. Credits David Holland, Kody King, Roystan and Dylearn.
- **Passes:** CopyColor → Downsample (full res → 640x360, bilinear) → Outline at 640x360 → Composite → SharpUpscale with `_PixelPanOffset`.
  - **Do not copy the downsample step.** Rendering at full res and then bilinear-downsampling smears geometry edges. Render directly at low res, as three.js `RenderPixelatedPass` does.
- **Outline:** a 3x3 kernel on view-space positions reconstructed from depth and view-space normals.
  - **Angle-adaptive silhouette threshold:** `facing = 1 - n.z; z_thresh = _ZDeltaCutoff * (saturate((facing - _AngleZCutoff)/(1-_AngleZCutoff)) * _AngleZScale + 1)`. Grazing surfaces need a bigger depth jump before they count as an edge, which kills false outlines on ground planes seen at a low angle.
  - **Silhouette colour = the *closest neighbour's* colour × `_LineDarken`** (default 0.4), not black. This is the t3ssel8r look of a darker shade of the occluding object.
  - **Crease:** `max(|d0-d3|, |d1-d2|)` where `d_i = 1 - dot(n_c, n_i)` over opposite cardinals, then `smoothstep(0.2, 0.8)`, minus a suppressor when the centre is behind its neighbours. The highlight is centre colour × `(1 + _CreaseBrighten)` (0.3).
  - Defaults: `zDeltaCutoff 0.25`, `angleZCutoff 0.5`, `angleZScale 2`, `depthDiff 0.25..0.3`, `normalSmooth 0.2..0.8`, `lineDarken 0.4`, `creaseBrighten 0.3`.
- **ToonLit:**
  - Banded diffuse: `diffuse = (dot(N,L) + _Wrap) * _Steepness; stepped = saturate(diffuse + mod(1 - diffuse, 1/_Cuts))` with `_Cuts` = 3.
  - Optional soft band edges via `_ThresholdGradientSize`.
  - `min(diffuse, cloudNoise)` for **cloud shadows**: a world-space noise texture projected along the light direction from a cloud plane, scrolled in two diverging directions and multiplied.
  - Optional 4x4 Bayer dither *before* banding.
  - Palette mode: `albedo * lerp(shadowColor, highlightColor, lit)`.
  - Patch colours chosen by world-XZ noise thresholds.
- **Grass:** GPU-instanced alpha-cutout billboards. Colour is inherited from the terrain patch system, so blades blend with the ground. Accent sprites (flowers) are mixed in randomly.
  - **Known limitation, and the design choice to copy:** grass is deliberately *excluded* from the depth/normal buffers, because otherwise every blade gets an outline. As a result, a crease can show at object bases.
  - SSAO must be disabled.

### 5c. David Holland, "3D Pixel Art Rendering" (Godot, 2024)
https://www.davidhol.land/articles/3d-pixel-art-rendering/

The most complete write-up of the t3ssel8r look.
- **Outlines:** a 4-neighbour kernel. Depth gives object outlines; normals give edge highlights. Convex edges are isolated using the cross product of neighbouring normals plus heuristics. His references are t3ssel8r's Imgur "Creating a Pixel Art Scene in Realtime 3D" (https://imgur.com/gallery/creating-pixel-art-scene-realtime-3d-qwhbHQq, not fetchable from here) and Roystan's outline shader (https://roystan.net/articles/outline-shader/).
- **Camera:** snap plus shift, as in §3.
- **Lighting:** toon. The directional light's attenuation is smoothed to reduce shadow flicker from a slow-moving sun, and noise is added to normals to reduce shadow popping on flat surfaces. Cloud shadows come from a global noise uniform via `get_cloud_attenuation(world_pos)`.
- **Grass:** billboard quads lit *evenly per blade*. He sets the lighting position (Godot `LIGHT_VERTEX`) to the base of the mesh for every fragment, so the whole blade takes the shadow and light value of its root and matches the terrain. A three.js version is in §5i.
- **Water:** refraction and planar reflection via an oblique orthographic projection (Aras P. https://aras-p.info/texts/obliqueortho.html, Lengyel). Waves are drawn as world-space, view-aligned horizontal lines driven from one channel-packed texture. Further resources: Roystan toon water, Catlike Coding "Looking Through Water".
- **God rays:** instanced parallel planes aligned to the light that sample the shadow map (shell texturing), plus depth-fade. He box-blurs the depth texture so the rays don't outline individual grass tufts.

### 5d. ProPixelizer (Unity URP asset by ElliotB256), commercial
- Site: https://sites.google.com/view/propixelizer/home. Store: https://assetstore.unity.com/packages/vfx/shaders/fullscreen-camera-effects/propixelizer-177877. Demo: https://elliotb256.itch.io/propixelizer
- Claims, from the demo page:
  - Per-object pixel size.
  - Mixing pixelated and non-pixelated objects.
  - Objects move "at screen resolution" without creep. It avoids the usual "render everything to one low-res target" approach and its single shared grid.
  - Per-object outlines, colour grading and palette reduction.
  - Shadows between pixelized and non-pixelized objects.
- I could not retrieve the user guide, so the internals are unverified. The idea worth noting: **per-object pixel grids anchored to the object's own screen-space origin** let moving objects stay crisp while the camera moves smoothly. This is an alternative to global camera snapping when objects must move sub-pixel.

### 5e. "Pixelat3D: a Technique to Render 3D Scenes with Pixel Art Aesthetics"
- SBGames 2026, by Ribes, Maciel and Torchelsen (UFRGS/UFPel). https://sol.sbc.org.br/index.php/sbgames/article/view/45414 (the PDF host failed DNS from here, so I have only the abstract).
- Method: **priority maps** that choose texture LOD based on object distance and viewing angle, so texel density stays near one texel per art pixel; plus a post-process **outline** pass. User study with 62 participants: preference improved significantly in most scenarios.
- Related work:
  - RETRÔ (SBGames 2024): https://sol.sbc.org.br/index.php/sbgames/article/view/32320
  - UFPE master's thesis "A modern approach for rendering 3D top-down games in pixel art": https://attena.ufpe.br/handle/123456789/52665
  - UPC thesis "Developing 3D Pixel Art Rendering": https://upcommons.upc.edu/handle/2117/416925
- Practical takeaway for us: choose texture resolution so that **1 texture texel ≈ 1 art pixel** at the default zoom (texel density = `1/t` texels per world unit). Use Nearest filtering with mipmaps off, or `NearestMipmapNearestFilter` if zoom varies.

### 5f. Acerola (Garrett Gunnell): `GarrettGunnell/Post-Processing`, **MIT**
https://github.com/GarrettGunnell/Post-Processing (`Assets/Pixel Art/Dither.shader`, `Ditherer.cs`, `PaletteSwapper.shader`)
- Pipeline: repeated ×0.5 downsamples, either bilinear or point depending on `pointFilterDown` → ordered dither plus per-channel quantize at the low res → point-filter upscale.
- Dither, verbatim core (MIT):
```hlsl
float GetBayer4(int x, int y) {
    return float(bayer4[(x % 4) + (y % 4) * 4]) * (1.0f / 16.0f) - 0.5f;
}
...
float4 output = col + _Spread * bayerValues[_BayerLevel];
output.r = floor((_RedColorCount - 1.0f) * output.r + 0.5) / (_RedColorCount - 1.0f);
output.g = floor((_GreenColorCount - 1.0f) * output.g + 0.5) / (_GreenColorCount - 1.0f);
output.b = floor((_BlueColorCount - 1.0f) * output.b + 0.5) / (_BlueColorCount - 1.0f);
```
  The matrices are `bayer2 = {0,2,3,1}`, `bayer4 = {0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5}`, plus the standard 8x8. Defaults: `spread 0.5`, 2–16 levels per channel.
- **PaletteSwapper:** assumes a grayscale, quantized input and uses the value as an index into a 1-D palette texture (`floor` and `ceil` lookups, then lerp by `frac`). Gradient-map style, good for a strict ramp palette.

### 5g. Toon shading with quantized bands and shadows in three.js
How three.js works (dev source):
- `MeshToonMaterial` → `lights_toon_pars_fragment`: `irradiance = getGradientIrradiance(normal, L) * directLight.color`.
- `getGradientIrradiance` samples `gradientMap` at `dotNL*0.5+0.5`. Without a map it uses a fixed two-tone `smoothstep` at 0.7.
- **Gotcha:** the shadow is applied *before* `RE_Direct`, in `lights_fragment_begin`, via `directLight.color *= getShadow(...)`. The gradient therefore bands only N·L; the shadow multiplies linearly afterwards. PCF shadow edges stay soft gradients, and a shadowed lit band does not snap to the shadow band.
- `gradientMap` must be a `DataTexture`/`Texture` with **`NearestFilter`** for both min and mag, and `generateMipmaps=false`. Otherwise the bands blur.
- **PCFSoftShadowMap has been removed in current dev** (WebGLShadowMap warns "PCFSoftShadowMap has been removed. Using PCFShadowMap instead."). For pixel art use `BasicShadowMap` for binary shadows, or `PCFShadowMap` with the banding below.

Adapted `onBeforeCompile` that bands **N·L × shadow × attenuation together**. It replaces `RE_Direct_Toon`, a stable API across r15x–r18x.
```js
const toon = new THREE.MeshToonMaterial({ color });
toon.onBeforeCompile = (shader) => {
  shader.uniforms.uBands   = { value: 3 };
  shader.uniforms.uLightRef = { value: new THREE.Color() }; // = sun.color * sun.intensity, update per frame
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_toon_pars_fragment>',
    /* glsl */`
    uniform float uBands;
    uniform vec3 uLightRef;
    varying vec3 vViewPosition;
    struct ToonMaterial { vec3 diffuseColor; };
    void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal,
        const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material,
        inout ReflectedLight reflectedLight ) {
      float ndl = max( dot( geometryNormal, directLight.direction ), 0.0 );
      vec3 inc = directLight.color * ndl;                         // includes shadow + attenuation
      const vec3 Y = vec3( 0.2126, 0.7152, 0.0722 );
      float t = clamp( dot( inc, Y ) / max( dot( uLightRef, Y ), 1e-4 ), 0.0, 1.0 );
      float q = floor( t * uBands + 0.5 ) / uBands;               // or texture(gradientMap, vec2(t,.5)).r
      vec3 irradiance = t > 0.0 ? inc * ( q / t ) : vec3( 0.0 );  // keep hue, band the intensity
      reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
    }
    void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal,
        const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material,
        inout ReflectedLight reflectedLight ) {
      reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
    }
    #define RE_Direct RE_Direct_Toon
    #define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
    `);
};
toon.customProgramCacheKey = () => 'toon-banded-v1';
```
Notes:
- Point and spot lights pass through the same function. If they matter, give each its own reference, or band `ndl` only and treat attenuation separately.
- For dithered band edges, add `(bayer4(gl_FragCoord.xy) - 0.5) * uDither / uBands` to `t` before the `floor`. In a low-res render target, `gl_FragCoord` is already one art pixel, and because the camera is texel-snapped the pattern stays world-stable under translation.
- Alternatively, write a fully custom `ShaderMaterial` with `lights: true` and include the shadow chunks. `getShadow()`'s argument list changed across versions (for example `shadowIntensity` was added), so patching the light loop is fragile. Replacing `RE_Direct` as above avoids that.

**Shadow acne and shimmer at low res:**
- Every art pixel takes exactly one shadow lookup, so acne becomes large, crawling fat-pixel noise. Prefer `light.shadow.normalBias` of about 1–2 × the shadow-texel world size (`(cam.right-cam.left)/mapSize`) over a large `bias`; start with `bias ≈ -0.0005`.
- Size the shadow camera tightly around the view. A shadow texel of about 0.5–1 art pixel in world size looks consistent.
- **Texel-snap the shadow camera** (§3) or the shadow edges crawl when the camera pans.
- For thin cards such as grass and leaves, set `shadowSide = DoubleSide`.

### 5h. Bayer dithering and palette quantization (lospec)
- Lospec palettes are available as JSON: `https://lospec.com/palette-list/<slug>.json`, which returns `{"name","author","colors":["be4a2f",...]}` (verified with endesga-32). `.hex` gives one colour per line.
- Do it in the **low-res pass, before upscaling**, so dither cells are exactly one art pixel. Quantize in **sRGB-encoded or OKLab** space, not linear.

Adapted GLSL: nearest palette colour in OKLab. The palette is precomputed to OKLab in JS (≤ 64 entries as a uniform array; for larger palettes bake a 32³ LUT into a 1024x32 texture).
```glsl
uniform vec3 uPaletteLab[64];   // OKLab
uniform vec3 uPaletteRGB[64];   // linear RGB to output
uniform int  uPaletteSize;
uniform float uDither;          // ~0.03–0.08 in OKLab L units

float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int m[16] = int[16](0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5);
  return (float(m[i.y * 4 + i.x]) + 0.5) / 16.0;   // (0,1)
}
vec3 linearToOklab(vec3 c) {   // Björn Ottosson, public domain/MIT
  float l = 0.4122214708*c.r + 0.5363325363*c.g + 0.0514459929*c.b;
  float m = 0.2119034982*c.r + 0.6806995451*c.g + 0.1073969566*c.b;
  float s = 0.0883024619*c.r + 0.2817188376*c.g + 0.6299787005*c.b;
  l = pow(max(l,0.0), 1.0/3.0); m = pow(max(m,0.0), 1.0/3.0); s = pow(max(s,0.0), 1.0/3.0);
  return vec3(0.2104542553*l + 0.7936177850*m - 0.0040720468*s,
              1.9779984951*l - 2.4285922050*m + 0.4505937099*s,
              0.0259040371*l + 0.7827717662*m - 0.8086757660*s);
}
vec3 quantize(vec3 linRGB, vec2 fragCoord) {
  vec3 lab = linearToOklab(linRGB);
  lab.x += (bayer4(fragCoord) - 0.5) * uDither;
  float best = 1e9; vec3 outc = linRGB;
  for (int i = 0; i < 64; i++) {
    if (i >= uPaletteSize) break;
    vec3 d = lab - uPaletteLab[i];
    float e = dot(d, d * vec3(1.0, 0.5, 0.5));  // weight lightness more
    if (e < best) { best = e; outc = uPaletteRGB[i]; }
  }
  return outc;
}
```
- Alternatives: per-channel posterize as in Acerola's code (§5f); a gradient-map palette (`PaletteSwapper`); or "PixelDither" on godotshaders (https://godotshaders.com/shader/pixeldither-color-quantizer-with-palette-support/).
- Godot colour-dither with Yliluoma palette dithering: https://github.com/Donitzo/godot-color-dither. Yliluoma's ordered-dither algorithm is better for small palettes.
- Most "real" 3D pixel art (t3ssel8r, Holland) uses **no global palette pass**. It relies on hand-picked material colours plus banded lighting, and adds dithering only in band transitions. Make the palette pass optional.

### 5i. Instanced grass in three.js (adapted, with shadows)
References:
- Codrops "How to Make The Fluffiest Grass With Three.js": https://tympanus.net/codrops/?p=83092
- three.js forum, InstancedMesh billboard: https://discourse.threejs.org/t/instancedmesh-implement-billboard/29354
- Holland: light each blade from its root (§5c)
- bababuyyy: inherit terrain colour and exclude grass from the outline buffers (§5b)

```js
const blade = new THREE.PlaneGeometry(0.25, 0.4); blade.translate(0, 0.2, 0);
const uniforms = { uTime: { value: 0 }, uCamRight: { value: new THREE.Vector3(1,0,0) } };
const vertPatch = (shader) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = 'uniform float uTime; uniform vec3 uCamRight;\n' + shader.vertexShader
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);') // terrain-up normal
    .replace('#include <project_vertex>', /* glsl */`
      vec4 base = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float h = transformed.y;
      float sway = sin(uTime * 1.7 + base.x * 0.6 + base.z * 0.4) * 0.06 * h;
      // billboard around world Y toward the MAIN camera (uniform, so the shadow pass matches)
      vec3 wp = base.xyz + uCamRight * transformed.x + vec3(sway, h, 0.0);
      vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
      gl_Position = projectionMatrix * mvPosition;`)
    .replace('#include <shadowmap_vertex>', /* glsl */`
      #ifdef USE_SHADOWMAP
        worldPosition = base;           // whole blade receives the root's shadow (Holland trick)
      #endif
      #include <shadowmap_vertex>`);
};
const grassMat = new THREE.MeshToonMaterial({ map: bladeTex, alphaTest: 0.5, side: THREE.DoubleSide });
grassMat.onBeforeCompile = vertPatch;
grassMat.customProgramCacheKey = () => 'grass-v1';
const grass = new THREE.InstancedMesh(blade, grassMat, count);
grass.castShadow = true; grass.receiveShadow = true;
grass.customDepthMaterial = new THREE.MeshDepthMaterial({
  depthPacking: THREE.RGBADepthPacking, map: bladeTex, alphaTest: 0.5, side: THREE.DoubleSide });
grass.customDepthMaterial.onBeforeCompile = (s) => { // same deformation, no shadowmap chunk needed
  Object.assign(s.uniforms, uniforms);
  s.vertexShader = 'uniform float uTime; uniform vec3 uCamRight;\n' + s.vertexShader.replace('#include <project_vertex>', /* same block as above */ '...');
};
// after filling instance matrices:
grass.instanceMatrix.needsUpdate = true; grass.computeBoundingSphere(); // or grass.frustumCulled = false
```
Gotchas:
- **`customDepthMaterial`** is used for directional and spot light shadows; point lights use **`customDistanceMaterial`**. Without them the shadow pass uses the *undeformed, un-cut-out quad*.
- In the shadow pass, `viewMatrix` is the light's matrix. That is why the billboard axis is a uniform (`uCamRight`) rather than read from `viewMatrix`.
- **Outline buffer:** grass should write a "no-edge" flag (for example `normal.a = 0` in the MRT normal target) so the edge pass ignores it. Otherwise every blade gets outlined.
- Give each instance a colour via `InstancedBufferAttribute` (or `setColorAt`). Sample the terrain colour at the root, as bababuyyy does, so blades blend with the ground.
- `InstancedMesh` computes a bounding sphere over all instances since about r151. Recompute it after moving instances, or the whole field gets culled.

### 5j. Poisson-disk sampling on meshes (for grass, rocks and flowers)
- `MeshSurfaceSampler` (three addons; https://threejs.org/docs/pages/MeshSurfaceSampler.html) samples area-weighted *uniform random* points, not Poisson. It supports a `setWeightAttribute` for density maps. Codrops tutorial: https://tympanus.net/codrops/2021/08/31/surface-sampling-in-three-js/
- `poisson-disk-sampling` (npm, kchapelier, https://unpkg.com/poisson-disk-sampling@2.3.1/README.md) runs Bridson in N-D on a box, with a variable-density function. For heightfield terrain, sample in 2D (XZ) and raycast or look up the height.
- For arbitrary meshes, use dart throwing with a spatial hash (adapted):
```js
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
export function poissonOnMesh(mesh, r, maxPoints, tries = 30 * maxPoints) {
  const s = new MeshSurfaceSampler(mesh).build();   // optionally .setWeightAttribute('density')
  const cell = r / Math.SQRT2 / Math.sqrt(1.5), grid = new Map(), out = [];
  const key = (x, y, z) => `${x},${y},${z}`;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < tries && out.length < maxPoints; i++) {
    s.sample(p, n);
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
    let ok = true;
    for (let dx = -2; dx <= 2 && ok; dx++) for (let dy = -2; dy <= 2 && ok; dy++) for (let dz = -2; dz <= 2 && ok; dz++) {
      const q = grid.get(key(cx + dx, cy + dy, cz + dz));
      if (q && q.distanceToSquared(p) < r * r) ok = false;
    }
    if (!ok) continue;
    const v = p.clone(); grid.set(key(cx, cy, cz), v); out.push({ position: v, normal: n.clone() });
  }
  return out;   // positions are in the mesh's local space: apply mesh.matrixWorld
}
```
  Cell size of `r/√3` or less guarantees one point per cell in 3D; the ±2 neighbourhood is conservative. Apply a seeded RNG by replacing `Math.random` through `sampler.setRandomGenerator(rng)`, which exists in r15x and later.

### 5k. Toon water in three.js (orthographic depth foam)
References:
- three.js forum, unlit water with foam (works with ortho; code on CodeSandbox; author says no licence restrictions): https://discourse.threejs.org/t/unlit-water-shader-with-foam/11641
- three.js forum, using depthTexture for a toon water shader: https://discourse.threejs.org/t/how-to-effectively-use-depthtexture-for-water-toon-shader/49773
- Roystan toon water: https://roystan.net/articles/toon-water/
- Tuts+ "Creating Toon Water for the Web": https://code.tutsplus.com/creating-toon-water-for-the-web-part-2--cms-30485t
- Godot toon water: https://godotshaders.com/shader/toon-water-shader/

Key facts:
- **Orthographic depth is linear.** three.js `packing` has `orthographicDepthToViewZ(depth, near, far) = depth*(near-far) - near`, or the reversed-depth variant when `USE_REVERSED_DEPTH_BUFFER` is set. The perspective linearization formula used in many snippets is **wrong** for ortho; this is the "fades along z" bug reported on the Amplify forum.
- **Feedback loop:** you cannot sample the `DepthTexture` that is attached to the framebuffer you are currently rendering into. The forum reports the warning "Feedback loop formed between Framebuffer and active Texture". Render opaque first, **copy depth into a separate texture** with a fullscreen blit into an `R32F`/`HalfFloat` colour target, then draw water into the main target while sampling the copy.

Adapted fragment (ShaderMaterial, `transparent: true` or opaque-blended, `depthWrite: false`):
```glsl
#include <packing>
uniform sampler2D tSceneDepth;  // copy of opaque depth (raw [0,1] depth values)
uniform vec2 rtSize;            // low-res RT size (incl. margin)
uniform float cameraNear, cameraFar;
uniform float viewDirY;         // |dot(cameraForwardWorld, (0,1,0))|, converts view-ray thickness to vertical depth
uniform vec3 shallowColor, deepColor, foamColor;
uniform float depthMax, foamDist, uTime, uBands;
varying vec3 vViewPos;          // view-space position of the water surface
varying vec2 vWorldXZ;
void main() {
  vec2 suv = gl_FragCoord.xy / rtSize;
  float sceneZ = orthographicDepthToViewZ(texture2D(tSceneDepth, suv).r, cameraNear, cameraFar);
  float thickness = max(vViewPos.z - sceneZ, 0.0);       // along the view ray (both negative, scene further)
  float vdepth = thickness * viewDirY;                   // vertical water depth
  float t = clamp(vdepth / depthMax, 0.0, 1.0);
  t = floor(t * uBands) / uBands;                        // banded depth colour
  vec3 col = mix(shallowColor, deepColor, t);
  float n = sin(vWorldXZ.x * 3.1 + uTime) * sin(vWorldXZ.y * 2.7 - uTime * 0.8) * 0.5 + 0.5; // or a noise tex
  float foam = step(vdepth, foamDist * (0.6 + 0.8 * n)); // hard-edged intersection foam
  gl_FragColor = vec4(mix(col, foamColor, foam), 1.0);
}
```
Notes:
- Foam at shorelines and around obstacles comes for free from the depth difference.
- For animated "lines", use world-space horizontal stripes in view-aligned coordinates, which Holland drives from a packed texture.
- Write `gl_FragColor` in linear space and leave sRGB conversion to the final pass.
- Mark the water pixel "no-edge" in the normal target if water should not be outlined. Alternatively, outline only where foam meets the shore.

---

## 6. three.js practical gotchas checklist (r16x–r186)

1. **Low-res target.**
   - Use `new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false, depthTexture: new THREE.DepthTexture(w, h) })`.
   - Set `magFilter` to **Linear** if the final upscale uses the t3ssel8r/IQ filter. The edge pass uses `texelFetch`, which ignores filtering anyway.
   - Disable MSAA (`samples: 0`; renderer `antialias: false`). Anti-aliasing defeats the pixel look.
2. **`DepthTexture`:** the default type is `UnsignedIntType` (24-bit). Use `FloatType` (`DepthFormat`) if you need precision with large ortho ranges. Keep `near` and `far` tight. With `reversedDepthBuffer: true` on the renderer (newer three), use the packing helpers, which handle `USE_REVERSED_DEPTH_BUFFER`; do not hand-code the depth formula.
3. **Ortho depth is linear:** `viewZ = orthographicDepthToViewZ(d, near, far)` from `#include <packing>`. That include is available in `ShaderMaterial`, not in `RawShaderMaterial`. Edge thresholds then work in world units.
4. **Normals: MRT or override.**
   - *MRT:* `new WebGLRenderTarget(w, h, { count: 2, ... })`, accessed as `rt.textures[0]` and `rt.textures[1]`. Example: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_multiple_rendertargets.html. A custom `ShaderMaterial` with `glslVersion: THREE.GLSL3` declares `layout(location = 0) out vec4 gColor; layout(location = 1) out vec4 gNormal;`.
     - **Built-in materials only declare location 0** (WebGLProgram injects `layout(location = 0) out highp vec4 pc_fragColor;` for non-GLSL3 materials). With MRT, attachment 1 is *undefined* for them unless you patch them.
     - Patch with `onBeforeCompile`: prepend `layout(location = 1) out highp vec4 gNormal;` to the fragment shader and append `gNormal = vec4(normal*0.5+0.5, edgeFlag);` before the final `}`, or after `#include <dithering_fragment>`. Here `normal` is the view-space shading normal, already flipped for back faces.
     - The renderer's clear colour clears *every* attachment. Background pixels are recognized by depth = 1 (or 0 when reversed), so this is harmless.
   - *Override pass* (`scene.overrideMaterial = new MeshNormalMaterial()`): simple, but it doubles draw calls and **drops alphaTest/maps and every `onBeforeCompile` vertex change**, including grass wind and billboarding. Only acceptable for static solid geometry.
5. **Colour space.**
   - Render targets store *linear* (`ColorManagement.workingColorSpace`). Conversion to sRGB only happens when rendering to the canvas *and* the material includes `#include <colorspace_fragment>` (built-ins do). A custom final `ShaderMaterial` must include that chunk or call `sRGBTransferOETF()`/`linearToOutputTexel()` itself. Otherwise the image is too dark.
   - Using `EffectComposer`, end the chain with `OutputPass` (tone mapping plus sRGB). Do the palette quantization in sRGB or OKLab, before or inside the final pass.
   - Colour textures need `texture.colorSpace = THREE.SRGBColorSpace`. Data, LUT and gradient textures need `NoColorSpace`.
6. **Tone mapping:** keep `NoToneMapping` (or apply it before quantization). Tone mapping after the palette pass makes colours drift off-palette.
7. **HiDPI:** compute `W, H` from `renderer.getDrawingBufferSize()`. Set the canvas CSS size to exactly `W/dpr` so the browser does not resample. Use `image-rendering: pixelated` only if you upscale with CSS instead of a shader.
8. **Shadow map at low res:** use `BasicShadowMap` for hard pixel shadows. `PCFSoftShadowMap` has been removed in current dev and falls back to PCF. See §5g for `normalBias`, texel snapping and `shadowSide`.
9. **Instanced meshes with custom shaders:**
   - Mirror every vertex deformation in `customDepthMaterial` (directional and spot) and `customDistanceMaterial` (point).
   - Set `customProgramCacheKey` on patched materials. Otherwise different patches that share a material type can collide in the program cache.
   - Call `computeBoundingSphere()` after updating instances.
10. **Feedback loops:** never sample a texture attached to the current framebuffer. That includes the depth texture when the water or translucent pass renders into the same target, so copy it first.
11. **Edge pass sampling:** use `texelFetch(tex, ivec2(gl_FragCoord.xy) + ivec2(dx,dy), 0)` with a clamp at the borders. The 1-px margin from §3 also keeps edge-pass border artefacts off-screen.
12. **Textures on models:** use `NearestFilter`, `generateMipmaps=false` (or `NearestMipmapNearestFilter`), and texel density ≈ 1 texel per art pixel (`1/t`) at the default zoom (the Pixelat3D idea).
13. **Animation:** quantize rotations and frame rate (e.g. 12 fps "on twos") for characters. Quantize emissive and pulse values (the three.js example uses 6 levels).

---

## 7. Recommended architecture: modular three.js 3D-pixel-art renderer

Goals: WebGL2, ES modules from CDN, three r16x+ (test against r186). Each stage is a small class with `setSize()`, `render()`, `dispose()`, and its own uniforms. Every intermediate buffer lives at **low resolution, including the margin**, except the last one.

```
         JS: PixelCamera  ── snap camera (R/U grid) ─┐   ShadowSnapper ── snap light shadow cam
                                                     ▼
 [1] GBufferPass   scene → RT_G (w+2m × h+2m) MRT: tex0 color(HalfFloat, linear), tex1 normal+flags (RGBA8/Half), DepthTexture
         materials: ToonBanded (patched MeshToonMaterial / ShaderMaterial) writing location 1
 [2] DepthCopyPass RT_G.depth → RT_D (R32F/Half colour)              (only if water/translucents need depth)
 [3] ForwardFX     water, god-ray planes, particles → drawn into RT_G (color only) sampling RT_D (no feedback)
 [4] EdgePass      RT_G.color,normal,depth → RT_E (Nearest)            outline + convex highlight (texelFetch)
 [5] StylizePass   RT_E → RT_S (Nearest)                               optional: bloom-at-low-res, colour grade,
                                                                       Bayer + palette (OKLab) at art-pixel scale
 [6] UpscalePass   RT_S (Linear if sharp filter) → canvas              margin crop + sub-pixel offset +
                                                                       t3ssel8r/IQ filter (or Nearest at integer p),
                                                                       linear→sRGB (colorspace_fragment)
```

### Render targets
| RT | Size | Format | Filter | Notes |
|---|---|---|---|---|
| RT_G | (w+2m)×(h+2m) | count:2, HalfFloat; DepthTexture (UnsignedInt or Float) | Nearest | `samples:0` |
| RT_D | same | RedFormat Float/Half | Nearest | linear viewZ or raw depth |
| RT_E, RT_S | same | HalfFloat (or RGBA8 after palette) | Nearest (RT_S: Linear if sharp upscale) | ping-pong pair |
| shadow map | e.g. 2048² | three internal | — | texel-snapped light camera, BasicShadowMap |

### Per-frame uniforms and state (one shared `PixelFrame` object)
- `p` (pixel size), `t` (world units per art px), `m` (margin), `rtSize`, `screenTexels`, `origin`, `subpixel (ex,ey)`; these come from `layoutPixelFrame` and `snapOrthoCamera`.
- `cameraNear`, `cameraFar`, `projectionMatrixInverse`. The last is only needed for perspective cameras or position reconstruction.
- Edge pass:
  - `depthThreshold` in world units: start at 1.5–3 × `t` for silhouettes.
  - `angleZCutoff 0.5`, `angleZScale 2` (bababuyyy).
  - `normalThreshold 0.1`, `normalEdgeBias (1,1,1)` in view space.
  - `lineDarken 0.4` (outline = darkened closest-neighbour colour), `highlightBoost 0.3` (or Kody's `1 ± strength`).
  - `outlineColor` override.
  - Flags from `normal.a`: 0 = no edges (grass, water, FX), 1 = normal.
- Toon: `uBands 3–4`, `uLightRef`, `uDither ~0.5/uBands`, `uCloudTex`, `uCloudScale`, `uCloudSpeed` (global cloud shadows like Holland/bababuyyy).
- Palette: `uPaletteLab[]`, `uPaletteRGB[]`, `uPaletteSize`, `uDither`. Load from `lospec.com/palette-list/<slug>.json`.
- Time: `uTime`, which can be quantized to the animation frame rate for a "stop-motion" feel.

### Edge pass (adapted GLSL3, combining three.js/Kody, the Godot concave suppressor and the bababuyyy angle-adaptive threshold)
```glsl
precision highp float;
#include <packing>
uniform sampler2D tColor, tNormal, tDepth;
uniform float cameraNear, cameraFar, depthThreshold, angleZCutoff, angleZScale;
uniform float normalThreshold, lineDarken, highlightBoost;
uniform vec3 normalEdgeBias;
out vec4 outColor;

ivec2 C(ivec2 p) { return clamp(p, ivec2(0), textureSize(tDepth, 0) - 1); }
float dist(ivec2 p) { return -orthographicDepthToViewZ(texelFetch(tDepth, C(p), 0).r, cameraNear, cameraFar); }
vec4  nrm(ivec2 p)  { vec4 n = texelFetch(tNormal, C(p), 0); return vec4(n.xyz * 2.0 - 1.0, n.a); }

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 base = texelFetch(tColor, c, 0);
  vec4 n0 = nrm(c);
  if (n0.a < 0.5) { outColor = base; return; }          // "no-edge" pixels (grass, water)
  float d0 = dist(c);
  ivec2 offs[4] = ivec2[4](ivec2(1,0), ivec2(-1,0), ivec2(0,1), ivec2(0,-1));

  // silhouette: centre is on the near side of a depth jump
  float facing = 1.0 - n0.z;
  float zt = depthThreshold * (clamp((facing - angleZCutoff) / (1.0 - angleZCutoff), 0.0, 1.0) * angleZScale + 1.0);
  float line = 0.0;
  for (int i = 0; i < 4; i++) {
    if (dist(c + offs[i]) - d0 > zt) line = 1.0;
  }
  // convex crease highlight (Kody King normal indicator; Godot concave suppression)
  float crease = 0.0, behind = 0.0;
  for (int i = 0; i < 4; i++) {
    ivec2 q = c + offs[i];
    float dd = dist(q) - d0;
    vec3 ni = nrm(q).xyz;
    float nInd = smoothstep(-0.01, 0.01, dot(n0.xyz - ni, normalEdgeBias));
    float dInd = clamp(sign(dd * 0.25 + 0.0025), 0.0, 1.0);
    crease += (1.0 - dot(n0.xyz, ni)) * dInd * nInd;
    behind += max(-dd, 0.0);                              // neighbours nearer than centre => concave
  }
  crease = step(normalThreshold, crease) * (1.0 - step(zt, behind));

  vec3 col = base.rgb;
  if (line > 0.0)        col = base.rgb * lineDarken;     // or mix toward a palette 'ink' colour
  else if (crease > 0.0) col = base.rgb * (1.0 + highlightBoost);
  outColor = vec4(col, base.a);
}
```
Notes:
- This draws the silhouette on the *near* object, which is the inner-line convention of t3ssel8r and Kody.
- To colour the line from the occluder instead, as bababuyyy does with its 3x3 kernel, sample the colour at the nearest neighbour.
- For a perspective camera, swap in `perspectiveDepthToViewZ` and scale `depthThreshold` by distance.

### Module list (each a file)
- `PixelFrame.js`: sizes, margin, `t`, `p`, and the sub-pixel state (§3 `layoutPixelFrame`).
- `PixelCamera.js`: true and render transforms, `snapOrthoCamera`, optional rotation and zoom snapping, `snapObject()` with a restore list.
- `ShadowSnapper.js`: fits the directional shadow camera to the view and snaps it to shadow texels.
- `materials/ToonBanded.js`: the patched `MeshToonMaterial` (§5g), with MRT location 1 plus an edge flag and optional cloud-shadow and Bayer band dithering.
- `materials/Grass.js`: InstancedMesh, billboard, wind, root lighting, customDepthMaterial and a no-edge flag (§5i). Placement uses `poissonOnMesh` (§5j).
- `materials/Water.js`: ortho-depth foam and banded depth (§5k); needs `DepthCopyPass`.
- `passes/GBufferPass.js`, `DepthCopyPass.js`, `EdgePass.js`, `StylizePass.js` (palette, dither, optional low-res bloom), `UpscalePass.js` (§4 sharp filter, margin and sub-pixel offset, sRGB).
- `PixelRenderer.js`: owns the RTs and the order of passes, plus `setSize`, `render(scene, camera, dt)`, debug views of each RT, and a GUI for every threshold.

You can either use three's `EffectComposer` (its `Pass` and `FullScreenQuad` from `three/addons/postprocessing/Pass.js`) or a hand-rolled chain. Hand-rolled is simpler here, because every pass shares the same low-res size and the MRT G-buffer does not fit the composer's single read/write-buffer model.

### Build order (de-risking)
1. Low-res render, Nearest upscale, integer `p`, and the `ceil` plus crop math.
2. Camera snap with margin and sub-pixel offset. Verify: panning slowly shows no creep and smooth motion.
3. MRT G-buffer and the edge pass, tuned with GUI and debug views.
4. Banded toon lighting with a snapped `BasicShadowMap`.
5. Grass (no-edge flag) and water (depth copy).
6. Optional palette and dither, then the sharp filter for non-integer `p`.

---

### Source URL index
- three.js RenderPixelatedPass (MIT): https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/postprocessing/RenderPixelatedPass.js
- three.js pixel example: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_postprocessing_pixel.html
- three.js MRT example: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_multiple_rendertargets.html
- three.js chunks: `src/renderers/shaders/ShaderChunk/{packing,lights_toon_pars_fragment,gradientmap_pars_fragment,lights_fragment_begin}.glsl.js`; `src/renderers/webgl/WebGLShadowMap.js` (on the dev branch)
- Kody King hello-threejs (no licence): https://github.com/KodyJKing/hello-threejs (video https://www.youtube.com/watch?v=jFevm02NJ5M)
- Return of the Earthmover: https://discourse.threejs.org/t/return-of-the-earthmover-3d-pixel-art-game/56454
- bababuyyy Unity isometric pixel pipeline (MIT): https://github.com/bababuyyy/unity-isometric-pixel-pipeline
- David Holland: https://www.davidhol.land/articles/3d-pixel-art-rendering/ (camera video https://youtu.be/LQfAGAj9oNQ)
- aarthificial pixel-perfect camera: https://youtu.be/jguyR4yJb1M
- yal.cc smooth pixel camera: https://yal.cc/gamemaker-smooth-pixel-perfect-camera/
- Pixel art filtering survey: https://jorenjoestar.github.io/post/pixel_art_filtering/
- Cole Cecil: https://colececil.dev/blog/2017/scaling-pixel-art-without-destroying-it/
- Handmade thread: https://hero.handmade.network/forums/code-discussion/t/8239/p/25584
- t3ssel8r notes (Patreon): https://www.patreon.com/posts/pixel-art-aa-83276362 ; Unity forum: https://discussions.unity.com/t/pixel-art-filter-to-fix-creep-and-jitter/1610967
- Firerabbit upscaler (MIT): https://godotshaders.com/shader/pixelart-upscaler-filter/
- Sharp-bilinear: https://github.com/rsn8887/Sharp-Bilinear-Shaders
- Themaister: https://themaister.net/blog/2018/08/
- Godot outline shader (Leo Peltola): https://godotshaders.com/shader/3d-pixel-art-outline-highlight-post-processing-shader/
- ProPixelizer: https://elliotb256.itch.io/propixelizer , https://sites.google.com/view/propixelizer/home
- Pixelat3D: https://sol.sbc.org.br/index.php/sbgames/article/view/45414
- Acerola Post-Processing (MIT): https://github.com/GarrettGunnell/Post-Processing
- Lospec palette JSON: https://lospec.com/palette-list/endesga-32.json
- Godot color dither: https://github.com/Donitzo/godot-color-dither ; PixelDither: https://godotshaders.com/shader/pixeldither-color-quantizer-with-palette-support/
- MeshSurfaceSampler: https://threejs.org/docs/pages/MeshSurfaceSampler.html ; poisson-disk-sampling: https://unpkg.com/poisson-disk-sampling@2.3.1/README.md
- Grass: https://tympanus.net/codrops/?p=83092 ; https://discourse.threejs.org/t/instancedmesh-implement-billboard/29354
- Water: https://discourse.threejs.org/t/unlit-water-shader-with-foam/11641 ; https://discourse.threejs.org/t/how-to-effectively-use-depthtexture-for-water-toon-shader/49773 ; https://roystan.net/articles/toon-water/ ; https://code.tutsplus.com/creating-toon-water-for-the-web-part-2--cms-30485t
- Roystan outline shader: https://roystan.net/articles/outline-shader/
