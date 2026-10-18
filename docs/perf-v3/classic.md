# v3 performance — front "classic" (Classic 2D / Phaser drawing the v3 Hollowmere map)

Agent `v3-perf-classic`, 2026-10-18, branch `v3-perf-classic` (from `v3-game` 0cfd0b8 = "v3 C1"). In v3.0, phones and
devices without good WebGL get Classic under Auto, so this is the path many players see first. Recon and tooling:
`docs/perf-v3/recon-classic.md`. Every change applies to v2 lobbies too, with no visible or behavioural change (v2
generated outputs untouched; nothing in `packages/assets` was regenerated).

## TL;DR (one exclusive `v3-heavy.lock` + `browser.lock` window, same host, same method, A/B/C back to back)

| What (v3 lobby, 1 ST + 14 walking bots + the browser player, SwiftShader) | base (0cfd0b8) | after | Change |
|---|---|---|---|
| Live GPU texture memory, 1440×900 desktop | 147 MiB | 45.4 MiB | **−101 MiB (−69 %)** |
| … 1280×720 | 139 MiB | 40.7 MiB | −98 MiB |
| … phone 390×844 / 844×390 (DPR 3) | 132 MiB | 36.7 MiB | −95 MiB |
| Live textures (count), desktop | 170 | 84 | −86 |
| Main-thread long tasks from lobby load to first window (sum) | 5579 ms | 1873-2138 ms | **−62 %** |
| … the tier-drop stall (~12.7 s after load) | 2030 ms | **gone** | low tier from the first frame |
| Phone portrait 390×844 DPR 3, 4× CPU: main thread / script | 31.5 % / 19.2 % | 29.4 % / 17.2 % | −2.1 / −2.0 pp |
| Phone landscape 844×390 DPR 3, 4× CPU: main / script | 31.1 % / 18.7 % | 30.3 % / 17.1 % | −0.8 / −1.6 pp |
| 1280×720 walk: main / script | 4.9 % / 3.0 % | 4.2 % / 2.6 % | −0.7 / −0.4 pp |
| Gathered circle (15 seats, 1440×900): main / script | 3.9 % / 2.7 % | 3.3 % / 2.2 % | −0.6 / −0.5 pp |
| Seat markers / clock dial: earcut + path allocations per rendered frame | ~47 earcuts, ~1 600 Points | 0 | pixel-identical (proof below) |

**Caveat on the host:** the window ran while another agent's SwiftShader lever sweep (`tests/perf/v3-cpu-tier.ts`, a
headless GPU process at ~940 % CPU, 35 min, outside the heavy lock) loaded the 12-core host to 16-22. So the GPU
process was starved: desktop windows rendered ~16/s instead of the low tier's 30/s in **all three** builds. Texture
memory and long-task numbers are robust to that; the main-thread percentages are within ~±1 pp noise, so read the
small deltas as "no regression, likely small gain", not as precise numbers.

## What changed (all in world-art paths: `apps/client/src/game/**`)

1. **Phaser pre/post FX pipelines off** — `game/TownGame.ts` (`disablePreFX: true, disablePostFX: true`).
   Nothing in the client uses preFX/postFX (`grep -E "preFX|postFX|FXPipeline|setPostPipeline"` finds nothing).
   Phaser's PipelineManager otherwise allocates 3 square render targets for every 32 px step up to the canvas's
   shorter side plus 4 full-screen ones at boot (84+ textures, ~90 MiB at a 900 px canvas), never shrinks the pool,
   and re-creates the full-screen ones on every resize. Matters most on laptop iGPUs (shared memory) and iOS Safari
   (tab kills under WebGL memory pressure).
