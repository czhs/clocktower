// Grass (owner: grass agent). t3ssel8r / Holland grass: instanced, screen-aligned tuft sprites whose
// colour is the GROUND's toon colour evaluated at the tuft root (docs/TECHNIQUES.md §5).
//
//   const grass = createGrass(engine, terrain, opts)   // adds itself to engine.scene
//   grass.mesh       THREE.Mesh (one InstancedBufferGeometry, frustumCulled=false, 2 draw calls/frame)
//   grass.meshes     [grass.mesh]
//   grass.count      instance count (tufts + flowers)
//   grass.material   the toon material (uniforms: grass.uniforms)
//   grass.update()   re-sorts instances far->near if the camera yaw/pitch changed (also runs via onUpdate)
//
// Options (all optional):
//   area: {x0, z0, x1, z1}       world rect to fill (default: the terrain square minus 1 m)
//         | 'view' | {view: true, margin: 2.5}   the AABB of what the camera sees (call camera.set first)
//   r: 0.15                      Poisson-disk radius (m). Auto-raised so the count stays <= maxCount
//                                (pass a tight `area` around the view to keep full density)
//   maxCount: 80000
//   seed: 1
//   mask(x, z) -> bool           extra placement filter (on top of terrain.isGrass)
//   avoid: [{x, z, r}]           discs without grass (basins, building footprints)
//   accent: 0.03                 fraction of tufts "bumped a cut" (brighter, lifted toward the camera); only
//                                where the root is sunlit (dropped inside cast / canopy / cloud shadow)
//   heights: [0.30, 0.45, 0.25]  probability of small / medium / tall tufts
//   scale: 1                     multiplies blade heights in the atlas (max 11 px; 1 sprite texel = 1 screen texel always)
//   wind: {fps: 3.5, dir: [1, 0.35], wave: 0.55, speed: 2.6, strength: 1}  (strength 0 = still)
//   flowers: true | false | {fraction, tints, patchScale, patchThreshold, seed, bump}  (see flowers.js)
//   only: 'flowers'              drop grass tufts (used by createFlowers)
//   tones(x, z) -> {hi, mid, sh} override the ground tones (default terrain.tonesAt, else colorAt × ramp)
//   renderOrder: -10             grass draws before other transparent sprites (leaves, reeds)
//   depthBias: 0.05              view-space lift (m) so the root row never z-fights the ground
//
// Material contract (PIPELINE.md / TECHNIQUES §0.4): transparent, depthWrite off, NoBlending, alpha cut-out,
// FLAG_NONE in the normal pass, castShadow off, receiveShadow on. Every lighting input (albedo tones,
// normal, normal noise, shadow-map lookup, cloud) is taken at the root, so inside a lighting band a tuft
// is invisible and band / shadow / cloud edges break into blade fringes.
import * as THREE from 'three';
import { rng, poissonDisk2D } from '../core/noise.js';
import { toonMaterial, NOISE_GLSL, DEFAULT_HI, DEFAULT_SH } from '../materials/toon.js';
import { flowerSprites, pickFlowers, FLOWER_LIGHT_GLSL } from './flowers.js';

export const CELL = 12;     // atlas cell size in texels (sprite quad = CELL × CELL screen texels)
export const FRAMES = 3;    // wind frames per sprite: rest, bent 1, bent 2

// ---------------------------------------------------------------------------------------------
// Atlas. A sprite = strokes of pixels, each stroke drawn bottom->top with its own height so wind can
// bend the top more than the root. Pixel kinds: 0 = blade/stem (ground tones), 1 = blossom, 2 = blossom
// highlight. Encoded as RGBA8: A = coverage, R = 255 for blade, 0 for blossom, G = 255 main / 128 highlight.
// ---------------------------------------------------------------------------------------------

/** Wind displacement (texels, +x) of a pixel at relative height f (0 root .. 1 tip) for frame 0/1/2. */
export function windShift(frame, f) {
  if (frame === 0) return 0;
  if (frame === 1) return f > 0.62 ? 1 : 0;
  return f > 0.8 ? 2 : f > 0.42 ? 1 : 0;
}

