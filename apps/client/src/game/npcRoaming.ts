// Cosmetic townsfolk steering. The caller supplies only visible outdoor Brianbis;
// this module never reads room/game state or changes authoritative player movement.
export interface NpcPoint { x: number; y: number }
export const NPC_ROAM_RADIUS = 48;
export const NPC_NOTICE_RADIUS = 48;
const CALM_RADIUS = 64;
type ClearPath = (from: NpcPoint, to: NpcPoint) => boolean;

export interface NpcRoamer extends NpcPoint {
  readonly home: Readonly<NpcPoint>;
  readonly seed: number;
  target: NpcPoint | null;
  avoiding: boolean;
  waitUntil: number;
  nextTurnAt: number;
  turn: number;
}

export function createNpcRoamer(home: NpcPoint, seed: number): NpcRoamer {
  return { ...home, home: { ...home }, seed, target: null, avoiding: false, waitUntil: seed * 600, nextTurnAt: 0, turn: 0 };
}

const distance = (a: NpcPoint, b: NpcPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const inRange = (n: NpcRoamer, p: NpcPoint) => distance(n.home, p) <= NPC_ROAM_RADIUS;

/** Step a bounded wanderer; returns its actual displacement for the facing/walk animation. */
export function stepNpcRoamer(n: NpcRoamer, dt: number, now: number, brianbis: readonly NpcPoint[], clear: ClearPath): NpcPoint {
  const start = { x: n.x, y: n.y };
  const nearest = [...brianbis].sort((a, b) => distance(n, a) - distance(n, b))[0];
  const avoiding = !!nearest && distance(n, nearest) < (n.avoiding ? CALM_RADIUS : NPC_NOTICE_RADIUS);
  if (avoiding !== n.avoiding) {
    n.avoiding = avoiding;
    n.target = avoiding ? null : { ...n.home };
    n.waitUntil = 0;
    n.nextTurnAt = 0;
  }

  if (avoiding && (now >= n.nextTurnAt || (n.target && distance(n, n.target) < 0.5))) {
    n.nextTurnAt = now + 350; // commit briefly to a heading rather than twitch every frame
    n.target = null;
    const away = distance(n, nearest!) > 0.01 ? Math.atan2(n.y - nearest!.y, n.x - nearest!.x) : n.seed * 2.4;
    const safety = (p: NpcPoint) => Math.min(...brianbis.map((b) => distance(p, b)));
    let best = safety(n) + 0.5;
    // Try short sidesteps too, so walls and the home boundary don't trap a legal turn.
    for (const stride of [24, 12, 6]) for (let i = 0; i < 16; i++) {
      const angle = away + i * Math.PI / 8;
      const p = { x: n.x + Math.cos(angle) * stride, y: n.y + Math.sin(angle) * stride };
      if (!inRange(n, p) || !clear(n, p)) continue;
      const score = safety(p);
      if (score > best) { best = score; n.target = p; }
    }
  } else if (!avoiding && !n.target && now >= n.waitUntil) {
    // All ordinary destinations are even closer to home than the hard leash.
    for (let i = 0; i < 12; i++) {
      const angle = (n.seed * 1.7 + ++n.turn * 2.4);
      const p = { x: n.home.x + Math.cos(angle) * 28, y: n.home.y + Math.sin(angle) * 28 };
      if (clear(n, p)) { n.target = p; break; }
    }
    if (!n.target) n.waitUntil = now + 1000;
  }

  if (n.target && (avoiding || now >= n.waitUntil)) {
    const d = distance(n, n.target);
    const step = Math.min(d, (avoiding ? 44 : 24) * Math.max(0, Math.min(dt, 0.1)));
    const p = d > 0 ? { x: n.x + (n.target.x - n.x) / d * step, y: n.y + (n.target.y - n.y) / d * step } : start;
    if (inRange(n, p) && clear(n, p)) { n.x = p.x; n.y = p.y; }
    else { n.target = null; n.nextTurnAt = 0; }
    if (n.target && d <= step + 0.01) {
      n.target = null;
      n.waitUntil = now + 1200 + (n.turn % 3) * 600;
    }
  }
  return { x: n.x - start.x, y: n.y - start.y };
}
