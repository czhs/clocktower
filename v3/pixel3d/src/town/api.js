// Town piece API (owner: town foundation lead). docs/TOWN.md §4 is the contract; this file implements it.
//
// A PIECE is a module (src/town/pieces/<id>.js, or src/town/life/index.js for 'life') whose default export is
//   build(engine, ctx) -> piece   (may be async)
// piece = {
//   group: THREE.Object3D            everything the piece draws, in WORLD coordinates (the composer adds it)
//   update?(t, dt)                   per-frame animation, a pure function of t (registered by the composer)
//   anchors: {                       WORLD-space hooks other pieces (mostly 'life') attach to; all optional
//     doors:    [{id, pivot: Object3D, open(f)}]      f 0 closed .. 1 open; pivot.getWorldPosition() = hinge
//     chimneys: [Vector3]                             smoke origins (top of the flue)
//     windows:  [{mesh?, id?, pos: Vector3}]          glowing panes (pos = a point just outside the glass)
//     lights:   [{pos: Vector3, color: hex, r: m, kind: 'lamp'|'lantern'|'window'|'fire'|'holy', flicker?: bool}]
//                                                     the composer turns the best N into PointLights at night
//     perches:  [Vector3]                             spots birds / cats may sit (ridge ends, chimneys, signs)
//     seats:    [Vector3], spots: {name: Vector3}     anything else useful (benches, dais seats, the fountain)
//   }
//   api?: {...}                      piece-specific controls (clocktower.setTime(h, m), dais.setSeat(i, s) ...)
//   stats?: {...}                    free-form numbers; the composer adds calls/tris/buildMs per piece
// }
// ctx = makeCtx(...): {id, engine, layout (the layout module), record (layout.pieceRecord(id)), rng (seeded per
//   piece), seed, heightAt(x, z), tod ('noon'|'morning'|'golden'|'night'), night (bool), params (URLSearchParams),
//   registry (pieces built so far: get(id), all(), anchors(kind)), isolated (bool: town-piece.js turntable),
//   palette (TOWN_PALETTE), kit (the kit module), camera (preset name), quality ('high'|'low': low = cut geometry)}.
import * as THREE from 'three';
import { rng } from '../core/noise.js';
import { applyTimeOfDay, setClouds } from '../world/sky.js';
import { ensureToonUniforms } from '../materials/toon.js';
import * as layout from './layout.js';
import * as kit from './kit.js';
import { TOWN_PALETTE, paintRamp } from './palette.js';
import { cutUniforms } from './cutaway.js';

const { PLAZA, CIRCLE, pieceRecord, PIECE_IDS } = layout;
export { PIECE_IDS };

// ------------------------------------------------------------------------------------------------ cameras
/** Camera presets (pitch is always pi/6). target = ground point at the screen centre (y = height offset). */
export const CAMERAS = {
  // the game camera: follows the player, sees the whole circular square (r 9 m) with ~1.5 m margin
  gameplay: { yaw: 0, viewHeight: 12, target: [PLAZA.cx, 0, PLAZA.cz] },
  // the whole map incl. the tower spire and the far forest rim (screen centre on z ~7: tall things push it up)
  overview: { yaw: 0, viewHeight: 32, target: [22.5, 0, 10.5] },  // lead round 6 +1.4 m, layout r7 +1 m, layout-finish +0.5 m south: house-9's front (z 41) + door in view
  // the whole town from the south-east at a 45 deg stop
  iso: { yaw: Math.PI / 4, viewHeight: 34, target: [22.5, 0, 14.5] },
  // votes / executions: the whole voting circle CENTRED in the frame (layout-finish, art director: at 21.5 / z 9.6 the
  // south seats sat on the bottom edge, circle centre ~170 px below the frame centre). target = the plaza centre, so the
  // kerb ring sits symmetric about the frame centre with every seat, the dais and the lawn round it in view; the tower's
  // base and door frame the top edge (the dial would need viewHeight ~33 with a centred circle: the HUD clock shows the time)
  // (layout r7: 21.5 / z 9.6; before: 20 / z 7.4)
  vote: { yaw: 0, viewHeight: 19, target: [PLAZA.cx, 0, PLAZA.cz] },
};
/** Default viewHeight for town-piece.js turntables. */
export const PIECE_VIEW = { clocktower: 22, dais: 13, ground: 12, props: 12, foliage: 12, life: 12, house: 9 };

