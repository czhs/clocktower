# Mortimer — design sheet (char-crow)

Cast member `crow` (villager): "Gravedigger. Very calm about it." Identity source (read only):
`pipgws/packages/assets/scripts/cast/crow.ts`, `refs/cast/crow.png`. Code: `characters/crow.js`. Pack: `shots/char-crow/`
(r2: full `--preset cast --raw`, 63 pass / 20 warn / 0 fail; r1 62/21/0). Evidence: `shots/char-crow/self/` (r1), `shots/char-crow/r2/` (r2 stills, variants, FK probes). All renders on render-host
(RTX 4090, GPU line in `report.txt`).

## Stage 0 — brief

**Concept**: a small crow undertaker under a huge brown wide-brimmed hat, near-black feathered head with a long pale
plague-doctor beak and amber eyes, a long slate coat with brass buttons and ragged tails, an iron shovel planted in his
RIGHT hand like a walking stick. **Adjectives**: calm, deliberate, dry (calm family, CAST_PORTING §10).

**Identity (5 items)**
1. Blob at 1×: the hat brim WIDER than everything (0.82 m vs coat hem 0.60 m; v2 20 px vs 15 px) + the beak poking out
   sideways at E/W/SE/SW. `turnaround-silhouette.png`: brim widest at 8/8 facings.
2. Palette anchors: dark undertaker-brown hat mid `#64462F` (v2 `#4E3528`; r1 `#86603E` read tan/cowboy), pale beak `#E8D2A0` (v2 `#E2CFA0`), charcoal coat lifted to
   slate-mauve `#6E6884`→`#625E72`, near-black feathers `#36344E`, brass/amber accent.
3. Prop: iron shovel, RIGHT hand, planted beside him (v2 header: "shovel in the right hand, planted like a walking stick").
4. Face: two 2×2 amber eyes either side of the beak base, no mouth line (the beak IS the mouth: lower beak on a jaw bone).
5. v2 motion: 1-px bob, coat tails lag (`lag` in the draw code), shovel rocks with the arm (`armFwd`).

**Body plan**: upright chibi, robed (`chibi()`, `bodyPlan 'uprightAnimal'`, `locomotion.plan 'biped'`). Not a horizontal
bird: v2 draws him upright in a coat with talons peeking out.

**Proportions** (texels at vh 10 = 36 px/m)

| part | m | texels |
|---|---|---|
| H (ground → hat crown) | 1.32 (castHeight(33)) | 45–51 (`height_px` S 45, max 51) |
| skeleton height (head top) | 1.09, heads 2.37 (head 0.46) | 39 |
| hat | brim Ø 0.82, tilted back 12°, crown r 0.18→0.15, 0.19 tall | 30 wide |
| head | Ø 0.52 octagon lathe, chin 0.62 m | 19 wide |
| beak | r2: 0.43 long, 0.19 wide at the base, 37° down (eyes → chest, v1) | ≈ 10 tall at S, 7–9 long at E/W, tip past the head at NW |
| coat | hem r 0.30 → waist r 0.20, 0.10–0.62 m | 20 wide at the hem |
| leg | 0.28 (0.21 H), hip 0.34 | hidden (talons only) |
| shovel | 0.93 long: blade 0.24×0.23, shaft 0.08 square (r2), T-grip 0.17; r2 planted further out/back (arm rest out 48°/54°, fwd −10/−26, shaft 0.035 m outboard) | blade 6–8 px, gap to the hem at S/SE/N |

**Palette** (5 slots + accent; r2 = hat hi/mid and coat a step darker, critic r1 "lift the shadow tone, not the lit tone"): hat `#86603E/#64462F/#4C3442` (signature A, also the shaft), coat `#6E6A82/#56526A/#463E54`
(largest mass, sh ≥ `#3A3040`), feather `#525A80/#36344E/#2C2A42` (head, ruff, sleeves, hands, talons — a value step below
the coat so the arms read; sh 35° of hue from the coat sh), beak `#FFF0C6/#E8D2A0/#AC927E` (signature B, the lightest mass),
iron `#D6DAE4/#9CA2B4/#5E5C76` (blade), brass accent `#FFD27A/#E0A040/#9A6A3A` (eyes, 2 buttons, buckle, back half-belt).