2. **Low tier from boot on software GL** — `game/TownGame.ts` (`isSoftwareGl` reads Phaser's own context:
   `UNMASKED_RENDERER_WEBGL`, falls back to `RENDERER`), `game/fx/tier.ts` (`SOFTWARE_RENDERER` =
   `/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i`, `TierState.forceLowIfAuto()`). At `READY`, before the
   scene's first frame, an `auto` desktop on a CPU rasteriser drops to `low`. Before: ~10-14 s of normal-tier frames
   and then a **2.0 s** main-thread freeze when the slow-frame watch dropped the tier (the canvas resize re-creates
   every render target). An explicit Settings preference still wins; touch / ≤ 4-core devices were already `low`.
3. **Earcut-free seat markers, vote-clock hub and town clock wedge** — new `game/render/fan.ts`
   (`fillEllipseFan`, `fillSliceFan`, `fillCircleFan`, `arcPoints`), used by `game/gameplay/phaserView.ts` and
   `TownScene.drawTownClock`. Phaser 3.90 replays a Graphics command buffer on every rendered frame, so each
   `fillEllipse` (33 new `Vector2` + earcut) and each `slice`/`fillCircle` (100+ new Points + earcut) re-ran every frame,
   even when nothing changed — 15 seats × 3-4 ellipses during every nomination/vote. The helpers emit the *same
   polygon, vertex for vertex*, as a triangle fan from a point it is star-shaped around (FILL_TRIANGLE batches directly).
   **Pixel proof:** `tests/perf/classic-fan-pixels.ts` renders both versions side by side in real Phaser on SwiftShader
   at zoom 1 / 2 / 2.25 / 2.7 / 3 over a patterned background: **0 differing pixels** at every zoom
   (`--selftest`, which widens the fan ellipses by 1 px, reports 1 700-2 000 differing pixels → the probe is sensitive).
4. **View culling of the map's static sprites** — new `game/render/cull.ts` (`StaticCuller`), hooked in
   `TownScene.create` at `Phaser.Scenes.Events.PRE_RENDER`. Phaser 3 never culls Images, and Hollowmere (125×43 tiles,
   2000×688 px) has ~440 static props/buildings (v2 ~250), all transformed and batched every frame. Sprites are bucketed
   in 256 px chunks; only sprites whose box is wholly outside the view + 64 px are hidden; while the view stays in the
   same chunk rectangle only the border chunks are re-tested. View maths = `Camera.preRender` (origin 0.5, the scene sets
   no camera bounds), evaluated after every camera move of the frame (update, resize, teleport, building entry).
   Biggest effect on phones (portrait sees ~390 of the 2000 px): script −2.0 pp at 4× CPU.

Tooling (this front's own files): `tests/perf/classic-perf.ts` gains `phone3-portrait` / `phone3-landscape` (DPR 3,
4× CPU, touch emulation via CDP) and `desktop-720` windows plus `joinLongTasks` / `allLongTasks`;
`scripts/perf/classic-recon.sh` takes `PORTS=` (this agent now owns 3475-3479, not 3494-3495).

## Measurements

Builds: `vite build --outDir ~/clocktower/work/v3pcl-out/dist-{base,new,cull}` from the same sandbox (base = 0cfd0b8
before any change, new = changes 1-3, cull = 1-4). Server: the sandbox source (`classic-perf.ts` starts it).
Window: 2026-10-18 19:01-19:06 UTC, `WIN=10` s per window, `desktop-idle` first as the warm-up window.

