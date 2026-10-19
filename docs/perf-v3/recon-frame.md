# v3 perf recon: frame time per quality tier (front "frame")

Author: `v3-perf-frame` (perf recon swarm, 2026-10-18). Scope: the 3D town's per-frame cost at `high` and `low`.
Covered: draw calls, programs, triangles, lights, shadow maps, post passes, render resolution, per-frame
allocations, and how the RAF work splits (game JS, vendor updaters, render issue, raster).
Contract: `docs/v3/INTEGRATION.md` §7. v2 budgets: `scripts/perf/budgets.mjs`.

**Read this first.** Every number here comes from Chromium on **SwiftShader**, which rasterises on the CPU, on the
shared game host (12 cores, load average 8-12 during the runs). Absolute fps and raster ms are a lower bound and
say little about a GPU. Three kinds of number are reliable:

- **renderer facts**: calls, programs, triangles, lights, passes, render-target sizes. They are identical on any
  machine.
- **JS ms in the synced runs**: main-thread JS of a frame stepped at the real 1/60 s rate.
- **ratios**: tier against tier, pass against pass, with and without characters.

Real-device frame times still have to come from `ct.debug.v3perf` (INTEGRATION.md §6.3).

## 1. Tooling (new files, all on the host via `scripts/remote.sh`)

| File | What |
|---|---|
| `tests/perf/v3-frame.ts` | Runner. Starts Vite DEV (unminified, so profiles attribute by source file) on 3488/3489, opens a blank same-origin page in SwiftShader Chromium, and mounts the **real** `createTownGame3d` over a fake connection: the v3 layout, the own player at spawn, and 14 remotes on a 12 Hz snapshot pump. Then it measures each tier, mode by mode (below). Writes `v3-frame.json` and a screenshot per tier. |
| `tests/perf/v3-frame-probe.js` | In-page probe (plain JS init script, no TS transform). It gets the renderer and scenes from three's `__THREE_DEVTOOLS__` `observe` events. It patches `Engine.prototype.renderAt` / `_updateSun` and `PixelCamera.prototype.update` through the **same module URL Vite served to the app**. It wraps `engine.updaters[i]`, `pipeline.render` (the host's runtime-opts wrapper), `scene.updateMatrixWorld`, `renderer.render` and `renderer.shadowMap.render` at runtime, and times RAF callbacks plus the microtask tail after them. Nothing in `game3d/` or the vendor tree is edited. Everything passes through unchanged while `__v3f.on` is false. |
| `scripts/perf/v3-frame-tree.sh` | Runs the tool against a **clean committed tree**. It does `git archive <rev>` on the editing machine, lays the current tooling and `ops.local.env` over it, uses sandbox `v3-perf-frame-<rev>`, holds the heavy and browser locks for the whole run, and pulls the results back. This keeps a running swarm's half-written files out of the measurement. |
| `scripts/perf/v3-frame-budgets.mjs` | Preview of the proposed `budgets.mjs` v3 frame keys (§5) read from `v3-frame.json`. Prints ok / OVER / SKIP rows. Not wired into `budgets.mjs`, which WP7 owns. |

Modes (`--modes`, default all):

- `census`: canvas and low-res size, `pixelScale`, render targets, enabled post passes, preRender hooks, lights by
  type, shadow maps, meshes, instanced meshes, casters, materials, programs by name, and the heaviest visible meshes.
- `counts` / `split`: RAF window, walking. Per frame:
  - draw calls, triangles, `pipeline.stageCalls`, shadow calls;
  - JS ms of the RAF callback, the microtask tail, `renderAt`, updaters (with the top updaters), camera, sun,
    `updateMatrixWorld`, and the issue time of the shadow / colour / normal / preRender / post / upscale renders;
  - rAF delta, DOM mutations per second, and the JS heap sawtooth.
- `synced`: back-to-back `renderAt(t += 1/60)` calls, each followed by a 1-px `readPixels`, so SwiftShader raster is
  included. `syncedPasses` also syncs after every `render()`, which gives raster ms per pass and per post pass.
- `whatif`: synced cost with one thing removed at a time:
  - shadow re-render, half shadow map, normal pass, preRender (reflections);
  - each post pass, all post passes;
  - `pixelScale + 1`;
  - hidden point lights.

  It ranks candidate optimisations by the raster share they would remove, without editing code.
