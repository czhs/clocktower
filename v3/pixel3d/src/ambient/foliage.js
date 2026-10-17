// Ambient system "foliage" (owner: foliage). Plants that answer the wind and the walkers: grass tufts part and
// bend around feet and spring back, tall grass is shoved aside and trodden flat, flowers bob, reeds sway, bushes
// rustle with a puff of leaves, leaves and petals drift down the wind; gust fronts roll across the meadow.
// Contract: docs/AMBIENT.md. Scene: scenes/ambient-foliage.js.
//
// ---- Unique-to-me sheet ---------------------------------------------------------------------------------------
// Extra animated parts: every blade is a 1-px stroke re-drawn per drawing (sway 1/2 px, pushed medium / hard,
//   trodden flat + splayed), flower blossoms riding their stem tips, cattail heads, bush leaf clusters jostled by
//   whole texels, falling leaf / petal flakes with 4 flip drawings + a lying drawing, a bush ground shadow.
// Own motion: wind is a travelling sway wave (5 fps, per-sprite tick phase) plus GUST FRONTS that sweep the field
//   (a band of grass laid over that you can watch cross the screen, reeds and tall grass bow furthest); under a
//   walker grass goes FLAT (deep) or is shoved hard away from them, then springs back in held 3-tick (5 fps)
//   beats: hard push -> half -> one texel -> one texel OVERSHOOT the other way -> back to the wind. Bushes shudder
//   for ~1 s (7.5 fps jostle, first beat shoved away from the walker) and throw 3-5 leaves up.
// Expressions in this style: a push is a silhouette change (tips move 3-8 px, the clump squashes), never a smooth
//   lean; flakes travel at 15 fps in whole texels and flip at 5 fps; no fades (flakes vanish after lying).
// Readability at game speed: plants react ON contact (they don't anticipate); the beat the eye reads is the
//   1.2 s recovery wake behind a 5.5 m/s walker: ~6 m of parted, springing grass trailing behind them. Tall grass is
//   CLUMPS (3-5 filled sprites on one depth row, 0.22 m apart) in ragged 3-lobe patches: a dark mass with blade tips
//   one band up (never in the shade band, <= mid at night), springing back on slower 4-tick beats. Gust FRONTS are a
//   1.3 m band of laid-over grass on the exact 15 Hz tick (short tufts flip a band, so the band reads as it crosses).
//   Flowers sit on a dark leaf rosette + stems and nod one texel (2 of 4 beats, clumps out of phase); never on paths.
//   Leaf puffs are 3x2..4x4 two-tone leaves landing clear of the bush and of prop footprints (opts.mask).
//
// Draw calls: ONE instanced mesh (toon material, colour + normal pass = 2 GL calls) for everything; no shadow
// casting, no lights. CPU per update: the trail texture (20 ticks x actors), a 15 Hz replay Ticker for bush and
// flower contacts, ~64 flake slots. Per-sprite reactions run on the GPU from the trail texture (no per-tuft state).
//
// opts (all optional; scene positions are world metres):
//   terrain         createTerrain result (tones / normals / isGrass: tufts take the ground's colour at the root)
//   area            {x0, z0, x1, z1} | 'view' (default): where the short-grass field grows (clipped to the frame)
//   mask(x, z)      extra placement filter (props, rocks); field: { r: 0.15, accent: 0.03, heights }
//   tall            [{x, z, r}] tall-grass patches          flowers [{x, z, r, tints: [hex], density}] clumps
//   reeds           [{x, z, r}] reed clumps                 bushes  [{x, z, r = 0.6, h = 0.8, seed}]
//   leafSources     [{x, y, z, r}] crowns that shed leaves  leaves  count of falling-leaf flakes (16)
//   gustBand        width (m) of the laid-over band at a gust front (1.3)
//   wind            {dir: [x, z], strength 0.55, gust 1, period 6.5, speed 6}    still: true = no wind at all
//   palettes        {bush: TREE_PALETTES.bush-like, reed: [hi, mid, sh, head], leafFlake: [hi, mid, sh, tip]}
// api: covers(x, z) (the foliage field owns this ground: mask the world grass there), wind (createWind), sources.
import * as THREE from 'three';
import { defineSystem, Ticker, GRID_HZ, gridIndex, gridTime, cycleFrame, hash, clamp } from './core.js';
import { toonMaterial } from '../materials/toon.js';
import { poissonDisk2D, fbm2 } from '../core/noise.js';
import { viewArea } from '../world/grass.js';
import { TREE_PALETTES } from '../world/trees.js';
import { buildFoliageAtlas, CW, CH, FLAKE_ROWS } from './foliage/atlas.js';
import { createWind } from './foliage/wind.js';
import { KIND, MAX_ACTORS, TRAIL_S, MAX_BUSH, VERTEX_HEAD, VERTEX, VIEW_VERTEX, FRAGMENT_HEAD, ALBEDO, TONES, LIGHT_MOD } from './foliage/shader.js';