| Window | Metric | base | new (1-3) | cull (1-4) |
|---|---|---|---|---|
| desktop-idle 1440×900 | renders/s · main % · script % | 16 · 3.7 · 2.6 | 16.2 · 5.2 · 2.3 | 16.3 · 3.3 · 2.2 |
| desktop-walk 1440×900 | renders/s · main % · script % | 15.7 · 4.3 · 2.7 | 16 · 4.4 · 2.6 | 16 · 4.6 · 2.6 |
| phone3-portrait 390×844 DPR3 4×CPU | renders/s · main % · script % | 30.1 · 31.5 · 19.2 | 30 · 31.4 · 19.1 | 30.1 · 29.4 · 17.2 |
| phone3-landscape 844×390 DPR3 4×CPU | renders/s · main % · script % | 30 · 31.1 · 18.7 | 30 · 31.1 · 18.4 | 30 · 30.3 · 17.1 |
| desktop-720 1280×720 | renders/s · main % · script % | 22.1 · 4.9 · 3.0 | 22.3 · 4.9 · 3.0 | 21.1 · 4.2 · 2.6 |
| gather (15 seats) 1440×900 | renders/s · main % · script % | 15.9 · 3.9 · 2.7 | 16.1 · 3.5 · 2.4 | 16.3 · 3.3 · 2.2 |
| textures desktop / 720 / phone | MiB | 147 / 139 / 132 | 45.4 / 40.7 / 36.7 | 45.4 / 40.7 / 36.7 |
| join long tasks (load → first window) | n · max · sum ms | 8 · 2817 · 5579 | 7 · 1240 · 1873 | 9 · 1378 · 2138 |
| host load 1m (12 cores) | before the run | 12.4 | 17.8 | 20.5 |

Base's two biggest join tasks were 2817 ms at t = 4.8 s (Phaser boot + scene create, software GL) and **2030 ms at
t = 12.7 s (the tier drop)**; after: 1240-1378 ms at t ≈ 4.2-4.7 s (boot, now with fewer render targets) and no
tier-drop task. No page errors in any run. Draws per render unchanged (7.6-10.2): the Phaser batcher already merged
these sprites; the saving is the per-sprite JS (batchSprite + transform) and the per-frame path work.

Phone profile after the changes (`--profile yes`, unminified build, phone3-portrait, 4× CPU; `tests/perf/cpuprofile-summary.ts`):
busy 38.6 % of one core under the profiler, of which 23.5 % is `(program)` (native: GL command encoding / IPC /
compositing at DPR 3) and ~8 % is TownGame JS: `batchSprite` 1.2 %, `activeTexture`+`bindTexture` 1.7 %,
`ImageWebGLRenderer` 0.6 %, depth sort (`sortByDepth`+`StableSort`) 0.9 % — the remaining costs are spread thin.

Commands (all on the host via `scripts/remote.sh`, CT_AGENT=v3-perf-classic, ports 3475-3477):

```
# builds (shared heavy lock)
cd apps/client && flock -s ~/clocktower/v3-heavy.lock pnpm exec vite build --outDir ~/clocktower/work/v3pcl-out/dist-base --emptyOutDir
#   (same for dist-new after change 1-3, dist-cull after change 4, dist-nomin with --minify false)
# measurement (exclusive heavy + browser lock, one job, ~5 min)
flock ~/clocktower/v3-heavy.lock flock ~/clocktower/browser.lock env PORTS=3475-3476 WIN=10 \
  bash scripts/perf/classic-recon.sh ~/clocktower/work/v3pcl-out/m1 \
  "base-v3|v3-perf-classic|<dist-base>|v3|desktop-idle,desktop-walk,phone3-portrait,phone3-landscape,desktop-720,gather|--clock yes" \
  "new-v3|…|<dist-new>|…" "cull-v3|…|<dist-cull>|…"
node scripts/perf/classic-summary.mjs --md base=<m1>/base-v3/classic-perf-v3.json new=… cull=…
# profile (exclusive locks, ~1.5 min)
… classic-recon.sh <p1> "nomin-v3|v3-perf-classic|<dist-nomin>|v3|desktop-idle,phone3-portrait,gather|--clock yes --profile yes"
pnpm exec tsx tests/perf/cpuprofile-summary.ts <p1>/nomin-v3/classic-v3-phone3-portrait.cpuprofile
# pixel proof (browser lock, < 1 min)
flock -w 120 ~/clocktower/browser.lock timeout 150 pnpm exec tsx tests/perf/classic-fan-pixels.ts            # IDENTICAL
flock -w 120 ~/clocktower/browser.lock timeout 150 pnpm exec tsx tests/perf/classic-fan-pixels.ts --selftest # DIFFERENT (expected)
```

