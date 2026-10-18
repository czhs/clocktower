# v3 perf recon: front "classic" (v2 Classic client, entry, lobby, Classic-in-v3)

Agent `v3-perf-classic`, 2026-10-18, branch `v3-game`. This is recon only: no product code was changed. It is written
for the optimisation swarm that runs after C1 (the v3 town is wired) and C2 (QA). Every number is labelled with the
**tree** and the **method** it came from. Compare only numbers that came from the same method.

## Trees and methods

| Label | Tree | How it got to the host |
|---|---|---|
| `v24` | `4ca13aa` (v2.4: prod and GitHub main) | `git archive` → `~/clocktower/work/v3-perf-classic-v24` |
| `head` | `4998ca5` ("v3 C1 WIP", the committed `v3-game` tip) | `git archive` → `…/v3-perf-classic-head` |
| `wt` / `wt2` | the shared working tree, with the other swarm mid-WP2/3/4/5b/6; synced about 04:50 / 05:00 UTC | `scripts/remote.sh` → `…/v3-perf-classic` |
| `exp` | `head` plus one experiment in `main.tsx`: sound moved out of the entry (optimisation 2) | `git archive` + patch, on the host only |

- **Bundle** numbers come from `scripts/perf/bundle-report.mjs --json`: a Vite production build, with brotli measured
  for every file. The new `scripts/perf/classic-bundle.mjs` compares the trees. These numbers are deterministic, so
  host load does not affect them.
- **Runtime** numbers come from the new `tests/perf/classic-perf.ts`.
  - It runs one headless Chromium on **SwiftShader** (`--use-angle=swiftshader --enable-unsafe-swiftshader`, the
    same args as the e2e `v3` project). It refuses to measure if the GL renderer string is not software.
  - The scene is 1 Storyteller bot, 14 walking player bots, and the browser as the 15th player. Each window is 15 s.
  - Each session held `v3-heavy.lock` and `browser.lock` for its whole measuring time:
    - session 1: 04:52–04:59 UTC, host 1-min load 1.1 → 10;
    - session 2: 08:21–08:30 UTC, load 7–11.

    Every JSON window records `hostLoad1m` (before / after).
  - **Do not compare these with the v2.4 GPU numbers** in `docs/perf-v2.2-results.md`; the host GPU is off limits
    now.
  - **Do not compare them with v2.4's "no-GPU proxy" rows either.** That proxy used Chromium's default software
    path, where rasterisation showed up as about 94 % main thread. With ANGLE/SwiftShader the rasterisation runs in
    the GPU process, so the renderer main thread is only 2–14 %.
  - The `v24` column is the like-for-like baseline.

## 1. The v2.4 budgets on the v3-game tree

### Bundle (KiB brotli)

| | v24 | head | wt | wt2 | budget (`budgets.mjs`) | INTEGRATION.md §7 |
|---|---|---|---|---|---|---|
| entry JS (`entryJsBrKiB`) | 43.2 | 44.2 | 44.2 | 42.7 | 45 | growth ≤ 1 KiB: head **+1.0 (at the limit)**; wt2 −0.5 |
| entry JS incl. static imports | 43.2 | 44.2 | 44.2 | 42.7 | — | |
| entry CSS (index-base + theme) | 11.4 | 11.5 | 11.5 | 11.5 | 15 | |
| LobbyRoute (`lobbyChunkBrKiB`) | 63.8 | 67.0 | 66.9 | 67.0 | 72 | growth ≤ 2 KiB: **+3.2 (over)** |
| LobbyRoute + its own static chunks | 67.5 | 70.8 | 70.7 | 71.8 | — | |
| TownGame, Phaser (`townChunkBrKiB`) | 294.6 | 295.6 | 296.0 | 295.9 | 300 | about 4 KiB headroom left |
| townParts | 11.3 | 11.5 | 11.5 | 11.5 | — | |
| layoutV3 / v3atlas (lazy, v3 lobbies) | — | 4.0 / 3.0 | 4.0 / 3.0 | 4.0 / 2.7 | `v3LayoutBrKiB` 25 | |
| town3d (another front) | — | 258.9 | 262.3 | 262.6 | `town3dChunkBrKiB` 230 | **over** (C0 measured 222) |

