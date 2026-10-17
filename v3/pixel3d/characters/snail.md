# Tinker Pell (cast `snail`) — design sheet

"Fixes clocks. Slowly. Perfectly." Spec: `characters/snail.js`. Packs: **t1 touch-up `shots/char-snail/t1/pack2/` (final pack, incl. point/ghost/ghost-spent) + bake `t1/bake/`**; r6 (critic fixes) `shots/char-snail/r6/p4/`, 8-facing key stills `r6/s3/{A,B,W,T}.png`, S face zooms
`r6/s3/zS-*.png`, 1x GIF frame sheets `r6/p4/mine/gif1x-*.png`, palette A/B `r6/pal-compare.png` + `r6/palE/`; older: `shots/char-snail/r5/`,
key stills `shots/char-snail/r3/k-*.png` / `g8-*.png`, game-speed vs v2 `shots/char-snail/r4/gamespeed.{gif,png}`, bake
`shots/char-snail/bake/`. Identity source (read only): `pipgws/packages/assets/scripts/cast/snail.ts`, `refs/cast/snail.png`.
Everything rendered on render-host (RTX 4090, GPU line in every report.txt).

## 0. Brief
- Concept: a soft tan-olive snail tinkerer with a big brown spiral shell, two eye stalks in tiny brass goggles, a steel
  wrench held up front in two little paws. Adjectives: **calm, deliberate, precise** → heavy personality (body f 1.8 ζ 1
  r 0, head f 2 ζ 1 r 0), long holds (8–10 frames per key in the emote), small exact gestures.
- Body plan: **limbless** (the only limbless cast member, CAST_PORTING §6). Custom skeleton modelled on `rig.limbless()`:
  `base` root · `foot` = squash bone with its joint at the TAIL tip (z −0.42) so the stretch extends the sole forward ·
  `shell` and `neck` on `base`, joints on the foot top (y 0.13) = squash riders · `head` · `mouth` · `stalkL/R` → `eyeL/R` ·
  `pawL/R` → `wrench` / `gear`. `spec.bodyPlan 'limbless'`, `locomotion.plan 'glide'`.
- Game-speed arithmetic: H 1.05 m (v2 26 px) → v_game 3.95·H = 4.15 m/s, run 8.3 m/s. No feet → nothing to plant: one
  squash/stretch pulse of the foot per cycle, N 4 drawings × 2 grid frames = 8/30 s, C = 1.11 m = 1.05 H.
- Identity (ref facings): (1) blob = big round shell + two stalks (E/W: shell disc + stalks; S: disc behind a column);
  (2) palette brown shell / tan body / brass goggles / steel wrench; (3) wrench up front, right paw; (4) face: goggled
  eyes on the stalks, small smile on the column; (5) v2 motion: "walk frames stretch and squash the foot".

## Unique to me
1. **Extra animated parts.** Eye stalks (keyed, no chain: head accessories re-snap in loop clips, backlog M5): idle drift
   8–14°, talk swing 28° per beat pair, vote R stalk straight up + stretched 1.75× (`stalkR.s`, eye counter-scaled
   −0.343 so the goggle keeps its shape), die stalks folded back and shrunk 0.2× into the shell, emote stalks lean in to
   peer. Eyes blink via `eye*.s` (idle f54, 2 frames). Mouth opens via `mouth.s` y +1.4…1.6 (talk). Shell rides the
   foot squash ('.p' rider) and tips 28–34° in die. Wrench (`wrench` bone) turns ±(30…45)° four times in the emote; gear
   prop appears in the left paw (authored at 1/100, shown with `gear.s` +99). In the WALK the stalks are rigid
   (LegGait ignores authored walk poses, backlog M1; a 1-link chain A/B `shots/char-snail/wv-cs/` swept them back nicely
   but doubled idle/talk redraws 8 → 16 / 18 → 29, so rejected). **r6:** the stalks now swing in the WALK too
   (authored walk on the legacy Gait, see 2): trail −24° on the reach, fling +22° on the gather, L/R wobble 18° on the
   two pass drawings. Idle stalk extremes 0 → 26°. Tinker: the WORK wrench (`wrenchT`, jaw on the gear hub) swings ±38°
   in the screen plane, the gear clicks 30°, the column rolls ±8° and the stalks lean with every 8-frame turn.
