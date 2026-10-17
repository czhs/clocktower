# Progress (cast `progress`) — design sheet

"A green frog who always takes a step." (mascot 15-312). Spec: `characters/progress.js`. Pack: **`shots/char-progress/c1/pack2/` (close-out c1: point redone, ghost + ghost-spent, bake `c1/bake/`)**; earlier `shots/char-progress/r7/` (r5 critic fixes; r4 = pre-critic)
(`--preset cast --raw`), 8-facing key stills `shots/char-progress/r3/g8/`, `r4/g8/`, bake `shots/char-progress/bake-r7/` (auto cell 84 → 66×67, no border warning at the final cell).
Identity source (read only): `pipgws/packages/assets/scripts/cast/progress.ts` + `lib-c-frog.ts`, `refs/cast/progress.png`.
Everything rendered on render-host (RTX 4090, report.txt GPU line).

## 0. Brief
- Concept: a small, chubby, UN-armoured frog in an orange knit scarf with a little brown backpack and a big open grin,
  skipping everywhere. Adjectives: **cheerful, eager, bouncy** → personality body f 3.5 ζ 0.5 r 1, head f 3.5 ζ 0.6 r 0;
  springy holds, chin up on the punchlines.
- Body plan: **upright chibi** (`chibi({ height 1.2, heads 2.2, legs 0.62, arms 0.65, snout 0, shoulders 0.6, hips 0.3 })`,
  head raised HEAD_UP 0.06 so the scarf shows under the jaw at S), `spec.bodyPlan 'uprightAnimal'`, heightPx [36, 46].
- Game-speed arithmetic: H 1.12 m (v2 28 px), v_game = 3.95·H = 4.42 m/s, run 8.85 m/s. Leg 0.27 m = 0.24 H → duty bound
  2·0.6·0.24/1.15 ≈ 0.25: stepping needs flight → **SKIP** (step-hop per step): LegGait plan 'biped', plant 'hold',
  N 4 drawings (L contact · flight · R contact · flight), cycleTime 0.3 s (measured 0.289 s, 1.14 H/cycle), duty 0.25,
  lift 0.16 m (free foot tucked in flight), authored `clips.walk` keys the body (pos −0.035 contact / +0.11 flight).
- Identity (ref facing): (1) blob = wide flat head with two eye bumps above the crown (S, N) + pack bump behind (E/W);
  (2) palette: v1 leaf green + cream belly + orange scarf + brown pack; (3) props: backpack on the back, scarf end hanging
  at the front on his LEFT; (4) face: white eyes with dark pupils on the bumps, BIG open grin with pink tongue, pink
  cheeks; (5) v2 motion: arms swing, bob.
- Siblings: frog (Sir Croaksworth) = mint, red cape, sword+shield, two-footed LEAP; toad = olive, waistcoat, WADDLE;
  Progress = v1 leaf green, scarf + pack, open grin, SKIP. Twin `preservation` is not built yet (same rig would fit).

## Unique to me
1. **Extra animated parts.**
   - Scarf end = 1-link spring chain `scarf0` (chest, x 0.07 front, len 0.2; f 4, ζ 0.6, gravity 0.7, drag 0.8, limit 35°):
     lags the skip and the turns.
   - Backpack = keyed bone `pack` (pivot on the upper back): walk contact −20° (bottom swings out), flight +10° (30° per
     drawing pair), step emote −8/+14/−16, idle −c (breath). Visible bounce at E/W/N (`r2d2/cg-sheet.png`).
   - Jaw (back hinge, modelled OPEN = the v1 grin): talk +22/−8, vote +16, emote +24, die −6. Eyes `.s` (blink, wide
     vote, happy squint step, shut die). Vote pennant `flag` (hidden at 4 % in the fist, `flag.s` 24 in vote): orange
     triangle on a 0.72 m stick ending at the fist, cloth yawed +35° so it faces the camera at SE (r5).
   - FX: speech bubble (talk), `vote@handR` sparkles, `land` + `emote:star@crown` on the step landing, die dust + wisp,
     step dust every 2nd footfall.
2. **My locomotion: a SKIP.** Each step is a hop: contact drawing = squash (`spine.s` [0.05, −0.06, 0.05], pos −0.035,
   lead-side arm forward, pack out), flight drawing = stretch (pos +0.11, the free knee up and forward from the gait's
   swing lift 0.16, opposite arm pumped to 84°, pack in). Head joint moves 5.8 px between contact and flight in the game
   job (stage log `h` 173.4 ↔ 179.2, `r3/game-draw.png`); `game.readable` 3.95 H/s, 0.289 s, 1.14 H, 4/4 drawings, holds
   2–3. Contact is ONE drawing per foot (foot_slide n/a, 'hold' leg drawings: legs-only WARN 105 px).