**What grew.**
- Entry, in `head`:
  - `ui/lobby` +2.0 KiB raw (Town choice, `WorldBadge`, `finder` world pick);
  - `packages/protocol` +0.3;
  - `game/sound` +1.0 (per-world surfaces).
- Entry, in `wt2`: someone moved a new `lobbyWords` chunk out of the entry (`ui/lobby` −6, protocol −3 KiB raw). It
  is now fetched with the lobby.
- Lobby:
  - `GameScreen.tsx` +3.2 KiB raw (renderer swap, notices);
  - `game3d/select.ts` 4.6 and `game3d/bootGuard.ts` 2.0 KiB raw (static by design, §1.1);
  - `ui/common` +4.6 (v3 skin state).
- **No leak.** No three.js, pixel3d or hollowmere module is statically reachable from the entry or the lobby
  (`classic-bundle.mjs` checks this). It does list `select.ts` / `bootGuard.ts` as game3d modules in the lobby, which
  §1.1 intends.

### Atlases (`packages/assets/generated`: WebP bytes / decoded RGBA8 size)

| | KiB | GPU MiB |
|---|---|---|
| v2 Classic town (cast, terrain, objects, decor, lights, square-props, social) | 578.5 | 11.5 |
| Classic-in-v3 town (terrain-v3 1024×1040 replaces terrain 1024×800; adds objects-v3) | 577.4 | 12.6 |
| cast sheet 1760×960 (the v2.4 "≤ 8 MiB" item) | 178 | 6.4 (target met; unchanged) |
| cast-hd 1280×1400 (loaded only when the lobby has an HD character) | 739 | 6.8 |
| cast-ghosts 896×672 (loaded at the first death) | 174 | 2.3 |

### Runtime (SwiftShader, 15 s windows)

| Window | Metric | v24 · v2 | head · v2 | head · **v3** | wt2 · v3 |
|---|---|---|---|---|---|
| desktop-idle 1440×900 | rAF fps / Phaser renders/s | 60 / 30 | 60 / 30 | 49 / 26 ¹ | 49 / 26 ¹ |
| | main % / script % | 3.2 / 2.3 | 3.3 / 2.3 | 12.2 / 11.1 ¹ | 14.0 / 12.9 ¹ |
| desktop-walk | main % / script % | 3.9 / 2.4 | 4.1 / 2.5 | 4.3 / 2.6 | 4.8 / 3.3 |
| | DOM mutations/s / style recalcs/s | 3.8 / 15.8 | 3.6 / 15.2 | 3.1 / 10.3 | 3.8 / 16.0 |
| mobile-walk 390×844, 4× CPU | main % / script % | 10.2 / 6.6 | 10.1 / 6.8 | 10.5 / 7.0 | 12.0 / 8.4 |
| | DOM mutations/s (`mobileWalkDomMutPerSec`, budget 6) | 3.6 | 3.5 | 2.9 | 3.7 |
| gather (seated in the circle; new window) | main % / draws per render | 4.7 / 9.2 | 4.4 / 9.2 | 4.1 / 9.2 | 5.0 / 9.2 |
| night-home | main % | 2.2 | 2.2 | 2.0 | 2.7 |
| live textures, desktop (count / MiB) | | 167 / 137 | 169 / 144 | 170 / 139 | 171 / 140 |
| load, Slow 4G + 4× CPU (session 2) | auth screen ms | 2549 | 2548 | 2551 | — |
| | town canvas / scene ready ms | 11 982 / 16 143 | 11 947 / 16 131 | 13 243 / **17 767** | — |
| | town XHR + fetch / images / CSS KiB | 751 / 13 / 122 | 751 / 13 / 122 | 888 / 98 / **203** | — |

¹ In v3 lobbies the auto tier drop happens about 14 s after navigation (10 s in v2), so the first window still
contains the warm-up: frames at the normal tier, the canvas resize, and one 1.3 s long task. See leftover 2.

**Verdicts.**
- **C0 / C0b / WP5b / WP6 did not regress the Classic runtime in v2 lobbies.** Every `v24`/`head` pair is within
  noise.
