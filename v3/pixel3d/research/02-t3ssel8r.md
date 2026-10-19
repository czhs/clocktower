# t3ssel8r: realtime 3D pixel-art rendering, reverse-engineered for three.js (WebGL2)

Research date: 2026-10-15. Subject: the YouTube/Twitter/Reddit dev "t3ssel8r" (Unity, from Oct 2020, unnamed adventure game).
Confidence labels used below:
- **[confirmed]**: stated by t3ssel8r himself (video description, transcript, Reddit/YouTube comment, Imgur caption, Patreon notes) or measured directly from his published images.
- **[community]**: from people who rebuilt the style (David Holland/Godot, three.js RenderPixelatedPass/KodyJKing).
- **[suggested]**: my inference or a starting value to tune.

He has never released source code ("I'm not at liberty to share any of the source"). He also called the internal convex-edge filter "just black magic". Everything below is pieced together from what he has said, plus pixel measurements of his screenshots.

---

## 0. Primary sources (all fetched and read)

| Source | What it gave |
|---|---|
| Imgur breakdown "Creating a Pixel Art Scene in Realtime 3D" (2020-10-26), https://imgur.com/gallery/creating-pixel-art-scene-realtime-3d-qwhbHQq. imgur.com blocks scrapers, but the public API works: `https://api.imgur.com/post/v1/posts/qwhbHQq?client_id=546c25a59c58ad7&include=media` | All 12 captions. A Unity screenshot showing the **Game view at "Pixel Art (640x360)"** and the full **Custom/Block material inspector**. Edge-detect pass GIF (blue = depth outline, red = normal edge). Grass texture import settings. |
| YouTube channel https://www.youtube.com/@t3ssel8r (28 videos, 189K subs); every description fetched | Most of the technical facts (quoted per section below) |
| Transcript of "Crafting a Better Shader for Pixel Art Upscaling" https://youtu.be/d6tp43wZqps (2023-05-26) | Full derivation of the upscaling filter |
| Patreon "Pixel Art AA Video Notes" (public): https://www.patreon.com/t3ssel8r/posts/pixel-art-aa-83276362 | Kernel math, textureGrad reasoning, premultiplied alpha |
| Transcript of "Creating a Scene for my 3D Pixel Art Game" https://youtu.be/ERA7-I5nPAU | Blender modeling workflow |
| t3ssel8r's Reddit comments (55) + posts (6), pulled from the Arctic Shift archive: `https://arctic-shift.photon-reddit.com/api/comments/search?author=t3ssel8r` | Outline rule, toon-shader structure, camera angles, grass shading |
| His own replies in YouTube comment sections (yt-dlp `--write-comments`) on ERA7-I5nPAU, fSNdZ82I-eQ, thUXblUXKeU, NutO1jzuVXU, ZsMHY4LDyRE, d6tp43wZqps, mZjSmJ3dxHw, YJSal0UocLY | Leaves, god rays, camera padding, grass instancing |
| David Holland, "3D Pixel Art Rendering" (Godot, 2024): https://www.davidhol.land/articles/3d-pixel-art-rendering/ and repo https://git.sr.ht/~denovodavid/3d-pixel-art-in-godot (CC0) | Working texel-snapped camera, Godot port of t3ssel8r's upscaler, convex-edge shader with numbers |
| three.js `RenderPixelatedPass` (from KodyJKing/hello-threejs): https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/RenderPixelatedPass.js | Ready-made depth+normal edge pass in three.js |
| Godot community shaders: https://godotshaders.com/shader/3d-pixel-art-outline-highlight-post-processing-shader/ | Variant of the same edge pass |

### Video list (title, id, date recorded or published) [confirmed]
2020: Pixel Art Grass Shader `XPA4kKOnIt8` (10-03) · Pixel Art Grass Shader V2 `thUXblUXKeU` (10-04) · Pixel Art Block Shader `Lm5tRVNQxFs` (10-05) · Isometric Camera `ij555s4mAuI` (10-05) · Nighttime Lighting `VEP4INri_1U` (10-05) · Subpixel Camera `NutO1jzuVXU` (10-10) · Cloud Shader `_uxV9R3JrXo` (10-17) · 3D Pixel Art Water Shader `-E0QaU70twc` (10-18) · Nighttime Dynamic Water Level `a0Sv5xqvmzU` (10-18) · Realtime Reflections `_0PpBepvjFk` (10-19) · Demo Scene: Water Shrine at Night `ln6Rpdoc2PQ` (10-26) · Procedural Day/Night Cycle `YJSal0UocLY` (11-02) · Procedural Pixel Art Trees `pslJg8vpeHo` (11-08) · Wind Animations `JMhDEPIJths` (11-09) · Creating a Scene for my 3D Pixel Art Game `ERA7-I5nPAU` (11-14) · Procedural Pixel Art Fire `erQ8PvxIjS8` (11-23) · Pixel Art Rain Shader `ony4o3E0J20` (11-30) · Parallax Effect `cCUCMBmc9yQ` (12-11).
2021: Pixel Art Shader Updates `ZsMHY4LDyRE` (01-22) · God Rays `fSNdZ82I-eQ` (01-23) · Dynamic 3D Pixel Art Particle Lighting `0xJqzUHJ2fI` (01-30) · 3D Pixel-Art Terrain Authoring `mZjSmJ3dxHw` (02-21) · Fire/Rain/Grass Interaction `AcVDCCNqvzg` (04-02) · Creating Particle Effects Without Particles `39A0n24PX8g` (04-29) · Making an Animation for my 3D Pixel Art Game `1FrIBkuq0ZI` (06-12).
Later: Giving Personality to Procedural Animations using Math `KPoeNZZ6H4s` (2022) · Designing a Better Aim Assist for 2D Games `yGci-Lb87zs` · Crafting a Better Shader for Pixel Art Upscaling `d6tp43wZqps` (2023-05).

---

## 1. Pipeline overview

