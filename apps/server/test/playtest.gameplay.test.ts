// OWNED BY gameplay. Real-server playtests (GameRoom + real Game/World/Voice modules, colyseus.js
// clients) of "walking, not teleporting", the nomination circle and the Storyteller's "props":
//   * 5 players: day errands -> gather -> force seats -> vote with the clock hand -> execution ->
//     bedtime: one player stuck in another cottage + one in the street are ESCORTED home after the
//     countdown (door transitions only, no teleport), night falls only when all are home, the night
//     shows each player only their own home, morning: nobody is moved, players walk out themselves.
//   * 10 players: every force / teleport / walk / freeze / door command, ST overrides while the
//     engine disagrees (force phase with someone on the block, second execution, re-vote, block
//     edits, nominations by the dead), a forced night while someone is en route (the one allowed
//     teleport), and secrecy of the stage (presence only in the ST view; `you` only in your own
//     snapshot; night snapshots contain only yourself).
import { townLayout as L } from '@ct/assets';
import { circleSpots, homeBuilding, tileCenterPx, type PlayerGameView, type StCommand, type StorytellerGameView, type WorldSnapshot, type WorldTeleport } from '@ct/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameModule, type GameModuleOptions } from '../src/game/index.js';
import { sleep, startTestServer, waitFor } from '../src/rooms/testkit.js';
import { findPath, type Pt } from '../src/world/path.js';
import { env, LIVEKIT_TEST_ENV, newGame, nominate, runNight, startGame, toDay, VOTE_STEP_MS, waitAfter, type Game, type Player } from './playtestHarness.js';

/** Layout-driven ids (no id conventions): seat N's home, and two public (non-house) buildings. */
const H = (seat: number) => homeBuilding(L, seat)!.id;
const [PUB1] = L.buildings.filter((b) => b.kind !== "house").map((b) => b.id) as [string];
const PORT = 3381; // gameplay range 3380-3389

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
  await env.srv?.close();
}, 30_000);

// ------------------------------------------------------------------------------------- helpers

const snap = (p: Player) => p.c.last('world:snapshot') as WorldSnapshot | undefined;
const me = (p: Player) => snap(p)?.entities.find((e) => e.id === p.pid);
const tps = (p: Player, since = 0) => p.c.of('world:teleport').slice(since) as WorldTeleport[];
const stage = (g: Game) => g.stView().stage!;
const presence = (g: Game, seat: number) => stage(g).players.find((x) => x.seat === seat)!.presence;
const seqs = new Map<Player, number>();

/** The player walks themselves (like TownScene: ~0.9x walking speed, 15 Hz moves) to `to`. */
async function walkSelf(p: Player, to: Pt) {
  const e = await waitFor(() => me(p), 3000, 'own entity');
  const path = findPath(L, { x: e.x, y: e.y }, to, e.location);
  expect(path, `${p.name}: path to ${to.x},${to.y}`).not.toBeNull();
  let x = e.x;
  let y = e.y;
  const step = (72 * 0.9) / 15;
  let seq = seqs.get(p) ?? 10_000;
  for (const wp of path!) {
    for (;;) {
      const d = Math.hypot(wp.x - x, wp.y - y);
      const k = Math.min(1, step / Math.max(d, 1e-9));
      x += (wp.x - x) * k;
      y += (wp.y - y) * k;
      p.c.send('move', { seq: ++seq, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, facing: 'down', moving: true });
      await sleep(66);
      if (d <= step) break;
    }
  }
  p.c.send('move', { seq: ++seq, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, facing: 'down', moving: false });
  seqs.set(p, seq);
  await sleep(150);
}

async function useDoor(p: Player, buildingId: string, expectLoc: string) {
  p.c.send('world:useDoor', { buildingId });
  await waitFor(() => me(p)?.location === expectLoc, 3000, `${p.name} through ${buildingId}`);
}

/** Every game:view a player ever received is free of ST-only stage data. */
function noStageLeak(g: Game) {
  for (const p of g.players)
    for (const v of p.c.of('game:view')) {
      const j = JSON.stringify(v);
      expect(j).not.toContain('"stage"');
      expect(j).not.toContain('presence');
      expect(j).not.toContain('timerHeld');
    }
}

