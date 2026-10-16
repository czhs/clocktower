// OWNED BY auto-st. The town clock: DayClock / bedtime mirror units, extension proposals (pass / fail /
// limits / rate limits) through the automatic game, and the human Storyteller's 'day_clock' prop.
import type { CharacterId, PlayerGameView, StCommand, StorytellerGameView } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { BedtimeMirror, DayClock, ExtensionBallot, EXTENSION_RULES } from '../src/auto/index.js';
import { createGameModule } from '../src/game/index.js';
import { recorderOf } from '../src/records/index.js';
import { autoRig, type AutoRig } from './autoHarness.js';
import { createFakeHost } from './helpers/fakeHost.js';

describe('DayClock', () => {
  it('set / pause / resume / add / cap / clear', () => {
    const c = new DayClock();
    expect(c.view()).toBeNull();
    c.set('discussion', 60_000, 1000);
    expect(c.view()).toEqual({ stage: 'discussion', endsAt: 61_000, remainingMs: null, paused: false, totalMs: 60_000 });
    expect(c.pause(31_000)).toBe(true);
    expect(c.view()).toEqual({ stage: 'discussion', endsAt: null, remainingMs: 30_000, paused: true, totalMs: 60_000 });
    expect(c.pause(40_000)).toBe(false);
    expect(c.expired(999_999)).toBe(false); // paused never expires
    expect(c.resume(50_000)).toBe(true);
    expect(c.view()!.endsAt).toBe(80_000);
    c.add(120_000, 50_000);
    expect(c.view()!.endsAt).toBe(200_000);
    expect(c.view()!.totalMs).toBe(180_000);
    expect(c.expired(199_999)).toBe(false);
    expect(c.expired(200_000)).toBe(true);
    c.add(10_000, 300_000); // an expired clock restarts from now
    expect(c.view()!.endsAt).toBe(310_000);
    expect(c.capRemaining(5_000, 300_000)).toBe(true);
    expect(c.remaining(300_000)).toBe(5_000);
    c.clear();
    expect(c.view()).toBeNull();
    expect(c.add(1, 1)).toBe(false);
  });

  it('bedtime mirror: running, held, overtime; the dial total is stable between ticks', () => {
    const m = new BedtimeMirror();
    const s = { phase: 'bedtime', bedtimeSeconds: 45, phaseEndsAt: 100_000, bedtimePausedRemainingMs: null, bedtimeOvertime: false } as never;
    const a = m.view(s, 60_000);
    const b = m.view(s, 70_000);
    expect(a).toEqual({ stage: 'bedtime', endsAt: 100_000, remainingMs: null, paused: false, totalMs: 45_000 });
    expect(b).toEqual(a);
    Object.assign(s, { phaseEndsAt: null, bedtimePausedRemainingMs: 20_000 });
    expect(m.view(s, 80_000)).toEqual({ stage: 'bedtime', endsAt: null, remainingMs: 20_000, paused: true, totalMs: 45_000 });
    Object.assign(s, { phaseEndsAt: 180_000, bedtimePausedRemainingMs: null }); // extended to 100 s
    expect(m.view(s, 80_000)!.totalMs).toBe(100_000);
    Object.assign(s, { phaseEndsAt: null, bedtimeOvertime: true });
    expect(m.view(s, 200_000)).toEqual({ stage: 'bedtime', endsAt: null, remainingMs: 0, paused: false, totalMs: 100_000 });
    Object.assign(s, { phase: 'night' });
    expect(m.view(s, 200_000)).toBeNull();
  });
});

