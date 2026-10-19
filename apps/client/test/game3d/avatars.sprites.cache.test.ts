// v3.3 sprites: the IndexedDB sheet cache (apps/client/src/game3d/avatars/sprites/cache.ts): the binary container,
// LRU planning, the disabled paths, and a get / put / evict round trip against a tiny in-memory fake IndexedDB
// (no fake-indexeddb dependency; the fake implements only what cache.ts calls).
import { describe, expect, it } from 'vitest';
import {
  createSheetCache,
  packBlob,
  planEviction,
  unpackBlob,
  type SheetBlob,
} from '../../src/game3d/avatars/sprites/cache';

// ------------------------------------------------------------------------------------ fake IndexedDB

type Handler = ((ev: unknown) => void) | null;

class FakeRequest<T = unknown> {
  result: T | undefined = undefined;
  error: { name: string; message: string } | null = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
}

interface FakeOpts {
  /** Total stored ArrayBuffer bytes in 'blobs' above which a put aborts with QuotaExceededError. */
  quotaBytes?: number;
}

class FakeTx {
  oncomplete: Handler = null;
  onabort: Handler = null;
  onerror: Handler = null;
  error: { name: string; message: string } | null = null;
  private pending = 0;
  private finished = false;
  constructor(
    private readonly db: FakeDb,
    private readonly mode: string,
  ) {
    setTimeout(() => this.maybeComplete(), 0);
  }
  objectStore(name: string): FakeStore {
    const m = this.db.stores.get(name);
    if (!m) throw Object.assign(new Error(`no store ${name}`), { name: 'NotFoundError' });
    return new FakeStore(this, m, name);
  }
  run<T>(fn: () => T, write: boolean): FakeRequest<T> {
    if (write && this.mode !== 'readwrite') throw Object.assign(new Error('readonly'), { name: 'ReadOnlyError' });
    const r = new FakeRequest<T>();
    this.pending++;
    setTimeout(() => {
      if (this.finished) return;
      try {
        r.result = fn();
        r.onsuccess?.({});
      } catch (e) {
        r.error = { name: (e as Error).name, message: (e as Error).message };
        r.onerror?.({});
        this.abort(r.error);
        return;
      }
      this.pending--;
      setTimeout(() => this.maybeComplete(), 0);
    }, 0);
    return r;
  }
  private maybeComplete(): void {
    if (this.finished || this.pending > 0) return;
    this.finished = true;
    this.oncomplete?.({});
  }
  private abort(err: { name: string; message: string }): void {
    if (this.finished) return;
    this.finished = true;
    this.error = err;
    this.onerror?.({});
    this.onabort?.({});
  }
  get quota(): number | undefined {
    return this.db.opts.quotaBytes;
  }
}

class FakeStore {
  constructor(
    private readonly tx: FakeTx,
    private readonly m: Map<string, unknown>,
    private readonly name: string,
  ) {}
  get(k: string): FakeRequest {
    return this.tx.run(() => this.m.get(k), false);
  }
  getAll(): FakeRequest {
    return this.tx.run(() => [...this.m.values()], false);
  }
  getAllKeys(): FakeRequest {
    return this.tx.run(() => [...this.m.keys()], false);
  }
  put(v: unknown, k: string): FakeRequest {
    return this.tx.run(() => {
      const q = this.tx.quota;
      if (q !== undefined && this.name === 'blobs') {
        let total = 0;
        for (const [key, val] of this.m) if (key !== k) total += (val as { data: ArrayBuffer }).data.byteLength;
        if (total + (v as { data: ArrayBuffer }).data.byteLength > q) {
          throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
        }
      }
      this.m.set(k, v);
      return k;
    }, true);
  }
  delete(k: string): FakeRequest {
    return this.tx.run(() => void this.m.delete(k), true);
  }
  clear(): FakeRequest {
    return this.tx.run(() => this.m.clear(), true);
  }
}