const C = (hex) => new THREE.Color(hex);
const UP = new THREE.Vector3(0, 1, 0);

export default defineSystem({
  name: 'foliage', owner: 'foliage', budget: { glCalls: 2 },
  create(ctx, opts = {}) {
    const { engine, actors } = ctx;
    const seed = ctx.seed;
    const terrain = opts.terrain ?? null;
    const heightAt = (x, z) => (terrain ? terrain.heightAt(x, z) : ctx.heightAt(x, z));
    const cam = engine.camera;
    const tw = cam.texelWorld;
    const atlas = buildFoliageAtlas(opts.atlasSeed ?? 7);
    const wind = createWind(opts.still ? { ...(opts.wind || {}), strength: 0, gust: 0 } : (opts.wind || {}), seed, cam.target);
    const pal = {
      bush: { ...TREE_PALETTES.bush, ...(opts.palettes?.bush || {}) },
      reed: opts.palettes?.reed ?? ['#A9BF6A', '#8DA65A', '#5E7A4E', '#7A5236'],
      leafFlake: opts.palettes?.leafFlake ?? ['#C9B85A', '#9AA04C', '#557256', '#E0CF78'],
      leafFlakeWarm: opts.palettes?.leafFlakeWarm ?? ['#D9914A', '#B87545', '#7A5A50', '#E8B06A'],
    };
    const tonesOf = (hi, mid, sh) => ({ hi: C(hi), mid: C(mid), sh: C(sh) });
    const groundTones = (x, z) => {
      if (terrain?.tonesAt) return terrain.tonesAt(x, z);
      return tonesOf('#BBD985', '#75A558', '#3B6B5A');
    };
    const groundN = (x, z) => (terrain?.normalAt ? terrain.normalAt(x, z) : UP.clone());
    const isGrass = (x, z) => (terrain?.isGrass ? terrain.isGrass(x, z) : true);
    const mask = opts.mask ?? (() => true);

    // ---- frame test: only what the camera sees (+ a margin), so the field is ~half the AABB
    const R3 = cam.right.clone(), U3 = cam.up.clone(), T0 = cam.target.clone();
    const halfW = cam.viewHeight * (engine.lowW || 640) / (engine.lowH || 360) / 2, halfH = cam.viewHeight / 2;
    const onScreen = (x, y, z, m = 0.8) => {
      const dx = x - T0.x, dy = y - T0.y, dz = z - T0.z;
      const sx = dx * R3.x + dy * R3.y + dz * R3.z, sy = dx * U3.x + dy * U3.y + dz * U3.z;
      return Math.abs(sx) < halfW + m && sy > -halfH - m && sy < halfH + m + 0.6;
    };

    // ---- patches
    const tall = opts.tall ?? [], flowers = opts.flowers ?? [], reeds = opts.reeds ?? [];
    const bushes = (opts.bushes ?? []).slice(0, MAX_BUSH).map((b, i) => ({ r: 0.6, h: 0.8, seed: i + 1, ...b, i }));
    const edgeN = (x, z, s) => fbm2(x * 1.3 + s * 17.1, z * 1.3 - s * 5.3, { octaves: 3, seed: seed + s });
    const inPatch = (p, x, z, s) => { const d = Math.hypot(x - p.x, z - p.z) / p.r; return d < 1 && d < 0.72 + 0.5 * (edgeN(x, z, s) - 0.5) + 0.25; };
    // tall patches: the union of 3 offset lobes with a ragged edge (noise 0.8), never a stamped disc
    for (const [k, p] of tall.entries()) {
      const h = (q) => hash(k, q, seed + 77);
      const a0 = h(1) * Math.PI * 2;
      p.lobes = [{ x: p.x, z: p.z, r: p.r * 0.7 }];
      for (let j = 0; j < 2; j++) {
        const a = a0 + j * (2.3 + h(2) * 1.2), dd = p.r * (0.6 + 0.2 * h(3 + j));
        p.lobes.push({ x: p.x + Math.cos(a) * dd, z: p.z + Math.sin(a) * dd, r: p.r * (0.42 + 0.14 * h(5 + j)) });
      }
    }
    const lobeD = (p, x, z, s) => Math.min(...p.lobes.map((l) => Math.hypot(x - l.x, z - l.z) / l.r)) - 0.8 * (edgeN(x, z, s) - 0.5);
    const inTallP = (p, x, z, s) => lobeD(p, x, z, s) < 0.95;
    const inTall = (x, z) => tall.some((p, k) => inTallP(p, x, z, 3 + k));
    const inBush = (x, z, m = 0) => bushes.some((b) => Math.hypot(x - b.x, z - b.z) < b.r * 0.85 + m);
    const inReeds = (x, z) => reeds.some((p, k) => inPatch(p, x, z, 40 + k));

    const inst = [];
    const rnd = ctx.rng(11);
    const pick = (list) => list[Math.floor(rnd() * list.length) % list.length];
    const add = (o) => { inst.push(o); return o; };
    const sprite = (kind, x, z, col, extra = {}) => {
      const y = heightAt(x, z);
      return add({ kind, x, y, z, col, ph: rnd(), grp: 0, N: extra.N ?? groundN(x, z), T: extra.T ?? groundTones(x, z), tint: extra.tint ?? null, shape: [0, 0], ...extra });
    };

    // ---- short-grass field (the world-grass recipe, but every tuft reacts)
    let area = opts.area ?? 'view';
    if (area === 'view' || area?.view) area = viewArea(engine, 1.5);
    const F = { r: 0.15, accent: 0.03, heights: [0.3, 0.45, 0.25], ...(opts.field || {}) };
    const counts = { tuft: 0, tall: 0, flower: 0, reed: 0, leaf: 0, bushes: bushes.length };
    if (opts.field !== false) {
      const pts = poissonDisk2D({ x0: area.x0, z0: area.z0, w: area.x1 - area.x0, h: area.z1 - area.z0, r: F.r, seed: seed % 100000 + 5,
        accept: (x, z) => isGrass(x, z) && mask(x, z) && !inTall(x, z) && !inBush(x, z) && onScreen(x, heightAt(x, z), z), max: 60000 });
      const hc = [F.heights[0], F.heights[0] + F.heights[1]];
      for (const [x, z] of pts) {
        const v = rnd(), size = v < hc[0] ? 0 : v < hc[1] ? 1 : 2;
        sprite(KIND.TUFT, x, z, pick(atlas.cols.tuft[size]), { grp: rnd() < F.accent ? 1 : 0 });
        counts.tuft++;
      }
    }
    // ---- tall grass, flowers, reeds
    const scatter = (p, r, s, fn, inside = inPatch, ext = 1) => {
      const R = p.r * ext;
      const pts = poissonDisk2D({ x0: p.x - R, z0: p.z - R, w: 2 * R, h: 2 * R, r, seed: seed % 100000 + s,
        accept: (x, z) => inside(p, x, z, s) && mask(x, z) && !inBush(x, z, 0.1) });
      for (const [x, z] of pts) fn(x, z);
    };
    // tall grass: CLUMPS. Clump centres at 0.22 m; each clump is 3-5 filled sprites side by side along camera-right on
    // one depth row (a shared tip row) sharing one wind phase, so the patch reads as overlapping rows of blade masses
    // with shade between them; tips take the ground's own hi tone (no boost), short edge clumps on the ragged rim
    tall.forEach((p, k) => scatter(p, p.spacing ?? 0.22, 3 + k, (x, z) => {
      const edge = lobeD(p, x, z, 3 + k) > 0.8;
      const n = edge ? 2 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 3), ph = rnd(), step = (3 + rnd() * 1.5) * tw;
      for (let j = 0; j < n; j++) {
        const o = (j - (n - 1) / 2) * step + (rnd() - 0.5) * tw;
        const xx = x + R3.x * o, zz = z + R3.z * o;
        if (!isGrass(xx, zz) || !mask(xx, zz)) continue;
        const T = groundTones(xx, zz);
        sprite(KIND.TALL, xx, zz, pick(edge ? atlas.cols.tallEdge : atlas.cols.tall), { T, tint: T.hi, ph }); counts.tall++;
      }
    }, inTallP, 1.5));
    flowers.forEach((p, k) => {
      const tints = (p.tints ?? ['#CA91E3', '#A875D7']).map(C);
      scatter(p, p.spacing ?? 0.16, 20 + k, (x, z) => {
        if (rnd() > (p.density ?? 0.85)) return;
        const tint = rnd() < 0.85 ? tints[0] : tints[Math.floor(rnd() * tints.length)];
        if (!isGrass(x, z)) return;      // never on the trail / mud (reeds keep their rim exception)
        sprite(KIND.FLOWER, x, z, pick(atlas.cols.flower), { tint, clump: k, grp: k + 1 }); counts.flower++;
      });
    });
    const reedT = tonesOf(pal.reed[0], pal.reed[1], pal.reed[2]), reedHead = C(pal.reed[3]);
    reeds.forEach((p, k) => scatter(p, p.spacing ?? 0.27, 40 + k, (x, z) => { sprite(KIND.REED, x, z, pick(atlas.cols.reed), { T: reedT, tint: reedHead }); counts.reed++; }));

    // ---- bushes: a dark core blob + leaf-cluster sprites on a dome (lit with the dome normal) + ground shadow
    const bushT = tonesOf(pal.bush.hi, pal.bush.mid, pal.bush.sh), bushTip = C(pal.bush.tip), bushCore = C(pal.bush.core);
    const fwd = new THREE.Vector3().crossVectors(U3, R3).normalize();    // camera look direction (up x right)
    const toCam = fwd.clone().negate();
    for (const b of bushes) {
      const gy = heightAt(b.x, b.z);
      const c = new THREE.Vector3(b.x, gy + b.h * 0.45, b.z);
      const br = rng2(seed + b.seed * 131);
      const n = Math.round((2 * Math.PI * b.r * b.h * 1.4) / Math.pow(tw * 4.6, 2));
      let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < n; i++) {
        const yy = 1 - (i + 0.5) / n * 1.6;                       // upper ~80 % of a sphere
        const rr = Math.sqrt(Math.max(0, 1 - yy * yy)), th = i * golden + br() * 0.4;
        const nx = Math.cos(th) * rr, nz = Math.sin(th) * rr;
        const nrm = new THREE.Vector3(nx, yy, nz);
        if (nrm.dot(toCam) < -0.15) continue;                     // back face: behind the core
        const lump = 1 + (br() - 0.5) * 0.16;
        const p = new THREE.Vector3(c.x + nx * b.r * lump, c.y + yy * b.h * 0.55 * lump, c.z + nz * b.r * lump);
        if (p.y < gy + 0.04) continue;
        const N = nrm.clone().multiplyScalar(0.75).addScaledVector(UP, 0.25).normalize();
        add({ kind: KIND.LEAF, x: p.x, y: p.y - 0.06, z: p.z, col: atlas.cols.leaf[Math.floor(br() * atlas.cols.leaf.length)], ph: br(), grp: b.i + 1, N, T: bushT, tint: bushTip, shape: [0, 0] });
        counts.leaf++;
        const d = p.clone().sub(c);
        const sx = d.dot(R3), sy = d.dot(U3);
        sx0 = Math.min(sx0, sx); sx1 = Math.max(sx1, sx); sy0 = Math.min(sy0, sy); sy1 = Math.max(sy1, sy);
      }
      // core: the leaf hull minus a rim, in texels; anchored at its centre (moved along camera right/up)
      const cw = Math.max(4, Math.round((sx1 - sx0) / tw) - 5), chh = Math.max(4, Math.round((sy1 - sy0) / tw) + 2);
      const cc = c.clone().addScaledVector(R3, (sx0 + sx1) / 2).addScaledVector(U3, (sy0 + sy1) / 2 + 2 * tw);
      add({ kind: KIND.CORE, x: cc.x, y: cc.y, z: cc.z, col: -1, ph: 0.5, grp: b.i + 1, N: UP.clone(), T: { hi: bushCore, mid: bushCore, sh: bushCore }, tint: null,
        shape: [cw + (cw % 2), chh + (chh % 2)], sortBack: b.r * 0.9 });
      add({ kind: KIND.SHADOW, x: b.x, y: gy, z: b.z, col: -1, ph: 0.25, grp: 0, N: groundN(b.x, b.z), T: groundTones(b.x, b.z), tint: null, shape: [b.r * 1.05, b.r * 1.05], first: true });
      b.top = new THREE.Vector3(c.x, c.y + b.h * 0.5, c.z);
    }
    const nStatic = inst.length;

    // ---- flake slots (falling leaves, petals, leaf puffs): appended after the sorted sprites
    const MAXF = opts.maxFlakes ?? 72;
    const leafT = tonesOf(pal.leafFlake[0], pal.leafFlake[1], pal.leafFlake[2]), leafTip = C(pal.leafFlake[3]);
    const warmT = tonesOf(pal.leafFlakeWarm[0], pal.leafFlakeWarm[1], pal.leafFlakeWarm[2]), warmTip = C(pal.leafFlakeWarm[3]);
    const N = nStatic + MAXF;

    // ---- geometry + attributes
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    for (const k of ['position', 'normal', 'uv']) geo.setAttribute(k, quad.attributes[k]);
    const A = {
      aBase: new Float32Array(N * 3), aBaseN: new Float32Array(N * 3), color: new Float32Array(N * 3), toneHi: new Float32Array(N * 3),
      toneSh: new Float32Array(N * 3), aTint: new Float32Array(N * 3), aVar: new Float32Array(N * 4), aDyn: new Float32Array(N * 2), aShape: new Float32Array(N * 2),
    };
    const SZ = { aVar: 4, aDyn: 2, aShape: 2 };
    for (const [k, arr] of Object.entries(A)) {
      const at = new THREE.InstancedBufferAttribute(arr, SZ[k] ?? 3);
      if (k === 'aBase' || k === 'aDyn' || k === 'aBaseN' || k === 'color' || k === 'toneHi' || k === 'toneSh' || k === 'aTint' || k === 'aVar') at.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(k, at);
    }
    geo.instanceCount = N;
    const writeInst = (i, p) => {
      const o = i * 3;
      A.aBase[o] = p.x; A.aBase[o + 1] = p.y; A.aBase[o + 2] = p.z;
      A.aBaseN[o] = p.N.x; A.aBaseN[o + 1] = p.N.y; A.aBaseN[o + 2] = p.N.z;
      A.color[o] = p.T.mid.r; A.color[o + 1] = p.T.mid.g; A.color[o + 2] = p.T.mid.b;
      A.toneHi[o] = p.T.hi.r; A.toneHi[o + 1] = p.T.hi.g; A.toneHi[o + 2] = p.T.hi.b;
      A.toneSh[o] = p.T.sh.r; A.toneSh[o + 1] = p.T.sh.g; A.toneSh[o + 2] = p.T.sh.b;
      const t = p.tint ?? p.T.hi;
      A.aTint[o] = t.r; A.aTint[o + 1] = t.g; A.aTint[o + 2] = t.b;
      A.aVar[i * 4] = p.col; A.aVar[i * 4 + 1] = p.kind; A.aVar[i * 4 + 2] = p.ph; A.aVar[i * 4 + 3] = p.grp;
      A.aDyn[i * 2] = p.frame ?? -1; A.aDyn[i * 2 + 1] = p.hidden ? 0 : 1;
      A.aShape[i * 2] = p.shape[0]; A.aShape[i * 2 + 1] = p.shape[1];
    };
    // far -> near (painter's order for upward sprites; no depth writes); ground shadows first; cores behind leaves
    const order = inst.slice(0, nStatic);
    let sortedFor = null;
    const sort = () => {
      const key = `${cam.yaw.toFixed(4)}:${cam.pitch.toFixed(4)}`;
      if (key === sortedFor) return;
      sortedFor = key;
      const f = new THREE.Vector3().crossVectors(cam.up, cam.right).normalize();   // look direction: larger = farther
      for (const p of order) p.d = p.first ? 1e9 : p.x * f.x + p.y * f.y + p.z * f.z + (p.sortBack ?? 0);
      order.sort((a, b) => b.d - a.d);
      order.forEach((p, i) => writeInst(i, p));
      for (const k of Object.keys(A)) { const at = geo.attributes[k]; at.clearUpdateRanges?.(); at.needsUpdate = true; }
    };
    for (let i = nStatic; i < N; i++) writeInst(i, { x: 0, y: -100, z: 0, N: UP, T: leafT, tint: leafTip, col: atlas.cols.flakeLeaf, kind: KIND.FLAKE, ph: 0, grp: 0, frame: 0, hidden: true, shape: [0, 0] });
    sort();

    // ---- uniforms + material
    const trailData = new Float32Array(TRAIL_S * MAX_ACTORS * 2 * 4);
    const trailTex = new THREE.DataTexture(trailData, TRAIL_S, MAX_ACTORS * 2, THREE.RGBAFormat, THREE.FloatType);
    trailTex.magFilter = trailTex.minFilter = THREE.NearestFilter; trailTex.generateMipmaps = false; trailTex.needsUpdate = true;
    const camR2 = new THREE.Vector2(R3.x, R3.z).normalize();
    const U = {
      tFolAtlas: { value: atlas.texture }, tTrail: { value: trailTex },
      uTrailInfo: { value: new THREE.Vector4(TRAIL_S, 0, 0, 0) }, uTrailBox: { value: new THREE.Vector4(0, 0, 0, 0) },
      uFolGrid: { value: new THREE.Vector2(...atlas.grid) }, uFolCell: { value: new THREE.Vector2(CW, CH) },
      uGTick: { value: 0 },
      uWindDir: { value: new THREE.Vector2(...wind.W.dir) },
      uWindSx: { value: Math.sign(wind.W.dir[0] * camR2.x + wind.W.dir[1] * camR2.y) || 1 },
      uWind: { value: new THREE.Vector4(wind.W.strength, 0.55, 2.6, wind.W.gust > 0 ? 1.0 : 0) },
      uGust: { value: [new THREE.Vector4(-99, 0, 6, 0), new THREE.Vector4(-99, 0, 6, 0), new THREE.Vector4(-99, 0, 6, 0)] },
      uBush: { value: Array.from({ length: MAX_BUSH }, () => new THREE.Vector4(-1, 1, 0, 0)) },
      uCamRight: { value: camR2 }, uShadowOff: { value: new THREE.Vector2(0, 0) }, uFolDebug: { value: opts.debug === 'kinds' ? 1 : 0 },
      uGustBand: { value: new THREE.Vector2(opts.gustBand ?? 1.3, 0.5) },        // front band width (m), min gust amplitude
      uFolNight: { value: (ctx.tod?.night ?? 0) >= 0.9 ? 1 : 0 },
    };
    const material = toonMaterial(engine, {
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.NoBlending, alphaTest: 0.5,
      outline: 'none', toneAttributes: true, uniforms: U, lightPos: 'aBase',
      vertexHead: VERTEX_HEAD, objectNormal: 'objectNormal = aBaseN;', vertex: VERTEX, viewVertex: VIEW_VERTEX,
      fragmentHead: FRAGMENT_HEAD, albedo: ALBEDO, tones: TONES, lightMod: LIGHT_MOD,
    });
    // the terrain's lighting-normal noise, shared by reference (tufts = ground colour at the root, exactly)
    const tToon = terrain?.mesh?.material?.userData?.toon;
    if (tToon?.uNormalNoise) material.userData.toon.uNormalNoise = tToon.uNormalNoise;
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = 'ambient-foliage'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.renderOrder = opts.renderOrder ?? 0;
    ctx.root.add(mesh);

    // ---- contacts: bushes (rustle + leaf puff) and flower clumps (petals), on a 15 Hz replay ticker
    const clumps = flowers.map((p, k) => ({ ...p, k, tints: (p.tints ?? ['#CA91E3', '#A875D7']).map(C) }));
    const ev = { bush: [], petal: [] };
    const inC = { bush: new Uint8Array(bushes.length), clump: new Uint8Array(clumps.length) };
    const pushEv = (list, e) => { list.push(e); if (list.length > 48) list.shift(); };
    const ticker = new Ticker({
      hz: GRID_HZ, mode: actors.live ? 'live' : 'replay',
      reset() { ev.bush.length = 0; ev.petal.length = 0; inC.bush.fill(0); inC.clump.fill(0); },
      tick(t) {
        const snap = actors.snapshot(t);
        for (const b of bushes) {
          const hit = snap.nearest(b.x, b.z, b.r + 1.5);
          const touch = !!hit && hit.d < b.r + hit.item.radius + 0.12;
          const last = ev.bush.findLast?.((e) => e.b === b.i);
          if (touch && (!inC.bush[b.i] || (hit.speed > 0.5 && last && t - last.t > 1.0))) {
            // leaves shoved AWAY from the walker (screen side), puff thrown away from them
            const sx = hit.ax * camR2.x + hit.az * camR2.y;
            pushEv(ev.bush, { t, b: b.i, side: sx >= 0 ? 1 : -1, ax: hit.ax, az: hit.az, n: ev.bush.length });
          }
          inC.bush[b.i] = touch ? 1 : 0;
        }
        for (const c of clumps) {
          const hit = snap.nearest(c.x, c.z, c.r + 1.0);
          const touch = !!hit && hit.d < c.r * 0.8 + hit.item.radius && hit.speed > 0.3;
          if (touch && !inC.clump[c.k]) pushEv(ev.petal, { t, c: c.k, ax: hit.ax, az: hit.az, vx: hit.item.vx, vz: hit.item.vz, n: ev.petal.length });
          inC.clump[c.k] = touch ? 1 : 0;
        }
      },
    });

    // ---- flakes: pure f(t) from the leaf sources, the contact events and the gusts
    const sources = opts.leafSources ?? [];
    const nLeaves = sources.length ? (opts.leaves ?? 16) : 0;
    const flakes = [];
    const flakeAt = (o, t, out) => {
      // o: { t0, x, y, z, ux, uz (pop velocity, m), up (pop height), vf (fall m/s), life, ph, rows }
      const tau = gridTime(t) - o.t0;
      if (tau < 0 || tau >= o.life) return null;
      const pop = o.up > 0 ? clamp(tau / 0.35) : 1;
      const popE = 1 - (1 - pop) * (1 - pop);
      const yTop = o.y + o.up * popE;
      const fallT = Math.max(0, tau - (o.up > 0 ? 0.35 : 0));
      const gy = heightAt(o.x, o.z) + 0.01;
      let y = yTop - o.vf * fallT;
      const landed = y <= gy;
      const tFly = landed ? (yTop - gy) / o.vf + (o.up > 0 ? 0.35 : 0) : tau;
      const drift = wind.driftBetween(o.x, o.z, o.t0, o.t0 + tFly);
      const fl = Math.sin((landed ? tFly : Math.floor(tau * 7.5) / 7.5) * 2.6 + o.ph * 6.3);   // flutter: 7.5 fps
      const flut = (o.flutter ?? 0.22) * fl;
      const [dx, dz] = wind.W.dir;
      out.x = o.x + o.ux * popE + dx * drift - dz * flut;
      out.z = o.z + o.uz * popE + dz * drift + dx * flut;
      if (landed && !mask(out.x, out.z)) return null;   // landed on a prop footprint: slipped behind it (props hide it)
      out.y = landed ? heightAt(out.x, out.z) + 0.01 : Math.max(y, heightAt(out.x, out.z) + 0.01);
      out.frame = landed ? o.rows.lying : o.rows.fall[cycleFrame(t, 4, 3, Math.floor(o.ph * 3))];
      return out;
    };
    const buildFlakes = (t) => {
      flakes.length = 0;
      // falling leaves: per leaf a fixed period, a new spawn (source, point, colour) per cycle
      for (let i = 0; i < nLeaves; i++) {
        const per = 8 + hash(i, 1, seed) * 5, off = hash(i, 2, seed) * per;
        const cyc = Math.floor((t + off) / per), t0 = cyc * per - off;
        const h = (k) => hash(i * 977 + cyc, k, seed);
        const s = sources[Math.floor(h(3) * sources.length) % sources.length];
        const a = h(4) * Math.PI * 2, rr = Math.sqrt(h(5)) * s.r;
        const warm = h(6) < 0.3;
        flakes.push({ t0, x: s.x + Math.cos(a) * rr, y: s.y - h(7) * 0.4, z: s.z + Math.sin(a) * rr, ux: 0, uz: 0, up: 0,
          vf: 0.32 + h(8) * 0.18, life: per - 0.2, ph: h(9), rows: FLAKE_ROWS.leaf, col: atlas.cols.flakeLeaf,
          T: warm ? warmT : leafT, tint: warm ? warmTip : leafTip });
      }
      // leaf puffs from rustled bushes: 3-5 leaves thrown up and away, flutter down, lie 1.6 s
      for (const e of ev.bush) {
        if (t - e.t > 6) continue;
        const b = bushes[e.b];
        const n = 7 + Math.floor(hash(e.b, e.n, seed) * 3);
        for (let k = 0; k < n; k++) {
          const h = (q) => hash(e.n * 31 + k, q + e.b * 7, seed);
          const sp = (h(1) - 0.5) * 2.2, cs = Math.cos(sp), sn = Math.sin(sp), d = b.r + 0.25 + h(2) * 0.6;   // lands clear of the bush
          const ax = (e.ax * cs - e.az * sn), az = (e.ax * sn + e.az * cs);
          const warm = h(6) < 0.2;   // the puff: young yellow-green leaves + a few turned ones (bush greens vanish on the bush)
          flakes.push({ t0: gridTime(e.t) + (k % 3) / GRID_HZ, x: b.top.x + (h(3) - 0.5) * b.r, y: b.top.y - 0.1, z: b.top.z + (h(4) - 0.5) * b.r * 0.6, ux: ax * d, uz: az * d,
            up: 0.55 + h(5) * 0.55, vf: 0.38 + h(7) * 0.2, life: 3.4 + h(8), ph: h(9), rows: FLAKE_ROWS.leaf, col: atlas.cols.flakeLeaf,
            T: warm ? warmT : leafT, tint: warm ? warmTip : leafTip, flutter: 0.15 });
        }
      }
      // petals: brushed clumps throw 3-4, every strong gust strips 1-2 from each clump
      const petal = (c, t0, k, salt, ax, az, up) => {
        const h = (q) => hash(salt * 53 + k, q + c.k * 11, seed);
        const a = h(1) * Math.PI * 2, rr = Math.sqrt(h(2)) * c.r * 0.8;
        flakes.push({ t0, x: c.x + Math.cos(a) * rr, y: heightAt(c.x, c.z) + 0.22 + h(3) * 0.1, z: c.z + Math.sin(a) * rr,
          ux: ax * (0.2 + h(4) * 0.4), uz: az * (0.2 + h(4) * 0.4), up, vf: 0.22 + h(5) * 0.1, life: 3.0 + h(6) * 1.2, ph: h(7),
          rows: FLAKE_ROWS.petal, col: atlas.cols.flakePetal, T: leafT, tint: c.tints[Math.floor(h(8) * c.tints.length) % c.tints.length], flutter: 0.12 });
      };
      for (const e of ev.petal) {
        if (t - e.t > 5) continue;
        const c = clumps[e.c];
        const n = 3 + Math.floor(hash(e.c, e.n, seed + 1) * 2);
        for (let k = 0; k < n; k++) petal(c, gridTime(e.t), k, e.n + 1000, e.ax, e.az, 0.18 + hash(e.n, k, seed + 2) * 0.25);
      }
      if (wind.W.gust > 0) {
        for (const g of wind.events(t)) {
          if (g.a < 0.95 * wind.W.gust) continue;
          for (const c of clumps) {
            const ta = gridTime(g.t0 + wind.along(c.x, c.z) / g.speed + 0.3);
            if (t < ta || t - ta > 5) continue;
            const n = 1 + Math.floor(hash(g.j, c.k, seed + 3) * 2);
            for (let k = 0; k < n; k++) petal(c, ta + k * 0.2, k, g.j + 5000, wind.W.dir[0], wind.W.dir[1], 0.12);
          }
        }
      }
    };

    // ---- trail texture: every actor's position at the last TRAIL_S grid ticks (age 0 = now)
    const live = { ring: [], last: -1 };
    const fillTrail = (t) => {
      const gi = gridIndex(t);
      trailData.fill(0);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, na = 0;
      const ids = new Map();
      const putS = (a, i, it) => {
        const r = (it.radius ?? 0.3) + 0.22;
        const o = ((a * 2) * TRAIL_S + i) * 4, o2 = ((a * 2 + 1) * TRAIL_S + i) * 4;
        trailData[o] = it.x; trailData[o + 1] = it.z; trailData[o + 2] = i; trailData[o + 3] = r;
        trailData[o2] = it.vx; trailData[o2 + 1] = it.vz; trailData[o2 + 2] = it.speed; trailData[o2 + 3] = 1;
        x0 = Math.min(x0, it.x - r - 0.3); z0 = Math.min(z0, it.z - r - 0.3); x1 = Math.max(x1, it.x + r + 0.3); z1 = Math.max(z1, it.z + r + 0.3);
      };
      const slot = (id) => { if (!ids.has(id)) { if (ids.size >= MAX_ACTORS) return -1; ids.set(id, ids.size); } return ids.get(id); };
      if (!actors.live) {
        // sampled actors: exact positions at every past tick -> the wake is a pure function of t
        for (let i = 0; i < TRAIL_S; i++) {
          const ti = (gi - i) / GRID_HZ;
          if (ti < 0) break;
          for (const it of actors.snapshot(ti).items) { const a = slot(it.id); if (a >= 0) putS(a, i, it); }
        }
      } else {
        // live game feed: a ring of the last TRAIL_S tick snapshots (forward-only)
        if (gi < live.last) live.ring.length = 0;
        if (gi !== live.last) { live.ring.unshift({ gi, items: actors.snapshot(gi / GRID_HZ).items.map((x) => ({ ...x })) }); live.ring.length = Math.min(live.ring.length, TRAIL_S); live.last = gi; }
        for (const s of live.ring) { const i = gi - s.gi; if (i < 0 || i >= TRAIL_S) continue; for (const it of s.items) { const a = slot(it.id); if (a >= 0) putS(a, i, it); } }
      }
      na = ids.size;
      U.uTrailInfo.value.set(TRAIL_S, na, 0, 0);
      if (na) U.uTrailBox.value.set(x0, z0, x1, z1); else U.uTrailBox.value.set(0, 0, 0, 0);
      trailTex.needsUpdate = true;
      return na;
    };

    const tmp = { x: 0, y: 0, z: 0, frame: 0 };
    let tod = ctx.tod, nFlakes = 0, lastActors = 0, lastT = 0;
    const sunOff = () => {
      const L = engine.uniforms.uSunDir.value;
      const k = 0.35 / Math.max(L.y, 0.35);
      U.uShadowOff.value.set(clamp(-L.x * k, -0.35, 0.35), clamp(-L.z * k, -0.35, 0.35));
    };
    sunOff();
    return {
      update(t) {
        sort();
        const gi = gridIndex(t);
        U.uGTick.value = gi;
        const gt = gridTime(t);
        const evs = wind.events(gt);
        evs.forEach((e, k) => U.uGust.value[k].set(e.t0, e.a, e.speed, 0));
        lastT = gt;
        lastActors = fillTrail(t);
        ticker.advance(t);
        for (let b = 0; b < MAX_BUSH; b++) U.uBush.value[b].set(-1, 1, 0, 0);
        for (const e of ev.bush) { const age = gi - Math.round(e.t * GRID_HZ); if (age >= 0 && age < 15) U.uBush.value[e.b].set(age, e.side, 0, 0); }
        // flakes
        buildFlakes(gt);
        nFlakes = 0;
        for (const o of flakes) {
          if (nFlakes >= MAXF) break;
          const p = flakeAt(o, t, tmp);
          if (!p) continue;
          writeInst(nStatic + nFlakes, { x: p.x, y: p.y, z: p.z, N: UP, T: o.T, tint: o.tint, col: o.col, kind: KIND.FLAKE, ph: o.ph, grp: 0, frame: p.frame, shape: [0, 0] });
          nFlakes++;
        }
        for (let i = nStatic + nFlakes; i < N; i++) A.aDyn[i * 2 + 1] = 0;
        for (const k of ['aBase', 'aBaseN', 'color', 'toneHi', 'toneSh', 'aTint', 'aVar']) {
          const at = geo.attributes[k];
          at.clearUpdateRanges(); at.addUpdateRange(nStatic * at.itemSize, MAXF * at.itemSize); at.needsUpdate = true;
        }
        const ad = geo.attributes.aDyn; ad.clearUpdateRanges(); ad.addUpdateRange(nStatic * 2, MAXF * 2); ad.needsUpdate = true;
      },
      setTimeOfDay(info) { tod = info; sunOff(); U.uFolNight.value = (info?.night ?? 0) >= 0.9 ? 1 : 0; },
      stats() {
        return { agents: nStatic, ...counts, flakes: nFlakes, actors: lastActors, rustles: ev.bush.length, petalBursts: ev.petal.length,
          calls: 2, lights: 0, tod: tod?.name ?? '', resets: ticker.resets, gust: +wind.gust(cam.target.x, cam.target.z, lastT).toFixed(2) };
      },
      dispose() { mesh.removeFromParent(); geo.dispose(); material.dispose(); atlas.texture.dispose(); trailTex.dispose(); },
      api: {
        wind, bushes, clumps,
        covers: (x, z) => x >= area.x0 && x <= area.x1 && z >= area.z0 && z <= area.z1,
        setWind(w = {}) { Object.assign(wind.W, w); U.uWind.value.x = wind.W.strength; U.uWind.value.w = wind.W.gust > 0 ? 1.0 : 0; },
      },
    };
  },
});

function rng2(s) { let a = s >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
