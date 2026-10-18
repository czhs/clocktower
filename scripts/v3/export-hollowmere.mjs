#!/usr/bin/env node
// OWNED BY v3-world (WP5a, docs/v3/INTEGRATION.md §2.2). Exports the pixel3d town "Hollowmere" into the game's
// tile world: packages/assets/src/hollowmere/hollowmere.generated.json (the runtime data: layout + map) and
// hollowmere.meta.json (review data, vendorHash / generatorHash; tests and tools only), both committed, deterministic,
// sorted keys.
//
//   CT_AGENT=v3-world scripts/remote.sh node scripts/v3/export-hollowmere.mjs           # write the JSON
//   CT_AGENT=v3-world scripts/remote.sh node scripts/v3/export-hollowmere.mjs --check   # exit 1 if it is stale
//   ... --dump=x0,y0,x1,y1 (tile map with block reasons) · --canopies=block|walk (trial of the canopy rule, not committed)
//
// Plain Node 24. `v3/pixel3d/**` is a READ-ONLY vendor tree without node_modules: bare `three` /
// `three/addons/*` imports are mapped onto apps/client's single three@0.170.0 by an in-process resolve hook
// (the §1.3 step 2 rule). Everything runs headless: the layout is pure data, the outdoor walk shapes come from
// `src/demo/collision.js createCollision(null)` (no registry: doors = the layout's placed real doors), the
// interiors from `src/town/interiors/index.js buildInterior` and the occlusion data from the house / tower
// pieces (`src/town/api.js buildPiece`), all built against a stub engine (geometry only, no WebGL).
//
// Output (tiles / v2 px, y-down; metres are never stored): see §2.2 "Schema". Rules (§2.2, §2.3):
//   - outdoor tile blocked  <=> its FEET point (tx+.5, ty+.875) m lies inside a walk shape (house outlines minus the
//     door corridor, clocktower, back lane, dais, props, blocking ground), plus four derived rules (§2.2, §11 log):
//       (a) a solid prop whose shape covers no feet point at all also blocks the tile its centre lies in (a lamp post /
//           signpost / stump is thinner than the 0.375 m between a tile's centre and its feet point; the vendor's own
//           tile grid blocks it too),
//       (b) a tile where a character (feet and head) is HIDDEN from the gameplay camera (yaw 0, pitch 30 deg) behind a
//           cottage or the tower is blocked (social deduction: nobody may stand where nobody can see them), except a
//           door's only approach; tiles hidden only with tree canopies / soft dressing in the way are meta.hiddenSoft
//           (walkable, or blocked like walls when CANOPIES_BLOCK),
//       (c) walkable outdoor pockets the player spawn cannot reach are blocked (and interior floor the door cannot reach),
//       (d) a door tile blocked only by blocking ground / the map border (inside the vendor's carved door corridor) is
//           opened; elsewhere blocking ground always stays solid.
//   - interior band room R_i = {47 + (i%5)*13, 1 + floor(i/5)*14, 12, 12}; translation-only map with the doorway
//     centre on the doorway tile D_i = (R.x+6, R.y+11); a tile is free iff its feet point maps inside the 3D floor
//     and outside every furniture collider.
//   - the CLOCK TOWER is enterable (vendor pass B, src/demo/tower-interior.js buildTowerRoom; user request 2026-10-17):
//     the 16th building (after house-0..14), nobody's home (houseIndex null, no bed), in a 6th band column
//     R = {112, 1, 12, 12} (map width 125). Same translation-only map, anchored on the room's 3D EXIT spot (the
//     doorway tile's centre); its stair / landing have height (raw.heightAt), which the tile grid cannot carry, so a
//     free tile next to a free tile more than STEP_M higher is blocked (the landing is reached by the stair only).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VENDOR = path.join(ROOT, 'v3/pixel3d');
const OUT = path.join(ROOT, 'packages/assets/src/hollowmere/hollowmere.generated.json'); // runtime data (client chunk, server)
const OUT_META = path.join(ROOT, 'packages/assets/src/hollowmere/hollowmere.meta.json'); // review data + freshness (tests, tools)
const SELF = 'scripts/v3/export-hollowmere.mjs';
const THREE_DIR = path.join(ROOT, 'apps/client/node_modules/three');
const CHECK = process.argv.includes('--check');

// ------------------------------------------------------------------------------------------------ module hooks
const vendorFiles = new Set();
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'three') return { url: pathToFileURL(path.join(THREE_DIR, 'build/three.module.js')).href, shortCircuit: true };
    const m = /^three\/addons\/(.*)$/.exec(spec);
    if (m) return { url: pathToFileURL(path.join(THREE_DIR, 'examples/jsm', m[1])).href, shortCircuit: true };
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (url.startsWith('file:')) {
      const p = fileURLToPath(url);
      if (p.startsWith(VENDOR + path.sep)) vendorFiles.add(path.relative(ROOT, p).split(path.sep).join('/'));
    }
    return next(url, ctx);
  },
});

const THREE = await import('three');
const V = (p) => import(pathToFileURL(path.join(VENDOR, 'src', p)).href);
const layout = await V('town/layout.js');
const collisionMod = await V('demo/collision.js');
const interiors = await V('town/interiors/index.js');
const api = await V('town/api.js');
const town = await V('town/town.js');
const towerInterior = await V('demo/tower-interior.js');

// quiet the vendor's build chatter (piece warnings would be failures anyway: strict builds below)
const warn = console.warn;
console.warn = (...a) => { throw new Error(`vendor warning during export: ${a.join(' ')}`); };

