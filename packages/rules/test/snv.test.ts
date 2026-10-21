// Sects & Violets behaviour. The emphasis on this script is that the engine computes the TRUTH
// and the Storyteller decides what is actually said — so most assertions here check the
// Storyteller-facing suggestion, not a delivered message.
import { charactersOfScript, CHARACTER_INFO, type CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import {
  countTypes,
  mulberry32,
  randomAssignment,
  ROLES,
  setupCounts,
  stepView,
  validateAssignment,
  firstNightOrder,
  otherNightOrder,
} from '../src/index.js';
import {
  act_night,
  alive,
  begin,
  finishNight,
  mkGame,
  nominateAndVote,
  P,
  st,
  step,
  toDay,
  toNight,
} from './helpers.js';

const SNV = 'sects-and-violets' as const;

function sug(s: ReturnType<typeof mkGame>, kind: CharacterId) {
  const v = stepView(s, step(s, kind));
  return `${v.suggestion ?? ''} ${(v.notes ?? []).join(' ')}`;
}

describe('Sects & Violets — catalogue', () => {
  it('has 25 characters with the right type distribution', () => {
    const pool = charactersOfScript(SNV);
    expect(pool).toHaveLength(25);
    expect(countTypes(pool)).toEqual({ townsfolk: 13, outsiders: 4, minions: 4, demons: 4 });
    for (const c of pool) {
      expect(ROLES[c].id, c).toBe(c);
      expect(ROLES[c].type, c).toBe(CHARACTER_INFO[c].type);
      expect(CHARACTER_INFO[c].ability.length, c).toBeGreaterThan(10);
    }
  });

  it('night orders are strictly ordered', () => {
    const firstNums = firstNightOrder(SNV).map((c) => ROLES[c].firstNight!);
    expect([...firstNums].sort((a, b) => a - b)).toEqual(firstNums);
    const otherNums = otherNightOrder(SNV).map((c) => ROLES[c].otherNight ?? ROLES[c].dynamicOrder!);
    expect([...otherNums].sort((a, b) => a - b)).toEqual(otherNums);
  });

  it('random setups are legal for 5-15 players, including the Outsider-shifting Demons', () => {
    let sawFangGu = false;
    let sawVigormortis = false;
    for (let n = 5; n <= 15; n++) {
      for (let seed = 1; seed <= 25; seed++) {
        const seats = Array.from({ length: n }, (_, i) => i);
        const a = randomAssignment(seats, mulberry32(seed * 104729 + n), SNV);
        const chars = [...a.bySeat.values()];
        expect(new Set(chars).size, `n=${n} seed=${seed}`).toBe(n);
        for (const c of chars) expect(charactersOfScript(SNV), `n=${n}`).toContain(c);
        const counts = countTypes(chars);
        // Whatever the modifiers do, the distribution must always seat exactly n players.
        expect(counts.townsfolk + counts.outsiders + counts.minions + counts.demons, `n=${n} seed=${seed}`).toBe(n);
        expect(counts, `n=${n} seed=${seed}`).toEqual(setupCounts(n, chars));
        expect(validateAssignment(seats, a).errors, `n=${n} seed=${seed}`).toEqual([]);
        if (chars.includes('fang_gu')) sawFangGu = true;
        if (chars.includes('vigormortis')) sawVigormortis = true;
      }
    }
    expect(sawFangGu).toBe(true);
    expect(sawVigormortis).toBe(true);
  });

  it('the Fang Gu adds an Outsider and the Vigormortis removes one', () => {
    expect(setupCounts(9, ['fang_gu'])).toEqual({ townsfolk: 4, outsiders: 3, minions: 1, demons: 1 });
    expect(setupCounts(9, ['vigormortis'])).toEqual({ townsfolk: 6, outsiders: 1, minions: 1, demons: 1 });
  });
});

describe('Sects & Violets — information', () => {
  it('the Clockmaker counts steps from the Demon to its nearest Minion', () => {
    // seats 0 vortox(demon) 1 witch(minion) 2..4 townsfolk -> 1 step
    const near = mkGame(['vortox', 'witch', 'clockmaker', 'oracle', 'dreamer'], { script: SNV });
    begin(near);
    expect(sug(near, 'clockmaker')).toMatch(/Clockmaker number: 1/);
    // Move the Minion two seats away.
    const far = mkGame(['vortox', 'clockmaker', 'witch', 'oracle', 'dreamer'], { script: SNV });
    begin(far);
    expect(sug(far, 'clockmaker')).toMatch(/Clockmaker number: 2/);
  });

  it('the Oracle counts dead evil players', () => {
    const s = mkGame(['vortox', 'witch', 'oracle', 'dreamer', 'town_crier'], { script: SNV });
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 1 });
    expect(alive(s, 1)).toBe(false);
    toNight(s);
    expect(sug(s, 'oracle')).toMatch(/Oracle number: 1/);
  });

  it('the Seamstress reports whether two players share an alignment, once', () => {
    const s = mkGame(['vortox', 'witch', 'seamstress', 'dreamer', 'oracle'], { script: SNV });
    begin(s);
    // seats 0 (evil) and 1 (evil) are the same.
    const x = step(s, 'seamstress');
    st(s, {
      type: 'prompt_player',
      seat: 2,
      prompt: { kind: 'choose_players', title: 'Choose', minTargets: 2, maxTargets: 2, stepId: x.id },
    });
    const prompt = P(s, 2).prompts.at(-1)!;
    st(s, { type: 'resolve_step', stepId: x.id, seats: [0, 1] });
    expect(prompt).toBeDefined();
    expect(P(s, 2).reminders).toContain('Ability used');
  });

  it('the Town Crier notices a Minion nomination', () => {
    const s = mkGame(['vortox', 'witch', 'town_crier', 'dreamer', 'oracle'], { script: SNV });
    begin(s);
    finishNight(s);
    toDay(s);
    nominateAndVote(s, 1, 3, []);
    toNight(s);
    expect(sug(s, 'town_crier')).toMatch(/a Minion DID nominate/);
  });

  it('the Town Crier reports no Minion nomination when a Townsfolk nominated', () => {
    const s = mkGame(['vortox', 'witch', 'town_crier', 'dreamer', 'oracle'], { script: SNV });
    begin(s);
    finishNight(s);
    toDay(s);
    nominateAndVote(s, 3, 1, []);
    toNight(s);
    expect(sug(s, 'town_crier')).toMatch(/did not nominate/);
  });

  it('the Mathematician counts impaired players', () => {
    const s = mkGame(['vortox', 'witch', 'mathematician', 'dreamer', 'oracle'], { script: SNV });
    begin(s);
    st(s, { type: 'set_status', seat: 3, poisoned: true });
    expect(sug(s, 'mathematician')).toMatch(/Mathematician number: 1/);
  });

  it('every Townsfolk info step warns the Storyteller while a Vortox is active', () => {
    const s = mkGame(['vortox', 'witch', 'oracle', 'dreamer', 'clockmaker'], { script: SNV });
    begin(s);
    expect(sug(s, 'clockmaker')).toMatch(/VORTOX IS ACTIVE/);
    // A poisoned Vortox does not distort information.
    st(s, { type: 'set_status', seat: 0, poisoned: true });
    expect(sug(s, 'clockmaker')).not.toMatch(/VORTOX IS ACTIVE/);
  });
});

