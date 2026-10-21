// The merged character catalogue. Every script's table is declared in its own module and merged
// here, so adding a script never touches the engine or the shared contract.
//
// Invariants (asserted by packages/protocol/test/characters.test.ts):
//   * character ids are globally unique across every script
//   * CHARACTER_INFO has an entry for every id in CHARACTER_IDS
//   * a character's `type` matches the pool it was declared in (traveller/fabled)
import type { CharacterInfo, ScriptId, ScriptInfo } from './types.js';
import { BMR_CHARACTER_IDS, BMR_CHARACTER_INFO } from './bmr.js';
import { FABLED_CHARACTER_IDS, FABLED_CHARACTER_INFO } from './fabled.js';
import { HOMEBREW_CHARACTER_IDS, HOMEBREW_CHARACTER_INFO } from './homebrew.js';
import { SNV_CHARACTER_IDS, SNV_CHARACTER_INFO } from './snv.js';
import { TB_CHARACTER_IDS, TB_CHARACTER_INFO } from './tb.js';
import { TRAVELLERS_CHARACTER_IDS, TRAVELLERS_CHARACTER_INFO } from './travellers.js';

export * from './types.js';
export { TB_CHARACTER_IDS, TB_CHARACTER_INFO } from './tb.js';
export { BMR_CHARACTER_IDS, BMR_CHARACTER_INFO } from './bmr.js';
export { SNV_CHARACTER_IDS, SNV_CHARACTER_INFO } from './snv.js';
export { TRAVELLERS_CHARACTER_IDS, TRAVELLERS_CHARACTER_INFO } from './travellers.js';
export { FABLED_CHARACTER_IDS, FABLED_CHARACTER_INFO } from './fabled.js';
export { HOMEBREW_CHARACTER_IDS, HOMEBREW_CHARACTER_INFO } from './homebrew.js';

/**
 * Every character id the protocol knows about. The order is stable (script by script) because it
 * backs a Zod enum and the Storyteller's character pickers.
 */
export const CHARACTER_IDS = [
  ...TB_CHARACTER_IDS,
  ...BMR_CHARACTER_IDS,
  ...SNV_CHARACTER_IDS,
  ...TRAVELLERS_CHARACTER_IDS,
  ...FABLED_CHARACTER_IDS,
  ...HOMEBREW_CHARACTER_IDS,
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTER_INFO: Record<CharacterId, CharacterInfo> = {
  ...TB_CHARACTER_INFO,
  ...BMR_CHARACTER_INFO,
  ...SNV_CHARACTER_INFO,
  ...TRAVELLERS_CHARACTER_INFO,
  ...FABLED_CHARACTER_INFO,
  ...HOMEBREW_CHARACTER_INFO,
} as Record<CharacterId, CharacterInfo>;

/** Upper bound for Zod array caps that carry character lists (grows with the catalogue). */
export const CHARACTER_COUNT = CHARACTER_IDS.length;

/**
 * Per-script metadata. `SCRIPTS` (the id list) stays in lobby.ts; this is the catalogue side.
 */
export const SCRIPT_INFO: Record<ScriptId, ScriptInfo> = {
  'trouble-brewing': {
    id: 'trouble-brewing',
    name: 'Trouble Brewing',
    blurb: 'The classic. Clear information, a straightforward Demon, the friendliest first game.',
    characters: TB_CHARACTER_IDS,
    official: true,
  },
  'bad-moon-rising': {
    id: 'bad-moon-rising',
    name: 'Bad Moon Rising',
    blurb: 'People die every night and nobody is safe. Deaths and protection carry the game.',
    characters: BMR_CHARACTER_IDS,
    official: true,
  },
  'sects-and-violets': {
    id: 'sects-and-violets',
    name: 'Sects & Violets',
    blurb: 'Dreams, madness and misinformation. Almost nothing you are told is reliable.',
    characters: SNV_CHARACTER_IDS,
    official: true,
  },
  custom: {
    id: 'custom',
    name: 'Custom script',
    blurb: 'A Storyteller-built list, mixing any characters (including homebrew).',
    characters: [],
    official: false,
  },
};

/** Characters a standard setup on `script` may draw from ('custom' has no fixed pool). */
export function charactersOfScript(script: ScriptId): readonly CharacterId[] {
  return SCRIPT_INFO[script].characters as readonly CharacterId[];
}

/** The script a character was declared in (travellers/fabled/homebrew report their pool). */
export function scriptOfCharacter(c: CharacterId): ScriptId | 'travellers' | 'fabled' | 'homebrew' {
  if ((TB_CHARACTER_IDS as readonly string[]).includes(c)) return 'trouble-brewing';
  if ((BMR_CHARACTER_IDS as readonly string[]).includes(c)) return 'bad-moon-rising';
  if ((SNV_CHARACTER_IDS as readonly string[]).includes(c)) return 'sects-and-violets';
  if ((TRAVELLERS_CHARACTER_IDS as readonly string[]).includes(c)) return 'travellers';
  if ((FABLED_CHARACTER_IDS as readonly string[]).includes(c)) return 'fabled';
  return 'homebrew';
}

export function isCharacterId(x: string): x is CharacterId {
  return Object.prototype.hasOwnProperty.call(CHARACTER_INFO, x);
}

export function isTraveller(c: CharacterId): boolean {
  return CHARACTER_INFO[c].type === 'traveller';
}

export function isFabled(c: CharacterId): boolean {
  return CHARACTER_INFO[c].type === 'fabled';
}

/** Travellers are offered on every script. */
export const TRAVELLER_IDS = TRAVELLERS_CHARACTER_IDS as readonly CharacterId[];
export const FABLED_IDS = FABLED_CHARACTER_IDS as readonly CharacterId[];
