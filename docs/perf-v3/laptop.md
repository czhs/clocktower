# v3 perf: real-laptop iGPU baseline (v3.1)

Agent `v3-laptop`, 2026-10-18. First measurement of the 3D town on a **real laptop GPU** instead of the desktop
discrete GPU / SwiftShader of the earlier fronts. Build measured: **tag `v3.1` (`b7803fa`)**, minified production
client build, served by a local server. Nothing under `apps/`, `packages/`, `tests/`, `scripts/` was changed.

## 1. Method

| What | How |
|---|---|
| Device | A 2024 laptop with an **Intel Arc integrated GPU (Meteor Lake class, Mesa iris driver)** and an **RTX 4070-class laptop dGPU**, 22 CPU threads, Ubuntu 22.04 (Wayland desktop), Google Chrome 143. On AC power for every run. |
| Browser | Chrome on the laptop, `--headless=new`, driven over CDP (Playwright `connectOverCDP`) from another machine through SSH tunnels. GPU picked with ANGLE's GL-EGL backend + the EGL vendor library: **`ANGLE (Intel, Mesa Intel(R) Arc(tm) Graphics (MTL), OpenGL ES 3.2)`** - the same backend and GPU the user's desktop Chrome uses there (Wayland, default ANGLE GL on the display GPU) - and `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4070 Laptop GPU, OpenGL ES 3.2)` for the dGPU. Headless `--use-angle=gl` (GLX) silently falls back to SwiftShader; ANGLE-Vulkan prefers the dGPU unless the Vulkan ICD list is restricted. No headful run (it would have opened a window on the owner's session); headless has no scanout/compositor-to-screen cost, everything else is the same driver path. |
| Server + players | `startServer({mode:'dist'})` from `tests/support/server.ts` on the build host (fake LiveKit, voice not connected), 1 Storyteller bot + 14 player bots (`tests/support/bot.ts`) in a `world:'v3'` lobby, bots wandering at 10 Hz. The laptop page joins as the **15th player**. |
| Phases | waiting room idle, waiting room with 14 walking, day on the square with 14 walking, **the vote** (everyone teleported to the circle, ST-created nomination, 8 hands), inside the clock tower, night at home (cottage interior). A player cannot be outdoors at night (the night teleport sends the page home: "You stay home until morning"), so the night light pool on the square is a Storyteller-only view and was **not** measured. |
| Variants | Per variant: localStorage flags set, page reloaded (the player rejoins), first frame waited for, 4 s settle, **8 s window**. Viewports **1440×900 @ DPR 2** and **1920×1080 @ DPR 1** (CDP device metrics). Tiers: `low` = `ct.fxQuality=low`; `high` = the WebGL renderer string spoofed to a non-Intel name so `select.ts` row 9 starts at `high` (the auto path ends there anyway, §2); `cpu` = the string spoofed to "SwiftShader" (cpu tier on the real GPU, reference only). Merge A/B: `ct.debug.v3merge=0`. `ct.debug.v3perf=1` on for every run. |
| Probes | An init script (production-build friendly, wraps browser APIs only): first frame = `__ctCamera.v3().ready`; long tasks (PerformanceObserver); draw calls (WebGL2 `draw*` wrappers); per drawing rAF callback: JS ms, rAF timestamp, and **GPU ms** = `EXT_disjoint_timer_query_webgl2` TIME_ELAPSED around that callback (exposed on both GPUs without extra flags; no disjoint events seen); JS heap = CDP `Runtime.getHeapUsage` after a forced GC. 60 fps cap = the game's own frame gate on Chrome's 60 Hz begin-frame clock. |

Caveats: GPU ms is the GPU timeline from the first to the last command of the frame; it can only be read as "GPU
work" when it is well above the JS issue time (it is, outdoors: 9-14 ms vs 3.5-5 ms). Each number is one 8 s window
(≈ 480 frames); the merge A/B was repeated (ABAB) and the pairs agree within 0.3 ms.

## 2. Which tier "auto" picks

`select.ts` row 9 starts any Intel renderer at **`low`**; the lifecycle's perf sampler then **promotes to `high`**
after one good sample (`allowPromote`: Graphics = auto and fx quality not low). Measured: tier `low` at first frame,
**`high` ≈ 2.4 s later** (a full town rebuild behind the loading sheet). So on this iGPU "auto" = **build `low`, then
rebuild at `high`**: the join pays two town builds, and the steady state is the GPU-bound `high` tier (§3), which
never demotes (its median frame stays far below the 45 ms demotion threshold). Explicit `ct.fxQuality=low` stays low.

## 3. Steady frame on the Intel iGPU (1440×900 @ DPR 2)

| phase | tier | fps | rAF interval p50 / p95 ms | JS ms / frame p50 / p95 | **GPU ms p50 / p95** | draws | programs | tris | JS heap MiB |
|---|---|---|---|---|---|---|---|---|---|
| waiting room idle | low | 59.9 | 16.7 / 16.7 | 3.6 / 5.0 | 9.4 / 10.3 | 165 | 55 | 0.86 M | 185 |
| waiting room idle | high | 59.8 | 16.7 / 16.7 | 4.3 / 5.3 | 11.8 / 12.9 | 247 | 61 | 1.52 M | 196 |
| waiting room, 14 walking | low | 59.2 | 16.7 / 16.8 | 3.7 / 5.4 | 9.5 / 11.8 | 158 | 55 | 0.80 M | 190 |
| waiting room, 14 walking | high | 59.3 | 16.7 / 16.8 | 4.4 / 6.6 | 12.2 / 13.4 | 260 | 61 | 1.29 M | 196 |
| day square, 14 walking | low | 59.1-59.9 | 16.7 / 16.8 | 3.5-4.0 / 5.2-6.1 | 9.0-9.1 / 10.1 | 172 | 54 | 0.74 M | 194-206 |
| day square, 14 walking | high | 58.4-60 | 16.7 / 16.8 | 4.2-4.3 / 5.7-6.3 | 10.6-11.3 / 11.5-13.7 | 263-267 | 60 | 1.41 M | 204-214 |
| **vote (8 hands)** | low | 59.9-60 | 16.7 / 16.7 | 3.5-3.7 / 5.0-5.6 | 9.6-10.0 / 10.5-10.8 | 246 | 54 | 0.65-0.81 M | 190-206 |
| **vote (8 hands)** | **high** | **52.4-55.1** | 16.7 / **33.3** | 4.6-4.8 / 6.5-7.0 | **13.2-14.3 / 13.6-14.5** | 338 | 61 | 1.60-1.69 M | 199-214 |
| clock tower room | low | 60 | 16.7 / 16.7 | 1.2 / 1.5 | 2.5 / 2.6 | 66 | 41 | | 114 |
| clock tower room | high | 60 | 16.7 / 16.8 | 1.2 / 1.5 | 3.3 / 3.5 | 76 | 45 | | 121 |
| night, at home (cottage) | low | 60 | 16.7 / 16.7 | 1.1 / 1.5 | 2.4 / 2.5 | 36 | 41 | | 117 |
| night, at home (cottage) | high | 60 | 16.7 / 16.7 | 1.2 / 1.5 | 3.1 / 3.1 | 40 | 45 | | 123 |
| (reference) any outdoor phase | cpu (forced) | 30 (cap) | 33.3 / 33.4 | 4.0-4.4 / 4.8-5.3 | 5.1-6.0 / 5.3-6.2 | 73-109 | 45 | 0.29-0.34 M | 182-189 |

Ranges = the two runs (main run + merge A/B run, merge on). 1920×1080 @ DPR 1 (more CSS pixels than 1440×900; the
canvas is sized in CSS px, so DPR itself costs nothing):

| phase | low: fps / JS / GPU ms | high: fps / JS / GPU ms |
|---|---|---|
| waiting room idle | 59.9 / 3.3 / 9.3 | **56.5** / 4.0 / **13.4** |
| waiting room, 14 walking | 59.9 / 3.7 / 9.3 | **56.1** / 4.6 / **13.5** |
| vote | 60.0 / 3.8 / 9.6 | **52.4** / 5.2 / **14.4** (p95 15.3) |
| clock tower / cottage | 60 / 1.2 / 2.4-2.6 | 60 / 1.2-1.3 / 3.9-4.0 |

**Verdict: the iGPU frame is GPU-bound, not CPU-bound.** Outdoors the GPU needs 9-10 ms (`low`) and 11-14.5 ms
(`high`) per frame while the main thread needs only 3.5-5 ms (the laptop CPU is fast: the same order as the desktop's
uncapped 2-2.4 ms plus capped-clock inflation). At `high`, every outdoor phase is within 2-4 ms of the 16.7 ms budget,
and the vote and the 1080p screen go over it: **52-56 fps with p95 frame intervals of 33 ms (dropped vsyncs)**.
`low` holds 60 fps everywhere with ≈ 6-7 ms GPU headroom. Interiors cost 2.5-4 ms GPU at either tier. CPU-side levers
(animation LOD, draw-call cuts, uniform uploads) do not move the iGPU frame rate; GPU-side levers do: the full-scene
passes (shadow map, normal pass, water reflection pre-render, post chain on RGBA16F targets: learnings.md §4,
fullstack.md §7 "MRT / RGBA8"), and resolution (`high` 1080p costs +1.5 ms GPU over 1440×900).

## 4. The v3.1 static merge on the iGPU (`ct.debug.v3merge=0` vs default on)

ABAB, 1440×900 @ DPR 2, means of two pairs per cell:

| phase | tier | draws on → off | fps on / off | JS ms p50 on / off | **GPU ms p50 on / off** |
|---|---|---|---|---|---|
| waiting room idle | low | 165 → 211 | 59.4 / 59.2 | 3.45 / 3.25 | 9.88 / 9.62 (+0.3) |
| waiting room idle | high | 248 → 310 | **57.8 / 60.0** | 4.40 / 3.75 | **12.96 / 10.39 (+2.6)** |
| day square, walking | low | 172 → 245 | 59.9 / 59.7 | 3.60 / 3.45 | 9.07 / 8.91 (+0.2) |
| day square, walking | high | 263 → 354 | 59.2 / 60.0 | 4.30 / 4.00 | 11.21 / 10.39 (+0.8) |
| vote | low | 246 → 340 | 60.0 / 60.1 | 3.60 / 3.50 | 9.78 / 9.41 (+0.4) |
| vote | high | 338 → 458 | **52.5 / 54.9** | 4.75 / 4.55 | **14.25 / 13.41 (+0.8)** |

The main run (one pass, same conditions) agrees: high waiting room 11.8 vs 9.8 ms GPU, high vote 13.2 vs 12.3, low
vote 9.7 vs 8.7; JS +0.1-0.6 ms with the merge on.

**Verdict: on this iGPU the merge is a net loss.** It removes 22-30 % of the draw calls as designed, but the iGPU is not
draw-call bound: the main thread gets **slower** (+0.1-0.65 ms, as on the desktop) and the GPU gets **slower too**
(+0.2-0.4 ms at `low`, **+0.8-2.6 ms at `high`**), costing 2-2.5 fps at `high` in the vote and the waiting room. The
triangle counts in view are about the same, so the likely cause is lost per-object frustum culling plus a fixed draw
order of the big merged cells (no front-to-back sort, more overdraw, which a fill-limited iGPU pays for). Recommendation:
default `ct.debug.v3merge` **off on integrated GPUs** (or everywhere: the desktop measured a CPU cost too), or retry
with small cells and front-to-back cell order before keeping it.

## 5. Time to first v3 frame (Intel iGPU, 1440×900 @ DPR 2)

| load | ready (first real frame) | long tasks before ready (sum / largest) |
|---|---|---|
| **first visit, empty browser profile** (cold HTTP and cold shader caches) | **13.95 s** | 11.0 s / **9.07 s** single task |
| fresh browser context, shader cache warm (cold HTTP cache) | 4.74 s | 2.32 s / 0.72 s |
| reload (warm HTTP, warm shaders) | 3.4-4.1 s (`low`), 3.8-4.4 s (`high`) | 2.2-2.8 s / 0.63-0.89 s |
| reload when the browser's program cache lost the town's programs (seen at phase changes / after other variants) | **11.6-14.1 s** | 10.5-12.8 s / **8.3-9.7 s** |
| `high` with the merge off | 6.2-6.4 s | 4.9-5.1 s / 2.5-2.7 s |
| forced `cpu` tier (reference) | 10.0-10.9 s | 8.8-9.7 s / 6.8-7.5 s |
| auto (start `low`, promote to `high` ≈ 2.4 s after the first frame) | first frame as `low`, then a second full build | |

On the desktop (fullstack.md §2) the first frame was 2.6-2.8 s with two 0.65-0.72 s long tasks; the warm laptop numbers
are the same order (fast CPU). The new laptop-only cost is **shader compilation on the Mesa iGPU driver**: when the
programs are not in the browser's shader cache, one main-thread task of **8-9.7 s** (three.js waiting for program link
results) freezes the loading sheet, and the first visit is ≈ 14 s. Every first-time visitor on an Intel/Mesa laptop
pays it, and `auto` pays a second (smaller) compile for the `high` rebuild. Levers: `KHR_parallel_shader_compile` +
`compileAsync` for the town before the first frame (learnings.md §3.3 saw no gain on the desktop, where links are
fast; on Mesa they are not), fewer program variants (61 programs at `high`), and starting `auto` at the final tier on
a GPU class that is known to be promoted anyway (skip the `low` build).

