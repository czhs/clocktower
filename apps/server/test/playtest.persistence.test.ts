// OWNED BY playtest. Persistence playtest over the REAL in-process server: character presets are
// validated, identical display names never get confused (everything is keyed by pid/seat), a
// duplicate game_finished never double counts, and stats/cosmetics/sessions survive a server
// restart on the same SQLite file. Harness: ./playtestHarness.ts.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { matchMaker } from '@colyseus/core';
import { PRESET_IDS } from '@ct/assets';
import { DEFAULT_COSMETICS, type LobbyRoomView, type StatsView } from '@ct/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createLobby, makeAccount, sleep, TestClient, waitFor } from '../src/rooms/testkit.js';
import {
  attachBot,
  env,
  execute,
  newGame,
  nominate,
  runNight,
  scanGame,
  startGame,
  startPlaytestServer,
  stopPlaytestServer,
  toDay,
  verifyFinished,
  vote,
} from './playtestHarness.js';

/** Any preset id of the generated manifest (ids are renamed by the art pipeline from time to time). */
const [PRESET, PRESET2, PRESET3] = [...PRESET_IDS] as [string, string, string];
const PORT = 3314; // playtest range 3310-3319
const DB = `file:${path.join(mkdtempSync(path.join(tmpdir(), 'ct-playtest-persist-')), 'persist.db')}`;

beforeAll(async () => {
  await startPlaytestServer(PORT, { DATABASE_URL: DB });
}, 30_000);
afterAll(stopPlaytestServer, 30_000);

const memberCosmetics = (v: LobbyRoomView | undefined, pid: string) => v?.members.find((m) => m.pid === pid)?.cosmetics;

