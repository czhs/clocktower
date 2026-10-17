// Private-room voice and text chat, through the REAL server: GameRoom + the real Game, World and
// Voice modules, with LiveKit "configured" against an unreachable URL so real tokens are minted
// locally and can be inspected (LIVEKIT_TEST_ENV).
//
// What this file adds over the existing coverage:
//   * apps/server/test/voice.test.ts tests the coordinator's zone maths against a FAKE host;
//   * apps/server/test/room.test.ts tests chat delivery against a FAKE audience function.
// Neither puts a real player inside a real cottage and checks that voice and text agree. These
// tests do, in the three situations that actually matter for a social-deduction game:
//
//   1. day:   two players alone in one cottage (the private-talk case the whole town design is for)
//   2. night: every player locked in their own home (nobody can whisper to anybody)
//   3. night: the Storyteller visiting one home (the private visit)
//
// The central invariant asserted throughout: THE TEXT-CHAT AUDIENCE IS EXACTLY THE VOICE AUDIENCE.
// If those two ever diverge, players can whisper to people who cannot hear them, which breaks the
// game's core secrecy promise.
import { townLayout as L } from '@ct/assets';
import { homeBuilding, type VoiceGrant, type WorldSnapshot } from '@ct/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameModule, type GameModuleOptions } from '../src/game/index.js';
import { sleep, startTestServer, waitFor, type TestClient } from '../src/rooms/testkit.js';
import {
  env,
  LIVEKIT_TEST_ENV,
  newGame,
  runNight,
  startGame,
  stopPlaytestServer,
  toDay,
  VOTE_STEP_MS,
  type Game,
  type Player,
} from './playtestHarness.js';

/** Seat N's home, from the layout (no id conventions). */
const H = (seat: number) => homeBuilding(L, seat)!.id;
const PORT = 3317; // playtest range 3310-3319 (CLAUDE.md)

beforeAll(async () => {
  env.srv = await startTestServer(PORT, {
    rateLimits: { ticket: { capacity: 1000, refillPerSec: 1000 } },
    moduleFactories: {
      game: (host) => {
        const o: GameModuleOptions = { voteStepMs: VOTE_STEP_MS, bedtimeSeconds: 2 };
        env.optsByLobby.set(host.lobbyId, o);
        return createGameModule(host, o);
      },
    },
    env: { LOBBY_MAX_COUNT: '8', ...LIVEKIT_TEST_ENV },
  });
}, 30_000);

afterAll(async () => {
  const all = env.games.flatMap((g) => [g.st, ...g.players.map((p) => p.c)]);
  await Promise.all(all.map((c) => c.leave(true)));
  await stopPlaytestServer();
});

// ------------------------------------------------------------------------------------- helpers

const grants = (c: TestClient): VoiceGrant[] =>
  c.of('voice:grant').filter((g) => g.purpose === 'zone');

const lastZone = (c: TestClient): string | undefined => grants(c).at(-1)?.zone;
const lastRoom = (c: TestClient): string | undefined => grants(c).at(-1)?.room;

/** Every zone room this client has ever been granted. */
const roomsEverGranted = (c: TestClient): string[] => [...new Set(grants(c).map((g) => g.room))];

const myLocation = (p: Player): string | undefined =>
  (p.c.of('world:snapshot').at(-1) as WorldSnapshot | undefined)?.entities.find((e) => e.id === p.c.pid)?.location;

async function useDoor(p: Player, buildingId: string, expectLoc: string) {
  p.c.send('world:useDoor', { buildingId });
  await waitFor(() => myLocation(p) === expectLoc, 4000, `${p.name} through ${buildingId}`);
}

/**
 * Put a player inside a building the way the Storyteller panel does.
 *
 * A player can only use a door while standing at it (DOOR_RANGE_PX = 22), so a test cannot just
 * send `world:useDoor` for a cottage on the other side of town. The Storyteller's `teleport` stage
 * command is the real product path for placing someone, so use that.
 */
async function stPutInside(g: Game, p: Player, buildingId: string) {
  g.st.send('st:command', { type: 'teleport', who: [p.seat], to: { kind: 'building', buildingId } });
  await waitFor(() => myLocation(p) === `bld:${buildingId}`, 4000, `${p.name} placed in ${buildingId}`);
}

/**
 * Walk a player out onto the square if they are indoors.
 *
 * This matters: at dawn the engine deliberately moves NOBODY (players wake in bed and walk out
 * themselves), so at the start of a day every player is still inside their own home. A test that
 * assumes "day means outdoors" is testing the wrong town.
 */
async function goOutdoors(p: Player) {
  const loc = myLocation(p);
  if (!loc || !loc.startsWith('bld:')) return;
  await useDoor(p, loc.slice(4), 'outdoors');
}

/** Wait until this client's newest zone grant is for `zone`. */
async function awaitZone(c: TestClient, zone: string) {
  await waitFor(() => lastZone(c) === zone, 4000, `${c.name}: zone grant ${zone}`);
}

const chatTexts = (c: TestClient) => c.of('chat:message').map((m) => m.text);

