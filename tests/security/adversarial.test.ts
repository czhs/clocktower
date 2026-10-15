// Adversarial WebSocket clients inside a real running game (qa-deploy): forged Storyteller commands,
// votes for other seats, double votes, impossible moves ("teleports"), move floods, forged prompt
// answers — plus a full scripted game (2 days, a night visit, poison, kill, execution, reveal)
// scanned at the protocol level for any leak of other players' character/alignment/poison/visit.
import { afterAll, describe, expect, it } from 'vitest';
import type { PlayerGameView, WorldSnapshot, WorldTeleport } from '../../packages/protocol/src/index.js';
import type { Bot } from '../support/bot.js';
import { pending } from '../support/features.js';
import { nominateAndVote, playFullGame, safeNominee, setupGame, toNight, until } from '../support/game.js';
import { findLeaks } from '../support/recorder.js';
import { forbiddenKeysIn, nonPublicPlayerKeys, strayAlignments, strayCharacters } from '../support/secrecy.js';
import { sleep, suiteServer } from '../support/suite.js';

const { server, features } = await suiteServer({ env: { LOBBY_MAX_COUNT: '16' } });
const all: Bot[] = [];
afterAll(async () => {
  await Promise.all(all.map((b) => b.leave().catch(() => undefined)));
});
const healthy = async () => (await fetch(`${server.url}/healthz`)).status === 200;
const errorsOf = (b: Bot, since = 0) => b.recorder.messages.filter((m) => m.type === 'error' && m.at >= since).map((m) => m.payload as { code: string; for?: string });

