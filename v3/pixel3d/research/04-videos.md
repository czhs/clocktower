# 04 — Video research: 3D pixel-art rendering techniques

Research date: 2026-10-15. Goal: pull out techniques that a three.js side project can use to reproduce the
"t3ssel8r-style" 3D pixel-art look.

## How the material was accessed

- **Transcripts.** I pulled YouTube auto-captions (ASR, or creator captions where present) with
  `yt-dlp --skip-download --write-auto-subs`, then cleaned them to plain text. ASR text is noisy, so the
  paraphrases below may carry small errors in names and numbers. For "Drawing the Line" I cross-checked
  against the sozai.app transcript mirror, and the two agree.
- **Descriptions, chapters, and comments.** These came from YouTube metadata (title, upload date,
  description, chapter list). For six key videos I also read the top comments and every comment the
  creator wrote.
- **Companion writeups.** I read these:
  - t3ssel8r's imgur breakdown, "Creating a Pixel Art Scene in Realtime 3D"
  - three.js `RenderPixelatedPass.js` source, which is Kody King's merged PR #22322
  - Dylan Ebert's texel-splatting project page, arXiv 2603.14587
  - the godotshaders "3D pixel art outline & highlight" shader, which David Holland and Dylearn use
- **Blocked.** David Holland's source repo at git.sr.ht sits behind an anti-bot challenge, so I did not
  read it.
- **Videos with no voice track.** Most of t3ssel8r's 2020–21 clips are 10–80 s silent demos. For those,
  everything below comes from the description, which is usually a detailed technical paragraph.

Legend for "Access": **T** = full transcript read, **D** = description/chapters only, **C** = comments read,
**W** = companion writeup read.

---

## 1. Red Giraffe — "Pixel Perfect" series (Unity URP, 2026). Most directly useful series.

Channel: youtube.com/@RedGiraffe404 (channel id UCsXS_v8-IzYeyX7zwlXVL9A). Each episode is about 11–13
minutes.

### Ep.1 "The Secret to Crisp 3D Pixel Art Rendering" — https://youtu.be/Mp7eQsiZ_wA (2026-02-15). Access: T, D, C

1. **Two-stage pass: point-sample down, point-sample up.**
   - Render the scene at full resolution.
   - Downsample to a fixed target resolution with a point (nearest) sampler.
   - Upscale to the screen with a point-clamp sampler, so each low-res texel becomes a uniform block of
     screen pixels.
   - Bilinear sampling smears edges and invents colors that never existed in the source, which is the
     "lowered resolution still looks blurry" failure.
   - In the comments, the creator explains why he renders at high resolution first: later passes can use
     the full-resolution image to decide which pixel lands in each low-res cell. Rendering directly at low
     resolution also works. The first stage then reduces to a texture copy.
2. **Quantize to a hand-picked palette, not by clamping RGB.**
   - Use a 16–32 color palette and pick the nearest palette entry per pixel.
   - Euclidean RGB distance is "mathematically right, visually wrong", because RGB is not perceptually
     uniform. The eye is far more sensitive to green.
   - Convert to CIE Lab (linearize, then XYZ, then Lab) and match there.
   - In the comments, the creator says he ships **OKLab**. His shader carries 7 compile-time distance
     modes, including weighted RGB, Euclidean RGB, HSV, and Lab.
3. **The palette is data.** The palette is a small GPU array, so swapping it re-themes the whole game
   (night, mood, and so on).
4. **Inject the pass after opaque geometry**, before any reconstruction or post-processing.

### Ep.2 "Drawing the Line on 3D Pixel Art" — https://youtu.be/TVYu3y2lzYc (2026-03-01). Access: T (YouTube ASR and sozai.app mirror), D, C

Chapters: Color Filter 1:32 · GBuffer 2:33 · Implementation 5:34 · Masking 8:15.

1. **Don't detect edges from color.**
   - Shadows across a flat wall produce false edges.
   - Color can't tell a silhouette from wood grain.
   - Ordinary full-resolution post-process outlines produce **mixels**.
2. **Detect edges in a G-buffer instead.**
   - **Depth:** a sharp jump between neighbors marks a **silhouette**.
   - **Normals:** neighbors at similar depth whose normals diverge mark a **crease**, such as a building
     corner.
   - Combine silhouette and crease into one outline texture, then composite it over the final image.
3. **Linearize depth before thresholding.** Raw depth is non-linear, so one threshold behaves differently
   near and far. Converting to linear eye depth in world units means the same geometric step triggers at
   5 m and at 50 m.
4. **Keep everything on one grid.**
   - Run depth and normals through the same downsample as color.
   - Compute one-texel offsets from the target resolution.
   - Compare only the 4-neighborhood (up, down, left, right) against the object mask.
   - The result is usually exactly one pixel thick and reduces doubled pixels on skewed geometry.
5. **Silhouette beats crease.** A pixel already marked as silhouette can't also become a crease. The
   creator presents this as an artist-like stylistic choice.
6. **Use selective outlines in dense scenes.**
   - Uniform outlines destroy readability, and high-poly meshes spawn crease noise everywhere.
   - Render tagged objects (an outline layer) into a mask render target.
   - Use the color channels to encode which outline algorithm each object gets.
   - Depth-test the mask against the scene depth so only visible pixels are written.
   - Composite with the mask.
7. **Debugging and leftovers.**
   - Visualize depth and normal targets on screen while tuning.
   - In the debug view, blue marks silhouettes and red marks creases.
   - Some popping remains on heavily skewed geometry.
8. **Ideas from comments.**
   - A mesh-ID / surface-ID buffer could give better silhouettes. A curved sphere would need a
     flood-fill threshold.
   - Unused roughness or metallic channels can serve as a per-texel outline-exclusion mask on toon
     materials.

