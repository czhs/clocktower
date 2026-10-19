// Real Colyseus integration tests for the GameRoom lifecycle (lobby-auth). The gameplay modules
// are deterministic fakes (testkit.fakeModules) so the lifecycle is tested independently of the
// other teams' work in progress; room.realmodules.test.ts smoke-tests the real factories.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CLOSE_CODES, type LobbySummary } from '@ct/protocol';
import {
  api,
  createLobby,
  fakeModules,
  getTicket,
  makeAccount,
  sleep,
  startTestServer,
  TestClient,
  waitFor,
  type TestServer,
} from '../src/rooms/testkit.js';

const PORT = 3331;
let srv: TestServer;
const fakes = fakeModules();
const open: TestClient[] = [];

beforeAll(async () => {
  srv = await startTestServer(PORT, {
    moduleFactories: fakes.factories,
    waitingGraceSec: 1,
    env: { LOBBY_MAX_COUNT: '40' },
    rateLimits: { createLobby: { capacity: 100, refillPerSec: 100 }, ticket: { capacity: 100, refillPerSec: 100 } },
  });
});
afterAll(async () => {
  await srv?.close();
});
afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.leave(true)));
});

function track(c: TestClient): TestClient {
  open.push(c);
  return c;
}

async function join(cookie: string, lobbyId: string, intent: 'player' | 'storyteller' | 'reconnect' = 'player', name = 'c') {
  return track(await TestClient.join(srv, cookie, lobbyId, intent, name));
}

async function summary(lobbyId: string, cookie: string): Promise<LobbySummary> {
  return (await api(srv, 'GET', `/api/lobbies/${lobbyId}`, { cookie })).body.lobby;
}

async function seatLobby(nPlayers: number, opts: { maxPlayers?: number; ready?: boolean; prefix?: string } = {}) {
  const prefix = opts.prefix ?? `L${Math.random().toString(36).slice(2, 6)}`;
  const host = await makeAccount(srv, `${prefix}-ST`);
  const lobby = await createLobby(srv, host.cookie, { name: `${prefix} lobby`, maxPlayers: opts.maxPlayers ?? 15, takeStoryteller: true });
  const st = await join(host.cookie, lobby.id, 'storyteller', `${prefix}-ST`);
  const players: TestClient[] = [];
  const accounts: Awaited<ReturnType<typeof makeAccount>>[] = [];
  for (let i = 0; i < nPlayers; i++) {
    const a = await makeAccount(srv, `${prefix}-${i}`);
    accounts.push(a);
    players.push(await join(a.cookie, lobby.id, 'player', `${prefix}-${i}`));
  }
  await st.view((v) => v.members.filter((m) => m.role === 'player' && m.connected).length === nPlayers);
  for (const p of players) await p.view();
  if (opts.ready) {
    for (const p of players) p.send('lobby:ready', { ready: true });
    await st.view((v) => v.canStart);
  }
  return { lobby, host, st, players, accounts };
}

async function startGame(st: TestClient, players: TestClient[]) {
  st.send('lobby:start', {});
  await Promise.all(players.map((p) => p.waitMsg('game:view')));
}

