// The character registry: every script's table merged into one `ROLES` map, plus the night-order
// helpers the Storyteller UI reads.
//
// The definition contract and its helpers live in ./rolekit.ts; the tables live in ./scripts/*.
// Nothing in the engine branches on a character id — it calls the hooks declared here.
import { CHARACTER_IDS, CHARACTER_INFO, type CharacterId, type ScriptId, charactersOfScript } from '@ct/protocol';
import type { RoleDef, ScriptRoleDefs } from './rolekit.js';
import { BMR_ROLES } from './scripts/bmr.js';
import { FABLED_ROLES } from './scripts/fabled.js';
import { HOMEBREW_ROLES } from './scripts/homebrew.js';
import { SNV_ROLES } from './scripts/snv.js';
import { TB_ROLES } from './scripts/tb.js';
import { TRAVELLERS_ROLES } from './scripts/travellers.js';

export type { RoleDef, ScriptRoleDefs, StepSuggestion, ResolveInput, KillPrevention } from './rolekit.js';

/**
 * Every character definition, keyed by id. A character present in the protocol catalogue but
 * without a definition gets an inert default (no wake, no hooks) rather than throwing: a homebrew
 * character may legitimately be pure Storyteller judgement with nothing for the engine to do.
 */
const SCRIPT_TABLES: readonly ScriptRoleDefs[] = [
  TB_ROLES,
  BMR_ROLES,
  SNV_ROLES,
  TRAVELLERS_ROLES,
  FABLED_ROLES,
  HOMEBREW_ROLES,
];

function buildRoles(): Record<CharacterId, RoleDef> {
  const merged: Partial<Record<CharacterId, Omit<RoleDef, 'id' | 'type'>>> = {};
  for (const table of SCRIPT_TABLES) {
    for (const [id, def] of Object.entries(table) as [CharacterId, Omit<RoleDef, 'id' | 'type'>][]) {
      if (merged[id]) throw new Error(`duplicate role definition for ${id}`);
      merged[id] = def;
    }
  }
  const out = {} as Record<CharacterId, RoleDef>;
  for (const id of CHARACTER_IDS) {
    const d = merged[id] ?? { firstNight: null, otherNight: null };
    out[id] = { id, type: CHARACTER_INFO[id].type, ...d };
  }
  return out;
}

export const ROLES: Readonly<Record<CharacterId, RoleDef>> = buildRoles();

/** Characters that wake on the first night, in order. Scoped to `script` when given. */
export function firstNightOrder(script?: ScriptId): CharacterId[] {
  return pool(script)
    .filter((c) => ROLES[c].firstNight !== null)
    .sort((a, b) => ROLES[a].firstNight! - ROLES[b].firstNight!);
}

/** Characters that wake on later nights, in order (including death-triggered wakes). */
export function otherNightOrder(script?: ScriptId): CharacterId[] {
  return pool(script)
    .filter((c) => ROLES[c].otherNight !== null || ROLES[c].dynamicOrder !== undefined)
    .sort((a, b) => (ROLES[a].otherNight ?? ROLES[a].dynamicOrder!) - (ROLES[b].otherNight ?? ROLES[b].dynamicOrder!));
}

function pool(script?: ScriptId): CharacterId[] {
  if (!script || script === 'custom') return [...CHARACTER_IDS];
  return [...charactersOfScript(script)];
}

/** Advisory notes when two characters on the same script interact awkwardly. */
export function jinxesFor(inPlay: readonly CharacterId[]): { a: CharacterId; b: CharacterId; note: string }[] {
  const out: { a: CharacterId; b: CharacterId; note: string }[] = [];
  for (const a of inPlay) {
    const jx = ROLES[a].jinxes;
    if (!jx) continue;
    for (const b of inPlay) {
      const note = jx[b];
      if (note) out.push({ a, b, note });
    }
  }
  return out;
}

/** First-night order of the Trouble Brewing script (kept for existing callers/tests). */
export const FIRST_NIGHT_ORDER: CharacterId[] = firstNightOrder('trouble-brewing');
export const OTHER_NIGHT_ORDER: CharacterId[] = otherNightOrder('trouble-brewing');
