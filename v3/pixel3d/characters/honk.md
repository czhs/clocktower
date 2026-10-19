# Honk — design sheet (cast member `honk`, mascot 15-122)

"A grey goose with contracts to check." Identity source (read only): `pipgws/packages/assets/scripts/cast/honk.ts`
+ `refs/cast/honk.png`. Spec: `characters/honk.js`. Pack: `shots/char-honk/`.
(Stage 0 sheet, written before modelling; numbers re-synced from the code in the final round, see §Self-critique.
Touch-up t1 added point / ghost / ghost-spent: §Timing + §Touch-up t1.)

## Concept + adjectives
A stern Canada-goose bureaucrat who waddles the square with his clipboard of `//@requires` / `//@ensures` and honks
at anything that violates a contract. **Stern, officious, brisk** → personality f 3–3.5, ζ 0.8 (proud/formal row of
CAST_PORTING §10 with the brisk walk of a goose), crisp holds, chest out, short sharp head thrusts.

## Identity (CAST_PORTING §3)
1. **Silhouette blob at 1×** (ref 1× strip): a round body BALL with a tall thin dark NECK column and a small head on
   top (a "lollipop on an egg"); from E/W the classic goose S: horizontal egg + tail up-back + vertical neck. Two-part
   signature: **black neck/head + white chinstrap** (with the orange beak). No other cast member has a thin neck column
   (cilantro's neck sits on a biped body; chonk is a ball with no neck).
2. **Palette anchors**: near-black neck `#37323C`, white cheek `#EFE8DC`, orange beak/feet `#E08A32`, grey-brown
   barred body `#857A6C` / wing `#6C6052`, pale belly `#C4BCAE`.
3. **Prop**: clipboard of contracts (brown board `#8A5A32`, cream paper, gold clip, a red/orange tick). v2 S/SE show
   it at screen right = the goose's **LEFT** flank, held upright, face to the front (N shows its back at screen left).
   Kept on the LEFT at every facing (one side, never mirrored).
4. **Face**: one light eye per side (v2: 1 glint px over 1 brown px) with a **stern brow** slanting down toward the
   beak; orange beak pointing forward; white chinstrap U under the beak, cheek to cheek.
5. **Motion the v2 code implies**: "Waddles." — 1-px bob + `sway` (body shifts sideways), feet lift alternately.

## Body plan + game speed
Plan **bird** (horizontal body, CAST_PORTING §6) on a hand-built skeleton with the `bird()` bone names (body, chest,
neck, neck1, head, jaw, eye/brow, upperArm/forearm/hand = folded WING paddles, thigh/shin/foot, tail0, + `board`).
`spec.bodyPlan 'bird'`, `locomotion.plan 'bird'` (LegGait).
- H = **1.24 m** (v2 31 px × 0.04) → ≈ 45 texels at vh 10. heightPx [38, 50].
- **Legs**: a real goose hides its thigh in the body. Hip joint at 0.42 m (inside the egg), thigh 0.23 m forward-down
  to a knee inside the body, shank 0.27 m back-down to the ankle; only the lower shank + webbed foot show (≈ 0.12 m,
  4 texels). Rest hip height 0.375 m over the ankle with 0.50 m of folded leg → the LegGait reach drop (backlog M2) is
  ≈ 0 instead of seating the body on the grass (a straight 0.15 m leg would drop ≈ the whole hip height).
- v_game = 3.95·H = **4.90 m/s**; N = 4 drawings × 2–3 grid frames; cycle 0.3 s → C = 1.47 m = 1.19 H; one step
  0.73 m. Duty: LegGait β = 1/n = 0.25. **r2: cycle 0.28 s (C 1.10 H), `plant: 'hold'` (one leg drawing per gait drawing, no per-frame re-pin), roll 14°, headBob 8°, lift 0.04 H, visible shank shortened to the lower 38 % (t1: lower 60 %, feet no longer detached).**
- **Gait word: waddle** (alternate feet, the v2 gait) made bouncy: bob 0.04 m (≈ 3 texels p-p, two per cycle), body
  ROLL ±12° over the planted foot, neck/head THRUST 14° per touchdown, wing tips splay alternately. Run (Storyteller
  2·v) = the bird plan's two-footed hop (declared optional: no plant can hold at 9.8 m/s).

## Unique to me
(Re-checked in round 2 against the r2 renders: `shots/char-honk/r2/z-*.png` 8-facing key stills, `clip-*.png`,
`r2/gs-game1x.png` / `r2/gs-honk1x.png` = the 1× real-time GIF frames laid side by side.)
1. **Extra animated parts** (all KEYED, no spring chains — loop clips run dynamics free, backlog M5):
   - **Neck** (2 links + head): S-curve in idle, thrust in the waddle (LegGait `headBob` 8° on `neck`/`head`: the head
     stays up while the body rolls), forward pump in talk (≥ 20° between keys, head kept level), stretch forward-down
     in HONK, laid ON THE GRASS in die (rolls with the body, droops past it). ✔ visible in every listed clip.
   - **Beak** (`jaw`, lower mandible + dark mouth slot): open 30–40° in talk/HONK (≈ 2 texels at S/SE). ✔
   - **Wings** (upperArm = coverts+secondaries as ONE plate, hand = dark primaries folded low along the rump): splay
     in the walk (LegGait wings channel), gesture in talk (near wing out), raised UP-AND-BACK in vote, half-open in
     HONK, lifting the board in the tap. ✔
   - **Tail** (`tail0`, black wedge up-back): waggle ±18° keyed in idle and up in HONK. Partly ✔: hard to see at 1×.
   - **Clipboard** (`board`, chest child, keyed with `board.p`/rotation): rides the body roll in the walk, lifted
     above the back in the vote (clear of the neck at 8/8, paper face tilted to the camera), lifted to the front-left
     and TAPPED with the beak (from the side, head twisted 45°) in the emote. ✔
   - **Brows** (`browL/R`): stern at rest, raised in vote, furrowed in HONK — sub-texel at 1× (honest: the stern read
     comes from the eye wedge, not from brow motion). Eyes blink by scale (`eyeL.s`), **cream X eyes** in die
     (`xeyeL/R` bones, sunk in the skull until `xeyeL.p` pushes them out). ✔ X reads as a 3-px cream star at 1×.
   FX: `speak` bubble (talk), `vote@boardTop` sparkle, `emote:exclaim` after the HONK pose, `die` → land dust, wing
   `flap` feathers on the HONK (the fx module draws them as 1-px slashes, module issue).
2. **My locomotion — waddle (game speed)**: LegGait 'bird' walk = alternating waddle, 4 drawings per 0.278 s cycle
   (C 1.10 H), drawings held 2–3 grid frames, `plant: 'hold'` (r2): each drawing is ONE clean leg drawing like a
   sprite cycle, no 60 Hz re-pin inside a hold (game.flicker 919 → 49 px, off_grid 26 → 1). What carries the rhythm
   at 1×: the whole-figure bob, the ±14° body roll, a small neck thrust, short alternating orange feet (shank ≈ 3–4
   texels, r1 6–8). `surge: false`. Contact is drawn (touchdown drawing) but no foot is planted for 2 drawings
   (foot_slide n/a): the planted foot rides the root inside the hold, as in a baked sheet. ✔ `r2/gs-game1x.png`.
3. **Expressions in the new style**: eye = a cream ellipse CUT OUT of the skull at 46° (blink = `eyeL.s` y −0.8 over
   a dark inset patch); stern brow slab; beak jaw 35°. Chinstrap (r2): cheek patch cut out of the head lowered to
   0.095 (≥ 1 texel of black between it and the eye at W/SW) and wrapped back up the cheek, plus a cream THROAT band
   cut out of neck1's front top, so at S a U shows under the beak (grey cheek sides + 2 cream px, `r2/hs.png`).
   talk = beak open on alternate keys + forward neck pump with the head level (face visible at S); vote = brows
   raised, chest up, neck leaning away from the board; die = neck and head on the grass, X eyes; HONK = brows furrowed,
   beak wide, neck forward with the face still showing at S (head −56).
4. **Game-speed readability**: walk judged on the 1× GIF frames + pose-id log; talk beat every 6 f; vote rises in 4 f
   and holds 2 s; die reads in ≤ 1 s (sit 6 f → tip 6 f → down, held 1.8 s with no pop); HONK anticipation 6 f, pose
   held 12 f. Evidence: `clip-*-1x.gif`, `r2/gs-*.png`.

## Proportions (m / texels at vh 10)
| part | size (m) | texels |
|---|---|---|
| total height | 1.24 | ≈ 45 |
| body egg (w × h × l) | 0.52 × 0.46 × 0.62 | 19 × 17 × 22 |
| neck (thickness × length) | 0.13 × 0.40 | 5 × 14 |
| head (w × h × l) | 0.25 × 0.26 × 0.30 | 9 × 9 × 11 |
| beak length | 0.13 | 5 |
| eye | 0.075 | 2–3 |
| visible leg + foot | 0.12 | 4 |
| clipboard (w × h) | 0.20 × 0.27 | 7 × 10 |

## Palette (≤ 5 slots + accent + story-prop slots)
| slot | hi | mid | sh | use |
|---|---|---|---|---|
| neck | `#554D5F` | `#423A4A` | `#3A3042` | neck, head, tail, wing primaries, brows (v1 `#37323C`, sh at the night floor) |
| body | `#A89C8A` | `#857A6C` | `#5E5464` | back/flank egg (v1 BODY) |
| wing | `#8E826E` | `#6C6052` | `#4E4038` | folded wing coverts (v1 WING) — warm sh ≠ body's mauve sh |
| belly | `#E8E0D2` | `#C4BCAE` | `#8E8698` | breast/belly, white rump |
| beak (accent) | `#F6AE5C` | `#E08A32` | `#A65A3C` | beak, legs, feet, clip, tick |
| board (story) | `#B07A4A` | `#8A5A32` | `#5E3C3A` | clipboard |
| cream (story) | `#FAF4E8` | `#EFE8DC` | `#B4AAB0` | chinstrap, eyes, paper |
Grass mid `#75A558`: body is 60°+ off hue; the dark neck is the darkest mass (a dark signature, reads −25 % L).

## Timing (from the code, 30 Hz grid, all `interp: 'step'`)
| clip | keys (f: what) | reads at 1× because |
|---|---|---|
| idle (loop 72) | 0 rest · 30 breathe-in + glance toward the dir-1 camera (head twist −22, tilt 6) + tail wag 18 · 36 blink (eye scale −0.8, 2 f) · 38 glance open · 60 head back, tail wag −18 | 5 drawings, extremes held 22–30 f; off_grid 0, flicker 0 |
| walk (LegGait bird) | 4 drawings / 0.278 s (holds 2–3), C 1.10 H at 3.95 H/s; roll 14°, headBob 8°, bob 0.04 m, lift 0.05 H, surge off, **plant 'hold'** (sprite-style leg drawings, no 60 Hz re-pin) | whole-figure bob + roll + neck thrust + short orange feet (≈ 3–4 texels of shank); `game.readable` PASS 4/4; game.flicker 49 (1 frame) |
| run (LegGait bird hop) | 4 drawings at 2·v, two-footed hop, apex 0.24 H, plant 'hold' (r2: no reach seat, the egg rides above the feet) | hop arc reads in `clip-run.png`; still the weakest clip |
| talk (loop 24) | 0 shut, neck −6 · 6 beak open 36°, neck +16 / neck1 +2 / head −24 (head level), brows up, near (R) wing gesture · 12 shut, head turned −12 · 18 open 32°, same thrust | ≥ 20° neck change every 6 f, amplitude 31 %; speak bubble on f0; face visible at S (`r2/z-talk6.png`) |
| vote (hold) | 0 anticipation dip (pos −0.03, neck +8) 4 f · 4 LEFT wing up-and-BACK (upperArmL [−85, −90, 45], forearmL −20) holding the clipboard above the back, tilted back 25° and yawed out 30° (board.p [0.22, 0.76, −0.2]), neck leans away (z +8), brows raised · held to f60 by `length: 61` | up in 4 f; pose_read 46 %; final_hold 2.07 s; board + paper clear of the neck at 8/8 (`r2/z-vG.png`) |
| die (hold) | 0 dazed sway, half eyes · 6 sit (legs fold, pos −0.10) · 12 tip left 55°, neck follows · 16 lands 84°, `land` dust, X eyes out · 22 lying on the left side, neck + head ON the grass (neck rolls with the body + droops 20°/12°), cream X eyes · held to f60 by `length: 61` (no duplicate key) | pose_read 84 % ×55, final_hold 1.8 s, intervals end at f22 (no f60 pop) |
| point (touch-up t1, 52) | 0 anticipation: neck pulled back, head nods in, left wing gathered (4 f) · 4 POINT: neck upright, head level and turned 10° toward the target, beak open 20° ("You!"), the free LEFT wing swung forward-out ≈ 40° up (upperArmL [42, 0, 132]) with the dark primaries straight as the finger, tail cocked (held 16) · 20 firmer jab: wing +6° higher, beak 8° (held 14) · 34 wing folds back, glance (8) · 42 idle, held to 52 | pose_read 39 % ×14, key_delta 18 %, hold_redraws 0, key_speckle +10 (WARN: primaries' tip); wing in the silhouette at S/SE/NE/N/NW/W (6/8; behind the neck at E, behind the head at SW — the beak still points there) |
| ghost (loop 72, t1) | 0 hover 0.16 m, body roll +4° · 18 mid · 36 low 0.12, roll −4° · 54 mid; eyes half, wings eased 6° open, shins + feet scaled away, `legs: 'fk'`; gold halo ring over the crown; pale-blue shader + 2×2 dither dissolve of the belly (bind y 0.10 → 0.40) | off_grid 0, flicker 0, amplitude 20 %, islands 2 (= the halo); head 3.1–3.8 px above idle (stage log `s.h`), feet 7 px off the grass |
| ghost-spent (loop 72, t1) | same keys, lower (0.10 / 0.07), neck/head bowed 8°, eyes −0.65, wings hanging, tail down, NO halo, desaturated + ×0.62 dimmer (shader), dissolve 0.08 → 0.36 | off_grid 0, flicker 0, amplitude 24 %, islands 1 |
| honk (emote, 48) | 0 wind-up: neck pulled back, chest up, brows furrowed (6 f) · 6 HONK: neck thrust forward-down, head −56 so the face shows at S, beak 42°, both wings half-open, tail up, flap feathers + `emote:exclaim` (12 f) · 18 recoil · 24/28/32/36 left wing lifts the clipboard to the front-left, head twisted 45° to it, beak taps it from the side twice · 40 satisfied glance · 48 rest | pose_read 34 %, hold_redraws 0, key_speckle +5 |

## Self-critique (round 2, after the art-director review 16/24; rendered on render-host RTX 4090)
Evidence: `shots/char-honk/report.txt` (full `--preset cast --raw` pack: 65 pass, 18 warn, 1 fail), `clip-*.png`,
`game-onion.png`, `r2/z-{idle0,talk6,vote20→vG,die50,honk10,honk26}.png` (8-facing key stills ×4), `r2/h-*.png` (head
zooms ×5), `r2/hs.png` (S head ×14), `r2/gs-{game,honk}1x.png` (1× GIF frames), `bake/honk-preview.png` (8-dir cast bake).
Fixed (critic owner 'character'): die end lies with the neck and head on the grass at 8/8 + cream X eyes; vote board
up-and-back, clear of the neck at W/NW, paper tilted to the camera; chinstrap U under the beak at S + black gap to the
eye at W/SW; talk/HONK/tap keep the face visible at S; shorter shank + head bob 8°; covert seam merged (no flank
tick); primaries folded low; run = hop with plant 'hold' (no seat). Workarounds for 'motion' issues: one-shots end on
`length: 61` (die f60 pop gone: die intervals end at f22), `plant: 'hold'` (walk/game flicker 919 → 49 px).
NOT run: per-facing hand tone counts, a dir-2 pack, a fresh 25 % line-up composite.

| # | criterion | score | evidence |
|---|---|---|---|
| 1 | Silhouette | 2 | turnaround-silhouette 8/8 goose; chin 3–12 px/facing; primaries no longer stand up as prongs at S |
| 2 | Pixel stability | 2 | idle/talk/vote/die/honk off_grid 0 flicker 0; game off_grid 1, flicker 49 (one frame); pan/night 0 |
| 3 | Line quality | 1 | silhouette_line 0, flank seam tick gone; speckle 28, neck isolated max 5 |
| 4 | Tonal discipline | 1 | colors/slot belly 10 / wing 9 still WARN; die.key_speckle +9 (X eyes) |
| 5 | Ground separation | 2 | sig_ground 4/4 PASS (unchanged) |
| 6 | Proportion/expression | 2 | face visible at S in talk/HONK/tap; X eyes; chin U at S |
| 7 | Animation timing | 2 | single_frame 0, strobe ≤ 1, final holds 1.8/2.07 s with no end pop |
| 8 | Weight/contact/game speed | 1 | game.readable 3.95 H/s 0.278 s 1.10 H 4/4; short legs; no 2-drawing plant (foot_slide n/a) |
| 9 | Personality/secondary | 1 | neck, beak, wings, board (vote/tap), X eyes all visible; tail wag weak at 1× |
| 10 | FX | 1 | fx-module feathers still 1-px slashes; exclaim grows over 2 drawings (fx owner) |
| 11 | Facing/turns | 2 | 8 facings; turn steps held 2 f (turn.foot_slide 4.58 unchanged) |
| 12 | Technical | 2 | page_errors 0, deterministic, draw calls 2/1, RTX 4090 |
| | **total** | **19** | |

Weakest now: (1) contact — the bird walk has no 2-drawing plant (shared LegGait); (2) tones (belly 10 / wing 9);
(3) the run hop and the HONK feathers are still the least convincing pieces; brows are sub-texel.

## Touch-up t1 (2026-10-16, Clocktower clip set; rendered on render-host RTX 4090)
Evidence: `shots/char-honk/report.txt` (full pack `--preset cast --clips idle,walk,run,talk,vote,die,point,ghost,ghost-spent,honk,turn --raw`:
**104 pass, 24 warn, 0 fail**, page_errors 0), `t1/z-{point-f4,point-f20,ghost-f0,ghost-f36,ghost-spent-f0}.png` (8-facing key
stills ×3), `t1/gs-{point,ghost,ghost-spent,game}-1x.png` (every frame of the 1× real-time GIFs with durations),
`bake/honk-preview.png` + `t1/bake-{ghost,point}.png` (8-dir bake, also copied to `out/sprites/`), `t1/A/` (pre-touch-up pack).
- **Combat audit**: none of honk's clips is combat-flavoured (no weapon, no strike smear, no hurt flash: die starts on a
  dazed sway, the HONK is a vocal + clipboard tap). First `point` try thrust the neck LOW and forward = the hissing-goose
  attack posture → rebuilt upright (head level, the wing is the pointer). Unchanged otherwise.
- **New `point`** (the shared emote), **`ghost`**, **`ghost-spent`** — timing rows above. Ghost recipe = goat/mushroom's
  (halo bone appended LAST inside the skull, ring at HALO_K 0.001 grown ×1000 in `ghost`; its world scale is the shader's
  ghost signal; `material.{vertexHead,vertex,fragmentHead,tones}` remap tones by luminance onto a lifted pale-blue ramp
  (gamma 0.36, dark end `#5A78AA` so the black neck becomes v1's mid blue, not navy) + 2×2 ordered dither dissolve of
  the belly). New palette slot `halo` (gold, untinted). A/B of the living clips before the shank change: turnaround,
  idle, walk, run, talk, vote, die, honk, turn, game, scenes, pan = **0 px differ** (`t1/A` vs pack).
- **Module-fix re-check**: walk still reads at game speed (game.readable 3.95 H/s, 0.278 s, 1.10 H, 4/4 drawings; feet
  clear under the egg at dir 1). `game.islands` 1 → 3 = the swing foot drawn detached → visible shank 0.62 → **0.40** of
  the knee–ankle segment: walk/game islands PASS 1, no stilt look (`t1/S4/clip-game.png` vs `t1/A/clip-game.png`).
  This is the one intentional change to living renders (legs only).
- Weak spots: point key_speckle +10 (primary tip), wing hidden at E/SW; ghost's ground shadow is still the full figure
  (the dither discards in the shadow pass too, but the shadow map texel is coarse); walk limp 3.3 px (head_bob WARN, unchanged).
