# Theo Rem (cast `theo-rem`) — design sheet

"A hedgehog. Q.E.D." (mascot, 21-127 Concepts of Mathematics). Spec: `characters/theo-rem.js`. Pack:
`shots/char-theo-rem/`. Identity source (read only): `pipgws/packages/assets/scripts/cast/theo-rem.ts`,
`refs/cast/theo-rem.png`. Render host: render-host (RTX 4090).

(Stage 0 written before modelling; rewritten from the final code at the end of the run — see the sections below the
line "FINAL".)

## 0. Brief (Stage 0, before modelling)
- Concept: a small, round, earnest hedgehog-mathematician — a brown spiky ball with a cream face and belly, a black
  button nose on a little snout and tiny round brass spectacles; he finishes every argument with "Q.E.D.".
  Adjectives: **earnest, precise, proud** → personality "cheerful, eager" row for the body (f 3.5, ζ 0.5) with crisp
  held punchlines (proud row: chin up ≤ 5°).
- Body plan: **upright chibi** (`chibi()`; v2 draws him upright, never on four legs) — `bodyPlan 'uprightAnimal'`,
  `locomotion.plan 'biped'`, `plant 'hold'`. The body is mostly ONE spine ball (v1: a spiky ellipse from 0.16 H to
  0.84 H behind the cream face/belly), so the spines are their own keyed bone `spines` (scale-keyed: bristle / squash).
- Game-speed arithmetic: v2 28 px → **H 1.12 m** (40 texels at vh 10). v_game = 3.95·H = **4.42 m/s**, run 2·v.
  Leg (hip 0.327 → ankle 0.06) = 0.27 m = 0.24 H → duty bound 2·0.6·0.24/1.14 ≈ 0.25 → duty 0.18 (skip), N 4 drawings
  × 2 grid frames → cycle 0.27–0.3 s ≈ 1.1 H. Gait word: **scurry** (tiny legs flicking under a bouncing ball).
- Identity (ref facings): (1) blob = a round spiky ball with a jagged outline all round (every facing; at N/NE/NW the
  whole figure is the spine ball) + the snout/nose poking past the outline at E/W; (2) palette: spine browns
  `#7E604A / #5E3C2A` with cream `#E2C290` tips, cream face/belly `#E8CFA4`, skin paws/feet/ears `#A77A5A`, brass
  specs `#B0904C`; (3) no prop in v1 (the Q.E.D. card is a story prop shown only in vote); (4) face: 2×2 dark eyes with
  a glint inside tiny brass rings joined by a bridge, cream snout, black button nose; (5) v1 motion: 1-px bob, legs
  shuffle — pixel3d adds the ball bounce and spine bristle.

## Unique to me (planned before modelling; verified at the end)
1. **Extra animated parts.**
   - **Spine ball** (`spines` bone, child of `chest`, pivot at the ball centre; KEYED scale `spines.s`, no springs):
     squashes on the walk contact drawing and stretches in flight (the ball carries the gait rhythm), puffs up
     (bristle) when he votes and when he curls up to die, lies flat (−) in ghost-spent.
   - **Q.E.D. card** (`card` bone on the right paw; geometry baked at 1/1000 and shown only by `card.s` 999 in vote):
     a cream slate with a dark tombstone ∎ (the end-of-proof mark) on both faces, raised overhead in the vote.
   - **Index finger** (`finger` bone on the right paw, same TINY trick): shown in point and in the Q.E.D. emote.
   - **Mouth** (`mouth` bone, drawn-on plate under the snout, opened by `mouth.s` + a small jaw): talk.
   - FX: speech bubble (talk), vote sparkle at the card, step dust, die dust + wisp, `emote:star` on the Q.E.D.
2. **My locomotion: a scurry** — LegGait 'biped' skip (duty 0.18, 4 drawings, plant 'hold'), bob ≥ 2 texels; the
   authored walk keys squash/stretch the spine ball per drawing, roll the body ±6° onto the planted side (waddle of a
   round animal) and pump the tiny arms. Slide-free by the 'hold' sprite drawings (contact drawing = foot ahead, flight
   drawing = feet tucked under the ball).