// A tuft is a comb: a solid 1-3 row root clump `w` px wide with a 1-px blade rising from most columns.
// Blades are tallest near the middle, lean outward with 1-px kinks every 3-4 rows. [measured crop_final:
// blades 1 px, spikes 2-8 px tall, tips 1-3 px apart]
function grassTuft(rand, size, scale = 1) {
  const hMax = Math.min(CELL - 1, Math.round([5, 7, 10][size] * scale));
  const w = [4, 5, 6][size] + (rand() < 0.5 ? 1 : 0);
  const x0 = -Math.floor(w / 2);
  const strokes = [];
  let last = -9;
  for (let c = 0; c < w; c++) {
    const bx = x0 + c;
    const centre = 1 - Math.abs((c - (w - 1) / 2) / (w / 2));       // 1 middle .. ~0 edges
    if (c - last < 2 && rand() < 0.3) continue;                     // gaps between blades
    last = c;
    const h = Math.max(2, Math.round(hMax * (0.35 + 0.45 * centre + 0.3 * rand())));
    let lean = bx < 0 ? -1 : bx > 0 ? 1 : 0;
    if (rand() < 0.35) lean = 0; else if (!lean) lean = rand() < 0.5 ? -1 : 1;
    const every = 3 + Math.floor(rand() * 2);
    let x = bx;
    const pts = [];
    for (let y = 0; y < h; y++) {
      if (y > 1 && y % every === 0 && lean && Math.abs(x + lean) <= 5) x += lean;
      pts.push([x, y, 0]);
    }
    strokes.push({ h, pts });
  }
  // solid root clump, so the fringe reads as a comb and not as loose hairs
  const root = { h: 99, pts: [] };
  const rootH = size === 0 ? 1 : 2;
  for (let x = x0; x < x0 + w; x++) for (let y = 0; y < rootH + (x > x0 && x < x0 + w - 1 ? 1 : 0); y++) root.pts.push([x, y, 0]);
  strokes.push(root);
  return strokes;
}

/** Build the RGBA8 DataTexture atlas. Returns {texture, grid:[cols, rows], grassCols:[...], flowerCols:[...]} */
export function buildAtlas({ variants = 12, seed = 7, flowers = true, scale = 1 } = {}) {
  const rand = rng(seed * 7919 + 13);
  const sprites = [], grassCols = [[], [], []];
  for (let v = 0; v < variants; v++) {
    const size = v % 3;
    grassCols[size].push(sprites.length);
    sprites.push(grassTuft(rand, size, scale));
  }
  const flowerCols = [];
  if (flowers) for (const s of flowerSprites(seed)) { flowerCols.push(sprites.length); sprites.push(s); }
  const cols = sprites.length, W = cols * CELL, H = FRAMES * CELL;
  const data = new Uint8Array(W * H * 4);
  sprites.forEach((strokes, c) => {
    for (let fr = 0; fr < FRAMES; fr++) {
      for (const s of strokes) {
        for (const [x, y, kind] of s.pts) {
          const f = kind ? 1 : Math.min(1, (y + 1) / Math.max(1, s.h));
          const px = CELL / 2 + x + windShift(fr, s.h >= 99 ? 0 : f) - 1, py = y;
          if (px < 0 || px >= CELL || py < 0 || py >= CELL) continue;
          const i = ((fr * CELL + py) * W + c * CELL + px) * 4;
          if (kind === 0 && data[i + 3] && data[i] === 0) continue; // blossoms win over blades
          data[i] = kind ? 0 : 255; data[i + 1] = kind === 2 ? 128 : 255; data[i + 2] = 255; data[i + 3] = 255;
        }
      }
    }
  });
  const texture = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return { texture, grid: [cols, FRAMES], grassCols, flowerCols };
}

// ---------------------------------------------------------------------------------------------

function groundTones(terrain, override) {
  if (override) return override;
  if (typeof terrain.tonesAt === 'function') return (x, z) => terrain.tonesAt(x, z);
  const t = terrain.mesh?.material?.userData?.toon;
  const H = t?.uMatHi?.value ?? DEFAULT_HI, S = t?.uMatSh?.value ?? DEFAULT_SH;
  return (x, z) => {
    const mid = terrain.colorAt(x, z);
    return { mid, hi: mid.clone().multiply(H), sh: mid.clone().multiply(S) };
  };
}

