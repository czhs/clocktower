import type { BuildingDef, BuildingKind, TilePoint, TileRect, TownLayout } from '@ct/protocol';

// =========================================================================================
// HANDCRAFTED TOWN — "Hollowmere" (v2: the whole town is ONE SCREEN)
//
// One 107x37 tile grid (16 px tiles). The outdoor town occupies x 0..44 (townBounds); building
// interiors live in the interior area at x >= 47 in the same coordinate space. Everything here
// is hand-placed data: the ground is painted with explicit strokes (roads, lanes, alleys, the
// square, river, cliffs, pond, gardens), and every building / tree / lamp / prop has explicit
// coordinates. Small decorative jitter (forest edge trees) uses a fixed integer hash so the
// result is fully deterministic.
//
// Exports:
//   townLayout  – the protocol TownLayout contract (collision, buildings, doors, square…)
//   townMap     – the richer render data (ground codes, objects, building styles, lights)
//   PROP_DEFS   – sprite size + collision of every object kind (shared with the PNG generator)
// =========================================================================================

export const TS = 16;
export const TOWN_W = 45;
export const TOWN_H = 37;
/** Town (one screen) + the off-screen interiors band to its right (15 rooms, 5 x 3). */
export const MAP_W = TOWN_W + 2 + 5 * 12;
export const MAP_H = TOWN_H;

/** Ground codes (one char per tile). */
export const G = {
  void: ' ',
  grass: '.',
  forest: ',', // walkable forest floor
  dense: 'T', // impassable dense forest / high ground
  dirt: ':',
  cobble: '=',
  plaza: 'o',
  ring: 'O',
  water: '~',
  sand: 's',
  soil: '#',
  cliff: '^',
  bridge: 'b',
  hedge: 'h',
  wall: 'w',
  gravel: 'g',
  floorWood: 'f',
  floorStone: 'F',
  iwall: 'W',
  doorway: 'D',
} as const;
export type GroundCode = (typeof G)[keyof typeof G];
export const BLOCKING_GROUND: ReadonlySet<string> = new Set([' ', 'T', '~', '^', 'h', 'w', 'W', 'D']);

// -----------------------------------------------------------------------------------------
// Object kinds. Sprites are anchored at the bottom-left of their anchor tile (x, y): the sprite
// is drawn with its bottom edge at (y+1)*16 and its left edge at x*16, extending up/right.
// `col` is the blocked rect relative to the anchor tile (dy <= 0 goes upward).

export interface PropDef {
  /** Sprite size in px. */
  w: number;
  h: number;
  col: TileRect | null;
  /** Drawn under characters (rugs, flat decorations). */
  flat?: boolean;
  /** Light source relative to the sprite's bottom-left corner, in px. */
  light?: { dx: number; dy: number; r: number; color: 'warm' | 'cool' | 'fire' | 'holy' };
}