// ------------------------------------------------------------------------------------------------ constants
const TS = 16;
const TOWN_W = layout.TOWN_W; // 45
const TOWN_H = layout.TOWN_H; // 43
const BAND_X = TOWN_W + 2; // 47
const STRIDE_X = 13;
const STRIDE_Y = 14;
const ROOM = 12;
const TOWER_COL = 5; // the clock tower's band: a 6th band column, row 0
const MAP_W = BAND_X + (TOWER_COL + 1) * STRIDE_X; // 125
const STEP_M = 0.5; // tower room: the largest height step between two walkable tiles (the stair's steps: 0.41 m)
const MAP_H = Math.max(TOWN_H, 1 + 2 * STRIDE_Y + ROOM); // 43
const FEET = 0.875; // feet point inside a tile (tileCenterPx: y*16 + 14)
const EPS = 1e-6;
const SQRT3 = Math.sqrt(3);
const PLAYER_SPAWN = { x: 22, y: 27 };
const STORYTELLER_SPAWN = { x: 22, y: 23 }; // moved off the dais (v2 22,20 is inside it), §2.2
const NPC_HOMES = { 'npc-sweeper': { x: 16, y: 12 }, 'npc-vendor': { x: 10, y: 17 }, 'npc-elder': { x: 10, y: 21 }, 'npc-porter': { x: 22, y: 34 } };
const r3 = (v) => Math.round(v * 1000) / 1000;
if (MAP_W !== 125 || MAP_H !== 43 || TOWN_W !== 45 || TOWN_H !== 43) throw new Error(`unexpected map size ${MAP_W}x${MAP_H} (town ${TOWN_W}x${TOWN_H}): update §2.2`);

// ------------------------------------------------------------------------------------------------ stub engine
const uniforms = new Proxy({}, { get: (t, k) => (t[k] ??= { value: k === 'uSunDir' ? new THREE.Vector3(0, 1, 0) : 0 }) });
const engine = {
  toonUniforms: {}, uniforms, params: new URLSearchParams(), scene: new THREE.Scene(), stats: {}, updaters: [],
  camera: { target: new THREE.Vector3(22.5, 0, 19.5), viewHeight: 12, yaw: 0, pitch: Math.PI / 6, set() {} },
  lowW: 640, lowH: 360, onUpdate() {},
};

// ------------------------------------------------------------------------------------------------ grids
const ground = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => ' '));
const col = new Uint8Array(MAP_W * MAP_H);
const idx = (x, y) => y * MAP_W + x;
for (let y = 0; y < TOWN_H; y++) for (let x = 0; x < TOWN_W; x++) ground[y][x] = layout.groundAt(x, y);

