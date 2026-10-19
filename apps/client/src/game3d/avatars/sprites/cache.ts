// v3.3 sprites: a browser IndexedDB cache for baked character sprite sheets. The runtime baker (bake.ts) renders
// every figure's atlas at the exact low-res texel size and camera pitch of the moment; that costs real GPU time on a
// cold boot and on every vote camera re-bake (docs/perf-v3/sprites.md). The pixels only depend on the bake key
// (spec, texel, pitch, bake version), so a sheet read back once can be stored and reused across reloads.
//
// Three layers, all in this module (no three.js here; unit-tested: apps/client/test/game3d/avatars.sprites.cache.test.ts):
//
//   packBlob / unpackBlob   a small binary container (meta JSON + typed buffers, 4-byte aligned) so a sheet becomes
//                           ONE ArrayBuffer (one IDB value, one structured clone, one gzip pass)
//   planEviction            pure LRU planning over the in-memory index (key -> stored bytes, last use)
//   createSheetCache        the IDB wrapper: lazy open, an in-memory index loaded once, optional gzip through
//                           CompressionStream, LRU eviction under a byte budget and one QuotaExceededError retry
//
// The cache is strictly an optimisation: it NEVER throws or rejects. Every failure resolves to null / false and is
// counted in stats(); an unusable IndexedDB (missing, private mode SecurityError / InvalidStateError, blocked, slow
// open) disables it for the session with stats().disabledReason set, and the caller simply bakes as before.
//
// Byte order: typed buffers are stored in the platform's byte order (little-endian on every browser we ship to);
// the container header itself is explicitly little-endian.

// ------------------------------------------------------------------------------------ binary container

/** A baked sheet as stored: JSON-serialisable meta + raw typed buffers (atlas planes, tables). */
export interface SheetBlob {
  meta: unknown;
  bufs: (Uint8Array | Uint16Array | Float32Array)[];
}

const MAGIC = 0x50535443; // 'CTSP' read as a little-endian u32
/** Bump when the container layout changes; old entries then fail to unpack and are dropped as corrupt. */
const FORMAT_VERSION = 1;
const TAG_U8 = 1;
const TAG_U16 = 2;
const TAG_F32 = 3;

const align4 = (n: number): number => (n + 3) & ~3;

function tagOf(b: Uint8Array | Uint16Array | Float32Array): number {
  if (b instanceof Float32Array) return TAG_F32;
  if (b instanceof Uint16Array) return TAG_U16;
  return TAG_U8;
}

/**
 * Layout (all header words u32 little-endian; every section starts 4-byte aligned):
 *   'CTSP' | version | metaLen | meta UTF-8 (padded) | count | count × (tag, byteLength) | data 0 (padded) | data 1 …
 */
export function packBlob(b: SheetBlob): Uint8Array<ArrayBuffer> {
  const meta = new TextEncoder().encode(JSON.stringify(b.meta ?? null));
  const n = b.bufs.length;
  let size = 12 + align4(meta.byteLength) + 4 + n * 8;
  for (const buf of b.bufs) size += align4(buf.byteLength);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, FORMAT_VERSION, true);
  dv.setUint32(8, meta.byteLength, true);
  out.set(meta, 12);
  let off = 12 + align4(meta.byteLength);
  dv.setUint32(off, n, true);
  off += 4;
  for (const buf of b.bufs) {
    dv.setUint32(off, tagOf(buf), true);
    dv.setUint32(off + 4, buf.byteLength, true);
    off += 8;
  }
  for (const buf of b.bufs) {
    out.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), off);
    off += align4(buf.byteLength);
  }
  return out;
}

/**
 * The inverse of packBlob. Buffers are views into `u8`'s ArrayBuffer (no copy) when its offset keeps them aligned,
 * else copies. Throws on a bad magic, an unknown version or tag, or truncated input.
 */
