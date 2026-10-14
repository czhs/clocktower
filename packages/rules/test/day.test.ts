import type { CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { applyStCommand, projectForPlayer, projectForStoryteller, tick, type GameState } from '../src/index.js';
import {
  act,
  act_night,
  actErr,
  alive,
  begin,
  clock,
  finishNight,
  mkGame,
  nominateAndVote,
  P,
  st,
  stErr,
  toDay,
  toNight,
} from './helpers.js';

const G8: CharacterId[] = ['imp', 'poisoner', 'washerwoman', 'empath', 'fortune_teller', 'monk', 'butler', 'ravenkeeper'];

function day1(chars: CharacterId[] = G8, opts: Parameters<typeof mkGame>[1] = { redHerringSeat: 2 }): GameState {
  const s = mkGame(chars, opts);
  begin(s);
  finishNight(s);
  toDay(s);
  return s;
}

describe('nominations', () => {
  it('requires open nominations; each player nominates once and is nominated once per day', () => {
    const s = day1();
    expect(actErr(s, 2, { type: 'nominate', nomineeSeat: 3 })).toMatch(/not open/);
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 2, { type: 'nominate', nomineeSeat: 3 });
    expect(actErr(s, 4, { type: 'nominate', nomineeSeat: 5 })).toMatch(/in progress/);
    const n = s.day!.nominations[0]!;
    st(s, { type: 'start_vote', nominationId: n.id });
    tick(s, clock.now + 60_000);
    expect(n.status).toBe('tallied');
    expect(actErr(s, 2, { type: 'nominate', nomineeSeat: 5 })).toMatch(/already nominated/);
    expect(actErr(s, 4, { type: 'nominate', nomineeSeat: 3 })).toMatch(/already been nominated/);
    act(s, 4, { type: 'nominate', nomineeSeat: 2 });
    const v = projectForPlayer(s, 2);
    expect(v.you.canNominate).toBe(false);
    expect(v.players[3]!.wasNominatedToday).toBe(true);
  });

  it('dead players cannot nominate; limits reset the next day', () => {
    const s = day1();
    st(s, { type: 'kill', seat: 3, announce: true });
    st(s, { type: 'set_nominations_open', open: true });
    expect(actErr(s, 3, { type: 'nominate', nomineeSeat: 2 })).toMatch(/Dead/);
    expect(projectForPlayer(s, 3).you.canNominate).toBe(false);
    nominateAndVote(s, 2, 4, []);
    st(s, { type: 'execute', seat: null });
    toNight(s);
    finishNight(s);
    toDay(s);
    expect(P(s, 2).nominatedToday).toBe(false);
    expect(projectForPlayer(s, 2).you.canNominate).toBe(true);
  });

  it('withdrawn nomination restores both players', () => {
    const s = day1();
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 2, { type: 'nominate', nomineeSeat: 3 });
    st(s, { type: 'cancel_nomination', nominationId: s.day!.nominations[0]!.id });
    act(s, 2, { type: 'nominate', nomineeSeat: 3 });
  });
});

