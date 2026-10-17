# Maxflow (cast `maxflow`) — design sheet

"A big soft fox. Pushes as much as will fit." (CMU 15-451 mascot.) Spec: `characters/maxflow.js`. Pack:
`shots/char-maxflow/` (final full `--preset cast --raw` pack), evidence `shots/char-maxflow/r1/`, `r2/`; bake
`shots/char-maxflow/bake/`. Identity source (read only): `pipgws/packages/assets/scripts/cast/maxflow.ts`,
`refs/cast/maxflow.png`. Render host: render-host (RTX 4090, every render). Round 1 (author), 2026-10-16.
Round 2 (fixes after critic 15/24), 2026-10-16: evidence `shots/char-maxflow/r3/` (see "## Round 2" at the end).
The r1 spec is kept for A/B as `shots/char-maxflow/r3/maxflow-r1.js.txt`.

## 0. Brief
- Concept: a BIG round plush-toy fox, unclothed: orange ball body with a cream chest oval, a big round head with a
  cream lower face + two cheek puffs and a dark button nose, tall BLACK triangle ears with cream insides, stubby orange
  arms with black paws, stubby black legs, and a HUGE tail with a cream tip that rises beside his LEFT hip to shoulder
  height (v1 S: the cream tip pokes out at screen-right of the shoulders; v1 N: the tail fills the back-left).
  (CAST_PORTING's card says "RIGHT side"; the v1 sheet draws it on the character's left — the sheet wins.)
  Adjectives: **big, soft, unstoppable** (+ good-natured) → CAST_PORTING §10: body f 1.8 ζ 0.7, head f 2.2 ζ 0.8,
  slow wind-ups, a squash on every contact.
- Not the slim tavern fox (Ginger): no clothes, no mug, ≈ 1.9× the mannequin's S area (`presence` 189 %, WARN — he is
  the intended big mascot), black ears (hers are orange with dark tips), the tail rises UP beside the body (hers sticks
  out sideways on her right).
- Body plan: **upright chibi** (`chibi({ height 1.34 (skull top), heads 2.3, legs 0.55, arms 0.75, snout 0.25 })`),
  `bodyPlan 'uprightAnimal'`, LegGait `plan 'biped'` + **style 'bird'** (waddle roll + head bob) + `locomotion.squash`
  on a leaf bone `ball` that carries the body egg (the chest rides the squash with `chest.p`).
- Game-speed arithmetic: v2 38 px → **H 1.52 m** (ear tips). v_game = 3.95·H = **6.0 m/s**. Leg (hip 0.37 → ankle 0.07)
  ≈ 0.27 m = 0.18 H → duty bound 2·0.6·0.18/1.1 ≈ 0.2 → duty 0.15 = no foot planted on two drawings: a **bouncing
  waddle** (CAST_PORTING §8 row 0.10–0.20). N 4 drawings, cycleTime 0.3 s → rendered 0.278 s / 1.1 H per cycle.
- Identity: (1) blob = round head + two tall black triangle ears on a round ball + the tail rising beside it;
  (2) palette orange `#D8692C`, cream `#F2EADC`, near-black `#2C2228`; (3) no v1 prop — a wooden CRATE is the blurb's
  story prop, shown only in vote and the emote; (4) face: dark button eyes, cream muzzle + cheek puffs, dark nose,
  small dark mouth; (5) v1 motion: tail sways with the step, arms swing.

