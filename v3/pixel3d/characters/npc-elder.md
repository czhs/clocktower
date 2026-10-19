# Elder (cast `npc-elder`) — design sheet

NPC, no blurb (inferred from the sprite + `pipgws/packages/assets/scripts/cast/npc-elder.ts`: "bald with a white fringe,
fair skin, a long dark slate robe, a little stooped, leaning on a plain wooden cane. Deliberately boring so it never
competes with the players"). Spec: `characters/npc-elder.js`. Pack: `shots/char-npc-elder/`. Render host: render-host.

(Stage 0 below was written before modelling; the sections after "FINAL" are rewritten from the final code + renders.)

## 0. Brief (Stage 0, before modelling)
- Concept: the town's oldest resident — a small, stooped, bald old man in a long slate robe who leans on a plain
  wooden cane, nods along to everything and hobbles about (quickly: game speed is the same for everyone).
  Adjectives: **calm, frail, kindly** → CAST_PORTING §10 "calm, slow, deliberate" + "boring on purpose (NPC)": body f 1.8
  ζ 1, head f 2 ζ 1, long holds, few keys, quieter motion than any player.
- Identity (ref facings, `refs/cast/npc-elder.png`): (1) 1× blob = a round BALD head sitting forward on a hunched
  slate column, plus the cane standing apart on his left (screen right at S/SE, screen left at N); (2) palette: slate
  robe `#4A4C58` (biggest), skin `#D8B494`, white-grey fringe `#AEAAB0`, cane wood `#6A5038`, belt `#5A4A3A`; (3) prop:
  plain cane with a small crook in the **LEFT** hand (S/SE frames: cane at screen right; v2 E frame swaps hands — a
  mirroring artefact, ignored); (4) face: two 1×2 dark eyes, no mouth drawn, fringe patches beside the face, ears at
  profile; (5) v2 motion: 1-px bob, the cane hand moves with the step (`p.step` lifts the hand + leans the cane).
- Body plan: **plain townsfolk on `chibi()`** (CAST_PORTING §6 "npc-*", `bodyPlan 'biped'`), 2.7 heads, robe to the
  ankles with a hem sole disc, the stoop built into the REST geometry (neck/head joints forward, a hump on the back of
  the upper robe) so every clip — incl. the LegGait drawings — is stooped.
- Scale: v2 25 px → **H 1.05 m** (castHeight floor; the smallest cast member) → ≈ 38 texels at vh 10 →
  `heightPx [34, 44]` (the biped band 45–62 is for adult humans). Skeleton height 1.08, the stoop brings the crown to
  ≈ 1.05.
- Game-speed arithmetic: v_game = 3.95·H = **4.15 m/s**; N = 4 drawings, cycle 0.3 s (swingFloor 'gait') → C = 1.245 m
  = 1.19 H, step 0.62 m. Leg (hip 0.39 → ankle 0.06) = 0.334 m = 0.32 H → duty ≤ 2·0.6·0.32/1.19 = 0.32 → **duty 0.25**
  (a short flight). Gait word: **hobble** (a stooped scurry with a cane plant).

## Unique to me (planned before modelling)
1. **Extra animated parts** (all KEYED, no spring chains — calm character, no jelly):
   - **Cane** (bone `cane` under `handL`, kept plumb by cancelling the arm's fwd/out): plants AHEAD on the right-foot
     contact drawing in the walk (a real cane moves with the opposite leg), swings forward in the flights; raised
     tip-up over the head in the vote; both hands stacked on the crook in the emote; lies on the grass in die.
   - **Lower robe** (bone `robe`, pivot at the belt): sways toward the planted side and lags in the walk (±6° out),
     crumples (`robe.s`) in die.
   - **White brows** (brow bones, fringe slot): up in vote/talk-open keys, down/knit in the emote nods.
   - **Mouth plate** (bone `mouth`, buried at rest, pushed out with `mouth.p` on talk-open keys).
   - FX: speech bubble (talk), step dust every 2nd step, `land@caneTip` on the cane plant in the emote, vote sparkle
     at the cane tip, die dust ring.
2. **My locomotion: a hobble** — LegGait 'biped', `plant 'hold'`, `swingFloor 'gait'`, poses 4, duty 0.25, bob 2
   texels; contact is a visible DRAWING twice: shoe toe flicks ≥ 3×2 texels out of the hem (brown leather on slate) and
   the cane tip lands ahead on the R contact drawing. The head is held forward on the stoop and nods with the bob.
3. **Expressions in the new style**: eyes = dark 2×2 texel boxes (0.065 × 0.07 m) on the 16-sided skull surface; blink
   = `eye*.s` y −0.8 (2 frames once per idle); bushy WHITE brows (0.09 × 0.032 m bars) carry the mood (up = surprised /
   voting, knit = listening); a buried mouth plate opens a 3×2 dark "o" for talk; a skin nose bump ≥ 2 texels proud
   carries the profile at E/W (ear behind the eye line, skin over the fringe). talk = mouth + right-hand beat + head roll
   toward the camera; vote = brows up, eyes wide, cane up; die = eyes shut, mouth slack; emote = eyes shut + slow deep
   nods.
4. **Game-speed readability**: walk judged on `game-1x.gif` / `clip-game.png` / `game-onion.png` + pose ids (4 per
   cycle); talk beat every 8 frames (the right hand ≥ 25°); vote up by f3; die down by f22 (0.73 s); emote nods held
   6 frames each.

## Clips (planned)
idle, walk, run (procedural, optional), talk, vote, point, die, ghost, ghost-spent, **nod** (emote: "lean on the cane
and nod"), + turn audit.

---
# FINAL r2 (after critic r1 15/24; rewritten from the code + renders, 2026-10-16, RTX 4090 render-host)

r1 (15/24, not shipped): symmetric 3.9 px "hobble" bounce, sideways point, emote = ghost pose, cane behind the skull in
the vote, die sitting at SW + scream mouth, dark sleeve band under the chin at SE, cane 0 px at NE, near-white fringe
bowl. r2 fixes every character-owned issue below. Evidence: final pack `shots/char-npc-elder/` (`report.txt` 119 pass /
17 warn / 0 fail), iteration stills `r8/` (`ta-a.png`/`ta-b.png` turnaround ×3, `g8-<clip>-f<k>-x2.png` 8-facing key
stills, variant searches `v8-pt{A..E}` point, `v8-d{A,B}` die, `v8-vA` vote, `lineup25.png` elder / porter / green-hood
silhouettes at 25 %), bake `shots/char-npc-elder/bake/` (`--cell 100` → trimmed 58×63, anchor [29, 49], 10 clips × 8
dirs, walk 4 frames, 0 border touches; crops `pv-walk.png`, `pv-dienod.png`, `pv-nod.png`) — the lead copies it into
`out/sprites/`. r1 spec kept as `r0-before/npc-elder.js.txt`.

## Build (as coded, r2 changes marked)
- `chibi({ height 1.08, heads 2.7, legs 0.85, arms 0.95 })`; stoop: neck joint +0.055 z / +0.012 y, **head joint +0.05 z
  (r1 0.025)**, **bigger back hump** (r 0.13 at z −0.11). `head_frac` 0.353, `height_px` 35–39.
- Head: 16-sided bald lathe; **fringe band narrowed** (sides |az| > 80°, y 0.055–0.22, back only below 0.17) and
  **darkened to v1 grey** `#D6D2DA/#AEAAB0/#7E7688` (r1 `#EEEAF0` read as a white bowl at N/NE/E). Nose, ears, 2×2
  eyes, fringe-slot brows, buried mouth plate.
- Robe: **hem r 0.27 (r1 0.25)**; **shins in the robe slot** (r1 dark eye slot read as trousers in the stride gaps).
- Cane arm: **L up [48 out, 10 fwd], fore [28, 32] (r1 [32,10]/[18,55])** — the forearm no longer crosses under the chin
  at SE; `material.sides.upperArmL 'mid'`. Cane **r 0.04 (r1 0.032), rest tilt [−24, 0, 18] (r1 [−16, 0, 7])**: the
  cane stands out as a diagonal at 6/8 facings at 25 % (`turnaround-silhouette.png`, `r8/lineup25.png`).
- Palette otherwise as r1. Opt-ins: `innerLine 'tone'`, `whiteKeep 0.7`, `creamKeep [1, 0.85]`, `merge { neck: 'head' }`,
  `spec.ghost { hover 0.14, keepHue 0.2 }`, LegGait `plant 'hold'`, `swingFloor 'gait'`. No light (no lantern).
- Locomotion: V 4.15 m/s, cycle 0.3, poses 4, duty 0.25; **`clips.walk` keys `pos` per drawing (replaces the plan bob;
  `bob` 0.056 → 0.03 is now only the run's fallback)**.

## Unique to me (re-checked on the r2 renders)
1. **Extra animated parts** (keyed): the CANE — planted ahead on the R-contact drawing k2 with his weight dropped onto it
   (`clip-game.png` f3/f12/f21/f30/f39: chest forward, head down, tip ahead); hoisted tip-up beside the head in the vote
   (`r8/g8-vote-f3-x2.png`: beside the skull at S/SE/E/NE/N/SW, behind the head edge at W); **the pointer in the point**
   (`r8/g8-point-f4-x2.png`: tip forward-up along the facing at SE/E/NE/N/NW/W, forward-down stub at S, hidden at SW
   where the open right hand carries it); **tapped twice on the ground in the nod** (lift → plant, dust ring);
   lying on the grass in die. Robe sways ±6° per drawing; brows up (vote/talk/point), knit (nod).
2. **Locomotion: a hobble** — asymmetric: `game.head_bob` **2.4 px, limp 1.6** (r1 3.9 px, limp 0.1–0.3); head height
   per drawing 18.0 / 18.8 / **16.4** / 18.8 px — the heavy drawing is the cane plant. `game.readable` 3.95 H/s, 0.3 s,
   1.18 H/cycle, 4/4 drawings, holds 2–3, off_grid 0, flicker 0, strobe 1; `game.feet_visible` SE a foot in every
   drawing. `foot_slide` n/a (stance < 1 drawing) — judged on `clip-game.png` (the frame sheet of `clip-game-1x.gif`
   with durations): every 4th drawing lurches down onto the cane, the others step lightly — a limp, not a bounce.
3. **Expressions**: blink (idle), mouth "o" (talk), wide eyes + brows up (vote, point), shut eyes + **closed mouth**
   (die; r1 slack MOUTH 0.3 read as a scream "O"), shut eyes on each nod with the face visible at S/SE/SW
   (`r8/g8-nod-f18-x2.png`: head pitch now ≤ +11°, chest ≤ +4.5°).
4. **Game-speed readability**: walk as above; talk beat every 8 frames (`talk.amplitude` 21 %); vote up by f3 (held
   1.7 s, 32 % off idle); point out by f4 held 30 frames (`point.pose_read` 27 %); die down by f22 (final hold 1.83 s,
   108 % off idle); nod taps at f4 and f18 (`nod.pose_read` 25 %).

## Timing charts (30 Hz)
- idle (72, step): 0 breath0 · 24 breath1 · 34 blink 2 · 36 · 46 weight onto the cane, head cock · 62 breath0.
- walk (4 drawings, f0 = L contact): k0 light L step (pos −0.008) · k1 flight (pos 0) · **k2 R contact: cane planted
  ahead, pos −0.044, chest +10, head down** · k3 flight (pos 0).
- talk (32 loop, speak@0): 0 hand up, mouth open, brows up · 8 down · 16 hand forward-out, mouth open · 24 down.
- vote (31, held): 0 dip 3 · 3 cane hoisted up-and-OUT beside the head (`upperArmL` [150, 0, 42], `cane` [372, 0, 70]).
- point (66): 0 squint/gather 4 · 4 **cane raised forward-up along the facing (`upperArmL` [50,0,6], `cane` [−42,0,6]),
  right hand open forward-low ([62,0,22])**, eyes wide, brows up · 34 blink 2 · 36 hold · 52 down · 60 idle.
- die (60, legs fk): 0 sway, hand to chest 8 · 8 knees give 6 · 14 tipping back 8 · 22 lying rolled onto his right
  side (`hips` [−84, 0, −70], pos z −0.2), mouth closed, cane on the grass (die + land) · 28 settle, held.
- nod (62): 0 cane lifted 0.1 m, brows up 4 · **4 TAP + nod (land@caneTip)** 8 · 12 up, "mm", cane lifted 6 ·
  **18 TAP + deeper nod (land@caneTip)** 8 · 26 up, head cock, pleased brows 22 · 48 idle. The right hand rests at the
  small of his back throughout (the ghost keeps both hands on the crook: emote ≠ ghost).
- ghost / ghost-spent (72 loop, 4 keys × 18): both hands on the crook, ±3° roll, 1-texel bob; spent = head bowed.
- run: procedural LegGait at 2·V (optional; not tuned).

## Self-critique r2 (scored like the critic; when in doubt 1)
| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | `turnaround-silhouette.png` 25 % row: cane diagonal outside the body at S/SE/N/NW/W/SW; `r8/lineup25.png` vs porter / green-hood | cane only 3 px at NE, 18 at E (body occludes the far-side cane) |
| 2 | Pixel stability | 2 | deterministic 0 px, pan 0, night_pan 0, game off_grid 0 / flicker 0 / strobe 1, hold_redraws 0 | — |
| 3 | Line quality | 1 | silhouette_line / inner_lines PASS; `isolated_px` skin max 5 at E | skull specks at E |
| 4 | Tonal discipline | 1 | `colors/slot` WARN (eye 9, wood 8); nod/point key_speckle +12 | fewer wood tones on the angled cane |
| 5 | Ground separation | 2 | `sig_ground` noon-shade dL +32 %, golden-shade +40 % | — |
| 6 | Proportion / expression | 1 | die mouth closed, nod face visible at S/SE/SW; mouth still tiny at 1× | — |
| 7 | Animation timing | 2 | point/nod/vote/die keys distinct (`r8/g8-*`), single_frame 0, holds as charted | — |
| 8 | Weight / contact / game speed | 2 | head_bob 2.4 px limp 1.6, heavy cane drawing every cycle (`clip-game.png`) | foot_slide not measurable |
| 9 | Personality / secondary | 1 | hobble now on screen, cane taps, cane pointer; `turn.foot_slide` 4.02 WARN (module idle steps) | turn settle redraws |
| 10 | Smears / FX | 1 | vote sparkle, die dust + wisp, nod tap dust — but `land@caneTip` dust draws at the root, not the tip; no smear (a cane swing would read as a strike) | module: socket land dust |
| 11 | Facing / turns | 1 | 8 facings read; vote cane at the head edge at W; die final foreshortened (head over body) at W | — |
| 12 | Technical | 2 | page_errors 0, draw_calls 2/1, RTX 4090, cast_clips PASS, bake 0 border touches at `--cell 100` | — |
| | **total** | **18** | | |

Weakest three: (1) far-side cane at E/NE stays inside the body (18 / 3 px); (2) die final at W reads as a head over a
ball (any lying axis is foreshortened at one facing pair; moved it from SW/NE, the game's diagonal facings, to W/E);
(3) nod tap dust appears at his feet, not at the cane tip (fx module).
