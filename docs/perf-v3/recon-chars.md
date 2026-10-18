# v3 perf recon: characters, overlay, memory (front "chars")

Recon for the pre-deploy performance swarm (user request: "a thorough performance optimization swarm of agents on all
fronts" before v3 goes to the dev service). Written 2026-10-17 by `v3-perf-chars` on branch `v3-game` while C1 was
still being integrated (WP2/WP3/WP4/WP5b/WP6 in flight, `TownGame3d.ts` being rewritten). Contract:
`docs/v3/INTEGRATION.md` §1.3 step 5 (dispose, leak test), §4 (characters), §7 (budgets). Nothing here edits
`budgets.mjs` or game3d code; it proposes. Numbers are labelled with tree + method; SwiftShader numbers are a **CPU
proxy only** (the host GPU is never used), so GPU-side cost (skinning, fill, shadow raster) still needs a real device
(`ct.debug.v3perf`, §6.3).

## 1. Tooling (new files, run on the host via `scripts/remote.sh`)

| File | What |
|---|---|
| `tests/perf/v3-chars-page.ts` | Browser side. Loaded from the Vite DEV server via `/@fs/` (never in the app or `dist/`). Mounts the real `vendor/engineHost` + `vendor/town` (Hollowmere) + `avatars/layer` + `overlay` (fake connection, `fallbackView`) without `TownGame3d`, on a scripted `Scene3dState` (players on the plaza ring, camera at the 19 m vote framing). Virtual 60 Hz time inside measured windows. Exposes `window.__v3chars.{cost, churn, mount, walk, unmount}`. |
| `tests/perf/v3-memory.ts` | Node runner (Vite DEV on 3490, headless Chromium SwiftShader, `--expose-gc`, CDP). Scenarios `cost`, `churn`, `cycles` (5 mount/destroy + forced GC + heap / DOM / listeners + `Runtime.queryObjects` retained counts), `profile` (V8 CPU profile of 15 rigs walking). Writes `test-results/v3-perf-chars/v3-memory-<tier>.json` (+ `.cpuprofile`). |
| `tests/perf/v3-lobby-switch.ts` | Real-app leak test: own server (3491) + client `dist`, 2 lobbies of `--world v2|v3` with bots, the browser switches A/B/A/B/A through the app router (`ct:navigate`), GC + heap / DOM / listeners / live canvases, WebGL contexts, WebSockets, AudioContexts, observers after each visit. v2 works today (Classic baseline); v3 needs C1. |
| `scripts/perf/chars-budgets.mjs` | Budget check over the two JSON outputs, `budgets.mjs` row format; holds the proposed keys (§5) until WP7 merges them into `budgets.mjs`. |

Commands (always under the heavy + browser locks, record `/proc/loadavg` before/after):

```
CT_AGENT=v3-perf-chars scripts/remote.sh sh -c 'cat /proc/loadavg; flock $HOME/clocktower/v3-heavy.lock \
  flock $HOME/clocktower/browser.lock nice -n 19 pnpm exec tsx tests/perf/v3-memory.ts --port 3490 --tier low \
  --only cost,churn,cycles,profile --rounds 3 --cycles 5 --out test-results/v3-perf-chars; cat /proc/loadavg'
#   --tier high --only cost --groups empty,rig15        (the high tier)
#   npx tsx tests/perf/cpuprofile-summary.ts test-results/v3-perf-chars/v3-walk15-low.cpuprofile --focus update,_step,_gridFrame,_placeRoot,applyFlags,render
CT_AGENT=v3-perf-chars scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock flock $HOME/clocktower/browser.lock \
  sh -c "pnpm --filter @ct/client build && pnpm exec tsx tests/perf/v3-lobby-switch.ts --world v2 --port 3491"'
node scripts/perf/chars-budgets.mjs --memory test-results/v3-perf-chars/v3-memory-low.json --switch test-results/v3-perf-chars/lobby-switch-v3.json
```

After C1 the optimisation swarm should (a) re-run `v3-memory.ts` unchanged (component numbers stay comparable) and
(b) run `v3-lobby-switch.ts --world v3` for the real `TownGame3d` destroy path (C2 leak gate).

## 2. How a character costs (code reading, vendor baseline `8b50668`)

- **Rig = one `SkinnedMesh`** (`src/chars/rig.js buildCharacter`), `frustumCulled = false`, `castShadow` +
  `receiveShadow`, plus a `customDepthMaterial` (`look.js snapDepth`, key `char-depth-snap`). Draws per frame:
  shadow depth + colour + normal pass = **3 calls** (low and high); high adds the FX `Points` (`fx.js`, colour pass
  only) when the spec has `fx`; smears / hit flash only while active; the stand-in lantern prop +2-3. Low-tier LOD
  (> 12 m) moves meshes to `COLOR_ONLY` = 1 call.
- **No `THREE.AnimationMixer`.** The "mixer" is the vendor `Character`: a fixed **60 Hz** simulation from its local
  clock (`character.js update`: `while (_n < N) _step()`), each step samples `drive(t)` (our `createDriver`
  callback allocates a `Vector3` + an object; `_sample` clones it again; `_step` allocates an acceleration `Vector3`
  and a `Vector2`), runs the gait, SecondOrder dynamics and chains; a 30 Hz `_gridFrame` evaluates clips and applies
  a pose; `_placeRoot` runs `root.updateMatrixWorld(true)` **every frame**, standing still too, and the host's
  runtime opt (`engineHost.installRuntimeOpts`) runs `scene.updateMatrixWorld()` again, which re-composes every bone.
  Because the step is fixed, rendering at 30 fps does not halve the sim: it runs 2 steps per frame. Only skipping
  `update()` entirely saves CPU (the handle re-bases its clock after a > 0.9 s gap: no re-simulation).
- **Per render:** `look.js` material `onBeforeRender` (part table, `applyFlags` per bone, shadow snap, hull) per
  pass, `onBeforeShadow`, `skeleton.update()` + bone texture upload.
- **Programs:** character materials share one program per option set (`look.js progKey`, includes `maxBones`, tones,
  ghost block), so programs grow with the number of **distinct specs** in view, not with players; each new one is a
  synchronous compile on its first draw. `ghostTint.ts` adds `|ct-tint2` to the key once, so deaths / talking /
  fades never recompile (the WP2 smoke measured 63 programs constant across alive / talk / ghost / revive).
- **Build:** `createCharacter` = spec import + `buildCharacter` (55-90 ms) + next frame + `Character` + first update
  (25-40 ms), one in flight (`avatars/queue.ts`). The WP2 smoke on SwiftShader needed 312 s to build 38 avatars
  (frame-paced; a SwiftShader frame is slow) and 34 s to rebuild the 'clips' ghosts on revival.
- **Billboards** (brianbi, nicksong) upload the **whole** sheet: `cast.png` 1760×960 (6.4 MiB RGBA) for nicksong,
  `cast-hd.png` 1280×1400 + mips (≈ 9.1 MiB) for brianbi, `cast-ghosts.png` 896×672 (2.3 MiB): ≈ 18 MiB of GPU
  texture for 2 quads.
- **Dispose:** `rigBody.dispose` frees the handle's geometries and materials (the vendor `rig.dispose` also frees
  the skeleton bone texture); the WP2 smoke saw geometries 140 → 104 and textures 51 → 14 after the layer's destroy.
  Not freed: `mesh.customDepthMaterial` (`char-depth-snap`, program shared, so no program leak; the JS object goes
  with the mesh).
