# v3 performance — front "server" (server world CPU + network)

Agent `v3-perf-server`, 2026-10-18, branch `v3-perf-server` (from `4e99bc8`). Merges the old "net" front: it took over
the partial, untested server/net changes of `4e99bc8` (notes `net.md`, recon `recon-server.md`, `recon-net.md`), fixed
or reverted what a reviewer flagged, then measured and optimised the v3 (Hollowmere) lobby path. No protocol change,
no secrecy change: every client still gets only its own projection.

## TL;DR

| What (1 ST + 15 bots, v3 lobby, 15 Hz moves, profiler off) | Before (`4e99bc8^` server) | After (this branch) |
|---|---|---|
| Server CPU, day walk (% of one core, whole process) | 2.8 / 2.8 % | 2.8 / 3.1 % (deflate off, the new default) |
| Storyteller `game:view` during a day walk | 3.9-4.8 /s, 38-48 KB/s | 0.9 /s, 9 KB/s (**-78 %**) |
| Storyteller `game:view` during gather + walk_to seat/home | 6.1-6.5 /s, 61-67 KB/s | 1.8-1.9 /s, 18-20 KB/s (**-70 %**) |
| S2C payload per client, average (walk / stage) | 3956-4542 / 5813-6056 B/s | 2219-2242 / 3192-3445 B/s |
| Messages per client (walk): down / up | 13.2 / 12.5-12.8 msg/s | unchanged |
| Ping RTT on loopback, walk, p50 / p95 | — | 0.47 / 1.46-1.55 ms (deflate off) |
| Escort planning, 15 walks home (micro-bench, warm mean) | 13.2 ms | 3.7-4.9 ms (**-65-70 %**) |
| Longest v3 door route `findPath` | 1612 µs | 266-280 µs (**-83 %**) |
| `walkTo(all, seat)` planning | 6.6 ms | 1.7-3.6 ms |
| Snapshot fan-out, 16 viewers incl. encode (interleaved A/B) | p50 131 µs | p50 90 µs (**-31 %**; -10 % without door tags) |
| LiveKit calls per minute per lobby (simulated game, v3 layout) | 440 (`listParticipants` 415) | 31.8 (`listParticipants` 3.4) |
| Revocation audit worst case (intruder re-joins an occupied room) | 15 s | 15 s (the WIP had made it 60-75 s: reverted) |

v3 vs v2 under the same bots: the same CPU and the same bytes per client (v2 walk 2.8-3.1 % before / 4.0 % with
deflate; s2c 2237-2289 B/s after vs v3 2230-2237). The bigger Hollowmere map (125 x 43 tiles, 73 % blocked) only
shows in path planning, which is now cheaper on v3 than it was on v2 before.

## Review findings on `4e99bc8` and what was done

1. **`voice/coordinator.ts` revocation audit back-off — reverted (security).** The WIP listed an occupied audited room
   on a 15 → 30 → 60 s back-off and skipped it when LiveKit's participant count was ≤ the grant count, so a revoked
   member re-joining a room where a granted member was absent stayed connected up to 60-75 s (its own test pinned
   that). Now every occupied audited room is listed at **every** 15 s run again, exactly as before v3. Kept: one shared
   `listRooms` decides which audited rooms have anyone in them (empty / gone rooms have nobody to evict; the original
   process reconciler already trusted `numParticipants` the same way), now cached ≤ 1 s (was 5 s) so it cannot delay a
   detection. Measured: the back-off bought almost nothing — `listParticipants` 3.4 /min with the revert vs 2.9 /min
   claimed with the back-off; the gate does all the work (440 → 31.8 calls /min). Without `listRooms` (test doubles,
   or when it fails) every audited room is listed (415 /min, the pre-v3 behaviour). Tests:
   `apps/server/test/voice.audit.test.ts` (every run ≤ 15 s apart for 10 min; the hidden-intruder case found ≤ 15 s,
   right after the revocation and 3 min later).
2. **`app.ts` permessage-deflate — kept as code, switched OFF by default (`WS_DEFLATE=on` opts in).** Measured (table
   below): −70 % wire bytes in a vote, but +45-50 % server CPU, ~+330 KiB per socket and a 3x worse ping tail with
   60 clients. 2.8 KB/s per client is nothing for any player's link; the single host's CPU is the shared resource.
   `concurrencyLimit: 4` stays for when it is on (ws's limiter is process-wide; 4 = libuv's default thread pool).
