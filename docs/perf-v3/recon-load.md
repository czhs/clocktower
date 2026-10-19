# v3 perf recon — front "load" (v3-perf-load, 2026-10-17)

Scope: the v3 LOAD PATH from "join a v3 lobby" to the first 3D frame and the first input that moves the avatar —
the lazy `town3d` chunk and three.js tree-shaking, the vendor import rewrites, the `layoutV3` chunk, every fetch
(chunks, atlases, roster, sprites: count, bytes, caching headers, hints), the warm-up (programs, long tasks, the
room and avatar builds before `ready`) and time-to-first-v3-frame / time-to-interactive on a slow CPU.
Recon only: no product file was changed. Numbers below are labelled with the tree and the method they came from.
Contract: `docs/v3/INTEGRATION.md` §1.1, §1.3, §7; v2 budgets: `scripts/perf/budgets.mjs`.

## Tooling (new files only)

| File | What | Run (on the host, from the worktree) |
|---|---|---|
| `scripts/perf/v3-bundle.mjs` | Builds `apps/client` with its own `vite.config.ts` (like `bundle-report.mjs`) and reports the v3 load path in brotli KiB: `town3d` chunk, the mount closure (town3d + new static deps beyond entry + LobbyRoute), `layoutV3`, `v3atlas`, every lazy chunk reachable from the mount classified as piece / interior / character / shared / optional (smear, fx), per-module attribution (estimated: module share of the chunk's rendered length × chunk brotli), three.js kept-vs-original, v3 assets (atlases) with sizes, checks (raw `.js` assets, three copies, harness files, three/pixel3d/game3d leaks into entry/LobbyRoute), and a fetch-waterfall model (serial vs parallel pieces at a given RTT / bandwidth). `--three-src` resolves three to `three/src/Three.js` for per-area attribution (which three modules survive). `--out-dir` keeps the build for `v3-load.ts`. | `CT_AGENT=v3-perf-load scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock node scripts/perf/v3-bundle.mjs --json /tmp/v3b.json --out-dir $HOME/clocktower/work/<agent>-out/dist'` |
| `tests/perf/v3-load.ts` | One headless Chromium on SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, never GPU flags), own server on `--ports` (default 3486-3487) serving `--dist`. A Storyteller bot creates a `world:'v3'` lobby, `--bots` (14) players join; the browser joins as a fresh player with `ct.debug.v3force=1`, `ct.debug.camera=1`, `ct.fxQuality=low`. CDP Slow 4G (150 ms, 1.6 Mbit/s) + CPU ×4 by default. Records in-page milestones (canvas, `__ctCamera.v3().ready`, loading overlay gone, first frame after ready, first frame the avatar moved after a `KeyD` press = TTI), long tasks before/after ready, frame times for 3 s after ready, JS heap, programs / calls / tris, every response (bytes, `Cache-Control`, timing) and — with `--bundle <v3-bundle.json of the same dist>` — chunk labels and the number of serial piece steps. A second, cached visit (`--warm yes`) isolates CPU from network. Once WP2 is wired it also reports `avatars` (every bot pid has `__ctCamera.avatar(pid)`). | `CT_AGENT=v3-perf-load scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock flock $HOME/clocktower/browser.lock timeout 1500 pnpm exec tsx tests/perf/v3-load.ts --dist <dist> --bundle /tmp/v3b.json --out /tmp/v3-load'` |

Both write JSON (`--json` / `--out`). A clean tree for a baseline: `git archive HEAD | tar -x -C <scratch>`, copy
`ops.local.env` into it and run that copy's `scripts/remote.sh` under its own `CT_AGENT` (what this recon did).
Neither tool deletes its temp build dir when `--out-dir` is not given (same as `bundle-report.mjs`).

## Baseline

Tree **`4998ca5`** ("v3 C1 WIP": WP0/WP0s/WP5a + WP3 stage wired into `TownGame3d.ts`; WP1/WP2/WP4 NOT wired, so the
3D town draws the town, the stub `wanderer` own avatar and no remote avatars or overlays). Build: `vite build` via
`v3-bundle.mjs` (deterministic: two builds gave the same `town3d-wzEqEpcU.js`). Host load average before/after each
window is in the run notes below; every number was taken while holding `v3-heavy.lock` (+ `browser.lock` for the browser).

### Bundle (brotli KiB, `v3-bundle.mjs`, tree 4998ca5)

| Item | Now | Contract §7 | Note |
|---|---|---|---|
| entry JS | 44.23 | ≤ 45 | 98 % of budget |
| LobbyRoute | 66.98 | ≤ 72 | |
| **town3d chunk** | **258.86** | ≤ 230 | **over** (C0: 222). Mount closure = town3d + `movement` (1.7) = 260.5 |
| layoutV3 | 4.05 | ≤ 25 | |
| v3atlas (UI skin chunk) | 3.05 | — | |
| pieces (21, all in BUILD_ORDER) | 165.26 | — | + 7 lazy shared chunks 34.86 (kit, trees, water, flowers, keeper, hound, mannequin) |
| interiors (15) | 86.36 | — | max house-0 8.92 |
| lazy town total (pieces + interiors + shared + smear/fx) | 298.44 | ≤ 800 | |
| characters (34 spec chunks) | 158.04 | per chunk ≤ 22 | max owl 5.97 |
| smear + fx (optional, high tier) | 11.96 | — | |
| Classic TownGame (Phaser) | 295.58 | (v2 ≤ 300) | **downloaded in v3 joins too** (below) |
| checks | raw `.js` assets 0, three copies 1, harness files 0, no three/pixel3d/game3d in entry or LobbyRoute | 0 / 1 / 0 | ok |

town3d attribution (est. br KiB): three 133.3 · pixel3d/chars 39.1 (rig 12.6, locomotion 9.5, look 7.1, character 6.2)
· pixel3d/town 24.9 · pixel3d/town/interiors 11.1 (kit 8.4, index 2.7) · **`demo/roster.json` 9.6** · pixel3d/demo
8.8 (time.js 6.3) · post 6.1 · town/life 5.9 · core 5.2 · game3d 9.3 (world 3.6, root 3.4, vendor 2.3) · materials 3.3
· game/rules 1.7 · world 1.3 · three addons 1.0 (+ ConvexHull/ConvexGeometry 2.5 in a lazy chunk).

**three tree-shaking** (`--three-src`, same tree): 263 three source modules survive, 981 of their 1062 KiB rendered,
≈ 142 KiB br (production build: 942 of 1314 KiB of `three.module.js` rendered = 72 %, 133 KiB br). By area:
renderers/webgl 38.5, renderers/shaders (ShaderChunk/ShaderLib GLSL) 25.5, math 19.2, WebGLRenderer 11.0, core 7.9,
geometries 6.9, extras 6.8 (PMREMGenerator 3.1), objects 4.3, **webxr 3.9**, materials 3.7, extras/core + curves 4.9
(Shape/Path for ExtrudeGeometry), cameras 2.0, textures 1.5, lights 1.1. Addons: BufferGeometryUtils 1.0,
ConvexHull 2.4, ConvexGeometry 0.1. Verdict: the vendor's `import * as THREE` is shaken fine (no `THREE[name]`
lookups); what is left is WebGLRenderer's fixed closure (all ShaderLib programs, WebXRManager, PMREM). Only a custom
three build could go lower (≈ 5-15 KiB br); not worth it now.

