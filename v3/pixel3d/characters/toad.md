# Toadley (cast `toad`) — design sheet

"Merchant of fine goods and finer excuses." Spec: `characters/toad.js`. Pack: `shots/char-toad/` (r1, `--preset cast --raw`),
bake `shots/char-toad/bake/` → `out/sprites/toad*`. Identity source (read only): `pipgws/packages/assets/scripts/cast/toad.ts`,
`refs/cast/toad.png`. Everything rendered on render-host (RTX 4090, report.txt GPU line).

## Ghost port (2026-10-17) — shared `spec.ghost` (supersedes the t2 ghost recipe below)
- **Why:** the t2 ghost (`ghostFlag`/`halo` bones + `material.tones` shader) only existed inside the ghost clips, so a
  dead player walking as Toadley looked alive until he stopped. `spec.ghost` + `ch.ghost = 1` now shade walk/talk/emotes.
- **Spec:** `ghost: { hover: 0.14, keepHue: 0.25, lo: 0, slope: 1.6, spent: ['#3A4260', '#B0BACE'], halo: { lift: 0.2 } }`.
  keepHue 0.25 (dark olive character) keeps a sage tint; lo 0 / slope 1.6 lift the dark olive up the pale ramp (defaults
  gave a grey-olive ghost and a dark slate spent toad: `shots/ghost-port/toad/z-g8.png` vs `z-g8-b.png`); halo lift 0.2:
  at 0.12 the ring rested on the far eye bump (`pack-r1-clip-ghost.png`, islands 1 → 1) — now 2 → 2. Removed: `ghostFlag`
  + `halo` bones, the 8-box halo parts, `GHOST` / `ghostMaterial()`, `HALO_*`, the `three` import.
- **Clips (pose only, `dynamics: 'hold'`):** ghost f 0/18/36/54: `pos` bob [0, 0.028, 0.056, 0.028] over the module's
  0.14 m hover (FK floating legs, knees 16 / −26 / feet 28), chest −4, head −6, eyes −0.2 (half-lidded), arms drifting out.
  ghost-spent: 1 texel lower, bob [0, 0.028, 0.028, 0], chest +6, head +7 with roll [3, 0, −3, 0], eyes −0.6.
- **Checks (render-host):** pack `shots/ghost-port/toad/pack/` 115 pass / 15 warn / 0 fail (= before); ghost amplitude 27 %,
  key_delta 55 %, off_grid 0, flicker 0, islands 2 → 2; spent amplitude 12 %, key_delta 14 %. Living renders: 0 / 2395 raw
  frames differ vs the pre-port pack. Demo walking ghost (`?char=toad`, key 5, D held): level 1 while moving, pale at
  noon and night (`shots/ghost-port/toad/walking-ghost-{noon,night}.png`). The t2 ghost notes below are historical.

## Touch-up t2 (2026-10-16, Clocktower clip list) — point / ghost / ghost-spent
Rendered on render-host (RTX 4090). Evidence `shots/char-toad/t2/`. Full cast pack re-rendered (`--preset cast --raw`,
`shots/char-toad/report.txt`: 85 pass / 19 warn / 0 fail) + new-clip pack `t2/pack/report.txt` (point/ghost/ghost-spent:
32 pass / 3 warn (game rows) / 0 fail). Bake: 10 clips × 8 dirs → `out/sprites/toad*` (copy in `bake/`), 0 warnings.
- **De-combat audit:** nothing to change. The toad never had a weapon, smear, `hit` or `hurt` event: die is the gentle
  sit-down-and-tip-back (dust + soul wisp only), the emote `excuse` is a shrug + wink + sweat drop.
- **No living render changed:** ghost bones `ghostFlag` (hips) and `halo` (head) are appended LAST; 8-facing stills of
  idle/talk/vote/die/excuse before vs after: 0 px differ each (`t2/base-*.png` vs `t2/after-*.png`).
- **point** (one-shot, 84 frames ≈ 2.8 s + return): f0 wind-up, hand drawn to the chest (4) · f4 POINT upperArmR
  [60, 0, 75] with chest −20 / head +12 (counter-turned to the camera), mouth open + throat puff, eyes a touch wider,
  left hand on the belly (12) · f16 emphasis: 1 texel forward, chest −27, arm out 80 (8) · f24 held point (60) · f84 idle.
  Arm chosen from a 6-pose probe (`t2/zz-probe-z.png`, variant `shots/char-toad/toad_probe.js`): fwd 70 / out 50 hid
  behind the wide head at S/SE; this one is a level cream stroke past the cheek at S and SE (`t2/bake-point.png`,
  `t2/sheet-point-1x.png`: 6 drawings, 2.0 s hold). charcheck point: pose_read 20 % (x12), key_speckle +3, strobe 1, all PASS.
  Limit: at SE the stroke goes screen-left (his right), not along the facing — a forward arm points at the camera and vanishes.