- **Engine shell:** `Engine.constructor` adds `window.addEventListener('resize', () => this.resize())` that can
  never be removed, so every destroyed engine stays reachable. `disposeEngine` nulls `scene / pipeline / renderer /
  camera / uniforms / toonUniforms`, but pieces also hang `townLights`, `townCutaway`, `_treeMats`,
  `_foliageSpriteMat`, `_foliageSpringMats`, `_treeSorters`, `sun` (with its shadow camera and disposed map
  target) etc. on the engine; disposed materials still reference their `Texture` objects and those their image /
  typed-array data. One shell per lobby switch, for the life of the tab.

## 3. Overlay (code reading)

- Labels (15): transform writes only while walking (`place.ts`, 0.5 px threshold), one `visibility` write when a
  head crosses the canvas edge, `measureEl` only on content change; no layout reads per frame. Fine.
- **FX canvas** (`surface.ts`): one 2D canvas at **CSS-px resolution covering the whole town** (e.g. 1920×1080),
  cleared with a full `clearRect` and redrawn on every frame in which anything is drawn. Things that draw **every
  frame**: door boards whenever a house is in use by day (`boards.ts`, plaques + tokens), seat markers / hands during
  a nomination (`gameplayView.ts`), the talking glyph + ripple for every speaker (`labels.ts`), pins / pings
  (`socialView.ts`). In a normal day with voice chat that is most frames, even with a still camera, so the canvas
  is re-rastered and re-uploaded to the compositor every frame.
