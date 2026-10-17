import { townMap } from '@ct/assets';
import { currentLayout } from '../../net/layout'; // (v3) the lobby's layout
import type { LocationId } from '@ct/protocol';
import type { LoopId } from './catalog';

// Static acoustic map of the town, derived ONLY from the shipped map data (ground codes, props,
// buildings). Ambience is computed from this + the local player's own position/location + the
// PUBLIC phase. Nothing here may ever depend on other entities, the Storyteller or private game
// data (night-leak rule, docs/world-audit.md §4).

const TS = townMap.tileSize;
const W = townMap.width;
const H = townMap.height;

export type Surface = 'cobble' | 'grass' | 'wood' | 'gravel';

const SURFACE: Record<string, Surface> = {
  '=': 'cobble', // cobble road
  o: 'cobble', // plaza
  O: 'cobble', // plaza ring
  F: 'cobble', // stone floor
  f: 'wood', // wooden floor
  b: 'wood', // bridge / jetty
  g: 'gravel',
  s: 'gravel', // sand
  '.': 'grass',
  ',': 'grass', // forest floor
  '#': 'grass', // soil
  ':': 'grass', // dirt lane (soft)
};

/** Ground code under a pixel position (feet). */
export function groundAt(x: number, y: number): string {
  const tx = Math.floor(x / TS);
  const ty = Math.floor((y - 1) / TS);
  return townMap.ground[ty]?.[tx] ?? ' ';
}

/** Footstep surface under a pixel position. */
export function surfaceAt(x: number, y: number): Surface {
  return SURFACE[groundAt(x, y)] ?? 'cobble';
}

// --- distance fields (tiles) ---------------------------------------------------------------

function field(isSource: (tx: number, ty: number) => boolean): Float32Array {
  const d = new Float32Array(W * H).fill(1e6);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isSource(x, y)) d[y * W + x] = 0;
  const D = Math.SQRT2;
  const relax = (i: number, j: number, c: number) => {
    if (d[j]! + c < d[i]!) d[i] = d[j]! + c;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) {
        relax(i, i - W, 1);
        if (x > 0) relax(i, i - W - 1, D);
        if (x < W - 1) relax(i, i - W + 1, D);
      }
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (x < W - 1) relax(i, i + 1, 1);
      if (y < H - 1) {
        relax(i, i + W, 1);
        if (x < W - 1) relax(i, i + W + 1, D);
        if (x > 0) relax(i, i + W - 1, D);
      }
    }
  return d;
}

const ground = (tx: number, ty: number) => townMap.ground[ty]?.[tx] ?? ' ';
const inTown = (tx: number, ty: number) => {
  const tb = currentLayout().townBounds;
  return tx >= tb.x && ty >= tb.y && tx < tb.x + tb.w && ty < tb.y + tb.h;
};

interface Fields {
  water: Float32Array;
  grave: Float32Array;
  forest: Float32Array;
  square: Float32Array;
}
let fields: Fields | null = null;
function F(): Fields {
  if (fields) return fields;
  const graves = new Set(townMap.objects.filter((o) => /^grave[0-9]$/.test(o.kind)).map((o) => o.y * W + o.x));
  fields = {
    water: field((x, y) => inTown(x, y) && ground(x, y) === '~'),
    grave: field((x, y) => graves.has(y * W + x)),
    forest: field((x, y) => inTown(x, y) && (ground(x, y) === ',' || ground(x, y) === 'T')),
    square: field((x, y) => inTown(x, y) && (ground(x, y) === 'o' || ground(x, y) === 'O')),
  };
  return fields;
}

function at(f: Float32Array, x: number, y: number): number {
  const tx = Math.max(0, Math.min(W - 1, Math.floor(x / TS)));
  const ty = Math.max(0, Math.min(H - 1, Math.floor((y - 1) / TS)));
  return f[ty * W + tx]!;
}

const fountains = townMap.objects.filter((o) => o.kind === 'fountain').map((o) => ({ x: (o.x + 1.5) * TS, y: (o.y + 0.5) * TS }));
const tavernDoor = () => {
  const tavern = currentLayout().buildings.find((b) => b.kind === 'tavern');
  return tavern ? { x: (tavern.door.x + 0.5) * TS, y: (tavern.door.y + 0.5) * TS } : null;
};