3. **Expressions.** Eyes 2×2 texels (0.075 m dark boxes on the face surface) with a 1-texel glint, inside brass rings
   (outer Ø 0.15 m ≈ 5 texels, ring 0.03 m) + bridge; blink / half-lid / wide via `eye*.s`; mouth plate opens 2–3 texels
   in talk; vote = wide eyes + spines bristle; die = eyes shut, curled; emote = smug shut eyes + chin up + finger up.
4. **Game-speed readability.** Walk: the ball bob + squash/stretch, judged on `game-1x.gif`, `clip-game.png`,
   `game-onion.png`, the pose-id log; talk beat every 6 frames; vote up at f3; die down by f18 (0.6 s); emote holds
   ≥ 6 frames.

---
# FINAL r2 (rewritten from the code + renders after critic r1 17/24, 2026-10-16, RTX 4090 render-host)

Evidence: final pack `shots/char-theo-rem/` (`report.txt`: 115 pass / 20 warn / 0 fail), iteration folders `r5/`–`r20/`
(turnaround ×3 crops `zA.png` S..NE / `zB.png` N..SW), point pose search `pA/`–`pJ/`, self-critique stills `self/`
(`g8-*.png`, `pk-*.png` ×4 facing picks, `zface.png`, `zpoint.png`, `lineup25.png`, `sil-lineup.png`,
`game1x-track.png`), bake `shots/char-theo-rem/bake/` (10 clips × 8 dirs, trimmed cell 62×77, anchor [31, 51]; the lead
copies it into `out/sprites/`).

## What changed in r2 (critic r1 issues, owner character)
| issue | fix | verified in |
|---|---|---|
| spine outline a fuzzy halo of 1-px dots, hooped barrel / sleeping face at N | `spikeBall()` rebuilt: smooth flat-faceted ellipsoid shell (9 lat rings × 16 meridians, cream belly/bib cells cut out of it) + **23 long quills** (pyramids, base half-width 0.085, length 0.2–0.26 m, lean back 0.45 + up 0.2, sunk 0.05); rows staggered; the right half's quills offset (lat −11°, az +9°) so no mirror pair of dark undersides draws eyes at N; no quill dead-centre on the back rows that faced the N camera; cream tips only on quills with \|az\| < 105° or the crown | `r5`→`r17` `zA/zB.png`; final `turnaround.png`: 2–3 px triangular teeth all round at 8/8; isolated_px spine 39 → 14 max, speckle 69 → 40 |
| point invisible at W / SW | point uses BOTH paws: left flung forward-out (`upperArmL [60,0,70]`, `.l` 1.3/1.3), right thrust forward (`upperArmR [85,0,30]`, `.l` 1.3/1.3), an index finger on each paw | `self/zpoint.png` ×6: arm outside the body ≈ 8 texels S, ≈ 6 SE, ≈ 8 W, ≈ 15 SW; `self/pk-act.png` 8/8 facings |
| E profile hides the nose; SE eye a "+" crosshair | snout tip to z 0.39, nose 0.065×0.055×0.05 at [0, 0.088, 0.405]; rims r 0.05 / t 0.024 set back (0.004); eye = 1×2-texel pupil box 0.036×0.07, glint removed | `r9/zA.png` E: 2×2 nose past the outline; W 2 px; `self/zface.png` SE talk/vote: dot pupil in the ring, no "+" |
| Q.E.D. emote does not land | new qed: f0 wind-up (card behind him, crouch, half lids) · f6 SLAP: card out to his right at chest/shoulder height, ∎ facing front and twisted 40° toward the SE camera (`card [0, 40, −60]`), eyes shut, chin up · f12 hop +0.13 · f16 land (dust) · f20 hold (star) · f46 relax. Vote keeps the card OVERHEAD with wide eyes | `clip-qed.png`, `self/pk-act.png` (qed f20: card at S/SE/SW/W/NW, edge/back at NE/N); qed.pose_read 32 % ×8, key_delta 66 %; card square-on with ∎ at SE in `clip-qed.png` f14–f28 (`r21a/z2.png`: twist 0 / +40 / −40) |
| die final looks seated at SE | keys keep falling: f12 hips out −50 / pos −0.16 → f18 −88 / −0.20 → **f24 final** −100 fwd 34, pos −0.24, `ball.s` [0.14, −0.12, 0.14] | `clip-die.png` (f32 final is the lowest, most tipped drawing at SE); `self/pk-dg.png` 8/8; die.final_hold 2.0 s 145 % off idle |
| cream face apricot at golden | cream `#F6E4D6 / #E4C8AA / #AC8868` (cooler, less saturated hi), whiteKeep/whiteKeepLift 0.5 | `scene-golden-crop.png` + `r11s/zg.png` (new vs critic): pale cream face at golden, no orange |
| dashed belt across the belly in the walk | rest arms out (ARM up [22, 24], fore [26, 64]); walk/run keys add `WALK_ARMS` (upper arms out 22°); gait arms [18, 26] | `r19/zbelt.png` vs `r18/zbelt.png`: the grey diagonal is gone from 3 of 4 drawings; a 1–2 px grey mark remains in one contact drawing |
| (crit. 6) talk mouth absent at SE | OPEN `mouth.s` [0.7, 1.0], `mouth.p` [0, −0.045, 0.05] | `r20/zface.png`: 3×2 dark mouth at S, visible under the nose at SE |

