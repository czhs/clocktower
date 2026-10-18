# Clocktower Town v3.1

Status: **tagged `v3.1` on `v3-game`, deployed to the dev service** (the host, port 3001, reached through
`scripts/dev.sh`). Prod still runs v3.0 (`4be9bb4`) until it is shipped there (docs/progress.md "v3 handoff").
Gate and commands: docs/test-results.md "v3.1 release gate". Contract and decision log: docs/v3/INTEGRATION.md §11.

v3.1 is a fix and perf release on top of v3.0: three v3.0 known issues fixed, a draw-call cut for the town, the C2 QA
round's vote-camera finding fixed, and the cpu tier profiled to its real cost.

## Fixed
- **No more `TypeError … 'isReady'` page error** (v3.0 known issue). The avatar pre-warm no longer uses three's
  `compileAsync`, whose uncancellable poll timer could read a disposed program after a rebuild, a leave or a cast
  change. `avatars/precompile.ts` compiles, then polls on its own and stops when the body is dropped, the layer is
  destroyed or the 3 s pre-warm deadline passes. New e2e `v3-pageerrors` (8 bots join and leave at the high tier, a GL
  context loss forced while an avatar compiles): it failed with the TypeError on v3.0 and passes on v3.1 (0 page errors).
- **Remount memory leak.** One destroyed town (~80-95 MB of JS heap) stayed alive for good: the vendor life module's
  `stats.at` getter closure held the whole build scope, and V8 kept that closure through the `stats` literal's shared
  layout. A build-time patch (`apps/client/build/pixel3dImports.ts`, fails the build on vendor drift) moves the getter to
  module level. Harness `?mode=cycles` (5 mounts, 2 rebuilds, an injected crash), SwiftShader: heap **15.4 → 97.1 MB
  (FAIL) before, 15.4 → 20.3 MB (+4.7 MB, PASS) after**; on the host GPU growth 95 MB → 6.6 MB, 0 engines retained.
- **DOM churn at bedtime and while walking** (v3.0 known issue). The countdown renders one m:ss string per shown
  second, the clock chip ticks once a second, and culled labels / house names are parked off-canvas with one transform
  write instead of visibility flips. 15 players, 1440×900, high: bedtime DOM UI writes **25.9 → 9.1 /s**, non-transform
  writes **35.3 → 9.3 /s**; walk non-transform writes **11.7 → 2.4 /s**.
- **The vote camera clears the real HUD** (C2 QA, HIGH). The voting-circle frame used to dodge fixed corner sizes only,
  so the Storyteller panel (a third of a laptop screen), the open chat, the vote and voice cards and the "Your home" chip
  covered seats, the nominee and the Storyteller. It now measures the HUD that is actually over the canvas on vote
  entry and on resize (`world/hudKeep.ts`), keeps the circle's paving edge inside the canvas and may zoom out further
  to fit (up to 2.4× the content size).
- **No house-name pills in the vote view** (C2 QA). Foreground houses' name pills projected into the circle, over the
  player labels, repeating a seated player's name.
- **A softer talking outline** (C2 QA art check). The speaking avatar no longer washes out: billboard lift 0.3 → 0.12,
  rig base lift 0.15 → 0.06, rim band 0.85 → 0.44 and thinner.

## Faster
- **Fewer draw calls for the town.** The static town-kit meshes of all buildings, props, ground and foliage are merged
  into 7 `BatchedMesh`es (one per kit material and shadow flag) at build time, culled once per frame; animated pieces
  leave the batch on their first change. Same-frame harness A/B at 960×540: square by day **272 → 201** draws (low),
  **343 → 264** (high); vote **395 → 295** (low), **459 → 348** (high); at most 8 low-res texels per still differ. In the
  live frame (14 remotes walking, 1920×1080): high **351 → 293** draws (−17 %), shadow 84.6 → 66.9; low 240 → 195 (−19 %).
  Cost: main-thread render JS **+0.3 to +0.7 ms per frame** on the host. Switch: `ct.debug.v3merge=0` turns it off.
