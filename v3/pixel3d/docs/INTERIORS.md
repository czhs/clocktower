# Hollowmere cottage interiors: the contract (interior-kit, 2026-10-16)

You walk into any of the 15 cottages. Each interior is a cozy cut-away "dollhouse" room in the town style (the same
kit materials, tones, 1-px patterns and outlines as the town). It has the cottage's own personality: its walls, its v1
interior palette and furniture list (`pipgws packages/assets/src/layout.ts furnishHouse`, `scripts/ground.ts IPALS`,
`scripts/props.ts`), plus the props from its brief (`layout.js HOUSE_BRIEFS`).

Files (owner: interior-kit unless noted):

| file | what |
|---|---|
| `src/town/interiors/index.js` | the contract: `buildInterior`, `aimLights`, `originOf`, `interiorAt`, `standardRoom`, collision |
| `src/town/interiors/kit.js` | `Room` (shell, walls, cut-away variants), `FURNITURE`, `WALL` pieces, palettes, the glow material |
| `src/town/interiors/house-0.js` | **reference interior**: the Stargazer's Tower |
| `src/town/interiors/house-1..14.js` | **stubs** (the standard room + 1-2 signature pieces). Builders replace them |
| `scenes/interior.js` | viewer: `index.html?scene=interior&house=3&tod=night` |
| `shots/interiors-kit/` | renders (r2: house-0 noon / night / yaw 45; r3: all 15 + `sheet-noon.png`; r4: night, with town, character) |

## 1. Using an interior (demo / game side)

```js
import { buildInterior, aimLights, interiorAt } from './src/town/interiors/index.js';
const it = await buildInterior(engine, 'house-3', { tod: 'night' });   // ~25-50 ms, 14-17 draw calls, 4-6k tris
engine.scene.add(it.group);                                           // the caller adds it
engine.onUpdate((t, dt) => it.update(t, dt));                        // cut-away by camera yaw + animations
engine.camera.set({ target: it.camera.target, yaw: it.camera.yaw, pitch: it.camera.pitch, viewHeight: it.camera.viewHeight });
player.teleport(it.spawn.x, it.spawn.z, it.spawn.facing);
// while inside: it.collision.move(pos, dx, dz, R) / free / nearestFree / sdf (world x, z)
// leaving: Math.hypot(p.x - it.exit.x, p.z - it.exit.z) < it.exit.r  ->  teleport(it.townDoor.x, it.townDoor.z, it.townDoor.facing)
const restore = aimLights(engine.townLights, it, night ? {} : { kinds: ['fire'], scale: 0.85 });   // restore() on leaving
it.setTimeOfDay('night');                                             // the light outside the windows
```

`interior` fields. All positions are WORLD coordinates. Facing is in radians: 0 = +z (toward the yaw-0 camera), `atan2(dx, dz)`.

| field | meaning |
|---|---|
| `group` | THREE.Group placed at the interior's own origin `originOf(i)` = (200 + 30 i, 0, 20) + the town's ANTI_TIE nudge. It never overlaps the town: the terrain ends at x ~102. `interiorAt(x, z)` gives the interior index (or null) |
| `origin`, `room {w, d, h, t, doorW}` | room-local origin = the floor centre. The default room is 9 x 6 m, walls 2.9 m (house-0: 3.2 m), wall thickness 0.3 m, doorway 1.1 m |
| `floor`, `colliders` | world rects `{x0, z0, x1, z1, kind}`: walls + furniture, axis-aligned |
| `collision` | `{R 0.28, sdf, free, move(pos, dx, dz, r), nearestFree}`. It is the floor plus the doorway gap, minus the furniture. `move` slides along edges in sub-steps of at most 8 cm |
| `spawn` | just inside the door, facing into the room (`facing` PI) |
| `exit {x, z, r}` | the doorway gap in the front wall. Stepping into it walks you out |
| `townDoor {x, z, facing}` | 0.9 m in front of the PLACED town door (`layout.houses[i].doorPoint/doorNormal`), facing away from it |
| `camera {target, viewHeight, yaw 0, pitch PI/6}` | the dollhouse view: the whole room, the back wall's beams and the front stub. vh is about 6.2-6.5 (about 55 px/m; the town is 30) |
| `bed {x, z, y, facing}`, `visitPoint {x, z, facing}` | night visits: the game's bed / visitPoint, beside the bed, on free floor |
| `spots` | spawn, bed, visit, plus house extras (house-0: telescope, hearth, table) |
| `lights [{pos, color, r, kind, intensity}]` | fire / lantern / candle anchors. **An interior never creates PointLights**, because a new light count recompiles every shader. Re-aim an existing pool with `aimLights` |
| `update(t, dt)`, `setYaw(yaw)` | every wall whose inward normal points away from the camera drops to its 0.42 m stub with a dark section cap. At yaw 0 that is the front wall (the doorway); at 45° it is front + right. Uses `engine.camera.targetYaw` |
| `setTimeOfDay(tod or hex)` | the window light (`kit.WINDOW_SKY`: morning / noon / afternoon / golden / night) |
| `dispose()`, `stats {calls, tris, buildMs, colliders, lights, stub, failed}` | |

