// OWNED BY playtest. Adversarial playtests over the REAL in-process server (game-night readiness):
// voting edge cases, duplicate tabs / refreshes at awkward moments, Storyteller refreshes, ST
// corrections from the panel's command set, rematch + lobby hopping, and malicious clients.
// Harness and secrecy scans: ./playtestHarness.ts.
import type { PlayerGameView, StCommand, StorytellerGameView, WorldTeleport } from '@ct/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sleep, TestClient, waitFor } from '../src/rooms/testkit.js';
import {
  attachBot,
  env,
  execute,
  newGame,
  nominate,
  nomOf,
  runNight,
  scanGame,
  startGame,
  startPlaytestServer,
  stepOf,
  stopPlaytestServer,
  toDay,
  toNight,
  verifyFinished,
  vote,
  VOTE_STEP_MS,
  waitAfter,
  type Game,
  type Player,
} from './playtestHarness.js';

const PORT = 3313; // playtest range 3310-3319

beforeAll(async () => {
  await startPlaytestServer(PORT);
}, 30_000);
afterAll(stopPlaytestServer, 30_000);

// ------------------------------------------------------------------------------------ helpers

/** Run `fn` and expect a player-side error for `type` matching `re`. */
async function expectErr(g: Game, p: Player, type: string, fn: () => unknown, re: RegExp) {
  const i = p.c.of('error').length;
  await fn();
  await g.playerError(p, type, i, re);
}

async function tallied(g: Game, id: string) {
  return waitFor(
    () => {
      const n = nomOf(g.stView().day, id);
      return n && n.status === 'tallied' ? n : undefined;
    },
    g.n * VOTE_STEP_MS + 6000,
    'tally',
  );
}

/** Abrupt network drop, then the client's first recovery path: the Colyseus reconnection token. */
async function refreshWithToken(g: Game, p: Player): Promise<number> {
  const token = p.c.room.reconnectionToken;
  const witness = g.online().find((o) => o !== p)!;
  p.c.drop();
  p.online = false;
  await waitFor(() => g.pv(witness).players.find((x) => x.seat === p.seat)!.connected === false, 3000, 'drop seen');
  const since = p.c.messages.length;
  await p.c.reconnectWithToken(env.srv, token);
  p.online = true;
  attachBot(p);
  await waitFor(() => g.pv(witness).players.find((x) => x.seat === p.seat)!.connected, 3000, 'reconnect seen');
  return since;
}

/** A second tab / device for the same account (fresh ticket). The older tab must be closed with 4102. */
async function secondTab(g: Game, p: Player, intent: 'player' | 'reconnect' = 'reconnect'): Promise<TestClient> {
  const old = p.c;
  const tab = await TestClient.join(env.srv, p.cookie, g.lobbyId, intent, `${p.name}#tab`);
  await waitFor(() => old.closeCode !== null, 3000, 'old tab closed');
  expect(old.closeCode).toBe(4102);
  p.past.push(old);
  p.c = tab;
  attachBot(p);
  return tab;
}

async function stRefresh(g: Game): Promise<StorytellerGameView> {
  g.st.drop();
  g.stPast.push(g.st);
  await sleep(250);
  g.st = await TestClient.join(env.srv, g.stCookie, g.lobbyId, 'reconnect', `${g.prefix}-ST`);
  return (await g.st.waitMsg('game:view', (v) => v.kind === 'storyteller', 5000)) as StorytellerGameView;
}

const queueState = (v: StorytellerGameView) => v.nightQueue.map((s) => `${s.id}:${s.character}:${s.status}`);

// -------------------------------------------------------------------------------------- tests

