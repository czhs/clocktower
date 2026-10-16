// OWNED BY auto-st. Every chance decision of an automatic game is LEGAL: fate's info (truthful with
// Spy/Recluse registration, or false when impaired), timeout answers, star-pass, Mayor bounce, and the
// engine's adjudicator hooks (Virgin + Spy, Slayer + Recluse, Butler) — across many seeds.
import { CHARACTER_INFO, type CharacterId, type CharacterType, type StCommand } from '@ct/protocol';
import { applyPlayerAction, applyStCommand, createGame, mulberry32, ROLES, type GameState, type PlayerState } from '@ct/rules';
import { describe, expect, it } from 'vitest';
import { decideImp, decideInfo, randomAnswer } from '../src/auto/fate.js';

let now = 1_000_000;
function game(chars: CharacterId[], o: { drunkBelieves?: CharacterId; redHerringSeat?: number; seed?: number } = {}): GameState {
  const s = createGame({ players: chars.map((_, i) => ({ pid: `p${i}`, seat: i, name: `P${i + 1}` })), rng: mulberry32(o.seed ?? 1), now });
  st(s, {
    type: 'assign_characters',
    assignments: chars.map((character, seat) => ({ seat, character })),
    ...(o.drunkBelieves ? { drunkBelievesSeatCharacter: o.drunkBelieves } : {}),
    ...(o.redHerringSeat !== undefined ? { redHerringSeat: o.redHerringSeat } : {}),
    demonBluffs: [],
    allowNonstandard: true,
  });
  return s;
}
function st(s: GameState, c: StCommand) {
  now += 100;
  const r = applyStCommand(s, c, { now });
  if (!r.ok) throw new Error(`${c.type}: ${r.error}`);
}
const typeOf = (c: CharacterId): CharacterType => CHARACTER_INFO[c].type;
const healthy = (p: PlayerState) => p.character !== 'drunk' && !p.drunkOverride && p.poisonedBy === null;
const at = (s: GameState, seat: number) => s.players.find((p) => p.seat === seat)!;

/** May `p` register as a `t` (healthy Spy: Townsfolk/Outsider; healthy Recluse: Minion/Demon)? */
function mayRegisterAs(p: PlayerState, t: CharacterType): boolean {
  if (typeOf(p.character) === t) return true;
  if (p.character === 'spy' && healthy(p)) return t === 'townsfolk' || t === 'outsider';
  if (p.character === 'recluse' && healthy(p)) return t === 'minion' || t === 'demon';
  return false;
}
function mayRegisterAsChar(p: PlayerState, c: CharacterId): boolean {
  return c === p.character || (mayRegisterAs(p, typeOf(c)) && typeOf(c) !== typeOf(p.character));
}
const evilMin = (p: PlayerState) => p.alignment === 'evil' && !(p.character === 'spy' && healthy(p));
const evilMax = (p: PlayerState) => p.alignment === 'evil' || (p.character === 'recluse' && healthy(p));
function pairs(s: GameState, evil: (p: PlayerState) => boolean) {
  const ring = [...s.players].sort((a, b) => a.seat - b.seat);
  let n = 0;
  for (let i = 0; i < ring.length; i++) if (evil(ring[i]!) && evil(ring[(i + 1) % ring.length]!)) n++;
  return n;
}
function neighbours(s: GameState, p: PlayerState) {
  const ring = [...s.players].sort((a, b) => a.seat - b.seat);
  const i = ring.indexOf(p);
  const out: PlayerState[] = [];
  for (let k = 1; k < ring.length; k++) if (ring[(i + k) % ring.length]!.alive) { out.push(ring[(i + k) % ring.length]!); break; }
  for (let k = 1; k < ring.length; k++) if (ring[(i - k + ring.length) % ring.length]!.alive) { const q = ring[(i - k + ring.length) % ring.length]!; if (!out.includes(q)) out.push(q); break; }
  return out;
}

