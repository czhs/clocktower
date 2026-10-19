# pixel3d

A three.js r170 (WebGL2) renderer for **"3D pixel art"**, the look of t3ssel8r's and David Holland's work:
real 3D scenes drawn at 640×360 through an orthographic, texel-snapped camera, then upscaled crisply. The
renderer adds 1-texel outlines and cream edge highlights, banded toon light, grass sprites that blend into
the terrain, post-pass water with reflections, and stepped god rays and mist. It uses plain ES modules with
no build step.

It was built almost entirely by a swarm of Claude agents, each one owning one module and checking its work
with headless renders. The project includes three showcase scenes and a character pipeline.

![contact sheet](shots/gallery/sheet.png)

| scene | what | file |
|---|---|---|
| `shrine` | ruined octagonal water shrine with pillars, noon cloud shadows | `scenes/shrine.js` |
| `pond` | meadow pond with reflections, lily pads, reeds and wind | `scenes/pond.js` |
| `glade` | forest clearing with god rays (golden) and fireflies (night) | `scenes/glade.js` |

Stills, loop GIFs and an honest per-scene write-up (techniques, known flaws, crawl check) are in
**[docs/GALLERY.md](docs/GALLERY.md)** and `shots/gallery/`. Status: the renderer works and the shrine is
close to the reference look. No scene has yet reached the critique rubric's ship bar (17/24 each against
19/24).

## View it interactively

```sh
npm install                      # fetches three@0.170.0 (and playwright, only needed for headless captures)
python3 -m http.server 8000      # or any static file server, from the repo root
```

Open `http://localhost:8000/index.html?scene=shrine` (or `pond`, `glade`). A WebGL2 browser is required.

URL parameters:
- `scene=<name>`: any file in `scenes/` without the `.js`. Besides the three scenes there are the module test
  scenes (`_test-water`, `_test-atmos`, …), `_test-all` (the default) and `char-stage` (characters).
- `tod=noon|morning|golden|night`: time of day. The art direction lists noon for the shrine, morning for the
  pond, and golden and night for the glade, but every scene accepts all four.
- `scale=<int>|fit`: screen pixels per texel. The default is `round(innerHeight/360)`. `fit` gives a
  non-integer scale with an anti-aliased upscale.
- `pan=1`: slow deterministic camera drift. Each scene also has debug parameters, documented in the header
  comment of the scene file.
- `debug=raw|normal|depth|flags`, `outlineDebug=1`, `waterDebug=reflect|bands`: debug views.

Controls (shown in the HUD at the bottom left):
- **WASD** or **drag**: pan
- **mouse wheel**: zoom in fixed stops
- **Q / E**: rotate 45° (a 3-pose stop-motion turn)
- **1-5**: views: final, raw colour, normals, depth, colour

## How it is built: the agent pipeline

```
research/*.md  →  docs/TECHNIQUES.md + docs/ART_DIRECTION.md  →  pipeline/01-build  →  pipeline/02-scenes
 (research          (synthesis: technique spec per module,         (module swarm +      (compose, critique,
  agents)            scene specs, critique rubric)                  integration)         polish, gallery)
```

1. **Research** (`research/01-04*.md`). Agents studied David Holland's article, t3ssel8r's videos, posts and
   screenshots, existing open-source implementations and video breakdowns. Claims carry confidence or
   provenance labels. Third-party reference images were collected in `refs/`, which is private, gitignored,
   and used for visual comparison only.
2. **Synthesis**. `docs/TECHNIQUES.md` turns the research into a per-module technique spec (camera, outlines,
   lighting, terrain, grass, trees, water, atmosphere, composition). `docs/ART_DIRECTION.md` defines the three
   scenes (camera, light, composition sketch, element table, measured palette, signature checklist) and the
   12-criterion critique rubric. `docs/PIPELINE.md` is the contract every agent reads first: frame structure,
   material contract, module APIs, file ownership, and how to render.
3. **`pipeline/01-build.workflow.js`**. Nine module owners (camera, outlines, lighting, terrain, props, grass,
   trees, water, atmosphere) build in parallel. Each edits only its own files, renders its test scene
   headless, looks at the PNGs, and iterates. A lead integrator then resolves contract requests and gets every
   test scene rendering cleanly.