- `cpu`: V8 CPU profile. Self ms per frame by bucket (`three`, `pixel3d/<dir>`, `game3d/<dir>`, GC, …), top
  functions, and inclusive time of hot three / vendor functions. A synced run and a RAF window.
- `heap`: V8 sampling heap profile including objects already collected by minor and major GC. Gives KiB allocated
  per frame and the top sites. A synced run (renderAt only, real step rate) and a RAF window (also reports KiB/s).
- `chars`: K extra vendor characters walking around the player. `charDelta` measures their exact cost at one camera
  position (shown + updating against hidden + paused). Then everything is re-measured.

Run (a clean committed tree; the tree script holds the locks):

```
scripts/perf/v3-frame-tree.sh 2ee23bd --tiers high,low --viewport 1920x1080 --secs 8 --frames 6 --chars 6 --out test-results/v3-frame-c0b
```

Run (the synced working tree, e.g. the wired C1 town; same args):

```
CT_AGENT=v3-perf-frame scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock flock $HOME/clocktower/browser.lock \
  timeout 2400 nice -n 19 pnpm exec tsx tests/perf/v3-frame.ts --tiers high,low --viewport 1920x1080 --out test-results/v3-frame'
```

Budget preview:

```
CT_AGENT=v3-perf-frame scripts/remote.sh --no-sync node scripts/perf/v3-frame-budgets.mjs test-results/v3-frame/v3-frame.json
```

Caveats of the method:

- **SwiftShader frame rate is 0.2-0.8 fps.** Time-stepped systems advance a capped 0.1 s per slow frame and so do
  far more work per frame than at 60 fps: character dynamics (fixed `dynamicsFps` steps), the 3 fps banner flutter,
  and 30 Hz reflections. RAF-window per-frame JS and allocations are therefore **inflated**. Use the **synced**
  numbers, stepped at t += 1/60, for per-frame JS and allocations. Read RAF-window allocations per second.
- **The river reflection renders at 30 Hz**, so it lands on every other 1/60 s frame. Its calls appear on half the
  frames. whatIf takes the mean over an even frame count (r2). The r1 whatIf used p50 over 3 frames and mixes
  frames with and without the reflection at high (§2.4).
- **The walk moves the camera.** Calls compared across windows change with the view. `charDelta` (r2) is the exact
  per-character number.
- **The probe allocates a little**: one frame record (about 0.5 KiB) per instrumented frame. It shows up as
  `probe/other`.
- **DEV is not production.** The JS heap (185-220 MB) and the module count are DEV figures. Allocation and CPU
  attribution by file are what DEV is for.

## 2. Baselines

Setup for all runs below:

- Vite DEV, SwiftShader (`ANGLE … SwiftShader Device (Subzero)`), viewport 1920×1080.
- Hollowmere square at the spawn, noon (C0b) or the WP3 stage hour 10:00 (HEAD).
- Own `wanderer` avatar; the stub draws no remotes.

Trees:

- **C0b** = `2ee23bd`: committed stub, `buildHollowmere` noon, no point lights, a 2-frame warm-up.
- **HEAD** = `4998ca5`: "v3 C1 WIP", whose stub uses the WIP WP3 `createStage` with a constant 12 / 8 light pool,
  canopy fade, and whole-town warm-up.

Run r1 (2026-10-18, 05:26-06:09 UTC). Host load: C0b 8.1 before / 11.3 after, HEAD 10.4 / 11.3.

### 2.1 Renderer facts at the square