describe.skipIf(!features.rooms)(`adversarial clients in a running game${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('forged Storyteller commands from a player change nothing', async () => {
    const g = (await setupGame(server.url, server.wsUrl, { players: 5 }))!;
    all.push(g.st, ...g.players);
    const mallory = g.players[0]!;
    const before = JSON.stringify(g.stView()!.grimoire.map((e) => [e.seat, e.character, e.alive, e.poisoned]));
    const t0 = Date.now();
    for (const c of [
      { type: 'kill', seat: g.seatOf.get(g.players[1]!)!, announce: true },
      { type: 'change_character', seat: g.seatOf.get(mallory)!, character: 'imp', alignment: 'evil', notify: true },
      { type: 'declare_winner', winner: 'evil', reason: 'pwned' },
      { type: 'advance_phase', to: 'night' },
      { type: 'set_status', seat: 0, poisoned: true },
      { type: 'visit_home', seat: 0 },
      { type: 'announce', text: 'forged announcement' },
    ])
      mallory.send('st:command', c);
    await sleep(1500);
    expect(JSON.stringify(g.stView()!.grimoire.map((e) => [e.seat, e.character, e.alive, e.poisoned]))).toBe(before);
    expect(g.stView()!.phase).toBe('day');
    expect(errorsOf(mallory, t0).filter((e) => e.code === 'forbidden').length).toBeGreaterThanOrEqual(1);
    expect(findLeaks(g.players.map((p) => p.recorder), ['forged announcement', 'pwned'])).toEqual([]);
  });

  it('votes cannot be cast for other seats, doubled, or changed after the hand passes', async () => {
    const g = (await setupGame(server.url, server.wsUrl, { players: 7 }))!;
    all.push(g.st, ...g.players);
    const { nominee, nominator, entry } = safeNominee(g);
    const cheater = g.players.find((p) => p !== nominee && p !== nominator)!;
    const honest = g.players.filter((p) => p !== nominee && p !== cheater);
    g.cmd({ type: 'set_nominations_open', open: true });
    await until(() => (nominator.gameView as PlayerGameView)?.day?.nominationsOpen, 5000, 'open');
    nominator.send('game:nominate', { nomineeSeat: entry.seat });
    const nom = await until(() => g.stView()?.day?.nominations[0], 5000, 'nomination');
    g.cmd({ type: 'start_vote', nominationId: nom.id });
    await until(() => (cheater.gameView as PlayerGameView)?.day?.nominations[0]?.status === 'voting', 5000, 'voting');
    // Cheater: try to vote on behalf of every other seat (extra fields), and spam its own vote.
    for (const p of g.players) cheater.send('game:vote', { nominationId: nom.id, vote: true, seat: g.seatOf.get(p), voterSeat: g.seatOf.get(p), pid: p.pid });
    for (let i = 0; i < 20; i++) cheater.send('game:vote', { nominationId: nom.id, vote: true });
    honest.slice(0, 1).forEach((p) => p.send('game:vote', { nominationId: nom.id, vote: true }));
    const tallied = await until(() => g.stView()?.day?.nominations.find((n) => n.id === nom.id && n.status === 'tallied'), 30_000, 'tally');
    const yes = Object.entries(tallied.votes).filter(([, v]) => v).map(([s]) => Number(s)).sort();
    const expected = [g.seatOf.get(cheater)!, g.seatOf.get(honest[0]!)!].sort();
    expect(yes).toEqual(expected); // only the two real voters, each counted once
    expect(tallied.voteCount).toBe(2);
    // After the hand passed: changing the vote is refused.
    const t0 = Date.now();
    cheater.send('game:vote', { nominationId: nom.id, vote: false });
    await sleep(700);
    expect(g.stView()!.day!.nominations.find((n) => n.id === nom.id)!.voteCount).toBe(2);
    expect(errorsOf(cheater, t0).length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('a dead player gets exactly one ghost vote; a second one is refused', async () => {
    const g = (await setupGame(server.url, server.wsUrl, { players: 7 }))!;
    all.push(g.st, ...g.players);
    // Pick roles so no rule side-effect interferes (Trouble Brewing): the ghost is a good player who
    // is not the Saint/Virgin (killing the Imp would end the game; a Virgin nominee executes a
    // Townsfolk nominator on the spot); nominees are non-Virgin; each nominator nominates once.
    const char = (p: Bot) => g.grimoire.find((e) => e.seat === g.seatOf.get(p))!;
    const ghost = g.players.find((p) => char(p).alignment === 'good' && !['saint', 'virgin', 'mayor'].includes(char(p).character))!;
    g.cmd({ type: 'kill', seat: g.seatOf.get(ghost)!, announce: true });
    await until(() => (ghost.gameView as PlayerGameView)?.you.alive === false, 5000, 'ghost dead');
    const living = g.players.filter((p) => p !== ghost);
    const nominees = living.filter((p) => !['virgin', 'saint'].includes(char(p).character)).slice(0, 2);
    const nominators = living.filter((p) => !nominees.includes(p)).slice(0, 2);
    const tally1 = await nominateAndVote(g, nominators[0]!, g.seatOf.get(nominees[0]!)!, [ghost]);
    const tally2 = await nominateAndVote(g, nominators[1]!, g.seatOf.get(nominees[1]!)!, [ghost]);
    const gs = g.seatOf.get(ghost)!;
    expect(tally1.votes[gs]).toBe(true);
    expect(tally2.votes[gs], 'spent ghost vote must not count (absent or false)').not.toBe(true);
    expect(tally2.voteCount).toBe(0);
    expect((ghost.gameView as PlayerGameView).you.ghostVoteAvailable).toBe(false);
    // A dead player cannot nominate.
    const t0 = Date.now();
    ghost.send('game:nominate', { nomineeSeat: g.seatOf.get(nominators[0]!)! });
    await sleep(600);
    expect(errorsOf(ghost, t0).length).toBeGreaterThanOrEqual(1);
  }, 90_000);

  it('impossible moves (teleports, walls, leaving home at night) are corrected and never shown to others', async () => {
    const g = (await setupGame(server.url, server.wsUrl, { players: 5 }))!;
    all.push(g.st, ...g.players);
    const [cheat, witness] = g.players as [Bot, Bot];
    for (const b of g.players) {
      b.exitBuildings = true;
      b.startWandering(10);
    }
    await until(() => g.players.every((p) => p.location === 'outdoors'), 20_000, 'everyone outdoors');
    cheat.stopActivity();
    witness.stopActivity();
    const t0 = Date.now();
    const p = cheat.pos!;
    const targets = [
      { x: p.x + 600, y: p.y },
      { x: 5, y: 5 },
      { x: 1e7, y: -1e7 },
    ];
    for (const [i, t] of targets.entries()) cheat.send('move', { seq: 900_000 + i, x: t.x, y: t.y, facing: 'down', moving: true });
    await sleep(1200);
    const corrections = cheat.recorder.ofType<WorldTeleport>('world:teleport').filter((t) => cheat.recorder.messages.find((m) => m.payload === t)!.at >= t0);
    expect(corrections.length, 'server corrected the cheater').toBeGreaterThanOrEqual(1);
    for (const s of witness.recorder.messages.filter((m) => m.type === 'world:snapshot' && m.at >= t0).map((m) => m.payload as WorldSnapshot)) {
      const e = s.entities.find((x) => x.id === cheat.pid);
      if (e) expect(Math.hypot(e.x - p.x, e.y - p.y), 'witness saw a teleported position').toBeLessThan(60);
    }
    // Night: a player may not leave home.
    for (const b of g.players) b.stopActivity();
    await toNight(g);
    await until(() => cheat.location.startsWith('bld:'), 8000, 'sent home');
    const home = cheat.location;
    const t1 = Date.now();
    const b = (await import('../../packages/assets/src/index.js')).townLayout.buildings.find((x) => `bld:${x.id}` === home)!;
    cheat.send('world:useDoor', { buildingId: b.id });
    await sleep(800);
    expect(cheat.location).toBe(home);
    void t1;
    expect(await healthy()).toBe(true);
  }, 90_000);

  it('a move flood (2000 frames) is rate-limited and does not stall other members', async () => {
    const g = (await setupGame(server.url, server.wsUrl, { players: 5 }))!;
    all.push(g.st, ...g.players);
    const [flooder, other] = g.players as [Bot, Bot];
    other.startPinging(200);
    const p = flooder.pos ?? { x: 0, y: 0 };
    for (let i = 0; i < 2000; i++) {
      try {
        flooder.send('move', { seq: 500_000 + i, x: p.x, y: p.y, facing: 'down', moving: false });
      } catch {
        break;
      }
    }
    await sleep(3000);
    other.stopActivity();
    const rtts = other.ping.rtts.slice(-10);
    expect(Math.max(...rtts), "the other member's RTT stays low during the flood").toBeLessThan(250);
    expect(errorsOf(flooder).some((e) => e.code === 'rate_limited') || flooder.room === null).toBe(true);
    expect(await healthy()).toBe(true);
  });

  it('forged prompt answers and unknown nomination ids are rejected', async () => {
    const g = (await setupGame(server.url, server.wsUrl, { players: 5 }))!;
    all.push(g.st, ...g.players);
    const m = g.players[0]!;
    const t0 = Date.now();
    m.send('game:promptResponse', { promptId: 'not-a-prompt', seats: [0, 1] });
    m.send('game:vote', { nominationId: 'd1-nom99', vote: true });
    m.send('game:slayerShot', { targetSeat: g.seatOf.get(g.players[1]!)! }); // allowed attempt; only a real Slayer can kill
    await sleep(800);
    expect(errorsOf(m, t0).length).toBeGreaterThanOrEqual(2);
    const victim = g.stView()!.grimoire.find((e) => e.seat === g.seatOf.get(g.players[1]!))!;
    const shooter = g.grimoire.find((e) => e.seat === g.seatOf.get(m))!;
    if (shooter.character !== 'slayer') expect(victim.alive).toBe(true);
  });
});

describe.skipIf(!features.rooms)(`full scripted game: no cross-player secret ever reaches a player${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('2 days, night visit, poison, kill, execution, winner — scanned per message', async () => {
    const g = (await setupGame(server.url, server.wsUrl, { players: 9 }))!;
    all.push(g.st, ...g.players);
    for (const p of g.players) {
      p.exitBuildings = true;
      p.startWandering(8);
    }
    await playFullGame(g);
    for (const p of g.players) p.stopActivity();
    await sleep(500);
    const st = g.stView()!;
    expect(st.phase).toBe('finished');
    const poisonedSeats = new Set(st.grimoire.filter((e) => e.poisoned).map((e) => e.seat));
    for (const p of g.players) {
      // Only messages received BEFORE the public reveal.
      const revealAt = p.recorder.messages.find((m) => m.type === 'game:view' && (m.payload as any)?.result)?.at ?? Infinity;
      const pre = p.recorder.messages.filter((m) => m.at < revealAt);
      const mySeat = g.seatOf.get(p)!;
      expect(forbiddenKeysIn(pre), `${p.name}: ST-only keys`).toEqual([]);
      expect(nonPublicPlayerKeys(pre), `${p.name}: non-public players[] keys`).toEqual([]);
      const own = (p.gameView as PlayerGameView).you.role?.character;
      expect(strayCharacters(pre).filter((x) => x.character !== own), `${p.name}: other characters`).toEqual([]);
      expect(strayAlignments(pre), `${p.name}: other alignments`).toEqual([]);
      // storytellerVisitingYou only ever true for the visited seat (the night victim).
      const visitedTrue = pre.filter((m) => m.type === 'game:view' && (m.payload as any).storytellerVisitingYou).length;
      const wasVisited = pre.some((m) => m.type === 'sound' && (m.payload as any)?.cue === 'visit');
      if (visitedTrue) expect(wasVisited, `${p.name} saw storytellerVisitingYou without being visited`).toBe(true);
      expect(wasVisited, `${p.name} visit cue routing`).toBe(poisonedSeats.has(mySeat)); // the ST visited exactly the poisoned seat
      // Private info ("You feel unwell.") only to the poisoned/visited player.
      const gotUnwell = pre.some((m) => m.json.includes('You feel unwell.'));
      expect(gotUnwell, `${p.name} info routing`).toBe(poisonedSeats.has(mySeat));
    }
    // After the reveal everyone sees every character (public by design).
    for (const p of g.players) expect((p.gameView as PlayerGameView).result!.reveal).toHaveLength(9);
  }, 120_000);
});