const SETUPS: { chars: CharacterId[]; drunkBelieves?: CharacterId; redHerringSeat?: number }[] = [
  // Spy + Recluse in play, healthy
  { chars: ['imp', 'spy', 'recluse', 'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortune_teller', 'undertaker'], redHerringSeat: 3 },
  // the Drunk believes he is several info roles
  { chars: ['imp', 'poisoner', 'drunk', 'washerwoman', 'butler', 'saint', 'monk'], drunkBelieves: 'chef' },
  { chars: ['imp', 'baron', 'drunk', 'recluse', 'saint', 'butler', 'mayor', 'slayer'], drunkBelieves: 'fortune_teller' },
  // no Outsiders, no misregistration
  { chars: ['imp', 'scarlet_woman', 'washerwoman', 'librarian', 'investigator', 'chef', 'empath'], redHerringSeat: 2 },
];

describe('fate: night info is always legal', () => {
  it('healthy info roles: truthful up to Spy/Recluse registration (400 seeds × 4 setups)', () => {
    for (const setup of SETUPS) {
      for (let seed = 1; seed <= 400; seed++) {
        const s = game(setup.chars, { ...setup, seed });
        const rng = mulberry32(seed * 31);
        for (const p of s.players) {
          const kind = p.character === 'drunk' ? p.believedCharacter : p.character;
          if (!['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortune_teller', 'undertaker', 'ravenkeeper'].includes(kind)) continue;
          if (kind === 'undertaker') s.lastExecutedDiedSeat = (p.seat + 1) % s.players.length;
          const others = s.players.filter((q) => q !== p).map((q) => q.seat);
          const chosen = kind === 'fortune_teller' ? [others[seed % others.length]!, others[(seed * 7 + 1) % others.length]!].filter((x, i, a) => a.indexOf(x) === i) : kind === 'ravenkeeper' ? [others[seed % others.length]!] : [];
          const d = decideInfo(s, rng, p, kind, chosen);
          expect(d.info.text.length).toBeGreaterThan(0);
          for (const x of d.info.seats ?? []) expect(s.players.some((q) => q.seat === x)).toBe(true);
          const bad = !healthy(p) || kind !== p.character;
          expect(d.falseInfo).toBe(bad);
          if (bad) continue;
          if (kind === 'washerwoman' || kind === 'librarian' || kind === 'investigator') {
            const t: CharacterType = kind === 'washerwoman' ? 'townsfolk' : kind === 'librarian' ? 'outsider' : 'minion';
            if (d.info.number === 0) {
              // only legal when nobody is CERTAINLY of that type (a healthy Spy/Recluse may misregister)
              const canMis = (q: PlayerState) => (q.character === 'spy' || q.character === 'recluse') && healthy(q);
              expect(s.players.some((q) => q !== p && typeOf(q.character) === t && !canMis(q))).toBe(false);
              continue;
            }
            const [a, b] = d.info.seats!;
            expect(a).not.toBe(b);
            expect([a, b]).not.toContain(p.seat);
            const c = d.info.characters![0]!;
            expect(typeOf(c)).toBe(t);
            expect([a!, b!].some((x) => mayRegisterAsChar(at(s, x), c))).toBe(true);
          } else if (kind === 'chef') {
            expect(d.info.number!).toBeGreaterThanOrEqual(pairs(s, evilMin));
            expect(d.info.number!).toBeLessThanOrEqual(pairs(s, evilMax));
          } else if (kind === 'empath') {
            const nb = neighbours(s, p);
            expect(d.info.number!).toBeGreaterThanOrEqual(nb.filter(evilMin).length);
            expect(d.info.number!).toBeLessThanOrEqual(nb.filter(evilMax).length);
          } else if (kind === 'fortune_teller') {
            const picks = chosen.map((x) => at(s, x));
            const sure = picks.some((q) => typeOf(q.character) === 'demon' || q.seat === s.redHerringSeat);
            const maybe = picks.some((q) => q.character === 'recluse' && healthy(q));
            if (sure) expect(d.info.yes).toBe(true);
            else if (!maybe) expect(d.info.yes).toBe(false);
          } else {
            const target = kind === 'undertaker' ? at(s, s.lastExecutedDiedSeat!) : at(s, chosen[0]!);
            expect(mayRegisterAsChar(target, d.info.characters![0]!)).toBe(true);
          }
        }
      }
    }
  });

  it('drunk / poisoned info roles get plausible FALSE info (differs from the truth whenever the range allows)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = game(['imp', 'poisoner', 'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortune_teller', 'saint'], { seed, redHerringSeat: 2 });
      for (const p of s.players) p.poisonedBy = typeOf(p.character) === 'townsfolk' ? 'poisoner' : null;
      const rng = mulberry32(seed);
      for (const p of s.players.filter((q) => typeOf(q.character) === 'townsfolk')) {
        const kind = p.character;
        const chosen = kind === 'fortune_teller' ? [0, 8] : [];
        const d = decideInfo(s, rng, p, kind, chosen);
        expect(d.falseInfo).toBe(true);
        if (kind === 'chef') expect(d.info.number).not.toBe(pairs(s, (q) => q.alignment === 'evil'));
        if (kind === 'empath') expect(d.info.number).not.toBe(neighbours(s, p).filter((q) => q.alignment === 'evil').length);
        if (kind === 'fortune_teller') expect(d.info.yes).toBe(false); // truth: seat 0 is the Imp
        if (kind === 'washerwoman' || kind === 'librarian' || kind === 'investigator') {
          const [a, b] = d.info.seats!;
          expect(a).not.toBe(b);
          expect([a, b]).not.toContain(p.seat);
          expect([a!, b!].some((x) => at(s, x).character === d.info.characters![0])).toBe(false);
        }
      }
    }
  });
});

