// OWNED BY rules-storyteller (st-qol). A ready-made FALSE info suggestion for a drunk / poisoned info
// character (and the Drunk), shown next to the engine's truthful suggestion in the Storyteller's
// view ("Use false info"). It reuses the automatic Storyteller's fate rules (plausible info that
// differs from the truth whenever the range allows), with an RNG seeded from the step, so the
// suggestion is stable between views and never consumes the game's RNG. Advisory only: the
// Storyteller may send the true info, this one, or anything else. Storyteller view ONLY.
import type { CharacterId, StorytellerGameView } from '@ct/protocol';
import { mulberry32, type GameState } from '@ct/rules';
import { decideInfo, isInfoRole } from '../auto/fate.js';

/** Stable 32-bit hash (FNV-1a) of a string. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Fill `falseInfo` on the unfinished, impaired info steps of a Storyteller view (in place). */
export function addFalseInfoSuggestions(s: GameState, v: StorytellerGameView): void {
  for (const sv of v.nightQueue) {
    if (!sv.impaired || sv.seat === null || sv.status === 'resolved' || sv.status === 'skipped') continue;
    const step = s.nightQueue.find((x) => x.id === sv.id);
    const p = s.players.find((x) => x.seat === sv.seat);
    if (!step || !p || !isInfoRole(step.kind)) continue;
    const chosen = step.response?.seats ?? [];
    // The Fortune Teller / Ravenkeeper learn about the players they chose: wait for the choice.
    if ((step.kind === 'fortune_teller' || step.kind === 'ravenkeeper') && !chosen.length) continue;
    if (s.players.length < 3) continue;
    const d = decideInfo(s, mulberry32(hash(`${s.nightNumber}:${step.id}:${chosen.join(',')}`)), p, step.kind as CharacterId, chosen);
    if (d.falseInfo) sv.falseInfo = { ...d.info, stepId: sv.id };
  }
}
