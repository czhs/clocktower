// Hollowmere town layout (owner: town foundation lead). docs/TOWN.md §1.
//
// A faithful hand-port of the Clocktower Town v2 layout (pipgws packages/assets/src/layout.ts, READ ONLY
// source) restricted to the outdoor town area x 0..44 (45 x 37 tiles). The painter below is the same
// sequence of strokes as the original, so ground codes, objects, decals and collision match tile for tile - EXCEPT the
// LAYOUT DELTAs (docs/TOWN.md §12.1 table): moved / turned cottages, re-placed props, and (round 6/7) 6 extra rows z 37..42
// (TOWN_H 43) for the south bay house-9 now stands in.
//
// COORDINATES (1 tile = 1 m):
//   world x = tile x, world z = tile y, y up. Tile (tx, ty) covers x in [tx, tx+1], z in [ty, ty+1];
//   its centre is (tx + .5, ty + .5). The 2D map's screen-up is world -z, so a building's "south" side
//   (the side the 2D camera saw) faces +z. 2D pixel coords (16 px tiles) / 16 = world metres.
//
// EXPORTS (plain data, computed once at import, deterministic):
//   TOWN_W, TOWN_H, G, BLOCKING_GROUND, PROP_DEFS, hash2(x, y, seed)
//   ground: string[] (TOWN_H = 43 rows of 45 ground codes; the game has 37), groundAt(tx, ty)
//   PLAZA {cx, cz, r}, CIRCLE {cx, cz, r} (metres), SQUARE, PLAYER_SPAWN, STORYTELLER_SPAWN
//   houses[15]: {id, index, name, facing, style, persona, brief, footprint {x, z, w, d}, door {x, z} (door TILE,
//                the walkable tile in front of the door), doorPoint {x, z} (centre of the door opening on the
//                wall plane), doorNormal [nx, nz] (outward), center {x, z}}
//   clocktower: same shape (landmark, never enterable)
//   objects: every outdoor map object except buildings: {kind, x, z (anchor tile), rect {x, z, w, d} (collision
//            rect in metres, or the anchor tile when the kind has no collision), center {x, z}, def, owner,
//            walkable (true: walk-through dressing, never blocks; see PROP_DEFS)}
//   streetlights [{x, z}] (tiles), decals [{x, z, name}], lights2d (v1 2D light list, reference only)
//   collision: Uint8Array(45*42), blocked(tx, ty)
//   seatPos(i, n = 15) -> {x, z, angle}: voting-circle seat i of n (clockwise from 12 o'clock = -z), like the game
//   pieceRecord(id) -> the layout record a piece is built from (see docs/TOWN.md §4)
//   OBJECT_OWNER: kind -> piece id ('props' | 'foliage' | 'house')
export const TOWN_W = 45;
// LAYOUT DELTA (3D town, docs/TOWN.md §12.9): the game map is 45 x 37; the 3D town adds 6 rows (z 37..43) for the
// SOUTH BAY: house-9 (Gloamend Clockworks) stands south of the old cart-road line so its roof clears the plaza kerb at
// the gameplay camera, and the cart road swings round its front. Outside the bay rows 36..42 are dense forest ('T').
export const TOWN_H = 43;
/** The game's map height (rows 0..36); rows >= GAME_H exist only in the 3D town's south bay. */
export const GAME_H = 37;

/** Ground codes (one char per tile), identical to the 2D game. */
export const G = {
  void: ' ', grass: '.', forest: ',', dense: 'T', dirt: ':', cobble: '=', plaza: 'o', ring: 'O', water: '~',
  sand: 's', soil: '#', cliff: '^', bridge: 'b', hedge: 'h', wall: 'w', gravel: 'g',
};
export const BLOCKING_GROUND = new Set([' ', 'T', '~', '^', 'h', 'w', 'W', 'D']);

// Object kinds used outdoors. w/h = the 2D sprite size in px (16 px = 1 m; h includes the drawn height),
// col = blocked rect relative to the anchor tile (dy <= 0 goes north, i.e. -z). Lights: px offsets from the
// sprite's bottom-left corner (2D reference only; 3D lights come from the pieces' anchors).
const one = { x: 0, y: 0, w: 1, h: 1 };
export const PROP_DEFS = {
  oak: { w: 48, h: 64, col: { x: 1, y: 0, w: 1, h: 1 } },
  oak2: { w: 48, h: 56, col: { x: 1, y: 0, w: 1, h: 1 } },
  pine: { w: 32, h: 64, col: { x: 0, y: 0, w: 2, h: 1 } },
  pinetall: { w: 32, h: 80, col: { x: 0, y: 0, w: 2, h: 1 } },
  bush: { w: 16, h: 16, col: one },
  bushberry: { w: 16, h: 16, col: one },
  stump: { w: 16, h: 16, col: one },
  lamp: { w: 16, h: 48, col: one, light: { dx: 8, dy: -40, r: 72, color: 'warm' } },
  fountain: { w: 48, h: 40, col: { x: 0, y: -1, w: 3, h: 2 } },
  stall_red: { w: 48, h: 48, col: { x: 0, y: -1, w: 3, h: 2 } },
  stall_gold: { w: 48, h: 48, col: { x: 0, y: -1, w: 3, h: 2 } },
  bench: { w: 32, h: 24, col: { x: 0, y: 0, w: 2, h: 1 } },
  barrel: { w: 16, h: 24, col: one, walkable: true },
  crates: { w: 32, h: 32, col: { x: 0, y: 0, w: 2, h: 1 }, walkable: true },
  doormat: { w: 16, h: 16, col: null, flat: true },
  // green dressing (3D town only, layout delta: the v1 prop library the 2D map never placed; see docs/TOWN.md §12)
  noticeboard: { w: 32, h: 32, col: { x: 0, y: 0, w: 2, h: 1 } },
  well: { w: 32, h: 32, col: { x: 0, y: 0, w: 2, h: 2 } },
  signpost: { w: 16, h: 32, col: one },
  cart: { w: 32, h: 24, col: { x: 0, y: 0, w: 2, h: 1 } },
  pumpkins: { w: 16, h: 16, col: one, walkable: true },
  flowerbarrel: { w: 16, h: 24, col: one, walkable: true },
};
// WALK-THROUGH props (3D town, user request; docs/TOWN.md §12.9): `walkable: true` = small dressing the player walks
// through (barrels, crate stacks + their sack, pumpkins, flower barrels / pots). They keep their `rect` (the props piece
// builds them there) but never block: not in `collision`, not in the door-lane search, `objects[i].walkable` for the
// demo player (src/demo/collision.js PROP_SHAPES should skip them). Big things stay solid: houses, the tower, fountain,
// well, stalls, cart, noticeboard, signpost, lamps, benches, trees, bushes, stump, the dais.