describe('voting', () => {
  it('clock hand starts after the nominee and ends with the nominee', () => {
    const s = day1();
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 2, { type: 'nominate', nomineeSeat: 5 });
    const n = s.day!.nominations[0]!;
    st(s, { type: 'start_vote', nominationId: n.id });
    expect(s.day!.vote!.order).toEqual([6, 7, 0, 1, 2, 3, 4, 5]);
    expect(projectForPlayer(s, 0).day!.nominations[0]!.currentVoterSeat).toBe(6);
    act(s, 0, { type: 'vote', nominationId: n.id, vote: true });
    expect(projectForPlayer(s, 3).day!.nominations[0]!.handsRaised).toEqual([0]);
    tick(s, s.day!.vote!.nextAt); // locks seat 6
    expect(n.votes[6]).toBe(false);
    expect(projectForPlayer(s, 0).day!.nominations[0]!.currentVoterSeat).toBe(7);
  });

  it('threshold is half the living (rounded up); higher count replaces the block; ties clear it', () => {
    const s = day1();
    expect(nominateAndVote(s, 0, 2, [0, 1, 3]).voteCount).toBe(3);
    expect(s.day!.block).toBeNull(); // 3 < ceil(8/2)
    nominateAndVote(s, 1, 3, [0, 1, 2, 4]);
    expect(s.day!.block).toEqual({ seat: 3, votes: 4 });
    const tie = nominateAndVote(s, 2, 4, [0, 1, 2, 3]);
    expect(tie.threshold).toBe(5);
    expect(s.day!.block).toBeNull();
    nominateAndVote(s, 3, 5, [0, 1, 2, 3, 4]);
    expect(s.day!.block).toEqual({ seat: 5, votes: 5 });
    st(s, { type: 'execute', seat: 5 });
    expect(alive(s, 5)).toBe(false);
    expect(s.day!.executedSeat).toBe(5);
    expect(stErr(s, { type: 'execute', seat: 4 })).toMatch(/one execution/);
    expect(actErr(s, 4, { type: 'nominate', nomineeSeat: 6 })).toMatch(/not open|already been executed/);
  });

  it('dead players have one ghost vote; once spent they cannot vote', () => {
    const s = day1();
    st(s, { type: 'kill', seat: 3, announce: true });
    expect(projectForPlayer(s, 3).you.ghostVoteAvailable).toBe(true);
    const n = nominateAndVote(s, 2, 4, [3]);
    expect(n.votes[3]).toBe(true);
    expect(P(s, 3).ghostVoteAvailable).toBe(false);
    expect(projectForPlayer(s, 5).players[3]!.ghostVoteAvailable).toBe(false);
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 4, { type: 'nominate', nomineeSeat: 5 });
    const n2 = s.day!.nominations.at(-1)!;
    st(s, { type: 'start_vote', nominationId: n2.id });
    expect(actErr(s, 3, { type: 'vote', nominationId: n2.id, vote: true })).toMatch(/ghost vote/);
    // ST override restores it
    st(s, { type: 'set_ghost_vote', seat: 3, available: true });
    act(s, 3, { type: 'vote', nominationId: n2.id, vote: true });
  });

  it('a locked vote cannot change', () => {
    const s = day1();
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 2, { type: 'nominate', nomineeSeat: 5 });
    const n = s.day!.nominations[0]!;
    st(s, { type: 'start_vote', nominationId: n.id });
    act(s, 6, { type: 'vote', nominationId: n.id, vote: true });
    tick(s, s.day!.vote!.nextAt);
    expect(actErr(s, 6, { type: 'vote', nominationId: n.id, vote: false })).toMatch(/locked/);
  });

  it('butler voting without the master raises an ST alert (not enforced)', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    begin(s);
    act_night(s, 'butler', [3]);
    finishNight(s);
    toDay(s);
    nominateAndVote(s, 2, 4, [6]);
    expect(s.alerts.join()).toMatch(/Butler/);
    const before = s.alerts.length;
    nominateAndVote(s, 4, 5, [3, 6]);
    expect(s.alerts.length).toBe(before);
  });
});

describe('virgin', () => {
  const V: CharacterId[] = ['imp', 'poisoner', 'virgin', 'empath', 'chef', 'monk', 'drunk'];
  it('a Townsfolk nominating the Virgin is executed immediately', () => {
    const s = day1(V, { drunkBelieves: 'soldier' });
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 3, { type: 'nominate', nomineeSeat: 2 });
    expect(alive(s, 3)).toBe(false);
    expect(P(s, 3).publicAlive).toBe(false);
    expect(s.day!.executedSeat).toBe(3);
    expect(s.day!.nominations[0]!.status).toBe('cancelled');
    expect(s.lastExecutedDiedSeat).toBe(3);
  });

  it('a non-Townsfolk (Drunk/Minion) nominator spends the ability without effect', () => {
    const s = day1(V, { drunkBelieves: 'soldier' });
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 6, { type: 'nominate', nomineeSeat: 2 });
    expect(alive(s, 6)).toBe(true);
    expect(P(s, 2).abilityUsed).toBe(true);
    st(s, { type: 'cancel_nomination', nominationId: s.day!.nominations[0]!.id });
    act(s, 3, { type: 'nominate', nomineeSeat: 2 });
    expect(alive(s, 3)).toBe(true);
  });

  it('a poisoned Virgin has no effect', () => {
    const s = mkGame(V, { drunkBelieves: 'soldier' });
    begin(s);
    act_night(s, 'poisoner', [2]);
    finishNight(s);
    toDay(s);
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 3, { type: 'nominate', nomineeSeat: 2 });
    expect(alive(s, 3)).toBe(true);
  });

  it('the Spy nominating the Virgin alerts the ST (may register as Townsfolk)', () => {
    const s = day1(['imp', 'spy', 'virgin', 'empath', 'chef', 'monk', 'saint']);
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 1, { type: 'nominate', nomineeSeat: 2 });
    expect(alive(s, 1)).toBe(true);
    expect(s.alerts.join()).toMatch(/Spy .* Virgin/);
  });
});

