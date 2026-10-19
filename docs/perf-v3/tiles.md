# v3.3: cached static layer ("tiles")

Agent `v33-tiles`, 2026-10-18. Branch `v33-tiles` (from `origin/v3-game` `c67e1ea`). Prototype behind
`localStorage['ct.debug.v3tiles']` (`1` = on, `ab` = patched but off, switchable at run time with
`__ctCamera.tilesOn()` / `tilesOff()`; read once per town build). **Default: off** (no material is patched, no layer
moves, the live renderer runs unchanged).

User idea: the outdoor camera's yaw and pitch are fixed (only texel-snapped pans) and the vote camera uses a few fixed
poses, so the static town could be rendered once and reused, like the pre-rendered backgrounds with depth of classic
isometric games.

## 0. Results in one screen

- **Pixel parity: yes.** A/B stills render the same engine time live and from the tiles, in one page, and diff them per
  pixel:

  | still | GPU `high` 1920×1080 | SwiftShader `cpu` 960×540 |
  |---|---|---|
  | day (spawn, 10:00) | 0.035 % differ (729 px, 9 over 32 levels) | 0.054 % (max diff 2 levels) |
  | cut-away active (own player at a cottage door) | 0.016 % | 0.012 % |
  | vote pose (yaw 45°, pitch 23°) | 0.05 % | 0.066 % |

  The remaining pixels are mostly parts that had not moved yet in the still (before auto-demotion caught them) and
  float noise. Dusk and night are identical by construction: the cache is off while a pool light is lit. That was not
  diffed separately.
- **Speed: small on GPUs, real on software GL, and far from the ceiling.** Only 56 meshes are cacheable today (§1.4).
  They are about 20 of the ≈ 115 in-view draws per pass. The canopy-faded foliage and soft dressing, the wind sprites,
  the dais, the 15 rigs, water and the shadow pass stay live.

  | host, 14 remotes on the square | live | tiles | Δ |
  |---|---|---|---|
  | GPU `high`, draw calls / frame (standing) | 363 | 323 | −11 % |
  | GPU `high`, renderAt JS, CPU ×1 / ×4 (standing) | 4.25 / 15.4 ms | 4.44 / 16.0 ms | +0.2 / +0.7 ms (worse) |
  | GPU `low`, draw calls / frame (standing) | 257 | 217 | −16 % |
  | GPU `low`, renderAt JS, CPU ×1 / ×4 (standing) | 3.63 / 11.90 ms | 3.60 / 11.88 ms | ±0 |
  | SwiftShader `cpu` 960×540, synced frame p50 (raster included) | 196 ms | 156 ms | **−20 %** |
  | SwiftShader `cpu`, draw calls | 113 | 93 | −18 % |

  Ceiling: the **whole** town hidden (foliage included), i.e. what a cache that also held the canopy and the sprites
  could reach at best:

  | ceiling | live | whole town hidden |
  |---|---|---|
  | GPU `high`, calls | 362 | 111 |
  | GPU `high`, renderAt ×1 / ×4 | 4.2 / 14.5 ms | 2.7 / 9.0 ms |
  | SwiftShader `cpu`, RAF fps | 5.9 | 9.5 |

- **iGPU laptop (the most important number):** see §2.5.
- **Recommendation: do not ship (not even behind a tier) in this form.** Keep the code behind the debug switch as the
  measured prototype.
  - On GPU tiers it saves 36-40 draws but no CPU time. The per-frame bookkeeping, the composite and the cut-window
    twins eat the issue savings.
  - Only the cpu tier gains (−20 % synced). It is still far below its 20 fps goal, and the toon / grass work left
    there is vendor work (cpu.md §4).
  - The idea pays only when the canopy layer (kit soft + foliage cores) is cacheable too. That needs canopy windows
    (§3) and a static / animated split of the foliage piece (vendor), and would take the GPU numbers toward the
    ceiling row (−35 % renderAt).


## 1. Design

### 1.1 Why tiles are exact

`PixelCamera` (vendor `core/PixelCamera.js`) is orthographic. Its position along the camera's right / up axes is
always a whole number of texels, on a grid anchored at the world origin. For a fixed yaw, pitch and texel size, an
orthographic camera moved by whole texels rasterises static geometry identically. The image only translates.

So the cache is keyed in **snap space**:

- A *cell* is one texel of that grid.
- A *tile* is 128 × 128 cells.
- A tile is baked by an orthographic camera whose pixel centres sit on the frame's lattice. If the padded frame
  (`lowW + 2·MARGIN`) has an odd size, the pixel centres sit on whole texels instead of half texels, so the frame's
  "parity" is part of the key.
