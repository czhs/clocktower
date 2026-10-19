# v3 performance recon — front "net" (network, voice, lobby directory, static assets)

Agent `v3-perf-net`, 2026-10-18. Recon only: new measurement tools, a baseline, and a ranked list of
optimisations for the v3 performance swarm (runs after C1 wiring + C2 QA). No product code was changed.

## TL;DR

- **v3 lobbies cost the network exactly what v2 lobbies cost.** Same movement rules (`MOVE_HZ` 15, the shared
  `game/rules/movement.ts`), same server modules, same snapshot codec. Day walk, 1 ST + 15 players: S2C
  1413-1493 B/s per client in v3 vs 1440-1457 in v2; C2S 416-434 vs 395-450 B/s; server 1.8-2.4 % of a core in both.
  The v3 renderer adds nothing on the wire; the 3D work is all client-side.
- **Biggest wire lever: permessage-deflate is off** (`ws` default) and would save 56-61 % of S2C bytes in a day walk,
  74-77 % with pins, 77-81 % during a vote — but only with a threshold well below ws's default 1024 B (at 1024 almost
  every frame is smaller and nothing is compressed: 0-4 %).
- **Biggest server-side waste: voice revocation audits.** Every revoked LiveKit room is polled with
  `listParticipants` every 15 s for 20 min: **≈ 387 LiveKit API calls per minute per lobby** in a simulated game
  (1 ST + 15, house visits + phase rotations). The process reconciler already authorises every participant of every
  room once a minute.
- **Re-sent big payloads:** during a vote every client gets ~17 full `game:view`s (ST 10.9 KB, player 2.6 KB:
  ≈ 850 KB per vote per lobby); with pins on the board, every 1 s snapshot keyframe repeats all pins (S2C ×1.9).
- **v3 static assets:** the v3 UI atlases ship as PNG; lossless WebP of the same pixels is **71 % smaller**
  (923 → ~271 KiB, all sheets), and the WP4 overlay loader fetches the four night sheets at mount.
- Static caching on the dev service is correct (62-63 hashed `/assets/*`, all `immutable`, a missing chunk is a
  404 `no-store`, `index.html` `no-cache`). Reconnects are cheap (first views in 7-46 ms, ≈ 12-15 KB in 3 s).

## Tooling (new files only)