```
Blender low-poly models (45°-aligned, procedural displacement baked on import)
        │
Unity, custom SRP (originally built-in RP), forward shaders + a depth/normals PRE-PASS
        │
[1] Depth+normals prepass at 640x360 (+1 texel padding)          ← camera snapped to texel grid
[2] Opaque color pass at 640x360: toon ramp ("white PBR" → 3-colour palette) × albedo,
    shadow maps + cloud-shadow cookie + LoN "fake ambient" inside shadow,
    each fragment reads the prepass and darkens (outline) or lightens (convex edge) itself
[3] Grass / leaf billboards (instanced), each shaded as the terrain point they sit on
[4] Water (reflection RT + refraction with pixel displacement + 1px shoreline highlight)
[5] Additive effects: quantized point lights, god-ray planes, rain, fire (each quantized)
        │
[6] Upscale to display: smooth "pixel-art AA" filter (fwidth box filter) with sub-texel
    offset = camera snap error → camera glides smoothly at display resolution
```
Sources: imgur captions; "Dynamic 3D Pixel Art Particle Lighting" description ("the existing depthnormals pass I'm rendering ... without having to re-render any geometry"); "it's done through a custom particle system and a handful of forward rendering shaders" (Reddit); "I just render to a low resolution RT ... whole scene" (YouTube reply on thUXblUXKeU).

---

## 2. Render resolution and upscaling

### What it looks like
Crisp square pixels, about 3x on a 1080p screen. The camera still pans smoothly, at sub-pixel precision, and you don't see stair-step swimming. Pixel edges get a hair of AA only while the image is moving or at non-integer scales.

### Facts [confirmed]
- **640x360 internal resolution.** "we render our scene at a low pixel art resolution (640x360) and upscale the result to the screen resolution" (NutO1jzuVXU). His Reddit answer: "640x360, unity, blender, after effects". The Unity Game view in the imgur screenshot is set to "Pixel Art (640x360)".
- **One render target for the whole scene**, no per-object pixelation: "I just render to a low resolution RT. Elliot's method [ProPixelizer] is more suited to games that have a mix of different resolution assets."
- **Borders:** the snap offset "is always at most a single texel, so you can either pad the RT size by 1 texel in each dimension, or what I do is just set the texture extrapolation mode to clamp". David Holland pads: SubViewport 322x182 for a 320x180 view.
- Since 2023 he uses his "pixel art AA" filter (below) "for upscaling the game's internal render resolution to the game's display resolution, as well as for UI and text". "While this works optimally for integer upscaling, it also allows for less conventional upscaling ratios, such as when running in windowed mode."
- Everything runs in linear colour space; display gamma is applied at the end.

### The upscaling shader ("Crafting a Better Shader for Pixel Art Upscaling") [confirmed]
Derivation, from the transcript and Patreon notes:
1. Bilinear sampling of a texel-sized box equals the **area-average over a 1-texel box** (a continuous box filter).
2. The ideal AA for a screen pixel is the average texture colour inside that pixel's footprint. Any box covering at most 2x2 texels can be "stretched" to texel size while keeping the same average. So a pixel-sized box filter equals **one bilinear sample at a shifted UV**.
3. The pixel footprint in texel space is the deformation gradient (Jacobian) `[du/dx du/dy; dv/dx dv/dy]`. Its axis-aligned bounding box has width `|du/dx|+|du/dy|` and height `|dv/dx|+|dv/dy|`, which is exactly **`fwidth(uv)`** (in texel units).
4. Clamp the box size to (1e-5 .. 1 texel). Past 1 texel, let mipmapping/anisotropic filtering take over, and pass the *original* UV gradient through `textureGrad`, because the warped UVs break the hardware LOD selection.
5. Instead of a flat box, use a quadratic window `k(x,y) = 9/4 · max((1-4x²)(1-4y²), 0)`. It is separable, and its integral across a texel boundary is a cubic, i.e. **`smoothstep`**. (He admits he started from smoothstep and derived the kernel afterwards.)
6. With transparency, use **premultiplied alpha** (`Blend One OneMinusSrcAlpha`). Straight alpha gives wrong colours where a transparent texel borders several opaque colours.

Exact shader. This is t3ssel8r's code as ported by David Holland to Godot; the comment there reads "based on code by t3ssel8r". GLSL for three.js:
```glsl
// fullscreen pass; tLow = low-res colour RT with LINEAR min/mag filter, no mipmaps needed at >=1x
uniform sampler2D tLow;
uniform vec2 texSize;            // e.g. vec2(642.0, 362.0) incl. padding
in vec2 vUv;                     // UV into tLow (see subpixel offset below)
out vec4 outColor;
void main() {
  vec2 boxSize  = clamp(fwidth(vUv) * texSize, 1e-5, 1.0);          // box filter size in texels
  vec2 tx       = vUv * texSize - 0.5 * boxSize;                      // texel coordinate of box min corner
  vec2 txOffset = smoothstep(vec2(1.0) - boxSize, vec2(1.0), fract(tx)); // quadratic-window AA ramp
  vec2 uv       = (floor(tx) + 0.5 + txOffset) / texSize;             // snap to texel centre + ramp
  outColor = textureGrad(tLow, uv, dFdx(vUv), dFdy(vUv));
}
```
At integer scale with the image placed pixel-perfect, every fragment lands outside the ramps, so the result is identical to nearest-neighbour. With a fractional offset, exactly one display-pixel column per texel edge is blended, and that is what makes the smooth glide look clean.
three.js notes [suggested]: set the low-res RT texture to `LinearFilter` (the shader does the "nearest" itself). Keep the RT in linear space (HalfFloat or `colorSpace = LinearSRGBColorSpace`) and convert to sRGB in this final pass, or put an `OutputPass` after it.

---

## 3. Camera: orthographic "isometric", texel snapping, sub-pixel smoothing

### Facts [confirmed]
- "a **30 degree pitch** isometric camera that **snaps the yaw to 45 degree increments** is used. This can perfectly reproduce the 2-pixels-across-1-pixel-down look of rectangular pixel art blocks, while still allowing smooth camera motion between snapping regions." (ij555s4mAuI). Reddit: "isometric viewing angles (30 degree elevation, 45 degree azimuth)". In game, "my camera rotates freely between different azimuth angles".
  - Check: with an ortho camera at elevation θ and yaw 45°, a world X or Z axis edge projects with screen slope = sin θ. With θ = 30° the slope is exactly 0.5, the classic 2:1 pixel line. Vertical edges project at cos 30° = 0.866 of their length, and ground depth is foreshortened by sin 30° = 0.5.
