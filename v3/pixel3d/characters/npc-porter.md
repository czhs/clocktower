# Porter (cast `npc-porter`) — design sheet

NPC, no blurb ("deliberately boring so it never competes with the players"). Spec: `characters/npc-porter.js`.
Pack: `shots/char-npc-porter/`. Identity source (read only): `pipgws/packages/assets/scripts/cast/npc-porter.ts`,
`refs/cast/npc-porter.png`. Render host: render-host (RTX 4090).

(Stage 0 written before modelling; the sections below "FINAL" are rewritten from the final code + renders.)

## 0. Brief (Stage 0, before modelling)
- Concept (inferred from the sprite + .ts header): a town porter — brown skin, a dark mauve-grey hood framing the face,
  a dull-green work tunic, a leather apron, dark trousers, and a big pale burlap sack slung over the RIGHT shoulder and
  hanging on the upper back, held by a leather strap across the chest (right shoulder → left hip). Adjectives:
  **plodding-steady, dutiful, unremarkable** → the "boring on purpose (NPC)" row: default dynamics, plain holds,
  quieter motion than any player; the only extra is the sack's weight.
- Body plan: **upright townsfolk chibi** (`chibi()` at 2.8 heads, `bodyPlan 'biped'` like the NPC card in
  CAST_PORTING §6), `locomotion.plan 'biped'`, `plant 'hold'`, `swingFloor 'gait'`.
- Game-speed arithmetic: v2 28 px → **H 1.12 m** (≈ 40 texels at vh 10). v_game = 3.95·H = **4.42 m/s**; run 2·v
  (optional). Leg (hip 0.386 → ankle 0.06) = 0.326 m = 0.29 H → duty bound 2·0.6·0.29/1.15 ≈ 0.30 → duty 0.22
  (brisk scurry with a short flight), N 4 drawings × 2 grid frames → cycle 0.27–0.3 s ≈ 1.1 H, step ≈ 0.62 m.
- Identity (ref facings):
  1. Blob at 1×: a dark rounded HOOD mass on a small body + the pale SACK breaking the outline over the right shoulder
     at S/SE/SW (screen-left of the hood at S) and filling the whole back at N/NE/NW (pale disc on dark).
  2. Palette anchors: hood `#3A3438` (16 % of the sprite), sack `#897A61/#A19276`, skin `#8A6448`, tunic `#4E5A46`,
     leather `#5C4432`, trousers `#33302C`.
  3. Signature prop: the sack on the back, slung over the RIGHT shoulder (strap across the chest). No hand prop.
  4. Face: brown face in a dark rectangular hood opening, two 1×2 dark eyes, a 1-px mouth/blush at SE.
  5. v2 motion: 1-px bob, legs shuffle, the sack rides the bob.
- Silhouette vs the cast: closest look-alikes are green-hood (hood, void face, green) and storyteller (hood, purple,
  tallest). The porter has an OPEN brown face (no void, no glow), no peak, and the pale sack lump is the read.

## Unique to me (planned before modelling; verified in FINAL)
1. **Extra animated parts.**
   - **Sack** (bone `sack`, child of `chest`, pivot at the strap knot on the right shoulder; KEYED, no spring — a 1-link
     spring lags 0.2–0.3 m behind at 4 H/s, playbook R W3): in the walk it drops 1 texel and swings forward on each
     contact drawing and lifts/swings back in flight (one drawing behind the body = weight); hitched up in the emote,
     hoisted overhead in the vote, slides off onto the ground in the die, still worn by the ghost.
   - **Apron flap** (bone `apron`, hips front): kicks with the steps in the walk (keyed ±12°).
   - **Mouth** plate (bone `mouth`, buried in the face, pushed out with `mouth.p`): talk; eyes squash for blinks.
   - FX: speech bubble, vote sparkles at the sack, step dust, die dust, `emote:drop` (sweat drop) on the hitch.
2. **My locomotion: a loaded scurry** — LegGait 'biped' (duty 0.22, 4 drawings, plant 'hold'), forward lean 6–8° under
   the load, bob ≥ 1 texel, the sack bouncing a drawing behind the body carries the rhythm (the biggest light mass).
   Contact drawing = boot (leather tone, contrasting with the dark trousers) planted ahead; flight = boots tucked.
