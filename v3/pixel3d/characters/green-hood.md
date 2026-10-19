# Wisp (cast `green-hood`): design sheet (r6, the fixes for critic-green-hood 16/24)

"A small wanderer in a green hood. Eyes like lanterns." Villager. Spec: `characters/green-hood.js`.
Pack: `shots/char-green-hood/` (full `--preset cast --raw`, 64 pass / 20 warn / 1 fail, render-host RTX 4090). r6 evidence:
`self/f-faces.png` (S/SE/SW/E/W heads ×6 of idle f0, talk f0, talk f10, glow f12, die f5, with glow/void counts),
`self/g8-{idle-f0,talk-f0,talk-f10,glow-f12,glow-f18,die-f5,vote-f8,vote-f20}.png` (+ `-x3` crops), iteration renders
`r6/` (t1-t5 turnarounds, b/ face tests, g1/ walk+run, g1d2/ dir-2 walk). Bake: `shots/char-green-hood/bake/`, copied to
`out/sprites/green-hood.*` (cell 58×64, 10 clips × 8 dirs since the touch-up below, no border warning after the automatic re-bake at 82).
Identity source (read only): `pipgws/packages/assets/scripts/cast/green-hood.ts`, `refs/cast/green-hood.png`.

## Touch-up (2026-10-16): point, ghost, ghost-spent (Clocktower-only clips)
Pack `tools/charpack.sh green-hood --preset cast --clips idle,walk,run,talk,vote,die,glow,point,ghost,ghost-spent,turn --raw`
→ 107 pass / 24 warn / 0 fail, page_errors 0 (render-host RTX 4090). Bake `tools/charpack.sh --bake green-hood --clips
idle,walk,run,talk,vote,die,glow,point,ghost,ghost-spent` → `out/sprites/green-hood.*` (+ `shots/char-green-hood/bake/`),
10 clips × 8 dirs, cell 58×64 (auto re-bake at 82). Point 6, ghost 4, ghost-spent 4 frames.
Evidence: `t1/`, `t2/` (8-facing stills: point f10/f18, ghost f0/f36, ghost and spent at night, `s1.png`/`s2.png` x3 crops),
`t2/strip-{point,ghost,ghost-spent}-1x.png` (every 1x GIF frame with its duration), `t3/clip-point.png` (gather fix),
`t3/bake-{point,ghost}.png` (bake rows), `t3/strip-game-1x.png` + `game-onion.png` (walk re-check).
- **Combat check:** no clip is combat-flavoured (the lantern vote, the glow emote and the gentle die have no strike, smear
  or hurt flash), so nothing was converted. Living clips are unchanged: A/B against the pre-touch-up spec
  (`shots/char-green-hood/gh_orig.js`, `ab/`) idle f0/f54, talk f0/f10, vote f20, die f60, glow f12/f30, and walk noon+night
  ×3 = **0 px differ** (with and without FX).