const one: TileRect = { x: 0, y: 0, w: 1, h: 1 };
export const PROP_DEFS: Record<string, PropDef> = {
  // nature
  oak: { w: 48, h: 64, col: { x: 1, y: 0, w: 1, h: 1 } },
  oak2: { w: 48, h: 56, col: { x: 1, y: 0, w: 1, h: 1 } },
  pine: { w: 32, h: 64, col: { x: 0, y: 0, w: 2, h: 1 } },
  pinetall: { w: 32, h: 80, col: { x: 0, y: 0, w: 2, h: 1 } },
  deadtree: { w: 48, h: 64, col: { x: 1, y: 0, w: 1, h: 1 } },
  willow: { w: 64, h: 64, col: { x: 1, y: 0, w: 2, h: 1 } },
  fruittree: { w: 32, h: 48, col: { x: 0, y: 0, w: 1, h: 1 } },
  bush: { w: 16, h: 16, col: one },
  bushberry: { w: 16, h: 16, col: one },
  rock: { w: 16, h: 16, col: one },
  bigrock: { w: 32, h: 32, col: { x: 0, y: 0, w: 2, h: 1 } },
  stump: { w: 16, h: 16, col: one },
  reeds: { w: 16, h: 16, col: null },
  waterfall: { w: 64, h: 64, col: null },
  // town furniture
  lamp: { w: 16, h: 48, col: one, light: { dx: 8, dy: -40, r: 72, color: 'warm' } },
  well: { w: 32, h: 40, col: { x: 0, y: -1, w: 2, h: 2 } },
  fountain: { w: 48, h: 40, col: { x: 0, y: -1, w: 3, h: 2 } },
  stall_red: { w: 48, h: 48, col: { x: 0, y: -1, w: 3, h: 2 } },
  stall_green: { w: 48, h: 48, col: { x: 0, y: -1, w: 3, h: 2 } },
  stall_blue: { w: 48, h: 48, col: { x: 0, y: -1, w: 3, h: 2 } },
  stall_gold: { w: 48, h: 48, col: { x: 0, y: -1, w: 3, h: 2 } },
  bench: { w: 32, h: 24, col: { x: 0, y: 0, w: 2, h: 1 } },
  barrel: { w: 16, h: 24, col: one },
  crates: { w: 32, h: 32, col: { x: 0, y: 0, w: 2, h: 1 } },
  cart: { w: 48, h: 32, col: { x: 0, y: 0, w: 3, h: 1 } },
  haystack: { w: 32, h: 32, col: { x: 0, y: 0, w: 2, h: 1 } },
  signpost: { w: 16, h: 32, col: one },
  noticeboard: { w: 32, h: 32, col: { x: 0, y: 0, w: 2, h: 1 } },
  scarecrow: { w: 32, h: 48, col: { x: 0, y: 0, w: 1, h: 1 } },
  grave1: { w: 16, h: 24, col: one },
  grave2: { w: 16, h: 24, col: one },
  grave3: { w: 16, h: 32, col: one },
  crypt: { w: 64, h: 72, col: { x: 0, y: -2, w: 4, h: 3 } },
  angel: { w: 32, h: 48, col: { x: 0, y: 0, w: 2, h: 1 } },
  gatepost: { w: 16, h: 48, col: one, light: { dx: 8, dy: -42, r: 56, color: 'warm' } },
  anvil: { w: 32, h: 24, col: { x: 0, y: 0, w: 2, h: 1 } },
  shed: { w: 64, h: 64, col: { x: 0, y: -2, w: 4, h: 3 } },
  windmill: { w: 96, h: 160, col: { x: 1, y: -3, w: 4, h: 4 } },
  pumpkins: { w: 16, h: 16, col: null, flat: true },
  // fences / iron rails (single tiles with auto-connected frames: <kind>_<mask>)
  fence: { w: 16, h: 24, col: one },
  iron: { w: 16, h: 24, col: one },
  // interior furniture
  bed: { w: 16, h: 32, col: { x: 0, y: -1, w: 1, h: 2 } },
  bedwide: { w: 32, h: 32, col: { x: 0, y: -1, w: 2, h: 2 } },
  nightstand: { w: 16, h: 24, col: one, light: { dx: 8, dy: -18, r: 40, color: 'fire' } },
  table: { w: 32, h: 24, col: { x: 0, y: 0, w: 2, h: 1 } },
  roundtable: { w: 32, h: 24, col: { x: 0, y: 0, w: 2, h: 1 } },
  chair: { w: 16, h: 24, col: one },
  stool: { w: 16, h: 16, col: one },
  wardrobe: { w: 32, h: 40, col: { x: 0, y: 0, w: 2, h: 1 } },
  bookshelf: { w: 32, h: 40, col: { x: 0, y: 0, w: 2, h: 1 } },
  chest: { w: 16, h: 16, col: one },
  fireplace: { w: 32, h: 32, col: null, light: { dx: 16, dy: -8, r: 88, color: 'fire' } },
  wallshelf: { w: 32, h: 16, col: null },
  window: { w: 16, h: 16, col: null, light: { dx: 8, dy: -8, r: 36, color: 'cool' } },
  stainedglass: { w: 16, h: 32, col: null, light: { dx: 8, dy: -12, r: 48, color: 'holy' } },
  plant: { w: 16, h: 24, col: one },
  loom: { w: 32, h: 32, col: { x: 0, y: 0, w: 2, h: 1 } },
  rug_red: { w: 64, h: 48, col: null, flat: true },
  rug_blue: { w: 64, h: 48, col: null, flat: true },
  rug_green: { w: 64, h: 48, col: null, flat: true },
  rug_long: { w: 16, h: 128, col: null, flat: true },
  bar: { w: 96, h: 32, col: { x: 0, y: 0, w: 6, h: 1 } },
  kegs: { w: 48, h: 32, col: { x: 0, y: 0, w: 3, h: 1 } },
  pew: { w: 64, h: 24, col: { x: 0, y: 0, w: 4, h: 1 } },
  altar: { w: 48, h: 32, col: { x: 0, y: 0, w: 3, h: 1 } },
  candelabra: { w: 16, h: 32, col: one, light: { dx: 8, dy: -28, r: 56, color: 'fire' } },
  gears: { w: 48, h: 48, col: { x: 0, y: 0, w: 3, h: 1 } },
  bellrope: { w: 16, h: 48, col: null },
  ladder: { w: 16, h: 32, col: null },
  counter: { w: 64, h: 32, col: { x: 0, y: 0, w: 4, h: 1 } },
  shopshelf: { w: 48, h: 40, col: { x: 0, y: 0, w: 3, h: 1 } },
  sacks: { w: 32, h: 24, col: { x: 0, y: 0, w: 2, h: 1 } },
  doormat: { w: 16, h: 16, col: null, flat: true },
};

