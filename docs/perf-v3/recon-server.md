# v3 perf recon — front "server" (CT_AGENT=v3-perf-server)

Status: recon only (no product code changed). Written 2026-10-18 for the v3 performance-optimisation swarm that runs
after C1 (v3 town wired) and C2 (QA). Owner of the numbers below: v3-perf-server. Every number says which tree and
method it came from. The binding v3 contract is `docs/v3/INTEGRATION.md` (§2.4 server changes, §7 budgets); the v2
server budgets are in `scripts/perf/budgets.mjs` (`serverCpuPct16`, `snapshotBytesPerSecPerClient`).

## TL;DR

- **The server does not care much which world a lobby uses.** A v3 lobby changes only the `TownLayout` data
  (112 x 43 tiles vs 107 x 37, 70.6 % blocked vs 56.2 %, rotated houses quantised to tiles, 15 seat stones). Every
  per-message / per-tick path is O(1) in map size (tile lookups), so `move`, snapshot fan-out, `tick`, voice zones and
  social pins cost the same per op on both layouts (micro-bench below, within ±5 %).
- **What does grow on v3 is path-finding** (server-driven walks: bedtime escort, Storyteller `walk_to`): planning
  15 walks home is **8.5 ms warm / 15.6 ms max on v3 vs 6.0 / 7.8 ms on v2** (+40 % mean, 2x max), the longest door
  route costs 861 µs vs 460 µs. It is all in the string-pulling step (`segmentSafe` → `isBlockedPx`), done
  synchronously inside one 24 Hz tick (41.7 ms budget). Not a problem for one lobby; a hitch for many lobbies ringing
  bedtime together, and the cheapest real win on this front.
- End-to-end CPU / bytes / GC numbers for 1 x 16 and 6 x 10 clients: see "Baseline (end-to-end)" — measured with the
  new `tests/perf/v3-server-load.ts` on the committed server tree (server code at `4998ca5` = unchanged in the
  worktree).
- The real hot spots are world-independent and were already the v2 ones: ws frame writes + the per-viewer snapshot
  encoder, and `flushViews` recomputing **all 16** `game:view` projections whenever the ST-only stage view changes.

## Tooling (new files only; nothing existing was edited)

| File | What | Run (from the worktree root, on the host) |
|---|---|---|
| `tests/perf/v3-server-load.ts` | End-to-end driver: one fresh test server per (world, round), interleaved v2/v3; N lobbies x (P players + 1 ST) walking layout-valid paths at `--hz`; phase A walk, phase B stage (gather + `walk_to` seat, then `walk_to` home = server A* walks through doors into the interior bands). Records server CPU (/proc user/sys/threads), ELU, event-loop delay, GC pauses by kind, heap, RSS / anon RSS, S2C/C2S bytes per client, per-type message rates (ST + one player), teleports per client-minute, host load average before/after each phase. `--cpuprof yes` writes V8 profiles per server for hot spots. | `CT_AGENT=v3-perf-server scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock pnpm exec tsx tests/perf/v3-server-load.ts --worlds v2,v3 --rounds 2 --lobbies 1 --players 15 --walk 40 --stage 24 --cpuprof no --ports 3492-3493 --out /tmp/ct-v3srv-1x16'` ; many lobbies: `--lobbies 6 --players 9` ; real-client move rate: `--hz 15` |
| `tests/perf/v3-server-preload.mjs` | `--import` preload for the TEST server only (via NODE_OPTIONS): ELU, `monitorEventLoopDelay` (resolution subtracted), `PerformanceObserver('gc')` pauses by kind + 0.25 ms histogram, heap/RSS, one JSONL line/s; main thread only, tagged with pid. | loaded by the driver |
| `tests/perf/v3-grid.ts` | Layout-aware walkable grid + BFS for perf bots (`tests/support/bot.ts` plans on the v2 layout only, so its wander walks into v3 walls). | imported |
| `tests/perf/v3-server-bench.ts` | In-process micro-bench of the REAL world module (fake RoomHost, fake clock) on each layout: `handleMove`, snapshot fan-out (16 x `snapshotFor` + `SnapshotEncoder` + msgpack), `tick` (stage JSON), escort/seat walk planning, server walk ticks, `pathGrid` build, `circleSpots`, voice `computeZones`, primitives. Run one world per process (JIT). | `CT_AGENT=v3-perf-server scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock pnpm exec tsx tests/perf/v3-server-bench.ts --worlds v3 --secs 20 --out /tmp/ct-v3bench-v3.json'` |
| `scripts/perf/server-v3-report.mjs` | Markdown table (median over rounds per lobbies x world x phase) + check of the PROPOSED keys below (`--check` exits 1 when over). | `node scripts/perf/server-v3-report.mjs /tmp/ct-v3srv-1x16/v3-server-load.json /tmp/ct-v3srv-6x10/v3-server-load.json --check` |

