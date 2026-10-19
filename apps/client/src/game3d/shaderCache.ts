// v3.5 shaders: the town's GLSL sources, recorded on one visit and compiled again EARLY on the next one
// (docs/perf-v3/shaders.md §5). three-free (the home page imports it).
//
// Why: on an Intel/Mesa iGPU the town's ≈ 40 programs take 6-9 s of serial driver compile time. The browser keeps the
// linked programs in its GPU program cache, but that cache is lost on browser / driver updates, on GPU-process restarts
// and by eviction; then the next join pays the full compile again. The measured fix: compiling the SAME sources in a
// hidden WebGL2 context (another page, another context: the browser's cache is per GPU process, keyed by the source)
// makes the town's own compiles cache hits — a laptop GPU-process restart went from 10.6 s to 2.5 s to the first frame.
//
//   record(gl, tier)       wraps shaderSource / attachShader / bindAttribLocation / linkProgram on the town's context
//                          (instance properties, not the prototype) and stores the programs in IndexedDB
//                          (`ct-shaders`, one record per tier) once the town is up (save()).
//   prewarm(tier, {build}) reads that record (only one written by the same build: the town chunk's URL, so a deploy
//                          that changes any town code never replays stale sources) and compiles it in a hidden 1×1 WebGL2 context with
//                          KHR_parallel_shader_compile (never without: a blocking compile would freeze the page), polls
//                          COMPLETION_STATUS_KHR from a timer, then deletes everything and loses the context. Stops early
//                          when most programs are ready at the first poll (the browser's cache is warm: nothing to do).
// Called from the home page (idle, after the town chunk prefetch) and at the start of a town build (overlaps the
// network + town build, ≈ 2-4 s cold). Switch: localStorage `ct.debug.v3shcache` = '0' turns record + prewarm off.

export interface ProgramSource {
  vs: string;
  fs: string;
  binds: [number, string][];
}
interface ShaderRecord {
  v: 1;
  tier: string;
  /** the build that produced the sources (the town chunk's URL): another build's record is never replayed */
  build: string;
  at: number;
  /** distinct shader sources (a program refers to them by index: three repeats vertex shaders a lot) */
  src: string[];
  programs: { vs: number; fs: number; binds: [number, string][] }[];
}
export interface PrewarmResult {
  mode: 'off' | 'none' | 'no-ext' | 'warm' | 'ready' | 'timeout' | 'cancelled' | 'error';
  programs: number;
  ms: number;
}

export const MAX_PROGRAMS = 120;
export const MAX_SOURCE_CHARS = 400_000;
const DB = 'ct-shaders';
const STORE = 'v1';
const COMPLETION_STATUS_KHR = 0x91b1;
const POLL_MS = 50;
const PREWARM_MAX_MS = 60_000;
/** first poll: at least this share of the programs done = the browser cache already has them */
const WARM_SHARE = 0.8;

type Storage0 = Pick<Storage, 'getItem'>;
function store(): Storage0 | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
export function shaderCacheEnabled(s: Storage0 | null = store()): boolean {
  try {
    return s?.getItem('ct.debug.v3shcache') !== '0';
  } catch {
    return true;
  }
}

// ------------------------------------------------------------------------------------------------ record

export interface ShaderRecorder {
  /** programs linked so far (in link order, deduplicated by source) */
  list(): ProgramSource[];
  /** write the record (best effort; resolves to the stored program count, 0 on failure / nothing new) */
  save(): Promise<number>;
  /** stop recording (restores the context's methods) */
  stop(): void;
}

type GL = WebGL2RenderingContext;
type Wrapped = Pick<GL, 'shaderSource' | 'attachShader' | 'bindAttribLocation' | 'linkProgram'>;

