// v3.3 perf prototype (v33-light): the pure parts of vendor/light.ts (docs/perf-v3/light.md): the switch, the chunk
// patches, the static shadow map placement, caster signatures, the deferred pool packing and the aux wrapper.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ALONG_LIGHT_M,
  AUX_CLEAR_GLSL,
  AUX_DECL_GLSL,
  depthAnimates,
  isDynamicCaster,
  leversFor,
  packPool,
  parseLightSwitches,
  patchChunk,
  POOL_FRAG,
  SPLIT_SHADOW_GLSL,
  staticMapSize,
  staticPlacement,
  wrapAuxShader,
  writeSig,
} from '../../src/game3d/vendor/light';

describe('v3light switches', () => {
  it('parses the list; unset = nothing installed', () => {
    expect(parseLightSwitches(null)).toEqual({ stats: false, shadow: false, pool: false });
    expect(parseLightSwitches('')).toEqual({ stats: false, shadow: false, pool: false });
    expect(parseLightSwitches('stats')).toEqual({ stats: true, shadow: false, pool: false });
    expect(parseLightSwitches('shadow')).toEqual({ stats: true, shadow: true, pool: false });
    expect(parseLightSwitches('Shadow, pool')).toEqual({ stats: true, shadow: true, pool: true });
    expect(parseLightSwitches('all')).toEqual({ stats: true, shadow: true, pool: true });
  });
  it('the cpu tier takes neither lever (no shadow map, no normal pass)', () => {
    expect(leversFor('cpu', parseLightSwitches('all'))).toEqual({ stats: true, shadow: false, pool: false });
    expect(leversFor('low', parseLightSwitches('all'))).toEqual({ stats: true, shadow: true, pool: true });
  });
});

