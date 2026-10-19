// Cottage interiors (owner: interior-kit). docs/INTERIORS.md is the contract. Kit: ./kit.js. One module per cottage:
// ./house-<i>.js (default export build(room, ctx); stubs call ctx.standard()).
//
//   import { buildInterior, aimLights } from './src/town/interiors/index.js';
//   const it = await buildInterior(engine, 'house-0', { tod: 'night' });
//   engine.scene.add(it.group);                       // the caller adds it (like the composer adds piece groups)
//   engine.onUpdate((t, dt) => it.update(t, dt));     // wall cut-away follows the camera yaw, animated bits
//   engine.camera.set({ target: it.camera.target, yaw: it.camera.yaw, viewHeight: it.camera.viewHeight, pitch: Math.PI / 6 });
//   player.teleport(it.spawn.x, it.spawn.z, it.spawn.facing);  // and it.collision.move(pos, dx, dz, R) while inside;
//   if (Math.hypot(p.x - it.exit.x, p.z - it.exit.z) < it.exit.r) -> back to it.townDoor {x, z, facing}
//
// interior = {
//   id ('house-0'), houseId, index, name,
//   group            THREE.Group at the interior's own far-away origin (originOf(i): x = 200 + 30 i, z = 20, + ANTI_TIE)
//   origin           Vector3 (world position of the room-local origin = the floor centre)
//   room             {w, d, h, t, doorW} room-local dimensions (metres)
//   floor            {x0, z0, x1, z1} world rect of the floor (walls stand outside it)
//   colliders        [{x0, z0, x1, z1, kind}] world rects: walls + furniture (axis-aligned)
//   collision        {R, sdf(x, z), free(x, z, r?), move(pos, dx, dz, r?), nearestFree(x, z, r?)} world coordinates;
//                    sdf >= 0 = distance to the nearest wall / furniture (the doorway gap is open)
//   spawn            {x, z, facing}   just inside the door, facing into the room (facing: rad, 0 = +z, atan2(dx, dz))
//   exit             {x, z, r}        the doorway gap: stepping into it walks you back out
//   townDoor         {x, z, facing}   where to put the player in town when they leave (in front of the PLACED door,
//                                     facing away from it) - layout.js houses[i] doorPoint / doorNormal
//   camera           {target: Vector3, viewHeight, yaw: 0, pitch: PI/6}  the cozy cut-away dollhouse view
//   bed              {x, z, y, facing} the bed (the head end; y = mattress top); visitPoint {x, z, facing} beside it
//   spots            {name: {x, z, facing}} world (spawn, bed, visit, hearth, table, + house extras)
//   lights           [{pos: Vector3 (world), color, r, kind 'fire'|'lantern'|'window', intensity}]  aim PointLights at them
//                    (aimLights) - the interior never creates PointLights itself (a new light count recompiles shaders)
//   update(t, dt)    wall cut-away by camera yaw (the walls between the camera and the room drop to a 0.42 m stub),
//                    house animations
//   setYaw(yaw)      force the cut-away for a yaw (update() does it from engine.camera.yaw)
//   setTimeOfDay(tod | hex)   the light outside the windows (kit WINDOW_SKY: morning noon afternoon golden night)
//   dispose()        remove + free geometry
//   stats            {calls, tris, buildMs, colliders, lights, stub}
// }
import * as THREE from 'three';
import * as layout from '../layout.js';
import * as ikit from './kit.js';
import { Room, FURNITURE, WALL, CLOTH, POTIONS, GLOW, setWindowSky, INTERIOR_PALETTES } from './kit.js';
import { TOWN_PALETTE, paintRamp } from '../palette.js';
import { M } from '../kit.js';

/** Interiors live far east of the town (the ground terrain ends at x ~102). */
export const INTERIOR_ORIGIN = { x: 200, z: 20, spacing: 30 };
/** Same sub-texel anti-tie nudge as the town root (town.js ANTI_TIE): round authoring values never sit on pixel centres. */
export const INTERIOR_TIE = new THREE.Vector3(0.0047, 0, 0.0071);
export const HOUSE_COUNT = 15;
export const PLAYER_RADIUS = 0.28;

