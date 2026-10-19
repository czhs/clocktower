# Mincut (cast `mincut`) — design sheet

"A red panda who finds the weakest link." (CMU 15-451 mascot.) Spec: `characters/mincut.js`. Pack: `shots/char-mincut/`,
evidence `shots/char-mincut/self/`. Identity source (read only): `pipgws/packages/assets/scripts/cast/mincut.ts`,
`refs/cast/mincut.png`. Render host: render-host (RTX 4090, every render). Round 1 (author) → round 2 (critic 17/24 fixes), 2026-10-16.
Round-2 evidence: `shots/char-mincut/r2/` (z-*.png 8-facing crops, s-*1x.png 1x GIF sheets, sil-lineup.png).
**Round 3 (cast close-out, 2026-10-17): added the game clips point, ghost, ghost-spent** (everything else unchanged).
Evidence `shots/char-mincut/r3/`: point probes `pt/pu/pv/pw/px-stack.png` (variant `shots/char-mincut/mincut_pt3.js`),
final 8-facing keys `g8-new-stack.png` (rows: point f4, ghost f0/f32, spent f0/f36), `ghost-zoom.png`, 1× GIF frame
sheets `s-point1x.png` / `s-ghost1x.png` / `s-ghostspent1x.png`, baked rows `bake-new-rows.png`, logs `pack.log`, `bake.log`.

## 0. Brief
- Concept: a plush-toy red panda, unclothed, russet fur, white face mask (muzzle, cheeks, brow spots) with the russet
  "tear" stripe between cheek and muzzle, round white-rimmed ears with dark centres, dark legs/arms/belly, and a big
  ringed tail curled in a low C beside her LEFT hip (r2). Adjectives: **sharp (scrutinising), smug, plush-cute** → personality
  body f 3 ζ 0.6 r 0, head f 3.2 ζ 0.65 r 0 (CAST_PORTING §10 "sly, smug"); actions: a lingering scrutiny, a snap of
  discovery, a smug hold.
- Body plan: **upright chibi** (`chibi({ height 1.2 (skull top), heads 2.3, legs 0.75, arms 1.1, snout 0.25 })`, ears
  1-link keyed bones, tail = two keyed bones), `bodyPlan 'uprightAnimal'`, `locomotion.plan 'biped'` (LegGait, plant
  'hold' picked by 'auto'). Not a quadruped: v2 draws her upright (CAST_PORTING §2, §6).
- Game-speed arithmetic: v2 32 px → **H 1.28 m** (ear tops). v_game = 3.95·H = **5.06 m/s**. Leg (hip 0.39 → ankle
  0.064) = 0.33 m = 0.25 H → duty bound 2·0.6·0.25/1.15 ≈ 0.26 → duty 0.18 → a **scurry** with a flight phase. N 4
  drawings, cycleTime 0.3 s → C ≈ 1.15 H (rendered 0.289 s / 1.14 H). Run (Storyteller-speed, optional) 2·v, 0.267 s.
- Identity (ref facings): (1) blob = round head with two round ear nubs + the big ringed tail (S, SW, N, E);
  (2) palette russet fur + white mask + near-black-brown legs/arms; (3) no prop in idle/walk (r2: scissors + a 3-link chain appear only as story props in vote / snip); (4) face = dark eyes, white muzzle with
  a dark nose, white cheeks and brow spots; (5) v2 motion: the tail sways with the walk.

