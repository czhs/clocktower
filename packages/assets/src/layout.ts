import type { BuildingDef, BuildingKind, TilePoint, TileRect, TownLayout } from '@ct/protocol';

// =========================================================================================
// HANDCRAFTED TOWN — "Hollowmere" (world-art)
//
// One 160x96 tile grid (16 px tiles). The outdoor town occupies x 0..95 (townBounds); building
// interiors live in the interior area at x >= 98 in the same coordinate space. Everything here
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
export const MAP_W = 160;
export const MAP_H = 96;
export const TOWN_W = 96;
export const TOWN_H = 96;

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
// 1. Landscape
// =========================================================================================

/** Western forest edge (first walkable column). Designed double wave. */
const forestEdge = (y: number) => 4 + Math.round(1.2 * Math.sin(y / 7) + 0.8 * Math.sin(y / 3.1 + 1));
/** Bottom row of the northern cliff face. */
const cliffBottom = (x: number) => 7 + Math.round(1.1 * Math.sin(x / 6) + 0.7 * Math.sin(x / 2.3 + 2));
/** River centre column (flows north -> south along the east side). */
export const riverCenter = (y: number) => 85 + Math.round(0.9 * Math.sin((y + 4) / 9));
/** Southern forest begins at this row. */
const southEdge = (x: number) => 93 + Math.round(0.8 * Math.sin(x / 4 + 0.5));

rect(0, 0, TOWN_W, TOWN_H, G.grass);
for (let y = 0; y < TOWN_H; y++) {
  const fe = forestEdge(y);
  for (let x = 0; x < fe; x++) put(x, y, x < fe - 2 ? G.dense : G.forest);
  // eastern rim
  put(95, y, G.dense);
  put(94, y, G.forest);
}
for (let x = 0; x < TOWN_W; x++) {
  const cb = cliffBottom(x);
  for (let y = 0; y <= cb; y++) put(x, y, y <= cb - 3 ? G.dense : G.cliff);
  // a strip of forest floor at the cliff foot
  if (get(x, cb + 1) === G.grass && hash2(x, 1) < 0.55) put(x, cb + 1, G.forest);
  const se = southEdge(x);
  for (let y = se; y < TOWN_H; y++) put(x, y, y >= se + 1 ? G.dense : G.forest);
}
// River with sandy banks.
for (let y = 0; y < TOWN_H; y++) {
  const c = riverCenter(y);
  const top = cliffBottom(c);
  for (let x = c - 2; x <= c + 1; x++) put(x, y, y <= top ? G.cliff : G.water);
  if (y > top) {
    if (hash2(c, y, 3) < 0.7) put(c - 3, y, G.sand);
    if (hash2(c, y, 4) < 0.6) put(c + 2, y, G.sand);
  }
}

// =========================================================================================
// 2. Streets
// =========================================================================================

const SQ = { cx: 48, cy: 48, r: 11.5 };

// Main east-west road and the north/south road (3 wide cobbles).
for (let x = 2; x < 95; x++) for (let y = 47; y <= 49; y++) put(x, y, get(x, y) === G.water ? G.bridge : G.cobble);
for (let y = 20; y < TOWN_H; y++) for (let x = 47; x <= 49; x++) put(x, y, G.cobble);
// Lanes (dirt, 2 wide). South lane crosses the river on a footbridge.
for (let x = 5; x <= 81; x++) for (let y = 30; y <= 31; y++) put(x, y, G.dirt);
for (let x = 5; x <= 94; x++) for (let y = 66; y <= 67; y++) put(x, y, get(x, y) === G.water ? G.bridge : G.dirt);
// Alleys between the lanes and the main road.
const alleys: [number, number, number, number][] = [
  // x, width, y0, y1
  [17, 2, 32, 46],
  [34, 1, 32, 46],
  [69, 1, 32, 46],
  [79, 2, 32, 46],
  [14, 2, 50, 65],
  [24, 1, 50, 65],
  [35, 1, 50, 65],
  [69, 1, 50, 65],
  [79, 1, 50, 65],
];
for (const [x, w, y0, y1] of alleys) rect(x, y0, w, y1 - y0 + 1, G.cobble);
// Footpaths: garden gate, graveyard gate, east bank, allotment gate, pond.
rect(14, 21, 1, 9, G.dirt);
rect(64, 21, 1, 9, G.dirt);
rect(60, 68, 1, 3, G.dirt);
rect(18, 68, 1, 5, G.dirt);