2. **My locomotion (r6): an authored 4-drawing GLIDE PULSE on the legacy Gait.** LegGait 'glide' ignores authored walk
   poses (M1) and its pulse −cos(2π·k/4) makes drawings 1 and 3 identical (critic: "one distinct drawing + three
   near-identical"). Workaround: no `locomotion.plan`; the skeleton carries PART-LESS hidden legs (`hleg/hknee/hank`,
   bent, 0.41 m > hip 0.31 so hipDrop = 0.006 m, cancelled by clip `pos`), part-less sinks (`gsink`) for the Gait's
   hips/arm channels, `runFroude` above the game Froude, `legIK 'pose'`. `clips.walk` (length 4, step): REACH (sole
   +30 % long, −20 % tall, column leans 12°, stalks trail) · PULL (L stalk out) · GATHER (sole −20 % long +30 % tall,
   shell + column up 0.055–0.06 m ≈ 3 texels from −0.03, column rears −9°) · RELEASE (R stalk out). `game.readable`
   PASS 3.95 H/s, 0.267 s, 1.05 H, 4/4, holds 2×22; walk off_grid 0 / flicker 0; 8-facing drawings all differ
   (`r6/s3/W.png`). Old r5 notes below:
   **(r5) GLIDE (squash-pulse).** LegGait 'glide', `squash { bones ['foot'], amount 0.4, riders ['shell','neck'] }`,
   cycleTime 8/30 s, poses 4, lean [4, 8]. Drawings: long-low (foot 1.2× long, extends forward from the tail) → mid →
   gathered-tall (shell + column ride up ≈ 0.05 m ≈ 2 texels) → mid. `game.readable` PASS 3.95 H/s, 0.267 s, 1.05 H,
   4/4 drawings, holds 2×23; foot slide n/a by construction (no feet). One-word 1× read: "glide" — the species' own.
3. **Expressions (r6).** Smile = 2-texel dark slot + two upturned 1-texel corners (`smile` bone, hidden when the mouth
   opens); open mouth `mouth.s` [0.45, 2.0] = 3×3 texels in talk/vote/die/tinker-done (`r6/s3/zS-talk0.png`); blush cut
   into the head cap's ±47° facets (shell slot; subtle, 1–2 texels at S). Old r5 notes:
   **(r5)** Eyes = brass goggle ring Ø 0.16 + cream eye Ø 0.11 + dark 1×2-texel pupil, tilted 14° up, 12° out
   (2×2+ at S/SE/SW, `r1/zoom-S-SE-SW.png`). Talk: mouth open 3 texels on alternate keys + stalk swing + wrench paw lift
   30°; vote: eyes wide (+15 %), mouth open, column rears +0.14 m, R stalk up; die: eyes shut, retreat into the shell;
   emote: stalks peer at the gear, then the gear is held up, star glint.
4. **Game-speed readability.** Walk: foot length pulse (≈ 8 texels at dir 2) + 2-texel shell ride at 3.75 Hz; compare
   `r4/gamespeed.png` (v2 sprite next to the 1× crop). Talk: beat every 6 frames, amplitude 24 %. Vote: 4-frame dip →
   up, held (final_hold 0.8 s, 24 % off idle). Die: retreat by f16, held (35 % off idle). Emote: 8-frame holds, 26 % pose read.

## t1 touch-up (2026-10-16): point / ghost / ghost-spent (evidence `shots/char-snail/t1/`, render-host RTX 4090)
Clocktower-only audit: no combat clip existed (tinker = wrench work on a gear held in his own paws, die = a gentle
retreat into the shell, no hurt flash) → nothing to de-combat. Module fixes: the snail runs the LEGACY Gait (no
`locomotion.plan`), so M1/M2 (LegGait) do not touch it; round-2 changes re-checked by a full pack: `t1/base` (before) vs
`t1/pack2` (after) = **0 px differ** on every living render (turnarounds, idle/walk/run/talk/vote/die/tinker strips +
60 Hz, game onion, pan, noon/golden/night scenes; `t1/abdiff.py.js`). No hem/boots (limbless). game.readable PASS
3.95 H/s, 0.267 s, 1.05 H/cyc, 4/4 distinct drawings; 1× frames `t1/pack2/mine/gif1x-game.png`.

