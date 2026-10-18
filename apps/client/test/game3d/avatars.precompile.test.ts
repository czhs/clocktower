import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { canPrecompile, materialReady, precompile, PRECOMPILE_POLL_MS, type CompileRendererLike } from '../../src/game3d/avatars/precompile';

/** A renderer double with three's WebGLProperties semantics: `get` creates an empty stub for an unknown object. */
function fakeRenderer(mats: THREE.Material[]) {
  const props = new WeakMap<object, { currentProgram?: { isReady(): boolean } }>();
  const ready = new Map<object, boolean>();
  let polls = 0;
  const r: CompileRendererLike & { polls(): number; dispose(m: THREE.Material): void; ready(m: THREE.Material): void } = {
    compile: () => {
      for (const m of mats) {
        ready.set(m, false);
        props.set(m, {
          currentProgram: {
            isReady: () => {
              polls++;
              return ready.get(m) === true;
            },
          },
        });
      }
      return new Set(mats);
    },
    properties: {
      has: (o) => props.has(o),
      get: (o) => {
        let v = props.get(o);
        if (!v) props.set(o, (v = {}));
        return v;
      },
    },
    polls: () => polls,
    dispose: (m) => void props.delete(m), // three: material 'dispose' -> properties.remove(material)
    ready: (m) => void ready.set(m, true),
  };
  return r;
}

describe('avatars precompile (guarded compileAsync replacement)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const cam = new THREE.PerspectiveCamera();
  const scene = new THREE.Scene();
  const root = new THREE.Group();

  it('resolves ready once every program reports ready', async () => {
    const a = new THREE.MeshBasicMaterial();
    const b = new THREE.MeshBasicMaterial();
    const r = fakeRenderer([a, b]);
    let t = 0;
    const p = precompile(r, [root], cam, scene, { live: () => true, maxMs: 1000, now: () => t });
    r.ready(a);
    t += PRECOMPILE_POLL_MS;
    await vi.advanceTimersByTimeAsync(PRECOMPILE_POLL_MS);
    r.ready(b);
    t += PRECOMPILE_POLL_MS;
    await vi.advanceTimersByTimeAsync(PRECOMPILE_POLL_MS);
    await expect(p).resolves.toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a material disposed mid-poll counts as done instead of throwing (the v3.0 "reading \'isReady\'" page error)', async () => {
    const a = new THREE.MeshBasicMaterial();
    const r = fakeRenderer([a]);
    const p = precompile(r, [root], cam, scene, { live: () => true, maxMs: 1000 });
    r.dispose(a); // three's compileAsync would now read `properties.get(a).currentProgram.isReady` -> TypeError
    expect(() => vi.advanceTimersByTime(PRECOMPILE_POLL_MS)).not.toThrow();
    await expect(p).resolves.toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a stub without a program (no `has`) is also done', () => {
    const r = fakeRenderer([]);
    const bare: CompileRendererLike = { compile: r.compile, properties: { get: () => ({}) } };
    expect(materialReady(bare, {})).toBe(true);
    const throwing: CompileRendererLike = { compile: r.compile, properties: { get: () => ({ currentProgram: { isReady: () => { throw new Error('lost'); } } }) } };
    expect(materialReady(throwing, {})).toBe(true);
  });

  it('stops polling when cancelled (body dropped / layer destroyed)', async () => {
    const a = new THREE.MeshBasicMaterial();
    const r = fakeRenderer([a]);
    let live = true;
    const p = precompile(r, [root], cam, scene, { live: () => live, maxMs: 1000 });
    await vi.advanceTimersByTimeAsync(PRECOMPILE_POLL_MS * 3);
    live = false;
    await vi.advanceTimersByTimeAsync(PRECOMPILE_POLL_MS);
    await expect(p).resolves.toBe('cancelled');
    const n = r.polls();
    await vi.advanceTimersByTimeAsync(PRECOMPILE_POLL_MS * 10);
    expect(r.polls()).toBe(n);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops polling at the deadline (no timer outlives the pre-warm)', async () => {
    const a = new THREE.MeshBasicMaterial();
    const r = fakeRenderer([a]);
    let t = 0;
    const p = precompile(r, [root], cam, scene, { live: () => true, maxMs: 50, now: () => t });
    for (let i = 0; i < 6; i++) {
      t += PRECOMPILE_POLL_MS;
      await vi.advanceTimersByTimeAsync(PRECOMPILE_POLL_MS);
    }
    await expect(p).resolves.toBe('timeout');
    expect(vi.getTimerCount()).toBe(0);
    r.dispose(a);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });

  it('canPrecompile needs compile() + properties.get()', () => {
    expect(canPrecompile(null)).toBe(false);
    expect(canPrecompile({ compileAsync() {} })).toBe(false);
    expect(canPrecompile(fakeRenderer([]))).toBe(true);
  });
});
