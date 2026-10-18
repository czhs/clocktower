// v3 WP3 (v3-stage). Canopy fade (lead decision D1): geometry of the per-fragment test (CPU twin of the shader),
// the uniform driver (slots, easing, camera basis) and the material patch (chaining, program cache key, idempotent).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraBasis, CANOPY_FADE_MS, CANOPY_GLSL_HEAD, CANOPY_SHAPE, CANOPY_SLOTS, canopyFadeAt, createCanopyFade, createCanopyUniforms, patchCanopyMaterial } from '../../src/game3d/world/canopy';

const PITCH = Math.PI / 6;
const basis = cameraBasis(0, PITCH);
const avatar = { X: 20, Y: 0, Z: 30, w: 1 };
/** A point `back` m from P toward the camera (along -F). */
const towardCamera = (p: { x: number; y: number; z: number }, back: number) => ({ x: p.x - basis.F.x * back, y: p.y - basis.F.y * back, z: p.z - basis.F.z * back });

describe('camera basis', () => {
  it('yaw 0, pitch 30°: forward looks north and down, right = +X, up = R x F (the vendor cut-away basis)', () => {
    expect(basis.F.x).toBeCloseTo(0, 9);
    expect(basis.F.y).toBeCloseTo(-0.5, 9);
    expect(basis.F.z).toBeCloseTo(-Math.sqrt(3) / 2, 9);
    expect(basis.R).toEqual({ x: 1, y: 0, z: -0 });
    expect(basis.U.x).toBeCloseTo(0, 9);
    expect(basis.U.y).toBeCloseTo(Math.sqrt(3) / 2, 9);
    expect(basis.U.z).toBeCloseTo(-0.5, 9);
    const b = cameraBasis(Math.PI / 4, PITCH);
    const d = (a: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }) => a.x * c.x + a.y * c.y + a.z * c.z;
    expect(d(b.F, b.R)).toBeCloseTo(0, 9);
    expect(d(b.F, b.U)).toBeCloseTo(0, 9);
    expect(d(b.R, b.U)).toBeCloseTo(0, 9);
  });
});

describe('canopyFadeAt (the shader test on the CPU)', () => {
  it('fades a crown fragment in front of the avatar on its line of sight, fully at the centre', () => {
    const chest = { x: 20, y: 0.9, z: 30 };
    expect(canopyFadeAt(towardCamera(chest, 3), [avatar], basis)).toBe(1);
    // a crown 4 m up and south of the avatar's head, still on its view ray
    expect(canopyFadeAt(towardCamera({ x: 20, y: 1.6, z: 30 }, 5), [avatar], basis)).toBe(1);
  });
  it('never fades geometry behind the avatar or level with it', () => {
    const chest = { x: 20, y: 0.9, z: 30 };
    expect(canopyFadeAt(towardCamera(chest, -3), [avatar], basis)).toBe(0);
    expect(canopyFadeAt(towardCamera(chest, CANOPY_SHAPE.front * 0.5), [avatar], basis)).toBe(0);
  });
  it('only within the screen capsule: soft edge, nothing beyond the radius, nothing well above the head', () => {
    const chest = { x: 20, y: 0.9, z: 30 };
    const side = (dx: number) => canopyFadeAt(towardCamera({ x: chest.x + dx, y: chest.y, z: chest.z }, 3), [avatar], basis);
    expect(side(0.3)).toBe(1);
    const edge = side(CANOPY_SHAPE.radius * 0.8);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
    expect(side(CANOPY_SHAPE.radius * 1.01)).toBe(0);
    // 2.6 m above the feet: beyond height + radius on screen
    expect(canopyFadeAt(towardCamera({ x: 20, y: CANOPY_SHAPE.height + CANOPY_SHAPE.radius / basis.U.y + 0.3, z: 30 }, 3), [avatar], basis)).toBe(0);
  });
  it('a slot strength scales the fade; the strongest avatar wins; empty slots do nothing', () => {
    const p = towardCamera({ x: 20, y: 0.9, z: 30 }, 3);
    expect(canopyFadeAt(p, [{ ...avatar, w: 0.4 }], basis)).toBeCloseTo(0.4, 9);
    expect(canopyFadeAt(p, [{ ...avatar, w: 0.4 }, { ...avatar, w: 0.9 }], basis)).toBeCloseTo(0.9, 9);
    expect(canopyFadeAt(p, [{ ...avatar, w: 0 }], basis)).toBe(0);
    expect(canopyFadeAt(p, [], basis)).toBe(0);
  });
});