A house module that fails to import or build falls back to the standard room, with a `console.warn` (not a page error),
so the demo can always enter. `buildInterior(..., {strict: true})` rethrows; the viewer uses this.

## 2. Look and light

- The dollhouse: back wall + side walls at full height, the front wall cut to a stub with the doorway and doormat. The
  side walls are edge-on at yaw 0, so they read as the game's dark wall caps. Each wall has a timber cap beam; the back wall
  has a ceiling beam with joist ends. There is no ceiling: the town sun lights the room like a dollhouse, and the walls
  cast real shadows into it. Around the room is a flat night-sky void (`interior-void`, no outline). Under the cut edges
  is a rubble foundation lip.
- Walls follow the cottage's exterior `style.wall`, in its v1 interior palette (`INTERIOR_PALETTES`, the v1 IPALS lifted
  with `paintRamp`):
  - timber: limewash with timber posts over a painted dado
  - plaster: striped wallpaper over a wainscot
  - stone: rubble, with a flagstone floor
  - brick: brick dado under limewash
  - planks: painted boards
- **Glow material** (`interiorGlowMaterial`, ONE extra shader program for every interior). It covers kit 'glass'-layer
  geometry that glows day and night: `glowKind` 1 = steady, 2 = flame flicker at 8 fps, 3 = window light × `uIntWin`.
  The town's kit glass only glows at night, which is wrong for hearths, and its windows would glow warm at night. The
  interior's windows show the sky outside instead: pale by day, deep blue at night.
- Lights: the hearth (r 4.6), candles / lanterns / sconces (r 1.8-3.2). `buildInterior` "wall-hugs" any light within
  0.5 m of a wall to 6 cm (fire 12 cm), like the town's `hugWall`, so lights don't paint hard discs on the plaster. By day
  the viewer aims only `kinds: ['fire']`; candle pools on sunlit walls read as stains.
- Measured (render-host, house-0, 1280x720): 17 interior meshes, 5.9k tris, a 39-call frame, 9 programs alone. With the whole
  town built first (`?town=1`): 28 programs, no errors, and the interior looks the same. The cut-away patch on the shared
  kit materials never cuts at x ≥ 200.

## 3. Writing a house module (builders)

```js
export const ROOM = { w: 9, d: 6, h: 3.2, wall: 'timber', pal: 0 };    // optional; defaults from the layout record
export default function build(room, ctx) {
  const { FURNITURE: F, WALL: Wl, CLOTH, GLOW, TOWN_PALETTE, paintRamp, M, kit } = ctx;
  room.shell({ windows: [{ x: -2.5, w: 0.75, h: 1.35, arch: true, curtains: room.pal.paint }], dado: 0.9,
               wallTones: { upper: { tones: room.pal.wash, pattern: 'plaster' }, lower: { tones: 'stone', pattern: 'rubble' } } });
  Wl.fireplace(room, { wall: 'back', x: 0.75 });
  F.bed(room, { x: -3.9, z: -1.95, quilt: 'blue' });
  room.light({ pos: [x, y, z], color: GLOW.candle, r: 2.2, kind: 'lantern' });   // room-local
  room.spot('anvil', x, z, facing);
  return { bed: {x, z, y, facing}, visit: {x, z, facing}, extras: [animatedGroup], update(t) {} };   // all room-local, optional
}
```
Or build on the game's room: `ctx.standard({ ...options })`. Its options are in the `standardRoom` header in index.js:
- `skip: [...]`
- `bed`, `rug`, `table`, `tall`, `fireplace`
- `slot3`: the back-wall slot at tiles 3-4. It can be 'window', 'shelf', `[WALL fn, opts]` or `fn(room, x)`
- `decor`, `extra(room, P)`