Profiles: `pnpm exec tsx tests/perf/cpuprofile-summary.ts <out>/<world>-r1/cpuprof/<largest>.cpuprofile --skip 20000`
(the server writes one profile per thread/process; pick the one that contains `sendSnapshots`).

Tool caveats: the ST wanders at 1.5x (parity with `server-profile.ts`; above `MOVE_TOLERANCE` 1.35, so the ST gets a
few corrections — the `tp/cl/min` column); bots move at 10 Hz by default (v2 baseline parity) while the v3 client sends
15 Hz moves (INTEGRATION §3 `stepLocal`), so run `--hz 15` for the v3 budget; bots never enable voice (`--voiceoptin
yes` for grant churn); `--cpuprof yes` costs ≈ 3 % of a core by itself (perf-v2.2-results.md P3), so CPU budgets
come from profiler-off runs only.

## Baseline (micro-bench, per op)

Tree: worktree server/protocol/assets sources = `4998ca5` (unchanged). Method: `tests/perf/v3-server-bench.ts --secs
20`, one process per world, under `v3-heavy.lock`; host load 5.4 → 5.1 during the run (busy shared host).

| Metric (16 entities, 10 Hz moves, 12 Hz snapshots, 24 Hz ticks) | v2 | v3 |
|---|---|---|
| map tiles / blocked | 3959 / 56.2 % | 4816 / 70.6 % |
| `handleMove` µs mean / p99 | 1.33 / 8.1 | 1.27 / 6.9 |
| snapshot fan-out (16 viewers + encode + pack) µs mean / p95 | 101 / 231 | 103 / 202 |
| snap2 bytes per frame | 138.6 | 138.6 |
| `world.tick` µs mean / p99 (stage JSON key each tick) | 9.3 / 39 | 9.7 / 28 |
| ⇒ world-module CPU of a walking lobby | 0.16 % core | 0.17 % core |
| walk-planning 15 x home, cold / warm mean / max (ms) | 9.1 / 6.0 / 7.8 | 9.9 / **8.5 / 15.6** |
| walk-planning 15 x seat (circle gathered), mean / max ms | 2.6 / 3.7 | 4.0 / 5.1 |
| server walk tick (15 walking home) µs mean / p99 | 13.1 / 170 | 13.4 / 198 |
| longest door route `findPath` µs (waypoints) | 460 (2) | 861 (5) |
| `pathGrid` build (once per layout per process) ms | 2.0 | 5.0 |
| `circleSpots(15)` µs | 18 | 18 |
| voice `computeZones(16)` µs (5 Hz) | 2.1 | 2.1 |
| `isBlockedPx` / `locationAt` ns | 55 / 45 | 52 / 44 |

CPU profile of the v3 bench (`--cpu-prof-interval 100`): `findPath` 300 ms inclusive of 638 ms bench work;
`segmentSafe` 256 ms of that, `isBlockedPx` 192 ms self (array-of-arrays allocation per call). Everything else in the
world module is < 2 %.

## Baseline (end-to-end)

<!-- E2E -->

## Ranked optimisations

Gains are per lobby unless noted. "c1" = needs the wired v3 town / touches game3d (none on this front do).

1. **`flushViews` recomputes every viewer's `game:view` when only the ST's stage view changed.**
   `apps/server/src/world/index.ts:745-751` JSON-encodes `stageView()` every tick and calls `host.markGameDirty()` on
   any presence change ('walking' ↔ 'outdoors' flips whenever a seated player starts/stops). `GameRoom.flushViews`
   (`apps/server/src/rooms/GameRoom.ts:1371-1391`) then runs `projectForPlayer` + `JSON.stringify` for all 16 viewers
   to discover that only the ST's view changed (stage is ST-only, `apps/server/src/game/index.ts:657-660`). Fix: a
   targeted dirty (`host.markGameDirtyFor(pid)` → the existing `forceGameView` set, or `markStageDirty()` that only
   re-projects the ST) — lobby-auth + world-art, protocol-free. Also debounce/coalesce presence 'walking'/'outdoors'
   to ≤ 2 Hz for the ST (it is a HUD dot). Expected: removes 15 player projections + stringify per presence flip
   (measured ST `game:view` rate in the table above); ≈ 10-25 % of server JS time during day walks, more in big
   lobbies; also cuts the ST's downlink (each ST `game:view` is ≈ 3.6 KB msgpack). Risk: low (secrecy unchanged — the
   ST view is still built only for the ST; players' views still go out on their own dirtiness).