export function unpackBlob(u8: Uint8Array): SheetBlob {
  const len = u8.byteLength;
  const need = (end: number): void => {
    if (end > len) throw new Error(`sprite sheet blob truncated (${len} < ${end} bytes)`);
  };
  need(12);
  const dv = new DataView(u8.buffer, u8.byteOffset, len);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('sprite sheet blob: bad magic');
  const version = dv.getUint32(4, true);
  if (version !== FORMAT_VERSION) throw new Error(`sprite sheet blob: unsupported version ${version}`);
  const metaLen = dv.getUint32(8, true);
  need(12 + metaLen);
  const meta: unknown = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + metaLen)));
  let off = 12 + align4(metaLen);
  need(off + 4);
  const n = dv.getUint32(off, true);
  off += 4;
  need(off + n * 8);
  const table: { tag: number; bytes: number }[] = [];
  for (let i = 0; i < n; i++) {
    table.push({ tag: dv.getUint32(off, true), bytes: dv.getUint32(off + 4, true) });
    off += 8;
  }
  const bufs: SheetBlob['bufs'] = [];
  for (const { tag, bytes } of table) {
    need(off + bytes);
    const start = u8.byteOffset + off;
    if (tag === TAG_U8) {
      bufs.push(new Uint8Array(u8.buffer, start, bytes));
    } else if (tag === TAG_U16 || tag === TAG_F32) {
      const el = tag === TAG_U16 ? 2 : 4;
      if (bytes % el !== 0) throw new Error(`sprite sheet blob: buffer of ${bytes} bytes is not a multiple of ${el}`);
      // Aligned: a view on the same memory. Unaligned (u8 sits at an odd offset in its buffer): copy out first.
      const src: ArrayBufferLike =
        start % el === 0 ? u8.buffer : u8.slice(off, off + bytes).buffer;
      const so = start % el === 0 ? start : 0;
      bufs.push(tag === TAG_U16 ? new Uint16Array(src, so, bytes / 2) : new Float32Array(src, so, bytes / 4));
    } else {
      throw new Error(`sprite sheet blob: unknown buffer tag ${tag}`);
    }
    off += align4(bytes);
  }
  return { meta, bufs };
}

// ------------------------------------------------------------------------------------ LRU planning

export interface CacheEntryInfo {
  key: string;
  /** Stored bytes (after compression). */
  bytes: number;
  /** Last use stamp (larger = more recent). */
  used: number;
}

/**
 * Pure LRU: the keys to delete, least recently used first, so that total + incomingBytes <= maxBytes.
 * An incoming blob larger than maxBytes on its own returns [] (evicting everything would not make it fit): the
 * caller must check `incomingBytes > maxBytes` itself and skip storing it. Entries replaced by the incoming key
 * should be left out of `entries` by the caller.
 */
export function planEviction(entries: CacheEntryInfo[], maxBytes: number, incomingBytes: number): string[] {
  if (incomingBytes > maxBytes) return [];
  let total = 0;
  for (const e of entries) total += e.bytes;
  if (total + incomingBytes <= maxBytes) return [];
  const order = [...entries].sort((a, b) => a.used - b.used);
  const out: string[] = [];
  for (const e of order) {
    if (total + incomingBytes <= maxBytes) break;
    out.push(e.key);
    total -= e.bytes;
  }
  return out;
}

// ------------------------------------------------------------------------------------ the IndexedDB cache

export interface SheetCacheStats {
  enabled: boolean;
  hits: number;
  misses: number;
  puts: number;
  putFails: number;
  evictions: number;
  /** Stored bytes currently indexed. */
  bytes: number;
  entries: number;
  disabledReason: string | null;
}

export interface SheetCache {
  get(key: string): Promise<SheetBlob | null>;
  put(key: string, blob: SheetBlob): Promise<boolean>;
  clear(): Promise<void>;
  stats(): SheetCacheStats;
}

export interface SheetCacheOptions {
  /** Default 'ct-v3-sprites'. */
  dbName?: string;
  /** Budget in STORED (post-compression) bytes. Default 48 MiB. */
  maxBytes?: number;
  /** Default globalThis.indexedDB; null = disabled. */
  idb?: IDBFactory | null;
  /** gzip through CompressionStream. Default true when CompressionStream exists. */
  compress?: boolean;
  /** Give up opening after this long (a blocked / hung open). Default 2000 ms. */
  openTimeoutMs?: number;
}