3. **Expressions.** Eyes 2×2 texels (dark boxes flush-proud on the face front, eye slot hi ≤ #4A4258), small nose bump
   for the E/W profile, mouth plate 3×2 on open talk keys; blink = eye squash; vote = eyes wide + face up; die = eyes
   shut; emote = eyes shut on the hitch then a relieved puff (sweat drop).
4. **Game-speed readability.** Walk judged on `game-1x.gif`, `clip-game.png`, `game-onion.png` and the pose-id log;
   talk beat every 10 frames; vote up in ≤ 6 frames; die down in < 1 s; emote holds ≥ 6 frames.

## Clips (timing plan, 30 Hz)
- idle (72, step): breath 0/30/36/66, blink f50–52, a small sack settle at the breath peak.
- walk (4 drawings, blend add): sack + apron keyed per drawing, body lean.
- talk (40 loop): open/closed every 10 f, left hand gesture + head roll toward the camera.
- vote (one-shot, held): f0 dip → f4 the sack hoisted overhead on the right hand (≥ 0.3 m above the crown), held.
- point (one-shot ≈ 3.5 s held): right arm forward-up along the facing + chest leading with the right shoulder, the
  left hand forward-low (reads at W/SW).
- die (one-shot, held): sway under the sack → knees buckle → topples diagonally, the sack rolls off beside him; lying
  curled, face toward SE.
- emote `hitch` (shift the sack): crouch → pop (sack jumps up the back, shoulders shrug, silhouette rises) → land
  (sack thumps lower) → relieved sweat drop → idle.
- ghost / ghost-spent: `spec.ghost` + plain loops (sack kept: identity), `keepHue` 0.25 (dark figure).

---
# FINAL r1 (rewritten from the code + renders, 2026-10-16, render-host RTX 4090)

Evidence: final pack `shots/char-npc-porter/` (`tools/charpack.sh npc-porter --preset cast --raw`: **111 pass / 20 warn /
0 fail**, page_errors 0), iterations `r1/`–`r7/` (turnarounds + `z*.png` ×2–3 crops), `s1/` `s2/` (8-facing key stills,
`sheetA/B.png`, `zA/zB/zF.png`, die sack probes `dv1-3`), `p1/`–`p3/` (earlier packs), `self/keys.png` (final 8-facing
stills of talk f0, vote f8, point f30, hitch f5/f14, die f40, ghost f0), `gamespeed.png/.gif` (v2 sprite vs pixel3d at
1× real time), `sil-lineup.png` (25 % line-up), bake `shots/char-npc-porter/bake/` (10 clips × 8 dirs, trimmed cell
50×71, anchor [25, 57]; walk 4 frames = gameSpeed.drawings; auto re-bake 62 → 84 for the vote sack and the die).

## Proportions (vh 10, 36 px/m)
H 1.12 m (37–40 texels; `height_px` S 37–38). `chibi({ height 1.12, heads 2.8, legs 0.8, arms 0.9 })`: head joint 0.712,
hips 0.411, leg 0.326 m (0.29 H). Hood lathe r 0.228 (sz 0.88), crown 1.12; face box 0.215 × 0.22 × 0.22 (front z 0.24,
octagon chamfer 0.5 so the eyes wrap onto the bevel and show at E/W), rim frame 0.05 m bars; eyes 0.05 × 0.066 m on the
bevel (2×2 texels at S); nose 0.06 m (profile bump). Sack: lathe r 0.215 × h 0.415 (sz 0.74) on bone `sack` (chest-local
pivot [−0.15, 0.17, −0.07], centre +[−0.04, 0.07, −0.19]) + a tied neck frustum 0.09/0.065 × 0.15. head_frac 0.38 (WARN
vs the biped 0.24–0.36; kept: the v1 hood is 39 % of the sprite).

## Palette (final)
hood `#524858 / #423A46 / #3A3242` (v1 #3A3438; also trousers + strap), skin `#B08460 / #8A6448 / #664A3E`, tunic
`#6C7A5C / #4E5A46 / #3C4442`, leather `#80603F / #5C4432 / #44343A` (apron, boots), **sack** `#E6DCC6 / #C2B49A /
#8E8278` (signature; lightened from v1 #A19276 so `creamKeep [1, 0.85]` catches it: golden sun was dL −2 % / dH 24 (orange on
golden grass) → dL +20 %, cream vs yellow by eye), eye `#4A3E48 / #2C2228`. `slots.sack.line 'tone'` (grey line specks on
the sack neck → darker sack tone). Hood is NOT in `signature` (sigLift lightened it off the v1 value).

## Unique to me (verified)
1. **Extra animated parts** — all keyed, no springs: **sack** (walk: contact drawings k0/k2 sack fwd 16°, p y −0.03;
   flight k1/k3 back −10°, +0.03 → `clip-game.png`, `gamespeed.png` the sack visibly rides up/down; idle settle +4° at the
   breath peak; hitch f5 jumps +0.2 m up the back above the hood; vote hoists it overhead on the right hand, `sack.p`
   [−0.06, 0.53, 0.26]; die: slides off onto the ground beside him, `sack.p` [0.15, −0.05, −0.05] (probe `s1/zB.png`
   dv1 = the only grounded one); ghost keeps it). **apron** flap ±14/6° per walk drawing. **mouth** plate pushed out
   (`mouth.p` z +0.03) on talk/point/hitch open keys; eyes squash for blink/half-lid.
2. **Locomotion: loaded scurry** — LegGait 'biped', plant 'hold', swingFloor 'gait', duty 0.22, 4 drawings, lean 7°, spine
   +4° fwd under the load. `game.readable` **3.95 H/s, cycle 0.30 s, 1.19 H/cycle, 4/4 drawings, holds 2–3**, game.distinct
   11 images / 4 ids, head_bob 2.5 px (limp 0.1), feet_visible SE min 6 px (0/8 hidden), off_grid/flicker 0.
   foot_slide n/a (hold mode: no foot planted on two consecutive drawings) — 1× read on `gamespeed.png` / `game-onion.png`:
   legs scissor with the boot (leather tone) planted ahead on contact drawings, the sack bounces → "scurry/trot".
3. **Expressions** — 2×2 dark eyes in a brown face framed by the hood rim (S both eyes + nose; SE near eye; E/W one eye
   on the face bevel + nose bump, `r4/z.png`, `r4/z2.png`); blink f50–52 (`s2/zF.png` row 2); talk: mouth plate + head
   roll toward the camera + left/right palm out (`self/keys.png` row 1); vote WIDE; die/hitch BLINK (shut).
   face_lit 100 %; face_visible 34 % (WARN: the rim frame covers the face box sides by design).
4. **Game-speed readability** — walk as above; talk amplitude 28 %, beat every 10 f; vote up at f4 (≤ 6 f), pose_read
   45 %, final_hold 1.67 s; die down by f22 (0.73 s), pose_read 117 %, final_hold 2.07 s; point out at f5, held to f96;
   hitch pose_read 28 % (pop f5 held 3, thump f8 + land dust, relief + sweat drop f14).

## Timing (30 Hz, final)
idle 72 (0/30/36/50 blink/52/66) · walk/run 4 drawings blend 'add' · talk 40 (0 open+L palm / 10 / 20 open+R palm / 30) ·
vote 0 dip → 4 hoist, held (length 31) · point 0 gather → 5 point+open → 16 → 60 open → 70 → 96 relax (length 106) ·
die 0 sway → 8 knees → 15 topple (sack slipping) → 22 lying (land), length 61 · hitch 0 crouch → 5 pop → 8 thump (land) →
14 relief (drop glyph) → 30 settle (length 38) · ghost / ghost-spent 4 keys × 16 (spec.ghost hover 0.14, keepHue 0.25).

## Self-critique (Stage 7)
| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 1 | `turnaround-silhouette.png`: sack breaks the outline at S, SE, E, NE, N, NW, W; at **SW only the neck tuft** (sig.sack 17 px; `clip-turn.png` f47–f66); `sil-lineup.png`: closest = green-hood (hood) — separated by the sack lump + open brown face | sack wider/higher so it shows at SW |
| 2 | Pixel stability | 2 | off_grid 0 / flicker 0 in all 11 jobs, deterministic 0 px, vote.deterministic 0 px, night_freeze/night_pan 0 px, pan 0 px | — |
| 3 | Line quality | 1 | silhouette_line PASS, inner_lines 301, edge_highlights 0; speckle 30 WARN, key_speckle vote +22 / die +15 / point +10 | remove strap/sack-edge specks in held keys |
| 4 | Tonal discipline | 1 | colors/slot WARN (hood 9, sack 6), isolated_px sack max 4 (S 3, SE 4, NE 4), sack hi/mid ≥ 0.86 at 8/8 | ≤ 2 isolated px on the sack |
| 5 | Ground separation | 1 | noon-sun dH 30 PASS, shades PASS (+30 %, +58 %); **golden-sun WARN dH 8 dL +20 %** (by eye cream vs yellow, `scene-golden-crop.png`); night: hood near the night ground value, sack reads | sack L +25 % at golden |
| 6 | Proportion/expression | 1 | face_lit 100 %, eyes 2×2 at S, profile eye+nose at E/W; face_visible 34 % WARN; head_frac 0.38 WARN; talk mouth ≈ 2×1 at S | bigger talk mouth, open the face at SE/SW |
| 7 | Animation timing | 2 | single_frame 0, hold_redraws 0 (vote/die/point/hitch), final_hold PASS vote 1.67 s / die 2.07 s, strobe ≤ 1, pose_read vote 45 % / die 117 % / hitch 28 % / point 19 % | hitch relief key (f14) is only a modest change |
| 8 | Weight, contact, game speed | 1 | game.readable 0.30 s / 1.19 H / 4 of 4, head_bob 2.5 px, feet_visible SE ≥ 6 px; foot_slide n/a (hold mode, not measurable); run = walk keys at 2·v (optional clip, not tuned) | pose-frame slide measurement |
| 9 | Personality, secondary | 1 | sack keyed in walk/idle/hitch/vote/die (`clip-game.png`, `clip-hitch.png`), turn foot_slide 3.46 WARN | sack lag on turns |
| 10 | Smears and FX | 1 | speech bubble (talk), vote sparkle at sackTop, land dust (die/hitch), `emote:drop` glyph (`clip-hitch.png` f22–46); no smears; FX not checked at 8 facings | 8-facing FX stills |
| 11 | Facing and turns | 2 | turnaround 8/8 readable, `clip-turn.png` 45° steps held 2–5 grid frames | — |
| 12 | Technical | 2 | 0 FAIL, page_errors 0, draw_calls color 2 / normal 1, rendered on render-host RTX 4090 | — |
| | **total** | **16** | | |

Three weakest points: (1) the sack nearly vanishes at SW (only the neck tuft); (2) golden-sun sack WARN (dH 8, dL +20 %);
(3) small face (face_visible 34 %, talk mouth ≈ 2 px) — the hood frame eats the face sides at SE/SW.

---
# FINAL r2 (after critic-npc-porter r1 15/24; 2026-10-16, render-host RTX 4090)

Evidence: pack `shots/char-npc-porter/` (`tools/charpack.sh npc-porter --preset cast --raw`: **112 pass / 18 warn / 0 fail**,
page_errors 0, off_grid/flicker 0 in every job, pan / night_pan / night_freeze 0 px), bake `bake/` (10 clips × 8 dirs,
trimmed cell 54×73, anchor [27, 59], walk 4 frames), iterations `r8/` (vote probes vA–vP with `mark=@handR`), `r9/` (sack
x probes `pk`, `pk2`; vote speckle maps `iso60*.png`), `r10*/` (vote chest-twist probes), `r11/` (walk 8 facings, night
probe `sc/`, bake vote crop `bake-vote.png`, facings `ta-faces.png`), `r12*/` (die / hitch / point 8-facing keys).
Helpers: `porter_g8.sh` (8-facing still + ×4 crop), `porter_iso.py` (charcheck isolated-px map), `porter_wv.js` (pose
override variant).

## What changed (critic issue → fix → evidence)
- **Sack too high (high)** → SACK pivot [−0.085, 0.17, −0.07], centre +[0, −0.07, −0.20] (centre char y ≈ 0.62: eye level →
  waist, like v1), lathe r 0.232 / sz 0.80 / 14 segments. sig.sack px/facing S..SW **[30, 116, 165, 199, 212, 187, 135, 44]**
  (was SW 17; probes: x −0.06 → S 19 / SW 55, x −0.10 → S 35 / SW 33, kept −0.085). `turnaround.png`: no tuft above the
  hood, centred on the lower back at N, bulge past the body at SW (screen-right) and S (screen-left).
- **Vote "sack hat" (high)** → arm up-forward-out `upperArmR [160, 0, 30]`, `.l 1.1`, sack sits on the palm
  (`sack.p` [−0.335, 0.67, 0.46] from the arm FK, checked with `mark=@handR`), `sack.s` −0.1, head tilted away.
  `r11/bake-vote.png`: hand + sleeve visible under the sack at S, SE (partly), NE, N, NW, W, SW; **at E the sack sits
  beside the hood (not on it) but the hand is hidden behind it** — every arm direction has one facing pair where the arm
  points along the view ray (probes vA–vQ, chest twist r10: twist moves the overlap from SE to E). `material.hullMargin
  0.4`: the hoisted sack left the self-shadow hull and shaded the body.
- **Snout at E/W (medium)** → face front z 0.222 (was 0.24), nose tip 0.235, rim top bar front 0.23, side bars 0.04 wide set
  back (front 0.195). `r11/ta-faces.png`: E/W the eye + a skin strip sit inside the hood outline; SE/SW face opens (two eyes
  at SE). face_visible 20 % WARN (S 36/84, SE 22/85, SW 17/85; was 34 % with the face proud of the rim — the price of
  the snout fix).
- **Legs lump / cycle (medium)** → `cycleTime [0.267, 0.267]` (8 grid frames: holds **2×23**, no 3-frame hold),
  `contactReach 0.45` (wider contact), leather mid #6A4E36 (boots off the trousers). `clip-game.png`: two boots apart on
  every contact drawing. game.readable 3.95 H/s, cycle 0.267 s, 1.05 H/cycle, 4/4 drawings, head_bob 2.6 px.
  Apron flap ±34/16°: at S/SE the brown bib flicks in/out per drawing (`r11/zz-walk01.png`), invisible from the back.
- **Golden / night (medium)** → sack `#F2E8D2 / #D2C4A8 / #968A80`: golden-sun **dL +26 % PASS** (was WARN), noon-sun dH 30
  PASS. Hood sh #463F47, tunic sh #444E48 (night rule ≥ #3A3040). Night copy is still a dark figure with a slate sack
  (`scene-night-crop.png`): silhouette reads, inner separation weak.
- **Hood purple (low)** → hood `#5A5452 / #4A4443 / #463F47` (neutral warm charcoal, hue ≈ 10°; Storyteller robe 271°).
- **Specks (low)** → strap 0.075 m, sack 14 segments + sackNeck 8 sides: sack isolated max 3 (idle), sig iso max 4.
  vote.key_speckle +27 WARN (dark shaded front under the raised arm at SE: `r9/iso60*.png`; strap→leather and hull
  margin did not help), die +13, hitch +12 (relief head thrown back), point +11.

## Unique to me — re-check (r2)
1. Sack: walk k0/k2 fwd 16° + drop, k1/k3 −10° + lift (`clip-game.png` sack rides the bob); idle settle; hitch f5 pops the
   tuft above the hood at S/SW (`r12b/hitch.png`), f8 thump, f14 relief (head thrown back, face up, eyes shut, sweat drop
   — `clip-hitch.png` f22); vote on the raised palm; die slides off beside him (`r12/keysB.png` row 1); ghost keeps it.
   Apron flap: visible only at S/SE as a bib flick — demoted from a headline feature.
2. Loaded scurry: 8-frame cycle, even 2-frame holds, boots apart at contact; the sack still carries most of the rhythm at 1×.
3. Expressions: 2×2 eyes at S/SE, profile eye inside the rim at E/W; talk mouth 0.10 × 0.05 m (≈ 3×2 texels open).
4. Game speed: as above; vote up f4, die down f22, final holds PASS.

## Self-critique r2 (honest)
| # | criterion | score | note |
|---|---|---|---|
| 1 | Silhouette | 2 | sack breaks the outline at 8/8 (min 30 px at S, SW 44) |
| 2 | Pixel stability | 2 | 0 off_grid/flicker everywhere |
| 3 | Line quality | 1 | vote key_speckle +27 |
| 4 | Tonal | 1 | sack iso ≤ 4, colors/slot WARN |
| 5 | Ground | 1 | golden PASS; night still dark |
| 6 | Proportion/expression | 1 | snout fixed; face_visible 20 % |
| 7 | Timing | 2 | even holds, vote hand-up at 7/8 |
| 8 | Weight/contact | 1 | boots apart at contact; legs short at 1× |
| 9 | Personality | 1 | sack keyed everywhere; no turn lag; flap minor |
| 10 | Smears/FX | 1 | sparkle, drop, dust, bubble |
| 11 | Facing/turns | 2 | |
| 12 | Technical | 2 | 0 FAIL |
| | **total** | **17** | |