## Unique to me
1. **Extra animated parts.**
   - **Tail** — two keyed bones (`tail0` on the hips at [0.08, −0.07, −0.2] → `tail1` at centreline point 3, axis
     'left': `out` − swings the tail out / + tucks it behind, `fwd` = yaw, `twist` = tip back). One convex hull for the
     tail0 half (three bands drew dotted lines), fur + cream-tip hulls on tail1, `material.merge { tail1: 'tail0' }`.
     No spring (a spring lags ≈ 0.25 m at 6 m/s). Walk (added on the waddle): tail0 out −8/−20/−38/−26 with tail1 one
     drawing behind (−24/4/−4/−30); idle sways it on the breath extremes; talk −14…+4 per beat; vote perks it; die flops
     it forward (r2: laid along his left side in the on-his-back DEAD pose); push streams it back on each shove.
   - **Ears** (keyed `earL0/R0`): flop back 24° on both contact drawings; one at a time in talk (−30°) and idle (f60);
     folded back (r2 −20°: the crate is held higher, in the paws) in vote; back on each shove; flat (−60°) in die. r2: the ears stand on the CROWN/back of the skull (at [0.13, 0.5, −0.1], dir [0.3, 1, −0.14], len 0.31), so in profile one ear sits on the outline (v1 E) instead of a dark slab mid-skull that read as an eye.
   - **Belly squash** — the body egg sits on the leaf bone `ball` (joint at the egg bottom, y 0.19): LegGait squash
     amount 0.22 on touchdown drawings / stretch on push-off; keyed `SQ(a)` (ball.s + chest.p rider) in idle breath
     (0.03–0.05), talk down-beats (0.06), vote grab (0.10), push crouches (0.14–0.18) and lunges (−0.08…−0.10).
   - **Crate** (story prop, bone `crate` on the hips, geometry at 1/1000 scale, shown with `crate.s` 999 only in vote
     and push; 0.48 m wood box; r2: lid rim + a slat band on a child bone `crateLid` so their step lines draw): vote =
     hoisted overhead, the paws gripping its lower side edges (arms near-vertical, `.l` 2.0) (held); push = shoved along
     the ground twice, then it poofs (`poof@crate` on f42, AT the crate while the crate bone is still there) and is gone on f44.
   - FX: speech bubble (talk), vote sparkle (`vote@handR`), die dust ring + wisp, step dust every 2nd footfall, push
     shove dust (`land`) and "!" (`emote:exclaim@crown`). No smears (nothing is swung).
2. **My locomotion: a bouncing waddle** — the whole ball rolls onto the stance foot (roll 9°; r2: spine roll −7° keyed
   on the k0 contact so k0 and k2 lean ≈ ±8° mirrored at S/SE, `r3/roll3.png`; r1 rolled ≈ 15° on k0 vs ≈ 5° on k2),
   the head bobs (6°), the ball squashes on each touchdown and stretches on push-off, and the body bobs 0.06 m:
   `walk.head_bob` 7.4 px (drawings 19.3 / 25.3 / 17.9 / 25.3), limp 1.4 px. LegGait 'biped' + style 'bird', plant
   'hold', **maxSwing 0.5** (r2), duty [0.15, 0.1], reach 0.6, poses [4, 4], cycleTime [0.3, 0.267], lift [0.06, 0.08],
   bob [0.06, 0.1]. `game.readable` 3.95 H/s, **0.30 s, 1.19 H** per cycle (v2: 0.31 s, 1.2 H; r1 0.278 s / 1.1 H: the
   LegGait default maxSwing 0.25 s floor raced the phase), 4/4 drawings every cycle, holds 2/3. The baked walk row now
   has **4 drawings** (r1: 3 — the race also skipped k2 in the start-up cycle the bake cuts). `game.feet_visible` PASS
   (SE min 4 px). `foot_slide` n/a (no foot planted on two drawings at this duty).
3. **Expressions in the new style.** Button eyes = dark 0.09 × 0.10 m boxes ON the 16-gon head surface (yaw 22°) with a
   flush 0.024 m cream glint (3×3 texels at S). Lids by `eye.s` y: blink −0.8, half −0.45, happy ^ ^ (x +0.1, y −0.65),
   wide +0.2, effort squint −0.5…−0.65. Mouth = a dark 0.07 × 0.016 m plate on the snout tip under the nose
   (`mouth`, r2 z 0.445), closed ≈ 1 texel, opened with `mouth.s` y 2.2·o (talk 1.4–1.6 → 2–3 texels; shove 1.8).
   r2 PROFILE: the cream snout wedge reaches z 0.45 (≈ 5 texels proud of the lathe face, r1 2) with the dark nose on its
   tip, and the near ear is on the crown — at E/W (idle, talk, all 4 walk drawings) he reads as a fox: ear on top, eye,
   snout + nose on the outline (`r3/b/zE.png`, `r3/w3/s-walk.png`). Talk = mouth on alternate keys + head roll toward
   the camera + a paw gesture (right paw f0, LEFT paw f12 so W/NW see one); vote = eyes wide, crate overhead; die = eyes
   shut on his back, face up; push = effort squint + open mouth on the shoves, happy eyes on the proud key.
