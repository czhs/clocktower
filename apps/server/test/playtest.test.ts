// OWNED BY playtest. Scripted bot playtests of the full Trouble Brewing loop through the REAL
// in-process server (GameRoom + real Game/World/Voice modules) for N = 5, 7, 10, 15 plus targeted
// rule scenarios. Harness, Storyteller/player bots and secrecy scans: ./playtestHarness.ts.
import type { NightStepView, PlayerGameView, S2CMessages, StorytellerGameView } from '@ct/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sleep, TestClient, waitFor } from '../src/rooms/testkit.js';
import {
  attachBot,
  env,
  execute,
  newGame,
  nominate,
  playToEnd,
  runDay,
  runNight,
  scanGame,
  startGame,
  startPlaytestServer,
  stopPlaytestServer,
  toDay,
  toNight,
  verifyFinished,
  vote,
  type Game,
  type Player,
} from './playtestHarness.js';

const PORT = 3312; // playtest range 3310-3319

beforeAll(async () => {
  await startPlaytestServer(PORT);
}, 30_000);
afterAll(stopPlaytestServer, 30_000);

describe('playtest: full games through the real server', () => {
  it('N=5 and N=7 play to completion concurrently in two lobbies in different phases', async () => {
    const A = await newGame('Oak', 5, 501);
    const B = await newGame('Elm', 7, 702);
    await startGame(A);
    await runNight(A);
    await toDay(A, false);
    // Lobby A is in its first day while lobby B starts its first night.
    const aCounts = new Map(A.players.map((p) => [p, p.c.of('game:view').length]));
    await startGame(B);
    expect(A.stView().phase).toBe('day');
    expect(B.stView().phase).toBe('first_night');
    for (const p of A.players) expect(A.pv(p).phase).toBe('day');
    for (const [p, n] of aCounts) expect(p.c.of('game:view').length, 'lobby A unaffected by lobby B').toBe(n);
    await A.st.view((lv) => lv.lobby.phase === 'day');
    await B.st.view((lv) => lv.lobby.phase === 'night');
    expect(A.stView().phase).toBe('day');

    await Promise.all([
      (async () => {
        await runDay(A, { secondNomination: true });
        await toNight(A, 'bedtime');
        await playToEnd(A, {});
      })(),
      playToEnd(B, { demonDay: 2 }),
    ]);
    await verifyFinished(A);
    await verifyFinished(B);
    expect(A.visitsChecked + B.visitsChecked).toBeGreaterThan(3);
    scanGame(A);
    scanGame(B);
  }, 240_000);

  it('N=10 plays to completion (attrition, ghost votes, bedtime countdowns)', async () => {
    const g = await newGame('Fir', 10, 1003);
    await startGame(g);
    await playToEnd(g, { secondNomination: true });
    await verifyFinished(g);
    expect(g.visitsChecked).toBeGreaterThan(5);
    scanGame(g);
  }, 300_000);

  it('N=15 plays to completion (Demon hunted from day 3)', async () => {
    const g = await newGame('Yew', 15, 1504);
    await startGame(g);
    await playToEnd(g, { demonDay: 3, secondNomination: true });
    await verifyFinished(g);
    expect(g.visitsChecked).toBeGreaterThan(8);
    scanGame(g);
  }, 400_000);
});

