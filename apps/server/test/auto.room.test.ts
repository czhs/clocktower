// OWNED BY auto-st. Automatic games through the REAL server (HTTP + Colyseus + the real Game/World/Voice
// modules): creating / switching a lobby to 'auto', no Storyteller seat, the host starts with 5 ready
// players, the public clock in every view, clock messages over the wire, and the host's abort
// (abandoned record, back to the waiting room). Human lobbies keep their old behaviour.
import type { LobbySummary, PlayerGameView } from '@ct/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, makeAccount, startTestServer, TestClient, waitFor, type TestServer } from '../src/rooms/testkit.js';

const PORT = 3317; // auto-st range (3314 is playtest.persistence)
let srv: TestServer;
const clients: TestClient[] = [];

beforeAll(async () => {
  srv = await startTestServer(PORT, { rateLimits: { ticket: { capacity: 200, refillPerSec: 200 }, createLobby: { capacity: 50, refillPerSec: 50 } } });
}, 30_000);
afterAll(async () => {
  await Promise.all(clients.map((c) => c.leave(true)));
  await srv?.close();
}, 30_000);

async function lobby(name: string, body: Record<string, unknown>) {
  const host = await makeAccount(srv, `${name}-host`);
  const r = await api<{ lobby: LobbySummary }>(srv, 'POST', '/api/lobbies', { cookie: host.cookie, body: { name, maxPlayers: 6, ...body } });
  expect(r.status).toBe(201);
  return { host, lobby: r.body.lobby };
}

async function join(lobbyId: string, label: string, cookie?: string, intent: 'player' | 'storyteller' = 'player') {
  const acct = cookie ? { cookie } : await makeAccount(srv, label);
  const c = await TestClient.join(srv, acct.cookie, lobbyId, intent, label);
  clients.push(c);
  await c.view();
  return c;
}

const lastGame = (c: TestClient) => c.last('game:view') as PlayerGameView | undefined;
const errorFor = (c: TestClient, type: string) => waitFor(() => c.of('error').find((e) => e.for === type), 3000, `${c.name}: error for ${type}`);