4. **Game-speed readability.** Walk: the bounce + mirrored roll + squash + tail swing carry it at 1× (`clip-game-1x.gif`
   holds 60–70 ms = 2 grid frames, `r3/g1x/game.png`): one word **waddle**. Talk beat every 6 frames (`talk.amplitude`
   24 %). Vote up on f4 and held 1.63 s. Point: both paws thrust at the target held 0.74 s (`r3/g1x/point.png`). Die
   down by f20 (0.67 s), held 2.1 s, face up. Push: 8 / 6 / 6 / 8 / 14 frames, both shoves + the poof AT the crate read
   at 1× (`r3/g1x/push.png`).

## Proportions (vh 10, 36 px/m) — height_px S 52 (min 47, max 54), head_frac 0.52
| part | m | texels |
|---|---|---|
| ear tips (H) | 1.52 | 55 |
| skull top / head joint (chin) | 1.34 / 0.75 | 48 / 27 |
| head lathe r max × height | 0.36 (sz 0.85) × 0.58 | 26 wide × 21 |
| snout front (r2) | z 0.45 (lathe face ≈ 0.31) | ≈ 5 proud |
| body egg (y 0.19–0.79), r max | 0.30 (sz 0.92) | 22 wide |
| hips / leg | 0.37 / 0.27 | 13 / 10 |
| tail centreline / max r | ≈ 0.9 / 0.19 | 32 / 7 |
| crate | 0.48 cube | 17 |

## Palette (5 slots)
fur `#F4A468 / #DC6E30 / #B25A3A` · cream `#FFF4E8 / #F2E6D2 / #CDB49C` (whiteKeep 0.8, whiteKeepLift 0.8, slot lift
0.35) · dark `#5E4A54 / #3E3038 / #3A2C38` · eye `#4A3E52 / #221A26 / #2E2434` · wood (crate only) `#E8B874 / #B57E44 /
#80563A`. Golden sun-side chest: r1 `#957C7E` (mauve-grey, darker than the fur) → r2 `#D8CCBF` (sampled in
`scene-golden-crop.png`); the pillar (shade) copy stays mauve-grey (cast shadow).

## Timing charts (30 Hz, step; = `CLIPS` in maxflow.js)
- idle (72, dynamics hold): f0 rest · f30 breath −0.014 + squash 0.03, tail out · f36 −0.028, squash 0.05 · f50 blink (2)
  · f52 · f60 right ear flick (4) · f64 back.
- talk (24, `speak` f0): f0 mouth 1.6, head roll +8, right paw out · f6 shut, bob −0.03 + squash, half-lid, ear back ·
  f12 mouth 1.4, LEFT paw up by the shoulder (r2) · f18 shut, bob, other ear back. Tail per beat.
- vote (length 30, `vote@handR` f4): f0 squat −0.06 + squash 0.1, paws down to the crate on the ground in front (4) ·
  f4 on tiptoe +0.04, both arms near-vertical (`upperArm [6, 0, 170]`, `forearm [4, 0, −8]`, `.l` 2.0) with the paws
  at the crate's lower side edges, crate overhead (hips-local y 1.24), ears back −20, eyes wide → held.
- point (33): f0 wind: paw in, half-lid (4) · f4 "THAT one!": right paw thrust FORWARD along the facing
  (`upperArmR [80, 0, 8]`, `.l` 1.4/1.2), left paw forward-low (`[72, 0, 6]`, `.l` 1.0/0.8), spine/chest twisted 12/16°
  to his left so the pointing shoulder leads, head turned back to the target, mouth open, ears forward (22) · f26 down
  (6) · f32 idle. A paw leaves the outline at S, SE, E, NE, N, NW, W, SW (`r3/pt.png` row 3).
