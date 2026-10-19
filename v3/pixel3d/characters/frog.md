# Sir Croaksworth (cast `frog`) — design sheet

"A knight sworn to a pond that no longer exists." Spec: `characters/frog.js`. Pack: `shots/char-frog/`, evidence
`shots/char-frog/self/`. Identity source (read only): `pipgws/packages/assets/scripts/cast/frog.ts`, `refs/cast/frog.png`.
Rendered on render-host (RTX 4090, every report.txt GPU line).

## Ghost port (2026-10-17) — shared `spec.ghost` (supersedes the t2 ghost recipe below)
- **Why:** the t2 ghost was a per-clip shader trick (`ghostFlag`/`halo` bones + `material.tones`), so a dead player
  WALKING as the frog (the demo's default character) looked alive until he stopped. Now `spec.ghost` (playbook wave-3
  banner) draws the look and `ch.ghost = 1` keeps the walk, talk and emotes ghost-shaded.
- **Spec:** `ghost: { hover: 0.14, keepHue: 0.3, spent: ['#3A4260', '#B0BACE'] }` — keepHue 0.3: mint skin + red cape are
  the identity (pale mint-blue ghost, pink cape); spent light end lifted from #98A2BA (the default left a murky slate
  frog, `shots/ghost-port/frog/z-g8.png` r1). Default halo (head, lift 0.12, r 0.15) floats clear of the domes
  (`ghost.islands` 2 → 2). Removed: `ghostFlag` + `halo` bones, the 8-box halo parts, `GHOST` / `ghostMaterial()` and the
  `three` import. Skeleton 22 bones (was 24).
- **Clips (pose only, `dynamics: 'hold'`):** ghost f 0/18/36/54: `pos` y = bob [0, 0.028, 0.056, 0.028] (the module adds
  the 0.14 m hover + floating FK legs), spine −3, chest −4, head −6, arms drifting out (+0/2/4/2°), cape0 −6−a, knees
  bent (thigh 16, shin −26, foot 28). ghost-spent: 1 texel lower, bob [0, 0.028, 0.028, 0], chest +6, head +14 with roll
  [3, 0, −3, 0], eyes half shut, arms hanging, cape down.
- **Checks (render-host):** pack `shots/ghost-port/frog/pack/` (`--preset cast --raw`) 108 pass / 20 warn / 0 fail (= before);
  ghost amplitude 24 %, key_delta 51 %, off_grid 0, flicker 0, islands 2 → 2; spent amplitude 9 %, key_delta 13 %.
  Living renders unchanged: 0 / 2329 raw frames differ vs the pre-port pack (`shots/ghost-port/gp_ab.py`). Walking ghost in
  the demo (`?char=frog`, key 5, D held): rig ghost level 1, `ch.ghost` 1 while moving, pale at noon and self-lit at night
  (`shots/ghost-port/frog/walking-ghost-{noon,night}.png`). The t2 notes below on the ghost mechanism and the ghost
  timing line are historical.

## T2 touch-up (2026-10-16, Clocktower-only rule) — what changed
- **New game clips:** `point` (one-shot 36 f: wind-up 4 → sword arm out to his right-forward at shoulder height, wrist
  turned so the BLADE points back behind the fist = he points with the gauntlet, head + chest turned along the arm, jaw
  open "thou!" 12 → emphasis beat 8 → held point 12 → idle), `ghost` (loop 72: hovers ≈ 0.2 m, pale blue, gold halo over
  the domes, chin up, arms drifting, 4 held bob drawings × 18 f) and `ghost-spent` (same hover, dimmer grey-blue, NO
  halo, head bowed, eyes half-shut, half the bob). Evidence: `t2/ghost-x3.png` (idle / ghost / spent, 8 facings),
  `t2/ghost-night-x3.png`, `t2/point-c.png`, `t2/keys2-x3.png`, 1x frame sheets `t2/sheet-{point,ghost,ghost-spent,die,oath,game}-1x.png`,
  pack `t2/pack/report.txt` (point/ghost/ghost-spent all PASS, point.key_speckle WARN +16).