describe('playtest: adversarial', () => {
  it('voting: closed nominations, threshold, hand changes after the clock, ties, exceeding the block, cancel mid-clock, one execution, dead nominees and ghost votes', async () => {
    const g = await newGame('Vote', 8, 801);
    // 0 imp, 1 poisoner, 2 washerwoman, 3 librarian, 4 investigator, 5 chef, 6 empath, 7 saint
    await startGame(g, ['imp', 'poisoner', 'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'saint']);
    await runNight(g, { answer: (_g, _p, step) => (step.character === 'poisoner' ? { seats: [2] } : undefined) });
    await toDay(g, false);
    const P = (s: number) => g.bySeat(s);

    await expectErr(g, P(2), 'game:nominate', () => g.act(P(2), 'game:nominate', { nomineeSeat: 3 }), /not open/);
    await g.cmd({ type: 'set_nominations_open', open: true }, { until: (v) => v.day?.nominationsOpen === true });

    // Nomination 1: exactly ceil(8/2) = 4 votes puts seat 3 on the block. Duplicate raises are
    // idempotent, a hand lowered before the clock arrives does not count, and a locked hand
    // cannot be changed afterwards.
    const n1 = await nominate(g, P(2), 3);
    expect(nomOf(g.stView().day, n1)!.threshold).toBe(4);
    await g.cmd({ type: 'start_vote', nominationId: n1 }, { until: (v) => nomOf(v.day, n1)?.status === 'voting' });
    for (const s of [4, 5, 0, 1]) P(s).c.send('game:vote', { nominationId: n1, vote: true });
    P(0).c.send('game:vote', { nominationId: n1, vote: true });
    P(6).c.send('game:vote', { nominationId: n1, vote: true });
    P(6).c.send('game:vote', { nominationId: n1, vote: false });
    await g.cmd({ type: 'advance_phase', to: 'bedtime' }, { error: /vote is still running/ });
    await waitFor(() => 4 in nomOf(g.stView().day, n1)!.votes, 3000, 'seat 4 locked');
    await expectErr(g, P(4), 'game:vote', () => P(4).c.send('game:vote', { nominationId: n1, vote: false }), /locked/);
    await expectErr(g, P(4), 'game:vote', () => P(4).c.send('game:vote', { nominationId: n1, vote: true }), /locked/);
    const t1 = await tallied(g, n1);
    expect(t1.votes).toEqual({ 0: true, 1: true, 2: false, 3: false, 4: true, 5: true, 6: false, 7: false });
    expect(t1.voteCount).toBe(4);
    expect(g.stView().day!.onTheBlock).toEqual({ seat: 3, votes: 4 });

    // Nomination 2: the same 4 votes only tie -> nobody is about to be executed.
    const n2 = await nominate(g, P(4), 5);
    expect(nomOf(g.stView().day, n2)!.threshold).toBe(5);
    await vote(g, n2, new Set([0, 1, 2, 6]));
    expect(g.stView().day!.onTheBlock).toBeNull();
    for (const p of g.players) expect(g.pv(p).announcements.some((a) => /a tie\. Nobody/.test(a.text))).toBe(true);

    // Nomination 3: 5 votes exceed the high-water mark -> new block.
    const n3 = await nominate(g, P(6), 1);
    await vote(g, n3, new Set([0, 2, 3, 4, 5]));
    expect(g.stView().day!.onTheBlock).toEqual({ seat: 1, votes: 5 });

    // Nomination 4: the ST cancels mid-clock; the clock stops and the nomination does not count.
    const n4 = await nominate(g, P(0), 2);
    for (const p of g.players) if (p.seat !== 2) p.votePlan.set(n4, true);
    await g.cmd({ type: 'start_vote', nominationId: n4 }, { until: (v) => nomOf(v.day, n4)?.status === 'voting' });
    await waitFor(() => Object.keys(nomOf(g.stView().day, n4)!.votes).length >= 2, 3000, 'two hands locked');
    await g.cmd({ type: 'cancel_nomination', nominationId: n4 }, { until: (v) => nomOf(v.day, n4)?.status === 'cancelled' });
    const frozen = JSON.stringify(nomOf(g.stView().day, n4)!.votes);
    await sleep(3 * VOTE_STEP_MS);
    expect(JSON.stringify(nomOf(g.stView().day, n4)!.votes)).toBe(frozen);
    let sv = g.stView();
    expect(sv.day!.onTheBlock).toEqual({ seat: 1, votes: 5 });
    expect(sv.players.find((x) => x.seat === 0)!.nominatedToday).toBe(false);
    expect(sv.players.find((x) => x.seat === 2)!.wasNominatedToday).toBe(false);
    for (const p of g.players) await waitFor(() => nomOf(g.pv(p).day, n4)?.status === 'cancelled', 3000, 'cancel is public');
    // A player late to the party cannot vote on the cancelled nomination.
    await expectErr(g, P(7), 'game:vote', () => P(7).c.send('game:vote', { nominationId: n4, vote: true }), /No vote in progress/);

    // Nomination limits.
    await expectErr(g, P(7), 'game:nominate', () => g.act(P(7), 'game:nominate', { nomineeSeat: 3 }), /already been nominated/);
    await expectErr(g, P(2), 'game:nominate', () => g.act(P(2), 'game:nominate', { nomineeSeat: 7 }), /already nominated/);

    // One execution per day; nominations close for the day.
    await execute(g, 1);
    await g.cmd({ type: 'execute', seat: 5 }, { error: /one execution/ });
    await g.cmd({ type: 'set_nominations_open', open: true }, { error: /already executed/ });
    await expectErr(g, P(5), 'game:nominate', () => g.act(P(5), 'game:nominate', { nomineeSeat: 0 }), /not open|already been executed/);

    await toNight(g, 'direct');
    await runNight(g, { answer: (_g, _p, step) => (step.character === 'imp' ? { seats: [7] } : undefined) });
    await toDay(g, false);
    await g.cmd({ type: 'set_nominations_open', open: true }, { until: (v) => v.day?.nominationsOpen === true });
    // Dead players cannot nominate, but may be nominated; a ghost vote is spent even on a failed nomination.
    await expectErr(g, P(1), 'game:nominate', () => g.act(P(1), 'game:nominate', { nomineeSeat: 0 }), /Dead players cannot nominate/);
    const n5 = await nominate(g, P(2), 1);
    const t5 = await vote(g, n5, new Set([1]));
    expect(t5.voteCount).toBe(1);
    expect(g.stView().day!.onTheBlock).toBeNull();
    for (const p of g.players) await waitFor(() => g.pv(p).players.find((x) => x.seat === 1)!.ghostVoteAvailable === false, 3000, 'ghost vote spent');
    const n6 = await nominate(g, P(3), 7);
    const t6 = await vote(g, n6, new Set([1, 7]));
    expect(t6.votes[1]).toBe(false); // second ghost vote refused
    expect(t6.votes[7]).toBe(true); // the night-killed Saint's first ghost vote
    // Execute with nobody on the block: the ST records "no execution".
    expect(g.stView().day!.onTheBlock).toBeNull();
    await g.cmd({ type: 'execute', seat: null }, { until: (v) => v.day?.nominationsOpen === false });
    for (const p of g.players) await waitFor(() => g.pv(p).announcements.some((a) => a.text === 'Nobody is executed today.'), 3000, 'no execution');
    sv = g.stView();
    expect(sv.day!.executedSeat).toBeNull();
    await g.cmd({ type: 'declare_winner', winner: 'good', reason: 'Storyteller ruling (test)' }, { until: (v) => v.phase === 'finished' });
    await verifyFinished(g, { winner: 'good' });
    scanGame(g);
  }, 120_000);

  it('duplicate tabs and refreshes: one answer per prompt, votes never lost or doubled, refresh during prompt / vote / execution', async () => {
    const g = await newGame('Tabs', 6, 602);
    // 0 imp, 1 poisoner, 2 fortune teller, 3 chef, 4 empath, 5 butler
    await startGame(g, ['imp', 'poisoner', 'fortune_teller', 'chef', 'empath', 'butler']);
    let ftRace = false;
    let butlerRefresh = false;
    await runNight(g, {
      onPrompted: async (gg, p, step, prompt) => {
        if (step.character === 'fortune_teller') {
          // Old tab answers, then a second tab opens and answers differently: exactly one answer counts.
          const old = p.c;
          old.send('game:promptResponse', { promptId: prompt.id, seats: [0, 1] });
          const tab = await secondTab(gg, p, 'player');
          tab.send('game:promptResponse', { promptId: prompt.id, seats: [3, 4] });
          await waitFor(() => stepOf(gg.stView(), step.id)?.status === 'answered', 3000, 'answered');
          await gg.playerError(p, 'game:promptResponse', 0, /Unknown prompt/);
          await sleep(200);
          expect(stepOf(gg.stView(), step.id)!.response).toEqual({ seats: [0, 1] });
          expect(gg.stView().log.filter((l) => l.text.includes(`(seat ${p.seat + 1}) answered`))).toHaveLength(1);
          ftRace = true;
          return true;
        }
        if (step.character === 'butler') {
          // Refresh while the prompt is open: it is restored and answerable exactly once.
          const since = await refreshWithToken(gg, p);
          const v = (await waitAfter(p.c, since, 'game:view', (x) => x.kind === 'player')) as PlayerGameView;
          expect(v.prompts.map((q) => q.id)).toEqual([prompt.id]);
          expect(v.storytellerVisitingYou).toBe(true);
          await gg.act(p, 'game:promptResponse', { promptId: prompt.id, seats: [0] });
          await waitFor(() => stepOf(gg.stView(), step.id)?.status === 'answered', 3000, 'answered');
          const i = p.c.of('error').length;
          await gg.act(p, 'game:promptResponse', { promptId: prompt.id, seats: [1] });
          await gg.playerError(p, 'game:promptResponse', i, /Unknown prompt/);
          expect(stepOf(gg.stView(), step.id)!.response).toEqual({ seats: [0] });
          butlerRefresh = true;
          return true;
        }
        return false;
      },
    });
    expect([ftRace, butlerRefresh]).toEqual([true, true]);
    // A replayed old promptId after resolution is refused.
    await expectErr(g, g.bySeat(2), 'game:promptResponse', () => g.act(g.bySeat(2), 'game:promptResponse', { promptId: 'q2-1', seats: [0, 1] }), /Unknown prompt/);
    await toDay(g, false);

    // Day 1: chef nominates the empath. Clock: 5, 0, 1, 2, 3, 4.
    await g.cmd({ type: 'set_nominations_open', open: true }, { until: (v) => v.day?.nominationsOpen === true });
    const P = (s: number) => g.bySeat(s);
    const n = await nominate(g, P(3), 4);
    for (const s of [0, 1, 2, 3, 5]) P(s).votePlan.set(n, true);
    await g.cmd({ type: 'start_vote', nominationId: n }, { until: (v) => nomOf(v.day, n)?.status === 'voting' });
    await waitFor(() => nomOf(g.pv(P(3)).day, n)?.handsRaised?.includes(3), 3000, 'chef hand raised');
    // The chef refreshes mid-vote: the raised hand survives and is not sent twice.
    const since = await refreshWithToken(g, P(3));
    const v = (await waitAfter(P(3).c, since, 'game:view', (x) => x.kind === 'player')) as PlayerGameView;
    const nv = nomOf(v.day, n)!;
    expect(nv.handsRaised?.includes(3) || nv.votes[3] === true).toBe(true);
    // The fortune teller opens yet another tab mid-vote and both tabs vote: still one vote.
    const oldTab = P(2).c;
    oldTab.send('game:vote', { nominationId: n, vote: true });
    const tab = await secondTab(g, P(2));
    tab.send('game:vote', { nominationId: n, vote: true });
    const t = await tallied(g, n);
    expect(t.votes).toEqual({ 0: true, 1: true, 2: true, 3: true, 4: false, 5: true });
    expect(t.voteCount).toBe(5);
    expect(g.stView().day!.onTheBlock).toEqual({ seat: 4, votes: 5 });

    // The nominee drops right as the ST executes, then returns with a fresh ticket.
    P(4).c.drop();
    P(4).past.push(P(4).c);
    P(4).online = false;
    await g.cmd({ type: 'execute', seat: 4 }, { until: (x) => x.day?.executedSeat === 4 });
    P(4).c = await TestClient.join(env.srv, P(4).cookie, g.lobbyId, 'reconnect', P(4).name);
    P(4).online = true;
    attachBot(P(4));
    const back = (await P(4).c.waitMsg('game:view', (x) => x.kind === 'player', 5000)) as PlayerGameView;
    expect(back.you.alive).toBe(false);
    expect(back.day!.executedSeat).toBe(4);
    expect(back.you.ghostVoteAvailable).toBe(true);
    expect(back.announcements.some((a) => a.text === `${P(4).name} has been executed and is dead.`)).toBe(true);
    await g.cmd({ type: 'declare_winner', winner: 'evil', reason: 'Storyteller ruling (test)' }, { until: (x) => x.phase === 'finished' });
    await verifyFinished(g, { winner: 'evil' });
    scanGame(g);
  }, 120_000);

  it('Storyteller refreshes during setup, mid-night (while visiting, a prompt answered meanwhile) and mid-vote; everything is restored', async () => {
    const g = await newGame('Refr', 7, 703);
    let setupChecks = 0;
    await startGame(g, ['imp', 'poisoner', 'monk', 'chef', 'empath', 'fortune_teller', 'washerwoman'], {
      beforeAssign: async () => {
        const v = await stRefresh(g);
        expect(v.phase).toBe('setup');
        expect(v.charactersAssigned).toBe(false);
        setupChecks++;
      },
      beforeFirstNight: async () => {
        const before = g.stView();
        const v = await stRefresh(g);
        expect(v.grimoire).toEqual(before.grimoire);
        expect(v.demonBluffs).toEqual(before.demonBluffs);
        expect(v.charactersAssigned).toBe(true);
        setupChecks++;
      },
    });
    expect(setupChecks).toBe(2);

    let midNight = false;
    await runNight(g, {
      onPrompted: async (gg, p, step, prompt) => {
        if (step.character !== 'poisoner') return false;
        const before = gg.stView();
        expect(before.visitingSeat).toBe(p.seat);
        gg.st.drop();
        gg.stPast.push(gg.st);
        // The player answers while the Storyteller is away.
        await gg.act(p, 'game:promptResponse', { promptId: prompt.id, seats: [3] });
        await waitFor(() => !gg.pv(p).prompts.length, 3000, 'prompt consumed');
        gg.st = await TestClient.join(env.srv, gg.stCookie, gg.lobbyId, 'reconnect', `${gg.prefix}-ST`);
        const v = (await gg.st.waitMsg('game:view', (x) => x.kind === 'storyteller', 5000)) as StorytellerGameView;
        expect(v.phase).toBe('first_night');
        expect(v.visitingSeat).toBe(p.seat);
        // (gameplay) the grimoire's open-prompt list legitimately changed: the prompt was answered.
        const noPrompts = (gr: typeof v.grimoire) => gr.map(({ openPrompts: _o, sentPrompts: _s, ...rest }) => rest);
        expect(noPrompts(v.grimoire)).toEqual(noPrompts(before.grimoire));
        expect(queueState(v)).toEqual(queueState(before).map((s) => (s.startsWith(`${step.id}:`) ? `${step.id}:poisoner:answered` : s)));
        expect(stepOf(v, step.id)!.response).toEqual({ seats: [3] });
        expect(gg.pv(p).storytellerVisitingYou).toBe(true);
        midNight = true;
        return false; // the visit window must stay clean for everyone else, even across the ST refresh
      },
    });
    expect(midNight).toBe(true);
    expect(g.stView().grimoire.find((e) => e.seat === 3)!.poisoned).toBe(true);
    await toDay(g, false);

    await g.cmd({ type: 'set_nominations_open', open: true }, { until: (v) => v.day?.nominationsOpen === true });
    const n = await nominate(g, g.bySeat(3), 4);
    for (const s of [0, 1, 2, 3, 5, 6]) g.bySeat(s).votePlan.set(n, true);
    await g.cmd({ type: 'start_vote', nominationId: n }, { until: (v) => nomOf(v.day, n)?.status === 'voting' });
    g.st.drop();
    g.stPast.push(g.st);
    // The clock keeps running without the Storyteller.
    await waitFor(() => nomOf(g.pv(g.bySeat(0)).day, n)?.status === 'tallied', g.n * VOTE_STEP_MS + 5000, 'tally without ST');
    g.st = await TestClient.join(env.srv, g.stCookie, g.lobbyId, 'reconnect', `${g.prefix}-ST`);
    const v = (await g.st.waitMsg('game:view', (x) => x.kind === 'storyteller', 5000)) as StorytellerGameView;
    expect(nomOf(v.day, n)).toMatchObject({ status: 'tallied', voteCount: 6 });
    expect(v.day!.onTheBlock).toEqual({ seat: 4, votes: 6 });
    await execute(g, 4);
    await toNight(g, 'bedtime');
    await runNight(g);
    await toDay(g, true);
    await g.cmd({ type: 'declare_winner', winner: 'good', reason: 'Storyteller ruling (test)' }, { until: (x) => x.phase === 'finished' });
    await verifyFinished(g, { winner: 'good' });
    scanGame(g);
  }, 120_000);

  it('Storyteller corrections without a console: skip, re-send info, fix a wrong Drunk, alignment change + undo, wrong execution + undo, wrong kill + undo, revive, manual winner', async () => {
    const g = await newGame('Fix', 7, 704);
    // 0 imp, 1 poisoner, 2 drunk (thinks a Townsfolk), 3 chef, 4 empath, 5 washerwoman, 6 monk
    await startGame(g, ['imp', 'poisoner', 'drunk', 'chef', 'empath', 'washerwoman', 'monk']);
    const P = (s: number) => g.bySeat(s);
    const drunkBelieves = g.initial.get(2)!.believed;
    expect(g.pv(P(2)).you.role!.character).toBe(drunkBelieves);

    // Skip a prompted step: the open prompt disappears from the player's HUD.
    const step = (c: string) => g.stView().nightQueue.find((s) => s.character === c && s.status !== 'resolved' && s.status !== 'skipped')!;
    const pois = step('poisoner');
    await g.cmd({ type: 'visit_home', seat: 1 }, { until: (v) => v.visitingSeat === 1 });
    await g.cmd({ type: 'prompt_player', seat: 1, prompt: pois.prompt! }, { until: (v) => stepOf(v, pois.id)?.status === 'prompted' });
    await waitFor(() => g.pv(P(1)).prompts.length === 1, 3000, 'poisoner prompt');
    await g.cmd({ type: 'skip_step', stepId: pois.id }, { until: (v) => stepOf(v, pois.id)?.status === 'skipped' });
    await waitFor(() => g.pv(P(1)).prompts.length === 0, 3000, 'prompt withdrawn');
    await g.cmd({ type: 'leave_home' }, { until: (v) => v.visitingSeat === null });
    // Skip a pending step too.
    const emp = step('empath');
    await g.cmd({ type: 'skip_step', stepId: emp.id }, { until: (v) => stepOf(v, emp.id)?.status === 'skipped' });
    await runNight(g);
    expect(g.pv(P(4)).info).toEqual([]);
    await toDay(g, false);

    // Re-send (corrected) information to the chef.
    const chefInfo = g.pv(P(3)).info.length;
    const others = new Map(g.players.map((p) => [p.seat, g.pv(p).info.length]));
    await g.cmd({ type: 'send_info', seat: 3, info: { text: 'Correction: 1 pair of evil players sit next to each other.', number: 1 } });
    await waitFor(() => g.pv(P(3)).info.length === chefInfo + 1, 3000, 'corrected info');
    expect(g.pv(P(3)).info.at(-1)).toMatchObject({ text: 'Correction: 1 pair of evil players sit next to each other.', number: 1 });
    for (const p of g.players) if (p.seat !== 3) expect(g.pv(p).info.length).toBe(others.get(p.seat));

    // The Drunk was assigned by mistake: make them the Townsfolk they believe they are.
    await g.cmd({ type: 'change_character', seat: 2, character: drunkBelieves, notify: true }, { until: (v) => v.grimoire[2]!.character === drunkBelieves });
    expect(g.stView().grimoire[2]).toMatchObject({ character: drunkBelieves, believedCharacter: drunkBelieves, drunk: false, alignment: 'good' });
    await waitFor(() => /You are now the/.test(g.pv(P(2)).info.at(-1)?.text ?? ''), 3000, 'drunk told');
    expect(g.pv(P(2)).you.role!.character).toBe(drunkBelieves);

    // Alignment change, then undo: the HUD returns to the corrected state.
    g.relaxedRoles.add(3);
    await g.cmd({ type: 'change_character', seat: 3, character: 'chef', alignment: 'evil', notify: true }, { until: (v) => v.grimoire[3]!.alignment === 'evil' });
    await waitFor(() => g.pv(P(3)).you.role?.alignment === 'evil', 3000, 'evil chef');
    const infoAfterChange = g.pv(P(3)).info.length;
    await g.cmd({ type: 'undo_last' }, { until: (v) => v.grimoire[3]!.alignment === 'good' });
    await waitFor(() => g.pv(P(3)).you.role?.alignment === 'good', 3000, 'chef good again');
    expect(g.pv(P(3)).info.length).toBe(infoAfterChange - 1);

    // Wrong execution, then undo: alive again for everyone, the block is back.
    await g.cmd({ type: 'set_nominations_open', open: true }, { until: (v) => v.day?.nominationsOpen === true });
    const n = await nominate(g, P(4), 5);
    await vote(g, n, new Set([0, 1, 2, 3, 4, 6]));
    await execute(g, 5);
    expect(g.stView().canUndo).toBe(true);
    await g.cmd({ type: 'undo_last' }, { until: (v) => v.grimoire[5]!.alive && v.day?.executedSeat === null });
    for (const p of g.players) await waitFor(() => g.pv(p).players[5]!.alive && g.pv(p).day?.executedSeat === null, 3000, 'execution undone');
    expect(g.stView().day!.onTheBlock).toEqual({ seat: 5, votes: 6 });
    expect(g.pv(P(5)).you).toMatchObject({ alive: true, ghostVoteAvailable: true });

    // Wrong kill, then undo; then a kill and a revive.
    await g.cmd({ type: 'kill', seat: 6, announce: true }, { until: (v) => !v.grimoire[6]!.alive });
    for (const p of g.players) await waitFor(() => !g.pv(p).players[6]!.alive, 3000, 'kill public');
    await g.cmd({ type: 'undo_last' }, { until: (v) => v.grimoire[6]!.alive });
    for (const p of g.players) await waitFor(() => g.pv(p).players[6]!.alive, 3000, 'kill undone');
    await g.cmd({ type: 'kill', seat: 6, announce: true }, { until: (v) => !v.grimoire[6]!.alive });
    await g.cmd({ type: 'set_alive', seat: 6, alive: true }, { until: (v) => v.grimoire[6]!.alive });
    for (const p of g.players) {
      await waitFor(() => g.pv(p).players[6]!.alive, 3000, 'revived');
      expect(g.pv(p).announcements.some((a) => a.text === `${P(6).name} has returned to life.`)).toBe(true);
    }
    // Ids are never reused after an undo (a stale answer can never hit a new prompt).
    const ids = g.pv(P(3)).info.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);

    await execute(g, 5);
    await g.cmd({ type: 'declare_winner', winner: 'good', reason: 'The Storyteller ruled the Recluse registered as the Demon (test).' }, { until: (v) => v.phase === 'finished' });
    await verifyFinished(g, { winner: 'good', reason: /Storyteller ruled/ });
    scanGame(g);
  }, 120_000);

  it('rematch fully resets the game; a player leaving lobby A mid-game joins lobby B with no carried state', async () => {
    const g = await newGame('Again', 5, 505);
    await startGame(g, ['imp', 'poisoner', 'chef', 'empath', 'washerwoman']);
    // Game 1 ends abruptly: ST visiting, an open prompt, secret info delivered.
    await g.cmd({ type: 'send_info', seat: 3, info: { text: 'G1-SECRET info for the empath' } });
    const pois = g.stView().nightQueue.find((s) => s.character === 'poisoner')!;
    await g.cmd({ type: 'visit_home', seat: 1 }, { until: (v) => v.visitingSeat === 1 });
    await g.cmd({ type: 'prompt_player', seat: 1, prompt: { ...pois.prompt!, title: 'G1-PROMPT' } }, { until: (v) => stepOf(v, pois.id)?.status === 'prompted' });
    await waitFor(() => g.pv(g.bySeat(1)).prompts.length === 1, 3000, 'g1 prompt');
    await g.cmd({ type: 'declare_winner', winner: 'evil', reason: 'Game 1 (test)' }, { until: (v) => v.phase === 'finished' });
    await verifyFinished(g, { winner: 'evil' });
    expect(g.stView().visitingSeat).toBeNull();
    scanGame(g);

    // Rematch.
    const since = new Map(g.players.map((p) => [p, p.c.messages.length]));
    const stSince = g.st.messages.length;
    g.st.send('lobby:start', {});
    await g.st.view((lv) => lv.lobby.phase === 'waiting', 5000);
    for (const p of g.players) {
      await p.c.view((lv) => lv.lobby.phase === 'waiting', 5000);
      const tp = (await waitAfter(p.c, since.get(p)!, 'world:teleport', (t: WorldTeleport) => t.reason === 'spawn')) as WorldTeleport;
      expect(tp.location.startsWith('bld:house-')).toBe(false);
      const gr = await waitAfter(p.c, since.get(p)!, 'voice:grant', (x) => x.purpose === 'zone');
      expect(gr.zone.startsWith('bld:house-')).toBe(false);
    }
    for (const p of g.players) p.c.send('lobby:ready', { ready: true });
    await g.st.view((lv) => lv.canStart, 5000);
    g.matchIndex = 1;
    g.joined = g.players.map((p) => ({ name: p.name, cookie: p.cookie, accountId: p.accountId, c: p.c }));
    g.players.splice(0);
    g.initial.clear();
    await startGame(g);
    for (const p of g.players) {
      const first = (await waitAfter(p.c, p.since!, 'game:view', (x) => x.kind === 'player')) as PlayerGameView;
      expect(first).toMatchObject({ phase: 'setup', dayNumber: 0, info: [], prompts: [], announcements: [], result: null, storytellerVisitingYou: false, day: null });
      expect(first.you).toMatchObject({ role: null, alive: true, ghostVoteAvailable: true, evilTeam: null });
      expect(first.players.every((x) => x.alive && x.ghostVoteAvailable && !x.nominatedToday)).toBe(true);
      for (const m of p.c.messages.slice(p.since!)) expect(JSON.stringify(m.payload)).not.toMatch(/G1-SECRET|G1-PROMPT|Game 1 \(test\)/);
    }
    const st2 = (await waitAfter(g.st, stSince, 'game:view', (x) => x.kind === 'storyteller' && x.phase === 'setup')) as StorytellerGameView;
    expect(st2).toMatchObject({ alerts: [], nightQueue: [], visitingSeat: null, result: null, announcements: [], dayNumber: 0 });
    expect(st2.log.some((l) => /Game over|G1-/.test(l.text))).toBe(false);
    expect(g.stView().phase).toBe('first_night');

    // Seat 4 walks out of lobby A mid-game and joins lobby B.
    const leaver = g.bySeat(4);
    leaver.c.send('lobby:leave', {});
    await leaver.c.leave(true);
    leaver.online = false;
    await waitFor(() => g.pv(g.bySeat(0)).players.find((x) => x.seat === 4)!.connected === false, 3000, 'leaver gone');
    const B = await newGame('Bee', 5, 506, {}, [{ name: leaver.name, cookie: leaver.cookie, accountId: leaver.accountId }]);
    await startGame(B);
    const inB = B.players.find((p) => p.accountId === leaver.accountId)!;
    for (const m of inB.c.messages) {
      const json = JSON.stringify(m.payload);
      expect(json).not.toContain(g.lobbyId);
      for (const p of g.players) expect(json).not.toContain(p.pid);
    }
    expect(inB.pid).not.toBe(leaver.pid);
    await B.cmd({ type: 'declare_winner', winner: 'good', reason: 'Lobby B (test)' }, { until: (v) => v.phase === 'finished' });
    await verifyFinished(B, { winner: 'good' });
    // Lobby A carries on without the leaver.
    await g.cmd({ type: 'declare_winner', winner: 'good', reason: 'Game 2 (test)' }, { until: (v) => v.phase === 'finished' });
    await verifyFinished(g, { winner: 'good' });
    scanGame(g);
    scanGame(B);
  }, 120_000);

  it('malicious clients: non-ST st:commands, other seats’ prompts, teleports, invalid/huge payloads, replays — all rejected, the room keeps working', async () => {
    const g = await newGame('Evil', 5, 507);
    await startGame(g, ['imp', 'poisoner', 'chef', 'empath', 'washerwoman']);
    const pois = g.stView().nightQueue.find((s) => s.character === 'poisoner')!;
    await g.cmd({ type: 'visit_home', seat: 1 }, { until: (v) => v.visitingSeat === 1 });
    await g.cmd({ type: 'prompt_player', seat: 1, prompt: pois.prompt! }, { until: (v) => stepOf(v, pois.id)?.status === 'prompted' });
    const prompt = await waitFor(() => g.pv(g.bySeat(1)).prompts[0], 3000, 'prompt');
    const mal = g.bySeat(2);
    const before = JSON.stringify({ ...g.stView(), players: undefined, log: undefined });

    const every: StCommand[] = [
      { type: 'random_setup' },
      { type: 'assign_characters', assignments: [0, 1, 2, 3, 4].map((seat) => ({ seat, character: 'chef' as const })), demonBluffs: [] },
      { type: 'begin_first_night' },
      { type: 'advance_phase', to: 'day' },
      { type: 'set_bedtime_seconds', seconds: 10 },
      { type: 'set_nominations_open', open: true },
      { type: 'start_vote', nominationId: 'd1-nom1' },
      { type: 'cancel_nomination', nominationId: 'd1-nom1' },
      { type: 'execute', seat: 0 },
      { type: 'kill', seat: 0, announce: true },
      { type: 'set_alive', seat: 0, alive: false },
      { type: 'set_status', seat: 0, poisoned: true },
      { type: 'set_ghost_vote', seat: 0, available: false },
      { type: 'change_character', seat: 2, character: 'imp', notify: true },
      { type: 'add_reminder', seat: 0, token: 'x' },
      { type: 'remove_reminder', seat: 0, token: 'x' },
      { type: 'prompt_player', seat: 0, prompt: { kind: 'yes_no', title: 'Are you the Imp?' } },
      { type: 'send_info', seat: 0, info: { text: 'fake' } },
      { type: 'resolve_step', stepId: pois.id },
      { type: 'skip_step', stepId: pois.id },
      { type: 'visit_home', seat: 0 },
      { type: 'leave_home' },
      { type: 'announce', text: 'I am the storyteller now' },
      { type: 'set_travel_speed', mult: 4 },
      { type: 'declare_winner', winner: 'good', reason: 'hacked' },
      { type: 'undo_last' },
    ];
    const errIdx = mal.c.of('error').length;
    for (const cmd of every) {
      await mal.bucket.take();
      mal.c.send('st:command', cmd);
    }
    await waitFor(() => mal.c.of('error').slice(errIdx).some((e) => e.for === 'st:command' && e.code === 'forbidden'), 3000, 'forbidden');
    // Another player's prompt, replays and out-of-phase actions.
    await sleep(1500); // let the error budget refill so the rejections below are observable
    await expectErr(g, mal, 'game:promptResponse', () => g.act(mal, 'game:promptResponse', { promptId: prompt.id, seats: [0] }), /Unknown prompt/);
    await expectErr(g, mal, 'game:nominate', () => g.act(mal, 'game:nominate', { nomineeSeat: 0 }), /Only during the day/);
    await expectErr(g, mal, 'game:vote', () => g.act(mal, 'game:vote', { nominationId: 'd1-nom1', vote: true }), /Only during the day/);
    await expectErr(g, mal, 'game:slayerShot', () => g.act(mal, 'game:slayerShot', { targetSeat: 0 }), /Only during the day/);
    await sleep(1200);
    // Invalid / oversized payloads.
    const junk: [string, unknown][] = [
      ['game:nominate', { nomineeSeat: 'x' }],
      ['game:nominate', { nomineeSeat: 99 }],
      ['game:vote', {}],
      ['st:command', { type: 'nope' }],
      ['chat:send', { text: 'x'.repeat(1000) }],
      ['hack:me', { a: 1 }],
      ['game:promptResponse', null],
      ['game:promptResponse', [1, 2, 3]],
      ['game:promptResponse', { promptId: prompt.id, seats: Array.from({ length: 200 }, (_, i) => i) }],
      ['move', { seq: -1, x: 0, y: 0, facing: 'down', moving: false }],
      ['lobby:start', { extra: true }],
      ['ping', { deep: JSON.parse('['.repeat(100) + ']'.repeat(100)) }],
    ];
    for (const [type, payload] of junk) {
      await mal.bucket.take();
      mal.c.sendRaw(type, payload);
    }
    // Teleport / speed hack: a jump of 400px is refused with a correction.
    const pos = mal.c.last('world:snapshot')!.entities.find((e) => e.id === mal.pid)!;
    const tpIdx = mal.c.messages.length;
    await mal.bucket.take();
    mal.c.send('move', { seq: 1_000_000, x: pos.x + 400, y: pos.y, facing: 'right', moving: true });
    await waitAfter(mal.c, tpIdx, 'world:teleport', (t) => t.reason === 'correction');
    await sleep(300);
    const now = mal.c.last('world:snapshot')!.entities.find((e) => e.id === mal.pid)!;
    expect({ x: now.x, y: now.y }).toEqual({ x: pos.x, y: pos.y });

    expect(mal.c.closeCode).toBeNull();
    // Oversized frames (> 4 KB, the transport's cap) drop only the sender's socket; they come back.
    mal.c.sendRaw('chat:send', { text: 'y'.repeat(300_000) });
    await waitFor(() => mal.c.closeCode !== null, 3000, 'oversized frame closes the socket');
    mal.past.push(mal.c);
    mal.c = await TestClient.join(env.srv, mal.cookie, g.lobbyId, 'reconnect', mal.name);
    attachBot(mal);
    await mal.c.waitMsg('game:view', (v) => v.kind === 'player', 5000);
    // Nothing changed, nobody else saw anything, the room still works.
    expect(JSON.stringify({ ...g.stView(), players: undefined, log: undefined })).toBe(before);
    for (const p of g.players) expect(g.pv(p).announcements.some((a) => /storyteller now/.test(a.text))).toBe(false);
    await g.act(g.bySeat(1), 'game:promptResponse', { promptId: prompt.id, seats: [3] });
    await waitFor(() => stepOf(g.stView(), pois.id)?.status === 'answered', 3000, 'legit answer');
    await g.cmd({ type: 'resolve_step', stepId: pois.id }, { until: (v) => stepOf(v, pois.id)?.status === 'resolved' });
    await g.cmd({ type: 'leave_home' }, { until: (v) => v.visitingSeat === null });
    await runNight(g);
    await toDay(g, false);
    await g.cmd({ type: 'declare_winner', winner: 'good', reason: 'Storyteller ruling (test)' }, { until: (v) => v.phase === 'finished' });
    await verifyFinished(g, { winner: 'good' });
    scanGame(g);
  }, 120_000);
});

