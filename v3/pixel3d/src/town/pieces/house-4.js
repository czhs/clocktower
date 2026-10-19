// house-4 "Mossbank Cottage" (owner: house-4 agent). Contract: docs/TOWN.md §4 (piece API), §6 (scale rules).
// USER NOTE (layout): this corner cottage will be rotated ~45° by the lead so its front/door points diagonally in toward
// the square (docs/TOWN.md §11). Build in your normal local frame; make the 45° view (iso-y045) read as the front.
// USER NOTE (from the user, via the main session - keep this note and act on it): "Mossbank Cottage should have
// REAL foliage on it." The turf roof must not be smooth green rings with dots: grow actual vegetation on it in
// the research foliage style - sprite grass tufts / moss clumps, ferns, little leaf-clump bushes, trailing ivy
// and creepers down the walls, flowers - using src/world/{grass,flowers,trees}.js techniques (sprite policy in
// PIPELINE.md: alphaTest, NoBlending, FLAG_NONE, renderOrder >= 0) with gentle deterministic wind. Target look:
// shots/gallery/{pond-morning,glade-golden}.png. The cottage should read as overgrown and alive.
//
// DESIGN NOTE
// Identity (v1 pipgws packages/assets/scripts/houses/house-4.ts): a LOW drystone blackhouse of rounded fieldstones
// under a deep HIPPED TURF ROOF - one continuous lumpy grass mound with a ragged ridge, hip ends lit left and
// shadowed right - with long grass, wildflowers, toadstools and a rowan sapling growing on it, an eyebrow window
// peeping out of the turf, a stubby fieldstone chimney, a turf-retaining log with round ends along the eave.
// Below: a round-topped poppy-red door with a wreath (hinge right) and a wall lantern on its left, two small windows
// with pairs of green shutters, timber lintels and flower boxes, sunflowers at the left corner, a raised bed of
// cabbages, two straw skeps on a bench; ivy climbing the corners; a woodpile and a water butt at the back.
// Signature at 640x360: a shaggy green LOAF (the only grass roof in the ring: house-3 next door is a sharp plum
// gable, house-5 a teal jerkinhead) over a short grey band of knobbly stone, a red arch in the middle.
// Roof = ONE closed height-field shell h(x, z) (superellipse hip metric, pillow profile, low-frequency lumps, a
// lumpy ridge): the same function seeds a createGrass() sprite field (a fake "terrain" whose height is the roof),
// so real wind-stepped grass tufts + flower clusters stand on the turf, fringe every band edge and rag the ridge.
// Moss clumps, ivy (jittered columns of small clumps sunk into the wall corners) and the rowan crown are createTree()
// leaf-sprite bushes merged into ONE core mesh + ONE leaf mesh (7 draw calls for the whole cottage).
// Verifier round (foliage): feathered fern rosettes (outline-free, darker/saturated FERN ramps) along the front/east eave
// and hip bases + at the wall foot; an ivy fan + trailing strands over the east wall (camera-facing after the -45 deg
// turn); a climbing rose (leaf clumps with red/white bloom sprites) beside and over the door; moss cushions along the
// wall base; denser, windier turf grass over a moss-mottled shell.
// Layout: footprint x 37..42, z 9..13 (south-facing, door tile 39,13 = the lane row). The front wall is inset
// 0.55 m so the garden (bed, bench + skeps, doorstep) stands INSIDE the footprint and nothing touches the lane;
// sunflowers stand in the grass apron at x 36.6 (grass tile, not a lane). Chimney on the RIGHT (layout style;
// v1 drew it left, so the whole roof composition - chimney / sapling / eyebrow / toadstools - is mirrored).
// Palette rows (docs/TOWN.md §3): moss (turf) + mossTuft (tuft patches, moss clumps) | stone (fieldstone walls,
// chimney) + ashlar (door voussoirs, sills, step) | timber (lintels, bench, bed) + trunk (eave log, sapling, wood)
// + plank (water butt) + dial (end grain) | thatch (skeps) | cream (window frames) | brick (chimney pot) |
// paintRamp(v1 '#8a2e22') door, paintRamp(v1 '#3e5a32') shutters | leaf (cabbages, wreath, sunflower leaves,
// rowan, ivy) | accents flowerYellow / flowerWhite / flowerViolet / flowerRed / toadstool / ivory / berry /
// pumpkin | iron (lantern, hinges, hoops) | glass/glow (windows).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as kit from '../kit.js';
import { paintRamp, TOWN_PALETTE as PAL } from '../palette.js';
import { toWorld } from '../api.js';
import { rng, noise2 } from '../../core/noise.js';
import { createGrass } from '../../world/grass.js';
import { createTree } from '../../world/trees.js';

const { Builder, M, window_, flowerBox, lantern } = kit;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- dimensions (local metres, origin = footprint centre)
const WX = 2.3;              // wall half width (footprint half 2.5)
const ZF = 1.45;             // front wall face (footprint front = 2.0: 0.55 m garden strip inside the lot)
const ZB = -1.85;            // back wall face
const WALL_H = 2.55;         // low blackhouse walls (eave band 2.4-3.0)
const T_WALL = 0.36;
const DOOR = { w: 0.94, h: 2.0, spring: 1.6 };   // arched: semi-ellipse rx = w/2, ry = h - spring
// turf roof: hip metric s(x, z) = superellipse of (|x| beyond the ridge half-length, |z - cz|); 0 ridge .. 1 eave
const ROOF = { cz: -0.2, A: 2.73, D: 2.11, L: 1.37, YE: 2.71, H: 1.66, P: 1.55, SQ: 3 };
const SOD = 0.16;            // soil band under the turf edge (dark peat: separates the turf from walls and forest)
// critic round (overview/iso): the turf melted into the forest edge and the walls were barely visible -> a darker
// soil band + a course of pale rounded stones under the turf edge (its own outline = the 1-texel shadow line), and
// drystone walls one ramp step lighter than the town 'stone' row.
const PEAT = ['#76604F', '#56443F', '#3A3240'];          // turf-edge soil (warm dark brown, cool slate shadow)
const WALLSTONE = ['#C8C0C6', '#A59CA8', '#686476'];     // stone row lifted one step (hi above stone hi, mid ~ between)
const RIMSTONE = ['#D2CAC6', '#ADA4AC', '#6E6A7A'];      // the eave-lip course: palest stone, reads as a crisp rim

// ---------------------------------------------------------------- small geometry helpers
/** Push a triangle with its winding fixed so the face normal points along `hint`. */
function tri(b, a, c, d, hint, opts) {
  const n = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(d, a));
  if (n.lengthSq() < 1e-12) return;
  if (n.dot(hint) < 0) [c, d] = [d, c];
  b.tris([a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z], opts);
}
function quad(b, p0, p1, p2, p3, hint, opts) { tri(b, p0, p1, p2, hint, opts); tri(b, p0, p2, p3, hint, opts); }

/** An octagonal "pebble" (rounded fieldstone face) lying with its axis along z: rx, ry radii, depth dz. */
function pebble(b, x, y, z, rx, ry, dz, opts) {
  const g = new THREE.CylinderGeometry(1, 1, dz, 8, 1);
  const m = new THREE.Matrix4().makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeScale(rx, ry, 1))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 8));
  b.add(g, m, opts);
  g.dispose();
}
/** Disc (8-gon) facing +z after the given matrix: radius, depth. */
function disc(b, m, rad, depth, opts) {
  const g = new THREE.CylinderGeometry(rad, rad, depth, 8, 1);
  b.add(g, m.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 8)), opts);
  g.dispose();
}
function blob(b, at, s, opts, scale = [1, 1, 1]) {
  const g = new THREE.OctahedronGeometry(s, 0);
  b.add(g, M({ at, ry: Math.PI / 4, s: scale }), opts);
  g.dispose();
}
/** A horizontal 8-gon log of radius rad from x0 to x1 at (y, z), along x. */
function logX(b, x0, x1, y, z, rad, opts) {
  const g = new THREE.CylinderGeometry(rad, rad, x1 - x0, 8, 1);
  b.add(g, M({ at: [(x0 + x1) / 2, y, z], rz: Math.PI / 2 }).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 8)), opts);
  g.dispose();
}