- **cpu tier: profiled, not faster.** Still about 190 ms per synced frame / 7.6-7.8 fps on SwiftShader (960×540, 14
  remotes). The cost is not the toon shading but the vendor cut-away code on every town material (SwiftShader runs
  every branch); see docs/perf-v3/cpu.md §7. The only default change is a pixel-identical program rewrite (the ground's
  unused intro-flight branches compiled out); the material twins are opt-in (`ct.debug.cpuShade`).
- Bundles: `town3d` 270.4 → 282.7 KiB br (merge + precompile + hudKeep); new budget key `town3dChunkBrKiB` ≤ 300.
  Entry JS 44.1/45, entry CSS 12.3/15, LobbyRoute 68.5/72, TownGame 281.4/300 KiB br.

## Known issues (v3.1)
- **cpu tier misses its goal** (7.6-7.8 fps against ≥ 20). Next lever: a cheap cut-away at the cpu tier (CONTRACT-REQUEST
  in INTEGRATION.md §9.2), then character LOD.
- **The town batch costs main-thread time** (+0.3-0.7 ms per frame on the host). It still needs an A/B on a laptop iGPU
  at 1440×900 DPR 2; if the main thread loses there, it will default off.
- C2 QA findings not fixed yet (docs/progress.md "v3 handoff"): a black disc over the market stall at bedtime; the own
  avatar hidden behind the banister in Stargazer's Tower (house-0); the porch gable half-faded over the avatar after
  leaving house 5; the block marker is weak without the pennant; a navy slab outside the clock tower room; no "rejoin
  your game" in the finder; the clock chip still counts "Nominations close" after an execution.
- The `v3-pageerrors` context-loss step never fires on the host GPU (no KHR_parallel_shader_compile); the
  disposed-during-compile case is covered by unit tests only.
- Phones: not supported in v3 (a note says so); use `/v2/`.

# Clocktower Town v3.0