3. **`voice/reconciler.ts` parallel listing — fixed.** After the first `listParticipants` failure the other workers kept
   listing/evicting and mutating `res` after `runOnce()` had resolved as failed. Now no worker starts another listing
   once one failed, and the run settles only after every worker stopped (`failure` is rethrown after `Promise.all` of
   non-rejecting workers). An in-flight listing still evicts the orphan it found (never wrong); a failed run credits
   no usage, as before. Test: `apps/server/test/voice.reconciler.test.ts`.

The other WIP server changes were verified and kept: allocation-free `blockedPx` + typed-array A* (`path.ts`, exactness
test `world.blockedPx.test.ts`), the ST-only, coalesced stage refresh (`world/index.ts` `STAGE_CHECK_MS` 250 ms,
`STAGE_WALKING_MS` 1 s for pure walking ↔ outdoors flips, `host.markGameDirtyFor`; test `world.stageDirty.test.ts`) —
the ST's stage panel shows a player's "walking" label up to 1 s late, everything else ≤ 250 ms; players' views never
contained the stage — and the SSE `sseLine` once-per-event serialisation.

## New optimisations on this branch

- **Planning margin as two tile rectangles** (`world/path.ts` `marginBlockedPx`): `segmentSafe` tested four body boxes
  (x±1, y±1) per 1 px sample = 16 tile reads; the x±1 pair covers one contiguous column span on shared rows and the
  y±1 pair one row span on shared columns, so two rectangles give the identical answer with the same float
  expressions (typically 4-6 reads). Exact on both layouts at every quarter pixel + 300 k random points, and
  `segmentSafe` vs the reference on 20 k random segments (`world.blockedPx.test.ts`). Longest door route 381-390 →
  266 µs on top of the WIP's 1612 → 390 µs.
- **Shared snapshot fan-out** (`world/index.ts` `snapshotFanout()`, used by `GameRoom.sendSnapshots`, optional on the
  `WorldModule` interface in `rooms/modules.ts`): the viewers of one 12 Hz fan-out share the rounded entity states,
  the door-lock object and the door tags (public, viewer-independent) instead of rebuilding them 16 times; visibility
  is still decided per viewer by the same code. `world.fanout.test.ts` asserts `fanout(pid)` `toEqual`
  `snapshotFor(pid)` for every viewer (incl. the ST and an unknown pid) in day (inside / ghost / locks / frozen /
  server walk), bedtime, night (ST visiting), dawn. Interleaved in-process A/B (`tests/perf/v3-fanout-ab.ts`):
  see "Measurements".

Not done (small or risky): pre-planning / spreading 15 escort walks over several ticks (warm batch is now ~4 ms on v3,
well inside the 41.7 ms tick); a cheaper stage key (the 250 ms coalescing already removed the 24 Hz JSON); memoising
the encoder's per-viewer `JSON.stringify` of `doors` / `doorTags` (protocol `snapshotCodec.ts`, lead) — a WeakMap by
object identity would now hit because the fan-out shares the objects: **CONTRACT-REQUEST(lead)**, ~10-20 µs per
fan-out when door tags are on.

## Measurements

Host build machine, Node 24, `scripts/remote.sh`, sandbox `v3-perf-server` (after), `v3-perf-server-base`
(this tree with `apps/server/src` from `4e99bc8^`), `v3-perf-server-mid` (`4e99bc8`'s server + review fixes, i.e. before
the two new optimisations). Every measurement window held `flock ~/clocktower/v3-heavy.lock` exclusively; warm-up runs
first in each sandbox. The host was busy all afternoon (1-min load 11-18 from other agents' GPU/browser work that does
not take the lock), so micro-bench numbers between separate processes are noisy (± 30 %); the A/B tool interleaves to
cancel that. Raw JSON on the host under `/tmp/ct-v3ps/{w1,w2,w3,voice,voice-nolist}/`.

### End-to-end, 1 ST + 15 bots (`tests/perf/v3-server-load.ts --hz 15 --walk 30 --stage 20`)

Window 1 (18:50-18:58 UTC), base vs after (deflate ON = the WIP default), interleaved, 2 rounds:

| tree / world | walk CPU | stage CPU | s2c avg B/s (walk / stage) | ST `game:view` walk |
|---|---|---|---|---|
| base v2 | 2.8 / 3.1 % | 3.5 / 3.2 % | 4105-4350 / 5845-5941 | 4.1-4.2 /s, 40-44 KB/s |
| base v3 | 2.8 / 2.8 % | 3.2 / 3.1 % | 3956-4542 / 5813-6056 | 3.9-4.8 /s, 38-48 KB/s |
| after v2 (deflate on) | 4.0 / 4.0 % | 3.9 / 3.9 % | 2237-2289 / 3234-3403 | 0.9 /s, 9-10 KB/s |
| after v3 (deflate on) | 4.0 / 4.0 % | 3.9 / 4.0 % | 2230-2237 / 3192-3358 | 0.9 /s, 9 KB/s |

