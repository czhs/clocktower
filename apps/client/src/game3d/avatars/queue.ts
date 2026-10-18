// v3 WP2 (v3-avatars). Build order of the character rigs (docs/v3/INTEGRATION.md §4 "Costs"): a rig build is
// 55-90 ms + 25-40 ms for its first update, so the layer starts at most ONE build per frame and keeps at most
// one in flight. Order: the own player first, then avatars in the viewer's location by distance, then the rest
// of the players (prebuilt for when they come into view), then the townsfolk. Pure (avatars.queue.test.ts).

export interface BuildCandidate {
  key: string;
  /** The viewer's own avatar. */
  self: boolean;
  /** A cosmetic townsperson (built after every player). */
  npc: boolean;
  /** In the viewer's current location. */
  here: boolean;
  /** Distance to the viewer (v2 px), Infinity when unknown. */
  dist: number;
}

function rank(c: BuildCandidate): number {
  if (c.self) return 0;
  if (c.npc) return c.here ? 3 : 4;
  return c.here ? 1 : 2;
}

/** The next avatar to build, or null. Ties keep the input order (stable). */
export function nextBuild<T extends BuildCandidate>(cands: readonly T[]): T | null {
  let best: T | null = null;
  let bestRank = Infinity;
  let bestDist = Infinity;
  for (const c of cands) {
    const r = rank(c);
    const d = Number.isFinite(c.dist) ? c.dist : Infinity;
    if (r < bestRank || (r === bestRank && d < bestDist)) {
      best = c;
      bestRank = r;
      bestDist = d;
    }
  }
  return best;
}
