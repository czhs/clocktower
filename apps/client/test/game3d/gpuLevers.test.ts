// v3.3 gpu: the per-frame GPU / driver levers (game3d/vendor/gpuLevers.ts) with three-only fakes (no WebGL):
// flag parsing, the program-grouped opaque sort, the light key, off-screen water passes and the reflection policy.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createProgramKeys, GPU_LEVER_DEFAULTS, installGpuLevers, lightKey, makeProgramSort, parseReflect, readGpuLevers, type VendorReflection } from '../../src/game3d/vendor/gpuLevers';

const store = (o: Record<string, string>) => ({ getItem: (k: string) => o[k] ?? null });

describe('flags', () => {
  it('defaults, overrides and junk', () => {
    expect(readGpuLevers(null)).toEqual(GPU_LEVER_DEFAULTS);
    expect(readGpuLevers(store({ 'ct.debug.v3sort': 'three', 'ct.debug.v3reflect': '15', 'ct.debug.v3reflectIdle': '4', 'ct.debug.v3waterCull': '0' }))).toEqual({ sort: 'three', reflect: 15, reflectIdleFps: 4, waterCull: false });
    expect(readGpuLevers(store({ 'ct.debug.v3sort': 'x', 'ct.debug.v3reflect': 'nope', 'ct.debug.v3reflectIdle': '-1', 'ct.debug.v3waterCull': '2' }))).toEqual(GPU_LEVER_DEFAULTS);
    expect(parseReflect('vendor', 'smart')).toBe('vendor');
    expect(parseReflect('0', 'smart')).toBe(0);
    expect(parseReflect('', 'smart')).toBe('smart');
  });
});

describe('program sort', () => {
  const toon = (key: string) => {
    const m = new THREE.MeshLambertMaterial();
    m.customProgramCacheKey = () => key;
    return m;
  };
  const item = (id: number, material: THREE.Material, z: number, object: THREE.Object3D = new THREE.Mesh(), renderOrder = 0) => ({ id, object, material, groupOrder: 0, renderOrder, z });

  it('groups materials of one program, then material, then front to back; renderOrder still wins', () => {
    const a1 = toon('A'), b = toon('B'), a2 = toon('A');
    const keys = createProgramKeys();
    const sort = makeProgramSort(keys);
    const list = [item(1, a1, 5), item(2, b, 1), item(3, a2, 2), item(4, a1, 1), item(5, b, 9, new THREE.Mesh(), -1)];
    list.sort(sort);
    // program keys are numbered in first-seen order: which program goes first is arbitrary, the grouping is not
    const ids = list.map((x) => x.id);
    expect(ids[0]).toBe(5);
    expect([[5, 4, 1, 3, 2], [5, 2, 4, 1, 3]]).toContainEqual(ids);
    expect(keys.size()).toBe(2);
  });

  it('the same material on a batched / instanced / plain object gets different keys', () => {
    const m = toon('A');
    const keys = createProgramKeys();
    const plain = keys.of(m, new THREE.Mesh());
    const inst = keys.of(m, new THREE.InstancedMesh(new THREE.BufferGeometry(), m, 1));
    expect(inst).not.toBe(plain);
    expect(keys.of(m, new THREE.Mesh())).toBe(plain);
    m.needsUpdate = true; // a rebuilt material is re-keyed (same source: same key)
    expect(keys.of(m, new THREE.Mesh())).toBe(plain);
  });
});

describe('lightKey', () => {
  it('reads colours / vectors / numbers, skips time and pass mode', () => {
    const out: number[] = [];
    const n = lightKey({ style: { sky: new THREE.Color(0.1, 0.2, 0.3) }, uniforms: { uTime: { value: 9 }, uPassMode: { value: 1 }, uSunDir: { value: new THREE.Vector3(1, 2, 3) }, uBands: { value: 3 } }, toonUniforms: { uBandThr: { value: new THREE.Vector2(0.1, 0.5) } } }, out);
    expect(out.slice(0, n)).toEqual([...new THREE.Color(0.1, 0.2, 0.3).toArray(), 1, 2, 3, 3, 0.1, 0.5]);
  });
});