export interface MapObject {
  kind: string;
  x: number;
  y: number;
  /** Frame override (buildings use their id; fences use auto-connected frames). */
  frame?: string;
  flip?: boolean;
}

export type RoofKind = 'slate' | 'red' | 'moss' | 'thatch' | 'blue' | 'plum';
export type WallKind = 'timber' | 'stone' | 'plaster' | 'brick' | 'planks';
export interface BuildingStyle {
  roof: RoofKind;
  wall: WallKind;
  /** 'side' = ridge parallel to street; 'cross' = side roof plus a front gable over the door. */
  roofType: 'side' | 'cross';
  chimney: 'left' | 'right' | 'none';
  /** Extra decoration flags for distinctness. */
  flowers: boolean;
  lantern: boolean;
  shutters: string; // hex colour of shutters/door paint
  /** Interior palette index (floor + wallpaper). */
  interior: number;
  /** Which wall the door is in: 'south' faces the camera; 'east'/'west' = gable end to the camera, door in the side wall. */
  facing: 'south' | 'east' | 'west';
}

export interface LightDef {
  x: number; // px
  y: number; // px
  r: number;
  color: 'warm' | 'cool' | 'fire' | 'holy';
  /** Building whose interior this light belongs to (null = outdoors). */
  building: string | null;
  /** Window lights on building facades only glow at night. */
  facade?: boolean;
}

export interface TownMap {
  width: number;
  height: number;
  tileSize: number;
  /** Rows of ground codes, length height, each length width. */
  ground: string[];
  objects: MapObject[];
  styles: Record<string, BuildingStyle>;
  lights: LightDef[];
  /** Decorative flat decals placed by design (flowers, crops, cracks…): tile -> decal name. */
  decals: { x: number; y: number; name: string }[];
  /** Decorative buildings (clock tower): drawn and solid, never enterable, not in TownLayout. */
  landmarks: BuildingDef[];
  /** The paved square ellipse (px). */
  plaza: { cx: number; cy: number; rx: number; ry: number };
}

// =========================================================================================
// Painter
// =========================================================================================

const ground: string[][] = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => ' '));
const objects: MapObject[] = [];
const decals: { x: number; y: number; name: string }[] = [];
const extraBlocked: TilePoint[] = [];

