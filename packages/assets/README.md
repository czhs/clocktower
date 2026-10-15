# @ct/assets — Hollowmere town, art and generators (world-art)

Everything here is original and generated deterministically by code (TypeScript + `pngjs`).
No external art, no randomness: re-running the generator produces byte-identical files.

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
| `favicon.png` | 32×32 favicon (clock tower and moon). |
| `preview-town.png` | Full-map render at 1× for eyeballing the art. |
| `ai.json` | Which atlas frames are AI remasters (job, silhouette IoU) and which were rejected. |
| `ambient.json` | Ambient anchors from the building sprites: chimney mouths (smoke) and the clock face (live hands). |
| `presets.json`, `presets/<id>.png`, `<id>-ghost.png`, `<id>-portrait.png` | Premade characters (`src/presets.ts`): standalone 120×128 sheets (same grid/anchor as `characters.json`), ghost variants and 48×48 portraits. The same sheets are in `characters.png` as `preset/<id>` and `preset/<id>/ghost`. |

Tests: `packages/assets/test/layout.test.ts` checks the layout contract (doors walkable and
reachable from spawn, enclosed interiors, reachable bed/visit points, distinct cottage styles) and
that generated manifests cover every cosmetic enum value and every referenced atlas frame.

## AI remasters (`ai/`)

Selected sprites are remastered with **gpt-6-astra** (OpenAI, through the Codex CLI's built-in
`image_gen` tool) from the procedural originals, then cut back deterministically into drop-in
frames. The procedural generator stays the source of geometry; AI frames only replace pixels.

```
ai/scripts/jobs.ts       job list: frames per reference sheet, canvas, scale, enabled switch + review note
ai/scripts/refs.ts       hshi-u1: reference sheet (procedural frames upscaled on #FF00FF) + context crop + prompt
ai/scripts/codex-job.sh  Mac: codex exec -m gpt-6-astra -C ai/staging/<job> -s workspace-write -i ref.png -i context.png
ai/scripts/cli.ts        hshi-u1: `ingest <job>` (raw -> ai/raw/<job>.png ≤1024 px + .json + ai/prompts/<job>.md), `review <job>`
ai/scripts/remaster.ts   deterministic post-processing + validation, applied by scripts/generate.ts
ai/prompts/<job>.md      the exact prompt that produced ai/raw/<job>.png
ai/raw/<job>.png/.json   model output (nearest-downscaled to ≤1024 px), model, tool, date, original size
ai/staging/              scratch (git-ignored): refs, codex logs, out.png, compare.png
```

How codex returns images: `image_gen` writes the PNG to `~/.codex/generated_images/<thread-id>/<call-id>.png`
(1254×1254 for square requests, 1536×1024 / 1024×1536 for wide/tall; the requested size is not
honoured exactly). The prompt asks codex to copy it to `out.png` in its workdir (allowed by the
workspace-write sandbox) and to print both paths. The model sometimes returns real alpha instead
of the requested magenta; both are handled.

Post-processing (`remaster.ts`, per frame): map the frame's reference cell into the raw image →
background by alpha or chroma key → content-bbox alignment onto the procedural frame's bbox (keeps
footprint, anchor and bottom edge) → detect the model's own pixel grid (period + phase per axis
from colour-edge energy) and sample each target pixel at its cell centre (median, magenta despill)
→ median-cut palette of the sprite's own colours (24–64) → remove stray pixels → keep the
procedural soft contact shadows. Validation: silhouette IoU ≥ 0.8 vs. the procedural frame and a
grounded bottom edge; failures keep the procedural frame and are logged. Terrain jobs fill the
whole tile and are made seamless (separable half-period dithered cross-fade). `mask: 'original'`
keeps the procedural alpha exactly (character sheets: frame alignment, translucent ghosts).

Character sheets (`frameGrid: 24x32`) are processed frame by frame with one palette per sheet.
`align: 'anchor'` (redesigned premade characters) keeps the model's art-pixel size and aligns the
feet line and the legs' median x instead of stretching bounding boxes; `stabilize` reuses each
row's idle head/shoulders in the walk frames (shifted by the procedural bob) so AI walk cycles do
not wobble. `sheet: 'new'` jobs (UI kit, role icons, title art) have no procedural source: the
reference shows empty slots, `align: 'fit'` keeps the model's pixel grid and centres the drawing,
and `generate.ts` writes the PNGs (+ `manifest.json`) to the job's `outDir`.