describe('slayer', () => {
  const S: CharacterId[] = ['imp', 'poisoner', 'slayer', 'empath', 'recluse', 'monk', 'chef'];
  it('a healthy Slayer kills the Demon -> good wins', () => {
    const s = day1(S);
    act(s, 2, { type: 'slayerShot', targetSeat: 0 });
    expect(alive(s, 0)).toBe(false);
    expect(s.phase).toBe('finished');
    expect(s.result!.winner).toBe('good');
  });

  it('non-Slayers and wrong targets: nothing happens; one shot per player', () => {
    const s = day1(S);
    act(s, 3, { type: 'slayerShot', targetSeat: 0 });
    expect(alive(s, 0)).toBe(true);
    expect(s.announcements.at(-1)!.text).toBe('Nothing happens.');
    expect(actErr(s, 3, { type: 'slayerShot', targetSeat: 0 })).toMatch(/already/);
    act(s, 2, { type: 'slayerShot', targetSeat: 5 });
    expect(alive(s, 5)).toBe(true);
    expect(P(s, 2).abilityUsed).toBe(true);
    expect(projectForPlayer(s, 2).you.canSlayerShot).toBe(false);
  });

  it('a poisoned Slayer wastes the shot', () => {
    const s = mkGame(S);
    begin(s);
    act_night(s, 'poisoner', [2]);
    finishNight(s);
    toDay(s);
    act(s, 2, { type: 'slayerShot', targetSeat: 0 });
    expect(alive(s, 0)).toBe(true);
    expect(P(s, 2).abilityUsed).toBe(true);
  });

  it('shooting the Recluse alerts the ST (may register as the Demon)', () => {
    const s = day1(S);
    act(s, 2, { type: 'slayerShot', targetSeat: 4 });
    expect(alive(s, 4)).toBe(true);
    expect(s.alerts.join()).toMatch(/Recluse/);
  });

  it('Scarlet Woman catches a slain Demon with 5+ alive', () => {
    const s = day1(['imp', 'scarlet_woman', 'slayer', 'empath', 'chef', 'monk', 'saint']);
    act(s, 2, { type: 'slayerShot', targetSeat: 0 });
    expect(s.phase).toBe('day');
    expect(P(s, 1).character).toBe('imp');
  });
});

describe('saint, mayor, scarlet woman, victory', () => {
  it('executing a healthy Saint: evil wins', () => {
    const s = day1(['imp', 'poisoner', 'saint', 'empath', 'chef']);
    st(s, { type: 'execute', seat: 2 });
    expect(s.result).toMatchObject({ winner: 'evil', reason: 'The Saint was executed.' });
  });

  it('executing a poisoned Saint: game continues', () => {
    const s = mkGame(['imp', 'poisoner', 'saint', 'empath', 'chef']);
    begin(s);
    act_night(s, 'poisoner', [2]);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 2 });
    expect(s.phase).toBe('day');
    expect(s.alerts.join()).toMatch(/Saint/);
  });

  it('Mayor: 3 alive and no execution -> good wins at the end of the day', () => {
    const s = day1(['imp', 'poisoner', 'mayor', 'empath', 'chef']);
    st(s, { type: 'kill', seat: 3, announce: true });
    st(s, { type: 'kill', seat: 1, announce: true });
    st(s, { type: 'execute', seat: null });
    st(s, { type: 'advance_phase', to: 'bedtime' });
    expect(s.result).toMatchObject({ winner: 'good' });
  });

  it('Mayor: an execution today prevents the win', () => {
    const s = day1(['imp', 'poisoner', 'mayor', 'empath', 'chef', 'monk']);
    st(s, { type: 'kill', seat: 3, announce: true });
    st(s, { type: 'kill', seat: 5, announce: true });
    st(s, { type: 'execute', seat: 1 });
    expect(s.phase).toBe('day');
    st(s, { type: 'advance_phase', to: 'night' });
    expect(s.phase).toBe('night');
  });

  it('demon executed with 5+ alive and a healthy Scarlet Woman: she becomes the Imp', () => {
    const s = day1(['imp', 'scarlet_woman', 'chef', 'empath', 'monk']);
    st(s, { type: 'execute', seat: 0 });
    expect(s.phase).toBe('day');
    expect(P(s, 1).character).toBe('imp');
    expect(projectForPlayer(s, 1).you.role!.character).toBe('imp');
    expect(projectForPlayer(s, 2).you.role!.character).toBe('chef');
  });

  it('demon executed with only 4 alive: good wins even with a Scarlet Woman', () => {
    const s = day1(['imp', 'scarlet_woman', 'chef', 'empath', 'monk']);
    st(s, { type: 'kill', seat: 4, announce: true });
    st(s, { type: 'execute', seat: 0 });
    expect(s.result).toMatchObject({ winner: 'good' });
  });

  it('poisoned Scarlet Woman does not catch the Demon', () => {
    const s = day1(['imp', 'scarlet_woman', 'chef', 'empath', 'monk', 'saint']);
    st(s, { type: 'set_status', seat: 1, poisoned: true });
    st(s, { type: 'execute', seat: 0 });
    expect(s.result).toMatchObject({ winner: 'good' });
  });

  it('two players left alive: evil wins', () => {
    const s = day1(['imp', 'poisoner', 'chef', 'empath', 'monk']);
    st(s, { type: 'execute', seat: 2 });
    toNight(s);
    act_night(s, 'imp', [3]);
    expect(s.phase).toBe('night');
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 4 });
    expect(s.result).toMatchObject({ winner: 'evil', reason: 'Only two players remain alive.' });
  });

  it('declare_winner overrides; undo_last restores the previous state', () => {
    const s = day1(['imp', 'poisoner', 'saint', 'empath', 'chef']);
    st(s, { type: 'execute', seat: 2 });
    expect(s.phase).toBe('finished');
    st(s, { type: 'undo_last' });
    expect(s.phase).toBe('day');
    expect(alive(s, 2)).toBe(true);
    expect(projectForStoryteller(s).canUndo).toBe(true);
    st(s, { type: 'declare_winner', winner: 'good', reason: 'ST ruling' });
    expect(s.result).toMatchObject({ winner: 'good', reason: 'ST ruling' });
    st(s, { type: 'declare_winner', winner: 'evil', reason: 'Changed my mind' });
    expect(s.result!.winner).toBe('evil');
  });

  it('ST corrections: set_alive, set_status, change_character, reminders', () => {
    const s = day1();
    st(s, { type: 'set_alive', seat: 3, alive: false });
    expect(projectForPlayer(s, 4).players[3]!.alive).toBe(false);
    st(s, { type: 'set_alive', seat: 3, alive: true });
    expect(projectForPlayer(s, 4).players[3]!.alive).toBe(true);
    st(s, { type: 'set_status', seat: 3, poisoned: true, drunk: true });
    expect(projectForStoryteller(s).grimoire[3]).toMatchObject({ poisoned: true, drunk: true });
    st(s, { type: 'change_character', seat: 3, character: 'saint', notify: false });
    expect(projectForPlayer(s, 3).you.role!.character).toBe('empath');
    st(s, { type: 'change_character', seat: 3, character: 'chef', notify: true });
    expect(projectForPlayer(s, 3).you.role!.character).toBe('chef');
    st(s, { type: 'add_reminder', seat: 3, token: 'Custom' });
    expect(projectForStoryteller(s).grimoire[3]!.reminders).toContain('Custom');
    st(s, { type: 'remove_reminder', seat: 3, token: 'Custom' });
    expect(projectForStoryteller(s).grimoire[3]!.reminders).not.toContain('Custom');
  });

  it('commands that fail leave the state untouched', () => {
    const s = day1();
    const before = JSON.stringify(projectForStoryteller(s));
    const r = applyStCommand(s, { type: 'execute', seat: 14 }, { now: clock.now });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(projectForStoryteller(s))).toBe(before);
  });
});

