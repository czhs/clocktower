// clock-client (v2.1): countdown formatting, chip lines, extension proposal card / outcome / limits,
// automatic-game texts and lobby timings (apps/client/src/ui/clock/logic.ts).
import { describe, expect, it } from 'vitest';
import { AUTO_DEFAULTS, type ClockProposalView, type DayClockView } from '@ct/protocol';
import {
  canStep,
  clockLine,
  clockRemainingMs,
  formatCountdown,
  formatTiming,
  modeOf,
  proposalCard,
  proposalOutcome,
  proposeState,
  stepTiming,
  timingsOf,
  townSays,
} from '../src/ui/clock/logic';

const NOW = 1_000_000;
const clock = (o: Partial<DayClockView> = {}): DayClockView => ({
  stage: 'discussion',
  endsAt: NOW + 192_000,
  remainingMs: null,
  paused: false,
  totalMs: 300_000,
  proposal: null,
  ...o,
});
const prop = (o: Partial<ClockProposalView> = {}): ClockProposalView => ({ id: 'p1', by: 'ada', minutes: 2, closesAt: NOW + 24_000, yes: ['ada'], no: [], needed: 3, ...o });
const names: Record<string, string> = { ada: 'Ada', bram: 'Bram' };
const nameOf = (pid: string) => names[pid] ?? 'Someone';

describe('formatCountdown', () => {
  it('formats m:ss, rounding up to whole seconds', () => {
    expect(formatCountdown(192_000)).toBe('3:12');
    expect(formatCountdown(65_000)).toBe('1:05');
    expect(formatCountdown(4_001)).toBe('0:05');
    expect(formatCountdown(1)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5000)).toBe('0:00');
  });
  it('adds hours when needed', () => {
    expect(formatCountdown(3_723_000)).toBe('1:02:03');
  });
});

describe('clockRemainingMs', () => {
  it('running: endsAt - now, never negative', () => {
    expect(clockRemainingMs(clock(), NOW)).toBe(192_000);
    expect(clockRemainingMs(clock({ endsAt: NOW - 10 }), NOW)).toBe(0);
  });
  it('paused: the frozen remainder; unset: null', () => {
    expect(clockRemainingMs(clock({ paused: true, endsAt: null, remainingMs: 42_000 }), NOW)).toBe(42_000);
    expect(clockRemainingMs(clock({ endsAt: null }), NOW)).toBeNull();
    expect(clockRemainingMs(null, NOW)).toBeNull();
  });
  it('bedtime overtime (running, no endsAt, remainingMs 0) reads as zero', () => {
    const c = clock({ stage: 'bedtime', endsAt: null, remainingMs: 0, paused: false, totalMs: 45_000 });
    expect(clockRemainingMs(c, NOW)).toBe(0);
    expect(clockLine(c, NOW)).toMatchObject({ label: 'Night falls', due: true });
  });
});

describe('clockLine', () => {
  it('names what the countdown leads to', () => {
    expect(clockLine(clock(), NOW)).toMatchObject({ label: 'Nominations open in', time: '3:12', tone: 'discussion', urgent: false });
    expect(clockLine(clock({ stage: 'nominations', endsAt: NOW + 65_000 }), NOW, { onTheBlock: true })).toMatchObject({ label: 'Execution in', time: '1:05', tone: 'nominations' });
    expect(clockLine(clock({ stage: 'nominations' }), NOW, { onTheBlock: false })!.label).toBe('Nominations close in');
    expect(clockLine(clock({ stage: 'bedtime', endsAt: NOW + 32_000, totalMs: 45_000 }), NOW)).toMatchObject({ label: 'Bedtime', time: '0:32' });
  });
  it('is urgent only in the last 30 s of a running clock', () => {
    expect(clockLine(clock({ endsAt: NOW + 30_000 }), NOW)!.urgent).toBe(true);
    expect(clockLine(clock({ endsAt: NOW + 31_000 }), NOW)!.urgent).toBe(false);
    expect(clockLine(clock({ paused: true, endsAt: null, remainingMs: 5000 }), NOW)!.urgent).toBe(false);
  });
  it('paused shows "Paused" with the frozen time', () => {
    expect(clockLine(clock({ paused: true, endsAt: null, remainingMs: 61_000 }), NOW)).toMatchObject({ label: 'Paused', time: '1:01', tone: 'paused' });
  });
  it('at zero says what is due, without a time', () => {
    expect(clockLine(clock({ endsAt: NOW }), NOW)).toMatchObject({ label: 'Nominations open', time: null, due: true });
    expect(clockLine(clock({ stage: 'nominations', endsAt: NOW - 1 }), NOW, { onTheBlock: true })!.label).toBe('Time for the execution');
    expect(clockLine(clock({ stage: 'bedtime', endsAt: NOW }), NOW)!.label).toBe('Night falls');
  });
  it('fraction is the share of the stage left (for the dial)', () => {
    expect(clockLine(clock({ endsAt: NOW + 150_000, totalMs: 300_000 }), NOW)!.fraction).toBeCloseTo(0.5);
    expect(clockLine(clock({ endsAt: NOW + 900_000, totalMs: 300_000 }), NOW)!.fraction).toBe(1);
  });
  it('unset clock: no line', () => {
    expect(clockLine(clock({ endsAt: null }), NOW)).toBeNull();
  });
});