3. **Expressions.** Eyes (r5): cream disc r 0.095 (≈ 3×3+ texels) on the bump front tilted 24° up, small near-black pupil
   in the upper-inner quarter. Grin (r5): front-face-only slit, jaw sides closed with skin jowls, ≈ 3 texels + tongue at S,
   a short slit at SE, steady on every walk drawing (`r7/turnaround.png`, `r7/game-1x-sheet.png`). Talk = jaw opens wide
   on alternating keys + head roll ±12 + hand beat; vote = eyes wide, grin open, pennant up; step = ^^ squint + widest
   grin + a forward lunge with a stretched arms-V; die = eyes shut, flopped back on his pack, face up.
4. **Game-speed readability.** Walk: whole-body bounce ≈ 6 px + arm pump + pack swing ("skip"/"bounce"; root-following
   1× sheets `r2/cg-sheet.png`, `r2d2/cg-sheet.png`, fixed camera `r3/g1x-sheet.png`). Talk beat every 6 frames
   (amplitude 29 %). Vote up in 3 frames, held. Step: crouch 8 · jump 6 · landing ta-da 14 · settle 6. Die down by f17.

## Proportions (vh 10, 36 px/m)
| | m | texels |
|---|---|---|
| height (eye-bump tops) | ≈ 1.12–1.15 | 38 (S) – 43 (E/W/NE) `height_px` |
| head width / skull depth | 0.68 / 0.52 | 24 / 19 |
| belly (8-gon lathe) | Ø 0.49, y 0.26–0.57 | 17 wide |
| leg (thigh + shin) | 0.27 | 10 |
| arm (upper + fore + hand) | ≈ 0.27 | 10 |
| pack | 0.36 × 0.33 × 0.17 | 13 × 12 |

## Palette (5 slots + accent)
skin `#6A9C34 / #528630 / #324A3E` (v1 hue 89° and v1 VALUE; renders −29 % L under lit grass noon/golden, sh −28 % under
shade; a light chartreuse r1 was +12 % = lime on lime, `shots/char-progress/pA..pC` A/B) · cream `#FFF8D2 / #EFE3A6 /
#A69A86` · scarf `#FFB878 / #E8742E / #8E3E42` · pack `#D69A5E / #A0602E / #4A3A46` · dark `#8C5262 / #5A2E40 / #3E2838` ·
accent pink `#FFC2C6 / #EC7C8C / #A0506A`. Signature `['scarf', 'skin']`, faceSlot skin.

## Timing charts (30 Hz grid; step interp)
- idle (loop 72, dynamics hold): f0 A · f30 B · f36 C · f54 blink (2) · f56 C · f66 B.
- walk/run (LegGait biped, authored length 4): d0 L contact · d1 flight · d2 R contact · d3 flight; run = same with
  spine +12/+6 lean and flight pos +0.16; cycleTime [0.3, 0.267], duty [0.25, 0.2], lift [0.16, 0.2].
- talk (loop 24): f0 jaw 22 head roll +12 right hand out (`speak`) · f6 jaw −8 bob · f12 jaw 20 roll −12 left hand · f18 jaw −8.
- vote: f0 dip (3) · f3 arm [−10, 0, 140], pennant up, eyes wide, jaw 16, `vote@handR` · held (repeat f30).
- die (legs fk): f0 wobble (6) · f6 sits (6) · f12 tips left 40° (5) · f17 on his side 82° · f20 settle (`die`) · repeat f60.
- step (legs fk): f0 crouch (8) · f8 airborne pos +0.24 (6) · f14 lunge landing, arms V (forearm.s 0.6), `land` + star (14) ·
  f28 settle (6) · f34 idle.
- point (c1): f0 wind (4) · f4 hold: right arm forward-up .l 1.3, left paw forward-low (12) · f16 bounce +1 texel (12) · f28 hold (10) · f38 arms down (6) · f44 idle.
- ghost / ghost-spent (c1, loop 72): keys every 18 f, bob +1/0/−1/0 texels; ghost knee lifts L · – · R · –; spent 2 texels lower, bowed, legs still.

## Lights
None.

