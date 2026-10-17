// OWNED BY rules-storyteller. (v2.2) Pure dealing helpers of the Storyteller panel: storyline options,
// the bag check, and the PRACTICE deal / view / reducer (built locally, never sent).
import { CHARACTER_INFO, tbCounts, type CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER } from '../../../packages/rules/src/roles.js';
import {
  checkBag,
  PRACTICE_FIRST_NIGHT,
  PRACTICE_OTHER_NIGHT,
  practiceDeal,
  practiceNames,
  practiceReduce,
  practiceStart,
  practiceView,
  storylineOptions,
} from '../src/ui/storyteller/dealLogic';

const NAMES = ['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal'];

describe('storyline options', () => {
  it('greys out what a player count cannot deal', () => {
    const at7 = storylineOptions(7);
    expect(at7.find((o) => o.def.id === 'town-of-liars')).toMatchObject({ supported: false, counts: '6, 8-15' });
    expect(at7.find((o) => o.def.id === 'classic-night')).toMatchObject({ supported: true, problem: null });
    expect(storylineOptions(13).find((o) => o.def.id === 'beginners-lantern')!.supported).toBe(false);
  });
});

describe('bag check', () => {
  it('counts types against the standard (Baron-adjusted) and lists blocking problems', () => {
    const ok = checkBag(['imp', 'poisoner', 'chef', 'empath', 'monk'], 5);
    expect(ok).toMatchObject({ standard: true, ready: true, problems: [] });
    const baron = checkBag(['imp', 'baron', 'saint', 'butler', 'chef', 'empath', 'monk'], 7);
    expect(baron.want).toEqual(tbCounts(7, true));
    expect(baron.standard).toBe(true);
    const odd = checkBag(['imp', 'poisoner', 'saint', 'empath', 'monk'], 5);
    expect(odd).toMatchObject({ standard: false, ready: true }); // dealable with "nonstandard"
    expect(checkBag(['imp', 'poisoner'], 5).problems.join()).toMatch(/Pick 5/);
    expect(checkBag(['poisoner', 'spy', 'chef', 'empath', 'monk'], 5).problems.join()).toMatch(/one Demon/);
  });
});

describe('practice', () => {
  it('practiceDeal: legal standard setup for the seat count, reproducible per seed, storyline honoured', () => {
    for (let n = 5; n <= 15; n++) {
      for (const seed of [1, 2, 3, 99]) {
        const d = practiceDeal(n, null, seed);
        expect(d.bySeat).toHaveLength(n);
        expect(new Set(d.bySeat).size).toBe(n);
        const c = checkBag(d.bySeat, n);
        expect(c.standard, `n=${n} seed=${seed}`).toBe(true);
        expect(d.bluffs).toHaveLength(3);
        for (const b of d.bluffs) expect(d.bySeat).not.toContain(b);
        if (d.bySeat.includes('drunk')) expect(CHARACTER_INFO[d.drunkBelieves!].type).toBe('townsfolk');
        if (d.redHerringSeat !== null) expect(CHARACTER_INFO[d.bySeat[d.redHerringSeat]!].alignment).toBe('good');
      }
    }
    expect(practiceDeal(9, 'saints-gambit', 5)).toEqual(practiceDeal(9, 'saints-gambit', 5));
    expect(practiceDeal(9, 'saints-gambit', 5).bySeat).toContain('saint');
    expect(practiceDeal(9, 'saints-gambit', 5).storyline).toBe('saints-gambit');
    // an unfitting storyline falls back to a random deal
    expect(practiceDeal(7, 'town-of-liars', 5).storyline).toBeNull();
  });

  it('the practice night order mirrors the rules engine', () => {
    expect(PRACTICE_FIRST_NIGHT).toEqual(FIRST_NIGHT_ORDER);
    expect(PRACTICE_OTHER_NIGHT).toEqual(OTHER_NIGHT_ORDER);
  });

  it('practiceNames fills small lobbies with sample townsfolk (min 7) and keeps real names', () => {
    expect(practiceNames(['Ann', 'Bo'])).toHaveLength(7);
    expect(practiceNames(['Ann', 'Bo']).slice(0, 2)).toEqual(['Ann', 'Bo']);
    expect(practiceNames(NAMES)).toEqual(NAMES);
  });

  it('reducer: deals, re-deals, moves to the first night (queue from the deal), ticks steps; everything else only explains', () => {
    let ps = practiceStart(10);
    let v = practiceView(NAMES, ps);
    expect(v.charactersAssigned).toBe(false);
    expect(v.grimoire).toEqual([]);
    ps = practiceReduce(ps, NAMES, { type: 'begin_first_night' });
    expect(ps.phase).toBe('setup');
    expect(ps.note).toMatch(/deal the characters first/);
    ps = practiceReduce(ps, NAMES, { type: 'deal_preset', storyline: 'drunk-bell-tower' });
    v = practiceView(NAMES, ps);
    expect(v.charactersAssigned).toBe(true);
    expect(v.deal).toEqual({ method: 'storyline', storyline: 'drunk-bell-tower' });
    expect(v.grimoire.map((g) => g.character)).toContain('drunk');
    const drunk = v.grimoire.find((g) => g.character === 'drunk')!;
    expect(drunk.believedCharacter).not.toBe('drunk');
    const first = ps.deal!.bySeat;
    ps = practiceReduce(ps, NAMES, { type: 'random_setup' });
    expect(ps.deal!.bySeat).not.toEqual(first); // a new seed
    ps = practiceReduce(ps, NAMES, { type: 'begin_first_night' });
    v = practiceView(NAMES, ps);
    expect(v.phase).toBe('first_night');
    expect(v.nightQueue[0]!.character).toBe('dusk');
    expect(v.nightQueue.map((s) => s.character)).toContain('minion_info'); // 8 players
    const seatStep = v.nightQueue.find((s) => s.seat !== null);
    if (seatStep) {
      ps = practiceReduce(ps, NAMES, { type: 'resolve_step', stepId: seatStep.id });
      expect(practiceView(NAMES, ps).nightQueue.find((s) => s.id === seatStep.id)!.status).toBe('resolved');
    }
    ps = practiceReduce(ps, NAMES, { type: 'kill', seat: 2, announce: true });
    expect(ps.note).toMatch(/^Practice — in a real game this would send "kill"\. Nothing was sent\.$/);
    ps = practiceReduce(ps, NAMES, { type: 'send_info', seat: 1, info: { text: 'You learn 2' } });
    expect(ps.note).toMatch(/tell Bo: "You learn 2"/);
    ps = practiceReduce(ps, NAMES, { type: 'random_setup' });
    expect(ps.note).toMatch(/refused/);
  });

  it('the practice view has only public lobby names and the local deal (no ids from the server)', () => {
    const ps = practiceReduce(practiceStart(3), NAMES, { type: 'random_setup' });
    const v = practiceView(NAMES, ps);
    expect(v.players.map((p) => p.name)).toEqual(NAMES);
    expect(v.players.every((p) => p.pid.startsWith('practice-'))).toBe(true);
    const chars = v.grimoire.map((g) => g.character) as CharacterId[];
    expect(chars).toHaveLength(8);
  });
});