// ------------------------------------------------------------------ fake engine
function fakeEngine() {
  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
  cam.position.set(0, 20, 20);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  const passes: { name: string; enabled: boolean; material?: THREE.ShaderMaterial; reflection?: VendorReflection | null }[] = [];
  const water = (name: string, cx: number, cz: number, r: number) => {
    const material = new THREE.ShaderMaterial({ uniforms: { uShapeKind: { value: 2 }, uShapeA: { value: new THREE.Vector4(cx, cz, r, r) }, uLevel: { value: 0 } } });
    const p = { name, enabled: true, material, reflection: null };
    passes.push(p);
    return p;
  };
  let setSort: unknown = undefined;
  const engine = {
    time: 0,
    renderer: { setOpaqueSort: (f: unknown) => (setSort = f) } as unknown as THREE.WebGLRenderer,
    scene: new THREE.Scene(),
    camera: { cam },
    uniforms: { uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) } } as Record<string, { value: unknown }>,
    toonUniforms: {},
    style: { sky: new THREE.Color(0.5, 0.6, 0.7) },
    pipeline: { size: new THREE.Vector2(100, 60), passes, render() {} },
  };
  return { engine, water, sort: () => setSort };
}

describe('installGpuLevers', () => {
  it('installs / removes the opaque sort with the lever', () => {
    const f = fakeEngine();
    const L = installGpuLevers(f.engine, { ...GPU_LEVER_DEFAULTS, sort: 'program' });
    expect(typeof f.sort()).toBe('function');
    L.set('sort', 'three');
    expect(f.sort()).toBeNull();
    L.set('sort', 'program');
    L.dispose();
    expect(f.sort()).toBeNull();
  });

  it('waterCull: an off-screen body is skipped for the render only; vendor-disabled passes stay off', () => {
    const f = fakeEngine();
    const near = f.water('fountain', 0, 0, 1);
    const far = f.water('well', 300, 300, 1);
    const off = f.water('bowl', 0, 0, 0.5);
    off.enabled = false; // the vendor switched it off (setFountain(false))
    const L = installGpuLevers(f.engine, { ...GPU_LEVER_DEFAULTS, waterCull: true });
    let during: boolean[] = [];
    L.render(() => (during = [near.enabled, far.enabled, off.enabled]));
    expect(during).toEqual([true, false, false]);
    expect([near.enabled, far.enabled, off.enabled]).toEqual([true, true, false]);
    expect(L.info().waterCulled).toBe(1);
    L.set('waterCull', false);
    L.render(() => (during = [near.enabled, far.enabled]));
    expect(during).toEqual([true, true]);
  });

  it('reflect smart: a still camera re-renders only at the idle rate, on a lighting change or a camera move', () => {
    const f = fakeEngine();
    let renders = 0;
    const refl: VendorReflection = { level: 0, rt: null, viewProj: new THREE.Matrix4(), crop: null, fps: 30, render: () => { renders++; refl.rt = {} as THREE.WebGLRenderTarget; } };
    f.engine.pipeline.passes.push({ name: 'river', enabled: true, reflection: refl });
    const hook = () => refl.render(f.engine);
    const L = installGpuLevers(f.engine, { ...GPU_LEVER_DEFAULTS, reflect: 'smart', reflectIdleFps: 10 });
    const frame = (t: number) => {
      f.engine.time = t;
      L.render(hook);
    };
    frame(0); // first: renders (no RT yet)
    expect(renders).toBe(1);
    for (let i = 1; i <= 5; i++) frame(i / 60); // still, < 0.1 s
    expect(renders).toBe(1);
    frame(0.11); // idle refresh
    expect(renders).toBe(2);
    frame(0.12);
    expect(renders).toBe(2);
    f.engine.style.sky.setRGB(0.1, 0.1, 0.2); // lighting step
    frame(0.13);
    expect(renders).toBe(3);
    f.engine.camera.cam.position.x += 1; // camera move: the vendor's own logic runs
    f.engine.camera.cam.updateMatrixWorld(true);
    frame(0.14);
    expect(renders).toBe(4);
    L.set('reflect', 'vendor');
    frame(0.15);
    expect(renders).toBe(5);
    expect(refl.fps).toBe(30);
    L.dispose();
    refl.render(f.engine);
    expect(renders).toBe(6);
  });
});
