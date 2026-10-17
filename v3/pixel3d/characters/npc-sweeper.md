# npc-sweeper — Sweeper (NPC) — design sheet

Identity source (read only): `pipgws/packages/assets/scripts/cast/npc-sweeper.ts` ("a plain, muted townsperson with short
grey hair, a slate tunic and a straw broom. Deliberately boring so it never competes with the players' characters") +
`refs/cast/npc-sweeper.png`. Spec: `characters/npc-sweeper.js`. Renders: `shots/char-npc-sweeper/`.

## Stage 0 — brief

**Concept:** the town's street sweeper — a small, quiet worker with a grey bob haircut who always has the straw broom in
the LEFT hand and scurries along pushing it ahead. **Adjectives:** plain, diligent, unhurried-but-busy (CAST_PORTING §10
"boring on purpose (NPC)": default dynamics, quieter than any player, but every clip must still read at 1×).

**Identity (CAST_PORTING §3):**
1. Silhouette blob at 1×: a round grey bob cap (wider than the shoulders) + the broom standing beside the body on the
   character's LEFT (screen-right at S/SE, screen-left at N/NW) with a flared straw fan on the ground; at E the broom is
   pushed ahead diagonally (v1 E row).
2. Palette anchors: mauve-grey hair `#6C6870`, slate tunic `#5A5E66`, straw `#9A8765` + wood `#6A5640`, tan skin `#A58060`.
3. Prop: straw broom, LEFT hand (v1 `under()` at S/SE draws it at x 18 = character's left; at N at x 6 = also left).
4. Face: two dark 2×2 dot eyes under a straight fringe, no visible mouth at rest (v1 drawHuman 'short' hair).
5. v1 motion: `sweep = p.step` — the broom foot shifts with every step (it sweeps as he walks), 1-px bob.

**Body plan:** small townsperson on `chibi()` (CAST_PORTING: NPCs → `bodyPlan: 'biped'`), H = castHeight(27) = **1.08 m**
(≈ 39 texels at vh 10; `heightPx` [34, 46]), 2.7 heads (head 0.40 m incl. hair), legs 0.8 (leg ≈ 0.29 H), flat face
(snout 0), no ears/tail.

**Game speed:** V = 3.95 · 1.08 = **4.27 m/s**; N = 4 drawings × 2 grid frames → cycle 0.267–0.3 s, C ≈ 1.2–1.3 m
(1.1–1.2 H), one step ≈ 0.64 m. Leg 0.315 m, stance span ≤ 0.9·hip(0.37) = 0.33 m → duty ≤ 0.33·…/C ≈ 0.25 → a **scurry**
(LegGait 'biped', `plant: 'hold'`, duty 0.2, swingFloor 'gait').

**Silhouette vs cast:** closest blobs = mole (27 px, grey, prop upright) and npc-porter/vendor (other NPCs, built in
parallel). Separator: the broom's straw FAN on the ground beside the feet at S/SE/SW/N and the diagonal stick at E/W;
the bob cap is rounder/wider than mole's goggled head.

## Unique to me

(r8, rewritten from the current code and the r8 renders; each claim cites the still that shows it.)

1. **Extra animated parts.** The BROOM is the only accessory and carries everything: bone `broom` IN the left hand
   (`pos [0, -0.035, 0]`, KEYED per clip, no spring — a stiff wooden prop). r8 geometry: the grip is one third down the
   stick (0.32 m above the hand, 0.52 m to the fan foot) and the bone pivots ON the stick, so every rotation keeps the
   stick in the fist. Idle: leaning out-forward, fan on the ground beside his left foot (`turnaround.png`, 7/8 facings
   break the outline; NE only the stick top, 2–3 px). Walk: OUT (fan swept to his left) ↔ ACROSS (fan pushed ahead of his
   feet, crossing the body line at S/SW) every drawing pair (`r8/walkC.png` rows k0/k2, `clip-game.png`). Talk: stays
   carried, the right hand talks. Vote: raised overhead in the fist, fan above the crown at 8/8 (`r8/vt.png` row 2,
   `clip-vote.png` f12), fan twisted 40° so it is not edge-on at SE/E. Point: tipped forward along the pointing line
   (`r8/ptpf.png`, SE/E/W). Die: lies flat on the grass alongside his legs (`r8/die6.png` row 1, low-pitch check
   `r8/die5.png`). Emote: four sweep strokes out ↔ across with dust at the fan (`r8/sweep1.png`, `clip-sweep.png`).
   Hair: a rigid 8-sided bob cap (no chain; v1 has none).
2. **My locomotion — a busy scurry pushing the broom.** LegGait 'biped', `plant: 'hold'`, `swingFloor: 'gait'`, V 4.27 m/s,
   4 drawings, duty 0.2, reach 0.6, bob 0.04 m. The rhythm = 2.5 px bob + the broom alternating out / ahead-of-the-feet +
   the right arm swing. Feet visible every drawing (`game.feet_visible` SE min 5 px). Slide: `foot_slide` is n/a for this
   gait (no foot planted on two consecutive drawings); judged on `clip-game.png` and the 1× GIF strip
   (`r8/strip-game-1x.png`).
3. **Expressions in the new style.** Eyes = dark boxes ON the front/side bevel of the flat face (x ±0.1, 0.045 deep): 2×2
   at S, and the near eye shows on the profile edge at E/W (`r8/faces.png` row 1). Blink `eye.s` y −0.8 (2 frames); WIDE
   in vote; HALF lids on talk/sweep beats; SHUT (die) = a wider flat 3×1 lid dash (`eye.s` [0.6, −0.7]), not a dot
   (`r8/die-f50-zW.png`). Mouth = a dark plate pushed out with `mouth.p` on the talk open keys and the brow wipe. No brows.
4. **Game-speed readability.** walk: bob + broom out/ahead every drawing (1× strip). talk: right-hand beats every 8 f.
   vote: up in 4 f (the arm springs up over 8 f), fan over the crown. die: down by f18, held flat with the broom beside
   him (`r8/strip-clip-die-1x.png`). sweep: 6-frame strokes; the sweat drop fires on the wipe key (f30) and shows at f38
   (`clip-sweep.png`).

## Proportions (code: `chibi({ height 1.08, heads 2.7, legs 0.8, arms 0.95, shoulders 0.42, snout 0 })`)

| part | m | texels at vh 10 |
|---|---|---|
| height (hair top) | 1.08 | 40 at S (37 at E/NE) |
| head incl. hair | 0.40 (chin 0.68) | ≈ 15 |
| leg (hip joint → ankle) | 0.315 (0.29 H) | ≈ 11 |
| broom (stick top → fan foot) | 0.84; grip 0.32 below the top; fan 0.25 × 0.15 | fan ≈ 9 × 5 |
| eyes | 0.055 × 0.068 × 0.045 boxes at x ±0.1 | 2 × 2 (3 × 1 shut) |

## Palette (`[hi, mid, sh]`)

hair `#888AA2 #66667C #46425C` (r8: cooler than v1 `#6C6870` so the golden key does not tan it as much; still drifts,
see below) · tunic `#7A808A #5A5E66 #424656` · skin `#C89E78 #A58060 #7A5A4E` · dark `#4C4246 #3E3436 #3A3040` · wood
`#8C7456 #6A5640 #4E4038` · accent straw `#C8B488 #9A8765 #6E6050`. Signature = `[{part:'hair'}, {part:'bristles'}]`.

## Module opt-ins used / not used

`locomotion.plant: 'hold'` + `swingFloor: 'gait'` (yes); `spec.ghost { hover 0.14 }` + plain `ghost`/`ghost-spent` loops
(yes, game clips point + ghost + ghost-spent present); `material.merge { neck: 'head' }` (yes). Not used: `spec.lights`
(no lantern), `whiteKeep`/`creamKeep` (no white/cream mass; their luma gates do not catch a mid grey — see module_issues),
`innerLine 'tone'` (clothed; the lines are wanted).

## Timing charts (30 Hz grid; all `interp: 'step'`)

| clip | keys (f: what) | reads at 1× |
|---|---|---|
| idle (loop 72) | 0 rest carry (arm 12/28 out, broom leaning out, fan on the ground) · 30 breath down · 36 blink (2 f) · 38 · 56 glance right · 66 | breathing + blink |
| walk (LegGait, 4 drawings) | k0 OUT (fan to his left, behind the hand) + chest twist · k1 near-out · k2 ACROSS (fan ahead of the feet) · k3 near-across | push-sweep scurry, bob 2.5 px |
| run (2 V) | same at k ±0.7 / ±0.1, spine 6 | — |
| talk (loop 32) | 0 right hand up-out, mouth open · 8 down beat · 16 hand flung out, mouth open · 24 down beat, half lids | beat every 8 f |
| vote (31, HELD) | 0 dip + blink, broom carried (4) · 4 arm straight up (`.l` 0.9 / 0.8) with the broom in the fist, fan over the crown, twisted 40°, eyes wide | fan over the crown 8/8 |
| point (40) | 0 gather, broom carried (4) · 4 right arm forward-out (76/40, `.l` 0.6/0.45), chest twist 14, broom tipped forward (40/−24), held 26 f · 30 · 36 idle | arm out at S/SW/W, arm + broom forward at SE/E |
| die (61, HELD, legs fk) | 0 sway (6) · 6 knees give (6) · 12 sits back (6) · 18 lies on his back, body yawed 40° (`hips` out −40) so it lies across the screen at S/SE, head back, broom flat alongside the legs, lid dashes | lying at 6/8 (SW/NE foreshortened) |
| sweep (emote, 50) | 0 wind-up (6) · 6 OUT + dust · 12 ACROSS the feet + dust · 18 out + dust · 24 across + dust · 30 straightens, brow wipe + sweat drop (16) · 46 idle | 4 strokes of 6 f |
| ghost / ghost-spent (loop 64) | 4 keys every 16 f, carried broom; spent: bowed head, half lids | pale + halo / dimmer |

## Game-speed numbers (r8 pack, render-host RTX 4090)

`game.readable` PASS 3.95 H/s, cycle 0.3 s, 1.19 H per cycle, 4/4 drawings. `game.head_bob` 2.5 px, limp 0.1.
`game.feet_visible` PASS (SE min 5 px). `foot_slide` n/a (plant 'hold' scurry). One word at 1×: **scurry**, with the
broom flicking out and ahead.

## Self-critique (r8; pack 112 pass / 23 warn / 0 fail, page_errors 0; evidence in `shots/char-npc-sweeper/` + `r8/`)

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 1 | `turnaround-silhouette.png`: broom breaks the outline at S SE E N NW W SW; NE only the stick top (`sig_outside.bristles` 13 px at NE) | a fan that clears the body at NE |
| 2 | Pixel stability | 2 | idle off_grid 0, deterministic 0 px, pan 0, night_freeze/night_pan 0; walk/game off_grid 1 legs-only | — |
| 3 | Line quality | 2 | `silhouette_line` 0/1057; stick 2 texels | — |
| 4 | Tonal discipline | 1 | `isolated_px` hair max 3 (was 5; 8-sided hull), speckle 25, colors/slot WARN | hair ≤ 2 |
| 5 | Ground separation | 1 | `sig_ground` noon/golden sun PASS, shade copies −27 / −26 % PASS; golden sun hair still warms to #856D59 (`scene-golden-crop.png`) | a hue-keep for mid greys (module) |
| 6 | Proportion, expression | 1 | profile eye at E/W (`r8/faces.png`), `face_visible` 43 %, lid dashes in die | a bigger face read at E/W |
| 7 | Animation timing | 2 | vote and die finals read at 8/8 in 8-facing stills (`r8/vt.png`, `r8/die6.png`); hold_redraws 0 | — |
| 8 | Weight, contact, game speed | 1 | `game.readable` PASS; foot_slide n/a | measured contact |
| 9 | Personality, secondary | 2 | broom out/ahead every walk drawing, 4 sweep strokes across the feet, broom gripped in every key | — |
| 10 | Smears and FX | 2 | dust at the fan, sweat drop on the wipe (f38), vote sparkle at the fan | — |
| 11 | Facing and turns | 2 | 8/8 readable, stepped turn | — |
| 12 | Technical | 2 | page_errors 0, draw calls 2/1, deterministic, render-host | — |
| | **total** | **19** | | |

Weakest: NE silhouette (broom hidden behind the body), golden-hour hair warmth (shared grade), die SW/NE facings
foreshortened (a lying body is end-on at two facings whatever its yaw).

Bake: `shots/char-npc-sweeper/bake8/` (`--preset cast --cell 128`: trimmed cell 72×82, anchor [36, 64]; walk 4 frames =
`gameSpeed.drawings`). The automatic cell growth still wraps the figure (see module_issues); 4 border warnings remain
(walk/run SW fan foot, die W/SW broom) at cell 128.
