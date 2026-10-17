// (v2.2) Preset storylines + bag dealing: every storyline is a legal standard setup for every count
// it supports, deterministic per seed, and the deal commands keep players' views clean.
import { CHARACTER_INFO, charactersOfScript, STORYLINES, STORYLINE_IDS, buildStorylineBag, formatCounts, storylinePlayerCounts, storylineProblem, tbCounts, type CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { countTypes, dealBag, mulberry32, presetAssignment, projectForPlayer, projectForStoryteller, setupCounts, storylineBag, validateAssignment } from '../src/index.js';
import { newGame, st, stErr } from './helpers.js';

const seatsOf = (n: number) => Array.from({ length: n }, (_, i) => i);
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);

describe('storyline catalogue', () => {
  it('has unique ids, titles and blurbs; ids match STORYLINE_IDS', () => {
    expect(STORYLINES.map((s) => s.id)).toEqual([...STORYLINE_IDS]);
    expect(new Set(STORYLINES.map((s) => s.title)).size).toBe(STORYLINES.length);
    for (const s of STORYLINES) {
      expect(s.blurb.length).toBeGreaterThan(20);
      expect(s.blurb.length).toBeLessThan(120);
      expect(s.core).toContain('imp');
      for (const c of [...s.core, ...s.prefer, ...s.avoid, ...(s.drunkBelieves ?? [])]) expect(CHARACTER_INFO[c], c).toBeDefined();
      for (const c of s.core) expect(s.avoid).not.toContain(c);
    }
  });

  it('declares the supported player counts (documented in docs/auto-storyteller.md)', () => {
    const table = Object.fromEntries(STORYLINES.map((s) => [s.id, formatCounts(storylinePlayerCounts(s, CHARACTER_INFO))]));
    expect(table).toEqual({
      'beginners-lantern': '5-12',
      'classic-night': '5-15',
      'poisoned-well': '5-15',
      'town-of-liars': '6, 8-15',
      'saints-gambit': '5-15',
      'drunk-bell-tower': '5-15',
      'outsiders-gate': '5-15',
    });
    // a beginner storyline covers the usual small groups
    expect(storylinePlayerCounts(STORYLINES[0]!, CHARACTER_INFO)).toEqual(expect.arrayContaining([5, 6, 7, 8, 9, 10]));
  });

  it('every storyline x supported count x 60 seeds: standard counts, no duplicates, core in, avoid out, one Imp', () => {
    for (const def of STORYLINES) {
      for (const n of storylinePlayerCounts(def, CHARACTER_INFO)) {
        for (const seed of SEEDS) {
          const bag = buildStorylineBag(def, n, mulberry32(seed), CHARACTER_INFO);
          const where = `${def.id} n=${n} seed=${seed}`;
          expect(bag, where).toHaveLength(n);
          expect(new Set(bag).size, where).toBe(n);
          const counts = countTypes(bag);
          expect(counts, where).toEqual(setupCounts(n, bag.includes('baron'))); // Baron: +2 Outsiders / -2 Townsfolk
          expect(bag.filter((c) => c === 'imp'), where).toHaveLength(1);
          for (const c of def.core) expect(bag, where).toContain(c);
          for (const c of def.avoid) expect(bag, where).not.toContain(c);
        }
      }
    }
  });

  it('unsupported counts are refused with a reason; out-of-range counts too', () => {
    const liars = STORYLINES.find((s) => s.id === 'town-of-liars')!;
    expect(storylineProblem(liars, 5, CHARACTER_INFO)).toMatch(/Minion|Outsider/);
    expect(storylineProblem(liars, 7, CHARACTER_INFO)).toMatch(/Minion|Outsider/);
    expect(() => buildStorylineBag(liars, 7, mulberry32(1), CHARACTER_INFO)).toThrow(/A Town of Liars/);
    const lantern = STORYLINES.find((s) => s.id === 'beginners-lantern')!;
    expect(storylineProblem(lantern, 13, CHARACTER_INFO)).toMatch(/Minions/);
    expect(storylineProblem(lantern, 4, CHARACTER_INFO)).toMatch(/5-15/);
    expect(storylineProblem(lantern, 16, CHARACTER_INFO)).toMatch(/5-15/);
  });

  it('the Baron rule: Outsiders at the Gate always has two extra Outsiders; the Saint pulls in a Baron when there is no Outsider slot', () => {
    const gate = STORYLINES.find((s) => s.id === 'outsiders-gate')!;
    for (let n = 5; n <= 15; n++) {
      const bag = buildStorylineBag(gate, n, mulberry32(n), CHARACTER_INFO);
      expect(countTypes(bag).outsiders).toBe(tbCounts(n)!.outsiders + 2);
    }
    const saint = STORYLINES.find((s) => s.id === 'saints-gambit')!;
    for (const n of [5, 7, 10, 13]) expect(buildStorylineBag(saint, n, mulberry32(n), CHARACTER_INFO)).toContain('baron');
    for (const n of [6, 8, 9]) {
      // a free Outsider slot: the Baron is not forced (the only Minion is filled from the preferred pool)
      expect(buildStorylineBag(saint, n, mulberry32(3), CHARACTER_INFO)).toContain('scarlet_woman');
    }
  });

  it('seeds are deterministic and different seeds give different bags', () => {
    for (const def of STORYLINES) {
      const a = buildStorylineBag(def, 10, mulberry32(42), CHARACTER_INFO);
      expect(buildStorylineBag(def, 10, mulberry32(42), CHARACTER_INFO)).toEqual(a);
    }
    const classic = STORYLINES.find((s) => s.id === 'classic-night')!;
    const bags = new Set(SEEDS.map((seed) => buildStorylineBag(classic, 9, mulberry32(seed), CHARACTER_INFO).slice().sort().join()));
    expect(bags.size).toBeGreaterThan(5);
  });
});