class FakeDb {
  stores = new Map<string, Map<string, unknown>>();
  onversionchange: Handler = null;
  constructor(readonly opts: FakeOpts) {}
  get objectStoreNames(): { contains(n: string): boolean } {
    return { contains: (n: string) => this.stores.has(n) };
  }
  createObjectStore(n: string): void {
    this.stores.set(n, new Map());
  }
  transaction(names: string | string[], mode = 'readonly'): FakeTx {
    for (const n of Array.isArray(names) ? names : [names]) {
      if (!this.stores.has(n)) throw Object.assign(new Error(`no store ${n}`), { name: 'NotFoundError' });
    }
    return new FakeTx(this, mode);
  }
  close(): void {}
}

/** A factory whose databases persist across createSheetCache instances (= page reloads). */
function fakeIdb(opts: FakeOpts = {}): { factory: IDBFactory; dbs: Map<string, FakeDb> } {
  const dbs = new Map<string, FakeDb>();
  const factory = {
    open(name: string) {
      const r = new FakeRequest<FakeDb>() as FakeRequest<FakeDb> & { onupgradeneeded: Handler; onblocked: Handler };
      r.onupgradeneeded = null;
      r.onblocked = null;
      setTimeout(() => {
        let db = dbs.get(name);
        const fresh = !db;
        if (!db) dbs.set(name, (db = new FakeDb(opts)));
        r.result = db;
        if (fresh) r.onupgradeneeded?.({});
        r.onsuccess?.({});
      }, 0);
      return r;
    },
  };
  return { factory: factory as unknown as IDBFactory, dbs };
}

function sheet(n: number, seed = 1): SheetBlob {
  const u8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) u8[i] = (i * 31 + seed) & 255;
  return { meta: { seed, n }, bufs: [u8] };
}

// ------------------------------------------------------------------------------------ container

describe('packBlob / unpackBlob', () => {
  it('round-trips meta and u8 / u16 / f32 buffers, including odd and empty lengths', () => {
    const u8 = Uint8Array.from([1, 2, 3, 4, 5]); // odd length: the next section must still start aligned
    const u16 = Uint16Array.from([0, 1, 65535, 300, 7]);
    const f32 = Float32Array.from([0.5, -1.25, Math.PI, 1e-7]);
    const meta = { key: 'cast:7|t0.05|p0.61', cells: [{ w: 12, h: 30 }], n: null, s: 'üñí' };
    const blob: SheetBlob = { meta, bufs: [u8, new Uint8Array(0), u16, new Float32Array(0), f32, Uint8Array.from([9])] };
    const packed = packBlob(blob);
    expect(packed.byteLength % 4).toBe(0);
    const out = unpackBlob(packed);
    expect(out.meta).toEqual(meta);
    expect(out.bufs.length).toBe(6);
    expect(out.bufs[0]).toBeInstanceOf(Uint8Array);
    expect([...out.bufs[0]!]).toEqual([1, 2, 3, 4, 5]);
    expect(out.bufs[1]!.length).toBe(0);
    expect(out.bufs[2]).toBeInstanceOf(Uint16Array);
    expect([...out.bufs[2]!]).toEqual([...u16]);
    expect(out.bufs[3]).toBeInstanceOf(Float32Array);
    expect(out.bufs[3]!.length).toBe(0);
    expect(out.bufs[4]).toBeInstanceOf(Float32Array);
    expect([...out.bufs[4]!]).toEqual([...f32]);
    expect([...out.bufs[5]!]).toEqual([9]);
    // Aligned input: zero-copy views on the packed buffer, each 4-byte aligned.
    for (const b of out.bufs) {
      expect(b.buffer).toBe(packed.buffer);
      expect(b.byteOffset % 4).toBe(0);
    }
  });

  it('packs subarray views (non-zero byteOffset) correctly', () => {
    const big = Float32Array.from([1, 2, 3, 4, 5, 6]);
    const out = unpackBlob(packBlob({ meta: 1, bufs: [big.subarray(2, 5)] }));
    expect([...out.bufs[0]!]).toEqual([3, 4, 5]);
  });

  it('copies when the input sits at an unaligned offset', () => {
    const packed = packBlob({ meta: {}, bufs: [Uint16Array.from([1, 2, 3]), Float32Array.from([2.5])] });
    const shifted = new Uint8Array(packed.byteLength + 1);
    shifted.set(packed, 1);
    const out = unpackBlob(shifted.subarray(1));
    expect([...out.bufs[0]!]).toEqual([1, 2, 3]);
    expect([...out.bufs[1]!]).toEqual([2.5]);
    expect(out.bufs[1]!.buffer).not.toBe(shifted.buffer);
  });

  it('throws on a bad magic, an unknown version and truncated input', () => {
    const packed = packBlob(sheet(37));
    const bad = packed.slice();
    bad[0] = 0x58;
    expect(() => unpackBlob(bad)).toThrow(/magic/);
    const ver = packed.slice();
    new DataView(ver.buffer).setUint32(4, 99, true);
    expect(() => unpackBlob(ver)).toThrow(/version/);
    expect(() => unpackBlob(packed.subarray(0, 8))).toThrow(/truncated/);
    expect(() => unpackBlob(packed.subarray(0, packed.byteLength - 8))).toThrow(/truncated/);
    expect(() => unpackBlob(new Uint8Array(0))).toThrow();
  });
});

