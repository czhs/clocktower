// Scene "pond" (owner: scene-pond). docs/ART_DIRECTION.md §2: a meadow pond with reflections, built from
// t3ssel8r's "Forgotten Gate" palette. Water + wind showcase.
//   ?tod=morning (default) | noon | golden | night
//   ?pan=dx,dy  static camera offset in whole texels (screen right / up) for crawl diffs at a frozen t
//   ?vig=0   vignette + grain off (crawl diffs)
//   ?pan=1   slow deterministic camera drift (1 texel / 0.1 s screen-right, 1 texel / 0.2 s screen-up), for GIFs
//            and crawl checks: at t = k·0.2 s the view is shifted by exactly (2k, k) whole texels.
// Layout is authored in screen terms (x = metres screen-right, f = metres screen-forward on the ground) through
// pt(x, f), so it survives any 45° yaw stop.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, toonMesh, rampFromTones } from '../src/materials/toon.js';
import { rng } from '../src/core/noise.js';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { createTerrain } from '../src/world/terrain.js';
import { createRocks } from '../src/world/rocks.js';
import { createGrass, viewArea } from '../src/world/grass.js';
import { createFlowers } from '../src/world/flowers.js';
import { createTree } from '../src/world/trees.js';
import { createWater } from '../src/world/water.js';
import { createParticles } from '../src/world/particles.js';
import { createPaving, createSlab } from '../src/world/props.js';
import { addFog } from '../src/post/fog.js';
import { addGrade } from '../src/post/grade.js';

// ---------------------------------------------------------------------------------------------------
// Palette (ART_DIRECTION §2, sRGB)
const PAL = {
  // one tone per band: no grassLight / grassDark variants (they read as blotchy near-duplicate limes)
  grass: ['#B6CC77', '#84B35B', '#5A887E'],
  sand: ['#D8C79A', '#C2AE84', '#8D8A86'],
  wet: ['#B5AE92', '#9E9A86', '#7C7D86'],
  // terrace faces: earthy stone bands, one tone per band (crack / speck accents mapped onto the same tones
  // so the faces stay clean 2-3 tone planes, no 1-px speckle)
  rock: ['#B09A88', '#8A7B7E', '#62606F'],
  boulder: ['#C2AE96', '#7C7D8F', '#727388'],
  moss: ['#A8BD78', '#94AA6F', '#5E7A5E'],
  pebble: ['#C2AE96', '#9C9293', '#727388'],
  leaves: { hi: '#84B35B', mid: '#689763', sh: '#46726C', core: '#2F5552', tip: '#B6CC77', trunk: ['#7A5A5E', '#654853', '#574E68'] },
  pad: ['#8CC06A', '#5E9A5A', '#3F6E55'],
  padFlower: ['#E7A3C0', '#D58CB0', '#9C6A93'],
  reed: ['#A9BF6A', '#8DA65A', '#5E7A4E'],
  cattail: ['#93664A', '#7A5236', '#553A33'],
  flowers: [{ hex: '#A875D7', weight: 0.2 }, { hex: '#CA91E3', weight: 0.2 }, { hex: '#E6D36A', weight: 0.35 }, { hex: '#EDEBDA', weight: 0.25 }],
};

// ---------------------------------------------------------------------------------------------------
// Reed / pad-flower sprites: the grass recipe (screen-aligned, 1 sprite texel = 1 screen texel, lit at the
// root, stepped wind frames, transparent + depthWrite off + NoBlending, FLAG_NONE). Pixel kinds in the atlas
// R channel: 255 = stalk / leaf blade, 128 = cattail head, 0 = blossom (lily-pad flower).
const RW = 9, RH = 28, RFRAMES = 3, RVAR = 10;
const ANIM_FPS = 3;   // base step rate shared by every animated layer (trees.js steps its leaves at 3 fps too)