// ------------------------------------------------------------------------------------------------ outdoor walk shapes
const coll = collisionMod.createCollision(null);
function sdBox(b, x, z) {
  const dx = x - b.cx, dz = z - b.cz;
  const lx = Math.abs(dx * b.c - dz * b.s), lz = Math.abs(dx * b.s + dz * b.c);
  const r = b.round ?? 0;
  const qx = lx - (b.hw - r), qz = lz - (b.hd - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
function shapeSd(sh, x, z) {
  let d = sh.kind === 'circle' ? Math.hypot(x - sh.cx, z - sh.cz) - sh.r : sdBox(sh, x, z);
  if (sh.carve) for (const k of sh.carve) d = Math.max(d, -sdBox(k, x, z));
  return d;
}
const shapeAt = (x, z) => coll.shapes.find((sh) => shapeSd(sh, x, z) < -EPS) ?? null;
const BIG = /^(ground:|house-|backlane$|dais$|clocktower$)/;
const blockReason = {};
for (let ty = 0; ty < TOWN_H; ty++)
  for (let tx = 0; tx < TOWN_W; tx++) {
    const sh = shapeAt(tx + 0.5, ty + FEET);
    if (sh) { col[idx(tx, ty)] = 1; blockReason[`${tx},${ty}`] = sh.tag; }
  }
// (a) a solid prop thinner than a tile's feet offset (lamp posts, signposts, stumps) blocks the tile its centre is in
let centreTiles = 0;
const coversAFeetPoint = (sh) => {
  for (let ty = Math.max(0, Math.floor(sh.cz - 3)); ty <= Math.min(TOWN_H - 1, Math.ceil(sh.cz + 3)); ty++)
    for (let tx = Math.max(0, Math.floor(sh.cx - 3)); tx <= Math.min(TOWN_W - 1, Math.ceil(sh.cx + 3)); tx++) if (shapeSd(sh, tx + 0.5, ty + FEET) < -EPS) return true;
  return false;
};
for (const sh of coll.shapes) {
  if (BIG.test(sh.tag ?? '') || coversAFeetPoint(sh)) continue;
  const tx = Math.floor(sh.cx), ty = Math.floor(sh.cz);
  if (tx < 0 || ty < 0 || tx >= TOWN_W || ty >= TOWN_H || col[idx(tx, ty)]) continue;
  col[idx(tx, ty)] = 1; blockReason[`${tx},${ty}`] = `${sh.tag}:centre`; centreTiles++;
}

// (d) a door tile blocked only by blocking ground / the map border is opened: the vendor carves the door corridor
// through those tiles (collision.js groundCarved, e.g. house-12's SE chamfer door on the west border column), but the
// tile's feet point can fall just outside the 1 m corridor. Any other shape on a door tile is a vendor layout error.
const openedDoors = [];
for (const h of layout.houses) {
  const k = `${h.door.x},${h.door.z}`;
  if (!col[idx(h.door.x, h.door.z)]) continue;
  if (!String(blockReason[k]).startsWith('ground:')) throw new Error(`${h.id}: door tile ${k} is inside ${blockReason[k]}`);
  col[idx(h.door.x, h.door.z)] = 0; delete blockReason[k]; openedDoors.push({ id: h.id, x: h.door.x, y: h.door.z });
}

// ------------------------------------------------------------------------------------------------ cottages + tower (occlusion)
const registry = new api.Registry();
const root = new THREE.Group();
root.position.copy(town.ANTI_TIE);
const occluders = {};
for (const id of [...layout.houses.map((h) => h.id), 'clocktower']) {
  const ctx = api.makeCtx(engine, id, { registry, tod: 'noon', params: new URLSearchParams() });
  const piece = await api.buildPiece(engine, id, ctx, { strict: true });
  const m = town.placementMatrix(id);
  let g = piece.group;
  if (m) { const holder = new THREE.Group(); holder.matrixAutoUpdate = false; holder.matrix.copy(m); holder.add(g); g = holder; }
  root.add(g);
  registry.add(id, piece);
  occluders[id] = g;
}
// the free-standing trees, bushes and stumps (the foliage piece: the layout's oak / oak2 / pine / pinetall / bush /
// bushberry / stump objects plus the rim forest), built after the houses as in town.js BUILD_ORDER; their opaque crown
// cores, trunks and stumps are the canopy occluders of rule (b) (the leaf sprites are expanded in the shader: no geometry)
const foliage = await api.buildPiece(engine, 'foliage', api.makeCtx(engine, 'foliage', { registry, tod: 'noon', params: new URLSearchParams() }), { strict: true });
root.add(foliage.group);
registry.add('foliage', foliage);
root.updateMatrixWorld(true);
const meshes = {};
for (const [id, g] of Object.entries(occluders)) {
  meshes[id] = [];
  g.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    for (const mt of Array.isArray(o.material) ? o.material : [o.material]) if (mt) mt.side = THREE.DoubleSide;
    meshes[id].push(o);
  });
}
// the vendor's ?occl=1 statistic (town.js): per cottage [nearest hidden ground line z, x range of the vertices there]
const occl = {};
{
  const v = new THREE.Vector3(), mm = new THREE.Matrix4(), mi = new THREE.Matrix4();
  for (const h of layout.houses) {
    let best = Infinity; const pts = [];
    occluders[h.id].traverse((o) => {
      const pos = o.isMesh || o.isPoints ? o.geometry?.attributes?.position : null;
      if (!pos || o.visible === false) return;
      const n = o.isInstancedMesh ? o.count : 1;
      for (let k = 0; k < n; k++) {
        mm.copy(o.matrixWorld);
        if (o.isInstancedMesh) { o.getMatrixAt(k, mi); mm.multiply(mi); }
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mm);
          const e = v.z - v.y * SQRT3;
          if (e < best + 0.3) pts.push([e, v.x]);
          if (e < best) best = e;
        }
      }
    });
    const near = pts.filter((p) => p[0] < best + 0.3).map((p) => p[1]);
    occl[h.id] = [r3(best), r3(Math.min(...near)), r3(Math.max(...near))];
  }
}
// (b) hidden characters: rays from the feet (5 cm up) and the head (HEAD_M) toward the gameplay camera (yaw 0, pitch
// 30 deg) both hit an occluder. HARD occluders (walls, roofs, glass, signs of a cottage / the tower) block the tile. SOFT
// ones (tree canopies: the free-standing trees / bushes / stumps of the foliage piece and house-11's oak crown; '-soft'
// dressing: ivy, thatch bundles, flowers) are cut away around the camera focus only (cutaway.js), so a tile hidden by any
// mix of hard and soft geometry that is not hidden by hard geometry alone is listed in meta.hiddenSoft. CANOPIES_BLOCK
// (lead decision, docs/v3/INTEGRATION.md §11) chooses what happens to those tiles: false = they stay walkable and the 3D
// renderer must show avatars under canopies (WP3); true = rule (b) blocks them too, door approaches kept as for walls.
// `--canopies=block|walk` overrides the constant for a trial run (never commit a JSON written with it: --check fails).
const CANOPIES_BLOCK_DEFAULT = false;
const canopyArg = process.argv.find((a) => a.startsWith('--canopies='))?.slice(11);
if (canopyArg && canopyArg !== 'block' && canopyArg !== 'walk') throw new Error(`--canopies=${canopyArg}: use block or walk`);
const CANOPIES_BLOCK = canopyArg ? canopyArg === 'block' : CANOPIES_BLOCK_DEFAULT;
const SOFT = /(crown|leaves|leaf|clump|-soft$|grass|turf)/;
const TREE_MESH = /^foliage-(cores|trunks|kit-solid)$/;
const occ = []; // { id, soft, box, meshes }
for (const [id, g] of Object.entries(occluders)) {
  const b = new THREE.Box3().setFromObject(g);
  for (const soft of [false, true]) {
    const list = meshes[id].filter((m) => SOFT.test(m.name ?? '') === soft);
    if (list.length) occ.push({ id, soft, box: b, meshes: list });
  }
}
let treeMeshes = 0;
foliage.group.traverse((o) => {
  if (!o.isMesh || o.visible === false || !TREE_MESH.test(o.name ?? '')) return;
  for (const mt of Array.isArray(o.material) ? o.material : [o.material]) if (mt) mt.side = THREE.DoubleSide;
  occ.push({ id: 'foliage', soft: true, box: new THREE.Box3().setFromObject(o), meshes: [o] });
  treeMeshes++;
});
if (treeMeshes < 3) throw new Error(`foliage piece: only ${treeMeshes} tree meshes (${TREE_MESH}): the vendor renamed them, update the exporter`);
// a foliage hit is labelled with the layout tree it belongs to (oak, pine, bush, ...) or 'rim' (the rim forest)
const layoutTrees = layout.objects.filter((o) => o.owner === 'foliage');
const treeLabel = (p) => {
  let best = null, bd = 2.5;
  for (const o of layoutTrees) { const d = Math.hypot(p.x - o.center.x, p.z - o.center.z); if (d < bd) { bd = d; best = o; } }
  return `foliage:${best ? best.kind : 'rim'}`;
};
const rc = new THREE.Raycaster();
rc.far = 60;
const VIEW = new THREE.Vector3(0, 0.5, SQRT3 / 2);
// A character is hidden when both its feet (5 cm) and its head (HEAD_M) are: with the head visible it is seen.
const HEAD_M = 1.2;
function rayHits(x, y0, z, withSoft) {
  rc.set(new THREE.Vector3(x, y0, z), VIEW);
  for (const o of occ) {
    if (o.soft && !withSoft) continue;
    const b = o.box;
    // the ray at height y is at z + (y - y0)*sqrt3: skip occluders it cannot meet
    if (x < b.min.x - 0.01 || x > b.max.x + 0.01) continue;
    if (b.max.z < z - 0.01 || b.min.z > z + b.max.y * SQRT3 + 0.01) continue;
    const hit = rc.intersectObjects(o.meshes, false).find((hh) => hh.point.y > y0 + 0.05);
    if (hit) return o.id === 'foliage' ? treeLabel(hit.point) : o.id;
  }
  return null;
}
const hiddenBy = (x, z, withSoft) => (rayHits(x, HEAD_M, z, withSoft) ? rayHits(x, 0.05, z, withSoft) : null);
const doorTiles = new Set([...layout.houses, layout.clocktower].map((h) => `${h.door.x},${h.door.z}`));
const hiddenAll = new Map(); // "x,y" -> occluder id (blocked unless a door approach)
const hiddenSoft = [];
for (let ty = 0; ty < TOWN_H; ty++)
  for (let tx = 0; tx < TOWN_W; tx++) {
    if (col[idx(tx, ty)]) continue;
    const by = hiddenBy(tx + 0.5, ty + FEET, false);
    if (by) { hiddenAll.set(`${tx},${ty}`, by); continue; }
    const soft = hiddenBy(tx + 0.5, ty + FEET, true);
    if (!soft) continue;
    if (CANOPIES_BLOCK) hiddenAll.set(`${tx},${ty}`, soft);
    else hiddenSoft.push({ x: tx, y: ty, by: soft });
  }
