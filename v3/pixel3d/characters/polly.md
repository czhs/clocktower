# Polly (cast `polly`) — design sheet (r2, after critic 15/24)

"The Polymorphic Parrot, in her λ tee." (mascot 15-150). Spec: `characters/polly.js`. Pack: `shots/char-polly/`
(`--preset cast --clips idle,walk,run,talk,vote,point,die,squawk,ghost,ghost-spent --raw`, **98 pass / 24 warn / 0 fail**),
bake `out/sprites/polly*` (10 clips × 8 dirs, `--game 1`, cell 58×76). r2 probes and stills: `shots/char-polly/r3/`.
Identity source (read only): `pipgws/packages/assets/scripts/cast/polly.ts`, `refs/cast/polly.png`. Everything rendered on
render-host (RTX 4090, GPU line in `report.txt`).

## 0. Brief
- Concept: a scarlet macaw mascot in a charcoal tee with a white λ, big round red head with white eye patches and a
  hooked ivory beak, red/yellow/blue wings hanging like sleeves, long red→blue tail. Adjectives: **cheerful, chatty,
  show-off** → personality body f 3.5 ζ 0.7 r 0, head f 4 ζ 0.8 r 0.
- Body plan: **upright chibi bird** (`chibi({ height 1.22 (skull top), heads 2.45, legs 0.6, arms 1.0, hips 0.23 })`,
  crest above to 1.36), `spec.bodyPlan 'uprightAnimal'`, heightPx [42, 56] (measured S 45).
- Identity: (1) blob = big round red head with a HOOK beak curling down in front + long tail swept off one side;
  (2) palette = scarlet + charcoal tee + white λ + blue/yellow wing bands; (3) no prop (the λ is the mark); (4) face =
  white patches with dark pupils, hooked ivory beak, dark lower mandible; (5) v1 motion: wings swing, 1-px bob.

## Unique to me (re-checked against the r2 renders)
1. **Extra animated parts.**
   - **Beak (r2)** = two ivory hulls: an upper-mandible WEDGE (wide base in the face → narrow culmen out to z 0.40) and a
     separate HOOK TIP that curls down to 0.035 m head-local, 4 texels under the mandible line. Delivered: at S the
     hook hangs over the chest below the chin, at SE/E it reads as a hooked macaw bill with the dark notch
     (`r3/z-ta.png`, `turnaround.png`). NOT delivered: at S the hook is inside the overall body silhouette (it sits over
     the tee), so the 25 % S silhouette is still a capsule (`lineup25-top.png`, row 1 col 1).
   - Wings = the arm chain: sleeve + red coverts / yellow band + blue flight / blue primaries. **r2: flight + primaries
     0.085 m thick (≥ 3 texels) with a broad tip, blue sh lifted to #34509A** → no 1-px navy sticks. Walk: flare 30°/6°
     on contacts, 18° on passes. **Talk: the gesturing wing presents its broad face** (`[40, −50, 62]` + forearm 30,
     probe `r3/s-talk.png` f20) — at dir 1 a red/yellow/blue paddle (`clip-talk.png` f0/f24/f48). **Squawk: wings flung
     UP into a V** (out 132 = 42° above level, twist −90): a V at S/SE/N/NW/SW (`r3/g8a.png` row 1); at dir 1 the far
     wing is a 3-texel blue paddle above the head (still the weakest read, `gs-squawk-1x.png`).
   - **Vote fan** (`fanR`, own bone): three 0.46 m primaries + yellow base, authored at 4 %, keyed ×24 only in the vote.
   - Tail = 1-link spring chain + keyed swish (walk ±14°, run). **r2: WIDE across X (0.15 m) and swept 40° to her
     right** (`TAIL.dir [−0.85, −0.55, −1]`): at N a broad red→blue diagonal (v1 N), at SE it trails off to the left like
     v1 SE, at W it sticks out behind; at S it hides behind the right wing (`r3/ta3/z.png`).
   - Crest (keyed): two red plumes raked back; lags in walk passes, up in talk/vote/squawk/point, flat in die and ghost.
   - Jaw: talk 36–38°, squawk 40°, point 30° ("you!"), vote 14°.
   - **Ghost halo** (`halo`, joint buried in the skull, micro ring offset 0.6 m up, ×1000 only in `ghost`) and **`ghostK`**
     (part-less control bone; its scale = ghost level for the shader). Both appended LAST (living bone indices unchanged).
   - FX: `speak` bubble (crown), `vote@fanTip` sparkle, `emote:exclaim@crown` on the squawk key. No die FX. No smears.
