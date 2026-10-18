// v3 WP3 (v3-stage), from the WP0 stub. Builds Hollowmere through the vendor composer the way the game
// needs it (docs/v3/INTEGRATION.md §1.3 step 5, §3.1 "Life") and exposes the few piece apis the stage
// drives. One of the only modules allowed to import '@pixel3d/*' (game3d/vendor/**).
//   - camera at the square (gameplay preset) BEFORE the build (grass / trees read the build camera),
//   - `strict: 'all'`: a broken piece throws (-> Classic) instead of a silent placeholder box,
//   - the grass area as the demo's GA via the build-time ground.js rewrite (engine.__ctGrassArea),
//   - life without the misleading systems (walkers, doors, folk, cycle, ambient),
//   - the tier's light budget (`lights`) for the composer's own PointLights on golden / night builds, so the
//     time facade adopts exactly that many and never tops up past it.
import * as THREE from 'three';
import * as demoApiNS from '@pixel3d/demo/api.js';
import { applyCamera } from '@pixel3d/town/api.js';
import * as townApiNS from '@pixel3d/town/api.js';
import * as kitNS from '@pixel3d/town/kit.js';
import * as layoutNS from '@pixel3d/town/layout.js';
import { PLAZA } from '@pixel3d/town/layout.js';
import * as townNS from '@pixel3d/town/town.js';
import { buildTown } from '@pixel3d/town/town.js';
import * as towerTimerNS from '@pixel3d/demo/towertimer.js';
import type { HostedEngine } from './engineHost';
import { prefetchInteriors } from './interiors';
import { mergeStatic, type MergeCandidate, type MergedTown, type ShadowView } from '../world/merge';

/** The parts of src/town/layout.js / town.js this wrapper reads beyond pixel3d.d.ts (lead-owned typings). */
interface VendorHouseRec {
  id: string;
  doorPoint: { x: number; z: number };
  doorNormal: [number, number];
}
const vlayout = layoutNS as unknown as { houses: VendorHouseRec[]; TOWN_W: number; TOWN_H: number; seatPos(i: number, n: number): { x: number; z: number }; CIRCLE?: { cx: number; cz: number; r: number } };
interface KitBuilder {
  box(w: number, h: number, d: number, o?: Record<string, unknown>): KitBuilder;
  push(m: THREE.Matrix4): KitBuilder;
  pop(): KitBuilder;
  build(o?: { castShadow?: boolean; receiveShadow?: boolean; name?: string }): THREE.Group;
}
const Builder = (kitNS as unknown as { Builder: new (engine: unknown, o?: { name?: string }) => KitBuilder }).Builder;
const houseBox = (townNS as unknown as { houseBox(rec: unknown, top: number, side?: string): { center: [number, number]; half: [number, number]; y: [number, number]; ry: number } }).houseBox;

/** The demo's grass area (src/demo/main.js buildWide GA): x -2..47, z 3..41.5 m. */
export const GRASS_AREA = { x0: -2, x1: 47, z0: 3, z1: 41.5 } as const;
export const LIFE_OFF = 'walkers,doors,folk,cycle,ambient';
export type TodPreset = 'noon' | 'morning' | 'golden' | 'afternoon' | 'night';

export type BuiltTown = Awaited<ReturnType<typeof buildTown>>;

export interface TownBuildOptions {
  /** The game tier; 'cpu' builds the vendor's 'low' town (the cpu levers act on the engine, vendor/cpuTier.ts). */
  quality: 'high' | 'low' | 'cpu';
  /** Build-time time-of-day preset (the preset of the starting hour; the time facade interpolates from it). */
  tod?: TodPreset;
  /** PointLight budget of the town pool (composer lights on golden / night builds). */
  lights?: number;
}

/**
 * (v3 perf, client front) The vendor's buildTown imports each piece chunk only after the previous piece is BUILT
 * (`for … await buildPiece`): 20 serial round trips on a cold join (docs/perf-v3/recon-load.md item 1). These globs
 * name the same modules as the build-time map injected into town/api.js (build/pixel3dImports.ts), so calling them
 * fetches (and evaluates: piece modules only declare functions at top level) the very chunks buildPiece awaits later.
 */
const PIECE_CHUNKS = import.meta.glob(['@pixel3d/town/pieces/*.js', '@pixel3d/town/life/index.js']);
let piecesPrefetched = false;
/** Start fetching every town piece chunk + the room modules in parallel. Never throws; idempotent. */
export function prefetchTownChunks(): void {
  if (piecesPrefetched) return;
  piecesPrefetched = true;
  for (const load of Object.values(PIECE_CHUNKS)) load().catch(() => undefined);
  prefetchInteriors();
}

/**
 * (v3.1 stage merge) Each mesh's DESIGN castShadow flag, snapshotted when the composer registers its piece: buildTown's
 * shadow-caster cull (town.js installShadowCull) rewrites castShadow from the build camera before it returns, so a
 * caster outside the build view would otherwise read as a non-caster. The composer's low-tier rule (small soft dressing
 * only receives) is applied on top, as buildTown does (mergeTownKit checks the count against stats.lowTier).
 */
