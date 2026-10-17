# Brother Morel — design sheet (char-mushroom), round 3

Cast member `mushroom` (villager): "Blesses the square, sheds spores when nervous." Identity source (read only):
`pipgws/packages/assets/scripts/cast/mushroom.ts`, `refs/cast/mushroom.png`. Code: `characters/mushroom.js`.
Pack: `shots/char-mushroom/` (r2 stills moved to `shots/char-mushroom/r2/`, r2 spec kept as the variant
`shots/char-mushroom/r2.js`). All renders on render-host (RTX 4090, GPU line in `report.txt`). This sheet was rewritten
from the r3 code and the r3 renders; every number below is from `report.txt` or a render listed next to it.

## Stage 0 — brief

**Concept**: a small mushroom monk under a huge spotted red cap, ivory robe with a red stole and hem, a tall gold star
staff in the LEFT hand. He gets around by **hopping** (both boots together). **Adjectives**: shy, devout, jittery
(nervous family, CAST_PORTING §10).

**Identity (5 items)**
1. Blob at 1×: the cap dome WIDER than the body (0.81 m vs 0.54 m robe hem) + the star staff breaking upward beside the
   cap. Star above the cap outline at 7/8 facings (S SE E NE N NW SW; at W the staff stands in front of the cap) —
   `turnaround-silhouette.png`.
2. Palette anchors: cap red (v2 `#CE5F52`/`#973035`), cream spots + ivory robe (`#EBE1C9`), red trim, gold staff.
3. Prop: star staff, LEFT hand (v2 S/SE frames; 3D keeps the left).
4. Face: small shy face under the brim, 2×2 dark dot eyes, a tiny mouth; no brows (the brim is the brow).
5. v2 motion: 1-px bob, feet under the hem, staff barely moves. r3 keeps the steady staff and turns the bob into a hop.

**Body plan**: upright chibi, robed (`chibi()` → `bodyPlan 'uprightAnimal'`); locomotion `plan 'hop'` on the two
biped legs.

**Proportions** (texels at vh 10 = 36 px/m)

| part | m | texels |
|---|---|---|
| H (spec height, used for 4·H/s) | 1.36 (castHeight(34)) | 49 at S (`height_px` S 49, min 46, max 63 with the staff) |
| skeleton height (cap top) | 1.26, heads 2.0 (head bone = face + cap) | 45 |
| cap | Ø 0.81, 0.35 tall, underside 0.92 m, tipped back 8° | 29 wide |
| face | Ø 0.45 octagon lathe, chin 0.62 m | 16 wide |
| robe | hem 0.10 m (r 0.27) → top r 0.15 | 19 wide at the hem |
| legs | thigh = shin = 0.27 m, knee bent forward at rest (hip 0.39, ankle 0.07 unchanged) | dark shin (lower 60 %) + boot under the hem |
| staff | 0.24 below the grip + 1.14 above (1.38 m), star r 0.1 | 2 texels thick |

**Palette** (5 slots + accent, from `PALETTE`): cap `#D85A4E/#B8383E/#741C2E` (signature, most saturated mass; sh is a
saturated wine red so the shade copy reads red, −29 % / −32 % vs grass shadow), robe `#F6EEDC/#E2D6BC/#A8949C` (robe,
sleeves, cuffs, spots — lightest mass), skin `#F8E2BE/#E6BE96/#BC8E80`, trim `#D8505A/#A8303C/#6A2440` (stole + hem
band), dark `#7A5444/#523628/#3E2A30` (shins, boots, eyes, mouth), gold accent `#FCE29A/#E0B04C/#9C7240` (staff, star).
Spores (FX, not a slot): pale spore-green `#E4F0A0/#B4C866/#7C8C44` puffs and `#E8F2A0/#6E7C34` falling motes.

