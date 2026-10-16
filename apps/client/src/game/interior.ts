// OWNED BY world-art. Walkable cottage interiors (v2.2): pure helpers TownScene uses while you are
// inside a cottage. Interiors are ordinary walkable rooms in the shared layout (walls 'W', the
// doorway 'D' and the furniture collide; see packages/assets/src/layout.ts), so movement, prediction,
// tap-to-go path finding and the server's validation are exactly the outdoor ones. What is special
// inside:
//   - the way out: the doorway tile at the bottom of the room (directly below `interiorDoor`).
//     Pushing DOWN (held briefly) while standing on the interior door tile leaves (like walking into an outdoor
//     doorway enters); a tap on the doorway walks there and leaves; the HUD's Leave button still
//     leaves from anywhere.
//   - the camera shows the whole room (no scrolling) above the "Inside …" panel.
// Nothing here talks to the network: TownScene sends the usual 'move' / 'world:useDoor' frames.
import { tileCenterPx, type BuildingDef, type TownLayout } from '@ct/protocol';
import { findPath, nearestFree, type Pt } from './path';

/** Within this distance (px) of the interior door spot, pushing toward the doorway leaves. */
export const EXIT_TRIGGER_PX = 11;
/** A blocked push into a locked doorway explains itself at most this often (ms). */
const EXIT_RETRY_MS = 1200;
/** Hold the push into the doorway this long before it walks you out (ms). */
export const EXIT_HOLD_MS = 180;

/** Feet position of the interior door spot (where you arrive, and where walking out starts). */
export function interiorDoorPx(layout: TownLayout, b: BuildingDef): Pt {
  return tileCenterPx(layout, b.interiorDoor);
}

/** The doorway tile (blocked; the gap in the bottom wall below the interior door spot), in px: its centre. */
export function doorwayPx(layout: TownLayout, b: BuildingDef): Pt {
  const ts = layout.tileSize;
  return { x: (b.interiorDoor.x + 0.5) * ts, y: (b.interiorDoor.y + 1.5) * ts };
}

/** True while standing on (or right by) the interior door spot. */
export function atInteriorDoor(layout: TownLayout, b: BuildingDef, me: Pt): boolean {
  const d = interiorDoorPx(layout, b);
  return Math.hypot(me.x - d.x, me.y - d.y) <= EXIT_TRIGGER_PX;
}

/** Pushing (vx, vy) at `me` walks out through the doorway (the doorway is below the door spot). */
export function pushesOut(layout: TownLayout, b: BuildingDef, me: Pt, vx: number, vy: number): boolean {
  const len = Math.hypot(vx, vy);
  if (!len || !atInteriorDoor(layout, b, me)) return false;
  return vy / len >= 0.6;
}

/** The room's visible area (world px): the interior rect plus half a tile around it (TownScene.fitCamera). */
export function roomArea(layout: TownLayout, b: BuildingDef): { x: number; y: number; w: number; h: number } {
  const ts = layout.tileSize;
  const r = b.interior;
  return { x: (r.x - 0.5) * ts, y: (r.y - 0.5) * ts, w: (r.w + 1) * ts, h: (r.h + 1) * ts };
}

export interface InteriorTap {
  /** Feet position to walk to (always walkable, inside this room). */
  x: number;
  y: number;
  /** Walk out through the doorway at the end. */
  exit: boolean;
}

/**
 * What a tap at world (x, y) means inside cottage `b`: the doorway (or anything below the floor)
 * = walk to the door and out; a spot on the floor = walk there; furniture / walls = the nearest
 * free floor spot. null = not in this room (the letterbox around it).
 */
export function interiorTapTarget(layout: TownLayout, b: BuildingDef, x: number, y: number): InteriorTap | null {
  const a = roomArea(layout, b);
  if (x < a.x || y < a.y || x >= a.x + a.w || y >= a.y + a.h) return null;
  const ts = layout.tileSize;
  const door = interiorDoorPx(layout, b);
  const dw = doorwayPx(layout, b);
  // the doorway itself (and the doormat just above it), or below the bottom wall
  if ((Math.abs(x - dw.x) <= ts && y >= dw.y - ts * 0.75) || y >= (b.interior.y + b.interior.h) * ts) return { x: door.x, y: door.y, exit: true };
  // a tap lands on someone's body more often than on their feet: aim a little lower (like outdoors)
  const want = { x, y: y + 6 };
  const inRoom = (px: number, py: number) => px >= b.interior.x * ts && py >= b.interior.y * ts && px < (b.interior.x + b.interior.w) * ts && py < (b.interior.y + b.interior.h) * ts;
  const p = nearestFree(layout, want, 40, inRoom) ?? nearestFree(layout, { x, y }, 40, inRoom);
  return p ? { x: p.x, y: p.y, exit: false } : null;
}

/** A tap-to-go route inside the room (same A* + string pulling as outdoors). */
export function interiorRoute(layout: TownLayout, b: BuildingDef, from: Pt, to: Pt): Pt[] | null {
  return findPath(layout, from, to, `bld:${b.id}`);
}

/**
 * Space (CSS px) the "Inside …" panel takes at the bottom of the screen, for the camera fit. On touch
 * devices the joystick stays available inside and the panel sits beside it (game.css), so the
 * reserve covers the taller of the two.
 */
export function insideReserveCss(cssH: number, touch: boolean): number {
  if (cssH < 520) return touch ? 120 : 92;
  return touch ? 210 : 132;
}

/** True on a touch-first device (the GameScreen shows the joystick: `.ct-touch` on the game root). */
export function touchUi(): boolean {
  try {
    return !!document.querySelector('.ct-game.ct-touch') || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  } catch {
    return false;
  }
}

/**
 * Pushing into the doorway: the push must be HELD for EXIT_HOLD_MS (a brush / an overshooting tap
 * right after coming in does not throw you out again), then one leave attempt per push, retried
 * now and then while still held (a locked door explains itself again).
 */
export class ExitGate {
  private since = -Infinity;
  private last = -Infinity;
  /** Called every frame while pushing out: whether to try to leave now. */
  try(now: number): boolean {
    if (this.since === -Infinity) this.since = now;
    if (now - this.since < EXIT_HOLD_MS) return false;
    if (now - this.last < EXIT_RETRY_MS) return false;
    this.last = now;
    return true;
  }
  /** The push ended (keys released / moved away): the next push starts over. */
  reset(): void {
    this.since = -Infinity;
    this.last = -Infinity;
  }
}
