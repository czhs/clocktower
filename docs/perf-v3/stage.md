# v3 perf: the 3D town stage (front "stage")

Author: `v3-perf-stage` (v3 perf swarm, 2026-10-18, branch `v3-perf-stage` from `0cfd0b8` "v3 C1"). Scope: what the
town itself costs per frame (`game3d/world/**`, `game3d/vendor/{town,interiors,time}.ts`). Earlier recon on
SwiftShader: `recon-frame.md`. This front measured on the **host GPU** (RTX 3060, ANGLE/Vulkan), which the user allowed
on 2026-10-18.

## 1. Tooling (changes in this branch)

`tests/perf/v3-frame.ts` (the recon runner: Vite DEV, the real `createTownGame3d` over a fake connection, the own player
at spawn plus 14 remotes on a 12 Hz snapshot pump, walking) got four switches:

| Switch | What |
|---|---|
| `--gl gpu` | The host GPU. Uses the flags of `tests/e2e/playwright.config.ts` `CT_GL=gpu`. Default: SwiftShader, as before. |
| `--ls k=v,...` | Extra localStorage entries before the mount, for A/B debug switches such as `ct.debug.v3shadowEvery=1`. |
| `--phase night` | A minimal night game view. Its remotes are not game players, so it is not comparable with the lobby run. |
| ports | `3465-3469` (v3-perf-stage) besides `3488-3489` (v3-perf-frame). |

Two fixes:

- **The low tier is now pinned** (`ct.fxQuality=low`). Under Graphics `auto`, `TownGame3d` promotes a low start to high
  on a fast GPU, so every earlier GPU "low" run measured a high rebuild.
- `v3-frame-probe.js` follows the live engine after such a rebuild. Its census adds `drawGroups`: in-view meshes by
  piece and by material.

New files:

- `scripts/perf/v3-stage-ab.sh`: A/B variants in **one** short exclusive heavy-lock window.
- `scripts/perf/v3-stage-sum.cjs`: one summary block per run.

```
CT_AGENT=v3-perf-stage scripts/remote.sh bash scripts/perf/v3-stage-ab.sh shadow low 1920x1080,960x540 \
  census,counts,split,synced,cpu ct.debug.v3shadowEvery=1 ct.debug.v3shadowEvery=2
CT_AGENT=v3-perf-stage scripts/remote.sh node scripts/perf/v3-stage-sum.cjs test-results/ab-shadow/*/v3-frame.json
```

Caveats:

- The `synced` total (renderAt + a 1-px readPixels) is **noise-dominated on the GPU**: n = 8 and the host was loaded
  (load average 12-15 while the other swarm agents ran). The GPU `whatif` table is noise too. One example: "point lights
  hidden" came out at −113 % because it recompiles every program.
- The reliable numbers are draw calls, triangles, programs, and main-thread JS ms (mean over ~300 frames at a steady
  60 fps).

## 2. Baseline (C1 `0cfd0b8`, square, 14 remotes walking, host GPU, 60 fps in every run)

| | high 1920×1080 | low 1920×1080 | low 960×540 |
|---|---|---|---|
| low-res (pixelScale) | 640×360 (3) | 480×270 (4) | 480×270 (2) |
| draw calls / frame (mean) | 313 | 245 | 245 |
| of which shadow | 83 | 46.5 | 46.5 |
| stage calls: colour (incl. shadow) / normal / post | 197 / 108 / 7 | 145 / 93 / 7 | 145 / 93 / 7 |
| triangles / frame | 876 k | 351 k | 351 k |
| programs | 44 | 38 | 38 |
| RAF JS (mean) | 6.12 ms | 4.53 ms | 4.46 ms |
| renderAt (mean) | 5.70 ms | 4.24 ms | 4.19 ms |
| shadow / colour / normal / post issue (mean) | 0.71 / 2.05 / 1.96 / 0.29 | 0.50 / 1.51 / 1.36 / 0.29 | 0.48 / 1.50 / 1.33 / 0.27 |
| updaters / updateMatrixWorld | 0.26 / 0.17 | 0.22 / 0.17 | 0.23 / 0.16 |
| three `setProgram` / uniform `upload` (CPU profile, inclusive) | 2.47 / 1.49 | 1.72 / 1.05 | 1.78 / 1.14 |
| game3d/world self time | 0.01 ms | ≈ 0.01 ms | ≈ 0.01 ms |
| scene nodes (matrixAutoUpdate) / meshes / casters | 571 (562) / 262 / 104 | 561 (552) / 327 / 62 | same |