## 6. NVIDIA laptop dGPU (secondary)

Same harness, Chrome on the dGPU (PRIME offload, ANGLE GL-EGL). `auto` picks **`high`** directly (non-Intel string).
One window per cell:

| phase | `high` (auto) 1440×900@2: fps / JS / GPU ms p50 (p95) | `low` 1440×900@2 | `high` 1920×1080@1 | `low` 1920×1080@1 | draws high / low |
|---|---|---|---|---|---|
| waiting room idle | 60 / 3.7 / 4.1 (4.5) | 60 / 3.5 / 3.4 | 60 / 3.8 / 4.4 | 60 / 3.4 / 3.7 | 247 / 165 |
| day square, 14 walking | 60 / 3.9 / 4.0 (4.3) | 60 / 3.2 / 3.2 | 60 / 3.9 / 4.3 | 60 / 3.3 / 3.3 | 260 / 171 |
| vote | 60 / 3.7 / 4.5 (5.0) | 60 / 3.4 / 3.7 | 60 / 4.0 / 4.9 (5.9) | 60.1 / 3.7 / 3.7 | 323 / 245 |
| clock tower room | 60 / 1.3 / 2.7 | 60 / 1.2 / 1.4 | 60 / 1.3 / 2.7 | 60 / 1.3 / 1.2 | 76 / 66 |
| night, at home | 60 / 1.2 / 2.2 | 60 / 1.2 / 1.2 | 60 / 1.3 / 2.3 | 60 / 1.2 / 1.2 | 45 / 39 |

