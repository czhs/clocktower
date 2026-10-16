import { useEffect, useRef, useState } from 'preact/hooks';

// LEAD-OWNED. Minimal observable store + Preact hook. High-frequency data (world snapshots)
// does NOT go through stores; use RoomConnection.on('world:snapshot') instead.

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(fn: (v: T) => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(next) {
      value = typeof next === 'function' ? (next as (p: T) => T)(value) : next;
      for (const s of subs) s(value);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  const [v, setV] = useState(store.get());
  useEffect(() => {
    setV(store.get());
    return store.subscribe(setV);
  }, [store]);
  return v;
}

/**
 * Subscribe to a derived slice of a store: the component re-renders only when the selected value
 * changes according to `eq` (default Object.is). For per-frame stores (localPlayer) and views whose
 * consumers need a few fields only (e.g. `conn.gameView` -> phase). `select` may close over props:
 * the latest one is used; it runs on every store update, so keep it cheap and pure.
 */
export function useStoreSelector<T, S>(store: Store<T>, select: (v: T) => S, eq: (a: S, b: S) => boolean = Object.is): S {
  const [, bump] = useState(0);
  const ref = useRef<{ select: (v: T) => S; eq: (a: S, b: S) => boolean; value: S } | null>(null);
  const next = select(store.get());
  // keep the previous value's identity while it is "equal" (stable props / memo deps downstream)
  const value = ref.current && ref.current.eq(ref.current.value, next) ? ref.current.value : next;
  ref.current = { select, eq, value };
  useEffect(() => {
    const check = (v: T) => {
      const r = ref.current!;
      const n = r.select(v);
      if (r.eq(r.value, n)) return;
      r.value = n;
      bump((x) => x + 1);
    };
    check(store.get()); // the store may have changed between render and subscribe
    return store.subscribe(check);
  }, [store]);
  return value;
}

/** Shallow equality for small selector results (plain objects / arrays of primitives). */
export function shallowEqual<S>(a: S, b: S): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a as object);
  if (ka.length !== Object.keys(b as object).length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

export class Emitter<M extends object> {
  private subs = new Map<keyof M, Set<(p: never) => void>>();
  on<K extends keyof M>(type: K, fn: (p: M[K]) => void): () => void {
    let set = this.subs.get(type);
    if (!set) this.subs.set(type, (set = new Set()));
    set.add(fn as (p: never) => void);
    return () => set!.delete(fn as (p: never) => void);
  }
  emit<K extends keyof M>(type: K, payload: M[K]): void {
    for (const fn of this.subs.get(type) ?? []) (fn as (p: M[K]) => void)(payload);
  }
}
