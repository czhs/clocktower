// Demo cottage interiors (owner: player; docs/DEMO.md §4.1). Walking into a cottage's door fades to that house's
// interior (like the game's v2 TownScene / interior.ts): the room is a separate little scene placed far from the town
// (its own origin, e.g. x = 200 + 30 i), with its own collision (collision.js createRoomCollision), spawn just inside
// the door, an exit spot, and a cut-away "dollhouse" camera preset (camera.js reads player.interior.camera).
//
// The rooms come from the interior kit, src/town/interiors/index.js (owner: interior-kit agent):
//   buildInterior(engine, houseId, ctx) -> (Promise of) { group, floor, colliders, spawn {x, z, facing}, exit {x, z, r},
//     camera {target, viewHeight, yaw}, bed, visitPoint, lights, update?(t) }
// normalizeRoom() accepts the reasonable shapes of every field (rects as {x0, z0, x1, z1} | {x, z, w, d} | {cx, cz, w, d}
// | {min, max} | Box3; colliders as rects, oriented boxes {cx, cz, hw, hd, ry} or circles {x, z, r}; points as {x, z} |
// [x, z] | [x, y, z] | Vector3; yaw in radians, or degrees when |yaw| > 2 pi). Coordinates are WORLD unless the record
// says `space: 'local'` (or obviously is: a floor centred near 0 while the group sits far away), then the group's
// position is added. If the kit is missing (`?interiorKit=stub`, a failed import) or one house fails to build, a plain
// fallback room (buildStubInterior, kit Builder: shared town materials, no new programs) keeps the flow working.
//
// Lights: every Light inside a built room is moved to an always-visible holder and held at intensity 0 while the room
// is hidden (hiding a light changes the scene's light count = every lit material recompiles; docs/DEMO.md §4.3).
//
// Exports: createInteriors(demo, {radius}) -> { get(id) -> Promise<room>, peek(id), prefetch(id), rooms, kitName }
//          createFade(demo) -> { run(t, {onBlack, label, out, hold, inn}), update(t), active, el }
//          normalizeRoom(raw, houseId, {radius}) -> room;  buildStubInterior(engine, houseId, ctx) -> raw room
import * as THREE from 'three';
import * as layout from '../town/layout.js';
import { Builder } from '../town/kit.js';
import { createRoomCollision, PLAYER_RADIUS } from './collision.js';

const KIT_URL = '../town/interiors/index.js';
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ the kit
let kitP = null;
function loadKit(params) {
  if (params?.get?.('interiorKit') === 'stub') return Promise.resolve(null);
  return (kitP ??= import(KIT_URL).then((m) => {
    if (typeof m.buildInterior === 'function') return m;
    console.warn('[demo] interiors: src/town/interiors/index.js has no buildInterior(); using the fallback rooms');
    return null;
  }, (e) => { console.warn('[demo] interiors: kit import failed, using the fallback rooms:', e?.message ?? e); return null; }));
}