| File | What | Run (from the repo root on the editing machine) |
|---|---|---|
| `tests/perf/net-profile.ts` | One lobby per run (`--world v2\|v3`), N bots with `world:snap2` that walk on the lobby's **own** layout (v2 `townLayout` or `townLayoutV3`). Phases `lobby,walk,chat,social,vote,reconnect`: per-client S2C/C2S bytes and frames, per-type msgpack sizes/rates (ST and a player), frame-size histogram, which view paths changed between consecutive `game:view` / `lobby:view` copies, a per-connection permessage-deflate what-if (32 KiB dictionary = context takeover, level 1/6, no-context, thresholds 0/128/1024), server CPU (/proc), host load before/after, and per-reconnect cost (drop + token reconnect: time to first lobby:view/game:view/snapshot, bytes in the first 3 s, extra bytes to every other client). | `CT_AGENT=v3-perf-net scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock pnpm exec tsx tests/perf/net-profile.ts --world v3 --players 15 --secs 25 --ports 3496-3497 --out /tmp/ct-v3net/v3'` (`--phases walk --deflate no` for a quick, low-overhead walk) |
| `tests/perf/net-directory.ts` | Part A in process: `LobbyDirectory` with M lobbies / S subscribers — `update()` unchanged / changed fan-out (one `JSON.stringify` per subscriber, as today) vs one stringify per event (proposed), `list()` + snapshot cost, snapshot / resync / upsert sizes. Part B end to end: M lobbies (half v3), S raw SSE readers, J churn bots joining/leaving; per-stream events/s and bytes/s, snapshot bytes, idle vs churn server CPU, the client's 30 s resync GET. | `… pnpm exec tsx tests/perf/net-directory.ts --lobbies 30 --subs 60 --churn 6 --secs 30 --ports 3496-3497` (`--e2e no` = part A only) |
| `tests/perf/net-voice-bench.ts` | In process, no LiveKit: token mint µs/size; one lobby's real `VoiceCoordinator` (room epochs on, everyone wants voice, fake host/world/game as `apps/server/test/voice.test.ts`) over a simulated game (house visits, bedtime/night/dawn rotations) for the v2 and v3 layouts: grants/revokes per minute, grant bytes, **LiveKit RoomService calls per minute**, `voice.tick()` µs; the process reconciler's `runOnce()` with a simulated API RTT. | `… pnpm exec tsx tests/perf/net-voice-bench.ts --players 15 --minutes 20 --rtt 40` |
| `scripts/perf/net-static.mjs` | Read-only static audit. Live mode (GET/HEAD only; refuses port 3000): walks `index.html` and every `assets/*` URL referenced from fetched JS/CSS; status, Cache-Control, Content-Encoding, wire bytes and the brotli-11 / gzip-9 size an edge could ship; a missing hashed chunk must be 404 `no-store`. Dist mode: sizes per type, largest files, PNGs > 20 KiB, harness leakage, unhashed assets, three.js copies. | `CT_AGENT=v3-perf-net scripts/remote.sh node scripts/perf/net-static.mjs --base http://127.0.0.1:3001 --out /tmp/ct-v3net/static-dev.json` · `… --dist apps/client/dist --out …` |

Notes: tests/support/bot.ts plans paths on the v2 layout only (WP7 makes it world-aware); `net-profile.ts` has its
own `Walker` so v3 bots never walk into Hollowmere walls (14 server teleports in 19 300 moves, same in v2 and v3).
Per-type sizes are payload msgpack + type, as `server-profile.ts`; totals are raw WebSocket frame bytes.
The deflate CPU figure is an upper bound (dictionary priming per call).

## Baseline (what was measured, on which tree, how)

**Tree:** clean `git archive` of `v3-game` HEAD `4998ca5` ("v3 C1 WIP"), sandbox `v3-perf-net-clean` on the host,
server from TypeScript source (tsx, warm). The server/protocol/assets code of that commit is the code the wired
v3 town will talk to (C1 changes the client only). **Window:** all numbers below in one `flock v3-heavy.lock`
window, 2026-10-18 04:44-04:52 UTC; 1-min load average 9.5 at lock acquisition (other agents' unlocked work),
then 1.5 → 0.1 during the runs (per-phase before/after values are in the JSON).

### Per-client wire, 1 ST + 15 players, 25 s per phase (`net-profile.ts`)

| Phase | world | S2C B/s per client avg (ST) | S2C frames/s | C2S B/s (frames/s) | server CPU % core | deflate saved, thr 0 / 128 / 1024 (ctx, level 1) |
|---|---|---|---|---|---|---|
| lobby (waiting, walking) | v2 | 1406 (1405) | 11.3 | 406 (9.1) | 2.2 | 54 / 40 / 0 % |
| lobby | v3 | 1446 (1444) | 11.4 | 420 (9.3) | 2.3 | 54 / 42 / 0 % |
| day walk, run a | v2 | 1457 (2317) | 11.1 | 450 (9.7) | 1.8 | 56 / 45 / 3.5 % |
| day walk, run a | v3 | 1413 (2207) | 11.3 | 434 (9.3) | 1.8 | 56 / 42 / 3.3 % |
| day walk, run b (`--deflate no`) | v2 | 1440 (2201) | 11.1 | 395 | 2.3 | — |
| day walk, run b | v3 | 1493 (2249) | 11.2 | 416 | 2.4 | — |
| chat (1 line / 8 s / player) | v2 / v3 | 1555 / 1511 | 12.7 | 438 / 434 | 1.9 | 56 / 38 / 0 % · 56 / 35 / 0 % |
| social (point / 5 s, pin / 12 s) | v2 / v3 | 2744 / 2865 | 13.7-14 | 449 / 442 | 1.7-1.8 | 73 / 63 / 37 % · 74 / 64 / 39 % |
| vote (nomination, 14 hands) | v2 / v3 | 3146 (6719) / 2961 (6054) | 12 | 420 / 431 | 2.0-2.1 | 79 / 69 / 43 % · 77 / 69 / 42 % |

- The day-walk S2C is ≈ 97 % `world:snap2` (≈ 10.2 frames/s × 138-144 B); the ST additionally receives a stage
  `game:view` (9.6-10.4 KB) about every 10 s (`stage.players` presence changes). Matches the v2.4 budget value
  (`snapshotBytesPerSecPerClient` 1466, measured with `server-profile.ts`).
- Frame sizes in a walk: < 64 B 14 %, 64-127 B 25 %, 128-255 B 60 %, ≥ 4 KiB 0.04 % — that is why ws's default
  1024 B deflate threshold would do nothing.
- Estimated server compression CPU at threshold 0: 0.7-1.1 % of a core for the whole 16-client lobby (upper bound).
- Social: pins ride in the snapshot extras, and **every keyframe (950 ms) repeats every present extra**
  (`snapshotCodec.ts` `SnapshotEncoder.encode`), so `world:snap2` grows from 138 to 260-268 B avg (max 1.7 KB).
- Vote: `day.nominations` changed in 16-17 consecutive `game:view`s per client per vote; ST view 10.2-10.9 KB,
  player view 2.6 KB, both re-sent whole.
- Sizes (15 players): `lobby:view` 3.8 KB msgpack (5.0 KB JSON), ST `game:view` 10.2-11.0 KB, player `game:view`
  2.6 KB, decoded snapshot 1.4-1.5 KB vs a `snap2` delta frame of ~100 B.

### Reconnect (4 per world; abrupt drop, 1.5 s later Colyseus reconnect by token, as `net/room.ts` does first)

| | v2 | v3 |
|---|---|---|
| reconnect call → resolved | 3-4 ms | 3-4 ms |
| first `lobby:view` / `game:view` | 7-45 / 7-46 ms | 34-43 / 34-44 ms |
| first `world:snap2` | 36-50 ms | 31-79 ms |
| bytes to the reconnecting client in its first 3 s | 12.0-15.0 KB (lobby:view 3.7, game:view 2.7, snap2 ≈ 5.3 = the normal stream) | 11.8-14.5 KB |
| extra bytes to EACH other client (drop + reconnect: 2 × lobby:view + 2 × game:view for `connected`) | 6.0-7.2 KB | 5.0-7.5 KB |
| server CPU in the 3 s window (incl. the ≈ 2 % baseline ≈ 60 ms) | 70-80 ms | 60-70 ms |

Messages on reconnect: notebook:data, world:teleport, voice:unavailable, lobby:view, game:view (2 when an
announcement is active), snap2 RESET. Cheap; nothing v3-specific. (A v3 client does not remount the town on a
reconnect: `GameScreen` effect B is keyed on the `RoomConnection`, which survives.)

### Lobby directory / SSE (`net-directory.ts`)

| Measurement | Value |
|---|---|
| upsert event (one `LobbySummary`, v3) | 431 B (418 B without `world`: +13 B, 3 %) |
| snapshot event at connect / 30 s resync GET body | 10.4-11.2 KB at 30 lobbies; 22.4 KB at 60 |
| e2e, 30 lobbies (half v3), 60 streams, 6 churn bots (3.1 joins/s) | 5.9 upserts/s and **2240 B/s per stream**; 134 KB/s for all 60 streams; server 4.2 % core (idle with the same 30 lobbies + 60 streams: 2.6 %) |
| client resync (`net/api.ts subscribeDirectory`: full `GET /api/lobbies` every 30 s while the stream is healthy) | 10.4 KB per stream / 30 s = 350 B/s per stream (≈ 16 % on top of the churn stream; 100 % of the traffic of a quiet directory); 20.8 KB/s for 60 streams |
| idle cost of a lobby with one connected member (24 Hz room tick) | ≈ 0.09 % of a core per lobby (2.6 % for 30) |
| `list()` + snapshot JSON (in process) | 23.6 µs at 30 lobbies, 41.4 µs at 60 |
| `update()` with an unchanged summary (every `lobby:view` flush calls it) | 2.1-2.2 µs |
| fan-out per changed summary, stringify per subscriber vs once | **not measured yet**: the first run's numbers (2.1 vs 0.9-1.9 µs) are invalid — the bench mutated the directory's own summary, so nothing was published. Fixed in the tool; the re-run waited ≈ 2.5 h for the heavy lock and was withdrawn. Re-run: `net-directory.ts --e2e no --lobbies 30 --subs 60` and `--lobbies 60 --subs 200` |

### Voice (`net-voice-bench.ts`, in process)

| Measurement | v2 layout | v3 layout |
|---|---|---|
| token mint (HS256 JWT) | 19.3 µs (smoke run under load: 37.9 µs); token 480 B; `voice:grant` 686 B | same |
| grants / revokes per minute per lobby (1 ST + 15; each member visits a house every 45-105 s for 15-30 s in the day; 6 min day, 1 bedtime, 2 night, 1 dawn per 10 min) | 22.7 / 24.7 | 22.2 / 24.0 |
| `voice:grant` bytes per minute per lobby | 14.3 KB | 13.9 KB |
| **LiveKit `listParticipants` calls per minute per lobby** (revocation audits) | **387.7** | **387.1** |
| LiveKit `removeParticipant` per minute | 24.7 | 24.0 |
| `voice.tick()` | p50 0.06 µs, p99 13 µs, max 1.8 ms; ≈ 0 % core | p50 0.06, p99 10 µs, max 0.7 ms |
| reconciler `runOnce` at 40 ms API RTT (sequential `listParticipants`) | 8 rooms: 9 calls, 365 ms · 40 rooms: 41 calls, 1.66 s · 120 rooms: 121 calls, 4.9 s | — |

Zones are layout-driven but v3 changes nothing: outdoors is one broadcast `square` zone everywhere
(`packages/voice/src/zones.ts outdoorZone`), interiors are `bld:<id>`.

### Static assets (`net-static.mjs`)

- **Dev service (127.0.0.1:3001, v2.4 build, read-only GETs):** 63 `/assets/*` files reached from `index.html`,
  all hashed, all `public, max-age=31536000, immutable`; `index.html` `no-cache`; a missing hashed chunk → 404
  `text/plain` `no-store`; origin sends no Content-Encoding (Cloudflare compresses at the edge; the brotli-11 sizes
  are in the JSON). Totals reached: JS 2503 KiB raw / 606 br, CSS 154 / 33, WebP 1686, PNG 2758 (PNG twins of the
  WebP atlases are referenced too but only fetched as a fallback), fonts 293.
- **v3 UI atlases** (`v3/assets/ui/*.png`, `scripts/perf/image-encode.py`, sizes are deterministic):

  | sheet | PNG KiB (shipped) | WebP lossless KiB | loaded by |
  |---|---|---|---|
  | cast-portraits | 126 | 45 | `ui/common/v3atlas.ts` (day set) |
  | portraits / -night | 92 / 92 | 36 / 36 | v3atlas (night lazily) + `game3d/overlay/atlas.ts` (both at mount) |
  | emotes | 85 | 19 | v3atlas |
  | events / -night | 17 / 17 | 4 / 4 | overlay (both at mount) |
  | indicators / -night | 15 / 15 | 4 / 4 | v3atlas + overlay |
  | markers / -night | 8 / 8 | 2 / 2 | v3atlas + overlay |
  | hud, hud-night, notebook, notebook-night, panels, social, kit, hud-font, markers-v2size* | 476 together | 116 | not imported by the client today |
  | **all 20 sheets** | **923** | **≈ 271 (−71 %)** | |

  What a v3 lobby fetches at mount today ≈ 475 KiB of PNG (day + the overlay's four night sheets); as WebP with the
  night sheets deferred ≈ 115 KiB. PNG is not compressed further by the edge.
- **Not measured yet:** the v3 HEAD dist audit (`net-static.mjs --dist apps/client/dist` after
  `pnpm --filter @ct/client build` under the heavy lock): queued ≈ 2 h behind other agents' browser jobs and
  withdrawn. It checks hashed names / harness leakage / three.js copies of the v3 build; the per-chunk brotli sizes are
  the load front's `scripts/perf/v3-bundle.mjs`.

## Ranked optimisations

| # | Optimisation | Files (owner) | Expected gain | Risk | Needs C1 / game3d |
|---|---|---|---|---|---|
| 1 | **permessage-deflate on the game WebSocket** with a low threshold: `new WebSocketTransport({ perMessageDeflate: { threshold: 64, zlibDeflateOptions: { level: 1, memLevel: 7 }, serverMaxWindowBits: 13, concurrencyLimit: 4 } })`. Then re-measure with real compression (`net-profile.ts` totals become compressed bytes). Verify Cloudflare Tunnel keeps `Sec-WebSocket-Extensions` end to end on the dev hostname (browser devtools → WS response headers). | `apps/server/src/app.ts` (lead); review `guard/socketBudget.ts` (HOST-11, counts must stay per frame / inflated bytes; ws `maxPayload` applies to inflated size) | S2C −45…−56 % in walks, −64…−74 % with pins, −70…−79 % in votes (what-if at thr 0/128); for a phone: ≈ 1.45 → ~0.7 KB/s | Medium: zlib memory ≈ 64-256 KB per connection (window/memLevel tunable), ≤ 1 % core per 16-client lobby (est.), compression-oracle review (chat text shares a context with the viewer's private view; needs an on-path observer), tunnel passthrough unverified | No |
| 2 | **Voice revocation audits**: gate the per-room 15 s `listParticipants` polling with ONE `listRooms` per interval per process (skip rooms with `numParticipants` 0 / absent), back off 15 → 30 → 60 → 120 s, and stop a room's audit once the reconciler has authorised it (it already lists + authorises every participant of every room each `reconcileMs`). | `apps/server/src/voice/coordinator.ts` `scheduleAudit` / `runAudits`, `voice/reconciler.ts` (voice) | LiveKit API calls ≈ 387 → < 20 per minute per lobby (−95 %); fewer outbound HTTPS requests per process; avoids LiveKit API rate limits with several lobbies | Medium (VOICE-9 security: an intruder with a still-valid token must still be found within ≈ 15-60 s; keep the first audit at +15 s) | No |
| 3 | **Snapshot keyframes repeat every extra** (pins, doors, doorTags, you) every 950 ms: send extras only when changed; keyframes replace the entity set only. New join capability `snap: 3`, old clients keep `2`. | `packages/protocol/src/snapshotCodec.ts` (lead), `apps/client/src/net/room.ts`, tests in `packages/protocol/test` | social phase S2C −40…−45 % (2.8 → ~1.6 KB/s), walks −5…−10 % | Low-medium (codec + decoder state; existing round-trip tests) | No |
| 4 | **Vote / nomination churn**: ~17 full `game:view`s per client per vote (ST 10.9 KB, player 2.6 KB; ≈ 850 KB per vote per lobby). Send a per-viewer `game:day` patch (the viewer's own `viewFor(pid).day` + changed top-level keys) when only `day`/`log`/`announcements` changed. | `apps/server/src/rooms/GameRoom.ts flushViews` (lobby-auth), `packages/protocol/src/game.ts` (lead/rules), `apps/client/src/net/store.ts` | vote S2C −80…−90 % (ST 6.0-6.7 → < 1.5 KB/s); smaller if #1 lands (deflate already −78 % here) | Medium (secrecy: patches stay per-viewer projections; client merge) | No |
| 5 | **v3 UI atlases as lossless WebP** (same pixels): convert at import time (`scripts/v3/import-assets.sh` → a non-vendor generated dir, or a CONTRACT-REQUEST for the pixel3d bake) and import those in the loaders. | `scripts/v3/import-assets.sh` (v3-qa), `apps/client/src/ui/common/v3atlas.ts` (WP6), `apps/client/src/game3d/overlay/atlas.ts` (WP4) | first v3 mount −320 KiB (≈ 475 → ≈ 155 KiB), all sheets −650 KiB; on Slow 4G ≈ −2.5 s | Low (lossless; check WebP decode in Safari 14+, CSP `img-src` unchanged) | Yes (loaders are game3d / WP6 files) |
| 6 | **Overlay atlas loads the 4 night sheets at mount** (132 KiB PNG) — load them at golden hour like `v3atlas.ts` `ready(night)` does; better: delegate to `v3atlas.ts` (its own CONTRACT-REQUEST) so the same sheet is decoded once, not twice. | `apps/client/src/game3d/overlay/atlas.ts` (WP4) | −132 KiB PNG (−46 KiB as WebP) off first mount; one decode of each shared sheet (≈ −0.8 MiB RGBA: portraits + indicators + markers are decoded by both loaders today) | Low | Yes |
| 7 | **Directory resync**: `subscribeDirectory` GETs the whole list every 30 s even while the SSE stream is healthy; resync only after `es.onerror` / a reconnect (or every 5 min). | `apps/client/src/net/api.ts` (lead) | −350 B/s per open finder at 30 lobbies (−750 B/s at 60); −20.8 KB/s server egress for 60 streams; 100 % of a quiet directory's traffic | Low | No |
| 8 | **Directory fan-out**: `publish()` makes every stream stringify the same event; stringify once per event in `service.ts publish` (pass the line) and coalesce a lobby's upserts to ≤ 2 Hz (trailing edge) while it fills or empties. | `apps/server/src/directory/{service,http}.ts` (lobby-auth) | CPU per event ∝ 1 instead of ∝ S (to be measured, see the directory table); fewer upserts in join bursts (5.9/s per stream at 3 joins/s) | Low | No |
| 9 | **`lobby:view` on every connection change**: a drop + reconnect sends 2 full `lobby:view`s (3.8 KB) + 2 `game:view`s to everyone (5-7 KB per other client). A small `lobby:member` delta would do. | `GameRoom.ts` (lobby-auth), protocol (lead) | −85 % of reconnect fan-out; minor overall | Low-medium | No |
| 10 | **Reconciler**: `runOnce` lists participants room by room (40 rooms × 40 ms = 1.7 s); use `numParticipants` to skip rooms the coordinators fully account for, and a small concurrency (4). | `apps/server/src/voice/reconciler.ts` (voice) | runs 4-10× shorter; fewer API calls | Low | No |
| 11 | **talkerCap** (decode only the N loudest): wire `apps/client/src/voice/talkerCap.ts capStep` into `VoiceEngine.tickGains` after the cull. Outdoors is one `square` room for everyone (v2 and v3), so a 16-player lobby decodes up to 15 Opus tracks. Needs the human test below first. | `apps/client/src/voice/VoiceEngine.ts` (voice) | phone downlink with 10 simultaneous talkers ≈ 240 → ≤ 144 kbps (cap 6), proportional Opus/WebAudio CPU; nothing while ≤ 6 people talk (DTX) | Medium (first syllables of a newcomer; LiveKit active-speaker for unsubscribed tracks) | No |

Not worth doing on this front: snapshot rate / quantisation (95 % of a walk is already ~140 B frames at 12 Hz),
C2S movement (≈ 420 B/s, identical v2/v3), voice tick / mint (≈ 0 % core), static cache headers (correct),
token-reconnect path (single-digit ms).

Product question surfaced (not a perf change): v3's camera shows only part of Hollowmere, but voice outdoors is one
broadcast `square` for the whole town (the v2 rule, "the town is one screen"). If v3 should bring back proximity
(`street`), the existing client cull (`policy.ts cullStep`) starts to matter and the talker cap matters less.

## talkerCap — human test design (real LiveKit; NOT run)

Goal: decide whether `capStep` (default max 6, holdMs 4000, minOnMs 3000) can be wired. Run on the **dev service**
(real LiveKit keys there), one lobby, by the user with friends or own devices; nothing on the host GPU.

Setup
- 1 ST + ≥ 9 players: ≥ 2 phones (one mid Android, one iPhone), the rest laptops. Talkers can be laptops running
  Chrome with `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<speech>.wav` (a looping
  numbered reading, "one, two, three…") on the participants' OWN machines.
- Build flag for the test only (voice owner): `localStorage['ct.debug.talkerCap'] = '<N>'` (0 = off) and the voice
  debug overlay (`ct.debug.voice`) extended with: subscribed / culled / capped per participant, `isSpeaking`,
  `audioLevel`, last `TrackSubscribed` time, and a log ring buffer with `performance.now()` timestamps of
  speaking-started, `setSubscribed(true)`, `TrackSubscribed`, first `inbound-rtp packetsReceived > 0` (getStats).
- Everyone outdoors (the `square` room).

Cases (each 3 min, cap on vs off, alternating)
1. **Active speaker for unsubscribed tracks** (the key assumption): cap = 1, two talkers alternate every 10 s.
   Pass: the capped talker's `isSpeaking` turns true within 500 ms of their talk spurt in ≥ 95 % of spurts
   (LiveKit `ActiveSpeakersChanged` keeps arriving for participants we do not subscribe to).
2. **Resubscribe latency**: cap = 2 with 3 alternating talkers. From the log: speaking-started → first audio
   packet. Pass: p50 ≤ 300 ms, p95 ≤ 600 ms; listener notes the first number heard (≤ 1 word lost).
3. **Phone load**: 10 talkers at once (fake-audio laptops), phone listener, cap 6 vs off: inbound audio kbps
   (getStats `bytesReceived` delta), number of subscribed tracks, Chrome remote-devtools performance monitor CPU on
   Android / Safari Web Inspector timeline on iOS, battery temperature after 3 min. Pass: kbps ≤ 6 × 24 (+ overhead),
   CPU −30 % or better, no audio glitches reported.
4. **Flapping**: two groups of 4 talking in turns for 3 min. Pass: ≤ 6 `setSubscribed` toggles per minute per
   listener; nobody reports clipped first words more than once.
5. **Storyteller pinned**: 8 talkers + ST talking: the ST is always decoded on every client.
6. **Restore**: walk into a house and back out, toggle mode (announce): every track this client capped is
   resubscribed when leaving the room / mode change (no permanent silence).

Record the numbers + device list in `docs/test-results.md` and decide `max` (6 or lower on phones).

## Proposed `scripts/perf/budgets.mjs` keys

(budgets.mjs is not edited here; values = measured + ~20 % slack unless marked as a target after the change.)

- `v3SnapshotBytesPerSecPerClient = 1800` (v3 day walk 1413-1493 B/s, `net-profile.ts --world v3 --phases walk`; same reading as `snapshotBytesPerSecPerClient`)
- `v3VsV2S2CPct = 115` (v3/v2 walk ratio 97-104 %; guards a v3-only regression on the wire)
- `c2sBytesPerSecPerClient = 540` (395-450 B/s walking, both worlds)
- `socialS2CBytesPerSecPerClient = 3400` today (2744-2865); target **2000** after #3
- `voteStS2CBytesPerSec = 8000` today (ST 6054-6719 B/s); target **2000** after #4
- `reconnectBytesFirst3sKiB = 18` (11.8-15.0 KB)
- `reconnectFirstViewMs = 250` (7-46 ms locally; headroom for a loaded host)
- `reconnectOtherClientBytes = 9000` (5.0-7.5 KB per other client per drop + reconnect)
- `sseBytesPerSecPerStream30 = 2700` (2240 B/s at 30 lobbies, 3 joins/s); target −16 % after #7
- `sseSnapshotKiB60 = 27` (22.4 KB at 60 lobbies)
- `voiceLivekitCallsPerMinPerLobby = 30` — **target after #2** (today 387: would fail; enable with the fix)
- `voiceMintUs = 100` (19-38 µs)
- `staticAssetsNotImmutable = 0`, `staticMissingChunkNot404 = 0` (dev service today: 0 / 0)
- `v3UiAtlasMountKiB = 200` — target after #5/#6 (today ≈ 475 KiB PNG at mount)
- `wsDeflateSavedPctWalk >= 40` — after #1, measured from real compressed frames (needs a `min` budget type)

## Commands run (all on the host via `scripts/remote.sh`; results as observed)

Sandboxes: `v3-perf-net-clean` = `git archive 4998ca5` + the new tool files (no other change). Ports 3496-3497.

1. `CT_AGENT=v3-perf-net scripts/remote.sh sh -c 'uptime; nproc; …'` — first sync of the shared tree; ok (load 11.7, 12 cores).
2. `CT_AGENT=v3-perf-net-clean scripts/remote.sh sh -c 'pnpm exec tsx tests/perf/net-profile.ts --world v3 --players 5 --secs 5 --phases walk,reconnect --reconnects 1 …'` — smoke, unlocked, not a measurement; exit 0.
3. `… node scripts/perf/net-static.mjs --base http://127.0.0.1:3001 …` — first run flagged `/assets/town-D67moh1p.js` 404: a regex bug in the tool (matched the prefix of `town-D67moh1p.json`); fixed; re-run: 63 assets, 0 non-200, all checks ok.
4. `… tsx tests/perf/net-voice-bench.ts --players 6 --minutes 2 --rtt 5` — smoke failed in the reconciler part (`invalid voice room epoch`, tool bug: epoch must match `[a-z0-9]{4,16}`); fixed; re-run ok.
5. `… tsx tests/perf/net-directory.ts --lobbies 4 --subs 6 --churn 2 --secs 5` — smoke ok.
6. `… pnpm exec tsc -p tsconfig.netperf.json` (temp config in the sandbox: tests/tsconfig.json + the 3 new files + tests/support) — 2 errors (script id `trouble_brewing`, histogram tuple typing), fixed; re-run exit 0.
7. `… flock $HOME/clocktower/v3-heavy.lock sh run-net.sh` (waited 39 min for the lock) — net-profile v2-a, v3-a (all phases), v3-b, v2-b (walk, `--deflate no`), net-directory 30/60/6 e2e, net-directory part A 60/200, net-voice-bench 15 players / 20 min / 40 ms: **all exit 0**. Two tool bugs found in the results and fixed afterwards: `viewChurn` in the JSON file was the last phase's object (per-phase values taken from the log lines), and the part-A "changed" fan-out bench never published (it mutated the directory's own summary).
8. `… python3 scripts/perf/image-encode.py v3/assets/ui/*.png` (unlocked: deterministic sizes) — table above.
9. `… sh -c 'pnpm exec tsc -p tsconfig.netperf.json && … flock $HOME/clocktower/v3-heavy.lock … net-directory.ts --e2e no --lobbies 30 --subs 60 … --lobbies 60 --subs 200'` — tsc ok; the locked part never got the lock (≈ 2.5 h queue) and was withdrawn (killed my own waiting `flock`): **not run**.
10. `… flock $HOME/clocktower/v3-heavy.lock … pnpm --filter @ct/client build; node scripts/perf/net-static.mjs --dist apps/client/dist` — build never got the lock, withdrawn; the dist audit then failed with "no dist" (expected): **not run**.

Raw JSON/logs of the window: on the host under `/tmp/ct-v3net/base/` (`v2-a`, `v3-a`, `v2-b`, `v3-b`, `dir30`,
`dir60bench`, `voice`) and `/tmp/ct-v3net/static-dev.json` — not committed (tmp; copy into `tests/perf/results/` if
the lead wants them kept).