// Town square: paved disc with a decorative ring.
for (let y = 30; y < 67; y++)
  for (let x = 30; x < 67; x++) {
    const d = Math.hypot(x - SQ.cx, y - SQ.cy);
    if (d <= SQ.r) put(x, y, d > SQ.r - 1 ? G.ring : G.plaza);
  }
// Roads run through the ring so the entrances read clearly.
for (let i = 36; i <= 60; i++) {
  for (const y of [47, 48, 49]) if (get(i, y) === G.ring) put(i, y, G.cobble);
  for (const x of [47, 48, 49]) if (get(x, i) === G.ring) put(x, i, G.cobble);
}

// Well courtyard north-west of the square.
rect(36, 23, 8, 7, G.cobble);
// Smithy yard south-east of the square.
rect(52, 61, 8, 5, G.gravel);
// Little park south-west of the square.
rect(38, 62, 7, 3, G.gravel);

// =========================================================================================
// 3. Districts
// =========================================================================================

// --- North-west walled garden (hedge parterre, flower beds, fountain) -------------------
frame(8, 10, 25, 11, G.wall);
rect(9, 11, 23, 9, G.grass);
put(14, 20, G.dirt); // gate
rect(9, 15, 23, 1, G.gravel);
rect(19, 11, 3, 9, G.gravel);
rect(14, 16, 1, 4, G.gravel);
for (const [x, y, w, h] of [
  [10, 12, 8, 2],
  [23, 12, 8, 2],
  [10, 17, 3, 2],
  [16, 17, 2, 2],
  [23, 17, 8, 2],
] as const) {
  frame(x, y, w, h, G.hedge);
}
for (const [x, y, w, h] of [
  [11, 12, 6, 1],
  [24, 12, 6, 1],
  [24, 17, 6, 1],
] as const) {
  rect(x, y, w, h, G.soil);
  for (let i = x; i < x + w; i++) decal(i, y, ['flowers_red', 'flowers_violet', 'flowers_white'][(i + y) % 3]!);
}
obj('fountain', 19, 15);
obj('bench', 10, 16);
obj('bench', 26, 16);
obj('oak2', 28, 11);
obj('bush', 9, 19);
obj('bushberry', 31, 19);

// --- Chapel and graveyard ---------------------------------------------------------------
rect(41, 20, 15, 1, G.cobble);
for (let x = 56; x <= 75; x++) {
  obj('iron', x, 10);
  obj('iron', x, 21);
}
for (let y = 11; y <= 20; y++) {
  obj('iron', 56, y);
  obj('iron', 75, y);
}
// open the gate at (64,21)
objects.splice(
  objects.findIndex((o) => o.kind === 'iron' && o.x === 64 && o.y === 21),
  1,
);
rect(57, 11, 18, 10, G.forest);
rect(64, 11, 1, 10, G.dirt);
rect(57, 15, 18, 1, G.dirt);
for (const gy of [12, 14, 17, 19]) {
  for (let gx = 58; gx <= 73; gx += 2) {
    if (gx === 64) continue;
    if (gx >= 67 && gy <= 14) continue; // crypt
    if (gx >= 60 && gx <= 62 && gy <= 14) continue; // angel statue
    const v = hash2(gx, gy, 9);
    obj(v < 0.4 ? 'grave1' : v < 0.75 ? 'grave2' : 'grave3', gx, gy);
  }
}
obj('crypt', 69, 13);
obj('angel', 61, 13);
obj('deadtree', 70, 18);
obj('deadtree', 77, 14);
obj('lamp', 63, 22);

// --- Well courtyard ----------------------------------------------------------------------
obj('well', 39, 27);
obj('bench', 36, 24);
obj('bench', 42, 24);
obj('barrel', 43, 28);
obj('noticeboard', 36, 28);

// --- Square furniture ---------------------------------------------------------------------
obj('stall_red', 39, 43);
obj('stall_green', 55, 43);
obj('stall_blue', 39, 54);
obj('stall_gold', 55, 54);
obj('bench', 43, 52);
obj('bench', 52, 52);
obj('barrel', 42, 43);
obj('crates', 58, 54);

