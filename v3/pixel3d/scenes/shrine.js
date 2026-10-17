// Scene "shrine" (owner: scene-shrine). t3ssel8r's ruined water shrine, docs/ART_DIRECTION.md §1.
//   ?tod=noon (default) | morning | golden | night
//   ?pan=1      slow deterministic camera drift (10 texels/s right, 4 texels/s up) as a function of t
//   ?pan=x,y    static whole-texel offset of the target along screen right / up (crawl checks)
//   ?cover=<cloud cover> ?cscale=<cloud scale> ?vignette=<amount> (0 for crawl diffs)
//   ?cheight=<cloud plane height, shifts the cloud-shadow pattern along the sun> ?gaz=<golden sun relAz> ?cubeY=<cube height>
// Everything is a pure function of the seeds below and of t.
import * as THREE from 'three';
import { toonMesh, rampFromTones } from '../src/materials/toon.js';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { createTerrain } from '../src/world/terrain.js';
import { createRocks } from '../src/world/rocks.js';
import { createShrine, createPillar, createSlab, createDebris, createLantern } from '../src/world/props.js';
import { createGrass, viewArea } from '../src/world/grass.js';
import { FLOWER_TINTS } from '../src/world/flowers.js';
import { createTree } from '../src/world/trees.js';
import { createWater } from '../src/world/water.js';
import { createParticles } from '../src/world/particles.js';
import { addGodrays, addFog } from '../src/post/godrays.js';
import { addGrade } from '../src/post/grade.js';

const D = THREE.MathUtils.degToRad;