### Ep.3 "How I Created Pixel Art Oceans" — https://youtu.be/RU3EReALbEU (2026-03-22). Access: T, D

Chapters: Depth 1:06 · Refraction 3:44 · Displacement 5:05 · Foam 6:42 · Reflections 8:45.

1. **Planar water**, not volumetric water.
2. **Depth tint.**
   - Water-depth fade = (scene depth − water surface depth), normalized to 0..1.
   - Lerp from a shallow color to a deep color using that value.
   - The result is a continuous gradient, so **water must go through quantization too** or it breaks the
     look.
3. **Refraction.** Offset the screen-color UV by animated noise, scaled by the depth fade. Objects at the
   surface barely wobble, and deeper objects wobble more. Any later layers, such as reflections, inherit
   the distortion.
4. **Waves.** Use coarse vertex displacement: two perpendicular sine waves, the second rotated 90° about
   Y, multiplied together. This gives a "call and response" ebb and flow.
5. **Shore foam.** Where scene depth and water depth are close, draw a band that is **typically one pixel
   thick**. He deliberately does not reuse the outline pass, because a slightly broken shoreline reads as
   more natural.
6. **Surface foam.** Threshold a scrolling noise texture.
7. **Reflections.**
   - Use a planar reflection camera with a reflection matrix built from the plane equation.
   - Add an oblique near-plane projection.
   - Render the reflection camera before the main pass with a lightweight pipeline.
   - Sample the result by screen position and blend by view angle.

### Ep.4 "Volumetric Lighting in Pixel Art?!" — https://youtu.be/fKp-Lg7vAn4 (2026-04-12). Access: T, D

Chapters: Clouds 2:13 · Banding 6:10 · Volumetric Lighting 7:22.

1. **Toon shading quantizes well.** Clear color bands survive palette quantization.
2. **World-space cloud shadows.**
   - Reconstruct each pixel's world position from depth with the inverse view-projection matrix.
   - Intersect a ray toward the sun with a virtual cloud plane at a fixed height.
   - Use hit.xz as UVs into thresholded Perlin noise, scrolled over time.
   - Feed the result into the shadow term so every object receives it.
   - Light cookies are tied to the light's transform and break when the camera rotates. This approach
     doesn't.
3. **Banded partial coverage.** Don't blur cloud edges. Round the noise to fixed steps inside the
   threshold range.
4. **God rays.**
   - Raymarch from the camera to the pixel in N steps, projecting up to the cloud plane at each step.
   - Low step counts give noise, and the usual fix (blur) breaks the pixel look. The creator says this is
     unresolved.
   - Alternative: card or quad-based rays. t3ssel8r projects quads using the sun's shadow map and keeps
     **hard edges** (see section 3).

### Ep.5 "How I solved my biggest pixel art problem" — https://youtu.be/Ua2EXkOmrpA (2026-04-26). Access: T, D, C

1. **Two buckets of games.**
   - "Pixel-perfect": everything lives on the low-res grid.
   - "Sub-texel": pixel-art assets moved with float transforms.
   - A full 3D pixel renderer belongs in the first bucket.
2. **Snap the camera.**
   - Compute the world size of one low-res pixel.
   - Round the camera position to multiples of it.
   - Shimmer stops, but motion becomes blocky steps, and lower resolutions make the steps worse.
3. **Sub-texel smoothing.**
   - Store the rounding error.
   - Render the low-res result into a render texture shown on a plane, viewed by a second presentation
     camera.
   - Offset that plane by the stored error.
   - Motion is smooth and the grid stays locked.
   - Some shimmer remains on surfaces that aren't perpendicular to the camera.
4. **Rotation is "unsolvable" with snapping.** Pixels project onto a sphere, and not all of them can sit
   on grid intervals. Three masking options:
   - a slight **blur** (smudgy)
   - a global **dither** during rotation (washes the image out, but hides crawl)
   - **raising the pixelation** while rotating ("steer into it")

   The creator expects the pixelation option to make it into a game. A cube-map approach (six cameras)
   is noted as too costly. In the comments he points to IndividualKex's texel splatting and says thin
   geometry (seeds, outlines) crawls the worst.
5. **From comments.** Perspective cameras with a narrow FOV, placed far out, worked "surprisingly well".
   He also plans an episode on TAA over past frames.

### Supporting short demos, Red Giraffe — Access: D only

- **Rural Town (Breakdown)**, https://youtu.be/-aep97ftR44. Steps through each render layer. Everything
  is shader-generated, with no hand-drawn sprites.
- **Subtexel Camera (Demo)**, https://youtu.be/p8lHMnN6mTU.

---

## 2. David Holland (@denovodavid)

### "How my 3D PIXEL ART Camera Works" — https://youtu.be/LQfAGAj9oNQ (2023-11-01, Godot 4.2). Access: T, D, C

Chapters: Defining the texel grid 0:57 · Coding the texel snapping 3:00 · Smoothing the movement 4:10 ·
Snapping moving objects 5:28. Source: git.sr.ht/~denovodavid/3d-pixel-art-in-godot (bot-walled). The
description cites aarthificial #20 and t3ssel8r's upscaling shader.

1. **Texel-grid math for an orthographic camera.**
   - Example values: ortho size H = 10 m with "keep height", internal resolution 320×180.
   - Texels per meter: S = 180 / 10 = **18**. Texel size = 1/S m.
2. **Snap function.** `p2 = floor(p1*S + 0.5) / S`, and the snap error is `r = p2 − p1`.
   - Godot's `Vector3.snapped(texelSize)` does the same thing.
   - Snap in **"snap space"**: a frame with an origin and an XY plane tangent to the view. It is like view
     space but only updates when the camera **rotation** changes.
   - Apply r as the camera's h/v **offset** (projection shift), not to its transform.
   - **In three.js:** snap the camera position in camera-local axes, then use
     `camera.setViewOffset` or shift the projection matrix.
