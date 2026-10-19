# pixel3d: art direction

Three target scenes and the critique rubric. Techniques are in `docs/TECHNIQUES.md`, and the reference
images in `refs/` (private, never commit). Hex codes are sRGB: go through `new THREE.Color(hex)`. Tags:
**[measured]** = sampled from t3ssel8r's images (research/02 §11), **[suggested]** = to tune.

## 0. Conventions shared by all scenes

- Internal image 640×360 (captures at 1280×720, scale 2). Orthographic camera, `pitch = π/6` (30°),
  yaw a multiple of `π/4`. At `viewHeight = V` you see `1.78·V` m of ground across and `2·V` m deep.
- **Placement helper.** Author positions relative to the screen, so the layout survives any yaw:
  ```js
  // ang: 0 = far (screen-up), 90 = screen-right, 180 = near (screen-down), -90 = screen-left. r in metres.
  function place(center, yaw, r, angDeg) {
    const F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const a = THREE.MathUtils.degToRad(angDeg);
    return center.clone().addScaledVector(F, r * Math.cos(a)).addScaledVector(R, r * Math.sin(a));
  }
  ```
  Screen-up distances appear foreshortened by half. Something at r = 8 straight up sits 4 m-equivalent
  above centre on screen, and an object of height h rises `0.87·h` on screen.
- Sun via `sunDirFor(yaw, relAz, elev)` (TECHNIQUES §3.7). Seeds come from `rng(seed)`. Terrain extends at
  least 1.5× past the frame in every direction, so no world edge or sky shows.
- The whole frame keeps to **one palette**. Every colour on screen should trace back to the scene's table
  below, its ramp tones, the outline (darker, cooler) or rim (cream) derivative, or one of the accents.

---

## 1. Scene "shrine" — `scenes/shrine.js`

t3ssel8r's canonical ruined water shrine (`refs/small_pass_0*.png`, `small_water_0*.png`,
`thumb_JMhDEPIJths.jpg`, `thumb_YJSal0UocLY.jpg`, `thumb_pslJg8vpeHo.jpg`, `mbXsO6F.png`).

**Camera:** `target = (0, 0.5, 0)`, `yaw = π/4`, `pitch = π/6`, **`viewHeight = 10`** (36 px/m, ground
17.8 m × 20 m). Static.

**Time and light:** late-morning sun, `sunDirFor(π/4, +25°, 50°)`. Shadows fall up-left, objects are lit
on the left front and in shade on the right. `applyTimeOfDay('noon')`. Clouds: cover so that about 40% of
the ground is in cloud shadow, as large drifting blobs. God rays off. Fog off. Grade: saturation 1.05,
vignette 0.10.