Windows 2 and 3, after tree, WS_DEFLATE on vs off (v3):

| run | CPU walk / stage | ping p50 / p95 / p99 walk | anon RSS (walk end) | s2c wire per client |
|---|---|---|---|---|
| 1 x 16, on (w2) | 4.5 / 4.2 % | 1.42 / 8.89 / — ms | 217.9 MB | vote 832 B/s (`net-profile`) |
| 1 x 16, off (w2) | 3.1 / 3.5 % | 0.47 / 1.55 / — ms | 216.2 MB | vote 2819 B/s |
| 1 x 16, on (w3) | 4.0 / 4.0 % | 0.51 / 2.74 / 4.35 ms | 213.3 MB | |
| 1 x 16, off (w3) | 2.8 / 2.8 % | 0.47 / 1.46 / 1.90 ms | 211.2 MB | |
| 6 x (9 + ST), off (w3) | 7.2 / 7.3 % | 0.99 / 2.79 / 4.40 ms | 214.4 MB | |
| 6 x (9 + ST), on (w3) | 10.7 / 11.0 % | 2.71 / 8.99 / 18.17 ms | 234.9 MB (+20.5 MB / 60 sockets) | |

Per-tick cost: `world.tick` 7-12 µs mean (micro-bench); the whole event loop of a 16-client lobby is 2.3-2.6 % utilised
(ELU, deflate off) = ≤ ~1 ms of JS per 41.7 ms tick, all IO included.

### Micro-bench (`tests/perf/v3-server-bench.ts --worlds v3 --secs 20`, one process per tree)

| v3, 16 entities | base (w2) | mid (w2 / w3 / w3) | after (w2 / w3 / w3) |
|---|---|---|---|
| `handleMove` µs mean | 3.63 | 3.22 / 2.42 / 1.87 | 1.71 / 2.21 / 2.85 |
| escort 15 x home, warm mean / max ms | 13.2 / 18.1 | 3.97 / 4.46 / 4.90 | 4.37 / 4.92 / 3.68 (max 9-13, noise) |
| walk_to seat ms | 6.63 | 3.04 / 1.85 / 3.41 | 1.65 / 3.61 / 2.79 |
| longest door route µs | 1612 | 462 / 381 / 390 | 280 / 267 / 266 |
| `pathGrid` build ms | 11.8 | 4.7 | 7.3 |

(The fan-out column of this bench swung 186-321 µs between processes on the loaded host; use the A/B below.)

### Snapshot fan-out A/B (`tests/perf/v3-fanout-ab.ts`, interleaved, same process)

Exclusive window, 2026-10-18 20:12 UTC (1-min load 12.8 from lock-free GPU/browser work of other agents), 20 000
rounds, A and B alternate every round on the same world (15 players + ST, 3 inside buildings, 2 door locks, 4 walkers
nudged per round), 500 warm-up rounds dropped:

| 16 viewers, snapshot + `SnapshotEncoder.encode` | 16 x `snapshotFor` (before) | `snapshotFanout()` (after) | saved |
|---|---|---|---|
| door tags on (default ST setting) | mean 124.9 / p50 130.9 / p95 194.3 / p99 250.1 µs | 84.9 / 89.8 / 141.1 / 148.7 µs | p50 -31 % |
| door tags off | 79.4 / 82.7 / 123.2 / 144.1 µs | 70.8 / 74.1 / 115.0 / 121.3 µs | p50 -10 % |

At 12 Hz that is ~0.05 % of a core per lobby — small; most of it was `doorTags()` (filter + sort of every entity)
running once per viewer.

### Voice (`tests/perf/net-voice-bench.ts --players 15 --minutes 20 --rtt 40`, simulated, after)

| per lobby per simulated minute | v2 layout | v3 layout |
|---|---|---|
| grants / revokes | 22.8 / 24.8 | 22.4 / 24.5 |
| `listRooms` / `listParticipants` / `removeParticipant` | 4 / 3.7 / 24.8 | 4 / 3.4 / 24.5 |
| LiveKit calls total | 32.4 | 31.8 |
| … without `listRooms` (`--listrooms no`) | 461.5 | 440.2 |
| reconciler wall per run at 40 ms RTT, 8 / 40 / 120 rooms | 121 / 446 / 1255 ms | |

## Proposed `scripts/perf/budgets.mjs` keys (not edited here)

Measured after + slack; source in brackets.