describe('Sects & Violets — abilities', () => {
  it('the Snake Charmer swaps with the Demon and poisons it', () => {
    const s = mkGame(['vortox', 'witch', 'snake_charmer', 'dreamer', 'oracle'], { script: SNV });
    begin(s);
    act_night(s, 'snake_charmer', [0]);
    expect(P(s, 2).character).toBe('vortox');
    expect(P(s, 2).alignment).toBe('evil');
    expect(P(s, 0).character).toBe('snake_charmer');
    expect(P(s, 0).alignment).toBe('good');
    expect(P(s, 0).poisonedBy).not.toBeNull();
  });

  it('the Snake Charmer does nothing on a non-Demon, or while impaired', () => {
    const s = mkGame(['vortox', 'witch', 'snake_charmer', 'dreamer', 'oracle'], { script: SNV });
    begin(s);
    const x = act_night(s, 'snake_charmer', [1]);
    expect(x.outcome).toMatch(/not the Demon/);
    expect(P(s, 2).character).toBe('snake_charmer');

    const s2 = mkGame(['vortox', 'witch', 'snake_charmer', 'dreamer', 'oracle'], { script: SNV });
    begin(s2);
    st(s2, { type: 'set_status', seat: 2, poisoned: true });
    const y = act_night(s2, 'snake_charmer', [0]);
    expect(y.outcome).toMatch(/drunk\/poisoned/);
    expect(P(s2, 2).character).toBe('snake_charmer');
  });

  it('the Witch curses a player and the curse clears on their death', () => {
    const s = mkGame(['vortox', 'witch', 'dreamer', 'oracle', 'clockmaker', 'town_crier'], { script: SNV });
    begin(s);
    act_night(s, 'witch', [2]);
    expect(P(s, 2).reminders).toContain('Cursed');
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 2 });
    expect(P(s, 2).reminders).not.toContain('Cursed');
  });

  it('the Witch stops waking at three players alive', () => {
    const s = mkGame(['vortox', 'witch', 'dreamer', 'oracle', 'clockmaker'], { script: SNV });
    begin(s);
    expect(() => step(s, 'witch')).not.toThrow();
    finishNight(s);
    toDay(s);
    st(s, { type: 'kill', seat: 3, announce: true });
    st(s, { type: 'kill', seat: 4, announce: true });
    toNight(s);
    expect(() => step(s, 'witch')).toThrow();
  });

  it('the Cerenovus marks a madness target, replacing the previous one', () => {
    const s = mkGame(['vortox', 'cerenovus', 'dreamer', 'oracle', 'clockmaker'], { script: SNV });
    begin(s);
    const x = step(s, 'cerenovus');
    st(s, { type: 'resolve_step', stepId: x.id, seats: [2], character: 'oracle' });
    expect(P(s, 2).reminders).toContain('Mad: Oracle');
    finishNight(s);
    toDay(s);
    toNight(s);
    const y = step(s, 'cerenovus');
    st(s, { type: 'resolve_step', stepId: y.id, seats: [3], character: 'clockmaker' });
    expect(P(s, 2).reminders).not.toContain('Mad: Oracle');
    expect(P(s, 3).reminders).toContain('Mad: Clockmaker');
  });

  it('the Pit-Hag changes a character but not to one already in play', () => {
    const s = mkGame(['vortox', 'pit_hag', 'dreamer', 'oracle', 'clockmaker'], { script: SNV });
    begin(s);
    const x = step(s, 'pit_hag');
    st(s, { type: 'resolve_step', stepId: x.id, seats: [2], character: 'artist' });
    expect(P(s, 2).character).toBe('artist');

    finishNight(s);
    toDay(s);
    toNight(s);
    const y = step(s, 'pit_hag');
    st(s, { type: 'resolve_step', stepId: y.id, seats: [3], character: 'artist' });
    expect(y.outcome).toMatch(/already in play/);
    expect(P(s, 3).character).toBe('oracle');
  });

  it('the Pit-Hag creating a Demon makes that player the Demon', () => {
    const s = mkGame(['vortox', 'pit_hag', 'dreamer', 'oracle', 'clockmaker'], { script: SNV });
    begin(s);
    const x = step(s, 'pit_hag');
    st(s, { type: 'resolve_step', stepId: x.id, seats: [2], character: 'no_dashii' });
    expect(P(s, 2).character).toBe('no_dashii');
    expect(P(s, 2).alignment).toBe('evil');
    expect(s.alerts.join(' ')).toMatch(/new Demon/);
  });

  it('the Philosopher takes an ability and drunks the real holder', () => {
    const s = mkGame(['vortox', 'witch', 'philosopher', 'oracle', 'clockmaker'], { script: SNV });
    begin(s);
    const x = step(s, 'philosopher');
    st(s, { type: 'resolve_step', stepId: x.id, character: 'oracle' });
    expect(P(s, 2).reminders).toContain('Philosopher: Oracle');
    expect(P(s, 3).drunkOverride).toBe(true);
    expect(P(s, 2).reminders).toContain('Ability used');
  });

  it('the No Dashii poisons its two nearest living Townsfolk neighbours', () => {
    // seats 0 witch 1 oracle 2 no_dashii 3 clockmaker 4 dreamer
    const s = mkGame(['witch', 'oracle', 'no_dashii', 'clockmaker', 'dreamer'], { script: SNV });
    begin(s);
    finishNight(s);
    toDay(s);
    toNight(s);
    act_night(s, 'no_dashii', [0]);
    expect(P(s, 1).poisonedBy).not.toBeNull();
    expect(P(s, 3).poisonedBy).not.toBeNull();
    expect(P(s, 1).reminders).toContain('Poisoned by the No Dashii');
  });

  it('the Vigormortis lets a killed Minion keep its ability and poisons a neighbour', () => {
    const s = mkGame(['vigormortis', 'witch', 'oracle', 'clockmaker', 'dreamer'], { script: SNV });
    begin(s);
    finishNight(s);
    toDay(s);
    toNight(s);
    act_night(s, 'vigormortis', [1]);
    expect(alive(s, 1)).toBe(false);
    expect(P(s, 1).reminders).toContain('Keeps ability (Vigormortis)');
    const poisoned = s.players.filter((p) => p.reminders.includes('Poisoned by the Vigormortis'));
    expect(poisoned.length).toBe(1);
  });

  it('the Fang Gu jumps into the first Outsider it picks, once', () => {
    const s = mkGame(['fang_gu', 'witch', 'mutant', 'oracle', 'clockmaker'], { script: SNV });
    begin(s);
    finishNight(s);
    toDay(s);
    toNight(s);
    act_night(s, 'fang_gu', [2]);
    expect(P(s, 2).character).toBe('fang_gu');
    expect(alive(s, 0)).toBe(false);
    expect(P(s, 0).reminders).toContain('Jumped');
  });

  it('an impaired Demon kills nobody', () => {
    const s = mkGame(['vortox', 'witch', 'oracle', 'clockmaker', 'dreamer'], { script: SNV });
    begin(s);
    finishNight(s);
    toDay(s);
    toNight(s);
    st(s, { type: 'set_status', seat: 0, poisoned: true });
    const x = act_night(s, 'vortox', [2]);
    expect(x.outcome).toMatch(/drunk\/poisoned/);
    expect(alive(s, 2)).toBe(true);
  });

  it('the Evil Twin pairs with a good player and shows both', () => {
    const s = mkGame(['vortox', 'evil_twin', 'oracle', 'clockmaker', 'dreamer'], { script: SNV });
    begin(s);
    const text = sug(s, 'evil_twin');
    expect(text).toMatch(/Evil Twin pairs with/);
    expect(text).toMatch(/Good cannot win while the Evil Twin lives/);
  });
});