## Tests run (host, this branch)

| Command | Result |
|---|---|
| `pnpm -r run typecheck` | green (7 projects) |
| `pnpm vitest run apps/client` | 67 files / 869 tests passed (incl. new `render.fan`, `render.cull`, extended `town.tier`) |
| `tsc --noEmit --strict … tests/perf/classic-fan-pixels.ts` | clean |
| `tests/perf/classic-fan-pixels.ts` / `--selftest` | IDENTICAL (0 px at 5 zooms) / DIFFERENT (expected) |
| `E2E_PORT=3477 pnpm test:e2e --project=chromium classic-in-v3 v21-clock v2-look v2-phone` | classic-in-v3 "one page v2→v3" ✓, "Q7 screenshots" ✓, v2-look ✓, v2-phone ✓ (10.6 min); **classic-in-v3 "all 15 cottages" ✘ `expected 15, received 16`** — stale count: vendor B (182d220) made the clock tower enterable, so Classic now (correctly) enters 16 buildings; not caused by this branch. The 1200 s timeout cut the run before v21-clock |
| `E2E_PORT=3477 CT_E2E_NO_BUILD=1 pnpm test:e2e --project=chromium v21-clock` | 2 passed (5.0 min) |

## Proposed `scripts/perf/budgets.mjs` keys (not edited here; the lead integrates)

Values = measured + ~20 % headroom, SwiftShader proxy, `classic-perf.ts` output:

| Key | Value | Measured after | Note |
|---|---|---|---|
| `classicTexMiB` (desktop 1440×900, live textures) | **55** | 45.4 | was 147 at base; the recon proposed 175 → 55 after this change |
| `classicPhoneTexMiB` (390×844) | **45** | 36.7 | |
| `classicJoinLongTaskMs` (max task, load → first window) | **1700** | 1240-1378 | boot task on software GL; was 2817 + a 2030 tier-drop task |
| `classicJoinLongTaskSumMs` | **2600** | 1873-2138 | was 5579 |
| `swPhone3PortraitScriptPct` (DPR 3, 4× CPU) | **21** | 17.2 | re-baseline on an unloaded host |
| `swGatherMainPct` | **5** | 3.3 | recon proposed 6 |
| `classicRendersPerSecMin` (needs a min mode) | low 28 | — | could not be validated today: the GPU process was starved by another agent's sweep |

## Not done / follow-ups

- **Lighting RT** (`TownScene.updateLighting`): the town-sized light RenderTexture (2000×688 in v3) is cleared and
  re-stamped (ambient quad + ~158 light stamps) at the 12 Hz flicker tick whenever any area light exists. Drawing only
  the chunk rectangle around the view (with the view-chunk key added to the `lit` dirty check so a camera jump redraws
  in the same frame) would cut that fill to ~35-50 % on software GL. Medium risk (stale regions if the key is wrong);
  left for v3.1.
- **Drop the `terrain` GL texture after the ground bake** (−4.1 MiB in v3) and re-upload from the kept image on context
  restore — medium risk (context-restore path), not done.
- **ClockChip DOM churn** (`ui/clock/*`, not this front's file): with a stage timer the chip's `title` attribute is
  rewritten every second (1/s mutation + style invalidation; desktop-walk shows 6.2-6.3 DOM mutations/s with the
  compass). Set `title` only on stage / paused changes.
- **`tests/e2e/classic-in-v3.spec.ts:258-259`** (qa / v3-qa): expect 16 buildings (or derive the count from
  `townLayoutV3.buildings`) since the clock tower became enterable.
- **Host hygiene:** another agent's `tests/perf/v3-cpu-tier.ts` sweep ran a SwiftShader GPU process at ~940 % CPU for
  35+ min outside the heavy lock during this window; measurement windows of every front are distorted while it runs.
