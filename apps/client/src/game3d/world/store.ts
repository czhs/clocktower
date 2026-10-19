// v3 WP3 (v3-stage). The facade `store` / `events` / `input` that vendor/time.ts hands to pixel3d's
// createTime (src/demo/time.js) in place of the demo's (docs/v3/INTEGRATION.md §3.1 "Time facade"). Pure.
//
// The demo store's shape: `state` (a frozen snapshot, replaced on change), `set(patch, source)` emitting
// `<key>` ({value, prev, state, source}) per changed key and then 'change', `on(key, fn) -> unsubscribe`,
// `setSeat`. Here `phase`, `nominee` and `seats` are FROZEN: createTime applies them to the dais once at
// creation and would re-apply them (and run its own vote sweep) on every change, while the game drives the
// dais directly (world/dais.ts). Patches to frozen keys are dropped. The clock never runs by itself
// (`paused`, `timeSpeed` 0): the game writes `timeOfDay` with source 'game' (a jump; no auto-bell).

export const SEAT_COUNT = 15;
export const FROZEN_KEYS = ['phase', 'nominee', 'seats'] as const;

export interface FacadeSeat {
  occupied: boolean;
  dead: boolean;
  ghostVote: boolean;
  nominated: boolean;
  onBlock: boolean;
}
export interface FacadeState {
  timeOfDay: number;
  timeSpeed: number;
  paused: boolean;
  phase: 'day';
  nominee: null;
  seats: readonly FacadeSeat[];
  life: boolean;
  quality: 'high' | 'low';
  camera: 'follow';
}
export interface StoreEvent<K extends keyof FacadeState = keyof FacadeState> {
  value: FacadeState[K];
  prev: FacadeState[K];
  state: FacadeState;
  source: string | null;
}
export interface ChangeEvent {
  keys: (keyof FacadeState)[];
  state: FacadeState;
  prev: FacadeState;
  source: string | null;
}
export interface FacadeStore {
  readonly state: FacadeState;
  get<K extends keyof FacadeState>(key: K): FacadeState[K];
  set(patch: Partial<Record<keyof FacadeState, unknown>>, source?: string | null): boolean;
  setSeat(i: number, patch: unknown, source?: string | null): boolean;
  on(key: keyof FacadeState | 'change', fn: (e: never) => void): () => void;
  off(key: keyof FacadeState | 'change', fn: (e: never) => void): void;
  /** Number of dropped writes to frozen keys (tests / debug). */
  readonly dropped: number;
}

export interface FacadeEvents {
  on(name: string, fn: (payload: unknown) => void): () => void;
  off(name: string, fn: (payload: unknown) => void): void;
  emit(name: string, payload?: unknown): void;
}

/** Tiny emitter; a throwing listener is reported and does not stop the others. */
export function createFacadeEvents(): FacadeEvents {
  const map = new Map<string, Set<(payload: unknown) => void>>();
  const api: FacadeEvents = {
    on(name, fn) {
      let s = map.get(name);
      if (!s) map.set(name, (s = new Set()));
      s.add(fn);
      return () => api.off(name, fn);
    },
    off(name, fn) {
      map.get(name)?.delete(fn);
    },
    emit(name, payload) {
      for (const fn of [...(map.get(name) ?? [])]) {
        try {
          fn(payload);
        } catch (e) {
          console.error(`[town3d] time event '${name}' listener failed:`, e);
        }
      }
    },
  };
  return api;
}

const blankSeat = (): FacadeSeat => ({ occupied: false, dead: false, ghostVote: false, nominated: false, onBlock: false });
const wrap = (h: number) => ((h % 24) + 24) % 24;

function freeze(s: FacadeState): FacadeState {
  return Object.freeze({ ...s, seats: Object.freeze(s.seats.map((x) => Object.freeze({ ...x }))) });
}

export function createFacadeStore(initial: { timeOfDay: number; quality: 'high' | 'low' }): FacadeStore {
  const ev = createFacadeEvents();
  let dropped = 0;
  let state = freeze({
    timeOfDay: wrap(Number(initial.timeOfDay) || 0),
    timeSpeed: 0,
    paused: true,
    phase: 'day',
    nominee: null,
    seats: Array.from({ length: SEAT_COUNT }, blankSeat),
    life: true,
    quality: initial.quality,
    camera: 'follow',
  });
  const validate = (k: keyof FacadeState, v: unknown, old: unknown): unknown => {
    switch (k) {
      case 'timeOfDay': {
        const h = Number(v);
        return Number.isFinite(h) ? wrap(h) : old;
      }
      case 'timeSpeed': {
        const s = Number(v);
        return Number.isFinite(s) ? Math.max(0, Math.min(3600, s)) : old;
      }
      case 'paused':
      case 'life':
        return !!v;
      case 'quality':
        return v === 'low' || v === 'high' ? v : old;
      case 'camera':
        return 'follow';
      default:
        return old;
    }
  };
  const store: FacadeStore = {
    get state() {
      return state;
    },
    get dropped() {
      return dropped;
    },
    get(key) {
      return state[key];
    },
    set(patch, source = null) {
      const prev = state;
      const next: Record<string, unknown> = { ...state };
      const keys: (keyof FacadeState)[] = [];
      for (const [k, v] of Object.entries(patch ?? {})) {
        const key = k as keyof FacadeState;
        if ((FROZEN_KEYS as readonly string[]).includes(k)) {
          dropped++;
          continue;
        }
        if (!(k in state)) continue;
        const val = validate(key, v, state[key]);
        if (val === state[key]) continue;
        next[k] = val;
        keys.push(key);
      }
      if (!keys.length) return false;
      state = freeze(next as unknown as FacadeState);
      for (const k of keys) ev.emit(k, { value: state[k], prev: prev[k], state, source } satisfies StoreEvent);
      ev.emit('change', { keys, state, prev, source } satisfies ChangeEvent);
      return true;
    },
    setSeat() {
      dropped++;
      return false;
    },
    on(key, fn) {
      return ev.on(key, fn as (p: unknown) => void);
    },
    off(key, fn) {
      ev.off(key, fn as (p: unknown) => void);
    },
  };
  return store;
}

/** The facade `input`: no global keys (createTime binds B/T/./,/N/V/P/L in the demo). */
export const NO_INPUT = Object.freeze({ bind: () => () => undefined });
