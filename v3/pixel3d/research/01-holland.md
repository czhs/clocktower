# 01: David Holland's "3D Pixel Art Rendering" (Godot 4.3 custom build), adapted for three.js

Primary source: David Holland, *3D Pixel Art Rendering*, 2024-09-24, updated 2025-05-26.
<https://www.davidhol.land/articles/3d-pixel-art-rendering/>

The style follows t3ssel8r's Unity work. The article explains the ideas but contains no code. The concrete code and numbers in this document come from five places:

| Source | What it gave us |
|---|---|
| **Git repo `~denovodavid/3d-pixel-art-in-godot`** (CC0, Godot 4.4.1). <https://git.sr.ht/~denovodavid/3d-pixel-art-in-godot> | Full camera-snapping code (`01-camera/part01..03`), the **actual outline + convex-edge shader** (`02-lines/object_showcase/outline_and_edge.gdshader` and `outline_and_edge_but_more.gdshader`), the material parameter values (`mat_lines.tres`), and the upscale shader. The README still marks "02 Outlines and Edges" as "WIP", but the shader files are in the tree. I read them at commit `675e9c52` (the "godot 4.4" bump). |
| **Poisson-disk sampler C++ paste** (Godot module). <https://paste.sr.ht/~denovodavid/0eeca82f517b5d4d2dea6e5718a04361840be523> | Point sampling code used to place the tree leaves. |
| **Reddit r/godot comment answers** by u/denovodavid | 12 threads, 2023–2024. Reddit itself blocked automated fetches, so I read them through the Arctic Shift archive API (`arctic-shift.photon-reddit.com/api/comments/tree?link_id=t3_<id>`). Thread ids are cited inline as `r/godot <id>`, i.e. `https://www.reddit.com/r/godot/comments/<id>/`. |
| **Bluesky replies** by @davidhol.land (2025) | Fetched with the public AppView API. This includes the god-ray thread and its diagram: <https://bsky.app/profile/davidhol.land/post/3lpxxvmmeck2y> |
| **YouTube** "How my 3D PIXEL ART Camera Works" (<https://youtu.be/LQfAGAj9oNQ>) | Description and chapters. It credits aarthificial (<https://youtu.be/jguyR4yJb1M>) and t3ssel8r's upscaling video (<https://youtu.be/d6tp43wZqps>). |

Secondary sources: Roystan outline shader (<https://roystan.net/articles/outline-shader/>), Roystan toon water (<https://roystan.net/articles/toon-water/>), CaptainProton42 FlexibleToonShaderGD (<https://github.com/CaptainProton42/FlexibleToonShaderGD>), Catlike Coding *Looking Through Water*, Aras P. *Oblique near-plane clipping with ortho camera*, and t3ssel8r's imgur breakdown (<https://imgur.com/gallery/qwhbHQq>).

Conventions used below:
- **[src]** means the value is quoted from a source.
- **[suggested]** means it is my proposal and not from any source.
- **[inferred]** means it is my reconstruction from a verbal description.

---

## 0. Global setup (resolution, camera, pipeline)

### What and why
Render the 3D scene into a small, fixed-resolution target, then upscale it to the screen. The camera is orthographic, pitched about 30° down. Every effect is designed to give exactly one-texel features at that resolution.

### Concrete values [src]
- **Main project:** 640×360. The target is actually **642×362**, giving a one-texel margin on each side for the subpixel shift (§1). Ortho **size 10 m** (Godot `size` is the vertical extent). **Far plane 50 m**, camera about **20 m** from its pivot, **pitch 30°**. Sources: r/godot 14pcb2t, r/godot 14as2b9.
  - Quote: "I'm using quite a short far plane … that's what my outlines work well with". Shadow quality also depended on the ortho far value, "ended up having it quite small" (r/godot 1adijs5).
- **Tutorial repo:** 320×180, SubViewport 322×182, ortho size 10, camera at local z = 20 on the rig. The rig is yaw 45° plus pitch 30° (`part01.tscn` basis 0.707/0.866/0.5), or pitch 30° only in the object showcase.
- Upscale with **nearest** filtering at integer scale. For non-integer scale, or when subpixel smoothing is on, use **t3ssel8r's AA pixel-art upscale shader** (§1.3). "If your scaled resolution isn't an integer scale … some texels … different pixel sizes … banding" (r/godot 14eaecy).
- Textures don't need to be pixel art, "as it all gets rendered at 640x360 anyway". He uses flat colours and simple models (r/godot 14as2b9). The leaves use a pixel-art texture. The grass uses an HD texture because it is rotated in the shader (r/godot 1adijs5).
- Environment in the tutorial: tonemap mode 3 (ACES in Godot 4.4), ambient colour `(0.58, 0.99, 1.0)`, dark sky `(0.10, 0.098, 0.196)`.

### three.js translation
```js
// [suggested] structure
const LOW_W = 640, LOW_H = 360, PAD = 1;                // [src] 642x362 = 640x360 + 1px each side
const rt = new THREE.WebGLRenderTarget(LOW_W + 2*PAD, LOW_H + 2*PAD, {
  minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, samples: 0,  // NO MSAA
  depthTexture: new THREE.DepthTexture(LOW_W + 2*PAD, LOW_H + 2*PAD) });
const ORTHO_SIZE = 10;                                   // [src] vertical extent in metres
const aspect = (LOW_W + 2*PAD) / (LOW_H + 2*PAD);
const halfH = ORTHO_SIZE * (LOW_H + 2*PAD) / LOW_H / 2;  // keep texel size = ORTHO_SIZE/LOW_H
const cam = new THREE.OrthographicCamera(-halfH*aspect, halfH*aspect, halfH, -halfH, 0.1, 50);
renderer.setPixelRatio(1); // render the low-res pass manually, then composite to the canvas
```
- Godot `Camera3D.size` with the default `keep_aspect = KEEP_HEIGHT` equals three.js `top - bottom`.
- The repo computes `texel_size = size / viewport.size.y` using the *padded* height (182). That makes texels very slightly smaller than `size/180`. Either convention works as long as it is consistent. The reddit snippet uses `height = 362` with `ortho_size = 10`.
- Pipeline outline [suggested]:
  1. Shadow map.
  2. Depth+normal prepass into the low-res RT (MRT or a second render with an override material).
  3. Opaque main pass. Materials read the prepass for outlines (§2) and compute toon light (§3).
  4. Water, using copies of the opaque colour and depth (§6).
  5. Full-screen god rays (§7).
  6. Composite/upscale with subpixel shift (§1), plus night grain and vignette (§9).

Sources: <https://git.sr.ht/~denovodavid/3d-pixel-art-in-godot/tree/master/item/01-camera>, r/godot 14eaecy / 14pcb2t / 14as2b9.

---

## 1. Camera: texel snapping and screen-space subpixel offset

### 1.1 What and why
A low-res ortho camera that moves freely causes "swimming and creeping and jittering of pixels". The article gives two steps:

1. **Snap the camera to a view-aligned, texel-sized grid.** This keeps static geometry rasterising identically every frame.
2. **Shift the final image back in screen space by the snap error.** This restores smooth motion at screen-pixel (sub-texel) precision. It is aarthificial's 2D trick extended to 3D.

### 1.2 Exact algorithm [src: `camera_3d_texel_snapped2/3.gd`, r/godot 14as2b9]
```gdscript
# rotation changes the snap space
if global_rotation != _prev_rotation:
    _prev_rotation = global_rotation
    _snap_space = global_transform               # grid origin = camera transform at last rotation change
var texel_size := size / float(viewport.size.y) # ortho height / pixel height
var p  := global_position * _snap_space          # (v * T) == T.affine_inverse() * v  -> camera pos in snap space
var ps := p.snapped(Vector3.ONE * texel_size)    # round to texel grid (all 3 axes)
var snap_error := ps - p
h_offset = snap_error.x                          # shift the camera along its local x/y; transform untouched
v_offset = snap_error.y
texel_error = Vector2(snap_error.x, -snap_error.y) / texel_size   # in texels, screen y-down
```
- The grid is attached to the camera's own axes and re-anchored whenever rotation changes. "Rotation changes are always unstable", so creep is accepted during orbit (r/godot 14as2b9).
- `Vector3.snapped` rounds to nearest. The older reddit snippet uses `floor(p*k)/k`. Both are fine.
- Display (`display.gd`):
  - `scale = min(screen / (viewport.size - 2))`, so the padding is not counted.
  - `sprite.position = -scale + texel_error * scale`. That is: shift by −1 texel to hide the padding, then add the subpixel error in screen pixels.
  - Option: at integer scale, round the sprite position so nothing is filtered.
  - The sprite uses the AA upscale shader below.
- **Moving objects** (`part03`): every node in the group `"snap"` has its world position snapped in snap space on **x, y only** (`Vector3(texel, texel, 0)`), then restored in `RenderingServer.frame_post_draw`. "For a pixel art billboard sprite you need to ensure that it is the correct size in the world, so the texture texels are the same size as the viewport texels. Then you should be able to snap it" (r/godot 17l7ycn).
- **Camera rig** (`camera_rig.gd`):
  - Forward input is divided by `sin(pitch)`, "so pitched ortho camera speed seems constant as if 2D".
  - Orbit happens in 45° (TAU/8) steps with framerate-independent smoothing: `rotation.y = lerp(rotation.y, target, 1 - 2^(-4·dt·orbit_speed))`, `orbit_speed = 4`. It snaps to the target when within 0.02 rad.
  - `move_speed = 4`.
- Caveat from the author: subpixel shifting with the bilinear upscale "introduce[s] a slight blurriness at certain camera positions, even at integer scaling, so it's best left snapped to screen pixels in that scenario" (r/godot 14as2b9).

### 1.3 Upscale shader [src: `pixel_art_upscale.gdshader`, "based on code by t3ssel8r"]
```glsl
vec2 box_size  = clamp(fwidth(UV) / TEXTURE_PIXEL_SIZE, 1e-5, 1.0);   // box filter size in texels
vec2 tx        = UV / TEXTURE_PIXEL_SIZE - 0.5 * box_size;
vec2 tx_offset = smoothstep(vec2(1) - box_size, vec2(1), fract(tx));
vec2 uv        = (floor(tx) + 0.5 + tx_offset) * TEXTURE_PIXEL_SIZE;
COLOR = textureGrad(TEXTURE, uv, dFdx(UV), dFdy(UV));                  // texture must use LINEAR filtering
```

### 1.4 three.js version
```js
// per frame, after moving the "logical" camera rig (cameraProxy)
const snapSpace = new THREE.Matrix4(), snapInv = new THREE.Matrix4();
let lastQuat = new THREE.Quaternion();
function snapCamera(proxy /*Object3D*/, cam /*OrthographicCamera*/, texel /*= ORTHO_SIZE/LOW_H*/) {
  proxy.updateMatrixWorld();
  if (!proxy.quaternion.equals(lastQuat)) {         // re-anchor grid on any rotation change
    lastQuat.copy(proxy.quaternion);
    snapSpace.copy(proxy.matrixWorld); snapInv.copy(snapSpace).invert();
  }
  const p  = proxy.getWorldPosition(new THREE.Vector3()).applyMatrix4(snapInv);
  const ps = p.clone().divideScalar(texel).round().multiplyScalar(texel);
  cam.position.copy(ps.clone().applyMatrix4(snapSpace));
  cam.quaternion.copy(proxy.quaternion);
  const err = ps.sub(p);                            // snap-space error (x right, y up)
  return new THREE.Vector2(err.x / texel, err.y / texel);   // texels, y-UP (three.js/GL convention)
}
```
Composite/upscale fragment shader (GLSL ES 3.0). This is a full-screen pass to the canvas.
```glsl
uniform sampler2D tLow;        // 642x362, LinearFilter (needed by the AA upscale)
uniform vec2 lowSize;          // (642, 362)
uniform vec2 texelErr;         // from snapCamera(), y-up, in texels
uniform float scale;           // min(canvas / (lowSize-2))
uniform vec2 canvasOffset;     // letterbox offset in px
void main() {
  vec2 px = gl_FragCoord.xy - canvasOffset;
  // image is shifted by +texelErr (content moves with the true camera); remove 1px padding
  vec2 tx = px / scale + 1.0 - texelErr;          // texel coordinate in the padded target
  vec2 UV = tx / lowSize;
  // t3ssel8r AA upscale
  vec2 box = clamp(fwidth(UV) * lowSize, 1e-5, 1.0);
  vec2 t   = UV * lowSize - 0.5 * box;
  vec2 off = smoothstep(vec2(1.0) - box, vec2(1.0), fract(t));
  vec2 uv  = (floor(t) + 0.5 + off) / lowSize;
  gl_FragColor = textureGrad(tLow, uv, dFdx(UV), dFdy(UV));
}
```
Translation notes:
- Godot's `texel_error` is y-down (`-snap_error.y`). In GL `gl_FragCoord` is y-up, so use `+err.y`.
- **Verify the sign empirically.** Moving the rig slowly should show zero creep and smooth motion.
- three.js has no `h_offset`/`v_offset`. Moving `cam.position` directly is equivalent for an ortho camera. `camera.setViewOffset` is an alternative.
- For snapped moving objects, save `object.position`, snap it in `snapInv` space (x/y only), render, then restore. `Object3D.onBeforeRender`/`onAfterRender` hooks or a manual loop both work.

Sources: article "Camera" section; <https://git.sr.ht/~denovodavid/3d-pixel-art-in-godot> (`01-camera/part01..03`, `extra01_phantom_camera/camera_3d_texel_snapper.gd`); <https://youtu.be/LQfAGAj9oNQ> (chapters: 00:57 texel grid, 03:00 snapping, 04:10 smoothing, 05:28 snapping moving objects); <https://youtu.be/jguyR4yJb1M>; <https://youtu.be/d6tp43wZqps>; r/godot 14as2b9, 17l7ycn.

---

## 2. Outlines and convex edge highlights

### 2.1 What and why
- **Outlines:** one-pixel dark lines on object silhouettes, where depth jumps.
- **Edge highlights:** one-pixel light lines on **convex (outward-facing) creases only**, never on concave ones. "The difference between the t3ssel8r style and everything else I've seen is only outward-facing edges are highlighted, which was the most elusive part" (r/godot 11io9of).
- The article says: "depth texture is mainly used to generate the object outlines, while the normals texture helps with highlighting edges". It uses a 4-neighbour (up/down/left/right) kernel for one-pixel lines, and convexity "by taking the cross product of neighbouring texels, and grading it against a number of arbitrary heuristics".
- **It is not a post-process.** He started as a full-screen post effect, then moved to **per-object materials** that read the depth+normal prepass, "to integrate it more with lighting" (r/godot 14pcb2t, 1adijs5). Benefits:
  - Per-material control, e.g. grass and trees get no outline material.
  - The outline is drawn on the foreground object's pixels.
  - The `light()` function can lighten or darken lines by shadow. He passes `varying float edge` (0/1) from `fragment()` to `light()` "and selectively lighten or darken based on the attenuation and light intensity" (r/godot 170b2yj). This needs at least one light.
- Limits, in his words: "not sure it's quite possible to create a perfect outline shader that works for all models and all camera angles at this low resolution". It works best on low-poly models with clear outer edges. Parameters need per-scene tuning. Models need "a certain max level of detail and minimum edge angle".

### 2.2 Exact algorithm [src: `02-lines/object_showcase/outline_and_edge.gdshader`, Godot 4.4]
Inputs: `depth_texture` (hint_depth_texture, nearest) and `normal_roughness_texture` (view-space normal, `xyz*2-1`, nearest).

Five samples. `offset[] = {(-1,0), (0,-1), (0,0), (0,1), (1,0)}`, with index 2 as the centre. `SCREEN_UV` in Godot is **top-left origin, y down**.
```glsl
uniform float depth_threshold = 0.25;              // [src] view-space metres (ortho -> linear)
uniform float depth_normal_threshold = 0.5;        // [src]
uniform float depth_normal_threshold_scale = 2.0;  // [src]
uniform float convex_threshold = 0.5;              // [src]
uniform float convex_normal_threshold = 0.5;       // [src] default; mat_lines.tres overrides -> 1.0
uniform float convex_normal_threshold_scale = 2.0; // [src] default; mat_lines.tres overrides -> 0.0

vec3 view_from_screen(vec2 uv){ vec4 p = INV_PROJECTION_MATRIX * vec4(uv*2.0-1.0, textureLod(depth_texture,uv,0.0).r, 1.0); return p.xyz/p.w; }
float remap(float v,float l1,float h1,float l2,float h2){ return l2 + (v-l1)*(h2-l2)/(h1-l1); }

for i in 0..4: pos[i] = view_from_screen(SCREEN_UV + offset[i]/VIEWPORT_SIZE);
               norm[i] = texture(normal_roughness_texture, uv).xyz*2.0-1.0;

// depth threshold grows on surfaces oblique to the camera (ortho: norm.z == dot(n, -view_forward))
float depth_bias  = remap(max(depth_normal_threshold, 1.0 - norm[2].z), depth_normal_threshold, 1.0, 1.0, depth_normal_threshold_scale);
float depth_thresh = depth_threshold * depth_bias;            // 0.25 .. 0.5 m
// convex threshold shrinks on oblique surfaces
float convex_bias  = remap(min(norm[2].z, convex_normal_threshold), 0.0, convex_normal_threshold, convex_normal_threshold_scale, 1.0);
float convex_thresh = convex_threshold * convex_bias;

// ===== edge (convex highlight) =====
float is_edge = 0.0;
for i != 2:
   vec3  cp = cross(norm[2], norm[i]);
   float convexity = dot(cp, vec3(offset[i].yx, 0));         // signed: >0 => convex across this neighbour
   float norm_bias = i < 2 ? 1e-5 : 0.0;                      // tie-break: up/left neighbour wins
   is_edge += ( abs(pos[i].z - pos[2].z) < depth_thresh       // same surface-ish (not a silhouette)
             && norm[i].z + norm_bias > norm[2].z            // draw on the MORE oblique side -> exactly 1px
             && convexity > convex_thresh ) ? 1.0 : 0.0;
EMISSION = is_edge > 0.0 ? edge_color : EMISSION;

// ===== outline (silhouette) =====  (overrides edge)
EMISSION = (pos[2].z - pos[0].z > depth_thresh || pos[2].z - pos[1].z > depth_thresh ||
            pos[2].z - pos[3].z > depth_thresh || pos[2].z - pos[4].z > depth_thresh) ? outline_color : EMISSION;
```
How it works:
- **Silhouette.** View space looks down −Z, so `pos.z` is negative. `pos[2].z - pos[i].z > t` means the **centre is nearer than a neighbour** by more than t. The outline pixel is therefore the foreground object's border pixel, an inner silhouette line.
- **Convexity sign.** Take a right neighbour, offset (1,0), so the axis is (0,1,0). Then `convexity = (n_c × n_i).y = n_c.z·n_i.x − n_c.x·n_i.z`. With a camera-facing centre n_c=(0,0,1) and a right neighbour tilted right (+x), the result is > 0, which is convex. For the vertical case the y-down `SCREEN_UV` and the y-up view space cancel correctly (see the three.js note below).
- **One-pixel placement.** Of the two pixels flanking a crease, the line goes on the one whose normal is *less* camera-facing. The `1e-5` bias breaks ties so exactly one side wins.
- **Material values in the showcase** (`mat_lines.tres`, [src]): albedo 0.75 grey, outline_color blue, edge_color red, depth_threshold 0.25, depth_normal_threshold 0.5, depth_normal_threshold_scale 2.0, convex_threshold 0.5, **convex_normal_threshold 1.0**, **convex_normal_threshold_scale 0.0**. With those overrides, `convex_thresh = 0.5 * norm[2].z`.
- **Scene for these values:** ortho size 10, 322×182, far 100, camera 20 m away, pitch 30°.

**"but_more" variant** (`outline_and_edge_but_more.gdshader`, [src]). It "reduces false positives for the convex edges". It is more expensive and only worth it if edges and outlines are coloured differently.
- Uses a **3×3** neighbourhood. `offset = (i%3-1, i/3-1)`, centre index 4. Cardinal neighbours are i = 1, 3, 5, 7. The tie-break is `i < 4`.
- Depth threshold uses Roystan's form: `n01 = clamp((1-n.z - dnt)/(1-dnt), 0, 1); depth_thresh = depth_threshold * (n01*depth_normal_threshold_scale + 1)`. That gives a range of 1..3×, not 1..2×.
- `edge[i] = dot(cross(n4, n_i), vec3(offset.yx, 0))` is computed for all 9 neighbours.
- Concave vote: `concave += step(concave_threshold, -edge[i]) * step(pos[i].z - pos[4].z, concave_depth_threshold)`.
- Convex test over the cardinals with `edge[i] > convex_threshold`. Then `is_edge = concave > 0 ? 0 : is_edge`, i.e. **suppress the highlight if any neighbour is concave**.
- Parameters: `convex_threshold = 0.1`, `concave_threshold = 0.01`, `concave_depth_threshold = 0.5`. The depth/normal thresholds are as above.

For comparison, the Roystan baseline that he "started as a port of" ([src], <https://roystan.net/articles/outline-shader/>):
- Roberts cross on diagonal samples (`halfScaleFloor/Ceil` of `_Scale = 1`).
- `edgeDepth = sqrt(d0² + d1²) * 100` with non-linear depth. `depthThreshold = _DepthThreshold(1.5) * depth0 * normalThreshold`.
- `NdotV = 1 - dot(n, -viewDir)`, `normalThreshold01 = saturate((NdotV - 0.5)/(1 - 0.5))`, `normalThreshold = normalThreshold01 * 7 + 1`.
- `edgeNormal = sqrt(dot(dn0,dn0) + dot(dn1,dn1)) > 0.4`, then `edge = max(edgeDepth, edgeNormal)`.
- Holland's own explanation of the "blue filled faces at shallow angles" artefact: they come from this depth-threshold scheme (r/godot 170b2yj).

### 2.3 three.js version
Prepass: render the depth plus **view-space normals** for the same low-res size, nearest, no MSAA.
- Option A (simple): `scene.overrideMaterial = new THREE.MeshNormalMaterial({flatShading})` into an RT with `depthTexture`. `MeshNormalMaterial` writes `packNormalToRGB(viewNormal)` = n*0.5+0.5, the same encoding as Godot.
  - 8-bit normals may be too coarse for the cross-product heuristics. Use `type: HalfFloatType` [suggested], or a custom normal material writing raw `normal` to a float target.
- Option B: MRT (`new WebGLRenderTarget(w,h,{count:2})`) with a custom `layout(location=1) out vec4 gNormal`.
- **Choose what goes in the prepass with layers.** Excluding grass and leaves fixes his "grass harshly outlined by god-ray depth fade" problem (§7) and stops grass from breaking outlines. The cost is that grass no longer occludes outline tests, which is usually fine.

Per-object material fragment shader (GLSL ES 3.0, `ShaderMaterial` or `onBeforeCompile`):
```glsl
uniform sampler2D tDepth, tNormal;
uniform vec2  resolution;              // prepass size (642,362)
uniform mat4  projectionMatrixInverse; // three.js provides camera.projectionMatrixInverse
uniform float depthThreshold, depthNormalThreshold, depthNormalThresholdScale;
uniform float convexThreshold, convexNormalThreshold, convexNormalThresholdScale;
varying float vEdge; // or compute inline before lighting

vec3 viewPos(vec2 uv) {
  float d = texture(tDepth, uv).r;                  // [0,1] window depth (NOT reversed in default three.js)
  vec4 p = projectionMatrixInverse * vec4(uv*2.0-1.0, d*2.0-1.0, 1.0);   // GL NDC z in [-1,1]
  return p.xyz / p.w;
}
vec3 viewNormal(vec2 uv) { return normalize(texture(tNormal, uv).xyz * 2.0 - 1.0); }

void main() {
  vec2 uv0 = gl_FragCoord.xy / resolution;          // y-UP in GL!
  // order: left, down, centre, up, right   (GL y-up; "down" = (0,-1))
  const vec2 OFF[5] = vec2[5](vec2(-1,0), vec2(0,-1), vec2(0,0), vec2(0,1), vec2(1,0));
  vec3 P[5]; vec3 N[5];
  for (int i=0;i<5;i++){ vec2 uv = uv0 + OFF[i]/resolution; P[i]=viewPos(uv); N[i]=viewNormal(uv); }
  float dBias = mix(1.0, depthNormalThresholdScale,
                    (max(depthNormalThreshold, 1.0-N[2].z) - depthNormalThreshold) / (1.0-depthNormalThreshold));
  float dT = depthThreshold * dBias;
  float cBias = mix(convexNormalThresholdScale, 1.0, min(N[2].z, convexNormalThreshold)/convexNormalThreshold);
  float cT = convexThreshold * cBias;
  float edge = 0.0;
  for (int i=0;i<5;i++){ if (i==2) continue;
    vec3 cp = cross(N[2], N[i]);
    // Godot used vec3(off.yx,0) with y-DOWN screen offsets; with y-UP offsets flip the x term:
    float convexity = dot(cp, vec3(-OFF[i].y, OFF[i].x, 0.0));
    float bias = (i==0 || i==3) ? 1e-5 : 0.0;       // tie-break left & UP (Godot's i<2 was left & up in y-down)
    edge += (abs(P[i].z-P[2].z) < dT && N[i].z + bias > N[2].z && convexity > cT) ? 1.0 : 0.0;
  }
  bool outline = any(greaterThan(vec4(P[2].z-P[0].z, P[2].z-P[1].z, P[2].z-P[3].z, P[2].z-P[4].z), vec4(dT)));
  // ... compute toon lighting (section 3) -> col, light01
  // [suggested] light-aware lines: highlight brighter in light, subtler in shadow; outline darker
  // col = outline ? col*outlineDarken : (edge>0.0 ? mix(col, col*edgeBrighten, light01) : col);
}
```
Translation issues:
- **Depth decode.** Godot 4.3+ uses Vulkan NDC z∈[0,1] with reversed-Z, which is why its code passes the raw depth. three.js WebGL uses z∈[-1,1], so use `d*2-1`. If `renderer.reversedDepthBuffer`/logarithmic depth is enabled, adapt.
  - For ortho you can skip the matrix: `#include <packing>` and `viewZ = orthographicDepthToViewZ(d, near, far)`. View x/y follow from the fragment.
  - Only **z** is used in the comparisons. Ortho depth is linear, so thresholds are in metres.
- **Screen y flip.** Godot `SCREEN_UV` is y-down and `gl_FragCoord` is y-up. As derived above, the convexity axis becomes `(-off.y, off.x, 0)`. Unit-test it with a cube: highlights must appear on the convex box edges and never in the inner corner of an L-shape.
- **Normals in view space.** `MeshNormalMaterial` matches Godot's view-space normals (+Z toward the camera). For an ortho camera, `N.z = dot(n, toCamera)` exactly, as noted in his comment.
- **Reading the prepass from the main pass** is legal because they are different textures. Don't sample the depth buffer currently bound for writing.
- **Pixel centre.** `gl_FragCoord.xy` is already at the texel centre (x+0.5), so `uv0` hits the prepass texel exactly when both targets have the same size.
- Optional post-process version: run the same code in a full-screen pass, and read a material-ID or mask channel to skip grass, water and sky.

Sources: article "Outlines"; <https://git.sr.ht/~denovodavid/3d-pixel-art-in-godot/tree/master/item/02-lines/object_showcase/outline_and_edge.gdshader> and `outline_and_edge_but_more.gdshader`, `mat_lines.tres`; r/godot 11io9of, 170b2yj, 14pcb2t, 1adijs5; <https://roystan.net/articles/outline-shader/>; <https://imgur.com/gallery/qwhbHQq> (t3ssel8r: "highlight the outward-facing edges, and darken the outlines … depth pass and normal pass … get every edge pixel exactly perfect"). Alternative that highlights both convex and concave edges: <https://godotshaders.com/shader/3d-pixel-art-outline-highlight-post-processing-shader/>.

---

## 3. Toon lighting: smoothed bands, special directional handling, normal noise

### 3.1 What and why
- "It's toon lighting! Nothing particularly special". The direct light is "clean, flat, and minimal".
- The **directional light is handled differently** from other lights: its attenuation is smoothed "to avoid some of the shadow flickering of a slow moving sun".
- **Normal noise** "to help with shadow popping on flat surfaces".
- Lighting is integrated with the lines (§2).
- 2025 comment: "smooth shading can look odd, but sharp shadows can cause flickering, due to the low resolution; it's a balancing act" (Bluesky 3lr64up6mhk2l).
- t3ssel8r's description: "each material has an adjustable highlight, midtone, and shadow color, and some settings for how smoothly to blend between the different colors" (imgur).

### 3.2 Algorithm
Base: CaptainProton42 FlexibleToonShaderGD, which he started from and rewrote several times (r/godot 1adijs5). Its `light()` [src]:
```glsl
float attenuation = use_attenuation ? ATTENUATION.x : 1.0;   // shadow * distance attenuation
float NdotL = dot(NORMAL, LIGHT);
float diffuse_amount = (NdotL + (attenuation - 1.0) + wrap) * steepness;   // shadow subtracts, not multiplies
float cuts_inv = 1.0 / float(cuts);
float diffuse_stepped = clamp(diffuse_amount + mod(1.0 - diffuse_amount, cuts_inv), 0.0, 1.0);
DIFFUSE_LIGHT += ALBEDO * LIGHT_COLOR / PI * diffuse_stepped;   // or * texture(ramp, vec2(diffuse_stepped,0))
// optional: specular = step(0.5, pow(NdotH, shininess^2)); rim = pow(1-NdotV, rim_width)
```
Defaults [src]: `cuts = 3` (example material 2–3), `wrap = 0`, `steepness = 1`, `specular_shininess = 16`, `rim_width = 8`. README: with `use_attenuation`, "set wrap to a slightly negative value (e.g. -0.1)".

Holland's smoothed stepping (r/godot 14as2b9, verbatim structure [src]):
```glsl
for (int i = 0; i < cuts; ++i) {
    int cut = max(0, i + cut_mod);                    // cut_mod = 1 bumps an object up one band (accent grass, raised leaves)
    float val = 1.0 - (float(cut) / float(cuts));
    diffuse_stepped += smoothstep(val - smooth, val + smooth, diffuse_amount);
}
diffuse_stepped /= float(cuts);
```
- "I use lerp/smoothstep to subtly blend between each step of the toon shader. Likewise, the cloud noise is not perfectly sharp, which helps with flickering" (Bluesky 3lzcin4wco22u).
- Directional-only extras: cloud attenuation (§4) is mixed into `ATTENUATION` only `if (LIGHT_IS_DIRECTIONAL)`.
- `smooth` value: not given. **[suggested]** 0.02–0.05 in `diffuse_amount` units.
- Normal noise: no formula given. **[suggested]** `N = normalize(N + (noise3(worldPos * 4.0) - 0.5) * 0.15)` using world-space, low-frequency, static noise, so the noise doesn't swim with the camera.

### 3.3 three.js version
Write a custom `ShaderMaterial` (`lights: true`, `fog` optional) that includes three's shadow chunks rather than patching `MeshToonMaterial`. `MeshToonMaterial` uses a gradientMap per light, with no shadow subtraction and no smoothstep bands.
```glsl
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
uniform int cuts; uniform float wrap, steepness, smoothW; uniform int cutMod;
uniform vec3 shadowCol, midCol, lightCol;   // t3ssel8r-style 3-colour ramp [suggested alternative to ramp texture]

float toonBands(float x) {
  float s = 0.0;
  for (int i = 0; i < 8; i++) { if (i >= cuts) break;
    float val = 1.0 - float(max(0, i + cutMod)) / float(cuts);
    s += smoothstep(val - smoothW, val + smoothW, x);
  }
  return s / float(cuts);
}
void main() {
  vec3 N = normalize(vNormal);                         // view space in three.js
  DirectionalLight dl = directionalLights[0];          // .direction is VIEW space (points toward light)
  float shadow = 1.0;
  #if NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow s = directionalLightShadows[0];
    shadow = getShadow(directionalShadowMap[0], s.shadowMapSize, s.shadowIntensity, s.shadowBias, s.shadowRadius, vDirectionalShadowCoord[0]);
  #endif
  shadow *= getCloudAttenuation(vWorldPos);            // section 4
  float amt = (dot(N, dl.direction) + (shadow - 1.0) + wrap) * steepness;
  float b = toonBands(amt);
  // 3 colours: shadow -> mid -> light
  vec3 col = b < 0.5 ? mix(shadowCol, midCol, b*2.0) : mix(midCol, lightCol, b*2.0-1.0);
  gl_FragColor = vec4(col * dl.color, 1.0);
}
```
Notes:
- The `getShadow` signature differs between three.js versions. Copy it from the `shadowmap_pars_fragment` chunk in the installed version.
- Use `PCFShadowMap` / `PCFSoftShadowMap` with a small radius. The smoothstep bands then act on a soft shadow edge, which reproduces the "smoothed attenuation".
- Uniform names such as `directionalShadowMap` / `vDirectionalShadowCoord` require the vertex chunks `#include <shadowmap_pars_vertex>` / `<shadowmap_vertex>` and `worldPosition`. See §5 for grass, where that is exactly what gets overridden.

Sources: article "Lighting"; <https://github.com/CaptainProton42/FlexibleToonShaderGD> (`addons/flexible_toon_shader/flexible_toon.shader`); r/godot 14as2b9, 1adijs5; Bluesky 3lzcin4wco22u, 3lr64up6mhk2l; <https://imgur.com/gallery/qwhbHQq>.

---

## 4. Cloud shadows (`get_cloud_attenuation`)

### 4.1 What and why
Soft, drifting shadow blobs break up flat colour regions and make the grass boundaries "come alive" (t3ssel8r). With stepped lighting they produce multiple shadow opacities: "The cloud shadows steps are just another artifact of the lighting model".

### 4.2 Algorithm [src, verbal]
- "a noise texture set up as a **global shader uniform** and incorporated into the lighting model via convenient shader includes. I have a `get_cloud_attenuation(some_world_pos)` function to abstract away the cloud projection" (article).
- "a global gradient noise texture that gets sampled in world space in the light function for every material. This only happens if `LIGHT_IS_DIRECTIONAL` and gets mixed in with the regular `ATTENUATION`" (r/godot 14as2b9).
- "sampled in the light function with world space UVs … used as attenuation for my custom toon shading" (Bluesky 3lz7z5vycqc2f). The noise is "not perfectly sharp".
- Not given: the projection, scale, speed, or remap. **[inferred/suggested]** Project along the sun direction onto a horizontal cloud plane, so shadows are consistent with the sun angle, and scroll with the wind:
```glsl
uniform sampler2D tCloud;           // tileable gradient/perlin noise, LinearFilter, RepeatWrapping
uniform vec3  sunDirW;              // world, pointing TOWARD the sun
uniform float cloudHeight;          // [suggested] 30.0
uniform float cloudScale;           // [suggested] 0.02 (1 tile per 50 m)
uniform vec2  cloudWind;            // [suggested] vec2(0.4, 0.15) m/s
uniform float cloudCover, cloudSoft;// [suggested] 0.5, 0.15
uniform float time;
float getCloudAttenuation(vec3 wp) {
  vec3 p = wp + sunDirW * ((cloudHeight - wp.y) / max(sunDirW.y, 0.05)); // march up toward sun to cloud plane
  float n = texture(tCloud, p.xz * cloudScale + cloudWind * cloudScale * time).r;
  return mix(1.0, 0.0, smoothstep(cloudCover - cloudSoft, cloudCover + cloudSoft, n)); // 1 = clear sky
}
```
- In the toon formula, use `shadow * cloud`, or `min(shadow, cloud)`, before the `(attenuation - 1)` term.
- three.js "global uniform": share one `{ value: texture }` object across all materials' `uniforms`. Uniform objects are references, so updating `.value` updates everything.

Sources: article "Lighting"; r/godot 14as2b9 (reaven5312 question); Bluesky 3lz7z5vycqc2f; <https://imgur.com/gallery/qwhbHQq> (slide 6).

---

## 5. Grass billboards lit at the mesh base (LIGHT_VERTEX)

### 5.1 What and why
- Grass is many textured billboard quads that are **"evenly lit to blend in with the terrain"**, with **the same toon shading and colour as the ground at their root**.
- Inside a lighting band they are invisible. They only show where the ground's lighting changes, at shadow edges, cloud edges and band edges. The boundaries become grassy, pixel-art fringes.
- The problem it solves: per-fragment lighting can put half of a billboard in shadow, "which tends to look awful".

### 5.2 Algorithm [src]
Breakdown (r/godot 13rd7gj; r/godot 14as2b9; r/godot 1adijs5; Bluesky 3luqkjwx3vc2a):
- `MultiMeshInstance3D` of quads on the terrain, aligned to the terrain normal. **Shadow casting off.**
- Billboard by rewriting the modelview matrix.
- Alpha-tested grass texture with `depth_prepass_alpha` and `depth_draw_opaque` render modes, "for proper ordering".
- **Lighting at the base:** `LIGHT_VERTEX = model origin in view space` (`MODELVIEW_MATRIX[3].xyz`) and `NORMAL = ground normal` (world up `vec3(0,1,0)` transformed to view for flat ground; baked per instance or sampled from a heightmap otherwise). "You'll need to make sure all your inputs to your lighting model are the same for grass and ground."
  - Before Godot 4.3 he made `VERTEX` writable in `fragment()` (one-line engine patch in `servers/rendering/shader_types.cpp`):
    `varying vec3 model_origin; vertex(){ model_origin = (MODELVIEW_MATRIX*vec4(0,0,0,1)).xyz; } fragment(){ VERTEX = model_origin; }`
  - Godot PR #91136 (merged April 2024, 4.3) added `LIGHT_VERTEX` for this. It moves the position used for light and shadow lookup without moving the fragment.
  - His earliest version sampled the directional shadow map at the quad origin through a custom built-in (`sample_directional_shadow`), which needed an engine recompile.
- **Sway:** "Rotate vertices at ~3 FPS for swaying" (stepped time, for a pixel-art cadence) plus scrolling noise.
- **Accent grass** (flowers): randomly chosen instances are moved "up and towards the camera a little so they don't get overlapped so much" and are "bumped up a cut" (`cut_mod = 1`) in the toon bands.
- **Density:** "I probably had the grass density too high, it can really be more sparse and still have the desired effect" (Bluesky). No number given.
- **Texture:** HD texture, because rotation is done in the shader. Ideally an animated pixel-art texture, sized and snapped to screen texels.

### 5.3 three.js version
This is *easier* in three.js than in Godot. Shadow coordinates are computed in the **vertex** shader from `worldPosition` (`shadowmap_vertex` chunk), so override `worldPosition` with the instance origin just before that chunk. Every vertex of the quad then gets the same shadow coordinate.
```glsl
// vertex shader of an InstancedMesh grass material (ShaderMaterial, lights:true)
#include <common>
#include <shadowmap_pars_vertex>
uniform float time, swayFps, swayAmp;      // [src] ~3 fps ; [suggested] amp 0.08 rad
attribute float aAccent;                   // 0/1 per instance
varying vec3 vNormal; varying vec3 vWorldPos; varying vec2 vUv; varying float vAccent;
void main() {
  vec3 originW = (modelMatrix * instanceMatrix * vec4(0,0,0,1)).xyz;
  // stepped sway
  float t = floor(time * swayFps) / swayFps;
  float a = swayAmp * sin(t * 2.0 + originW.x * 0.7 + originW.z * 0.3) * uv.y; // bend tips only
  // camera-facing billboard (cylindrical): build quad in view space around origin
  vec4 originV = viewMatrix * vec4(originW, 1.0);
  vec2 corner = (position.xy) * vec2(1.0, 1.0);  // quad authored in XY, base at y=0
  corner.x += a * corner.y;
  if (aAccent > 0.5) originV.xyz += vec3(0.0, 0.05, 0.1);   // [suggested] lift toward camera
  gl_Position = projectionMatrix * (originV + vec4(corner, 0.0, 0.0));
  // ---- lighting inputs identical to ground at the root ----
  vNormal = normalize(normalMatrix * vec3(0,1,0));   // or per-instance ground normal attribute (view space!)
  vec4 worldPosition = vec4(originW, 1.0);           // <- LIGHT_VERTEX equivalent for shadows
  #include <shadowmap_vertex>                        // uses worldPosition & a world-space normal for normal bias
  vWorldPos = originW;  vUv = uv; vAccent = aAccent;
}
```
Notes:
- Fragment: `if (texture(tGrass, vUv).a < 0.5) discard;`. Then the **same** toon function as the ground, with `cutMod = int(vAccent)` and `getCloudAttenuation(vWorldPos)`, so that cloud edges also follow the root.
- `castShadow = false`.
- Godot's billboarding is screen-aligned. Cylindrical billboarding (vertical in world) is a design choice for an orthographic, pitched camera. **[suggested]** Screen-aligned in view space, as above, matches Godot `BILLBOARD_ENABLED`.
- Check whether `shadowmap_vertex` also uses `transformedNormal`/`shadowWorldNormal` for normal bias in the installed three.js version. If so, supply the ground normal there too.
- Exclude grass from the outline prepass (§2.3) unless grass is meant to occlude outlines.

Sources: article "Grass"; r/godot 13rd7gj, 14as2b9, 11ma6if, 14eaecy, 1adijs5; Bluesky 3luqkjwx3vc2a, 3lz7z5vycqc2f; Godot PR <https://github.com/godotengine/godot/pull/91136>; <https://medium.com/@ShaderError/godot-custom-shader-built-ins-functions-part-2-3-4a1772c12dfe>; <https://github.com/denovodavid> → `git.sr.ht/~denovodavid/grass` (a separate earlier HD grass-blade experiment, not pixel art, but useful for its wind/bend vertex code).

---

## 6. Water: refraction, ortho planar reflection with oblique projection, wave-line texture

### 6.1 What and why
- Toon water with screen-space refraction, which shows the outlined objects under the water.
- Orthographic **planar reflections**. He found SSR didn't look good.
- **World-space, view-aligned, horizontal one-pixel wave lines** that animate.
- t3ssel8r: "a pretty standard mix of refraction, reflection, and texture displacement… The most important detail … a **single pixel highlight on the border between water and air** … using the same pixel art edge detector".

### 6.2 Algorithm

**Pipeline problems he hit [src]:**
- Objects using the depth/normal textures were forced into Godot's transparent pass, so they were missing from the screen texture used for refraction.
  - First fix: an **extra SubViewport render** for refraction, plus another for reflection, "rendering the scene 2 more times" at over 60 fps on a GTX 1060.
  - Later fix: an engine patch removing the `has_read_screen_alpha` depth/normal condition and moving the depth copy before the opaque pass (r/godot 14pcb2t, 1adijs5).
- In three.js this problem doesn't exist. Render the opaque scene into an RT with colour and depth, then draw the water sampling those textures.

**Refraction** (Catlike Coding, which he lists as a resource [src values]):
```
uvOffset = tangentNormal.xy * _RefractionStrength(0.25); uvOffset.y *= aspect-fix
uv = AlignWithGrabTexel((screenPos.xy + uvOffset)/w)   // floor(uv*size)+0.5 -> stays pixel-exact
depthDiff = LinearEyeDepth(depth(uv)) - surfaceDepth
if depthDiff < 0 (sampled something in FRONT of water): fall back / uvOffset *= saturate(depthDiff)
color = lerp(_WaterFogColor, background(uv), exp2(-_WaterFogDensity(0.1) * depthDiff))
```

**Depth colour and foam** (Roystan toon water [src defaults]):
- Shallow `(0.325, 0.807, 0.971, 0.725)`, deep `(0.086, 0.407, 1, 0.749)`, `_DepthMaxDistance = 1`.
- Noise cutoff `0.777`, scroll `(0.03, 0.03)` UV/s, distortion amount `0.27`.
- Foam distance lerps between `0.4` (max) and `0.04` (min) by `saturate(dot(existingNormal, waterNormal))`.
- `cutoff = saturate(depthDiff/foamDist) * 0.777`, then `foam = smoothstep(cutoff ± 0.01, noise)`. For pixel art use a hard `step` **[suggested]**.

**Holland's own water parameters:**
- "opacity to 0.5 to really show off the fake refractions" in one showcase. Another version used darker, opaque water.
- Depth fade was disabled in that scene because it clashed with the billboard grass underneath.
- The ripples are based on Bramwell's tutorial (<https://www.youtube.com/watch?v=zvoQqhLeans>).
- Everything is artist-controllable: colour, transparency, reflection, refraction amount, ripples, waves (r/godot 14sxi4h).

**Planar reflection with an orthographic camera:**
- Adapted from eldskald's Unity planar reflections plus a custom-projection Godot PR (#84454) merged into his own build.
- The perspective "frustum" approach can't work for ortho: "I need a sheared box" (r/godot 14pcb2t).
- He hit a bug where the custom projection wasn't registered as `is_orthogonal`, which broke lighting in the reflection.
- He renders the reflection camera to a viewport and "slap[s] the texture onto the water plane".
- Oblique near plane for ortho (Aras P., public domain [src]): if `clipPlane = (a,b,c,d)` is in camera space, then
  ```
  q = inverse(P) * (sgn(c.x), sgn(c.y), 1, 1)
  c' = clipPlane * (2 / dot(clipPlane, q))
  P.row2 = c' - P.row3            // i.e. P[2]=c'.x-P[3], P[6]=c'.y-P[7], P[10]=c'.z-P[11], P[14]=c'.w-P[15]
  ```
  This general form works for both perspective and ortho. For ortho, row3 = (0,0,0,1), so row2 = (a, b, c, d−1).

**Wave lines texture** [src: article image + Bluesky 3lnbwgwnbs22p]:
- 512×512 RGBA8, made in Material Maker, tileable **Voronoi** cells.
- **R,G:** "a vector pointing away from the centre of each cell. That way, my shader can extract the horizontal direction relative to the view, even when rotated."
- **B:** "random per cell, used for timing offset of animation."
- **A:** "the distance from the cell centre, used to animate the lines length."
- Measured from the PNG: R,G ∈ [70,184] (≈ 0.5 ± 0.45), B ∈ [2,254], A ∈ [0,255].
- He stayed up until 3 AM on it: "I will not be doing that again". He suggests "maybe using a particle system" would be simpler.

### 6.3 three.js version
Planar reflection for ortho. `three/examples/jsm/objects/Reflector.js` uses Lengyel's **perspective-only** shortcut (`q.x = (sign(c.x) + P[8]) / P[0]`, …). Replace it with Aras' general inverse form:
```js
function obliqueOrtho(P /*Matrix4, column-major like Unity*/, clipPlaneCam /*Vector4*/) {
  const inv = P.clone().invert();
  const q = new THREE.Vector4(Math.sign(clipPlaneCam.x), Math.sign(clipPlaneCam.y), 1, 1).applyMatrix4(inv);
  const c = clipPlaneCam.clone().multiplyScalar(2 / clipPlaneCam.dot(q));
  const e = P.elements;
  e[2] = c.x - e[3]; e[6] = c.y - e[7]; e[10] = c.z - e[11]; e[14] = c.w - e[15];
}
// reflectCam: OrthographicCamera with same frustum; position/target mirrored across plane y=h
// clipPlane (world) = (0,1,0,-h) -> camera space via reflectCam.matrixWorldInverse (use inverse-transpose for planes)
// textureMatrix = bias(0.5) * reflectCam.projectionMatrix * reflectCam.matrixWorldInverse  (as in Reflector)
// Render reflection at the SAME low res (642x362), nearest filtering.
```
Water fragment (ortho):
```glsl
uniform sampler2D tSceneColor, tSceneDepth, tReflect, tWaves;
uniform vec2 resolution; uniform float near, far, texelWorld;  // texelWorld = ORTHO_SIZE/LOW_H
uniform vec3 camRightW, camFwdW;                                // world
varying vec4 vReflCoord; varying vec3 vWorldPos; varying float vViewZ;
void main() {
  vec2 suv = gl_FragCoord.xy / resolution;
  // waves normal (Roystan-style distortion) -> small offset in TEXELS, then re-snap to texel centre
  vec2 offTex = round(distortion(vWorldPos.xz, time) * refrPixels);       // [suggested] refrPixels = 2.0
  vec2 ruv = (floor(suv*resolution) + 0.5 + offTex) / resolution;
  float sceneZ = orthographicDepthToViewZ(texture(tSceneDepth, ruv).r, near, far);
  float depthDiff = vViewZ - sceneZ;                    // >0 when scene is behind the water (view z negative)
  if (depthDiff < 0.0) { ruv = suv; sceneZ = orthographicDepthToViewZ(texture(tSceneDepth, ruv).r, near, far); depthDiff = vViewZ - sceneZ; }
  // NOTE: in ortho, depthDiff is along the view ray; vertical water depth = depthDiff * sin(pitch) [inferred]
  vec3 under = mix(fogCol, texture(tSceneColor, ruv).rgb, exp2(-fogDensity * depthDiff));
  vec3 refl  = textureProj(tReflect, vReflCoord + vec4(offTex/resolution*vReflCoord.w, 0, 0)).rgb;
  vec3 col = mix(under, refl, reflectAmt);
  // ---- view-aligned 1-px wave lines [inferred reconstruction of his texture usage] ----
  vec4 w = texture(tWaves, vWorldPos.xz * waveScale);
  vec2 dirXZ = normalize(w.rg * 2.0 - 1.0);             // points away from cell centre
  float distW = w.a / waveScale * cellRadiusNorm;        // world distance to centre (A is normalised)
  vec2 fwdXZ = normalize(camFwdW.xz), rightXZ = normalize(camRightW.xz);
  float perp  = distW * dot(dirXZ, fwdXZ);               // offset across the screen-horizontal line through centre
  float along = distW * abs(dot(dirXZ, rightXZ));        // half-length position along the line
  float phase = fract(time * waveSpeed + w.b);
  float halfLen = maxHalfLen * sin(phase * 3.14159);     // grow then shrink
  float line = step(abs(perp), 0.5 * texelWorld / sinPitch) * step(along, halfLen);
  col = mix(col, waveCol, line);
  gl_FragColor = vec4(col, waterAlpha);
}
```
The wave-line block above is **[inferred]** and needs testing. The author only described the channel semantics. The idea: a screen-horizontal line through the cell centre is the set of points whose centre offset is parallel to camera-right in XZ, so `perp ≈ 0`. One texel on screen corresponds to `texel/sin(pitch)` metres along ground forward.

Water–air border highlight (t3ssel8r): treat water as a surface in the depth/normal prepass, or run the §2 outline test in the water shader against `tSceneDepth`. **[suggested]** Draw a highlight where `depthDiff` crosses a small threshold within one texel (the shoreline).

Sources: article "Water"; r/godot 14pcb2t, 14sxi4h, 1adijs5; Bluesky 3lnbwgwnbs22p; <https://roystan.net/articles/toon-water/>; <https://catlikecoding.com/unity/tutorials/flow/looking-through-water/>; <https://godotshaders.com/shader/stylized-water-with-depthfade/>; <https://www.youtube.com/watch?v=zvoQqhLeans>; <https://github.com/eldskald/planar-reflections-unity>; <https://aras-p.info/texts/obliqueortho.html>; <https://www.terathon.com/lengyel/Lengyel-Oblique.pdf>; Godot PR <https://github.com/godotengine/godot/pull/84454>; wave texture <https://www.davidhol.land/articles/3d-pixel-art-rendering/3d-pixel-art-water-procedural-wave-texture.png>.

---

## 7. Volumetric god rays: light-aligned planes that sample the shadow map

### 7.1 What and why
- Layered "slices of light" that read as atmospheric scattering. This is the main depth cue in an otherwise flat look: "it can be hard to add a sense of depth … without it looking too 3D, which is why I spent much effort on the god-rays" (Bluesky).
- t3ssel8r's description: "sampling the light space depth map … based on world-space coordinates of a series of parallel planes aligned with the light direction to test whether each position is shadowed."
- Acerola noted it is essentially shell texturing.

### 7.2 Algorithm [src: article + r/godot 17cs6wv + Bluesky thread and diagram]

**v1, geometry (2023):**
- MultiMesh quads. The vertex shader finds the nearest plane, places the quad's x/y at the screen corners, and **solves for z on that plane**.
- In `light()`, `ATTENUATION` (the shadow) drives `ALPHA`.
- Add a depth fade, and fade instances in/out as the camera moves and rotates.
- Problem: the depth fade "harshly outline[d] individual tufts of grass" because grass is in the depth buffer. The fix was a **box blur of depth, radius ~7 px**, which needed **at least 10 planes**. At 640×360 that was too expensive, because the blur ran per plane.

**v2, one full-screen post-process (2025):**
- "a mathematically defined plane in world space that is **parallel to the sun direction**; in view space, using the x/y coords of the current fragment, I solve for z to get a point on the plane; I check the shadow attenuation at that point … colouring the fragment if lit; then ray march a few more times using a defined gap to create the layers of light."
- The depth blur now runs once. Cost is about **1.7 ms on a GTX 1060 laptop**.
- Diagram details:
  - A world **origin** and **origin plane normal** define a family of parallel planes spaced by **gap**.
  - The march starts at an **arbitrary view-space start depth**.
  - The "distance to origin plane" modulo gap (the "distance error") gives where the **first plane point** lies.
  - Then it steps plane to plane along the view ray.
- World-anchored planes don't swim when the camera translates.

**Formulas [inferred from the diagram]:**
- Ortho ray: `R(t) = P0 + t·F`, where P0 is the fragment on the start-depth plane and F is the camera forward.
- Plane family: `dot(X − O, n) = k·gap`, with n ⊥ L (the sun direction lies within each plane).
- `s0 = dot(P0 − O, n)`; `k0 = ceil(s0/gap)` (direction-dependent); `t_k = (k·gap − s0) / dot(F, n)`; `Δt = gap / |dot(F, n)|`.
- Choose `n = normalize(F − dot(F, L)·L)`. This is the component of the view direction perpendicular to the sun, so planes face the camera as much as possible and `dot(F, n)` is maximised [suggested].
- For each of N planes: if `t_k < sceneDepth_blurred(t)`, accumulate `lit(R(t_k)) · fade`, with `fade = smoothstep(0, fadeDist, sceneDepthBlurred − t_k)` (the depth fade).

### 7.3 three.js version
```glsl
// full-screen pass at low res; inputs: blurred linear depth (one 7px box blur pass, separable), shadow map
uniform sampler2D tDepthBlur;      // linear view distance along forward (metres), box-blurred r≈7 [src]
uniform sampler2D tShadow;         // directionalLight.shadow.map.texture (or .depthTexture, version-dependent)
uniform mat4 shadowMatrix;         // directionalLight.shadow.matrix  (world -> shadow UV/depth, includes bias)
uniform mat4 camWorld;             // camera.matrixWorld
uniform vec2 orthoHalf;            // (right, top) of ortho frustum
uniform vec3 O, n, F, L;           // world: plane origin, plane normal (⊥L), cam forward, sun dir
uniform float gap, startDepth, fadeDist, intensity; uniform int N;   // [src] N>=10 ; others [suggested]
uniform vec3 rayCol;

float litAt(vec3 wp) {
  vec4 sc = shadowMatrix * vec4(wp, 1.0);  sc.xyz /= sc.w;
  if (any(lessThan(sc.xy, vec2(0))) || any(greaterThan(sc.xy, vec2(1)))) return 1.0;
  float d = unpackRGBAToDepth(texture(tShadow, sc.xy));   // or texture(depthTex).r for depth-texture shadow maps
  return step(sc.z - 0.002, d);                            // hard test -> crisp slices
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  vec3 P0 = (camWorld * vec4((uv*2.0-1.0)*orthoHalf, -startDepth, 1.0)).xyz;   // ortho ray origin
  float sceneT = texture(tDepthBlur, uv).r - startDepth;   // distance along F to blurred geometry
  float fn = dot(F, n);  if (abs(fn) < 1e-3) { gl_FragColor = vec4(0); return; }
  float s0 = dot(P0 - O, n);
  float k  = (fn > 0.0) ? ceil(s0 / gap) : floor(s0 / gap);
  float t  = (k*gap - s0) / fn, dt = gap / abs(fn);
  float acc = 0.0;
  for (int i = 0; i < 32; i++) { if (i >= N || t > sceneT) break;
    float fade = smoothstep(0.0, fadeDist, sceneT - t);    // soft intersection with world
    acc += litAt(P0 + F*t) * fade;
    t += dt;
  }
  gl_FragColor = vec4(rayCol * acc * intensity, 1.0);      // composite additively over the scene
}
```
Translation issues:
- **Shadow-map access.** Godot needed an engine patch (`sample_directional_shadow()`). three.js exposes `light.shadow.map` and `light.shadow.matrix` directly.
  - Depending on the three.js version, the shadow map stores RGBA-packed depth (`unpackRGBAToDepth`) or uses a depth texture with comparison sampling (`sampler2DShadow`). Check `light.shadow.map.depthTexture` in your version.
  - Cascades are not built in. A single ortho shadow camera covering the view is enough for a small isometric scene.
- **Grass in the depth buffer** was the reason for the blur. In three.js you can keep grass and leaves out of the depth prepass entirely (layers), so a smaller blur radius, or none, may work [suggested].

Sources: article "Volumetric Lighting" + 2025 update; Bluesky <https://bsky.app/profile/davidhol.land/post/3lpxxvmmeck2y> (3 posts + diagram); r/godot 17cs6wv; t3ssel8r's comment on <https://www.youtube.com/watch?v=fSNdZ82I-eQ>; Acerola <https://youtu.be/9dr-tRQzij4>, <https://youtu.be/O-2viBhLTqI>.

---

## 8. Trees: billboard leaf instances on Poisson-disk surface samples

### 8.1 What and why
A fluffy pixel-art canopy whose lighting reads as one volume, with brighter "clumps".

### 8.2 Algorithm [src: r/godot 1adijs5, 19f4j7k; Bluesky 3luqmibnuu227; paste]
- Trunk: a cylinder with the standard toon shader. Canopy: a **dome mesh** with toon shader, plus **~1000 billboard leaf quads** (MultiMesh) placed at Poisson-disk points on the dome. The leaves use a pixel-art texture.
- Leaf shader = grass shader:
  - `LIGHT_VERTEX` = instance origin, `NORMAL` = the sampled surface normal baked into the instance ("I sample positions/normals on a mesh and pass that into the multimesh").
  - Based on smooth noise, some leaves are **pushed outward**, `VERTEX += MODELVIEW_NORMAL_MATRIX[2] * some_scalar`, and **stepped up one lighting cut**. This creates clumps and volume.
- Cost note: "expensive due to the number of billboard instances", but few trees fit on screen. Possible optimisation: bake leaf normals into the dome and keep only raised leaves as quads.

**Poisson-disk sampling on a mesh** (C++ module, multithreaded, after Medeiros et al. and Bowers et al.; numbers [src]):
1. `init`: build per-triangle `cumulative_areas`.
2. Oversample: `expected = 2·A·0.75² / (√3·r²)`, `n_over = density · expected`. Each sample picks a triangle by binary search on the cumulative area. Barycentric `r1 = √u₁, r2 = u₂`, `P = (1−r1)·a + r1(1−r2)·b + r1·r2·c`.
3. Grid cell size = `2r/√3`, so the cell diagonal is 2r and a cell can hold at most one sample. Sort samples by cell id. Use a hash map from cell to start index.
4. **27 phase groups** by `(cx%3, cy%3, cz%3)`. Phases run sequentially and cells within a phase run in parallel. Each cell tries up to `ceil(density)` of its candidates and accepts the first that is ≥ r from the accepted samples in all 26 neighbour cells.
5. Example: ~120,000 candidates → ~12,000 points (~10%) in ~25 ms.

### 8.3 three.js version
- Use an `InstancedMesh` of quads with a per-instance `aNormal` (vec3) and `aRaise` (float) attribute. Reuse the §5 vertex shader, with `vNormal = normalMatrix * aNormalWorld` and `worldPosition = instance origin`.
- Raise: `originV.xyz += normalize((viewMatrix * vec4(aNormalWorld,0)).xyz) * raise * aRaise`. Note that Godot's `MODELVIEW_NORMAL_MATRIX[2]` is the instance's local Z axis in view space, so he pushes along the quad's facing axis.
- `aRaise` comes from a smooth 3D noise on the sample position, thresholded **[suggested 0.6]**. `cutMod = 1` when raised.
- Sampling in JS: a single-threaded port of the above is fine offline or at load time. For a few thousand points, the simple dart-throwing version (area-weighted random → reject if within r of an accepted point, using a hash grid of cell size `r/√3`) is enough. `MeshSurfaceSampler` from `three/examples/jsm/math/MeshSurfaceSampler.js` provides the area-weighted step.

Sources: article "Tree"; <https://paste.sr.ht/~denovodavid/0eeca82f517b5d4d2dea6e5718a04361840be523> (point_sampler.h/.cpp); r/godot 1adijs5, 19f4j7k; Bluesky 3luqmibnuu227.

---

## 9. Night, rain, and particles

### 9.1 What and why
- **Night:** "changing the color of the directional light, adding a vignette, and most importantly a **film grain** shader". From reddit: "Turning the sun blue, lowering the intensity, and adding a vignette" (r/godot 1adijs5).
- t3ssel8r's night was "swapping a few color palettes and adding a dynamic light".
- **Particles:** "A lot of the work in 3D pixel art is getting 3D effects to look 2D". Real 2D, tiling, looping animated textures come from **Pixel Composer**: rain, water splashes, dust.
- **Rain splash on top surfaces:** "I do depth comparison a few pixels down from the current fragment to see if it's larger than some threshold" (Bluesky 3m724kaiock2r).

### 9.2 Algorithm
No formulas or parameter values are given for any of these. Everything below is **[suggested]**.
```glsl
// post (applied at LOW res so grain is texel-sized and pixel-crisp)
uniform float time, grainAmt /*0.06*/, vignetteAmt /*0.35*/;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
vec3 night(vec3 c, vec2 uvLow, vec2 texel) {
  float g = hash(floor(uvLow / texel) + floor(time * 12.0)) - 0.5;   // 12 fps grain, per low-res texel
  c += g * grainAmt;
  vec2 d = uvLow - 0.5; c *= 1.0 - vignetteAmt * dot(d, d) * 2.0;
  return c;
}
// top-surface mask for rain splashes (per material or post), y-UP GL
float topMask(vec2 uv) {
  float zc = viewZ(uv), zb = viewZ(uv - vec2(0.0, 3.0) / resolution);   // "a few pixels down": 3 [suggested]
  return step(splashDepthThreshold /*0.3 m*/, zc - zb);   // pixel below is much farther -> we're on a top edge
}
```
- **Sprite particles:** use camera-facing quads or `THREE.Points` with flipbook UVs.
  - Size them so one texture texel = one screen texel: `worldSize = texW * ORTHO_SIZE/LOW_H`.
  - Snap their positions in snap space like §1 "snap" objects.
  - Use `NearestFilter`.

Sources: article "Rain, Particles, and the Night"; r/godot 1adijs5, 17l7ycn; Bluesky 3m724kaiock2r; <https://pixel-composer.com/>; <https://imgur.com/gallery/qwhbHQq>.

---

## 10. Quick reference: all numbers found

| Item | Value | Source |
|---|---|---|
| Render res (main) | 640×360, target 642×362 | r/godot 14as2b9, 14eaecy |
| Render res (tutorial) | 320×180, target 322×182 | repo `part02.tscn` |
| Ortho size / far / distance / pitch | 10 m / 50 m / ~20 m / 30° | r/godot 14pcb2t |
| Texel world size | `size / height` (10/360 ≈ 0.0278 m) | repo, r/godot 14as2b9 |
| Orbit | 45° steps, `1-2^(-4·dt·4)` smoothing, snap <0.02 rad | `camera_rig.gd` |
| Outline depth_threshold | 0.25 (view metres) | `outline_and_edge.gdshader` |
| depth_normal_threshold / scale | 0.5 / 2.0 | same |
| convex_threshold / normal_thr / scale | 0.5 / 0.5→1.0 / 2.0→0.0 (mat override) | shader / `mat_lines.tres` |
| "but_more" convex / concave / concave_depth | 0.1 / 0.01 / 0.5 | `outline_and_edge_but_more.gdshader` |
| Roystan outline | depthThr 1.5 (×depth), normalThr 0.4, depthNormalThr 0.5, scale 7 | roystan.net |
| Toon (Flexible) | cuts 3, wrap 0 (−0.1 with shadows), steepness 1, shininess 16, rim 8 | FlexibleToonShaderGD |
| Grass sway cadence | ~3 FPS stepped | r/godot 13rd7gj |
| God rays | ≥10 planes, depth box blur ~7 px, 1.7 ms @ 640×360 on 1060 laptop | article |
| Leaves | ~1000 quads/tree | r/godot 1adijs5 |
| Poisson | ~10% kept (120k→12k, ~25 ms); cell 2r/√3; 27 phases | r/godot 19f4j7k, paste |
| Water wave tex | 512² RGBA Voronoi: RG dir, B rand, A dist | article PNG, Bluesky |
| Roystan water | shallow (.325,.807,.971,.725), deep (.086,.407,1,.749), maxDist 1, cutoff .777, foam .4/.04, scroll .03, distort .27 | roystan.net |
| Catlike water | refraction 0.25, fog density 0.1 | catlikecoding.com |
| Water opacity (showcase) | 0.5 | r/godot 14sxi4h |

---

## Gaps and unknowns

1. **Main-project outline shader not published.** The repo `02-lines` is the cleaned tutorial version (emission colours, no lighting). The lighting-integrated variant in his game ("lighten or darken based on the attenuation and light intensity") is not public. How edges and outlines are tinted by light is unknown.
2. **Toon band details:** `cuts`, `smooth`, `wrap` and `steepness` values for the main scene, and the exact "smoothed directional attenuation" (whether it is smoothstep on shadow or PCF settings), are not given.
3. **Normal noise:** no formula, frequency or amplitude given.
4. **Cloud projection:** `get_cloud_attenuation` internals (vertical vs sun-direction projection, scale, speed, threshold) are not given. §4 is a guess.
5. **Grass:** density, quad size, billboard type (screen vs cylindrical), texture, and noise scroll parameters are not given. Accent "towards camera" offset amount is unknown.
6. **Water:**
   - Wave-line shader code is not published. §6.3 is an inferred reconstruction. Alpha encoding (normalised distance scale) and line-length animation curve are unknown.
   - Reflection blend, fresnel (if any), ripple normal source and refraction strength are unknown.
   - Whether the reflection camera is also texel-snapped (pixel stability of reflections under camera motion) is unknown.
7. **God rays:** plane normal choice (⊥ sun, but which perpendicular), gap, start depth, fade distance, colour/intensity, blend mode (additive vs screen), and how the result is quantised to pixel art are not given. N "≥10".
8. **Shadow settings:** map size, bias, ortho shadow camera extents. He only notes shadow quality depended on the camera far and that he's "not totally happy with how the shadows look".
9. **Film grain and vignette:** no parameters. Grain resolution (low-res texel vs screen pixel) and frame rate are unknown.
10. **Particles:** sizes, spawn and snap behaviour not given. Pixel Composer graphs not published.
11. **Colour and tonemapping:** the tutorial uses ACES (`tonemap_mode = 3`). Palette/quantisation (if any) for the main project is unknown. No evidence of palette reduction or dithering.
12. **Reddit coverage:** fetched via the Arctic Shift archive tree endpoint, which may omit collapsed "load more" replies. Comments outside r/godot weren't searched. The reddit-linked Poisson paste (`e0fd8cc…`) differs from the article-linked one (`0eeca82…`, read here). It may be an earlier revision.
13. **three.js specifics to verify empirically:**
    - The sign of the subpixel shift.
    - The convexity axis flip for y-up UVs.
    - The `getShadow` signature and shadow-map storage format in the chosen three.js version.
    - Whether `shadowmap_vertex` uses a normal-bias term needing the overridden ground normal.
    - Whether 8-bit packed normals are precise enough for the cross-product heuristic (HalfFloat recommended).
14. **The promised "pixel perfect outlines" video** is still unreleased; the repo README marks it "WIP". The author has moved to his own Odin/D3D12/Vulkan engine, so further Godot material is unlikely.
