// Lobby finder accuracy (qa-deploy): as a lobby fills, starts, changes phase, finishes, rematches and
// closes, the SSE stream and GET /api/lobbies must show the right counts/phases within ~2 s.
// Also: a stale tab (SSE closed while things change) gets a correct snapshot on reconnect.
import { afterAll, describe, expect, it } from 'vitest';
import type { DirectoryEvent, LobbySummary } from '../../packages/protocol/src/index.js';
import { Bot, makeBots } from '../support/bot.js';
import { pending } from '../support/features.js';
import { playFullGame, setupGame, toDay, until } from '../support/game.js';
import type { SseStream } from '../support/http.js';
import { sleep, suiteServer, uniq } from '../support/suite.js';

const IDLE_SEC = 10;
const { server, features } = await suiteServer({ env: { LOBBY_IDLE_TIMEOUT_SEC: String(IDLE_SEC), LOBBY_MAX_COUNT: '16' } });
const all: Bot[] = [];
const streams: SseStream[] = [];
afterAll(async () => {
  for (const s of streams) s.close();
  await Promise.all(all.map((b) => b.leave().catch(() => undefined)));
});

const timings: Record<string, number> = {};

interface Mark {
  t: number;
  idx: number;
}
const mark = (sse: SseStream): Mark => ({ t: Date.now(), idx: sse.events.length });

/** Wait for an SSE upsert of `id` (received after `m`) satisfying pred; record the latency. */
async function sseSees(sse: SseStream, id: string, label: string, pred: (l: LobbySummary) => boolean, m: Mark) {
  const deadline = Date.now() + 2500;
  for (;;) {
    const hit = sse.events.slice(m.idx).find((e) => e.type === 'upsert' && e.lobby.id === id && pred(e.lobby)) as
      | Extract<DirectoryEvent, { type: 'upsert' }>
      | undefined;
    if (hit) {
      timings[label] = Date.now() - m.t;
      return hit.lobby;
    }
    if (Date.now() > deadline) throw new Error(`SSE did not show "${label}" within 2.5 s`);
    await sleep(25);
  }
}

async function listSees(bot: Bot, id: string, label: string, pred: (l: LobbySummary | undefined) => boolean) {
  const t0 = Date.now();
  for (;;) {
    const r = await bot.api.listLobbies();
    if (pred(r.body.lobbies.find((l) => l.id === id))) return;
    if (Date.now() - t0 > 2000) throw new Error(`list did not show "${label}" within 2 s`);
    await sleep(100);
  }
}