// --- Smithy yard, park, alleys -------------------------------------------------------------
obj('anvil', 53, 62);
obj('cart', 56, 63);
obj('haystack', 52, 64);
obj('barrel', 59, 62);
obj('oak', 38, 61);
obj('bench', 40, 64);
obj('bush', 44, 62);
obj('crates', 32, 44);
obj('barrel', 32, 43);
obj('barrel', 19, 37);

// --- South-west pond ----------------------------------------------------------------------
ellipse(16, 78, 7.5, 5, G.sand, soft);
ellipse(16, 78, 6.4, 4, G.water);
rect(16, 73, 1, 2, G.bridge); // little jetty
obj('willow', 6, 76);
obj('willow', 22, 84);
for (const [x, y] of [
  [10, 75],
  [11, 82],
  [20, 74],
  [23, 79],
  [14, 83],
]) {
  obj('reeds', x!, y!);
}
obj('rock', 9, 80);
obj('bigrock', 24, 75);

// --- Windmill meadow (south) ------------------------------------------------------------------
rect(27, 71, 15, 15, G.soil);
for (let y = 71; y < 86; y++) for (let x = 27; x < 42; x++) decal(x, y, (y & 1) === 0 ? 'wheat' : 'wheat2');
rect(33, 80, 4, 3, G.grass);
rect(34, 83, 1, 3, G.dirt);
rect(34, 86, 13, 1, G.dirt);
obj('windmill', 33, 82);
obj('haystack', 29, 87);
obj('haystack', 42, 74);
obj('cart', 43, 80);

// --- South-east allotments and orchard (fenced) --------------------------------------------------
for (let x = 56; x <= 81; x++) {
  obj('fence', x, 71);
  obj('fence', x, 88);
}
for (let y = 72; y <= 87; y++) {
  obj('fence', 56, y);
  obj('fence', 81, y);
}
objects.splice(
  objects.findIndex((o) => o.kind === 'fence' && o.x === 60 && o.y === 71),
  1,
);
rect(57, 72, 24, 16, G.grass);
rect(60, 72, 1, 15, G.dirt);
rect(57, 80, 24, 1, G.dirt);
for (const by of [73, 76]) {
  rect(62, by, 9, 2, G.soil);
  for (let x = 62; x < 71; x++) {
    decal(x, by, by === 73 ? 'cabbage' : 'carrots');
    decal(x, by + 1, by === 73 ? 'cabbage' : 'carrots');
  }
}
rect(57, 73, 2, 6, G.soil);
for (let y = 73; y < 79; y++) decal(57, y, 'vines');
obj('scarecrow', 66, 79);
obj('pumpkins', 71, 78);
obj('pumpkins', 72, 77);
obj('pumpkins', 61, 78);
for (let y = 74; y <= 86; y += 4) for (let x = 73; x <= 79; x += 3) obj('fruittree', x, y + ((x / 3) & 1));
obj('shed', 58, 86);
obj('sacks', 63, 86);
obj('barrel', 65, 85);

// --- Southern town wall and gate ---------------------------------------------------------------
for (let x = 5; x <= 81; x++) if (x < 46 || x > 50) if (get(x, 90) !== G.water) put(x, 90, G.wall);
obj('gatepost', 46, 90);
obj('gatepost', 50, 90);
put(46, 90, G.wall);
put(50, 90, G.wall);
obj('signpost', 51, 92);

// --- East bank -------------------------------------------------------------------------------------
obj('pine', 92, 34);
obj('oak', 88, 54);
obj('bush', 93, 57);
obj('stump', 88, 37);

// --- Waterfall where the river leaves the cliff -------------------------------------------------
{
  const c = riverCenter(cliffBottom(85));
  obj('waterfall', c - 2, cliffBottom(c));
}

// =========================================================================================
// 4. Buildings
// =========================================================================================

const buildings: BuildingDef[] = [];
const styles: Record<string, BuildingStyle> = {};
const lights: LightDef[] = [];

interface Spec {
  id: string;
  kind: BuildingKind;
  name: string;
  houseIndex: number | null;
  fp: TileRect;
  doorX: number;
  style: BuildingStyle;
  interior: TileRect;
}

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
  return { roof, wall, roofType, chimney, shutters, flowers, lantern, interior };
}

const houseRoom = (i: number): TileRect => ({ x: 98 + (i % 5) * 12, y: 2 + Math.floor(i / 5) * 10, w: 11, h: 9 });

