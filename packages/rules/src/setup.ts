import {
  CHARACTER_INFO,
  charactersOfScript,
  isSeatedType,
  type CharacterId,
  type ScriptId,
} from '@ct/protocol';
import { ROLES } from './roles.js';
import type { SetupCounts } from './rolekit.js';
import { RuleError, type GameState, type Rng } from './types.js';
import { pick, shuffle, typeOf } from './util.js';

export type { SetupCounts } from './rolekit.js';

export const DEFAULT_SCRIPT: ScriptId = 'trouble-brewing';

/** Human-readable character-type labels used in Storyteller-facing messages. */
const TYPE_LABEL: Partial<Record<string, string>> = {
  townsfolk: 'Townsfolk',
  outsider: 'Outsider',
  minion: 'Minion',
  demon: 'Demon',
  traveller: 'Traveller',
  fabled: 'Fabled',
};

/**
 * Base distribution by player count. The three official scripts share this table; characters
 * change it through their own `setupModifier` hook (Baron: +2 Outsiders, and the Bad Moon Rising /
 * Sects & Violets equivalents).
 */
export const SETUP_TABLE: Readonly<Record<number, SetupCounts>> = {
  5: { townsfolk: 3, outsiders: 0, minions: 1, demons: 1 },
  6: { townsfolk: 3, outsiders: 1, minions: 1, demons: 1 },
  7: { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
  8: { townsfolk: 5, outsiders: 1, minions: 1, demons: 1 },
  9: { townsfolk: 5, outsiders: 2, minions: 1, demons: 1 },
  10: { townsfolk: 7, outsiders: 0, minions: 2, demons: 1 },
  11: { townsfolk: 7, outsiders: 1, minions: 2, demons: 1 },
  12: { townsfolk: 7, outsiders: 2, minions: 2, demons: 1 },
  13: { townsfolk: 9, outsiders: 0, minions: 3, demons: 1 },
  14: { townsfolk: 9, outsiders: 1, minions: 3, demons: 1 },
  15: { townsfolk: 9, outsiders: 2, minions: 3, demons: 1 },
};

/**
 * Distribution for `n` players after every in-play character's setup modifier.
 * `inPlay` may be a partial draw (the minions are known before the townsfolk are drawn).
 *
 * The legacy boolean form (`setupCounts(n, true)` = "with the Baron") is still accepted.
 */
export function setupCounts(n: number, inPlay: readonly CharacterId[] | boolean = []): SetupCounts {
  const base = SETUP_TABLE[n];
  if (!base) throw new RuleError('invalid', `A game needs 5-15 players (got ${n})`);
  const chars: readonly CharacterId[] = inPlay === true ? ['baron'] : inPlay === false ? [] : inPlay;
  let counts: SetupCounts = { ...base };
  for (const c of chars) {
    const mod = ROLES[c]?.setupModifier;
    if (mod) counts = mod(counts, n);
  }
  // A modifier must never ask for more or fewer players than are seated.
  const total = counts.townsfolk + counts.outsiders + counts.minions + counts.demons;
  if (total !== n) {
    const spill = total - n;
    counts = { ...counts, townsfolk: counts.townsfolk - spill };
  }
  return clampCounts(counts, n);
}

function clampCounts(c: SetupCounts, n: number): SetupCounts {
  const out = {
    townsfolk: Math.max(0, c.townsfolk),
    outsiders: Math.max(0, c.outsiders),
    minions: Math.max(0, c.minions),
    demons: Math.max(1, c.demons),
  };
  const total = out.townsfolk + out.outsiders + out.minions + out.demons;
  if (total !== n) out.townsfolk = Math.max(0, out.townsfolk + (n - total));
  return out;
}

/** Characters of a type within one script's pool. */
export const ALL_OF = (t: 'townsfolk' | 'outsider' | 'minion' | 'demon', script: ScriptId = DEFAULT_SCRIPT): CharacterId[] =>
  charactersOfScript(script).filter((c) => CHARACTER_INFO[c].type === t);

export interface Assignment {
  bySeat: Map<number, CharacterId>;
  /** What the Drunk (or any `believesOther` character) is told they are. */
  drunkBelieves: CharacterId | null;
  redHerringSeat: number | null;
  demonBluffs: CharacterId[];
  /** The script this assignment was drawn from (defaults to Trouble Brewing). */
  script?: ScriptId;
}

export function countTypes(chars: readonly CharacterId[]): SetupCounts {
  const c: SetupCounts = { townsfolk: 0, outsiders: 0, minions: 0, demons: 0 };
  for (const ch of chars) {
    const t = typeOf(ch);
    // Travellers and Fabled sit outside the distribution.
    if (!isSeatedType(t)) continue;
    if (t === 'townsfolk') c.townsfolk++;
    else if (t === 'outsider') c.outsiders++;
    else if (t === 'minion') c.minions++;
    else c.demons++;
  }
  return c;
}

/** Good characters of `script` not in play (excluding `believesOther` roles and `exclude`). */
function goodNotInPlay(
  inPlayChars: readonly CharacterId[],
  exclude: readonly CharacterId[] = [],
  script: ScriptId = DEFAULT_SCRIPT,
): CharacterId[] {
  return charactersOfScript(script).filter(
    (c) =>
      CHARACTER_INFO[c].alignment === 'good' &&
      !ROLES[c]?.believesOther &&
      isSeatedType(CHARACTER_INFO[c].type) &&
      !inPlayChars.includes(c) &&
      !exclude.includes(c),
  );
}

/** The character a `believesOther` role (Drunk, Lunatic, Marionette) is told they are. */
function pickBelief(rng: Rng, chars: readonly CharacterId[], script: ScriptId, want: CharacterId): CharacterId {
  const type = ROLES[want]?.believesOther ?? 'townsfolk';
  const seated = isSeatedType(type) ? type : 'townsfolk';
  const pool = ALL_OF(seated === 'outsider' ? 'outsider' : seated === 'minion' ? 'minion' : seated === 'demon' ? 'demon' : 'townsfolk', script)
    .filter((c) => !chars.includes(c) && !ROLES[c]?.believesOther);
  if (!pool.length) return pick(rng, ALL_OF('townsfolk', script));
  return pick(rng, pool);
}

/** The in-play character (if any) that needs a believed character chosen at setup. */
function believerOf(chars: readonly CharacterId[]): CharacterId | null {
  return chars.find((c) => ROLES[c]?.believesOther) ?? null;
}

function pickRedHerring(rng: Rng, bySeat: Map<number, CharacterId>): number | null {
  const good = [...bySeat.entries()].filter(([, c]) => CHARACTER_INFO[c].alignment === 'good').map(([s]) => s);
  return good.length ? pick(rng, good) : null;
}

function pickBluffs(
  rng: Rng,
  chars: readonly CharacterId[],
  exclude: readonly CharacterId[],
  script: ScriptId = DEFAULT_SCRIPT,
): CharacterId[] {
  const pool = goodNotInPlay(chars, exclude, script);
  const townsfolk = shuffle(rng, pool.filter((c) => typeOf(c) === 'townsfolk'));
  const outsiders = shuffle(rng, pool.filter((c) => typeOf(c) === 'outsider'));
  return [...townsfolk, ...outsiders].slice(0, 3);
}

/** Any in-play character that needs a falsely-registering good player (Fortune Teller). */
function needsRedHerring(bySeat: Map<number, CharacterId>, believes: CharacterId | null): boolean {
  const chars = [...bySeat.values(), ...(believes ? [believes] : [])];
  return chars.some((c) => ROLES[c]?.wantsRedHerring);
}

/** Random legal setup for the given seats on `script`. */
export function randomAssignment(seats: readonly number[], rng: Rng, script: ScriptId = DEFAULT_SCRIPT): Assignment {
  const n = seats.length;
  setupCounts(n); // validates n
  const base = SETUP_TABLE[n]!;
  const demons = shuffle(rng, ALL_OF('demon', script)).slice(0, base.demons);
  const minions = shuffle(rng, ALL_OF('minion', script)).slice(0, base.minions);
  // Setup modifiers of the evil team are known before the good team is drawn.
  const counts = setupCounts(n, [...demons, ...minions]);
  const outsiders = shuffle(rng, ALL_OF('outsider', script)).slice(0, counts.outsiders);
  const townsfolk = shuffle(rng, ALL_OF('townsfolk', script)).slice(0, counts.townsfolk);
  const chars: CharacterId[] = shuffle(rng, [...demons, ...minions, ...outsiders, ...townsfolk]);
  const bySeat = new Map<number, CharacterId>();
  [...seats].sort((a, b) => a - b).forEach((seat, i) => bySeat.set(seat, chars[i]!));
  const believer = believerOf(chars);
  const drunkBelieves = believer ? pickBelief(rng, chars, script, believer) : null;
  const redHerringSeat = needsRedHerring(bySeat, drunkBelieves) ? pickRedHerring(rng, bySeat) : null;
  const demonBluffs = pickBluffs(rng, chars, drunkBelieves ? [drunkBelieves] : [], script);
  return { bySeat, drunkBelieves, redHerringSeat, demonBluffs, script };
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/** Validate a manual assignment. Errors block; warnings are accepted with `allowNonstandard`. */
export function validateAssignment(seats: readonly number[], a: Assignment): ValidationResult {
  const script = a.script ?? DEFAULT_SCRIPT;
  const errors: string[] = [];
  const warnings: string[] = [];
  const n = seats.length;
  if (!SETUP_TABLE[n]) errors.push(`A game needs 5-15 players (got ${n})`);
  const assignedSeats = [...a.bySeat.keys()];
  for (const s of seats) if (!a.bySeat.has(s)) errors.push(`Seat ${s + 1} has no character`);
  for (const s of assignedSeats) if (!seats.includes(s)) errors.push(`Seat ${s + 1} is not a player seat`);
  const chars = [...a.bySeat.values()];
  const dupes = chars.filter((c, i) => chars.indexOf(c) !== i);
  if (dupes.length) errors.push(`Duplicate characters: ${[...new Set(dupes)].join(', ')}`);
  const counts = countTypes(chars);
  if (counts.demons !== 1) errors.push(`Exactly one Demon is required (got ${counts.demons})`);
  if (SETUP_TABLE[n]) {
    const want = setupCounts(n, chars);
    if (
      want.townsfolk !== counts.townsfolk ||
      want.outsiders !== counts.outsiders ||
      want.minions !== counts.minions ||
      want.demons !== counts.demons
    )
      warnings.push(
        `Distribution ${counts.townsfolk}/${counts.outsiders}/${counts.minions}/${counts.demons} differs from the standard ` +
          `${want.townsfolk}/${want.outsiders}/${want.minions}/${want.demons} for ${n} players`,
      );
  }
  const believer = believerOf(chars);
  if (believer) {
    const want = ROLES[believer]!.believesOther!;
    const typeLabel = TYPE_LABEL[want] ?? want;
    const label = CHARACTER_INFO[believer].name;
    if (!a.drunkBelieves) errors.push(`The ${label} needs a believed ${typeLabel}`);
    else if (typeOf(a.drunkBelieves) !== want) errors.push(`The ${label} must believe they are a ${typeLabel}`);
    else if (chars.includes(a.drunkBelieves))
      errors.push(`The ${label} must believe in a ${typeLabel} that is not in play`);
  }
  if (a.redHerringSeat !== null) {
    const c = a.bySeat.get(a.redHerringSeat);
    if (!c) errors.push('Red herring seat is not a player');
    else if (CHARACTER_INFO[c].alignment !== 'good') errors.push('The red herring must be a good player');
  }
  if (a.demonBluffs.length > 3) errors.push('At most 3 demon bluffs');
  for (const b of a.demonBluffs) {
    if (CHARACTER_INFO[b].alignment !== 'good') errors.push(`Bluff ${b} is not a good character`);
    if (chars.includes(b)) errors.push(`Bluff ${b} is in play`);
  }
  // Official scripts may only use their own characters; 'custom' may mix freely.
  if (script !== 'custom') {
    const pool = charactersOfScript(script);
    for (const c of new Set(chars)) {
      if (CHARACTER_INFO[c].type === 'traveller') continue;
      if (!pool.includes(c)) warnings.push(`${CHARACTER_INFO[c].name} is not on ${script}`);
    }
  }
  if (new Set(a.demonBluffs).size !== a.demonBluffs.length) errors.push('Duplicate demon bluffs');
  return { errors, warnings };
}

/** Fill in believed character / red herring / bluffs when the ST left them out. */
export function completeAssignment(a: Assignment, rng: Rng): Assignment {
  const script = a.script ?? DEFAULT_SCRIPT;
  const chars = [...a.bySeat.values()];
  const believer = believerOf(chars);
  const drunkBelieves = believer ? (a.drunkBelieves ?? pickBelief(rng, chars, script, believer)) : null;
  const redHerringSeat =
    a.redHerringSeat ?? (needsRedHerring(a.bySeat, drunkBelieves) ? pickRedHerring(rng, a.bySeat) : null);
  let demonBluffs = a.demonBluffs;
  if (demonBluffs.length < 3) {
    const more = pickBluffs(rng, chars, [...demonBluffs, ...(drunkBelieves ? [drunkBelieves] : [])], script);
    demonBluffs = [...demonBluffs, ...more].slice(0, 3);
  }
  return { bySeat: a.bySeat, drunkBelieves, redHerringSeat, demonBluffs, script };
}

/** Write an assignment into the (setup-phase) state. Players still see no role until first night. */
export function applyAssignment(s: GameState, a: Assignment): void {
  for (const p of s.players) {
    const c = a.bySeat.get(p.seat);
    if (!c) throw new RuleError('invalid', `Seat ${p.seat + 1} has no character`);
    const def = ROLES[c];
    p.character = c;
    p.startingCharacter = c;
    // A `believesOther` character (Drunk, Lunatic, Marionette, ...) is told they are something else.
    p.believedCharacter = def?.believesOther && a.drunkBelieves ? a.drunkBelieves : c;
    p.alignment = CHARACTER_INFO[c].alignment;
    // What they are TOLD their alignment is follows the character they believe in.
    p.believedAlignment = CHARACTER_INFO[p.believedCharacter].alignment;
    p.reminders = [];
    if (def?.believesOther) p.reminders.push(`Is the ${CHARACTER_INFO[c].name}`);
  }
  s.redHerringSeat = a.redHerringSeat;
  s.demonBluffs = [...a.demonBluffs];
  s.assigned = true;
}