/** Ground focus point of a piece id or "x,z" (null if unknown). y = a sensible look-at height. */
export function focusOf(f) {
  if (!f) return null;
  if (/^-?[\d.]+,-?[\d.]+$/.test(f)) { const [x, z] = f.split(',').map(Number); return new THREE.Vector3(x, 0, z); }
  const r = pieceRecord(f);
  if (!r) return null;
  const c = r.placed?.center ?? r.center ?? { x: PLAZA.cx, z: PLAZA.cz };   // placed (layout deltas) position
  const y = f === 'clocktower' ? 7.2 : f.startsWith('house-') ? 0.8 : 0;
  return new THREE.Vector3(c.x, y, c.z);
}

/** Set the pixel camera from a preset (+ focus / yaw degrees / viewHeight overrides). Call BEFORE building. */
export function applyCamera(engine, preset = 'gameplay', { focus = null, yawDeg = null, viewHeight = null } = {}) {
  const P = CAMERAS[preset] ?? CAMERAS.gameplay;
  const target = focus ? focus.clone() : new THREE.Vector3(...P.target);
  const yaw = yawDeg !== null && yawDeg !== undefined && !Number.isNaN(yawDeg) ? THREE.MathUtils.degToRad(yawDeg) : P.yaw;
  engine.camera.set({ target, yaw, pitch: Math.PI / 6, viewHeight: viewHeight ?? P.viewHeight });
  return { preset, target, yaw, viewHeight: viewHeight ?? P.viewHeight };
}

// ------------------------------------------------------------------------------------------------ time of day
/**
 * Town time-of-day presets on top of src/world/sky.js. The sun is placed relative to the camera yaw, so at the
 * gameplay camera (yaw 0) noon light comes from the front-left (relAz 150): left walls hi, south fronts mid,
 * right walls shadow, shadows fall up-right behind the buildings - the v1 "lit from the upper-left" read.
 */
// veg: foliage-only ramp multipliers on top of the sky preset's ramps ([hi, mid, sh], applied by the cut-away patch to
// the foliage piece's materials): the golden ramps would turn spring canopies autumn-gold and their backlit shade
// near-black teal; these keep the crowns yellow-green in the light and green (>= ~(55, 85, 65)) in their shade
// (lift = linear fill added to the shadow band only, so shade stays darker and cooler than the mid tone).
const VEG_GOLDEN = { hi: [0.92, 1.28, 2.0], mid: [0.95, 1.18, 1.3], sh: [1.35, 1.5, 1.0], lift: [0.026, 0.042, 0.014] };
export const TOWN_TOD = {
  // noon (fix round 4): the sun from the left and a little behind the camera (relAz 158, elev 46; 160 had a 12 px shadow-edge crawl tie): left walls hi, south
  // fronts mid, right walls shadow; the short cast shadows fall to the visible RIGHT side of posts, braziers, banners
  // and stalls (at 150 / 50 they fell mostly behind them); larger, more frequent cloud patches drift across the square
  noon: { relAz: 158, elev: 46, clouds: { scale: 0.06, cover: 0.53, height: 10, wind: [0.034, 0.012], strength: 0.9 }, glow: 0, lights: false },
  morning: { relAz: 125, elev: 33, clouds: { scale: 0.05, cover: 0.56, height: 10, wind: [0.018, 0.007] }, glow: 0, lights: false },
  // golden: a low sun from the NORTH, a little west (behind the clock tower, upper-left on screen = the v1 light): long
  // shadows run toward the camera; the tower's shadow runs south down the middle of the square across the voting
  // circle (fix round 4: at relAz -140 it fell east of the circle); fronts in warm shadow with glowing windows, golden rims
  golden: { relAz: -100, elev: 27, clouds: null, glow: 1, lights: true, lightKinds: ['fire'], pointReach: 3, veg: VEG_GOLDEN },
  // afternoon: the previous golden - low front-left sun (sky preset 'golden'), fronts lit, shadows fall away
  afternoon: { sky: 'golden', relAz: 165, elev: 24, clouds: null, glow: 1, lights: true, pointReach: 3, veg: VEG_GOLDEN },
  night: { relAz: 140, elev: 45, clouds: null, glow: 1, lights: true, pointReach: 4 },
};

