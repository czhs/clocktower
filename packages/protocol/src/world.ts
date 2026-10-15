import { z } from 'zod';

// ---------------------------------------------------------------------------------------
// Town layout contract. The concrete handcrafted layout is exported by @ct/assets
// (`import { townLayout } from '@ct/assets'`) and is shared by client (rendering),
// server (collision / access / visibility) and voice (acoustic zones).
// Interiors live in the same coordinate space, in an "interior area" outside townBounds;
// doors teleport between a building's exterior door tile and its interior door tile.

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface TilePoint {
  x: number;
  y: number;
}

export type BuildingKind = 'house' | 'tavern' | 'chapel' | 'clocktower' | 'shop';

export interface BuildingDef {
  id: string; // e.g. 'house-0' … 'house-14', 'tavern', 'chapel'
  kind: BuildingKind;
  name: string;
  /** 0..14 for player cottages, else null. Seat N lives in houseIndex N. */
  houseIndex: number | null;
  /** Exterior footprint in the town (tiles, blocked). */
  footprint: TileRect;
  /** Walkable tile directly outside the door; standing here + "use" enters. */
  door: TilePoint;
  /** Interior room region (tiles) in the interior area. */
  interior: TileRect;
  /** Walkable tile just inside the interior door; standing here + "use" exits. */
  interiorDoor: TilePoint;
  /** Houses: where the occupant is placed at night. */
  bed?: TilePoint;
  /** Houses: where the Storyteller stands during a night visit. */
  visitPoint?: TilePoint;
}

export interface TownLayout {
  version: number;
  widthTiles: number;
  heightTiles: number;
  tileSize: number;
  /** Outdoor town area in tiles; everything outside is interior area / void. */
  townBounds: TileRect;
  /** Town-square broadcast circle in PIXELS. */
  square: { cx: number; cy: number; r: number };
  buildings: BuildingDef[];
  /** Row-major, length widthTiles*heightTiles, 1 = blocked for movement. */
  collision: number[];
  playerSpawn: TilePoint;
  storytellerSpawn: TilePoint;
  streetlights: TilePoint[];
  /**
   * (additive, gameplay) Optional nomination-circle ring in PIXELS (feet positions). When absent
   * the ring is derived from `square` (circleCentre / circleRadii).
   */
  circle?: { cx: number; cy: number; rx: number; ry: number; startDeg?: number; sweepDeg?: number };
}

/** 'outdoors' or the id of the building whose interior contains the point. */
export type LocationId = 'outdoors' | `bld:${string}`;

export function tileIndex(layout: TownLayout, tx: number, ty: number): number {
  return ty * layout.widthTiles + tx;
}

export function isBlockedTile(layout: TownLayout, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= layout.widthTiles || ty >= layout.heightTiles) return true;
  return layout.collision[tileIndex(layout, tx, ty)] === 1;
}

/** Player body is treated as a small box at the feet (BODY_HALF_W x BODY_H px). */
export const BODY_HALF_W = 5;
export const BODY_H = 6;

export function isBlockedPx(layout: TownLayout, x: number, y: number): boolean {
  const ts = layout.tileSize;
  const pts: [number, number][] = [
    [x - BODY_HALF_W, y - BODY_H],
    [x + BODY_HALF_W, y - BODY_H],
    [x - BODY_HALF_W, y - 1],
    [x + BODY_HALF_W, y - 1],
  ];
  return pts.some(([px, py]) => isBlockedTile(layout, Math.floor(px / ts), Math.floor(py / ts)));
}

function inRect(r: TileRect, tx: number, ty: number): boolean {
  return tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h;
}

export function locationAt(layout: TownLayout, x: number, y: number): LocationId {
  const tx = Math.floor(x / layout.tileSize);
  const ty = Math.floor(y / layout.tileSize);
  for (const b of layout.buildings) if (inRect(b.interior, tx, ty)) return `bld:${b.id}`;
  return 'outdoors';
}