function reedAtlas(seed) {
  const rand = rng(seed);
  const cells = RVAR * RFRAMES + 1;
  const W = cells * RW, data = new Uint8Array(W * RH * 4);
  const put = (cell, x, y, kind, g = 255) => {
    if (x < 0 || x >= RW || y < 0 || y >= RH) return;
    const o = (y * W + cell * RW + x) * 4;
    if (data[o + 3] && kind === 255 && data[o] === 128) return; // cattail wins over the stalk
    if (data[o + 3] && data[o + 1] < 200) return;               // the waterline texel wins over everything
    data[o] = kind; data[o + 1] = g; data[o + 2] = 255; data[o + 3] = 255;
  };
  for (let v = 0; v < RVAR; v++) {
    // one tall stalk (14-24 px), optional cattail, 1-2 leaf blades leaning out with 1-px kinks
    const h = 14 + Math.floor(rand() * 11);
    const cat = v % 3 === 1 ? 1 : 0;                          // ~1 in 3 stalks carries a cattail
    const x0 = 4;
    const blades = [];
    // variants >= RVAR/2 stand in the water: a straight stalk only (every diagonal step of a leaning blade
    // would get the water's 1-px sprite shore texel under it and read as white speckle)
    const wet = v >= RVAR / 2;
    const nb = wet ? 0 : 1 + (rand() < 0.6 ? 1 : 0);
    for (let b = 0; b < nb; b++) {
      const dir = b === 0 ? (rand() < 0.5 ? -1 : 1) : -blades[0].dir;
      blades.push({ dir, h: 7 + Math.floor(rand() * 7), kink: 3 + Math.floor(rand() * 2), start: Math.floor(rand() * 2) });
    }
    const lean = wet ? 0 : rand() < 0.5 ? 0 : (rand() < 0.5 ? -1 : 1);  // some stalks lean 1 px over their height
    for (let f = 0; f < RFRAMES; f++) {
      const cell = v * RFRAMES + f;
      const sx = (y, hh) => Math.floor(((wet ? f * 0.5 : f * 0.95) + lean) * Math.pow(y / hh, wet ? 3 : 1.6) + 0.5);  // wind bend toward +x
      // in-water stalks: their own 1-px pale waterline at the root (bottom row, the stem ±1 px) instead of the
      // water pass's sprite shore detection (which also lit texels at random heights along the stalk)
      if (wet) for (let dx = -1; dx <= 1; dx++) put(cell, x0 + dx, 0, 255, 100);
      for (let y = 0; y < h; y++) put(cell, x0 + sx(y, h), y, 255);
      if (cat) {
        const top = h - 2;                                   // 1-2 px spike above a 2×4 head
        for (let y = top - 5; y < top - 1; y++) { const x = x0 + sx(y, h); put(cell, x, y, 128); put(cell, x + 1, y, 128); }
      }
      for (const bl of blades) {
        let x = x0 + bl.dir;
        for (let y = bl.start; y < bl.start + bl.h; y++) {
          if (y > bl.start && (y - bl.start) % bl.kink === 0) x += bl.dir;
          put(cell, x + Math.floor(f * 0.95 * Math.pow(y / h, 1.6) + 0.5), y, 255);
        }
      }
    }
  }
  // lily-pad flower: a 2×2 blossom with a 1-px bud on top (last cell)
  const fc = RVAR * RFRAMES;
  for (const [x, y] of [[4, 0], [5, 0], [4, 1], [5, 1], [4, 2]]) put(fc, x, y, 0);
  const tex = new THREE.DataTexture(data, W, RH, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { tex, cells };
}

function createReedSprites(engine, items, { seed = 1, shore = '#E8FBFF', wind = { fps: ANIM_FPS, dir: [1, 0.35], speed: 2.6, wave: 0.55 } } = {}) {
  const atlas = reedAtlas(seed);
  const n = items.length;
  const quad = new THREE.PlaneGeometry(RW, RH).translate(0, RH / 2, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('normal', quad.attributes.normal);
  geo.setAttribute('uv', quad.attributes.uv);
  const aBase = new Float32Array(n * 3), aVar = new Float32Array(n * 3);
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(aBase, 3));
  geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(aVar, 3));
  geo.instanceCount = n;
  let sortedFor = null;
  const sort = () => {
    const c = engine.camera, key = `${c.yaw.toFixed(4)}:${c.pitch.toFixed(4)}`;
    if (key === sortedFor) return;
    sortedFor = key;
    const fx = -Math.cos(c.pitch) * Math.sin(c.yaw), fy = -Math.sin(c.pitch), fz = -Math.cos(c.pitch) * Math.cos(c.yaw);
    const s = items.map((p) => ({ p, d: p.x * fx + p.y * fy + p.z * fz })).sort((a, b) => b.d - a.d);
    s.forEach(({ p }, i) => {
      aBase.set([p.x, p.y, p.z], i * 3);
      aVar.set([p.cell, p.ph, p.flower ? 1 : 0], i * 3);
    });
    geo.attributes.aBase.needsUpdate = true; geo.attributes.aVar.needsUpdate = true;
  };
  sort();
  const L = (h) => new THREE.Color(h);
  const wd = new THREE.Vector2(...wind.dir).normalize();
  const uniforms = {
    tReed: { value: atlas.tex }, uReedCells: { value: atlas.cells },
    uReedWind: { value: new THREE.Vector4(wind.fps, wind.wave, wind.speed, 1) }, uReedWindDir: { value: wd },
    uReedHi: { value: L(PAL.reed[0]) }, uReedMid: { value: L(PAL.reed[1]) }, uReedSh: { value: L(PAL.reed[2]) },
    uCatHi: { value: L(PAL.cattail[0]) }, uCatMid: { value: L(PAL.cattail[1]) }, uCatSh: { value: L(PAL.cattail[2]) },
    uFlHi: { value: L(PAL.padFlower[0]) }, uFlMid: { value: L(PAL.padFlower[1]) }, uFlSh: { value: L(PAL.padFlower[2]) },
    uReedShore: { value: L(shore) },
  };
  const material = toonMaterial(engine, {
    color: L(PAL.reed[1]), transparent: true, depthWrite: false, blending: THREE.NoBlending, alphaTest: 0.5,
    outline: 'none', uniforms, lightPos: 'aBase', cutMod: 'aVar.z',
    vertexHead: /* glsl */`
      attribute vec3 aBase, aVar; uniform float uReedCells; uniform vec4 uReedWind; uniform vec2 uReedWindDir;
      varying vec2 vRUv;
      float rHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
    objectNormal: 'objectNormal = vec3(0.0, 1.0, 0.0);',
    vertex: /* glsl */`
      {
        float frame = 0.0;
        if (aVar.z < 0.5) {   // reeds: stepped travelling wind wave (same feel as the grass), flowers stay still
          float tq = floor(uTime * uReedWind.x) / uReedWind.x;
          float wv = dot(aBase.xz, uReedWindDir) * uReedWind.y - tq * uReedWind.z + aVar.y * 6.2831;
          frame = clamp(floor((0.5 + 0.5 * sin(wv)) * 2.6), 0.0, 2.0);
        }
        float wsx = (viewMatrix * vec4(uReedWindDir.x, 0.0, uReedWindDir.y, 0.0)).x;
        vec2 u = uv;
        if (wsx < 0.0 && aVar.z < 0.5) u.x = 1.0 - u.x;
        vRUv = vec2((u.x + aVar.x + frame) / uReedCells, u.y);
      }`,
    viewVertex: /* glsl */`
      {
        vec4 b = viewMatrix * vec4(aBase, 1.0);
        b.xy = floor(b.xy / uTexelWorld + 0.5) * uTexelWorld;   // root on a texel corner
        b.z += 0.06 + aVar.z * 0.1;
        mvPosition = b + vec4((position.xy - vec2(0.5, 0.0)) * uTexelWorld, 0.0, 0.0);
      }`,
    fragmentHead: /* glsl */`
      uniform sampler2D tReed; varying vec2 vRUv;
      uniform vec3 uReedHi, uReedMid, uReedSh, uCatHi, uCatMid, uCatSh, uFlHi, uFlMid, uFlSh, uReedShore;`,
    albedo: /* glsl */`
      vec4 rA = texture2D(tReed, vRUv);
      if (rA.a < 0.5) discard;`,
    tones: /* glsl */`
      if (rA.g < 0.6) { toonHi = uReedShore; toonMid = uReedShore; toonSh = uReedShore; }
      else if (rA.r > 0.75) { toonHi = uReedHi; toonMid = uReedMid; toonSh = uReedSh; }
      else if (rA.r > 0.25) { toonHi = uCatHi; toonMid = uCatMid; toonSh = uCatSh; }
      else { toonHi = uFlHi; toonMid = uFlHi; toonSh = uFlMid; }`,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'reeds';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  engine.scene.add(mesh);
  engine.onUpdate(() => sort());
  return { mesh, material, count: n };
}

// ---------------------------------------------------------------------------------------------------
export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const stats = engine.stats;
  let t0 = performance.now();
  const lap = (k) => { const t = performance.now(); stats[`build_${k}_ms`] = Math.round(t - t0); t0 = t; };

  const tod = P('tod', 'morning');
  const night = tod === 'night', golden = tod === 'golden';
  const panP = P('pan', '0');
  const pan = panP === '1';                              // drift with t
  const panFix = panP.includes(',') ? panP.split(',').map(Number) : null;   // static whole-texel offset (crawl checks)
  const yaw = -Math.PI / 4, pitch = Math.PI / 6, vh = 12;
  const R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const pt = (x, f, y = 0) => new THREE.Vector3(0, y, 0).addScaledVector(R, x).addScaledVector(F, f);

  // ---- camera first (grass view area, tree leaf density and the sun depend on it)
  // target 1.5 m screen-forward of the layout origin: the pond sits a little below centre, more of the far
  // bank (terrace + tree trunks, which is what the pond reflects) is in frame and the near meadow is shorter
  const target0 = pt(0, 1.5, 0.2);
  engine.camera.set({ target: target0, yaw, pitch, viewHeight: vh });
  // grass area from the un-panned view (a pan must not change the Poisson set)
  const grassArea = viewArea(engine, pan || panFix ? 6 : 2.5);
  if (panFix) {
    const tw = vh / 360;
    engine.camera.set({ target: target0.clone().addScaledVector(R, panFix[0] * tw).addScaledVector(F, (panFix[1] || 0) * tw / Math.sin(pitch)) });
  }
  if (pan) {
    const tw = vh / 360, tgt = new THREE.Vector3();
    engine.onUpdate((t) => {
      const dx = t * 10 * tw, dy = t * 5 * tw / Math.sin(pitch);
      engine.camera.set({ target: tgt.copy(target0).addScaledVector(R, dx).addScaledVector(F, dy) });
    });
  }

  // ---- light
  const sun = night ? { relAz: 50, elev: 45 } : golden ? { relAz: 35, elev: 22 } : tod === 'noon' ? { relAz: 40, elev: 55 } : { relAz: 55, elev: 38 };
  applyTimeOfDay(engine, tod, { ...sun, shadowExtent: 22 });
  // golden keeps a few cloud shadows too (big value shapes instead of one uniform lit wash)
  setClouds(engine, night ? { scale: 0 } : { scale: 0.045, cover: Number(P('cover', golden ? 0.6 : 0.38)), wind: [0.012, 0.005] });
  lap('sky');

  // ---- terrain: an asymmetric pond of 3 overlapping ellipses left of centre (big far-left lobe, smaller
  // near-right lobe, a small bay at the lower left), gentle near shelf, 2 terrace steps (0.55 m) on the far bank
  // whose rims arc roughly parallel to the far shore; a worn dirt path comes up from the bottom edge to a
  // flagstone landing on the near shore.
  const level = 0, STEP = 0.55;
  const pcx = -3.6, pcf = 1.0;
  const pc = pt(pcx, pcf);                         // pond centre (water flood-fill seed)
  const eA = pt(-5.4, 1.8), eB = pt(-1.9, 0.5), eC = pt(-7.6, -0.5);
  // near side = gentle shelf from flatten pads (h -0.3, wide smoothstep falloff: a slope the 30° camera sees,
  // so the sand band and the depth tints read); far half = steep basin carve up to the terrace foot
  // A slope rising toward a 30° camera at ~0.5 m/m is seen edge-on, so the near bank is built as a flat
  // beach terrace just above the water (h +0.1, seen at full ground foreshortening) and an underwater
  // shelf (h -0.3) in front of it; the drop from the meadow to the beach collapses to a few px of grass.
  const beach = [[-7.4, -2.6, 0.6], [-4.6, -3.3, 0.7], [-1.9, -3.2, 0.6]].map(([x, f, r]) => { const p = pt(x, f); return { x: p.x, z: p.z, r, h: 0.1, falloff: 1.5 }; });
  const shelf = [[-7.0, -0.6, 0.9], [-4.4, -0.9, 1.1], [-1.6, -0.8, 0.9]].map(([x, f, r]) => { const p = pt(x, f); return { x: p.x, z: p.z, r, h: -0.3, falloff: 1.8 }; });
  const plat = pt(-3.0, 19.0);                     // terrace mesa centre: big radius -> gentle rim arcs
  const lift = pt(0, 0);
  const pathPts = [[1.6, -12.5], [1.1, -9.0], [-0.1, -6.4], [-1.2, -4.4], [-1.9, -3.0]];
  const terrain = createTerrain(engine, {
    size: 72, seed: 11, height: 0.1, frequency: 0.06, cliffHeight: STEP,
    plateaus: [
      { x: lift.x, z: lift.z, r: 200, levels: 1, gap: 1.4, noise: 0 },        // lifts the whole meadow by +STEP
      { x: plat.x, z: plat.z, r: 13.4, levels: 2, gap: 2.0, noise: 0.025 },   // far-bank terraces (+STEP, +2·STEP)
    ],
    flatten: [...beach, ...shelf],
    basins: [
      { x: eA.x, z: eA.z, rx: 3.3, rz: 2.6, rot: yaw - 0.18, depth: 1.4, edge: 0.42 },
      { x: eB.x, z: eB.z, rx: 2.9, rz: 2.0, rot: yaw + 0.38, depth: 1.4, edge: 0.42 },
      { x: eC.x, z: eC.z, rx: 1.5, rz: 1.1, rot: yaw + 0.7, depth: 1.4, edge: 0.5 },
    ],
    paths: [{ points: pathPts.map(([x, f]) => { const p = pt(x, f); return [p.x, p.z]; }), width: 0.9, kind: 'dirt', noise: 0.55 }],
    grassVariation: [-1, 2],
    water: { level, shoreBand: 0.3, wetBand: 0.07, shore: 'sand', bounds: { x: pc.x, z: pc.z, r: 7.5 } },
    palette: { grass: PAL.grass, grassDark: PAL.grass, grassLight: PAL.grass, sand: PAL.sand, wet: PAL.wet, rock: PAL.rock, crack: PAL.rock, speck: PAL.rock },
  });
  const H = (p) => terrain.heightAt(p.x, p.z);
  lap('terrain');

  // shore(x, f, dx, df, d): march from (x, f) along the screen direction (dx, df) until the bed is shallower
  // than d (d < 0: the ground is |d| above the water) -> [x, f]
  const shore = (x, f, dx, df, d) => {
    const n = Math.hypot(dx, df); dx /= n; df /= n;
    for (let s = 0; s < 14; s += 0.05) { const p = pt(x + dx * s, f + df * s); if (H(p) > level - d) return [x + dx * s, f + df * s]; }
    return [x, f];
  };

  // ---- hard stone in the soft field: a flagstone landing where the path meets the near shore
  const props = [];
  const landF = shore(-1.9, 0.5, 0.05, -1, -0.06);
  const land = pt(landF[0], landF[1] - 0.55);
  props.push(createPaving(engine, terrain, { center: land, radius: 1.3, seed: 5, stone: 0.5, density: 0.95, falloff: 0.5, thickness: 0.12 }));
  props.push(createSlab(engine, { position: pt(-0.5, -6.0), terrain, seed: 9, w: 0.62, d: 0.5, h: 0.12 }));
  props.push(createSlab(engine, { position: pt(0.7, -8.2), terrain, seed: 13, w: 0.56, d: 0.5, h: 0.12 }));
  props.forEach((g) => engine.scene.add(g));
  const onProp = (x, z) => props.some((g) => g.userData.covers?.(x, z, 0.05));

  // ---- rocks: a boulder cluster on the right bank (2 half-submerged), a group in the lower meadow,
  // pebbles along the near bank
  const rockAvoid = [];
  const rockOpts = { palette: PAL.boulder, mossPalette: PAL.moss, pebblePalette: PAL.pebble, moss: 0.4 };
  const boulder = (x, f, r, seed, extra = {}) => {
    const p = pt(x, f);
    const g = createRocks(engine, terrain, {
      ...rockOpts, count: 1, seed, area: { x: p.x, z: p.z, r: 0.05 }, size: [r, r], cluster: 0, pebbles: 0,
      submerged: true, maxSlope: 0.3, ...extra,
    });
    rockAvoid.push(...g.avoid);
    return g;
  };
  boulder(2.6, 2.0, 0.8, 21, { cluster: 1 });      // main boulder on the right bank
  boulder(3.9, 3.1, 0.5, 22);
  boulder(1.8, 3.4, 0.36, 28);
  boulder(4.4, 0.8, 0.36, 25);
  boulder(...shore(pcx, pcf, 1, 0.3, 0.3), 0.6, 23, { bury: [0.0, 0.04] });    // half-submerged, right end of the pond
  boulder(...shore(pcx, pcf, -0.55, -1, 0.26), 0.46, 24, { bury: [0.0, 0.04] });   // half-submerged, near-left shallows
  boulder(3.0, -5.4, 0.62, 27, { cluster: 1 });    // lower-meadow group (medium-scale detail in the foreground)
  boulder(4.1, -6.3, 0.34, 29);
  boulder(-9.6, 4.0, 0.45, 26, { cluster: 1 });    // a small group at the left end of the far bank
  // shore pebbles (near bank, partly under water) + a few around the lower-meadow group
  const pb = pt(-4.2, -1.6);
  const pebs = createRocks(engine, terrain, {
    ...rockOpts, count: 0, pebbles: 18, seed: 31, submerged: true, pebbleSize: [0.08, 0.2],
    pebbleArea: { x: pb.x, z: pb.z, r: 3.6 }, maxSlope: 0.5, avoid: rockAvoid,
  });
  const pm = pt(3.3, -5.9);
  const pebs2 = createRocks(engine, terrain, {
    ...rockOpts, count: 0, pebbles: 9, seed: 33, pebbleSize: [0.08, 0.18], pebbleArea: { x: pm.x, z: pm.z, r: 1.6 }, avoid: rockAvoid,
  });
  const pebbleAvoid = [...pebs.items, ...pebs2.items].map(({ x, z, r }) => ({ x, z, r: r + 0.05 }));
  lap('rocks');

  // ---- trees: 3 on the far bank (on the terrace steps, crowns low enough that their reflections land in the
  // pond), 1 right-middle, 3 foreground crowns in the bottom corners
  const trees = [];
  const tree = (x, f, height, radius, seed, kind = 'round') => {
    const p = pt(x, f); p.y = H(p) - 0.1;
    trees.push(createTree(engine, { kind, seed, position: p, height, radius, palette: PAL.leaves }));
    rockAvoid.push({ x: p.x, z: p.z, r: 0.45 });
  };
  tree(-8.2, 5.6, 5.0, 1.9, 41);
  tree(-4.4, 7.2, 5.6, 2.3, 42);
  tree(-0.4, 5.9, 4.8, 1.8, 43);
  tree(7.6, 2.6, 5.0, 2.0, 44);
  tree(-10.0, -14.1, 4.4, 2.3, 45);
  tree(-6.0, -15.5, 4.2, 2.1, 46);
  tree(9.6, -13.9, 4.6, 2.4, 47);
  { const b = pt(10.4, 6.4); b.y = H(b) - 0.05; createTree(engine, { kind: 'bush', seed: 48, position: b, palette: { trunk: PAL.leaves.trunk } }); rockAvoid.push({ x: b.x, z: b.z, r: 0.6 }); }
  lap('trees');

  // ---- lily pads: flat octagons with a 1/8 notch, 3 groups, merged into one mesh (no outline)
  const rand = rng(77);
  const pads = [], padFlowers = [];
  const padGroups = [[-6.0, 2.3, 6], [-2.5, 1.1, 5], [-4.6, -0.2, 4]];
  for (const [gx, gf, cnt] of padGroups) {
    const c = pt(gx, gf);
    let placed = 0;
    for (let k = 0; k < 40 && placed < cnt; k++) {
      const a = rand() * Math.PI * 2, d = placed === 0 ? 0 : 0.35 + rand() * 0.9;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const r = 0.18 + rand() * 0.17;
      if (terrain.heightAt(x, z) > level - 0.2) continue;
      if (pads.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 0.04)) continue;
      pads.push({ x, z, r, rot: Math.floor(rand() * 8) * Math.PI / 4 });
      placed++;
    }
  }
  const padGeos = pads.map((p, i) => {
    const g = new THREE.CircleGeometry(p.r, 8, Math.PI / 8, Math.PI * 2 * 7 / 8).rotateX(-Math.PI / 2).rotateY(p.rot);
    g.translate(p.x, level + 0.012 + (i % 3) * 0.002, p.z);
    return g;
  });
  if (padGeos.length) {
    const padMesh = toonMesh(engine, mergeGeometries(padGeos), { ...rampFromTones(...PAL.pad), outline: 'none' }, { castShadow: false, receiveShadow: true });
    padMesh.name = 'lilypads';
    engine.scene.add(padMesh);
  }
  [0, 7, 12].forEach((i) => { const p = pads[i % pads.length]; if (p) padFlowers.push({ x: p.x + 0.04, y: level + 0.02, z: p.z - 0.02, cell: RVAR * RFRAMES, ph: 0, flower: true }); });

  // ---- reeds: 4 clumps (left shallows + left shore, lower-right shallows + shore)
  const reeds = [];
  const reedAvoid = [];
  const clumps = [
    [...shore(pcx, pcf, -1, 0.15, 0.12), 0.8, 18], [...shore(pcx, pcf, -1, -0.5, 0.0), 0.6, 14],
    [...shore(pcx, pcf, 0.75, -1, 0.1), 0.65, 16], [...shore(pcx, pcf, 1, -0.5, -0.02), 0.5, 11],
  ];
  clumps.forEach(([cx, cf, cr, cnt]) => {
    const c = pt(cx, cf);
    reedAvoid.push({ x: c.x, z: c.z, r: cr + 0.15 });
    let placed = 0;
    for (let k = 0; k < 200 && placed < cnt; k++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * cr;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, h = terrain.heightAt(x, z);
      if (h < level - 0.3) continue;                        // ≤ 0.3 m deep
      if (reeds.some((q) => Math.hypot(q.x - x, q.z - z) < 0.09)) continue;
      const wet = h < level + 0.01, half = RVAR / 2;
      reeds.push({ x, y: Math.max(h, level), z, cell: (Math.floor(rand() * half) + (wet ? half : 0)) * RFRAMES, ph: rand(), flower: false });
      placed++;
    }
  });
  // waterline colour follows the water's shore line per time of day (dimmed at night)
  const reedShore = night ? '#7C93AC' : golden ? '#F1E9D2' : '#E8FBFF';
  createReedSprites(engine, [...reeds, ...padFlowers], { seed: 5, shore: reedShore });
  lap('pond-life');

  // ---- grass + flowers (terrain.isGrass already excludes water, sand and rock)
  // keep tufts off a strip just above the shore sand, so the near-bank sand band reads (tufts are up to 11 px
  // tall and would otherwise cover the 0.3-0.5 m band completely)
  const nearPond = (x, z) => Math.hypot(x - pc.x, z - pc.z) < 7.5 && terrain.heightAt(x, z) < level + 0.42;
  createGrass(engine, terrain, {
    area: grassArea, r: 0.2, accent: 0.06, seed: 3, wind: { fps: ANIM_FPS }, mask: (x, z) => !nearPond(x, z) && !onProp(x, z),
    avoid: [...rockAvoid, ...reedAvoid, ...pebbleAvoid],
    flowers: { fraction: 0.05, tints: PAL.flowers, patchScale: 0.32, mix: 0.05 },
  });
  // one deliberate lilac/white drift in the lower-centre meadow, left of the path (foreground small-scale detail)
  const dc = pt(-3.4, -7.4), dR = 1.7;
  createFlowers(engine, terrain, {
    area: { x0: dc.x - dR, z0: dc.z - dR, x1: dc.x + dR, z1: dc.z + dR }, r: 0.15, seed: 9, wind: { fps: ANIM_FPS },
    mask: (x, z) => Math.hypot((x - dc.x) * 1.0, (z - dc.z) * 1.0) < dR * (0.75 + 0.25 * Math.sin(Math.atan2(z - dc.z, x - dc.x) * 3)) && !onProp(x, z),
    fraction: 0.6, patchScale: 0.5, mix: 0.04,
    tints: [{ hex: '#A875D7', weight: 0.4 }, { hex: '#CA91E3', weight: 0.35 }, { hex: '#EDEBDA', weight: 0.25 }],
  });
  lap('grass');

  // ---- water
  // one shared clock (ANIM_FPS): grass, reeds and trees step at 3 fps, water wobble / waves / sparkles and the
  // leaf particles at 6 fps (= 2×), so every animated layer changes on the same k/6 s ticks instead of
  // several unsynchronised rates (water foam is 3 fps inside the module)
  createWater(engine, terrain, { level, seed: [pc.x, pc.z], reflect: 0.35, waveCell: 1.6,
    // no sprite shore texels: lily pads lie flat on the surface (no outline, spec) and the reeds draw their own
    // root waterline (createReedSprites); half-submerged boulders keep the regular 1-px shore line
    spriteShore: 'none', wobbleFps: 2 * ANIM_FPS, waveFps: 2 * ANIM_FPS, sparkleFps: 2 * ANIM_FPS });
  lap('water');

  // ---- atmosphere: very faint distance fog on the far bank only; no particles over the water
  addFog(engine, { fogAmount: night ? 0.25 : 0.15, fogNear: 7, fogFar: 15, mistAmount: 0 });
  // world box around the right meadow (its 45° diamond on screen stays clear of the pond)
  const mc = pt(7.2, -1.0);
  const meadow = { x0: mc.x - 2.3, x1: mc.x + 2.3, z0: mc.z - 2.3, z1: mc.z + 2.3 };
  if (night) createParticles(engine, { kind: 'fireflies', count: 50, seed: 3, fps: 2 * ANIM_FPS, halo: 2, bounds: { ...meadow, y0: 0.6, y1: 2.2 } });
  else createParticles(engine, { kind: 'leaves', count: golden ? 14 : 6, seed: 7, fps: 2 * ANIM_FPS, bounds: { ...meadow, y0: 0.6, y1: 4 } });
  // ?vig=0: no screen-anchored vignette/grain (crawl diffs)
  // golden / night: the shared presets are tuned for the back-lit glade; with this front-right sun golden
  // washes out to mustard with saturated blue shadows and night goes flat, so tame / separate them here.
  const look = golden ? { saturation: 0.8, gain: [0.8, 0.86, 0.86], contrast: 1.0 }
    : night ? { contrast: 1.14, saturation: 0.95 } : {};
  addGrade(engine, P('vig', '1') === '0' ? { ...look, vignette: 0, grain: 0 } : night ? { ...look, grain: 0.035, vignette: 0.3 } : look);
  lap('atmos');
}
