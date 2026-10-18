// v3 WP1 (v3-core). What a primary tap on the 3D town means (TownScene.handleTap rules, docs/v3/INTEGRATION.md §3
// "Tap-to-walk routes", "ST visits / teleports"), decided from the picked world point (input/pick.ts):
//
//   Storyteller (with the Storyteller's game view), not walking inside a room:
//     a cottage (roof / doorstep / footprint)  -> teleport_self into it
//     a ground spot outdoors                   -> teleport_self to that point
//     inside, a tap that is not on the room    -> nothing
//   everyone else (and the Storyteller inside a room):
//     inside   -> walk to the floor spot (the doorway = walk there and out)
//     outdoors -> walk to the spot / the cottage (and in)
//
// Pure: no DOM, no network (the caller sends / walks).
import type { LocationId, TownLayout } from '@ct/protocol';
import { interiorTapTarget, type InteriorTap } from '../../game/interior';
import { tapTarget, type DoorSpot } from '../../game/rules/doors';
import type { PickResult } from './pick';
import { buildingOf } from './pick';

export type TapAction =
  | { kind: 'none' }
  | { kind: 'st-building'; buildingId: string }
  | { kind: 'st-point'; x: number; y: number }
  | { kind: 'walk'; x: number; y: number; enter: string | null }
  | { kind: 'inside'; tap: InteriorTap };

export interface TapCtx {
  layout: TownLayout;
  doors: readonly DoorSpot[];
  /** The viewer's location. */
  location: LocationId;
  /** The viewer is the Storyteller AND holds the Storyteller's game view (v2: teleports need both). */
  storyteller: boolean;
}

export function resolveTap(ctx: TapCtx, hit: PickResult | null): TapAction {
  if (!hit) return { kind: 'none' };
  const inside = ctx.location !== 'outdoors';
  const b = inside ? buildingOf(ctx.layout, ctx.location) : null;
  // outdoors: a house hit already means its door; a ground point near a door / on a footprint means the house
  const target = inside ? { x: hit.x, y: hit.y, enter: null as string | null } : hit.houseId ? { x: hit.x, y: hit.y, enter: hit.houseId } : tapTarget(ctx.layout, ctx.doors, hit.x, hit.y);
  const room = inside && b && hit.location === ctx.location ? interiorTapTarget(ctx.layout, b, hit.x, hit.y) : null;
  const inRoomTap = inside && target.enter === null && room !== null;
  if (ctx.storyteller && !inRoomTap) {
    if (inside && target.enter === null) return { kind: 'none' };
    if (target.enter) return { kind: 'st-building', buildingId: target.enter };
    if (!inside) return { kind: 'st-point', x: Math.round(target.x), y: Math.round(target.y) };
    return { kind: 'none' };
  }
  if (inside) return room ? { kind: 'inside', tap: room } : { kind: 'none' };
  return { kind: 'walk', x: target.x, y: target.y, enter: target.enter };
}
