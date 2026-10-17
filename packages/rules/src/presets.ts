// OWNED BY rules-storyteller. (v2.2) Dealing a character BAG onto the seats at random: preset
// storylines (catalogue + bag builder: @ct/protocol storylines.ts) and Storyteller-picked bags.
// Pure; all randomness from the injected RNG (a seed gives a reproducible deal).
import { CHARACTER_INFO, buildStorylineBag, storylineById, type CharacterId, type StorylineDef } from '@ct/protocol';
import { RuleError, type Rng } from './types.js';
import { completeAssignment, pickDrunkBelief, validateAssignment, type Assignment, type ValidationResult } from './setup.js';
import { shuffle } from './util.js';

export interface BagDealOptions {
  /** Townsfolk the Drunk believes they are (must not be in the bag). Default: random. */
  drunkBelieves?: CharacterId | null;
  /** Preferred Drunk beliefs (first not in play wins) when `drunkBelieves` is not given. */
  drunkBelievesPrefer?: readonly CharacterId[];
  /** Up to 3 bluffs (filled up at random). */
  demonBluffs?: readonly CharacterId[];
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
  const chars = shuffle(rng, bag);
  const bySeat = new Map<number, CharacterId>();
  [...seats].sort((a, b) => a - b).forEach((seat, i) => bySeat.set(seat, chars[i]!));
  let drunkBelieves: CharacterId | null = opts.drunkBelieves ?? null;
  if (!drunkBelieves && bag.includes('drunk')) {
    const preferred = (opts.drunkBelievesPrefer ?? []).find((c) => CHARACTER_INFO[c].type === 'townsfolk' && !bag.includes(c));
    drunkBelieves = preferred ?? pickDrunkBelief(rng, bag);
  }
  const assignment = completeAssignment({ bySeat, drunkBelieves, redHerringSeat: null, demonBluffs: [...(opts.demonBluffs ?? [])] }, rng);
  const validation = validateAssignment(seats, assignment);
  if (validation.errors.length) throw new RuleError('invalid', validation.errors.join('; '));
  return { assignment, validation };
}

/** A storyline dealt at random onto the seats (always a standard distribution). */
export function presetAssignment(seats: readonly number[], id: string, rng: Rng): { def: StorylineDef; assignment: Assignment } {
  const { def, bag } = storylineBag(id, seats.length, rng);
  const { assignment, validation } = dealBag(seats, bag, rng, def.drunkBelieves ? { drunkBelievesPrefer: def.drunkBelieves } : {});
  if (validation.warnings.length) throw new RuleError('invalid', `${def.title} dealt a nonstandard setup: ${validation.warnings.join('; ')}`);
  return { def, assignment };
}
