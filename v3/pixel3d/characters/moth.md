# Lumen (cast `moth`) — design sheet (r3)

"Lights the lamps at dusk; cannot resist them." Villager, lantern. Spec: `characters/moth.js`. Pack: `shots/char-moth/`,
evidence `shots/char-moth/self/` (+ `self/r3/`, `r3a/`, `dir2/`). Identity source (read only):
`pipgws/packages/assets/scripts/cast/moth.ts`, `refs/cast/moth.png`. Rendered on render-host (RTX 4090, every report GPU
line). Night light scene copy: `shots/char-moth/night.js`. r2 critique: `shots/critic-moth/` (16/24).

## Close-out (2026-10-17): golden-hour colour drift
Rendered on render-host (RTX 4090). Problem (`docs/CAST_GALLERY.md`, LEARNINGS "Run 05 close"): at golden the cream head went
apricot `#EFBC74` (sun copy), wings / collar / paws orange-tan `#DCA356`, antennae orange `#DA832A`, and the custom
`GHOST_GLSL` ghost / ghost-spent went khaki `#D0BD97` / `#B89B69` (the keeps test `uCharGhost`, which only `spec.ghost` sets,
so they act on this character-local ghost too). Fix = spec opt-ins only (no shared code):
`material.creamKeep: [1, 0.85], hueKeep: { fluff: 1, wing: 1, ant: 1 }`.

