# Greenting — design sheet (cast member `greenting`, UCT mascot)

"A round green creature. Nobody knows what it is." Code: `characters/greenting.js`. Final pack:
`tools/charpack.sh greenting --preset cast --raw --out shots/char-greenting/final` (117 pass / 15 warn / 0 fail, render-host
RTX 4090). Bake: `shots/char-greenting/bake/` (`--preset cast --cell 112 --q fx=0`). Evidence for the table below:
`shots/char-greenting/{final,self,p5,p6}/`.

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
`eyeL/R`, `mouth`; `upperArm/forearm/handL,R` (one stub lobe on upperArm); `thigh/shin/footL,R` (leg 0.11 m = 0.1 H);
`tail0` (stub at the back bottom).

H = 1.12 m (v2 28 px → castHeight), 34–42 texels at vh 10 (head leans forward, so S is the shortest).
- v_game = 3.95·H = **4.42 m/s** (charpack game job = spec.gameSpeed.v).
- Legs 0.1 H cannot step at 4 H/s (duty bound ≈ 0.1) → LegGait `plan: 'biped'` + `style: 'bird'` (= a **waddle**: the
  body rolls onto the planted foot), `plant: 'hold'` (sprite-style leg drawings, no re-pin), `poses [4, 4]`, `duty [0.25,
  0.2]`, `roll [8, 7]`, `headBob [4, 4]`, `lean [6, 12]`, `lift [0.04, 0.06]`, `arms/elbows [0, 0]` (no procedural arm
  swing), `cycleTime [0.3, 0.267]`.
- Measured: **4/4 drawings every cycle, cycle 0.267 s (8 grid frames, holds 2), 1.05 H per cycle**, game.off_grid 0,
  flicker 0, strobe 1, head_bob 3.6 px with limp 2.6 (≤ 3 PASS) (`final/report.txt`).
- `clips.walk` (`blend: 'add'`, length 4, f0 = left contact) adds the stub-arm flap (±24° between drawing pairs), a tail
  wag (±16°) and a ±3° head counter-roll on top of the waddle.

## 3. Silhouette (25 % blob)
1. **Long narrow tube** (0.38 m wide × 1.1 m: the narrowest cast member) with two stub arms straight out to the sides —
   a "+"/cross blob at S and N (width feature, R W3).
2. **Head end leaning forward + tail stub** — at E/W a "7"/sauropod hook with a tail on the ground.
Line-up `self/sil-lineup.png` (S/SE/E/N vs 26 members): closest = skeleton-chef / polly (narrow upright columns) but both
have no forward hook at E and no side stubs at S; cilantro is the other long neck but 40 % taller with ossicones and hoofed
legs. Distinct.

## 4. Proportions (vh 10 = 36 px/m)
| part | m | texels |
|---|---|---|
| height (head top) | 1.11 | 34 (S) – 42 (N) |
| body tube r (max) × depth | 0.19 × 0.94 | 14 wide |
| head tube r / lean | 0.172 / 35° fwd | 12 wide |
| stub arm (box) | 0.23 × 0.11 × 0.11 | 4 × 4 out of the body |
| leg + foot | 0.16 tall, foot 0.11 × 0.16 | 2–4 visible under the body |
| tail stub | 0.25 long, r 0.06 | 6–8 at E/W |
| eye bead | 0.062 square | 2 × 2 |
| smile | 7 beads in a U, 0.052 each | ≈ 5 × 2 |

## 5. Palette (2 slots, no accent)
- `jade` `['#66D8A4', '#2EB27E', '#2A8C68']` — the ref's flat mint/leaf green (hue ≈ 156°); sh kept on the ref hue.
  Measured: noon sun dH 44 / dL −38 %, noon shade dL +22 %, golden sun dH 83 / dL −47 %, golden shade dL +23 % (all PASS).
- `ink` `['#33433F', '#2A3633', '#222C2B']` — eye dots + smile; dark green-slate, no black.
No pink/magenta anywhere in the palette or renders (the magenta in `turnaround-isolated.png` is charcheck's stray-px marker).

## Unique to me
1. **Extra animated parts** — (a) STUB ARMS: keyed everywhere (no springs): idle −20° → −14° breath, walk flap ±24° per
   drawing pair (additive clip), talk flaps the free arm up 40°, vote stretches the right arm up into a long noodle
   (`'upperArmR.l': [3.6]`: the stub grows ×4.6 — the "soft rubber creature" gag), point stretches the left arm ×2.5
   forward-up, shrug raises both; (b) TAIL wags ±16° in the walk; (c) the long BODY + NECK + HEAD are the expression:
   talk sways them ±28° like a metronome (40° between keys), die topples the whole tube; (d) MOUTH: the smile beads
   stretched (`mouth.s` y +0.7–0.8) = an open "D" mouth in talk; (e) EYES blink/close by `eye*.s` y −0.8.
   Verified: `final/clip-talk.png`, `self/z-vote-point.png`, `final/clip-walk-60hz.png`.
2. **My locomotion** — a stiff **waddle** (numbers §2). 0-slide: legs are sprite-drawn ('hold'), no planted pair exists
   (`game.foot_slide` n/a, in-hold glide 6 texels = the baked-sprite behaviour, same as every chibi). The rhythm is
   carried by the long body's roll (head 3.6 px bob + 2–3 px sideways sway), the flapping stub arms and the tail.
3. **Expressions** — two 2×2 dark dot eyes on the upper sides of the head's snout end (EYE_DIR (0.5, 0.42, 0.76) from the
   cap centre) + a 7-bead U smile on the lower front that wraps round the end, so at the game facing (SE) and in profile the
   face sits OFF TO THE SIDE toward the snout end (at S, looking straight down the head axis, it is necessarily centred).
   talk = smile stretched into a dark "D" + body sway; vote = head up 8°, other arm down; die = eyes shut (lines), body
   on its side; emote = head tilted 24° + "?" glyph after a full stop-motion pirouette.
