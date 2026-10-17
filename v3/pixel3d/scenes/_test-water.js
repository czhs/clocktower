// Water test scene (owner: water). docs/TECHNIQUES.md §7.9.
//   ?variant=pond   (default) meadow pond: half-submerged rocks, a pillar standing in the water, a far-bank
//                   tree + pillar (reflections), lily pads (FLAG_NONE), gentle near bank / steep far bank
//   ?variant=basin  octagonal shrine basin with the goblet fountain, water bounded by a polygon slot
//   ?mods=0         use only the simple built-in stand-ins (no terrain/rocks/props/trees modules)
//   ?level=0.05     override the water level;  ?water=0 disables the water (compare)
//   ?dyn=1          dynamic water level (slow stepped tide)
//   ?spriteShore=below|all|none   shore texels next to FLAG_NONE sprites (pond variant)
import * as THREE from 'three';
import { toonMesh, rampFromTones } from '../src/materials/toon.js';
import { rng, fbm2 } from '../src/core/noise.js';
import { createWater } from '../src/world/water.js';

function place(center, yaw, r, angDeg) {
  const F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const a = THREE.MathUtils.degToRad(angDeg);
  return center.clone().addScaledVector(F, r * Math.cos(a)).addScaledVector(R, r * Math.sin(a));
}

async function tryImport(path, use) {
  if (!use) return null;
  try { return await import(path); } catch (e) { console.warn('water test: fallback for', path, e.message); return null; }
}

// ---- simple stand-ins (used with ?mods=0 or if a module is broken mid-run) ----
function ownTerrain(engine, { basins, level }) {
  const meadow = (x, z) => 0.45 + (fbm2(x * 0.08 + 5, z * 0.08 + 5, { seed: 4 }) - 0.5) * 0.3;
  const heightAt = (x, z) => {
    let h = meadow(x, z);
    for (const b of basins) {
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      const dx = x - b.x, dz = z - b.z, u = (dx * c - dz * s) / b.rx, v = (dx * s + dz * c) / b.rz;
      const e = Math.sqrt(u * u + v * v);                 // 1 on the ellipse
      const t = THREE.MathUtils.smoothstep(1 + b.edge / Math.min(b.rx, b.rz) - e, 0, 1.4 * b.edge / Math.min(b.rx, b.rz));
      h = Math.min(h, THREE.MathUtils.lerp(meadow(x, z), level - b.depth, t));
    }
    return h;
  };
  const size = 44, seg = 176;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color('#75A558'), sand = new THREE.Color('#C2AE84'), wet = new THREE.Color('#9E9A86'), mud = new THREE.Color('#7E8A72');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = heightAt(x, z);
    pos.setY(i, y);
    const c = y > level + 0.3 ? grass : y > level + 0.08 ? sand : y > level - 0.25 ? wet : mud;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = toonMesh(engine, geo, { vertexColors: true, normalNoise: 0.15 });
  engine.scene.add(mesh);
  return { mesh, heightAt, size, waterLevel: level };
}

function ownRock(engine, pos, r, seed) {
  const rand = rng(seed);
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + rand() * 0.3), p.getY(i) * (0.6 + rand() * 0.2), p.getZ(i) * (0.85 + rand() * 0.3));
  g.computeVertexNormals();
  const m = toonMesh(engine, g, { ...rampFromTones('#7C7D8F', '#6F6882', '#45425F'), flatShading: true });
  m.scale.setScalar(r); m.position.copy(pos); m.rotation.y = Math.PI / 4 * Math.floor(rand() * 8);
  engine.scene.add(m);
  return m;
}

function ownPillar(engine, pos, height, seed) {
  const rand = rng(seed), g = new THREE.Group();
  const mat = rampFromTones('#BBAC97', '#8C7E72', '#5B5A64');
  let y = 0;
  while (y < height) {
    const h = 0.35 + rand() * 0.2, w = 0.8 + rand() * 0.15;
    const m = toonMesh(engine, new THREE.BoxGeometry(w, h, w * (0.9 + rand() * 0.1)), { ...mat, flatShading: true });
    m.position.set((rand() - 0.5) * 0.08, y + h / 2, (rand() - 0.5) * 0.08);
    g.add(m); y += h;
  }
  g.position.copy(pos); g.rotation.y = Math.PI / 4;
  engine.scene.add(g);
  return g;
}

function ownTree(engine, pos, seed) {
  const g = new THREE.Group();
  const trunk = toonMesh(engine, new THREE.CylinderGeometry(0.16, 0.24, 2.4, 6), { ...rampFromTones('#7A5A5E', '#654853', '#574E68'), flatShading: true });
  trunk.position.y = 1.2;
  const crown = toonMesh(engine, new THREE.IcosahedronGeometry(1.7, 1), { ...rampFromTones('#84B35B', '#689763', '#46726C'), flatShading: true });
  crown.position.y = 3.3; crown.rotation.y = seed;
  g.add(trunk, crown); g.position.copy(pos);
  engine.scene.add(g);
  return g;
}

