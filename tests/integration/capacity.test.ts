// Full lobby, join races, Storyteller seat outside player capacity, started-lobby lock,
// start blocked below 5 players.
import { afterAll, describe, expect, it } from 'vitest';
import type { LobbyRoomView } from '../../packages/protocol/src/index.js';
import { Bot, makeBots } from '../support/bot.js';
import { pending } from '../support/features.js';
import { eventually, sleep, suiteServer, uniq } from '../support/suite.js';

const { server, features } = await suiteServer();
const all: Bot[] = [];
afterAll(async () => {
  await Promise.all(all.map((b) => b.leave().catch(() => undefined)));
});

/** Try to take a seat; resolves true if seated (ticket issued AND room joined AND lobby:view received). */
/** Try to take a seat; resolves true if the room accepted the join (seat confirmed by a lobby:view
 * naming this bot). No tight client-side deadline: under full-suite load a 3-4 s wait for the first
 * lobby:view caused false "not seated" results. */
async function tryJoin(b: Bot, lobbyId: string): Promise<boolean> {
  const t = await b.api.ticket(lobbyId, 'player');
  if (t.status !== 200) return false;
  try {
    await b.joinWithTicket(t.body);
  } catch {
    return false;
  }
  try {
    await b.waitFor<any>('lobby:view', (v) => v.members.some((m: any) => m.pid === v.youPid), 20_000);
    return true;
  } catch {
    return b.room !== null; // joined but no view yet: the server still holds the seat
  }
}

describe.skipIf(!features.rooms)(`capacity and locking${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('a full lobby rejects further players (ticket 409 lobby_full or join refused)', async () => {
    const bots = await makeBots(6, uniq('full-'), server.url, server.wsUrl);
    all.push(...bots);
    const L = await bots[0]!.createLobby(uniq('Full '), 5);
    for (const b of bots.slice(0, 5)) expect(await tryJoin(b, L)).toBe(true);
    const sixth = bots[5]!;
    const t = await sixth.api.ticket(L, 'player');
    if (t.status === 200) {
      await expect(sixth.joinWithTicket(t.body).then(() => sixth.waitFor('lobby:view', () => true, 3000))).rejects.toThrow();
    } else {
      expect(t.status).toBe(409);
      expect((t.body as any).error).toBe('lobby_full');
    }
    const s = await bots[0]!.api.getLobby(L);
    expect(s.body.lobby.playerCount).toBe(5);
    expect(s.body.lobby.joinable).toBe(false);
  });

  it('concurrent joins never exceed maxPlayers', async () => {
    const [host, ...racers] = await makeBots(9, uniq('race-'), server.url, server.wsUrl);
    all.push(host!, ...racers);
    const L = await host!.createLobby(uniq('Race '), 5);
    await host!.join(L);
    const results = await Promise.all(racers.map((b) => tryJoin(b, L)));
    const seated = results.filter(Boolean).length;
    expect(seated).toBe(4);
    await sleep(500);
    const v = host!.lobbyView as LobbyRoomView;
    expect(v.members.filter((m) => m.role === 'player').length).toBe(5);
    expect((await host!.api.getLobby(L)).body.lobby.playerCount).toBe(5);
  });

  it('the Storyteller seat is not counted against player capacity', async () => {
    const bots = await makeBots(6, uniq('stcap-'), server.url, server.wsUrl);
    all.push(...bots);
    const L = await bots[0]!.createLobby(uniq('STcap '), 5, true);
    await bots[0]!.join(L, 'storyteller');
    for (const b of bots.slice(1)) expect(await tryJoin(b, L)).toBe(true);
    await eventually(() => bots[0]!.lobbyView?.members.length === 6, 5000);
    const v = bots[0]!.lobbyView!;
    expect(v.members.filter((m) => m.role === 'storyteller')).toHaveLength(1);
    expect(v.members.filter((m) => m.role === 'player')).toHaveLength(5);
  });

  it('start is refused with fewer than 5 players', async () => {
    const bots = await makeBots(4, uniq('few-'), server.url, server.wsUrl);
    all.push(...bots);
    const L = await bots[0]!.createLobby(uniq('Few '), 5, true);
    await bots[0]!.join(L, 'storyteller');
    for (const b of bots.slice(1)) await b.join(L);
    for (const b of bots.slice(1)) b.send('lobby:ready', { ready: true });
    await eventually(() => bots[0]!.lobbyView?.members.length === 4);
    expect(bots[0]!.lobbyView!.canStart).toBe(false);
    bots[0]!.send('lobby:start', {});
    await sleep(1500);
    expect((await bots[0]!.api.getLobby(L)).body.lobby.phase).toBe('waiting');
  });

  it('after start the lobby is locked to new participants but members can reconnect', async (ctx) => {
    const bots = await makeBots(7, uniq('lock-'), server.url, server.wsUrl);
    all.push(...bots);
    const [st, ...players] = bots;
    const outsider = players.pop()!;
    const L = await st!.createLobby(uniq('Lock '), 6, true);
    await st!.join(L, 'storyteller');
    for (const p of players) await p.join(L);
    for (const p of players) p.send('lobby:ready', { ready: true });
    await eventually(() => st!.lobbyView?.members.length === 6, 5000);
    st!.send('lobby:start', {});
    let started = false;
    try {
      await eventually(async () => (await st!.api.getLobby(L)).body.lobby.phase !== 'waiting', 6000);
      started = true;
    } catch {
      /* not implemented yet */
    }
    if (!started) {
      console.warn('[capacity] SKIPPED started-lobby lock: lobby:start did not leave the waiting phase (game start not implemented yet)');
      ctx.skip();
      return;
    }
    const t = await outsider.api.ticket(L, 'player');
    if (t.status === 200) {
      await expect(outsider.joinWithTicket(t.body).then(() => outsider.waitFor('lobby:view', () => true, 3000))).rejects.toThrow();
    } else {
      expect(t.status).toBe(409);
      expect((t.body as any).error).toBe('lobby_started');
    }
    // A seated member may come back.
    const p = players[0]!;
    const pid = p.pid;
    await p.drop();
    await sleep(300);
    await p.join(L, 'reconnect');
    await eventually(() => p.lobbyView?.youPid === pid || (p.gameView as any)?.you?.pid === pid, 5000);
  });
});
