// Homebrew characters and the custom-script builder.
//
// These tests are deliberately written not to depend on the SIZE of the catalogue, so adding
// scripts or characters later never breaks them.
import { CHARACTER_INFO, type CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { buildCustomScript, playerCountsSupported, ROLES, validateCustomScript } from '../src/index.js';
import { act, actErr, alive, begin, finishNight, mkGame, P, st, toDay } from './helpers.js';

describe('homebrew characters', () => {
  it('the Wizard and Plague Doctor are in the catalogue and the registry', () => {
    expect(CHARACTER_INFO.wizard.type).toBe('townsfolk');
    expect(CHARACTER_INFO.wizard.alignment).toBe('good');
    expect(CHARACTER_INFO.plague_doctor.type).toBe('outsider');
    expect(CHARACTER_INFO.plague_doctor.alignment).toBe('good');
    expect(ROLES.wizard.id).toBe('wizard');
    expect(ROLES.plague_doctor.id).toBe('plague_doctor');
  });

  it('neither wakes at night', () => {
    for (const c of ['wizard', 'plague_doctor'] as const) {
      expect(ROLES[c].firstNight, c).toBeNull();
      expect(ROLES[c].otherNight, c).toBeNull();
    }
  });

  it("the Wizard's wish spends the one-shot and asks the Storyteller to rule, changing nothing else", () => {
    const s = mkGame(['imp', 'poisoner', 'wizard', 'empath', 'monk'], { script: 'custom' });
    begin(s);
    finishNight(s);
    toDay(s);
    const aliveBefore = s.players.map((p) => p.alive);
    act(s, 2, { type: 'slayerShot', targetSeat: 3 });
    // Nobody died, no alignment changed: the ability is a conversation.
    expect(s.players.map((p) => p.alive)).toEqual(aliveBefore);
    expect(P(s, 2).reminders).toContain('Ability used');
    expect(s.alerts.join(' ')).toMatch(/Wizard/);
    // A player only gets ONE public claim ever (the same gate that stops Slayer-bluff spam), so
    // the second attempt is refused by the engine before the ability is even consulted.
    expect(actErr(s, 2, { type: 'slayerShot', targetSeat: 3 })).toMatch(/already taken your shot/);
  });

  it('the Plague Doctor hands the Storyteller an ability on death, and kills nobody', () => {
    const s = mkGame(['imp', 'poisoner', 'plague_doctor', 'empath', 'monk'], { script: 'custom' });
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 2 });
    expect(alive(s, 2)).toBe(false);
    // No other player was affected.
    expect([0, 1, 3, 4].every((seat) => alive(s, seat))).toBe(true);
    expect(P(s, 2).reminders).toContain('Storyteller has a Minion ability');
    expect(s.alerts.join(' ')).toMatch(/Plague Doctor/);
  });

  it('a catalogue character with no script definition still resolves to an inert role', () => {
    // The documented homebrew escape hatch: a character may be pure Storyteller judgement with
    // nothing for the engine to do, and ROLES must not throw for it.
    for (const id of Object.keys(CHARACTER_INFO) as CharacterId[]) {
      const def = ROLES[id];
      expect(def, id).toBeDefined();
      expect(def.id, id).toBe(id);
      expect(def.type, id).toBe(CHARACTER_INFO[id].type);
      // firstNight/otherNight are always present, even on an inert default.
      expect(def.firstNight === null || typeof def.firstNight === 'number', id).toBe(true);
      expect(def.otherNight === null || typeof def.otherNight === 'number', id).toBe(true);
    }
  });
});