## Build (as coded)
- `chibi({ height 1.12, heads 2.2, legs 0.6, arms 0.8, snout 0.25, ears/tail false })` + bones `ball` (chest child at the
  ball centre [0, 0.58, −0.07]), `mouth`, `card` (handR), `finger` (handL), `fingerR` (handR). `bodyPlan 'uprightAnimal'`,
  `heightPx [36, 48]` (measured S 42, 36–42 with the quills).
- Spine ball: ellipsoid r [0.30, 0.38, 0.28]; quills listed in `QUILLS` (crown 4 × 0.2 m, lat 54 × 5 × 0.25, lat 18 × 6 ×
  0.26, lat −14 × 4 × 0.25, lat −44 × 4 × 0.2).
- Palette: spine `#94704E/#6A4A36/#45302A` · cream `#F6E4D6/#E4C8AA/#AC8868` · skin `#C4946A/#A07250/#6E4C3A` · eye
  `#4A3E48/#2C2228/#3A3040` · accent brass `#F0D07E/#B8914A/#7A603E`. `signature ['spine', {part 'rimL'}]`,
  `faceSlot 'cream'`, `whiteKeep 0.5`, `whiteKeepLift 0.5`, `merge { jaw: 'head' }`, `ghost { hover 0.14 }`. No
  `spec.lights` (he carries no light).
- Locomotion: `plan 'biped', plant 'hold'`, walk 4.42 m/s / run 8.85, cycleTime [0.3, 0.267], poses [4, 4], duty
  [0.18, 0.1], reach 0.6, arms [18, 26], elbows [8, 14], bob [0.05, 0.1], lean [6, 12], lift [0.06, 0.09].

## Unique to me (verified r2)
1. **Extra parts.** Spine ball keyed by `ball.s` (walk contact [+0.06, −0.06, +0.06] / flight [−0.03, +0.06, −0.03], roll ±7°;
   vote bristle +0.06; die squash to [0.14, −0.12, 0.14]; qed hop stretch / land squash). The quills are rigid with the ball
   (they do not move individually — no chains). Q.E.D. card: vote overhead (prop_area.card PASS) AND the qed slap. Fingers
   on both paws (point). FX: speech bubble, vote sparkle at the card, step dust, die dust + wisp, qed land dust + star.