2. **Path planning: allocation-free `isBlockedPx` + cheaper string pulling** (`packages/protocol/src/world.ts:105-114`,
   `apps/server/src/world/path.ts:56-74,193-202`). `isBlockedPx` builds a 4-element array of arrays per call; at most
   2 x 2 tiles are ever touched, so compute the tile span once (`tx0 = floor((x-5)/ts)`, `tx1 = floor((x+5)/ts)`,
   `ty0`, `ty1`) and test ≤ 4 indices. `findPath`'s string pulling tests `segmentSafe(i, j)` from the far end
   backwards (O(n² · length) samples, 5 `isBlockedPx` each at 1 px): scan forward from `i+1` and stop at the first
   failure, or sample at 1 px but test the body-box + margin as one rectangle per step (1 lookup set instead of 5).
   Expected: `findPath` 2-4x faster ⇒ v3 escort batch ≈ 8.5 → 2-4 ms, max 15.6 → < 6 ms; `isBlockedPx` also sits in
   every `handleMove` sweep (`pathClear`, 2 px steps), so moves get ≈ 20-30 % cheaper too. Risk: low-medium — the
   walk must stay accepted by the validator: keep `packages/assets/test/navigation.test.ts`,
   `apps/server/test/world*.test.ts` green and add a property test "every planned leg passes `pathClear`" on both
   layouts. Owner: lead (protocol) + gameplay/world-art (path.ts). No game3d.
3. **Spread or pre-plan server walks so one tick never plans 15 routes.** `escortStragglers` / `walkTo('all')` plan
   all legs in the same tick (`world/index.ts:463-472, 786-801`). With 6 lobbies whose bedtimes coincide each still
   plans in its own room tick, but every lobby's tick shares the one Node event loop: plan ≤ 4 walks per tick (queue
   the rest; they start 42 ms later), or cache `findPath(door ↔ bed)` legs per layout (interior legs are static), and
   memoise outdoor legs by (start tile, goal tile). Expected: worst-case tick ≤ 5 ms on v3 regardless of lobby size.
   Risk: low (players start walking up to ~150 ms later). Owner: world-art.
4. **Snapshot fan-out: compute the viewer-independent parts once per fan-out.** `sendSnapshots`
   (`GameRoom.ts:1320-1342`) calls `world.snapshotFor(pid)` per viewer; each call re-runs `doorTags()` (filter + sort of
   all entities, `world/index.ts:479-491`) and rebuilds/rounds every visible entity object, and `social.pinsFor` scans
   all pins. Build one rounded entity array + doorTags per (location, phase) per fan-out and let viewers pick
   (`snapshotsForAll()` on the world module); skip `pinsFor` when the lobby has no pins (already O(1) when `pins.size
   === 0`). `connectedSeats()` allocates two arrays per call (called per fan-out and per flush). Expected: fan-out
   ≈ 100 → 40 µs per lobby at 16 viewers (bench), i.e. ≈ 0.07 % core per lobby — small, but it is O(viewers²) in
   `doorTags` and the biggest pure-JS item left after #1. Risk: low (per-viewer visibility must stay exactly
   `snapshotFor`'s; keep `world.leaks.test.ts`, `world.snap2.test.ts`). Owner: world-art + lobby-auth.
5. **Stage key without JSON every tick.** `world.tick` builds `stageView()` (sort + presence + `seatSpot` per player)
   and stringifies it 24x/s even when nothing moved (`world/index.ts:745-751`). Keep a dirty flag set by
   moves/walks/doors/circle changes and a cheap numeric key (presence enum per seat). Expected: 9.7 → ~2 µs per tick
   (0.02 % core) — tiny alone, but it is the trigger of #1. Risk: low.
6. **Movement fan-out rate.** S2C per client is dominated by `world:snap2` (12 Hz) and the C2S side by `move`. The v3
   client sends moves at **15 Hz** (v2 bots: 10 Hz): +50 % `handleMove` + inbound frames. Proposal for the v3 client
   (WP1 `net/local.ts`, owned by the v3 integrator; *needs c1*): send at 10-12 Hz while walking straight and only on
   turns/stops in between (server accepts any rate; prediction is client-side). Expected: −20-30 % inbound frames,
   ≈ −5-10 % server CPU of a walking lobby. Risk: medium (remote smoothness: other clients interpolate snapshots, not
   moves, so it is invisible to them; the self-correction window grows slightly).
7. **Memory per process / lobby.** The test server sits at ≈ 210 MB anon RSS before any lobby (tsx source mode;
   v2.4 measured 88-93 MB with the bundled server). Measure `--mode dist` before setting the RSS budget; per-lobby
   growth is in the 6 x 10 table. The v3 layout itself is ~35 KB JSON + a 4816-entry number[] collision (≈ 40 KB);
   `pathGrid` adds 4.8 KB Uint8Array + a 4816-entry string array per layout (shared by all lobbies: WeakMap per layout
   object). Possible saving: store `collision` as a `Uint8Array` in `layoutV3.ts` (assets; protocol type is
   `number[]` → needs a lead contract change) — negligible, not worth it before deploy.
8. **GC.** See the GC columns: minor GCs dominate (snapshot objects, msgpack buffers, `JSON.stringify` in
   `flushViews`); #1 and #4 remove most short-lived garbage. No major-GC pauses above the event-loop budget were seen
   (see table).

## Proposed budgets (`scripts/perf/budgets.mjs` keys; lead decides)

<!-- BUDGETS -->

## Commands run (host, CT_AGENT=v3-perf-server)

<!-- COMMANDS -->
