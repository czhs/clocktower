# Cilantro — design sheet (cast member `cilantro`, mascot 15-251)

Rewritten from the CURRENT code (`characters/cilantro.js`). **Current pack: `shots/char-cilantro/final5/`** (cast close-out,
2026-10-17: + point, ghost, ghost-spent; `--preset cast --raw`, render-host RTX 4090; 113 pass / 15 warn / 0 fail; bake
`shots/char-cilantro/bake3/`, 10 clips × 8 dirs). Round-2 pack (critic-cilantro 15/24): `final3/` + bake `bake2/`; round 1: `final/`.
The close-out changed no living clip: turnaround, idle, walk, talk, vote, die, lookout, game strips and scene crops are
byte-identical between the pre-close-out pack `c0/` and `final5/`. Identity source (read only): `refs/cast/cilantro.png`,
`pipgws/packages/assets/scripts/cast/cilantro.ts`. Blurb: "A giraffe in a blue hoodie and a green scarf."

## 1. Concept + adjectives
A gangly, gentle giraffe student in an oversized blue hoodie (kangaroo pocket, hood bunched behind the neck) and a green
scarf whose end hangs down the front. **Gentle, curious, gangly.** Calm dynamics (personality body f 2.5 ζ 0.8, head
f 2.2 ζ 0.9); the neck is the expressive part (it sways, nods, pumps in the walk, telescopes in the emote).

