# Hollowmere: the town contract (every town agent reads this)

The Clocktower Town map ("Hollowmere", a gothic but cozy Blood-on-the-Clocktower / Town-of-Salem village)
rebuilt as a pixel3d scene. Every building, tree, prop and animation is authored in deterministic code, in
the t3ssel8r look of this renderer, while keeping the **exact layout** and the **identity of the v1 2D art**
(each cottage visibly its own architecture, ramp shading lit from the upper-left, gothic but cozy).

Read first, in this order: `docs/PIPELINE.md` (frame, material contract, module APIs, render host),
`docs/TECHNIQUES.md` (technique spec), `docs/ART_DIRECTION.md` (palette discipline, rubric), this file, and
the research notes for your piece (`research/01-holland.md`, `02-t3ssel8r.md`, `03-implementations.md`,
`04-videos.md`; `05`/`06` for anything animated). Reference look: `refs/*` (third-party, view only, never copy).

Source game (**READ ONLY: never edit anything under `~/Desktop/pipgws`**):
- layout: `pipgws/packages/assets/src/layout.ts` (ported to `src/town/layout.js`, §1)
- v1 2D art: `pipgws/packages/assets/scripts/buildings.ts` (generic cottage + clock tower + palettes),
  `scripts/houses/house-<i>.ts` (the 15 hand-designed cottages: **the identity source of truth**),
  `scripts/props.ts` (trees, lamps, stalls, fountain ...), `scripts/ground.ts` (square, dial ring, lanes),
  `scripts/fx/*` (critters, particles, house overlays)
- vision: `pipgws/docs/vision.md`; screenshots: `pipgws/docs/screenshots/v2-terrain-town.png`,
  `v2-terrain-square.png`, `v2-houses-*.png`, `v2-buildings-*.png` (look at them).

Status (integration round, 2026-10-16; fix round 5 in §12.8; **layout round 6 in §12.9** (+ layout-finish: house-9 7 m south, vote camera centred): house-9 in the south bay, side rows re-staggered, walk-through props): all 21 pieces are authored and composed; the lead's integration changes are in
**§12** (layout deltas, the camera-aware cut-away, lights, time of day, quality tier, tools). Read §12 before a fix round.

Status (foundation): every piece file exists as a **stub** (kit-built placeholder cottages, a stone tower, a
plain dial ring, boxes, cone trees, the generic terrain + grass) so the composed town renders from minute one.
**Owners replace their stub.** `engine.stats.pieces[id][3]` reports `stub` until the `stats.stub` flag is gone.

---

## 1. Coordinates and the layout data (`src/town/layout.js`)

- **1 tile = 1 m. world x = tile x, world z = tile y, y up.** Tile (tx, ty) covers x in [tx, tx+1],
  z in [ty, ty+1]. The 2D map's screen-up is world **-z**, so a building's "south" side (the one the 2D
  camera saw) faces **+z**. 2D pixel coordinates / 16 = metres.
- Town area: x 0..45, z 0..37 (45 x 37 tiles) in the game; the 3D town has **TOWN_H = 43 rows** (round 6 + r7, §12.9): rows 36..42 are
  dense forest except the **south bay** (x 15..29, z 34..42) that house-9 stands in. The border ring of tiles is dense forest ('T'). Interiors
  (x >= 47 in the game) are not part of this scene.
- **Anti-tie nudge**: the composer parents every piece under a `town` root offset by `ANTI_TIE` = (+0.0047, 0,
  +0.0071) m (`src/town/town.js`). The texel grid is anchored at the world origin (gameplay pixel centres at odd
  multiples of 1/60 m), so round authoring values (0.05, 0.15, 0.35 ...) would put vertices exactly on pixel
  centres: rasterisation ties that flicker under a pan. Author in layout coordinates and never compensate.
  Anchors are in layout space (computed before parenting); anything you parent to your own group at an anchor
  position lands correctly (a 7 mm discrepancy with `getWorldPosition()` at runtime is harmless).
- **The town floor is flat at y = 0** (x 1..44, z 1..36). Everything stands on y = 0; `ctx.heightAt` exists
  for the forest rim beyond the map (the ground piece may roll the terrain only outside the town).

`layout.js` is a faithful hand-port (same painter strokes, same hash) of the game layout. Exports:

| export | what |
|---|---|
| `ground[37]`, `groundAt(tx, ty)`, `G` | ground codes per tile: `.` grass, `,` forest floor, `T` dense forest, `=` cobble lane, `o` plaza, `O` plaza stone ring, `:` dirt cart road |
| `houses[15]` | `{id, index, name, facing, style, persona, brief, footprint {x, z, w, d}, door {x, z}, doorPoint {x, z}, doorNormal [nx, nz], center {x, z}}` |
| `clocktower` | same shape (landmark, never enterable; door tile (22, 9)) |
| `objects[64]` | every outdoor object: `{kind, x, z (anchor tile), rect {x, z, w, d} (collision, metres), center, def, owner, walkable}`; `owner` = `props` / `foliage` / `house` (doormats); `walkable` = walk-through dressing (barrel, crates, pumpkins, flowerbarrel: never blocks, §12.9) |
| `PLAZA` `{cx 22.5, cz 19.5, r 9}` | the paved round square (true circle); tiles with normalised distance > 0.9 are the stone ring |
| `CIRCLE` `{cx 22.5, cz 19.75, r 6.25}` | the voting circle; `seatPos(i, n = 15)` = the game's seat spot i of n (clockwise from 12 o'clock = -z) |
| `streetlights[8]`, `decals[95]` (tuft, flowers_*, mushrooms, crack, pebbles, leaves), `collision`, `blocked(tx, ty)` | as in the game |
| `pieceRecord(id)` | the record a piece is built from (= `ctx.record`, §4) |

The 15 cottages (clockwise from the top-left; "door tile" = the walkable tile in front of the door):

| id | name | footprint x,z w×d | facing | door tile | style hint (roof / wall / roof type / chimney) |
|---|---|---|---|---|---|
| house-0 | Stargazer's Tower | 8,5 5×4 | south | 10,9 | slate / timber / cross / right |
| house-1 | Wychwood Cottage | 14,5 5×4 | south | 16,9 | thatch / plaster / side / **right (v1)** |
| house-2 | The Weaver's House | 26,5 5×4 | south | 28,9 | red / brick / side / **left (v1)** |
| house-3 | Ravenscroft | 32,5 5×4 | south | 34,9 | plum / stone / cross / left |
| house-4 | Mossbank Cottage | 37,9 5×4 **turned −45° (faces SW), (−0.9, +0.4)** | south → SW | 39,13 → **36,13** | moss / planks / side / right |
| house-5 | Elderhollow Apothecary | 40,14 4×5 **turned −12°, (−2.0, +1.8)** | west (SW chamfer) | 39,18 → **37,20** | blue / plaster / cross / right |
| house-6 | The Lantern-maker's | 40,20 4×5 **turned −12°, (−0.8, +2.2)** | west (S porch) | 39,24 → **38,27** | red / timber / side / left |
| house-7 | Toadstool Hollow | 37,27 4×5 → **39.5,28.3** | west (stalk) | 36,31 → **38,32** | slate / brick / cross / none |
| house-8 | Hearthstone Cabin | 30,29 4×5 | west | 29,33 | thatch / timber / side / right |
| house-9 | Gloamend Clockworks | 20,30 5×4 → **20,37** (south bay) | south | 22,34 → **22,41** | moss / stone / side / **right (v1)** |
| house-10 | The Old Boot | 11,29 4×5 | east | 15,33 | plum / plaster / cross / right |
| house-11 | Fernlea Oak | 4,27 4×5 → **4,28.8** | east | 8,31 → **8,33** | blue / planks / side / right |
| house-12 | Rookery House | 1,20 4×5 **turned +12°, (+0.2, +2.8)** | east (SE chamfer) | 5,24 → **5,27** | red / stone / cross / left |
| house-13 | Riverbend Boathouse | 1,14 4×5 **turned +12°, (+2.0, +1.9)** | east (SE chamfer) | 5,18 → **7,20** | slate / planks / side / left |
| house-14 | Millrace Mill | 3,9 5×4 **turned +45° (faces SE), (+0.9, +0.4)** | south → SE (recessed door) | 5,13 → **8,13** | thatch / brick / cross / right |
| clocktower | The Clocktower | 20,5 5×4 | south | 22,9 | slate / stone (spire) |

Bold = the 3D town differs from the game (§12 layout deltas; pieces still BUILD in the game frame, the composer moves
them). **Chimney side: the v1 house file overrides `style.chimney`** wherever they disagree (houses 1, 2 and 9 are
marked above; critics score criterion 2 against the v1 file, not the hint).

`style` is only the layout's hint (shutter/door paint `style.shutters`, flowers, lantern). **The v1 house file
is the identity**: `record.brief` summarises it (e.g. house-7 = a toadstool, house-10 = a giant boot,
house-11 = a hollow oak, house-13 = an upturned-boat roof), `record.persona` = v1 door hood / door kind /
hinge side / extras. Read your `house-<i>.ts` in full.

The river (ground piece, `ground.js RIVER`, water level −0.32): outside the forest rim down the west side (x ≈ −6..−1)
and bending east along the south behind the cart road (z ≈ 39.5..43, x < 40); a plank bridge carries the road over it at
(−3.55, 35.05), a jetty + boat at (−2.6, 16.6). House-13 / house-14 may point a slipway / mill race toward it.

Door geometry: south-facing doors are centred on the door tile's x (`doorPoint.x = door.x + 0.5`) in the
front wall (z = footprint.z + d). East/west-facing doors are in the side wall at the **south end**
(`doorPoint.z = door.z + 0.5`), see §6 "side doors".

---

## 2. Cameras (`src/town/api.js` `CAMERAS`, `applyCamera`, `focusOf`)

All presets: orthographic, **pitch pi/6**, 640x360 internal (1280x720 captures at scale 2).

