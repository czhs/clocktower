# Greenting — design sheet (cast member `greenting`, UCT mascot)

"A round green creature. Nobody knows what it is." Code: `characters/greenting.js`. Final pack (r9, after critic-greenting 17/24):
`tools/charpack.sh greenting --preset cast --raw --out shots/char-greenting/final-r9c` (116 pass / 17 warn / 0 fail, render-host
RTX 4090). Bake: `shots/char-greenting/bake-r9/` (`--preset cast --cell 112 --q fx=0`; walk 4/4 drawings). Evidence for the table below:
`shots/char-greenting/{final-r9c,r9c,r9d}/` (r8 pack kept in `final/` for A/B).

**Identity source (changed mid-run).** Round 1 followed the gumdrop/duck-bill override (`refs/cast/greenting-user-ref-group.png`,
now kept as `greenting-ref-v1-overlapping-group-crop.png`); the user then replaced `refs/cast/greenting.png` with the
PRIMARY reference: "it should basically be like Joguman" — a soft, rounded, flat mint/leaf-green creature with a LONG
body/neck, small stubby arms and legs, a rounded head at the top end, and a tiny simple face (two dot eyes + a small
smile) toward the snout end of the head, not centred on a front plate. Everything below is the Joguman build; the
gumdrop version is gone (scratch copy only). This sheet is rewritten from the current code.

## 1. Concept
A long soft green tube that stands upright on two stub feet, holds two stub arms out to the sides, leans its rounded
head forward like a little sauropod, and looks at you with two dots and a tiny smile. Deadpan-silly; may look out of place
in the gothic town (user: fine). Adjectives: **blank, deadpan, stiff** → personality body/head f 2, ζ 1, r 0, no springs
(CAST_PORTING §10 "blank, deadpan": stiff waddle, sudden snaps, no arm swing).

## 2. Body plan and game-speed numbers
`bodyPlan: 'uprightAnimal'`, custom skeleton with biped names: `hips` (root, y 0.16) → `spine` (body tube) → `chest`
(arm root, part-less) → `neck` (upper tube) → `head` (tube along the head axis, leaning 35° forward, + end cap) →
`eyeL/R`, `mouth` (smile), `mouthO` (filled talk mouth, r9); `upperArm/forearm/handL,R` (one stub box on upperArm);
`thigh/shin/footL,R` (leg 0.11 m = 0.1 H); `tail0` (stub at the back bottom).

H = 1.12 m (v2 28 px → castHeight), 34–42 texels at vh 10 (head leans forward, so S is the shortest).
- v_game = 3.95·H = **4.42 m/s** (charpack game job = spec.gameSpeed.v). Froude ≫ 0.5, so the game plays the RUN
  branch of the LegGait numbers (index 1).
- Legs 0.1 H cannot step at 4 H/s (duty bound ≈ 0.1) → LegGait `plan: 'biped'` + `style: 'bird'` (= a **waddle**),
  `plant: 'hold'`, `poses [4, 4]`, `duty [0.25, 0.2]`, **r9: `roll [5, 5]`, `lean [3, 4]`** (was 8/7 and 6/12: at SE a
  roll shows as a right-tilt drawing vs a squat drawing = the "forward/back lurch" the critic saw; roll 0 removes it,
  roll 5 keeps a small sway; A/B `r9w-{a,b,c,d}/clip-game.png`), `headBob [4, 4]`, **`lift [0.06, 0.08]`**,
  `arms/elbows [0, 0]`, `cycleTime [0.3, 0.267]`.
- Measured (`final-r9c/report.txt`): **4/4 drawings every cycle, 0.267 s (8 grid frames, holds 2), 1.05 H per cycle**,
  game.off_grid 0, flicker 0, strobe 1, head_bob 3.8 px, limp 1.7 (r8: limp 2.6), feet_visible SE PASS.
- `clips.walk` (`blend: 'add'`, length 4, f0 = left contact): r9 stub-arm flap 40° between contact drawings (+16 / −24),
  a 1-texel body drop on both contact drawings, tail wag ±22°, ±3° head counter-roll.

## 3. Silhouette (25 % blob)
1. **Long narrow tube** with two stub arms straight out to the sides (r9: arms 0.27 m box, ≈ 7 texels out of the body) —
   a "+"/cross blob at S and N.
2. **Head end leaning forward + tail stub** — at E/W a "7"/sauropod hook with a tail on the ground.
Line-up `r9d/sil-lineup.png` (S/SE/E/N vs 30 cast silhouettes, skip list excluded): still the only cross at S/N and the
only forward hook + tail at E; nearest are skeleton-chef / polly (narrow columns, no side stubs, no hook).