What this says:

- **The stage's own JS (`game3d/world/**`) is ≈ 0.01 ms per frame.** The vendor time facade is 0.02 ms, and
  `pixel3d/demo` is 0.18 ms in total.
  - The look is re-derived only when the hour moves ≥ 15 game seconds (vendor `time.js`).
  - The tower face is rebuilt only on a key change.
  - Interiors already park the town graph (`world/park.ts`).
  - "Skip the time-of-day recompute when the hour did not change" is therefore already done.
- **The frame is three issuing ≈ 100 colour and ≈ 100 normal draws, plus the shadow pass.** `setProgram` with its
  uniform uploads is about 40 % of renderAt. The light arrays (12 / 8 point lights at intensity 0 by day) are uploaded
  again on every program switch.
- What the colour / normal passes draw at the low square: **≈ 95 in-view meshes** (`drawGroups`).
  - By material:
    - `town-kit-solid` 29 (25 casting)
    - unnamed foliage / ground 33
    - `town-kit-glass` 13
    - `town-kit-soft` 11
    - `town-kit-solid-life` 6
  - By piece: foliage 20, props 10, ground 9, dais 7, then 2-6 per cottage.

## 3. Change landed: the sun shadow map every 2nd frame at `low`

`world/shadowCadence.ts` (pure, unit-tested) and `world/stage.ts` (an engine updater):

- At `low`, the stage sets `renderer.shadowMap.autoUpdate` to true only on every 2nd frame. The pipeline's `shadowOnce`
  then renders the map once on those frames. On the other frames it reuses the map from the frame before.
- three keeps the light's shadow matrix of the frame the map was rendered in, so a reused map is consistent with itself.
  Moving casters' shadows update at 30 Hz (at 60 fps).
- A refresh is forced:
  - before ready;
  - on a change of the drawn location (town ↔ room);
  - on a camera cut: the target moved > 1.5 m, or the view height changed > 2 %.
- `high` is unchanged (every frame).
- A/B switch: `ct.debug.v3shadowEvery=1|2|3`.
- Restored to `autoUpdate = true` on destroy.

Results: same tree, same run, same lock window. Only the switch differs.

| low, host GPU | 1920×1080 every 1 | 1920×1080 every 2 | 960×540 every 1 | 960×540 every 2 |
|---|---|---|---|---|
| draw calls / frame (mean) | 244.6 | **221.4** | 244.6 | **221.4** |
| shadow calls / frame (mean) | 46.5 | **23.3** | 46.5 | **23.4** |
| triangles / frame (mean) | 351 k | **302 k** | 351 k | **302 k** |
| shadow issue JS (mean) | 0.50 ms | **0.30 ms** | 0.48 ms | **0.27 ms** |
| renderAt JS (mean) | 4.24 ms | 4.09 ms | 4.19 ms | 3.85 ms |
| RAF JS (mean) | 4.53 ms | 4.37 ms | 4.46 ms | 4.12 ms |
| programs | 38 | 38 | 38 | 38 |

- Visual check: the 960×540 screenshots of both variants show the same shadows (banner poles, seat stones, stalls).
- On an iGPU the gain is half the 2048² depth raster plus about 23 draws per frame. On the software-GL `cpu` tier it is
  half the shadow raster too (SwiftShader: shadow 13 ms of a 1400 ms synced frame at low; small there).
