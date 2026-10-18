// v3 WP3 (v3-stage). Typed wrapper over pixel3d's cottage interiors (src/town/interiors/index.js
// buildInterior; docs/v3/INTEGRATION.md §2.3, §3 "Interiors"). One of the only modules allowed to import
// '@pixel3d/*' (game3d/vendor/**).
//
// The room is built far east of the town at originOf(i) (x = 200 + 30 i, z = 20), which coords.ts
// interiorOrigin() mirrors (the px <-> m translation of §2.3 is anchored on it). The interior never creates
// PointLights: the time facade re-aims the constant pool at `lights` when `player.interior` is this room.
// A house module that fails to build falls back to the vendor's standard room (console.warn), so a cottage
// can always be entered; the collision is the server's (WP5a export), not this room's.
import * as THREE from 'three';
import * as interiorsNS from '@pixel3d/town/interiors/index.js';
import * as towerRoomNS from '@pixel3d/demo/tower-interior.js';
import { interiorOrigin, TOWER_ROOM } from '../coords';

export interface InteriorLight {
  pos: THREE.Vector3;
  color: THREE.ColorRepresentation;
  r: number;
  kind: string;
  intensity?: number;
}

/** The subset of the vendor interior record the game uses. */
export interface BuiltInterior {
  id: string;
  /** cottage index; -1 for the clock tower's room */
  index: number;
  name: string;
  group: THREE.Group;
  origin: THREE.Vector3;
  floor: { x0: number; z0: number; x1: number; z1: number };
  lights: InteriorLight[];
  camera: { target: THREE.Vector3; viewHeight: number; yaw: number; pitch: number };
  spawn: { x: number; z: number; facing: number };
  exit: { x: number; z: number; r: number };
  update(t: number, dt: number): void;
  setTimeOfDay(tod: string): void;
  dispose(): void;
  stats: { buildMs: number; calls?: number; tris?: number; failed?: number; stub?: number };
  /** Floor height (m) at a world point (the clock tower's stair / landing); absent = flat 0. */
  heightAt?(x: number, z: number): number;
}

const vendor = interiorsNS as unknown as {
  buildInterior(engine: unknown, houseId: string, ctx: { tod?: string }): Promise<unknown>;
  originOf(i: number): THREE.Vector3;
  HOUSE_COUNT: number;
};

export const INTERIOR_COUNT: number = vendor.HOUSE_COUNT;

/** Build cottage i's interior (not yet added to the scene). Rejects when the house id is unknown. */
export async function buildHouseInterior(engine: unknown, index: number, o: { tod: string }): Promise<BuiltInterior> {
  const it = (await vendor.buildInterior(engine, `house-${index}`, { tod: o.tod })) as BuiltInterior;
  // the §2.3 translation is anchored on this origin: a vendor re-publish that moves the rooms must fail loudly
  const want = interiorOrigin(index);
  const got = vendor.originOf(index);
  if (Math.abs(got.x - want.X) > 1e-6 || Math.abs(got.z - want.Z) > 1e-6) {
    it.dispose();
    throw new Error(`pixel3d interior origin changed for house-${index}: (${got.x}, ${got.z}) != coords.ts (${want.X}, ${want.Z})`);
  }
  return it;
}

// ------------------------------------------------------------------------------------------------ the clock tower

/** What the vendor tower room reads from its `demo` (src/demo/tower-interior.js buildTowerRoom). */
export interface TowerRoomFacade {
  engine: unknown;
  /** 'bell' -> the bell rope jerks, the fly spins */
  events: { on(name: string, fn: (e?: { t?: number }) => void): () => void };
  /** the Storyteller's countdown (mode 'idle' | 'running' | 'paused' | 'done', frac = time left 0..1, stage, doneAt engine s) */
  passB: { timer: { readonly state: { mode: string; frac: number; stage: string; doneAt: number | null; remaining: number; duration: number } } };
  /** the town hours (the going train) */
  time: { readonly hours: number };
}