function inMap(x: number, y: number) {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}
function put(x: number, y: number, c: string) {
  if (inMap(x, y)) ground[y]![x] = c;
}
function get(x: number, y: number): string {
  return inMap(x, y) ? ground[y]![x]! : ' ';
}
function rect(x: number, y: number, w: number, h: number, c: string) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(i, j, c);
}
function frame(x: number, y: number, w: number, h: number, c: string) {
  for (let i = x; i < x + w; i++) {
    put(i, y, c);
    put(i, y + h - 1, c);
  }
  for (let j = y; j < y + h; j++) {
    put(x, j, c);
    put(x + w - 1, j, c);
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: string, only?: (cur: string) => boolean) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1 && (!only || only(get(x, y)))) put(x, y, c);
    }
}
/** Replace c only where the current tile is soft ground (grass / forest floor). */
const soft = (cur: string) => cur === '.' || cur === ',';
function obj(kind: string, x: number, y: number, extra: Partial<MapObject> = {}) {
  if (!PROP_DEFS[kind]) throw new Error(`unknown prop ${kind}`);
  objects.push({ kind, x, y, ...extra });
}
function decal(x: number, y: number, name: string) {
  decals.push({ x, y, name });
}
/** Fixed integer hash (deterministic decorative jitter). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// =========================================================================================
// 1. Ground: one screen, Town-of-Salem style. The clock tower stands at the top of an oval ring
//    of 15 cottages around a cobbled square; the voting circle is in the middle. Cottages face
//    the square: the top arc faces the camera (door at the bottom), the sides and the lower ring
//    face inward (door in the visible side wall). Every door sits on a lane back to the square.
// =========================================================================================

/** Paved square (px): a true circle (the camera looks straight down); the inner stone ring marks the voting circle. */
export const PLAZA = { cx: 22.5 * TS, cy: 19.5 * TS, rx: 9 * TS, ry: 9 * TS };
/** Voting circle (px): a full ring around the middle of the square (Storyteller in the centre). */
export const CIRCLE = { cx: 22.5 * TS, cy: 19.75 * TS, rx: 6.25 * TS, ry: 6.25 * TS };

rect(0, 0, TOWN_W, TOWN_H, G.grass);
for (let x = 0; x < TOWN_W; x++) {
  put(x, 0, G.dense);
  put(x, TOWN_H - 1, G.dense);
}
for (let y = 0; y < TOWN_H; y++) {
  put(0, y, G.dense);
  put(TOWN_W - 1, y, G.dense);
}
for (let x = 1; x < TOWN_W - 1; x++) if (hash2(x, 1) < 0.55 && (x < 21 || x > 29)) put(x, 1, G.forest);

// Lanes to every door (see the cottage table below) and the bottom lane behind the lower ring.
// Painted before the square, which then covers their inner ends.
rect(4, 9, TOWN_W - 8, 1, G.cobble); // top lane (top arc doors + the tower)
rect(5, 13, 12, 1, G.cobble); // upper-left corner door
rect(TOWN_W - 17, 13, 12, 1, G.cobble); // upper-right corner door
for (const y of [18, 24]) {
  rect(5, y, 11, 1, G.cobble); // left side doors
  rect(TOWN_W - 16, y, 11, 1, G.cobble); // right side doors
}
// paths through the lower ring down to the bottom lane
rect(8, 24, 3, 11, G.cobble);
rect(TOWN_W - 11, 24, 3, 11, G.cobble);
rect(15, 24, 4, 11, G.cobble);
rect(TOWN_W - 19, 24, 4, 11, G.cobble);
rect(2, 34, TOWN_W - 4, 2, G.dirt);
// The square.
for (let y = 0; y < TOWN_H; y++)
  for (let x = 0; x < TOWN_W; x++) {
    const nd = Math.hypot((x * TS + TS / 2 - PLAZA.cx) / PLAZA.rx, (y * TS + TS / 2 - PLAZA.cy) / PLAZA.ry);
    if (nd <= 1) put(x, y, nd > 0.9 ? G.ring : G.plaza);
  }
// lanes run through the stone ring so the entrances read clearly
for (let y = 0; y < TOWN_H; y++)
  for (let x = 0; x < TOWN_W; x++) {
    if (get(x, y) !== G.ring) continue;
    const lane = y === 13 || y === 18 || y === 24 || (y > 24 && ((x >= 15 && x <= 18) || (x >= TOWN_W - 19 && x <= TOWN_W - 16)));
    if (lane) put(x, y, G.cobble);
  }

