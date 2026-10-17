# Wanderer — design sheet (reference character, lead)

The pipeline's reference character: built by following `docs/CHARACTER_PLAYBOOK.md` stages 0–6 exactly.
Code: `characters/wanderer.js`. Pack: `tools/charpack.sh wanderer --clips idle,walk,run,attack,hurt,turn` → `shots/char-wanderer/`.
Sprites: `tools/charpack.sh --bake wanderer --clips idle,walk,run,attack,hurt --cell 132` → `out/sprites/wanderer.*`.

## 1. Concept
A small road-worn sword-wanderer under a wide pale straw hat, a long red scarf streaming behind.
Adjectives: **nimble, steady, weary** → quick light feet (snappy body, f ≈ 3), a calm head that lags (ζ ≈ 0.9),
a scarf that trails and whips (ζ 0.75: one overshoot, then still); a sword carried steady, never swung for show; actions: long held anticipation, one-frame strike.

## 2. Silhouette (black blob at ~50 px)
1. **Wide conical hat (kasa)** — 0.66 m ≈ 24 texels, 1.8 × the shoulder width, a shallow 8-sided cone with a red band:
   a flat lens with a point on top of a narrow body (an upside-down "T"/mushroom). Nothing else in the cast has a brim wider
   than the shoulders.
2. **Scarf tail** — a 0.5 m red strip trailing from the neck (secondary chain): a second shape behind the body that
   shows the movement direction. Plus the short sword's line in the right hand.
Body under the hat = A-line coat to mid-thigh + dark boots (like a poncho over legs).

## 3. Proportions
| | metres | texels @ vh 10 (36 px/m) | @ vh 12.5 |
|---|---|---|---|
| skeleton height (ground → top of head) | 1.38 | 50 | 40 |
| total incl. hat apex (spec `height`) | 1.53 | measured 47–49 (30° pitch) | 37–39 |
| head (biped `heads: 3.8`) | 0.36 | 13 | 10 |
| hat brim Ø | 0.66 | 24 | 19 |
| shoulders (joint to joint) | 0.37 | 13 | 11 |
| leg (hip joint → ankle) | 0.50 | 18 | 14 |
≈ 4 heads to the brim. Limbs 0.09–0.11 m (3–4 texels); boots 0.11 m wide, feet 0.22 m long.

## 4. Palette (sRGB `[hi, mid, sh]`; 5 slots + 1 accent)
| slot | hi | mid | sh | use |
|---|---|---|---|---|
| hat | `#F7EBC4` | `#DDC48A` | `#A48A86` | hat (signature: the lightest mass) |
| coat | `#8C93C4` | `#5A6194` | `#3D3A5E` | coat, sleeves (blue-violet: off-hue vs grass) |
| scarf | `#F07656` | `#C2463A` | `#7C2F44` | scarf wrap + tail (warm accent, reads in shade) |
| skin | `#F6D2AE` | `#D9A27E` | `#9A6872` | face, forearms, hands |
| dark | `#8E7466` | `#5E4A46` | `#3E3038` | hair, trousers, boots, belt, grip, eyes |
| steel (accent) | `#F0F4F6` | `#B6C0CA` | `#68728C` | blade, guard |
Value plan vs grass mid `#75A558` (luma ≈ 0.53 sRGB): coat mid is ≈ 40 % darker and blue-violet; coat sh `#3D3A5E`
≥ the night floor `#3A3040`; shadow tones per slot differ in hue ≥ 20° (straw-mauve / violet / wine / rose / brown)
so they never merge. Hat sh stays lighter than every grass shadow → the hat reads in cast shadow and at night.

