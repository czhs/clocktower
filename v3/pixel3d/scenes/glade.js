// Scene "glade" (owner: scene-glade). ART_DIRECTION §3: a forest clearing with god rays.
//   ?tod=golden (default) | night | morning | noon
//   ?pan=1   slow deterministic camera drift: +1 texel along screen-right every 0.1 s of t and +1 texel
//            along screen-up every 0.2 s (whole-texel steps, for GIFs / crawl checks)
//   ?freeze=<t>  hold the world animation at t (with ?pan=1: frames differ only by the camera shift)
//   debug: ?rays=0 ?fog=0 ?parts=0 ?grade=0 ?trees=0 ?canopy=0 ?spots=0 ?spot=sx,sy,w,len (only that sun spot)
//          ?spot=sx,sy,n,spacing,w,len (only that slit family) ?holes=0.17 ?cseed=29 ?blob=0.8 (canopy) ?litcrowns=0
//          ?raystr ?raydens ?rayfall ?raytop ?rayfade ?raygap ?raycol=EDE39A ?mist ?cover ?mscale ?fogamt ?mtop
//          ?rseed ?rseed2 (ruin pillar seeds)
// Light: the visible ring of 13 tall trees + a shadow-only canopy 8-11 m up towards the sun (always above the
// top edge at 30° pitch): its designed slits (families of 1-4 parallel 0.45-0.55 m strips) make the narrow
// parallel shafts in the air and the lit stripes on the grass; it is opened over the ring crowns' sun side so
// they keep back-lit rims.
// Layout is authored in SCREEN metres (scr(sx, sy): sx right, sy up from the frame centre, at ground level),
// so the composition sketch of ART_DIRECTION §3 maps 1:1 to the code. Every random choice comes from rng(seed).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMesh } from '../src/materials/toon.js';
import { applyTimeOfDay, setClouds, sunDirFor } from '../src/world/sky.js';
import { createTerrain } from '../src/world/terrain.js';
import { createRocks } from '../src/world/rocks.js';
import { createPillar, createSlab, createDebris, createLantern, stoneMaterial } from '../src/world/props.js';
import { createGrass, viewArea } from '../src/world/grass.js';
import { FLOWER_TINTS, createFlowers } from '../src/world/flowers.js';
import { createTree } from '../src/world/trees.js';
import { createParticles as createParticlesM } from '../src/world/particles.js';
import { addGodrays as addGodraysM } from '../src/post/godrays.js';
import { addFog as addFogM } from '../src/post/fog.js';
import { addGrade as addGradeM } from '../src/post/grade.js';
import { rng, fbm2, poissonDisk2D } from '../src/core/noise.js';

const YAW = Math.PI / 4, PITCH = Math.PI / 6, VH = 11;
const TARGET = new THREE.Vector3(0, 0.6, 0);

