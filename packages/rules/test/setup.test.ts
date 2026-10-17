import { CHARACTER_INFO, charactersOfScript, type CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import {
  countTypes,
  mulberry32,
  randomAssignment,
  SETUP_TABLE,
  setupCounts,
  validateAssignment,
  ROLES,
  FIRST_NIGHT_ORDER,
  OTHER_NIGHT_ORDER,
} from '../src/index.js';
import { mkGame, newGame, st, stErr } from './helpers.js';

const TABLE: Record<number, [number, number, number, number]> = {
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};

describe('setup table', () => {
  it('matches the Trouble Brewing distribution for 5-15 players', () => {
    for (let n = 5; n <= 15; n++) {
      const [t, o, m, d] = TABLE[n]!;
      expect(SETUP_TABLE[n]).toEqual({ townsfolk: t, outsiders: o, minions: m, demons: d });
      expect(setupCounts(n, true)).toEqual({ townsfolk: t - 2, outsiders: o + 2, minions: m, demons: d });
    }
    expect(() => setupCounts(4)).toThrow();
    expect(() => setupCounts(16)).toThrow();
  });

  it('random setup is legal for every player count (many seeds)', () => {
    for (let n = 5; n <= 15; n++) {
      for (let seed = 1; seed <= 60; seed++) {
        const seats = Array.from({ length: n }, (_, i) => i);
        const a = randomAssignment(seats, mulberry32(seed * 101 + n));
        const chars = [...a.bySeat.values()];
        expect(new Set(chars).size).toBe(n);
        const c = countTypes(chars);
        expect(c).toEqual(setupCounts(n, chars.includes('baron')));
        expect(validateAssignment(seats, a)).toEqual({ errors: [], warnings: [] });
        if (chars.includes('drunk')) {
          expect(a.drunkBelieves).not.toBeNull();
          expect(CHARACTER_INFO[a.drunkBelieves!].type).toBe('townsfolk');
          expect(chars).not.toContain(a.drunkBelieves);
        } else expect(a.drunkBelieves).toBeNull();
        if (chars.includes('fortune_teller') || a.drunkBelieves === 'fortune_teller') {
          expect(a.redHerringSeat).not.toBeNull();
          expect(CHARACTER_INFO[a.bySeat.get(a.redHerringSeat!)!].alignment).toBe('good');
        }
        expect(a.demonBluffs).toHaveLength(3);
        for (const b of a.demonBluffs) {
          expect(CHARACTER_INFO[b].alignment).toBe('good');
          expect(chars).not.toContain(b);
          expect(b).not.toBe(a.drunkBelieves);
        }
      }
    }
  });

  it('baron appears in random setups and shifts the distribution', () => {
    let sawBaron = false;
    for (let seed = 1; seed < 200 && !sawBaron; seed++) {
      const a = randomAssignment([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], mulberry32(seed));
      const chars = [...a.bySeat.values()];
      if (chars.includes('baron')) {
        sawBaron = true;
        expect(countTypes(chars)).toEqual({ townsfolk: 5, outsiders: 2, minions: 2, demons: 1 });
      }
    }
    expect(sawBaron).toBe(true);
  });

  it('validates manual assignments', () => {
    const seats = [0, 1, 2, 3, 4];
    const ok = (chars: CharacterId[], extra: Partial<Parameters<typeof validateAssignment>[1]> = {}) =>
      validateAssignment(seats, {
        bySeat: new Map(chars.map((c, i) => [i, c])),
        drunkBelieves: null,
        redHerringSeat: null,
        demonBluffs: [],
        ...extra,
      });
    expect(ok(['imp', 'poisoner', 'chef', 'empath', 'monk']).errors).toEqual([]);
    expect(ok(['imp', 'poisoner', 'chef', 'empath', 'monk']).warnings).toEqual([]);
    expect(ok(['imp', 'imp', 'chef', 'empath', 'monk']).errors.join()).toMatch(/Duplicate/);
    expect(ok(['chef', 'poisoner', 'librarian', 'empath', 'monk']).errors.join()).toMatch(/one Demon/);
    expect(ok(['imp', 'poisoner', 'saint', 'empath', 'monk']).warnings.join()).toMatch(/differs/);
    expect(ok(['imp', 'poisoner', 'drunk', 'empath', 'monk']).errors.join()).toMatch(/Drunk needs/);
    expect(ok(['imp', 'poisoner', 'drunk', 'empath', 'monk'], { drunkBelieves: 'empath' }).errors.join()).toMatch(/not in play/);
    expect(ok(['imp', 'poisoner', 'drunk', 'empath', 'monk'], { drunkBelieves: 'saint' }).errors.join()).toMatch(/Townsfolk/);
    expect(ok(['imp', 'poisoner', 'chef', 'empath', 'monk'], { redHerringSeat: 1 }).errors.join()).toMatch(/good/);
    expect(ok(['imp', 'poisoner', 'chef', 'empath', 'monk'], { demonBluffs: ['chef'] }).errors.join()).toMatch(/in play/);
    expect(ok(['imp', 'poisoner', 'chef', 'empath', 'monk'], { demonBluffs: ['spy'] }).errors.join()).toMatch(/not a good/);
  });

  it('assign_characters rejects nonstandard distributions unless allowed; fills drunk/herring/bluffs', () => {
    const s = newGame(5);
    const cmd = {
      type: 'assign_characters' as const,
      assignments: (['imp', 'poisoner', 'saint', 'empath', 'monk'] as CharacterId[]).map((character, seat) => ({ seat, character })),
      demonBluffs: [],
    };
    expect(stErr(s, cmd)).toMatch(/allowNonstandard/);
    st(s, { ...cmd, allowNonstandard: true });
    expect(s.assigned).toBe(true);
    const s2 = newGame(5);
    st(s2, {
      type: 'assign_characters',
      assignments: (['imp', 'poisoner', 'drunk', 'fortune_teller', 'monk'] as CharacterId[]).map((character, seat) => ({ seat, character })),
      demonBluffs: [],
      allowNonstandard: true,
    });
    const drunk = s2.players[2]!;
    expect(drunk.character).toBe('drunk');
    expect(CHARACTER_INFO[drunk.believedCharacter].type).toBe('townsfolk');
    expect(['imp', 'poisoner', 'fortune_teller', 'monk']).not.toContain(drunk.believedCharacter);
    expect(s2.redHerringSeat).not.toBeNull();
    expect(s2.players[s2.redHerringSeat!]!.alignment).toBe('good');
    expect(s2.demonBluffs).toHaveLength(3);
  });

  it('random_setup command assigns roles but players see nothing until the first night', () => {
    const s = newGame(7, 3);
    st(s, { type: 'random_setup' });
    expect(s.assigned).toBe(true);
    expect(s.rolesRevealed).toBe(false);
    st(s, { type: 'begin_first_night' });
    expect(s.phase).toBe('first_night');
    expect(s.rolesRevealed).toBe(true);
  });

  it('begin_first_night requires characters', () => {
    const s = newGame(5);
    expect(stErr(s, { type: 'begin_first_night' })).toMatch(/Assign/);
  });

  it('defines every Trouble Brewing character as a modular plugin with night orders', () => {
    // ROLES spans every script now; the TB pool is still exactly 22 and its order is unchanged.
    expect(charactersOfScript('trouble-brewing')).toHaveLength(22);
    for (const c of charactersOfScript('trouble-brewing')) expect(ROLES[c]).toBeDefined();
    expect(FIRST_NIGHT_ORDER).toEqual([
      'poisoner',
      'washerwoman',
      'librarian',
      'investigator',
      'chef',
      'empath',
      'fortune_teller',
      'butler',
      'spy',
    ]);
    expect(OTHER_NIGHT_ORDER).toEqual([
      'poisoner',
      'monk',
      'imp',
      'ravenkeeper',
      'empath',
      'fortune_teller',
      'undertaker',
      'butler',
      'spy',
    ]);
  });

  it('mkGame helper sets believed character for the drunk', () => {
    const s = mkGame(['imp', 'poisoner', 'drunk', 'empath', 'monk'], { drunkBelieves: 'chef' });
    expect(s.players[2]!.believedCharacter).toBe('chef');
  });
});