## 4. Proportions (vh 10 = 36 px/m)
| part | m | texels |
|---|---|---|
| height (head top) | 1.11 | 34 (S) – 42 (N) |
| body tube r (max) × depth | 0.19 × 0.94 | 14 wide |
| head tube r / lean | 0.172 / 35° fwd | 12 wide |
| stub arm (box) | 0.27 × 0.11 × 0.11 (r9, was 0.23) | ≈ 6–7 × 4 out of the body |
| leg + foot | 0.16 tall, foot 0.11 × 0.16 | 2–4 visible under the body |
| tail stub | 0.25 long, r 0.06 | 6–8 at E/W |
| eye bead | 0.052 square (r9, was 0.062: rasterised as a 3×3 '+') | 2 × 2 / 2 × 1 |
| smile | 3 beads, ±11° round the head axis (r9, was 7 beads) | ≈ 4 × 1 |
| open talk mouth | 0.08 × 0.06 plate | ≈ 3 × 2 filled |

## 5. Palette (2 slots, no accent)
- `jade` `['#66D8A4', '#2EB27E', '#2D9670']` — the ref's flat mint/leaf green (hue ≈ 156°); r9 sh lifted from #2A8C68
  (golden-shade had dropped to +14 % with the longer arms). Measured: noon sun dH 43 / dL −34 %, noon shade +30 %,
  golden sun dH 82 / −43 %, golden shade +22 % (all PASS).
- `ink` `['#33433F', '#2A3633', '#222C2B']` — eyes, smile, open mouth; dark green-slate, no black (ink tones 12 → 6).
- `material.merge`: every jade bone → `hips` (r9 adds thighs + feet), so no light-grey junction line draws anywhere.
- `ghost: { hover 0.14, keepHue 0.45 }` (r9): ghost = pale mint, spent = grey sea-green, not lavender.

## Unique to me
1. **Extra animated parts** — (a) STUB ARMS keyed everywhere (no springs): idle −20° → −14° breath, walk flap 40°
   between contact drawings, talk flaps the free arm up 40°, vote stretches the right arm into a long noodle (`.l` 4.6,
   out 66: diagonal up-out so it clears the head at all 8 facings), point reaches BOTH stubs forward (`.l` 1.6 / 1.1,
   jab 2.0 / 1.4) with a neck lunge; (b) TAIL wags ±22° in the walk; (c) the long BODY + NECK + HEAD sway ±28° as the
   talk metronome, die topples the whole tube diagonally; (d) MOUTH: a separate filled dark plate (`mouthO`) buried in the
   head at rest and pushed out with `mouthO.p` on the talk keys = a filled "o"/"D" under the small smile (the smile is
   never scaled); (e) EYES blink/close by `eye*.s` y −0.8. Verified: `r9d/zf.png` (idle + talk 0/9/18/27 at S/SE/E/W/SW),
   `final-r9c/clip-talk.png`, `r9c/z-v.png`, `r9c/z-pv.png`.
2. **My locomotion** — a stiff **waddle-scurry** (numbers §2): legs are sprite-drawn ('hold'), `foot_slide` n/a; the
   rhythm is the 40° arm flap, the 1-texel contact drop + 3.8 px head bob, a 5° roll and the tail wag.
   `final-r9c/clip-game.png`, `game-onion.png`, 1× frames `r9d/z-gif-game.png`.
3. **Expressions** — r9 face (critic fix): the eyes sit on the SIDES of the snout end (φ +72° / −70° round the head axis
   from its front, 14° up the cap: |x| ≈ 0.9 of the radius), so each profile shows one eye on the side of the head (E
   2×2, W 2×1); a 3-bead smile turned 12° toward the char's left, so S shows a small off-centre smile under two
   edge-set dots and SE/SW show eye + smile toward the snout (`r9c/zf-idle.png`). talk = filled mouth + sway; vote = head
   up 8°; die = eyes shut, on its side; emote = head tilted 24° + "?" after a stop-motion pirouette.
4. **Game-speed readability** — walk: "waddle" at 1× (above); talk: a beat every 9 frames (0.3 s), key_delta 47 %;
   vote: arm up-out at f3 (0.1 s), noodle at f6, held (final_hold 1.57 s, 46 % off idle); die: down by f18 (0.6 s),
   final_hold 2.03 s, 132 % off idle; emote: pirouette 8 drawings × 3 frames.

