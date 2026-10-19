# v3.3 perf: the remaining per-frame GPU / driver overhead (front "gpu")

Agent `v33-gpu`, 2026-10-18, branch `v33-gpu` from `v3-game` (`5e346db`, the v3.1 merges incl. `world/merge.ts`).
Scope: the river reflection, the draw order, uniform uploads / program switches, and whatever else a CPU profile of
`renderAt` shows, plus a verdict on the v3.1 static merge (BatchedMesh). Parallel fronts not touched: v33-tiles,
v33-bake, v33-sprites, v33-light.

**Headline.** The v3.1 BatchedMesh merge was slower than no merge because of a **three r170 bug**: every draw of a
`BatchedMesh` re-resolves its program (`setProgram` reads `object.colorTexture`, a field that does not exist; the real
one is `_colorsTexture`, so `undefined !== null` forces `needsProgramChange`). Plus a second, smaller cause: the batches
share the kit materials with the doors / boards / lanterns, so the material-then-depth sort flips the same material
between its batched and plain program. Both are fixed game-side (`world/merge.ts`), pixel-identical:

| `renderAt` JS per frame, high, uncapped | v3.1 (batch) | **v3.3 (batch + fixes)** | no merge | draws v3.1 → v3.3 (no merge) |
|---|---|---|---|---|
| square-day-8, desktop | 1.482 ms | **1.330 ms (−10 %)** | 1.324 ms | 261 → 261 (340) |
| night-15, desktop | 1.380 | **1.238 (−10 %)** | 1.257 | 242 → 242 (319) |
| vote-12, desktop | 1.862 | **1.688 (−9 %)** | 1.708 | 349 → 348 (445) |
| south-bay, desktop | 1.114 | **0.958 (−14 %)** | 0.957 | 206 → 204 (246) |
| square-day-8, CPU ×4 | 6.298 | **5.709 (−9 %)** | 5.678 | |
| night-15, CPU ×4 | 5.951 | **5.346 (−10 %)** | 5.417 | |
| vote-12, CPU ×4 | 8.247 | **7.340 (−11 %)** | 7.358 | |
| south-bay, CPU ×4 | 4.939 | **4.204 (−15 %)** | 4.131 | |

So with the fixes the merge is CPU-neutral (within ±1-2 % of no merge) and keeps its −20 to −22 % draws (and
−20 % shadow draws), which is what a laptop GPU / driver pays for. **merge.ts verdict: keep the batch mode ON, with the
fixes, at `low` / `cpu`; do not switch to the plain-merge mode. At `high` on an integrated GPU the laptop front saw
+1-2.5 ms of GPU time with the v3.1 merge (the fixes do not change GPU work): off there (or `cull: 'three'`) until a
laptop re-run with this branch (§7).** Item results in §8.

## 1. Method

- Tree: this branch, harness build (`vite.harness.config.ts`, minified; a `--minify false` build for CPU profiles) on
  the host, `vite preview` on 127.0.0.1:3495 / 3496, SSH tunnel to the editing machine.
- Browser: Chromium 1243 headless on the editing machine's desktop discrete GPU (ANGLE / Vulkan), 1280×800 window,
  harness stage 960×540, tier forced by the URL (`high` unless noted; low-res RT 320×180 + margin at pixelScale 3).
  **Uncapped** (`--disable-gpu-vsync --disable-frame-rate-limit`, `fps=-1`): rendered fps = real per-frame cost.
  CPU ×4 = CDP `Emulation.setCPUThrottlingRate`. SwiftShader: `--use-angle=swiftshader`, tier `cpu`.