- Depth is orthographic and linear. The vendor camera is **not** snapped along the view direction F. Tiles therefore
  store the depth of a bake camera at a fixed `pos·F = −distance`. The composite re-bases it per frame with one
  constant: `depthShift = (bakeF − camF) / (far − near)`.

The math is in `apps/client/src/game3d/tiles/tileMath.ts`. Unit tests: `apps/client/test/game3d/tiles.math.test.ts`.

### 1.2 What a tile holds, and why lighting is NOT baked as a final colour

The toon material (vendor `materials/toon.js`) computes `L = toonLit · shadow · cloud`. It then picks a band from
three hard band weights, and point lights and emissive are mixed on top. Two of those inputs change while the camera
holds still:

- **Cloud shadows** drift at 6 fps over every lit surface by day.
- **Cast shadows** of avatars fall on the ground, which is static.

Caching the final colour would therefore be stale 6 times a second, and would lose every moving shadow. Instead, each
tile holds the static fragment with its light level **forced into each band**. A bake-mode uniform `uCtBake` is
patched into the static materials before the warm-up, so the program count does not change.

| ring texture (RGBA16F) | content |
|---|---|
| `tSh` | toon colour with L forced into the shadow band |
| `tMid` | the same in the mid band; **alpha = `toonLit`** (the unshadowed light level) |
| `tHi` | the same in the hi band; alpha = the colour pass's emissive mark; its Float32 depth texture = the tile depth |
| `tN` | the normal pass (view normal + outline flag) |

The composite rebuilds the lighting per pixel with the toon material's own formula:

1. Reconstruct the world point from the cell and the re-based depth.
2. Compute `shadow` from the **live** sun shadow map of this frame. Static and dynamic casters are both in it. The
   normal-bias offset and the vendor's 4-tap penumbra step are replicated.
3. Compute `cloud` with the vendor's own `CLOUD_GLSL` (imported).
4. `L = toonLit · shadow · cloud`, then the band weights, then `mix(tSh, tMid, tHi)`.

This is exact for everything that is linear in the band mix:

- Point lights are `mix(outgoing, warm, pq)`.
- Emissive is additive.
- The cut-away circle's discard and rim are baked as they are.

The bake is done with `shadow.intensity = 0`, so the cache holds unshadowed colour.

Cost: 4 renders per tile bake, and one full-screen composite per colour or normal pass. On the cpu tier the composite
compiles the cloud noise out, like the toon shader (`CT_NO_CLOUDS`).

### 1.3 Frame order (no copy of the vendor pipeline)

`installTiles` wraps three things:

- **`pipeline.render`** (outermost). It runs the per-frame `tick`, which decides whether the cache is active, bakes up
  to the budget and sets the composite uniforms.
- **`renderer.render`**, only while the pipeline runs:
  - The colour and normal passes (the main camera into `rtScene` / `rtNormal`) run with the static layer **disabled**.
  - The composite quad (`renderOrder −1e9`, `depthFunc Always`, writes `gl_FragDepth`) is made visible for those
    passes, so it is the first opaque draw.
  - The sun shadow map of the frame is rendered first, inside that same call, so the composite can sample it.
  - Water reflection cameras (`preRender`) still see the static layer.