- **Ghost look without shared code:** two extra bones appended to the skeleton — `ghostFlag` (hips child, no geometry;
  its keyed `.s` is the signal: +1 ghost, +0.5 spent, 0 elsewhere) and `halo` (head child; the 8-box brass ring is parked
  INSIDE the skull at rest and lifted by `halo.p` in `ghost` only). `spec.material` hooks (`vertexHead`/`vertex`/
  `fragmentHead`/`tones`, `ghostMaterial()` in frog.js): the vertex shader reads the ghostFlag/hips scale ratio from the
  skinning bone matrices → flat varying; the fragment re-maps every tone by luminance onto a pale-blue ramp (`GHOST.ramp`,
  spent `GHOST.spent`), halo pale gold, faint emissive at dusk/night, and a 2×2 Bayer screen dither DISCARDS 1/4 → 1/2 →
  3/4 of the texels below the chest (bind-space y 0.62 / 0.47 / 0.30 m) = the v1 ghost's fading tail (alpha 0 in the bake).
  Idle/talk 8-facing stills are pixel-identical before/after (`t2/ab-idle.png`, `t2/ab-talk.png`: 0.00 %).
- **De-combat:** `die` lost the hit (`hurt` flash, recoil) and the legs-up impact bounce: sigh 8 → knees give 6 → sit
  back 6 → lie back 4 → settle (held), soul wisp only (`die` at f20). `oath` lost the sword SWEEP + smear (a flourish):
  salute (twinkle `sparkle@weapon`, was a `hit` spark) → PLEDGE (sword hand to the heart, blade lowered across the
  body) → bowed tear. `spec.smears` and `fx.flash` removed.
- **Module-fix re-check:** cast pack `--preset cast --raw` = 71 pass / 23 warn / **0 fail** (r3: 2 fail, both run): walk
  reads as the two-footed leap at 1x (`t2/sheet-game-1x.png`, boots under the body in every drawing, no hem to clear),
  game.readable PASS. Bake `out/sprites/frog.*` = 10 clips × 8 dirs (idle 6, walk 4, run 4, talk 4, vote 2, die 5, oath 5,
  point 5, ghost 4, ghost-spent 4), cell 72×84, no border warnings at the final cell.

## 0. Brief
- Concept: a small, very earnest frog knight in steel plate and a red cape, bouncing everywhere in a two-footed
  leap-march. Adjectives: **proud, earnest, wistful** → personality body f 2.5 ζ 0.8 r 0, head f 3 ζ 0.8 r 0; crisp
  holds; chin up in vote/salute; one melancholy beat in the emote.
