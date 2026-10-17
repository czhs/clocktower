# Duelist — design sheet (char-duelist)

Code: `characters/duelist.js`. Pack: `PIXEL3D_HOST=game-host tools/charpack.sh duelist --clips idle,walk,run,lunge,spin,parry,hurt,turn --raw`
→ `shots/char-duelist/`. Built by following `docs/CHARACTER_PLAYBOOK.md` stages 0–6 (template: the wanderer).
Round 2 (2026-10-15) fixes every `character` issue from the critic (`shots/critic-duelist-r1/`, 16/24). Skeleton as
built: `biped({ height: 1.36, heads: 3.9, shoulders: 0.33, legs: 1.06 })` + cape (2) + plume (3, curved).

## 1. Concept
A quick, slim fencer (≈ 1.45 m to the hat) in a wide crimson tricorn with silver lace and a big curving cream plume,
a short navy shoulder cape, cream shirt sleeves and a long slim rapier. Adjectives: **snappy, cocky, light** → short
anticipations (5–6 frames), long *posed* holds after the hit (showing off), chin up, left hand on the hip in idle and
walk, springs that react fast and settle fast (no wobbly tail).

## 2. Silhouette (black blob at ~50 px)
1. **Tricorn + plume** — a three-cornered hat 0.59 m corner to corner (≈ 21 texels, 1.8 × the shoulders), point
   forward. Built as THREE upturned brim walls (cocked brim: rim corners 0.17 m at the back, 0.10 m at the front point,
   dipping to 0.08–0.13 m at the edge middles) around a LOW crown (0.095 m), so the corners stand ≥ 0.03 m above the
   crown — the concave cocked brim is the read (r1's single convex loft was a cone / toadstool). From the front: a wide
   V with two raised back corners; from the side: an inverted trapezoid; from behind: the plan triangle. A silver lace
   band (0.05 m) runs along every wall top. The plume rises from the crown's left-back and **curves** up-out-back
   (three links with their own rest directions); it breaks the silhouette upward at S, SE, E, NE, SW and W, and only as
   a small bump at N / hidden at NW (`turnaround-silhouette.png`).
2. **Rapier line** — a 0.62 m blade, 3 texels wide at the guard tapering to 2 at the tip, carried forward (tip ≈ 10°
   below level, out to the right) — clear of the legs.
3. **Short cape** — a navy half-cape to the waist on the back, widening the shoulders from behind.

## 3. Proportions (measured, vh 10)
| | metres | texels |
|---|---|---|
| total (plume tip, S) | ≈ 1.6 | 58 at S (47–60 over 8 facings) |
| head (`heads: 3.9`) | 0.35 | 12.5 |
| tricorn corner-to-corner | 0.59 | 21 |
| plume (3 × 0.15 m) | 0.45 | up to 13 above the brim |
| shoulders | 0.33 | 12 |
| rapier blade | 0.62 × 0.085→0.055 | 22 × 3→2 |

charcheck head_frac 0.409 is WARN because the plume counts as "head" height (head joint → top); the head alone is ≈ 0.25.

## 4. Palette (sRGB `[hi, mid, sh]`; 5 slots + 1 accent)
| slot | hi | mid | sh | use |
|---|---|---|---|---|
| hat | `#F0765E` | `#C23E4C` | `#6C2A4A` | tricorn walls + crown (signature), sash |
| plume | `#FFF2D6` | `#E4D0AA` | `#A795A8` | plume (the lightest mass), shirt sleeves, collar |
| coat | `#5F8FB4` | `#365D84` | `#3A3A5E` | doublet, cape, mantle (sh lifted from `#2A3558`, which sank into the night ground in r1) |
| skin | `#F6D2AE` | `#D9A27E` | `#9A6872` | face, hands |
| dark | `#8A6E5C` | `#5C4636` | `#3E3430` | hair, breeches, boots, gloves, grip |
| steel (accent) | `#F0F4F6` | `#B6C0CA` | `#68728C` | rapier, cup guard, **hat lace** |

The hat lace is steel, not cream: cream lace merged with the cream plume at its root (r2 A/B: `lace=dark` was murky;
steel separates lace / crimson / cream plume). The plume now sits on crimson walls, not on a cream wall (r1 issue).

## 5. Parts / bones
- head: face (chamferBox, skin), hair back + queue (dark), eyes, moustache; **tricorn** = `hatParts()`: 6 half-wall
  hulls (crimson) + 6 lace hulls cut from the same wall planes (steel, coincident, no depth step) + crown frustum(8).
- plume0..2: tapered feather slabs (widths 0.09 → 0.14 → 0.12 → 0.06 m, 0.07 m thick) built with `K.hull` along each
  link's own direction (`PLUME_DIRS`); the bones get per-link `pos`/`axis` after `biped()` (the `chain()` helper only
  builds straight chains). `sides: mid`.
