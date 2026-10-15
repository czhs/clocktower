// OWNED BY notebook. Real Colyseus + real GameRoom + real SQLite (fake gameplay modules): the private
// notebook is delivered only to its owner, persists across refresh / reconnect / device switch,
// handles stale revs, size and rate limits, and a new game starts a fresh notebook. Like the
// secrecy suites, every other client's full message stream (and the server log) is checked for the
// notebook's content.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NOTEBOOK_MAX_BYTES, NOTEBOOK_TEXT_MAX, notebookBytes, type NotebookData, type NotebookDataMsg } from '@ct/protocol';
import { createNotebooksRepo } from '@ct/db';
import { playtestPort } from './playtestHarness.js';
import { createLobby, fakeModules, getTicket, makeAccount, sleep, startTestServer, TestClient, waitFor, type TestServer } from '../src/rooms/testkit.js';

let srv: TestServer;
const fakes = fakeModules();
const open: TestClient[] = [];

beforeAll(async () => {
  // First free port from 3319 down the shared 3310-3319 test range (playtest suites use it too).
  srv = await startTestServer(await playtestPort(3319), {
    moduleFactories: fakes.factories,
    env: { LOBBY_MAX_COUNT: '20' },
    rateLimits: { createLobby: { capacity: 100, refillPerSec: 100 }, ticket: { capacity: 100, refillPerSec: 100 } },
  });
});
afterAll(async () => {
  await srv?.close();
});
afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.leave(true)));
});

const track = (c: TestClient) => (open.push(c), c);

async function startedGame(prefix: string) {
  const host = await makeAccount(srv, `${prefix}-ST`);
  const lobby = await createLobby(srv, host.cookie, { name: `${prefix} lobby`, takeStoryteller: true });
  const st = track(await TestClient.join(srv, host.cookie, lobby.id, 'storyteller', `${prefix}-ST`));
  const players: TestClient[] = [];
  const accounts: Awaited<ReturnType<typeof makeAccount>>[] = [];
  for (let i = 0; i < 5; i++) {
    const a = await makeAccount(srv, `${prefix}-${i}`);
    accounts.push(a);
    players.push(track(await TestClient.join(srv, a.cookie, lobby.id, 'player', `${prefix}-${i}`)));
  }
  await st.view((v) => v.members.filter((m) => m.role === 'player' && m.connected).length === 5);
  for (const p of players) p.send('lobby:ready', { ready: true });
  await st.view((v) => v.canStart);
  st.send('lobby:start', {});
  await Promise.all([st, ...players].map((c) => c.waitMsg('notebook:data')));
  return { lobby, host, st, players, accounts };
}

const nbOf = (c: TestClient) => c.of('notebook:data') as NotebookDataMsg[];
const lastNb = (c: TestClient) => nbOf(c).at(-1);
const book = (text: string, note = ''): NotebookData => ({ text, seats: note ? [{ seat: 1, note, guess: 'imp', mark: 'distrust' }] : [] });

