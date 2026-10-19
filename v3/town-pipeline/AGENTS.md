# Town pipeline: agent guide (read this first)

You are a coding agent working on 3D pixel-art scenery for **pixel3d**. pixel3d is a three.js r170 (WebGL2) renderer
in plain ES modules with no build step. It aims for the "3D pixel art" look of t3ssel8r and David Holland: real 3D
scenes drawn at **640x360 internal resolution** through an **orthographic, texel-snapped camera** (pitch 30°), with
**1-texel outlines** plus cream edge highlights, **banded toon light** (3 tones per material: lit, mid, shadow),
leaf-sprite trees and sprite grass that blend into the terrain, post-pass water, stepped god rays and mist. The result
is upscaled crisply.

This folder packages the process, workflows and brief templates that built **Hollowmere**: a gothic but cozy village
with 15 distinct cottages, a clock tower, a voting circle, a forest rim, a river, ambient life, 15 enterable interiors
and a walkable demo. Every piece is deterministic code written by agents. Use this folder to build a new town, or to
extend or redo parts of this one.

The engine is next door in `../pixel3d/`. Every path below is relative to this folder (`v3/town-pipeline/`), unless it
is a command. **Run commands from `../pixel3d/`**: the tools find their own root.

---

## 1. Folder map

```
v3/town-pipeline/                  (this folder: docs + orchestration, no engine code)
  AGENTS.md                        this guide
  PROCESS.md                       the multi-agent process that worked, phase by phase, and the lessons
  README.md                        short human overview
  workflows/*.workflow.js          parameterised orchestration scripts for Claude Code's Workflow tool
  templates/*.md                   copy-paste briefs: piece, interior, critic rubric, verifier, lore skeleton

v3/pixel3d/                        (the engine and the town; read the docs before you code)
  docs/PIPELINE.md                 engine contract: frame structure, material contract, module APIs, render host
  docs/TECHNIQUES.md               technique spec per module (camera, outlines, light, terrain, grass, trees, water, atmos)
  docs/ART_DIRECTION.md            palette discipline + the original scene rubric
  docs/TOWN.md                     THE town contract: coordinates, cameras, palette, piece API, kit, scale rules,
                                   budgets, ownership, TOWN RUBRIC (§10), user requests (§11), integration notes (§12)
  docs/TOWN_LEARNINGS.md           ~1000 lines of per-piece lessons (symptom -> cause -> rule). Read your piece's section.
  docs/TOWN_GALLERY.md             final renders, bench numbers, verified user requests, known flaws
  docs/INTERIORS.md, docs/LORE.md  interior contract; lore + distinctness rules for rooms
  docs/AMBIENT.md                  the reusable ambient-animation library (src/ambient/*)
  docs/DEMO.md                     the walkable demo's module contract, playtest checklist, bundle + CSP
  src/core, src/materials, src/post, src/world     the renderer (read-only for town agents)
  src/town/layout.js               layout data: ground grid, houses, objects, LAYOUT_DELTAS (single source for doors)
  src/town/palette.js              TOWN_PALETTE ramps, paintRamp(v1Hex), glassGlow
  src/town/kit.js                  shared building kit: Builder -> one merged mesh per material layer
  src/town/api.js                  piece API, cameras (CAMERAS), time of day (TOWN_TOD), registry, lights, stubHouse
  src/town/town.js                 the composer (buildTown): build order, placement, cut-away, door zones, shadow cull
  src/town/cutaway.js              camera-aware cut-away (rounded window, roof-off lifts, section rim + interior twins)
  src/town/contact.js              contact-darkening post pass
  src/town/pieces/*.js             one file per piece: house-0..14, clocktower, dais, ground, props, foliage
  src/town/life/*.js               animation layer: doors, walkers, folk, critters, smoke/sprites, wind, ceremony, cycle
  src/town/interiors/*.js          interior contract (index.js), kit (kit.js), one room per house (house-N.js)
  src/demo/*.js, demo.html         the walkable demo
  scenes/town.js                   the composed town      (index.html?scene=town&cam=...&focus=...&tod=...)
  scenes/town-piece.js             one piece on a pad      (?piece=house-3&yaw=45&tod=night)
  scenes/town-life.js              life showcase timeline  (?demo=day|dusk|night|ceremony&shot=...)
  scenes/interior.js               one interior            (?house=3&tod=night&yaw=45)
  tools/                           remote.sh, shot.sh, townpiece.sh, townshots.sh, towncrawl.sh, sheet.py, crawl.py,
                                   demo-*.mjs, demo-bundle.sh, demo-serve.sh, clean.sh, pull.sh
  pipeline/*.workflow.js           the historical workflow scripts (unparameterised; use ./workflows instead)

v3/gallery/                        rendered cast gallery (characters)
```

