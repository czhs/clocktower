// rules-storyteller (playtest phase): ST correction commands added for game night —
// red herring / Drunk belief changes, revive with ghost vote, undo replaying player actions,
// Poisoner losing her poison on a character change.
import { describe, expect, it } from 'vitest';
import { projectForPlayer, projectForStoryteller } from '../src/index.js';
import { act, act_night, alive, begin, finishNight, mkGame, nominateAndVote, P, st, stErr, toDay, toNight } from './helpers.js';

describe('ST corrections', () => {
  it('set_red_herring: good players only; can be cleared', () => {
    const s = mkGame(['imp', 'poisoner', 'fortune_teller', 'chef', 'empath'], { redHerringSeat: 3 });
    expect(stErr(s, { type: 'set_red_herring', seat: 1 })).toMatch(/good/);
    st(s, { type: 'set_red_herring', seat: 4 });
    expect(s.redHerringSeat).toBe(4);
    expect(projectForStoryteller(s).grimoire[4]!.isRedHerring).toBe(true);
    st(s, { type: 'set_red_herring', seat: null });
    expect(s.redHerringSeat).toBeNull();
  });

  it('set_drunk_belief: only for the Drunk, only Townsfolk; the player is told', () => {
    const s = mkGame(['imp', 'poisoner', 'drunk', 'chef', 'empath'], { drunkBelieves: 'monk' });
    begin(s);
    expect(stErr(s, { type: 'set_drunk_belief', seat: 3, character: 'slayer' })).toMatch(/not the Drunk/);
    expect(stErr(s, { type: 'set_drunk_belief', seat: 2, character: 'saint' })).toMatch(/Townsfolk/);
    st(s, { type: 'set_drunk_belief', seat: 2, character: 'slayer' });
    const v = projectForPlayer(s, 2);
    expect(v.you.role!.character).toBe('slayer');
    expect(v.info.at(-1)!.text).toBe('You are the Slayer.');
    expect(P(s, 2).character).toBe('drunk');
  });

  it('revive can restore a spent ghost vote', () => {
    const s = mkGame(['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint']);
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'kill', seat: 3, announce: true });
    nominateAndVote(s, 2, 1, [3]);
    expect(P(s, 3).ghostVoteAvailable).toBe(false);
    st(s, { type: 'set_alive', seat: 3, alive: true, restoreGhostVote: true });
    expect(alive(s, 3)).toBe(true);
    expect(P(s, 3).ghostVoteAvailable).toBe(true);
  });

  it('undo replays later player actions (answers and votes) on top of the restored state', () => {
    const s = mkGame(['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint']);
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 2, { type: 'nominate', nomineeSeat: 4 });
    const n = s.day!.nominations[0]!;
    st(s, { type: 'start_vote', nominationId: n.id });
    st(s, { type: 'kill', seat: 5, announce: true }); // mistake while the clock runs
    act(s, 3, { type: 'vote', nominationId: n.id, vote: true });
    st(s, { type: 'undo_last' });
    expect(alive(s, 5)).toBe(true);
    expect(s.day!.vote!.hands).toEqual([3]);
  });

  it('changing a living Poisoner into another character ends her poison', () => {
    const s = mkGame(['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint']);
    begin(s);
    act_night(s, 'poisoner', [3]);
    expect(P(s, 3).poisonedBy).toBe('poisoner');
    st(s, { type: 'change_character', seat: 1, character: 'baron', notify: false });
    expect(P(s, 3).poisonedBy).toBeNull();
    finishNight(s);
    toDay(s);
    toNight(s);
    expect(s.phase).toBe('night');
  });
});