describe('proposalCard', () => {
  it('reads "Ada proposes +2 min · 1 of 3 · 24 s"', () => {
    const m = proposalCard(prop(), { myPid: 'bram', nameOf, now: NOW });
    expect(m).toMatchObject({ title: 'Ada proposes +2 min', tally: '1 of 3', secondsLeft: 24, my: null, mine: false, passing: false });
    expect(m.fraction).toBeCloseTo(0.8);
  });
  it('the proposer sees "You propose"', () => {
    expect(proposalCard(prop(), { myPid: 'ada', nameOf, now: NOW })).toMatchObject({ title: 'You propose +2 min', mine: true, my: 'yes' });
  });
  it('a pending tap counts at once (and a switched vote moves between columns)', () => {
    const tap = proposalCard(prop(), { myPid: 'bram', nameOf, now: NOW, pending: { id: 'p1', yes: true } });
    expect(tap).toMatchObject({ my: 'yes', yes: 2, no: 0, tally: '2 of 3' });
    const flip = proposalCard(prop({ yes: ['ada', 'bram'] }), { myPid: 'bram', nameOf, now: NOW, pending: { id: 'p1', yes: false } });
    expect(flip).toMatchObject({ my: 'no', yes: 1, no: 1 });
    // a pending tap for an older proposal is ignored
    expect(proposalCard(prop(), { myPid: 'bram', nameOf, now: NOW, pending: { id: 'old', yes: true } }).my).toBeNull();
  });
  it('passing once yes reaches needed; closed window = 0 s', () => {
    const m = proposalCard(prop({ yes: ['ada', 'bram', 'cleo'], closesAt: NOW - 1 }), { myPid: null, nameOf, now: NOW });
    expect(m).toMatchObject({ passing: true, secondsLeft: 0, fraction: 0, title: 'Ada proposes +2 min' });
    expect(proposalCard(prop({ by: 'zed' }), { myPid: null, nameOf, now: NOW }).title).toBe('Someone proposes +2 min');
  });
});

describe('proposalOutcome', () => {
  const open = clock({ proposal: prop() });
  it('nothing closed: null', () => {
    expect(proposalOutcome(null, open)).toBeNull();
    expect(proposalOutcome(clock(), clock())).toBeNull();
    expect(proposalOutcome(open, clock({ proposal: prop({ yes: ['ada', 'bram'] }) }))).toBeNull();
  });
  it('the clock moved later by the minutes: added', () => {
    const next = clock({ endsAt: open.endsAt! + 120_000, totalMs: 420_000 });
    expect(proposalOutcome(open, next)).toEqual({ id: 'p1', minutes: 2, passed: true, text: '+2 min added' });
  });
  it('the clock did not move: not extended', () => {
    expect(proposalOutcome(open, clock())).toMatchObject({ passed: false, text: 'Not extended' });
  });
  it('paused clocks compare the remainder', () => {
    const p = clock({ paused: true, endsAt: null, remainingMs: 60_000, proposal: prop({ minutes: 5 }) });
    expect(proposalOutcome(p, clock({ paused: true, endsAt: null, remainingMs: 360_000 }))!.passed).toBe(true);
  });
  it('stage changed meanwhile: falls back to the last tally', () => {
    const won = clock({ proposal: prop({ yes: ['a', 'b', 'c'] }) });
    expect(proposalOutcome(won, clock({ stage: 'nominations' }))!.passed).toBe(true);
    expect(proposalOutcome(open, null)!.passed).toBe(false);
  });
});