The Clocktower game repo is the parent of `v3/`. Its 2D art and layout are the **read-only identity source** for
Hollowmere: `../../packages/assets/src/layout.ts`, `../../packages/assets/scripts/{buildings,props,ground}.ts`,
`../../packages/assets/scripts/houses/house-<i>.ts` and `../../docs/vision.md`. Never edit them from a town task.

---

## 2. Prerequisites

- **A Linux render host with a GPU**, reachable over `ssh` without a password prompt. It needs Node (with npm),
  `python3` with PIL and numpy, and `rsync`. `npm install` in the synced tree installs `three@0.170.0` and
  `playwright@1.63.0`. Install Playwright's Chromium once on the host (`npx playwright install chromium`). The headless
  harness launches Chromium with ANGLE/Vulkan, so the GPU driver must support Vulkan.
- **Environment variables** on the editing machine:
  - `PIXEL3D_HOST`: the ssh host alias of the render host (default `render-host`)
  - `PIXEL3D_RDIR`: the directory on the host, relative to the remote home (default `pixel3d`)

  `tools/remote.sh` rsyncs the tree there (it never pushes `node_modules`, `.git`, `out/sprites/` or rendered shots),
  runs `npm install` when `package.json` changed, and runs your command over ssh. On the host it sources
  `~/clocktower/env.sh` if that file exists. Otherwise `node` and `python3` must be on the non-interactive ssh PATH.
- **The editing machine only edits files.** Do not run renders, Node or Playwright locally. Everything executes on the
  render host through `tools/remote.sh`.
- **Never render on a production game server.** `remote.sh` refuses `PIXEL3D_HOST=game-host` on purpose. Renders use
  the whole GPU, and 20 parallel agents can saturate the host. Keep game hosting and rendering on separate machines.
- The tools bind no ports. `shot.mjs` serves the repo through Playwright request interception. The only servers are
  the demo servers (§5g), and they bind to `127.0.0.1` or a private tailnet address, never `0.0.0.0`.
- Missing from this copy: `refs/` (private third-party reference images; never redistribute them) and `shots/`
  (renders). Docs that cite `shots/...` describe renders that you can regenerate. For example, the foliage look
  reference `shots/gallery/pond-morning.png` comes from `tools/shot.sh pond shots/gallery/pond-morning.png --size 1920x1080 --t 2 --q "scale=3&tod=morning"`.

---

## 3. Render and LOOK

All commands run from `../pixel3d/`. Outputs go to `shots/<your-id>/` and are pulled back automatically.
**Open every PNG you rely on with your image-reading tool.** A render that prints page errors or shader errors is a
failed render.