/** At night every player's snapshots contain only themselves (and never a `you` for someone else). */
function nightSnapshotsClean(g: Game, since: Map<Player, number>) {
  for (const p of g.players) {
    const snaps = p.c.messages.slice(since.get(p)).filter((m) => m.type === 'world:snapshot').map((m) => m.payload as WorldSnapshot);
    expect(snaps.length).toBeGreaterThan(0);
    for (const s of snaps) {
      for (const e of s.entities) if (e.id !== p.pid && e.id !== g.stPid) throw new Error(`${p.name} saw ${e.id} at night`);
      expect(s.entities.some((e) => e.id === p.pid)).toBe(true);
    }
  }
}

async function cmd(g: Game, c: StCommand, until?: (v: StorytellerGameView) => boolean) {
  return g.cmd(c, until ? { until } : {});
}

// --------------------------------------------------------------------------------------- tests

describe('gameplay playtest: walking home, the nomination circle, the vote clock', () => {
  it('N=5: errands -> gather -> force seats -> clock-hand vote -> execution -> escorted bedtime -> night -> walk out', async () => {
    const g = await newGame('Walk', 5, 551, { bedtimeSeconds: 2 });
    await startGame(g, ['imp', 'poisoner', 'washerwoman', 'empath', 'chef']);
    await runNight(g);
    await toDay(g, true);
    // Morning: nobody was moved at dawn/day; everyone wakes in bed.
    for (const p of g.players) {
      expect(me(p)!.location).toBe(`bld:${H(p.seat)}`);
      const bed = tileCenterPx(L, L.buildings.find((b) => b.id === H(p.seat))!.bed!);
      expect(Math.hypot(me(p)!.x - bed.x, me(p)!.y - bed.y)).toBeLessThan(1);
    }
    // Seat 2 walks out of their cottage by themselves (doors unlocked by day).
    const p2 = g.bySeat(2);
    const h2 = L.buildings.find((b) => b.id === H(2))!;
    await walkSelf(p2, tileCenterPx(L, h2.interiorDoor));
    await useDoor(p2, H(2), 'outdoors');
    expect(tps(p2).filter((t) => t.reason === 'correction')).toEqual([]);
    await waitFor(() => presence(g, 2) === 'outdoors' || presence(g, 2) === 'walking', 3000, 'presence outdoors');

    // Gather: everyone gets a spot; players walk (seat 2 walks, the ST walks seat 3), the rest are forced.
    await cmd(g, { type: 'gather', on: true }, (v) => !!v.gathering);
    for (const p of g.players) await waitFor(() => g.pv(p).gathering === true, 3000, 'gathering public');
    const spots = circleSpots(L, [0, 1, 2, 3, 4]);
    await walkSelf(p2, spots[2]!);
    await waitFor(() => presence(g, 2) === 'seated', 3000, 'seat 2 seated');
    await cmd(g, { type: 'walk_to', who: [3], to: { kind: 'seat' } });
    await waitFor(() => snap(g.bySeat(3))?.you?.mode === 'auto', 3000, 'seat 3 escorted to the circle');
    await waitFor(() => presence(g, 3) === 'seated', 30_000, 'seat 3 walked to the circle');
    expect(tps(g.bySeat(3)).filter((t) => t.reason === 'storyteller')).toEqual([]);
    await cmd(g, { type: 'teleport', who: 'all', to: { kind: 'seat' } });
    await waitFor(() => stage(g).players.every((x) => x.presence === 'seated'), 3000, 'everyone seated');

    // Nomination + vote: the clock hand (currentVoterSeat) walks clockwise; raised hands are public.
    await cmd(g, { type: 'set_nominations_open', open: true }, (v) => !!v.day?.nominationsOpen);
    const id = await nominate(g, g.bySeat(2), 1);
    for (const s of [0, 2, 3]) g.bySeat(s).votePlan.set(id, true);
    await cmd(g, { type: 'start_vote', nominationId: id });
    const seen: number[] = [];
    await waitFor(
      () => {
        const n = g.pv(g.bySeat(4)).day!.nominations.find((x) => x.id === id)!;
        if (n.currentVoterSeat !== null && seen.at(-1) !== n.currentVoterSeat) seen.push(n.currentVoterSeat);
        return n.status === 'tallied';
      },
      10_000,
      'tally',
    );
    expect(seen.length).toBeGreaterThanOrEqual(3);
    const order = [2, 3, 4, 0, 1];
    expect(seen.every((s, i) => i === 0 || order.indexOf(s) > order.indexOf(seen[i - 1]!))).toBe(true); // clockwise from the nominee
    const n = g.pv(g.bySeat(4)).day!.nominations.find((x) => x.id === id)!;
    expect(n.voteCount).toBe(3);
    await g.cmd({ type: 'execute', seat: 1 }, { until: (v) => v.day?.executedSeat === 1 });

    // Bedtime: seat 0 wanders into seat 4's cottage, seat 3 dawdles in the square, the rest walk home.
    await cmd(g, { type: 'gather', on: false }, (v) => !v.gathering);
    await cmd(g, { type: 'teleport', who: [0], to: { kind: 'building', buildingId: H(4) } });
    await cmd(g, { type: 'walk_to', who: [1, 2, 4], to: { kind: 'home' } });
    await waitFor(() => [1, 2, 4].every((s) => presence(g, s) === 'home'), 40_000, 'walkers home');
    // Door tags (daytime): public, identical for everyone, ghost for the executed seat 1, never the ST.
    const tagsOf = (p: Player) => JSON.stringify(snap(p)?.doorTags ?? null);
    await waitFor(() => snap(g.bySeat(3))?.doorTags?.[H(4)]?.some((t) => t.pid === g.bySeat(0).pid), 3000, 'door tag for seat 0 at seat 4\'s house');
    await sleep(200);
    const dayTags = tagsOf(g.bySeat(3));
    for (const p of g.players) expect(tagsOf(p)).toBe(dayTags);
    expect(snap(g.bySeat(3))!.doorTags![H(1)]).toEqual([{ pid: g.bySeat(1).pid, ghost: true }]);
    await cmd(g, { type: 'visit_home', seat: 2 });
    await sleep(400);
    for (const p of g.players) expect(tagsOf(p), 'ST in a house by day changes no tags').toBe(dayTags);
    await cmd(g, { type: 'leave_home' });
    const since = new Map(g.players.map((p) => [p, p.c.messages.length]));
    const bell = new Map(g.players.map((p) => [p, tps(p).length]));
    await cmd(g, { type: 'advance_phase', to: 'bedtime' }, (v) => v.phase === 'bedtime');
    for (const p of g.players) await waitFor(() => g.pv(p).phase === 'bedtime', 3000, 'bedtime public');
    // the bell moves nobody
    await sleep(500);
    for (const p of g.players) expect(tps(p, bell.get(p))).toEqual([]);
    // countdown (2 s) -> overtime: the stragglers are escorted
    await waitFor(() => g.stView().bedtimeOvertime === true, 6000, 'overtime');
    await waitFor(() => snap(g.bySeat(0))?.you?.mode === 'auto' && snap(g.bySeat(3))?.you?.mode === 'auto', 3000, 'escort visible to the escorted');
    expect(g.stView().phase).toBe('bedtime'); // night waits for them
    expect(snap(g.bySeat(2))?.you).toBeUndefined();
    await waitFor(() => g.stView().phase === 'night', 60_000, 'night once everyone is home');
    for (const p of g.players) {
      const after = tps(p, bell.get(p));
      expect(after.every((t) => t.reason === 'door'), `${p.name}: ${JSON.stringify(after.map((t) => t.reason))}`).toBe(true);
      expect(me(p)?.location ?? `bld:${H(p.seat)}`).toBe(`bld:${H(p.seat)}`);
    }
    expect(tps(g.bySeat(0), bell.get(g.bySeat(0))).map((t) => t.location)).toEqual(['outdoors', `bld:${H(0)}`]);
    // Night: tuck-in walks and the escort leak nothing; no door tags from bedtime through dawn.
    const nightSince = new Map(g.players.map((p) => [p, p.c.messages.length]));
    await sleep(1500);
    nightSnapshotsClean(g, nightSince);
    const bedtimeOn = since;
    noStageLeak(g);
    // Morning: woken in bed, nobody teleported; a player walks out on their own.
    await runNight(g);
    const dawn = new Map(g.players.map((p) => [p, tps(p).length]));
    await g.cmd({ type: 'advance_phase', to: 'dawn' }, { until: (v) => v.phase === 'dawn' });
    for (const p of g.players) {
      const from = p.c.messages.findIndex((m, i) => i >= bedtimeOn.get(p)! && m.type === 'game:view' && (m.payload as PlayerGameView).phase === 'bedtime');
      expect(from).toBeGreaterThan(0);
      const night = p.c.messages.slice(from).filter((m) => m.type === 'world:snapshot').map((m) => m.payload as WorldSnapshot);
      expect(night.length).toBeGreaterThan(10);
      expect(night.filter((x) => x.doorTags !== undefined), `${p.name}: door tags between bedtime and dawn`).toEqual([]);
    }
    await toDay(g, false);
    await sleep(300);
    for (const p of g.players) expect(tps(p, dawn.get(p))).toEqual([]);
    const p4 = g.bySeat(4);
    await walkSelf(p4, tileCenterPx(L, L.buildings.find((b) => b.id === H(4))!.interiorDoor));
    await useDoor(p4, H(4), 'outdoors');
  }, 240_000);

  it('N=5: the FIRST night walks too: setup -> ring the bell -> everyone walks / is escorted home -> first night, no teleport', async () => {
    const g = await newGame('First', 5, 571, { bedtimeSeconds: 2 });
    const since = new Map(g.joined.map((j) => [j.c, j.c.messages.length]));
    g.st.send('lobby:start', {});
    const ps: { c: (typeof g.joined)[number]['c']; seat: number }[] = [];
    for (const j of g.joined) {
      const v = (await waitAfter(j.c, since.get(j.c)!, 'game:view', (x) => x.kind === 'player', 8000)) as PlayerGameView;
      ps.push({ c: j.c, seat: v.you.seat });
    }
    await waitFor(() => g.st.last('game:view')?.kind === 'storyteller', 5000, 'ST view');
    await g.cmd({ type: 'random_setup' }, { until: (v) => !!v.charactersAssigned });
    await waitFor(() => ps.every((p) => (p.c.last('world:snapshot') as WorldSnapshot | undefined)?.entities.some((e) => e.location === 'outdoors')), 5000, 'players in town');
    const n0 = new Map(ps.map((p) => [p, p.c.of('world:teleport').length]));
    await g.cmd({ type: 'advance_phase', to: 'bedtime' }, { until: (v) => v.phase === 'bedtime' });
    expect(g.stView().bedtimeFirstNight).toBe(true);
    for (const p of ps) expect((p.c.last('game:view') as PlayerGameView).you.role).toBeNull(); // nothing revealed yet
    await waitFor(() => g.stView().bedtimeOvertime === true || g.stView().phase === 'first_night', 8000, 'countdown over');
    await waitFor(() => g.stView().phase === 'first_night', 120_000, 'first night once everyone is home');
    for (const p of ps) {
      const after = p.c.of('world:teleport').slice(n0.get(p));
      expect(after.every((t) => t.reason === 'door'), `seat ${p.seat}: ${JSON.stringify(after.map((t) => t.reason))}`).toBe(true);
      await waitFor(() => (p.c.last('game:view') as PlayerGameView).you.role, 3000, 'role revealed at the first night');
    }
    expect(g.stView().nightQueue.some((x) => x.character === 'minion_info' || x.character === 'demon_info' || x.status === 'pending')).toBe(true);
  }, 180_000);

  it('N=10: every Storyteller prop, overrides while the engine disagrees, a forced night (the one teleport), stage secrecy', async () => {
    const g = await newGame('Props', 10, 1010, { bedtimeSeconds: 2 });
    await startGame(g, ['imp', 'poisoner', 'saint', 'washerwoman', 'empath', 'chef', 'monk', 'soldier', 'ravenkeeper', 'mayor']);
    await runNight(g);
    await toDay(g, false);
    const P = (s: number) => g.bySeat(s);

    // ---- freeze
    await cmd(g, { type: 'freeze', who: [5], frozen: true }, (v) => !!v.stage?.players.find((x) => x.seat === 5)?.frozen);
    await waitFor(() => snap(P(5))?.you?.mode === 'frozen', 3000, 'frozen visible to the player');
    expect(snap(P(6))?.you).toBeUndefined();
    const e5 = me(P(5))!;
    P(5).c.send('move', { seq: 50_000, x: e5.x, y: e5.y - 3, facing: 'up', moving: true });
    await P(5).c.waitMsg('world:teleport', (t) => t.reason === 'correction' && t.seq === 50_000);
    seqs.set(P(5), 50_000);
    await cmd(g, { type: 'freeze', who: 'all', frozen: false }, (v) => !v.stage?.players.some((x) => x.frozen));

    // ---- door tags setting (generic ST settings)
    expect(g.stView().settings).toMatchObject({ doorTags: true });
    await cmd(g, { type: 'set_setting', settings: { doorTags: false } }, (v) => v.settings?.doorTags === false);
    await sleep(300);
    for (const p of g.players) await waitFor(() => snap(p) && snap(p)!.doorTags === undefined, 3000, 'tags off');
    await cmd(g, { type: 'set_setting', settings: { doorTags: true } }, (v) => v.settings?.doorTags === true);
    await waitFor(() => !!snap(P(1))?.doorTags, 3000, 'tags back on');

    // ---- teleport to every target; only the moved player is told
    const others = new Map([1, 2].map((s) => [s, tps(P(s)).length]));
    await cmd(g, { type: 'teleport', who: [6], to: { kind: 'square' } });
    await waitFor(() => me(P(6))?.location === 'outdoors', 3000, 'square');
    await cmd(g, { type: 'teleport', who: [6], to: { kind: 'building', buildingId: PUB1 } });
    await waitFor(() => presence(g, 6) === 'inside', 3000, PUB1);
    await cmd(g, { type: 'teleport', who: [6], to: { kind: 'storyteller' } });
    await waitFor(() => me(P(6))?.location === g.stView().stage!.storytellerLocation, 3000, 'next to the ST');
    const sq = tileCenterPx(L, L.playerSpawn);
    await cmd(g, { type: 'teleport', who: [6], to: { kind: 'point', x: sq.x, y: sq.y } });
    await waitFor(() => Math.hypot(me(P(6))!.x - sq.x, me(P(6))!.y - sq.y) < 40, 3000, 'map point');
    await cmd(g, { type: 'teleport', who: [6], to: { kind: 'home' } });
    await waitFor(() => presence(g, 6) === 'home', 3000, 'home');
    for (const [s, n] of others) expect(tps(P(s), n)).toEqual([]);

    // ---- doors
    await cmd(g, { type: 'door_lock', buildingId: H(7), lock: 'locked' }, (v) => v.stage?.doors[H(7)] === true);
    await waitFor(() => snap(P(1))?.doors?.[H(7)] === true, 3000, 'door lock public');
    const h7 = L.buildings.find((b) => b.id === H(7))!;
    await walkSelf(P(7), tileCenterPx(L, h7.interiorDoor));
    const errs = P(7).c.of('error').length;
    P(7).c.send('world:useDoor', { buildingId: H(7) });
    await waitFor(() => P(7).c.of('error').slice(errs).find((e) => /locked/.test(e.message)), 3000, 'locked door');
    await cmd(g, { type: 'door_lock', buildingId: H(7), lock: 'default' }, (v) => v.stage?.doors[H(7)] === undefined);
    await useDoor(P(7), H(7), 'outdoors');

    // ---- gather + force seats
    await cmd(g, { type: 'force_phase', to: 'gather' }, (v) => !!v.gathering);
    await cmd(g, { type: 'teleport', who: 'all', to: { kind: 'seat' } });
    await waitFor(() => stage(g).players.every((x) => x.presence === 'seated'), 3000, 'all seated');

    // ---- votes: nominations by the dead / repeats, re-votes, edits, block, executions
    await cmd(g, { type: 'kill', seat: 9, announce: true }, (v) => !v.players[9]!.alive);
    await cmd(g, { type: 'create_nomination', nominatorSeat: 9, nomineeSeat: 2, startVote: true }, (v) => v.day?.nominations.at(-1)?.status === 'voting');
    const nom = g.stView().day!.nominations.at(-1)!.id;
    await cmd(g, { type: 'close_vote', mode: 'cancel' }, (v) => v.day?.nominations.find((x) => x.id === nom)?.status === 'pending');
    await cmd(g, { type: 'force_vote', nominationId: nom }, (v) => v.day?.nominations.find((x) => x.id === nom)?.status === 'voting');
    await cmd(g, { type: 'close_vote', mode: 'tally' }, (v) => v.day?.nominations.find((x) => x.id === nom)?.status === 'tallied');
    for (const s of [0, 1, 3, 4, 5]) await cmd(g, { type: 'set_vote', nominationId: nom, seat: s, vote: true });
    await waitFor(() => g.stView().day!.onTheBlock?.seat === 2, 3000, 'the Saint on the block via edited votes');
    for (const p of g.players) await waitFor(() => g.pv(p).day?.onTheBlock?.seat === 2, 3000, 'block is public');
    await cmd(g, { type: 'set_block', seat: 4, votes: 7 }, (v) => v.day?.onTheBlock?.seat === 4);
    // force night with someone on the block: NOT executed (engine alerts, never blocks)
    await cmd(g, { type: 'force_phase', to: 'bedtime' }, (v) => v.phase === 'bedtime');
    expect(g.stView().alerts.join('\n')).toMatch(/NOT executed/);
    expect(g.stView().players[4]!.alive).toBe(true);
    // ---- bedtime timer: hold, then extend; seat 8 dawdles in the street
    await cmd(g, { type: 'bedtime_timer', action: 'pause' }, (v) => !!v.timerHeld);
    await cmd(g, { type: 'walk_to', who: [0, 1, 2, 3, 4, 5, 6, 7, 9], to: { kind: 'home' } });
    await waitFor(() => [0, 1, 2, 3, 4, 5, 6, 7, 9].every((s) => presence(g, s) === 'home'), 60_000, 'nine walked home');
    await sleep(500);
    expect(g.stView().phase).toBe('bedtime'); // held: no overtime, no night
    await cmd(g, { type: 'bedtime_timer', action: 'extend', seconds: 30 }, (v) => (v.bedtimeRemainingMs ?? 0) > 20_000);
    // ---- forced night while seat 8 is still en route: the one allowed teleport
    const t8 = tps(P(8)).length;
    const tAll = new Map(g.players.map((p) => [p, tps(p).length]));
    await cmd(g, { type: 'force_phase', to: 'night' }, (v) => v.phase === 'night');
    const forced = await waitFor(() => tps(P(8), t8).find((t) => t.reason === 'night'), 3000, 'forced-night teleport');
    expect(forced.location).toBe(`bld:${H(8)}`);
    await sleep(300);
    for (const s of [0, 1, 2, 3, 4, 5, 6, 7, 9]) expect(tps(P(s), tAll.get(P(s))), `seat ${s} was home: not teleported`).toEqual([]);
    const nightSince = new Map(g.players.map((p) => [p, p.c.messages.length]));
    // a door forced open at night is a prop too: seat 3 may step out (and sees nobody)
    await cmd(g, { type: 'door_lock', buildingId: H(3), lock: 'unlocked' }, (v) => v.stage?.doors[H(3)] === false);
    await walkSelf(P(3), tileCenterPx(L, L.buildings.find((b) => b.id === H(3))!.interiorDoor));
    await useDoor(P(3), H(3), 'outdoors');
    await cmd(g, { type: 'teleport', who: [3], to: { kind: 'home' } });
    await cmd(g, { type: 'door_lock', buildingId: H(3), lock: 'default' });
    await sleep(800);
    nightSnapshotsClean(g, nightSince);
    // ---- end the night immediately, then a second execution and "no execution"
    await cmd(g, { type: 'force_phase', to: 'day' }, (v) => v.phase === 'day');
    await cmd(g, { type: 'force_execute', seat: 7 }, (v) => v.day?.executedSeat === 7);
    await cmd(g, { type: 'force_execute', seat: 6 }, (v) => v.day?.executedSeat === 6);
    expect(g.stView().alerts.join('\n')).toMatch(/second execution/);
    await cmd(g, { type: 'force_execute', seat: null }, (v) => v.day?.nominationsOpen === false);
    // ---- re-send info
    await cmd(g, { type: 'send_info', seat: 5, info: { text: 'You hear a bell.' } });
    const info = g.stView().grimoire[5]!.info!.at(-1)!;
    await cmd(g, { type: 'resend_info', seat: 5, infoId: info.id }, (v) => v.grimoire[5]!.info!.length >= 2);
    await waitFor(() => g.pv(P(5)).info.filter((i) => i.text === 'You hear a bell.').length === 2, 3000, 'info re-sent');
    expect(g.pv(P(4)).info.some((i) => i.text === 'You hear a bell.')).toBe(false);
    // ---- every prop also works backwards: setup and the first night again
    await cmd(g, { type: 'force_phase', to: 'setup' }, (v) => v.phase === 'setup');
    await cmd(g, { type: 'force_phase', to: 'first_night' }, (v) => v.phase === 'first_night');
    // stage data never reached a player
    noStageLeak(g);
    const pv = g.pv(P(0)) as PlayerGameView;
    expect(Object.keys(pv)).not.toContain('stage');
  }, 240_000);
});
