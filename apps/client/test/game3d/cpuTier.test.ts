// v3 perf (cpu). The cpu tier's levers on a fake Engine (vendor/cpuTier.ts): pixel scale, frame cap, shadows off,
// the normal pass skipped, the outline / contact / water passes held off, point lights out of the render.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cheapenToonChunks, CPU_FPS_CAP, CPU_LIGHT_LAYER, CPU_TOON_CHUNK, CPU_TOON_MACROS, cpuPassOff, cpuPixelScale, hideLights, installCpuTier, tierFpsLimit, type CpuEngine } from '../../src/game3d/vendor/cpuTier';
import { pixelScaleFor } from '../../src/game3d/coords';

function fakeEngine() {
  const calls: string[] = [];
  let target: unknown = null;
  const rtNormal = { name: 'normal' };
  const rtScene = { name: 'scene' };
  const renderer = {
    shadowMap: { enabled: true },
    getRenderTarget: () => target,
    setRenderTarget: (t: unknown) => void (target = t),
    render: (_s: unknown, _c: unknown) => void calls.push(`render ${(target as { name?: string } | null)?.name ?? 'canvas'}`),
  };
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  const lamp = new THREE.PointLight();
  const group = new THREE.Group();
  const spot = new THREE.SpotLight();
  group.add(spot);
  scene.add(sun, lamp, group);
  const passes = ['contact', 'outline', 'river', 'water-fountain', 'water-well-0', 'grade', 'vignette'].map((name) => ({ name, enabled: true }));
  const engine = { renderer, scene, sun, pipeline: { rtNormal, rtScene, passes } } as unknown as CpuEngine & { pipeline: { rtScene: unknown } };
  return { engine, calls, renderer, scene, sun, lamp, spot, passes, rtNormal, rtScene };
}

describe('cpu tier', () => {
  it('pixel scale: ~180 internal rows, never below 2; the GPU tiers keep pixelScaleFor', () => {
    expect(cpuPixelScale(540)).toBe(3);
    expect(cpuPixelScale(720)).toBe(4);
    expect(cpuPixelScale(1080)).toBe(6);
    expect(cpuPixelScale(300)).toBe(2);
    expect(cpuPixelScale(0)).toBe(2);
    for (const h of [540, 720, 1080]) expect(cpuPixelScale(h)).toBeGreaterThan(pixelScaleFor(h, 'low'));
  });

  it('frame cap: 30 fps at cpu, none at the GPU tiers, ct.debug.fps wins', () => {
    expect(CPU_FPS_CAP).toBe(30);
    expect(tierFpsLimit('cpu', 0)).toBe(30);
    expect(tierFpsLimit('cpu', undefined)).toBe(30);
    expect(tierFpsLimit('cpu', 10)).toBe(10);
    expect(tierFpsLimit('low', 0)).toBe(0);
    expect(tierFpsLimit('high', undefined)).toBe(0);
    expect(tierFpsLimit('high', 12)).toBe(12);
  });

  it('passes off: outline, contact and the water bodies; grade and vignette stay', () => {
    expect(['contact', 'outline', 'river', 'water-fountain', 'water-fountain-bowl', 'water-well-0'].every(cpuPassOff)).toBe(true);
    expect(['grade', 'vignette', undefined].some((n) => cpuPassOff(n))).toBe(false);
  });

  it('install: shadows off, point / spot lights on the invisible layer, the normal pass skipped', () => {
    const f = fakeEngine();
    const cpu = installCpuTier(f.engine);
    expect(f.renderer.shadowMap.enabled).toBe(false);
    expect(f.sun.castShadow).toBe(false);
    expect(f.lamp.layers.mask).toBe((1 << CPU_LIGHT_LAYER) >>> 0);
    expect(f.spot.layers.mask).toBe((1 << CPU_LIGHT_LAYER) >>> 0);
    expect(f.sun.layers.mask).toBe(1); // the sun stays lit
    const cam = new THREE.PerspectiveCamera();
    expect(f.lamp.layers.test(cam.layers)).toBe(false);
    for (const t of [f.rtScene, f.rtNormal, null]) {
      f.renderer.setRenderTarget(t);
      f.renderer.render(f.scene, cam);
    }
    expect(f.calls).toEqual(['render scene', 'render canvas']);
    expect(cpu.info().normalSkipped).toBe(1);
    cpu.dispose();
    f.renderer.setRenderTarget(f.rtNormal);
    f.renderer.render(f.scene, cam);
    expect(f.calls.at(-1)).toBe('render normal');
  });

  it('beforeRender re-asserts what the vendor flips back and picks up lights added later', () => {
    const f = fakeEngine();
    const cpu = installCpuTier(f.engine);
    cpu.beforeRender();
    expect(f.passes.filter((p) => p.enabled).map((p) => p.name)).toEqual(['grade', 'vignette']);
    // a water vis() updater turns its pass back on; the time facade re-enables the sun's shadow
    f.passes[3]!.enabled = true;
    f.sun.castShadow = true;
    f.renderer.shadowMap.enabled = true;
    const late = new THREE.PointLight();
    f.scene.add(late);
    for (let i = 0; i < 60; i++) cpu.beforeRender();
    expect(f.passes[3]!.enabled).toBe(false);
    expect(f.sun.castShadow).toBe(false);
    expect(f.renderer.shadowMap.enabled).toBe(false);
    expect(late.layers.mask).toBe((1 << CPU_LIGHT_LAYER) >>> 0);
    expect(cpu.info()).toMatchObject({ lightsHidden: 3, passesOff: 5 });
    cpu.dispose();
  });

  it('cheap toon: the macros land in the fragment chunk once, and the restore puts it back', () => {
    const chunks: Record<string, string> = { [CPU_TOON_CHUNK]: '#ifdef CLIP\n#endif' };
    const undo = cheapenToonChunks(chunks);
    expect(chunks[CPU_TOON_CHUNK]).toContain('#define cloudAtten(p) 1.0');
    expect(chunks[CPU_TOON_CHUNK]).toContain('#define uNormalNoise 0.0');
    const undo2 = cheapenToonChunks(chunks);
    expect(chunks[CPU_TOON_CHUNK]!.split(CPU_TOON_MACROS).length).toBe(2);
    undo2();
    undo();
    expect(chunks[CPU_TOON_CHUNK]).toBe('#ifdef CLIP\n#endif');
    // the real three chunk: installed and removed with the engine
    const f = fakeEngine();
    const cpu = installCpuTier(f.engine);
    expect((THREE.ShaderChunk as unknown as Record<string, string>)[CPU_TOON_CHUNK]).toContain(CPU_TOON_MACROS);
    cpu.dispose();
    expect((THREE.ShaderChunk as unknown as Record<string, string>)[CPU_TOON_CHUNK]).not.toContain(CPU_TOON_MACROS);
  });

  it('hideLights counts each light once', () => {
    const s = new THREE.Scene();
    s.add(new THREE.PointLight(), new THREE.PointLight(), new THREE.AmbientLight());
    const seen = new Set<THREE.Light>();
    expect(hideLights(s, seen)).toBe(2);
    expect(hideLights(s, seen)).toBe(0);
  });
});