- `avatars/project.ts fallbackView` reads `renderer.domElement.getBoundingClientRect()` once per frame; after the
  overlay's transform writes of the previous frame this is a **forced style/layout** per frame. WP1's
  `engineHost.projection()` uses a dirty flag instead. Only matters if the composition root does not pass `view`
  to `createAvatarLayer` (C1 check).

## 4. Measurements (baseline, 2026-10-17/18)

**Tree / method.** Working tree of `v3-game` at HEAD `4998ca5` + the uncommitted WP2/WP3/WP4 files as synced to the
host at 2026-10-17 21:00 PDT (component bench) and 00:40 PDT (client `dist` for the real-app switch). Host under the
other swarms' load (load average 10-12 on 12 cores before and after every run; heavy + browser locks held for the
whole window). Chromium headless, SwiftShader (Vulkan / Subzero), 960×540, `pixelScale` 2 → 480×270 low-res,
camera on the plaza at the 19 m vote framing, 15 players on a 6.3 m ring. `v3-memory.ts` numbers are **Vite DEV**
(unminified); CPU = main-thread JS time per frame, virtual 60 Hz. SwiftShader renders a frame in ≈ 2.5 s wall
(0.4 fps) in the GPU process, so main-thread CPU is not inflated much, but every GPU number (raster, skinning,
compile time) is meaningless here.

### 4.1 Cost per character, low tier (`v3-memory-low.json`, `cost`, 60 frames per window)

| Window | update ms (mean / p95) | render CPU ms | overlay ms | calls | tris / frame | programs | geoms / textures | alloc KiB / frame |
|---|---|---|---|---|---|---|---|---|
| empty town | 0.02 / 0.1 | 4.64 | 0.08 | 425 | 536 779 | 36 | 288 / 14 | 186 |
| 1 rig (frog) idle | 0.19 / 0.5 | 5.38 | 0.13 | 425 | 540 847 | 38 | 289 / 16 | 180 |
| 5 rigs walk | 0.75 / 1.5 | 6.02 | 0.16 | 437 | 859 906 | 42 | 293 / 20 | 232 |
| **15 rigs idle** | 1.51 / 2.8 | 7.62 | 0.15 | 470 | 1 175 896 | 51 | 303 / 30 | 335 |
| **15 rigs walk** | 1.42 / 2.6 | 7.54 | 0.20 | 467 | 1 175 632 | 51 | 303 / 30 | 311 |
| 15 rigs walk, 5 talking (FX canvas) | 1.29 / 2.2 | 7.18 | 0.25 (p95 0.7) | 464 | 1 175 848 | 51 | 303 / 30 | 283 |
| 15 ghosts idle / walk | 1.05 / 1.15 | 6.97 / 7.09 | 0.13 / 0.15 | 467 | 1 175 968 | 51 | 303 / 30 | 273 / 306 |
| 15 × frog (same spec) walk | 1.04 | 6.78 | 0.22 | 464 | 589 303 | 38 | 303 / 30 | 291 |
| 15 billboards walk | 0.11 | 5.16 | 0.19 | 437 | 537 097 | 38 | 303 / 17 | 173 |