const indexOf = (houseId) => (typeof houseId === 'number' ? houseId : Number(String(houseId).replace('house-', '')));
/** World position of interior i's room-local origin (floor centre). */
export function originOf(houseId) {
  const i = indexOf(houseId);
  return new THREE.Vector3(INTERIOR_ORIGIN.x + INTERIOR_ORIGIN.spacing * i, 0, INTERIOR_ORIGIN.z).add(INTERIOR_TIE);
}
/** Which interior (index) a world point is in (null = in town). */
export function interiorAt(x, z) {
  const i = Math.round((x - INTERIOR_ORIGIN.x) / INTERIOR_ORIGIN.spacing);
  if (i < 0 || i >= HOUSE_COUNT) return null;
  const o = originOf(i);
  return Math.abs(x - o.x) < 12 && Math.abs(z - o.z) < 12 ? i : null;
}

// ------------------------------------------------------------------------------------------------ the standard room
/**
 * The game's furnishing (pipgws packages/assets/src/layout.ts furnishHouse) on the 3D room: back-wall fireplace + two
 * windows (+ a third / a wall shelf), bed (wide for i % 4 == 2) with a nightstand, rug, table (round for odd i) with two
 * chairs, wardrobe / bookshelf / loom (i % 3), chest, plant, barrel (even i), doormat; mirrored for odd houses.
 * Options (all optional) - a house module overrides what makes it ITS room:
 *   shell: {...}  Room.shell options (windows replace the defaults)
 *   skip: ['loom', 'barrel', ...]   items to leave out (bed, nightstand, rug, table, chairs, tall, chest, plant, barrel,
 *         doormat, fireplace, shelf, lantern)
 *   bed {quilt, wide}, rug {tones, border, oval, pattern}, table {round, extra}, tall 'wardrobe'|'bookshelf'|'loom'|null,
 *   fireplace {...WALL.fireplace opts}, shelf {items}, lantern true (a lantern hung over the table)
 *   decor: [[WALL fn name, opts], ...]  extra wall pieces;  extra(room, P) after the furniture (P = the tile helper)
 * Returns {bed, visit, table, mirror, P} (room-local) for the caller's spots.
 */