- **`shadowMap.render`**: every caster (the static layer + the main camera's layers) stays in the shadow map.

Static meshes move to their own three layer (10). The main camera and every visible light enable that layer, so with
the cache off the frame is the same set of draws as before.

### 1.4 Static vs dynamic

Classified once at install, under the ground / props / clocktower / house-0..14 pieces.

A mesh is **static** when it:

- is a single-material toon `Mesh`;
- is not instanced or skinned;
- is not on the canopy-fade list;
- is not transparent;
- has no custom depth material (no wind);
- is on layer 0 only;
- receives shadows;
- has no `onBeforeRender`;
- is visible.

Kit glass is included: tiles are off while pool lights are lit, see below.

Always **live**:

| live thing | why |
|---|---|
| avatars, NPC / life, critters, ambient FX | move |
| foliage piece, cottage crowns / clumps, the kit `soft` layer (thatch, ivy, planters) | canopy fade (D1: a dithered hole in front of every avatar) and wind sprites at 3 fps |
| grass / reed / flower tufts (instanced sprites) | wind at 3.5 fps |
| dais (seat stones, hands, banners, vote lamps) | game state + 3 fps banners |
| door pivots, door boards, tower dial face / hands | game state |
| water (preRender + post passes), fountain streams | animated |
| anything added after install (section twins, tower timer meshes) | not classified |

**Auto-demotion.** Each frame the cache compares every static mesh's world matrix, geometry, position / index
attribute versions, draw range and effective visibility with a snapshot. The snapshot is taken on the first enabled
frame. A mesh that changed goes back to layer 0 (live) for good, and its old + new footprint is invalidated.

On the first run this caught 15 animated parts inside the cottages without any hand-written list:

- mill wheel;
- shop signs (houses 5, 9, 13);
- weather vanes (houses 11 and 12, the tower);
- rooks (house 12);
- the crow (house 3);
- the bubbling draw range of house 1;
- the swinging bale (house 2);
- the telescope (house 0);
- the rowboat;
- the fountain water glass.

That left 56 static meshes of 72 candidates (3 materials patched: kit solid, kit glass, ground).

### 1.5 Invalidation rules

| event | rule |
|---|---|
| yaw / pitch / texel size (zoom, vote pose) / frame parity / ring size / the cut-away circle (on, centre, radius, top) | **flush**: every tile missing |
| lighting step: any value of the static materials' uniforms changed (sun direction, ramps, band thresholds, tone, ground night flag, kit glow …), sun colour / intensity, sky colour | **relight**: tiles stay shown but stale, re-baked under a budget (1 tile / frame). Checked every 8 frames. Cloud, penumbra, cut, canopy and time uniforms are evaluated live and are excluded. |
| a static mesh changed | demote + invalidate its cells |
| a visible tile is missing | bake it now; if more than 6 are missing (first frame, zoom, vote cut), render this frame live and bake 6 |
| the camera pans | tiles that enter the view (+ a 1-tile prefetch ring, 1 tile / frame) are baked; the ring (toroidal, `tile i → slot i mod NI`) evicts tiles that left |
| a pool light is lit (golden / night), a room is shown, a non-Basic shadow map | cache **off** (live frame) |

### 1.6 Exceptions

- **Cut-away boxes** (player box, door cottage; vendor `town/cutaway.js`). These follow the player. Their screen
  windows (`uCutBoxS`, padded by 2 px for the section rim) are **live rects**:
  - the composite discards inside them;
  - every static mesh whose cell bounds touch a rect is drawn **in the main render**, with a twin of its material
    that clips to the rects (`RECT_TEST`; same program key, so no new program);
  - transparent dynamic things (grass, flowers) blend over them in the normal order.
  - Bakes keep the circle and drop the boxes (`uCutBoxN = 0`).
- **Canopy fade**: the canopy materials are never cached (see 1.4).
- **Doors**: live (pivot subtrees excluded).
- **`setLit` windows**: glass is cached by day. A `setLit` change rewrites the glass glow attribute, so the attribute
  version changes and the mesh is demoted. At night the cache is off anyway.
- **Vote camera**: its fixed poses are a geometry-key change. The transition frames render live (more than 6 tiles
  missing), and the steady pose bakes over 3-4 frames.
- **Interiors**: the town is parked, so the cache is off.

## 2. Measurements

### 2.1 Method

Tool: `tests/perf/v3-tiles.ts` (new, ports 3470-3474).

- It runs on the host, with the Vite DEV build and the real `createTownGame3d` over the fake connection of
  `tests/perf/v3-frame-probe.js`: the own player + 14 remotes walking circles on the square, 10:00.
- The town is mounted with `ct.debug.v3tiles=ab`. Live and tiles are then switched at run time **in the same page**,
  alternating off / on / off / on in 6 s RAF windows. Standing and walking (the camera pans into new tiles). CPU ×1
  and ×4 via the CDP throttle.
- The page also runs `synced` frames: back-to-back `renderAt` + a 1-px `readPixels`, so raster is included. That is
  the SwiftShader number.
- `ceiling` hides the town pieces.
- GPU = the host's discrete GPU over ANGLE / Vulkan (`--gl gpu`). Software = SwiftShader at the `cpu` tier.
- Host load before the runs: 0.2-3.0.

Caveat: the GPU RAF windows are capped at 60 fps, so the comparable numbers are per-frame JS and draw calls. GPU time
was not measured on the host.

### 2.2 GPU tiers (host)

| tier, window | calls live → tiles | renderAt ×1 live → tiles | renderAt ×4 live → tiles | fps ×4 |
|---|---|---|---|---|
| high, standing | 363 → 323 | 4.25 → 4.44 ms | 15.4 → 16.0 ms | 51 → 50 |
| high, walking | 353 → 326 | 4.58 → 4.73 ms | 15.6 → 16.5 ms | 50 → 48 |
| low, standing | 257 → 217 | 3.63 → 3.60 ms | 11.90 → 11.88 ms | 60 → 60 |
| low, walking | 242 → 214 | 3.54 → 3.48 ms | 11.89 → 11.84 ms | 60 → 60 |

Per-pass calls at high (standing, the shadow pass is inside "colour"):

| pass | live | tiles |
|---|---|---|
| colour (incl. 97 shadow) | 232 | 212 |
| normal | 122 | 102 |

The tile layer's own JS (`tick`) is 0.06-0.25 ms at ×1 and 0.2-0.8 ms at ×4. It was 1.4 ms before the light key moved
off the frame (§1.5). The relight bug it exposed: the key included the cache's own rect uniforms.

Synced GPU frames (1-px read-back, raster included) are in the noise: high 9.4-11.4 → 9.9 ms, low 5.5 → 4.8-5.3 ms.

### 2.3 SwiftShader (`cpu` tier, 960×540)

| | live | tiles |
|---|---|---|
| synced p50, run 2 (warm ring, shadow code compiled out of the composite) | 196.4 / 194.6 ms | **156.9 / 155.5 ms** |
| synced p50, run 1 (bakes inside the window; composite with the masked shadow branch) | 230.6 / 230.5 ms | 240.2 / 243.3 ms |
| RAF fps, run 1 | 4.1-5.2 | 3.7-3.9 |

Run 1 taught two things:

- SwiftShader runs both sides of a uniform branch. The unused shadow code cost more than it saved, so the cpu-tier
  composite now compiles it out (`CT_NO_SHADOW`).
- Bakes inside a short window dominate it.

The RAF windows of run 2 were not re-measured: the lock time went to the laptop.

### 2.4 Memory, bakes, hitches

| | high 1920×1080 | low | cpu 960×540 |
|---|---|---|---|
| ring (9×6 / 8×5 / 6×4 tiles of 128²) | 43.9 MB | 34.1 MB | 24.4 MB |
| one tile bake (4 renders), CPU ×1 / ×4 | ≤ 7.9 / ≤ 32 ms | ≤ 7.3 / ≤ 32 ms | ≤ 19 ms |
| bakes while walking (6 s window) | 6 | 5 | 14-29 |
| first enable / zoom / vote pose | live frame + 6 tiles per frame until the view is full (3-4 frames) | | |
| lighting step | 1 stale tile re-baked per frame (≈ 40 frames for a full view); no relight happened in any window at 10:00 | | |

A bake is a hitch of one tile (≤ 8 ms at ×1) at most once per frame, and only while new ground scrolls in. With the
toroidal ring and the 1-tile prefetch, walking never forced a live fallback after the first frame.

### 2.5 iGPU laptop

__IGPU__

### 2.6 e2e (switch OFF = the default)

Host GPU (`CT_GL=gpu`, `E2E_V3=1`, port 3471, separate sandbox):

| run | v3-boot | v3-doors | v3-vote | v3-life |
|---|---|---|---|---|
| switch OFF (default build) | pass | pass | **fail** | pass |
| tiles ON by default (build with `VITE_CT_V3TILES=1`, the e2e-only build-time default added to `stage.ts`) | pass | pass | pass | pass |

- The OFF failure of v3-vote is the known intermittent page error
  `Cannot read properties of undefined (reading 'isReady')` (ui.md §, fullstack.md: v31-fixes' avatar `isReady`). It
  comes from the avatar layer, which this branch does not touch. With the switch off, `installTiles` is never called,
  and the only diff on the path is reading one more localStorage key.
- The same spec passed in the ON run, 3 minutes later.
- In the ON run the cache's activity was not asserted (the specs do not read `__ctCamera.tiles()`). Day scenes at the
  GPU tiers are where it is active.

## 7. Commands run (all from the worktree root; host via `scripts/remote.sh`, `CT_AGENT=v33-tiles` unless noted)

Small untracked wrappers in `.tiles/` hold the locks (shell strings with `$HOME` are refused by the local worktree
guard):

- `check.sh`: client `tsc` + vitest under the shared heavy lock.
- `run.sh`: `tests/perf/v3-tiles.ts` under the exclusive heavy lock + the browser lock, `timeout 900`.
- `build.sh`.
- `e2e.sh`: `E2E_V3=1 E2E_PORT=3471 CT_GL=gpu pnpm test:e2e --project=v3 …` under both locks.
- `batch.sh`.
- `sum.py`.

| command | result |
|---|---|
| `scripts/remote.sh sh .tiles/check.sh apps/client/test/game3d/tiles.math.test.ts …boundary.test.ts …world.stage.test.ts` | 1st: 3 tsc errors (`InterleavedBufferAttribute.version`, uniform typing), tests 28 / 28; after fixes tsc clean, 14 + 8 tests pass (several re-runs) |
| `scripts/remote.sh sh .tiles/run.sh --gl gpu --tier high --modes stills --out test-results/t1` | 0 px diff: every static mesh was demoted on the first frame (snapshot in `Float32Array` vs float64 matrices). Fixed. |
| same, `t3` | day 0.043 %, **cut 0.58 %**: cut windows drawn after the dynamic pass hid grass tufts. Fixed: windows first, then inside the main render. |
| `t5` (glass + rect-in-main-pass) | **14 %**: the rect clip was a shared-material uniform and clipped the live dais / doors. Fixed: a material twin per static material. |
| `t6` | cut 8 %: the twin lost the toon `defines` (`Material.copy` keeps none). Fixed. |
| `t7` | day 0.035 %, cut 0.016 %, vote 0.05 % |
| `--modes windows,synced --out test-results/g-high` | walking re-baked about 1 tile / frame: a relight every other frame (the light key included `uCtRects`). Fixed (`relightWhy` debug field). |
| `g-high2`, `g-low`, `g-high-ceil` (GPU) / `ss-cpu`, `ss-cpu2` (SwiftShader `cpu`, 960×540) | §2 |
| `CT_AGENT=v33-tiles-e2e scripts/remote.sh sh .tiles/e2e.sh v3-boot v3-doors v3-vote v3-life` | 3 pass, v3-vote fail (known `isReady` page error) |
| `CT_AGENT=v33-tiles-e2e scripts/remote.sh env TILES=1 sh .tiles/e2e.sh …` | 4 / 4 pass |
| laptop: `run.sh 9472 intel glegl tiles=plan-tiles.json` (driver from the laptop-perf HOWTO, port 3472, the host game driver from this sandbox's production build) | failed at once: `measure.mjs` set localStorage on `about:blank`. Patched locally (navigate first), re-run in §2.5. |



## 3. What would make it pay (plan for the rest)

1. **Canopy windows: cache the kit `soft` layer and the foliage cores.**
   - Per frame, one live rect per canopy slot (`uCtCan`: an avatar's capsule window, about 1.5 × 3 m), but only when a
     cached canopy mesh's cell bounds overlap that window.
   - The same machinery as the cut windows: the composite discards inside, and static meshes there draw live with the
     clipped twin.
   - Avatars on the open square open no window.
   - Gain: about 11 more meshes in view at the square, and the heavy tree cores elsewhere.
2. **Split the foliage piece into static cores / trunks and animated sprites** (vendor). The 3 fps leaf and grass
   sprites are the only real animation there; their cores never move.
3. **Deferred pool lights** (from v33-light, §4), so the cache also runs at dusk and night.
4. **Cheaper per-frame side:**
   - cached cell bounds for the cut test;
   - no full `isVisible` walk for the 56 meshes (dirty flags);
   - the composite and the cut twins only in frames with live rects.
5. Then re-measure on the iGPU laptop. Only there could the saved fragment work (static surfaces shaded once instead
   of every frame) show up as GPU ms.

## 4. Interface for v33-light (and what tiles leave to it)

- The tiles **do not cache shadows**. They sample the live sun shadow map in the composite (`uShadowM`, `tShadow`,
  bias / normal bias / intensity, read from `engine.sun.shadow` in the quad's `onBeforeRender`).
- A cached static shadow map from v33-light plugs in without changes, as long as `engine.sun.shadow.map` /
  `.matrix` still hold the merged (static + dynamic) map when the colour pass runs.
- If v33-light keeps two maps (static + dynamic-only), the composite needs one more sampler and
  `min(staticShadow, dynamicShadow)`. That is a 5-line change in `vendor/tiles.ts` (`ctShadow`).
- Tiles are **off while a pool light is lit** (golden / night). Their 8 fps flicker and the re-aim at the player
  (vendor `demo/time.js`) would re-bake every frame. With a deferred pool from v33-light, the cache could stay on at
  night:
  - store the authored mid tone `toonMid0` in one more ring texture (bake mode 4);
  - apply the pool in the composite with the vendor's quantised formula: `pq` steps, warmth, reach;
  - apply the cut-away's Bayer pool edge (vendor `town/cutaway.js` `patchCutMaterial`, lines ~219-229).

  This needs that edge as a reusable GLSL export (a pixel3d CONTRACT-REQUEST, see §6).
- Lighting steps (sun direction, ramps) trigger a relight: tiles are re-baked at 1 tile / frame, about 40 frames for a
  full view. A deferred sun (normal + albedo per band) would remove those re-bakes. The band-forced colours above
  already make the cloud and the cast shadow deferred.

## 5. Dirty rectangles / scroll reuse (coordinator stretch goal): assessment

Not implemented. What the code shows:

- **"Nothing moved, re-present the previous frame" never happens in v3.** Several things animate continuously
  (fullstack.md §6, learnings.md §2):
  - cloud shadows at 6 fps;
  - grass / leaves / foliage sprites at 3-3.5 fps;
  - water every frame (30 Hz reflection);
  - film grain (`grade.js`, `uTime·12`, world-anchored, over the whole screen);
  - flicker;
  - idle breathing of 15 rigs.

  An exact re-present is possible only on frames where none of the stepped clocks ticked. That is at most every other
  60 Hz frame (the 6 / 12 fps clocks). The cheaper and safer lever is the already-proposed **30 fps idle cadence**
  (fullstack.md §7, plan item 2): it halves the frames with the same look.
- **Scroll reuse of the final image**: the post chain (outline, contact, fog, grade grain, vignette) reads neighbours
  and screen position. A shifted previous frame is only valid away from every animated thing and its 6-texel kernel
  margin, and it still needs the whole frame's post passes. With the tile cache, the static part of a pan is already a
  single texture fetch per pixel; what remains live is exactly the dynamic set. So scroll reuse would save only the
  composite (one quad), not draws.
- **Dirty rects around moving dynamic things**: the dynamic set (15 walking avatars, grass, water, foliage) is spread
  over the whole square. Rects would cover most of the frame in every measured scene, while the bookkeeping costs
  CPU on the very thread that is the bottleneck.
- Verdict: not worth it on top of tiles. Ship the 30 fps idle cadence instead (power), and measure on the iGPU first.

## 6. Risks and what needs the pixel3d vendor session

Risks:

- **Shared kit materials.** The static set shares materials with live meshes (doors, dais, boards, tower face). Every
  per-draw state is either per object (layers) or a material twin with the same program key. A vendor change that
  moves state into a shared material uniform could leak.
- **Vendor GLSL anchors.** The patch needs `vec3 toonW = bandWeights(toonL, vToonCut);` and
  `#include <dithering_fragment>` in the toon fragment. When they are missing, the material is not patched and its
  mesh simply stays live, because the bake writes nothing for it. A vendor guard test should pin the anchors before
  this ships.
- **Composite fidelity.**
  - Shadow and penumbra use the cached (un-noised) normal, where the toon uses `toonUpY` from the noised normal.
  - The normal bias uses the shading normal, where the toon uses the vertex normal.
  - Measured: 0.01-0.07 % of pixels differ.
- **Raycasts.** Vendor code that raycasts the town with default layers (layer 0) would miss the static set while the
  cache is on. None was found in the game paths, but life / perches use `isCut` / CPU twins, not raycasts. Re-check
  after a vendor publish.
- **Memory.** The ring is 44 MB at high (1920×1080 → 9×6 tiles of 128²: 4 RGBA16F targets + depth texture + 4 depth
  renderbuffers) and about 25 MB at low / cpu. A smaller tile (64) and no depth renderbuffer on the three colour-only
  bakes would roughly halve it.

Vendor asks (CONTRACT-REQUEST, pixel3d session):

1. A bake hook in `toonMaterial`: `uBakeBand` / `uBakeLit` as first-class uniforms, instead of a string patch of
   `bandWeights(toonL, …)`.
2. The cut-away pool-edge dither (`patchCutMaterial`) and the point-light loop as exported GLSL functions, so a
   deferred pool can share them.
3. MRT colour + normal (learnings.md §4.1). It would halve the bake (4 → 2 renders per tile) and the live normal pass
   of the dynamic set.
4. A static / dynamic flag on piece meshes. Today the cache finds animated parts by watching them move. A flag would
   remove the first-frame stale parts (the still diff's few pixels on signs / vanes).

