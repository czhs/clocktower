// Town composer (owner: town foundation lead). Used by scenes/town.js, scenes/town-piece.js, scenes/town-life.js.
//
//   const town = await buildTown(engine, params, { pieces, strict, pad, padCenter, lights })
//     Builds the pieces in BUILD_ORDER (ground -> props -> houses + clocktower -> dais -> foliage -> life), each with
//     makeCtx(); adds every piece group to the scene, registers piece.update(t, dt), turns light anchors into
//     PointLights at night, sets the window glow and the post chain (grade, night mist).
//     Returns {registry, tod, preset}. The camera must already be set (applyCamera) - grass/trees read it.
//   params: tod=noon|morning|golden|night, clouds=0, life=0, doors=<0..1>, unlit=<ids>|all, lights=<max point lights, default 12>, vignette=<0..>
//           quality=high|low (low: 2048 shadow map, no cloud shadows, no night mist, 8 point lights)
//           cut=auto|0|1 (camera-aware cut-away, src/town/cutaway.js; auto = on at gameplay zooms), focus=<id>|x,z (what the cut protects),
//           cutSide=eave|strip|half|full (side-row focus cut box; houseBox)
//           lift=0|1 liftY=2 liftFrac=0.4 (roof-off of the cottage the focus window bites into), doorFocus=0|1 (player at a door
//           protects that cottage)
//   clouds: false -> no cloud shadows (turntables); pieces: ids to include (null = all); pad: true -> a neutral flat ground pad instead of the ground piece
//   strict: id | 'all' -> that piece's import/build errors are page errors (others fall back to a placeholder box)
//   cut: false -> no cut-away (turntables)
// LAYOUT DELTAS (layout.js LAYOUT_DELTAS, docs/TOWN.md §12): a placed piece's group is wrapped in a '<id>-placed' group
//   (rotation about the game footprint centre + offset); its world-space anchors (Vector3s), anything it added to the
//   scene directly and its world-attribute grass sprites are moved with it. Pieces never see the delta.
import * as THREE from 'three';
import { toonMesh, rampFromTones } from '../materials/toon.js';
import { addGrade } from '../post/grade.js';
import { addFog } from '../post/fog.js';
import { configureShadows } from '../world/sky.js';
import { PIECE_IDS, Registry, makeCtx, buildPiece, installLights, applyTownTime } from './api.js';
import { TOWN_PALETTE } from './palette.js';
import * as layout from './layout.js';
import { installCutaway, pieceTag, sectionMaterial } from './cutaway.js';
import { addContact } from './contact.js';

// Sub-texel anti-tie nudge of the whole town (metres). The texel grid is anchored at the world origin (gameplay
// texel = 1/30 m, pixel centres at odd multiples of 1/60 m), so round authoring values (0.05, 0.15, 0.35 ...)
// put vertices exactly on pixel centres: rasterisation ties that flip under a whole-texel pan (crawl). Offsetting
// all content by a non-lattice amount removes the ties at every zoom. Authors never compensate for it.
export const ANTI_TIE = new THREE.Vector3(0.0047, 0, 0.0071);

export const BUILD_ORDER = ['ground', 'props', ...PIECE_IDS.filter((id) => id.startsWith('house-')), 'clocktower', 'dais', 'foliage', 'life'];

/** Neutral flat ground pad (grass ramp, no texture) for isolated pieces. */
export function groundPad(engine, center, size = 90) {
  const g = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
  const m = toonMesh(engine, g, { ...rampFromTones(...TOWN_PALETTE.grass), outline: 'full' });
  m.position.set(center.x, 0, center.z);
  m.name = 'ground-pad';
  m.castShadow = false;
  return { group: m, anchors: {}, api: { heightAt: () => 0 }, stats: { pad: 1 } };
}

/** Placement matrix of a piece (layout.LAYOUT_DELTAS), or null for an unmoved piece. */
export function placementMatrix(id) {
  const pl = layout.placement(id);
  if (!pl.ry && !pl.dx && !pl.dz) return null;   // no delta, or a door-only delta
  const c = Math.cos(pl.ry), s = Math.sin(pl.ry);
  const rx = pl.pivot.x * c + pl.pivot.z * s, rz = -pl.pivot.x * s + pl.pivot.z * c;
  const m = new THREE.Matrix4().makeRotationY(pl.ry);
  m.setPosition(pl.pivot.x + pl.dx - rx, 0, pl.pivot.z + pl.dz - rz);
  return m;
}