// linear Color from sRGB hex
const lin = (hex) => new THREE.Color(hex);
// ruin stone (lighter than props STONE: the golden back-light leaves the camera-facing sides in shade, and the
// shade side must still land near the rock mid #4C4B6C-#5B5A64, not near-black)
const STONE_TONES = { hi: '#D2C3AE', mid: '#A69A92', sh: '#7C7A8C' };
// boulders: the module's purple rock lifted so the back-lit (shade) side reads mid lilac, not near-black
const ROCK_TONES = ['#A398B6', '#7F7AA0', '#6A6790'];
// ring crowns: darker cores (canopy core darker than the meadow shade) and greener lit tones (the golden ramp
// turns the default yellow-green hi into mustard)
const LEAF_COLORS = ['#B8B04E', '#6E8A45', '#3C5550', '#94AA6F'];
const CROWN = { hi: '#79B866', mid: '#558A5E', sh: '#335A5C', core: '#1C3438', tip: '#A6C86E' };

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const tod = ['morning', 'noon', 'golden', 'night'].includes(P('tod')) ? P('tod') : 'golden';
  const night = tod === 'night';
  const on = (k) => P(k, '1') !== '0';
  const num = (k) => (params.has(k) ? Number(P(k)) : undefined);
  const stats = engine.stats;
  let t0 = performance.now();
  const lap = (k) => { const t = performance.now(); stats[`build_${k}_ms`] = Math.round(t - t0); t0 = t; };

  // ------------------------------------------------------------------ camera (first)
  engine.camera.set({ target: TARGET.clone(), yaw: YAW, pitch: PITCH, viewHeight: VH });
  const grassArea = viewArea(engine, 4);          // from the un-panned view (pan must not change the Poisson set)
  const R = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));     // screen-right on the ground
  const F = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));    // screen-up (far) on the ground
  // ground point whose base projects to screen metres (sx, sy) from the frame centre (y = 0 ground)
  const ty = TARGET.y * Math.cos(PITCH);
  const scr = (sx, sy) => new THREE.Vector3().addScaledVector(R, sx).addScaledVector(F, (sy + ty) / Math.sin(PITCH));

  if (P('pan') === '1') {
    // whole-texel steps; the screen-up step moves the target along the ground (F / sin(pitch)), so its height
    // (and the shadow box's light-space depth) never changes
    const base = TARGET.clone();
    engine.onUpdate((t) => {
      const tw = engine.camera.texelWorld;
      engine.camera.target.copy(base).addScaledVector(R, Math.floor(t * 10 + 1e-6) * tw)
        .addScaledVector(F, Math.floor(t * 5 + 1e-6) * tw / Math.sin(PITCH));
    });
  }

  // ------------------------------------------------------------------ light
  // morning: a higher sun from the front-right (shadows fall back-left, the stones' camera-facing sides lit);
  // noon: high, from behind-right; golden: low back-left (spec); night: moon
  const SUNS = { night: { relAz: 40, elev: 45 }, golden: { relAz: -135, elev: 24 }, morning: { relAz: 35, elev: 42 }, noon: { relAz: -100, elev: 58 } };
  const sunOpts = SUNS[tod];
  applyTimeOfDay(engine, tod, { ...sunOpts, shadowExtent: 24 });
  setClouds(engine, { scale: 0 });               // the canopy provides the shadow pattern
  lap('sky');

  // ------------------------------------------------------------------ terrain
  const xz = (p) => ({ x: p.x, z: p.z });
  const terrain = createTerrain(engine, {
    size: 80, height: 0.7, seed: 11, frequency: 0.05,
    // a flat clearing floor with shallow hollows along the back tree line and lower-left: the mist pools there
    flatten: [{ ...xz(scr(0, -0.5)), r: 9, h: 0, falloff: 5 },
      ...[[-7.5, 1.6], [-4.8, 2.0], [-1.0, 2.4], [2.6, 2.1], [6.0, 1.5], [-6.5, -3.4], [-3.8, -2.6]]
        .map(([sx, sy]) => ({ ...xz(scr(sx, sy)), r: 1.6, h: -0.22, falloff: 1.6 }))],
    zones: [{ type: 'dirt', ...xz(scr(-3.2, 0.5)), r: 1.3, noise: 0.5 }],
  });
  const H = (p) => terrain.heightAt(p.x, p.z);
  lap('terrain');

  // ------------------------------------------------------------------ props: ruin stub, slabs, debris
  const props = [];
  // slabs / debris have no material option: swap their default stone for the lighter ruin stone
  const defStone = stoneMaterial(engine, {});
  const add = (o) => {
    o.traverse((m) => { if (m.isMesh && m.material === defStone) m.material = stoneMaterial(engine, { tones: STONE_TONES, patches: 0.6 }); });
    if (!o.parent) engine.scene.add(o); props.push(o); return o;
  };
  // ruin: one tall broken pillar of stacked blocks (no stepped plinth: it read as a pyramid) with a tilted,
  // fractured top block, a short stub of plain offset blocks beside it, fallen slabs and a rubble trail that
  // runs from the stub towards the log (the eye goes ruin -> rubble -> log)
  const stoneMat = { tones: STONE_TONES, patches: 0.6 };
  const stubP = scr(-3.4, 0.75);
  const stub = add(createPillar(engine, { height: 1.7, broken: true, seed: num('rseed') ?? 23, width: 0.6, position: stubP, terrain, debris: false, plinth: false, material: stoneMat }));
  const stub2P = scr(-2.45, 0.95);
  add(createPillar(engine, { height: 0.9, broken: false, seed: num('rseed2') ?? 41, width: 0.64, position: stub2P, terrain, debris: false, cap: false, plinth: false, yaw: Math.PI / 4, material: stoneMat }));
  add(createSlab(engine, { position: scr(-2.6, -0.1), terrain, seed: 7 }));
  add(createSlab(engine, { position: scr(-4.5, 0.15), terrain, seed: 12, w: 0.9, d: 0.7 }));
  add(createSlab(engine, { position: scr(-1.4, 0.35), terrain, seed: 15, w: 0.7, d: 0.55 }));
  add(createSlab(engine, { position: scr(-3.9, -0.55), terrain, seed: 18, w: 0.6, d: 0.5 }));
  const rubble = [{ ...xz(stubP), r: 0.9 }, { ...xz(stub2P), r: 0.7 }];
  add(createDebris(engine, terrain, { around: rubble, count: 12, seed: 9, max: 0.24 }));
  // trail: debris along the line stub -> log, thinning out and getting smaller
  const trail = [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => ({ ...xz(scr(-2.4 + f * 3.6, 0.55 - f * 0.25)), r: 0.45 * (1.1 - f * 0.6) }));
  add(createDebris(engine, terrain, { around: trail, count: 12, seed: 13, min: 0.06, max: 0.16 }));
  if (night) {
    // stone lantern on the ground in front of the stub (on top of the 1.7 m stub it read as a small figure)
    add(createLantern(engine, { position: scr(-2.75, 0.15), terrain, height: 1.15, seed: 5, lit: true, light: true }));
  }
  lap('props');

  // ------------------------------------------------------------------ fallen log (8-sided, moss on top, 2 stubs)
  const logC = scr(2.2, 0.35);
  const log = buildLog(engine, rng(31), { length: 3.5, radius: 0.25 });
  log.position.set(logC.x, H(logC) + 0.17, logC.z);
  engine.scene.add(log);
  const logAxis = new THREE.Vector3(0, 0, 1);       // world Z: reads down-left on screen as a 2:1 diagonal
  const logAvoid = [-1.5, -0.75, 0, 0.75, 1.5].map((s) => ({ x: logC.x + logAxis.x * s, z: logC.z + logAxis.z * s, r: 0.36 }));
  lap('log');

  // ------------------------------------------------------------------ rocks: mossy boulder group left of centre + a pair
  const propAvoid = [...rubble, ...logAvoid];
  const rocksA = createRocks(engine, terrain, {
    count: 4, seed: 14, area: { ...xz(scr(-7.4, -1.5)), r: 1.3 }, size: [0.45, 1.15], cluster: 0.8, moss: 0.4, palette: ROCK_TONES,
    pebbles: 10, pebbleArea: { ...xz(scr(-6.4, -1.6)), r: 2.6 }, avoid: propAvoid,
  });
  const rocksB = createRocks(engine, terrain, {
    count: 2, seed: 19, area: { ...xz(scr(2.7, -1.5)), r: 0.7 }, size: [0.35, 0.6], cluster: 0.5, moss: 0.4, palette: ROCK_TONES,
    pebbles: 16, pebbleArea: { ...xz(scr(0, -1.5)), r: 5 }, avoid: propAvoid,
  });
  lap('rocks');

  // ------------------------------------------------------------------ trees: an asymmetric ring
  // [sx, sy (trunk base, screen m), height, crown R, seed]
  const TREES = [
    // far edge: trunks on the far side of the clearing, crowns overlapping the top of the frame
    [-8.6, 1.9, 7.4, 2.2, 1], [-5.6, 1.4, 6.8, 1.9, 2], [-1.6, 2.3, 7.8, 2.1, 3], [2.4, 1.7, 7.0, 1.9, 4],
    [6.4, 1.1, 7.6, 2.4, 5], [10.4, 0.3, 6.9, 2.3, 6],
    // back trunks (crowns above the frame; fog lifts them)
    [-3.6, 4.2, 7.8, 2.2, 7], [4.6, 4.0, 7.5, 2.0, 8],
    // right-middle edge
    [11.4, -2.6, 7.2, 2.3, 9],
    // near corners: crowns enter the bottom of the frame (trunks below it)
    [-8.6, -9.2, 7.2, 2.4, 10], [-4.6, -10.0, 6.8, 2.0, 11], [6.8, -9.6, 7.0, 2.4, 12], [10.2, -8.4, 7.6, 2.2, 13],
  ];
  const treeAvoid = [], crowns = [];
  for (const [sx, sy, h, rad, seed] of on('trees') ? TREES : []) {
    const p = scr(sx, sy);
    p.y = H(p) - 0.1;
    const tree = createTree(engine, { kind: 'tall', seed: 100 + seed * 7, position: p, height: h, radius: rad, palette: CROWN, raiseThreshold: 0.66 });
    for (const { c, r: cr } of tree.userData.tree.crowns) crowns.push({ p: c.clone().add(p), r: cr });
    treeAvoid.push({ x: p.x, z: p.z, r: 0.45 });
  }
  // high canopy above the frame (towards the low sun): the crowns of the forest beyond the ring. Only its
  // shadow is ever seen (it sits 8-11 m up, far above the top edge at 30° pitch): it shades most of the air and
  // the ground and lets the light through a few FBM gaps + aimed slit families -> narrow shafts and lit stripes.
  if (on('canopy')) {
    const sunDir = sunDirFor(YAW, sunOpts.relAz, sunOpts.elev);
    // sun-slit families: n parallel strips across the light make a SET of parallel streaks in the air
    // [sx, sy (screen m, centre of the family's patch row), n, spacing (m across the light), width, length]
    const FAMILIES = [
      [-3.3, 0.6, 4, 0.95, 0.5, 2.0],       // across the ruin: lights the stub tops (focal pull)
      [1.2, -1.0, 4, 0.9, 0.5, 2.4],        // clearing centre / log
      [-6.8, -1.8, 3, 1.0, 0.5, 1.8],       // boulder group: sun rims
      [-1.2, 2.6, 2, 1.0, 0.45, 1.8],       // back edge
      [4.2, 0.6, 2, 1.0, 0.45, 2.0],        // right of the log
      [2.8, -3.8, 2, 0.95, 0.45, 2.0],      // foreground right
      [-3.4, -3.8, 1, 1.0, 0.55, 2.2],      // foreground left
    ];
    const families = (params.has('spot') ? [P('spot').split(',').map(Number)] : P('spots') === '0' ? [] : FAMILIES)
      // golden: parallel slit families (long shafts); a higher sun / the moon would turn a family into a short
      // ladder of stripes, so there every family is one plain opening instead
      .map(([sx, sy, n, spc, w, len]) => (tod === 'golden' || params.has('spot') ? { g: scr(sx, sy), n, sp: spc, w, len }
        : { g: scr(sx, sy), n: 1, sp: 1, w: Math.min(1.1, 0.35 * n + 0.25), len: len * 0.8 }));
    engine.scene.add(buildCanopy(engine, sunDir, { holes: num('holes') ?? 0.17, seed: num('cseed') ?? 29, blob: num('blob') ?? 0.8, families, crowns: P('litcrowns') === '0' ? [] : crowns, crownHole: num('crownhole') ?? 0.55 }));
  }
  // bushes at trunk bases
  [[-8.0, 1.2, 1.0, 3], [-5.0, 0.9, 0.85, 4], [5.9, 0.5, 1.15, 5], [9.0, -2.9, 0.9, 6], [2.9, 1.3, 0.8, 7]].forEach(([sx, sy, rad, seed]) => {
    const p = scr(sx, sy); p.y = H(p) - 0.05;
    createTree(engine, { kind: 'bush', seed: 300 + seed * 5, position: p, radius: rad });
    treeAvoid.push({ x: p.x, z: p.z, r: rad * 0.6 });
  });
  lap('trees');

  // ------------------------------------------------------------------ mushrooms (red caps, cream stems)
  const MUSH = [[-2.6, 0.35], [-2.45, 0.28], [-2.75, 0.22], [-6.0, -2.5], [-5.85, -2.6], [3.6, -0.15], [3.75, -0.05], [-0.9, 1.4]];
  const mush = buildMushrooms(engine, rng(77), MUSH.map(([sx, sy]) => { const p = scr(sx, sy); p.y = H(p); return p; }));
  engine.scene.add(mush);
  const mushAvoid = MUSH.map(([sx, sy]) => ({ ...xz(scr(sx, sy)), r: 0.13 }));
  lap('mushrooms');

  // ------------------------------------------------------------------ grass + lilac flowers
  const onStone = (x, z) => props.some((g) => g.userData.covers?.(x, z, 0.04));
  const grassAvoid = [...rocksA.avoid, ...rocksB.avoid, ...treeAvoid, ...logAvoid, ...mushAvoid];
  createGrass(engine, terrain, { area: grassArea, r: 0.22, seed: 5, mask: (x, z) => !onStone(x, z), avoid: grassAvoid, flowers: false });
  // lilac flowers in 4 drifts on the lit stripes (ellipses along the light, ragged by noise)
  const DRIFTS = [[-2.3, 0.15, 1.1], [0.6, -0.9, 1.3], [-6.0, -1.2, 1.0], [-3.2, -3.6, 1.1]].map(([sx, sy, rr]) => ({ ...xz(scr(sx, sy)), rr }));
  const inDrift = (x, z) => DRIFTS.some(({ x: dx, z: dz, rr }) => {
    const d = Math.hypot(x - dx, z - dz) / rr;
    return d < 1 && fbm2(x * 2.2, z * 2.2, { seed: 17, octaves: 2 }) > 0.2 + 0.25 * d;
  });
  createFlowers(engine, terrain, {
    area: grassArea, r: 0.13, seed: 6, mask: (x, z) => inDrift(x, z) && !onStone(x, z), avoid: grassAvoid,
    fraction: 0.5, patchThreshold: -1, mix: 0.3, tints: FLOWER_TINTS.glade, renderOrder: -9,
  });
  lap('grass');

  // ------------------------------------------------------------------ atmosphere
  // debug toggles / tuning overrides (see the header)
  const tune = (o, map) => { for (const [q, key] of map) if (num(q) !== undefined) o[key] = num(q); return o; };
  const addGodrays = (e, o) => on('rays') && addGodraysM(e, tune(o, [['raystr', 'strength'], ['raydens', 'density'], ['rayfall', 'falloff'], ['raytop', 'top'], ['rayfade', 'fade'], ['raygap', 'gap']]));
  const addFog = (e, o) => on('fog') && addFogM(e, tune(o, [['mist', 'mistAmount'], ['cover', 'mistCover'], ['mscale', 'mistScale'], ['fogamt', 'fogAmount'], ['mtop', 'mistTop']]));
  const addGrade = (e, o) => on('grade') && addGradeM(e, o);
  const createParticles = (e, o) => on('parts') && createParticlesM(e, o);
  const bounds = { x0: -12, x1: 12, y0: 0.1, y1: 5, z0: -12, z1: 12 };
  if (night) {
    createParticles(engine, { kind: 'fireflies', count: 90, seed: 3, halo: 2, haloGain: 1.5, bounds: { x0: -9, x1: 9, z0: -9, z1: 9, y0: 0.25, y1: 2.4 } });
    addGodrays(engine, { strength: 0.15, levels: 4, gap: 0.45, color: '#9FB6E8', top: 8, mistBoost: 0.5 });
    addFog(engine, { color: '#1E2A44', mistTop: 0.3, mistDepth: 0.5, mistAmount: 0.18, mistScale: 0.1, mistCover: 0.45, mistDrift: [0.04, 0.015], fogAmount: 0.35 });
    addGrade(engine, { grain: 0.035, vignette: 0.35 });
  } else if (tod === 'golden') {
    // dust only shows inside the (now narrow) shafts: more motes, full alpha; leaves in the glade leaf palette
    createParticles(engine, { kind: 'dust', count: 700, seed: 5, bounds: { ...bounds, y1: 4.5 }, colors: ['#FFE2B0'], alpha: 1 });
    createParticles(engine, { kind: 'leaves', count: 25, seed: 7, bounds: { ...bounds, y1: 6 }, colors: LEAF_COLORS });
    // colour: the module's default = the golden sun #FFC27A desaturated + pink-violet tint (measured #C5ABAB / #9D9391)
    // narrow shafts (canopy slits) lit through the whole air column: short fade at the ground, slow falloff with
    // height so the streaks cross the crowns/trunks too; a warm, hue-keeping lift (yellow-cream, not grey-pink)
    addGodrays(engine, { strength: 0.28, levels: 3, gap: 0.45, density: 0.7, top: 8, fade: 0.3, falloff: 3, mistBoost: 0.3, color: P('raycol') ? '#' + P('raycol') : '#EDE39A' });
    // low haze only in the hollows (mist top 0.15 m above the clearing floor), cool grey-violet, thin
    addFog(engine, { color: '#787380', mistTop: 0.15, mistDepth: 0.4, mistAmount: 0.25, mistScale: 0.16, mistCover: 0.72, mistShade: 0.35, mistDrift: [0.05, 0.02], fogAmount: 0.4 });
    addGrade(engine, { saturation: 0.95, vignette: 0.18 });
  } else {
    // morning / noon: the same forest with lighter air (preset sun / fog colours)
    createParticles(engine, { kind: 'dust', count: 200, seed: 5, bounds: { ...bounds, y1: 4.5 } });
    createParticles(engine, { kind: 'leaves', count: 20, seed: 7, bounds: { ...bounds, y1: 6 }, colors: LEAF_COLORS });
    addGodrays(engine, { strength: 0.25, levels: 4, gap: 0.45, top: 8, falloff: 1.8, mistBoost: 0.5 });
    addFog(engine, { color: '#8A8C92', mistTop: 0.25, mistDepth: 0.5, mistAmount: tod === 'morning' ? 0.25 : 0.15, mistScale: 0.16, mistCover: 0.55, mistShade: 0.35, mistDrift: [0.05, 0.02], fogAmount: 0.3 });
    addGrade(engine, {});
  }
  lap('atmos');

  // ?freeze=<t>: world animation (wind, mist, particles, rays) held at time t while ?pan=1 drives the camera
  // with the real t (whole-texel crawl checks: frames then differ only by the camera shift)
  if (params.has('freeze')) { const ft = num('freeze'); engine.onUpdate(() => { engine.uniforms.uTime.value = ft; }); }
}