- **Classic in a v3 lobby (Hollowmere) costs the same as v2 once warm.** Walk, gather and night are all within
  ±0.4 % main.
- **`wt2` reads 0.5–1.5 % main higher than `head` in all four warm windows.** The host load was similar, so this may
  be real (WP5b/WP6 work in flight). Re-measure on the C1 commit before acting on it.
- **The HUD churn while walking** is still only the home compass: about 1.8 text and 1.7 arrow-style mutations/s.
- **The v3 lobby loads 1.6 s slower** on Slow 4G (scene ready 17.8 s vs 16.1 s):
  - the v3 DOM skin: `panels.css` 83 KB uncompressed (data: URIs), `portraits.png` 95 KB, `kit.json` 37 KB,
    `portraits.json` 39 KB;
  - `terrain-v3` / `town-v3.json` (about the same size as v2).

  It is still inside `townNetworkIdleMs` 19 000.

## 2. The v2.4 leftovers

1. **`TownScene.drawTownClock` per-frame earcut: still there, but negligible.** The code is at
   `TownScene.ts:1727-1772`. Phaser's `GraphicsWebGLRenderer` replays the command buffer on every render, so the
   key-change guard does not prevent the earcut: one 100-point earcut runs per rendered frame while a stage timer
   runs. Profiled (`head`, v2, timer running, 30 renders/s):
   - `earcut` 8 ms of a 16 s desktop window (0.05 % wall);
   - 29 ms of a 16 s phone window at 4× CPU (0.18 %);
   - `drawTownClock` itself 2 ms.

   **Correction:** session 1 seemed to show "+7 % main with the clock". The session-2 A/B showed that this was the
   warm-up/tier-drop stall landing in whichever window ran first:
   - without the timer: 12.8 % main, one 1.3 s long task;
   - with the timer: 4.5 %, no long task.
2. **Low tier auto 30 fps on GPU-less desktops: works, but late and with a stall.**
   - With SwiftShader, every warm 1440×900 window ran at render scale 0.75 and exactly 30 Phaser renders/s (rAF
     60). `--quality low` gave the same numbers as `auto` (desktop-walk 4.2 % vs 4.1 %).
   - But the first about 10 s (v2) to 14 s (v3) after mount run at the normal tier, at about 26 renders/s and 12 %
     main.
   - The drop itself costs one main-thread stall of **1.0–1.3 s**, seen in every session's first window. The CPU
     profile shows 965 ms in a single `createFramebuffer` call: `updateLighting → lightRT.beginDraw →
     renderer.beginCapture → RenderTarget.bind → resize`. The renderer's shared capture target is re-created after
     the canvas resize, and on software GL that call waits for the GPU process to finish reallocating every
     canvas-size render target. See optimisation 3.
3. **Cast-sheet GPU memory: the v2.4 target is met (6.4 MiB), but total texture memory is 137–146 MiB.** That is
   about 170 textures in a desktop session at 1440×900, in both trees and both worlds.
   - **About 100 MiB of it is Phaser's PreFX render-target pool, and the game never uses it.**
     - Unless `disablePreFX` is set, `PipelineManager.boot` (Phaser 3.90, `renderer/webgl/PipelineManager.js`
       around lines 403-431) creates three square render targets for every 32 px step up to the canvas's shorter
       side, plus three full-screen ones. `PreFXPipeline` adds one more full-screen target.
     - The texture histogram shows the result: 3× 896×896, 3× 864×864, … 3× 32×32, all created at t ≈ 0–1 s. The
       pool is sized at boot and is not shrunk when the canvas later shrinks.
     - At a 900 px canvas that is 84 textures. 12 288 B × Σi² for i = 1..28 ≈ 90 MiB, plus about 11 MiB of
       full-screen targets.
   - No client code uses preFX or postFX: `grep -E "preFX|postFX|FXPipeline"` over `apps/client/src` finds nothing.
   - The pool scales with the canvas, which is CSS px × render scale with no DPR: about 8 MiB on a 390 px phone,
     about 100 MiB in a 1920×1080 window, about 340 MiB on a 1440 px-tall canvas.
