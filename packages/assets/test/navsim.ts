// OWNED BY world-audit. Test-only navigation helpers shared by packages/assets/test/navigation.test.ts
// and apps/server/test/world.nav.test.ts: a 2 px lattice over the body-box collision, BFS paths,
// string pulling, and a frame-by-frame replica of the client's movement prediction
// (apps/client/src/game/TownScene.ts stepLocal: normalised input, step = speed*dt, x then y,
// each axis only if the feet box is free and the location is unchanged).
import { BODY_HALF_W, isBlockedPx, locationAt, PLAYER_SPEED, type TownLayout } from '@ct/protocol';

export interface Pt {
  x: number;
  y: number;
}

export const STEP = 2;

export interface Lattice {
  layout: TownLayout;
  gw: number;
  gh: number;
  blocked: Uint8Array;
  node(p: Pt): number;
  px(n: number): Pt;
}

const cache = new WeakMap<TownLayout, Lattice>();

export function lattice(L: TownLayout): Lattice {
  const hit = cache.get(L);
  if (hit) return hit;
  const gw = (L.widthTiles * L.tileSize) / STEP;
  const gh = (L.heightTiles * L.tileSize) / STEP;
  const blocked = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) blocked[gy * gw + gx] = isBlockedPx(L, gx * STEP, gy * STEP) ? 1 : 0;
  const lat: Lattice = {
    layout: L,
    gw,
    gh,
    blocked,
    node(p) {
      if (p.x % STEP !== 0 || p.y % STEP !== 0) throw new Error(`off-lattice ${p.x},${p.y}`);
      return (p.y / STEP) * gw + p.x / STEP;
    },
    px: (n) => ({ x: (n % gw) * STEP, y: Math.floor(n / gw) * STEP }),
  };
  cache.set(L, lat);
  return lat;
}

/** 4-connected BFS over free lattice nodes inside one location. prev[n] = -1 when unreached. */
export function bfs(lat: Lattice, from: Pt): Int32Array {
  const { gw, gh, blocked, layout: L } = lat;
  const prev = new Int32Array(gw * gh).fill(-1);
  const start = lat.node(from);
  if (blocked[start]) throw new Error(`start blocked ${from.x},${from.y}`);
  const loc = locationAt(L, from.x, from.y);
  prev[start] = start;
  const q = new Int32Array(gw * gh);
  let h = 0;
  let t = 0;
  q[t++] = start;
  while (h < t) {
    const n = q[h++]!;
    const gx = n % gw;
    const gy = (n - gx) / gw;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const m = ny * gw + nx;
      if (prev[m] !== -1 || blocked[m]) continue;
      if (locationAt(L, nx * STEP, ny * STEP) !== loc) continue;
      prev[m] = n;
      q[t++] = m;
    }
  }
  return prev;
}

export function pathTo(lat: Lattice, prev: Int32Array, to: Pt): Pt[] | null {
  let n = lat.node(to);
  if (prev[n] === -1) return null;
  const out = [lat.px(n)];
  while (prev[n] !== n) {
    n = prev[n]!;
    out.push(lat.px(n));
  }
  return out.reverse();
}

function clearLine(L: TownLayout, a: Pt, b: Pt): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(d));
  for (let i = 0; i <= n; i++) if (isBlockedPx(L, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
  return true;
}

/** The polyline an 8-direction keyboard player produces from a to b: diagonal, then straight. */
function keysCorner(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const m = Math.min(Math.abs(dx), Math.abs(dy));
  return { x: a.x + Math.sign(dx) * m, y: a.y + Math.sign(dy) * m };
}

/** String pulling: aim at the farthest path point the chosen input style can reach in a straight go. */
export function smooth(L: TownLayout, path: Pt[], mode: 'pointer' | 'keys'): Pt[] {
  const ok = (a: Pt, b: Pt) => (mode === 'pointer' ? clearLine(L, a, b) : clearLine(L, a, keysCorner(a, b)) && clearLine(L, keysCorner(a, b), b));
  const out = [path[0]!];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !ok(path[i]!, path[j]!)) j--;
    out.push(path[j]!);
    i = j;
  }
  return out;
}

export interface Me extends Pt {
  loc: string;
}

/**
 * One client frame. `nudge` > 0 enables the corner correction recommended in docs/world-audit.md:
 * when the move on one axis is blocked but would be free after shifting <= nudge px on the other
 * axis, slide on the other axis toward that gap (at most the frame's step).
 */
