# Magistrate Billings — design sheet (char-goat)

Cast member `goat` (villager): "Presides over every trial. Eats the evidence." Identity source (read only):
`pipgws/packages/assets/scripts/cast/goat.ts`, `refs/cast/goat.png`. Code: `characters/goat.js`. Pack:
`shots/char-goat/`. All renders on render-host (RTX 4090).

## Stage 0 — brief

**Concept**: a small, very formal goat judge — round white head, big tan horns curling up-back-down, floppy ears, a
little beard, a corner of paper always in his mouth; gold magistrate robe with a dark-brown front panel, gold trim and a
red collar; a tall wooden staff with a brass knob in the RIGHT hand. **Adjectives**: proud, formal, greedy (the
"proud, formal" family of CAST_PORTING §10 + a deadpan glutton streak for the emote).

**Identity (5 items, ref facings)**
1. Blob at 1×: wide white head with the two horn arches above it (a "U" crown at S/N, a hook at E/W) + the staff
   breaking upward beside the head (S/SE: on the screen-left side). Robe = a gold bell below.
2. Palette anchors: white wool `#ECE4D6`, gold robe `#B8892E`/`#C69E4E`, tan horns `#C49A62`, red collar `#A02C34`,
   dark-brown front panel `#5A3A26`.
3. Prop: tall staff with brass knob, RIGHT hand (v2 S/SE frames: screen-left at S).
4. Face: 2×2 dark dot eyes with a stern 1-px brow, long pale muzzle with a pink nose, the paper corner in the mouth,
   beard tuft under the chin.
5. v2 motion: 1-px bob, boots shuffling under the hem, ears flop (edge-on they hang back), staff barely moves.

**Body plan**: robed upright chibi (`chibi()` → `bodyPlan 'uprightAnimal'`, `locomotion.plan 'biped'`). The ref draws
him upright with boots under the hem; not a quadruped (CAST_PORTING §2, §6).

**Proportions** (vh 10 = 36 px/m): H = castHeight(36) = 1.44 m (horn tops) ≈ 52 texels; skeleton 1.32 m, heads 2.4,
legs 0.75 (leg 0.36 m = 0.25 H, hip 0.46 m). Head ball Ø 0.52 m (19 texels), horns out to ±0.36 m, robe hem r 0.27,
staff 1.4 m + knob Ø 0.12.

**Game-speed numbers**: V = 4·H = 5.76 m/s, N = 4 drawings × 2 grid frames → cycle 0.27–0.30 s, C ≈ 1.2 H = 1.73 m.
Stance span ≤ 2·reach·leg = 0.43 m → duty ≤ 0.25 → a skip with flight ("prance-scurry"); see Unique 2.

**Palette** (5 slots + accent):

| slot | hi / mid / sh | use |
|---|---|---|
| wool | `#F8F2E6` `#E6DCCC` `#A898A6` | head, muzzle, beard, ears, hands (signature 2: lightest mass) |
| horn | `#EECB8E` `#C69A5E` `#8A6656` | horns (signature 1) |
| robe | `#E4B850` `#B8892E` `#7A5638` | robe, sleeves |
| panel | `#7E5642` `#573826` `#46303A` | front panel, boots/hooves, staff wood, eyes, brows, mouth |
| collar | `#D8505A` `#A42C38` `#6A2442` | collar, cuffs, nose |
| brass (accent) | `#FFF0B8` `#E8C460` `#9C7444` | staff knob/ring, trims, hem band |
| parchment (story prop, r2) | `#F2F6EE` `#CCD6CC` `#7C8AA0` | evidence sheet + the paper corner in the mouth (COOL off-white, slate shadow: its own value/hue against the warm horns/robe/wool; a deliberate 7th slot, see Self-critique) |

## Unique to me

(r2, after critic-goat 15/24; every answer re-checked against the r2 pack `shots/char-goat/` and stills in
`shots/char-goat/r2/`.)

