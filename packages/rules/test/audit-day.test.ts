// rules-audit: nominations, voting, Virgin, Slayer, Saint, Mayor, Scarlet Woman by day and win
// conditions. Each test encodes the correct Trouble Brewing behaviour; failures are engine bugs
// listed in docs/rules-audit.md.
import type { CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { applyStCommand, projectForPlayer, type GameState } from '../src/index.js';
import { act, act_night, alive, begin, clock, finishNight, mkGame, nominateAndVote, P, st, toDay, toNight } from './helpers.js';

function day1(chars: CharacterId[], opts: Parameters<typeof mkGame>[1] = {}): GameState {
  const s = mkGame(chars, opts);
  begin(s);
  finishNight(s);
  toDay(s);
  return s;
}

describe('audit: Virgin', () => {
  it('BUG: a dead Virgin has no ability: a Townsfolk nominating them is not executed', () => {
    const s = day1(['imp', 'poisoner', 'virgin', 'chef', 'empath', 'monk', 'saint']);
    st(s, { type: 'kill', seat: 2, announce: true });
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 3, { type: 'nominate', nomineeSeat: 2 });
    expect(alive(s, 3)).toBe(true);
    expect(s.day!.executionOccurred).toBe(false);
    expect(s.day!.nominations[0]!.status).toBe('pending');
  });

  it('the Drunk who believes they are the Virgin: a Townsfolk nominator is safe', () => {
    const s = day1(['imp', 'poisoner', 'drunk', 'chef', 'empath', 'monk', 'saint'], { drunkBelieves: 'virgin' });
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 3, { type: 'nominate', nomineeSeat: 2 });
    expect(alive(s, 3)).toBe(true);
  });

  it('the ability is spent by the first nomination (even by an Outsider); a Townsfolk on a later day is safe', () => {
    const s = day1(['imp', 'poisoner', 'virgin', 'chef', 'empath', 'monk', 'saint']);
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 6, { type: 'nominate', nomineeSeat: 2 }); // Saint (Outsider)
    expect(P(s, 2).abilityUsed).toBe(true);
    st(s, { type: 'execute', seat: null });
    toNight(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 3, { type: 'nominate', nomineeSeat: 2 });
    expect(alive(s, 3)).toBe(true);
  });

  it('a Virgin execution is today\'s execution: no more nominations, and it blocks a Mayor win', () => {
    const s = day1(['imp', 'poisoner', 'virgin', 'chef', 'mayor']);
    st(s, { type: 'kill', seat: 1, announce: true }); // 4 alive: imp, virgin, chef, mayor
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 3, { type: 'nominate', nomineeSeat: 2 }); // chef executed -> 3 alive
    expect(alive(s, 3)).toBe(false);
    expect(s.day!.nominationsOpen).toBe(false);
    st(s, { type: 'advance_phase', to: 'bedtime' });
    expect(s.phase).toBe('bedtime');
    expect(s.result).toBeNull();
  });

  it('LOW: a poisoned Spy cannot register as a Townsfolk, so no "Spy may trigger the Virgin" alert', () => {
    const s = day1(['imp', 'spy', 'virgin', 'empath', 'chef', 'monk', 'saint']);
    st(s, { type: 'set_status', seat: 1, poisoned: true });
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 1, { type: 'nominate', nomineeSeat: 2 });
    expect(s.alerts.join('\n')).not.toMatch(/Spy .* Virgin/);
  });
});

