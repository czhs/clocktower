// v3.3 perf (v33-bake), docs/perf-v3/bake.md. The createTree output cache of the town build (behind ct.debug.v3bake=1).
//
// The town build spends ~46 % of its CPU in createTree (src/world/trees.js: crown noise, crease test, Poisson leaf
// scatter). The bundled trees.js is patched (build/townBake.ts) so createTree first asks globalThis.__ctTreeBake for
// the call; this module answers from a cache of earlier outputs and records the misses:
//   - store: IndexedDB 'ct-town-bake' (one record per vendor build + quality tier + build texel size: the leaf spacing
//     follows the window's low-res height), stored as a raw Blob, written after the town is up (idle), so only a
//     REPEAT join with the same window height replays. Entries of another vendor build are deleted on write.
//   - the key, the binary format and the replay are bit-exact: scripts/v3/bake-town.mjs --verify compares every replayed
//     tree with the live one (geometry, leaf instances, bounds, materials, the re-sort at the vote yaw).
//   - never throws into the build: any cache failure = live generation (stats.error says why).
import * as THREE from 'three';
import { BodyWriter, decodeBake, encodeHead, treeKey, type BakeHeader, type DecodedBake, type GeoRec, type Ref, type TreeRec } from './bakeFormat';

declare const __CT_VENDOR_HASH__: string | undefined;
/** Hash of the vendor tree + the patch, compiled in by vite.config.ts (undefined in unit tests / the harness). */
export const VENDOR_HASH: string | null = typeof __CT_VENDOR_HASH__ === 'string' ? __CT_VENDOR_HASH__ : null;
export const BAKE_FLAG = 'ct.debug.v3bake';

/** What the patched createTree reads (build/townBake.ts __ctAssembleTree). */
interface ReplayData {
  trunk: (() => THREE.BufferGeometry) | null;
  core: () => THREE.BufferGeometry;
  leaves: () => { n: number; base: Float64Array; n3: Float32Array; v4: Float32Array; rad: Float32Array; occ: Float32Array };
  sphere: [number, number, number, number];
  tree: () => unknown;
}
interface TreeHook {
  get(engine: { camera: { texelWorld: number } }, opts: Record<string, unknown>): ReplayData | null;
  put?(engine: { camera: { texelWorld: number } }, opts: Record<string, unknown>, g: THREE.Group): void;
}
type G = typeof globalThis & { __ctTreeBake?: TreeHook | null };

export interface TreeBakeStats {
  hits: number;
  misses: number;
  /** ms spent reading + decompressing + decoding the cached record before the build */
  readMs: number;
  /** cached record size (bytes), 0 = none */
  bytes: number;
  /** ms spent recording misses during the build */
  recordMs: number;
  stored: boolean;
  error: string | null;
}