**Parts / bones**: chibi skeleton (biped names + eyeL/R, mouth) with the leg bones re-authored long and bent (see
Locomotion) + `cap0` (cap bone on the head: keyed tilt, gait squash) + `hopPitch` (part-less bone under the hips that
receives the hop's hip pitch). Cap = 12-sided lathe, in-plane subdivided (0.05 m), spots cut out of the dome surface
itself (coincident → no inner-line ring). Arms authored BENT at rest; the LEFT (staff) arm carries forward-out
(upper out 38 fwd 10, fore out 66 fwd 40) so at SE the fist sits right of and below the face. Left sleeve/cuff/hand are
shaded as midline (`material.sides`), so the far-side sleeve is ivory, not a lavender squiggle. Staff plumb (out 2°)
through the left grip; ONE thick 5-point star turned to the game facing. Sockets: `star` (vote sparkle, bless glint),
`spores` (cap centre), `sporeL/R` (x ±0.3, z −0.22 under the brim: behind the head at the game facing).

## Unique to me

1. **Extra animated parts**
   - *Cap* (`cap0`): keyed tilt in `bless` (f25 bow +8°, f32/f36 shudder roll ±14°) and `die` (f6 buckle nod 12° /
     roll −10°, DEAD −6°); in walk/run the hop's squash channel flattens and widens it 8 % on each landing drawing
     (`clip-game.png` landing drawings f5/f13/f22…). No spring chain (r1 A/B `ab-c`: idle redraws, no visible wobble).
   - *Spores* (FX): `poof@sporeL|R` puffs + `flap@sporeL|R` falling motes, pale green, on the bless shudder (f32–38)
     and the die flinch/buckle/impact (f0, f6, f14). No idle spore event any more (the r2 f60 fleck scratched the
     face). 8-facing still with FX: `self/g8-bless-fx-x3.png` (f33, f40: puffs visible at 8/8).
   - *Staff*: keyed per clip — lifted on every talk beat (`TAP`, 22°), raised SIDEWAYS and held in vote
     (`STAFF_HIGH`: upperArmL out 85, wrist −95 → plumb, star high over the cap at 8/8), swept wide in bless f8 (glint),
     swept forward f17, leaned on in the bow f25, lying flat out to his left when dead. In walk/run the staff is
     **held** (the hop style has no arm channels): it rides the body and rocks only with the small spine pitch.
   - *Legs*: dark shins + boots kick out under the hem in the rise/fall drawings and land under it on the contact
     drawing (`self/game-dir1-30hz-x4.png`, `self/game-dir2-30hz-x4.png`).
2. **My locomotion — a hop.** Both boots land together on ONE drawing per cycle (the contact key: 1-texel crouch +
   cap squash, boots on the ground under the hem), then rise · apex · fall with the boots dangling under the hem
   (lift 0). Numbers (`game.readable`): V = 4·H = 5.44 m/s, cycle 0.283 s = 1.13 H, 4/4 drawings per cycle, holds
   2×7,3,2×9,3,2×4; hop arc 0.13·H = 0.18 m (6 texels: the cast shadow separates from the hem at the apex in
   `self/game-1x-sheet.png`), run 5·H at 0.333 s with a 0.18·H arc. `game.foot_slide` is n/a by construction (a
   foot is planted on one drawing only); 60 Hz in-hold foot ride 0.04 texels (r2 3.23). Surge off (whole-figure
   in-hold flicker 6721 px with it, `ab-hop2` vs `ab-hop2s`). Why the long bent legs: LegGait lowers the body until a
   planted foot is reachable over a whole held drawing (≈ 0.36 m half-span at 4 H/s); the 0.32 m chibi legs made it
   drop the body 0.32 m and the hem walked under the ground.
3. **Expressions**: eyes 2×2 texels (0.06 m dark boxes), blink = `eye*.s` [0,−0.75,0] 2 frames in idle (f36), WIDE on
   vote and the die flinch, SHUT on die, the bless gather and the bow, squint −0.5 on the nervous shudder; mouth 2×1,
   talk opens it ×2.3 on alternate keys; shyness = the shudder duck under the brim (bless f32/36) and an idle sideways
   glance (head twist 28°, f60–66). Face visible at the game facing in every held key except the bless bow and dead
   (`self/se-keys-1x-x4.png`); `face_lit` 88 % (S .91, SE .89, SW .84).
4. **Game-speed readability** (judged on `game-1x.gif` / `self/game-1x-sheet.png` at 1× real time and on
   `gamespeed.gif` beside the v2 sprite): a brisk bouncing hop, 4 distinct drawings per 0.28 s, the landing squash and
   the airborne shadow gap both read at 1×; talk — 4 keys of 5 frames, staff tap + head turn, `talk.amplitude` 34 %;
   vote — up at f4, held 0.87 s; die — "down" at f14 (0.47 s), held; bless — 8 drawings, `bless.pose_read` 70 %.

## Timing charts (30 Hz grid)

| clip | keys (f: what) |
|---|---|
| idle (loop 72) | 0 up · 30 breath down 1 texel (chest 5, head −5) · 36 blink (2) · 38 down · 60 shy glance (head twist 28) · 66 up |
| talk (loop 20, `speak` f0) | 0 chin up (head −10, twist −8 toward the viewer) + mouth open + right hand out + staff tap · 5 body dip, mouth closed, staff down · 10 chin up other way, open, hand fwd 85° · 15 dip, mouth 0.3 |
| vote (hold) | 0 dip 0.06 m (head −16: world −2), staff gathered · 4 staff raised sideways (STAFF_HIGH), eyes wide, `vote@star` · 24 same (held) |
| die (hold, legs fk) | 0 sleepy sigh (eyes droop −0.5, hand to heart, 1 texel sink) + spores — no `hurt` flash/flinch (touch-up, Clocktower-only) · 6 buckle 0.16 m (KNEES_D: ankles stay under the hips), eyes shut, cap nod, spores · 10 tipping forward · 14 face-down topple (`land` + spores), staff flat out left · 34 held |
| bless | 0 gather, eyes shut, staff at carry, hand on heart · 8 staff swung wide out-left, `hit@star` glint · 17 staff swept forward · 25 deep bow, cap tipped +8 · 32/36 shudder ±(spine 6, cap roll 14) + spores, duck, squint · 40 shy head turn · 52 idle |
| point (one-shot, 3.6 s = the game's 3.5 s point) | 0 gather (arm back, eyes wide) · 5 POINT: chest+spine twist 40° left, right arm forward-straight (≈ 40° left of the facing = screen-right at SE), head −38 so the face stays on the facing · 17 jab (arm −10, dip, mouth open) · 29 point · 50 jab · 60 point · 84 retract: hand to heart, shy glance · 96 idle |
| ghost (loop 72) | 0/18/36/54: hover 0.15 / 0.135 / 0.12 / 0.135 m (1-texel bob), sway ±3° (cap counter-roll), hand on heart, shins+boots scaled away, `halo.s` = 999 (gold halo over the cap); shader: pale-blue ramp + dithered lower-robe fade |
| ghost-spent (loop 72) | same at 0.10 / 0.07 m, head bowed, eyes −0.5, no halo (`halo.s` = 1 = the spent signal); shader: desaturated, ×0.62 darker, fade starts lower |
| walk / run | procedural LegGait hop at 4·H / 5·H (no authored walk clip: LegGait ignores `clips.walk` poses) |

Dynamics: no chains; personality default; `character.quant { yaw 8, chain 4 }`; legIK 'plant' (default).

## Self-critique (Stage 7, r3)

Evidence: `report.txt` (`--preset cast --raw`: 62 pass / 21 warn / 0 fail), `turnaround*.png`, `clip-*.png`,
`self/se-keys-1x-x4.png`, `self/g8-bless-fx-x3.png`, `self/game-dir1-30hz-x4.png`, `self/game-dir2-30hz-x4.png`,
`self/game-1x-sheet.png`, `gamespeed.png`, scene crops, bake `out/sprites/mushroom*`.

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | dome unlike the cast; star above the cap 7/8 (`turnaround-silhouette.png`, W in front of the cap) | — |
| 2 | Pixel stability | 1 | idle/talk/vote/die/bless off_grid 0, flicker 0, pan 0, deterministic PASS; walk off_grid 11 / flicker 424, game 9/310, run 13/585 — all "legs only, upper 0" (the planted shins re-pin in-hold) | legIK 'pose' for the hop, or hide the shins in-hold |
| 3 | Line quality | 1 | silhouette_line 0/1402, inner 357, no detached boot squares at either dir (`self/game-dir*-30hz-x4.png`); speckle 35, `bless.key_speckle` +9 (the long diagonal staff of the f8 sweep) | a thicker or darker-edged staff on the sweep key |
| 4 | Tonal discipline | 1 | cap hi/mid ≥ 0.9 at 8/8; cap isolated_px max 4 (r2 5; want ≤ 2), colors/slot dark 13 | fewer dark parts (shins + boots + eyes share 'dark') |
| 5 | Ground separation | 2 | noon-sun dH 97, golden-sun dH 60; noon-shade −29 %, golden-shade −32 % (all PASS); shade cap reads wine red (`scene-noon-crop.png`) | — |
| 6 | Proportion, appeal, expression | 1 | face_lit 88 %, fist off the face at SE in every key; `head_frac` 0.55 and `height_px` max 63 WARN (the 1.38 m staff); the staff still overlaps the face edge at W | a shorter staff that still clears the cap at NW/SW |
| 7 | Animation timing | 2 | single_frame 0 everywhere, hold_redraws 0, strobe ≤ 1; vote up at f4, die down at f14, bless 8 drawings | — |
| 8 | Weight, contact, game speed | 2 | 4.0 H/s, 0.283 s, 1.13 H, 4/4 drawings; a landing drawing every cycle (crouch + squash + boots down), airborne shadow gap at the apex, in-hold ride 0.04 texels | an authored staff plant per landing (needs LegGait to read walk clips) |
| 9 | Personality, secondary | 1 | cap squash per hop, spores in bless/die, staff tap in talk, shy glance; staff is static in the walk | staff/cap keyed per gait drawing |
| 10 | Smears and FX | 1 | spores visible at 8/8 in bless f33/f40 (`self/g8-bless-fx-x3.png`), idle face scratch gone; glint, vote sparkle, speech, land dust fire | — |
| 11 | Facing and turns | 2 | 8 facings read; turn off_grid 0, flicker 0; turn.foot_slide 3.92 WARN (hidden feet) | — |
| 12 | Technical | 2 | page_errors 0, deterministic + vote.deterministic 0 px, draw calls 2/1, night_freeze 0, night_pan 0, RTX 4090 | — |

**Total 18 / 24** (bar 19). Weakest points: (1) walk/run leg flicker (legs-only, 310–585 px); (2) dotted staircase
on the bless sweep staff and speckle 35; (3) the 1.38 m staff pushes `height_px`/`head_frac` to WARN and still crosses
the face edge at W. Bake: `out/sprites/mushroom.json` (cell 128×200, 7 clips × 8 dirs) — bless at W/SW still touches the
cell border (the bake cell width stays 128, see module issues).

## Touch-up (2026-10-16): Clocktower clips point / ghost / ghost-spent

Rules: CAST_PORTING / PLAYBOOK top notes (Clocktower-only, no combat). Pack: `shots/char-mushroom/` re-rendered with
`--preset cast --clips idle,walk,run,talk,vote,die,bless,point,ghost,ghost-spent,turn --raw` → **92 pass / 22 warn / 0 fail**
(`report.txt`; RTX 4090). Bake: `out/sprites/mushroom.json` 10 clips × 8 dirs (cell 128×184; die/bless at S/W/SW still touch
the 128-wide cell, pre-existing). Touch-up stills: `shots/char-mushroom/tu/` (g8-*-x3.png 8-facing keys, point-keys.png,
pv-sheet.png point A/B, point-1x.png 1× strip, bake-ghost.png / bake-point.png crops of the baked sheet, pk/ ghost re-check).

- **Combat audit:** only `die` had a hurt reaction (`hurt` flash + flung-arm flinch at f0). Now a sleepy sigh (eyes droop,
  hand to heart, spores drift); the fold-forward collapse, soft `land` ring and hold are kept. `bless` `hit@star` is a
  star glint, not a strike (kept). No weapon swing anywhere (staff is never swung at anyone).
- **point:** see timing chart. Straight-forward pointing was foreshortened under the 0.8 m brim at S/SE and the hand
  vanished by the staff fist (`tu/g8-point-f5` r1, `tu/p5-se-x8.png`); the 40° chest twist makes the arm a clear stroke to
  screen-right at SE (`clip-point.png` f13–f68). point: off_grid 0, flicker 0, pose_read 35 % ×10, key_speckle +6.
- **ghost / ghost-spent** (all in the spec, no shared code): a HALO bone in the cap whose ring is authored at ×0.001
  (buried inside the dome → invisible alive, `turnaround.png` unchanged) and keyed `halo.s` 999 in ghost; the halo bone's
  world scale relative to the head is also the ghost signal read in `material.vertex` (`getBoneMatrix`), and
  `material.tones` remaps hi/mid/sh by luminance onto a pale-blue ramp (#4E6C9C → #DCF4FC; spent desaturated ×0.62) and
  dithers the lower robe away (2×2 ordered `discard` on bind height, both passes → baked alpha is transparent there).
  Legs: loop clips keep the gait's ground IK, so the hover stays within leg reach (no dip) and the shins+boots are
  scaled to 2 % into the robe. ghost: off_grid 0, flicker 0, 6 drawings/2.4 s, islands 2 (the halo, intended);
  ghost-spent islands 1. 1× reads as a pale hovering Morel with a gold halo (`clip-ghost-1x.gif`, `tu/bake-ghost.png`).
- **Module fixes re-check:** walk/game at 4.0 H/s, cycle 0.278 s, 4/4 drawings (`game.readable` PASS); hem stays above
  the ground on every hop drawing, boots show under it on rise/fall, shadow gap at the apex (`clip-game.png`,
  `game-onion.png`). walk/game/run leg flicker unchanged in kind (legs only, upper 0).