| preset | yaw | viewHeight | target (ground point at screen centre) | sees |
|---|---|---|---|---|
| `gameplay` | 0 (looking toward -z, like the 2D game) | **12** (30 px/m, 1 texel = 3.33 cm) | the square (22.5, 0, 19.5) or `?focus=` | the whole circular square (r 9 m: 18 m of 21.3 m width) with ~1.5 m margin; ground z 7.5..31.5. The game follows the player: it never shows the whole map |
| `overview` | 0 | 32 (11 px/m) | (22.5, 0, **10.5**) (round 6 / r7 / layout-finish: house-9's front + door in the south bay in view) | the whole map incl. the tower spire and the forest rim (~25 m past the top edge, ~6 m past the sides) |
| `iso` | pi/4 (from the south-east) | 34 | (22.5, 0, 14.5) | the whole town at a 45° stop |

| `vote` | 0 | **19** | (22.5, 0, **19.5**) = the plaza centre (layout-finish; r7: 21.5 / 9.6 left the south seats on the bottom edge, circle centre 169 px below the frame centre; before: 20 / 7.4) | the whole voting circle CENTRED (kerb ring y 187..525 of 720, circle centre y 364), all 15 seats + the dais + the lawn round it, the tower base / door at the top edge. The tower DIAL is no longer in frame: with a centred circle it needs viewHeight ≈ 33 (the panel's Time clock carries the time) |

`?focus=<piece id>|x,z` moves the target (houses: the PLACED footprint centre at y 0.8; clocktower: y 7.2, the belfry +
dial + door). At every view with viewHeight ≤ 20.5 the camera-aware cut-away (§12) is on. `?yaw=`,
`?vh=` override. At pitch 30°: ground depth d appears as 0.5·d on screen, a height h as 0.87·h, so
buildings read tall relative to the ground (see §6 scale rules).

**At yaw 0 walls facing ±x are exactly edge-on (invisible)**: the game camera sees south faces, roofs and
tops only. Model all four sides anyway (iso preset, the viewer's Q/E rotation, turntables).

---

## 3. Palette (`src/town/palette.js`: `TOWN_PALETTE`, `ramp(name)`, `paintRamp(hex)`, `tonesOf`)

Every colour on screen traces to this table: a ramp `[hi, mid, sh]` (sRGB hex, used by `rampFromTones` and
the kit's `tones`), the outline/rim derivatives the post passes make, or a listed accent. Hues come from the
v1 ramps (`buildings.ts` ROOFS / WALLS / BEAM / STONE / DSTONE / BRASS, `ground.ts` GRASS / COBBLE / PLAZA /
DIAL / KERB), values are lifted into pixel3d's noon range, and **every shadow tone is pulled toward a cool
slate / teal / violet** (warm light, cool shadow; never magenta, never black). The v1 art is darker because it
baked a dusk mood into the pixels; in 3D the mood comes from the lighting presets.

| group | ramp (hi / mid / sh) |
|---|---|
| walls | plaster `#E6DCC4 #C4B89C #7C7A88` · daub (timber-frame infill) `#E0CDA4 #BCA27A #78707E` · stone `#B4ABB4 #8A8190 #565568` · ashlar (dressed: quoins, surrounds, steps, sills) `#D8CCB4 #B0A28C #6E6A76` · brick `#C98466 #A65C46 #5C4654` · plank `#A27B5A #7A5840 #463A46` · timber (beams, frames) `#7E5A44 #5A3E30 #32283A` |
| roofs | slate `#7D86AE #545C84 #343A58` · red `#D07C5C #A8503C #5A3848` · moss `#8AA06A #5E7A50 #34493F` (+ mossTuft `#B4C474 #86A05A #4A6450`) · thatch `#E2C27E #B8924E #6C5A50` · blue `#78A6B8 #4F7A92 #2F4A5E` · plum `#9E7EA8 #6E5480 #3E3352` · copper (verdigris) `#8CC2A8 #5E9A86 #3A5E5E` |
| trim / metal | cream `#F2E8D0 #D8CCB0 #8A8692` · iron `#6E6A7E #46424F #2A2834` · brass `#F0D080 #C9A040 #7A6248` · glass (day) `#8C9CB8 #4E5A78 #2C3248` · glow (night) `#FFE6A8 #FFC46B #C8803C` |
| ground | grass `#94B072 #5E8452 #30524A` (dark / light variants) · forest floor `#6E8E5C #4A6A48 #2A4440` · dirt road `#B08A6A #8E6C52 #584A4E` · cobble lanes `#9A93A2 #767080 #4C4A5C` · grout `#5E5A6A #4C4858 #363444` · plaza setts `#A69EAC #827A8C #545264` · kerb `#B2AAB4 #8C8494 #585668` · dial ring `#C8AE92 #A0846C #625660` |
| foliage | leaf `#86AA5A #5E8A4E #345A4E` (core `#24413E`) · pine (spring, lead fix round 3) `#78A666 #4E7C50 #2E4E44` (core `#203A34`) · autumn (oak2) `#D0A050 #A87838 #5E4A44` · trunk `#8A6E66 #64504F #3E3646` |
| accents (single tones) | flowers red `#D0505A` violet `#A875D7` white `#EDEBDA` yellow `#E6D36A` · berry `#B04A5A` · pumpkin `#E08A3A` · toadstool `#C8403A` · ivory `#F0E6D0` · banners red `#B8463E` gold `#D8AE4A` blue `#4A6E9E` green `#5E8A4E` · blossomPink `#E1BAB0` (flowerRed lerped 55 % to flowerWhite) |
| birds | crow `#46424F #2A2834 #2A2834` (iron mid / sh / sh: rooks, crows, ravens on every roof share it) |
| glowing coloured glass | `glassGlow(v1Hex, mix = 0.4)`: a v1 hue (bottles, rose / stained windows) mixed toward glow[1] at night (house-5's bottles) |
| night | sky `#141B33` · lamp glow `#FFC46B` · holy `#9FB6E8` · fire `#FF9A4A` |

Door / shutter paints: `paintRamp(record.style.shutters)` lifts the v1 hex (e.g. `#6b2f2f`) to a ramp; `paintRamp(v1Hex,
{lightness})` with another lightness (e.g. 0.3 for house-3's `#4a1e1e` door) is an allowed derivative. New
colours are allowed only as ramps added to this table (ask the lead) or as a `paintRamp` of a v1 hex.
Rules (ART_DIRECTION): ≤ 3 tones per material + its line and rim; patterns may darken/lighten a ramp by a
step (0.72..1.07), never introduce a new hue; no gradients on lit surfaces; no pure black or white.

**Night**: `applyTimeOfDay('night')` swaps the ramps toward blue globally; warmth comes only from emissive
glass (kit `glass` layer, written with rtScene.a = 0 so fog / god rays leave it alone) and the PointLights
the composer makes from light anchors (§4).

---

## 4. The piece API (`src/town/api.js`, composed by `src/town/town.js`)

A piece is a module whose **default export is `build(engine, ctx)`** (may be async) returning:

```js
{
  group,                 // THREE.Object3D in WORLD coordinates; the composer adds it to the scene
  update(t, dt) {},      // optional, per frame, a PURE function of t (deterministic, stepped 3-8 fps)
  anchors: {             // WORLD-space hooks for other pieces (mostly 'life'); all optional
    doors:    [{ id, pivot, open(f) }],          // f 0 closed .. 1 open; pivot = hinge Object3D
    chimneys: [Vector3],                         // smoke origins (top of the flue)
    windows:  [{ mesh?, id?, pos: Vector3 }],    // glowing panes (pos just outside the glass)
    lights:   [{ pos: Vector3, color, r, kind: 'lamp'|'lantern'|'window'|'fire'|'holy', flicker? }],
    perches:  [Vector3],                         // ridge ends, chimney tops, signs: birds / cats may sit here
    seats:    [Vector3], spots: { name: Vector3 },
  },
  api: { ... },          // piece-specific controls (below)
  stats: { ... },        // free-form numbers (the composer adds calls / tris / buildMs)
}
```

`ctx` (from `makeCtx`): `id`, `engine`, `layout` (the layout module), `record` (= `layout.pieceRecord(id)`:
the house / tower record, or `{objects, ...}` for props / foliage, `{circle, plaza, seats}` for the dais,
`{ground, decals, plaza, circle}` for ground, everything for life), `seed` + `rng` (seeded per piece id),
`heightAt(x, z)` (0 in the town), `tod` + `night`, `params` (URL params), `registry` (pieces built so far:
`get(id)`, `all()`, `anchors(kind)` → `[{piece, ...}]`), `isolated` (turntable / subset), `palette`, `kit`.

Door anchors may carry `normal: [nx, nz]` and `point: {x, z}` when the real door differs from the record (house-7, house-13's
chamfer): life prefers them. Light anchors may carry `intensity` (default 1.4) and `hug: false` (§12); the composer writes
the PointLight back as `anchor.light` (null when the anchor got no slot).

**Build order**: ground → props → house-0..14 → clocktower → dais → foliage → life. Life is last and sees every
anchor. The composer registers `update`, adds `group`, collects `anchors.lights` and at golden/night turns the
best 12 (`?lights=`) into PointLights (selection §12: one per piece in view - the focus piece first - then by distance
minus a kind bonus; flicker stepped at 8 fps), and sets the kit glass glow.

Required piece APIs (keep them working; extend freely):

| piece | api |
|---|---|
| house-N | `setDoor(f)` (0..1), `setLit(bool)` (windows glow or go dark: occupied / empty houses) |
| clocktower | `setTime(h, m)` (hands are live in the game), optional `ring(t0)` (bell swing from t0); `api.time` (total minutes) is read by house-9's dial (a documented `getTime()` → `[h, m]` is requested from the owner, §12) |
| clocktower (pass-B hook, additive) | `api.dials` = the four dials in WORLD space `[{matrix (world frame of the face: +z out, +y = XII, origin = dial centre), local (the same in the piece's group frame), center, normal, k (1 front, 0.86 sides / back), dial, bezel, surround (radii m)}]`; `api.hands` = the live hands' group (the demo's tower timer hides it while it shows the countdown on the same frames and shows it again after); `api.body` = `{cz, base, stage, belfry, door {w, y0, zFront}, dialY, bellPivotY}` (local dimensions: where the demo hangs its hour-board over the door). Nothing else in the piece changed (docs/DEMO.md §4.9). |
| dais | `seatPos(i, n)`, `setSeat(i, state)` (`'empty'|'alive'|'dead'|'nominated'|'voting'`, or an object `{occupied, dead, ghostVote, nominated, onBlock, voteHand}`), `setPhase('day'|'night'|'vote'|'execution'|'nomination')`, `setPhase('vote', {from, t0, perSeat})`, `setHand(i)`, `setNight(bool)` |
| ground | `heightAt(x, z)`, `terrain` (the createTerrain result or equivalent) |
| props, foliage | none required; expose `spots` / `perches` / `lights` anchors |
| life | `setTimeOfDay?`, demo hooks for `scenes/town-life.js` |

Failure behaviour: if a piece fails to import or build, the composer logs `console.warn('[town] piece ...')`
and puts a grey box on its footprint, so **other owners' renders keep working**; your own piece is rendered
with `strict=<id>` by the tools, where any error fails the page. `normalizePiece` throws if `group` is missing
or a light anchor's `pos` is not a world `Vector3`.

Ownership of shared space: the **ground** piece paints everything flat (terrain, grass, lanes, road, plaza
setts + kerb ring, cracks/pebbles/leaves decals); the **dais** owns everything on the square inside
r ≤ 6.9 m of CIRCLE (dial ring, seat stones, the Storyteller's centre dais); **props** owns `owner: 'props'`
objects (8 lamps, 2 stalls, 2 barrels, crates, 2 benches, the fountain); **foliage** owns `owner: 'foliage'`
objects (20 pines, 2 oaks, 4 bushes, a stump), the forest rim ('T' tiles + the belt beyond the map) and the
mushroom / flower decals that stand up; **houses** own their footprint, doorstep, doormat and decorative
extras next to the walls (woodpiles, barrels, cauldrons ...); the **clocktower** owns its footprint.

---

## 5. The kit (`src/town/kit.js`) — optional, small, shared

One idea: accumulate all static geometry of a piece in a `Builder` (local metres) and emit **one merged mesh per
material layer**: a whole cottage is 2-3 draw calls, and every building in town shares the same 3 shader
programs. Colour is per-vertex tones (`tones: 'stone'` | `[hi, mid, sh]` | `'#hex'`, `tint` 0.94..1.06);
surface texture is a world-anchored, **exactly 1-px** procedural pattern per face (`pattern: plaster | ashlar |
brick | boards | vboards | shingle | thatch | rubble | logs | scales | planks`, `scale`), which fades out under
3 px per period (no moiré at the overview camera).

Layers: `solid` (outline full: walls, roofs, trim), `soft` (outline depth only, no cream rims: thatch bundles,
flowers, ivy, hay), `glass` (no outline; dark toon glass by day, **emissive at night** via `glow: hex` and
`glowKind` 1 steady / 2 flame flicker / 0 never; `setGlowLit(mesh, bool)` per piece; `setNightGlow(engine, f)`
is set by the composer per time of day).

Helpers (all on a Builder, local frame, +z = the wall's outward normal; `b.push(M({at, ry}))` / `b.pop()` for
other walls, `NORMAL_RY['+x']` etc.): `box, hexa (8 arbitrary corners), prism (XY polygon extruded),
cylinder (8/16 segments), add (any BufferGeometry)`, `gableRoof` (stepped courses with a 1-texel lift each =
one dark line + one cream rim per course, ridge cap, attic gable in wall tones; `axis 'x'|'z'`, `sides [1]` for a
lean-to), `hipRoof`, `wallWithOpenings`, `window_` (glass + frame + mullions + sill + shutters, on a plain wall
or `inset` into a hole), `doorway` (jambs, head, hood `pent|arch|lintel`, dark interior that glows when open),
`door(engine, ...)` (separate hinged leaf → `{pivot, open(f)}`), `chimney` (→ smoke anchor), `steps`,
`flowerBox`, `lantern` (→ light anchor), `timbers` (posts / rails / braces), `frameOf(record)` (house local
frame: local +z = door normal, `doorX`, `apply(group)`). Example: `stubHouse` in `api.js`, the stubs in
`src/town/pieces/*`. You may write your own geometry/materials instead — the material contract (PIPELINE) still
applies, and a new `toonMaterial` per mesh costs a shader program each (share materials).

Integration-round options (defaults unchanged, see the kit header): `gableRoof/hipRoof {courses: false}` (one slab per
side: dormers, hoods), `gableRoof {bargeboards: true | {w, h, tones}}`, `Builder.build({layers: {soft: {castShadow:
false}}})`, `door {swing: 'out', maxAngle, pivotInset, strap}` (strap 0.07 avoids flicker on a turned leaf), `lantern
{glass, lightOut, lightDown, nudge}`, `toRoot(b, v)`. **window_(), lantern(), doorway(), chimney() return points in the
current (pushed) frame** - convert them inside `b.push()` with `toRoot`. Copper (lift 0) courses no longer overlap.

Relief rule of thumb: at the gameplay camera 1 texel = 3.33 cm. Offsets of 1-2 texels (0.035-0.07 m) give the
t3ssel8r line-below / rim-on-top pair; thinner relief flickers. Keep slopes and edges on 45°-friendly angles;
round things as 8/16-gons with a flat face toward +z.

---

## 6. Scale, footprint and readability rules

- Character height ~1.4 m (chibi). **Doors 2.0 m** tall × 0.9-1.1 m (tower door ≤ 2.6 m). Ground-floor windows:
  sill 0.9-1.1 m, 0.5-0.8 m wide × 0.6-0.9 m tall; upper windows smaller. Steps: rise ≤ 0.12 m.
- Eaves 2.4-3.0 m (one storey), ≤ 4.8 m (two storeys). Ridges: top row (houses 0-4) ≤ 7 m, tower-houses
  (house-0) ≤ 8.5 m; side rows ≤ 6.5 m; lower ring see the occlusion rule. Clocktower spire top ≤ 19 m.
- Walls stay inside the footprint (inset 0.1-0.2 m is fine). Roof overhangs, porches, hoods, signs, bay windows:
  ≤ 0.6 m beyond the footprint, never into another footprint. Doorstep / mat on the door tile: ≤ 0.4 m deep,
  ≤ 0.15 m tall (the door tile is walkable). Decorative extras outside the footprint: ≤ 0.8 m from it, ≤ 1.2 m
  tall, never on a lane tile ('=') or another door tile.
- **Occlusion rule (the square stays readable)**: anything at world x 15.5..29.5 south of the circle must
  satisfy **h ≤ 0.577·z − 13.6** (h = height above ground of every point at depth z), so a seated character's
  head on the circle stays visible from the gameplay camera. This binds **house-9** (back wall z ≈ 30.2: eave
  there ≤ 3.8 m; ridge at z 32: ≤ 4.8 m; the front gable can rise higher), house-9's chimney, lamps/barrels/
  bushes there and the rim trees at z ≥ 36 (≤ 7.2 m). Houses at the sides of the lower ring don't overlap the
  seats' x range.
- **Side doors** (houses 5-8 west, 10-13 east): at yaw 0 the door wall is edge-on. The entrance must still read
  from the gameplay camera: e.g. a hood / pent porch projecting ≥ 0.5 m toward the door tile (its roof is
  visible), a lantern, the doorstep and path spur, or the door set in a 45° chamfered corner / a little
  south-facing porch whose opening faces the door tile. Check it in `ctx-noon.png`.
- Ground contact: no floating, foundations sink 0.05-0.1 m below y = 0; a plinth course reads well.
- **South rim**: the 'T' row at z = 36 stands directly in front of the lower ring (houses 8-11 fronts at z 32-35)
  and between them and the gameplay camera. Trees there must not hide those houses' doors and fronts in
  `ctx-noon.png`. Rule (measured on the DRAWN top = highest leaf base + one ~0.4 m sprite): **top ≤ (z − 35.4) / 1.73 + 0.1**
  behind a ≤ 0.7 m hedgerow (keeps the cart road and the lower-ring fronts clear); south of the river (z > 43, x < 40)
  top ≤ (z − 42.6) / 1.73. The camera-aware cut-away (§12) also cuts rim trees in front of a focused cottage.
- **Ornaments**: animated ornaments (a finial crow hopping, a vane) may exceed a ridge limit by ≤ 0.15 m; the static
  silhouette must respect it.
- **Foliage look**: trees, bushes and pines use the `src/world/trees.js` / `grass.js` / `flowers.js` look of
  `shots/gallery/{pond-morning,glade-golden}.png` (clumped leaf-sprite canopies, banded light, cream rim,
  stepped wind); pines as tiered leaf clumps too. The cone trees in the stub are placeholders only.

**Performance budget** (colour-pass draw calls / triangles, measured by the composer, `report.txt`):

| piece | calls | tris | notes |
|---|---|---|---|
| each house | ≤ 8 | ≤ 15k | + 1 per animated door/sign; share kit materials |
| clocktower | ≤ 12 | ≤ 30k | hands, bell, door may be separate meshes |
| dais | ≤ 10 | ≤ 15k | seat-state meshes may be separate (≤ 15 tiny ones OK if merged per state) |
| props | ≤ 24 | ≤ 30k | merge per material; instancing for repeats |
| foliage | ≤ 90 | ≤ 400k | trees via `createTree` cost ≤ 4 calls each; the rim must be merged / instanced |
| ground | ≤ 8 | ≤ 450k | grass ≤ 80k instances (`area: viewArea(engine, 3)`) |
| life | ≤ 30 | ≤ 30k | particles 1 call per system |

Whole town at the gameplay camera: colour pass ≤ 300 calls, `--bench 60` mean ≤ 8 ms at 1280x720 on the render
host, shader `programs` constant between frames. (Foundation stubs, measured: gameplay noon 80 colour calls,
1.6 ms mean; night 1.0 ms; overview 115 calls, 1.3 ms; 10-11 programs.) Build time per piece ≤ 300 ms (foliage / ground ≤ 1500 ms).

---

## 7. How to render (the render host is in PIPELINE.md / `tools/remote.sh`)

Shots go to `shots/<your piece id>/`. **Look at every PNG you rely on with the Read tool.** Page or shader errors
= a failed render. Never claim anything you did not render and look at.

```sh
# your piece: 4 isolated yaws (0 45 90 180, noon, no clouds) + gameplay camera focused on it at noon and night
# + a 1x crop, contact sheet and report (calls / tris / build ms / errors). ~10-20 s.
tools/townpiece.sh house-3 shots/house-3
tools/townpiece.sh props shots/props --focus 33,14          # whole-map pieces: pick a focus (piece id or x,z)
tools/townpiece.sh clocktower shots/clocktower --yaws 0,45,135,225 --tods noon,golden,night
tools/townpiece.sh dais shots/dais --q "foo=1"              # extra URL params for every render

# single scenes
tools/shot.sh town-piece shots/house-3/y45.png --q "piece=house-3&yaw=45&tod=night&vh=6"   # zoomed turntable
tools/shot.sh town shots/house-3/ov.png --q "cam=overview&tod=noon"                        # whole map
tools/shot.sh town shots/house-3/iso.png --q "cam=iso&tod=golden"
tools/shot.sh town shots/house-3/raw.png --q "focus=house-3&debug=raw"                     # also outlineDebug=1
tools/shot.sh town shots/life/f.png --times 0,0.17,0.33,0.5 --q "focus=house-3"             # animation frames
tools/shot.sh town shots/house-3/b.png --bench 60 --q "focus=house-3"                      # frame timings
# crawl check: same t, camera moved by whole texels (vignette and clouds off so only the pan differs)
tools/shot.sh town shots/house-3/c0.png --q "focus=house-3&vignette=0&clouds=0&pan=0,0"
tools/shot.sh town shots/house-3/c1.png --q "focus=house-3&vignette=0&clouds=0&pan=3,2"
tools/remote.sh --no-sync python3 tools/crawl.py "shots/house-3/c[01].png" --dx 0,3 --dy 0,2 --scale 2
tools/remote.sh --no-sync python3 tools/sheet.py gif shots/life/f.gif "shots/life/f-*.png" --scale 0.5 --fps 6
```

Whole-town tools (lead, §12): `tools/townshots.sh <out> --set integration|square|night|quality [--jobs 'name:query;...']
[--bench N]` (parallel renders + sheet + report incl. calls / programs / lights / cut / bench) and `tools/towncrawl.sh <out>
--q 'focus=house-3' [--pan 3,2] [--thr 2] [--crop x,y,w,h] [--pieces id,..]` (whole-texel pan crawl with a magnitude
threshold and **per-piece counts** from each piece's screen box: read your own row, not the frame total).
`tools/townpiece.sh` now auto-fits house / tower turntables to their bounding box, renders 4 ctx foci + oak-framed
turntables for foliage, a `ctx-tall-noon.png` (vh 16) for the clocktower, and its ctx shots have the cut-away on.
**True 1x**: `tools/shot.sh ... --size 640x360 --q "scale=1&..."` (with scale=1 at 1280x720 the internal size follows the
window: not 640x360), or `crop-1x.png` from the pack.

Scene params: `scenes/town.js` `?cam=gameplay|overview|iso|vote &focus= &yaw= &vh= &tod=noon|morning|golden|afternoon|night
&pieces=a,b &life=0 &strict=<id>|all &pan=1|x,y &lights=N &vignette=V &clouds=0 &doors=<0..1> &quality=high|low &cut=auto|0|1
&relAz=&elev= (sun override for review) &boxes=1 (per-piece screen boxes in stats) &cutSide=eave|strip|half|full
&meshes=1 (16 heaviest meshes in stats)
(opens every door anchor) &unlit=<ids>|all (api.setLit(false))` (the last two work in town-piece too); `scenes/town-piece.js`
`?piece= &yaw= &tod= &vh= &focus= &with=a,b|all`; `scenes/town-life.js` (life owner's demo scene).

Crawl: with the foundation stubs the square view passes except one stub self-intersection (48 px); avoid
intersecting coplanar faces (z-fighting flips under a pan) and keep relief ≥ 1 texel. A `createGrass` "needs
r=..." warning at the overview/iso cameras is the ground stub's (it fills the whole view); not an error.

Concurrency: 21 agents sync the same tree to the same host. A neighbour's half-edited piece degrades to a grey
box (warning) in your context shots; it never fails your render. Edit only your own files.

---

## 8. Time of day (`TOWN_TOD`, `applyTownTime`)

| preset | sun (relAz, elev; relative to the camera yaw) | clouds | windows / lights |
|---|---|---|---|
| noon | **158°, 46°** (left and a little behind the camera: left walls hi, south fronts mid, right walls shadow; short shadows fall to the visible right side of posts / braziers / stalls) | **scale 0.06, cover 0.53, strength 0.78, wind (0.034, 0.012)**: a one-step lighter patch drifts across the square every ~30 s | dark glass, no PointLights |
| morning | 125°, 33° | cover 0.56 | off |
| golden | **−100°, 27°** (low sun from the north, a little west, behind the tower: long shadows run toward the camera; **the tower's shadow runs down the middle of the square across the voting circle** (fix round 4; at −140 it fell east of it); fronts in warm shadow with glowing windows, golden rims) + foliage `veg` grade (§12.7) | off | glowing glass; PointLights only for fire anchors (reach 3 m), no lamp pools |
| afternoon | 165°, 24° (the previous golden: low front-left sun, fronts lit, shadows fall away; sky preset 'golden') + foliage `veg` grade | off | glowing, PointLights (reach 3 m) |
| night | moon 140°, 45° (blue ramp) | off | glowing, PointLights (reach 4 m), low mist |

Animation (life and any `update`): pure function of `t`, deterministic seeds, stepped at 3-8 fps (doors,
smoke, flags, critters, the bell), nothing gliding sub-pixel; moving objects go through
`engine.camera.snapObjectToTexel(obj)` (PIPELINE). Static solids must be identical between frames.

---

## 9. Ownership

| owner | files |
|---|---|
| town foundation lead | `docs/TOWN.md`, `src/town/{layout,palette,kit,api,town}.js` (+ any non-piece `src/town/*.js`), `scenes/town.js`, `scenes/town-piece.js`, `tools/town*.{sh,mjs,py}` |
| house-N (×15) | `src/town/pieces/house-N.js` (+ `src/town/pieces/house-N/*.js` helpers if needed) |
| clocktower | `src/town/pieces/clocktower.js` (+ `src/town/pieces/clocktower/*.js`) |
| dais | `src/town/pieces/dais.js` (+ `dais/*.js`) |
| foliage | `src/town/pieces/foliage.js` (+ `foliage/*.js`) |
| ground | `src/town/pieces/ground.js` (+ `ground/*.js`) |
| props | `src/town/pieces/props.js` (+ `props/*.js`) |
| life | `src/town/life/*.js`, `scenes/town-life.js` |

Read-only for every town agent: `src/{core,materials,post,world}/*`, `src/chars/*`, `characters/*`, other
scenes, other pieces. Need a change in a shared file (kit, palette, api, layout, a world module)? Put a
`CONTRACT-REQUEST:` line in your final report (and a `// CONTRACT-REQUEST:` comment in your own file); the lead
integrates. Shots: `shots/<piece id>/`. No git commits.

---

## 10. TOWN RUBRIC (critic agent; 12 criteria × 0-2; **ship bar ≥ 19/24 with no zero on 2, 3, 4 or 7**)

Score from the 1280x720 captures (`sheet.png`, `ctx-*.png`, `crop-x3.png`, zoomed turntables), per piece and
for the composed town. For each score < 2 give the crop location (x, y in 1280x720) and the owning piece.

| # | criterion | how to check | 2 = |
|---|---|---|---|
| 1 | **Silhouette & identity** | squint / 25 % size; compare with the v1 house file + `record.brief` | instantly recognisable as that building (the boot is a boot); distinct from both neighbours; the v1 charm survives |
| 2 | **Faithful layout / footprints** | turntable + ctx vs §1 table | footprint, facing, door position, door tile clear, chimney side, overhang limits all as specified |
| 3 | **Palette discipline** | sample colours | every colour traces to §3 ramps / derivatives; ≤ 3 tones per material + line + rim; warm light, cool shadow; no pure black/white, no new hues |
| 4 | **Pixel-art cleanliness** | crop-x3, outlineDebug=1, crawl check | 1-px outlines, no doubled or dashed lines on straight edges, no speckle noise, no shimmer; crawl.py 0 changed interior pixels on a whole-texel pan |
| 5 | **Lighting / shading** | noon turntable, debug=raw | clean 3-tone bands (left hi, front mid, right shadow at noon), correct line sides, cream rims only on convex top edges, shadows read |
| 6 | **Detail density for 640x360** | crop-1x at true size | every feature ≥ 2-3 px at the gameplay camera, no sub-texel clutter; patterns fade cleanly at the overview |
| 7 | **Readability at the gameplay camera** | ctx-noon | the building reads as one object, its door is obvious (side doors too), the square / seated heads stay visible (occlusion rule) |
| 8 | **Cohesion with the neighbours / town** | ctx + overview + iso | consistent scale, roof pitches, materials and light; sits on the ground; the street reads as one village |
| 9 | **Night look** | ctx-night | windows glow (emissive), lanterns warm the ground, silhouettes readable against the night, nothing blown out |
| 10 | **Animation quality** | `--times` frames / GIF | stepped 3-8 fps, pure f(t), nothing glides sub-pixel; static solids identical between frames (pieces without animation: 2 if they offer anchors that life uses well) |
| 11 | **Performance** | report.txt, `--bench 60` | within the §6 budget, programs constant, build time within budget |
| 12 | **Charm / storytelling** | look | cozy-gothic lived-in details that tell the building's story (the cauldron, the yarn, the rooks) without clutter |

## 11. Notes from the user / main session (added while the piece round runs — lead + critics: act on these)

Layout round 6 (§12.9, user: "the low-centre house moved slightly lower still to fully clear the centre circle"): **done** -
house-9 stands 6 m south (r7; round 6: 5 m) in a new south bay and clears the whole circle and the plaza kerb with no cut-away; side rows re-staggered,
fountain / gold stall re-spaced, house-14's recessed door in layout.js, walk-through props.

Fix round 4 (§12.7): side rows turned 12° + staggered, door-approach zones, object-aware roof-off with section interiors, contact
darkening, noon / golden / foliage light retune, shadow-caster culling.

Integration status (§12): side-row occlusion → the cut-away (12.2) + **roof-off of the cottage in front and door-focus for
the player (12.6)**; house-9 over the circle → moved 1 m south + the circle cut (all 15 seats visible in every square view);
corner cottages → turned 45° (12.1); golden-hour long shadows → the new golden (12.4); spring pines → fresher pine ramp
(§3, 12.6); quality tier → 12.4 / **12.6 (low now cuts geometry: ~0.5M frame tris vs 1.0M at the gameplay square)**.
The remaining notes below still apply to owners.

- **Side-row occlusion (lead, integration):** at the gameplay camera (yaw 0) the east/west side-row cottages, whose gable ends
  face the camera, stack in z, so the nearer one hides the one behind it. Example: house-6 (The Lantern-maker's) almost completely
  hides house-5 (Elderhollow Apothecary) in `ctx-noon`. Fix at integration: a camera-aware roof/wall cut-away or dither-fade for
  pieces between the camera and the focus/player (the standard top-down-RPG answer), and/or lower side-row ridge heights /
  narrower gables. Every cottage must be recognisable from the gameplay camera when the player stands in front of it.
- **Foliage (user):** trees and foliage must match the research look of `shots/gallery/{pond-morning,glade-golden}.png`
  (clumped leaf-sprite canopies, banded light, cream rim, wind), and pines must use the same technique, not cones.
- **Mossbank Cottage, house-4 (user):** "should have REAL foliage on it": real sprite grass, moss clumps, ferns, ivy and flowers
  growing on the turf roof and walls, not smooth rings with dots.
- **South forest rim hides the lower ring (foliage + lead):** in every lower-ring `ctx-noon` (house-7, 8, 9, 10…) the placeholder
  pine wall along/after the bottom map edge covers the cottages' doors and faces (e.g. Gloamend Clockworks is only a clock
  peeking over pines). The camera looks north, so anything SOUTH of a building is in front of it. Trees on/after the south
  edge (z > ~33) must be low (bushes, hedges, low shrubs, or cut-away/dither-faded near the player) so the lower cottages'
  fronts, doors and windows stay fully visible; tall pines belong on the north and side rims.
- **Season = SPRING (user, repeated):** all trees/foliage are spring trees, definitely not winter: fresh bright greens with
  yellow-green new growth, full canopies, fruit-tree blossom (white/pink), flowering shrubs, wildflowers. No bare/dead trees, no
  frosty blue-grey or near-black pines (the layout's 'deadtree' kind, if used, becomes a blossoming tree). Critics: score it.
- **Shadows & light quality (user):** the town must have the really nice t3ssel8r-style shadows and related light: crisp
  texel-snapped sun shadows from every building, tower, tree, lamp, stall, fence and character (castShadow + receiveShadow on
  everything solid; no missing or floating shadows, no shadow acne / peter-panning, no shimmer on a whole-texel pan), long
  readable shadows across the square at golden hour (the clock tower's shadow should be a feature), dappled leaf-canopy
  shadows under trees, slow drifting cloud shadows at noon, contact darkening where walls meet the ground, warm window /
  lamp / brazier light pools at night, and god rays / mist only where they add mood. Critics score this under rubric 5.
  **But keep it cheap for the final game release** (players run it in a browser on ordinary laptops, not the 4090): one sun
  shadow map per frame shared by every pass (already the engine contract), shadow box sized to the gameplay view (not the whole
  map), no per-light shadow maps for PointLights (light pools are toon-lit, unshadowed), cloud shadows as the existing shader
  term, and baked/static options wherever things don't move. Lead: add a quality tier (`?quality=low|high`; low = smaller
  shadow map, no god rays / fog, fewer cloud octaves) and report `--bench` for both tiers; anything a tier can't afford
  must degrade gracefully, never disappear in a way that breaks readability.
- **Layout may change (user):** "you may change things slightly to make doorways/buildings more visible/visually appealing."
  The exact v1 placement is NOT sacred any more. Keep the identity (ring of 15 cottages clockwise in seat order around the
  round square, clock tower at the top, voting circle + dais in the middle, a lane from every door to the square), but the
  lead may, at integration: shift, stagger and re-space cottages; turn side-row cottages (e.g. angle them 20-45° toward the
  square / camera so fronts and doors show instead of stacked gable ends — fixes the house-5/house-6 stacking); swap a
  cottage's facing; widen gaps so each door has a clear, readable approach; move/thin trees, stalls, lamps and benches;
  re-route lanes. Prefer moving/rotating whole piece groups (pieces build in their own local frame) over asking owners to
  rebuild; if a facing change needs a new door side, route it to that owner in the fix round. Judge every change at the
  gameplay camera (every cottage + its door recognisable when the player stands in front of it) and the overview.
  Record every change in a "Layout deltas vs the game" table here (piece, old → new footprint / door / rotation) and keep
  src/town/layout.js the single source, so the game's collision/doors can be updated to match when this is ported.
- **MUST FIX: the bottom house covers the bottom of the circle (user, repeated).** From the gameplay camera, house-9
  (Gloamend Clockworks, the lower-ring cottage straight south of the square, x ≈ 20-25, z ≈ 30-34) and its roof hide the
  south seats of the voting circle and the bottom of the plaza. The voting circle must be 100 % visible at the gameplay
  camera, all 15 seats and anyone standing on them. Lead, at integration (layout freedom above): move house-9 (and, if
  needed, the whole lower ring) further south and/or split the lower ring so the south side of the square opens onto a
  lane, with a gap straight below the circle; keep house-9's height within the occlusion cap; and add the camera-aware
  roof/wall dither-fade for anything still between the camera and the circle or the player. Verify with gameplay renders
  centred on the dais and on the south seats; critics: a covered seat is a 0 on rubric 7.
- **Corner cottages point diagonally in (user):** the top-left and top-right corner cottages, house-14 (Millrace Mill,
  x 3-7 z 9-12) and house-4 (Mossbank Cottage, x 37-41 z 9-12), must be rotated about 45° so their fronts and doors face
  diagonally in toward the centre of the square (house-14 turned clockwise toward the south-east, house-4 counter-clockwise
  toward the south-west), like the corners of a ring. Lead: rotate the whole piece groups about their footprint centres,
  nudge them so the rotated footprint clears the lanes / neighbours / stalls, re-route each door lane diagonally to the square,
  update the footprint / door / collision in src/town/layout.js and the "Layout deltas" table. Owners: make sure the
  45°-view of your cottage (iso-y045) reads as its front — it will be the gameplay view now.

## 12. Integration round (lead, 2026-10-16) — what changed, and what each owner should know

### 12.1 Layout deltas vs the game (`src/town/layout.js` `LAYOUT_DELTAS`, the single source)

**Doors (fix round 4): `LAYOUT_DELTAS[id].door` = the piece's REAL door in the game frame (`{point, normal}`; chamfers, porches) and
`houses[i].doorPoint / doorNormal / door` are that door PLACED - layout.js is the single source for doors (`gameDoorOf(rec)`,
`rec.gameDoor`); the composer compares every door anchor with it and lists mismatches in `stats.doorMismatch` (none today).**
Pieces keep building in the GAME frame (`ctx.record` = the game record + `record.placement` + `record.placed`); the
composer wraps a moved piece's group in `<id>-placed` (rotation about the game footprint centre, then the offset), and
moves its world anchors (every Vector3, door `normal` / `point` extras), anything it added to `engine.scene` itself, and
its grass sprites (grass.js reads world `aBase`; the composer bakes the delta in and re-applies it after a re-sort).
`layout.houses` are the PLACED records (footprint = axis-aligned bounds, `corners` = the true rotated outline, `door`,
`doorPoint`, `doorNormal`, `center`); `layout.gameHouses` the unmoved ones; `placement(id)`, `placePoint`, `placeDir`,
`insideHouse(h, x, z)`; collision is rebuilt from the rotated outlines. Port these to the game's collision / doors.

| piece | game | 3D town | why |
|---|---|---|---|
| house-14 Millrace Mill | 3,9 5×4, faces S, door tile 5,13 | turned **+45°** about (5.5, 11), then **dx +0.9, dz +0.4** (round 6): faces **SE**; the real door is **recessed 0.9 m** (`door` override, game (5.5, 12.1), n (0, 1); no more `stats.doorMismatch`) → placed (7.18, 12.18), n (.707, .707), door tile **8,13** | corner cottage points diagonally in toward the square (user); round 6: nudged in so house-13 (staggered east) no longer hides the mill door |
| house-4 Mossbank | 37,9 5×4, faces S, door tile 39,13 | turned **−45°** about (39.5, 11), then **dx −0.9, dz +0.4** (round 6): faces **SW**, door point (37.19, 12.81), door tile **36,13** | corner cottage points diagonally in (user); round 6: clear of house-5 |
| house-9 Gloamend Clockworks | 20,30 5×4, door tile 22,34 | **+7 m south** (layout-finish; r7: +6 m; round 6: +5 m; round 3: +1 m): 20,37 5×4 in the **south bay**, door point (22.5, 41), door tile **22,41** on the cart road's front stretch; its front wall stands on the road's north verge (ground.js ROAD dips to z 41.05) | its gable finial (y 4.74) hides the ground only up to z **30.77** at the gameplay pitch (`?occl=1`): the whole voting circle, the plaza kerb (z 28.5) and **~2.3 m of lawn** south of it read with NO cut-away; **73 px** between the kerb and its roof at viewHeight 12 (r7: 43 px / 1.3 m; round 6: 0.27 m) (user, repeated x4) |
| fountain (props) | anchor 33,12 (rect 33..36 × 11..13) | anchor **31,12** (rect 31..34) | off Ravenscroft's door axis (house-3 critic) |
| house-5 Elderhollow | 40,14 4×5, faces W, door tile 39,18 (west wall) | turned **−12°** about (42, 16.5), then **dx −2.0, dz +1.8** (round 6; round 4: −1.5 / +1.2): corners (38.56,15.44) (42.48,16.27) (41.44,21.16) (37.52,20.33); door = the piece's **SW chamfer** (game frame (40.6, 18.43), n (−.707,.707)) → placed (38.23, 19.90), n (−0.84, 0.55), door tile **37,20** | side row: gable front + door turn toward the square / camera; staggered 1.2 m west of house-6 so its door corner and front clear it at yaw 0 (`?vis=1` door 1.0) |
| house-6 Lantern-maker's | 40,20 4×5, faces W, door tile 39,24 | turned **−12°** about (42, 22.5), **dx −0.8, dz +2.2** (round 6; round 4: −0.5 / +1.3); door = the piece's **south porch** (game (39.675, 24.45), n (0,1)) → placed (38.52, 26.12), n (−0.21, 0.98), door tile **38,27** | side row: ~0.7 m gap to house-5, its porch door clear of house-7's cap (`?vis=1` door 1.0, was 0) |
| house-12 Rookery | 1,20 4×5, faces E, door tile 5,24 | turned **+12°** about (3, 22.5), **dx +0.2, dz +2.8** (round 6; round 4: +0.5 / +1.3); door = the piece's **SE chamfer** (game (4.375, 24.275), n (.707,.707)) → placed (4.91, 26.75), n (0.84, 0.55), door tile **5,27** | mirror of house-6; its door stays behind house-11's oak crown at yaw 0 (§12.9) |
| house-13 Riverbend | 1,14 4×5, faces E, door tile 5,18 | turned **+12°** about (3, 16.5), **dx +2.0, dz +1.9** (round 6; round 4: +1.5 / +1.2); door = the piece's **SE chamfer** (game (3.99, 18.18), n (.694,.72)) → placed (6.32, 19.84), n (0.83, 0.56), door tile **7,20** | mirror of house-5: staggered 1.8 m east of house-12 (`?vis=1` door 0.78, was 0.44) |
| house-7 Toadstool | 37,27 4×5, door in the west wall | **dx +2.5, dz +1.3** (round 6): 39.5,28.3; door in the stalk (game (37.52, 30.94), n (−0.883, 0.469)) → placed (40.02, 32.24), door tile **38,32** | its toadstool cap hid house-6's porch door |
| house-11 Fernlea Oak | 4,27 4×5, door tile 8,31 | **dz +1.8** (round 6): 4,28.8, door tile **8,33** | room for the west pair moved south; less of house-12 behind the crown |
| house-10 Old Boot (door only) | door in the east wall, south end | door in the toe **SE chamfer** (14.966, 34.076), n (.707,.707), door tile **15,34** | the record carries the real door |
| corner lanes | rect(5,13,12,1) / rect(W−17,13,12,1) (z 13 horizontal) | **diagonal 2-tile staircases** from the placed door tiles (8,13)→(13,18) and (36,13)→(31,18) (painted after the houses are placed); ring tiles stay ring | the corner doors face the square diagonally |
| side lanes | rows 18 / 24, x 5..15 and 29..39 | grid rows 18: x 7..15 / 29..37; rows 24: x 6..15 / 29..38 + `doorConnectors` (BFS cobble path from every placed door tile to the lane network); ground strokes z 18.5: x 7.7..16.5 / 28.5..37.3, z 24.5: x 5.8..16.5 / 28.5..38.5, and a door facing away from every lane gets a 0.9 m doorstep spur + a straight connector to the nearest lane point (round 6) | the moved side-row cottages |
| corner props (props) | stall_red 9,16 · barrel 12,16 · stall_gold 33,16 · crates 31,16 · cart 36,15 · signpost 39,17 · bench W−11,21 | stall_red **12,14** · barrel **11,13** · stall_gold **32,21** (round 6: the east green by the square, was 30,14 in front of the fountain) · crates **35,22** + pumpkins 33,22 (its wares) · cart **35,16** · signpost **33,17** · bench **29,12** (beside the fountain) | the corner stalls stood on the diagonal route; round 6: the fountain and the gold stall overlapped (user) |
| foliage objects | bush 2,26 · bushberry 42,26 · oak2 W−4,32 · stump W−6,33 | bush **2,30** · bushberry **37,30** · oak2 **42,35** · stump **38,33** (round 6) | under the moved house-12 / house-6 / house-7 |
| streetlamps (props) | (13,10) (W−14,10) (7,21) (W−8,21) (12,27) (W−13,27) (3,33) (W−4,33) | (13,10) **(30,10)** **(8,19)** **(36,19)** (12,27) (W−13,27) (3,33) **(37,28)** (round 6) | not behind the fountain, not in front of the side-row doors, not under house-7 |
| **south bay** (round 6) | map 45 × 37; cart road rows 34-35, x 2..42 | **TOWN_H 43** (`GAME_H` 37): rows 36..42 dense forest except the bay x 15..29, z 34..41 (lawn); no road behind house-9 (x 19..25, z 34..36 lawn); road arms (17..19, 36..39) / (25..27, 36..39) and the front stretch x 18..26, z 40..41 (dirt; since layout-finish house-9's front wall stands on row 40, its door tile is 22,41); ground: flat bay floor (to z 42.25), river swung south to z ≈ 46.1 there, road polyline dips to z 41, `api.clear()` keeps the bay and house-9's sight line (x 16.5..28.5, z 35..62) free of trees | house-9 south of the old road line, its door on the road |
| **walk-through props** (round 6) | every object blocks its rect | `PROP_DEFS[kind].walkable` / `objects[i].walkable`: barrel, crates (+ sack), pumpkins, flowerbarrel never block (not in `collision`, not in the door-lane search, no decal under them); benches, stalls, cart, well, fountain, noticeboard, signpost, lamps, trees, bushes, stump, houses, tower and dais stay solid | small dressing stopped blocking obvious paths (user) |
| house-13 Riverbend (piece-internal, before round 4) | door in the east wall, south end | door in a 45° **SE corner chamfer**; door tile now 6,19 (above) | the side door reads at yaw 0 |
| house-14 Millrace Mill (piece-internal) | water wheel at the west end | wheel mirrored to the **east end**; flume + sluice inside the footprint; door + hoist loft keep the open side | the wheel faces the square |
| green dressing (props) | — | noticeboard 11,19 · well 15,11 · pumpkins 33,22 · flowerbarrel 8,22 (`PROP_DEFS` + `OBJECT_OWNER` 'props'); the signpost and cart are in the corner props row (**33,17** / **35,16**) | the bare green (props critic); the props owner's proposal, checked at the gameplay camera |

### 12.2 The camera-aware cut-away (`src/town/cutaway.js`) — the side-row / house-9 answer

Every toon material of every piece (life: only its smoke / dust Points, never its people) discards the fragments that
lie IN FRONT of a protected volume along the camera's view ray: (1) the voting circle (cylinder CIRCLE, r 6.9, top 1.6 m)
whenever its centre is well inside the view, (2) the focused cottage (`?focus=house-N`, `houseBox` in town.js): a
south-facing / corner cottage = its game footprint + 0.35 m + the doorstep / door tile up to its top; a **side-row
cottage (doors in an east / west wall) = the same footprint box but only up to 3.2 m** (`?cutSide=eave`, default): the
neighbour in front loses only what hides the focused cottage's walls, door and gable foot, and keeps its roof where that
only hides roof (`?cutSide=strip` = the door wall strip up to 2.6 m, `half`, `full` for A/B), (3) the player
(`?focus=x,z`: a 0.9 × 1.8 m box). The focused cottage's WHOLE body is a **keep box** (`cut.setKeep`): never cut, even where
its roof overhangs the smaller cut box. Inside a volume nothing is cut (the dais banners, the focused house).
- **Rounded window**: a box only cuts inside its screen-space rectangle with rounded corners (radius 0.7 × the shorter half
  side, ≤ 1.6 m) - neighbours lose a soft-cornered window, never a hard rectangular notch.
- **Section rim**: a kept, unprotected, non-sprite fragment whose 4-neighbour pixel ray is cut is darkened to a cool section
  tone, so every cut edge (vertical cut planes included) carries a clean 1-px dark line on top of the outline pass' line.
- **Water**: the water post passes (fountain bowl / basin, wells) skip pixels whose water-plane point is cut - no blue disc
  where the basin was cut away.
- **`cut.isCut(worldPos)`** (`registry.cutaway`, `engine.townCutaway`): the CPU twin of the shader test. **Life: skip perches /
  spots / critter targets for which it returns true** (the bird sitting on house-9's cut roof edge).
Pure world-space geometry per fragment: texel-stable on a whole-texel pan (towncrawl focus house-5 / house-6 / house-12 /
bottom: 0 px > thr on the cut edges and rims), shadows unchanged (casters use the depth material). On at viewHeight ≤ 20.5
(gameplay zooms + `vote`), off for overview / iso / turntables; `?cut=0|1` forces. Sprites are tested at their lighting root
(whole leaves / tufts) and get no rim. Owners: **do not lower or reshape your cottage for a neighbour any more** - the cut
handles stacking. House-11's `api.fadeTargets()` is no longer needed (kept harmless). The floor (y < 0.03) is never cut.
Object-aware cutting (a whole roof shell instead of a slice) is not possible with the town's shared kit materials; the
rounded window + section rim is the answer (a toadstool cap in front of house-6's door keeps a clean-edged bite).

Kit roof courses: any roof kind can be overridden per call, e.g. `gableRoof(b, {..., roof: {lift: 0.06, thick: 0.1}})`
(the 0.035 default lift reads as dashed course lines on faces that look straight at the camera; 0.06-0.085 is solid).

### 12.3 Lights (`installLights`, `src/town/api.js`)
Selection: anchors within 1.6 view heights compete first; ONE light per piece in view (focus piece first, then the
nearest), then the remaining slots by distance minus a kind bonus (lamp 2 m, lantern / fire / holy 1.5 m, window −2 m).
**Golden** is daylight: only `kind: 'fire'` anchors get a PointLight (`TOWN_TOD.golden.lightKinds`), and the props' baked lamp
pools are switched off through `props.api.setLampPool(i, 0)` (windows / lamp glass still glow). **Pools are dithered**: the
cut-away patch replaces the toon point-light band rounding with a world-anchored Bayer 4×4 (screen-texel cells) transition
plus a faint outer band, and rewrites props' `props-lamp-pools` rings the same way (discs grown 25 % for the outer band);
crawl-stable. `anchor.intensity` (default 1.4), `anchor.light` written back, `registry.lights` / `engine.townLights` /
`engine.stats.townLightList` [piece, kind, x, y, z, r]. **Wall-hugging**: a lantern / window light 0.06..0.45 m in
front of its house's (placed) door wall is moved back to 6 cm from the wall plane, so the wall is grazed (no hard-edged
disc on the façade) while the doorstep / ground get the pool; `hug: false` opts out. Lights further out are untouched.

### 12.4 Time of day / quality
`golden` is now the north-west low sun (§8); the old golden is `afternoon`. `?relAz=&elev=` override the sun for review.
`?quality=low`: 2048 shadow map (extent 1.7 × vh), no cloud shadows, no night mist, 8 PointLights (high: 4096, clouds,
mist, 12). Low also stops the ground terrain grid from CASTING (it only receives; the town floor is flat), and `ctx.quality`
('high'|'low') tells pieces to cut geometry. Fix-round bench (render-host RTX 4090, 1280x720, `--bench 60`, gameplay square):
high noon 2.46 ms mean / 1.33M frame tris, night 2.36 ms / 1.32M; low noon 2.25 ms / 1.09M, night 2.14 ms / 1.08M; programs
constant (29-31). The remaining low-tier triangles are the ground terrain grid (131k, drawn in colour + normal) and the
foliage canopy cores (~160k in 3 merged meshes, drawn in shadow + colour + normal): **CONTRACT-REQUEST ground**: at
`ctx.quality === 'low'` build the terrain grid at half resolution (the town floor is flat); **foliage**: at low use fewer /
coarser rim cores (impostor or thinned rim) and split the merged rim chunks spatially so frustum culling drops off-screen
ones. Target <= ~400k frame tris at low.
Golden crawl (focus dais, pan 3,2): 0 px above threshold, ~140 px at delta 1-2/255 on the dais tier / seat-ring rims; the
same in `?toon=band` (delta <= 4), and unchanged by a coarse shadow-box snap (tried, removed): it is the outline pass'
light-aware rim / shadow lookup at reconstructed positions, not the shadow box (outlines owner). Measured on game-host (RTX 3060, 1280x720, `--bench 60`, gameplay square, final run): high noon mean 6.1 /
median 5.9 ms, night 6.9 / 6.7; low noon 5.25 / 5.1, night 5.35 / 5.2; programs constant (29-30), ~275-283 frame calls.
An earlier run while other agents shared the GPU measured 13-16 ms mean, so benches on the shared host are noisy.
Subsets (same earlier, contended run): ground only 2.5 ms, everything but foliage 7.3 ms vs 13 ms for the full town:
foliage is the biggest single cost (see the foliage issue).

### 12.5 Tools
`tools/townshots.sh`, `tools/towncrawl.sh` (§7), townpiece auto-fit / foliage foci / ctx-tall, `scenes/town.js ?boxes=1`,
`cam=vote`. Crawl of the composed town (towncrawl, thr 2/255): square noon 4 px (max delta 3, dais hand tip / lectern),
square night 4 px, focus house-5 noon 0 px, focus house-14 noon 24 px (life walker 1, house-14 rotated sill / wall
corner / wheel 3 spots, river sparkle 1).

### 12.6 Fix round 3 (lead, 2026-10-16): roof-off, door focus, geometry-cutting low tier

**Roof-off (object-aware cut).** The rounded window alone left slivers of a neighbour's roof standing beside the window
(house-5's east roof plane as a free-standing slab in front of Mossbank; house-12 / house-13 remnants in front of the mill).
Now the composer samples every other cottage's volume above `LIFT_Y` (2.0 m) against the focus cut boxes (CPU `isCut`);
a cottage with ≥ 40 % of its upper volume cut (`?liftFrac=`) gets a **lift volume** (`cut.setLifts`, ≤ 4): its footprint +
0.9 m, from 2.0 m up, is cut as a whole - the classic "roof off the house in front" read. Its walls keep the window cut and
the section rim (the rim test sees the lift too, so wall tops get the 1-px dark line). The circle cut is applied after the
test (house-9's roof is never lifted by the voting circle). `?lift=0` disables, `?liftY=` moves the cut height. Typical
lifts: focus house-4 → house-5; house-5 → house-6; house-6 → house-7 (toadstool cap); house-12 → house-11 (crown);
house-13 → house-12; house-14 → house-13.

**Door focus (the game's case; round 4: replaced by the 5.5 m door-approach zone, §12.7).** `?focus=x,z` (the player) within 2.6 m of a cottage's (placed) door point protects that
cottage exactly like `?focus=house-N` (cut box + keep box + lifts) besides the player box (`?doorFocus=0` = player box only).
Verified at house-5's door tile (39.5, 18.5) and house-13's (5.5, 18.5): the door and the whole front read; the cottage in
front (house-6 / house-12) is reduced to its ground storey.

**Low tier cuts geometry** (`?quality=low`; high unchanged in look). Ground: the terrain grid is drawn as 40 m tiles
sharing one vertex buffer (frustum culling in colour / normal / shadow: both tiers), and at low it is built at 1.25 m cells
(1/4 the triangles; heightAt / normalAt follow the same grid). Foliage: cores / trunks merged per material AND per 32 m
chunk (culling, both tiers); at low every visible tree uses the decimated `coreLo`, off-view trees a coarse `coreFar`
(1.3-1.5 m clusters) and no trunk; the river skips its reflection scene render (sky-only reflection); soft dressing
(`*-soft`, turf grass, roof moss clumps, clump leaves, wares, fx) receives but does not cast. Forest placement now uses one
random stream per candidate, so both tiers place the SAME trees (before, low re-dealt the whole rim).
`scenes/town.js ?tris=1` → `stats.triBreak` [piece/mesh, colour+normal tris, shadow tris, calls] per frame.

Bench (render-host RTX 4090, 1280x720, `--bench 60`, programs constant in every run; frame tris = shadow + colour + normal):

| view | high: tris / mean / max ms | low: tris / mean / max ms |
|---|---|---|
| gameplay square noon | 1.00M / 3.0 / 9.9 | 0.51M / 2.4 / 7.6 |
| gameplay square night | 1.00M / 2.6 / 8.8 | 0.50M / 2.7 / 7.2 |
| gameplay square golden | 1.03M / 2.6 / 11.7 | 0.50M / 3.2 / 9.0 |
| focus house-14 (river in view) | 1.76-1.79M / 4.7 / 10.0 | 0.65M / 4.5 / 16.4 |
| player at house-5's door | 1.48M / 3.2 / 11.8 | 0.68M / 3.4 / 10.3 |

(before this round: square 1.33M high / 1.09M low.) On the 4090 the time is not geometry-bound (~300-470 draw calls + post
at 640x360 + JS updaters; run-to-run noise ±0.5 ms), so halving the triangles barely moves the mean there. The remaining
low-tier triangles at the square are the cottages themselves (~155k of kit geometry over 3 passes), the decimated cores
(~77k) and leaf sprites (~40k): the 400k target would need the house owners to thin their merged meshes (CONTRACT-REQUEST
house owners: optional `ctx.quality === 'low'` decimation of patterns-as-geometry, e.g. house-8 logs, house-13 boat ribs).
Estimate for an ordinary laptop iGPU (Intel Iris Xe / UHD 620 class, 1080p window = 640x360 internal + an integer upscale):
low ≈ 8-14 ms (≈ 60 fps on Iris Xe, 30-45 on UHD 620), high ≈ 14-22 ms; the fixed costs are the ~200-330 draw calls and
the 2048 / 4096 shadow map. This is an estimate scaled from the 4090 / RTX 3060 numbers, not a measurement.


### 12.7 Fix round 4 (lead, 2026-10-16): side rows turned, door zones, object-aware roof-off, contact, light retune, caster culling

**Layout (§12.1 table).** Side rows: house-5 / house-6 turned −12° and house-12 / house-13 turned +12°, so their gable fronts,
chamfer and porch doors face the square and the camera. The rear cottage of each pair is staggered 1.5 m toward the square (its
door corner clears the front cottage at yaw 0), and both cottages moved ~1.2-1.3 m south, clear of the rotated corner cottages.
Corner lanes are diagonal staircases. The corner stalls, barrel, crates, cart and signpost stand ≥ 1.4 m off them. Every door
override lives in `LAYOUT_DELTAS[id].door` and `doorConnectors` joins each door tile to the lanes. Collision is rebuilt from
the rotated outlines. Overview: house-5's gable, porch and west wall and house-13's whole boat roof and transom now show
beside / behind house-6 / house-12 (`shots/lead-fix4/r9/ov-noon.png`).

**Door-approach zone** (`town.js doorZone`, replaces the 2.6 m radius): the player protects a cottage while inside a box from its
REAL door out along the door normal 0..5.5 m, ±2.5 m sideways. For side rows the same box also runs along the game door's lane
direction. Verified with 16 renders at 1-5 m out on all four side lanes: the cottage is protected and the one in front is cut in every
render (`shots/lead-fix4/r5/{e18,e24,w18,w24}-*.png`).

**Object-aware cut** (`cutaway.js`). Changes this round:
- `kit.Builder` writes `aTownPart` and `aTownPartS` per primitive: centroid, 2 + bottom y, horizontal size. Other meshes of a
  lifted cottage get them from their connected components (`addPartAttribute`).
- A part whose centroid is inside a lift volume and whose bottom is < 0.6 m below the lift plane goes whole: signs, cap windows,
  chimney pots, ladder rungs.
- SMALL parts (≤ 1.2 m across) are cut or kept whole by their centroid, so there are no chimney slivers or half-signs at a
  window edge. The lift plane still cuts them by fragment.
- `aTownPiece` tags every cottage and tower mesh. The keep box keeps only the focused piece's own fragments, so a neighbour's
  eave or lantern string poking into it is still cut. This fixed the purple "stick" over house-5.
- Lifted cottages get a BackSide **section-interior twin** per mesh (`sectionMaterial`, a flat cool tone, FLAG_NONE, no
  shadow). The far walls' insides read as a dark interior. House-7's back porthole no longer floats over the grass.
- Lift: `liftFrac` 0.25 (was 0.4); lift box = footprint + 1.2 m (was 0.9), so gable chimneys and porches are included.

**Light.**
- Noon is 158° / 46° (160° had a 12 px shadow-edge tie in the whole-texel crawl; 158° is 0 px) with larger, more frequent cloud patches at strength 0.78 (one band step). A 28 s gameplay sequence shows
  patches crossing the square (`shots/lead-fix4/cl/sheet.png`, `cl.gif`).
- Golden is −100° / 27°: the clock-tower on/off diff overlaps the circle at `cam=vote` and at the gameplay camera, a band down
  the middle with the parapet step at its end (`shots/lead-fix4/r2/{vg,sqg}-diff.png`). The spire tip lands past the square
  at any golden elevation.
- Foliage `veg` grade (`TOWN_TOD.*.veg`: ramp multipliers + a shadow-band lift, applied only to the foliage piece's
  materials). At golden, overview canopy p10 / p50 went from (36,48,52) / (43,62,60) to (55,79,57) / (58,86,64). Afternoon
  crowns stay spring green and the blossom stays white / pink (`shots/lead-fix4/r9`).

Crawl at the square (noon, pan 3,2, thr 2): 8 px with max delta 3. The §12.5 baseline was 4 px / delta 3. `contact=0` and
`shadowCull=0` give the same count, so neither pass adds any.

**Contact darkening** (`src/town/contact.js`, post pass order 45, `?contact=0` off). A floor texel with solid geometry rising
within 0.08 / 0.2 m (22 G-buffer taps) is multiplied by 0.70 / 0.84. The bottom texel row of walls and posts gets 0.84. It is
built from world positions only, so it is texel-stable. You get 1-2 px contact lines at wall bases, stall legs, kerbs and
posts (`shots/lead-fix4/r10/{st,h2}-{on,off,diff}.png`).

**Shadow-caster culling** (`installShadowCull`, both tiers, `?shadowCull=0` off). A static piece mesh casts only if its bounds
or its ground shadow (bounds projected along the sun) overlap the view + 1.5 m. Example: house-14 view, low tier, 48 of 97 meshes
culled, shadow pass 86k tris.

Bench (render-host RTX 4090, 1280x720, `--bench 60`, 3 runs each, median of the means; programs constant in every run;
frame tris = shadow + colour + normal):

| view | high: tris / ms | low: tris / ms |
|---|---|---|
| gameplay square noon | 0.87M / 2.65 | **0.36M** / 2.66 |
| focus house-14 | 1.73M / 3.85 | 0.49M / 3.33 |
| player at house-5's door (37.5, 19.5) | 1.21M / 3.03 | 0.45M / 2.57 |

The square is within the 400k low-tier target. The door and house-14 views are still 45-95k over. The remainder is kit house
geometry (house-13 30k + its 30k section twin when lifted, house-12 16k, house-1's moss clumps 18k) and foliage leaves (55k).
That needs the house owners' optional low-tier decimation (§12.6 CONTRACT-REQUEST).

CONTRACT-REQUESTS (round 4):
- **ground**: the side-lane strokes still use the game x ranges (z 18.5 / 24.5 to x 39.8 and from x 5.2); end them at x ≈ 37.5 /
  38.5 and start them at x ≈ 6.5 / 7, under the moved cottages. Paint the corner lanes as diagonal strokes from the placed door
  tiles (7,12) / (37,12) to (13,18) / (31,18), and drop the z 13.5 strokes, which now run under the moved stalls. The spurs
  already follow the real (placed) doors from `L.houses`.
- **house owners**: `ctx.record.gameDoor` (`layout.gameDoorOf`) is the real door. Keep it in sync, or tell the lead when a door
  moves (house-8's fix included). The composer flags drift in `stats.doorMismatch`.

### 12.8 Fix round 5 (lead, 2026-10-16): clean cut-away of the cottage in front, noon clouds

Verifier findings (side-rows-visible, doors-visible, shadows) and what changed. Renders: `shots/lead-fix5/final/` (sheet.png).

- **Neighbour fragments inside the focus box are cut** (`cutaway.js townCutBox`). Before, everything inside a focus cut box was
  protected, including a NEIGHBOUR's wall standing in the box's 0.35 m margin / door apron. That is why house-6's far (north)
  wall stayed as a tall black slab over house-5's bottle counter (it stands ~0.75 m in front of house-5, inside house-5's
  apron). Now only the focused cottage's own fragments (and untagged ones: props, foliage) are protected there; another
  cottage's fragment inside the box is cut. The box itself was already built from the placed (rotated, shifted) outline.
  `focus=37.7,20.0` / `36.5,18.5` / `house-5`: the whole counter, its stone base and the awning show (`final/h5a, h5c, h5`).
- **A lifted cottage is cut uniformly** (one clean cut ground storey instead of window bites, slanted ray slices, orphaned
  wall stubs and posts). Each lift now carries its piece tag (`setLifts([{..., piece}])`, `uCutLiftP`): a lift only cuts
  THAT cottage's fragments (props / lamps / other cottages in its 1.2 m pad are untouched; life's smoke Points are wildcards
  cut above the old 2 m plane). A lifted cottage is exempt from the window/ray cut and is cut at a single plane: **1.1 m**
  (`?liftLow=`) when its ground storey stands in front of the focus (area-weighted test on its real geometry: >= 0.2 m2
  of surface between 1.1 and 2.0 m whose view ray hits the focused cottage's box, `?liftGround=`), else **2.0 m** (only its
  roof / cap hid the focus: house-7's toadstool cap at house-5 keeps its stalk door and windows). Planes are offset by
  13.7 mm (a surface at exactly 2.0 m otherwise splits by interpolation noise). `stats.cut.liftFr[id] = [upper fraction,
  ground m2, plane]`. Typical: focus house-5 → house-6 at 1.1 (a cut room: stone-flag floor, its own soot-dark walls),
  house-7 at 2.0; house-13 → house-12 at 1.1 (its whole stone ground storey, no lone wall + lid); house-14 → house-13 at
  1.1 (the black post in front of the mill door is gone); house-12 → house-11 at 1.1.
- **Section interior in the mesh's own tone** (`sectionMaterial(engine, mesh)`): the BackSide twin is no longer near-black.
  It uses the kit's per-vertex `toneSh` (other meshes: material colour x 0.3), mixed half-way to a limewash interior shade and
  scaled by the time-of-day shadow ramp. A cut wall reads as its own wall seen from inside. Double-sided meshes get no twin
  (it would z-fight with their own back faces), and the twin has a polygon offset so a mesh's front face wins at silhouettes.
- **West / east lanes** (`focus=8,20` → house-13; `37,20` → house-5): house-12 / house-6 keep their whole ground-storey
  footprint (before: a sliver / a black box). At `8,20`, most of house-12 is still hidden by **house-11's oak crown**. That is
  ordinary occlusion by the cottage south of it, not the cut-away. The crown is lifted only when it hides the focused cottage
  (its upper fraction there is 0.22-0.24 < `liftFrac` 0.25). No layout delta this round: moving house-12 / house-6 south
  would put them further under house-11's crown / house-7's cap.
- **Noon cloud shadows**: `TOWN_TOD.noon.clouds.strength` 0.78 → **0.9**. Drifting patches now read in a single gameplay
  frame (`shots/lead-fix5/cloud/on.png` vs `off.png`). `tools/towncrawl.sh --clouds` (new flag: keep cloud shadows on):
  square noon, pan 3,2: **0 px** above threshold (max delta 2).
- **§12.1 table**: the green-dressing row no longer repeats the old signpost / cart spots (the corner props row has them).

Crawl (towncrawl, pan 3,2, thr 2), each compared with `lift=0` at the same view: player at house-5's door 56 px (lift=0:
60; the rest is the house-3 strip at the top edge of the frame and props); focus house-13 20 px (lift=0: 20); focus house-14
16 px (lift=0: 16). The cut-away adds no crawl pixels. Before the double-sided / polygon-offset fix, house-7's twin added
1276 px of stripes.


### 12.9 Layout round 6 (lead, 2026-10-16): house-9 clears the circle, side rows re-staggered, fountain / stall, walk-through props

User: "the low-centre house moved slightly lower still to fully clear the centre circle". Every change is in `src/town/layout.js`
(`LAYOUT_DELTAS`, the painter, `PROP_DEFS`) and the §12.1 table. Renders: `shots/v3-layout/before/` (old layout) and
`shots/v3-layout/r3/` (new), gameplay camera at noon unless noted; numbers from the new review hooks below.

- **house-9 (Gloamend Clockworks) +5 m south into a SOUTH BAY.** "Slightly" is not enough: its gable finial stands ~5.9 m up
  at the front wall, so at the 30° gameplay pitch it hides ground 10 m behind it. `?occl=1` (min over its vertices of
  z − 1.73·y): 24.77 at +1 m (the bottom seats, dial ring and kerb hidden), **28.77 at +5 m**, past the plaza kerb's outer edge
  (z 28.5). No cut-away is needed for any seat or the kerb (`r3/sq-cut0.png`, `r3/south-cut0.png`), and the circle cut no longer
  touches house-9 (`stats.cut.liftFr` has no house-9 entry). The map grows 5 rows (`TOWN_H` 42, `GAME_H` 37): rows 36..41 are
  dense forest except the bay (x 15..29). The cart road dips round house-9's FRONT, so its door opens onto the road as in the
  game. Ground (`ground.js`): flat bay floor (`BAY` rect), forest floor carved out of it, the river's south reach swung to
  z ≈ 45.6 below it, the road polyline dips to z 40 (with full in-town width), and `api.clear()` keeps the bay and house-9's
  sight line (x 16.5..28.5, z 35..62) free of trees. Before that, a 9.7 m pine at (22.0, 55.4) hid the door. Overview target
  7.6 → 9.0 so the bay shows (`r3/ov.png`). Demo: `tools/demo-player.mjs doors` reaches all 16 doors, `fuzz` 0 / 20000 bad
  walks, and a real walk from the spawn (22.5, 27.1) to house-9's door works (`shots/v3-layout/paths.js` → `paths/walk-house9.png`).
- **Side rows re-staggered + neighbours spread** (`?vis=1`: geometric rays toward the yaw-0 camera from 9 points on each real
  door and from 160 of each cottage's own vertices, against every other piece; NO cut-away). Door fraction visible, before → after:
  house-4 1.00 → 1.00, house-5 0.78 → **1.00**, house-6 **0.00 → 1.00** (house-7's toadstool cap hid its porch), house-13
  0.44 → **0.78**, house-14 0.67 → **0.89**, house-12 0.00 → 0.00. East: house-5 (−2.0, +1.8) sits 1.2 m west of house-6
  (−0.8, +2.2), house-7 moved (+2.5, +1.3) east of house-6's porch, and house-4 moved (−0.9, +0.4). West: house-13 (+2.0, +1.9)
  sits 1.8 m east of house-12 (+0.2, +2.8), house-11 moved +1.8 south, and house-14 moved (+0.9, +0.4). The trade-off is
  structural. The doors face the square-side corner, so a rear cottage staggered toward the square hides the corner cottage's
  door, and the corner cottages cannot move further in without touching house-0 / house-3. **house-12's door stays hidden by
  house-11's oak crown** at yaw 0: the crown hides about 10 m of ground behind it across x 2..10, so no move of either cottage
  inside the west strip clears it. The cut-away / door zone handles it when the player approaches. Only house-11's crown
  height could change that, which is the house-11 owner's call. The overview's west row is a little more open
  (house-11 / 12 / 13 spread 0.3-1.5 m south). It is still a dense strip, because three tall roofs share x 1..8.
- **Fountain vs the top-right stall**: the gold stall moved off the fountain to the east green (32,21) by the square, with its
  crates (35,22) and pumpkins (33,22) as wares. The east bench sits beside the fountain (29,12), the lamp behind the fountain
  went to (30,10), and the cart / signpost moved 1-2 m (`r3/ne-cut0.png`). The well stays at 15,11 (moving it west put it behind the red stall).
- **house-14's door**: `LAYOUT_DELTAS['house-14'].door` = the piece's recessed door (game (5.5, 12.1), n (0, 1)).
  `stats.doorMismatch` is gone, and the door tile steps out until it is clear of the cottage (8,13).
- **Walk-through props**: `PROP_DEFS[kind].walkable` (barrel, crates, pumpkins, flowerbarrel) → `objects[i].walkable`. They
  are not in `collision`, not in the door-lane BFS, and have no decal under them. Everything big stays solid (§12.1 row).
- Review hooks (`scenes/town.js` → `town.js`): `?occl=1` (`stats.occl[id]` = [nearest hidden ground z, x range]), `?vis=1`
  (`stats.vis[id]` = [door fraction, body fraction, {blocker: rays}]), `?treeDump=x0,z0,x1,z1` (foliage trees in a rect), and
  `?ldx=house-5:dx=-2:dz=1.8;...` (A/B layout override, review only; layout.js reads it before anything is derived).
  Tools: `shots/v3-layout/probe.py` (vis / occl per config), `check.js` (overlaps, doors, ASCII map), `paths.js`.
- Crawl (towncrawl, pan 3,2, thr 2): square noon **8 px** (max delta 3, same as §12.7). Focus house-9: 16 px, all river
  sparkles and single grass texels. Same camera before / after (focus 6.4,11.4, cut=0, life=0): new layout **4 px**, old
  layout (via `ldx`) 16 px, so the moves add no crawl. At `focus=8,21`, 124 px sit on **house-10's awning**: house-10 is
  unmoved, and `pieces=ground,house-10` alone gives the same 124 px, so this is a piece tie at that camera phase (house-10
  owner).

- **r7 (layout, 2026-10-16, user: "the low-centre house moved slightly lower still to fully clear the centre circle", asked
  again): house-9 +6 m** (was +5). At +5 m it hid ground to z 28.77, 0.27 m past the kerb's outer edge (z 28.5), and its roof
  sat 7 px below the kerb on screen, so it read as touching the circle. Now `?occl=1` gives **29.77**: about 1.3 m of lawn
  between the kerb and the roof. Footprint 20,36 5×4, door point (22.5, 40), door tile 22,40. The map grows one more row
  (`TOWN_H` **43**). The road arms run one row longer (rows 36..39) and the front stretch moves to rows 40..41. In
  `ground.js`, `BAY.z1` is now 42.25, the bay forest cut-out ends at z 42, and the road dip runs to z 41.05. The river's south
  reach dropped 0.5 m (z 46.1 at x 22.5) so a meadow strip stays between the road and the bank. The decal tile bounds in the
  ground shader are now 45 × 43. Cameras (`api.js`): `vote` went from 20 / z 7.4 to **21.5 / z 9.6**. The south kerb was at
  y 735 (off a 720 frame); it is now at y 674 (46 px up), seat 7 at y 630, seat 0's head at y 374, and the whole dial
  (centre about y 183) is in frame. `overview` target moved from 9.0 to **10.0** so house-9's door stays in frame.
  Checked on render-host (`shots/v3-layout-r7/`): `shots/v3-playtest-qa/circle.js` shows 0 changed px in the plaza or circle in
  all 12 framings. The gap between the bottom of the plaza and the top of house-9 is now 37 px at z12, 59 px at z8 and 29 px
  at z16 (was 7 / 13 px). `h9check.js` noon and golden: no errors. `tools/demo-player.mjs` `doors`: 16/16 doors (house-9 at
  22.5, 40.79), and `fuzz`: 0 / 20000. `shots/v3-layout/paths.js`: the walk from the spawn to house-9 works.
  `shots/v3-layout-r7/click9.js`: clicking the roof at (22.5, 36.5, 3.5) walks to the door and enters. `demo-player click`
  still clicks the round-6 spot (22.5, 32.5, 3.5), which is now lawn, so that assertion fails: see the contract requests.

- **layout-finish (layout owner, 2026-10-16; user asked twice, art director: "only ~0.27 m between its roof and the kerb").**
  (1) **house-9 +7 m** (was +6; the 0.27 m figure was the round-6 +5 m state, r7 already gave 1.3 m, the user still read
  it as too close). `?occl=1` house-9 **30.77** (top vertex: the gable finial, y 4.74 at z 38.97): **~2.3 m** of lawn
  between the plaza kerb (z 28.5) and its roof silhouette, cut-away off; on screen at the gameplay camera (viewHeight 12)
  the kerb's south edge is at y 397 and house-9's roof top at y 470 at the spawn: **73 px** (r7: 43 px). Footprint 20,37
  5×4, door point (22.5, 41), door tile **22,41**. No new rows: the front wall stands on row 40 (the front stretch's
  north row), the door tile on row 41, the arms (rows 36..39 + row 40 beside the front corners) are unchanged, row 36
  behind it is lawn. Everything stays inside the existing ground.js bay (flat floor to z 42.25, forest cut-out to 42, road
  dip centre z 41.05, river at z 46.1): the road now runs along the foot of its front wall (its north verge is under the
  cottage) and the door spur (0.9 m) still lands on it. The house-9 piece's door anchor is (22.5, 41), matching the layout
  (demo-play reports it as the piece anchor). Before / after A/B with `ldx` (+6.5 m: 58 px, +7 m: 73 px), then the delta.
  (2) **vote camera centred**: 21.5 / z 9.6 → **19 / z 19.5** (the plaza centre). Kerb ring y 187..525 (centre 356 vs
  frame centre 360), circle centre y 364, seat feet y 247..479, seat heads from y 189; before: kerb 372..671, circle centre
  y 529, seats 7-8 at y 630. The tower dial dropped out of frame (a centred circle with the dial needs viewHeight ≈ 33).
  (3) `overview` target 10.0 → **10.5** so house-9's door (now z 41) keeps a margin above the bottom edge (spire still in).
  Renders (`shots/layout-finish/`, LOOKED AT): `before/` and `after/` `{gameplay-spawn,gameplay-kerb,vote}-noon.png`
  (demo, cut-away off, `cams.js` prints the numbers), `after/*-golden.png`, `after/town-{gameplay,vote,overview}.png`
  (scenes/town, cut 0), `try65/`, `try70/` (the A/B). `grid.js` prints the collision / ground ASCII of a rect.
  Checks on render-host: `cams.js` noon + golden, no console / page / shader errors; `tools/shot.sh town` (gameplay, vote,
  overview) no errors; `tools/demo-player.mjs doors` **16/16** (house-9 at 22.38, 41.63, dist 0.64), `fuzz` **0 / 20000**,
  `walk` ok; `tools/demo-play.mjs` with `--doors house-9,house-10,house-8,house-14 --houses house-9,house-12,house-3`
  (rest skipped): PLAYTEST OK (house-9 walked into, night bed visit, walked out at 22.5, 41.7; door reached from the
  spawn in 17 tiles). Full `tools/demo-play.mjs` (`shots/layout-finish/play/`): 2 failures, neither from this change:
  (a) `doors`: with house-9 1 m further away, the greedy auto pick now takes **house-7** after house-8, and the script's
  tile planner finds no tile within 0.95 m of house-7's stalk door (40.02, 32.24): its walkable door tile 38,32 is
  1.02 m away (tile 39,32 is inside its footprint). The same `--doors house-8,house-7` run fails identically with
  `--q ldx=house-9:dz=6` (the old layout); the real player reaches house-7 (`demo-player doors`, dist 0.75).
  (b) `time`: one shader program added at 19:10 golden (42 → 43) - a time-of-day / material issue, not layout.

CONTRACT-REQUESTS (layout-finish):
- **deploy (tools/demo-play.mjs)**: `walkToDoor`'s goal test (a tile within 0.95 m of the door point) fails for house-7's
  stalk door; also accept the layout's door tile (`layout.houses[i].door`) or use the 1.4 m trigger radius minus a margin.
- **demo lead (docs/DEMO.md, the vote-camera notes near l. 309 and 331)**: the vote camera is now 19 / z 19.5 (circle centred, no
  dial); update the doc text. The follow clamp / grass extent from round 6 still hold (the player reaches z ≈ 41.7).
- **ground** (optional polish, not needed for it to work): the road dip's centre (z 41.05) now runs along house-9's front
  wall (z 41); dropping the three dip points ~0.4 m (z 40.8 / 41.45 / 40.8) would show a little more road in front of the
  stoop. BAY / river need no change.

CONTRACT-REQUESTS (round 6):
- **foliage**: (1) the south hedgerow (z 36.4..36.7, x 0.6..44.6) and the meadow-strip flower drifts (z 37.1..38.4) now cross
  the bay. Plant them only on 'T' tiles (`L.groundAt(floor x, floor z) === 'T'`) or where `gapi.clear()` is false. Today they
  sit on the road arms at x ≈ 17 / 28 and inside house-9's walls. (2) `capH`: inside the bay columns (x 14..31) cap rim trees
  at h ≤ (z − 41.5) / 1.73 instead of relying on `clear()`. (3) `inTown` / `heightAt` / `edgeDist` use 36.1 / 36: read
  `L.TOWN_H` / the bay where it matters.
- **player (demo)**: `src/demo/collision.js` `PROP_SHAPES`: skip objects with `o.walkable` (barrel, crates, pumpkins,
  flowerbarrel). `tools/demo-player.mjs click` clicks house-9's roof at its OLD spot (22.5, 32.5): use the placed record
  (`layout.houses[9].center`, z 37).
- **demo lead**: the wide build camera scatters grass only to z ≈ 34.5. Extend it to z ≈ 41 (the bay). The follow camera may
  clamp: the player can now walk to z 40.6.
- **house-10**: the awning crawl above (124 px at `focus=8,21`, `pieces=ground,house-10`).
- **life**: walkers read `TOWN_H`, so the bay is walkable for them. Check the perches / spots near the moved house-7 / house-9.
- **house-12 pushed left (user, 2026-10-16 evening):** "the house between the treehouse and the boathouse on the left should be
  pushed left more so you can see its entrance without being blocked by the treehouse". Done by the main session: house-12 dx
  0.2 -> -2.5 m (LAYOUT_DELTAS), the west bush 2,30 -> 0,31 and the corner oak 0,32 -> -2,34 (both stood in front of its new
  position). Door rays visible with no cut-away: 0.89 (vis=1). Keep it there.
  Follow-up (user: "rookery house door is still not visible"): house-12 is now ry -25 deg, dx -3.0, dz 3.0 — the chamfer door
  with its wreath faces the camera at yaw 0 (vis=1: 1.0).

## 13. Demo pass B hooks (2026-10-17, the demo's vote camera / tower timer / tower interior; docs/DEMO.md §4.9)

One additive change in `src/town/pieces/clocktower.js` (the `api` object only; the build, the geometry, the hands' own
`setTime` and the anchors are untouched): `api.dials`, `api.hands`, `api.body` (table in §4). Uses in the demo:
- `src/demo/votecam.js` frames the vote camera on the dial that faces it (`dials[i].center / normal / surround`);
- `src/demo/towertimer.js` draws the countdown wedge + hand on all four `dials[i].local` frames (a child group of the
  piece's group), hides `api.hands` while the timer is not idle, and hangs the hour-board from `body.door.zFront` /
  the base cornice (also a child group of the piece's group, so the cut-away / town park treat it as the tower's);
- `src/demo/tower-interior.js` (the walkable clockwork room) is demo-side: the tower piece stays a landmark built the
  same way; the demo's player enters through the piece's own door anchor (`clocktower-door`, unchanged).
Without the hook (an older piece) the demo falls back to the constants of the piece's header (DIAL 5.45 m, stage half
sizes 1.75 x 1.6, body centre z -0.2) for the camera; the dials then keep the time of day and the countdown shows on
the hour-board + the HUD chip only.