describe('playtest: persistence', () => {
  it('presets are validated; twins play without confusion; duplicate finish does not double count; stats, cosmetics and sessions survive a restart', async () => {
    const twinA = await makeAccount(env.srv, 'Twin');
    const twinB = await makeAccount(env.srv, 'Twin');
    // Preset ids are checked against the generated manifest; stored cosmetics without a preset load fine.
    expect((await api(env.srv, 'GET', '/api/me', { cookie: twinA.cookie })).status).toBe(200);
    const bad = await api(env.srv, 'PATCH', '/api/me', { cookie: twinA.cookie, body: { cosmetics: { ...DEFAULT_COSMETICS, preset: 'not-a-preset' } } });
    expect(bad.status).toBe(400);
    const good = await api(env.srv, 'PATCH', '/api/me', { cookie: twinA.cookie, body: { cosmetics: { ...DEFAULT_COSMETICS, preset: PRESET } } });
    expect(good.status).toBe(200);
    expect(JSON.stringify(good.body)).toContain(`"preset":"${PRESET}"`);
    const cleared = await api(env.srv, 'PATCH', '/api/me', { cookie: twinB.cookie, body: { cosmetics: { ...DEFAULT_COSMETICS, preset: null } } });
    expect(cleared.status).toBe(200);

    const accounts = [
      { name: 'Twin', cookie: twinA.cookie, accountId: twinA.account.id },
      { name: 'Twin', cookie: twinB.cookie, accountId: twinB.account.id },
    ];
    const g = await newGame('Same', 5, 901, {}, accounts);
    const [jA, jB] = g.joined;
    // Waiting room: both named "Twin", distinct pids; preset validation on lobby:cosmetics too.
    const lv = g.st.last('lobby:view')!;
    // Same display name: the later joiner is shown with a suffix (SR-11), keyed by pid.
    expect(lv.members.find((m) => m.pid === jA!.c.pid)!.displayName).toBe('Twin');
    expect(lv.members.find((m) => m.pid === jB!.c.pid)!.displayName).toBe('Twin (2)');
    expect(memberCosmetics(lv, jA!.c.pid!)?.preset).toBe(PRESET);
    jB!.c.send('lobby:cosmetics', { cosmetics: { ...DEFAULT_COSMETICS, preset: 'bogus-preset' } });
    await jB!.c.waitMsg('error', (e) => e.for === 'lobby:cosmetics' && /preset/i.test(e.message));
    jB!.c.send('lobby:cosmetics', { cosmetics: { ...DEFAULT_COSMETICS, preset: PRESET2 } });
    await g.st.view((v) => memberCosmetics(v, jB!.c.pid!)?.preset === PRESET2);

    // 0 imp, 1 poisoner, 2 chef, 3 empath, 4 washerwoman (seats are shuffled; twins are found by pid)
    await startGame(g, ['imp', 'poisoner', 'chef', 'empath', 'washerwoman']);
    const A = g.players.find((p) => p.accountId === twinA.account.id)!;
    const B = g.players.find((p) => p.accountId === twinB.account.id)!;
    expect(A.seat).not.toBe(B.seat);
    expect([A.name, B.name]).toEqual(['Twin', 'Twin (2)']);
    // Reserved names cannot be taken (no impersonating the game in chat).
    expect((await api(env.srv, 'PATCH', '/api/me', { cookie: twinA.cookie, body: { displayName: 'The Storyteller' } })).status).toBe(400);
    expect((await api(env.srv, 'POST', '/api/auth/create', { body: { displayName: 'system' } })).status).toBe(400);

    // No mid-game disguises: lobby:cosmetics is refused and an account-level PATCH does not reach the room.
    A.c.send('lobby:cosmetics', { cosmetics: { ...DEFAULT_COSMETICS, preset: PRESET3 } });
    await A.c.waitMsg('error', (e) => e.for === 'lobby:cosmetics' && e.code === 'phase');
    expect((await api(env.srv, 'PATCH', '/api/me', { cookie: twinA.cookie, body: { cosmetics: { ...DEFAULT_COSMETICS, preset: PRESET3 } } })).status).toBe(200);
    A.c.drop();
    A.past.push(A.c);
    A.c = await TestClient.join(env.srv, A.cookie, g.lobbyId, 'reconnect', A.name);
    attachBot(A);
    await A.c.waitMsg('game:view', (v) => v.kind === 'player');
    await sleep(200);
    expect(memberCosmetics(g.st.last('lobby:view'), A.pid)?.preset).toBe(PRESET);

    await runNight(g);
    await toDay(g, false);
    // Twin A nominates Twin B; everything is keyed by seat.
    await g.cmd({ type: 'set_nominations_open', open: true }, { until: (v) => v.day?.nominationsOpen === true });
    const n = await nominate(g, A, B.seat);
    await vote(g, n, new Set(g.players.map((p) => p.seat).filter((s) => s !== B.seat)));
    await execute(g, B.seat);
    expect(g.pv(B).you.alive).toBe(false);
    expect(g.pv(A).you.alive).toBe(true);
    expect(g.stView().grimoire.find((e) => e.seat === B.seat)!.alive).toBe(false);
    await g.cmd({ type: 'declare_winner', winner: 'good', reason: 'Storyteller ruling (test)' }, { until: (v) => v.phase === 'finished' });
    const result = await verifyFinished(g, { winner: 'good' });

    // Duplicate game_finished (and a second outcome recording) do not double count.
    const room = matchMaker.getLocalRoomById(g.st.room.roomId) as unknown as {
      host: { emit(e: { type: 'game_finished' }): void };
      afterHandler(): void;
      recordOutcome(): void;
    };
    expect(room).toBeTruthy();
    room.host.emit({ type: 'game_finished' });
    room.afterHandler();
    room.recordOutcome();
    await sleep(200);
    const count = () => env.srv.services.database.sqlite.prepare('SELECT COUNT(*) AS n FROM matches WHERE lobby_id = ?').get(g.lobbyId);
    expect(count()).toEqual({ n: 1 });
    const statsBefore = new Map<string, StatsView>();
    for (const p of g.players) {
      const s = (await api<StatsView>(env.srv, 'GET', '/api/me/stats', { cookie: p.cookie })).body;
      const r = result.reveal.find((x) => x.seat === p.seat)!;
      expect(s).toMatchObject({ matchesPlayed: 1, matchesCompleted: 1, wins: r.alignment === 'good' ? 1 : 0, losses: r.alignment === 'good' ? 0 : 1 });
      expect(s.roleHistory).toHaveLength(1);
      expect(s.roleHistory[0]!.character).toBe(r.character);
      statsBefore.set(p.accountId, s);
    }
    expect(statsBefore.get(twinB.account.id)!.timesExecuted).toBe(1);
    expect(statsBefore.get(twinA.account.id)!.nominationsMade).toBe(1);
    expect((await api<StatsView>(env.srv, 'GET', '/api/me/stats', { cookie: g.stCookie })).body.gamesStorytold).toBe(1);
    scanGame(g);

    // Restart the server on the same database file.
    await stopPlaytestServer();
    env.games.splice(0);
    await startPlaytestServer(PORT, { DATABASE_URL: DB, ADMIN_ACCOUNT_IDS: twinA.account.id });
    for (const p of g.players) {
      const s = (await api<StatsView>(env.srv, 'GET', '/api/me/stats', { cookie: p.cookie })).body;
      expect(s).toEqual(statsBefore.get(p.accountId));
    }
    const me = await api(env.srv, 'GET', '/api/me', { cookie: twinA.cookie });
    expect(me.status).toBe(200); // session survived
    expect(JSON.stringify(me.body)).toContain(`"preset":"${PRESET3}"`);
    expect(env.srv.services.stats.matchCount()).toBe(1);
    // Admin "close lobby" (SR-2 remedy): non-admins are refused; members are told and disconnected.
    const host = await makeAccount(env.srv, 'Squatter');
    const sq = await createLobby(env.srv, host.cookie, { name: 'Squat town' });
    const inside = await TestClient.join(env.srv, host.cookie, sq.id, 'player', 'Squatter');
    expect((await api(env.srv, 'POST', `/api/admin/lobbies/${sq.id}/close`, { cookie: host.cookie, body: {} })).status).toBe(403);
    expect((await api(env.srv, 'POST', `/api/admin/lobbies/${sq.id}/close`, { cookie: twinA.cookie, body: {} })).status).toBe(200);
    await inside.waitMsg('kicked');
    await waitFor(() => inside.closeCode === 4103, 3000, 'closed with lobbyClosed');
    await waitFor(async () => (await api(env.srv, 'GET', '/api/lobbies', { cookie: twinA.cookie })).body.lobbies.every((l: { id: string }) => l.id !== sq.id), 3000, 'lobby gone');
    expect((await api(env.srv, 'POST', '/api/admin/lobbies/nope1234/close', { cookie: twinA.cookie, body: {} })).status).toBe(404);
    // "Sign out all devices" (SR-12).
    expect((await api(env.srv, 'POST', '/api/auth/signout-all', { cookie: twinB.cookie, body: {} })).status).toBe(200);
    expect((await api(env.srv, 'GET', '/api/me', { cookie: twinB.cookie })).status).toBe(401);
    expect((await api(env.srv, 'GET', '/api/me', { cookie: twinA.cookie })).status).toBe(200);

    // The restarted server is fully usable.
    const g2 = await newGame('After', 5, 902);
    await startGame(g2);
    await g2.cmd({ type: 'declare_winner', winner: 'evil', reason: 'Storyteller ruling (test)' }, { until: (v) => v.phase === 'finished' });
    await verifyFinished(g2, { winner: 'evil' });
    await waitFor(() => env.srv.services.stats.matchCount() === 2, 3000, 'second match');
    scanGame(g2);
  }, 120_000);
});
