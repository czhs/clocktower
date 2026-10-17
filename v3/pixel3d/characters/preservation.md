# Preservation (cast `preservation`) — design sheet

"A blue frog who never changes type." (15-312 mascot; twin of `progress`.) Spec: `characters/preservation.js`. Pack:
`shots/char-preservation/` (game clips idle walk talk vote point die ghost ghost-spent + emote invariant; run optional). Identity source (read only): `pipgws/packages/assets/scripts/cast/preservation.ts` +
`lib-c-frog.ts`, `refs/cast/preservation.png`. Everything rendered on render-host (RTX 4090).

## 0. Brief (written before modelling)
- Concept: a small, chubby, un-armoured blue frog in a yellow knit scarf and round glasses, calm smile, who is exactly the
  same before and after every step — the type-preservation theorem as a mascot. Adjectives: **calm, precise, steadfast
  (stiff)** → personality body f 2 ζ 1 r 0, head f 2 ζ 1 r 0 (no overshoot: nothing about him wobbles); holds long and
  clean; the only springy things are the two scarf ends.
- Body plan: **upright chibi / hopper** (`chibi({ height 1.2, heads 2.2, legs 0.55, arms 0.75, snout 0 })`, head and arms
  lowered so the chin sits at ≈ 0.575 m like the v1 sprite), `spec.bodyPlan 'hopper'`, LegGait `plan: 'hop'` with the hind
  legs only (frog r3 lesson: `legs: { HL, HR }`).
- Game-speed arithmetic: H 1.12 m (v2 28 px → castHeight 1.12, ≈ 40 texels), v_game = 3.95·H = 4.42 m/s, run 2·v.
  Leg (hip → ankle) ≈ 0.30 m = 0.27 H → stepping duty bound 2·0.6·0.27/1.18 ≈ 0.27 and a 1.33 m cycle cannot be
  stepped with planted feet over 2 drawings: the gait is **one two-footed hop per cycle** (cycleTime 0.3 s → C 1.33 m =
  1.18 H, N 4 drawings × 2–3 grid frames, duty 0.25 = the touchdown drawing). Hop arc 0.28·H (apex ≈ 11 texels, rise/
  fall ≈ 5.6) — clearly airborne (≥ 4–6 rule) but lower than the knight frog (0.38 H) and lower than progress should be.
- Identity (ref facing): (1) blob = a wide head with two eye bumps on top over a round pear body with haunch bulges at
  the bottom (S, SE, N); (2) palette: mid blue `#5A8CC8` skin + pale `#D8E6EE` belly + yellow `#E2B844` scarf; (3) no
  hand prop in v1 — the scarf's hanging end is on his LEFT front (viewer right at S), knot + ends at the back (N);
  (4) face: round dark-rimmed glasses over 3×2 white eyes with a bridge between them, temple arm at E/W, 1-px pink
  cheeks, calm wide smile with the corners up; (5) v2 motion: a 1-px bob, arms swing 1 px, scarf end flips at E/W.
- Distinct from the knight frog (mint skin, red cape, armour, sword/shield) and the toad (olive, satchel, waistcoat):
  no clothes but the scarf, round pear body, blue, glasses.

## Unique to me (r2: re-checked after the critic's 15/24)
1. **Extra animated parts.**
   - Scarf FRONT end = 1-link spring chain `scarf` (bone `scarf0`, chest, on his left front at x 0.235, rest axis
     [0.9, −1, 0.3]): hangs OUT past the body edge at S/SE (breaks the 25 % box, `z-sil-lineup-S.png`), swings up on
     every landing, flips at E/W. Tucked (scale 0) once he lies down in `die` (it was a brown blob under the body).
   - Scarf BACK knot end = 1-link chain `knot` (bone `knot0`, `noForward`): the N/NE/NW rhythm; also tucked in the die hold.
   - Glasses: two dark RINGS (12 segments) on the head bone, **toed out 30°** (frog eyes) so the near ring reads as a ring
     at E/W; short temples; bridge. Eye whites + a **1 × 2 texel centred pupil** (was a 2 × 2 disc that re-rasterised into
     letter glyphs) on `eyeL/R` blink inside the rims. Lens slot lift 0.8 + `whiteKeep` 0.7 (whites stay white when the
     head rolls away in talk f6 and at golden).
   - Pale **finger pads** (belly slot) on both hands: the glasses-push and the talk hand read against the blue face.
   - Jaw (back hinge) for talk; blink = `eyeL/R.s`.
   - **τ slab** (vote prop): bone `sign` under `handR`, authored at 4 % and shown by `sign.s` only in the vote. Knit-yellow
     handle 0.24 m + a thick cream slab 0.30 × 0.27 × 0.17 m with one big upright τ (bar, stem, curled foot) on front and
     back. The raise key scales the upper arm ×1.6 so the short chibi arm lifts the slab past the crown; hand roll −22
     keeps it upright, twist −30 turns its face to the SE pack facing. No blade shape at any facing (`g8-vote-f20.png`).
   - FX: speech bubble (talk), vote sparkles on the raise key, step dust on landings, die dust ring + soul wisp on the
     impact key, `emote:star` ON the right lens (socket `glasses` 0.30 m under the lens: fx glyphs draw ≈ 0.16 m +
     5 texels above their node).
