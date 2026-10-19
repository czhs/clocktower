// Integration scene (owner: lead). EVERY module together, laid out like t3ssel8r's Ruined Shrine
// (ART_DIRECTION §1): terrain + rocks + props (shrine, pillars, arch, slabs, debris, lanterns) + grass +
// flowers + trees + water (basin) + particles + fog + godrays + grade + time of day.
//   ?tod=noon|morning|golden|night (default noon)   ?az=<relAz deg> ?elev=<deg>   ?yaw=45 ?vh=10
//   ?cover=0.5 (cloud cover, 0 = off)   ?rays=0 ?fog=0 ?parts=0 ?grass=0 ?trees=0 ?water=0 ?rocks=0 ?grade=0
//   ?pan=x,y  shift the camera target by whole texels along screen right / up (crawl checks)
// Build timings per module are published in window.__pixel.info().stats (tools/shot.mjs prints them).
import * as THREE from 'three';
import { toonMesh, rampFromTones } from '../src/materials/toon.js';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { createTerrain } from '../src/world/terrain.js';
import { createRocks } from '../src/world/rocks.js';
import {
  createShrine, createPillar, createFallenArch, createSlab, createDebris, createLantern,
} from '../src/world/props.js';
import { createGrass, viewArea } from '../src/world/grass.js';
import { FLOWER_TINTS } from '../src/world/flowers.js';
import { createTree } from '../src/world/trees.js';
import { createWater } from '../src/world/water.js';
import { createParticles } from '../src/world/particles.js';
import { addGodrays } from '../src/post/godrays.js';
import { addFog } from '../src/post/fog.js';
import { addGrade } from '../src/post/grade.js';

