// Grass test scene (owner: grass agent): terrain + boxes casting shadows + clouds + grass/flowers.
//   ?grass=0|1  ?mode=flowers  ?gdebug=1  ?area=view|box  ?tod=noon|golden|night  ?flowers=0|1  ?clouds=0|1  ?wind=0|1  ?vh=10  ?yaw=45  ?tx=0&tz=0  ?nn=0.15 (terrain normal noise)
//   ?unihi=1  light/dark grass patches share the base grass hi tone (one lit tone; variation only in mid/sh)
import * as THREE from 'three';
import { createTerrain } from '../src/world/terrain.js';
import { createGrass } from '../src/world/grass.js';
import { createFlowers } from '../src/world/flowers.js';
import { toonMesh, ensureToonUniforms } from '../src/materials/toon.js';

function sunDirFor(camYaw, relAzDeg, elevDeg) {
  const R = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
  const B = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const a = THREE.MathUtils.degToRad(relAzDeg), e = THREE.MathUtils.degToRad(elevDeg);
  return R.multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)).multiplyScalar(Math.cos(e)).setY(Math.sin(e)).normalize();
}

export default async function build(engine, params) {
  const P = (k, d) => (params.get(k) ?? d);
  const yaw = THREE.MathUtils.degToRad(Number(P('yaw', 45)));
  const T = ensureToonUniforms(engine);
  if (P('clouds', '1') === '0') T.uCloud.value.x = 0;

  const terrain = createTerrain(engine, {
    size: 64, seed: 3, height: Number(P('h', 1.2)),
    // a dirt path and a cobble patch, so tufts overhanging zone edges can be checked
    paths: [{ points: [[-12, -1], [-5, -4.5], [0, -6.5], [8, -6]], width: 1.2, kind: 'dirt' }],
    zones: [{ type: 'cobble', x: 6.5, z: 4.5, r: 2.2 }],
    ...(P('unihi', '0') === '1' ? { palette: { grassLight: ['#BBD985', '#7DAB5C', '#3E6F5B'], grassDark: ['#BBD985', '#6C9C55', '#37655A'] } } : {}),
  });
  const nn = Number(P('nn', 0.15));
  if (terrain.mesh.material.userData.toon && nn) terrain.mesh.material.userData.toon.uNormalNoise.value = nn;

  // shadow casters: a few stone boxes (one rotated 45°) and a tall pillar
  const stone = { color: new THREE.Color('#8C7E72') };
  const boxes = [[-2.2, 1.6, 1.0, 1.0, 1.0, 0], [1.8, -0.6, 1.2, 2.2, 0.8, Math.PI / 4], [-0.6, -3.2, 0.7, 3.0, 0.7, 0], [3.4, 2.8, 2.0, 0.6, 1.2, 0.3], [-4.5, -1.0, 3.5, 2.2, 0.4, Math.PI / 4]];
  for (const [x, z, w, h, d, ry] of boxes) {
    const m = toonMesh(engine, new THREE.BoxGeometry(w, h, d), stone);
    m.position.set(x, terrain.heightAt(x, z) + h / 2 - 0.05, z);
    m.rotation.y = ry;
    engine.scene.add(m);
  }

  engine.camera.set({
    target: new THREE.Vector3(Number(P('tx', 0)), 0.3, Number(P('tz', 0))), yaw, pitch: Math.PI / 6,
    viewHeight: Number(P('vh', 10)),
  });
  const tod = P('tod', null);
  if (tod) {
    const sky = await import('../src/world/sky.js');   // lighting agent's presets (?tod=morning|noon|golden|night)
    sky.applyTimeOfDay(engine, tod);
  } else {
    engine.setSun({ dir: sunDirFor(yaw, 25, 50), intensity: 1, shadowExtent: 20 });
  }

  if (P('mode', '') === 'flowers') {          // stand-alone flower field (API check)
    createFlowers(engine, terrain, { area: 'view', fraction: 0.08, tints: [{ hex: '#EDEBDA' }, { hex: '#E6D36A' }] });
  } else if (P('grass', '1') !== '0') {
    createGrass(engine, terrain, {
      area: P('area', 'view') === 'view' ? 'view' : { x0: -16, z0: -16, x1: 16, z1: 16 },
      flowers: P('flowers', '1') === '0' ? false : { fraction: 0.05 },
      wind: { strength: P('wind', '1') === '0' ? 0 : 1 },
      debug: P('gdebug', '0') === '1',
      avoid: boxes.map(([x, z, w, , d]) => ({ x, z, r: Math.min(w, d) * 0.45 })),
    });
  }

}
