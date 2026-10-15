// CMU easter eggs — pure, deterministic behaviour data (cmu-eggs). No Phaser, no DOM, no layout
// VALUE imports (../layout.ts imports ./index.ts while it is initialising): everything that needs the
// map takes the TownLayout as an argument.
//
// Privacy contract (docs/world-audit.md, "Ambient life"): every function here depends only on
// public map data, the wall clock and the PUBLIC phase. Nothing reads entity positions, the
// Storyteller, visits or game state. Everyone therefore sees (roughly) the same thing, and nothing
// can leak night information or give an advantage.
import { isBlockedTile, type TilePoint, type TownLayout } from '@ct/protocol';

const TS = 16;

// -------------------------------------------------------------------------------------------
// Time of day

/** Public phases in which the village is "dark" (night-only eggs show, day animals sleep). */
export const EGG_DARK_PHASES: ReadonlySet<string> = new Set(['bedtime', 'first_night', 'night', 'dawn']);
/** Phases with no in-game time of day: fall back to the local wall clock. */
const CLOCK_PHASES: ReadonlySet<string> = new Set(['waiting', 'setup', 'finished']);

/** Is it night for the eggs? Public phase, or (outside a game day/night) the wall clock 21:00–05:59. */
export function eggDark(phase: string, localHour: number): boolean {
  if (EGG_DARK_PHASES.has(phase)) return true;
  if (CLOCK_PHASES.has(phase)) return localHour >= 21 || localHour < 6;
  return false;
}

/** Deterministic integer hash -> [0, 1). */
export function eggHash(a: number, b = 0): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// -------------------------------------------------------------------------------------------
// The Fence: repainted every night. The "paint stamp" is the 10-minute wall-clock bucket of the
// most recent public transition into dawn (all clients see that transition at the same moment),
// or the calendar day when no night has been seen in this session.

export const FENCE_VARIANTS = 4;
export const fenceStampForDawn = (nowMs: number) => Math.floor(nowMs / 600_000);
export const fenceStampForDay = (nowMs: number) => 1_000_000 + Math.floor((nowMs - new Date(nowMs).getTimezoneOffset() * 60_000) / 86_400_000);
export function fencePaint(stamp: number, nMessages: number): { variant: number; message: number; layer: number } {
  return {
    variant: Math.floor(eggHash(stamp, 7) * FENCE_VARIANTS),
    message: Math.floor(eggHash(stamp, 11) * nMessages),
    // "layer N of paint": grows over time, never repeats a small number
    layer: 4000 + (stamp % 100_000),
  };
}

// -------------------------------------------------------------------------------------------
// Hotspots: press E near one to examine it. Pixel coordinates of the spot the player stands at
// (feet), radius in px, and the location it belongs to.

export interface EggHotspot {
  id: EggId;
  x: number;
  y: number;
  r: number;
  location: 'outdoors' | `bld:${string}`;
}

export type EggId = 'fence' | 'lift' | 'workshop' | 'engine' | 'shelf' | 'notice' | 'crypt';

export const EGG_HOTSPOTS: readonly EggHotspot[] = [
  { id: 'fence', x: 60 * TS, y: 36 * TS + 10, r: 30, location: 'outdoors' },
  { id: 'lift', x: 77 * TS + 24, y: 12 * TS + 14, r: 18, location: 'outdoors' },
  { id: 'workshop', x: 81 * TS + 24, y: 12 * TS + 14, r: 18, location: 'outdoors' },
  { id: 'engine', x: 80 * TS + 8, y: 10 * TS + 14, r: 14, location: 'outdoors' },
  { id: 'crypt', x: 71 * TS, y: 14 * TS + 14, r: 20, location: 'outdoors' },
  { id: 'notice', x: 37 * TS, y: 29 * TS + 10, r: 22, location: 'outdoors' },
  // Mortimer's Curios: the left shop shelf
  { id: 'shelf', x: 145 * TS + 24, y: 36 * TS + 14, r: 22, location: 'bld:shop' },
];

// -------------------------------------------------------------------------------------------
// Routes for wandering creatures: BFS on the collision grid between hand-picked waypoints,
// avoiding door steps (never loiter in a doorway). Pure and deterministic.

export interface Route {
  pts: { x: number; y: number }[];
  cum: number[];
  total: number;
}

