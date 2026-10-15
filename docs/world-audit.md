# World audit — navigation, houses, night edge cases, night-information leaks

Audit by the world-audit teammate, 2026-10-14. Scope: the physical town
(`packages/assets/src/layout.ts`), the server WorldModule (`apps/server/src/world/index.ts`),
the night-time channels that could reveal whom the Storyteller (ST) visits, and cosmetics
consistency. Everything listed under "Tests" was executed on hshi-u1 through
`scripts/remote.sh` (commands and results at the end).

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| L1 | After the night the ST stayed where the night ended: inside the last visited home or (after `leave_home`, which exits to that home's doorstep) standing at its door. Players walking out at daybreak saw it, and anyone entering that home by day saw and heard (voice zone) the ST inside. That reveals the last visit. | **High** (secrecy) | **Fixed** (world) |
| L2 | An ST who lingered in a cottage at bedtime was physically in that home when the night started: its occupant saw and heard the ST, but the rules engine registered no visit (`visitingSeat` null, no cue). | Medium | **Fixed** (world) |
| L3 | The ST's facing (from its last night move) was still visible in day snapshots. | Low | **Fixed** (reset to `down` at dawn) |
| N1 | "Corner catch": the client's axis-separated slide has no corner correction. Pushing almost parallel to a wall into a corner you overlap by a pixel or two stalls you until you press the other axis. Measured on 113 standard routes with sloppy (3 px early) turns: 6 pointer and 2 keyboard routes stall. Hot spots: the clock-tower corners on the main road (tiles 45,49 / 51,49), the house-6 corner (61,47), house-10 (25,66), east rim (94,59). | Medium (UX) | **Client report** (fix below; server already accepts it) |
| N2 | A 5-tile walkable pocket at (77..81, 89), between the allotment fence and the town wall, can't be reached from anywhere. It's harmless: nothing is placed there. | Info | Allow-listed in the test; assets may fill it with a hedge (needs `pnpm assets:generate`) |
| C1 | `GameRoom.restore` refreshes `displayName` but not `cosmetics` from the account, so a profile-page cosmetics change made while sitting in a waiting room never reaches the lobby. Every client still gets the same (stale) value, so rendering stays consistent. | Low | Report to lobby-auth |
| — | Every other channel (snapshots, sounds, location side-effects, game views, timing/size, voice, lobby view, ambient data) is clean; see the matrix below. | — | Tests added |

No unreachable door, bed or visit point. No interior door blocked by furniture. Doorsteps are
wide enough, door use ranges never overlap, and the server never rubber-bands legitimate client
movement on any standard route.

## 1. Navigation

Method (`packages/assets/test/navsim.ts`, shared by the asset and server tests):

- **Lattice BFS**: 2 px lattice over the whole map. A node is free iff `isBlockedPx` (the exact
  11 × 6 px feet box the client predicts with and the server validates) is clear. The BFS never
  changes `locationAt`, like the client. All tile centres (`x*16+8`, `y*16+14`) lie on the lattice.
- **Client replica**: `stepClient` reproduces `TownScene.stepLocal`: normalised input,
  `step = PLAYER_SPEED·dt` at 60 fps, try x then y, each only if the box is free and the
  location unchanged. Two bots drive it:
  - a pointer/touch bot (exact direction), and
  - an 8-direction keyboard bot (diagonal, then straight).
  Both follow string-pulled BFS paths (for the keyboard bot, a waypoint is accepted only if its
  diagonal-then-straight polyline is clear). "Stuck" means < 0.75 px progress for 0.4 s.
- **Routes (113)**:
  - player spawn → every door (19), and ST spawn → every door;
  - interior door → bed, bed → interior door, and interior door → visit point, for all 15 homes;
  - each cottage → the next cottage, and each cottage → the tavern.

Results:

- Every door, the ST spawn and every interior tile (bed, visit point) are reachable. Interiors are
  enclosed (existing `layout.test.ts`).
- The interior-door tile and the tile above it are free in every building, so furniture never
  blocks the way in. Every room has ≥ 12 free tiles.
- Every doorstep offers ≥ 18 px of reachable standing width inside the client's 20 px use range.
  No two door use ranges (server 22 px) overlap. No door lies on a footprint.
- **Planned routes: 0 stuck**, for both pointer and keyboard.
- **Sloppy routes without a nudge (current client)**: pointer 6/113 stall, keyboard 2/113 (N1).
  The test logs these as information and doesn't assert on them.
- **Sloppy routes with the recommended 4 px corner nudge: 0 stuck**, for both pointer and keyboard.
- **Server acceptance** (`apps/server/test/world.nav.test.ts`): the replica's 15 Hz `move`
  stream (rounded to 0.01 px, fake clock in step) is fed to the real WorldModule on 64 routes.
  Result: **0 corrections, 0 drift**, both with and without the nudge. The server's
  straight-or-L `pathClear` already tolerates the nudge, so the client fix needs no server change.
- Real-server walking (`world.room.test.ts`) through colyseus.js at real 15 Hz: no corrections.

### N1 — recommended client fix (lead / TownScene owner)

In `stepLocal`, after the two axis attempts, apply a corner nudge. If the dominant axis was
blocked, and the perpendicular input is ~0, and shifting ≤ 4 px perpendicular frees the move:
slide perpendicular toward that gap by `min(offset, step)` this frame. Reference implementation
(tested): `stepClient(…, { nudge: 4 })` in `packages/assets/test/navsim.ts`.

```ts
// after: if (!blocked(nx, y)) x = nx; if (!blocked(x, ny)) y = ny;
if (!movedX && Math.abs(vx) > 0.5 && Math.abs(vy * step) < 0.5 * step)
  for (let off = 1; off <= 4; off++) {
    const s = [vy ? Math.sign(vy) : 1, -1, 1].find((d) => free(x, y + d * off) && free(x + Math.sign(vx), y + d * off));
    if (s !== undefined) { if (free(x, y + s * Math.min(off, step))) y += s * Math.min(off, step); break; }
  }
// …and the mirror case for a blocked y move.
```

### Player–player collision: decided **no**

Players and the ST don't collide with each other, on the client or on the server. Reasons:

- crowds at doors and in the square must never block a doorway (an easy grief: standing in
  someone's door at bedtime);
- collision against interpolated remote positions would desync prediction and cause
  rubber-banding;
- night isolation means entities can share tiles without anyone seeing it.

This is now covered by a unit test: two players share a doorstep and both keep moving.

## 2. Houses

- **Seat N → house-N.** `homeOf` uses the seat from `game_started` (or `member.seat`), and
  `layout` has `houseIndex = N` for `house-N` with its bed and visit point inside that interior
  (tested). Within a match the mapping is stable across reconnects: `member.seat` persists, and a
  fresh-ticket reconnect at night lands in the right home (real-server test).
- **Rematches.** `GameRoom.handleStart` reshuffles seats at every start, so a player usually gets
  a different cottage in the next match. The seat → house mapping itself is fixed. That's by
  design (random seating). If players should keep their cottage between matches, lobby-auth
  would need to preserve seat order on rematch.
- **Distinguishable.** All 15 cottages have a unique roof + wall pair, a unique full exterior
  signature (roof, wall, roof type, chimney, shutters, flowers, lantern) and a unique name. The
  old test compared styles including the interior palette index, which made it trivially true.
  The new test excludes it.
- **Markers.** The current TownScene work-in-progress already draws a name plate above each
  assigned cottage door, gold for your own home. The HUD also has a "⌂ Home" compass. No further
  recommendation.

## 3. Night edge cases (server)

| Case | Behaviour | Test |
|---|---|---|
| Player refuses to go home at bedtime | *(updated by gameplay, 2026-10-15)* Countdown expiry → overtime: the WorldModule escorts every player not yet home (A* through the doors at walking speed, `snapshot.you = auto`). The night falls once everyone has been home for 3 s. No teleport, except a player still en route when the ST **forces** the night (`teleport reason 'night'`). | unit (`world.stage.test.ts`) + real server (`world.room.test.ts`, `playtest.gameplay.test.ts`) |
| Player inside someone else's cottage at bedtime | *(updated)* Stays there during bedtime; at countdown expiry they are walked out of that cottage and into their own (two `door` transitions), then to bed. | unit + real server |
| Disconnects on the way, reconnects at night | `sendHome` also runs for disconnected entities; on reconnect the world sends a `spawn` teleport with the home position; the snapshot shows only themselves. Added safety net: a seated player who is somehow not home during a locked phase is put to bed on reconnect. | unit + real server (fresh `reconnect` ticket) |
| Leaving home at night | `world:useDoor` → `phase` error. A `move` outside the room → `correction` back to the current position. | unit + real server |
| ST visits several homes in sequence | Each `visit_home` teleports to the visit point; `location_changed` → `visitingSeat`. Only the current home's occupant sees the ST. | unit + leak test + real server |
| ST visits while the player is mid-prompt | The visit moves on, the prompt stays open, and the player can still answer (no error, response recorded). | real server |
| Dawn → day | Dawn still locked (door refused). Day unlocks. The ST is returned to its spawn at dawn and again at day (L1). | unit + real server |

Escort / circle secrecy (gameplay, 2026-10-15): the escort and the night walk to bed are
visible only in the walker's own snapshot (`you`) and to viewers who may see that location by the
normal rules (at night: nobody else). Seat markers and the vote clock are public by-day
information. The ST-only stage view (presence per player) is only in the Storyteller's game view.
Tests: `world.stage.test.ts` (night snapshots contain only yourself while everyone walks to bed)
and `playtest.gameplay.test.ts` (night snapshot scan, no `stage` in any player view).

## 4. Night-information leaks

For every channel: what a non-visited player receives when the ST visits, prompts, informs or
walks at night.

| Channel | Finding |
|---|---|
| `world:snapshot` | During night phases a player sees only entities whose location is their own home. The ST appears only in the visited home. Snapshots go to everyone at a fixed `SNAPSHOT_HZ`, independent of ST actions. Same content (minus `t`) in quiet and busy windows. **Clean.** |
| ST position after the night | **Leak L1 — fixed.** |
| ST in a cottage at nightfall | **L2 — fixed.** |
| `world:teleport` | Sent only to the moved entity (ST fast travel goes to the ST alone). Clean. |
| `sound` | `visit` only to the visited pid (`commit` in game module). Bell, dawn and toll are public and phase-driven. Clean. |
| `location_changed` side effects | The game module sets `visitingSeat` and marks views dirty, but views are re-sent only when a member's JSON changed. The voice tracker changes zones only for the ST (players' night zone is seat-based). Lobby/directory are not dirtied (only on phase change). Clean. |
| `game:view` diffs | The player projection contains `storytellerVisitingYou` only for the visited seat. Prompts and info go only to their target. Night kills stay hidden (`publicAlive`) until dawn. No timestamp or seq field changes for others. Clean (byte-identical streams). |
| Message timing / size | Non-visited players receive no message at all at visit time. The only ST-dependent effect is event-loop work (token minting) slightly shifting snapshot send times by milliseconds. That's theoretical and below the jitter of the internet path. Low / accepted. |
| Voice | Players' night zone is `bld:house-<seat>` regardless of position; the ST gets a grant for the visited home only while inside. Only the ST receives grant/revoke messages, and LiveKit participant lists differ only inside the visited room. Clean (existing voice tests + leak test with a configured fake LiveKit). |
| Chat | Same audience as voice. The ST's chat reaches only the visited home. Clean. |
| Public player list `connected` | Driven only by real socket state, not by visits. A player who drops at night flickers for everyone, which is public by design. Clean. |
| Camera / lighting (client) | Night fade and captions depend only on the public phase. Static lights depend only on the viewer's own location. The ST's lantern is stamped only for avatars in the snapshot and, in the WIP client, only in the viewer's own location. Clean. |
| Animations (client) | Remote avatars exist only for snapshot entities. The WIP client hides and stops avatars outside your location (defence in depth). No footsteps or lantern outside the visited home. Clean. |
| Ambient life (`packages/assets/src/ambient.ts`) | Static data derived only from the map: no functions, no game/world/viewer inputs, every element outdoors. Guard test added. **The client is not rendering `AMBIENT` yet.** Rule for the renderer: drive it only from time + the public phase, never from entity positions, `storytellerVisitingYou` or the visit cue. |

### Fixes (WorldModule, `apps/server/src/world/index.ts`)

- On entering `first_night`/`night` from a non-night phase: if the ST is inside a **house**, it
  is moved to that house's doorstep (outdoors; nobody sees outdoors at night).
- On entering `dawn` or `day` from `first_night`/`night`/`dawn`: the ST is teleported to its spawn
  (`reason 'dawn'`) facing down. This skips the teleport if it's already there, facing down.
- On reconnect during a locked phase: a seated player not in their own home is put to bed first.

## 5. Cosmetics consistency

Every client derives an avatar from the same server-whitelisted inputs: `lobby:view.members[]`
(cosmetics, role, name) and the public `alive` flag from its game view. `TownScene.kindFor`
passes these to `sprites.layerKeys`/`appearanceKey`, and the ghost variant is chosen from
`alive`, so it is the same everywhere. The real-server test checks this:

- every client (the ST, all players, the player themselves) sees the same inputs;
- the same holds after a fresh-ticket reconnect from a "new device";
- cosmetic changes are refused in game;
- after a public death every client flips to `alive: false` at once.

Client notes (no bugs found):

- Before the first `lobby:view` arrives, avatars render with default cosmetics and the name
  "…". `refreshAppearances` fixes this as soon as the view lands.
- Preset availability (`hasPreset`) depends on the bundled atlas. Clients on different builds
  (a deploy mid-game) could render a preset vs. the layered fallback differently. Cosmetic only.
- C1 (lobby-auth): `restore()` doesn't reload `cosmetics` from the account.

## Tests added

| File | What |
|---|---|
| `packages/assets/test/navsim.ts` | Shared lattice/BFS/string-pulling + `stepClient` client replica (+ optional nudge) |
| `packages/assets/test/navigation.test.ts` | Doors/ST spawn reachable; no new pockets; interiors fully reachable with clear door tiles; doorstep width; door ranges; 113 routes × {pointer, keys} planned = never stuck; sloppy + nudge = never stuck; sloppy without nudge measured; house distinctness; seat → house |
| `packages/assets/test/ambient.test.ts` | Ambient data static/pure, map-only imports, outdoor-only |
| `apps/server/test/world.test.ts` (+8) | Someone else's cottage at nightfall; night move/door rejection; reconnect at night; sequential visits; ST lingering at nightfall; ST reset at dawn/day (3 variants); night → day directly; no player collision |
| `apps/server/test/world.leaks.test.ts` | Real Game+World+Voice modules, deterministic: non-visited players' full streams (snapshots, view diffs, sounds, teleports, voice grants) are byte-identical with/without a busy ST night (walks, 2 homes, prompt, answer, resolve, info, revisit, mid-prompt switch); night content never mentions the ST or other houses; daybreak ST at spawn |
| `apps/server/test/world.nav.test.ts` | Client-replica movement on 64 routes accepted by the server with 0 corrections (with/without nudge) |
| `apps/server/test/world.room.test.ts` | Real GameRoom via colyseus.js (port 3321): quiet-vs-busy window comparison (only identical snapshots, same cadence) with multi-visit + mid-prompt; fresh-ticket reconnect at night; dawn lock + day unlock + ST at spawn; bedtime refusal and wrong-cottage at countdown expiry; cosmetics consistency after reconnect and death |

The leak test was mutation-checked: with the dawn reset disabled, 2 of its 3 tests fail.

## Commands run (hshi-u1, `CT_AGENT=world-audit scripts/remote.sh …`)

| Command | Result |
|---|---|
| `pnpm vitest run apps/server/test/world.test.ts packages/assets/test` (baseline) | 26 passed |
| `pnpm vitest run packages/assets/test/navigation.test.ts` (first draft) | 3 failed. Diagnosed: 1 pocket, plus over-strict bots. Reworked into navsim. |
| `pnpm exec tsx packages/assets/test/_dbg/nav.ts` (temporary diagnostic, deleted) | Listed the pocket and catch positions |
| `pnpm vitest run packages/assets/test/navigation.test.ts` | 15 passed |
| `pnpm vitest run apps/server/test/world.test.ts apps/server/test/world.leaks.test.ts` | First run: 2 failed (test expected `storytellerSpawn` centre, but the ST spawns on a ring slot); fixed. Then 26 + 3 passed. |
| Same leak test with the dawn reset disabled (mutation check, file restored) | 2 failed / 1 passed, as expected |
| `pnpm vitest run apps/server/test/world.room.test.ts` | 2 passed, then 3 passed (with cosmetics) |
| `pnpm vitest run apps/server/test/world.nav.test.ts` | 4 passed |
| `pnpm vitest run packages/assets/test` | 26 passed (3 files) |
| `pnpm -r run typecheck` | **Failed in `packages/rules`** (`engine.ts` `resultPending`/`HistoryEntry`: rules WIP, not world-audit) |
| `tsc -p packages/assets` | 1 error in `scripts/generate.ts` (`drawCritters`: assets WIP, not world-audit). No errors in tests. |
| `tsc -p apps/server` | No errors outside `packages/rules` |
| `pnpm vitest run` (full) | 23 failed / 421 passed. Failures are in rules audit/day/night/secrecy tests and `game.test.ts` (rules WIP); `playtest.test.ts` (EADDRINUSE 3312 from a concurrent playtest run, then Slayer only); `adversity.test.ts` (3; passed on the next run). None in world files. |
| `pnpm vitest run apps/server/test/playtest.test.ts` (rerun) | 9 passed, 1 failed (Slayer: same as the rules `day.test` slayer failure). All per-visit secrecy checks pass with the world fix. |
| `pnpm vitest run packages/assets/test apps/server/test/world*.test.ts apps/server/test/voice.test.ts` (final) | **8 files, 87 passed** |