export function bakeEnabled(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return !!VENDOR_HASH && storage?.getItem(BAKE_FLAG) === '1';
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------------------------------------ replay
export function replayFrom(dec: DecodedBake): TreeHook['get'] {
  const copy = <T extends Float32Array | Float64Array | Uint16Array | Uint32Array>(r: Ref) => dec.view(r).slice() as T;
  const geo = (rec: GeoRec) => {
    const g = new THREE.BufferGeometry();
    for (const [name, size, norm, r] of rec.attrs) g.setAttribute(name, new THREE.BufferAttribute(copy(r), size, norm));
    if (rec.index) g.setIndex(new THREE.BufferAttribute(copy(rec.index), 1));
    return g;
  };
  return (engine, opts) => {
    const rec = dec.header.keys[treeKey(opts, engine.camera.texelWorld)];
    if (!rec) return null;
    const L = rec.leaves;
    return {
      trunk: rec.trunk ? () => geo(rec.trunk!) : null,
      core: () => geo(rec.core),
      leaves: () => ({ n: L.n, base: dec.view(L.base) as Float64Array, n3: dec.view(L.n3) as Float32Array, v4: dec.view(L.v4) as Float32Array, rad: dec.view(L.rad) as Float32Array, occ: dec.view(L.occ) as Float32Array }),
      sphere: rec.sphere,
      tree: () => {
        const t = rec.tree as { crowns: { c: { x: number; y: number; z: number }; r: number }[] } & Record<string, unknown>;
        return { ...t, crowns: t.crowns.map((c) => ({ c: new THREE.Vector3(c.c.x, c.c.y, c.c.z), r: c.r })) };
      },
    };
  };
}

// ------------------------------------------------------------------------------------------------ record
/** Records live createTree results (the patch exposes the unsorted leaf list to `put`). */
export class TreeRecorder {
  readonly body = new BodyWriter();
  readonly keys: Record<string, TreeRec> = {};
  ms = 0;
  put(engine: { camera: { texelWorld: number } }, opts: Record<string, unknown>, g: THREE.Group): void {
    const t0 = performance.now();
    const key = treeKey(opts, engine.camera.texelWorld);
    if (this.keys[key]) return;
    const leaves = (g.userData as { __ctLeaves?: { base: THREE.Vector3; n: THREE.Vector3; variant: number; phase: number; sway: number; raised: number; rad: number; occ: number }[] }).__ctLeaves;
    const lm = g.getObjectByName('leaves') as THREE.Mesh | undefined;
    const core = g.getObjectByName('core') as THREE.Mesh | undefined;
    const sphere = lm?.geometry.boundingSphere;
    if (!leaves || !core || !sphere) return; // not a shape this cache knows: stays live
    const N = leaves.length;
    const base = new Float64Array(N * 3), n3 = new Float32Array(N * 3), v4 = new Float32Array(N * 4), rad = new Float32Array(N), occ = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const l = leaves[i]!;
      base[i * 3] = l.base.x; base[i * 3 + 1] = l.base.y; base[i * 3 + 2] = l.base.z;
      n3[i * 3] = l.n.x; n3[i * 3 + 1] = l.n.y; n3[i * 3 + 2] = l.n.z;
      v4[i * 4] = l.variant; v4[i * 4 + 1] = l.phase; v4[i * 4 + 2] = l.sway; v4[i * 4 + 3] = l.raised;
      rad[i] = l.rad;
      occ[i] = l.occ;
    }
    const trunk = g.getObjectByName('trunk') as THREE.Mesh | undefined;
    const t = g.userData.tree as { crowns: { c: THREE.Vector3; r: number }[] } & Record<string, unknown>;
    const geoRec = (geo: THREE.BufferGeometry): GeoRec | null => {
      const attrs: GeoRec['attrs'] = [];
      for (const [name, a] of Object.entries(geo.attributes)) {
        if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return null;
        attrs.push([name, a.itemSize, !!a.normalized, this.body.add((a as THREE.BufferAttribute).array as Float32Array)]);
      }
      if (Object.keys(geo.morphAttributes).length || geo.groups.length) return null;
      return { attrs, index: geo.index ? this.body.add(geo.index.array as Uint16Array) : null };
    };
    const coreRec = geoRec(core.geometry);
    const trunkRec = trunk ? geoRec(trunk.geometry) : null;
    if (!coreRec || (trunk && !trunkRec)) return;
    this.keys[key] = {
      trunk: trunkRec,
      core: coreRec,
      leaves: { n: N, base: this.body.add(base), n3: this.body.add(n3), v4: this.body.add(v4), rad: this.body.add(rad), occ: this.body.add(occ) },
      sphere: [sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius],
      tree: { ...t, crowns: t.crowns.map((c) => ({ c: { x: c.c.x, y: c.c.y, z: c.c.z }, r: c.r })) },
    };
    this.ms += performance.now() - t0;
  }
  get count(): number {
    return Object.keys(this.keys).length;
  }
}

/** Merge the previous record's entries with the recorded misses into one encoded record (a Blob of the parts). */
export function encodeRecord(vendorHash: string, rec: TreeRecorder, prev: DecodedBake | null): Blob {
  if (prev) {
    // re-home the previous entries into the new body (a window height seen before keeps its trees)
    for (const [k, e] of Object.entries(prev.header.keys)) {
      if (rec.keys[k]) continue;
      const re = (r: Ref): Ref => rec.body.add(prev.view(r));
      const geo = (g: GeoRec): GeoRec => ({ attrs: g.attrs.map(([n, s, nm, r]) => [n, s, nm, re(r)]), index: g.index ? re(g.index) : null });
      rec.keys[k] = { ...e, trunk: e.trunk ? geo(e.trunk) : null, core: geo(e.core), leaves: { n: e.leaves.n, base: re(e.leaves.base), n3: re(e.leaves.n3), v4: re(e.leaves.v4), rad: re(e.leaves.rad), occ: re(e.leaves.occ) } };
    }
  }
  const header: BakeHeader = { v: 1, vendorHash, generator: 'client', three: THREE.REVISION, keys: rec.keys };
  return new Blob([encodeHead(header) as BlobPart, ...(rec.body.chunks() as unknown as BlobPart[])]);
}