describe('GameRoom lifecycle (real Colyseus, fake gameplay modules)', () => {
  it('two lobbies run simultaneously and are fully isolated', async () => {
    const A = await seatLobby(2, { prefix: 'Alpha' });
    const B = await seatLobby(2, { prefix: 'Bravo' });
    expect(A.st.last('lobby:view')!.members.find((m) => m.role === 'storyteller')!.isHost).toBe(true);
    for (const [i, c] of [A.st, ...A.players].entries()) c.send('chat:send', { text: `secret-alpha-${i}` });
    for (const [i, c] of [B.st, ...B.players].entries()) c.send('chat:send', { text: `secret-bravo-${i}` });
    for (const c of [A.st, ...A.players]) await waitFor(() => c.of('chat:message').length >= 3, 3000, 'alpha chat');
    for (const c of [B.st, ...B.players]) await waitFor(() => c.of('chat:message').length >= 3, 3000, 'bravo chat');
    await sleep(200);
    const pidsA = A.st.last('lobby:view')!.members.map((m) => m.pid);
    const pidsB = B.st.last('lobby:view')!.members.map((m) => m.pid);
    const accountIds = [A.host, ...A.accounts, B.host, ...B.accounts].map((a) => a.account.id);
    for (const c of [B.st, ...B.players]) {
      const dump = JSON.stringify(c.messages);
      expect(dump).not.toContain('secret-alpha');
      expect(dump).not.toContain('Alpha');
      expect(dump).not.toContain(A.lobby.id);
      for (const pid of pidsA) expect(dump).not.toContain(pid);
    }
    for (const c of [A.st, ...A.players]) {
      const dump = JSON.stringify(c.messages);
      expect(dump).not.toContain('secret-bravo');
      expect(dump).not.toContain(B.lobby.id);
      for (const pid of pidsB) expect(dump).not.toContain(pid);
    }
    // Account ids never reach any client.
    for (const c of [A.st, ...A.players, B.st, ...B.players]) {
      const dump = JSON.stringify(c.messages);
      for (const id of accountIds) expect(dump).not.toContain(id);
    }
    const chat = A.players[0]!.of('chat:message');
    expect(chat.every((m) => m.scope === 'zone' || m.scope === 'storyteller')).toBe(true);
  });

  it('a user can leave lobby A and join lobby B; counts update in the directory', async () => {
    const A = await seatLobby(2);
    const B = await seatLobby(1);
    const mover = A.players[0]!;
    const cookie = A.accounts[0]!.cookie;
    expect((await summary(A.lobby.id, cookie)).playerCount).toBe(2);
    mover.send('lobby:leave', {});
    await mover.leave(true);
    await waitFor(async () => (await summary(A.lobby.id, cookie)).playerCount === 1, 3000, 'A count');
    await A.st.view((v) => v.members.filter((m) => m.role === 'player').length === 1);
    const again = await join(cookie, B.lobby.id, 'player', 'mover');
    await again.view();
    await B.st.view((v) => v.members.filter((m) => m.role === 'player').length === 2);
    expect((await summary(B.lobby.id, cookie)).playerCount).toBe(2);
    expect((await summary(A.lobby.id, cookie)).playerCount).toBe(1);
  });

  it('full lobby: concurrent joins are atomic and extra players are rejected', async () => {
    const host = await makeAccount(srv, 'FullHost');
    const lobby = await createLobby(srv, host.cookie, { maxPlayers: 5 });
    const accts = await Promise.all(Array.from({ length: 7 }, (_, i) => makeAccount(srv, `F${i}`)));
    // All 7 obtain tickets while the lobby is empty (advisory check passes), then race.
    const tickets = await Promise.all(accts.map((a) => getTicket(srv, a.cookie, lobby.id)));
    expect(tickets.every((t) => t.status === 200)).toBe(true);
    const results = await Promise.allSettled(tickets.map((t, i) => TestClient.joinWithTicket(srv, t.body, `F${i}`)));
    const ok = results.filter((r): r is PromiseFulfilledResult<TestClient> => r.status === 'fulfilled');
    ok.forEach((r) => track(r.value));
    expect(ok).toHaveLength(5);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected).toHaveLength(2);
    for (const r of rejected) expect(String(r.reason?.message ?? r.reason)).toMatch(/full/i);
    const s = await waitFor(async () => {
      const x = await summary(lobby.id, host.cookie);
      return x.playerCount === 5 ? x : undefined;
    });
    expect((await s).joinable).toBe(false);
    const late = await makeAccount(srv, 'Late');
    const t = await getTicket(srv, late.cookie, lobby.id);
    expect(t.status).toBe(409);
    expect(t.body.error).toBe('lobby_full');
    // The Storyteller seat is separate from player capacity.
    const st = await join(host.cookie, lobby.id, 'storyteller', 'FullST');
    const v = await st.view((x) => x.members.length === 6);
    expect(v.members.filter((m) => m.role === 'player')).toHaveLength(5);
    expect(v.lobby.storytellerSeatOpen).toBe(false);
  });

  it('start: only the ST, with 5+ ready players; seats shuffled 0..n-1; game_started emitted', async () => {
    const L = await seatLobby(5);
    const v0 = await L.st.view();
    expect(v0.canStart).toBe(false);
    expect(v0.startBlockers.join(' ')).toMatch(/not ready/);
    // Non-ST cannot start or send ST commands.
    L.players[0]!.send('lobby:start', {});
    L.players[0]!.send('st:command', { type: 'random_setup' });
    await waitFor(() => L.players[0]!.of('error').length >= 2, 3000, 'errors');
    expect(L.players[0]!.of('error').map((e) => [e.code, e.for])).toEqual([
      ['forbidden', 'lobby:start'],
      ['forbidden', 'st:command'],
    ]);
    // ST cannot start while blockers exist.
    L.st.send('lobby:start', {});
    const err = await L.st.waitMsg('error', (e) => e.for === 'lobby:start');
    expect(err.code).toBe('phase');
    for (const p of L.players) p.send('lobby:ready', { ready: true });
    const ready = await L.st.view((v) => v.canStart);
    expect(ready.startBlockers).toEqual([]);
    expect(L.players[0]!.last('lobby:view')!.canStart).toBe(false); // only the ST may start
    await startGame(L.st, L.players);
    const game = fakes.registry.games.get(L.lobby.id)!;
    expect(game.started!.seats.map((s) => s.seat).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(game.events.find((e) => e.type === 'game_started')).toBeTruthy();
    const view = await L.st.view((v) => v.lobby.phase === 'day');
    expect(view.members.filter((m) => m.role === 'player').map((m) => m.seat).sort()).toEqual([0, 1, 2, 3, 4]);
    // Each client receives only its own game view.
    for (const p of L.players) {
      const views = p.of('game:view') as unknown as { kind: string; you: { pid: string } }[];
      expect(views.every((gv) => gv.kind === 'player' && gv.you.pid === p.pid)).toBe(true);
    }
    expect((L.st.last('game:view') as { kind: string }).kind).toBe('storyteller');
    // Players still cannot use ST commands in game; the ST can.
    L.players[1]!.send('st:command', { type: 'begin_first_night' });
    await L.players[1]!.waitMsg('error', (e) => e.for === 'st:command');
    L.st.send('st:command', { type: 'begin_first_night' });
    await waitFor(() => game.stCalls.length === 1, 3000, 'st call');
    expect(game.stCalls[0]!.pid).toBe(L.st.pid);
    // Player game messages reach the module only from players.
    L.players[2]!.send('game:nominate', { nomineeSeat: 1 });
    L.st.send('game:nominate', { nomineeSeat: 1 });
    await waitFor(() => game.playerCalls.length === 1, 3000, 'player call');
    await L.st.waitMsg('error', (e) => e.for === 'game:nominate');
  });

  it('started lobby rejects newcomers but restores a member to the same seat (fresh ticket or reconnection token)', async () => {
    const L = await seatLobby(5, { ready: true });
    const newcomer = await makeAccount(srv, 'Newcomer');
    const early = await getTicket(srv, newcomer.cookie, L.lobby.id); // obtained before start
    expect(early.status).toBe(200);
    await startGame(L.st, L.players);
    const t = await getTicket(srv, newcomer.cookie, L.lobby.id);
    expect(t.status).toBe(409);
    expect(t.body.error).toBe('lobby_started');
    await expect(TestClient.joinWithTicket(srv, early.body, 'newcomer')).rejects.toThrow(/already started/i);

    // Abrupt drop, then a fresh ticket (as after a reload in a new tab).
    const p0 = L.players[0]!;
    const pid0 = p0.pid!;
    const seat0 = (p0.last('game:view') as unknown as { you: { seat: number } }).you.seat;
    p0.drop();
    await L.st.view((v) => v.members.some((m) => m.pid === pid0 && !m.connected));
    expect((await summary(L.lobby.id, L.host.cookie)).playerCount).toBe(5); // seat kept in game
    const back = await join(L.accounts[0]!.cookie, L.lobby.id, 'player', 'p0-back');
    const v = await back.view();
    expect(v.youPid).toBe(pid0);
    const gv = (await back.waitMsg('game:view')) as unknown as { you: { pid: string; seat: number } };
    expect(gv.you).toEqual({ pid: pid0, seat: seat0 });
    await L.st.view((x) => x.members.some((m) => m.pid === pid0 && m.connected));

    // Colyseus reconnection token path.
    const p1 = L.players[1]!;
    const pid1 = p1.pid!;
    const token = p1.room.reconnectionToken;
    p1.drop();
    await L.st.view((x) => x.members.some((m) => m.pid === pid1 && !m.connected));
    p1.messages = [];
    await p1.reconnectWithToken(srv, token);
    await L.st.view((x) => x.members.some((m) => m.pid === pid1 && m.connected));
    await p1.waitMsg('game:view');
    expect((p1.last('game:view') as unknown as { you: { pid: string } }).you.pid).toBe(pid1);

    // Explicit 'reconnect' intent also works for members after start.
    const p2 = L.players[2]!;
    const pid2 = p2.pid!;
    await p2.leave(true);
    await L.st.view((x) => x.members.some((m) => m.pid === pid2 && !m.connected));
    const r2 = await join(L.accounts[2]!.cookie, L.lobby.id, 'reconnect', 'p2-back');
    expect((await r2.view()).youPid).toBe(pid2);
    // The ST disconnecting does not end the game.
    expect((await summary(L.lobby.id, L.host.cookie)).phase).toBe('day');
  });

  it('duplicate device: the newest connection takes the seat, the older one is closed with CLOSE_CODES.replaced', async () => {
    const L = await seatLobby(1);
    const a = L.accounts[0]!;
    const first = L.players[0]!;
    const pid = first.pid!;
    const second = await join(a.cookie, L.lobby.id, 'player', 'second');
    expect((await second.view()).youPid).toBe(pid);
    await waitFor(() => first.closeCode === CLOSE_CODES.replaced, 3000, 'replaced close');
    const v = await L.st.view((x) => x.members.length === 2);
    expect(v.members.filter((m) => m.displayName === a.account.displayName)).toHaveLength(1);
    expect(v.members.find((m) => m.pid === pid)!.connected).toBe(true);
    // The old connection's leave does not release the seat.
    await sleep(1300);
    expect((await L.st.view()).members.some((m) => m.pid === pid && m.connected)).toBe(true);
  });

  it('tickets: lobby A ticket rejected by lobby B; tickets are single-use', async () => {
    const A = await seatLobby(0);
    const B = await seatLobby(0);
    const u = await makeAccount(srv, 'Ticketeer');
    const tA = (await getTicket(srv, u.cookie, A.lobby.id)).body;
    const roomB = (await getTicket(srv, u.cookie, B.lobby.id)).body.roomId;
    await expect(TestClient.joinWithTicket(srv, tA, 'cross', roomB)).rejects.toThrow(/wrong_lobby/);
    // Not consumed by the failed attempt: still valid for A, exactly once.
    const c = track(await TestClient.joinWithTicket(srv, tA, 'ok'));
    await c.view();
    await c.leave(true);
    await expect(TestClient.joinWithTicket(srv, tA, 'reuse')).rejects.toThrow(/reused/);
    await expect(TestClient.joinWithTicket(srv, { ...tA, ticket: tA.ticket.slice(0, -2) + 'xx' }, 'forged')).rejects.toThrow(/signature|malformed/);
  });

  it('players cannot seize the Storyteller seat: they ask, and the Storyteller hands it over or keeps it; the host runs the lobby', async () => {
    const L = await seatLobby(2);
    const p = L.players[0]!;
    const stPid = L.st.pid!;
    p.send('lobby:transferStoryteller', { pid: p.pid! });
    await p.waitMsg('error', (e) => e.for === 'lobby:transferStoryteller' && e.code === 'forbidden');
    // Claiming a taken seat asks the seated Storyteller; only they see the request.
    p.send('lobby:claimStoryteller', {});
    await L.st.view((x) => x.stRequests?.includes(p.pid!) === true);
    expect((await p.view((x) => !!x.youRequestedSt)).stRequests).toBeUndefined();
    expect((await L.players[1]!.view()).stRequests).toBeUndefined();
    p.send('lobby:answerStoryteller', { pid: p.pid!, accept: true }); // not theirs to answer
    await p.waitMsg('error', (e) => e.for === 'lobby:answerStoryteller' && e.code === 'forbidden');
    L.st.send('lobby:answerStoryteller', { pid: p.pid!, accept: false });
    await p.waitMsg('error', (e) => e.for === 'lobby:claimStoryteller' && /keeping the Storyteller seat/.test(e.message));
    await p.view((x) => !x.youRequestedSt);
    expect((await L.st.view((x) => !x.stRequests)).members.find((m) => m.role === 'storyteller')!.pid).toBe(stPid);
    // A request can be withdrawn.
    p.send('lobby:claimStoryteller', {});
    await L.st.view((x) => x.stRequests?.includes(p.pid!) === true);
    p.send('lobby:cancelStoryteller', {});
    await L.st.view((x) => !x.stRequests);
    const t = await getTicket(srv, L.accounts[1]!.cookie, L.lobby.id, 'storyteller');
    expect(t.status).toBe(200); // members always get tickets; the room keeps them a player
    const outsider = await makeAccount(srv, 'Outsider');
    expect((await getTicket(srv, outsider.cookie, L.lobby.id, 'storyteller')).status).toBe(409);
    const minted = srv.services.tickets.issue({ accountId: outsider.account.id, lobbyId: L.lobby.id, intent: 'storyteller' });
    const roomId = (await getTicket(srv, outsider.cookie, L.lobby.id)).body.roomId;
    await expect(TestClient.joinWithTicket(srv, { lobbyId: L.lobby.id, roomId, ...minted }, 'minted')).rejects.toThrow(/Storyteller seat is taken/);
    // Legit transfer by the current ST (also host): roles swap, player count unchanged.
    L.st.send('lobby:transferStoryteller', { pid: p.pid! });
    const v = await L.st.view((x) => x.members.find((m) => m.pid === p.pid)!.role === 'storyteller');
    expect(v.members.find((m) => m.pid === stPid)!.role).toBe('player');
    expect(v.members.filter((m) => m.role === 'player')).toHaveLength(2);
    // The host runs the waiting room: the old Storyteller (still the host) keeps the settings and
    // removals; the new Storyteller has neither (nor Start: scripts.deal.test.ts).
    p.send('lobby:kick', { pid: L.players[1]!.pid! });
    await p.waitMsg('error', (e) => e.for === 'lobby:kick' && e.code === 'forbidden');
    p.send('lobby:settings', { name: 'Seized' });
    await p.waitMsg('error', (e) => e.for === 'lobby:settings' && e.code === 'forbidden');
    expect((await p.view()).youAdmin).toBe(false);
    expect((await L.st.view()).youAdmin).toBe(true);
    L.st.send('lobby:settings', { name: 'Still mine' });
    await p.view((x) => x.lobby.name === 'Still mine');
    // Accepting a request swaps the seats.
    L.players[1]!.send('lobby:claimStoryteller', {});
    await p.view((x) => x.stRequests?.includes(L.players[1]!.pid!) === true);
    p.send('lobby:answerStoryteller', { pid: L.players[1]!.pid!, accept: true });
    await L.st.view((x) => x.members.find((m) => m.pid === L.players[1]!.pid)!.role === 'storyteller');
    expect((await p.view((x) => x.members.find((m) => m.pid === p.pid)!.role === 'player')).stRequests).toBeUndefined();
    // releaseStoryteller makes the seat open; then a player may claim it.
    L.players[1]!.send('lobby:releaseStoryteller', {});
    await L.st.view((x) => x.lobby.storytellerSeatOpen);
    p.send('lobby:claimStoryteller', {});
    await L.st.view((x) => x.members.find((m) => m.pid === p.pid)!.role === 'storyteller');
  });

  it('waiting-room disconnect: seat held for the grace period, then released', async () => {
    const L = await seatLobby(2);
    const p = L.players[0]!;
    const pid = p.pid!;
    p.drop();
    await L.st.view((v) => v.members.some((m) => m.pid === pid && !m.connected));
    // Back within grace: same pid.
    const back = await join(L.accounts[0]!.cookie, L.lobby.id, 'player', 'back');
    expect((await back.view()).youPid).toBe(pid);
    back.drop();
    await L.st.view((v) => v.members.some((m) => m.pid === pid && !m.connected));
    await L.st.view((v) => !v.members.some((m) => m.pid === pid), 4000);
    expect((await summary(L.lobby.id, L.host.cookie)).playerCount).toBe(1);
    // Joining again later gets a new seat/pid.
    const later = await join(L.accounts[0]!.cookie, L.lobby.id, 'player', 'later');
    expect((await later.view()).youPid).not.toBe(pid);
  });

  it('host powers: kick (with temporary ban), settings and host transfer — waiting only, this lobby only', async () => {
    const L = await seatLobby(2);
    const other = await seatLobby(1);
    const victim = L.players[1]!;
    // A host in another lobby has no power here (pid unknown there).
    other.st.send('lobby:kick', { pid: victim.pid! });
    await other.st.waitMsg('error', (e) => e.for === 'lobby:kick' && e.code === 'not_found');
    L.players[0]!.send('lobby:kick', { pid: victim.pid! });
    await L.players[0]!.waitMsg('error', (e) => e.for === 'lobby:kick' && e.code === 'forbidden');
    L.st.send('lobby:kick', { pid: victim.pid! });
    await waitFor(() => victim.closeCode === CLOSE_CODES.kicked, 3000, 'kicked close');
    expect(victim.of('kicked')).toHaveLength(1);
    const t = await getTicket(srv, L.accounts[1]!.cookie, L.lobby.id);
    expect(t.status).toBe(403);
    L.st.send('lobby:settings', { name: 'Renamed lobby', maxPlayers: 6 });
    await L.st.view((v) => v.lobby.name === 'Renamed lobby' && v.lobby.maxPlayers === 6);
    L.st.send('lobby:settings', { maxPlayers: 5 });
    await L.st.view((v) => v.lobby.maxPlayers === 5);
    L.st.send('lobby:transferHost', { pid: L.players[0]!.pid! });
    const v = await L.st.view((x) => x.members.find((m) => m.pid === L.players[0]!.pid)!.isHost);
    expect(v.members.filter((m) => m.isHost)).toHaveLength(1);
  });

  it.each(['waiting', 'day', 'finished'] as const)('%s chat stays within the voice audience, including private cottages', async (phase) => {
    const L = await seatLobby(5, { ready: true });
    const [p0, p1, p2] = L.players as [TestClient, TestClient, TestClient];
    if (phase !== 'waiting') await startGame(L.st, L.players);
    if (phase === 'finished') {
      L.st.send('st:command', { type: 'declare_winner', winner: 'good', reason: 'Chat privacy test' });
      await L.st.view((v) => v.lobby.phase === 'finished');
    }
    fakes.registry.audience.set(L.lobby.id, (pid) => (pid === p0.pid ? [p1.pid!] : pid === L.st.pid ? [p2.pid!] : []));
    p0.send('chat:send', { text: 'psst only p1' });
    await p1.waitMsg('chat:message', (m) => m.text === 'psst only p1');
    await p0.waitMsg('chat:message', (m) => m.text === 'psst only p1');
    L.st.send('chat:send', { text: 'ST to p2' });
    const stMsg = await p2.waitMsg('chat:message', (m) => m.text === 'ST to p2');
    expect(stMsg.scope).toBe('storyteller');
    await sleep(300);
    expect(p2.of('chat:message').some((m) => m.text === 'psst only p1')).toBe(false);
    expect(L.st.of('chat:message').some((m) => m.text === 'psst only p1')).toBe(false);
    expect(p1.of('chat:message').some((m) => m.text === 'ST to p2')).toBe(false);
    expect(p1.of('chat:message').find((m) => m.text === 'psst only p1')!.scope).toBe('zone');
  });

  it('validates every C2S message and rate-limits per client', async () => {
    const L = await seatLobby(1);
    const p = L.players[0]!;
    p.sendRaw('definitely:not', {});
    p.sendRaw('lobby:ready', { ready: 'yes' });
    p.sendRaw('chat:send', { text: 'x'.repeat(2000) }); // > schema max, < WS maxPayload (4 KiB)
    await waitFor(() => p.of('error').length >= 3, 3000, 'invalid errors');
    expect(p.of('error').slice(0, 3).map((e) => e.code)).toEqual(['invalid', 'invalid', 'invalid']);
    await sleep(1100); // let the error budget refill
    for (let i = 0; i < 12; i++) p.send('chat:send', { text: `flood ${i}` });
    await p.waitMsg('error', (e) => e.code === 'rate_limited' && e.for === 'chat:send');
    await sleep(300);
    const delivered = L.st.of('chat:message').filter((m) => m.text.startsWith('flood')).length;
    expect(delivered).toBeGreaterThanOrEqual(3);
    expect(delivered).toBeLessThanOrEqual(7); // (v2.3) chat:send burst 6
    p.send('ping', {});
    await p.waitMsg('pong');
    // Moves are dispatched to the world module.
    for (let i = 0; i < 5; i++) p.send('move', { seq: i, x: 10, y: 10, facing: 'down', moving: true });
    await waitFor(() => fakes.registry.moves.filter((m) => m.pid === p.pid).length === 5, 3000, 'moves');
  });

  it('records stats once on game_finished (idempotent) and rematch returns to waiting with the same members', async () => {
    const L = await seatLobby(5, { ready: true });
    await startGame(L.st, L.players);
    const game = fakes.registry.games.get(L.lobby.id)!;
    L.st.send('st:command', { type: 'declare_winner', winner: 'good', reason: 'test' });
    await L.st.view((v) => v.lobby.phase === 'finished');
    game.finish('evil'); // duplicate finish event must not double count
    await sleep(200);
    const imp = game.started!.seats.find((s) => s.seat === 0)!.pid;
    const results = await Promise.all(
      L.players.map(async (p, i) => ({ pid: p.pid!, stats: (await api(srv, 'GET', '/api/me/stats', { cookie: L.accounts[i]!.cookie })).body })),
    );
    for (const r of results) {
      expect(r.stats.matchesPlayed).toBe(1);
      expect(r.stats.matchesCompleted).toBe(1);
      if (r.pid === imp) expect(r.stats).toMatchObject({ wins: 0, losses: 1 });
      else expect(r.stats).toMatchObject({ wins: 1, losses: 0, goodWins: 1 });
      expect(r.stats.roleHistory).toHaveLength(1);
    }
    const stStats = (await api(srv, 'GET', '/api/me/stats', { cookie: L.host.cookie })).body;
    expect(stStats.gamesStorytold).toBe(1);
    expect(srv.services.database.sqlite.prepare('SELECT COUNT(*) AS n FROM matches WHERE lobby_id = ?').get(L.lobby.id)).toEqual({ n: 1 });

    // Rematch: players cannot trigger it; the ST can.
    L.players[0]!.send('lobby:start', {});
    await L.players[0]!.waitMsg('error', (e) => e.for === 'lobby:start');
    L.st.send('lobby:start', {});
    const v = await L.st.view((x) => x.lobby.phase === 'waiting');
    expect(v.members).toHaveLength(6);
    expect(v.members.every((m) => m.seat === null && !m.ready)).toBe(true);
    expect(v.lobby.joinable).toBe(true);
    expect(fakes.registry.games.get(L.lobby.id)).not.toBe(game);
    // A new match can start and is recorded separately.
    for (const p of L.players) p.send('lobby:ready', { ready: true });
    await L.st.view((x) => x.canStart);
    L.st.send('lobby:start', {});
    await L.st.view((x) => x.lobby.phase === 'day');
    fakes.registry.games.get(L.lobby.id)!.finish('good');
    await L.st.view((x) => x.lobby.phase === 'finished');
    const s0 = (await api(srv, 'GET', '/api/me/stats', { cookie: L.accounts[0]!.cookie })).body;
    expect(s0.matchesPlayed).toBe(2);
  });

  it('disposes an idle lobby (no connected members) and removes it from the directory', async () => {
    const L = await seatLobby(1);
    const cfg = srv.services.config as { lobbyIdleTimeoutSec: number };
    cfg.lobbyIdleTimeoutSec = 1;
    try {
      await sleep(1500);
      expect(srv.services.directory.get(L.lobby.id)).not.toBeNull(); // members connected => kept
      await L.players[0]!.leave(true);
      L.st.drop();
      await waitFor(() => srv.services.directory.get(L.lobby.id) === null, 6000, 'idle disposal');
      expect((await getTicket(srv, L.host.cookie, L.lobby.id)).status).toBe(404);
    } finally {
      cfg.lobbyIdleTimeoutSec = 600;
    }
  });
});

