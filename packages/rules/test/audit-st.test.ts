// rules-audit: Storyteller overrides / undo and projection secrecy around star-pass, poison,
// the Drunk and revivals. Failures are listed in docs/rules-audit.md.
import type { CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { projectForPlayer, projectForStoryteller, type GameState } from '../src/index.js';
import { act, act_night, alive, begin, finishNight, hasStep, mkGame, nominateAndVote, P, st, step, toDay, toNight } from './helpers.js';

function toNight2(s: GameState) {
  begin(s);
  finishNight(s);
  toDay(s);
  toNight(s);
}

const G7: CharacterId[] = ['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint', 'butler'];

describe('audit: undo', () => {
  it('undo after a star-pass restores the old Imp (alive) and the Minion', () => {
    const s = mkGame(G7);
    toNight2(s);
    act_night(s, 'imp', [0]);
    expect(P(s, 1).character).toBe('imp');
    st(s, { type: 'undo_last' }); // resolve_step
    expect(alive(s, 0)).toBe(true);
    expect(P(s, 0).character).toBe('imp');
    expect(P(s, 1).character).toBe('poisoner');
    expect(projectForPlayer(s, 1).you.role!.character).toBe('poisoner');
    expect(projectForPlayer(s, 1).info.some((i) => /now the Imp/.test(i.text))).toBe(false);
  });

  it('undo after a Scarlet Woman catch restores the Imp and the Scarlet Woman', () => {
    const s = mkGame(['imp', 'scarlet_woman', 'chef', 'empath', 'monk', 'saint', 'butler']);
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 0 });
    expect(P(s, 1).character).toBe('imp');
    st(s, { type: 'undo_last' });
    expect(alive(s, 0)).toBe(true);
    expect(P(s, 1).character).toBe('scarlet_woman');
    expect(s.day!.executionOccurred).toBe(false);
  });

  it('MEDIUM: the ST\'s undo reverts the ST\'s own last command, not a later player action', () => {
    const s = mkGame(G7);
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'set_nominations_open', open: true });
    st(s, { type: 'kill', seat: 3, announce: true }); // ST mistake
    act(s, 2, { type: 'nominate', nomineeSeat: 4 }); // a player acts in between
    st(s, { type: 'undo_last' });
    expect(alive(s, 3), 'ST undo should revert the ST kill').toBe(true);
    expect(s.day!.nominations).toHaveLength(1);
  });
});

describe('audit: ST corrections', () => {
  it('change_character to the Imp (notified): they act as the Imp from the next night', () => {
    const s = mkGame(G7);
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'change_character', seat: 0, character: 'chef', alignment: 'good', notify: true });
    st(s, { type: 'change_character', seat: 3, character: 'imp', notify: true });
    expect(P(s, 3).alignment).toBe('evil');
    expect(projectForPlayer(s, 3).you.role).toEqual({ character: 'imp', characterType: 'demon', alignment: 'evil' });
    toNight(s);
    expect(step(s, 'imp').seat).toBe(3);
    expect(hasStep(s, 'empath')).toBe(false);
  });

  it('revived player: alive again for nominating/voting; the ST can restore a spent ghost vote', () => {
    const s = mkGame(G7);
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'kill', seat: 3, announce: true });
    nominateAndVote(s, 0, 2, [3]);
    expect(P(s, 3).ghostVoteAvailable).toBe(false);
    st(s, { type: 'set_alive', seat: 3, alive: true });
    expect(projectForPlayer(s, 4).players[3]!.alive).toBe(true);
    expect(projectForPlayer(s, 3).you.canNominate).toBe(true);
    st(s, { type: 'set_ghost_vote', seat: 3, available: true });
    expect(projectForStoryteller(s).grimoire[3]!.ghostVoteAvailable).toBe(true);
  });

  it('killed and revived in the same night: nothing is announced at dawn', () => {
    const s = mkGame(G7);
    toNight2(s);
    act_night(s, 'imp', [3]);
    st(s, { type: 'set_alive', seat: 3, alive: true });
    const before = s.announcements.length;
    toDay(s);
    const texts = s.announcements.slice(before).map((a) => a.text).join('\n');
    expect(texts).not.toMatch(/P4/);
    expect(texts).toMatch(/Nobody died/);
  });
});

describe('audit: secrecy', () => {
  it('a star-pass changes nothing in a good player\'s view until dawn; then only the death is public', () => {
    const s = mkGame(G7);
    toNight2(s);
    const before = JSON.stringify(projectForPlayer(s, 3));
    act_night(s, 'imp', [0]);
    expect(JSON.stringify(projectForPlayer(s, 3))).toBe(before);
    finishNight(s);
    toDay(s);
    const v = projectForPlayer(s, 3);
    expect(v.players[0]!.alive).toBe(false);
    expect(JSON.stringify(v)).not.toMatch(/imp|Imp/);
  });

  it('the new Imp learns it at once; their view never shows the old Imp\'s character', () => {
    const s = mkGame(G7);
    toNight2(s);
    act_night(s, 'imp', [0]);
    const v = projectForPlayer(s, 1);
    expect(v.you.role!.character).toBe('imp');
    expect(v.players[0]!.alive).toBe(true); // still unpublished
  });

  it('a poisoned player\'s own view has no trace of the poison', () => {
    const s = mkGame(G7);
    toNight2(s);
    const before = JSON.stringify(projectForPlayer(s, 3));
    act_night(s, 'poisoner', [3]);
    expect(JSON.stringify(projectForPlayer(s, 3))).toBe(before);
  });

  it('a Drunk "Monk" choosing a player leaves no trace in the target\'s view', () => {
    const s = mkGame(['imp', 'poisoner', 'drunk', 'chef', 'empath', 'saint', 'butler'], { drunkBelieves: 'monk' });
    toNight2(s);
    const before = JSON.stringify(projectForPlayer(s, 3));
    act_night(s, 'monk', [3]);
    expect(JSON.stringify(projectForPlayer(s, 3))).toBe(before);
  });

  it('final reveal: true characters (Drunk, star-passed Imp); the Drunk\'s own role stays their belief', () => {
    const s = mkGame(['imp', 'poisoner', 'drunk', 'chef', 'empath', 'saint', 'butler'], { drunkBelieves: 'monk' });
    toNight2(s);
    act_night(s, 'imp', [0]);
    st(s, { type: 'declare_winner', winner: 'evil', reason: 'test' });
    const v = projectForPlayer(s, 2);
    const byseat = Object.fromEntries(v.result!.reveal.map((r) => [r.seat, r.character]));
    expect(byseat[0]).toBe('imp');
    expect(byseat[1]).toBe('imp');
    expect(byseat[2]).toBe('drunk');
    expect(v.you.role!.character).toBe('monk');
  });

  it('evil info: the Minion learns nothing about who the new Imp is after a star-pass (ST may tell them)', () => {
    const s = mkGame(['imp', 'poisoner', 'spy', 'chef', 'empath', 'monk', 'saint', 'butler']);
    begin(s);
    st(s, { type: 'resolve_step', stepId: step(s, 'minion_info').id });
    finishNight(s);
    toDay(s);
    toNight(s);
    act_night(s, 'imp', [0], { starpassSeat: 1 });
    const spy = projectForPlayer(s, 2);
    expect(spy.info.some((i) => /now the Imp/.test(i.text))).toBe(false);
  });
});