export function stepClient(L: TownLayout, me: Me, vx0: number, vy0: number, dt: number, opts: { nudge?: number; clampTo?: Pt; speed?: number } = {}) {
  const len = Math.hypot(vx0, vy0);
  if (len === 0) return;
  const vx = vx0 / len;
  const vy = vy0 / len;
  const step = (opts.speed ?? PLAYER_SPEED) * dt;
  let sx = vx * step;
  let sy = vy * step;
  if (opts.clampTo) {
    const dx = opts.clampTo.x - me.x;
    const dy = opts.clampTo.y - me.y;
    if (Math.abs(sx) > Math.abs(dx)) sx = dx;
    if (Math.abs(sy) > Math.abs(dy)) sy = dy;
  }
  const free = (x: number, y: number) => !isBlockedPx(L, x, y) && locationAt(L, x, y) === me.loc;
  const nx = me.x + sx;
  let movedX = false;
  if (free(nx, me.y)) {
    me.x = nx;
    movedX = true;
  }
  const ny = me.y + sy;
  let movedY = false;
  if (free(me.x, ny)) {
    me.y = ny;
    movedY = true;
  }
  const n = opts.nudge ?? 0;
  if (n <= 0) return;
  // corner correction: blocked on the dominant axis with (almost) no input on the other one
  if (!movedX && Math.abs(vx) > 0.5 && Math.abs(sy) < 0.5 * step) {
    for (let off = 1; off <= n; off++) {
      const dirs = vy !== 0 ? [Math.sign(vy)] : [1, -1];
      const d = dirs.find((s) => free(me.x, me.y + s * off) && free(me.x + Math.sign(vx) * Math.max(1, Math.abs(sx)), me.y + s * off));
      if (d !== undefined) {
        const ty = me.y + d * Math.min(off, step);
        if (free(me.x, ty)) me.y = ty;
        break;
      }
    }
  } else if (!movedY && Math.abs(vy) > 0.5 && Math.abs(sx) < 0.5 * step) {
    for (let off = 1; off <= n; off++) {
      const dirs = vx !== 0 ? [Math.sign(vx)] : [1, -1];
      const d = dirs.find((s) => free(me.x + s * off, me.y) && free(me.x + s * off, me.y + Math.sign(vy) * Math.max(1, Math.abs(sy))));
      if (d !== undefined) {
        const tx = me.x + d * Math.min(off, step);
        if (free(tx, me.y)) me.x = tx;
        break;
      }
    }
  }
}

export interface SimOptions {
  mode: 'pointer' | 'keys';
  /** Arrival radius for intermediate waypoints (sloppy players turn early). 0 = exact. */
  sloppy?: number;
  nudge?: number;
  /** Called every frame with the current position (e.g. to feed the server at 15 Hz). */
  onFrame?: (me: Me, frame: number, moving: boolean) => void;
  maxSeconds?: number;
}

export interface SimResult {
  arrived: boolean;
  stuckAt: Pt | null;
  frames: number;
  me: Me;
}

/** Drive the client step along waypoints; "stuck" = < 0.75 px progress for 0.4 s. */
export function simulate(L: TownLayout, waypoints: Pt[], o: SimOptions): SimResult {
  const dt = 1 / 60;
  const me: Me = { ...waypoints[0]!, loc: locationAt(L, waypoints[0]!.x, waypoints[0]!.y) };
  let wi = 1;
  let mark = { x: me.x, y: me.y, f: 0 };
  const maxFrames = 60 * (o.maxSeconds ?? 240);
  const sloppy = o.sloppy ?? 0;
  for (let f = 0; f < maxFrames; f++) {
    const wp = waypoints[wi]!;
    const last = wi === waypoints.length - 1;
    const dx = wp.x - me.x;
    const dy = wp.y - me.y;
    if (Math.hypot(dx, dy) <= (last ? 0.01 : Math.max(0.01, sloppy))) {
      if (last) {
        o.onFrame?.(me, f, false);
        return { arrived: true, stuckAt: null, frames: f, me };
      }
      wi++;
      f--;
      continue;
    }
    let vx: number;
    let vy: number;
    if (o.mode === 'pointer') {
      vx = dx;
      vy = dy;
    } else {
      vx = Math.abs(dx) > 0.01 ? Math.sign(dx) : 0;
      vy = Math.abs(dy) > 0.01 ? Math.sign(dy) : 0;
    }
    stepClient(L, me, vx, vy, dt, { nudge: o.nudge ?? 0, clampTo: last || sloppy === 0 ? wp : undefined });
    o.onFrame?.(me, f, true);
    if (Math.hypot(me.x - mark.x, me.y - mark.y) > 0.75) mark = { x: me.x, y: me.y, f };
    else if (f - mark.f > 24) return { arrived: false, stuckAt: { x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10 }, frames: f, me };
  }
  return { arrived: false, stuckAt: null, frames: maxFrames, me };
}

/** Free lattice node next to a point on the lattice-aligned tile centre (for route endpoints). */
export const BODY_W = 2 * BODY_HALF_W + 1;