describe('fate: prompt answers, star-pass and Mayor bounce are legal', () => {
  it('random answers to every night prompt pass the engine’s validation (incl. dead players)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = game(['imp', 'poisoner', 'monk', 'fortune_teller', 'butler', 'ravenkeeper', 'empath', 'chef'], { seed, redHerringSeat: 2 });
      st(s, { type: 'begin_first_night' });
      // kill two players publicly so allowDead matters
      at(s, 6).alive = false;
      at(s, 6).publicAlive = false;
      at(s, 7).alive = false;
      at(s, 7).publicAlive = false;
      const rng = mulberry32(seed);
      for (const p of s.players.filter((q) => q.alive)) {
        const def = ROLES[p.character];
        if (!def.prompt) continue;
        st(s, { type: 'prompt_player', seat: p.seat, prompt: def.prompt(s, p) });
        const q = p.prompts.at(-1)!;
        const a = randomAnswer(s, rng, p, {
          id: q.id,
          kind: q.kind,
          title: q.title,
          ...(q.minTargets !== undefined ? { minTargets: q.minTargets } : {}),
          ...(q.maxTargets !== undefined ? { maxTargets: q.maxTargets } : {}),
          ...(q.allowSelf !== undefined ? { allowSelf: q.allowSelf } : {}),
          ...(q.allowDead !== undefined ? { allowDead: q.allowDead } : {}),
        });
        const r = applyPlayerAction(s, p.seat, { type: 'promptResponse', promptId: q.id, ...a }, { now: (now += 10) });
        expect(r.ok, JSON.stringify({ role: p.character, a })).toBe(true);
        // sensible: prefers living players other than themself
        for (const x of a.seats ?? []) expect(at(s, x).publicAlive && x !== p.seat).toBe(true);
      }
    }
  });

  it('star-pass goes to a living Minion; a Mayor bounce goes to a living non-Mayor, non-Demon player', () => {
    let bounces = 0;
    let stays = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = game(['imp', 'poisoner', 'spy', 'mayor', 'soldier', 'monk', 'empath', 'chef', 'saint', 'washerwoman'], { seed });
      if (seed % 3 === 0) at(s, 1).alive = false;
      const rng = mulberry32(seed);
      const imp = at(s, 0);
      const self = decideImp(s, rng, imp, { id: 'x', seat: 0, kind: 'imp', order: 30, status: 'answered', response: { seats: [0] } });
      expect(s.players.find((q) => q.seat === self.starpassSeat)).toMatchObject({ alive: true });
      expect(typeOf(at(s, self.starpassSeat!).character)).toBe('minion');
      const m = decideImp(s, rng, imp, { id: 'y', seat: 0, kind: 'imp', order: 30, status: 'answered', response: { seats: [3] } });
      if (m.redirectSeat === undefined) stays++;
      else {
        bounces++;
        const r = at(s, m.redirectSeat);
        expect(r.alive).toBe(true);
        expect(r.character).not.toBe('mayor');
        expect(typeOf(r.character)).not.toBe('demon');
      }
      // a poisoned Mayor never bounces; the impaired Imp decides nothing
      at(s, 3).poisonedBy = 'poisoner';
      expect(decideImp(s, rng, imp, { id: 'z', seat: 0, kind: 'imp', order: 30, status: 'answered', response: { seats: [3] } }).redirectSeat).toBeUndefined();
    }
    expect(bounces).toBeGreaterThan(50);
    expect(stays).toBeGreaterThan(50);
  });
});