export function standardRoom(room, i, o = {}) {
  const mirror = o.mirror ?? (i & 1) === 1;
  const P = (dx, dy, w = 1, h = 1) => room.tile(dx, dy, { mirror, wTiles: w, hTiles: h });
  const skip = new Set(o.skip ?? []);
  const s = mirror ? -1 : 1;
  const wideBed = o.bed?.wide ?? i % 4 === 2;
  // back wall: windows at tiles 2 and 7; tile 3 = a wall shelf (i % 3 == 0) or a second pane (double window)
  const w2 = P(2, 1), w3 = P(3, 1, 2), w7 = P(7, 1);
  // slot3 (the back-wall slot at tiles 3-4): 'window' (a double window with tile 2), 'shelf', [WALL fn, opts], fn(room, x), null
  const slot = o.slot3 !== undefined ? o.slot3 : (i % 3 === 0 ? 'shelf' : 'window');
  const windows = o.shell?.windows ?? [
    slot !== 'window' ? { x: w2.x, w: 0.8 } : { x: (w2.x + P(3, 1).x) / 2, w: 1.5, panes: [4, 3] },
    { x: w7.x, w: 0.8 },
  ].map((w) => ({ curtains: o.curtains === false ? null : (o.curtains ?? room.pal.paint), ...w }));
  room.shell({ ...(o.shell ?? {}), windows });
  if (!skip.has('fireplace')) WALL.fireplace(room, { wall: 'back', x: P(5, 1, 2).x, ...(o.fireplace ?? {}) });
  if (slot === 'shelf' && !skip.has('shelf')) WALL.shelf(room, { wall: 'back', x: w3.x, y: 1.5, w: 1.0, ...(o.shelf ?? {}) });
  else if (Array.isArray(slot)) WALL[slot[0]](room, { wall: 'back', x: w3.x, ...(slot[1] ?? {}) });
  else if (typeof slot === 'function') slot(room, w3.x);
  // bed against the back wall (headboard at the wall), nightstand beside it
  const bedT = P(1, 2.5, wideBed ? 2 : 1, 1);
  const bedW = wideBed ? 1.55 : 1.05;
  const bx = mirror ? room.W / 2 - bedW / 2 - 0.08 : -room.W / 2 + bedW / 2 + 0.08;
  const bz = -room.D / 2 + 1.0;
  let bed = null;
  if (!skip.has('bed')) bed = FURNITURE.bed(room, { x: bx, z: bz, wide: wideBed, quilt: o.bed?.quilt ?? ['red', 'blue', 'green', 'purple', 'gold'][i % 5], ...(o.bed ?? {}) });
  const nsx = bx + s * (bedW / 2 + 0.38);
  if (!skip.has('nightstand')) FURNITURE.nightstand(room, { x: nsx, z: -room.D / 2 + 0.24 });
  // rug, table + chairs
  const rugC = P(5.5, 5);
  if (!skip.has('rug')) FURNITURE.rug(room, { x: rugC.x, z: rugC.z, w: 3.2, d: 2.2, tones: ['red', 'blue', 'green'][i % 3], ...(o.rug ?? {}) });
  const tc = P(5, 4, 2);
  const round = o.table?.round ?? i % 2 === 1;
  if (!skip.has('table')) FURNITURE.table(room, { x: tc.x, z: tc.z, round, ...(o.table ?? {}) });
  if (!skip.has('chairs')) {
    const half = (round ? 1.15 : 1.5) / 2 + 0.36;
    FURNITURE.chair(room, { x: tc.x - half, z: tc.z, ry: Math.PI / 2 });
    FURNITURE.chair(room, { x: tc.x + half, z: tc.z, ry: -Math.PI / 2 });
  }
  // the lantern hangs over the front of the rug (over the table it would hide the hearth at the dollhouse camera)
  if (o.lantern !== false && !skip.has('lantern')) FURNITURE.hangingLantern(room, { x: tc.x - s * 1.3, z: tc.z + 1.1, y: 2.15 });
  // the tall piece in the back corner opposite the bed
  const tall = o.tall !== undefined ? o.tall : (i % 3 === 1 ? 'bookshelf' : i % 3 === 2 ? 'loom' : 'wardrobe');
  const tx = mirror ? -room.W / 2 + 0.75 : room.W / 2 - 0.75;
  if (tall && !skip.has('tall')) {
    if (tall === 'loom') FURNITURE.loom(room, { x: tx - s * 0.05, z: -room.D / 2 + 0.7 });
    else FURNITURE[tall](room, { x: tx, z: -room.D / 2 + (tall === 'wardrobe' ? 0.3 : 0.22) });
  }
  // front corners: chest by the side wall, plant + barrel by the front
  const cx = mirror ? -room.W / 2 + 0.3 : room.W / 2 - 0.3;
  if (!skip.has('chest')) FURNITURE.chest(room, { x: cx, z: P(9, 6).z, ry: -s * Math.PI / 2 });
  const pl = P(1, 7);
  if (!skip.has('plant')) FURNITURE.plant(room, { x: mirror ? room.W / 2 - 0.35 : -room.W / 2 + 0.35, z: pl.z + 0.2 });
  if (i % 2 === 0 && !skip.has('barrel')) FURNITURE.barrel(room, { x: P(2, 7).x + s * 0.1, z: pl.z + 0.15 });
  if (!skip.has('doormat')) FURNITURE.doormat(room, { x: 0, z: room.D / 2 - 0.4 });
  for (const [fn, opts] of o.decor ?? []) WALL[fn](room, opts);
  o.extra?.(room, P);
  const visit = { x: bx + s * (bedW / 2 + 0.4), z: bz + 0.5, facing: -s * Math.PI / 2 };
  return { bed: bed ? { x: bx, z: bz - 0.6, y: 0.55, facing: 0 } : null, visit, table: tc, mirror, P };
}

// ------------------------------------------------------------------------------------------------ collision
/** Signed distance to an axis-aligned rect (negative inside). */
function sdRect(r, x, z) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, hx = (r.x1 - r.x0) / 2, hz = (r.z1 - r.z0) / 2;
  const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}
