// Smoke test for the core pipeline: primitives on a plane, slow camera drift.
import * as THREE from 'three';
import { toonMesh } from '../src/materials/toon.js';

export default async function build(engine) {
  const { scene } = engine;
  const ground = toonMesh(engine, new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), { color: 0x6a9a4a });
  scene.add(ground);
  const mats = [0xd9a066, 0x8f563b, 0xcbdbfc, 0xac3232];
  for (let i = 0; i < 8; i++) {
    const g = i % 2 ? new THREE.BoxGeometry(2, 2 + i * 0.3, 2) : new THREE.IcosahedronGeometry(1.3, 1);
    const m = toonMesh(engine, g, { color: mats[i % 4], flatShading: i % 2 === 0 });
    const a = i / 8 * Math.PI * 2;
    m.position.set(Math.cos(a) * 6, 1.2, Math.sin(a) * 6);
    m.rotation.y = a;
    scene.add(m);
  }
  const trunk = toonMesh(engine, new THREE.CylinderGeometry(0.3, 0.4, 3, 8), { color: 0x5b3a29 });
  trunk.position.y = 1.5;
  const crown = toonMesh(engine, new THREE.ConeGeometry(2, 4, 8), { color: 0x2f6b3a, flatShading: true });
  crown.position.y = 4.5;
  scene.add(trunk, crown);
  engine.setSun({ dir: new THREE.Vector3(0.6, 0.9, 0.35), intensity: 1 });
  engine.camera.set({ target: new THREE.Vector3(0, 1, 0), viewHeight: 20 });
  engine.onUpdate((t) => { engine.camera.target.x = t * 0.7; });
}