Derived (15 mixed rigs vs empty): **3.0 draw calls per rig** (shadow + colour + normal; budget §7: ≤ 6), **+0.093 ms
update and +0.19 ms render CPU per rig per frame** (≈ 0.28 ms / rig, ≈ 4.3 ms for 15 on this desktop CPU; a phone
is 4-5× slower), **≈ 8 KiB JS garbage per rig per frame** (the town alone makes ≈ 186 KiB / frame, ≈ 11 MB/s at
60 fps: flagged to the world / frame front), **1 program per distinct spec** (15 specs → 15 programs; 15 frogs → 1;
deaths / talking / revivals → 0), **1 bone texture + 1 geometry per rig**. Triangles: frog 1 156, the 15-spec mix
averages **14 200 per rig** (213 k for 15, drawn in 3 passes = +639 k triangles per frame, more than the whole town's
537 k at low); the four specs after frog in the mix (fox, owl, crow, moth) average 26.6 k each. Billboards cost 1/10
of a rig on the CPU and 1 call each. Ghost windows are ~25 % cheaper than living walkers (the clips ghosts slide on a
held loop). Overlay: 15 labels walking = 15 transform writes per frame and 0 content / visibility writes; flush
0.20 ms. FX-canvas cost lands in the compositor, not in JS, so it is not visible here (§3).

Builds (wall time on SwiftShader, frame-paced, not comparable to a GPU): 1 rig 18 s, 5 rigs 36 s, 15 rigs 60 s,
15 same-spec 63 s, revival of 15 ghosts 13 s (0 programs). Long tasks are the shader compiles (7-10 s each on
SwiftShader; `KHR_parallel_shader_compile` is not exposed by SwiftShader, three warns about it): one per new spec.

### 4.2 High tier (`v3-memory-high.json`, 40 frames)

empty town: 472 calls (last frame), 1 122 593 tris, 35 programs; 15 rigs walk: update 1.80 ms, render CPU 9.52 ms,
616-636 calls, 2 036 479 tris, 52 programs (+17 for 15 specs: FX / smear programs), alloc 335 KiB / frame. The
high tier's water reflection (`world/water.js`, a `preRender` pass at 30 Hz) re-renders the scene **with the
characters** every other frame (`preRender` stage 96-108 calls with 15 rigs). The first run sampled calls of the
last frame only, so per-rig calls at high are re-measured with frame means (`callsMean`, rerun below).

### 4.3 In-lobby churn, low (`churn`, 3 rounds of 15 join + settle + leave, one engine)

| | geometries | textures | programs | JS heap (forced GC) | DOM nodes |
|---|---|---|---|---|---|
| fresh engine, nobody | 284 | 14 | 36 | 333 MiB* | 10 |
| round 1/2/3 with 15 | 303 / 303 / 303 | 30 | 51 | 517.4 / 517.6 / 516.8 MiB | 39 |
| round 1/2/3 empty again | 288 / 288 / 288 | 15 | 37 | 382.6 / 382.7 / 381.9 MiB | 10 |

\* includes the engine of the earlier `cost` mount, which is never freed (§4.4). No per-round leak (GPU counts and
heap return to the same values every round). One-time after the first round: +4 geometries, +1 texture, +1
program (`char-depth-snap` is never disposed: `rigBody.dispose` skips `mesh.customDepthMaterial`), +50 MiB heap
(spec modules and vendor per-spec caches). **JS heap per rig ≈ 9 MiB** ((517 − 383) / 15): a 15-player lobby
plus 4 townsfolk is ≈ 170 MiB of heap for characters alone, against the §7 budget of 350 MB for the whole tab.

### 4.4 Mount / destroy cycles: the leak (`cycles`, component level, and the real app)