// ------------------------------------------------------------------------------------------------ IndexedDB
const DB = 'ct-town-bake';
const STORE = 'trees';
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('indexedDB.open failed'));
    r.onblocked = () => reject(new Error('indexedDB blocked'));
  });
}
function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('indexedDB request failed'));
  });
}
export const recordKey = (vendorHash: string, quality: string, lowH: number) => `${vendorHash}|${quality}|${lowH}`;

export async function readRecord(key: string): Promise<{ dec: DecodedBake; bytes: number } | null> {
  const db = await openDb();
  try {
    const v = (await req(db.transaction(STORE, 'readonly').objectStore(STORE).get(key))) as Blob | undefined;
    if (!(v instanceof Blob)) return null;
    return { dec: decodeBake(await v.arrayBuffer()), bytes: v.size };
  } finally {
    db.close();
  }
}

/**
 * Write a record (a Blob: the browser stores it off the main thread; no CompressionStream: gzip of ~22 MB ran on the
 * main thread as one 0.6 s task at CPU x4, and its inflate cost ~0.2 s at every read); delete every record of another
 * vendor build. Returns the stored bytes.
 */
export async function writeRecord(key: string, data: Blob): Promise<number> {
  const db = await openDb();
  try {
    const st = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const vh = key.split('|')[0]!;
    for (const k of (await req(st.getAllKeys())) as string[]) if (!k.startsWith(`${vh}|`)) st.delete(k);
    await req(st.put(data, key));
    return data.size;
  } finally {
    db.close();
  }
}

// ------------------------------------------------------------------------------------------------ the session
export interface TreeBakeSession {
  stats: TreeBakeStats;
  /** Install the createTree hook (call right before buildTown). */
  install(): void;
  /** Remove the hook (always, in a finally). */
  uninstall(): void;
  /** After the town is up: store the record when something was recorded (idle, never throws). */
  persist(): Promise<void>;
}

/** Open the cache for a build (reads the record for this quality + texel height). Never throws. */
export async function openTreeBake(quality: string, lowH: number): Promise<TreeBakeSession | null> {
  if (!VENDOR_HASH || typeof indexedDB === 'undefined' || typeof Blob === 'undefined') return null;
  const stats: TreeBakeStats = { hits: 0, misses: 0, readMs: 0, bytes: 0, recordMs: 0, stored: false, error: null };
  const key = recordKey(VENDOR_HASH, quality, lowH);
  const t0 = performance.now();
  let prev: DecodedBake | null = null;
  try {
    const r = await readRecord(key);
    if (r) {
      if (r.dec.header.vendorHash !== VENDOR_HASH) throw new Error(`stale record ${r.dec.header.vendorHash}`);
      prev = r.dec;
      stats.bytes = r.bytes;
    }
  } catch (e) {
    stats.error = `read: ${(e as Error).message}`;
  }
  stats.readMs = Math.round(performance.now() - t0);
  const get = prev ? replayFrom(prev) : null;
  const rec = new TreeRecorder();
  const hook: TreeHook = {
    get(engine, opts) {
      const d = get ? get(engine, opts) : null;
      if (d) stats.hits++;
      else stats.misses++;
      return d;
    },
    put: (engine, opts, g) => {
      try {
        rec.put(engine, opts, g);
      } catch (e) {
        stats.error = `record: ${(e as Error).message}`;
      }
    },
  };
  return {
    stats,
    install: () => {
      (globalThis as G).__ctTreeBake = hook;
    },
    uninstall: () => {
      if ((globalThis as G).__ctTreeBake === hook) (globalThis as G).__ctTreeBake = null;
      stats.recordMs = Math.round(rec.ms);
    },
    persist: async () => {
      if (!rec.count || !VENDOR_HASH) return;
      try {
        stats.bytes = await writeRecord(key, encodeRecord(VENDOR_HASH, rec, prev));
        stats.stored = true;
      } catch (e) {
        stats.error = `write: ${(e as Error).message}`;
      }
    },
  };
}
