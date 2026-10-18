# v3 performance — front "net" (network, voice, lobby directory, static assets)

Agent `v3-perf-net`, 2026-10-18. Scope: v3 only (user: "I only care about perf of v3 now, v2 is fine"). Since the
URL-path decision every lobby created at `/` is a v3 (Hollowmere) lobby, so the server-side changes below are what
v3 games pay; v2 lobbies (`/v2/`) get them too, unchanged in behaviour. Recon and tooling: `docs/perf-v3/recon-net.md`.

## TL;DR (measured before / after, one exclusive `v3-heavy.lock` window)

| What (1 ST + 15 players, v3 lobby unless noted) | Before | After | Change |
|---|---|---|---|
| S2C **wire** bytes per client, day walk | 1547 B/s | 733 B/s | **−53 %** |
| S2C wire per client, social (points + pins) | 2778 B/s | 896 B/s | **−68 %** |
| S2C wire per client, nomination + vote | 4448 B/s | 902 B/s | **−80 %** |
| Server CPU for the lobby (whole process, % of one core) | 2.0-2.4 % | 3.2-3.6 % | +1.2 pp (compression) |
| LiveKit RoomService calls per minute per lobby (simulated game, honest clients) | 413 | 30.4 | **−93 %** (23.6 of the 30 are the unavoidable `removeParticipant`s) |
| … same without `listRooms` (fallback path) | 413 | 139.6 | −66 % |
| Process reconciler run at 40 ms API RTT, 40 / 120 rooms | 1662 / 4903 ms | 447 / 1259 ms | −73 / −74 % (same call count) |
| Directory fan-out of one changed lobby, 30 lobbies / 60 streams | 50.7 µs | 4.1 µs | −92 % |
| … 60 lobbies / 200 streams | 163.3 µs | 5.3 µs | −97 % |
| Directory resync GET per open finder (healthy stream, 30 lobbies) | 11.2 KB / 30 s (373 B/s) | 11.2 KB / 5 min (37 B/s) | −90 % (computed from the cadence) |
| v3 UI atlases in the built client (8 sheets reached from `index.html` at HEAD) | 442.5 KiB PNG | 149.3 KiB WebP | **−293 KiB (−66 %)**; all 10 client sheets 476 → 158 KiB |
| Reconnect (first view / payload in the first 3 s / extra bytes to each other client) | 17-47 ms / 16.2-18.6 KB / 5.4-7.7 KB | 32-44 ms / 15.7-18.1 KB / 4.9-7.0 KB | unchanged (noise) |

Static caching was already right and stays right (171 hashed `/assets/*` reached, all `immutable`, 0 unhashed,
`index.html` `no-cache`, a missing chunk = 404 `no-store`, one three.js copy, no harness files in `dist/`).

## What changed (files, owners)