/** Record the programs linked on `gl` (instance-level wraps; the prototype is never touched). */
export function record(gl: GL, tier: string, build: string, io: { write(key: string, r: ShaderRecord): Promise<void> } = idb): ShaderRecorder {
  const src = new WeakMap<WebGLShader, string>();
  const shaders = new WeakMap<WebGLProgram, WebGLShader[]>();
  const binds = new WeakMap<WebGLProgram, [number, string][]>();
  const out: ProgramSource[] = [];
  const seen = new Set<string>();
  let saved = 0;
  const g = gl as unknown as Record<keyof Wrapped, (...a: unknown[]) => unknown>;
  const orig = { shaderSource: g.shaderSource, attachShader: g.attachShader, bindAttribLocation: g.bindAttribLocation, linkProgram: g.linkProgram };
  let on = true;
  g.shaderSource = function (this: GL, sh: unknown, s: unknown) {
    if (on && sh && typeof s === 'string') src.set(sh as WebGLShader, s);
    return orig.shaderSource.call(this, sh, s);
  };
  g.attachShader = function (this: GL, p: unknown, sh: unknown) {
    if (on && p && sh) {
      const l = shaders.get(p as WebGLProgram) ?? [];
      l.push(sh as WebGLShader);
      shaders.set(p as WebGLProgram, l);
    }
    return orig.attachShader.call(this, p, sh);
  };
  g.bindAttribLocation = function (this: GL, p: unknown, i: unknown, n: unknown) {
    if (on && p && typeof i === 'number' && typeof n === 'string') {
      const l = binds.get(p as WebGLProgram) ?? [];
      l.push([i, n]);
      binds.set(p as WebGLProgram, l);
    }
    return orig.bindAttribLocation.call(this, p, i, n);
  };
  g.linkProgram = function (this: GL, p: unknown) {
    if (on && p && out.length < MAX_PROGRAMS) {
      try {
        const sh = shaders.get(p as WebGLProgram) ?? [];
        const ss = sh.map((s) => src.get(s));
        const vs = ss[0];
        const fs = ss[1];
        if (sh.length === 2 && typeof vs === 'string' && typeof fs === 'string' && vs.length + fs.length <= MAX_SOURCE_CHARS && !isAvatarProgram(vs, fs)) {
          const b = binds.get(p as WebGLProgram) ?? [];
          const k = `${vs.length}:${fs.length}:${hash(vs)}:${hash(fs)}:${JSON.stringify(b)}`;
          if (!seen.has(k)) {
            seen.add(k);
            out.push({ vs, fs, binds: b });
          }
        }
      } catch {
        /* recording is best effort */
      }
    }
    return orig.linkProgram.call(this, p);
  };
  return {
    list: () => out.slice(),
    async save() {
      if (out.length === 0 || out.length === saved) return 0;
      const n = out.length;
      try {
        await io.write(tier, encode(tier, build, out));
        saved = n;
        return n;
      } catch {
        return 0;
      }
    },
    stop() {
      if (!on) return;
      on = false;
      for (const k of Object.keys(orig) as (keyof Wrapped)[]) if (g[k] !== orig[k]) delete g[k]; // back to the prototype's
    },
  };
}

/**
 * (v3.5 release) avatar rig programs (the vendor look patch's `LOOK_MAX_BONES` define: rigs, the v3.4 sprite bakes) are
 * per random cast (86-89 K characters each, docs/perf-v3/shaders.md §6.1): a record keeps the TOWN's programs only, so
 * the next visit's prewarm (which the join waits for) never compiles last visit's cast.
 */
export function isAvatarProgram(vs: string, fs: string): boolean {
  return vs.includes('#define LOOK_MAX_BONES') || fs.includes('#define LOOK_MAX_BONES');
}

/** 32-bit FNV-1a (dedupe key only). */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function encode(tier: string, build: string, list: readonly ProgramSource[], now = Date.now()): ShaderRecord {
  const src: string[] = [];
  const idx = new Map<string, number>();
  const at = (s: string) => {
    let i = idx.get(s);
    if (i === undefined) {
      i = src.push(s) - 1;
      idx.set(s, i);
    }
    return i;
  };
  return { v: 1, tier, build, at: now, src, programs: list.map((p) => ({ vs: at(p.vs), fs: at(p.fs), binds: p.binds })) };
}