## Self-critique (Stage 7, r4)
Evidence on render-host (RTX 4090): full pack `r4/` (76 pass / 19 warn / 0 fail), 8-facing key stills (vote f3, die f20,
step f14, talk f0, point f4), raw game drawings with the stage log, 1× GIF frame sheets, bake (no border warning at 154).
NOT run: 25 % line-up against every finished cast member (only checked by eye vs frog/toad), hold/turn raw-diff audits,
8-facing stills of every idle/talk key, per-facing tone counts by hand → those criteria capped at 1.

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 1 | two bumps at S/N, pack at E/W (`r4/turnaround-silhouette.png`); line-up vs all cast not run | E/W head column; full line-up |
| 2 | Pixel stability | 1 | idle/talk/vote/step/die off_grid 0, deterministic PASS; walk legs-only flicker 108 | hold audit |
| 3 | Line quality | 2 | silhouette_line PASS, inner_lines > 500, edge_highlights 0 | — |
| 4 | Tonal discipline | 1 | isolated_px scarf max 4 (want ≤ 2), colors/slot WARN | scarf collar specks at SE/NW |
| 5 | Ground separation | 2 | sig_ground 4/4 PASS (noon −29 % L, golden −30 %, shades −28/−29 %) | — |
| 6 | Proportion / expression | 1 | face_lit 97 %, grin + tongue at S/SE/SW, talk jaw 22/−8 | die face small at S |
| 7 | Animation timing | 1 | single_frame 0, strobe 1, hold_redraws 0; not every 1× GIF checked | 1× sheets per clip |
| 8 | Weight / contact / game speed | 1 | game.readable PASS 0.289 s 1.14 H 4/4; bounce 5.8 px; foot_slide n/a | 2-drawing contact |
| 9 | Personality / secondary | 1 | scarf chain, keyed pack, arm pump; turn audit not run | turn audit |
| 10 | Smears and FX | 1 | sparkles, star, speech, dust, wisp; not audited at 8 facings | — |
| 11 | Facing and turns | 1 | 8/8 facings read; turn.foot_slide 7.64 WARN | — |
| 12 | Technical | 2 | page_errors 0, draw calls 2/1, RTX 4090 | — |

Total **15/24**. Weakest three: (1) the skip contact is one drawing per foot (foot_slide n/a) and the E/W profile is a
tall green column; (2) the die hold is a tangled lump at N/NW/W and the face is small at S; (3) scarf collar specks
(isolated 4–6 at SE/NW/SW).

## r5–r7: art-director fixes (critic 15/24)
Evidence: `r5/z8-idle.png`, `r5/z-*.png` (8-facing key stills), `r6t/turnaround-silhouette.png`, full pack `r7/`
(84 pass / 21 warn / 0 fail, RTX 4090), 1× GIF sheets `r7/*-1x-sheet.png`, bake `bake-r7/`.
- **Mouth = front-only grin:** the 0.58×0.10×0.34 dark box is gone; mirrored skin JOWL hulls + a back block close the
  skull↔jaw gap on the sides (flush with the 0.68 jaw), a 0.34-wide dark mouth block sits 0.09 m back in the front face
  only. At SE the mouth is a short slit at the front, no band round the head at E/W (`r7/turnaround.png`).
- **No chattering:** skip flight head pitch +4 (contact −6) → hips+spine+chest+head = +2° on every drawing; the visible
  grin is the same slit on all 4 gait drawings (`r7/game-1x-sheet.png`).
- **Bright eyes:** eye white r 0.095 (≈ 3×3+ texels), pupil 0.05 box in the upper-inner quarter; dark slot darkened to
  `#5E3446 / #34182A / #24121E` (pupils and mouth read near-black, not mauve).
- **Pennant:** cloth yawed +35 (faces the camera at SE), stick ends at the fist (0.72), arm [−6, 0, 118] + hand out 66
  → the flag stands left of the head at S/SE. At E the near arm still crosses the face (arm on the camera side).
- **Step = a real step:** gather 0.08 back → airborne → land 0.17 ahead (root travel 0.25 m ≈ 9 texels; front foot
  ≈ 0.35 m ahead of the gather), left leg forward / right back, held 14 frames; arms [−26, 0, 142] with upperArm.s 0.4
  + forearm.s 0.9 (noodle ta-da) → the V clears the 0.78 head at all 8 facings (`r5/z-step-f14.png`). NOTE for raised
  arms: q = qFwd·qOut, so on an arm already raised by `out` a POSITIVE fwd tips it BACK; use negative fwd.
- **Silhouette:** skull 0.78 wide, eye bumps x 0.225, 0.20 tall lathe on y 0.31 and the crown lowered → notch at S and
  a small notch at SE (`r6t/turnaround-silhouette.png`); pack 0.46 wide. Height 40 (S) – 46 px.
- **Die:** flops BACK onto the pack (hips −64, legs out low, arms wide): belly + shut-eyed face up at S/SE/SW/W, pack
  under him (no hollow frame). Still a busy shape at N.