/** World AABB {x0,z0,x1,z1} of the ground the camera currently sees (set the camera first), plus margin m. */
export function viewArea(engine, margin = 2.5) {
  const c = engine.camera, vh = c.viewHeight, aspect = (engine.lowW || 640) / (engine.lowH || 360);
  const a = (vh * aspect) / 2 + margin, d = vh / Math.max(Math.sin(c.pitch), 0.2) / 2 + margin;
  const R = [Math.cos(c.yaw), -Math.sin(c.yaw)], F = [-Math.sin(c.yaw), -Math.cos(c.yaw)];
  const hx = Math.abs(R[0]) * a + Math.abs(F[0]) * d, hz = Math.abs(R[1]) * a + Math.abs(F[1]) * d;
  const t = c.target;
  return { x0: t.x - hx, z0: t.z - hz, x1: t.x + hx, z1: t.z + hz };
}

export function createGrass(engine, terrain, opts = {}) {
  const half = terrain.size / 2 - 1;
  let { area = { x0: -half, z0: -half, x1: half, z1: half } } = opts;
  const {
    r = 0.15, maxCount = 80000, seed = 1,
    mask = null, avoid = [], accent = 0.03, heights = [0.30, 0.45, 0.25], scale = 1,
    wind = {}, flowers = true, only = null, tones = null, renderOrder = -10, depthBias = 0.05,
  } = opts;
  const W = { fps: 3.5, dir: [1, 0.35], wave: 0.55, speed: 2.6, strength: 1, ...wind };
  if (area === 'view' || area?.view) area = viewArea(engine, area?.margin ?? 2.5);
  const [cx, cz] = terrain.center ?? [0, 0];
  area = { x0: Math.max(area.x0, cx - half), z0: Math.max(area.z0, cz - half), x1: Math.min(area.x1, cx + half), z1: Math.min(area.z1, cz + half) };
  const atlas = buildAtlas({ seed, flowers: !!flowers, scale });
  const tonesAt = groundTones(terrain, tones);

  // --- placement (blue noise, global, then filtered) ---
  const aw = area.x1 - area.x0, ah = area.z1 - area.z0;
  // Bridson yields ~0.76 / r² points per m²; raise r so the area never exceeds maxCount.
  const rCap = Math.sqrt((aw * ah * 0.76) / (maxCount * 0.97));
  const rr = Math.max(r, rCap);
  if (rr > r * 1.15) console.warn(`createGrass: area ${aw.toFixed(0)}×${ah.toFixed(0)} m needs r=${rr.toFixed(3)} to stay under maxCount; pass area:'view' (after camera.set) for full density`);
  const accept = (x, z) => {
    if (!terrain.isGrass(x, z)) return false;
    for (const a of avoid) if ((x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r) return false;
    return mask ? mask(x, z) : true;
  };
  const pts = poissonDisk2D({ x0: area.x0, z0: area.z0, w: aw, h: ah, r: rr, seed: seed * 31 + 5, accept, max: maxCount });

  const flowerSel = flowers ? pickFlowers(pts, typeof flowers === 'object' ? flowers : {}, seed) : null;
  const rand = rng(seed * 104729 + 3);
  const hCum = [heights[0], heights[0] + heights[1]];
  const inst = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const tint = flowerSel ? flowerSel[i] : null;
    const u = rand(), v = rand(), w = rand(), ph = rand();
    if (only === 'flowers' && !tint) continue;
    let col, acc = 0;
    if (tint) {
      col = atlas.flowerCols[Math.floor(u * atlas.flowerCols.length)];
    } else {
      const size = v < hCum[0] ? 0 : v < hCum[1] ? 1 : 2;
      const list = atlas.grassCols[size];
      col = list[Math.floor(u * list.length)];
      acc = w < accent ? 1 : 0;
    }
    inst.push({ x, z, y: terrain.heightAt(x, z), col, acc, ph, tint });
  }

  // --- geometry ---
  const n = inst.length;
  const quad = new THREE.PlaneGeometry(CELL, CELL).translate(0, CELL / 2, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('normal', quad.attributes.normal);
  geo.setAttribute('uv', quad.attributes.uv);
  const A = {
    aBase: new Float32Array(n * 3), aBaseN: new Float32Array(n * 3), color: new Float32Array(n * 3),
    toneHi: new Float32Array(n * 3), toneSh: new Float32Array(n * 3), aVar: new Float32Array(n * 3),
    aFlower: new Float32Array(n * 3),
  };
  for (const [k, arr] of Object.entries(A)) geo.setAttribute(k, new THREE.InstancedBufferAttribute(arr, 3));
  geo.instanceCount = n;

  const fill = () => {
    for (let i = 0; i < n; i++) {
      const p = inst[i], o = i * 3;
      A.aBase[o] = p.x; A.aBase[o + 1] = p.y; A.aBase[o + 2] = p.z;
      p.N ??= terrain.normalAt(p.x, p.z);
      A.aBaseN[o] = p.N.x; A.aBaseN[o + 1] = p.N.y; A.aBaseN[o + 2] = p.N.z;
      p.T ??= tonesAt(p.x, p.z);
      A.color[o] = p.T.mid.r; A.color[o + 1] = p.T.mid.g; A.color[o + 2] = p.T.mid.b;
      A.toneHi[o] = p.T.hi.r; A.toneHi[o + 1] = p.T.hi.g; A.toneHi[o + 2] = p.T.hi.b;
      A.toneSh[o] = p.T.sh.r; A.toneSh[o + 1] = p.T.sh.g; A.toneSh[o + 2] = p.T.sh.b;
      A.aVar[o] = p.col; A.aVar[o + 1] = p.ph; A.aVar[o + 2] = p.acc;
      if (p.tint) { A.aFlower[o] = p.tint.r; A.aFlower[o + 1] = p.tint.g; A.aFlower[o + 2] = p.tint.b; }
      else { A.aFlower[o] = A.aFlower[o + 1] = A.aFlower[o + 2] = 0; }
    }
    for (const k of Object.keys(A)) geo.attributes[k].needsUpdate = true;
  };

  // far -> near along the camera's view direction (painter's order for upward sprites)
  let sortedFor = null;
  const sort = () => {
    const c = engine.camera, key = `${c.yaw.toFixed(4)}:${c.pitch.toFixed(4)}`;
    if (key === sortedFor) return false;
    sortedFor = key;
    const fx = -Math.cos(c.pitch) * Math.sin(c.yaw), fy = -Math.sin(c.pitch), fz = -Math.cos(c.pitch) * Math.cos(c.yaw);
    for (const p of inst) p.d = p.x * fx + p.y * fy + p.z * fz;
    inst.sort((a, b) => b.d - a.d);
    fill();
    return true;
  };
  sort();

  // --- material ---
  const wd = new THREE.Vector2(W.dir[0], W.dir[1]).normalize();
  const uniforms = {
    tGrassAtlas: { value: atlas.texture },
    uAtlasGrid: { value: new THREE.Vector2(...atlas.grid) },
    uWind: { value: new THREE.Vector4(W.fps, W.wave, W.speed, W.strength) },
    uWindDir: { value: wd },
    uGrassBias: { value: depthBias },
    uFlowerBump: { value: flowers && typeof flowers === 'object' && flowers.bump === false ? 0 : 1 },
    uGrassDebug: { value: opts.debug ? 1 : 0 },   // 1 = random flat colour per tuft (coverage check)
  };
  const material = toonMaterial(engine, {
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.NoBlending, alphaTest: 0.5,
    outline: 'none', toneAttributes: true, uniforms,
    lightPos: 'aBase',
    cutMod: 'aVar.z',
    vertexHead: /* glsl */`
      attribute vec3 aBase, aBaseN, aVar, aFlower;
      uniform vec2 uAtlasGrid; uniform vec4 uWind; uniform vec2 uWindDir; uniform float uGrassBias;
      varying vec2 vGUv; varying vec3 vFlower; varying vec3 vGDbg;
      ${NOISE_GLSL}`,
    objectNormal: 'objectNormal = aBaseN;',
    vertex: /* glsl */`
      {
        // stepped wind: a travelling wave (gusts roll across the field) broken up by world noise
        float tq = floor(uTime * uWind.x) / uWind.x;
        float wv = dot(aBase.xz, uWindDir) * uWind.y - tq * uWind.z + (vnoise(aBase.xz * 0.45) - 0.5) * 2.2 + aVar.y * 0.7;
        float s = 0.5 + 0.5 * sin(wv);
        float gust = vnoise(aBase.xz * 0.07 - uWindDir * tq * 0.35);
        float amp = uWind.w * (0.55 + 0.9 * gust);
        float frame = clamp(floor(s * amp * 2.4), 0.0, 2.0);
        // frames bend toward +x on screen; mirror the sprite if the wind blows screen-left
        float wsx = (viewMatrix * vec4(uWindDir.x, 0.0, uWindDir.y, 0.0)).x;
        vec2 u = uv;
        if (wsx < 0.0) u.x = 1.0 - u.x;
        vGUv = (u + vec2(aVar.x, frame)) / uAtlasGrid;
        vFlower = aFlower;
        vGDbg = vec3(hash12(aBase.xz * 997.0), hash12(aBase.zx * 991.0 + 3.0), hash12(aBase.xz * 983.0 + 7.0));
      }`,
    viewVertex: /* glsl */`
      {
        float lift = max(aVar.z, step(1e-4, dot(aFlower, vec3(1.0))));
        vec4 b = viewMatrix * vec4(aBase, 1.0);
        b.xy = floor(b.xy / uTexelWorld + 0.5) * uTexelWorld;   // root on a texel corner (camera is texel-snapped)
        b.z += uGrassBias + lift * 0.12;                         // never z-fight the ground; accents in front
        mvPosition = b + vec4(position.xy * uTexelWorld, 0.0, 0.0); // 1 sprite texel = 1 screen texel
      }`,
    fragmentHead: /* glsl */`
      uniform sampler2D tGrassAtlas; uniform float uFlowerBump; uniform float uGrassDebug; varying vec3 vGDbg;
      varying vec2 vGUv; varying vec3 vFlower;
      ${FLOWER_LIGHT_GLSL}`,
    albedo: /* glsl */`
      vec4 gA = texture2D(tGrassAtlas, vGUv);
      if (gA.a < 0.5) discard;`,
    tones: /* glsl */`
      bool gIsFlower = dot(vFlower, vec3(1.0)) > 0.0;
      if (gA.r < 0.5 && gIsFlower) {
        vec3 tint = gA.g > 0.75 ? vFlower : min(vFlower * 1.22 + 0.03, vec3(1.0));   // highlight pixel
        vec3 fh = tint, fm = tint * 0.85, fs = tint * vec3(0.50, 0.52, 0.78);
        if (uFlowerBump > 0.5) { toonHi = fh; toonMid = fh; toonSh = fm; }   // "bumped a cut"
        else { toonHi = fh; toonMid = fm; toonSh = fs; }
        // lilac stays lilac under a warm sun (flowers.js FLOWER_LIGHT_GLSL)
        toonHi = flowerTone(toonHi, vFlower, uRampHi, true);
        toonMid = flowerTone(toonMid, vFlower, uRampMid, false);
      }
      // accent tufts ("bumped a cut") only pop where the ground under them is sunlit: inside a cast / canopy /
      // cloud shadow the bump would lift them to the mid tone and speckle a uniform shadow band with decals,
      // so they drop out there (an unbumped tuft is invisible inside the band anyway). Lit tufts at the
      // shadow edge still fringe into it.
      if (vToonCut > 0.5 && !gIsFlower) {
        float gRoot = cloudAtten(vToonLightPos);   // cast (shadow map) x cloud light at the root = the ground's
        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
          if (receiveShadow) {
            DirectionalLightShadow gds = directionalLightShadows[0];
            gRoot *= getShadow(directionalShadowMap[0], gds.shadowMapSize, gds.shadowIntensity, gds.shadowBias, gds.shadowRadius, vDirectionalShadowCoord[0]);
          }
        #endif
        if (gRoot < uBandThr.x) discard;
      }
      if (uGrassDebug > 0.5) { toonHi = toonMid = toonSh = vGDbg; }`,
  });
  // lighting-normal noise must be the ground's: share the terrain's uniform object by reference
  const tToon = terrain.mesh?.material?.userData?.toon;
  if (tToon?.uNormalNoise) material.userData.toon.uNormalNoise = tToon.uNormalNoise;
  else if (opts.normalNoise !== undefined) material.userData.toon.uNormalNoise.value = opts.normalNoise;

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = only === 'flowers' ? 'flowers' : 'grass';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = renderOrder;
  engine.scene.add(mesh);

  const update = () => sort();
  engine.onUpdate(() => update());
  return { mesh, meshes: [mesh], count: n, material, uniforms, atlas, update, radius: rr };
}