/**
 * Send a chat message and return who received it. Waits for the sender's own copy first, then
 * settles, so "nobody else got it" is a real observation and not a race.
 */
async function sendChat(
  from: TestClient,
  text: string,
  everyone: TestClient[],
): Promise<{ got: TestClient[]; missed: TestClient[] }> {
  from.send('chat:send', { text });
  await waitFor(() => chatTexts(from).includes(text), 4000, `${from.name}: own chat copy`);
  await sleep(400);
  const got = everyone.filter((c) => chatTexts(c).includes(text));
  const missed = everyone.filter((c) => !chatTexts(c).includes(text));
  return { got, missed };
}

const names = (cs: TestClient[]) => cs.map((c) => c.name).sort();

// --------------------------------------------------------------------------------------- tests

describe('private rooms: voice grants and chat scoping agree', () => {
  it('day: two players alone in a cottage share one private room; nobody outside hears them', async () => {
    const g: Game = await newGame('vcp-day', 5, 4242);
    await startGame(g);
    await runNight(g);
    await toDay(g, true);

    const [p0, p1, p2, p3, p4] = g.players as [Player, Player, Player, Player, Player];
    const all = [g.st, ...g.players.map((p) => p.c)];

    // Dawn moves nobody, so everyone is still in their own home: walk them out first.
    for (const p of g.players) await goOutdoors(p);
    for (const c of all) await awaitZone(c, 'square');
    const squareRoom = lastRoom(p0.c)!;
    expect(squareRoom).toContain('-square');
    for (const c of all) expect(lastRoom(c), `${c.name} square`).toBe(squareRoom);

    // p0 and p1 step into p0's cottage together.
    // p0 walks into their own cottage (they are standing at its door), and the Storyteller shows
    // p1 in to join them — which is how a private conversation actually starts in this town.
    const house = H(p0.seat);
    await useDoor(p0, house, `bld:${house}`);
    await stPutInside(g, p1, house);
    await awaitZone(p0.c, `bld:${house}`);
    await awaitZone(p1.c, `bld:${house}`);

    // Both hold the SAME private room, and it is not the square.
    const privateRoom = lastRoom(p0.c)!;
    expect(lastRoom(p1.c)).toBe(privateRoom);
    expect(privateRoom).not.toBe(squareRoom);
    expect(privateRoom).toContain('-bld-');
    expect(grants(p0.c).at(-1)!.mode).toBe('private');

    // Everyone else is still on the square and was NEVER granted the cottage room.
    for (const p of [p2, p3, p4]) {
      expect(lastZone(p.c), `${p.name} zone`).toBe('square');
      expect(roomsEverGranted(p.c), `${p.name} rooms`).not.toContain(privateRoom);
    }
    expect(roomsEverGranted(g.st)).not.toContain(privateRoom);

    // Text chat follows voice exactly: the cottage pair, and nobody else.
    const inside = await sendChat(p0.c, 'vcp only-in-this-cottage', all);
    expect(names(inside.got)).toEqual(names([p0.c, p1.c]));
    expect(names(inside.missed)).toEqual(names([g.st, p2.c, p3.c, p4.c]));
    expect(p1.c.of('chat:message').find((m) => m.text === 'vcp only-in-this-cottage')!.scope).toBe('zone');

    // And the reverse direction: a square message never reaches the cottage.
    const outside = await sendChat(p2.c, 'vcp out-on-the-square', all);
    expect(names(outside.got)).toEqual(names([g.st, p2.c, p3.c, p4.c]));
    expect(names(outside.missed)).toEqual(names([p0.c, p1.c]));

    // Leaving puts them back on the shared square room.
    await useDoor(p0, house, 'outdoors');
    await awaitZone(p0.c, 'square');
    expect(lastRoom(p0.c)).toBe(squareRoom);
    const after = await sendChat(p2.c, 'vcp back-together', all);
    expect(after.got.map((c) => c.name)).toContain(p0.c.name);
    expect(after.missed.map((c) => c.name)).toContain(p1.c.name); // p1 is still inside
  }, 70_000);

  it('day: two separate cottages are two separate rooms that cannot hear each other', async () => {
    const g: Game = await newGame('vcp-two', 5, 909);
    await startGame(g);
    await runNight(g);
    await toDay(g, true);

    const [p0, p1, p2] = g.players as [Player, Player, Player];
    const all = [g.st, ...g.players.map((p) => p.c)];
    for (const p of g.players) await goOutdoors(p);
    for (const c of all) await awaitZone(c, 'square');

    const houseA = H(p0.seat);
    const houseB = H(p1.seat);
    await stPutInside(g, p0, houseA);
    await stPutInside(g, p1, houseB);
    await awaitZone(p0.c, `bld:${houseA}`);
    await awaitZone(p1.c, `bld:${houseB}`);

    const roomA = lastRoom(p0.c)!;
    const roomB = lastRoom(p1.c)!;
    expect(roomA).not.toBe(roomB);
    expect(roomsEverGranted(p1.c)).not.toContain(roomA);
    expect(roomsEverGranted(p0.c)).not.toContain(roomB);

    // Alone in a cottage, a message reaches only the sender.
    const solo = await sendChat(p0.c, 'vcp alone-in-A', all);
    expect(names(solo.got)).toEqual([p0.c.name]);
    expect(solo.missed.map((c) => c.name)).toContain(p1.c.name);
    expect(solo.missed.map((c) => c.name)).toContain(p2.c.name);
  }, 70_000);

  it('night: every player is alone in their own home and can whisper to nobody', async () => {
    const g: Game = await newGame('vcp-night', 5, 77);
    await startGame(g);

    const all = [g.st, ...g.players.map((p) => p.c)];
    // startGame leaves the game on the first night, with every player locked in their own home.
    for (const p of g.players) await awaitZone(p.c, `bld:${H(p.seat)}`);

    // Each home is a distinct room, and no player ever held another player's home room.
    const homeRooms = new Map(g.players.map((p) => [p.seat, lastRoom(p.c)!]));
    expect(new Set(homeRooms.values()).size).toBe(g.players.length);
    for (const p of g.players) {
      for (const [seat, room] of homeRooms) {
        if (seat === p.seat) continue;
        expect(roomsEverGranted(p.c), `${p.name} must never hold seat ${seat}'s home`).not.toContain(room);
      }
    }

    // A night message reaches only its sender (the ST is outdoors and has no room).
    const [p0, p1] = g.players as [Player, Player];
    const night = await sendChat(p0.c, 'vcp night-whisper', all);
    expect(names(night.got)).toEqual([p0.c.name]);
    expect(night.missed.map((c) => c.name)).toContain(p1.c.name);
    expect(night.missed.map((c) => c.name)).toContain(g.st.name);
  }, 70_000);

  it('night: a Storyteller visit is a private room with that player only', async () => {
    const g: Game = await newGame('vcp-visit', 5, 31337);
    await startGame(g);

    const [p0, p1, p2] = g.players as [Player, Player, Player];
    const all = [g.st, ...g.players.map((p) => p.c)];
    for (const p of g.players) await awaitZone(p.c, `bld:${H(p.seat)}`);
    const p0Home = lastRoom(p0.c)!;

    // Before the visit the Storyteller holds no zone room at all (outdoors at night).
    expect(roomsEverGranted(g.st)).not.toContain(p0Home);

    // The Storyteller walks into p0's home.
    g.st.send('st:command', { type: 'visit_home', seat: p0.seat });
    await awaitZone(g.st, `bld:${H(p0.seat)}`);
    expect(lastRoom(g.st)).toBe(p0Home);

    // Chat in the visited home: the Storyteller and the visited player, nobody else.
    const visit = await sendChat(p0.c, 'vcp visited-me', all);
    expect(names(visit.got)).toEqual(names([p0.c, g.st]));
    expect(names(visit.missed)).toEqual(names([p1.c, p2.c, ...g.players.slice(3).map((p) => p.c)]));

    // And the Storyteller's reply goes only to that player. (The ST's own chat is scoped the same
    // way; `storyteller` scope is the private channel, so assert on the recipients, not the scope.)
    const reply = await sendChat(g.st, 'vcp storyteller-reply', all);
    expect(reply.got.map((c) => c.name)).toContain(p0.c.name);
    expect(reply.missed.map((c) => c.name)).toContain(p1.c.name);

    // Leaving the home drops the Storyteller's grant; the other players' streams never mentioned it.
    g.st.send('st:command', { type: 'leave_home' });
    await sleep(500);
    for (const p of [p1, p2]) {
      expect(roomsEverGranted(p.c), `${p.name} must never see the visited home`).not.toContain(p0Home);
      // Non-visited players are never told anything about a visit.
      expect(JSON.stringify(p.c.of('game:view'))).not.toContain('storytellerVisitingYou":true');
    }
  }, 70_000);

  it('a member never holds two zone rooms at once, across a full day/night cycle', async () => {
    const g: Game = await newGame('vcp-one', 5, 5150);
    await startGame(g);
    await runNight(g);
    await toDay(g, true);

    const [p0] = g.players as [Player];
    for (const p of g.players) await goOutdoors(p);
    await awaitZone(p0.c, 'square');
    const house = H(p0.seat);
    await useDoor(p0, house, `bld:${house}`);
    await awaitZone(p0.c, `bld:${house}`);
    await useDoor(p0, house, 'outdoors');
    await awaitZone(p0.c, 'square');

    // Walk the message stream: every grant after the first must be preceded by a revoke, so the
    // client is never authorised for two rooms at the same time.
    const stream = p0.c.messages.filter((m) => m.type === 'voice:grant' || m.type === 'voice:revoke');
    let held: string | null = null;
    for (const m of stream) {
      if (m.type === 'voice:grant') {
        const gr = m.payload as VoiceGrant;
        if (gr.purpose !== 'zone') continue;
        // Re-granting the SAME room is a token refresh and is fine.
        if (held !== null && held !== gr.room) {
          throw new Error(`held ${held} and was granted ${gr.room} without a revoke in between`);
        }
        held = gr.room;
      } else {
        held = null;
      }
    }
  }, 70_000);
});