function makeCollision(floor, gap, furniture, R0 = PLAYER_RADIUS) {
  const sdf = (x, z) => {
    let d = Math.max(-sdRect(floor, x, z), -sdRect(gap, x, z));
    for (const r of furniture) d = Math.min(d, sdRect(r, x, z));
    return d;
  };
  const grad = (x, z) => {
    const e = 0.01, gx = sdf(x + e, z) - sdf(x - e, z), gz = sdf(x, z + e) - sdf(x, z - e), l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l];
  };
  const resolve = (p, R) => {
    for (let k = 0; k < 6; k++) {
      const d = sdf(p.x, p.z);
      if (d >= R) return p;
      const [gx, gz] = grad(p.x, p.z);
      p.x += gx * (R - d + 1e-3); p.z += gz * (R - d + 1e-3);
    }
    return p;
  };
  return {
    R: R0, sdf,
    free: (x, z, R = R0) => sdf(x, z) >= R,
    /** Move pos ({x, z} / Vector3, modified in place) by (dx, dz), sliding along walls and furniture. */
    move(pos, dx, dz, R = R0) {
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08));
      for (let i = 0; i < n; i++) { pos.x += dx / n; pos.z += dz / n; resolve(pos, R); }
      return pos;
    },
    nearestFree(x, z, R = R0) {
      if (sdf(x, z) >= R) return { x, z };
      for (let rr = 0.1; rr < 4; rr += 0.1) for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * rr, pz = z + Math.sin((a / 16) * Math.PI * 2) * rr;
        if (sdf(px, pz) >= R) return { x: px, z: pz };
      }
      return null;
    },
  };
}

// ------------------------------------------------------------------------------------------------ build
/** Room defaults per cottage from the layout record (exterior wall kind -> interior walls / floor, v1 palette index). */
export function roomDefaults(rec) {
  return { wall: rec?.style?.wall ?? 'plaster', pal: rec?.style?.interior ?? rec?.index ?? 0 };
}

/**
 * Build cottage i's interior. ctx (optional): {tod, params (URLSearchParams), strict (throw if the house module fails)}.
 * The house module (./house-<i>.js) default export: build(room, hctx) (may be async) where hctx = {index, id, record,
 * layout, kit (./kit.js), FURNITURE, WALL, CLOTH, POTIONS, GLOW, TOWN_PALETTE, paintRamp, M, standard(opts)} and
 * returns optional {spots, bed, visit, extras: [Object3D room-local, e.g. animated parts], update(t, dt), stub}. A module that fails to import / build falls back to the
 * standard room (console.warn) so the demo can always enter.
 */