/** Move a piece's world-space anchors by matrix m (Vector3s once each; door normal/point extras too). */
function placeAnchors(anchors, m) {
  const seen = new Set();
  const rot = new THREE.Matrix3().setFromMatrix4(m);
  const mv = (v) => { if (!seen.has(v)) { seen.add(v); v.applyMatrix4(m); } };
  const walk = (v, depth) => {
    if (!v || depth > 4 || typeof v !== 'object' || v.isObject3D || seen.has(v)) return;
    if (v.isVector3) return mv(v);
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    seen.add(v);
    for (const [k, x] of Object.entries(v)) {
      if (k === 'normal' && Array.isArray(x) && x.length === 2) { const n = new THREE.Vector3(x[0], 0, x[1]).applyMatrix3(rot); x[0] = n.x; x[1] = n.z; continue; }
      if (k === 'point' && x && !x.isVector3 && typeof x.x === 'number' && typeof x.z === 'number') { const q = new THREE.Vector3(x.x, 0, x.z).applyMatrix4(m); x.x = q.x; x.z = q.z; continue; }
      walk(x, depth + 1);
    }
  };
  walk(anchors, 0);
}

/** Grass sprites (src/world/grass.js) read their WORLD root from the aBase attribute and ignore modelMatrix: bake m in,
 *  and again whenever grass.js re-fills the attribute (it re-sorts on a camera turn). */
function placeWorldSprites(engine, group, m) {
  const rot = new THREE.Matrix3().setFromMatrix4(m), v = new THREE.Vector3();
  const list = [];
  group.traverse((o) => { const g = o.geometry; if (g?.attributes?.aBase && g.attributes.aBaseN) list.push(g); });
  const apply = (g) => {
    const B = g.attributes.aBase, N = g.attributes.aBaseN;
    for (let i = 0; i < B.count; i++) {
      v.fromBufferAttribute(B, i).applyMatrix4(m); B.setXYZ(i, v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(rot); N.setXYZ(i, v.x, v.y, v.z);
    }
    B.needsUpdate = true; N.needsUpdate = true;
    g.userData.placedVersion = B.version;
  };
  for (const g of list) apply(g);
  if (list.length) engine.onUpdate(() => { for (const g of list) if (g.attributes.aBase.version !== g.userData.placedVersion) apply(g); });
  return list.length;
}

/** Protected (oriented) box of a placed house.
 *  South-facing / corner cottages: the game footprint + 0.35 m + the door apron / door tile, y 0..top (the whole cottage).
 *  Side-row cottages (game doors in an east / west wall, stacked in z at yaw 0): side 'eave' (default) = the same box up
 *  to 3.2 m, so the neighbour in front loses only what hides the cottage's walls, door and gable foot ('strip' / 'half' /
 *  'full' for A/B). The apron follows the REAL door (layout.js LAYOUT_DELTAS door overrides: chamfers, porches). */
export function houseBox(rec, top, side = 'eave', e = 0.35) {
  const g = rec.game ?? rec, f = g.footprint;
  const gd = rec.gameDoor ?? layout.gameDoorOf(g), p = gd.point, [nx, nz] = gd.normal;
  let x0 = f.x - e, x1 = f.x + f.w + e, z0 = f.z - e, z1 = f.z + f.d + e, y1 = top;
  const ax = p.x + nx * 1.4, az = p.z + nz * 1.4;          // the doorstep + the door tile in front of the real door
  if (side !== 'full' && (g.facing === 'east' || g.facing === 'west')) {
    if (side === 'eave') y1 = Math.min(top, 3.2);
    else {
      // 'strip' = the game door wall strip (0.6 m inside the wall .. the door tile) up to 2.6 m; 'half' = wall .. ridge line
      const gx = g.doorPoint.x, gn = g.doorNormal[0], inner = side === 'half' ? f.w / 2 : 0.6;
      x0 = Math.min(gx - gn * inner, gx + gn * 2.0); x1 = Math.max(gx - gn * inner, gx + gn * 2.0);
      if (side === 'strip') y1 = Math.min(top, 2.6);
    }
  }
  x0 = Math.min(x0, ax - 0.6); x1 = Math.max(x1, ax + 0.6); z0 = Math.min(z0, az - 0.6); z1 = Math.max(z1, az + 0.6);
  const c = layout.placePoint(rec.id, (x0 + x1) / 2, (z0 + z1) / 2);
  return { center: [c.x, c.z], half: [(x1 - x0) / 2, (z1 - z0) / 2], y: [0.03, y1], ry: layout.placement(rec.id).ry };
}

/** Does the ray from P along dir (the camera's forward) pass through the oriented box {center, half, y, ry}? */
export function rayHitsBox(P, dir, b) {
  const c = Math.cos(b.ry ?? 0), s = Math.sin(b.ry ?? 0), dx = P.x - b.center[0], dz = P.z - b.center[1];
  const L = [dx * c - dz * s, P.y, dx * s + dz * c];
  const F = [dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c].map((v) => Math.sign(v || 1) * Math.max(Math.abs(v), 1e-5));
  const lo = [-b.half[0], b.y[0], -b.half[1]], hi = [b.half[0], b.y[1], b.half[1]];
  let tN = -Infinity, tF = Infinity;
  for (let k = 0; k < 3; k++) {
    const a = (lo[k] - L[k]) / F[k], e = (hi[k] - L[k]) / F[k];
    tN = Math.max(tN, Math.min(a, e)); tF = Math.min(tF, Math.max(a, e));
  }
  return tF > Math.max(tN, 0);
}

/** Area-weighted share of a group's (opaque, non-instanced) surface with y in [y0, y1] whose view ray hits box b. */
function groundHides(group, b, dir, y0, y1) {
  if (!group) return { fr: 0, area: 0 };
  let tot = 0, hit = 0;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), M = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  group.updateWorldMatrix(true, true);
  group.traverse((o) => {
    const g = o.geometry;
    if (!o.isMesh || o.isInstancedMesh || g?.isInstancedBufferGeometry || o.material?.transparent || !g?.attributes?.position) return;
    const P = g.attributes.position, I = g.index, n = I ? I.count / 3 : P.count / 3, step = Math.max(1, Math.floor(n / 4000));
    const at = (k) => (I ? I.getX(k) : k);
    for (let t = 0; t < n; t += step) {
      A.fromBufferAttribute(P, at(3 * t)).applyMatrix4(o.matrixWorld);
      B.fromBufferAttribute(P, at(3 * t + 1)).applyMatrix4(o.matrixWorld);
      C.fromBufferAttribute(P, at(3 * t + 2)).applyMatrix4(o.matrixWorld);
      M.copy(A).add(B).add(C).multiplyScalar(1 / 3);
      if (M.y < y0 || M.y > y1) continue;
      const area = e1.subVectors(B, A).cross(e2.subVectors(C, A)).length() / 2;
      tot += area;
      if (rayHitsBox(M, dir, b)) hit += area;
    }
  });
  return { fr: tot > 0 ? hit / tot : 0, area: hit };
}