export function inSquare(layout: TownLayout, x: number, y: number): boolean {
  const dx = x - layout.square.cx;
  const dy = y - layout.square.cy;
  return dx * dx + dy * dy <= layout.square.r * layout.square.r;
}

export function tileCenterPx(layout: TownLayout, p: TilePoint): { x: number; y: number } {
  // Positions are feet positions: horizontally centred, near the bottom of the tile.
  return { x: p.x * layout.tileSize + layout.tileSize / 2, y: p.y * layout.tileSize + layout.tileSize - 2 };
}

// ---------------------------------------------------------------------------------------
// Movement messages. Client predicts locally and sends its position; the server validates
// speed / collision / access and answers with 'world:teleport' when it disagrees.

export const FACINGS = ['down', 'up', 'left', 'right'] as const;
export type Facing = (typeof FACINGS)[number];

export const MoveMsg = z.object({
  seq: z.number().int().nonnegative(),
  x: z.number().finite(),
  y: z.number().finite(),
  facing: z.enum(FACINGS),
  moving: z.boolean(),
});
export type MoveMsg = z.infer<typeof MoveMsg>;

/** "Use" key near a door: enter/exit that building. */
export const UseDoorMsg = z.object({ buildingId: z.string().min(1).max(32) });
export type UseDoorMsg = z.infer<typeof UseDoorMsg>;

/** Compact per-entity state. Only entities the viewer may currently see are included. */
export interface EntityState {
  /** pid (players) or the storyteller's pid. */
  id: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  location: LocationId;
}

export interface WorldSnapshot {
  t: number;
  /** Last move seq the server applied for this client. */
  ackSeq: number;
  entities: EntityState[];
  /**
   * (additive, gameplay) Present only while the VIEWER's own avatar is not under their control:
   * 'auto' = the server walks them (bedtime escort / Storyteller "walk to"), 'frozen' = the
   * Storyteller froze them. The client stops predicting/sending moves and shows its own entity at
   * the server position. `path` = remaining waypoints (feet px) in the current location.
   */
  you?: SelfControl;
  /** (additive, gameplay) Storyteller door overrides: buildingId -> true (locked) / false (forced open). Public. */
  doors?: Record<string, boolean>;  /**
   * (additive, gameplay) Door tags: who is inside each building, hung on its door. Public, the same
   * for every viewer, daytime only (waiting / setup / day): absent from bedtime through dawn and
   * when the Storyteller turned them off. Never includes the Storyteller. `ghost` = publicly dead.
   */
  doorTags?: Record<string, DoorTag[]>;
}

export interface DoorTag {
  pid: string;
  ghost: boolean;
}

export interface SelfControl {
  mode: 'auto' | 'frozen';
  path?: { x: number; y: number }[];
  /** Where an 'auto' walk ends: 'home' (bed), 'seat' (circle spot), or a free point. */
  goal?: 'home' | 'seat' | 'square' | 'point' | 'building';
}

export interface WorldTeleport {
  x: number;
  y: number;
  location: LocationId;
  reason: 'correction' | 'door' | 'bedtime' | 'night' | 'dawn' | 'spawn' | 'storyteller';
  /** Client must discard pending predicted moves with seq <= this. */
  seq: number;
}

// ---------------------------------------------------------------------------------------
// (additive, gameplay 2026-10-15) The nomination circle. One spot per seat on a ring around the
// clock tower, seat order clockwise from 12 o'clock (= the clockwise vote order). Computed
// identically by the server (Storyteller "force seats", presence) and the client (markers,
// clock hand), from the layout and the list of seats only.

export interface CircleSpot {
  seat: number;
  /** Feet position (px), outdoors and walkable. */
  x: number;
  y: number;
  /** Facing toward the clock tower. */
  facing: Facing;
}

