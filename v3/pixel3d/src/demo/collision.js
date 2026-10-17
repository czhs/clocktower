// Demo collision (owner: player; docs/DEMO.md §4.1). The walkable town as a 2D SIGNED DISTANCE FIELD on a 10 cm grid,
// built once from src/town/layout.js (read only) and the built pieces' door anchors:
//   - blocking ground tiles (BLOCKING_GROUND: the dense-forest border, water, walls ...) and the map edge: tile boxes
//   - every cottage: its PLACED oriented footprint (layout.js LAYOUT_DELTAS: the 45 deg corner cottages, the turned +
//     staggered side rows) MINUS a door corridor carved from the REAL door (the piece's door anchor point when it
//     has one: chamfer doors, porches, house-14's recessed mill door) straight out along the door normal, so every
//     door and its door tile stay reachable
//   - the clocktower (its footprint), the dais (the octagonal stage: a circle of its tread inradius), and the
//     outdoor props with shapes sized to the meshes (layout.js col rects are whole tiles: a lamp post would stop the
//     player a metre early): trunks / posts / barrels = circles, stalls / benches / crates / cart = shrunk boxes,
//     the fountain basin = a rounded box
// The player is a circle of radius R; positions with sdf(x, z) >= R are free. move() slides along walls (gradient
// push-out after every <= 8 cm sub-step: no tunnelling, smooth sliding on the turned walls), findPath() is A* on a
// 25 cm grid + string pulling, nearestFree() fixes teleports into geometry.
//
// Exports: createCollision(demo, {radius}) -> collision = { R, sdf(x, z), free(x, z, r?), grad(x, z), move(pos, dx, dz),
//   resolve(pos), nearestFree(x, z, r?), nearestReachable(x, z, r?) (free AND in the main walkable region: teleports),
//   reachable(x, z), findPath(from, to) -> [{x, z}] | null, lineFree(a, b, r?), shapes, doors,
//   overlay(engine) -> Object3D (debug outlines, ?collide=1) }
//   createRoomCollision({floor, colliders, open, name}, {radius}) -> the same API for a cottage interior (interior.js):
//     the room is free INSIDE its floor rect (walls = everything outside it, minus `open` passages: the doorway), the
//     furniture rects / circles are solid. fieldCollision(shapes, bounds, radius, extra) is the shared core.
// Walk-through props: an object flagged `walkable` in layout.js (object or PROP_DEFS entry) is never solid; without a
// flag the small clutter kinds of WALK_THROUGH are (crates, barrels, sacks, stacked boxes, pumpkins, doormats).
import * as THREE from 'three';
import * as layout from '../town/layout.js';

const CELL = 0.1;             // sdf grid (m)
const PATH_CELL = 0.25;       // A* grid (m)
const FAR = 3;                // sdf is clamped to FAR outside every shape (m)
export const PLAYER_RADIUS = 0.28;

// prop kind -> collision shape around the object's centre (layout.objects[].center), sized to the props / foliage meshes
//   {c: r} circle; {b: [hw, hd]} box half extents (+ optional round radius); null: walkable (doormats)
const PROP_SHAPES = {
  oak: { c: 0.45 }, oak2: { c: 0.45 }, pine: { c: 0.55 }, pinetall: { c: 0.55 },
  bush: { c: 0.42 }, bushberry: { c: 0.42 }, stump: { c: 0.32 }, barrel: { c: 0.32 }, flowerbarrel: { c: 0.32 },
  pumpkins: { c: 0.38 }, signpost: { c: 0.14 }, lamp: { c: 0.17 },
  fountain: { b: [1.45, 0.99], round: 0.35 },
  well: { c: 0.85 },
  stall_red: { b: [1.4, 0.85] }, stall_gold: { b: [1.4, 0.85] },
  bench: { b: [0.9, 0.3] }, crates: { b: [0.9, 0.4] }, cart: { b: [0.95, 0.45] }, noticeboard: { b: [0.85, 0.2] },
  doormat: null,
};
/** Small clutter the player walks through when layout.js carries no explicit `walkable` flag for it. */
export const WALK_THROUGH = new Set(['crates', 'boxes', 'stackedboxes', 'barrel', 'barrels', 'flowerbarrel', 'sack', 'sacks', 'pumpkins', 'doormat', 'basket', 'logs']);
/** Is a layout object walk-through? layout.js flag first (object, then its PROP_DEFS entry), else WALK_THROUGH. */
export function walkable(o) {
  const f = o?.walkable ?? o?.def?.walkable ?? layout.PROP_DEFS?.[o?.kind]?.walkable;
  return f === undefined || f === null ? WALK_THROUGH.has(o?.kind) : !!f;
}
const DAIS_R = 2.4;           // dais.js T0: octagon circumradius 2.56, inradius 2.36
const DOOR_HALF = 0.5;        // half width of the carved door corridor (a door leaf is ~0.9 m)