| | C0b high | C0b low | HEAD high | HEAD low |
|---|---|---|---|---|
| pixelScale → low-res (RT incl. 2 px margin) | 3 → 640×360 (644×364) | 4 → 480×270 (484×274) | 3 → 640×360 | 4 → 480×270 |
| draw calls, colour (incl. shadow) / normal / post / upscale | 146 / 81 / 8 / 1 = **236** | 111 / 73 / 8 / 1 = **193** | 149 / 80 / 8 / 1 = **238** | 112 / 75 / 8 / 1 = **196** |
| + river reflection (preRender, every 2nd frame at 60 fps) | +46-48 | 0 (low: sky-only) | +46 | 0 |
| shadow-pass calls | 60 | 34 | 64 | 34 |
| triangles per frame (shadow + colour + normal [+ refl.]) | 0.69 M (0.85 M with refl.) | 0.24 M | 0.71 M (0.85 M) | 0.25-0.30 M |
| visible meshes / casters | 218 / 66 | 291 / 37 | 218 / 68 | 291 / 37 |
| scene nodes (matrixAutoUpdate) | 408 (399) | 468 (459) | 452 (443) | 508 (499) |
| materials / programs | 33 / **35** | 23 / **35** (+1 late, below) | 33 / **42** | 23 / **41** |
| point lights (visible, intensity > 0 at day) | 0 | 0 | **12** (0 lit) | **8** (0 lit) |
| sun shadow map | 4096², 1 light | 2048², 1 light | 4096² | 2048² |
| enabled post passes | 8: contact, outline, river, water-fountain, water-fountain-bowl, water-well-0, grade, vignette | same 8 | same 8 | same 8 |
| render targets | 4 × RGBA16F (scene + float depth texture, normal, A, B) | same | same | same |
| updaters | 31 | 31 | 32 | 32 |

C0b low compiled one program late (35 → 36 at the low "chars" window): `house-7-cap`, the first time house-7
came into view. The C0b warm-up renders only two frames at the square. WP3's whole-town warm-up (HEAD) fixes this:
programs stayed constant in every HEAD window. Both runs show the reason WP3's `warmWholeTown` must stay mandatory.

### 2.2 Where a frame goes (SwiftShader raster, synced per pass, ms, p50)

| | shadow | colour | normal | post (8) | upscale | total synced |
|---|---|---|---|---|---|---|
| C0b high | 46 | 1535 | 1510 | 222 | 31 | 3400 |
| C0b low | 13 | 513 | 516 | 129 | 31 | 1210 |
| HEAD high | 43 | 1808 | 1782 | 215 | 31 | 3890 (+14 %: the 12-light pool) |
| HEAD low | 13 | 613 | 611 | 126 | 31 | 1400 (+16 %: 8 lights) |

Post pass split (high, synced per pass, ms):

| water-fountain-bowl | water-well-0 | water-fountain | river | outline | contact | grade | vignette |
|---|---|---|---|---|---|---|---|
| 55 | 51 | 44 | 28 | 23 | 14 | 6 | 3 |

**The four water passes are 80 % of the post chain.**

### 2.3 What-if (synced, % of the frame removed)

| experiment | C0b high* | C0b low | HEAD high | HEAD low |
|---|---|---|---|---|
| skip the normal pass | 48 | **43** | **46** | **44** |
| hide the point lights (→ 0-light programs: 42 → 62 / 41 → 60) | n/a | n/a | **16.5** | **12.8** |
| pixelScale + 1 (640×360 → 480×270; 480×270 → 384×216) | 9.9 | 11.8 | 10.3 | 11.4 |
| all post passes off | 9.9 | 8.6 | 5.2 | 8.1 |
| water passes off (sum of the four single runs) | ≈ 12* | 5.6 | 4.1 | 3.8 |
| no shadow re-render | 5.2* | 0.4 | 0.2 | 1.7 |
| half shadow map | 0.6 | -0.2 | 1.0 | -1.4 |
| no preRender (river reflection) | 4.5* | (off) | ≈ 0 | (off) |

\* C0b high r1 mixes frames with and without the 30 Hz reflection: its rows differ by about ±5 % from that alone
(r2 fixes this). Read across the table:

- **SwiftShader is geometry-bound here.** The normal pass is a full second scene render and costs as much as the
  colour pass. `pixelScale + 1` removes 44 % of the pixels but only 10-12 % of the time.
- The **point-light pool** is the next item. A 12-light loop runs in every lit fragment by day too, because the pool
  stays at intensity 0 and keeps its count.
- Shadows are cheap here: 1-4 % of the raster.

On a real GPU the ratios shift toward fill rate and toward CPU issue cost. That is why §4 ranks by both.

### 2.4 Main-thread JS per frame (host CPU)

Synced runs, at the real 1/60 s step rate:

| | renderAt | of which pipeline issue | updaters | updateMatrixWorld | shadow / colour / normal / post issue |
|---|---|---|---|---|---|
| C0b high | 2.8 | 2.4 | 0.3 | 0.1 | 0.3 / 0.6 / 0.5 / 0.1 |
| C0b low | 2.5 | 2.1 | 0.3 | 0.2 | 0.3 / 0.9 / 0.5 / 0.2 |
| HEAD high | 3.1 | 2.6 | 0.4 | 0.1 | 0.3 / 0.7 / 0.5 / 0.1 |
| HEAD low | 2.6 | 2.2 | 0.3 | 0.2 | 0.4 / 0.9 / 0.5 / 0.2 |

RAF windows, walking (p50, ms):

| | RAF callback | renderAt | game JS outside renderAt | river reflection issue |
|---|---|---|---|---|
| C0b high | 6.1 | 4.8 | 1.3 | 0.9 (when it renders) |
| C0b low | 6.6 | 5.0 | 1.6 | - |
| HEAD high | 6.7 | 5.2 | 1.5 | 1.1 (when it renders) |
| HEAD low | 6.9 | 3.8 | 1.4 | - |

- "Game JS outside renderAt" is `TownGame3d` `frame()`. In the stub that is net, interpolation, prompt, camera, and
  the own character's `update`, which is inflated at SwiftShader fps.
- The microtask tail is 0-0.1 ms: the stub has no overlay. Overlay DOM mutations: 0 per second.
- CPU profile, inclusive per frame, RAF window:
  - **three `setProgram` is 2.2-3.3 ms** and three uniform `upload` is 0.9-2.3 ms. That is about half of
    `renderAt`. Uniform upload grows with the light pool: HEAD > C0b. The light arrays are flattened and uploaded
    on each program switch.
  - `projectObject` 0.5-0.6, `updateMatrixWorld` 0.1-0.3, GC 0.5-1.4.
  - The vendor `pixel3d/*` buckets are ≤ 0.35 ms each.
- Main-thread busy outside the GPU wait is under 1 % of wall time. At these fps the main thread mostly waits for
  SwiftShader.

### 2.5 Per extra character (vendor rig via `vendor/characters.ts`; no game LOD)

r1 window deltas are confounded by the walking camera. They are kept here only as a range; exact `charDelta`
numbers are in §2.7 (r2).

- **Calls:** +8.5 per character (C0b high), +5.5 (HEAD high), +12 (low, both trees). The rig itself is one
  SkinnedMesh with one material, `frustumCulled = false`, casting. That makes 3 calls (shadow + colour + normal).
  At high, the fx overlay SkinnedMesh, motes and smears come on top. The low tier's +12 is unexplained by the rig
  alone and is what `charDelta` resolves.
- **Scene graph:** +40 nodes (bones) per character, +1 SkinnedMesh at low, +2 at high (hit-flash overlay).
- **JS, synced:** renderAt +0.07-0.17 ms per character (update + issue). The RAF windows show +0.5-0.6 ms per
  character, inflated: fixed-step dynamics, see §1.
- **Programs:** at C0b, +4 to +6 at the first spawns (character materials). They stay constant afterwards.

### 2.6 Allocations

RAF windows, r1: 490-760 KiB per slow frame. That figure is dominated by time-driven work:

- the 12 Hz snapshot pump (`TownGame3d.ts:94-95 onSnapshot`, 40-100 KiB per slow frame);
- `town/life/wind.js:33`, the banner flutter, 48-104;
- character dynamics, which are fixed-step;
- three uniform setters (`setValueV3f` / `copyArray`, 22-46);
- the C0b-low lazy compile.

The synced heap (r2, §2.7) is the per-frame figure.

### 2.7 r2: not run

The r2 tool version (synced heap, `charDelta`, even-frame what-if, `topMeshes`, per-character census) is
committed to the tree but has **not been run**. Both r2 jobs waited about 2 h behind 16-17 other heavy-lock jobs.
They were cancelled so they would not run unattended. The first run of the current tool should be the C1 run (§6).
Until then:

- **Per-character calls: likely 3 at low.** The rig is one SkinnedMesh with one material, drawn in shadow, colour
  and normal (`rig.js:1201-1205`). At high, add the fx hit-flash SkinnedMesh and motes (+2 nodes, +1 skinned mesh
  per character in the census). The +12 / +8.5 r1 deltas include view changes from the walk.
- **Allocation budget: provisional.** Set it from `heapSynced.kbPerFrame` of the first run.

## 3. Code findings on this front (file:line)