1. **Extra animated parts** (as built — the sheet = the code)
   - *Ears* (`earL0/earR0`, sideways bones, out + = up), r2 bigger and flatter (0.27 m, dir [1, −0.38, −0.12]) like the
     v1 sprite: KEYED per action clip (up 30° vote, 15° talk, 25° → −30° die, −25° flop on the slam, 15° gulp) AND
     driven by the gait in the walk/run: the LegGait spine/chest channels are routed to the ears, so their yaw term
     (±twist·0.6 / ·0.9 = ±13° / ±20°, twist 22) flops both ears up/down once per stride (`r2/ws-row.png` frames 3–4 vs
     1–2). This is the walk's secondary (critic: "ears are static although item 5 promises ear flop").
   - *Jaw* (hinge at the back of the muzzle): two 22° chews in idle, 28–30° on the talk open keys, 36° → 0 chomps in the
     emote, slack 24° dead. *Beard* rides the jaw.
   - *Paper corner* (`paper`, child of jaw): r2 a 0.10 × 0.075 × 0.075 m PARCHMENT wad (≥ 2×2 texels, not a 1-px brass
     whisker).
   - *Evidence sheet* (`sheet`, child of handL): r2 a V-folded parchment document (two 0.17 × 0.34 m leaves opened 100°
     about a vertical spine) with a 2×2 red wax seal on the spine foot and two dark ink lines per leaf, authored at 5 %
     inside the fist and scaled ×20 by the emote. Because the leaves face two ways, some face shows from every side.
     READ arm (up beside the head) and BITE arm (beside the mouth) were picked on 8-facing stills: sheet visible 8/8 in
     the read, hoist and bite keys, 7/8 on the slam (E weak) (`r2/sheet-verdict.png` rows 1–4), 6/8 in the chomps
     (80 % / 50 %: the head dips over it at N/NE).
   - *Staff*: tap on the talk open keys, thrust up in vote, r2 a tilted WIND-UP (raised and tipped 40–60° out over the
     shoulder, body leaning back) → SLAM plumb with a 2-texel squash (`r2/sheet-verdict.png` rows 2–3: the silhouette
     changes at all 8 facings; `verdict.pose_read` 40 % → 56 %).
2. **My locomotion — formal scurry (skip), staff PLUMB**: LegGait biped with flight, V = 4·H = 5.76 m/s, 4 drawings,
   cycle 0.278 s = 1.11 H (`game.readable` PASS), bob 0.05 m. r2 workaround for the staff tipping 25–30° under the run
   lean and ~30° on the standing-start lunge: `locomotion.bones` routes hips / neck / head to part-less sinks (gHips,
   gNeck, gHead) and spine / chest to the ears, `lean: [0, 0]`, the staff arm's channel to `staffSway`. Result: no body
   lean or hip yaw anywhere → the staff stays plumb on the start, in the walk and in the run (`clip-game.png`,
   `clip-run.png`, `game-onion.png`); the free LEFT arm swings 10–12°. Robed contact: the hem now rises 0.03 m at the
   front and drops 0.10 m at the back (warped skirt/band/sole), hooves are 0.17 m long and the boot cuff is short, so
   the forward boot flicks out of the hem on the contact drawings (3×2 to 5×2 texels at dir 1, `r2/game1x-zoom.png`)
   and the trailing boot is hidden in the walk. `game.foot_slide` stays n/a (skip gait, no foot planted on two
   drawings). At run speed the trailing boot still kicks out behind the back-right hem (`clip-run.png`).
3. **Expressions**: eyes 2×2 texels, blink at idle f36, WIDE on vote / flinch / bite, HALF squint while reading and
   chewing, SHUT dead and on the gulp; stern 1-texel brows. face_lit 88 % (S .89 SE .88 SW .87). In the die hold the
   body is rolled 30° and the head pitched to the chest so the face looks up at the camera (`r2/zz` close-up of the
   pick, `r2/sheet-other.png` row 5).