describe('dealing a bag onto the seats', () => {
  it('presetAssignment: legal, completed (Drunk belief from the storyline, red herring, 3 bluffs), deterministic per seed', () => {
    for (const def of STORYLINES) {
      for (const n of storylinePlayerCounts(def, CHARACTER_INFO)) {
        const { assignment } = presetAssignment(seatsOf(n), def.id, mulberry32(n * 31));
        const v = validateAssignment(seatsOf(n), assignment);
        expect(v.errors, `${def.id} ${n}`).toEqual([]);
        expect(v.warnings, `${def.id} ${n}`).toEqual([]);
        expect(assignment.demonBluffs).toHaveLength(3);
        const chars = [...assignment.bySeat.values()];
        if (chars.includes('fortune_teller')) expect(assignment.redHerringSeat).not.toBeNull();
        if (chars.includes('drunk')) {
          expect(assignment.drunkBelieves).not.toBeNull();
          expect(chars).not.toContain(assignment.drunkBelieves);
          if (def.id === 'drunk-bell-tower') expect(def.drunkBelieves).toContain(assignment.drunkBelieves);
        }
      }
    }
    const a = presetAssignment(seatsOf(9), 'poisoned-well', mulberry32(5)).assignment;
    const b = presetAssignment(seatsOf(9), 'poisoned-well', mulberry32(5)).assignment;
    expect([...a.bySeat]).toEqual([...b.bySeat]);
  });

  it('dealBag actually shuffles: the same bag lands on different seats across seeds', () => {
    const bag: CharacterId[] = ['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint', 'slayer'];
    const impSeats = new Set(SEEDS.map((seed) => [...dealBag(seatsOf(7), bag, mulberry32(seed)).assignment.bySeat].find(([, c]) => c === 'imp')![0]));
    expect(impSeats.size).toBeGreaterThanOrEqual(6);
  });

  it('dealBag validates: size, duplicates, demon; nonstandard is a warning', () => {
    expect(() => dealBag(seatsOf(5), ['imp', 'poisoner', 'chef', 'empath'], mulberry32(1))).toThrow(/4 characters for 5/);
    expect(() => dealBag(seatsOf(5), ['imp', 'poisoner', 'chef', 'chef', 'monk'], mulberry32(1))).toThrow(/Duplicate/);
    expect(() => dealBag(seatsOf(5), ['poisoner', 'spy', 'chef', 'empath', 'monk'], mulberry32(1))).toThrow(/Demon/);
    expect(dealBag(seatsOf(5), ['imp', 'poisoner', 'saint', 'empath', 'monk'], mulberry32(1)).validation.warnings.join()).toMatch(/differs from the standard/);
  });

  it('storylineBag: unknown id is refused', () => {
    expect(() => storylineBag('nope', 7, mulberry32(1))).toThrow(/Unknown storyline/);
  });
});