- **ghost** (loop 72, 4 drawings × 18 frames): hovers pos +0.30 m (+ 2-texel bob), pale-blue luminance re-map of every
  tone (face, smile, vest/belt steps keep their order), gold halo ring (r 0.15) over the eye bumps, eyes half-lidded,
  arms drifting out, 2×2 dither fade 1/4 → 1/2 → 3/4 below the belly (bind y 0.50 / 0.38 / 0.24) = the v1 fading tail;
  bake keys the holes to alpha 0 (`t2/bake-ghosts.png`). Faint self-glow at dusk/night (`t2/zz-ghost8.png` rows noon /
  night / golden). charcheck: amplitude 29 %, off_grid 0, flicker 0, islands 2 (= halo).
- **ghost-spent** (loop 72): same hover, dimmer grey-blue ramp, NO halo, head bowed 7° (14° hid the eyes at SE), eyes
  nearly shut, half the bob (`t2/sheet-ghost-spent-1x.png`, `t2/bake-spent.png`); amplitude 9 %, all PASS.
- **Module-fix re-check (M1–M8):** game walk at 3.95 H/s still reads as the waddle (`clip-game.png`, `game-onion.png`,
  `t2/zz-walk8.png` = the 4 gait drawings at 8 facings): boots and toe caps below the vest at every facing, no hem to clear,
  satchel stays above the sole line; game.readable PASS 1.18 H/cycle, walk flicker 505 → 79 (legs), off_grid 25 → 1.

## 0. Brief
- Concept: a squat, portly toad shopkeeper in a cream shirt and dark-green waistcoat, satchel of goods on his right hip,
  who waddles everywhere and has an excuse for everything. Adjectives: **sly, portly, unflappable** → personality body
  f 3 ζ 0.6 r −0.5 (small late anticipations), head f 3 ζ 0.7 r 0; lingering hold on the punchline (wink 10 frames).
- Body plan: **upright chibi** (`chibi({ height 1.12, heads 2.3, legs 0.7, arms 0.85, snout 0, shoulders 0.5, hips 0.2 })`,
  head sunk −0.03 → raised so the vest shows under the jaw), `spec.bodyPlan 'uprightAnimal'`, heightPx [34, 44].
- Game-speed arithmetic: H 1.05 m (v2 26 px), v_game = 3.95·H = 4.15 m/s, run 8.3 m/s. Leg 0.286 m = 0.27 H → stepping
  duty bound 2·0.6·0.27/1.15 ≈ 0.28: needs flight or one planted drawing per step. Gait: **LegGait plan 'biped' with
  style 'bird' = WADDLE**: N 4 drawings × 2–3 grid frames, cycleTime 0.3 s (measured 0.289 s, 1.14 H/cycle), duty 0.25
  (one planted touchdown drawing per foot, re-pinned per frame by legIK 'plant'), roll 10°/8°, headBob 8°, lean 6/12,
  lift 0.06/0.08 m, `surge: false`.
- Identity (ref facing): (1) blob = very wide round head with two small eye bumps on top, short body, satchel bump on
  the right (S, N); (2) palette: olive/brown skin + cream shirt + dark-green waistcoat + brown satchel; (3) satchel on
  the RIGHT hip, strap from the left shoulder, scroll poking out; (4) face: heavy-lidded golden eyes with horizontal
  pupils on the bumps, wide smile, pale throat; (5) v2 motion: arms swing, satchel rides.

## Unique to me
(re-checked after the r2 fixes; evidence = r2 renders, all on render-host RTX 4090)
0. **Toad identity (r2).** Low flat crown + two PROUD eye bumps (`eyeBumpL/R`, head bone, r 0.105, centre y 0.30) that
   stand ≈ 2.5 texels above the crown's back rim in the 30° projection → two bumps and a notch at S/SE/SW/N
   (`turnaround-silhouette.png`), olive skin, five warts (`wart0-4`, r 0.045 skin knobs: their under-facets are the dark
   wart dots). The frog has a flat receding skull and a cape; the toad has the bumpy crown, satchel and waistcoat.
