// Modular role definitions: one plugin per Trouble Brewing character. Each plugin declares its
// type, night-order position (first night / other nights) and optional ability hooks:
//   wakes    extra wake condition (beyond being alive and acting as this character)
//   prompt   default ST prompt for the night step (choose players, ...)
//   prepare  stable engine picks made when the night queue is built (uses the injected RNG)
//   suggest  truthful suggestion for the ST (+ ready-to-send info); never sent automatically
//   resolve  apply the ability's state effect when the ST resolves the step
// Info roles are ST-in-the-loop: the ST delivers the final info via send_info.
import { CHARACTER_IDS, CHARACTER_INFO, type CharacterId, type CharacterType, type InfoSpecInput, type PromptSpecInput } from '@ct/protocol';
import { killPlayer, starPass } from './deaths.js';
import { RuleError, type GameState, type NightStep, type PlayerState, type Rng } from './types.js';
import {
  charName,
  impaired,
  livingNeighbours,
  log,
  pick,
  playerAt,
  registrationNotes,
  shuffle,
  typeOf,
  who,
  type Op,
} from './util.js';

export interface StepSuggestion {
  text: string;
  info?: InfoSpecInput;
  notes?: string[];
}

export interface ResolveInput {
  seats?: number[];
  starpassSeat?: number;
  redirectSeat?: number;
}

export interface RoleDef {
  id: CharacterId;
  type: CharacterType;
  /** Position in the first-night order (null = does not wake on the first night). */
  firstNight: number | null;
  /** Position in the other-nights order (null = does not wake). */
  otherNight: number | null;
  /** Only woken dynamically (Ravenkeeper on death); the order is used for insertion. */
  dynamicOrder?: number;
  wakes?: (s: GameState, p: PlayerState, firstNight: boolean) => boolean;
  prompt?: (s: GameState, p: PlayerState) => PromptSpecInput;
  prepare?: (s: GameState, p: PlayerState, rng: Rng) => NightStep['fixed'];
  suggest?: (s: GameState, p: PlayerState, step: NightStep) => StepSuggestion;
  resolve?: (s: GameState, op: Op, p: PlayerState, step: NightStep, input: ResolveInput) => string;
  /** send_info for this step completes it (no state effect to apply). */
  infoOnly?: boolean;
}

const choose = (title: string, n: number, allowSelf: boolean, allowDead: boolean, body?: string): PromptSpecInput => ({
  kind: 'choose_players',
  title,
  ...(body ? { body } : {}),
  minTargets: n,
  maxTargets: n,
  allowSelf,
  allowDead,
});

function target(s: GameState, input: ResolveInput, step: NightStep, idx = 0): PlayerState {
  const seat = (input.seats ?? step.response?.seats)?.[idx];
  if (seat === undefined) throw new RuleError('invalid', 'No target chosen yet (wait for the answer or pick seats)');
  const t = playerAt(s, seat);
  if (!t) throw new RuleError('not_found', `No player in seat ${seat + 1}`);
  return t;
}

function chosen(s: GameState, step: NightStep): PlayerState[] {
  return (step.response?.seats ?? []).map((x) => playerAt(s, x)).filter((x): x is PlayerState => !!x);
}

/** "One of A or B is the X" pair: a real holder of `type` plus a decoy (excluding the viewer). */
function pairPick(s: GameState, p: PlayerState, rng: Rng, type: CharacterType): NightStep['fixed'] {
  const holders = s.players.filter((q) => q !== p && typeOf(q.character) === type);
  if (!holders.length) return { seats: [], character: null, number: 0 };
  const real = pick(rng, holders);
  const decoy = pick(
    rng,
    s.players.filter((q) => q !== p && q !== real),
  );
  return { seats: shuffle(rng, [real.seat, decoy.seat]), character: real.character };
}