4. **Game-speed readability** (judged on 1× real-time strips from the pack's raw frames, `r2/*1x*`): walk 4/4
   drawings per 0.278 s cycle, staff plumb, ears flop, front boot flicks; talk beat every 6 frames (`talk.amplitude`
   54 %); vote up by f3, held 1.1 s; die held 1.07 s; verdict 9 drawings: sheet up → wind-up → slam + dust → bite →
   chomps → gulp + heart all read at 1× (`r2/verdict1x-a-x3.png`, `-b-x3.png`).

## Timing charts (30 Hz grid)

| clip | keys (f: what) |
|---|---|
| idle (loop 72) | 0 up · 30 breath down 1 texel · 36 blink (2) · 38 · 48 chew 22° · 52 · 56 chew · 60 · 66 up |
| talk (loop 24, `speak` f0) | 0 chin up, jaw 30, left hand up, staff tap, ears up · 6 nod, jaw shut · 12 chin up the other way, jaw 28 · 18 nod |
| vote (hold) | 0 dip, staff gathered · 3 staff thrust up + left hand up, eyes wide, ears up, `vote@knob` · 30 held |
| die (hold, legs fk; touch-up: gentle, no hurt flash) | 0 weary sigh: eyes half, ears droop, hand to chest, staff sags (9) · 9 knees fold, eyes shut (6) · 15 sinks back (6) · 21 on his side rolled 30°, face up, boots hidden in the closed hem (`die`, `land`) · 27 settle (no bounce) · 60 held |
| verdict (emote; touch-up: no swing) | 0 sheet up beside the head, squint (8) · 8 "Order!": staff lifted STRAIGHT UP, plumb, chin up, eyes wide (6) · 14 gavel tap plumb on the floor, 2-texel squash, ears flop, `poof@staffFoot` only (8) · 22 sheet beside the mouth, jaw 36 (6) · 28 chomp, sheet 80 % (6) · 34 open (4) · 38 chomp, sheet 50 % (6) · 44 gulp: sheet gone, chin up, eyes shut, `emote:heart@crown` (14) · 58 idle |
| point (touch-up) | 0 draw-back: chin up, hand at the collar, eyes wide (5) · 5 LEFT arm straight out ahead at shoulder height, lean in, jaw open "You!" (12) · 17 firmer jab + staff tap, still plumb (4) · 21 held (13) · 34 arm down, smug harrumph (12) · 46 idle |
| ghost (loop 72, touch-up) | 0 hover y 0.12, sway +3° · 18 mid · 36 low 0.09, sway −3° · 54 mid; eyes half, ears −12°, hand on chest, shins scaled away; halo shown; pale-blue shader + lower-robe dither |
| ghost-spent (loop 72) | same, lower (0.08/0.05), head bowed 6°, eyes −0.6, ears −25°, no halo, desaturated + dimmer (×0.62) |
| walk / run | procedural LegGait biped at 4·H / 8·H; ears flop per stride via the routed spine/chest channels |

Dynamics: `chains: []`; personality body f 4 ζ 1, head f 3 ζ 0.8 (head channel sunk: no head lag); `character.quant
{yaw 8, chain 4}`; legIK 'plant'.

## Self-critique (Stage 7, r2)

Evidence (all rendered on render-host RTX 4090): `shots/char-goat/report.txt` (full `--preset cast`: 63 pass / 22 warn /
0 fail, page_errors 0, deterministic PASS), turnaround*, clip-*, game-onion, scene crops; r2 stills
`shots/char-goat/r2/sheet-verdict.png` (verdict f4/10/16/24/30/36/40/50 at 8 facings), `sheet-other.png` (die
f4/10/14/20/68, vote f11, talk f0/f8), `g8-verdict-f16fx-x3.png` (slam with FX), 1× strips `game1x-strip-x3.png`,
`game1x-zoom.png`, `verdict1x-{a,b}-x3.png`, `die1x-strip-x2.png`, `talk1x-strip-x3.png`, walk strips `wk-row.png`
(E) / `ws-row.png` (S); A/B `r2/ab-h*` (horn segments), `r2/ab-*` (turn/step options); bake `out/sprites/goat*`.

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 1 | horn curl now opens at E/W, bigger sideways ears (turnaround.png, turnaround-silhouette.png); still a robe+staff column at E/W at 25 % | a wider head mass at E/W |
| 2 | Pixel stability | 1 | idle/pan/deterministic/night 0; game flicker 342 / walk 462 (legs only, legIK plant re-pins), run off_grid 1 | boots fully hidden or a module recovery-step fix |
| 3 | Line quality | 1 | silhouette_line 0/1399, inner 639; key_speckle die +37, verdict +26, vote +19 (want ≤ 6); paper corner now a 2×2 wad | merge cuffs/brows in held keys |
| 4 | Tonal discipline | 2 | horn isolated max 16 → 7 (4 segments), parchment slot reads as its own cool value against horn/robe/wool; colours/slot horn 10 | — |
| 5 | Ground separation | 2 | sig_ground noon-sun dH 135, noon-shade +53 %, golden-sun dH 49, golden-shade +54 % | — |
| 6 | Proportion, appeal, expression | 1 | face_lit 88 %; die hold shows the face; mouth opening still 1–2 texels | bigger mouth |
| 7 | Animation timing | 2 | single_frame 0, hold_redraws 0, strobe ≤ 1; every verdict key read on its 8-facing still (sheet 8/8 read/hoist/bite, 7/8 slam, 6/8 chomps), slam key now a distinct silhouette (pose_read 56 %) | chomp keys 8/8 |
| 8 | Weight, contact, game speed | 1 | 4.0 H/s, 0.278 s, 1.11 H, 4/4; staff plumb on start/walk/run; front boot flick on contact, trailing boot hidden at walk; foot_slide n/a; run trailing boot visible | measurable plants (needs a gait with stance ≥ 1 drawing) |
| 9 | Personality, secondary | 2 | ears flop in the walk (routed channels), "eats the evidence" reads at 1× (sheet up, wind-up, slam, bite, gulp + heart) | per-drawing keyed ears (module) |
| 10 | Smears and FX | 2 | slam dust at 8 facings (g8-verdict-f16fx), heart, vote sparkle, speech bubbles | — |
| 11 | Facing and turns | 1 | turn steps 2 frames; post-turn tail = ≤ 43 px boot recovery steps (module), turn.foot_slide 4.07 (same 3.4–4.3 on every character) | module fix for robed recovery steps |
| 12 | Technical | 2 | page_errors 0, deterministic PASS, draw calls color 2 / normal 1, night_freeze 0, RTX 4090 | — |

**Total 18 / 24** (bar 19). Weakest: (1) action-key speckle (+19…+37 isolated px); (2) contact is still not
measurable on the skip gait and the run's trailing boot shows; (3) E/W silhouette still close to keeper at 25 %.
Palette note: parchment is a 7th slot (5 + brass + parchment) against the "≤ 5 + 1 accent" guideline — the critic asked
for the story prop to have its own slot; it is used only by the sheet and the paper corner.


## Touch-up (2026-10-16, Clocktower-only clips) — render-host RTX 4090

Changes (everything else kept; living renders A/B **0 px** vs the pre-touch-up pack `shots/char-goat/t0/`: turnaround,
turnaround-plain, idle, walk, run, talk, vote, game, turn, scene-noon, scene-night — `shots/char-goat/abdiff.py`):
- **New `point`** (the shared emote): free LEFT arm straight out ahead (upper fwd 84 / out 32, forearm −24 — out 18 hid
  the hand in the robe at S/SE, `t2/` vs `t3/g8-point-f5-x4.png`), lean in, jaw open, a second jab with a plumb staff tap,
  held, then a harrumph back to idle. Arm reads at SE / E / NW / W / SW, weakest at S and N (end-on). pose_read 42 % ×13.
- **New `ghost` / `ghost-spent`** (mushroom's recipe): `halo` bone appended LAST (head-local [0, .30, −.03], inside the
  skull) carrying a brass ring authored at HALO_K 0.001; the ghost clip scales it 1/HALO_K → the ring floats at head y
  0.75 over the horns. Its world scale is the ghost signal for `GHOST_GLSL` (material vertex/fragment/tones hooks):
  every tone remapped by luminance onto a pale blue ramp (#4E6C9C → #DCF4FC), lower robe + staff foot dissolve with a 2×2
  ordered dither from bind y 0.58 (solid) to 0.18 (gone); spent = no halo, 45 % desaturated, ×0.62 darker, 0.52/0.14.
  Hover 3–4 texels with a 1-texel step bob every 18 frames + ±3° sway; shins scaled away. charcheck: off_grid 0,
  flicker 0, strobe 1, amplitude 32 % (both). Stills `t2/g8-ghost-f0-x4.png`, `t2/g8-ghost-spent-f0-x4.png`.
- **Combat removed**: die no longer starts with a `hurt` flash + flinch (now a weary sigh → fold → sink → lie, no bounce);
  verdict's tilted 40–60° staff WIND-UP + `hit` spark became a plumb "Order!" lift + gavel tap with dust only.
- Module fixes re-checked: walk/game at dir 1 (`clip-game.png`, `game-onion.png`) and dir 2 (`t4-dir2/clip-walk.png`): body
  at stand height, the front boot shows under the hem on contact drawings, hem never under the ground, staff plumb;
  game 4.0 H/s, 4 drawings. The channel-routing hack (spine/chest → ears) still works and was kept.
- Pack: `tools/charpack.sh goat --preset cast --clips idle,walk,run,talk,vote,die,point,ghost,ghost-spent,verdict,turn --raw`
  → 92 pass / 24 warn / 0 fail, page_errors 0. Bake: `out/sprites/goat.{png,json}` 10 clips × 8 dirs (cell 86×90).
- Known weak spots: point/die/verdict key_speckle +22/+37/+26 (unchanged family issue); the die sigh key differs little
  from idle at SE; the ghost's ground shadow is still the full figure (the dither discards in the shadow pass too, but
  the hover is small, so the shadow reads as standing).