1. **Extra animated parts.**
   - Satchel = 1-link spring chain `bag` on bone `bagR0` (hips, [−0.285, 0.02, −0.04]): f 3.5, ζ 0.6, r 0, gravity 0.5,
     drag 0.8, limit 20° (r1: 0.9 / 35° swung the bag 3 texels under the soles at E and flipped it into a diamond). Bag
     hangs 0.085 (was 0.13). `dir2/g60-x3.png`: bag stays at the near boot's level, no flips; it still swings with the roll.
   - Scroll prop: the bag's scroll (`bagScrollR`, own bone) and a hand scroll (`scroll` on handR, authored at 4 % size
     inside the fist): r2 a fat bill Ø 0.15 × 0.74 m. Vote shows it (`scroll.s` 24) and hides the bag scroll → "he pulls a
     bill out of the satchel and holds it up". Top above the crown (`r2/g8-vote-f10-x4.png`): S 14, SE 7, E 4, NE 7, N 12,
     NW 9, W 13, SW 12 texels (E: the arm rises behind the head side).
   - Jaw (r2 hinge z −0.05, 0.03 forward; cheeks 0.70 wide, flush with the skull = fewer seam specks): open 26–28° in
     talk + `jaw.s` throat PUFF; the open mouth and cream throat now read at the SE pack facing (`clip-talk.png` f0/f12).
   - Eyes: keyed `eyeL/R.s` (blink in idle, slightly wider slot in vote 0.08/0.15, near-eye wink in the emote, shut in die).
   - FX: speech bubble (talk), vote sparkles (`vote@handR`), sweat drop `emote:drop@crown` fired ON the wink key (f15),
     die dust ring + soul wisp at the settle key (f20), step dust every 2nd footfall.
2. **My locomotion: a WADDLE** (the frog leaps two-footed; the toad rocks). Legs alternate, the whole body rolls 10° onto
   the planted foot and yaws toward it, head thrusts on each touchdown, arms flap 6–12°. 4/4 drawings per 0.289 s cycle at
   3.95 H/s (`game.readable` PASS, holds 2–3). r2 adds leather toe caps (`toeCap`) so the stepping feet read at 1×
   (`clip-game.png`, `game-onion.png`). Contact: still no foot planted for 2 drawings (`foot_slide` n/a); since the module fixes
   (M2/M3) the legs are a clean sprite cycle (t2 pack: walk flicker 79, off_grid 1, legs only; was 505 / 25).
3. **Expressions.** Eyes: gold slot 0.14 × 0.095 m on the lower front of each proud bump (the bump above it is the lid),
   tilted 24° up and yawed 14° out (shows at E/W), dark horizontal pupil 0.075 × 0.035. Smile: dark band on the skull front
   only (ends at x ±0.285, corners up). Talk = jaw + throat puff + head roll; vote = slot a touch wider + jaw 14°;
   excuse punchline = head turned toward the viewer, grin (jaw 20 + puff), near eye (eyeR) shut, right hand up beside the
   head palm out, left hand on the belly; die = eyes shut, chin tucked toward the camera.
4. **Game-speed readability.** Walk: body roll + satchel swing + head thrust + toe caps ("waddle"; `clip-game.png`,
   `game-onion.png`, `game-x3.gif` frame; Read shows one GIF frame, so the real-time read is inferred from the strips).
   Talk: beat every 6 frames, amplitude 22 %. Vote: 3-frame dip → bill up, held 1.1 s (20 % off idle). Excuse: wind-up 5 →
   shrug 10 → punchline 12 (pose_read 34 %) → half shrug 6 → idle. Die: back by f17, settle f20, held (78 % off idle).

## Proportions (vh 10, 36 px/m)
| | m | texels |
|---|---|---|
| height (eye-bump tops) | ≈ 1.05 | 34 (S) – 39 (NE/NW), `height_px` |
| head (jaw bottom → dome) | ≈ 0.47, width 0.67, depth 0.52 | 17 tall, 24 wide |
| torso vest barrel | 0.50 wide × 0.38 deep | 18 wide |
| leg (hip → ankle) | 0.29 | 10 |
| satchel | 0.11 × 0.17 × 0.24 | 4 × 6 × 9 |
| vote scroll | 0.50 × Ø 0.11 | 18 × 4 |

