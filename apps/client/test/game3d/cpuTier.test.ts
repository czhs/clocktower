// v3 perf (cpu). The cpu tier's levers on a fake Engine (vendor/cpuTier.ts): pixel scale, frame cap, shadows off,
// the normal pass skipped, the outline / contact / water passes held off, point lights out of the render.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cheapToonMaterial, toonHooksOf, twinPick, CPU_GROUND_SHADE, CPU_TWIN_KIT_SHADE, cheapKitMaterial, CPU_KIT_PAT_SHADE, CPU_KIT_SHADE, CPU_KIT_SWAP, swapKit, toonUniformsOf, cheapenToonChunks, CPU_REWRITES, CPU_SHADE_DEFAULT, cpuShadeFrom, hookShaderSource, rewriteCpuShader, swapFn, CPU_FPS_CAP, CPU_LIGHT_LAYER, CPU_TOON_CHUNK, CPU_TOON_MACROS, cpuPassOff, cpuPixelScale, hideLights, installCpuTier, tierFpsLimit, type CpuEngine } from '../../src/game3d/vendor/cpuTier';
import { pixelScaleFor } from '../../src/game3d/coords';
// @ts-expect-error vendor JS (no types)
import { kitMaterial } from '@pixel3d/town/kit.js';
// @ts-expect-error vendor JS (no types)
import { patchCutMaterial } from '@pixel3d/town/cutaway.js';

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
    const grass = new THREE.Mesh();
    grass.name = 'grass';
    const ground = new THREE.Mesh();
    ground.name = 'ground-grass-area';
    f.scene.add(grass, ground);
    for (let i = 0; i < 60; i++) cpu.beforeRender();
    expect(f.passes[3]!.enabled).toBe(false);
    expect(f.sun.castShadow).toBe(false);
    expect(f.renderer.shadowMap.enabled).toBe(false);
    expect(late.layers.mask).toBe((1 << CPU_LIGHT_LAYER) >>> 0);
    expect(grass.visible).toBe(false);
    expect(ground.visible).toBe(true);
    grass.visible = true; // a vendor updater shows it again: hidden again before the next render
    cpu.beforeRender();
    expect(grass.visible).toBe(false);
    expect(cpu.info()).toMatchObject({ lightsHidden: 3, meshesHidden: 1, passesOff: 5 });
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

  // ------------------------------------------------------------------ v3.1: program rewrites
  const V = fileURLToPath(new URL('../../../../v3/pixel3d/src/', import.meta.url));
  const vendor = (f: string) => readFileSync(V + f, 'utf8');

  it('swapFn renames the vendor function and inserts the cheap one right after its body', () => {
    const src = 'float a() { return 1.0; }\nfloat f(float x) { if (x > 0.0) { return a(); } return 0.0; }\nfloat g() { return f(2.0); }\nvoid main() { f(1.0); }';
    const out = swapFn(src, 'f', 'float f(float x) {', 'float f(float x) { return x; }');
    expect(out).toContain('float fFull(float x) { if (x > 0.0) { return a(); } return 0.0; }\nfloat f(float x) { return x; }\nfloat g()');
    expect(swapFn(src, 'h', 'float h() {', 'x')).toBe(src);
    expect(swapFn('float f(float x) { {', 'f', 'float f(float x) {', 'x')).toBe('float f(float x) { {');
  });

  it('every rewrite still finds its anchor in the vendor source (a re-publish that moves one shows here)', () => {
    const ground = vendor('town/pieces/ground.js');
    const texts: Record<string, string> = { flight: ground, xGroundFlat: ground, xKitFlat: vendor('town/kit.js'), xToonMid: vendor('materials/toon.js') };
    for (const r of CPU_REWRITES) {
      const t = texts[r.name]!;
      expect(r.apply(t), r.name).not.toBe(t);
    }
    const g = rewriteCpuShader(ground, new Set(['flight']));
    expect(g).toContain('uniform float uCamFlight;\n#define uCamFlight 0.0');
    expect(rewriteCpuShader(g, new Set(['flight']))).toBe(g); // once
    expect(rewriteCpuShader(vendor('town/kit.js'), new Set(['xKitFlat']))).toContain('float kitPatternFull(vec3 p');
  });

  it('the kit swap still matches the vendor kit (names, tone attributes, the glass glow attribute)', () => {
    const kit = vendor('town/kit.js');
    expect(kit).toContain('mat.name = `town-kit-${layer}`;');
    for (const l of ['solid', 'glass']) expect(CPU_KIT_SWAP.test(`town-kit-${l}`)).toBe(true);
    expect(CPU_KIT_SWAP.test('town-kit-soft')).toBe(false); // the canopy fade patches the soft layer
    expect(kit).toContain('toneAttributes: true, flatShading: true');
    expect(kit).toContain('attribute vec4 aGlow;');
    expect(kit).toMatch(/geometry\.index \? geometry\.toNonIndexed\(\) : geometry/); // one normal per face: per-vertex bands are exact
  });

  it('shade set: default = flight + the kit swap, none, a filtered list; text without anchors is untouched', () => {
    expect([...cpuShadeFrom(null)]).toEqual([...CPU_SHADE_DEFAULT]);
    expect(CPU_SHADE_DEFAULT).toEqual(['flight']);
    expect([...cpuShadeFrom('')]).toEqual([...CPU_SHADE_DEFAULT]);
    expect(cpuShadeFrom('none').size).toBe(0);
    expect([...cpuShadeFrom('flight, bogus,kitBasic')]).toEqual(['flight', 'kitBasic']);
    expect([...cpuShadeFrom('kitBasic,kitVtx')]).toEqual(['kitBasic', 'kitVtx']);
    const plain = 'uniform vec3 diffuse;\nvoid main() { gl_FragColor = vec4(diffuse, 1.0); }';
    expect(rewriteCpuShader(plain, cpuShadeFrom(null))).toBe(plain);
    expect(CPU_SHADE_DEFAULT.some((n) => n.startsWith('x'))).toBe(false); // diagnostics never ship by default
  });

  it('hookShaderSource rewrites only on this context, reads the live set, and restores the prototype method', () => {
    const seen: string[] = [];
    class FakeGl {
      shaderSource(_s: unknown, src: string) {
        seen.push(src);
      }
    }
    const gl = new FakeGl();
    const other = new FakeGl();
    const shade = new Set<string>(['flight']);
    const h = hookShaderSource(gl, shade);
    gl.shaderSource(null, 'uniform float uCamFlight;\nvoid main() {}');
    other.shaderSource(null, 'uniform float uCamFlight;\nvoid main() {}');
    shade.clear();
    gl.shaderSource(null, 'uniform float uCamFlight;\nvoid main() {}');
    expect(seen[0]).toContain('#define uCamFlight 0.0');
    expect(seen[1]).not.toContain('#define');
    expect(seen[2]).not.toContain('#define');
    expect(h.changed()).toBe(1);
    h.restore();
    expect(Object.prototype.hasOwnProperty.call(gl, 'shaderSource')).toBe(false);
  });

  it('install hooks the renderer context and dispose unhooks it', () => {
    const f = fakeEngine();
    const gl = { shaderSource: (_s: unknown, _src: string) => undefined };
    const orig = gl.shaderSource;
    (f.renderer as unknown as { getContext: () => unknown }).getContext = () => gl;
    const cpu = installCpuTier(f.engine);
    expect(gl.shaderSource).not.toBe(orig);
    expect(cpu.info().shade).toEqual([...CPU_SHADE_DEFAULT]);
    cpu.dispose();
    expect(gl.shaderSource).toBe(orig);
  });

  it('cheap kit: shares the vendor uniforms, keeps blending and the glass glow; swapKit swaps solid / glass only and restores', () => {
    const engine = {
      uniforms: { uPassMode: { value: 0 }, uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() }, uCameraPos: { value: new THREE.Vector3() }, uTexelWorld: { value: 0.02 } },
      toonUniforms: {} as Record<string, { value: unknown }>,
      params: null,
    };
    const solid = kitMaterial(engine, 'solid') as THREE.Material;
    const glass = kitMaterial(engine, 'glass') as THREE.Material;
    const soft = kitMaterial(engine, 'soft') as THREE.Material;
    const u = toonUniformsOf(glass);
    expect(u.uKitGlow).toBeDefined();
    expect(u.uRampHi).toBe(engine.toonUniforms.uRampHi);
    expect(u.uSunDir).toBe(engine.uniforms.uSunDir);
    const cg = cheapKitMaterial(glass);
    expect(cg.defines).toHaveProperty('CT_KIT_GLASS');
    expect(cg.blending).toBe(glass.blending);
    expect(cg.blendDst).toBe(glass.blendDst);
    const lib = THREE.ShaderLib.basic;
    const sh = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
    (cg.onBeforeCompile as (s: unknown, r: unknown) => void)(sh, null);
    expect(sh.uniforms.uKitGlow).toBe(u.uKitGlow);
    expect(sh.uniforms.uRampSh).toBe(engine.toonUniforms.uRampSh);
    expect(sh.vertexShader).toContain('vCtK = ctW.z');
    expect(sh.vertexShader).toContain('attribute vec3 toneHi;');
    expect(sh.fragmentShader).toContain('diffuseColor.rgb *= vCtK;');
    expect(sh.fragmentShader).toContain('outgoingLight += ctEmit;');
    expect(cheapKitMaterial(solid).defines).not.toHaveProperty('CT_KIT_GLASS');
    // with the vendor patterns: the captured kit head (kitPattern, its varyings) and every vendor uniform bound
    const cp = cheapKitMaterial(glass, true);
    expect(cp.defines).toHaveProperty('CT_KIT_PAT');
    expect(cp.customProgramCacheKey()).toBe('ct-cpu-kit-glass-pat');
    const sp = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
    (cp.onBeforeCompile as (s: unknown, r: unknown) => void)(sp, null);
    expect(sp.fragmentShader).toContain('float kitPattern(');
    expect(sp.fragmentShader).toContain('diffuseColor.rgb *= kitPattern(vToonWorld');
    expect(sp.fragmentShader.match(/uniform vec4 uToneShape/g)).toHaveLength(1); // declared once (by the vendor head)
    expect(sp.vertexShader).toContain('attribute vec2 aPat;');
    expect(sp.uniforms.uTime).toBe(engine.uniforms.uTime);

    const scene = new THREE.Scene();
    const g = new THREE.BufferGeometry();
    const [a, b, c] = [solid, glass, soft].map((m) => new THREE.Mesh(g, m));
    scene.add(a!, b!, c!);
    const swapped = new Map<THREE.Mesh, THREE.Material>();
    const cache = new Map<THREE.Material, THREE.Material>();
    expect(swapKit(scene, true, swapped, cache)).toBe(2);
    expect((a!.material as THREE.Material).name).toBe('town-kit-solid-cpu');
    expect((b!.material as THREE.Material).name).toBe('town-kit-glass-cpu');
    expect(c!.material).toBe(soft);
    expect(swapKit(scene, true, swapped, cache)).toBe(0); // already swapped: nothing new, the cache is reused
    expect(cache.size).toBe(2);
    expect(swapKit(scene, false, swapped, cache)).toBe(2);
    expect(a!.material).toBe(solid);
    expect(b!.material).toBe(glass);
  });

  it('install: the kit swap follows the shade set and dispose puts the vendor materials back', () => {
    const f = fakeEngine();
    const engine = { uniforms: { uSunDir: { value: new THREE.Vector3(0, 1, 0) } }, toonUniforms: {}, params: null };
    const solid = kitMaterial(engine, 'solid') as THREE.Material;
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), solid);
    f.scene.add(mesh);
    const cpu = installCpuTier(f.engine);
    cpu.beforeRender();
    expect(mesh.material).toBe(solid); // the twins are opt-in
    (f.engine as unknown as { __ctCpuShade: Set<string> }).__ctCpuShade.add(CPU_KIT_SHADE);
    cpu.beforeRender();
    expect((mesh.material as THREE.Material).name).toBe('town-kit-solid-cpu');
    expect(cpu.info().kitSwapped).toBe(1);
    const shade = (f.engine as unknown as { __ctCpuShade: Set<string> }).__ctCpuShade;
    shade.delete(CPU_KIT_SHADE);
    cpu.beforeRender();
    expect(mesh.material).toBe(solid);
    shade.add(CPU_KIT_SHADE);
    cpu.beforeRender();
    expect(mesh.material).not.toBe(solid);
    shade.add(CPU_KIT_PAT_SHADE).add('kitVtx'); // the per-vertex kit with patterns: rebuilt with the vendor head
    cpu.beforeRender();
    expect((mesh.material as THREE.Material).userData.ctCpuPat).toBe(true);
    cpu.dispose();
    expect(mesh.material).toBe(solid);
  });

  it('toon twin: captures the vendor hooks and re-hosts them on MeshBasic with the band per pixel', () => {
    const engine = { uniforms: { uPassMode: { value: 0 }, uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uCameraPos: { value: new THREE.Vector3() }, uTexelWorld: { value: 0.02 } }, toonUniforms: {}, params: null };
    const glass = kitMaterial(engine, 'glass') as THREE.Material;
    const h = toonHooksOf(glass)!;
    expect(h).not.toBeNull();
    expect(h.vHead).toContain('attribute vec2 aPat;');
    expect(h.vBegin).toContain('vKitPat = aPat;');
    expect(h.vProject).toContain('vToonWorld = (modelMatrix * tw).xyz;');
    expect(h.fHead).toContain('float kitPattern(');
    expect(h.fColor).toContain('kitPattern(vToonWorld');
    const t = cheapToonMaterial(glass)!;
    expect(t.defines).toHaveProperty('TOON_TONE_ATTR');
    expect(t.blending).toBe(glass.blending);
    const lib = THREE.ShaderLib.basic;
    const sh = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
    (t.onBeforeCompile as (s: unknown, r: unknown) => void)(sh, null);
    expect(sh.uniforms.uSunDir).toBe(engine.uniforms.uSunDir);
    expect(sh.vertexShader).toContain('vCtWN = normalize(mat3(modelMatrix) * ctOn);');
    expect(sh.vertexShader.indexOf('vKitPat = aPat;')).toBeGreaterThan(sh.vertexShader.indexOf('#include <begin_vertex>'));
    expect(sh.fragmentShader).toContain('vec3 totalEmissiveRadiance = vec3(0.0);');
    expect(sh.fragmentShader).toContain('bandWeights(toonLit, vToonCut)');
    expect(sh.fragmentShader).not.toContain('directionalLights');
    // the vendor cut-away wrapper (town/cutaway.js) rides along: its attributes, the discard at main() and the rim
    const engine2 = { ...engine, toonUniforms: {} };
    const solid = kitMaterial(engine2, 'solid') as THREE.Material;
    expect(patchCutMaterial(engine2, solid)).toBe(true);
    const hc = toonHooksOf(solid)!;
    expect(hc.vPre).toContain('attribute vec4 aTownPart;');
    expect(hc.vProject).toContain('aTownPart.xyz');
    expect(hc.fMain).toContain('discard');
    expect(hc.fOpaque).toContain('townCutRim');
    const tc = cheapToonMaterial(solid)!;
    const shc = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
    (tc.onBeforeCompile as (s: unknown, r: unknown) => void)(shc, null);
    expect(shc.vertexShader.indexOf('attribute vec4 aTownPart;')).toBeLessThan(shc.vertexShader.indexOf('void main() {'));
    expect(shc.fragmentShader).toContain('if (townDiscard(vToonLightPos)) discard;');
    expect(shc.fragmentShader).toContain('townCutRim(vToonWorld');
    expect(shc.uniforms.uCutOn).toBeDefined();
    // a material that is not a vendor toon: no twin
    expect(cheapToonMaterial(new THREE.MeshLambertMaterial())).toBeNull();
  });

  it('twinPick: the kit by material name, the ground by mesh name, each behind its shade name', () => {
    const kitM = { name: 'town-kit-solid' } as THREE.Material;
    const softM = { name: 'town-kit-soft' } as THREE.Material;
    const gM = { name: '' } as THREE.Material;
    const ground = { name: 'ground-terrain' } as THREE.Mesh;
    const house = { name: 'house-1' } as THREE.Mesh;
    const pick = (names: string[]) => twinPick(new Set(names));
    expect(pick([CPU_KIT_SHADE])(house, kitM)).toBe('twin');
    expect(pick([CPU_KIT_SHADE, 'kitVtx'])(house, kitM)).toBe('kit');
    expect(pick([CPU_KIT_SHADE, 'kitVtx', CPU_KIT_PAT_SHADE])(house, kitM)).toBe('kitPat');
    expect(pick([CPU_KIT_SHADE, CPU_TWIN_KIT_SHADE])(house, kitM)).toBe('twin');
    expect(pick([CPU_KIT_SHADE])(house, softM)).toBeNull();
    expect(pick([CPU_KIT_SHADE])(ground, gM)).toBeNull();
    expect(pick([CPU_GROUND_SHADE])(ground, gM)).toBe('twin');
    expect(pick([CPU_GROUND_SHADE])(house, kitM)).toBeNull();
  });
});