// =========================================================================================
// 2. Buildings: 15 cottages (each one seat's home and anyone's private room by day) and the
//    clock tower landmark (not enterable).
// =========================================================================================

const buildings: BuildingDef[] = [];
const styles: Record<string, BuildingStyle> = {};
const lights: LightDef[] = [];
/** Decorative buildings with no door logic (drawn like buildings, collide, never enterable). */
const landmarks: BuildingDef[] = [];

function S(
  roof: RoofKind,
  wall: WallKind,
  roofType: 'side' | 'cross',
  chimney: 'left' | 'right' | 'none',
  shutters: string,
  flowers: boolean,
  lantern: boolean,
  interior: number,
): BuildingStyle {
  return { roof, wall, roofType, chimney, shutters, flowers, lantern, interior, facing: 'south' };
}

const houseRoom = (i: number): TileRect => ({ x: TOWN_W + 2 + (i % 5) * 12, y: 1 + Math.floor(i / 5) * 11, w: 11, h: 9 });

const HOUSE_NAMES = [
  'Stargazer’s Tower',
  'Wychwood Cottage',
  'The Weaver’s House',
  'Ravenscroft',
  'Mossbank Cottage',
  'Elderhollow Apothecary',
  'The Lantern-maker’s',
  'Toadstool Hollow',
  'Hearthstone Cabin',
  'Gloamend Clockworks',
  'The Old Boot',
  'Fernlea Oak',
  'Rookery House',
  'Riverbend Boathouse',
  'Millrace Mill',
];

/**
 * Clockwise from the top-left, so seat neighbours are next-door neighbours. `facing` = the side
 * the door is on: 'south' (5x4 footprint, door tile below the footprint at x+2), 'east' / 'west'
 * (4x5 footprint, gable end towards the camera, door in the visible side wall: door tile beside
 * the footprint's bottom row).
 */
type Facing3 = 'south' | 'east' | 'west';
const R = TOWN_W - 1; // mirror helper: x' = R - x - w + 1
const houseSpecs: { x: number; y: number; facing: Facing3; style: BuildingStyle }[] = [
  { x: 8, y: 5, facing: 'south', style: S('slate', 'timber', 'cross', 'right', '#6b2f2f', true, false, 0) },
  { x: 14, y: 5, facing: 'south', style: S('thatch', 'plaster', 'side', 'left', '#3f5a3a', false, true, 1) },
  { x: R - 14 - 4, y: 5, facing: 'south', style: S('red', 'brick', 'side', 'right', '#2f3f63', true, false, 2) },
  { x: R - 8 - 4, y: 5, facing: 'south', style: S('plum', 'stone', 'cross', 'left', '#7a5a2a', false, true, 3) },
  { x: R - 3 - 4, y: 9, facing: 'south', style: S('moss', 'planks', 'side', 'right', '#5b2f4f', true, false, 4) },
  { x: R - 1 - 3, y: 14, facing: 'west', style: S('blue', 'plaster', 'cross', 'right', '#7a3a1e', true, true, 5) },
  { x: R - 1 - 3, y: 20, facing: 'west', style: S('red', 'timber', 'side', 'left', '#2f4f4f', false, true, 6) },
  { x: R - 4 - 3, y: 27, facing: 'west', style: S('slate', 'brick', 'cross', 'none', '#6b5a2f', true, false, 7) },
  { x: R - 11 - 3, y: 29, facing: 'west', style: S('thatch', 'timber', 'side', 'right', '#4a2f6b', true, false, 8) },
  { x: 20, y: 30, facing: 'south', style: S('moss', 'stone', 'side', 'left', '#6b2f2f', false, true, 9) },
  { x: 11, y: 29, facing: 'east', style: S('plum', 'plaster', 'cross', 'right', '#2f5a6b', true, true, 10) },
  { x: 4, y: 27, facing: 'east', style: S('blue', 'planks', 'side', 'right', '#7a3a1e', true, false, 11) },
  { x: 1, y: 20, facing: 'east', style: S('red', 'stone', 'cross', 'left', '#3f5a3a', false, true, 12) },
  { x: 1, y: 14, facing: 'east', style: S('slate', 'planks', 'side', 'left', '#5b2f4f', true, true, 13) },
  { x: 3, y: 9, facing: 'south', style: S('thatch', 'brick', 'cross', 'right', '#2f3f63', false, false, 14) },
];