/** Which piece builds each object kind (doormats belong to the house whose door tile they sit on). */
export const OBJECT_OWNER = {
  oak: 'foliage', oak2: 'foliage', pine: 'foliage', pinetall: 'foliage', bush: 'foliage', bushberry: 'foliage', stump: 'foliage',
  lamp: 'props', fountain: 'props', stall_red: 'props', stall_gold: 'props', bench: 'props', barrel: 'props', crates: 'props',
  doormat: 'house',
  noticeboard: 'props', well: 'props', signpost: 'props', cart: 'props', pumpkins: 'props', flowerbarrel: 'props',
};

/** Fixed integer hash (same as the 2D game: deterministic decorative jitter). */
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// =========================================================================================
// Painter (same strokes, same order as layout.ts §1)
// =========================================================================================
const W = TOWN_W, H = TOWN_H;
const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => ' '));
const objs = [];
const decalList = [];
const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const put = (x, y, c) => { if (inMap(x, y)) grid[y][x] = c; };
const get = (x, y) => (inMap(x, y) ? grid[y][x] : ' ');
const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(i, j, c); };
const obj = (kind, x, y) => { if (!PROP_DEFS[kind]) throw new Error(`unknown prop ${kind}`); objs.push({ kind, x, y }); };

const TS = 16;
const PLAZA_PX = { cx: 22.5 * TS, cy: 19.5 * TS, rx: 9 * TS, ry: 9 * TS };
const CIRCLE_PX = { cx: 22.5 * TS, cy: 19.75 * TS, rx: 6.25 * TS, ry: 6.25 * TS };

rect(0, 0, W, H, G.grass);
for (let x = 0; x < W; x++) { put(x, 0, G.dense); put(x, H - 1, G.dense); }
for (let y = 0; y < H; y++) { put(0, y, G.dense); put(W - 1, y, G.dense); }
for (let x = 1; x < W - 1; x++) if (hash2(x, 1) < 0.55 && (x < 21 || x > 29)) put(x, 1, G.forest);

rect(4, 9, W - 8, 1, G.cobble);            // top lane (top arc doors + the tower)
// LAYOUT DELTA (3D town; game: rect(5, 13, 12, 1) / rect(W - 17, 13, 12, 1), horizontal corner-door lanes): the corner
// cottages are turned 45 deg, so their lanes run DIAGONALLY from the rotated door tiles (7,12) / (37,12) to the side
// lanes at z 18 - a 2-tile staircase (4-connected for tile walking), matching the ground piece's diagonal strokes
// (painted below, once the placed door tiles are known: cornerLanes())
// LAYOUT DELTA: the side-row cottages are staggered + turned (LAYOUT_DELTAS), so the side lanes stop short of them
// (game: x 5..15 / 29..39); doorConnectors() below joins every door tile to the lane network
rect(7, 18, 9, 1, G.cobble);               // left: house-13's lane
rect(W - 16, 18, 9, 1, G.cobble);          // right: house-5's lane
rect(6, 24, 10, 1, G.cobble);              // left: house-12's lane
rect(W - 16, 24, 10, 1, G.cobble);         // right: house-6's lane
rect(8, 24, 3, 11, G.cobble);              // paths through the lower ring down to the bottom lane
rect(W - 11, 24, 3, 11, G.cobble);
rect(15, 24, 4, 11, G.cobble);
rect(W - 19, 24, 4, 11, G.cobble);
rect(2, 34, W - 4, 2, G.dirt);             // the cart road behind the lower ring
// LAYOUT DELTA (3D town, §12.9): the SOUTH BAY. Rows GAME_H-1 .. H-1 are dense forest (the game's south border row 36
// plus the 6 added rows) except the bay x 15..29, z 34..41 that house-9 stands in (z 37..41 since layout-finish). The cart
// road swings round house-9's FRONT: no road behind it (x 19..25, z 34..36: lawn), 2-tile arms down its sides (rows
// 36..39, then row 40 beside its front corners), and a 2-tile stretch along its front (rows 40-41; house-9's front wall
// stands on row 40, its door tile is 22,41) - like the game, where its door opened onto the cart road.
const BAY = { x0: 15, x1: 29, z0: GAME_H - 1, z1: H - 2 };
rect(1, GAME_H - 1, W - 2, H - GAME_H, G.dense);
rect(BAY.x0, BAY.z0, BAY.x1 - BAY.x0 + 1, BAY.z1 - BAY.z0 + 1, G.grass);
rect(19, 34, 7, 2, G.grass);
for (const [x, z] of [[17, 36], [18, 36], [18, 37], [19, 37], [18, 38], [19, 38], [18, 39], [19, 39], [26, 36], [27, 36], [25, 37], [26, 37], [25, 38], [26, 38], [25, 39], [26, 39]]) put(x, z, G.dirt);
rect(18, 40, 9, 2, G.dirt);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // the square
  const nd = Math.hypot((x * TS + TS / 2 - PLAZA_PX.cx) / PLAZA_PX.rx, (y * TS + TS / 2 - PLAZA_PX.cy) / PLAZA_PX.ry);
  if (nd <= 1) put(x, y, nd > 0.9 ? G.ring : G.plaza);
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // lanes run through the stone ring
  if (get(x, y) !== G.ring) continue;
  const lane = y === 18 || y === 24 || (y > 24 && ((x >= 15 && x <= 18) || (x >= W - 19 && x <= W - 16)));
  if (lane) put(x, y, G.cobble);
}