/** Tiles a wanderer must not step on: every door/interior-door tile and its 8 neighbours. */
export function doorAvoidSet(layout: TownLayout): Set<string> {
  const s = new Set<string>();
  for (const b of layout.buildings)
    for (const d of [b.door, b.interiorDoor]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s.add(`${d.x + dx},${d.y + dy}`);
  return s;
}

function bfs(layout: TownLayout, a: TilePoint, b: TilePoint, avoid: Set<string>): TilePoint[] {
  const key = (p: TilePoint) => `${p.x},${p.y}`;
  const prev = new Map<string, string | null>([[key(a), null]]);
  const q: TilePoint[] = [a];
  while (q.length) {
    const p = q.shift()!;
    if (p.x === b.x && p.y === b.y) break;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n = { x: p.x + dx, y: p.y + dy };
      const k = key(n);
      if (prev.has(k) || isBlockedTile(layout, n.x, n.y) || avoid.has(k)) continue;
      prev.set(k, key(p));
      q.push(n);
    }
  }
  if (!prev.has(key(b))) throw new Error(`egg route: no path ${key(a)} -> ${key(b)}`);
  const out: TilePoint[] = [];
  for (let k: string | null = key(b); k; k = prev.get(k) ?? null) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    out.push({ x, y });
  }
  return out.reverse();
}

/** Closed loop through the waypoints (tile centres, feet at the lower middle of the tile). */
export function planLoop(layout: TownLayout, waypoints: TilePoint[], avoid = doorAvoidSet(layout)): Route {
  const tiles: TilePoint[] = [];
  for (let i = 0; i < waypoints.length; i++) {
    const seg = bfs(layout, waypoints[i]!, waypoints[(i + 1) % waypoints.length]!, avoid);
    tiles.push(...(i === 0 ? seg : seg.slice(1)));
  }
  // drop collinear interior points
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < tiles.length; i++) {
    const p = tiles[i]!;
    const a = tiles[i - 1];
    const c = tiles[i + 1];
    if (a && c && (a.x === p.x && p.x === c.x || a.y === p.y && p.y === c.y)) continue;
    pts.push({ x: p.x * TS + 8, y: p.y * TS + 12 });
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  return { pts, cum, total: cum[cum.length - 1]! };
}

export interface Pose {
  x: number;
  y: number;
  /** horizontal facing (sprites face right; flip for left) */
  left: boolean;
  moving: boolean;
}

/**
 * Position at wall-clock time t (s): walks `walk` s, rests `rest` s, repeat; distance advances
 * only while walking; the closed route repeats.
 */
export function poseAt(route: Route, t: number, speed: number, walk: number, rest: number, phase = 0): Pose {
  const cyc = walk + rest;
  const tt = t + phase;
  const n = Math.floor(tt / cyc);
  const inCyc = tt - n * cyc;
  const moving = inCyc < walk;
  const dist = (n * walk + Math.min(inCyc, walk)) * speed;
  const L = route.total;
  const d = dist - Math.floor(dist / L) * L;
  let i = 1;
  while (i < route.cum.length - 1 && route.cum[i]! < d) i++;
  const a = route.pts[i - 1]!;
  const b = route.pts[i]!;
  const seg = route.cum[i]! - route.cum[i - 1]! || 1;
  const k = (d - route.cum[i - 1]!) / seg;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, left: b.x < a.x, moving };
}

// -------------------------------------------------------------------------------------------
// The creatures (course mascots + Scotty). Waypoints are tiles; see docs/easter-eggs.md.

export interface WandererDef {
  id: 'scotty' | 'honk' | 'cows' | 'theo';
  frames: { walk: string[]; rest: string };
  waypoints: TilePoint[];
  speed: number;
  walk: number;
  rest: number;
  /** extra copies drawn at these px offsets doing exactly the same thing ("parallel") */
  copies?: { dx: number; dy: number }[];
}

export const WANDERERS: readonly WandererDef[] = [
  {
    // Scotty the terrier (tartan coat) keeps an eye on the Fence and sits now and then; never in
    // the square (that is where the town talks) and asleep by bedtime
    id: 'scotty',
    frames: { walk: ['egg_scotty_0', 'egg_scotty_1'], rest: 'egg_scotty_2' },
    waypoints: [
      { x: 56, y: 34 },
      { x: 63, y: 33 },
      { x: 64, y: 38 },
      { x: 57, y: 38 },
    ],
    speed: 26,
    walk: 9,
    rest: 6,
  },
  {
    // Honk (15-122): a grey goose patrolling the walled garden
    id: 'honk',
    frames: { walk: ['egg_honk_0', 'egg_honk_1'], rest: 'egg_honk_2' },
    waypoints: [
      { x: 10, y: 14 },
      { x: 17, y: 14 },
      { x: 22, y: 11 },
      { x: 30, y: 14 },
      { x: 30, y: 19 },
      { x: 22, y: 19 },
      { x: 14, y: 19 },
    ],
    speed: 15,
    walk: 7,
    rest: 5,
  },
  {
    // Clarabelle the Parallel Cow (15-210): two identical cows grazing in perfect lock-step
    id: 'cows',
    frames: { walk: ['egg_cow_0'], rest: 'egg_cow_1' },
    waypoints: [
      { x: 90, y: 13 },
      { x: 91, y: 22 },
      { x: 90, y: 30 },
    ],
    speed: 5,
    walk: 6,
    rest: 11,
    copies: [{ dx: 22, dy: 10 }],
  },
  {
    // Theo Rem (15-151 / 21-127): a hedgehog who only comes out after dark, around the well yard;
    // whenever it stops, a tiny end-of-proof tombstone (∎) appears over it
    id: 'theo',
    frames: { walk: ['egg_theo_0', 'egg_theo_1'], rest: 'egg_theo_0' },
    waypoints: [
      { x: 38, y: 25 },
      { x: 43, y: 26 },
      { x: 42, y: 29 },
      { x: 38, y: 29 },
    ],
    speed: 10,
    walk: 6,
    rest: 4,
  },
];

