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
}

export interface WorldTeleport {
  x: number;
  y: number;
  location: LocationId;
  reason: 'correction' | 'door' | 'bedtime' | 'night' | 'dawn' | 'spawn' | 'storyteller';
  /** Client must discard pending predicted moves with seq <= this. */
  seq: number;
}