describe('phases and bedtime', () => {
  it('bedtime auto-transitions to night when the countdown expires, paused while the ST is away', async () => {
    const { setStorytellerConnected } = await import('../src/index.js');
    const s = day1();
    st(s, { type: 'set_bedtime_seconds', seconds: 10 });
    st(s, { type: 'advance_phase', to: 'bedtime' });
    const ends = s.phaseEndsAt!;
    expect(ends).toBe(clock.now + 10_000);
    setStorytellerConnected(s, false, clock.now + 4_000);
    expect(s.phaseEndsAt).toBeNull();
    expect(tick(s, clock.now + 60_000).changed).toBe(false);
    expect(s.phase).toBe('bedtime');
    setStorytellerConnected(s, true, clock.now + 100_000);
    expect(s.phaseEndsAt).toBe(clock.now + 106_000);
    const r = tick(s, clock.now + 106_000);
    expect(r.changed).toBe(true);
    expect(s.phase).toBe('night');
    expect(r.effects).toContainEqual({ type: 'send_home', reason: 'bedtime' });
  });

  it('rejects illegal transitions', () => {
    const s = day1();
    expect(stErr(s, { type: 'advance_phase', to: 'dawn' })).toMatch(/Cannot/);
    toNight(s);
    expect(stErr(s, { type: 'advance_phase', to: 'bedtime' })).toMatch(/Cannot/);
    st(s, { type: 'advance_phase', to: 'dawn' });
    toDay(s);
    expect(s.dayNumber).toBe(2);
  });

  it('finished games reject play commands', () => {
    const s = day1(['imp', 'poisoner', 'saint', 'empath', 'chef']);
    st(s, { type: 'execute', seat: 2 });
    expect(stErr(s, { type: 'advance_phase', to: 'night' })).toMatch(/over/);
    expect(actErr(s, 3, { type: 'nominate', nomineeSeat: 4 })).toMatch(/day/);
  });
});