Status: **on prod since 2026-10-18 13:45 PDT** (https://clocktower.chrisshi.com, `4be9bb4`), and on the dev service
until v3.1 replaced it there. Gate and commands:
docs/test-results.md "v3.0 release gate". Contract and decision log: docs/v3/INTEGRATION.md.

v3 moves the game into the pixel3d three.js town, Hollowmere. The rules, the Storyteller tools, voice and
the secrecy model are the same as v2.

## The town
- **Hollowmere, the pixel3d three.js town, is the real game at `/`.** Every lobby created at `/` is a
  Hollowmere lobby, drawn in 3D with pixel-art post-processing: 15 cottages, the square with
  the voting circle, and the clock tower. Players walk; nobody is moved automatically.
- **v2 "Classic" lives at `/v2/`.** The world comes from the URL path. Lobbies made at `/v2/` are the
  v2 town, unchanged, and a share link opens the right app. There is no town picker any more.
- **A v3 loading screen:** the Hollowmere title card with walking characters and a progress bar.
  It covers boot, joining and the town build. `/v2/` keeps the old "Lighting the lamps…" lines.
- **The voting circle without candles:** the per-seat candle stakes, flames, wisps, halos and pennants
  are gone. The vote has its own camera framing (±45° yaw, 23° pitch). The clock hand points at the
  current voter's stone, and a lamp lights for each yes vote.
- **The tower clock is the Storyteller's timer.** The clock tower dials show the day clock, and the HUD
  clock chip reads the same time.
- **The clock tower can be entered.** It is a 16th building with its own room, and it is never shown
  as "Nobody lives here".
- Everything from v2 carries over to the 3D town: avatars with ghosts, lanterns and talking outlines;
  name labels, DOM chat bubbles, pins, pointing, the pie menu, door boards, house names and seat
  markers.
- **If the 3D town fails** (no WebGL, a lost GPU context that cannot be rebuilt, a chunk that cannot
  load), the same lobby falls back in place to the Classic 2D renderer.

## Devices
- **Laptops first.** Integrated GPUs, DPR-2 screens and 120-165 Hz panels are the target.
- **Phones are not supported yet.** A note says so on the loading screen and the `/` finder (coarse
  pointer and a short side under 600 px). `/v2/` still works on phones.
- **No GPU:** a `cpu` quality tier is picked automatically on software GL (SwiftShader, llvmpipe).
  It is playable but not smooth yet (see Known issues).

## Faster (v3 perf swarm, numbers from docs/perf-v3/*.md)
- **60 fps render cap** on high-refresh displays (`perf.ts` `V3_MAX_FPS`, a phase-locked frame gate).
  A 120-165 Hz panel no longer renders 2-3x the frames: unthrottled high went from 640 to 60 rendered
  fps. At ≤ 78 Hz nothing changes. (learnings.md §3.1)
- **`cpu` tier** for software GL: a 320×180 internal target, a 30 fps cap, no shadows, no normal pass,
  and unlit materials. On SwiftShader at 960×540 with 14 remotes, `low` measured 1199 ms per synced
  frame, 3.1 fps and 466 ms input → motion; `cpu` measures **194 ms, 7.6 fps and 109 ms** (6.2x cheaper).
  The step-down chain is high → low → cpu → Classic. (cpu.md)
- **Low tier shadow cadence:** the shadow map is redrawn every 2nd frame, and at once on a camera cut.
  Draw calls went from 244.6 to 221.4 per frame, shadow calls from 46.5 to 23.3 and triangles from 351k
  to 302k. Also, a per-frame regex over all 16 buildings is gone. (stage.md §3)
- **Smaller download:** the `town3d` chunk went from 309.5 to 270.4 KiB br. The roster is inlined
  trimmed and the room modules load lazily. Every town piece, the room chunk and the warm-up room are
  fetched in parallel instead of in 20 serial round trips. Collision checks allocate nothing. The v3 UI
  atlases are WebP: 442.5 → 149.3 KiB. (commit "v3 perf(client)", net.md)
- **Server and network:** in a 15-bot v3 lobby, the Storyteller's `game:view` during a day walk went
  from 38-48 to 9 KB/s (−78 %). S2C per client dropped from 3956-4542 to about 2230 B/s. Escort
  planning is 65-70 % cheaper, the longest door route `findPath` went from 1612 to about 270 µs, and
  snapshot fan-out p50 went from 131 to 90 µs. LiveKit calls per lobby went from 440 to 31.8 a minute.
  WebSocket permessage-deflate is opt-in (`WS_DEFLATE=on`; off by default because it costs about 45 %
  more server CPU). (server.md, net.md)
- **DOM UI:** measured at about 0.3 % of the main thread in a 15-player game. Two small fixes landed:
  no layout read in a timer, and no whole-document restyle from unchanged CSS variables. (ui.md)
- The shipped bundle budgets still hold: entry JS 43.9/45, entry CSS 12.3/15, LobbyRoute 68.3/72,
  and TownGame 281.1/300 KiB br.

## Known issues
- **The `cpu` tier misses its goal:** 7.6 fps against a target of ≥ 20 fps. The main remaining cost is
  the vendor toon shader (cpu.md §4).
- **Phones:** not supported in v3, only a note. Use `/v2/` on a phone.
- **`v3-doors` e2e is flaky:** in WP8 the keyboard walker stuck once on the way to house 5 and passed
  on the rerun. The cause is not found yet.
- **Bedtime countdown churn:** about 26 DOM writes/s, from two countdowns re-rendering 4 times a
  second (ui.md). It is cheap, but the fix is planned.
- **The block pennant was removed** along with the candle stakes. The nominee/execution pulse on the
  stone, the short hand and the overlay still mark who is on the block.
- Classic UI-driven e2e specs that create lobbies from `/` need `CT_E2E_BASE_PATH=/v2`. Only `doors`
  and `chat-bubbles` were re-run for this release.
- **An uncaught `TypeError … 'isReady'`** can show in the console at the high tier: three.js `compileAsync`'s
  poll timer hits an avatar material that lost its program (avatars `prewarm`). The avatar still shows after
  the pre-warm timeout. It was seen twice in the dev smoke.
- Open review items: docs/v3/INTEGRATION.md §11 "C1 review fix round" (deferred low findings).
- **Not merged yet (v3.1):** the remaining work on the cpu, client and server perf branches, C2 QA (art
  checks and the full v3 e2e on GPU and SwiftShader), and the plan in docs/perf-v3/learnings.md.