// =========================================================================================
// Buildings (layout.ts §2): 15 cottages clockwise from the top-left + the clock tower landmark
// =========================================================================================
const S = (roof, wall, roofType, chimney, shutters, flowers, lantern, interior) =>
  ({ roof, wall, roofType, chimney, shutters, flowers, lantern, interior, facing: 'south' });

export const HOUSE_NAMES = [
  'Stargazer’s Tower', 'Wychwood Cottage', 'The Weaver’s House', 'Ravenscroft', 'Mossbank Cottage',
  'Elderhollow Apothecary', 'The Lantern-maker’s', 'Toadstool Hollow', 'Hearthstone Cabin', 'Gloamend Clockworks',
  'The Old Boot', 'Fernlea Oak', 'Rookery House', 'Riverbend Boathouse', 'Millrace Mill',
];

// One-line identity of each cottage, summarised from the v1 art (pipgws packages/assets/scripts/houses/house-<i>.ts,
// read the full header + code there: it is the identity source of truth; `style` below is only the layout's hint).
export const HOUSE_BRIEFS = [
  'round rubble-stone tower-house under a tall violet fish-scale cone, brass moon-and-star finial, telescope from a lucarne; stone lean-to with woodpile left, half-timbered chimney wing right',
  'crooked witch’s cottage: sagging witch-hat roof of patched mossy shingles curling left, zig-zag brick chimney, skewed stained plaster on fieldstone, diamond-leaded window, porthole, purple moon door, cauldron, pumpkins, besom',
  'tall half-timbered weaver’s house, jettied upper floor on carved brackets over an ochre-stone shop, red-tiled roof with loft gable + hoist beam and wool bale, wide loom window, cloth-bolt counter, yarn skeins, spool sign',
  'Ravenscroft: gothic pale-ashlar house, steep central gable with glowing rose window and twin lancets over a pointed oak door, lower wings with iron ridge cresting, stepped buttresses, crows, ivy',
  'Mossbank: low drystone blackhouse of rounded fieldstones under a deep hipped turf roof (long grass, wildflowers, toadstools, rowan sapling), eyebrow window, stubby chimney, round red door, sunflowers, cabbages, beehive skeps',
  'the Apothecary (west-facing): cream limewash + bottle-green timbers, clipped (jerkinhead) teal-slate roof, projecting bay window of glowing coloured bottles, herb bundles, diamond attic light, mortar-and-pestle plaque, verdigris still-flue',
  'the Lantern-maker’s (west-facing): tall steep gable of soot-dark weatherboards with bone-white trim, fish-scale plum slate, strings of coloured lanterns down both bargeboards, great brass lantern sign, glowing candle-shop window',
  'Toadstool Hollow (west-facing): whitewashed round stalk under a great crimson toadstool cap with ivory spots, round green door, lantern from the cap rim, porthole windows, eyebrow dormer, crooked stovepipe, briar roses',
  'Hearthstone (west-facing): round-log cabin with end-grain log corners, low broad board-and-batten gable, thick mossy cedar-shake roof, massive tapering fieldstone chimney up the gable end, pent hood, woodpile, chopping block + axe',
  'Gloamend Clockworks: crow-stepped brick gable through a verdigris copper standing-seam roof, big clock dial in the gable with a gilded gear finial, two bow shop windows of clock faces + pendulums, brass cog sign, twin lamps, fanlit door',
  'The Old Boot (east-facing): the cobbler lives in an enormous old boot in profile, heel + laced shaft left, toe at the lane, mossy roof + dormer on the shaft, crooked stovepipe, tiny-shoe shop window under a striped awning, door in the toe',
  'Fernlea (east-facing): a home hollowed into an ancient oak, furrowed trunk with flaring roots, round-topped door in the trunk flank, round window, lantern, plank stair up to a little gabled cabin in the crown, lanterns, ferns, toadstools',
  'Rookery House (east-facing): tall narrow crooked half-timbered townhouse, stone ground floor, two jettied leaning storeys, steep tiled gable with rook weathervane, leaded oriel bay, leaning chimney, rooks on the ridge',
  'Riverbend (east-facing): fisherman’s house roofed with an upturned clinker boat (rust-red bottom, cream stripe, dark topsides), black tarred weatherboard on stone, planked transom with porthole + ship’s lantern, nets, floats, oars, lobster pot',
  'Millrace Mill: water-mill cottage, big overshot wheel on the left fed by a wooden flume into a stone millrace, stone ground floor, timbered upper storey, deep thatch with eyebrow window, hoist loft (lucam) with flour sack, millstone, sacks',
];

