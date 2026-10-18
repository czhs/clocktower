// (v3 perf, v3-perf-server; world-art sign-off pending) The allocation-free collision test and the typed-array
// A* in apps/server/src/world/path.ts must decide EXACTLY what the previous code decided, on both layouts:
//   1. blockedPx === @ct/protocol isBlockedPx at every integer / half pixel of the map (+ a margin outside it)
//      and at random fractional points;
//   2. findPath === the previous implementation (copied below verbatim, on protocol isBlockedPx and Map / Set
//      bookkeeping) for seeded random routes inside every location;
//   3. every planned leg passes the movement validator's sweep (segmentClear), so server walks stay legal.
import { describe, expect, it } from 'vitest';
import { townLayout } from '@ct/assets';
import { townLayoutV3 } from '@ct/assets/hollowmere';
import { isBlockedPx, locationAt, tileCenterPx, type LocationId, type TownLayout } from '@ct/protocol';
import { blockedPx, findPath, pathGrid, segmentClear } from '../src/world/path.js';

const LAYOUTS: [string, TownLayout][] = [
  ['v2', townLayout],
  ['v3', townLayoutV3],
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- reference: apps/server/src/world/path.ts before the v3 perf pass (protocol isBlockedPx, Map / Set) ----
interface Pt {
  x: number;
  y: number;
}
function refSegmentClear(L: TownLayout, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(d / 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (isBlockedPx(L, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}
function refSegmentSafe(L: TownLayout, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(d));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    if (isBlockedPx(L, x - 1, y) || isBlockedPx(L, x + 1, y) || isBlockedPx(L, x, y - 1) || isBlockedPx(L, x, y + 1)) {
      if ((i === 0 || i === n) && !isBlockedPx(L, x, y)) continue;
      return false;
    }
  }
  return true;
}
function refAnchorTiles(L: TownLayout, free: Uint8Array, loc: LocationId[], p: Pt, location: LocationId): number[] {
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
        if (!free[i] || loc[i] !== location) continue;
        const c = tileCenterPx(L, { x: tx, y: ty });
        if (!refSegmentClear(L, p.x, p.y, c.x, c.y) || !(refSegmentSafe(L, p.x, p.y, c.x, c.y) || Math.hypot(c.x - p.x, c.y - p.y) < 1)) continue;
        out.push({ i, d: Math.hypot(c.x - p.x, c.y - p.y) });
      }
  return out.sort((a, b) => a.d - b.d).map((o) => o.i);
}
class RefHeap {
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
function refGrid(L: TownLayout) {
  const n = L.widthTiles * L.heightTiles;
  const free = new Uint8Array(n);
  const loc: LocationId[] = new Array(n);
  for (let ty = 0; ty < L.heightTiles; ty++)
    for (let tx = 0; tx < L.widthTiles; tx++) {
      const i = ty * L.widthTiles + tx;
      const c = tileCenterPx(L, { x: tx, y: ty });
      free[i] = isBlockedPx(L, c.x, c.y) ? 0 : 1;
      loc[i] = locationAt(L, c.x, c.y);
    }
  return { free, loc };
}
function refFindPath(L: TownLayout, g: { free: Uint8Array; loc: LocationId[] }, from: Pt, to: Pt, location: LocationId): Pt[] | null {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.5) return [];
  if (refSegmentSafe(L, from.x, from.y, to.x, to.y)) return [{ x: to.x, y: to.y }];
  const W = L.widthTiles;
  const starts = refAnchorTiles(L, g.free, g.loc, from, location);
  const goals = new Set(refAnchorTiles(L, g.free, g.loc, to, location));
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
  const heap = new RefHeap();
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
        if (nx < 0 || ny < 0 || nx >= W || ny >= L.heightTiles) continue;
        const ni = ny * W + nx;
        if (!g.free[ni] || g.loc[ni] !== location) continue;
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
  const raw: Pt[] = [from, ...tiles.map((i) => tileCenterPx(L, { x: i % W, y: Math.floor(i / W) })), to];
  const out: Pt[] = [];
  let i = 0;
  while (i < raw.length - 1) {
    let j = raw.length - 1;
    while (j > i + 1 && !refSegmentSafe(L, raw[i]!.x, raw[i]!.y, raw[j]!.x, raw[j]!.y)) j--;
    out.push({ x: raw[j]!.x, y: raw[j]!.y });
    i = j;
  }
  return out;
}

describe.each(LAYOUTS)('v3 perf: path.ts fast paths are exact (%s layout)', (_name, L) => {
  const ts = L.tileSize;
  const wPx = L.widthTiles * ts;
  const hPx = L.heightTiles * ts;

  it('blockedPx === isBlockedPx on every half pixel (and a margin outside the map) and at random points', () => {
    let blocked = 0;
    let mismatches = 0;
    for (let y = -20; y <= hPx + 20; y += 0.5)
      for (let x = -20; x <= wPx + 20; x += 0.5) {
        const a = isBlockedPx(L, x, y);
        if (a !== blockedPx(L, x, y)) mismatches++;
        if (a) blocked++;
      }
    const r = rng(7);
    for (let k = 0; k < 200_000; k++) {
      const x = r() * (wPx + 40) - 20;
      const y = r() * (hPx + 40) - 20;
      if (isBlockedPx(L, x, y) !== blockedPx(L, x, y)) mismatches++;
    }
    expect(mismatches).toBe(0);
    expect(blocked).toBeGreaterThan(0);
  });

  it('findPath === the previous implementation, and every leg passes the movement sweep', () => {
    const ref = refGrid(L);
    const g = pathGrid(L);
    expect([...g.free]).toEqual([...ref.free]);
    // walkable tile centres grouped by location
    const byLoc = new Map<LocationId, number[]>();
    for (let i = 0; i < g.free.length; i++) if (g.free[i]) (byLoc.get(g.loc[i]!) ?? byLoc.set(g.loc[i]!, []).get(g.loc[i]!)!).push(i);
    const r = rng(L === townLayout ? 11 : 13);
    const centre = (i: number) => tileCenterPx(L, { x: i % L.widthTiles, y: Math.floor(i / L.widthTiles) });
    const jitter = (p: Pt): Pt => ({ x: Math.round((p.x + (r() - 0.5) * 6) * 10) / 10, y: Math.round((p.y + (r() - 0.5) * 6) * 10) / 10 });
    let routes = 0;
    let multiLeg = 0;
    for (const [loc, tiles] of byLoc) {
      const n = loc === 'outdoors' ? 250 : 12;
      for (let k = 0; k < n; k++) {
        const a = jitter(centre(tiles[Math.floor(r() * tiles.length)]!));
        const b = jitter(centre(tiles[Math.floor(r() * tiles.length)]!));
        const want = refFindPath(L, ref, a, b, loc);
        const got = findPath(L, a, b, loc);
        expect(got).toEqual(want);
        if (!got) continue;
        routes++;
        if (got.length > 1) multiLeg++;
        let p = a;
        for (const q of got) {
          expect(segmentClear(L, p.x, p.y, q.x, q.y)).toBe(true);
          p = q;
        }
      }
    }
    expect(routes).toBeGreaterThan(200);
    expect(multiLeg).toBeGreaterThan(50);
  });
});