## Unique to me
1. **Extra animated parts.**
   - **Tail** (`tail0` on the hips at her LEFT rump [0.1, −0.06, −0.12] → `tail1` at the 4th centreline point; both axis
     'left': `out` + tucks the C up/in, − swings it out/down; `fwd` = yaw; `twist` = tip forward/back). r2 shape: a LOW,
     WIDE 3-D C beside her left hip — the base runs out-and-back, the upper half curls FORWARD and up to chin height
     (≤ 0.69 m, under the big head). Six coincident bands of ONE centreline (F R F | R F R: the tip is a dark ring, so the
     bit that pokes out right of the face at SE reads as a ringed tail, not a cheek). Out of the body outline at S, SE,
     NE, N, NW, SW (`turnaround-silhouette.png`, `r2/sil-lineup.png`: S = an "L", N = a "J", no longer the round
     preservation/toad blob); E hides it, W shows it in front of the body. KEYED, no spring, and every sway lives in
     the NEGATIVE `out` range (positive tucks it behind the head at SE): walk tail0 6/−8/−32/−16 with tail1 one drawing
     behind (−26/8/2/−32); run the same + twist −25…−35 (streams back); idle sways it out (−14/−12) on the breath
     extremes; talk −16…+4 per beat; vote perks it; die yaws it forward round the curled body; snip flicks it.
   - **Ears** (`earL0/earR0`, keyed): flop back 22° on both contact drawings of the walk (35° in the run), flick one at a
     time in talk (−35°) and idle (f60), tucked a little back in vote (so the scissors clear them), up on FOUND, flat
     back (−55°) in die.
   - **Story props (r2)**, built at 1/1000 scale on their own bones and shown with `'<bone>.s'` (hidden in idle / walk /
     talk / die): **scissors** on `scis` (right paw; blade B on `scisB` at the pivot, `twist` opens it — the twist plane
     faces the SE camera) in steel `#E2ECF4/#9FB3C6/#66788E` with ring-red handles; shown 1.4× in the snip, 1.0× in the
     vote. **Chain** of three 4×5-texel links on `chain` (chest, placed at the left paw of `CHAIN_ARM`), the bottom link on
     its own bone `link3` = the weakest link (dropped 0.1 m at snip f37, gone at f40).
   - FX: speech bubble (talk), vote sparkle at the right paw (`vote@handR`), "!" glyph on FOUND (`emote:exclaim@crown`),
     die dust, step dust every 2nd footfall. No smear (the snip is a gesture at a chain, never at anyone).
2. **My locomotion: a brisk scurry** — short dark legs visibly alternating under a round body, bob ≈ 3 px
   (`game.head_bob` 3.1), the ringed tail swinging out beside her (screen-right of the body in every SE drawing,
   `r2/s-game1x.png`), ears flopping on contacts. LegGait 'biped', duty [0.18, 0.1], reach 0.6, poses [4, 4], cycleTime
   [0.3, 0.267], lift [0.07, 0.1]; r2 arms [20, 40] (was 35/55) + elbows [45, 60] (was 30/50): the paws stay near the
   body outline, no horizontal twig. `game.readable` 3.95 H/s, 0.289 s, 1.14 H, 4/4 drawings, holds 2–3;
   `game.foot_slide` n/a (no foot planted on two drawings — inherent at 4 H/s on 0.25 H legs).
3. **Expressions in the new style.** Eyes: dark 3×4-texel boxes ON the 16-gon head surface with a 1-texel glint. Lids =
   `eye.s` y: blink −0.8, half −0.45, squint −0.55, wide +0.18. Mouth = white lower lip on a back hinge (`jaw` ≤ 14°).
   r2 mask: the brow spot is one patch (angF 8–40°, y 0.295–0.41) sitting ON the eye's top edge (no floating dots), the
   cheek stops at 74° (no 1-texel tip on the head contour), the cut is subdivided at 0.02 m. Expression by pose:
   scrutinise = head cocked to the held chain + squint; FOUND = wide eyes, ears up, scissors flung up; smug = chin up,
   half-lid, scissors raised, the shortened chain still held.
4. **Game-speed readability.** Walk: bob + legs + tail swing + ear flop change every drawing in the 1× crop — one word:
   **scurry**. Talk: a beat every 6 frames (`talk.amplitude` 32 %). Vote: up on f3, scissors 9–18 texels over the ear
   tops at 8/8 (`mincut_vclear.py.js`: S 16, SE 11, E 9, NE 12, N 17, NW 18, W 18, SW 16), held 1.67 s. Die: down by f18,
   curled mound held 2.17 s. Snip: 12 / 10 / 5 / 5 / 5 / 3 / 5 / 12 frames, the chain + scissors read at 1× SE
   (`r2/s-snip1x.png`): chain up → "!" + scissors up → open / SNIP / open / SNIP → bottom link drops and is gone → smug.

## Proportions (vh 10, 36 px/m) — height_px S 43, min 39, max 46 (WARN: band 40–52)
| part | m | texels |
|---|---|---|
| ear top (H) | 1.28 | 46 |
| skull top / head joint (chin) | 1.15 / 0.67 | 41 / 24 |
| head width × height | 0.58 × 0.48 | 21 × 17 |
| body egg (y 0.25–0.69), r | 0.218 | 8 |
| hips / leg length | 0.41 / 0.33 | 15 / 12 |
| tail centreline / max r | ≈ 0.75 / 0.135 | 27 / 5 |