- **Normal pass = a second full scene render** (`v3/pixel3d/src/core/PixelPipeline.js` `render()` step 3).
  Same materials, same scene traversal, `uPassMode = 1`. It accounts for 29-38 % of the calls and 43-48 % of
  SwiftShader raster.
- **Water bodies are fullscreen low-res post passes, one per body** (`v3/pixel3d/src/world/water.js:614`
  `addPass`). Four are enabled at the square: river, fountain, fountain bowl, well. Each one reconstructs a world
  position per texel and runs the shape test plus the waves / sparkles / reflection shader on every texel. The
  `vis()` updater only turns off bodies that are entirely off-screen.
- **The constant 12 / 8 point-light pool** (WP3 `world/lights.ts`, `vendor/time.ts`) keeps every lit program at
  `NUM_POINT_LIGHTS = 12/8`, day and night. three uploads the light arrays on every program switch:
  `flatten`, `setValueV3f`, `copyArray` are among the top self functions.
- **River reflection at high:** `water.js:551-558`, `reflectFps` 30 by default. It is a third scene render of about
  46 calls and 0.15 M tris on every other frame, 0.9-1.1 ms of JS issue when it runs. Low skips it.
- **Rig `frustumCulled = false`** (`v3/pixel3d/src/chars/rig.js:1205`). Every character is drawn and skinned in 3
  passes even when off-screen. The WP2 LOD (`avatars/layer.ts:482-486`, low only, > 12 m from the camera target)
  moves far bodies to COLOR_ONLY without shadow. `body.update` runs for every body in the viewer's location, not
  just on-screen ones (`layer.ts:557-605`).
- **Shadow-caster culling recomputes every frame** (`town/town.js:236` `run`): 16 corners × about 100 static
  meshes, even when the camera and sun are still. Small, 0.02-0.05 ms.
- **Vendor per-frame allocations:**
  - `Engine._updateSun`: `camera.target.clone()` plus 2 `new Vector3` per frame.
  - `PixelCamera.set`: `new THREE.Matrix4()`, called twice a frame by WP1's `CameraRig.step`.
  - `PixelCamera.snapWorld(p, out = new Vector3())` when a caller passes no `out` (the characters' texel snap;
    WP1's camera passes one).
  - `installLights` flicker: an array literal per light per frame (`town/api.js:287`).
  - `Character._step`: `new Vector3` / `new Vector2` per step and `JSON.stringify(ev.poseMap)` (`character.js:229-260`, `:350`).
  - `wind.js` banner flutter: `forEach` + destructuring over the banner vertices, then `needsUpdate` on the
    **whole dais solid position buffer** 3 times a second.

  On the game side, `vendor/characters.ts driveAlong` allocates `at(t).clone()` plus an object per sampled step
  (WP2; note it in the WP2 review). The stub's `onSnapshot` allocates `Set` / sample objects at 12 Hz (WP1 core
  replaces it).
- **Render targets are all RGBA16F**: scene, normal, and the post ping-pong A and B, plus a float depth texture. At
  640×364 that is about 7.5 MB of render-target writes and reads per pass chain. A bandwidth item on iGPUs; the
  normal target could be RGBA8.
- **Upscale** is one fullscreen pass at canvas size, 1080p: about 2.1 M fragments with one fetch at an integer
  scale. 31 ms SwiftShader; cheap on a GPU.
- **RAF loop**: `perf.ts runFrameLoop` already supports `fpsLimit`, used only for tests.

## 4. Ranked optimisations

Ranking = expected real-device gain × confidence ÷ risk. "Needs C1" means it touches `game3d` code the other swarm
is finishing, or needs the wired town to verify.

1. **Light pool: no point lights by day.**
   - Change: switch the pool's `visible` with darkness, not only its intensity, and compile both light-count
     program sets in the warm-up.
   - Files: `world/lights.ts`, `vendor/time.ts`, `world/stage.ts` (`warmUp`).
   - Gain: SwiftShader 16.5 % (high) / 12.8 % (low) of the frame. On a GPU this is fragment work in every lit
     fragment of the colour and normal passes, plus 12 lights' uniform upload per program switch on the CPU.
     Estimated 0.5-2 ms on an iGPU by day.
   - Cost: programs 42 → 62 / 41 → 60, compiled behind the loading screen. That adds warm-up time; measure it.
     "Programs constant" becomes "constant after the warm-up, never compiled after ready".
   - Risk: medium. The dusk switch must not hitch, so the warm-up must cover both variants, including the interior
     rooms and character materials. Needs C1.