Component (`v3-memory.ts --only cycles`, low, engine + town + 15 rigs + overlay, then the documented destroy
order overlay → avatars → `host.dispose()` → parent removed; the run's watchdog stopped it after cycle 3):

| after | heap MiB | DOM nodes | listeners | retained Engine / WebGLRenderer / Scene / Mesh / BufferGeometry / Texture / canvas / WebGL2 ctx / ResizeObserver |
|---|---|---|---|---|
| baseline (2 earlier mounts) | 167.3 | 13 | 15 | 2 / 2 / 4 / 628 / 1748 / 43 / 2 / 2 / 2 |
| destroy #1 | 236.8 | 15 | 16 | 3 / 3 / 6 / 939 / 2257 / 55 / 3 / 3 / 3 |
| destroy #2 | 307.0 | 17 | 17 | 4 / 4 / 8 / 1250 / 2766 / 67 / 4 / 4 / 4 |
| destroy #3 | 376.5 | 19 | 18 | 5 / 5 / 10 / 1561 / 3275 / 79 / 5 / 5 / 5 |

**Every destroyed engine stays alive in full: ≈ +70 MiB JS heap, 1 WebGL2 context, 1 canvas, 2 scenes with ≈ 311
meshes and ≈ 509 geometries (their CPU arrays), 1 ResizeObserver, 1 window listener per mount.** GPU memory is
freed (`forceContextLoss`), JS memory is not.

Real app (`v3-lobby-switch.ts`, client `dist` of the same tree, 2 lobbies × 4 bots, 5 visits A/B/A/B/A, 15-20 s
each, stats on the home screen after each visit):

| | v2 (Classic) | v3 (current `TownGame3d`: town + own avatar) |
|---|---|---|
| heap after visit 1 → 5 | 7.8 → 8.8 MiB (+0.25 / visit) | 86.9 → 367.1 MiB (**+70 / visit**) |
| DOM nodes 1 → 5 | 622 → 622 | 856 → 1692 (+209 / visit) |
| JS listeners 1 → 5 | 195 → 203 (+2 / visit) | 227 → 363 (+34 / visit) |
| canvases / WebGL2 contexts / ResizeObservers | 39 / 0 / 0 stable | +7 / +1 / +1 per visit |
| WebSockets, AudioContexts after leaving | 0 | 0 |
| in town (`__ctCamera.v3()`) | — | 195 calls, 249 k tris, 41 programs, tier low, ×2 |

**Cause (code + counts).** `Engine.constructor` registers `window.addEventListener('resize', () => this.resize())`
(never removable). That arrow keeps the engine; the engine keeps `resize` = engineHost's shadow
`() => hostResize(engine, parent, tier)`, whose closure context is the whole `createEngineHost` scope (canvas →
WebGL2 context, `parent` → the town DOM subtree, the disconnected `ResizeObserver`, `host`, the runtime-opts
wrapper that closes over `scene`), and the engine fields `disposeEngine` does not null (`townLights`,
`townCutaway`, `_treeMats`, `_treeSorters`, `_foliage*`, `sun`, `stats`, …) keep the town graph and its CPU-side
geometry arrays. A/B of the proposed fix applied from outside (`--leakfix listener|full`): §4.5.

### 4.5 Leak fix A/B

_(pending run: `--leakfix listener` and `--leakfix full`, 4 cycles each)_

## 5. Ranked optimisations

Ranked by user-visible risk removed per effort. "C1" = needs the wired v3 town (and C2 harness / real device) to
measure or verify; "WIP" = the file is being edited by the phase-1 swarm right now (wait for it).

1. **Free destroyed engines (P0 leak).** `game3d/vendor/engineHost.ts`: wrap `window.addEventListener` while
   `new Engine(...)` runs, keep what it registers and remove it in `dispose()`; in `disposeEngine` null every own
   field of the engine (not just six) and set `engine.resize` to a module-level no-op (no closure over the host
   scope). Expected: −70 MiB JS heap, −1 WebGL2 context, −1 canvas, −~209 DOM nodes and −~34 listeners per lobby
   switch, tier rebuild and context-loss rebuild (§1.2 "Rebuild always creates a new Engine"). Risk low (dispose path
   only; `v3-lobby-switch.ts --world v3` proves it). Not WIP. Also CONTRACT-REQUEST(pixel3d): `Engine.dispose()`
   that removes its own listener.
2. **Rig heap ≈ 9 MiB per character (P0 for phones).** `v3/pixel3d/src/chars/rig.js buildCharacter`: the build
   arrays `pos, nrm, col, hi, sh, si, sw` are captured by the inner `emit` closure, so V8 keeps them in the shared
   context of every `rig.*` method for the life of the rig (≈ 7-8 MiB of plain JS number arrays for a 14 k-triangle
   rig, on top of the 3.5 MiB typed arrays). CONTRACT-REQUEST(pixel3d): set their `length = 0` after the
   `BufferGeometry` is built (or assemble in a helper function). Expected ≈ −5-7 MiB per rig (≈ −100 MiB for 15
   players + 4 townsfolk). No wrapper workaround exists. Verify with `v3-memory.ts --only churn` (heap per rig).
3. **Triangles per character.** Mixed cast averages 14.2 k triangles per rig (frog 1.2 k, several ≈ 26 k), drawn 3×
   (shadow, colour, normal): 15 players add 640 k triangles per frame at low, more than the town (537 k). (a)
   low tier: `castShadow = false` for rigs beyond the LOD distance or beyond the N nearest (the LOD toggle already
   drops shadow + normal past 12 m; lower it to ~8 m at low, `avatars/layer.ts LOD_FAR_M`); (b) CONTRACT-REQUEST
   (pixel3d): a per-spec triangle budget in the cast pipeline and a decimated shadow / far mesh. GPU-only win:
   real device. C1.
4. **Off-screen avatars sleep.** Rigs are `frustumCulled = false`, so every avatar in the viewer's location costs
   CPU (0.09 ms update + 0.19 ms render per frame) and 3 draws of all its triangles even off screen.
   `avatars/layer.ts`: when the projected box (+ 2 m margin for shadows) is off the canvas, hide the holder and skip
   `body.update`; on re-entry place with `jump = true` (the vendor handle re-bases its clock after a gap: no
   re-simulation). Keep `isShown()` true for the overlay. Expected: the off-screen share of ~0.28 ms CPU + GPU per
   rig (with the 12 m gameplay camera most of 15 spread players are off screen). Risk medium (shadow pop at the
   edge, ghost slides). C1, WIP (WP2).
5. **Shader compile per new spec.** 1 program per distinct spec, compiled synchronously on its first draw (15
   specs = 15 hitches as a lobby fills). `avatars/layer.ts` after a build: `await renderer.compileAsync(holder,
   camera, scene)` before `holder.visible = true` (uses `KHR_parallel_shader_compile` on real GPUs), and compile the
   lobby members' specs during `stage.warmUp`. Expected: removes a 20-100 ms hitch per new spec on real devices.
   Risk low. C1 (real device), WIP (WP2 / WP3).
6. **High tier: water reflection re-renders the characters.** `world/water.js` reflection (`preRender`, 30 Hz)
   draws ~100 extra calls every other frame once figures stand near the fountain (`cullFigures` keeps any figure
   within a 3 m sphere of the reflection frustum). Options: characters out of the reflection layer mask at high,
   `reflection.fps = 15` (the `pass.reflection` A/B hook), or a tighter figure cull. ≈ −15 % calls at high. World
   front, C1, WIP (WP3 `vendor/town.ts`).
7. **Per-frame garbage ≈ 8 KiB per rig.** Ours: `vendor/characters.ts createDriver` allocates a `Vector3` + an
   object on every 60 Hz drive sample (the vendor clones `pos` anyway: a reused scratch is safe);
   `avatars/layer.ts update` allocates `new Set`, `new Map`, `[...entries.values()]`, `ctx` and two objects per
   avatar for `wantClips` every frame (`wantClips(i, out)` exists). Vendor (CONTRACT-REQUEST): `Character._step`
   (`new Vector3` acceleration, `new Vector2` lean), `_sample` clone. Expected −30-50 % of the avatar share of GC.
   Risk low. WIP (WP2).
8. **Bone matrices composed 2-3× per frame.** `Character._placeRoot` calls `root.updateMatrixWorld(true)` every
   frame, standing still too, then `installRuntimeOpts`' `scene.updateMatrixWorld()` recomposes every bone again.
   CONTRACT-REQUEST(pixel3d): skip the forced update when the root did not move and no new drawing was posed.
   Part of the 0.19 ms render CPU per rig. Vendor.
9. **FX canvas redrawn every frame.** `overlay/surface.ts`: record the frame's blits and skip clear + redraw when
   the list equals the last frame's (door boards by day, seat markers in a vote and the talking glyph are mostly
   static); otherwise clear only the union of last frame's rects. JS cost is small (overlay flush 0.20-0.25 ms);
   the win is the compositor's re-raster / upload of a full-viewport canvas on most daytime frames. Real device
   (`ct.debug.v3perf` + DevTools "Paint flashing"). Risk low-medium. Not WIP (WP4 done), C1 to verify.