describe('playtest: targeted scenarios', () => {
  it('Imp star-pass: the chosen Minion becomes the Imp at night and nobody else learns it', async () => {
    const g = await newGame('Star', 6, 61);
    // seat: 0 imp, 1 poisoner, 2 washerwoman, 3 empath, 4 monk, 5 saint
    await startGame(g, ['imp', 'poisoner', 'washerwoman', 'empath', 'monk', 'saint']);
    await runNight(g, { answer: (_g, _p, step) => (step.character === 'poisoner' ? { seats: [3] } : undefined) });
    await toDay(g, false);
    await g.cmd({ type: 'set_nominations_open', open: true });
    await g.cmd({ type: 'execute', seat: null }, { until: (v) => v.day?.nominationsOpen === false });
    await toNight(g, 'bedtime');
    const minionInfo = g.pv(g.bySeat(1)).info.length;
    await runNight(g, {
      answer: (_g, _p, step) => (step.character === 'imp' ? { seats: [0] } : step.character === 'monk' ? { seats: [2] } : step.character === 'poisoner' ? { seats: [3] } : undefined),
      resolve: (_g, step) => (step.character === 'imp' ? { starpassSeat: 1 } : undefined),
      windowExceptions: (_g, step) => (step.character === 'imp' ? [1] : []),
    });
    let sv = g.stView();
    expect(sv.grimoire.find((e) => e.seat === 0)).toMatchObject({ character: 'imp', alive: false, publicAlive: true });
    expect(sv.grimoire.find((e) => e.seat === 1)).toMatchObject({ character: 'imp', alignment: 'evil', alive: true });
    const newImp = g.pv(g.bySeat(1));
    expect(newImp.you.role).toEqual({ character: 'imp', characterType: 'demon', alignment: 'evil' });
    expect(newImp.info.length).toBeGreaterThan(minionInfo);
    expect(newImp.info.at(-1)!.characters).toEqual(['imp']);
    // Old Imp's death is still secret until dawn.
    for (const p of g.players) expect(g.pv(p).players.find((x) => x.seat === 0)!.alive).toBe(true);
    await toDay(g, true);
    sv = g.stView();
    expect(sv.phase).toBe('day');
    for (const p of g.players) expect(g.pv(p).players.find((x) => x.seat === 0)!.alive).toBe(false);
    await runDay(g, {});
    await toNight(g, 'direct');
    await playToEnd(g, {});
    const result = await verifyFinished(g);
    expect(result.reveal.find((r) => r.seat === 1)!.character).toBe('imp');
    scanGame(g);
  }, 180_000);

  it('Scarlet Woman takes over when the Imp is executed with 5+ alive', async () => {
    const g = await newGame('Scar', 7, 71);
    await startGame(g, ['imp', 'scarlet_woman', 'washerwoman', 'investigator', 'chef', 'empath', 'fortune_teller']);
    await runNight(g); // includes Minion info / Demon info group steps (7 players)
    await toDay(g, false);
    await g.cmd({ type: 'set_nominations_open', open: true });
    const nomId = await nominate(g, g.bySeat(4), 0);
    await vote(g, nomId, new Set([1, 2, 3, 4, 5, 6]));
    await execute(g, 0);
    const sv = g.stView();
    expect(sv.phase).toBe('day');
    expect(sv.grimoire.find((e) => e.seat === 1)).toMatchObject({ character: 'imp', alive: true });
    expect(sv.alerts.some((a) => /Scarlet Woman/.test(a))).toBe(true);
    await waitFor(() => g.pv(g.bySeat(1)).you.role?.character === 'imp', 3000, 'SW learns she is the Imp');
    for (const p of g.players.filter((x) => x.seat !== 1)) expect(g.pv(p).info.some((i) => /now the Imp/.test(i.text))).toBe(false);
    await toNight(g, 'bedtime');
    await playToEnd(g, { demonDay: 2 });
    const result = await verifyFinished(g);
    expect(result.reveal.find((r) => r.seat === 1)!.character).toBe('imp');
    scanGame(g);
  }, 180_000);

  it('Virgin: a Townsfolk nominating the Virgin is executed on the spot', async () => {
    const g = await newGame('Vir', 5, 51);
    await startGame(g, ['imp', 'poisoner', 'virgin', 'chef', 'washerwoman']);
    await runNight(g, { answer: (_g, _p, step) => (step.character === 'poisoner' ? { seats: [4] } : undefined) });
    await toDay(g, false);
    await g.cmd({ type: 'set_nominations_open', open: true });
    await nominate(g, g.bySeat(3), 2);
    const sv = g.stView();
    expect(sv.day).toMatchObject({ executedSeat: 3, nominationsOpen: false });
    expect(sv.grimoire.find((e) => e.seat === 3)!.alive).toBe(false);
    expect(sv.grimoire.find((e) => e.seat === 2)!.abilityUsed).toBe(true);
    for (const p of g.players) {
      await waitFor(() => g.pv(p).players.find((x) => x.seat === 3)!.alive === false, 3000, 'virgin execution public');
      expect(g.pv(p).announcements.some((a) => a.text === `${g.bySeat(3).name} has been executed on the spot and is dead.`)).toBe(true);
    }
    // No more nominations or executions today.
    const e0 = g.bySeat(4).c.of('error').length;
    await g.act(g.bySeat(4), 'game:nominate', { nomineeSeat: 0 });
    await g.playerError(g.bySeat(4), 'game:nominate', e0, /not open|already been executed/);
    await g.cmd({ type: 'execute', seat: 0 }, { error: /one execution/ });
    await g.cmd({ type: 'declare_winner', winner: 'good', reason: 'Storyteller ruling (test)' }, { until: (v) => v.phase === 'finished' });
    await verifyFinished(g, { winner: 'good', reason: /Storyteller ruling/ });
    scanGame(g);
  }, 120_000);

  it('Slayer: bluffed shots do nothing; the real Slayer kills the Imp and good wins', async () => {
    const g = await newGame('Sly', 5, 52);
    await startGame(g, ['imp', 'poisoner', 'slayer', 'chef', 'washerwoman']);
    await runNight(g, { answer: (_g, _p, step) => (step.character === 'poisoner' ? { seats: [4] } : undefined) });
    await toDay(g, false);
    const chef = g.bySeat(3);
    const ann = () => g.pv(chef).announcements.length;
    const a0 = ann();
    await g.act(chef, 'game:slayerShot', { targetSeat: 0 });
    await waitFor(() => g.pv(chef).announcements.slice(a0).some((a) => a.text === 'Nothing happens.'), 3000, 'bluff shot');
    expect(g.stView().grimoire.find((e) => e.seat === 0)!.alive).toBe(true);
    expect(g.pv(chef).you.canSlayerShot).toBe(false);
    const e0 = chef.c.of('error').length;
    await g.act(chef, 'game:slayerShot', { targetSeat: 1 });
    await g.playerError(chef, 'game:slayerShot', e0, /already taken/);
    await g.act(g.bySeat(2), 'game:slayerShot', { targetSeat: 0 });
    await waitFor(() => g.stView().pendingResult, 3000, 'game end detected');
    // Play is paused until the ST confirms.
    const e1 = g.bySeat(3).c.of('error').length;
    await g.act(g.bySeat(3), 'game:slayerShot', { targetSeat: 1 });
    await g.playerError(g.bySeat(3), 'game:slayerShot', e1, /wait for the Storyteller|already taken/);
    await verifyFinished(g, { winner: 'good', reason: /Demon is dead/ });
    for (const p of g.players) expect(g.pv(p).announcements.some((a) => a.text === `${g.bySeat(0).name} has been slain and is dead.`)).toBe(true);
    scanGame(g);
  }, 120_000);

  it('Saint executed: evil wins immediately', async () => {
    const g = await newGame('Sai', 6, 62);
    await startGame(g, ['imp', 'poisoner', 'saint', 'chef', 'washerwoman', 'empath']);
    await runNight(g, { answer: (_g, _p, step) => (step.character === 'poisoner' ? { seats: [3] } : undefined) });
    await toDay(g, false);
    await g.cmd({ type: 'set_nominations_open', open: true });
    const id = await nominate(g, g.bySeat(3), 2);
    await vote(g, id, new Set([0, 1, 3, 4, 5]));
    await g.cmd({ type: 'execute', seat: 2 }, { until: (v) => !!v.pendingResult });
    // A misclick on the Saint can still be undone before the ST confirms.
    await g.cmd({ type: 'undo_last' }, { until: (v) => !v.pendingResult && v.grimoire[2]!.alive });
    for (const p of g.players) await waitFor(() => g.pv(p).players[2]!.alive, 3000, 'saint alive again');
    await g.cmd({ type: 'execute', seat: 2 }, { until: (v) => !!v.pendingResult });
    await verifyFinished(g, { winner: 'evil', reason: /Saint was executed/ });
    scanGame(g);
  }, 120_000);

  it('Mayor: three alive and no execution wins for good; ghost votes are one-use; nomination limits', async () => {
    const g = await newGame('May', 5, 53);
    // seat: 0 imp, 1 poisoner, 2 mayor, 3 chef, 4 washerwoman
    await startGame(g, ['imp', 'poisoner', 'mayor', 'chef', 'washerwoman']);
    const night = {
      answer: (_g: Game, _p: Player, step: NightStepView) =>
        step.character === 'poisoner' ? { seats: [3] } : step.character === 'imp' ? { seats: [3] } : undefined,
    };
    await runNight(g, night);
    await toDay(g, false);
    // Nominations are not open yet.
    let e0 = g.bySeat(2).c.of('error').length;
    await g.act(g.bySeat(2), 'game:nominate', { nomineeSeat: 4 });
    await g.playerError(g.bySeat(2), 'game:nominate', e0, /not open/);
    await g.cmd({ type: 'set_nominations_open', open: true });
    const id1 = await nominate(g, g.bySeat(2), 4);
    // One nomination at a time.
    e0 = g.bySeat(0).c.of('error').length;
    await g.act(g.bySeat(0), 'game:nominate', { nomineeSeat: 1 });
    await g.playerError(g.bySeat(0), 'game:nominate', e0, /in progress/);
    await vote(g, id1, new Set([0, 1, 2, 3]));
    // The Mayor already nominated; the washerwoman was already nominated.
    e0 = g.bySeat(2).c.of('error').length;
    await g.act(g.bySeat(2), 'game:nominate', { nomineeSeat: 1 });
    await g.playerError(g.bySeat(2), 'game:nominate', e0, /already nominated/);
    e0 = g.bySeat(0).c.of('error').length;
    await g.act(g.bySeat(0), 'game:nominate', { nomineeSeat: 4 });
    await g.playerError(g.bySeat(0), 'game:nominate', e0, /already been nominated/);
    await execute(g, 4);
    expect(g.pv(g.bySeat(4)).you).toMatchObject({ alive: false, canNominate: false, ghostVoteAvailable: true });
    await toNight(g, 'bedtime');
    await runNight(g, night); // Imp kills the chef -> imp, poisoner, mayor remain
    await toDay(g, true);
    expect(g.stView().grimoire.filter((e) => e.alive).map((e) => e.seat)).toEqual([0, 1, 2]);
    await g.cmd({ type: 'set_nominations_open', open: true });
    // Dead players cannot nominate.
    e0 = g.bySeat(4).c.of('error').length;
    await g.act(g.bySeat(4), 'game:nominate', { nomineeSeat: 0 });
    await g.playerError(g.bySeat(4), 'game:nominate', e0, /Dead players cannot nominate/);
    // Nomination 1: the dead washerwoman spends her ghost vote (not enough votes: 1 < 2).
    const id2 = await nominate(g, g.bySeat(2), 1);
    const n2 = await vote(g, id2, new Set([4]));
    expect(n2).toMatchObject({ voteCount: 1 });
    for (const p of g.players) await waitFor(() => g.pv(p).players.find((x) => x.seat === 4)!.ghostVoteAvailable === false, 3000, 'ghost vote spent');
    expect(g.pv(g.bySeat(4)).you.ghostVoteAvailable).toBe(false);
    // Nomination 2: her second ghost vote is refused; the dead chef's first one counts.
    const id3 = await nominate(g, g.bySeat(1), 0);
    const n3 = await vote(g, id3, new Set([3, 4]));
    expect(n3.votes).toMatchObject({ 3: true, 4: false });
    expect(g.stView().day!.onTheBlock).toBeNull();
    await g.cmd({ type: 'execute', seat: null }, { until: (v) => v.day?.nominationsOpen === false });
    await g.cmd({ type: 'advance_phase', to: 'bedtime' }, { until: (v) => !!v.pendingResult });
    expect(g.stView().phase).toBe('day');
    await verifyFinished(g, { winner: 'good', reason: /Mayor/ });
    scanGame(g);
  }, 150_000);

  it('ST disconnect during bedtime pauses the countdown; players reconnecting mid-night get their home, prompt and voice back', async () => {
    const g = await newGame('Ash', 7, 77, { bedtimeSeconds: 3 });
    await startGame(g, ['imp', 'poisoner', 'monk', 'chef', 'empath', 'fortune_teller', 'washerwoman']);
    await runNight(g);
    await toDay(g, false);
    await g.cmd({ type: 'set_nominations_open', open: true });
    await g.cmd({ type: 'execute', seat: null }, { until: (v) => v.day?.nominationsOpen === false });
    await g.cmd({ type: 'advance_phase', to: 'bedtime' }, { until: (v) => v.phase === 'bedtime' });
    await g.allPhase('bedtime');
    g.st.drop();
    g.stPast.push(g.st);
    await waitFor(() => g.players.every((p) => g.pv(p).phase === 'bedtime' && g.pv(p).phaseEndsAt === null), 3000, 'countdown paused');
    await sleep(3800); // longer than the whole countdown
    for (const p of g.players) expect(g.pv(p).phase).toBe('bedtime');
    g.st = await TestClient.join(env.srv, g.stCookie, g.lobbyId, 'reconnect', `${g.prefix}-ST`);
    const back = await g.st.waitMsg('game:view', (v) => v.kind === 'storyteller', 5000);
    expect(back.phase).toBe('bedtime');
    expect((back as StorytellerGameView).timerPaused).toBe(false);
    expect(back.phaseEndsAt).toBeGreaterThan(Date.now());
    await waitFor(() => g.stView().phase === 'night', 8000, 'countdown resumed and expired');
    await g.allPhase('night');

    // Night 2: the Monk drops right after receiving the prompt and comes back with a fresh ticket;
    // the Imp drops and comes back with the Colyseus reconnection token (what the client does first).
    const reconnected = new Set<number>();
    await runNight(g, {
      onPrompted: async (gg, p, step, prompt) => {
        if (step.character !== 'monk' && step.character !== 'imp') return false;
        const others = gg.players.filter((x) => x !== p);
        let since = 0;
        if (step.character === 'monk') {
          p.c.drop();
          p.past.push(p.c);
          p.online = false;
          await waitFor(() => others.every((o) => gg.pv(o).players.find((x) => x.seat === p.seat)!.connected === false), 3000, 'drop seen');
          p.c = await TestClient.join(env.srv, p.cookie, gg.lobbyId, 'reconnect', p.name);
        } else {
          const token = p.c.room.reconnectionToken;
          p.c.drop();
          p.online = false;
          await waitFor(() => others.every((o) => gg.pv(o).players.find((x) => x.seat === p.seat)!.connected === false), 3000, 'drop seen');
          since = p.c.messages.length;
          await p.c.reconnectWithToken(env.srv, token);
        }
        p.online = true;
        attachBot(p);
        const after = <K extends keyof S2CMessages>(type: K, pred: (x: S2CMessages[K]) => boolean) =>
          waitFor(
            () => p.c.messages.slice(since).filter((m) => m.type === type).map((m) => m.payload as S2CMessages[K]).find(pred),
            5000,
            `${String(type)} after reconnect of seat ${p.seat}`,
          );
        await after('world:teleport', (t) => t.location === `bld:house-${p.seat}`);
        const v = (await after('game:view', (x) => x.kind === 'player')) as PlayerGameView;
        expect(v.phase).toBe('night');
        expect(v.storytellerVisitingYou).toBe(true);
        expect(v.prompts.map((q) => q.id)).toContain(prompt.id);
        expect(v.you.role!.character).toBe(gg.initial.get(p.seat)!.believed);
        await after('world:snapshot', (x) => x.entities.some((e) => e.id === gg.stPid) && x.entities.every((e) => e.id === p.pid || e.id === gg.stPid));
        await after('voice:grant', (gr) => gr.zone === `bld:house-${p.seat}`);
        await waitFor(() => others.every((o) => gg.pv(o).players.find((x) => x.seat === p.seat)!.connected), 3000, 'reconnect seen');
        reconnected.add(p.seat);
        return true;
      },
      answer: (_g, _p, step) => (step.character === 'imp' ? { seats: [3] } : step.character === 'monk' ? { seats: [4] } : undefined),
    });
    expect([...reconnected].sort()).toEqual([0, 2]);
    expect(g.stView().grimoire.find((e) => e.seat === 3)!.alive).toBe(false);
    await toDay(g, false);
    await g.cmd({ type: 'declare_winner', winner: 'evil', reason: 'Storyteller ruling (test)' }, { until: (v) => v.phase === 'finished' });
    await verifyFinished(g, { winner: 'evil' });
    scanGame(g);
  }, 180_000);
});