## 2. Body plan + game-speed arithmetic
`bodyPlan: 'longNeck'`; custom skeleton with biped bone names (LegGait `plan: 'biped'`) + a 3-link keyed neck
`neck (0.80) → neck1 (0.97) → neck2 (1.14) → head (1.31 m)`, jaw, eyeL/R, earL0/R0, `scarf0` (1-link spring chain).
- H = 1.68 m (v2 38–39 px → 1.52–1.56; the card allows 1.7 for the tallest player) → 54–57 texels at vh 10.
- Hip (thigh joint) 0.44 m, leg 0.38 m = 0.23 H (v1 legs ≈ 0.14 H; lengthened so the giraffe is leggy and the lope shows legs).
- v_game = 3.95 H = 6.64 m/s (charpack's game job). N = 4 drawings × 2 grid frames (`cycleTime` 0.267 s) → C = 1.77 m
  = 1.05 H. Stance reach 2·0.6·0.38 = 0.46 m → duty 0.25, `plant: 'hold'` (one contact drawing per step, exact at its
  pose frame; the planted foot rides the root inside the hold like a baked sprite).
- Measured: `game.readable` PASS 3.95 H/s, cycle 0.267 s, 1.05 H/cycle, 4/4 drawings per cycle, holds 2×23.
- Run (optional Storyteller-style fast travel) = 2·v_game on the plan's run branch with the neck pitched forward.

## 3. Silhouette
Two-part signature: (a) the long tan patched neck with a small head, two dark-knobbed ossicones and sideways ears;
(b) the blue hoodie egg + green scarf ring and hanging end. 25 % line-up vs 15 finished cast members
(`shots/char-cilantro/p3/sil-lineup.png`): the neck column + ossicone pair is unique at 8/8 facings; closest blob = honk
(neck on a body) — separated by the upright hoodie on two long legs and the twin knobs.

## 4. Proportions (m; texels = ×36 at vh 10)
| part | y range | size | texels |
|---|---|---|---|
| hooves + legs | 0–0.44 | leg 0.38, Ø 0.10–0.13 | 16 |
| hoodie (hem → neck hole) | 0.34–0.83 | w 0.44, d 0.38 | 18 tall, 16 wide |
| neck (3 blend-skinned links) | 0.80–1.31 | Ø 0.22 → 0.17 | 18 tall, 6–8 wide |
| head (16-sided skull) + muzzle | 1.31–1.57 | w 0.30, muzzle to z +0.29 | 9 |
| ossicones + knobs | 1.53–1.69 | shaft Ø 0.09→0.06, knob Ø 0.09 | 6 |
`head_frac` 0.247 (PASS). Arms: shoulder x ±0.215, upper 0.19 + fore 0.17, tan hoof-hands with a dark hoof tip.

## 5. Palette ([hi, mid, sh]; v1 hexes kept as the mids)
| slot | hi | mid | sh | use |
|---|---|---|---|---|
| hide | #F4C47C | #D6A456 | #B27C42 | head, neck, legs, hands, ears, ossicone shafts (signature + face slot) |
| patch | #B07444 | #8E5530 | #6A4430 | blocky patches = whole neck-hull facets (8 faces × 0.09 m rows), skull back (accent) |
| hood | #5E84C2 | #3F5F98 | #3A3A66 | hoodie, pocket, hood, sleeves |
| scarf | #76B456 | #4C8A3C | #2E5040 | scarf ring + end (v1 hue kept; `material.slots.scarf.lift` 0.3) |
| cream | #FFF0D2 | #EAD0A0 | #C8A880 | muzzle, jaw, ear insides, eye glint |
| dark | #6A4C4A | #4A3436 | #3A2C34 | hooves, knobs, eyes, nostrils, mouth floor |
hide sh lifted #8E6660 → #A47C70 in round 1 (sig_ground PASS, but mauve: a taupe llama in shade, pink-grey far leg).
Round 2 moved every sh along its OWN hue: hide #B27C42, cream #C8A880, patch #6A4430 → shaded figure reads tan-orange
(`final3/scene-noon-crop.png`, `scene-golden-crop.png`), sig_ground noon-shade +32 %, golden-shade +35 %; hide 3 tones,
cream 5 (were 8/8). `material.merge` {jaw, eyes, ears → head; neck1/2 → neck} + nostrils sunk flush (z 0.264) remove the
grey cream-line "beard" row under the nose at S (`r10/z-face2.png` base vs flush).

## Unique to me
1. **Extra animated parts**
   - *Neck* (neck/neck1/neck2 keyed via `NECK(fwd, twist, out, head)`, spread 0.3/0.35/0.35): idle sway between
     twist −16/+16 (≈ 50° total head yaw incl. the head key, held 30 frames each); walk (round 2): pitch −4 contact / +1
     pass + sideways sway ±4 toward the stance side, head tipped up 3, contact drawings lifted 0.025 m — the neck shows
     8–10 texels at S in every drawing (idle 10; `r6/zS-neck.png`, measured by `cil_neck.py`; round 1 had 0–3) and the
     head bob is 1.2 px (round 1: 5.5); talk nods 16° on the shut keys; emote telescopes (`.p` +0.05 m per link, +0.07 on
     the punchline) and scans ±30/36°;
     die lays it on the grass (`g8-die` stills, p1 wv-die2).
   - *Scarf end* `scarf0`: 1-link spring chain (f 5, ζ 0.55, limit 16°) on the chest front, KEYED fwd +22 in the walk
     (+32 run) with a ±4 swing per contact, so the 4 H/s trail leaves it hanging down the chest: visible in every walk
     drawing at 8/8 (`r6/m-walk.png`, `final3/clip-game.png`; round 1 it vanished under the hoodie); keyed out in the die.
   - *Ears* `earL0/R0` keyed: flick (out +35) in idle f60 and talk, down −18/up +14 per walk drawing, up +25–35 in
     vote/emote, down −35 in die.
   - *Jaw* (lower muzzle) 22–24° on talk open keys, 18° on the emote punchline. *Hood* bump rigid on the chest.
2. **My locomotion** — a long-legged **scurry-lope**: LegGait biped, `cycleTime` 0.267, duty 0.25, plant 'hold',
   `holdDrop` 0.05, `lift` 0.075, `bob` 0.035, `lean` 2, `arms` 28° (run 45: the forearm clears the muzzle), plus the
   authored ADD walk clip (length 4, step, f0 = left contact): contact lift, neck pitch/sway, scarf key, ear flick. Shins
   show in every drawing (no seated low drawing, `final3/clip-game.png` f7/f23/f39). Pose ids `walk:` +1 every 2 grid frames, 4/4 drawings
   (`game.readable`). foot_slide n/a (one contact drawing per step by design; in-hold ride 9 texels = the baked-sprite
   behaviour). Contact drawings show the planted hoof forward in `clip-game.png` f3/f11/f19.
3. **Expressions** — eyes: dark 0.085×0.08 m boxes on the 16-sided skull, turned to the surface normal (42° off the
   front), front 0.006 m proud, a 0.024 m cream glint flush in the upper outer corner. Blink/half/closed by `eye*.s` y
   (−0.8/−0.4), wide by +0.2. Mouth: the jaw (real snout, so 22–24° is allowed) shows the dark mouth floor. talk = jaw
   32/30° open (mouth floor ≥ 2×2 dark texels) + head tipped up/rolled + right hoof gesture; vote = eyes wide, ears up,
   neck leaning away (out 24), hoof thrown up above the ossicones at SE (upperArmR [40,0,162], `forearmR.s` +0.5);
   die = half-shut dazed lids (eye y −0.55: a 1-texel dash; BLINK vanished at 1x), ears down, face to the camera at SE
   (4 head variants on one 8-facing still, `r8/z-dieSE2.png`); emote punchline = its own read: neck bolt upright,
   +0.21 m telescoped, ears straight up (out 60), small 'o' mouth, both hooves to the chest.
4. **Game-speed readability** — walk: `game-onion.png` / `game-1x.gif` read as a brisk lope (bob + swinging sleeves +
   neck pump); talk beat every 6 frames (`talk.amplitude` 57 %); vote raises in 4 frames and holds 1.97 s
   (`vote.final_hold` PASS); die reads down in 18 frames (0.6 s) and holds; emote stretch held 12 frames per scan.
   Changed because of it: neck pump reduced 14 → 9° (p1 strip read as pecking), then (round 2, critic: the neck
   vanished at S and the head dropped 8 px) to −4/+1 with a sideways sway; arms 42 → 28 (sleeves flailed horizontal).

## 6. Clips and timing (30 Hz grid, `interp: 'step'`)
| clip | keys (f: what) | holds | reads at 1× |
|---|---|---|---|
| idle (loop 72, dynamics hold) | 0 sway right (neck twist −16, head −10) · 30 mid · 36 sway left + breath 0.028 · 50 blink (2) · 52 · 60 right-ear flick · 64 mid | 30/6/14/2/8/4/8 | head yaw swap + blink |
| walk (add, length 4) | 0 L contact: pos +0.025, neck −4 / sway +4, head −3, scarf fwd +22 swing +4, ears down · 1 pass: neck +1, ears up · 2 R contact (sway −4) · 3 pass | 2 each | scurry-lope, head steady |
| run (add, length 4) | neck +24/+16 forward, head −20/−12, ears back, scarf +32 | 2 each | neck-forward dash |
| talk (loop 24, dynamics hold) | 0 jaw 32 + head up/roll + hoof out · 6 nod (neck +16), jaw shut · 12 jaw 30, hoof higher, other ear · 18 nod, half-lid | 6 each | beat every 6 frames |
| vote (one-shot, length 40, held) | 0 dip (pos −0.04, neck +8) · 4 right hoof thrown up above the ossicones (upperArmR [40,0,162], `forearmR.s` y +0.5), neck leans away (out +24), eyes wide, ears up, `vote@handR` | 4 / held | raised hoof beside the neck |
| die (one-shot, legs fk, length 50, held) | 0 wobble, eyes wide · 6 knees buckle (pos −0.12) · 12 rolls 40° onto her left side, neck droops sideways (out +34) · 18 DEAD: lying on her side, neck on the grass, face to the camera at SE, half-shut dazed lids, `die`+`land` | 6/6/6/held | down at 8/8 |
| point (one-shot, length 42; close-out) | 0 wind-up: neck back, hooves in at the chest, half-lid · 4 aim (`POINT_AIM`): neck pokes forward on the target (NECK fwd 26, head −26 = tipped down onto it), eyes wide, ears pricked, RIGHT hoof forward near level (`upperArmR` [98, 0, 12], `.l` 0.5), LEFT hoof forward-UP (`upperArmL` [125, 0, 14], `.l` 0.4), jaw 8 · 10 settle (same aim, ears relax) · 36 hooves ease down, held to the end (idle resumes) | 4/6/26/6 | point held 32 f = 1.07 s at 1× (`final5/z1x-point.png`: 130 ms wind-up, 200 + 870 ms aim, 200 ms ease) |
| ghost (loop 72, legs float; close-out) | 0/18/36/54: the idle neck sway kept (twist −12 → 0 → +12 → 0), hover bob 0 → 0.04 m, hooves floating forward-low alternating, knees soft, half-lid on 54. `spec.ghost` {hover 0.14, keepHue 0.3, halo lift 0.2} draws ramp, gold halo, dissolving feet | 18 each | slow drift, 600 ms per drawing at 1× (`final5/z1x-ghost.png`) |
| ghost-spent (loop 72, legs float; close-out) | 0/18/36/54: the neck BOWED forward 10 and drooping to her left (out 30 → 22), head face-out (fwd 6, roll back −14), half-lids, ears down −32, hooves hanging, sinking −0.02 → −0.05 m. Dimmer ramp, no halo (module) | 18 each | droop sway (`final5/z1x-ghost-spent.png`) |
| lookout (emote, length 56) | 0 dip · 4 neck telescopes +0.15 m, tiptoe, scan left · 16 scan right · 28 punchline: neck upright +0.21 m, ears straight up, 'o' mouth, hooves to chest, `emote:exclaim` · 40 neck half back · 46 idle | 4/12/12/12/6 | stretch + scan + "!" |

## Self-critique (round 2; pack `shots/char-cilantro/final3/`, 83 pass / 21 warn / 0 fail)
| # | criterion | score | evidence (file · facing/frame · number) | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | `final3/turnaround.png` neck + ossicones + hoodie/scarf 8/8; walk drawings keep both halves 8/8 (`r6/m-walk.png`) | — |
| 2 | Pixel stability | 1 | idle off_grid/flicker 0/0, pan 0, night_pan 0; game flicker 88 legs-only (1 same-pose frame, 'hold' leg redraw) | module: hold-mode leg redraw |
| 3 | Line quality | 1 | speckle 40; grey row under the nose at S gone (merge + flush nostrils, `r10/z-face2.png`); 1 grey texel stays at jaw corners/ear roots | per-slot inner-line colour (module) |
| 4 | Tonal discipline | 1 | colours hide 3 / cream 5 / patch 5 (round 1: 8/8); isolated_px hide max 8 (want ≤ 2); key_speckle vote +18, die +14, lookout +7 | fewer patch facet edges |
| 5 | Ground separation | 2 | sig_ground 4/4 PASS (noon-shade +32 %, golden-shade +35 %) AND the shaded figure reads tan-orange, not mauve, by eye (`final3/scene-noon-crop.png`, `scene-golden-crop.png`) | — |
| 6 | Proportion, appeal, expression | 1 | talk jaw 32°: ≥ 2×2 dark mouth texels; lookout punchline its own pose (key_delta 43 %); die lids read at SE (`r8/z-dieSE2.png`); face still small at 1x | larger eye whites |
| 7 | Animation timing | 1 | single_frame 0, strobe ≤ 1; vote hoof above the ossicones at SE (`final3/clip-vote.png` f12), clear of the neck at W (`r7/m-vote-f12.png`); turn settle tail f48–f56 remains (motion M8) | module M8 |
| 8 | Weight, contact, game speed | 2 | game.readable 3.95 H/s, 0.267 s, 1.05 H; head_bob 1.2 px (was 5.5); neck 8–10 texels at S in every drawing; shins in every drawing; arms 28° (`final3/clip-game.png`, `game-onion.png`) | — |
| 9 | Personality, secondary | 2 | scarf end hangs in every walk drawing 8/8; neck sway + ear flick per drawing; telescope emote with its own punchline | — |
| 10 | Smears and FX | 1 | steady speech bubble, '!' on the punchline (`final3/clip-lookout.png` f36), vote sparkle, die dust; FX at 8 facings not checked | 8-facing FX stills |
| 11 | Facing and turns | 2 | 8/8 read; 45° turn steps held 2–5 frames (`final3/clip-turn.png`) | — |
| 12 | Technical | 2 | page_errors 0, deterministic PASS, draw calls colour 2 / normal 1, RTX 4090 (report gpu line); bake `bake2/` 7 clips × 8 dirs | — |
| | **total** | **18** | | |

Still weakest: (1) speckle/isolated hide px (patch facet edges, ear tips); (2) 1-px grey FLAG_CHAR inner lines on
cream at the jaw corners (outline.js tints inner lines blue-grey, no per-slot colour); (3) the post-turn settle tail
(motion M8 with a 3-link keyed neck). 1x real-time GIFs (`final3/game-1x.gif`, `clip-*-1x.gif`) could only be read as
single frames with the Read tool; the real-time judgement rests on `clip-game.png` holds (2×), `game-onion.png` and the
measured 1.2 px head bob.

## Cast close-out (2026-10-17): point, ghost, ghost-spent
Pack `final5/` (render-host, RTX 4090): **113 pass / 15 warn / 0 fail**; `cast_clips` PASS (was FAIL "missing
point,ghost,ghost-spent" in the pre-close-out pack `c0/`, current rules). The 15 WARN rows are the same rows as round 2
(colors/slot, speckle, isolated_px, sig.hide, die/vote/lookout key_speckle, micro, foot_slide n/a); every new-clip row
PASSes. Bake `bake3/`: 10 clips × 8 dirs, cell 82×99, no border warnings in the final pass (lookout FX cropped = normal).

| clip | evidence (8-facing still / strip / 1× tiles) | numbers |
|---|---|---|
| point | `c2/z-g8-point-f12.png` (S SE E NE N NW W SW), `final5/clip-point.png`, `final5/z1x-point.png`, `bake3/z-point.png` | key_delta 8 %, pose_read 50 % ×6, key_speckle +4, off_grid/flicker 0 |
| ghost | `c3/z-ghost-S.png` (S/SE ×6), `final5/clip-ghost.png`, `final5/z1x-ghost.png`, `bake3/z-ghosts.png` rows 1–8 | key_delta 65 %, amplitude 43 %, islands 2 (= the halo, now clear of the knobs) |
| ghost-spent | `c4/z-g8-ghost-spent-f0.png`, `c4/z-spent-S.png`, `final5/clip-ghost-spent.png`, `final5/z1x-ghost-spent.png` | key_delta 34 %, amplitude 14 % |

What I saw and changed:
- **Point at SE vanished** with the first aim (both hooves forward-UP, R fwd 125): the camera looks along SE, so a hoof
  raised ≈ 35° lies on the 30° view ray (`c1/z-cal-b.png`: right hoof gone at SE, fine at S/E/W). A symmetric level V
  (`c1/z-cal-c.png`) read at SE/E/W but left S as two side stubs. Final = asymmetric (`c1/z-cal-d*.png`, `c2/`): RIGHT
  hoof near level (SE/E pointer), LEFT forward-up (S/W/SW pointer), neck lunge + head tipped down onto the target.
  Reads: SE hoof thrust up-right toward the viewer with the face on it, E/W/SW a level arm + finger, N/NE/NW both
  hooves up beyond the outline. S is the weakest facing (one hoof forward-up at screen right, the right hoof
  foreshortened at the viewer): it reads "gesturing at you" more than a crisp point.
- **Ghost halo sat on the ossicone knobs** at S/SE with the default `halo.lift` 0.12 (`c2/z-ghost-S.png`) → lift 0.2:
  a 2-texel gap (`c3/z-ghost-S.png`). `keepHue` 0.3 keeps the hoodie faintly blue and the scarf faintly green.
- **Ghost-spent neck bowed straight forward foreshortened to nothing at S/SW** (a short-necked lump,
  `c2/z-g8-ghost-spent-f0.png`, `c3/`) → most of the bow moved into a sideways droop (NECK fwd 10, out 30 → 22) with the
  head face-out: the neck keeps its length at S and bows visibly at SE/E/W (`c4/`).
- The point used to end on an `IDLE_A` key (1 % key_delta WARN, the same drawing as the idle that follows) → ends on
  the ease key; key_delta 8 % PASS.
Not done: no `out/sprites/` copy (shared folder, outside my files): the lead copies `bake3/` when it ships.
