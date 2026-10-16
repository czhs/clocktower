// Placeholder written by the multi-script scaffold; filled in by the fabled work.
import type { CharacterInfo } from './types.js';

export const FABLED_CHARACTER_IDS = [] as const;
export type FabledCharacterId = (typeof FABLED_CHARACTER_IDS)[number];
export const FABLED_CHARACTER_INFO: Record<FabledCharacterId, CharacterInfo> = {};