**Parts / bones**: chibi skeleton + `jaw` moved to the back of the beak (frog lesson) + `hat` (own bone on the head:
tipped in the emote) + `shovel` (prop bone under `handR`: the vote re-grip slides it with `shovel.p`) + `dirt` (child of
the shovel at the blade; microscopic rest geometry scaled ×220 with `dirt.s` in the dig) + `flapL/flapR` (part-ful coat
tails at the back vent, keyed — not chains). Arms authored BENT at rest (r2: right arm out 48°/54° and swung back 10°/26° so the planted shovel stands
clear of the hem at S/SE/N; blade plane yawed −30°). r2 also: brim rim 0.06 m thick, talons 0.24 m long, ragged
feather-dark hem teeth on each coat tail, dirt clod in the feather slot ×300.

## Unique to me

1. **Extra animated parts**
   - *Shovel* (keyed + gait): r2 WALKING-STICK HITCH — the gait's elbow channel drives the arms, so the shovel swings
     forward on ONE drawing per cycle (left-foot contact, +A/2 = 15°) and stands planted-back on the other three
     (`r2/game-sheet.png` frames 4–5 vs the rest); lifted 0.07 m on each talk beat (`TAP`); hoisted near-vertical, held at
     the T grip (`shovel.p` −0.6), blade ABOVE the hat outline at 8/8 facings in vote (`r2/vX1-x4.png`); slammed down
     forward-left → swung out sideways level with the dark clod on it → flung in dig.
   - *Coat tails* (`flapL/R`, gait): r2 channels swapped — each tail rides the ARM-SWING channel (±A = ±30° walk, ±40°
     run): it trails back 30° on its side's step and tucks behind the skirt on the other, a 30° change between drawings
     (r1: 9–15° via the elbow channel). Ragged feather-dark teeth at the hem (reads as a tail, not a fin).
   - *Hat* (keyed): dig hat tip LIFTS the hat 0.09 m tilted back with the free hand raised beside it (no head bow); die:14
     tips it back off the head; in the death hold it lies flat on the ground beside his head.
   - *Dirt clod + dust* (part + FX): `dirt.s` ×300 → a 0.24 m near-black clod on the pale blade in the lever key (reads at
     S/SE/SW/N/NW in `r2/d16a-x4.png`); `poof@blade` dust on the slam and the fling.
2. **My locomotion — a calm scurry (game speed).** LegGait biped at V = 4·H = 5.28 m/s, 4 drawings, cycle 0.267 s =
   1.07 H (`game.readable`, 4/4 drawings, holds 2×23). Contact: the planted foot is shown C/2n ahead of the hip on its
   touchdown drawing and the r2 0.24 m talons poke 3–5 texels out of the hem in front (dark wedge ahead of the hem at dir 1,
   `r2/m-sheet.png` row 1 = talons marked; at dir 2 `r2/slide-game-sheet.png`) — the talon read is visible in most
   drawings, not only the contact one. Bob 0.06 m (≈ 2 texels, low on touchdown), lean 4°, surge off, arms −4/+11°, tails
   ±30°. `game.foot_slide` n/a (LegGait shows one planted drawing per plant: no pairs), 60 Hz in-hold 3.51 texels. Run (8·H):
   same plan, tails ±40°, talons ahead, in-hold 12.09 (`r2/run-sheet.png`). One-word read at 1× (`game-1x.gif`,
   `gamespeed.gif`): the shovel hitch + alternating tail flicks + talons ahead + 2-texel bob = a brisk hobble/scurry; still
   no true multi-frame foot plant (module limit).
3. **Expressions in the new style**: eyes 2×2 texels amber boxes (`face_lit` 95 %), blink = `eye*.s` [0, −0.75, 0] (idle
   f36), HALF lids on the die buckle / hat tip, WIDE on vote + die flinch, SHUT in death. Beak: r2 long beak 37° down
   (≈ 10 texels tall at S, `r2/talk15-x6.png`), lower beak on `jaw` hinged at the back, opens 30° on the talk beats. Emotion at
   1× is mostly head pose: idle crow head-cock (twist 26, tilt 16, held 12 frames), talk turns ±12.
4. **Game-speed readability** (judged on 1× real-time GIFs + sheets): walk — `game-1x.gif`, `gamespeed.gif`, `clip-game.png`;
   talk — beats every 10 frames, `talk.amplitude` 37 %; vote — up at f4, held 1.13 s (`vote.pose_read` 46 %); die — hat tips
   off at die:14, readable "down" at die:18, held 1.73 s with the hat beside him; dig — 6 drawings held 8–12 frames,
   `dig.pose_read` 28 %, clod and slam visible at dir 1 (`clip-dig.png` f16/f24).