| variant (`shots/char-moth/moth_wk.js`, `--q char=../shots/char-moth/moth_wk&…`) | golden result | kept? |
|---|---|---|
| base (pre-fix, `base=1`) | head `#EFBC74`, sig_ground golden-sun **WARN dH 23 / dL +16 %** | — |
| `whiteKeep 0.8` (`wk-d`) | **0 px change**: the fluff hi `#F8F0DE` fails whiteKeep's chroma < 0.18 gate | no |
| `creamKeep [1, 0.85]` (`wk-a`) | head cream `#E7DFCF` sun, `#9F888D` shade (bands kept, 65 vs 67 colours in the 8-facing crop); golden-sun **PASS dH 12 / dL +30 %**, golden-shade dL +40 → +79 % | yes |
| + hueKeep wing (`wk-b`) | wings / collar / paws beige `#C0AF8D` instead of orange (wing mid luma 0.43 is under creamKeep's 0.45 gate) | yes |
| + hueKeep fluff (`wk-e`) | living look 0 px vs b; ghost head stays blue-grey `#B5C2CA`, ghost-spent `#9CA1A5` (were khaki) | yes |
| + hueKeep ant (`wk-f` = shipped) | antennae amber at the authored hue: `#C5924C` (sat 0.61 = `#E2A858`'s; base `#DA832A` hue 30°, sat 0.81); ghost antennae pale blue, halo pale gold instead of orange | yes |
| + hueKeep coat (`g`) | no visible change in living or ghost rows | no |
| `material.merge` | not needed: no junction seams on the turnaround (wing back/flap, collar) | no |

Evidence: `wkcmp-golden.png` (scene-golden-crop base / a / b / f), `wkz-golden-sun.png`, `wkz-golden-shade.png` (x2 zoom
sun / shade copy), `wkg8/cmp-{idle,ghost,ghost-spent}.png` (8 facings at golden: rows base / e / f / g), `wkg8/cmp-vote.png`
(base / b / e). Before-pack copy: `pre-wk/` (incl. `pre-wk/scene-golden-crop.png`); after: `scene-golden-crop.png`.
Noon / night: 0 px (`moth_wkdiff.py.js`: scene-{noon,night}{,-crop}.png base vs f).

Full pack `tools/charpack.sh moth --preset cast --clips idle,walk,run,talk,vote,die,lamp,point,ghost,ghost-spent,turn --raw`
→ **113 pass / 20 warn / 0 fail** (before 95 / 18 / 0; the +18 PASS / +2 WARN are rows the tools added since the touch-up:
`lamp.key_delta` WARN 1 % (g62, the last two shake → idle keys read as one drawing), `prop_area.lanternCap` / `glass` WARN
(lantern edge-on behind the body in the held vote at NE / N); the only status change from the keeps: golden-sun WARN → PASS).
Raw frame A/B pre vs new (`moth_rawab.py.js`): idle, vote, die, lamp, point, ghost, ghost-spent, turn, pan, night 0 frames;
walk / run / game / talk changed (607 / 644 / 607 / 62 px max) — **not this fix**: a `base=1` re-render of those clips is
0 px vs the new pack, so they are the shared module fixes since the touch-up (M15 walk height, steady talk bubble).
Looked at every changed clip at 1x real time: `wk-look/strip-{walk,run,game,talk}-1x.png` (every GIF frame + duration),
`wk-look/strip-gamecross-1x.png` (fixed-camera crossing): lantern in every walk/run drawing, boots alternate, one steady
speech bubble for the talk loop, no pops. Bake `tools/charpack.sh --bake moth --clips idle,walk,run,talk,vote,die,lamp,point,ghost,ghost-spent`
→ `out/sprites/moth.{png,json}` 10 clips x 8 dirs, cell 74 → re-baked at 100 (trimmed 90x84, anchor [45, 63]; die touched
74), no warning at the end; `moth-preview.png` looked at, every row complete.

## Touch-up (2026-10-16, Clocktower clip list) — point, ghost, ghost-spent; gentle die
Rendered on render-host (RTX 4090). Pack `tools/charpack.sh moth --preset cast --clips idle,walk,run,talk,vote,die,lamp,point,ghost,ghost-spent,turn --raw`
→ **95 pass / 18 warn / 0 fail** (before: 65/18/0 without the new clips; the 18 WARNs are the same rows: height/head_frac,
colours, speckle, fluff iso, foot_slide n/a, golden-sun dH 23 …). Bake `tools/charpack.sh --bake moth --clips idle,walk,run,talk,vote,die,lamp,point,ghost,ghost-spent`
→ `out/sprites/moth.{png,json}` 10 clips × 8 dirs (point 6, ghost 4, ghost-spent 4 frames), cell re-baked to 184 (no border warning at the end).
Evidence: `clip-point/ghost/ghost-spent/die.png` + `-1x.gif`; every 1× GIF frame with its duration: `t4/strip-*-1x.png`
(`shots/char-moth/gifstrip.py`); 8-facing keys `t1/`, `t2/` (night ghost), point arm variants `t3/v1-v6`; bake ghost rows `t4/prev-ghost.png`.

| change | how (code) | checked in |
|---|---|---|
| **point** (shared emote) | 48-frame one-shot: gather (paw to collar, eyes wide, antennae perked) → f4 POINT + `emote:exclaim`: right paw straight ahead, **lantern thrust out ahead at chest height** (`upperArmL [50,0,20]`, `forearmL −50`, `lantern0 −50` keeps it plumb), both antennae swing FORWARD along the point, body leans in → f16 firmer second point, mouth open → f28 → f38 shy glance aside, paw to collar → idle. A lone chibi paw hid under the head at SE in every arm variant (`t3/v1-v4`); the held-out lamp is what reads at dir 1 ("she lights up the one she means") | `clip-point.png`, `t4/strip-point-1x.png` (13 drawings, 2.3 s; "!" 0.9 s); pose_read 46 % ×8, hold_redraws 0, key_speckle +5 |
| **ghost** | loop 72, 4 step keys 0.6 s apart, `dynamics 'hold'`: hover (root +0.26, the legacy leg-reach dip pulls 0.1 back: head **5 texels** above idle, measured from the stage log `hs` 187.95 → 182.7), slow moth flutter (wings 26 ↔ 50 out, flaps unfolded 0.6·out), ±3° sway, eyes half shut, paw at the collar, lantern lifted to the chest, shins + boots scaled away (`shin*.s` −0.98). Look = `GHOST_GLSL` in the spec (material hooks, no shared code): signal = world scale of a new `halo` bone (child of head, ring authored at 0.001 scale) ÷ head scale; every tone remapped by luminance onto `#40567E → #E6F6FF`; coat + wing tips dissolve with a 2×2 ordered dither from bind y 0.42 → 0.12; the lantern is exempt (no dither) and its glass becomes a cold ghost-light `#DDF3FF` (emissive at dusk/night); pale-gold halo ring r 0.08–0.13 between the antennae | `clip-ghost.png`, `t4/strip-ghost-1x.png`, `t1/g8-ghost-f0-x3.png` (halo + face 8/8), `t2/a.png` (night); off_grid/flicker 0, amplitude 31 %; halo invisible alive (`turnaround.png` unchanged, heights 46/49/49/46/42/46/50/51 px as before) |
| **ghost-spent** | same loop, lower (root +0.20), wings drooped 10 ↔ 22, head bowed, eyes 0.62 shut, antennae limp, `halo.s` 1 (ring stays a buried speck, signal = 2): greyer ramp ×0.66, dither 0.48 → 0.16, glass ×0.72 | `clip-ghost-spent.png`, `t4/strip-ghost-spent-1x.png` |
| **die made gentle** | r3 opened on a flinch (`hurt` flash, wide eyes, open mouth = a hit reaction): now an 8-frame faint swoon (eyes droop, head tips back, paw to brow, wings + antennae sag, no flash event) → buckle f8 → sink f13 → dead-bug pose f18 (`land` soft dust) → soft settle → held | `clip-die.png`, `t4/strip-die-1x.png`; final_hold 2.07 s 127 %, hold_redraws 0 |
| combat audit | walk/run/talk/vote/lamp: no swing, strike, smear or hurt; the lamp emote is a toss-and-catch (kept) | — |
| module fixes | moth is on the LEGACY Gait (no `locomotion.plan`), so M1–M3 do not touch her walk; re-checked anyway: `t4/strip-game-1x.png` 24 frames — dark boots under the 0.15 m hem alternate every drawing, lantern in every drawing, game.readable 3.95 H/s, 4/4 drawings, flicker 0 | report.txt |

## r3 changes (critic issues, owner character)
| issue | fix (code) | verified in |
|---|---|---|
| lantern vanished in walk/run (0-5 glass px) | root cause: LegGait's body drop sat the 0.29 m-legged chibi DOWN (hips −0.2 m, coat on the grass, lantern sunk; `r3a/g8-walk-f3-x3.png`). Switched to the legacy Gait chibi recipe (CAST_PORTING §8) + authored `clips.walk/run`; the left arm's REST now carries the lantern out in front (upper arm fwd 45, forearm fwd 85); glass 0.125 × 0.14 m | `self/r3/g8-walk-2-x3.png` glass-hi px S 17 SE 12 E 21 NW 12 W 19 SW 9 (NE/N 0: behind the body, as in v1); `clip-game.png` lantern in every drawing; `dir2/clip-walk.png` lantern in every drawing |
| vote raised nothing | wings flung UP into a V (`WINGS(-22,140)`), flaps unfolded on a new hinge bone (`FLAPS(60)`), unfurled `wing*.s` y +0.8 → tips clear the head top; lantern held up by its base out to the left (`upperArmL [10,0,125]`, `lantern0 [180,0,-20]`) | `self/r3/g8-vote-20.png`, `r3a/vD-x3.png` (wings above the head at 8/8, lantern clear of the face at S/SE/SW), `dir2/clip-vote.png` |
| talk / idle hid the face; purple eyes | talk open keys tip the head UP (−16), shut keys level (+4); right paw out 62-75; idle glance turns RIGHT (toward the camera at dir 1); eye hi `#3A3050`; glint 0.044 m in the upper-inner corner; eyes x 0.128 / yaw 20 | `r3a/g8-talk-f16-x3.png` (= talk key f0), `r3a/g8-idle-f54-x3.png` (both eyes at SE) |
| antennae re-snap in holds | NO spring chains: antennae and lantern are keyed bones | raw audit below: vote hold after g11 only sparkle FX (≤ 33 px), die hold only keyed bounce + dust; `vote/die/lamp.hold_redraws` 0 |
| contact invisible | shins + boots in the dark `eye` slot, hem 0.11 → 0.15 m, elbow pump dropped | `self/game-1x-track-x4.png` dark boots alternate every drawing; `dir2/clip-walk.png` no sleeve stick |
| fan antenna = 1-texel stick, owl-like at E/W | fan frond: 3 lobes widening to 0.19 m, slab 0.075 m, width axis horizontal out-and-back, leaning back (dir z −0.42) | `turnaround.png`, `turnaround-silhouette.png`; sig.antenna iso max 3 (was 7) |
| emote never lifts the lamp before her eyes | lift before the face (f6), then she TOSSES it (`lantern0.p`, up to ≈ 0.58 m) and flutter-hops after it, catches it on landing | `r3a/g8-lamp-20-x3.png` (lamp above the head at 8/8), `clip-lamp.png`, `dir2/clip-lamp.png` |
| night glass near-white | glow hi `#FFD27A` (warm), mid `#FFB04A` | `r3c/scene-night-crop.png` |

## 0. Brief
- Concept: a small, soft lamplighter moth: huge fluffy cream head, big glossy dark eyes, two feathery tan fan antennae,
  pale wings folded like a cape over a little brown coat, a lantern carried out in front in the left paw. She scurries
  with her wings flickering. Adjectives **gentle, nervous, entranced** → personality body f 4 ζ 0.5, head f 4.5 ζ 0.55.
- Body plan: **upright chibi** (`chibi({ height 1.12, heads 2.15, legs 0.7, shoulders 0.34 })`) + keyed wing bones
  `wingL/R` (+ flap hinges `wingFlapL/R`), antenna bones `antL0/R0`, lantern bone `lantern0` under the left paw.
  `bodyPlan 'uprightAnimal'`; locomotion = legacy Gait (no `plan`), `legIK 'pose'`.
- Game speed: H 1.36, v_game 3.95·H = **5.37 m/s**, run 10.74. Leg 0.29 m = 0.21 H → duty 0.18 (skip-scurry), stride
  0.55 H, 4 drawings × 2 frames: measured **0.267 s / 1.05 H**, 4/4 drawings every cycle (`game.readable`).

## Unique to me
1. **Extra animated parts** (all keyed, ≥ 25° per drawing pair, no springs): wings scissor ±34° on contact drawings and
   flutter open 30° on flight drawings (walk), V-up + unfold in the vote, beat 112 ↔ 46 in the emote, spread flat in the
   die; antennae dip +10 / perk −12 with the gait and are keyed in every clip; the lantern is carried, raised, tossed and
   caught; glass glow quantised by time of day. FX: speech bubble, vote sparkles at the lantern, heart + wing dust, land
   dust, "!" glyph (point); no hurt flash (touch-up). Turns: rigid 45° steps (no chain settle).
2. **Flutter-scurry**: skip with a flight phase on every step (duty 0.18), body low on contacts / high on flights (pos
   ±0.03 m = 2 texels), wings scissor on contacts and flick open in flight, dark boots alternate. 1×: "scurry"
   (`self/game-1x-track-x4.png`). Slide: no foot is planted in two drawings (`foot_slide` n/a); 60 Hz in-hold glide
   **7.0 texels** (legIK 'pose' — the planted foot rides the root inside a 2-frame hold; r2 LegGait was 3.87 but seated).
3. **Expressions**: eye pads 0.125 × 0.15 m turned 20° out, 1.5-texel glint; blink `eye*.s` y −0.78; wide +0.22 (vote,
   emote); shut (die, emote landing). Mouth box opened 1.6 (≈ 3 texels) on talk open keys, head tipped up so it faces the
   camera. Idle glance over the right shoulder keeps both eyes on screen at dir 1.
4. **Game-speed readability**: walk bob + wing flicker + lantern + boots (`game-1x.gif`); talk beat every 5 frames
   (amplitude 45 %); vote up in frame 3, held (pose_read 66 %, final_hold 1.1 s); die down by f16 (0.53 s, 127 % off
   idle, held); emote: lamp above her head f12-f24 (pose_read 55 %).

## Proportions (vh 10)
antenna tips ≈ 1.36 m (42 N – 50 SW px) · head 0.52 m tall, 0.57 wide (head_frac 0.55) · coat hem 0.15 → shoulder 0.56 ·
wings 0.39 long · leg 0.29 m · lantern glass 0.125 × 0.14 (4.5 × 5 texels).

## Palette (5 slots + accent)
fluff `#F8F0DE/#E8D8B6/#A99098` (head, collar-free signature) · wing `#E4D0A8/#C4AC84/#8A7484` (wings, collar, paws) · coat
`#8C5C46/#5E3C30/#42303C` · ant `#E2A858/#A46E3A/#6A4A3E` (antennae, buttons, hem, lantern frame) · eye
`#3A3050/#2E2440/#272036` (eyes, mouth, shins, boots) · glow `#FFD27A/#FFB04A/#D07A3A`. sig_ground noon-sun dH 33, noon-shade
dL +47 %, golden-shade +79 %, golden-sun dH 12 / dL +30 % — all PASS since the close-out keeps (`creamKeep [1, 0.85]`,
`hueKeep { fluff, wing, ant }`; was golden-sun WARN dH 23, the cream head orange on golden grass).

## Timing charts (30 Hz; step)
- idle 72: f0 A (30) · f30 B −1 texel (6) · f36 blink (2) · f38 B (16) · f54 glance right + antenna twitch (12) · f66 A.
- walk/run (length 4 per cycle, phase-driven): contact L · flight · contact R · flight (run ×1.3 amplitudes).
- talk 20 (`speak` f0): f0 head up −16, mouth open, paw out 75 · f5 level, shut · f10 up, open, paw 62 · f15 level, 0.3.
- vote: f0 dip, wings gathered, lantern drawn in (3) · f3 VOTE_UP, `vote@lantern` · f30 same drawing (hold).
- die (fk, touch-up): f0 swoon, eyes drooping, paw to brow (8) · f8 buckle, eyes shut (5) · f13 sink back (5) · f18 dead-bug,
  `land` · f20 soft settle (4) · f24 → held (f62 same). No `hurt` event.
- point: f0 gather (4) · f4 point + lantern out, `emote:exclaim` (12) · f16 firmer, mouth open (12) · f28 (10) · f38 shy glance (10) · f48 idle.
- ghost / ghost-spent (loop 72): f0 high, wings open · f18 mid · f36 low, wings closer · f54 mid (each 18 = 0.6 s).
- lamp (fk): f0 looks at the lamp (6) · f6 lifts it before her face (6) · f12 tosses it, hop 1, heart (4) · f16 (4) ·
  f20 apex, lamp above her head (4) · f24 falling (4) · f28 lands + catches it, `land` (6) · f34/f40 sheepish shake (6) ·
  f46 → f52 idle.

## Dynamics (= code)
chains: none · personality body f 4 ζ 0.5 r 0, head f 4.5 ζ 0.55 r 0 · character legIK 'pose', quant yaw 8 chain 4 ·
locomotion walk 5.37 / run 10.74 m/s, stride 0.55 H, runStride 1.05 H, duty [0.18, 0.1], reach 0.6, poses [4, 4], lift
[0.054, 0.068], bob [0.035, 0.035] (overridden by the clips' pos ±0.03), lean [6, 12], runFroude [1.5, 2]·Fr_game.

## Lights
Glass glow: tones hook, 3 quantised levels, in every pack/bake. PointLight: scene copy only (`night.js`). No spec.lights.

## Self-critique (Stage 7)
Evidence: final `--preset cast --raw` pack (65 pass / 18 warn / 0 fail, `report.txt`), `dir2/` (vote, lamp, walk), 8-facing
stills `self/r3/g8-*.png` + `r3a/*-x3.png`, `self/game-1x-track-x4.png`, raw-diff audit (scratch `audit.sh`): vote
g8 642 · g11 925 then ≤ 33 px sparkles; die keys g8-g24, g26 512 / g30 546 keyed bounce/settle, then dust ≤ 106; talk
keys ~650-700 px + bubble 27/46 px; idle 349/35/35/473/283 = keys only. Bake `out/sprites/moth-preview.png` (cell 150, no
border warning).

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 1 | `turnaround-silhouette.png`: fan V at S/SE/NE/N/NW/SW; vote V wings 8/8; E/W the near frond is one rounded hook (owl's is a sharp cone) — still a single lobe; S reads a little "bunny" | a second frond visible in profile |
| 2 | Pixel stability | 2 | no chains; hold_redraws 0 vote/die/lamp; game/walk/run flicker 0 (r2 295/389); pan 0, night_freeze 0, deterministic | — |
| 3 | Line quality | 2 | silhouette_line 0/1122, inner_lines 468, edge_highlights 0 | — |
| 4 | Tonal discipline | 1 | fluff iso max 6 (SW), antenna iso 3, die.key_speckle +20, speckle 28 | head/eye edge specks |
| 5 | Ground separation | 2 | (close-out) all four sig_ground rows PASS: golden-sun dH 12 / dL +30 % (head stays cream `#E7DFCF`, `scene-golden-crop.png`) | — |
| 6 | Proportion / expression | 2 | face_lit 93 %; talk open key head up, face clear at S/SE/SW; glance keeps both eyes at SE; vote lantern clear of the face | — |
| 7 | Animation timing | 2 | single_frame 0, strobe 1 all clips; vote up in 3 frames, held; talk 45 %; holds clean in the raw audit | — |
| 8 | Weight / contact / game speed | 1 | 3.95 H/s, 0.267 s, 4/4 drawings, boots alternate at 1×; **in-hold glide 7.0 texels**, foot_slide n/a | a planted foot at 4 H/s without the LegGait crouch |
| 9 | Personality / secondary | 2 | wing scissor + flutter per drawing, lantern carry / raise / toss / catch, antenna keys (`clip-lamp.png`, `clip-game.png`) | — |
| 10 | Smears and FX | 1 | bubble, sparkles, heart, wing dust, land dust, "!" glyph (point); ghost halo + cold ghost-light glass; warm quantised glass; PointLight scene-only | spec.lights |
| 11 | Facing and turns | 2 | turnaround 8/8; turn 45° steps (`clip-turn.png`), no settle | — |
| 12 | Technical | 2 | page_errors 0, draw calls 2/1, deterministic, RTX 4090 | — |

**Total 19 / 24** (r3 self-score; close-out: row 5 → 2 = 20, unverified until a critic r2). Weakest: (1) in-hold foot glide
at game speed (legacy Gait; LegGait seats the chibi), (2) the E/W silhouette is still one antenna lobe.