describe('audit: voting', () => {
  const G8: CharacterId[] = ['imp', 'poisoner', 'washerwoman', 'empath', 'chef', 'monk', 'butler', 'saint'];

  it('threshold counts only living players (8 seated, 2 dead -> 3 votes)', () => {
    const s = day1(G8);
    st(s, { type: 'kill', seat: 2, announce: true });
    st(s, { type: 'kill', seat: 3, announce: true });
    const n = nominateAndVote(s, 4, 5, [0, 1, 6]);
    expect(n.threshold).toBe(3);
    expect(s.day!.block).toEqual({ seat: 5, votes: 3 });
  });

  it('after a tie clears the block, a strictly higher count puts a new player on the block', () => {
    const s = day1(G8);
    nominateAndVote(s, 0, 2, [0, 1, 3, 4]);
    nominateAndVote(s, 1, 3, [0, 1, 2, 4]);
    expect(s.day!.block).toBeNull();
    const n3 = nominateAndVote(s, 2, 4, [0, 1, 2, 3, 5]);
    expect(n3.threshold).toBe(5);
    expect(s.day!.block).toEqual({ seat: 4, votes: 5 });
  });

  it('a ghost vote is only spent by a yes vote; a dead nominee may be nominated', () => {
    const s = day1(G8);
    st(s, { type: 'kill', seat: 2, announce: true });
    nominateAndVote(s, 0, 2, []); // dead nominee, dead seat 2 does not vote
    expect(P(s, 2).ghostVoteAvailable).toBe(true);
    nominateAndVote(s, 1, 3, [2]);
    expect(P(s, 2).ghostVoteAvailable).toBe(false);
    expect(projectForPlayer(s, 5).players[2]!.ghostVoteAvailable).toBe(false);
  });

  it('LOW: a dead Butler has no ability: their ghost vote raises no "Butler voted without master" alert', () => {
    const s = day1(G8);
    st(s, { type: 'kill', seat: 6, announce: true });
    nominateAndVote(s, 0, 3, [6]);
    expect(s.alerts.join('\n')).not.toMatch(/Butler/);
  });

  it('a poisoned Butler may vote freely (no alert)', () => {
    const s = mkGame(G8);
    begin(s);
    act_night(s, 'poisoner', [6]);
    finishNight(s);
    toDay(s);
    nominateAndVote(s, 0, 3, [6]);
    expect(s.alerts.join('\n')).not.toMatch(/Butler/);
  });

  it('BUG: the player on the block at the end of the day is executed (or the day cannot end while someone is on the block)', () => {
    const s = day1(G8);
    nominateAndVote(s, 0, 2, [0, 1, 3, 4]);
    expect(s.day!.block?.seat).toBe(2);
    clock.now += 100;
    const r = applyStCommand(s, { type: 'advance_phase', to: 'bedtime' }, { now: clock.now });
    if (r.ok) {
      expect(alive(s, 2), 'player on the block survived the end of the day').toBe(false);
    } else {
      expect(r.ok).toBe(false);
    }
  });

  it('BUG (Mayor variant): someone on the block at 3 alive is not a "no execution" day for the Mayor', () => {
    const s = day1(['imp', 'poisoner', 'mayor', 'empath', 'chef']);
    st(s, { type: 'kill', seat: 3, announce: true });
    st(s, { type: 'kill', seat: 1, announce: true }); // alive: imp, mayor, chef
    nominateAndVote(s, 4, 0, [2, 4]);
    expect(s.day!.block?.seat).toBe(0);
    clock.now += 100;
    applyStCommand(s, { type: 'advance_phase', to: 'bedtime' }, { now: clock.now });
    // Either the Imp was executed (good wins: the Demon died) or the day did not end; never a Mayor win.
    expect(s.result?.reason ?? '').not.toMatch(/Mayor/);
  });
});

describe('audit: Slayer', () => {
  it('Slayer kills the Imp with 3 alive and no Scarlet Woman: good wins (Demon death beats "2 alive")', () => {
    const s = day1(['imp', 'poisoner', 'slayer', 'empath', 'chef']);
    st(s, { type: 'kill', seat: 1, announce: true });
    st(s, { type: 'kill', seat: 3, announce: true });
    act(s, 2, { type: 'slayerShot', targetSeat: 0 });
    expect(s.result).toMatchObject({ winner: 'good' });
  });

  it('Slayer kills the Imp with exactly 5 alive and a healthy Scarlet Woman: she becomes the Imp, the day continues', () => {
    const s = day1(['imp', 'scarlet_woman', 'slayer', 'empath', 'chef', 'monk']);
    st(s, { type: 'kill', seat: 5, announce: true }); // 5 alive
    act(s, 2, { type: 'slayerShot', targetSeat: 0 });
    expect(P(s, 1).character).toBe('imp');
    expect(s.phase).toBe('day');
    // nominations still possible today
    nominateAndVote(s, 3, 4, []);
    expect(s.day!.nominations).toHaveLength(1);
  });

  it('a Drunk "Slayer" shooting the Imp: nothing happens', () => {
    const s = day1(['imp', 'poisoner', 'drunk', 'empath', 'chef'], { drunkBelieves: 'slayer' });
    act(s, 2, { type: 'slayerShot', targetSeat: 0 });
    expect(alive(s, 0)).toBe(true);
  });

  it('a Slayer whose shot was wasted while poisoned cannot shoot again when healthy', () => {
    const s = mkGame(['imp', 'poisoner', 'slayer', 'empath', 'chef', 'monk', 'saint']);
    begin(s);
    act_night(s, 'poisoner', [2]);
    finishNight(s);
    toDay(s);
    act(s, 2, { type: 'slayerShot', targetSeat: 3 });
    st(s, { type: 'execute', seat: null });
    toNight(s);
    finishNight(s);
    toDay(s);
    expect(projectForPlayer(s, 2).you.canSlayerShot).toBe(false);
  });

  it('LOW: a poisoned Recluse cannot register as the Demon, so no "Recluse may register" alert', () => {
    const s = day1(['imp', 'poisoner', 'slayer', 'empath', 'recluse', 'monk', 'chef']);
    st(s, { type: 'set_status', seat: 4, poisoned: true });
    act(s, 2, { type: 'slayerShot', targetSeat: 4 });
    expect(s.alerts.join('\n')).not.toMatch(/Recluse/);
  });
});