```sh
# one piece: 4 isolated yaws (noon) + gameplay camera focused on it (noon + night, cut-away on) + 1x crop,
# sheet.png + report.txt (calls / tris / build ms / errors). Exit 1 = a render had errors.
tools/townpiece.sh house-3 shots/house-3
tools/townpiece.sh props shots/props --focus 33,14            # whole-map pieces: pick a focus (piece id or x,z)
tools/townpiece.sh clocktower shots/clocktower --yaws 0,45,135,225 --tods noon,golden,night
#   other flags: --vh N  --ctx-vh N  --q 'k=v&k2=v'  --t 2  --only iso|ctx

# single frames of any scene (scene = file in scenes/ without .js)
tools/shot.sh town shots/me/ov.png --q "cam=overview&tod=golden"
tools/shot.sh town shots/me/gp.png --q "focus=house-3&tod=night"
tools/shot.sh town-piece shots/me/y45.png --q "piece=house-3&yaw=45&tod=night&vh=6"
tools/shot.sh town shots/me/f.png --times 0,0.17,0.33,0.5 --q "focus=house-3"   # animation frames f-00..03.png
tools/shot.sh town shots/me/b.png --bench 60 --q "focus=house-3"                # frame timings + program count
tools/shot.sh town shots/me/raw.png --q "focus=house-3&debug=raw"               # also debug=normal|depth|flags, outlineDebug=1
tools/shot.sh town shots/me/x1.png --size 640x360 --q "scale=1&focus=house-3"   # true 1x

# whole town (parallel jobs + sheet + report with calls / programs / lights / cut / bench)
tools/townshots.sh shots/me/int --set integration            # sets: integration | square | night | quality
tools/townshots.sh shots/me/q --set quality --bench 60
tools/townshots.sh shots/me/j --jobs 'a:focus=house-5&tod=noon;b:cam=vote&tod=golden' --par 4

# crawl check (whole-texel pan; per-piece pixel counts from each piece's screen box: read YOUR row)
tools/towncrawl.sh shots/me/crawl --q 'focus=house-3&tod=noon' --pan 3,2 --thr 2 [--pieces house-3] [--clouds]

# helpers on the host (outputs under shots/, then tools/pull.sh shots/<dir>)
tools/remote.sh --no-sync python3 tools/sheet.py gif shots/me/f.gif "shots/me/f-*.png" --scale 0.5 --fps 6
tools/remote.sh --no-sync python3 tools/sheet.py sheet shots/me/sheet.png shots/me/a.png shots/me/b.png --cols 2 --scale 0.5
tools/remote.sh --no-sync python3 tools/crawl.py "shots/me/c[01].png" --dx 0,3 --dy 0,2 --scale 2 [--out shots/me/cd]
tools/remote.sh --no-sync python3 tools/towncrop.py shots/me/gp.png shots/me/zoom.png 600 300 160 90 4
tools/pull.sh shots/me/crawl
tools/clean.sh shots/me '*.png'      # the ONLY way to delete renders (local + host, only under shots/ or out/)
```

Useful `scenes/town.js` parameters: `cam=gameplay|overview|iso|vote`, `focus=<id>|x,z`, `yaw=`, `vh=`,
`tod=noon|morning|golden|afternoon|night`, `pieces=a,b` (subset), `life=0`, `strict=<id>|all`, `pan=1|x,y`,
`quality=high|low`, `cut=auto|0|1`, `cutSide=eave|strip|half|full`, `lights=N`, `vignette=0`, `clouds=0`,
`doors=<0..1>`, `unlit=<ids>|all`, `relAz=&elev=` (sun override), `boxes=1`, `meshes=1`, `tris=1`, `contact=0`,
`shadowCull=0`, `lift=0`, `liftFrac=`. Layout review hooks: `occl=1` (nearest ground z each piece hides),
`vis=1` (door / body fraction visible from the yaw-0 camera, with blockers), `ldx=house-5:dx=-2:dz=1.8;...` (A/B
layout override for review only), `treeDump=x0,z0,x1,z1`, `doorDump=1`. The full list is in the header comments of
`../pixel3d/scenes/town.js` and in `../pixel3d/docs/TOWN.md` §7 and §12.

**What "looked at" means:** check the sheet, the gameplay-camera context shot (`ctx-noon.png`), the 1x crop at true
size, and the night shot. Cite pixel locations (x, y in 1280x720) for every problem. A render you did not open is not
evidence.

---

## 4. Golden rules

1. **Deterministic code only.** Use `rng(seed)` from `src/core/noise.js` (or `ctx.rng`), never `Math.random()` or
   `Date.now()`. Animation must be a pure function of `t`, stepped at 3-8 fps. Moving objects go through
   `engine.camera.snapObjectToTexel(obj)`. Static solids must be identical between frames.
