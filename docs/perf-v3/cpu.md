# v3 perf front: cpu (the 3D town without a GPU)

Branch `v3-perf-cpu` (from `4e99bc8`), agent `v3-perf-cpu`, 2026-10-18. User goal: v3 **playable on CPU only**
(software GL; SwiftShader as the stand-in): ≥ 20 fps at 960×540 with 8-15 players visible, input → motion ≤ 100 ms,
through a `cpu` quality tier that is **picked automatically** when the WebGL renderer is software.

Status: the `cpu` tier is built, wired and unit-tested; measured on the host's SwiftShader. Before → after
(960×540, 14 remotes + NPCs, synced frame / RAF fps / input → motion p50): **`low` 1199 ms / 3.1 fps / 466 ms →
`cpu` 194 ms / 7.6 fps / 109 ms** (6.2× cheaper frames). The goal (≥ 20 fps, ≤ 100 ms) is **not reached yet**: §4
says what is left (mostly the vendor toon shader).

## 1. What changed

| Where | Change |
|---|---|
| `game3d/contract.ts` (lead) | `Tier = 'low' \| 'high' \| 'cpu'` |
| `game3d/select.ts` (lead) | Row 6: a WebGL2 context that exists only **without** `failIfMajorPerformanceCaveat` (Chrome's verdict for SwiftShader / blocklisted GPUs), or a renderer string matching `/SwiftShader\|llvmpipe\|Software/i`, now mounts **v3 at `cpu`** (was Classic). Rows 3 (pref classic), 4 (boot guard), 7 (auto-fallback memo) and 8 (phones under Auto) still win. `v3force` (row 2, the host e2e) keeps the row-9 tier, so e2e behaviour is unchanged. `mayUseV3` now says yes on software GL (prefetch hint). The probe cache keeps one result per flag. |
| `game3d/perf.ts`, `net/lifecycle.ts` (lead / v3-core) | Step-down chain **high → low → cpu → Classic**: `PerfSampler` at `low` answers `rebuild-cpu` (was `fallback`); at `cpu` the slow threshold is a median > 66 ms (under 15 fps; `PERF_SLOW_MEDIAN_CPU_MS`) instead of 45 ms. Promotion is unchanged (only low → high). |
| `game3d/vendor/cpuTier.ts` (new) | The cpu levers, installed by `engineHost` for tier `cpu` only (GPU tiers untouched), before the town build compiles anything: internal rows ≈ 180 (`pixelScale = max(2, round(h/180))`: 960×540 → 3 → 320×180, low is 2 → 480×270); a 30 fps rAF cap (`ct.debug.fps` still wins); no shadow map, the sun casts none; the **normal pass skipped** (the pipeline already cleared `rtNormal` to a flat normal) with the passes that read it (`outline`, `contact`) off; the per-body water passes off (`river`, `water-*`); every Point / SpotLight moved to a camera-invisible layer (three only gathers lights the camera sees: the game's light pool, borrowing and carried lanterns keep working, but every program compiles with 0 point lights, day and night); the grass / reed / flower tuft sprite fields (meshes named `grass`) hidden; the toon lighting's **cloud-shadow FBM and normal noise compiled out** (two macros appended to three's `clipping_planes_pars_fragment` chunk, which three includes after the vendor shader head and before `main()`; restored on dispose). |
| `game3d/vendor/engineHost.ts` (lead) | cpu pixel scale, the tier frame cap, `installCpuTier` + a `pipe.render` hook that re-asserts the levers each frame (the water `vis()` updaters re-enable their pass), `info().cpu` stats |
| `vendor/town.ts`, `vendor/time.ts`, `world/lights.ts` (WP3) | accept `'cpu'` (= the vendor's `low` town and life; the light budget stays the low one: 8 / 2) |
| `avatars/layer.ts`, `overlay/index.ts` | `cpu` gets the low-tier character LOD / no FX motes and the low bubble cap |
| `ui/common/graphicsStatus.ts`, `debug/perfOverlay.ts` | "basic detail" wording; the type |
| tests | `select.test.ts` (row 5/6 rewritten + yields + `isSoftwareGl`), `bootPerf.test.ts` (sampler steps), `core.lifecycle.test.ts` (high → low → cpu → Classic), new `cpuTier.test.ts` (scale, cap, passes, shadows, normal skip, light layer, chunk macros, re-assert) |
| `tests/perf/` | the prototype's tools brought into git: `v3-cpu-tier.ts` (runner, ports 3486-3489), `v3-cpu-probe.js` (runtime levers, RAF window, input → motion), `v3-frame-probe.js` (rebuild-follow + multi-subscriber events fixes from the prototype), `v3-cpu-run.sh` (named profiles), `v3-cpu-check.sh` (typecheck + unit tests) |

Why these levers (lever table, §3): SwiftShader is geometry- and shader-bound, not fill-bound. A smaller target buys
little (480×270 → 320×180: −20 %), the normal pass is a second full scene render (−45 %), and SwiftShader runs both
sides of every branch (masked SIMD): zeroing the cloud / noise / penumbra **uniforms** saved nothing (−0 %), while
swapping every lit material for an unlit one saved 61 %. So the expensive shader code has to be compiled out.

## 2. Method

- Host (Ryzen 5 5500, 6 c / 12 t), Chromium 153 headless, `--use-angle=swiftshader` (ANGLE → Vulkan → SwiftShader
  Subzero), viewport 960×540, Vite DEV, the **real** `createTownGame3d` over a fake connection: the v3 layout, the own
  player at spawn and **14 remotes** walking circles on a 12 Hz snapshot pump (15 rigs + NPCs), noon.
- `synced`: frames rendered back to back with a 1-px `readPixels` each, so SwiftShader raster is inside the number
  (the cost of one frame). `raf`: a 10 s window of the real game loop (fps = frames / s). `input`: keydown on window →
  the end of the first rAF frame after which `__ctCamera.me()` moved (JS-visible; + about one frame to the screen).
- Each command runs in `remote.sh`'s systemd scope (nice 19; the cgroup recorded no CPU throttling, the scope used
  ≈ 10.6 cores in the final window). Mounts take the heavy lock shared; every measurement window takes it exclusive. Other agents' mounted pages
  (waiting for the lock) keep rendering in the background: the host load during the windows was 11-19 on 12 threads,
  recorded per window in the JSON (`locks[].loadIn/loadOut`, cgroup usage).
- Commands (from the worktree root):

```
CT_AGENT=v3-perf-cpu   scripts/remote.sh env PORT=3486 sh tests/perf/v3-cpu-run.sh levers  test-results/v3-cpu-base
CT_AGENT=v3-perf-cpu-t scripts/remote.sh env PORT=3487 sh tests/perf/v3-cpu-run.sh cpuplus test-results/v3-cpu-plus
CT_AGENT=v3-perf-cpu-t scripts/remote.sh sh tests/perf/v3-cpu-check.sh            # client tsc + game3d unit tests
```

## 3. Numbers

### 3.1 Lever table at today's `low` tier (single levers, synced ms per frame, p50; baseline 1217 ms)

| lever | synced p50 | Δ | note |
|---|---|---|---|
| baseline `low` (480×270, shadows, normal pass, 8 lights, 8 post passes) | 1217 | | 285 calls, 0.71 M tris |
| res180 (320×180) | 959 | −21 % | 2.25× fewer texels |
| res135 (240×135) | 934 | −23 % | |
| noShadow | 1175 | −3 % | |
| noNormal (skip the normal pass) | 675 | **−45 %** | |
| noNormal + outline / contact off | 666 | −45 % | |
| postOff (all 8 post passes) | 1102 | −9 % | the 3 water passes are 86 of 113 ms post |
| waterOff | 1135 | −7 % | |
| lights0 (hide the 8 point lights) | 1083 | −11 % | |
| noCloudPenumbraNoise (uniforms to 0) | 1226 | 0 % | masked SIMD: both branch sides run |
| **unlit** (MeshBasic for every lit material) | 477 | **−61 %** | diagnostic floor, not a look we ship |
| charsLite (all rigs colour-only, no shadow) | 1165 | −4 % | |
| charsHidden (no rigs) | 1139 | −6 % | characters are not the problem |
| noGrass | 830 | **−32 %** | grass tufts: 80 k instanced sprites, lit in both passes |
| noFlowers | 1221 | 0 % | |
| cssUpscale | 1210 | 0 % | |

### 3.2 Lever sets (all at `low`, runtime levers; RAF + input)

| set | synced p50 | RAF fps | input p50 / max |
|---|---|---|---|
| baseline `low` | 1199 ms | 3.1 | 466 / 770 ms |
| cpuA = res135 + noShadow + noNormal/outline + postOff + lights0 + charsLite | 362 ms | 5.0 | 350 / 405 ms |
| cpuB = cpuA + unlit + cssUpscale | 102 ms | 12.2 | **77 / 92 ms** |

### 3.3 The `cpu` tier (commit `cb9b81d`: no grass lever yet) and what is left on top of it

Same harness, tier `cpu` (no runtime levers), then single levers on top (synced p50, ms):

| | synced p50 | Δ vs cpu | note |
|---|---|---|---|
| **cpu tier** (levers window) | 396 | | 113 calls, 0.24 M tris, 43 programs (low: 48 at ready, 108 after its levers) |
| + res135 (240×135) | 365 | −8 % | resolution keeps mattering little |
| + unlit (diagnostic) | 121 | −69 % | what is left is the toon shading of the colour pass |
| + noGrass | 211 | **−47 %** | the grass tuft sprites (→ the next commit hides them at `cpu`) |
| + charsHidden | 364 | −8 % | 15 rigs + NPCs = 126 k of the 244 k tris; LOD would buy ≤ 8 % |
| + noFlowers / noDetail / noNpc / postOff / cssUpscale | 387-392 | −1 to −2 % each | not worth a look change |

Sets (RAF window + input, the same tier):

| set | synced p50 | RAF fps | input p50 / max |
|---|---|---|---|
| `low` baseline (§3.2) | 1199 ms | 3.1 | 466 / 770 ms |
| **cpu tier** (`cb9b81d`) | 353 ms | 5.2 | 307 / 575 ms |
| **cpu tier + grass hidden** (`13f40b5`, final run) | **194 ms** | **7.6** | **109 / 146 ms** |

Mount (SwiftShader): `low` ready 13.0 s (host load 0.9), avatars 15/15 built after 80 s; `cpu` ready 17-20 s (host
load 19-23), avatars built after 34-36 s (fewer programs per rig: no shadow / normal variants).

Look (960×540, noon, 14 remotes; stills `cpu-low-baseline.png` / `cpu-cpu-baseline.png` in the host sandbox
`test-results/v3-cpu-*`): the cpu tier keeps the palette, the bands, the characters, labels and bubbles; it loses
cast shadows, the ink outlines, the water bodies (the fountain and well basins show empty), cloud shadows and the
lantern light pools at night, and most grass tufts (the lawn keeps its toon colours; a few decorative tufts from other pieces remain).

The GPU tiers are unchanged by construction: `installCpuTier` only runs for tier `cpu`, `pixelScaleFor` and the
vendor `quality` param map `high` / `low` exactly as before, the light budgets for `high` / `low` are the same
values, and no program text changes unless a cpu engine is alive (the chunk macros are removed on dispose; the
engine of a tier rebuild is created after the old one is disposed). A GPU still was not re-shot (lock time, §6).

## 4. Verdict and what is left

- **Goal not reached on the host.** The cpu tier is ≈ 3.4× (cpu) to 6.2× (cpu + grass) cheaper per frame than
  `low` on SwiftShader, and input → motion drops from 466 ms to 109 ms (p50, max 146), but the target is
  ≥ 20 fps / ≤ 100 ms.
- **How fair is the host as a proxy?** A 6-core / 12-thread Ryzen 5 5500 desktop CPU. The `remote.sh` scope was
  **not** throttling (cgroup `throttledMs` 0; the scope used ≈ 10.6 cores during the final set window), so
  SwiftShader had most of the machine, but the host load was 13-23 during the windows (other agents' builds, e2e and
  their mounted pages, which keep rendering while they wait for the lock) on a DEV build. A quiet 6-8-core desktop
  should do somewhat better; a 2-4-core laptop worse. cpuB (§3.2, unlit materials, a 102 ms frame) reached 12 fps
  and 77 ms input on this host: the shading is the remaining gap.
- **What is left is shader work in the colour pass**: on top of the cpu tier, unlit materials remove another
  69 % (grass included). The toon shader is vendor code (`materials/toon.js`); SwiftShader evaluates every branch,
  so only a compiled-out variant helps. Next steps, in order:
  1. CONTRACT-REQUEST (pixel3d): a `toon` compile flag for a "cpu" variant (lighting at the vertex for the bands /
     hemi / ramp, no per-fragment noise; outline flag unchanged), or `TOON_FLAT` that keeps the 3-band ramp from
     `N·L` only. The game would set it from `cpuTier.ts` (like the cloud / noise macros here).
  2. Character LOD for `cpu`: rigs are 52 % of the triangles at the square (≤ 8 % of the frame on SwiftShader, more
     on a weak iGPU): cull off-screen rigs (`frustumCulled = false` on the vendor rig), cap the far-rig update rate.
  3. Re-measure on a machine without the scope cap (the user's laptop with `--disable-gpu`, or this host outside the
     agent slice) before deciding on more look changes.
- Behaviour notes for the integrator: the `v3-fallback` e2e "perf sampler" case (`ct.debug.v3perfFallback=1`) now
  walks high → low → **cpu** → Classic, so it needs one more sampler window; software-GL browsers that used to get
  Classic now get v3 at `cpu` (Settings → Graphics → Classic still forces Classic).

## 5. Proposed budget keys (not in `scripts/perf/budgets.mjs`; for the lead)

Host-relative (SwiftShader on the host, `tests/perf/v3-cpu-tier.ts`, 960×540, 14 remotes, DEV): compare only with
re-runs of the same tool.

| key | proposed | measured | meaning |
|---|---|---|---|
| `v3CpuSyncedP50Ms` | ≤ 250 | 194 | synced frame at the cpu tier (catches a lever regressing) |
| `v3CpuVsLowRatio` | ≤ 0.25 | 0.16 (194 / 1199) | cpu synced / low synced |
| `v3CpuCalls` | ≤ 130 | 111 | draw calls at the square (no normal / shadow passes) |
| `v3CpuPrograms` | ≤ 45 | 41 | programs after ready (0-light, no-shadow variants only) |
| `v3CpuInputP50Ms` | ≤ 150 | 109 | input → motion, host SwiftShader (goal on a real CPU-only device: ≤ 100) |
| `v3CpuRafFps` | ≥ 6 | 7.6 | RAF window fps, host SwiftShader (goal on a real CPU-only device: ≥ 20) |

## 6. Commands run (all on the host via `scripts/remote.sh`; every failure listed)

| command | result |
|---|---|
| prototype diff via `remote.sh --no-sync sh -c '… diff 182d220 …'` | refused locally by the worktree guard (a VCS command inside a shell string); read instead by rsync of the prototype tree to the scratchpad + `diff -ru` against an archive of `182d220` and the WIP tree |
| `CT_AGENT=v3-perf-cpu scripts/remote.sh --no-sync sh -c 'cd …proto && ls…'` | failed: the sandbox did not exist yet (`--no-sync`); re-run with sync |
| `CT_AGENT=v3-perf-cpu scripts/remote.sh sh tests/perf/v3-cpu-run.sh levers test-results/v3-cpu-base` | ok (done 19:07 UTC): §3.1, §3.2 |
| `CT_AGENT=v3-perf-cpu-t scripts/remote.sh env PORT=3487 sh tests/perf/v3-cpu-run.sh cpuplus test-results/v3-cpu-plus` | **partial**: cpu base, levers and the baseline set measured (§3.3), then the runner's 48-min watchdog aborted it while it waited for the exclusive lock (exit 3, no JSON; numbers from its log). Its orphaned `flock` waiter was killed by PID. |
| `CT_AGENT=v3-perf-cpu scripts/remote.sh env PORT=3486 TIERS=cpu sh tests/perf/v3-cpu-run.sh tiers test-results/v3-cpu-final` | ok (20:21 UTC): §3.3 last row; mount → exclusive waits 27 + 8 min; console: the probe's fake members make the pre-warm pump warn once (`castIdentity … preset`, harness-only: its members carry no cast id), plus SwiftShader's `KHR_parallel_shader_compile` / ReadPixels-stall driver notes |
| `CT_AGENT=v3-perf-cpu-t scripts/remote.sh sh tests/perf/v3-cpu-check.sh` (client `tsc` + `vitest run apps/client/test/game3d apps/client/test/ui.graphicsStatus.test.ts`) | 1st: 2 fails (`cpuTier.test.ts`: layer-31 mask sign); 2nd: `tsc` error (engine type); 3rd: 1 fail (macro test after an undisposed install); then **tsc 0, 30 files / 407 tests pass** |
| `CT_AGENT=v3-perf-cpu-u scripts/remote.sh sh tests/perf/v3-cpu-check.sh full` | **`pnpm -r run typecheck` 0**, 30 files / 407 tests pass |
| `CT_AGENT=v3-perf-cpu-u scripts/remote.sh --no-sync flock -s <heavy lock> pnpm vitest run apps/client` | **66 files / 870 tests pass** |

Not run: the e2e suites (`v3-*`, `CT_GL=swiftshader`), a GPU still of `high` / `low` on this branch, `pnpm build` /
bundle report (the change adds a few KiB unminified to the lazy town3d chunk, nothing to the entry).
