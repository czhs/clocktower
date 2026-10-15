// Network adversity + client races (qa-deploy). Bots talk to the real server through an in-process
// TCP proxy that adds latency/jitter/loss-like stalls (tests/support/netem.ts), and the suite
// provokes the races that matter on game night. Every test checks that state stays consistent
// across the server's views (lobby:view, game:view, directory API).
import { Client } from 'colyseus.js';
import { afterAll, describe, expect, it } from 'vitest';
import type { LobbyRoomView, PlayerGameView, WorldTeleport } from '../../packages/protocol/src/index.js';
import { Bot, makeBots } from '../support/bot.js';
import { pending } from '../support/features.js';
import { setupGame, until } from '../support/game.js';
import { startNetem, type NetemProxy } from '../support/netem.js';
import { pickPort, startServer } from '../support/server.js';
import { sleep, suiteServer, uniq } from '../support/suite.js';

const { server, features } = await suiteServer({ env: { LOBBY_MAX_COUNT: '40' } });
const all: Bot[] = [];
const proxies: NetemProxy[] = [];
afterAll(async () => {
  await Promise.all(all.map((b) => b.leave().catch(() => undefined)));
  await Promise.all(proxies.map((p) => p.close()));
});

async function netem(opts: Parameters<typeof startNetem>[1]) {
  const p = await startNetem(server.port, opts, await pickPort());
  proxies.push(p);
  return p;
}

function pct(v: number[], p: number) {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!) : null;
}

/** Everyone in the lobby agrees on the member list, and the directory agrees on the player count. */
async function assertConsistent(bots: Bot[], lobbyId: string) {
  await until(() => {
    const views = bots.filter((b) => b.room).map((b) => JSON.stringify((b.lobbyView as LobbyRoomView).members.map((m) => [m.pid, m.role, m.seat])));
    return views.length > 0 && views.every((v) => v === views[0]);
  }, 8000, 'all connected bots share the same member list');
  const v = bots.find((b) => b.room)!.lobbyView as LobbyRoomView;
  const players = v.members.filter((m) => m.role === 'player').length;
  const r = await bots[0]!.api.getLobby(lobbyId);
  expect(r.body.lobby.playerCount).toBe(players);
  expect(new Set(v.members.map((m) => m.pid)).size).toBe(v.members.length);
}