describe('engine adjudicator hooks (automatic games only)', () => {
  const day = (s: GameState) => {
    st(s, { type: 'begin_first_night' });
    st(s, { type: 'advance_phase', to: 'day' });
    st(s, { type: 'set_nominations_open', open: true });
  };

  it('Virgin + Spy: the ruling decides; without an adjudicator the engine only alerts (human games unchanged)', () => {
    for (const ruling of [true, false, undefined]) {
      const s = game(['imp', 'spy', 'virgin', 'chef', 'empath', 'monk', 'saint']);
      if (ruling !== undefined) s.adjudicator = { spyRegistersAsTownsfolk: () => ruling };
      day(s);
      const r = applyPlayerAction(s, 1, { type: 'nominate', nomineeSeat: 2 }, { now: (now += 10) });
      expect(r.ok).toBe(true);
      expect(at(s, 1).alive).toBe(ruling !== true);
      expect(s.day!.executionOccurred).toBe(ruling === true);
      expect(s.alerts.some((a) => a.includes('Spy'))).toBe(ruling !== true);
    }
  });

  it('Slayer + Recluse: a "yes" ruling kills the Recluse as the Demon (no "Nothing happens")', () => {
    for (const ruling of [true, false, undefined]) {
      const s = game(['imp', 'poisoner', 'recluse', 'slayer', 'empath', 'monk', 'saint']);
      if (ruling !== undefined) s.adjudicator = { recluseRegistersAsDemon: () => ruling };
      day(s);
      expect(applyPlayerAction(s, 3, { type: 'slayerShot', targetSeat: 2 }, { now: (now += 10) }).ok).toBe(true);
      expect(at(s, 2).alive).toBe(ruling !== true);
      expect(s.announcements.at(-1)!.text.includes('Nothing happens')).toBe(ruling !== true);
      expect(at(s, 0).alive).toBe(true);
      expect(s.resultPending).toBe(false);
    }
  });

  it('Butler: with enforceButler the vote only counts when the master votes too (healthy, living Butler)', () => {
    const run = (o: { enforce: boolean; masterVotes: boolean; poisoned?: boolean }) => {
      const s = game(['imp', 'poisoner', 'butler', 'chef', 'empath', 'monk', 'saint']);
      if (o.enforce) s.adjudicator = { enforceButler: true };
      at(s, 2).butlerMasterSeat = 5;
      day(s);
      if (o.poisoned) at(s, 2).poisonedBy = 'poisoner';
      applyPlayerAction(s, 3, { type: 'nominate', nomineeSeat: 0 }, { now: (now += 10) });
      const n = s.day!.nominations[0]!;
      applyPlayerAction(s, 2, { type: 'vote', nominationId: n.id, vote: true }, { now: (now += 10) });
      if (o.masterVotes) applyPlayerAction(s, 5, { type: 'vote', nominationId: n.id, vote: true }, { now: (now += 10) });
      st(s, { type: 'start_vote', nominationId: n.id });
      st(s, { type: 'close_vote', mode: 'tally' });
      return n.votes[2];
    };
    expect(run({ enforce: true, masterVotes: false })).toBe(false);
    expect(run({ enforce: true, masterVotes: true })).toBe(true);
    expect(run({ enforce: true, masterVotes: false, poisoned: true })).toBe(true);
    expect(run({ enforce: false, masterVotes: false })).toBe(true); // human games: counted, ST alerted
  });

  it('the adjudicator survives undo snapshots and is never serialised', () => {
    const s = game(['imp', 'spy', 'virgin', 'chef', 'empath', 'monk', 'saint']);
    s.adjudicator = { enforceButler: true, spyRegistersAsTownsfolk: () => true };
    st(s, { type: 'begin_first_night' });
    st(s, { type: 'undo_last' });
    expect(s.adjudicator?.enforceButler).toBe(true);
    expect(typeof s.adjudicator?.spyRegistersAsTownsfolk).toBe('function');
    expect(JSON.stringify(s.history)).not.toContain('adjudicator');
  });
});