const HOUSE_NAMES = [
  'Thornwick Cottage',
  'Ashgrove Cottage',
  'The Weaver’s House',
  'Ravenscroft Cottage',
  'Mossbank Cottage',
  'Elderhollow',
  'Candlewick Cottage',
  'Briarfield House',
  'Hearthstone Cottage',
  'Gloamend Cottage',
  'Old Cobbler’s House',
  'Fernlea Cottage',
  'Rookery Cottage',
  'Riverbend Cottage',
  'Millrace Cottage',
];

const houseFootprints: { fp: TileRect; doorX: number; style: BuildingStyle }[] = [
  // north row (doors on the north lane, y = 30)
  { fp: { x: 7, y: 24, w: 6, h: 6 }, doorX: 9, style: S('slate', 'timber', 'cross', 'right', '#6b2f2f', true, false, 0) },
  { fp: { x: 16, y: 25, w: 5, h: 5 }, doorX: 18, style: S('thatch', 'plaster', 'side', 'left', '#3f5a3a', false, true, 1) },
  { fp: { x: 24, y: 24, w: 7, h: 6 }, doorX: 27, style: S('red', 'brick', 'side', 'right', '#2f3f63', true, false, 2) },
  { fp: { x: 57, y: 24, w: 6, h: 6 }, doorX: 59, style: S('plum', 'stone', 'cross', 'left', '#7a5a2a', false, true, 3) },
  { fp: { x: 67, y: 25, w: 5, h: 5 }, doorX: 69, style: S('moss', 'planks', 'side', 'right', '#5b2f4f', true, false, 4) },
  // middle row (doors on the main road, y = 47)
  { fp: { x: 8, y: 41, w: 6, h: 6 }, doorX: 10, style: S('blue', 'plaster', 'cross', 'right', '#7a3a1e', true, true, 5) },
  { fp: { x: 62, y: 41, w: 6, h: 6 }, doorX: 64, style: S('red', 'timber', 'side', 'left', '#2f4f4f', false, true, 6) },
  { fp: { x: 71, y: 41, w: 6, h: 6 }, doorX: 73, style: S('slate', 'brick', 'cross', 'none', '#6b5a2f', true, false, 7) },
  // south row (doors on the south lane, y = 66)
  { fp: { x: 7, y: 60, w: 6, h: 6 }, doorX: 9, style: S('thatch', 'timber', 'side', 'right', '#4a2f6b', true, false, 8) },
  { fp: { x: 17, y: 60, w: 5, h: 6 }, doorX: 19, style: S('moss', 'stone', 'side', 'left', '#6b2f2f', false, true, 9) },
  { fp: { x: 26, y: 59, w: 7, h: 7 }, doorX: 29, style: S('plum', 'plaster', 'cross', 'right', '#2f5a6b', true, true, 10) },
  { fp: { x: 62, y: 60, w: 6, h: 6 }, doorX: 64, style: S('blue', 'planks', 'side', 'right', '#7a3a1e', true, false, 11) },
  { fp: { x: 71, y: 60, w: 7, h: 6 }, doorX: 74, style: S('red', 'stone', 'cross', 'left', '#3f5a3a', false, true, 12) },
  // east bank (across the river)
  { fp: { x: 89, y: 41, w: 6, h: 6 }, doorX: 91, style: S('slate', 'planks', 'side', 'left', '#5b2f4f', true, true, 13) },
  { fp: { x: 89, y: 60, w: 5, h: 6 }, doorX: 91, style: S('thatch', 'brick', 'cross', 'right', '#2f3f63', false, false, 14) },
];

const specs: Spec[] = houseFootprints.map((h, i) => ({
  id: `house-${i}`,
  kind: 'house' as const,
  name: HOUSE_NAMES[i]!,
  houseIndex: i,
  fp: h.fp,
  doorX: h.doorX,
  style: h.style,
  interior: houseRoom(i),
}));
specs.push(
  {
    id: 'tavern',
    kind: 'tavern',
    name: 'The Hanged Lantern',
    houseIndex: null,
    fp: { x: 21, y: 39, w: 11, h: 8 },
    doorX: 26,
    style: S('red', 'timber', 'cross', 'left', '#6b2f2f', true, true, 20),
    interior: { x: 98, y: 33, w: 18, h: 12 },
  },
  {
    id: 'chapel',
    kind: 'chapel',
    name: 'Chapel of the Ninth Bell',
    houseIndex: null,
    fp: { x: 43, y: 12, w: 11, h: 8 },
    doorX: 48,
    style: S('slate', 'stone', 'side', 'none', '#4a2f2f', false, true, 21),
    interior: { x: 118, y: 33, w: 13, h: 14 },
  },
  {
    id: 'clocktower',
    kind: 'clocktower',
    name: 'The Clocktower',
    houseIndex: null,
    fp: { x: 46, y: 44, w: 5, h: 5 },
    doorX: 48,
    style: S('slate', 'stone', 'side', 'none', '#3a2a1e', false, true, 22),
    interior: { x: 133, y: 33, w: 9, h: 10 },
  },
  {
    id: 'shop',
    kind: 'shop',
    name: 'Mortimer’s Curios',
    houseIndex: null,
    fp: { x: 74, y: 24, w: 7, h: 6 },
    doorX: 77,
    style: S('blue', 'timber', 'side', 'right', '#2f4f4f', true, true, 23),
    interior: { x: 144, y: 33, w: 11, h: 9 },
  },
);