2. **Own your files.** Every file has exactly one owner (tables in `TOWN.md` §9, `DEMO.md` §1, `INTERIORS.md`). Edit
   only yours. If you need a change in a shared file (kit, palette, api, layout, a world module), write a
   `CONTRACT-REQUEST: <owner>: <change>` line in your final report and a `// CONTRACT-REQUEST:` comment in your file,
   and work around it locally. If a neighbour's file is broken mid-run, do not fix it: their piece degrades to a grey
   box and your render keeps working. No git commits unless the human asks for one.
3. **Render and look before you claim anything.** Never report a pass, a fix or a number you did not render, open and
   read. Record every command you ran in your report.
4. **Piece API.** A piece default-exports `build(engine, ctx)` and returns `{group, update?(t, dt), anchors, api,
   stats}` (`TOWN.md` §4). Houses must provide `api.setDoor(f)` and `api.setLit(bool)`, door anchors (`pivot`,
   `open(f)`, and the real `point` / `normal` when it differs from the record), `chimneys`, `windows`, `lights`
   (world `Vector3` positions) and `perches`. Build in the GAME frame from `ctx.record`. The composer moves and turns
   placed pieces (`LAYOUT_DELTAS`). Never compensate for `ANTI_TIE` yourself.
5. **Material contract and sprite policy.** Use `toonMaterial` / `toonMesh` or the kit. Share materials, because every
   new material is a new shader program. Custom shaders must bind `uPassMode` by reference and write the outline flag.
   Sprites (grass, flowers, leaves, reeds) are `transparent`, `depthWrite:false`, `NoBlending`, alphaTest 0.5,
   `outline:'none'`. Canopy cores are opaque with `FLAG_NONE`. Particles go on layer `COLOR_ONLY`. Water is a post
   pass (`createWater`), never a mesh. Keep every colour inside `TOWN_PALETTE` ramps or a `paintRamp(v1Hex)`.
6. **Pixel-art geometry rules.** At the gameplay camera 1 texel = 3.33 cm. Relief must be at least 1-2 texels
   (0.035-0.07 m), and every part at least 0.05 m. Roof course lifts should be about 0.06-0.085 m on slopes that face
   the camera; a 1-texel lift renders as dashed lines. No coplanar faces: offset contact faces by an odd hair such as
   0.013 m. Small objects go on 45° stops. Round things are 8-gons or 16-gons with a flat face toward +z.
7. **Performance budgets** (`TOWN.md` §6). Each house: 8 or fewer draw calls (plus 1 per animated part) and at most
   15k tris. Clocktower: 12 calls / 30k. Props: 24 / 30k. Foliage: 90 / 400k. Ground: 8 / 450k. Life: 30 / 30k. Whole
   town at the gameplay camera: at most 300 colour-pass calls, `--bench 60` mean at most 8 ms at 1280x720, and the
   shader **program count constant** between frames and across a day cycle. Each piece builds in 300 ms or less
   (foliage and ground: 1500 ms). At `ctx.quality === 'low'`, **cut geometry** (decimate, thin, skip casting), not just
   effects. Target: at most ~400k frame tris at the square.
8. **Crawl checks.** A whole-texel pan must change 0 interior pixels on your piece (`tools/towncrawl.sh --pieces
   <id>`, or `pieces=<id>,ground` to drop neighbours). Measure the magnitude (max |dc|), not only the count: 1-3/255
   is grade or derivative noise, while 30+/255 is a real geometry tie. Render both crawl frames in one remote call so
   neighbours cannot re-sync between them.
9. **Unattended-run hygiene.** No raw `rm` (use `tools/clean.sh` or write into a fresh `shots/<you>/r2/`), no `sudo`,
   no edits outside the repo. Each of these triggers a permission prompt that stalls an overnight run.
10. **The camera decides readability.** The camera looks north (−z) and down 30°. Anything SOUTH of a building stands in
    front of it: a thing of height h at depth z hides the ground up to z − 1.73·h. East and west walls are edge-on at
    yaw 0. Check your context shot before you design a façade.

---

## 5. Recipes

### (a) Add or redo one building piece