- **point** (106 f, held): a gather (mitt to the chest, squint, face to the camera) → f4 the LEFT mitt flicks out forward-up
  and out (`POINT_ARM` [112, 0, 36]). The mitt is stretched into a "finger" (`handL.s` y +0.7), the chest is turned so
  the left shoulder leads, and the **hood peak swings forward** along the point (a second pointer). A lantern glint
  (`sparkle@tip`) pops at the fingertip. f18 a firmer second point with narrowed eyes, then f24-105 held (≈ 3.5 s, the
  game's point time) with one blink at f70. pose_read 15 % ×4, off_grid/flicker 0, key_speckle +11 (gather key, WARN).
  It reads at SE (game facing), S, SW, W, NW and N. At E/NE the mitt is behind the hood (the crow showed the same).
- **ghost** (loop 72, 4 drawings, `dynamics: 'hold'`): the crow recipe, spec-only. `ghostK` is a part-less bone whose
  scale is read in `material.vertex` as det ratio → `vWispGhost`. In tones, hi/mid/sh are mapped by lightness onto a pale
  blue ramp `#34508E → #D6E6F4`. The void stays dark slate, and the lantern eyes turn emissive ice `#E8F8FF`. Below the
  belt the cloak fades to mist, the hem is a 2×2 checker, and everything below bind y 0.14 is discarded. Shins are scaled
  away. A night self-glow is added. The gold **halo** (8-bar octagon r 0.15) floats ≈ 0.07 m over the peak. Its geometry
  is ×0.001 on bone `crown`, whose joint is buried INSIDE the hood, and `crown.s` is 999 only in `ghost`. The hover is
  pos +0.27/+0.24 (net ≈ 0.16 m after the leg-reach dip), with sleeves drifting, the peak swaying and a look aside at f54.
  Results: amplitude 23 %, off_grid 0, islands 2 (= the halo, expected).
- **ghost-spent**: the same body lower (pos +0.21/+0.18), head bowed, eyes half shut and dimmer (`#A8BCD4`), the peak
  drooping, no halo, and a grey-blue ramp `#3A4260 → #9AA6BE` (night glow 0.22). amplitude 9 %. At night it is
  intentionally dim but still separates from the ground (`t2/s2.png` row 4).
- **Module-fix re-check (walk at game speed):** boots show under the hem on the contact drawings. The hem never touches
  the ground, and peak flop + bounce read in `game-onion.png` and `clip-game.png`. walk off_grid/flicker 0, head_bob 2.9 px,
  foot_slide still n/a (legacy Gait).

## r6 changes (one per critic issue, owner 'character')
| issue | fix | evidence |
|---|---|---|
| high: the glow fills the void at SE/SW, and talk/die flash the face pale | Eyes are convex **beads** (0.064 × 0.094 m) centred ON the void front, so they look the same size from every angle and don't show proud box sides. Expressions scale **y only** (a bead scaled in x shows a dark centre column, `r6/b/f-faces2.png`). Talk = eye roll ±15° ↔ squint y −0.55. WIDE y +0.18. Flare y +0.25 (two separate lamps). | glow share inside the opening, S/SE/SW: idle 0.17/0.22/0.20, talk f0 0.20/0.23/0.29, talk f10 0.16/0.20/0.09, die f5 0.22/0.26/0.33, glow f12 S/SE 0.24/0.25 (SW 0.52 is skewed by the halo ring inside the counting box; the eyes themselves stay 2×3 in a dark void, `self/f-faces.png` row 4). Everything is ≤ 35 % |
| high: no face at E/W | The hood front moves to z 0.215. A **bevelled rim** sits 0.046 m proud, its front faces sloping outward. The void front is 0.006 behind the rim edge and the beads poke 0.03 past it. | sig.rim E/W 30 px (was 11); eye px at E/W 4 each in idle (`r6/b` whole-crop count; turnaround E/W, `r6/t5/turnaround.png`); dir-2 walk shows rim + eye px in every drawing (`r6/g1d2/clip-game.png`) |
| med: purple in shade | cloak sh #403E5C → **#3B4739** (h 111, L 0.25) | noon-shade hood #3D4B42 (dL −28 % PASS), golden-shade #35383C; `scene-noon-crop.png`: a dark moss figure, not purple. Night eyes are still the brightest px |
| med: capsule silhouette, ball from behind | Hem flares to r 0.30 (concave profile, exp 1.35) with a sloped tan hem band. The peak moves to the crown (joint 0.43/−0.08) and is taller, its tip leaning 0.18 m to the side and 0.05 back, base sunk 0.03 deeper. | `turnaround-silhouette.png`: a bell with a waist notch, and the peak breaks the outline at 8/8 (N/NE/NW too, `r6/t5`) |
| med: the vote doesn't read | Wisp lifts a **lantern on a short pole** (bone `lampR` under handR; leather pole 0.3 m, trim base and cap, emissive glass). The arm is telescoped up and out (out 128). Sparkles fire at the lantern (`vote@lamp`). | vote.pose_read 20 % (was 13); the lantern is above the crown at 8/8 (`self/g8-vote-f20-x3.png`, sparkles in `g8-vote-f8-x3.png`) |
| med: the glow emote has no light | On the flare keys a 1-texel emissive **light ring** (bone `halo`, scale 0 elsewhere) lights round the rim. Events: f12 `sparkle@eyes` (glints), f14 `wisp@eyes` (a rising warm flame mote, `fx.wisp` warm tones), f30 `sparkle@eyes`. Eyes stay separate. Peak −16 (stays above the hood at S). | `clip-glow.png` f16/f34 ring, f30-f54 glints + rising flame; `self/g8-glow-f12/f18-x3.png` ring at 8/8 |
| low: bob-glide gait | Boots enlarged to 0.12 × 0.21 m and set 0.075 forward, so the contact flick reads as a brown 2-3 × 2 block (`clip-game.png`, `game-onion.png`). The planted-step fix is module-bound: the legacy Gait drives the legs, `locomotion.reach` changed nothing (in-hold 5.98 both ways), and foot_slide is n/a. | module issue M1/M3 |

## Unique to me (re-checked after r6)
1. **Extra animated parts** (all keyed, no spring chains):
   - Hood PEAK on bone `peak`: flops +18 on contact drawings and −28 on flight drawings, perks −18/−16 in vote/emote, droops +34 when dead, ±14 in talk.
   - Sleeves swing ±30 opposite the boots.
   - Hem roll on contact drawings.
   - EYES on `eyeL/R`: blink (y −0.8), talk roll ±15 ↔ squint, flare y +0.25, OUT (scale 0) at death.
   - New: a light RING `halo` (emote) and a LANTERN `lampR` (vote), both scale-keyed: hidden by `HIDE` in every other key.
   - FX: speech bubble, lantern sparkles, warm flame wisp (emote + death: the lantern flame leaves), land dust.

   Re-checked: every part shows in its clip strip (`clip-talk/vote/glow/die.png`).
2. **Locomotion: skip-scurry** (legacy Gait chibi recipe, V = 3.95·H). game.readable 0.267 s / 1.05 H per cycle, 4/4 drawings, holds 2. At 1× (`game-1x.gif`, `game-onion.png`, `clip-game-60hz.png`): a bounce plus peak flop plus boot flicks. foot_slide is still n/a (module).
3. **Expressions**: void + two bead lamps. At S each eye is 2×3. At SE/SW you see the near eye 1×3 and the far eye 2×2 in a dark void. At E/W you see the rim column + 1 eye nub. The glow stays ≤ 35 % of the opening in every key (counts above). Re-checked at x6 on S/SE/SW/E/W (`self/f-faces.png`); the r5 claim was not true at SE/SW, and this one is.
4. **Game-speed readability (1×)**:
   - walk: bounce, peak, boots.
   - talk: an eye-shape beat every 5 frames (amplitude 32 %) with the face staying dark.
   - vote: the lantern goes up on f3 (20 %), held.
   - die: down by f22 (91 %), held.
   - emote: ring + glints + flame (25 %).

## Proportions (vh 10)
H 1.08 m (41 texels at S), `chibi({ height 1.0, heads 2.0, legs 0.7, arms 0.8 })`.
- Hood: 0.54 m wide, flat front at z 0.215.
- Face: rim 0.344 × 0.316 outer, 0.046 proud; void 0.248 × 0.228; beads at ±0.056.
- Peak: joint at the crown, tip ≈ +0.24 up, 0.18 to the side.
- Hem: r 0.30 at 0.15 m, waist 0.185.
- Boots: 0.12 × 0.21.
- Arms: rest out 22 / fwd 16, forearm fwd 34.

## Palette (5 slots + accent)
- cloak `#62A078/#42745A/#3B4739`
- sleeve `#4E8062/#365C47/#3C4838`
- trim `#D8B67A/#B08A58/#7C5E5C`
- leather `#A8784E/#70492F/#4C3442`
- void `#3C3250/#2E2642/#2A2238`
- glow `#FFF0A0` (emissive: eyes, halo, lantern glass)

sig_ground:

| copy | result |
|---|---|
| noon-sun | dH 19, dL −43 % |
| noon-shade | dL −28 % |
| golden-sun | dL −62 % |
| golden-shade | dL −29 % |

All PASS.

## Timing charts (30 Hz, step)
- **idle 72**: f0 A · f30 B · f36 blink · f38 B · f54 curious tilt (head roll, eye roll −14) · f66 A.
- **walk / run**: 4 drawings (contact low / flight high); run uses ×1.3 amplitudes.
- **talk 20**: f0 eyes rolled +15, head roll −12, mitt out · f5 squint · f10 eyes rolled −15, roll +12 · f15 squint.
- **vote (held)**:
  - f0 dip + blink (lantern hidden).
  - f3 VOTE_UP: lean, right arm [12,0,128] telescoped, lantern shown (lampR +25 so it stands up), eyes y +0.18, peak −18. `vote@lamp`.
  - f30 hold.
- **die (held)**: f0 startle · f10 buckle · f16 tip · f22 DEAD (eyes OUT) · `land` f22.
- **point (held)**: f0 gather · f4 POINT + `sparkle@tip` · f18 firmer · f24 POINT · f70 blink · f72-105 hold.
- **ghost / ghost-spent (loop 72)**: f0 high · f18 mid · f36 low · f54 mid (+ look aside in ghost).
- **glow**:
  - f0 peer (squint).
  - f8 FLARE (ring on, eyes y +0.25, tiptoe, arms out, peak −16).
  - f12 glints · f14 flame mote.
  - f22 flicker squint (ring off).
  - f26 FLARE ×1.1 · f30 glints.
  - f40 blink · f44 idle.

## Self-critique (r6)
| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | bell + peak breaking the outline at 8/8 (`turnaround-silhouette.png`, `r6/t5`) | a 25 % lineup vs the cast (not re-run) |
| 2 | Pixel stability | 2 | off_grid/flicker 0 in every clip except run (4 leg-only specks, see module issues); deterministic, pan 0, night_freeze 0 | run speck source |
| 3 | Line quality | 1 | isolated_px cloak max 8 (was 7 → 11 → 8 after moving the arms out); key_speckle +13 vote / +18 glow / +20 die (thin lantern pole, ring) | thicker pole, fewer arm/skirt slivers |
| 4 | Tonal discipline | 2 | colors/slot void 2, sleeve 3 (were 9/11); shade stays green | — |
| 5 | Ground separation | 2 | sig_ground 4/4, scene crops looked at | — |
| 6 | Proportion, appeal, expression | 2 | void dominant at S/SE/SW in every key; one eye + rim at E/W; expressions by shape | bigger E/W eye |
| 7 | Animation timing | 2 | vote 20 %, die 91 %, glow 25 %, talk 32 % with no pale flashing | talk.micro 6 |
| 8 | Weight, contact, game speed | 1 | game.readable 0.267 s, 4/4; foot_slide n/a, in-hold 5.98 (legacy Gait) | module M1/M3 |
| 9 | Personality, secondary | 2 | lantern eyes now act as light (ring, glints, flame); peak flop; lantern vote | own gait |
| 10 | Smears and FX | 2 | speech bubble, lantern sparkles, ring + glints + flame, warm death wisp | — |
| 11 | Facing and turns | 2 | 8/8 read; turn redraws (M8) unchanged | M8 |
| 12 | Technical | 2 | page_errors 0, draw_calls 2/1, RTX 4090 | — |
| | **total** | **22** | | |

Weakest points:
1. The gait is still the legacy bob-skip (module).
2. Speckle on the action keys (pole, ring).
3. At E/W the eye is a 1-2 px nub, not v1's full eye.