- Scenarios (`tests/v3/scenarios`): `square-day-8` (day, 8 players + ST on the square), `night-15`, `vote-12` (the
  vote frame, 12 players), `south-bay` (the bay: the only place the river and its reflection are on screen at the
  square's zoom). Each is held at its first still (the harness clock stops; the town keeps animating).
- A new debug hook `window.__ctGpu` (`ct.debug.v3gpu=1`, `vendor/engineHost.ts`) switches every lever **at runtime**,
  so the variants of one table run in ONE mount, alternating (A B C D, A B C D, A B C D; 3 s windows, 0.7 s settle).
  Per window: `renderAt` wall time per frame (a wrapper around `engine.renderAt`), `renderer.info.render.calls`, fps,
  programs. "no merge" (`ct.debug.v3merge=0`) is a separate mount (build-time switch).
- Pixel A/B: the same frame re-rendered with lever A, B, A (`__ctGpu.render()`: pipeline only, no updaters, shadow map
  re-rendered), canvas read back, max channel delta per pixel; "a/a" (A vs A again) = 0 proves the frame is
  reproducible.
- Program re-resolves: every scene material's `customProgramCacheKey` wrapped (three calls it only from
  `getParameters`, i.e. only when `setProgram` decided `needsProgramChange`), counted per frame and per drawn object.

## 2. The v3.1 merge regression, explained and fixed

Per-frame program re-resolves at square-day-8 high (each = `getProgram` → `getParameters` (~100 fields) +
`getProgramCacheKey` (string join) + a fresh uniform list for the material):

| | re-resolves / frame | by whom |
|---|---|---|
| v3.1 (batch, shared materials) | **26** | 14 = every batch draw in every pass (the r170 `colorTexture` bug); 12 = plain kit meshes drawn right after a batch of the same material (stall lanterns, garlic string, ...) |
| + `colorTexture` fix | 12 | the batched / plain flips only |
| + own material twins | **0** | |
| no merge | 0 | |

CPU profile (unminified, desktop, before the fixes): `getProgram` 0.13 ms/frame inclusive (`getParameters` 0.07),
≈ 8 % of `renderAt` at 1.6 ms; `seqWithValue` (the rebuilt uniform list) visible only with the flips. That is the
whole v3.1 delta stage.md §6.3 measured (+0.3-0.7 ms at high on the host CPU) and why `renderOrder −1` did not help
(it cut the flips, not the bug).

Fixes (`world/merge.ts`, both default on, both A/B switches):

1. `fixBatchColorTexture(bm)`: a `colorTexture` getter on each BatchedMesh that returns `_colorsTexture ?? null`, so
   three's test is right. Skipped automatically when a future three defines the field. `ct.debug.v3batchFix=0` = off.
2. `twinMaterial(m)`: each merged mesh draws with its own twin of the shared kit material (three's `clone()` + the SAME
   `onBeforeCompile` / `customProgramCacheKey` / `userData` / `defines` / canopy record objects). Same program cache key,
   so three reuses the compiled program (programs 51 at square-day-8 high either way) and every uniform the vendor
   hooks attach by reference is shared. Runtime-safe: `sync()` mirrors `visible / opacity / transparent / depth* /
   colorWrite / side / alphaTest` every frame and re-copies the twin when the vendor bumps the material version.
   `ct.debug.v3batchMat=0` = shared materials. (The first version forgot `defines`, which three's `copy()` does not
   know: the twin compiled a different program and drew different colours on 100-200 k pixels. Caught by the pixel A/B;
   fixed; now 0 px.)

Step by step (means of 3 rounds, desktop / ×4):

| scenario | v3.1 | + colorTexture fix | + twins | + smart reflect + water cull (final) |
|---|---|---|---|---|
| square-day-8 | 1.482 / 6.298 | 1.428 / 6.080 | 1.332 / 5.690 | 1.330 / 5.709 |
| night-15 | 1.380 / 5.951 | 1.332 / 5.725 | 1.237 / 5.346 | 1.238 / 5.346 |
| vote-12 | 1.862 / 8.247 | 1.803 / 7.964 | 1.697 / 7.463 | 1.688 / 7.340 |
| south-bay | 1.114 / 4.939 | 1.047 / 4.639 | 0.973 / 4.317 | 0.958 / 4.204 |