- **Tonal:** pack flap + clasp dropped (pack 5 tones, was 8), `material.merge { scarf0: 'chest' }`; scarf isolated max 3
  (was 4–6), colors/slot still WARN (cream 10).
Remaining WARNs: walk/game flicker 90–97 (legs, motion owner), turn.foot_slide 7.64 (motion), die.key_speckle +28 and
step.key_speckle +18 (the reclining/arms-up keys add specks), speckle 31.

## Close-out c1 (2026-10-17): point redone + ghost + ghost-spent added
Evidence (all rendered on render-host, RTX 4090): full pack `c1/pack2/` (`--preset cast --raw`): **113 pass / 18 warn /
0 fail, `cast_clips PASS all`** (idle, walk, talk, vote, point, die, ghost, ghost-spent + emote step; run kept), page_errors
0; bake `c1/bake/` (10 clips × 8 dirs, auto cell 62 → 84, trimmed 66×67, anchor [33, 56], no border warning at the final
cell; point 6 / ghost 4 / ghost-spent 4 frames; preview crops `c1/bk-point.png`, `c1/bk-ghost.png`, `c1/bk-spent.png`).
1× frame sheets with durations: `c1/gs-{point,ghost,ghost-spent,vote,die}.png`.
- **point (redone, R W4):** the r7 point (right arm level + chest twist) only left the outline sideways — at S the arm
  pointed AT the viewer (`c1/sil-point0.png`). Now the twin preservation's measured recipe: wind (4: crouch 1 texel,
  arms coiled) → hold (12): right arm forward-UP `[115, 0, 26]` with reach `.l` 1.3/1.3, left paw forward-low
  `[70, 0, 34]` `.l` 0.8, chin up, eyes wide, grin open, pack tips → the eager bounce (12, +1 texel up and 0.02 forward:
  he wants to step toward them) → hold (10) → arms down (6) → idle. Silhouette diff of the hold vs idle (bg=key,
  `progress_sil.py.js`, `c1/sil-point1.png`): px outside the idle outline S 111 · SE 94 · E 105 · NE 117 · N 110 · NW 105 ·
  W 111 · SW 98; the pointer itself leaves the outline by ≈ 8 (S) · 9 (SE) · 6 (W) · 7 (SW) texels. Rows: pose_read 20 %
  held ×4, key_speckle +0, off_grid / flicker 0. 1× timing: idle 270 ms → wind 130 → point 400 → bounce 400 → 340 → 200.
  Weak: the pointer at SE/SW is the arm's shade tone (#324A3E, under the head) — reads as a dark stick on grass
  (`c1/z-point1.png`) but almost vanishes on the dark bake preview background; at S the arm is necessarily sideways.
- **ghost (loop 72, 4 keys every 18 f, `spec.ghost { hover 0.14, keepHue 0.3 }`):** pale mint frog (keepHue keeps the
  leaf-green identity), gold halo, hovering (shadow detached), RIGID whole-texel bob +1/0/−1/0, head sway ±3, grin kept,
  blink on key 2; he still "takes a step": one knee lifts per key (L, both hang, R, both hang), arms swing against it.
  c1's two-foot stride FAILed `ghost.foot_slide` 2.04 (hovering feet measured by height) → c1b: a hanging foot keeps
  ONE pose; no foot_slide row now. Most of the leg is inside the module's bind-height dissolve, so the knee lift reads
  only as a small change at the hem (`c1/gh/clip-ghost.png`). amplitude 27 %, off_grid / flicker 0.
- **ghost-spent (loop 72):** 2 texels lower, half the bob, legs hanging still, spine/chest 5–6 + head bowed 10, eyes half
  shut, grin closed (jaw −8), arms limp; the module's dimmer grey ramp, no halo (`c1/z-ghost-spent-f0.png`). amplitude 8 %.
- **Halo self-shadow:** the spec.ghost halo sits outside the bind self-shadow hull and painted a slate-blue blotch on the
  far eye bump at SE/N/NW (`c1/zz-ghost-se.png`, `c1/zz-ghost-n.png`; halo off = gone, `c1/z-wvh-ghost.png`).
  `material.hullMargin: 0.3` clears it (`c1/z-wvm-ghost.png`; 0.15 did not, `c1/z-hm15-ghost.png`). Living cost (A/B in
  one tree state, `c1/ab-hm-*.png`): idle 0 px, point 20, vote 82, die 250 px (pack underside a tone lighter at E/NE).
- NOT run this round: ghost at golden/night stills, the 25 % line-up, a fresh critic.