## Palette (5 slots + accent)
skin `#8E9446 / #666E36 / #3E4634` (r2: back to the v1 OLIVE hue; ground separation by VALUE — hi renders −28 % L under lit
grass at noon and golden, sh −28/−30 % under shaded grass; A/B `r2pA` (chosen) vs `r2pB` (#969C4A, −25 % WARN). The r1 tan
re-hue passed sig_ground but read as a mushroom/bread loaf) · cream
`#FFF4D8 / #E6D8B4 / #A8968E` · vest `#62967A / #3C6852 / #3C3C50` · leather `#D49A5C / #9A6236 / #5E4044` · dark
`#8A6450 / #5A3E30 / #423040` · accent brass `#FFE596 / #D9A94A / #8E6848`. Signature `['skin', 'cream']`, faceSlot skin.
Measured r2: sig_ground noon-sun dL −28 %, noon-shade −28 %, golden-sun −28 %, golden-shade −30 % (4/4 PASS).

## Timing charts (30 Hz grid; step interp)
- idle (loop 72): f0 breathe A · f30 B · f36 C · f52 blink (4) · f56 C · f66 B.
- talk (loop 24, `speak` f0): f0 head roll +10, jaw 28 + puff, hand presents · f6 head roll −12, jaw 0, pos −0.028 ·
  f12 roll +10, jaw 26 + puff · f18 roll −12, jaw 4.
- vote: f0 dip, hand back to the satchel (3) · f3 upperArmR [−15, 0, 135], handR [0, 0, 28] (up AND out past the head
  side), bill shown, eyes 0.08/0.15, jaw 14, `vote@handR` · held (repeat f30).
- die (legs fk, no hurt): f0 totter, eyes half (6) · f6 sits down heavily (6) · f12 tipping BACK, hips −42 (5) · f17 on
  his back, hips −86, boots up (3) · f20 settle, chin tucked (head +34), `die` FX (4) · f24 hold (repeat f60).
- excuse: f0 wind-up (5) · f5 shrug, arms out 56°, palms up, head level (10) · f15 PUNCHLINE: body dips + twists −14,
  head −18 twist toward the viewer, grin, eyeR wink, right hand up palm out, left on belly, drop glyph f15 (12) · f27 half
  shrug (6) · f33 idle.
- point (t2): f0 wind-up (4) · f4 POINT arm [60, 0, 75], jaw 20 + puff (12) · f16 emphasis, chest −27, arm out 80 (8) ·
  f24 POINT held (60) · f84 idle.
- ghost / ghost-spent (ghost port, loop 72, hold): pos y = bob [0, 0.028, 0.056, 0.028] (spent −0.028 + [0, 0.028,
  0.028, 0]) at f 0/18/36/54 over the module hover 0.14 m; head −6 / +7 (spent roll ±3); ramps + halo (lift 0.2) from
  `spec.ghost`. (t2 was pos 0.30 + `ghostFlag.s` + `halo.p`.)
- walk/run (LegGait biped, style bird): cycle [0.3, 0.267] s, 4 drawings, duty [0.25, 0.2], roll [10, 8], lift [0.06, 0.08].

## Lights
None.

## Self-critique (Stage 7, r2 — after the art-director review 14/24)
Evidence: full pack `shots/char-toad/report.txt` (64 pass / 19 warn / 0 fail, RTX 4090); 8-facing stills
`r2/g8-{vote-f10,excuse-f8,excuse-f20,die-f14,die-f40,talk-f0}-x4.png`, x8 `r2/g8-excuse-f20-S-SE-x8.png`;
`dir2/g60-x3.png` (satchel); `r2pA|r2pB` palette A/B; `r2c-h` speckle A/Bs; bake `shots/char-toad/bake/toad-preview.png`.

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | two proud bumps + notch at S/SE/SW/N (`turnaround-silhouette.png`), golden crop reads as a toad | fresh 25 % line-up vs frog |
| 2 | Pixel stability | 1 | non-loco clips off_grid/flicker 0; walk flicker 505 legs-only (module M3) | LegGait plant mode |
| 3 | Line quality | 1 | speckle 43 → 35 (jaw flush with skull); vote.key_speckle +17 | jaw/skull part-line specks (module) |
| 4 | Tonal discipline | 1 | skin isolated max 10 (warts + jaw seam + E eye column), cream lit 7/8 | — |
| 5 | Ground separation | 2 | sig_ground 4/4 by value (−28/−28/−28/−30 %) with the v1 olive hue | — |
| 6 | Proportion / expression | 2 | face reads at S/SE in talk (mouth + throat), vote eye stays a slot, wink key differs | bigger wink |
| 7 | Animation timing | 1 | excuse punchline is a distinct drawing (34 % pose read), drop on the key | — |
| 8 | Weight / contact | 1 | toe caps read; still no 2-drawing plant (module) | M3 |
| 9 | Personality / secondary | 2 | satchel clamped, oath+wink, belly-up die with face | — |
| 10 | Smears and FX | 1 | drop on wink key; FX 8-facing stills not run | FX stills |
| 11 | Facing and turns | 1 | E/W show the bump hump + yawed eye; turn.foot_slide 5.09 WARN | — |
| 12 | Technical | 2 | page_errors 0, deterministic, draw calls 2/1 | — |

**Total 17 / 24 (self).** Weakest: walk contact (LegGait M3, module), skin isolated px 10, vote prop only 4 texels over
the crown at E.
