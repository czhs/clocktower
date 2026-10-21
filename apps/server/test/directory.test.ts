import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOBBY_ID_RE, WORD_LOBBY_ID_RE, type DirectoryEvent, type LobbySummary } from '@ct/protocol';
import type { AccountRecord } from '@ct/db';
import { api, createLobby, fakeModules, getTicket, makeAccount, sleep, startTestServer, waitFor, type TestServer } from '../src/rooms/testkit.js';
import { LobbyDirectory, LOBBY_ID_LENGTH, LOBBY_ID_WORD_ATTEMPTS, RETIRED_LOBBY_ID_MS } from '../src/directory/service.js';
import { createTicketService } from '../src/directory/tickets.js';

const PORT = 3332;
let srv: TestServer;
const fakes = fakeModules();

beforeAll(async () => {
  srv = await startTestServer(PORT, {
    moduleFactories: fakes.factories,
    sseHeartbeatMs: 300,
    env: { LOBBY_MAX_COUNT: '4' },
    rateLimits: { createLobby: { capacity: 100, refillPerSec: 100 } },
  });
});
afterAll(async () => {
  await srv?.close();
});

const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const acct = (id: string): AccountRecord => ({ id, displayName: id, cosmetics: {} as AccountRecord['cosmetics'], createdAt: 0, lastSeenAt: 0 });
const req = { name: 'Lobby', description: '', maxPlayers: 10, script: 'trouble-brewing' as const, takeStoryteller: false };

describe('join tickets', () => {
  it('are bound to lobby, expire, are single-use and tamper-evident', () => {
    let now = 1_000;
    const t = createTicketService('k'.repeat(64), { now: () => now });
    const a = t.issue({ accountId: 'acc', lobbyId: 'lobbyA', intent: 'player' });
    expect(a.expiresAt).toBe(61_000);
    expect(t.verify(a.ticket, 'lobbyB')).toEqual({ ok: false, reason: 'wrong_lobby' });
    const ok = t.verify(a.ticket, 'lobbyA');
    expect(ok).toMatchObject({ ok: true, claims: { accountId: 'acc', lobbyId: 'lobbyA', intent: 'player' } });
    expect(t.verify(a.ticket, 'lobbyA')).toEqual({ ok: false, reason: 'reused' });
    const b = t.issue({ accountId: 'acc', lobbyId: 'lobbyA', intent: 'player' });
    now += 60_001;
    expect(t.verify(b.ticket, 'lobbyA')).toEqual({ ok: false, reason: 'expired' });
    const c = t.issue({ accountId: 'acc', lobbyId: 'lobbyA', intent: 'player' });
    const [v, payload, sig] = c.ticket.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), accountId: 'other' })).toString('base64url');
    expect(t.verify(`${v}.${forged}.${sig}`, 'lobbyA')).toEqual({ ok: false, reason: 'signature' });
    expect(t.verify('garbage', 'lobbyA')).toEqual({ ok: false, reason: 'malformed' });
    const other = createTicketService('z'.repeat(64), { now: () => now });
    expect(other.verify(c.ticket, 'lobbyA')).toEqual({ ok: false, reason: 'signature' });
    expect(t.verify(c.ticket, 'lobbyA').ok).toBe(true);
  });
});

