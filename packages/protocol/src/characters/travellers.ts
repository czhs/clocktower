// Placeholder written by the multi-script scaffold; filled in by the travellers work.
import type { CharacterInfo } from './types.js';

export const TRAVELLERS_CHARACTER_IDS = [] as const;
export type TravellersCharacterId = (typeof TRAVELLERS_CHARACTER_IDS)[number];
export const TRAVELLERS_CHARACTER_INFO: Record<TravellersCharacterId, CharacterInfo> = {};