// ---------------------------------------------------------------------------------------------------
// Per-face toned mesh: every triangle gets {mid, hi, sh} (sRGB hex) from pick(normal, centroid).
function toneFaces(geometry, pick) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.computeVertexNormals();
  const pos = g.attributes.position, n = g.attributes.normal, cnt = pos.count;
  const col = new Float32Array(cnt * 3), hi = new Float32Array(cnt * 3), sh = new Float32Array(cnt * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), ctr = new THREE.Vector3();
  for (let i = 0; i < cnt; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    fn.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    ctr.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    const t = pick(fn, ctr);
    const m = lin(t[1]), h = lin(t[0]), s = lin(t[2]);
    for (let k = i; k < i + 3; k++) {
      col.set([m.r, m.g, m.b], k * 3); hi.set([h.r, h.g, h.b], k * 3); sh.set([s.r, s.g, s.b], k * 3);
      n.setXYZ(k, fn.x, fn.y, fn.z);
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('toneHi', new THREE.BufferAttribute(hi, 3));
  g.setAttribute('toneSh', new THREE.BufferAttribute(sh, 3));
  return g;
}

const BARK = ['#8B8590', '#6B6470', '#4E4A5C'];
const CUT = ['#D2B48E', '#B08E70', '#7E6460'];
const MOSS = ['#94AA6F', '#71924B', '#4E6B55'];

// Fallen log along local Z: 8-sided prism with a flat top face, moss on the top facets, pale cut ends, 2 stubs.
function buildLog(engine, r, { length = 3.5, radius = 0.25 } = {}) {
  const cyl = (rad, len, sides, segs) => {
    const g = new THREE.CylinderGeometry(rad, rad, len, sides, segs, false, Math.PI / sides);
    g.rotateX(Math.PI / 2);          // axis Y -> Z; face normals at k·45° around Z, one facing +Y
    g.deleteAttribute('uv');
    return g.toNonIndexed();
  };
  const parts = [cyl(radius, length, 8, 7)];
  const stubs = [[0.55, 1, 0.42], [-0.9, -1, 0.34]];   // [z along log, side ±1, length]
  for (const [z, side, len] of stubs) {
    const s = cyl(0.075, len, 6, 1);
    s.translate(0, 0, len / 2);
    s.rotateX(-Math.PI / 4);                                // up 45°
    s.rotateY(side * Math.PI / 2);                          // out to the side
    s.translate(side * radius * 0.6, radius * 0.45, z);
    parts.push(s);
  }
  const merged = mergeGeometries(parts.map((p) => { p.deleteAttribute('normal'); return p; }));
  const seed = Math.floor(r() * 1000);
  const g = toneFaces(merged, (nrm, c) => {
    const along = Math.abs(nrm.z);
    if (along > 0.95 && Math.abs(c.z) > length / 2 - 0.01) return CUT;            // sawn / broken ends
    const m = fbm2(c.z * 1.6 + 3, c.x * 3 + 1, { seed, octaves: 2 });
    if (nrm.y > 0.9 && m > 0.32) return MOSS;
    if (nrm.y > 0.6 && m > 0.55) return MOSS;
    return BARK;
  });
  const mesh = toonMesh(engine, g, { vertexColors: true, toneAttributes: true, flatShading: true });
  mesh.name = 'log';
  return mesh;
}

// Shadow-only canopy: jagged low-poly crown blobs on a Poisson grid in the sun-facing half-plane, 8.4-10.6 m up,
// never in view (blobs that could project into the frame are slid up along the sun ray), unlit core tone, FLAG_NONE.
// The light gets through designed SLITS. A family {g, n, sp, w, len} = n parallel sun strips of width w (m, across
// the light), sp apart, centred on ground point g, len long along the light: every Poisson blob whose ground shadow
// touches the family's footprint is removed, and n+1 thin "branch" slats (chains of small blobs running along the
// light) are put back between and beside the strips, so the opening is n narrow tubes of light = n parallel hard
// shafts in the air + n narrow lit stripes on the grass (no merged slab). `holes` adds a few random FBM gaps.
// Coordinates: s = metres towards the sun, p = metres across (horizontal, ⊥ s).
function buildCanopy(engine, sunDir, { families = [], crowns = [], crownHole = 0.55, holes = 0.3, seed = 61, blob = 1 } = {}) {
  const S = sunDir.clone().setY(0).normalize();
  const Q = new THREE.Vector3(S.z, 0, -S.x);
  const cot = Math.sqrt(1 - sunDir.y * sunDir.y) / sunDir.y;
  const cam = engine.camera, T = cam.target, sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
  const Rr = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));                       // analytic basis
  const U = new THREE.Vector3(-sp * Math.sin(cam.yaw), cp, -sp * Math.cos(cam.yaw));          // (valid before update)
  const halfW = cam.viewHeight * 640 / 360 / 2, halfH = cam.viewHeight / 2;
  const r = rng(seed), geos = [];
  // ring crowns stay sun-lit: the canopy is opened over each crown's sun side (the crown itself then casts the
  // shadow below it), so the crowns get their back-lit rims instead of sitting in the canopy's shade
  const lit = crowns.map(({ p: c, r: cr }) => ({ gp: c.dot(Q), gs: c.dot(S) - c.y * cot, r: cr * crownHole }));
  const fam = families.map(({ g, n = 1, sp: spc = 1, w, len }) => ({ gp: g.dot(Q), gs: g.dot(S), n, spc, w, len, half: (n - 1) / 2 * spc + w / 2 }));
  // one jagged blob, centre (s, p, y) in sun coordinates; slid up along the sun ray if it would enter the frame
  const blobAt = (s, p, y, rad, flat = 0.7) => {
    const c = S.clone().multiplyScalar(s).addScaledVector(Q, p).setY(y);
    const v = c.clone().sub(T);
    const low = halfH + 0.8 - (v.dot(U) - rad * 0.75);             // keep above the top edge (+0.8 m for ?pan)
    if (Math.abs(v.dot(Rr)) < halfW + rad + 1 && low > 0) {
      const dy = low / (U.y + cot * S.dot(U));
      c.y += dy; c.addScaledVector(S, dy * cot);                     // same ground shadow
    }
    const g = new THREE.IcosahedronGeometry(rad, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {   // jagged: push vertices in/out (stable per vertex position)
      const k = 0.85 + 0.3 * fbm2(pos.getX(i) * 3 + s, pos.getZ(i) * 3 + pos.getY(i) * 2 + p, { seed: 3, octaves: 1 });
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * flat, pos.getZ(i) * k);
    }
    g.translate(c.x, c.y, c.z);
    g.deleteAttribute('uv');
    geos.push(g);
  };
  for (const [s, p] of poissonDisk2D({ x0: -14, z0: -26, w: 58, h: 52, r: 1.0 * blob, seed })) {
    const rad = (0.9 + r() * 0.35) * blob;
    const y = 8.4 + r() * 2.2;
    const gs = s - y * cot;                                          // ground shadow centre (s)
    // ground shadow ≈ ellipse rad across × rad·0.8/sin(elev) along the light
    const along = rad * 0.8 / sunDir.y;
    const hit = fam.some((f) => {
      const a = (p - f.gp) / (f.half + f.spc * 0.5 + rad * 0.6), b = (gs - f.gs) / (f.len / 2 + along);
      return a * a + b * b < 1;
    });
    if (hit) continue;
    if (lit.some((c) => {
      const a = (p - c.gp) / c.r, b = (gs - c.gs) / (c.r / sunDir.y);
      return a * a + b * b < 1;
    })) continue;
    if (fbm2(s * 0.21 + 5, p * 0.21 + 2, { seed: seed + 1, octaves: 3 }) < holes) continue;
    blobAt(s, p, y, rad);
  }
  // branch slats: between and beside the strips, running along the light past the ends of the strips
  // (irregular: each slat shifted / thickened a little and some strips shortened by a plug, so a family reads as
  // a loose set of shafts, not a grate)
  for (const f of fam) {
    const sw = Math.max(0.12, (f.spc - f.w) / 2);                   // slat half-width (across)
    const y0 = 9.2 + r() * 0.8;
    for (let k = -1; k < f.n; k++) {
      const outer = k === -1 || k === f.n - 1;
      const p0 = f.gp + (k + 0.5 - (f.n - 1) / 2) * f.spc + (outer ? 0 : (r() * 2 - 1) * 0.12 * f.spc);
      const ws = sw * (0.8 + r() * 0.45);
      const r0 = -(f.len / 2 + 2.6), r1 = f.len / 2 + 2.6;
      for (let a = r0; a <= r1; a += ws * 1.1) {
        const jitter = (r() * 2 - 1) * 0.04;
        blobAt(f.gs + a + y0 * cot, p0 + jitter + (outer ? Math.sign(k + 0.5) * ws * 0.6 : 0), y0 + (r() - 0.5) * 0.3, ws * (outer ? 1.6 : 1.05), 0.8);
      }
      if (k >= 0 && f.n > 1 && r() < 0.5) {                        // plug: shortens strip k from one end
        const pk = f.gp + (k - (f.n - 1) / 2) * f.spc, end = (r() < 0.5 ? -1 : 1) * (f.len / 2 + 0.6 - r() * 0.9);
        for (let a = 0; a < 3; a++) blobAt(f.gs + end + Math.sign(end) * a * 0.5 + y0 * cot, pk, y0, f.w * 0.75, 0.8);
      }
    }
  }
  engine.stats.canopyBlobs = geos.length;
  const mesh = toonMesh(engine, mergeGeometries(geos), { color: '#26413F', unlit: 'sh', outline: 'none', flatShading: true }, { castShadow: true, receiveShadow: false });
  mesh.name = 'canopy-casters';
  return mesh;
}