// ------------------------------------------------------------------------------------------------ normalising
const num = (v) => (Number.isFinite(+v) ? +v : null);
/** {x, z} from {x, z} | {x, y, z} | [x, z] | [x, y, z] | Vector3. */
function pt(p) {
  if (!p) return null;
  if (Array.isArray(p)) return p.length >= 3 ? { x: +p[0], z: +p[2] } : { x: +p[0], z: +p[1] };
  const x = num(p.x ?? p.cx), z = num(p.z ?? p.cz);
  return x === null || z === null ? null : { x, z };
}
/** {x0, z0, x1, z1} from the usual rect shapes. */
function rect(r) {
  if (!r) return null;
  if (Array.isArray(r) && r.length === 4) return { x0: +r[0], z0: +r[1], x1: +r[2], z1: +r[3] };
  if (r.isBox3 || (r.min && r.max)) { const a = pt(r.min), b = pt(r.max); return a && b ? { x0: a.x, z0: a.z, x1: b.x, z1: b.z } : null; }
  if (r.x0 !== undefined) return { x0: +r.x0, z0: +r.z0, x1: +r.x1, z1: +r.z1 };
  if (r.minX !== undefined) return { x0: +r.minX, z0: +r.minZ, x1: +r.maxX, z1: +r.maxZ };
  if (r.hw !== undefined) { const c = pt(r); return { x0: c.x - r.hw, z0: c.z - r.hd, x1: c.x + r.hw, z1: c.z + r.hd }; }
  if (r.cx !== undefined && r.w !== undefined) return { x0: r.cx - r.w / 2, z0: r.cz - r.d / 2, x1: r.cx + r.w / 2, z1: r.cz + r.d / 2 };
  if (r.w !== undefined) return { x0: +r.x, z0: +r.z, x1: +r.x + +r.w, z1: +r.z + +(r.d ?? r.h) };
  return null;
}
/** A collision shape (collision.js format) from a rect / oriented box / circle. */
function shape(c, off) {
  if (!c) return null;
  const tag = c.tag ?? c.name ?? c.kind ?? 'furniture';
  if (c.kind === 'circle' || (c.r !== undefined && c.w === undefined && c.hw === undefined)) {
    const p = pt(c);
    return p ? { kind: 'circle', cx: p.x + off.x, cz: p.z + off.z, r: +c.r, tag } : null;
  }
  const ry = num(c.ry ?? c.yaw ?? c.rot) ?? 0;
  if (c.kind === 'box' && c.c !== undefined) return { ...c, cx: c.cx + off.x, cz: c.cz + off.z, tag };
  if (ry && (c.hw !== undefined || c.w !== undefined)) {
    const p = pt(c), hw = c.hw ?? c.w / 2, hd = c.hd ?? c.d / 2;
    // {cx, cz, w, d, ry}: centred; a corner {x, z, w, d} with a rotation is read as centred too (documented)
    return { kind: 'box', cx: p.x + off.x, cz: p.z + off.z, hw, hd, c: Math.cos(ry), s: Math.sin(ry), round: c.round ?? 0, tag };
  }
  const r = rect(c);
  if (!r) return null;
  return { kind: 'box', cx: (r.x0 + r.x1) / 2 + off.x, cz: (r.z0 + r.z1) / 2 + off.z, hw: Math.abs(r.x1 - r.x0) / 2, hd: Math.abs(r.z1 - r.z0) / 2, c: 1, s: 0, round: c.round ?? 0, tag };
}
const yawOf = (y) => { const v = num(y) ?? 0; return Math.abs(v) > TAU + 1e-6 ? (v * Math.PI) / 180 : v; };

/**
 * Normalise a kit room into the demo's record:
 * { id, name, group, floor {x0, z0, x1, z1}, colliders [shape], open [box], collision, spawn {x, z, facing},
 *   exit {x, z, r}, out [nx, nz] (the way out of the door), camera {target Vector3, viewHeight, yaw, pitch?},
 *   bed, visitPoint, lights, raw, update(t, info), show(on), shown }
 */
