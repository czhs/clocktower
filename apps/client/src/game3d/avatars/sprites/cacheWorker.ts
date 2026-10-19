// v3.3 sprites: the sheet cache's worker (cacheClient.ts). Packing, gzip (CompressionStream) and the IndexedDB
// structured clones of a few MB per sheet cost tens of ms of main-thread time per sheet (measured: the vote-camera
// re-bake's frames went from p95 8 ms to 34 ms with the cache on the main thread); here they cost the game nothing.
// Buffers move in and out by transfer (no copies on the main thread).
import { createSheetCache, type SheetBlob } from './cache';

type Req = { id: number; op: 'get'; key: string } | { id: number; op: 'put'; key: string; blob: SheetBlob } | { id: number; op: 'clear' } | { id: number; op: 'stats' };

const cache = createSheetCache();
const post = (self as unknown as { postMessage(m: unknown, t?: Transferable[]): void }).postMessage.bind(self);

self.addEventListener('message', (ev: MessageEvent<Req>) => {
  const r = ev.data;
  const reply = (v: unknown, t: Transferable[] = []) => post({ id: r.id, v, stats: cache.stats() }, t);
  if (r.op === 'get') {
    void cache.get(r.key).then((b) => {
      // the unpacked views may share one buffer: copy each into its own so all can be transferred
      if (!b) return reply(null);
      const bufs = b.bufs.map((x) => x.slice());
      reply({ meta: b.meta, bufs }, bufs.map((x) => x.buffer as ArrayBuffer));
    });
  } else if (r.op === 'put') void cache.put(r.key, r.blob).then((ok) => reply(ok));
  else if (r.op === 'clear') void cache.clear().then(() => reply(true));
  else reply(true);
});