/** Door-approach zone test (the player stands in front of a cottage): a box from the door wall out along the door
 *  normal 0..DEPTH m and +-HALF m sideways, for the REAL door and - side rows - also along the game door's lane
 *  direction (the side lanes run out of the game door wall). Returns the distance along the normal, or null. */
export const DOOR_ZONE = { depth: 5.5, half: 2.5 };
export function doorZone(rec, x, z) {
  const pts = [[rec.doorPoint, rec.doorNormal]];
  const g = rec.game ?? rec;
  if (g.facing === 'east' || g.facing === 'west') {
    const gp = layout.placePoint(rec.id, g.doorPoint.x, g.doorPoint.z), gn = layout.placeDir(rec.id, g.doorNormal);
    pts.push([gp, gn]);
  }
  let best = null;
  for (const [p, [nx, nz]] of pts) {
    const dx = x - p.x, dz = z - p.z, s = dx * nx + dz * nz, lat = Math.abs(-dx * nz + dz * nx);
    if (s > -0.3 && s < DOOR_ZONE.depth && lat < DOOR_ZONE.half) best = Math.min(best ?? Infinity, Math.max(0, s) + lat * 0.5);
  }
  return best;
}

/** Part attribute (cutaway.js PART_GLSL) for a non-kit mesh: connected components (shared indices + welded positions),
 *  each vertex gets its component's centroid and 2 + lowest y (mesh-local). Kit meshes carry it from the Builder. */
export function addPartAttribute(mesh) {
  const g = mesh.geometry;
  if (!g || g.attributes.aTownPart || mesh.isInstancedMesh || g.isInstancedBufferGeometry) return false;
  const P = g.attributes.position, n = P.count;
  if (!P || n === 0 || n > 400000) return false;
  const par = new Int32Array(n); for (let i = 0; i < n; i++) par[i] = i;
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
  const I = g.index;
  if (I) for (let t = 0; t < I.count; t += 3) { uni(I.getX(t), I.getX(t + 1)); uni(I.getX(t), I.getX(t + 2)); }
  else for (let t = 0; t + 2 < n; t += 3) { uni(t, t + 1); uni(t, t + 2); }
  const weld = new Map(), q = (v) => Math.round(v * 2000);
  for (let i = 0; i < n; i++) {
    const k = `${q(P.getX(i))},${q(P.getY(i))},${q(P.getZ(i))}`, o = weld.get(k);
    if (o === undefined) weld.set(k, i); else uni(o, i);
  }
  const acc = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i); let a = acc.get(r);
    if (!a) acc.set(r, (a = [0, 0, 0, 0, Infinity, Infinity, -Infinity, Infinity, -Infinity]));
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    a[0] += x; a[1] += y; a[2] += z; a[3]++; a[4] = Math.min(a[4], y);
    a[5] = Math.min(a[5], x); a[6] = Math.max(a[6], x); a[7] = Math.min(a[7], z); a[8] = Math.max(a[8], z);
  }
  const arr = new Float32Array(n * 4), sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = acc.get(find(i));
    arr.set([a[0] / a[3], a[1] / a[3], a[2] / a[3], 2 + a[4]], i * 4);
    sz[i] = Math.max(a[6] - a[5], a[8] - a[7]);
  }
  g.setAttribute('aTownPart', new THREE.BufferAttribute(arr, 4));
  g.setAttribute('aTownPartS', new THREE.BufferAttribute(sz, 1));
  return true;
}