- die (fk, length 60, `die`+`land` f20): f0 sway, half-lid, ears sag (8) · f8 knees fold, he sits with a squash (6) ·
  f14 tips back (`hips [−40, 0, −10]`) (6) · f20 DEAD (r2): flat on his back (`hips [−80, 0, 0]`), chin tucked 35° so the
  shut eyes + cream face show at S/SE/SW, paws spread, feet up, tail laid along his left side → held. Chosen from
  probes `r3/c/s-die.png` (4 poses) + `r3/dt/s-die.png` (4 tail placements, row 2).
- push (emote, length 56; `land` f8 + f20, "!" f22, `poof@crate` f42): f0 crate appears 0.62 m ahead, he crouches
  behind it, paws on its top, effort squint (8) · f8 SHOVE: lunge 0.08, stretch, mouth open, crate → 0.78 m (6) · f14
  re-crouch, squash 0.18 (6) · f20 BIG SHOVE: lunge 0.14, eyes shut, crate → 1.05 m, tail streams (8) · f28 proud:
  chest out, paws on hips, happy eyes (16) · f42 poof at the crate (still at 1.05 m) · f44 idle, crate gone.
- ghost (64) / ghost-spent (72): `spec.ghost { hover 0.14 }` draws the pale ramp, halo, hover, floating legs; 4 keys:
  paws drifting out 16–24°, tail sway, one half-lid; spent: head bowed 14°, ears down, paws hanging, lower.
- walk (add, 4): f0 tail −8/−24, ears flop, spine roll −7 · f1 tail −20/+4 · f2 tail −38/−4, ears flop · f3 tail
  −26/−30. run at 2·v = the bird-style hop (optional). turn: 45° steps held ≥ 2 grid frames.

## Final numbers (sheet = code)
- Skeleton: chibi above + shoulders moved out to x ±0.27 (chest-local y 0.115, z 0.03), bent rest arms (up [30°, 12°],
  fore [14°, 32°]), ears {n 1, at [0.13, 0.5, −0.1], dir [0.3, 1, −0.14], len 0.31}, eye [0.15, 0.3, 0.275], mouth
  [0, 0.085, 0.445]; extra bones `ball` (spine, y 0.19), `tail0`, `tail1`, `crate` (hips), `crateLid` (crate),
  `face` (head, pos 0: carries the cream muzzle, cheeks and snout so they keep their own part id).
- personality body f 1.8 ζ 0.7 r 0, head f 2.2 ζ 0.8 r 0; chains none (everything keyed); quant { yaw 8, chain 4 }.
- locomotion: plan 'biped', style 'bird', plant 'hold', maxSwing 0.5, walk 6.0 / run 12.0 m/s, cycleTime [0.3, 0.267],
  poses [4, 4], duty [0.15, 0.1], reach 0.6, bob [0.06, 0.1], lean [6, 12], lift [0.06, 0.08], roll [9, 4], headBob
  [6, 6], squash { bones ['ball'], amount 0.22, riders ['chest'] }.
- material: sides { eye*, ear* 'mid' }, whiteKeep 0.8, whiteKeepLift 0.8, slots { cream: { lift 0.35 } }, merge
  { tail1: 'tail0', head: 'ball', upperArmL/R: 'ball', forearmL/R: 'ball' } (no neck collar at the back / sides, no
  stitched arm outlines on the body). No `spec.lights` (no lantern).