2. **Locomotion: scurry.** game.readable PASS 3.95 H/s, 0.278 s / 1.1 H per cycle, 4/4 drawings, holds 2–3; head_bob
   3.6 px; feet_visible PASS (SE min 6 px); foot_slide n/a (skip gait). `self/game1x-track.png` (tracked 1× game GIF
   frames 16–31): the ball bounces, quills raked back read as speed; one foot shows in every drawing at SE.
3. **Expressions.** 1×2 pupils in brass rings; blink / half / wide via `eye*.s`; talk mouth 3×2 at S, visible at SE;
   vote wide eyes; die shut; qed shut eyes + chin up.
4. **Game-speed readability.** 1× GIFs: walk (above); talk beat every 6 frames; vote up at f3 (0.1 s); point up at f4 and
   held 24 frames; qed card out at f6 (0.2 s); die down by f24 (0.8 s), final hold 2.0 s.

## Self-critique r2 (Stage 7)
| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | `turnaround-silhouette.png` + `self/lineup25.png`: jagged quill disc 8/8, wider and spikier than preservation / opal / green-hood / frog at 25 %; nose past the outline at E and W (`r9/zA/zB.png`). rimL sig_outside still 0–3 px (spectacles sit on the face, inside the outline) | — |
| 2 | Pixel stability | 2 | off_grid 0 / flicker 0 in every clip except run (1 / 2, legs only); pan 0 px; micro 1–2 px WARN in idle/die/talk/turn | — |
| 3 | Line quality | 1 | quill undersides still draw 1–2 short dark strokes on the back at N/NW (`r17/zB.png`); grey inner-line specks at some quill tips; one 1–2 px grey mark left on the belly in one walk contact | fewer back quills or shade-matched undersides |
| 4 | Tonal discipline | 1 | isolated_px spine [6, 12, 14, 10, 6, 9, 12, 11] (want ≤ 2), speckle 40; colors/slot cream 6, eye 11 | merge the eye/rim tones |
| 5 | Ground separation | 2 | sig_ground 4/4 PASS (noon-sun dL −39 %, golden-sun dH 41, shades −43 %); golden face pale cream (`scene-golden-crop.png`) | — |
| 6 | Proportion, appeal, expression | 2 | `self/zface.png`: S/SE/SW faces read, SE pupil a dot (no "+"), talk mouth at S and SE; E/W nose past the outline | — |
| 7 | Animation timing | 2 | no x1 holds, strobe 1 everywhere, hold_redraws 0; point 8/8 facings (`self/pk-act.png`); die ends at its flattest drawing (`clip-die.png`) | — |
| 8 | Weight, contact, game speed | 1 | game.readable PASS, head_bob 3.6 px, feet_visible PASS; foot_slide not measurable (skip gait) — judged on `self/game1x-track.png` only | a measurable planted contact |
| 9 | Personality, secondary | 1 | ball squash/stretch, bristle, the qed card slap + hop; quills never move individually | quill bristle keys |
| 10 | Smears and FX | 2 | speech, vote sparkle, qed land dust + star (`clip-qed.png` f28) | — |
| 11 | Facing and turns | 2 | 8/8 facings read; turn off_grid 0 / flicker 0; turn.foot_slide 3.46 WARN | — |
| 12 | Technical | 2 | page_errors 0, 0 FAIL, draw calls 2/1, RTX 4090, bake OK (re-baked at cell 154, no border touch) | — |
| | **total** | **20** | | |

Three weakest points: (1) back-of-ball line quality: quill undersides still make a few dark strokes at N/NW and grey
inner-line specks at quill tips (isolated_px 6–14); (2) contact is judged only on the 1× GIF frames (skip gait, no
measurable foot plant); (3) the qed card is held by the far (right) paw at SE; twisted 40° it reads there, but at S it tilts like a diamond, not
square-on at the other front facings; qed.key_speckle +15 WARN.