// ---------------------------------------------------------------- the turf roof as a height field
const ridgeHalf = ROOF.A - ROOF.L;
function metric(x, z) {
  const qx = Math.max(0, Math.abs(x) - ROOF.L) / ridgeHalf, qz = Math.abs(z - ROOF.cz) / ROOF.D;
  return Math.pow(qx ** ROOF.SQ + qz ** ROOF.SQ, 1 / ROOF.SQ);
}
/** Roof surface height at local (x, z): pillow profile + broad lumps + a lumpy ridge (pure function, seeded). */
function makeHeight(seed) {
  return (x, z) => {
    const s = Math.min(1, metric(x, z));
    const base = ROOF.YE + ROOF.H * (1 - Math.pow(s, ROOF.P));
    const lump = (noise2(x * 0.95 + 3.3, z * 0.95 + 7.1, seed) - 0.5) * 2 * 0.075 * (1 - 0.55 * s);
    const rdg = (noise2(x * 2.1 + 1.7, 5.3, seed + 1) - 0.5) * 2 * 0.1 * Math.max(0, 1 - s / 0.32);
    return base + lump + rdg;
  };
}
/** Superellipse ring of the hip metric at s: [{x, z, ox, oz}] (ox, oz = outward plan direction). Fixed count. */
const NF = 14, NC = 10, NS = 11;
function ring(s) {
  const out = [], { L, cz, D, SQ } = ROOF, e = 2 / SQ;
  const sp = (v) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (let i = 0; i <= NF; i++) out.push({ x: -L + (2 * L * i) / NF, z: cz + s * D, ox: 0, oz: 1 });
  for (let j = 1; j < NC; j++) {
    const t = Math.PI / 2 - (Math.PI * j) / NC, c = Math.cos(t), sn = Math.sin(t);
    const n = V3(c / ridgeHalf, 0, sn / D).normalize();
    out.push({ x: L + ridgeHalf * s * sp(c), z: cz + D * s * sp(sn), ox: n.x, oz: n.z });
  }
  for (let i = 0; i <= NF; i++) out.push({ x: L - (2 * L * i) / NF, z: cz - s * D, ox: 0, oz: -1 });
  for (let j = 1; j < NC; j++) {
    const t = -Math.PI / 2 - (Math.PI * j) / NC, c = Math.cos(t), sn = Math.sin(t);
    const n = V3(c / ridgeHalf, 0, sn / D).normalize();
    out.push({ x: -L + ridgeHalf * s * sp(c), z: cz + D * s * sp(sn), ox: n.x, oz: n.z });
  }
  return out;
}

/** Moss-tuft patch mask (local roof coords): shared by the shell tones and the turf grass tones. */
const tuftAt = (x, z) => noise2(x * 1.9 + 9.1, z * 1.9 - 4.2, 41) > 0.52;

function buildRoof(b, hAt) {
  const turf = { tones: 'moss', pattern: 'plaster', scale: 0.55 };
  const nrm = (x, z) => {
    const e = 0.04;
    return V3(-(hAt(x + e, z) - hAt(x - e, z)) / (2 * e), 1, -(hAt(x, z + e) - hAt(x, z - e)) / (2 * e)).normalize();
  };
  const rings = [];
  for (let k = 0; k <= NS; k++) {
    const s = k / NS;
    rings.push(ring(s).map((p) => ({ ...p, v: V3(p.x, hAt(p.x, p.z), p.z) })));
  }
  const N = rings[0].length;
  for (let k = 0; k < NS; k++) {
    const R0 = rings[k], R1 = rings[k + 1];
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      const a = R0[j].v, c = R0[j1].v, d = R1[j1].v, e = R1[j].v;
      const m = a.clone().add(c).add(d).add(e).multiplyScalar(0.25);
      // low-moss mottling: the same patch noise as the turf grass tones (tuftAt), plus a finer 3-level tint, so the base
      // between the tufts reads as cushioned moss, not a flat painted shell
      const tint = [0.96, 1, 1.04][Math.floor(noise2(m.x * 4.3 + 1.1, m.z * 4.3 - 2.7, 57) * 2.999)];
      quad(b, a, c, d, e, nrm(m.x, m.z), tuftAt(m.x, m.z) ? { ...turf, tones: 'mossTuft', tint: tint * 0.97 } : { ...turf, tint });
    }
  }
  // sod edge (a 3-texel dark band under the eave line) + the closed soffit: the roof is ONE closed shell
  const eave = rings[NS];
  const low = eave.map((p) => V3(p.v.x - p.ox * 0.03, p.v.y - SOD, p.v.z - p.oz * 0.03));
  const ctr = V3(0, ROOF.YE - SOD - 0.02, ROOF.cz);
  for (let j = 0; j < N; j++) {
    const j1 = (j + 1) % N, p = eave[j], q = eave[j1];
    const out = V3(p.ox + q.ox, -0.6, p.oz + q.oz);
    quad(b, p.v, q.v, low[j1], low[j], out, { tones: PEAT, pattern: 'none' });
    tri(b, low[j], low[j1], ctr, V3(0, -1, 0), { tones: PEAT, pattern: 'none', tint: 0.94 });
  }
  return { rings, eave, low, nrm };
}

/**
 * Ragged grass fringe hanging from the edge a..c (outward plan normals na, nc): one connected strip whose lower edge
 * is a zig-zag of 1-4 texel teeth (only the jagged bottom gets an outline; no per-tooth outline clutter).
 */
function skirt(b, a, c, na, nc, r, minLen, varLen, tint = 1) {
  const n = Math.max(2, Math.round(a.distanceTo(c) / 0.075));
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const nn = na.clone().lerp(nc, f); nn.y = 0; nn.normalize();
    const p = a.clone().lerp(c, f).addScaledVector(nn, 0.012);
    top.push(p);
    const len = i % 2 ? minLen + r() * varLen : minLen * 0.35;
    bot.push(p.clone().addScaledVector(nn, -0.03 - len * 0.2).add(V3(0, -len, 0)));
  }
  const o = { tones: 'moss', layer: 'soft', tint };
  for (let i = 0; i < n; i++) {
    const out = na.clone().lerp(nc, (i + 0.5) / n); out.y = -0.5;
    quad(b, top[i], top[i + 1], bot[i + 1], bot[i], out, o);
  }
}

// fern ramps: more saturated and darker than the moss turf so a frond separates from the grass at gameplay scale
const FERN = ['#79A848', '#4F8340', '#2E5440'];          // leaflets (lit side bright yellow-green, shade deep green)
const FERN_CORE = ['#4A7A3E', '#335E3A', '#1F3F36'];     // midrib + the heart of the rosette (dark core tone)

/**
 * A fern rosette at p: `n` arching fronds (len 0.35-0.5 m) round a dark heart. Each frond = a dark midrib (FERN_CORE)
 * that rises to a crest and droops to the tip + a broad drooping leaflet pair per segment, longest at the base: the
 * frond edge is a sawtooth with notches between leaflets, ~5-8 texels wide at the gameplay camera (a feathered blade,
 * not a twig). Leaflets droop outward, so the two sides of a frond take different toon bands.
 */