describe('private notebook (GameRoom wiring)', () => {
  it('every member (players + Storyteller) gets a fresh notebook at game start; saves reach only the owner', async () => {
    const G = await startedGame('Ink');
    const all = [G.st, ...G.players];
    const first = all.map((c) => nbOf(c)[0]!);
    const matchId = first[0]!.matchId;
    for (const m of first) expect(m).toEqual({ matchId, rev: 0, data: { text: '', seats: [] }, savedAt: null, cause: 'load' });

    const [p0, p1] = G.players as [TestClient, TestClient];
    p0.send('notebook:save', { matchId, rev: 1, data: book('NB-SECRET-alpha I think Bo is lying', 'NB-SECRET-claims chef') });
    const ack = await p0.waitMsg('notebook:data', (m) => m.cause === 'saved');
    expect(ack).toMatchObject({ matchId, rev: 1, cause: 'saved' });
    expect(ack.data.text).toBe('NB-SECRET-alpha I think Bo is lying');
    expect(typeof ack.savedAt).toBe('number');

    // The Storyteller's scratchpad works the same way and is just as private.
    G.st.send('notebook:save', { matchId, rev: 1, data: book('NB-SECRET-st visit Ann first') });
    await G.st.waitMsg('notebook:data', (m) => m.cause === 'saved');
    p1.send('notebook:load', {});
    await waitFor(() => nbOf(p1).length >= 2, 3000, 'p1 reload');
    expect(lastNb(p1)).toMatchObject({ rev: 0, data: { text: '', seats: [] } });

    await sleep(300);
    for (const c of all) {
      const dump = JSON.stringify(c.messages);
      if (c !== p0) expect(dump, c.name).not.toContain('NB-SECRET-alpha');
      if (c !== p0) expect(dump, c.name).not.toContain('NB-SECRET-claims');
      if (c !== G.st) expect(dump, c.name).not.toContain('NB-SECRET-st');
      // Nobody gets someone else's notebook: exactly the own initial + own replies.
      for (const m of nbOf(c)) expect(m.matchId).toBe(matchId);
    }
    expect(nbOf(G.players[2]!)).toHaveLength(1);
    // Never in the logs, and no account id reached any client.
    expect(srv.log.lines.join('\n')).not.toContain('NB-SECRET');
    for (const c of all) for (const a of [G.host, ...G.accounts]) expect(JSON.stringify(c.messages)).not.toContain(a.account.id);
  });

  it('survives an abrupt drop, a fresh rejoin (refresh) and a second device', async () => {
    const G = await startedGame('Quill');
    const p0 = G.players[0]!;
    const matchId = lastNb(p0)!.matchId;
    p0.send('notebook:save', { matchId, rev: 1, data: book('kept across reconnects', 'seat two said empath 0') });
    await p0.waitMsg('notebook:data', (m) => m.cause === 'saved');

    // Refresh = the socket drops, a fresh `reconnect` ticket restores the seat.
    p0.drop();
    await sleep(200);
    const t = await getTicket(srv, G.accounts[0]!.cookie, G.lobby.id, 'reconnect');
    expect(t.status).toBe(200);
    const again = track(await TestClient.joinWithTicket(srv, t.body, 'p0-again'));
    const restored = await again.waitMsg('notebook:data');
    expect(restored).toMatchObject({ matchId, rev: 1, cause: 'load' });
    expect(restored.data).toEqual({ text: 'kept across reconnects', seats: [{ seat: 1, note: 'seat two said empath 0', guess: 'imp', mark: 'distrust' }] });

    // Second device (newest connection wins) sees the same notebook and can continue it.
    const t2 = await getTicket(srv, G.accounts[0]!.cookie, G.lobby.id, 'reconnect');
    const phone = track(await TestClient.joinWithTicket(srv, t2.body, 'p0-phone'));
    expect((await phone.waitMsg('notebook:data')).rev).toBe(1);
    phone.send('notebook:save', { matchId, rev: 2, data: book('written on the phone') });
    await phone.waitMsg('notebook:data', (m) => m.cause === 'saved' && m.rev === 2);

    // Token reconnect (Colyseus reconnection) gets it pushed too.
    const token = phone.room.reconnectionToken;
    phone.drop();
    await sleep(150);
    await phone.reconnectWithToken(srv, token);
    await waitFor(() => nbOf(phone).some((m) => m.cause === 'load' && m.rev === 2 && m.data.text === 'written on the phone'), 3000, 'token reconnect push');
  });

  it('newer rev wins: a stale save gets the stored copy back (cause newer), nothing is overwritten', async () => {
    const G = await startedGame('Rev');
    const p = G.players[0]!;
    const matchId = lastNb(p)!.matchId;
    p.send('notebook:save', { matchId, rev: 1, data: book('device A, rev 1') });
    await p.waitMsg('notebook:data', (m) => m.cause === 'saved' && m.rev === 1);
    p.send('notebook:save', { matchId, rev: 2, data: book('device A, rev 2') });
    await p.waitMsg('notebook:data', (m) => m.cause === 'saved' && m.rev === 2);
    // An older device based on rev 1 comes back with its own edits (rev 2 again).
    p.send('notebook:save', { matchId, rev: 2, data: book('device B, stale') });
    const back = await p.waitMsg('notebook:data', (m) => m.cause === 'newer');
    expect(back).toMatchObject({ rev: 2, data: { text: 'device A, rev 2' } });
    // "Keep this device's version" = rev 3 on top of the newer copy.
    p.send('notebook:save', { matchId, rev: 3, data: book('device B, kept') });
    await p.waitMsg('notebook:data', (m) => m.cause === 'saved' && m.rev === 3);
    p.send('notebook:load', {});
    await waitFor(() => lastNb(p)?.cause === 'load' && lastNb(p)!.data.text === 'device B, kept', 3000, 'reload');
  });

  it('enforces size limits (schema) and accepts a full-size notebook in one frame', async () => {
    const G = await startedGame('Size');
    const p = G.players[0]!;
    const matchId = lastNb(p)!.matchId;
    p.sendRaw('notebook:save', { matchId, rev: 1, data: { text: 'x'.repeat(NOTEBOOK_TEXT_MAX + 1), seats: [] } });
    const err = await p.waitMsg('error', (e) => e.for === 'notebook:save');
    expect(err.code).toBe('invalid');
    p.sendRaw('notebook:save', { matchId, rev: 1, data: { text: '', seats: [{ seat: 1, note: 'a' }, { seat: 1, note: 'b' }] } });
    await waitFor(() => p.of('error').filter((e) => e.for === 'notebook:save').length >= 2, 3000, 'duplicate seat refused');
    p.sendRaw('notebook:save', { matchId, rev: 1, data: { text: 'hi', seats: [{ seat: 15, note: 'out of range' }] } });
    await waitFor(() => p.of('error').filter((e) => e.for === 'notebook:save').length >= 3, 3000, 'seat range refused');

    // Multi-byte text right at the byte cap: 15 long notes + a page of 3-byte characters.
    const seats = Array.from({ length: 15 }, (_, seat) => ({ seat, note: 'ñ'.repeat(160), guess: 'fortune_teller' as const, mark: 'unsure' as const }));
    let text = '☾'.repeat(NOTEBOOK_TEXT_MAX);
    while (notebookBytes({ text, seats }) > NOTEBOOK_MAX_BYTES) text = text.slice(0, -10);
    const big: NotebookData = { text, seats };
    expect(notebookBytes(big)).toBeGreaterThan(NOTEBOOK_MAX_BYTES - 40);
    p.send('notebook:save', { matchId, rev: 1, data: big });
    const ok = await p.waitMsg('notebook:data', (m) => m.cause === 'saved', 5000);
    expect(ok.data.text.length).toBe(text.length);
    expect(p.closeCode).toBeNull(); // the frame fit (WebSocket maxPayload)
    // One byte over the cap is refused by the schema.
    p.sendRaw('notebook:save', { matchId, rev: 2, data: { text: text + '☾'.repeat(20), seats } });
    await waitFor(() => p.of('error').filter((e) => e.for === 'notebook:save').length >= 4, 3000, 'over cap refused');
  });

  it('rate-limits saves per account with a retry hint', async () => {
    const G = await startedGame('Rate');
    const p = G.players[0]!;
    const matchId = lastNb(p)!.matchId;
    for (let rev = 1; rev <= 14; rev++) p.send('notebook:save', { matchId, rev, data: book(`burst ${rev}`) });
    const limited = await p.waitMsg('notebook:unavailable', (m) => m.reason === 'rate_limited');
    expect(limited.retryInMs).toBeGreaterThanOrEqual(1000);
    await sleep(300);
    const saved = nbOf(p).filter((m) => m.cause === 'saved');
    expect(saved.length).toBe(10);
    expect(p.of('error').filter((e) => e.for === 'notebook:save')).toEqual([]); // no generic "Slow down" toast
  });

  it('a new game starts a fresh notebook; the old one stays stored for its owner; no notebook while waiting', async () => {
    const G = await startedGame('Again');
    const [p0] = G.players as [TestClient];
    const m1 = lastNb(p0)!.matchId;
    p0.send('notebook:save', { matchId: m1, rev: 1, data: book('game one notes') });
    await p0.waitMsg('notebook:data', (m) => m.cause === 'saved');
    G.st.send('st:command', { type: 'declare_winner', winner: 'good', reason: 'test' });
    await G.st.view((v) => v.lobby.phase === 'finished');
    // Still writable after the game ends (a finished game keeps its notebook).
    p0.send('notebook:save', { matchId: m1, rev: 2, data: book('post-mortem') });
    await p0.waitMsg('notebook:data', (m) => m.cause === 'saved' && m.rev === 2);

    G.st.send('lobby:start', {}); // rematch -> waiting
    await G.st.view((v) => v.lobby.phase === 'waiting');
    p0.send('notebook:save', { matchId: m1, rev: 3, data: book('too late') });
    expect((await p0.waitMsg('notebook:unavailable')).reason).toBe('no_game');
    p0.send('notebook:load', {});
    await waitFor(() => p0.of('notebook:unavailable').length >= 2, 3000, 'no_game on load');

    for (const p of G.players) p.send('lobby:ready', { ready: true });
    await G.st.view((v) => v.canStart);
    const before = nbOf(p0).length;
    G.st.send('lobby:start', {});
    const fresh = await waitFor(() => nbOf(p0).slice(before).find((m) => m.cause === 'load'), 3000, 'fresh notebook');
    expect(fresh.matchId).not.toBe(m1);
    expect(fresh).toMatchObject({ rev: 0, data: { text: '', seats: [] }, savedAt: null });
    // A save aimed at the old game cannot write into the new one.
    p0.send('notebook:save', { matchId: m1, rev: 9, data: book('stale tab') });
    await waitFor(() => p0.of('notebook:unavailable').length >= 3, 3000, 'old match refused');

    // Stored by (match, account): the old notebook is still there for its owner, untouched.
    const repo = createNotebooksRepo(srv.services.database);
    const acc = G.accounts[0]!.account.id;
    expect(repo.get(m1, acc)).toMatchObject({ rev: 2, data: { text: 'post-mortem' } });
    expect(repo.get(fresh.matchId, acc)).toBeNull();
    expect(repo.listForAccount(acc).map((r) => r.matchId)).toEqual([m1]);
    expect(repo.get(m1, G.accounts[1]!.account.id)).toBeNull();
  });

  it('no notebook traffic before a game starts', async () => {
    const host = await makeAccount(srv, 'Wait-ST');
    const lobby = await createLobby(srv, host.cookie, { name: 'Wait lobby', takeStoryteller: true });
    const st = track(await TestClient.join(srv, host.cookie, lobby.id, 'storyteller', 'Wait-ST'));
    await st.view();
    st.send('notebook:load', {});
    expect((await st.waitMsg('notebook:unavailable')).reason).toBe('no_game');
    expect(st.of('notebook:data')).toEqual([]);
  });
});