## 5. Parts / bones
Skeleton `biped({ height: 1.34, heads: 3.8, shoulders: 0.36, chains: { scarf: { n: 3, parent: 'chest', … } } })`
→ 17 biped bones + scarf0..2. Sockets: `weapon` on handR, `rot [90,0,0]` (blade continues the forearm; +Z blade, +X edge, +Y swing axis).
- head: face (chamferBox, skin), hair back/side (dark), eyes 2 texels (dark), **hat** = ONE convex 8-sided profile
  (r 0.33 → drooping rim r 0.29 at 0.035 → straight cone to the apex at 0.21) cut into three lathe bands that share it
  exactly: brim (hat) / band y 0.065–0.105 (scarf red) / top (hat), tilted 6° back about the brim centre. Coincident
  surfaces = no depth step = no inner line inside the signature shape (the old brim + crown lathe had a concave junction and
  a 0.03 m vertical rim: 7–12 dotted grey px per facing). `isolated_px` hat: 0–1 per facing.
- neck: skin; chest: coat (chamferBox) + scarf wrap (scarf); spine: coat; hips: belt (dark) + coat skirt (4-sided
  flared frustum to mid-thigh).
- arms: coat sleeve on upperArm (full length), skin forearm + hand (different slot from the coat: arms never
  vanish against the body).
- legs: thigh (dark, mostly under the skirt), boot shin (dark frustum) + cuff, foot (dark chamferBox).
- scarf0..2: one 0.13 × 0.17 × 0.045 m strip per link (scarf), tapering. MIDLINE accessory: chain rooted at x 0.02
  (|x| ≤ 0.03) and `material.sides { scarf0..2: 'mid' }` — at x 0.05 look classed it as a left bone and the far-half
  shadow flipped it orange ↔ wine with facing.
- sword (on handR, built in socket space then `K.xf` by the socket transform): grip (dark), guard (steel), blade 0.40 × 0.075 × 0.03 m (steel).

## 6. Motion list (30 Hz key grid)
- **idle** (step, loop 72 frames): breathe up (f0, hold 30) → mid (f30, 6) → down (f36, 30) → mid (f66, 6).
  Sword held low and forward (forearmR bent), weight slightly right, head tilted.
- **walk / run**: procedural stride-wheel gait (`spec.locomotion`), 8 / 6 drawings per cycle, `character.legIK 'pose'`
  (held drawings). Authored `clips.walk` / `clips.run` (8 / 6 step keys, one per gait drawing) override ONLY the sword arm:
  walk carries the blade steady forward-down (upperArmR fwd 8 ± 4, forearm 44 ± 2), run trails it low behind (upperArmR
  fwd −28 ± 4, forearm 4 ± 2). The procedural swing windmilled the blade 0 → 40° every step and held it like a lance in
  the run. The left arm keeps the procedural swing.
- **attack** (step, 23 frames) — DIAGONAL forehand slash, high right → low left (a horizontal slash at brim height was
  a 2–4 px sliver behind the hat from dir 4). Sword-arm changes between keys ≥ 40°:
  | f | key | hold | notes |
  |---|---|---|---|
  | 0 | anticipation: coil (spine/chest twist −24), elbow folded 70°, blade cocked back over the right shoulder | 7 | upperArmR [60,0,80] |
  | 7 | **contact**: arm swept across, blade at hip height on the left, lunge (root 0.1 m) | 1 | `smear: 'weapon'`, event `hit`; upperArmR [45,0,−30] |
  | 8 | follow-through: chest unwound further (+14°), arm wrapped low-left, bent over | 8 | upperArmR [18,0,−42], forearm 15; scarf whips |
  | 16 | recovery: settle, sword lowered | 6 | |
  | 22 | end = READY (→ idle) | 1 | |
  Blade visible in the follow-through at dirs 0/2/4/6; at dir 1 it is behind the body (the wrap is the read there).
- **hurt** (step, 18 frames): f0 snap back (event `hurt` → 2-grid-frame flash), hold 5 (≥ flash + 2, so the recoil is seen
  3 grid frames); f5 deeper recoil + step back on the right leg (thighR −20, root z −0.08), hold 6; f11 recover, 6; f17 READY.

## 7. Secondary motion / personality
- scarf chain: f 4.5, ζ 0.75, r 0.5, gravity 0.6, falloff 0.85, noForward (one overshoot; f 3.2 / ζ 0.4 wiggled 1.2 s).
  Turn redraws after a 180° turn last ≈ 0.67 s, but most of them are facing steps, idle recovery steps and the head lag:
  ζ 0.55 → 0.75 changed the turn's drawing count 38 → 37.