export function normalizeRoom(raw, houseId, { radius = PLAYER_RADIUS } = {}) {
  const group = raw?.group ?? raw?.root ?? (raw?.isObject3D ? raw : null);
  if (!group) throw new Error(`interior ${houseId}: no group`);
  group.updateMatrixWorld(true);
  const origin = new THREE.Vector3().setFromMatrixPosition(group.matrixWorld);
  let floor = rect(raw.floor ?? raw.room ?? raw.bounds ?? raw.rect);
  if (!floor) {
    // no floor rect: the group's ground-level bounds
    const b = new THREE.Box3().setFromObject(group);
    floor = { x0: b.min.x + 0.3, z0: b.min.z + 0.3, x1: b.max.x - 0.3, z1: b.max.z - 0.3 };
  }
  if (floor.x1 < floor.x0) [floor.x0, floor.x1] = [floor.x1, floor.x0];
  if (floor.z1 < floor.z0) [floor.z0, floor.z1] = [floor.z1, floor.z0];
  const fc = { x: (floor.x0 + floor.x1) / 2, z: (floor.z0 + floor.z1) / 2 };
  const local = raw.space === 'local' || (raw.space !== 'world' && Math.hypot(fc.x - origin.x, fc.z - origin.z) > 15 && Math.hypot(fc.x, fc.z) < 15);
  const off = local ? { x: origin.x, z: origin.z } : { x: 0, z: 0 };
  const P = (p) => { const q = pt(p); return q ? { x: q.x + off.x, z: q.z + off.z } : null; };
  floor = { x0: floor.x0 + off.x, z0: floor.z0 + off.z, x1: floor.x1 + off.x, z1: floor.z1 + off.z };
  const colliders = (raw.colliders ?? raw.collision ?? raw.solids ?? raw.furniture ?? []).map((c) => shape(c, off)).filter(Boolean);
  const cx = (floor.x0 + floor.x1) / 2, cz = (floor.z0 + floor.z1) / 2;
  const spawn = P(raw.spawn) ?? { x: cx, z: floor.z1 - 0.8 };
  spawn.facing = num(raw.spawn?.facing ?? raw.spawn?.face) ?? Math.PI;
  const exit = P(raw.exit) ?? { x: spawn.x, z: Math.min(floor.z1 - 0.3, spawn.z + 0.6) };
  exit.r = num(raw.exit?.r) ?? 0.45;
  // the way out: the record's normal, else spawn -> exit, else +z (the cut-away front faces the camera)
  let out = raw.exit?.normal ? [...raw.exit.normal] : [exit.x - spawn.x, exit.z - spawn.z];
  let ol = Math.hypot(out[0], out[1]);
  if (ol < 0.05) { out = [0, 1]; ol = 1; }
  out = [out[0] / ol, out[1] / ol];
  // an exit spot outside the floor rect (in the doorway): open a passage to it
  const open = [];
  const inside = exit.x > floor.x0 + 0.05 && exit.x < floor.x1 - 0.05 && exit.z > floor.z0 + 0.05 && exit.z < floor.z1 - 0.05;
  if (!inside) {
    const nx = Math.min(floor.x1, Math.max(floor.x0, exit.x)), nz = Math.min(floor.z1, Math.max(floor.z0, exit.z));
    const L = Math.hypot(exit.x - nx, exit.z - nz) + exit.r + 0.4;
    open.push({ kind: 'box', cx: (nx + exit.x) / 2, cz: (nz + exit.z) / 2, hw: Math.max(0.5, exit.r + 0.2), hd: L / 2 + 0.2, c: out[1], s: out[0], tag: 'doorway' });
  }
  const cam = raw.camera ?? {};
  const tq = cam.target ? (Array.isArray(cam.target) || cam.target.isVector3 || cam.target.y !== undefined ? cam.target : null) : null;
  const tgt = P(cam.target) ?? { x: cx, z: cz };
  const camera = {
    target: new THREE.Vector3(tgt.x, tq ? (Array.isArray(tq) ? (tq.length >= 3 ? +tq[1] : 0) : +(tq.y ?? 0)) : 0, tgt.z),
    viewHeight: num(cam.viewHeight) ?? Math.max(6, Math.min(12, (floor.z1 - floor.z0) * 1.4 + 2.5)),
    yaw: yawOf(cam.yaw), pitch: num(cam.pitch),
  };
  const collision = createRoomCollision({ floor, colliders, open, name: houseId }, { radius });
  // spawn / exit must be standable
  { const f = collision.nearestFree(spawn.x, spawn.z); if (f) { spawn.x = f.x; spawn.z = f.z; } }
  const rec = layout.houses.find((h) => h.id === houseId);
  const room = {
    id: houseId, name: raw.name ?? rec?.name ?? houseId, group, floor, colliders, open, collision, spawn, exit, out, camera,
    floorY: num(raw.floorY ?? raw.floor?.y) ?? 0,
    // the pivot the camera turns about (Q / E inside: the kit cuts the wall facing the camera, Room.setYaw)
    pivot: P(raw.origin) ?? { x: cx, z: cz },
    spots: raw.spots ?? null,
    bed: raw.bed ?? null, visitPoint: raw.visitPoint ?? raw.visit ?? null, lights: raw.lights ?? [], raw, local,
    shown: false, lightRecs: [], stub: !!raw.stub,
    update(t, dt) { if (typeof raw.update === 'function') raw.update(t, dt); },
    /** The light outside the windows: a TOWN_TOD preset name (morning noon afternoon golden night). */
    setTimeOfDay(tod) { if (typeof raw.setTimeOfDay === 'function' && tod) raw.setTimeOfDay(tod); },
  };
  return room;
}

// ------------------------------------------------------------------------------------------------ show / hide (lights kept)
function adopt(engine, room, holder) {
  const lights = [];
  room.group.traverse((o) => { if (o.isLight) lights.push(o); });
  for (const l of lights) {
    l.updateMatrixWorld(true);
    holder.attach(l);                                   // keeps its world transform
    room.lightRecs.push({ light: l, i: l.intensity });
    if (l.target?.isObject3D && !l.target.parent) holder.add(l.target);
  }
  room.group.visible = false;
  for (const r of room.lightRecs) r.light.intensity = 0;
  engine.scene.add(room.group);
  room.show = (on) => {
    room.shown = !!on;
    room.group.visible = !!on;
    // lights: back to the kit's intensity when shown (its update may drive them), held at 0 when hidden
    for (const r of room.lightRecs) { if (on) r.light.intensity = r.i; else { r.i = r.light.intensity || r.i; r.light.intensity = 0; } }
  };
}