describe('proposeState', () => {
  const v = (o: Partial<Parameters<typeof proposeState>[0]> = {}) => ({ kind: 'player' as const, phase: 'day' as const, storytellerMode: 'auto' as const, clock: clock(), ...o });
  it('only in automatic games, for players, by day/bedtime, with a clock', () => {
    expect(proposeState(v({ storytellerMode: 'human' }), NOW).show).toBe(false);
    expect(proposeState(v({ storytellerMode: undefined }), NOW).show).toBe(false);
    expect(proposeState(v({ kind: 'storyteller' }), NOW).show).toBe(false);
    expect(proposeState(v({ phase: 'night' }), NOW).show).toBe(false);
    expect(proposeState(v({ clock: null }), NOW).show).toBe(false);
    expect(proposeState(v({ result: { winner: 'good' } }), NOW).show).toBe(false);
  });
  it('allowed: +1 / +2 / +5', () => {
    const s = proposeState(v(), NOW);
    expect(s).toMatchObject({ show: true, allowed: true });
    expect(s.options).toEqual([
      { minutes: 1, ok: true },
      { minutes: 2, ok: true },
      { minutes: 5, ok: true },
    ]);
  });
  it('blocked with a reason', () => {
    expect(proposeState(v({ clock: clock({ proposal: prop() }) }), NOW)).toMatchObject({ allowed: false, reason: 'A vote on more time is already running' });
    expect(proposeState(v({ clock: clock({ stage: 'bedtime' }) }), NOW).allowed).toBe(false);
    expect(proposeState(v({ clock: clock({ paused: true, endsAt: null, remainingMs: 1000 }) }), NOW).reason).toBe('The clock is paused');
    expect(proposeState(v({ clock: clock({ endsAt: NOW }) }), NOW).reason).toBe("Time's up");
    const blocked = proposeState(v(), NOW);
    expect(blocked.allowed).toBe(true);
  });
  it('honours optional server hints', () => {
    const h = (x: object) => proposeState(v({ clock: { ...clock(), ...x } as DayClockView }), NOW);
    expect(h({ canPropose: false, proposeBlockedReason: 'You already asked today' }).reason).toBe('You already asked today');
    expect(h({ extensionsLeft: 0 }).reason).toBe('No more extensions today');
    expect(h({ cooldownUntil: NOW + 9_500 }).reason).toBe('You can propose again in 10 s');
    expect(h({ extensionMinutesLeft: 2 }).options).toEqual([
      { minutes: 1, ok: true },
      { minutes: 2, ok: true },
      { minutes: 5, ok: false },
    ]);
    expect(h({ extensionMinutesLeft: 0 }).allowed).toBe(false);
  });
  it('mirrors the per-player / per-day rules from what this client saw', () => {
    expect(proposeState(v(), NOW, { myLastAt: NOW - 20_000 }).reason).toBe('You can propose again in 40 s');
    expect(proposeState(v(), NOW, { myLastAt: NOW - 61_000 }).allowed).toBe(true);
    expect(proposeState(v(), NOW, { myCount: 3 }).reason).toBe('You can ask at most 3 times a day');
    expect(proposeState(v(), NOW, { added: 17 }).options.map((o) => o.ok)).toEqual([true, true, false]);
    expect(proposeState(v(), NOW, { added: 20 }).reason).toBe('No more extension time today');
  });
});

