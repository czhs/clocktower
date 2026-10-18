# v3 perf: client front (load, frame time, characters / overlays, memory)

Agent `v3-perf-client`, branch `v3-perf-client` from `4e99bc8` (the "v3 WIP" handoff commit), 2026-10-18. Merged fronts
of the recon docs `recon-load.md`, `recon-frame.md`, `recon-chars.md`. C1 (camera.ts, stage.ts, interiors.ts,
TownGame3d.ts, GameScreen.tsx) and WP8 (LobbyRoute.tsx, ui/lobby/**) were being edited elsewhere, so none of those
files is touched here; the hot spots found in them are listed for later (section 5).

**Method.** Everything ran on the host through `scripts/remote.sh`. Baseline = a `git archive 4e99bc8` copy (sandbox
`v3-perf-client-base`) with only the perf tooling overlaid. After = this branch (sandbox `v3-perf-client`). Every
runtime measurement ran under the EXCLUSIVE `v3-heavy.lock` plus `browser.lock`. Builds and unit tests ran under the
shared lock. Since 2026-10-18 the host GPU is allowed: the frame / load / memory numbers below are **Chromium on the
host RTX 3060 (ANGLE / Vulkan, `--gl gpu`)**, not SwiftShader. The host was loaded by other swarms (load average
10-20 on 12 cores). Treat ms numbers as relative (before/after on the same tool and profile). Counts (calls,
programs, triangles, bytes) are machine-independent.

## 1. Changes (commit 1, `v3 perf(client): smaller town3d chunk, …`)

| # | Change | Files | Visual / behaviour |
|---|---|---|---|
| L1 | The inlined vendor roster is **trimmed at build time** (`roster.json?ct-trim`: id, name and the offer flags per row; the game only reads `name`, `demo/characters.js createCharacter`). 83 KB raw JSON → ≈ 4 KB | `apps/client/build/pixel3dImports.ts` (+ `load` hook, `trimRoster`), `apps/client/test/game3d/vendorGuard.test.ts` (patch expectation + a trim test) | none |
| L2 | The **room modules load lazily**: `town/interiors/{index,kit}.js` + `demo/tower-interior.js` leave the town3d chunk (`buildHouseInterior` was already async; `buildTowerInterior` is now async; its only caller in `world/stage.ts` already wraps it in `async () =>`, so stage.ts is unchanged) | `apps/client/src/game3d/vendor/interiors.ts` | none (the chunks are prefetched with the pieces, L3) |
| L3 | **Parallel piece fetches.** `buildHollowmere` first calls `prefetchTownChunks()`: every BUILD_ORDER piece chunk + `life/index.js` (an `import.meta.glob` naming the same modules as the build-time map inside `town/api.js`, so the same chunks), the room chunk and the warm-up room `house-0` start at once. The vendor's `buildTown` imported each piece only after building the previous one (20 serial round trips on a cold join) | `apps/client/src/game3d/vendor/town.ts` | none (same modules; piece modules only declare functions at top level) |
| A1 | `isBlockedPx` / `locationAt` **allocate nothing** (5 arrays + closures per call before; it runs per sweep step of every move check, per frame for the 3D townsfolk via `npcs.ts` / `path.ts segmentClear`, and on the server's movement validator). `world.ts` and `client.ts` stay source-identical (`client-entry.test.ts`) | `packages/protocol/src/{world,client}.ts` | none (same tiles tested) |
| T | Tooling: `--gl gpu` for `v3-frame.ts` / `v3-load.ts` / `v3-memory.ts`, `CT_GL=gpu` for `tests/v3/harness.config.ts`; the v3-perf-client port range; `v3-frame.ts` sets `ct.debug.v3force` (without it the low tier's census failed: the perf sampler / fallback path swapped the measured engine away mid-run, both trees) and reports `gameSitesKbPerFrame` (the game's own allocation sites); the probe follows the latest live engine | `tests/perf/*`, `tests/v3/harness.config.ts` | tools only |

## 2. Load

### 2.1 Bundle (`scripts/perf/v3-bundle.mjs`, brotli KiB, deterministic)

| Item | Before (4e99bc8) | After | Δ |
|---|---|---|---|
| entry JS | 43.84 | 43.88 | +0.04 |
| LobbyRoute | 68.46 | 68.50 | +0.04 |
| **town3d chunk** | **309.54** (1176 KiB raw) | **270.40** (1062 KiB raw) | **−39.14** |
| mount closure (town3d + new static deps) | 331.08 | 291.90 | −39.18 |
| lazy room chunks now outside town3d | — | `kit-*.js` (interiors index + kit) 9.64, `tower-interior-*.js` 5.67 | +15.3 lazy, fetched in parallel with the pieces |
| pieces (21) | 167.24 | 167.21 | 0 |
| lazy town total | 291.27 | 300.88 | +9.6 (the room modules moved here) |
| characters (37 specs) / max | 165.53 / 5.85 goat | 165.58 / 5.86 | 0 |
| Classic TownGame | 281.11 | 281.32 | 0 |
| checks (raw .js assets / three copies / harness files / v3 in entry or LobbyRoute) | 0 / 1 / 0 / none | 0 / 1 / 0 / none | ok |
| fetch model (150 ms RTT, 1.6 Mbit/s): mount | 1845 ms | 1645 ms | −200 ms |

So the town3d chunk is back near its pre-C1 size; the §7 contract (≤ 230) is still exceeded by C1's wiring
(overlay 10.4, social/gameplay 14.3, avatars 6.8, net 4.9 KiB br …) and three (≈ 133 KiB br, floor).

### 2.2 Time to first frame (`tests/perf/v3-load.ts --gl gpu`, Slow 4G 150 ms / 1.6 Mbit/s, CPU ×4, 1 ST + 14 bots, low tier, 1280×720, uncompressed local server)

| Milestone (ms from navigation) | Before cold | **After cold** | Before warm | After warm |
|---|---|---|---|---|
| town3d request start / end | 5 518 / 19 115 | 5 519 / **17 753** | 1 562 / 1 568 | 1 620 / 1 623 |
| pieces first start → last end | 19 847 → 43 195 (23.3 s) | 17 965 → **21 579 (3.6 s)** | 2 249 → 20 032 | 2 276 → 2 299 |
| serial piece steps | 20 | **0** | 20 | 18 (cached: each import resolves at once) |
| **ready** (loading overlay gone = first v3 frame) | 47 442 | **39 559 (−7.9 s, −17 %)** | 23 183 | 22 113 (−1.1 s) |
| all 15 avatars built (`avatars`) | 55 367 | 44 890 (−10.5 s) | 27 637 | 26 527 |
| warm-up (canvas → ready) | 28 327 | 21 806 | 21 615 | 20 490 |
| long tasks before ready: n / sum / max | 39 / 21.9 s / 6.9 s | 33 / 20.1 s / 6.8 s | 38 / 21.7 s / 6.9 s | 39 / 20.6 s / 6.8 s |
| JS heap at ready | 257 MiB | 215 MiB | 242 | 228 |
| requests / bytes (uncompressed) | 168 / 5.49 MB | 169 / 5.03 MB | 167 / 8 KB | 169 / 8 KB |
| programs / calls at ready | 51 / 249 | 49 / 248 | 51 / 279 | 49 / 273 |

Host load average during the windows: before 14.3 → 13.0, after 12.4 → 11.9 (shared host, other swarms). The cold
gain is the piece waterfall (20 → 0 serial steps) plus a smaller town3d chunk (−114 KiB raw: town3d done 1.4 s
earlier at 1.6 Mbit/s). The CPU-bound part (piece builds + the ≈ 6.8 s warm-up long task at CPU ×4) is unchanged,
as expected; it is vendor build CPU and the warm-up renders (recon-load items 5, 9).

## 3. Frame time per tier (`tests/perf/v3-frame.ts --gl gpu`, Vite DEV, real `createTownGame3d` on a fake connection with 14 remotes, own avatar at spawn, walking)

Baseline at 1920×1080 (host RTX 3060; JS = main-thread ms per RAF frame; `synced` = renderAt + a 1-px readPixels,
i.e. CPU + GPU of one frame; allocations from a synced 16-frame run at the real 1/60 s step):

| | high 1080p | low 1080p | high 540p |
|---|---|---|---|
| low-res target / pixelScale | 640×360 / 3 | 480×270 / 4 | (pixelScale 2) |
| draw calls (synced mean) | 306 (color 197, normal 108, post 7; shadow 81 of color) | 242 | 307.5 |
| triangles / frame | 876 k | 347 k | 833 k |
| programs | 44 (constant) | 38 (constant) | 44 |
| point lights (pool, 0 lit by day) | 12 | 8 | 12 |
| RAF delta p50 | 16.7 (60 fps) | 16.7 | 16.7 |
| JS per frame p50 / p95 | 5.6 / 9.6 | 4.2 / 7.2 | 6.0 / 9.8 |
| of which renderAt (three issue) / game JS | 5.2 / 0.3 | 3.9 / 0.2 | 5.6 / 0.3 |
| synced frame (CPU + GPU) p50 | 10.3 | 9.7 | 14.1 |
| allocations KiB / frame (synced) | 169 | 142 | 176 |
| of which the game's own sites (RAF window) | ≈ 9 | ≈ 6 | ≈ 9 |

Before / after at the same settings (second run of each, one exclusive window, `--modes census,counts,split,synced,heap`):

| | high 1080p before → after | low 1080p before → after | high 540p after | low 540p before → after |
|---|---|---|---|---|
| draw calls | 312 → 314.5 | 242.5 → 242.5 | 317.5 | 242.5 → 242.5 |
| programs | 44 → 44 | 38 → 38 | 44 | 38 → 38 |
| JS / frame p50 / p95 | 5.4 / 8.9 → 5.6 / 9.3 | 4.4 / 7.6 → 4.5 / 8.5 | 5.6 / 8.6 | 4.8 / 8.5 → 4.6 / 7.7 |
| game JS / frame | 0.4 → 0.4 | 0.3 → 0.3 | 0.4 | 0.3 → 0.3 |
| synced frame p50 | 12.5 → 11.6 | 9.4 → 9.0 | 11.9 | 7.9 → 10.4 |
| allocations KiB / frame, synced | 186 → 171 | 162 → 138 | 173 | 157 → 148 |
| **game's own allocation sites, KiB / frame (RAF)** | **9.87 → 7.14 (−28 %)** | **8.52 → 6.35 (−25 %)** | 6.78 | **8.29 → 6.55 (−21 %)** |

Frame times did not change measurably (as expected: the game's share of a frame is 0.3-0.4 ms; the differences
above are run-to-run noise on a loaded host). The game-side allocation rate dropped by a quarter (A1). Caveat: the
fake lobby of `v3-frame.ts` had 8 skinned meshes drawn at high (≈ 4 rigs + their fx overlays) and 2 at low when
measured (builds still in flight / far rigs parked), not 15 rigs; the 15-rig cost is in §4 (`v3-memory.ts`) and in
`recon-chars.md` §4.1 (≈ 3 calls, 0.28 ms CPU per rig).

**Where the frame goes (GPU host).** 93 % of the main-thread frame is three's render issue inside the vendor
pipeline (`setProgram` 2.5 ms, uniform `upload` 1.5 ms incl. `flatten` of the 12-light arrays per program switch,
`renderBufferDirect`, `projectObject`); updaters 0.2 ms, the whole game (net, avatars, overlay, input, world) 0.3 ms.
The allocation rate is dominated by three's uniform setters (`setValueV3f` 34, `setValueM4` 20, `setValueV4fArray` 7
KiB / frame: boxed doubles stored into the uniform caches) and the vendor (`wind.js:33` banner flutter 10,
`PixelCamera.snapWorld` 7.4, `look.js applyFlags` 2.8, `character.js _step` 1.0 KiB / frame). GC is ≈ 0.01 ms /
frame on this CPU. The game's own top sites were `isBlockedPx` / `locationAt` (≈ 2.5 KiB / frame: fixed, A1) and
`coords.ts projectNdc / ndcToCss / shaderOffset` + `camera.ts project` (≈ 2.4 KiB / frame: lead / C1 files, §5).

## 4. Memory across remounts

Two runs on the host GPU, both trees (`--enable-precise-memory-info`, `--js-flags=--expose-gc`, forced GC before each
reading):

**(a) Real destroy path: harness `?mode=cycles`** (`tests/v3/render-check.spec.ts` "cycles", `CT_GL=gpu`, 5 mounts +
2 tier rebuilds + 1 injected crash, own avatar only: the harness slices the scenario to one member). JS heap (MB)
after each destroy:

| after | 0 mount | 1 mount | 2 mount | 3 mount | 4 mount | 5 rebuild high | 6 rebuild low | 7 crash | growth (first → last normal) |
|---|---|---|---|---|---|---|---|---|---|
| before (4e99bc8) | 86.0 | 90.9 | 159.7 | 166.4 | 168.2 | 192.1 | 171.0 | 171.1 | 85.0 |
| after | 85.0 | 90.7 | 159.5 | 167.5 | 167.9 | 200.1 | 179.7 | 170.6 | 94.7 |

Every other check passes in both trees (canvases 0 after each destroy, `__ctCamera` / `__pixel` gone, boot mark
cleared, crash → one 'error' fallback). The `heapGrowthUnder10MB` check FAILS in both trees, identically: **this is
pre-existing, not caused by this branch.** The shape is not the old per-mount Engine leak (that was +70 MB on EVERY
cycle, recon-chars §4.4): the heap steps up ≈ +69 MB once (cycle 2) and then plateaus (166-168 MB for cycles 2-4),
i.e. something keeps **at most one** destroyed town alive until the next mount replaces it (a module-level "last"
reference: candidates are vendor module state that remembers the last engine / town, V8 feedback on a piece api
literal as `vendor/town.ts releaseTown` notes, or a game3d module-level cache). Next step: a heap snapshot after
destroy #3, retainers of the second `Scene` (needs ≈ 30 min; not done in this time box).

**(b) 15 rigs + town + overlay, component level: `tests/perf/v3-memory.ts --gl gpu --only cycles --cycles 5`** (after):

| | baseline (nothing mounted) | destroy #1 | #2 | #3 | #4 | #5 |
|---|---|---|---|---|---|---|
| JS heap MiB | 8.1 | 29.6 | 31.3 | 100.6 | 32.5 | 101.1 |
| retained Engine / WebGLRenderer / Scene / SkinnedMesh / canvas / WebGL2 ctx / ResizeObserver | 0 / 0 / 0 / 0 / 0 / 0 / 0 | 0 each | 0 each | 0 each | 0 each | 0 each |
| live GPU objects while mounted (geometries / textures / programs) | — | 303 / 30 / 47 | 303 / 30 / 47 | 303 / 30 / 47 | 303 / 30 / 47 | 303 / 30 / 47 |

**The ~135 MB Engine leak stays fixed**: 0 engines, renderers, scenes, skinned meshes, canvases, WebGL contexts and
ResizeObservers survive a destroy (recon: +1 of each per cycle, +70 MiB / cycle). GPU-side counts are identical
every mount (no texture / geometry / program growth; WebGL contexts are released). The heap alternates 30 ↔ 100 MiB
between cycles without trending up (cycle 4 is back at 32.5): the same "one stale town until the next mount" pattern
as (a), freed by the following mount. BufferGeometry objects +611 after cycle 1 and constant afterwards (vendor
per-spec caches; recon-chars §5 item 14: keep).

## 5. Hot spots left for later (not edited: other owners' files in flight, or vendor)

- `game3d/coords.ts projectNdc / ndcToCss / shaderOffset` (v3-lead) and `input/camera.ts project / worldToScreen`
  (C1): return a fresh object per call, ≈ 2.4 KiB / frame with 15 labels; add `out` parameters.
- **No Phaser in a v3 join** (`ui/lobby/LobbyRoute.tsx warmTown`, WP8): recon measured −5.8 s cold / −296 KiB br.
  With WP8's URL paths the world is known from the path: prefetch `TownGame3d` + `prefetchTownChunks()` (exported
  from `vendor/town.ts`, idempotent) on `/`, and Classic only on `/v2/`.
- Start `town3d` with the join, not after `lobby:view` (≈ 1.2 s, WP8 / GameScreen).
- Preload every member's cast spec at mount (TownGame3d has the lobby view; `avatars/layer.ts` only preloads a pid
  when it first sees it after the town build): `avatars` mark is ≈ 8 s after `ready` cold.
- Light pool: hide the point lights by day (−12 / −8 lights in every lit fragment + the per-switch uniform upload,
  the largest CPU item in `upload`); needs both light-count program sets in `stage.warmUp` (C1).
- `overlay/surface.ts` FX canvas: skip clear + redraw when the frame's blit list equals the last one (compositor
  re-raster of a full-viewport canvas on most daytime frames). Changes the immediate-draw contract the overlay unit
  tests rely on (`lastDraw`), so it needs a WP4 test update.
- `avatars/billboard.ts`: crop the id's cells instead of uploading whole sheets (≈ −15 MiB GPU with brianbi /
  nicksong in the lobby).
- Vendor CONTRACT-REQUESTs (pixel3d): `wind.js` banner flutter (update only the banner range), `PixelCamera.snapWorld`
  / `set` temporaries, `Character._step` temporaries, merged water passes, an MRT normal pass.

## 6. Proposed `scripts/perf/budgets.mjs` keys (not edited here)

| Key | Max | Measured (after) | Source |
|---|---|---|---|
| `town3dChunkBrKiB` | 285 | 270.40 | v3-bundle `summary.town3dChunkBrKiB` (contract 230 needs C1-side splitting) |
| `v3MountBrKiB` | 305 | 291.90 | `summary.town3dMountBrKiB` |
| `v3LazyTownBrKiB` | 360 | 300.88 | `summary.lazyTownTotalBrKiB` |
| `v3CharacterMaxBrKiB` | 8 | 5.86 | `summary.maxCharacterBrKiB` |
| `v3PieceSerialSteps` | 3 | 0 | v3-load cold `net.pieces.serialSteps` |
| `v3GpuCallsHigh1080` / `Low1080` | 360 / 290 | 306 / 242 (baseline; unchanged by this front) | v3-frame `--gl gpu` synced calls |
| `v3GpuProgramsHigh` / `Low` | 48 / 42 | 44 / 38 | v3-frame programsSeen (constant) |
| `v3GpuJsFrameP50High1080` / `Low1080` | 8 / 6 ms | 5.6 / 4.2 | v3-frame `--gl gpu` RAF JS p50 (host CPU, relative) |
| `v3GameAllocKbPerFrame` | 9 | 7.14 high / 6.35 low (1080p) | v3-frame `heap.gameSitesKbPerFrame` sum |
| `v3ColdReadyMsGpu` | 45 000 | 39 559 | v3-load `--gl gpu` cold `marksMs.ready` (CPU ×4, Slow 4G; relative) |
| `v3MountRetainedEngines` | 0 | 0 | v3-memory cycles `retainedGrowth.Engine` |
| `v3RemountHeapPlateauMiB` | 10 (target; today ≈ 85-95, pre-existing, §4) | 94.7 | harness cycles `heapGrowth` |

## 7. Commands run (host, via `scripts/remote.sh`; `pc.local.env` / `wA.local.env` / `wB.local.env` are gitignored helper scripts that take the locks and log `/proc/loadavg`)

| Command (host) | Result |
|---|---|
| `CT_AGENT=v3-perf-client scripts/remote.sh sh pc.local.env bundle base` (= `flock -s … node scripts/perf/v3-bundle.mjs --json … --out-dir …`) on the untouched tree | ok (summary §2.1) |
| same, `bundle a1`, after the load changes | ok |
| `CT_AGENT=v3-perf-client-base … xsh … tsx tests/perf/v3-frame.ts --gl gpu --port 3490 --tiers high,low --viewport 1920x1080 --modes census,counts,split,synced,cpu,heap --chars 0 --secs 6 --frames 24 --passes no` (base, first tool version) | high ok; **low FAILED** (`census`: scene null: the perf sampler path replaced the engine; fixed in the tool by `ct.debug.v3force`) |
| same at 960x540; then `--tiers low` alone at both viewports | low FAILED again (same cause) |
| same, low only, after the v3force fix (base) | ok |
| `pnpm --filter @ct/client exec tsc --noEmit -p .` + `vitest run apps/client/test/game3d/{vendorGuard,boundary,world.stage}.test.ts` | tsc 0; 3 files / 30 tests pass |
| `pnpm -r run typecheck` + `pnpm vitest run packages/protocol apps/client/test/game3d apps/server/test/movement*` | typecheck 0; 33 files / 436 tests pass |
| `… xsh … tsx tests/perf/v3-load.ts --gl gpu --dist <base-dist> --bundle <base-bundle.json> --ports 3491-3492` (base) | ok (§2.2) |
| same with `a1-dist` (after) | first attempt: my local `timeout 900` expired while queued on the lock (exit 143); its host side still ran later; the window-A run below is the one reported |
| window A (`wA.local.env`, one exclusive window): v3-load after; v3-frame base + after, 1920x1080, high + low, `--modes census,counts,split,synced,heap --secs 5` | all rc 0 |
| window B (`wB.local.env`): v3-frame after 960x540 high + low; base 960x540 low; `vite build -c vite.harness.config.ts` + `CT_GL=gpu HARNESS_PORT=3493 HARNESS_SCENARIOS=cycles playwright test -c tests/v3/harness.config.ts`; `tsx tests/perf/v3-memory.ts --gl gpu --port 3494 --tier low --only cycles --cycles 5` | frames rc 0; **harness cycles rc 1** (`heapGrowthUnder10MB` false, every other check true); **v3-memory rc 1** (its leak verdict: heap +71.5 MiB cycle 1 → 5, retained engines 0) |
| base harness cycles (`cyc.local.env`, same command in the base tree) | rc 1, the same `heapGrowthUnder10MB` failure (pre-existing, §4) |

Raw outputs on the host: `~/clocktower/work/v3-perf-client-out/` (`{base,a1}-bundle.{json,txt}`, `{base,a1}-load/`,
`{base,a1}-f2-*`, `base-frame*`, `{base,a1}-cycles.log`, `a1-memory.log`, `v3-memory-low.json`).