function pairSuggestion(s: GameState, step: NightStep, noneText: string): StepSuggestion {
  const f = step.fixed;
  if (!f?.seats?.length || !f.character) {
    return { text: noneText, info: { text: noneText, number: 0 }, notes: registrationNotes(s) };
  }
  const [a, b] = f.seats.map((x) => playerAt(s, x)!);
  const text = `One of ${a!.name} or ${b!.name} is the ${charName(f.character)}.`;
  return {
    text: `Show ${charName(f.character)}: ${who(a!)} / ${who(b!)}`,
    info: { text, seats: [...f.seats], characters: [f.character] },
    notes: registrationNotes(s),
  };
}

function isEvilTruth(p: PlayerState): boolean {
  return p.alignment === 'evil';
}

const defs: Partial<Record<CharacterId, Omit<RoleDef, 'id' | 'type'>>> = {
  // ------------------------------------------------------------------------- Townsfolk
  washerwoman: {
    firstNight: 40,
    otherNight: null,
    prepare: (s, p, rng) => pairPick(s, p, rng, 'townsfolk'),
    suggest: (s, _p, step) => pairSuggestion(s, step, 'There are no other Townsfolk in play.'),
    infoOnly: true,
  },
  librarian: {
    firstNight: 41,
    otherNight: null,
    prepare: (s, p, rng) => pairPick(s, p, rng, 'outsider'),
    suggest: (s, _p, step) => pairSuggestion(s, step, 'There are no Outsiders in play.'),
    infoOnly: true,
  },
  investigator: {
    firstNight: 42,
    otherNight: null,
    prepare: (s, p, rng) => pairPick(s, p, rng, 'minion'),
    suggest: (s, _p, step) => pairSuggestion(s, step, 'There are no Minions in play.'),
    infoOnly: true,
  },
  chef: {
    firstNight: 43,
    otherNight: null,
    suggest: (s) => {
      const seats = [...s.players].sort((a, b) => a.seat - b.seat);
      let pairs = 0;
      for (let i = 0; i < seats.length; i++) {
        const a = seats[i]!;
        const b = seats[(i + 1) % seats.length]!;
        if (isEvilTruth(a) && isEvilTruth(b)) pairs++;
      }
      const text = `${pairs} pair${pairs === 1 ? '' : 's'} of evil players sit next to each other.`;
      return { text: `Chef number: ${pairs}`, info: { text, number: pairs }, notes: registrationNotes(s) };
    },
    infoOnly: true,
  },
  empath: {
    firstNight: 44,
    otherNight: 44,
    suggest: (s, p) => {
      const nb = livingNeighbours(s, p.seat);
      const n = nb.filter(isEvilTruth).length;
      const text = `${n} of your living neighbours ${n === 1 ? 'is' : 'are'} evil.`;
      return {
        text: `Empath number: ${n} (neighbours ${nb.map(who).join(', ') || 'none'})`,
        info: { text, number: n },
        notes: registrationNotes(s, nb),
      };
    },
    infoOnly: true,
  },
  fortune_teller: {
    firstNight: 45,
    otherNight: 45,
    prompt: () => choose('Choose two players', 2, true, true, 'Learn whether either of them is the Demon.'),
    suggest: (s, _p, step) => {
      const picks = chosen(s, step);
      if (picks.length < 2) return { text: 'Waiting for the Fortune Teller to choose two players.' };
      const yes = picks.some((q) => typeOf(q.character) === 'demon' || q.seat === s.redHerringSeat);
      const herring = picks.some((q) => q.seat === s.redHerringSeat);
      const text = yes ? 'Yes — one of them is the Demon.' : 'No — neither of them is the Demon.';
      return {
        text: `Fortune Teller: ${yes ? 'YES' : 'NO'}${herring ? ' (red herring chosen)' : ''}`,
        info: { text, yes, seats: picks.map((q) => q.seat) },
        notes: registrationNotes(s, picks),
      };
    },
    infoOnly: true,
  },
  undertaker: {
    firstNight: null,
    otherNight: 46,
    wakes: (s) => s.lastExecutedDiedSeat !== null,
    suggest: (s) => {
      const x = s.lastExecutedDiedSeat === null ? undefined : playerAt(s, s.lastExecutedDiedSeat);
      if (!x) return { text: 'Nobody died by execution today.' };
      const text = `The player executed today was the ${charName(x.character)}.`;
      return {
        text: `Undertaker: ${who(x)} was the ${charName(x.character)}`,
        info: { text, seats: [x.seat], characters: [x.character] },
        notes: registrationNotes(s, [x]),
      };
    },
    infoOnly: true,
  },
  monk: {
    firstNight: null,
    otherNight: 25,
    prompt: () => choose('Choose a player to protect', 1, false, false),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      return { text: t ? `Protect ${who(t)} from the Demon tonight.` : 'Waiting for the Monk to choose a player.' };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (t === p) throw new RuleError('invalid', 'The Monk cannot protect themself');
      if (impaired(p)) return `Monk ${who(p)} is drunk/poisoned: ${who(t)} is not protected.`;
      t.protectedTonight = true;
      log(s, op, `Monk protects ${who(t)}`);
      return `${who(t)} is protected tonight.`;
    },
  },
  ravenkeeper: {
    firstNight: null,
    otherNight: null,
    dynamicOrder: 35,
    prompt: () => choose('Choose a player', 1, true, true, 'You died tonight. Learn the character of one player.'),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the Ravenkeeper to choose a player.' };
      const text = `${t.name} is the ${charName(t.character)}.`;
      return {
        text: `Ravenkeeper: ${who(t)} is the ${charName(t.character)}`,
        info: { text, seats: [t.seat], characters: [t.character] },
        notes: registrationNotes(s, [t]),
      };
    },
    infoOnly: true,
  },
  virgin: { firstNight: null, otherNight: null },
  slayer: { firstNight: null, otherNight: null },
  soldier: { firstNight: null, otherNight: null },
  mayor: { firstNight: null, otherNight: null },
  // -------------------------------------------------------------------------- Outsiders
  butler: {
    firstNight: 50,
    otherNight: 50,
    prompt: () => choose('Choose your master', 1, false, true, 'Tomorrow you may only vote if your master votes too.'),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      return { text: t ? `Butler's master: ${who(t)}` : 'Waiting for the Butler to choose a master.' };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (t === p) throw new RuleError('invalid', 'The Butler cannot choose themself');
      p.butlerMasterSeat = t.seat;
      log(s, op, `Butler ${who(p)} chose master ${who(t)}`);
      return `Master: ${who(t)}.`;
    },
  },
  drunk: { firstNight: null, otherNight: null },
  recluse: { firstNight: null, otherNight: null },
  saint: { firstNight: null, otherNight: null },
  // ---------------------------------------------------------------------------- Minions
  poisoner: {
    firstNight: 20,
    otherNight: 20,
    prompt: () => choose('Choose a player to poison', 1, true, false),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      return { text: t ? `Poison ${who(t)} (tonight and tomorrow).` : 'Waiting for the Poisoner to choose a player.' };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (impaired(p)) return `Poisoner ${who(p)} is poisoned/drunk: no effect.`;
      for (const q of s.players) if (q.poisonedBy === 'poisoner') q.poisonedBy = null;
      if (t.poisonedBy === null) t.poisonedBy = 'poisoner';
      log(s, op, `Poisoner poisons ${who(t)}`);
      return `${who(t)} is poisoned.`;
    },
  },
  spy: {
    firstNight: 60,
    otherNight: 60,
    suggest: (s, p) => ({
      text: 'Resolve to show the Spy the Grimoire (a snapshot appears in their HUD).',
      notes: impaired(p) ? [`Spy ${who(p)} is poisoned: you may skip instead.`] : [],
    }),
    resolve: (s, op, p) => {
      p.spyGrimoire = {
        night: s.nightNumber,
        entries: s.players.map((q) => ({
          seat: q.seat,
          name: q.name,
          character: q.character,
          alignment: q.alignment,
          alive: q.alive,
          poisoned: q.poisonedBy !== null,
          drunk: q.character === 'drunk' || q.drunkOverride,
          reminders: [...q.reminders],
        })),
      };
      log(s, op, `Spy ${who(p)} saw the Grimoire`);
      return 'Grimoire shown to the Spy.';
    },
  },
  scarlet_woman: { firstNight: null, otherNight: null },
  baron: { firstNight: null, otherNight: null },
  // ------------------------------------------------------------------------------ Demon
  imp: {
    firstNight: null,
    otherNight: 30,
    prompt: () => choose('Choose a player to kill', 1, true, true),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the Imp to choose a player.' };
      const notes: string[] = [];
      let text: string;
      if (impaired(p)) text = `Imp is poisoned: ${who(t)} survives.`;
      else if (t === p) {
        const sw = s.players.find((q) => q.alive && q.character === 'scarlet_woman' && !impaired(q));
        const alive = s.players.filter((q) => q.alive).length;
        text = `Imp self-kill: a Minion becomes the Imp${sw && alive >= 5 ? ` (Scarlet Woman ${who(sw)} has priority)` : ''}.`;
        notes.push('Pass starpassSeat when resolving to choose which Minion becomes the Imp.');
      } else if (!t.alive) text = `${who(t)} is already dead: nothing happens.`;
      else if (t.protectedTonight) text = `${who(t)} is protected by the Monk: nobody dies.`;
      else if (t.character === 'soldier' && !impaired(t)) text = `${who(t)} is a healthy Soldier: nobody dies.`;
      else if (t.character === 'mayor' && !impaired(t)) {
        text = `${who(t)} is the Mayor: they die unless you bounce the kill.`;
        notes.push('Pass redirectSeat when resolving to have another player die instead.');
      } else text = `${who(t)} dies.`;
      return { text, notes };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (impaired(p)) return `Imp ${who(p)} is poisoned: no kill.`;
      if (t === p) {
        if (p.protectedTonight) return `Imp ${who(p)} chose themself but is protected by the Monk.`;
        return starPass(s, op, p, input.starpassSeat);
      }
      if (!t.alive) return `${who(t)} was already dead.`;
      if (t.protectedTonight) return `${who(t)} was protected by the Monk.`;
      if (t.character === 'soldier' && !impaired(t)) return `${who(t)} is the Soldier and survives.`;
      let victim = t;
      if (t.character === 'mayor' && !impaired(t) && input.redirectSeat !== undefined) {
        const r = playerAt(s, input.redirectSeat);
        if (!r) throw new RuleError('not_found', 'Redirect seat is not a player');
        if (!r.alive) return `Mayor's kill bounced to ${who(r)}, who was already dead.`;
        victim = r;
      }
      killPlayer(s, op, victim, 'demon');
      return victim === t ? `${who(t)} was killed.` : `Mayor bounce: ${who(victim)} was killed instead of ${who(t)}.`;
    },
  },
};

export const ROLES: Readonly<Record<CharacterId, RoleDef>> = Object.fromEntries(
  CHARACTER_IDS.map((id) => {
    const d = defs[id];
    if (!d) throw new Error(`missing role definition for ${id}`);
    return [id, { id, type: CHARACTER_INFO[id].type, ...d }];
  }),
) as Record<CharacterId, RoleDef>;

/** First-night order of character wakes (for docs/UI). */
export const FIRST_NIGHT_ORDER: CharacterId[] = CHARACTER_IDS.filter((c) => ROLES[c].firstNight !== null).sort(
  (a, b) => ROLES[a].firstNight! - ROLES[b].firstNight!,
);
export const OTHER_NIGHT_ORDER: CharacterId[] = CHARACTER_IDS.filter(
  (c) => ROLES[c].otherNight !== null || ROLES[c].dynamicOrder !== undefined,
).sort((a, b) => (ROLES[a].otherNight ?? ROLES[a].dynamicOrder!) - (ROLES[b].otherNight ?? ROLES[b].dynamicOrder!));
