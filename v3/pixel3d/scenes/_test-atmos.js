// Atmosphere test scene (owner: atmosphere). TECHNIQUES §8.
//   ?tod=golden|night (default golden)   ?rays=0   ?fog=0   ?parts=0   ?grass=0   ?world=0 (flat toon plane)
//   ?canopy=crowns|slab   ?trees=1 (glade-like ring of real trees instead, DEFAULT godray parameters)
//   ?mist=0.4 ?cover=0.4 ?fogamt=0.4 (fog tuning)   ?vh=11   ?yaw=45 (deg)   ?pan=x,z (target offset, crawl checks)
//   ?kind=dust|fireflies|leaves|rain [&count=N&slant=1] (extra particle layer)   ?halo=1|2 (night fireflies)
//   ?raysDebug=1 (quantised ray bands) | 2 (raw lit-air count) | 3.. (sunLit at the surface + k·1.5 m)
// A canopy with holes hangs ~9 m up over the far-left (towards the low sun, mostly beyond the top edge of the
// frame), a few tall posts stand in the clearing: shafts stream from upper-left to lower-right, are cut by the
// posts and land as lit patches. Night = moonbeams + fireflies.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMesh, rampFromTones } from '../src/materials/toon.js';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { addGrade } from '../src/post/grade.js';
import { addGodrays } from '../src/post/godrays.js';
import { addFog } from '../src/post/fog.js';
import { createParticles } from '../src/world/particles.js';
import { fbm2, rng, poissonDisk2D } from '../src/core/noise.js';

function place(center, yaw, r, angDeg) {
  const F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const a = THREE.MathUtils.degToRad(angDeg);
  return center.clone().addScaledVector(F, r * Math.cos(a)).addScaledVector(R, r * Math.sin(a));
}

