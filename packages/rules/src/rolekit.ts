// The role-definition contract plus the helpers every script's character table is built from.
//
// Kept separate from roles.ts (which only assembles the registry) so a script module can import
// the kit without importing the registry it is part of.
//
// A character is DATA + OPTIONAL HOOKS. The engine calls the hooks; it never special-cases a
// character id. Everything is optional: a character whose ability is pure Storyteller judgement
// needs only a night-order position and (usually) a prompt — which is the right answer for a lot
// of Bad Moon Rising / Sects & Violets abilities, and matches the product rule that the engine
// advises and never gates (docs/vision.md principle 2).
import {
  CHARACTER_INFO,
  type CharacterId,
  type CharacterType,
  type InfoSpecInput,
  type PromptSpecInput,
} from '@ct/protocol';
import { RuleError, type GameState, type NightStep, type PlayerState, type Rng } from './types.js';
import {
  charName,
  pick,
  playerAt,
  registrationNotes,
  shuffle,
  typeOf,
  who,
  type Op,
} from './util.js';

export interface StepSuggestion {
  /** One line for the Storyteller's night step ("Show Chef number: 1"). */
  text: string;
  /** Ready-to-send info; the ST always presses send, nothing is delivered automatically. */
  info?: InfoSpecInput;
  notes?: string[];
}

export interface ResolveInput {
  seats?: number[];
  /** Imp star-pass: which Minion becomes the Demon. */
  starpassSeat?: number;
  /** Mayor bounce / any redirected death. */
  redirectSeat?: number;
  character?: CharacterId;
  yes?: boolean;
}

export interface SetupCounts {
  townsfolk: number;
  outsiders: number;
  minions: number;
  demons: number;
}

export type DeathCause = 'demon' | 'execution' | 'slayer' | 'virgin' | 'storyteller' | 'starpass';

/** Why a night kill did not land (returned by `preventsKill` so the ST sees the reason). */
export interface KillPrevention {
  reason: string;
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

  // ----------------------------------------------------------------- multi-script hooks (2026-10-16)

  /**
   * Changes the setup distribution when this character is in play (Baron: +2 Outsiders).
   * Applied once per character in play, in catalogue order, before characters are drawn.
   */
  setupModifier?: (counts: SetupCounts, playerCount: number) => SetupCounts;
  /** Shown in the ST's setup sheet next to the character. */
  setupNote?: string;
  /** Setup must choose a good player who registers falsely to this character (Fortune Teller). */
  wantsRedHerring?: boolean;
  /**
   * This player is told they are a DIFFERENT character of the given type, and their own ability
   * never works (Drunk → a Townsfolk; Lunatic → the Demon; Marionette → a Townsfolk).
   */
  believesOther?: CharacterType;
  /** Reminder tokens the Storyteller uses for this character (offered in the Grimoire). */
  reminders?: readonly string[];
  /** Advisory text when another character is also in play: `{ otherCharacterId: 'note' }`. */
  jinxes?: Readonly<Record<string, string>>;
  /** Extra line in the ST's night-order panel. */
  nightNote?: string;

  /**
   * Stops a night kill aimed at this player (Soldier). Return a reason to prevent it. Checked for
   * the VICTIM, after protection reminders, for `cause: 'demon'` kills.
   */
  preventsKill?: (s: GameState, p: PlayerState, cause: DeathCause) => KillPrevention | null;
  /** This player just died. Use for dynamic wakes (Ravenkeeper) and death-triggered state. */
  onDeath?: (s: GameState, op: Op, p: PlayerState, cause: DeathCause) => void;
  /**
   * This player was nominated. Return 'cancelled' if the nomination must not proceed to a vote
   * (Virgin executing the nominator).
   */
  onNominated?: (s: GameState, op: Op, p: PlayerState, nominator: PlayerState) => 'cancelled' | void;
  /**
   * This player is being executed, before the kill lands. Return 'handled' if the hook performed
   * the death itself (Saint, which also ends the game).
   */
  onExecuted?: (s: GameState, op: Op, p: PlayerState, cause: 'execution' | 'virgin') => 'handled' | void;
  /** End of day with no execution. Return true if the game ended (Mayor). */
  onEndOfDay?: (s: GameState, op: Op, p: PlayerState) => boolean | void;
  /** The Demon died and no Demon is alive. Return true if this character took over. */
  onDemonDeath?: (s: GameState, op: Op, p: PlayerState, aliveBefore: number) => boolean | void;
  /** Public daytime ability resolved through `slayer_shot`-style commands. */
  dayAbility?: {
    /** Button label in the player's HUD. */
    label: string;
    /** Resolve a public claim. Returns the public outcome text. */
    resolve: (s: GameState, op: Op, shooter: PlayerState, targetPlayer: PlayerState) => string;
  };
}

