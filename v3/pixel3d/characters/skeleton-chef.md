# Bones (cast `skeleton-chef`) — design sheet (v3 + Clocktower touch-up)

"The baker. Nobody asks how long he has been dead." Spec: `characters/skeleton-chef.js`. Pack + evidence:
`shots/char-skeleton-chef/` (pack = v3; `v3/` = v3 tuning stills and variants, `self3/` = v3 1x sheets; `self/` = v2
evidence, now stale). Sprite bake: `shots/char-skeleton-chef/bake/` (copied to `out/sprites/`). Identity source (read
only): `pipgws/packages/assets/scripts/cast/skeleton-chef.ts`, `refs/cast/skeleton-chef.png`. Rendered on render-host
(RTX 4090; the GPU line is in every `report.txt`).

## Close-out (2026-10-17): golden-hour colour drift
Problem (Run 05 close, `docs/CAST_GALLERY.md`): at golden hour the toque went apricot (#F8C987) and the skull tan
(#D1A262), and the old-recipe ghost went tan/peach. Fix: **`material.hueKeep: { bone: 1, cloth: 1 }`** in the spec. It
re-hues the bone and cloth pixels to their authored band tone at the graded luma, in every band, under the warm grade
only. A/B on render-host (RTX 4090) with the variant spec `shots/char-skeleton-chef/chef_wk.js`; evidence in `wk/`:

| variant | golden sun toque / skull | golden shade toque | verdict |
|---|---|---|---|
| v0 (before) | #F8C987 apricot / #D1A262 tan | #85779C lilac, faceted | drift |
| a `creamKeep [1, 0.85]` | #F2EEE7 white / #D1A262 still tan | #9B92A3, **one flat tone** | skull drifts, shade flattened |
| b a + hueKeep bone, cloth | #F2EEE7 / #B7AB95 grey-cream | flat (lift floor) | rejected: flattens the shading |
| c b + whiteKeep 0.8 | = b (0 px over b) | = b | whiteKeep does nothing here |
| e creamKeep [1, 0.6] + hueKeep | #D6D3CB / #B7AB95 | partly flattened | rejected |
| **f hueKeep { bone 1, cloth 1 }** (= d, creamKeep [1, 0] + hueKeep) | **#D6D3CB off-white / #B7AB95 grey-cream** | **#847B8A, facets kept** | **adopted** |
| f + hueKeep wicker, bread | same | same | rejected: dulls the living basket, loaves and gold halo |

- Golden sun: toque L .82 vs grass .53 (dL +.29; was +.22 apricot), toque/skull step dL .17 (was .15). The toque is
  light warm-grey, not paper white. Only a lift floor (creamKeep lift) gets it whiter, and that flattens the shade copy.
  Evidence: `wk/cmp-golden.png`, `wk/cmp2-golden.png`, `wk/z-sun.png`, `wk/z2-sun.png`, `wk/z2-shade.png`,
  `wk/cmp-final-golden.png`.
- Noon and night scenes: 0 px changed (`wk/cmp-noon.png`, `wk/cmp-night.png`). The full `--preset cast --raw` pack vs the
  previous raw frames (`wk/ab-raw.txt`): every clip and turnaround has 0 differing frames, except scene-golden and
  scene-mark-golden. talk shows 28 frames that differ only in a 9×9 box at the speech bubble. This is shared FX drift, not
  the keep: the same pack rendered with the keep stripped (`base=1`, `wk/talk-base`) matches the new talk byte for byte.
- Golden 8-facing stills (`wk/g8/base-golden-rows.png` vs `fix-golden-rows.png`, x3 `cmp-idle-ghost-x3.png`): the living
  rows read white toque + grey-cream skull at every facing, and the basket and loaves stay warm. **Ghost / ghost-spent stay
  pale blue / blue-grey at golden** (before: tan toque and skull). The cause is that the custom `bonesGhostTone` ramp is
  re-hued to its own (blue) band tone. Residual: a few tan basket pixels on the ghost at E/W/SW (wicker is not kept, see
  the rejected row). Golden clip renders (`wk/golden-clips/`: idle, walk/game, offer, ghost, ghost-spent sheets + 1x GIF
  frame strips `strip-clip-*-1x.png`) were looked at: the toque keeps its hi/mid facets in motion.
- Pack: **113 pass / 19 warn / 0 fail**. No row changed status vs the previous 110/19/0; the 3 new rows sig_outside.toque,
  sig_outside.skull and game.feet_visible come from newer charcheck and all PASS. sig_ground golden-sun PASS dH 147,
  golden-shade PASS dL +46 % (was +44 %).
- Bake re-run (`--bake skeleton-chef --preset cast --game 1`): 10 clips × 8 dirs. The bake renders at noon, so its
  colours are unchanged. The cell is now 60×74 (was 60×79) because the shared bake cell code changed, not the spec. The
  offer heart / vote sparkles are cropped at the figure cell (shared `--fxcell figure` default; the game draws its own
  bubbles). Rows: `bake/rows-{S,SE}-x3.png`; the old sheet is kept in `wk/bake-pre/`.

## Touch-up (2026-10-16): Clocktower game clips
Rules: CHARACTER_PLAYBOOK / CAST_PORTING top notes (Clocktower-only clips, module fixes r1 + r2). Pack re-rendered after
the shared-code changes: `--preset cast --clips idle,walk,run,talk,vote,die,offer,point,ghost,ghost-spent,turn --raw`,
**110 pass / 19 warn / 0 fail** (v3: 69 / 15 / 0; the extra rows are the new clips + the new charcheck rows). Old pack kept
in `pre-tu/`, touch-up stills in `tu/`. Bake: 10 clips × 8 dirs (`bake/`, also `out/sprites/`).

| change | what | evidence |
|---|---|---|
| **point** (new, shared emote) | the LEFT hand leaves the basket rim and points at the one he faces; the arm **stretches along its own bone** (`upperArmL.s` z +0.6, `forearmL.s` z +0.3) so the chibi arm clears the basket and skull. Gather (4) → point, half-lids, skull turned to the target (18) → emphasis: hand lifts 10°, jaw parts (6) → point (14) → lowered (6) → idle. Telescoping (sliding `.p`, as in the vote) broke the arm into specks at SE; an unstretched arm hid in the basket | `tu/c-p.png` (telescope, rejected), `tu/c-pv.png` (no stretch), `tu/c-pv3.png` (stretch variants), `tu/c-b1.png`/`c-b2.png` (final, 8 facings ×4), `tu/s1x-point.png` (1x GIF frames), `clip-point.png` |
| **ghost** (new) | crow scheme, spec-only: part-less `ghostK` bone scale → shader ghost level; every tone mapped by lightness onto a pale-blue ramp (`GHOST.ghost`), slope 1.15 (crow's 1.55 merged toque and skull into one white blob), trousers fade to mist, shins dithered out, boots gone; gold octagonal halo over the toque (`halo` bone on `toque0`, ×1000 from a micro ring). Hovers 0.18–0.24 m (legs fk, dangling, toes down), still hugging his basket, toque sways, slow look aside (loop 64, holds 16) | `tu/c-gh1.png`, `clip-ghost.png`, `tu/s1x-ghost.png` |
| **ghost-spent** (new) | same, dimmer grey-blue ramp (`GHOST.spent`), no halo, lower hover (0.11–0.15 m), chest/head bowed, sockets slightly lowered (−0.2) | `clip-ghost-spent.png`, `tu/s1x-ghost-spent.png` |
| die de-combat | the `hurt` flash event and the startled gasp (wide sockets, arms flung out) are gone: key 0 is now a resigned sigh (chin up, jaw 14°, half-lids, arms settle on the basket) held 14 f; key 18 eyes shut (jaw 34° kept; with jaw 22° + half-lids `die.key_speckle` went +8). He still falls apart gently into the pile, `die`+`land` at f22 | `tu/c-b3.png` row 2, `clip-die.png`, `tu/s1x-die.png` |
| other clips | no weapon/combat content: talk (baguette gesture), vote (loaf raised), offer (basket offered) are social gestures; unchanged | — |
| module fixes re-check | he stays on the legacy Gait (`legIK 'pose'`), so M1–M3 do not change his walk; walk/game still 4/4 drawings, off_grid 0, flicker 0, shins + boots visible under the basket in every 1x drawing (`tu/s1x-game.png`). New row `game.head_bob` WARN 0.3 px: the body bob rides the root, the head barely moves relative to it (stiff rattle-scurry; jaw clack + toque wobble carry the beat) | `report.txt`, `tu/s1x-game.png` |

## v3 changes (critic-skeleton-chef 16/24, character-owned issues)
| issue (critic) | fix | evidence |
|---|---|---|
| face reads as a moustache at S/SE; far socket a 1-px sliver at SE | the dark smile bar and smileEnd boxes are gone. There is now a **light tooth band** (cloth near-white, 0.065 m ≈ 2.3 texels tall) on `jaw2` with three 1-px dark gaps, so it drops with the jaw. The nose is raised to 0.182 and shrunk to 0.032 tall, leaving a cream gap above the teeth. The eyes move to [0.088, 0.29, 0.222] with sockets turned **12° inward** (v2: 20° outward) and 0.115 tall. `mouthFloor` is shortened to sit under the cranium, because it showed as a dark line over the teeth when closed | `v3/face-back.png` (S/SE/SW + N/NW/W ×8), `v3/face-talk-f0-x10.png` |
| golden sun: toque and skull merge into one peach blob | bone palette dropped to a cooler grey-cream `#D8CCB2 / #B8AC96 / #8C7C84`, toque cloth raised to `#FFFDF8`. Measured on `scene-golden-crop.png` (`px.py.js`): toque #F8C987 L .75 vs skull #D1A262 L .60 (**dL .15**, v2 .05). Noon: toque L .99/.88 vs skull .77/.65 | `scene-golden-crop.png`, `v3/sc1/scenes.png` |
| vote baguette under the toque, sparkles on the face | the **skeleton arm telescopes**: forearm and hand slide out of their joints along the bone (`forearmR.p` = rest dir × 0.26, `handR.p` × 0.2; cream gaps read at 1x). The chest twists −20 so the right shoulder goes back, and the body rises 0.04. The loaf clears the toque top at S, SE, NW, W and SW but still overlaps at E, NE and N. Sparkles fire at the new `tip` socket (the baguette tip), away from the face | `v3/v10-x4.png`, `self3/acts-1x.png` (vote row) |
| talk:0 baguette hidden at SE | key 0 re-keyed (chest twist −25, head +20, arm [40, 0, 70] / [−60] / hand [−90, 0, −80]): the loaf swings out to screen-left at SE, S and SW. Key 12 stays as the up-gesture | `v3/t0-x4.png`, `v3/tk-all3.png` (tk10 picked) |
| offer gag does not read: thrust invisible at dir 1, pop masked by poof + heart | thrust key 6: `basket.p` [−0.04, 0.32, 0.2] with arms 75/−40. The basket rises to the chin and out to screen-right at dir 1, exposing the white apron below it. Pop: `head.p` +0.28 m (v2 0.15) over 3 stacked vertebrae (2.5-texel cream stalk). `poof@crown` moved from f20 to **f26**, so it lands with the skull; the heart from f6 stays above the toque | `v3/offer-keys.png`, `v3/of-all3.png` (of7), `self3/acts-1x.png` (offer row) |
| run sinks until the legs vanish behind the basket; contact never shown | moving, he hugs the basket 0.08 m higher (`CARRY_UP` on every walk/run key: `basket.p` +0.08, forearms −32), so the shins and boots show below it in every drawing. Run bob 0.048 → 0.03, runSpeed 2 → **1.5 × V_GAME** (8.3 m/s), runStride 1.05 → 0.8 H. The run no longer sinks | `self3/loco-1x.png`, `self3/game-1x-track-x4.png`, `v3/gD`, `v3/gF` |
| sheet/code drift, nape line, periwinkle shirt | header comments rewritten (legacy Gait, legIK 'pose', arms keyed on the basket). `mouthIn` is pulled forward (z −0.04 → 0.10, was −0.12), so no dark nape line at N. Shirt lit tone `#4A5688` (v2 `#6474A8`), mid `#3C4570`; only the sh `#3C3456` is lifted for the night rule | `v3/face-back.png` (N row) |
| (criterion 7) die gasp hidden under the hurt flash | gasp key held 14 frames (v2 10); later keys +4 (`die`,`land` at 22) | `self3/loco-1x.png` (die row: frame 3 = gasp after the flash) |

## 0. Brief
- Concept: a small, friendly cartoon skeleton baker in a tall puffy toque, hugging a wicker basket of loaves. He
  rattles across the square at full player speed and, when it all gets too much, simply falls apart.
  Adjectives: **friendly, deadpan-stiff, rattly** → personality body/head f 2.2 ζ 1 r 0 (stiff, no wobble), sudden
  snaps between held keys, no arm swing in the gait (the hands never leave the basket), and the jaw does the "acting".
- Body plan: **upright chibi** (`chibi({ height 1.0 (skull top), heads 2.3, legs 1.0, arms 0.95, snout 0 })`; the v2
  sprite is a 35 px chibi person) plus a toque bone above the skull. `spec.bodyPlan 'uprightAnimal'`.
- Game-speed arithmetic: H 1.40 m, v_game = 3.95·H = **5.53 m/s**, run 1.5× = 8.3 m/s. Leg 0.364 m = 0.26 H, hip
  0.427 m. N = 4 drawings × 2 grid frames → cycle 0.278 s, C ≈ 1.1 H. Duty 0.18 → scurry with flight.
  Legacy Gait with `runFroude` [1.5, 2]·Fr so 5.53 m/s plays the WALK branch. LegGait 'biped' crouched the whole leg
  (reach drop on 0.36 m legs), and legacy Gait + legIK 'plant' re-pins the legs every 60 Hz frame (walk flicker 1517,
  off_grid 32; `v3/gA`, `v3/gB`), so the spec keeps legacy Gait + **legIK 'pose'**.
- Identity (ref facings): (1) blob = tall puffy toque on a big round skull; (2) palette: grey-cream bone, white
  toque/apron, dark navy shirt, golden basket/loaves; (3) prop: wicker basket of loaves in both hands at the belly;
  (4) face: big dark eye sockets, small nose hole, **light tooth row with dark gaps** (v1); (5) v2 motion: 1-px bob.

## Unique to me (re-checked on v3 1x sheets)
1. **Extra animated parts.**
   - **Jaw** (mandible on `jaw`, back hinge, child `jaw2`, carrying the tooth band): walk/run open 22°/30° on every
     contact drawing and shut on the passing drawing. Talk 30°/26° on alternating keys; offer 36° on the pop; die 14° sigh, 34° as the skull lifts,
     26° slack. At 1x the open jaw reads as the light tooth row dropping off a dark mouth (talk row in `self3/acts-1x.png`;
     the pile at S shows the teeth face-up, `bake/rows-S-x3.png`).
   - **Toque** (`toque0`, keyed): wobble ±9° walk / ±12° run per drawing, knocked back on the offer landing, tumbles in the die.
   - **Skull pop** (`head.p` +0.28 m on a 3-vertebra stalk): reads at 1x (offer frame 6 in `self3/acts-1x.png`) and is no
     longer covered by the poof, which now fires on the landing (f26).
   - **Telescoping arm** (new, vote): forearm and hand slide out of their sockets to lift the loaf above the toque. Only a
     skeleton can do this, and it is the vote read at 1x (vote row: loaf + sparkles above and left of the toque).
   - **Basket** (`basket`, `basket.p`): raised to the chin in the offer, lifted 0.08 m while moving, spilled in the die.
     **Baguette** on `handR`: out on talk:0, up on talk:12, torch on the vote.
   - **Apron bow tails** (1-link chain): the only spring.
   - Eyes: blink (idle), wide (vote, offer), half (die sigh, point), shut (die). FX: speech bubble, vote sparkles at the `tip`
     socket, heart + landing poof (offer), death dust + soul wisp (die; no hurt flash since the touch-up).
2. **My locomotion: a stiff rattle-scurry.** Upright, arms locked on a slightly raised basket, short quick steps with
   flight (duty 0.18), 1.4-texel bob, jaw clack and toque wobble on every footfall. At 1x the shins and boots are visible
   below the basket in every drawing, and the boots alternate (`self3/game-1x-track-x4.png`): "scurry".
3. **Expressions.** Sockets 0.11 × 0.115 m (≈ 3×4 texels) turned 12° inward, so both read at SE, with a 1-texel glint.
   Small nose. Light tooth band with three dark gaps. Talk = jaw drop (dark mouth above the teeth); vote = wide sockets
   + "ooh"; die = resigned sigh (half-lids) → shut + slack; point = half-lids, skull on the target; offer = wide + jaw drop on the pop.
4. **Game-speed readability.** Walk: 4/4 drawings, 0.278 s / 1.1 H per cycle (`game.readable` PASS). Talk: a beat every
   6 frames, the loaf visible at SE on both arm keys. Vote: 4-frame dip, then the raise, held 1.07 s. Die: sigh 14 f
   → buckle → fall → pile at f22, held. Offer: gather 6 f → basket-up hold 14 f →
   pop 6 f → land + poof 6 f → settle.

## Proportions (vh 10, 36 px/m)
| | m | texels |
|---|---|---|
| total (toque top) | 1.40 | 44–46 (`height_px` PASS S 45) |
| toque (band r 0.19, puff ring Ø ≈ 0.56) | 0.97 → 1.40 | 15 tall, 20 wide |
| skull (chin 0.565 → crown 1.0) | 0.44 tall, 0.52 wide | 16 tall, 19 wide |
| tooth band | 0.21 × 0.065 | 7 × 2 (+ 3 one-px gaps) |
| torso | 0.34 wide, 0.27 deep | 12 wide |
| leg (hip → ankle) | 0.364 (0.26 H) | 13 |
| basket (centre y 0.45, +0.08 moving) | Ø 0.37 × 0.15 | 13 wide |

## Palette (≤ 5 slots + accent)
| slot | hi | mid | sh | parts |
|---|---|---|---|---|
| bone | #D8CCB2 | #B8AC96 | #8C7C84 | skull, mandible, vertebrae, forearms, hands, shins (grey-cream) |
| cloth | #FFFDF8 | #E8E2D8 | #A49CB0 | toque, apron, bow, teeth, glints (cool near-white) |
| shirt | #4A5688 | #3C4570 | #3C3456 | shirt, sleeves, trousers (dark navy; sh lifted for night) |
| dark | #6E4A44 | #4A3236 | #382833 | sockets, nose, tooth gaps, mouth inside, boots |
| wicker | #C88A48 | #9A6634 | #5E3E38 | basket |
| bread (accent) | #FFD27A | #E09A44 | #A0603C | loaves, baguette |

Signature: `[{ part: 'toque' }, { part: 'skull' }]`. Sockets: `crown` (head, FX), `tip` (baguette tip on handR, vote sparkles).

## Clips (30 Hz grid; f = clip frame)
| clip | keys (hold) | what reads |
|---|---|---|
| idle (loop 72) | breath, blink, glance (unchanged) | 1-texel breath, blink, sideways glance |
| walk / run | 4 gait drawings: contact (jaw open, toque tilt) · pass · contact · pass, all with `CARRY_UP` | scurry, clack per footfall, legs below the basket |
| talk (loop 24) | 0 jaw 30 + loaf OUT (chest twist −25) (6) · 6 shut, nod (6) · 12 jaw 26 + loaf UP (6) · 18 shut (6) | a speaking beat every 6 f |
| vote | 0 dip (4) · 4 telescoped arm up, loaf above the toque, `vote@tip`, held | raised loaf + sparkles clear of the face |
| die (legs fk) | 0 resigned sigh, no flash (14) · 14 buckle (4) · 18 skull lifting, eyes shut, toque tipping (4) · 22 PILE + `die`,`land`, held | he gently falls apart |
| point | 0 gather (4) · 4 stretched left arm points, half-lids (18) · 22 emphasis lift (6) · 28 point (14) · 42 lowered (6) · 48 idle | "him." |
| ghost (loop 64) | 4 hover keys (16 each): 0.24 / 0.21 / 0.18 / 0.21 m + look aside; pale blue, halo, legs dangle and fade | dead player, vote unspent |
| ghost-spent (loop 64) | same, 0.15–0.11 m, bowed, dim grey-blue, no halo | vote spent |
| offer (emote) | 0 gather (6) · 6 basket up to the chin + `emote:heart@crown` (14) · 20 SKULL POP 0.28 m (6) · 26 lands + `poof@crown` (6) · 32 idle | "fresh bread?" … rattle |

## Game-speed pass
- `game.readable` PASS 3.95 H/s, cycle 0.278 s, 1.1 H; game/walk/run off_grid 0, flicker 0 (upper 0), strobe 1.
- Contact: duty 0.18 and 4 drawings, so no foot is planted across two drawings (`foot_slide` n/a). legIK 'pose' rides the
  planted foot with the root in-hold (60 Hz in-hold 7.03 texels game, 12.01 walk-clip, 24.84 run; v2 run 30.65). A real multi-drawing
  plant needs the motion fix (module issue). What the character can do is done: the stance boot is ≥ 3×2 texels clear of
  the basket in every drawing at game and run speed (`self3/game-1x-track-x4.png`, `self3/loco-1x.png`).
- Talk amplitude 36 %; vote pose_read 32 %, final hold 1.07 s; die final hold 0.93 s, 135 % off idle; offer pose_read 46 %.

## Self-critique (v3)
Evidence: pack `shots/char-skeleton-chef/` (touch-up re-render: **110 pass / 19 warn / 0 fail**; v3 was 69 / 15 / 0, RTX 4090), `v3/`,
`self3/`, bake `bake/`.

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | `turnaround-silhouette.png` 8/8 toque over skull; vote loaf breaks the silhouette at 5/8 | wider S thumbnail |
| 2 | Pixel stability | 2 | idle/game/walk/run/talk/vote/offer/die off_grid 0, flicker 0; pan 0, night_pan 0, deterministic 0 | — |
| 3 | Line quality | 1 | sig.skull isolated S 3 (v2 9), max 6 at SE; speckle 38; offer key_speckle +0, vote −5, die +1 (v2 +7…+11); no nape line at N | SE skull speckle 6 |
| 4 | Tonal discipline | 1 | navy shirt restored (#4A5688); toque/skull step dL .15 in golden sun; sig hi/mid 0.85–0.94; colors/slot dark 8, shirt 8 still over budget | fewer tones per slot |
| 5 | Ground separation | 1 | golden sun toque L .75 vs grass .53 (dL +.22, dH 16): the golden grade caps near-white at #F8C987, so no palette change can reach +25 %; skull vs grass is worse (L .60) | tools: sun-copy row over the lit figure only |
| 6 | Proportion, appeal, expression | 2 | `v3/face-back.png`: two sockets + small nose + light tooth row at S; both sockets at SE; face_lit 88 % | — |
| 7 | Animation timing | 2 | die sigh reads (no flash since the touch-up); point emphasis 6 f; vote sparkles clear of the face; talk:0 loaf at SE; holds 6/6/6/6 | — |
| 8 | Weight, contact, game speed | 1 | legs and boots visible below the basket in every drawing, no run sink; still no multi-drawing plant (module) | motion: plant for chibi legs |
| 9 | Personality, secondary, uniqueness | 2 | jaw clack, toque wobble, readable skull pop, telescoping-arm vote, falls-apart die; sheet = code | — |
| 10 | Smears and FX | 2 | poof on the landing (f26), sparkles at `tip`, heart above the toque, dust + wisp | — |
| 11 | Facing and turns | 2 | facing_area_var 9 %, turn off_grid 0; turn.foot_slide 3.82 WARN (legacy recovery steps) | — |
| 12 | Technical | 2 | page_errors 0, draw calls color 2 / normal 1, night_freeze 0 | — |
| | **total** | **20** | | |

Three weakest points: (1) golden-sun ground separation is capped by the grade (white toque dL +.22); (2) contact still
glides in-hold (legIK 'pose', module issue); (3) the vote loaf overlaps the toque at E/NE/N (the arm is on the far
side there).