describe('ExtensionBallot (the rule)', () => {
  const voters = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

  it('passes at once with a strict majority of eligible voters; fails at once when half say no', () => {
    const b = new ExtensionBallot();
    b.resetDay(1);
    expect(b.propose('p0', 3, 0)).toBeNull();
    const id = b.proposal!.id;
    expect(b.view(voters(7))).toMatchObject({ by: 'p0', minutes: 3, yes: ['p0'], no: [], needed: 4, closesAt: 30_000 });
    b.vote('p1', id, true);
    b.vote('p2', id, true);
    expect(b.evaluate(1000, voters(7))).toBeNull();
    b.vote('p3', id, true);
    expect(b.evaluate(1000, voters(7))).toMatchObject({ outcome: 'passed', yes: 4, no: 0, eligible: 7 });
    expect(b.addedToday).toBe(3);
    expect(b.proposal).toBeNull();

    expect(b.propose('p1', 2, 2000)).toBeNull();
    const id2 = b.proposal!.id;
    expect(id2).not.toBe(id);
    for (const p of ['p2', 'p3', 'p4']) b.vote(p, id2, false);
    expect(b.evaluate(2000, voters(7))).toBeNull(); // 3 no of 7: could still pass
    b.vote('p5', id2, false);
    expect(b.evaluate(2000, voters(7))).toMatchObject({ outcome: 'failed', yes: 1, no: 4 });
    expect(b.addedToday).toBe(3);
  });

  it('after 30 s: decided on the votes cast (quorum = half of the eligible voters; yes > no; ties fail)', () => {
    const run = (yes: number, no: number, eligible: number) => {
      const b = new ExtensionBallot();
      b.resetDay(1);
      b.propose('p0', 1, 0); // proposer = 1 yes
      const id = b.proposal!.id;
      for (let i = 1; i < yes; i++) b.vote(`p${i}`, id, true);
      for (let i = 0; i < no; i++) b.vote(`p${100 + i}`, id, false);
      const connected = [...voters(eligible - no), ...Array.from({ length: no }, (_, i) => `p${100 + i}`)];
      expect(b.evaluate(29_999, connected)).toBeNull();
      return b.evaluate(30_000, connected)!.outcome;
    };
    expect(run(3, 2, 10)).toBe('passed'); // 5 of 10 voted, 3 > 2
    expect(run(2, 1, 10)).toBe('failed'); // only 3 of 10 voted
    expect(run(2, 2, 8)).toBe('failed'); // tie
    expect(run(4, 3, 14)).toBe('passed');
  });

  it('a vote can be changed; a stale id is refused; one open proposal at a time', () => {
    const b = new ExtensionBallot();
    b.resetDay(1);
    b.propose('p0', 2, 0);
    const id = b.proposal!.id;
    expect(b.vote('p1', id, false)).toBeNull();
    expect(b.vote('p1', id, true)).toBeNull();
    expect(b.view(voters(5))).toMatchObject({ yes: ['p0', 'p1'], no: [] });
    expect(b.vote('p2', 'x1-99', true)).toMatch(/closed/);
    expect(b.propose('p3', 1, 10)).toMatchObject({ code: 'invalid', message: expect.stringMatching(/already open/) });
  });

  it('limits: 1 proposal per player per 60 s, 3 per player per day, +20 min per day', () => {
    const b = new ExtensionBallot();
    b.resetDay(1);
    expect(b.propose('p0', 1, 0)).toBeNull();
    b.cancel();
    expect(b.propose('p0', 1, 59_000)).toMatchObject({ code: 'rate_limited', message: expect.stringMatching(/Wait 1 s/) });
    expect(b.propose('p0', 1, 60_000)).toBeNull();
    b.cancel();
    expect(b.propose('p0', 1, 120_000)).toBeNull();
    b.cancel();
    expect(b.propose('p0', 1, 999_000)).toMatchObject({ code: 'rate_limited', message: expect.stringMatching(/at most 3/) });
    // town-wide cap
    const t = new ExtensionBallot();
    t.resetDay(2);
    let at = 0;
    for (const [pid, m] of [['a', 10], ['b', 10]] as const) {
      expect(t.propose(pid, m, (at += 1000))).toBeNull();
      t.vote('x', t.proposal!.id, true);
      expect(t.evaluate(at, ['a', 'b', 'x'])!.outcome).toBe('passed');
    }
    expect(t.addedToday).toBe(EXTENSION_RULES.maxMinutesPerDay);
    expect(t.propose('c', 1, (at += 1000))).toMatchObject({ code: 'invalid', message: expect.stringMatching(/already been extended by 20/) });
    const u = new ExtensionBallot();
    u.resetDay(3);
    u.propose('a', 10, 0);
    u.vote('x', u.proposal!.id, true);
    u.evaluate(0, ['a', 'x']);
    u.propose('b', 8, 1);
    u.vote('x', u.proposal!.id, true);
    u.evaluate(1, ['b', 'x']);
    expect(u.propose('c', 3, 2)).toMatchObject({ message: 'At most 2 more minutes can be added today' });
    // a new day resets everything
    u.resetDay(4);
    expect(u.propose('a', 10, 3)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Through the automatic game module

function toStage(rig: AutoRig, stage: 'discussion' | 'nominations') {
  for (let i = 0; i < 5000; i++) {
    const c = rig.view(0).clock;
    if (rig.game.phase() === 'day' && c?.stage === stage) return c;
    rig.step(100);
  }
  throw new Error(`never reached ${stage}`);
}

describe('extension proposals in an automatic game', () => {
  it('propose -> public proposal -> majority yes -> the stage is extended; announcements + record', () => {
    const rig = autoRig(7, { seed: 11, auto: { discussionMs: 60_000, extensionMinuteMs: 60_000 } });
    const c0 = toStage(rig, 'discussion');
    rig.game.handleClock('p2', 'clock:propose', { minutes: 3 });
    const v = rig.view(5).clock!;
    expect(v.proposal).toMatchObject({ by: 'p2', minutes: 3, yes: ['p2'], no: [], needed: 4 });
    // identical for everyone
    for (let i = 0; i < 7; i++) expect(rig.view(i).clock).toEqual(v);
    const id = v.proposal!.id;
    rig.game.handleClock('p3', 'clock:vote', { id, yes: true });
    rig.game.handleClock('p4', 'clock:vote', { id, yes: false });
    rig.game.handleClock('p5', 'clock:vote', { id, yes: true });
    expect(rig.view(0).clock!.proposal).toMatchObject({ yes: ['p2', 'p3', 'p5'], no: ['p4'] });
    rig.game.handleClock('p6', 'clock:vote', { id, yes: true });
    const after = rig.view(0).clock!;
    expect(after.proposal).toBeNull();
    expect(after.endsAt).toBe(c0.endsAt! + 180_000);
    expect(after.totalMs).toBe(c0.totalMs + 180_000);
    const ann = rig.view(1).announcements.map((a) => a.text);
    expect(ann.some((t) => /proposes adding 3 minutes/.test(t))).toBe(true);
    expect(ann.some((t) => /votes to extend the clock by 3 minutes \(4 yes, 1 no of 7\)/.test(t))).toBe(true);
    const tl = recorderOf(rig.game)!.timeline;
    expect(tl.some((e) => e.data.outcome === 'passed' && e.data.minutes === 3 && e.text.startsWith('The town clock'))).toBe(true);
  });

  it('fails with half no; the clock is unchanged; a stage that ends waits for the open proposal', () => {
    const rig = autoRig(6, { seed: 12, auto: { discussionMs: 5_000 } });
    const c0 = toStage(rig, 'discussion');
    rig.game.handleClock('p0', 'clock:propose', { minutes: 2 });
    const id = rig.view(0).clock!.proposal!.id;
    for (const p of ['p1', 'p2', 'p3']) rig.game.handleClock(p, 'clock:vote', { id, yes: false });
    expect(rig.view(0).clock!.proposal).toBeNull();
    expect(rig.view(0).clock!.endsAt).toBe(c0.endsAt);
    // a last-second proposal holds the stage end until it is decided (≤ 30 s)
    while (rig.host.clock.now < c0.endsAt! - 200) rig.step(100);
    rig.game.handleClock('p4', 'clock:propose', { minutes: 1 });
    for (let i = 0; i < 20; i++) rig.step(100); // stage time is over
    expect(rig.view(0).clock!.stage).toBe('discussion');
    expect(rig.view(0).clock!.proposal).not.toBeNull();
    for (let i = 0; i < 300; i++) rig.step(100); // the 30 s window closes: too few votes -> failed
    expect(rig.view(0).clock!.stage).toBe('nominations');
    expect(rig.view(0).day!.nominationsOpen).toBe(true);
  });

  it('refusals: rate limit, wrong stage, unseated, human games, bad ids', () => {
    const rig = autoRig(5, { seed: 13, auto: { discussionMs: 600_000 } });
    // before the day: no clock to extend
    rig.game.handleClock('p1', 'clock:propose', { minutes: 2 });
    expect(rig.errors(1).at(-1)).toMatchObject({ code: 'phase', for: 'clock:propose' });
    toStage(rig, 'discussion');
    rig.game.handleClock('p1', 'clock:propose', { minutes: 2 });
    const id = rig.view(0).clock!.proposal!.id;
    for (const p of ['p2', 'p3']) rig.game.handleClock(p, 'clock:vote', { id, yes: true });
    expect(rig.view(0).clock!.proposal).toBeNull();
    rig.game.handleClock('p1', 'clock:propose', { minutes: 2 });
    expect(rig.errors(1).at(-1)).toMatchObject({ code: 'rate_limited', message: expect.stringMatching(/^Wait/) });
    rig.game.handleClock('p2', 'clock:vote', { id: 'x9-9', yes: true });
    expect(rig.errors(2).at(-1)).toMatchObject({ code: 'invalid', for: 'clock:vote' });
    rig.game.handleClock('stranger', 'clock:propose', { minutes: 1 });
    expect((rig.host.sent.get('stranger') ?? []).length).toBe(0); // not a member: nothing is sent
    // a dead player may propose and vote too (ghosts stay social)
    const ghost = rig.state().players.find((p) => p.seat === 4)!;
    ghost.alive = false;
    ghost.publicAlive = false;
    rig.game.handleClock('p4', 'clock:propose', { minutes: 1 });
    expect(rig.view(0).clock!.proposal).toMatchObject({ by: 'p4' });

    // human games: the Storyteller runs the clock
    const host = createFakeHost('human');
    host.addMember({ pid: 'st', role: 'storyteller' });
    for (let i = 0; i < 5; i++) host.addMember({ pid: `h${i}`, seat: i });
    const g = createGameModule(host, { seed: 1 });
    host.setModules({ game: g });
    g.start(Array.from({ length: 5 }, (_, i) => ({ pid: `h${i}`, seat: i, name: `H${i}` })), 'st');
    g.handleClock('h1', 'clock:propose', { minutes: 1 });
    expect((host.sent.get('h1') ?? []).at(-1)).toMatchObject({ type: 'error', payload: { code: 'forbidden', for: 'clock:propose' } });
    expect((g.viewFor('h1') as PlayerGameView).storytellerMode).toBe('human');
  });

  it('nominations end with the clock: a pending vote still runs, the block is executed, bedtime follows', () => {
    const rig = autoRig(7, { seed: 21, policy: { nominate: 0, vote: 0, propose: 0, slayer: 0 }, auto: { nominationsMs: 3_000, voteDelayMs: 10_000 } });
    toStage(rig, 'nominations');
    const s = rig.state();
    const nominee = s.players.find((p) => p.alive && p.character !== 'imp' && p.character !== 'saint' && p.character !== 'virgin')!;
    const nominator = s.players.find((p) => p.alive && p !== nominee && p.character !== 'virgin')!;
    rig.game.handlePlayer(`p${nominator.seat}`, 'game:nominate', { nomineeSeat: nominee.seat });
    const nom = rig.view(0).day!.nominations[0]!;
    expect(nom.status).toBe('pending');
    for (const p of s.players) rig.game.handlePlayer(`p${p.seat}`, 'game:vote', { nominationId: nom.id, vote: true });
    // the clock runs out before the vote delay: the vote starts at once, then the execution
    for (let i = 0; i < 200 && rig.game.phase() === 'day'; i++) rig.step(100);
    expect(rig.state().players.find((p) => p.seat === nominee.seat)!.executed).toBe(true);
    expect(['bedtime', 'finished']).toContain(rig.game.phase());
    if (rig.game.phase() === 'bedtime') expect(rig.view(0).clock!.stage).toBe('bedtime');
    const texts = recorderOf(rig.game)!.timeline.map((e) => e.text);
    expect(texts.some((t) => /is on the block with 7 votes and will be executed/.test(t))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Human games: the Storyteller's day_clock prop

const CHARS: CharacterId[] = ['imp', 'poisoner', 'washerwoman', 'empath', 'fortune_teller', 'monk', 'chef'];

function humanRig() {
  const host = createFakeHost('lobbyH');
  host.addMember({ pid: 'st', role: 'storyteller', displayName: 'Teller' });
  for (let i = 0; i < CHARS.length; i++) host.addMember({ pid: `p${i}`, seat: i, displayName: `P${i + 1}` });
  const game = createGameModule(host, { seed: 3, voteStepMs: 100, bedtimeSeconds: 30, nightfallGraceMs: 0 });
  host.setModules({ game });
  game.start(CHARS.map((_, i) => ({ pid: `p${i}`, seat: i, name: `P${i + 1}` })), 'st');
  const st = (cmd: StCommand) => {
    host.clock.now += 50;
    const before = (host.sent.get('st') ?? []).length;
    game.handleStoryteller('st', cmd);
    return (host.sent.get('st') ?? []).slice(before).filter((m) => m.type === 'error').map((m) => m.payload as { code: string; message: string });
  };
  const ok = (cmd: StCommand) => expect(st(cmd)).toEqual([]);
  ok({ type: 'assign_characters', assignments: CHARS.map((character, seat) => ({ seat, character })), redHerringSeat: 2, demonBluffs: [] });
  return { host, game, st, ok, view: (seat: number) => game.viewFor(`p${seat}`) as PlayerGameView, stView: () => game.viewFor('st') as StorytellerGameView };
}

describe("human games: the Storyteller's day_clock (a prop)", () => {
  it('unset by default; set / pause / resume / add / clear; identical for every viewer incl. the ST; never moves phases', () => {
    const r = humanRig();
    r.ok({ type: 'begin_first_night' });
    r.ok({ type: 'advance_phase', to: 'day' });
    expect(r.view(0).clock).toBeNull();
    expect(r.view(0).storytellerMode).toBe('human');
    const t0 = r.host.clock.now + 50;
    r.ok({ type: 'day_clock', action: 'set', stage: 'discussion', minutes: 5 });
    expect(r.view(3).clock).toEqual({ stage: 'discussion', endsAt: t0 + 300_000, remainingMs: null, paused: false, totalMs: 300_000 });
    expect(r.stView().clock).toEqual(r.view(3).clock);
    r.ok({ type: 'day_clock', action: 'pause' });
    expect(r.view(1).clock).toMatchObject({ paused: true, remainingMs: 300_000 - 50, endsAt: null });
    expect(r.st({ type: 'day_clock', action: 'pause' })[0]).toMatchObject({ code: 'invalid' });
    r.ok({ type: 'day_clock', action: 'resume' });
    r.ok({ type: 'day_clock', action: 'add', minutes: 2 });
    expect(r.view(1).clock!.totalMs).toBe(420_000);
    // it reaches zero: nothing happens (still day, nominations untouched)
    r.host.clock.now += 3_600_000;
    r.game.tick(r.host.clock.now);
    expect(r.game.phase()).toBe('day');
    expect(r.view(1).clock!.stage).toBe('discussion');
    r.ok({ type: 'day_clock', action: 'set', stage: 'nominations', minutes: 4 });
    expect(r.view(1).clock).toMatchObject({ stage: 'nominations', totalMs: 240_000 });
    r.ok({ type: 'day_clock', action: 'clear' });
    expect(r.view(1).clock).toBeNull();
    // validation
    expect(r.st({ type: 'day_clock', action: 'set', stage: 'discussion' })[0]).toMatchObject({ code: 'invalid' });
    expect(r.st({ type: 'day_clock', action: 'set', stage: 'bedtime', minutes: 1 })[0]).toMatchObject({ code: 'invalid' });
    expect(r.st({ type: 'day_clock', action: 'add', minutes: 1 })[0]).toMatchObject({ code: 'invalid', message: 'No clock is set' });
    // players cannot use it
    r.game.handleStoryteller('p1', { type: 'day_clock', action: 'clear' });
    expect((r.host.sent.get('p1') ?? []).at(-1)).toMatchObject({ type: 'error', payload: { code: 'forbidden' } });
  });

  it('bedtime mirrors the bedtime countdown; the day clock is cleared when the day ends; undo does not touch it', () => {
    const r = humanRig();
    r.ok({ type: 'begin_first_night' });
    r.ok({ type: 'advance_phase', to: 'day' });
    r.ok({ type: 'day_clock', action: 'set', stage: 'nominations', minutes: 3 });
    r.ok({ type: 'set_nominations_open', open: true });
    r.ok({ type: 'undo_last' }); // undoes the nominations, not the clock
    expect(r.view(0).clock).toMatchObject({ stage: 'nominations' });
    r.ok({ type: 'advance_phase', to: 'bedtime' });
    const bed = r.view(2).clock!;
    expect(bed).toMatchObject({ stage: 'bedtime', paused: false, totalMs: 30_000 });
    expect(bed.endsAt).toBe(r.view(2).phaseEndsAt);
    r.ok({ type: 'bedtime_timer', action: 'pause' });
    expect(r.view(2).clock).toMatchObject({ stage: 'bedtime', paused: true, endsAt: null });
    expect(r.st({ type: 'day_clock', action: 'set', stage: 'discussion', minutes: 1 })[0]).toMatchObject({ code: 'phase' });
    r.ok({ type: 'advance_phase', to: 'night' });
    expect(r.view(2).clock).toBeNull(); // the day's clock is gone
    // recorded as a Storyteller command, not on the undo history
    const rec = recorderOf(r.game)!;
    expect(rec.commands.filter((c) => (c.cmd as { type: string }).type === 'day_clock')).toHaveLength(1);
    expect(r.stView().log.some((l) => l.text.startsWith('Town clock set nominations'))).toBe(true);
  });
});