- **point** (one-shot, 104 frames ≈ 3.5 s = pipgws EMOTE_POINT_MS): Tinker points with what he has — BOTH goggled eye
  stalks swing forward ~66° and level onto the target like two pointers, the column leans after them (neck fwd 14,
  twist 26° to his left so at the game facing SE the stalks are a screen-horizontal stroke), sole stretches, mouth open
  "him!". Keys: f0 gather (stalks back, eyes wide) 4 · f4 POINT 12 · f16 jab (+8° stalks, column 0.03 m forward) 10 ·
  f26 hold 22 · f48 small jab, mouth 10 · f58 hold 34 · f92 satisfied blink, stalks up 12 · f104 idle. The wrench stays
  at its carry (never aimed). charcheck: off_grid 0, flicker 0, key_delta 30 %, pose_read 43 % ×10, key_speckle +4,
  strobe 1, hold_redraws 0. Reads at SE/E/W/NW (`t1/pack2/clip-point.png`, `mine/gif1x-point.png`, bake rows);
  weaker at S/N/SW (end-on stalks) — the game turns the avatar to the target, so SE/E/W dominate.
  The left paw jab is hidden behind the column at SE (far side); the stalks carry the read.
- **ghost** (loop 72, step, `dynamics: 'hold'`): hovers 0.13–0.16 m (1-texel bob every 18 frames), sole stretched long +
  thin, stalks near their idle splay ±6°, gold halo ring over the goggles (`halo` bone appended LAST, buried in the head
  at 1/1000 scale, `halo.s` +999 in this clip; HALO_UP 0.74 — 0.62 sat on the goggle tips at SE/E, `t1/s2/sheet.png`).
  Shader (spec-only `material.vertex/tones`, recipe from frog/mushroom): halo-bone world scale / base scale = ghost signal;
  luminance remap onto a pale-blue ramp, a faint self-glow at night, the foot dissolves through a 2×2 Bayer discard below
  bind y 0.20/0.13/0.07 m (25/50/75 %). charcheck: off_grid 0, flicker 0, key_delta 44 %, amplitude 30 %, islands 1.
- **ghost-spent**: same hover lower (0.08–0.11 m), stalks droop forward 20° (30° covered the face at S), eyes
  half-lidded, NO halo (`halo.s` +1 → 2× = the spent signal, ring still a speck), greyer + dimmer ramp. key_delta 22 %,
  amplitude 12 %. Night: `t1/night/ghost{,-spent}-crop.png` — pale and readable, spent visibly dimmer.
- Pack `t1/pack2/report.txt`: **108 pass, 9 warn, 0 fail** (the 9 WARN are the r6 ones, unchanged), page_errors 0.
- Bake `t1/bake/` (`--clips idle,walk,run,talk,vote,die,tinker,point,ghost,ghost-spent --game 1`): 10 clips × 8 dirs,
  cell 58×67, frames point 8, ghost 4, ghost-spent 4; auto-grew the render cell to 108 (no border warning at the final
  size). Ghost dither holes are real alpha (`t1/bake/z-ghost.png`).

## r6 changes (critic-snail 15/24) — what each issue became (evidence `shots/char-snail/r6/`)
| issue | fix | rendered evidence |
|---|---|---|
| tinker wrench hidden behind the gear | gear front-centre BELOW the mouth; separate work wrench `wrenchT` (1/100 scale, shown +99) pivoting on the gear hub, handle 7 texels past the rim, ±38° screen-plane turns + gear 30° click + column roll ±8° + stalk lean; carry wrench hidden (`.s` −1) | `s3/T.png` tink12 vs tink20, `p4/mine/gif1x-tinker.png` f1–5 |
| star lands on idle; gear not up | `emote:star@eyeL` ON the f40 "done" key, held to f72 (32 frames); gear moved up beside the goggles with `pawL.p` + `gear.p` (disc stays facing the camera) | `gif1x-tinker.png` f6–16 |
| walk = 1 distinct drawing, rigid stalks, skate | authored 4-drawing walk on the legacy Gait (hidden legs), stalks/column/shell keyed per drawing | `s3/W.png`, `gif1x-walk.png`, `gif1x-game.png` |
| S/SW silhouette: tan totem / "D" | shell = superellipse ball lathe (p 2.3, R 0.31, half-width 0.27, centre y 0.385, z −0.15): S disc ≈ 1.9× the column; stalks splay 0.6, len 0.315 → goggles break the outline at S/SE/SW | `p4/turnaround-silhouette.png` |
| blank S face | smile corners, 3×3 open mouth, blush facets | `s3/zS-idle0.png`, `zS-talk0.png` |
| tan body vanishes in noon/golden | skin → pink-peach `#FFDCC4/#EBA88E/#A4707E` (A/B: cream-peach, pink-peach, light cream; pink separated best from both grass and shell); shell sh `#623A48` → golden-shade dL −29 % PASS (was WARN); brass sh lifted for night goggles | `r6/pal-compare.png`, `p4/scene-*-crop.png` |
| spiral speckle, S wrench smudge | spiral CUT coplanar into the shell's side domes (0.062 m ribbon): turnaround isolated max 4 (was 7–9; the rest sit where stalks/foot meet the shell outline); carry wrench moved beside the column (steel on brown) and enlarged | `p4/turnaround-isolated.png` |
| die plank + box shell | sole pulls in (`foot.s` z −0.3), shell roll 34 → 18/15°, round lathe | `s3/B.png`, `gif1x-die.png` |
| talk bubble on the stalk tips | `fx.speech.up` 0.66 | `p4/clip-talk.png` |