// a door whose doorstep is hidden keeps the shortest walk from its door tile to the visible town open (door approach)
const visibleTown = flood(PLAYER_SPAWN, (x, y) => x < TOWN_W && y < TOWN_H && !hiddenAll.has(`${x},${y}`));
const kept = new Set();
for (const h of [...layout.houses, layout.clocktower]) {
  const s0 = `${h.door.x},${h.door.z}`;
  if (visibleTown.has(s0)) continue;
  const prev = new Map([[s0, null]]);
  const q = [{ x: h.door.x, y: h.door.z }];
  let hit = null;
  while (q.length && !hit) {
    const p = q.shift();
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy, k = `${x},${y}`;
      if (prev.has(k) || x < 0 || y < 0 || x >= TOWN_W || y >= TOWN_H || col[idx(x, y)]) continue;
      prev.set(k, `${p.x},${p.y}`);
      if (visibleTown.has(k)) { hit = k; break; }
      q.push({ x, y });
    }
  }
  if (!hit) throw new Error(`${h.id}: no walk from its door tile ${s0} to the visible town`);
  for (let k = prev.get(hit); k; k = prev.get(k)) kept.add(k);
}
const hiddenTiles = [];
const hiddenKept = [];
for (const [k, by] of hiddenAll) {
  const [x, y] = k.split(',').map(Number);
  if (kept.has(k) || doorTiles.has(k)) { hiddenKept.push({ x, y, by }); continue; }
  col[idx(x, y)] = 1; blockReason[k] = `hidden:${by}`; hiddenTiles.push({ x, y, by });
}