describe('automatic games through the real server', () => {
  it('an auto lobby has no Storyteller seat; the host starts with 5 ready players; public clock; abort -> abandoned record + waiting room', async () => {
    const { host, lobby: l } = await lobby('Auto town', { storytellerMode: 'auto', takeStoryteller: true });
    expect(l.storytellerMode).toBe('auto');
    expect(l.storytellerSeatOpen).toBe(false);
    expect(l.autoTimings).toEqual({ discussionMin: 5, nominationsMin: 4, bedtimeSec: 45, nightSec: 60 });
    // the creator asked for the Storyteller seat: in an automatic lobby they simply join as a player
    const h = await join(l.id, 'Host', host.cookie, 'storyteller');
    const hv = await h.view((v) => v.members.length === 1);
    expect(hv.members[0]).toMatchObject({ role: 'player', isHost: true });
    h.send('lobby:claimStoryteller', {});
    expect((await errorFor(h, 'lobby:claimStoryteller')).code).toBe('forbidden');
    // timings: host only, waiting only
    h.send('lobby:settings', { autoTimings: { discussionMin: 2, nightSec: 30 } });
    await h.view((v) => v.lobby.autoTimings?.discussionMin === 2);
    expect(h.last('lobby:view')!.lobby.autoTimings).toEqual({ discussionMin: 2, nominationsMin: 4, bedtimeSec: 45, nightSec: 30 });
    const others: TestClient[] = [];
    for (let i = 0; i < 4; i++) others.push(await join(l.id, `A${i}`));
    others[0]!.send('lobby:settings', { autoTimings: { discussionMin: 9 } });
    expect((await errorFor(others[0]!, 'lobby:settings')).code).toBe('forbidden');
    for (const c of [h, ...others]) c.send('lobby:ready', { ready: true });
    const ready = await h.view((v) => v.canStart, 5000);
    expect(ready.startBlockers).toEqual([]);
    expect(others[0]!.last('lobby:view')!.canStart).toBe(false); // only the host
    others[1]!.send('lobby:start', {});
    expect((await errorFor(others[1]!, 'lobby:start')).message).toBe('Only the host can start');
    h.send('lobby:start', {});
    await h.view((v) => v.lobby.phase !== 'waiting', 5000);
    // every player gets an automatic-game view; nobody is a Storyteller
    for (const c of [h, ...others]) {
      const v = await waitFor(() => lastGame(c), 5000, 'game view');
      expect(v.kind).toBe('player');
      expect(v.storytellerMode).toBe('auto');
    }
    // the setup beat -> the bell: bedtime is mirrored on the town clock, identical for everyone
    await waitFor(() => lastGame(h)?.phase === 'bedtime', 10_000, 'bedtime');
    await waitFor(() => others.every((c) => lastGame(c)?.phase === 'bedtime'), 5000, 'bedtime everywhere');
    const clocks = [h, ...others].map((c) => JSON.stringify(lastGame(c)!.clock));
    expect(new Set(clocks).size).toBe(1);
    expect(lastGame(h)!.clock).toMatchObject({ stage: 'bedtime', paused: false, totalMs: 45_000 });
    // roles are dealt (revealed at nightfall), and clock proposals are refused outside the day
    h.send('clock:propose', { minutes: 2 });
    expect((await errorFor(h, 'clock:propose')).code).toBe('phase');
    // abort: only the host
    others[2]!.send('lobby:abort', {});
    expect((await errorFor(others[2]!, 'lobby:abort')).code).toBe('forbidden');
    h.send('lobby:abort', {});
    await h.view((v) => v.lobby.phase === 'waiting', 5000);
    await waitFor(() => others[3]!.of('announcement').some((a) => a.text.startsWith('The host ended the game')), 3000, 'abort announcement');
    const rows = srv.services.database.sqlite.prepare('SELECT record_json AS j FROM match_records WHERE lobby_id = ?').all(l.id) as { j: string }[];
    expect(rows).toHaveLength(1);
    const rec = JSON.parse(rows[0]!.j);
    expect(rec.status).toBe('abandoned');
    expect(rec.abandon.reason).toBe('aborted_by_host');
    expect(rec.storyteller).toBeNull();
    expect(rec.timeline.some((e: { text: string; data: { decision?: string } }) => e.data.decision === 'seeds')).toBe(true);
    expect(JSON.stringify(rec.timeline)).not.toMatch(/"The Storyteller/);
    // the same members can start again
    for (const c of [h, ...others]) c.send('lobby:ready', { ready: true });
    await h.view((v) => v.canStart, 5000);
    // secrecy: no player ever received another player's character in a game view before the end
    for (const c of [h, ...others]) {
      for (const v of c.of('game:view') as PlayerGameView[]) {
        const s = JSON.stringify({ ...v, you: { ...v.you, role: null, evilTeam: null }, info: [], prompts: [], spyGrimoire: null });
        expect(s).not.toMatch(/"character"|"alignment"/);
      }
    }
    const errors = srv.log.lines.filter((x) => JSON.parse(x).level === 'error');
    expect(errors, errors.join('\n')).toEqual([]);
  }, 60_000);

  it('a human lobby switched to auto moves the seated Storyteller to a player seat; human lobbies refuse clock/abort messages', async () => {
    const { host, lobby: l } = await lobby('Switch town', { takeStoryteller: true, maxPlayers: 5 });
    expect(l.storytellerMode).toBe('human');
    expect(l.storytellerSeatOpen).toBe(true);
    const st = await join(l.id, 'ST', host.cookie, 'storyteller');
    await st.view((v) => v.members.some((m) => m.role === 'storyteller' && m.isHost));
    const ps: TestClient[] = [];
    for (let i = 0; i < 5; i++) ps.push(await join(l.id, `S${i}`));
    for (const c of ps) c.send('lobby:ready', { ready: true });
    await st.view((v) => v.canStart, 5000);
    // a human game: clock messages and abort are refused; the Storyteller runs it as before
    st.send('lobby:start', {});
    await st.view((v) => v.lobby.phase !== 'waiting', 5000);
    ps[0]!.send('clock:propose', { minutes: 1 });
    expect((await errorFor(ps[0]!, 'clock:propose')).code).toBe('forbidden');
    st.send('lobby:abort', {});
    expect((await errorFor(st, 'lobby:abort')).code).toBe('forbidden');
    const v0 = await waitFor(() => lastGame(ps[0]!), 3000, 'view');
    expect(v0.storytellerMode).toBe('human');
    expect(v0.clock).toBeNull();
    st.send('st:command', { type: 'random_setup' });
    st.send('st:command', { type: 'declare_winner', winner: 'good', reason: 'test' });
    await st.view((v) => v.lobby.phase === 'finished', 5000);
    st.send('lobby:start', {}); // rematch -> waiting room
    await st.view((v) => v.lobby.phase === 'waiting', 5000);
    // 5 of 5 player seats taken: switching to auto needs a free seat for the Storyteller
    st.send('lobby:settings', { storytellerMode: 'auto' });
    expect((await errorFor(st, 'lobby:settings')).message).toMatch(/No free player seat/);
    expect(st.last('lobby:view')!.lobby.storytellerMode).toBe('human');
    ps[1]!.send('lobby:settings', { storytellerMode: 'auto', maxPlayers: 6 });
    expect((await errorFor(ps[1]!, 'lobby:settings')).code).toBe('forbidden'); // host only
    st.send('lobby:settings', { storytellerMode: 'auto', maxPlayers: 6 });
    const v = await st.view((x) => x.lobby.storytellerMode === 'auto');
    expect(v.lobby.storytellerSeatOpen).toBe(false);
    expect(v.lobby.maxPlayers).toBe(6);
    expect(v.members.every((m) => m.role === 'player')).toBe(true);
    expect(v.members.find((m) => m.pid === st.pid)!.isHost).toBe(true);
    // and back to human: the seat is open again
    st.send('lobby:settings', { storytellerMode: 'human' });
    const w = await st.view((x) => x.lobby.storytellerMode === 'human');
    expect(w.lobby.storytellerSeatOpen).toBe(true);
    expect(w.lobby.autoTimings).toBeUndefined();
  }, 60_000);
});