## Proportions (vh 10, 36 px/m)
| | m | texels |
|---|---|---|
| goggle top | ≈ 1.03 | 37 (S) – 44 (NE) measured |
| shell | R 0.29, width 0.47, centre y 0.39, z −0.12 | 21 Ø |
| foot | 0.84 long, 0.36 wide, 0.15 tall | 30 long |
| column (neck + head cap) | 0.0 → 0.665, Ø 0.27 | 24 |
| stalks | 0.30 from y 0.665, splay 0.3 | 11 |
| wrench | 0.24 tall, jaw 0.15 | 9 |

## Palette (5 slots + accent)
skin `#EEDDA6 / #C9B57E / #8C7470` · shell `#D8A266 / #A8703E / #8A5A50` · dark `#7A5A5E / #583C46 / #3E2E3E` ·
brass `#FFDC7A / #CC9A34 / #84603E` · steel `#DCE4EE / #9EA8BE / #5E6482` · accent eye `#F6EEDE / #E2D8C6 / #A89CA6`.
Signature `['shell', 'brass']`, faceSlot skin. v1 values kept: the shell is darker than the body, as in v2 (deliberate
exception to "signature = lightest mass").

## Timing charts (30 Hz, step)
- idle (loop 72): f0 rest · f30 breath 0.014 m, stalks 8° · f36 0.028 m, 14° · f54 blink (2) · f56 · f66.
- talk (loop 24): f0 mouth open, column roll +6, stalks L 22° out, wrench paw −30 (`speak`) · f6 shut · f12 open, mirror · f18 shut.
- vote: f0 dip (neck −0.04, foot squashed) 4 · f4 neck +0.14, R stalk up ×1.75, eyes wide, `vote@eyeR` · held to f30.
- die (no hurt flash: Clocktower rule): f0 startle (eyes wide, mouth open) 8 · f8 duck, blink 8 · f16 retreat, shell tips
  34°, foot flattens, wrench dropped (`die`,`land`) 4 · f20 settle (shell 28°) → held to f60.
- **tinker (r6):** f0 tools out (gear + work wrench, carry wrench hidden) 8 · f8/f16/f24/f32 TURN ±: wrenchT ±38°, gear
  click, neck roll ±8, stalks lean (8 each) · f40 done: gear up beside the goggles, column up, mouth open, `emote:star@eyeL`
  ON the key, held 32 · f72 idle.
- point (t1): f0 gather 4 · f4 POINT (stalks level forward, column twist 26°, mouth) 12 · f16 jab 10 · f26 hold 22 · f48 jab 10 ·
  f58 hold 34 · f92 blink, stalks up 12 · f104 idle.
- ghost / ghost-spent (t1, loop 72): 4 step keys 18 apart (hover bob 1 texel, stalk sway ±6°); spent lower, stalks droop 20°.
- walk (r6): authored 4 keys × 2 grid frames, REACH · PULL · GATHER · RELEASE (legacy Gait); run = same ×1.25.
- (r5) tinker: f0 gear out, stalks peer 8 · f8/f16/f24/f32 wrench −45/+30/−45/+30 (8 each) · f42 gear held up, column up,
  `emote:star@eyeL` (20) · f62 idle.
- walk/run: LegGait glide, 4 drawings × 2 frames, squash 0.4. Run (2·v) = same pulse, optional (game has one speed).