describe.skipIf(!features.rooms)(`network adversity${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('a game day under 150±50 ms one-way latency and 3% loss stalls stays consistent', async () => {
    const proxy = await netem({ latencyMs: 150, jitterMs: 50, lossRate: 0.03 });
    const g = await setupGame(proxy.url, proxy.wsUrl, { players: 7 }).catch((e) => {
      console.log(`[adversity] setup failed: ${(e as Error).message || (e as Error).name}; requests on server-closed connections: ${JSON.stringify(proxy.stats.writesAfterUpstreamClosed)}`);
      throw e;
    });
    expect(g, 'game module').toBeTruthy();
    const bots = [g!.st, ...g!.players];
    all.push(...bots);
    for (const b of bots) {
      b.exitBuildings = true;
      b.startWandering(10);
      b.startPinging(1000);
    }
    await sleep(15_000);
    for (const b of bots) b.stopActivity();
    await sleep(1500);
    const rtts = bots.flatMap((b) => b.ping.rtts);
    const corrections = bots.reduce((a, b) => a + b.recorder.ofType<WorldTeleport>('world:teleport').filter((t) => t.reason === 'correction').length, 0);
    const moves = bots.reduce((a, b) => a + b.recorder.txFrames, 0);
    console.log(
      `[adversity] RTT p50 ${pct(rtts, 50)} / p95 ${pct(rtts, 95)} / max ${pct(rtts, 100)} ms; corrections ${corrections} of ~${moves} C2S frames; proxy stalls ${proxy.stats.stalls}/${proxy.stats.chunks}`,
    );
    expect(bots.every((b) => b.room !== null), 'nobody disconnected').toBe(true);
    expect(bots.flatMap((b) => b.errors)).toEqual([]);
    expect(pct(rtts, 50)!).toBeGreaterThanOrEqual(250); // the proxy really applied ~300 ms RTT
    // Measured finding (2026-10-14): ~2.7% of valid moves are corrected (rubber-banding) when 3% of
    // chunks stall 200-600 ms: the server's burst allowance (0.6 s) is exceeded by stall+latency.
    // Guard against regressions beyond that; the rate is reported above.
    expect(corrections / Math.max(1, moves)).toBeLessThan(0.05);
    await assertConsistent(bots, g!.lobbyId);
    const phases = new Set(g!.players.map((p) => (p.gameView as PlayerGameView).phase));
    expect([...phases]).toEqual(['day']);
    // Positions converge: what each bot believes == what the server last sent about it.
    for (const b of bots) {
      const snap = b.recorder.last<any>('world:snapshot');
      const me = snap?.entities.find((e: any) => e.id === b.pid);
      if (me && b.pos) expect(Math.hypot(me.x - b.pos.x, me.y - b.pos.y), `${b.name} position drift`).toBeLessThan(4);
    }
  }, 120_000);

  it('a network drop mid-game (all sockets reset) -> every bot reconnects to its own seat', async () => {
    const proxy = await netem({ latencyMs: 40, jitterMs: 20 });
    const g = await setupGame(proxy.url, proxy.wsUrl, { players: 5 });
    const bots = [g!.st, ...g!.players];
    all.push(...bots);
    const pidsBefore = bots.map((b) => b.pid);
    const seatsBefore = g!.players.map((p) => (p.gameView as PlayerGameView).you.seat);
    proxy.dropAll();
    await until(() => bots.every((b) => b.room === null), 8000, 'all sockets closed by the drop');
    const t0 = Date.now();
    await Promise.all(bots.map((b) => b.reconnect()));
    await until(() => bots.every((b) => b.gameView), 8000, 'game views re-sent after reconnect');
    console.log(`[adversity] all ${bots.length} reconnected in ${Date.now() - t0} ms after a full network drop`);
    expect(bots.map((b) => b.pid)).toEqual(pidsBefore);
    expect(g!.players.map((p) => (p.gameView as PlayerGameView).you.seat)).toEqual(seatsBefore);
    await assertConsistent(bots, g!.lobbyId);
  }, 90_000);
});

describe.skipIf(!features.rooms)(`client races${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('rapid inputs: a burst of 200 moves and 51 ready toggles end in a consistent state', async () => {
    const [h, x] = await makeBots(2, uniq('rapid-'), server.url, server.wsUrl);
    all.push(h!, x!);
    const L = await h!.createLobby(uniq('Rapid '), 5);
    await h!.join(L);
    await x!.join(L);
    await until(() => x!.recorder.last('world:snapshot'), 5000, 'snapshot');
    const start = { ...x!.pos! };
    for (let i = 0; i < 200; i++) x!.send('move', { seq: 10_000 + i, x: start.x + (i % 2 ? 1 : 0), y: start.y, facing: 'right', moving: true });
    for (let i = 0; i < 51; i++) x!.send('lobby:ready', { ready: i % 2 === 0 });
    await sleep(2500);
    expect(x!.room, 'not disconnected by the burst').not.toBeNull();
    const me = h!.lobbyView!.members.find((m) => m.pid === x!.pid)!;
    const rateLimited = x!.recorder.ofType<{ code: string }>('error').filter((e) => e.code === 'rate_limited').length;
    console.log(`[adversity] burst: ready=${me.ready}, rate_limited errors=${rateLimited}`);
    // Either all toggles were applied (final = true) or the tail was rate-limited; never a crash.
    expect(typeof me.ready).toBe('boolean');
    x!.send('lobby:ready', { ready: true });
    await until(() => h!.lobbyView!.members.find((m) => m.pid === x!.pid)!.ready, 8000, 'ready settles after the burst');
    await assertConsistent([h!, x!], L);
  });

  it('two simultaneous joins for the last slot: exactly one wins (x5)', async () => {
    for (let round = 0; round < 5; round++) {
      const bots = await makeBots(6, uniq(`last${round}-`), server.url, server.wsUrl);
      all.push(...bots);
      const L = await bots[0]!.createLobby(uniq('Last '), 5);
      for (const b of bots.slice(0, 4)) await b.join(L);
      const [t1, t2] = await Promise.all([bots[4]!.api.ticket(L), bots[5]!.api.ticket(L)]);
      // Fire both joins at once; let each settle (accepted or rejected) without a client-side deadline,
      // then judge by the SERVER's state, not by how fast a lobby:view reached a busy test worker.
      const racers = [bots[4]!, bots[5]!];
      const outcomes = await Promise.allSettled(
        [t1, t2].map((t, i) => (t.status === 200 ? racers[i]!.joinWithTicket(t.body) : Promise.reject(new Error(`ticket ${t.status}`)))),
      );
      const host = bots[0]!;
      await until(() => host.lobbyView?.members.length === 5, 15_000, 'host sees a settled member list');
      await sleep(300);
      const seated = racers.filter((r) => host.lobbyView!.members.some((m) => m.displayName === r.name));
      expect(seated.length, `round ${round}: racers seated per server (${outcomes.map((o) => o.status).join('/')})`).toBe(1);
      // The loser's socket must not linger as a hidden member.
      const loser = racers.find((r) => !seated.includes(r))!;
      await until(() => loser.room === null || !host.lobbyView!.members.some((m) => m.pid === loser.pid), 10_000, 'loser not a member');
      await assertConsistent(bots.slice(0, 4), L);
      expect((await bots[0]!.api.getLobby(L)).body.lobby.playerCount).toBe(5);
    }
  }, 90_000);

  it('the same account joining twice at once ends with exactly one seat', async () => {
    const [h, x] = await makeBots(2, uniq('dupj-'), server.url, server.wsUrl);
    all.push(h!, x!);
    const L = await h!.createLobby(uniq('DupJoin '), 5);
    await h!.join(L);
    const twin = new Bot(x!.name, server.url, server.wsUrl);
    for (const [k, v] of x!.api.cookies) twin.api.cookies.set(k, v); // same session, second "tab"
    all.push(twin);
    const [ta, tb] = await Promise.all([x!.getTicket(L), twin.getTicket(L)]);
    await Promise.allSettled([x!.joinWithTicket(ta), twin.joinWithTicket(tb)]);
    await sleep(1500);
    const mine = h!.lobbyView!.members.filter((m) => m.displayName === x!.name);
    expect(mine).toHaveLength(1);
    const open = [x!, twin].filter((b) => b.room !== null);
    expect(open.length, 'exactly one live socket for the account').toBe(1);
    await assertConsistent([h!], L);
  });

  it('reconnect while the old socket is still open: one seat, old socket replaced', async () => {
    const [h, x] = await makeBots(2, uniq('reopen-'), server.url, server.wsUrl);
    all.push(h!, x!);
    const L = await h!.createLobby(uniq('Reopen '), 5);
    await h!.join(L);
    await x!.join(L);
    await until(() => x!.pid, 5000, 'pid');
    const pid = x!.pid;
    // (a) Colyseus reconnection token used from a second client while the first is still open.
    const c2 = new Client(server.wsUrl);
    const viaToken = await c2.reconnect(x!.room!.reconnectionToken).then(
      (r) => r,
      (e) => e as Error,
    );
    await sleep(800);
    const tokenOutcome = viaToken instanceof Error ? `rejected (${viaToken.message})` : `accepted; old socket ${x!.room ? 'still open' : `closed ${x!.lastCloseCode}`}`;
    if (!(viaToken instanceof Error)) await viaToken.leave(false).catch(() => undefined);
    // (b) a fresh 'reconnect' ticket while the old socket is open -> takeover (newest wins, 4002).
    const second = new Bot(x!.name, server.url, server.wsUrl);
    for (const [k, v] of x!.api.cookies) second.api.cookies.set(k, v);
    all.push(second);
    await second.join(L, 'reconnect');
    await until(() => second.lobbyView?.youPid === pid, 6000, 'second socket owns the same pid');
    console.log(`[adversity] reconnection token while open: ${tokenOutcome}; reconnect ticket while open: old closed with ${x!.lastCloseCode}`);
    expect(h!.lobbyView!.members.filter((m) => m.pid === pid)).toHaveLength(1);
    await assertConsistent([h!, second], L);
  });

  it('a player joining while the Storyteller presses Start: consistent outcome (x3)', async () => {
    for (let round = 0; round < 3; round++) {
      const g = await setupGame(server.url, server.wsUrl, { players: 5, maxPlayers: 6, noStart: true, prefix: uniq(`st${round}-`) });
      const [late] = await makeBots(1, uniq('late-'), server.url, server.wsUrl);
      all.push(g!.st, ...g!.players, late!);
      const t = await late!.getTicket(g!.lobbyId);
      const joined = late!.joinWithTicket(t).then(
        () => late!.waitFor('lobby:view', () => true, 3000).then(() => true),
        () => false,
      );
      g!.st.send('lobby:start', {});
      const lateIn = await joined.catch(() => false);
      await sleep(2500);
      const started = (g!.st.gameView as any)?.kind === 'storyteller';
      const lobby = (await g!.st.api.getLobby(g!.lobbyId)).body.lobby;
      const members = g!.st.lobbyView!.members.filter((m) => m.role === 'player');
      const gamePlayers = started ? (g!.st.gameView as any).players.length : null;
      console.log(`[adversity] start race ${round}: started=${started} lateJoined=${lateIn} lobbyPlayers=${members.length} gamePlayers=${gamePlayers} dirCount=${lobby.playerCount}`);
      if (started) {
        // The game roster is frozen at start: whoever is in the game has a seat; nobody is half-in.
        expect(gamePlayers).toBe(lobby.playerCount);
        const lateSeated = members.some((m) => m.pid === late!.pid);
        expect(lateSeated ? gamePlayers === 6 : gamePlayers === 5).toBe(true);
      } else {
        expect(lobby.phase).toBe('waiting');
        expect(members.length).toBe(lobby.playerCount);
      }
    }
  }, 120_000);

  it('12 concurrent create-lobby requests (6 accounts x 2) never exceed LOBBY_MAX_COUNT=4 and never 500', async () => {
    const s4 = await startServer({ env: { LOBBY_MAX_COUNT: '4' } });
    try {
      const hosts = await makeBots(6, uniq('dupc-'), s4.url, s4.wsUrl);
      const h = hosts[0];
      const rs = await Promise.all(hosts.flatMap((b) => [0, 1].map(() => b.api.createLobby({ name: 'Same name', maxPlayers: 5 }))));
      const codes = rs.map((r) => r.status);
      console.log(`[adversity] 12 concurrent creates (max 4) -> ${JSON.stringify(codes)} ${JSON.stringify([...new Set(rs.filter((r) => r.status >= 400).map((r) => (r.body as any).error))])}`);
      expect(codes.every((c) => c < 500)).toBe(true);
      expect(codes.filter((c) => c < 300).length).toBeLessThanOrEqual(4);
      const list = await h!.api.listLobbies();
      expect(list.body.lobbies.length).toBeLessThanOrEqual(4);
      expect(list.body.lobbies.length).toBe(codes.filter((c) => c < 300).length);
    } finally {
      await s4.stop();
    }
  });
});