/** Apply a town time of day: sky preset + clouds + kit window glow + point-light reach. Returns the preset. */
export function applyTownTime(engine, tod = 'noon', { shadowExtent, clouds = true, relAz = null, elev = null } = {}) {
  const T = TOWN_TOD[tod] ? tod : 'noon';
  const P = TOWN_TOD[T];
  // relAz / elev: review overrides (?relAz= ?elev=), the preset otherwise
  applyTimeOfDay(engine, P.sky ?? T, { relAz: relAz ?? P.relAz, elev: elev ?? P.elev, shadowExtent });
  setClouds(engine, (clouds && P.clouds) || { scale: 0 });
  kit.setNightGlow(engine, P.glow);
  const U = cutUniforms(engine), V = P.veg ?? { hi: [1, 1, 1], mid: [1, 1, 1], sh: [1, 1, 1], lift: [0, 0, 0] };
  U.uVegHi.value.set(...V.hi); U.uVegMid.value.set(...V.mid); U.uVegSh.value.set(...V.sh); U.uVegLift.value.set(...(V.lift ?? [0, 0, 0]));
  if (P.pointReach) ensureToonUniforms(engine).uPointShape.value.y = P.pointReach;
  return { name: T, ...P };
}

// ------------------------------------------------------------------------------------------------ registry & ctx
export class Registry {
  constructor() { this.map = new Map(); }
  add(id, piece) { this.map.set(id, piece); }
  get(id) { return this.map.get(id) ?? null; }
  all() { return [...this.map.entries()].map(([id, p]) => ({ id, ...p })); }
  /** Flattened anchors of one kind across pieces: [{piece, ...anchor}] (Vector3 anchors become {piece, pos}). */
  anchors(kind) {
    const out = [];
    for (const [id, p] of this.map) for (const a of p.anchors?.[kind] ?? []) out.push(a.isVector3 ? { piece: id, pos: a } : { piece: id, ...a });
    return out;
  }
}

/** Deterministic seed per piece id (FNV-1a). */
export function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function makeCtx(engine, id, { registry, tod = 'noon', params = new URLSearchParams(), isolated = false, camera = 'gameplay' } = {}) {
  const seed = seedOf(id);
  // quality tier (docs/TOWN.md §12.4): 'low' = pieces should cut geometry (thin / impostor rim trees, half grass,
  // coarser terrain); the composer applies the shadow-map / light / post side of the tier itself
  const quality = params?.get?.('quality') === 'low' ? 'low' : 'high';
  const ground = registry?.get('ground');
  return {
    id, engine, layout, record: pieceRecord(id), seed, rng: rng(seed),
    heightAt: ground?.api?.heightAt ?? (() => 0),
    tod, night: tod === 'night', params, registry, isolated, palette: TOWN_PALETTE, kit, camera, quality,
  };
}

/** World position of a local point of an object (updates the world matrix chain). */
export function toWorld(obj, v) {
  obj.updateWorldMatrix(true, false);
  return v.clone().applyMatrix4(obj.matrixWorld);
}

/** Draw calls (meshes / points / lines, an InstancedMesh counts once) and triangles of an object tree. */
export function countDraws(obj) {
  let calls = 0, tris = 0;
  obj.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine) || !o.visible) return;
    const mats = Array.isArray(o.material) ? o.material.length : 1;
    calls += mats;
    const g = o.geometry;
    if (o.isMesh && g) {
      const n = g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
      const inst = o.isInstancedMesh ? o.count : (g.isInstancedBufferGeometry ? g.instanceCount : 1);
      tris += n * (Number.isFinite(inst) ? inst : 1);
    }
  });
  return { calls, tris: Math.round(tris) };
}