- `v3LobbyServerCpuPctWalk = 4.5` (2.8-3.1 %, `v3-server-load.ts --worlds v3 --hz 15`, `serverCpuPct`, deflate off)
- `v3SixLobbiesServerCpuPctWalk = 10` (7.2 %, `--lobbies 6 --players 9`)
- `v3StGameViewsPerSecWalk = 1.5` (0.9; `perType.st['game:view'].perSec`) — guards the stage coalescing
- `v3S2CPayloadBytesPerSecPerClientWalk = 2800` (2219-2242; `s2cBytesPerSecPerClient.avg`)
- `v3PingRttP95MsWalk16 = 4` (1.46-1.55 ms; `pingRttMs.p95`, loopback)
- `v3EscortPlanWarmMs = 8` (3.7-4.9; `v3-server-bench.ts` `escortHomeMs.warm.mean`)
- `v3LongestDoorPathUs = 500` (266-280; `longestDoorPathUs.usPerCall`)
- `v3SnapFanoutP50Us = 120` (89.8 µs; `v3-fanout-ab.ts` `snapshotFanoutUs.p50`, door tags on)
- `voiceLivekitCallsPerMinPerLobby = 40` (31.8; `net-voice-bench.ts` `livekitCallsPerMin`)
- `voiceAuditMaxGapS = 15` (test-enforced in `voice.audit.test.ts`; listed so nobody trades it for calls again)
- `voiceReconcileWallMs120 = 1800` (1255 ms)
- The `net.md` wire keys (`v3WireS2C…`, `wsDeflateSavedPctWalk`) only apply with `WS_DEFLATE=on`; drop them or gate them.

## Commands run (host, via `scripts/remote.sh`, CT_AGENT as noted)

All passed unless noted. `~` = the admin home on the host.

1. `CT_AGENT=v3-perf-server scripts/remote.sh sh -c 'flock -s ~/clocktower/v3-heavy.lock pnpm vitest run apps/server'`
   at `4e99bc8` → 47 files, 382 tests passed (baseline).
2. … `pnpm vitest run apps/server/test/voice.audit.test.ts apps/server/test/voice.reconciler.test.ts apps/server/test/voice.test.ts tests/security/voice-cost.test.ts`
   → 4 files, 69 tests passed.
3. warm-ups: `pnpm exec tsx tests/perf/v3-server-load.ts --worlds v3 --rounds 1 --lobbies 1 --players 15 --walk 10 --stage 10 --hz 15 --cpuprof no --ports 3495-3496|3497-3498`
   in `v3-perf-server` and `v3-perf-server-base`.
4. Window 1 (exclusive): base and after, `--worlds v2,v3 --rounds 1 --walk 30 --stage 20 --hz 15`, two rounds each,
   interleaved (ports 3497-3498 base, 3495-3496 after).
5. `pnpm vitest run apps/server/test/world.blockedPx.test.ts apps/server/test/world` → 11 files, 102 passed.
6. bench warm-ups (`v3-server-bench.ts --worlds v3 --secs 5`) in the three sandboxes.
7. Window 2 (exclusive, script `/tmp/ct-v3ps/w2.sh`): benches base / mid / after; `v3-server-load.ts --worlds v3
   --serverenv WS_DEFLATE=on|off`; `net-profile.ts --world v3 --players 15 --phases walk,vote --secs 20 --deflate no
   --wsdeflate on|off --ports 3497-3498`. (Two first attempts were refused by the local worktree guard before reaching
   the host — inline `$HOME` / loop variables; switched to `~` and a script file.)
8. `pnpm vitest run apps/server/test/world.fanout.test.ts apps/server/test/world` → **1 failure**:
   `world.snap2.test.ts` wraps `snapshotFor` to record the room's snapshots; the room now uses `snapshotFanout`.
   Fixed the test to record both → green.
9. `pnpm -r run typecheck` → 0; `pnpm vitest run apps/server tests/security` → 66 files passed, 2 skipped; 613 tests
   passed, 7 skipped.
10. Window 3 (exclusive, `/tmp/ct-v3ps/w3.sh`): benches mid / after x2; 6 x 10 deflate off / on; 1 x 16 on / off.
11. `net-voice-bench.ts --players 15 --minutes 20 --rtt 40 [--listrooms no]` (shared lock).
12. `v3-fanout-ab.ts --rounds 3000` (smoke, shared lock); then (exclusive) `--rounds 20000` with and without door tags.
13. Final (after WS_DEFLATE default off): `pnpm -r run typecheck` → 0; `pnpm vitest run apps/server tests/security` →
    66 files passed, 2 skipped; 613 tests passed, 7 skipped.
