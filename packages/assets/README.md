# @ct/assets — Hollowmere town, art and generators (world-art)

Everything here is original and generated deterministically by code (TypeScript + `pngjs`; WebP
via `sharp`, pinned to an exact version). No external art, no randomness: re-running the generator
produces byte-identical files.

## Source of truth

- `src/layout.ts` — the handcrafted town as data: 160×96 tiles at 16 px. The outdoor town is
  x 0..95 (`townBounds`); building interiors live in the interior area at x ≥ 98 in the same
  coordinate space. Ground is painted with explicit strokes (roads, lanes, alleys, the circular
  square around the clock tower, river + waterfall, cliffs, forest edge, pond, walled garden,
  graveyard, allotments, windmill meadow, south wall). Every building, tree, lamp and prop has
  explicit coordinates. Exports:
  - `townLayout` — the protocol `TownLayout` contract (collision, 15 cottages `house-0…14`,
    `tavern`, `chapel`, `clocktower`, `shop`, doors, interiors, `bed`/`visitPoint`, square, spawns,
    streetlights). Used by the server (movement/doors/visibility), voice and the client.
  - `townMap` — render data (ground codes, objects, building styles, lights, decals).
  - `PROP_DEFS` — sprite size + collision footprint of every object kind (shared with the generator).
- `scripts/` — the generator:
  - `ground.ts` per-pixel terrain (domain-warped organic edges, geometric square, shores, contact
    shadows, 3/4 walls/hedges/cliffs, interior floors & wallpapered walls), sliced and
    de-duplicated into a tileset.
  - `buildings.ts` 3/4-view buildings (roof/wall materials, timber framing, windows, doors,
    chimneys, front gables; chapel with steeple; clock tower with clock face and belfry).
  - `props.ts` trees, lamps, stalls, graves, crypt, windmill, fences, interior furniture…
  - `characters.ts` layered character sheets + ghosts + Storyteller.
  - `decals.ts` flat decor tiles, light glow texture, favicon.
  - `generate.ts` orchestration, atlas packing, Tiled export, preview.

## Regenerate

Run on hshi-u1 (never on the editing machine), then copy the outputs back:

```
CT_AGENT=world-art scripts/remote.sh pnpm assets:generate
CT_AGENT=world-art scripts/pull.sh packages/assets/generated
```

`pnpm --filter @ct/assets exec tsx scripts/generate.ts --review` additionally writes zoomed crops
and character grids to `packages/assets/.review/` (git-ignored) for art review.

## Outputs (`generated/`)

| File | Contents |
|---|---|
| `town.json` | Tiled-compatible map (orthogonal, 160×96, 16 px): tile layers `ground`, `decor`, `collision` (hidden), object layer `objects` (`building` / `prop` / `flat` image objects with `frame` + `depth` properties, and `light` points with `radius`, `color`, `building`, `facade`). |
| `terrain.png` | Ground tileset (64 columns of unique 16×16 tiles). |
| `decor.png` | Decor tileset (tufts, flowers, crops, cracks, leaves…). |
| `collision.png` | 1-tile tileset for the collision layer (editor visibility only). |
| `objects.png` + `objects.json` | Atlas of buildings (`bld_<id>`) and props; `frames: {name: {x,y,w,h}}`. Sprites anchor at the bottom-left of their anchor tile. |
| `characters.png` + `characters.json` | Character layer sheets. Each sheet is 5 columns (idle, walk1–4) × 4 rows (down, up, left, right) of 24×32 frames, feet anchor (12, 30). Keys: `body/{skin}`, `outfit/{outfit}/{palette}`, `hair/{hair}/{hairColor}` (none for `bald`), `accessory/{accessory}` (none for `none`), `ghost/{ghost}`, `storyteller`. Composite in `layerOrder` (body → outfit → hair → accessory); all layer offsets are 0. |
| `lights.png` | Two 128×128 white radial glows (tinted at runtime). |
| `cast.png` + `cast.json` | The v2 roster: one 5×8 block (idle + walk1–4 × 8 directions) of 32×40 frames per character and per ghost variant; block positions in `sheets` (the arrangement minimises empty blocks, `scripts/cast/sheet.ts`). |
| `cast-portraits.png` + `.json` | The DOM UI's strip: every 'down' frame of the playable cast, the idle 'down' frame of everyone else and of every ghost (exact copies). |
| `*.webp` | (v2.2) Every runtime atlas (terrain, decor, objects, lights, cast, cast-portraits, social, square-props) also as **lossless** WebP, bit-identical to its PNG (`scripts/lib/encode.ts`, checked by `test/atlas-encoding.test.ts`). The client never names a format: it imports URLs from `@ct/assets/runtime`, which picks WebP when the browser decodes lossless WebP and the PNG otherwise. |
| `favicon.png` | 32×32 favicon (clock tower and moon). |
| `preview-town.png` | Full-map render at 1× for eyeballing the art. |

Tests: `packages/assets/test/layout.test.ts` checks the layout contract (doors walkable and
reachable from spawn, enclosed interiors, reachable bed/visit points, distinct cottage styles) and
that generated manifests cover every cosmetic enum value and every referenced atlas frame.
