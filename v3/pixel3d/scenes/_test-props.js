// Props test scene (owner: props): the shrine kit laid out like t3ssel8r's Ruined Shrine refs.
//   ?ground=plane (default: own gentle heightfield with a flat pad) | terrain (src/world/terrain.js)
//   ?view=shrine (default) | pillars (close-up row of pillar variants) | kit (walls/steps/lanterns/paving)
//   ?yaw=<deg> camera yaw (default 45), ?vh=<viewHeight>
import * as THREE from 'three';
import { toonMesh, rampFromTones } from '../src/materials/toon.js';
import { noise2 } from '../src/core/noise.js';
import {
  createPillar, createShrine, createWall, createSteps, createPaving, createLantern,
  createSlab, createDebris, createFallenArch,
} from '../src/world/props.js';

function sunDirFor(camYaw, relAzDeg, elevDeg) {
  const R = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
  const B = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const a = THREE.MathUtils.degToRad(relAzDeg), e = THREE.MathUtils.degToRad(elevDeg);
  return R.multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)).multiplyScalar(Math.cos(e)).setY(Math.sin(e)).normalize();
}
function place(center, yaw, r, angDeg) {
  const F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const a = THREE.MathUtils.degToRad(angDeg);
  return center.clone().addScaledVector(F, r * Math.cos(a)).addScaledVector(R, r * Math.sin(a));
}

function makeGround(engine, { size = 56, seg = 224, pad = 6.2, carve = 2.55 } = {}) {
  const heightAt = (x, z) => {
    const h = (noise2(x * 0.09 + 3, z * 0.09 - 2, 7) - 0.5) * 0.9 + (noise2(x * 0.3, z * 0.3, 8) - 0.5) * 0.12;
    const d = Math.hypot(x, z);
    let y = THREE.MathUtils.lerp(h, 0, 1 - THREE.MathUtils.smoothstep(d, pad, pad + 3));
    // carve the basin interior below the basin floor (the terrain module needs the same: CONTRACT-REQUEST)
    const oct = Math.max(...[0, 1, 2, 3].map((k) => Math.abs(x * Math.cos(k * Math.PI / 4) + z * Math.sin(k * Math.PI / 4))));
    if (oct < carve) y = -0.6;
    return y;
  };
  const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const { color, ramp } = rampFromTones('#BBD985', '#75A558', '#3B6B5A');
  const mesh = toonMesh(engine, geo, { color, ramp, normalNoise: 0.12 });
  engine.scene.add(mesh);
  return { mesh, heightAt, size };
}

