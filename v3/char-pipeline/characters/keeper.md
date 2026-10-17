# Keeper — design sheet (char-keeper)

Code: `characters/keeper.js`. Pack: `tools/charpack.sh keeper --clips idle,walk,run,raise,thump,hurt,turn` → `shots/char-keeper/`.
Night lantern light (needs a scene hook, see §7): `attachLantern(engine, ch)` exported by `characters/keeper.js`;
test scene `shots/char-keeper/night.js` (char-stage + the light on every keeper; `light=0` = A/B without it; `lc=<hex>&li=&ld=`
override colour / intensity / distance).
**Round 2** (after critic-keeper-r1, 14/24): every `character`-owned issue fixed — see §8 for the issue → fix → evidence list.

## 1. Concept
An old, stooped lantern-keeper of the ruins (~1.25 m): a heavy hooded cloak that hides the face except a long white
beard, a tall staff with a lantern hanging from a hook at the top that swings on a second-order spring.
Adjectives: **slow, heavy, kindly** → low-f, well-damped body and head (f ≈ 1.5, ζ ≈ 1: no snap), long holds
(anticipations 8–10 grid frames), short shuffling steps, a lantern that keeps swinging a little after he stops
(the only lively thing on him), head tilts and a slow nod instead of sharp moves.

## 2. Silhouette (black blob at ~50 px)
1. **Big peaked cowl + long beard** — the hood is ONE convex hull of 8-sided rings whose centres slide back as they rise:
   0.54 m across (1.14 × the 0.47 m mantle — the widest head-level mass), ending in a back-tipped point ≈ 0.11 m (4 texels)
   above the last ring. Pale dusty mauve (its own value step above the dark-brown robe). From the front: a pointed-arch
   face hollow (0.2 m = 37 % of the hood) with the nose peeking out, the white beard wedge filling its bottom.
2. **Staff + lantern** — a 1.45 m staff carried OUTBOARD at the right hip (hand ≈ 0.45 m off the midline), hook pointing
   out-and-back, the lantern hanging beside the hood: a tall line with a "flag" beside the head that no other character has,
   clear of the face at S/SE/SW (r1: carried in front-right, it ran down the face at the pack facing).
Body = a bell-shaped dark-brown robe to mid-shin under the pale mantle, stooped forward ~20°.

## 3. Proportions
| | metres | texels @ vh 10 (36 px/m) | @ vh 12.5 |
|---|---|---|---|
| skeleton height (ground → top of head, upright) | 1.30 | 47 | 37 |
| stooped, to the hood point | ≈ 1.38 | ≈ 50 | ≈ 40 |
| staff top (spec `height` incl. hook) | ≈ 1.45 | ≈ 52 | ≈ 42 |
| hood width / mantle width | 0.54 / 0.47 | 19 / 17 | 15 / 14 |
| shoulders (joint to joint) | 0.34 | 12 | 10 |
| face hollow (arch) | 0.20 × 0.25 | 7 × 9 | 6 × 7 |
| beard (top width × length) | 0.22 × 0.36 | 8 × 13 | 6 × 10 |
| lantern (glass) | 0.12 | 4–5 | 3–4 |
Staff 0.065 m (2.3 texels) square; feet 0.21 m long; hands 0.085 m. Measured: height 47–57 px over 8 facings, head_frac 0.39
(WARN: the cowl is deliberately big — it is half the signature).