const DB_VERSION = 1;
const S_BLOBS = 'blobs';
const S_INDEX = 'index';

/** Value of the 'blobs' store. */
interface StoredBlob {
  data: ArrayBuffer;
  /** true = gzip-compressed packBlob bytes. */
  z: boolean;
}
/** Value of the 'index' store. */
interface IndexRecord {
  key: string;
  bytes: number;
  used: number;
}

function errName(e: unknown): string {
  return e && typeof e === 'object' && 'name' in e && typeof (e as { name: unknown }).name === 'string'
    ? (e as { name: string }).name
    : 'Error';
}
function errText(e: unknown): string {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  return msg ? `${errName(e)}: ${msg}` : errName(e);
}

function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IDB request failed'));
  });
}
function txP(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'));
    tx.onerror = () => {
      /* the abort that follows carries the error */
    };
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/** Push `u8` through a (De)CompressionStream. The write is not awaited before reading (backpressure). */
function transform(ts: CompressionStream | DecompressionStream, u8: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const w = ts.writable.getWriter();
  const input = new Uint8Array(u8.byteLength);
  input.set(u8);
  w.write(input).catch(() => {});
  w.close().catch(() => {});
  return readAll(ts.readable as ReadableStream<Uint8Array>);
}

export function createSheetCache(opts: SheetCacheOptions = {}): SheetCache {
  const dbName = opts.dbName ?? 'ct-v3-sprites';
  const maxBytes = opts.maxBytes ?? 48 * 1024 * 1024;
  const openTimeoutMs = opts.openTimeoutMs ?? 2000;
  const hasCompression =
    typeof globalThis.CompressionStream === 'function' && typeof globalThis.DecompressionStream === 'function';
  const compress = (opts.compress ?? true) && hasCompression;
  const idb: IDBFactory | null | undefined =
    opts.idb === undefined ? (globalThis as { indexedDB?: IDBFactory }).indexedDB : opts.idb;

  const st: SheetCacheStats = {
    enabled: true,
    hits: 0,
    misses: 0,
    puts: 0,
    putFails: 0,
    evictions: 0,
    bytes: 0,
    entries: 0,
    disabledReason: null,
  };
  /** key -> stored bytes + last use; the source of truth for eviction planning (loaded once at open). */
  const index = new Map<string, { bytes: number; used: number }>();
  let clock = 0;
  const now = (): number => (clock = Math.max(clock + 1, Date.now()));

  let db: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase | null> | null = null;
  /** Writes (put / clear) run one at a time so eviction plans see the index they act on. */
  let writeChain: Promise<unknown> = Promise.resolve();

  function disable(reason: string): void {
    if (!st.enabled) return;
    st.enabled = false;
    st.disabledReason = reason;
    index.clear();
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      db = null;
    }
  }

  if (idb === null) disable('disabled (idb: null)');
  else if (!idb) disable('IndexedDB unavailable');

  /** Opens the DB, creates the stores, loads the index and drops orphans. Resolves null (and disables) on failure. */
  function open(): Promise<IDBDatabase | null> {
    if (!st.enabled) return Promise.resolve(null);
    if (db) return Promise.resolve(db);
    if (opening) return opening;
    opening = new Promise<IDBDatabase | null>((resolve) => {
      let settled = false;
      const finish = (d: IDBDatabase | null, reason?: string): void => {
        if (settled) {
          if (d) {
            try {
              d.close(); // a late success after the timeout
            } catch {
              /* ignore */
            }
          }
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (!d) disable(reason ?? 'open failed');
        resolve(d);
      };
      const timer = setTimeout(() => finish(null, `open timeout (${openTimeoutMs} ms)`), openTimeoutMs);
      let r: IDBOpenDBRequest;
      try {
        r = idb!.open(dbName, DB_VERSION);
      } catch (e) {
        finish(null, `open threw ${errText(e)}`); // SecurityError / InvalidStateError in some private modes
        return;
      }
      r.onupgradeneeded = () => {
        try {
          const d = r.result;
          if (!d.objectStoreNames.contains(S_BLOBS)) d.createObjectStore(S_BLOBS);
          if (!d.objectStoreNames.contains(S_INDEX)) d.createObjectStore(S_INDEX);
        } catch (e) {
          finish(null, `upgrade failed ${errText(e)}`);
        }
      };
      r.onblocked = () => finish(null, 'open blocked (another tab holds an older version)');
      r.onerror = () => finish(null, `open error ${errText(r.error)}`);
      r.onsuccess = () => {
        const d = r.result;
        if (settled) {
          finish(d);
          return;
        }
        d.onversionchange = () => disable('version change from another tab');
        loadIndex(d).then(
          () => finish(d),
          (e: unknown) => {
            try {
              d.close();
            } catch {
              /* ignore */
            }
            finish(null, `index load failed ${errText(e)}`);
          },
        );
      };
    }).then((d) => {
      db = d && st.enabled ? d : null;
      if (d && !db) {
        try {
          d.close();
        } catch {
          /* ignore */
        }
      }
      refreshCounts();
      return db;
    });
    return opening;
  }

  /**
   * Reads the index records + the blob keys (one readonly transaction), then drops index rows without a blob and
   * orphan blobs (a crash between stores) in a second transaction, so no request is issued after an await.
   */
  async function loadIndex(d: IDBDatabase): Promise<void> {
    const tx = d.transaction([S_BLOBS, S_INDEX], 'readonly');
    const done = txP(tx);
    const [rows, keys] = await Promise.all([
      reqP(tx.objectStore(S_INDEX).getAll() as IDBRequest<IndexRecord[]>),
      reqP(tx.objectStore(S_BLOBS).getAllKeys()),
    ]);
    await done;
    const blobKeys = new Set(keys.map((k) => String(k)));
    const stale: string[] = [];
    index.clear();
    for (const row of rows) {
      if (!row || typeof row.key !== 'string' || !blobKeys.has(row.key)) {
        if (row && typeof row.key === 'string') stale.push(row.key);
        continue;
      }
      index.set(row.key, { bytes: Number(row.bytes) || 0, used: Number(row.used) || 0 });
      clock = Math.max(clock, Number(row.used) || 0);
    }
    for (const k of blobKeys) if (!index.has(k)) stale.push(k);
    if (stale.length) await deleteKeys(d, stale);
  }

  function refreshCounts(): void {
    let b = 0;
    for (const e of index.values()) b += e.bytes;
    st.bytes = b;
    st.entries = index.size;
  }

  /** Deletes keys from both stores in one transaction; updates the index only once it committed. */
  async function deleteKeys(d: IDBDatabase, keys: string[]): Promise<void> {
    if (!keys.length) return;
    const tx = d.transaction([S_BLOBS, S_INDEX], 'readwrite');
    const done = txP(tx);
    for (const k of keys) {
      tx.objectStore(S_BLOBS).delete(k);
      tx.objectStore(S_INDEX).delete(k);
    }
    await done;
    for (const k of keys) index.delete(k);
    refreshCounts();
  }

  function entriesExcept(key: string): CacheEntryInfo[] {
    const out: CacheEntryInfo[] = [];
    for (const [k, e] of index) if (k !== key) out.push({ key: k, bytes: e.bytes, used: e.used });
    return out;
  }

  /** Evict + store in ONE transaction (an abort rolls the deletes back too). Rejects with the IDB error. */
  async function storeOnce(d: IDBDatabase, key: string, value: StoredBlob): Promise<void> {
    const bytes = value.data.byteLength;
    const evict = planEviction(entriesExcept(key), maxBytes, bytes);
    const used = now();
    const tx = d.transaction([S_BLOBS, S_INDEX], 'readwrite');
    const done = txP(tx);
    const blobs = tx.objectStore(S_BLOBS);
    const ix = tx.objectStore(S_INDEX);
    for (const k of evict) {
      blobs.delete(k);
      ix.delete(k);
    }
    blobs.put(value, key);
    ix.put({ key, bytes, used } satisfies IndexRecord, key);
    await done;
    for (const k of evict) index.delete(k);
    st.evictions += evict.length;
    index.set(key, { bytes, used });
    refreshCounts();
  }

  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = writeChain.then(fn, fn);
    writeChain = run.catch(() => {});
    return run;
  }

  async function get(key: string): Promise<SheetBlob | null> {
    try {
      const d = await open();
      if (!d || !index.has(key)) {
        st.misses++;
        return null;
      }
      const tx = d.transaction(S_BLOBS, 'readonly');
      const v = (await reqP(tx.objectStore(S_BLOBS).get(key))) as StoredBlob | undefined;
      if (!v || !(v.data instanceof ArrayBuffer)) {
        st.misses++;
        void serial(() => deleteKeys(d, [key])).catch(() => {});
        return null;
      }
      let blob: SheetBlob;
      try {
        const raw = new Uint8Array(v.data);
        const bytes = v.z ? await transform(new DecompressionStream('gzip'), raw) : raw;
        blob = unpackBlob(bytes);
      } catch {
        // Corrupt (or an old container version): drop it so the next bake re-stores a good one.
        st.misses++;
        void serial(() => deleteKeys(d, [key])).catch(() => {});
        return null;
      }
      st.hits++;
      const e = index.get(key);
      if (e) {
        e.used = now();
        // LRU bump, fire and forget.
        try {
          const wtx = d.transaction(S_INDEX, 'readwrite');
          txP(wtx).catch(() => {});
          wtx.objectStore(S_INDEX).put({ key, bytes: e.bytes, used: e.used } satisfies IndexRecord, key);
        } catch {
          /* ignore */
        }
      }
      return blob;
    } catch (e) {
      st.misses++;
      if (errName(e) === 'InvalidStateError') disable(`get failed ${errText(e)}`);
      return null;
    }
  }

  async function put(key: string, blob: SheetBlob): Promise<boolean> {
    try {
      const packed = packBlob(blob);
      const data = compress ? await transform(new CompressionStream('gzip'), packed) : packed;
      const value: StoredBlob = { data: data.buffer, z: compress };
      return await serial(async () => {
        const d = await open();
        if (!d) {
          st.putFails++;
          return false;
        }
        // Larger than the whole budget: skip (planEviction returns [] for it).
        if (value.data.byteLength > maxBytes) {
          st.putFails++;
          return false;
        }
        try {
          await storeOnce(d, key, value);
        } catch (e) {
          if (errName(e) !== 'QuotaExceededError') throw e;
          // The origin's quota is smaller than our budget: evict about half of the cache (LRU) and retry once.
          const half = planEviction(entriesExcept(key), Math.floor(st.bytes / 2), 0);
          await deleteKeys(d, half);
          st.evictions += half.length;
          await storeOnce(d, key, value);
        }
        st.puts++;
        return true;
      });
    } catch (e) {
      st.putFails++;
      if (errName(e) === 'InvalidStateError') disable(`put failed ${errText(e)}`);
      return false;
    }
  }

  async function clear(): Promise<void> {
    try {
      await serial(async () => {
        const d = await open();
        if (!d) return;
        const tx = d.transaction([S_BLOBS, S_INDEX], 'readwrite');
        const done = txP(tx);
        tx.objectStore(S_BLOBS).clear();
        tx.objectStore(S_INDEX).clear();
        await done;
        index.clear();
        refreshCounts();
      });
    } catch (e) {
      if (errName(e) === 'InvalidStateError') disable(`clear failed ${errText(e)}`);
    }
  }

  return {
    get,
    put,
    clear,
    stats: () => {
      if (st.enabled) refreshCounts();
      else {
        st.bytes = 0;
        st.entries = 0;
      }
      return { ...st };
    },
  };
}