2. **My locomotion: a metronomic two-footed HOP** ("never changes type"): every hop identical, body upright and rigid
   (walk clip keys hips/spine/chest/head 0), the hop arc is KEYED in whole screen texels (`pos` y −3 / +5 / +10 / +5
   texels × 0.0321 m, so the face re-rasterises identically every drawing), the legs FOLD in the touchdown drawing and
   EXTEND below the body in rise/apex (`lift` −0.07: the swing feet sit under the stand height, so IK straightens the
   leg; body bottom raised to 0.17 m so 5–6 texels of shin + foot show at E/W), arms lift 42–62° symmetrically, scarf ends
   flap. V 4.42 m/s, cycleTime 0.3, duty 0.25, poses 4, `plant: 'hold'`. Measured 3.95 H/s, 0.289 s, 1.14 H, 4/4
   drawings (`clip-game.png`, `game-onion.png`, `r2/w2d2/z-game.png` dir 2).
3. **Expressions in the new style.** Ring glasses + 1 × 2 pupil (steady across idle keys and hop drawings:
   `clip-idle.png`, `z-cgame1x.png`), wide smile running to the snout corners, pink cheeks, jaw 22–26° in talk with a
   head roll, vote = eyes a little wider + jaw 12, die = eyes shut, emote = paw pads across the right lens (8 frames) →
   star glint on that lens → perfectly still.
4. **Game-speed readability (judged at 1×).** Walk: `z-cgame1x.png` — low folded touchdown, legs hanging down at rise/apex,
   detached shadow, arms out: "hop". Talk: `clip-talk.png` beat every 6 frames. Vote: `z-vote1x.png` dip → τ slab up beside
   the head on a yellow handle, held 1.7 s. Die: 4-key plank topple, now rolled 38° so the body lies diagonally
   (`r2/die-ab.png`). Emote: `z-inv1x.png` stop-motion spin → identical landing → glasses push → star on the lens.

## Proportions (vh 10, 36 px/m) — as built (r2)
| | m | texels |
|---|---|---|
| height (eye-bump / rim tops) | ≈ 1.15 | 36 (S) – 41 (E/W), `height_px` PASS |
| head: chin (0.605) → bump tops | 0.55 tall, 0.69 wide, 0.70 deep (snout +0.06, occiput to −0.30) | 20 tall, 25 wide |
| eye bumps | r 0.13 at ±0.19, centre 0.43 above the chin, z 0.11 (forward on the crown) | notch 2–3 texels at S/N |
| glasses rim | ring r 0.092, radial 0.044, toed out 30°, tilted 26° | ring ≈ 1.5 texels, lens 4 × 4 |
| body (pear) | 0.55 wide × 0.42 tall × 0.47 deep, centre 0.38 (bottom 0.17) | 20 wide |
| leg hip → ankle | 0.30 (= 0.27 H); shin 0.062 thick | 11 |
| scarf band | Ø 0.54 × 0.10 at 0.515, 0.03 forward; front end 0.10 × 0.22 hanging out, knot end 0.12 × 0.17 | 3 tall |
| τ slab (vote only) | handle 0.24 × 0.07, slab 0.30 × 0.27 × 0.17 | slab 11 × 10 |

## Palette (5 slots + accent) — unchanged
skin `#8CB8EC / #5A8CC8 / #6474B8` · belly `#EEF2F0 / #CCDCE8 / #968EB4` (also finger pads) · scarf `#FFE48A / #E2B844 /
#A0703E` (also the vote handle) · dark `#6E5A62 / #47363E / #3A2E3A` · lens `#FFF8EA / #ECE2D0 / #ACA2AC` (lift 0.8) ·
accent blush `#F6B0B0 / #E2909A / #B06A80`. sig_ground 4/4 PASS (noon dH 146, golden dH 167, shade +18 / +21 %).