const DESIGN_CAST = new WeakMap<object, { cast: WeakMap<THREE.Object3D, boolean>; lowFlips: number }>();
/** buildTown's low-tier "receive only" names (town.js, quality low: pieces other than foliage / ground / life). */
const LOW_NO_CAST = /-(soft|turf-grass|moss-clump-core|clump-leaves|wares-solid|fx)$/;
type RegistryProto = { add(id: string, piece: unknown): void };

export async function buildHollowmere(engine: HostedEngine, o: TownBuildOptions): Promise<BuiltTown> {
  prefetchTownChunks();
  applyCamera(engine, 'gameplay', { focus: new THREE.Vector3(PLAZA.cx, 0, PLAZA.cz) });
  const q = new URLSearchParams({ tod: o.tod ?? 'noon', quality: o.quality === 'high' ? 'high' : 'low', life: '1', demo: 'day', lifeOff: LIFE_OFF });
  if (o.lights) q.set('lights', String(o.lights));
  engine.__ctGrassArea = { ...GRASS_AREA };
  const cast = new WeakMap<THREE.Object3D, boolean>();
  let lowFlips = 0;
  const low = q.get('quality') === 'low';
  const proto = (townApiNS as unknown as { Registry?: { prototype: RegistryProto } }).Registry?.prototype;
  const add = proto?.add;
  if (proto && typeof add === 'function')
    proto.add = function (this: unknown, id: string, piece: unknown) {
      try {
        const g = (piece as { group?: THREE.Object3D } | null)?.group;
        const lowRule = low && id !== 'foliage' && id !== 'ground' && id !== 'life';
        g?.traverse((m) => {
          if (!(m as THREE.Mesh).isMesh) return;
          const off = lowRule && m.castShadow && LOW_NO_CAST.test(m.name);
          if (off) lowFlips++;
          cast.set(m, m.castShadow && !off);
        });
      } catch {
        /* the snapshot is best effort: an unknown mesh is never merged */
      }
      return add.call(this, id, piece);
    };
  try {
    const town = await buildTown(engine, q, { strict: 'all' });
    DESIGN_CAST.set(town as object, { cast, lowFlips: low ? lowFlips : 0 });
    return town;
  } finally {
    if (proto && add) proto.add = add;
    delete engine.__ctGrassArea;
  }
}

/**
 * After the unmount: empty the town's piece registry (and its anchors), so a vendor closure that outlives the engine
 * (e.g. through V8's allocation-site feedback of a piece api literal) reaches an empty registry, not every piece.
 */
export function releaseTown(town: BuiltTown): void {
  const reg = town.registry as unknown as { map?: Map<unknown, unknown>; clear?: () => void } & Record<string, unknown>;
  try {
    if (typeof reg.clear === 'function') reg.clear();
    for (const v of Object.values(reg)) if (v instanceof Map || v instanceof Set) v.clear();
  } catch {
    /* best effort */
  }
}

/** Ground height (m) at a point, from the built town's ground piece (0 when it has none). */
export function groundHeight(town: BuiltTown): (x: number, z: number) => number {
  const h = town.registry.get('ground')?.api?.heightAt;
  return typeof h === 'function' ? (x, z) => Number((h as (x: number, z: number) => number)(x, z)) || 0 : () => 0;
}

// ------------------------------------------------------------------------------------------------ piece apis

export interface HouseApi {
  id: string;
  /** Door opening 0..1 (instant; the stage animates it). */
  setDoor(f: number): void;
}

type AnyApi = Record<string, unknown> | undefined;

/** The 15 cottages' door apis (house-0..14). Throws when a vendor re-publish dropped one. */
export function houseApis(town: BuiltTown): Map<string, HouseApi> {
  const out = new Map<string, HouseApi>();
  const missing: string[] = [];
  for (const h of vlayout.houses) {
    const api = town.registry.get(h.id)?.api as AnyApi;
    if (!api || typeof api.setDoor !== 'function' || typeof api.setLit !== 'function') {
      missing.push(h.id);
      continue;
    }
    const setDoor = api.setDoor as (f: number) => void;
    out.set(h.id, { id: h.id, setDoor: (f) => setDoor(f) });
  }
  if (missing.length) throw new Error(`pixel3d house api changed (setDoor / setLit missing): ${missing.join(', ')}`);
  return out;
}

export interface HouseLightGate {
  /** Board a house up (windows dark whatever the hour) or open it again (back to the hour's state). */
  setBoarded(id: string, on: boolean): void;
  restore(): void;
}

/**
 * Board-up gating: wrap each cottage api's setLit (the time facade calls `api.setLit` through the registry
 * whenever its lit-in-order schedule flips a house) so a boarded house stays dark; `setBoarded` re-applies
 * the last requested state. Call BEFORE createTime (it reads the api at call time, so the wrapper wins).
 */