- Tests:
  - `apps/client/test/game3d/world.shadowCadence.test.ts`: 5 tests.
  - All 9 world test files: 81 / 81.
  - `pnpm -r run typecheck`: green.
  - v3 e2e on the host GPU (low tier, so the cadence is active): `v3-boot`, `v3-doors` and `v3-life` pass (3 / 3,
    E2E_PORT 3466).

Also in this commit: `stage.ts` no longer runs a regex over all 16 buildings per frame to find the near door and the
prefetch door. The door centres are computed once.

## 4. Ranked follow-ups (not done: risk or ownership)

1. **Merge the static kit meshes across pieces at build time** (game3d/vendor/town.ts, after `buildTown`).
   - Change: bucket the static `town-kit-solid` / `-glass` / `-soft` meshes of the town by material, cast flag and a
     coarse spatial cell (for example 12 m). Leave out:
     - door pivots;
     - house-11 `fadeTargets`;
     - meshes `setLit` touches (the window glass `aGlow`);
     - boards;
     - the tower face;
     - `life`.
   - Gain: ≈ 50 of the ≈ 95 in-view meshes. That is −100 calls in colour + normal and about −25 shadow calls: about
     half the frame's draws, and the largest CPU lever left in the town.
   - Risk: high.
     - The cut-away and the canopy are per material: fine.
     - `setLit` / window glow, cottage fades, `park` and `houseProxies` read per-piece groups.
     - It needs a per-piece audit and `v3-life` / `v3-doors` / render-check stills.
   - Target: v3.1.
2. **No point lights by day** (recon-frame §4.1).
   - Gain: the 12 / 8-light uniform upload on each program switch (part of the 1.0-1.5 ms `upload`), and the fragment
     loop.
   - Cost: it breaks the §7 rule "light count constant", so the warm-up must compile both variants. A lead / §7 decision.
3. **Freeze static matrices** (`matrixAutoUpdate = false` on static town nodes).
   - Gain: at most ≈ 0.1 ms. 552 of 561 nodes auto-update, but the town root carries the per-frame texel-snap offset,
     so every world matrix is recomputed anyway; only `compose()` is saved.
   - Doors, cut-away lifts and banners must stay dynamic. Low value; skipped.
4. **Vendor CONTRACT-REQUESTs** (pixel3d session; §9.2):
   - MRT colour + normal (−93 to −108 normal-pass calls);
   - one merged water pass;
   - `wind.js` banner flutter with `addUpdateRange` instead of a whole-buffer upload 3× / s;
   - `Engine._updateSun` / `PixelCamera.set` per-frame allocations.
5. **`high` shadow cadence.** Every 2nd frame at high would save ≈ 41 calls per frame and half of a 4096² depth pass.
   - It is a look change on discrete GPUs, which are already at 60 fps with a 6 ms RAF here. Not applied.
   - The data run (`v3-stage-ab.sh shadowhigh high ...`) waited 30 min for the exclusive heavy lock behind shared holders
     and was cancelled. Re-run it when the host is quiet.

## 5. Proposed `scripts/perf/budgets.mjs` keys (do not edit budgets.mjs here; WP7 / lead)

Source: `tests/perf/v3-frame.ts --gl gpu` at the square, 14 remotes walking, 1920×1080, means over a 5 s window.

| key | max | measured (this branch) |
|---|---|---|
| `v3GpuCallsMeanHigh` | 360 | 313 |
| `v3GpuCallsMeanLow` | 255 | 221 (245 before the cadence) |
| `v3GpuShadowCallsMeanLow` | 30 | 23.3 (catches a regression of the low cadence) |
| `v3GpuTrisMeanLow` | 360 k | 302 k |
| `v3ProgramsHigh` / `v3ProgramsLow` | 50 / 44 | 44 / 38 (constant through each run) |
| `v3GpuRenderAtJsMeanLowMs` | 6.0 | 4.1 (host CPU; relative only) |
| `v3GpuRenderAtJsMeanHighMs` | 8.0 | 5.7 |

## 6. v3.1: the static town-kit meshes batched across pieces (§4.1 done)

Author: `v31-stage` (v3.1 swarm, 2026-10-18, branch `v31-stage` from `d9cc841`).