function footprintOf(h: { x: number; y: number; facing: Facing3 }): TileRect {
  return h.facing === 'south' ? { x: h.x, y: h.y, w: 5, h: 4 } : { x: h.x, y: h.y, w: 4, h: 5 };
}
function doorOf(h: { facing: Facing3 }, fp: TileRect): TilePoint {
  if (h.facing === 'south') return { x: fp.x + 2, y: fp.y + fp.h };
  return { x: h.facing === 'east' ? fp.x + fp.w : fp.x - 1, y: fp.y + fp.h - 1 };
}

// --- Interiors (small walkable pixel rooms, v2.2): walls ('W'), the doorway gap in the bottom wall
// ('D', blocked: walking down into it leaves) and furniture collide; the rest of the floor is walkable.
// Spawn = interiorDoor (just above the doorway); bed / visitPoint are free floor tiles beside the bed.

function paintRoom(r: TileRect, floor: string) {
  rect(r.x, r.y, r.w, r.h, G.iwall);
  rect(r.x + 1, r.y + 2, r.w - 2, r.h - 3, floor);
  put(r.x + Math.floor(r.w / 2), r.y + r.h - 1, G.doorway);
}

/** Furniture placement helper relative to the room, mirrored for variety. */
function furnisher(r: TileRect, mirror: boolean) {
  return (kind: string, dx: number, dy: number, extra: Partial<MapObject> = {}) => {
    const wTiles = Math.max(1, Math.round(PROP_DEFS[kind]!.w / TS));
    const x = mirror ? r.x + r.w - 1 - dx - (wTiles - 1) : r.x + dx;
    obj(kind, x, r.y + dy, extra);
  };
}

function furnishHouse(r: TileRect, i: number): { bed: TilePoint; visitPoint: TilePoint } {
  const mirror = (i & 1) === 1;
  const f = furnisher(r, mirror);
  const mx = (dx: number) => (mirror ? r.x + r.w - 1 - dx : r.x + dx);
  f('fireplace', 5, 1);
  f('window', 2, 1);
  f('window', 7, 1);
  f(i % 3 === 0 ? 'wallshelf' : 'window', 3, 1);
  if (i % 4 === 2) f('bedwide', 1, 3);
  else f('bed', 1, 3, { frame: `bed_${i % 5}` });
  f('nightstand', i % 4 === 2 ? 3 : 2, 2);
  f(['rug_red', 'rug_blue', 'rug_green'][i % 3]!, 4, 6);
  f(i % 2 === 0 ? 'table' : 'roundtable', 5, 4);
  f('chair', 4, 4);
  f('chair', 7, 4);
  f(i % 3 === 1 ? 'bookshelf' : i % 3 === 2 ? 'loom' : 'wardrobe', 8, 2);
  f('chest', 9, 6);
  f('plant', 1, 7);
  if (i % 2 === 0) f('barrel', 2, 7);
  f('doormat', Math.floor(r.w / 2), 7);
  const bedCol = i % 4 === 2 ? 3 : 2;
  return { bed: { x: mx(bedCol), y: r.y + 3 }, visitPoint: { x: mx(bedCol + 1), y: r.y + 3 } };
}

houseSpecs.forEach((h, i) => {
  const id = `house-${i}`;
  const r = houseRoom(i);
  paintRoom(r, G.floorWood);
  const extra = furnishHouse(r, i);
  const fp = footprintOf(h);
  const door = doorOf(h, fp);
  objects.push({ kind: 'building', x: fp.x, y: fp.y + fp.h - 1, frame: id });
  buildings.push({
    id,
    kind: 'house',
    name: HOUSE_NAMES[i]!,
    houseIndex: i,
    footprint: fp,
    door,
    interior: r,
    interiorDoor: { x: r.x + Math.floor(r.w / 2), y: r.y + r.h - 2 },
    ...extra,
  });
  styles[id] = { ...h.style, facing: h.facing };
  // a doormat on every doorstep: the door is the obvious way in
  obj('doormat', door.x, door.y);
});