export function gateHouseLights(town: BuiltTown, ids: readonly string[]): HouseLightGate {
  const st = new Map<string, { raw: (on: boolean) => void; want: boolean; boarded: boolean; api: Record<string, unknown> }>();
  for (const id of ids) {
    const api = town.registry.get(id)?.api as Record<string, unknown> | undefined;
    if (!api || typeof api.setLit !== 'function') continue;
    const raw = api.setLit as (on: boolean) => void;
    const rec = { raw, want: true, boarded: false, api };
    st.set(id, rec);
    api.setLit = (on: boolean) => {
      rec.want = !!on;
      raw(!!on && !rec.boarded);
    };
  }
  return {
    setBoarded(id, on) {
      const r = st.get(id);
      if (!r || r.boarded === on) return;
      r.boarded = on;
      r.raw(r.want && !on);
    },
    restore() {
      for (const r of st.values()) r.api.setLit = r.raw;
    },
  };
}

/** The dais piece api (src/town/pieces/dais.js). Throws when it is missing. */
export interface VendorDaisApi {
  setSeat(i: number, st: unknown): void;
  setPhase(p: string, o?: unknown): void;
  setHand(i: number | null): void;
}
export function daisApi(town: BuiltTown): VendorDaisApi {
  const api = town.registry.get('dais')?.api as AnyApi;
  if (!api || typeof api.setSeat !== 'function' || typeof api.setPhase !== 'function' || typeof api.setHand !== 'function') throw new Error('pixel3d dais api changed (setSeat / setPhase / setHand missing)');
  return api as unknown as VendorDaisApi;
}

/**
 * (v3 WP8, user 2026-10-18: "remove the per-player candles in the voting circle") Takes the dais' per-seat CANDLE
 * STAKES out of the town for good: the iron post + cup + candle beside each seat stone, its flame, the dead seat's
 * ghost-light wisp and its pool, the night candle halo on the ring, and the block pennant hung from the stake. The
 * picking rules are the vendor's own (src/demo/daisdress.js, which hides the same parts only while its vote camera is
 * up); the seat stones, their warm night tops, the dead seats' crack + moss, the nominee / vote marks, the hands, the
 * sweep and the braziers stay. HOW: the piece is one merged kit mesh per layer, so each of the three meshes gets an
 * index that lists only the kept triangles (built once, before the warm-up): the removed ones are never drawn, never
 * shaded and cast no shadow; no lights / programs change (the candles were emissive decals, no PointLights), and the
 * piece's own per-frame state writes (fx levels, pennant positions) still land on the shared vertex buffers.
 * Returns the removed triangle count per mesh (0s when a vendor re-publish renamed the meshes).
 */
export const DAIS_CANDLE_FX_SLOTS: readonly (readonly [number, number])[] = [[30, 45], [45, 60], [85, 100], [160, 175]]; // wisp, candle, wisp pool, candle halo (dais.js)
export function removeDaisCandles(town: BuiltTown): Record<string, number> {
  const group = town.registry.get('dais')?.group as THREE.Object3D | undefined;
  const out: Record<string, number> = { 'dais-solid': 0, 'dais-fx': 0, 'dais-states-solid': 0 };
  if (!group) return out;
  const C = vlayout.CIRCLE ?? { cx: 22.5, cz: 19.75, r: 6.25 };
  const seats = Array.from({ length: 15 }, (_, i) => vlayout.seatPos(i, 15));
  const nearSeat = (x: number, z: number) => {
    let d = Infinity;
    for (const s of seats) d = Math.min(d, Math.hypot(x - s.x, z - s.z));
    return d;
  };
  const SEAT_R = C.r || 6.25, RING_W = 0.2, STONE_CLEAR = 0.5, STAKE_Y = 0.12, PENNANT_CLEAR = 0.6;
  const meshes = new Map<string, THREE.Mesh>();
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry?.attributes?.position && o.name in out && !meshes.has(o.name)) meshes.set(o.name, m);
  });
  const V = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] as const;
  /** Re-index `mesh` without the triangles `drop` picks (corners in world metres; `first` = the triangle's first vertex). */
  const strip = (mesh: THREE.Mesh, drop: (p: readonly THREE.Vector3[], first: number) => boolean): number => {
    const g = mesh.geometry;
    const P = g.attributes.position as THREE.BufferAttribute;
    const idx = g.index;
    const n = idx ? idx.count : P.count;
    mesh.updateMatrixWorld(true);
    const keep: number[] = [];
    let removed = 0;
    for (let t = 0; t + 2 < n; t += 3) {
      const vi = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
      vi.forEach((v, k) => V[k]!.fromBufferAttribute(P, v).applyMatrix4(mesh.matrixWorld));
      if (drop(V, vi[0]!)) removed++;
      else keep.push(vi[0]!, vi[1]!, vi[2]!);
    }
    if (removed) g.setIndex(new THREE.BufferAttribute(P.count > 65535 ? Uint32Array.from(keep) : Uint16Array.from(keep), 1));
    return removed;
  };
  const solid = meshes.get('dais-solid');
  if (solid)
    out['dais-solid'] = strip(solid, (p) => p.every((v) => Math.abs(Math.hypot(v.x - C.cx, v.z - C.cz) - SEAT_R) < RING_W && nearSeat(v.x, v.z) > STONE_CLEAR) && p.some((v) => v.y > STAKE_Y));
  const fx = meshes.get('dais-fx');
  const aFx = fx?.geometry.attributes.aFx as THREE.BufferAttribute | undefined;
  if (fx && aFx)
    out['dais-fx'] = strip(fx, (_, first) => {
      const s = Math.round(aFx.getX(first));
      return DAIS_CANDLE_FX_SLOTS.some(([a, b]) => s >= a && s < b);
    });
  const states = meshes.get('dais-states-solid');
  if (states) out['dais-states-solid'] = strip(states, (p) => p.every((v) => nearSeat(v.x, v.z) > PENNANT_CLEAR));
  return out;
}