// ------------------------------------------------------------------------------------------------ shape SDFs
/** Signed distance from (x, z) to an oriented box {cx, cz, hw, hd, c, s (cos / sin of its yaw), round}. */
function sdBox(b, x, z) {
  const dx = x - b.cx, dz = z - b.cz;
  const lx = Math.abs(dx * b.c - dz * b.s), lz = Math.abs(dx * b.s + dz * b.c);
  const r = b.round ?? 0;
  const qx = lx - (b.hw - r), qz = lz - (b.hd - r);
  const out = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  return out + Math.min(Math.max(qx, qz), 0) - r;
}
const sdCircle = (c, x, z) => Math.hypot(x - c.cx, z - c.cz) - c.r;
/** A box in the game frame of a placed piece: rotate about pl.pivot by pl.ry, then translate (layout.placePoint). */
function placedBox(id, gx0, gz0, gx1, gz1, extra = {}) {
  const pl = layout.placement(id);
  const c = layout.placePoint(id, (gx0 + gx1) / 2, (gz0 + gz1) / 2, pl);
  // local axes of the box are the game frame's; a world offset (dx, dz) maps to local by the inverse rotation:
  // local x = dx cos(ry) - dz sin(ry), local z = dx sin(ry) + dz cos(ry)   (layout.insideHouse's back-rotation)
  return { kind: 'box', cx: c.x, cz: c.z, hw: (gx1 - gx0) / 2, hd: (gz1 - gz0) / 2, c: Math.cos(pl.ry), s: Math.sin(pl.ry), ...extra };
}
/** A world-space oriented box from a centre, a unit direction (local +z) and half extents. */
function dirBox(cx, cz, nx, nz, hw, hd, extra = {}) {
  // local z along n: local z = dx nx + dz nz (sdBox: lz = dx s + dz c) -> s = nx, c = nz; local x = dx nz - dz nx
  return { kind: 'box', cx, cz, hw, hd, c: nz, s: nx, ...extra };
}
const shapeSd = (sh, x, z) => {
  if (sh.kind === 'room') {
    // solid OUTSIDE the floor box (and outside every open passage): -(distance into the free space)
    let f = sdBox(sh, x, z);
    if (sh.open) for (const k of sh.open) f = Math.min(f, sdBox(k, x, z));
    return -f;
  }
  let d = sh.kind === 'circle' ? sdCircle(sh, x, z) : sdBox(sh, x, z);
  if (sh.carve) for (const k of sh.carve) d = Math.max(d, -sdBox(k, x, z));
  return d;
};
function shapeBounds(sh) {
  if (sh.kind === 'room') return [-Infinity, -Infinity, Infinity, Infinity];   // touches every cell
  if (sh.kind === 'circle') return [sh.cx - sh.r, sh.cz - sh.r, sh.cx + sh.r, sh.cz + sh.r];
  const ex = Math.abs(sh.hw * sh.c) + Math.abs(sh.hd * sh.s), ez = Math.abs(sh.hw * sh.s) + Math.abs(sh.hd * sh.c);
  return [sh.cx - ex, sh.cz - ez, sh.cx + ex, sh.cz + ez];
}