function fern(b, p, len, n, rot, tint = 1, up = V3(0, 1, 0), r = null) {
  // layer 'glass' with no glow = the kit's outline-'none' toon material (FLAG_NONE): on 'soft' (outline 'depth') every
  // frond edge over the turf became a 1-px dark line and the fern read as a dark scribble. Not a shadow caster.
  const core = { tones: FERN_CORE, layer: 'glass', tint };
  // a low dark heart (the crown the fronds spring from)
  const hg = new THREE.OctahedronGeometry(len * 0.17, 0);
  b.add(hg, M({ at: [p.x, p.y + len * 0.04, p.z], ry: rot, s: [1, 0.6, 1] }), core);
  hg.dispose();
  for (let i = 0; i < n; i++) {
    const a = rot + (i * Math.PI * 2) / n + (r ? (r() - 0.5) * 0.5 : 0);
    const L = len * (r ? 0.85 + r() * 0.3 : 1);
    const d = V3(Math.cos(a), 0, Math.sin(a));
    d.addScaledVector(up, -d.dot(up)).normalize();                         // fronds spread perpendicular to `up`
    const side = up.clone().cross(d).normalize();
    // midrib: a quadratic arch through the crest (0.45 L out, 0.5 L up) down to the tip (L out, 0.08 L up)
    const at = (f) => p.clone().addScaledVector(d, L * f).addScaledVector(up, L * (1.6 * f - 1.52 * f * f) * 0.45);
    const S = 6, hw = 0.03;
    for (let k = 0; k < S; k++) {
      const f0 = k / S, f1 = (k + 1) / S, q0 = at(f0), q1 = at(f1), w0 = hw * (1 - f0 * 0.6), w1 = hw * (1 - f1 * 0.6);
      const tan = q1.clone().sub(q0).normalize(), nrm = side.clone().cross(tan).normalize();
      if (nrm.y < 0) nrm.negate();
      quad(b, q0.clone().addScaledVector(side, -w0), q0.clone().addScaledVector(side, w0), q1.clone().addScaledVector(side, w1), q1.clone().addScaledVector(side, -w1), nrm, core);
      // a pair of broad leaflets per segment (none on the first: the stalk): each spans ~75 % of the segment along the
      // rib and sweeps forward + out + down, so the frond's edge is a sawtooth of 2-4 texel teeth with notches between
      if (k === 0) continue;
      const fm = (f0 + f1) / 2, seg = q1.distanceTo(q0), ll = (0.08 + 0.065 * (1 - fm)) * (L / 0.45);
      const o = { tones: FERN, layer: 'glass', tint: tint * (k % 2 ? 1 : 1.05) };
      for (const sd of [-1, 1]) {
        const b0 = q0.clone().addScaledVector(tan, seg * 0.08).addScaledVector(side, sd * w0);
        const b1 = q0.clone().addScaledVector(tan, seg * 0.85).addScaledVector(side, sd * w1);
        const o0 = b0.clone().addScaledVector(side, sd * ll).addScaledVector(tan, ll * 0.42).addScaledVector(up, -ll * 0.3);
        const o1 = b1.clone().addScaledVector(side, sd * ll * 0.62).addScaledVector(tan, ll * 0.5).addScaledVector(up, -ll * 0.24);
        const ln = o0.clone().sub(b0).cross(b1.clone().sub(b0)).normalize();
        if (ln.dot(up) < 0) ln.negate();
        quad(b, b0, b1, o1, o0, ln, o);
      }
    }
  }
}

// ---------------------------------------------------------------- instanced-sprite merging (fewer draw calls)
/**
 * Merge several meshes sharing one sprite material (InstancedBufferGeometry) into one mesh. `parts` =
 * [{mesh, offset?: Vector3}] (offset added to aBase). Re-sorts far -> near when the camera turns
 * (sort key = aBase . forward - k * aVar.w: k 0.1 for tree leaves' raised clumps, 1 for sprite push).
 */
function mergeInstanced(engine, parts, { k = 1, name = 'sprites', renderOrder = 1 } = {}) {
  parts = parts.filter((p) => p.mesh);
  if (!parts.length) return null;
  const g0 = parts[0].mesh.geometry;
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = g0.index;
  for (const a of ['position', 'uv', 'normal']) if (g0.attributes[a]) geo.setAttribute(a, g0.attributes[a]);
  const names = Object.keys(g0.attributes).filter((a) => g0.attributes[a].isInstancedBufferAttribute);
  const N = parts.reduce((s, p) => s + p.mesh.geometry.instanceCount, 0);
  const src = {};
  for (const a of names) {
    const sz = g0.attributes[a].itemSize, arr = new Float32Array(N * sz);
    let o = 0;
    for (const p of parts) {
      const g = p.mesh.geometry, n = g.instanceCount, A = g.attributes[a];
      arr.set(A.array.subarray(0, n * sz), o);
      if (a === 'aBase' && p.offset) for (let i = 0; i < n; i++) { arr[o + i * 3] += p.offset.x; arr[o + i * 3 + 1] += p.offset.y; arr[o + i * 3 + 2] += p.offset.z; }
      o += n * sz;
    }
    src[a] = arr;
    geo.setAttribute(a, new THREE.InstancedBufferAttribute(arr.slice(), sz));
  }
  geo.instanceCount = N;
  let last = '', mesh = null;
  const inv = new THREE.Matrix4(), f = new THREE.Vector3();
  // aBase is in the mesh's LOCAL frame: sort along the camera forward expressed in that frame (matrixWorld), so a
  // piece the composer rotates (house-4 is turned -45 deg) still sorts its leaves far -> near
  const sort = () => {
    const c = engine.camera;
    if (mesh) mesh.updateWorldMatrix(true, false);
    const e = mesh ? mesh.matrixWorld.elements : null;
    const key = `${c.yaw.toFixed(4)},${c.pitch.toFixed(4)}` + (e ? `,${e[0].toFixed(4)},${e[2].toFixed(4)},${e[8].toFixed(4)}` : '');
    if (key === last) return;
    last = key;
    f.set(-Math.cos(c.pitch) * Math.sin(c.yaw), -Math.sin(c.pitch), -Math.cos(c.pitch) * Math.cos(c.yaw));
    if (mesh) f.transformDirection(inv.copy(mesh.matrixWorld).invert());
    const fx = f.x, fy = f.y, fz = f.z;
    const B = src.aBase, W = src.aVar, wsz = geo.attributes.aVar.itemSize;
    const d = new Float32Array(N), idx = Array.from({ length: N }, (_, i) => i);
    for (let i = 0; i < N; i++) d[i] = B[i * 3] * fx + B[i * 3 + 1] * fy + B[i * 3 + 2] * fz - k * W[i * wsz + 3];
    idx.sort((a, b2) => d[b2] - d[a]);
    for (const a of names) {
      const sz = geo.attributes[a].itemSize, dst = geo.attributes[a].array, S = src[a];
      idx.forEach((from, to) => { for (let c2 = 0; c2 < sz; c2++) dst[to * sz + c2] = S[from * sz + c2]; });
      geo.attributes[a].needsUpdate = true;
    }
  };
  sort();
  engine.onUpdate(sort);
  mesh = new THREE.Mesh(geo, parts[0].mesh.material);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.renderOrder = renderOrder; mesh.name = name;
  return mesh;
}

/** Leaf-sprite clumps (createTree bushes / a small round crown) merged into ONE core mesh + ONE leaf mesh. */
function leafClumps(engine, specs, pal) {
  const cores = [], leaves = [];
  let coreMat = null;
  for (const sp of specs) {
    const before = engine._treeSorters ? engine._treeSorters.length : 0;
    const t = createTree(engine, { kind: sp.kind, seed: sp.seed, height: sp.height, radius: sp.radius, add: false, palette: pal, leafJitter: sp.jitter });
    if (engine._treeSorters) engine._treeSorters.length = before;          // the merged mesh sorts itself
    const core = t.getObjectByName('core'), lv = t.getObjectByName('leaves');
    if (sp.retone && lv) {                                                 // per-instance tones (e.g. the rowan in leaf green)
      const g = lv.geometry, n = g.instanceCount;
      for (const [attr, hex] of Object.entries(sp.retone)) {
        const c = new THREE.Color(hex), A = g.attributes[attr];
        for (let i = 0; i < n; i++) A.setXYZ(i, c.r, c.g, c.b);
      }
    }
    if (sp.blooms && lv) {                                                 // flowering creeper: a share of the leaf sprites
      const g = lv.geometry, n = g.instanceCount, rb = rng(sp.seed * 7 + 1);   // become blossom clusters (4 tones each)
      for (let i = 0; i < n; i++) {
        if (rb() >= sp.blooms.frac) continue;
        const hex = sp.blooms.hexes[Math.floor(rb() * sp.blooms.hexes.length)], c = new THREE.Color(hex);
        const set = (attr, k) => g.attributes[attr].setXYZ(i, Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k));
        set('color', 0.85); set('toneHi', 1.0); set('toneSh', 0.62); set('aCore', 0.42); set('aTip', 1.12);
      }
    }
    if (core && !sp.noCore) {
      const g = core.geometry.clone();
      g.translate(sp.at.x, sp.at.y, sp.at.z);
      const lp = g.attributes.aLeafPos;
      for (let i = 0; i < lp.count; i++) lp.setXYZ(i, lp.getX(i) + sp.at.x, lp.getY(i) + sp.at.y, lp.getZ(i) + sp.at.z);
      cores.push(g); coreMat = core.material;
    }
    if (lv) leaves.push({ mesh: lv, offset: sp.at });
  }
  const out = [];
  if (cores.length) {
    const cm = new THREE.Mesh(mergeGeometries(cores.map((g) => (g.index ? g.toNonIndexed() : g))), coreMat);
    cm.castShadow = true; cm.receiveShadow = true; cm.name = 'clump-core';
    out.push(cm);
  }
  const lm = mergeInstanced(engine, leaves, { k: 0.1, name: 'clump-leaves', renderOrder: 1 });
  if (lm) out.push(lm);
  return out;
}