## Self-critique (round 1, final pack 116 pass / 16 warn / 0 fail)
| # | criterion | score | evidence (file · facing/frame · number) | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | `turnaround-silhouette.png`: ears + round head + tail at 8/8; tail tip out of the outline S 20, SE 43, NE 70, N 80, NW 19 px (`sig_outside` 5/8, E 3, W/SW 0 — the tail is in front of the body there); `r1/sil-lineup.png`: closest = fox (ears + side tail) and mincut (side tail) — separated by the wide ball, black triangle ears and the tail rising to the shoulder | tail out of the outline at W/SW |
| 2 | Pixel stability | 1 | idle/talk/vote/point/die/push/ghost off_grid 0, flicker 0, deterministic, pan 0, night_freeze/pan 0; walk off_grid 1 / flicker 2 (legs specks, WARN) | the 2 walk specks |
| 3 | Line quality | 1 | `isolated_px` fur [0, 3, 5, 11, 9, 8, 3, 3]; dotted inner lines on the body side / neck seam visible in `clip-turn.png` (E–N facings) | merge the arm/body seam |
| 4 | Tonal discipline | 1 | sig.fur hi/mid 0.86–0.91 8/8; tailTip hi/mid ≥ 0.5 7/8; `colors/slot` WARN (dark 8, cream 7 tones); speckle 30 | fewer tones / speckle |
| 5 | Ground separation | 2 | sig_ground noon-sun dH 52, noon-shade +16 %, golden-sun dH 42, golden-shade +19 % (all PASS); `scene-*-crop.png` sun + pillar copies read; cream chest goes grey-beige in the golden pillar copy | — |
| 6 | Proportion / expression | 2 | face_lit 79 %, face_visible 62 %; mouth plate open 2–3 texels in talk f0/f12 (`clip-talk.png`); blink/happy/effort eyes; die eyes shut | — |
| 7 | Animation timing | 1 | single_frame 0, hold_redraws 0, key_delta ≥ 52 % every action, vote/die final_hold PASS; `r2/s-keys.png`: the point arm hides behind the body at E, NE, W (reads at S, SE, SW, N, NW only) | point readable at W |
| 8 | Weight / contact / game speed | 1 | game.readable PASS 4/4, head_bob 7.4 px, feet_visible PASS; foot_slide n/a (inherent); the BAKED walk row has only 3 drawings (k1, k3, k0: the bake cuts the cycle from the start-up cycle that skips k2 — module issue) | bake fix |
| 9 | Personality / secondary | 2 | tail lag one drawing in walk, belly squash on contacts and in every action, ear flops; push reads as a heavy two-shove effort (`r1/s-push1x.png`) | — |
| 10 | Smears / FX | 2 | no smears (nothing swung); bubble, sparkle, dust, "!" and crate poof clear of the face (`clip-push.png`, `clip-talk.png`) | — |
| 11 | Facing / turns | 2 | turnaround 8/8; `turn.off_grid` 0, single_frame 0, strobe 1 | — |
| 12 | Technical | 2 | page_errors 0, draw_calls 2/1, deterministic; 0 FAIL; RTX 4090; bake 10 clips × 8 dirs (push cell-touch + FX-crop warnings) | — |

**Total 19 / 24.** Weakest: (1) the baked walk has 3 drawings (shared bake/LegGait start-up skip); (2) point is
hidden behind the body at E/NE/W; (3) dotted seam lines / fur speckle up to 11 px at NE.

