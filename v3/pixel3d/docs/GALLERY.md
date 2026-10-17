# pixel3d gallery

Final renders of the three art-direction scenes (`docs/ART_DIRECTION.md` §1-3), produced by the gallery step
of `pipeline/02-scenes.workflow.js` on 2026-10-15. Every image was rendered headless on game-host (RTX 3060,
Chromium/ANGLE/Vulkan) and inspected by eye at full size and in 3× crops. None of the renders printed page or
shader errors.

All files are in `shots/gallery/`:

| file | what |
|---|---|
| `shrine-noon.png` | shrine, `tod=noon` (the only variant ART_DIRECTION lists), t = 2 s |
| `pond-morning.png` | pond, `tod=morning` (the only listed variant), t = 2 s |
| `glade-golden.png` | glade, `tod=golden` (default), t = 2 s |
| `glade-night.png` | glade, `tod=night`, t = 2 s |
| `sheet.png` | contact sheet of the four stills (2×2, half size) |
| `shrine.gif`, `pond.gif`, `glade.gif` | 90 frames, t = 0 … 2.967 s, `pan=1` (slow camera drift), 640×360 |
| `frames/<scene>/f-00..89.png` | the 1920×1080 source frames of the GIFs |
| `crawl/` | crawl-check diff images (magenta = differs) and 640×360 zoom crops of the stills |

Stills are 1920×1080 at `scale=3`, so each 3×3 block of screen pixels is one texel of the 640×360 internal
image. The GIFs are those frames reduced with nearest sampling (`tools/sheet.py gif --scale 0.33334`) back to
exactly 640×360. With the task's `--scale 0.3333` the output came out 639×359 because of truncation, so I
used 0.33334. GIF frame delays are stored in centiseconds, so 33 ms becomes 30 ms and a loop plays in 2.7 s
instead of 3 s. PIL merges identical consecutive frames: the pond GIF has 42 distinct frames and the glade GIF
has 53. That merging is itself a sign of the stepped low-fps animation.

Critic scores (rubric ART_DIRECTION §4, out of 24, ship bar 19): shrine 18 → 17, pond 16 → 17, glade 18 → 17
(round 1 → round 2). **No scene reached the ship bar.** The images below are good-looking work in progress,
not finished art.

---

## shrine (`shrine-noon.png`, `shrine.gif`)

**What it shows.** A ruined octagonal water basin sits slightly below centre with a goblet fountain inside.
Eight stacked-block pillars and broken pillars ring it, and a fallen run of arch blocks lies top-right. Flat
slabs sit at the top and the cyan cube floats above the far rim. Cobble corners appear top-left, top-right
and bottom-left, with a reddish dirt path top-left. Round tree crowns frame the left and right edges and the
bottom corners.

**Techniques visible**
- **Texel-snapped ortho camera + integer upscale** (`PixelCamera`, `PixelPipeline`). Every edge is a clean
  3×3 block, and the octagon's diagonal faces are regular 2:1 staircases.
- **Outline pass** (`outline.js`). Darker, cooler 1-texel lines are drawn under every block overhang and
  around the pillars, and 1-texel cream rims run along the protruding block tops. The tops of the basin wall
  ring show the cream convex highlight clearly.
- **Banded toon lighting** (`toon.js`, `sky.js` noon preset). Stone has three tones: lit tops and lit left
  faces are warm beige, and the right faces are violet-grey. Grass is lime in the light and teal in the shade.
- **Cloud shadows** (`setClouds`). Large teal blobs lie on the meadow, for example the left half and the
  bottom-centre blob. Their edges are fringed by grass blades.
- **Grass sprites** (`grass.js`). Inside a band the tufts disappear into the terrain. They show only as
  blade fringes at shadow edges and around the stone bases. Lilac and yellow flower clusters sit near the
  corners.
- **Water post-pass** (`water.js`). The basin has three depth tints and a 1-texel pale line where the water
  meets the inner walls and the goblet base. It also has short white wave lines and a faint reflection of the
  goblet (see `crawl/z-shrine-noon-basin.png`).
- **Terrain zones** (`terrain.js`). The cobble has dark grout and the dirt path has pebbles.

**Known flaws**
- Pillar placement looks somewhat regular. The near-right pillar pair and the near-centre pillar crowd the
  basin's lower edge.