/** The life piece (its `update` is swapped out while the town is parked). */
export function lifePiece(town: BuiltTown): { update?: ((t: number, dt: number) => void) | null } | null {
  return (town.registry.get('life') as { update?: (t: number, dt: number) => void } | null) ?? null;
}

/** Life's stats (engine.stats.life, src/town/life/index.js): the `v3-life` checks read walkers / doors / folk. */
export function lifeStats(engine: HostedEngine): { walkers: number; doors: number; folk: boolean; ambient: boolean; benchFolk: boolean } | null {
  const s = (engine.stats as Record<string, unknown> | undefined)?.life as Record<string, unknown> | undefined;
  if (!s) return null;
  // `ambient` is the list of ambient townsfolk names (empty with lifeOff=ambient)
  const ambient = Array.isArray(s.ambient) ? s.ambient.length > 0 : !!s.ambient;
  return { walkers: Number(s.walkers) || 0, doors: Number(s.doors) || 0, folk: !!s.folk, ambient, benchFolk: !!s.benchFolk };
}

/** Every door pivot's current angle (rad), per door id: `v3-life` checks no door moved without a game setDoor. */
export function doorAngles(town: BuiltTown): Record<string, number> {
  const out: Record<string, number> = {};
  const reg = town.registry as unknown as { anchors(k: string): { piece: string; id?: string; pivot?: THREE.Object3D }[] };
  for (const a of reg.anchors('doors')) if (a.pivot) out[a.id ?? a.piece] = +a.pivot.rotation.y.toFixed(4);
  return out;
}

/** Placed vendor house records (metres): door point + outward normal. */
export function houseDoors(): Map<string, { point: { x: number; z: number }; normal: [number, number] }> {
  const out = new Map<string, { point: { x: number; z: number }; normal: [number, number] }>();
  for (const h of vlayout.houses)
    out.set(h.id, { point: { ...h.doorPoint }, normal: [h.doorNormal[0], h.doorNormal[1]] });
  return out;
}

/** An oriented pick box around a placed cottage (metres; `ry` radians, as src/town/town.js houseBox). */
export interface HouseBox {
  id: string;
  center: readonly [number, number];
  half: readonly [number, number];
  y: readonly [number, number];
  ry: number;
}

/**
 * Pick proxies from the DRAWN town (§3 "ST taps" stage 1): the vendor's own houseBox per placed cottage
 * ('full' side mode: the whole cottage up to its roof top, measured from the built group).
 */
