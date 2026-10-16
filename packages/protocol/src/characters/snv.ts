// Placeholder written by the multi-script scaffold; filled in by the snv work.
import type { CharacterInfo } from './types.js';

export const SNV_CHARACTER_IDS = [] as const;
export type SnvCharacterId = (typeof SNV_CHARACTER_IDS)[number];
export const SNV_CHARACTER_INFO: Record<SnvCharacterId, CharacterInfo> = {};