### 6.1 What it does

- `game3d/world/merge.ts` (pure three, no vendor import) takes the static kit meshes (`town-kit-solid` / `-soft` /
  `-glass`) of `props`, `house-0..14`, `clocktower`, `ground` and `foliage` and builds **one `THREE.BatchedMesh` per kit
  material + design castShadow flag** (7 at both tiers). Every source is one instance with an identity matrix; its
  vertices are baked into town-root space:
  - `position` (point), `normal` (normal matrix), and `aTownPart` (cut-away centroid = point; `w` = 2 + the baked
    bottom y, exactly the transform `cutaway.js PART_VERT` applies with `modelMatrix`);
  - every other attribute is copied verbatim (tones, pattern, `aGlow`, `aTownPiece`); `aTownPiece` is 0-padded for
    the props (0 = "not a cottage", what the shader read for the missing attribute).
- Each batch is ONE multi-draw per pass (`WEBGL_multi_draw`; three falls back to a draw per instance without it).
- Culling (`cull`, default `'view'`): ONCE per frame (`MergedTown.cull`, from the stage updater) each instance is shown
  when its root-space bounds, its ground shadow (corners along the sun to y = 0: the vendor's installShadowCull rule)
  or its water reflection (corners with y mirrored: the river / well reflection cameras) overlap the view + 1.5 m.
  three's per-pass instance culling and sorting are OFF, so it rebuilds a batch's draw list only when a visibility
  changed; instances keep a fixed front-to-back order along the gameplay camera (three's order for separate meshes).
  `ct.debug.v3mergeCull=three` = three culls + sorts every instance in every pass instead (more exact, more JS).
- The kit materials get the `USE_BATCHING` program variant: programs 49 -> 53 at low, compiled by the existing
  warm-up (the merge runs before it). The vendor's world-position code reads `modelMatrix` only, which is right
  because the instance matrices are identity.
- The sources stay where they are (`Box3.setFromObject` pick proxies / cut-away tops, the piece apis keep working on
  them) with `layers.mask = 0`, so three skips them in the colour, normal and shadow passes, and they are never uploaded.
- Runtime safety (`MergedTown.sync`, every frame after the time facade; a few µs):
  - attribute writes the vendor makes on a source (`setLit` glass, the street-lamp glass of `demo/time.js`) bump the
    attribute version and are copied into the batch range (`addUpdateRange`);
  - a source that is hidden, moved, re-parented, or whose geometry / material / attributes are swapped is **ejected**:
    its instance is hidden and the source renders itself again. At the square this catches 9-10 animated meshes on
    the first frame: the house-3 crow, the house-11 vane, the props garlic string, the two stall lanterns (solid +
    glass: their swing groups are not named `*-pivot`), the fountain-water glass, the ground boat and `house-14-water`.
    (CONTRACT-REQUEST in INTEGRATION.md §9.2: tag such meshes upstream.)
  - while an interior is shown the park detaches the branches: nothing is ejected meanwhile.
- Left out up front (`vendor/town.ts mergeTownKit`): every door pivot subtree (and any `*-pivot`), the tower hands and
  countdown face, house-11's `fadeTargets` and the crown / clump meshes, everything the game added (`ct-*`: boards),
  the dais, life, interiors.
- Design castShadow: buildTown's shadow-caster cull rewrites `castShadow` from the build camera before it returns, so
  `buildHollowmere` snapshots each mesh's flag while the composer registers its piece (`Registry.prototype.add`
  wrapped for the duration of the build) and applies the composer's low-tier "receive only" rule on top; the merge is
  refused if that count disagrees with `stats.lowTier.softNoCast`. The merged casters get the same view-based shadow
  cull as the vendor's (`MergedTown.cullShadows`).
- Switches: `ct.debug.v3merge=0` (off), `ct.debug.v3mergeMode=merge` (one plain merged geometry per bucket and
  `ct.debug.v3mergeCell` m cell instead), `ct.debug.v3mergeAB=1` (`window.__ctMergeAB`: `set(on)`, `render()` = the same
  frame again returning its draw calls, `drawn()` = a per-mesh draw census, `info()`).

### 6.2 Pixel A/B (the look is unchanged)

`scripts/perf/v3-merge-ab.sh` / `tests/perf/v3-merge-ab.ts`: the harness scenarios on the host GPU, each still
rendered three times IN THE SAME FRAME (the harness clock is paused at a shot; the renders skip the updaters): merge
off, on, off again. Draw calls are `renderer.info.render.calls` of one full pipeline render (shadow map included).

| scenario (960×540) | tier | draws off -> on | pixels off vs on (of 518,400) | off vs off |
|---|---|---|---|---|
| square-day-8 (2 stills) | low | 272 -> 201 (−26 %) | 8 (2 low-res texels; max Δ 28) | 0 |
| square-day-8 | high | 343 -> 264 (−23 %) | 8 (max Δ 28) | 0 |
| night-15 (light pool) | low | 253 -> 183 (−28 %) | 12 (max Δ 1) | 0 |
| night-15 | high | 325 -> 248 (−24 %) | 20 (max Δ 1) | 0 |
| vote-12 (2 stills) | low | 395 -> 295 (−25 %) | 16 (max Δ 94) | 0 |
| vote-12 | high | 456 -> 345 (−24 %) | 20 (max Δ 93) | 0 |

The differing texels are float-rounding of the baked vertices (Δ 1 of 255) and 1-2 depth ties per still between
coplanar faces of two pieces (one roof-course texel at the square; one edge texel at the vote). Same switch, same frame.

Why not "half the draws": after the batch, the town's remaining draws are not kit meshes: foliage chunks (cores /
leaves, ~30), ground terrain tiles (12) and grass, the 16 door leaves, the dais, life, the characters (×3-4 passes) and
the 8 post passes (`drawn()` census at square-day-8 low). The kit itself went from ~76 meshes × 3-4 passes to 7 draws
per pass. The plain-merge variant shows the trade-off: 12 m cells keep too many singleton buckets (−14 draws), one cell
for the whole town saves −63 draws but draws +200 k triangles (no culling inside a merged mesh); the batch saves −71
with the triangle count of the visible sources.