1. Read `../pixel3d/docs/PIPELINE.md`, `TOWN.md` (§1-§7, §10, and the §12 notes about your piece), your section of
   `TOWN_LEARNINGS.md`, and the v1 house file `../../packages/assets/scripts/houses/house-<i>.ts`.
2. Look at the current state first: `tools/townpiece.sh house-<i> shots/house-<i>/r0`, and open `ctx-noon.png`. Note
   who stands in front of you at yaw 0 and what the camera can actually see.
3. Fill in `templates/building-piece-brief.md`. Put the design note (signature shape, palette rows, key details, what
   it reads as at 640x360, a height plan per local z) at the top of `src/town/pieces/house-<i>.js`.
4. Blockout with the kit (`Builder`, `wallWithOpenings`, `gableRoof` / `hipRoof`, `window_`, `doorway`, `door`,
   `chimney`, `lantern`, `frameOf(record)`; see the `stubHouse` example in `api.js`). Render, look, fix. Iterate at
   least 4 times, checking ctx-noon, the 1x crop, night, `doors=1&tod=night` close up (`vh=5`) and the crawl.
5. Fill in every anchor and API in §4. Check `stats.doorMismatch` (via `doorDump=1`) is empty for your door.
6. `--bench 60` and the report: stay inside the budget. Then run a critic with `templates/critic-rubric.md` (an
   independent agent that renders for itself) and fix every issue it routes to you.
7. Append your lessons to `TOWN_LEARNINGS.md` (symptom -> cause -> rule).

For a **new** piece id, the lead adds it to `PIECE_IDS` / `BUILD_ORDER`, `layout.js` (record, footprint, door) and
the ownership table, and writes a stub first so the town keeps rendering.

### (b) Add an interior with story and ambiance

1. Read `../pixel3d/docs/INTERIORS.md` (contract, `Room`, `FURNITURE`, `WALL`, glow material, light rules) and
   `../pixel3d/docs/LORE.md`. Study the reference room `src/town/interiors/house-0.js`.
2. Fill in `templates/interior-brief.md`: inhabitant, 2-4 story props that read at 640x360, the shared motifs this
   room carries, the room's own shape, floor, walls and fireplace, its lighting recipe for day and night, and one
   cheap animated ambiance element.
3. Write `src/town/interiors/house-<i>.js` (`export const ROOM = {...}` and `export default function build(room, ctx)`).
   Return `bed`, `visit`, `extras` and `update(t)` as needed. Keep the doorway and spawn area free. Add collisions
   with `room.solid(...)`. Interiors never create PointLights: publish `room.light(...)` anchors and the demo re-aims
   its fixed pool. Optionally add a per-room `nightAmbient`.
4. Render: `tools/shot.sh interior shots/int-<i>/n.png --q "house=<i>&tod=night"`, plus `tod=noon`, `yaw=45`,
   `char=wanderer`, and `town=1` to check that the shared kit programs still compile. Budget is about 16 meshes and
   10k tris per room.
5. **Distinctness test:** put all 15 rooms on a 25 % contact sheet (`sheet.py sheet ... --scale 0.25`) at noon AND at
   night. Each room must be identifiable by layout, palette and light alone. If you skip this, rooms drift back to
   the kit's standard shell.

### (c) Foliage, ground and props

- **Foliage** (`src/town/pieces/foliage.js`): build about 30 `createTree(..., {add:false})` templates and stamp them
  with quarter-turn yaws and 0.85-1.15 scale. Merge leaves per 16 m chunk and cores per palette and chunk. Re-sort
  the merged chunks yourself, and truncate `engine._treeSorters` after each template. Give leaf sprites only to trees
  that can be on screen. Use vertex-cluster-decimated cores (`coreLo`) for trees that are off-view or seen at
  viewHeight above 20. Season is set by the ramp, not the shape (spring = leaf ramp + mossTuft tips + 5-8 % blossom
  sprites). Cap south-rim trees by their DRAWN top: `top <= (z − 35.4)/1.73 + 0.1`. Keep trees off `ground.api.clear(x, z)`.