// v1 per-cottage personality (buildings.ts PERSONAS): door hood, door kind, hinge side, decorative extras.
const P = (hood, door, hinge, ...extras) => ({ hood, door, hinge, extras });
export const PERSONAS = [
  P('pent', 'panel', 'left', 'ivy', 'pots', 'twopots'),
  P('lintel', 'planks', 'right', 'woodpile', 'herbs'),
  P('arch', 'window', 'left', 'cat', 'barrel'),
  P('pent', 'dutch', 'right', 'dormer', 'pots'),
  P('lintel', 'planks', 'left', 'ivy', 'vane', 'barrel'),
  P('arch', 'panel', 'right', 'woodpile', 'cat', 'wreath'),
  P('pent', 'window', 'left', 'dormer', 'barrel', 'birds'),
  P('arch', 'planks', 'right', 'herbs', 'pots', 'vane'),
  P('lintel', 'dutch', 'left', 'cat', 'woodpile', 'twopots'),
  P('pent', 'panel', 'right', 'ivy', 'dormer'),
  P('arch', 'window', 'left', 'barrel', 'pots', 'birds'),
  P('lintel', 'planks', 'right', 'pots', 'vane', 'herbs'),
  P('pent', 'panel', 'left', 'dormer', 'woodpile', 'wreath'),
  P('arch', 'dutch', 'right', 'ivy', 'cat', 'twopots'),
  P('lintel', 'window', 'left', 'barrel', 'herbs', 'birds'),
];

