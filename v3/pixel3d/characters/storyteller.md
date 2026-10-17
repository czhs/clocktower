# The Storyteller (cast `storyteller`): design sheet r2 (after critic-storyteller r1, 18/24; rewritten from the code + p8 renders)

"Hooded, lantern-lit, always watching." The game's human host, not a player. Spec: `characters/storyteller.js`.
Identity source (read only): `pipgws/packages/assets/scripts/cast/storyteller.ts`, `refs/cast/storyteller.png`.

**Renders** (all on render-host, RTX 4090):
- **r2 final pack: `shots/char-storyteller/p8/`** (`--clips idle,walk,run,talk,vote,point,die,chime,appear,turn --raw`; no ghost/ghost-spent:
  the Storyteller never dies or becomes a ghost, so `--preset cast` is not used). **102 pass / 30 warn / 0 fail**, page_errors 0,
  deterministic, pan 0 / night_pan 0 / night_freeze 0. Run at 2·V: `p8-run2x/` (`--q speed=12`). r2 8-facing stills: `r3/c-g8-*.png`.
- **r2 bake: `shots/char-storyteller/bake2/`** (9 clips × 8 dirs, auto-grown render cell 260 → trimmed 146×124, no border warning;
  FX cropped in vote/chime only). Not copied to `out/sprites/` (lead's job).
- r1 (scored 18/24): pack `p3/`, bake `bake/`.
- Iterations: `r1/`, `r2/` (turnarounds), `p1/`, `p2/` (packs), `pr/` (8-facing pose probes, variant `st_wv.js`), `s2/` and `s3/` (8-facing key stills).
- Self-critique evidence: `self/` (25 % line-ups).

## Stage 0: brief
**Concept:** a tall, deep-purple hooded host. A void face with two amber eyes, a warm lantern in the RIGHT hand and a tall
clock-topped staff in the LEFT hand. The robe hides the feet. **Adjectives:** calm, watchful, ceremonial. These map to heavy
dynamics (personality f 1.8, zeta 1), long holds (idle 10-26 f, point held 66 f) and a stately stride.

**Identity (CAST_PORTING §3):**
1. **Silhouette:** a round cowl with a back-drooping tip on a bell robe, plus the tall staff whose round clock stands above the
   hood. This is the most unmistakable blob in the cast: the tallest, and the only one with a disc-topped staff.
2. **Palette anchors:** deep purple robe, gold trim and stars, a void face with amber eyes. It is the only purple member.
3. **Props:** the lantern is in the RIGHT hand, which is the camera side at SE. The clock-staff is in the LEFT hand; it is the far side at SE,
   but the clock clears the hood at every facing except SW.
4. **Face:** a void disc inside a gold bevelled rim, with two emissive amber bead eyes.
5. **Motion:** the robe sways and lags, the hood tip flops, and the toes peek out under the raised hem on the steps (as in v1).

## Body plan, proportions, game speed
- **Skeleton:** `chibi({ height 1.36, heads 2.4, legs 0.85, arms 0.95 })` dressed as a robed figure. `bodyPlan: 'biped'`,
  `locomotion: { plan: 'biped', plant: 'hold' }`.
- **Extra bones (keyed only):** `peak`, `robe` (the lower robe, pivot at the waist), `staff` → `clock` →
  `clockHand`/`clockHand2`/`clockHand3`, `lantern` → `glass`, and `bootL/R`.
- **Heights:** hood tip ≈ 1.55 m (longer, more upright peak in r2), staff finial 1.91 m (`spec.height`; the clock was raised 0.11 m in r2 so it
  clears the hood at W/SW). The tallest silhouette (cilantro is 1.68).
- **Hood:** 0.64 m wide, with the cowl front flattened at z 0.20. Gold rim 0.44 × 0.42 m. Void 0.34 × 0.33 m (about 53 % of the hood width).
- **Robe:** hem r 0.37 m at y 0.10 (raised 0.1 m, so the boots peek out). Capelet r 0.355 → 0.16 m.
- **Clock:** r 0.125 m, gold rim 0.13 m thick (r2: edge-on facings still show a ≥ 4 px disc), ivory faces proud on both sides, yawed −35°.
- **Staff rest tilt (r2):** the shaft leans 7° forward + 14° out (left) from the grip (`STAFF_TILT`, `STAFF_OUT`; geometry + clock bone
  position rotated, the clock itself stays upright). sig_outside.clock ≥ 3 px at 8/8 (r1: SW 0).
- **Game speed:** v2 sprite 38 px → card H 1.52 m → **V = 3.95 × 1.52 = 6.0 m/s** (4.0 hood-heights/s; charcheck reads it as
  3.34 H/s of the 1.8 m staff height).
  - N = 4 drawings × 2 grid frames = **0.267 s per cycle, 1.6 m per cycle**, step 0.8 m.
  - Hip 0.515 m, leg 0.42 m: the stance span limit 0.46 m gives duty ≤ 0.29. The spec uses duty 0.25 (stride with a short flight).
  - Run (fast travel) = **4·V = 24 m/s** (`runSpeed`, the brief's maximum) as a glide (boots hidden); also rendered at 2·V (`p8-run2x/`).

## Palette (≤ 5 slots + accents)
| slot | hi / mid / sh | use |
|---|---|---|
| robe | #8E6BB0 / #5E3D84 / #33224A | hood (signature, lifted), robe, capelet (v1 #705284 / #4C2A72 / #402462) |
| deep | #634A8A / #45306A / #3C2C56 | sleeves, front robe panel (arms ≠ torso slot) |
| gold | #F6D883 / #D0A442 / #8F6A3C | rim, trims, stars, clock rim, finial, lantern frame |
| void | #3A2E4C / #2E2440 / #2A2238 | face hollow, gloves, clock hands, shins (darkest mass, ≥ #2A2238) |
| wood | #86624A / #5A3E30 / #44302E | staff, boots, lantern bail |
| ivory (accent 2, story prop) | #FBF2DC / #EAD9B6 / #B8A68E | clock face |
| glow (accent, emissive) | #FFD27A / #FFB850 / #E08A3C | eyes + lantern glass |

## Unique to me (re-checked against p8 + r3 stills after the r2 fixes)
1. **Extra animated parts.** All KEYED, no spring chains (hold_redraws 0 in every action).
   - **Hood tip `peak`:** longer and more upright in r2 (clears the crown at N/NE: `p8/turnaround.png`). Walk +16 contact / −22 flight,
     glide −38/−48 streaming, talk ±12, vote −16, point −14 → −18 on the re-aim, die +40.
   - **Lower robe `robe`:** walk −4…−10 lag + ±6 sway; glide −20 ↔ −28 with a hem flare (`robe.s` +10 %) on alternate drawings
     (2-drawing flutter); die pools.
   - **Lantern:** plumb (`lantern = −(up + fore)`), walk ±24 swing. **Point (r2):** held FORWARD toward the target at chest height
     (`upperArmR` [86, 0, 20], reach `.l` 0.6/0.5), chest turned toward it; outside the outline at S/E/NE/N/W/SW (r3/c-g8-point-f30d.png),
     in front of the chest at SE (aimed at the viewer). Re-aim beat at f70 (head cocks, lantern +6°) with the blink.
   - **Staff:** rest tilt 7° fwd + 14° out. **Walk (r2) = a real plant:** L contact top tilted back ≈ −15°, tip AHEAD of the body and
     tapped down 0.03 m (`staff.p`); flight passes vertical; R contact trails (push-off) (`r3/c-g8-walk-f0c.png`, `-f1b`, `-f2`).
     Vote: thrust up near plumb beside the hood (`ALOFT`, re-compensated for the rest tilt, `r3/c-g8-vote-f30j.png`).
     Die (r2): laid on the ground across the mound (`p5/clip-die.png` f28).
   - **Clock hands:** 3 → 6 → 9 o'clock on the chime strikes (variant bones).
   - **Eyes (r2, ≥ 2 texels):** WIDE = +50 % tall and lifted, SQUINT = flat slit dropped to the lower lid, LOOK = eyes slide toward
     the head roll (talk) — `p5/clip-talk.png`.
   - **FX:** speech, vote sparkle, chime dust + sparkles + note, appear poof.
   - **`spec.lights` (r2):** `#FF9A48`, intensity [0, 0.9, 2.2], distance 2.1, on a new `lanternLight` socket 0.16 m below the glass
     (pool reaches the hem); glass glows #FFD27A amber at night, not cream (`r5/scene-night-crop.png`). Flicker on uCharTime.
2. **My locomotion.**
   - **walk = stately STRIDE** at 6.0 m/s (game.readable PASS 0.267 s, 4/4 drawings, holds 2×23, head_bob 2.7 px, walk.distinct 12/4),
     one boot flick per drawing, staff PLANT on the L contact, lantern swing, robe sway. 1× game sheet `p8/s-game-1x.png`: the staff
     visibly rocks plant ↔ push-off at game speed. foot_slide n/a (hem feet, LegGait 'hold').
   - **run = GLIDE at 4·V (24 m/s)**: lean 12°, boots hidden, hem flare/fold flutter, hood tip + lantern streaming, 1-texel float bob
     (`hips.p`; run.head_bob 1.5 px, run.distinct 9/4) — `p8/clip-run.png`, `p8/s-run-1x.png`. At 2·V: `p8-run2x/` (distinct 12/4).
3. **Expressions.** Void face + amber beads. Talk: WIDE+LOOK ↔ SQUINT with a ±14° head roll; vote WIDE; point WIDE + blink;
   chime squint → wide; die dim slits. Eye changes are now 2-3 texels at 1× (r1: ~1).
4. **Game-speed readability (1×).** Walk/game: `p8/game-1x.gif`, `p8/s-game-1x.png`. Run: `p8/s-run-1x.png`. Point: `p8/s-point-1x.png`
   (gather → held at the chest toward the target, sparkle). pose_read: vote 49 %, point 44 %, die 98 %, chime 29 %, appear 36 %,
   talk amplitude 50 %. Read shows GIFs as frames only; motion was judged from per-frame contact sheets of the 1× GIFs.

## Timing charts (30 Hz grid)
| clip | keys (frame: what) |
|---|---|
| idle (loop 72) | 0 rest · 24 breath in · 34 blink (2 f) · 36 · 46 "always watching": head turns −22, squint, peak sways · 62 breath out |
| walk (4 drawings) | 0 L contact: staff tip planted ahead + tap, lantern +24, robe sways left, peak +16 · 1 flight: staff vertical, peak −22 · 2 R contact: staff trails · 3 flight |
| run (4, 4·V) | 0 flare (hem −28 + 10 % flare, float up, peak −48, lantern −48) · 1 fold (−20, down, −38/−34) · 2 flare (mirror sway) · 3 fold |
| talk (loop 24) | 0 lantern to the chest, roll −14, WIDE + look (speak) · 6 settle, SQUINT · 12 staff raised, roll +14, WIDE + look · 18 settle, SQUINT |
| vote (31, held) | 0 dip + blink (3) · 3 staff thrust up beside the hood, WIDE, sparkle → held |
| point (106, held) | 0 gather the lantern (4) · 4 lantern held forward toward the target, WIDE, sparkle · 70 blink + re-aim (head cocks, lantern up 6°) · 72 → held |
| die (61, held; not used in game) | 0 sway (8) · 8 kneel (6) · 14 bow (6) · 20 mound, lantern set down, staff laid on the ground, eyes dim → held |
| chime (emote, 52) | 0 lift (6) · 6 STRIKE 1 (hands → 6, lantern flare, dust) · 18 lift · 24 STRIKE 2 (hands → 9) · 40 blink · 42 settle |
| appear (30) | 0 gone + poof · 4 thin column · 8 squash · 12 stands, WIDE, sparkle · 24 idle |

## Self-critique r2 (scored like the critic; when in doubt 1)
| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | tallest, only purple; sig_outside.clock ≥ 3 px 8/8 (r1 SW 0), hood ≥ 89 px 8/8; pointed back hood (`p8/turnaround.png`) | — |
| 2 | Pixel stability | 2 | off_grid/flicker 0 in every action, game 0/0, pan 0, night_pan 0, night_freeze 0, deterministic | — |
| 3 | Line quality | 1 | silhouette_line PASS, capeBand now solid (r1 dotted), 5 larger stars, back star ≥ 3×3; but speckle 41 (the tilted staff stair-steps), key_speckle die +29 (diagonal staff on the ground) | an un-tilted staff costs the SW clock; dither-free diagonals are a module topic |
| 4 | Tonal discipline | 1 | hood hi/mid 0.9+ 8/8; colors/slot WARN (void 13, ivory 9), robe isolated max 5 (SE/SW) | — |
| 5 | Ground separation | 2 | all four sig_ground PASS (noon-shade −52 %, r1 −20 % WARN); night glass amber, pool lowered | golden sun hood still mauve |
| 6 | Proportion, appeal, expression | 1 | eye changes 2-3 texels (talk strip); face_visible 26 % (void-slot confound) | — |
| 7 | Animation timing | 1 | stepped, no x1 holds, strobe ≤ 1; point.key_delta 1 % (the blink key, by design) | — |
| 8 | Weight, contact, game speed | 2 | staff plant reads (tip ahead on L contact at 8 facings, game 1× sheet); 4·V glide authored + rendered, 2·V too | — |
| 9 | Personality, secondary | 2 | glide flutter, plant, chime, appear, watching idle | — |
| 10 | Smears and FX | 2 | poof / sparkle / note / dust on their keys | — |
| 11 | Facing and turns | 2 | clip-turn steps ≥ 2 frames; clock rim ≥ 4 px edge-on | — |
| 12 | Technical | 2 | page_errors 0, draw calls 2/1, RTX 4090 render-host | — |
| | **total** | **20** | | |

Remaining weak points: speckle (41) from diagonal staff lines, robe isolated px 5 at SE/SW, point at SE stays in front of the
chest (the faced target is the viewer). The turnaround SW cell still shows S's hem (tools issue, see report).