// The clock tower at the top of the ring (landmark only; its top touches the map's top edge).
{
  const fp = { x: 20, y: 5, w: 5, h: 4 };
  objects.push({ kind: 'building', x: fp.x, y: fp.y + fp.h - 1, frame: 'clocktower' });
  landmarks.push({
    id: 'clocktower',
    kind: 'clocktower',
    name: 'The Clocktower',
    houseIndex: null,
    footprint: fp,
    door: { x: 22, y: fp.y + fp.h },
    interior: { x: 0, y: 0, w: 0, h: 0 },
    interiorDoor: { x: 0, y: 0 },
  });
  styles.clocktower = S('slate', 'stone', 'side', 'none', '#3a2a1e', false, true, 22);
}

// =========================================================================================
// 3. Dressing: kept to the edges so the square stays open for 15 people and the circle.
// =========================================================================================

for (let x = 1; x < TOWN_W - 1; x += 2) if (x < 18 || x > 26) obj(hash2(x, 2, 7) < 0.5 ? 'pinetall' : 'pine', x, 2);
obj('pine', 1, 7);
obj('pine', TOWN_W - 3, 7);
obj('oak', 0, 32);
obj('oak2', TOWN_W - 4, 32);
// a little market and a place to sit on each side of the square
obj('stall_red', 9, 16);
obj('stall_gold', TOWN_W - 12, 16);
obj('barrel', 12, 16);
obj('crates', TOWN_W - 14, 16);
obj('bench', 9, 21);
obj('bench', TOWN_W - 11, 21);
// the fountain (ambient water sound) between the market stall and the upper-right cottage
obj('fountain', TOWN_W - 12, 12);
// beside the cottages
obj('bush', 19, 8);
obj('bush', 2, 26);
obj('bushberry', TOWN_W - 3, 26);
obj('barrel', 19, 33);
obj('bush', 25, 33);
obj('stump', TOWN_W - 6, 33);

const streetlights: TilePoint[] = [
  { x: 13, y: 10 },
  { x: TOWN_W - 14, y: 10 },
  { x: 7, y: 21 },
  { x: TOWN_W - 8, y: 21 },
  { x: 12, y: 27 },
  { x: TOWN_W - 13, y: 27 },
  { x: 3, y: 33 },
  { x: TOWN_W - 4, y: 33 },
];
for (const p of streetlights) obj('lamp', p.x, p.y);

// Grass decals (flowers / tufts).
for (let y = 2; y < TOWN_H - 1; y++)
  for (let x = 1; x < TOWN_W - 1; x++) {
    if (get(x, y) !== G.grass) continue;
    const h = hash2(x, y, 11);
    if (h < 0.08) decal(x, y, 'tuft');
    else if (h < 0.1) decal(x, y, 'tuft2');
    else if (h < 0.125) decal(x, y, ['flowers_red', 'flowers_violet', 'flowers_white', 'flowers_yellow'][Math.floor(hash2(x, y, 12) * 4)]!);
    else if (h < 0.13) decal(x, y, 'mushrooms');
  }
for (let y = 2; y < TOWN_H - 1; y++)
  for (let x = 1; x < TOWN_W - 1; x++) {
    const c = get(x, y);
    if (c === G.cobble && hash2(x, y, 13) < 0.05) decal(x, y, 'crack');
    if (c === G.forest && hash2(x, y, 14) < 0.12) decal(x, y, 'leaves');
    if (c === G.dirt && hash2(x, y, 15) < 0.07) decal(x, y, 'pebbles');
  }

// =========================================================================================
// 6. Collision + export
// =========================================================================================

