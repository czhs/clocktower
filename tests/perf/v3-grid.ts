// (v3 perf recon, front "server") Layout-aware walkable grid + BFS for perf bots (tests/support/bot.ts plans on the v2
// layout only). Used by tests/perf/v3-server-load.ts and tests/perf/v3-server-bench.ts.
import { isBlockedPx, locationAt, tileCenterPx, type TownLayout } from '../../packages/protocol/src/index.js';

export class Grid {
  private cache = new Map<number, boolean>();
  constructor(readonly L: TownLayout) {}
  walkable(tx: number, ty: number): boolean {
    const L = this.L;
    if (tx < 0 || ty < 0 || tx >= L.widthTiles || ty >= L.heightTiles) return false;
    const k = ty * L.widthTiles + tx;
    let v = this.cache.get(k);
    if (v === undefined) {
      const c = tileCenterPx(L, { x: tx, y: ty });
      v = !isBlockedPx(L, c.x, c.y);
      this.cache.set(k, v);
    }
    return v;
  }
  /** Random walkable tile within ~10 tiles in the same location. */
  nearby(pos: { x: number; y: number }): { x: number; y: number } | null {
    const ts = this.L.tileSize;
    const here = locationAt(this.L, pos.x, pos.y);
    for (let i = 0; i < 40; i++) {
      const tx = Math.floor(pos.x / ts) + Math.floor(Math.random() * 21) - 10;
      const ty = Math.floor(pos.y / ts) + Math.floor(Math.random() * 21) - 10;
      if (this.walkable(tx, ty) && locationAt(this.L, tx * ts + 8, ty * ts + 14) === here) return { x: tx, y: ty };
    }
    return null;
  }
  /** BFS over 4-connected walkable tiles; tile-centre waypoints (start tile centre first). */
  plan(from: { x: number; y: number }, goal: { x: number; y: number }, maxNodes = 8000): { x: number; y: number }[] | null {
    const L = this.L;
    const ts = L.tileSize;
    const W = L.widthTiles;
    const sx = Math.floor(from.x / ts);
    const sy = Math.floor(from.y / ts);
    if (!this.walkable(goal.x, goal.y)) return null;
    const start = sy * W + sx;
    const target = goal.y * W + goal.x;
    const prev = new Map<number, number>([[start, -1]]);
    const q = [start];
    for (let qi = 0; qi < q.length && qi < maxNodes; qi++) {
      const cur = q[qi]!;
      if (cur === target) break;
      const cx = cur % W;
      const cy = Math.floor(cur / W);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
        const k = ny * W + nx;
        if (prev.has(k) || !this.walkable(nx, ny)) continue;
        prev.set(k, cur);
        q.push(k);
      }
    }
    if (!prev.has(target)) return null;
    const out: { x: number; y: number }[] = [];
    for (let k = target; k !== -1 && k !== start; k = prev.get(k)!) out.push(tileCenterPx(L, { x: k % W, y: Math.floor(k / W) }));
    out.push(tileCenterPx(L, { x: sx, y: sy }));
    return out.reverse();
  }
}