**Composition sketch** (64×18 chars ≈ 640×360; P pillar, p broken pillar, T tree crown, c cobble, d dirt,
s slab, a fallen arch, ~ water, o goblet, ■ cyan cube, ' cloud shadow):
```
+----------------------------------------------------------------+
|ddd cccc   T T          s  s        P              ''''  ccccc  |
|dd ccccc      P        s     aaaaaa       P      '''''''' cccc  |
|  cccc  ''''''        ■   aaa                ''''''''  P   ccc  |
|  ''''''''''   _____________________     p    ''''''''''''      |
|  '''''  P    /   _______________   \           ''''''''    T T |
|  ''''       /   /  ~~~~~ o ~~~~~ \  \     P       '''''   T T T|
|   ''''      \   \_~~~~~~~~~~~~~~_/  /                          |
|  P  ''''     \_____________________/        p     ''''''       |
|      ''''''''''      p                  ''''''''''''''        |
| cc  ''''''''''''''         s   s      ''''''''''''''''    P    |
|ccc T T T  ''''''''           P               '''''''         T |
|cccT T T T T               ''''''''''                      T T T|
+----------------------------------------------------------------+
```
The basin sits slightly below centre and covers about 40% of the frame width. Pillars ring it at about
1.6× the basin radius. Tree crowns enter from the left and right edges and the bottom corners
(foreground occluders). Cobble occupies the top-left/top-right and bottom-left corners, with a reddish
dirt patch top-left.

**Elements** (polar `place(origin, π/4, r, ang)`):
| element | count | size / notes |
|---|---|---|
| octagonal basin (`createOctagonBasin`) | 1 | outer plinth ring across-flats 7.2 m, h 0.35. Inner wall ring across-flats 5.6 m, wall 0.5 thick, top h 0.75. Basin floor −0.30, **water level −0.08**, bounded to the basin. Rotated π/8 so a face fronts the camera. 2 cracked or displaced segments (gap 0.08 m, tilt 4°) |
| goblet fountain | 1 | octagonal base 1.2 across × 0.45, stem 0.35 across × 0.7, bowl frustum 0.6→1.3 across × 0.4 (top at 1.55 m). Stands in the water |
| cyan cube | 1 | 0.35 m, floats at `place(r 2.9, ang 0)` (above the far rim) at y 1.7. Bob ±2 texels with a stepped 2 fps sine, snapped via `camera.snapWorld`. Spin is forbidden (rotation crawls) |
| stacked-block pillars | 8 | 2.3–3.4 m tall, 0.8–0.95 m wide, 5–9 blocks, at r 5.0–6.2, angles ≈ −150, −105, −60, −15, 40, 80, 125, 175 (vary ±10°) |
| broken pillars | 3 | 0.6–1.4 m, top block tilted 8–14°, at ang ≈ −170, 100, 150 |
| fallen arch | 1 | 7 blocks on an arc from `place(r 4.3, ang 20)` to `place(r 5.5, ang 55)`, one end on a broken pillar |
| flat slabs | 4 | 1.0–1.4 × 0.15 × 0.8–1.2, at r 7–8.5, ang −20…+10 (top centre), tilts 2–5° |
| debris cubes | 30–40 | 0.08–0.3 m, clustered at pillar bases and the arch, k·45° yaws, half-buried |
| trees (`kind:'round'`) | 6 | canopy R 1.6–2.2 m, height 3.5–5 m, at r 9–11: ang −75, −100 (left edge), 70, 95 (right edge), −160, 165 (bottom corners, crowns partly cut by the frame) |
| terrain | 48×48 m | nearly flat (A 0.6 m) with a pad flattened under the shrine (r 6 m). Zones: grass, cobble 3 patches (r 2.5–4 m, at the corners), dirt 1 patch (top-left) |
| grass | ~40k total (~6k in view) | Poisson r 0.20, accents 4% |
| flowers | 4% of grass | lilac (70%) + yellow (30%), clustered in 5–8 patches |

**Palette:**
| role | hi | mid | shadow | other |
|---|---|---|---|---|
| grass / terrain [measured] | #BBD985 | #75A558 | #3B6B5A | — |
| stone [measured] | #BBAC97 | #8C7E72 | #5B5A64 | outline ≈ #706D74 [measured], rim ≈ #E2D6BC [derived from #FFFBE6 multiplier] |
| cobble [measured] | #606C77 | #535B6B | #444B5C [suggested] | grout #3F4656 [suggested] |
| dirt [suggested from ref] | #B08A72 | #9C7A66 | #6E5452 | pebbles #C2A58A |
| leaves [measured, Forgotten Gate] | #84B35B | #689763 | #46726C | core #2F5552, tips #B6CC77 |
| trunk [suggested from ref] | #8B8590 | #6B6470 | #4E4A5C | — |
| water [measured] | shallow #A5D2CE | #84B7D2 | deep #79B5C9 | shore #E8FBFF, wave lines #D6F1F5 |
| accents | cube #7FD3F5 / #4BA8E8 / #2F7FC4, rim #D8F6FF [suggested] | flowers #A875D7 #CA91E3 #DC9EFF [measured], #E6D36A | | |

**Signature details** (check all of them):
- [ ] Every protruding block top has a 1-px cream rim, and the overhang underneath has a 1-px darker
      outline. Pillars read as stacked, offset slabs with 3 stone tones.
- [ ] Cloud-shadow blobs on the meadow with blade-fringed edges: lit tufts poke into shadow and the
      reverse.
- [ ] A 1-px pale line where the water meets the basin walls and the goblet base. The goblet is reflected
      (faintly) in the water.
- [ ] The cyan cube is the only saturated cool accent, and it bobs in whole-texel steps.
- [ ] Cobble corners have 1–2 px grout lines that stay stable while panning.
- [ ] Octagon edges show clean 2:1 staircases, and the near face's top edge is perfectly horizontal.
- [ ] Tree shadows are round jagged blobs. Foreground crowns frame the bottom edge.

**Avoid:** pure black outlines, symmetric pillar placement, smooth shading on the stone, grass on stone
or in the basin, flowers spread evenly, sky visible at the top edge, a cube spinning smoothly, trees
covering the basin.

---

## 2. Scene "pond" — `scenes/pond.js`

A meadow pond with reflections. Built from T's "Forgotten Gate" palette (`refs/thumb_ERA7-I5nPAU.jpg`,
`thumb_YJSal0UocLY.jpg` water). It is the water and wind showcase.