4. **`pipeline/02-scenes.workflow.js`**. For each scene, a scene agent composes `scenes/<scene>.js`, an
   art-director critic scores it against the rubric and lists issues by owner, and the scene agent refines it
   before a second critique. Module-level issues from all critics are then grouped by owner and fixed in
   parallel. Finally a gallery agent renders the stills, GIFs and contact sheet and writes `docs/GALLERY.md`.
5. Characters, a second track: `pipeline/03-chars-build.workflow.js` and `04-character.workflow.js`, with
   `docs/CHARACTERS.md` and its playbook and learnings. These cover rigging, stepped animation, look and sprite
   baking (`out/sprites/`), on top of the same renderer.

### Re-running it

The `pipeline/*.workflow.js` files are Claude Code workflow scripts that use `agent()`, `phase()`, `pipeline()`
and `parallel()`. Run them from Claude Code's workflow runner in order. Each takes optional `args`:
- `01-build`: `{ root }`
- `02-scenes`: `{ root, scenes: ['shrine','pond','glade'] }` (a subset re-runs only those scenes)
- `04-character`: `{ briefs: [{ name, brief }] }`

`root` defaults to `~/Desktop/Projects/pixel3d`. The agents edit files on the Mac and render
remotely. Every render goes through `tools/remote.sh`, which rsyncs the tree to `render-host:~/pixel3d` (Linux,
RTX 4090, Node, Chromium via Playwright) and runs the command there. Set `PIXEL3D_HOST` / `PIXEL3D_RDIR` to
use another machine.

Rendering by hand:

```sh
tools/shot.sh shrine shots/me/shrine.png --size 1920x1080 --q "scale=3&tod=noon" --t 2   # one still
tools/shot.sh glade shots/me/g.png --times 0,0.5,1 --q "scale=2&tod=night"              # g-00..02.png
tools/shot.sh pond shots/me/p.png --bench 60                                           # + frame timings
tools/remote.sh --no-sync python3 tools/sheet.py gif shots/me/p.gif "shots/me/p-*.png" --scale 0.5 --fps 30
tools/remote.sh --no-sync python3 tools/crawl.py "shots/me/f-*.png" --dx 0,1,2 --dy 0,0,1 --scale 3
```

`shot.sh` prints page and shader errors (a render with errors counts as failed) and an `info:` line with
draw calls, triangles, enabled passes and build timings. To regenerate the gallery:

```sh
for s in shrine:noon pond:morning glade:golden glade:night; do
  tools/shot.sh ${s%%:*} shots/gallery/${s%%:*}-${s##*:}.png --size 1920x1080 --t 2 --q "scale=3&tod=${s##*:}"; done
T=$(python3 -c "print(','.join(f'{k/30:.4f}' for k in range(90)))")
for s in shrine pond glade; do
  tools/shot.sh $s shots/gallery/frames/$s/f.png --size 1920x1080 --times $T --q "scale=3&pan=1"
  tools/remote.sh --no-sync python3 tools/sheet.py gif shots/gallery/$s.gif "shots/gallery/frames/$s/f-*.png" --scale 0.33334 --fps 30
done
tools/remote.sh --no-sync python3 tools/sheet.py sheet shots/gallery/sheet.png shots/gallery/{shrine-noon,pond-morning,glade-golden,glade-night}.png --cols 2 --scale 0.5
rsync -az --include '*.gif' --include 'sheet.png' --exclude '*' render-host:pixel3d/shots/gallery/ shots/gallery/
```

## Layout

```
index.html, src/main.js     entry: index.html?scene=<name>
src/core/                   Engine, PixelCamera (texel snap, rotation), PixelPipeline (passes, upscale), noise, glsl
src/materials/toon.js       banded toon material + hooks (the material contract)
src/world/                  terrain, rocks, props, grass, flowers, trees, water, particles, sky (time of day)
src/post/                   outline, fog, godrays, grade
scenes/                     shrine, pond, glade, test scenes, character stages
characters/                 character specs (docs/CHARACTERS.md)
tools/                      shot.sh/.mjs (headless capture), remote.sh, sheet.py, crawl.py, bake.py, charcheck.py
docs/                       PIPELINE, TECHNIQUES, ART_DIRECTION, GALLERY, CHARACTERS*
research/                   source research notes
pipeline/                   the agent workflow scripts
shots/                      renders (shots/gallery = final)
```

The reference images in `refs/` belong to their authors. They are gitignored and must not be redistributed.