4. **HUD DOM mutations while walking: 3–4/s, no regression.** A running stage timer adds about 2.4/s from the
   ClockChip:
   - `title` attribute 1/s;
   - `span.ctc-time` 1/s;
   - SVG wedge / hand 0.4/s.

   With the timer, the phone walk measured 6.1/s (session 1) and 6.6/s (session 2, profiler attached). Both are over
   the 6/s budget.
5. **The fps probe counted browser frames, not Phaser renders: fixed in the new tooling.** `classic-perf.ts` counts
   rAF ticks in which at least one WebGL draw call happened (`rendersPerSec`, `renderGapMs`). It also records:
   - draws per render;
   - texture uploads per second;
   - a live texture registry (count, MiB, histogram with creation times).

   `client-perf.ts` is unchanged; §5 has the proposal for it.

Profile attribution for the gather window (`head`, v2 and v3 gave the same result; 4.6 % busy):
- The seat markers (`gameplay/phaserView.ts`) cost about 1.1 % wall, roughly a quarter of the busy time:
  - `GraphicsWebGLRenderer` 94 ms;
  - its `draw` 79 ms (`fillEllipse` 50, `strokeEllipse` 19);
  - `batchFillPath` 45;
  - earcut 30.
- This is at 30 renders/s on the low tier. A 60 fps phone or desktop pays about twice as much.

## 3. Ranked optimisations

The gain estimates are for the SwiftShader proxy unless a line says otherwise. On a real GPU you see the script
share, not the raster share.

1. **Set Phaser `disablePreFX: true` and `disablePostFX: true` in the Classic game config.**
   - What it does: removes the unused PreFX render-target pool (leftover 3).
   - Expected gain:
     - about **−100 MiB GPU memory** at 1440×900 (about 140 → 40 MiB);
     - about −100 MiB at 1080p and about −8 MiB on a phone;
     - about 88 fewer framebuffer and texture allocations at boot and after every WebGL context restore;
     - fewer full-screen targets to re-create on every resize, which probably shortens the tier-drop stall.
   - It matters most on laptop iGPUs (shared memory) and on iOS Safari, which kills tabs under WebGL memory pressure.
   - Change: two keys in `new Phaser.Game({ … })` in `apps/client/src/game/TownGame.ts` (world-art).
   - Risk: low, because nothing uses preFX or postFX. Verify with the `v2-look` / `v2-phone` screenshots and
     `classic-perf.ts` (`textures.totalMiB` in every window).
   - Not game3d; does not need C1.