**Camera:** `target = (0, 0.2, 0)`, **`yaw = −π/4`** (a different 45° stop from the shrine),
`pitch = π/6`, **`viewHeight = 12`** (30 px/m, ground 21 m × 24 m). Static.

**Time and light:** morning, `applyTimeOfDay('morning')`, `sunDirFor(−π/4, +55°, 38°)` (front-right, so
reflections stay bright and tree shadows fall back-left over the far bank). Clouds: cover so about 30%
of the ground is shaded, drifting slowly. Very faint distance fog (amount 0.15) on the far bank only.

**Composition sketch** (R rock, r reed clump, L lily pads, T tree, * flowers, ~ water, = shore sand,
' shadow):
```
+----------------------------------------------------------------+
| T T T T      ''''''      T T T         ****      T T T  '''''  |
|T T T T T  ''''''''''    T T T T   **        '''T T T T''''''   |
|  '''''''''====================''''''        '''''''''''        |
|  ''''''====~~~~~~~~~~~~~~~~~~~~=====      R               **   |
|  r r ===~~~~ (reflected trees) ~~~~~==   RRR R                 |
|   r ==~~~~~ L  L ~~~~~~~~~~ L ~~~~~~== RRRR      ****          |
|  ** ==~~~ L ~~~~~~~~~~~~~ L  L ~~~~~=r r                        |
|     ===~~~~~~~~~~~~~~~~~~~~~~~~~~===                ''''''''''  |
| ****   =======~~~~~~~~~~~~=======          ****   ''''''''''''' |
|              ==========   R                  ''''''''''''''''  |
|  T T T                       ****                     T T T T   |
|T T T T T                                            T T T T T T|
+----------------------------------------------------------------+
```
A kidney-shaped pond fills the left-centre (about 45% of the frame width). Trees on the far bank are
reflected in it. A boulder cluster sits on the right bank, reed clumps at the left and lower-right shallows.
Foreground tree crowns occupy the bottom corners. Flower patches are scattered along the meadow.

**Elements:**
| element | count | size / notes |
|---|---|---|
| pond | 1 | terrain basin 10 m × 6.5 m (two overlapping ellipses), depth 0.9 m, **water level 0.0**, terrain ≥ +0.15 outside, so `bounds` = a rectangle around it. Gentle banks on the near side (sand band 0.3–0.5 m), a steeper far bank with 2 terrace steps (s 0.5 m) |
| lily pads | 14–20 | discs r 0.18–0.35 m (octagonal, 1/8 notch cut out), y = level + 0.01, flat, `outline:'none'`, clustered in 3 groups. 3 of them carry a 2×2 px pink flower |
| reeds | 4 clumps × 10–18 | sprites like grass but 1 px × 14–24 px tall stalks, 2–3 cattail heads (2×4 px), wind frames at 3 fps, in the water ≤ 0.3 m deep and on the shore |
| boulders | 6–8 | r 0.35–1.1 m, 2 of them half-submerged (shore line around them), moss on the tops |
| shore stones | 15–25 | 0.08–0.2 m pebbles along the near bank, partly underwater |
| trees | 7 | 3 on the far bank (R 1.8–2.4, height 5–6 m: big reflections), 1 right-middle, 3 foreground crowns at the bottom corners |
| grass | ~60k total (~7k in view) | r 0.20, accent 6% |
| flowers | 8% | lilac 40%, yellow 35%, white 25%, in drifts |
| water | `createWater` | reflect 0.35, 3 depth bands, wave lines 1 per 1.6 m cell, sparkles |

**Palette:**
| role | hi | mid | shadow | other |
|---|---|---|---|---|
| grass [measured, Forgotten Gate] | #B6CC77 | #84B35B | #5A887E | deep shade #46726C |
| stone / boulders [measured] | #C2AE96 | #7C7D8F | #727388 | moss #94AA6F |
| sand / shore [suggested] | #D8C79A | #C2AE84 | #8D8A86 | wet sand (below level + 0.1) #9E9A86 |
| water [measured] | shallow #A5D2CE | #84B7D2 | deep #79B5C9 → #4F86A6 [suggested] | shore #E8FBFF, waves #D6F1F5, sky clear #CFE6EC |
| leaves [measured] | #84B35B | #689763 | #46726C | core #2F5552, tips #B6CC77 |
| trunk [measured, 2021] | #7A5A5E [suggested hi] | #654853 | #574E68 | — |
| lily pads [suggested] | #8CC06A | #5E9A5A | #3F6E55 | flower #E7A3C0 |
| reeds [suggested] | #A9BF6A | #8DA65A | #5E7A4E | cattail #7A5236 |
| flowers | #A875D7 #CA91E3 #DC9EFF [measured] | #E6D36A | #EDEBDA [suggested] | |

**Signature details:**
- [ ] Trees and boulders reflected in the pond, each reflection touching its waterline, wobbling by whole
      texels.
- [ ] A 1-px pale shore line around half-submerged boulders and reed stems. The near bank fades through
      2–3 depth tints with hard steps.
- [ ] Horizontal 1-px wave lines blink in and out. A few 1-px sparkles.
- [ ] Lily pads read as flat octagonal discs with a notch, no outlines, slightly brighter than the water.
- [ ] Wind is visible as stepped frames on grass and reeds, a wave travelling across the meadow.
- [ ] Submerged rock parts are visible, tinted and outlined (refraction of the outlined image).

**Avoid:** water as a flat opaque blue, gradient depth, blurry or offset reflections, outlines around the
water surface, grass under water, the pond centred in the frame, too many lily pads (≤ 15% of the water
area), particles over the water.

---

## 3. Scene "glade" — `scenes/glade.js` (`?tod=golden` default, `?tod=night`)

A forest clearing with god rays, built from T's god-ray forest and misty hill shots
(`refs/thumb_fSNdZ82I-eQ.jpg`, `thumb_ZsMHY4LDyRE.jpg`, `m2.jpg` top row, `thumb_39A0n24PX8g.jpg`).

**Camera:** `target = (0, 0.6, 0)`, `yaw = π/4`, `pitch = π/6`, **`viewHeight = 11`** (33 px/m, ground
19.5 m × 22 m). Static.

**Time and light:**
- **golden** (default): `applyTimeOfDay('golden')`, `sunDirFor(π/4, −135°, 24°)`. The sun is back-left,
  so shafts run diagonally from upper-left to lower-right across the clearing. Godrays: strength 0.45,
  4 levels, gap 0.45, colour from sun #FFC27A. Mist: top = ground + 0.8 m, amount 0.5, drifting. Distance
  fog behind the clearing at amount 0.4, colour #C9B9A6. Dust motes 300 in shafts. Clouds off (the canopy
  provides the shadow pattern). Grade: saturation 0.95, vignette 0.18.