- chest: doublet + collar; mantle; spine: waist; hips: sash + peplum; cape0..1 panels (`sides: mid`).
- arms: cream sleeve, dark glove, skin hand; legs: dark breeches, boots + cuffs, feet.
- rapier on handR in socket space: grip, cup, quillons, tapered blade hull. `material.sides.handR = 'mid'` so the
  prop no longer flips white ↔ slate with facing (`far.png`: magenta only on arm/leg parts). Workaround for a look
  module limitation (see the module issues in the report).
- sockets: `weapon` (handR, rot [90,0,0]) for the spin crescents; `stabU` / `stabD` at the blade TIP (same rotation)
  for the thrust streaks.

## 6. Motion list (30 Hz key grid; key grids at dirs 0/2/4/6: `shots/char-duelist/keys/keys-<clip>.png`)
- **idle** (step, loop 72): breathe 0/30/36/66 (holds 30/6/30/6), 1 texel of bob. The head's WORLD pitch stays
  constant (the head counter-rotates the chest breath), so the plume chain is not re-aimed on every key → 7 drawings
  in 4 s, 0 dynamics redraws.
- **walk / run**: procedural gait; `clips.walk` (8 keys) keeps the left hand on the hip, rapier forward (upperArmR
  [8±4, 0, 20], forearm 70±3); `clips.run` (6 keys) trails the blade low behind.
- **lunge** (straight thrust):

  | f | key | hold | notes |
  |---|---|---|---|
  | 0 | anticipation: crouch back, hand pulled back by the hip (upperArmR −55, elbow 115, wrist +22: blade level, pointing forward), small coil (−11°) | 5 | |
  | 5 | **contact**: full lunge, arm straight, blade level forward (+4° wrist) | 1 | `smear: ['stabU','stabD']`, `hit` (spark) |
  | 6 | cocky hold: lunge deeper, wrist flicks the tip ≈ 25° up, chin up, back arm flung up-back | 7 | |
  | 13 | recovery | 5 | |
  | 18 | READY | | |

  The heading change from coil to contact is ≤ 20°, so the two tip streaks are straight speed lines above and below
  the blade at dirs 1/2/6. Streak px on the contact frame: dir2 99, dir6 73, dir0 12 (the stab points at the camera),
  dir4 0 (hidden behind the body).
- **spin**: coil (torso −58°, sword arm already out at 82°, elbow 45) 6 → three `weapon` smear keys at hips 70 / 190 /
  310 with the blade near horizontal at shoulder height (upperArmR [10, 0, 82], forearm 15) → follow-through hips 375,
  arm wrapped across 7 → recovery 5 → READY. Weapon socket `inner 0.32` → crescent bands, not pie wedges. Smear px on
  the first contact frame: dir0 585, dir2 500, dir4 404, dir6 402 (min = 69 % of the best; r1: 41 vs 831).
- **parry**: f0 dip with the blade already rising (upperArmR [50,0,22], elbow 40, wrist 10), held 3 → **snap** into
  the block (upperArmR [75, 0, 28], elbow 50, wrist 15: hand forward of the right shoulder, blade ≈ 50° forward-up in
  front of the chest plane beside the brim), clash spark only, no crescent, held 10 → cocky flick (tip out-and-down,
  chin up) 5 → READY. The swing from f0 to the block is ≈ 40°. The block reads at dirs 0/2/4/6 (`keys-parry.png`).
- **hurt**: f0 snap back (`hurt` → flash) 5 → recoil + step back + chest twist 20° away 6 → recover 6 → READY. Head fwd =
  −(spine + chest) − 5 in every key → head world pitch −5° in all three keys (r1: +10° / +20° read as a bow); the face
  is visible at dir 0 in every key (`dir0/clip-hurt.png`).

