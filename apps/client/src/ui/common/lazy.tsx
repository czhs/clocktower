// LEAD-OWNED. Code-split components without preact/compat: `lazyComponent(() => import('./X').then(m => m.X))`
// renders the component once its chunk has loaded (a fallback meanwhile / on failure) and exposes
// `preload()` for prefetching (on idle, or as soon as a route is known). A failed load (offline, or a
// chunk replaced by a deploy) is retried on the next mount / preload. With `reloadOnFail`, a failure
// while the browser is online (most likely a tab older than the last two deploys, whose hashed chunks
// are gone) reloads the page once to pick up the new build (`reloadForUpdate`).
import { h, type ComponentType, type VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export interface LazyComponent<P> {
  (props: P): VNode | null;
  /** Start loading the chunk (idempotent); never rejects. */
  preload(): Promise<void>;
}

const RELOAD_KEY = 'ct.chunkReloadAt';

/**
 * Reload the page to pick up a new build after a lazy chunk failed to load, at most once a minute
 * (so a genuinely broken chunk or a flaky network can't loop). Returns false when it did not reload
 * (offline, or already tried recently): the caller then shows its "Reload" fallback instead.
 */
export function reloadForUpdate(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false; // no storage: can't guard against a loop, so don't auto-reload
  }
  location.reload();
  return true;
}

export function lazyComponent<P extends object>(
  load: () => Promise<ComponentType<P>>,
  fallback: (failed: boolean) => VNode | null = () => null,
  opts: { reloadOnFail?: boolean } = {},
): LazyComponent<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const get = () =>
    (pending ??= load().then(
      (c) => (loaded = c),
      (e: unknown) => {
        pending = null; // retry next time
        throw e;
      },
    ));

  function Lazy(props: P): VNode | null {
    // (functional updates: a component is a function, so store it via `() => c`)
    const [C, setC] = useState<ComponentType<P> | null>(() => loaded);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (C) return;
      let alive = true;
      get().then(
        (c) => alive && setC(() => c),
        () => {
          if (!alive) return;
          if (opts.reloadOnFail && reloadForUpdate()) return; // keeps showing the loading fallback
          setFailed(true);
        },
      );
      return () => {
        alive = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return C ? (h(C, props) as VNode) : fallback(failed);
  }
  Lazy.preload = (): Promise<void> =>
    get().then(
      () => undefined,
      () => undefined,
    );
  return Lazy;
}

/** Run `fn` when the main thread is idle (after first paint), with a fallback timer for Safari. */
export function whenIdle(fn: () => void, timeoutMs = 2500): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: timeoutMs });
    return () => w.cancelIdleCallback!(id);
  }
  const t = setTimeout(fn, Math.min(timeoutMs, 1200));
  return () => clearTimeout(t);
}
