# v3 perf: learnings from the three.js optimisation literature (front "learn")

Author: `v3-perf-learn` (v3 perf swarm, 2026-10-18). Branch `v3-perf-learn`, based on `0cfd0b8` ("v3 C1").

Scope:

- Read five public resources on three.js and WebGL performance.
- Map each technique to the v3 town: the vendored pixel3d engine (`v3/pixel3d/**`) and `apps/client/src/game3d/**`.
- Implement the items that no other perf front owns and that give a measured gain.

Targets (user):

- Laptops first: integrated GPUs, DPR 2 screens, and 120-165 Hz panels on many current machines.
- The `cpu` tier: software GL, ≥ 20 fps at 960×540 with 8-15 players.
- Phones: unsupported.

## 1. Sources (read 2026-10-18; treated as reference data)

| Key | Source | What it contributes here |
|---|---|---|
| AE1 | github.com/iniGlowee/threejs-game-optimization (README + `static-perf.js`, `near-fade.js`, `strip-specular.mjs`) | Measure-first workflow (`renderer.info`, p50 / p99 frame sampler). Pixel-ratio cap as the biggest lever. KTX2 textures. Dropping needless `MeshPhysicalMaterial` (11 → 6 programs). BVH and cached static raycasting. `freezeStatic` (`matrixAutoUpdate = false` on static subtrees). Bayer screen-door fade in the material. |
| M-A / M-B | three.js manual, "Optimize lots of objects" and "... animated" | Merge static geometry (`BufferGeometryUtils.mergeGeometries`, per-vertex colour; 19k draws → 1). Morph targets to animate merged data. Render on demand (only while something animates). |
| HECKEL | Maxime Heckel, "The art of dithering and retro shading for the web" | Ordered (Bayer / blue-noise) dithering and palette quantisation as ONE effect pass. Merging effects into one pass (`postprocessing` EffectPass) instead of chaining passes. Note: Heckel pixelates by UV snapping at full resolution, which saves no fragment work. |
| PIXEL | three.js `webgl_postprocessing_pixel` + `RenderPixelatedPass.js` (r170) | Low-res render targets (nearest, HalfFloat) + an outline pass from depth and normal edges. The scene is drawn **twice**: beauty + depth, then `overrideMaterial = MeshNormalMaterial`. Plus `pixelAlignFrustum` to stop pixel swim. Same architecture as pixel3d's `PixelPipeline`. |
| EM | Evil Martians, "Faster WebGL / three.js 3D graphics with OffscreenCanvas and Web Workers" | `transferControlToOffscreen()`, a worker bundle with a main-thread fallback, `ImageBitmapLoader` in the worker, and resize proxied by message. Input / DOM proxying is left as an exercise. |

## 2. Technique → v3 map

Legend:

- **done**: already in the code (file named).
- **front:x**: being done or owned by another perf front. The other fronts' branches were read at their commits on
  2026-10-18 13:00 PDT.
- **applied**: done on this branch.
- **plan**: applicable but not done here (gain / risk / files).
- **n/a**: does not apply (why).

