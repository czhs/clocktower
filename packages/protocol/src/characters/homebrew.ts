// Homebrew characters — custom characters that are not on any official script.
//
// This is the file to edit to add your own character. Adding one here (plus a definition in
// packages/rules/src/scripts/homebrew.ts) is all it takes: nothing in the engine needs to change.
// See docs/homebrew.md for the full guide and copy-pasteable templates.
//
// Homebrew characters are not in any official script's pool, so they only appear in a 'custom'
// script built with `buildCustomScript` (packages/rules/src/customScript.ts).
import type { CharacterInfo } from './types.js';

export const HOMEBREW_CHARACTER_IDS = [
  'wizard',
  'plague_doctor',
] as const;

export type HomebrewCharacterId = (typeof HOMEBREW_CHARACTER_IDS)[number];

export const HOMEBREW_CHARACTER_INFO: Record<HomebrewCharacterId, CharacterInfo> = {
  wizard: {
    name: 'Wizard',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Once per game, during the day, publicly ask the Storyteller for anything. It might happen, and there might be a price.',
  },
  plague_doctor: {
    name: 'Plague Doctor',
    type: 'outsider',
    alignment: 'good',
    ability: 'When you die, the Storyteller gains a Minion ability.',
    setupHint: '[The Storyteller gains an ability when this player dies]',
  },
};
