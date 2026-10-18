// v3 WP3 (v3-stage). The stage-level wrappers that carry real logic, with three-only fixtures (no WebGL, no built
// town): boarded pool lights (world/lights.ts dimNearAnchors), the canopy material selection (vendor/town.ts
// canopyMaterials: foliage + crowns + kit 'soft', never kit solid / glass, never grass) and the live cut-away facade
// (vendor/town.ts createCutDriver). A vendor re-publish that renames a material, a layer or the cut controller
// fails here instead of only in the slow SwiftShader smoke.
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOARDED_LIGHT_M, dimNearAnchors } from '../../src/game3d/world/lights';
import { canopyMaterials, createCutDriver, type BuiltTown } from '../../src/game3d/vendor/town';
import type { HostedEngine } from '../../src/game3d/vendor/engineHost';
import * as layoutNS from '@pixel3d/town/layout.js';

const houses = (layoutNS as unknown as { houses: { id: string }[] }).houses;

describe('boarded cottages: pool lights near a boarded anchor go dark', () => {
  it('zeroes only lit lights within BOARDED_LIGHT_M (x and z) of an anchor; count and positions unchanged', () => {
    const at = (x: number, z: number, i = 1.2) => {
      const l = new THREE.PointLight(0xffffff, i, 4);
      l.position.set(x, 1.5, z);
      return l;
    };
    const pool = [at(10, 10), at(10.3, 9.8), at(10 + BOARDED_LIGHT_M + 0.05, 10), at(20, 20), at(30, 30, 0)];
    const before = pool.map((l) => l.position.clone());
    const n = dimNearAnchors(pool, [{ x: 10, z: 10 }, { x: 30, z: 30 }]);
    expect(n).toBe(2);
    expect(pool.map((l) => l.intensity)).toEqual([0, 0, 1.2, 1.2, 0]);
    expect(pool).toHaveLength(5);
    pool.forEach((l, i) => expect(l.position.equals(before[i]!)).toBe(true));
    // no boarded cottage: nothing changes
    const lit = [at(10, 10)];
    expect(dimNearAnchors(lit, [])).toBe(0);
    expect(lit[0]!.intensity).toBe(1.2);
  });
});

const toon = (name: string) => {
  const m = new THREE.MeshLambertMaterial();
  m.name = name;
  m.userData.toon = { kind: 'toon' };
  return m;
};
const mesh = (name: string, mat: THREE.Material, userData: Record<string, unknown> = {}) => {
  const o = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  o.name = name;
  Object.assign(o.userData, userData);
  return o;
};

function fakeTown(parts: Record<string, { group?: THREE.Object3D; api?: Record<string, unknown> }>, extra: Record<string, unknown> = {}): BuiltTown {
  return {
    registry: { get: (id: string) => parts[id], anchors: () => [] },
    ...extra,
  } as unknown as BuiltTown;
}

describe('canopy materials (lead decision D1)', () => {
  it('foliage (not grass) + cottage crowns / fade targets + kit soft; never kit solid / glass, never untooned', () => {
    const leaves = toon('foliage-leaves');
    const core = toon('foliage-core');
    const grass = toon('foliage-grass');
    const plain = new THREE.MeshBasicMaterial({ name: 'plain' });
    const soft = toon('town-kit-soft');
    const solid = toon('town-kit-solid');
    const glass = toon('town-kit-glass');
    const crown = toon('oak-crown');
    const fadeOnly = toon('house11-fade');
    const foliage = new THREE.Group();
    foliage.add(mesh('leaves-chunk-0', leaves), mesh('core-chunk-0', core), mesh('grass-chunk-0', grass), mesh('rim-plain', plain));
    const h0 = new THREE.Group();
    h0.add(mesh('wall', solid, { layer: 'solid' }), mesh('thatch', soft, { layer: 'soft' }), mesh('window', glass, { layer: 'soft' }));
    const h1 = new THREE.Group();
    h1.add(mesh('clump-0', crown), mesh('door', solid));
    const fadeGroup = new THREE.Group();
    fadeGroup.add(mesh('x', fadeOnly), mesh('y', solid));
    const parts: Record<string, { group?: THREE.Object3D; api?: Record<string, unknown> }> = {
      foliage: { group: foliage },
      [houses[0]!.id]: { group: h0 },
      [houses[1]!.id]: { group: h1, api: { fadeTargets: () => [fadeGroup] } },
    };
    const got = canopyMaterials(fakeTown(parts));
    const names = [...got].map((m) => m.name).sort();
    expect(names).toEqual(['foliage-core', 'foliage-leaves', 'house11-fade', 'oak-crown', 'town-kit-soft']);
    for (const m of got) expect(['town-kit-solid', 'town-kit-glass']).not.toContain(m.name);
  });
  it('an empty town (a re-publish without foliage / houses) gives an empty set, no throw', () => {
    expect(canopyMaterials(fakeTown({})).size).toBe(0);
  });
});

describe('live cut-away facade (vendor demo/api.js createCutController)', () => {
  afterEach(() => {
    vi.doUnmock('@pixel3d/demo/api.js');
    vi.resetModules();
  });
  const engine = () => ({ camera: { viewHeight: 15, target: new THREE.Vector3(22, 0, 20), yaw: 0, pitch: Math.PI / 6 } }) as unknown as HostedEngine;
  const fakeCut = () => ({ enabled: false, boxes: [] as unknown[], setBoxes(b: unknown[]) { this.boxes = b; }, setKeep() {}, setLifts() {}, setCircle() {} });

  it('null when the town has no cut-away', () => {
    expect(createCutDriver(engine(), fakeTown({}), { position: null, nearDoor: null, interior: null })).toBeNull();
  });

  it('null when the vendor no longer exports createCutController', async () => {
    vi.resetModules();
    // a re-publish that renamed / dropped the export (the key exists only so the vitest mock does not throw)
    vi.doMock('@pixel3d/demo/api.js', () => ({ createCutController: undefined }));
    const mod = await import('../../src/game3d/vendor/town');
    expect(mod.createCutDriver(engine(), fakeTown({}, { cutaway: fakeCut() }), { position: null, nearDoor: null, interior: null })).toBeNull();
  });

  it('the facade reaches the vendor controller: player box outdoors, everything off inside a room', () => {
    const cut = fakeCut();
    const player = { position: { x: 22, y: 0, z: 20 } as { x: number; y: number; z: number } | null, nearDoor: null, interior: null as unknown };
    const d = createCutDriver(engine(), fakeTown({}, { cutaway: cut }), player);
    expect(d).not.toBeNull();
    d!.update();
    const out = d!.info()!;
    expect(out.inside).toBe(false);
    expect(out.boxes).toBeGreaterThanOrEqual(1);
    expect(cut.enabled).toBe(true);
    player.interior = { index: 5 };
    d!.update();
    expect(d!.info()!.inside).toBe(true);
    expect(cut.enabled).toBe(false);
  });
});