describe('LobbyDirectory (unit, injected room factory)', () => {
  function dir(max = 4, jitter = true) {
    const tickets = createTicketService('k'.repeat(64));
    const d: LobbyDirectory = new LobbyDirectory({
      log: quiet,
      tickets,
      lobbyMaxCount: max,
      playerMaxPerLobby: 15,
      createRoom: async (lobbyId) => {
        if (jitter) await sleep(Math.random() * 20); // widen the race window
        return { roomId: `room-${lobbyId}` };
      },
    });
    return d;
  }

  it('concurrent creates never exceed LOBBY_MAX_COUNT and ids are unique', async () => {
    const d = dir(4);
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => d.create(acct(`a${i}`), req)));
    const ok = results.filter((r): r is PromiseFulfilledResult<LobbySummary> => r.status === 'fulfilled');
    expect(ok).toHaveLength(4);
    expect(d.size).toBe(4);
    const ids = ok.map((r) => r.value.id);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(id).toMatch(WORD_LOBBY_ID_RE);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected.every((r) => r.reason.code === 'lobby_limit')).toBe(true);
  });

  it('per-account active lobby limit (1) holds under a race', async () => {
    const d = dir(50);
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => d.create(acct('same'), req)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    // Removing one frees a slot.
    d.remove(d.list()[0]!.id);
    await expect(d.create(acct('same'), req)).resolves.toMatchObject({ name: 'Lobby' });
  });

  it('per-IP active lobby limit (2); loopback is exempt', async () => {
    const d = dir(50);
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => d.create(acct(`ip${i}`), req, '203.0.113.9')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('lobby_limit');
    await expect(d.create(acct('other-net'), req, '2001:db8:1:2::/64')).resolves.toMatchObject({ name: 'Lobby' });
    for (let i = 0; i < 4; i++) await expect(d.create(acct(`local${i}`), req, '127.0.0.1')).resolves.toBeTruthy();
  });

  it('generates many unique ids', async () => {
    const d = dir(1000, false);
    const ids = new Set<string>();
    for (let i = 0; i < 300; i++) ids.add((await d.create(acct(`u${i}`), req)).id);
    expect(ids.size).toBe(300);
  });

  it('(v2.2) simple-word ids: retry on collision with live and recently retired ids, then fall back', async () => {
    let now = 1_000;
    const queue: string[] = [];
    const d = new LobbyDirectory({
      log: quiet,
      tickets: createTicketService('k'.repeat(64)),
      lobbyMaxCount: 50,
      playerMaxPerLobby: 15,
      now: () => now,
      newLobbyId: () => queue.shift() ?? 'amber-fox-lantern',
      createRoom: async (lobbyId) => ({ roomId: `room-${lobbyId}` }),
    });
    expect((await d.create(acct('a'), req)).id).toBe('amber-fox-lantern');
    // live collision -> next candidate
    queue.push('amber-fox-lantern', 'amber-fox-lantern', 'brave-owl-candle');
    expect((await d.create(acct('b'), req)).id).toBe('brave-owl-candle');
    // a removed id is not reused while it is recently retired ...
    d.remove('brave-owl-candle');
    queue.push('brave-owl-candle', 'calm-otter-kite');
    expect((await d.create(acct('c'), req)).id).toBe('calm-otter-kite');
    // ... but may come back after the cooldown
    now += RETIRED_LOBBY_ID_MS + 1;
    queue.push('brave-owl-candle');
    expect((await d.create(acct('d'), req)).id).toBe('brave-owl-candle');
    // every word attempt collides -> random fallback id (old format), still unique and routable
    const fallback = (await d.create(acct('e'), req)).id;
    expect(queue).toHaveLength(0);
    expect(fallback).toMatch(new RegExp(`^[A-Za-z0-9_-]{${LOBBY_ID_LENGTH}}$`));
    expect(fallback).toMatch(LOBBY_ID_RE);
    expect(LOBBY_ID_WORD_ATTEMPTS).toBeGreaterThan(8);
    expect(new Set(d.list().map((l) => l.id)).size).toBe(d.list().length);
  });

  it('(v2.2) resolveId: exact first (old case-sensitive ids), then case-folded word ids', async () => {
    const ids = ['AbCdEf-Gh-Ij', 'abcdef-gh-ij', 'amber-fox-lantern', 'JLB7GxxaZK'];
    const d = new LobbyDirectory({
      log: quiet,
      tickets: createTicketService('k'.repeat(64)),
      lobbyMaxCount: 50,
      playerMaxPerLobby: 15,
      newLobbyId: () => ids.shift()!,
      createRoom: async (lobbyId) => ({ roomId: `room-${lobbyId}` }),
    });
    for (let i = 0; i < 4; i++) await d.create(acct(`r${i}`), req);
    expect(d.resolveId('Amber-Fox-LANTERN')).toBe('amber-fox-lantern');
    expect(d.resolveId('amber-fox-lantern')).toBe('amber-fox-lantern');
    expect(d.resolveId('AbCdEf-Gh-Ij')).toBe('AbCdEf-Gh-Ij'); // exact old id wins over its folded twin
    expect(d.resolveId('ABCDEF-GH-IJ')).toBe('abcdef-gh-ij');
    expect(d.resolveId('JLB7GxxaZK')).toBe('JLB7GxxaZK');
    expect(d.resolveId('jlb7gxxazk')).toBe('jlb7gxxazk'); // old random ids stay case-sensitive (-> 404)
    expect(d.get(d.resolveId('jlb7gxxazk'))).toBeNull();
    expect(d.resolveId('nope-nope-nope')).toBe('nope-nope-nope');
  });

  it('a failed room creation leaves no entry behind', async () => {
    const d = new LobbyDirectory({
      log: quiet,
      tickets: createTicketService('k'.repeat(64)),
      lobbyMaxCount: 4,
      playerMaxPerLobby: 15,
      createRoom: async () => {
        throw new Error('boom');
      },
    });
    await expect(d.create(acct('x'), req)).rejects.toMatchObject({ code: 'internal' });
    expect(d.size).toBe(0);
  });

  it('publishes upsert only on real changes, and remove', async () => {
    const d = dir();
    const events: DirectoryEvent[] = [];
    d.subscribe((e) => events.push(e));
    const s = await d.create(acct('a'), req);
    d.update({ ...s, updatedAt: s.updatedAt + 5 }); // only timestamp changed
    d.update({ ...s, playerCount: 1 });
    d.remove(s.id);
    expect(events.map((e) => e.type)).toEqual(['upsert', 'upsert', 'remove']);
  });
});