`low` tier (what integrated GPUs get), same method, desktop / ×4:

| `low` | v3.1 batch | v3.3 batch (final) | no merge | draws batch / no merge |
|---|---|---|---|---|
| square-day-8 | 1.202 / 5.095 ms | **1.068 / 4.556 (−11 %)** | 1.064 / 4.558 | 181 / 244 (−26 %) |
| vote-12 | 1.501 / 6.464 | **1.333 / 5.715 (−11 / −12 %)** | 1.340 / 5.757 | 260 / 334 (−22 %) |

Pixels at `low`: 0 px for twins, smart reflection and v3.1 vs final in all four scenes.

The same levers on the unmerged town (`v3merge=0`) change nothing (±0.5 %, as expected: no BatchedMesh). The plain
merge mode (`v3mergeMode=merge`, 12 m cells) measured 1.37 / 6.31 ms at square-day-8 in the first run: no better than
no merge, only −24 draws. Not recommended.

SwiftShader, tier `cpu` (960×540 stage, 3 rounds × 6 s, uncapped): square-day-8 11.1 → 11.4 fps (90.3 → 87.9 ms),
vote-12 6.5 → 7.1 fps (157 → 141 ms) for v3.1 → final. Draws unchanged (81 / 119); the cpu tier has no reflection.

## 3. Item 1: the water

What the town actually has (vendor `ground.js`, `props.js`): ONE planar reflection (the river, `high` only; `low` and
`cpu` build it with `reflection: false`), gated by the vendor to frames where the bay can be on screen; and 4 water post
passes (river, fountain basin, fountain bowl, well) that are full-screen low-res passes with an early `return base`.
The fountain / bowl / well never render a reflection.

**Reflection refresh policy** (`vendor/gpuLevers.ts`, `ct.debug.v3reflect`): the vendor re-renders the cropped
reflection at 30 Hz (a scene render of ≈ 46-58 draws) whenever its 30 Hz bucket turns over. `smart` (default) keeps the
vendor's own logic while the camera moves; with a still camera it refreshes only when a figure that can reach the
cropped reflection moved (≥ 3 cm), entered or left, when the lighting key changed (sky / sun / ambient / toon-ramp
uniforms), or at `reflectIdleFps` (10 Hz) for the ambient motion. Bodies get a phase offset (no same-frame spikes once
there are several).

| capped 60 fps, held still, high | draws / frame | reflection renders / s (from the draw delta) |
|---|---|---|
| south-bay: vendor 30 Hz | 235.0 | ≈ 15-17 (one per 30 Hz bucket at 60 fps) |
| south-bay: smart | 227.9 | ≈ 7-10 |
| south-bay: every frame (`v3reflect=0`) | 262.4 | 60 |
| vote-12: vendor / smart / every frame | 372.5 / 354.6 / 392.3 | ≈ 23 / ≈ 7 / 60 |

Cost of one reflection render (every-frame minus base, uncapped): ≈ 0.30 ms desktop, ≈ 1.2-2.0 ms at ×4. So `smart`
saves ≈ 15-20 renders/s × that = ≈ 5 ms/s desktop, **≈ 20-35 ms of main thread per second at ×4** (≈ 0.3-0.6 ms per
60 fps frame) whenever the bay is on screen and the camera rests. Uncapped fps hardly moves (a 30 Hz refresh is 1 frame
in 15-30 at 500-900 fps), which is why the per-frame table above shows it only as −0.01 to −0.1 ms.

Pixels: smart vs a fresh reflection of the same instant: **0 px** at square-day-8 / night-15 / vote-12 / south-bay
(stills held for > 1 s under `smart`). A walking figure in the reflection still refreshes at the vendor's rate.

