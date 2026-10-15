// OWNED BY gameplay. Server-side path finding for server-driven walks (bedtime escort, Storyteller
// "walk to"): A* over the tile grid restricted to one location (outdoors or one interior), honouring
// the feet body box (a tile is walkable iff a body standing on its centre is clear), then
// string-pulled with the same swept-box test the movement validator uses, so every leg of the result
// is a straight segment the server itself would accept.
import { isBlockedPx, locationAt, tileCenterPx, type LocationId, type TownLayout } from '@ct/protocol';

export interface Pt {
  x: number;
  y: number;
}

/** Sweep step for collision checks along a segment (px). Same as the movement validator. */
const SWEEP_STEP = 2;

export interface PathGrid {
  layout: TownLayout;
  /** Per tile: walkable centre. */
  free: Uint8Array;
  /** Per tile: location id of the centre. */
  loc: LocationId[];
}

const grids = new WeakMap<TownLayout, PathGrid>();

export function pathGrid(layout: TownLayout): PathGrid {
  let g = grids.get(layout);
  if (g) return g;
  const n = layout.widthTiles * layout.heightTiles;
  const free = new Uint8Array(n);
  const loc: LocationId[] = new Array(n);
  for (let ty = 0; ty < layout.heightTiles; ty++)
    for (let tx = 0; tx < layout.widthTiles; tx++) {
      const i = ty * layout.widthTiles + tx;
      const c = tileCenterPx(layout, { x: tx, y: ty });
      free[i] = isBlockedPx(layout, c.x, c.y) ? 0 : 1;
      loc[i] = locationAt(layout, c.x, c.y);
    }
  g = { layout, free, loc };
  grids.set(layout, g);
  return g;
}

/** True when the straight segment a->b never overlaps blocked tiles (feet box swept). */
export function segmentClear(layout: TownLayout, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(d / SWEEP_STEP));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (isBlockedPx(layout, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

/**
 * Planning variant: 1 px samples and a 1 px safety margin around the body box, so EVERY point of the
 * segment (not only the samples) is clear — server-driven walks stop at arbitrary points mid-segment.
 */
export function segmentSafe(layout: TownLayout, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(d));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    if (isBlockedPx(layout, x - 1, y) || isBlockedPx(layout, x + 1, y) || isBlockedPx(layout, x, y - 1) || isBlockedPx(layout, x, y + 1)) {
      // The margin may touch a wall right at a start/end point that is itself legal (doorsteps):
      // only the exact point is required there.
      if ((i === 0 || i === n) && !isBlockedPx(layout, x, y)) continue;
      return false;
    }
  }
  return true;
}

/** Walkable tiles near `p` (same location) from which a straight segment reaches `p`, nearest first. */
function anchorTiles(g: PathGrid, p: Pt, location: LocationId): number[] {
  const L = g.layout;
  const ts = L.tileSize;
  const cx = Math.floor(p.x / ts);
  const cy = Math.floor((p.y - 1) / ts);
  const out: { i: number; d: number }[] = [];
  for (let r = 0; r <= 3 && out.length === 0; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= L.widthTiles || ty >= L.heightTiles) continue;
        const i = ty * L.widthTiles + tx;
        if (!g.free[i] || g.loc[i] !== location) continue;
        const c = tileCenterPx(L, { x: tx, y: ty });
        if (!segmentClear(L, p.x, p.y, c.x, c.y) || !(segmentSafe(L, p.x, p.y, c.x, c.y) || Math.hypot(c.x - p.x, c.y - p.y) < 1)) continue;
        out.push({ i, d: Math.hypot(c.x - p.x, c.y - p.y) });
      }
  return out.sort((a, b) => a.d - b.d).map((o) => o.i);
}