## Timing charts (30 Hz grid)

| clip | keys (f: what) |
|---|---|
| idle (loop 72) | 0 up · 30 breath down 1 texel (chest 4, head −4 = constant head pitch) · 36 blink (2) · 38 down · 52 crow head-cock (head twist 26 tilt 16) · 64 up |
| talk (loop 20, `speak` f0) | 0 chin up, beak open 30, left hand out, shovel TAP · 5 nod, closed, shovel down · 10 other way, open, hand forward, TAP · 15 nod, beak 6 |
| vote (hold) | 0 dip 0.06 m, shovel gathered back · 4 shovel hoisted near-vertical at the T grip (upperArmR [130,0,0], handR [45,0,15], `shovel.p` −0.6), body leans into the carrying side (hips 6, spine/chest 12), eyes wide, `vote@blade` · 30 same (held) |
| die (hold, legs fk) | 0 flinch, `hurt`, beak open, eyes wide · 6 knees soften, leans on the shovel, half lids · 14 tips forward stiff (hips 40), eyes shut, HAT TIPS BACK off the head · 18 face-down (hips 84), hat flat on the ground beside his head, `land` · 60 same (held) |
| dig (emote) | 0 lift (shovel slid up 0.16, body rises) · 8 slam: crouch 0.11, blade forward-left into the ground, `poof@blade` · 16 lever: shovel swung out sideways level, dark clod on the blade (`dirt.s` ×300) · 26 fling out right (arm [60,0,70], chest turns), `poof@blade` · 34 hat tip: hat lifted 0.09 m tilted back, free hand raised beside it, half lids · 46 idle |
| walk / run | procedural LegGait at 4·H / 8·H (authored walk clips are ignored by LegGait); tails on the arm channel, arms on the elbow channel |

Dynamics: no chains; personality body f 2.5 ζ 1 r 0, head f 2.2 ζ 1 r 0; `character.quant { yaw 8, chain 4 }`; legIK
'plant' (default). FX: dust `#E8D8B8/#BCA484/#8C7868`, speech at the hat, vote sparkle at the blade. No light.

## Self-critique (Stage 7, r2 after critic-crow 15/24)

Evidence: `shots/char-crow/report.txt` (r2 pack, 63/20/0); `r2/{idle0,vX1,die14,die60,d16a,d34a,d8a,talk15}-x*.png`
(8-facing stills), `r2/pk/turnaround-silhouette.png`, `r2/game-sheet.png`, `r2/slide-game-sheet.png`, `r2/m-sheet.png`,
`r2/run-sheet.png`, `gamespeed.png/.gif`, `scene-*-crop.png`, bake `out/sprites/crow-preview.png`.

| # | criterion | score | evidence (file · facing/frame · number) | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 1 | shovel now stands clear with a background gap at S, SE, N (`turnaround-silhouette.png`), fused at NE/E, hidden at W/NW/SW; brim widest 8/8; `sig.beak` px [48,49,32,2,0,8,32,49] — beak tip past the head only at NW | a back cue at N/NE that does not change the v1 design (a quill read as a witch-hat spike and was removed) |
| 2 | Pixel stability | 1 | idle/talk/vote/die/dig off_grid 0, flicker 0, pan 0/23, deterministic PASS; game flicker 170 / walk 204 (legs: talons now visible ahead of the hem) | legIK holding the talons inside holds |
| 3 | Line quality | 1 | silhouette_line 0/1302, inner 599, edge 0; brim rim 0.06 m: no 1-px arcs in `r2/die60-x4.png` (hat lies flat); die.key_speckle +15, dig +9 | fewer brass bits on the fallen pose |
| 4 | Tonal discipline | 1 | hat hi/mid 0.88–0.98 with the darker `#64462F` mid (undertaker brown in `scene-golden-crop.png`); isolated hat max 7 (shaft stairs), colors/slot coat 7 | — |
| 5 | Ground separation | 2 | sig_ground noon-sun dH 58 / −46 %, golden-sun dH 57 / −44 %, noon-shade −36 %, golden-shade −36 % (all PASS) | — |
| 6 | Proportion, appeal, expression | 1 | face_lit 95 %; long beak ≈ 10 texels at S running to the chest; beak open 2–3 px at SE | a bigger jaw drop at S |
| 7 | Animation timing | 2 | single_frame 0, hold_redraws 0, strobe ≤ 1; vote blade above the hat at 8/8 (`r2/vX1-x4.png`); die:14 shows beak + body at S (`r2/die14-x4.png`); dig:8 blade forward-left visible at S/SE | shaft still crosses the brim edge at S/SE in vote |
| 8 | Weight, contact, game speed | 1 | 4.0 H/s, 0.267 s, 1.07 H/cyc, 4/4 drawings; talons 3–5 texels ahead of the hem (`r2/m-sheet.png`); bob 0.06 m; foot_slide n/a, in-hold 3.51 (run 12.09) | a held 2-drawing plant (module) |
| 9 | Personality, secondary | 2 | shovel hitch on one drawing per cycle, tails ±30° with ragged hems, talk TAP, calm head-cock, hat lifted in the dig tip, hat beside him in death | — |
| 10 | Smears and FX | 1 | no smear needed; dust motes still a regular '+' grid (fx owner), speech bubble size flips (fx owner) | fx module fixes |
| 11 | Facing and turns | 2 | `turnaround.png` 8/8 same figure, facing_area_var 20 %, turn off_grid 0 | — |
| 12 | Technical | 2 | page_errors 0, deterministic PASS, draw calls 2/1, night_freeze 0, night_pan 0, RTX 4090, bake 7 clips × 8 dirs | — |