// ------------------------------------------------------------------------------------------------ manager
export function createInteriors(demo, { radius = PLAYER_RADIUS } = {}) {
  const { engine, params } = demo;
  const holder = new THREE.Group(); holder.name = 'demo-interior-lights';
  engine.scene.add(holder);
  const rooms = new Map(), pending = new Map();
  const failures = [];
  const custom = new Map();   // (B) id -> builder(engine, ctx) -> raw room (the clock tower's interior: tower-interior.js)
  let kitName = 'pending';
  const ctxFor = (id) => {
    const rec = layout.houses.find((h) => h.id === id);
    return { layout, record: rec, index: rec?.index ?? layout.houses.indexOf(rec), registry: demo.town?.registry, quality: demo.store?.state?.quality,
      tod: demo.town?.preset, params, hours: demo.time?.hours ?? demo.store?.state?.timeOfDay, origin: originFor(rec?.index ?? 0) };
  };
  async function build(id) {
    const kit = custom.has(id) ? null : await loadKit(params);   // (B) a registered builder wins
    if (!custom.has(id)) kitName = kit ? 'kit' : 'stub';
    let raw = null;
    if (custom.has(id)) {   // (B)
      try { raw = await custom.get(id)(engine, ctxFor(id)); }
      catch (e) { console.warn(`[demo] interior ${id}: custom builder failed, fallback room:`, e); failures.push({ id, error: String(e?.message ?? e) }); raw = null; }
    } else if (kit) {
      try { raw = await kit.buildInterior(engine, id, ctxFor(id)); }
      catch (e) { console.warn(`[demo] interior ${id}: buildInterior failed, fallback room:`, e); failures.push({ id, error: String(e?.message ?? e) }); raw = null; }
    }
    let room = null;
    if (raw) {
      try { room = normalizeRoom(raw, id, { radius }); }
      catch (e) { console.warn(`[demo] interior ${id}: unusable record, fallback room:`, e); failures.push({ id, error: String(e?.message ?? e) }); room = null; }
    }
    if (!room) room = normalizeRoom(buildStubInterior(engine, id, ctxFor(id)), id, { radius });
    adopt(engine, room, holder);
    rooms.set(id, room);
    return room;
  }
  const get = (id) => {
    if (rooms.has(id)) return Promise.resolve(rooms.get(id));
    if (!pending.has(id)) pending.set(id, build(id).finally(() => pending.delete(id)));
    return pending.get(id);
  };
  return {
    rooms, failures, get, peek: (id) => rooms.get(id) ?? null,
    /** (B) register a room builder for an id the kit does not know (the clock tower): builder(engine, ctx) -> raw room */
    register(id, builder) { custom.set(id, builder); },
    has: (id) => custom.has(id) || layout.houses.some((h) => h.id === id),   // (B)
    prefetch(id) { if (id && !rooms.has(id) && !pending.has(id)) get(id).catch(() => {}); },
    get kitName() { return kitName; },
    dispose() { for (const r of rooms.values()) r.group.removeFromParent(); holder.removeFromParent(); },
  };
}
/** Far-away origin of house i's room (never overlaps the town, 30 m apart: the shadow box / camera never see two). */
export const originFor = (i) => ({ x: 200 + 30 * i, z: 20 });

