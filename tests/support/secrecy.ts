// Protocol-level secrecy scanners (qa-deploy) shared by the leakage / adversarial / log suites.
import { CHARACTER_IDS } from '../../packages/protocol/src/index.js';
import { collectKeys, type RecordedMessage } from './recorder.js';

/** Fields that exist only in StorytellerGameView / GrimoireEntry / server state. */
export const ST_ONLY_KEYS = [
  'grimoire', 'demonBluffs', 'nightQueue', 'visitingSeat', 'travelSpeedMult', 'alerts', 'believedCharacter',
  'poisoned', 'drunk', 'protectedTonight', 'reminders', 'redHerringSeat', 'isRedHerring', 'accountId', 'passphrase',
];

/** Keys a PublicPlayerView (players[] in a player's game:view) may carry. Anything else is suspect. */
export const PUBLIC_PLAYER_KEYS = new Set([
  'pid', 'seat', 'name', 'alive', 'ghostVoteAvailable', 'nominatedToday', 'wasNominatedToday', 'connected',
]);

export function forbiddenKeysIn(msgs: RecordedMessage[]): string[] {
  const found = new Set<string>();
  for (const m of msgs) {
    if (m.type === 'chat:message') continue;
    const keys = collectKeys(m.payload);
    for (const k of ST_ONLY_KEYS) if (keys.has(k)) found.add(`${m.type}.${k}`);
  }
  return [...found];
}

/** Extra keys on players[] entries of player game views (e.g. a leaked `character` or `alignment`). */
export function nonPublicPlayerKeys(msgs: RecordedMessage[]): string[] {
  const found = new Set<string>();
  for (const m of msgs) {
    if (m.type !== 'game:view') continue;
    for (const p of (m.payload as any)?.players ?? []) for (const k of Object.keys(p)) if (!PUBLIC_PLAYER_KEYS.has(k)) found.add(k);
  }
  return [...found];
}

/** Character ids found in a player's messages OUTSIDE their legitimate private channels. */
export function strayCharacters(msgs: RecordedMessage[]): { type: string; character: string; excerpt: string }[] {
  const out: { type: string; character: string; excerpt: string }[] = [];
  for (const m of msgs) {
    if (m.type === 'chat:message' || m.type === 'announcement') continue; // user text / public ST announcements
    let payload: any = m.payload;
    if (m.type === 'game:view' && payload && typeof payload === 'object') {
      // Own role, own info and own prompts are legitimate; the end-of-game reveal is public.
      const { you, info, prompts, announcements, result, ...rest } = payload;
      const { role, ...youRest } = you ?? {};
      payload = { ...rest, you: youRest };
      void role; void info; void prompts; void announcements; void result;
    }
    const json = JSON.stringify(payload) ?? '';
    for (const c of CHARACTER_IDS) {
      const i = json.indexOf(`"${c}"`);
      if (i >= 0) out.push({ type: m.type, character: c, excerpt: json.slice(Math.max(0, i - 80), i + 40) });
    }
  }
  return out;
}

/** "good"/"evil" values outside the player's own role/result (e.g. someone else's alignment). */
export function strayAlignments(msgs: RecordedMessage[]): string[] {
  const out: string[] = [];
  for (const m of msgs) {
    if (m.type !== 'game:view') continue;
    const { you, result, info, ...rest } = (m.payload as any) ?? {};
    const { role, ...youRest } = you ?? {};
    void role; void result; void info;
    const json = JSON.stringify({ ...rest, you: youRest });
    for (const a of ['"good"', '"evil"']) if (json.includes(a)) out.push(`${m.type}: ${a} in ${json.slice(Math.max(0, json.indexOf(a) - 80), json.indexOf(a) + 20)}`);
  }
  return out;
}