/** Shadow-caster culling (both tiers): a mesh casts only when its bounds OR its shadow on the ground (bounds projected
 *  along the sun onto y = 0) overlap the view (+ margin). Pieces outside the view whose shadow cannot reach it skip the
 *  shadow pass (the shadow box is ~1.7-2 view heights, much larger than the view). Static meshes only (bounds once). */
export function installShadowCull(engine, registry, { margin = 1.5, skip = ['ground', 'life'] } = {}) {
  const items = [], b = new THREE.Box3();
  for (const p of registry.all()) {
    if (skip.includes(p.id)) continue;
    p.group?.traverse((o) => {
      if (!o.isMesh || !o.castShadow || o.isInstancedMesh || o.geometry?.isInstancedBufferGeometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      o.updateWorldMatrix(true, false);
      b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      if (b.isEmpty() || !Number.isFinite(b.min.x)) return;
      items.push({ o, min: b.min.clone(), max: b.max.clone() });
    });
  }
  const R = new THREE.Vector3(), U = new THREE.Vector3(), F = new THREE.Vector3(), p = new THREE.Vector3(), sd = new THREE.Vector3();
  let culled = 0;
  const run = () => {
    const c = engine.camera, t = c.target, vh = c.viewHeight, aspect = (engine.pipeline?.size ? engine.pipeline.size.x / engine.pipeline.size.y : 16 / 9);
    R.set(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    F.set(-Math.cos(c.pitch) * Math.sin(c.yaw), -Math.sin(c.pitch), -Math.cos(c.pitch) * Math.cos(c.yaw));
    U.crossVectors(R, F).normalize();
    sd.copy(engine.uniforms.uSunDir.value).normalize();
    const k = Math.max(sd.y, 0.05);
    const hx = (vh * aspect) / 2 + margin, hy = vh / 2 + margin, tx = t.dot(R), ty = t.dot(U);
    culled = 0;
    for (const it of items) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < 16; i++) {
        p.set(i & 1 ? it.max.x : it.min.x, i & 2 ? it.max.y : it.min.y, i & 4 ? it.max.z : it.min.z);
        if (i & 8) p.addScaledVector(sd, -Math.max(p.y, 0) / k);        // where this corner's shadow meets the ground
        const sx = p.dot(R) - tx, sy = p.dot(U) - ty;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      const vis = x1 > -hx && x0 < hx && y1 > -hy && y0 < hy;
      it.o.castShadow = vis;
      if (!vis) culled++;
    }
    engine.stats.shadowCull = { meshes: items.length, culled };
  };
  run();
  engine.onUpdate(run);
  return { items, run };
}

export async function buildTown(engine, params, opts = {}) {
  const { pieces = null, strict = null, pad = false, padCenter = engine.camera.target, clouds = true, cut = true } = opts;
  const P = (k, d) => params.get(k) ?? d;
  const tod = P('tod', 'noon');
  const quality = P('quality', 'high') === 'low' ? 'low' : 'high';
  const num = (k) => (params.has(k) && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : null);
  const preset = applyTownTime(engine, tod, { clouds: clouds && P('clouds', '1') !== '0' && quality === 'high', relAz: num('relAz'), elev: num('elev') });
  if (quality === 'low') configureShadows(engine, { extent: Math.max(12, Math.min(28, engine.camera.viewHeight * 1.7)), mapSize: 2048 });
  const registry = new Registry();
  const want = new Set(pieces ?? BUILD_ORDER);
  if (P('life', '1') === '0') want.delete('life');
  const stats = engine.stats;
  stats.pieces = {};
  stats.quality = quality;
  const t0 = performance.now();
  const root = new THREE.Group();
  root.name = 'town';
  root.position.copy(ANTI_TIE);
  engine.scene.add(root);

  if (pad && !want.has('ground')) {
    const p = groundPad(engine, padCenter);
    root.add(p.group);
    registry.add('ground', p);
  }
  const placed = {};
  for (const id of BUILD_ORDER) {
    if (!want.has(id)) continue;
    const ctx = makeCtx(engine, id, { registry, tod: preset.name, params, isolated: !!pieces });
    const before = new Set(engine.scene.children);
    const piece = await buildPiece(engine, id, ctx, { strict: strict === id || strict === 'all' });
    const m = placementMatrix(id);
    if (m) {
      // layout delta: wrap the group, move what the piece added to the scene itself, its anchors and world sprites
      const holder = new THREE.Group();
      holder.name = `${id}-placed`;
      holder.matrixAutoUpdate = false;
      holder.matrix.copy(m);
      holder.add(piece.group);
      for (const o of engine.scene.children.slice()) if (!before.has(o) && o !== root && !o.isLight) holder.add(o);
      placeAnchors(piece.anchors, m);
      const ns = placeWorldSprites(engine, holder, m);
      root.add(holder);
      holder.updateMatrixWorld(true);
      placed[id] = { ry: +layout.placement(id).ry.toFixed(4), dx: layout.placement(id).dx, dz: layout.placement(id).dz, sprites: ns };
    } else root.add(piece.group);
    if (typeof piece.update === 'function') engine.onUpdate((t, dt) => piece.update(t, dt));
    registry.add(id, piece);
    stats.pieces[id] = [piece.stats.calls, piece.stats.tris, piece.stats.buildMs, piece.stats.failed ? 'FAILED' : piece.stats.stub ? 'stub' : 'ok'];
  }
  stats.townBuildMs = Math.round(performance.now() - t0);
  if (quality === 'low') {
    // low tier: the terrain (one big grid, flat inside the town) only RECEIVES the sun shadow - its own casting is the
    // rolling rim beyond the map, invisible at gameplay zooms - so the shadow pass skips its triangles
    const tr = registry.get('ground')?.api?.terrain;
    for (const tm of tr?.tiles ?? (tr?.mesh ? [tr.mesh] : [])) tm.castShadow = false;
    // ... and small soft dressing (thatch bundles, flowers, ivy, turf grass, roof moss clumps, wares) only receives:
    // its shadow is a few texels on the wall behind it, not worth a second pass of its triangles on an iGPU
    let soft = 0;
    for (const p of registry.all()) {
      if (p.id === 'foliage' || p.id === 'ground' || p.id === 'life') continue;
      p.group?.traverse((o) => {
        if (o.isMesh && o.castShadow && /-(soft|turf-grass|moss-clump-core|clump-leaves|wares-solid|fx)$/.test(o.name)) { o.castShadow = false; soft++; }
      });
    }
    if (tr) stats.lowTier = { terrainCast: 0, softNoCast: soft };
  }
  if (Object.keys(placed).length) stats.placed = placed;
  // the layout's real doors (LAYOUT_DELTAS door overrides, placed) must match the pieces' door anchors (point / normal):
  // a mismatch > 0.3 m / 15 deg means an owner moved a door - update layout.js (stats.doorMismatch lists them)
  {
    const bad = [];
    for (const d of registry.anchors('doors')) {
      const rec = layout.houses.find((h) => h.id === d.piece);
      if (!rec || !d.point || !d.normal) continue;
      const dp = Math.hypot(d.point.x - rec.doorPoint.x, d.point.z - rec.doorPoint.z);
      const dn = Math.acos(Math.max(-1, Math.min(1, d.normal[0] * rec.doorNormal[0] + d.normal[1] * rec.doorNormal[1]))) * 180 / Math.PI;
      if (dp > 0.3 || dn > 15) bad.push([d.piece, +dp.toFixed(2), Math.round(dn)]);
    }
    if (bad.length) stats.doorMismatch = bad;
  }
  // ?doorDump=1: every door anchor's world point / normal (layout.js LAYOUT_DELTAS doors must match the pieces' real doors)
  if (P('doorDump', '0') === '1') {
    stats.doorAnchors = registry.anchors('doors').map((d) => {
      const w = d.pivot?.getWorldPosition?.(new THREE.Vector3());
      return [d.piece, d.point ? [+d.point.x.toFixed(3), +d.point.z.toFixed(3)] : null, d.normal ? d.normal.map((v) => +v.toFixed(3)) : null, w ? [+w.x.toFixed(2), +w.z.toFixed(2)] : null];
    });
  }

  // ?occl=1: per cottage, the nearest ground line its geometry hides at the gameplay pitch (30 deg): min over world vertices
  // of z - y * cot(30 deg), with the x range of the vertices within 0.3 m of it (layout check: house-9 vs the plaza kerb)
  if (P('occl', '0') === '1') {
    root.updateMatrixWorld(true);
    const v = new THREE.Vector3(), m = new THREE.Matrix4(), mi = new THREE.Matrix4(), K = Math.sqrt(3);
    stats.occl = {};
    for (const h of layout.houses) {
      const g = registry.get(h.id)?.group;
      if (!g) continue;
      let best = Infinity; const pts = [];
      g.traverse((o) => {
        const pos = o.isMesh || o.isPoints ? o.geometry?.attributes?.position : null;
        if (!pos || o.visible === false) return;
        const n = o.isInstancedMesh ? o.count : 1;
        for (let k = 0; k < n; k++) {
          m.copy(o.matrixWorld);
          if (o.isInstancedMesh) { o.getMatrixAt(k, mi); m.multiply(mi); }
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(m);
            const e = v.z - v.y * K;
            if (e < best + 0.3) pts.push([e, v.x]);
            if (e < best) best = e;
          }
        }
      });
      const near = pts.filter((p) => p[0] < best + 0.3).map((p) => p[1]);
      stats.occl[h.id] = [+best.toFixed(2), +Math.min(...near).toFixed(2), +Math.max(...near).toFixed(2)];
    }
  }
  // ?treeDump=x0,z0,x1,z1: the foliage piece's trees in a rect (layout review)
  if (params.has('treeDump')) {
    const [x0, z0, x1, z1] = P('treeDump', '').split(',').map(Number);
    stats.treeDump = (registry.get('foliage')?.api?.trees ?? []).filter((t) => t.x > x0 && t.x < x1 && t.z > z0 && t.z < z1)
      .map((t) => [+t.x.toFixed(2), +t.z.toFixed(2), +t.top.toFixed(2), t.kind]);
  }
  // ?vis=1: what the gameplay camera (yaw 0, pitch 30 deg) sees of every cottage WITHOUT the cut-away - geometric rays
  // toward the camera against every other piece's meshes (houses, tower, props, dais; not the floor / foliage / life).
  // stats.vis[id] = [door fraction visible (9 rays: 3 heights x 3 offsets at the real door), body fraction visible
  // (<= 160 of its own vertices), {blocker: rays}]
  if (P('vis', '0') === '1') {
    root.updateMatrixWorld(true);
    const dir = new THREE.Vector3(0, 0.5, Math.sqrt(3) / 2);
    const rc = new THREE.Raycaster(); rc.far = 80;
    const meshesOf = (id) => { const out = []; registry.get(id)?.group?.traverse((o) => { if (o.isMesh && o.visible !== false && !o.material?.transparent) out.push(o); }); return out; };
    const all = {};
    for (const p of registry.all()) if (!['ground', 'foliage', 'life'].includes(p.id)) all[p.id] = meshesOf(p.id);
    const v = new THREE.Vector3(), m = new THREE.Matrix4(), mi = new THREE.Matrix4();
    stats.vis = {};
    for (const h of layout.houses) {
      const others = Object.entries(all).filter(([id]) => id !== h.id).flatMap(([, l]) => l);
      const who = {};
      const seen = (p) => {
        rc.set(p, dir);
        const hit = rc.intersectObjects(others, false)[0];
        if (!hit) return 1;
        const id = Object.keys(all).find((k) => all[k].includes(hit.object)) ?? '?';
        who[id] = (who[id] ?? 0) + 1;
        return 0;
      };
      const [nx, nz] = h.doorNormal, tx = -nz, tz = nx;
      let dv = 0;
      for (const y of [0.3, 1.0, 1.7]) for (const s of [-0.35, 0, 0.35]) dv += seen(new THREE.Vector3(h.doorPoint.x + nx * 0.2 + tx * s, y, h.doorPoint.z + nz * 0.2 + tz * s));
      const verts = [];
      for (const o of all[h.id] ?? []) {
        const pos = o.geometry.attributes.position, n = o.isInstancedMesh ? Math.min(o.count, 4) : 1;
        for (let k = 0; k < n; k++) {
          m.copy(o.matrixWorld); if (o.isInstancedMesh) { o.getMatrixAt(k, mi); m.multiply(mi); }
          for (let i = 0; i < pos.count; i += 7) { v.fromBufferAttribute(pos, i).applyMatrix4(m); if (v.y > 0.1) verts.push(v.clone()); }
        }
      }
      const step = Math.max(1, Math.floor(verts.length / 160));
      let bv = 0, bn = 0;
      for (let i = 0; i < verts.length; i += step) { bn++; bv += seen(verts[i].addScaledVector(dir, 0.03)); }
      stats.vis[h.id] = [+(dv / 9).toFixed(2), +(bv / Math.max(1, bn)).toFixed(2), who];
    }
  }

  // debug / review hooks: ?doors=<0..1> opens every door anchor, ?unlit=<ids>|all calls api.setLit(false)
  if (params.has('doors')) for (const d of registry.anchors('doors')) d.open?.(Number(P('doors', 1)));
  const unlit = new Set();
  if (params.has('unlit')) {
    const u = P('unlit', 'all');
    for (const p of registry.all()) if ((u === 'all' || u.split(',').includes(p.id)) && p.api?.setLit) { p.api.setLit(false); unlit.add(p.id); }
  }
  const focusId = P('focus', null);
  const lights = installLights(engine, registry, {
    enabled: preset.lights, max: Number(P('lights', quality === 'low' ? 8 : 12)),
    // golden hour is daylight: only fire anchors (braziers, forges) cast a pool; lamps / lanterns / windows stay at
    // their emissive glass (preset.lightKinds), dark (unlit) pieces contribute no lights at all
    skip: (a) => unlit.has(a.piece) || (preset.lightKinds && !preset.lightKinds.includes(a.kind)),
    focus: focusId && registry.get(focusId) ? focusId : null,
  });
  registry.lights = lights;
  // golden hour is daylight: the props' baked lamp pools follow the lamps' night glow, not the (absent) PointLights -
  // switch them off through the props API (night keeps them, dithered by the cut-away patch)
  if (preset.lightKinds && !preset.lightKinds.includes('lamp')) {
    const pr = registry.get('props')?.api;
    if (pr?.setLampPool) (pr.lamps ?? []).forEach((_, i) => pr.setLampPool(i, 0));
  }

  // foliage-only ramp multipliers (TOWN_TOD veg, applied by the cut-away patch): canopies stay spring green at golden /
  // afternoon instead of following the amber ramp into autumn gold / teal-black
  registry.get('foliage')?.group?.traverse((o) => {
    for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) if (m?.userData?.toon) m.userData.townVeg = true;
  });
  // aTownPiece tag on every cottage / tower mesh (cutaway.js: the keep box keeps only the focused piece's own fragments)
  for (const p of registry.all()) {
    const tag = pieceTag(p.id);
    if (!tag) continue;
    p.group?.traverse((o) => {
      const g = o.geometry;
      if (!o.isMesh || !g?.attributes?.position || g.attributes.aTownPiece) return;
      g.setAttribute('aTownPiece', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(tag), 1));
    });
  }
  // shadow-caster culling (both tiers; ?shadowCull=0 = off for A/B)
  if (P('shadowCull', '1') !== '0') installShadowCull(engine, registry);
  // contact darkening (src/town/contact.js): ground texels at the foot of walls, plinths, posts, crates, barrels
  if (P('contact', '1') !== '0') addContact(engine);

  // camera-aware cut-away (docs/TOWN.md §12): the voting circle when the camera is on the square, the focus otherwise
  const cutMode = P('cut', cut ? 'auto' : '0');
  const cutaway = installCutaway(engine, root, { mode: (o) => (o.userData?.pieceId === 'life' ? 'points' : undefined) });
  {
    const tg = engine.camera.target, vh = engine.camera.viewHeight;
    const on = cutMode === '1' || (cutMode === 'auto' && vh <= 20.5);   // gameplay zooms + the vote preset, not overview / iso
    // the voting circle is protected whenever its centre is well inside the view (ground depth +-vh, width +-vh*8/9)
    const onSquare = Math.abs(layout.CIRCLE.cz - tg.z - tg.y * 1.732) < 0.9 * vh && Math.abs(layout.CIRCLE.cx - tg.x) < 0.8 * vh;
    const circle = on && (onSquare || focusId === 'dais') ? { cx: layout.CIRCLE.cx, cz: layout.CIRCLE.cz, r: 6.9, top: 1.6 } : null;
    const boxes = [];
    let houseFocus = null;
    const protectHouse = (rec) => {
      const g = registry.get(rec.id)?.group;
      const top = g ? Math.min(12, new THREE.Box3().setFromObject(g).max.y + 0.3) : 7;
      const tp = Number.isFinite(top) ? top : 7;
      boxes.push(houseBox(rec, tp, P('cutSide', 'eave')));
      cutaway.setKeep(houseBox(rec, tp, 'full'), pieceTag(rec.id));   // the focused cottage itself is never cut (its roof over a smaller cut box)
      houseFocus = rec.id;
    };
    if (on && focusId) {
      const rec = layout.houses.find((h) => h.id === focusId);
      if (rec) protectHouse(rec);
      else if (/^-?[\d.]+,-?[\d.]+$/.test(focusId)) {
        const [x, z] = focusId.split(',').map(Number);
        boxes.push({ min: [x - 0.45, 0.03, z - 0.45], max: [x + 0.45, 1.8, z + 0.45] });   // the player
        // the player in a cottage's DOOR-APPROACH ZONE (doorZone: 0..5.5 m out along the door normal - and for side rows
        // also along the game door's lane - +-2.5 m sideways): that cottage is protected like a focused one (the game's
        // case: "every cottage + its door recognisable when the player stands in front of it", also a few metres out)
        let best = null, bd = Infinity;
        for (const h of layout.houses) {
          const d = doorZone(h, x, z);
          if (d !== null && d < bd) { bd = d; best = h; }
        }
        if (best && P('doorFocus', '1') !== '0') protectHouse(best);
      }
    }
    cutaway.setBoxes(boxes);
    cutaway.enabled = on && (boxes.length > 0 || onSquare || focusId === 'dais');
    // ROOF-OFF (object-aware cut, §12.2): a cottage that the focus window bites into loses its whole roof / upper storey
    // above LIFT_Y (a lift volume over its footprint + overhang) instead of keeping slivers of roof around the window -
    // the classic top-down "roof off the house in front" read; its walls keep the window cut + the section rim
    const lifts = [], liftInfo = {};
    if (cutaway.enabled && boxes.length && P('lift', '1') !== '0') {
      // LIFT_Y: the decision plane (a cottage whose volume above it is >= liftFrac cut is lifted); LIFT_LOW: where a
      // lifted cottage is then cut, uniformly (fix round 5: one clean cut ground storey instead of window-bitten walls)
      const LIFT_Y = Number(P('liftY', 2.0)), LIFT_LOW = Number(P('liftLow', 1.1)), LIFT_PAD = 1.2, v = new THREE.Vector3();
      const cam = engine.camera;
      const fwd = new THREE.Vector3(-Math.cos(cam.pitch) * Math.sin(cam.yaw), -Math.sin(cam.pitch), -Math.cos(cam.pitch) * Math.cos(cam.yaw));
      const frec = houseFocus && layout.houses.find((h) => h.id === houseFocus);
      const core = frec ? houseBox(frec, 3.2, 'full') : null;   // the focused cottage + margin + doorstep, up to 3.2 m
      for (const rec of layout.houses) {
        if (rec.id === houseFocus) continue;
        const g = rec.game ?? rec, f = g.footprint, pl = layout.placement(rec.id);
        const top = registry.get(rec.id)?.group ? new THREE.Box3().setFromObject(registry.get(rec.id).group).max.y : 6;
        if (!(top > LIFT_Y + 0.5)) continue;
        let n = 0, cut = 0;
        for (let i = 0; i < 6; i++) for (let k = 0; k < 6; k++) for (let j = 0; j < 4; j++) {
          const q = layout.placePoint(rec.id, f.x + (i + 0.5) * f.w / 6, f.z + (k + 0.5) * f.d / 6);
          v.set(q.x, LIFT_Y + (j + 0.5) * (top - LIFT_Y) / 4, q.z);
          n++; if (cutaway.isCut(v)) cut++;
        }
        const fr = cut / n;
        liftInfo[rec.id] = +fr.toFixed(2);
        if (fr < Number(P('liftFrac', 0.25))) continue;
        // its GROUND storey (LIFT_LOW..LIFT_Y): if any of it stands in front of the focused cottage (its real geometry,
        // area-weighted: >= liftGround m2 of surface whose view ray hits the focus box up to 3.2 m - the side-row
        // neighbour right in front, house-13 in front of the mill), the cottage is cut uniformly at LIFT_LOW, one clean
        // cut ground storey; when only its roof / cap hid the focus (house-7's toadstool cap at house-5) it is cut at
        // LIFT_Y and keeps its door and ground-floor windows
        const gh = core ? groundHides(registry.get(rec.id)?.group, core, fwd, LIFT_LOW, LIFT_Y) : { fr: 0, area: 0 };
        // (+13.7 mm: kit surfaces sit at round heights - a toadstool's gill disc at exactly 2.0 m - and a plane through them
        // splits their fragments by interpolation noise, which flips under a whole-texel pan)
        const y0 = (gh.area >= Number(P('liftGround', 0.2)) ? LIFT_LOW : LIFT_Y) + 0.0137;
        liftInfo[rec.id] = [+fr.toFixed(2), +gh.area.toFixed(2), +y0.toFixed(2)];
        const c = layout.placePoint(rec.id, f.x + f.w / 2, f.z + f.d / 2);
        // footprint + 1.2 m: overhangs, porches, gable-end chimney breasts and wall signs are inside the lift
        lifts.push({ fr, id: rec.id, box: { center: [c.x, c.z], half: [f.w / 2 + LIFT_PAD, f.d / 2 + LIFT_PAD], y: [y0, 40], ry: pl.ry, piece: pieceTag(rec.id) } });
      }
      lifts.sort((a, b) => b.fr - a.fr);
      const used = lifts.slice(0, 4);
      cutaway.setLifts(used.map((l) => l.box), { hi: LIFT_Y + 0.0137 });
      // whole-part roof-off: non-kit meshes of the lifted cottages get their connected-component part attribute; every
      // mesh of a lifted cottage gets a BackSide section-interior twin (no floating back-face-culled fragments)
      let parts = 0, sections = 0;
      for (const l of used) {
        const list = [];
        registry.get(l.id)?.group?.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.material?.userData?.toon && !o.material.transparent) list.push(o); });
        for (const o of list) {
          if (addPartAttribute(o)) parts++;
          // a double-sided mesh already draws its own back faces: a BackSide twin would be coplanar with them (z-fight
          // stripes that flip under a pan, the toadstool's gill disc) - it gets the part attribute but no twin
          if (o.material.side !== THREE.FrontSide) continue;
          const tw = new THREE.Mesh(o.geometry, sectionMaterial(engine, o));
          tw.name = `${o.name || 'mesh'}-section`; tw.castShadow = false; tw.receiveShadow = false; tw.frustumCulled = o.frustumCulled;
          o.add(tw); sections++;
        }
      }
      liftInfo.parts = parts; liftInfo.sections = sections;
    }
    // the circle is set AFTER the roof-off test: only the focus boxes decide which cottage loses its roof (house-9 keeps
    // its roof under the circle cut: its back slope is sliced at the seats' height, the gable front stays)
    if (circle) cutaway.setCircle(circle);
    stats.cut = cutaway.enabled ? { circle: onSquare || focusId === 'dais', house: houseFocus, boxes: boxes.length, lifts: cutaway.lifts, liftFr: liftInfo, mats: cutaway.patched } : 0;
  }
  registry.cutaway = cutaway;

  // post chain: grade always (vignette 0 for crawl diffs), a low mist at night (high quality)
  const vig = params.has('vignette') ? Number(params.get('vignette')) : undefined;
  if (preset.name === 'night') {
    if (quality === 'high') addFog(engine, { mistAmount: 0.22, mistDepth: 0.6, mistScale: 0.08, mistCover: 0.5, fogAmount: 0.15 });
    addGrade(engine, vig === undefined ? {} : { vignette: vig });
  } else {
    addGrade(engine, { saturation: 1.0, vignette: vig ?? 0.08 });
  }
  return { registry, tod: preset.name, preset, root, lights, cutaway, quality };
}