// ------------------------------------------------------------------------------------------------ fade
/** Black fade over the canvas (below the UI), driven by demo time t (deterministic). */
export function createFade(demo) {
  const el = document.createElement('div');
  el.id = 'demo-fade';
  Object.assign(el.style, { position: 'fixed', inset: '0', background: '#07060c', opacity: '0', pointerEvents: 'none', zIndex: '9',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e8d9b0', font: '600 18px/1.2 Georgia, "Times New Roman", serif',
    letterSpacing: '0.06em', textShadow: '0 2px 0 #000' });
  const label = document.createElement('span');
  el.appendChild(label);
  document.body.appendChild(el);
  let run = null;
  const api = {
    el,
    get active() { return !!run; },
    get phase() { return run ? run.phase : null; },
    /** out (s) to black, `onBlack` (may return a Promise: black holds until it settles), hold, then fade in. */
    run(t, { onBlack, label: text = '', out = 0.3, hold = 0.12, inn = 0.45 } = {}) {
      run = { t0: t, out, hold, inn, onBlack, text, phase: 'out', tb: null, waiting: false };
      label.textContent = '';
    },
    update(t) {
      if (!run) return;
      const r = run;
      let o = 0;
      if (r.phase === 'out') {
        o = Math.min(1, (t - r.t0) / r.out);
        if (o >= 1) {
          r.phase = 'black'; r.tb = t; label.textContent = r.text;
          let res = null;
          try { res = r.onBlack?.(); } catch (e) { console.error('[demo] fade onBlack:', e); }
          if (res && typeof res.then === 'function') { r.waiting = true; res.then(() => { r.waiting = false; r.tb = null; }, (e) => { console.error('[demo] fade onBlack:', e); r.waiting = false; r.tb = null; }); }
        }
      } else if (r.phase === 'black') {
        o = 1;
        if (!r.waiting) { if (r.tb === null) r.tb = t; if (t - r.tb >= r.hold) { r.phase = 'in'; r.tb = t; } }
      } else {
        o = 1 - Math.min(1, (t - r.tb) / r.inn);
        if (o <= 0) { run = null; o = 0; label.textContent = ''; }
      }
      // 6 stepped levels (pixel-art fades step, they do not glide)
      el.style.opacity = String(Math.round(o * 6) / 6);
      label.style.opacity = r.phase === 'out' ? '0' : String(Math.min(1, o * 1.4));
    },
    dispose() { el.remove(); },
  };
  return api;
}

// ------------------------------------------------------------------------------------------------ fallback room
/**
 * A plain cottage room for when the interior kit is missing or fails: plank floor, back + side walls (the front is the
 * dollhouse cut), a bed, a table + stools, a hearth, a rug, in the house's wall / roof palette. Same raw format as the
 * kit's (world coordinates). Kit Builder geometry only: the town's shared materials, no new shader programs.
 */
