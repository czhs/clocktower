// Placeholder written by the multi-script scaffold; filled in by the bmr work.
import type { CharacterInfo } from './types.js';

export const BMR_CHARACTER_IDS = [] as const;
export type BmrCharacterId = (typeof BMR_CHARACTER_IDS)[number];
export const BMR_CHARACTER_INFO: Record<BmrCharacterId, CharacterInfo> = {};
