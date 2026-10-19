import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { parallelEarly, parallelWarm, parallelWarmEnabled, programReady, type ProgramLike, type WarmPipeline, type WarmRenderer } from '../../src/game3d/world/shaderWarm';

const store = (v: Record<string, string>) => ({ getItem: (k: string) => v[k] ?? null });

function fake(opts: { ext?: boolean; readyAfter?: number; throwOn?: number } = {}) {
  const programs: (ProgramLike & { polls: number })[] = [];
  const calls: { obj: THREE.Object3D; target: string; mat?: string }[] = [];
  let target: THREE.WebGLRenderTarget | null = null;
  const name = (t: THREE.WebGLRenderTarget | null) => (t ? (t.texture.name || 'rt') : 'canvas');
  let n = 0;
  const r: WarmRenderer = {
    compile(obj) {
      if (opts.throwOn === n++) throw new Error('boom');
      const mesh = obj.children[0] as THREE.Mesh | undefined;
      calls.push({ obj, target: name(target), mat: mesh ? (mesh.material as THREE.Material).name : undefined });
      const p = { polls: 0, isReady() { return ++p.polls > (opts.readyAfter ?? 0); } };
      programs.push(p);
      return new Set();
    },
    getRenderTarget: () => target,
    setRenderTarget: (t) => void (target = t),
    extensions: { has: (x) => x === 'KHR_parallel_shader_compile' && opts.ext !== false },
    info: { programs },
  };
  return { r, calls, programs, target: () => target };
}

function pipeline(): WarmPipeline & { quad: { material: THREE.Material } } {
  const rt = (n: string) => { const t = new THREE.WebGLRenderTarget(4, 4); t.texture.name = n; return t; };
  const mat = (n: string) => Object.assign(new THREE.ShaderMaterial(), { name: n });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(), mat('idle'));
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  return {
    rtScene: rt('scene'),
    rtA: rt('a'),
    quad,
    quadScene,
    quadCam: new THREE.OrthographicCamera(),
    finalMat: mat('final'),
    passes: [{ enabled: true, material: mat('outline') }, { enabled: false, material: mat('off') }, { material: mat('grade') }],
  };
}

const instant = { live: () => true, wait: async () => {} };

describe('world/shaderWarm (v3.5 parallel program issue)', () => {
  it('switches default on; "0" turns them off; storage errors leave them on', () => {
    expect(parallelWarmEnabled(store({}))).toBe(true);
    expect(parallelWarmEnabled(store({ 'ct.debug.v3par': '0' }))).toBe(false);
    expect(parallelEarly(store({ 'ct.debug.v3parEarly': '0' }))).toBe(false);
    expect(parallelEarly(null)).toBe(true);
    expect(parallelWarmEnabled({ getItem: () => { throw new Error('denied'); } })).toBe(true);
  });

  it('is a no-op without KHR_parallel_shader_compile (the warm-up compiles as before)', async () => {
    const f = fake({ ext: false });
    const res = await parallelWarm(f.r, pipeline(), new THREE.Scene(), new THREE.PerspectiveCamera(), instant);
    expect(res.mode).toBe('no-ext');
    expect(f.calls).toHaveLength(0);
  });

  it('issues the scene on the colour target, each enabled pass on the ping-pong target, the upscale on the canvas', async () => {
    const f = fake();
    const p = pipeline();
    const scene = new THREE.Scene();
    const prev = new THREE.WebGLRenderTarget(2, 2);
    prev.texture.name = 'prev';
    f.r.setRenderTarget(prev);
    const res = await parallelWarm(f.r, p, scene, new THREE.PerspectiveCamera(), instant);
    expect(res.mode).toBe('ready');
    expect(f.calls.map((c) => [c.obj === scene ? 'scene' : c.mat, c.target])).toEqual([
      ['scene', 'scene'],
      ['outline', 'a'],
      ['grade', 'a'],
      ['final', 'canvas'],
    ]);
    expect(res.programs).toEqual([0, 4]);
    expect(f.target()).toBe(prev); // restored
    expect((p.quad.material as THREE.Material).name).toBe('idle'); // restored
  });

  it('polls until every program reports ready', async () => {
    const f = fake({ readyAfter: 3 });
    let waits = 0;
    const res = await parallelWarm(f.r, pipeline(), new THREE.Scene(), new THREE.PerspectiveCamera(), { live: () => true, wait: async () => void waits++ });
    expect(res.mode).toBe('ready');
    expect(waits).toBe(3);
  });

  it('stops on the deadline and on cancel', async () => {
    let t = 0;
    const f = fake({ readyAfter: 1e9 });
    const res = await parallelWarm(f.r, pipeline(), new THREE.Scene(), new THREE.PerspectiveCamera(), { live: () => true, maxMs: 100, now: () => t, wait: async (ms) => void (t += ms) });
    expect(res.mode).toBe('timeout');
    let alive = 2;
    const g = fake({ readyAfter: 1e9 });
    const res2 = await parallelWarm(g.r, pipeline(), new THREE.Scene(), new THREE.PerspectiveCamera(), { live: () => alive-- > 0, wait: async () => {} });
    expect(res2.mode).toBe('cancelled');
  });

  it('a throwing compile reports "error" and still restores the target and quad material', async () => {
    const f = fake({ throwOn: 1 });
    const p = pipeline();
    const res = await parallelWarm(f.r, p, new THREE.Scene(), new THREE.PerspectiveCamera(), instant);
    expect(res.mode).toBe('error');
    expect(f.target()).toBeNull();
    expect((p.quad.material as THREE.Material).name).toBe('idle');
  });

  it('a broken renderer double (no extensions object) resolves "no-ext" instead of throwing', async () => {
    const res = await parallelWarm({ info: { programs: null } } as unknown as WarmRenderer, {}, new THREE.Scene(), new THREE.PerspectiveCamera(), instant);
    expect(res.mode).toBe('no-ext');
  });

  it('programReady: released / stub / throwing programs count as ready', () => {
    expect(programReady(null)).toBe(true);
    expect(programReady({})).toBe(true);
    expect(programReady({ isReady: () => { throw new Error('x'); } })).toBe(true);
    expect(programReady({ isReady: () => false })).toBe(false);
  });
});
