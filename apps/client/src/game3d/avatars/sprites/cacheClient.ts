// v3.3 sprites: the sheet cache as the bake store uses it. A module Worker (cacheWorker.ts) owns the IndexedDB cache
// and does the packing / gzip off the main thread; the buffers are transferred both ways. No Worker (tests, an old
// browser, a CSP without worker-src 'self'): the same cache on the main thread for reads, and no writes (a write
// costs frames there; bakes still work, only the repeat-join speed-up is lost).
import { createSheetCache, type SheetBlob, type SheetCache, type SheetCacheStats } from './cache';

export function createCacheClient(): SheetCache {
  let worker: Worker | null = null;
  try {
    if (typeof Worker === 'function') worker = new Worker(new URL('./cacheWorker.ts', import.meta.url), { type: 'module', name: 'ct-sprite-cache' });
  } catch {
    worker = null;
  }
  if (!worker) {
    const local = createSheetCache();
    return { get: (k) => local.get(k), put: async () => false, clear: () => local.clear(), stats: () => ({ ...local.stats(), disabledReason: local.stats().disabledReason ?? 'no worker: read-only' }) };
  }
  const w = worker;
  let seq = 0;
  const waiting = new Map<number, (v: unknown) => void>();
  let last: SheetCacheStats = { enabled: true, hits: 0, misses: 0, puts: 0, putFails: 0, evictions: 0, bytes: 0, entries: 0, disabledReason: null };
  let broken = false;
  w.addEventListener('message', (ev: MessageEvent<{ id: number; v: unknown; stats: SheetCacheStats }>) => {
    last = ev.data.stats;
    const f = waiting.get(ev.data.id);
    waiting.delete(ev.data.id);
    f?.(ev.data.v);
  });
  w.addEventListener('error', () => {
    broken = true;
    last = { ...last, enabled: false, disabledReason: 'worker error' };
    for (const f of waiting.values()) f(null);
    waiting.clear();
  });
  const call = <T>(msg: Record<string, unknown>, transfer: Transferable[] = [], dflt: T): Promise<T> => {
    if (broken) return Promise.resolve(dflt);
    return new Promise<T>((resolve) => {
      const id = ++seq;
      waiting.set(id, (v) => resolve((v ?? dflt) as T));
      try {
        w.postMessage({ ...msg, id }, transfer);
      } catch {
        waiting.delete(id);
        resolve(dflt);
      }
    });
  };
  return {
    get: (key) => call<SheetBlob | null>({ op: 'get', key }, [], null),
    put: (key, blob) => call<boolean>({ op: 'put', key, blob }, blob.bufs.map((b) => b.buffer as ArrayBuffer).filter((b, i, a) => a.indexOf(b) === i), false),
    clear: () => call<boolean>({ op: 'clear' }, [], false).then(() => undefined),
    stats: () => last,
  };
}