3. **Viewport smoothing.**
   - Render into a SubViewport and display it on a Sprite2D.
   - Shift the final image in screen space by −r (converted to screen pixels).
   - Over-render a margin, so the shifted image doesn't expose borders.
4. **Sub-pixel display.** Present the result with t3ssel8r's AA upscaling shader (see 3a). Per a creator
   comment, it keeps texels square at non-integer scales. Plain nearest produces 3×4 "oblong" texels, and
   bilinear is blurry.
5. **Snap moving objects to the same grid.**
   - At end of frame, snap the positions of objects in a "snap group".
   - On `frame_post_draw`, revert them, so the simulation stays continuous and only the render is
     snapped.
6. **Comment answers.**
   - Camera hard-attached to a moving body: snap only the body. The result is stable but less smooth.
   - Animated skinned meshes: don't snap them. Throttle animation and rotation **framerate** instead.
   - Billboards: scale them to the same texel size.
   - Snapping in a vertex shader is possible if you pass the snap-space matrix.
   - Shadow-map texel snapping is unsolved.
   - UI inside the SubViewport gets pixelated. UI outside it stays at full resolution.
7. **"3D pixel art in Godot 4"**, https://youtu.be/AUr0KwFlCuk (38 s, Access: D). t3ssel8r-style outlines
   and edge detection, citing t3ssel8r's imgur breakdown.

---

## 3. t3ssel8r (Unity custom engine, the reference look)

### 3a. "Crafting a Better Shader for Pixel Art Upscaling" — https://youtu.be/d6tp43wZqps (2023-05-26, #SoME3). Access: T, D

Chapters: aliasing problem 0:00 · existing solution (Cole Cecil 2017) 1:18 · first shader 2:49 · box
filter 4:17 · problem 6:07 · solution 7:12 · final shader 8:31 · transparency 10:27.

He uses this shader to **upscale his game's internal render to the display**, and for UI and text.

1. **The aliasing problem.** Nearest-neighbor upscaling aliases at non-integer ratios and under
   stretch or rotation, which is very visible in motion. Bilinear, mip, and aniso filtering kill the
   aliasing but smear the pixels.
2. **Core idea.** Bilinear sampling equals a **one-texel box filter**. To anti-alias correctly you want a
   pixel-sized box. Manipulate the UV so that a bilinear fetch returns the pixel-box average:
   - Convert UV to texel coordinates.
   - Snap to the nearest texel center.
   - Add a narrow interpolation band whose width equals the pixel-to-texel ratio.
   - Convert back to UV.
3. **Arbitrary distortion.** Compute the box size per pixel as `fwidth(texelCoord)`, which is
   |du/dx|+|du/dy| and |dv/dx|+|dv/dy|. That is the axis-aligned bounding box of the pixel footprint.
   - Clamp the box to at most 1 texel, and above 0.
   - Sample with explicit gradients (`textureGrad`) so mips and aniso still work after the UV hack.
4. **Better weighting.** Weight the box center more than the edges. A quadratic window integrates to a
   cubic transition, which is just **`smoothstep`**. The result is cheap and looks better than an
   undersized box.
5. **Transparency.** Use **premultiplied alpha**. With straight alpha, the box averages bleed undefined
   colors from transparent texels.
6. **Cost.** No extra draw calls, VRAM, or texture samples.
7. **For three.js.** Use this as the final blit from the low-res render target to the canvas. It allows
   smooth sub-pixel camera offset and arbitrary window sizes. Set `LinearFilter` on the low-res target,
   because the shader does the sharpening.

### 3b. "Creating a Scene for my 3D Pixel Art Game" — https://youtu.be/ERA7-I5nPAU (2020-11-15, 1.39 M views). Access: T, D, C. Companion: imgur "Creating a Pixel Art Scene in Realtime 3D" (W)

**Asset pipeline (Blender):**

- Stairs: an array modifier on a stretched cube.
- Rocks: subsurf cube, then procedural displacement, then remesh or decimate.
- Bricks: procedural detailing.
- Trees: cylinders with merged spheres. Leaves get random displacement plus **edited normals** for
  better lighting.
- Unity bakes the modifiers on import. The whole scene took about 2 hours.

**From the imgur writeup:**

- Model aligned to **45°** whenever possible, which reads well in iso pixel art.
- Unity terrain plus a sun for crisp directional light.
- Per-material **toon shader** with highlight, midtone, and shadow colors plus a blend-smoothness
  setting.
- **Grass sprites scattered at play time.** Each is shaded with the **terrain's** toon color, so color
  boundaries get broken up by a grassy pattern.
- **Procedural shadows draped over the scene** to fake cloud or canopy cover.
- **Outlines:**
  - Depth and normal passes drive edge detection that highlights outward-facing edges and darkens
    outlines.
  - In his words, the main challenge is getting "every edge pixel exactly perfect". Lines must be clean
    and **single-pixel** for every shape and orientation.
- **Water:** refraction, reflection, and displacement. The key detail is a **single-pixel highlight on
  the water/air border**, drawn with the same edge detector.
- **Night version** made by swapping palettes and adding one dynamic light.

**Pinned FAQ:** the engine is not for sale or tutorial. The technique notes live in the older video
descriptions, summarized below.

### 3c. t3ssel8r technique notes from descriptions (Access: D only, mostly silent clips)