**Total 17 / 24** (below the 19 bar). Weakest: (1) the shovel still fuses/hides at NE/E/W/NW/SW and the back views keep only
the shovel as the identity cue; (2) contact is a talon read, not a held plant (LegGait shows one planted drawing per
step); (3) vote shaft crosses the brim edge at S/SE although the blade is clear.

## Touch-up (2026-10-16): Clocktower game clips (point, ghost, ghost-spent) + the non-violent die

Rendered on render-host (RTX 4090). Pack: `shots/char-crow/` (`--clips idle,walk,run,talk,vote,point,die,ghost,ghost-spent,dig,turn --raw`:
**92 pass / 23 warn / 0 fail**, page_errors 0). Stills: `shots/char-crow/t1/` (8-facing keys `g8-*`, stacks `st-*`, meadow
`scene-ghost-{noon,golden,night}.png`, `scene-spent-noon.png` (this one is actually the night render), bake crops `bake-ghost.png`, `bake-point.png`).
Bake: `out/sprites/crow.{png,json}` + `crow-preview.png`: 10 clips × 8 dirs, render cell 182 → trimmed 88×84,
point 6 / ghost 4 / ghost-spent 4 drawings.

| clip | keys (30 Hz) | read |
|---|---|---|
| **point** (one-shot → idle) | 0 gather: free left hand drawn in, chest turned away · 4 POINT: left upper arm [115, 0, 35] (forward, about 25° above level, 35° out), forearm straight, hand stretched into a feather "finger" (`handL.s` y +1.0), chest −14 twist so the left shoulder leads, head +12 (beak on the target), half lids · 22 second emphasis: the hand lifts 10° (1–2 texels), beak parted · 28 point · 42 lowering · 48 idle | `point.pose_read` 22 %, key_speckle +4, off_grid 0. The hand clears the silhouette at S, SE, W, NW, SW. **Weak at E/NE/N** (the arm sits behind the beak/body: back facings) |
| **ghost** (loop 64, step, dynamics hold) | 0/16/32/48: hovers 0.16 / 0.13 / 0.10 / 0.13 m (measured: head joint 5.4 px above idle at f0), arms drift out, coat tails trail, look aside at 48; `ghostK.s` 1 and `halo.s` ×1000 on every key | pale blue re-tone; values kept per tone (hat/beak/arms still separate); coat fades to mist under 0.40 / 0.28 m bind height, checker-dissolves under 0.22 m and is gone under 0.15 m (talons, hem, blade tip); gold halo floats about 0.2 m over the crown (flat emissive gold in sun, shade and night); faint night self-glow. ghost.amplitude 29 %, off_grid/flicker 0 |
| **ghost-spent** | same poses, `ghostK.s` 2, no halo, head bowed 4° | dimmer grey-blue ramp `#3E4662→#9EA8C0`, night glow 0.12 instead of 0.3. amplitude 21 % |
| **die** (changed) | f0 was a flinch + `hurt` flash → now a resigned sigh (chin up, beak parted 14°, half lids, free hand to the chest), no `hurt` event; f6–f60 unchanged (leans on the shovel → tips over stiff → face-down, hat beside him, `land`) | die.pose_read 130 %, final hold 2.2 s, no hurt flash in `clip-die-60hz.png` |

