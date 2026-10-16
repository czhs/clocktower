// (v2.3 AUTH-7) Removes a deleted account from saved game records (match_records.record_json).
//
// A record names each person as { accountId, displayName, label } (seats, the Storyteller) and
// repeats their label inside free-text lines ("Alice nominated Bob."). On deletion every object
// whose accountId is the deleted account gets the tombstone id and "Deleted player" as name/label,
// and every whole-word occurrence of their former names inside other strings is replaced too.
// Game facts (characters, votes, deaths) stay, so totals and other players' histories are intact.

export const DELETED_PLAYER_NAME = 'Deleted player';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Returns the scrubbed record and whether anything changed. */
export function scrubAccountFromRecord(record: Json, accountId: string, tombstone: string): { record: Json; changed: boolean } {
  const names = new Set<string>();
  let changed = false;

  // Pass 1: the person's own objects.
  const visit = (v: Json): Json => {
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
      const out: { [k: string]: Json } = {};
      for (const [k, x] of Object.entries(v)) out[k] = visit(x);
      if (out.accountId === accountId) {
        changed = true;
        out.accountId = tombstone;
        for (const key of ['displayName', 'label', 'name']) {
          const n = out[key];
          if (typeof n === 'string') {
            if (n.trim()) names.add(n);
            out[key] = DELETED_PLAYER_NAME;
          }
        }
      }
      for (const [k, x] of Object.entries(out)) if (x === accountId && k !== 'accountId') ((out[k] = tombstone), (changed = true));
      return out;
    }
    return v;
  };
  let next = visit(record);

  // Pass 2: their former names inside free text (whole words, longest first, case-sensitive).
  const sorted = [...names].sort((a, b) => b.length - a.length);
  if (sorted.length) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${sorted.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
    const text = (v: Json): Json => {
      if (typeof v === 'string') {
        const r = v.replace(re, DELETED_PLAYER_NAME);
        if (r !== v) changed = true;
        return r;
      }
      if (Array.isArray(v)) return v.map(text);
      if (v && typeof v === 'object') {
        const out: { [k: string]: Json } = {};
        for (const [k, x] of Object.entries(v)) out[k] = k === 'accountId' || k === 'pid' || k === 'id' ? x : text(x);
        return out;
      }
      return v;
    };
    next = text(next);
  }
  return { record: next, changed };
}