const R = W - 1; // mirror helper: x' = R - x - w + 1
const houseSpecs = [
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

const footprintOf = (h) => (h.facing === 'south' ? { x: h.x, y: h.y, w: 5, h: 4 } : { x: h.x, y: h.y, w: 4, h: 5 });
const doorOf = (h, fp) => (h.facing === 'south' ? { x: fp.x + 2, y: fp.y + fp.h }
  : { x: h.facing === 'east' ? fp.x + fp.w : fp.x - 1, y: fp.y + fp.h - 1 });

/** 3D record of a building from its 2D footprint (tiles) + door tile + facing. */
function building3d(id, index, name, facing, style, fp, door) {
  const footprint = { x: fp.x, z: fp.y, w: fp.w, d: fp.h };
  let doorPoint, doorNormal;
  if (facing === 'south') { doorPoint = { x: door.x + 0.5, z: fp.y + fp.h }; doorNormal = [0, 1]; }
  else if (facing === 'east') { doorPoint = { x: fp.x + fp.w, z: door.y + 0.5 }; doorNormal = [1, 0]; }
  else { doorPoint = { x: fp.x, z: door.y + 0.5 }; doorNormal = [-1, 0]; }
  return {
    id, index, name, facing, style: { ...style, facing },
    persona: index !== null ? PERSONAS[index] : null, brief: index !== null ? HOUSE_BRIEFS[index] : null,
    footprint, door: { x: door.x, z: door.y }, doorPoint, doorNormal,
    center: { x: fp.x + fp.w / 2, z: fp.y + fp.h / 2 },
  };
}

/** The game's records (the 2D layout, unmoved). House pieces BUILD from these (ctx.record = gameHouses[i] + .placement). */
export const gameHouses = houseSpecs.map((h, i) => {
  const fp = footprintOf(h), door = doorOf(h, fp);
  return building3d(`house-${i}`, i, HOUSE_NAMES[i], h.facing, h.style, fp, door);
});

// =========================================================================================
// LAYOUT DELTAS vs the game (3D town only; docs/TOWN.md §12 is the table). The composer (town.js) moves each piece's
// whole group: rotate by ry (radians, about y, +ry turns local +z toward +x) about the game footprint centre, then
// translate by (dx, dz). Pieces keep building in the game frame; every consumer of `houses` sees the PLACED record.
// =========================================================================================
const DEG = Math.PI / 180;
const SQ = Math.SQRT1_2;
// `door` (optional, GAME frame like the pieces build): the cottage's REAL door when the piece puts it somewhere else than
// the game's wall door (a chamfered corner, a porch): {point {x, z} on the wall plane, normal [nx, nz]}. It must match
// the piece's door anchor (`normal` / `point`); the composer reports a mismatch in stats.doorMismatch. The placed record
// (`houses[i].doorPoint / doorNormal / door`) is this door after the placement - the single source for the game port.
export const LAYOUT_DELTAS = {
  // house-14's door is RECESSED 0.9 m behind the footprint front (the mill's front wall is at local z 1.1; the lucam +
  // race stand in front of it): the piece's door anchor, game frame (5.5, 12.1) n (0, 1) -> placed (6.28, 11.78) SE
  // corner cottages turned 45 deg (user) and, round 6 (§12.9), nudged ~1 m in toward the square so the side-row
  // cottage below each one (house-13 / house-5, staggered toward the square) no longer hides the corner door at yaw 0.
  // house-14's door is RECESSED 0.9 m behind the footprint front (the mill's front wall is at local z 1.1; the lucam +
  // race stand in front of it): the piece's door anchor, game frame (5.5, 12.1) n (0, 1)
  'house-14': { ry: 45 * DEG, dx: 0.9, dz: 0.4, door: { point: { x: 5.5, z: 12.1 }, normal: [0, 1] },
    why: 'corner cottage turned 45 deg (front + recessed door face the square, SE), nudged (0.9, 0.4) m in: clear of house-13' },
  'house-4': { ry: -45 * DEG, dx: -0.9, dz: 0.4, why: 'corner cottage turned 45 deg (front + door face the square, SW), nudged (-0.9, 0.4) m in: clear of house-5' },
  // house-9 7 m south (game footprint 20,30 -> 20,37, into the SOUTH BAY; round 7: 6 m, layout-finish: 7 m, user asked
  // twice: "lower so the centre circle is clearly clear"): its highest point (the gable finial, y 4.74) hides the ground
  // only up to z 30.77 at the gameplay pitch (?occl=1): ~2.3 m of lawn past the plaza kerb (outer edge z 28.5), ~73 px
  // between the kerb and its roof at viewHeight 12 (6 m: 1.3 m / 43 px; 5 m: 0.27 m, read as touching the kerb). Every
  // seat, the dial ring, the whole kerb AND a wide lawn strip south of it read with NO cut-away. Its front wall (z 41)
  // stands on the north verge of the cart road, which swings round its front (ground.js ROAD dips to z 41.05); the door
  // tile 22,41 is on the road's front stretch (rows 40-41), all inside the flat bay floor (ground.js BAY.z1 42.25).
  'house-9': { ry: 0, dx: 0, dz: 7.0, why: '7 m south into the south bay: its roof clears the plaza kerb + ~2.3 m of lawn (no cut-away needed)' },
  // SIDE ROWS (east: 5 behind 6, west: 13 behind 12): turned 12 deg so the gable fronts + chamfer / porch doors face the
  // square and the camera. Round 6 (§12.9, user: "both cottages of each pair AND their entrances visible without the
  // cut-away"): the rear cottage is staggered further toward the square (east: 1.2 m west of house-6; west: 1.8 m east of
  // house-12), the pairs and the lower-ring corner cottages (house-7 / house-11) are spread south so each door has a
  // clear sight line (?vis=1 door rays visible with NO cut-away: house-4 / 5 / 6 1.0, house-14 0.89, house-13 0.78; house-12's door sits
  // behind house-11's oak crown - only the crown's own height could clear it, see §12.9)
  'house-5': { ry: -12 * DEG, dx: -2.0, dz: 1.8, door: { point: { x: 40.6, z: 18.43 }, normal: [-SQ, SQ] },
    why: 'side row: turned toward the square, 2 m west + 1.8 m south (door corner clear of house-6 and of house-4\'s door), SW chamfer door' },
  'house-6': { ry: -12 * DEG, dx: -0.8, dz: 2.2, door: { point: { x: 39.675, z: 24.45 }, normal: [0, 1] },
    why: 'side row: turned toward the square, 2.2 m south (gap to house-5); door in the south porch west of the gable' },
  'house-12': { ry: -25 * DEG, dx: -3.0, dz: 3.0, door: { point: { x: 4.375, z: 24.275 }, normal: [SQ, SQ] },
    why: 'user, 2026-10-16: "pushed left so you can see its entrance without being blocked by the treehouse" (then "door still not visible"): 3 m west + 3 m south and turned -25 deg so the SE chamfer door + wreath face the camera, clear of the oak crown' },
  'house-13': { ry: 12 * DEG, dx: 2.0, dz: 1.9, door: { point: { x: 3.99, z: 18.18 }, normal: [0.694, 0.72] },
    why: 'side row: turned toward the square, 2 m east + 1.9 m south (door corner clear of house-12, mill door clear of it), SE chamfer door' },
  // lower-ring corners: house-7's toadstool cap hid house-6's porch door, house-11 crowded house-12
  'house-7': { ry: 0, dx: 2.5, dz: 1.3, door: { point: { x: 37.52, z: 30.94 }, normal: [-0.883, 0.469] },
    why: '2.5 m east + 1.3 m south: its cap no longer hides house-6\'s porch door; door in the toadstool stalk, facing WSW' },
  'house-11': { ry: 0, dx: 0, dz: 1.8, why: '1.8 m south: room for the west pair (house-12 moved south), less of house-12 behind the crown' },
  // door-only deltas (the piece's real door is not the game's wall door; the cottage itself is unmoved)
  'house-10': { door: { point: { x: 14.966, z: 34.076 }, normal: [SQ, SQ] }, why: 'door in the boot toe chamfer (SE)' },
};
// review-only A/B hook: ?ldx=house-5:dx=-2.5:dz=1.2;house-7:dx=1 overrides deltas (ry in degrees) before anything is
// derived from them (layout tuning with tools/shot.sh ... --q "vis=1&occl=1&ldx=..."); never used by the town itself
if (typeof location !== 'undefined') {
  const q = new URLSearchParams(location.search).get('ldx');
  for (const spec of q ? q.split(';') : []) {
    const [id, ...kv] = spec.split(':');
    const d = (LAYOUT_DELTAS[id] ??= { why: 'ldx' });
    for (const s of kv) { const [k, v] = s.split('='); d[k] = k === 'ry' ? Number(v) * DEG : Number(v); }
  }
}
const moves = (id) => { const d = LAYOUT_DELTAS[id]; return !!d && !!(d.ry || d.dx || d.dz); };
/** Placement of a piece: {ry, dx, dz, pivot {x, z}} (identity for pieces without a delta). */
export function placement(id) {
  const d = LAYOUT_DELTAS[id];
  const rec = gameHouses.find((h) => h.id === id);
  const pivot = rec ? { ...rec.center } : { x: 0, z: 0 };
  return d && moves(id) ? { ry: d.ry ?? 0, dx: d.dx ?? 0, dz: d.dz ?? 0, pivot } : { ry: 0, dx: 0, dz: 0, pivot };
}
/** Map a game-frame point (x, z) of piece `id` to its placed position. */
export function placePoint(id, x, z, pl = placement(id)) {
  const c = Math.cos(pl.ry), s = Math.sin(pl.ry), px = x - pl.pivot.x, pz = z - pl.pivot.z;
  return { x: pl.pivot.x + px * c + pz * s + pl.dx, z: pl.pivot.z - px * s + pz * c + pl.dz };
}
/** Map a game-frame direction [nx, nz] of piece `id` to the placed frame. */
export function placeDir(id, [nx, nz], pl = placement(id)) {
  const c = Math.cos(pl.ry), s = Math.sin(pl.ry);
  return [nx * c + nz * s, -nx * s + nz * c];
}
/** The real door of a game record in the GAME frame: the LAYOUT_DELTAS door override or the game's wall door. */
export function gameDoorOf(r) {
  const o = LAYOUT_DELTAS[r.id]?.door;
  return o ? { point: { ...o.point }, normal: [...o.normal], override: true } : { point: { ...r.doorPoint }, normal: [...r.doorNormal], override: false };
}
function placeRecord(r) {
  const pl = placement(r.id);
  const gd = gameDoorOf(r);
  if (!LAYOUT_DELTAS[r.id]) return { ...r, placement: pl, corners: rectCorners(r.footprint), game: r, gameDoor: gd };
  const f = r.footprint;
  const corners = rectCorners(f).map(([x, z]) => { const p = placePoint(r.id, x, z, pl); return [p.x, p.z]; });
  const xs = corners.map((c) => c[0]), zs = corners.map((c) => c[1]);
  const dp = placePoint(r.id, gd.point.x, gd.point.z, pl), dn = placeDir(r.id, gd.normal, pl);
  const ctr = placePoint(r.id, r.center.x, r.center.z, pl);
  const round = (v) => Math.round(v * 1000) / 1000;
  // door tile: the walkable tile in front of the door (a chamfer door point lies inside the footprint's bounds: step
  // 0.9 m out along the normal; a wall door: 0.5 m as in the game)
  // 0.9 m out along the normal; a wall door: 0.5 m as in the game); a RECESSED door (house-14) keeps stepping out until
  // the tile's centre is outside the cottage
  let out = gd.override ? 0.9 : 0.5;
  const tileIn = (s) => insideHouse({ placement: pl, game: r }, Math.floor(dp.x + dn[0] * s) + 0.5, Math.floor(dp.z + dn[1] * s) + 0.5, 0.05);
  while (out < 3 && tileIn(out)) out += 0.1;
  return {
    ...r,
    // footprint = the axis-aligned bounds of the placed walls (rotated houses: corners has the true shape)
    footprint: { x: round(Math.min(...xs)), z: round(Math.min(...zs)), w: round(Math.max(...xs) - Math.min(...xs)), d: round(Math.max(...zs) - Math.min(...zs)) },
    corners: corners.map(([x, z]) => [round(x), round(z)]),
    door: { x: Math.floor(dp.x + dn[0] * out), z: Math.floor(dp.z + dn[1] * out) },
    doorPoint: { x: round(dp.x), z: round(dp.z) }, doorNormal: dn.map(round),
    center: { x: round(ctr.x), z: round(ctr.z) }, placement: pl, game: r, gameDoor: gd,
  };
}
function rectCorners(f) { return [[f.x, f.z], [f.x + f.w, f.z], [f.x + f.w, f.z + f.d], [f.x, f.z + f.d]]; }
/** Is the point inside a (possibly rotated) placed house? */
export function insideHouse(h, x, z, margin = 0) {
  const pl = h.placement ?? placement(h.id), g = h.game ?? h;
  // back to the game frame
  const c = Math.cos(-pl.ry), s = Math.sin(-pl.ry), px = x - pl.pivot.x - pl.dx, pz = z - pl.pivot.z - pl.dz;
  const gx = pl.pivot.x + px * c + pz * s, gz = pl.pivot.z - px * s + pz * c, f = g.footprint;
  return gx > f.x - margin && gx < f.x + f.w + margin && gz > f.z - margin && gz < f.z + f.d + margin;
}

/** The PLACED house records (3D town truth): footprint / door / doorPoint / doorNormal / center after LAYOUT_DELTAS. */
export const houses = gameHouses.map((h) => {
  const p = placeRecord(h);
  obj('doormat', p.door.x, p.door.z);   // a doormat on every doorstep (built by the house piece)
  return p;
});

// LAYOUT DELTA: the corner cottages are turned 45 deg, so their lanes run DIAGONALLY from the placed door tiles to the
// side lanes at z 18 - a 2-tile staircase (4-connected for tile walking), matching the ground piece's diagonal strokes
// (game: rect(5, 13, 12, 1) / rect(W - 17, 13, 12, 1), horizontal corner-door lanes)
for (const [id, dir] of [['house-14', 1], ['house-4', -1]]) {
  const d = houses.find((h) => h.id === id).door;
  for (let k = 0; d.z + k <= 18; k++) {
    for (const i of d.z + k < 18 ? [0, 1] : [0]) if (get(d.x + dir * (k + i), d.z + k) !== G.plaza) put(d.x + dir * (k + i), d.z + k, G.cobble);
  }
}

export const clocktower = building3d('clocktower', null, 'The Clocktower', 'south',
  S('slate', 'stone', 'side', 'none', '#3a2a1e', false, true, 22), { x: 20, y: 5, w: 5, h: 4 }, { x: 22, y: 9 });
clocktower.brief = 'landmark at the head of the square: stepped plinth, base with a great door, tall clock stage with a big ivory dial (live hands), belfry with its bell, crenellated parade with corner pinnacles, flared slate spire with a gilded vane';

// =========================================================================================
// Dressing (layout.ts §3)
// =========================================================================================
for (let x = 1; x < W - 1; x += 2) if (x < 18 || x > 26) obj(hash2(x, 2, 7) < 0.5 ? 'pinetall' : 'pine', x, 2);
obj('pine', 1, 7);
obj('pine', W - 3, 7);
obj('oak', -2, 34);              // LAYOUT DELTA (game 0,32; user round: out of house-12's front, which moved 2.5 m west)
obj('oak2', W - 3, 35);          // LAYOUT DELTA (game W-4,32; round 6: house-7 moved east over it -> the road's east end)
// LAYOUT DELTA (game: stall_red 9,16 · stall_gold W-12,16 · barrel 12,16 · crates W-14,16): the corner stalls stood on
// the diagonal corner lanes; they now stand ~1.4 m beside them (north-east / north-west of the lane, facing south)
obj('stall_red', 12, 14);
// LAYOUT DELTA round 6 (§12.9, user: the fountain and the top-right stall overlapped): the gold stall moves from in
// front of the fountain (30,14) to the east green by the square (32,21) with the pumpkins + crates as its wares; the
// east bench (W-11,21) sits beside the fountain (29,12) instead
obj('stall_gold', 32, 21);
obj('barrel', 11, 13);
obj('crates', 35, 22);       // LAYOUT DELTA (game W-14,16 -> 36,22 -> round 6: 35,22 beside the gold stall, off house-5's door)
obj('bench', 9, 21);
obj('bench', 29, 12);
obj('fountain', W - 14, 12);          // LAYOUT DELTA (game: W - 12): 2 tiles west, off Ravenscroft's door axis
obj('bush', 19, 8);
obj('bush', 0, 31);              // LAYOUT DELTA (game 2,26; round 4: 2,28; round 6: 2,30; user round: 0,31 - clear of house-12's moved-west front)
obj('bushberry', 37, 30);        // LAYOUT DELTA (game W-3,26; round 6: house-6 / house-7 fill the east edge -> by house-7's door)
obj('barrel', 19, 33);
obj('bush', 25, 33);
obj('stump', 38, 33);           // LAYOUT DELTA (game W-6,33; round 6: under the moved house-7)
// LAYOUT DELTA: green dressing (props owner's proposal, checked at the gameplay camera; docs/TOWN.md §12)
obj('noticeboard', 11, 19);
obj('well', 15, 11);
obj('signpost', 33, 17);   // LAYOUT DELTA (game 39,17; round 6: at the lane fork, house-5 moved west)
obj('cart', 35, 16);       // LAYOUT DELTA (was 36,15, on the diagonal lane; round 6: 1 m west of the moved house-5)
obj('pumpkins', 33, 22);
obj('flowerbarrel', 8, 22);

// LAYOUT DELTA round 6 (§12.9): (W-14,10) -> (30,10) beside the fountain, not behind it; the side-green lamps (7,21) /
// (W-8,21) stood in front of the moved side-row doors -> (8,19) / (36,19) beside them; (W-4,33) stood under the moved
// house-7 -> (37,28) between house-6's and house-7's doors
const SL = [[13, 10], [30, 10], [8, 19], [36, 19], [12, 27], [W - 13, 27], [3, 33], [37, 28]];
export const streetlights = SL.map(([x, z]) => ({ x, z }));
for (const [x, z] of SL) obj('lamp', x, z);

for (let y = 2; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {   // grass decals
  if (get(x, y) !== G.grass) continue;
  const h = hash2(x, y, 11);
  if (h < 0.08) decalList.push({ x, y, name: 'tuft' });
  else if (h < 0.1) decalList.push({ x, y, name: 'tuft2' });
  else if (h < 0.125) decalList.push({ x, y, name: ['flowers_red', 'flowers_violet', 'flowers_white', 'flowers_yellow'][Math.floor(hash2(x, y, 12) * 4)] });
  else if (h < 0.13) decalList.push({ x, y, name: 'mushrooms' });
}
for (let y = 2; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  const c = get(x, y);
  if (c === G.cobble && hash2(x, y, 13) < 0.05) decalList.push({ x, y, name: 'crack' });
  if (c === G.forest && hash2(x, y, 14) < 0.12) decalList.push({ x, y, name: 'leaves' });
  if (c === G.dirt && hash2(x, y, 15) < 0.07) decalList.push({ x, y, name: 'pebbles' });
}

// LAYOUT DELTA: every placed door tile is joined to the lane network (shortest 4-connected path of cobble through tiles
// that are not house / object / forest / water: a lane from every door to the square)
export const doorConnectors = {};
{
  const solid = new Set();
  for (const h of houses) {
    const f = h.footprint;
    for (let z = Math.floor(f.z); z < f.z + f.d; z++) for (let x = Math.floor(f.x); x < f.x + f.w; x++) if (insideHouse(h, x + 0.5, z + 0.5, 0.05)) solid.add(z * W + x);
  }
  for (const o of objs) {
    const d = PROP_DEFS[o.kind];
    if (d.col && !d.walkable) for (let j = 0; j < d.col.h; j++) for (let i = 0; i < d.col.w; i++) solid.add((o.y + d.col.y + j) * W + o.x + d.col.x + i);
  }
  const road = (c) => c === G.cobble || c === G.plaza || c === G.ring || c === G.dirt;
  for (const h of houses) {
    const s0 = h.door.z * W + h.door.x;
    if (road(get(h.door.x, h.door.z))) { doorConnectors[h.id] = 0; continue; }
    const prev = new Map([[s0, -1]]), q = [s0];
    let hit = -1;
    while (q.length && hit < 0) {
      const c = q.shift(), cx = c % W, cz = (c - cx) / W;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, nz = cz + dz, n = nz * W + nx;
        if (!inMap(nx, nz) || prev.has(n) || solid.has(n) || BLOCKING_GROUND.has(get(nx, nz))) continue;
        prev.set(n, c);
        if (road(get(nx, nz))) { hit = n; break; }
        q.push(n);
      }
    }
    let n = 0;
    for (let c = hit >= 0 ? prev.get(hit) : -1; c >= 0; c = prev.get(c)) { put(c % W, (c - (c % W)) / W, G.cobble); n++; }
    doorConnectors[h.id] = hit >= 0 ? n : -1;
  }
}

// =========================================================================================
// Collision (layout.ts §6, town part)
// =========================================================================================
export const collision = new Uint8Array(W * H);
{
  const block = (x, y) => { if (inMap(x, y)) collision[y * W + x] = 1; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (BLOCKING_GROUND.has(get(x, y))) block(x, y);
  for (let x = 0; x < W; x++) { block(x, 0); block(x, H - 1); }
  for (let y = 0; y < H; y++) { block(0, y); block(W - 1, y); }
  for (const b of [...houses, clocktower]) {
    const f = b.footprint;
    for (let z = Math.floor(f.z); z < f.z + f.d; z++) for (let x = Math.floor(f.x); x < f.x + f.w; x++) {
      if (b.placement && b.placement.ry && !insideHouse(b, x + 0.5, z + 0.5)) continue;   // rotated: tile centre inside
      block(x, z);
    }
  }
  for (const o of objs) {
    const d = PROP_DEFS[o.kind];
    if (!d.col || d.walkable) continue;            // walk-through dressing never blocks (§12.9)
    for (let j = 0; j < d.col.h; j++) for (let i = 0; i < d.col.w; i++) block(o.x + d.col.x + i, o.y + d.col.y + j);
  }
}
export const blocked = (tx, ty) => !inMap(tx, ty) || collision[ty * W + tx] === 1;

// 2D lights (reference only: 3D lights come from the pieces' anchors.lights)
export const lights2d = objs.filter((o) => PROP_DEFS[o.kind].light).map((o) => {
  const L = PROP_DEFS[o.kind].light;
  return { x: (o.x * TS + L.dx) / TS, z: ((o.y + 1) * TS + L.dy) / TS, r: L.r / TS, color: L.color };
});

// Decals under solid things / on the wrong ground are dropped (as in the game)
const underProp = new Set();                       // walk-through props still cover their tiles (no decal under them)
for (const o of objs) { const d = PROP_DEFS[o.kind]; if (d.col && d.walkable) for (let j = 0; j < d.col.h; j++) for (let i = 0; i < d.col.w; i++) underProp.add((o.y + d.col.y + j) * W + o.x + d.col.x + i); }
export const decals = decalList.filter((d) => {
  if (collision[d.y * W + d.x] === 1 || underProp.has(d.y * W + d.x)) return false;
  const need = { crack: '=', leaves: ',', pebbles: ':' }[d.name];
  const g = get(d.x, d.y);
  return need ? g === need : g === G.grass || g === G.soil;
}).map((d) => ({ x: d.x, z: d.y, name: d.name }));

// =========================================================================================
// 3D-friendly views of the data
// =========================================================================================
export const ground = grid.map((row) => row.join(''));
export const groundAt = (tx, ty) => get(tx, ty);

export const objects = objs.map((o) => {
  const def = PROP_DEFS[o.kind];
  const c = def.col ?? one;
  const r = { x: o.x + c.x, z: o.y + c.y, w: c.w, d: c.h };
  return { kind: o.kind, x: o.x, z: o.y, rect: r, center: { x: r.x + r.w / 2, z: r.z + r.d / 2 }, def, owner: OBJECT_OWNER[o.kind], walkable: !!def.walkable };
});

/** The paved square (a true circle, r 9 m), the voting circle (r 6.25 m) and the game's "square" target. */
export const PLAZA = { cx: PLAZA_PX.cx / TS, cz: PLAZA_PX.cy / TS, r: PLAZA_PX.rx / TS };
export const CIRCLE = { cx: CIRCLE_PX.cx / TS, cz: CIRCLE_PX.cy / TS, r: CIRCLE_PX.rx / TS };
export const SQUARE = { cx: CIRCLE.cx, cz: CIRCLE.cz + 3, r: PLAZA.r };
export const PLAYER_SPAWN = { x: 22, z: 27 };
export const STORYTELLER_SPAWN = { x: 22, z: 20 };

/** Seat i of n on the voting circle, clockwise from 12 o'clock (-z), exactly like the game's circleSpots(). */
export function seatPos(i, n = 15) {
  const th = (2 * Math.PI * i) / Math.max(1, n);
  return { x: CIRCLE.cx + Math.sin(th) * CIRCLE.r, z: CIRCLE.cz - Math.cos(th) * CIRCLE.r, angle: th };
}

export const PIECE_IDS = [...houses.map((h) => h.id), 'clocktower', 'dais', 'foliage', 'ground', 'props', 'life'];

/** The layout record a piece is built from (ctx.record). */
export function pieceRecord(id) {
  const hp = houses.find((b) => b.id === id);
  if (hp) {
    // pieces build in the GAME frame (the composer applies `placement`); `placed` = where it ends up in the town
    const h = hp.game;
    const mat = objects.find((o) => o.kind === 'doormat' && o.x === hp.door.x && o.z === hp.door.z);
    const doormat = mat && { ...mat, x: h.door.x, z: h.door.z, rect: { x: h.door.x, z: h.door.z, w: 1, d: 1 }, center: { x: h.door.x + 0.5, z: h.door.z + 0.5 } };
    return { ...h, doormat, placement: hp.placement, placed: hp };
  }
  if (id === 'clocktower') return clocktower;
  if (id === 'dais') return { id, circle: CIRCLE, plaza: PLAZA, seats: Array.from({ length: 15 }, (_, i) => seatPos(i, 15)), center: { x: CIRCLE.cx, z: CIRCLE.cz } };
  if (id === 'foliage') return { id, objects: objects.filter((o) => o.owner === 'foliage'), decals, ground, center: { x: PLAZA.cx, z: PLAZA.cz } };
  if (id === 'props') return { id, objects: objects.filter((o) => o.owner === 'props'), streetlights, center: { x: PLAZA.cx, z: PLAZA.cz } };
  if (id === 'ground') return { id, ground, decals, plaza: PLAZA, circle: CIRCLE, center: { x: PLAZA.cx, z: PLAZA.cz } };
  if (id === 'life') return { id, houses, clocktower, objects, center: { x: PLAZA.cx, z: PLAZA.cz } };
  return null;
}

/** Summary used by tests/docs: counts that must match the 2D game. */
export function layoutSummary() {
  const count = (c) => ground.reduce((n, row) => n + [...row].filter((ch) => ch === c).length, 0);
  const kinds = {};
  for (const o of objects) kinds[o.kind] = (kinds[o.kind] ?? 0) + 1;
  return { size: [W, H], houses: houses.length, objects: objects.length, kinds, decals: decals.length,
    tiles: { grass: count('.'), forest: count(','), dense: count('T'), cobble: count('='), plaza: count('o'), ring: count('O'), dirt: count(':') },
    blocked: collision.reduce((a, b) => a + b, 0) };
}