export default async function build(engine, params) {
  const { scene } = engine;
  const tod = params.get('tod') || 'golden';
  const night = tod === 'night';
  const yaw = THREE.MathUtils.degToRad(Number(params.get('yaw') ?? 45));
  const pan = (params.get('pan') || '0,0').split(',').map(Number);
  const target = new THREE.Vector3(pan[0], 0.6, pan[1]);
  const O = new THREE.Vector3(0, 0, 0);
  engine.camera.set({ target, yaw, pitch: Math.PI / 6, viewHeight: Number(params.get('vh') ?? 11) });
  // sun / moon back-left so the canopy (far-left) cuts the light into shafts
  applyTimeOfDay(engine, tod, night ? { relAz: -135, elev: 36 } : { relAz: -135, elev: 24 });
  setClouds(engine, { scale: 0 });
  if (params.get('grade') !== '0') addGrade(engine, {});

  // ------------------------------------------------------------------ ground
  const G = night ? rampFromTones('#6E9C93', '#3F6A6C', '#22394A') : rampFromTones('#BBD985', '#75A558', '#3B6B5A');
  let terrain = null;
  if (params.get('world') !== '0') {
    try {
      const { createTerrain } = await import('../src/world/terrain.js');
      terrain = createTerrain(engine, { size: 64, seed: 5, height: 0.35, flatten: [{ x: 0, z: 0, r: 6 }] });
      if (params.get('grass') !== '0') {
        const { createGrass } = await import('../src/world/grass.js');
        createGrass(engine, terrain, { area: 'view', flowers: true, accent: 0.03 });
      }
    } catch (e) { console.warn('terrain/grass unavailable, flat plane:', e.message); terrain = null; }
  }
  if (!terrain) {
    scene.add(toonMesh(engine, new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), { ...G, normalNoise: 0.15 }, { castShadow: false }));
  }
  const hAt = (x, z) => (terrain ? terrain.heightAt(x, z) : 0);

  // ------------------------------------------------------------------ canopy with holes
  // ?canopy=crowns (default): overlapping low-poly crown blobs (organic shaft shapes) with clearings;
  // ?canopy=slab: a slab of 0.9 m cells with FBM holes. Both hang ~9 m up, mostly beyond the top edge.
  const LEAF = night ? rampFromTones('#4E7A6A', '#2E5050', '#1A2E36') : rampFromTones('#B8B04E', '#6E8A45', '#3C5550');
  const CANOPY_Y = 9.0;
  const cells = [];
  const R = rng(17);
  const holes = [[-9, 8, 1.6], [-5, 12, 1.9], [-13, 4, 1.5], [-2, 6, 1.3], [-7, 2.5, 1.1], [-15, 11, 1.7], [1, 3, 1.0], [-11, 15, 1.5], [-19, 7, 1.3], [4, 9, 1.4],
    [-4, -2, 1.1], [-10, -3, 1.2], [2, -1, 0.9], [-16, 0, 1.3], [6, 2, 1.1], [-21, 14, 1.4]];
  const inHole = (a, d, k = 1) => holes.some(([ha, hd, hr]) => (a - ha) ** 2 + (d - hd) ** 2 < (hr * k) ** 2);
  const at = (a, d) => place(O, yaw, d, 0).add(place(O, yaw, a, 90));   // d = screen-up (far), a = screen-right
  const treesMode = params.get('trees') === '1';
  if (treesMode) {
    // glade-like ring of real tall trees (src/world/trees.js); default godray parameters below
    const { createTree } = await import('../src/world/trees.js');
    const ring = [[13, -20], [14, 10], [12, 38], [12.5, -48], [12, 68], [11, -78], [10.5, 105], [11, -112], [11.5, 140], [10.5, -148], [12, 178], [16, -2], [15.5, 22]];
    ring.forEach(([r, ang], i) => {
      const p = place(O, yaw, r, ang + (R() - 0.5) * 8);
      p.y = hAt(p.x, p.z) - 0.1;
      createTree(engine, { kind: 'tall', seed: 40 + i * 7, position: p, height: 6.5 + R() * 1.5 });
    });
  } else if (params.get('canopy') === 'slab') {
    const cs = 0.9;
    for (let a = -40; a <= 16; a += cs) {
      for (let d = -3; d <= 34; d += cs) {
        if (fbm2(a * 0.16 + 4, d * 0.16 + 9, { seed: 11, octaves: 4 }) < 0.3 || inHole(a, d)) continue;
        if (d < -2.2 + 2.0 * fbm2(a * 0.4, 3.3, { seed: 2, octaves: 2 })) continue;
        const P = at(a, d), h = 0.45 + Math.floor(R() * 3) * 0.15;
        const g = new THREE.BoxGeometry(cs, h, cs).rotateY(yaw);
        g.translate(P.x, CANOPY_Y + Math.floor(fbm2(a * 0.5, d * 0.5, { seed: 3 }) * 4) * 0.15, P.z);
        g.deleteAttribute('uv');
        cells.push(g);
      }
    }
  } else {
    for (const [a, d] of poissonDisk2D({ x0: -44, z0: -7.5, w: 62, h: 44, r: 1.9, seed: 21 })) {
      if (inHole(a, d, 1.6)) continue;
      if (d < -7 + 2.0 * fbm2(a * 0.3, 1.7, { seed: 4, octaves: 2 })) continue;   // ragged near edge (top of frame)
      const rad = 1.3 + R() * 1.0;
      const g = new THREE.IcosahedronGeometry(rad, 0);
      g.scale(1, 0.6, 1).rotateY(Math.floor(R() * 8) * Math.PI / 4);
      const P = at(a, d);
      g.translate(P.x, CANOPY_Y + (R() - 0.5) * 0.8, P.z);
      g.deleteAttribute('uv');
      cells.push(g);
    }
  }
  if (cells.length) {
    const canopy = toonMesh(engine, mergeGeometries(cells), { ...LEAF, flatShading: true, outline: 'depth' });
    canopy.receiveShadow = true;
    scene.add(canopy);
  }

  // ------------------------------------------------------------------ tall posts (trunks / pillars)
  const TRUNK = night ? rampFromTones('#5F6079', '#3E3F58', '#262840') : rampFromTones('#8E5E52', '#654853', '#574E68');
  const posts = [[3.0, -150, 9.4, 0.42], [4.8, -70, 9.4, 0.38], [2.2, 40, 9.4, 0.45], [6.5, 120, 9.4, 0.40], [7.5, 15, 9.4, 0.36], [8.5, -110, 9.4, 0.40]];
  for (const [r, ang, h, w] of treesMode ? [] : posts) {
    const p = place(O, yaw, r, ang);
    const m = toonMesh(engine, new THREE.BoxGeometry(w, h, w), { ...TRUNK, flatShading: true });
    m.position.set(p.x, hAt(p.x, p.z) + h / 2 - 0.05, p.z);
    m.rotation.y = yaw;
    scene.add(m);
  }
  // a low stone block + slab for rays landing on solids
  const STONE = night ? rampFromTones('#8C8FA6', '#5F6079', '#383A52') : rampFromTones('#BBAC97', '#8C7E72', '#5B5A64');
  const blk = toonMesh(engine, new THREE.BoxGeometry(1.2, 0.8, 1.2), { ...STONE, flatShading: true });
  const bp = place(O, yaw, 1.8, -100); blk.position.set(bp.x, hAt(bp.x, bp.z) + 0.38, bp.z); blk.rotation.y = yaw; scene.add(blk);
  const slab = toonMesh(engine, new THREE.BoxGeometry(1.6, 0.25, 1.0), { ...STONE, flatShading: true });
  const sp = place(O, yaw, 2.5, 150); slab.position.set(sp.x, hAt(sp.x, sp.z) + 0.1, sp.z); slab.rotation.y = yaw + 0.0; scene.add(slab);

  // ------------------------------------------------------------------ atmosphere
  if (params.get('rays') !== '0') {
    const ro = treesMode ? {} : { top: 3.6, density: 0.3 };
    addGodrays(engine, night ? { strength: 0.22, color: '#9FB6E8', mistBoost: 0.6, ...ro }
      : treesMode ? { mistBoost: 0.6 } : { strength: 0.45, mistBoost: 0.6, ...ro });
  }
  if (params.get('fog') !== '0') {
    const fo = night
      ? { mistAmount: 0.35, mistDepth: 0.9, mistScale: 0.08, mistCover: 0.5, fogAmount: 0.35, color: '#1E2A44' }
      : { mistAmount: 0.4, mistDepth: 0.9, mistScale: 0.15, mistCover: 0.4, mistDrift: [0.05, 0.02], fogAmount: 0.4, color: '#C9B9A6' };
    if (params.has('mist')) fo.mistAmount = Number(params.get('mist'));
    if (params.has('cover')) fo.mistCover = Number(params.get('cover'));
    if (params.has('fogamt')) fo.fogAmount = Number(params.get('fogamt'));
    addFog(engine, fo);
  }
  const bounds = { x0: -11, x1: 11, y0: 0.1, y1: 5.5, z0: -11, z1: 11 };
  if (params.get('parts') !== '0') {
    if (night) createParticles(engine, { kind: 'fireflies', count: 90, seed: 3, halo: Number(params.get('halo') ?? 1), bounds: { ...bounds, y0: 0.2, y1: 2.2 } });
    else {
      createParticles(engine, { kind: 'dust', count: 1200, seed: 5, bounds: { ...bounds, y1: 4.5 } });
      createParticles(engine, { kind: 'leaves', count: 40, seed: 7, bounds });
    }
    const extra = params.get('kind');
    if (extra) createParticles(engine, { kind: extra, seed: 9, count: params.has('count') ? Number(params.get('count')) : undefined, slant: params.get('slant') === '1', bounds: { ...bounds, y1: extra === 'rain' ? 9 : 5.5 } });
  }
}
