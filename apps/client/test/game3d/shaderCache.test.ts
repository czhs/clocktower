import { describe, expect, it } from 'vitest';
import { decode, encode, hash, isAvatarProgram, prewarm, prewarmSettled, record, shaderCacheEnabled, type PrewarmGl, type ProgramSource } from '../../src/game3d/shaderCache';

/** A WebGL2 double: shaders / programs are plain objects; only the methods the recorder wraps do anything. */
class FakeGl {
  calls: string[] = [];
  shaderSource(_s: object, _src: string) { this.calls.push('src'); }
  attachShader(_p: object, _s: object) { this.calls.push('attach'); }
  bindAttribLocation(_p: object, _i: number, _n: string) { this.calls.push('bind'); }
  linkProgram(_p: object) { this.calls.push('link'); }
}

function link(gl: FakeGl, vs: string, fs: string, binds: [number, string][] = []) {
  const g = gl as unknown as WebGL2RenderingContext;
  const p = {} as WebGLProgram;
  const a = {} as WebGLShader;
  const b = {} as WebGLShader;
  g.shaderSource(a, vs);
  g.shaderSource(b, fs);
  g.attachShader(p, a);
  g.attachShader(p, b);
  for (const [i, n] of binds) g.bindAttribLocation(p, i, n);
  g.linkProgram(p);
}

/** A prewarm context double: COMPLETION_STATUS_KHR turns true after `readyAfter` polls (per program). */
function fakePrewarmGl(opts: { ext?: boolean; readyAfter?: number[] } = {}) {
  let n = 0;
  const progs: { id: number; polls: number }[] = [];
  const log = { compiled: 0, linked: 0, deleted: 0, lost: false, binds: [] as [number, string][] };
  const gl: PrewarmGl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    createShader: () => ({}) as WebGLShader,
    shaderSource: () => {},
    compileShader: () => void log.compiled++,
    createProgram: () => {
      const p = { id: n++, polls: 0 };
      progs.push(p);
      return p as unknown as WebGLProgram;
    },
    attachShader: () => {},
    bindAttribLocation: (_p, i, name) => void log.binds.push([i, name]),
    linkProgram: () => void log.linked++,
    getProgramParameter: (p) => {
      const x = p as unknown as { id: number; polls: number };
      x.polls++;
      return x.polls > (opts.readyAfter?.[x.id] ?? 0);
    },
    deleteShader: () => void log.deleted++,
    deleteProgram: () => void log.deleted++,
    getExtension: (name) => (name === 'KHR_parallel_shader_compile' ? (opts.ext === false ? null : {}) : name === 'WEBGL_lose_context' ? { loseContext: () => void (log.lost = true) } : null),
    isContextLost: () => false,
  };
  return { gl, log };
}

const SRC: ProgramSource[] = [
  { vs: 'v0', fs: 'f0', binds: [[0, 'position']] },
  { vs: 'v0', fs: 'f1', binds: [] },
  { vs: 'v2', fs: 'f2', binds: [] },
];
const instant = { wait: async () => {} };