// ------------------------------------------------------------------------------------------------ doors
/**
 * The real doors (world): the piece's door anchor `point` when it has one (already placed by the composer; house-14's
 * recessed mill door, the chamfer / porch doors), else the layout record's doorPoint (the wall door: the anchor's
 * pivot is the HINGE, not the door centre). Normal: anchor normal, else the record's doorNormal.
 * stats.doorMismatch (house-14, 0.9 m) is exactly the case where these differ from layout.js.
 */
export function realDoors(registry) {
  const out = [];
  const anchors = registry ? registry.anchors('doors') : [];
  for (const rec of [...layout.houses, layout.clocktower]) {
    const list = anchors.filter((a) => a.piece === rec.id);
    const ref = rec.doorPoint;
    const dist = (a) => (a.point ? Math.hypot(a.point.x - ref.x, a.point.z - ref.z) : 0);
    const a = list.slice().sort((p, q) => dist(p) - dist(q))[0] ?? null;
    const pt = a?.point ?? rec.doorPoint;
    let [nx, nz] = a?.normal ?? rec.doorNormal;
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    out.push({ id: rec.id, pos: new THREE.Vector3(pt.x, 0, pt.z), normal: [nx, nz], anchor: a, record: rec,
      mismatch: +Math.hypot(pt.x - rec.doorPoint.x, pt.z - rec.doorPoint.z).toFixed(2) });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ factory
export function createCollision(demo, { radius = PLAYER_RADIUS } = {}) {
  const t0 = performance.now();
  const W = layout.TOWN_W, H = layout.TOWN_H;
  const doors = realDoors(demo?.town?.registry);
  const shapes = [];

  // blocking ground tiles + the map border
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const g = layout.groundAt(x, z);
    if (layout.BLOCKING_GROUND.has(g) || x === 0 || z === 0 || x === W - 1 || z === H - 1)
      shapes.push({ kind: 'box', cx: x + 0.5, cz: z + 0.5, hw: 0.5, hd: 0.5, c: 1, s: 0, tag: `ground:${g}` });
  }
  // cottages (placed oriented footprint) minus the door corridor
  for (const h of layout.houses) {
    const f = (h.game ?? h).footprint;
    const sh = placedBox(h.id, f.x, f.z, f.x + f.w, f.z + f.d, { tag: h.id });
    const d = doors.find((q) => q.id === h.id);
    if (d) {
      const [nx, nz] = d.normal, L = 4;   // the corridor runs from the door plane out past the footprint
      sh.carve = [dirBox(d.pos.x + nx * (L / 2 - 0.02), d.pos.z + nz * (L / 2 - 0.02), nx, nz, DOOR_HALF, L / 2)];
    }
    shapes.push(sh);
  }
  // clocktower (landmark, never enterable)
  { const f = layout.clocktower.footprint; shapes.push({ kind: 'box', cx: f.x + f.w / 2, cz: f.z + f.d / 2, hw: f.w / 2, hd: f.d / 2, c: 1, s: 0, tag: 'clocktower' }); }
  // the back lane BEHIND the north row (house-0, house-1, the tower, house-2, house-3: z < their footprints' back wall)
  // the gameplay camera looks north, so a player there is hidden behind the buildings (only the cut-away hole shows
  // them) and every key but E / W runs into a back wall. It is solid, so a teleport / ?at= / Travel there snaps to open
  // ground in front (nearestFree) and click-to-move never routes through it. The box spans the whole map width: the
  // corner pockets behind the 45 deg corner cottages (house-14 / house-4, x < 8 and x > 37, z < 8.7) are hidden the
  // same way (a player at (7.7, 3.5) drew on the mill's roof). The side lanes below z 8.7 stay open.
  {
    const north = [...layout.houses.filter((h) => ['house-0', 'house-1', 'house-2', 'house-3'].includes(h.id)).map((h) => h.footprint), layout.clocktower.footprint];
    // ... and the 1 m slots BETWEEN those buildings (same story: a player in one is hidden by the eaves), so the box
    // runs up to 0.3 m short of the row's front walls (the door corridors start at the front wall: untouched)
    const x0 = 0, x1 = W, zf = Math.min(...north.map((f) => f.z + f.d)) - 0.3;
    shapes.push({ kind: 'box', cx: (x0 + x1) / 2, cz: zf / 2, hw: (x1 - x0) / 2, hd: zf / 2, c: 1, s: 0, tag: 'backlane' });
  }
  // the dais (stage) in the voting circle
  shapes.push({ kind: 'circle', cx: layout.CIRCLE.cx, cz: layout.CIRCLE.cz, r: DAIS_R, tag: 'dais' });
  // props
  for (const o of layout.objects) {
    const s = PROP_SHAPES[o.kind];
    if (s === null || walkable(o)) continue;
    const c = o.center ?? { x: o.rect.x + o.rect.w / 2, z: o.rect.z + o.rect.d / 2 };
    if (!s) { const r = o.rect; shapes.push({ kind: 'box', cx: r.x + r.w / 2, cz: r.z + r.d / 2, hw: r.w / 2, hd: r.d / 2, c: 1, s: 0, tag: o.kind }); continue; }
    if (s.c) shapes.push({ kind: 'circle', cx: c.x, cz: c.z, r: s.c, tag: o.kind });
    else shapes.push({ kind: 'box', cx: c.x, cz: c.z, hw: s.b[0], hd: s.b[1], c: 1, s: 0, round: s.round ?? 0, tag: o.kind });
  }

  const api = fieldCollision(shapes, { x0: 0, z0: 0, x1: W, z1: H }, radius, { doors });
  api.stats.ms = Math.round(performance.now() - t0);
  return api;
}

/**
 * Collision for a cottage interior: room = { floor: {x0, z0, x1, z1} (world), colliders: [{kind: 'box', cx, cz, hw, hd,
 * c, s, round?} | {kind: 'circle', cx, cz, r}], open: [box] (passages out of the floor rect, e.g. the doorway to the
 * exit spot), name }. Grid bounds = the floor rect + 1 m.
 */
export function createRoomCollision(room, { radius = PLAYER_RADIUS } = {}) {
  const t0 = performance.now();
  const f = room.floor;
  const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
  const shapes = [{ kind: 'room', cx, cz, hw: (f.x1 - f.x0) / 2, hd: (f.z1 - f.z0) / 2, c: 1, s: 0, open: room.open ?? [], tag: `room:${room.name ?? ''}` },
    ...(room.colliders ?? [])];
  let x0 = f.x0, z0 = f.z0, x1 = f.x1, z1 = f.z1;
  for (const o of room.open ?? []) { const b = shapeBounds(o); x0 = Math.min(x0, b[0]); z0 = Math.min(z0, b[1]); x1 = Math.max(x1, b[2]); z1 = Math.max(z1, b[3]); }
  const M = 1;
  const api = fieldCollision(shapes, { x0: Math.floor(x0 - M), z0: Math.floor(z0 - M), x1: Math.ceil(x1 + M), z1: Math.ceil(z1 + M) }, radius, { doors: [] });
  api.stats.ms = Math.round(performance.now() - t0);
  return api;
}

/** The shared core: an SDF grid over `bounds` from `shapes` + move / resolve / A* (see the header). */
export function fieldCollision(shapes, bounds, radius = PLAYER_RADIUS, { doors = [] } = {}) {
  const OX = bounds.x0, OZ = bounds.z0, W = bounds.x1 - bounds.x0, H = bounds.z1 - bounds.z0;
  // ---- the SDF grid: min over shapes (each shape only touches the cells within FAR of its bounds)
  const NX = Math.round(W / CELL) + 1, NZ = Math.round(H / CELL) + 1;
  const field = new Float32Array(NX * NZ).fill(FAR);
  for (const sh of shapes) {
    const [x0, z0, x1, z1] = shapeBounds(sh);
    const i0 = Math.max(0, Math.floor((x0 - FAR - OX) / CELL)), i1 = Math.min(NX - 1, Math.ceil((x1 + FAR - OX) / CELL));
    const j0 = Math.max(0, Math.floor((z0 - FAR - OZ) / CELL)), j1 = Math.min(NZ - 1, Math.ceil((z1 + FAR - OZ) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = shapeSd(sh, OX + i * CELL, OZ + j * CELL), k = j * NX + i;
      if (d < field[k]) field[k] = d;
    }
  }
  /** Bilinear SDF sample (outside the map: solid). */
  const sdf = (x, z) => {
    const fx = (x - OX) / CELL, fz = (z - OZ) / CELL;
    if (!(fx >= 0 && fz >= 0 && fx < NX - 1 && fz < NZ - 1)) return -1;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * NX + i;
    return (field[k] * (1 - u) + field[k + 1] * u) * (1 - v) + (field[k + NX] * (1 - u) + field[k + NX + 1] * u) * v;
  };
  const grad = (x, z, out = { x: 0, z: 0 }) => {
    const e = CELL * 0.5;
    let gx = sdf(x + e, z) - sdf(x - e, z), gz = sdf(x, z + e) - sdf(x, z - e);
    const l = Math.hypot(gx, gz);
    if (l < 1e-6) { gx = 0; gz = 1; } else { gx /= l; gz /= l; }
    out.x = gx; out.z = gz;
    return out;
  };
  const free = (x, z, r = radius) => sdf(x, z) >= r;
  const g = { x: 0, z: 0 };
  /** Push pos (Vector3-like, y ignored) out of the geometry along the SDF gradient. Returns true if it moved. */
  function resolve(pos, r = radius) {
    let moved = false;
    for (let k = 0; k < 6; k++) {
      const d = sdf(pos.x, pos.z);
      if (d >= r - 1e-4) break;
      grad(pos.x, pos.z, g);
      pos.x += g.x * (r - d + 1e-3); pos.z += g.z * (r - d + 1e-3);
      moved = true;
    }
    return moved;
  }
  /** Move pos by (dx, dz) in <= 8 cm sub-steps, sliding along walls. Returns the distance actually travelled. */
  function move(pos, dx, dz, r = radius) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) return 0;
    const n = Math.max(1, Math.ceil(len / 0.08));
    const sx = dx / n, sz = dz / n, x0 = pos.x, z0 = pos.z;
    for (let k = 0; k < n; k++) {
      const px = pos.x, pz = pos.z;
      pos.x += sx; pos.z += sz;
      if (sdf(pos.x, pos.z) < r) {
        resolve(pos, r);
        // a corner pocket the push-out cannot leave: stay put
        if (sdf(pos.x, pos.z) < r - 0.005) { pos.x = px; pos.z = pz; break; }
      }
    }
    return Math.hypot(pos.x - x0, pos.z - z0);
  }
  /** Nearest free point to (x, z): rings of samples out to 6 m. */
  function nearestFree(x, z, r = radius) {
    if (free(x, z, r + 0.01)) return { x, z };
    for (let rad = 0.1; rad <= 6; rad += 0.1) {
      const n = Math.max(8, Math.ceil((2 * Math.PI * rad) / 0.1));
      let best = null, bd = -Infinity;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, px = x + Math.sin(a) * rad, pz = z + Math.cos(a) * rad;
        const d = sdf(px, pz);
        if (d >= r + 0.01 && d > bd) { bd = d; best = { x: px, z: pz }; }
      }
      if (best) return best;
    }
    return null;
  }
  /** Is the straight segment a -> b free for a circle of radius r? */
  function lineFree(a, b, r = radius) {
    const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 0.05));
    for (let k = 0; k <= n; k++) { const u = k / n; if (sdf(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u) < r) return false; }
    return true;
  }

  // ---- A* on the path grid
  const PX = Math.floor(W / PATH_CELL), PZ = Math.floor(H / PATH_CELL);
  const pfree = new Uint8Array(PX * PZ);
  for (let j = 0; j < PZ; j++) for (let i = 0; i < PX; i++) pfree[j * PX + i] = sdf(OX + (i + 0.5) * PATH_CELL, OZ + (j + 0.5) * PATH_CELL) >= radius + 0.03 ? 1 : 0;
  const cellOf = (p) => [Math.min(PX - 1, Math.max(0, Math.floor((p.x - OX) / PATH_CELL))), Math.min(PZ - 1, Math.max(0, Math.floor((p.z - OZ) / PATH_CELL)))];
  const centre = (i, j) => ({ x: OX + (i + 0.5) * PATH_CELL, z: OZ + (j + 0.5) * PATH_CELL });
  function nearestCell(p) {
    const [ci, cj] = cellOf(p);
    if (pfree[cj * PX + ci]) return [ci, cj];
    let best = null, bd = Infinity;
    for (let rr = 1; rr < 24 && !best; rr++) for (let j = cj - rr; j <= cj + rr; j++) for (let i = ci - rr; i <= ci + rr; i++) {
      if (i < 0 || j < 0 || i >= PX || j >= PZ || !pfree[j * PX + i]) continue;
      const c = centre(i, j), d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bd) { bd = d; best = [i, j]; }
    }
    return best;
  }
  // ---- connected regions of the path grid (4-neighbour flood fill = A*'s no-corner-cutting moves). The MAIN region is
  // the largest one (the town's streets / the room's floor); the rest are pockets (behind the north row, between trunks)
  // that a teleport must not drop the player into: they could walk ~1 m and get stuck.
  const region = new Int32Array(PX * PZ).fill(-1);
  let mainRegion = -1;
  {
    const sizes = [], stack = [];
    for (let k0 = 0; k0 < PX * PZ; k0++) {
      if (!pfree[k0] || region[k0] >= 0) continue;
      const id = sizes.length;
      let n = 0;
      region[k0] = id; stack.push(k0);
      while (stack.length) {
        const k = stack.pop(), i = k % PX, j = (k - i) / PX;
        n++;
        if (i > 0 && pfree[k - 1] && region[k - 1] < 0) { region[k - 1] = id; stack.push(k - 1); }
        if (i < PX - 1 && pfree[k + 1] && region[k + 1] < 0) { region[k + 1] = id; stack.push(k + 1); }
        if (j > 0 && pfree[k - PX] && region[k - PX] < 0) { region[k - PX] = id; stack.push(k - PX); }
        if (j < PZ - 1 && pfree[k + PX] && region[k + PX] < 0) { region[k + PX] = id; stack.push(k + PX); }
      }
      sizes.push(n);
    }
    let best = 0;
    sizes.forEach((n, id) => { if (n > best) { best = n; mainRegion = id; } });
  }
  /** Is (x, z) in the main walkable region (its own path cell or a free neighbour cell of it)? */
  function reachable(x, z) {
    if (mainRegion < 0) return false;
    const [ci, cj] = cellOf({ x, z });
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= PX || j >= PZ) continue;
      const k = j * PX + i;
      if (region[k] === mainRegion) { const c = centre(i, j); if (lineFree({ x, z }, c, radius - 0.02)) return true; }
    }
    return false;
  }
  /** Nearest free point to (x, z) that is in the main region (teleports): nearestFree first, else the closest main
   *  path cell centre within 20 m. null when nothing is found. */
  function nearestReachable(x, z, r = radius) {
    const f = nearestFree(x, z, r);
    if (f && reachable(f.x, f.z)) return f;
    if (mainRegion < 0) return null;
    const [ci, cj] = cellOf({ x, z });
    const RR = Math.ceil(20 / PATH_CELL);
    let best = null, bd = Infinity;
    for (let rr = 0; rr <= RR; rr++) {
      if (best && (rr - 1) * PATH_CELL > bd) break;   // rings beyond the best distance cannot win
      for (let j = cj - rr; j <= cj + rr; j++) for (let i = ci - rr; i <= ci + rr; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== rr) continue;
        if (i < 0 || j < 0 || i >= PX || j >= PZ || region[j * PX + i] !== mainRegion) continue;
        const c = centre(i, j), d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) { bd = d; best = c; }
      }
    }
    return best;
  }

  /** A* from -> to (world points); returns smoothed waypoints [{x, z}] (excluding `from`), or null if unreachable. */
  function findPath(from, to) {
    const s = nearestCell(from), e = nearestCell(to);
    if (!s || !e) return null;
    const goal = free(to.x, to.z, radius + 0.01) ? { x: to.x, z: to.z } : centre(e[0], e[1]);
    if (lineFree(from, goal)) return [goal];
    const N = PX * PZ, gs = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const si = s[1] * PX + s[0], ei = e[1] * PX + e[0];
    const h = (k) => { const i = k % PX, j = (k - i) / PX, dx = Math.abs(i - e[0]), dz = Math.abs(j - e[1]); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
    // binary heap of [f, k]
    const heap = [];
    const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    gs[si] = 0; push(h(si), si);
    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false, iter = 0;
    while (heap.length && iter++ < N) {
      const [, k] = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === ei) { found = true; break; }
      const i = k % PX, j = (k - i) / PX;
      for (const [di, dj, c] of NB) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= PX || nj >= PZ) continue;
        const nk = nj * PX + ni;
        if (!pfree[nk] || closed[nk]) continue;
        if (di && dj && (!pfree[j * PX + ni] || !pfree[nj * PX + i])) continue;   // no corner cutting
        const ng = gs[k] + c;
        if (ng < gs[nk]) { gs[nk] = ng; prev[nk] = k; push(ng + h(nk), nk); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = ei; k >= 0 && k !== si; k = prev[k]) { const i = k % PX; cells.push(centre(i, (k - i) / PX)); }
    cells.reverse();
    cells[cells.length - 1] = goal;
    // string pulling: from each anchor, jump to the farthest waypoint still in straight line of sight
    const out = [];
    let a = { x: from.x, z: from.z }, idx = 0;
    while (idx < cells.length) {
      let far = idx;
      for (let k = cells.length - 1; k > idx; k--) if (lineFree(a, cells[k], radius - 0.02)) { far = k; break; }
      out.push(cells[far]); a = cells[far]; idx = far + 1;
    }
    return out;
  }

  /** Debug outlines of every shape (C-space: the player's centre cannot enter the outline + R). ?collide=1 */
  function overlay() {
    const pts = [];
    const ring = (fn, n) => { for (let k = 0; k < n; k++) { const a = fn(k / n), b = fn((k + 1) / n); pts.push(a[0], 0.06, a[1], b[0], 0.06, b[1]); } };
    for (const sh of shapes) {
      if (sh.tag?.startsWith('ground:') && !/[~^hw]/.test(sh.tag.slice(7))) continue;
      if (sh.kind === 'circle') ring((u) => [sh.cx + Math.sin(u * 6.283) * sh.r, sh.cz + Math.cos(u * 6.283) * sh.r], 24);
      else {
        const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
          const lx = a * sh.hw, lz = b * sh.hd;   // local -> world (inverse of sdBox's rotation)
          return [sh.cx + lx * sh.c + lz * sh.s, sh.cz - lx * sh.s + lz * sh.c];
        });
        for (let k = 0; k < 4; k++) pts.push(cs[k][0], 0.06, cs[k][1], cs[(k + 1) % 4][0], 0.06, cs[(k + 1) % 4][1]);
        for (const c of sh.carve ?? []) {
          const ks = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c.cx + a * c.hw * c.c + b * c.hd * c.s, c.cz - a * c.hw * c.s + b * c.hd * c.c]);
          for (let k = 0; k < 4; k++) pts.push(ks[k][0], 0.08, ks[k][1], ks[(k + 1) % 4][0], 0.08, ks[(k + 1) % 4][1]);
        }
      }
    }
    for (const d of doors) pts.push(d.pos.x, 0.1, d.pos.z, d.pos.x + d.normal[0] * 1.2, 0.1, d.pos.z + d.normal[1] * 1.2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff3355, depthTest: false }));
    lines.name = 'demo-collision-overlay'; lines.renderOrder = 999; lines.frustumCulled = false;
    return lines;
  }

  const stats = { shapes: shapes.length, ms: 0, freeCells: pfree.reduce((a, b) => a + b, 0), mainCells: region.reduce((a, v) => a + (v === mainRegion ? 1 : 0), 0) };
  return { R: radius, sdf, grad, free, resolve, move, nearestFree, nearestReachable, reachable, lineFree, findPath, shapes, doors, overlay, stats };
}
