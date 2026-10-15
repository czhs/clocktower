// OWNED BY records. A scripted full Trouble Brewing game through the REAL in-process server (playtest
// harness: HTTP accounts -> GameRoom with the real Game/World/Voice modules -> colyseus.js bots),
// then assertions on the saved game record (match_records): seats, roles, night steps + info,
// nominations + votes (incl. ghost votes), deaths + causes, Virgin / Slayer, winner + who confirmed,
// idempotency and secrecy (no chat, no tokens/passphrases). Also: the Storyteller's story
// (story:get), mid-game pamphlets behind the ST setting (public facts ONLY, checked against what
// players actually received), the final story with the reveal, an abandoned game, admin routes.
import { CHARACTER_IDS, CHARACTER_INFO, type CharacterId, type NominationView, type Pamphlet, type PlayerGameView, type StoryStView } from '@ct/protocol';
import { PLAYABLE_IDS } from '@ct/assets';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, makeAccount, waitFor } from '../src/rooms/testkit.js';
import { recordsRepo, type GameRecordV1 } from '../src/records/index.js';
import {
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
  toNight,
  verifyFinished,
  vote,
  waitAfter,
  type Game,
  type NightHooks,
} from './playtestHarness.js';

const PORT = 3316; // records range 3312-3319 (the harness falls back within 3310-3319)

beforeAll(async () => {
  await startPlaytestServer(PORT);
}, 30_000);
afterAll(stopPlaytestServer, 30_000);

const ASSIGN: CharacterId[] = ['imp', 'poisoner', 'fortune_teller', 'slayer', 'virgin', 'empath', 'monk'];
const nightOf = (stepId: string) => Number(stepId.slice(1).split('-')[0]);
const HOOKS: NightHooks = {
  answer: (_g, _p, step) => {
    const role = step.actingAs ?? step.character;
    if (role === 'poisoner') return { seats: [6] };
    if (role === 'fortune_teller') return { seats: nightOf(step.id) === 1 ? [0, 5] : [1, 3] };
    if (role === 'monk') return { seats: [2] };
    if (role === 'imp') return { seats: [6] };
    return undefined;
  },
};

const recordsOf = (lobbyId: string): GameRecordV1[] =>
  (env.srv.services.database.sqlite.prepare('SELECT record_json AS j FROM match_records WHERE lobby_id = ?').all(lobbyId) as { j: string }[]).map(
    (r) => JSON.parse(r.j) as GameRecordV1,
  );

function keysOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (out.add(k), keysOf(x, out));
  return out;
}

/**
 * A mid-game pamphlet may contain ONLY what players already received: every line is either an
 * announcement some player got, or a "hands raised" line matching a tallied nomination in a
 * player's public day view. No roles / statuses / night info / grimoire keys.
 */
function assertPublicPamphlet(g: Game, p: Pamphlet, privateTexts: string[]) {
  const allowedKeys = new Set(['id', 'kind', 'title', 'day', 'sections', 'lines', 'text', 'tone', 'digest', 'releasedAt', 'headline', 'flavour']);
  for (const k of keysOf(p)) expect(allowedKeys, `pamphlet key ${k}`).toContain(k);
  expect(p.kind).toBe('day');
  const announced = new Set<string>();
  const tallied: { nominee: string; yes: Set<string> }[] = [];
  for (const pl of g.players) {
    for (const m of pl.c.messages) {
      if (m.type === 'announcement') announced.add((m.payload as { text: string }).text);
      if (m.type !== 'game:view') continue;
      const v = m.payload as PlayerGameView;
      for (const a of v.announcements) announced.add(a.text);
      for (const n of (v.day?.nominations ?? []) as NominationView[]) {
        if (n.status !== 'tallied') continue;
        const name = (seat: number) => v.players.find((x) => x.seat === seat)!.name;
        tallied.push({ nominee: name(n.nomineeSeat), yes: new Set(Object.entries(n.votes).filter(([, y]) => y).map(([s]) => name(Number(s)))) });
      }
    }
  }
  let voteLines = 0;
  for (const sec of p.sections) {
    expect(sec.title).toMatch(/^(The first night|Night \d+|Day \d+)$/);
    for (const l of sec.lines) {
      const m = /^Hands raised for (.+?): (.+)\.$/.exec(l.text);
      if (m) {
        voteLines++;
        const names = m[2]!.replace(/ \(ghost vote\)/g, '').split(/, | and /);
        expect(tallied.some((t) => t.nominee === m[1] && names.length === t.yes.size && names.every((x) => t.yes.has(x))), l.text).toBe(true);
      } else expect(announced.has(l.text), `not public: ${l.text}`).toBe(true);
    }
  }
  const json = JSON.stringify(p);
  for (const t of privateTexts) expect(json.includes(t), `private text leaked: ${t}`).toBe(false);
  for (const id of CHARACTER_IDS) expect(new RegExp(`\\b${id}\\b`).test(json), `character id ${id}`).toBe(false);
  return voteLines;
}