describe('game3d/shaderCache (v3.5 shaders)', () => {
  it('switch: on unless ct.debug.v3shcache = "0"', () => {
    expect(shaderCacheEnabled({ getItem: () => null })).toBe(true);
    expect(shaderCacheEnabled({ getItem: () => '0' })).toBe(false);
    expect(shaderCacheEnabled({ getItem: () => { throw new Error('denied'); } })).toBe(true);
  });

  it('records linked programs once each (source + attribute bindings), passes every call through, stop() restores', async () => {
    const gl = new FakeGl();
    const writes: unknown[] = [];
    const rec = record(gl as unknown as WebGL2RenderingContext, 'low', 'b1', { write: async (_k, r) => void writes.push(r) });
    link(gl, 'v0', 'f0', [[0, 'position']]);
    link(gl, 'v0', 'f0', [[0, 'position']]); // same program again (another material): not recorded twice
    link(gl, 'v0', 'f1');
    expect(rec.list()).toEqual([{ vs: 'v0', fs: 'f0', binds: [[0, 'position']] }, { vs: 'v0', fs: 'f1', binds: [] }]);
    expect(gl.calls.filter((c) => c === 'link')).toHaveLength(3);
    expect(await rec.save()).toBe(2);
    expect(await rec.save()).toBe(0); // nothing new
    expect(decode(writes[0], 'low', 'b1')).toEqual(rec.list());
    expect(decode(writes[0], 'low', 'b2')).toBeNull(); // another build's record is never replayed
    rec.stop();
    expect(Object.prototype.hasOwnProperty.call(gl, 'linkProgram')).toBe(false); // back to the prototype method
    link(gl, 'v9', 'f9');
    expect(rec.list()).toHaveLength(2);
  });

  it('never records avatar rig programs (per random cast): town programs only', async () => {
    const gl = new FakeGl();
    const writes: { programs: unknown[] }[] = [];
    const rec = record(gl as unknown as WebGL2RenderingContext, 'low', 'b1', { write: async (_k, r) => void writes.push(r as unknown as { programs: unknown[] }) });
    link(gl, '#define TOON_TONE_ATTR\nvoid main(){}', 'f-town');
    link(gl, '#define LOOK_MAX_BONES 24\nvoid main(){}', '#define LOOK_MAX_BONES 24\nf-avatar');
    expect(rec.list().map((p) => p.fs)).toEqual(['f-town']);
    expect(isAvatarProgram('a', '#define LOOK_MAX_BONES 8')).toBe(true);
    expect(isAvatarProgram('#define TOON_TONE_ATTR', 'f')).toBe(false);
    expect(await rec.save()).toBe(1);
    expect(gl.calls.filter((c) => c === 'link').length).toBe(2);
    rec.stop();
  });

  it('a failing store resolves 0 (best effort)', async () => {
    const gl = new FakeGl();
    const rec = record(gl as unknown as WebGL2RenderingContext, 'low', 'b1', { write: async () => { throw new Error('quota'); } });
    link(gl, 'a', 'b');
    expect(await rec.save()).toBe(0);
  });

  it('encode dedupes sources; decode rejects another tier, another build or a broken record', () => {
    const r = encode('high', 'b', SRC, 1);
    expect(r.src).toEqual(['v0', 'f0', 'f1', 'v2', 'f2']);
    expect(decode(r, 'high', 'b')).toEqual(SRC);
    expect(decode(r, 'low', 'b')).toBeNull();
    expect(decode(r, 'high', 'other')).toBeNull();
    expect(decode({ ...r, programs: [{ vs: 99, fs: 0, binds: [] }] }, 'high', 'b')).toBeNull();
    expect(decode(null, 'high', 'b')).toBeNull();
    expect(hash('abc')).toBe(hash('abc'));
    expect(hash('abc')).not.toBe(hash('abd'));
  });

  it('prewarm: compiles every stored program in the hidden context, polls until linked, then frees it', async () => {
    const { gl, log } = fakePrewarmGl({ readyAfter: [3, 1, 2] });
    const res = await prewarm('low', { ...instant, gl: () => gl, load: async () => SRC });
    expect(res.mode).toBe('ready');
    expect(res.programs).toBe(3);
    expect(log.compiled).toBe(6);
    expect(log.linked).toBe(3);
    expect(log.binds).toEqual([[0, 'position']]);
    expect(log.deleted).toBe(9); // 6 shaders + 3 programs
    expect(log.lost).toBe(true);
  });

  it('prewarm: most programs ready at the first poll = the browser cache is warm: stop at once', async () => {
    const { gl } = fakePrewarmGl({ readyAfter: [0, 0, 0, 0, 5] });
    const res = await prewarm('low', { ...instant, gl: () => gl, load: async () => [...SRC, SRC[0]!, SRC[1]!] });
    expect(res.mode).toBe('warm');
  });

  it('prewarm: no record, no extension (never a blocking compile), timeout, cancel', async () => {
    expect((await prewarm('low', { ...instant, load: async () => null })).mode).toBe('none');
    const a = fakePrewarmGl({ ext: false });
    const r1 = await prewarm('low', { ...instant, gl: () => a.gl, load: async () => SRC });
    expect(r1.mode).toBe('no-ext');
    expect(a.log.linked).toBe(0);
    let t = 0;
    const b = fakePrewarmGl({ readyAfter: [1e9, 1e9, 1e9] });
    const r2 = await prewarm('low', { gl: () => b.gl, load: async () => SRC, maxMs: 200, now: () => t, wait: async (ms) => void (t += ms) });
    expect(r2.mode).toBe('timeout');
    expect(b.log.lost).toBe(true);
    let alive = true;
    const c = fakePrewarmGl({ readyAfter: [1e9, 1e9, 1e9] });
    const r3 = await prewarm('low', { gl: () => c.gl, load: async () => SRC, live: () => alive, wait: async () => void (alive = false) });
    expect(r3.mode).toBe('cancelled');
  });

  it('prewarmSettled: at once when idle; after the running prewarm otherwise', async () => {
    await prewarmSettled(); // idle: resolves
    const { gl } = fakePrewarmGl({ readyAfter: [2, 2, 2] });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const order: string[] = [];
    const p = prewarm('low', { gl: () => gl, load: async () => SRC, wait: async () => { await gate; } }).then(() => order.push('prewarm'));
    const s = prewarmSettled().then(() => order.push('settled'));
    release();
    await Promise.all([p, s]);
    expect(order).toEqual(['prewarm', 'settled']);
  });

  it('prewarm: one run at a time (a second call joins the running one)', async () => {
    const { gl } = fakePrewarmGl({ readyAfter: [1, 1, 1] });
    let loads = 0;
    const o = { ...instant, gl: () => gl, load: async () => (loads++, SRC) };
    const [x, y] = await Promise.all([prewarm('low', o), prewarm('low', o)]);
    expect(x).toBe(y);
    expect(loads).toBe(1);
  });
});