Also measured: a fixed 15 Hz (`v3reflect=15`) — saves the same renders but halves the reflected figures' motion
rate; `smart` is strictly better. Lower resolution / every-other-frame for the reflection: not applicable (the RT is
already the low-res grid, cropped, at 30 Hz). Static-reflection caching (static scene once into a larger RT, figures
live on top) needs a colour + depth copy per refresh and a second render list; with `smart` the remaining refreshes are
mostly the 10 Hz ambient ones, so the extra gain would be ≈ 7 renders/s at the bay only: not done (follow-up 2).

**Off-screen water passes** (`ct.debug.v3waterCull`, default on): a water post pass whose shape bounds (at its level,
+ 0.5 m) are entirely outside the frame is disabled for that render. Pixel-identical by construction (outside its
shape the pass writes `base` unchanged; the ping-pong order does not change the image): 0 px in all four scenes. At the
bay it skips the fountain, bowl and well passes (−3 full-screen passes, −3 draws); at the square all bodies are in
view (no change). Merging the water passes into one shader stays a vendor CONTRACT-REQUEST (learnings.md §4.4).

## 4. Item 2: fixed draw order

three already sorts opaque objects by material, then front to back (the fixed camera makes that order stable), and the
sort itself is ≈ 4 µs / frame (`painterSortStable` + `sort`, profile). The lever `ct.debug.v3sort=program` orders
program → material → depth (a stable small integer per program source + object kind), so materials that share a
compiled program follow each other (three then skips `useProgram` and the light / camera re-upload between them).

| desktop / ×4, batch + fixes | three's sort | program sort |
|---|---|---|
| square-day-8 | 1.332 / 5.690 | 1.347 / 5.804 (first run) |
| night-15 | 1.237 / 5.346 | 1.255 / 6.098 (first run, noisy) |
| vote-12 | 1.697 / 7.463 | 1.686 / 8.580 (first run, noisy) |

Within noise, and it moves depth ties between coplanar faces of different materials (vote-12: 4 px, max Δ 7). **Off by
default.** Early-z / overdraw: the low-res colour target is 0.07 Mpx; a strict front-to-back order would add program
switches (CPU) to save fill that is not the bottleneck on any measured device. Not pursued.

## 5. Item 3: uniform uploads and program switches

With the merge fixed, `setProgram` is ≈ 0.67 ms of a 1.56 ms frame (desktop profile). What it is made of (self ms /
frame): `setValueV4fArray` 0.057 + `setValueV3fArray` 0.045 (array uniforms re-flattened on every material switch:
the cut-away's 5 `vec4[]` arrays (`uCutBoxC/H/S`, `uCutLiftC/H`) and three's `lightProbe[9]`), `setValueM4` 0.043-0.05,
`setValue` 0.045, `setValueV3f` 0.03, then `uniform*` GL calls. Program switches re-upload the light arrays (12 point
lights at high) only when the program changes, not per material.