// ------------------------------------------------------------------------------------------------ interiors
const bandRoom = (i) => ({ x: BAND_X + (i % 5) * STRIDE_X, y: 1 + Math.floor(i / 5) * STRIDE_Y, w: ROOM, h: ROOM });
const sdRect = (r, x, z) => {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, hx = (r.x1 - r.x0) / 2, hz = (r.z1 - r.z0) / 2;
  const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
};
const edgeErr = (v) => r3(Math.abs(v - Math.round(v)));
const interiorOut = [];
const interiorPockets = [];
const wallError = {};
for (let i = 0; i < 15; i++) {
  const it = await interiors.buildInterior(engine, i, { strict: true, tod: 'noon' });
  const R = bandRoom(i);
  const D = { x: R.x + 6, y: R.y + 11 };
  const { w: RW, d: RD, t: RT } = it.room;
  const O = it.origin;
  const A = { x: (D.x + 0.5) * TS, y: (D.y + 0.5) * TS - (RD / 2 + RT / 2) * TS };
  const toM = (pxX, pxY) => ({ x: O.x + (pxX - A.x) / TS, z: O.z + (pxY - A.y) / TS });
  const toTile = (p) => ({ x: Math.floor((A.x + (p.x - O.x) * TS) / TS), y: Math.floor((A.y + (p.z - O.z) * TS) / TS) });
  const furniture = it.colliders.filter((r) => r.kind !== 'wall');
  const floorAt = (tx, ty) => { const m = toM((tx + 0.5) * TS, (ty + FEET) * TS); return sdRect(it.floor, m.x, m.z) < -EPS; };
  const freeAt = (tx, ty) => {
    const m = toM((tx + 0.5) * TS, (ty + FEET) * TS);
    return sdRect(it.floor, m.x, m.z) < -EPS && furniture.every((r) => sdRect(r, m.x, m.z) >= EPS);
  };
  let free = 0;
  for (let ty = R.y; ty < R.y + R.h; ty++)
    for (let tx = R.x; tx < R.x + R.w; tx++) {
      const isFloor = floorAt(tx, ty) && tx > R.x && tx < R.x + R.w - 1 && ty > R.y && ty < R.y + R.h - 1;
      ground[ty][tx] = isFloor ? 'f' : 'W';
      const ok = isFloor && freeAt(tx, ty);
      col[idx(tx, ty)] = ok ? 0 : 1;
      if (ok) free++;
    }
  ground[D.y][D.x] = 'D';
  col[idx(D.x, D.y)] = 1;
  // the doorway centre must land on D's tile centre (the anchor rule)
  const dc = toTile({ x: O.x, z: O.z + RD / 2 + RT / 2 });
  if (dc.x !== D.x || dc.y !== D.y) throw new Error(`house-${i}: doorway maps to ${dc.x},${dc.y}, not ${D.x},${D.y}`);
  const ex = toTile(it.exit);
  if (ex.x !== D.x || ex.y !== D.y) throw new Error(`house-${i}: 3D exit maps to ${ex.x},${ex.y}, not the doorway ${D.x},${D.y}`);
  // reachable free tiles of the room from the interior door
  const interiorDoor = toTile(it.spawn);
  if (col[idx(interiorDoor.x, interiorDoor.y)]) throw new Error(`house-${i}: interior door ${interiorDoor.x},${interiorDoor.y} is blocked`);
  const reach = flood(interiorDoor, (x, y) => x >= R.x && y >= R.y && x < R.x + R.w && y < R.y + R.h);
  // free floor the door cannot reach (a gap behind furniture) is blocked, like an outdoor pocket
  for (let ty = R.y; ty < R.y + R.h; ty++)
    for (let tx = R.x; tx < R.x + R.w; tx++)
      if (!col[idx(tx, ty)] && !reach.has(`${tx},${ty}`)) { col[idx(tx, ty)] = 1; free--; interiorPockets.push({ id: `house-${i}`, x: tx, y: ty }); }
  const nearestFree = (p, avoid) => {
    const t = toTile(p);
    let best = null, bd = Infinity;
    for (const k of reach) {
      const [x, y] = k.split(',').map(Number);
      if (avoid && x === avoid.x && y === avoid.y) continue;
      if (x === interiorDoor.x && y === interiorDoor.y) continue; // keep the arrival spot clear
      const d = Math.hypot(x - t.x, y - t.y);
      if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && (y < best.y || (y === best.y && x < best.x)))) { bd = d; best = { x, y }; }
    }
    return best;
  };
  const bed = nearestFree(it.bed ?? it.spawn);
  const visitPoint = nearestFree(it.visitPoint ?? it.bed ?? it.spawn, bed);
  wallError[`house-${i}`] = {
    x: Math.max(edgeErr(D.x + 0.5 - RW / 2), edgeErr(D.x + 0.5 + RW / 2)),
    z: Math.max(edgeErr(D.y + 0.5 - RT / 2 - RD), edgeErr(D.y + 0.5 - RT / 2)),
  };
  interiorOut.push({ i, R, D, interiorDoor, bed, visitPoint, free, room: { w: RW, d: RD, t: RT },
    lights: it.lights.map((l) => ({ x: r3(A.x + (l.pos.x - O.x) * TS), y: r3(A.y + (l.pos.z - O.z) * TS), r: r3((l.r ?? 3) * TS), kind: l.kind })) });
}

