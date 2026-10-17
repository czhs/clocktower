# Chonk — design sheet (cast member `chonk`, mascot 15-122)

"A goose the size of a person. Nobody argues." Code: `characters/chonk.js`. Pack: `tools/charpack.sh chonk --preset cast --raw`
→ `shots/char-chonk/`. Identity source (read only): `refs/cast/chonk.png`, `pipgws/packages/assets/scripts/cast/chonk.ts`.
(Stage 0 written before modelling; sections marked *current* are rewritten from the code at the end of every round.)

## T3 touch-up (2026-10-16, Clocktower-only rule) — what changed (all renders render-host RTX 4090)
- **Combat check:** no clip was combat-flavoured (walk/run/talk/vote/die/plop; die has no `hurt` flash or impact, plop is
  a smug sit). Nothing de-combatted.
- **New `point`** (one-shot 84 f, the game's shared emote): gather 4 f (squash, far wing cocked back) → POINT held 26 f
  (body yawed −25° so the LEFT flank leads, head counter-turned to stare down the wing, beak open 32°, left wing
  [110, 0, 45] stretched along its length `wingL.s` y +0.5 = a feather "finger" ahead of and above the beak) → firmer jab
  held 32 f (lean in, root +0.03 fwd) → wing folds 10 f → rest (f72). Probed 12 variants (`probe/tu1-`, `tu2-`, `tu3-g8-ptest-*`):
  the near (right) wing and level/low forward wings vanish into the ball at SE; the far wing forward-up is a
  screen-horizontal slab past the face at SE/E/NW/W (`probe/tu4-g8-point-f30.png`). S hides it (pointing at the camera): accepted.
  1x: `t3-strip-point-1x.png` (870 + 1070 ms held point drawings).
- **New `ghost` / `ghost-spent`** (loops 72 f, step keys 18 f, `dynamics: 'hold'`): honk's recipe — a `halo` bone appended
  LAST (head child, joint inside the head ball), ring authored at ×0.001 so it is a hidden speck; `ghost` keys
  `halo.s` 999 (ring ≈ 0.17 m over the crown), `ghost-spent` keys 1 (ring stays hidden; scale 2 = the spent signal).
  `material.vertex` reads halo/head bone scale ratio → `vGhost`; `material.tones` re-maps hi/mid/sh by √luma onto
  `#4A64A0 → #E4F6FF` (slope 1.2 from 0.12: the down keeps 3 steps, wings a step darker, ^ eyes dark blue), spent =
  45 % desaturated × 0.62; 2×2 Bayer `discard` dissolves bind y 0.16 → 0.62 (spent 0.56) = v1's fading bottom; a
  night self-glow (keeper kNight) and a flat emissive gold halo. Hover: root +0.27/+0.23 (incl. the ≤ 0.1 m leg-IK dip),
  ±4° roll, wings eased out 22°, shins+feet scaled away (`shin*.s` −0.98). Spent: lower (+0.21/0.18), head bowed 10°,
  eyes flattened, wings hanging, tail down, slight squash. Evidence: `probe/tu4-g8-ghost-f0.png`, `probe/tu1-g8-ghost-spent-f0.png`,
  night `probe/tu5night-g8-ghost-f0.png` (stays pale vs `tu5night-g8-idle-f0.png`), 1x `t3-strip-ghost{,-spent}-1x.png`.
- **A/B:** living renders pixel-identical after the change (idle f0/f36, talk f0, vote, die, plop f18, walk drawing 1 at
  8 facings: 0 px differ, `chonk_ab.py.js tubase- tuab-`).
- **Module-fix re-check:** walk still reads at game speed at 1x (`t3-strip-game-1x.png`: squashed contacts with a foot out,
  tall pass drawings with wings back, feet under the ball every contact; head_bob 5.5 px limp 0.7; game.readable PASS).
  No hem; feet clear the ball.
- **Pack:** `tools/charpack.sh chonk --preset cast --clips idle,walk,run,talk,vote,die,plop,point,ghost,ghost-spent,turn --raw`
  = 111 pass / 17 warn / **0 fail** (point/ghost/ghost-spent rows all PASS; point.pose_read 42 % ×32, key_speckle +2).
  Bake `out/sprites/chonk.*` = 10 clips × 8 dirs (idle 3, walk 4, run 3, talk 4, vote 2, die 5, plop 8, point 5, ghost 4,
  ghost-spent 4), cell 94×88, no border warnings (`t3-bake-rows.png`).

## 1. Concept
A giant, perfectly round white goose: a ball of down that fills its frame, a tiny head perched on the front-top, a small
orange beak, ^ ^ happy squint with pink blush, tiny orange feet, folded grey wings on the flanks and a pointed tail tuft up
at the back. Adjectives: **big, soft, unstoppable** (+ content) → heavy personality (f 1.8–2.5, ζ 0.7), slow wind-ups, long
squashes, a heavy bounce on every contact (CAST_PORTING §10 row "big, soft, unstoppable").

## 2. Body plan and game-speed numbers
Plan: **bird, horizontal ball** (CAST_PORTING §6; `bodyPlan: 'bird'`). Custom skeleton (not `bird()`): the template has
no separate squash bone, and squashing its `body` root would scale the IK'd legs. Mine: `hips` root (legs) → `spine`
(waddle roll / lean pivot) → `ball` (leaf: the body mass, SQUASH bone via `ball.s`) + `chest → neck → head` and `wingL/R
→ wingTipL/R`, `tail` as squash riders (`.p` offsets).

H = 1.50 m (v2 37 px → 1.48; mascot +1 %), ≈ 54 texels at vh 10. Hip joint 0.30 m (inside the ball), leg 0.26 m
(0.17 H) of which ≈ 0.08 m shin + foot show under the ball.
- v_game = 3.95·H = **5.93 m/s**; N = 4 drawings × hold 2–3 grid frames; cycle C = 1.2 H = 1.80 m → 0.30 s (9 frames).
- duty bound: β ≤ 2·reach·leg/C = 0.17 → **β 0.08** (walk, r2: less hip dip on the planted foot), 0.06 (run).
- Gait: **waddle-hop** — two bounces per cycle like the v2 walk (step L, pass, step R, pass): each contact drawing the ball
  lands SQUASHED (4 texels lower, wider) and ROLLED onto the planted foot, each pass drawing it is airborne (≈ 3 texels above
  stand, slightly stretched), wings flick out, feet tucked. Something BIG carries the rhythm: the whole ball (squash + 7 texels
  of vertical travel + ±12° roll).

Why the LEGACY Gait (no `locomotion.plan`): LegGait does not play authored walk/run poses (backlog M1) and its bird branch has
no squash, so neither the squash nor the wing flicks nor the tail wag could be keyed per drawing. The legacy Gait plays the
authored `clips.walk/run` upper body (incl. `ball.s` / `.p` channels) with the chibi recipe (CAST_PORTING §8): walk =
WALK branch at v_game (`runFroude` above the game Froude), `poses [4,4]`, `legIK 'pose'` (feet exact at pose frames,
ride the root inside a hold: inherent, = v2's 0.32 H per drawing).

## 3. Silhouette (25 % blob)
1. **The ball** — 1.06 m wide (0.7 H) by 1.0 m tall: the widest blob in the cast (v2 lineup: 26 of 32 px wide).
2. **Tiny head on the front-top + pointed tail tuft up-back** — at S a small knob on top of the ball (snowman), at E/W
   a knob forward-top and a spike up-back (goose). Closest look-alikes: maxflow (round plush, but orange with ears and a
   big tail), honk (goose, but slim with a long black neck). Nothing else is a ball wider than it is tall.

## 4. Proportions
| part | m | texels @ vh 10 |
|---|---|---|
| height (head top) | 1.50 | 54 |
| ball Ø × height (y 0.13 → 1.10) | 1.07 × 0.97 | 38 × 35 |
| head Ø (lathe, sits at z +0.22) | 0.43 | 15 |
| beak (upper) w × h × l | 0.13 × 0.07 × 0.12 | 5 × 2.5 × 4 |
| eye ^ (chevron) | 0.10 × 0.065 | 3.6 × 2.3 |
| wing (folded, on the flank) | 0.27 × 0.62 | 10 × 22 |
| tail tuft | 0.26 long | 9 |
| foot w × l (legs at x ±0.19) | 0.17 × 0.22 | 6 × 8 |
Head ≈ 0.29 H (v2: 9 of 33 px).

## 5. Palette (sRGB `[hi, mid, sh]`; 4 slots + 1 accent) *current*
| slot | hi | mid | sh | use |
|---|---|---|---|---|
| down | `#F6EEE6` | `#DCD3D8` | `#9C8EA6` | ball, head (signature, lightest mass; v1 `#dcd5dc`) |
| wing | `#CCC2CE` | `#A89EB2` | `#776B8A` | folded wings, tail tuft (v1 wing = darker down; ≥ 15 % L below `down`) |
| beak | `#F7AA52` | `#E2802C` | `#A0502E` | beak, shins, feet (v1 `#e8892e`) |
| ink | `#5C4660` | `#3F3046` | `#3A2C40` | ^ eyes, mouth inside (no black; ≥ night floor) |
| blush (accent) | `#F2AAA6` | `#E0908E` | `#B07078` | cheek blush |
White rules (§5): no pure white (hi `#F6EEE6`), sh mauve `#9C8EA6` ≥ 15 % L over grass shadow `#3B6D5F` and 120° off its hue.

## Unique to me *(r2, re-checked against the r2 renders)*
1. **Extra animated parts** (all KEYED per drawing, no spring chains — head/hand chains re-snap in holds, backlog M5):
   - **ball squash/stretch** (`ball.s` + riders `chest.p`, `wingL/R.p`, `tail.p`, and r2 `ball.p` lift via `SQ(a, dy, cx)`):
     walk contacts squash 0.22 with the ball LIFTED 0.11 m off the hips (feet show under it), pass drawings stretch 0.04 and
     fly (+0.07 lift); idle breath 0.035; vote dip; die/emote landings 0.2. Checked: `probe/f-walk-d0/d1/d2.png`.
   - **wings**: walk = pass drawings swing the wings BACK 38° and out 34° (r2: the swing is in the profile plane, so the
     silhouette changes at E/W, `probe/f-walk-d2.png`, `clip-game.png`), contacts forward 18°; run = flap back 52°/out 36°
     (capped so the far wing never rises behind the head at SE, `probe/r3-g8-run-f1.png`); talk = alternating wings (near
     out 60 on f0, far out 58 on f12); vote = both wings up in a V; emote = akimbo then flop.
   - **tail** (r2 blade, `down` slot, rises ~28°): wag ±24° per walk drawing, never pitched up in pass/vote/plop (no antenna at
     S, no dark end cap at N: `turnaround.png` N, `probe/r4-g8-vote-f5.png` N).
   - **head + nape** (r2): a down `nape` lathe on the head bone (same part as the head ball, so no part line) blends head into
     ball from behind: N/NE/NW read as a pear like v1 N, not a snowman (`turnaround.png`). Head counter-roll in the waddle with the
     chest shifted back over the centre (`ROLL_C`), so both contacts bob equally.
   - FX: `land` dust ring in light dust tones on the plop (r2: no `poof@hips` eggs), `speak` bubble, vote sparkle, run feathers.
2. **My locomotion — waddle-hop** (see §2): V 5.93 m/s, cycle 1.71 m / 0.289 s (game.readable), β 0.08, reach 0.6,
   poses 4, spacing 0.5 m, swing lift 0.28 m (walk) / 0.08 (run). r2 per-drawing head joint (raw clip-game, dir 0/1/2):
   pass 173.3 / 171.7 / 166.9 px vs contacts 177.6+178.5 / 176.4+176.3 / 173.4+173.2 → BOTH contacts drop 4-6 texels
   (r1: 1 and 4 = limp). Planted foot visible in every contact drawing at S, mostly at SE/E (toed-out webbed feet poke past
   the squashed ball; `clip-game.png` f4/f12/f22, `probe/cgame1x.png`). foot_slide is n/a for this hop gait (tools).
3. **Expressions** — eyes = dark **chevron ^** (ink, 0.10 × 0.065 m, x ±0.076, turned 26° out); `eye*.s` swaps HAPPY / OPEN
   / SHUT. Beak = upper + lower on `jaw`; r2 talk opens 44-48° with the chin up 18°, over a 0.042 m ink slot → a 3-texel dark
   gap at S (`probe/faceS.png`). Blush = accent cheeks. Die toes point out along the shins (r2).
4. **Game-speed readability** (r2, judged on `clip-game-1x.gif` strip `probe/cgame1x.png`, `game-1x.gif`, pose-id log):
   walk 4/4 drawings per 0.289 s cycle, holds 2-3; one-word read at 1x: "waddle-hop" — squashed contact with a foot out /
   tall pass with wings back; talk: a ≥ 50° wing change every 12 frames + beak/head every 6 (`clip-talk.png`); vote up in 3
   frames, held; die readable ≈ 0.6 s, held 2 s with toes out; plop: puff → plop + light dust ring → settle.
   Personality: body f 3.5 ζ 0.8 r 0, head f 4 ζ 0.8 r 0; no chains.

## 6. Motion list (30 Hz) *current — see code CLIPS*
- idle (loop 72, step): f0 rest (hold 30) / f30 breath in / f36 goose glance (eyes OPEN, tail flick) / f54 breath out.
- walk (legacy Gait authored, length 4, f0 = L contact): contact (root +0.035, ball lift 0.11 + squash 0.22, spine roll 7
  with chest shifted back 0.08, head counter-roll, wings fwd 18, tail wag 24) / pass (root +0.06, ball lift 0.07, stretch
  0.04, wings back 38 out 34 tips 22, tail wag) / contact mirror / pass.
- run (length 4): contact (squash 0.1, wings fwd 12 out 4) / flap-up (pos +0.12, wings back 52 out 36) / contact / flap-up.
- talk (loop 24): f0 beak open 48 + chin up + near wing out 60 / f6 shut, squash, wing half / f12 open 44 + far wing out 58 /
  f18 shut, far wing half.
- vote: dip (f0, 3) → both wings V up, chin up, eyes OPEN (f3) → held (tail −8, not up).
- die (legs fk): wobble → tip 42° → lands on its side → settle → held DEAD (eyes shut, toes along the shins, feet out).
- plop: puff (tail −8) → hop → PLOP sit, squash 0.22 + `land` dust ring (f18) → settle → idle (f40).
- point (t3, 84): gather (f0) → POINT far wing fwd-up (f4) → jab (f30) → fold (f62) → rest (f72).
- ghost / ghost-spent (t3, loop 72, step 18): hover hi → mid → lo → mid with ±4°/±3° roll; halo only in ghost.

## Round 2 (critic-chonk 16/24 → fixes, all renders render-host RTX 4090)
| critic issue | fix | evidence |
|---|---|---|
| contact drawings bury the feet | contacts lift the ball 0.11 m off the hips (`SQ(a, dy)` → `ball.p` + riders; not limited by the reach dip) and squash 0.22; feet toed out ~35°, spacing 0.5; feet/shins `material.sides` 'mid' (lit beak tone, no far-half brown) | `probe/f-walk-d0.png` (S contacts: both feet out), `clip-game.png` |
| feet show in pass | swing lift 0.28 m tucks them (also lifts the reach-dip that cancelled the r1 hop) — feet still partly show under the flying ball | `probe/f-walk-d*.png` |
| one-sided bob (limp) | roll 7° with the chest shifted back over the centre (`ROLL_C`), head lateral ≈ 0 | head joint table in Unique #2 |
| snowman rear + dark tail hole + NE eye px | nape lathe (head bone), tail blade in `down`, no upward tail pitch; eyes moved/turned (the 1-px NE eye pixel PERSISTS: see open issues) | `turnaround.png`, `probe/heads-*.png` |
| wing flick invisible at E/W | pass wings swing back 38° (profile plane) | `probe/f-walk-d2.png` |
| plop dust eggs | `land` ring only, light dust tones | `clip-plop.png` f30/f34 (a light ring of motes at the base; still partly under the body) |
| die foot triangle | `footL/R: [80,0,0]` in DEAD: toes along the shins | `probe/r3-g8-die-f40.png` (SE: foot points out; E: a 3x2 end-on foot remains) |
| run far wing = ear | runUp wings back 52 / out 36 | `probe/r3-g8-run-f1.png` SE |
| talk gesture every 0.8 s | alternating wings every 12 frames, jaw 44-48, chin up | `clip-talk.png`, `probe/r2-g8-talk-f0/f12.png`, `probe/faceS.png` |
| golden apricot (look) | cooler down hi tried (#F3F1F5): dH 23 → no gain, reverted; needs the look-side cap | `scene-golden-crop.png` |
| tone/speckle budget | wing hulls 4→3 rows; nape kept off the ball front (z −0.11) | colors/slot wing 11 (unchanged), blush 7, isolated down max 8 (r1 8) |

Open: NE/NW 1-px eye at the face edge (removing the eyes removes it, moving them inward 0.02 m did not); die at E keeps a
small end-on foot; isolated_px down 8 / key_speckle die +16, plop +19; golden-sun WARN (look); a faint part line across the
chest where the nape meets the ball in moving drawings (SE talk/walk).

## Self-critique (r2, all renders on render-host RTX 4090, `shots/char-chonk/` + `probe/`)
| # | criterion | score | evidence |
|---|---|---|---|
| 1 | Silhouette | 2 | ball + head + tail spike at 6/8; rear now a pear (v1 N) |
| 2 | Pixel stability | 2 | off_grid/flicker 0 in every clip (run re-checked after the nape fix), pan 0, deterministic |
| 3 | Line quality | 1 | silhouette_line 0, isolated down max 8, NE eye px |
| 4 | Tonal discipline | 1 | wing 11 / ink 7 / blush 7 tones; key_speckle die +16 plop +19 |
| 5 | Ground separation | 1 | golden-sun WARN dH 24 (look-owned) |
| 6 | Proportion, appeal, expression | 2 | rear no longer a snowman; talk beak 3-texel gap with chin up; ^^ at S |
| 7 | Animation timing | 2 | talk: ≥ 50° wing change every 12 frames + 6-frame beak/head beats; vote 3 f; die 0.6 s |
| 8 | Weight, contact, game speed | 2 | both contacts dip 4-6 texels; planted foot shows in contacts; 0.289 s, 4/4 |
| 9 | Personality, secondary | 2 | wing swing visible at E/W; tail no antenna; squash/roll |
| 10 | Smears and FX | 1 | plop ring lighter/wider but partly under the body |
| 11 | Facing and turns | 2 | unchanged |
| 12 | Technical | 2 | page_errors 0, draw calls 2/1, bake 7 clips x 8 dirs |
| | **total** | **20** | |
