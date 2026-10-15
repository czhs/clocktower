// OWNED BY lobby-auth (v2 roster rules, server-v2). Characters are ONLY the playable roster in
// @ct/assets cast.ts (PLAYABLE / PLAYABLE_IDS); there are no custom (layered) characters any more.
//
//   * New choices (PATCH /api/me, 'lobby:cosmetics') must be a playable id: null / legacy preset ids
//     (the v1 'lamplighter'…) / non-playable cast ids ('storyteller', NPCs) are rejected.
//   * Accounts stored before v2 (preset null / legacy id) still sign in and join: the lobby assigns
//     them a free playable character for that lobby (GameRoom), without rewriting the account.
//   * New accounts get a random playable character.
import { randomInt } from 'node:crypto';
import { castById, PLAYABLE, PLAYABLE_IDS } from '@ct/assets';

/** A character a player may choose (new choices only). */
export function isAllowedPreset(preset: string | null | undefined): preset is string {
  return typeof preset === 'string' && PLAYABLE_IDS.has(preset);
}

/** Random playable character (account creation default). */
export function randomPlayable(): string {
  return PLAYABLE[randomInt(PLAYABLE.length)]!.id;
}

/** Display name of a character id ("Sir Croaksworth"), or the id itself. */
export function characterName(id: string): string {
  return castById(id)?.name ?? id;
}

/** FNV-1a 32-bit (deterministic start offset; not a security primitive). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The first free playable character for a lobby member, scanning the roster in order from a start
 * offset derived from `seed` (lobby id + member pid: deterministic for this lobby and member, and
 * spread out so lobbies do not all hand out the same first character). null only if every playable
 * character is taken (cannot happen: the roster is larger than a lobby).
 */
export function firstFreeCharacter(taken: ReadonlySet<string>, seed: string): string | null {
  const n = PLAYABLE.length;
  const start = fnv1a(seed) % n;
  for (let k = 0; k < n; k++) {
    const id = PLAYABLE[(start + k) % n]!.id;
    if (!taken.has(id)) return id;
  }
  return null;
}