- **Small flora** (flowers, toadstools, ferns, berries, ivy): one 16x16 pixel atlas with a "kind" channel, one cached
  `toonMaterial`, one instanced field, and roots snapped to the texel grid. Do not build them as tiny 3D geometry,
  which turns into a mess of outlines.
- **Ground** (`ground.js`): its own heightfield and a single `toonMaterial` whose `tones` hook decides every pixel from
  world position, using a baked SDF texture for lanes, road and forest floor. Measure joints in screen pixels
  (`pxPerMetre`), not metres. Make litter cells LOD-aware (`cell = max(0.15, texelWorld*4.5)`). Toggle river
  reflection with `water.pass.enabled` when the river is off-screen.
- **Props** (`props.js`): merge per material and instance repeats. Run the depth-stacking check for anything that
  stands in front of another piece: `h_front <= h_back_visible + 0.577·(z_front − z_back)`. Each raised basin of water
  is `createWater({shape: polygon, reflection: false})`, which costs one post pass and no scene render. Mark
  walk-through dressing with `PROP_DEFS[kind].walkable` (lead file).

Render with `tools/townpiece.sh foliage|ground|props shots/<id> --focus x,z` at several foci, plus the overview and
iso, and the quality tiers (`townshots.sh --set quality`).

### (d) Ambient life and animation

- The town's life layer lives in `src/town/life/*` and is shown off in `scenes/town-life.js` (`?demo=day|dusk|night|ceremony`,
  `?shot=wide|doors|tower|dais|lamps|cat|fountain|belfry`, `?t=` to scrub). It drives other pieces only through
  anchors and APIs: doors, chimneys, perches, lights, the dais, the clock tower.
- Rules that cost rounds to learn:
  - Re-run another piece's `update(t)` after you change its state.
  - Never let the program count change mid-run. Hide objects with `scale 1e-4` instead of `visible=false`, and give
    every instanced pose mesh a dummy instance in frame 0.
  - Use one CPU-fed point-sprite system for all smoke, sparks and moths (1 call).
  - Smoke reads as a column only with frequent, growing puffs: cap drift at about 1/3 of the rise, and dissolve by
    shrinking.
  - Night particles are emissive in the slate ramp.
  - Swing doors OUTWARD (inward leaves vanish behind the interior plate).
  - Skip perches for which `registry.cutaway.isCut(pos)` is true.
- For reusable reactive systems (birds, fireflies, fire, critters, cloth), use the `src/ambient/*` library
  (`docs/AMBIENT.md`, `defineSystem`, budgets of 3 GL calls and 0.3 ms per system). Check them with
  `tools/ambientpack.sh <system>`.
- Check: `tools/shot.sh town-life shots/life/f.png --times 0,0.2,0.4,... --q "demo=day&shot=doors"`, then a GIF via
  `sheet.py gif`. Static solids must not change between frames (diff the frames). Check `--bench` programs before
  and after.

### (e) Layout and occlusion: cut-away, layout deltas, door visibility

- `src/town/layout.js` is the **single source**. `LAYOUT_DELTAS[id]` holds the rotation about the game footprint
  centre, the `dx` / `dz` offset and the real `door` (`{point, normal}` in the game frame). Pieces keep building in the
  game frame, and the composer places them. Record every change in the "Layout deltas vs the game" table
  (`TOWN.md` §12.1) so the game's collision can be ported.
- Measure; don't guess:
  - `?occl=1` gives the nearest ground z each piece hides (needed: past the plaza kerb).
  - `?vis=1` gives the door and body fraction visible from the yaw-0 camera with no cut-away, plus the blockers.
  - `?ldx=` lets you A/B a move before you commit it.
  - `tools/demo-player.mjs doors` and `fuzz` check that every door is reachable and that no walk is blocked.
- Toolbox that worked:
  - Turn corner cottages 45° toward the square.
  - Turn the side rows ~12° and stagger them.
  - Put side doors in a 45° chamfer or a south-facing porch.
  - Move the house south of the circle into its own bay.
  - Keep the south rim low.