// --- Interiors ------------------------------------------------------------------------------

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

function furnishHouse(sp: Spec): { bed: TilePoint; visitPoint: TilePoint } {
  const r = sp.interior;
  const i = sp.houseIndex!;
  const mirror = (i & 1) === 1;
  const f = furnisher(r, mirror);
  const mx = (dx: number) => (mirror ? r.x + r.w - 1 - dx : r.x + dx);
  // wall decorations (sit on the 2-row wall face)
  f('fireplace', 5, 1);
  f('window', 2, 1);
  f('window', 8, 1);
  f(i % 3 === 0 ? 'wallshelf' : 'window', 3, 1);
  // bed in the corner with a nightstand + candle
  if (i % 4 === 2) f('bedwide', 1, 3);
  else f('bed', 1, 3, { frame: `bed_${i % 5}` }); // blanket colour varies per cottage
  f('nightstand', i % 4 === 2 ? 3 : 2, 2);
  f(['rug_red', 'rug_blue', 'rug_green'][i % 3]!, 4, 6);
  f(i % 2 === 0 ? 'table' : 'roundtable', 5, 4);
  f('chair', 4, 4);
  f('chair', 7, 4);
  f(i % 3 === 1 ? 'bookshelf' : i % 3 === 2 ? 'loom' : 'wardrobe', 8, 2);
  f('chest', 9, 6);
  f('plant', 1, 7);
  if (i % 2 === 0) f('barrel', 9, 7);
  f('doormat', Math.floor(r.w / 2), 7);
  const bedCol = i % 4 === 2 ? 3 : 2;
  return { bed: { x: mx(bedCol), y: r.y + 3 }, visitPoint: { x: mx(bedCol + 1), y: r.y + 3 } };
}

function furnishTavern(r: TileRect) {
  const f = furnisher(r, false);
  f('fireplace', 13, 1);
  f('window', 3, 1);
  f('window', 9, 1);
  f('wallshelf', 1, 1);
  f('wallshelf', 6, 1);
  f('bar', 1, 3);
  f('kegs', 1, 2);
  f('kegs', 4, 2);
  f('stool', 2, 4);
  f('stool', 4, 4);
  f('stool', 6, 4);
  for (const [x, y] of [
    [10, 4],
    [14, 4],
    [3, 7],
    [10, 8],
    [14, 8],
  ]) {
    f('roundtable', x!, y!);
    f('stool', x! - 1, y!);
    f('stool', x! + 2, y!);
  }
  f('rug_red', 6, 9);
  f('barrel', 16, 9);
  f('barrel', 16, 10);
  f('barrel', 1, 10);
  f('doormat', Math.floor(r.w / 2), 10);
}

function furnishChapel(r: TileRect) {
  const f = furnisher(r, false);
  const mid = Math.floor(r.w / 2);
  f('stainedglass', 2, 1);
  f('stainedglass', 4, 1);
  f('stainedglass', 8, 1);
  f('stainedglass', 10, 1);
  f('rug_long', mid, 11);
  f('altar', mid - 1, 3);
  f('candelabra', mid - 3, 3);
  f('candelabra', mid + 3, 3);
  for (let y = 6; y <= 10; y += 2) {
    f('pew', 1, y);
    f('pew', mid + 2, y);
  }
  f('plant', 1, 12);
  f('plant', r.w - 2, 12);
}