- Per-object uniform updates in `game3d/**`: none per frame (audited: `needsUpdate` writes are one-shot or on change;
  no `onBeforeRender` hooks in the town; the character rig's `mat.onBeforeRender` / `mesh.onBeforeRender`
  (`applyFlags`, `farSide`, `snapShift`, ≈ 0.02 ms / frame) belong to v33-sprites' front).
- Lever not done: the cut-away arrays as flat `Float32Array` uniforms (three's `flatten` returns a flat array as is,
  saving the copy on each of ≈ 60 material switches / frame; ≈ 0.05-0.08 ms desktop, ≈ 0.3 ms at ×4). The vendor keeps
  and writes `Vector4` objects in those arrays (`cutaway.js cutUniforms`), so swapping them game-side would break its
  writes: CONTRACT-REQUEST below.

## 6. Item 4: rest of the profile

`renderAt` at square-day-8 high, desktop, unminified (inclusive ms / frame, fixes on): `renderAt` 1.56, three
`render` 1.37 (`renderObject` 1.08, of which `setProgram` 0.67), `WebGLShadowMap.render` 0.23, `projectObject` 0.17,
**matrix work 0.22** (`updateMatrixWorld` / `updateWorldMatrix`, all callers):

| caller | ms / frame |
|---|---|
| the one scene-wide `updateMatrixWorld` (installRuntimeOpts) | 0.078 |
| character `_placeRoot` | 0.041 |
| `PixelCamera.afterRender` (restore of texel-snapped objects: the avatars) | 0.040 |
| `PixelCamera._snapObject` | 0.030 |
| character `applyFlags` / `farSide` / `snapShift` (`onBeforeRender`) | 0.025 |

Two thirds of it is avatars (v33-sprites). The town part (0.078) is compose + multiply of ≈ 600 static nodes;
learnings.md §3.2 already measured a dirty-checked replacement as within noise. Not repeated. Render-target switches /
clears: 1 shadow + (reflection) + colour + normal + 8 post + upscale per frame, each needed; nothing to merge
game-side.

## 7. A real laptop (integrated GPU)

**Not measured by this front.** The shared laptop (integrated GPU, Chrome 143, ANGLE GL-EGL) was queued behind three
other agents' sessions for the whole remaining time box (one browser at a time, a 15-min lock wait per attempt); the
attempt was withdrawn without running. What the laptop front (`laptop-perf`, same day, **v3.1 code, i.e. without the
fixes here**) measured with the merge on vs off, 60 Hz capped, GPU timer queries around the frame:

| v3.1 merge on / off (laptop front) | JS ms p50 | GPU ms p50 | draws |
|---|---|---|---|
| lobby idle, `low` | 3.4-3.5 / 3.2-3.3 | 9.6-10.2 / 9.6-9.7 | 165 / 211 |
| day walk, `low` | 3.5-3.7 / 3.4-3.5 | 9.1 / 8.8-9.1 | 172 / 245 |
| lobby idle, `high` | 4.3-4.5 / 3.6-3.9 | **12.8-13.1 / 10.3-10.5** | 248 / 310 |
| vote, `high` | 4.7 / 4.5 | 14.3 / 13.4 | 338 / 458 |

Reading that with this front's data:

- The JS overhead of the merge on the laptop (+0.1-0.7 ms) is the program re-resolve bug of §2; the fixes remove it
  (desktop: the merge's JS cost goes from +7-12 % to ±1 % of no merge, at both tiers and at ×4).
- At `low` (the tier the tier picker gives integrated GPUs, select.ts row 9) the merge is GPU-neutral there.
- At `high` the merge costs the integrated GPU ≈ +1-2.5 ms. The fixes do not change GPU work. Part of it is the
  coarse `'view'` instance cull: an instance is drawn in every pass when its bounds, ground shadow or reflection touch
  the view, so the batch draws +6-7 % triangles at high (desktop: 1197 k vs 1124 k at square-day-8, 1553 k vs 1471 k
  at vote-12) and more in the 4096² shadow pass; the rest is likely the batching vertex path (matrix + id texture
  fetches per vertex, multi-draw through ANGLE GL). `ct.debug.v3mergeCull=three` brings the triangles back to the
  unmerged count (1155 k / 1474 k) for +0.05-0.18 ms JS (desktop: 1.402 vs 1.346 ms square, 1.739 vs 1.685 ms vote).
- **To do on the laptop with this branch** (one 10-min slot): `low` and `high`, merge off / batch-view / batch-three,
  with the fixes; decides the `high` default below. The harness driver for it is ready (connect-over-CDP mode).

## 8. Recommendation per item

| item | verdict |
|---|---|
| merge.ts (v3.1 BatchedMesh) | **keep on, batch mode, with the two fixes (default)** at `low` / `cpu`: CPU-neutral vs no merge, −22-26 % draws, GPU-neutral on the laptop. At `high`: CPU-neutral and −20 % draws on a desktop GPU, but the laptop front saw +1-2.5 ms integrated-GPU time (v3.1 code): until the laptop re-run (§7), turn it off at `high` on integrated GPUs (or use `cull: 'three'` there). Plain-merge mode: no. |
| 1a reflection refresh `smart` | **on by default** (0 px, −50-70 % reflection renders while the camera rests) |
| 1b off-screen water passes | **on by default** (pixel-identical by construction, 0 px measured) |
| 1c merged water passes / static reflection cache | vendor CONTRACT-REQUEST / follow-up |
| 2 static draw order | off (`ct.debug.v3sort=program` kept for A/B): no measurable gain, moves depth ties |
| 3 uniform uploads | fixed the big one (program re-resolves); the cut-away `vec4[]` arrays: CONTRACT-REQUEST |
| 4 matrix work | avatars dominate (v33-sprites); town part not worth it |

CONTRACT-REQUESTs for INTEGRATION.md §9.2 (the lead integrates): (a) `cutaway.js cutUniforms`: back the `vec4[]`
uniforms with one `Float32Array` each (three uploads flat arrays without the per-switch `flatten`); (b) one water pass
for all bodies (unchanged from learnings.md §4.4); (c) none for the batch bug: it is three's (fixed upstream after
r170; the getter steps aside when the field exists).

## 9. Switches (all `localStorage`)

| key | values (default first) |
|---|---|
| `ct.debug.v3batchFix` | on / `0` |
| `ct.debug.v3batchMat` | on / `0` (shared kit materials) |
| `ct.debug.v3reflect` | `smart` / `vendor` / `<fps>` (`0` = every frame) |
| `ct.debug.v3reflectIdle` | `10` (Hz) |
| `ct.debug.v3waterCull` | `1` / `0` |
| `ct.debug.v3sort` | `three` / `program` |
| `ct.debug.v3gpu` | `1` = `window.__ctGpu` ({engine, set(k, v), info(), render({fresh}), merged}) |

## 10. Commands run

| command | result |
|---|---|
| `CT_AGENT=v33-gpu scripts/remote.sh sh .v33/build.sh` (harness builds under the shared heavy lock; local helper, untracked) | ok (×5 while iterating) |
| `CT_AGENT=v33-gpu scripts/remote.sh --no-sync sh .v33/serve.sh dist-harness 3495` (+ `dist-harness-nomin 3496`) + `ssh -N -L 3495… -L 3496…` | served |
| `CT_AGENT=v33-gpu scripts/remote.sh sh .v33/check.sh <tests>` (client `tsc --noEmit` + vitest) | 1st: 2 fails in `world.merge.test.ts` (material identity, expected: tests updated to the twin); `gpuLevers.test.ts` 1st: 1 fail (program-key order assumption; test fixed); then tsc 0, 21/21 |
| `… check.sh apps/client/test/game3d` (final tree) | tsc 0, **35 files / 461 tests pass** |
| local `node measure.mjs` (scratch driver) — A/B runs `ab` (1×, 4×; 3 groups × 5 variants × 4 scenes), `refl`, `rate`, `core` (final numbers, 3 rounds), `swcpu` (SwiftShader) | ok, 0 page errors |
| `CT_AGENT=v33-gpu-t scripts/remote.sh sh .v33/tc.sh` (`pnpm -r run typecheck`) | exit 0 |
| local `node flips.mjs` (program re-resolve census), `twin.mjs` (twin vs shared fields) | §2 |
| pixel A/B (`--pixel`, 4 scenes at high) | first run: twin 98-197 k px (the missing `defines`) → fixed → **0 px** for every lever and for v3.1 vs final |
| `E2E_PORT=3497 CT_AGENT=v33-gpu-e2e scripts/v3/e2e.sh v3-boot v3-life v3-vote` | **3 passed** (1.9 min, SwiftShader) |