The dGPU holds 60 fps everywhere with GPU 4-5 ms at `high`: GPU and main thread are about equal (≈ 4 ms each),
≈ 12 ms of headroom. The iGPU needs ≈ 3× the GPU time of the dGPU for the same `high` frame.

First frame on the dGPU was **slow on every load: 8.4-18.6 s**, each with one **5.2-12.1 s** long task, even on
reloads (the shader programs were not reused from a cache between loads in this headless PRIME-offload setup). Treat
this as a property of the measurement setup until it is reproduced in a normal desktop window; it does show how
expensive an uncached compile of the town's 55-62 programs is on a desktop GL driver.

## 7. Summary

- **Auto on the Intel iGPU ends at `high`** (starts `low`, promoted after ≈ 2.4 s): 58-60 fps in the waiting room and
  on the square, **52-55 fps in the vote** (p95 33 ms), 56 fps at 1920×1080. `low` holds 60 fps everywhere.
- **GPU-bound**: GPU 9-10 ms (`low`) / 11-14.5 ms (`high`) vs main-thread JS 3.5-5 ms per outdoor frame. Interiors
  2.5-4 ms GPU, 1.2 ms JS.
- **Static merge: net loss on the iGPU** (GPU +0.8-2.6 ms at `high`, JS +0.1-0.65 ms, despite -22-30 % draws).
- **First visit ≈ 14 s** to the first frame, dominated by one 9 s shader-compile long task; warm 3.4-4.7 s.
- NVIDIA laptop dGPU: 60 fps everywhere at `high`, GPU 4-5 ms, JS ≈ 4 ms (balanced, large headroom).
- Heap after GC: 185-215 MiB outdoors, 114-124 MiB indoors.