describe('Sects & Violets — Storyteller-judgement characters', () => {
  it('the madness and open-question characters never wake or mutate', () => {
    for (const c of ['mutant', 'savant', 'artist'] as const) {
      expect(ROLES[c].firstNight, c).toBeNull();
      expect(ROLES[c].otherNight, c).toBeNull();
      expect(ROLES[c].resolve, c).toBeUndefined();
      expect(ROLES[c].nightNote, c).toBeTruthy();
    }
  });

  it('the Klutz, Sweetheart and Barber alert on death instead of acting', () => {
    for (const c of ['klutz', 'sweetheart', 'barber'] as const) {
      const s = mkGame(['vortox', 'witch', c, 'oracle', 'clockmaker'], { script: SNV });
      begin(s);
      finishNight(s);
      toDay(s);
      st(s, { type: 'execute', seat: 2 });
      expect(s.alerts.join(' '), c).toMatch(new RegExp(CHARACTER_INFO[c].name, 'i'));
    }
  });

  it('executing the good twin raises an alert rather than silently ending the game', () => {
    const s = mkGame(['vortox', 'evil_twin', 'oracle', 'clockmaker', 'dreamer'], { script: SNV });
    begin(s);
    finishNight(s);
    toDay(s);
    // Mark seat 2 as the good twin the way the Storyteller would.
    st(s, { type: 'add_reminder', seat: 2, token: 'Good twin' });
    st(s, { type: 'execute', seat: 2 });
    expect(s.alerts.join(' ')).toMatch(/good twin/i);
  });
});
