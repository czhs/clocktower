# v3.5 perf: shader compile on an Intel/Mesa iGPU (front "shaders", branch v35-shaders)

Agent `v35-shaders`, 2026-10-18. Base: tag `v3.3`. Problem (laptop.md §5): on an Intel Arc iGPU laptop (Mesa, Chrome
143, ANGLE GL-EGL) the first visit froze for ≈ 9 s in ONE main-thread task while the town's shader programs compiled,
≈ 14 s to the first frame. Goal: cut that cold first-visit freeze without changing the look.

**Result in one line:** the freeze is gone (longest task before the first frame **8.45 s → 0.72 s**, the loading sheet
keeps animating), the cold first visit is **13.1 s → 9.1-9.3 s** (laptop.md measured 13.95 s for v3.1), and a join after a
browser shader-cache loss is **10.7-11.2 s → 2.5-2.75 s** when the home page was open first (6.7 s on a direct link). Three
changes, all look-neutral: (1) issue every program at once and poll `KHR_parallel_shader_compile` instead of blocking,
(2) a build-time rewrite of the vendor cut-away GLSL that Mesa compiles ≈ 35 % faster, (3) a per-tier record of the
town's GLSL sources that the next visit compiles early in a hidden context (home page idle, or at the start of a join).

Laptop, Intel iGPU, `low`, 1440×900 @ 2 (all numbers measured in this front's runs, §1):

| load | v3.3 first frame / longest task | v3.5 first frame / longest task |
|---|---|---|
| **first visit, empty profile** (cold HTTP + cold shader cache) | **13.1 s / 8.45 s** (laptop.md: 13.95 s / 9.07 s) | **9.1-9.3 s / 0.72 s** (one run 11.5 s: +2 s before the engine started, network) |
| same, from engine start to first frame | 11.5 s | 7.7-7.9 s |
| browser shader cache lost (GPU-process restart), direct link | 10.7-11.2 s / 8.4 s | 6.7-6.8 s / 0.6 s (7.2-7.4 s without a record) |
| browser shader cache lost, home page open ≥ 8 s first | (same as above) | **2.5-2.75 s** / 0.6 s |
| reload, everything warm | 2.2-2.4 s / 0.6 s | 2.1-2.4 s / 0.6 s |
| `high` (spoofed renderer), cache lost, no record | 12.3 s / 9.6 s | 8.9 s / 0.9 s |
| loading sheet's longest freeze (rAF gap) before the first frame, cold | 8.4-8.6 s | 0.8-1.0 s |

## 1. Method

- Laptop: an Intel Arc iGPU laptop (Mesa), Chrome 143 headless=new, ANGLE GL-EGL on the iGPU (= the backend the
  owner's desktop Chrome uses there), driven over CDP from the orchestrator through SSH tunnels (method:
  laptop.md §1). Server + 1 ST bot + 2 player bots on the build host, the page joins the lobby (waiting room).
  1440×900 @ DPR 2, `ct.fxQuality=low` unless noted (the tier the iGPU starts at; `high` = renderer string spoofed).
- Probe (init script, wraps browser APIs only): per GL program the `linkProgram` time, the first blocking call on it
  (`getProgramInfoLog` / `getProgramParameter` / …) and its duration (= the wait for compile + link in the GPU process),
  the `SHADER_NAME`, source sizes; joined with three's `renderer.info.programs` (cache keys) at the first frame. Long
  tasks (PerformanceObserver), rAF gaps until the first frame (= the loading sheet's longest freeze), user-timing marks
  `ct3d:*` added to TownGame3d / stage (engine, stage, stage-built, warm, par-ready, warm-done).
- **Cold shader cache, repeatable:** the first load of a fresh `--user-data-dir` is the true first visit. Further cold
  samples in the same browser: navigate away, CDP `Browser.crashGpuProcess`, reload. That proved to be fully cold (the
  GPU process does not get the town's programs back from the disk cache: 10.6-10.9 s, the same 8.4-8.6 s task as the
  first visit minus the cold HTTP cache), so A/B pairs run in one browser session with ≈ 4 s per sample instead of a
  fresh browser each. Chrome flags for that: `--disable-gpu-process-crash-limit --disable-domain-blocking-for-3d-apis`;
  the app's boot guard marks (`ct.graphics.booting` / `boots`) are cleared between samples (an unclean 3-s navigation
  away otherwise counts as a crashed boot and the 5th sample falls back to Classic).
- Warm = a plain reload (GPU process alive).

## 2. Program inventory (cold, `low`, synchronous compile = v3.3 behaviour)

40-42 programs reach the GPU at the first frame at `low` (43 at `high`), 30 of them issued by the town scene + post
chain, the rest by avatars, the dais showcase, shadow depth and the warm-up room. Per program: the wait in the first
blocking call (= compile + link on the iGPU), sorted. `toon` = the vendor toon material (MeshLambertMaterial +
onBeforeCompile), `tcut` = the vendor cut-away patch, `veg` its foliage variant, `ct-canopy1` the game's canopy patch.

| # | wait ms | material name | kind | program key tail | defines | fs chars |
|---|---|---|---|---|---|---|
| 8 | 837 | (unnamed) | toon | `toon-14-tcutveg|ct-canopy1` |  | 65195 |
| 4 | 759 | (unnamed) | toon | `toon-0-tcut` |  | 78327 |
| 32 | 732 | house-7-cap | toon | `toon-11-tcut` | TOON_TONE_ATTR | 63992 |
| 6 | 543 | town-kit-soft | toon | `toon-4-tcutveg|ct-canopy1` | TOON_TONE_ATTR | 69835 |
| 7 | 527 | town-kit-glass | toon | `toon-5-tcut` | TOON_TONE_ATTR | 69258 |
| 5 | 526 | town-kit-solid | toon | `toon-1-tcutveg` | TOON_TONE_ATTR | 68619 |
| 16 | 455 | (unnamed) | toon | `toon-18-fspring-tcutveg|ct-canopy1` | TOON_TONE_ATTR | 67105 |
| 14 | 450 | (unnamed) | toon | `toon-2-tcut` | TOON_TONE_ATTR | 66243 |
| 18 | 445 | (unnamed) | toon | `toon-7-fspring-tcutveg|ct-canopy1` | TOON_TONE_ATTR | 68674 |
| 13 | 440 | dais-fx | toon | `toon-13-tcut` |  | 64043 |
| 9 | 426 | (unnamed) | toon | `toon-15-fspring-tcutveg|ct-canopy1` | TREE_CORE | 68524 |
| 19 | 425 | (unnamed) | toon | `toon-7-tcut|ct-canopy1` | TOON_TONE_ATTR | 67897 |
| 30 | 410 | (unnamed) | toon | `toon-6-tcut|ct-canopy1` | TREE_CORE | 67851 |
| 26 | 393 | (unnamed) | shader | (ShaderMaterial / built-in) |  | 24158 |
| 12 | 238 | town-kit-solid-life | toon | `toon-19` | TOON_TONE_ATTR | 56866 |
| 37 | 179 | (unnamed) | toon | `vertexHead:"flat varying float vMo` | TOON_TONE_ATTR+LOOK_MAX_BONES | 65060 |
| 1 | 172 | (unnamed) | depth | (ShaderMaterial / built-in) |  | 12209 |
| 38 | 170 | (unnamed) | toon | `vertexHead:"varying float vBonesGh` | TOON_TONE_ATTR+LOOK_MAX_BONES | 64134 |
| 35 | 159 | interior-glow | toon | `toon-22` | TOON_TONE_ATTR | 52946 |
| 24 | 82 | (unnamed) | shader | (ShaderMaterial / built-in) |  | 6511 |
| 34 | 66 | interior-void | toon | `toon-21` | TOON_UNLIT_SH | 52242 |
| 25 | 60 | (unnamed) | shader | (ShaderMaterial / built-in) |  | 14641 |
| 22 | 54 | (unnamed) | shader | (ShaderMaterial / built-in) |  | 9323 |
| 23 | 45 | life-sprites | shader | (ShaderMaterial / built-in) |  | 10814 |
| 27 | 39 | (unnamed) | shader | (ShaderMaterial / built-in) |  | 6411 |
| 36 | 23 | (unnamed) | depth | `char-depth-snap` |  | 12209 |
| 2 | 20 | (unnamed) | depth | `foliage-dapple-depth` |  | 13424 |
| 29 | 12 | (unnamed) | shader | (ShaderMaterial / built-in) |  | 4412 |
| 21 | 10 | props-lamp-pools | shader | (ShaderMaterial / built-in) |  | 3081 |
| 20 | 9 | dais-brazier-pool | shader | (ShaderMaterial / built-in) |  | 3068 |
| 11 | 8 | (unnamed) | toon | `toon-17-fspring-tcutveg|ct-canopy1` | TREE_CORE | 68524 |
| 28 | 7 | (unnamed) | shader | (ShaderMaterial / built-in) |  | 5319 |
| 3 | 5 | (unnamed) | depth | (ShaderMaterial / built-in) |  | 12209 |
| 15 | 5 | (unnamed) | toon | `toon-3-tcut` | TOON_TONE_ATTR | 66243 |
| 33 | 4 | (unnamed) | toon | `toon-12-tcut|ct-canopy1` | TREE_CORE | 67851 |
| 17 | 4 | (unnamed) | toon | `toon-8-tcut` | TOON_TONE_ATTR | 66243 |
| 10 | 3 | (unnamed) | toon | `toon-16-fspring-tcutveg|ct-canopy1` | TREE_CORE | 68524 |
| 31 | 3 | (unnamed) | toon | `toon-9-tcut|ct-canopy1` | TREE_CORE | 67851 |
| 0 | 1 | (unnamed) | toon | `vertexHead:"flat varying float vGh` | TOON_TONE_ATTR+LOOK_MAX_BONES | 63784 |
| 39 | 0 | (unnamed) | toon | `vertexHead:""}|ct-tint2` | TOON_TONE_ATTR+LOOK_MAX_BONES | 63482 |

Total: sum of waits 8744 ms, 40 programs, >100 ms: 19, <15 ms: 13 (first visit, empty profile, v3.3 code). Note: `#` = link order; the programs at the bottom with 0-8 ms reuse an earlier identical source.

- **26-27 toon programs = 7.6-7.8 s of the 8.5-8.7 s.** 13 of them cost 400-840 ms each; all 13 carry the cut-away patch.
  The same toon material without the cut compiles in 150-240 ms (`town-kit-solid-life` 236 ms, `interior-glow` 159 ms,
  the avatar toons 170-180 ms): the cut-away GLSL roughly doubles a program's compile time.
- 10 ShaderMaterials (post passes, water, life sprites, pools) = 0.7 s; 4 shadow-depth programs = 0.2 s.
- **Duplicates:** 6 toon programs have their own three cache key (`toon-3`, `toon-8`, `toon-9`, `toon-12`, `toon-16`,
  `toon-17`: per-material `customProgramCacheKey`) but the same GLSL as an earlier one; they cost 3-8 ms (the
  browser's program cache hits on the source). Unifying them would save only those ms; the cost is in the ≈ 20 distinct
  heavy sources.
- **Why toon programs are slow on Mesa:** a cut toon fragment shader is 64-78 K characters (8 point lights unrolled by
  three's `#pragma unroll_loop`, 5 shadow taps, noise, clouds, the cut-away). The cut-away GLSL has six loops with
  constant bounds (`i < MAX_LIFTS` / `MAX_BOXES` with an early break on the uniform count) and calls `townCut()` six
  times per fragment (the discard test twice, the section rim four times); Mesa unrolls every constant-bounded loop and
  inlines every call, then compiles the fragment shader at several SIMD widths.
- Program counts at the first frame: `low` 39-42, `high` 43 (the toon programs there carry 12 point lights instead of 8).

## 3. KHR_parallel_shader_compile on this stack

**Present** (Chrome exposes it on ANGLE GL-EGL / Mesa). With it, issuing every program first and polling
`COMPLETION_STATUS_KHR` from a timer **removes the long task completely**: the GPU process links while the page's main
thread is free. But the links are **not concurrent**: 30 programs issued in 34-45 ms, all linked after 8.2-8.3 s, the
same total as the blocking path (8.4-8.7 s). The browser compiles them one after another on its GPU thread. So on this
laptop KHR buys responsiveness, not time; the time has to come from cheaper programs or from compiling earlier.

## 4. What was tried

### 4.1 Parallel issue before the warm-up (shipped, default on; `ct.debug.v3par=0` = off)

`world/shaderWarm.ts`: before the warm-up frames, `renderer.compile(scene)` with the colour target bound, every enabled
post pass with the ping-pong target, the upscale quad on the canvas (the program keys depend on the target), then poll
three's `program.isReady()` (COMPLETION_STATUS_KHR) every 16 ms with a liveness check and a 30 s deadline (the guarded
pattern of v3.1's avatar precompile: three's `compileAsync` poll cannot be cancelled). No-op without the extension.
The warm-up frames then find the programs linked; what the scene compile cannot cover (shadow-depth programs, the dais
showcase states, the warm-up room) still compiles in the warm-up, 0.3-0.5 s in total.

| cold, `low` (GPU-process restart) | first frame | longest task | rAF gap (loading sheet) |
|---|---|---|---|
| v3.3 (blocking) | 10.7-11.0 s | 8.4-8.5 s | 8.4-8.6 s |
| parallel issue | 10.6-10.7 s | 0.6 s | 1.3-1.7 s |

The remaining 1.3-1.7 s rAF gap is the GPU thread itself being busy (a compositor frame waits behind a link), not the
page.

### 4.2 Issue earlier: at the end of the stage build (shipped; `ct.debug.v3parEarly=0` = in the warm-up)

The town's programs are issued right after `createStage`, so they compile while the avatars build. Gain ≈ 0.1-0.2 s
only: the avatar phase is short (stage-built → warm 0.1-0.3 s). The larger overlap would be the town BUILD itself
(1.3 s warm HTTP, 2.4 s cold): it needs a per-piece hook in the vendor build plus the final light count before the pool
exists (a compile with another light count is a wasted program). Not done; see §6.

### 4.3 Cheaper cut-away GLSL (shipped, default on; `ct.debug.v3cutloop=0` = vendor GLSL)

A build-time rewrite of `v3/pixel3d/src/town/cutaway.js` in `apps/client/build/pixel3dImports.ts` (`patchCutLoops`; the
build fails when the vendor snippets change):
- the six cut loops are bounded by the uniform count (`i < int(uCutLiftN)` / `int(uCutBoxN)`) instead of the constant
  (the JS side clamps the counts to MAX_*; the early `break` stays), so they stay loops;
- the section rim's four `townCut()` taps (+r, −r, +u, −u, first hit wins) run in one loop whose bound
  `4 + int(min(uCutOn, 0.0))` is 4 but not a compile-time constant: one inlined `townCut` instead of four;
- `townDiscard` makes one `townCut()` call (at the part centroid for a small part, else at the fragment) instead of two
  branches with one each. All tests are pure functions, so the result is the same.
Same arithmetic in the same order (±1.0 scaling is exact); see §4.5 for the look check.

| `low`, synchronous per-program waits | vendor GLSL | rewrite (loops + rim) |
|---|---|---|
| sum of program waits | 8.47 s | 5.99 s |
| heaviest cut toon programs | 413-785 ms | 234-533 ms |
| uncut toon programs (control) | 236 / 174 ms | 241 / 179 ms |
| parallel issue, all linked after | 8.17 s | 5.72 s (loops + rim), 4.83 s (+ one-call discard) |

Per program (synchronous path, the same GPU-process restart, `low`):

| material | program key tail | vendor GLSL ms | rewrite (loops + rim) ms |
|---|---|---|---|
| (unnamed) | `toon-14-tcutveg\|ct-canopy1` | 785 | 492 |
| (unnamed) | `toon-0-tcut` | 747 | 533 |
| house-7-cap | `toon-11-tcut` | 733 | 453 |
| town-kit-soft | `toon-4-tcutveg\|ct-canopy1` | 539 | 350 |
| town-kit-glass | `toon-5-tcut` | 527 | 339 |
| town-kit-solid | `toon-1-tcutveg` | 526 | 341 |
| (unnamed) | `toon-2-tcut` | 454 | 283 |
| dais-fx | `toon-13-tcut` | 441 | 234 |
| 5 more foliage / canopy | `toon-6/7/15/18-…` | 413-447 | 266-288 |
| town-kit-solid-life (no cut, control) | `toon-19` | 236 | 241 |
| avatar toon (no cut, control) | `vertexHead:…` | 174 | 179 |

### 4.4 Shader-source record + early prewarm (shipped, default on; `ct.debug.v3shcache=0` = off)

Experiment first: the probe captured the 41 programs' GLSL (sources + attribute bindings) of a cold load; after a
GPU-process restart a blank page of the same origin compiled exactly those sources in its own 1×1 WebGL2 context
(KHR, 29 ms to issue, all linked after 9.0 s, longest main-thread gap 22 ms); then the town loaded in **2.46 s** instead
of 10.56 s: the browser's program cache is per GPU process and keyed by the source, so any context warms it.

`game3d/shaderCache.ts` makes that a feature:
- `record(gl, tier)`: instance-level wraps (never the prototype) of `shaderSource` / `attachShader` /
  `bindAttribLocation` / `linkProgram` on the town's context, deduplicated by source; written to IndexedDB `ct-shaders`
  (one record per tier, distinct sources stored once: ≈ 2-3 M characters, estimated from the source sizes) 15 s and 90 s after the first frame, then recording stops.
- `prewarm(tier)`: reads that record and compiles it in a hidden 1×1 WebGL2 context, only with
  KHR_parallel_shader_compile (never a blocking compile), polls COMPLETION_STATUS_KHR every 50 ms, deletes everything
  and loses the context. If ≥ 80 % are linked at the first poll the browser cache is warm and it stops at once (0.7 s
  incl. the IndexedDB read, nothing for the GPU to do).
- Called from the home page when idle (`ui/common/townPrefetch.ts`, after the v3.2 town-chunk prefetch; not with
  Save-Data / slow connections / where Classic would be used) and at the start of every town build
  (`TownGame3d`). The town build waits, idle, for a running prewarm after the stage build and before the avatars
  (`prewarmSettled`, ≤ 10 s; the program issue waits too): while the browser's GPU thread works through the prewarm,
  any GL call that needs an answer (the avatars' first program read-back, ≈ 30 large programs sent at once) blocks the
  page until the queue is empty (a 3.8-4.0 s task measured before this wait); after it, the town's programs are cache
  hits.

| GPU-process restart (browser shader cache lost), `low`, warm HTTP | first frame | longest task | prewarm |
|---|---|---|---|
| v3.3 (all switches off) | 10.7-11.2 s | 8.4 s | — |
| parallel issue + cut rewrite, no record (`v3shcache=0`) | 7.2-7.25 s | 0.6 s | — |
| + prewarm at the join (direct link), town waits for it | **6.76 s** | 0.6 s | ready after ≈ 5.5 s, 33 programs |
| (first version: no wait, the avatar read-back blocked behind the prewarm) | 6.1-6.4 s | **3.8-4.0 s** | — |
| + home page open 15 s / 10 s / 8 s before the join | **2.50 / 2.60 / 2.75 s** | 0.6 s | warm at the join |
| + home page open only 4 s | 3.83 s | 0.6 s | part done |
| reload, browser cache warm: prewarm on / off | 2.12-2.40 / 2.14 s | 0.6 s | "warm" after 0.7 s (IndexedDB read + 1 poll) |

The record is keyed by tier and by the build (the town chunk's URL): a deploy that changes any town code never replays
stale sources, the first visit after it records again. `high` has its own record (the `auto` promotion rebuild
records too).

### 4.5 Look check

- **Parallel issue / prewarm:** these change only WHEN programs compile, not their source or any draw: look unchanged by
  construction.
- **Cut rewrite:** proven by construction plus a unit test, not by pixels. Every rewritten test does the same
  operations in the same order on the same inputs. The loop bounds equal the old early-break counts (the JS clamps them
  to MAX_*). The rim taps keep the `||` order. `townDiscard`'s parts are pure. ±1.0 scaling is exact. With
  `ct.debug.v3cutloop=0` the generated GLSL is byte-identical to the vendor's (`cutLoops.test.ts`).
- **Pixel check: inconclusive.** We ran the mock-world harness stills (SwiftShader) for square-day-8, night-15,
  interior-house-5 and vote-12, with the rewrite on and off, plus a second "off" run for the noise floor. The harness
  is not deterministic between runs: water, flutter and fireflies move. Two "off" runs already differ as much as
  on vs off (e.g. square-day-8 a: on/off 12 110 px, off/off 6 012 px; vote-12 mid: 14 224 vs 24 723 px; night-15
  ≈ 495 K px both ways). So the harness can neither confirm nor reject a difference. No run raised a harness error or
  fell back. A deterministic still (frozen time) on the laptop GPU is the check to add before a release. The same goes
  for the one-call `townDiscard` (not pixel-checked).

- **v3.5 release, frozen-time pixel check (done):** on the laptop iGPU with `ct.debug.freeze` (docs/test-results.md "v3.5
  release gate"): 0 differing pixels rewrite on vs off on the square, the own-player cut-away at a cottage (`low`,
  `high`) and the vote; the only differing texels (36 px, an avatar's feet) differ between same-flag loads too. Default
  stays ON.
- **v3.5 release:** the record skips avatar rig programs (`isAvatarProgram`: the `LOOK_MAX_BONES` define), so the
  prewarm never compiles last visit's random cast.

## 5. Before / after summary

See the table at the top. The cold first visit loses ≈ 4 s: the cut rewrite takes the serial compile from 8.2-8.3 s to
4.8 s, the rest is unchanged (cold HTTP, JS, the 1.3-2.4 s town build, ≈ 0.4 s of warm-up). The freeze is gone
everywhere (KHR). Repeat joins after a cache loss are where the record pays: 2.5 s through the home page.

**Recommendation:**
- Merge with all three switches on.
- The parallel issue and the prewarm are safe by construction: no-ops without KHR, and guarded/cancellable.
- Before the release, add a deterministic still (frozen time) on an iGPU for the cut rewrite. If any doubt remains,
  `ct.debug.v3cutloop=0` is the escape hatch.
- Next: ship a per-build source manifest (§6.1) so FIRST-time visitors who pass the home page also land in ≈ 2.5 s.
- Raise the toon-variant consolidation with pixel3d (§6.2).

## 6. Not done / next levers (ranked)

1. **Ship a source manifest for the very first visit.** The record only helps the second visit on a device. A
   per-tier `v3-shaders/<tier>.json` produced after `pnpm build` by a headless capture (the record format) and served
   with the build would let the home page prewarm a first-time visitor too (the measured 2.5 s join). Open points: the
   capture needs a browser in the deploy pipeline (qa-deploy), and the sources must match the user's: they depend on the
   tier and on three's capability-dependent prefix (precision etc.), not on the GPU: a cold load on the laptop's Intel
   iGPU and one on its NVIDIA dGPU (same Chrome, ANGLE GL-EGL, same tier) produced 30 identical program sources of
   32 / 33; the 2-3 that differed are 86-89 K-character avatar programs (the random cast), not town programs. A stale
   manifest costs GPU time but never correctness (key it by build like the record).
2. **Fewer / smaller toon programs (vendor, CONTRACT-REQUEST).** ≈ 20 distinct toon sources at 230-530 ms each even
   after the rewrite. The variants differ by GLSL patches per material (tone attributes, tree cores, spring sway,
   veg ramp, canopy), mostly `#ifdef`/patch text where a uniform branch would do; folding e.g. `veg` and `fspring` into
   uniforms would merge several programs. The 8 / 12 unrolled point lights are the other big block.
3. **Overlap with the town build.** Issue each piece's programs as soon as the piece is built (a vendor hook) with the
   final light count; up to the build time (1.3-2.4 s) off the cold path.
4. **Progress on the loading sheet** during the parallel compile (programs ready / issued) instead of a still bar.
5. The `auto` tier promotion rebuilds at `high` with ≈ 13 new programs (point-light count): those are now recorded per
   tier and prewarmed on the next visit, but the first promotion still compiles them (in parallel, no freeze).

## 7. Switches (all default on; '0' = the v3.3 behaviour)

| localStorage | what |
|---|---|
| `ct.debug.v3par` | parallel issue + KHR poll before the warm-up (world/shaderWarm.ts) |
| `ct.debug.v3parEarly` | issue at the end of createStage (else in warmUp) |
| `ct.debug.v3cutloop` | the cut-away GLSL rewrite (build/pixel3dImports.ts patchCutLoops) |
| `ct.debug.v3shcache` | record the town's GLSL + prewarm it on the home page / at a join (game3d/shaderCache.ts) |

## 8. Tests run

All on the build host through `scripts/remote.sh` (sandbox `v35-shaders`), under the shared heavy lock:
- `pnpm -r run typecheck`: green (all 7 packages).
- `pnpm vitest run apps/client`: 79 files, 1010 tests passed. New: `test/game3d/world.shaderWarm.test.ts` (8),
  `test/game3d/cutLoops.test.ts` (4: patches the current vendor file, no constant-bounded cut loop and one `townCut`
  in the rim and in townDiscard with the switch on, byte-identical vendor GLSL with it off, a vendor change fails the
  patch), `test/game3d/shaderCache.test.ts` (9); `vendorGuard.test.ts` covers the new patch target too.
- `pnpm build`: green (the patch applies; the bundle checks pass).
- e2e (`E2E_V3=1 CT_GL=gpu`, `E2E_PORT=3476`, `CT_E2E_NO_BUILD=1`, heavy + browser locks):
  `pnpm test:e2e tests/e2e/v3-boot.spec.ts tests/e2e/v3-life.spec.ts tests/e2e/v3-pageerrors.spec.ts
  tests/e2e/v3-fallback.spec.ts`: **7 passed** (3.9 min) on the final build (also 7 passed on the parallel-issue-only build earlier).
- Laptop runs (§1): sessions `base`, `par1`, `early1`, `replay1`, `cut1`, `cache1`, `final1`, `coldbase`, `cold2`,
  `nv`; 4 runs aborted by harness issues found on the way (GPU crash limit, 3D-API domain blocking, the boot guard's
  unclean-boot fallback), each fixed in the driver and rerun.