describe('canopy fade driver', () => {
  it('eases each avatar in and out over CANOPY_FADE_MS and fills slots own-first', () => {
    const u = createCanopyUniforms();
    const fade = createCanopyFade(u);
    const cam = { yaw: 0, pitch: PITCH, texelWorld: 0.04 };
    fade.update([{ key: 'r', X: 1, Y: 0, Z: 2, priority: 1 }, { key: 'me', X: 3, Y: 0.1, Z: 4, priority: 0 }], cam, 1000);
    // first sight: strength 0 -> not active yet
    expect(fade.active).toBe(0);
    expect(u.uCtCanN.value).toBe(0);
    fade.update([{ key: 'r', X: 1, Y: 0, Z: 2, priority: 1 }, { key: 'me', X: 3, Y: 0.1, Z: 4, priority: 0 }], cam, 1000 + CANOPY_FADE_MS / 2);
    expect(fade.active).toBe(2);
    expect(u.uCtCan.value[0]!.toArray()).toEqual([3, 0.1, 4, 0.5]);
    expect(u.uCtCan.value[1]!.x).toBe(1);
    expect(u.uCtCanTexel.value).toBe(0.04);
    fade.update([{ key: 'r', X: 1, Y: 0, Z: 2, priority: 1 }, { key: 'me', X: 3, Y: 0.1, Z: 4, priority: 0 }], cam, 1000 + CANOPY_FADE_MS * 2);
    expect(u.uCtCan.value[0]!.w).toBe(1);
    // 'r' went indoors: it fades out at its last position, then the slot clears
    fade.update([{ key: 'me', X: 3, Y: 0.1, Z: 4, priority: 0 }], cam, 1000 + CANOPY_FADE_MS * 2.5);
    expect(fade.active).toBe(2);
    expect(u.uCtCan.value[1]!.w).toBeCloseTo(0.5, 9);
    fade.update([{ key: 'me', X: 3, Y: 0.1, Z: 4, priority: 0 }], cam, 1000 + CANOPY_FADE_MS * 4);
    expect(fade.active).toBe(1);
    expect(u.uCtCan.value[1]!.w).toBe(0);
    expect(fade.debug().slots.map((s) => s.key)).toEqual(['me']);
  });
  it('never writes more than CANOPY_SLOTS slots, and updates the camera basis on a yaw change', () => {
    const u = createCanopyUniforms();
    const fade = createCanopyFade(u);
    const pts = Array.from({ length: CANOPY_SLOTS + 4 }, (_, i) => ({ key: `p${i}`, X: i, Y: 0, Z: 0 }));
    fade.update(pts, { yaw: 0, pitch: PITCH }, 0);
    fade.update(pts, { yaw: Math.PI / 4, pitch: PITCH }, 1000);
    expect(fade.active).toBe(CANOPY_SLOTS);
    expect(u.uCtCanN.value).toBe(CANOPY_SLOTS);
    expect(u.uCtCanR.value.x).toBeCloseTo(Math.cos(Math.PI / 4), 9);
  });
});

describe('patchCanopyMaterial', () => {
  const toonLike = () => {
    const m = new THREE.MeshLambertMaterial();
    m.userData.toon = {};
    const base = (shader: { fragmentShader: string }) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vToonWorld;');
    };
    m.onBeforeCompile = base as unknown as THREE.Material['onBeforeCompile'];
    m.customProgramCacheKey = () => 'toon-7-tcut';
    return m;
  };
  const compile = (m: THREE.Material) => {
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: 'void main() {}', fragmentShader: '#include <common>\nvoid main() {\n  gl_FragColor = vec4(1.0);\n}' };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
    return shader;
  };
  it('chains the material hook, injects the test at the top of main and shares the uniform objects', () => {
    const u = createCanopyUniforms();
    const m = toonLike();
    expect(patchCanopyMaterial(m, u)).toBe(true);
    const sh = compile(m);
    expect(sh.fragmentShader).toContain('varying vec3 vToonWorld;');
    expect(sh.fragmentShader).toContain(CANOPY_GLSL_HEAD.trim().split('\n')[0]!);
    const main = sh.fragmentShader.indexOf('void main() {');
    expect(sh.fragmentShader.indexOf('ctCanopyFade(vToonWorld)')).toBeGreaterThan(main);
    expect(sh.fragmentShader.indexOf('float ctCanopyFade(vec3 P)')).toBeLessThan(main);
    expect(sh.uniforms.uCtCan).toBe(u.uCtCan);
    expect(sh.uniforms.uCtCanN).toBe(u.uCtCanN);
  });
  it('appends to the OWN program cache key, once (idempotent)', () => {
    const u = createCanopyUniforms();
    const m = toonLike();
    patchCanopyMaterial(m, u);
    expect(patchCanopyMaterial(m, u)).toBe(true);
    expect(m.customProgramCacheKey()).toBe('toon-7-tcut|ct-canopy1');
    expect(compile(m).fragmentShader.match(/float ctCanopyFade/g)?.length).toBe(1);
  });
  it('leaves non-toon materials and materials without an own cache key alone', () => {
    const u = createCanopyUniforms();
    expect(patchCanopyMaterial(new THREE.MeshBasicMaterial(), u)).toBe(false);
    const noKey = new THREE.MeshLambertMaterial();
    noKey.userData.toon = {};
    expect(patchCanopyMaterial(noKey, u)).toBe(false);
  });
});