## 4. Palette (sRGB `[hi, mid, sh]`; 5 slots + 1 accent)
| slot | hi | mid | sh | use |
|---|---|---|---|---|
| beard | `#F6F1E4` | `#DAD3C6` | `#A29CB4` | beard (signature 1: lightest mass) |
| cloak | `#CDB7A8` | `#977F7C` | `#6C586C` | hood + mantle (signature 2: pale dusty mauve) |
| robe | `#A27A58` | `#6E4E3A` | `#503A40` | robe, chest, waist, staff + hook (dark warm brown) |
| skin | `#F2C7A2` | `#CF9877` | `#8E5F6C` | nose, hands |
| dark | `#6E6A80` | `#45405A` | `#2E2A3E` | face hollow, sleeves, leggings, boots, rope belt, lantern cap/base |
| glow (accent) | `#FFF4C2` | `#FFD27A` | `#F0A050` | lantern glass: emissive via a material hook, flickers at night |
Value plan (r2): beard > hood/mantle > robe — three steps head → hem (r1: hood, mantle and robe were one mid-brown mass).
Robe mid vs grass mid `#75A558`: warm brown, off-hue. Shadow hues: beard lavender, cloak mauve (≈ 300°), robe brown-rose
(darker than skin sh by > 15 % value), skin rose, dark slate. Beard sh stays lighter than every grass shadow.

## 5. Parts / bones
Skeleton `biped({ height: 1.30, heads: 3.6, shoulders: 0.34, chains })` + chain `lantern0` (1 link, parent handR, rooted at
the hook end). Sockets: `staff` on handR (`at [-0.05,-0.04,-0.01]` = grip on the hand's outer side, `rot [90,0,0]`: socket +Z
straight down the staff to the butt in an upright hand), `lantern` on lantern0 (glass centre; the night PointLight hangs
here). `material.sides { handR: 'mid', lantern0: 'mid' }`: the staff/lantern props never flip into the far-half shadow.
- head: hood (hull, cloak), face hollow (extruded pointed arch, dark, 0.035 m proud of the hood front), nose (skin), beard
  (hull leaning forward at the bottom, beard).
- chest: mantle (8-sided frustum, cloak) + chest (robe); spine: waist (robe); hips: robe skirt (robe) + rope belt (dark).
- arms: dark sleeves (bell cuff), skin hands. Left hand rests on the small of the back.
- legs: dark leggings + dark boots.
- staff (socket space): shaft 0.065 × 1.45, knob, hook arm 0.19 m at 210° (out to −X and back), hook tip — all robe slot.
- lantern0: dark cap, glow glass 0.12, dark base.

## 6. Motion list (30 Hz key grid)
- **idle** (step, loop 84): breathe up (f0, hold 36) → mid (f36, 6) → down (f42, 36: 1 texel lower, neck + head nod, dozing)
  → mid (f78, 6). Spine/chest do NOT move (r2): the staff hand only drops 1 texel, the lantern never swings in idle.
- **walk** (step, length 12, 4 drawings per cycle at 0.6 m/s → each held ≈ 3–4 grid frames): a cane shuffle —
  f0 left contact: staff tip planted ahead (butt 18° forward), body 1 texel down, hips twist +9° + pelvis tilt (hem sway);
  f3 passing: body up, staff 12° behind plumb (he walked past it); f6 right contact: staff lifted and swinging forward, body
  down, sway to the other side; f9 passing: staff carried forward, body up. Legs/feet stay procedural (stride 0.26 m).
- **run** (step, length 8, 4 drawings): hurried hobble at 1.7 m/s (`runFroude [0.3, 0.4]` — at 1.6 m/s the r2 run stayed
  in WALK mode), deeper stoop, staff thrust 22° ahead and planted, 1-texel+ bob, free arm swinging.
- **raise** (signature, step, 75 frames):
  | f | key | hold | notes |
  |---|---|---|---|
  | 0 | anticipation: deep sink (−0.085 m), hood ducks 16°, staff dipped 22° top-forward | 10 | |
  | 10 | **lift**: arm raised SIDEWAYS beside the hood (`LIFT`), staff plumb, lantern ≈ 0.35 m over the hood point, body straight | 12 | lantern swings on its spring |
  | 22 | peer left: head twist +56°, chest/spine +8/+6 (small, so the arm stays beside the hood) | 16 | |
  | 38 | peer right: mirror | 16 | |
  | 54 | lower: staff back to the hip, nod | 10 | event `stepR` |
  | 64 | settle | 10 | |
  | 74 | READY | | |