- personality: body f 3, ζ 0.65, r 1 (light, slight anticipation on starts); head f 2.8, ζ 0.85, r 0 (calm lag).
  Redraw quanta `quant { yaw 8°, chain 1/8 }`: the lag shows as 2–4 held drawings, not a crawl.
- FX: smear on `weapon` (length 0.465 m, inner 0.12, palette `['#C4CED0', '#DCE2E2']`: 15 % lighter than the default
  grey, which was < 5 % from lit meadow), run-contact dust, hit spark at the blade tip, hurt flash.

## 8. Critique

### 8a. History: lead self-score 21/24 vs critic 16/24 (2026-10-15)
The first self-critique scored 21/24 from the dir-1 pack strips alone. The critic (`shots/critic-wanderer/`) scored **16/24**:
the face was the skin shadow tone #976670 in every facing (brim shadow-map shadow); the hat carried 7–12 dotted inner-line
px per facing; the scarf flipped orange ↔ wine with facing (sided by bind x 0.05); the anticipation was a straight arm
pointing sideways and the follow-through differed from contact by 11° + 6° (same drawing); the horizontal slash was a
2–4 px sliver behind the hat at dir 4; hurt's first recoil showed for 1 grid frame; turns had five x1 drawings; the sword
windmilled in the walk and was held like a lance in the run. Lesson: **score only from checks that cover all facings, the
drawing log and numeric tone samples** (playbook Stage 6 now requires them).

### 8b. After the fixes (lead, 2026-10-15) — 20/24 (self-score; awaiting a critic re-check)
Pack `shots/char-wanderer/` (charcheck 30 pass, 7 warn, 0 fail), attack at 4 facings `shots/lead-integrator/keys3-x4.png`
+ `atk2-d{0,2,4,6}/`, `turn-lookfar-x3.png`, `odbg-x8.png`, `face-x8.png`.

| # | criterion | score | evidence |
|---|---|---|---|
| 1 | Silhouette | 2 | cone hat lens + scarf tail in all 8 facings (`turnaround-silhouette.png`) |
| 2 | Pixel stability | 1 | idle/attack/hurt/turn 0 off-grid, pan 0 px; walk/run 15–16 px of self-shadow specks per frame while travelling (lighting) |
| 3 | Line quality | 2 | `silhouette_line` 0/1241; hat has NO inner lines (outlineDebug dir 1: all 77 red px are brim-over-face, arm, legs); `isolated_px` hat 0–1 |
| 4 | Tonal discipline | 2 | hat 2 tones + band, no grey speckle; scarf one value family in every facing (`look=far`: never magenta) |
| 5 | Ground separation | 2 | `scene-{noon,golden,night}-crop.png` both copies read |
| 6 | Proportion and appeal | 1 | face only partly lit (`face_lit` 47–59 %, dir 7 still mostly #976670) — look-side self-shadow work in progress |
| 7 | Animation timing | 2 | anticipation 7 → contact 1 + smear → follow-through 8 → recovery 6; `single_frame` 0 in every clip; hurt recoil 3 grid frames after the flash |
| 8 | Weight and contact | 2 | foot slide 0.0; lunge re-plants; hurt steps back |
| 9 | Personality / secondary | 1 | scarf trails/whips; post-turn settle still ≈ 0.67 s of redraws (facing + recovery steps + head lag, motion) |
| 10 | Smears and FX | 2 | diagonal C crescent at dirs 0/2/4/6, clear of the hat from behind; lighter palette |
| 11 | Facing and turns | 2 | `clip-turn.png`: every drawing ≥ x2 |
| 12 | Technical | 1 | 0 page errors, deterministic, 2/1 draw calls; walk/run WARN rows (specks) remain |

Open: face self-shadow (look), travelling self-shadow specks (lighting/look), the dir-1 follow-through hides the blade
behind the body, post-turn redraw tail (motion).
