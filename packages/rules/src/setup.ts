import { CHARACTER_IDS, CHARACTER_INFO, TB_DISTRIBUTION, type CharacterId } from '@ct/protocol';
import { RuleError, type GameState, type Rng } from './types.js';
import { pick, shuffle, typeOf } from './util.js';

export interface SetupCounts {
  townsfolk: number;
  outsiders: number;
  minions: number;
  demons: number;
}

/** Trouble Brewing base distribution by player count (before the Baron's modification). (v2.2: the table now lives in @ct/protocol storylines.ts so the client can use it.) */
export const SETUP_TABLE: Readonly<Record<number, SetupCounts>> = TB_DISTRIBUTION;

/** Distribution for `n` players; the Baron adds two Outsiders and removes two Townsfolk. */
export function setupCounts(n: number, withBaron = false): SetupCounts {
  const base = SETUP_TABLE[n];
  if (!base) throw new RuleError('invalid', `Trouble Brewing supports 5-15 players (got ${n})`);
  return withBaron ? { ...base, townsfolk: base.townsfolk - 2, outsiders: base.outsiders + 2 } : { ...base };
}

export const ALL_OF = (t: 'townsfolk' | 'outsider' | 'minion' | 'demon'): CharacterId[] =>
  CHARACTER_IDS.filter((c) => CHARACTER_INFO[c].type === t);

export interface Assignment {
  bySeat: Map<number, CharacterId>;
  drunkBelieves: CharacterId | null;
  redHerringSeat: number | null;
  demonBluffs: CharacterId[];
}

export function countTypes(chars: readonly CharacterId[]): SetupCounts {
  const c: SetupCounts = { townsfolk: 0, outsiders: 0, minions: 0, demons: 0 };
  for (const ch of chars) {
    const t = typeOf(ch);
    if (t === 'townsfolk') c.townsfolk++;
    else if (t === 'outsider') c.outsiders++;
    else if (t === 'minion') c.minions++;
    else c.demons++;
  }
  return c;
}

/** Good characters not in play (excluding the Drunk and anything listed in `exclude`). */
function goodNotInPlay(inPlayChars: readonly CharacterId[], exclude: readonly CharacterId[] = []): CharacterId[] {
  return CHARACTER_IDS.filter(
    (c) =>
      CHARACTER_INFO[c].alignment === 'good' &&
      c !== 'drunk' &&
      !inPlayChars.includes(c) &&
      !exclude.includes(c),
  );
}

export function pickDrunkBelief(rng: Rng, chars: readonly CharacterId[]): CharacterId {
  const options = ALL_OF('townsfolk').filter((c) => !chars.includes(c));
  return pick(rng, options);
}

export function pickRedHerring(rng: Rng, bySeat: Map<number, CharacterId>): number | null {
  const good = [...bySeat.entries()].filter(([, c]) => CHARACTER_INFO[c].alignment === 'good').map(([s]) => s);
  return good.length ? pick(rng, good) : null;
}

function pickBluffs(rng: Rng, chars: readonly CharacterId[], exclude: readonly CharacterId[]): CharacterId[] {
  const townsfolk = shuffle(rng, goodNotInPlay(chars, exclude).filter((c) => typeOf(c) === 'townsfolk'));
  const outsiders = shuffle(rng, goodNotInPlay(chars, exclude).filter((c) => typeOf(c) === 'outsider'));
  return [...townsfolk, ...outsiders].slice(0, 3);
}

export function needsRedHerring(bySeat: Map<number, CharacterId>, drunkBelieves: CharacterId | null): boolean {
  return [...bySeat.values()].includes('fortune_teller') || drunkBelieves === 'fortune_teller';
}