Driver scripts (scratch, not in the repo) and a how-to for measuring other branches the same way were left with the
measurement agent's handoff.

## 8. v3.3 re-run (release agent, 2026-10-18)

Same device, harness and phases (helper agent of `v33-release`; 1440×900 @ DPR 2, `auto`, no spoof, each build's own
defaults: v3.2 `ceab1ce` = merge on, v3.3 = merge off + GPU-headroom promotion + tree cache). 8 s windows after ≥ 25 s
settle. The waiting-room idle windows are 30 fps idle-capped in both builds (v3.2 idle rendering).

| Intel iGPU | v3.2: tier, fps, JS p50, GPU p50 / p95, draws | v3.3 |
|---|---|---|
| tier timeline | `low`, then `high` 2.2-4.8 s after the first frame (every phase reload) | `low`, stays: `promotion declined (gpu-busy; gpu 8.0-10.2 ms, cpu 3.1-4.7 ms, integrated)` |
| waiting room idle | high, 30\*, 6.2, 16.1 / 17.1, 268 | low, 30\*, 4.5, 10.4 / 11.0, 209 |
| waiting room, 14 walking | high, 53.7, 4.8, 14.5 / 15.4, 262 | low, 59.6, 2.8, 7.9 / 9.0, 202 |
| day walk | high, 58.1, 4.1, 12.2 / 12.6, 264 | low, 59.5, 3.0, 8.8 / 9.6, 245 |
| vote | high, **50.4** (p95 interval 33.4), 4.8, 15.1 / 15.3, 324 | low, **59.7** (p95 16.7), 3.2, 9.7 / 10.4, 341 |
| vote, explicit `low` | low, 59.9, 3.5, 10.8 / 11.7, 245 | low, 59.7, 3.3, 9.4 / 10.6, 341 |
| warm reload ready ms | 3 770 / 3 572 / 3 532 | 2 690 / 2 657 / 2 633 |
| repeat join, page load | 3 403 / 3 416 | 2 455 / 2 426 (279 / 279 tree-cache hits; town build 2 519 → 1 211-1 365 ms) |
| repeat join in the app (Leave, lobby link) | 4 886 / 4 902 | 4 286 / 3 969 (one ≈ 2.5 s long task remains) |

