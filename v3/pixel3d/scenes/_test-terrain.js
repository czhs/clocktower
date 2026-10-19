// Terrain + rocks test scene (owner: terrain agent).
//   ?scene=_test-terrain[&vh=10][&tx=0&tz=0][&yaw=1][&view=overview|cliffs|cobble|shore|rocks][&tod=noon]
// Layout: rolling meadow, a two-step plateau with cliffs (NW), a flattened cobble pad + dirt path (centre),
// a pond hollow with sand/wet-sand shore (E), boulder clusters with moss, pebbles.
import * as THREE from 'three';
import { createTerrain } from '../src/world/terrain.js';
import { createRocks } from '../src/world/rocks.js';

function sunDirFor(camYaw, relAzDeg, elevDeg) {
  const R = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
  const B = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const a = THREE.MathUtils.degToRad(relAzDeg), e = THREE.MathUtils.degToRad(elevDeg);
  return R.multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)).multiplyScalar(Math.cos(e)).setY(Math.sin(e)).normalize();
}

const VIEWS = {
  overview: { tx: 0, tz: 0, vh: 22 },
  centre: { tx: 0, tz: 0, vh: 10 },
  cliffs: { tx: -7, tz: -6, vh: 10 },
  cobble: { tx: 2, tz: 2, vh: 6 },
  shore: { tx: 8, tz: 5, vh: 9 },
  rocks: { tx: -2, tz: 8, vh: 7 },
};

export default async function build(engine, params) {
  const p = (k, d) => (params.has(k) ? Number(params.get(k)) : d);
  const view = VIEWS[params.get('view') || 'centre'] || VIEWS.centre;
  const yaw = p('yaw', 1) * Math.PI / 4;
  const level = -1.0;

  const T0 = performance.now();
  const terrain = params.get('minimal') === '1' ? createTerrain(engine, { size: 48, height: 0.6, waterLevel: -0.5 }) : createTerrain(engine, {
    size: 64, seed: 7, height: 2.2,
    water: { level, shore: params.get('shore') || 'sand', bounds: { x: 9, z: 6, r: 6.5 } },
    plateaus: [{ x: -8, z: -8, r: 5.5, levels: 2, gap: 2.2 }, { x: 13, z: -11, r: 3.5, levels: 1 }],
    terrace: params.get('terrace') === '1',
    flatten: [{ x: 2, z: 2, r: 3.2 }, { x: 9, z: 6, r: 5.5, h: 0.05 }],
    basins: [{ x: 9, z: 6, rx: 4.2, rz: 2.8, rot: 0.5, depth: 1.3, edge: 0.85 }],
    paths: [{ points: [[-14, 12], [-6, 7], [0, 4], [2, 2], [7, -2], [12, -4]], width: 1.3 }],
    zones: [{ type: 'cobble', x: 2, z: 2, r: 2.8 }, { type: 'dirt', x: -3, z: -2, r: 1.6 }, { type: 'cobble', x: -12, z: 6, r: 2 }],
  });

  const T1 = performance.now();
  createRocks(engine, terrain, { count: 10, seed: 3, area: { x: 0, z: 6, r: 9 }, size: [0.35, 1.1] });
  createRocks(engine, terrain, { kind: 'outcrop', count: 3, seed: 5, area: { x: -6, z: 2, r: 2.5 }, size: [0.7, 1.0], moss: 0.5, pebbles: 6 });
  createRocks(engine, terrain, { count: 4, seed: 9, area: { x: 9, z: 6, r: 4.5 }, submerged: true, size: [0.4, 0.9], pebbles: 14 });

  if (params.get('timing') === '1') console.warn(`terrain ${(T1 - T0).toFixed(0)} ms, rocks ${(performance.now() - T1).toFixed(0)} ms`);
  const sunDir = sunDirFor(yaw, p('az', 25), p('el', 50));
  engine.setSun({ dir: sunDir, shadowExtent: 24 });
  if (params.get('tod')) {
    try { const sky = await import('../src/world/sky.js'); sky.applyTimeOfDay?.(engine, params.get('tod')); } catch (e) { /* lighting module not ready */ }
  }
  if (params.get('clouds') === '0' && engine.toonUniforms.uCloud) engine.toonUniforms.uCloud.value.x = 0;
  const tx = p('tx', view.tx), tz = p('tz', view.tz);
  engine.camera.set({ target: new THREE.Vector3(tx, p('ty', terrain.heightAt(tx, tz)), tz), yaw, pitch: Math.PI / 6, viewHeight: p('vh', view.vh) });
  window.__terrain = terrain;
}