- The cobble corners are large, dark slate areas that pull the eye away from the subject.
- Tree crowns on the right edge show a bright lime hi-band that is close to the lit-meadow value, so the
  right frame edge reads flatter than the left.
- Lines are drawn very consistently. The ref's hand-placed cracks, moss and chipped edges are mostly
  missing, and the stone faces are cleaner than t3ssel8r's.

## pond (`pond-morning.png`, `pond.gif`)

**What it shows.** A kidney-shaped pond sits left of centre and holds lily pads (three with pink flowers),
cattail reed clumps and a half-submerged mossy boulder. The far bank rises in two grassy terraces with dirt
risers, and trees stand on top. A boulder cluster sits on the right bank, and a dirt path with stepping
stones leads down to the near shore. White, lilac and yellow flower drifts are scattered across the meadow,
and foreground crowns sit in the bottom corners.

**Techniques visible**
- **Water post-pass with a reflection camera** (`water.js`). It shows depth bands with hard steps, a pale
  1-texel shoreline around the pond and around the submerged boulder, blinking horizontal wave lines, and
  reflections of the far-bank trunks. See `crawl/z-pond-morning-water.png`.
- **Lily pads** are flat notched octagons without outlines, slightly lighter than the water.
- **Reeds** are 1-texel stalks with cattail heads.
- **Terrain terraces** (`terrain.js` plateaus). The stepped far bank has dirt cliff faces.
- **Stepped wind** (`grass.js`). In the GIF the grass, flowers and reeds change in discrete steps at a low
  frame rate. Between steps consecutive frames are pixel-identical (median pair diff 0.00 %).
- **Cloud shadows and faint distance fog** (`setClouds`, `addFog`).

**Known flaws**
- **Too much shade.** Cloud shadow covers roughly two thirds of the ground, against the art direction's
  ~30 %. The frame is dominated by teal, and the lit meadow only appears as a few big yellow-green patches.
- **Lit wedge on the far bank.** A lit cloud-gap patch on the far terraces shows hard, straight-edged
  triangular light/shadow shapes on the dirt risers, top centre (see `crawl/z-pond-morning-wedge.png`). It
  reads as a geometric artefact rather than a cloud edge.
- **Reflections read as detached dark columns.** The reflected trunks are clear slate-blue bars, but the
  crowns' reflections are faint, so the reflections do not read as trees.
- Sparkles are barely visible in the still.
- The boulders on the right bank are a flat violet with small moss caps and look unfinished next to the
  shrine stonework.

## glade (`glade-golden.png`, `glade-night.png`, `glade.gif`)

**What it shows.** A forest clearing ringed by tall dark trees. The ruin stub stands centre-left on a dirt
patch with two slabs and red mushrooms. Lilac mossy boulders sit at the left, a fallen log right of centre,
and round bushes at the trunk bases.
- **golden**: the sun is back-left. Hard diagonal god-ray shafts run from upper left to lower right and land
  as yellow, blade-fringed lit stripes on the grass. Dust motes float in the shafts, and the crowns have
  mustard back-lit rims.
- **night**: blue moonlit silhouettes. Blinking yellow-green fireflies have plus-shaped halos. A lantern
  on the ruin casts a warm stepped light pool. Texel-anchored grain and a banded vignette are visible.

**Techniques visible**
- **God rays** (`godrays.js`). The shafts are parallel, hard-edged and drawn in a few brightness steps. They
  come from designed slits in a shadow-only canopy above the frame (see the header of `scenes/glade.js`). Dust
  particles are only visible inside the shafts.
- **Sun spots on the grass**. The yellow lit stripes are cast-shadow gaps in the canopy, with grass blades
  fringing their edges.
- **Back-lit crowns** (`trees.js` + `toon.js`). Each crown has a bright rim on the sun side and a dark core,
  darker than the meadow shade.
- **Mist and fog** (`fog.js`). Low mist sits in hard steps. In the GIF diffs its band contours move as it
  drifts in steps.
- **Point lights** (`createLantern({light:true})`). The night lantern's light pool is quantised.
- **Fireflies** (`particles.js`) are emissive, so fog and rays leave them untouched.
- **Grade** (`grade.js`). The night frame shows the banded vignette and world-anchored grain.