const CAP = ['#D0564C', '#B5443F', '#8E3135'];
const STEM = ['#F2E8D0', '#E8DCC0', '#B2A4A0'];

// Tiny mushrooms (3-5 px): cream box stem + red 8-sided cap. Opaque, no outline (an accent, like a sprite).
function buildMushrooms(engine, r, spots) {
  const parts = [];
  for (const p of spots) {
    const s = 0.75 + r() * 0.5;
    const sh = 0.07 * s, sw = 0.035 * s, cr = 0.065 * s, chh = 0.045 * s;
    const stem = new THREE.BoxGeometry(sw, sh, sw).translate(0, sh / 2, 0);
    const cap = new THREE.CylinderGeometry(cr * 0.45, cr, chh, 8, 1, false, Math.PI / 8).translate(0, sh + chh / 2 - 0.005, 0);
    for (const [g, tones] of [[stem, STEM], [cap, CAP]]) {
      g.deleteAttribute('uv');
      g.rotateY(Math.floor(r() * 2) * Math.PI / 4);
      g.translate(p.x, p.y - 0.01, p.z);
      parts.push(toneFaces(g, () => tones));
    }
  }
  const g = mergeGeometries(parts);
  const mesh = toonMesh(engine, g, { vertexColors: true, toneAttributes: true, flatShading: true, outline: 'none', cutMod: 1 }, { castShadow: false });
  mesh.name = 'mushrooms';
  return mesh;
}