- **Subpixel Camera** (https://youtu.be/NutO1jzuVXU):
  - Render at **640×360**.
  - Snap the camera to the nearest pixel at render time.
  - When blitting, correct by the snap offset so the camera glides smoothly at display resolution.
  - Extra projections are needed to stay exact when the camera is **rotated 45°**.
  - Shadowed regions are shaded with a monochrome Lambert term, giving soft fake ambient and more
    contrast in shadow.
- **Isometric Camera** (https://youtu.be/ij555s4mAuI):
  - **Orthographic, 30° pitch, yaw snapped to 45° increments.** This reproduces the 2:1 "2 across, 1
    down" pixel-art block lines.
  - Motion between snap angles stays smooth.
- **Pixel Art Block Shader** (https://youtu.be/Lm5tRVNQxFs):
  - Shading uses a **color-ramp filter on a standard BRDF**.
  - Edge highlight and shadow: sample depth at the adjacent pixels. **Brighten if closer** than the
    neighbors, **dim if farther**.
- **Pixel Art Grass Shader v1** (https://youtu.be/XPA4kKOnIt8):
  - Toon-shaded terrain. Programmatic grass objects take their color from the terrain pixel under them
    via a grab pass.
  - Known issue: **flicker at shading-level boundaries** when the camera moves or rotates.
- **Pixel Art Grass Shader v2** (https://youtu.be/thUXblUXKeU):
  - Fixes the popping by shading each blade with the **world position and normal of the base terrain**,
    which stay stable frame to frame.
  - GPU instancing.
  - A random subset gets a different sprite and color.
- **3D Pixel Art Water Shader** (https://youtu.be/-E0QaU70twc):
  - Sharp edge highlight drawn only where background depth is **one pixel behind** the water texel.
  - Screen-space pixel-perfect **horizontal** displacement for refraction wiggle.
  - Wiggling surface particles.
- **Realtime Reflections** (https://youtu.be/_0PpBepvjFk): a custom **orthographic** reflection probe
  from the viewer's perspective, blended with refraction, with artist-controlled blend colors.
- **Nighttime Lighting** (https://youtu.be/VEP4INri_1U):
  - Additive dynamic-light pass that ignores the color ramp.
  - Light position and intensity **wiggled at a very low framerate**.
  - Light level **quantized to preset steps** for intentional banding.
- **Dynamic Particle Lighting** (https://youtu.be/0xJqzUHJ2fI, T):
  - Cheap deferred light volumes reuse the depth+normals pass.
  - Separate quantization for light and halo.
  - Slider for outline highlight intensity.
  - Optional screen-space shadows by raymarching depth, for pixel-accurate contact shadows.
- **God Rays** (https://youtu.be/fSNdZ82I-eQ):
  - Project quads using the sun's light-space shadow map. No raymarching.
  - Modulated by camera angle, time of day, and rain.
  - **Hard-edged rays** keep the look crisp.
- **Parallax Effect** (https://youtu.be/cCUCMBmc9yQ):
  - Blend a **perspective camera for distant geometry** with the **ortho camera for near geometry**.
  - Produces automatic multi-layer parallax while keeping crisp foreground pixels.
  - Depth fog ties the layers together.
- **Pixel Art Shader Updates** (https://youtu.be/ZsMHY4LDyRE): **light-aware edge coloration**, so edge
  highlights respond to light direction, plus procedural moss.
- **Terrain Authoring** (https://youtu.be/mZjSmJ3dxHw):
  - Unity terrain's interpolated heightmap doesn't read as tiles.
  - A custom **marching-squares** mesher treats the heightmap as a low-res tile map and emits terraces
    and slopes.
- **Procedural Trees** (https://youtu.be/pslJg8vpeHo):
  - Jagged spheres as shadow casters.
  - Leaf sprites scattered over them and **lit with the sphere normal**.
  - Plans **blue-noise** placement to reduce mess.
- **Making an Animation** (https://youtu.be/1FrIBkuq0ZI, T):
  - Keep few keyframes, like animating on twos.
  - Disable interpolation on import.
  - Put the bulk of a swing in **one smear frame**.
  - The smear mesh is generated procedurally from cubic Bézier interpolation of sword position and
    orientation.
  - Use wide, flat arcs that read from any camera angle.

---

## 4. aarthificial (Astortion / "Legacy Devlog")

### "Next-Gen Pixel Art – Devlog #20" — https://youtu.be/jguyR4yJb1M (2021-05-02). Access: T, D

1. **Retro vs. modern.**
   - "Retro": every pixel sits on one grid, rendered low-res and upscaled.
   - "Modern": rendered at screen resolution, with free sub-pixel motion and rotation.
2. **Hybrid.**
   - Snap the camera to the pixel grid and render low-res.
   - Store the snap amount and **offset the upscaled image by it**.
   - Handle the borders (over-render).
   - You get modern-smooth camera motion with retro grid perfection.
3. **Parallax layers.** Render each layer separately with its own snap and offset.
4. **Mixing.** Choose per layer whether it gets pixelated. Fonts and a rotated character stay at full
   resolution.
5. **Bonus.** Anything placed in front of the low-res camera is pixelated automatically: lines,
   distortion, lights, procedural geometry.

### "Harnessing the Power of GPU to Draw Pixel Art Lines – #21" — https://youtu.be/nlzvesTsSrI. Access: T, D

- Emit tiny triangles along a **Bresenham** path, from a geometry shader, so a line rasterizes to exact
  pixels.
- The result is a real mesh, so lighting, layering, and culling just work.
- GPU spring simulation for swaying vines and cables.
- Relevance: pixel-exact lines in the low-res target, such as ropes or banners. In three.js, build
  stair-step quads on the CPU or in a vertex shader.

---

## 5. Acerola

### "Color Quantization and Dithering" — https://youtu.be/8wOUe32Pt-E (2022-05-14). Access: T, D. Code: github.com/GarrettGunnell/Post-Processing

1. **Downsample with point filtering.** Rule of thumb: scale only by **powers of 2**, or pixels come out
   non-square.
2. **Projection.** **Orthographic** makes models read as pixel art far better than perspective when
   rotated.
3. **Bayer ordered dither.**
   - `threshold = bayer[(x mod n, y mod n)] / n² − 0.5`
   - Multiply by a user `spread`, add to the color, then quantize per channel:
     `floor(c*(N−1)+0.5)/(N−1)`.
   - Dither in **low-res pixel space** so the pattern is chunky.
   - Spread = 0 gives flat Dead-Cells-like regions.
4. **Sharpen before pixelating** (4-neighbor kernel). It keeps detail such as grass from collapsing into
   a "green blob" at low resolution and low color count. Sharpening after the dither accentuates the
   pixels.
5. **Palette swap.** Quantize grayscale to N steps and use that value as the U coordinate into a palette
   texture.

### "Your Colors Suck (it's not your fault)" — https://youtu.be/fv-wlo8yVhk (2023-09-30). Access: T (keyword pass), D

- Value mapping: desaturate, quantize to N values, then map to artist colors.
- Generate palettes in **OKLab**, not HSL, which is perceptually unstable, especially in blues.
- Posterizing sRGB channels causes ugly banding.

### "Reverse Engineering The PS1 Aesthetic" — https://youtu.be/y84bG19sg6U (2025-04-27). Access: T (keyword pass), D. Code: GarrettGunnell/Godot-PSX

- **Vertex snapping to screen pixels** in clip space (divide by w, round to pixel, multiply by w). This
  removes sub-pixel rasterization. It is a different "jitter" aesthetic and **not** the stable t3ssel8r
  look, so be careful mixing them.
- 15-bit quantization plus dithering to hide fog banding.

### "How Do Games Render Fur?" — https://youtu.be/9dr-tRQzij4 (2023-10-30). Access: T (keyword pass), D. Code: GarrettGunnell/Shell-Texturing

This is the video at the requested URL. It is about shell texturing (fur, moss, grass), not a dedicated
grass video.

- Shell texturing = N stacked shells with a height-thresholded noise mask.
- **Half-Lambert** (`dot*0.5+0.5`) and dropping fake AO between shells look better in stylized scenes and
  allow fewer shells. Genshin and Viva Piñata moss are the examples.
- Cost: shells plus `discard` cause heavy **overdraw**.
- Relevance: possible ground moss or grass, but the t3ssel8r-style answer is instanced billboard grass
  (sections 3b and 3c).

### "What Is A Graphics Programmer?" — https://youtu.be/O-2viBhLTqI (2023-11-30). Access: T (keyword pass), D

A career overview with **no pixel-art technique content**. Useful only for its reading list:
Catlike Coding, Real-Time Rendering 4e, and GPU Gems. Red Giraffe also credits Catlike Coding.

---

## 6. Bramwell — "Tutorial: Improving 3D Water in Godot 4" — https://youtu.be/zvoQqhLeans (2022-12-02). Access: T, D. Code: github.com/bramreth/Godot4WaterShader

Chapters: Proximity Fade 1:32 · Masking 3:11 · Sin Waves 5:38 · Adding A Minimum 8:52.

1. **Proximity fade.** Mask = 1 − clamp((sceneDepth − waterDepth) / maxDist), using linear depth with
   maxDist around 1 m. The result is white where water is shallow or touching geometry.
2. **Ripples.** `abs(sin(time + mask*freq)) * mask` gives rings radiating from intersections. Add a
   minimum so the contact line always stays white.
3. **For pixel art:** run this at low resolution and then **step or quantize** the ripple into 1–2 bands.
   Combine with t3ssel8r's single-pixel shoreline highlight.

---

## 7. Other 3D-pixel-art devlogs and tutorials found

| Video | Access | Key takeaways |
|---|---|---|
| **Kody King (John Sports), "Three.js Pixel Shader Update – Seamless Outlines"**, https://youtu.be/jFevm02NJ5M (2021-11-29), and **"Three.js Pixel Shader Update"**, https://youtu.be/-WHW48SlvsI | D, W (source) | **The three.js baseline.** The code became `RenderPixelatedPass` (three.js PR #22322; example `webgl_postprocessing_pixel`). From the source: render at `floor(width/pixelSize)` into a `NearestFilter` HalfFloat target with a `DepthTexture`, plus a second pass with `MeshNormalMaterial` override. **Depth edge** = sum over 4 neighbors of `clamp(nDepth − depth, 0, 1)`, then `floor(smoothstep(0.01, 0.02, d)*2)/2`. Only the **nearer** pixel draws, which gives single-pixel silhouettes. **Normal edge** = Σ `(1 − dot(n, nN)) * depthIndicator * normalIndicator`, where `normalIndicator = smoothstep(−0.01, 0.01, dot(n − nN, bias))` breaks the symmetry so only one side lights, and depthIndicator keeps it on the shallower side. Then `step(0.1, sum)`. Output: depth edge **darkens** by `depthEdgeStrength` (default 0.4); otherwise normal edge **brightens** by `normalEdgeStrength` (default 0.3). Gotcha: passing 0 falls back to the default because the code uses `\|\|`. The "seamless" update fixed gaps in normal edges at vertices. |
| **Dylearn, "Recreating t3ssel8r style 3D pixel art in Godot"**, https://youtu.be/g1vH3HeePco (2025-02-26) | T, D | Recipe: **ortho camera, X rotation −30°, yaw-only rotation**; SubViewport at **640×360**; toon shader with lighting **clamped to thresholds**; depth-outline and normal-highlight post shader (godotshaders, Leo Peltola: shadow_strength 0.4, highlight_strength 0.1, depth smoothstep(0.2, 0.3), normal smoothstep(0.2, 0.8), with highlights masked by an inverted depth test to stop leaks). Can lighten or darken edges by light attenuation. Rocks: cube → subsurf → remesh → displace (noise) → **decimate (planar, raise the angle)** → **triangulate** for consistent lighting. Bricks use cellular noise. **Grass:** billboarded quad multimesh, albedo = floor color plus leaf sprite. Each blade is lit at its **model origin** (he recompiled Godot to pass vertex data to the fragment shader), so the whole sprite gets one light value. Slow random sway driven by world position. |
| **Eduardo Schildt, "3D PixelArt Tutorial – Godot"**, https://youtu.be/7wwE5FLZceY (2025-05-19) | T, D | SubViewport stretch-shrink plus **nearest** filtering. Full-screen quad post shader (vertex `POSITION = vec4(VERTEX.xy, 1, 1)`, flip faces, max extra cull margin). **Linearize depth.** 4-neighbor depth diff summed, then smoothstep threshold (example 0.3). Normals decoded `*2−1`, compared by dot product; naive version gives **2-px thick lines**, fixed with Kody King's normal-edge bias. Depth plus normal produces **double lines on outer edges**; fix by building an inverse-depth mask (`depth − neighbor`) and subtracting it from normal edges. Final: albedo + inner lines × light param; albedo − albedo × depthEdge × dark param. Example project adds light-reactive outlines. Credits Kody King's three.js example. |
| **Voyage / NimbleFox, "Creating Pixel Perfect Outlines for 3D Pixel Art"**, https://youtu.be/LRDpEnpWohM (2023-08-30) | T, D | Sample **exactly one pixel** out; the sample distance equals the outline width. **Subtraction order picks the side:** `neighbor − center` draws the line around (outside) the object, and the reverse draws it on the object's edge. Normal edges: choose a **direction** (bias) and discard edges facing the wrong way, which keeps them 1-px and on one side. Depth outlines override normal outlines. Sold as "Critter 3D Pixel Camera" on the Unity Asset Store. |
| **Robin Seibold, "Outlines – Devlog 2"**, https://youtu.be/LMqio9NsqmM (2021-11-21) | T, D | Rejects **inverted-hull** outlines in favor of screen-space depth and normal. **Roberts cross** on depth and on view-space normals separately, thresholded and combined by max. Normals texture rendered **only for objects on an outline layer mask**, so it doubles as the mask. Outline scale is a parameter (1 = one texel). Cites roystan.net's outline-shader article. |
| **MrPlague, "Pixel Shader Update: Depth and Normal Outlines"**, https://youtu.be/gSK-y3K7pNI | D | Inspired by t3ssel8r and Kody King. Lists the canonical references. |
| **bozb, "Light-aware Outlines for 3D Pixel Art"**, https://youtu.be/rqKLaNCfhBo (2023-11-23) | D | Outline strength from depth plus decoded normals, **modulated by light direction**, then color-blended onto edges. Works as a toon-shader feature or a full-screen pass. |
| **IndividualKex / Dylan Ebert, "Texel Splatting | True 3D Pixel Art"**, https://youtu.be/GhlTMsPoaJw (2026-02-22) | T, D, C, W (project page) | Explains why snapping alone fails: perspective, rotation. (1) Render the scene into a **low-res cubemap** from a probe at the camera position **snapped to a world grid**, with position, normal, material, and objectID per texel. (2) Shade per texel in a compute pass, with **OKLab lightness posterization** and outlines from objectID and normal discontinuities. (3) **Splat each texel as a world-space quad** and rasterize from the real camera. An eye probe fills **disocclusion** holes, where shimmer remains. A 4×4 Bayer crossfade blends between grid probes. 384² per face; about 40 fps on iPhone 15, under 4 ms on an RTX 4090. **WebGPU** demo. MIT code: github.com/dylanebert/texel-splatting; paper arXiv 2603.14587. **This is the only approach that fixes rotation and perspective shimmer.** |
| **Starhelm, "Project Shadowglass hits 100K Wishlists"**, https://youtu.be/v9FMp5QgOvY (2025-10-26) | T, D | Proof that **first-person, 360° 3D pixel art** is viable, using a custom Godot renderer. Technique **deliberately not disclosed**. Only marketing-level information. |
| **thegeolojosh, "3D pixel art filter… Goodlands"**, https://youtu.be/1f76ajrdPYc | T | Minimal "A Short Hike" recipe: toon shader (flat colors, crisp shadows), low-res render texture, **no anti-aliasing, point filtering**. |
| **Madalaski, "Pixel Art Shader In Unity (Intermediate)"**, https://youtu.be/dpNhymnBDQw | T, D | Pixelate only selected objects: a second camera on a layer renders to a low-res RT, plus a depth-only RT. The composite shader compares RT depth with scene depth to occlude correctly. Sobel outline on that depth. Caveat: pixel size follows screen resolution, so objects get "less pixelly" as you approach. |
| **Leo Svanå, "Converting 3D to 2D Pixel Art"**, https://youtu.be/q_7JRw4jIO4 | T | Pre-render sprites (Blender toon shader at 64×64) versus a real-time pixel camera matching the main camera. Pixelating only the character looks mismatched, so the whole world was moved to the pixel layer. |
| **runevision, "Surface-Stable Fractal Dithering Explained"**, https://youtu.be/HPqGaIMVuLs (2025-01-23) | T, D | Screen-space Bayer dither "slides" over moving geometry, which flickers. Obra Dinn pinned the dither to a sphere around the camera (stable under rotation only). **Fix:** dither in surface UV space, choose the scale by **rounding log2 of the UV rate of change (fwidth)** to a power of two, and use a 3D texture of Bayer "layers" so dots appear gradually. Dots stick to surfaces yet stay constant size on screen. Fails at grazing angles (anisotropy), where dots form lines. Code: github.com/runevision/Dither3D. Use it if dithering is wanted under a moving camera. |

---

## 8. Technique checklist (synthesized)

Difficulty is for three.js + WebGL2: **E** = easy (under 1 day), **M** = moderate, **H** = hard or
research.

| # | Technique | What it fixes visually | Difficulty | Sources |
|---|---|---|---|---|
| 1 | Render to a low-res `WebGLRenderTarget` (e.g. 320×180 / 640×360), `NearestFilter`, `antialias:false`, integer upscale | Blur, AA-softened edges; the basic "chunky pixel" read | E | Red Giraffe ep1, Acerola quant/dither, Eduardo, Dylearn, thegeolojosh, three.js RenderPixelatedPass |
| 2 | **Orthographic camera, ~30° pitch, yaw snapped to 45° steps** | Perspective warping of pixels; gives 2:1 iso "pixel-art lines"; makes the camera snap math exact | E | t3ssel8r Isometric Camera, Dylearn, Acerola |
| 3 | Model to 45° angles; low-poly with procedural displacement, then decimate (planar) and triangulate | Too much geometric detail and noisy creases; consistent lighting | E–M (art) | t3ssel8r scene and imgur, Dylearn, Red Giraffe ep2 (high-poly crease noise) |
| 4 | **Toon / color-ramp lighting** (2–4 bands; highlight, mid, shadow colors per material); half-Lambert or monochrome-Lambert fill in shadow | Smooth gradients that quantize into mush; flat-looking shadows | E | t3ssel8r imgur, Block Shader, Subpixel Camera; Red Giraffe ep4; Dylearn; Acerola fur |
| 5 | **Snap camera to the texel grid** in camera-local axes (`p' = round(p*S)/S`, S = texels per world unit) | Pixel crawl / shimmer during translation | E | David Holland, Red Giraffe ep5, aarthificial #20, t3ssel8r Subpixel Camera |
| 6 | **Sub-texel smoothing:** render low-res plus a 1–2 texel margin, then blit with a screen offset equal to the snap error × upscale factor | Stair-stepped, jerky camera motion caused by #5 | M | aarthificial #20, David Holland, Red Giraffe ep5, t3ssel8r Subpixel Camera |
| 7 | **t3ssel8r AA upscale shader** for the final blit (fwidth box, smoothstep weighting, `textureGrad`, premultiplied alpha) | Uneven or oblong texels at non-integer scales and with sub-pixel offset; aliasing in motion | M | t3ssel8r upscaling video; David Holland |
| 8 | Snap moving objects' **render** positions to the same grid (snap before render, restore after) | Moving props crawling against a stable world | E | David Holland |
| 9 | Depth-edge outlines: linearized depth, 4-neighbor only, **only the nearer pixel draws** (`clamp(nDepth−depth)`), threshold, **darken** | Missing silhouettes, double-thick outlines, mixels from full-res outlines | M | Kody King / RenderPixelatedPass, Red Giraffe ep2, Voyage, Eduardo, t3ssel8r |
| 10 | Normal-edge (crease) **highlights** with a directional bias and a "shallower side only" gate, **brighten**; depth edges take priority; subtract an inverse-depth mask | Lost form on flat-shaded blocks; 2-px crease lines; highlights leaking outside objects | M | RenderPixelatedPass, Eduardo, Dylearn, godotshaders, Voyage |
| 11 | **Light-aware edge color** (modulate the highlight by N·L or by the light's attenuation) | Outlines that look pasted on, or wrong on the shadow side | M | t3ssel8r Shader Updates, bozb, Dylearn, Eduardo |
| 12 | **Selective outline mask** (layer / object-ID render target, depth-tested; channels choose the algorithm) | Outline noise in dense or high-poly scenes; readability | M | Red Giraffe ep2, Robin Seibold |
| 13 | **Palette quantization in OKLab** (nearest of 16–32 colors; palette as a uniform array or LUT; swappable) | Muddy or random colors; lack of a cohesive "authored" palette; day/night re-theme | M | Red Giraffe ep1 and comments, Acerola colors, texel splatting (OKLab posterize) |
| 14 | Quantized light levels for dynamic and point lights (plus low-framerate flicker) | Smooth light falloff gradients; lifeless torches | E | t3ssel8r Nighttime Lighting, Particle Lighting |
| 15 | World-space cloud-shadow mask (depth → world pos → sun ray → cloud-plane noise), **banded, not blurred** | Flat, uniform lighting; adds life without breaking the pixel look | M | Red Giraffe ep4, t3ssel8r imgur |
| 16 | Billboard grass and leaf sprites **lit with the base terrain or tree normal and position** (instanced) | Grass flicker at band boundaries; grass breaking up color boundaries organically | M | t3ssel8r Grass v1/v2, Trees, imgur; Dylearn |
| 17 | Water: depth tint, noise refraction (screen-space, horizontal), coarse sine waves, **1-px shoreline highlight** where background depth is 1 px behind, quantize the water too | Water that reads as "3D", not pixel art; gradient banding in the water | M | t3ssel8r Water, imgur; Red Giraffe ep3; Bramwell |
| 18 | Planar or ortho-probe reflections blended with refraction | Lifeless water | M–H | t3ssel8r Realtime Reflections; Red Giraffe ep3 |
| 19 | Hard-edged god rays from shadow-map-projected quads | Blurry volumetrics clashing with crisp pixels | M–H | t3ssel8r God Rays; Red Giraffe ep4 |
| 20 | Ortho near / perspective far camera blend plus depth fog | No depth or parallax on vistas | H | t3ssel8r Parallax |
| 21 | Animate on twos (keyframes only), single smear frame, throttled animation framerate | Over-smooth 3D motion that reads as "not pixel art" | E–M | t3ssel8r Animation; David Holland comments |
| 22 | Rotation masking: briefly raise pixel size, or global dither, or slight blur during rotation | Crawl during camera rotation | E | Red Giraffe ep5 |
| 23 | **Texel splatting** (grid-snapped cubemap probe, then world-space quads) | Shimmer under rotation **and** perspective; true free camera | H (WebGPU, research code) | IndividualKex / Dylan Ebert |
| 24 | Surface-stable fractal dithering | Dither patterns swimming over moving geometry | H | runevision |
| 25 | Optional: sharpen before downsample | Fine detail (grass) collapsing into blobs at low resolution | E | Acerola quant/dither |

---

## 9. Failure modes the videos warn about, and the fix for each

| Failure mode | What it looks like | Fix (sources) |
|---|---|---|
| **Pixel crawl / shimmer on translation** | Edges and texels "boil", sprites squash and stretch while the camera pans | Snap the camera to the texel grid in camera-local space, then add sub-texel screen-offset smoothing (#5, #6). Snap moving objects' render positions (#8). Ortho projection is required for exactness. *(David Holland, Red Giraffe ep5, aarthificial, t3ssel8r)* |
| **Aliasing / crawl on rotation** | Everything re-pixelates every frame while orbiting; thin geometry and outlines jump most | Unsolvable with snapping alone. Restrict yaw to 45° steps with smooth transitions (t3ssel8r). Or mask it: temporarily raise pixel size (best per Red Giraffe), global dither, or slight blur. Or full fix: texel splatting (cubemap probe plus quads). Avoid very thin geometry. *(Red Giraffe ep5, t3ssel8r Isometric Camera, IndividualKex)* |
| **Blurry or "not pixel art" downscale** | Low-res render looks soft; colors that weren't in the scene appear | Point / nearest sampling both down and up; no MSAA. For non-integer display scales, use t3ssel8r's AA upscale shader instead of plain nearest (which gives oblong texels) or bilinear (which blurs). *(Red Giraffe ep1, Acerola, t3ssel8r upscaling)* |
| **Non-square pixels** | Some texels 3×4 and others 3×3 | Integer or power-of-2 upscale ratio, or the t3ssel8r upscale shader. *(Acerola, David Holland comment, t3ssel8r)* |
| **Double-thick outlines** | 2-px lines on both sides of an edge; doubled outer edges where depth and normal edges overlap | Asymmetric tests: depth edge only on the **nearer** pixel (`clamp(neighbor−center)`); normal edge with a directional bias and "shallower side only"; depth edge overrides the normal edge; subtract an inverse-depth mask from normal edges. 4-neighborhood only, offset exactly 1 low-res texel. *(Kody King, Eduardo, Voyage, Red Giraffe ep2)* |
| **Mixels** (mixed pixel sizes) | Full-res outlines, UI, or particles over chunky pixels; textures finer than the grid | Compute outlines, water foam, and particles **in the low-res target**, on the same grid (downsample depth and normals with color). Keep texture detail at or below 1 texel per screen texel. Decide deliberately which layers are full-res (UI, fonts). *(Red Giraffe ep2, aarthificial, David Holland comment)* |
| **Outline noise / false edges** | Outlines on shadows or wood grain; high-poly meshes covered in crease lines | Don't detect edges from color; use depth and normals. Linearize depth so thresholds hold at all distances. Selective outline mask per object. Fewer, flatter polys (planar decimate). *(Red Giraffe ep2, Dylearn, Robin Seibold)* |
| **Gradient banding (ugly kind) / muddy gradients** | Smooth Lambert falloff, fog, or depth tint turning into uneven blotchy bands after quantization | Make banding **intentional**: toon or color-ramp lighting, quantized light levels, banded cloud shadows. Quantize in OKLab against an authored palette. Run water and fog through quantization too. Use dithering only if it is surface-stable or the camera is static. *(Red Giraffe ep1/3/4, t3ssel8r Night Lighting, Acerola colors and PS1, runevision)* |
| **Dither swimming** | Screen-space Bayer pattern slides over moving geometry and flickers | Avoid dither on moving views, or pin it to surfaces (surface-stable fractal dithering), or Obra Dinn's sphere mapping (rotation only). *(runevision; Red Giraffe flags camera-motion stability as the open problem)* |
| **Shading-band flicker on grass and foliage** | Sprites pop between light bands as the camera moves | Shade each sprite with the **base** terrain or trunk world position and normal (or the instance origin), not per-pixel. *(t3ssel8r Grass v2, Trees; Dylearn)* |
| **Too much detail / noise** | High-res textures, noisy normals, high-poly meshes, raymarch noise, busy reflections | Low-poly with procedural displacement, then decimate. Edit foliage normals. Rely on flat toon colors. Use hard-edged cards instead of raymarched volumetrics. Keep water layers restrained. *(t3ssel8r scene, Red Giraffe ep2/3/4)* |
| **Overly smooth motion / animation** | 3D interpolation reads as "3D game", not pixel art | Animate on twos (keyframes only, no interpolation); single-frame smears; throttled animation and rotation framerate; low-framerate light wiggle. *(t3ssel8r Animation and Night Lighting, David Holland comments)* |
| **Perspective breaks pixel stability** | Pixels at different depths drift at different rates, so snapping can't fix it | Use orthographic projection. For vistas, blend to perspective only for far geometry and hide the seam with fog. For true perspective, use texel splatting. *(t3ssel8r Parallax, IndividualKex, Acerola)* |

---

## 10. Suggested three.js pipeline order, distilled from the above

1. **Camera.** Ortho camera at 30° pitch, yaw in 45° steps. Snap the position in camera space and keep
   the snap error.
2. **Geometry pass** into a low-res RT with a margin: color with toon materials, plus `DepthTexture`, plus
   a normal RT (a `MeshNormalMaterial` override, or MRT). Add an optional outline-mask RT.
3. **Edge pass** (low-res): linear depth, 4-neighbor checks; nearer-pixel darken, crease brighten with a
   light-aware tint. Start from `RenderPixelatedPass` and extend it.
4. **Palette pass** (low-res): OKLab nearest-color against a uniform palette, with water and fog
   included.
5. **Present pass** (full-res): t3ssel8r AA upscale with a UV offset of −snapError, cropping the margin.
   UI stays full-res on top.