/** The programs of a stored record, or null when it is not a valid record of `tier` made by `build`. */
export function decode(r: unknown, tier: string, build: string): ProgramSource[] | null {
  const x = r as Partial<ShaderRecord> | null;
  if (!x || x.v !== 1 || x.tier !== tier || x.build !== build || !Array.isArray(x.src) || !Array.isArray(x.programs)) return null;
  const out: ProgramSource[] = [];
  for (const p of x.programs.slice(0, MAX_PROGRAMS)) {
    const vs = x.src[p?.vs as number];
    const fs = x.src[p?.fs as number];
    if (typeof vs !== 'string' || typeof fs !== 'string' || !Array.isArray(p.binds)) return null;
    const binds = p.binds.filter((b): b is [number, string] => Array.isArray(b) && typeof b[0] === 'number' && typeof b[1] === 'string');
    out.push({ vs, fs, binds });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ prewarm

export interface PrewarmGl {
  createShader(type: number): WebGLShader | null;
  shaderSource(s: WebGLShader, src: string): void;
  compileShader(s: WebGLShader): void;
  createProgram(): WebGLProgram | null;
  attachShader(p: WebGLProgram, s: WebGLShader): void;
  bindAttribLocation(p: WebGLProgram, i: number, n: string): void;
  linkProgram(p: WebGLProgram): void;
  getProgramParameter(p: WebGLProgram, pname: number): unknown;
  deleteShader(s: WebGLShader | null): void;
  deleteProgram(p: WebGLProgram | null): void;
  getExtension(name: string): unknown;
  isContextLost(): boolean;
  readonly VERTEX_SHADER: number;
  readonly FRAGMENT_SHADER: number;
}

let running: Promise<PrewarmResult> | null = null;

/**
 * Compile the stored programs of `tier` in a hidden context (idempotent while one runs; never rejects).
 * `gl` / `load` / `wait` / `now` are injectable for tests.
 */
export function prewarm(
  tier: string,
  opts: { build?: string; live?(): boolean; maxMs?: number; gl?: () => PrewarmGl | null; load?: (tier: string) => Promise<ProgramSource[] | null>; wait?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<PrewarmResult> {
  if (!shaderCacheEnabled()) return Promise.resolve({ mode: 'off', programs: 0, ms: 0 });
  return (running ??= run(tier, opts).finally(() => {
    running = null;
  }));
}

/**
 * Resolves when no prewarm runs (at once when none does), or after `maxMs`. The town waits for this before it issues its
 * own programs: the browser compiles programs one after the other on its GPU thread, and a context that sends ≈ 30
 * large programs while that thread is busy blocks in the send (a 3.8 s main-thread task measured), while the same
 * programs sent after the prewarm are cache hits.
 */
export function prewarmSettled(maxMs = 10_000): Promise<void> {
  const r = running;
  if (!r) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, maxMs);
    void r.finally(() => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function run(
  tier: string,
  opts: { build?: string; live?(): boolean; maxMs?: number; gl?: () => PrewarmGl | null; load?: (tier: string) => Promise<ProgramSource[] | null>; wait?: (ms: number) => Promise<void>; now?: () => number },
): Promise<PrewarmResult> {
  const now = opts.now ?? (() => performance.now());
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const live = opts.live ?? (() => true);
  const t0 = now();
  let list: ProgramSource[] | null = null;
  try {
    list = await (opts.load ?? ((t: string) => idb.read(t, opts.build ?? '')))(tier);
  } catch {
    list = null;
  }
  if (!list || list.length === 0) return { mode: 'none', programs: 0, ms: now() - t0 };
  let gl: PrewarmGl | null = null;
  const made: { p: WebGLProgram; sh: WebGLShader[] }[] = [];
  const finish = (mode: PrewarmResult['mode']): PrewarmResult => {
    if (gl) {
      try {
        for (const m of made) {
          for (const s of m.sh) gl.deleteShader(s);
          gl.deleteProgram(m.p);
        }
        (gl.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext();
      } catch {
        /* the context goes away with its canvas anyway */
      }
    }
    return { mode, programs: made.length, ms: now() - t0 };
  };
  try {
    gl = (opts.gl ?? hiddenContext)();
    if (!gl) return finish('error');
    if (!gl.getExtension('KHR_parallel_shader_compile')) return finish('no-ext');
    for (const src of list) {
      if (!live()) return finish('cancelled');
      const p = gl.createProgram();
      if (!p) break;
      const sh: WebGLShader[] = [];
      for (const [type, text] of [[gl.VERTEX_SHADER, src.vs], [gl.FRAGMENT_SHADER, src.fs]] as const) {
        const s = gl.createShader(type);
        if (!s) continue;
        gl.shaderSource(s, text);
        gl.compileShader(s);
        gl.attachShader(p, s);
        sh.push(s);
      }
      for (const [i, n] of src.binds) gl.bindAttribLocation(p, i, n);
      gl.linkProgram(p);
      made.push({ p, sh });
    }
    const max = opts.maxMs ?? PREWARM_MAX_MS;
    let first = true;
    for (;;) {
      await wait(POLL_MS);
      if (!live()) return finish('cancelled');
      if (gl.isContextLost()) return finish('error');
      let done = 0;
      for (const m of made) if (gl.getProgramParameter(m.p, COMPLETION_STATUS_KHR) === true) done++;
      if (done === made.length) return finish(first ? 'warm' : 'ready');
      if (first && done >= made.length * WARM_SHARE) return finish('warm');
      first = false;
      if (now() - t0 >= max) return finish('timeout');
    }
  } catch {
    return finish('error');
  }
}

function hiddenContext(): PrewarmGl | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  return c.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'default' }) as PrewarmGl | null;
}

// ------------------------------------------------------------------------------------------------ IndexedDB

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('indexedDB.open failed'));
    r.onblocked = () => reject(new Error('indexedDB blocked'));
  });
}

const idb = {
  async read(tier: string, build: string): Promise<ProgramSource[] | null> {
    if (typeof indexedDB === 'undefined') return null;
    const db = await openDb();
    try {
      const v = await new Promise<unknown>((resolve, reject) => {
        const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(tier);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error ?? new Error('indexedDB get failed'));
      });
      return decode(v, tier, build);
    } finally {
      db.close();
    }
  },
  async write(key: string, rec: ShaderRecord): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec, key);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('indexedDB aborted'));
        tx.onerror = () => reject(tx.error ?? new Error('indexedDB failed'));
      });
    } finally {
      db.close();
    }
  },
};