- **Model geometry on 45° angles**: "While modeling, I take care to keep things aligned to 45 degree angles whenever possible: this will pay off in the final image, because 45 degree angles look especially pleasing when viewed from the isometric pixel art perspective." (imgur)
- **Snapping:** "At render-time, the camera is snapped to the nearest 'pixel', and when blitting to screen, the snap offset is corrected so that the camera is permitted to smoothly glide over the pixels of the screen at the display's native resolution. Some extra projections need to be computed in order to ensure that this operation works precisely even when the camera is rotated 45 degrees." (NutO1jzuVXU)
- Reddit recipe: "1. probably use an orthographic camera 2. snap the camera to the nearest screenspace pixel in world space 3. snap any objects that are moving with the camera to the camera".
- On the player: "anything that moves with the camera (player, maybe some npcs) need special code ... the snapping of the player must match the snapping of the camera exactly, or you will get pixel jitter. It's not enough to snap, but the snap must also happen in sync."
- Big vistas: "blending between a real perspective camera for distant geometry and the orthographic camera for nearby geometry ... automatically creates the multilayered parallax effect for distant objects, while maintaining crisp pixel positioning in the foreground. A depth-based fog helps tie the scene together." (cCUCMBmc9yQ)

### Algorithm (from David Holland's working CC0 implementation, translated to three.js)
```js
// camera: THREE.OrthographicCamera, pitched -30° (rotation.x), yaw = k*45° (rig rotation.y)
// LOW_W=640, LOW_H=360; render target is (LOW_W+2) x (LOW_H+2) for 1-texel padding
const texelWorld = (camera.top - camera.bottom) / LOW_H;     // world units per low-res pixel

// snap space = camera's rotation-only basis (recompute whenever yaw/pitch changes)
const basis = new THREE.Matrix4().extractRotation(cameraRig.matrixWorld);   // columns: right, up, back
const inv   = basis.clone().invert();

function snapCamera(truePos /* Vector3, unsnapped desired position */) {
  const p = truePos.clone().applyMatrix4(inv);               // into camera-aligned axes
  const s = p.clone().divideScalar(texelWorld).round().multiplyScalar(texelWorld);
  const err = s.clone().sub(p);                              // snap error (world units, camera axes)
  camera.position.copy(s.applyMatrix4(basis));               // render from snapped position
  return new THREE.Vector2(err.x, err.y).divideScalar(texelWorld); // error in texels (|e| <= 0.5)
}
// Objects that move WITH the camera (player): snap their positions in the same basis to multiples
// of texelWorld (x,y only) right before rendering, and restore afterwards (David does exactly this).
```
Upscale blit with sub-texel compensation [suggested sign; verify it empirically by panning slowly]:
```glsl
// scale = integer or fractional display scale (e.g. 3.0 for 1920x1080)
// errTex = snap error in texels from snapCamera (camera-right, camera-up)
vec2 t   = gl_FragCoord.xy / scale + 1.0 - errTex;   // +1.0 skips the padding texel
vec2 vUv = t / texSize;                               // then feed into the AA upscaler above
```
If the camera was snapped e texels to the right of where it should be, the world appears e texels too far left in the RT, so sample at `-e`. David's display node does the equivalent by moving the upscaled sprite by `texel_error * scale` screen pixels. At integer scales he optionally rounds this offset (pure pixel stepping) when sub-pixel motion is disabled.

Orbit [confirmed in David's rig, consistent with t3ssel8r's video]: `yaw = lerp(yaw, target, 1 - 2^(-4·dt·speed))`, target in 45° steps, snapping exactly when within 0.02 rad. Pan speed forward is divided by `sin(pitch)` so a pitched ortho camera feels like 2D scrolling.

Scale [suggested]: in his shrine shots the pillars are about 14-20 px wide at 640x360. A good start is 1 world unit (1 m) ≈ 16 texels, i.e. ortho frustum height 360/16 = 22.5 units.

---

## 4. Outlines and convex-edge highlights

### What it looks like
- **Outer outline:** a 1-px line just *inside* the silhouette of the nearer object. It is a darker, desaturated version of the object's own colour, not black. It appears only where an object overlaps something farther away.
- **Inner convex edges:** a 1-px *lighter* (cream) line along convex creases, e.g. the rim where a top face meets a side face. It lands on the **more oblique face**, which at a 30° pitch is usually the top face. **Concave creases get nothing.** In the passes GIF, red lines (normal edges) run along block tops and ledge lips, and blue (depth) lines trace silhouettes.
- Grass and leaf sprites are **not** outlined.
- Since Jan 2021, edges are "light-aware": highlights read brighter on lit faces and are subdued in shadow (ZsMHY4LDyRE).

### Facts [confirmed]
- Imgur: "we first tell the GPU to compute a depth pass and normal pass ... the shader code can determine whether each pixel lies on an edge or not. The main challenge at this stage is to get every edge pixel exactly perfect, or else the pixel art effect will be lost." and "the edge detection shader needs to produce clean single-pixel lines for objects of all shapes, sizes, and orientations."
- First version (depth only): "the depth buffer is sampled for adjacent points, and the pixel is brightened or dimmed based on whether it is closer or further to the camera than its neighbors" (Lm5tRVNQxFs). Rewritten later: "completely rewritten to use a normal pass, which is much more reliable" (ln6Rpdoc2PQ).
- **The outer outline rule (his "key insight", Reddit 2021-03):** "since the models are low poly and faces are flat, each pixel can predict neighbour pixel depths based on its own depth and normal ... [outline] points that have a neighbor whose depth is greater than predicted."
- **Convex edges:** "The internal convex outlines are just black magic unfortunately. I developed the filter on cubic objects (90 degree edges) oriented in various angles and tweaked numbers and added factors until it stabilized. **it's not a symmetric filter.** I originally also had a filter for internal concave outlines but never got them to play nice. It was eventually dropped entirely."
- "reading from a screenspace normal texture effectively doubles your spatial frequency resolution compared to trying to reconstruct the surface from the depth alone".
- Edge colouring: "edge detection on the depth and normals of the viewport, and then shading based on the light."
- Material params visible in the imgur inspector (Custom/Block shader, material "Stone_day"): `Highlight Color #E5D8B0`, `Midtone Color #908968`, `Shadow Color #858780`, `Shadow Threshold 0.05`, `Secondary Lighting 1`, `Secondary Light Qua(ntization) 40`, `Ambient Shading 0.3`, `Blending 0`, `Smoothness 0.5`, **`Outline Threshold 5`**, **`Corner Brightness #FFFBE6`**, **`Outline #858780`**. Swatch hexes were sampled from the screenshot. These are multipliers on albedo: white PBR → ramp → × albedo.