export function buildStubInterior(engine, houseId, ctx = {}) {
  const rec = ctx.record ?? layout.houses.find((h) => h.id === houseId);
  const i = rec?.index ?? 0;
  const O = ctx.origin ?? originFor(i);
  const st = rec?.style ?? {};
  const wallTones = { stone: 'stone', timber: 'daub', brick: 'brick', plaster: 'plaster', plank: 'plank', planks: 'plank', logs: 'plank' }[st.wall] ?? 'plaster';
  const roofTones = ['slate', 'red', 'moss', 'thatch', 'blue', 'plum'].includes(st.roof) ? st.roof : 'red';
  const W = 6, D = 4.6, HW = 2.5, T = 0.25;
  const b = new Builder(engine, { name: `interior-${houseId}` });
  b.push({ at: [O.x, 0, O.z] });
  // floor (a slab, top at y 0.02) + a thin skirt so the cut front edge reads
  b.box(W + 2 * T, 0.22, D + T, { at: [0, -0.2, -T / 2], tones: 'plank', pattern: 'planks' });
  // back wall + side walls (front removed: the cut-away)
  b.box(W + 2 * T, HW, T, { at: [0, 0, -D / 2 - T / 2], tones: wallTones, pattern: wallTones === 'stone' ? 'rubble' : wallTones === 'brick' ? 'brick' : 'plaster' });
  b.box(T, HW, D + T, { at: [-W / 2 - T / 2, 0, -T / 2], tones: wallTones, pattern: 'plaster' });
  b.box(T, HW, D + T, { at: [W / 2 + T / 2, 0, -T / 2], tones: wallTones, pattern: 'plaster' });
  // low front stubs either side of the door gap (knee height: the cut-away)
  b.box(W / 2 - 0.6, 0.35, T, { at: [-(W / 4 + 0.3), 0, D / 2 - T / 2 + 0.12], tones: wallTones });
  b.box(W / 2 - 0.6, 0.35, T, { at: [W / 4 + 0.3, 0, D / 2 - T / 2 + 0.12], tones: wallTones });
  // ceiling beams in the roof colour
  b.box(W, 0.12, 0.3, { at: [0, HW - 0.12, -D / 2 + 0.1], tones: roofTones });
  // bed (back-left): frame, mattress, pillow, blanket
  const bed = { x: O.x - 1.9, z: O.z - 1.2 };
  b.box(1.1, 0.35, 2.0, { at: [bed.x - O.x, 0, bed.z - O.z], tones: 'timber' });
  b.box(1.0, 0.14, 1.9, { at: [bed.x - O.x, 0.35, bed.z - O.z], tones: 'cream' });
  b.box(0.8, 0.12, 0.35, { at: [bed.x - O.x, 0.49, bed.z - O.z - 0.7], tones: 'plaster' });
  b.box(1.04, 0.1, 1.1, { at: [bed.x - O.x, 0.47, bed.z - O.z + 0.4], tones: roofTones });
  b.box(1.1, 0.8, 0.1, { at: [bed.x - O.x, 0, bed.z - O.z - 1.0], tones: 'timber' });
  // table + 2 stools (centre-right)
  const tb = { x: O.x + 1.2, z: O.z - 0.4 };
  b.box(1.2, 0.08, 0.8, { at: [tb.x - O.x, 0.7, tb.z - O.z], tones: 'plank', pattern: 'planks' });
  for (const [dx, dz] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) b.box(0.08, 0.7, 0.08, { at: [tb.x - O.x + dx, 0, tb.z - O.z + dz], tones: 'timber' });
  for (const dx of [-0.85, 0.85]) b.cylinder(0.2, 0.2, 0.42, { at: [tb.x - O.x + dx, 0, tb.z - O.z + 0.1], tones: 'timber' });
  b.box(0.18, 0.2, 0.18, { at: [tb.x - O.x + 0.2, 0.78, tb.z - O.z - 0.1], tones: 'brass' });
  // hearth on the back wall (right): stone surround + glowing embers (glass layer glows at night)
  const hx = 1.6;
  b.box(1.3, 1.2, 0.5, { at: [hx, 0, -D / 2 + 0.25], tones: 'stone', pattern: 'ashlar' });
  b.box(0.7, 0.55, 0.12, { at: [hx, 0.12, -D / 2 + 0.47], tones: 'glow', layer: 'glass', glow: '#ff9a40', glowKind: 2 });
  b.box(1.5, 0.14, 0.6, { at: [hx, 1.2, -D / 2 + 0.3], tones: 'timber' });
  // shelf + crocks on the back wall (left of centre)
  b.box(1.2, 0.08, 0.3, { at: [-0.2, 1.45, -D / 2 + 0.15], tones: 'timber' });
  for (let k = 0; k < 4; k++) b.cylinder(0.08, 0.07, 0.22, { at: [-0.62 + k * 0.28, 1.53, -D / 2 + 0.15], tones: ['brass', 'red', 'plum', 'cream'][k] });
  // rug
  b.box(1.8, 0.02, 1.2, { at: [-0.1, 0.02, 0.6], tones: roofTones, pattern: 'thatch' });
  b.pop();
  const group = b.build({ name: `interior-${houseId}` });
  const cz = O.z, cx = O.x;
  return {
    stub: true, name: rec?.name ?? houseId, group, space: 'world',
    floor: { x0: cx - W / 2, z0: cz - D / 2, x1: cx + W / 2, z1: cz + D / 2 },
    colliders: [
      { x0: bed.x - 0.55, z0: bed.z - 1.0, x1: bed.x + 0.55, z1: bed.z + 1.0, tag: 'bed' },
      { cx: tb.x, cz: tb.z, w: 1.2, d: 0.8, tag: 'table' },
      { x: tb.x - 0.85, z: tb.z + 0.1, r: 0.2, tag: 'stool' }, { x: tb.x + 0.85, z: tb.z + 0.1, r: 0.2, tag: 'stool' },
      { cx: cx + hx, cz: cz - D / 2 + 0.25, w: 1.3, d: 0.5, tag: 'hearth' },
    ],
    spawn: { x: cx, z: cz + D / 2 - 0.75, facing: Math.PI },
    exit: { x: cx, z: cz + D / 2 - 0.2, r: 0.4, normal: [0, 1] },
    camera: { target: [cx, 0, cz - 0.1], viewHeight: 7.5, yaw: 0 },
    bed: { x: bed.x, z: bed.z, facing: 0 }, visitPoint: { x: bed.x + 0.9, z: bed.z + 0.4 },
    lights: [{ kind: 'fire', pos: { x: cx + hx, y: 0.5, z: cz - D / 2 + 0.6 }, color: '#ff9a40', r: 4 }],
  };
}
