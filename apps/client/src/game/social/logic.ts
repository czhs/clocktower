// Pure helpers for the social layer (emotes + pins): no Phaser, no DOM — unit-tested in
// apps/client/test/social.logic.test.ts.
import { MAX_PINS_PER_MEMBER, PIN_COLORS, type PinColor, type PinView } from '@ct/protocol';

// ---------------------------------------------------------------------------------------
// rate limits (mirror the server's token buckets so a spammy hand never produces error toasts)

/** Server: emotes 2/s sustained, burst 4 (apps/server/src/social EMOTE_LIMIT). */
export const EMOTE_BUCKET = { capacity: 4, refillPerSec: 2 } as const;
/** Server: pin drop / remove / clear share one bucket, 3/s sustained, burst 6 (PIN_OPS_LIMIT). */
export const PIN_BUCKET = { capacity: 6, refillPerSec: 3 } as const;

export interface Bucket {
  /** Take one token at `now` (ms); false = over the limit (nothing taken). */
  take(now: number): boolean;
  /** Would a take succeed at `now`? */
  peek(now: number): boolean;
}

/** Token bucket, slightly stricter than the server's (a 10% safety margin on refill). */
export function createBucket(o: { capacity: number; refillPerSec: number }, margin = 0.9): Bucket {
  let tokens = o.capacity;
  let last: number | null = null;
  const refill = (now: number) => {
    if (last !== null) tokens = Math.min(o.capacity, tokens + ((now - last) / 1000) * o.refillPerSec * margin);
    last = now;
  };
  return {
    take(now) {
      refill(now);
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
    peek(now) {
      refill(now);
      return tokens >= 1;
    },
  };
}

// ---------------------------------------------------------------------------------------
// pin colour (remembered per browser)

export const PIN_COLOR_KEY = 'ct.social.pinColor';

export const PIN_HEX: Record<PinColor, { fill: string; dark: string; light: string; label: string }> = {
  gold: { fill: '#e2b13c', dark: '#7a5414', light: '#ffe08a', label: 'Gold' },
  crimson: { fill: '#c8343f', dark: '#5e1018', light: '#ff7a7a', label: 'Crimson' },
  violet: { fill: '#8a5ad0', dark: '#3a1e66', light: '#c6a4ff', label: 'Violet' },
  teal: { fill: '#2fa6a0', dark: '#0e4a48', light: '#7fe6dc', label: 'Teal' },
  green: { fill: '#5aa83c', dark: '#21481a', light: '#a8e07a', label: 'Green' },
  orange: { fill: '#e57a2a', dark: '#6a2e0c', light: '#ffb070', label: 'Orange' },
  white: { fill: '#e8e4dc', dark: '#6a6660', light: '#ffffff', label: 'White' },
  black: { fill: '#2c2834', dark: '#0a080e', light: '#6a6478', label: 'Black' },
};

export function isPinColor(v: unknown): v is PinColor {
  return typeof v === 'string' && (PIN_COLORS as readonly string[]).includes(v);
}

export function loadPinColor(storage: Pick<Storage, 'getItem'> | null | undefined, fallback: PinColor = 'gold'): PinColor {
  try {
    const v = storage?.getItem(PIN_COLOR_KEY);
    return isPinColor(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function savePinColor(storage: Pick<Storage, 'setItem'> | null | undefined, c: PinColor): void {
  try {
    storage?.setItem(PIN_COLOR_KEY, c);
  } catch {
    // storage blocked: the colour just isn't remembered
  }
}

// ---------------------------------------------------------------------------------------
// crisp sizing

/**
 * World scale for a `texPx`-tall pixel-art texture so it shows about `targetCss` CSS px tall at
 * every camera zoom while each texel covers a WHOLE number of device pixels (crisp at any zoom).
 */
export function crispScale(zoom: number, dpr: number, texPx: number, targetCss: number): number {
  const z = Math.max(0.05, zoom);
  const d = Math.max(1, dpr || 1);
  const n = Math.max(1, Math.round((targetCss * d) / Math.max(1, texPx)));
  return n / (z * d);
}

/**
 * Whole canvas pixels per texel for pins at a camera zoom: 1 on phones (zoom ~1, 12 px faces stay
 * readable and pins don't dwarf the 40 px characters), 2 on desktops / inside cottages.
 */
export function pinTexels(zoom: number): number {
  return Math.max(1, Math.min(2, Math.round(zoom * 0.8)));
}

/** The 8-way direction whose unit vector is closest to (dx, dy) (screen coords, y down). */
export function nearestDir<D extends string>(dx: number, dy: number, vectors: Record<D, readonly [number, number]>): D {
  const len = Math.hypot(dx, dy) || 1;
  let best: D | null = null;
  let bestDot = -Infinity;
  for (const [d, v] of Object.entries(vectors) as [D, readonly [number, number]][]) {
    const dot = (v[0] * dx + v[1] * dy) / len;
    if (dot > bestDot) {
      bestDot = dot;
      best = d;
    }
  }
  return best!;
}

export const DIR_VECTORS = {
  right: [1, 0],
  'down-right': [Math.SQRT1_2, Math.SQRT1_2],
  down: [0, 1],
  'down-left': [-Math.SQRT1_2, Math.SQRT1_2],
  left: [-1, 0],
  'up-left': [-Math.SQRT1_2, -Math.SQRT1_2],
  up: [0, -1],
  'up-right': [Math.SQRT1_2, -Math.SQRT1_2],
} as const;

// ---------------------------------------------------------------------------------------
// layout of several pins on one person: a little fan above their head

export interface FanSlot {
  /** Offset of the pin tip from the stack anchor (world px at scale 1, multiply by the pin scale). */
  dx: number;
  dy: number;
  /** Tilt (radians), outward from the middle. */
  rot: number;
}

/** Slot `i` of `n` pins on one target, oldest first (newest on top, in the middle-right). */
export function fanSlot(i: number, n: number, pinW: number): FanSlot {
  if (n <= 1) return { dx: 0, dy: 0, rot: 0 };
  const mid = (n - 1) / 2;
  const k = i - mid;
  const spread = Math.min(0.62, 2.4 / n); // tighter spacing as the stack grows
  return { dx: k * pinW * spread, dy: Math.abs(k) * 1.5, rot: Math.max(-0.5, Math.min(0.5, k * 0.16)) };
}

/** Pins grouped by person target (oldest first) — place pins are not included. */
export function personStacks(pins: readonly PinView[]): Map<string, PinView[]> {
  const out = new Map<string, PinView[]>();
  for (const p of pins) {
    if (p.target.kind !== 'person') continue;
    const list = out.get(p.target.pid);
    if (list) list.push(p);
    else out.set(p.target.pid, [p]);
  }
  for (const l of out.values()) l.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  return out;
}

// ---------------------------------------------------------------------------------------
// optimistic local pins (shown the instant you drop one; matched to the server's copy)

export interface LocalPin {
  /** '~n' (never a server id: those are random base64url without '~'). */
  id: string;
  color: PinColor;
  target: PinView['target'];
  /** performance.now() when dropped. */
  t: number;
}

/** Does server pin `s` (by me) look like optimistic pin `l`? */
export function sameDrop(l: LocalPin, s: PinView): boolean {
  if (s.color !== l.color || s.target.kind !== l.target.kind) return false;
  if (s.target.kind === 'person' && l.target.kind === 'person') return s.target.pid === l.target.pid;
  if (s.target.kind === 'place' && l.target.kind === 'place') return Math.abs(s.target.x - l.target.x) <= 26 && Math.abs(s.target.y - l.target.y) <= 26;
  return false;
}

/**
 * Reconcile optimistic drops with a snapshot: returns the optimistic pins still waiting and a map
 * localId -> serverId for the ones the server has now (so their sprite is reused, no second drop).
 * `known` = server ids already on screen (an older pin of mine is never mistaken for a new one).
 */
export function reconcileLocal(locals: readonly LocalPin[], server: readonly PinView[], me: string | null, known: ReadonlySet<string>, now: number, ttlMs = 2500): { waiting: LocalPin[]; adopted: Map<string, string> } {
  const adopted = new Map<string, string>();
  const used = new Set<string>();
  const waiting: LocalPin[] = [];
  const fresh = server.filter((s) => s.by === me && !known.has(s.id));
  for (const l of locals) {
    const hit = fresh.find((s) => !used.has(s.id) && sameDrop(l, s));
    if (hit) {
      used.add(hit.id);
      adopted.set(l.id, hit.id);
    } else if (now - l.t < ttlMs) waiting.push(l);
  }
  return { waiting, adopted };
}

/** Ids of my pins the server will evict when I drop `adding` more (oldest first). */
export function evictedByDrop(mine: readonly { id: string; at: number }[], adding = 1, max = MAX_PINS_PER_MEMBER): string[] {
  const over = mine.length + adding - max;
  if (over <= 0) return [];
  return [...mine].sort((a, b) => a.at - b.at).slice(0, over).map((p) => p.id);
}

// ---------------------------------------------------------------------------------------
// touch: long-press detection

/** Touch long-press that opens the point / pin pie menu (v2.2: 350 -> 450 ms, fewer accidental opens). */
export const LONG_PRESS_MS = 450;
/** CSS px a finger may wander before the press counts as a drag (no tap, no long-press). */
export const PRESS_SLOP_PX = 12;

export type PressState = 'pending' | 'long' | 'cancelled';

/** Classify a press so far: still pending, became a long-press, or was cancelled by moving. */
export function pressState(downAt: number, now: number, moved: number, already: PressState = 'pending'): PressState {
  if (already !== 'pending') return already;
  if (moved > PRESS_SLOP_PX) return 'cancelled';
  return now - downAt >= LONG_PRESS_MS ? 'long' : 'pending';
}

// ---------------------------------------------------------------------------------------
// point emote geometry

/** Emote opacity over its life (quick fade in, hold, fade out over the last 600 ms). */
export function emoteAlpha(age: number, life: number): number {
  if (age < 0 || age >= life) return 0;
  if (age < 120) return age / 120;
  const tail = life - age;
  return tail < 600 ? tail / 600 : 1;
}

/** "Ada's pin", "your pin", "Ada's pin on Bram", "your pin on you". */
export function pinLabel(o: { byName: string; mine: boolean; targetName?: string | null; targetIsMe?: boolean }): string {
  const who = o.mine ? 'Your pin' : `${o.byName}’s pin`;
  if (o.targetName === undefined || o.targetName === null) return who;
  return `${who} on ${o.targetIsMe ? 'you' : o.targetName}`;
}