- **thump** (step, 32 frames):
  | f | key | hold | notes |
  |---|---|---|---|
  | 0 | gather: crouch −0.085 m, hood ducks, staff lifted a little | 6 | |
  | 6 | **hoist**: arm abducted 95° (`HOIST`), staff near plumb (≈ 15° butt-forward) at his right side, butt ≈ 0.35 m off the ground, body rising + leaning back | 8 | heavy wind-up, readable at S/E/N/W |
  | 14 | **contact**: staff slammed plumb at the hip, body dropped forward | 1 | `smear: 'staff'` (minAngle 12: a short streak beside the body), events `land` + `hit@staff` (dust ring + burst) |
  | 15 | follow-through squash: deeper crouch, head nods | 8 | |
  | 23 | recovery | 8 | |
  | 31 | READY | | |
- **hurt** (step, 21 frames): f0 flinch back (event `hurt` → flash), hold 5; f5 stagger back on the right leg, staff knocked
  16° top-BACK (away from the face), head counter-nodded so the hood's world pitch stays shallow, hold 7; f12 recover, 8; f20 READY.

## 7. Secondary motion / personality / FX
- personality (r2): body f 4, ζ 1, r 0; head f 3.6, ζ 1, r 0 (r1's f 1.5/1.3 drew the upper body turning for 0.8 s after a
  turn); `character.quant { yaw: 15, chain: 4 }`. Heaviness comes from the long holds (8–16 frames) and the 4-drawing gait.
- lantern chain: 1 link, gravity 100, f 3.4 / ζ 0.82: one small overshoot, then still.
- locomotion idle recovery steps: `stepYaw 70, stepTol 0.1, stepTime 0.2` (fewer, quicker shuffles under the robe).
- smear on `staff`, dust ring + dusty burst at the butt, hurt flash.
- glow: lantern glass emissive through `material.tones` (steady pale gold by day; at night a 4-level flicker stepped every
  4 grid frames). Night PointLight (scene code, `attachLantern(engine, ch)`): r2 default `#FF5A28`, intensity 2.6, distance
  2.4 — the only variant whose ground pool reads amber on the teal night grass (`night-hue-x3.png`: r1 `#FFC46B` 1.6 / 3.2
  → olive pool, mean (103,125,109) vs ground (93,122,121); `#FF5A28` → (104,119,102) with a brown-amber core).