- The camera-aware cut-away (`cutaway.js`, on at viewHeight ≤ 20.5) protects the voting circle, the focused cottage
  (keep box + cut box) and the player. Roof-off lifts take whole roofs off cottages in front. Every cut edge gets a
  1-px section rim, and lifted cottages get BackSide section-interior twins in their own tone. The door-approach zone
  (5.5 m along the door normal, ±2.5 m sideways) protects a cottage while the player approaches it. Owners must not
  reshape a cottage for a neighbour; the cut-away handles stacking.
- Verify at the gameplay camera with `focus=` on every door tile, the four side lanes and the south seats, at noon,
  golden and night, with `cut=0` controls. Crawl the cut edges.

### (f) Run a whole-town swarm

Use the Workflow tool with `workflows/town-build.workflow.js`. Pass `args.root` = the absolute path of `v3/pixel3d`
(for example the output of `cd ../pixel3d && pwd`). Then run `workflows/town-user-requests.workflow.js` once the human's
requests are written into `TOWN.md` §11. If a run dies part-way (usage limits), do **not** resume the whole parallel
workflow. Collect the failed owners and run `workflows/town-finish.workflow.js` with `args.byOwner`. The phases, the
reasons behind them and the args are in `PROCESS.md` and in each script's header.

### (g) Build, verify and publish the static demo bundle

```sh
# local real-time check of the dev tree (headless, exit 1 on any console / page / shader error)
tools/remote.sh node tools/demo-lead.mjs shots/me/boot.png --wait 3000 --q "tod=night"
tools/remote.sh node tools/demo-play.mjs --out shots/me/play          # full scripted playtest (~160 s)
tools/pull.sh shots/me/play                                           # then LOOK at sheet.png and the shots

# open it in a desktop browser: ssh-tunnel a server bound to the host's loopback
tools/remote.sh true
ssh -L 8770:127.0.0.1:8770 "$PIXEL3D_HOST" 'cd pixel3d && node tools/demo-serve.mjs --port 8770'
#   -> http://127.0.0.1:8770/demo.html   (or tools/demo-serve.sh: binds ONLY to the host's tailnet address, DEMO_BIND)

# the self-contained bundle (dist/v3-art-demo/, pulled back to the editing machine)
tools/demo-bundle.sh                        # build
VERIFY_PLAY=1 tools/demo-bundle.sh verify   # serve under /v3-art-demo/ on the host's 127.0.0.1:8091 with the EXACT CSP,
                                            # run demo-smoke.mjs --expect-csp --tour (+ demo-play.mjs)
```

- The bundle ships `index.html` (demo.html with the import map rewritten), runtime `src/**` (.js/.css/.json), the
  roster's `characters/<id>.js`, and only the three r170 files actually reached, plus three's LICENSE. It never
  ships tools/, shots/, docs/, research/, refs/, out/, scenes/, pipeline/, node_modules/ or any
  .png/.jpg/.md/.py/.sh file.
- The build fails on an unresolved relative import, an uncovered bare import, or any absolute URL.
- **CSP-safe.** The target policy is `script-src 'self'`, with no inline script and no eval. The last build step,
  `tools/demo-bundle-csp.py`, rewrites every bare `three` / `three/addons/...` import to `./vendor/three/...` and
  removes the inline import map. The build then greps for eval, `new Function`, string timers, `javascript:` URLs,
  data: workers and inline `on*=` handlers.
- **Sub-path hosting.** Every URL is relative, so copy the folder under any path (`https://<public-host>/v3-art-demo/`,
  trailing slash required). Any static host that serves `.js` as `text/javascript` works.
- Publishing means copying `dist/v3-art-demo/` to that host, which is the human's call. Ask before you publish
  anything public. The verify step must report 0 CSP violations, a header that matches exactly, and no request
  outside the prefix.

---

## 6. Final report format (every agent)

Return: `summary`, `files` you changed, `screenshots` you looked at (paths), `commands_run` (verbatim),
`contract_requests` (`owner: change`), `learnings` (also appended to the learnings doc), and an honest status: what
still fails, with pixel locations. The workflows enforce this with JSON schemas.