/** A script's character table: `{ [characterId]: definition }` without the id/type boilerplate. */
export type ScriptRoleDefs = Partial<Record<CharacterId, Omit<RoleDef, 'id' | 'type'>>>;

// ------------------------------------------------------------------------------------- helpers

/** Standard "choose N players" prompt. */
export const choose = (
  title: string,
  n: number,
  allowSelf: boolean,
  allowDead: boolean,
  body?: string,
): PromptSpecInput => ({
  kind: 'choose_players',
  title,
  ...(body ? { body } : {}),
  minTargets: n,
  maxTargets: n,
  allowSelf,
  allowDead,
});

/** "choose between min and max players" (Fang Gu-style variable targets). */
export const chooseRange = (
  title: string,
  min: number,
  max: number,
  allowSelf: boolean,
  allowDead: boolean,
  body?: string,
): PromptSpecInput => ({
  kind: 'choose_players',
  title,
  ...(body ? { body } : {}),
  minTargets: min,
  maxTargets: max,
  allowSelf,
  allowDead,
});

export const chooseCharacter = (title: string, options: CharacterId[], body?: string): PromptSpecInput => ({
  kind: 'choose_character',
  title,
  ...(body ? { body } : {}),
  characterOptions: options,
});

export const yesNo = (title: string, body?: string): PromptSpecInput => ({
  kind: 'yes_no',
  title,
  ...(body ? { body } : {}),
});

export const acknowledge = (title: string, body?: string): PromptSpecInput => ({
  kind: 'acknowledge',
  title,
  ...(body ? { body } : {}),
});

/** The idx-th chosen target of a step (from the ST's override or the player's answer). */
export function target(s: GameState, input: ResolveInput, step: NightStep, idx = 0): PlayerState {
  const seat = (input.seats ?? step.response?.seats)?.[idx];
  if (seat === undefined) throw new RuleError('invalid', 'No target chosen yet (wait for the answer or pick seats)');
  const t = playerAt(s, seat);
  if (!t) throw new RuleError('not_found', `No player in seat ${seat + 1}`);
  return t;
}

/** Every chosen target of a step (may be empty while the answer is outstanding). */
export function chosen(s: GameState, step: NightStep): PlayerState[] {
  return (step.response?.seats ?? []).map((x) => playerAt(s, x)).filter((x): x is PlayerState => !!x);
}

/** Targets passed by the ST's resolve override, falling back to the player's answer. */
export function targets(s: GameState, input: ResolveInput, step: NightStep): PlayerState[] {
  const seats = input.seats ?? step.response?.seats ?? [];
  return seats.map((x) => playerAt(s, x)).filter((x): x is PlayerState => !!x);
}

/** "One of A or B is the X" pair: a real holder of `type` plus a decoy (excluding the viewer). */
export function pairPick(s: GameState, p: PlayerState, rng: Rng, type: CharacterType): NightStep['fixed'] {
  const holders = s.players.filter((q) => q !== p && typeOf(q.character) === type);
  if (!holders.length) return { seats: [], character: null, number: 0 };
  const real = pick(rng, holders);
  const decoy = pick(
    rng,
    s.players.filter((q) => q !== p && q !== real),
  );
  return { seats: shuffle(rng, [real.seat, decoy.seat]), character: real.character };
}

export function pairSuggestion(s: GameState, step: NightStep, noneText: string): StepSuggestion {
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

export function isEvilTruth(p: PlayerState): boolean {
  return p.alignment === 'evil';
}

/** Characters of a type, across the whole catalogue (scripts narrow this themselves). */
export const ALL_CHARACTERS_OF = (t: CharacterType): CharacterId[] =>
  (Object.keys(CHARACTER_INFO) as CharacterId[]).filter((c) => CHARACTER_INFO[c].type === t);
