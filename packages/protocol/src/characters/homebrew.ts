// Placeholder written by the multi-script scaffold; filled in by the homebrew work.
import type { CharacterInfo } from './types.js';

export const HOMEBREW_CHARACTER_IDS = [] as const;
export type HomebrewCharacterId = (typeof HOMEBREW_CHARACTER_IDS)[number];
export const HOMEBREW_CHARACTER_INFO: Record<HomebrewCharacterId, CharacterInfo> = {};
