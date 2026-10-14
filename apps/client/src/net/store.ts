import { useEffect, useState } from 'preact/hooks';

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