2. **My locomotion: a bouncy WADDLE-SKIP.** LegGait plan `bird`, `plant: 'hold'`, roll 10°, head bob 6°, authored walk
   clip (`blend: 'add'`) lift +0.05 m on passes, wing flare, tail swish. **r2: toe FANS** (3 toes 0.16 m wide + a back
   toe, darker legs slot `#76686C`), shins 0.07, hips 0.23 → the contact drawings show a flat dark toe fan under the belly
   (`gs-game1x.png` frames 2/6/10/14). Numbers: V 5.37 m/s = **3.95 H/s, cycle 0.278 s, 1.1 H/cycle, 4/4 drawings**,
   head bob 5.1 px, limp 2.0 (`game.readable` PASS). Still: the plan never shows one foot planted for two drawings
   (`foot_slide` n/a), and the passing drawings stand on one leg.
3. **Expressions.** Pupils cut from the white patches; blink = eye-bone collapse revealing a recessed ivory patch with a
   dark ∪ lash (r2: recess 1.6× the pupil — at SE the r1 1.3× patch let the ground show through as a green pixel).
   Die keys f6+ are SHUT at every facing (`r3/z-die.png`: S/SE show the lash, no pupil). Point = beak open on the
   thrust key, head turned along the wing.
4. **Game-speed readability (1× real time, `gs-*-1x.png` = every GIF frame with its ms).** Walk: lift + wing flare +
   tail swish at 60–70 ms drawings; one-word read: waddle. Talk: 200 ms beats, wing paddle out on alternate beats.
   Point: 270 ms gather → 200 ms "you!" → 1.0 s + 1.8 s held stroke → lower. Die: tips sideways over 0.67 s, lying on
   her side held 2.1 s. Squawk: crouch 270 ms → V + "!" → bob → V → settle.

## Proportions (vh 10, 36 px/m)
| | m | texels |
|---|---|---|
| height (crest tip) | 1.36 | 45 (S) – 47 |
| head ball | 0.50 wide × 0.51 tall × 0.47 deep | 18 wide |
| beak (wedge + hook) | 0.16 wide, 0.21 past the face, hook tip 0.31 below the culmen | 5 wide, hook 4 below the mandible |
| tee barrel | 0.42 wide × 0.36 deep, 0.27–0.73 | 15 wide |
| λ decal | 0.16 × 0.22, strokes 0.05 | 6 × 8, strokes 2 |
| leg (hip → ankle) / toe fan | 0.27 / 0.16 wide × 0.24 long | 4–5 / 5 × 6 |
| tail | 0.48 long, 0.15 wide | ≈ 15 at E, 4–5 wide at N |