/** Validate / normalise what a build() returned (throws on a broken contract, so owners notice). */
export function normalizePiece(id, p) {
  if (!p || !p.group || !p.group.isObject3D) throw new Error(`town piece '${id}': build() must return {group: Object3D, ...}`);
  p.anchors = { doors: [], chimneys: [], windows: [], lights: [], perches: [], ...(p.anchors ?? {}) };
  for (const l of p.anchors.lights) if (!l.pos?.isVector3) throw new Error(`town piece '${id}': anchors.lights[].pos must be a world Vector3`);
  p.api ??= {};
  p.stats ??= {};
  p.group.name ||= id;
  p.group.userData.pieceId = id;
  return p;
}

// ------------------------------------------------------------------------------------------------ loading
const PATHS = (id) => (id === 'life' ? './life/index.js' : `./pieces/${id}.js`);

/**
 * Import + build one piece. A piece that fails to import or build is replaced by a magenta-free warning box
 * (console.warn, not a page error) so other owners' renders keep working; `strict` rethrows (your own piece).
 */
export async function buildPiece(engine, id, ctx, { strict = false } = {}) {
  const t0 = performance.now();
  let piece;
  try {
    const mod = await import(PATHS(id));
    if (typeof mod.default !== 'function') throw new Error(`town piece '${id}': no default export build(engine, ctx)`);
    piece = normalizePiece(id, await mod.default(engine, ctx));
  } catch (e) {
    if (strict) throw e;
    console.warn(`[town] piece '${id}' failed, using a placeholder: ${e?.stack || e}`);
    piece = normalizePiece(id, placeholder(engine, ctx));
    piece.stats.failed = 1;
  }
  const d = countDraws(piece.group);
  piece.stats.calls = d.calls; piece.stats.tris = d.tris; piece.stats.buildMs = Math.round(performance.now() - t0);
  return piece;
}

/** Grey box over the piece's footprint (used when a piece module is broken). */
function placeholder(engine, ctx) {
  const b = new kit.Builder(engine, { name: `${ctx.id}-placeholder` });
  const r = ctx.record;
  if (r?.footprint) {
    const f = r.footprint;
    b.box(f.w, 1.5, f.d, { at: [f.x + f.w / 2, 0, f.z + f.d / 2], tones: 'iron' });
  }
  return { group: b.build() };
}

// ------------------------------------------------------------------------------------------------ night lights
const KIND_BONUS = { lamp: 2.0, holy: 1.5, fire: 1.5, lantern: 1.5, window: -2.0 };
/**
 * Wall-hugging: a lantern / window light a few cm in front of its building's door wall lights that wall at a steep
 * angle and paints a hard-edged disc on the facade (the quantized pool's outer step). Moving the PointLight back to
 * 6 cm in front of the wall plane leaves the wall grazed (N.L ~ 0: no disc) while the ground and doorstep in front
 * still get the warm pool. Only lights 0..0.45 m in front of the (placed) door wall plane of a house / the tower, and
 * within its width; anchor.hug === false opts out.
 */
function hugWall(l) {
  if (l.hug === false || !(l.kind === 'lantern' || l.kind === 'window')) return l.pos;
  const rec = layout.houses.find((h) => h.id === l.piece) ?? (l.piece === 'clocktower' ? layout.clocktower : null);
  if (!rec) return l.pos;
  const [nx, nz] = rec.doorNormal, p = rec.doorPoint;
  const s = (l.pos.x - p.x) * nx + (l.pos.z - p.z) * nz;
  const lat = Math.abs(-(l.pos.x - p.x) * nz + (l.pos.z - p.z) * nx);
  const half = (rec.game ?? rec).facing === 'south' ? (rec.game ?? rec).footprint.w / 2 + 0.6 : (rec.game ?? rec).footprint.d + 0.6;
  if (s <= 0.06 || s > 0.45 || lat > half) return l.pos;
  return l.pos.clone().add(new THREE.Vector3(-nx * (s - 0.06), 0, -nz * (s - 0.06)));
}
/**
 * Turn the best `max` light anchors into PointLights (quantized additive toon lighting, no shadows).
 * Selection (deterministic): anchors within ~1.6 view heights of the camera target compete first;
 *   1. one light per piece in view (its best by score), the focus piece first (the door lantern of the cottage the
 *      player stands at always gets a pool), then the nearest pieces,
 *   2. the remaining slots by score = distance - kind bonus (lamp 2 m, lantern / fire / holy 1.5 m, window -2 m).
 * Per-anchor options: `intensity` (default 1.4), `r` (reach, m), `flicker` (lanterns / fire flicker by default,
 * stepped at 8 fps). The PointLight is written back as `anchor.light` (null when the anchor got no slot).
 * Returns [{light, anchor, base}] (also registry.lights / engine.townLights).
 */