## 8. Critique
Evidence (rendered on the render host = the tools' default host, looked at): final pack `tools/charpack.sh keeper --clips
idle,walk,run,raise,thump,hurt,turn` → `shots/char-keeper/` (report.txt: **32 pass / 7 warn / 0 fail**); thump + raise at dirs
0/2/4/6 → `shots/char-keeper/dir{0,2,4,6}/`; 8-facing key grids `k-thump-x3.png` (g0/g6/g14/g15), `k-raise-x3.png`
(g0/g10/g22/g38); `odbg.png` + `odbg-x6.png` (outlineDebug dir 1); `far.png` + `far-x3.png` (look=far); night light
`night-l0/l1/a/b/c.png`, `night-hue-x3.png`.

### 8a. Critic r1 issues (owner character) → fix → evidence
| issue | fix | evidence |
|---|---|---|
| staff + lantern on the face at SE, glowing face at night | staff outboard at the right hip (arm out 30°, grip on the hand's outer side), hook 210° out-and-back | turnaround SE/S/SW, clip-idle, scene-*-crop: lantern beside the hood in all copies |
| hood = plain dome narrower than the mantle | hull cowl 0.54 m (1.14 × mantle) with a 4-texel back-tipped point, own pale slot | turnaround-silhouette (point in 8/8 facings), turnaround-plain |
| face hollow = visor | pointed arch 37 % of the hood, nose inside | turnaround S, dir0/clip-thump f0/f39 |
| thump wind-up = levelled lance; smear = cream quad over the torso | side hoist (arm abducted 95°, staff near plumb, butt 0.35 m up), slam at the hip, minAngle 12 streak | k-thump-x3 g6, clip-thump f14–f22, dir0/dir4 strips: streak beside the body |
| raise invisible / lantern not above the hood | deep sink (hood ducks) → arm up beside the hood, staff plumb, lantern ≈ 0.35 m over the point | k-raise-x3 g10 (8 facings), clip-raise f18–f25 |
| walk = gliding block | 4-drawing cane gait (length 12): staff plant/swing, 1-texel bob, hips twist + pelvis tilt | clip-walk.png (staff angle changes every drawing), walk.foot_slide 0.0 |
| post-turn redraws ≈ 0.8 s; olive night pool | personality f 4/3.6 + quant yaw 15 → large redraws end 0.33 s after the last facing step (small 11–60 px ones to 0.67 s); light `#FF5A28` | raw turn log (A/B ab-turn* runs), night-hue-x3.png |

### 8b. Module issues and my workarounds
- **motion — deterministic**: `Character._resetSim` still keeps each chain link's `L.dir`. Workaround: the idle never moves the
  staff hand except straight down (no swing → settled dir = un-aimed dir) → deterministic **PASS**. Any re-simulation landing
  mid-swing in an action would still differ (wv.js `wv=r` patch still proves the one-line fix).
- **tools — walk.foot_slide**: r2 PASS 0.0 only after moving the side sway from `pos.x` into a pelvis tilt — a `pos.x` sway of
  1 texel per key read as 1.15 texel "slide" (charcheck measures 60 Hz frames inside holds).
- **look/lighting — walk/run specks**: 32–50 single-pixel changes per clip in the shaded chest under the wide hood while the
  root glides (WARN "specks only", upper 0). A/B: not the mantle, not the clip (r1-style walk clip on r2 geometry also specks),
  not inner lines (outlineDebug: shading pixels). r1's narrower hood had 0. Shadow-map/shading re-rasterisation; owner look.
- **look — lights**: no `spec.lights` hook; the lantern PointLight exists only in scene code; its flicker runs on engine time.

### 8c. Rubric (self-score, evidence above; a critic should re-check)
| # | criterion | score | evidence |
|---|---|---|---|
| 1 | Silhouette | 2 | pointed cowl + staff/lantern flag in all 8 facings at 25 %; beard at S/SE/SW/W/NW |
| 2 | Pixel stability | 1 | idle/actions/turn off_grid 0, flicker 0, pan 0, deterministic PASS (workaround); walk/run 32–50 speck px (WARN) |
| 3 | Line quality | 2 | silhouette_line 0/1404, inner_lines 468, edge 0; odbg: lines on staff, belt, hollow edge, none inside the beard |
| 4 | Tonal discipline | 1 | isolated_px beard ≤ 2; look=far magenta only on arms/legs; colours/slot WARN (cloak 8, dark 7 estimate) |
| 5 | Ground separation | 1 | noon/golden: both copies read; night pillar copy reads by the cowl point + beard + glass, body dark |
| 6 | Proportion / appeal | 2 | face_lit 67 %, arch face + nose, chunky cowl; head_frac 0.39 by design |
| 7 | Animation timing | 2 | single_frame 0 everywhere; hoist → 1 contact → squash; raise holds 10–16; read at dirs 0/1/2/4/6 |
| 8 | Weight and contact | 1 | foot_slide 0.0 walk/run; staff plants in walk; robe still hides the legs |
| 9 | Personality / secondary | 1 | lantern swings on every staff move; turn tail shortened but faster body lag trades some "slow" |
| 10 | Smears and FX | 1 | streak + dust ring + burst, flash; smear is narrow by design (vertical impact) |
| 11 | Facing and turns | 2 | 45° steps every 2 grid frames, 8 facings read |
| 12 | Technical | 2 | page_errors 0, draw calls 2/1, deterministic PASS |
| | **total** | **18 / 24** | no zero; not re-scored by a critic |

Open: walk/run specks (look), sprite bake not run.