2. **Merge the four water passes into one, or skip them per pixel early** (vendor CONTRACT-REQUEST).
   - Change: one water pass with a uniform array of shapes and an early shape AABB test. Or a single pass that
     writes only the texels inside the union of the shapes' screen bounds.
   - Gain: −3 fullscreen passes. 80 % of the post chain (178 of 222 ms SwiftShader high). Estimated 0.5-1.5 ms
     iGPU.
   - Risk: low-medium (vendor shader).
   - Game-side interim, low tier: turn off `water-well-0` and `water-fountain-bowl` while they are below N px on
     screen. A look change; needs the user's or art's OK.
3. **Normal pass: MRT, or a slimmer normal pass** (vendor CONTRACT-REQUEST, `PixelPipeline.js`).
   - Change: write colour and normal in one pass with WebGL2 `drawBuffers`. COLOR_ONLY objects get a second small
     pass with drawBuffers `[COLOR, NONE]`. Alternative: move FLAG_NONE soft dressing into COLOR_ONLY, with
     occlusion handled in the outline pass.
   - Gain: −73 to −81 calls per frame (about 0.5-0.6 ms of JS issue), half of the vertex work, and up to 44-48 % of
     SwiftShader raster.
   - Risk: high (outline flags, occlusion through foliage, every material's `uPassMode`). The biggest single item.
4. **River reflection at high: lower `reflectFps`, and skip it when the river covers few texels.**
   - Change: the vendor exposes `pass.reflection.fps / .cropOn / .cullFigures` (`water.js:629`). Set
     `fps = 15` from `vendor/town.ts` after the build.
   - Gain: about 0.25-0.5 ms average JS at high, −23 calls average, and GPU time for 0.15 M tris.
   - Risk: low. The reflection updates less often, so check that the river ripple looks the same.
   - Owner: WP3 (`vendor/town.ts`). Needs C1 only to verify the look.
5. **Characters: cull and throttle off-screen bodies.**
   - Change, in `avatars/layer.ts`: when a body's feet plus a shadow margin fall outside the view box, hide its
     holder and update it at a lower rate. The vendor `Character` re-simulates from its fixed grid, so a lower rate
     is cheap to catch up. Also extend the "far" LOD (COLOR_ONLY, no shadow) to `high` beyond about 18 m.
   - Gain: per hidden body −3 calls (5-8 at high with fx), skinning, and its update.
   - Risk: medium (shadows popping at the view edge, re-sim catch-up spikes). Needs C1.
   - The INTEGRATION.md §7 budget of ≤ 6 calls per character at low needs the r2 `charDelta` number. A rig is 3
     calls by itself. Fx (high only) and anything else per character have to fit in the rest.
6. **Low tier: optional 30 fps cap.**
   - Change: `runFrameLoop` `fpsLimit`, already in `perf.ts`. Set it from the tier, or from a Graphics setting
     "battery saver".
   - Gain: halves GPU and CPU per second on iGPU laptops. The §7 low budget (p50 ≤ 33 ms) already assumes 30 fps
     is acceptable.
   - Risk: low technically. A product decision (smoothness). The perf sampler is unaffected: a 30 fps cap
     (33.3 ms) never trips the 45 ms median. Needs C1 only for the setting UI.
7. **Shadow map: update on change at low.**
   - Change: `renderer.shadowMap.autoUpdate = false`, and set `needsUpdate` only when the sun direction, the
     snapped shadow-camera centre, or a casting character moved. Owner: `vendor/engineHost.ts`. The pipeline's
     `shadowOnce` logic honours `autoUpdate = false`.
   - Gain: −34 to −64 shadow calls on idle frames, about 0.3-0.5 ms of JS issue, and the 2048² / 4096² depth
     raster on an iGPU.
   - Risk: medium (characters breathe at idle, so their shadows must still update). SwiftShader shows only 0.4-5 %;
     real-GPU gain unverified.
8. **Static scene graph: `matrixWorldAutoUpdate = false` on static piece subtrees** after the build.
   - Gain: `updateMatrixWorld` is 0.1-0.3 ms per frame today over 400-500 nodes. Characters add about 40 nodes
     each, so 15 characters add 600 and roughly double it.
   - Risk: low-medium. Doors (house pivots), cut-away lifts, banners and life props must stay dynamic, so use an
     allow-list.
   - Owner: WP3 (`vendor/town.ts` after `installRuntimeOpts`).
9. **Per-frame allocations.**
   - Game side:
     - `vendor/characters.ts driveAlong` (reuse the sample vector);
     - `world/stage.ts` canopy points: an object per avatar per frame, so pool them;
     - the regex `/^house-\d+$/` over the buildings every frame (precompute the house list).
   - Vendor CONTRACT-REQUESTs: `_updateSun`, `PixelCamera.set` / `snapWorld`, flicker array literal,
     `Character._step` temporaries and `JSON.stringify`, `wind.js` (update only the banner vertex range with
     `addUpdateRange`).
   - Gain: GC 0.5-1.4 ms per frame in the RAF windows. Synced numbers in §2.7.
   - Risk: low.
10. **Render-target formats** (vendor CONTRACT-REQUEST): normal RT RGBA8, and post ping-pong RGBA8 after the
    grade.
    - Gain: about 30-40 % of render-target bandwidth on an iGPU.
    - Risk: medium (banding, outline precision).
11. **Shadow-cull and light-select caching by camera key** (vendor). Low gain, under 0.05 ms.

No change suggested:

- **pixelScale** (`coords.ts pixelScaleFor`): high keeps 360 rows, low 270. `pixelScale + 1` buys only 10-12 % on
  SwiftShader and would cost the look.
- **The 4096 high shadow map**: halving it buys about 1 %.
- **grade / vignette / outline / contact**: 1-3 % together.

## 5. Proposed `scripts/perf/budgets.mjs` keys (v3 frame)

These are counts from `tests/perf/v3-frame.ts` (machine-independent) plus generous SwiftShader-host JS bounds.
Preview them with `scripts/perf/v3-frame-budgets.mjs`. Values are the C0b / HEAD measurement +15-20 % unless
INTEGRATION.md §7 fixes them. **Re-baseline at C1**: the wired town adds avatars, overlay and NPCs.

| key | max | rationale |
|---|---|---|
| `v3CallsHigh` | 330 | square, high, 1080p, town + own avatar, incl. the river reflection frame (284 measured) |
| `v3CallsLow` | 240 | square, low (196 measured) |
| `v3CallsPerCharHigh` | 12 | §7 |
| `v3CallsPerCharLow` | 6 | §7 (needs the LOD; see §4.5) |
| `v3ProgramsHigh` / `Low` | 48 / 48 | 42 / 41 at HEAD + characters; becomes ≈ 70 if §4.1 lands (then re-set) |
| `v3ProgramDrift{High,Low}` | 0 | no program compiled after ready (any window) |
| `v3PointLights{High,Low}` | 12 / 8 | §7 constant pool |
| `v3ShadowMapLow` | 2048 | §7 |
| `v3PostPasses{High,Low}` | 8 / 8 | today's 8; §4.2 should take them to 5 |
| `v3AllocKbPerFrame{High,Low}` | 64 / 64 (provisional) | renderAt allocations per real frame (`heapSynced`). Re-set from the first run of the current tool +20 % (§2.7) |
| `v3SwsJsFrameP50Ms{High,Low}` | 25 / 20 | RAF JS on the SwiftShader host (6.1-6.9 measured with the stub): relative only, catches gross regressions |
| `v3WalkDomMutPerSec` | 40 | §7 (WP4; 0 with the stub) |

## 6. Status and next measurements

- r1 (C0b + HEAD): done, numbers above. Raw JSON on the host:
  - `~/clocktower/work/v3-perf-frame-2ee23bd/test-results/v3-frame-c0b/v3-frame.json`
  - `~/clocktower/work/v3-perf-frame-4998ca5/test-results/v3-frame-head/v3-frame.json`
- r2: not run (§2.7).
- **At C1, re-run on the wired tree**, same args, working tree:
  - the 15 drawn players (LOD at low) and the townsfolk;
  - the overlay microtask and DOM mutations per second;
  - a walk across the square;
  - a night hour, where the pool is lit (whatIf `point-lights-hidden` at night measures the pool's real cost);
  - an interior.

  Then set the `budgets.mjs` keys from that run.