- Body plan: **upright chibi skeleton** (`chibi({ height 1.3, heads 2.2, legs 0.75, snout 0, shoulders 0.44 })`; the
  ref is upright and armoured) driven by the **LegGait `hop` plan on the two hind legs only** (`locomotion.legs`
  {HL, HR}; the plan's default FL/FR would plant the arms). `spec.bodyPlan 'hopper'`.
- Game-speed arithmetic: H 1.2 m (v2 30 px), v_game = 3.95·H = 4.74 m/s, run 9.48 m/s. Leg 0.33 m = 0.27 H; the
  stepping duty bound 2·0.6·0.27/1.15 ≈ 0.28 already needs flight, and a stance span of ≥ 0.2 m per foot cannot be held
  over a 2-frame hold (0.32 m of travel) → **ONE two-footed hop per cycle**: N 4 drawings × 2 grid frames, cycle 0.3 s
  target (measured 0.289 s, 1.14 H per cycle), duty 0.25 (shrinks to ≈ 0.14 by the reach clamp → exactly one
  planted touchdown drawing), (r3) hop arc 0.38·H = 0.46 m ≈ 16 texels walk, 0.46·H run, cycleTime [0.3, 0.267], lean [6, 14].
- Identity (ref facing): (1) blob = wide head with two eye bumps + red cape behind (S, N); (2) palette green + red cape +
  blue steel + brass; (3) short sword RIGHT hand pointing down-out, round blue shield with gold star on the LEFT forearm
  (S/SE); (4) face: 2×2 dark pupils in cream eyes on top bumps, wide mouth line, cream lower jaw; (5) v2 motion: cape lag.

## Unique to me
(r3, re-checked against `frog.js` and the r3 pack after the critic r2 fixes.)
1. **Extra animated parts.** Cape = 2-link chain `cape` (links 0.25 + 0.27 m, f 4.5, ζ 0.8, gravity 0.9, drag 0.6,
   limit 30°, falloff 0.85, noForward): trails ≈ 30–45° and swings with the hop (`clip-game.png` every drawing); in the
   die hold link 1 is keyed bent (`cape1 [40,0,0]`) so it folds instead of a flat kite (`self/r3-die-1x-sheet.png` f27).
   Jaw = keyed bone with a **back hinge** (z −0.10): 26–28° in talk drops the skin jaw ≈ 6 texels and shows the dark
   mouth floor + red tongue (`clip-talk.png`, `self/r3-keys-x4.png` row 1). Eyes = keyed `.s` channels (blink, wide
   in vote, half-shut in the oath, shut in die). FX: speech bubble, 3 vote sparkles, salute glint (`hit@weapon`), oath
   (t2: the sweep smear and the die hit flash are gone — Clocktower rule), tear glyph `emote:drop@crown`, die soul wisp,
   hop dust every 2nd footfall, ghost tint/halo/dither (t2, see the touch-up section). Arms ride the REST pose in the gait
   (LegGait ignores walk clips), so the carry is rest geometry: `WEAPON.rot [−139.4, −60.1, 0]` = blade out-right, a
   little back and 19° UP from the hanging hand → hip height (r2 trailed at boot level), shield normal 35° out.
2. **My locomotion: a two-footed LEAP.** Both boots together: crouch (touchdown, planted, ≈ 4 texels of squash) → rise
   → apex → fall, 4 drawings per 0.289 s at 3.95 H/s, 1.14 H per cycle (`game.readable` PASS). Hop arc 0.38·H (0.46 m ≈
   16 texels at the apex drawing, ≈ 8 at rise/fall) with `lift +0.05` → boots TUCKED under the body in flight; at 1x the
   flight drawings clear the standing height by 8–12 px (`self/r3-game-1x-sheet.png`, `game-onion.png` shadows offset).
   Nobody else in the cast leaps on two feet.
3. **Expressions / face.** WIDE FLAT frog head: hull skull 0.78 wide × 0.175 tall × 0.67 deep, its crown recedes back
   while the front-bottom juts forward (snout) → E/W profile is a frog with a mouth slit along the side; cheeks wider
   than the eye span → a trapezoid with two domes at 25 % (`self/r3-turnaround-x2.png` bottom row), not mouse ears. Eyes:
   dark rim Ø 0.196, cream white, 2×2 pupil, on domes at |x| 0.215. Permanent mouth = a dark band following the octagon
   front half (the v1 smile at S). The jaw is SKIN with only a cream chin patch inside the outline (r2: full-width cream
   collar). Talk = jaw open alternate keys + 26° nod; vote = eyes wide + jaw 16°; die = shut eyes, jaw closed in the hold.
4. **Game-speed readability.** Walk: crouch ↔ leap height (8–16 texels) + cape carry the rhythm, one-word read "hop".
   Talk: beat every 6 frames, amplitude 37 %. Vote: 3-frame dip → sword raised beside the head (hand outside the head
   outline: blade clear at 7/8 facings, hidden only at NE), held 0.8 s. Die: down in 17 frames, legs folded low and
   splayed in the hold (r2: upright boots read as horns at N/NE/NW). Oath: salute (hand out at the side, blade clears the
   face at S/SE) 10 · (t2) pledge 10 · bowed tear 16. Point (t2): fist out beside the body at S/SE, 30 % pose_read held 8. Ghost: pale + halo + fading tail, 2-texel bob. Run: same leap, 0.46·H.

## Proportions (vh 10, 36 px/m)
| | m | texels |
|---|---|---|
| top of eye domes | ≈ 1.2 | 40 (S) – 48 (E) measured (`height_px`) |
| head (jaw bottom → dome top) | ≈ 0.48, width 0.78, depth 0.67 | 17 tall, 28 wide |
| head raised on the neck | +0.08 (HEAD_UP) | steel chest visible under the jaw at S |
| torso (thigh → shoulder) | 0.24, width 0.38 | 9 |
| leg (hip → ankle) | 0.33 | 12 |
| sword blade | 0.30 × 0.115, dark fuller as an edge line | 11 × 4 |
| shield | Ø 0.35 | 13 |

## Palette (5 slots + accent)
skin `#92F2D4 / #4FC6A2 / #5E7C9C` · cape `#F27A78 / #C83E4A / #7A2E4E` · steel `#B8C8EA / #7488BA / #4C507E` ·
cream `#FFF4D6 / #EAD3A2 / #A68E86` · dark `#946E5C / #634640 / #4C3834` · accent brass `#FFE596 / #D9A94A / #8E6848`.
Signature `['skin', 'cape']`, faceSlot skin. Torso = ONE steel plate + ONE brass belt (r3: gorget removed). Measured r3:
sig_ground noon-sun dH 33, noon-shade dL +21 %, golden-sun dH 31, golden-shade dL +23 % (all PASS).

## Timing charts (30 Hz grid; step interp)
- idle (loop 72): f0 breathe A · f30 B · f36 C · f54 blink (2) · f56 C · f66 B.
- talk (loop 24): f0 head −12 jaw 28 sword hand up (`speak`) · f6 head +14 jaw 0 · f12 head −10 jaw 26 · f18 head +14 jaw 4.
- vote: f0 dip (pos −0.05, hand pitched HF 65) 3 · f3 upperArmR [10, 0, 122], handR [25, 0, −72] (blade upright beside
  the head), eyes wide, jaw 16, `vote@handR` · held (repeat f30).
- die (legs fk, t2): f0 sigh (head 18, eyes half) (8) · f8 knees buckle (6) · f14 sit back (6) · f20 lie back, legs
  half-folded, cape1 40, `die` (4) · f24 hold: thighs [40, 0, 38], shins −112, feet 30, cape1 40, jaw 0 → repeat f60.
- oath (t2): f0 coil (5) · f5 SALUTE upperArmR [20, 0, 100], forearmR 40, handR [60, 0, −60], `sparkle@weapon` (10) ·
  f15 PLEDGE upperArmR [30, 0, 12], forearmR 105 (10) · f25 bowed, eyes half-shut, `emote:drop@crown` (24) · f49 idle.
- point (t2): f0 wind-up (4) · f4 POINT upperArmR [24, 0, 72], handR [−90, 90, 0], jaw 18 (12) · f16 beat (8) · f24 point (12) · f36 idle.
- ghost / ghost-spent (ghost port, loop 72, hold): pos y = bob [0, 0.028, 0.056, 0.028] (spent: −0.028 + [0, 0.028,
  0.028, 0]) at f 0/18/36/54 on top of the module hover 0.14 m (FK floating legs, knees 16/−26); halo + ramps from
  `spec.ghost`. (t2 was pos 0.32 + `ghostFlag.s` + `halo.p`.)
- walk/run (LegGait hop): cycle [0.3, 0.267] s, 4 drawings, duty [0.25, 0.2], hop [0.38, 0.46]·H, lift [0.05, 0.06] m.
- turn: 45° steps held 2 grid frames, then recovery hops (turn.foot_slide 4.33, unchanged).

## Lights
None (no lantern).

## Self-critique (Stage 7, r3)
Evidence (all rendered on render-host, RTX 4090): full pack `--preset cast --raw` (60 pass / 20 warn / 2 fail),
`self/r3-turnaround-x2.png` (8 facings + 25 % silhouettes), `self/r3-keys-x4.png` (talk f0, vote f3, oath f5, oath f15 with
FX, die hold — 8 facings each), 1x GIF frame sheets `self/r3-{game,idle,talk,vote,die,oath}-1x-sheet.png`, bake
`out/sprites/frog-preview.png` (no border warnings at the final cell).

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | wide trapezoid head, two domes inside the cheeks at S/N; E/W snout + mouth slit (`r3-turnaround-x2.png`) | E/W head still about as tall as deep |
| 2 | Pixel stability | 1 | idle/talk/vote/die/oath off_grid + flicker 0, deterministic PASS; run FAIL 40 / 21754 (LegGait, motion) | plantable 2v run |
| 3 | Line quality | 2 | silhouette_line 0/1148, inner_lines 611; mouth band follows the head outline | mouth band 1 px on the diagonals at S |
| 4 | Tonal discipline | 1 | **isolated_px skin max 15 (SW), sig.skin iso ≤ 18 — worse than r2 (8)**; key_speckle die +17 (r2 +35), oath +13 (r2 +20), vote +28 (r2 +18) | close the jaw-side / mouth-band seam specks |
| 5 | Ground separation | 2 | sig_ground 4/4 PASS (noon dH 33, golden dH 31) | — |
| 6 | Proportion / expression | 2 | frog face reads at S (v1 smile, cream chin inside the outline), talk croak + tongue at S/SE/SW, head wider than tall | profile talk is small at E/W |
| 7 | Animation timing | 2 | single_frame 0, strobe 1 everywhere, hold_redraws 0, flash 2 frames | — |
| 8 | Weight / contact / game speed | 2 | game.readable 3.95 H/s 0.289 s 1.14 H 4/4; apex drawing 8–12 px above stand at 1x with tucked boots | 2v run (motion) |
| 9 | Personality / secondary | 1 | cape 2-link + die fold, jaw/eyes keyed; arms still rigid in the gait (motion backlog) | arm swing in the hop |
| 10 | Smears and FX | 2 | sweep crescent at 6+ facings, glint, tear, sparkles, wisp, dust | — |
| 11 | Facing and turns | 2 | 8/8 facings read; turn strip unchanged | — |
| 12 | Technical | 2 | page_errors 0, draw calls 2/1, RTX 4090; presence WARN 143 % (bar 140 %: the wide head) | — |

Weakest three: (1) skin isolated px / vote key speckle rose with the wider hull skull, (2) the run FAILs (LegGait),
(3) presence 143 % (the head is meant to be wide).