## Round 2 (critic 15/24 → fixes; final pack 112 pass / 20 warn / 0 fail, bake walk 4 drawings)
Every `owner: character` issue, what changed, and the render I looked at (all under `shots/char-maxflow/`):
| critic issue | fix (spec) | evidence |
|---|---|---|
| profile face fails at E/W: near-ear root mid-skull reads as an eye, snout 2 texels | ears moved to the crown/back + upright (`EAR` at [0.13, 0.5, −0.1]); cream snout wedge to z 0.45 with the nose on its tip; mouth to z 0.445 | `r3/b/zE.png`, `r3/e/s.png`, `r3/w3/s-walk.png` (E/W all 4 walk drawings), `turnaround.png` |
| point aims to his right, hidden at 4/8 | right paw forward along the facing (`[80, 0, 8]`, `.l` 1.4/1.2) + left paw forward-low, chest twisted so the pointing shoulder leads | `r3/pt.png` (row 3 = shipped: a paw off the outline at 8/8), `r3/g1x/point.png` |
| push poof on the belly, crate vanishes with no FX | `poof@crate` on f42 while the crate is still at 1.05 m; crate gone on f44 (f43 gave push.strobe 4 FAIL) | `clip-push.png`, `r3/g1x/push.png` frames 15–17, bake push row (`bake/z-push-S-SE.png`) |
| cream chest mauve-grey at golden | whiteKeep 0.8 + whiteKeepLift 0.8 alone changed nothing (#957C7E); + `slots.cream.lift 0.35` → sun copy #D8CCBF | `scene-golden-crop.png` (sampled), `r3/scc/` (lift 0.35 = 0.6) |
| neck collar / stitched arm outlines / tail X | `material.merge` head + arms → ball (the cream face on its own `face` bone keeps its line against the chest) | `r3/b/zdiff.png` (137 px of seam removed at idle) |
| waddle roll lopsided | spine roll −7 on k0 (k0 ≈ +8°, k2 ≈ −8°); maxSwing 0.5 (cycle 0.30 s) | `r3/roll.png`, `r3/roll3.png`, `clip-game.png` |
| die final pose a jumble, no face | DEAD flat on his back, chin tucked, face up, tail along his side | `r3/c/s-die.png`, `r3/dt/s-die.png` row 2, `clip-die.png`, `r3/g1x/die.png` |
| turn settles with ~7 redraws | NOT changed: quant.lean 4, quant.lag 'step', faster personality all gave the identical turn report (`r3/turn-*`); the post-turn changes are the idle clip's own keys (blink f50/52, ear flick f60/64) + the 2-drawing recovery step | `clip-turn.png`, `r3/turn-{x,L,S,F,LF}/report.txt` |
| vote paws flail, crate a blank cube | arms near-vertical (`[6, 0, 170]`, `.l` 2.0) so the paws hold the crate's lower edges, crate at 1.24; lid + slat on child bone `crateLid` (a separate part id → real step lines), ears −20 | `r3/v2/s.png`, `clip-vote.png` |

Kept / not fixed: the tail/body seam X at N (merging the tail into the body removes it but turns the E profile into one
egg, `r3/tT.png` row 2); W/SW tail tip inside the outline (sig_outside 0); `vote.key_speckle` +24 / `push.key_speckle`
+15 (the crate edges); walk off_grid 2 / flicker 2 (legs, module); bake push S/SE/SW "touches the cell border" even at
`--cell 160` (the crate ahead; tools).

### Self-critique round 2
| # | criterion | score | evidence |
|---|---|---|---|
| 1 | Silhouette | 2 | E/W read as a fox (crown ear, snout, nose) in idle/talk/walk; tail out of the outline 6/8 (W/SW 0) |
| 2 | Pixel stability | 1 | all actions off_grid 0 / flicker 0; walk off_grid 2, flicker 2 (legs) |
| 3 | Line quality | 1 | back/side collar + arm seams gone, isolated fur max 7 (r1 11); cream face/chest line stays; tail X at N |
| 4 | Tonal discipline | 1 | colors/slot WARN, speckle 24 |
| 5 | Ground separation | 2 | sig_ground 4/4 PASS; golden sun chest #D8CCBF (r1 #957C7E) |
| 6 | Proportion / expression | 2 | profile face, die face up with shut eyes at S/SE |
| 7 | Animation timing | 2 | point paw off the outline at 8/8 held 0.74 s; talk gesture alternates paws (W/NW see one) |
| 8 | Weight / contact / game speed | 1 | 3.95 H/s, 0.30 s / 1.19 H, 4/4, bob 7.4 px, mirrored roll, bake 4 drawings; but no foot planted on two drawings (n/a) |
| 9 | Personality / secondary | 2 | tail + ears per drawing, squash, crate held in the paws, two-shove push with proud finish |
| 10 | Smears / FX | 2 | poof at the crate, "!" on the big shove |
| 11 | Facing / turns | 2 | 8 facings, turn off_grid 0, strobe 1 |
| 12 | Technical | 2 | 0 FAIL, page_errors 0, draw calls 2/1, RTX 4090 |
**Total 20 / 24** (conservative: #8 and #3 are the weakest).