**Known flaws**
- **golden is too dark and too teal.** The clearing reads as dim blue-green, and the golden feeling comes
  only from the shafts and the rims. The art direction warns against an overexposed wash, and this misses in
  the other direction.
- **Rims are heavy.** The back-lit crown rims are a flat, saturated mustard band with speckled edges,
  especially on the right-edge crowns (`crawl/z-glade-golden-crownR.png`). They are louder than the shafts.
- The shafts are drawn over the near bushes, for example on the left bush. This is physically plausible for
  air in front of the bush, but it washes out the bush.
- **night**: the moonlit grass patches are pale cyan blotches that read like stains or snow rather than
  light. The scene is otherwise very dark, and the ruin and lantern are the only readable focus.
- The fallen log is thin and dark and hard to read at 640×360.

---

## Crawl check (GIF frames)

Method: for each of the 89 consecutive frame pairs per scene, at 1920×1080, I searched for the whole-pixel
shift that best aligns frame k with frame k−1 and counted the pixels that still differ (48-px border
excluded). The script is not in the repo; it was a one-off. Diff masks are in `shots/gallery/crawl/*-pairNN.png`.

| scene | per-frame shift (px at 3×) | diff % of pixels, mean / median / max |
|---|---|---|
| shrine | (−1, 0) ×54, (−1, +1) ×35: smooth 1-screen-px steps from the sub-texel offset | 0.46 / 0.39 / 2.12 |
| pond | (−1, 0) ×44, (−1, +1) ×45 | 0.62 / 0.00 / 4.81 |
| glade | (0, 0) ×60, (−3, 0) ×15, (−3, +3) ×14: whole-texel steps at 10 Hz (the scene floors its pan) | 0.56 / 0.47 / 4.14 |

Where the remaining differences are (diff masks inspected):
- **Vignette ring edges** in every scene. The vignette is screen-anchored, so its band edges change when
  the low-res image crosses a texel. This is by design.
- **Animated layers**: grass and flower wind frames, leaf fringes on crowns, water wave lines and depth-band
  contours, cloud-shadow edges, the cube's bob step (shrine pair 60), and mist band contours (glade).
- **Static solids** (pillars, basin, boulders, ruin, trunks) show **no differences** in any inspected pair
  (pairs 1, 2, 3, 15, 30, 45, 60). Static geometry does not crawl in any of the three GIFs.

Stricter check with world time frozen (glade only, because only glade has `?freeze=`):
`tools/shot.sh glade shots/gallery/crawl/frozen/g.png --size 1920x1080 --times 0,0.1,…,0.6 --q "scale=3&pan=1&freeze=1&grade=0"`,
then `tools/crawl.py … --dx 0,1,2,3,4,5,6 --dy 0,0,1,1,2,2,3 --scale 3 --border 48`. Every frame lands on
its expected shift, but **27-81 pixels out of 1.79 M differ (3-9 isolated texels per frame)**, so
`crawl.py` reports FAIL. The texels are scattered through the god-ray area (x 246-1067, y 183-872). Some
are a single bright texel appearing (dust motes: the particles are not texel-snapped). Others are 1-level
colour changes at shaft edges. Owner: atmosphere (`particles.js` / `godrays.js`). It is invisible at
normal viewing, but strictly it is crawl.

Note on the GIFs: at 3× the pan scrolls smoothly in screen pixels (sub-texel offset). The 640×360 GIF can
only show whole texels, so all three GIFs scroll in whole-texel steps.

## Honest status

- All four stills and three GIFs rendered without page or shader errors, and I looked at all of them.
- The renderer delivers the core of the look: a stable texel grid, 1-texel outlines and rims on the correct
  sides, banded toon light, grass that merges into the terrain, post-pass water with reflections, and
  stepped god rays. The shrine is the closest to the references.
- None of the scenes passes the rubric's ship bar (best 18/24, final 17/17/17). The main gaps are value
  and colour balance (pond shade coverage, golden glade darkness), heavy crown rims in the glade, and
  missing hand-made detail on stone compared with t3ssel8r.
- Residual single-texel crawl from dust and god-ray edges in the glade (above). The other scenes have no
  frozen-time variant, so their check above is pairwise on live frames only.