### 6.3 Frame cost (tests/perf/v3-frame.ts --gl gpu, square, 14 remotes walking)

The harness table above was re-run with the final `'view'` cull: the same draw counts, pixels 8 / 12-20 (Δ 1) / 20-32
per still (≤ 8 low-res texels), off vs off 0.

Low, first version (cull `'three'`, run 21:55, host load 5-13):

| low | 1920×1080 off | 1920×1080 batch | 1440×900 off | 1440×900 batch |
|---|---|---|---|---|
| draw calls / frame (mean) | 240.2 | **195.1** | 227.6 | **187.9** |
| shadow calls / frame (mean) | 27.6 | **22.3** | 26.2 | **21.5** |
| normal-pass calls | 98 | **76** | 90 | **74** |
| triangles / frame (mean) | 534 k | 555 k | 521 k | 546 k |
| programs | 49 | 53 | 49 | 53 |
| renderAt JS (mean) | 7.14 ms | 7.60 ms | 7.06 ms | 7.67 ms |

High, 1920×1080 (three runs in one lock window each; host load 2-14 from the other agents):

| high | off | batch, cull 'view' (default) | batch, cull 'three' | batch 'view' + renderOrder −1 |
|---|---|---|---|---|
| draw calls / frame (mean) | 350.4 / 351.2 / 350.8 / 351.0 | **292.4 / 292.7 / 293.4** | 293.2 | 293.2 / 293.9 |
| shadow calls / frame (mean) | 84.6 | **66.9** | 66.9 | 67.1 |
| normal-pass calls | 108 | **88** | 88 | 88 |
| triangles / frame (mean) | 1.19 M | 1.35 M | 1.25 M | 1.35 M |
| programs | 55 | 59 | 59 | 59 |
| renderAt JS (mean) | 9.17 / 8.59 / 8.85 / 8.86 ms | 9.58 / 9.55 / 9.15 ms | 9.78 ms | 9.49 / 9.39 ms |