/** (additive, gameplay) A seat's home: the house whose houseIndex is the seat (layout-driven, no id convention). */
export function homeBuilding(layout: TownLayout, seat: number | null | undefined): BuildingDef | undefined {
  if (seat === null || seat === undefined) return undefined;
  return layout.buildings.find((b) => b.kind === 'house' && b.houseIndex === seat);
}

/** (additive, gameplay) The seat living in a building (a house with a houseIndex), else null. */
export function seatOfBuilding(layout: TownLayout, buildingId: string): number | null {
  const b = layout.buildings.find((x) => x.id === buildingId);
  return b && b.kind === 'house' && b.houseIndex !== null ? b.houseIndex : null;
}

/** The public gathering ring belongs to the square, independently of the tower landmark. */
export function circleCentre(layout: TownLayout): { x: number; y: number } {
  if (layout.circle) return { x: layout.circle.cx, y: layout.circle.cy };
  return { x: layout.square.cx, y: layout.square.cy - layout.tileSize };
}

/** Ring radii stay tied to public paving, never to a movable landmark's footprint. */
export function circleRadii(layout: TownLayout): { rx: number; ry: number } {
  if (layout.circle) return { rx: layout.circle.rx, ry: layout.circle.ry };
  const ts = layout.tileSize;
  return { rx: 6.5 * ts, ry: 5.75 * ts };
}

/** Seat spots, clockwise from 12 o'clock by ascending seat number. Deterministic. */
export function circleSpots(layout: TownLayout, seats: readonly number[]): CircleSpot[] {
  const sorted = [...new Set(seats)].sort((a, b) => a - b);
  const c = circleCentre(layout);
  const { rx, ry } = circleRadii(layout);
  const n = sorted.length;
  const deg = Math.PI / 180;
  const start = layout.circle?.startDeg !== undefined ? layout.circle.startDeg * deg : Math.PI / 4;
  const sweep = layout.circle?.sweepDeg !== undefined ? layout.circle.sweepDeg * deg : (3 * Math.PI) / 2;
  const arc = { start, sweep, full: sweep >= 2 * Math.PI - 1e-6 };
  const out: CircleSpot[] = [];
  const taken: { x: number; y: number }[] = [];
  const free = (x: number, y: number) =>
    !isBlockedPx(layout, x, y) && locationAt(layout, x, y) === 'outdoors' && taken.every((t) => Math.hypot(t.x - x, t.y - y) >= 12);
  sorted.forEach((seat, i) => {
    // Default: an open north arc leaves a landmark behind the gathering. A layout may instead give
    // the arc (v2 square: a full ring around the fountain). Vote order always runs clockwise.
    const th = arc.full ? arc.start + (arc.sweep * i) / Math.max(1, n) : arc.start + (arc.sweep * i) / Math.max(1, n - 1);
    const ix = Math.round(c.x + Math.sin(th) * rx);
    const iy = Math.round(c.y - Math.cos(th) * ry);
    let best = { x: ix, y: iy };
    search: for (let r = 0; r <= 40; r += 2) {
      const steps = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 2));
      for (let k = 0; k < steps; k++) {
        const a = (2 * Math.PI * k) / steps;
        const x = Math.round(ix + Math.cos(a) * r);
        const y = Math.round(iy + Math.sin(a) * r);
        if (free(x, y)) {
          best = { x, y };
          break search;
        }
      }
    }
    taken.push(best);
    // Face the middle of the ring (where the Storyteller stands).
    const fx = c.x - best.x;
    const fy = c.y - best.y;
    const facing: Facing = layout.circle?.startDeg === undefined ? 'down' : Math.abs(fx) > Math.abs(fy) * 1.5 ? (fx < 0 ? 'left' : 'right') : fy < 0 ? 'up' : 'down';
    out.push({ seat, x: best.x, y: best.y, facing });
  });
  return out;
}

/** Distance (px) within which a player counts as "seated" on their spot. */
export const CIRCLE_SEATED_PX = 12;