## 6. Clips (30 Hz grid, `interp: 'step'`)
| clip | keys (frame: what) | notes |
|---|---|---|
| idle (loop 72) | 0 rest · 30 breath 2° · 36 breath 4° + head tilt 6° · 52 blink (2 f) · 54 · 66 | arms −20 → −14 |
| walk (add, 4) | 0 L contact: drop 1 texel, L arm up, R down, tail L · 1 pass · 2 mirror · 3 pass | LegGait waddle underneath |
| talk (loop 36) | 0 sway L + mouth open + R arm up · 9 back, down 1 texel · 18 sway R + mouth + L arm · 27 back | `speak` at 0 |
| vote | 0 dip · 3 R arm up-out (−6, 0, 54; .l 2.6) · 6 noodle (−6, 0, 66; .l 4.6) — held | `vote@handR` at 6 |
| point | 0 coil back · 4 both stubs forward + neck lunge · 16 jab (.l 2.0 / 1.4, +0.03 fwd) · 24 point · 84 idle | |
| die | 0 sway L · 6 sway R, knees bend · 12 twist (roll 40°) · 18 falls diagonally (hips fwd 54 / out 58) · 22 settles (60/60, limbs down); held to 60 | `die` at 18, legs fk |
| mystery (emote) | 0 gather · 4–22 pirouette 45° per 3 f · 25 land · 28 shrug + head tilt 24° · 44 idle | `emote:question@crown` at 28 |
| ghost / ghost-spent | 4 keys × 18 f, `legs: 'float'`, `spec.ghost { hover 0.14, keepHue 0.45 }` | spent: head bowed, arms down |
| run (optional) | procedural waddle at 2·v | not authored |

## 7. Self-critique (r9; scored like the critic, evidence = files in shots/char-greenting/)
| # | criterion | score | evidence (file · facing/frame · number) | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | `r9d/sil-lineup.png` vs 30 members: only cross at S/N, only hook + tail at E; `final-r9c/turnaround.png` 8/8 | — |
| 2 | Pixel stability | 2 | `final-r9c/report.txt`: off_grid 0 / flicker 0 in every clip, strobe 1, deterministic + vote.deterministic 0 px, pan 0/23, night_pan 0 | — |
| 3 | Line quality | 1 | grey leg-root specks gone (`r9d/zfeet.png` S/SE/N/W x8: none), silhouette_line 0/806; but inner_lines 0 WARN (no depth line at all now) and the outlineDebug still was not run | a dark (not grey) leg/body line, needs a per-slot line colour (module) |
| 4 | Tonal discipline | 1 | isolated_px jade [7,6,5,5,6,4,1,7] (was max 10), ink tones 12 → 6, jade 7; hi/mid 0.54–0.73 | sink the feet/tail roots further (remaining px at foot bottoms + head rim, `final-r9c/turnaround-isolated.png`) |
| 5 | Ground separation | 2 | sig_ground noon/golden sun + shade all PASS (dH 43/82, shade +30/+22 %); `final-r9c/scene-{golden,night}-crop.png` read | — |
| 6 | Proportion, appeal, expression | 2 | `r9c/zf-idle.png`: eye on the side at E (2×2) and W (2×1), S small 3-bead smile off-centre; talk open mouth is a filled 3×2 plate, not a ring, separate from the eyes at S/SE/SW (`r9d/zf.png` f0/f18); no '+' eye after EYE_A 0.026 (f27 SE) | S eyes sit on the outline as 1×2 columns |
| 7 | Animation timing | 2 | point f16 arm visible 8/8 (`r9c/z-pv.png` row 1), vote f6 8/8 incl. NE (`r9c/z-v.png`); talk keys every 9 frames; key_delta ≥ 8 %, hold_redraws 0 | vote f3 in-between hidden at E |
| 8 | Weight, contact, game speed | 1 | game.readable 4/4, 0.267 s, 1.05 H; head_bob 3.8 px limp 1.7; SE right-tilt/squat alternation reduced (`final-r9c/clip-game.png`); feet still 2–4 px stubs, foot_slide n/a | a real foot plant drawing (needs keyable legs under LegGait 'hold') |
| 9 | Personality, secondary, uniqueness | 1 | noodle vote, two-stub point lunge, pirouette emote, 40° arm flap; still no lag/settle (deadpan by design) | a settle on the head after pirouette/vote |
| 10 | Smears and FX | 2 | speech bubble steady (`final-r9c/clip-talk.png`), vote sparkle, '?' glyph, die dust (`clip-die.png` f26/f30) | — |
| 11 | Facing and turns | 2 | `final-r9c/clip-turn.png` 45° steps, strobe 1 | — |
| 12 | Technical | 2 | 0 FAIL (116 pass / 17 warn), page_errors 0, draw calls 2/1, night_freeze 0, bake 4/4 walk drawings, render-host RTX 4090 | — |
| | **total** | **20** | | |

Remaining weak points: (1) feet/contact at game speed (stub shuffle, no planted drawing); (2) isolated px 4–7 per
facing at the foot bottoms and head rim; (3) die final still a compact lump at NE and SW (2/8, was 4/8:
`r9c/z-dg.png` row 2).