// ang: 0 = far (screen-up), 90 = screen-right, 180 = near, -90 = screen-left (ART_DIRECTION §0)
function place(center, yaw, r, angDeg) {
  const F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const a = THREE.MathUtils.degToRad(angDeg);
  return center.clone().addScaledVector(F, r * Math.cos(a)).addScaledVector(R, r * Math.sin(a));
}

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const on = (k) => P(k, '1') !== '0';
  const stats = engine.stats;
  let t0 = performance.now();
  const lap = (k) => { const t = performance.now(); stats[`build_${k}_ms`] = Math.round(t - t0); t0 = t; };

  const tod = P('tod', 'noon');
  const night = tod === 'night', golden = tod === 'golden';
  const yaw = THREE.MathUtils.degToRad(Number(P('yaw', 45)));
  const vh = Number(P('vh', 10));
  const O = new THREE.Vector3(0, 0, 0);

  // ---- camera first: grass 'view' area, tree leaf density and the sun all depend on it
  const target = new THREE.Vector3(0, 0.5, 0);
  // grass area from the UN-panned view (a pan must not change the Poisson set, or crawl checks see new tufts)
  engine.camera.set({ target, yaw, pitch: Math.PI / 6, viewHeight: vh });
  const grassArea = viewArea(engine, 4);
  if (params.has('pan')) {
    const [px, py] = P('pan').split(',').map(Number), tw = vh / 360;
    target.addScaledVector(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), px * tw);
    target.addScaledVector(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), (py || 0) * tw / Math.sin(Math.PI / 6));
  }
  engine.camera.set({ target, yaw, pitch: Math.PI / 6, viewHeight: vh });

  // ?turn=1: a Q-style 45° camera turn starting at t = 1 s (rotation + re-sort + reflection check)
  if (params.get('turn')) {
    let started = false;
    engine.onUpdate((t) => { if (!started && t >= 1) { started = true; engine.camera.rotateBy(Number(P('turn')), 0.3, { at: 1 }); } });
  }

  // ---- time of day. Day: sun front-left (relAz 155: lit left faces, shadows fall up-right, as in the refs)
  // morning keeps its preset sun (relAz 60, elev 35)
  const sunOpts = night ? { relAz: 140, elev: 45 } : golden ? { relAz: -140, elev: 26 } : tod === 'morning' ? {} : { relAz: 155, elev: 50 };
  if (params.has('az')) sunOpts.relAz = Number(P('az'));
  if (params.has('elev')) sunOpts.elev = Number(P('elev'));
  applyTimeOfDay(engine, tod, { ...sunOpts, shadowExtent: 22 });
  const cover = Number(P('cover', golden || night ? 0 : tod === 'morning' ? 0.5 : 0.42)); // cloud layout depends on the sun dir
  setClouds(engine, cover > 0 ? { scale: 0.045, cover } : { scale: 0 });
  lap('sky');

  // ---- terrain: flat pad under the shrine, basin carved below the floor, cobble corners, dirt top-left
  const cb = (r, a) => { const p = place(O, yaw, r, a); return { x: p.x, z: p.z }; };
  const terrain = createTerrain(engine, {
    size: 64, height: 0.6, seed: 4,
    flatten: [{ x: 0, z: 0, r: 7, h: 0 }],
    basins: [{ x: 0, z: 0, rx: 2.55, depth: 0.7, edge: 0.1 }],
    zones: [
      { type: 'cobble', ...cb(10.5, -52), r: 3.6 }, { type: 'cobble', ...cb(10.5, 52), r: 3.4 },
      { type: 'cobble', ...cb(10, -128), r: 3.6 }, { type: 'dirt', ...cb(12, -35), r: 2.6 },
    ],
  });
  lap('terrain');

  // ---- props (ART_DIRECTION §1 element table)
  const props = [];
  const add = (o) => { if (!o.parent) engine.scene.add(o); props.push(o); return o; };
  const shrine = add(createShrine(engine, { seed: 5, position: O.clone(), terrain }));
  const bases = [];
  [[-150, 5.3, 2.9], [-105, 5.9, 3.2], [-60, 5.6, 2.5], [-15, 6.1, 3.4], [40, 5.4, 2.7], [80, 6.0, 3.0], [125, 5.6, 2.4]]
    .forEach(([ang, r, h], i) => {
      const p = place(O, yaw, r, ang + ((i * 37) % 13) - 6);
      bases.push({ x: p.x, z: p.z, r: 0.9 });
      add(createPillar(engine, { height: h, seed: 100 + i * 13, position: p, terrain, yaw: i === 4 ? Math.PI / 4 : 0 }));
    });
  [[-170, 4.6, 1.1], [100, 4.5, 0.7], [150, 5.0, 1.4], [178, 6.3, 1.2]].forEach(([ang, r, h], i) => {
    const p = place(O, yaw, r, ang);
    bases.push({ x: p.x, z: p.z, r: 0.9 });
    add(createPillar(engine, { height: h, broken: true, seed: 300 + i * 11, position: p, terrain }));
  });
  const a0 = place(O, yaw, 4.3, 20), a1 = place(O, yaw, 5.6, 55);
  const stub = add(createPillar(engine, { height: 1.0, broken: true, seed: 401, position: a0, terrain, debris: false }));
  add(createFallenArch(engine, {
    from: new THREE.Vector3(a0.x, stub.position.y + stub.userData.height + 0.1, a0.z),
    to: new THREE.Vector3(a1.x, terrain.heightAt(a1.x, a1.z) + 0.1, a1.z), blocks: 7, seed: 3, terrain,
  }));
  [[-20, 7.2], [-6, 8.3], [4, 7.4], [10, 8.6]].forEach(([ang, r], i) => add(createSlab(engine, { position: place(O, yaw, r, ang), terrain, seed: 60 + i })));
  bases.push({ x: a1.x, z: a1.z, r: 1.0 });
  add(createDebris(engine, terrain, { around: bases, count: 36, seed: 7, avoid: (x, z) => Math.hypot(x, z) < 3.9 }));
  add(createLantern(engine, { position: place(O, yaw, 4.7, -30), terrain, seed: 3, lit: night, light: night }));
  add(createLantern(engine, { position: place(O, yaw, 4.4, 160), terrain, seed: 8, lit: night, light: night }));
  lap('props');

  // ---- the one saturated accent: a cyan cube above the far rim, bobbing ±2 texels at a stepped 2 fps
  const cube = toonMesh(engine, new THREE.BoxGeometry(0.35, 0.35, 0.35), { ...rampFromTones('#7FD3F5', '#4BA8E8', '#2F7FC4'), flatShading: true });
  const cubeBase = place(O, yaw, 2.9, 0).setY(1.7);
  cube.position.copy(cubeBase);
  engine.scene.add(cube);
  engine.camera.snapObjectToTexel(cube);
  engine.onUpdate((t) => {
    const k = Math.floor(t * 2) / 2;
    cube.position.y = cubeBase.y + Math.round(Math.sin(k * Math.PI * 0.5) * 2) * engine.camera.texelWorld;
  });

  // ---- rocks: boulders + pebbles away from the shrine ring
  const shrineAvoid = [{ x: 0, z: 0, r: 7.2 }, ...bases];
  let rocks = null;
  if (on('rocks')) {
    rocks = createRocks(engine, terrain, {
      count: 6, seed: 6, area: { x: 0, z: 0, r: 13 }, size: [0.3, 0.6], cluster: 0.35, pebbles: 30, avoid: shrineAvoid,
      pebbleArea: { x: 0, z: 0, r: 9 }, outline: P('rockoutline', 'full'),
    });
  }
  lap('rocks');

  // ---- trees (round crowns entering from the edges / bottom corners)
  const treeAvoid = [];
  if (on('trees')) {
    [[9.5, -74, 4.6], [9.2, -100, 4.0], [9.8, 70, 4.4], [9.2, 96, 5.0], [15.5, -150, 4.2], [15, 154, 4.6]].forEach(([r, ang, h], i) => {
      const p = place(O, yaw, r, ang);
      p.y = terrain.heightAt(p.x, p.z) - 0.1;
      createTree(engine, { kind: 'round', seed: 70 + i * 9, position: p, height: h });
      treeAvoid.push({ x: p.x, z: p.z, r: 0.5 });
    });
    const b = place(O, yaw, 9.5, -122); b.y = terrain.heightAt(b.x, b.z) - 0.05;
    createTree(engine, { kind: 'bush', seed: 4, position: b });
  }
  lap('trees');

  // ---- grass + flowers (off the stone, the rocks and the basin)
  if (on('grass')) {
    const onStone = (x, z) => props.some((g) => g.userData.covers?.(x, z, 0.04));
    createGrass(engine, terrain, {
      area: grassArea, mask: (x, z) => !onStone(x, z),
      avoid: [...(rocks?.avoid ?? []), ...treeAvoid],
      flowers: { fraction: 0.04, tints: FLOWER_TINTS.shrine },
    });
  }
  lap('grass');

  // ---- water in the basin slot
  if (on('water')) {
    const w = shrine.userData.water;
    createWater(engine, terrain, { level: w.level, shape: { kind: 'polygon', points: w.polygon }, depthMax: 0.3 });
  }
  lap('water');

  // ---- atmosphere
  const bounds = { x0: -11, x1: 11, y0: 0.1, y1: 4.5, z0: -11, z1: 11 };
  if (on('parts')) {
    if (night) createParticles(engine, { kind: 'fireflies', count: 70, seed: 3, halo: 2, bounds: { ...bounds, y0: 0.3, y1: 2.2 } });
    else {
      // dust motes only show inside sun shafts: without god rays (day) they read as white speckle
      if (golden) createParticles(engine, { kind: 'dust', count: 900, seed: 5, bounds });
      createParticles(engine, { kind: 'leaves', count: golden ? 30 : 14, seed: 7, bounds });
    }
  }
  if (on('fog') && (golden || night)) {
    addFog(engine, night
      ? { mistAmount: 0.3, mistDepth: 0.8, mistScale: 0.1, mistCover: 0.45, fogAmount: 0.3 }
      : { mistAmount: 0.3, mistDepth: 0.8, mistScale: 0.15, mistCover: 0.35, mistDrift: [0.05, 0.02], fogAmount: 0.3 });
  }
  if (on('rays') && (golden || night || P('rays', null) === '1')) {
    // open meadow: every air column is lit, so the module's defaults turn into an even haze that flattens the
    // frame. Keep it subtle (lower strength, air thinning fast with height) so tree shadows stripe the air.
    const ro = { strength: Number(P('raystr', night ? 0.16 : 0.2)), density: Number(P('raydens', 0.1)), falloff: Number(P('rayfall', 1.6)) };
    addGodrays(engine, night ? { ...ro, color: '#9FB6E8', mistBoost: 0.5 } : { ...ro, mistBoost: 0.6 });
  }
  if (on('grade')) addGrade(engine, {});
  lap('atmos');
}