2. **Move the town sound director out of the entry chunk.**
   - Measured: **−10.8 KiB br**, entry 44.2 → **33.4 KiB br** (−24 %). In the `exp` build the only change was
     `main.tsx` importing `./game/audio` lazily. Total JS grew by +1.1 KiB (the new `audio` chunk is 11.7 KiB br and
     is now part of the lobby's static closure).
   - Why the entry is heavy today: `main.tsx` imports `installUiSounds` from `game/audio.ts`, which re-exports from
     `game/sound/index.ts`. That module also holds `attachSound` / `SoundDirector`, which pull in `sound/world.ts`,
     `sound/areas.ts`, the whole v2 `townMap` / `townLayout` (`packages/assets`, 34 KiB raw) and `net/layout.ts`.
   - Proper fix: split `game/sound/index.ts` in two.
     - `sound/ui.ts`: engine, catalog, synth, prefs, codec, `installUiSounds`, `playCue`. `main.tsx` imports only
       this.
     - `sound/town.ts`: `attachSound`, the director, areas, cues. GameScreen and LobbyRoute import this.
   - The UI-click part may stay in the entry (a few KiB) so the first click on the landing page still makes a sound.
   - This also restores headroom for every later entry change (§7 allows ≤ 1 KiB growth).
   - Files: `apps/client/src/main.tsx` (lead); `game/audio.ts` and `game/sound/index.ts` (world-art).
   - Risk: low; sound is best-effort. Run the sound unit tests and the e2e specs that assert cues.
3. **Start the Classic low tier at boot on software GL, and remove the tier-drop stall.**
   - At READY, `TownGame.ts` can read `UNMASKED_RENDERER` from Phaser's own context (no extra context). On `auto`,
     apply `low` before the first resize when the string matches `SOFTWARE_GL` (`game3d/select.ts`). Add a public
     `forceLow()` to `fx/tier.ts`.
   - What it removes:
     - about 10–14 s of normal-tier frames after every join (26 renders/s, 12–14 % main);
     - the 1.0–1.3 s freeze when the tier drops (leftover 2).
   - The same stall can hit any real device whose tier auto-drops, or on any canvas resize where the capture target
     is re-created. Optimisation 1 should make it shorter: re-measure after it.
   - Files: `game/TownGame.ts`, `game/fx/tier.ts` (world-art).
   - Risk: low.
4. **Bring the lobby chunk back under the §7 growth rule (+3.2 → ≤ +2 KiB br).**
   - In a v2 lobby, every byte of these is dead weight: `game3d/select.ts` (4.6 KiB raw), `bootGuard.ts` (2.0),
     `GraphicsNotice`, `importTown3d` and the fallback wiring.
   - Options:
     - (a) a small static fast path in GameScreen, `world === 'v2' → classic`, and `import('../game3d/select')` only
       for v3 lobbies (LobbyRoute already awaits the v3 layout chunk before it mounts GameScreen);
     - (b) move `GraphicsNotice` and the fallback handling into the lazy part.
   - Expected −2 to −3 KiB br.
   - Files: `game/GameScreen.tsx`, `ui/lobby/LobbyRoute.tsx` (`mayUseV3`), `game3d/select.ts` (lead / WP0).
   - Risk: low-medium. The v2 path must stay synchronous, and the select decision-table tests stay.
   - Do it after C1, because it touches the renderer switch.
5. **Pre-render the seat markers in the gathered circle** (`gameplay/phaserView.ts:195-217`).
   - Today, each seat draws 2–3 `fillEllipse` plus 1 `strokeEllipse` every frame. With 15 players that is about 45
     earcuts of 33 points and about 1 500 `Vector2` allocations per frame, plus the voter pulse (`fillCircle`,
     `strokeEllipse`) during a vote.
   - Measured share: about a quarter of the gather window's busy time (§2).
   - Fix: build the three marker variants (normal, mine, dead) once with `generateTexture` and place Images; draw the
     pulsing "mine" glow as a scaled or alpha-tweened Image.
   - Expected about −1 % main on the low-tier proxy, about −2–4 % on a 60 fps phone. This is the vote phase, when
     everyone is watching.
   - Files: `game/gameplay/phaserView.ts` (world-art; WP0s split).
   - Risk: low (visual; `v2-look` covers the circle).
6. **Reduce the ClockChip DOM churn** (`apps/client/src/ui/clock/*`).
   - Set the chip's `title` only when the stage or paused state changes, and leave the per-second text as the only
     per-second mutation.
   - Expected −1/s DOM mutations and one fewer style invalidation per second while a timer runs; the phone walk goes
     back under the 6/s budget.
   - Risk: low. Keep `aria-label` stable.
7. **Skip the Phaser prefetch on the 3D path** (`ui/lobby/LobbyRoute.tsx warmTown`).
   - Every join prefetches `TownGame` (295.6 KiB br) before the world is known, so a player who will render 3D
     downloads Phaser for nothing.
   - The finder and JoinPreview already know `LobbySummary.world`. Pass it as a route hint and skip the Phaser
     prefetch when `world === 'v3'` and `mayUseV3()`. A Classic fallback still imports Phaser lazily.
   - Expected −295 KiB br on the 3D join path.
   - Files: `LobbyRoute.tsx`, `LobbyFinder.tsx` (lobby-auth / WP6).
   - This overlaps the v3 load front, so coordinate. It needs the wired v3 town to measure the real benefit.
8. **Lighten the v3 DOM skin on the load path** (`ui/common/v3atlas.ts`, art from read-only `v3/assets/ui/`).
   - Today the v3 skin adds 1.6 s to the Classic-in-v3 load on Slow 4G (§1).
   - Changes:
     - transcode the PNG sheets to lossless WebP at build time, with sharp as in
       `packages/assets/scripts/lib/encode.ts` and a PNG fallback through `@ct/assets/runtime`'s WebP probe;
       this typically saves 30–45 % of the PNG bytes on the day set (about 340 KB) and the night set (about
       118 KB);
     - fetch `panels.css` (83 KB of data: URIs) after the waiting room paints;
     - stop fetching the v2 portrait strip (59 KB) once the v3 strip is installed.
   - Files: `apps/client/build/*` and `vite.config.ts` (lead); `ui/common/v3atlas.ts` and `v3skinLobby.ts` (WP6).
   - Risk: low. Add a pixel-exact test like `atlas-encoding.test.ts`.
9. **Clock dial without earcut** (`TownScene.drawTownClock`).
   - Draw the wedge as a fan of `fillTriangle` calls from a cached unit circle (Phaser batches triangles directly,
     with no earcut), or bake the dial into a small texture when `clockKey` changes.
   - The measured gain is negligible: 0.05–0.2 % (leftover 1). Do it only if `TownScene.ts` is being edited anyway.
   - Risk: low (`v21-clock` e2e).
10. **Trim the rest of the texture memory, after optimisation 1.**
    - What remains: the ground bake (map-sized: 1712×592 = 3.9 MiB in v2, 1792×688 = 4.7 MiB in v3), `lightRT`
      (town-sized), the atlases (11.5 / 12.6 MiB, plus 6.8 MiB for cast-hd), and one canvas texture per Phaser Text.
    - Optional: drop the `terrain` GL texture after the ground bake (−3.1 MiB in v2, −4.1 MiB in v3) and re-upload it
      from the kept image only on context restore.
    - For v3, a further option: 85 % of the map's 4 816 tiles are unique (4 097 tiles in the atlas), so the
      generator could ship the baked ground as one WebP and skip the atlas and the bake.
    - Files: `TownScene.ts bakeGround`, `packages/assets/scripts/v3/classic.ts` (world-art / v3-world).
    - Risk: medium (the context-restore path; force `WEBGL_lose_context` in a test).
    - Dead code found on the way: `fx/quality.ts FxQualityController` has no caller.

## 4. Proposed `scripts/perf/budgets.mjs` changes

This front does not edit `budgets.mjs`; the lead integrates. Each value is the measured value plus about 20 %. The
`sw*` rows come from the SwiftShader proxy on the same host, measured under the locks with `classic-perf.ts`.

- `entryJsBrKiB = 45`: keep for now. Lower it to **40 after optimisation 2** (33.4 + 20 %), so the entry cannot
  quietly fill up again.
- `entryCssBrKiB = 15`: keep (11.5).
- `lobbyChunkBrKiB = 72`: keep (67.0).
- New `lobbyClosureBrKiB = 86`: LobbyRoute plus the static chunks it adds (71.8 in `wt2`). After optimisation 2 the
  audio chunk moves here, so re-baseline it to about 99.
- `townChunkBrKiB = 300`: keep. Only 4 KiB is left, so any growth in Classic must be paid for elsewhere.
- New `classicV3TownAtlasKiB = 700`: the Classic-in-v3 runtime atlas set (577.4); same rule as `townAtlasKiB`.
- New `swDesktopWalkMainPct = 6` (4.1–4.8 %).
- New `swMobileWalkMainPct = 14` (10.1–12.0 %).
- New `swGatherMainPct = 6` (4.1–5.0 %); tighten it after optimisation 5.
- New `swV3ClassicSceneMs = 21000`: Slow-4G time until the Classic scene is ready in a v3 lobby (17 767); the v2
  equivalent is 16 131.
- New `classicTexMiB = 175` (137–146 MiB of live textures on a 1440×900 desktop). Lower it to **55 after
  optimisation 1**.
- New `classicJoinLongTaskMs = 1500`: the longest task in the first 20 s after mount (1.0–1.3 s today). Lower it to
  **200 after optimisation 3**.
- New `classicRendersPerSecMin`: a *minimum*, so `budgets.mjs` needs a `min` mode. Low tier 28/s, normal 55/s.
- `mobileWalkDomMutPerSec = 6`: keep, but measure it with a running stage timer, which is what a real day looks like.
  Today that is 6.1–6.6/s, so it needs optimisation 6.
- Another front's budget, reported here: `town3dChunkBrKiB = 230` is exceeded by `head` (258.9) and `wt2` (262.6).

`budgets.mjs` can read `classic-perf.ts` output directly:
- the JSON keys `desktopWalk` / `mobileWalk` / `loadAuth` / `loadTown` match `--client` / `--load`;
- the script also writes `client-perf.json` next to `classic-perf-<world>.json`.

## 5. Tooling (new files only)

- `tests/perf/classic-perf.ts`: the runtime probe described above.
  - Options: `--world v2|v3`, `--only`, `--profile`, `--clock yes|no`, `--quality`, `--bots`, `--ports`, `--dist`.
  - Windows: `desktop-idle`, `desktop-walk`, `mobile-walk`, `gather`, `night-home`, `load`.
  - Software GL only; it refuses `--gpu`.
- `scripts/perf/classic-bundle.mjs`: compares bundles across trees, checks for leaks into the entry and lobby, and
  inventories the atlases (WebP dimensions → GPU MiB).
- `scripts/perf/classic-summary.mjs`: a side-by-side table of several `classic-perf` JSONs (`--md` for Markdown).
- `scripts/perf/classic-recon.sh`: runs a list of `classic-perf` runs (one per tree / world) inside one lock hold
  and logs the host load before and after each run.

How the sessions were run:
- The trees are `git archive` exports in `~/clocktower/work/v3-perf-classic-*`.
- The client builds are the bundle-report `outDir`s; the profile runs used
  `vite build --minify false --outDir /tmp/v3pc-head-nomin`.
- Each session was a single locked job:

```
CT_AGENT=v3-perf-classic scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock bash <job.sh>'
#   job.sh: bundle-report.mjs builds, then
#   flock $HOME/clocktower/browser.lock env WIN=15 bash scripts/perf/classic-recon.sh <out> \
#     "head-v3|v3-perf-classic-head|<dist>|v3|desktop-idle,desktop-walk,mobile-walk,gather,night-home,load|--clock no" …
node scripts/perf/classic-bundle.mjs --report v24=<a.json> --report head=<b.json> --atlases packages/assets/generated
node scripts/perf/classic-summary.mjs v24=<out>/v24-v2/classic-perf-v2.json head=<out>/head-v3/classic-perf-v3.json
pnpm exec tsx tests/perf/cpuprofile-summary.ts <out>/<run>/classic-v3-gather.cpuprofile --focus earcut,batchFillPath,fillEllipse,strokeEllipse,updateLighting,drawTownClock
```

Notes for whoever measures next:
- **Put a throwaway first window first.** The first window of a session catches the warm-up and tier drop
  (leftover 2). Either run `desktop-idle` first and do not count it, or wait for `canvas.renderScale` to settle. The
  session-1 "clock costs 7 %" result was exactly this artefact.
- **`networkidle` alone misses the atlases on software GL.** With software GL and 4× CPU, Phaser boots so slowly that
  Playwright's `networkidle` fires **before** the scene's preload starts. `client-perf.ts`'s `townNetworkIdleMs` then
  silently leaves the atlases out (session 1 recorded 11.9 s with no `.webp` request). `classic-perf.ts` now waits
  for the scene first (`__ctCamera` appears in `create()`) and reports `townSceneMs`. `client-perf.ts` needs the same
  wait (proposal; that file is unchanged).
- **Hollowmere has no open 180×180 px box near the square.** The walk window falls back to a tighter loop, or to a
  straight strip walked back and forth (`walkSpot.shape` in the JSON; v3 used `strip-x` at (272, 376)).
- **The bots do not path on v3.** Bots in `tests/support/bot.ts` plan paths on the v2 layout only, so
  `classic-perf.ts` teleports them outdoors and drives their `move`s on the lobby's own layout. WP7 owns the
  world-aware helpers.
- **Expect to wait for the heavy lock.** The two sessions waited about 1 h and 3 h 20 min; the lock is not FIFO. Put
  everything into one job.
