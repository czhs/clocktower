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
import { applyCamera } from '@pixel3d/town/api.js';
import * as kitNS from '@pixel3d/town/kit.js';
import * as layoutNS from '@pixel3d/town/layout.js';
import { PLAZA } from '@pixel3d/town/layout.js';
import * as townNS from '@pixel3d/town/town.js';
import { buildTown } from '@pixel3d/town/town.js';
import type { HostedEngine } from './engineHost';

/** The parts of src/town/layout.js / town.js this wrapper reads beyond pixel3d.d.ts (lead-owned typings). */
interface VendorHouseRec {
  id: string;
  doorPoint: { x: number; z: number };
  doorNormal: [number, number];
}
const vlayout = layoutNS as unknown as { houses: VendorHouseRec[]; TOWN_W: number; TOWN_H: number };
interface KitBuilder {
  box(w: number, h: number, d: number, o?: Record<string, unknown>): KitBuilder;
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
  quality: 'high' | 'low';
  /** Build-time time-of-day preset (the preset of the starting hour; the time facade interpolates from it). */
  tod?: TodPreset;
  /** PointLight budget of the town pool (composer lights on golden / night builds). */
  lights?: number;
}

export async function buildHollowmere(engine: HostedEngine, o: TownBuildOptions): Promise<BuiltTown> {
  applyCamera(engine, 'gameplay', { focus: new THREE.Vector3(PLAZA.cx, 0, PLAZA.cz) });
  const q = new URLSearchParams({ tod: o.tod ?? 'noon', quality: o.quality, life: '1', demo: 'day', lifeOff: LIFE_OFF });
  if (o.lights) q.set('lights', String(o.lights));
  engine.__ctGrassArea = { ...GRASS_AREA };
  try {
    return await buildTown(engine, q, { strict: 'all' });
  } finally {
    delete engine.__ctGrassArea;
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