/** Minimal binary heap keyed by f. */
class Heap {
  private a: { i: number; f: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(i: number, f: number) {
    const a = this.a;
    a.push({ i, f });
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (a[p]!.f <= a[k]!.f) break;
      [a[p], a[k]] = [a[k]!, a[p]!];
      k = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < a.length && a[l]!.f < a[m]!.f) m = l;
        if (r < a.length && a[r]!.f < a[m]!.f) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k]!, a[m]!];
        k = m;
      }
    }
    return top.i;
  }
}

/**
 * Path from `from` to `to` inside one location, as waypoints (excluding `from`, ending at `to`).
 * null when unreachable.
 */
export function findPath(layout: TownLayout, from: Pt, to: Pt, location: LocationId): Pt[] | null {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.5) return [];
  if (segmentSafe(layout, from.x, from.y, to.x, to.y)) return [{ x: to.x, y: to.y }];
  const g = pathGrid(layout);
  const W = layout.widthTiles;
  const starts = anchorTiles(g, from, location);
  const goals = new Set(anchorTiles(g, to, location));
  if (!starts.length || !goals.size) return null;
  const goalTile = [...goals][0]!;
  const gx = goalTile % W;
  const gy = Math.floor(goalTile / W);
  const h = (i: number) => {
    const dx = Math.abs((i % W) - gx);
    const dy = Math.abs(Math.floor(i / W) - gy);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const gScore = new Map<number, number>();
  const came = new Map<number, number>();
  const heap = new Heap();
  for (const s of starts) {
    gScore.set(s, 0);
    heap.push(s, h(s));
  }
  let found = -1;
  const closed = new Set<number>();
  while (heap.size) {
    const cur = heap.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (goals.has(cur)) {
      found = cur;
      break;
    }
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    const gc = gScore.get(cur)!;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= layout.heightTiles) continue;
        const ni = ny * W + nx;
        if (!g.free[ni] || g.loc[ni] !== location) continue;
        // No corner cutting: a diagonal needs both orthogonal neighbours free.
        if (dx && dy && (!g.free[cy * W + nx] || !g.free[ny * W + cx])) continue;
        const ng = gc + (dx && dy ? Math.SQRT2 : 1);
        if (ng < (gScore.get(ni) ?? Infinity)) {
          gScore.set(ni, ng);
          came.set(ni, cur);
          heap.push(ni, ng + h(ni));
        }
      }
  }
  if (found < 0) return null;
  const tiles: number[] = [];
  for (let k: number | undefined = found; k !== undefined; k = came.get(k)) tiles.push(k);
  tiles.reverse();
  const raw: Pt[] = [from, ...tiles.map((i) => tileCenterPx(layout, { x: i % W, y: Math.floor(i / W) })), to];
  // String pulling: from each anchor jump to the farthest point still in straight view.
  const out: Pt[] = [];
  let i = 0;
  while (i < raw.length - 1) {
    let j = raw.length - 1;
    while (j > i + 1 && !segmentSafe(layout, raw[i]!.x, raw[i]!.y, raw[j]!.x, raw[j]!.y)) j--;
    out.push({ x: raw[j]!.x, y: raw[j]!.y });
    i = j;
  }
  return out;
}

/** Nearest free feet position to `p` within `maxR` px in the same location (deterministic spiral). */
export function nearestFree(layout: TownLayout, p: Pt, maxR = 40, ok: (x: number, y: number) => boolean = () => true): Pt | null {
  const loc = locationAt(layout, p.x, p.y);
  for (let r = 0; r <= maxR; r += 2) {
    const steps = r === 0 ? 1 : Math.max(8, Math.round(Math.PI * r));
    for (let k = 0; k < steps; k++) {
      const a = (2 * Math.PI * k) / steps;
      const x = Math.round(p.x + Math.cos(a) * r);
      const y = Math.round(p.y + Math.sin(a) * r);
      if (!isBlockedPx(layout, x, y) && locationAt(layout, x, y) === loc && ok(x, y)) return { x, y };
    }
  }
  return null;
}