// ------------------------------------------------------------------------------------------------ the clock tower's room
// Pass B made the tower enterable (src/demo/tower-interior.js buildTowerRoom: an 8 x 5.5 m clockwork room at x 650, a
// raised landing along the back reached by a stair up the east wall). It is nobody's home: no bed; the visit point is
// the vendor's (on the landing). The room record is world-space: floor {x0, z0, x1, z1}, colliders (rects {x0..z1},
// circles {x, z, r}, centre boxes {cx, cz, w, d}), spawn, exit (in the doorway), visitPoint, heightAt(x, z).
const towerDemo = { engine, events: { on: () => () => {} }, passB: null, time: { hours: 12 } };
const tw = towerInterior.buildTowerRoom(engine, towerDemo);
const towerOut = (() => {
  const R = { x: BAND_X + TOWER_COL * STRIDE_X, y: 1, w: ROOM, h: ROOM };
  const D = { x: R.x + 6, y: R.y + 11 };
  // anchor: the 3D exit spot (in the doorway, like a cottage's doorway centre) is D's tile centre
  const A = { x: (D.x + 0.5) * TS, y: (D.y + 0.5) * TS };
  const E = tw.exit;
  const toM = (pxX, pxY) => ({ x: E.x + (pxX - A.x) / TS, z: E.z + (pxY - A.y) / TS });
  const toTile = (p) => ({ x: Math.floor((A.x + (p.x - E.x) * TS) / TS), y: Math.floor((A.y + (p.z - E.z) * TS) / TS) });
  const sdCol = (c, x, z) => {
    if (c.r !== undefined) return Math.hypot(x - c.x, z - c.z) - c.r;
    if (c.w !== undefined) return sdRect({ x0: c.cx - c.w / 2, z0: c.cz - c.d / 2, x1: c.cx + c.w / 2, z1: c.cz + c.d / 2 }, x, z);
    return sdRect(c, x, z);
  };
  for (const c of tw.colliders) if (!(c.r !== undefined || c.w !== undefined || c.x0 !== undefined)) throw new Error(`clocktower: unknown collider shape ${JSON.stringify(c)}`);
  const feet = (tx, ty) => toM((tx + 0.5) * TS, (ty + FEET) * TS);
  const height = new Map();
  const inner = (tx, ty) => tx > R.x && tx < R.x + R.w - 1 && ty > R.y && ty < R.y + R.h - 1;
  let free = 0;
  for (let ty = R.y; ty < R.y + R.h; ty++)
    for (let tx = R.x; tx < R.x + R.w; tx++) {
      const m = feet(tx, ty);
      const isFloor = sdRect(tw.floor, m.x, m.z) < -EPS && inner(tx, ty);
      ground[ty][tx] = isFloor ? 'f' : 'W';
      const ok = isFloor && tw.colliders.every((c) => sdCol(c, m.x, m.z) >= EPS);
      col[idx(tx, ty)] = ok ? 0 : 1;
      if (ok) { free++; height.set(`${tx},${ty}`, tw.heightAt(m.x, m.z)); }
    }
  ground[D.y][D.x] = 'D';
  col[idx(D.x, D.y)] = 1;
  const ex = toTile(E);
  if (ex.x !== D.x || ex.y !== D.y) throw new Error(`clocktower: 3D exit maps to ${ex.x},${ex.y}, not the doorway ${D.x},${D.y}`);
  const interiorDoor = toTile(tw.spawn);
  if (interiorDoor.x !== D.x || interiorDoor.y !== D.y - 1) throw new Error(`clocktower: spawn maps to ${interiorDoor.x},${interiorDoor.y}, not the tile above the doorway`);
  // height cliffs: the landing rail / the stair's sides are thinner than a tile, so the grid would let a player step
  // straight from the floor onto the 1.1 m landing; the lower tile of every step > STEP_M is blocked (the stair's own
  // steps are 0.41 m: the landing is reached by the stair only)
  const cliffs = [];
  for (const [k, h] of height) {
    const [x, y] = k.split(',').map(Number);
    if (col[idx(x, y)]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const hn = height.get(`${x + dx},${y + dy}`);
      if (hn !== undefined && hn - h > STEP_M) { col[idx(x, y)] = 1; free--; cliffs.push({ x, y, h: r3(h), up: r3(hn) }); break; }
    }
  }
  if (col[idx(interiorDoor.x, interiorDoor.y)]) throw new Error(`clocktower: interior door ${interiorDoor.x},${interiorDoor.y} is blocked`);
  const reach = flood(interiorDoor, (x, y) => x >= R.x && y >= R.y && x < R.x + R.w && y < R.y + R.h);
  for (let ty = R.y; ty < R.y + R.h; ty++)
    for (let tx = R.x; tx < R.x + R.w; tx++)
      if (!col[idx(tx, ty)] && !reach.has(`${tx},${ty}`)) { col[idx(tx, ty)] = 1; free--; interiorPockets.push({ id: 'clocktower', x: tx, y: ty }); }
  // the landing must stay reachable (the stair works on the grid)
  const landing = [...reach].filter((k) => (height.get(k) ?? 0) > 1);
  if (!landing.length) throw new Error('clocktower: the landing is not reachable from the door');
  let visitPoint = null, bd = Infinity;
  const vt = toTile(tw.visitPoint);
  for (const k of reach) {
    const [x, y] = k.split(',').map(Number);
    if (x === interiorDoor.x && y === interiorDoor.y) continue;
    const d = Math.hypot(x - vt.x, y - vt.y);
    if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && (y < visitPoint.y || (y === visitPoint.y && x < visitPoint.x)))) { bd = d; visitPoint = { x, y }; }
  }
  const heights = Object.fromEntries([...reach].sort().map((k) => [k, r3(height.get(k) ?? 0)]));
  const lights = tw.lights.map((l) => ({ x: r3(A.x + (l.pos.x - E.x) * TS), y: r3(A.y + (l.pos.z - E.z) * TS), r: r3((l.r ?? 3) * TS), kind: l.kind }));
  return { R, D, interiorDoor, visitPoint, free, cliffs, heights, lights, anchor: { px: { x: A.x, y: A.y }, m: { x: r3(E.x), z: r3(E.z) } },
    room: { w: r3(tw.floor.x1 - tw.floor.x0), d: r3(tw.floor.z1 - tw.floor.z0) } };
})();
tw.dispose?.();

// a tile painted with blocking ground stays solid even where a vendor door corridor carved its box open (the bottom
// border row under house-9's doorstep): the ground codes and the collision must agree for Classic and the server
for (let y = 0; y < TOWN_H; y++)
  for (let x = 0; x < TOWN_W; x++)
    if (!col[idx(x, y)] && layout.BLOCKING_GROUND.has(ground[y][x]) && !doorTiles.has(`${x},${y}`)) { col[idx(x, y)] = 1; blockReason[`${x},${y}`] = `ground:${ground[y][x]}`; }
// the void between the town and the bands, and between the bands, is solid (BLOCKING_GROUND ' ', as in v2)
for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (ground[y][x] === ' ') col[idx(x, y)] = 1;

