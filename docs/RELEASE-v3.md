# Clocktower Town v3.0

Status: **on the dev service only** (the host, port 3001, reached through `scripts/dev.sh`). Prod
(https://clocktower.chrisshi.com) still runs v2.4 until the user says otherwise. Gate and commands:
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