describe('chunk patches', () => {
  it('append once and restore only while still ours', () => {
    const chunks: Record<string, string> = { a: 'A' };
    const r1 = patchChunk('a', '+x', chunks);
    expect(chunks.a).toBe('A+x');
    const r2 = patchChunk('a', '+x', chunks);
    expect(chunks.a).toBe('A+x');
    r2();
    expect(chunks.a).toBe('A+x');
    r1();
    expect(chunks.a).toBe('A');
    const r3 = patchChunk('a', '+y', chunks);
    chunks.a = 'other';
    r3();
    expect(chunks.a).toBe('other');
  });
  it('the split-shadow macro only exists with two shadowed directional lights', () => {
    expect(SPLIT_SHADOW_GLSL).toMatch(/NUM_DIR_LIGHT_SHADOWS > 1/);
    expect(SPLIT_SHADOW_GLSL).toMatch(/#define getShadow\( m, s, i, b, r, c \) ctSplitShadow/);
    expect(SPLIT_SHADOW_GLSL).toMatch(/min\( s0, s1 \)/);
  });
  it('the pool pass reproduces the toon.js point-light formula', () => {
    // toon.js: pa = clamp(1 - dr^2) * max(N.L, 0) * pmax * gain; pq quantised to uPointLevels; mix toward warm mid
    expect(POOL_FRAG).toMatch(/clamp\(1\.0 - dr \* dr, 0\.0, 1\.0\) \* max\(dot\(N, normalize\(lv\)\), 0\.0\) \* pmax \* uPointShape\.x/);
    expect(POOL_FRAG).toMatch(/floor\(clamp\(pa, 0\.0, 1\.0\) \* uPointLevels \+ 0\.5\) \/ uPointLevels/);
    expect(POOL_FRAG).toMatch(/aux\.rgb \* mix\(vec3\(1\.0\), c \/ pmax, uPointShape\.z\)/);
  });
});

describe('static shadow placement', () => {
  const dir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
  const texel = 0.02;
  const basis = () => {
    const z = dir.clone();
    const x = new THREE.Vector3(0, 1, 0).cross(z).normalize();
    const y = z.clone().cross(x);
    return { x, y, z };
  };
  it('sits on the vendor texel lattice, on a 2·margin grid', () => {
    const p = staticPlacement({ x: 12.3, y: 0.4, z: 7.9 }, dir, texel, 256);
    expect(Math.abs(p.ix % 512)).toBe(0);
    expect(Math.abs(p.iy % 512)).toBe(0);
    const { x, y, z } = basis();
    const W = new THREE.Vector3(p.x, p.y, p.z);
    expect(W.dot(x) / texel).toBeCloseTo(p.ix, 6);
    expect(W.dot(y) / texel).toBeCloseTo(p.iy, 6);
    expect(W.dot(z) / ALONG_LIGHT_M).toBeCloseTo(p.kz, 6);
  });
  it('the same indices give bit-identical centres; small pans keep them; the view stays inside the margin', () => {
    const a = staticPlacement({ x: 10, y: 0, z: 10 }, dir, texel, 256);
    let same = 0;
    for (let k = 0; k < 50; k++) {
      const c = { x: 10 + k * 0.01, y: 0, z: 10 - k * 0.007 };
      const b = staticPlacement(c, dir, texel, 256);
      if (b.ix === a.ix && b.iy === a.iy && b.kz === a.kz) {
        same++;
        expect([b.x, b.y, b.z]).toEqual([a.x, a.y, a.z]);
      }
      const { x, y } = basis();
      const C = new THREE.Vector3(c.x, c.y, c.z);
      expect(Math.abs(Math.round(C.dot(x) / texel) - b.ix)).toBeLessThanOrEqual(256);
      expect(Math.abs(Math.round(C.dot(y) / texel) - b.iy)).toBeLessThanOrEqual(256);
    }
    expect(same).toBeGreaterThan(10);
  });
  it('map size = vendor size + a margin on each side', () => {
    expect(staticMapSize(2048, 256)).toBe(2560);
    expect(staticMapSize(4096, 128)).toBe(4352);
  });
});

describe('caster signatures', () => {
  it('change with the matrix, visibility, instance matrices and geometry', () => {
    const scene = new THREE.Scene();
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    m.castShadow = true;
    g.add(m);
    scene.add(g);
    scene.updateMatrixWorld(true);
    const a = new Float64Array(21);
    const b = new Float64Array(21);
    writeSig(m, scene, a);
    writeSig(m, scene, b);
    expect(Array.from(a)).toEqual(Array.from(b));
    g.position.x = 1;
    scene.updateMatrixWorld(true);
    writeSig(m, scene, b);
    expect(Array.from(a)).not.toEqual(Array.from(b));
    writeSig(m, scene, a);
    g.visible = false;
    writeSig(m, scene, b);
    expect(b[16]).toBe(0);
    g.visible = true;
    (m.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    writeSig(m, scene, b);
    expect(b[19]).not.toBe(a[19]);
    g.removeFromParent();
    writeSig(m, scene, b);
    expect(b[16]).toBe(0); // out of the scene
  });
  it('skinned and time-animated depth casters start dynamic', () => {
    const plain = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    expect(isDynamicCaster(plain)).toBe(false);
    const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    expect(isDynamicCaster(skinned)).toBe(true);
    // the vendor's depthMaterial(): `uniform float uTime;` always, the vertex patch only sometimes
    const depth = (vertex: string) => {
      const d = new THREE.MeshDepthMaterial();
      d.onBeforeCompile = (s) => {
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertex}`);
      };
      return d;
    };
    expect(depthAnimates(depth('transformed.x += 0.0;'))).toBe(false);
    expect(depthAnimates(depth('transformed.x += sin(uTime);'))).toBe(true);
    const wind = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    wind.customDepthMaterial = depth('transformed.x += sin(uTime);');
    expect(isDynamicCaster(wind)).toBe(true);
  });
});

describe('deferred pool', () => {
  it('packs lit lights in order (view space, colour x intensity), skipping dark ones, up to max', () => {
    const view = new THREE.Matrix4().makeTranslation(0, 0, -10);
    const ls = [0, 1.5, 2, 0, 1].map((i, k) => {
      const l = new THREE.PointLight(0xff8000, i, 3 + k);
      l.position.set(k, 0, 0);
      l.updateMatrixWorld();
      return l;
    });
    const pos = Array.from({ length: 2 }, () => new THREE.Vector3());
    const col = Array.from({ length: 2 }, () => new THREE.Color());
    const dist = [0, 0];
    const n = packPool(ls, view, pos, col, dist, 2);
    expect(n).toBe(2);
    expect(pos[0]!.toArray()).toEqual([1, 0, -10]);
    expect(pos[1]!.toArray()).toEqual([2, 0, -10]);
    expect(dist).toEqual([4, 5]);
    expect(col[0]!.r).toBeCloseTo(1.5, 6);
    expect(col[1]!.r).toBeCloseTo(2, 6);
  });
  it('wraps a custom ShaderMaterial once: aux declared, cleared at the top of main, own program key', () => {
    const m = new THREE.ShaderMaterial({ vertexShader: 'void main(){}', fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }' });
    const k0 = m.customProgramCacheKey();
    expect(wrapAuxShader(m)).toBe(true);
    expect(wrapAuxShader(m)).toBe(false);
    expect(m.customProgramCacheKey()).toBe(`${k0}|ctaux`);
    const sh = { vertexShader: m.vertexShader, fragmentShader: m.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(sh, {} as THREE.WebGLRenderer);
    expect(sh.fragmentShader.startsWith(AUX_DECL_GLSL)).toBe(true);
    expect(sh.fragmentShader).toContain(`void main() {${AUX_CLEAR_GLSL}`);
    const chunked = new THREE.ShaderMaterial({ fragmentShader: '#include <clipping_planes_pars_fragment>\nvoid main(){}' });
    expect(wrapAuxShader(chunked)).toBe(false);
  });
});