## Timing charts (30 Hz grid; step interp; as built r2)
- idle (loop 72, hold): f0 A (pos −0.01) · f30 B (rigid 1-screen-texel drop, arms +4°) · f54 blink 2 · f56 B. No chest/head
  rotation (the glasses never re-rasterise).
- walk = LegGait 'hop' legs + `clips.walk` (length 4): f0 touchdown pos −3 tx, arms 4° · f1 rise +5 tx, arms 42° · f2 apex
  +10 tx, arms 62° · f3 fall +5 tx, arms 36°. `lift` −0.07 (legs extend in flight), hop 10 tx. 0.289 s / 1.14 H.
- run: same hop (0.36 H, lift +0.05), hips +4°, arms back (optional; the game has one speed).
- talk (loop 24): unchanged (f0 jaw 24 + roll + hand presents · f6 rest · f12 · f18).
- vote: f0 dip (3) · f3 arm UP [188, 0, 20] ×1.6, hand [0, −30, −22], `sign.s` 1/(0.04·1.6) − 1, eyes wider, jaw 12,
  `vote@handR` · held to f30.
- die (legs fk): f0 stiffen (6) · f6 tip 25° (5) · f11 60° (3) · f14 flat, rolled −38°, `die`+`land`, scarf tucked (2) ·
  f16 bounce 84° (4) · f20 settle, chin tucked · held to f60.
- invariant: f0 crouch (4) · f4/6/8 spin 90/180/270 (2 each) · f10 land (4) · f14 paw ×1.9 [135, 0, −11] across the right
  lens, head [8, 0, −12] (8) · f22 still, chin up, `emote:star@glasses` (20) · f42 idle.

- point (t1, one-shot, 38 f): f0 wind (4, pos −1 texel, both forearms coiled) · f4 POINT (12): right paw [115, 0, 26]
  `.l` 1.3/1.3 forward-UP along the facing + left paw forward-low [70, 0, 34] `.l` 0.8, eyes a touch wider, jaw 8 ·
  f16 the precise correction (16): pointer re-aimed [109, 0, 24] (≈ 1 texel at the paw), jaw shut, chin −3 · f32 lower
  (6) · f38 idle. Hold 28 f (0.93 s). No head twist on any key (twist re-rasterised the pupils into glyphs).
- ghost (t1, loop 72, `spec.ghost { hover 0.14, keepHue 0.3, spent [#3A4260, #B0BACE] }`): 4 keys every 18 f, RIGID
  whole-texel bob +1/0/−1/0 (`pos` y in TX_Y steps, never a wobble: "never changes type", even dead), head roll ±3, paws
  out 22/28 alternating, webbed feet hanging toes-down, blink on key 2; the module adds the pale ramp, gold halo, hover,
  float legs and the bind-height dissolve.
- ghost-spent (t1, loop 72): same keys 2 texels lower, half the bob, spine 5 / chest 6 / head bowed 8 (14 hid the glasses:
  the bowed head read as a one-eyed slate blob), eyes half shut, paws hanging. No halo (module).

## Close-out t1 (2026-10-17): point + ghost + ghost-spent added
All on render-host RTX 4090, looked at. Pack `tools/charpack.sh preservation --preset cast` → `report.txt`:
**115 pass / 18 warn / 0 fail, `cast_clips PASS all`**, page_errors 0; every point / ghost / ghost-spent row PASS
(point pose_read 12 % held 12, key_speckle +1..+2, strobe 1; ghost amplitude 30 %, spent 9 %; off_grid / flicker 0).
The 18 WARNs are the r2 ones (speckle, isolated px, vote/die key_speckle, walk/run/game foot_slide n/a on a hop, turn
foot_slide 4.84, prop_area τ edge-on). Bake: `tools/charpack.sh --bake preservation --preset cast --game 1` → 10 clips × 8
dirs, cell 80×78 (auto-raised from 62: die/vote touched the border), point 5 / ghost 4 / ghost-spent 4 frames; copy in
`bake/`, preview crops `t1/bk-point.png`, `t1/bk-ghost.png`.
- **point reads at 8/8**: silhouette diff vs idle (`t1/final/sil-hold.png`, `sil-nudge.png`, bg=key, pres_sil.py.js):
  an arm ≥ 8 texels outside the outline at S, SE, SW, W (and E, NE, N, NW). Search `t1/sw1`–`sw4` (`st.png` each): one
  right arm alone never left the wide-head outline at S/SE (`sw1`, `sw3`: forward-up is end-on under the 25-texel head;
  a chest twist did not help); two symmetric arms = a "ta-da" T at S (`sw2`); the asymmetric pointer + forward-low paw
  (`sw4` d3) is the pick. A glasses-push with the free hand (in character) hid the only SE arm (`sw3` c2–c5): dropped.