| tail (r2) | root x 0.1 left, reaches x 0.43 / y 0.69 | out of outline 6/8 |

## Palette (6 slots)
fur `#E48A58 / #C65A2A / #B86A4C` · white `#FAEEEC / #E8DCD8 / #B09CA8` · dark `#70483C / #4A2C2A / #3A2A36` ·
ring `#9A4630 / #73301F / #5E2E38` · eye `#5C4A64 / #2E2436 / #3A3040` · steel (props only) `#E2ECF4 / #9FB3C6 / #66788E`.
r2: fur sh `#B4625A` (≈ 16° pinker than the v1 russet, salmon in the shade copy) → `#B86A4C` (hue ≈ 16°, lifted); the shade
copy now reads russet-brown (`scene-noon-crop.png`), sig_ground noon-shade +27 %, golden-shade +28 % (PASS).

## Timing charts (30 Hz, step; = `CLIPS` in mincut.js)
- idle (72, dynamics hold): f0 rest · f30 breath −0.014, tail out · f36 −0.028 · f50 blink (2) · f52 · f60 right ear
  flick (4) · f64 back.
- talk (24, `speak` f0): f0 jaw 14, head roll +8, right paw out-low · f6 shut, bob, half-lid, ear back · f12 jaw 13, paw
  up by the shoulder · f18 shut, bob, other ear back. Tail per beat.