10. **Billboard sheets uploaded whole.** `avatars/billboard.ts`: crop the id's cells (living + ghost) into a small
    canvas texture instead of uploading `cast.png` (6.4 MiB GPU), `cast-hd.png` (≈ 9.1 MiB with mips) and
    `cast-ghosts.png` (2.3 MiB): ≈ −15 MiB GPU memory whenever brianbi / nicksong are in the lobby. Risk low. WIP
    (WP2).
11. **Forced layout in the fallback view.** `avatars/project.ts fallbackView` reads `getBoundingClientRect()` once
    per frame (after the overlay's transform writes: a forced style + layout). The composition root must pass
    WP1's `View3d` (dirty-flag rect) to `createAvatarLayer({view})`. Zero risk. C1 (`TownGame3d.ts`).
12. **Far characters still simulate at 60 Hz.** The fixed step means 30 fps devices run 2 steps per frame and LOD
    does not reduce sim cost. CONTRACT-REQUEST(pixel3d): `createCharacter({dynamicsFps})` (30 for LOD-far / low).
    Vendor.
13. **Revival rebuilds every 'clips' ghost** (15 rebuilds at a rematch, one at a time). Keep the body and release
    the slide when the vendor allows (§4 CONTRACT-REQUEST `spec.ghost` for the 16 clips specs removes the slide
    altogether). Low priority.
14. **Not a leak, keep:** after the first join/leave round +4 geometries, +1 texture, +1 program (`char-depth-snap`,
    never disposed by `rigBody.dispose`) and +50 MiB heap (spec modules + vendor per-spec caches) stay; they are
    stable across rounds and keep the next join warm. Document instead of "fixing" (disposing the depth material
    would recompile it on the next join).

## 6. Proposed `budgets.mjs` keys (v3 section; checked today by `scripts/perf/chars-budgets.mjs`)

| Key | Max | Measured now | Rationale |
|---|---|---|---|
| `v3CallsPerRigLow` | 4 | 3.0 | shadow + colour + normal; +1 for a lantern prop. §7 allows 6 |
| `v3CallsPerRigHigh` | 12 | (rerun) | §7; frame means because of the 30 Hz water reflection |
| `v3ProgramsAdded15` | 16 | 15 | 1 per distinct spec + `char-depth-snap` |
| `v3ProgramsConstantGhost` | 0 | 0 | deaths, talking, fades, revivals are uniforms only |
| `v3AvatarUpdateMs15` | 2.0 | 1.42 | layer.update, 15 rigs walking (host SwiftShader CPU, DEV) |
| `v3AvatarUpdateMsPerRig` | 0.13 | 0.093 | |
| `v3RenderCpuMsPerRig` | 0.27 | 0.19 | renderNow main-thread CPU |
| `v3OverlayFlushMs15` | 0.4 | 0.20 | 15 labels walking (5 talkers 0.25) |
| `v3OverlayContentWritesPerFrame` | 0.05 | 0 | text / style / visibility writes while walking |
| `v3AllocKiBPerRigFrame` | 10 | ≈ 8.3 | target ≤ 4 after item 7 |
| `v3HeapPerRigMiB` | 4 | ≈ 9 (OVER) | goal after item 2 |
| `v3ChurnGeometriesDelta` / `v3ChurnTexturesDelta` | 0 / 0 | 0 / 0 | last round vs first round, empty lobby |
| `v3ChurnHeapGrowthMiB` | 5 | −0.7 | |
| `v3MountHeapGrowthMiB` | 10 | +139.7 over 2 cycles (OVER) | §1.3 / §7 leak rule, component level |
| `v3MountRetainedRenderers` | 0 | +1 engine / cycle (OVER) | |
| `v3SwitchHeapGrowthMiB` | 10 | v3 +280.2 / 4 visits (OVER); Classic +1.0 | real app |
| `v3SwitchLiveContextsGrowth` | 0 | v3 +32 (OVER); Classic 0 | canvases + WebGL contexts + sockets + audio |
| `v3AvatarBuildLongTaskMaxMs` | 150 | real device only | build + first update + compile |

CPU keys are host-relative (SwiftShader, DEV, shared host): compare only with re-runs of `v3-memory.ts` on the host
under the heavy lock. Counts and memory keys are host-independent.