- **ghost / spent**: `t1/final/g8.png` (point + ghost + spent at noon / golden / night, 8 facings ×2); tone A/B
  `t1/gh2/st.png` (v1 module default spent = murky slate at noon; v4 = keepHue 0.3 + lifted spent ramp, chosen).
- **1× real time**: `clip-point-1x.gif`, `clip-ghost-1x.gif`, `clip-ghost-spent-1x.gif`, frame sheets with durations
  `t1/gs-all.png` (point: wind 130 ms → point 400 → correction 540 → lower 200; ghost 600 ms per drawing).
- Unchanged clips re-rendered identical in read (turnaround, vote, die, invariant, game walk looked at).
- Weak: at S the pointer is necessarily sideways (the target is the viewer; an arm toward the camera is end-on);
  the arms are 2 texels thick, so the long pointer is a thin stick at 1×; the ghost arms barely show at SE.

## Lights
None.

## Self-critique (r2, after the critic's 15/24)
Evidence (all render-host RTX 4090): pack `shots/char-preservation/report.txt` (`--preset cast --raw`: 83 pass / 21 warn /
0 fail, page_errors 0); 8-facing stills `r2/f-z.png` (idle head), `r2/g-vote2-z.png` + `r2/vh-z2.png` (vote, vh4 =
shipped), `r2/die-ab.png` (die roll A/B, bottom = shipped), `r2/p5-z.png` (glasses push), `r2/i-z.png` (star on the lens);
1× sheets `z-vote1x.png`, `z-cgame1x.png`, `z-turn1x.png`, `r2/z-inv1x.png`, `r2/z-die1x.png`; dir-2 game `r2/w2d2/`;
`z-sil-lineup-S.png` (vs progress, toad, frog at 25 %); bake `shots/char-preservation/bake/` → `out/sprites/preservation*`.

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | E/W: bump + ring on the crown front, snout, deep occiput (`turnaround.png`); S: head wider than body, scarf end out past the edge, legs apart (`z-sil-lineup-S.png`) | E/W far bump still adds height (41 px vs 36) |
| 2 | Pixel stability | 2 | idle/talk/vote/die/invariant off_grid 0, flicker 0; walk/game upper 0 (legs only WARN); pan/night_pan 0 | — |
| 3 | Line quality | 1 | speckle 42, vote key_speckle +17 (slab glyph edges), die +12; dark stick gone | fewer arm/leg junction specks |
| 4 | Tonal discipline | 1 | skin isolated 5–19 per facing (`turnaround-isolated.png`: arm/haunch junctions); N back now smooth 12-sided; lens whites white in talk f6 | merge or re-shape the arm/haunch junctions |
| 5 | Ground separation | 2 | sig_ground 4/4 PASS | — |
| 6 | Proportion / expression | 2 | 1 × 2 pupils steady; E face = ring + cheek + smile corner; die reads as lying at 6/8 | — |
| 7 | Animation timing | 2 | vote slab reads at S/SE/E/N/NW (`r2/vh-z2.png` bottom), never an axe at 1× (`z-vote1x.png`); stepped, strobe ≤ 1 | τ at W/NE/SW is an edge-on slab |
| 8 | Weight / contact / game speed | 2 | 3.95 H/s, 0.289 s, 1.14 H, 4/4; legs fold at touchdown and hang 4–6 texels below the body at rise/apex (dir 1 + dir 2) | — |
| 9 | Personality / secondary | 2 | metronome hop, glasses push (pads across the lens), star on the lens, τ slab "same type from front and back" | — |
| 10 | Smears / FX | 1 | star on the lens, sparkles on the raise key, die dust/wisp; talk bubble gap is a shared fx issue | fx.speech.chain fix (module) |
| 11 | Facing / turns | 1 | 45° steps held; E/W identity restored; turn.foot_slide 4.84 WARN (idle re-step, module) | — |
| 12 | Technical | 2 | page_errors 0, draw calls 2/1, deterministic, night_freeze 0 | — |

**Total 20 / 24 (self, judged at all 8 facings + 1×).** Weakest: skin isolated px at limb junctions; the slab is edge-on
at W/NE/SW; the E/W head is still taller than the S head because the far eye bump projects above the near one.
