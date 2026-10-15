// rules-audit: setup / distribution / first-night evil info. Each test encodes the correct
// Trouble Brewing behaviour; failures are engine bugs listed in docs/rules-audit.md.
import { CHARACTER_INFO, type CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import {
  countTypes,
  mulberry32,
  projectForPlayer,
  randomAssignment,
  SETUP_TABLE,
  setupCounts,
  validateAssignment,
} from '../src/index.js';
import { begin, hasStep, mkGame, newGame, st, step } from './helpers.js';

const seatsOf = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('audit: setup distribution', () => {
  it('random setup with a Baron has +2 Outsiders / -2 Townsfolk at every player count 5-15', () => {
    for (let n = 5; n <= 15; n++) {
      let found = false;
      for (let seed = 1; seed <= 3000 && !found; seed++) {
        const a = randomAssignment(seatsOf(n), mulberry32(seed * 7919 + n));
        const chars = [...a.bySeat.values()];
        if (!chars.includes('baron')) continue;
        found = true;
        const base = SETUP_TABLE[n]!;
        expect(countTypes(chars), `n=${n}`).toEqual({
          townsfolk: base.townsfolk - 2,
          outsiders: base.outsiders + 2,
          minions: base.minions,
          demons: 1,
        });
        expect(validateAssignment(seatsOf(n), a).warnings).toEqual([]);
      }
      expect(found, `no Baron setup found for n=${n}`).toBe(true);
    }
  });

  it('a manual Baron setup with the Baron-adjusted counts is standard (no allowNonstandard needed)', () => {
    const s = newGame(7);
    st(s, {
      type: 'assign_characters',
      assignments: (['imp', 'baron', 'chef', 'empath', 'monk', 'saint', 'recluse'] as CharacterId[]).map((character, seat) => ({
        seat,
        character,
      })),
      demonBluffs: [],
    });
    expect(s.assigned).toBe(true);
  });

  it('random demon bluffs are never the Drunk, never in play and never the Drunk\'s believed Townsfolk', () => {
    for (let n = 5; n <= 15; n++) {
      for (let seed = 1; seed <= 40; seed++) {
        const a = randomAssignment(seatsOf(n), mulberry32(seed * 31 + n * 1000));
        const chars = [...a.bySeat.values()];
        for (const b of a.demonBluffs) {
          expect(b).not.toBe('drunk');
          expect(chars).not.toContain(b);
          expect(CHARACTER_INFO[b].alignment).toBe('good');
          if (a.drunkBelieves) expect(b).not.toBe(a.drunkBelieves);
        }
      }
    }
  });

  it('the red herring may be any good player: the Drunk, the Recluse or the Fortune Teller themself', () => {
    const seats = seatsOf(7);
    const chars: CharacterId[] = ['imp', 'poisoner', 'fortune_teller', 'drunk', 'recluse', 'chef', 'empath'];
    const base = { bySeat: new Map(chars.map((c, i) => [i, c] as const)), drunkBelieves: 'monk' as CharacterId, demonBluffs: [] };
    for (const rh of [2, 3, 4]) expect(validateAssignment(seats, { ...base, redHerringSeat: rh }).errors).toEqual([]);
    expect(validateAssignment(seats, { ...base, redHerringSeat: 1 }).errors.join()).toMatch(/good/);
  });

  it('the Drunk is told their believed Townsfolk (good, townsfolk type) from the first night on', () => {
    const s = mkGame(['imp', 'poisoner', 'drunk', 'chef', 'empath', 'monk', 'saint'], { drunkBelieves: 'virgin' });
    expect(projectForPlayer(s, 2).you.role).toBeNull();
    begin(s);
    expect(projectForPlayer(s, 2).you.role).toEqual({ character: 'virgin', characterType: 'townsfolk', alignment: 'good' });
  });
});

describe('audit: minion / demon info', () => {
  it('6 players: no evil info steps; 7 players: both steps', () => {
    const s6 = mkGame(['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint']);
    begin(s6);
    expect(hasStep(s6, 'minion_info')).toBe(false);
    expect(hasStep(s6, 'demon_info')).toBe(false);
    const s7 = mkGame(['imp', 'poisoner', 'chef', 'empath', 'monk', 'washerwoman', 'investigator']);
    begin(s7);
    expect(hasStep(s7, 'minion_info')).toBe(true);
    expect(hasStep(s7, 'demon_info')).toBe(true);
  });

  it('13 players, 3 Minions: each Minion learns the Demon and the other two Minions; the Demon learns all three', () => {
    const chars: CharacterId[] = [
      'imp', 'poisoner', 'spy', 'baron', 'chef', 'empath', 'monk', 'washerwoman', 'investigator', 'saint', 'recluse', 'butler', 'drunk',
    ];
    const s = mkGame(chars, { drunkBelieves: 'mayor' });
    begin(s);
    st(s, { type: 'resolve_step', stepId: step(s, 'minion_info').id });
    st(s, { type: 'resolve_step', stepId: step(s, 'demon_info').id });
    for (const m of [1, 2, 3]) {
      const v = projectForPlayer(s, m);
      expect(v.you.evilTeam).toEqual({ demonSeats: [0], minionSeats: [1, 2, 3], bluffs: [] });
    }
    const d = projectForPlayer(s, 0).you.evilTeam!;
    expect(d.minionSeats).toEqual([1, 2, 3]);
    expect(d.bluffs).toHaveLength(3);
    for (const b of d.bluffs) {
      expect(chars).not.toContain(b);
      expect(b).not.toBe('mayor'); // the Drunk's believed Townsfolk
    }
  });
});

describe('audit: setupCounts sanity', () => {
  it('Baron never asks for more than the 4 TB Outsiders', () => {
    for (let n = 5; n <= 15; n++) expect(setupCounts(n, true).outsiders).toBeLessThanOrEqual(4);
  });
});
