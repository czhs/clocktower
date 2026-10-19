# Cast porting guide — v1/v2 Clocktower sprite → pixel3d character

> **Unattended-run rule (read first):** these runs go overnight with nobody at the keyboard. NEVER run a raw `rm`
> (any `rm`/`rm -f`/`rm -rf`, especially with a `*` glob): it triggers a permission prompt for the user and your agent stalls
> until someone clicks. To clear old renders use `tools/clean.sh shots/<your-dir> ['*.png']` (local + render host, only
> inside shots/ or out/), or simply write into a fresh versioned folder (`shots/<you>/r2/`). Same for other prompt-prone
> commands: no `sudo`, no deleting outside shots/out, no editing files outside the repo.

> **Clocktower-only rule (user, 2026-10-16):** cast members are used ONLY as player characters in the Clocktower social-deduction
> game. NO attacks, weapons swings, combat smears, hurt/hit reactions or fighting poses — props (sword, shovel, staff) are worn/held
> for identity, never swung at anyone. Clips the game actually uses: **idle**, **walk** (THE game-speed gait; `run` is optional/low
> priority — the game has one movement speed), **talk** (speaking loop), **vote** (raise hand/wing/paw + hold), **point** (the game's
> shared emote: point toward someone), **die** (a gentle, non-violent collapse/fade to a held pose — executions and night deaths
> happen off-screen), **ghost** idle (dead players hover as a pale translucent-looking ghost; also a "ghost-spent" variant = dimmer,
> used after the ghost's one vote), and ONE social signature emote from the blurb (a gesture, not an action against anyone).
> Smears are for quick gestures (a pointing flick, a wave), not strikes. Critics: score these clips, ignore missing combat.

> **Storyteller (user, 2026-10-16):** `storyteller` is a real character (the game's human host, not a player) and must be
> VISUALLY DISTINCT FROM EVERY OTHER CAST MEMBER — the most unmistakable silhouette in the town at 25 %: tallest figure, the
> only deep purple (robe with gold trim + stars), void face with glowing amber eyes, warm lantern + tall clock-topped staff,
> robe hem hides the feet (v1 sprite + packages/assets/scripts/cast/storyteller.ts). Do NOT let it read like the keeper/wanderer
> test characters or any hooded cast member (green-hood, crow): check the 25 % line-up against ALL finished characters.
> Game behaviour to animate: it never votes, dies or becomes a ghost; it can travel up to 4× player speed (a gliding robe
> sway / fast drift that still reads at 4× — no running legs); it "poofs" in when it appears (a short arrival/vanish FX);
> clips: idle, walk (+ fast travel), talk, point, an "appear/vanish" emote and one signature (e.g. lifting the lantern /
> consulting a grimoire / the clock-staff chiming). Lantern = warm quantized light at dusk/night.

> **SKIPPED (user, 2026-10-16): `nicksong`** — do not build, render, critique or refine it for now; its agents should stop and
> return a minimal "skipped by user" result. Exclude it from line-ups/galleries. (List: pipeline/skip.txt.)

> **greenting override (user, 2026-10-16, updated):** identity = the USER reference `refs/cast/greenting.png` — "it should
> basically be like **Joguman**": a simple soft rounded green creature with a long body/neck, stubby arms and legs, a rounded head,
> and a tiny simple face (two dot eyes + small smile) placed **off to the side of the head** (profile-ish, toward the snout), not
> centred. Darker-green outline, no clothes, deadpan-cute and silly (out of place in town is fine). (Magenta in turnaround-isolated.png is only the
> stray-pixel debug marker, not a colour.) The v1 sprite/.ts is NOT the identity. Critics: judge against this reference.

Owner: refs (this file and `refs/cast/**`). Read this BEFORE the playbook stages for a cast member. It covers what is
specific to porting an existing 2D Clocktower sprite: identity, scale, body plan, the standard cast clip list, game
speed, faces/expressions, and one card per cast member. Everything else (stages, rubric, checks) is in
`docs/CHARACTER_PLAYBOOK.md`, `docs/CHARACTERS.md`, `docs/CHARACTER_LEARNINGS.md`.

Contents: 1 Inputs · 2 What the refs show (read this) · 3 Identity · 4 Scale · 5 Palette · 6 Body plans ·
7 Standard clips per body plan · 8 GAME SPEED (numbers, tested recipe) · 9 Faces and expressions in the new style ·
10 Blurb → personality → timing · 11 "## Unique to me" design-sheet section (mandatory) · 12 Cast cards (all 32) ·
13 Pitfalls · 14 Tools in this folder.

## 1. Inputs (per cast member `<id>`)

| what | where | use it for |
|---|---|---|
| reference sheet | `refs/cast/<id>.png` | rows idle, walk1–4, ghost idle; columns = the 8 facings labelled with the **pixel3d dir** (0 S, 1 SE, 2 E, 3 NE, 4 N, 5 NW, 6 W, 7 SW — the v2 order is the same); ×6 nearest; a 1× / 2× idle strip at the bottom (true game size) |
| whole cast | `refs/cast/_all.png` (idle at S / SE / E / N, ×3), `refs/cast/_lineup.png` (all 32 at SE, ×4, shared baseline, height px) | family consistency, silhouette distinctness, relative scale |
| numbers | `refs/cast/_stats.json` | opaque height/width px per facing, walk bob, the 12 most used colours with shares (palette source) |
| roster | `refs/cast/_src/roster.json` (copied from `pipgws/packages/assets/src/cast.ts`) | name, blurb, kind, course, `lantern` |
| draw code | `~/Desktop/pipgws/packages/assets/scripts/cast/<id>.ts` (READ ONLY) | the header comment is the design brief (parts, props, which hand); the code says what moves in the walk |
| raw sheet | `refs/cast/_src/cast.png` + `cast.json` (copies) | re-crop with `tools/remote.sh python3 refs/cast/_src/crop_cast.py` |

Look at your `refs/cast/<id>.png` with the Read tool before writing the design sheet, and again next to your turnaround
at the end (the critic compares them).

## 2. What the refs show (things the brief's wording does not)

- **Almost the whole cast is UPRIGHT and CLOTHED** (chibi bipeds): fox, owl, goat, rabbit, mole, clarabelle (cow),
  opal (otter), mincut (red panda), maxflow (fox), theo-rem (hedgehog), cilantro (giraffe), requin (shark), polly
  (parrot), both 15-312 frogs, the knight frog, the toad, greenting. None of them is drawn on four legs. "Quadruped"
  in the brief is the species, not the body plan: build them on the **upright-animal** plan (biped + tail/ears/snout),
  not on `quadruped()`. Only **honk** and **chonk** are horizontal-bodied birds (goose waddle), and only the **snail**
  is limbless. The **moth** walks in v2 (wings folded as a cape); hovering is an option, not the identity.
- **Chibi proportions**: heads are 40–55 % of the sprite height (frog head 14 of 30 px, owl ~16 of 32, mushroom cap ~14
  of 34). Legs are 3–6 px (0.10–0.20 H). The pixel3d reference biped is 3.8–4 heads with legs 0.36 H. A cast member
  keeps its chibi head (identity) — **2.2–2.8 heads** — and that changes the gait at game speed (§8: short legs must
  bounce/hop to cover the distance).
- **v2 animation is tiny**: idle is ONE drawing; the walk is 4 drawings with a 1-px bob (`_stats.json` walk_bob_px = 1
  for all 32) and 1–2 px leg shuffles; props barely move. pixel3d must do much more (real idle, held poses, secondary
  motion) but must keep the v2 *read*: the same silhouette, the prop in the same hand, the same face.
- **v2 has a 1-px dark outline; pixel3d characters have none** (FLAG_CHAR: inner lines only, no silhouette line).
  Everything the outline carried (near-black hair, black necks, dark coats) must be carried by value/hue instead (§5).
- **Death in the game = a ghost** (`ghost idle` row: pale blue, hovering, with a halo while the ghost vote is unspent).
  The ghost is a client-side treatment of the living sprite. Your `die` clip ends on a readable held collapse; the
  ghost look is not your job, but the collapse must not hide the identity (the hat/cap/ears still visible at dir 1).
- v2 sheets are not always consistent between facings (mushroom's staff switches hands; the λ on polly is stamped
  unmirrored; the frog's shield/sword swap sides when mirrored). In 3D pick ONE hand from the S/SE frames and keep it.

## 3. Identity — what must survive the port

Write these five into the design sheet's Stage 0 before modelling, each with the ref facing that shows it:
1. **Silhouette blob at 1×** (look at the 1× strip in your ref): the 1–2 shapes that make it recognisable as a dark blob
   (mushroom cap wider than the body, crow hat brim, rabbit ears, giraffe neck, goat horns, shark fin+beret, storyteller
   hood+clock-staff). These become the signature (two-part rules apply, playbook Stage 0).
2. **Palette anchors**: the 2–3 colours a player names the character by (frog = green + red cape + blue steel; polly =
   scarlet + black tee + blue/yellow wings). Take the hexes from `_stats.json`, then re-tune for the ground (§5).
3. **Signature prop and which hand** (from the `.ts` header comment: "staff in the left hand", "shovel in the right hand").
4. **Face**: eye type (dot, big glossy, goggles, void-with-glow, spectacles), mouth/beak/snout, blush. §9.
5. **Kind of motion the v2 code implies** (snail stretches its foot; chonk leans onto the planted foot; storyteller's robe
   sways and the hem lags; fox/mincut/opal tails sway; crow coat tails lag; goat ears flop; polly wings swing).
   These are the minimum secondary motions to keep (§11 "Unique to me").

Sanity test at the end: put your `turnaround-silhouette.png` 25 % thumbnail next to `_all.png` — someone who knows the
v2 cast must name the character from the blob at S and at SE.

## 4. Scale

v2 sprite heights range 25–39 px (`_lineup.png`). Keep the ratios: **H ≈ 0.04 m per v2 px**, clamped to 1.05 m below;
mascots may go +10 % (chonk, maxflow, cilantro are meant to be big). At vh 10 (36 px/m) that is 38–58 texels — the
playbook's 46–52 biped band is for humans; cast members state their own `heightPx` target (tools backlog: `height_px`
FAILs anything outside 45–62 until it reads the spec target). Proportions: head 2.2–2.8 heads for the chibi animals;
the NPCs and nicksong use the plain townsfolk body (v1 lib-d-human) → ≈ 3–3.3 heads. Use the cards' H.

| v2 px | 25 | 27 | 28 | 30 | 32 | 34 | 36 | 38 | 39 |
|---|---|---|---|---|---|---|---|---|---|
| H (m) | 1.05 | 1.08 | 1.12 | 1.20 | 1.28 | 1.36 | 1.44 | 1.52 | 1.56 |
| texels at vh 10 | 38 | 39 | 40 | 43 | 46 | 49 | 52 | 55 | 56 |

## 5. Palette — v2 colours → `[hi, mid, sh]` slots

- Start from `_stats.json` (top colours with their share). The most used non-outline colour is the big slot's mid. v2
  shades with 2–3 tones per material; map them to `[hi, mid, sh]`, then apply the playbook Stage 0 value plan.
- **Green characters vs the meadow (critical)**: grass mid is `#75A558`. frog `#7EB759`, progress `#88B75A`, greenting
  `#7BAB6F`, toad `#989A5F`, green-hood `#617A4A`, rabbit's dress `#4C7A44` are all within a few degrees of grass and
  would vanish (the hound's moss did exactly that, CHARACTER_LEARNINGS §Palette). Keep "green" but move it: low-red jade
  /mint (`#94FCCE`-ish hi, hue 140–155°, survives the golden grade) or a yellow-chartreuse with ≥ 25 % L over lit grass;
  shadow tone toward blue-slate, never teal 163°. And make the non-green part the signature (frog: red cape + steel;
  progress: orange scarf + backpack; rabbit: white head + ears; toad: cream shirt + satchel). Measure in the scene crops.
- **Near-black parts lose their outline**: nicksong hair `#221E2F`, honk neck `#37323C`, polly tee `#282335`, requin
  beret `#1E2130`, crow coat `#4A4A5C`, storyteller face void `#07040C`, porter hood `#3A3438`. No black (rule): lift to
  mauve-navy ≥ `#3A3040` sh (night rule) and give the shape a value step against what it touches (hair hi ≥ 15 % L
  above the face shadow; the void face stays the darkest thing but ≥ `#2A2238` with the eyes as the light accent).
- **White characters** (chonk, clarabelle, skeleton, rabbit, moth, goat head): no pure white; hi ≈ `#F4ECDC`, and the
  sh tone must stay ≥ 15 % L over grass shadow and warm/mauve (keeper beard lesson: a white mass renders mostly sh at
  dir 1 unless its faces tip up — count hi/mid per facing).
- **Black-and-white patterns** (cow spots, polly wing bands, toad bumps, giraffe patches): ≥ 2 texels (0.06 m) per
  patch, as separate parts or vertex-colour bands on one convex profile, never 1-texel dots (speckle → `isolated_px`).
- Lantern characters (moth, storyteller): the glass is the light accent; there is no `spec.lights` yet (look backlog) —
  render the glow in your own scene copy and say so (keeper precedent).

## 6. Body plans

Rig templates are the rig owner's (`src/chars/rig.js`, run-05 upgrade); until a template exists, build on `biped()` +
chains as the duelist/keeper did. Pick the plan from the REF, not from the species:

| plan | members | skeleton notes | locomotion at game speed (§8) |
|---|---|---|---|
| **upright chibi** (clothed animal / small person) | frog, fox, owl, goat, skeleton-chef, rabbit, mole, toad, nicksong, polly, clarabelle, requin, progress, preservation, opal, mincut, maxflow, theo-rem, greenting, npc-*, mushroom | biped, heads 2.2–2.8, legs 0.20–0.30 H; tail/ears/snout as 1-link chains; props in hand sockets | bouncy scurry/skip (duty 0.18–0.3), 4 drawings per ~0.3 s cycle |
| **robed / hidden feet** | storyteller, green-hood, crow (long coat), owl (robe), goat (robe), npc-elder | biped with robe parts on hips/thighs (`blend`), hem as a short chain or keyed band | step feet under the hem + hem sway lagging; the staff/shovel/cane plants (keeper r2: authored walk) |
| **long neck** | cilantro | biped + 2–3 neck links (curved chain trick, duelist r2) | normal-ish biped legs (0.36 H) → the "tuned biped" row of §8; neck counter-bob |
| **bird, horizontal body** | honk, chonk | biped legs very short (0.10–0.15 H) under a horizontal body; neck chain (honk), wings as sided 1-link chains | **waddle-hop**: body roll onto the planted foot + flight phase (duty ≤ 0.15) or a 2-drawing hop; chonk: the whole ball bounces (squash on contact) |
| **limbless glide** | snail | root + foot bone(s) + shell + head column + 2 eye stalks | no feet → no slide by construction; a squash/stretch cycle of the foot (v2: "the walk frames stretch and squash the foot") at the game cadence; stalks lag |
| **winged walker / flier** | moth | upright chibi + wing parts on the back (folded = cape) | walks like the upright chibi; optional hover emote (flap 2 drawings on twos) |
| **hopper (true hop)** | optional for frog, toad, progress, preservation, rabbit | as upright chibi | a real two-footed hop is the natural game-speed gait for 0.1–0.2 H legs: crouch → airborne (feet together, tucked) → land; 4 drawings per hop, one hop per ~0.3 s |

`spec.bodyPlan` values (CHARACTERS.md §3): upright chibi animal → `'uprightAnimal'` (nicksong, skeleton-chef, the NPCs →
`'biped'`); robed → `'biped'` (+ robe parts); long neck → `'longNeck'`; bird → `'bird'`; limbless → `'limbless'`; winged
walker → `'flier'` if it hovers, else `'uprightAnimal'`; true hop → `'hopper'`. Do NOT pick `'quadruped'` for fox, goat,
cow, red panda, hedgehog, otter: the identity source draws them upright (the playbook's quadruped bound/gallop row
applies only if a character is deliberately re-imagined on four legs, which breaks the "recognisably the same" rule).

## 7. Standard cast clips (every member) and how each plan expresses them

Clip list: **idle, walk, talk, vote, point, die, ghost, ghost-spent, `<emote>`** (+ the pseudo clip `turn` for the turn
audit); **run is optional**. **Wave 3 (7/8 missed point/ghost):** this list used to stop at die, and so did
`--preset cast`; both now include point/ghost/ghost-spent and `cast_clips` FAILs without them. Port point and the ghost
from a finished member of your plan (frog/fox upright, owl/crow/honk bird, snail limbless) — but NOT its point
direction (wave 4: 4/4 points aimed sideways or used the far arm; playbook **R W4 point**) and NOT the old crow ghostK
+ `material.tones` ghost recipe: since the wave-3 module fix a ghost is `spec.ghost: { hover: 0.14 }` + plain loop
clips (playbook banner). The Storyteller has no vote/die/ghost clips (pass an explicit `--clips` list: tools T35). Timing grid
30 Hz, held drawings 2–4 frames in locomotion, holds ≥ 6 frames in actions (playbook Stage 3/4 rules all apply).

| clip | what must read at 1×, dir 1 | upright chibi | robed | bird (honk/chonk) | snail | long neck |
|---|---|---|---|---|---|---|
| **idle** (loop, step) | alive, not a statue; 1-texel breath; a blink | 4 keys, extremes held long (0/30/36/66 of 72); breath in chest + `pos` y 0.028; blink = 2-frame lid key once per loop; tail/ears settle | breath + hem; head tilt | breathing ball; head bob/tilt (goose glance) | shell rise 1 texel, stalks drift | slow neck sway (≥ 25° between extremes, held) |
| **walk** | the GAME locomotion: 4 H/s, ~0.3 s cycle (§8) | §8 recipe | §8 + staff/shovel/cane plant | waddle-hop | squash cycle | §8 tuned biped |
| **run** | Storyteller fast travel at 2·v_game = 7.9 H/s (PLAYBOOK §Game speed); must differ from walk | bounding leaps (cycle ≈ 2.1 H, duty ≤ 0.1 for chibi legs), lean ≥ 12°, arms pump | robe flares | wings out, flap-hops | stretch harder, stalks back | neck forward 25° |
| **talk** (loop) | "this one is speaking" from across the square | head nod (≥ 25° per key) + mouth/beak open on alternating keys + one hand/wing/paw gesture; 3–4 keys, 4–6 frames each, loop 16–24 frames | hood nod + hand out of the sleeve | beak open/close + neck pump (honk = honking) | stalks bob, mouth on the head column | neck bob forward |
| **vote** (raise and HOLD) | a raised hand/wing/paw above the head, held, in the 25 % thumbnail | anticipation dip (4 f) → arm straight up past the head top (upperArm out/fwd ≈ 150–170°, ≥ 0.2 m above the head; reach by `.l`, not `out` — wave 5) → hold until the clip ends (last key held; the game holds it while the vote lasts); face clear at S/SE/SW; a held prop stays IN the visible hand at S/SE/E/W (wave 5, 4/4 failed) | sleeve falls back, staff hand stays | wing up and spread (both wings for chonk) | one stalk up (or the wrench up) | hoof up; neck stays upright |
| **die** (one-shot → held final pose) | collapse, unmistakably not asleep; identity still readable | stagger (no hurt flash: Clocktower rule) → knees buckle (crouch, 6 f) → fall to the side or forward (6 f, `legs: 'fk'`) → final held pose lying with the signature shape still visible from dir 1 (hat/cap/ears not under the body); eyes → closed/X | robe crumples, hood on the ground, staff falls (prop drop needs a socket trick: keep it in hand) | tips over sideways, feet up | retreats into the shell (head + stalks down, shell rolls 30°) | neck folds down in 2 steps |
| **`<emote>`** | the blurb in one action (cards §12) | see card | see card | see card | see card | see card |
| **point** (hold) | aimed at someone across the square, at S/SE/SW/W | arm forward-and-up ALONG the facing (never out to the side: wave 4, 4/4 failed), finger/paw straight, held ≥ 24 f; near arm = RIGHT at SE/E, LEFT at W/SW → both arms or a leading shoulder; never a level weapon thrust | sleeve falls back, hand out | a WING as the pointer, neck upright (a level neck = goose hiss) | head/stalk aims | head aims, hoof up |
| **ghost / ghost-spent** (loops) | dead player: pale, hovering, same identity; spent = dimmer, no halo, head bowed | `spec.ghost: { hover: 0.14 }` + plain pose-only loop clips (module draws ramp, halo, floating legs; `keepHue` 0.25–0.35 when the colour is the identity — greenting went lavender at 0) | hem dissolves | crest/neck laid flat so it doesn't touch the halo | shell pale | neck bowed |

Notes: the game decides when talk/vote/die play; talk and vote must loop/hold cleanly from any idle frame (start on
the idle's first drawing). Keep head world pitch within ±15° for wide hats/caps/hoods in held keys (mushroom, crow,
storyteller, green-hood, requin) and ±35° for animals (playbook Stage 3).

## 8. GAME SPEED (match the live v2 game relative to body size)

**The v2 numbers** (pipgws `packages/protocol/src/constants.ts` `PLAYER_SPEED = 150` px/s; client
`apps/client/src/game/TownScene.ts`: walk anim = frames 1–4 at `round(walkFps 10 × 1.25)` = 13 fps): a 38-px sprite
moves **3.95 body-heights per second**; one walk cycle = 4 drawings = **0.31 s**, covering **1.2 H**; each drawing is
shown ~2.3 grid frames at 30 Hz and the sprite glides **0.32 H (12 px) per drawing**. The camera follows the player.

**Targets for a pixel3d cast member of height H** (H = spec height, m):

| quantity | target | wanderer (H 1.53) | frog (H 1.2) |
|---|---|---|---|
| travel speed (the `walk` clip, the one the game uses) | **3.95 H /s** | 6.0 m/s | 4.7 m/s |
| cycle (two steps / one hop) | **0.27–0.33 s = 8–10 grid frames** | | |
| distance per cycle | **1.05–1.3 H** | 1.6–2.0 m | 1.3–1.6 m |
| drawings per cycle | **4** (contact, pass, contact, pass) — 6 or 8 cannot fit: minHold is 2 grid frames, so a 9-frame cycle holds at most 4 | | |
| root glide inside a held drawing | ≈ 0.26 H (≈ 12 texels at 46 px) — inherent with `legIK: 'pose'`, the same as v2's 0.32 H per drawing; the stance foot is exact at pose frames | | |
| bob | ≥ 1 texel walk, ≥ 2 texels for bouncy/hop gaits | | |

**Why the default gait fails at this speed (rendered, `shots/refs-cast/`)**: the Gait clamps the cycle to the leg
reach, `maxC = 2 · reach · legLength / duty`, with defaults reach 0.45, run duty 0.36, poses [8, 6].
- Mannequin (leg 0.36 H) at 3.95 H/s: maxC = 0.91 H → a 0.23 s cycle with 6 poses → the pose clock jumps 1–2 drawings
  per 2-frame hold (pose ids `run:36, 38, 39, 41, 43…`); the strip shows an irregular, aliased drawing order
  (`gs-mannequin-default/clip-run.png`). Wanderer at 6.1 m/s: a 0.2 s cycle showing only drawings 0/2/4
  (`gamespeed-wanderer/`).
- Chibi body (heads 2.4, legs 0.55 → leg 0.20 H): maxC = 0.56 H → ids `+3` per hold, i.e. a 2-drawing strobe, and
  charcheck `foot_slide` 19.6 texels (`gs-chibi-default/`).

**Rule (tested)**: choose the duty so the 1.05–1.3 H cycle is reachable, `duty ≤ 2 · reach · (leg/H) / (C/H)`, and show 4
drawings. With reach 0.55–0.6 and C = 1.1–1.2 H:

| leg / H | max duty at v_game | gait it implies | tested (render host render-host, `shots/refs-cast/`) |
|---|---|---|---|
| 0.36 (pixel3d biped, cilantro) | 0.33 | brisk run with a short flight | mannequin `gsC=1.2 gsp=4 gsr=0.55 gsd=0.3`: pose ids +1 every 2–3 frames, clean 4-drawing loop, no skipped drawing, off_grid 0 upper (`gs-mannequin-v2cadence/`) |
| 0.25–0.30 (most chibis if you lengthen v2's legs a little) | 0.22–0.27 | bouncy scurry / skip | (interpolated) |
| 0.20 (v2-faithful chibi) | 0.18 | skip-hop: long flight, both feet tucked | chibi `gsC=1.1 gsp=4 gsr=0.6 gsd=0.18`: ids +1 per 2 frames, clean 4-drawing loop (`gs-chibi-hop/`); duty 0.3 at the same legs still skips drawings (`gs-chibi-run/`); the full recipe below (`recipe-chibi/`): walk ids `walk:` +1 per 2 frames, off_grid 0, flicker 0 |
| 0.10–0.15 (geese, toad, owl, chonk) | ≤ 0.12 | hop or waddle-hop (body roll + small flight); or author the gait as a hop clip | — |

So **short legs at game speed must bounce** — the frogs' hop, the geese's waddle-hop and the chibis' skip are not
style choices, they are what makes 4 H/s slide-free with 4 clean drawings. The same arithmetic for `run` (2·v_game):
C ≥ 2·v·0.267 s ≈ 2.1 H, so chibi legs need duty ≈ 0.1 (bounding leaps); with the default run numbers the run skips every
other drawing (ids +2 per hold, tested).

Spec numbers to start from — this exact block is `shots/refs-cast/recipe.js` (chibi mannequin, H 1.4, leg 0.20 H) and
renders clean `walk:` and `run:` loops with 4 drawings each held 2 grid frames. It follows the playbook convention (walk =
game speed on the Gait's WALK branch, `runFroude` raised above the game Froude; run = 2·v) until motion's per-plan gaits
land — then use theirs, but keep these targets:
```js
const H = /* spec height */, V = 3.95 * H, hipY = S.meta.hipsY, FrG = V * V / (9.81 * hipY);
gameSpeed: { v: V, drawings: 4, gait: 'hop' },        // CHARACTERS.md §3 (charpack reads spec.game.speed, default 3.95·H)
locomotion: { walkSpeed: V, runSpeed: 2 * V,
  stride: 0.55 * H, runStride: 1.05 * H,               // STEP lengths → cycles 1.1 H (walk) and 2.1 H (run)
  duty: [0.18, 0.1] /* walk from the table, run ≈ half */, reach: 0.6, poses: [4, 4],
  lift: [0.04 * H, 0.05 * H], bob: [0.035, 0.035] /* ≥ 1 texel; more for hops */, lean: [6, 12],
  runFroude: [FrG * 1.5, FrG * 2] },                   // so v_game plays the WALK branch and 2·v the run
character: { legIK: 'pose', quant: { yaw: 8, chain: 4 } }
```
The walk branch swings the arms less than the run branch: at game speed raise `arms`/`elbows` walk values (or key the
arms in an authored `clips.walk`) so the upper body carries the rhythm too (playbook: something BIG must carry it).
Authored `clips.walk/run` drive the pose clock with their `length`: use length 4 (one key per drawing, `interp: 'step'`)
at game speed, not 8/6.

**Cast wave 1 status (lead merge, 2026-10-16; 8 members on `chibi()`)** — read before choosing a gait:
- LegGait plans (`biped`, `bird`, `hop`) give clean 4/4 drawings at 4 H/s, but they **do not play authored
  `clips.walk/run` poses** (motion backlog M1): props, ears, tails and staffs can only ride the rest pose or a re-routed
  `locomotion.bones.<channel>` (playbook Stage 3). The recipe above (legacy Gait, no plan) DOES play them, at ≈ 7 texels
  of in-hold glide with `legIK: 'pose'` (moth, skeleton-chef).
- LegGait 'biped' seats legs ≤ 0.35 m (body drop, M2): check dir 2 on `bg=plain` — the hem must stay above the ground.
- With legs ≤ 0.25 H hidden under a robe, no foot is ever seen planted and every wave-1 critic read the 1× gait as a
  glide. Plan a visible contact DRAWING in the sheet (boot/talon flick ≥ 3×2 texels out of the hem in a contrasting tone,
  a staff/shovel plant, or a hop apex ≥ 4–6 texels above stand) — `foot_slide n/a` is not a pass.
- `run` at 2·v cannot hold a plant on any chibi (in-hold 10–13 texels; frog run off_grid 40): it is optional, declare it.

**Verify at game speed, at 1× real time** — contact sheets lie about speed:
- A plain `tools/charpack.sh <id> --clips …` now also renders the tools owner's **game job** (walk at `spec.game.speed`,
  default 3.95·H): `clip-game.png`, `clip-game-1x.gif`, `game-1x.gif` / `game-x3.gif` (fixed camera, the figure crossing
  1 m tiles — the only render that shows travel speed), `game-onion.png` (every 4th grid frame overlaid), and the
  `game.readable` row (H/s, cycle, holds 2–4). Read them all. Then the pose ids in `raw/clip-game.json`
  (`info.stats.char.log[].p`): `walk:` ids stepping +1 per 2–3 grid frames, no skips, the same 4 drawings repeating.
- Side by side with the v2 sprite: `tools/remote.sh python3 refs/cast/_src/gamespeed_gif.py shots/char-<id>/gamespeed.gif
  <id> game=shots/char-<id>:game` then `rsync -az 'render-host:pixel3d/shots/char-<id>/gamespeed.*' shots/char-<id>/`
  (quote the remote glob in zsh). Needs a full or `--only clips` pack with `--raw` (the game job's raw frames).
  It plays root-following 1× crops at 30 Hz real time next to the v2 sprite walking at its in-game 13 fps, then ×3.
  Judge it frame by frame AND as motion: does it read as moving at that pace (feet alternate, bounce visible), or does it
  strobe/shuffle?
- Known measurement gaps (reported to tools, re-check by eye): with hop/skip duties (≤ 0.2) no foot is planted on two
  consecutive drawings, and `foot_slide` then reports 17–19 texels at dir 2 with "0 planted pairs" — that is not a slide;
  `game.readable` reported cycle 0.433 s / 1.71 H for the recipe whose pose ids show a 4-drawing loop every 8 grid frames
  (0.27 s / 1.1 H). Trust the pose-id log and the GIFs over those two numbers until tools fixes them.
- Every other clip too: talk/vote/die/emote must read when played once at 1× real time (`clip-<c>-1x.gif`): a
  4-frame anticipation is 0.13 s — the eye catches holds of ≥ 4 frames; a key held 2 frames is a flash.

## 9. Faces and expressions in the new style

v2 faces: 2×2 px pupils (1 px on the far eye), 1-px blush, 1–3 px mouths, all inside a 1-px outline. In pixel3d a cast
face at 40–55 texels has the same budget: **eyes 2×2 texels (0.06–0.07 m)**, set forward and out so they catch light at
S/SE/SW (hound r2); no outline, so the eye is a dark inset part in the face slot's darkest hue, not black.
- **Eye types**: dot (frog, rabbit, mole squint = 2×1), big glossy (moth, owl amber disc: 3×3 with a 1-texel glint
  part), goggles/spectacles (preservation, theo-rem, snail, mole: a lens ring ≥ 0.05 m thick around a 2×2 eye), void with
  glowing eyes (storyteller, green-hood: dark hollow arch ≤ 60 % of the hood width, eyes = the light accent, 2×1 or 2×2).
- **Blink** (every idle): pose triples are rotations only, so a lid is a small part on its own bone (`lidL/lidR`,
  child of `head`) that rotates from tucked inside the skull (up) down over the eye (≥ 60°): keyed 2 grid frames once per
  idle loop. The same bone gives half-lid sleepy (toad), squint (mole, chonk ^ ^), and closed (die).
  **Wave 1 correction (owl):** the lid must sit FLUSH with the face; a proud lid prism over a cut-out iris draws an inner
  line ring and reads as goggles/monocles. Safer: squash the eye part (`eye*.s` y ≈ 0.2) or swap to a 1-texel dark arc.
- **Eye size (wave 1, fox/skeleton-chef; corrected wave 2):** a 2×2 plan needs an eye box ≥ 0.08 m or it renders 1 px at
  S/SE. Wave 2 (rabbit, chonk, honk): "proud of an 8-sided lathe and turned 15° out" put the far eye OUTSIDE the head
  contour as a dark nub at E/W/NE/NW — use a 16-sided head lathe, the eye joint ON the surface, the box turned to the
  surface normal, front ≈ 0.006 m proud (flush z-fights into a hollow ring), or cut the eye into the skull. Glints ≤ 0.024 m
  flush in the corner (0.034 m became goggles on breath keys). At dir 1 the far eye is a sliver: put the expression on the
  NEAR eye (fox's wink) — and make the punchline a pose change too (toad's wink alone = 2 px).
- **Void faces (wave 2, green-hood):** the void must stay the BIGGER area: glow ≤ 35 % of the opening at S/SE/SW in every
  key. Convex bead eyes centred on the void front; express by y-squint and eye roll, never by growing or x-scaling the
  eyes. Bring a bevelled rim ≥ 0.046 m proud so one eye + the rim show at E/W.
- **Jaw on a small face (wave 2, rabbit/toad):** a hinged fur chin at 25–30° renders as a wedge/beak in its shadow tone, and
  under a wide dome it is hidden at SE. On muzzle-less or dome heads, open ≤ 15° so a 2×1 dark mouth floor shows; carry
  talk with a ≥ 25° hand/ear beat. (The 25–40° jaw rule below holds for real beaks and wide frog/shark mouths.)
- **Talk nod (wave 1, 5/8):** chibi heads are the face — a talk nod with head + chest > +4° world pitch shows the skull top
  at dir 1/S. Beats = head roll toward the camera + `pos.y` bob + jaw; mouth-open keys tip the head UP.
- **Skull mouths (skeleton-chef):** a dark bar under a nose hole reads as a moustache at 1×; draw a light tooth band ≥ 2
  texels tall with 2–3 one-px dark gaps, and keep a ≥ 1-texel gap between nose and mouth.
- **Mouth / beak / snout**: a `jaw` (or `beak`) bone opening 25–40° reads at 1× (talk). Shark grin, goose beak, parrot
  beak, frog wide mouth: the opening shows 1–2 texels of the mouth's dark slot. A mouth that is only a painted line
  cannot talk — give it a jaw part.
- **Brows** (honk's stern brow, nicksong's half-lid smirk): 1-texel tall parts on a brow bone, rotated ≥ 25° to change
  the read; at 1× they mainly read from S/SE.
- **What carries emotion at 1×** (in this order): body pose and head tilt (≥ 25°), ears/antennae/stalks (a chain or a
  keyed bone — ears back = scared/dead, up = alert), mouth size, then eyes. Plan each clip's expression in the timing
  chart: talk = mouth open on alternating keys; vote = eyes open wide/brows up; die = eyes closed (lids) + ears down;
  emote = its own (cards).
- **Head squash** (chibi heads are the biggest mass): a squash is a `pos` dip of the head + chest compression on the
  contact frame of hops/landings (scale is not keyable): 1–2 texels, held 2 frames.
- **Profile face (wave 3, recurring: opal, preservation, progress, clarabelle):** v1 E/W sprites put the eye AT the
  muzzle root and the mouth reaching the snout tip. A broad lathe head puts a surface-placed eye mid-skull at E/W
  (cyclops), shows the far eye/bump ≈ 7 texels higher (camera pitch), and wraps an open mouth gap round the head side.
  Eye joint outside the snout pad's half-width and forward; far eye recessed; open mouth on the front face only (≤ 0.12 m
  deep, sides closed). A small side EAR seen face-on at profile reads exactly like an eye — check with a part-drop variant.
- **Eye tones and pupils (wave 3, recurring: requin, preservation, progress):** the eye slot's hi ≤ #4A4258 (a lit lilac
  "dark" hi + glint = an X-eye); pupils 1×1–1×2 in the darkest tone on a fixed texel (2×2 in a 4×4 lens re-rasterises
  into letters); v1 white eyes stay white ≥ 3×3 with the pupil in the upper half; a 4×2 dark nose = an open "O" mouth.
- **Mouth colour and talk (wave 3: requin, opal, cilantro):** keep the v1 mouth colour (requin maroon #4A1C2C) in its own
  slot; on a chibi pad a scaled mouth plate (`'mouth.s'` [0.25, 1.9, 0], opal r2) opens 2–3 texels at S/SE/SW where a
  14–26° jaw shows ≤ 1 texel. Twist the head TOWARD the camera on talk beats (judge the sign on the 8-facing still).
- **Profile face, wave 4 (recurring: maxflow, greenting, theo-rem — after opal/preservation/progress/clarabelle in W3):**
  v1 E sprites show ears ON the outline, a snout clearly past the skull and the nose at its tip. In 3D: ears rooted on
  the crown/back (z ≤ −0.1) — a side-rooted ear's dark root reads as a big eye mid-skull (maxflow, opal); snout ≥ 4
  texels (≈ 0.11 m) proud of the lathe (0.05 m = an orange egg); eyes on a snout-tipped tube head placed by angle round
  the head axis (|x| ≈ 0.9 r, φ ±70°), not from the cap centre (greenting's face vanished at E/W); spectacles set back so
  the nose clears the rim at BOTH profiles (theo-rem lost the nose at E only). At E you see the RIGHT side, at W the LEFT.
- **Talk mouth on bead smiles (wave 4, greenting):** never scale the bead ring (hollow dark ring); a dark plate buried in
  the head and pushed out with `<bone>.p` on the open keys gives a filled 3×2 "o". A v1 "small smile" is ≈ ¼ of the head
  width — 3–4 beads, not 7.
- **Small eyes in rings (wave 4, theo-rem/greenting):** a 2×2 eye in a 5-texel lens or a 0.062 m square bead becomes a "+"
  crosshair at SE; use a 1×2 pupil box (0.036 × 0.07) without a glint, beads ≤ 0.052 m.

## 10. Blurb → personality → timing

Write 3 adjectives from the blurb + v2 code, then map them (dynamics presets per CHARACTERS.md §3):

| adjective family | personality body / head | holds (actions) | gait flavour at game speed | examples |
|---|---|---|---|---|
| calm, slow, deliberate | heavy: f 1.5–2, ζ 1, r 0 | long (8–12 f), few keys | lower bob, duty at the high end, small lean | crow ("very calm about it"), snail ("slowly, perfectly"), owl, storyteller, elder |
| proud, formal | f 2.5, ζ 0.8 | crisp holds, upright | upright chest, chin up (≤ 5° up) | frog knight, goat magistrate, requin |
| sly, smug | f 3, ζ 0.6, r −0.5 (anticipating) | late, small anticipations; a lingering hold on the punchline | slight sway (hips), half-lidded | fox, nicksong, toad ("finer excuses"), mincut |
| nervous, shy | f 4–5, ζ 0.45 (twitchy) | short, jittery double-takes | quick, low, tail/ears flick | mushroom ("sheds spores when nervous"), rabbit, moth (drawn to lamps) |
| cheerful, eager | f 3.5, ζ 0.5, r 1 (springy) | bouncy overshoot | high bounce, big arm swing | progress ("always takes a step"), polly, theo-rem, opal |
| big, soft, unstoppable | f 1.8, ζ 0.7 | slow wind-up, long squash | heavy bounce, squash on every contact | chonk, maxflow, clarabelle |
| blank, deadpan | f 2, ζ 1 | stiff, sudden snaps | stiff waddle, no arm swing | greenting, skeleton-chef (friendly-stiff) |
| boring on purpose (NPC) | default | plain | plain, quieter than any player | npc-sweeper, -vendor, -elder, -porter |

## 11. Mandatory design-sheet section: `## Unique to me`

Every cast design sheet (`characters/<id>.md`) has this section BEFORE modelling, answered concretely, and the critic
checks it:
```
## Unique to me
1. Extra animated parts — list each (ears, tail, wings, shell, antennae/stalks, scarf, beret, cape, coat tails, robe hem,
   apron, phone, spores, lantern, ledger, bouquet, evidence paper, bomb fuse…): driven how (1-link chain + preset /
   keyed per clip / FX), and in which clips it must visibly move (≥ 25° between drawings).
2. My locomotion — walk / hop / skip / waddle / glide / lumber / scurry / prance? Why (blurb + leg length §8), the numbers
   (V = 3.95 H, cycle, duty, reach, poses 4, bob) and how it stays slide-free at game speed (stance exact at pose frames,
   pose ids +1 per hold, no skipped drawing).
3. Expressions in the new style — eyes (type, texels), blink/lid bone, mouth/beak/jaw bone, brows; which expression each
   of talk / vote / die / emote uses and how it reads at 1× at dir 1 (§9).
4. Game-speed readability — for each clip: does it read once at 1× real time? Evidence: the game-speed GIF
   (`gamespeed_gif.py`) + the pose-id log; what you changed because of it.
```

## 12. Cast cards

H = target height (m, §4). Plan = §6. Sig = signature (two parts where listed). Hex = palette anchors from `_stats.json`
(re-tune per §5). "Unique" = starting answers for §11 (verify and extend them). Emote = suggested signature emote.

**frog — Sir Croaksworth** (villager; v2 30 px → H 1.20) · plan upright chibi (or hopper) · sig: big green head with
eye bumps + red cape · hex `#7EB759` skin (= grass! §5), `#B0303C`/`#C05759` cape, `#55688E` steel, gold trim · props:
round blue shield with gold star on the LEFT arm (face out-front 35°), short sword in the RIGHT hand pointing down-out ·
Unique: cape = 2-part chain (`noForward`, trails at speed), shield stays clear of the face at SE (the duelist/keeper
lesson), knightly upright hop-march; eyes 2×2 pupils on top bumps; jaw for "croak". Emote: **knightly salute/oath** —
sword up to the face then out, chest proud (holds 8 f), or a sad look for the lost pond.

**mushroom — Brother Morel** (villager; 34 px → 1.36) · upright chibi (robed) · sig: huge red cap with cream spots
(WIDER than the body) + ivory robe · hex `#CE5F52`/`#973035` cap, `#EBE1C9` robe & spots, red stole · prop: little gold
star staff in the LEFT hand · Unique: cap is the mass — spots as same-profile bands or ≥ 2-texel parts (no speckle), cap
wobble as a stiff 1-link chain on the head (jiggles on hop contact), spores = FX motes when nervous; face is shy and
under the brim (look's hull self-shadow; face_lit ≥ 50 %). Emote: **blessing** (staff raised, star glint) or a
**nervous spore puff** (shudder + motes).

**fox — Ginger** (villager; 33 → 1.32) · upright chibi · sig: tall dark-tipped ears + big white-tipped tail · hex
`#E1834C`/`#D9682C` fur, `#9C2F3A` dress, `#F4E7CE` apron/muzzle · prop: foaming wooden mug in the LEFT paw · Unique:
tail 1-link chain (sways with steps, swings out on turns), ears flick (keyed in talk), apron/dress hem; sly half-lid +
smile; slim (not maxflow!). Emote: **whisper a rumour** (lean in, paw to the muzzle, eyes side-glance) or raise the mug.

**owl — Archivist Hoot** (villager; 32 → 1.28) · upright chibi, robed · sig: round head with cream facial disc + ear
tufts · hex `#A17852` feathers, `#2E3A6E`/`#585F81` navy robe, burgundy mantle, amber eyes · prop: thick ledger hugged
in BOTH wings · Unique: huge 3×3 amber eyes with glints (the face IS the eyes), head swivel (owl 90°+ head turn is the
species tell: an idle key with neck twist 60–90°), tufts; feet hidden → waddle with short legs (≤ 0.15 H → hop table).
Emote: **"I remember who lied"** — head swivel to the viewer, slow blink, ledger snap shut.

**crow — Mortimer** (villager; 33 → 1.32) · robed (long coat) · sig: wide-brimmed brown hat + long pale beak · hex
`#4A4A5C` coat (lift §5), `#4E3528` hat, pale beak, brass buttons, amber eyes · prop: iron shovel in the RIGHT hand,
planted like a walking stick · Unique: coat tails ragged chain lagging, shovel plant in walk (keeper r2 recipe), very calm
= heavy personality, slowest-looking but still 3.95 H/s (long stride, low bob); beak must not point at the camera as a
spike at S (head pitch). Emote: **lean on the shovel** (and a slow tip of the hat) or dig one scoop.

**moth — Lumen** (villager, lantern; 34 → 1.36) · winged walker · sig: feathery tan antennae + fluffy cream head
(+ pale folded wings) · hex `#F1E3C4` fluff/wings, `#5A3A2C` coat, black glossy eyes · prop: glowing lantern in the LEFT
paw (no `spec.lights`: scene copy) · Unique: antennae 1-link chains (sweep with motion), wings = cape that can OPEN
(vote/emote), fuzzy edge = chunky facets not noise; flutter-hover as an optional gait; big glossy 3×3 eyes. Emote:
**drawn to the lamp** — wings flare, a 2-drawing flutter hop toward the light, lantern held up.

**goat — Magistrate Billings** (villager; 36 → 1.44) · robed · sig: big curled tan horns + white head (with beard) · hex
`#ECE4D6` head, `#B8892E`/`#C69E4E` horns & robe gold, red collar · prop: tall wooden staff with brass knob in the RIGHT
hand; a paper corner in his mouth · Unique: horns are a concave signature (≥ 2 parts with a step), floppy ears hang back
when edge-on (chain), beard; staff plant in walk; jaw chews (idle). Emote: **gavel slam / eats the evidence** (staff
thump, then chew the paper — jaw keys).

**skeleton-chef — Bones** (villager; 35 → 1.40) · upright chibi (thin limbs) · sig: tall puffy chef's toque + round
skull · hex `#EBE0C4` bone/toque, `#323A5A` shirt, white apron · prop: wicker basket of loaves in BOTH hands · Unique:
toque puffs as one convex lathe profile (no speckle), jaw clack for talk, rattly stiff gait (no arm swing — hands hold
the basket), friendly not scary: big sockets with a 1-texel glint. Emote: **offers bread** (basket forward) or a **jaw
drop / head pop** gag (head lifts 1 texel, settles).

**rabbit — Clover** (villager; 33 → 1.32) · upright chibi (hopper optional) · sig: long upright ears (pink inside) +
white head · hex `#F0E7DC` fur, `#4C7A44`/`#70925F` dress (= grass, §5), cream apron · prop: small bouquet held at the
chest with both paws · Unique: ears 1-link chains (flop on hops, back when scared), cotton tail, nose twitch (idle key),
light hop gait. Emote: **sniff a leaf** — holds a leaf up, sniffs, ears up = heals / ears droop = poison.

**mole — Old Delve** (villager; 27 → 1.08) · upright chibi (stout) · sig: big pink nose + brass goggles on the head · hex
`#766A71`/`#54485A` fur, `#86582F` leather apron, `#647592` shirt, pink claws · prop: smithing hammer upright in the
RIGHT hand · Unique: tiny squinting eyes (2×1, lid bone), whisker parts, huge claws; trusts nobody he can see → head
tilts to "listen"; heavy stomp-scurry. Emote: **hammer strike** (vertical impact: lift → slam, spark) or sniff the air.

**snail — Tinker Pell** (villager; 26 → 1.05) · limbless glide · sig: big brown spiral shell + two goggled eye stalks ·
hex `#B38556`/`#A06A38` shell, `#D0BF8A`/`#C4B27A` body, brass goggles · prop: little wrench held up front · Unique:
foot squash/stretch cycle at the game cadence (4 drawings, front stretches → rear catches up), stalks as 1-link chains
lagging; "slowly" is personality, not speed: calm head, but the foot works hard at 4 H/s. Emote: **tighten a gear**
(wrench turns twice, stalks lean in) or retract into the shell.

**toad — Toadley** (villager; 26 → 1.05) · upright chibi (wide), hopper optional · sig: wide bumpy olive head with
top eyes + leather satchel · hex `#989A5F`/`#7E8444` skin (§5), cream shirt, dark-green waistcoat, `#5A3E2C` satchel ·
props: satchel on the RIGHT hip, strap across the chest, scroll poking out · Unique: heavy-lidded golden eyes (half-lid
bone), wide smile jaw, throat puff (talk), satchel bounce (1-link chain). Emote: **"finer excuses"** — shrug with palms
out and a slow wink, or pulls the scroll out to sell.

**green-hood — Wisp** (villager; 27 → 1.08) · robed (small) · sig: big peaked moss-green hood + two glowing eyes in a
void face · hex `#617A4A`/`#3A5C2A` (§5: lift away from grass), tan trim, leaf emblem · no props · Unique: hood peak flops
back (1-link chain), boots peek and step, the glow eyes are the only face (keeper arch-hollow rule; eyes = accent, not a
light); smaller and greener than the storyteller. Emote: **eyes flare** (lantern-like glow pulse) or a curious head
tilt.

**nicksong — Nick Song** (villager; 29 → 1.16) · upright townsfolk (≈ 3 heads) · sig: thick shaggy jet-black hair with
fringe + phone with a bright screen · hex `#221E2F` hair (lift §5), `#44444C` sweatshirt, grey-blue jeans, light sneakers
· prop: smartphone in one hand, always looked at · Unique: head pitched down at the phone (within ±15° held: the fringe
must not hide the face at S), screen as a light accent, hair as chunky tufts (1-link chain sway), smirk via a lopsided
mouth part. Emote: **suspiciously pleased** — glances up from the phone, smirks, back down; or a thumbs-typing burst.

**honk — Honk** (mascot 15-122; 31 → 1.24) · bird (horizontal body) · sig: long black neck + white chinstrap/orange beak
(+ clipboard) · hex `#37323C` neck (lift), `#6C6052`/`#897D6A` barred wings, pale belly, orange beak/feet · prop:
clipboard of contracts on the RIGHT side (under the wing) · Unique: neck chain (forward pump in the waddle, S-curve in
idle), beak jaw (HONK), stern brows, waddle-hop with body roll. Emote: **HONK** — neck stretches forward and down, beak
wide, wings half-open (contract check: taps the clipboard).

**chonk — Chonk** (mascot 15-122; 37 → 1.48, may be 1.6) · bird (ball) · sig: perfectly round white body + tiny head &
feet · hex `#E3DBD9`/`#AAA3B1` (white rules §5), orange beak/feet · no props · Unique: the whole ball squashes on every
contact (pos dip + spread), tiny wings flap, ^ ^ happy squint (lid bone), waddle = lean onto the planted foot; at 4 H/s
the tiny feet must hop (duty ≤ 0.12). Emote: **belly bump / sit down** (plops, squash, settles like a dropped cushion).

**polly — Polly** (mascot 15-150; 34 → 1.36) · upright chibi (bird) · sig: scarlet head with big hooked ivory beak + long
red/blue tail · hex `#C4323C`/`#992A3A` feathers, `#282335` tee (lift §5) with white λ (never mirrored: a part on the
chest, not texture), blue+yellow wing bands · Unique: wings hang as sleeves and swing (sided 1-link chains), tail chain,
crest feathers, beak jaw for talk (parrot = big talker: talk is her best clip). Emote: **polymorphic squawk** — wings
spread, head bob ×2, crest up.

**clarabelle — Clarabelle** (mascot 15-210; 33 → 1.32) · upright chibi · sig: floppy ears + little horns + big pink
snout (+ bell) · hex `#E6E0DE` hide with `#38333C` spots (≥ 2-texel patches), pink snout, red collar, brass bell · Unique:
swishing tail with tuft (chain), ears flop, bell swings (1-link chain on the collar), "does two things at once": both arms
do different gestures in talk. Emote: **parallel moo** — moos while both hooves do two different things (wave + point).

**requin — Requin** (mascot 15-213; 34 → 1.36) · upright chibi (fish) · sig: black beret at a jaunty angle + dorsal fin /
tail (+ toothy grin) · hex `#6C88A4`/`#576A87` skin, `#E4E2DC` belly, `#1E2130` beret (lift), red neckerchief · prop: little
lit bomb in one fin (fuse spark = FX flicker) · Unique: tail fin sway (chain), pectoral fins as arms, toothy grin = a jaw
opening that shows teeth (zigzag as 2-texel parts), French swagger. Emote: **"bombs are personal"** — lights the fuse,
shrugs, the spark pops (smoke puff FX).

**progress — Progress** (mascot 15-312; 28 → 1.12) · upright chibi / hopper · sig: big open grin + orange knit scarf
(+ backpack) · hex `#88B75A` (§5!), `#A6C77F` belly, orange scarf, brown backpack · Unique: twin of preservation (same
rig, different face/scarf/accessory): grin wide + tongue, scarf ends chain, backpack bounce; "always takes a step" →
the most energetic hop. Emote: **takes a step** — a big triumphant forward hop with arms up.

**preservation — Preservation** (mascot 15-312; 28 → 1.12) · upright chibi / hopper · sig: round glasses + yellow knit
scarf · hex `#5A8CC8`/`#4A6DA2` skin, `#9CB6D2` belly, yellow scarf · Unique: calm smile, glasses as a lens ring (no
speckle), "never changes type" → stiff, unchanging, minimal hop; deliberately less bouncy than progress. Emote: **pushes
glasses up** and stands perfectly still (a held pose that refuses to change).

**opal — Opal** (mascot 15-411; 29 → 1.16) · upright chibi · sig: long thick tail + teal vest (+ round pebble) · hex
`#A37754`/`#8C5836` fur, `#559D8F`/`#2A8880` vest, cream face/belly · prop: smooth round pebble held to the chest with
both paws · Unique: thick tapering tail (2 links ok if the motion owner fixed the multi-link bug, else 1), sleek otter
lope (bouncy), tiny low ears, whisker pads. Emote: **optimise** — taps the pebble twice (otter rock-tapping), a shiny
glint FX, smug nod.

**cilantro — Cilantro** (mascot 15-251; 39 → 1.56, may be 1.7) · long neck · sig: long patched neck with ossicones + blue
hoodie & green scarf · hex `#D6A456`/`#A67F4E` hide with brown patches, `#3F5F98` hoodie, green scarf · Unique: neck
as a curved chain (counter-bobs the step), scarf end chain, hood bunched at the back, sleeves with hoof hands; the tallest
player — head is above everyone in the square (keep face_lit). Emote: **neck stretch / look over the crowd** (neck up
and forward, slow scan).

**mincut — Mincut** (mascot 15-451; 32 → 1.28) · upright chibi · sig: white-rimmed ears + big ringed fluffy tail · hex
`#D1784A`/`#C65A2A` fur, `#3E211E` dark legs/belly, white face mask, red tear marks · Unique: ringed tail as 1-link chain
with ≥ 2-texel bands, plush-toy cute, ears flick; "finds the weakest link" → scrutinising head tilt. Emote: **snip** —
points at someone and makes a scissor-cut gesture, tail flicks.

**maxflow — Maxflow** (mascot 15-451; 38 → 1.52, may be 1.6) · upright chibi (big plush) · sig: huge fluffy white-tipped
tail + black ears on a very round orange body · hex `#E0844C`/`#D8692C` fur, `#F5EBD9` chest/muzzle, black ears and
stubby legs · Unique: deliberately nothing like the slim fox (rounder, no clothes, bigger), tail sweeps up behind the RIGHT
side, button eyes, soft heavy bounce. Emote: **pushes as much as will fit** — a big two-paw shove with a squash, or
hugs (arms wide, squash).

**theo-rem — Theo Rem** (mascot 21-127; 28 → 1.12) · upright chibi · sig: spiky brown crown of spines + tiny round
spectacles · hex `#7E604A`/`#5E3C2A` spines, `#E2C290` face/belly, black button nose · Unique: spines as a chunky faceted
hull (spikes ≥ 3 px facets, no speckle), spectacles ring, small and round; curl-into-a-ball is the species tell (die!).
Emote: **Q.E.D.** — taps the spectacles, raises one finger, tiny proud bounce.

**greenting — Greenting** (mascot UCT; 28 → 1.12) · upright chibi (bean) · sig: rounded bean body with a stubby snout +
black clock-hand mark on the front · hex `#7BAB6F`/`#5A9A58` (§5!), black mark (lift to dark green-slate) · Unique: a body
that is mostly head (squash on steps), tiny feet (hop table), deadpan small eyes + mouth slit (expression via body tilt
only); clock-hand mark as a part on the front (≥ 2 texels thick). Emote: **"nobody knows what it is"** — a slow, deadpan
180° turn to stare at the viewer, then a tiny wobble.

**storyteller — Storyteller** (not selectable, lantern; 38 → 1.52, tallest) · robed · sig: deep-purple hood with a void
face + glowing amber eyes; tall clock-topped staff · hex `#705284`/`#4C2A72` robe, `#D0A442` gold trim/stars, `#07040C`
void (lift §5) · props: small warm lantern in the RIGHT hand, clock-staff in the LEFT · Unique: unmistakable and unlike any
player (the only purple, the tallest silhouette), hem sways and lags (chain), feet hidden, staff plant; lantern light only in
scene copies. Clips: the storyteller narrates — talk is its main clip (staff raised, lantern lifted); vote = staff raised
(it starts votes); die not needed in game but keep the list. Emote: **turn the clock** — taps the staff, clock hands
advance (a keyed part), lantern flares.

**npc-sweeper / npc-vendor / npc-elder / npc-porter** (NPC; 27 / 30 / 25 / 28 → 1.08 / 1.20 / 1.05 / 1.12) · upright
townsfolk (≈ 3 heads) · "deliberately boring so it never competes with the players": muted slate/ochre palettes, no
signature accent brighter than the players', smaller and quieter motion. Props: sweeper = straw broom pushed ahead
(walk = sweeping strokes), vendor = cream apron + hair bun, elder = cane, a little stooped (heavy, slow-looking gait with
a cane plant), porter = sack over the back (1-link chain bounce). Emote: their job (sweep, call out wares, lean on the
cane and nod, shift the sack).

## 13. Pitfalls specific to porting

- Do not copy the 1-px outline into geometry (no dark rim parts) — readability comes from value contrast (§5).
- Do not trace the v2 pixels: the v2 sprite is drawn for one projection; build volumes and judge at all 8 facings.
- Do not let a hand-held prop swap hands between facings (v2 mirroring artefacts): one hand, `material.sides` 'mid'.
- Mirrored text/marks (polly λ, greenting clock hand, honk's contract): geometry on the front, never mirrored parts.
- Tails and capes are midline chains rooted at |x| ≤ 0.03 m (look sides rule); tails that sweep to one side in v2
  (maxflow right, opal left, mincut left) get that side by a rest direction, not by an x offset.
- Lantern/light characters: put the light in `spec.lights` (socket, warm colour, night intensity, quantized flicker) and drive glow code from `uCharTime`; keep the glass on a warm mid/hi (≈ #FFD27A cap, storyteller r1 drew cream-white) and hang the light low enough that the robe/hem takes a warm rim.
- Green characters: measure against the grass in all six scene copies before Stage 3.
- **Wave 1 (recurring):** keep the v1 VALUE, not just the hue — lifting tones for night turned the crow's dark hat tan and
  the owl/skeleton-chef navy periwinkle; lift only `sh`. Compare your 1× S crop with `refs/cast/<id>.png` side by side.
- **Wave 1 (recurring):** v1 props that stand apart from the body (crow's shovel, mushroom's star staff, moth's lantern)
  must stand apart at 8/8 facings AND in the walk; a prop hugging the coat loses the identity at N/NE/NW.
- **Wave 1 (recurring):** chibi votes raise a prop, not the bare limb (the limb can't clear a 2.2–2.5-head skull); pick
  the prop from the card (mug, ledger, lantern, baguette, shovel, gavel-staff).
- **Wave 1:** a story-gag prop (goat's evidence, owl's ledger) gets its own slot (parchment / v1 brown) — sharing the
  brass/mantle slot made it invisible at 7/8 facings. The ≤ 5 slots + 1 accent rule allows a story prop as a 2nd accent.
- **Wave 1:** frog-type heads are wide flat ovals with eyes breaking the side outline and a snout wedge in profile; a tall
  lathe skull with round top bumps reads as a mouse at S/N.
- **Wave 2 (recurring: toad, green-hood, rabbit, chonk):** keep the v1 HUE too. Every tone of the signature slot (incl.
  `sh`) stays within ≈ 15° of v1; fix ground separation with VALUE (toad r2: v1 olive kept, hi #8E9446 at −28 % L under lit
  grass passes `sig_ground`). Re-hueing olive → tan made the toad a mushroom; a mauve-navy `sh` on green turned Wisp deep
  purple in shade = the Storyteller. White fur/down goes apricot in golden sun: push the hi toward magenta (#F8E8FF).
- **Wave 2 (recurring: mole, honk, toad, snail, green-hood):** the v1 sprite shows the identity prop/face at ITS one
  facing; at 8 facings a fixed sideways offset hides it at two of them (mole hammer E/W/SW, honk board at W, Wisp face at
  E/W, snail shell at S). v1 E/W sprites are the spec for the profile: if v1 shows the face/rim/prop there, so must you.
- **Wave 2:** species marks the v1 brief names are identity, not detail: toad warts + eye bumps above the crown (vs the
  frog), chonk/honk chinstrap U under the beak (wrap ≥ 2 texels below the beak's silhouette), snail cheeks + smile, rabbit
  nose bump in profile (snout ≥ 0.2 m), green-hood hem flaring wider than the hood and a peak visible from behind.
- **Wave 2:** dressed short-legged members (rabbit dress, mole/green-hood/mushroom skirts) cannot use the LegGait IK'd
  feet as-is — the boots pierce the hem (backlog M12); see the playbook Hopper/Stage 3 contact lines for the workaround.
- **Wave 3 (recurring: polly, progress, preservation, opal, mincut):** the v1 S/N silhouette is WIDTH (wings, tail
  beside the body, scarf end hanging out). Depth parts (hooked beak, snout, a tail straight back) vanish into the figure
  at S/N under the 30° camera, and the 25 % blob then matches other cast. Port the v1 S tail position (mincut: root
  ≥ 0.15 m out to the side, curled up beside the hip under the head; opal: ≥ 3 texels past the S outline).
- **Wave 3 (recurring: clarabelle, progress, preservation, polly, requin, mincut):** v1 shows props and cards face-on in
  its one view; in 3D a card/pennant/paddle is edge-on at SE or E/W. Every flat prop: face-on at SE, ≥ 3 texels thick,
  stick ending at a visible fist — and no weapon read at 1× (a sign on a thin dark stick = axe, a navy wing tip = baton).
- **Wave 3 (recurring: cilantro, mincut, polly, opal, clarabelle):** lifting `sh` for the night rule must follow the v1
  HUE: a mauve/plum/lilac shadow turns a giraffe into a llama and a red panda salmon in the pillar shadow (sig_ground
  still PASSes). White animals: `material.whiteKeep` 0.7–0.8 + neutral hi (clarabelle), not a slot `lift` (requin).
- **Wave 3 (recurring: polly, opal, mincut, preservation, progress, clarabelle):** v1 has no die pose to copy; a die lying
  along one axis reads as sitting where the camera looks down that axis. Curl it or roll it diagonally (playbook R W3 die).
- **Wave 3:** the blurb gag must be visible at SE (dir 1) on the camera-side limb and differ from the talk keys (opal,
  clarabelle); a tiny story prop shown only in the emote (mincut scissors, TINY-scale trick) beats a bare-arm gesture.
- **Wave 3:** identity accessories that v1 draws hanging (cilantro's scarf end, requin's bomb in the run) must be KEYED in
  the walk/run clips — a spring chain trails behind the body at game speed and hides them.
- **Wave 4 (4/4: maxflow, storyteller, theo-rem, greenting):** v1 has no point sprite; the game's point aims at the player
  the character FACES. Porting a "hand out to the side" gesture made all four fail (lantern swung 55° out, paw aimed
  screen-left at SE, far arm hidden at W/SW/E). Aim forward-and-up along the facing; the camera-side arm is the RIGHT at
  SE/E and the LEFT at W/SW, so a round body points with both paws or a leading shoulder.
- **Wave 4 (recurring: maxflow, theo-rem; W2/W3 white animals):** CREAM identity (fox chest, hedgehog face) is not white:
  `material.whiteKeep`/`whiteKeepLift` do not catch it and do not lighten. Port v1 cream as a cooler, less saturated hi
  (#F6E4D6, mid #E4C8AA) + a slot lift ≈ 0.35, and compare the golden sun AND shade copies with the v1 S crop.
- **Wave 4 (recurring: maxflow, greenting, theo-rem):** v1 plush/unclothed bodies have no seams; in 3D every same-slot
  limb/head junction draws a light grey-lilac inner line (look backlog). `material.merge` arms/head/legs into the body bone,
  with other-slot face detail (muzzle, cheeks) on a child bone so it keeps its line.
- **Wave 4 (theo-rem):** a v1 sawtooth outline (hedgehog quills, manes, crowns) = ≈ 20–25 fat pyramids (half-width 0.085,
  length 0.2–0.26 m) on a smooth shell, offset L/R; a dense spike grid is a fuzzy halo + a "face" on the back at N.
- **Wave 4 (greenting, colour-identity members):** set `ghost.keepHue` 0.25–0.35 so the ghost stays the identity colour.
- **Wave 4 (storyteller):** a staff carried while walking is a PLANT only if its tip lands ahead of the body at contact —
  key it by eye on E/W walk stills; the plumb-cancel convention leans it forward inside LegGait drawings.
- **Wave 5 (4/4 NPCs: sweeper, vendor, elder, porter):** v1 votes show a raised hand in ONE view; in 3D the raised
  prop floated off the hand, sat on the head, or rose from behind the skull at SE/E/W. The prop bone sits AT the hand
  with the shaft through its origin (no `<prop>.p` slide), height comes from `.l` reach (an `out` raise lowers the hand
  at E), and the held key is judged on the 8-facing still (playbook **R W5 vote prop**).
- **Wave 5 (porter):** port a back load / prop to WHERE v1 draws it (sack: lower back, top at eye level, centred at N) —
  "bigger/higher" moves it away from v1 and turns it into a bun at SW and a hat in the vote.
- **Wave 5 (4/4):** NPCs are "deliberately boring" but must not be the SAME blob: elder, porter, vendor, sweeper and
  green-hood matched at 25 % S/N. Port the one v1 distinguishing shape at ≥ 2 texels (cane, bun, broom fan, sack) and line
  up the NPCs against each other, not only the animal cast.
- **Wave 5 (sweeper, porter):** mid greys and mid tans (v1 #66667C hair, #A19276 burlap) drift tan/orange at golden and no
  keep option gates them (look backlog hueKeep); a charcoal hood must stay charcoal (porter drifted to mauve #524858 =
  toward the Storyteller's purple). Port neutral hoods as warm charcoal (#4C4648 / #3E393C / #332E32).
- **Wave 5 (elder):** a v1 "frail / hobbling" blurb is an ASYMMETRIC gait: keyed `pos` per walk drawing (limp ≥ 1.5 px),
  not `locomotion.bob` (mirror-symmetric). Port the word into a number (`game.head_bob` limp) before Stage 3.
- **Wave 5 (all NPCs, porter measured):** NPCs use `bodyPlan 'biped'` (§6), whose `head_frac` band is 0.24–0.36; the v1
  NPC hood/head is ≈ 0.38–0.39 of the sprite → a known `head_frac` WARN. Keep the v1 proportion and cite this line
  (lead decision pending, tools backlog T41).

## 14. Tools in this folder (refs owner)

- `refs/cast/_src/crop_cast.py` — regenerates every `refs/cast/*.png` + `_stats.json` on the render host:
  `tools/remote.sh python3 refs/cast/_src/crop_cast.py`, then pull: `rsync -az render-host:pixel3d/refs/cast/ refs/cast/`.
- `refs/cast/_src/gamespeed_gif.py` — real-time 1× game-speed GIF next to the v2 sprite (§8). Known (wave 1, mushroom/
  crow/goat): its root-following crop cuts the feet, wide caps and staffs of figures ≥ 1.3 m; judge the bottom edge
  from `clip-game.png` / `raw/clip-game` crops instead (tools backlog T7).
- `shots/refs-cast/gs.js` — game-speed variant wrapper for any character:
  `--q 'char=../shots/refs-cast/gs&gsc=<name>&gsv=3.95&gsC=1.1&gsp=4&gsr=0.6&gsd=0.18&legIK=pose'` (`gsm=heads:2.4,legs:0.55`
  re-proportions characters whose `make(opts)` takes biped options). Use it to try gait numbers before editing your spec.
  (charpack takes it as the name: `tools/charpack.sh ../shots/refs-cast/gs --only clips --clips run --q '…'`.)