1. **permessage-deflate on the game WebSocket** — `apps/server/src/app.ts` (lead), `apps/server/src/config.ts`
   (lead, new env `WS_DEFLATE=on|off`, default `on`). `threshold: 64`, `serverMaxWindowBits: 15`, zlib level 1,
   memLevel 8, `concurrencyLimit: 4`. Why these: 99 % of the S2C frames of a walk are < 256 B (12 Hz `world:snap2`
   deltas of ~140 B), so ws's default threshold (1024 B) compresses nothing, and without context takeover the saving
   is ~3 %. An 8 KiB window (`serverMaxWindowBits: 13`, memLevel 7) was measured too: same walk / social saving,
   but 71 % instead of 80 % in a vote (the Storyteller's ~10 KB `game:view` copies no longer fit the window).
   Memory ≈ 256 KiB deflate + ~40 KiB inflate per socket (64 sockets at `LOBBY_MAX_COUNT` 4 × 16 ≈ 19 MiB).
   Safety: ws enforces `maxPayload` (24 KiB) on the inflated size; the HOST-11 socket budget meters the inflated
   message bytes (it sits on the `ws` `message` event), so a compressed flood is metered like an uncompressed one.
   Clients that do not offer the extension, or a proxy that strips `Sec-WebSocket-Extensions`, get the old
   uncompressed frames. Node's global WebSocket (undici, used by every bot/test client) and browsers negotiate it.
2. **Voice revocation audits** — `apps/server/src/voice/coordinator.ts` (voice). Before: every room a member was
   revoked from was `listParticipants`-ed every 15 s for 20 min (room epochs make many distinct names ⇒ ≈ 390
   calls / min for one busy lobby). Now each audit run asks ONE `listRooms` (shared by every lobby of the process,
   cached ≤ 5 s, failures not cached): empty / gone rooms cost nothing; a room with more participants than grants
   (someone kept a revoked token) is listed at once; every other occupied audited room is listed 15 s after a
   revocation, then 30 s, then every 60 s (`auditBackoffMaxMs`, new tuning field); a new revocation or an intruder
   resets it. Without `listRooms` (test doubles) or when it fails: every due room, with the same back-off.
   Detection guarantees (tests): a revoked member that stays connected — next run (≤ 15 s); an intruder joining an
   empty / dead room — next run; an intruder hiding behind a granted member who is not connected (participant count
   == grants) — ≤ 60 s + one run (measured 60-75 s bound in the test), and the 60 s process reconciler also lists it.
3. **Reconciler** — `apps/server/src/voice/reconciler.ts` (voice): up to 4 rooms' `listParticipants` in parallel
   (was sequential), rooms with `numParticipants === 0` skipped before the loop. Same calls, ~4× shorter runs.
4. **SSE directory fan-out** — `apps/server/src/directory/http.ts` (lobby-auth): `sseLine(e)` serialises an event
   once (WeakMap keyed by the event object the directory hands to every stream) instead of once per stream.
5. **Directory resync** — `apps/client/src/net/api.ts` (lead): the full `GET /api/lobbies` runs every 30 s only
   while the EventSource is not OPEN or has been silent for 45 s (heartbeat 20 s; SR-6 refused streams keep the 30 s
   poll), and every 5 min otherwise; every (re)connect already delivers a snapshot.
6. **v3 UI atlases as lossless WebP** — `packages/assets/scripts/v3/ui-webp.ts` + `packages/assets/generated/v3ui/*.webp`
   + `packages/assets/test/v3ui-webp.test.ts` (world-art), `apps/client/vite.config.ts` (lead). The vendor PNGs
   (`v3/assets/ui`, read-only) get bit-identical WebP twins (sharp lossless, `exact`, VP8L); the Vite alias resolves
   `@v3assets/<name>.png?url` to the twin for every file present, so `ui/common/v3atlas.ts` AND the locked
   `game3d/overlay/atlas.ts` load WebP with no code change (verified in the built `dist/`: the 8 PNGs became WebP).
   The test fails when a vendor refresh changes a PNG (re-run the script on the host) or when the client imports a
   `@v3assets` PNG without a twin. WebP lossless needs Safari ≥ 14 / iOS 14; v3 3D needs WebGL2 (Safari ≥ 15)
   anyway, and the v2 atlases already ship WebP first.

Not changed (and why): snapshot keyframe extras (#3 of the recon) and the vote `game:view` churn (#4) — with
deflate and a 32 KiB window they are already compressed by 68 % / 80 % on the wire; a codec / protocol change
(`snap: 3`, `game:day` patches) is no longer worth its secrecy and compatibility risk for v3. Upsert coalescing in the
directory — joins spread over many lobbies; one stringify per event already removed the per-stream cost.
`lobby:view` deltas on reconnect (#9) — reconnect is cheap (unchanged ≈ 16-18 KB, first view ≤ 47 ms).

## Security note on compression (for review)

Context takeover means a viewer's private projection (`game:view`, role text) and later frames that can carry
attacker-chosen text (chat, names) share one zlib window per connection. A compression oracle (CRIME-style) needs
an on-path observer of that one player's TLS record sizes AND many injected guesses; nothing reaches other clients
(compression is per socket, never shared between viewers). The memory note puts in-game anti-cheat below host
safety and UX; the host is protected by `maxPayload` on the inflated size and the HOST-11 budget. `WS_DEFLATE=off`
is the kill switch. **Needs a human check:** that Cloudflare Tunnel keeps `Sec-WebSocket-Extensions` end to end
(devtools → the game WS → response headers should show `permessage-deflate; server_max_window_bits=15` on the dev
hostname); if it is stripped nothing breaks, the frames are just uncompressed.

## Measurement (how, where)

**Trees.** Clean exports, never the shared worktree (the C1 integrator is mid-edit there; its WIP does not build:
`game3d/overlay/bubbles.ts` TS2345): *before* = `git archive HEAD` (`182d220`) + the updated measurement tools;
*after* = the same + exactly the files listed above; *w15* = *after* with the final deflate settings while the
tree still had the 8 KiB window (the shipped config is *w15*'s). Host sandboxes `v3-perf-net-{base,after,w15}`.

**Window.** One exclusive `flock ~/clocktower/v3-heavy.lock`, 2026-10-18 14:56:35-15:02:12 UTC; 1-min load 1.8 at
start, 0.2-1.5 during the runs. Raw JSON on the host under `/tmp/ct-v3net/{base,after,w15}/`.

**Tools** (all under `tests/perf/`, `scripts/perf/`; changed in this pass, measurement only):
- `net-profile.ts --world v3 --players 15 --secs 20 --phases walk,social,vote,reconnect --reconnects 3`. New:
  real wire bytes from `ss -ti` on the server's established sockets (per-peer deltas of `bytes_acked` /
  `bytes_received`, i.e. TCP payload = WebSocket frames incl. headers, compressed when negotiated), `wsExtensions`.
  Before deflate the wire is 101-105 % of the payload (frame headers).
- `net-voice-bench.ts --players 15 --minutes 20 --rtt 40 [--listrooms no]`. New: a LiveKit fake where every grant
  holder is connected to its room (synced each simulated second) and rooms persist after they empty, with
  `listRooms`; reports `livekitListRoomsPerMin` and `livekitCallsPerMin`.
- `net-directory.ts --e2e no --lobbies 30 --subs 60` and `--lobbies 60 --subs 200`. New: part A uses the real
  `sseLine` when the tree has it (`fanoutUsesSseLine`).
- `scripts/perf/net-static.mjs --dist apps/client/dist` and live mode against a test server serving the build.

### Detail

| Phase (v3, 1 ST + 15) | payload S2C B/s per client (ST) | wire before | wire after (w15) | wire after, 8 KiB window | c2s wire | server CPU before → after |
|---|---|---|---|---|---|---|
| walk | 1475-1501 (1956-2921) | 1547 | 733 | 708 | 439-498 (unchanged) | 2.4 → 3.6 % |
| social | 2609-2742 | 2778 | 896 | 842 | | 2.0 → 3.4 % |
| vote | 4347-4407 (ST 7347-7693) | 4448 | 902 | 1297 | | 2.2 → 3.2 % |

(The what-if estimate of the recon, 32 KiB dictionary, level 1, threshold 0/128: 54/45 % walk, 71/60 % social,
82/77 % vote — the real thing at threshold 64 lands on the high side of it.)

Voice, per lobby per simulated minute (20 min, 1 ST + 15, house visits + bedtime / night / dawn rotations; v2
layout in brackets): grants 21.9 (22), revokes 23.6 (23.8); before `listParticipants` 388 (412) + `remove` 25;
after `listRooms` 4 + `listParticipants` 2.9 (3.3) + `remove` 23.6 = 30.4 (31.0). `voice.tick()` p50 0.07 µs,
p99 10 µs before and after.

## talkerCap — wiring design (needs a human LiveKit test; NOT run, NOT wired)

Outdoors is one broadcast `square` room for the whole town in v2 AND v3 (`packages/voice/src/zones.ts`), so in a
16-player v3 lobby a phone or a CPU-only laptop decodes up to 15 Opus tracks. `apps/client/src/voice/talkerCap.ts`
`capStep` (max 6, holdMs 4000, minOnMs 3000) is pure and unit-tested; wiring (voice owner, `VoiceEngine.tickGains`,
10 Hz, after the proximity cull):

1. candidates = remote participants of the zone room with a microphone publication the cull did not drop;
   `speaking = p.isSpeaking`, `lastSpokeMs` kept per pid by the engine, `distPx` as for the gains, `pinned` = the
   Storyteller;
2. `state = capStep(state, candidates, now, { max })`; a candidate not in `state.on` whose publication `isDesired`
   → `setSubscribed(false)` and remember "capped by us"; in `state.on` and capped by us → `setSubscribed(true)`;
   only tracks this client dropped are ever resubscribed (the grant is never widened);
3. leaving the room, a mode change (announce) or `max = 0` restores every capped track; the VoicePanel and the
   talking rim (`avatars.setTalking`) keep using the active-speaker flag, so a capped talker still shows as talking;
4. `max` from a client setting / `localStorage['ct.debug.talkerCap']` for the test build; default off until the
   test passes, then 6 (or lower on phones / the v3 CPU tier).

Human test (dev service, real LiveKit, ≥ 1 ST + 9 players incl. 2 phones; talkers may be laptops with
`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<numbered speech>.wav`): the six cases of
`recon-net.md` §"talkerCap — human test design" — (1) `isSpeaking` of an UNSUBSCRIBED participant turns true within
500 ms in ≥ 95 % of spurts (the key assumption); (2) speaking-started → first audio packet p50 ≤ 300 ms, p95 ≤ 600 ms;
(3) 10 simultaneous talkers, phone listener, cap 6 vs off: inbound kbps ≤ 6 × 24 + overhead, CPU −30 % or better,
no glitches; (4) flapping ≤ 6 `setSubscribed` toggles / min / listener; (5) the Storyteller always decoded;
(6) every capped track restored after a house visit / announce. Record in `docs/test-results.md`.

## Proposed `scripts/perf/budgets.mjs` keys (not edited here)

Values = measured after + ~20-30 % slack (source tool in brackets).

- `v3WireS2CBytesPerSecPerClientWalk = 950` (733; `net-profile.ts --world v3 --phases walk`, `s2cWireBytesPerSecPerClient`)
- `v3WireS2CBytesPerSecPerClientSocial = 1200` (896)
- `v3WireS2CBytesPerSecPerClientVote = 1300` (902)
- `wsDeflateSavedPctWalk >= 40` (`1 − wire / payload` = 51 %; a `min` budget — fails if the extension stops
  being negotiated, e.g. a ws upgrade changing defaults)
- `v3LobbyServerCpuPctWalk = 5` (3.6 % of a core for 16 clients incl. compression)
- `c2sWireBytesPerSecPerClient = 620` (439-498)
- `voiceLivekitCallsPerMinPerLobby = 40` (30.4; `net-voice-bench.ts`, `livekitCallsPerMin`, v3 layout)
- `voiceListParticipantsPerMinPerLobby = 10` (2.9)
- `voiceReconcileWallMs120 = 1800` (1259 ms at 120 rooms, 40 ms RTT)
- `directoryFanoutUs60x200 = 15` (5.3 µs; `net-directory.ts` part A `usUpdateFanoutToday`)
- `sseSnapshotKiB60 = 27` (22.4 KB at 60 lobbies; unchanged from the recon)
- `v3UiAtlasKiB = 200` (all 10 client sheets 158 KiB WebP; `scripts/perf/net-static.mjs --dist`, sum of the v3 UI sheets)
- `reconnectFirstViewMs = 250` (≤ 47 ms), `reconnectBytesFirst3sKiB = 22` (15.7-18.6 KB),
  `reconnectOtherClientBytes = 9000` (4.9-7.7 KB)
- `staticAssetsNotImmutable = 0`, `staticMissingChunkNot404 = 0`, `staticAssetsNotHashed = 0` (0 / 0 / 0)

## Open items / contract requests

- **`game3d/overlay/atlas.ts` (WP4, locked during C1):** it loads all four `-night` sheets at mount
  (`createAtlas` → `load(\`${name}-night\`, …)` for every sheet). Load them on first `frame(…, night = true)` /
  `url(…, night = true)` (the day frame is already the fallback while a sheet loads), or from the stage's golden-hour
  hook; better, delegate to `ui/common/v3atlas.ts` (its own CONTRACT-REQUEST) so portraits / markers / indicators
  are fetched and decoded once, not by both loaders. Saves ≈ 47 KiB WebP (was 132 KiB PNG) and one RGBA decode of
  each shared sheet (≈ 0.8 MiB) at mount — relevant for the CPU-only tier.
- **`scripts/v3/import-assets.sh` (v3-qa):** after the rsync, print "re-run `pnpm --filter @ct/assets exec tsx
  scripts/v3/ui-webp.ts` on the host and pull `packages/assets/generated/v3ui`" (the Mac cannot run sharp); the
  asset test enforces it.
- **Cloudflare Tunnel** passthrough of permessage-deflate: one human look in devtools on the dev hostname.
- **talkerCap:** human test above, then the voice owner wires it.
- Directory per-world filtering (`/api/lobbies/stream?world=`): the finders now filter client-side; worth it only if
  `/v2/` keeps many lobbies.