export function houseProxies(town: BuiltTown): HouseBox[] {
  const out: HouseBox[] = [];
  for (const rec of vlayout.houses) {
    const g = town.registry.get(rec.id)?.group as THREE.Object3D | undefined;
    const top = g ? new THREE.Box3().setFromObject(g).max.y : 6;
    const b = houseBox(rec, Number.isFinite(top) ? top : 6, 'full');
    out.push({ id: rec.id, center: [b.center[0], b.center[1]], half: [b.half[0], b.half[1]], y: [b.y[0], b.y[1]], ry: Number(b.ry) || 0 });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ boards

/**
 * One boarded-door prop per cottage: two crossed timber planks and a top plank over the door opening, built
 * once with the kit Builder (the town's shared kit materials: no new shader program), parented to the town
 * root (so the interior park hides them), hidden until the stage boards that house.
 */
export function buildDoorBoards(engine: HostedEngine, town: BuiltTown): Map<string, THREE.Object3D> {
  const out = new Map<string, THREE.Object3D>();
  const root = (town.root as THREE.Object3D | undefined) ?? engine.scene;
  const heightAt = groundHeight(town);
  for (const [id, d] of houseDoors()) {
    const b = new Builder(engine, { name: `ct-boards-${id}` });
    const plank = { tones: 'timber', pattern: 'boards' };
    // the door opening is ~1.0 x 2.0 m: two planks crossed at 1.0 m and one across the top, ~10 cm proud
    b.box(1.34, 0.16, 0.05, { ...plank, origin: 'center', at: [0, 1.0, 0.09], rz: 0.62 });
    b.box(1.34, 0.16, 0.05, { ...plank, origin: 'center', at: [0, 1.0, 0.13], rz: -0.62, tint: 0.92 });
    b.box(1.2, 0.14, 0.05, { ...plank, origin: 'center', at: [0, 1.72, 0.1], tint: 0.96 });
    const g = b.build({ name: `ct-boards-${id}`, castShadow: false });
    // root carries the sub-mm ANTI_TIE offset: world door point minus that, so the planks sit on the wall
    g.position.set(d.point.x - root.position.x, heightAt(d.point.x, d.point.z), d.point.z - root.position.z);
    g.rotation.y = Math.atan2(d.normal[0], d.normal[1]);
    g.visible = false;
    root.add(g);
    g.updateMatrixWorld(true);
    out.set(id, g);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ warm-up

/**
 * The demo's warmWholeTown (src/demo/main.js): one extra frame with the camera pulled back over the whole
 * town compiles the programs the spawn view does not show (each a 10-30 ms stall mid-game otherwise), then
 * the camera is put back and rendered once more. Returns the program count before / after.
 */
export function warmWholeTown(engine: HostedEngine): [number, number] {
  return warmViews(engine, [{ target: new THREE.Vector3((Number(vlayout.TOWN_W) || 45) / 2, 0, (Number(vlayout.TOWN_H) || 42) / 2), viewHeight: 45 }]);
}

/** Render one frame per view (camera target + viewHeight; the pipeline only, no updaters), then restore. */
export function warmViews(engine: HostedEngine, views: readonly { target: THREE.Vector3; viewHeight: number }[]): [number, number] {
  const cam = engine.camera;
  const target = cam.target.clone();
  const vh = cam.viewHeight;
  const p0 = engine.renderer.info.programs?.length ?? 0;
  try {
    for (const v of views) {
      cam.target.copy(v.target);
      cam.viewHeight = v.viewHeight;
      cam.update();
      engine._updateSun();
      engine.pipeline.render();
    }
  } finally {
    cam.target.copy(target);
    cam.viewHeight = vh;
    cam.update();
    engine._updateSun();
    engine.pipeline.render();
  }
  return [p0, engine.renderer.info.programs?.length ?? 0];
}

// ------------------------------------------------------------------------------------------------ canopy (D1)

/** Cottage mesh names that are tree crowns / leaf clumps (house-11's oak, house-1 / house-4 clumps). */
const CROWN_MESH = /(crown|leaves|clump)/;

/**
 * The canopy materials (lead decision D1, world/canopy.ts): every toon material of the foliage piece except
 * grass (trees, bushes, stumps, hedges, the rim forest: merged leaf / core / trunk meshes), the crown / clump
 * meshes of the cottages (house-11 api.fadeTargets(), names matching CROWN_MESH) and the shared kit 'soft'
 * layer (thatch, ivy, planters: the exporter's '-soft' occluders). Never the kit 'solid' / 'glass' layers (walls).
 */
export function canopyMaterials(town: BuiltTown): Set<THREE.Material> {
  const out = new Set<THREE.Material>();
  const add = (o: THREE.Object3D) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!m || !(m.userData as { toon?: unknown }).toon) continue;
      if (m.name === 'town-kit-solid' || m.name === 'town-kit-glass') continue;
      out.add(m);
    }
  };
  town.registry.get('foliage')?.group?.traverse((o) => {
    if (!/grass/i.test(o.name ?? '')) add(o);
  });
  for (const rec of vlayout.houses) {
    const p = town.registry.get(rec.id);
    const fade = p?.api?.fadeTargets;
    if (typeof fade === 'function') for (const o of (fade as () => THREE.Object3D[])() ?? []) o.traverse(add);
    p?.group?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (CROWN_MESH.test(o.name ?? '') || (o.userData as { layer?: string }).layer === 'soft') add(o);
    });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ static kit merge (v3.1)

/** The pieces whose static KIT meshes are merged (never the dais or life; ground / foliage: only their kit meshes). */
const MERGE_PIECES = /^(props|house-\d+|clocktower|ground|foliage)$/;
const KIT_MATERIALS = new Set(['town-kit-solid', 'town-kit-soft', 'town-kit-glass']);

export interface TownKitMerge {
  merged: MergedTown;
  /** Kit meshes of the merged pieces left out before the merge, by reason (debug). */
  left: Record<string, number>;
  /** Per frame (after the time facade's setLit writes): mirror writes, eject changed sources, cull merged casters. */
  update(): void;
}

/**
 * (v3.1 stage) Merge the static town-kit meshes of the cottages, the tower and the props across pieces (world/merge.ts),
 * by material + design castShadow + spatial cell (plus the few kit meshes of the ground / foliage pieces). Left out (they change at runtime or are read per piece): every door
 * pivot subtree, the tower's hands and countdown face, the canopy fade targets and crown / clump meshes, the boards and
 * anything else the game added ('ct-*'), the dais, foliage, ground, life and interiors. Glass is merged: the vendor's
 * setLit / street-lamp writes land on the (hidden) source meshes and are mirrored each frame. Null when the design
 * castShadow snapshot is missing or disagrees with the composer's low-tier count (a vendor re-publish changed the rule).
 */
export function mergeTownKit(engine: HostedEngine, town: BuiltTown, o: { cell?: number; mode?: 'batch' | 'merge'; renderOrder?: number; cull?: 'view' | 'three' } = {}): TownKitMerge | null {
  const design = DESIGN_CAST.get(town as object);
  const root = town.root as THREE.Object3D | undefined;
  if (!design || !root) return null;
  const lowStat = (engine.stats as { lowTier?: { softNoCast?: number } } | undefined)?.lowTier?.softNoCast;
  if (lowStat !== undefined && lowStat !== design.lowFlips) {
    console.warn(`[town3d] kit merge off: low-tier caster rule changed (vendor ${lowStat}, snapshot ${design.lowFlips})`);
    return null;
  }
  const skip = new Set<THREE.Object3D>();
  const reg = town.registry as unknown as { anchors(k: string): { pivot?: THREE.Object3D }[] };
  for (const a of reg.anchors('doors')) if (a.pivot) skip.add(a.pivot);
  const cands: MergeCandidate[] = [];
  const left: Record<string, number> = {};
  const isKit = (n: THREE.Object3D) => {
    const mat = (n as THREE.Mesh).material as THREE.Material | undefined;
    return !!(n as THREE.Mesh).isMesh && !!mat && !Array.isArray(mat) && KIT_MATERIALS.has(mat.name);
  };
  const leave = (n: THREE.Object3D, why: string) => n.traverse((c) => {
    if (isKit(c)) left[why] = (left[why] ?? 0) + 1;
  });
  for (const id of town.registry.map.keys()) {
    if (!MERGE_PIECES.test(String(id))) continue;
    const p = town.registry.get(String(id));
    const g = p?.group as THREE.Object3D | undefined;
    if (!g) continue;
    const api = p?.api as Record<string, unknown> | undefined;
    const hands = (api?.hands as THREE.Object3D | undefined) ?? g.getObjectByName('clocktower-hands');
    if (hands) skip.add(hands);
    const fade = api?.fadeTargets;
    if (typeof fade === 'function') for (const t of ((fade as () => THREE.Object3D[])() ?? [])) skip.add(t);
    const walk = (n: THREE.Object3D) => {
      const nm = n.name ?? '';
      if (skip.has(n) || /-pivot$/.test(nm)) return leave(n, 'door/hands/fade');
      if (nm.startsWith('ct-')) return leave(n, 'game');
      if (CROWN_MESH.test(nm)) return leave(n, 'crown');
      if (isKit(n)) {
        const c = design.cast.get(n);
        if (c === undefined) left.noDesign = (left.noDesign ?? 0) + 1;
        else cands.push({ mesh: n as THREE.Mesh, cast: c });
      }
      for (const ch of n.children) walk(ch);
    };
    walk(g);
  }
  const merged = mergeStatic(root, cands, { cell: o.cell, mode: o.mode, renderOrder: o.renderOrder, cull: o.cull, name: 'ct-town-merged' });
  const cam = engine.camera as unknown as { target: THREE.Vector3; yaw: number; pitch: number; viewHeight: number };
  const sunDir = (engine.uniforms as { uSunDir?: { value: THREE.Vector3 } } | undefined)?.uSunDir?.value;
  const view: ShadowView = { target: cam.target, yaw: 0, pitch: 0, viewHeight: 1, aspect: 16 / 9, sunDir: sunDir ?? new THREE.Vector3(0, 1, 0) };
  return {
    merged,
    left,
    update() {
      merged.sync();
      if (!sunDir) return;
      const size = (engine.pipeline as unknown as { size?: { x: number; y: number } }).size;
      view.target = cam.target;
      view.yaw = cam.yaw;
      view.pitch = cam.pitch;
      view.viewHeight = cam.viewHeight;
      view.aspect = size && size.y > 0 ? size.x / size.y : 16 / 9;
      merged.cull(view);
    },
  };
}

// ------------------------------------------------------------------------------------------------ live cut-away

export interface CutPlayer {
  /** Own avatar feet (m) outdoors, null otherwise. */
  readonly position: { x: number; y: number; z: number } | null;
  /** The cottage door the own player stands at ({id: 'house-i'}), or null. */
  readonly nearDoor: { id: string } | null;
  /** Non-null while a room is shown (the town cut-away is off inside). */
  readonly interior: unknown;
}

export interface CutDriver {
  update(): void;
  info(): Record<string, unknown> | null;
}

/**
 * The vendor's live cut-away controller (src/demo/api.js createCutController, the demo calls it every frame):
 * re-aims the town's camera-aware cut-away (buildTown installs it on every town material, uniforms only) at the
 * own player: a 0.9 x 1.8 m box at the avatar (never hidden behind a cottage), the cottage whose door approach it
 * stands in (cut + keep box), the voting circle while the camera is on the square; off inside a room. Without it
 * the cut stays frozen at the build camera (circle on, no player box). Null when the vendor no longer exports it
 * or the town has no cut-away.
 */
export function createCutDriver(engine: HostedEngine, town: BuiltTown, player: CutPlayer): CutDriver | null {
  const make = (demoApiNS as unknown as { createCutController?: (demo: unknown) => { update(): void; info: Record<string, unknown> } }).createCutController;
  if (typeof make !== 'function' || !(town as { cutaway?: unknown }).cutaway) return null;
  const facade = {
    engine,
    town,
    store: { state: Object.freeze({ cutaway: 'auto' }) },
    player,
    events: { on: () => () => undefined },
  };
  const ctl = make(facade);
  return {
    update: () => ctl.update(),
    info: () => ({ ...ctl.info }),
  };
}

// ------------------------------------------------------------------------------------------------ boarded light pool

/** World positions (m) of each cottage's light anchors (lanterns, windows), per house id. */
export function houseLightAnchors(town: BuiltTown): Map<string, THREE.Vector3[]> {
  const out = new Map<string, THREE.Vector3[]>();
  const reg = town.registry as unknown as { anchors(k: string): { piece: string; pos?: THREE.Vector3 }[] };
  for (const a of reg.anchors('lights')) {
    if (!/^house-\d+$/.test(a.piece) || !a.pos) continue;
    (out.get(a.piece) ?? out.set(a.piece, []).get(a.piece)!).push(a.pos.clone());
  }
  return out;
}

/**
 * The town's PointLight pool after createTime (src/demo/time.js: the composer's adopted lights + its own
 * 'demo-time-lights' group); the carried-light reserve is not part of it.
 */
export function poolLights(engine: HostedEngine, town: BuiltTown): THREE.PointLight[] {
  const out: THREE.PointLight[] = [];
  for (const o of ((town as { lights?: { light?: THREE.PointLight }[] }).lights ?? [])) if (o.light?.isPointLight) out.push(o.light);
  const g = engine.scene.getObjectByName('demo-time-lights');
  for (const c of g?.children ?? []) if ((c as THREE.PointLight).isPointLight && !out.includes(c as THREE.PointLight)) out.push(c as THREE.PointLight);
  return out;
}

// ------------------------------------------------------------------------------------------------ the clock tower

/** The clock tower's door (the 16th building of the v3 world: enterable since vendor pass B), or null. */
export function towerDoorApi(town: BuiltTown): HouseApi | null {
  const api = town.registry.get('clocktower')?.api as AnyApi;
  if (!api || typeof api.setDoor !== 'function') return null;
  const setDoor = api.setDoor as (f: number) => void;
  return { id: 'clocktower', setDoor: (f) => setDoor(f) };
}

/** A tower dial in world metres (world/voteFrame.ts Dial). */
export interface TowerDial {
  c: { x: number; y: number; z: number };
  n: { x: number; y: number; z: number };
  r: number;
  k: number;
}

/**
 * The tower's four dials in WORLD metres, from the clocktower api's dials (pass-B hook: `local` = the face frame in the
 * piece, multiplied by the piece group's CURRENT matrixWorld: the api's own `center` / `normal` were captured while
 * the piece was being built, before the composer placed it). Falls back to the vendor's clocktower.js constants
 * (votecam.js towerDials) when the hook is missing.
 */
export function towerDials(town: BuiltTown): TowerDial[] {
  const piece = town.registry.get('clocktower') as { group?: THREE.Object3D; api?: { dials?: { local: THREE.Matrix4; k: number; surround: number }[] } } | undefined;
  const dials = piece?.api?.dials;
  const g = piece?.group;
  if (g && Array.isArray(dials) && dials.length) {
    g.updateWorldMatrix(true, false);
    const m = new THREE.Matrix4();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    return dials.map((d) => {
      m.multiplyMatrices(g.matrixWorld, d.local);
      c.setFromMatrixPosition(m);
      n.set(0, 0, 1).transformDirection(m);
      return { c: { x: c.x, y: c.y, z: c.z }, n: { x: n.x, y: n.y, z: n.z }, r: Number(d.surround) || 1.42, k: Number(d.k) || 1 };
    });
  }
  const cx = 22.5;
  const cz = 7 - 0.2;
  const y = 5.45;
  return [
    { c: { x: cx, y, z: cz + 1.6 }, n: { x: 0, y: 0, z: 1 }, r: 1.42, k: 1 },
    { c: { x: cx + 1.75, y, z: cz }, n: { x: 1, y: 0, z: 0 }, r: 1.42 * 0.86, k: 0.86 },
    { c: { x: cx, y, z: cz - 1.6 }, n: { x: 0, y: 0, z: -1 }, r: 1.42 * 0.86, k: 0.86 },
    { c: { x: cx - 1.75, y, z: cz }, n: { x: -1, y: 0, z: 0 }, r: 1.42 * 0.86, k: 0.86 },
  ];
}

/** (v3.1) The voting circle (vendor layout.js CIRCLE: centre and seat radius, metres) for the vote frame's ring edge. */
export function voteCircle(): { cx: number; cz: number; r: number } {
  const C = vlayout.CIRCLE ?? { cx: 22.5, cz: 19.75, r: 6.25 };
  return { cx: Number(C.cx), cz: Number(C.cz), r: Number(C.r) || 6.25 };
}

/** The 15 dais seat stones (vendor layout.js seatPos(i, 15)) in world metres, y = the stone top (votecam SEAT_TOP). */
export function seatStones(top = 0.235): { x: number; y: number; z: number }[] {
  return Array.from({ length: 15 }, (_, i) => {
    const s = vlayout.seatPos(i, 15);
    return { x: Number(s.x), y: top, z: Number(s.z) };
  });
}

/** What the tower's four dials show instead of the hands (world/towerClock.ts dialFace). */
export interface TowerFacePlan {
  mode: 'running' | 'paused' | 'done';
  stage: 'discussion' | 'nominations' | 'bedtime';
  /** wedge size in DIAL_STEPS (180) steps */
  q: number;
  flashOn: boolean;
  night: boolean;
}

export interface TowerFace {
  /** null = the live time-of-day hands again. Rebuilds the face geometry only when `key` changed. */
  show(plan: TowerFacePlan | null, key: string): void;
  info(): { shown: boolean; key: string; rebuilds: number; dials: number };
  dispose(): void;
}

/**
 * The Storyteller's countdown on the clock tower (user request in flight 2): while a stage timer runs, the piece's
 * live hands are hidden and all four dials show the vendor's countdown face (src/demo/towertimer.js drawDialFace: a
 * stage-coloured wedge = the time left, one iron hand, pause bars, a flash at zero), built with the kit Builder on
 * each dial's frame (the town's shared kit solid / glass materials: no new program). One persistent mesh per kit layer
 * whose geometry is swapped on a rebuild (the demo's dynMeshes). Null when the vendor clocktower has no dial hook.
 */
export function createTowerFace(engine: HostedEngine, town: BuiltTown): TowerFace | null {
  const piece = town.registry.get('clocktower') as { group?: THREE.Object3D; api?: { dials?: { local: THREE.Matrix4; k: number }[]; hands?: THREE.Object3D } } | undefined;
  const draw = (towerTimerNS as unknown as { drawDialFace?: (b: unknown, o: Record<string, unknown>) => void }).drawDialFace;
  const dials = piece?.api?.dials;
  const g = piece?.group;
  if (!g || !Array.isArray(dials) || !dials.length || typeof draw !== 'function') return null;
  const hands = piece?.api?.hands ?? g.getObjectByName('clocktower-hands') ?? null;
  const root = new THREE.Group();
  root.name = 'ct-tower-timer';
  g.add(root);
  const meshes = new Map<string, THREE.Mesh>();
  let key = 'tod';
  let rebuilds = 0;
  const hideAll = () => {
    for (const m of meshes.values()) m.visible = false;
  };
  return {
    show(plan, k) {
      if (k === key) return;
      key = k;
      if (hands) hands.visible = !plan;
      if (!plan) return hideAll();
      const b = new Builder(engine, { name: 'ct-tower-timer' });
      for (const d of dials) {
        b.push(d.local);
        draw(b, { frac: plan.q / 180, mode: plan.mode, stage: plan.stage, flashOn: plan.flashOn, k: d.k, night: plan.night });
        b.pop();
      }
      const built = b.build({ name: 'ct-tower-timer', castShadow: false, receiveShadow: true });
      const got = new Set<string>();
      for (const child of [...built.children]) {
        const m = child as THREE.Mesh;
        const layer = String((m.userData as { layer?: string }).layer ?? m.name);
        got.add(layer);
        const cur = meshes.get(layer);
        if (!cur) {
          m.name = `ct-tower-timer-${layer}`;
          root.add(m);
          meshes.set(layer, m);
          continue;
        }
        cur.geometry.dispose();
        cur.geometry = m.geometry;
        cur.visible = true;
      }
      for (const [layer, m] of meshes) if (!got.has(layer)) m.visible = false;
      root.updateMatrixWorld(true);
      rebuilds++;
    },
    info: () => ({ shown: key !== 'tod', key, rebuilds, dials: dials.length }),
    dispose() {
      for (const m of meshes.values()) {
        m.geometry.dispose();
        m.removeFromParent();
      }
      meshes.clear();
      root.removeFromParent();
      if (hands) hands.visible = true;
    },
  };
}

// ------------------------------------------------------------------------------------------------ in-flight hooks

export interface VendorCameraShot {
  X: number;
  Y: number;
  Z: number;
  viewHeight: number;
  yaw: number;
  pitch: number;
}

/**
 * The vendor's old fixed vote preset (src/town/api.js CAMERAS.vote: the plaza centre at viewHeight 19, yaw 0), read
 * live. Since vendor pass B the game frames the vote with world/voteFrame.ts (the vendor's computed votecam fit);
 * this stays as the fallback / debug value. `pitch` defaults to the fixed pi/6.
 */
export function voteCameraPreset(): VendorCameraShot | null {
  const cams = (townApiNS as unknown as { CAMERAS?: Record<string, { yaw?: number; pitch?: number; viewHeight?: number; target?: number[] }> }).CAMERAS;
  const v = cams?.vote;
  if (!v || !Array.isArray(v.target) || !(Number(v.viewHeight) > 0)) return null;
  return {
    X: Number(v.target[0]) || 0,
    Y: Number(v.target[1]) || 0,
    Z: Number(v.target[2]) || 0,
    viewHeight: Number(v.viewHeight),
    yaw: Number(v.yaw) || 0,
    pitch: Number.isFinite(Number(v.pitch)) && v.pitch !== undefined ? Number(v.pitch) : Math.PI / 6,
  };
}