export function installLights(engine, registry, { max = 12, enabled = true, skip = null, focus = null, hug = true } = {}) {
  if (!enabled) return [];
  const tgt = engine.camera.target, near = engine.camera.viewHeight * 1.6;
  const all = [];
  let i = 0;
  for (const [id, p] of registry.map) for (const a of p.anchors?.lights ?? []) {
    a.light = null;
    const l = { piece: id, ...a, src: a, i: i++ };
    if (skip && skip(l)) continue;
    l.d = Math.hypot(l.pos.x - tgt.x, l.pos.z - tgt.z);
    l.score = l.d - (KIND_BONUS[l.kind] ?? 0) - (focus && id === focus ? 100 : 0);
    all.push(l);
  }
  const byScore = (a, b) => a.score - b.score || a.i - b.i;
  const inView = all.filter((l) => l.d < near).sort(byScore), outView = all.filter((l) => l.d >= near).sort(byScore);
  const pick = [], used = new Set(), pieces = new Set();
  for (const l of inView) if (pick.length < max && !pieces.has(l.piece)) { pieces.add(l.piece); used.add(l); pick.push(l); }
  for (const l of [...inView, ...outView]) if (pick.length < max && !used.has(l)) { used.add(l); pick.push(l); }
  const out = [];
  const group = new THREE.Group(); group.name = 'town-lights';
  for (const l of pick) {
    const c = new THREE.Color(l.color ?? TOWN_PALETTE.lampGlow);
    const base = Number.isFinite(l.intensity) ? l.intensity : 1.4;
    const pl = new THREE.PointLight(c, base, l.r ?? 3.5, 1.5);
    pl.position.copy(hug ? hugWall(l) : l.pos);
    pl.castShadow = false;
    pl.name = `light-${l.piece}-${l.kind}`;
    group.add(pl);
    l.src.light = pl;
    out.push({ light: pl, anchor: l, base, ph: (l.i * 7.31) % 13 });
  }
  engine.scene.add(group);
  engine.onUpdate((t) => {
    for (const o of out) {
      if (o.anchor.flicker === false || !(o.anchor.flicker || o.anchor.kind === 'lantern' || o.anchor.kind === 'fire')) continue;
      const k = Math.floor(t * 8 + o.ph);
      const h = (((Math.sin(k * 12.9898) * 43758.5453) % 1) + 1) % 1;
      o.light.intensity = o.base * [0.8, 0.9, 0.96, 1.0][Math.floor(h * 4)];
    }
  });
  engine.stats.townLights = out.length;
  engine.stats.townLightList = out.map((o) => [o.anchor.piece, o.anchor.kind, ...o.light.position.toArray().map((v) => +v.toFixed(2)), +(o.anchor.r ?? 3.5).toFixed(2)]);
  engine.townLights = out;
  return out;
}

// ------------------------------------------------------------------------------------------------ stubs
// Placeholder pieces written by the foundation lead so the composed town renders from minute one. They double as
// kit examples. OWNERS REPLACE THEM (your piece file is yours: delete the stub call and build the real thing).
const WALL = { timber: ['daub', 'plaster'], stone: ['stone', 'rubble'], plaster: ['plaster', 'plaster'], brick: ['brick', 'brick'], planks: ['plank', 'boards'] };

