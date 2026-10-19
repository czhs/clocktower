// house-11 "Fernlea Oak" (owner: house-11 agent). docs/TOWN.md §4 / §6; identity: pipgws houses/house-11.ts.
//
// DESIGN NOTE
// - Signature: the ONLY tree-house in Hollowmere, and the TREE dominates (v3 "organic" pass). A gnarled oak bole
//   (28 spiral-furrowed columns x 13 rings; exponential root flare 2.0 m -> 1.2 m, lobed cross-section drifting with
//   height, raised twisting bark-ridge ropes), 8 arching tapered tube roots, two great boughs elbowing out, a back
//   leader, and two CRADLE limbs that fork under the deck's front corners and climb past them: the deck sits in the
//   oak's fork (no timber struts). A full 22-clump leaf crown (trees.js bush clumps in spring greens: fresh
//   yellow-green hi + new-growth tips; 1 merged core + 1 leaf mesh) wraps the little blue-roofed cabin, now built of
//   irregular vertical boards (jittered widths / tints / lean, ragged ends below the floor), round log corner posts and
//   gently sagging cream bargeboards. The door sits in a hollow framed by a rounded roll of bark; an oval squirrel
//   hollow high on the left. Lanterns: door bracket, two on ropes under the boughs, three on the rail.
// - Layout: footprint x 4..8, z 27..32, door faces EAST, door tile (8, 31). Trunk centre T = (6.0, 30.35); the
//   round-topped door is set in a deep timber arch case at azimuth 55 deg (35 deg south of east) so it faces the
//   door tile AND the yaw-0 camera (TOWN.md §6 side doors); a doorstep stone + mat lead onto the door tile.
// - Palette rows (TOWN.md §3): trunk / roots / limbs = trunk; moss = moss / mossTuft; deck, stair, rail = plank /
//   timber; door case = timber; cabin walls = plank (boards); roof = blue; bargeboards / rope = cream; stovepipe /
//   lantern iron = iron; vane = brass; frames + cabin shutters + mat = paintRamp(style.shutters #7a3a1e);
//   front door = paintRamp(v1 door #6a4a8a); canopy = leaf (+ mossTuft tip, leaf core); ferns = leaf;
//   toadstools = toadstool + plaster stalk; step / threshold = ashlar; pots = brick; glass / glow / lampGlow.
// - Details (v1): round window with a flower box in the trunk, door lantern, a lantern hanging from the right limb,
//   bead lanterns under the balcony rail, knot hole, moss on the damp left flank, ferns and toadstools at the
//   roots, herb pots by the door (persona extras pots / herbs / vane).
// - Night: trunk window, cabin window, attic light, both lanterns and the 3 rail lanterns glow (kit glass layer);
//   the closed door shows a 1.5-texel threshold light leak under the lifted leaf and a dim amber pool skin on the
//   doorstep stone; the door ramp is one step lighter at night.
// - Animation (pure f(t)): the brass vane veers in 45 deg stops (one gust per 3.2 s, VEER table); canopy wind is
//   trees.js's. Anchors for life: chimneys[0] = stovepipe smoke; perches[0] = the vane top (a rook), perches[3] /
//   spots.knothole = the knot hole (a squirrel); seats[0] / spots.balcony on the deck; api.fadeTargets() = the
//   crown meshes (for a camera-aware dither-fade over the house-12 lot).
import * as THREE from 'three';
import { toWorld } from '../api.js';
import { Builder, M, door as kitDoor, flowerBox, gableRoof, window_ } from '../kit.js';
import { TOWN_PALETTE, paintRamp } from '../palette.js';
import { createTree } from '../../world/trees.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../../core/noise.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const D = THREE.MathUtils.degToRad;
const dir = (az) => [Math.sin(az), Math.cos(az)];          // az 0 = +z (south), +90 = +x (east)
/** Frame at azimuth az, radius rr, height y: local +z = outward (radial). */
const radial = (az, rr, y = 0) => { const [sx, sz] = dir(az); return M({ at: [sx * rr, y, sz * rr], ry: az }); };

// ---- dimensions (metres, local to the trunk centre T; axes = world axes)
const T = { x: 6.0, z: 30.35 };
// a gnarled oak bole: a smooth exponential root flare (2.0 m at the ground) easing into a slightly tapering trunk
// (1.18 m at 1.5 m, ~1.1 m under the deck), 13 rings x 28 columns; the cross-section is lobed (3 + 5 slow lobes that
// drift with height) and the bark furrows spiral a little (TWIST rad/m). The top ring (3.25) sits just under the deck
// (3.3): a coplanar cap z-fights (the old deck crawl).
const RY = [-0.08, 0.08, 0.24, 0.44, 0.7, 1.0, 1.35, 1.7, 2.05, 2.4, 2.75, 3.05, 3.25];
const baseR = (y) => 1.18 + 0.86 * Math.exp(-Math.max(0, y + 0.08) / 0.42) - 0.045 * Math.max(0, y - 1.5);
const K = 28;                                                 // trunk columns
const TWIST = 0.075;                                          // bark furrows spiral (rad per metre)
const PH = D(7.5) + 0.0173;                                   // column phase (irrational: no tie-prone symmetric facets)
const DOOR = { az: D(55), r: 1.26, w: 0.95, h: 2.0, z0: -0.12, z1: 0.46, leafZ: 0.42 };
const WIN = { az: D(4), y: 1.42, r: 0.3 };
const DECK = { y: 3.3, th: 0.14, x0: -1.3, x1: 1.3, z0: -1.3, z1: 1.32, railH: 0.42 };
// the little cabin is a treehouse in the crown now (1.7 x 1.4 m, ridge 5.5): the oak dominates
const CAB = { x: 0.0, z: 0.15, w: 1.7, d: 1.4, y0: 3.43, eave: 4.68, ridge: 5.5 };
// leaf-sprite clumps (createTree bushes; `at` = clump base, ball centre at +0.55 R): one merged core + one leaf mesh.
// back mass + top puff behind the cabin, boughs' clumps left / right, and small clumps tumbling over the cabin's
// front corners and eaves so the gable peeks out of the leaves. Nothing south of the door's view line (door z <= 1.2).
const CLUMPS = [
  { seed: 1101, R: 1.5, at: [0.05, 4.05, -1.65] },            // back mass
  { seed: 1102, R: 1.3, at: [-1.4, 3.95, -1.15] },
  { seed: 1103, R: 1.25, at: [1.4, 3.85, -1.25] },
  { seed: 1104, R: 1.0, at: [-0.35, 4.85, -0.95] },          // top puff behind the ridge
  { seed: 1105, R: 0.8, at: [0.75, 4.95, -1.05], noCore: true },
  { seed: 1106, R: 1.12, at: [-2.5, 3.5, 0.0] },             // left bough
  { seed: 1107, R: 0.9, at: [-2.1, 4.35, -0.65], noCore: true },
  { seed: 1108, R: 1.0, at: [2.3, 3.45, 0.05] },             // right bough
  { seed: 1109, R: 0.85, at: [1.95, 4.3, -0.55], noCore: true },
  { seed: 1110, R: 0.58, at: [-1.42, 3.2, 1.0], noCore: true },    // front corners (over the deck ends, outside the cabin)
  { seed: 1111, R: 0.52, at: [1.42, 3.18, 0.95], noCore: true },
  { seed: 1112, R: 0.42, at: [-1.2, 4.3, 0.5], noCore: true },     // tumbling over the eaves
  { seed: 1113, R: 0.38, at: [1.22, 4.36, 0.38], noCore: true },
  // fuller crown: high puffs over the cabin's shoulders, a crowning back puff, outer clumps on the twigs, low drapes
  { seed: 1114, R: 0.95, at: [-1.25, 4.75, -0.55], noCore: true },
  { seed: 1115, R: 0.9, at: [1.3, 4.7, -0.5], noCore: true },
  { seed: 1116, R: 1.0, at: [-0.1, 5.25, -1.7] },
  { seed: 1117, R: 0.85, at: [-3.25, 2.95, -0.6], noCore: true },
  { seed: 1118, R: 0.8, at: [3.15, 2.95, -0.6], noCore: true },
  { seed: 1119, R: 0.62, at: [-2.75, 2.75, 0.62], noCore: true },
  { seed: 1120, R: 0.55, at: [2.65, 2.75, 0.62], noCore: true },
  { seed: 1121, R: 0.48, at: [-1.75, 3.7, 1.0], noCore: true },
  { seed: 1122, R: 0.45, at: [1.8, 3.65, 0.95], noCore: true },
];

