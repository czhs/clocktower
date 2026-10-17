// Renderer-free door rules (lock, in use, inward direction, auto-enter thresholds, door prompt), shared by
// the Phaser town and the v3 3D town. (v3 WP0: extracted from TownScene.ts; the inward rule gains the
// optional `doorNormal` of v3 layouts, §2.5. No behaviour change for v2 layouts, which have no doorNormal.)
import { tileCenterPx, type BuildingDef, type TownLayout } from '@ct/protocol';

/** Phases in which every door but your own is locked (and your own locks you in). */
export const LOCKED_PHASES: ReadonlySet<string> = new Set(['first_night', 'night', 'dawn']);
/** Within this distance of a door tile, pushing toward the door enters (px). */
export const DOOR_TRIGGER = 11;
/**
 * (v2.2.1, Isaac's doors.spec) A STRAIGHT push (within ~25° of the door's inward direction) also
 * enters from up to this far, so an approach 10 px off-centre still goes in; still inside the server's
 * DOOR_RANGE_PX (22). Diagonal walks past a doorway keep the tight DOOR_TRIGGER (no accidental entry).
 */
export const DOOR_TRIGGER_STRAIGHT = 20;
/** Doors swing open for you within this distance (px). */
export const DOOR_OPEN_RANGE = 34;
/** The door prompt shows within this distance of a door (px). */
export const DOOR_PROMPT_RANGE = 20;
/** A tap within this distance of a door's feet point means that door (px). */
export const DOOR_TAP_RANGE = 14;

export interface Vec {
  x: number;
  y: number;
}

/** A door as the rules see it: its building, the feet point on the outdoor door tile, the inward unit vector. */
export interface DoorSpot {
  b: BuildingDef;
  at: Vec;
  inward: Vec;
}

/** Unit vector pointing INTO the building: −doorNormal when the layout gives one (v3), else the v2 footprint rule. */
export function doorInward(b: BuildingDef): Vec {
  if (b.doorNormal) {
    const [nx, ny] = b.doorNormal;
    const l = Math.hypot(nx, ny) || 1;
    return { x: -nx / l || 0, y: -ny / l || 0 };
  }
  const f = b.footprint;
  return b.door.y >= f.y + f.h ? { x: 0, y: -1 } : b.door.x >= f.x + f.w ? { x: -1, y: 0 } : b.door.x < f.x ? { x: 1, y: 0 } : { x: 0, y: -1 };
}

/** Every building's door spot, in layout order. */
export function doorSpots(layout: TownLayout): DoorSpot[] {
  return layout.buildings.map((b) => ({ b, at: tileCenterPx(layout, b.door), inward: doorInward(b) }));
}

/** A cottage is "in use" when it has a resident (game running) — empty cottages stay boarded. */
export function houseInUse(game: { players: readonly { seat: number }[] } | null | undefined, b: BuildingDef): boolean {
  if (!game) return true; // waiting room: every cottage is a room
  return game.players.some((p) => p.seat === b.houseIndex);
}

export interface DoorRuleCtx {
  layout: TownLayout;
  amStoryteller: boolean;
  /** Current phase ('waiting' before a game). */
  phase: string;
  mySeat: number | null;
  /** Storyteller override for a building: true = locked, false = forced open, null/undefined = none. */
  override(buildingId: string): boolean | null | undefined;
}

/** Is this door locked for me? `exit` = leaving the building (inside), else entering. */
export function doorLocked(ctx: DoorRuleCtx, b: BuildingDef, exit: boolean): boolean {
  if (ctx.amStoryteller) return false;
  const o = ctx.override(b.id);
  if (o !== null && o !== undefined) return o;
  if (!LOCKED_PHASES.has(ctx.phase)) return false;
  const seat = ctx.mySeat;
  const home = seat === null ? null : ctx.layout.buildings.find((x) => x.houseIndex === seat)?.id;
  return exit ? b.id === home : b.id !== home;
}

/** Why the door is locked (prompt text). */
export function lockText(ctx: DoorRuleCtx, b: BuildingDef, exit: boolean): string {
  if (LOCKED_PHASES.has(ctx.phase) && ctx.override(b.id) == null) return exit ? 'You stay home until morning' : 'Locked for the night';
  return `${b.name} is locked by the Storyteller`;
}

/**
 * Walking into a doorway enters — only while pushing toward the door (brushing past does not).
 * Returns the first door the push (vx, vy) from `me` (outdoors) counts as entering, or null.
 */
export function autoEnterDoor<D extends DoorSpot>(me: Vec & { location: string }, vx: number, vy: number, doors: readonly D[]): D | null {
  if (me.location !== 'outdoors' || (vx === 0 && vy === 0)) return null;
  const len = Math.hypot(vx, vy);
  for (const d of doors) {
    const dist = Math.hypot(me.x - d.at.x, me.y - d.at.y);
    if (dist > DOOR_TRIGGER_STRAIGHT) continue;
    const toward = (vx * d.inward.x + vy * d.inward.y) / len;
    if (toward < (dist > DOOR_TRIGGER ? 0.9 : 0.6)) continue;
    return d;
  }
  return null;
}

export interface PromptCtx {
  amStoryteller: boolean;
  inUse(b: BuildingDef): boolean;
  locked(b: BuildingDef): boolean;
  lockText(b: BuildingDef): string;
  /** "Your home" / "Ada's home" / the building name. */
  title(b: BuildingDef): string;
}

/** The outdoor door prompt for `me` (null = none): the first door within DOOR_PROMPT_RANGE. */
export function doorPrompt(me: Vec, doors: readonly DoorSpot[], ctx: PromptCtx): { text: string; locked: boolean } | null {
  for (const d of doors) {
    if (Math.hypot(me.x - d.at.x, me.y - d.at.y) > DOOR_PROMPT_RANGE) continue;
    if (!ctx.inUse(d.b) && !ctx.amStoryteller) return { text: 'Nobody lives here', locked: true };
    if (ctx.locked(d.b)) return { text: ctx.lockText(d.b), locked: true };
    return { text: `Walk in: ${ctx.title(d.b)}`, locked: false };
  }
  return null;
}

/** What a tap at a world point (px) means: a cottage (its sprite rect or doorstep) or a spot on the ground. */
export function tapTarget(layout: TownLayout, doors: readonly DoorSpot[], x: number, y: number): { x: number; y: number; enter: string | null } {
  const TS = layout.tileSize;
  for (const d of doors) {
    const f = d.b.footprint;
    const inSprite = x >= f.x * TS && x < (f.x + f.w) * TS && y >= (f.y - 1) * TS && y < (f.y + f.h) * TS;
    if (inSprite || Math.hypot(x - d.at.x, y - d.at.y) < DOOR_TAP_RANGE) return { x: d.at.x, y: d.at.y, enter: d.b.id };
  }
  return { x, y, enter: null };
}