// ang: 0 = far (screen-up), 90 = screen-right, 180 = near (screen-down), -90 = screen-left. r in metres.
function place(center, yaw, r, angDeg) {
  const F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const a = D(angDeg);
  return center.clone().addScaledVector(F, r * Math.cos(a)).addScaledVector(R, r * Math.sin(a));
}

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const tod = P('tod', 'noon');
  const night = tod === 'night', golden = tod === 'golden';
  const yaw = Math.PI / 4, pitch = Math.PI / 6, vh = 10;
  const O = new THREE.Vector3(0, 0, 0);
  const stats = engine.stats;
  let t0 = performance.now();
  const lap = (k) => { const t = performance.now(); stats[`build_${k}_ms`] = Math.round(t - t0); t0 = t; };

  // ---- camera first (grass view area, leaf density, sun and shadow box read it)
  const base = new THREE.Vector3(0, 0.5, 0);
  engine.camera.set({ target: base, yaw, pitch, viewHeight: vh });
  const tw = engine.camera.texelWorld;
  const Rv = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));          // screen right on the ground
  const Fv = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));         // screen up on the ground (foreshortened)
  const panArg = P('pan', null);
  const drift = panArg === '1';
  // grass area from the un-panned view (a pan must never change the Poisson set); wider when drifting
  const grassArea = viewArea(engine, drift ? 7 : 3.5);
  if (panArg && !drift) {
    const [px, py] = panArg.split(',').map(Number);
    base.addScaledVector(Rv, (px || 0) * tw).addScaledVector(Fv, (py || 0) * tw / Math.sin(pitch));
    engine.camera.set({ target: base });
  }
  if (drift) {
    const tgt = base.clone();
    engine.onUpdate((t) => {
      tgt.copy(base).addScaledVector(Rv, 10 * t * tw).addScaledVector(Fv, 4 * t * tw / Math.sin(pitch));
      engine.camera.target.copy(tgt);
    });
  }

  // ---- light. The refs light the front-left faces and shade the right ones (sun behind-left of the camera).
  const sun = night ? { relAz: 140, elev: 45 } : golden ? { relAz: Number(P('gaz', 170)), elev: 26 } : tod === 'morning' ? { relAz: 150, elev: 36 } : { relAz: 155, elev: 50 };
  applyTimeOfDay(engine, tod, { ...sun, shadowExtent: 21 });
  const cover = Number(P('cover', night ? 0 : golden ? 0.56 : tod === 'morning' ? 0.46 : 0.41));
  setClouds(engine, cover > 0 ? { scale: Number(P('cscale', 0.09)), cover, height: Number(P('cheight', 5)), wind: [0.014, 0.006] } : { scale: 0 });
  lap('sky');

  // ---- terrain: near-flat meadow, pad under the shrine, basin carved below the floor,
  // cobble in three corners (top-left, top-right, bottom-left), reddish dirt top-left
  const cb = (r, a) => { const p = place(O, yaw, r, a); return { x: p.x, z: p.z }; };
  const terrain = createTerrain(engine, {
    size: 64, height: 0.6, seed: 11,
    flatten: [{ x: 0, z: 0, r: 7, h: 0 }],
    basins: [{ x: 0, z: 0, rx: 2.55, depth: 0.7, edge: 0.1 }],
    zones: [
      { type: 'cobble', ...cb(12.6, -47), r: 4.0, noise: 0.4 },
      { type: 'cobble', ...cb(12.4, 50), r: 3.4, noise: 0.4 },
      { type: 'cobble', ...cb(11.2, -124), r: 4.0, noise: 0.4 },
      { type: 'dirt', ...cb(11.5, -38), r: 3.2, noise: 0.45 },
    ],
  });
  lap('terrain');

  // ---- architecture (ART_DIRECTION §1 element table)
  const props = [];
  const add = (o) => { if (!o.parent) engine.scene.add(o); props.push(o); return o; };
  const shrine = add(createShrine(engine, { seed: 5, position: O.clone(), terrain, cracks: 2 }));

  const bases = [];
  const loose = new Set();             // slabs / fallen blocks: wider grass margin so their front edges stay clean
  // full pillars: [ang, r, height, width, seed, cap]  (radii vary so the ring is not symmetric). The near one
  // stands well in front (r 7.9) so its capital stays below the basin's front face; most drop the fat capital.
  [[-136, 7.0, 2.7, 0.8, 11, false], [-98, 6.6, 3.3, 0.92, 23, true], [-62, 5.0, 2.5, 0.76, 37, false], [-15, 6.5, 3.1, 0.88, 41, false],
    [40, 6.6, 2.8, 0.78, 53, false], [84, 5.6, 3.4, 0.94, 67, true], [127, 6.5, 2.4, 0.82, 79, false], [-166, 8.0, 2.3, 0.86, 83, false]]
    .forEach(([ang, r, h, w, s, cap]) => {
      const p = place(O, yaw, r, ang);
      bases.push({ x: p.x, z: p.z, r: 0.95 });
      add(createPillar(engine, { height: h, width: w, seed: s, position: p, terrain, cap }));
    });
  // broken pillars (short, top block tilted): one stub right in front of the near face (as in the refs)
  [[179, 5.4, 0.9, 0.84, 91], [102, 4.6, 0.8, 0.84, 97], [140, 4.7, 1.0, 0.82, 103]].forEach(([ang, r, h, w, s]) => {
    const p = place(O, yaw, r, ang);
    bases.push({ x: p.x, z: p.z, r: 0.85 });
    add(createPillar(engine, { height: h, width: w, broken: true, seed: s, position: p, terrain }));
  });
  // fallen arch: a toppled row of voussoir blocks (k·45° yaws, ≤5° tilt): the first rests on a broken stub,
  // the rest lie on the ground in a row running screen-right, touching, no floating chain.
  const a0 = place(O, yaw, 4.4, 14);
  const stub = add(createPillar(engine, { height: 0.75, width: 0.8, broken: false, cap: false, seed: 401, position: a0, terrain, debris: false }));
  const stubTop = stub.position.y + stub.userData.height;
  [[0, 0.62, 0.42, 0.52], [0.66, 0.58, 0.46, 0.5], [1.26, 0.64, 0.44, 0.54], [1.92, 0.56, 0.42, 0.5], [2.5, 0.6, 0.4, 0.5]]
    .forEach(([s, bw, bh, bd], i) => {
      const p = a0.clone().addScaledVector(Rv, s + 0.1).addScaledVector(Fv, -0.04 * i * i);
      const onStub = i === 0;
      if (onStub) p.y = stubTop + 0.02;
      const blk = add(createSlab(engine, { position: p, terrain: onStub ? null : terrain, seed: 300 + i * 13, yaw: yaw + (i === 3 ? Math.PI / 4 : 0), w: bw, h: bh, d: bd }));
      loose.add(blk);
    });
  bases.push({ x: a0.x, z: a0.z, r: 0.8 });
  // flat slabs beyond the far rim (top centre, in the lit gap between the cloud shadows)
  [[-8, 7.7], [1, 8.8], [9, 7.6], [17, 8.7]].forEach(([ang, r], i) => loose.add(add(createSlab(engine, { position: place(O, yaw, r, ang), terrain, seed: 60 + i * 7 }))));
  add(createDebris(engine, terrain, { around: bases, count: 36, seed: 7, avoid: (x, z) => Math.hypot(x, z) < 4.0 }));
  if (night) {
    add(createLantern(engine, { position: place(O, yaw, 4.6, -32), terrain, seed: 3, lit: true, light: true }));
    add(createLantern(engine, { position: place(O, yaw, 4.5, 118), terrain, seed: 8, lit: true, light: true }));
  }
  lap('props');

  // ---- the one saturated accent: cyan cube above the far rim, bobbing ±2 texels at a stepped 2 fps
  const cube = toonMesh(engine, new THREE.BoxGeometry(0.35, 0.35, 0.35), { ...rampFromTones('#7FD3F5', '#4BA8E8', '#2F7FC4'), flatShading: true });
  const cubeBase = place(O, yaw, 2.9, 0).setY(Number(P('cubeY', 1.22)));
  cube.position.copy(cubeBase);
  engine.scene.add(cube);
  engine.camera.snapObjectToTexel(cube);
  engine.onUpdate((t) => {
    const k = Math.floor(t * 2);                       // 2 fps steps
    cube.position.y = cubeBase.y + Math.round(Math.sin(k * Math.PI / 4) * 2) * engine.camera.texelWorld;
  });

  // ---- pebbles only (no big boulders: the shrine palette has no violet rocks)
  const shrineAvoid = [{ x: 0, z: 0, r: 4.2 }, ...bases];
  const rocks = createRocks(engine, terrain, {
    count: 0, seed: 6, area: { x: 0, z: 0, r: 12 }, pebbles: 40, pebbleArea: { x: 0, z: 0, r: 10 }, avoid: shrineAvoid,
  });
  lap('rocks');

  // ---- trees: round crowns entering from the left/right edges and the bottom corners
  const treeAvoid = [];
  // [r, ang, height, radius, seed]
  [[10.2, -76, 4.6, 2.0, 70], [9.6, -101, 4.0, 1.7, 79], [10.4, 71, 4.4, 1.9, 88], [9.8, 97, 5.0, 2.2, 97],
    [14.6, -151, 4.2, 2.1, 106], [14.4, 153, 4.5, 2.0, 115]].forEach(([r, ang, h, R, s]) => {
    const p = place(O, yaw, r, ang);
    p.y = terrain.heightAt(p.x, p.z) - 0.1;
    createTree(engine, { kind: 'round', seed: s, position: p, height: h, radius: R });
    treeAvoid.push({ x: p.x, z: p.z, r: 0.45 });
  });
  lap('trees');

  // ---- grass + flowers, off the stone and the basin
  const onStone = (x, z) => props.some((g) => g.userData.covers?.(x, z, loose.has(g) ? 0.22 : 0.04));
  createGrass(engine, terrain, {
    area: grassArea, r: 0.2, seed: 3, accent: 0.04,
    mask: (x, z) => !onStone(x, z), avoid: [...(rocks?.avoid ?? []), ...treeAvoid],
    flowers: { fraction: 0.05, tints: FLOWER_TINTS.shrine, patchScale: 0.3, seed: 9 },
  });
  lap('grass');

  // ---- water in the basin slot
  const w = shrine.userData.water;
  createWater(engine, terrain, { level: w.level, shape: { kind: 'polygon', points: w.polygon }, depthMax: 0.3 });
  lap('water');

  // ---- atmosphere: day = none (spec: god rays off, fog off); golden/night variants
  const bounds = { x0: -11, x1: 11, y0: 0.2, y1: 4, z0: -11, z1: 11 };
  if (night) {
    createParticles(engine, { kind: 'fireflies', count: 60, seed: 3, halo: 2, bounds: { ...bounds, y0: 0.3, y1: 2.2 } });
    addFog(engine, { mistAmount: 0.3, mistDepth: 0.7, mistScale: 0.1, mistCover: 0.45, fogAmount: 0.25 });
    addGodrays(engine, { strength: 0.15, density: 0.1, falloff: 1.6, color: '#9FB6E8', mistBoost: 0.5 });
  } else if (golden) {
    createParticles(engine, { kind: 'dust', count: 700, seed: 5, bounds, shaftOnly: true });
    addFog(engine, { mistAmount: 0.15, mistDepth: 0.7, mistScale: 0.15, mistCover: 0.35, mistDrift: [0.05, 0.02], fogAmount: 0.1 });
    addGodrays(engine, { strength: 0.2, density: 0.1, falloff: 1.6, mistBoost: 0.6 });
  }
  // ?vignette=0 for crawl checks (the banded vignette is screen-anchored by design)
  const vig = P('vignette', null);
  const gopts = night || golden ? {} : { saturation: 1.05, vignette: 0.10 };
  if (vig !== null) gopts.vignette = Number(vig);
  addGrade(engine, gopts);
  lap('atmos');
}
