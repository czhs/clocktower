// Custom scripts — a Storyteller-built character list that may mix any characters, official or
// homebrew.
//
// Pure functions, no I/O. The lobby stores `script: 'custom'`; this module validates the list the
// Storyteller picked and derives everything the setup sheet and the night panel need from it.
import { CHARACTER_INFO, isCharacterId, isSeatedType, type CharacterId } from '@ct/protocol';
import { ROLES } from './roles.js';
import { jinxesFor } from './roles.js';
import { SETUP_TABLE, setupCounts, type SetupCounts } from './setup.js';

export interface CustomScript {
  characters: CharacterId[];
  counts: SetupCounts;
  /** Night order for these characters only, ascending. */
  firstNight: CharacterId[];
  otherNight: CharacterId[];
  /** Characters that change the setup distribution, with their note. */
  setupModifiers: { character: CharacterId; note: string }[];
  /** Characters that need a setup decision beyond the deal. */
  setupDecisions: { character: CharacterId; decision: string }[];
  /** Advisory notes for awkward character pairs on this list. */
  jinxes: { a: CharacterId; b: CharacterId; note: string }[];
  /** Player counts (5..15) this list can actually be dealt for. */
  playerCounts: number[];
}

export interface CustomScriptValidation {
  errors: string[];
  warnings: string[];
}

/** Characters of `ids` with the given type. */
function ofType(ids: readonly CharacterId[], t: 'townsfolk' | 'outsider' | 'minion' | 'demon'): CharacterId[] {
  return ids.filter((c) => CHARACTER_INFO[c].type === t);
}

/**
 * Which of 5..15 players this character list can be dealt for. A count is supported when the list
 * has enough characters of each type for the distribution that count needs (after the list's own
 * setup modifiers, since a Baron-like character changes what is required).
 */
export function playerCountsSupported(ids: readonly CharacterId[]): number[] {
  const seated = ids.filter((c) => isSeatedType(CHARACTER_INFO[c].type));
  const pools = {
    townsfolk: ofType(seated, 'townsfolk').length,
    outsiders: ofType(seated, 'outsider').length,
    minions: ofType(seated, 'minion').length,
    demons: ofType(seated, 'demon').length,
  };
  const out: number[] = [];
  for (let n = 5; n <= 15; n++) {
    if (!SETUP_TABLE[n]) continue;
    // Worst case: every setup modifier on the list is in play at once.
    const want = setupCounts(n, seated);
    const base = SETUP_TABLE[n]!;
    const needT = Math.max(want.townsfolk, base.townsfolk);
    const needO = Math.max(want.outsiders, base.outsiders);
    if (
      pools.townsfolk >= needT &&
      pools.outsiders >= needO &&
      pools.minions >= base.minions &&
      pools.demons >= base.demons
    ) {
      out.push(n);
    }
  }
  return out;
}

/**
 * Validate a hand-picked character list. Errors block the game; warnings are things a Storyteller
 * may legitimately want (an all-Townsfolk teaching script, a two-Demon experiment).
 */
export function validateCustomScript(ids: readonly string[]): CustomScriptValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const unknown = ids.filter((c) => !isCharacterId(c));
  for (const c of unknown) errors.push(`Unknown character: ${c}`);

  const known = ids.filter(isCharacterId);
  const dupes = known.filter((c, i) => known.indexOf(c) !== i);
  for (const c of new Set(dupes)) errors.push(`${CHARACTER_INFO[c].name} is listed twice`);

  const seated = known.filter((c) => isSeatedType(CHARACTER_INFO[c].type));
  const travellers = known.filter((c) => CHARACTER_INFO[c].type === 'traveller');
  const fabled = known.filter((c) => CHARACTER_INFO[c].type === 'fabled');

  const demons = ofType(seated, 'demon');
  const minions = ofType(seated, 'minion');
  const townsfolk = ofType(seated, 'townsfolk');

  if (demons.length === 0) errors.push('A script needs at least one Demon');
  if (minions.length === 0) warnings.push('No Minions: the Demon will have no evil team');
  if (townsfolk.length < 3) warnings.push(`Only ${townsfolk.length} Townsfolk: not enough for even a 5-player game`);

  // A `believesOther` character (Drunk, Lunatic, ...) needs a spare character of that type to
  // believe in, over and above the ones that will be dealt.
  for (const c of seated) {
    const want = ROLES[c]?.believesOther;
    if (!want) continue;
    const pool = seated.filter((x) => CHARACTER_INFO[x].type === want && !ROLES[x]?.believesOther);
    if (pool.length === 0) {
      errors.push(`${CHARACTER_INFO[c].name} needs at least one ${want} on the script to believe they are`);
    } else if (pool.length < 4) {
      warnings.push(
        `${CHARACTER_INFO[c].name} needs a ${want} that is NOT in play; with only ${pool.length} on the script that will often be impossible`,
      );
    }
  }

  if (travellers.length) {
    warnings.push(
      `${travellers.length} Traveller${travellers.length === 1 ? '' : 's'} on the list: Travellers are added on top of a setup, not dealt — they do not need to be on the script`,
    );
  }
  if (fabled.length) {
    warnings.push(
      `${fabled.length} Fabled on the list: Fabled have no seat and are added by you, not dealt`,
    );
  }

  const counts = playerCountsSupported(seated);
  if (!counts.length && !errors.length) {
    warnings.push('This list cannot fill a legal setup for any player count from 5 to 15');
  }

  return { errors, warnings };
}

/**
 * Build the derived view of a custom script. Throws nothing: call `validateCustomScript` first and
 * show its errors. Unknown ids are dropped here so a partially-valid list still renders.
 */
export function buildCustomScript(ids: readonly string[]): CustomScript {
  const characters = ids.filter(isCharacterId);
  const seated = characters.filter((c) => isSeatedType(CHARACTER_INFO[c].type));

  const firstNight = characters
    .filter((c) => ROLES[c]?.firstNight != null)
    .sort((a, b) => ROLES[a].firstNight! - ROLES[b].firstNight!);
  const otherNight = characters
    .filter((c) => ROLES[c]?.otherNight != null || ROLES[c]?.dynamicOrder !== undefined)
    .sort(
      (a, b) =>
        (ROLES[a].otherNight ?? ROLES[a].dynamicOrder!) - (ROLES[b].otherNight ?? ROLES[b].dynamicOrder!),
    );

  const setupModifiers = characters
    .filter((c) => ROLES[c]?.setupModifier)
    .map((c) => ({
      character: c,
      note: ROLES[c].setupNote ?? CHARACTER_INFO[c].setupHint ?? 'Changes the setup distribution',
    }));

  const setupDecisions: { character: CharacterId; decision: string }[] = [];
  for (const c of characters) {
    const def = ROLES[c];
    if (!def) continue;
    if (def.wantsRedHerring) {
      setupDecisions.push({ character: c, decision: 'Choose a good player who registers falsely to them' });
    }
    if (def.believesOther) {
      setupDecisions.push({
        character: c,
        decision: `Choose the ${def.believesOther} they believe they are (must not be in play)`,
      });
    }
  }

  return {
    characters,
    counts: {
      townsfolk: ofType(seated, 'townsfolk').length,
      outsiders: ofType(seated, 'outsider').length,
      minions: ofType(seated, 'minion').length,
      demons: ofType(seated, 'demon').length,
    },
    firstNight,
    otherNight,
    setupModifiers,
    setupDecisions,
    jinxes: jinxesFor(characters),
    playerCounts: playerCountsSupported(seated),
  };
}
