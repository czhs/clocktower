// Trees test scene: round trees, a tall tree, a pine and bushes on flat grass, plus one stone pillar for
// occlusion / outline interplay. Params: ?vh=12  ?yaw=45 (deg)  ?clouds=1  ?sky=1&tod=noon|golden|...
//   ?only=round|tall|pine|bush (one big specimen)  ?outline=1  ?scatter=1 (scatterTrees on a fake terrain)
import * as THREE from 'three';
import { toonMesh, rampFromTones, ensureToonUniforms } from '../src/materials/toon.js';
import { createTree, scatterTrees } from '../src/world/trees.js';

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

export default async function build(engine, params = new URLSearchParams()) {
  const yaw = THREE.MathUtils.degToRad(Number(params.get('yaw') ?? 45));
  const vh = Number(params.get('vh') ?? 12);
  const only = params.get('only');
  const outline = params.get('outline') === '1';   // canopy silhouette line is opt-in (scenes use the default: none)
  engine.camera.set({ target: new THREE.Vector3(0, only ? 1.8 : 1.0, 0), yaw, pitch: Math.PI / 6, viewHeight: only ? Number(params.get('vh') ?? 7) : vh });
  if (params.has('pan')) {   // crawl test: shift the target by N texels along screen-right
    const t = engine.camera.texelWorld * Number(params.get('pan'));
    engine.camera.target.add(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(t));
  }
  engine.setSun({ dir: sunDirFor(yaw, Number(params.get('az') ?? 25), Number(params.get('elev') ?? 50)) });
  engine.style.sky = new THREE.Color('#BFE0EA');
  const T = ensureToonUniforms(engine);
  if (params.get('clouds') !== '1') T.uCloud.value.x = 0;
  if (params.get('sky') === '1') {
    try {
      const sky = await import('../src/world/sky.js');
      const o = {};
      if (params.has('az')) o.relAz = Number(params.get('az'));
      if (params.has('elev')) o.elev = Number(params.get('elev'));
      sky.applyTimeOfDay(engine, params.get('tod') || 'noon', o);
      if (params.get('clouds') !== '1') T.uCloud.value.x = 0;
    } catch (e) { console.warn('sky.js unavailable', e.message); }
  }

  // ?world=1: integration with the real terrain + grass modules, trees via scatterTrees
  if (params.get('world') === '1') {
    const { createTerrain } = await import('../src/world/terrain.js');
    const { createGrass } = await import('../src/world/grass.js');
    const terrain = createTerrain(engine, { size: 48, seed: 3, height: 0.6, flatten: [{ x: 0, z: 0, r: 3 }] });
    createGrass(engine, terrain, { area: 'view' });
    scatterTrees(engine, terrain, { count: 7, minDist: 6, seed: 5, area: { x0: -12, z0: -12, w: 24, h: 24 }, avoid: [{ x: 0, z: 0, r: 3 }],
      kinds: ['round', 'round', 'round', 'tall'], heightRange: [4, 5.2] });
    scatterTrees(engine, terrain, { count: 5, minDist: 3, seed: 9, area: { x0: -9, z0: -9, w: 18, h: 18 }, avoid: [{ x: 0, z: 0, r: 2 }], kind: 'bush' });
    return;
  }

  // flat meadow (shrine grass tones)
  const g = rampFromTones('#BBD985', '#75A558', '#3B6B5A');
  const ground = toonMesh(engine, new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), { color: g.color, ramp: g.ramp }, { castShadow: false });
  engine.scene.add(ground);
  const terrain = { size: 60, heightAt: () => 0, normalAt: () => new THREE.Vector3(0, 1, 0), isGrass: () => true, waterLevel: -Infinity };

  const O = new THREE.Vector3();
  if (only) {
    const t = createTree(engine, { kind: only, seed: Number(params.get('seed') ?? 3), position: new THREE.Vector3(0, -0.1, 0), outline });
    if (params.get('noshadow') === '1') t.traverse((o) => { o.receiveShadow = false; });
    return;
  }
  if (params.get('scatter') === '1') {
    scatterTrees(engine, terrain, { count: 9, minDist: 4.5, seed: 4, area: { x0: -11, z0: -11, w: 22, h: 22 }, avoid: [{ x: 0, z: 0, r: 2.5 }],
      kinds: ['round', 'round', 'tall', 'bush', 'pine'], treeOpts: { outline } });
  } else {
    createTree(engine, { kind: 'round', seed: 11, position: place(O, yaw, 5.0, -50), height: 4.6, outline });
    createTree(engine, { kind: 'round', seed: 23, position: place(O, yaw, 6.5, 40), height: 4.2, outline });
    createTree(engine, { kind: 'round', seed: 5, position: place(O, yaw, 4.5, 150), height: 4.0, outline });
    createTree(engine, { kind: 'tall', seed: 7, position: place(O, yaw, 10, 5), height: 7.0, outline });
    createTree(engine, { kind: 'pine', seed: 9, position: place(O, yaw, 9, 65), height: 6.0, outline });
    createTree(engine, { kind: 'round', seed: 31, position: place(O, yaw, 7.5, -130), height: 4.8, outline });
    createTree(engine, { kind: 'bush', seed: 2, position: place(O, yaw, 2.6, -95), outline });
    createTree(engine, { kind: 'bush', seed: 4, position: place(O, yaw, 3.2, 100), outline });
    createTree(engine, { kind: 'bush', seed: 8, position: place(O, yaw, 6.0, -15), radius: 0.8, outline });
  }
  // stone pillar (occlusion / outline check)
  const s = rampFromTones('#BBAC97', '#8C7E72', '#5B5A64');
  const pillar = toonMesh(engine, new THREE.BoxGeometry(0.9, 2.8, 0.9), { color: s.color, ramp: s.ramp, flatShading: true });
  pillar.position.copy(place(O, yaw, 1.2, -20)).setY(1.4);
  engine.scene.add(pillar);
}
