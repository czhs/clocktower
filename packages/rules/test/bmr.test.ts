// Bad Moon Rising behaviour. The pattern for each character is the one in
// docs/scripts-and-characters.md: it appears in the night queue when it should, `suggest` tells the
// Storyteller the truth, `resolve` applies the effect, and an impaired player changes nothing.
import { charactersOfScript, CHARACTER_INFO, type CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import {
  countTypes,
  mulberry32,
  randomAssignment,
  ROLES,
  setupCounts,
  validateAssignment,
  firstNightOrder,
  otherNightOrder,
  stepView,
} from '../src/index.js';
import { teaLadyProtects } from '../src/scripts/bmr.js';
import { act_night, alive, begin, finishNight, hasStep, mkGame, P, st, stErr, step, toDay, toNight } from './helpers.js';

const BMR = 'bad-moon-rising' as const;

/** The Storyteller-facing view of a step (suggestion text + notes). */
function sug(s: ReturnType<typeof mkGame>, kind: CharacterId) {
  const v = stepView(s, step(s, kind));
  return `${v.suggestion ?? ''} ${(v.notes ?? []).join(' ')}`;
}

describe('Bad Moon Rising — catalogue', () => {
  it('has 25 characters with the right type distribution', () => {
    const pool = charactersOfScript(BMR);
    expect(pool).toHaveLength(25);
    const byType = countTypes(pool);
    expect(byType).toEqual({ townsfolk: 13, outsiders: 4, minions: 4, demons: 4 });
    for (const c of pool) expect(ROLES[c], c).toBeDefined();
  });

  it('every character has catalogue metadata and a definition', () => {
    for (const c of charactersOfScript(BMR)) {
      expect(CHARACTER_INFO[c].ability.length, c).toBeGreaterThan(10);
      expect(ROLES[c].id, c).toBe(c);
      expect(ROLES[c].type, c).toBe(CHARACTER_INFO[c].type);
    }
  });

  it('night orders are inside the documented bands and strictly ordered', () => {
    const first = firstNightOrder(BMR);
    const other = otherNightOrder(BMR);
    expect(first.length).toBeGreaterThan(0);
    expect(other.length).toBeGreaterThan(0);
    for (const c of first) expect(ROLES[c].firstNight!, c).toBeGreaterThan(0);
    // Sorted ascending by their order number.
    const firstNums = first.map((c) => ROLES[c].firstNight!);
    expect([...firstNums].sort((a, b) => a - b)).toEqual(firstNums);
    const otherNums = other.map((c) => ROLES[c].otherNight ?? ROLES[c].dynamicOrder!);
    expect([...otherNums].sort((a, b) => a - b)).toEqual(otherNums);
  });

  it('random setups are legal for 5-15 players over many seeds', () => {
    for (let n = 5; n <= 15; n++) {
      for (let seed = 1; seed <= 25; seed++) {
        const seats = Array.from({ length: n }, (_, i) => i);
        const a = randomAssignment(seats, mulberry32(seed * 7919 + n), BMR);
        const chars = [...a.bySeat.values()];
        expect(new Set(chars).size, `n=${n} seed=${seed}`).toBe(n);
        // Only BMR characters are drawn.
        for (const c of chars) expect(charactersOfScript(BMR), `n=${n}`).toContain(c);
        // The distribution matches the table after the in-play setup modifiers.
        expect(countTypes(chars), `n=${n} seed=${seed}`).toEqual(setupCounts(n, chars));
        expect(validateAssignment(seats, a).errors, `n=${n} seed=${seed}`).toEqual([]);
        // Exactly one Demon, always.
        expect(chars.filter((c) => CHARACTER_INFO[c].type === 'demon')).toHaveLength(1);
      }
    }
  });

  it('the Godfather shifts the Outsider count', () => {
    expect(setupCounts(10, ['godfather'])).toEqual({ townsfolk: 6, outsiders: 1, minions: 2, demons: 1 });
    expect(setupCounts(10, [])).toEqual({ townsfolk: 7, outsiders: 0, minions: 2, demons: 1 });
  });

  it('the Lunatic believes they are the Demon', () => {
    expect(ROLES.lunatic.believesOther).toBe('demon');
    const s = mkGame(['zombuul', 'godfather', 'lunatic', 'chambermaid', 'sailor'], {
      script: BMR,
      drunkBelieves: 'pukka',
    });
    expect(P(s, 2).character).toBe('lunatic');
    expect(P(s, 2).believedCharacter).toBe('pukka');
    // They are TOLD they are evil, while really being a good Outsider.
    expect(P(s, 2).alignment).toBe('good');
    expect(P(s, 2).believedAlignment).toBe('evil');
  });
});

describe('Bad Moon Rising — protection and death', () => {
  it('a sober Sailor cannot die, a drunk one can', () => {
    const s = mkGame(['zombuul', 'godfather', 'sailor', 'chambermaid', 'gossip'], { script: BMR });
    begin(s);
    finishNight(s);
    toDay(s);
    // A Storyteller kill deliberately bypasses every protection, so the Sailor dies to it.
    st(s, { type: 'kill', seat: 2, announce: true });
    expect(alive(s, 2)).toBe(false);
    // A Demon kill on a drunk Sailor lands.
    const s2 = mkGame(['zombuul', 'godfather', 'sailor', 'chambermaid', 'gossip'], { script: BMR });
    begin(s2);
    finishNight(s2);
    toDay(s2);
    toNight(s2);
    st(s2, { type: 'set_status', seat: 2, drunk: true });
    act_night(s2, 'zombuul', [2]);
    expect(alive(s2, 2)).toBe(false);
  });

  it('the Fool survives exactly one death', () => {
    const s = mkGame(['zombuul', 'godfather', 'fool', 'chambermaid', 'gossip'], { script: BMR });
    begin(s);
    finishNight(s);
    toDay(s);
    toNight(s);
    act_night(s, 'zombuul', [2]);
    expect(alive(s, 2)).toBe(true);
    expect(P(s, 2).reminders).toContain('Ability used');
    // Second time, the Fool dies.
    toDay(s);
    toNight(s);
    act_night(s, 'zombuul', [2]);
    expect(alive(s, 2)).toBe(false);
  });

  it('the Zombuul survives its first death and is marked', () => {
    const s2 = mkGame(['zombuul', 'godfather', 'chambermaid', 'tea_lady', 'gossip'], { script: BMR });
    begin(s2);
    finishNight(s2);
    toDay(s2);
    expect(ROLES.zombuul.preventsKill).toBeDefined();
    const blocked = ROLES.zombuul.preventsKill!(s2, P(s2, 0), 'execution', { preview: false });
    expect(blocked?.reason).toMatch(/registers as dead/);
    expect(P(s2, 0).reminders).toContain('Died once');
    // Second attempt is not prevented.
    expect(ROLES.zombuul.preventsKill!(s2, P(s2, 0), 'execution', { preview: false })).toBeNull();
  });

  it('a preview of a once-only protection does not consume it', () => {
    const s = mkGame(['zombuul', 'godfather', 'fool', 'chambermaid', 'gossip'], { script: BMR });
    begin(s);
    ROLES.fool.preventsKill!(s, P(s, 2), 'demon', { preview: true });
    expect(P(s, 2).reminders).not.toContain('Ability used');
    ROLES.fool.preventsKill!(s, P(s, 2), 'demon', { preview: false });
    expect(P(s, 2).reminders).toContain('Ability used');
  });

  it('the Tea Lady protects both neighbours only while they are both good', () => {
    // seats: 0 zombuul(evil) 1 tea_lady 2 chambermaid(good) 3 sailor(good) 4 godfather(evil)
    const s = mkGame(['zombuul', 'chambermaid', 'tea_lady', 'sailor', 'godfather'], { script: BMR });
    begin(s);
    finishNight(s);
    toDay(s);
    // Tea Lady is seat 2; neighbours are seats 1 (good) and 3 (good).
    expect(teaLadyProtects(s, P(s, 1))).toBe(true);
    expect(teaLadyProtects(s, P(s, 3))).toBe(true);
    // A non-neighbour is not protected.
    expect(teaLadyProtects(s, P(s, 0))).toBe(false);
    // Poison the Tea Lady and the protection stops.
    st(s, { type: 'set_status', seat: 2, poisoned: true });
    expect(teaLadyProtects(s, P(s, 1))).toBe(false);
  });
});

describe('Bad Moon Rising — abilities', () => {
  it('the Innkeeper protects two players and makes one drunk; impaired does nothing', () => {
    const s = mkGame(['zombuul', 'godfather', 'innkeeper', 'chambermaid', 'gossip'], { script: BMR });
    begin(s);
    finishNight(s);
    toDay(s);
    toNight(s);
    act_night(s, 'innkeeper', [3, 4]);
    expect(P(s, 3).protectedTonight).toBe(true);
    expect(P(s, 4).protectedTonight).toBe(true);
    expect(P(s, 3).drunkOverride).toBe(true);
    expect(P(s, 4).drunkOverride).toBe(false);

    const s2 = mkGame(['zombuul', 'godfather', 'innkeeper', 'chambermaid', 'gossip'], { script: BMR });
    begin(s2);
    finishNight(s2);
    toDay(s2);
    toNight(s2);
    st(s2, { type: 'set_status', seat: 2, poisoned: true });
    act_night(s2, 'innkeeper', [3, 4]);
    expect(P(s2, 3).protectedTonight).toBe(false);
    expect(P(s2, 3).drunkOverride).toBe(false);
  });

  it('the Sailor makes the chosen player drunk, and clears last night’s drunkenness', () => {
    const s = mkGame(['zombuul', 'godfather', 'sailor', 'chambermaid', 'gossip'], { script: BMR });
    begin(s);
    act_night(s, 'sailor', [3]);
    expect(P(s, 3).drunkOverride).toBe(true);
    finishNight(s);
    toDay(s);
    toNight(s);
    act_night(s, 'sailor', [4]);
    expect(P(s, 3).drunkOverride).toBe(false);
    expect(P(s, 4).drunkOverride).toBe(true);
  });

  it('the Chambermaid counts players who woke tonight', () => {
    const s = mkGame(['zombuul', 'godfather', 'chambermaid', 'sailor', 'courtier'], { script: BMR });
    begin(s);
    // Sailor (seat 3) and Courtier (seat 4) both wake on the first night; the Godfather too.
    act_night(s, 'chambermaid', [3, 4]);
    const v = stepView(s, step(s, 'chambermaid'));
    expect(v.suggestion).toMatch(/Chambermaid number: 2/);
  });

  it('the Exorcist blocks the Demon and refuses a repeat target', () => {
    const s = mkGame(['zombuul', 'godfather', 'exorcist', 'chambermaid', 'gossip'], { script: BMR });
    begin(s);
    finishNight(s);
    toDay(s);
    toNight(s);
    act_night(s, 'exorcist', [0]);
    expect(step(s, 'zombuul').status).toBe('skipped');
    expect(P(s, 0).reminders).toContain('Exorcised last night');
    // Next night the same target is refused.
    toDay(s);
    toNight(s);
    const x = step(s, 'exorcist');
    expect(stErr(s, { type: 'resolve_step', stepId: x.id, seats: [0] })).toMatch(/different player/);
  });

  it('the Courtier is once per game and only affects a character in play', () => {
    const s = mkGame(['zombuul', 'godfather', 'courtier', 'chambermaid', 'gossip'], { script: BMR });
    begin(s);
    const x = step(s, 'courtier');
    st(s, { type: 'resolve_step', stepId: x.id, character: 'chambermaid' });
    expect(P(s, 3).drunkOverride).toBe(true);
    expect(P(s, 2).reminders).toContain('Ability used');
    // Spent: no second wake.
    toDay(s);
    toNight(s);
    expect(hasStep(s, 'courtier')).toBe(false);
  });

  it('the Courtier naming an absent character wastes the ability', () => {
    const s = mkGame(['zombuul', 'godfather', 'courtier', 'chambermaid', 'gossip'], { script: BMR });
    begin(s);
    const x = step(s, 'courtier');
    st(s, { type: 'resolve_step', stepId: x.id, character: 'pacifist' });
    expect(x.outcome).toMatch(/not in play/);
    expect(P(s, 2).reminders).toContain('Ability used');
  });

  it('the Professor revives a dead Townsfolk once, and nobody else', () => {
    const s = mkGame(['zombuul', 'godfather', 'professor', 'chambermaid', 'gossip'], { script: BMR });
    begin(s);
    finishNight(s);
    toDay(s);
    toNight(s);
    act_night(s, 'zombuul', [3]);
    expect(alive(s, 3)).toBe(false);
    toDay(s);
    toNight(s);
    act_night(s, 'professor', [3]);
    expect(alive(s, 3)).toBe(true);
    expect(P(s, 3).reminders).toContain('Revived by the Professor');
    expect(P(s, 2).reminders).toContain('Ability used');
  });

  it('the Professor cannot revive a Minion', () => {
    const s = mkGame(['zombuul', 'godfather', 'professor', 'chambermaid', 'gossip'], { script: BMR });
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'kill', seat: 1, announce: true });
    toNight(s);
    const x = act_night(s, 'professor', [1]);
    expect(x.outcome).toMatch(/not a Townsfolk/);
    expect(alive(s, 1)).toBe(false);
  });

  it('the Assassin kills through every protection, once', () => {
    const s = mkGame(['zombuul', 'assassin', 'sailor', 'chambermaid', 'gossip'], { script: BMR });
    begin(s);
    finishNight(s);
    toDay(s);
    toNight(s);
    // The Sailor normally cannot die at all.
    act_night(s, 'assassin', [2]);
    expect(alive(s, 2)).toBe(false);
    expect(P(s, 1).reminders).toContain('Ability used');
    toDay(s);
    toNight(s);
    expect(hasStep(s, 'assassin')).toBe(false);
  });

  it("the Devil's Advocate marks one player and rejects a repeat", () => {
    const s = mkGame(['zombuul', 'devils_advocate', 'chambermaid', 'sailor', 'gossip'], { script: BMR });
    begin(s);
    act_night(s, 'devils_advocate', [2]);
    expect(P(s, 2).reminders).toContain('Survives execution');
    expect(P(s, 2).reminders).toContain("Devil's Advocate last night");
  });

  it('the Pukka poisons now and kills last night’s victim', () => {
    const s = mkGame(['pukka', 'godfather', 'chambermaid', 'sailor', 'gossip'], { script: BMR });
    begin(s);
    act_night(s, 'pukka', [2]);
    expect(P(s, 2).poisonedBy).not.toBeNull();
    expect(alive(s, 2)).toBe(true);
    finishNight(s);
    toDay(s);
    toNight(s);
    act_night(s, 'pukka', [4]);
    expect(alive(s, 2)).toBe(false);
    expect(P(s, 4).poisonedBy).not.toBeNull();
  });

  it('the Po charges when it chooses nobody and then kills three', () => {
    const s = mkGame(['po', 'godfather', 'chambermaid', 'sailor', 'gossip', 'pacifist', 'fool'], { script: BMR });
    begin(s);
    finishNight(s);
    toDay(s);
    toNight(s);
    const x = step(s, 'po');
    st(s, { type: 'resolve_step', stepId: x.id, seats: [] });
    expect(P(s, 0).reminders).toContain('Charged');
    toDay(s);
    toNight(s);
    act_night(s, 'po', [2, 3, 4]);
    expect(alive(s, 2)).toBe(false);
    expect(alive(s, 4)).toBe(false);
    expect(P(s, 0).reminders).not.toContain('Charged');
  });

  it('the Shabaloth eats two and marks them for regurgitation', () => {
    const s = mkGame(['shabaloth', 'godfather', 'chambermaid', 'pacifist', 'gossip'], { script: BMR });
    begin(s);
    finishNight(s);
    toDay(s);
    toNight(s);
    act_night(s, 'shabaloth', [2, 3]);
    expect(alive(s, 2)).toBe(false);
    expect(alive(s, 3)).toBe(false);
    expect(P(s, 2).reminders).toContain('Eaten last night');
  });

  it('the Godfather learns the Outsiders on the first night', () => {
    const s = mkGame(['zombuul', 'godfather', 'tinker', 'moonchild', 'chambermaid'], { script: BMR });
    begin(s);
    expect(sug(s, 'godfather')).toMatch(/Tinker/);
    expect(sug(s, 'godfather')).toMatch(/Moonchild/);
  });

  it('the Minstrel makes everyone else drunk when a Minion is executed', () => {
    const s = mkGame(['zombuul', 'godfather', 'minstrel', 'chambermaid', 'pacifist'], { script: BMR });
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 1 });
    expect(alive(s, 1)).toBe(false);
    expect(P(s, 2).drunkOverride).toBe(false); // the Minstrel stays sober
    expect(P(s, 3).drunkOverride).toBe(true);
    expect(P(s, 4).drunkOverride).toBe(true);
  });

  it('the Mastermind alerts but never silently continues the game', () => {
    const s = mkGame(['pukka', 'mastermind', 'chambermaid', 'tinker', 'pacifist'], { script: BMR });
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 0 });
    // The engine still proposes the good win; the Mastermind only advises an override.
    expect(s.resultPending).toBe(true);
    expect(s.alerts.join(' ')).toMatch(/Mastermind/);
  });

  it('the Gambler dies on a wrong guess and lives on a right one', () => {
    const wrong = mkGame(['zombuul', 'godfather', 'gambler', 'chambermaid', 'gossip'], { script: BMR });
    begin(wrong);
    finishNight(wrong);
    toDay(wrong);
    toNight(wrong);
    const x = step(wrong, 'gambler');
    st(wrong, { type: 'resolve_step', stepId: x.id, seats: [3], character: 'sailor' });
    expect(alive(wrong, 2)).toBe(false);

    const right = mkGame(['zombuul', 'godfather', 'gambler', 'chambermaid', 'gossip'], { script: BMR });
    begin(right);
    finishNight(right);
    toDay(right);
    toNight(right);
    const y = step(right, 'gambler');
    st(right, { type: 'resolve_step', stepId: y.id, seats: [3], character: 'chambermaid' });
    expect(alive(right, 2)).toBe(true);
  });

  it('the Grandmother learns a good player and their character', () => {
    const s = mkGame(['zombuul', 'godfather', 'grandmother', 'chambermaid', 'sailor'], { script: BMR });
    begin(s);
    const text = sug(s, 'grandmother');
    expect(text).toMatch(/Grandchild|no other good player/);
  });
});

describe('Bad Moon Rising — Storyteller-judgement characters', () => {
  it('Tinker, Pacifist, Goon and Tea Lady never wake and carry guidance instead', () => {
    for (const c of ['tinker', 'pacifist', 'goon', 'tea_lady'] as const) {
      expect(ROLES[c].firstNight, c).toBeNull();
      expect(ROLES[c].otherNight, c).toBeNull();
      expect(ROLES[c].nightNote, c).toBeTruthy();
      // They must not silently change the game.
      expect(ROLES[c].resolve, c).toBeUndefined();
    }
  });

  it('the Moonchild and Sweetheart raise an alert on death rather than acting', () => {
    const s = mkGame(['zombuul', 'godfather', 'moonchild', 'chambermaid', 'sailor'], { script: BMR });
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 2 });
    expect(s.alerts.join(' ')).toMatch(/Moonchild/);
  });
});