`P(dx, dy)` = `room.tile(dx, dy, {mirror})` maps the game's furnishHouse tiles onto room metres, mirrored for odd houses.

- **Room frame**: x is left → right, z is back wall (−D/2) → front (+D/2), y is up. The floor is at y 0; walls stand
  outside the floor rect. `room.b` (solid / soft layers) and `room.g` (glow) are kit Builders for free-standing things.
  `placed`-style furniture takes `{x, z, ry}`, where local +z is the piece's front.
- **Wall pieces** (`WALL.*`, `{wall: 'back'|'left'|'right', x along the wall seen from inside, y}`) go into that wall's
  builders, so they hide with the wall in the cut-away. Side-wall pieces are edge-on at yaw 0: prefer the back wall
  for anything that must read.
- FURNITURE: `bed` (wide, quilt, frame), `nightstand`, `table` (round, items, extra(b, g, top)), `chair`, `stool`,
  `wardrobe`, `bookshelf` (ornaments), `chest`, `barrel`, `plant`, `rug` (oval, pattern diamond/stripes), `doormat`,
  `hangingLantern`, `candelabra`, `telescope` (ry, pitch), `globe` (globe/orrery), `loom`, `workbench` (extra),
  `cauldron`, `sacks`, `logs`.
- WALL: `fireplace` (w, tones, mantel), `shelf` (items: jar, potion, potion:N, book, globe, orrery, candle, clock, skull),
  `frame` (picture, starchart, map, mirror), `clock`, `gears`, `oars`, `net`, `herbs`, `sconce`, `ladder`.
- Animated parts go in a separate small group returned in `extras`, driven by `update(t)` as a pure, stepped function of
  t (house-0's armillary and moon mobile turn at 8 fps).
- Rules (TOWN.md §3/§5):
  - palette ramps or `paintRamp(v1Hex)` only, ≤ 3 tones per material, tints 0.94-1.06
  - share the kit materials; no new material per mesh. The glow material is the one exception, and it is shared
  - relief ≥ 1-2 texels; deterministic code (`rng(seed)`)
  - look at your renders: `tools/shot.sh interior shots/<you>/x.png --q "house=N&tod=night"` (also `yaw=45`, `char=wanderer&at=x,z`, `town=1`)
- Keep the doorway (front wall gap at x 0) and the spawn area (z D/2 − 0.65) free. Collisions come from the furniture
  helpers. Add your own with `room.solid(x0, z0, x1, z1)`.

## 4. Status
- house-0 Stargazer's Tower: complete (reference). It has:
  - lilac limewash timber walls over a rubble course, two arched curtained windows
  - the hearth in the chimney wing, star charts, an orrery shelf
  - a brass telescope on a tripod, a bookcase of atlases
  - a table with a sky map and a turning armillary, a midnight-blue rug with a gold ring
  - a crescent-moon mobile, a lantern, a sconce, the bed under a starry violet quilt
  - a barrel of rolled charts, a chest
- house-1..14: working stubs (enterable, collidable, lit), each with a signature or two:
  - 1: cauldron + herbs
  - 2: loom + wool
  - 3: candelabra + mirror
  - 4: plants + sacks
  - 5: two potion shelves + cauldron
  - 6: workbench + lanterns
  - 7: oval rug
  - 8: wide hearth + logs
  - 9: gears + clock + workbench
  - 10: bench + shelf
  - 11: ladder + ferns
  - 12: candelabra
  - 13: oars + net + barrel
  - 14: gears + sacks

  Builders give each its own room.
- Not wired into the demo yet: `src/demo/*` is not this owner's code (see the contract requests in the kit report).


## USER REQUEST (2026-10-16, highest priority)
Every interior must be VERY visually distinct, with its own style and AMBIANCE, and each room should almost tell a
story hinting at the town's lore. Follow docs/LORE.md (inhabitants, story props, shared motifs, per-house ambiance, and the
distinctness rules: vary room shape / fireplace / floors / walls / lighting recipe / an animated ambiance element; the 15
thumbnails must be tellable apart at 25 %). The kit's standard room is a starting point, not a template to repeat.
