# Opal (cast `opal`) — design sheet

"The Optimizing Otter. Dead code fears her." (mascot, 15-411). Spec: `characters/opal.js`. Pack: `shots/char-opal/`
(+ `dir2/` = the game clip at E), round-2 evidence `shots/char-opal/r2/` (pose tests `pv-*-x4.png`, 8-facing key stills
`g8-*-x3.png`, face crops `face-x8.png` / `talk*-x8.png` / `E-head-x6.png`, 1x GIF frame sheets `gs-*.png`, line-up
`lineup-25.png`), round-1 evidence `shots/char-opal/self/`, `g8-*`, `p-*`; bake `shots/char-opal/bake/`. Identity source
(read only): `pipgws/packages/assets/scripts/cast/opal.ts`, `refs/cast/opal.png`. Render host: render-host (RTX 4090,
every shot log). Round 1 2026-10-16 (critic 16/24); **round 2 2026-10-16** (this sheet).

## 0. Brief
- Concept: a sleek, cheerful brown otter in a teal vest who carries her smooth round pebble everywhere, hugged to her
  belly with both paws; the optimiser who taps the pebble twice and dead code puffs away. Adjectives: **cheerful,
  smug, efficient** → personality body f 3.5 ζ 0.5 r 0, head f 3.5 ζ 0.6 r 0 (CAST_PORTING §10 "cheerful, eager" row,
  with crisp held punchlines for "smug").
- Body plan: **upright chibi** (`chibi({ height 1.16, heads 2.3, legs 0.72, arms 1.15, snout 0.15, ears false, tail
  false })` + my own `tail0/tail1/pebble/mouth/earL/earR` bones), `bodyPlan 'uprightAnimal'`, `locomotion.plan 'biped'`
  (LegGait, `plant 'hold'`). Not a quadruped: v2 draws her upright and clothed.
- Game-speed arithmetic: v2 29 px → **H 1.16 m**. v_game = 3.95·H = **4.58 m/s**; run 2·v = 9.16 m/s. Leg (hip 0.366 →
  ankle 0.062) = 0.30 m = 0.26 H → duty bound 2·0.6·0.26/1.14 ≈ 0.27 → duty [0.18, 0.1] (skip/lope with a flight
  phase), reach 0.6, N 4 drawings × 2 grid frames, cycleTime [0.3, 0.267] → measured 0.289 s / 1.14 H per cycle.
- Identity (ref facings): (1) blob = a BROAD flat head (wider than tall) with tiny ear nubs on the crown corners + a long
  tapering tail low along the ground (breaks the S outline on her left, like the v1 S tile); (2) palette warm brown fur +
  teal vest + cream face/belly + DARK legs (v1); (3) the round blue-grey pebble held to the belly, carried by the RIGHT
  paw bone; (4) face: dark 2×2 eyes with a 1-texel glint sitting at the whisker-pad root, a wide cream whisker pad, a
  2×1 dark nose and a 2×1 mouth line under it; (5) v2 motion: the tail swishes with the steps.