/** Random legal Trouble Brewing setup for the given seats. */
export function randomAssignment(seats: readonly number[], rng: Rng): Assignment {
  const n = seats.length;
  setupCounts(n); // validates n
  const minions = shuffle(rng, ALL_OF('minion')).slice(0, SETUP_TABLE[n]!.minions);
  const counts = setupCounts(n, minions.includes('baron'));
  const outsiders = shuffle(rng, ALL_OF('outsider')).slice(0, counts.outsiders);
  const townsfolk = shuffle(rng, ALL_OF('townsfolk')).slice(0, counts.townsfolk);
  const chars: CharacterId[] = shuffle(rng, ['imp', ...minions, ...outsiders, ...townsfolk]);
  const bySeat = new Map<number, CharacterId>();
  [...seats].sort((a, b) => a - b).forEach((seat, i) => bySeat.set(seat, chars[i]!));
  const drunkBelieves = chars.includes('drunk') ? pickDrunkBelief(rng, chars) : null;
  const redHerringSeat = needsRedHerring(bySeat, drunkBelieves) ? pickRedHerring(rng, bySeat) : null;
  const demonBluffs = pickBluffs(rng, chars, drunkBelieves ? [drunkBelieves] : []);
  return { bySeat, drunkBelieves, redHerringSeat, demonBluffs };
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/** Validate a manual assignment. Errors block; warnings are accepted with `allowNonstandard`. */
export function validateAssignment(seats: readonly number[], a: Assignment): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const n = seats.length;
  if (!SETUP_TABLE[n]) errors.push(`Trouble Brewing supports 5-15 players (got ${n})`);
  const assignedSeats = [...a.bySeat.keys()];
  for (const s of seats) if (!a.bySeat.has(s)) errors.push(`Seat ${s + 1} has no character`);
  for (const s of assignedSeats) if (!seats.includes(s)) errors.push(`Seat ${s + 1} is not a player seat`);
  const chars = [...a.bySeat.values()];
  const dupes = chars.filter((c, i) => chars.indexOf(c) !== i);
  if (dupes.length) errors.push(`Duplicate characters: ${[...new Set(dupes)].join(', ')}`);
  const counts = countTypes(chars);
  if (counts.demons !== 1) errors.push(`Exactly one Demon is required (got ${counts.demons})`);
  if (SETUP_TABLE[n]) {
    const want = setupCounts(n, chars.includes('baron'));
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
  if (chars.includes('drunk')) {
    if (!a.drunkBelieves) errors.push('The Drunk needs a believed Townsfolk');
    else if (typeOf(a.drunkBelieves) !== 'townsfolk') errors.push('The Drunk must believe they are a Townsfolk');
    else if (chars.includes(a.drunkBelieves)) errors.push('The Drunk must believe in a Townsfolk that is not in play');
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
  if (new Set(a.demonBluffs).size !== a.demonBluffs.length) errors.push('Duplicate demon bluffs');
  return { errors, warnings };
}

/** Fill in Drunk belief / red herring / bluffs when the ST left them out. */
export function completeAssignment(a: Assignment, rng: Rng): Assignment {
  const chars = [...a.bySeat.values()];
  const drunkBelieves = chars.includes('drunk') ? (a.drunkBelieves ?? pickDrunkBelief(rng, chars)) : null;
  const redHerringSeat =
    a.redHerringSeat ?? (needsRedHerring(a.bySeat, drunkBelieves) ? pickRedHerring(rng, a.bySeat) : null);
  let demonBluffs = a.demonBluffs;
  if (demonBluffs.length < 3) {
    const more = pickBluffs(rng, chars, [...demonBluffs, ...(drunkBelieves ? [drunkBelieves] : [])]);
    demonBluffs = [...demonBluffs, ...more].slice(0, 3);
  }
  return { bySeat: a.bySeat, drunkBelieves, redHerringSeat, demonBluffs };
}

/** Write an assignment into the (setup-phase) state. Players still see no role until first night. */
export function applyAssignment(s: GameState, a: Assignment): void {
  for (const p of s.players) {
    const c = a.bySeat.get(p.seat);
    if (!c) throw new RuleError('invalid', `Seat ${p.seat + 1} has no character`);
    p.character = c;
    p.startingCharacter = c;
    p.believedCharacter = c === 'drunk' ? a.drunkBelieves! : c;
    p.alignment = CHARACTER_INFO[c].alignment;
    p.believedAlignment = p.alignment;
    p.reminders = [];
    if (c === 'drunk') p.reminders.push('Is the Drunk');
  }
  s.redHerringSeat = a.redHerringSeat;
  s.demonBluffs = [...a.demonBluffs];
  s.assigned = true;
}