export async function buildInterior(engine, houseId, ctx = {}) {
  const t0 = performance.now();
  const i = indexOf(houseId), id = `house-${i}`;
  const rec = layout.houses.find((h) => h.id === id);
  if (!rec) throw new Error(`interiors: unknown house '${houseId}'`);
  const D = roomDefaults(rec);
  const sizes = ctx.size ?? {};
  let room = new Room(engine, { id, index: i, ...D, ...sizes });
  let std = null;
  const hctx = {
    index: i, id, record: rec, layout, kit: ikit, FURNITURE, WALL, CLOTH, POTIONS, GLOW, TOWN_PALETTE, paintRamp, M, INTERIOR_PALETTES,
    params: ctx.params ?? new URLSearchParams(), tod: ctx.tod ?? 'noon',
    standard: (o = {}) => (std = standardRoom(room, i, o)),
  };
  let res = {}, failed = false;
  try {
    const mod = await import(`./house-${i}.js`);
    if (typeof mod.default !== 'function') throw new Error(`interiors: ./house-${i}.js has no default export build(room, ctx)`);
    if (mod.ROOM) { room = new Room(engine, { id, index: i, ...D, ...mod.ROOM, ...sizes }); }
    res = (await mod.default(room, hctx)) ?? {};
  } catch (e) {
    if (ctx.strict) throw e;
    console.warn(`[interiors] house-${i} failed, using the standard room: ${e?.stack || e}`);
    failed = true;
    room = new Room(engine, { id, index: i, ...D, ...sizes });
    hctx.standard = (o = {}) => (std = standardRoom(room, i, o));
    std = standardRoom(room, i, {});
  }
  const built = room.finish();
  const origin = originOf(i);
  const group = built.group;
  for (const o of res.extras ?? []) group.add(o);           // house extras (animated parts), room-local
  group.position.copy(origin);
  group.name = `${id}-interior`;
  group.userData.interior = id;
  group.updateMatrixWorld(true);

  // ---- world-space contract data
  const W = (x, z) => ({ x: origin.x + x, z: origin.z + z });
  const WR = (r) => ({ x0: origin.x + r.x0, z0: origin.z + r.z0, x1: origin.x + r.x1, z1: origin.z + r.z1, kind: r.kind });
  const colliders = built.colliders.map(WR);
  const { W: RW, D: RD, H: RH, T: RT, doorW } = room;
  const floor = WR({ x0: -RW / 2, z0: -RD / 2, x1: RW / 2, z1: RD / 2 });
  const gap = WR({ x0: -doorW / 2, z0: RD / 2 - 0.1, x1: doorW / 2, z1: RD / 2 + RT + 0.05 });
  const collision = makeCollision(floor, gap, colliders.filter((r) => r.kind !== 'wall'));
  const sp = collision.nearestFree(origin.x, origin.z + RD / 2 - 0.65) ?? W(0, RD / 2 - 0.65);
  const spawn = { x: sp.x, z: sp.z, facing: Math.PI };
  const exit = { ...W(0, RD / 2 + RT * 0.5), r: 0.42 };
  const [nx, nz] = rec.doorNormal;
  const townDoor = { x: rec.doorPoint.x + nx * 0.9, z: rec.doorPoint.z + nz * 0.9, facing: Math.atan2(nx, nz) };
  // camera: the whole room incl. the back wall top and the front stub, pitch 30 deg, yaw 0 (screen up = 0.866 y - 0.5 z)
  const sF = 0.866 * 0.5 - 0.5 * (RD / 2 + RT + 0.1), sB = 0.866 * (RH + 0.2) - 0.5 * (-RD / 2 - RT);
  const sc = (sF + sB) / 2;
  const viewHeight = +Math.max((sB - sF) * 1.1, ((RW + 2 * RT + 0.6) / (16 / 9)) * 1.04).toFixed(2);
  const camera = { target: new THREE.Vector3(origin.x, 0, origin.z - 2 * sc), viewHeight, yaw: 0, pitch: Math.PI / 6 };
  const bedL = res.bed ?? std?.bed ?? null, visitL = res.visit ?? std?.visit ?? null;
  const bed = bedL ? { ...W(bedL.x, bedL.z), y: bedL.y ?? 0.55, facing: bedL.facing ?? 0 } : null;
  let visitPoint = visitL ? { ...W(visitL.x, visitL.z), facing: visitL.facing ?? 0 } : null;
  if (visitPoint) { const q = collision.nearestFree(visitPoint.x, visitPoint.z); if (q) Object.assign(visitPoint, q); }
  const spots = { spawn, ...(bed ? { bed } : {}), ...(visitPoint ? { visit: visitPoint } : {}) };
  for (const [k, v] of Object.entries({ ...built.spots, ...(res.spots ?? {}) })) spots[k] = { ...W(v.x, v.z), facing: v.facing ?? Math.PI };
  // wall hugging (as the town does, api.js hugWall): a light within 0.5 m of a wall moves to 6 cm from it (fire 12 cm), so
  // it grazes the wall (no hard-edged pool disc on the plaster) while the floor in front still gets the pool
  const hug = (l) => {
    const p = [...l.pos], k = l.kind === 'fire' ? 0.12 : 0.06;
    if (p[2] - -RD / 2 < 0.5) p[2] = Math.min(p[2], -RD / 2 + k);
    if (p[0] - -RW / 2 < 0.5) p[0] = Math.min(p[0], -RW / 2 + k);
    if (RW / 2 - p[0] < 0.5) p[0] = Math.max(p[0], RW / 2 - k);
    return p;
  };
  const lights = built.lights.map((l) => { const p = l.hug === false ? l.pos : hug(l); return { ...l, pos: new THREE.Vector3(origin.x + p[0], p[1], origin.z + p[2]) }; });

  // ---- cut-away by camera yaw: a wall whose inward normal points away from the camera (it stands between the
  // camera and the room) drops to its low stub; yaw 0 = the front wall (with the doorway) is the stub
  let curKey = null;
  const setYaw = (yaw) => {
    const tx = Math.sin(yaw), tz = Math.cos(yaw);          // horizontal direction toward the camera
    const key = Math.round(yaw * 1000);
    if (key === curKey) return;
    curKey = key;
    for (const [name, w] of Object.entries(built.walls)) {
      const n = ikit.WALL_FRAME[name].n;
      const between = -(n[0] * tx + n[1] * tz) > 0.3;     // inward normal opposes the direction to the camera
      w.full.visible = !between; w.low.visible = between;
    }
  };
  setYaw(0);
  const updaters = [...built.updaters, ...(res.update ? [res.update] : [])];
  const interior = {
    id, houseId: id, index: i, name: rec.name, group, origin,
    room: { w: RW, d: RD, h: RH, t: RT, doorW }, floor, colliders, collision, spawn, exit, townDoor, camera,
    bed, visitPoint, spots, lights,
    setYaw,
    update(t, dt) {
      setYaw(engine.camera?.targetYaw ?? engine.camera?.yaw ?? 0);
      for (const f of updaters) f(t, dt);
    },
    setTimeOfDay(tod) { setWindowSky(engine, tod); },
    dispose() {
      group.parent?.remove(group);
      group.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
    },
    stats: { buildMs: Math.round(performance.now() - t0), colliders: colliders.length, lights: lights.length, stub: res.stub || failed ? 1 : 0, failed: failed ? 1 : 0 },
  };
  let calls = 0, tris = 0;
  group.traverse((o) => { if (o.isMesh) { calls++; tris += (o.geometry.getAttribute('position')?.count ?? 0) / 3; } });
  interior.stats.calls = calls; interior.stats.tris = Math.round(tris);
  if (ctx.tod) setWindowSky(engine, ctx.tod);
  return interior;
}

