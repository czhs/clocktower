// OWNED BY rules-storyteller. (v2.2) Dealing a character BAG onto the seats at random: preset
// storylines (catalogue + bag builder: @ct/protocol storylines.ts) and Storyteller-picked bags.
// Pure; all randomness from the injected RNG (a seed gives a reproducible deal).
import { CHARACTER_INFO, buildStorylineBag, storylineById, storylineProblem, type CharacterId, type ScriptId, type StorylineDef } from '@ct/protocol';
import { RuleError, type Rng } from './types.js';
import { completeAssignment, validateAssignment, type Assignment, type ValidationResult } from './setup.js';
import { shuffle } from './util.js';

export interface BagDealOptions {
  /** Townsfolk the Drunk believes they are (must not be in the bag). Default: random. */
  drunkBelieves?: CharacterId | null;
  /** Preferred Drunk beliefs (first not in play wins) when `drunkBelieves` is not given. */
  drunkBelievesPrefer?: readonly CharacterId[];
  /** Up to 3 bluffs (filled up at random). */
  demonBluffs?: readonly CharacterId[];
  /**
   * The lobby's script (default Trouble Brewing): random bluffs and a Lunatic's / Marionette's
   * believed character come from its pool, and the bag is validated against it.
   */
  script?: ScriptId;
  /**
   * Who the Drunk is, when the bag holds one: a seat (the Storyteller's pick), 'random' (automatic
   * games: nobody to choose; also the default of this pure function), or 'ask' (a Storyteller deal
   * that did not pick one: refused, so the RNG never decides who the Drunk is).
   */
  drunkSeat?: number | 'random' | 'ask';
}

/** The bag for a storyline at `n` players (throws RuleError when unknown / unsupported). */
export function storylineBag(id: string, n: number, rng: Rng): { def: StorylineDef; bag: CharacterId[] } {
  const def = storylineById(id);
  if (!def) throw new RuleError('invalid', `Unknown storyline "${id}"`);
  try {
    return { def, bag: buildStorylineBag(def, n, rng, CHARACTER_INFO) };
  } catch (e) {
    throw new RuleError('invalid', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Shuffle `bag` onto `seats` and complete it (Drunk belief, red herring, bluffs). Validated:
 * errors throw; warnings (nonstandard distribution) are returned for the caller to accept or refuse.
 */
export function dealBag(seats: readonly number[], bag: readonly CharacterId[], rng: Rng, opts: BagDealOptions = {}): { assignment: Assignment; validation: ValidationResult } {
  if (bag.length !== seats.length) throw new RuleError('invalid', `The bag has ${bag.length} characters for ${seats.length} players`);
  const drunkSeat = bag.includes('drunk') ? (opts.drunkSeat ?? 'random') : 'random';
  if (drunkSeat === 'ask') throw new RuleError('invalid', 'The Drunk is in this deal: choose which player is the Drunk');
  if (typeof drunkSeat === 'number' && !seats.includes(drunkSeat)) throw new RuleError('invalid', `Seat ${drunkSeat + 1} is not dealt in this setup`);
  const placed = typeof drunkSeat === 'number';
  // The Storyteller's Drunk keeps their seat; everything else is shuffled onto the other seats.
  const chars = shuffle(rng, placed ? bag.filter((c) => c !== 'drunk') : bag);
  const bySeat = new Map<number, CharacterId>();
  [...seats]
    .filter((seat) => !placed || seat !== drunkSeat)
    .sort((a, b) => a - b)
    .forEach((seat, i) => bySeat.set(seat, chars[i]!));
  if (placed) bySeat.set(drunkSeat, 'drunk');
  let drunkBelieves: CharacterId | null = opts.drunkBelieves ?? null;
  if (!drunkBelieves && bag.includes('drunk')) {
    // A storyline's preferred belief; otherwise completeAssignment picks one from the script's pool.
    drunkBelieves = (opts.drunkBelievesPrefer ?? []).find((c) => CHARACTER_INFO[c].type === 'townsfolk' && !bag.includes(c)) ?? null;
  }
  const assignment = completeAssignment(
    { bySeat, drunkBelieves, redHerringSeat: null, demonBluffs: [...(opts.demonBluffs ?? [])], ...(opts.script ? { script: opts.script } : {}) },
    rng,
  );
  const validation = validateAssignment(seats, assignment);
  if (validation.errors.length) throw new RuleError('invalid', validation.errors.join('; '));
  return { assignment, validation };
}

/** A storyline dealt at random onto the seats (always a standard distribution). */
export function presetAssignment(
  seats: readonly number[],
  id: string,
  rng: Rng,
  opts: Pick<BagDealOptions, 'drunkSeat'> = {},
): { def: StorylineDef; assignment: Assignment } {
  const def = storylineById(id);
  if (!def) throw new RuleError('invalid', `Unknown storyline "${id}"`);
  const problem = storylineProblem(def, seats.length, CHARACTER_INFO);
  if (problem) throw new RuleError('invalid', `${def.title}: ${problem}`);
  const drunkSeat = opts.drunkSeat ?? 'random';
  // The Drunk is never random filler in a Storyteller's deal: a storyline that does not name the
  // Drunk leaves it out (and a Baron too, if the Outsiders could then not be filled). A storyline
  // that names the Drunk deals it to the seat the Storyteller chose ('ask' = refused).
  let use: StorylineDef = def;
  if (drunkSeat !== 'random' && ![...def.core, ...def.prefer].includes('drunk')) {
    const noDrunk = { ...def, avoid: [...def.avoid, 'drunk' as CharacterId] };
    const noBaron = { ...noDrunk, avoid: [...noDrunk.avoid, 'baron' as CharacterId] };
    use = storylineProblem(noDrunk, seats.length, CHARACTER_INFO) === null ? noDrunk : storylineProblem(noBaron, seats.length, CHARACTER_INFO) === null ? noBaron : def;
  }
  let bag: CharacterId[];
  try {
    bag = buildStorylineBag(use, seats.length, rng, CHARACTER_INFO);
  } catch (e) {
    throw new RuleError('invalid', e instanceof Error ? e.message : String(e));
  }
  const { assignment, validation } = dealBag(seats, bag, rng, {
    ...(def.drunkBelieves ? { drunkBelievesPrefer: def.drunkBelieves } : {}),
    ...(opts.drunkSeat !== undefined ? { drunkSeat: opts.drunkSeat } : {}),
  });
  if (validation.warnings.length) throw new RuleError('invalid', `${def.title} dealt a nonstandard setup: ${validation.warnings.join('; ')}`);
  return { def, assignment };
}
