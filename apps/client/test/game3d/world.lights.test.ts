// v3 WP3 (v3-stage). The carried-light reserve (constant light count) and the interior park of the town graph.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createLightReserve, LIGHT_BUDGET, RESERVE } from '../../src/game3d/world/lights';
import { createTownPark } from '../../src/game3d/world/park';

const countLights = (o: THREE.Object3D) => {
  let n = 0;
  o.traverse((c) => {
    if ((c as THREE.Light).isLight) n++;
  });
  return n;
};

describe('light reserve', () => {
  it('a fixed set of PointLights, created up front, never added or removed by lending', () => {
    const scene = new THREE.Scene();
    const r = createLightReserve(scene, RESERVE.high);
    expect(countLights(scene)).toBe(RESERVE.high);
    expect(LIGHT_BUDGET.high - RESERVE.high).toBeGreaterThan(0);
    const a = r.borrow(() => ({ x: 1, y: 1.2, z: 2 }))!;
    const b = r.borrow(() => null, { always: true })!;
    expect(r.borrow(() => ({ x: 0, y: 0, z: 0 }))).toBeNull();
    expect(r.lent).toBe(2);
    expect(countLights(scene)).toBe(RESERVE.high);
    a.release();
    a.release(); // twice is harmless
    expect(r.lent).toBe(1);
    expect(r.borrow(() => ({ x: 0, y: 0, z: 0 }))).not.toBeNull();
    b.release();
    r.dispose();
    expect(countLights(scene)).toBe(0);
  });
  it('a lent light follows its anchor, scaled by darkness unless `always`; null anchor or release parks it dark', () => {
    const scene = new THREE.Scene();
    const r = createLightReserve(scene, 2);
    let at: { x: number; y: number; z: number } | null = { x: 3, y: 1, z: 4 };
    const lent = r.borrow(() => at, { intensity: 2 })!;
    r.borrow(() => ({ x: 9, y: 1, z: 9 }), { intensity: 1, always: true });
    const lights = scene.getObjectByName('ct-carried-lights')!.children as THREE.PointLight[];
    r.update(0, 0);
    expect(lights[0]!.position.toArray()).toEqual([3, 1, 4]);
    expect(lights[0]!.intensity).toBe(0); // noon
    expect(lights[1]!.intensity).toBeGreaterThan(0.7); // always: flicker 0.8..1 of 1
    r.update(1, 0);
    expect(lights[0]!.intensity).toBeGreaterThanOrEqual(1.6);
    expect(lights[0]!.intensity).toBeLessThanOrEqual(2);
    at = null;
    r.update(1, 0.1);
    expect(lights[0]!.intensity).toBe(0);
    expect(lights[0]!.position.y).toBeLessThan(-10);
    at = { x: 3, y: 1, z: 4 };
    lent.release();
    r.update(1, 0.2);
    expect(lights[0]!.intensity).toBe(0);
  });
});

describe('town park', () => {
  const town = () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    const a = new THREE.Mesh();
    a.name = 'a';
    const lit = new THREE.Group();
    lit.name = 'lit';
    const lamp = new THREE.PointLight();
    const b = new THREE.Mesh();
    b.name = 'b';
    lit.add(lamp, b);
    const c = new THREE.Mesh();
    c.name = 'c';
    root.add(a, lit, c);
    return { scene, root, lit, lamp };
  };
  it('detaches every light-free branch, keeps the lights, restores the child order, swaps life.update', () => {
    const { scene, root, lit, lamp } = town();
    const life = { update: (() => 1) as ((t: number, dt: number) => void) | null };
    const original = life.update;
    const park = createTownPark(scene, root, life);
    park.park();
    expect(park.parked).toBe(true);
    expect(root.children.map((o) => o.name)).toEqual(['lit']);
    expect(lit.children).toEqual([lamp]);
    expect(countLights(scene)).toBe(1);
    expect(life.update).not.toBe(original);
    park.park(); // idempotent
    park.unpark();
    expect(root.children.map((o) => o.name)).toEqual(['a', 'lit', 'c']);
    expect(lit.children.map((o) => o.name || o.type)).toEqual(['PointLight', 'b']);
    expect(life.update).toBe(original);
  });
  it('refuses to park a root that is not in the scene or carries a real transform', () => {
    const { scene, root } = town();
    root.position.set(5, 0, 0);
    root.updateMatrix();
    const park = createTownPark(scene, root, null);
    park.park();
    expect(park.parked).toBe(false);
    expect(createTownPark(new THREE.Scene(), new THREE.Group(), null).parked).toBe(false);
  });
});