describe('no silent message drops (gameplay, 2026-10-15: "the first Ready click does not take")', () => {
  it('lobby:ready sent in the same tick as the join is applied', async () => {
    const L = await seatLobby(0, { prefix: 'Rdy' });
    const a = await makeAccount(srv, 'Rdy-quick');
    const t = await getTicket(srv, a.cookie, L.lobby.id, 'player');
    const c = track(await TestClient.joinWithTicket(srv, t.body, 'Rdy-quick'));
    c.send('lobby:ready', { ready: true }); // before any lobby:view arrived
    const pid = (await c.view()).youPid;
    await L.st.view((v) => v.members.some((m) => m.pid === pid && m.ready), 3000);
    expect(c.of('error')).toEqual([]);
  });

  it('a message sent right after a token reconnection is applied (queued until the seat is re-bound)', async () => {
    const L = await seatLobby(1, { prefix: 'Rtk' });
    const p = L.players[0]!;
    const pid = p.pid!;
    const token = p.room.reconnectionToken;
    p.drop();
    await L.st.view((x) => x.members.some((m) => m.pid === pid && !m.connected));
    p.messages = [];
    await p.reconnectWithToken(srv, token);
    p.send('lobby:ready', { ready: true }); // immediately, no round trip in between
    await L.st.view((v) => v.members.some((m) => m.pid === pid && m.connected && m.ready), 3000);
    expect(p.of('error')).toEqual([]);
  });

  it('a replaced (stale) connection is told so instead of being ignored', async () => {
    const L = await seatLobby(1, { prefix: 'Stl' });
    const old = L.players[0]!;
    const pid = old.pid!;
    // The same account joins again (second tab / a client retry that opened a second socket).
    const fresh = await join(L.accounts[0]!.cookie, L.lobby.id, 'player', 'Stl-fresh');
    expect((await fresh.view()).youPid).toBe(pid);
    // Whatever the old socket still manages to send is answered (error and/or close 4102), never dropped silently.
    try {
      old.send('lobby:ready', { ready: true });
    } catch {
      // already closed by the newest-wins policy: also an answer
    }
    await waitFor(() => old.closeCode === CLOSE_CODES.replaced || old.of('error').some((e) => /stale_connection/.test(e.message)), 3000, 'stale answer');
    // and it did not mark the seat ready behind the new connection's back
    await sleep(200);
    expect(L.st.last('lobby:view')!.members.find((m) => m.pid === pid)!.ready).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// v2 roster rules (server-v2): characters are ONLY the playable roster, unique per lobby among
// players; legacy accounts are auto-assigned for the lobby without rewriting their saved choice; the
// Storyteller's own pick blocks nobody (they render as the 'storyteller' sprite).
describe('GameRoom v2 roster rules', () => {
  it('auto-assigns missing / legacy / taken characters, rejects taken picks with a friendly message, ST pick blocks nobody', async () => {
    const { castById, PLAYABLE, PLAYABLE_IDS } = await import('@ct/assets');
    const { DEFAULT_COSMETICS } = await import('@ct/protocol');
    const X = PLAYABLE[0]!.id;
    const prefix = `R${Math.random().toString(36).slice(2, 6)}`;
    const setPreset = (id: string, preset: string | null) => srv.services.accounts.updateProfile(id, { cosmetics: { ...DEFAULT_COSMETICS, preset } });
    const host = await makeAccount(srv, `${prefix}-ST`);
    setPreset(host.account.id, X);
    const lobby = await createLobby(srv, host.cookie, { name: `${prefix} lobby`, takeStoryteller: true });
    const st = await join(host.cookie, lobby.id, 'storyteller', `${prefix}-ST`);
    const accts = { A: await makeAccount(srv, `${prefix}-A`), B: await makeAccount(srv, `${prefix}-B`), C: await makeAccount(srv, `${prefix}-C`) };
    setPreset(accts.A.account.id, X); // same as the Storyteller: allowed
    setPreset(accts.B.account.id, null); // pre-v2 account (custom character)
    setPreset(accts.C.account.id, 'lamplighter'); // retired v1 preset
    const A = await join(accts.A.cookie, lobby.id, 'player', 'A');
    const B = await join(accts.B.cookie, lobby.id, 'player', 'B');
    const C = await join(accts.C.cookie, lobby.id, 'player', 'C');
    const v = await st.view((x) => x.members.length === 4);
    const pre = (pid: string, view = st.last('lobby:view')!) => view.members.find((m) => m.pid === pid)!.cosmetics.preset;
    expect(pre(st.pid!, v)).toBe(X);
    expect(pre(A.pid!, v)).toBe(X);
    const players = () => st.last('lobby:view')!.members.filter((m) => m.role === 'player');
    for (const m of players()) expect(PLAYABLE_IDS.has(m.cosmetics.preset!), m.displayName).toBe(true);
    expect(new Set(players().map((m) => m.cosmetics.preset)).size).toBe(3);
    // the saved account choice is not rewritten by the lobby assignment
    expect((await api(srv, 'GET', '/api/me', { cookie: accts.B.cookie })).body.cosmetics.preset).toBeNull();
    // deterministic per lobby + member: the same pick every time the view is sent
    const bChar = pre(B.pid!)!;
    // a taken character is refused, by name
    B.send('lobby:cosmetics', { cosmetics: { ...DEFAULT_COSMETICS, preset: X } });
    await B.waitMsg('error', (e) => e.for === 'lobby:cosmetics' && e.message === `${prefix}-A already took ${castById(X)!.name} — pick another`);
    B.send('lobby:cosmetics', { cosmetics: { ...DEFAULT_COSMETICS, preset: null } });
    await B.waitMsg('error', (e) => e.for === 'lobby:cosmetics' && /Pick one of the characters/.test(e.message));
    B.send('lobby:cosmetics', { cosmetics: { ...DEFAULT_COSMETICS, preset: 'storyteller' } });
    await B.waitMsg('error', (e) => e.for === 'lobby:cosmetics' && /Pick one of the characters/.test(e.message));
    expect(pre(B.pid!)).toBe(bChar);
    // the Storyteller may pick a character a player has (they render as the storyteller sprite)
    st.send('lobby:cosmetics', { cosmetics: { ...DEFAULT_COSMETICS, preset: bChar } });
    await st.view((x) => pre(st.pid!, x) === bChar);
    // ...but on becoming a player they keep it only if it is free: the ex-Storyteller is reassigned
    st.send('lobby:transferStoryteller', { pid: A.pid! });
    await st.view((x) => x.members.find((m) => m.pid === A.pid)!.role === 'storyteller' && x.members.find((m) => m.pid === st.pid)!.role === 'player');
    expect(pre(B.pid!)).toBe(bChar);
    expect(pre(st.pid!)).not.toBe(bChar);
    expect(PLAYABLE_IDS.has(pre(st.pid!)!)).toBe(true);
    expect(new Set(players().map((m) => m.cosmetics.preset)).size).toBe(players().length);
    // a free character is accepted and saved to the account
    const free = PLAYABLE.map((c) => c.id).find((id) => !players().some((m) => m.cosmetics.preset === id))!;
    C.send('lobby:cosmetics', { cosmetics: { ...DEFAULT_COSMETICS, preset: free } });
    await st.view((x) => pre(C.pid!, x) === free);
    expect((await api(srv, 'GET', '/api/me', { cookie: accts.C.cookie })).body.cosmetics.preset).toBe(free);
  });
});