describe('audit: Saint / Mayor / Scarlet Woman / victory', () => {
  it('executing a Saint that the ST marked drunk: the game continues', () => {
    const s = day1(['imp', 'poisoner', 'saint', 'empath', 'chef']);
    st(s, { type: 'set_status', seat: 2, drunk: true });
    st(s, { type: 'execute', seat: 2 });
    expect(s.phase).toBe('day');
    expect(alive(s, 2)).toBe(false);
  });

  it('executing an already-dead Saint: no loss', () => {
    const s = day1(['imp', 'poisoner', 'saint', 'empath', 'chef', 'monk']);
    st(s, { type: 'kill', seat: 2, announce: true });
    st(s, { type: 'execute', seat: 2 });
    expect(s.result).toBeNull();
  });

  it('a poisoned Mayor at 3 alive with no execution: no win', () => {
    const s = mkGame(['imp', 'poisoner', 'mayor', 'empath', 'chef']);
    begin(s);
    act_night(s, 'poisoner', [2]);
    finishNight(s);
    toDay(s);
    st(s, { type: 'kill', seat: 3, announce: true });
    st(s, { type: 'kill', seat: 4, announce: true }); // alive: imp, poisoner, mayor (Poisoner must live)
    st(s, { type: 'execute', seat: null });
    st(s, { type: 'advance_phase', to: 'bedtime' });
    expect(s.result).toBeNull();
  });

  it('the Drunk who believes they are the Mayor: no win at 3 alive', () => {
    const s = day1(['imp', 'poisoner', 'drunk', 'empath', 'chef'], { drunkBelieves: 'mayor' });
    st(s, { type: 'kill', seat: 3, announce: true });
    st(s, { type: 'kill', seat: 1, announce: true });
    st(s, { type: 'advance_phase', to: 'night' });
    expect(s.result).toBeNull();
  });

  it('executing the Imp with 3 alive (Imp, Scarlet Woman, good): good wins', () => {
    const s = day1(['imp', 'scarlet_woman', 'chef', 'empath', 'monk']);
    st(s, { type: 'kill', seat: 3, announce: true });
    st(s, { type: 'kill', seat: 4, announce: true });
    st(s, { type: 'execute', seat: 0 });
    expect(s.result).toMatchObject({ winner: 'good' });
  });

  it('a night kill leaving two alive ends the game for evil at once', () => {
    const s = day1(['imp', 'poisoner', 'chef', 'empath', 'monk']);
    st(s, { type: 'execute', seat: 4 });
    toNight(s);
    act_night(s, 'imp', [3]);
    expect(s.phase).toBe('night');
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: null });
    toNight(s);
    act_night(s, 'imp', [2]);
    expect(s.result).toMatchObject({ winner: 'evil' });
    // the reveal publishes everyone's true status
    expect(projectForPlayer(s, 1).players[2]!.alive).toBe(false);
  });

  it('Scarlet Woman (now Imp) is executed later with 5+ alive and no other SW: good wins', () => {
    const s = day1(['imp', 'scarlet_woman', 'chef', 'empath', 'monk', 'saint', 'butler']);
    st(s, { type: 'execute', seat: 0 });
    expect(P(s, 1).character).toBe('imp');
    toNight(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 1 });
    expect(s.result).toMatchObject({ winner: 'good' });
  });
});
