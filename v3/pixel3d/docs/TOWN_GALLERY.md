# Hollowmere gallery (final town)

Final renders of the composed town (`scenes/town.js`, `scenes/town-life.js`), produced by the gallery agent on
2026-10-16 after fix round 5 (docs/TOWN.md §12.8). Everything was rendered headless on **render-host** (RTX 4090,
Chromium / ANGLE / Vulkan) at 1280x720 (scale 2, i.e. 640x360 internal). I looked at every PNG cited here, and at
contact sheets of every GIF's frames. **No render printed page errors, shader errors or capture failures**, and the
shader-program count stayed the same before and after every `--bench` run.

The verdicts in "User requests" are from the per-request verifiers' rounds (their renders are under
`shots/verify-*`). I did not re-run their checks. The one exception is the door data check, which I re-ran (see
doors-visible).

All files are in `shots/town-gallery/`:

| path | what |
|---|---|
| `contact-sheet.png` | 30 key frames at quarter size (stills, the low tier, one frame of each GIF); sources copied to `sheetsrc/` |
| `stills/` | overview / iso / vote / gameplay renders + `sheet.png` + `report.txt` (calls, tris, programs, lights, cut) |
| `quality/` | both quality tiers with `--bench 60` + `report.txt`; `quality/rep/` = 3 interleaved high/low repeats |
| `life/*.gif` | 7 life animations, 640x360 (nearest-neighbour half of the 1280x720 frames = exactly the internal image) |
| `life/<name>/f-NN.png` | the 1280x720 source frames; `life/<name>-sheet.png` = 6-9 sampled frames; `life/*.log` = render logs |
| `life/run.sh` | the frame script (run on the host from `~/pixel3d`) |

Commands (all from the repo root on the Mac):
```sh
tools/townshots.sh shots/town-gallery/stills --jobs '<21 jobs below>' --par 4
tools/townshots.sh shots/town-gallery/quality --jobs 'q-{high,low}-{noon,golden,night,h14,door5,ov}' --bench 60
tools/townshots.sh shots/town-gallery/quality/rep --jobs 'h1,l1,h2,l2,h3,l3 (square noon)' --bench 60
ssh render-host 'cd pixel3d && bash -s' < shots/town-gallery/life/run.sh     # after tools/remote.sh true (sync)
tools/remote.sh python3 tools/sheet.py gif|sheet ...                     # GIFs + contact sheets
tools/shot.sh town shots/town-gallery/stills/doordump.png --q 'cam=overview&doorDump=1'   # door data check
```

---

## 1. Overview, iso, vote (`stills/`)

| file | query | what it shows |
|---|---|---|
| `ov-noon.png` | `cam=overview&tod=noon` | The whole map: the clock tower at the head, a ring of 15 distinct cottages round the circular square, the dial-ring voting circle and dais, the river and bridge on the west, and a spring forest rim (lime and mid greens, pink and white blossom). The corner cottages are turned 45°, the side rows 12°. |
| `ov-golden.png` | `cam=overview&tod=golden` | Low north-west sun. Long shadows run toward the camera, windows glow, the plaza is lit warm gold, and the tower's shadow band falls across the circle. The trees stay green. |
| `ov-night.png` | `cam=overview&tod=night` | Moonlit blue-teal. Every window glows, the dais and seat candles light the circle, and the street lamps cast dithered warm pools on the grass (clearest at the bottom corners). |
| `iso-noon.png`, `iso-golden.png` | `cam=iso` | The 45° stop from the south-east: the river curving round the west, wildflower banks, and the cottages' side walls (modelled on all four sides). |
| `vote-golden.png` | `cam=vote&tod=golden` | The vote preset: the whole circle plus the dial (it reads about 7:00). The clock tower's shadow is a wide band down the middle of the circle. |

## 2. Gameplay camera (`stills/`, viewHeight 12, cut-away on)

The square centre (`sq-noon`, `sq-golden`, `sq-night`), plus 6 spots round the square at noon and night:

| spot | focus | noon / night |
|---|---|---|
| north (tower door) | 22.5, 12.5 | `gp-n-noon` / `gp-n-night` |
| north-east (Ravenscroft, fountain, Mossbank's corner) | 30.5, 14.5 | `gp-ne-noon` / `gp-ne-night` |
| east (signpost, cart, bench, the toadstool) | 31, 20.5 | `gp-e-noon` / `gp-e-night` |
| south (Gloamend Clockworks below the circle) | 22.5, 27.5 | `gp-s-noon` / `gp-s-night` |
| west (noticeboard, bench, the treehouse and the boot) | 14, 20.5 | `gp-w-noon` / `gp-w-night` |
| north-west (mill wheel, red stall, the well) | 14.5, 14.5 | `gp-nw-noon` / `gp-nw-night` |

What reads:
- **The voting circle is fully visible** in every square view. All 15 seat stones, the candles and the dial ring are clear. House-9's roof is cut away by the circle cut, so its clock gable sits just below the ring (`sq-noon`, `gp-s-noon`).
- **Noon:** crisp, short sun shadows from the stalls, the well, the braziers, the banner poles and the people. The cottage fronts show their doors: the purple door, the tower's arched door, the blue tudor door and the red gothic door (`gp-n-noon`, `gp-ne-noon`). Stall keepers, the well-drawer, a bench sitter, the hound, the cat and the crows are out.
- **Golden (`sq-golden`):** the square is warm and gold, the circle is crossed by long tree and building shadows, and the seat stones keep their own shadows.
- **Night:** a warm dithered pool spreads from the dais braziers over the inner circle. Each seat candle has its own pool, windows glow, and the street lamps light the lanes (`gp-e-night`, `gp-w-night`). Fireflies show as single warm pixels.

- House-8 (Hearthstone Cabin, whose door the r1 verifier could not see) now shows its red plank door under the porch,
  left of the stone chimney, from both `gp-s-noon` and `gp-e-noon` (crops `stills/z-h8-s.png`, `z-h8-e.png`).

Flaws I saw in these frames:
- `gp-s-noon`: the cut-away removes the top of house-9's roof. That is by design (the voting circle comes first), but the cottage reads as a front with a sliced-off roof.

## 3. Quality tiers (`quality/`, `--bench 60`, 1280x720, gameplay camera unless noted)

Frame tris = shadow + colour + normal passes. The host was shared during the run (load average 3.8-5.8, GPU about 19 %
busy before the repeats), so single means vary by up to about ±1 ms.

| view | high: tris / calls / mean / max ms | low: tris / calls / mean / max ms |
|---|---|---|
| square noon | 862k / 345 / 3.42 / 9.3 | 360k / 290 / 3.76 / 15.0 |
| square noon, 3 interleaved repeats (`rep/`) | 2.82, 2.75, 4.09 mean | 2.32, 2.34, 3.05 mean |
| square golden | 903k / 347 / 2.95 / 8.6 | 345k / 297 / 3.36 / 14.6 |
| square night | 845k / 308 / 2.78 / 12.5 | 346k / 250 / 2.66 / 19.9 |
| focus house-14 (river in view) | 1.73M / 489 / 4.24 / 10.5 | 494k / 332 / 3.39 / 14.2 |
| player at house-5's door (37.5, 19.8) | 1.19M / 374 / 3.35 / 12.3 | 445k / 324 / 4.65 / 22.5 |
| overview | 2.07M / 930 / 8.35 / 23.3 | 816k / 598 / 3.89 / 11.0 |

Programs stayed constant in every run (high 34-40, low 33-39).

- **Geometry:** the low tier meets the ~400k target at the square (345-360k). It is still over at house-14 (494k) and
  at house-5's door (445k).
- **Time:**
  - In the interleaved repeats, low is about 0.4-1 ms faster at the square.
  - In the single first runs, low was slower at noon and golden. That is host noise: the 4090 is not limited by geometry here.
  - The overview is where low clearly wins (3.9 vs 8.4 ms), because it skips the river's reflection render.
- **Look** (`q-low-noon`, `q-low-h14`, `q-low-door5`, `q-low-ov` against high):
  - The square at low is indistinguishable from high apart from no cloud shadows.
  - At house-14, low's pines are blobbier and the river reflects only the sky.
  - The overview's forest is a little flatter at low.
  - Readability is unchanged in all of them.
- A laptop iGPU estimate is in docs/TOWN.md §12.6. It is an estimate, not a measurement.

## 4. Life (`life/*.gif`, 640x360)

| GIF | scene query | frames (sampled → played) | what it shows (from the frames I looked at) |
|---|---|---|---|
| `doors.gif` | `town-life?demo=day&shot=doors` | 71, t 3-17 s @ 5 fps, real time | The tower's double door swings open and the lamplighter keeper walks out (t ≈ 6). The weaver crosses the north lane, house-2's blue door swings outward, she stands in the doorway and goes in, and the door closes again (t ≈ 11-15). Walkers, the hound and the crows move on the square throughout. |
| `smoke.gif` | `town-life?demo=day&focus=24.5,-5.5&vh=9&cut=0` | 31, t 0-5 s @ 6 fps, real time | 3-4 seeded grey puffs rise and grow from the chimneys of house-1 and house-2 beside the belfry. The bell swings at t 1 and the crows lift off. |
| `crows.gif` | `town-life?demo=day&shot=crows` | 49, t 0-6 s @ 8 fps, real time | Crows peck and bob on the square's setts and the ring while the townsfolk walk by. |
| `strike.gif` | `town-life?demo=day&shot=belfry` | 33, t 0-4 s @ 8 fps, real time | The clock at 11:59 ticks to 12. The bell swings in stepped poses (t ≈ 1-1.5), and the crows on the pinnacles scatter in a V-wing spiral round the spire (t ≈ 2-4). |
| `ceremony.gif` | `town-life?demo=ceremony&shot=wide` | 71, t 0-28 s @ 2.5 fps, played at 5 fps (2x) | The seats fill, the keeper takes the dais, and the braziers flare at the nomination. The nominee's seat glows amber, and voters raise their hands one by one as the brass hand sweeps the ring. Then the tally and the execution. Seats 3 and 11 are ghost / dead. |
| `folk.gif` | `town-life?demo=day&shot=wide` | 57, t 0-14 s @ 4 fps, real time | The day timeline: stall keepers serving, the well-drawer hauling, a bench sitter, a child chasing the cat, the keeper and the hound crossing the circle, the crows. |
| `dusk.gif` | `town-life?demo=dusk&focus=22.5,14.5&vh=16` | 55, t 0-18 s @ 3 fps, played at 6 fps (2x) + 9 frames of `demo=night` | The windows wake one by one in a stepped flicker: the tower first, then the cottages in hashed order, while the lamplighter walks out to light the lamps. It ends with a **hard cut** to the night preset at the same camera. |

Animation quality from the frames:
- Everything is stepped. The doors swing in 3-4 poses and the bell in stepped poses.
- The static solids hold still between frames.
- Movers stay on whole texels. The smoke is pixel-snapped puffs, not soft particles.

Life flaws:
- **Time of day:** there is no continuous golden → night transition. `dusk.gif` keeps the golden sky and ramps while the lights come on, then cuts to night.
- **Readability at the gameplay zoom:**
  - The smoke is light grey against bright spring foliage, so it is subtle there.
  - The crows are a few pixels each at vh 9-12.
- **Smoke framing:** with the cut-away on (the first attempt), a focus point placed in the forest made the "player" cut window open a sky-coloured, rounded hole in the canopy beside the belfry (`life/z-skyhole.png`). That only happens with an off-map focus and does not occur in gameplay views, but it is why `smoke.gif` uses `cut=0`.

---

## 5. User requests (docs/TOWN.md §11): verified status

Per-request verifiers (`shots/verify-<id>-r<round>/`) ran up to 3 rounds. The **final** status is the latest round
for each request.

| request | final | rounds | evidence (final round) |
|---|---|---|---|
| **circle-visible**: the voting circle 100 % visible at the gameplay camera (house-9) | **PASS** (r1) | r1 pass | 13 frames, including a ceremony with seated villagers. All 15 seat stones and their occupants are visible at every dais / south-seat focus, up to z 28.5, at noon, golden, night and low. A `cut=0` control shows house-9's roof would otherwise hide seats 7-8 up to the chest. A standing figure on seat 7 / 8 was worked out from the code, not rendered. My `sq-*` and `gp-s-*` frames agree. |
| **corners-diagonal**: house-14 / house-4 turned 45° with diagonal door lanes | **PASS** (r2) | r1 fail (lanes were straight stubs), r2 pass | Both turned ±45° (stats.placed ry ±0.785). Diagonal cobble lanes run (7,12)→(13,18) and (37,12)→(31,18), and both doors read at noon, golden and night. Minor: at the gameplay camera house-13's roof covers the mill's SW porch corner. In the overview the side-row cottages hide most of each corner front. |
| **side-rows-visible**: each side-row cottage recognisable when the player stands in front | **PASS** (r3) | r1 fail (2.6 m radius only), r2 fail (black slab of house-6 over house-5's counter), r3 pass | 25 renders at the four side-row doors, the lanes and the foci, at noon, golden and night. Each focused cottage reads whole, and the cottage in front is cut to a clean ground-storey section. In the overview (cut-away off by design) house-6 / house-12 still overlap house-5 / house-13. |
| **doors-visible**: doors visible / appealing, layout deltas recorded, layout.js the single source | **FAIL** (r3) | r1 fail, r2 fail (cut-away leftovers), r3 fail | All 15 doors read at the gameplay camera focused on each cottage, and the §12.1 deltas table matches `LAYOUT_DELTAS`. It fails on the data: `stats.doorMismatch = [['house-14', 0.9, 1]]`, because the mill's door anchor is 0.9 m from layout.js's door point. `src/town/pieces/house-14.js:662` still carries the unresolved CONTRACT-REQUEST, and §12.1 says "none today". **I re-ran `doorDump=1` for this gallery: still `[['house-14', 0.9, 1]]`, and the CONTRACT-REQUEST line is still there.** r3 also noted cut-away blemishes on the west-row foci. |
| **spring-trees**: spring foliage, never autumn / winter / near-black | **PASS** (r2) | r1 fail (afternoon mustard, golden near-black), r2 pass | 19 scenes at every time of day plus low. The trees are fresh greens with lime new growth, white and pink blossom, and leaf-clump pines. The south edge is low hedges, so the lower-ring fronts stay clear. My `ov-golden` / `iso-golden` agree: the trees stay green at golden. |
| **mossbank-foliage**: real foliage on house-4 | **PASS** (r2) | r1 fail (ferns unreadable, bare camera-facing wall, a house-5 pole in front), r2 pass | Sprite grass tufts on the turf roof, wildflowers, fern rosettes, moss cushions, toadstools, ivy over the east wall, and a climbing rose round the door. It all moves in the wind. The back walls are nearly bare (unseen from the gameplay camera). |
| **shadows**: t3ssel8r-style shadows and light, kept cheap | **PASS** (r3) | r1 fail, r2 fail (forest-edge lamp lost its shadow; faint lamp pools), r3 pass | Crisp noon shadows with contact lines and no acne. At golden the tower's shadow lies across the circle. There is canopy dappling, drifting noon cloud shadows, and warm dithered night pools. The whole-texel crawl shows no shadow shimmer (the remaining crawl pixels are the dial hand / sparkle). The low tier keeps its shadows. My `vote-golden`, `sq-golden` and `sq-night` agree. |
| **perf-tier**: `?quality=low` ≤ ~400k tris at the gameplay camera, both tiers benched | **PASS** (r2) | r1 fail (low 518-532k), r2 pass | Low is 345-360k at the square with about 2.4 ms mean on the 4090, and both tiers are reported. My bench (§3) agrees for the square. Other spots are still over the 400k target (house-14 494k, house-5 door 445k), and the low-vs-high time saving on the 4090 is within host noise. |

**Still failing after 3 rounds: doors-visible.**

## 6. Honest known flaws (final town)

1. **doors-visible fails** on data: house-14's door anchor does not match layout.js (`doorMismatch`), which contradicts
   §12.1's "none today". The doors themselves read at the gameplay camera.
2. **The overview / iso still stack the side rows** (house-6 over house-5, house-12 over house-13). The cut-away is off there by design, and the 12° turn only partly separates them.
3. **Low tier:** it is over the 400k target away from the square (445-494k). On the 4090 its speed gain is about the size of the host noise.
4. **Life:**
   - No continuous dusk → night transition.
   - Smoke and crows are subtle at the gameplay zoom.
   - Using the cut-away with an off-map focus opens sky-coloured holes in the canopy (debug framing only).
5. **The cut-away is visible as a cut.** House-9's roof is sliced in the south square views, and cut neighbours show section interiors. That is the designed trade for an always-visible circle and doors, but it is not invisible.
