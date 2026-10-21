// What is random and what is the Storyteller's call.
//
//   Random:      the characters dealt to the seats (Townsfolk, Outsiders except the Drunk, Minions, Demons).
//   Storyteller: who the Drunk is (and what they believe), which characters may be drawn at all,
//                the Demon's bluffs, the red herring, and every piece of information a player gets.
//   Neither:     voting is deterministic.
//
// Automatic games have no Storyteller, so there (and only there) the Drunk is still drawn at random.
import { CHARACTER_INFO, STORYLINES, storylinePlayerCounts, type CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { countTypes, setupCounts, validateAssignment, type GameState } from '../src/index.js';
import { newGame, st, stErr } from './helpers.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 3);
const chars = (s: GameState) => s.players.map((p) => p.character);
const automatic = (s: GameState) => {
  s.adjudicator = {};
  return s;
};

describe('random setup: the Drunk is the Storyteller’s', () => {
  it('a Storyteller’s random deal never draws the Drunk, and stays a legal standard setup', () => {
    for (let n = 5; n <= 15; n++)
      for (const seed of SEEDS) {
        const s = newGame(n, seed);
        st(s, { type: 'random_setup' });
        expect(chars(s), `n=${n} seed=${seed}`).not.toContain('drunk');
        const v = validateAssignment(
          s.players.map((p) => p.seat),
          { bySeat: new Map(s.players.map((p) => [p.seat, p.character])), drunkBelieves: null, redHerringSeat: s.redHerringSeat, demonBluffs: s.demonBluffs },
        );
        expect(v, `n=${n} seed=${seed}`).toEqual({ errors: [], warnings: [] });
      }
  });

  it('the Storyteller places the Drunk on the seat they chose, believing what they chose', () => {
    for (let n = 7; n <= 15; n++)
      for (const seed of SEEDS.slice(0, 10)) {
        const s = newGame(n, seed);
        st(s, { type: 'random_setup', drunkSeat: 2, drunkBelieves: 'empath' });
        expect(s.players.filter((p) => p.character === 'drunk').map((p) => p.seat)).toEqual([2]);
        expect(s.players[2]!.believedCharacter).toBe('empath');
        expect(chars(s)).not.toContain('empath');
        const counts = countTypes(chars(s));
        expect(counts).toEqual(setupCounts(n, chars(s)));
      }
  });

  it('a Drunk belief needs a Drunk seat; a Drunk needs an Outsider slot (or a Baron to make one)', () => {
    expect(stErr(newGame(7), { type: 'random_setup', drunkBelieves: 'empath' })).toMatch(/which player is the Drunk/);
    expect(stErr(newGame(7), { type: 'random_setup', drunkSeat: 1, drunkBelieves: 'imp' })).toMatch(/Townsfolk/);
    // 5 players have no Outsider unless a Baron is drawn: the draw finds one.
    const s = newGame(5, 11);
    st(s, { type: 'random_setup', drunkSeat: 0 });
    expect(s.players[0]!.character).toBe('drunk');
    expect(chars(s)).toContain('baron');
  });

  it('an automatic game (no Storyteller) still draws the Drunk at random', () => {
    let drunks = 0;
    for (const seed of SEEDS) {
      const s = automatic(newGame(10, seed));
      st(s, { type: 'random_setup' });
      if (chars(s).includes('drunk')) drunks++;
    }
    expect(drunks).toBeGreaterThan(0);
  });
});

describe('random setup: the Storyteller removes characters from the draw', () => {
  it('removed characters never appear', () => {
    const exclude: CharacterId[] = ['baron', 'virgin', 'slayer', 'saint', 'mayor'];
    for (let n = 5; n <= 15; n++)
      for (const seed of SEEDS.slice(0, 15)) {
        const s = newGame(n, seed);
        st(s, { type: 'random_setup', exclude });
        for (const c of exclude) expect(chars(s), `n=${n}`).not.toContain(c);
      }
  });

  it('removing too much is refused with a clear reason; nothing is dealt', () => {
    const s = newGame(7);
    expect(stErr(s, { type: 'random_setup', exclude: ['poisoner', 'spy', 'scarlet_woman', 'baron'] })).toMatch(/Only 0 Minions left/);
    expect(stErr(s, { type: 'random_setup', exclude: ['imp'] })).toMatch(/Demons left/);
    expect(s.assigned).toBe(false);
    expect(stErr(s, { type: 'random_setup', exclude: ['drunk'], drunkSeat: 0 })).toMatch(/removed from the draw/);
  });
});

describe('storylines and bags: the RNG never picks the Drunk', () => {
  it('a storyline that does not name the Drunk never deals one in a Storyteller’s game', () => {
    for (const def of STORYLINES.filter((d) => ![...d.core, ...d.prefer].includes('drunk')))
      for (const n of storylinePlayerCounts(def, CHARACTER_INFO))
        for (const seed of SEEDS.slice(0, 8)) {
          const s = newGame(n, seed);
          st(s, { type: 'deal_preset', storyline: def.id, seed });
          expect(chars(s), `${def.id} n=${n}`).not.toContain('drunk');
        }
  });

  it('a storyline that names the Drunk asks who it is', () => {
    const s = newGame(7);
    expect(stErr(s, { type: 'deal_preset', storyline: 'drunk-bell-tower' })).toMatch(/which player is the Drunk/);
    st(s, { type: 'deal_preset', storyline: 'drunk-bell-tower', drunkSeat: 4 });
    expect(s.players[4]!.character).toBe('drunk');
  });
});

describe('the Storyteller sets the Demon’s bluffs', () => {
  it('replaces the bluffs; refuses evil, in-play and duplicate characters', () => {
    const s = newGame(7);
    expect(stErr(s, { type: 'set_demon_bluffs', bluffs: ['mayor'] })).toMatch(/Assign characters first/);
    st(s, { type: 'random_setup' });
    const notInPlay = (['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortune_teller', 'undertaker', 'monk', 'ravenkeeper', 'virgin', 'slayer', 'soldier', 'mayor'] as CharacterId[]).filter(
      (c) => !chars(s).includes(c),
    );
    const inPlay = chars(s).find((c) => CHARACTER_INFO[c].alignment === 'good')!;
    expect(stErr(s, { type: 'set_demon_bluffs', bluffs: ['poisoner'] })).toMatch(/not a good character/);
    expect(stErr(s, { type: 'set_demon_bluffs', bluffs: [inPlay] })).toMatch(/is in play/);
    expect(stErr(s, { type: 'set_demon_bluffs', bluffs: [notInPlay[0]!, notInPlay[0]!] })).toMatch(/Duplicate/);
    st(s, { type: 'set_demon_bluffs', bluffs: notInPlay.slice(0, 3) });
    expect(s.demonBluffs).toEqual(notInPlay.slice(0, 3));
  });
});