- vote (length 30, `vote@handR` f3): f0 dip −0.05 (3) · f3 on tiptoe +0.04, body leans to her left, right arm straight up
  and 20° out (`upperArmR [0,0,160]`, upper arm `.s` [0.2, 0.5, 0.2] = 1.5× long, 1.2× thick), scissors open 40° above
  the paw, wide eyes, ears tucked −12 → held. No chest twist (r1's twist put the arm level with the ears at E/NE).
- die (fk, length 60, `die`+`land` f18): f0 wobble, half-lid, ears sag (8) · f8 knees fold, sits (6) · f14 tips sideways
  (4) · f18 DEAD = curled asleep on her right side (hips −90, spine+chest 60° curl, knees to chest, head fwd −70 so the
  shut-eyed face looks toward the SE camera, tail yawed forward round her) → held. A low mound at 8/8 (`r2/z-die.png`).
- snip (emote, length 64, `emote:exclaim@crown` f12): f0 SCRUTINISE — left paw holds the chain up in front, head cocked
  to it, squint, right paw on hip (12) · f12 FOUND — wide eyes, ears up, scissors flung up beside the head, "!" (10) ·
  f22 OPEN at the link2/link3 joint (5) · f27 SNIP shut (5) · f32 OPEN (5) · f37 SNIP + bottom link drops 0.1 m, tail
  flick (3) · f40 link gone (5; on the glyph's fade frame so `snip.strobe` is 2, not 3) · f45 SMUG — chin up, half-lid,
  scissors raised, 2-link chain still held (12) · f57 idle (props away).
- point (r3, length 35, no FX): f0 wind — paws drawn in, chest −8, half-lid, ears up (4) · f4 POINT — chest twisted
  +16 (spine +12) so the RIGHT shoulder leads, head turned back to the target (twist −16, roll 4), jaw 8, eyes narrowed;
  right arm `upperArmR [105, 0, 4]` + `forearmR [-30, 0, 0]` (straight), reach `'.l'` 0.8 / 0.6 (+80 / +60 %), both
  segments `.s` [0.25, 0, 0.25] (1.25× thick: a paw, not a twig); left paw forward-up-out `[95, 0, 30]` `.l` 0.7, thick;
  tail flicked out (−22/−14) — HELD 24 frames · f28 paws down (6) · f34 idle. Aim: along the facing (R W4 point) — at SE/E
  the right arm leaves the outline to screen-right and rises ≈ 20°, at W/SW it leaves to screen-left, at S the left paw
  breaks the outline at screen-right (the right arm is end-on over the belly there). Texels outside the idle outline
  (`mincut_outside.py.js`, includes the tail flick): S 125, SE 164, E 206, NE 193, N 174, NW 219, W 161, SW 148.
  Rejected (`r3/pt-stack`, `pu-stack`): `.l` 1.15–1.4 = a 2× stick (`.l` is a FRACTION: 1.4 = +140 %); out 22–30 = a
  sideways raise that hides at SE; two symmetric forward-up arms = a "ta-da" at N/S.
- ghost (r3, loop 64, keys every 16, dynamics hold; `spec.ghost { hover 0.14, keepHue 0.3 }`): rigid bob 0.03/0.015/0/
  0.015, paws floating out in turn (out 16/24), head roll ±4, half-lid on key 3, legs dangling (module floats + dissolves
  them), tail sways out −6…−20 with tail1 following. Pale pink-lilac ramp (keepHue keeps the russet/white mask readable:
  mask, eyes, ringed tail all read at 1× SE, `r3/ghost-zoom.png`), gold halo over the ears.
- ghost-spent (r3, loop 72, keys every 18): sunk −0.02…−0.05, spine/chest 6, head bowed 14 (roll ±3), half-lid, ears
  back −35, paws hanging, tail drooped (tipped forward 20); module spent ramp = dimmer mauve, no halo. Face still shows
  at S/SE (eyes + mask), `g8-new-stack.png` rows 4–5.
- walk / run: §Unique 1–2. turn: 45° steps held ≥ 2 grid frames (`turn.off_grid` 0).

## Final numbers (sheet = code)
- Skeleton: `chibi({ height 1.2, heads 2.3, legs 0.75, arms 1.1, snout 0.25, tail false, ears {n 1, at [0.15, 0.44,
  −0.05], dir [0.3, 1, −0.1], len 0.15}, face {eye [0.134, 0.25, 0.221]} })`; bent rest arms (up [14, 8], fore [4, 38]);
  jaw [0, 0.085, 0.17]; `tail0` (hips [0.1, −0.06, −0.12], axis left), `tail1` (tail0, TAILC[3]); props `scis`
  (handR), `scisB` (scis, pivot 0.07 m along the paw × TINY), `chain` (chest [0.123, 0.24, 0.34]), `link3` (chain).
- personality body f 3 ζ 0.6 r 0, head f 3.2 ζ 0.65 r 0; chains: none (every secondary part keyed).
- locomotion: plan 'biped', walk 5.06 / run 10.11 m/s, cycleTime [0.3, 0.267], poses [4, 4], duty [0.18, 0.1], reach
  0.6, arms [20, 40], elbows [45, 60], bob [0.05, 0.1], lean [6, 14], lift [0.07, 0.1], twist [6, 9]; quant { yaw 8, chain 4 }.

## Game speed (Stage 6)
- `game.readable` PASS 3.95 H/s (182 px/s), cycle 0.289 s = 1.14 H, 4/4 drawings every cycle, holds 2,3,2×4…
  `game.head_bob` 3.1 px; `game.flicker` 50 "legs only" WARN; `game.foot_slide` n/a.
- 1× read (`r2/s-game1x.png`, `game-onion.png`): legs alternate, ≈ 3 px bob, the ringed tail swings beside her at the
  right edge every drawing, ears flop, paws stay inside the outline → **scurry**.

## Self-critique (round 2)
| # | criterion | score | evidence (file · facing/frame · number) | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | `turnaround-silhouette.png` tail out of outline at S, SE, NE, N, NW, SW (6/8; W in front, E hidden); 25 % S = "L", N = "J" vs preservation/toad blobs (`r2/sil-lineup.png`); held keys `r2/z-final-keys.png` | tail out at E too |
| 2 | Pixel stability | 1 | every action off_grid 0, flicker 0, deterministic 0 px, snip.strobe 2 (FAIL 3 until the link drop moved onto the glyph fade frame f40); game/walk flicker 50 legs only (module) | motion: legs-only redraws |
| 3 | Line quality | 1 | isolated_px fur [1,2,3,4,3,3,3,2] max 4 (r1 [0,2,4,6,4,4,5,4]); speckle 27; brow patches joined to the eyes, no cheek tip at NW (`turnaround.png`) | ≤ 2 at E/NE/W |
| 4 | Tonal discipline | 1 | sig.fur hi/mid ≥ 0.91 8/8; fur sh hue fixed (shade copy russet); sig.white isolated [10,5,8,1,4,4,7,3] — glint 2–3 of it (A/B `r2/ab-noglint`: [8,5,5,…]), rest = dark nose/eye texels inside the mask region | mask region speckle |
| 5 | Ground separation | 2 | sig_ground noon-sun dH 103, golden-sun 48, noon-shade +27 %, golden-shade +28 % PASS | — |
| 6 | Proportion / expression | 2 | face_lit 91 %, face_visible 75 %; vote = a raised paw holding open scissors; die face shown at S/SE/E/SW/W | — |
| 7 | Animation timing | 2 | single_frame 0, hold_redraws 0, key_delta ≥ 65 %; vote 9–18 texels over the ears at 8/8; die a curled mound at 8/8; snip story reads at 1× SE | — |
| 8 | Weight / contact / game speed | 1 | game.readable PASS 4/4; arms [20,40] no twig in `r2/s-game1x.png`; foot_slide n/a | — (inherent at 4 H/s) |
| 9 | Personality / secondary | 2 | tail lag per drawing, ear flop, scrutinise→FOUND→snip→smug with props | — |
| 10 | Smears / FX | 2 | no smears; bubble/sparkle/"!" clear of the face | — |
| 11 | Facing / turns | 2 | turnaround 8/8, turn.off_grid 0 | — |
| 12 | Technical | 2 | page_errors 0, draw_calls 2/1, deterministic, night_freeze/pan 0 px, 0 FAIL (82 pass / 23 warn), RTX 4090; bake 7 clips × 8 dirs, 0 warnings | — |

**Total 20 / 24.** Weakest: (1) white-mask region still has 8–10 isolated texels at S (nose / eye texels); (2) the tail
is hidden at E; (3) foot_slide n/a / legs-only flicker (module).

## Round 3 (cast close-out, 2026-10-17) — game clips point / ghost / ghost-spent
- Pack under the CURRENT rules (`tools/charpack.sh mincut --preset cast`, render-host RTX 4090, `r3/pack.log`): **0 FAIL,
  116 pass / 18 warn**, `cast_clips` PASS (idle, walk, talk, vote, point, die, ghost, ghost-spent + snip). New rows all
  PASS: point off_grid 0, flicker 0, hold_redraws 0, key_delta 49 %, pose_read 35 % ×24, key_speckle +0; ghost off_grid
  0, amplitude 30 %, key_delta 53 %; ghost-spent off_grid 0, amplitude 15 %, key_delta 36 %; islands 1 on all three.
  Living rows identical to r2 (face_lit 91 %, face_visible 75 %, isolated_px fur max 4, sig_ground PASS ×4,
  game.readable 3.95 H/s, deterministic).
- Warns kept and why: the r2 set (height_px S 43 under the 40–52 band's preferred 46, colors/slot, speckle 27, sig.fur/
  white isolated, foot_slide n/a at 4 H/s, micro 1–2, vote/snip/die key_speckle = the scissor/chain props + curled
  die) plus one NEW row from the newer charcheck: `prop_area.handleB` 0–4 px (edge-on 4/8) — by design, the scissor
  handles sit inside the fist; the blades (`prop_area.bladeA/B`) PASS 14–32 px, edge-on 0/8.
- 1× real time (dir 1, `r3/s-point1x.png`, GIF durations 270/130/800/200/440 ms): idle → paws in (4 f) → the two-paw
  "THAT one" held 0.8 s, right arm rising toward screen-right past the cheek → down → idle. Ghost (`s-ghost1x.png`, 8
  drawings ≈ 0.53 s each): pale floating red panda, halo over the ears, ringed tail and mask readable, legs dissolve.
  Spent (`s-ghostspent1x.png`, 0.6 s drawings): dimmer mauve, head bowed, ears back, no halo — clearly the "used" ghost.
- Bake (`tools/charpack.sh --bake mincut --preset cast`, `r3/bake.log`): 10 clips × 8 dirs, cell 56×70 anchor [28, 60],
  sheet 504×5600, point 4 / ghost 4 / ghost-spent 4 frames, no warnings; rows checked in `r3/bake-new-rows.png`.
- Self-score (round-2 table unchanged; the new clips): 7 Animation timing stays 2 (point holds 24 f with a 4-f wind, ghost
  keys every 16/18 f, no redraws); 12 Technical 2 (0 FAIL, bake 10 clips). Weakest new thing: at S the pointer (right
  arm) is end-on over the belly — the outline break there is the LEFT paw, so S reads "points up-right" rather than "at
  me"; at SW the right paw clears the outline by only ≈ 4–6 texels in the baked frame. Needs a critic r3.