### Algorithm for three.js
Use a 4-neighbour kernel (up/down/left/right only), which is what guarantees 1-px lines. Use view-space normals and linear view depth from a prepass at the same 642x362 resolution, both NEAREST filtered.

```glsl
// inputs: tNormal (view-space normal *0.5+0.5), tDepth (DepthTexture), ortho near/far, texel (1/res),
// texelWorld (world units per pixel). In ortho, view-space xy offset of a 1-px step = texelWorld.
float dist(vec2 uv){ float d = texture(tDepth, uv).r; return near + d*(far-near); }   // ortho = linear
vec3  nrm (vec2 uv){ return normalize(texture(tNormal, uv).xyz*2.0-1.0); }

const vec2 OFF[4] = vec2[](vec2(0,1), vec2(-1,0), vec2(1,0), vec2(0,-1));   // up, left, right, down

float outlineMask(vec2 uv, float d0, vec3 n0){
  // t3ssel8r: predict neighbour depth from own plane; outline if neighbour is FARTHER than predicted
  float nz = max(n0.z, 0.15);                               // avoid blow-up at grazing angles [suggested]
  float o = 0.0;
  for (int i=0;i<4;i++){
    vec2 dxy  = OFF[i] * texelWorld;                         // view-space step
    float pred = d0 + dot(n0.xy, dxy) / nz;                  // planar extrapolation (dist grows away from cam)
    float dn   = dist(uv + OFF[i]*texel);
    o = max(o, step(depthThreshold, dn - pred));             // depthThreshold ≈ 0.5–2 * texelWorld [suggested]
  }
  return o;    // 1 → this pixel is the near side of a silhouette → darken
}

float convexMask(vec2 uv, float d0, vec3 n0){
  float e = 0.0;
  for (int i=0;i<4;i++){
    vec2 uvN = uv + OFF[i]*texel;
    vec3 nN  = nrm(uvN);  float dN = dist(uvN);
    float nz = max(n0.z, 0.15);
    float pred = d0 + dot(n0.xy, OFF[i]*texelWorld)/nz;
    bool continuous = abs(dN - pred) < depthThreshold * 2.0;          // same surface patch, no silhouette
    float convexity = dot(nN.xy - n0.xy, OFF[i]);                      // >0: normals diverge along the step = convex
    bool iAmOblique = n0.z < nN.z + (i < 2 ? 1e-5 : 0.0);              // edge goes on the more oblique face; up/left tie-break
    e = max(e, (continuous && iAmOblique && convexity > convexThreshold) ? 1.0 : 0.0);  // convexThreshold ≈ 0.1–0.5
  }
  return e;
}
// final (inside the object's own fragment shader, or as a post pass over opaque objects only):
//   if (outline)     col = baseLitColor * outlineMul;               // outlineMul ≈ #858780 → ~0.52–0.7 [suggested 0.6–0.7]
//   else if (convex) col = mix(col, col * cornerMul, edgeLight);    // cornerMul ≈ 1.25–1.4; edgeLight = 1 lit, ~0.4 in shadow
```
Checks of the convexity sign in view space (x right, y up, +z toward camera): (a) A ridge pointing at the camera: left face normal (−a,0,b), right face (a,0,b). Stepping right gives Δn·o = 2a > 0, so convex. (b) The top-front edge of a cube seen from 30° above: front normal (0,−0.5,0.87), top normal (0,0.87,0.5). Stepping up from the front face gives Δn·o = 1.37 > 0, so convex. Ownership goes to the top face because its n.z is 0.5 < 0.87, which matches his screenshots (cream line on the top rim). For concave creases Δn·o < 0, so they are skipped, as in his engine.

Community variants you can drop in:
- **three.js RenderPixelatedPass** [community]: depth edge `diff = Σ clamp(depthNeighbour - depth, 0, 1)`, then `floor(smoothstep(0.01, 0.02, diff)*2)/2`. Normal edge per neighbour: `(1 - dot(n, nN)) * step(neighbour not nearer) * smoothstep(-.01, .01, dot(n - nN, vec3(1)))` summed and `step(0.1, ·)`. Output: `col * (dei>0 ? 1 - depthEdgeStrength*dei : 1 + normalEdgeStrength*nei)`, with defaults depthEdgeStrength 0.4 and normalEdgeStrength 0.3. Its `vec3(1,1,1)` "normal edge bias" decides which side of a crease gets the highlight. That makes it asymmetric, just like t3ssel8r's. Weakness: it uses plain depth differences, not plane prediction, so it misfires on grazing slopes.
- **David Holland Godot** [community]: kernel = 4 neighbours. `depth_thresh = 0.25 * remap(max(0.5, 1 - n.z), 0.5..1 → 1..2)` (looser on oblique faces). Convexity `dot(cross(n0, nN), vec3(offset.yx, 0)) > 0.5 * remap(min(n0.z, 0.5), 0..0.5 → 2..1)`. Owner `nN.z + bias > n0.z`. Outline `pos0.z - posN.z > depth_thresh`. The "_but_more" version adds a 3x3 concavity veto (concave_threshold 0.01, concave_depth_threshold 0.5) to kill false convex hits.