\* idle-capped. Tree-cache resize check (v3.3): 1280×720, 1600×1000, 1920×1200, 1024×640 each missed once (new lowH),
stored, then replayed; IndexedDB never held more than 2 records; no bake errors. NVIDIA dGPU `auto`: `high` from the
first frame in both builds (no probe), vote 60 fps, GPU 4.35 / 4.38 ms p50. The v3.3 "first load" ran in the same
browser session after v3.2 (partly warm caches) and is not a cold first visit; the cold Intel first visit stays ≈ 14 s.

## 9. How to re-run on the laptop (summary; the original /tmp driver how-to may be gone)

Access rules (host alias, device, what is allowed) are in the gitignored CLAUDE.local.md; never write the laptop's
names into tracked files. The method used for v3.1-v3.5:
- **Device:** the Intel Arc iGPU (Meteor Lake, Mesa) + RTX 4070 laptop, Chrome 143 `--headless=new`, no node, no sudo,
  files only under `~/ct-perf` on the laptop.
- **Launch:** `~/ct-perf/chrome.sh <devtools port> intel glegl` = ANGLE GL-EGL on the iGPU with the Mesa EGL vendor (the
  backend the owner's desktop Chrome uses); `nvidia glegl` = the dGPU; `gl` / `default` fall back to SwiftShader (do not
  use). `chrome.sh` refuses to start on battery (`/sys/class/power_supply/*/online` must be 1) and holds
  `flock ~/ct-perf/gpu.lock` for the browser's lifetime (`CT_LOCK_WAIT`, default 900 s); never kill another port's Chrome.
- **Server:** the tree to measure is built in a host sandbox (`git archive <ref> | tar -x` into a scratch dir, copy
  `ops.local.env` / CLAUDE.local.md in, `CT_AGENT=<name> scripts/remote.sh sh -c 'flock -s $HOME/clocktower/v3-heavy.lock
  pnpm build'`); a small host driver (`.prof/game.ts`: `startServer({mode:'dist'})` from tests/support/server.ts + an ST
  bot + N player bots from tests/support/bot.ts, stdin commands such as `READY+start`, `vote`, `night`, `tp square|home|
  seat|building <id>|point x y`, `tpall seat`) runs in that sandbox on a port of the agent's range.
- **Tunnels:** devtools: orchestrator `ssh -L <port>` to the laptop; game: laptop `-R <port>` → orchestrator `-L <port>` →
  host 127.0.0.1:<port>.
- **Driving:** playwright-core `connectOverCDP` from the orchestrator, an init-script probe (long tasks, rAF gaps, draw
  wrappers, `EXT_disjoint_timer_query_webgl2` GPU ms, `__ctCamera.v3()` readouts), `Emulation.setDeviceMetricsOverride`
  1440×900 @ DPR 2; localStorage flags + reload per variant; spoof the WebGL renderer string to force `high` / `cpu`.
  Cold samples = one fresh `--user-data-dir` each (or `Browser.crashGpuProcess` for a lost shader cache: shaders.md §1).
- **Look checks (v3.5):** `ct.debug.freeze=1` + `window.__ctFreezeT` set by an init script from boot (freezing after a
  settle leaves townsfolk wherever they wandered), the player teleported before the reload, the DOM / overlay canvas
  hidden (hand sprites run on wall-clock time; the page's CSP blocks injected `<style>`: use an adopted stylesheet), CDP
  `Page.captureScreenshot` of the WebGL canvas; compare against a same-flag pair for the noise floor; the vote camera's
  yaw is chosen per load, compare only pairs whose cameras match.
- **Teardown:** close your Chrome (your port only) and delete its profile, close the tunnels, stop the host driver;
  verify with `pgrep` / `ss` on all three machines.