- **night**: `applyTimeOfDay('night')` (moon `sunDirFor(π/4, +40°, 45°)`, blue). Godrays 0.15 #9FB6E8
  (moonbeams). Fireflies 90. Mist amount 0.35, colour #1E2A44. Optional lantern on the ruin stub (#FFC46B,
  4 levels, 8 fps flicker). Grain 0.035, vignette 0.35.

**Composition sketch** (T trunk + crown, / shafts, M mist, R mossy boulders, l fallen log, u ruin stub,
m mushrooms, . dust/fireflies):
```
+----------------------------------------------------------------+
|TTTTTTT  TTTTTT   /  TTTTTTT    /   TTTTTT     TTTTTTTTTTTTTTTTT|
|TTTTTT  / TTTT   /  . TTTTT    /  .  TTTT    /  TTTTTTTTTTTTTTTT|
|TTTT    /  |    /  .    |     /   .   |     /  .  TTTTTTTTTTTTTT|
| |     /      ./     .       /   .         /   .    |  TTTTTTTTT|
|  MMMMMMMMMMM/MMMMMMMMMMMMMMM/MMMMMMMMMMMMM/MMMMMMMM     | TTTTTT|
|   M  RRR   / . u u    .    /  .       llllll    MMMMMM      |   |
|  MM RRRR  /   uuu  m m    /    .   lllll          MMMMMM        |
|    MMMMMM/MMMMMMMMMMMMMMM/MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM  TTTT  |
|TTT      /    .     .    /    .     .      .         TTTTTTTTT   |
|TTTTT   /       m       /       RR                 TTTTTTTTTTTTT |
|TTTTTTT        .       /     .                   TTTTTTTTTTTTTTTT|
|TTTTTTTTTT                                     TTTTTTTTTTTTTTTTTT|
+----------------------------------------------------------------+
```
A ring of tall trees (dense crowns along the top edge and both lower corners) encloses an open clearing
that is 55–60% of the frame. Hard light shafts cross the clearing and land as lit patches on the grass.
Low mist pools in the clearing. A mossy boulder group sits left of centre, a ruin stub centre-left, a
fallen log right of centre, and red mushroom accents.