## Palette (5 slots + accent)
red `#E85A50 / #C4323C / #7A2430` (r2 sh: hue 353°, within 15° of v1 #c4323c) · tee `#524C5A / #3A3640 / #2C2832`
(r2: neutral charcoal, v1 #2c2834) · ivory `#FFF6E6 / #EADCC4 / #A8948E` · blue `#5E8EE6 / #3A64B4 / #34509A` (r2 sh
lifted) · legs `#9A8C8C / #76686C / #4E4450` (r2 darker) · accent yellow `#FFDA62 / #E2B23E / #9C6A3C`. Ghost ramps
(shader only): ghost `#3A5696 → #E2EEFA` + mist `#D4E0F2`, spent `#3A4260 → #98A2BA`, halo `#FFE08A` emissive.
sig_ground: noon-sun dH 90 PASS, golden-sun dH 61 PASS, **golden-shade −29 % PASS** (r1 −24 % WARN), noon-shade −24 %
WARN (r1 −7 %): the shade copy is now dark red, not plum (`scene-golden-crop.png`).

## Timing charts (30 Hz grid, step)
- idle (loop 72, hold): f0 rest · f24 breath · f36 head cock · f56 rest · f62 blink (3) · f65 rest.
- walk/run: 4 keys, length 4, blend add.
- talk (loop 24): f0 beak 38 + left wing presents · f6 shut, bob · f12 beak 36 + right wing · f18 shut, bob.
- vote (40, held): f0 dip (3) · f3 right wing up + fan + beak 14, `vote@fanTip`.
- **point (108)**: f0 wing cocked back (4) · f4 wing out + beak 30 (6) · f10 held (30) · f40 emphasis +4°/+6° (6) · f46
  held (50) · f96 → f100 lowered (6) · f106 idle.
- **die (60, legs fk)**: f0 wobble, half lids (6) · f6 knees give, SHUT (6) · f12 tipping sideways roll 38 (4) · f16 on
  her side roll 82 (4) · f20 settle roll 75, held.
- squawk (36, glyph f6): f0 crouch (6) · f6 V spread + beak 40 (8) · f14 half wings (6) · f20 V (6) · f26 settle (6) · f32.
- **ghost / ghost-spent (loop 64, hold)**: hover 0.18/0.15/0.12/0.15 m (spent 0.12/0.10/0.08/0.10) over 16-frame holds,
  wings drifting, crest flat, f48 head cock; spent: head bowed 6°, no halo, dimmer ramp.

## Lights
None.

## Self-critique (Stage 7, r2)
Evidence: `shots/char-polly/report.txt` (98/24/0), `turnaround*.png`, `lineup25.png` / `lineup25-top.png` (25 % line-up
vs 19 cast members, run this round), `clip-*.png`, `gs-{game,talk,squawk,point,die}-1x.png` (every 1× GIF frame with ms),
`r3/g8a.png` / `r3/g8b.png` (8-facing stills of squawk f6, talk f0/f12, point f10, die f30, ghost f0, ghost-spent f0,
vote f10, idle f62), `r3/s-*.png` (probe sheets), `scene-golden-crop.png`, `bake/bake-se.png` (baked SE rows).
NOT run: `look=far`, `outlineDebug`, A/B (no shared code touched).

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 1 | hook + swept tail read at SE/E/NE/N/NW/W/SW; N tail is a broad diagonal (`lineup25-top.png` row 1 col 5). S still a capsule like owl at S (row 1 col 1 vs row 2 col 1) | an S feature outside the outline (wing tips flared, crest larger) |
| 2 | Pixel stability | 1 | idle/talk/vote/point/die/squawk/ghost off_grid 0, flicker 0; walk/game flicker 36 legs-only, foot in-hold 11 | module (plan 'hold' legs) |
| 3 | Line quality | 2 | λ is a coincident decal: one stable glyph on every walk drawing (`clip-game.png`), no dotted chest-edge line at E/W (`r3/ta3/z.png`); wings ≥ 3 texels; speckle 17 (r1 21); key_speckle die +19 WARN | die/vote key speckle |
| 4 | Tonal discipline | 1 | colors/slot WARN (legs 10, tee 7, red 5); isolated red max 6 (r1 11); red sh hue 353° | fewer leg tones |
| 5 | Ground separation | 1 | golden-shade −29 % PASS (r1 WARN), noon-shade −24 % WARN (1 % short), sun PASS | red sh one step darker |
| 6 | Proportion / expression | 2 | hook beak at 8/8; face_lit 98 %, face_visible 81 %; die eyes shut S/SE (`r3/z-die.png`); talk beak 38° | — |
| 7 | Animation timing | 2 | single_frame 0, strobe ≤ 1 every clip; point holds 1.0 + 1.8 s, die held 2.1 s (`gs-point-1x`, `gs-die-1x`) | — |
| 8 | Weight / contact | 1 | 3.95 H/s, 0.278 s, 4/4; toe fans visible on contacts (`gs-game1x.png` 2/6/10); foot_slide n/a, passing drawings on one leg | a 2-drawing plant (module) |
| 9 | Personality / secondary | 2 | point + ghost + ghost-spent delivered; talk wing presents a paddle, squawk V at S/SE/N/SW; tail/crest lag | dir-1 squawk far wing |
| 10 | Smears and FX | 1 | bubble/sparkle/glyph steady; halo emissive; no gesture smear | a point-flick smear |
| 11 | Facing and turns | 2 | 8 facings read; `r3/turn/clip-turn.png`: 45° steps held x2–x6, single_frame 0, face back by f45; turn.foot_slide 7.05 WARN (r1 5.22: wider toe fans) | planted turn feet |
| 12 | Technical | 2 | page_errors 0, deterministic, draw calls 2/1, pan/night_pan 0, RTX 4090, bake 10 clips × 8 | — |

**Total 18 / 24 (self).** Weakest: the S silhouette (capsule at 25 %), the plan-limited contact (no 2-drawing plant),
the dir-1 squawk far wing (a blue paddle above the head), and the die/vote key speckle.