describe('deal_preset / deal_bag commands', () => {
  it('deal_preset assigns a legal setup, records the storyline (ST-only) and is reproducible with a seed', () => {
    const s = newGame(8, 2);
    st(s, { type: 'deal_preset', storyline: 'saints-gambit', seed: 99 });
    expect(s.assigned).toBe(true);
    expect(s.deal).toEqual({ method: 'storyline', storyline: 'saints-gambit' });
    expect(s.players.map((p) => p.character)).toContain('saint');
    const s2 = newGame(8, 777);
    st(s2, { type: 'deal_preset', storyline: 'saints-gambit', seed: 99 });
    expect(s2.players.map((p) => p.character)).toEqual(s.players.map((p) => p.character));
    const stv = projectForStoryteller(s);
    expect(stv.deal).toEqual({ method: 'storyline', storyline: 'saints-gambit' });
    expect(stv.log.at(-1)?.text).toMatch(/Saint's Gambit/);
    for (const p of s.players) {
      const json = JSON.stringify(projectForPlayer(s, p.seat));
      expect(json).not.toMatch(/saints-gambit|Saint's Gambit|storyline/i);
      expect(json).not.toMatch(/"deal"/);
    }
    // re-deal + undo
    st(s, { type: 'random_setup' });
    expect(s.deal).toEqual({ method: 'random' });
    st(s, { type: 'undo_last' });
    expect(s.deal).toEqual({ method: 'storyline', storyline: 'saints-gambit' });
  });

  it('deal_preset refuses an unsupported count and outside setup', () => {
    const s = newGame(7);
    expect(stErr(s, { type: 'deal_preset', storyline: 'town-of-liars' })).toMatch(/Town of Liars/);
    expect(s.assigned).toBe(false);
    st(s, { type: 'deal_preset', storyline: 'classic-night' });
    st(s, { type: 'begin_first_night' });
    expect(stErr(s, { type: 'deal_preset', storyline: 'classic-night' })).toMatch(/not allowed|setup/i);
  });

  it('deal_bag shuffles the Storyteller bag; validates size / nonstandard / drunk belief', () => {
    const bag: CharacterId[] = ['imp', 'baron', 'drunk', 'saint', 'empath', 'chef', 'monk'];
    const s = newGame(7, 4);
    expect(stErr(s, { type: 'deal_bag', characters: bag.slice(0, 6) })).toMatch(/6 characters for 7/);
    st(s, { type: 'deal_bag', characters: bag, drunkBelieves: 'fortune_teller', demonBluffs: ['mayor'] });
    expect(s.players.map((p) => p.character).sort()).toEqual([...bag].sort());
    expect(s.players.find((p) => p.character === 'drunk')!.believedCharacter).toBe('fortune_teller');
    expect(s.demonBluffs[0]).toBe('mayor');
    expect(s.demonBluffs).toHaveLength(3);
    expect(s.deal).toEqual({ method: 'bag' });
    const s2 = newGame(5);
    const odd: CharacterId[] = ['imp', 'poisoner', 'saint', 'empath', 'monk'];
    expect(stErr(s2, { type: 'deal_bag', characters: odd })).toMatch(/allowNonstandard/);
    st(s2, { type: 'deal_bag', characters: odd, allowNonstandard: true });
    expect(projectForStoryteller(s2).alerts.join()).toMatch(/differs/);
    const s3 = newGame(7);
    expect(stErr(s3, { type: 'deal_bag', characters: bag, drunkBelieves: 'empath' })).toMatch(/not in the bag/);
    expect(stErr(s3, { type: 'deal_bag', characters: ['imp', 'baron', 'recluse', 'saint', 'empath', 'chef', 'monk'], drunkBelieves: 'mayor' })).toMatch(/no Drunk/);
  });

  it('deal_bag on another script draws bluffs and beliefs from that script and needs no allowNonstandard', () => {
    const bmr = charactersOfScript('bad-moon-rising');
    const bag: CharacterId[] = ['zombuul', 'godfather', 'lunatic', 'grandmother', 'sailor', 'chambermaid', 'exorcist'];
    for (const seed of SEEDS.slice(0, 10)) {
      const s = newGame(7, seed, 'bad-moon-rising');
      st(s, { type: 'deal_bag', characters: bag, seed });
      const lunatic = s.players.find((p) => p.character === 'lunatic')!;
      expect(CHARACTER_INFO[lunatic.believedCharacter].type).toBe('demon');
      expect(bmr).toContain(lunatic.believedCharacter);
      expect(s.demonBluffs).toHaveLength(3);
      for (const b of s.demonBluffs) expect(bmr, b).toContain(b);
    }
  });

  it('a custom script fills in a Drunk belief and bluffs instead of failing', () => {
    const chars: CharacterId[] = ['imp', 'baron', 'drunk', 'saint', 'chef', 'empath', 'grandmother'];
    const s = newGame(7, 1, 'custom');
    st(s, { type: 'assign_characters', assignments: chars.map((character, seat) => ({ seat, character })), demonBluffs: [] });
    const drunk = s.players.find((p) => p.character === 'drunk')!;
    expect(CHARACTER_INFO[drunk.believedCharacter].type).toBe('townsfolk');
    expect(chars).not.toContain(drunk.believedCharacter);
    expect(s.demonBluffs).toHaveLength(3);
    for (const b of s.demonBluffs) expect(CHARACTER_INFO[b].alignment).toBe('good');
  });

  it('assign_characters records a manual deal; prepare is refused by the engine', () => {
    const s = newGame(5);
    st(s, { type: 'assign_characters', assignments: (['imp', 'poisoner', 'chef', 'empath', 'monk'] as CharacterId[]).map((character, seat) => ({ seat, character })), demonBluffs: [] });
    expect(s.deal).toEqual({ method: 'manual' });
    expect(stErr(s, { type: 'prepare', prepare: { deal: 'random' } })).toMatch(/waiting room/);
  });
});