function lilyPads(engine, terrain, level, center, yaw, seed) {
  const rand = rng(seed);
  const tone = rampFromTones('#8CC06A', '#5E9A5A', '#3F6E55');
  const pads = [];
  const groups = [[2.4, 60], [1.6, 150], [3.4, -110]];
  for (const [r, ang] of groups) {
    const c = place(center, yaw, r, ang);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.3 + rand(), d = k === 0 ? 0 : 0.55 + rand() * 0.2;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (terrain.heightAt(x, z) > level - 0.15) continue;
      const rr = 0.18 + rand() * 0.16;
      const geo = new THREE.CircleGeometry(rr, 8, 0.4, Math.PI * 2 - 0.55).rotateX(-Math.PI / 2);
      const m = toonMesh(engine, geo, { ...tone, outline: 'none' }, { castShadow: false, receiveShadow: true });
      m.position.set(x, level + 0.012, z); m.rotation.y = Math.floor(rand() * 8) * Math.PI / 4;
      engine.scene.add(m); pads.push(m);
    }
  }
  return pads;
}

export default async function build(engine, params) {
  const variant = params.get('variant') || 'pond';
  const useMods = params.get('mods') !== '0';
  const yaw = variant === 'basin' ? Math.PI / 4 : -Math.PI / 4;
  const target = variant === 'basin' ? new THREE.Vector3(0, 0.5, 0) : place(new THREE.Vector3(0, 0.2, 0), yaw, 1.5, 0);
  // ?pan=dx,dy shifts the view by whole texels (crawl check: diff against an unshifted capture)
  if (params.get('pan')) {
    const [px, py] = params.get('pan').split(',').map(Number), tw = Number(params.get('vh') || 10) / 360;
    target.add(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(px * tw));
    target.add(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar((py || 0) * tw / Math.sin(Math.PI / 6)));
  }
  engine.camera.set({ target, yaw, pitch: Math.PI / 6, viewHeight: Number(params.get('vh') || 10) });

  const sky = await tryImport('../src/world/sky.js', useMods);
  try {
    if (sky) sky.applyTimeOfDay(engine, params.get('tod') || (variant === 'basin' ? 'noon' : 'morning'),
      variant === 'basin' ? { relAz: 25, elev: 50 } : { relAz: 55, elev: 38 });
    else throw new Error('no sky');
  } catch (e) {
    engine.setSun({ dir: new THREE.Vector3(0.3, 0.75, 0.55).normalize() });
    engine.style.sky.set('#CFE6EC');
  }

  const terrMod = await tryImport('../src/world/terrain.js', useMods);
  const rocksMod = await tryImport('../src/world/rocks.js', useMods);
  const props = await tryImport('../src/world/props.js', useMods);
  const trees = await tryImport('../src/world/trees.js', useMods);
  const grassMod = params.get('grass') === '1' ? await tryImport('../src/world/grass.js', useMods) : null;

  const C0 = new THREE.Vector3(0, 0, 0);
  const levelParam = params.get('level');

  if (variant === 'basin') {
    const terrain = terrMod
      ? terrMod.createTerrain(engine, { size: 64, height: 0.5, flatten: [{ x: 0, z: 0, r: 6, h: 0 }], basins: [{ x: 0, z: 0, rx: 2.9, depth: 0.6, edge: 0.15 }] })
      : ownTerrain(engine, { basins: [], level: -1 });
    let water = null;
    if (props) {
      const shrine = props.createShrine(engine, { position: new THREE.Vector3(0, 0, 0), terrain, seed: 5 });
      engine.scene.add(shrine);
      const w = shrine.userData.water;
      if (params.get('water') !== '0') water = createWater(engine, null, { level: levelParam ? Number(levelParam) : w.level, shape: { kind: 'polygon', points: w.polygon }, depthMax: 0.3 });
      for (const [r, ang, h] of [[5.2, -60, 2.8], [5.6, 40, 3.2], [5.0, 125, 2.4]]) {
        const p = props.createPillar(engine, { height: h, seed: ang + 200, position: place(C0, yaw, r, ang), terrain });
        if (!p.parent) engine.scene.add(p);
      }
    } else {
      // stand-in basin: 8 wall blocks around an octagonal slot
      const apo = 2.3, tone = rampFromTones('#BBAC97', '#8C7E72', '#5B5A64');
      const floor = toonMesh(engine, new THREE.CylinderGeometry(apo / Math.cos(Math.PI / 8), apo / Math.cos(Math.PI / 8), 0.2, 8).rotateY(Math.PI / 8), { ...tone, flatShading: true });
      floor.position.y = -0.4; engine.scene.add(floor);
      for (let s = 0; s < 8; s++) {
        const a = s * Math.PI / 4;
        const len = 2 * (apo + 0.5) * Math.tan(Math.PI / 8) + 0.02;
        const m = toonMesh(engine, new THREE.BoxGeometry(len, 1.05, 0.5), { ...tone, flatShading: true });
        m.position.set(Math.sin(a) * (apo + 0.25), 0.2, Math.cos(a) * (apo + 0.25)); m.rotation.y = a;
        engine.scene.add(m);
      }
      const gob = toonMesh(engine, new THREE.CylinderGeometry(0.6, 0.6, 0.75, 8), { ...tone, flatShading: true });
      gob.position.y = -0.1; engine.scene.add(gob);
      const poly = Array.from({ length: 8 }, (_, i) => { const a = (i + 0.5) * Math.PI / 4, R = apo / Math.cos(Math.PI / 8); return [Math.sin(a) * R, Math.cos(a) * R]; });
      if (params.get('water') !== '0') water = createWater(engine, null, { level: levelParam ? Number(levelParam) : -0.08, shape: { kind: 'polygon', points: poly }, depthMax: 0.3 });
    }
    return;
  }

  // ---------------- pond ----------------
  const level = levelParam ? Number(levelParam) : 0;
  const bA = place(C0, yaw, 0.8, -70), bB = place(C0, yaw, 1.8, 75);
  const basins = [
    { x: bA.x, z: bA.z, rx: 5.4, rz: 3.4, rot: yaw, depth: 1.35, edge: 0.55 },
    { x: bB.x, z: bB.z, rx: 3.6, rz: 2.8, rot: yaw + 0.5, depth: 1.35, edge: 0.5 },
  ];
  let terrain = null;
  if (terrMod) {
    try {
      terrain = terrMod.createTerrain(engine, {
        size: 64, height: 0.25, seed: 5, water: { level, shoreBand: 0.22, wetBand: 0.1 },
        basins, flatten: [{ x: 0, z: 0, r: 40, h: level + 0.45, falloff: 12 }],
      });
    } catch (e) { console.warn('water test: terrain module failed', e.message); terrain = null; }
  }
  terrain ??= ownTerrain(engine, { basins, level });

  // pillar standing in the water + one on the far bank; rocks half-submerged
  const pIn = place(C0, yaw, 1.3, -50), pFar = place(C0, yaw, 5.6, 25);
  const tFar = place(C0, yaw, 6.6, -10), tRight = place(C0, yaw, 7.6, 62);
  if (props) {
    for (const [p, h, s] of [[pIn, 2.8, 11], [pFar, 3.2, 12]]) {
      const g = props.createPillar(engine, { height: h, seed: s, position: p, terrain });
      if (!g.parent) engine.scene.add(g);
    }
  } else {
    ownPillar(engine, pIn.clone().setY(terrain.heightAt(pIn.x, pIn.z) - 0.1), 2.8, 11);
    ownPillar(engine, pFar.clone().setY(terrain.heightAt(pFar.x, pFar.z) - 0.1), 3.2, 12);
  }
  if (trees) {
    for (const [p, s] of [[tFar, 3], [tRight, 4]]) {
      const g = trees.createTree(engine, { position: p.clone().setY(terrain.heightAt(p.x, p.z)), seed: s, height: 5, kind: 'round' });
      if (!g.parent) engine.scene.add(g);
    }
  } else {
    ownTree(engine, tFar.clone().setY(terrain.heightAt(tFar.x, tFar.z)), 3);
    ownTree(engine, tRight.clone().setY(terrain.heightAt(tRight.x, tRight.z)), 4);
  }
  const rk = [[place(C0, yaw, 1.2, 100), 0.7, 1], [place(C0, yaw, 3.0, 125), 0.55, 2], [place(C0, yaw, 3.3, -100), 0.45, 3], [place(C0, yaw, 2.6, 175), 0.3, 4]];
  if (rocksMod) {
    rocksMod.createRocks(engine, terrain, { count: 5, seed: 9, area: { x: C0.x, z: C0.z, r: 4.5 }, submerged: true, size: [0.4, 0.9], pebbles: 12 });
  }
  for (const [p, r, s] of rk) ownRock(engine, p.clone().setY(Math.max(terrain.heightAt(p.x, p.z), level - 0.6) + r * 0.15), r, s);
  lilyPads(engine, terrain, level, C0, yaw, 21);
  if (grassMod) {
    try { grassMod.createGrass(engine, terrain, {}); } catch (e) { console.warn('water test: grass failed', e.message); }
  }

  if (params.get('water') !== '0') {
    const shp = params.get('shape');
    const wopts = shp === 'ellipse' ? { shape: { kind: 'ellipse', center: [C0.x, C0.z], radii: [6, 4] } }
      : shp === 'rect' ? { bounds: { x0: -7, z0: -7, x1: 7, z1: 7 } } : { seed: [C0.x, C0.z] };
    if (params.get('spriteShore')) wopts.spriteShore = params.get('spriteShore');
    const water = createWater(engine, terrain, { level, ...wopts });
    if (params.get('dyn') === '1') engine.onUpdate((t) => water.setLevel(level + Math.round(Math.sin(t * 0.5) * 4) * 0.04));
  }
}