describe('townSays (automatic games have no Storyteller)', () => {
  it('human games: unchanged', () => {
    expect(townSays('Night: wait at home. The Storyteller may visit you.', 'human')).toBe('Night: wait at home. The Storyteller may visit you.');
    expect(townSays('Night: wait at home. The Storyteller may visit you.', undefined)).toContain('Storyteller');
  });
  it('known sentences get a natural rewrite', () => {
    expect(townSays('Night: wait at home. The Storyteller may visit you.', 'auto')).toBe('Night: wait at home. The town wakes you here if your character acts.');
    expect(townSays('The Storyteller is visiting you: this conversation is private.', 'auto')).toBe('The town wakes you: your choice is private.');
    expect(townSays("Nominations aren't open yet: the Storyteller opens them.", 'auto')).toContain('town clock');
    expect(townSays('Explore and chat: the Storyteller is preparing the game.', 'auto')).toBe('Explore and chat: the game begins in a moment.');
  });
  it('anything else: "the Storyteller" -> "the town"', () => {
    expect(townSays("Ask the Storyteller. The Storyteller's lantern.", 'auto')).toBe("Ask the town. The town's lantern.");
    for (const s of ['The Storyteller is walking you home…', 'Please wait for the Storyteller.', 'The Storyteller has paused your movement.']) expect(townSays(s, 'auto')).not.toMatch(/Storyteller/);
  });
});

describe('lobby mode + timings', () => {
  it('modeOf reads defensively', () => {
    expect(modeOf({ storytellerMode: 'auto' })).toBe('auto');
    expect(modeOf({ storytellerMode: 'human' })).toBe('human');
    expect(modeOf({})).toBe('human');
    expect(modeOf(null)).toBe('human');
  });
  it('timingsOf: defaults, then each source in order (numbers only)', () => {
    expect(timingsOf()).toEqual(AUTO_DEFAULTS);
    expect(timingsOf({ autoTimings: { discussionMin: 8 } }, { autoTimings: { nightSec: 90, bedtimeSec: 'x' } })).toEqual({ ...AUTO_DEFAULTS, discussionMin: 8, nightSec: 90 });
  });
  it('stepTiming walks sensible steps and stops at the ends', () => {
    const t = { ...AUTO_DEFAULTS };
    expect(stepTiming(t, 'discussionMin', 1).discussionMin).toBe(6);
    expect(stepTiming(t, 'bedtimeSec', 1).bedtimeSec).toBe(60);
    expect(stepTiming(t, 'nightSec', -1).nightSec).toBe(45);
    expect(stepTiming({ ...t, discussionMin: 30 }, 'discussionMin', 1).discussionMin).toBe(30);
    expect(canStep({ ...t, bedtimeSec: 15 }, 'bedtimeSec', -1)).toBe(false);
    expect(canStep(t, 'bedtimeSec', -1)).toBe(true);
    // an odd value (set elsewhere) snaps onto the list
    expect(stepTiming({ ...t, nightSec: 50 }, 'nightSec', 1).nightSec).toBe(60);
    expect(stepTiming({ ...t, nightSec: 50 }, 'nightSec', -1).nightSec).toBe(45);
  });
  it('formatTiming', () => {
    expect(formatTiming('discussionMin', 5)).toBe('5 min');
    expect(formatTiming('discussionMin', 1.5)).toBe('1 min 30 s');
    expect(formatTiming('bedtimeSec', 45)).toBe('45 s');
    expect(formatTiming('nightSec', 90)).toBe('1 min 30 s');
    expect(formatTiming('nightSec', 120)).toBe('2 min');
  });
});

describe('Abort game (host, automatic games)', () => {
  const lobby = (host: boolean, mode = 'auto') => ({ lobby: { phase: 'day', storytellerMode: mode }, members: [{ pid: 'me', isHost: host }, { pid: 'x', isHost: !host }], youPid: 'me' });
  it('only the host of a running automatic game', async () => {
    const { canAbort } = await import('../src/ui/clock/AbortGame');
    expect(canAbort(lobby(true), { phase: 'day', storytellerMode: 'auto' })).toBe(true);
    expect(canAbort(lobby(true), { phase: 'night' })).toBe(true); // mode from the lobby summary
    expect(canAbort(lobby(false), { phase: 'day', storytellerMode: 'auto' })).toBe(false);
    expect(canAbort(lobby(true, 'human'), { phase: 'day', storytellerMode: 'human' })).toBe(false);
    expect(canAbort(lobby(true), { phase: 'finished', storytellerMode: 'auto' })).toBe(false);
    expect(canAbort(lobby(true), null)).toBe(false);
  });
});
