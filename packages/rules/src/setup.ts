import {
  CHARACTER_IDS,
  CHARACTER_INFO,
  TB_DISTRIBUTION,
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
 * Base distribution by player count. The three official scripts share this table (it lives in
 * @ct/protocol storylines.ts so the client can use it); characters change it through their own
 * `setupModifier` hook (Baron: +2 Outsiders, and the Bad Moon Rising / Sects & Violets equivalents).
 */
export const SETUP_TABLE: Readonly<Record<number, SetupCounts>> = TB_DISTRIBUTION;

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

/**
 * The characters setup may draw from on `script` (bluffs, a believed character). A custom script's
 * list is not part of the game state, so it may draw from every seated character.
 */
function scriptPool(script: ScriptId): readonly CharacterId[] {
  return script === 'custom' ? CHARACTER_IDS.filter((c) => isSeatedType(CHARACTER_INFO[c].type)) : charactersOfScript(script);
}

/** Characters of a type within one script's pool. */
export const ALL_OF = (t: 'townsfolk' | 'outsider' | 'minion' | 'demon', script: ScriptId = DEFAULT_SCRIPT): CharacterId[] =>
  scriptPool(script).filter((c) => CHARACTER_INFO[c].type === t);

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
  return scriptPool(script).filter(
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

/** A Trouble Brewing Drunk's believed Townsfolk (used by the storyline presets). */
export function pickDrunkBelief(rng: Rng, chars: readonly CharacterId[]): CharacterId {
  return pickBelief(rng, chars, DEFAULT_SCRIPT, 'drunk');
}

export function pickRedHerring(rng: Rng, bySeat: Map<number, CharacterId>): number | null {
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
export function needsRedHerring(bySeat: Map<number, CharacterId>, believes: CharacterId | null): boolean {
  const chars = [...bySeat.values(), ...(believes ? [believes] : [])];
  return chars.some((c) => ROLES[c]?.wantsRedHerring);
}

/**
 * What the random draw does with the Drunk. Who the Drunk is belongs to the Storyteller, so a
 * Storyteller's deal never draws it at random:
 *   - 'none': the Drunk is not in play;
 *   - { seat, believes? }: the Storyteller's pick (it takes one Outsider slot);
 *   - 'random': drawn like any Outsider (automatic games only: there is nobody to choose).
 */
export type DrunkPlacement = 'random' | 'none' | { seat: number; believes?: CharacterId };

export interface RandomSetupOptions {
  /** Characters the Storyteller removed from the draw. */
  exclude?: readonly CharacterId[];
  /** Default 'random' (the pure function's historical behaviour); the engine always passes it. */
  drunk?: DrunkPlacement;
}

/** `need` characters drawn from `pool`, or a clear error when the removals left too few. */
function draw(rng: Rng, pool: readonly CharacterId[], need: number, label: string): CharacterId[] {
  if (pool.length < need)
    throw new RuleError('invalid', `Only ${pool.length} ${label} left to draw from, but this setup needs ${need}: put some back`);
  return shuffle(rng, pool).slice(0, need);
}

/** Random legal setup for the given seats on `script`. */
export function randomAssignment(
  seats: readonly number[],
  rng: Rng,
  script: ScriptId = DEFAULT_SCRIPT,
  opts: RandomSetupOptions = {},
): Assignment {
  const n = seats.length;
  setupCounts(n); // validates n
  const base = SETUP_TABLE[n]!;
  const exclude = new Set(opts.exclude ?? []);
  const placement = opts.drunk ?? 'random';
  const drunkSeat = typeof placement === 'object' ? placement.seat : null;
  if (drunkSeat !== null) {
    if (!seats.includes(drunkSeat)) throw new RuleError('invalid', `Seat ${drunkSeat + 1} is not dealt in this setup`);
    if (!ALL_OF('outsider', script).includes('drunk')) throw new RuleError('invalid', `The Drunk is not on ${script}`);
    if (exclude.has('drunk')) throw new RuleError('invalid', 'The Drunk was removed from the draw');
  }
  const chosenBelief = typeof placement === 'object' ? placement.believes : undefined;
  if (chosenBelief && typeOf(chosenBelief) !== 'townsfolk') throw new RuleError('invalid', 'The Drunk must believe they are a Townsfolk');
  // The Drunk is only ever drawn at random in automatic games; the Drunk's believed Townsfolk is
  // kept out of play.
  const pool = (t: 'townsfolk' | 'outsider' | 'minion' | 'demon') =>
    ALL_OF(t, script).filter((c) => !exclude.has(c) && c !== chosenBelief && (placement === 'random' || c !== 'drunk'));
  // Setup modifiers of the evil team are known before the good team is drawn. An evil team whose
  // modifiers ask for more good characters than are left (a Baron when the Drunk is not drawn, or
  // after removals) is redrawn; a legal draw on the first try consumes the RNG exactly as before.
  const slotsFit = (c: SetupCounts) => {
    const outsiders = c.outsiders - (drunkSeat !== null ? 1 : 0);
    return outsiders >= 0 && outsiders <= pool('outsider').length && c.townsfolk <= pool('townsfolk').length;
  };
  let demons: CharacterId[] = [];
  let minions: CharacterId[] = [];
  let counts: SetupCounts = { ...base };
  for (let attempt = 0; attempt < 50; attempt++) {
    demons = draw(rng, pool('demon'), base.demons, 'Demons');
    minions = draw(rng, pool('minion'), base.minions, 'Minions');
    counts = setupCounts(n, [...demons, ...minions]);
    if (slotsFit(counts)) break;
  }
  if (drunkSeat !== null && counts.outsiders < 1)
    throw new RuleError(
      'invalid',
      `${n} players have no Outsider slot for the Drunk${base.outsiders === 0 ? ' unless a character that adds Outsiders (the Baron) is dealt: keep it in the draw,' : ':'} deal without the Drunk, or deal by hand`,
    );
  const outsiders = draw(rng, pool('outsider'), counts.outsiders - (drunkSeat !== null ? 1 : 0), 'Outsiders');
  const townsfolk = draw(rng, pool('townsfolk'), counts.townsfolk, 'Townsfolk');
  const chars: CharacterId[] = shuffle(rng, [...demons, ...minions, ...outsiders, ...townsfolk]);
  const bySeat = new Map<number, CharacterId>();
  [...seats]
    .filter((seat) => seat !== drunkSeat)
    .sort((a, b) => a - b)
    .forEach((seat, i) => bySeat.set(seat, chars[i]!));
  if (drunkSeat !== null) {
    bySeat.set(drunkSeat, 'drunk');
    chars.push('drunk');
  }
  const believer = believerOf(chars);
  const drunkBelieves = believer ? (chosenBelief ?? pickBelief(rng, chars, script, believer)) : null;
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
  for (const c of new Set(chars)) if (CHARACTER_INFO[c].type === 'fabled') errors.push(`${CHARACTER_INFO[c].name} is a Fabled, not a player's character`);
  // Travellers sit on top of a legal setup: the distribution is checked for the other seats.
  const travellers = chars.filter((c) => CHARACTER_INFO[c].type === 'traveller').length;
  const base = n - travellers;
  if (travellers && SETUP_TABLE[n] && !SETUP_TABLE[base]) errors.push(`Besides Travellers, a game needs at least 5 players (got ${base})`);
  if (SETUP_TABLE[base]) {
    const want = setupCounts(base, chars);
    if (
      want.townsfolk !== counts.townsfolk ||
      want.outsiders !== counts.outsiders ||
      want.minions !== counts.minions ||
      want.demons !== counts.demons
    )
      warnings.push(
        `Distribution ${counts.townsfolk}/${counts.outsiders}/${counts.minions}/${counts.demons} differs from the standard ` +
          `${want.townsfolk}/${want.outsiders}/${want.minions}/${want.demons} for ${base} players${travellers ? ` (+${travellers} Traveller${travellers > 1 ? 's' : ''})` : ''}`,
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
    // A Traveller's alignment is the Storyteller's choice (the catalogue value is only a default).
    if (CHARACTER_INFO[c].type === 'traveller') {
      const chosen = s.travellerSeats?.[p.seat]?.alignment ?? CHARACTER_INFO[c].alignment;
      p.alignment = chosen;
      p.believedAlignment = chosen;
      p.reminders.push(`Traveller (${chosen})`);
    }
  }
  s.redHerringSeat = a.redHerringSeat;
  s.demonBluffs = [...a.demonBluffs];
  s.assigned = true;
}