function buildCollision(): number[] {
  const col = new Array<number>(MAP_W * MAP_H).fill(0);
  const block = (x: number, y: number) => {
    if (inMap(x, y)) col[y * MAP_W + x] = 1;
  };
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (BLOCKING_GROUND.has(get(x, y))) block(x, y);
  // the map border is always solid
  for (let x = 0; x < TOWN_W; x++) {
    block(x, 0);
    block(x, TOWN_H - 1);
  }
  for (let y = 0; y < TOWN_H; y++) {
    block(0, y);
    block(TOWN_W - 1, y);
  }
  for (const b of [...buildings, ...landmarks]) for (let y = b.footprint.y; y < b.footprint.y + b.footprint.h; y++) for (let x = b.footprint.x; x < b.footprint.x + b.footprint.w; x++) block(x, y);
  for (const o of objects) {
    if (o.kind === 'building') continue;
    const d = PROP_DEFS[o.kind]!;
    if (!d.col) continue;
    for (let j = 0; j < d.col.h; j++) for (let i = 0; i < d.col.w; i++) block(o.x + d.col.x + i, o.y + d.col.y + j);
  }
  for (const p of extraBlocked) block(p.x, p.y);
  return col;
}

// Lights from props.
for (const o of objects) {
  if (o.kind === 'building') continue;
  const d = PROP_DEFS[o.kind]!;
  if (!d.light) continue;
  const b = buildings.find((bd) => o.x >= bd.interior.x && o.y >= bd.interior.y && o.x < bd.interior.x + bd.interior.w && o.y < bd.interior.y + bd.interior.h);
  lights.push({ x: o.x * TS + d.light.dx, y: (o.y + 1) * TS + d.light.dy, r: d.light.r, color: d.light.color, building: b ? b.id : null });
}

// Fence / iron rail auto-connection frames (bit mask N=1 E=2 S=4 W=8).
{
  const at = new Map<string, MapObject>();
  for (const o of objects) if (o.kind === 'fence' || o.kind === 'iron') at.set(`${o.x},${o.y}`, o);
  for (const o of at.values()) {
    const n = (dx: number, dy: number) => at.get(`${o.x + dx},${o.y + dy}`)?.kind === o.kind;
    const mask = (n(0, -1) ? 1 : 0) | (n(1, 0) ? 2 : 0) | (n(0, 1) ? 4 : 0) | (n(-1, 0) ? 8 : 0);
    o.frame = `${o.kind}_${mask}`;
  }
}

const collision = buildCollision();

// Drop decals that ended up under solid things or on the wrong ground.
{
  const need: Record<string, string> = { wheat: '#', wheat2: '#', cabbage: '#', carrots: '#', vines: '#', crack: '=', leaves: ',', pebbles: ':' };
  const kept = decals.filter((d) => {
    if (collision[d.y * MAP_W + d.x] === 1) return false;
    const g = get(d.x, d.y);
    const want = need[d.name];
    return want ? g === want : g === G.grass || g === G.soil;
  });
  decals.length = 0;
  decals.push(...kept);
}
// The square (voice: everyone outdoors is "the square" now; `square` is the Storyteller's
// "send to the square" target, inside the circle south of the tower).
const square = { cx: CIRCLE.cx, cy: CIRCLE.cy + 3 * TS, r: PLAZA.rx };

export const townLayout: TownLayout = {
  version: 2,
  widthTiles: MAP_W,
  heightTiles: MAP_H,
  tileSize: TS,
  townBounds: { x: 0, y: 0, w: TOWN_W, h: TOWN_H },
  square,
  buildings,
  collision,
  playerSpawn: { x: 22, y: 27 },
  storytellerSpawn: { x: 22, y: 20 },
  streetlights,
  circle: { ...CIRCLE, startDeg: 0, sweepDeg: 360 },
};

export const townMap: TownMap = {
  width: MAP_W,
  height: MAP_H,
  tileSize: TS,
  ground: ground.map((row) => row.join('')),
  objects,
  styles,
  lights,
  decals,
  landmarks,
  plaza: { ...PLAZA },
};

/** Building that owns an interior tile, if any. */
export function interiorBuildingAt(tx: number, ty: number): BuildingDef | undefined {
  return buildings.find((b) => tx >= b.interior.x && ty >= b.interior.y && tx < b.interior.x + b.interior.w && ty < b.interior.y + b.interior.h);
}