// ------------------------------------------------------------------------------------ LRU planning

describe('planEviction', () => {
  const e = (key: string, bytes: number, used: number) => ({ key, bytes, used });

  it('returns [] when everything fits', () => {
    expect(planEviction([e('a', 10, 1), e('b', 10, 2)], 100, 50)).toEqual([]);
    expect(planEviction([], 100, 100)).toEqual([]);
  });

  it('evicts least recently used first, only as many as needed', () => {
    const entries = [e('new', 30, 9), e('old', 30, 1), e('mid', 30, 5)];
    expect(planEviction(entries, 100, 20)).toEqual(['old']);
    expect(planEviction(entries, 100, 60)).toEqual(['old', 'mid']);
    expect(planEviction(entries, 100, 100)).toEqual(['old', 'mid', 'new']);
  });

  it('returns [] for an incoming blob larger than the budget (the caller skips storing it)', () => {
    expect(planEviction([e('a', 10, 1)], 100, 101)).toEqual([]);
  });

  it('treats total + incoming == maxBytes as fitting', () => {
    expect(planEviction([e('a', 40, 1), e('b', 40, 2)], 100, 20)).toEqual([]);
    expect(planEviction([e('a', 40, 1), e('b', 40, 2)], 100, 21)).toEqual(['a']);
  });
});

// ------------------------------------------------------------------------------------ the cache