/** Kit-built stub cottage from a house record: walls, roof by style, door, 2 windows, chimney, lantern. */
export function stubHouse(engine, ctx, { eave = 2.6, ridge = 4.6 } = {}) {
  const r = ctx.record, st = r.style, fr = kit.frameOf(r);
  const b = new kit.Builder(engine, { name: r.id });
  const W = fr.width - 0.2, D = fr.depth - 0.4;
  const [wallRamp, wallPat] = WALL[st.wall] ?? WALL.plaster;
  b.box(W + 0.16, 0.3, D + 0.16, { tones: 'stone', pattern: 'rubble', at: [0, -0.05, 0] });          // plinth
  b.box(W, eave, D, { tones: wallRamp, pattern: wallPat });
  if (st.wall === 'timber') kit.timbers(b, { x0: -W / 2, x1: W / 2, y0: 0.25, y1: eave, z: D / 2, posts: [-W / 2 + 0.06, W / 2 - 0.06, -W / 6, W / 6], rails: [1.3, eave] });
  const cross = st.roofType === 'cross';
  kit.gableRoof(b, { w: W, d: D, eave, ridge, kind: st.roof, gable: wallRamp, seed: ctx.seed });
  if (cross) kit.gableRoof(b, { x: fr.doorX, z: D / 2 - 0.6, w: 1.8, d: 2.2, eave: eave - 0.1, ridge: ridge - 0.5, axis: 'z', kind: st.roof, gable: wallRamp, gableOverhang: 0.15, seed: ctx.seed + 1 });
  const paint = paintRamp(st.shutters);
  const z = D / 2;
  const winXs = [-W / 2 + 0.85, W / 2 - 0.85].filter((x) => Math.abs(x - fr.doorX) > 1.0);
  const windows = winXs.map((x) => kit.window_(b, { at: [x, 1.55, z], w: 0.62, h: 0.78, shutters: paint }));
  if (st.flowers && winXs.length) kit.flowerBox(b, { at: [winXs[0], 1.0, z], w: 0.8, seed: ctx.seed });
  kit.steps(b, { at: [fr.doorX, 0, z], w: 1.2, count: 1, rise: 0.1 });
  const lights = [];
  if (st.lantern) lights.push(kit.lantern(b, { at: [fr.doorX + 0.85, 2.05, z] }));
  const chims = [];
  if (st.chimney !== 'none') chims.push(kit.chimney(b, { at: [(st.chimney === 'left' ? -1 : 1) * (W / 2 - 0.6), -D / 4], base: eave, top: ridge + 0.6 }));
  const group = b.build();
  const d = kit.door(engine, { w: 0.95, h: 1.95, tones: paint, hinge: r.persona?.hinge ?? 'left', kind: r.persona?.door === 'panel' ? 'panel' : 'planks' });
  d.pivot.position.set(fr.doorX + ((r.persona?.hinge ?? 'left') === 'left' ? -0.475 : 0.475), 0.02, z + 0.07);
  group.add(d.pivot);
  fr.apply(group);
  const W3 = (v) => toWorld(group, v);
  return {
    group,
    anchors: {
      doors: [{ id: `${r.id}-door`, pivot: d.pivot, open: d.open }],
      chimneys: chims.map(W3),
      windows: windows.map((w) => ({ pos: W3(w.glowPos) })),
      lights: [...lights.map((l) => ({ ...l, pos: W3(l.pos) })), ...windows.map((w) => ({ pos: W3(w.glowPos), color: TOWN_PALETTE.glow[1], r: 1.6, kind: 'window' }))],
      perches: [W3(new THREE.Vector3(-W / 2, ridge + 0.1, 0)), W3(new THREE.Vector3(W / 2, ridge + 0.1, 0))],
    },
    api: { setDoor: (f) => d.open(f), setLit: (on) => group.traverse((o) => o.userData.layer === 'glass' && kit.setGlowLit(o, on)) },
    stats: { stub: 1 },
  };
}

export { paintRamp };