describe('custom script validation', () => {
  it('rejects unknown ids, duplicates and a list with no Demon', () => {
    expect(validateCustomScript(['chef', 'not_a_character']).errors.join()).toMatch(/Unknown character: not_a_character/);
    expect(validateCustomScript(['imp', 'chef', 'chef']).errors.join()).toMatch(/listed twice/);
    expect(validateCustomScript(['chef', 'empath', 'monk']).errors.join()).toMatch(/at least one Demon/);
  });

  it('warns about a list with no Minions', () => {
    const v = validateCustomScript(['imp', 'chef', 'empath', 'monk', 'soldier']);
    expect(v.errors).toEqual([]);
    expect(v.warnings.join()).toMatch(/No Minions/);
  });

  it("errors when a believesOther character has nothing of that type to believe in", () => {
    // The Drunk believes they are a Townsfolk; a list with no Townsfolk cannot support them.
    const v = validateCustomScript(['imp', 'poisoner', 'drunk', 'recluse', 'saint']);
    expect(v.errors.join()).toMatch(/Drunk needs at least one townsfolk/i);
  });

  it('warns when Travellers or Fabled are put in the main pool', () => {
    expect(validateCustomScript(['imp', 'poisoner', 'chef', 'scapegoat']).warnings.join()).toMatch(/Traveller/);
    expect(validateCustomScript(['imp', 'poisoner', 'chef', 'djinn']).warnings.join()).toMatch(/Fabled/);
  });

  it('accepts a legal mixed-script list', () => {
    const v = validateCustomScript([
      'imp',
      'poisoner',
      'baron',
      'chef',
      'empath',
      'monk',
      'soldier',
      'sailor',
      'chambermaid',
      'oracle',
      'clockmaker',
      'wizard',
      'recluse',
      'saint',
      'tinker',
    ]);
    expect(v.errors).toEqual([]);
  });
});

describe('custom script builder', () => {
  const LIST: CharacterId[] = [
    'imp',
    'zombuul',
    'poisoner',
    'baron',
    'godfather',
    'chef',
    'empath',
    'monk',
    'soldier',
    'sailor',
    'chambermaid',
    'oracle',
    'clockmaker',
    'wizard',
    'recluse',
    'saint',
    'tinker',
    'fortune_teller',
  ];

  it('reports the type counts of the list', () => {
    const cs = buildCustomScript(LIST);
    expect(cs.counts.demons).toBe(2);
    expect(cs.counts.minions).toBe(3);
    expect(cs.counts.outsiders).toBe(3);
    expect(cs.counts.townsfolk).toBe(10);
  });

  it('derives a night order sorted ascending, for these characters only', () => {
    const cs = buildCustomScript(LIST);
    const firstNums = cs.firstNight.map((c) => ROLES[c].firstNight!);
    expect([...firstNums].sort((a, b) => a - b)).toEqual(firstNums);
    const otherNums = cs.otherNight.map((c) => ROLES[c].otherNight ?? ROLES[c].dynamicOrder!);
    expect([...otherNums].sort((a, b) => a - b)).toEqual(otherNums);
    // Nothing outside the list leaks in.
    for (const c of [...cs.firstNight, ...cs.otherNight]) expect(LIST).toContain(c);
  });

  it('surfaces setup modifiers and setup decisions', () => {
    const cs = buildCustomScript(LIST);
    expect(cs.setupModifiers.map((m) => m.character)).toContain('baron');
    expect(cs.setupModifiers.map((m) => m.character)).toContain('godfather');
    for (const m of cs.setupModifiers) expect(m.note.length).toBeGreaterThan(0);
    // The Fortune Teller needs a red herring chosen at setup.
    expect(cs.setupDecisions.map((d) => d.character)).toContain('fortune_teller');
  });

  it('drops unknown ids instead of throwing', () => {
    const cs = buildCustomScript(['imp', 'chef', 'nope']);
    expect(cs.characters).toEqual(['imp', 'chef']);
  });

  it('playerCountsSupported is empty for a tiny list and populated for a realistic one', () => {
    expect(playerCountsSupported(['imp', 'chef', 'empath'])).toEqual([]);
    const counts = playerCountsSupported(LIST);
    expect(counts.length).toBeGreaterThan(0);
    expect(counts).toContain(5);
    for (const n of counts) expect(n).toBeGreaterThanOrEqual(5);
  });

  it('a list with too few Townsfolk cannot be dealt for large games', () => {
    const small: CharacterId[] = ['imp', 'poisoner', 'chef', 'empath', 'monk'];
    const counts = playerCountsSupported(small);
    expect(counts).toContain(5);
    expect(counts).not.toContain(15);
  });
});