Text/code tasks (critique, style guide, generator-code authoring) use
`ai/scripts/codex-text.sh <staging-dir> <prompt.md> [images…]`; their prompts are in
`ai/prompts/` too (e.g. `review-01.md` → `docs/art-direction.md` + `ai/critique-01.md`).

`ai/staging/` is excluded from `scripts/remote.sh`'s rsync: push job dirs with
`CT_AGENT=assets ai/scripts/push-staging.sh <job…>` before `cli.ts ingest`, and pull refs with
`scripts/pull.sh packages/assets/ai/staging/<job>`.

In-game review: `ai/scripts/town-review.ts <root> <port> <outDir> [--crowd]` (hshi-u1, dev-mode
client build) screenshots fixed camera spots by day/night, interiors and a 16-character crowd and
records rAF frame times.

Fallback: `CT_ASSETS_PROCEDURAL=1 pnpm assets:generate` (or `--procedural`) ignores every AI job;
per-job `enabled` flags in `jobs.ts` decide what ships.

Running a job:

```
CT_AGENT=assets scripts/remote.sh pnpm --filter @ct/assets exec tsx ai/scripts/refs.ts <job>
CT_AGENT=assets scripts/pull.sh packages/assets/ai/staging
packages/assets/ai/scripts/codex-job.sh <job>                 # Mac only (codex is an API client)
CT_AGENT=assets scripts/remote.sh pnpm --filter @ct/assets exec tsx ai/scripts/cli.ts ingest <job>
CT_AGENT=assets scripts/remote.sh pnpm --filter @ct/assets exec tsx ai/scripts/cli.ts review <job>
CT_AGENT=assets scripts/pull.sh packages/assets/ai/raw packages/assets/ai/prompts packages/assets/ai/staging
```

Then look at `ai/staging/<job>/compare.png` (procedural | AI at 1× and 3×), set `enabled: true`
only if it is better, and regenerate. Note: `scripts/remote.sh` rsyncs with `--delete`, so pull
remote outputs before the next remote command.

## Density 2 (2026-10 visual overhaul)

`pnpm assets:generate` now writes **density-2** art (`CT_ASSETS_DENSITY=1` regenerates the 1x set):
32 texels per 16-px world tile, 48x64-texel character frames, manifests carry `density: 2` and all
spatial values in texels (`town.json` objects/lights incl. `depth`/`radius`, `objects.json` rects,
`characters.json` frames/anchor). World coordinates, collision, doors and voice zones are unchanged;
the client draws everything at scale 1/density (docs/art-direction.md, last section).

How the 2x art is made:
1. Baseline: the best 1x art (procedural + accepted 1x model frames) doubled with **Scale2x/EPX**
   (`lib/img.ts scale2x`, no new colours) — used as the alignment reference for the model and as
   the labelled fallback (`generated/ai.json` → `upscaled`) where no redraw exists yet.
2. Density-2 jobs (`density: 2` in `ai/scripts/jobs.ts`, ids `hd-*`): the model redraws every
   building, prop, flat, foreground piece, terrain material, premade character, ghost style and
   the Storyteller at full 2x detail; same post-processing/validation as 1x (auto scale with
   `scale: 0`, per-frame character processing, procedural walk cycle from the idle pose,
   mirrored right row, defringe + fringe validation).
3. Layered "advanced" characters: the model redraws one base variant per layer (fair body,
   crimson outfits, brown hair, accessories) with `mask: 'original'`; the other skins/palettes/hair
   colours are derived by a per-pixel colour-ratio transfer from the procedural variants.
4. The showpiece clock tower is drawn 1.4x wider / 1.375x taller than its 5x5 footprint
   (`TOWER_HD` in `scripts/buildings.ts`, sprite offset −16 world px); light points, the clock
   anchor and the belfry bell rects (`ambient.json bells`) follow automatically.
5. Ground: base materials come from accepted 2x texture redraws (organic materials); paved
   materials keep the 1x procedural texel (2x2 texels) — the model's paved textures were rejected
   as too busy. Edges, shores and shadows come from the 1x renderer.

Capture tools (hshi-u1, dev-mode client build): `ai/scripts/town-review.ts` (fixed camera spots,
interiors, 16-character crowd + frame times) and `ai/scripts/town-moments.ts` (`FX_ONLY=moment`:
bedtime → night → dawn sequence).