## Self-critique r6 (evidence = `r6/p4` pack + `r6/s3` stills, render-host)
| # | criterion | score | note |
|---|---|---|---|
| 1 | Silhouette | 2 | round shell disc behind the column at S, goggles above the outline at S/SE/SW; still a squarish column base at S |
| 2 | Pixel stability | 2 | every clip off_grid 0 / flicker 0, deterministic 0 px, pan 0/23 |
| 3 | Line quality | 1 | spiral clean; isolated shell px max 4 (mark render 8) at outline joins; tinker key_speckle +≤6 |
| 4 | Tonal discipline | 1 | sig.shell hi/mid 0.89–0.98 but iso WARN; speckle 25 |
| 5 | Ground separation | 2 | all four sig_ground rows PASS; pink-peach body reads at noon/golden |
| 6 | Proportion/expression | 1 | smile + 3×3 open mouth read; blush only 1–2 texels |
| 7 | Timing | 2 | tinker keys differ visibly, idle stalks 26°, holds 2–32 |
| 8 | Weight/game speed | 2 | 4 distinct walk drawings at 1× (3 texel shell ride, sole length pulse); no feet → no grip (it is a glide) |
| 9 | Personality | 2 | stalks animate in every clip incl. walk; visible wrench work |
| 10 | Smears/FX | 2 | star inside the held key, bubble clear, sparkle + wisp |
| 11 | Facing | 2 | turn PASS |
| 12 | Technical | 2 | page_errors 0, 2 color draws, night 0 |
| | **total** | **21** (self; critic decides) | weakest: S face size, outline-join isolated px, run row bakes 3 drawings |

## Self-critique r5 (old; evidence = r5 pack unless noted)
| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 1 | `r5/turnaround-silhouette.png`: unique snail blob (no look-alike in the cast); shell + stalks at 7/8, but at SW (25 %) the stalks sit inside the shell outline → a "D" | stalks splay/lean so they break the shell outline at SW |
| 2 | Pixel stability | 2 | idle/walk/game/talk/vote/die/tinker off_grid 0, flicker 0; deterministic + vote.deterministic 0 px; pan 0/23 | — |
| 3 | Line quality | 1 | silhouette_line 0/952, inner_lines 276, edge_highlights 0; but spiral ribbon edges leave isolated px (`r1/zoom-iso.png`) | cut the spiral into the cap surface (coplanar, mushroom-spot trick) |
| 4 | Tonal discipline | 1 | sig.shell hi/mid 0.82–0.94 at 8/8; isolated_px shell max 7 (want ≤ 2); colors/slot dark 10 (pupil/mouth/groove share) | as #3 |
| 5 | Ground separation | 1 | sig_ground noon-sun dH 51, noon-shade dL −48 %, golden-sun dH 37 PASS; golden-shade WARN dL +4 %; tan body ≈ golden grass in `r4/scene-golden-crop.png` | lift shell sh further; skin a touch peach |
| 6 | Proportion/expression | 1 | face_lit 82 %; mouth opens ≈ 3 texels (`clip-talk.png`), blink, eyes wide in vote; face small and the wrench sits under it at S; emote stalks cross in front of the face at S (`r3/k-tinker16.png`) | bigger head cap / mouth, cheek accents |
| 7 | Animation timing | 1 | single_frame 0, hold_redraws 0, strobe ≤ 1 every clip; idle extremes only 14° apart on the stalks (< 25° rule) | idle stalk swing ≥ 25° |
| 8 | Weight/contact/game speed | 2 | game.readable PASS 3.95 H/s, 0.267 s, 4/4 drawings, holds 2×23; no feet (glide, slide n/a by construction); shell ride ≈ 2 texels; `r4/gamespeed.png` reads as a glide pulse | — |
| 9 | Personality/secondary | 1 | stalks/mouth/eyes/wrench/gear animate in clips as planned; stalks rigid in the walk (M1), no chain lag | M1 (authored walk poses under LegGait) |
| 10 | Smears/FX | 1 | speech bubble (talk), vote sparkle, die wisp, star glint visible in strips; no 8-facing FX audit run | 8-facing FX stills |
| 11 | Facing/turns | 2 | `r5/clip-turn.png`: 45° steps held 2 grid frames, settle within 0.4 s, turn off_grid 0 | — |
| 12 | Technical | 2 | page_errors 0, draw calls color 2 / normal 1, night_freeze 0, night_pan 0, render-host | — |
| | **total** | **16** | weakest: SW silhouette, spiral speckle, rigid stalks in the walk | |