| Technique (source) | v3 status | Notes |
|---|---|---|
| Low-res render target + nearest upscale (PIXEL) | **done** | `PixelPipeline`: 640×360 (high) / 480×270 (low) RTs + margin, integer-scale upscale with sub-texel offset (`coords.ts pixelScaleFor`). The scene fill rate is already 1/pixelScale². |
| Pixel-ratio cap (AE1's "biggest lever") | **done** | `Engine` `setPixelRatio(1)` + `engineHost.hostResize`: canvas px = CSS px, CSS `image-rendering: pixelated`. On a DPR 2 laptop the browser doubles the final image; the pipeline never sees DPR. Nothing left to gain. |
| Pixel-align the frustum (PIXEL `pixelAlignFrustum`) | **done** | `PixelCamera.snapWorld` / sub-texel offset in the upscale. |
| Merge static geometry (M-A) | **done per piece**, **front:stage** across pieces | The vendor merges each piece's kit meshes at build time (`town/town.js`, `town/kit.js`). Foliage, trees, life and critters are instanced or merged. What remains: ≈ 95 in-view meshes at the square = ≈ 100 colour + ≈ 100 normal draws. Merging across pieces by material + spatial cell is stage.md §4.1: ≈ −100 draws, high risk (door pivots, `setLit` glass, fades, park). Deferred to v3.1 by stage. |
| InstancedMesh (M-A, AE1) | **done** where repeated | `foliage.js`, `trees.js`, `rocks.js`, `life/folk.js`, `life/critters.js`, `ambient/*`. Characters are unique skinned rigs; billboard casts (`avatars/billboard.ts`) are one quad each, ≤ 2 casts today. |
| BatchedMesh (r159+) | **plan** (part of the stage merge) | The cross-piece merge could use `BatchedMesh` per material, which keeps per-object visibility for door pivots, cut-away and fades without re-merging. Same owner and risk as the merge. A pixel3d CONTRACT-REQUEST is better than a game-side rewrite. |
| Frustum culling | **done** for the town; **front:client** for characters | three culls every mesh in every pass. The vendor rig sets `frustumCulled = false` (`chars/rig.js:1205`), so off-screen characters cost 3 passes plus skinning. recon-frame §4.5: hide and throttle off-screen bodies in `avatars/layer.ts` (client front's files). |
| Occlusion culling | **n/a** | Fixed ¾ top-down camera over a small town. Little is occluded, and the cut-away already hides roofs. Not worth a GPU query or a CPU raster. |
| `matrixAutoUpdate = false` / static freeze (AE1 `freezeStatic`) | **measured, not applied** (§3.2) | `installRuntimeOpts` already does ONE `updateMatrixWorld` per frame. I wrote a bit-exact dirty-checked replacement (`updateMatrixWorldDirty`). It composed only 23 of 865 nodes a frame, yet the A/B on the editing machine was within noise (< 1 % fps uncapped). Two reasons: the frame's matrix work is dominated by character bones and the vendor's own `updateMatrixWorld(true)` calls (texel snap + restore), and stage measured that the town root carries the per-frame texel-snap offset while walking. Kept as a note. |
| Texture atlases / KTX2 (AE1) | **n/a** (mostly) | Town textures are procedural, so there are no image loaders. Cast / HUD sprites are already atlases (`cast.json`, `v3atlas.ts`). KTX2 would add a transcoder chunk for a few MB of sprites. |
| Fewer / cheaper programs (AE1) | **done**: one toon material family, programs constant (42-47) | The cost to fix is the **12 / 8-light point pool at intensity 0 by day**. three flattens and uploads the light arrays on every material switch (`flatten`, `setValueV3fArray` among the top self functions; see the profile in §3.1). This is stage.md §4.2 / recon-frame §4.1, a lead / §7 decision. |
| Shader warm-up / compile (general) | **done** (WP3 `warmUp` + `warmWholeTown`); **measured, not applied** (§3.3) | `compileAsync` / `KHR_parallel_shader_compile` before the warm-up cut its blocking link time (`setProgram` 365 → 236 ms, `getUniforms` 303 → 169 ms). `readyMs` did not change on Linux / ANGLE-Vulkan (2.51-2.63 s both). Retest on Windows / D3D11, where Chrome compiles in parallel threads. Patch kept in the doc only. |
| Dithering / retro shading in one pass (HECKEL) | **done** in the material | The toon ramp + palette bands live in the toon material (`materials/toon.js`). The post chain has no separate dither pass. |
| Post-processing pass count (HECKEL "merge effects") | **plan** (vendor) | 8 low-res passes: contact, outline, river, fountain, fountain bowl, well, grade, vignette. The four water passes are 80 % of the chain on SwiftShader (recon-frame §2.2). On a GPU at 640×364 each pass is ≈ 0.05-0.15 ms of iGPU time plus ≈ 0.03 ms of issue. Merging the water bodies into one pass, and grade + vignette into one, is a pixel3d CONTRACT-REQUEST (§4.4). The `cpu` tier already turns water off (front:cpu). |
| The second scene render for normals (PIXEL) | **plan** (vendor; biggest single lever) | `PixelPipeline` step 3 re-renders the scene for normals + outline flags: ≈ 93-108 draws, 30-35 % of the frame's calls, ≈ 1.3-2.0 ms of issue on the host CPU (stage.md §2). MRT (colour + normal in one pass, WebGL2 `drawBuffers`) touches every `uPassMode` shader (73 sites in 21 vendor files), the COLOR_ONLY layer and transparency. It cannot be done game-side without forking the vendor shaders. CONTRACT-REQUEST (§4.1). The `cpu` tier skips the normal pass (front:cpu). |
| On-demand rendering when nothing moves (M-B) | **applied in its safe form** (§3.1); full idle **n/a** | Something always animates in the town: water, flutter, breathing rigs, fireflies, smoke. Skipping "idle" frames would change the look. The real waste was rendering **more** frames than the eye needs: rAF runs at the panel rate, so 120-165 Hz laptops paid 2-2.75× per second. Hidden tabs already stop rAF. |
| Pixel-ratio / resolution scaling under load | **done** via tiers | high → low → cpu → Classic in the perf sampler (`perf.ts`, front:cpu). pixelScale is part of the look, so no dynamic resolution. |
| Shadow budget | **done** + **front:stage** | Basic shadows, 4096 / 2048 maps, `shadowOnce`. Stage renders the low tier's map every 2nd frame (`world/shadowCadence.ts`); the cpu tier has none. |
| LOD | **done** for characters (WP2 far LOD at low); **front:client** to extend | Town LOD is n/a: one fixed zoom range, and the pieces are small. |
| Billboard / label draw-call batching | **n/a** | Labels, bubbles and boards are DOM (`overlay/**`, WP4): 0 draw calls, and front:ui measures their DOM cost. The 1-2 sprite casts are one quad each. |
| Raycasting cost (AE1 BVH) | **n/a** | Picking uses the core's box proxies (`input/pick.ts`, `houseProxies`), not mesh raycasts. No skinned-mesh raycasting. |
| OffscreenCanvas + worker (EM) | **not feasible for v3.1**: written up (§5) | The vendor render path is DOM-light. The game side is not: overlay, input, avatars and debug hooks read the scene synchronously each frame. |

## 3. What this branch measured and applied

Measurement setup (all numbers below):

- **the editing machine (discrete desktop GPU)** (user-allowed), headless Chromium 1243 on ANGLE / Vulkan.
- The harness build (`vite.harness.config.ts`) is built on the host, served from the host on 127.0.0.1:3455-3459, and
  reached through an SSH tunnel.
- Scenario `square-day-8`: own avatar + 8 players + the storyteller, 960×540. It is held at its first still, so the
  players stand on the square while the town animates.
- Steady state, 8 s windows after a 4 s settle.
- Per window: drawn frames (a draw into the default framebuffer = one upscale = one rendered frame), WebGL draws, and
  main-thread `TaskDuration` from CDP.
- "Unthrottled" = `--disable-gpu-vsync --disable-frame-rate-limit`, the stand-in for a high-refresh panel. "60 Hz" =
  default vsync.

Caveat: the editing machine is shared with the pixel3d render session (GPU 40-45 % busy before the runs). Its CPU clocks down
at 60 fps with idle gaps, so 60 Hz per-frame ms (≈ 7 ms) is higher than unthrottled per-frame ms (≈ 1.5 ms). Compare
like with like only.

### 3.1 Applied: frame cap at 60 rendered fps on high-refresh displays (commit `83dced8`)

What changed:

- `perf.ts` gains `createFrameGate(fps)`, a phase-locked gate on the rAF timestamp.
  - The next due time advances by exactly one interval per drawn frame.
  - The vsync nearest each due time is drawn: the slack is half the measured vsync interval.
  - A stall re-locks to now instead of bursting.
- Displays up to ≈ 78 Hz are never gated. A 59.94 / 60.5 / 75 Hz panel renders every vsync exactly as before.
- 120 / 240 Hz draw every 2nd / 4th vsync. 144 / 165 Hz alternate 2 and 3 vsyncs (average 60).
- `runFrameLoop` gets `maxFps`. `engineHost` passes `V3_MAX_FPS = 60`.
- `ct.debug.fps > 0` still wins (tests). `ct.debug.fps < 0` = uncapped (perf runs).
- The cpu tier's 30 fps cap (front:cpu `tierFpsLimit`) now runs through the same gate. It still draws every 2nd vsync
  at 60 Hz.
- Looks: unchanged at ≤ 78 Hz. At 120+ Hz, motion updates at 60 Hz, like a 60 Hz laptop.

| harness, 960×540 | before | after |
|---|---|---|
| high, unthrottled: rendered fps | 640 | **60** |
| high, unthrottled: main thread ms/s | 995 (saturated) | **429** |
| low, unthrottled: rendered fps | 754 | **60** |
| low, unthrottled: main thread ms/s | 994 (saturated) | **321** |
| high, 60 Hz vsync: rendered fps / main ms/s | 60 / 462 | 60 / 460 (no change, no dropped frame) |
| low, 60 Hz vsync: rendered fps / main ms/s | 60 / 436 | 60 / 434 |
| draws per frame (high / low) | 341.8 / 272.9 | 341.8 / 272.9 |
| programs (high / low) | 47 / 41 | 47 / 41 |

On a real 120 Hz laptop the gain is about half the GPU + CPU work of the town per second. That means less heat and
battery, and more headroom for the DOM HUD, chat and voice on the same thread. Unit tests in `frameGate.test.ts` cover:

- 59.94 / 60 / 60.5 / 75 / 120 / 144 / 165 / 240 Hz;
- the 30 fps cap;
- the stall re-lock;
- `maxFps` vs `fpsLimit`.

CPU profile of the steady state at 60 Hz (high, unminified harness build, inclusive ms per second). This is the map of
what remains:

| | ms/s |
|---|---|
| `renderAt` | 368 (≈ 6.1 ms / frame on this clocked-down CPU) |
| three `WebGLRenderer.render` (shadow + colour + normal + reflection + post) | 299 |
| `setProgram` | 128, of which uniform `upload` 75 and light-array `flatten` 27 |
| `WebGLShadowMap.render` | 60 |
| `updateMatrixWorld` (all callers) | 51-55 |
| `projectObject` (culling, 4 scene renders) | 46 |
| character `_step` | 27 |

### 3.2 Measured, not applied: dirty-checked world matrices

- The replacement was bit-exact against three over 120 random frames, including:
  - custom `updateMatrix` bones;
  - `matrixAutoUpdate = false` holders edited without the flag;
  - reparenting;
  - `getWorldPosition` flagging the ancestor chain.
- Diagnostics: three's `updateWorldMatrix(true, …)` (`getWorldPosition`, the texel snap) leaves the scene root flagged
  every frame, so stock three re-multiplies all ≈ 865 nodes. The fix composes 23 and skips the spurious root flag.
- Measured anyway: unthrottled high 646 / 632 fps against 644 / 628 for the baseline. 60 Hz profile: matrix work
  53 → 54 ms/s, because the vendor's own `updateMatrixWorld(true)` on characters dominates.
- Not shipped: no gain at today's scene size, and non-zero risk. The patch is kept with the branch notes in the final
  report. Revisit after the stage merge, which cuts town nodes, or if character counts grow.

### 3.3 Measured, not applied: parallel shader compile before the warm-up

- `renderer.compile(scene, cam)` was issued with the colour pass's target bound (program keys depend on it), then
  `isReady()` was polled with a disposed guard (three's `compileAsync` poll would throw from a timer after a cancelled
  build). Then the WP3 warm-up ran.
- Warm-up blocking: `setProgram` 365 → 236 ms and `getUniforms` 303 → 169 ms. Post-pass and shadow-depth programs are
  not covered by `compile()`.
- `readyMs` unchanged: 2.51-2.63 s with the patch against 2.53-2.67 s without. The long tasks were the same: ≈ 670 ms
  module eval / build, ≈ 650 ms build, ≈ 380 ms warm-up.
- Not shipped. Real value is likely on Windows (ANGLE / D3D11 compiles HLSL in parallel threads) and macOS / Metal,
  where shader compile is several times slower than here. A user-device test with `ct.debug.v3perf` should decide.
- The `readyMs` breakdown says the bigger load lever is the 2.2 s town **build** (`buildPiece`; `ground.js build` 186 ms
  self). That is front:client (load).

## 4. Ranked plan (what is left, with owners)

Ranking = expected laptop gain × confidence ÷ risk.

1. **MRT colour + normal pass**. Vendor CONTRACT-REQUEST, pixel3d `PixelPipeline.js` + every `uPassMode` shader.
   - Gain: −93 to −108 draws per frame (≈ 30-35 % of calls), −1.3 to −2.0 ms issue (host CPU), half the vertex and
     skinning work.
   - Risk: high: outline flags, COLOR_ONLY occlusion, transparency.
   - Interim game-side lever, already taken: the cpu tier drops the normal pass.
2. **No point lights by day** (stage.md §4.2, recon-frame §4.1).
   - Gain: removes most of `flatten` + the light-array uploads (≈ 0.5 ms / frame of `upload`) and the 12-light loop in
     every lit fragment.
   - Lead / §7 decision: compile both light-count variants in the warm-up.
3. **Cross-piece static merge / BatchedMesh** (stage.md §4.1; v3.1). ≈ −100 draws.
4. **Merge the post chain**. Vendor CONTRACT-REQUEST:
   - one water pass for all bodies, with a uniform array of shapes and an early screen-AABB reject;
   - grade + vignette in one pass;
   - optionally the vignette folded into the upscale, sampled at the low-res texel coordinate so it stays bit-identical.
   - Gain: −4 low-res fullscreen passes, ≈ 0.2-0.6 ms of iGPU time, plus RGBA16F bandwidth.
5. **Characters: cull + throttle off-screen rigs** (recon-frame §4.5; `avatars/layer.ts`, front:client). −3 to −8
   draws per hidden body, plus its skinning.
6. **Render-target formats**: the normal RT and the post ping-pong after grade as RGBA8. Vendor CONTRACT-REQUEST,
   about 30-40 % of RT bandwidth on iGPUs.
7. **Parallel precompile** (§3.3): ship it if a Windows / macOS device shows a `readyMs` gain.
8. **OffscreenCanvas worker** (§5): only as a v4 architecture item.

Proposed `scripts/perf/budgets.mjs` keys. They are not edited here: budgets belong to WP7.

| key | max | source |
|---|---|---|
| `v3MaxRenderFpsUnthrottled` | 62 | harness on an unthrottled browser (`--disable-gpu-vsync --disable-frame-rate-limit`): rendered fps must stay at the cap (60 measured) |
| `v3MainMsPerSecUnthrottledHigh` | 520 | same run, CDP `TaskDuration`, `square-day-8` high (429 measured on the editing machine; a relative regression guard only) |
| `v3DroppedFrames60Hz` | 0 | same run at default vsync: rendered fps ≥ 59.5 when the main thread has headroom |

## 5. OffscreenCanvas + worker rendering: feasibility

What would move to the worker:

- the vendor Engine;
- the town (`createStage`);
- the avatars (`createAvatarLayer`: three objects + vendor characters);
- the frame loop.

What must stay on the main thread:

- the network core (`net/core.ts`) and the RoomConnection;
- input (`input/**`, DOM events);
- the overlay (`overlay/**`, DOM labels / bubbles / boards anchored per frame);
- the HUD;
- the debug hooks `__ctCamera` / `__ctSocial`, which the e2e suite calls synchronously;
- lifecycle / fallback.

Findings:

- **The vendor engine is portable.** Its render path touches the DOM only in `Engine` (`document.body.appendChild`,
  `window.inner*`, `#hud`, `window.__pixel`, a window resize listener), which `engineHost` already works around.
  Textures are procedural, so there are no image loaders, and pieces are lazy JS modules, which work in module workers.
  `house-8` mentions `window` only in comments.
- **The game side is the blocker.** Every frame, main-thread code reads scene state synchronously:
  - the overlay projects avatar anchors (`avatars.registry`, `overlay/anchors.ts`) through `host.projection()`;
  - `core.attachScene` needs `heightAt` / `floorAt` / proxies / interior and vote cameras for movement and picking;
  - the social view's taps go through `core.pointer`;
  - lifecycle reads `isContextLost()`.

  In a worker each of these becomes an async message, so the overlay would trail the image by one frame unless anchors
  are double-buffered with the frame (worker posts `{frameId, viewProj, anchors[]}`, main applies them in its next
  rAF). The layout terrain (`heightAt` / `floorAt`) would be duplicated on both sides.
- **Fallback paths double.** Classic fallback, context loss, crash → Classic, and tier rebuilds all cross the worker
  boundary. A browser without `transferControlToOffscreen` + WebGL2-in-worker needs the current main-thread path
  anyway. Chrome 69+, Firefox 105+ and Safari 17+ have it; older Safari does not.
- **What it buys:** ≈ 4-6 ms per frame of render issue off the main thread, so DOM HUD, chat and voice work never
  compete with the town. It does not make the town render faster. On a 2-4 core laptop, total CPU per second is the
  same. The frame cap (§3.1) already removed the worst case: 120+ Hz.
- **Estimate:** 3-5 agent-days.
  - A `game3d/worker/` entry, plus a message protocol for state in (`Scene3dState` deltas) and frames out (projection
    + anchors).
  - A proxy `EngineHost` on the main thread.
  - Async `__ctCamera` hooks: the e2e suite would need awaits.
  - Duplicated layout helpers, and a main-thread fallback.
  - Risk: high (one-frame overlay lag, input / pick timing, debugging).
- **Recommendation:** not for v3.1. Revisit if real-device traces show main-thread contention between the HUD and the
  render, after items 1-3 of §4 have cut the issue cost.

## 6. Commands run (all green unless noted)

```
# harness builds on the host (minified + unminified for profiles), served static on 127.0.0.1:3455-3459, tunnelled
CT_AGENT=v3-perf-learn scripts/remote.sh bash .perflearn/build.sh <name>                # vite build -c vite.harness.config.ts
CT_AGENT=v3-perf-learn scripts/remote.sh env MINIFY=false bash .perflearn/build.sh <name>
CT_AGENT=v3-perf-learn scripts/remote.sh --no-sync bash .perflearn/serve.sh <name> <port> <secs>
ssh -N -L 3455:127.0.0.1:3455 ... <host>
# local GPU measurements (Node 22 + playwright-core 1.63 in the scratchpad, Chromium 1243, ANGLE/Vulkan, desktop GPU)
node measure.mjs <harness url> <label> [--uncapped]       # fps, draws, main-thread ms/s
node profile.mjs <harness url> [--load]                   # V8 CPU profile, self / inclusive ms per s
node ready.mjs <harness url> <label> 3                    # readyMs, long tasks
# tests / typecheck (host)
CT_AGENT=v3-perf-learn scripts/remote.sh bash .perflearn/check.sh apps/client/test/game3d/frameGate.test.ts \
  apps/client/test/game3d/bootPerf.test.ts                # 7 + 17 passed
CT_AGENT=v3-perf-learn scripts/remote.sh bash .perflearn/verify.sh   # pnpm -r run typecheck: exit 0
CT_AGENT=v3-perf-learn scripts/remote.sh sh -c 'pnpm exec vitest run apps/client/test/game3d'   # 29 files, 397 tests passed
```

The `.perflearn/` helper scripts are local and untracked. Each wraps one of the commands above under the shared
heavy-lock rule.

Failures on the way:

- The first `frameGate` `runFrameLoop` test expected ≤ 61 frames in 1 s at 240 Hz and got 63. The gate's vsync
  estimate settles over the first ≈ 30 frames. Fixed by measuring over 4 s.
- A `worldMatrix` bound (< 40 multiplies after `getWorldPosition`) got 45. Loosened to < 60, then the module was
  dropped (§3.2).
- The first harness measurement window let the scenario finish, and the harness destroys the town at the end (black
  screenshot). The driver now holds the scenario at its first still.