// ---------------------------------------------------------------- build
export default async function build(engine, ctx) {
  const rec = ctx.record, fr = kit.frameOf(rec);
  const r = rng(ctx.seed ^ 0x4d055);
  const b = new Builder(engine, { name: rec.id });
  const shutters = paintRamp('#3e5a32');          // v1 house-4: green shutters
  const doorPaint = paintRamp('#8a2e22');         // v1 house-4: poppy-red round door
  const stone = { tones: WALLSTONE, pattern: 'rubble' };
  const hAt = makeHeight((ctx.seed ^ 0x77) & 0xffff);

  // ---- plinth (split round the door: no flush contact with the doorstep) + fieldstone walls
  const hw = DOOR.w / 2, ry = DOOR.h - DOOR.spring;
  const PZ = ZF + 0.087, PY = 0.207;                        // plinth front face / top
  for (const s of [-1, 1]) {
    const xa = s * (hw + 0.153), xb = s * (WX + 0.093);
    b.hexa([V3(Math.min(xa, xb), -0.09, ZB - 0.093), V3(Math.max(xa, xb), -0.09, ZB - 0.093), V3(Math.min(xa, xb), PY, ZB - 0.093), V3(Math.max(xa, xb), PY, ZB - 0.093),
      V3(Math.min(xa, xb), -0.09, PZ), V3(Math.max(xa, xb), -0.09, PZ), V3(Math.min(xa, xb), PY, PZ), V3(Math.max(xa, xb), PY, PZ)], { tones: WALLSTONE, pattern: 'rubble', tint: 0.94 });
  }
  kit.wallWithOpenings(b, { x0: -WX, x1: WX, y0: 0, y1: WALL_H, z0: ZF, thick: T_WALL, openings: [{ x: 0, y: 0, w: DOOR.w, h: DOOR.h }], ...stone });
  b.box(2 * WX, WALL_H, ZF - ZB - T_WALL, { ...stone, at: [0, 0, (ZF - T_WALL + ZB) / 2] });
  // big rounded corner stones up the front corners (+ a few proud fieldstones on the face)
  for (const sx of [-1, 1]) {
    let y = 0.36, i = 0;
    while (y < WALL_H - 0.3) {
      const ryy = 0.12 + ((i * 5 + (sx > 0 ? 2 : 0)) % 3) * 0.02;
      pebble(b, sx * (WX - 0.147 - (i % 2) * 0.03), y, ZF + 0.02, 0.157 + (i % 2) * 0.03, ryy, 0.12, { tones: WALLSTONE, tint: sx < 0 ? 1.04 : 0.98 });
      y += ryy * 2 + 0.037; i++;
    }
  }
  for (const [px, py, rx, ryy] of [[-1.93, 0.47, 0.15, 0.11], [-0.74, 0.33, 0.15, 0.1], [0.79, 0.57, 0.14, 0.1], [1.95, 2.0, 0.13, 0.09], [-1.12, 2.13, 0.15, 0.1], [1.07, 2.16, 0.14, 0.1]])
    pebble(b, px, py, ZF + 0.01, rx, ryy, 0.08, { tones: WALLSTONE, tint: 1.02 });

  // ---- door: ashlar voussoir arch, jambs, doorstep, spandrels, dark interior
  const arcPt = (a, rx2, ry2) => [Math.cos(a) * rx2, DOOR.spring + Math.sin(a) * ry2];
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const [ax, ay] = arcPt((i / 12) * Math.PI, hw, ry); pts.push([ax, ay]); }
    pts.push([0, DOOR.h + 0.01], [hw, DOOR.h + 0.01]);
    const poly = s > 0 ? pts.reverse() : pts.map(([x, y]) => [-x, y]);
    b.prism(poly, T_WALL - 0.02, { ...stone, at: [0, 0, ZF - T_WALL / 2] });
    b.box(0.15, DOOR.spring - 0.053, 0.1, { tones: 'ashlar', pattern: 'none', tint: s < 0 ? 1.03 : 0.97, at: [s * (hw + 0.075), 0.053, ZF + 0.03] });
  }
  for (let i = 0; i < 7; i++) {
    const a0 = (i / 7) * Math.PI, a1 = ((i + 1) / 7) * Math.PI;
    const [ix0, iy0] = arcPt(a0, hw, ry), [ix1, iy1] = arcPt(a1, hw, ry);
    const [ox0, oy0] = arcPt(a0, hw + 0.15, ry + 0.15), [ox1, oy1] = arcPt(a1, hw + 0.15, ry + 0.15);
    const zf = ZF + 0.08, zb = ZF - 0.02;
    b.hexa([V3(ix0, iy0, zb), V3(ix1, iy1, zb), V3(ox0, oy0, zb), V3(ox1, oy1, zb), V3(ix0, iy0, zf), V3(ix1, iy1, zf), V3(ox0, oy0, zf), V3(ox1, oy1, zf)],
      { tones: 'ashlar', pattern: 'none', tint: i === 3 ? 1.05 : (i % 2 ? 0.97 : 1) });
  }
  b.box(DOOR.w + 0.02, 0.063, T_WALL - 0.04, { tones: 'timber', at: [0, 0.067, ZF - T_WALL / 2 - 0.02] });       // sill board
  b.box(DOOR.w, DOOR.h, 0.02, { tones: '#2A1A20', layer: 'glass', glow: PAL.fireGlow, glowKind: 2, at: [0, 0, ZF - T_WALL + 0.03] });
  b.box(DOOR.w + 0.41, 0.113, 0.33, { tones: 'ashlar', pattern: 'none', at: [0, -0.03, ZF + 0.143] });          // doorstep (inside the lot)

  // ---- windows: PAIRS of narrow green shutters, timber lintels, flower boxes (v1: yellow / white / magenta / orange)
  const windows = [];
  const WW = 0.54, WH = 0.6, WY = 1.43;
  for (const wx of [-1.46, 1.46]) {
    windows.push(window_(b, { at: [wx, WY, ZF], w: WW, h: WH, panes: [2, 2], sillTones: 'ashlar' }));
    for (const s of [-1, 1])
      b.box(0.137, WH + 0.03, 0.04, { tones: shutters, pattern: 'vboards', scale: 0.35, tint: s < 0 ? 1.03 : 0.97, at: [wx + s * (WW / 2 + 0.05 + 0.087), WY - WH / 2 - 0.017, ZF + 0.023] });
    b.box(0.93, 0.11, 0.12, { tones: 'timber', pattern: 'none', at: [wx, WY + WH / 2 + 0.067, ZF + 0.05] });
    flowerBox(b, { at: [wx, WY - WH / 2 - 0.123, ZF + 0.02], w: 0.72, seed: ctx.seed + (wx > 0 ? 3 : 1), colors: [PAL.flowerYellow, PAL.flowerWhite, PAL.flowerViolet, PAL.pumpkin] });
  }
  // a small back window and an east window (turntables / the iso camera)
  for (const [ryy, at, wx] of [[Math.PI, [0, 0, ZB], 0.9], [Math.PI / 2, [WX, 0, (ZF + ZB) / 2], 0.35]]) {
    b.push(M({ at, ry: ryy }));
    windows.push({ ...window_(b, { at: [wx, 1.47, 0], w: 0.48, h: 0.52, panes: [2, 2], sillTones: 'ashlar' }), local: M({ at, ry: ryy }) });
    for (const s of [-1, 1]) b.box(0.127, 0.55, 0.04, { tones: shutters, pattern: 'vboards', scale: 0.35, at: [wx + s * (0.24 + 0.05 + 0.083), 1.47 - 0.277, 0.023] });
    b.box(0.85, 0.11, 0.12, { tones: 'timber', pattern: 'none', at: [wx, 1.79, 0.05] });
    b.pop();
  }
  const lamp = lantern(b, { at: [-0.863, 1.947, ZF] });     // wall lantern left of the door (v1)

  // ---- eave: the turf-retaining log (front + back) with round end grain at both corners
  const LOG_R = 0.153, LOG_Y = 2.477, LOG_X = WX + 0.327;
  for (const lz of [ZF + 0.237, ZB - 0.217]) {
    logX(b, -LOG_X, LOG_X, LOG_Y, lz, LOG_R, { tones: 'trunk', pattern: 'none' });
    for (const s of [-1, 1]) {
      const cap = new THREE.SphereGeometry(LOG_R * 0.99, 8, 4);          // rounded, bark-covered log ends
      b.add(cap, M({ at: [s * LOG_X, LOG_Y, lz], rz: Math.PI / 2, s: [1, 0.42, 1] }).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 8)), { tones: 'trunk', tint: 0.97 });
      cap.dispose();
      b.push(M({ at: [s * (LOG_X + 0.047), LOG_Y, lz], ry: s * Math.PI / 2 }));
      disc(b, new THREE.Matrix4(), LOG_R * 0.6, 0.02, { tones: 'dial', tint: 1.02 });
      disc(b, M({ at: [0, 0, 0.012] }), LOG_R * 0.3, 0.02, { tones: 'dial', tint: 0.9 });
      b.pop();
    }
  }

  // ---- the turf roof: ONE closed shell
  const roof = buildRoof(b, hAt);
  // grass fringe hanging over the eave log: ragged teeth along the camera-facing run of the sod edge
  {
    const E = roof.eave, Lw = roof.low, N = E.length;
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N, p = E[j], q = E[j1];
      if (p.oz + q.oz < 0.25 && !(p.oz + q.oz < -1.6)) continue;            // front + front hips, and the back eave
      skirt(b, p.v, q.v, V3(p.ox, 0, p.oz), V3(q.ox, 0, q.oz), r, 0.03, 0.07, p.oz < 0 ? 0.97 : 1);
    }
    // the eave lip: a course of pale rounded stones under the soil band, all round the eave except where the
    // turf-retaining logs run (front / back straight runs keep the v1 log). Rounded = flattened 8x4 spheres.
    const sg = new THREE.SphereGeometry(1, 8, 4);
    const rs = rng(ctx.seed ^ 0x57e);
    for (let j = 0; j < N; j++) {
      const p = E[j], q = E[(j + 1) % N];
      const ox = (p.ox + q.ox) / 2, oz = (p.oz + q.oz) / 2;
      if (Math.abs(oz) > 0.8 && Math.abs((p.x + q.x) / 2) < LOG_X - 0.1) continue;    // the log carries this run
      const seg = Math.hypot(q.x - p.x, q.z - p.z), n = Math.max(1, Math.round(seg / 0.26));
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n;
        const lx = Lw[j].x + (Lw[(j + 1) % N].x - Lw[j].x) * f, lz = Lw[j].z + (Lw[(j + 1) % N].z - Lw[j].z) * f;
        const rx = 0.135 + rs() * 0.03, ryy = 0.09 + rs() * 0.025;
        const yaw = Math.atan2(ox, oz);
        b.add(sg, M({ at: [lx - ox * 0.03, Lw[j].y - ryy - 0.01, lz - oz * 0.03], ry: yaw, s: [rx, ryy, 0.12] }),
          { tones: RIMSTONE, pattern: 'none', tint: [0.97, 1, 1.03][k % 3] });
      }
    }
    sg.dispose();
  }

  // ---- eyebrow window: the turf lifts over a little round window (front slope, left: mirrored v1)
  const ex = -0.98, rr = 0.21;
  const ez = ROOF.cz + ROOF.D * 0.52, ey = hAt(ex, ez) + rr + 0.03, wz = ez + 0.02;
  {
    disc(b, M({ at: [ex, ey, wz - 0.12] }), rr + 0.075, 0.23, { tones: 'trunk', pattern: 'none' });          // log-lined niche
    disc(b, M({ at: [ex, ey, wz + 0.005] }), rr, 0.02, { tones: 'glass', layer: 'glass', glow: PAL.glow[1], glowKind: 1 });
    b.box(0.047, 2 * rr - 0.03, 0.03, { tones: 'cream', at: [ex, ey - rr + 0.015, wz + 0.022] });
    b.box(2 * rr - 0.03, 0.047, 0.03, { tones: 'cream', at: [ex, ey - 0.023, wz + 0.022] });
    // the eyebrow: an arched turf lip over the window that slopes back INTO the roof (a wedge per arch segment: front
    // arc standing proud, back arc tucked just under the turf surface) - nothing sticks out of the roof behind it
    const zb = wz - 0.43;
    const arc = (a, rx2, ry2, dy, z) => V3(ex + Math.cos(a) * rx2, ey + Math.sin(a) * ry2 + dy, z);
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI, a1 = ((i + 1) / 8) * Math.PI, c = [];
      for (let k = 0; k < 8; k++) {
        const a = k & 1 ? a1 : a0, outer = k & 2, front = k & 4;
        const sa = 1 - Math.sin(a);                      // legs reach down into the turf beside the window
        const fo = arc(a, rr + 0.37, rr + 0.24, -0.05 - sa * (rr + 0.06), wz + 0.03), fi = arc(a, rr + 0.087, rr + 0.077, -sa * (rr + 0.02), wz + 0.03);
        const p = outer ? fo : fi;
        c.push(front ? p : V3(p.x, Math.min(p.y, hAt(p.x, zb) - (outer ? 0.03 : 0.08)), zb));
      }
      b.hexa(c, { tones: 'moss', pattern: 'plaster', scale: 0.55, tint: 1.03 });
    }
    windows.push({ center: V3(ex, ey, wz), glowPos: V3(ex, ey, wz + 0.3) });
  }

  // ---- stubby fieldstone chimney (right, behind the crest): uneven courses, overhanging cap slab, clay pot
  const chimX = 0.95, chimZ = -0.78;
  let chimTop;
  {
    let y = 3.5;
    const courses = [[0.33, 0.31, 0.42], [0.305, 0.29, 0.36], [0.322, 0.3, 0.39], [0.296, 0.281, 0.34]];
    courses.forEach(([hx, hz, h], i) => {
      const t = 0.012;                                         // slight taper per course (no exactly edge-on sides)
      b.hexa([V3(chimX - hx, y, chimZ - hz), V3(chimX + hx, y, chimZ - hz), V3(chimX - hx + t, y + h, chimZ - hz + t), V3(chimX + hx - t, y + h, chimZ - hz + t),
        V3(chimX - hx, y, chimZ + hz), V3(chimX + hx, y, chimZ + hz), V3(chimX - hx + t, y + h, chimZ + hz - t), V3(chimX + hx - t, y + h, chimZ + hz - t)],
      { tones: 'stone', pattern: 'rubble', scale: 0.7, tint: [1, 0.96, 1.03, 0.98][i] });
      y += h;
    });
    b.box(0.79, 0.107, 0.73, { tones: 'iron', pattern: 'none', tint: 1.05, at: [chimX, y, chimZ] });       // dark slate cap slab
    b.cylinder(0.117, 0.097, 0.247, { segments: 8, tones: 'brick', at: [chimX + 0.087, y + 0.107, chimZ] });  // clay pot
    b.cylinder(0.137, 0.137, 0.05, { segments: 8, tones: 'brick', tint: 1.04, at: [chimX + 0.087, y + 0.33, chimZ] });
    chimTop = y + 0.38;
    // a cushion of moss where the stack leaves the turf
    for (const [dx, dz] of [[-0.37, 0.27], [0.36, 0.3], [0.02, 0.4]]) {
      const x = chimX + dx, z = chimZ + dz;
      b.box(0.27, 0.12, 0.17, { tones: 'mossTuft', layer: 'soft', at: [x, hAt(x, z) - 0.05, z] });
    }
  }
  const smoke = V3(chimX + 0.087, chimTop, chimZ);

  // ---- toadstools on the turf (right side + one left)
  for (const [x, s, big] of [[1.77, 0.6, true], [1.37, 0.72, false], [-1.95, 0.55, false]]) {
    const z = ROOF.cz + ROOF.D * s * 0.93, y = hAt(x, z);
    const sh = big ? 0.17 : 0.13, cr = big ? 0.16 : 0.12;
    b.cylinder(0.04, 0.04, sh, { at: [x, y - 0.03, z], tones: PAL.ivory, segments: 4 });
    b.cylinder(cr, 0.045, cr * 0.8, { at: [x, y + sh - 0.05, z], tones: [PAL.toadstool, PAL.toadstool, '#7A3040'], segments: 8 });
    b.box(0.05, 0.037, 0.03, { tones: PAL.ivory, at: [x - cr * 0.35, y + sh + cr * 0.25 - 0.05, z + cr * 0.55] });
  }
  const fernClear = [];
  // ferns (verifier round: the old 0.07 m x 0.25 m blades read as pale twigs): big feathered rosettes clustered at the hip
  // bases and along the eave on the FRONT and EAST edges - local +x / +z is what the gameplay camera sees once the
  // composer turns the cottage -45 deg - plus a few at the wall foot. Plan points on the hip metric ring s.
  {
    const rf = rng(ctx.seed ^ 0xfe12);
    const e = 2 / ROOF.SQ, sp = (v) => Math.sign(v) * Math.pow(Math.abs(v), e);
    const capE = (t, sm) => [ROOF.L + ridgeHalf * sm * sp(Math.cos(t)), ROOF.cz + ROOF.D * sm * sp(Math.sin(t))];
    const capW = (t, sm) => [-ROOF.L - ridgeHalf * sm * sp(Math.cos(t)), ROOF.cz + ROOF.D * sm * sp(Math.sin(t))];
    const front = (x, sm) => [x, ROOF.cz + ROOF.D * sm];
    const roofFerns = [
      [front(-0.22, 0.9), 0.44], [front(0.58, 0.88), 0.4], [front(1.22, 0.9), 0.46],
      [capE(1.15, 0.88), 0.48], [capE(0.72, 0.9), 0.42], [capE(0.25, 0.87), 0.46], [capE(-0.3, 0.9), 0.4], [capE(-0.85, 0.86), 0.38],
      [capW(1.05, 0.88), 0.42], [capW(0.35, 0.86), 0.38],
    ];
    for (const [[x, z], len] of roofFerns) {
      fern(b, V3(x, hAt(x, z) - 0.03, z), len, 6, rf() * Math.PI, 1, V3(0, 1, 0), rf);
      fernClear.push({ x, z, r: len * 0.7 });            // the turf grass keeps clear of the fronds (else tufts bury them)
    }
    // wall-foot ferns (front corners + east wall), in the damp shade of the stones
    for (const [x, z, len] of [[-2.2, ZF + 0.22, 0.42], [WX + 0.2, 0.55, 0.44], [WX + 0.22, -0.55, 0.4], [WX + 0.2, -1.45, 0.42], [-0.72, ZF + 0.16, 0.34]])
      fern(b, V3(x, 0.02, z), len, 6, rf() * Math.PI, 0.97, V3(0, 1, 0), rf);
  }
  // moss patches along the wall base (front plinth top + the east wall foot): low cushions, mossTuft
  {
    const rm = rng(ctx.seed ^ 0x3055);
    const cushion = (x, y, z, sx, sz) => blob(b, [x, y, z], 0.1, { tones: 'mossTuft', layer: 'soft', tint: [0.96, 1, 1.03][Math.floor(rm() * 3)] }, [sx, 0.45, sz]);
    for (const x of [-2.12, -1.78, -1.05, 0.72, 1.05, 2.12]) cushion(x + (rm() - 0.5) * 0.1, PY + 0.01, PZ - 0.06, 1.4 + rm() * 0.8, 0.9);
    for (const z of [1.2, 0.8, 0.15, -0.35, -1.0, -1.6]) cushion(WX + 0.1, PY - 0.01, z + (rm() - 0.5) * 0.12, 1.1, 1.6 + rm() * 0.8);
  }

  // ---- rowan sapling stem (crown = leaf-sprite clump below)
  const sapX = -0.37, sapZ = ROOF.cz + 0.07, sapY = hAt(sapX, sapZ);
  b.hexa([V3(sapX - 0.045, sapY - 0.1, sapZ - 0.04), V3(sapX + 0.045, sapY - 0.1, sapZ - 0.04), V3(sapX - 0.037, sapY + 0.52, sapZ - 0.037), V3(sapX + 0.037, sapY + 0.52, sapZ - 0.037),
    V3(sapX - 0.045, sapY - 0.1, sapZ + 0.04), V3(sapX + 0.045, sapY - 0.1, sapZ + 0.04), V3(sapX - 0.037, sapY + 0.52, sapZ + 0.037), V3(sapX + 0.037, sapY + 0.52, sapZ + 0.037)], { tones: 'trunk' });
  // rowan berries: 2-px clusters hanging under the crown, on the camera side
  // (slid 0.45 m toward the camera along the view ray: same screen spot, but in front of the leaf sprites' 0.25 m push)
  for (const [dx, dy, dz] of [[0.17, 0.5, 0.2], [-0.15, 0.56, 0.2], [0.04, 0.45, 0.24]])
    for (const [ox, oy] of [[0, 0], [0.067, -0.033], [-0.033, -0.067]])
      b.box(0.067, 0.067, 0.05, { tones: PAL.berry, layer: 'soft', at: [sapX + dx + ox, sapY + dy + oy + 0.225, sapZ + dz + 0.39] });

  // ---- garden: raised cabbage bed (left of the door), bench + two straw skeps (right), sunflowers (left corner)
  {
    const bx = -1.37, bz = ZF + 0.373;
    b.box(1.05, 0.247, 0.39, { tones: 'timber', pattern: 'boards', at: [bx, -0.02, bz] });
    b.box(0.97, 0.03, 0.31, { tones: 'dirt', tint: 0.9, at: [bx, 0.207, bz] });
    for (const [cx, cs] of [[-0.32, 0.12], [0.0, 0.14], [0.31, 0.11]]) blob(b, [bx + cx, 0.29, bz], cs, { tones: 'leaf', layer: 'soft', tint: 1.03 }, [1, 0.75, 1]);
    for (const cx of [-0.17, 0.16]) b.box(0.067, 0.08, 0.05, { tones: PAL.pumpkin, layer: 'soft', at: [bx + cx, 0.233, bz + 0.12] });  // carrots
  }
  {
    const bx = 1.45, bz = ZF + 0.387;
    b.box(1.2, 0.07, 0.36, { tones: 'timber', pattern: 'none', at: [bx, 0.367, bz] });
    for (const lx of [-0.5, 0.5]) b.box(0.08, 0.387, 0.3, { tones: 'timber', tint: 0.95, at: [bx + lx, -0.02, bz] });
    for (const [sx, s] of [[-0.27, 1], [0.29, 0.9]]) {
      let y = 0.437;
      const rs = [0.22, 0.215, 0.19, 0.15, 0.09].map((v) => v * s);
      rs.forEach((rad, i) => {
        b.cylinder(rad, i === rs.length - 1 ? rad * 0.4 : rad * 0.9, 0.08 * s, { at: [bx + sx, y, bz], tones: 'thatch', segments: 8 });
        y += 0.075 * s;
      });
      b.box(0.08, 0.06, 0.03, { tones: PAL.iron[2], at: [bx + sx, 0.447, bz + 0.19 * s] });                 // the bee door
    }
  }
  // sunflowers: 2-texel stems, solid 2-tone leaf blobs, heads facing the lane
  for (const [fx, fz, h] of [[-2.65, 1.75, 1.85], [-2.25, 1.87, 1.5], [-2.95, 1.2, 1.25]]) {
    b.box(0.077, h, 0.077, { tones: 'leaf', tint: 0.95, at: [fx, 0, fz] });
    for (const [ly, s] of [[h * 0.38, 1], [h * 0.62, -1]]) b.box(0.137, 0.1, 0.07, { tones: 'leaf', tint: 1.03, at: [fx + s * 0.1, ly, fz + 0.01] });
    disc(b, M({ at: [fx, h, fz + 0.04] }), 0.2, 0.04, { tones: PAL.flowerYellow, layer: 'soft' });
    disc(b, M({ at: [fx, h, fz + 0.085] }), 0.1, 0.05, { tones: 'timber', layer: 'soft' });
  }

  // ---- back of the lot: woodpile against the back wall (end grain to the north) + a water butt at the NE corner
  {
    const z0 = ZB - 0.27, len = 0.44;
    let i = 0;
    for (const [n, y] of [[6, 0.097], [5, 0.29], [4, 0.483]]) {
      for (let k = 0; k < n; k++) {
        const x = -1.7 + k * 0.207 + (6 - n) * 0.103;
        const g = new THREE.CylinderGeometry(0.097, 0.097, len, 8, 1);
        b.add(g, M({ at: [x, y, z0], rx: Math.PI / 2 }).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 8)), { tones: 'trunk', tint: [1, 0.96, 1.03][i++ % 3] });
        g.dispose();
        disc(b, M({ at: [x, y, z0 - len / 2 - 0.006], ry: Math.PI }), 0.07, 0.02, { tones: 'dial' });
      }
    }
    const wbx = WX + 0.37, wbz = ZB + 0.33;
    b.cylinder(0.287, 0.287, 0.77, { segments: 8, tones: 'plank', pattern: 'vboards', scale: 0.5, at: [wbx, -0.02, wbz] });
    for (const hy of [0.17, 0.6]) b.cylinder(0.303, 0.303, 0.05, { segments: 8, tones: 'iron', at: [wbx, hy, wbz] });
    b.cylinder(0.247, 0.247, 0.02, { segments: 8, tones: 'slate', tint: 0.8, at: [wbx, 0.737, wbz] });
  }

  // ---- doormat on the door tile (flat, walkable)
  b.box(0.9, 0.02, 0.36, { tones: 'thatch', pattern: 'vboards', scale: 0.4, tint: 0.92, at: [0, 0, 2.22] });

  const group = b.build();

  // ---- the door leaf (own mesh, ONE layer, swings inward; hinge right as in v1) with its wreath
  const db = new Builder(engine, { name: `${rec.id}-door` });
  const s = -1;                                   // hinge right: the leaf extends along -x from the pivot
  const cx = (s * DOOR.w) / 2, th = 0.07;
  const leafPts = [[-hw, 0], [hw, 0], [hw, DOOR.spring]];
  for (let i = 1; i < 12; i++) leafPts.push(arcPt((i / 12) * Math.PI, hw, ry));
  leafPts.push([-hw, DOOR.spring]);
  db.prism(leafPts, th, { tones: doorPaint, pattern: 'vboards', scale: 0.6, at: [cx, 0, 0] });
  for (const hy of [0.4, 1.45]) db.box(DOOR.w * 0.6, 0.05, 0.03, { tones: 'iron', at: [s * DOOR.w * 0.3, hy, th / 2] });
  db.box(0.06, 0.08, 0.04, { tones: 'iron', at: [s * (DOOR.w - 0.14), 0.95, th / 2 + 0.01] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    db.box(0.08, 0.08, 0.05, { tones: 'leaf', tint: i % 2 ? 1 : 1.04, at: [cx + Math.cos(a) * 0.15, 1.5 + Math.sin(a) * 0.15 - 0.04, th / 2 + 0.03] });
  }
  db.box(0.05, 0.05, 0.04, { tones: PAL.berry, at: [cx - 0.1, 1.38, th / 2 + 0.07] });
  db.box(0.05, 0.05, 0.04, { tones: PAL.berry, at: [cx + 0.09, 1.6, th / 2 + 0.07] });
  const leaf = db.build({ name: `${rec.id}-door` });
  const pivot = new THREE.Group(); pivot.name = `${rec.id}-door-pivot`;
  pivot.add(leaf);
  leaf.position.z = -th / 2;
  pivot.position.set(hw, 0.137, ZF - 0.05);
  const open = (f) => { pivot.rotation.y = s * Math.max(0, Math.min(1, f)) * 1.75; };
  group.add(pivot);
  fr.apply(group);
  const O = fr.position;                          // local -> world (south-facing: a pure translation)

  // ---- REAL foliage: sprite grass + wildflowers on the turf (createGrass on the roof height field)
  {
    const moss = kit.toTones('moss'), tuft = kit.toTones('mossTuft');
    const inside = (x, z) => {
      if (metric(x, z) > 0.985) return false;
      if (Math.abs(x - chimX) < 0.47 && Math.abs(z - chimZ) < 0.44) return false;          // chimney
      if (Math.abs(x - ex) < 0.42 && z > ez - 0.32 && z < ez + 0.6) return false;           // eyebrow window
      if (Math.hypot(x - sapX, z - sapZ) < 0.16) return false;
      for (const f of fernClear) if ((x - f.x) ** 2 + (z - f.z) ** 2 < f.r * f.r) return false;
      return true;
    };
    const roofTerrain = {
      size: 40, center: [O.x, O.z],
      isGrass: (x, z) => inside(x - O.x, z - O.z),
      heightAt: (x, z) => hAt(x - O.x, z - O.z),
      normalAt: (x, z) => roof.nrm(x - O.x, z - O.z),
      tonesAt: (x, z) => (tuftAt(x - O.x, z - O.z) ? tuft : moss),
    };
    const grass = createGrass(engine, roofTerrain, {
      area: { x0: O.x - ROOF.A - 0.1, z0: O.z + ROOF.cz - ROOF.D - 0.1, x1: O.x + ROOF.A + 0.1, z1: O.z + ROOF.cz + ROOF.D + 0.1 },
      // verifier round: denser + slightly taller tufts (r 0.1 -> 0.072, ~1.9x) so no flat base shows between them on the
      // camera-facing slope, and wind strength 1.5 so even the low-gust corner of the roof steps through all 3 frames
      // (grass.js amp = strength * (0.55 + 0.9 * gust): at 1 a calm patch never leaves frame 0)
      r: 0.072, seed: 44, accent: 0.2, heights: [0.15, 0.45, 0.4], scale: 1.1, renderOrder: 0, depthBias: 0.04,
      wind: { strength: 1.5 },
      flowers: { fraction: 0.15, seed: 13, patchScale: 1.3, mix: 0.25,
        tints: [{ hex: PAL.flowerYellow, weight: 0.4 }, { hex: PAL.flowerWhite, weight: 0.3 }, { hex: PAL.flowerViolet, weight: 0.3 }] },   // v1 roof: yellow / white / lilac
    });
    // shader uses world aBase; give the sprite mesh a truthful local bounding box (Box3.setFromObject / the turntable
    // auto-fit otherwise sees the template quad's extent: y -6..12 and a 22 m view)
    const tb = new THREE.Box3(V3(-ROOF.A - 0.15, ROOF.YE - 0.3, ROOF.cz - ROOF.D - 0.15), V3(ROOF.A + 0.15, ROOF.YE + ROOF.H + 0.6, ROOF.cz + ROOF.D + 0.15));
    for (const m of grass.meshes) {
      m.removeFromParent(); m.name = `${rec.id}-turf-grass`; group.add(m);
      m.geometry.boundingBox = tb.clone(); m.geometry.boundingSphere = tb.getBoundingSphere(new THREE.Sphere());
    }
  }

  // ---- moss clumps on the hips / eave + the rowan crown: leaf-sprite bushes, merged (2 draw calls)
  {
    const pal = { hi: PAL.mossTuft[0], mid: PAL.mossTuft[1], sh: PAL.mossTuft[2], core: PAL.moss[2], tip: PAL.mossTuft[0] };
    const on = (x, z, sink = 0.07) => V3(x, hAt(x, z) - sink, z);
    const specs = [
      { kind: 'bush', seed: 401, radius: 0.2, at: on(-2.3, -0.15), noCore: true },
      { kind: 'bush', seed: 402, radius: 0.17, at: on(-1.98, 0.98), noCore: true },
      { kind: 'bush', seed: 403, radius: 0.19, at: on(2.27, 0.28), noCore: true },
      { kind: 'bush', seed: 404, radius: 0.16, at: on(2.0, -1.05), noCore: true },
      { kind: 'bush', seed: 405, radius: 0.15, at: on(0.62, 1.55), noCore: true },
      { kind: 'bush', seed: 406, radius: 0.17, at: on(-1.25, -1.95), noCore: true },
      { kind: 'bush', seed: 407, radius: 0.15, at: on(1.15, -2.02), noCore: true },
      { kind: 'round', seed: 409, height: 1.02, radius: 0.33, jitter: 0.08, at: V3(sapX, sapY - 0.12, sapZ),
        retone: { color: PAL.leaf[1], toneHi: PAL.leaf[0], toneSh: PAL.leaf[2], aCore: '#24413E', aTip: PAL.mossTuft[0] } },
    ];
    // ivy: a jittered column of small leaf clumps sunk into the wall at three corners + the east wall, climbing from
    // the foot of the wall and spilling over the eave log (one mass, not a scatter of glyphs)
    const IVY = { color: PAL.leaf[1], toneHi: PAL.leaf[0], toneSh: PAL.leaf[2], aCore: '#24413E', aTip: PAL.leaf[0] };
    const ri = rng(ctx.seed ^ 0x1e7);
    let seed = 500;
    const climb = (frame, y0, y1, w0, w1) => {          // frame(u, y) -> local point on the wall (u = 0 at the corner)
      for (let y = y0; y <= y1; y += 0.19 + ri() * 0.05) {
        const f = (y - y0) / Math.max(0.01, y1 - y0), w = w0 + (w1 - w0) * f;
        const n = 1 + (ri() < 0.55 - f * 0.3 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const rad = 0.105 + ri() * 0.045;
          const p = frame(0.05 + ri() * w, y + (ri() - 0.5) * 0.08);
          specs.push({ kind: 'bush', seed: seed++, radius: rad, jitter: 0.05, at: p.add(V3(0, -rad * 0.55, 0)), retone: IVY, noCore: true });
        }
      }
    };
    climb((u, y) => V3(-WX + u, y, ZF - 0.04), 0.3, 2.62, 0.3, 0.14);            // front, west corner (by the sunflowers)
    climb((u, y) => V3(WX - u, y, ZF - 0.04), 0.62, 2.5, 0.17, 0.1);             // front, east corner (behind the bench)
    climb((u, y) => V3(-WX + u, y, ZB + 0.04), 0.15, 2.55, 0.5, 0.25);           // back, west corner
    climb((u, y) => V3(WX + 0.04, y, ZF - 0.12 - u), 0.12, 2.4, 0.5, 0.25);        // east wall, front corner
    // EAST WALL (faces the gameplay camera after the -45 deg turn; it was bare fieldstone): one spreading ivy fan rooted
    // at the wall foot, fanning out under the east window (window + shutters: z -0.92..-0.18, y 1.19..1.85), then two
    // arms climbing beside it to the eave, and a few strands trailing down from the sod edge
    const east = (z, y) => V3(WX + 0.05, y, z);
    for (let y = 0.12; y <= 1.08; y += 0.15 + ri() * 0.04) {                      // the fan: 0.35 m wide at the root, 2 m at the sill
      const f = (y - 0.12) / 0.96, zc = 0.05 - f * 0.35, hw2 = 0.14 + f * 0.62, n = 1 + Math.round(f * 2.2);
      for (let i = 0; i < n; i++) {
        const rad = 0.11 + ri() * 0.05, z = zc + ((i + 0.5) / n - 0.5) * 2 * hw2 + (ri() - 0.5) * 0.12;
        specs.push({ kind: 'bush', seed: seed++, radius: rad, jitter: 0.05, at: east(z, y + (ri() - 0.5) * 0.06).add(V3(0, -rad * 0.55, 0)), retone: IVY, noCore: true });
      }
    }
    climb((u, y) => east(-0.08 + u, y), 1.05, 2.45, 0.3, 0.16);                   // arm between the window and the front
    climb((u, y) => east(-1.0 - u, y), 0.95, 2.45, 0.32, 0.18);                   // arm behind the window
    for (const [z, y1] of [[-1.38, 1.75], [0.32, 1.95], [-0.62, 2.02], [0.95, 1.85]]) {  // trailing strands from the sod
      for (let y = 2.5; y >= y1; y -= 0.13) {
        const rad = 0.075 + ri() * 0.03;
        specs.push({ kind: 'bush', seed: seed++, radius: rad, jitter: 0.03, at: east(z + (ri() - 0.5) * 0.06, y).add(V3(0.04, -rad * 0.55, 0)), retone: IVY, noCore: true });
      }
    }
    // CLIMBING ROSE beside the door (right of the arch, x 0.66..0.98) arching over the voussoirs: red + a few white
    // blooms on the leaf clumps (blooms = leaf sprites retoned as blossom clusters, so they sway with the leaves)
    const ROSE = { color: PAL.leaf[1], toneHi: PAL.leaf[0], toneSh: PAL.leaf[2], aCore: '#24413E', aTip: PAL.leaf[0] };
    const blooms = { frac: 0.3, hexes: [PAL.flowerRed, PAL.flowerRed, PAL.flowerRed, PAL.flowerWhite] };
    for (let y = 0.25; y <= 2.0; y += 0.17 + ri() * 0.04) {
      const rad = 0.1 + ri() * 0.035;
      specs.push({ kind: 'bush', seed: seed++, radius: rad, jitter: 0.05, at: V3(0.8 + (ri() - 0.5) * 0.18, y, ZF + 0.02).add(V3(0, -rad * 0.55, 0)), retone: ROSE, blooms, noCore: true });
    }
    for (let i = 0; i <= 6; i++) {                                               // the arch over the door (outside the voussoirs)
      const a = (i / 6) * Math.PI * 0.8, rad = 0.09 + ri() * 0.03;
      const at = V3(Math.cos(a) * (hw + 0.27), DOOR.spring + Math.sin(a) * (ry + 0.25) + 0.02, ZF + 0.05);
      specs.push({ kind: 'bush', seed: seed++, radius: rad, jitter: 0.04, at: at.add(V3(0, -rad * 0.55, 0)), retone: ROSE, blooms, noCore: true });
    }
    // wall-foot moss clumps (leaf-sprite cushions in moss tones, front + east)
    const MOSSC = { color: PAL.mossTuft[1], toneHi: PAL.mossTuft[0], toneSh: PAL.mossTuft[2], aCore: PAL.moss[2], aTip: PAL.mossTuft[0] };
    for (const at of [V3(-1.95, 0.12, ZF + 0.12), V3(0.95, 0.12, ZF + 0.1), V3(WX + 0.12, 0.1, 1.05), V3(WX + 0.14, 0.1, -0.2), V3(WX + 0.12, 0.1, -1.25)])
      specs.push({ kind: 'bush', seed: seed++, radius: 0.13, jitter: 0.04, at, retone: MOSSC, noCore: true });
    const lb = new THREE.Box3(V3(-WX - 0.5, -0.1, ZB - 0.4), V3(WX + 0.5, ROOF.YE + ROOF.H + 1.3, ZF + 0.5));
    for (const m of leafClumps(engine, specs, pal)) {
      m.name = `${rec.id}-${m.name}`; group.add(m);
      if (m.geometry.isInstancedBufferGeometry) { m.geometry.boundingBox = lb.clone(); m.geometry.boundingSphere = lb.getBoundingSphere(new THREE.Sphere()); }
    }
  }

  const W3 = (v) => toWorld(group, v);
  const glassMeshes = [];
  group.traverse((o) => { if (o.userData.layer === 'glass') glassMeshes.push(o); });
  const winAnchors = windows.map((w, i) => ({ id: `${rec.id}-win-${i}`, pos: W3(w.local ? w.glowPos.clone().applyMatrix4(w.local) : w.glowPos) }));
  const crestY = hAt(0.4, ROOF.cz) + 0.05;
  return {
    group,
    anchors: {
      doors: [{ id: `${rec.id}-door`, pivot, open }],
      chimneys: [W3(smoke)],
      windows: winAnchors,
      lights: [
        { ...lamp, pos: W3(lamp.pos) },
        ...winAnchors.slice(0, 2).map((w) => ({ pos: w.pos, color: PAL.glow[1], r: 1.6, kind: 'window' })),
      ],
      perches: [
        W3(V3(chimX - 0.2, chimTop - 0.27, chimZ)),  // chimney cap slab
        W3(V3(0.4, crestY, ROOF.cz)),                 // the crest (right of the sapling)
        W3(V3(-1.1, hAt(-1.1, ROOF.cz) + 0.05, ROOF.cz)),
        W3(V3(1.45, 0.437, ZF + 0.387)),              // the bench between the skeps (a cat)
        W3(V3(WX + 0.37, 0.76, ZB + 0.33)),           // the water butt
      ],
      spots: {
        doorstep: W3(V3(0, 0, 2.3)), bench: W3(V3(1.45, 0, ZF + 0.7)), garden: W3(V3(-1.37, 0, ZF + 0.75)),
        skep0: W3(V3(1.18, 0.477, ZF + 0.6)), skep1: W3(V3(1.74, 0.467, ZF + 0.58)),   // bee doors: bees for the life agent
        sunflowers: W3(V3(-2.6, 1.7, 1.9)), eyebrow: winAnchors[2 + 2].pos, woodpile: W3(V3(-1.2, 0, ZB - 0.6)),
        rowan: W3(V3(sapX, sapY + 0.7, sapZ)),
      },
    },
    api: {
      setDoor: (f) => open(f),
      setLit: (on) => glassMeshes.forEach((m) => kit.setGlowLit(m, on)),
    },
    stats: { roofRings: NS },
  };
}