## 7. Secondary motion / personality (final numbers, same as the code)
- plume chain: f 8, ζ 0.85, r 0, gravity 0.1, falloff 0.9, limit 45. cape chain: f 7, ζ 0.9, r 0, gravity 1, noForward.
- personality: body f 4, ζ 0.55, r 0 (r 0 because facing is a step input); head f 3.5, ζ 0.9, r 0.
- `character.quant { lean 3, yaw 8, chain 4 }`. Note that `chain` is buckets per unit of direction (higher = FINER).
  r2 A/B on raw diffs: chain 8 → 3 plume redraws (12–15 px) after the idle keys; chain 4 → 0.
- Settling (raw 60 Hz diffs, upper body y < 190): 0 redraws after idle keys. After the 90° turn the last facing step is
  g44 and the upper body settles by g50–g52 (6–8 grid frames, ≤ 0.27 s); later changes are the motion module's idle
  recovery steps in the legs. After actions, 3–4 settle drawings shrink to 4 px (lunge g28–g34, spin g34–g40).
- FX: spin crescents (`weapon`), two tip streaks (`stabU`/`stabD`, palette `#DCE2E2`), hit spark at the tip, run
  dust, hurt flash.

## 8. Critique (round 2, own pass — a critic should re-check)

Evidence (all rendered on game-host and looked at): full pack `report.txt` (39 pass, 4 warn, 0 fail);
`dir{0,2,4,6}/clip-{lunge,spin,parry,hurt}.png` + raw; `keys/keys-{lunge,spin,parry,hurt}.png` (key × facing grids);
`far.png` (look=far); `odbg.png` (outlineDebug, dir 1); `x-night-d{1,4,6}.png` (night, pillar shadow).

Measured: height S 58 px (47–60), face_lit 59 % (S .61 / SE .57 / SW .59), isolated_px hat [0,1,1,1,2,1,3,0] (max 3 at
W, at a lace/wall corner), silhouette_line 0/1405, inner_lines 470 (odbg dir 1: 76 red px, 25 in the hat rows = brim
over the face + plume root; none along the blade over the boots), edge highlights 0, every clip off_grid 0 / flicker 0 /
single_frame 0, foot slide walk 0.0 / run 0.0 / turn 0.11, pan 0 px, deterministic, 0 page errors, 2 colour draws.

| # | criterion | score | evidence / remaining miss |
|---|---|---|---|
| 1 | Silhouette | 2 | cocked tricorn with raised corners + curved plume at all 8 facings; distinct from the wanderer's lens kasa (V with raised corners at S, trapezoid at E/W); plume weak at N/NW |
| 2 | Pixel stability | 2 | off_grid/flicker 0 everywhere, pan 0, deterministic |
| 3 | Line quality | 2 | no world line; inner lines at brim/face, arm/coat; the blade crosses the boots without the r1 dashes |
| 4 | Tonal discipline | 1 | hat = 2 crimson tones + lace, plume has its own value; rapier never far-forced (`far.png`); isolated_px max 3 (W) > 2 |
| 5 | Ground separation | 2 | noon/golden fine; the night pillar copy reads at dirs 1/4/6 (dir 4 weakest: mauve-navy vs teal) |
| 6 | Proportion / appeal | 2 | face lit 59 %, hand on hip, chunky hat, matches this sheet |
| 7 | Animation timing | 2 | anticipation → 1-frame contact → hold → recovery; each action reads at dirs 0/2/4/6 except the lunge from behind (blade hidden by the body) |
| 8 | Weight / contact | 2 | foot slide 0.0, the lunge re-plants on contact |
| 9 | Personality / secondary | 1 | numbers now match the sheet; idle has 0 redraws; the plume settles ≤ 8 grid frames after a turn; 3–4 small settle drawings remain after actions |
| 10 | Smears / FX | 1 | spin crescents visible at all 4 facings (≥ 69 %), parry is spark-only, the thrust = straight tip streaks (a workaround: fx has no linear smear kind); dir 0 only 12 px |
| 11 | Facing / turns | 2 | turn steps 2 grid frames apart, all 8 facings read |
| 12 | Technical | 2 | 0 page errors, deterministic, 2 colour + 1 normal draw |
| | **total** | **21 / 24** | no zeros. The r1 self-score was also 21 and the critic gave 16, so expect a re-score lower |