describe('game records', () => {
  it('a full game is recorded completely, once, without secrets; the story + pamphlets work', async () => {
    const g = await newGame('Rec', 7, 4242);
    await startGame(g, ASSIGN);
    await runNight(g, HOOKS);
    await toDay(g, false);

    // A chat line: chat contents must never reach the record.
    g.bySeat(2).c.send('chat:send', { text: 'SECRET-CHAT-xyzzy' });
    await g.cmd({ type: 'set_nominations_open', open: true }, { until: (v) => v.day?.nominationsOpen === true });
    // Slayer shoots the Poisoner: nothing happens (ability spent).
    await g.act(g.bySeat(3), 'game:slayerShot', { targetSeat: 1 });
    await waitFor(() => g.stView().grimoire.find((e) => e.seat === 3)?.abilityUsed, 3000, 'slayer shot');
    // A failed vote, then the Empath nominates the Virgin and is executed on the spot.
    const failed = await nominate(g, g.bySeat(6), 1);
    expect((await vote(g, failed, new Set([6, 2]))).voteCount).toBe(2);
    await nominate(g, g.bySeat(5), 4);
    await waitFor(() => g.stView().day?.executedSeat === 5, 3000, 'virgin execution');
    await toNight(g, 'direct');
    await runNight(g, HOOKS);
    await toDay(g, true);

    // Seats are shuffled at start: names by seat.
    const N = (seat: number) => g.bySeat(seat).name;
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const R = (s: TemplateStringsArray, ...seats: number[]) => new RegExp(s.raw.map((part, i) => part + (i < seats.length ? esc(N(seats[i]!)) : '')).join(''));

    // ---- the Storyteller's story (players may not read it)
    const st = g.st;
    const p1 = g.bySeat(1);
    let e0 = p1.c.of('error').length;
    p1.c.send('story:get', {});
    await g.playerError(p1, 'story:get', e0, /Storyteller/);
    let since = st.messages.length;
    st.send('story:get', {});
    let sv = (await waitAfter(st, since, 'story:st')) as StoryStView;
    expect(sv.ofTheDay?.title).toBe('Day 1 and Night 2');
    const ofDay = sv.ofTheDay!.sections.flatMap((s) => s.entries.map((e) => e.text)).join('\n');
    expect(ofDay).toMatch(R`nominated the Virgin ${4} and was executed on the spot`);
    expect(ofDay).toMatch(R`The Imp \(${0}\) killed ${6} \(Monk\)`);
    expect(sv.soFar.map((s) => s.title)).toEqual(['Setup', 'The first night', 'Day 1', 'Night 2', 'Day 2']);
    expect(sv.pamphletsEnabled).toBe(false);
    expect(sv.previews).toEqual({ day: null, final: null });
    // Same rev: no reply (cheap polling).
    since = st.messages.length;
    st.send('story:get', { rev: sv.rev });
    st.send('ping', {});
    await waitAfter(st, since, 'pong');
    expect(st.messages.slice(since).some((m) => m.type === 'story:st')).toBe(false);
    // Mid-game pamphlets are a Storyteller setting, off by default.
    let stErr = st.of('error').length;
    st.send('story:release', { kind: 'day', digest: 'x' });
    await waitFor(() => st.of('error').slice(stErr).find((e) => e.for === 'story:release' && /turned off/.test(e.message)), 3000, 'pamphlets off');
    await g.cmd({ type: 'set_setting', settings: { pamphlets: true } }, { until: (v) => v.settings?.pamphlets === true });
    since = st.messages.length;
    st.send('story:get', {});
    sv = (await waitAfter(st, since, 'story:st', (v) => v.pamphletsEnabled)) as StoryStView;
    const preview = sv.previews.day!;
    expect(preview.title).toBe('Pamphlet: Day 2');
    expect(sv.previews.final).toBeNull();
    // A release must quote the previewed digest (what the ST saw is what is sent).
    stErr = st.of('error').length;
    st.send('story:release', { kind: 'day', digest: 'stale', headline: 'x' });
    await waitFor(() => st.of('error').slice(stErr).find((e) => e.for === 'story:release' && /changed/.test(e.message)), 3000, 'stale digest');
    // Players cannot release.
    e0 = p1.c.of('error').length;
    p1.c.send('story:release', { kind: 'day', digest: preview.digest });
    await g.playerError(p1, 'story:release', e0, /Storyteller/);

    const marks = new Map(g.players.map((p) => [p, p.c.messages.length]));
    const stMark = st.messages.length;
    st.send('story:release', { kind: 'day', digest: preview.digest, headline: 'Murder most foul' });
    let released: Pamphlet | undefined;
    for (const p of g.players) {
      released = (await waitAfter(p.c, marks.get(p)!, 'story:pamphlet')) as Pamphlet;
      expect(released).toMatchObject({ id: 'p1', kind: 'day', headline: 'Murder most foul', sections: preview.sections, digest: preview.digest });
    }
    await waitAfter(st, stMark, 'story:pamphlet');
    // Secrecy: only public facts (announcements players received + public vote hands).
    const privateTexts = g.players.flatMap((p) => g.pv(p).info.map((i) => i.text));
    expect(privateTexts.length).toBeGreaterThan(3);
    expect(assertPublicPamphlet(g, released!, privateTexts)).toBe(1);
    const lines = released!.sections.flatMap((s) => s.lines.map((l) => l.text));
    expect(lines).toContain(`${N(5)} has been executed on the spot and is dead.`);
    expect(lines).toContain(`${N(6)} is dead.`);
    expect(lines).toContain(`Hands raised for ${N(1)}: ${[2, 6].map(N).join(' and ')}.`);
    // Anyone can list this game's pamphlets again (e.g. after a reconnect).
    since = p1.c.messages.length;
    p1.c.send('story:pamphlets', {});
    expect(((await waitAfter(p1.c, since, 'story:pamphlets')) as { pamphlets: Pamphlet[] }).pamphlets.map((p) => p.id)).toEqual(['p1']);

    // ---- day 2: the Demon is nominated; ghost votes; execution; good wins
    await g.cmd({ type: 'set_nominations_open', open: true }, { until: (v) => v.day?.nominationsOpen === true });
    const nomId = await nominate(g, g.bySeat(2), 0);
    expect((await vote(g, nomId, new Set([2, 3, 4, 5, 6]))).voteCount).toBe(5);
    await execute(g, 0);
    await verifyFinished(g, { winner: 'good', reason: /Demon/ });

    // ---- the final story with the grimoire reveal (only after the end was confirmed)
    since = st.messages.length;
    st.send('story:get', {});
    sv = (await waitAfter(st, since, 'story:st', (v) => v.finished)) as StoryStView;
    const fin = sv.previews.final!;
    expect(fin).toMatchObject({ kind: 'final', title: 'The story of this game', winner: 'good' });
    expect(fin.reveal!.map((r) => r.character)).toEqual(ASSIGN);
    const finMarks = new Map(g.players.map((p) => [p, p.c.messages.length]));
    st.send('story:release', { kind: 'final', digest: fin.digest, flavour: 'Thanks for playing!' });
    for (const p of g.players) {
      const got = (await waitAfter(p.c, finMarks.get(p)!, 'story:pamphlet')) as Pamphlet;
      expect(got).toMatchObject({ id: 'p2', kind: 'final', flavour: 'Thanks for playing!' });
      expect(got.sections.flatMap((s) => s.lines.map((l) => l.text))).toContain('Good wins: The Demon is dead.');
    }

    // ---- the record
    await waitFor(() => recordsOf(g.lobbyId)[0]?.pamphlets.length === 2, 3000, 'final pamphlet appended to the record');
    const all = recordsOf(g.lobbyId);
    expect(all).toHaveLength(1);
    const r = all[0]!;
    expect(r).toMatchObject({ version: 1, status: 'finished', lobbyId: g.lobbyId, script: 'trouble-brewing', days: 2, nights: 2, abandon: null, warnings: [] });
    expect(r.storyteller).toMatchObject({ accountId: g.stAccountId, displayName: 'Rec-ST', label: 'Rec-ST' });
    expect(r.result).toMatchObject({ winner: 'good', reason: 'The Demon is dead.', via: 'confirm_result', confirmedBy: { accountId: g.stAccountId } });
    expect(r.result!.detectedAt).not.toBeNull();
    expect(r.settings.final.pamphlets).toBe(true);
    expect(r.settings.initial.pamphlets).toBe(false);
    expect(r.settings.initial.bedtimeSeconds).toBe(1);
    // seats
    expect(r.seats.map((x) => x.seat)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const x of r.seats) {
      const p = g.bySeat(x.seat);
      expect(x).toMatchObject({ accountId: p.accountId, pid: p.pid, label: p.name, displayName: p.name, startingCharacter: ASSIGN[x.seat], finalCharacter: ASSIGN[x.seat] });
      expect(x.startingAlignment).toBe(CHARACTER_INFO[ASSIGN[x.seat]!].alignment);
      expect(x.won).toBe(x.finalAlignment === 'good');
      expect(PLAYABLE_IDS.has(x.avatarId!)).toBe(true);
    }
    const seat = (n: number) => r.seats[n]!;
    expect(seat(5)).toMatchObject({ aliveAtEnd: false, executed: true, executedDays: [1], death: { cause: 'virgin', day: 1 } });
    expect(seat(6)).toMatchObject({ aliveAtEnd: false, executed: false, death: { cause: 'demon', night: 2, phase: 'night' } });
    expect(seat(0)).toMatchObject({ aliveAtEnd: false, executed: true, executedDays: [2], death: { cause: 'execution', day: 2 } });
    expect(seat(5).ghostVote).toMatchObject({ day: 2 });
    expect(seat(5).ghostVoteUsed).toBe(true);
    expect(seat(2).nominationsMade).toHaveLength(1);
    expect(seat(4).nominationsReceived).toHaveLength(1);
    expect(seat(3).votes.filter((v) => v.yes)).toHaveLength(1);
    // nominations + votes
    expect(r.nominations.map((n) => [n.day, n.nominatorSeat, n.nomineeSeat, n.result])).toEqual([
      [1, 6, 1, 'not_enough'],
      [1, 5, 4, 'virgin'],
      [2, 2, 0, 'on_the_block'],
    ]);
    const n2 = r.nominations[2]!;
    expect(n2).toMatchObject({ voteCount: 5, nomineeExecuted: true, minVotes: 3, status: 'tallied' });
    expect(n2.votes.filter((v) => v.yes).map((v) => [v.seat, v.ghost]).sort()).toEqual([[2, false], [3, false], [4, false], [5, true], [6, true]]);
    expect(n2.voteOrder).toEqual([1, 2, 3, 4, 5, 6, 0]);
    // executions + deaths
    expect(r.executions.map((e) => [e.day, e.seat, e.cause, e.died])).toEqual([
      [1, 5, 'virgin', true],
      [2, 0, 'execution', true],
    ]);
    expect(r.deaths.map((d) => [d.seat, d.cause])).toEqual([
      [5, 'virgin'],
      [6, 'demon'],
      [0, 'execution'],
    ]);
    expect(r.deaths[1]!.publicAt).toBeGreaterThan(r.deaths[1]!.at); // announced at dawn
    // night steps + info (the grimoire log)
    const ft1 = r.nightSteps.find((s) => s.kind === 'fortune_teller' && s.night === 1)!;
    expect(ft1).toMatchObject({ seat: 2, status: 'resolved', response: { seats: [0, 5] }, infoSent: true });
    const ftInfo = r.info.find((i) => i.id === ft1.infoIds[0])!;
    expect(ftInfo).toMatchObject({ seat: 2, stepId: ft1.id, yes: true, night: 1 });
    expect(r.nightSteps.find((s) => s.kind === 'poisoner' && s.night === 2)).toMatchObject({ response: { seats: [6] }, status: 'resolved' });
    expect(r.nightSteps.find((s) => s.kind === 'monk' && s.night === 2)).toMatchObject({ player: { poisoned: true }, response: { seats: [2] } });
    expect(r.nightSteps.find((s) => s.kind === 'imp' && s.night === 2)?.outcome).toMatch(/was killed/);
    expect(r.statusChanges.some((c) => c.seat === 6 && c.field === 'poisoned' && c.to === 'poisoner')).toBe(true);
    expect(r.setup).toMatchObject({ method: 'manual', redHerringSeat: expect.any(Number) });
    expect(r.setup!.demonBluffs).toHaveLength(3);
    expect(r.dayRecords.map((d) => [d.day, d.nominations.length, d.executions])).toEqual([
      [1, 2, [5]],
      [2, 1, [0]],
    ]);
    expect(r.nightRecords.map((n) => n.night)).toEqual([1, 2]);
    expect(r.nightRecords[1]!.visited.length).toBeGreaterThan(0);
    expect(r.phases[0]!.phase).toBe('setup');
    expect(r.phases.map((p) => p.phase)).toEqual(['setup', 'first_night', 'day', 'night', 'dawn', 'day', 'finished']);
    expect(r.storytellerCommands.map((c) => c.cmd.type)).toEqual(expect.arrayContaining(['assign_characters', 'begin_first_night', 'resolve_step', 'send_info', 'confirm_result', 'set_setting']));
    expect(r.playerActions.map((a) => a.action.type)).toEqual(expect.arrayContaining(['nominate', 'vote', 'promptResponse', 'slayerShot']));
    expect(r.storytellerLog.length).toBeGreaterThan(20);
    expect(r.announcements.some((a) => a.kind === 'game_over')).toBe(true);
    // the play-by-play
    const tl = r.timeline.map((e) => e.text);
    for (const re of [
      R`^The Grimoire: ${0} — Imp; ${1} — Poisoner;`,
      /^The first night falls\.$/,
      R`^The Storyteller woke ${2} \(Fortune Teller\), who chose ${0} and ${5}, and showed “.+”\.$`,
      R`^${6} \(Monk\) is poisoned \(by the Poisoner\)\.$`,
      R`^${3} \(Slayer\) claimed to be the Slayer and shot at ${1} \(Poisoner\): nothing happened\.$`,
      R`^Votes on ${1} \(nominated by ${6}\): ${2} and ${6} — 2 of 4 needed: not enough\.$`,
      R`^${5} \(Empath\) nominated the Virgin ${4} and was executed on the spot\.$`,
      R`^The Storyteller woke ${6} \(Monk\) — poisoned, who chose ${2}`,
      R`^The Imp \(${0}\) killed ${6} \(Monk\)\.$`,
      R`^Day 2 begins\. Died in the night: ${6}\.$`,
      R`^Votes on ${0} \(nominated by ${2}\): .*${5} \(ghost vote\) and ${6} \(ghost vote\) — 5 of 3 needed: on the block\.$`,
      R`^${0} \(Imp\) was executed\.$`,
      /^Game end detected: Good would win/,
      /^Good wins: The Demon is dead\.$/,
    ])
      expect(tl.some((t) => re.test(t)), String(re)).toBe(true);
    for (const e of r.timeline) {
      expect(e.t).toBeGreaterThanOrEqual(0);
      expect(e.at - e.t).toBe(r.timeline[0]!.at - r.timeline[0]!.t);
    }
    expect(r.timeline.at(-1)!.kind).toBe('end');
    expect(r.pamphlets.map((p) => p.kind)).toEqual(['day', 'final']);

    // ---- secrets: no chat, tokens, passphrases, cookies
    const json = JSON.stringify(r);
    expect(json).not.toContain('SECRET-CHAT-xyzzy');
    for (const cookie of [g.stCookie, ...g.players.map((p) => p.cookie)]) expect(json).not.toContain(cookie.split('=')[1]!);
    for (const k of keysOf(r)) expect(k).not.toMatch(/passphrase|token|cookie|verifier|salt|lookup|session/i);

    // ---- idempotent: written once; a second save is a no-op
    const repo = recordsRepo(env.srv.services.database);
    expect(repo.saveRecord({ matchId: r.matchId, lobbyId: r.lobbyId, version: 1, status: 'abandoned', startedAt: 0, endedAt: 1, winner: null, playerCount: 0, storytellerAccountId: null, record: {} })).toBe(false);
    expect(recordsOf(g.lobbyId)).toEqual([r]);
    const matchRow = env.srv.services.database.sqlite.prepare('SELECT id, winner FROM matches WHERE lobby_id = ?').all(g.lobbyId) as { id: string }[];
    expect(matchRow).toEqual([{ id: r.matchId, winner: 'good' }]);

    // ---- admin API: list + full JSON (download), admin-only
    const admin = await makeAccount(env.srv, 'RecAdmin');
    (env.srv.services.config.adminAccountIds as Set<string>).add(admin.account.id);
    const list = await api(env.srv, 'GET', '/api/admin/games', { cookie: admin.cookie });
    expect(list.status).toBe(200);
    expect(list.headers.get('cache-control')).toBe('no-store');
    const row = (list.body.games as { matchId: string }[]).find((x) => x.matchId === r.matchId);
    expect(row).toMatchObject({ lobbyId: g.lobbyId, lobbyName: 'Rec town', status: 'finished', playerCount: 7, winner: 'good', reason: 'The Demon is dead.', storytellerName: 'Rec-ST', storytellerAccountId: g.stAccountId });
    const mine = await api(env.srv, 'GET', `/api/admin/games?accountId=${g.bySeat(3).accountId}`, { cookie: admin.cookie });
    expect((mine.body.games as { matchId: string }[]).map((x) => x.matchId)).toEqual([r.matchId]);
    const one = await api(env.srv, 'GET', `/api/admin/games/${r.matchId}`, { cookie: admin.cookie });
    expect(one.status).toBe(200);
    expect(one.body).toEqual(r);
    const dl = await api(env.srv, 'GET', `/api/admin/games/${r.matchId}?download=1`, { cookie: admin.cookie });
    expect(dl.headers.get('content-disposition')).toBe(`attachment; filename="clocktower-game-${r.matchId}.json"`);
    expect((await api(env.srv, 'GET', '/api/admin/games/m_doesnotexist', { cookie: admin.cookie })).status).toBe(404);
    expect((await api(env.srv, 'GET', '/api/admin/games/..%2F..', { cookie: admin.cookie })).status).toBe(404);
    for (const url of ['/api/admin/games', `/api/admin/games/${r.matchId}`]) {
      expect((await api(env.srv, 'GET', url)).status).toBe(401);
      expect((await api(env.srv, 'GET', url, { cookie: g.players[0]!.cookie })).status).toBe(403);
    }

    scanGame(g);
  }, 120_000);

  it('an abandoned game (lobby closed mid-game) is recorded with whatever is known', async () => {
    const a = await newGame('Abn', 5, 77);
    await startGame(a);
    await runNight(a);
    await toDay(a, false);
    await a.cmd({ type: 'set_nominations_open', open: true }, { until: (v) => v.day?.nominationsOpen === true });
    await nominate(a, a.bySeat(0), 1);
    expect(env.srv.services.directory.close(a.lobbyId)).toBe(true);
    const r = await waitFor(() => recordsOf(a.lobbyId)[0], 5000, 'abandoned record');
    expect(r).toMatchObject({ status: 'abandoned', result: null, abandon: { reason: 'closed_by_admin', phase: 'day', day: 1, night: 1 }, days: 1 });
    expect(r.seats).toHaveLength(5);
    for (const x of r.seats) {
      expect(x.won).toBeNull();
      expect(x.startingCharacter).toBe(a.initial.get(x.seat)!.character);
      expect(x.accountId).toBe(a.bySeat(x.seat).accountId);
    }
    expect(r.nominations).toHaveLength(1);
    expect(r.nightSteps.length).toBeGreaterThan(2);
    expect(r.timeline.at(-1)).toMatchObject({ kind: 'end', data: { abandoned: true, reason: 'closed_by_admin' } });
    expect(r.timeline.at(-1)!.text).toBe('The game was abandoned (the lobby was closed by an administrator).');
    // The stats summary stays unfinished (no winner), the record row says abandoned.
    const m = env.srv.services.database.sqlite.prepare('SELECT ended_at, winner FROM matches WHERE id = ?').get(r.matchId);
    expect(m).toEqual({ ended_at: null, winner: null });
    const row = recordsRepo(env.srv.services.database).getSummary(r.matchId);
    expect(row).toMatchObject({ status: 'abandoned', winner: null, playerCount: 5 });
  }, 60_000);
});