/** Wanderers that only come out after dark (all others sleep then). */
export const NIGHT_WANDERERS: ReadonlySet<string> = new Set(['theo']);

/**
 * Opal the Optimizing Otter (15-411): floats on her back down the river and back, in straight
 * segments (the shortest path, naturally), out of sight under the bridges. Path from the map's water.
 */
export function riverPath(ground: readonly string[], x0 = 78, x1 = 92, y0 = 12, y1 = 88): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y += 6) {
    let sum = 0;
    let n = 0;
    for (let x = x0; x <= x1; x++)
      if (ground[y]?.[x] === '~' || ground[y]?.[x] === 'b') {
        sum += x;
        n++;
      }
    if (n) pts.push({ x: (sum / n) * TS + 8, y: y * TS + 8 });
  }
  return pts;
}
export const OPAL = { speed: 9 };
export function opalAt(path: { x: number; y: number }[], t: number): Pose {
  const seg: number[] = [0];
  for (let i = 1; i < path.length; i++) seg.push(seg[i - 1]! + Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y));
  const L = seg[seg.length - 1]!;
  const d0 = (t * OPAL.speed) % (2 * L);
  const back = d0 > L;
  const d = back ? 2 * L - d0 : d0;
  let i = 1;
  while (i < seg.length - 1 && seg[i]! < d) i++;
  const a = path[i - 1]!;
  const b = path[i]!;
  const k = (d - seg[i - 1]!) / (seg[i]! - seg[i - 1]! || 1);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, left: back, moving: true };
}

/** Cilantro (15-251): a giraffe in a blue hoodie and green scarf, waiting just outside the south gate. */
export const CILANTRO = { x: 57 * TS + 8, y: 92 * TS + 15 };
/** Mincut and Maxflow (15-451): a fox and a red panda watching the river's flow below the main bridge. */
export const MINCUT_MAXFLOW = { fox: { x: 81 * TS + 2, y: 54 * TS + 15 }, panda: { x: 80 * TS + 2, y: 55 * TS + 14 } };
/** Greenting pops out of the town well for 5 s every 3 minutes (rare, so it never steals a conversation). */
export const GREENTING = { x: 40 * TS, y: 26 * TS + 6, period: 181, show: 5 };
export function greentingRise(t: number): number {
  const f = t % GREENTING.period;
  if (f >= GREENTING.show) return 0;
  return Math.min(1, f / 0.6, (GREENTING.show - f) / 0.6);
}

/** Requin (15-213): a fin circling the millpond. Ellipse in px, angular speed rad/s. */
export const REQUIN = { cx: 16 * TS + 8, cy: 78 * TS + 10, rx: 4.2 * TS, ry: 2.2 * TS, w: 0.22 };
export function requinAt(t: number): Pose {
  const a = t * REQUIN.w;
  const wob = Math.sin(t * 0.37) * 0.12;
  return { x: REQUIN.cx + Math.cos(a) * REQUIN.rx * (1 + wob), y: REQUIN.cy + Math.sin(a) * REQUIN.ry, left: Math.sin(a) > 0, moving: true };
}

/** Now and then Requin surfaces and grins: 4 s every ~5 minutes, where the fin is. */
export const REQUIN_GRIN = { period: 293, show: 4 };
export const requinGrinning = (t: number) => t % REQUIN_GRIN.period < REQUIN_GRIN.show;

/** Where the sparks fly: the Workshop's dark upper-right window, px from the sprite's top-left. */
export const WORKSHOP_SPARK = { dx: 38, dy: 56 };

/** Sparks from the Workshop's broken instrument: a burst every few seconds (hash of the second). */
export function sparkBurst(t: number): { on: boolean; age: number; seed: number } {
  const s = Math.floor(t / 3);
  const on = eggHash(s, 77) < 0.45;
  return { on, age: (t - s * 3) / 0.6, seed: s };
}