describe.skipIf(!features.rooms)(`lobby finder accuracy${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('fill -> full -> start -> night -> day -> finished -> rematch -> empty -> removed, within ~2 s each', async () => {
    const [watcher] = await makeBots(1, uniq('watch-'), server.url, server.wsUrl);
    all.push(watcher!);
    const sse = await watcher!.api.openDirectory();
    streams.push(sse);
    await sse.waitFor((e) => e.type === 'snapshot');
    const m0 = mark(sse);
    const g = (await setupGame(server.url, server.wsUrl, { players: 5, maxPlayers: 5, noStart: true, prefix: uniq('dir-') }))!;
    all.push(g.st, ...g.players);
    const id = g.lobbyId;
    // Full: 5/5 players, Storyteller named, not joinable.
    let l = await sseSees(sse, id, 'full 5/5', (x) => x.playerCount === 5 && !x.joinable, m0);
    delete timings['full 5/5']; // includes account/lobby setup time
    expect(l.storytellerName).toBe(g.st.name);
    expect(l.storytellerSeatOpen).toBe(false);
    await listSees(watcher!, id, 'full', (x) => x?.playerCount === 5 && x.joinable === false);
    // One leaves -> 4/5 joinable.
    let t = mark(sse);
    await g.players[4]!.leave(true);
    await sseSees(sse, id, 'leave -> 4/5', (x) => x.playerCount === 4 && x.joinable, t);
    t = mark(sse);
    await g.players[4]!.join(id);
    await sseSees(sse, id, 'rejoin -> 5/5', (x) => x.playerCount === 5, t);
    for (const p of g.players) p.send('lobby:ready', { ready: true });
    await until(() => g.st.lobbyView?.canStart, 5000, 'canStart');
    // Start + phases.
    t = mark(sse);
    g.st.send('lobby:start', {});
    l = await sseSees(sse, id, 'start -> not waiting', (x) => x.phase !== 'waiting', t);
    expect(l.joinable).toBe(false);
    await until(() => (g.st.gameView as any)?.kind === 'storyteller', 5000, 'ST view');
    g.cmd({ type: 'random_setup' });
    await until(() => g.stView()?.grimoire?.length === 5, 5000, 'setup');
    g.grimoire = g.stView()!.grimoire;
    t = mark(sse);
    g.cmd({ type: 'begin_first_night' });
    await sseSees(sse, id, 'first night -> night', (x) => x.phase === 'night', t);
    for (const p of g.players) g.seatOf.set(p, (p.gameView as any).you.seat);
    t = mark(sse);
    await toDay(g);
    await sseSees(sse, id, 'day', (x) => x.phase === 'day', t);
    await listSees(watcher!, id, 'list day', (x) => x?.phase === 'day');
    await playFullGame(g, { declare: false });
    t = mark(sse);
    if ((g.stView() as any)?.pendingResult) g.cmd({ type: 'confirm_result' });
    else g.cmd({ type: 'declare_winner', winner: 'good', reason: 'directory test' });
    await sseSees(sse, id, 'finished', (x) => x.phase === 'finished', t);
    await listSees(watcher!, id, 'list finished', (x) => x?.phase === 'finished');
    // Rematch (ST): back to waiting with the same members.
    t = mark(sse);
    g.st.send('lobby:start', {});
    l = await sseSees(sse, id, 'rematch -> waiting', (x) => x.phase === 'waiting', t);
    expect(l.playerCount).toBe(5);
    // Everyone leaves -> count 0 promptly; then removed after the idle timeout.
    t = mark(sse);
    await Promise.all([g.st, ...g.players].map((b) => b.leave(true)));
    await sseSees(sse, id, 'all left -> 0/5', (x) => x.playerCount === 0, t);
    const emptyAt = Date.now();
    void emptyAt;
    await sse.waitFor((e) => e.type === 'remove' && e.id === id, (IDLE_SEC + 15) * 1000);
    timings['empty -> removed (idle timeout)'] = Date.now() - emptyAt;
    await listSees(watcher!, id, 'list removed', (x) => x === undefined);
    console.log(`[directory] SSE latencies (ms): ${JSON.stringify(timings)}`);
    for (const [k, v] of Object.entries(timings)) if (!k.includes('removed')) expect(v, k).toBeLessThan(2000);
  }, 120_000);

  it('a stale tab reconnecting its SSE stream gets a snapshot equal to the current list', async () => {
    const [watcher] = await makeBots(1, uniq('stale-'), server.url, server.wsUrl);
    all.push(watcher!);
    const first = await watcher!.api.openDirectory();
    await first.waitFor((e) => e.type === 'snapshot');
    first.close(); // tab goes to sleep
    // Things change while the tab is asleep.
    const g = (await setupGame(server.url, server.wsUrl, { players: 5, maxPlayers: 7, prefix: uniq('stl-') }))!;
    all.push(g.st, ...g.players);
    const [h2, p2] = await makeBots(2, uniq('stl2-'), server.url, server.wsUrl);
    all.push(h2!, p2!);
    const L2 = await h2!.createLobby(uniq('Second '), 6);
    await h2!.join(L2);
    await p2!.join(L2);
    await sleep(500);
    const again = await watcher!.api.openDirectory();
    streams.push(again);
    const snap = (await again.waitFor((e) => e.type === 'snapshot')) as Extract<DirectoryEvent, { type: 'snapshot' }>;
    const list = (await watcher!.api.listLobbies()).body.lobbies;
    const norm = (ls: LobbySummary[]) => ls.map((l) => [l.id, l.playerCount, l.phase, l.joinable, l.storytellerName]).sort();
    expect(norm(snap.lobbies)).toEqual(norm(list));
    const s1 = snap.lobbies.find((l) => l.id === g.lobbyId)!;
    expect([s1.phase, s1.playerCount]).toEqual(['day', 5]);
    const s2 = snap.lobbies.find((l) => l.id === L2)!;
    expect([s2.phase, s2.playerCount]).toEqual(['waiting', 2]);
  }, 60_000);

  it('SSE sends heartbeats so idle proxies (Cloudflare) keep the stream open', async () => {
    const [watcher] = await makeBots(1, uniq('hb-'), server.url, server.wsUrl);
    all.push(watcher!);
    const sse = await watcher!.api.openDirectory();
    streams.push(sse);
    const t0 = Date.now();
    await sse.waitFor((e) => e.type === 'heartbeat', 30_000);
    console.log(`[directory] first heartbeat after ${Date.now() - t0} ms`);
  }, 40_000);
});