describe('createSheetCache', () => {
  it('idb: null is disabled and never throws', async () => {
    const c = createSheetCache({ idb: null });
    expect(await c.get('k')).toBeNull();
    expect(await c.put('k', sheet(8))).toBe(false);
    await c.clear();
    const s = c.stats();
    expect(s.enabled).toBe(false);
    expect(s.disabledReason).toBeTruthy();
    expect(s.misses).toBe(1);
    expect(s.putFails).toBe(1);
  });

  it('an open() that errors disables the cache with a reason', async () => {
    const idb = {
      open() {
        const r = { onerror: null as Handler, onsuccess: null as Handler, error: { name: 'UnknownError', message: 'nope' } };
        setTimeout(() => r.onerror?.({}), 0);
        return r;
      },
    } as unknown as IDBFactory;
    const c = createSheetCache({ idb });
    expect(await c.get('k')).toBeNull();
    expect(await c.put('k', sheet(8))).toBe(false);
    const s = c.stats();
    expect(s.enabled).toBe(false);
    expect(s.disabledReason).toMatch(/UnknownError/);
  });

  it('an open() that throws (private mode SecurityError) or never answers disables it', async () => {
    const throwing = {
      open() {
        throw Object.assign(new Error('denied'), { name: 'SecurityError' });
      },
    } as unknown as IDBFactory;
    const a = createSheetCache({ idb: throwing });
    expect(await a.put('k', sheet(4))).toBe(false);
    expect(a.stats().disabledReason).toMatch(/SecurityError/);

    const hung = { open: () => ({}) } as unknown as IDBFactory;
    const b = createSheetCache({ idb: hung, openTimeoutMs: 20 });
    expect(await b.get('k')).toBeNull();
    expect(b.stats().disabledReason).toMatch(/timeout/);
  });

  it('get / put / LRU evict round trip (compress: false), persisting across instances', async () => {
    const { factory } = fakeIdb();
    const c = createSheetCache({ idb: factory, compress: false, maxBytes: 1000 });
    expect(await c.get('a')).toBeNull(); // miss on an empty cache
    const sz = packBlob(sheet(200)).byteLength; // ~ 240 stored bytes each: 4 fit in 1000
    expect(await c.put('a', sheet(200, 1))).toBe(true);
    expect(await c.put('b', sheet(200, 2))).toBe(true);
    expect(await c.put('c', sheet(200, 3))).toBe(true);
    const got = await c.get('a'); // touch 'a': 'b' becomes the least recently used
    expect(got?.meta).toEqual({ seed: 1, n: 200 });
    expect([...(got!.bufs[0] as Uint8Array)]).toEqual([...(sheet(200, 1).bufs[0] as Uint8Array)]);
    expect(await c.put('d', sheet(200, 4))).toBe(true);
    expect(await c.put('e', sheet(200, 5))).toBe(true); // 5 × sz > 1000: evicts 'b'
    let s = c.stats();
    expect(s.enabled).toBe(true);
    expect(s.entries).toBe(4);
    expect(s.bytes).toBe(4 * sz);
    expect(s.evictions).toBe(1);
    expect(await c.get('b')).toBeNull();
    expect((await c.get('c'))?.meta).toEqual({ seed: 3, n: 200 });
    // Too big for the whole budget: skipped, nothing evicted.
    expect(await c.put('huge', sheet(2000))).toBe(false);
    s = c.stats();
    expect(s.entries).toBe(4);
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(2);
    expect(s.puts).toBe(5);
    expect(s.putFails).toBe(1);

    // A "reload": a new instance loads the persisted index.
    const c2 = createSheetCache({ idb: factory, compress: false, maxBytes: 1000 });
    expect((await c2.get('e'))?.meta).toEqual({ seed: 5, n: 200 });
    expect(c2.stats().entries).toBe(4);
    await c2.clear();
    expect(c2.stats().entries).toBe(0);
    expect(await c2.get('e')).toBeNull();
  });

  it('a corrupt entry is dropped and counted as a miss', async () => {
    const { factory, dbs } = fakeIdb();
    const c = createSheetCache({ idb: factory, compress: false, dbName: 'x' });
    expect(await c.put('k', sheet(16))).toBe(true);
    const blobs = dbs.get('x')!.stores.get('blobs')!;
    blobs.set('k', { data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer, z: false });
    expect(await c.get('k')).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(c.stats().entries).toBe(0);
    expect(blobs.has('k')).toBe(false);
  });

  it('on QuotaExceededError evicts about half (LRU) and retries once', async () => {
    const sz = packBlob(sheet(200)).byteLength;
    const { factory } = fakeIdb({ quotaBytes: sz * 3 }); // the origin quota is below our 1 MiB budget
    const c = createSheetCache({ idb: factory, compress: false, maxBytes: 1 << 20 });
    for (const k of ['a', 'b', 'c']) expect(await c.put(k, sheet(200))).toBe(true);
    expect(await c.put('d', sheet(200))).toBe(true);
    const s = c.stats();
    expect(s.evictions).toBeGreaterThanOrEqual(1);
    expect(await c.get('a')).toBeNull(); // the oldest went first
    expect(await c.get('d')).not.toBeNull();
  });

  it.skipIf(typeof globalThis.CompressionStream !== 'function')('round-trips through gzip', async () => {
    const { factory } = fakeIdb();
    const c = createSheetCache({ idb: factory, compress: true });
    const big: SheetBlob = { meta: { z: 1 }, bufs: [new Uint8Array(4096), Float32Array.from([1, 2, 3])] };
    expect(await c.put('z', big)).toBe(true);
    expect(c.stats().bytes).toBeLessThan(packBlob(big).byteLength); // zeros compress
    const got = await c.get('z');
    expect(got?.meta).toEqual({ z: 1 });
    expect(got!.bufs[0]!.length).toBe(4096);
    expect([...got!.bufs[1]!]).toEqual([1, 2, 3]);
  });
});