function furnishClocktower(r: TileRect) {
  const f = furnisher(r, false);
  f('gears', 1, 3);
  f('bellrope', 6, 2);
  f('ladder', 7, 1);
  f('window', 4, 1);
  f('chest', 7, 5);
  f('barrel', 1, 7);
  f('candelabra', 7, 7);
  f('crates', 1, 6);
}

function furnishShop(r: TileRect) {
  const f = furnisher(r, false);
  f('shopshelf', 1, 2);
  f('shopshelf', 7, 2);
  f('window', 4, 1);
  f('window', 5, 1);
  f('counter', 3, 4);
  f('sacks', 1, 6);
  f('crates', 8, 6);
  f('barrel', 9, 4);
  f('candelabra', 1, 4);
  f('rug_blue', 3, 7);
  f('doormat', Math.floor(r.w / 2), 7);
}

for (const sp of specs) {
  const r = sp.interior;
  paintRoom(r, sp.kind === 'house' || sp.kind === 'tavern' || sp.kind === 'shop' ? G.floorWood : G.floorStone);
  let extra: Partial<BuildingDef> = {};
  if (sp.kind === 'house') extra = furnishHouse(sp);
  else if (sp.kind === 'tavern') furnishTavern(r);
  else if (sp.kind === 'chapel') furnishChapel(r);
  else if (sp.kind === 'clocktower') furnishClocktower(r);
  else if (sp.kind === 'shop') furnishShop(r);

  objects.push({ kind: 'building', x: sp.fp.x, y: sp.fp.y + sp.fp.h - 1, frame: sp.id });

  const def: BuildingDef = {
    id: sp.id,
    kind: sp.kind,
    name: sp.name,
    houseIndex: sp.houseIndex,
    footprint: sp.fp,
    door: { x: sp.doorX, y: sp.fp.y + sp.fp.h },
    interior: r,
    interiorDoor: { x: r.x + Math.floor(r.w / 2), y: r.y + r.h - 2 },
    ...extra,
  };
  buildings.push(def);
  styles[sp.id] = sp.style;
}

// =========================================================================================
// 5. Trees, lamps and the remaining dressing
// =========================================================================================

// Forest edge (west) — staggered pines and oaks along the boundary.
for (let y = 8; y < 92; y += 3) {
  const fe = forestEdge(y);
  const k = hash2(3, y, 5);
  obj(k < 0.55 ? 'pinetall' : 'pine', Math.max(0, fe - 3), y);
  if (hash2(4, y, 6) < 0.6) obj('pine', Math.max(0, fe - 5), y + 1);
}
// Cliff-top pine silhouette.
for (let x = 0; x < 94; x += 2) {
  const cb = cliffBottom(x);
  if (Math.abs(x - riverCenter(cb)) <= 3) continue;
  obj(hash2(x, 2, 7) < 0.5 ? 'pinetall' : 'pine', x, cb - 3);
}
// Southern forest.
for (let x = 2; x < 94; x += 3) {
  if (x >= 44 && x <= 52) continue;
  if (Math.abs(x - riverCenter(94)) <= 3) continue;
  obj(hash2(x, 9, 8) < 0.5 ? 'pinetall' : 'oak', x, southEdge(x) + 1);
}
// East rim.
for (let y = 12; y < 92; y += 4) if (y < 39 || (y > 50 && y < 58) || y > 69) obj('pine', 94, y);

// Hand-placed town trees and bushes.
const trees: [string, number, number][] = [
  ['oak', 51, 26],
  ['oak2', 53, 34],
  ['oak', 3 + 34, 36],
  ['oak2', 10, 35],
  ['oak', 23, 35],
  ['pine', 74, 35],
  ['oak2', 79, 20],
  ['oak', 86, 36],
  ['oak', 4 + 6, 53],
  ['oak2', 20, 55],
  ['oak', 29, 53],
  ['oak2', 63, 53],
  ['oak', 74, 53],
  ['oak2', 6, 70],
  ['oak', 52, 70],
  ['oak2', 47 - 3, 76],
  ['oak', 51, 84],
  ['deadtree', 8, 88],
  ['oak2', 75, 92 - 3],
  ['pine', 26, 8 + 13],
  ['oak2', 4 + 30, 22],
  ['deadtree', 40, 33],
  ['fruittree', 91, 51],
  ['oak', 89, 73],
  ['pine', 89, 80],
  ['oak2', 90, 86],
];
for (const [k, x, y] of trees) obj(k, x, y);
const bushes: [string, number, number][] = [
  ['bush', 13, 31 + 2],
  ['bushberry', 27, 33],
  ['bush', 45, 35],
  ['bushberry', 52, 36],
  ['bush', 66, 35],
  ['bush', 77, 37],
  ['bushberry', 6, 47 - 2],
  ['bush', 20, 51],
  ['bush', 32, 57],
  ['bushberry', 60, 57],
  ['bush', 66, 56],
  ['bush', 76, 56],
  ['bush', 88, 64],
  ['bushberry', 46, 68],
  ['bush', 24, 68],
  ['rock', 44, 87],
  ['stump', 12, 56],
  ['barrel', 30, 68],
  ['crates', 76, 68],
  ['barrel', 14, 46],
  ['rock', 88, 69],
];
for (const [k, x, y] of bushes) obj(k, x, y);
obj('signpost', 45, 50);
obj('signpost', 80, 50);