(The 22:09 quiet-host run, cull 'three': off 4.73 ms / 352 draws, batch 5.12 ms / 294 draws, plain merge 12 m cells
4.74 ms / 345 draws.)

- Draws −17 % (high) / −19 % (low) per frame, shadow draws −20 %, normal-pass draws −18 to −22 %. The probe counts
  every `renderBufferDirect`; the harness `render.calls` counts GL draws (−23 to −28 %): a batch with no visible
  instance in a pass still costs a `setProgram` but no draw.
- **renderAt JS is +0.3 to +0.7 ms per frame on the host CPU** (consistent over 4 lock windows, so not noise), the
  `'view'` cull being the cheaper of the two. The normal pass gets SLOWER with 18 fewer draws, which points at the
  program switches: the batch uses the `USE_BATCHING` variant of the SAME kit material the doors / boards / lanterns
  use, and three sorts opaque objects by material, then depth, so every pass flips between the two variants and each
  flip is a full `setProgram` (material uniforms + the 12 / 8-light arrays). Drawing the batches first
  (`ct.debug.v3mergeOrder=-1`) did not help.
- What this means for laptops is NOT measured here: the saving is in the browser's GPU process (fewer ANGLE draws:
  D3D11 / Metal validation per draw) and on the GPU, the cost is on the main thread. Before v3.1 ships with the
  batch on, run the same A/B on a real iGPU laptop at 1440×900 DPR 2 (`ct.debug.v3merge=0` vs default, the
  `__ctCamera.v3()` fps and the perf overlay); turn it off by default if the main thread loses there.
- renderAt JS did not go down on the host CPU: +0.5 ms is inside this host's run-to-run noise (two identical runs
  differed by 0.4 ms today; load 5-16 from the other agents), but it is not a CPU win either. Likely costs: the batch's
  per-pass cull + sort + indirect-texture upload, and program switches between the batched and the plain variant of the
  SAME kit material (doors / boards share the material, so three's material-then-depth sort interleaves them).
  Follow-ups in §6.5.

### 6.4 Correctness checks run

- `apps/client/test/game3d/world.merge.test.ts` (12): bake (positions / normals / aTownPart / tags), buckets, padding +
  order, refusals, glass mirroring, ejection, park, A/B switch, shadow cull, batch mode, the `'view'` cull.
- `apps/client/test/game3d` 427 / 427, `pnpm -r run typecheck` green.
- e2e on the host GPU (port 3466): `v3-doors`, `v3-life`, `v3-vote` 3 / 3 (batch, cull `'three'`); re-run with the
  final `'view'` cull: see the commit message.
- Picking: the pick proxies are `houseProxies` (Box3 of the piece groups, which still hold the hidden sources): unchanged.
  The canopy cut-away and the cut-away are per material (the batch uses the same material objects); door swings: doors
  are never merged; `setLit`: mirrored (night-15 stills identical up to Δ 1).

### 6.5 Follow-ups

1. Remove the program flip: give the batched kit draws their own sort group without a second program, e.g. draw the
   static kit as plain merged meshes per spatial band whose `drawRange` is set per frame from the view's x band (one
   draw per material, the same program as the doors, partial culling), or ask pixel3d to render doors / boards / the
   tower face with the batching variant too (then every kit draw is batched: zero flips).
2. Laptop A/B (above) before deciding the default.
3. Proposed `scripts/perf/budgets.mjs` keys (not edited here): `v3GpuCallsMeanLow` 255 -> 215, `v3GpuCallsMeanHigh`
   360 -> 310, `v3GpuShadowCallsMeanHigh` 75 (66.9 measured), `v3ProgramsHigh` / `v3ProgramsLow` 50 / 44 -> 62 / 56
   (59 / 53 with the batching variants), and `v3GpuRenderAtJsMeanHighMs` stays 8.0 against the quiet-host 5.1 ms.

