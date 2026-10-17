// Character catalogue types, shared by every script (Trouble Brewing, Bad Moon Rising,
// Sects & Violets, Travellers, Fabled and homebrew).
//
// Co-owned with rules-storyteller (additive changes only; record them in docs/architecture.md).
// This file holds only types + the script identifiers: the per-script character tables live in
// the sibling modules and are merged in ./index.ts.

/**
 * `traveller` and `fabled` were added with the multi-script work (2026-10-16). They sit OUTSIDE
 * the townsfolk/outsider/minion/demon setup distribution: travellers are added on top of a legal
 * setup, fabled are Storyteller-facing props with no seat of their own.
 */
export type CharacterType = 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'traveller' | 'fabled';
export type Alignment = 'good' | 'evil';

/** The four types that make up a legal setup distribution. */
export const SEATED_TYPES = ['townsfolk', 'outsider', 'minion', 'demon'] as const;
export type SeatedType = (typeof SEATED_TYPES)[number];

export function isSeatedType(t: CharacterType): t is SeatedType {
  return t === 'townsfolk' || t === 'outsider' || t === 'minion' || t === 'demon';
}

export interface CharacterInfo {
  name: string;
  type: CharacterType;
  alignment: Alignment;
  /** Original short paraphrase of the ability (never rulebook text). */
  ability: string;
  /**
   * (additive) Short note shown in the Storyteller's setup sheet when this character changes the
   * distribution or needs a setup decision, e.g. '[+2 Outsiders]' or '[Is not the Drunk]'.
   */
  setupHint?: string;
}

/**
 * Script ids. These are the values already stored in `LobbySettings.script`, so 'trouble-brewing'
 * keeps its spelling and every existing lobby/record stays valid.
 */
export const SCRIPT_IDS = ['trouble-brewing', 'bad-moon-rising', 'sects-and-violets', 'custom'] as const;
export type ScriptId = (typeof SCRIPT_IDS)[number];

export interface ScriptInfo {
  id: ScriptId;
  name: string;
  /** Short flavour line for the lobby's script picker. */
  blurb: string;
  /** The characters a standard/random setup may draw from. Empty for 'custom'. */
  characters: readonly string[];
  /** Official scripts are listed first and cannot be edited by the Storyteller. */
  official: boolean;
}