/**
 * Progress and Preservation (15-312): two frogs hop around the pond shore. The green one always
 * takes the next step (progress); the blue one follows exactly two hops behind, so their spacing
 * never changes (preservation).
 */
export const FROGS = { cx: 16 * TS + 8, cy: 78 * TS + 8, rx: 7.3 * TS, ry: 4.9 * TS, stops: 28, hop: 3.2 };
export function frogAt(t: number, lag: number): Pose & { hopping: boolean } {
  const step = Math.floor(t / FROGS.hop) - lag;
  const f = t / FROGS.hop - Math.floor(t / FROGS.hop);
  const hopping = f < 0.18;
  const pos = (s: number) => {
    // only the north and west shore (the south shore is reeds); stops wrap around an arc
    const span = FROGS.stops;
    const k = ((s % (2 * span)) + 2 * span) % (2 * span);
    const i = k < span ? k : 2 * span - k; // ping-pong along the arc
    const ang = Math.PI * (0.95 + (i / span) * 0.9); // from west, over the north shore, to east
    return { x: FROGS.cx + Math.cos(ang) * FROGS.rx, y: FROGS.cy + Math.sin(ang) * FROGS.ry };
  };
  const a = pos(step - 1);
  const b = pos(step);
  const k = hopping ? f / 0.18 : 1;
  const lift = hopping ? Math.sin(k * Math.PI) * 4 : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - lift, left: b.x < a.x, moving: hopping, hopping };
}

/** Polly the Polymorphic Parrot (15-150): perches on lamp tops, flies between them, and changes plumage. */
export const POLLY = {
  perches: [
    { x: 72 * TS + 8, y: 33 * TS - 46 },
    { x: 56 * TS + 8, y: 33 * TS - 46 },
    { x: 88 * TS + 8, y: 47 * TS - 46 },
  ],
  stay: 140,
  fly: 7,
  variants: 3,
  /** a new plumage every this many seconds (and after every flight) */
  morph: 23,
};
export function pollyAt(t: number): Pose & { variant: number; flying: boolean } {
  const cyc = POLLY.stay + POLLY.fly;
  const n = Math.floor(t / cyc);
  const f = t - n * cyc;
  const P = POLLY.perches;
  const from = P[n % P.length]!;
  const to = P[(n + 1) % P.length]!;
  const variant = Math.floor(eggHash(n, Math.floor(f / POLLY.morph)) * POLLY.variants);
  if (f < POLLY.stay) return { x: from.x, y: from.y, left: to.x < from.x, moving: false, flying: false, variant };
  const k = (f - POLLY.stay) / POLLY.fly;
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 40, left: to.x < from.x, moving: true, flying: true, variant };
}

/** Chonk (15-122's human-sized goose): shows up by the south wall for 40 s every ~18.5 minutes. */
export const CHONK = { x: 44 * TS + 8, y: 88 * TS + 14, period: 1111, show: 40 };
export const chonkVisible = (t: number) => t % CHONK.period < CHONK.show;

/** Office-hours queue of ghosts at the crypt door (night only): feet positions, facing. */
export const GHOST_QUEUE: readonly { x: number; y: number; facing: 'up' | 'right' }[] = [
  { x: 71 * TS, y: 14 * TS + 12, facing: 'up' },
  { x: 69 * TS + 12, y: 15 * TS + 13, facing: 'right' },
  { x: 68 * TS + 8, y: 15 * TS + 14, facing: 'right' },
  { x: 67 * TS + 4, y: 15 * TS + 13, facing: 'right' },
  { x: 66 * TS, y: 15 * TS + 14, facing: 'right' },
  { x: 64 * TS + 12, y: 15 * TS + 13, facing: 'right' },
  { x: 63 * TS + 6, y: 15 * TS + 14, facing: 'right' },
];

/** Randy Pausch bridge (the south-lane footbridge): lantern posts along both rails, px. */
export function bridgeLanterns(layout: TownLayout, ground: readonly string[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const row = 66;
  let x0 = -1;
  let x1 = -1;
  for (let x = 0; x < layout.townBounds.w; x++)
    if (ground[row]?.[x] === 'b') {
      if (x0 < 0) x0 = x;
      x1 = x;
    }
  if (x0 < 0) return out;
  for (let px = x0 * TS + 2; px <= (x1 + 1) * TS - 2; px += 7) {
    out.push({ x: px, y: row * TS + 1 });
    out.push({ x: px, y: (row + 2) * TS - 1 });
  }
  return out;
}

/** Walking to the sky: the tip of the pole (px) where, at night, a little wisp walks off. */
export const SKY_TIP = { x: 25 * TS + 40, y: 15 * TS - 112 + 8 };