## Unique to me (re-checked after the round-2 fixes)
1. **Extra animated parts.**
   - **Tail** (`tail0` on the hips + `tail1`, KEYED bones, axis 'back': `out` = swing, `fwd` = droop; no springs → no
     in-hold re-settles). r2: tip tapered to 0.016 m (≤ 1 texel), legs moved to the dark slot so the fur tail separates
     from them in value (N/NW: tail ≠ third leg). STAND tail `TAIL(0,0)` = tail0 out −22 / tail1 −40: out behind her
     LEFT, low, ≈ 4 texels past the S outline (sig.tail px S 22 / SE 13 / E 84 / NE 127 / N 128 / NW 114 / W 113 / SW 91;
     r1 was S 8). Walk/run key it per drawing (tail0 out −95 → −70 → −45 → −70, 50° per contact pair) — unchanged, it
     still carries the 1x rhythm (`clip-game.png`, `dir2/clip-game.png`). Keyed in idle (swish + flick), talk (±16°
     flick per beat), vote (up), die (laid out past her feet, droop +60: visible at N/NE now), optimize (curled UP on the
     punchline, tail0 fwd −35 / tail1 fwd −40).
   - **Pebble** (`pebble` bone on the right paw, slot `pebble` = the accent, r2: hi #C4CCDC, no lift → blue-grey stone,
     not a snowball): hugged in every carry pose, thrust out in talk's second beat, raised overhead in vote, TAPPED twice
     by the left paw and then held up by her cheek in the emote, resting on her belly in die.
   - **Ears** (r2: own bones `earL/earR` on the crown corners, fur slot, `material.merge` into the head): PERK keys
     (fwd −40 → round upright nubs) on the idle head-tilt, the vote raise, the second tap and the emote punchline.
   - **Mouth** (r2: bone `mouth`, a drawn-on dark 'eye'-slot plate on the pad, flat 'mid' sides): a 2×1 closed line;
     `OPEN` = `mouth.s` y +1.9 + jaw 22° → a 2–3 texel dark open mouth at S/SE/SW (`r2/talk0-x8.png`).
   - FX: one chained speech bubble for the whole talk loop (speak beats at f2/8/12/18), vote sparkle at `pebbleTop`,
     two `hit@pebbleTop` sparks ON the pebble (r2: `fx.sockets.pebbleTop.length 0`; r1 sparks sat 0.51 m in front =
     13 texels off) + a dust `poof@pebbleTop` on the second tap (= the dead code puffing away), `emote:star@crown` on
     the punchline, die dust ring + wisp, step dust every 2nd footfall.
2. **My locomotion: a bouncy otter lope/skip** (LegGait 'biped', 4 drawings per 0.289 s, bob 0.05 m, head_bob 3.4 px
   dir 1 / 3.2 px dir 2, lift 0.07, lean 6°; arms 0/0 so the pebble paws ride the body; authored `clips.walk` keys tail,
   head counter-bob ±4°, chest and a ±6° paw bounce). Slide-free by construction of 'hold' drawings (foot_slide n/a, see
   §Game speed); 4/4 drawings per cycle. Dark legs now read against the tail at dir 2.
3. **Expressions.** Eyes: dark boxes 0.085 × 0.1 m (2×2–3 texels) on the 16-gon head at [±0.18, 0.28, 0.211]
   (r2: forward + outward + up, above the pad, turned 28° to the surface normal, sunk 0.017 m so the inner corner stays
   flush) — at E/W the near eye now sits AT the whisker-pad root with its glint (`r2/E-head-x6.png`; r1 had it hidden by
   the pad and the low dark ear read as a mid-skull cyclops eye). Blink/half-lid = `eye*.s` y −0.8 / −0.45; WIDE =
   +0.12/+0.15. Nose 0.065 × 0.04 m (2×1). Mouth: see above; talk = OPEN on f0/f12 with twist 0 (r1 twisted the face
   away) + ±5° side roll + body bob + alternating paw/pebble gesture. Vote = eyes wide + ears perk. Die = eyes shut. Emote
   = wide eyes on the second tap, half-lid smug on the punchline, closed-eye smug nod.
4. **Game-speed readability.** Walk: bob + 50° tail swish per contact pair, judged on `clip-game.png`, `dir2/clip-game.png`,
   `game-onion.png`, `r2/gs-game.png` (1x real-time frame sheet) and `gamespeed.gif/png` next to the v2 sprite. Talk beat
   every 6 frames, one steady bubble (`r2/gs-talk.png`); vote raised at f3 (0.1 s) and held; die down at f20 (0.67 s);
   emote holds 6/4/4/6/14/8 (`r2/gs-optimize.png`: paw up f1/f4, tap+spark f2/f5, star from f8).