const tower = towerRoomNS as unknown as {
  buildTowerRoom(engine: unknown, demo: TowerRoomFacade): {
    group: THREE.Group;
    floor: { x0: number; z0: number; x1: number; z1: number };
    spawn: { x: number; z: number; facing: number };
    exit: { x: number; z: number; r: number };
    camera: { target: number[]; viewHeight: number; yaw?: number };
    lights: { kind: string; pos: { x: number; y: number; z: number }; color: THREE.ColorRepresentation; r: number; intensity?: number }[];
    nightAmbient?: unknown;
    heightAt(x: number, z: number): number;
    update(t: number): void;
    dispose(): void;
  };
  ORIGIN: { x: number; z: number };
};

/**
 * The clock tower's walkable clockwork room (vendor pass B, user request in flight 4) as a BuiltInterior, so the stage
 * shows / parks / caches it like a cottage (world/interiors.ts). Built at the vendor ORIGIN (650, 20), which coords.ts
 * TOWER_ROOM mirrors (checked here). The room animates from `facade` (timer, bell, hours) in its update; its lanterns
 * and dial window are `lights` for the time facade's constant pool (no new lights / programs: kit Builder geometry).
 */
export function buildTowerInterior(engine: unknown, facade: TowerRoomFacade): BuiltInterior {
  const t0 = performance.now();
  const o = tower.ORIGIN;
  if (!o || Math.abs(o.x - TOWER_ROOM.origin.X) > 1e-6 || Math.abs(o.z - TOWER_ROOM.origin.Z) > 1e-6)
    throw new Error(`pixel3d tower room origin changed: (${o?.x}, ${o?.z}) != coords.ts (${TOWER_ROOM.origin.X}, ${TOWER_ROOM.origin.Z})`);
  const raw = tower.buildTowerRoom(engine, facade);
  const exitZ = raw.exit.z;
  if (Math.abs(raw.exit.x - TOWER_ROOM.anchorM.X) > 1e-6 || Math.abs(exitZ - TOWER_ROOM.anchorM.Z) > 1e-6) {
    raw.dispose();
    throw new Error(`pixel3d tower room exit moved: (${raw.exit.x}, ${exitZ}) != coords.ts anchor (${TOWER_ROOM.anchorM.X}, ${TOWER_ROOM.anchorM.Z})`);
  }
  const cam = raw.camera;
  const group = raw.group;
  return {
    id: 'clocktower',
    index: -1,
    name: 'The Clocktower',
    group,
    origin: new THREE.Vector3(o.x, 0, o.z),
    floor: { ...raw.floor },
    lights: raw.lights.map((l) => ({ kind: l.kind, color: l.color, r: l.r, ...(l.intensity !== undefined ? { intensity: l.intensity } : {}), pos: new THREE.Vector3(l.pos.x, l.pos.y, l.pos.z) })),
    camera: { target: new THREE.Vector3(Number(cam.target[0]) || o.x, Number(cam.target[1]) || 0, Number(cam.target[2]) || o.z), viewHeight: cam.viewHeight, yaw: Number(cam.yaw) || 0, pitch: Math.PI / 6 },
    spawn: { ...raw.spawn },
    exit: { ...raw.exit },
    update: (t) => raw.update(t),
    setTimeOfDay: () => undefined,
    heightAt: (x, z) => raw.heightAt(x, z),
    dispose() {
      raw.dispose();
      const seen = new Set<unknown>();
      group.traverse((n) => {
        const m = n as THREE.Mesh;
        if (m.geometry && !seen.has(m.geometry)) {
          seen.add(m.geometry);
          m.geometry.dispose();
        }
      });
      group.removeFromParent();
    },
    stats: { buildMs: Math.round(performance.now() - t0) },
    ...(raw.nightAmbient ? { nightAmbient: raw.nightAmbient } : {}),
  } as BuiltInterior;
}