### Runtime (`v3-load.ts`, tree 4998ca5, SwiftShader, CPU ×4, Slow 4G, local server = uncompressed, 1280×720, tier low, 1 ST + 14 player bots)

| Milestone (ms from navigation) | Cold | Warm (HTTP cache) |
|---|---|---|
| LobbyRoute chunk done | 3 760 | 242 |
| town3d request start / end | 4 960 / **18 043** | 1 214 / 1 216 |
| layoutV3 done | 5 563 | 1 215 |
| pieces first start / last end (21 pieces, **20 serial steps**) | 18 153 / 34 407 | 1 537 / 11 778 |
| canvas | 18 161 | 1 549 |
| **ready** (= loading overlay gone) = time to first v3 frame | **42 083** | **18 832** |
| first frame after ready | 42 210 | 18 900 |
| **TTI** (first frame the avatar moved; key pressed at ready) | **42 243** (key→move 91 ms) | 18 941 (58 ms) |
| long tasks before ready: n / sum / max | 26 / 17.9 s / **6.8 s** | 23 / 17.3 s / 6.6 s |
| top long tasks (start → dur) | 34 765 → 6 808 (stub avatar + warm-up renders/compiles), 29 711 → 4 086 (foliage build), 18 855 → 2 691 (ground build), 23 924 → 1 308 | same pattern |
| frames 3 s after ready p50 / p95 / max | 16.7 / 100 / 283 ms | 16.7 / 100 / 2 900 ms |
| JS heap at ready | 202 MiB | 202 MiB |
| programs / calls / tris | 41 / 196 / 249 680 | 41 / 196 / 249 608 |
| requests / bytes (after LobbyRoute) | 129 / 4.66 MB (123 / 4.33 MB) | 129 / 5 KB |