**Elements:**
| element | count | size / notes |
|---|---|---|
| trees (`kind:'tall'`) | 12–14 | canopy R 1.8–2.6, crown base at 3–4 m, top 6–8 m, trunks 0.3–0.45 thick. Ring r 8–12 m around the clearing. The far-side crowns overlap the top edge. Cores cast the shaft pattern |
| bushes | 4–6 | `kind:'bush'` R 0.8–1.2, at trunk bases |
| boulders | 5–7 | dark violet r 0.4–1.2 with moss caps, a cluster left of centre |
| ruin stub | 1 | 3–4 stacked blocks (1.1 m), plus 2 slabs and debris |
| fallen log | 1 | 8-sided cylinder r 0.25, 3.5 m, 45° yaw, moss on top, 2 branch stubs |
| mushrooms | 5–8 | 3–5 px sprites: cap #B5443F / #8E3135 [suggested], stem #E8DCC0. Grass-sprite recipe, accent |
| grass | ~50k total | r 0.22. Under the trees use the dark-grass zone (no hi band, because canopy shadow is a cast shadow anyway) |
| flowers | 3% | lilac only (#A875D7 / #CA91E3) |
| particles | golden: dust 300 (shafts only), leaves 25. night: fireflies 90 | see TECHNIQUES §8.3 |

**Palette (golden):**
| role | hi | mid | shadow | other |
|---|---|---|---|---|
| grass [measured, god-ray forest / golden hill] | #AF993A (in-shaft lit) | #909866 → #75893D | #374B58 | — |
| rock [measured] | #786D83 | #4C4B6C | #42445C | rim orange #D98C4A [suggested], moss #94AA6F |
| leaves [suggested golden] | #B8B04E | #6E8A45 | #3C5550 | core #26413F |
| trunk [measured, 2021] | #8E5E52 [suggested] | #654853 | #574E68 | — |
| haze / fog [measured] | haze #5C666B | fog #757881 / #787380 | golden fog #C9B9A6 [suggested] | |
| shafts [measured] | #C5ABAB | #9D9391 | — | dust #FFE2B0 [suggested] |

**Palette (night)** [suggested]: grass hi #6E9C93 / mid #3F6A6C / sh #22394A, stone #8C8FA6 / #5F6079 /
#383A52, leaves #4E7A6A / #2E5050 / #1A2E36, sky #141B33, mist #1E2A44, fireflies #E8F27A (halo
#8FB04A), lantern #FFC46B.

**Signature details:**
- [ ] Shafts are hard-edged parallel diagonal bands with 2–4 brightness steps. They light up the dust and
      land as bright, blade-fringed patches on the grass.
- [ ] Back-lit crowns: a bright rim on the sun side, dark cores, and a darker tone than the meadow shade.
- [ ] Mist in hard steps, pooled low and drifting. Distant trees lift toward the fog colour.
- [ ] Moss caps and orange sun rims on the boulders.
- [ ] Night: readable blue silhouettes, blinking 1-px fireflies with plus-shaped halos, texel grain, a
      banded vignette.

**Avoid:** soft or noisy volumetrics, rays that swim with the camera, fog gradients, an overexposed
golden wash (keep grass shadow #374B58 visible), fireflies brighter than the shafts, a symmetrical tree
ring, a fully closed canopy (the clearing must read).

---

## 4. Critique rubric (critic agent)

Score each criterion **0 = fails, 1 = partly, 2 = meets** from the 1280×720 capture (Read it, then zoom on
crops). Use `--q debug=normal|flags|raw` and, where noted, multi-frame captures. **Ship bar: ≥ 19/24 with
no zeros on 1, 2, 3 or 4.**

| # | criterion | how to check | 2 = |
|---|---|---|---|
| 1 | **No pixel crawl** | camera crawl test (TECHNIQUES §1.3), or 2 captures differing only by a whole-texel pan → shifted diff | 0 changed pixels in the interior. Animated layers frozen at the same t |
| 2 | **Uniform pixel grid, no mixels** | zoom on edges, sprites, particles, outlines, wave lines | every feature is a multiple of one 2×2 screen block. No half-size or blurred pixels, no rotated sprite texels |
| 3 | **1-px lines only** | zoom on silhouettes and creases | outlines and rims are exactly 1 texel, never doubled at corners or broken into dashes on straight edges |
| 4 | **Correct line sides** | inspect block tops, inner corners, object overlaps | dark lines on the nearer object's border. Cream rims on convex edges only (top faces), never in concave corners, never on grass or leaves |
| 5 | **Outline colour** | sample line pixels | each outline is a darker, cooler shade of its own object. No black, no single global ink colour |
| 6 | **Flat banded lighting** | crop flat ground and faces, count colours | ≤ 3 tones per material (+ line + rim). No gradients on lit surfaces. Band edges clean |
| 7 | **Grass blends into terrain** | compare tufts with the ground in uniform areas, and at boundaries | tufts invisible inside a band, visible only as fringes at shadow, cloud and band edges and around object bases |
| 8 | **Cohesive palette, warm light / cool shadow** | pick colours | all colours trace to the scene palette. Shadows clearly cooler (teal, slate, violet) than lights. No pure black or white |
| 9 | **Readable silhouettes and value structure** | view at 25% size or squint | the subject separates from the ground. Canopies darker than meadow shade. Big shadow shapes ~30–50% of ground |
| 10 | **Geometry discipline** | inspect architecture and rocks | 45°-aligned forms, 2:1 staircases at yaw 45°, facets ≥ 3 px, no noisy edge speckle on organic solids |
| 11 | **Scene-specific signature details** | the scene's checklist above | all boxes ticked (1 = at least half) |
| 12 | **Animation cadence** (multi-frame: `--times 0,0.33,0.66,1`) | compare frames | wind, water, particles and bobbing step at low fps (3–8). Nothing glides sub-pixel. Clouds drift, static solids identical between frames |

The critic reports the per-criterion scores, the total, and for each score < 2 the exact crop location
(x, y in 1280×720) plus the owning module (camera, outlines, lighting, terrain, grass, trees, water,
atmosphere, scene).