const trunkR = baseR;
const angDist = (a, b) => Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);

const archPts = (w, h) => [[-w / 2, 0], [w / 2, 0], [w / 2, h - w * 0.3], [w * 0.3, h - w * 0.08], [0, h], [-w * 0.3, h - w * 0.08], [-w / 2, h - w * 0.3]];
const ovalPts = (rx, ry) => Array.from({ length: 10 }, (_, i) => [rx * Math.cos((i * Math.PI) / 5 + 0.1), ry * Math.sin((i * Math.PI) / 5 + 0.1)]);
const octPts = (r, rot = Math.PI / 8) => Array.from({ length: 8 }, (_, i) => [r * Math.cos(rot + (i * Math.PI) / 4), r * Math.sin(rot + (i * Math.PI) / 4)]);

/** Extruded polygon with an optional hole (local XY, extruded along +z from z0 to z0 + depth). */
function ringPrism(b, outer, inner, z0, depth, opts) {
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  if (inner) shape.holes.push(new THREE.Path(inner.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, z0);
  b.add(g, null, opts);
  g.dispose();
}

/** Quad a-b-c-d (either winding) emitted facing away from `inside` (a point inside the solid). */
const _n = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _c = new THREE.Vector3();
function quad(b, a, b2, c, d, inside, opts) {
  _e1.subVectors(b2, a); _e2.subVectors(c, a); _n.crossVectors(_e1, _e2);
  _c.copy(a).add(b2).add(c).add(d).multiplyScalar(0.25).sub(inside);
  const q = _n.dot(_c) >= 0 ? [a, b2, c, d] : [a, d, c, b2];
  const arr = [];
  for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]]) arr.push(q[i].x, q[i].y, q[i].z, q[j].x, q[j].y, q[j].z, q[k].x, q[k].y, q[k].z);
  b.tris(arr, opts);
}

/** Square-section beam from p0 to p1 (tapering s0 -> s1): limbs, struts, rope, fronds. */
function beam(b, p0, p1, s0, s1, opts) {
  const dv = p1.clone().sub(p0).normalize();
  const up = Math.abs(dv.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0);
  const u = dv.clone().cross(up).normalize(), v = u.clone().cross(dv).normalize();
  const c = [];
  for (let i = 0; i < 8; i++) {
    const s = (i & 4 ? s1 : s0) / 2;
    c.push((i & 4 ? p1 : p0).clone().addScaledVector(u, (i & 1 ? 1 : -1) * s).addScaledVector(v, (i & 2 ? 1 : -1) * s));
  }
  b.hexa(c, opts);
}

/** Flat blade from p0 to p1 (width w0 -> w1, horizontal across, 0.04 thick): fern fronds. */
function blade(b, p0, p1, w0, w1, opts, t = 0.04) {
  const dv = p1.clone().sub(p0).normalize();
  const u = dv.clone().cross(V3(0, 1, 0)).normalize(), v = u.clone().cross(dv).normalize();
  const c = [];
  for (let i = 0; i < 8; i++) {
    const w = (i & 4 ? w1 : w0) / 2;
    c.push((i & 4 ? p1 : p0).clone().addScaledVector(u, (i & 1 ? 1 : -1) * w).addScaledVector(v, (i & 2 ? 1 : -1) * t / 2));
  }
  b.hexa(c, opts);
}

/** Octagonal tapering bough along a polyline (parallel-transported frame, no twist), with an end cap. */
function tube(b, pts, rads, opts, n = 8) {
  const rings = [];
  let u = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = (i < pts.length - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
    if (i > 0 && i < pts.length - 1) t.add(p.clone().sub(pts[i - 1]).normalize()).normalize();
    if (!u) u = t.clone().cross(Math.abs(t.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0)).normalize();
    else u.addScaledVector(t, -u.dot(t)).normalize();
    const v = u.clone().cross(t).normalize();
    rings.push(Array.from({ length: n }, (_, k) => {
      const a = ((k + 0.5) / n) * Math.PI * 2 + 0.0131;
      return p.clone().addScaledVector(u, Math.cos(a) * rads[i]).addScaledVector(v, Math.sin(a) * rads[i]);
    }));
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const c = pts[i].clone().lerp(pts[i + 1], 0.5);
    for (let k = 0; k < n; k++) quad(b, rings[i][k], rings[i][(k + 1) % n], rings[i + 1][(k + 1) % n], rings[i + 1][k], c, opts);
  }
  const L = pts.length - 1, e = rings[L], tip = pts[L], inner = pts[L - 1];
  for (let k = 0; k < n; k++) {
    const a = e[k], c2 = e[(k + 1) % n];
    _e1.subVectors(a, tip); _e2.subVectors(c2, tip); _n.crossVectors(_e1, _e2);
    const out = _n.dot(_c.subVectors(tip, inner)) > 0;
    const [q1, q2] = out ? [a, c2] : [c2, a];
    b.tris([tip.x, tip.y, tip.z, q1.x, q1.y, q1.z, q2.x, q2.y, q2.z], opts);
  }
}

