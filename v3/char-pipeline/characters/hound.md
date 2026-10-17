# Hound — design sheet (char-hound)

Code: `characters/hound.js`. Pack: `tools/charpack.sh hound --clips idle,walk,run,sniff,bark,pounce,hurt,turn` →
`shots/char-hound/`. Template: `characters/wanderer.{js,md}`.

## 1. Concept
A small mossy stone hound, a QUADRUPED companion (≈ 0.55 m at the shoulder incl. the moss): a chunky faceted
lavender-stone body, a bright cool-mint moss cap on its back plus a moss patch on the skull (the signature), broad
orange-lichen leaf ears growing sideways out of the head moss and a stubby tail with a lichen tuft, both on springs. Adjectives: **bouncy, curious, eager** → springy chains (ζ ≈ 0.4, r > 1), quick snappy
holds, head tilts and sniffing in the idle/actions, big squash on landings.

## 2. Silhouette (black blob at ~28 px)
1. **Moss cap** — an 8-sided convex dome over the whole back, 0.40 × 0.52 m, wider than the stone body (overhangs it
   ≈ 0.04 m each side): a mushroom-cap/saddle shape on a box body. Lightest mass on the figure.
2. **Leaf ears** — two broad oval leaves (0.21 × 0.2 m, rounded tip) sticking OUT and 35° up from the head moss: a wide
   "V" in front/back views, a leaf blob above the head in profile (r1's narrow upright leaves read as goat horns); plus
   the **stub tail** with a rounded lichen tuft pointing back.
Body = horizontal box on four short chunky legs (a table with a head): nothing else in the cast is horizontal.

## 3. Proportions (vh 10 = 36 px/m)
| | metres | texels @ vh 10 | @ vh 12.5 |
|---|---|---|---|
| top of the stone back (withers) | 0.51 | 18 | 15 |
| top of the moss cap (≈ shoulder) | 0.56 | 20 | 16 |
| head top / ear tips (spec `height` 0.80) | 0.71 / 0.79 | 26 / 28 | 21 / 23 |
| body length (rump → chest) | 0.51 | 18 | 15 |
| nose → tail tip | ≈ 0.95 | 34 (profile) | 27 |
| body width / moss cap width | 0.32 / 0.40 | 12 / 14 | |
| head (w × h × d) | 0.26 × 0.22 × 0.24 + snout 0.16 × 0.11 × 0.13 | 9 × 8 + snout | |
| legs: thickness / length (shoulder → ground) | 0.09–0.13 / 0.32 | 3–5 / 12 | |
Companion scale: charcheck's `height_px` 45–62 is a biped target; the hound is ≈ 28 texels by design (brief: 0.55 m).
Head ≈ 0.3 of the figure's height. No part thinner than 0.06 m (2 texels); leaf ears 0.06 m thick at the midrib.

## 4. Palette (sRGB `[hi, mid, sh]`; 4 slots + 1 accent)
| slot | hi | mid | sh | use |
|---|---|---|---|---|
| stone | `#C2BCCF` | `#8E89A6` | `#5A5470` | body, head, haunches, upper legs (lavender: off-hue vs grass) |
| moss | `#94FCCE` | `#3CBC98` | `#3E5C7A` | cap + skull patch (signature) — cool mint; cap skirt band = `[mid, mid, sh]` |
| lichen | `#F6AE62` | `#DA7A44` | `#B8604E` | leaf ears, tail tuft (orange lichen; ears not far-forced) |
| basalt | `#8A7A86` | `#5C4E5E` | `#3C3242` | lower legs, paws, nose, jaw (legs separate from the body) |
| glow (accent) | `#FCEFA0` | `#F4CC64` | `#D8A858` | eyes (2 × 2 texels, tilted up 25°) |
Value plan vs grass mid `#75A558`: stone mid is lavender (hue ≈ 250° vs 100°), its sh `#5A5470` ≥ the night floor
`#3A3040`. Shadow hues: stone 250° / moss 210° / lichen 9° / basalt 290° → ≥ 20° apart. Moss hi is the lightest tone on
the figure (signature = lightest mass).
**Signature vs lit grass, measured in the scene shots (r2)**: noon cap `#8FFDCD` h154 vs grass `#ADD27B` h86 (68°);
golden cap `#93C76F` h95 vs grass `#B6AB4C` h54 (41°); night cap `#5E8D9F` h197 L .52 vs grass `#5E7B7D` h184 L .46 (weak:
13°, +13 % L). The golden grade multiplies by ≈ (1, 0.8, 0.55), so the moss hi needs LOW red (`#94FCCE`): a mint with
red `#B4`–`#BC` still rendered h71 at golden (r1's lime rendered `#E0BD4E`, the grass's own hue).

## 5. Bones / parts
Custom skeleton (the rig's `quadruped()` template + the biped-only Gait do not fit; see §7): `body` (root, centre of
the torso, axis fwd) → `rump`, `chest` (axis fwd: `fwd` + = nose down) → `neck` (up) → `head` (fwd) → `jaw`;
`earL0..1/earR0..1` (2-link chains, sideways), `tail0..1` (chain, up-back) on `rump`; hind legs `thighL/R → shinL/R →
footL/R` on `rump`, front legs `upperArmL/R → forearmL/R → handL/R` on `chest`. Plus three invisible gait bones per side
(`gThighL/gShinL/gFootL`, no geometry) that the biped Gait plants and IKs (stride wheel / phase / footstep events) while
the visible legs are FK computed in the spec (analytic 2-bone IK at module load, planted paws).
- body: moss cap (8-sided lathe dome, sz 1.36: skirt band 0.22→0.20 r over 0.06 m drawn `[mid, mid, sh]`, then a 45°
  shoulder and a flat crown, top 0.61 m), belly block; rump: rump block (chamferBox); chest: barrel
  chest block (chamferBox); neck: box; head: head block + snout (stone), nose + jaw (basalt), eyes (glow).
- head: + moss skull patch (8-sided lathe r 0.135, h 0.07) the ears grow out of; eyes 0.075 × 0.07 tilted up 25°.
- ears: leaf hulls (diamond cross-section with a 0.06 m midrib, leaf face turned 72° toward UP), ONE chain link each.
- tail: stone stub + rounded 6-sided lathe tuft (lichen), one chain link. Hind hock moved under the knee, paw centred. Legs: haunch / upper leg (stone), shin / forearm (basalt), paws (basalt).
- sockets: `clawR` on upperArmR, +Z along the leg (limb smear for the pounce swipe).

## 6. Motion list (30 Hz key grid)
- **idle** (step loop 72): stand (f0, 30) → mid (f30, 6) → down + curious head tilt (f36, 30) → mid (f66, 6). 1-texel bob.
- **walk**: trot (diagonal pairs), 8 step keys / cycle (one per gait drawing), duty 0.5, cycle 0.60 m at 1.0 m/s.
- **run**: bounding gallop, 6 step keys / cycle, duty 0.3, cycle 1.0 m at 2.4 m/s (12.5 grid frames), spine flex ±12°.
- **sniff**: nose to the ground, sniff left / right with the head (≥ 25° steps), pop up curious, back to idle.
- **bark** (hop-bark): crouch (5) → hop + bark, mouth open (5) → land squash, event `land` (4) → second bark (5) → idle.
- **pounce** (attack): play-bow crouch (8) → airborne leap, R fore raised up-and-out (4) → **contact**: swipe forward-down
  and across, `smear: 'clawR'`, `hit` (1) → follow-through squash (8) → recovery (6) → idle.
- **hurt**: flinch back, event `hurt` (hold 5 ≥ flash + 2) → cower (6) → shake-off (6) → idle.
Timing charts with the final numbers: see §8 (filled after stage 3).

## 7. Secondary motion / personality / FX
- ears: 1-link chains f 10, ζ 0.85, r 0.5; tail: 1 link, f 9, ζ 0.85; `quant.chain` 4. The bounce is KEYED: ears flip ±20°
  and the tail ±16° per walk drawing pair, ears stream back / flick up and the tail rises on the gallop's gather, and
  every action key sets ears + tail explicitly. (r1's 2-link chains boiled every hold, see §9.)
- no head lag (`locomotion.bones.head '-head'`): it trailed 4-6 creeping redraws after every turn.
- FX: crescent smear on `clawR` (blade kind, length 0.46, inner 0.4, light lavender-white pair), hit spark at the paw,
  hurt flash. NO dust (`fx.map` without step/land): fx.js motes are a fixed 4-5 texels (pebbles beside 3-texel paws) and
  step at 10 fps against the pose's twos.

## 8. Timing charts (as built; 30 Hz grid, f = grid frame, hold in grid frames)
| clip | keys (f: hold — drawing) | events / smear |
|---|---|---|
| idle (loop 72, step) | 0: 30 stand · 30: 6 mid, ears perk 8° · 36: 30 down + head tilt 20°, ears 22° · 66: 6 mid | — (1 texel bob 0.028 m); 1 settle redraw ≥ 19 px per key |
| walk (trot, 8 step keys, 0.94 m/s, cycle 0.5 m) | one key per gait drawing, diagonal pairs HL+FR / HR+FL, paws from the Gait's `foot()` wheel; bob ±0.028 m, ears ±20°, tail ±16° | gait steps (no dust) |
| run (bound, 6 keys, 2.5 m/s, cycle 1.0 m) | spine gathered (chest ±22 / rump ∓22) ↔ extended, flight lift ±0.03 m (2 flights), ears/tail keyed; hinds land 0/0.08, fores 0.45/0.53 | gait steps (no dust) |
| sniff (31) | 0: 6 nose down · 6: 5 sniff L (neck twist +30, head yaw +34) · 11: 5 sniff R · 16: 4 nose deep, jaw · 20: 10 pop up, head tilt 24° · 30 stand; head world pitch ≤ 45° | — |
| bark (21) | 0: 5 crouch (head 30°) · 5: 5 hop +0.10 m, mouth open, paws tucked · 10: 4 land squash (head 31°) · 14: 6 second bark, head up · 20 stand | 5 bark, 10 land (no FX), 14 bark |
| pounce (28) | 0: 8 play-bow · 8: 4 LEAP, all paws off the ground, body −8°/chest −6°/rump +6°, R fore up-and-out [124,0,55] · **12: 1 contact, front paws land, R fore slams forward-down/across [42,0,−26]** · 13: 8 follow-through squash (head 30°) · 21: 6 recovery, head tilt · 27 stand | 12 `smear: clawR` + hit (spark), 13 land (no FX) |
| hurt (18) | 0: 5 flinch back, yelp (flash 2 + 3) · 5: 6 cower, ears down (head 28°) · 11: 6 shake-off, ears up · 17 stand | 0 hurt (flash) |

## 9. Critique r1 (self-score 20/24; critic-hound-r1 scored 15/24 — kept for the record)
Changes this run: moss cap re-seated as one embedded convex dome (kit lathes are bbox-CENTRED; rim 0.04 m below the
stone back) → `isolated_px` moss 6 → ≤ 2; tail tuft moss → lichen (tuft over the cap from N drew a line inside the
signature slot); ears swept back (`ear` fwd −30…−55) in every head-down key (they pointed forward past the nose like a
horn in sniff/bark/pounce); hurt cower and pounce follow-through keep the face visible (neck 38/42 → 18/22); the pounce
swipe leaves the sagittal plane (upperArmR out +35 → −12) and the limb smear sits on the SHOULDER with length 0.34 → the
crescent reads at dirs 0/2/6 (was a 1–2 px sliver at 0 and 4); ears ζ 0.55 → 0.7, tail 0.42 → 0.6, quant
`{ yaw 15, chain 6, lean 4 }` → visible post-turn settle 5 drawings (61/56/19/6/7 px, ≈ 0.33 s).

| # | criterion | score | evidence |
|---|---|---|---|
| 1 | Silhouette | 2 | `turnaround-silhouette.png`: horizontal box-on-legs + cap + leaf ears in all 8; unlike the bipeds |
| 2 | Pixel stability | 2 | every clip off_grid 0 / flicker 0 / single_frame 0; deterministic; pan 0 px |
| 3 | Line quality | 2 | silhouette_line 0/916, inner_lines 253, edge 0; `dbg8` (outlineDebug dir 1): no red inside the cap |
| 4 | Tonal discipline | 1 | cap = #E6EE86 573 / #AFC94E 65 / #6A8147+#6C8448 24 px (+6 px blend) ✓, `far3` magenta only on L/R ears/legs ✓; but colours/slot basalt 14, speckle 27 (WARN) on the small dark legs |
| 5 | Ground separation | 2 | scene noon/golden/night crops: lavender body vs grass reads in sun and pillar shadow; noon cap close in luma to lit grass, body carries it |
| 6 | Proportion / appeal | 1 | face_lit 92 %; chunky; but 29–37 px tall (companion by design → height_px FAIL), hind shins read as hooks in some walk drawings |
| 7 | Animation timing | 2 | holds as charted, no x1 except the smear contact; pounce at dirs 0/2/4/6 (`dir*/clip-pounce-60hz.png`) |
| 8 | Weight / contact | 1 | stance paws within ≤ 1 texel at consecutive pose frames (log), but FK legs glide with the root inside a hold (walk 1.4 / run 4.2 texels, charcheck FAIL) and pivot during turns (15.8) |
| 9 | Personality / secondary | 2 | ears/tail lag + settle ≈ 0.33 s after a turn; head tilts in idle/sniff/recovery |
| 10 | Smears / FX | 1 | crescent clear at dirs 0/2/6, thin streak at dir 4 (behind the body); spark, landing dust, hurt flash stepped |
| 11 | Facing / turns | 2 | `clip-turn.png`: 45° steps 2 grid frames apart, all facings read |
| 12 | Technical | 2 | page_errors 0, draw calls 2/1, deterministic |
| | **total** | **20 / 24** | no zeros on 1–3, 7 |

## 10. Round 2 (fixes after critic-hound-r1, 2026-10-15) — evidence in shots/char-hound/
Pack: `tools/charpack.sh hound --clips idle,walk,run,sniff,bark,pounce,hurt,turn --raw` (37 pass / 2 warn / 4 fail: height_px =
biped target; foot_slide walk 1.42 / run 4.18 / turn 13.39 = FK legs riding the root inside a hold, module issue). Actions at
dirs 0/2/4/6: `dir{0,2,4,6}/` (sniff, bark, pounce, hurt); profile locomotion `dir2loco/` (foot_slide 8.99 / 11.56, same
module issue); `pounce-grid-x1.png` (rows dir 0/1/2/4/6 × bow, leap, contact, smear stage 2, follow-through).

| critic issue | fix | evidence |
|---|---|---|
| claw smear = line / wedge / sliver | leap raises the R fore up-and-out [124,0,55] in front of the chest (fwd 175 = straight up hid the whole leg behind head + cap), contact [42,0,−26] ≈ 120° + 28° body pitch; smear = blade kind inner 0.4, length 0.46 from the shoulder | `pounce-grid-x1.png`: crescent beside the face at dir 0, full C at dirs 2/6, 10-texel arc at dir 1, thin hook beside the body at dir 4 |
| cap camouflaged, one tone, 17 px at S | mint `#94FCCE` (low red), skirt band in `[mid, mid, sh]`, 45° shoulder, cap top +0.04 m, moss skull patch | scene hue gap noon 68° / golden 41°; moss px hi/mid/sh per facing S 28/12/4, SE 80/24/4, E 104/47/1 … N 112/45/12; S total 44 px |
| ears = maroon horns | sideways oval leaves (dir x-dominant), leaf face 72° toward up, lichen sh `#B8604E`, ears `'mid'` | lichen hi+mid ≥ 77 % of ear/tuft px in all 8 facings (S 54/5 hi+mid/sh, NE 32/7, NW 33/9); `x-far-x3.png`: magenta only on legs |
| holds boil (bow drawn 3×, follow-through every frame) | 1-link ear/tail chains (2-link chains converge per REDRAW), no dust FX | raw diffs: bow 470 + 1 settle 67 px; idle keys 129-162 px + 1 settle 19-30 px; follow-through changes only with smear/spark stages, then one 4 px settle |
| leap = rear-up | all four paws rel-lifted, body near level, pos +0.10/+0.10 | `dir2/clip-pounce.png` f16 |
| headless from the front | head world pitch ≤ 31° in bark/pounce/hurt holds, ≤ 45° in sniff | `dir0act/dir0-actions.png`, `dir0/`: eyes + skull moss visible in every key |
| no bounce in locomotion | walk bob ±0.028 m, ears ±20°, tail ±16°; run flight ±0.03 m, spine ±22°/∓22°, ears/tail keyed | `dir2loco/clip-walk.png`, `clip-run.png` |
| J-hook hind paw, boxed tail tuft | hock under the knee, paw centred; rounded lathe tuft | walk strips; tuft still gets a 1-px inner-line ring from the back (any separate part in front of the rump does) |
| 1-2 px eyes | 0.075 × 0.07, tilted up | face_lit 89 %; eyes 2×2 in S/SE/SW (SE eye half in glow sh) |
| post-turn settle tail | head lag unmapped | 180° turn: 2 settle drawings (24, 8 px); 90° turn: 27 + one 2 px pop |

| # | criterion | score | evidence |
|---|---|---|---|
| 1 | Silhouette | 1 | profile/3/4 = box-on-legs + leaf blob + cap; S/N still a tall block (head over chest), V ears help |
| 2 | Pixel stability | 2 | off_grid/flicker/single_frame 0 everywhere; deterministic; pan 0 px |
| 3 | Line quality | 2 | silhouette_line 0/900, inner_lines 264, edge 0; `x-dbg-x8.png`: lines where ears/legs overlap the body, a small ring round the tail tuft from the back |
| 4 | Tonal discipline | 2 | moss 2-3 tones per facing, lichen mostly hi/mid, isolated_px ≤ 2; colours/slot basalt 11 is the estimator's neighbour-shadow count |
| 5 | Ground separation | 1 | noon/golden: cap + body read in sun and shadow; night cap only +13 % L over teal grass |
| 6 | Proportion / appeal | 2 | chunky companion, 2×2 eyes, moss-crowned head, leaf ears; face_lit 89 % |
| 7 | Animation timing | 2 | holds as charted, x1 only at the contact; actions read at dirs 0/2/4/6 |
| 8 | Weight / contact | 1 | paws exact at pose frames, but FK legs ride the root inside holds (module) |
| 9 | Personality / secondary | 2 | keyed ear/tail bounce in walk/run/actions, springy 1-drawing settles, head tilts |
| 10 | Smears / FX | 1 | crescent at dirs 0/2/6 (and 1), thin at dir 4; spark + flash fine; no dust (workaround) |
| 11 | Facing / turns | 2 | 45° steps 2 grid frames apart, 2 settle drawings |
| 12 | Technical | 2 | page_errors 0, deterministic, draw calls 2/1 |
| | **total** | **20 / 24** | no zeros; a critic should re-check dir 4 smear and night |
