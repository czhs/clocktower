// OWNED BY rules-storyteller. (v2.2) Storylines + the Storyteller's pre-game settings through the REAL
// server (HTTP + Colyseus + real modules): 'prepare' is Storyteller-only and waiting-room-only, the
// prepared settings appear ONLY in the Storyteller's own lobby view and are applied at start (the
// storyline is dealt automatically); automatic lobbies keep the host's storyline secret in the public
// summary unless announced.
import type { LobbyRoomView, LobbySummary, PlayerGameView, StorytellerGameView } from '@ct/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, makeAccount, startTestServer, TestClient, waitFor, type TestServer } from '../src/rooms/testkit.js';

const PORT = 3318; // rules-storyteller range (3317 is auto.room)
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

const errorFor = (c: TestClient, type: string) => waitFor(() => c.of('error').find((e) => e.for === type), 3000, `${c.name}: error for ${type}`);

describe('storylines + prepare through the real server', () => {
  it("prepare: ST only, private to the ST's lobby view, applied at start (storyline dealt); players see nothing", async () => {
    const { host, lobby: l } = await lobby('Prep town', { takeStoryteller: true, maxPlayers: 6 });
    const st = await join(l.id, 'ST', host.cookie, 'storyteller');
    const ps: TestClient[] = [];
    for (let i = 0; i < 6; i++) ps.push(await join(l.id, `P${i}`));
    // defaults: only the Storyteller's own view carries stPrepare
    const sv = await st.view((v) => v.members.length === 7 && !!v.stPrepare);
    expect(sv.stPrepare).toMatchObject({ deal: 'manual', storyline: null });
    for (const c of ps) expect(c.last('lobby:view')!.stPrepare).toBeUndefined();
    // players cannot prepare
    ps[0]!.send('st:command', { type: 'prepare', prepare: { deal: 'random' } });
    expect((await errorFor(ps[0]!, 'st:command')).code).toBe('forbidden');
    // invalid payloads are refused by the schema
    st.send('st:command', { type: 'prepare', prepare: { deal: 'storyline', storyline: 'no-such-story' as 'classic-night' } }); // a bogus id (cast past the types)
    expect((await errorFor(st, 'st:command')).code).toBe('invalid');
    // other st:commands are still refused while waiting
    st.send('st:command', { type: 'deal_preset', storyline: 'classic-night' });
    await waitFor(() => st.of('error').filter((e) => e.for === 'st:command').length >= 2, 3000, 'deal refused while waiting');
    st.send('st:command', { type: 'prepare', prepare: { deal: 'storyline', storyline: 'saints-gambit', bedtimeSeconds: 75, settings: { voteSeconds: 2 } } });
    const prepared = await st.view((v) => v.stPrepare?.storyline === 'saints-gambit');
    expect(prepared.stPrepare).toEqual({ deal: 'storyline', storyline: 'saints-gambit', bedtimeSeconds: 75, settings: { doorTags: true, voteSeconds: 2, pamphlets: false } });
    // nothing about it reached any player (lobby views, chat, anything)
    for (const c of ps) {
      expect(JSON.stringify(c.messages)).not.toMatch(/saints-gambit|stPrepare|Saint's Gambit/);
    }
    for (const c of ps) c.send('lobby:ready', { ready: true });
    await st.view((v) => v.canStart, 5000);
    st.send('lobby:start', {});
    const g = await waitFor(() => (st.last('game:view') as StorytellerGameView | undefined)?.charactersAssigned ? (st.last('game:view') as StorytellerGameView) : undefined, 5000, 'dealt at start');
    expect(g.deal).toEqual({ method: 'storyline', storyline: 'saints-gambit' });
    expect(g.grimoire.map((x) => x.character)).toContain('saint');
    expect(g.bedtimeSeconds).toBe(75);
    expect(g.settings?.voteSeconds).toBe(2);
    await new Promise((res) => setTimeout(res, 300));
    for (const c of ps) {
      const all = JSON.stringify(c.messages);
      expect(all).not.toMatch(/saints-gambit|Saint's Gambit|"deal"|stPrepare/);
      const v = c.last('game:view') as PlayerGameView;
      expect(v.kind).toBe('player');
      expect(JSON.stringify(v.you)).not.toMatch(/"character":"saint"/); // nothing revealed before the first night
    }
    // in game: prepare is refused
    st.send('st:command', { type: 'prepare', prepare: { deal: 'random' } });
    await waitFor(() => st.of('error').some((e) => e.for === 'st:command' && e.code === 'phase' && /has started/.test(e.message)), 3000, 'prepare refused in game');
  }, 60_000);

  it("automatic lobbies: the host's storyline is 'secret' publicly (the host sees their pick) unless announced", async () => {
    const { host, lobby: l } = await lobby('Fate town', { storytellerMode: 'auto' });
    expect(l.autoStoryline).toBe('random');
    const h = await join(l.id, 'Host', host.cookie);
    const p = await join(l.id, 'Guest');
    h.send('lobby:settings', { autoStoryline: 'poisoned-well' });
    const hv = await h.view((v) => v.lobby.autoStoryline === 'secret');
    expect(hv.autoStorylineChoice).toBe('poisoned-well');
    const pv = await p.view((v) => v.lobby.autoStoryline === 'secret');
    expect(pv.autoStorylineChoice).toBeUndefined();
    expect(JSON.stringify(p.messages)).not.toMatch(/poisoned-well/);
    const dir = await api<{ lobby: LobbySummary }>(srv, 'GET', `/api/lobbies/${l.id}`, { cookie: host.cookie });
    expect(dir.body.lobby.autoStoryline).toBe('secret');
    // only the host may change it
    p.send('lobby:settings', { autoStoryline: 'classic-night' });
    expect((await errorFor(p, 'lobby:settings')).code).toBe('forbidden');
    h.send('lobby:settings', { autoStorylinePublic: true });
    await p.view((v: LobbyRoomView) => v.lobby.autoStoryline === 'poisoned-well');
    h.send('lobby:settings', { autoStoryline: null });
    await p.view((v: LobbyRoomView) => v.lobby.autoStoryline === 'random');
  }, 30_000);
});