/** Minimal SSE reader over fetch. */
async function openStream(cookie?: string) {
  const ctrl = new AbortController();
  const res = await fetch(`${srv.url}/api/lobbies/stream`, { headers: cookie ? { cookie } : {}, signal: ctrl.signal });
  const events: DirectoryEvent[] = [];
  if (res.ok && res.body) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            for (const line of chunk.split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
          }
        }
      } catch {
        // aborted
      }
    })();
  }
  return { res, events, close: () => ctrl.abort() };
}

describe('lobby directory HTTP + SSE (real Colyseus rooms)', () => {
  it('requires a session for every lobby route', async () => {
    expect((await api(srv, 'GET', '/api/lobbies')).status).toBe(401);
    expect((await api(srv, 'POST', '/api/lobbies', { body: { name: 'abc', maxPlayers: 5 } })).status).toBe(401);
    const s = await openStream();
    expect(s.res.status).toBe(401);
    s.close();
  });

  it('validates create requests (5..15 players, name length; no password field exists)', async () => {
    const { cookie } = await makeAccount(srv, 'Val');
    for (const body of [
      { name: 'Okay', maxPlayers: 4 },
      { name: 'Okay', maxPlayers: 16 },
      { name: 'ab', maxPlayers: 8 },
      { name: 'x'.repeat(41), maxPlayers: 8 },
      // Sects & Violets is a real script now; only unknown ids are rejected.
      { name: 'Okay', maxPlayers: 8, script: 'no-such-script' },
    ]) {
      const r = await api(srv, 'POST', '/api/lobbies', { cookie, body });
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    for (const body of [{ name: 12345, maxPlayers: 8 }, [{ name: '', maxPlayers: 8 }]]) {
      const r = await api(srv, 'POST', '/api/lobbies', { cookie, body });
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('create / list / get / SSE snapshot+upsert+remove+heartbeat, with limits', async () => {
    const a = await makeAccount(srv, 'Ann');
    const b = await makeAccount(srv, 'Ben');
    const stream = await openStream(a.cookie);
    expect(stream.res.status).toBe(200);
    expect(stream.res.headers.get('content-type')).toContain('text/event-stream');
    await waitFor(() => stream.events[0], 2000, 'snapshot');
    expect(stream.events[0]).toEqual({ type: 'snapshot', lobbies: [] });

    const l1 = await createLobby(srv, a.cookie, { name: 'First <script>', maxPlayers: 8, description: 'hello' });
    expect(l1).toMatchObject({ name: 'First <script>', maxPlayers: 8, playerCount: 0, phase: 'waiting', joinable: true, storytellerSeatOpen: true, hostName: 'Ann' });
    await waitFor(() => stream.events.find((e) => e.type === 'upsert' && e.lobby.id === l1.id), 2000, 'upsert');

    const second = await api(srv, 'POST', '/api/lobbies', { cookie: a.cookie, body: { name: 'Second', maxPlayers: 5 } });
    expect(second.status).toBe(409); // one active lobby per account
    expect(second.body.error).toBe('lobby_limit');

    const l2 = await createLobby(srv, b.cookie);
    const l3 = await createLobby(srv, (await makeAccount(srv, 'Dee')).cookie);
    const l4 = await createLobby(srv, (await makeAccount(srv, 'Eve')).cookie);
    const c = await makeAccount(srv, 'Cat');
    const fifth = await api(srv, 'POST', '/api/lobbies', { cookie: c.cookie, body: { name: 'Fifth', maxPlayers: 5 } });
    expect(fifth.status).toBe(409); // LOBBY_MAX_COUNT=4
    expect(fifth.body.error).toBe('lobby_limit');

    const list = await api(srv, 'GET', '/api/lobbies', { cookie: c.cookie });
    expect(list.body.lobbies.map((l: LobbySummary) => l.id).sort()).toEqual([l1.id, l2.id, l3.id, l4.id].sort());
    expect((await api(srv, 'GET', `/api/lobbies/${l1.id}`, { cookie: c.cookie })).body.lobby.name).toBe('First <script>');
    expect((await api(srv, 'GET', '/api/lobbies/doesnotexist', { cookie: c.cookie })).status).toBe(404);
    expect((await api(srv, 'GET', '/api/lobbies/bad$id', { cookie: c.cookie })).status).toBe(404);

    // Ticket rules for non-members.
    expect((await getTicket(srv, c.cookie, 'doesnotexist')).status).toBe(404);
    const rc = await getTicket(srv, c.cookie, l1.id, 'reconnect');
    expect(rc.status).toBe(409);
    const t = await getTicket(srv, c.cookie, l1.id, 'player');
    expect(t.status).toBe(200);
    expect(t.body).toMatchObject({ lobbyId: l1.id, roomId: expect.any(String), ticket: expect.stringMatching(/^v1\./) });
    expect(t.body.expiresAt - Date.now()).toBeLessThanOrEqual(60_000);

    await waitFor(() => stream.events.some((e) => e.type === 'heartbeat'), 2000, 'heartbeat');

    // Idle disposal (no members ever joined) => directory 'remove' over SSE.
    (srv.services.config as { lobbyIdleTimeoutSec: number }).lobbyIdleTimeoutSec = 1;
    await waitFor(() => stream.events.filter((e) => e.type === 'remove').length >= 4, 6000, 'remove events');
    expect((await api(srv, 'GET', '/api/lobbies', { cookie: c.cookie })).body.lobbies).toEqual([]);
    (srv.services.config as { lobbyIdleTimeoutSec: number }).lobbyIdleTimeoutSec = 600;
    stream.close();
    await waitFor(() => srv.services.directory.subscriberCount() === 0, 2000, 'unsubscribe');

    // Slots are free again.
    await createLobby(srv, c.cookie);
  });
});

describe('(v2.2) simple-word lobby ids over HTTP (own server)', () => {
  let words: TestServer;
  beforeAll(async () => {
    words = await startTestServer(3336, { moduleFactories: fakeModules().factories, rateLimits: { createLobby: { capacity: 100, refillPerSec: 100 } } });
  });
  afterAll(async () => {
    await words?.close();
  });

  it('(v2.2) blank name -> simple-words name; word id routes case-insensitively; old-format ids still 404 cleanly', async () => {
    const { cookie } = await makeAccount(words, 'Wordy');
    const r = await api<{ lobby: LobbySummary }>(words, 'POST', '/api/lobbies', { cookie, body: { name: '  \u200b ', maxPlayers: 8 } });
    expect(r.status).toBe(201);
    const l = r.body.lobby;
    expect(l.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(l.id).toMatch(WORD_LOBBY_ID_RE);
    expect((await api(words, 'GET', `/api/lobbies/${l.id}`, { cookie })).body.lobby.id).toBe(l.id);
    expect((await api(words, 'GET', `/api/lobbies/${l.id.toUpperCase()}`, { cookie })).body.lobby.id).toBe(l.id);
    const t = await api(words, 'POST', `/api/lobbies/${l.id.replace(/^./, (c) => c.toUpperCase())}/ticket`, { cookie, body: { intent: 'player' } });
    expect(t.status).toBe(200);
    expect(t.body.lobbyId).toBe(l.id);
    expect((await api(words, 'GET', '/api/lobbies/JLB7GxxaZK', { cookie })).status).toBe(404);
    expect((await api(words, 'GET', '/api/lobbies/a', { cookie })).status).toBe(404);
    const missing = await api<{ lobby: LobbySummary }>(words, 'POST', '/api/lobbies', { cookie: (await makeAccount(words, 'Noname')).cookie, body: { maxPlayers: 8 } });
    expect(missing.status).toBe(201);
    expect(missing.body.lobby.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });
});