Pitfalls [confirmed by him and others]: works best on low-poly, flat-faced, 45°-aligned models. Smooth/subdivided meshes produce noisy edges. Thresholds need per-scene tuning. Keep grass and leaves **out of the prepass**. Otherwise every tuft gets an outline and god-ray depth fades break (David's issue).

---

## 5. Lighting model (toon ramp, shadows, ambient, point lights, day/night)

### Facts [confirmed]
- "fairly standard toon shader: each material has an adjustable **highlight, midtone, and shadow color**, and some settings for how smoothly to blend between the different colors" (imgur).
- "My toon shader evaluates a **white PBR material** and performs **color mapping via artist-defined color ramp/palette**. I then take that result and **multiply by the per-object albedo texture**. For fully-shadowed objects, I also **shade based off LoN to fake some ambient lighting** (note how the shadowed pillars still have shading definition) ... If a particular object needs more customized colors like colorized shadows ... it can use a custom palette." (Reddit, 2020-10)
- "add contrast in shadowed regions by shading the shadowed regions using a simple **monochromatic Lambertian BRDF**, resulting in a soft fake ambient lighting effect" (NutO1jzuVXU).
- Lighting is a single **sun (directional light) with real shadow maps**, "to provide some crisp directional lighting". Hard shadows.
- **Anti-popping:** "adding a slight **world-space perturbation to the normals** (or the thresholds) helps a lot for making cel-shaded not 'pop' so suddenly between levels when the lighting direction changes." and "I also use a slightly softer gradient transition on solid materials". "perturbing the normals on flat ground is pretty important for a toon shader with hard color transitions".
- **Cloud / canopy shadows:** "I drape some procedurally generated shadows over the scene, to simulate cloud coverage or a forest canopy. The extra shadows cause the effect of the grass sprites to really come alive." Clouds are "a 3D FBM that scrolls in space and evolves over time". Projection: "a worldspace formulation which assumes the world is a flat relief, and blending it with the physically correct worldspace formulation ... similar in spirit to normal smoothing in toon shaders for ... anime-styled" faces. Applied as a light cookie.
- **Point lights (torches):** "additive lighting pass on the base shading, ignoring the color ramp ... the light position and intensity is wiggled at a very low framerate, and the lighting level is quantized to a preset number of levels, to provide the intentional banding effect". Later done as deferred-style light volumes reading the depthnormals pass, plus an optional screen-space raymarched contact shadow.
- **Day/night:** "material colors are blended by interpolating between different variants of the materials for day, night, golden hour, and twilight depending on the angle of the sun". The night version was "made just by swapping a few color palettes and adding a dynamic light".
- Critique he accepted: show lighting "through saturation instead of value"; his first grass palette was "too high contrast".

### GLSL sketch [suggested values]
```glsl
uniform vec3 hiCol, midCol, shCol;        // ramp (multipliers on albedo, or absolute colours)
uniform float thrHi, thrMid, blend;       // e.g. 0.55, 0.05 ("Shadow Threshold 0.05"), blend 0.0–0.03
uniform float ambientShading;             // 0.3
vec3 N = normalize(vNormalW + (noise3(vPosW*0.35)-0.5)*0.15 * flatness);   // world-space normal perturbation
float ndl   = dot(N, sunDir);
float sh    = shadowMapAtten * cloudAtten(vPosW);          // 0..1
float light = max(ndl,0.0) * sh;                           // "white PBR" (diffuse is enough)
float tHi   = smoothstep(thrHi - blend,  thrHi + blend,  light);
float tMid  = smoothstep(thrMid - blend, thrMid + blend, light);
vec3 ramp   = mix(shCol, mix(midCol, hiCol, tHi), tMid);
// fake ambient definition inside shadow: monochrome Lambert vs a fixed sky/"secondary" direction
float amb   = mix(1.0, 0.5 + 0.5*dot(N, ambDir), ambientShading);
ramp *= (tMid < 0.5) ? amb : 1.0;
vec3 col = ramp * albedo;
// quantized additive point lights
for (each light) { float a = atten(dist) * max(dot(N,Ldir),0.); col += lightCol * floor(a*levels + 0.5)/levels; }
```
Cloud attenuation [suggested]: `uvPhys = (P - L * (P.y/L.y)).xz` (light-projected), `uvFlat = (P - V * (P.y - groundY)/V.y).xz` (view-projected onto a flat relief). Then `cloud = step(c0, fbm(mix(uvFlat, uvPhys, 0.5)*freq + wind*t, t*evolve))`, i.e. a hard threshold with no gradient, darkening light to the shadow band.

---

## 6. Grass

### What it looks like
The ground is a flat toon-shaded terrain with exactly 3 tones (shadow / mid / highlight). On top sit thousands of small camera-facing **tuft sprites** (a grayscale atlas of about 4-8 blade-clump shapes, each roughly 8-16 px). Each tuft is filled with **one flat colour, the colour the terrain has at the tuft's base**. Where a shadow edge or tone boundary crosses the ground, the boundary turns into a jagged, blade-shaped "grassy" edge, and tufts on the lit side poke up into the shadow and vice versa. That is the single most recognizable t3ssel8r ingredient. A random subset uses a different sprite and colour (flowers: lilac, yellow). The tufts animate (wind) via sprite-sheet frames, not vertex bending.

### Facts [confirmed]
- "the game engine will randomly add grass sprites all over the grassy parts of the terrain. Each grass sprite is shaded with the same toon coloring as the terrain it sits on, which results in this effect where the boundaries between colors get broken up by a grassy pattern." (imgur)
- v1 used a grab pass to read the terrain pixel colour under the sprite base, which caused "flickering issues ... at the boundary between shading levels".
- **v2 (current):** "grass is shaded directly, by **transferring the world position and normal of the base terrain** in 3D, which does not change frame-to-frame. GPU instancing ... A **random subset of the grass is given a separate sprite and a randomized color**." "the grass is made up of a bunch of grass-shaped sprites that are shaded with a single color equal to the color of the pixel at its base". "it's a custom particle system that instances textured quads everywhere and passes the properties of the base object to the particle so that they compute the same color during shading".
- Grass texture `grass.png`: grayscale, "Alpha Source: From Gray Scale", **Point filter**, no mipmaps (imgur screenshot). The atlas shows about 8 tufts, white on transparent.
- Placement: random at first, later **blue noise** ("perhaps using blue noise, like I did with the grass").
- Density/perf: "pause the particle system ... GPU instancing, or ... builtin terrain details system ... Since each mesh is so simple, I've also had success just **pre-baking chunks into meshes**." At one point he overrode Unity's `Hidden/TerrainEngine/Details/BillboardWavingDoublePass`.
- **Wind:** "turned the grass and leaf sprite sheets into animations, and animated in the shader via **UV-offset based on position and time**" (JMhDEPIJths).
- Interactions: burnt grass is stored in a render texture written by flaming objects (AcVDCCNqvzg). Rain adds splashes on gently sloped ground.
- Aesthetic goal: "a more modern flat/impressionistic look like the artwork of **Daniel Riise**".

### three.js implementation [suggested]
- `InstancedMesh` of a unit quad. Per instance: `aBasePos` (vec3, the terrain point), `aBaseNormal` (vec3), `aVariant` (atlas cell), `aTint` (vec3 or 0 for "use terrain colour"). Bake per 32x32 m chunk. Poisson/blue-noise spacing ≈ 0.25-0.4 m (dense; tufts overlap by 30-50%).
- Vertex: cylindrical billboard (rotate around world Y to face the camera yaw; at a fixed 30° pitch that is enough). Quad height ≈ 0.5-0.8 m. Snap the base to the texel grid so tufts don't shimmer. Write depth so objects occlude correctly, but **don't render into the outline prepass**.
- Fragment: `alpha = texture(atlas, uvCell + frameOffset).r; if (alpha < 0.5) discard;` (hard alpha, no AA). Colour = **terrain toon shading evaluated at `aBasePos` / `aBaseNormal`** (same function, same uniforms, including the shadow-map lookup at the base position and cloud attenuation at the base). The whole sprite is one flat colour. With `aTint`, use the ramp luminance band × tint for flowers.
- Wind frame: `frame = floor(fract(t*0.6 + dot(aBasePos.xz, vec2(0.13,0.07)) + noise(aBasePos.xz*0.05 + t*0.1)) * nFrames)`. The frame rate is low (≈ 6-8 fps), so it reads as hand-animated.
- Shadow sampling at the base: three.js lets you call `getShadow(...)` with a custom `vShadowCoord` computed from `aBasePos`. Or compute the shadow coord yourself: `directionalShadowMatrix * vec4(aBasePos + normal*bias, 1)`.

---

## 7. Trees and leaves

### Facts [confirmed]
- Modeling: "Trees are just cylinders with some merged spheres on top ... All the leaves get some random displacement, and the **normals are edited** to improve lighting ... tree trunks get a procedural woody displacement, which looks pretty good after decimation" (ERA7 transcript).
- "Some **jagged spheres are used as shadow-casters** and a bunch of randomly-placed **leaf sprites are drawn over them, lit using the sphere normal**." (pslJg8vpeHo)
- "I spawn a **leaf sprite on each vertex of the tree mesh** and **transfer the normals of the mesh to the sprite** so the shading works. then I use a vertex shader to make the sprites face the camera." (YouTube reply)
- Leaf sprite sheets animate for wind (same UV-offset method as grass). In rain, "procedural bobbing of the upward-facing leaves".
- Leaves in the later screenshots: 3-4 tone clumps (dark teal-green underside, mid green, bright yellow-green tips on the sun side), with leaf-shaped silhouettes breaking the canopy edge.

### three.js [suggested]
- Canopy proxy: icosphere (subdiv 2-3) with noise displacement. It casts shadows and is invisible in colour (`colorWrite=false`), or it is drawn dark as the canopy interior.
- One instanced leaf billboard per proxy vertex (plus jittered extras for density). Normal = the proxy's **spherical normal** (`normalize(vertex - sphereCenter)`), so the clump shades like a ball: lit top-sun side, dark underside. Use the same toon ramp, receive shadows at the leaf position, 3 tones + a 4th rim tone if desired.
- Leaf sprite ≈ 6-12 low-res px; atlas of 4-6 leaf clusters; hard alpha.

---

## 8. Water

### Facts [confirmed]
- "The most striking part of pixel art water is the **sharp highlight at the edge of the water**. I am accomplishing this again using the depth pass, and drawing the highlight only if the depth of the background is **1 pixel behind** the depth of the water texel being shaded." (-E0QaU70twc)
- "The rest of the effect is sold by a **screenspace pixel-perfect horizontal displacement map for refraction wiggles**, and some wiggling particles on the surface of the water."
- Imgur: "a pretty standard mix of refraction, reflection, and texture displacement to simulate ripples. The most important detail for the pixel art aesthetic is to draw a **single pixel highlight on the border between the water and air**." The water surface "moves up and down", and the level can change dynamically.
- **Reflection:** "a custom **orthographic light probe** is generated for the water surface, which captures the reflection from the perspective of the viewer. The water shader then blends this reflection with the refraction" with artist-controlled blending colours and transparencies (_0PpBepvjFk). It pairs well with moving cloud shadows.
- In the screenshots: transparent pale sky-blue water (#84B7D2, #A5D2CE, #79B5C9). Submerged geometry is visible and tinted. Thin white/cyan 1-px lines at shorelines and around pillars. Reflections of pillars appear below them.

### three.js [suggested]
```glsl
// water plane drawn after opaques, reads opaque depth (tDepth) + opaque colour (tScene) at low res
float waterDist = viewDistOfThisFragment;
vec2  sUV  = gl_FragCoord.xy * texel;
float bgDist = dist(sUV);                                   // opaque surface behind the water
// 1px shoreline: background within ~1 texel of depth behind the water surface
float edge = step(bgDist - waterDist, texelWorld * 1.0);   // "1 pixel behind"
// pixel-perfect horizontal refraction: integer texel offsets from a scrolling noise
float wob  = floor((noise(vec2(vPosW.z*2.0, t*0.8)) - 0.5) * 3.0 + 0.5);  // -1,0,+1 texels
vec3 refr  = texture(tScene, sUV + vec2(wob, 0.0) * texel).rgb;
float depthUnder = clamp((bgDist - waterDist) / murkDepth, 0.0, 1.0);
vec3 col   = mix(refr * shallowTint, deepCol, depthUnder);
col        = mix(col, reflectionRT(sUV_mirror), reflectAmt);      // ortho planar reflection camera
col        = mix(col, edgeCol, edge);                             // edgeCol ≈ #E8FBFF
```
Reflection camera [suggested]: clone the snapped ortho camera, mirror it across the water plane (y = h), render to a 642x362 RT, and use an oblique near plane to clip below the water. Add sparse 1-px "sparkle" particles that blink at low fps.

---

## 9. Other effects (brief, all [confirmed] unless marked)
- **God rays:** "fullscreen quads which sample the depth and light-space shadowmap, and colors based on shadowing, view normal, light direction, and screen position". The quads are "parallel to the light ... a series of parallel planes aligned with the light direction to test whether each position is shadowed". "Hard edges on the rays helps to preserve the crisp, pixel art aesthetic." Modulated by camera angle, time of day and rain density. David Holland's single-pass raymarch version costs ≈1.7 ms on a GTX 1060 at 640x360, uses ≥10 planes, and box-blurs depth (~7 px) for a soft fade where rays hit the ground.
- **Rain:** 8 layered effects: streaks, splashes on gentle slopes, spatter "only on the top visual edge of objects" (masked from the camera depth texture), water ripples, blowing mist, bobbing leaves, lightning flashes with sharp shadows, colour grading. Mostly one post-process draw with looping textures.
- **Fire:** Unity particles (core / flames / embers, about 100 particles) rendered additively to a separate buffer, then a **colour-quantization** post shader. Each part runs at a different frame rate to emulate hand animation.
- **Particle textures:** made in After Effects as looping sprite sheets ("Creating Particle Effects Without Particles").
- **Dithering:** used only for a **dithered see-through shader** (occluders near the character) and for fades. **The shading itself is NOT dithered**: flat bands only.
- **Terrain (2021):** a custom mesh generator treats a low-res heightmap as a **tile map** and builds terraces and slopes with a marching-squares-style algorithm, instead of smooth Unity terrain (mZjSmJ3dxHw). The earlier terrain was Unity terrain with painted layers (grass, dirt path, cobblestone). The only hand-drawn texture was a **dirt/cobble tile** made in Aseprite.
- **Moss:** procedural moss on the tops of rocks and ruins (ZsMHY4LDyRE), a green ramp on up-facing normals.
- **Characters:** 3D models animated in Cascadeur. Smear frames are done with "smear interpolation" (1FrIBkuq0ZI). Low-poly characters render through the same pipeline at the same 640x360.

---

## 10. Modeling rules (what makes the geometry "read" as pixel art) [confirmed]
- Low-poly, flat-faced boxes; edges at 0/45/90°; boolean cuts for damage; Blender **array** modifier for stairs; extrusions for pillars.
- Rocks: subsurfed cubes → **procedural displacement → remesh/decimate** (low poly, faceted), giving many small planar facets, each of which catches a distinct ramp tone and convex highlights.
- Bricks: procedural brick-like extrusions on stone blocks. He later felt he "overdid the geometry extrusion".
- No UVs, no texture baking, no normal maps: "No multires, texture baking, UV unwrapping". Colour comes from per-material palettes (+ a few tiling textures for ground).
- A scene takes about 2 h; modifiers are baked by the importer.

---

## 11. Palette and colour analysis (measured from his lossless PNGs, sampled at 640x360)

General rules [observed]:
- Each material has about **3 tones** plus an outline tone and an edge-highlight tone. Grass has exactly 3 flat tones and no gradients.
- **Shadows are cool and desaturated** (teal / slate blue / blue-violet). **Lights are warm** (yellow-green, cream, ochre). The hue shift between bands is large and the value steps are moderate.
- Stone is warm grey-beige when lit and **blue-violet grey** in shadow. Rocks in the 2021 shots are dark **purple** (#484566-#646076) with green moss and an orange rim in golden light.
- Accents: small **lilac/violet flower** sprites (#A875D7, #CA91E3, #DC9EFF) and tiny yellow flowers scattered through the grass, plus the iconic cyan cube.
- No pure black and no pure white anywhere. The darkest values in day scenes are ≈ #374B58 / #3B6B5A.

| Scene | Grass hi / mid / shadow | Stone/rock lit / mid / shadow | Other |
|---|---|---|---|
| Ruined Shrine (Oct 2020) | #BBD985 / #75A558 / #3B6B5A | #BBAC97 / #8C7E72 / #5B5A64 | cobble #606C77, #535B6B; outline-ish #706D74; cube light cyan (not sampled) |
| Forgotten Gate (Nov 2020) | #B6CC77 / #84B35B / #5A887E (deep shade #46726C) | #C2AE96 / #7C7D8F / #727388 | water #84B7D2, #A5D2CE, #79B5C9; tree mid #689763 |
| Meadow ruins "nature" (Jan 2021) | #97AC64 / #71924B / #526F6C (deep #425E5A) | rock #646076 / #4C4B6C / #484566 | bush hi #87AA46, bush shade #5C7A52; moss #94AA6F; flowers #A875D7 #CA91E3; trunk #574E68 / #654853 |
| Golden hill in mist (Jan 2021) | #AF993A (ochre, lit) / #75704D / #374B58 (teal-slate shade) | cliff #4F545E, rim orange | fog #757881 / #787380; distant trees desaturated into fog |
| God-ray forest (Jan 2021) | #909866 / #75893D | rock #786D83 / #42445C | haze #5C666B, light shafts #9D9391 / #C5ABAB |

Material ramp from his inspector (Stone_day): highlight ×#E5D8B0, midtone ×#908968, shadow ×#858780, corner brightness ×#FFFBE6, outline ×#858780.

---

## 12. Why it looks "stunning" (art direction notes)
1. **Two kinds of geometry, one palette.** Faceted low-poly solids get crisp 1-px outlines and cream convex highlights, while the soft organic layer (grass, leaves) has *no* outlines and takes its colour from what it sits on. Hard-edged architecture sitting in a soft, painterly field is the core contrast.
2. **Big flat shadow shapes.** Hard sun shadows plus FBM cloud/canopy shadows create large, readable dark masses across the ground. Their edges are broken into grass-blade silhouettes by the tufts, which reads as hand-painted pixel art.
3. **Hue-shifted ramps.** Shadow = blue/teal, light = yellow/cream. Saturation carries the lighting more than value, so the image stays bright and readable but never flat.
4. **Isometric discipline.** A 30° pitch, 45° yaw and 45°-aligned modeling produce perfect 2:1 lines and clean pixel clusters, and the camera never shows a "messy" angle.
5. **Density and scale.** A small world scale (≈ 16 px per metre suggested) and very dense grass (thousands of tufts on screen) give a tactile carpet. Scattered flowers and pebbles add 1-3 px detail.
6. **Atmosphere.** Depth fog in long views, hard-edged god rays, slow cloud shadows drifting over the field, low-frame-rate wind animation, and torch flicker at a low frame rate.
7. **Motion is smooth even though the pixels are not.** The sub-texel camera glide plus the AA upscaler mean the world never jitters, which is what sells it as "a painting you can walk through".
8. Influences he named: Daniel Riise (flat impressionistic grass), CrossCode, ProPixelizer (Elliot Bentine), Inigo Quilez, Catlike Coding, aarthificial.

---

## 13. Visual target descriptions (for an artist/scene agent)

### Target A: "Ruined Water Shrine" (day), his canonical scene (imgur breakdown, Oct 2020)
- Camera: ortho, 30° pitch, 45° yaw, 640x360, frame ≈ 40 x 22 m of ground.
- Centre: an **octagonal stone basin** (two stepped octagonal rings, ~10 m across) with a goblet-shaped fountain pedestal in the middle. Water (#84B7D2) fills the inner ring, with a 1-px pale cyan shoreline. A small glowing **cyan cube** floats above.
- Around it, 8-10 **broken stacked-block pillars** (2-3 m tall, irregular stacked slabs, 45°-aligned), a fallen arch, scattered flat slabs and pebbles.
- Ground: meadow in 3 greens (#BBD985 lit, #75A558 mid, #3B6B5A shadow). Large cloud-shadow blobs cover ~40% of the ground; all boundaries are grass-tuft jagged. Corners have **slate cobblestone** patches (#535B6B-#606C77) and a reddish dirt patch.
- Stone: lit #BBAC97, mid #8C7E72, shadow #5B5A64, 1-px darker outline, cream rim on top edges.
- Night variant: same scene, palette swapped to deep blue/teal, a warm torch light with quantized radial bands and flicker at ~8 fps.

### Target B: "Forgotten Gate" (Nov 2020)
- Two tall square **gate pillars** with capitals, standing on a broken **flagstone plaza** (beige #C2AE96 tiles with cool grey grout). A big dead/bare **tree trunk** (#C2AE96 bark, pinkish-beige) leans behind them over a **kidney-shaped pond** ringed by cobble.
- Round **canopy trees and bushes** framing the edges: leaf clumps in #46726C / #689763 / #84B35B, with bright yellow-green tips on the sun side.
- Very bright, warm midday: grass #B6CC77 / #84B35B / #5A887E. Long tree shadows lie across the meadow as big flat teal shapes. A stone-block planter and steps sit at the right.

### Target C: "Meadow of Mossy Ruins" (Jan 2021 "nature" gallery, the God Rays/Shader Updates thumbnails)
- Rolling meadow (#97AC64 / #71924B / #526F6C) with low **ruined walls** of grey-violet stone (#646076 lit, #484566 shadow) and clusters of rounded **dark purple boulders**, each with **green moss caps** on top faces (#94AA6F).
- Scattered **lilac flowers** (3-5 px, #A875D7 / #CA91E3) and tiny yellow sprigs. One deciduous tree with a red-brown trunk (#654853) at the edge, and a lush bright bush (#87AA46) in a corner.
- Optional: a misty version with diagonal **hard-edged god-ray bands** (#C5ABAB on haze #5C666B) falling from the upper left.

### Target D: "Golden Hilltop in Mist" (Jan 2021 "nature" #1/#3)
- Camera looking down a steep grassy **hill/ridge** with a cluster of **faceted purple rocks** (#4C4B6C) on the crest, rim-lit **orange** on their sun-facing facets.
- Grass: shadowed slope in deep **teal-slate (#374B58)**, sunlit slope in **ochre/mustard (#AF993A)**, mid **olive (#75704D)**. The light/shadow boundary is a big, jagged, tuft-shaped edge running diagonally.
- A dark aubergine **cliff face** (≈#4F545E and darker; suggested #3A2F40 for the deepest tone) drops away on one side. In the background, round canopy trees fade into a lavender-grey **depth fog** (#757881 / #787380), and the far valley is barely visible. Lilac flowers scattered across the grass.

---

## 14. Suggested three.js frame graph (putting it together)
1. `snapCamera()` → `errTex`. Snap the player and other camera-following objects in the same basis.
2. **Prepass** (642x362, NEAREST, MRT `count:2` + `DepthTexture`): opaque solids + terrain only → view normals, depth.
3. **Shadow maps**: sun (+ the canopy-proxy spheres as casters). Cloud FBM as a function, not a texture.
4. **Main pass** (642x362, HalfFloat linear): opaque materials do the toon ramp + outline/convex logic in the fragment shader (read the prepass via `gl_FragCoord`). Terrain is the same minus the edge logic.
5. Instanced grass + leaves (hard alpha, base-position shading, no prepass write, depth-tested).
6. Water (needs the opaque colour + depth copy and the reflection RT), additive quantized lights, god rays, particles.
7. **Upscale pass** to the canvas: AA box-filter shader + `errTex` offset + sRGB output.
Budget [suggested]: 642x362 is tiny, so everything except grass instance count is cheap. Aim for 50-150k tuft instances in view.

---

## 15. Gaps / unknowns
- **Exact convex-edge filter**: never published ("black magic", "not a symmetric filter"). The rule above (plane-predicted continuity + normal divergence + "more oblique face owns the edge") reproduces his screenshots but is a reconstruction.
- **Exact outline threshold units**: the inspector shows "Outline Threshold 5", but its unit (texels? depth scale?) is unknown.
- **Edge/outline colour math**: the "Corner Brightness" (#FFFBE6) and "Outline" (#858780) swatches suggest multipliers, but whether they multiply, lerp, or depend on N·L ("light-aware edge coloration", 2021) is not documented.
- Meaning of "Secondary Lighting" / "Secondary Light Quantization 40" (probably additive point lights quantized to N levels) and "Smoothness 0.5" (PBR term inside the "white PBR" evaluation?).
- **Sun direction conventions** per scene; not stated. In the shrine shots, shadows fall up-screen/left (sun roughly from the camera's right). Others vary.
- Grass sprite pixel size, atlas layout, tuft density, and wind frame rate: only qualitatively known.
- The cloud-shadow "flat relief + physical" blend weights; my formula is a guess.
- Whether the 2022-2023 game build still uses 640x360 (the AA video says only "internal render resolution").
- Locked Patreon post "Thoughts on 3D->2D Cameras" (2023-06-21) likely has camera details but is paywalled.
- The water "light probe" reflection details (resolution, how the oblique clipping is done) and the refraction displacement texture.
- The procedural terrain marching-squares rules (terrace/slope tile set) were never explained in depth ("deserves its own explanation video some day").
- Couldn't read Twitter/X threads (no working mirror tried); his Twitter may hold more GIF captions.