// ---------------------------------------------------------------- merged leaf clumps (after house-4's technique)
/** Merge instanced sprite meshes sharing one material into one mesh; re-sorts far -> near when the camera turns. */
function mergeInstanced(engine, parts, { k = 0.1, name = 'sprites', renderOrder = 1 } = {}) {
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
  let last = '';
  const sort = () => {
    const c = engine.camera, key = `${c.yaw.toFixed(4)},${c.pitch.toFixed(4)}`;
    if (key === last) return;
    last = key;
    const fx = -Math.cos(c.pitch) * Math.sin(c.yaw), fy = -Math.sin(c.pitch), fz = -Math.cos(c.pitch) * Math.cos(c.yaw);
    const B = src.aBase, W = src.aVar, wsz = geo.attributes.aVar.itemSize;
    const d = new Float32Array(N), idx = Array.from({ length: N }, (_, i) => i);
    for (let i = 0; i < N; i++) d[i] = B[i * 3] * fx + B[i * 3 + 1] * fy + B[i * 3 + 2] * fz - k * W[i * wsz + 3];
    idx.sort((a, b2) => d[b2] - d[a] || a - b2);
    for (const a of names) {
      const sz = geo.attributes[a].itemSize, dst = geo.attributes[a].array, S = src[a];
      idx.forEach((from, to) => { for (let c2 = 0; c2 < sz; c2++) dst[to * sz + c2] = S[from * sz + c2]; });
      geo.attributes[a].needsUpdate = true;
    }
  };
  sort();
  engine.onUpdate(sort);
  const mesh = new THREE.Mesh(geo, parts[0].mesh.material);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.renderOrder = renderOrder; mesh.name = name;
  return mesh;
}

/** createTree bushes placed as clumps, merged into ONE core mesh + ONE leaf mesh (2 draw calls for the whole crown). */
function leafClumps(engine, specs, pal, leafTexels = 4.2) {
  const cores = [], leaves = [];
  let coreMat = null, nLeaves = 0;
  for (const sp of specs) {
    const before = engine._treeSorters ? engine._treeSorters.length : 0;
    const t = createTree(engine, { kind: 'bush', seed: sp.seed, radius: sp.R, add: false, palette: pal, leafTexels });
    if (engine._treeSorters) engine._treeSorters.length = before;          // the merged mesh sorts itself
    const at = V3(...sp.at);
    const core = t.getObjectByName('core'), lv = t.getObjectByName('leaves');
    if (core && !sp.noCore) {
      const g = core.geometry.clone();
      g.translate(at.x, at.y, at.z);
      const lp = g.attributes.aLeafPos;
      if (lp) for (let i = 0; i < lp.count; i++) lp.setXYZ(i, lp.getX(i) + at.x, lp.getY(i) + at.y, lp.getZ(i) + at.z);
      cores.push(g.index ? g.toNonIndexed() : g); coreMat = core.material;
    }
    if (lv) { leaves.push({ mesh: lv, offset: at }); nLeaves += lv.geometry.instanceCount; }
  }
  const out = [];
  if (cores.length) {
    const cm = new THREE.Mesh(mergeGeometries(cores), coreMat);
    cm.castShadow = true; cm.receiveShadow = true; cm.name = 'crown-core';
    out.push(cm);
  }
  const lm = mergeInstanced(engine, leaves, { k: 0.1, name: 'crown-leaves', renderOrder: 1 });
  if (lm) out.push(lm);
  return { meshes: out, nLeaves };
}