Host load average (1/5/15 min) around the window: before 4.74 6.26 7.15, after cold 5.42 6.26 7.11, warm before
8.41 6.90 7.27 / after 6.05 6.46 7.11 (lock taken at 21:59:30 with 5.38 6.47 7.23). The host is shared: treat
SwiftShader/CPU-×4 numbers as **relative** (before/after), never as device frame times.

What the cold waterfall shows (uncompressed bytes; production is behind the edge with brotli, ≈ 3.5-4.5× smaller for JS):
1. **Phaser is downloaded in a v3 join.** `warmTown()` (`ui/lobby/LobbyRoute.tsx:43`) imports `game/TownGame` before
   the lobby's world is known: `TownGame-*.js` (1.30 MB raw / 296 KiB br) runs 3 796 → 19 423 ms, in parallel with
   `town3d` (4 960 → 18 043 ms), which alone needs ≈ 5 s at this bandwidth. It is also *evaluated* (module top level).
2. **The piece waterfall.** `buildTown` (`v3/pixel3d/src/town/town.js buildTown`, `for … await buildPiece`) imports
   one piece chunk per piece, after the previous piece is BUILT: 20 of 21 steps start after the previous ended.
   Cold 16.3 s vs warm 10.2 s for the same CPU work → ≈ 6 s of the cold time is round trips + transfer that could
   have overlapped the builds. Model (`v3-bundle.mjs`, br bytes, 150 ms RTT, 1.6 Mbit/s): 4.4 s serial vs 1.4 s parallel.
3. Further serial steps on the critical path: the stub/own avatar spec (`wanderer`, requested 34 550, after the
   town) and the warm-up room (`interior:house-0`, requested 41 569, after the 6.8 s warm-up task) — each one more
   round trip + build before `ready`.
4. `town3d` itself starts only after `lobby:view` (ticket + WebSocket join, ≈ 1.2 s after LobbyRoute).
5. Atlases / portraits in a v3 join: v3 `cast-portraits.png` 127 KB **and** v2 `cast-portraits.webp` 60 KB **and**
   `cast-hd-portraits.webp` 93 KB, `portraits.png` 93 KB (after ready), `panels.css` 81 KB (27 KiB br, data URIs), six
   atlas JSON manifests 144 KB raw (≈ 17 KiB br). No duplicate URLs. Every `/assets/*` response is
   `public, max-age=31536000, immutable`; `/art/ui/*.png` and `/audio/*` are 1 day + SWR (same as v2). 23 audio cues
   (≈ 200 KB) are fetched right after `ready`.
6. Warm runs show a single 2.7-2.9 s rAF gap within 3 s after `ready` with no main-thread long task (all three
   trees): most likely a GPU-process stall on SwiftShader (a lazily compiled program or a large upload); check with
   `v3().programs` before/after on real hardware before chasing it.