function distPts(pts: { x: number; y: number }[], x: number, y: number): number {
  let best = Infinity;
  for (const p of pts) best = Math.min(best, Math.hypot(p.x - x, p.y - y) / TS);
  return best;
}

/** 1 inside r0 tiles, 0 beyond r1, smooth in between. */
export function near(d: number, r0: number, r1: number): number {
  if (d <= r0) return 1;
  if (d >= r1) return 0;
  const t = (d - r0) / (r1 - r0);
  return (1 - t) * (1 - t);
}

/** Public phase → how much day / night life is audible. */
export function phaseMix(phase: string): { day: number; night: number } {
  switch (phase) {
    case 'first_night':
    case 'night':
      return { day: 0, night: 1 };
    case 'bedtime':
      return { day: 0.45, night: 0.55 };
    case 'dawn':
      return { day: 0.4, night: 0.6 };
    default: // waiting, setup, day, finished
      return { day: 1, night: 0 };
  }
}

export interface LoopMix {
  level: number;
  lowpass?: number;
  /** Close enough that the loop should be fetched/kept even if silent. */
  warm?: boolean;
}
export type AmbientMix = Record<LoopId, LoopMix>;

/** Owl calls per minute at this spot (0 = none), and how muffled (Hz) they are. */
export interface CallMix {
  owlsPerMin: number;
  lowpass?: number;
}

const silent = (): AmbientMix => ({
  wind: { level: 0 },
  crows: { level: 0 },
  fountain: { level: 0 },
  tavern: { level: 0 },
  river: { level: 0 },
  crickets: { level: 0 },
});

/**
 * Ambient loop levels for a listener at (x, y) in `location` during public `phase`.
 * Pure function of its arguments and the static map.
 */
export function ambientMix(location: LocationId, x: number, y: number, phase: string): { loops: AmbientMix; calls: CallMix } {
  const { day, night } = phaseMix(phase);
  const m = silent();
  if (location !== 'outdoors') {
    const id = location.slice(4);
    const b = currentLayout().buildings.find((bb) => bb.id === id);
    const kind = b?.kind ?? 'house';
    if (kind === 'tavern') {
      m.tavern = { level: 0.85 * day + 0.1, lowpass: 9000 };
      m.wind = { level: 0.12, lowpass: 500 };
      m.crickets = { level: 0.2 * night, lowpass: 2600 };
    } else if (kind === 'chapel' || kind === 'clocktower') {
      m.wind = { level: 0.3, lowpass: 420 };
      m.crickets = { level: 0.15 * night, lowpass: 2600 };
    } else {
      // homes and the shop: the town outside, through the walls
      m.wind = { level: 0.22, lowpass: 650 };
      m.crickets = { level: 0.4 * night, lowpass: 3200 };
      m.crows = { level: 0.08 * day, lowpass: 1500 };
    }
    return { loops: m, calls: { owlsPerMin: 1.2 * night, lowpass: 1400 } };
  }
  const f = F();
  const water = at(f.water, x, y);
  const grave = at(f.grave, x, y);
  const forest = at(f.forest, x, y);
  const square = at(f.square, x, y);
  const fountain = distPts(fountains, x, y);
  const td = tavernDoor();
  const door = td ? Math.hypot(td.x - x, td.y - y) / TS : Infinity;
  const inSquare = near(square, 0, 4);
  const woods = near(forest, 1, 8);

  m.wind = { level: Math.min(1, 0.5 + 0.35 * woods + 0.2 * near(grave, 2, 10) - 0.15 * inSquare) };
  const crows = Math.max(near(grave, 3, 16), 0.4 * near(forest, 1, 6));
  m.crows = { level: crows * day, warm: grave < 20 && day > 0 };
  m.fountain = { level: near(fountain, 1.5, 11), warm: fountain < 15 };
  m.river = { level: 0.9 * near(water, 1, 13), warm: water < 17 };
  // The tavern is only heard through its door, muffled, while the town is awake.
  m.tavern = { level: 0.45 * near(door, 1, 8) * day, lowpass: 900, warm: door < 11 && day > 0 };
  m.crickets = { level: night * (0.85 - 0.35 * inSquare) };
  const owls = night * (0.8 + 1.2 * Math.max(woods, near(grave, 2, 14)));
  return { loops: m, calls: { owlsPerMin: owls } };
}