// ------------------------------------------------------------------------------------------------ (c) pockets
function flood(from, inside) {
  const seen = new Set([`${from.x},${from.y}`]);
  const q = [from];
  while (q.length) {
    const p = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy, k = `${x},${y}`;
      if (seen.has(k) || x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || col[idx(x, y)] || !inside(x, y)) continue;
      seen.add(k); q.push({ x, y });
    }
  }
  return seen;
}
const inTown = (x, y) => x < TOWN_W && y < TOWN_H;
// --dump x0,y0,x1,y1: print the tile area (. free, # blocked by a shape, h hidden, c prop centre) for review
const dumpArg = process.argv.find((a) => a.startsWith('--dump='));
if (dumpArg) {
  const [x0, y0, x1, y1] = dumpArg.slice(7).split(',').map(Number);
  for (let y = y0; y <= y1; y++) {
    let row = `${String(y).padStart(2)} `;
    for (let x = x0; x <= x1; x++) {
      const why = blockReason[`${x},${y}`] ?? '';
      row += !col[idx(x, y)] ? (doorTiles.has(`${x},${y}`) ? 'D' : '.') : why.startsWith('hidden') ? 'h' : why.endsWith(':centre') ? 'c' : '#';
    }
    console.log(row);
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (blockReason[`${x},${y}`]) console.log(`  ${x},${y} ${blockReason[`${x},${y}`]}`);
}
if (col[idx(PLAYER_SPAWN.x, PLAYER_SPAWN.y)]) throw new Error('player spawn blocked');
if (col[idx(STORYTELLER_SPAWN.x, STORYTELLER_SPAWN.y)]) throw new Error('storyteller spawn blocked');
const town0 = flood(PLAYER_SPAWN, inTown);
const pockets = [];
for (let y = 0; y < TOWN_H; y++) for (let x = 0; x < TOWN_W; x++) if (!col[idx(x, y)] && !town0.has(`${x},${y}`)) { col[idx(x, y)] = 1; blockReason[`${x},${y}`] = 'pocket'; pockets.push({ x, y }); }
for (const h of [...layout.houses, layout.clocktower]) if (!town0.has(`${h.door.x},${h.door.z}`)) throw new Error(`${h.id}: door tile ${h.door.x},${h.door.z} unreachable from the spawn (${blockReason[`${h.door.x},${h.door.z}`] ?? 'pocket'})`);

// the canopy-hidden tiles that are still walkable at the end (blocking ground / pockets came later)
const hiddenSoftOpen = hiddenSoft.filter((t) => !col[idx(t.x, t.y)]);

// ------------------------------------------------------------------------------------------------ npc homes
// (user request 2026-10-17 "no NPCs in the voting circle") a home is a reachable outdoor tile whose feet point is
// outside the plaza ellipse x NPC_PLAZA_CLEAR (TownScene's npcSpot rule) and outside the square (protocol inSquare,
// the 3D roamer's rule): the townsfolk start clear of the voting circle in both renderers
const NPC_PLAZA_CLEAR = 1.1;
const npcOk = (x, y) => {
  const px = (x + 0.5) * TS, py = (y + FEET) * TS;
  const P0 = layout.PLAZA, S0 = layout.SQUARE;
  return Math.hypot(px - P0.cx * TS, py - P0.cz * TS) / (P0.r * TS) > NPC_PLAZA_CLEAR && Math.hypot(px - S0.cx * TS, py - S0.cz * TS) > S0.r * TS;
};
const npcHomes = {};
for (const [id, p] of Object.entries(NPC_HOMES)) {
  if (town0.has(`${p.x},${p.y}`) && npcOk(p.x, p.y)) { npcHomes[id] = { ...p }; continue; }
  let best = null, bd = Infinity;
  for (const k of town0) {
    const [x, y] = k.split(',').map(Number);
    if (!npcOk(x, y)) continue;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && (y < best.y || (y === best.y && x < best.x)))) { bd = d; best = { x, y }; }
  }
  npcHomes[id] = best;
}

