// v3 WP3 (v3-stage). Typed wrapper over pixel3d's cottage interiors (src/town/interiors/index.js
// buildInterior; docs/v3/INTEGRATION.md §2.3, §3 "Interiors"). One of the only modules allowed to import
// '@pixel3d/*' (game3d/vendor/**).
//
// The room is built far east of the town at originOf(i) (x = 200 + 30 i, z = 20), which coords.ts
// interiorOrigin() mirrors (the px <-> m translation of §2.3 is anchored on it). The interior never creates
// PointLights: the time facade re-aims the constant pool at `lights` when `player.interior` is this room.
// A house module that fails to build falls back to the vendor's standard room (console.warn), so a cottage
// can always be entered; the collision is the server's (WP5a export), not this room's.
import type * as THREE from 'three';
import * as interiorsNS from '@pixel3d/town/interiors/index.js';
import { interiorOrigin } from '../coords';

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