**(Superseded by the ghost port, last section — kept as history.) How the ghost look worked (spec-only, no shared code):** `spec.material` passes `vertexHead/vertex/fragmentHead/tones`
to `characterMaterial`. The vertex shader reads the ghost level from the bone texture: det(mat3(getBoneMatrix(ghostK))) /
det(…hips) = (1 + s)³ → 1 / 8 / 27 → `vCrowGhost` 0 / 1 / 2. This does not depend on rotation, so it works for any pose or
facing, and `.s` zero-fill means every other clip is alive. Bone indices come from a copy of rig.js's topological
order (`boneOrder`). The tones hook maps hi/mid/sh separately by perceptual lightness onto the ghost ramp `#3E5C9E→#EEF8FF`
(t = (√luma − 0.16)·1.6); the halo is found by its bind position (`vCharBind`, within 0.01 m of the halo rest point).
Shadows are untouched, so the ground shadow shows the hover gap.

**(Superseded: `spec.ghost` floats the legs, no +0.1.) Hover vs the idle leg IK:** loop clips keep the legs IK-planted, and `_solveLegs` dips the hips by up to 0.1 m when a planted
foot is out of reach, so `pos` y = HOVER (0.1) + hover. The legs are invisible (dissolved), so the stretched IK never shows.

**Walk re-check after the module fixes (M1–M3):** `clip-game.png`, `game-onion.png` show that he walks at stand height, the hem never
sinks under the grass and the shovel hitch and the 2-texel bob still read at game speed (5.28 m/s, 4 drawings). The talons now
show only 1–2 texels under the hem on the contact drawings (r2: 3–5), so the contact read is the shovel hitch, not the feet. walk/game
off_grid 1, flicker 10 (WARN, legs). The `locomotion.bones` channel-routing hack (tails on the arm channel) is
kept. It still works; moving it to an authored `clips.walk` (M1) is a possible next step.

**Combat check:** no weapon swings or strikes. The `dig` emote is digging (the blade goes into the ground beside him, the clod is flung
out to his side, away from anyone), so it stays.

## Ghost port (2026-10-17) — shared `spec.ghost` (supersedes the touch-up ghost recipe above)

- **Why:** the touch-up ghost (`ghostK` bone + micro `halo` ring + `material.tones` shader) only lived inside the ghost
  clips, so a dead player walking as Mortimer looked alive until he stopped. `spec.ghost` + `ch.ghost = 1` now shade the
  walk, talk and emotes too.
- **Spec:** `ghost: { hover: 0.14, keepHue: 0.25, lo: 0.04, slope: 1.7, spent: ['#3A4260', '#B0BACE'], halo: { bone: 'hat',
  lift: 0.22 } }`. keepHue 0.25 (dark character): the hat stays a mauve-brown over a periwinkle coat, the beak the
  lightest mass; lo 0.04 / slope 1.7 lift the near-black feathers + charcoal coat (defaults = a dim slate figure,
  `shots/ghost-port/crow/z-g8.png` vs `z-g8-vA.png`); spent light end #B0BACE. Halo on the hat bone (follows the tipped
  hat), lift 0.22: at 0.12 the crown poked through the ring (`pack-r1-clip-ghost.png`) — now islands 2 → 2.
  Removed: `halo` + `ghostK` bones, the micro ring part, `GHOST`, `lin3`, `boneOrder`, `restWorld`, `ghostMaterial()`,
  `HALO_*`, `HOVER`, `GHOSTK`, `HALO` (THREE stays: shovel / beak geometry).
- **Clips (pose only):** `ghostClip(lv)` keys 0/16/32/48: `pos` y 0.056 / 0.028 / 0 / 0.028 over the module hover 0.14 m
  (spent −0.028), chest/arms/coat tails as before, look aside at 48, spent head +4.
- **Checks (render-host):** pack `shots/ghost-port/crow/pack/` 115 pass / 17 warn / 0 fail (before 114 / 18: vote.key_speckle
  WARN → PASS with identical raw frames); ghost amplitude 26 %, key_delta 39 %, off_grid 0, flicker 0, islands 2 → 2; spent
  amplitude 20 %, key_delta 34 %. Living renders: 0 / 2350 raw frames differ vs the pre-port pack (the clip-talk/vote
  strip composites changed size only). Demo walking ghost (`?char=crow`, key 5, D held): level 1 while moving, pale at
  noon and night (`shots/ghost-port/crow/walking-ghost-{noon,night}.png`).
