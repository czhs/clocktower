# Old Delve (cast `mole`) — design sheet (r2, after critic 16/24; t1 touch-up: point, ghost, ghost-spent, gentler ring)

Spec: `characters/mole.js`. Identity source (read only): `pipgws/packages/assets/scripts/cast/mole.ts`, `refs/cast/mole.png`.
Pack: `shots/char-mole/` (`--preset cast --raw`, **70 pass / 13 warn / 0 fail**, RTX 4090 on render-host); extra dir 0 game
pack `shots/char-mole/r2/pd0/` (game/walk off_grid 0, flicker 0). Bake: `shots/char-mole/bake/` (7 clips × 8 dirs, cell
62×71; not copied into `out/sprites/`: outside this agent's ownership). r2 working renders: `shots/char-mole/r2/`.

## 0. Brief
- Concept: the town blacksmith, a stout grey-mauve mole in a slate shirt and leather apron, brass goggles pushed up
  on his head, smithing hammer upright in the RIGHT claw. "Works by feel; trusts nobody he can see."
- Adjectives: **gruff, heavy, suspicious** → heavy personality (body/head f 2, ζ 1, r 0), long holds, a stomping gait,
  eyes squinted shut in every "thinking" key (he doesn't look, he listens).
- Body plan: upright CHIBI (`chibi()`, `bodyPlan: 'uprightAnimal'`), H 1.08 m (v2 27 px, `castHeight(27)`), 2.4 heads,
  leg 0.28 m = 0.26 H, visible below a short apron. Driven by the LEGACY biped Gait (CAST_PORTING §8 chibi recipe,
  `legIK: 'pose'`) because it plays the authored walk/run upper body (the hammer swing, stomp, roll, apron kick);
  LegGait ignores those (module M1) and its reach drop seats legs ≤ 0.35 m (M2).
- Identity (Stage 0 five): (1) blob = big round head + hammer T beside the shoulder (r2: 7/8 facings) and the nose bump (E/W);
  (2) palette anchors fur mauve-grey + pink nose/claws + brass goggles/strap; (3) hammer in the RIGHT claw, upright;
  (4) face: small 2×2 squint eyes under big brass goggles, big pink nose on a short muzzle, no visible mouth until he talks; (5) v2 motion: 1-px
  bob, hammer rides the arm → kept as a heavy stomp with the hammer swinging against the legs.

## Unique to me (r2 — each claim tied to a 1x render)
1. **Extra animated parts** (all KEYED, no spring chains):
   - hammer (bone `hammer` under `handR`): r2 CARRY raises the hand and holds it 70° out, the hammer leaning 27° out and
     8° back with its head turned 20° on the handle (`hammer: [0,-20,0]`), wrist solved (`mole_solve.js`). Silhouette
     T beside the shoulder at S, SE, NE, N, NW, W, SW (`shots/char-mole/turnaround-silhouette.png`, `r2/g8-j2-x4.png`);
     at E it sits in front of the chest (iron on slate, colour only). Rides the arm swing ±22° in the walk (wrist held:
     the old counter-keyed wrist put the head flat on the chest), overhead in the vote (`hammer.p` +0.12, `r2/g8-kvote20-x4.png`),
     tapped on the left claw in the emote.
   - apron skirt (bone `apron`, r2 shortened 0.16 → 0.12 so the trailing boot shows at S): kicks +12° / −5°. Barely
     visible at 1x — not claimed as a read.
   - goggles (bone `goggles`): r2 lens rings r 0.064 → 0.084, tilt 55° → 40°, glass r 0.034 (≈ 1.5-texel brass wall);
     read at all 8 facings (sig.goggles lit 7–8/8, was 5/8). The ±8° walk jolt was invisible and is dropped. Slide-down
     48–50° in the die: the lenses drop onto the face (`r2/c-die.png`, legible at S only).
   - jaw (chin on `jaw`, limit raised to 55°): opens 50–52° on alternating talk keys → a 2–3 texel dark mouth at S and a
     1-texel mouth line at SE (`r2/c-talkc.png`).
   - FX: speech bubble (talk f0), sparkles at the hammer top (vote f4), spark AT THE LEFT CLAW (r2 socket `clawL`, emote
     f8, `r2/f-ring-g3.png` row 2) + note glyph (f22), `land` dust (die f26).
2. **My locomotion — heavy STOMP-SCURRY, contact held 3 frames.** Legacy Gait (`legIK 'pose'`; 'plant' was tried:
   walk off_grid 23 / flicker 870, legs re-solve every frame → rejected). r2 numbers (code): V = 3.95·H, step 0.66 H,
   duty [0.18, 0.1], spacing 0.27 (feet 3+ texels apart at S), lift 0.03, walk keys at f0/3/5/8 of 10 (contact 3 grid
   frames, flight 2): measured `game.readable` 3.95 H/s, cycle 0.317 s, 1.25 H/cycle, 4/4 drawings, holds 3,2,3,2
   (v2: 0.31 s, 1.2 H). Contact drawings: body −0.045 m, two boots planted wide (`r2/g0z-g9.png`, S); flight +0.035 m
   with the leading boot and the trailing boot both visible (was one boot centred = pogo). foot_slide stays n/a (legacy
   Gait, duty 0.18: no foot drawn planted on two drawings; in-hold ride is inherent, module M1/M3).
3. **Expressions.** Eyes 0.066 × 0.06 m (2×2 texels, own `eye` slot), 0.12 m apart; the head is kept turned 12° to his
   left (`HEAD_TW`, a distrustful sideways glance) so at the game facing (SE) the face opens toward the camera (both
   lenses, eye and nose; `r2/c-iF.png`). SHUT = eyes 2 → 1 texel + brow bars dropped under the goggle rim; WIDE = 3
   texels. LISTEN (idle f50, ring f16): head cocked 30° (+ eyes squeezed) with the left claw cupped at the raised ear
   (`r2/c-listen.png`: at S the claw beside the head reads; at SE claw and nose sit close). Talk turns the head −14…−24°
   toward the camera so the mouth shows at SE too.
4. **Game-speed readability (1x, root-following 30 Hz strips — the Read tool shows only a GIF's first frame).** Walk
   dir 1: `r2/f-game-g4.png`, dir 0: `r2/g0z-g9.png` — stomp-scurry with the hammer swinging out behind, 3-frame wide
   contact. Ring: `r2/f-ring-g3.png` (cock → tap at the claw with spark → hammer at the ear). Die: `r2/f-die-g3.png`.

## Proportions (vh 10, 36 px/m)
| part | m | texels |
|---|---|---|
| height (crown) | 1.08 | 35–43 measured (hammer top at NW/W), S 36 |
| head (chin → crown) | 0.455, Ø 0.52 | 16 tall, 19 wide; head_frac 0.40 |
| torso barrel | 0.42 × 0.34 | 15 wide |
| leg (hip → ground) | 0.33 (leg bones 0.28) | 12 |
| hammer | handle 0.46 × 0.065, head 0.13 × 0.13 × 0.27 (r2) | head 5×5–9 |
| nose | 0.19 × 0.14 | 7×5 |

## Palette (5 slots + brass accent + iron prop accent)
| slot | hi / mid / sh | use |
|---|---|---|
| fur | #8A7C86 / #625668 / #544A62 | head, muzzle, chin, brow bars (r2 sh lifted for shade/night) |
| shirt | #7084AC / #4C6090 / #3C3E68 | shirt, sleeves |
| leather | #B47C46 / #86582F / #5C3C38 | apron, straps, hammer handle |
| dark | #5E4A48 / #41333C / #32282F | trousers, boots, pelvis |
| eye (r2) | #4E3E52 / #2E2434 / #2E2434 | eyes, mouth cavity |
| pink (signature) | #FAC0C0 / #E8909C / #B06A7C | nose, claws |
| brass (signature 2) | #F6D474 / #D0A446 / #A47A48 (r2 sh lifted) | goggles, strap band (a band of the head profile) |
| iron (prop) | #D0D8E4 / #9AA0B4 / #60627C | hammer head, goggle glass |

## Timing charts (30 Hz grid, `interp: 'step'`)
- **idle** (loop 72): f0 breath 0 · f30 breath 1 (pos −0.028, chest 4) · f36 SHUT (2 f) · f38 · f50 LISTEN (head
  roll −30, claw cupped at the ear, eyes −0.6; 16 f) · f66 back. Hammer carry in every key.
- **walk / run** (loop 10, keys f0/3/5/8): contact (pos −0.045 / −0.03, spine 6, apron +12) 3 f · flight (pos +0.035 /
  +0.045, spine −2) 2 f · mirrored. Arms ±22 / ±28, wrist held. Run = 2·V (optional).
- **talk** (loop 24, `speak` at f0): f0 jaw 52, head twist −24, eyes/brows up, claw out low · f6 shut, bob −0.035 · f12
  jaw 50, claw out high · f18 shut. Beat every 6 frames, amplitude 35 %.
- **vote** (hold): f0 dip (pos −0.05, arm back) 4 f → f4 hammer overhead (upperArmR [25,0,150], wrist [34,0,156],
  `hammer.p` +0.12), eyes WIDE, `vote@hammerTop` → held (repeat at f30). Hammer top ≈ 0.30 m over the crown.
- **die** (hold, `legs: 'fk'`): f0 stagger (roll, head back, claw out, WIDE) 10 f → f10 knees buckle (feet kept under the
  hips) 8 f → f18 sits (root back 0.14 so the feet don't slide), goggles slip 48° over the eyes 8 f → f26 DEAD (on his back,
  head rolled toward the camera, legs bent up, hammer beside him) + `land` → held to f60.
- **ring** (emote; t1: see Touch-up below — f0 is now a gentle lift, the spark a sparkle): f0 cock the hammer over the shoulder, claw up, WIDE (8 f) → f8 TAP: left claw out to the side, hammer
  swung across onto it (head solved onto the claw, `mole_solve2.js`), SHUT, `hit@clawL` spark (8 f) → f16 LISTEN: hammer upright beside the head, head cocked 32°, LISTEN eyes, note glyph at
  f22 (16 f) → f32 nod, jaw 18 (6 f) → f38 idle.

## Lights
None (no lantern).

## Self-critique (Stage 7, r2)
Evidence: pack `shots/char-mole/` (report.txt), `turnaround-silhouette.png`, `scene-*-crop.png`; r2 stills
`shots/char-mole/r2/` (g8-*-x4 = 8 facings + silhouettes, c-* = x8–10 crops, f-*-g* = 1x 30 Hz root-following strips).

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | hammer T in the silhouette at 7/8 facings (all but E, where it is in front of the chest in colour); nose bump E/W | hammer at E (needs ≥ 0.3 m fore/aft offset the arm can't reach) |
| 2 | Pixel stability | 2 | off_grid 0 / flicker 0 in every clip incl. game at dir 1 and dir 0 (`r2/pd0`); pan 0; deterministic 0 px | — |
| 3 | Line quality | 1 | silhouette_line 0/1017, inner_lines 331; 12-segment head lathe (no facet steps, crown nub removed); speckle 52 WARN | speckle (pink/goggle iso px) |
| 4 | Tonal discipline | 1 | goggles hi/mid ≥ 50 % at 7/8 (was 5/8), pink 8/8; eyes/mouth in own slot; dark still 12 tones (outline tones land in the darkest slot) | charcheck slot counting (module) |
| 5 | Ground separation | 2 | all four sig_ground rows PASS (noon-shade dL +30 %, was +9 % WARN); night crop: goggles, nose, hammer read in the pillar shade | — |
| 6 | Proportion, appeal, expression | 2 | head turned 12° to the camera side: face (lenses, eye, nose) reads at SE; talk mouth 2–3 texels at S, visible at SE; LISTEN = 30° cock + claw at ear | eye blink still 2 → 1 texel |
| 7 | Animation timing | 2 | holds 3/2 in the walk, 4-frame vote rise, die 26 f + hold; single_frame 0, strobe 1, hold_redraws 0 | — |
| 8 | Weight, contact, game speed | 1 | 3.95 H/s, 0.317 s, 1.25 H/cycle; contact drawings wide 2-boot stance held 3 frames; flight shows both boots; foot_slide n/a (legacy Gait) | held plant (module M1/M3) |
| 9 | Personality, secondary, uniqueness | 2 | hammer carry/swing, sideways distrustful glance, listen with cupped claw, tap-and-listen emote at the claw; apron kick not claimed | — |
| 10 | Smears and FX | 1 | spark now on the claw at S and SE (`r2/f-ring-g3.png`); the note pop-in 3×3 dot (fx module) still shows 6 frames | fx pop-in (module) |
| 11 | Facing and turns | 2 | 8 facings read; turn.foot_slide 6.87 WARN from the stage turn drive | — |
| 12 | Technical | 2 | page_errors 0, draw calls color 2 / normal 1, RTX 4090 (render-host) | — |
| | **total** | **20** | | |

Remaining weak points: (1) E facing has no hammer in the silhouette; (2) stance is never planted for two drawings
(legacy Gait + legIK 'pose'); (3) speckle / dark-slot tone counts are WARNs.

## Touch-up t1 (2026-10-16, Clocktower-only clips; RTX 4090 on render-host)
Pack: `tools/charpack.sh mole --preset cast --clips idle,walk,run,talk,vote,die,point,ghost,ghost-spent,ring,turn --raw`
→ **114 pass / 14 warn / 0 fail** (`shots/char-mole/report.txt`). Bake: `shots/char-mole/bake/` (10 clips × 8 dirs,
trimmed cell 62×70, render cell 112). Working renders: `shots/char-mole/t1/` (g8-*-x4 = 8 facings + silhouettes,
f-*-1x/x3 = root-following 1× 30 Hz strips, `base/` = the pre-touch-up pack used for the A/B).
- **A/B (living clips unchanged):** idle, walk, run, talk, vote, die, game, turn, pan, face-solo, scene-noon/golden/night,
  night-pan raw frames **0 px differ** vs `t1/base` (`mole_ab.py.js`). Only `ring` changed (intended). The halo bone is
  appended LAST, the ghost shader branch is gated on its world scale (1 = alive).
- **Module fixes check:** mole runs the LEGACY biped Gait, so M1/M2/M3 (LegGait) do not apply; walk at game speed
  re-checked (`t1/base/clip-game.png`: wide 2-boot contact, boots clear of the apron, 3.95 H/s, holds 3/2).
- **De-combat (ring):** the wind-up no longer cocks the hammer high over the shoulder (read as a swing): f0 now holds the
  claw out and lifts the hammer a hand's breadth above it (the tap pose, arm +22°) → a small tap → listen. The impact
  spark (`hit@clawL`) became a soft sparkle "ting" (`sparkle@clawL`). Vote/die/talk had nothing combat-flavoured (die has
  no hurt flash). ring rows unchanged (pose_read 34 %, key_delta 69 %, key_speckle +9 WARN as before: +8).
- **New `point`** (shared emote, ≈ 3.5 s like pipgws EMOTE_POINT_MS): f0 draw-in (claw gathered at the chest, LISTEN
  squint, 5 f) → f5 LEFT claw thrust out ahead-and-left at shoulder height (upperArmL [100, 0, 60], forearm −20), eyes
  WIDE, jaw 10 (12 f) → f17 firmer jab, body dips, jaw 40 (12 f) → f29 held → f50 second small jab → f60 held → f84 claw
  back, suspicious squint aside (head −30) → f96 idle. Hammer keeps its carry. Picked from 3 variants (`t1/g8-p{A,B,C}`):
  chest twists swung the hammer across the body at SE; no twist + out 60 gives a screen-horizontal stroke at SE with the
  hammer T intact. Claw clear at S, SE, N, NW, W, SW; hidden behind the body at E (far side). Rows: pose_read 22 % ×12,
  key_delta 38 %, strobe 1, key_speckle +6, off_grid/flicker 0.
- **New `ghost` / `ghost-spent`** (goat/mushroom recipe, spec-only): `halo` bone (head-local [0, .22, −.03], inside the
  skull) carries a brass ring authored at HALO_K 0.001; `halo.s` = 999 grows it to head-local y 0.55 over the crown.
  GHOST_GLSL (material vertex/fragment/tones): luminance → pale-blue ramp `#3A4C80 → #DCF4FC` (pow 0.5; darker low end
  than goat so the 2×2 eyes stay) with **25 % of the living hue kept** (pink nose, brass goggles, leather apron still read
  at S/SE: `t1/ghost-face-x8.png`), lower body dissolves with a 2×2 ordered dither from bind y 0.44 → 0.10 (spent 0.40 →
  0.08), shins/boots scaled away (`shin*.s` −0.98), faint night self-glow (frog lesson; halo glows too:
  `t1/g8-ghostN-x4.png`). Hover 0.14 / 0.12 / 0.10 / 0.12 m, ±3° sway, 4 step keys 18 f apart (loop 72), eyes half, left
  claw on the chest, hammer at its carry. **Spent**: no halo, desaturated ×0.62 and grey, lower (0.08–0.05), head bowed
  8°, eyes nearly shut, half the night glow. A blink key was dropped (key_delta 0 %: invisible in the pale ramp).
  Rows: amplitude 36 % / 21 %, key_delta 60 % / 40 %, off_grid/flicker 0, strobe 1, islands 1.

| clip | timing (30 Hz) |
|---|---|
| point | 0 draw-in (5) · 5 point (12) · 17 jab (12) · 29 hold (21) · 50 jab (10) · 60 hold (24) · 84 squint aside (12) · 96 idle |
| ghost (loop 72) | 0 y .14 roll +3 · 18 y .12 · 36 y .10 roll −3 · 54 y .12; halo; pale shader + dither |
| ghost-spent (loop 72) | same keys at y .08/.065/.05, roll ±2, head bowed 8, eyes −0.6; no halo, dimmer |
| ring (t1) | 0 claw out + hammer lifted over it, WIDE (8) · 8 tap + `sparkle@clawL` (8) · 16 listen, note f22 (16) · 32 nod (6) · 38 idle |