// ------------------------------------------------------------------------------------------------ lights
const KIND_ORDER = { fire: 0, lantern: 1, lamp: 1, holy: 2, window: 3 };
/**
 * Re-aim an EXISTING PointLight pool at an interior's light anchors (the light count never changes, so no shader
 * recompiles). pool: engine.townLights ([{light, base, anchor}]) or an array of PointLights. The fire first, then
 * lanterns / candles; unused pool lights go dark. Returns restore() (puts every light back where it was).
 * Note: town.js' flicker updater writes `intensity = base * step` for lantern / fire anchors every frame - aimLights
 * sets `base` too. kinds: only these anchor kinds (e.g. ['fire'] by day: the hearth pool without candle discs on sunlit
 * walls), scale: intensity multiplier. A time-of-day module that drives intensities itself must skip the pool while inside.
 */
export function aimLights(pool, interior, { max = Infinity, kinds = null, scale = 1 } = {}) {
  const items = (pool ?? []).map((p) => (p.isLight ? { light: p } : p)).filter((p) => p?.light);
  const saved = items.map((p) => ({ p, pos: p.light.position.clone(), color: p.light.color.clone(), distance: p.light.distance, intensity: p.light.intensity, base: p.base }));
  const want = interior.lights.filter((l) => !kinds || kinds.includes(l.kind)).sort((a, b) => (KIND_ORDER[a.kind] ?? 4) - (KIND_ORDER[b.kind] ?? 4)).slice(0, Math.min(max, items.length));
  items.forEach((p, k) => {
    const l = want[k];
    if (l) {
      p.light.position.copy(l.pos); p.light.color.set(l.color); p.light.distance = l.r; p.light.intensity = (l.intensity ?? 1.4) * scale;
      if ('base' in p) p.base = (l.intensity ?? 1.4) * scale;
    } else { p.light.intensity = 0; if ('base' in p) p.base = 0; }
  });
  return function restore() {
    for (const s of saved) {
      s.p.light.position.copy(s.pos); s.p.light.color.copy(s.color); s.p.light.distance = s.distance; s.p.light.intensity = s.intensity;
      if ('base' in s.p) s.p.base = s.base;
    }
  };
}

export { Room, FURNITURE, WALL, CLOTH, POTIONS, GLOW, setWindowSky, INTERIOR_PALETTES };
