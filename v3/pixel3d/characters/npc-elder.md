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
