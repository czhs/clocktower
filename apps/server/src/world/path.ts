// OWNED BY gameplay. Server-side path finding for server-driven walks (bedtime escort, Storyteller
// "walk to"): A* over the tile grid restricted to one location (outdoors or one interior), honouring
// the feet body box (a tile is walkable iff a body standing on its centre is clear), then
// string-pulled with the same swept-box test the movement validator uses, so every leg of the result
// is a straight segment the server itself would accept.
import { BODY_H, BODY_HALF_W, locationAt, tileCenterPx, type LocationId, type TownLayout } from '@ct/protocol';

/**
 * (v3 perf) Allocation-free twin of `@ct/protocol` `isBlockedPx`: the same four feet-box corners, the same
 * tiles, the same "outside the map = blocked" rule, bit for bit (the same float expressions), so every
 * server decision is unchanged. The protocol version builds an array of four arrays per call; this one sits
 * in every movement sweep (2 px steps) and in path planning (1 px samples x 5), where the allocations were
 * most of the cost (docs/perf-v3/server.md). `apps/server/test/world.blockedPx.test.ts` checks the
 * equivalence on both layouts. CONTRACT-REQUEST(lead): adopt this body in protocol `isBlockedPx`.
 */
export function blockedPx(layout: TownLayout, x: number, y: number): boolean {
  const ts = layout.tileSize;
  const W = layout.widthTiles;
  const tx0 = Math.floor((x - BODY_HALF_W) / ts);
  const tx1 = Math.floor((x + BODY_HALF_W) / ts);
  const ty0 = Math.floor((y - BODY_H) / ts);
  const ty1 = Math.floor((y - 1) / ts);
  if (tx0 < 0 || ty0 < 0 || tx1 >= W || ty1 >= layout.heightTiles) return true;
  const c = layout.collision;
  return c[ty0 * W + tx0] === 1 || c[ty0 * W + tx1] === 1 || c[ty1 * W + tx0] === 1 || c[ty1 * W + tx1] === 1;
}
const isBlockedPx = blockedPx;

/** Any tile of the inclusive tile rectangle [tx0..tx1] x [ty0..ty1] blocked (outside the map = blocked). */
function rectBlocked(layout: TownLayout, tx0: number, tx1: number, ty0: number, ty1: number): boolean {
  const W = layout.widthTiles;
  if (tx0 < 0 || ty0 < 0 || tx1 >= W || ty1 >= layout.heightTiles) return true;
  const c = layout.collision;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0, i = ty * W + tx0; tx <= tx1; tx++, i++) if (c[i] === 1) return true;
  return false;
}

/**
 * (v3 perf) `blockedPx(x-1, y) || blockedPx(x+1, y) || blockedPx(x, y-1) || blockedPx(x, y+1)` (the 1 px planning
 * margin of segmentSafe) as two tile rectangles instead of four body boxes (16 tile reads -> typically 4-6).
 * Exact: the boxes at x-1 and x+1 share their rows and their column spans overlap (the box is 10 px wide), so
 * together they cover exactly the columns floor(((x-1)-5)/ts) .. floor(((x+1)+5)/ts) (the same float expressions
 * as blockedPx, so the same tiles); likewise the boxes at y-1 and y+1 cover the rows floor(((y-1)-6)/ts) ..
 * floor(((y+1)-1)/ts) of their shared columns; and one of the four boxes is outside the map iff its rectangle
 * reaches outside. `apps/server/test/world.blockedPx.test.ts` checks it against the four calls on both layouts.
 */
export function marginBlockedPx(layout: TownLayout, x: number, y: number): boolean {
  const ts = layout.tileSize;
  const yl = y - 1;
  const yh = y + 1;
  const xl = x - 1;
  const xh = x + 1;
  return (
    rectBlocked(layout, Math.floor((xl - BODY_HALF_W) / ts), Math.floor((xh + BODY_HALF_W) / ts), Math.floor((y - BODY_H) / ts), Math.floor((y - 1) / ts)) ||
    rectBlocked(layout, Math.floor((x - BODY_HALF_W) / ts), Math.floor((x + BODY_HALF_W) / ts), Math.floor((yl - BODY_H) / ts), Math.floor((yh - 1) / ts))
  );
}

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
    if (marginBlockedPx(layout, x, y)) {
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
  // (v3 perf) Typed arrays instead of Map / Set (same visiting order, same result).
  const N = W * layout.heightTiles;
  const gScore = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new Heap();
  for (const s of starts) {
    gScore[s] = 0;
    heap.push(s, h(s));
  }
  let found = -1;
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (goals.has(cur)) {
      found = cur;
      break;
    }
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    const gc = gScore[cur]!;
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
        if (ng < gScore[ni]!) {
          gScore[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + h(ni));
        }
      }
  }
  if (found < 0) return null;
  const tiles: number[] = [];
  for (let k = found; k !== -1; k = came[k]!) tiles.push(k);
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
