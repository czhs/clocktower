// Travellers, Fabled and the exile mechanic.
import { CHARACTER_INFO, charactersOfScript, FABLED_IDS, TRAVELLER_IDS, type CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import {
  addTraveller,
  callExile,
  cancelExile,
  canBeNominated,
  countTypes,
  EXILE_REMINDER,
  exileThreshold,
  isTravellerPlayer,
  mulberry32,
  randomAssignment,
  ROLES,
  setExileHand,
  startExileVote,
  tallyExile,
  travellersIn,
  validateAssignment,
} from '../src/index.js';
import { act, actErr, alive, begin, finishNight, mkGame, P, st, toDay } from './helpers.js';

const op = () => ({ now: 2_000_000, effects: [] });

describe('Travellers and Fabled — catalogue', () => {
  it('has 15 Travellers and 12 Fabled, all with the right type', () => {
    expect(TRAVELLER_IDS).toHaveLength(15);
    expect(FABLED_IDS).toHaveLength(12);
    for (const c of TRAVELLER_IDS) {
      expect(CHARACTER_INFO[c].type, c).toBe('traveller');
      expect(ROLES[c].id, c).toBe(c);
    }
    for (const c of FABLED_IDS) expect(CHARACTER_INFO[c].type, c).toBe('fabled');
  });

  it('no Fabled ever wakes a player — there is no player to wake', () => {
    for (const c of FABLED_IDS) {
      expect(ROLES[c].firstNight, c).toBeNull();
      expect(ROLES[c].otherNight, c).toBeNull();
      expect(ROLES[c].dynamicOrder, c).toBeUndefined();
      expect(ROLES[c].prompt, c).toBeUndefined();
    }
  });

  it('Travellers and Fabled are outside the setup distribution', () => {
    // countTypes skips non-seated types entirely.
    expect(countTypes([...TRAVELLER_IDS, ...FABLED_IDS])).toEqual({
      townsfolk: 0,
      outsiders: 0,
      minions: 0,
      demons: 0,
    });
    // Mixing a Traveller into a legal 5-player setup leaves the counts legal.
    expect(countTypes(['imp', 'poisoner', 'chef', 'empath', 'monk', 'scapegoat'] as CharacterId[])).toEqual({
      townsfolk: 3,
      outsiders: 0,
      minions: 1,
      demons: 1,
    });
  });

  it('randomAssignment never deals a Traveller or Fabled, on any script or player count', () => {
    for (const script of ['trouble-brewing', 'bad-moon-rising', 'sects-and-violets'] as const) {
      for (let n = 5; n <= 15; n++) {
        for (let seed = 1; seed <= 10; seed++) {
          const a = randomAssignment(
            Array.from({ length: n }, (_, i) => i),
            mulberry32(seed * 31 + n),
            script,
          );
          for (const c of a.bySeat.values()) {
            expect(CHARACTER_INFO[c].type, `${script} n=${n}: ${c}`).not.toBe('traveller');
            expect(CHARACTER_INFO[c].type, `${script} n=${n}: ${c}`).not.toBe('fabled');
          }
        }
      }
    }
  });

  it('a setup with an extra Traveller seat validates without errors', () => {
    const seats = [0, 1, 2, 3, 4, 5];
    const chars: CharacterId[] = ['imp', 'poisoner', 'chef', 'empath', 'monk', 'scapegoat'];
    const v = validateAssignment(seats, {
      bySeat: new Map(chars.map((c, i) => [i, c])),
      drunkBelieves: null,
      redHerringSeat: null,
      demonBluffs: [],
      script: 'trouble-brewing',
    });
    expect(v.errors).toEqual([]);
    // the Traveller is outside the distribution: 5 seated players at 3/0/1/1 is standard
    expect(v.warnings).toEqual([]);
  });

  it('a Fabled cannot sit in a seat, and Travellers need 5 other players', () => {
    const base = { drunkBelieves: null, redHerringSeat: null, demonBluffs: [], script: 'trouble-brewing' as const };
    const fabled = validateAssignment([0, 1, 2, 3, 4], { ...base, bySeat: new Map((['imp', 'poisoner', 'chef', 'empath', 'angel'] as CharacterId[]).map((c, i) => [i, c])) });
    expect(fabled.errors.join()).toMatch(/Fabled/);
    const few = validateAssignment([0, 1, 2, 3, 4], { ...base, bySeat: new Map((['imp', 'poisoner', 'chef', 'empath', 'scapegoat'] as CharacterId[]).map((c, i) => [i, c])) });
    expect(few.errors.join()).toMatch(/at least 5 players/);
  });

  it('Travellers have an alignment the Storyteller is told to choose', () => {
    for (const c of TRAVELLER_IDS) {
      expect(CHARACTER_INFO[c].setupHint, c).toMatch(/alignment/i);
    }
  });
});

describe('Exile', () => {
  const game = () => {
    const s = mkGame(['imp', 'poisoner', 'chef', 'empath', 'monk', 'scapegoat'], { script: 'trouble-brewing' });
    begin(s);
    finishNight(s);
    toDay(s);
    return s;
  };

  it('identifies Travellers and keeps them out of nominations', () => {
    const s = game();
    expect(isTravellerPlayer(P(s, 5))).toBe(true);
    expect(isTravellerPlayer(P(s, 2))).toBe(false);
    expect(canBeNominated(P(s, 5))).toBe(false);
    expect(travellersIn(s).map((p) => p.seat)).toEqual([5]);

    st(s, { type: 'set_nominations_open', open: true });
    expect(actErr(s, 2, { type: 'nominate', nomineeSeat: 5 })).toMatch(/exiled, not executed/);
  });

  it('at least half the living exiles the Traveller', () => {
    const s = game();
    // 6 alive -> threshold 3 (half, rounded up: the same bar as an execution).
    expect(exileThreshold(s)).toBe(3);
    callExile(s, op(), 5, 2);
    startExileVote(s, op());
    for (const seat of [0, 1, 2, 3]) setExileHand(s, op(), seat, true);
    const ex = tallyExile(s, op());
    expect(ex.voteCount).toBe(4);
    expect(ex.exiled).toBe(true);
    expect(alive(s, 5)).toBe(false);
    expect(P(s, 5).reminders).toContain(EXILE_REMINDER);
    expect(P(s, 5).ghostVoteAvailable).toBe(false);
  });

  it('too few votes leaves the Traveller in the game', () => {
    const s = game();
    callExile(s, op(), 5, null);
    startExileVote(s, op());
    for (const seat of [0, 1]) setExileHand(s, op(), seat, true);
    const ex = tallyExile(s, op());
    expect(ex.voteCount).toBe(2);
    expect(ex.exiled).toBe(false);
    expect(alive(s, 5)).toBe(true);
  });

  it('dead players may vote on an exile WITHOUT spending their ghost vote', () => {
    const s = game();
    st(s, { type: 'kill', seat: 3, announce: true });
    expect(alive(s, 3)).toBe(false);
    expect(P(s, 3).ghostVoteAvailable).toBe(true);
    // 5 alive -> threshold 3.
    expect(exileThreshold(s)).toBe(3);
    callExile(s, op(), 5, null);
    startExileVote(s, op());
    for (const seat of [0, 1, 3]) setExileHand(s, op(), seat, true);
    const ex = tallyExile(s, op());
    expect(ex.votes[3]).toBe(true);
    expect(ex.exiled).toBe(true);
    // The ghost vote is untouched: that is the point of an exile.
    expect(P(s, 3).ghostVoteUsed).toBe(false);
    expect(P(s, 3).ghostVoteAvailable).toBe(true);
  });

  it('refuses a second concurrent exile, a non-Traveller, and an already-exiled Traveller', () => {
    const s = game();
    callExile(s, op(), 5, null);
    expect(() => callExile(s, op(), 5, null)).toThrow(/in progress/);
    cancelExile(s, op());
    expect(() => callExile(s, op(), 2, null)).toThrow(/not a Traveller/);
    callExile(s, op(), 5, null);
    startExileVote(s, op());
    for (const seat of [0, 1, 2, 3]) setExileHand(s, op(), seat, true);
    tallyExile(s, op());
    expect(() => callExile(s, op(), 5, null)).toThrow(/already exiled/);
  });

  it('an exile does not consume the day’s execution', () => {
    const s = game();
    callExile(s, op(), 5, null);
    startExileVote(s, op());
    for (const seat of [0, 1, 2, 3]) setExileHand(s, op(), seat, true);
    tallyExile(s, op());
    expect(s.day!.executionOccurred).toBe(false);
    // A normal execution still works afterwards.
    st(s, { type: 'execute', seat: 2 });
    expect(alive(s, 2)).toBe(false);
    expect(s.day!.executionOccurred).toBe(true);
  });

  it('nightfall withdraws an open exile vote; nobody can vote on it at night; the next day starts clean', () => {
    const s = game();
    callExile(s, op(), 5, null);
    startExileVote(s, op());
    act(s, 0, { type: 'exileHand', vote: true });
    st(s, { type: 'force_phase', to: 'night' });
    expect(s.exile!.status).toBe('cancelled');
    expect(actErr(s, 1, { type: 'exileHand', vote: true })).toMatch(/No exile vote is open/);
    expect(() => tallyExile(s, op())).toThrow(/during the day/);
    expect(alive(s, 5)).toBe(true);
    st(s, { type: 'force_phase', to: 'day' });
    expect(s.exile).toBeNull();
    // A fresh exile can be called on the new day.
    callExile(s, op(), 5, null);
    expect(s.exile!.status).toBe('pending');
  });

  it('a locked vote cannot be changed', () => {
    const s = game();
    callExile(s, op(), 5, null);
    startExileVote(s, op());
    setExileHand(s, op(), 0, true);
    tallyExile(s, op());
    expect(() => setExileHand(s, op(), 1, true)).toThrow(/finished/);
  });

  it('addTraveller seats a Traveller mid-game without touching the distribution', () => {
    const s = mkGame(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier'], { script: 'trouble-brewing' });
    begin(s);
    finishNight(s);
    toDay(s);
    const before = countTypes(s.players.map((p) => p.character));
    addTraveller(s, op(), 5, 'gunslinger', 'evil');
    expect(P(s, 5).character).toBe('gunslinger');
    expect(P(s, 5).alignment).toBe('evil');
    expect(P(s, 5).reminders).toContain('Traveller (evil)');
    const after = countTypes(s.players.map((p) => p.character));
    // The Soldier seat became a Traveller, so one Townsfolk left the distribution.
    expect(after.townsfolk).toBe(before.townsfolk - 1);
    expect(after.demons).toBe(1);
  });

  it('addTraveller rejects a non-Traveller character', () => {
    const s = game();
    expect(() => addTraveller(s, op(), 2, 'chef', 'good')).toThrow(/not a Traveller/);
  });
});

describe('Traveller abilities', () => {
  it('the Bureaucrat and Thief mark a vote modifier and replace it each night', () => {
    const s = mkGame(['imp', 'poisoner', 'chef', 'empath', 'bureaucrat', 'monk'], { script: 'trouble-brewing' });
    begin(s);
    const x = s.nightQueue.find((q) => q.kind === 'bureaucrat')!;
    st(s, { type: 'resolve_step', stepId: x.id, seats: [2] });
    expect(P(s, 2).reminders).toContain('Vote counts x3');
  });

  it('an impaired Traveller ability does nothing', () => {
    const s = mkGame(['imp', 'poisoner', 'chef', 'empath', 'bureaucrat', 'monk'], { script: 'trouble-brewing' });
    begin(s);
    st(s, { type: 'set_status', seat: 4, poisoned: true });
    const x = s.nightQueue.find((q) => q.kind === 'bureaucrat')!;
    st(s, { type: 'resolve_step', stepId: x.id, seats: [2] });
    expect(P(s, 2).reminders).not.toContain('Vote counts x3');
    expect(x.outcome).toMatch(/drunk\/poisoned/);
  });

  it('the Gunslinger has a public day ability and the Scapegoat does not act at night', () => {
    expect(ROLES.gunslinger.dayAbility).toBeDefined();
    expect(ROLES.scapegoat.firstNight).toBeNull();
    expect(ROLES.scapegoat.otherNight).toBeNull();
    expect(ROLES.scapegoat.nightNote).toBeTruthy();
  });

  it('the Gunslinger kills the player it shoots, once', () => {
    const s = mkGame(['imp', 'poisoner', 'chef', 'empath', 'gunslinger', 'monk'], { script: 'trouble-brewing' });
    begin(s);
    finishNight(s);
    toDay(s);
    act(s, 4, { type: 'slayerShot', targetSeat: 2 });
    expect(alive(s, 2)).toBe(false);
  });
});

describe('Fabled', () => {
  it('the Sentinel changes the Outsider count and the rest are pure guidance', () => {
    expect(ROLES.sentinel.setupModifier).toBeDefined();
    for (const c of FABLED_IDS) {
      expect(ROLES[c].resolve, c).toBeUndefined();
      // Every Fabled must tell the Storyteller something, since that is all they are.
      expect(Boolean(ROLES[c].nightNote || ROLES[c].setupNote), c).toBe(true);
    }
  });

  it('Fabled are not on any playable script pool', () => {
    for (const script of ['trouble-brewing', 'bad-moon-rising', 'sects-and-violets'] as const) {
      for (const c of FABLED_IDS) expect(charactersOfScript(script), `${script}: ${c}`).not.toContain(c);
    }
  });
});