4. **Game-speed readability** — walk: one word at 1×: "waddle" (`final/game-onion.png`, `final/gamespeed.png`); talk: a
   beat every 6 frames (0.2 s), amplitude 43 %; vote: arm up at f3 (0.1 s), full at f6, held (final_hold 1.57 s, 32 % off
   idle); die: down by f18 (0.6 s), final_hold 2.03 s 115 % off idle; emote: the pirouette is 8 drawings × 3 frames.

## 6. Clips (30 Hz grid, `interp: 'step'`)
| clip | keys (frame: what) | notes |
|---|---|---|
| idle (loop 72) | 0 rest · 30 breath 2° · 36 breath 4° + head tilt 6° · 52 blink (2 f) · 54 · 66 | arms −20 → −14 |
| walk (add, 4) | 0 L contact: L arm up, R down, tail L · 1 pass · 2 mirror · 3 pass | LegGait waddle underneath |
| talk (loop 24) | 0 sway L + mouth open + R arm up · 6 back, down 1 texel · 12 sway R + mouth + L arm · 18 back | `speak` at 0 |
| vote | 0 dip · 3 R arm up (.l 1.6) · 6 noodle arm (.l 3.6, fwd −18 so it rises behind the head at E) — held | `vote@handR` at 6 |
| point | 0 coil · 4 L arm fwd-up (55, 0, 40; .l 1.5) · 16 jab (.l 1.8, +0.03 fwd) · 24 point · 84 idle | |
| die | 0 sway L, eyes half · 6 sway R, knees bend · 12 topple (roll 40°) · 18 on its side (roll 80°, turned 40°, +0.06 y) · 22 settle; held to 60 | `die` at 18, legs fk |
| mystery (emote) | 0 gather · 4–22 pirouette 45° per 3 f · 25 land · 28 shrug + head tilt 24° · 44 idle | `emote:question@crown` at 28 |
| ghost / ghost-spent | 4 keys × 18 f, `legs: 'float'`, `spec.ghost { hover 0.14 }` (shared module ramp + halo) | spent: head bowed, arms down |
| run (optional) | procedural waddle at 2·v | not authored |

## 7. Self-critique (Stage 7; scored like the critic, evidence = files in shots/char-greenting/)
| # | criterion | score | evidence (file · facing/frame · number) | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | `self/sil-lineup.png`: narrowest blob, cross at S/N, hook at E, no look-alike; `final/turnaround.png` 8/8 read as the Joguman tube | — |
| 2 | Pixel stability | 2 | `final/report.txt`: off_grid 0 and flicker 0 in every clip, strobe ≤ 1, deterministic + vote.deterministic 0 px, pan 0 | — |
| 3 | Line quality | 1 | `final/turnaround.png` N/E: the depth lines at the tail/foot roots render as light-grey 1-px specks on the green (zoom `r8/zn.png`); silhouette_line 0 | per-slot line colour (look backlog) or tail/feet inside the body |
| 4 | Tonal discipline | 1 | isolated_px 5–10 per facing (jade), at the body-bottom/foot junction and smile edge (`r7f/zi.png`); colors/slot WARN ink 12 | coarser foot/body junction |
| 5 | Ground separation | 2 | sig_ground noon/golden sun + shade all PASS (dH 44/83, shade +22/+23 %); `final/scene-*-crop.png` read in sun and pillar shade | — |
| 6 | Proportion, appeal, expression | 1 | face_lit 70 %; talk mouth "D" visible at S/SE/SW (`self/z-idle-talk.png`) but the open mouth merges with the eyes into one dark mark at S; face centred at S | larger head/face spacing, smaller mouth open |
| 7 | Animation timing | 1 | no x1 holds, hold_redraws 0, key_delta ≥ 19 %; BUT point hidden at SW (far arm) and vote arm hidden at NE (`self/z-vote-point.png`, `p6/z.png`) | a per-facing-safe pointer (head/arm both) |
| 8 | Weight, contact, game speed | 1 | game.readable 4/4 drawings, 0.267 s, 1.05 H; head_bob 3.6 px; foot_slide n/a; feet only 2–4 texels and shuffle: contact barely visible at 1× (`final/clip-game.png`) | a visible foot plant drawing / bigger roll at contact |
| 9 | Personality, secondary, uniqueness | 1 | deadpan stiff waddle + noodle-arm vote + pirouette emote are in character; secondary motion is keyed only (arms/tail ≤ 24°), no lag/overshoot anywhere | a soft settle on the head after the hop/pirouette |
| 10 | Smears and FX | 1 | speech bubble, vote sparkle at the hand, `?` glyph, die dust + soul (`final/clip-*.png`); no smears (none needed); the bake is FX-free (FX were cropped by the figure-sized cell) | — |
| 11 | Facing and turns | 2 | `final/clip-turn.png`: 45° steps held 2 frames, no chains to settle, all 8 facings read | — |
| 12 | Technical | 2 | 0 FAIL, page_errors 0, draw_calls/char 2/1, night_freeze/night_pan 0 px, rendered on render-host RTX 4090 | — |
| | **total** | **17** | | |

Three weakest points: (1) contact/feet at game speed (shuffle, 2–4 texel feet); (2) the point and the vote arm vanish at
the facing where the arm is on the far side (SW for point, NE for vote); (3) grey inner-line specks and 5–10 isolated px
at the leg/tail roots.