## Proportions (vh 10, 36 px/m) — measured height_px S 41, min 39, max 48
| part | m | texels |
|---|---|---|
| H (head top) | 1.16 | 42 |
| head (chin 0.656 → 1.16), width × depth | 0.50 / 0.66 × 0.51 | 18 / 24 × 18 |
| whisker pad (0.07 m proud), nose, mouth | 0.30 × 0.17 / 0.065 × 0.04 / 0.075 × 0.026 | 11 × 6 / 2 × 1 / 2 × 1 |
| ears (crown corners) | 0.085 | 2–3 |
| vest (waist 0.40 → shoulder 0.63), r 0.215 → 0.165 | 0.23 | 8 |
| legs (hip 0.366 → ankle 0.062), dark | 0.30 | 11 |
| tail (two hulls, r 0.115 → 0.016) | ≈ 0.62 long | 22 |
| pebble | 0.23 × 0.15 × 0.17 | 8 × 5 |

## Palette (5 slots + accent)
fur `#C08E62 / #93603A / #6A4434` (r2: warm brown sh, was plum #5E3C42) · cream `#FFF2D6 / #EED8B0 / #B49A98` · vest
`#5AB6C6 / #268690 / #203F52` (r2: bluer + darker sh — golden-sun part #579186 dH 81, noon-shade dL −36 %) · dark
`#80583E / #563222 / #3E2C36` (ears' old slot; now legs, feet, paws, nose) · eye `#5C4A64 / #2E2436 / #3A3040` (eyes +
mouth) · accent pebble `#C4CCDC / #A2AEC4 / #646C90` (r2: hi pulled down, no lift). `signature: ['vest', {part: 'tail'}]`,
`faceSlot 'cream'`, `material.slots` cream lift 0.3, `whiteKeep 0.6`, `merge { earL, earR → head }`.

## Motion list (30 Hz grid; f = clip frame)
| clip | keys (hold) | what must read at 1× |
|---|---|---|
| idle (loop 72, step) | f0 stand (30) · f30 inhale (6) · f36 full breath (14) · f50 BLINK (2) · f52 (8) · f60 head tilt + tail flick + ears PERK (6) · f66 (6) | alive; blink; tail flick |
| walk (loop 4 drawings) | k0 L contact tail −95 · k1 −70 · k2 R contact −45 · k3 −70 (2–3 grid frames each) | lope + tail swish |
| run (loop 4) | same with tail −100…−44, chest 8°, head −8° | longer flight (LegGait run, duty 0.1) |
| talk (loop 24) | f0 OPEN mouth + left paw out-low (6) · f6 bob down, half-lid, closed (6) · f12 OPEN + pebble thrust out right (6) · f18 bob (6); speak f2/8/12/18 | a paw/pebble gesture + an open mouth every 6 frames |
| vote (one-shot, held) | f0 dip (3) · f3 pebble overhead, arm stretched, wide eyes, ears perk, tail up → held (length 31) | pebble above the crown 8/8 |
| die (one-shot, held, legs fk) | f0 sway (8) · f8 knees fold (6) · f14 tips back + starts the roll (6) · f20 DEAD: hips fwd −70 / roll −80 (r2, was −28) so the body axis lies ACROSS the screen at S/SW, tail laid out past the feet → held (length 61) | "down" at S/SE/SW/NW/NE; tail visible at N |
| optimize (emote) | f0 eyes on the pebble, LEFT paw cocked up beside the cheek ≥ 4 texels above it (6) · f6 TAP: paw on the pebble, body dips 0.05, head nods, spark (4) · f10 paw up (4) · f14 TAP 2, wide eyes, ears perk, spark + poof (6) · f20 PUNCHLINE: pebble held by her right cheek, smug half-lid, head tilt toward it, tail curled up, ears perk, star (14) · f34 smug closed-eye nod (8) · f42 stand | two visible taps, then the smug pebble-by-the-cheek |
| turn | stop-motion 45° steps (charpack pseudo clip) | |

## Game speed (Stage 6; `shots/char-opal/report.txt`, `dir2/`)
- `game.readable` PASS: 3.95 H/s, cycle **0.289 s / 1.14 H**, 4/4 drawings every cycle, holds 2,3,2,2,2,2…
  (v2: 0.31 s / 1.2 H). head_bob 3.4 px (dir 1), 3.2 px (dir 2).
- `game.foot_slide` n/a at dirs 1 and 2 (skip gait: LegGait 'hold' drawings ride the root inside a hold = the baked
  sprite). `game.off_grid` 1, `game.flicker` 63 (upper 0, legs only) WARN — module (LegGait 'hold').
- 1× real time (`r2/gs-game.png`, `gamespeed.gif/png` 30 Hz vs the v2 sprite): one-word read **lope** — 2-texel bob,
  dark legs scissoring under the vest, the tail streaming and swishing behind; at dir 2 the face now has its eye at
  the pad root in every frame (`dir2/clip-game.png`).
- Run (2·v): 4/4 drawings, flicker 74 (upper 0), foot_slide n/a.

## Self-critique (Stage 7, round 2)
| # | criterion | score | evidence (file · facing/frame · number) | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | sig.tail px [22, 13, 84, 127, 128, 114, 113, 91] (S was 8); `r2/lineup-25.png`: the S blob now has the tail spur on her left; N/NW tail is a tapered fur stroke vs dark legs (`turnaround.png`) | SE tail only 13 px (trade-off with S) |
| 2 | Pixel stability | 1 | idle/talk/vote/optimize off_grid 0 / flicker 0, pan 0, deterministic; walk/game flicker 63–65, run 74 (upper 0, legs only); turn.foot_slide 3.56 | module LegGait 'hold' |
| 3 | Line quality | 2 | silhouette_line 0, 1x crops clean; `material.merge` ears | — |
| 4 | Tonal discipline | 1 | colors/slot WARN (dark 12: legs joined it; pebble 10 without lift; cream 9), speckle 34; but no plum stick arms, pebble reads blue-grey stone (`r2/ta-S-x6.png`) | per-slot tone trims (pebble 'mid' sides already) |
| 5 | Ground separation | 2 | sig_ground all 4 PASS (noon-sun dH 88 dL −38 %, noon-shade dL −36 %, golden-sun dH 81, golden-shade dL −43 %); `scene-*-crop.png` read in sun / pillar shade / night | — |
| 6 | Proportion, appeal, expression | 2 | face_visible 79 % (r1 72), face_lit 90 %; E/W eye at the pad root with glint (`r2/E-head-x6.png`, `dir2/clip-game.png`); S nose 2×1 + mouth 2×1 (`r2/ta-S-x6.png`); talk OPEN 2–3 texels at S/SE/SW (`r2/talk0-x8.png`) | the ear nub's 2×1 shade dash on the E/W skull top |
| 7 | Animation timing | 2 | optimize f6/f14 differ from f0 (paw up ↔ on the pebble, dip), key_delta 46 %, pose_read 17 % x4; punchline ≠ talk f12 (`r2/g8-optimize-f20-x3.png` vs `r2/g8-talk-f12-x3.png`); die reads down at S/SE/SW (`r2/g8-die-f40-x3.png`) | die at W still head-over-body |
| 8 | Weight, contact, game speed | 1 | game.readable 0.289 s / 1.14 H, 4/4 drawings, head_bob 3.4/3.2 px; foot_slide n/a | module: measurable planted foot for chibis |
| 9 | Personality, secondary | 2 | tail in every clip, ears perk in 4 clips, taps + poof + smug pebble-by-the-cheek punchline (`r2/gs-optimize.png`) | — |
| 10 | Smears and FX | 2 | tap sparks ON the pebble (`clip-optimize.png` f14/f22), poof on tap 2, one steady talk bubble from f2 (`r2/gs-talk.png`, a 1-drawing pop-in only on the very first beat) | — |
| 11 | Facing and turns | 2 | turnaround 8/8, turn off_grid 0 / flicker 0 | — |
| 12 | Technical | 2 | page_errors 0, deterministic, 0 FAIL (85 pass / 18 warn), RTX 4090; bake 7 clips × 8 dirs, cell 58×74 | — |
| | **total** | **21** | | |

Three weakest points: (1) leg-only flicker / unmeasurable contact from the shared LegGait 'hold' drawings; (2) the die
rest at E/W still reads as a ball / head-over-body (a body lying across the screen at S cannot also lie across at E);
(3) tone counts (dark 12, pebble 10) after moving the legs to the dark slot and dropping the pebble lift.