export default function build(engine, ctx) {
  const r = ctx.record;
  const rnd = rng(ctx.seed);
  const b = new Builder(engine, { name: r.id });
  // thin rails / rope / wires: own mesh that casts no shadow (2-texel posts make busy, aliasing shadow stripes)
  const rb = new Builder(engine, { name: `${r.id}-rail` });
  const paint = paintRamp(r.style?.shutters ?? '#7a3a1e', { lightness: 0.34 });
  // the purple v1 door, one step lighter at night so it separates from its dark timber case
  const doorRamp = paintRamp('#6a4a8a', { lightness: ctx.night ? 0.5 : 0.36 });
  const windows = [];
  const lights = [];
  const glow = TOWN_PALETTE.glow[1], lamp = TOWN_PALETTE.lampGlow;

  // ------------------------------------------------------------------ trunk: gnarled, lobed, spiral-furrowed loft
  const colMul = [], colTint = [];
  // ridge / groove columns: furrows (x0.88..1.06) read as bark at 640x360; grooves a step darker, ridges lighter
  const pat = [1.06, 0.99, 0.88, 1.04, 1.06, 0.91, 1.01, 0.89, 1.05, 0.95];
  for (let k = 0; k < K; k++) {
    const m = pat[(k * 7 + 3) % pat.length];
    colMul.push(m);
    colTint.push(m < 0.92 ? 0.9 : m < 0.97 ? 0.95 : m > 1.04 ? 1.06 : 1.0);
  }
  const colAz = (k, y) => PH + (k / K) * Math.PI * 2 + TWIST * y;
  /** Bark vertex of column k at height y (continuous in y: the rings only sample it). */
  const vert = (k, y) => {
    const az = colAz(k, y);
    const nearDoor = angDist(az, DOOR.az), nearWin = angDist(az, WIN.az);
    // the furrows and lobes ease out where the door / window sit (a smooth bark field around them)
    const calm = Math.min(1, Math.max(0, (Math.min(nearDoor - D(26), nearWin - D(20))) / D(18)));
    const m = 0.98 + (colMul[k % K] - 0.98) * calm;
    const lobe = 1 + calm * (0.065 * Math.sin(3 * az + 0.9 * y + 0.7) + 0.035 * Math.sin(5 * az - 1.4 * y + 2.1));
    let rr = baseR(y) * lobe * m;
    if (nearDoor < D(40)) rr = Math.min(rr, 1.31 + Math.max(0, (nearDoor - D(24)) / D(16)) * Math.max(0, rr - 1.31));
    const lean = Math.sin(y * 1.3) * 0.05;                           // a gentle S in the trunk
    const [sx, sz] = dir(az);
    return V3(sx * rr + lean, y, sz * rr);
  };
  const ptAt = vert;
  /** Bark surface radius at azimuth az, height y (between the two column lines; minus a hair). */
  const surfR = (az, y) => {
    const u = ((((az - PH - TWIST * y) / (2 * Math.PI)) * K) % K + K) % K, k = Math.floor(u), f = u - k;
    const p = ptAt(k, y).lerp(ptAt(k + 1, y), f);
    return Math.hypot(p.x, p.z) * Math.cos(Math.PI / K) - 0.01;
  };
  for (let ri = 0; ri < RY.length - 1; ri++) {
    const y0 = RY[ri], y1 = RY[ri + 1], inside = V3(0, (y0 + y1) / 2, 0);
    for (let k = 0; k < K; k++) {
      quad(b, vert(k, y0), vert(k + 1, y0), vert(k + 1, y1), vert(k, y1), inside, { tones: 'trunk', tint: colTint[k], pattern: 'vboards', scale: 0.55 });
    }
  }
  {   // top cap (under the deck)
    const yt = RY[RY.length - 1], c = V3(0, yt, 0);
    for (let k = 0; k < K; k++) {
      const p0 = vert(k, yt), p1 = vert(k + 1, yt);
      _e1.subVectors(p1, c); _e2.subVectors(p0, c);
      const up = _n.crossVectors(_e1, _e2).y > 0;
      const [q1, q2] = up ? [p1, p0] : [p0, p1];
      b.tris([c.x, c.y, c.z, q1.x, q1.y, q1.z, q2.x, q2.y, q2.z], { tones: 'trunk' });
    }
  }

  // ------------------------------------------------------------------ bark ridges: raised, twisting ropes of bark
  // (follow the spiral furrow columns; none across the door / window / knot hollow); lit crests + dark grooves
  for (let j = 0; j < 11; j++) {
    const k = (j * 3 + (j > 5 ? 1 : 0)) % K;
    const az0 = colAz(k, 1.2);
    if (angDist(az0, DOOR.az) < D(46) || angDist(az0, WIN.az) < D(26)) continue;
    const y0 = 0.25 + (j % 3) * 0.12, y1 = 2.55 + ((j * 5) % 4) * 0.18, n = 4, pts = [], rads = [];
    for (let i = 0; i <= n; i++) {
      const y = y0 + ((y1 - y0) * i) / n, p = vert(k, y);
      const out = 1 + 0.02 / Math.max(0.5, Math.hypot(p.x, p.z));
      pts.push(V3(p.x * out, y, p.z * out));
      rads.push(0.08 * Math.sin(Math.PI * (0.15 + (0.7 * i) / n)) + 0.02);
    }
    tube(b, pts, rads, { tones: 'trunk', tint: 1.07, pattern: 'none' }, 6);
  }

  // ------------------------------------------------------------------ roots: arching tapered tubes into the ground
  // [az deg, length, sideways bend]; none in front of the door (az 55 +- 40) or under the stair's first treads
  const ROOTS = [[-14, 1.55, 0.18], [24, 1.35, -0.15], [-62, 1.6, 0.2], [-104, 1.75, -0.18], [-150, 1.6, 0.16], [148, 1.5, -0.2], [104, 1.6, 0.16], [-36, 1.1, -0.1]];
  ROOTS.forEach(([azd, len, bend], i) => {
    const az = D(azd) + 0.0131, [sx, sz] = dir(az), tx = Math.cos(az), tz = -Math.sin(az);
    const P = (rr, y, f) => V3(sx * rr + tx * bend * f * f, y, sz * rr + tz * bend * f * f);
    const s = i === 7 ? 0.7 : 1;                                     // a small extra root in front-left
    const pts = [P(0.8, 0.85 * s, 0), P(1.28, 0.58 * s, 0.3), P(1.05 + len * 0.4, 0.26 * s, 0.6), P(1.05 + len * 0.7, 0.04, 0.9), P(1.0 + len * 0.82, -0.14, 1)];
    tube(b, pts, [0.46 * s, 0.4 * s, 0.3 * s, 0.2 * s, 0.13 * s], { tones: 'trunk', tint: i % 2 ? 0.96 : 1.03, pattern: 'vboards', scale: 0.55 }, 6);
  });

  // ------------------------------------------------------------------ limbs into the crown
  // two great boughs elbow out left / right from the bole (gnarled 6-point polylines); a back leader rises behind the
  // cabin; two CRADLE limbs fork from the bole under the deck's front corners, carry it and climb on past the deck
  // ends into the corner clumps (the deck reads as sitting in the oak's fork); twigs run into the outer clumps
  const LIMBS = [
    [[V3(-0.45, 2.05, 0.15), V3(-1.2, 2.32, 0.42), V3(-1.82, 2.72, 0.5), V3(-2.38, 3.22, 0.3), V3(-2.72, 3.78, 0.08), V3(-2.82, 4.25, -0.18)], [0.46, 0.37, 0.3, 0.23, 0.16, 0.1]],
    [[V3(0.45, 2.0, 0.05), V3(1.18, 2.28, 0.3), V3(1.85, 2.68, 0.42), V3(2.32, 3.18, 0.25), V3(2.6, 3.75, -0.02), V3(2.7, 4.2, -0.25)], [0.44, 0.35, 0.28, 0.21, 0.15, 0.1]],
    [[V3(0.0, 2.9, -0.5), V3(-0.08, 3.6, -0.85), V3(0.1, 4.3, -1.15), V3(0.12, 4.95, -1.5)], [0.52, 0.4, 0.29, 0.18]],
    [[V3(-1.72, 3.05, 0.1), V3(-1.98, 3.62, -0.25), V3(-2.02, 4.15, -0.62), V3(-1.8, 4.6, -0.85)], [0.18, 0.14, 0.1, 0.07]],
    [[V3(1.7, 3.0, 0.0), V3(1.9, 3.6, -0.32), V3(1.88, 4.1, -0.6), V3(1.6, 4.5, -0.78)], [0.17, 0.13, 0.09, 0.06]],
    // cradles (under the deck: tops stay below y 3.3)
    [[V3(-0.5, 2.3, 0.62), V3(-0.92, 2.72, 1.0), V3(-1.24, 3.08, 1.22), V3(-1.56, 3.5, 1.24), V3(-1.68, 3.95, 1.0)], [0.27, 0.21, 0.16, 0.12, 0.08]],
    [[V3(0.52, 2.32, 0.6), V3(0.98, 2.74, 0.98), V3(1.26, 3.08, 1.18), V3(1.6, 3.48, 1.16), V3(1.74, 3.9, 0.92)], [0.26, 0.2, 0.15, 0.11, 0.07]],
    // twigs into the outer clumps
    [[V3(-2.38, 3.22, 0.3), V3(-2.95, 3.28, -0.1), V3(-3.3, 3.45, -0.55)], [0.12, 0.08, 0.05]],
    [[V3(2.32, 3.18, 0.25), V3(2.85, 3.22, -0.15), V3(3.2, 3.4, -0.55)], [0.12, 0.08, 0.05]],
  ];
  for (const [pts, rads] of LIMBS) tube(b, pts, rads, { tones: 'trunk', pattern: 'vboards', scale: 0.55 });

  // ------------------------------------------------------------------ the door case in the trunk flank (faces the door tile)
  b.push(radial(DOOR.az, DOOR.r, 0));
  {
    const { w, h } = DOOR;
    // the hollow: a swollen bark callus lip (irregular arch) rolls round the timber case, as if the oak grew round it
    {   // a rounded roll of bark (tube along the arch, thicker at the foot) rather than a flat plate
      const W = w + 0.5, H = h + 0.32;
      const lip = [[-W / 2 - 0.06, -0.06], [-W / 2, 0.7], [-W / 2 + 0.02, H - W * 0.32], [-W * 0.3, H - W * 0.07], [0, H + 0.02], [W * 0.31, H - W * 0.08], [W / 2, H - W * 0.3], [W / 2 + 0.02, 0.7], [W / 2 + 0.07, -0.06]];
      const zl = (y) => 0.2 - Math.max(0, 1.0 - y) * 0.12;                     // the foot swells back into the bark
      tube(b, lip.map(([px, py]) => V3(px, py, zl(py))), lip.map(([, py], i) => (py < 0.8 ? 0.2 : 0.13) + (i % 2) * 0.02), { tones: 'trunk', tint: 1.05, pattern: 'vboards', scale: 0.55 });
    }
    ringPrism(b, archPts(w + 0.34, h + 0.2), archPts(w, h), DOOR.z0, DOOR.z1 - DOOR.z0, { tones: 'timber', pattern: 'none' });
    b.box(0.22, 0.17, 0.07, { tones: paint, at: [0, h + 0.05, DOOR.z1 + 0.02] });                  // keystone
    b.box(w + 0.18, 0.06, 0.34, { tones: 'ashlar', at: [0, -0.01, DOOR.z1 - 0.1] });               // threshold
    ringPrism(b, archPts(w, h), null, DOOR.z0 + 0.24, 0.02, { tones: '#2A1A20', layer: 'glass', glow: TOWN_PALETTE.fireGlow, glowKind: 2 });
    // doorstep stone; its top 12 mm is a glass-layer skin on the same plane: ashlar by day, a dim lantern pool at night
    b.cylinder(0.36, 0.34, 0.068, { segments: 8, at: [0, -0.02, DOOR.z1 + 0.42], tones: 'ashlar' });
    b.cylinder(0.36, 0.36, 0.012, { segments: 8, at: [0, 0.048, DOOR.z1 + 0.42], tones: 'ashlar', layer: 'glass', glow: TOWN_PALETTE.brass[2], glowKind: 2 });
    // threshold light leak: a 1.5-texel glowing sliver under the (lifted) leaf, in the leaf's own plane
    b.box(w - 0.08, 0.05, 0.04, { tones: '#2A1A20', layer: 'glass', glow: TOWN_PALETTE.fireGlow, glowKind: 2, at: [0, 0.05, DOOR.leafZ - 0.03] });
  }
  b.pop();
  {   // door lantern on the bark between window and door
    const fr = radial(D(27), surfR(D(27), 2.1) - 0.03, 0), lz = 0.3;
    b.push(fr);
    b.box(0.05, 0.05, lz + 0.04, { tones: 'iron', at: [0, 2.3, lz / 2] });                       // bracket
    b.box(0.05, 0.08, 0.05, { tones: 'iron', at: [0, 2.22, lz] });                               // hook
    b.cylinder(0.14, 0.04, 0.09, { segments: 8, at: [0, 2.14, lz], tones: 'iron' });            // cap
    b.box(0.13, 0.18, 0.13, { tones: 'glass', layer: 'glass', glow: lamp, glowKind: 2, at: [0, 1.96, lz] });
    b.box(0.17, 0.04, 0.17, { tones: 'iron', at: [0, 1.92, lz] });
    b.pop();
    lights.push({ pos: V3(0, 2.04, lz + 0.12).applyMatrix4(fr), color: lamp, r: 3, kind: 'lantern', flicker: true });
  }
  // doormat on the door tile (flat, 0.3 m deep)
  b.box(0.3, 0.025, 0.78, { tones: paint, tint: 0.95, at: [8.17 - T.x, -0.005, 31.5 - T.z] });

  // ------------------------------------------------------------------ round window + flower box
  b.push(radial(WIN.az, surfR(WIN.az, WIN.y) - 0.02, WIN.y));
  {
    const rr = WIN.r;
    ringPrism(b, octPts(rr + 0.1), octPts(rr), -0.06, 0.2, { tones: paint });
    ringPrism(b, octPts(rr), null, -0.04, 0.12, { tones: 'glass', layer: 'glass', glow });
    b.box(0.05, rr * 2, 0.04, { tones: paint, at: [0, -rr, 0.1] });
    b.box(rr * 2, 0.05, 0.04, { tones: paint, at: [0, -0.025, 0.1] });
    flowerBox(b, { at: [0, -rr - 0.12, 0.08], w: 0.72, seed: ctx.seed });
  }
  b.pop();
  {
    const [sx, sz] = dir(WIN.az), rr = surfR(WIN.az, WIN.y) + 0.3;
    windows.push(V3(sx * rr, WIN.y, sz * rr));
  }
  // knot hole high on the left-front
  const KNOT = { az: D(-38), y: 2.25 };
  b.push(radial(KNOT.az, surfR(KNOT.az, KNOT.y), KNOT.y));
  ringPrism(b, ovalPts(0.24, 0.32), ovalPts(0.14, 0.21), -0.12, 0.2, { tones: 'trunk', tint: 1.06 });
  ringPrism(b, ovalPts(0.14, 0.21), null, -0.12, 0.05, { tones: '#1E1418', pattern: 'none' });
  b.pop();
  // moss on the damp (lit, west) flank: skins hugging whole bark columns, ragged stepped tops, a tuft row at the crest
  const mossCol = (k, y0, y1) => {
    const sc = (p) => V3(p.x * 1.035, p.y, p.z * 1.035);
    const ym = Math.min(y1, y1 - 0.12), c = V3(0, (y0 + y1) / 2, 0);
    quad(b, sc(ptAt(k, y0)), sc(ptAt(k + 1, y0)), sc(ptAt(k + 1, ym)), sc(ptAt(k, ym)), c, { tones: 'moss', layer: 'soft', tint: k % 2 ? 0.97 : 1.03 });
    const s2 = (p) => V3(p.x * 1.05, p.y, p.z * 1.05);
    quad(b, s2(ptAt(k, ym)), s2(ptAt(k + 1, ym)), s2(ptAt(k + 1, y1)), s2(ptAt(k, y1)), c, { tones: 'mossTuft', layer: 'soft' });
  };
  const colAt = (azd) => ((Math.round(((D(azd) - PH) / (2 * Math.PI)) * K) % K) + K) % K;
  for (const [azd, n, y0, tops] of [[-52, 3, -0.04, [0.5, 0.74, 0.4]], [-88, 3, -0.04, [0.92, 1.18, 0.8]], [-125, 2, 0.1, [0.98, 0.7]], [-158, 2, 0.5, [1.25, 1.0]]]) {
    const k0 = colAt(azd);
    for (let j = 0; j < n; j++) mossCol((k0 + j) % K, y0, tops[j] + rnd() * 0.08);
  }

  // ------------------------------------------------------------------ the winding plank stair (front-left, rising to the back)
  const STEPS = 11;
  const posts = [];
  for (let k = 0; k < STEPS; k++) {
    const az = D(-24 - k * 13.6), y = 0.26 + k * 0.3;
    const r0 = surfR(az, y) - 0.08;
    b.push(radial(az, 0, 0));
    b.box(0.34, 0.07, 0.72, { tones: 'plank', tint: k % 2 ? 0.97 : 1.03, at: [0, y - 0.07, r0 + 0.36] });
    b.box(0.08, 0.1, 0.5, { tones: 'timber', at: [0, y - 0.17, r0 + 0.25] });                   // bracket under the tread
    if (k % 2 === 0) b.box(0.06, 0.69, 0.06, { tones: 'timber', at: [0, y - 0.07, r0 + 0.66] });
    b.pop();
    if (k % 2 === 0) { const [sx, sz] = dir(az), pr = r0 + 0.66; posts.push(V3(sx * pr, y + 0.62, sz * pr)); }
  }
  for (let i = 0; i + 1 < posts.length; i++) {           // sagging rope rail (2 segments per span)
    const a = posts[i], c = posts[i + 1], m = a.clone().lerp(c, 0.5); m.y -= 0.07;
    beam(rb, a, m, 0.05, 0.05, { tones: 'thatch', tint: 0.94 });
    beam(rb, m, c, 0.05, 0.05, { tones: 'thatch', tint: 0.94 });
  }

  // ------------------------------------------------------------------ deck + balcony rail + struts + bead lanterns
  {
    const { y, th, x0, x1, z0, z1 } = DECK;
    b.box(x1 - x0, th, z1 - z0, { tones: 'plank', pattern: 'planks', at: [(x0 + x1) / 2, y, (z0 + z1) / 2] });
    b.box(x1 - x0 + 0.06, 0.12, 0.12, { tones: 'timber', at: [(x0 + x1) / 2, y - 0.1, z1 - 0.05] });      // front joist
    b.box(0.12, 0.12, z1 - z0, { tones: 'timber', at: [x0 + 0.05, y - 0.1, (z0 + z1) / 2] });
    b.box(0.12, 0.12, z1 - z0, { tones: 'timber', at: [x1 - 0.05, y - 0.1, (z0 + z1) / 2] });
    const top = y + th, railH = DECK.railH, nPost = 8;
    for (let i = 0; i < nPost; i++) {
      const px = x0 + 0.06 + (i * (x1 - x0 - 0.12)) / (nPost - 1);
      rb.box(0.06, railH, 0.06, { tones: 'timber', at: [px, top, z1 - 0.05] });
    }
    rb.box(x1 - x0, 0.07, 0.09, { tones: 'plank', tint: 1.04, at: [(x0 + x1) / 2, top + railH, z1 - 0.05] });
    for (const sx of [x0 + 0.05, x1 - 0.05]) {          // side rails (the left one stops short: the stair arrives there)
      const len = z1 - z0 - (sx < 0 ? 0.7 : 0.1);
      for (let i = 0; i < 4; i++) if ((i + 1) * 0.55 < len) rb.box(0.06, railH, 0.06, { tones: 'timber', at: [sx, top, z1 - 0.05 - (i + 1) * 0.55] });
      rb.box(0.09, 0.07, len, { tones: 'plank', tint: 1.04, at: [sx, top + railH, z1 - len / 2] });
    }
    for (let i = 0; i < 3; i++) {                         // 3 little lanterns hanging off the front rail (>= 3x4 texels, brass caps)
      const bx = -0.82 + i * 0.82 + 0.013, by = top + railH - 0.2 - (i % 2) * 0.05, lzz = z1 + 0.04;
      rb.box(0.05, top + railH - by - 0.05, 0.05, { tones: 'iron', at: [bx, by + 0.05, lzz] });
      b.box(0.15, 0.05, 0.15, { tones: 'brass', at: [bx, by, lzz] });
      b.box(0.11, 0.14, 0.11, { tones: 'glass', layer: 'glass', glow: lamp, glowKind: 2, at: [bx, by - 0.14, lzz] });
      b.box(0.13, 0.04, 0.13, { tones: 'brass', tint: 0.95, at: [bx, by - 0.18, lzz] });
    }
  }

  // ------------------------------------------------------------------ the cabin in the crown
  let smoke, vanePerch, vanePos;
  const vb = new Builder(engine, { name: `${r.id}-vane` });
  {
    const { x, z, w, d, y0, eave, ridge } = CAB;
    // a soft, hand-built cabin: an inset core + irregular vertical boards (jittered widths, tints, a hair of lean,
    // ragged ends hanging below the floor line) on the front and both sides; round log corner posts
    b.box(w - 0.05, eave - y0, d - 0.05, { tones: 'plank', pattern: 'boards', at: [x, y0, z] });
    const boards = (n, len, place) => {
      const ws = Array.from({ length: n }, () => 0.8 + rnd() * 0.4), sum = ws.reduce((a2, c2) => a2 + c2, 0);
      let u = -len / 2;
      ws.forEach((wi, i) => {
        const bw = (wi / sum) * len, drop = 0.03 + rnd() * 0.09;
        place(u + bw / 2, bw - 0.018, drop, { tones: 'plank', pattern: 'none', tint: 0.93 + rnd() * 0.13, rz: (rnd() - 0.5) * 0.035 }, i);
        u += bw;
      });
    };
    const fz = z + d / 2;
    const hb = eave - y0;
    boards(7, w - 0.1, (u, bw, drop, o) => b.box(bw, hb + drop, 0.03, { ...o, at: [x + u, y0 - drop, fz - 0.01] }));
    for (const sx of [-1, 1]) boards(5, d - 0.1, (u, bw, drop, o) => b.box(0.03, hb + drop, bw, { ...o, rx: o.rz, rz: 0, at: [x + sx * (w / 2 - 0.01), y0 - drop, z + u] }));
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) b.cylinder(0.075, 0.065, hb + 0.1, { segments: 8, at: [x + sx * (w / 2), y0 - 0.1, z + sz * (d / 2)], tones: 'timber' });
    const win = window_(b, { at: [x, 4.3, fz + 0.04], w: 0.42, h: 0.4, panes: [2, 2], frame: 'cream', shutters: paint, sillTones: 'plank' });
    windows.push(win.glowPos.clone());
    gableRoof(b, { x, z, w: d, d: w, eave, ridge, axis: 'z', kind: 'blue', gable: 'plank', gablePattern: 'boards', overhang: 0.24,
      gableOverhang: 0.22, seed: ctx.seed, roof: { course: 0.4, lift: 0.065, thick: 0.08 } });
    // cream bargeboards on the front gable (the v1 bright roof edge)
    const L = d / 2 + 0.22, hw = w / 2 + 0.24, th = Math.atan2(ridge - eave, w / 2), y0e = eave - 0.24 * Math.tan(th);
    for (const s of [-1, 1]) {
      const A = V3(x + s * hw, y0e - 0.02, z + L + 0.03), B = V3(x, ridge + 0.06, z + L + 0.03);
      const mid = A.clone().lerp(B, 0.5); mid.y -= 0.05;
      const curl = A.clone().add(V3(s * 0.07, -0.08, 0));
      tube(b, [curl, A, mid, B], [0.035, 0.045, 0.045, 0.045], { tones: 'cream', tint: 0.97 }, 6);
    }
    b.push(M({ at: [x, 4.98, fz] }));                     // round attic light in the gable
    ringPrism(b, octPts(0.17), octPts(0.11), -0.02, 0.07, { tones: paint });
    ringPrism(b, octPts(0.11), null, -0.02, 0.03, { tones: 'glass', layer: 'glass', glow });
    b.pop();
    windows.push(V3(x, 4.98, fz + 0.3));
    const px = x + 0.46, pz = z + 0.12;                   // iron stovepipe on the right slope + conical hat
    b.cylinder(0.08, 0.08, 1.0, { segments: 8, at: [px, 4.85, pz], tones: 'iron' });
    b.cylinder(0.11, 0.11, 0.06, { segments: 8, at: [px, 5.45, pz], tones: 'iron', tint: 1.05 });
    b.cylinder(0.05, 0.05, 0.1, { segments: 8, at: [px, 5.85, pz], tones: 'iron' });
    b.cylinder(0.2, 0.03, 0.16, { segments: 8, at: [px, 5.93, pz], tones: 'iron', tint: 1.03 });
    smoke = V3(px, 5.92, pz);
    const vz = z + L - 0.12, vy = ridge + 0.1;           // brass vane on the front ridge end
    b.box(0.05, 0.3, 0.05, { tones: 'brass', at: [x, vy, vz] });
    // the turning arrow (local to its pivot on the post): built in vb, swung in 45 deg stops by update(t)
    vb.box(0.5, 0.055, 0.055, { tones: 'brass', at: [0, 0.03, 0] });
    vb.box(0.05, 0.1, 0.05, { tones: 'brass', at: [0, -0.04, 0] });
    vb.prism([[0, 0], [0.16, 0.0], [0.16, 0.16]], 0.05, { tones: 'brass', at: [-0.27, -0.03, 0] });
    vb.prism([[0, -0.08], [0.13, 0], [0, 0.08]], 0.06, { tones: 'brass', at: [0.245, 0.0575, 0] });
    vanePos = V3(x, vy + 0.3, vz);
    vanePerch = V3(x, vy + 0.47, vz);
  }

  // ------------------------------------------------------------------ hanging lantern from the right limb
  {
    const lx = 2.0, lz = 0.32, top = 2.78, ly = 2.18;
    b.box(0.05, top - ly - 0.3, 0.05, { tones: 'iron', at: [lx, ly + 0.3, lz] });
    b.cylinder(0.04, 0.13, 0.08, { segments: 8, at: [lx, ly + 0.23, lz], tones: 'iron' });
    b.box(0.14, 0.2, 0.14, { tones: 'glass', layer: 'glass', glow: lamp, glowKind: 2, at: [lx, ly + 0.03, lz] });
    b.box(0.2, 0.05, 0.2, { tones: 'iron', at: [lx, ly, lz] });
    lights.push({ pos: V3(lx, ly + 0.1, lz + 0.15), color: lamp, r: 1.8, kind: 'lantern', flicker: true });
  }
  // another lantern on a rope under the left bough (rope = thin, no shadow)
  for (const [lx, lz, top, ly] of [[-2.05, 0.46, 2.72, 2.12]]) {
    beam(rb, V3(lx, top, lz), V3(lx, ly + 0.27, lz), 0.035, 0.035, { tones: 'thatch', tint: 0.94 });
    b.cylinder(0.04, 0.12, 0.08, { segments: 8, at: [lx, ly + 0.2, lz], tones: 'iron' });
    b.box(0.13, 0.18, 0.13, { tones: 'glass', layer: 'glass', glow: lamp, glowKind: 2, at: [lx, ly + 0.02, lz] });
    b.box(0.18, 0.04, 0.18, { tones: 'iron', at: [lx, ly - 0.02, lz] });
  }

  // ------------------------------------------------------------------ ground dressing: ferns, toadstools, herb pots
  const fern = (fx, fz, s = 1) => {          // 7 arching fronds (flat blades: up to a crest, then drooping to the tip)
    for (let i = 0; i < 8; i++) {
      const az = D(-157.5 + i * 45), len = (0.46 + (i % 3) * 0.06) * s;
      const [sx, sz] = dir(az);
      const p0 = V3(fx, 0.1 * s, fz), p1 = V3(fx + sx * len * 0.45, (0.2 + (i % 2) * 0.05) * s, fz + sz * len * 0.45);
      const p2 = V3(fx + sx * len, 0.06, fz + sz * len);
      const o = { tones: 'leaf', layer: 'soft', tint: i % 2 ? 0.96 : 1.04 };
      blade(b, p0, p1, 0.12 * s, 0.22 * s, o, 0.05);
      blade(b, p1, p2, 0.22 * s, 0.08, o, 0.05);
    }
    b.cylinder(0.16 * s, 0.1 * s, 0.2 * s, { segments: 8, at: [fx, -0.02, fz], tones: 'leaf', layer: 'soft', tint: 0.94 });
  };
  fern(-1.72, 0.95, 1.0);
  fern(-1.95, -0.55, 0.9);
  fern(1.62, -1.05, 1.0);
  fern(0.55, 1.78, 0.85);
  const toad = (tx, tz, h, cr) => {
    b.cylinder(0.05, 0.045, h, { segments: 8, at: [tx, -0.02, tz], tones: 'plaster' });
    b.cylinder(cr, 0.03, cr * 0.75, { segments: 8, at: [tx, h - 0.04, tz], tones: TOWN_PALETTE.toadstool });
    b.box(0.06, 0.05, 0.06, { tones: 'cream', at: [tx - cr * 0.3, h + cr * 0.32 - 0.04, tz + cr * 0.25] });
  };
  toad(-0.95, 1.62, 0.26, 0.16);
  toad(-0.62, 1.82, 0.18, 0.12);
  toad(-1.28, 1.42, 0.14, 0.1);
  toad(1.98, -0.25, 0.22, 0.14);
  toad(1.75, -0.48, 0.15, 0.1);
  for (const [hx, hz, s] of [[1.92, 0.5, 1], [1.28, 1.62, 0.85]]) {               // herb pots flanking the door path
    b.cylinder(0.15 * s, 0.11 * s, 0.24 * s, { segments: 8, at: [hx, -0.02, hz], tones: 'brick' });
    b.box(0.24 * s, 0.12 * s, 0.22 * s, { tones: 'leaf', layer: 'soft', at: [hx, 0.2 * s, hz] });
    b.box(0.1 * s, 0.1 * s, 0.1 * s, { tones: TOWN_PALETTE.flowerViolet, layer: 'soft', at: [hx - 0.04, 0.3 * s, hz + 0.04] });
  }

  // ------------------------------------------------------------------ assemble
  const group = b.build();
  group.add(rb.build({ castShadow: false }));
  const vane = vb.build({ castShadow: false });
  vane.position.copy(vanePos);
  group.add(vane);
  // the wind veers the vane in 45 deg stops (a pure function of t: one stop per ~3.2 s gust)
  const VEER = [0, 0, 1, 1, 2, 1, 0, -1, -1, 0, 1, 0, -1, -2, -1, 0];
  const setVane = (t) => { vane.rotation.y = VEER[Math.floor(Math.max(0, t) / 3.2) % VEER.length] * (Math.PI / 4); };
  setVane(0);
  // the crown: 13 leaf-sprite clumps (trees.js bushes, spring oak greens + new-growth tips) merged into 2 meshes
  // spring greens (the trees.js / research foliage 'bush' ramp: fresh yellow-green hi, new-growth tips)
  const crownPal = { hi: '#8CB04C', mid: '#6A9450', sh: '#46705A', core: '#2C4E46', tip: '#B6CE68' };
  // low tier: the same 13 clumps / silhouette, but the Poisson leaf spacing opens from 4.2 to 6.2 texels
  // (leaf count ~ 1 / spacing^2: ~0.46x the sprites, i.e. ~15.7k -> ~7k crown-leaf tris)
  const { meshes: crownMeshes, nLeaves } = leafClumps(engine, CLUMPS, crownPal, ctx.quality === 'low' ? 7.8 : 6.0);
  for (const m of crownMeshes) group.add(m);

  // the front door leaf (own mesh): right hinge, swings OUTWARD (the trunk is solid behind it)
  const hinge = r.persona?.hinge ?? 'right';
  const leaf = kitDoor(engine, { w: DOOR.w, h: DOOR.h, kind: 'arched', tones: doorRamp, hinge, name: `${r.id}-door` });
  const holder = new THREE.Group();
  holder.applyMatrix4(radial(DOOR.az, DOOR.r, 0));
  const hs = hinge === 'right' ? 1 : -1;
  leaf.pivot.position.set((hs * DOOR.w) / 2, 0.1, DOOR.leafZ);      // lifted: the glow sliver shows under it
  leaf.pivot.scale.y = (DOOR.h - 0.1) / DOOR.h;
  holder.add(leaf.pivot);
  group.add(holder);
  const open = (f) => { leaf.pivot.rotation.y = hs * Math.max(0, Math.min(1, f)) * 1.6; };

  group.position.set(T.x, 0, T.z);
  group.updateMatrixWorld(true);
  const W3 = (v) => toWorld(group, v);
  const winW = windows.map(W3);
  const [dx, dz] = dir(DOOR.az), [kx, kz] = dir(KNOT.az);
  const kr = trunkR(KNOT.y) + 0.05;
  return {
    group,
    anchors: {
      doors: [{ id: `${r.id}-door`, pivot: leaf.pivot, open }],
      chimneys: [W3(smoke)],
      windows: winW.map((pos, i) => ({ id: `${r.id}-win${i}`, pos })),
      lights: [...lights.map((l) => ({ ...l, pos: W3(l.pos) })), { pos: winW[0], color: glow, r: 1.6, kind: 'window' }, { pos: winW[1], color: glow, r: 0.9, kind: 'window' }],
      perches: [W3(vanePerch), W3(V3(CAB.x, CAB.ridge + 0.12, CAB.z - CAB.d / 2)), W3(V3(-1.2, DECK.y + DECK.th + DECK.railH + 0.07, DECK.z1 - 0.05)), W3(V3(kx * kr, KNOT.y - 0.1, kz * kr))],
      seats: [W3(V3(0.6, DECK.y + DECK.th, DECK.z1 - 0.25))],
      spots: {
        doorstep: W3(V3(dx * (DOOR.r + DOOR.z1 + 0.9), 0.05, dz * (DOOR.r + DOOR.z1 + 0.9))),
        balcony: W3(V3(-0.6, DECK.y + DECK.th, DECK.z1 - 0.3)),
        knothole: W3(V3(kx * kr, KNOT.y, kz * kr)),
        stairFoot: W3(V3(Math.sin(D(-24)) * 2.0, 0.05, Math.cos(D(-24)) * 2.0)),
      },
    },
    api: {
      setDoor: (f) => open(f),
      setVane,
      fadeTargets: () => crownMeshes,
      setLit: (on) => group.traverse((o) => o.userData.layer === 'glass' && ctx.kit.setGlowLit(o, on)),
    },
    update(t) { setVane(t); },
    stats: { crownLeaves: nLeaves },
  };
}