7. The vendor fetches nothing else at runtime (all textures procedural; `roster.json` is inlined by the build patch).
8. Warm (all cached) is CPU-bound: ≈ 10 s of piece builds (ground 2.7 s, foliage 4.1 s, house-4 1.3 s at CPU ×4 on
   SwiftShader) + a 6.6 s stub-avatar + warm-up task (SwiftShader compiles 41 programs on the CPU; on a real GPU the
   link time is the device's, typically 10-30 ms per program).

### Experiment: items 1 + 2 below, measured (scratch copies of 4998ca5, never the worktree)

Two `git archive` copies with measurement-only edits, same tools and profile, one lock window (lock 01:30:22, load
10.99 9.68 9.73; after 7.51 8.41 9.17 / 8.39 8.08 8.84):
- **expA** = `game3d/vendor/town.ts` gets an `import.meta.glob` of `v3/pixel3d/src/town/pieces/*.js` + `life/index.js`
  that imports every piece at town3d evaluation, plus `import()` of `town/interiors/house-0.js` and
  `characters/wanderer.js` (same module ids as the vendor's own imports, so the same chunks).
- **expB** = expA + `warmTown()` without the `game/TownGame` import (simulates a world hint saying v3).

| | baseline | expA (prefetch) | expB (prefetch + no Phaser) |
|---|---|---|---|
| cold ready (= first v3 frame) | 42 083 ms | **37 737** (−4.3 s) | **31 902** (−10.2 s) |
| cold TTI (avatar moved) | 42 243 | 37 871 | 32 030 |
| town3d end | 18 043 | 17 971 | **12 836** |
| pieces first start → last end | 18 153 → 34 407 | 18 025 → 22 112 | 12 890 → 16 219 |
| serial piece steps | 20 | **0** | 0 |
| interior house-0 / own spec fetched | 41 569 / 34 550 | 18 110 / 18 111 (parallel) | 12 984 / 12 985 |
| cold bytes / requests | 4.66 MB / 129 | 4.57 MB / 129 | **3.33 MB** / 125 |
| warm ready | 18 832 | 18 532 | 18 655 |
| long tasks before ready (sum / max), cold | 17.9 s / 6.8 s | 17.6 s / 6.6 s | 17.5 s / 6.7 s |
| programs / heap at ready | 41 / 202 MiB | 41 / 215 | 41 / 202 |

So both fixes work as predicted and do not change the CPU work (warm ready and long tasks unchanged). After them the
cold path is town3d's download (4.6 → 12.8 s here, uncompressed ≈ 1 MB) followed by ≈ 15.7 s of main-thread CPU
(piece builds ≈ 10 s, then the 6.7 s stub-avatar + warm-up task) on SwiftShader at CPU ×4: the next wins are item 3
(start town3d earlier), item 5 (warm-up) and item 9 (vendor build CPU).

## Ranked optimisations

Expected gains are for the cold join above (Slow 4G, CPU ×4) unless noted; "needs C1" = touches `game3d/**` or
can only be measured on the wired town (avatars/overlays drawn).

1. **Fetch every BUILD_ORDER piece (+ its shared chunks) in parallel, as soon as town3d loads.** The vendor's
   `buildTown` awaits `import()` of each piece after building the previous one (20 serial steps measured). Game-side
   fix, no vendor edit: in `game3d/vendor/town.ts` (WP3) start
   `import.meta.glob(['../../../../../v3/pixel3d/src/town/pieces/*.js', '…/town/life/index.js'])` for all keys
   before `buildTown` (same module ids → the same chunks; piece modules only declare functions at top level, so
   evaluating them early is cheap). Alternative: the `api.js` patch in `apps/client/build/pixel3dImports.ts` (lead)
   also exports `__ctPrefetchPieces()`. Better still, call it from the lobby-time prefetch (`useLobbyLayout`, next to
   the `TownGame3d` prefetch). **Measured −4.3 s cold** (42.1 → 37.7 s, serial steps 20 → 0; model in brotli bytes: −3.0 s at 150 ms RTT, ≈ −0.8 s
   at 40 ms RTT); warm unchanged. Risk: low (a failed prefetch is re-tried by the real import). Files:
   `apps/client/src/game3d/vendor/town.ts` or `apps/client/build/pixel3dImports.ts`; needs C1: no for the fix, yes for
   the final number. **Experiment above.**
2. **No Phaser download/evaluation in a v3 join.** `warmTown()` (`apps/client/src/ui/lobby/LobbyRoute.tsx:43`)
   always imports `game/TownGame` (296 KiB br, 1.3 MB raw) before the world is known; in a v3 join it competes with
   `town3d` for bandwidth and CPU (measured: town3d took 13 s instead of ≈ 5 s). Fix: pass a world hint into the route
   (the lobby list / `JoinPreview` already know `world`, WP6: `ui/lobby/finder.ts`, `LobbyFinder.tsx`,
   `JoinPreview.tsx`) and prefetch the matching renderer; with no hint (shared link), defer the Classic prefetch to the
   first `lobby:view` (+ `chooseRenderer()` says classic) — a v2 join then starts Phaser ≈ 1 s later (still in
   parallel with HUD/voice chunks; measure with `client-perf.ts --only load`). The Classic chunk is still fetched on a
   fallback. **Measured −5.8 s cold on top of item 1** (37.7 → 31.9 s; town3d done at 12.8 s instead of 18.0 s; −1.24 MB raw /
   −296 KiB br per v3 join; ≈ −1.5 s at 1.6 Mbit/s with brotli in production). Risk: low-medium (v2 join timing; keep the immediate prefetch when the
   hint says v2). Files: `ui/lobby/LobbyRoute.tsx` (lead), `ui/lobby/{finder.ts,LobbyFinder.tsx,JoinPreview.tsx}`
   (WP6, in flight), `main.tsx` route state (lead). Needs C1: no. **Experiment above.**
3. **Start `town3d` + `layoutV3` with the join, not after it.** With the same world hint, `LobbyRoute` can begin
   `import('../../game3d/TownGame3d')` and `ensureLayout('v3')` (gated on `mayUseV3()`) in parallel with the ticket
   and WebSocket join instead of waiting for `lobby:view` (measured gap LobbyRoute end → town3d start ≈ 1.2 s).
   Expected −0.5…1.2 s. Risk: low. Files: `ui/lobby/LobbyRoute.tsx`. Needs C1: no.
4. **Take the remaining serial fetches off the critical path.** (a) the own avatar's spec chunk (`wanderer` today;
   after C1 the player's cast spec, plus `chars/smear.js` + `chars/fx.js` on `high`) — start `preloadSpecs()` for
   every member's cast id from `lobby:view` at mount (or in the lobby), not when the avatar layer first sees them
   after the town build (`game3d/avatars/layer.ts` `preload`); (b) the warm-up room `interior:house-0`
   (`world/stage.ts warmUp` → `rooms.load(0)`, requested only after the 6.8 s warm-up task) — prefetch its chunk at
   mount, or warm the interior programs after `ready` in an idle slot (the interior switch already hides behind a
   transition). Expected −0.3…0.6 s cold (2 round trips + the room build before ready). Risk: low. Files:
   `game3d/world/stage.ts`, `game3d/world/interiors.ts`, `game3d/avatars/layer.ts`, `game3d/vendor/characters.ts`.
   Needs C1: yes.
5. **Warm-up cost (the 6.6-6.8 s main-thread task before ready on SwiftShader).** It covers the stub avatar build +
   `stage.warmUp` (2 frames, 3 dais showcase frames, `warmWholeTown`, the room) — synchronous program compiles and
   full pipeline renders. Options: `renderer.compileAsync(scene, camera)` (three r170, uses
   `KHR_parallel_shader_compile`) for the town and the room before the showcase frames, so linking runs on the
   driver threads and the main thread keeps the spinner alive; render the 3 dais showcase states at a reduced
   resolution or only the passes that compile new programs; keep `programs` constant (41 here). Expected:
   device-dependent (real GPUs: 0.4-1.2 s of link time for 41-63 programs; on SwiftShader most of the 6.8 s), main
   thread responsive during load. Risk: medium (custom passes / `onBeforeCompile` patches must compile identically;
   verify `programs` before/after and the first-interior hitch). Files: `game3d/world/stage.ts`,
   `game3d/vendor/town.ts` (`warmViews`), `game3d/vendor/engineHost.ts`. Needs C1: yes (measure with avatars).
6. **15-player rig builds after `ready`.** WP2 builds one rig per frame (55-90 ms + 25-40 ms first update on the
   vendor's reference machine, `avatars/queue.ts`); 14 remote players + NPC folk = ≈ 2 s of > 100 ms frames on a
   laptop, ≈ 7-8 s at CPU ×4. Options: build the in-view remote rigs behind the loading overlay up to a time budget
   (e.g. 1.5 s), schedule the rest with a per-frame deadline (skip a build when the frame is already over budget), and
   prefetch every member's spec chunk in the lobby (item 4a). Expected: smooth first seconds after ready; TTFF +≤ 1.5 s
   if the budget is spent before ready (trade-off for the user/lead). Risk: medium. Files: `game3d/avatars/{layer,queue}.ts`.
   Needs C1: yes — `v3-load.ts` reports `marksMs.avatars` (all bot rigs present) and post-ready long tasks once
   `__ctCamera.avatar` exists.
7. **Shrink the `town3d` chunk back under its budget** (258.9 KiB br vs 230; C0 was 222; WP1/WP2/WP4 wiring will add
   more). (a) `demo/roster.json` (9.6 KiB br) is inlined whole by the `roster.js` patch, but the game only reads
   `meta.name` (`demo/characters.js createCharacter`); make the patch import a trimmed roster (id, name and the
   offer flags) through a virtual module — −9 KiB br, risk low, file `apps/client/build/pixel3dImports.ts` (lead).
   (b) `town/interiors/{index,kit}.js` (11 KiB br) are static imports of `game3d/vendor/interiors.ts`: load them with
   the first room (they are only needed by the warm-up room, item 4b) — −11 KiB br off the first chunk, risk low,
   needs C1 (WP3 files). (c) check `demo/time.js` (6.3) + `town/life/{folk,ceremony}` pulled statically by the time
   facade. Expected total −20 KiB br (≈ −0.1 s at 1.6 Mbit/s; mostly budget hygiene). 
8. **v3 atlases and portraits.** In a v3 join the client downloads the v2 `cast-portraits.webp` (60 KB) and
   `cast-hd-portraits.webp` (93 KB) as well as the v3 `cast-portraits.png` (127 KB) and `portraits(.png|-night)`;
   gate the v2 strips off when the v3 strip is the portrait source (`ui/common/castPortrait.ts`, WP6). The v3 sheets
   are PNG (v2 ships lossless WebP via `scripts/perf/image-encode.py`): converting at build time (or asking the
   pixel3d session to bake WebP, CONTRACT-REQUEST) saves ≈ 25-35 % of ≈ 460 KB. `panels.css` (27 KiB br, data URIs)
   is linked per v3 lobby: fine once cached. Expected −150…300 KB per cold v3 join, not on the first-frame path
   (atlases load in parallel / after ready). Risk: low. Files: `ui/common/{castPortrait,v3atlas,v3portrait}.ts`,
   `game3d/overlay/atlas.ts`, a build step. Needs C1: partly (overlay atlas).
9. **Vendor build CPU (warm path, 10 s at CPU ×4 on SwiftShader).** ground 2.7 s, foliage 4.1 s, house-4 1.3 s
   long tasks: synchronous geometry generation inside the pieces. Game side can only yield between pieces (already
   async) or build behind the overlay. CONTRACT-REQUEST(pixel3d): cheaper grass/foliage builds (instancing, cached
   geometry), and a build that yields inside the big pieces. Expected: the largest remaining warm-path cost; vendor
   work. Risk: n/a here.
10. **three.js.** Not worth a custom build now: the floor is WebGLRenderer's closure (≈ 134-142 KiB br incl. 25.5
    KiB of GLSL, WebXR 3.9, PMREM 3.1). Addons are 3.5 KiB. Keep the one-copy check.
11. **Post-ready fetches.** 23 audio cues (≈ 200 KB) and `portraits.png` start at `ready` and share the link with the
    first remote rigs' spec chunks; schedule the cue preload in idle time (same as v2; `game/audio`). Low gain, low risk.

Not problems: caching (`/assets/*` immutable, chunks content-hashed and deterministic between builds, so a vendor
re-publish only invalidates changed pieces), no duplicate URLs, no raw character `.js` assets, one three copy, no
v3 code in the entry/LobbyRoute closures, `layoutV3` 4 KiB.

## Proposed `scripts/perf/budgets.mjs` keys

Values = measured on 4998ca5 + headroom, or the post-fix target where the fix is cheap. The runtime keys are
**relative** SwiftShader numbers (same tool, same profile: Slow 4G, CPU ×4, local uncompressed, 1280×720, low tier,
1 ST + 14 bots, `v3-load.ts` defaults) and must be re-baselined once C1 draws avatars and overlays.

| Key | max | Unit | Source | Why |
|---|---|---|---|---|
| `town3dChunkBrKiB` | 270 | KiB br | v3-bundle `summary.town3dChunkBrKiB` | 4998ca5: 258.9 (contract said 230, C0 222); C1 adds WP1/WP2/WP4; target ≤ 250 after item 7 |
| `v3MountBrKiB` | 275 | KiB br | `summary.town3dMountBrKiB` | town3d + its new static deps (260.5) |
| `v3LayoutBrKiB` | 8 | KiB br | `summary.v3LayoutBrKiB` | 4.05 (contract ≤ 25 is loose) |
| `v3FirstPaintLazyBrKiB` | 240 | KiB br | `piecesBrKiB + sharedLazyBrKiB` | 165.3 + 34.9 = 200.1, all fetched before the first frame |
| `v3LazyTownBrKiB` | 360 | KiB br | `summary.lazyTownTotalBrKiB` | 298.4 (contract ≤ 800) |
| `v3CharacterMaxBrKiB` | 8 | KiB br | `summary.maxCharacterBrKiB` | 5.97 owl (contract ≤ 22) |
| `v3CharactersBrKiB` | 190 | KiB br | `summary.charactersBrKiB` | 158.0 for 34 specs |
| `v3ClassicChunkInV3Join` | 0 | requests | v3-load cold: rows labelled `classic:TownGame` | 1 today (item 2) |
| `v3PieceSerialSteps` | 3 | steps | v3-load cold `network.pieces.serialSteps` | 20 today (item 1) |
| `v3ColdReadyMs` | 50 000 now → 38 000 after items 1-2 | ms | v3-load cold `marksMs.ready` | 42 083; expB measured 31 902 |
| `v3WarmReadyMs` | 23 000 | ms | v3-load warm `marksMs.ready` | 18 832 (CPU-bound path) |
| `v3ColdTtiMs` | ready + 500 | ms | v3-load cold `ttiMs` | 42 243 (key→move 91 ms) |
| `v3KeyToMoveMs` | 250 | ms | `keyToMoveMs` | 91 / 58 |
| `v3ColdBytesMB` | 5.5 now → 4.0 after item 2 | MB (uncompressed) | `network.bytes` | 4.66 MB incl. 1.33 MB Phaser; expB 3.33 MB |
| `v3WarmupLongTaskMaxMs` | 8 200 | ms (SwiftShader) | warm `longTasks.beforeReady.maxMs` | 6 559; relative only (SwiftShader compiles on the CPU) |
| `v3ReadyHeapMiB` | 250 | MiB | `heapMiB.ready` | 202 (low tier) |
| `v3Programs` | 45 | programs | `v3.programs` at ready | 41 at low tier on 4998ca5 (WP2 smoke: 63 with rigs; re-baseline at C1) |
| `v3AvatarsReadyMs` | (measure at C1) | ms after ready | `marksMs.avatars - marksMs.ready` | needs `__ctCamera.avatar` |

Proposed `budgets.mjs` wiring (qa-deploy/WP7 owns the file; not edited here): add `--v3bundle <v3-bundle.json>` and
`--v3load <v3-load.json>` inputs; read `summary.*` from the first and `results.find(r => r.run === 'cold'|'warm')` from
the second, mapping the keys above. Existing keys stay as they are (`entryJsBrKiB` 44.23 / 45 and
`lobbyChunkBrKiB` 66.98 / 72 on 4998ca5).

## Commands run (this recon)

All on the host via `scripts/remote.sh` (heavy commands under `flock $HOME/clocktower/v3-heavy.lock`, the browser
also under `browser.lock`). Clean trees = `git archive HEAD` exports of 4998ca5 in a scratch dir, each with its own
`CT_AGENT` (`v3-perf-load-head`, `-head3`, `-run`, `-expA`, `-expB`).

| Command | Result |
|---|---|
| `CT_AGENT=v3-perf-load scripts/remote.sh sh -c 'pnpm exec tsc -p <temp tsconfig over tests/perf/v3-load.ts>'` | clean after one typing fix |
| `node --check scripts/perf/v3-bundle.mjs` | ok |
| `node scripts/perf/v3-bundle.mjs --json /tmp/v3pl-head-bundle.json --out-dir …` (head) | 1st attempt failed (`three/package.json` not exported; fixed), 2nd ok (build 8.8 s; console output truncated in transit, JSON complete) |
| `node scripts/perf/v3-bundle.mjs --three-src --json …/head-three-src.json` (head3) | ok (lock 21:59:14, load 5.89 6.61 7.29 → 5.38 6.47 7.23) |
| `node scripts/perf/v3-bundle.mjs --json …/run-bundle.json --out-dir …/run-dist` + `tsx tests/perf/v3-load.ts --dist …/run-dist --bundle …/run-bundle.json --ports 3486-3487` (run) | ok, exit 0, 0 page errors; tables above |
| expA / expB: `node scripts/perf/v3-bundle.mjs --json …/expX-bundle.json --out-dir …/expX-dist` + `tsx tests/perf/v3-load.ts --dist …/expX-dist --bundle …/expX-bundle.json --ports 3486-3487` (one lock window for both) | all four exit 0, 0 page errors; experiment table above |

Raw outputs on the host: `~/clocktower/work/v3-perf-load-out/{run,expA,expB}-{bundle.json,load/v3-load.json}`,
`head-three-src.{json,txt}`; head bundle JSON `/tmp/v3pl-head-bundle.json`.