// ------------------------------------------------------------------------------------------------ records
const tileAabb = (f) => { const x0 = Math.floor(f.x + EPS), y0 = Math.floor(f.z + EPS), x1 = Math.ceil(f.x + f.w - EPS), y1 = Math.ceil(f.z + f.d - EPS); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
const buildings = layout.houses.map((h, i) => {
  const it = interiorOut[i];
  return {
    id: h.id, kind: 'house', name: h.name, houseIndex: i,
    footprint: tileAabb(h.footprint),
    door: { x: h.door.x, y: h.door.z },
    doorNormal: h.doorNormal.map(r3),
    interior: it.R, interiorDoor: it.interiorDoor, bed: it.bed, visitPoint: it.visitPoint,
  };
});
// the clock tower: the 16th building (enterable since vendor pass B), nobody's home (no bed); the Storyteller's
// visit point is the vendor's (on the landing)
const ct = layout.clocktower;
buildings.push({
  id: 'clocktower', kind: 'clocktower', name: ct.name, houseIndex: null,
  footprint: tileAabb(ct.footprint), door: { x: ct.door.x, y: ct.door.z }, doorNormal: ct.doorNormal.map(r3),
  interior: towerOut.R, interiorDoor: towerOut.interiorDoor, visitPoint: towerOut.visitPoint,
});
const styles = Object.fromEntries([...layout.houses, ct].map((h) => [h.id, { ...h.style }]));
const objects = [
  ...[...layout.houses, ct].map((h) => { const f = tileAabb(h.footprint); return { kind: 'building', x: f.x, y: f.y + f.h - 1, frame: h.id }; }),
  ...layout.objects.map((o) => ({ kind: o.kind, x: o.x, y: o.z, ...(o.walkable ? { walkable: true } : {}) })),
];
const propDefs = Object.fromEntries(Object.entries(layout.PROP_DEFS).map(([k, d]) => [k, { w: d.w, h: d.h, col: d.col ?? null, ...(d.walkable ? { walkable: true } : {}), ...(d.flat ? { flat: true } : {}), ...(d.light ? { light: { ...d.light } } : {}) }]));
const LIGHT = { fire: 'fire', window: 'cool', holy: 'holy' };
const lights = [
  ...layout.lights2d.map((l) => ({ x: r3(l.x * TS), y: r3(l.z * TS), r: r3(l.r * TS), color: l.color, building: null })),
];
for (const o of interiorOut) for (const l of o.lights) lights.push({ x: l.x, y: l.y, r: l.r, color: LIGHT[l.kind] ?? 'warm', building: `house-${o.i}` });
for (const l of towerOut.lights) lights.push({ x: l.x, y: l.y, r: l.r, color: LIGHT[l.kind] ?? 'warm', building: 'clocktower' });
const P = layout.PLAZA, C = layout.CIRCLE;
const collisionRows = Array.from({ length: MAP_H }, (_, y) => Array.from(col.subarray(y * MAP_W, (y + 1) * MAP_W)).join(''));
for (const b of buildings) if (col[idx(b.door.x, b.door.y)]) throw new Error(`${b.id}: door tile blocked`);

// ------------------------------------------------------------------------------------------------ vendor hash
console.warn = warn;
const files = [...vendorFiles].sort();
const hash = createHash('sha256');
for (const f of files) { hash.update(`${f}\n`); hash.update(readFileSync(path.join(ROOT, f))); hash.update('\n'); }
// generatorHash: this script + the three version it ran against (packages/assets/test/hollowmere.test.ts recomputes it,
// so an edited exporter or a three bump without a re-export fails the tests)
const threeVersion = JSON.parse(readFileSync(path.join(THREE_DIR, 'package.json'), 'utf8')).version;
const generatorHash = createHash('sha256').update(`${SELF}\n`).update(readFileSync(path.join(ROOT, SELF))).update(`\nthree@${threeVersion}\n`).digest('hex');

const out = {
  version: 3,
  tileSize: TS,
  widthTiles: MAP_W,
  heightTiles: MAP_H,
  townBounds: { x: 0, y: 0, w: TOWN_W, h: TOWN_H },
  ground: ground.map((r) => r.join('')),
  collision: collisionRows,
  buildings,
  // the tower room's px <-> m translation (the 3D client's interior map for bld:clocktower): px = anchor.px +
  // (m - anchor.m) * tileSize; anchor.m = the vendor room's exit spot (world metres), anchor.px = the doorway tile centre
  towerRoom: { anchorPx: towerOut.anchor.px, anchorM: towerOut.anchor.m },
  circle: { cx: C.cx * TS, cy: C.cz * TS, rx: C.r * TS, ry: C.r * TS, startDeg: 0, sweepDeg: 360, stones: 15 },
  square: { cx: layout.SQUARE.cx * TS, cy: layout.SQUARE.cz * TS, r: layout.SQUARE.r * TS },
  plaza: { cx: P.cx * TS, cy: P.cz * TS, rx: P.r * TS, ry: P.r * TS },
  playerSpawn: PLAYER_SPAWN,
  storytellerSpawn: STORYTELLER_SPAWN,
  streetlights: layout.streetlights.map((s) => ({ x: s.x, y: s.z })),
  npcHomes,
  map: { objects, styles, decals: layout.decals.map((d) => ({ x: d.x, y: d.z, name: d.name })), lights, propDefs },
};
const metaOut = {
  meta: {
    canopiesBlock: CANOPIES_BLOCK,
    wallError,
    occl,
    hidden: hiddenTiles,
    hiddenKept,
    hiddenSoft: hiddenSoftOpen,
    pockets,
    centreTiles,
    openedDoors,
    interiorPockets,
    interiorFreeTiles: { ...Object.fromEntries(interiorOut.map((o) => [`house-${o.i}`, o.free])), clocktower: towerOut.free },
    rooms: { ...Object.fromEntries(interiorOut.map((o) => [`house-${o.i}`, o.room])), clocktower: towerOut.room },
    // the tower room: the heights of its walkable tiles (m, vendor raw.heightAt at the feet point; stair 0 .. 1.1 landing)
    // and the tiles blocked by the height-cliff rule
    towerHeights: towerOut.heights,
    towerCliffs: towerOut.cliffs,
    outlines: Object.fromEntries(layout.houses.map((h) => [h.id, h.corners.map(([x, z]) => [r3(x), r3(z)])])),
    doorPoints: Object.fromEntries([...layout.houses, ct].map((h) => [h.id, { x: r3(h.doorPoint.x), z: r3(h.doorPoint.z) }])),
  },
  vendorFiles: files,
  vendorHash: hash.digest('hex'),
  generator: SELF,
  generatorHash,
  three: threeVersion,
};

// ------------------------------------------------------------------------------------------------ deterministic JSON
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
function fmt(v, ind = '') {
  const flat = JSON.stringify(v);
  if (flat.length + ind.length <= 118 || v === null || typeof v !== 'object') return flat;
  const n = ind + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => n + fmt(x, n)).join(',\n')}\n${ind}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${n}${JSON.stringify(k)}: ${fmt(x, n)}`).join(',\n')}\n${ind}}`;
}
const outputs = [[OUT, fmt(sortKeys(out)) + '\n'], [OUT_META, fmt(sortKeys(metaOut)) + '\n']];
const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return null; } /* first run */ };
const stale = outputs.filter(([f, text]) => read(f) !== text).map(([f]) => path.relative(ROOT, f));
const summary = `hollowmere: ${MAP_W}x${MAP_H}, ${buildings.length - 1} houses + the clock tower, ${files.length} vendor files, hash ${metaOut.vendorHash.slice(0, 12)}, generator ${generatorHash.slice(0, 12)} (three@${threeVersion}), ` +
  `hidden ${hiddenTiles.length} blocked + ${hiddenKept.length} kept on door approaches (+${hiddenSoftOpen.length} walkable under canopies; canopies ${CANOPIES_BLOCK ? 'block' : 'walk'}), pockets ${pockets.length}, centre tiles ${centreTiles}, ` +
  `interior free tiles ${interiorOut.map((o) => o.free).join('/')}, clock tower ${towerOut.free} (${towerOut.cliffs.length} cliff tiles)`;
if (CHECK) {
  if (stale.length) { console.error(`${summary}\nSTALE: ${stale.join(', ')} differ, re-run export-hollowmere`); process.exit(1); }
  console.log(`${summary}\nup to date`);
} else {
  mkdirSync(path.dirname(OUT), { recursive: true });
  for (const [f, text] of outputs) writeFileSync(f, text);
  console.log(`${summary}\n${stale.length ? `written: ${stale.join(', ')}` : 'unchanged'}`);
}
