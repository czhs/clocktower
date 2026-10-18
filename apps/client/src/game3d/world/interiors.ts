// v3 WP3 (v3-stage). Interior switching, caching and parking (docs/v3/INTEGRATION.md §3 "Interiors"):
//   - the shown location follows the own player: `bld:house-i` -> that cottage's 3D room (built lazily by
//     vendor/interiors.ts buildHouseInterior, 25-50 ms), anything else -> the town;
//   - while a room is shown the town graph is parked (world/park.ts), the room's group is in the scene and
//     its update (wall cut-away, animated bits) runs; on the way out the room's group is detached (kept);
//   - at most CACHE rooms stay built (least recently used beyond that are disposed, never the shown one);
//   - rooms near the player (its own home, a door it walks up to) are prefetched, so entering rarely waits;
//   - the window sky follows the town preset (setTimeOfDay).
// The constant light pool is re-aimed by the time facade from `shown()` (player.interior), so entering or
// leaving never changes the light count.
import * as THREE from 'three';
import type { LocationId } from '@ct/protocol';
import { houseOfLocation } from '../coords';
import { buildHouseInterior, type BuiltInterior } from '../vendor/interiors';
import type { TownPark } from './park';

export const CACHE = 2;

export interface InteriorManager {
  /** Show the location (own player's). Builds the room on demand; outdoors un-parks the town. */
  show(loc: LocationId): void;
  /** Build a room in the background (no-op when cached / building / outdoors). */
  prefetch(index: number): void;
  /** Build (or get) a room; null when it failed. */
  load(index: number): Promise<BuiltInterior | null>;
  /** Per frame (engine updater): the shown room's update. */
  update(t: number, dt: number): void;
  /** The window sky of every cached room (town preset name). */
  setTod(tod: string): void;
  /** The room that is drawn now (null outdoors or while it builds). */
  shown(): BuiltInterior | null;
  /** The location being drawn ('outdoors' until the wanted room is built). */
  drawn(): LocationId;
  /** Interior camera framing (vendor dollhouse view) while a room is shown. */
  camera(): { target: THREE.Vector3; viewHeight: number } | null;
  /** Indices of built rooms, most recent last (debug). */
  cached(): number[];
  /** Last switch time (ms, show() -> room in the scene) for the ≤ 120 ms budget (debug). */
  readonly lastSwitchMs: number | null;
  dispose(): void;
}

export interface InteriorManagerOptions {
  engine: unknown;
  scene: THREE.Scene;
  park: TownPark;
  tod(): string;
  /** Rooms build failures are reported here (the town stays shown). */
  onError?(e: unknown): void;
  /** Allowed to park the town (after the warm-up). */
  canPark(): boolean;
}

export function createInteriorManager(o: InteriorManagerOptions): InteriorManager {
  const built = new Map<number, BuiltInterior>();
  const building = new Map<number, Promise<BuiltInterior | null>>();
  const order: number[] = [];
  let want: number | null = null;
  let current: BuiltInterior | null = null;
  let disposed = false;
  let lastSwitchMs: number | null = null;
  let askedAt = 0;

  const touch = (i: number) => {
    const k = order.indexOf(i);
    if (k >= 0) order.splice(k, 1);
    order.push(i);
  };
  const evict = () => {
    while (order.length > CACHE) {
      const victim = order.find((i) => i !== want && built.get(i) !== current);
      if (victim === undefined) break;
      order.splice(order.indexOf(victim), 1);
      const it = built.get(victim);
      built.delete(victim);
      it?.dispose();
    }
  };
  const build = (i: number): Promise<BuiltInterior | null> => {
    const have = built.get(i);
    if (have) return Promise.resolve(have);
    const pending = building.get(i);
    if (pending) return pending;
    const p = buildHouseInterior(o.engine, i, { tod: o.tod() })
      .then((it) => {
        building.delete(i);
        if (disposed) {
          it.dispose();
          return null;
        }
        built.set(i, it);
        touch(i);
        evict();
        if (want === i) attach(it);
        return it;
      })
      .catch((e) => {
        building.delete(i);
        o.onError?.(e);
        return null;
      });
    building.set(i, p);
    return p;
  };
  const detach = () => {
    if (current) current.group.removeFromParent();
    current = null;
    o.park.unpark();
  };
  const attach = (it: BuiltInterior) => {
    if (current === it) return;
    if (current) current.group.removeFromParent();
    current = it;
    it.setTimeOfDay(o.tod());
    o.scene.add(it.group);
    it.group.updateMatrixWorld(true);
    if (o.canPark()) o.park.park();
    touch(it.index);
    lastSwitchMs = Math.round(performance.now() - askedAt);
  };

  return {
    get lastSwitchMs() {
      return lastSwitchMs;
    },
    show(loc) {
      const i = houseOfLocation(loc);
      if (i === want) {
        // the town may have become parkable since (warm-up done)
        if (current && !o.park.parked && o.canPark()) o.park.park();
        return;
      }
      want = i;
      askedAt = performance.now();
      if (i === null) {
        detach();
        return;
      }
      const it = built.get(i);
      if (it) attach(it);
      else {
        // until the room exists the town stays drawn (one frame of the old place, never a black void)
        void build(i);
      }
    },
    prefetch(i) {
      if (disposed || built.has(i) || building.has(i) || i < 0) return;
      // never push the wanted / shown room out for a guess
      void build(i);
    },
    load: (i) => build(i),
    update(t, dt) {
      current?.update(t, dt);
    },
    setTod(tod) {
      for (const it of built.values()) it.setTimeOfDay(tod);
    },
    shown: () => current,
    drawn: () => (current ? (`bld:house-${current.index}` as LocationId) : 'outdoors'),
    camera: () => (current ? { target: current.camera.target, viewHeight: current.camera.viewHeight } : null),
    cached: () => [...order],
    dispose() {
      disposed = true;
      detach();
      for (const it of built.values()) it.dispose();
      built.clear();
      order.length = 0;
    },
  };
}