export default async function build(engine, params) {
  const { scene } = engine;
  const view = params.get('view') || 'shrine';
  const yaw = THREE.MathUtils.degToRad(Number(params.get('yaw') ?? 45));
  let terrain;
  if (params.get('ground') === 'terrain') {
    const { createTerrain } = await import('../src/world/terrain.js');
    const shrineView = view === 'shrine' || view === 'basin';
    terrain = createTerrain(engine, {
      size: 56, height: 0.6, seed: 4, flatten: [{ x: 0, z: 0, r: 7, h: 0 }],
      basins: shrineView ? [{ x: 0, z: 0, rx: 2.5, depth: 0.7, edge: 0.1 }] : [],
    });
  } else terrain = makeGround(engine, (view === 'shrine' || view === 'basin') ? {} : { carve: 0 });

  // lighting: use the lighting module if present, otherwise the doc's shrine sun
  try {
    const sky = await import('../src/world/sky.js');
    sky.applyTimeOfDay?.(engine, params.get('tod') || 'noon', { relAz: 25, elev: 50 });
  } catch (e) { /* sky.js not there yet */ }
  engine.setSun({ dir: sunDirFor(yaw, Number(params.get("az") ?? 25), Number(params.get("elev") ?? 50)), intensity: 1, shadowExtent: 20 });
  if (params.get("smap")) engine.sun.shadow.mapSize.set(Number(params.get("smap")), Number(params.get("smap")));

  const O = new THREE.Vector3(0, 0, 0);
  const placed = [];
  const add = (o) => { scene.add(o); placed.push(o); return o; };

  if (view === 'pillars') {
    // close-up row: tall, tall, broken, broken, toppled, + yaw π/4 variant
    const xs = [-3.2, -1.6, 0, 1.6, 3.2];
    const R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    xs.forEach((x, i) => {
      const p = O.clone().addScaledVector(R, x);
      const o = { seed: 11 + i * 7, position: p, terrain };
      if (i === 2) o.broken = true;
      if (i === 3) { o.broken = true; o.height = 1.3; }
      if (i === 4) o.toppled = true;
      if (i === 1) o.yaw = Math.PI / 4;
      add(createPillar(engine, o));
    });
    engine.camera.set({ target: new THREE.Vector3(0, 1.2, 0), yaw, viewHeight: Number(params.get('vh') ?? 5) });
    return;
  }

  if (view === 'kit') {
    add(createWall(engine, { length: 4, height: 1.8, seed: 3, position: place(O, yaw, 3.4, -38), terrain, yaw }));
    add(createWall(engine, { length: 3.2, height: 1.4, seed: 8, position: place(O, yaw, 3.8, 48), terrain, yaw: 0 }));
    add(createSteps(engine, { width: 2.0, count: 4, position: place(O, yaw, 0.2, 0), yaw, terrain }));
    add(createLantern(engine, { position: place(O, yaw, 1.7, 90), terrain, lit: true, light: params.get("light") === "1", seed: 2 }));
    add(createLantern(engine, { position: place(O, yaw, 1.7, -90), terrain, seed: 5 }));
    add(createPaving(engine, terrain, { center: place(O, yaw, 2.3, 180), radius: 1.9, seed: 4 }));
    add(createPaving(engine, terrain, { center: place(O, yaw, 3.8, 128), radius: 1.5, seed: 9, kind: 'cobble' }));
    add(createSlab(engine, { position: place(O, yaw, 3.8, -112), terrain, seed: 3 }));
    add(createDebris(engine, terrain, { center: place(O, yaw, 3.4, -145), radius: 1.2, count: 16, seed: 2 }));
    engine.camera.set({ target: new THREE.Vector3(0, 0.6, 0), yaw, viewHeight: Number(params.get('vh') ?? 8) });
    return;
  }

  // --- shrine layout (ART_DIRECTION §1) ---
  const shrine = add(createShrine(engine, { seed: 5, position: O.clone() }));
  if (params.get('water') === '1') {
    try {
      const { createWater } = await import('../src/world/water.js');
      const w = shrine.userData.water;
      createWater(engine, terrain, { level: w.level, shape: w.shape, bounds: w.bounds });
    } catch (e) { console.warn('water module unavailable', e); }
  }
  if (view === 'basin') {
    engine.camera.set({ target: new THREE.Vector3(0, 0.3, 0), yaw, viewHeight: Number(params.get('vh') ?? 6) });
    return;
  }
  const pillarDefs = [
    [-150, 5.3, 2.9], [-105, 5.9, 3.2], [-60, 5.6, 2.5], [-15, 6.1, 3.4], [40, 5.4, 2.7],
    [80, 6.0, 3.0], [125, 5.6, 2.4], [178, 6.2, 1.5],
  ];
  const bases = [];
  pillarDefs.forEach(([ang, r, h], i) => {
    const p = place(O, yaw, r, ang + ((i * 37) % 13) - 6);
    bases.push({ x: p.x, z: p.z, r: 0.9 });
    add(createPillar(engine, { height: h, seed: 100 + i * 13, position: p, terrain, yaw: i === 4 ? Math.PI / 4 : 0, broken: h < 2 }));
  });
  [[-170, 4.6, 1.1], [100, 4.4, 0.7], [150, 5.0, 1.4]].forEach(([ang, r, h], i) => {
    const p = place(O, yaw, r, ang);
    bases.push({ x: p.x, z: p.z, r: 0.9 });
    add(createPillar(engine, { height: h, broken: true, seed: 300 + i * 11, position: p, terrain }));
  });
  // fallen arch: one end on a broken pillar
  const a0 = place(O, yaw, 4.3, 20), a1 = place(O, yaw, 5.6, 55);
  const stub = add(createPillar(engine, { height: 1.0, broken: true, seed: 401, position: a0, terrain, debris: false }));
  add(createFallenArch(engine, { from: new THREE.Vector3(a0.x, stub.position.y + stub.userData.height + 0.1, a0.z), to: new THREE.Vector3(a1.x, terrain.heightAt(a1.x, a1.z) + 0.1, a1.z), blocks: 7, seed: 3, terrain }));
  // flat slabs at the top centre
  [[-20, 7.2], [-6, 8.3], [4, 7.4], [10, 8.6]].forEach(([ang, r], i) => add(createSlab(engine, { position: place(O, yaw, r, ang), terrain, seed: 60 + i })));
  // debris at pillar bases + arch
  bases.push({ x: a1.x, z: a1.z, r: 1.0 });
  add(createDebris(engine, terrain, { around: bases, count: 36, seed: 7, avoid: (x, z) => Math.hypot(x, z) < 3.9 }));
  // paving patches in the corners
  add(createPaving(engine, terrain, { center: place(O, yaw, 8.5, -55), radius: 2.6, seed: 4, exclude: (x, z) => Math.hypot(x, z) < 4 }));
  add(createPaving(engine, terrain, { center: place(O, yaw, 8.0, 60), radius: 2.2, seed: 5 }));
  add(createLantern(engine, { position: place(O, yaw, 4.7, -30), terrain, seed: 3 }));

  if (params.get('grass') === '1') {
    // context only (grass is not owned by props): keep tufts off the stone footprints
    try {
      const { createGrass } = await import('../src/world/grass.js');
      const onStone = (x, z) => placed.some((g) => g.userData.covers?.(x, z, 0.04));
      createGrass(engine, terrain, { area: { x0: -16, z0: -16, x1: 16, z1: 16 }, mask: (x, z) => !onStone(x, z) });
    } catch (e) { console.warn('grass unavailable', e); }
  }
  engine.camera.set({ target: new THREE.Vector3(0, 0.5, 0), yaw, pitch: Math.PI / 6, viewHeight: Number(params.get('vh') ?? 10) });
}
