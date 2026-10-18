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