// Streetlights (also exported in TownLayout.streetlights).
const streetlights: TilePoint[] = [
  // square
  { x: 45, y: 38 },
  { x: 51, y: 38 },
  { x: 45, y: 58 },
  { x: 51, y: 58 },
  { x: 38, y: 45 },
  { x: 38, y: 51 },
  { x: 58, y: 45 },
  { x: 58, y: 51 },
  { x: 41, y: 41 },
  { x: 55, y: 41 },
  { x: 41, y: 56 },
  { x: 55, y: 56 },
  // main road
  { x: 10, y: 50 },
  { x: 21, y: 50 },
  { x: 31, y: 50 },
  { x: 65, y: 50 },
  { x: 76, y: 50 },
  { x: 88, y: 50 },
  // north lane
  { x: 12, y: 32 },
  { x: 22, y: 32 },
  { x: 32, y: 32 },
  { x: 56, y: 32 },
  { x: 72, y: 32 },
  // south lane
  { x: 12, y: 68 },
  { x: 26, y: 68 },
  { x: 40, y: 68 },
  { x: 56, y: 68 },
  { x: 72, y: 68 },
  { x: 92, y: 68 },
  // north/south road and chapel
  { x: 46, y: 24 },
  { x: 50, y: 33 },
  { x: 46, y: 21 },
  { x: 50, y: 21 },
  { x: 50, y: 76 },
  { x: 46, y: 84 },
  // tavern + east bank
  { x: 32, y: 46 },
  { x: 88, y: 46 },
];
for (const p of streetlights) obj('lamp', p.x, p.y);

// Grass decals (flowers / tufts), placed on designed bands rather than everywhere.
for (let y = 8; y < 92; y++)
  for (let x = 4; x < 94; x++) {
    if (get(x, y) !== G.grass) continue;
    const h = hash2(x, y, 11);
    if (h < 0.06) decal(x, y, 'tuft');
    else if (h < 0.075) decal(x, y, 'tuft2');
    else if (h < 0.085) decal(x, y, ['flowers_red', 'flowers_violet', 'flowers_white', 'flowers_yellow'][Math.floor(hash2(x, y, 12) * 4)]!);
    else if (h < 0.09) decal(x, y, 'mushrooms');
  }
for (let y = 8; y < 92; y++)
  for (let x = 2; x < 94; x++) {
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
  for (const b of buildings) for (let y = b.footprint.y; y < b.footprint.y + b.footprint.h; y++) for (let x = b.footprint.x; x < b.footprint.x + b.footprint.w; x++) block(x, y);
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
// The square: centre of tile (48,48), radius 11.5 tiles.
const square = { cx: SQ.cx * TS + TS / 2, cy: SQ.cy * TS + TS / 2, r: SQ.r * TS };

export const townLayout: TownLayout = {
  version: 1,
  widthTiles: MAP_W,
  heightTiles: MAP_H,
  tileSize: TS,
  townBounds: { x: 0, y: 0, w: TOWN_W, h: TOWN_H },
  square,
  buildings,
  collision,
  playerSpawn: { x: 48, y: 54 },
  storytellerSpawn: { x: 52, y: 50 },
  streetlights,
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
};

/** Building that owns an interior tile, if any. */
export function interiorBuildingAt(tx: number, ty: number): BuildingDef | undefined {
  return buildings.find((b) => tx >= b.interior.x && ty >= b.interior.y && tx < b.interior.x + b.interior.w && ty < b.interior.y + b.interior.h);
}
