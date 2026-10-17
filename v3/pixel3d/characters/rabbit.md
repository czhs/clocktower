# Clover (cast `rabbit`) — design sheet

"Herbalist. Knows which leaf heals and which one doesn't." Spec: `characters/rabbit.js`. Pack: `shots/char-rabbit/`,
evidence `shots/char-rabbit/self/`, r3 working renders `shots/char-rabbit/r3a/` (head/eyes), `r3b/` (first r3 pack),
`r3c/` (8-facing key stills `g8-<clip>-<f>.png`, `z-faces.png`, `z-acts2.png`, scene A/B), `dir2r3/` (dir 2 walk/run/game,
raw), bake `shots/char-rabbit/bake/`. Identity source (read only): `pipgws/packages/assets/scripts/cast/rabbit.ts`,
`refs/cast/rabbit.png`. Every render on render-host (RTX 4090 in every report.txt / shot log).

## Touch-up (2026-10-16): Clocktower clips point / ghost / ghost-spent
Rules: PLAYBOOK / CAST_PORTING top notes (Clocktower-only, no combat). Pack `shots/char-rabbit/` re-rendered with
`--preset cast --clips idle,walk,run,talk,vote,die,sniff,point,ghost,ghost-spent,turn --raw` → **111 pass / 16 warn / 0 fail**
(`report.txt`, RTX 4090, page_errors 0). Bake `shots/char-rabbit/bake/rabbit.{png,json}`: 10 clips × 8 dirs, cell 62×72,
anchor [31, 62] (idle 8, walk 4, run 4, talk 4, vote 2, die 4, sniff 10, point 9, ghost 6, ghost-spent 6 frames).
Touch-up evidence: `shots/char-rabbit/tu/` (`z-new2.png`, `z-ghost2.png` 8-facing key stills ×3; `z-point-s-se.png` ×8;
`s1x-{point,ghost,ghost-spent,game}.png` = every frame of the 1x GIFs with durations; `bake-{point,ghost,spent}.png` crops of
the baked sheet; `dir2/` dir-2 walk/game; `pre/` + `pack/` = the A/B).
- **Combat audit:** nothing to change. No clip swings a prop or flinches; `die` has no hurt flash (sway → sit → tip onto her
  side, dust ring + wisp); `sniff`'s skull glyph is her verdict on a POISON leaf, which she drops aside — a herbalist's
  gesture, not aimed at anyone.
- **point** (free LEFT paw; the bouquet stays in the right): grid-searched arm (`rabbit_psearch.js`) `upperArmL [70,0,40]`
  + `forearmL [−45,0,45]` = a straight 0.38 m arm, paw 0.3 m ahead and 0.37 m out at chest height (≈ 39° to her left of
  the facing). Straight-forward (out 10) foreshortened into the snout at SE and vanished at S (`tu/z-new.png` row 1); the
  diagonal is a clear screen stroke at S, SE, W, SW, NW, N (`tu/z-new2.png`, `z-point-s-se.png`), hidden only at E/NE (far
  side). Head turned toward the paw (+14), ears snap forward, eyes wide, jaw open on the jabs. point: off_grid 0,
  flicker 0, hold_redraws 0, pose_read 30 % ×6, key_speckle +20 WARN (the paw stroke's edge pixels).
- **ghost / ghost-spent** (spec only, mushroom/frog recipe): a geometry-less `halo` bone (child of head, joint buried in
  the skull) carries a gold ring authored at ×0.001; `ghost` keys `halo.s` 999 → ring 0.1 m over the ear tips, clear at
  8/8 facings (`tu/z-ghost2.png`; at 0.66 m it touched the near ear at SE/E, `z-new2.png`). The halo's world scale ÷
  head's is the per-clip signal in `material.vertex` → `material.tones` remaps every tone by luminance to a pale-blue ramp
  (spent: desaturated ×0.62 = dim grey-blue) and a 2×2 ordered `discard` dissolves the skirt from bind y 0.36 (solid) to
  0.10 (gone) (spent 0.40 → 0.14). Shins + boots scaled into the skirt. Hover: the hop gait still re-plants the GHOST
  legs in loop clips and the reach dip eats the first ≈ 0.1 m (ghost 0.16 vs spent 0.10 rendered at the same head
  height), so `pos` 0.30/0.25 (ghost) and 0.22/0.19 (spent) = dip capped at 0.1 → net hover 5.8 / 4.3 texels for the head
  (idle head y 187.5 → ghost 181.7 / 183.3, spent 184.2 / 185.1 in the stage log). 4 step keys 0.6 s apart, ±3° sway, a
  blink; spent: ears drooped back (−28/20), head bowed, heavy lids, no halo. ghost: off_grid 0, flicker 0, amplitude 43 %,
  islands 2 (the halo, intended); spent: amplitude 35 %, islands 1.
- **A/B (living clips untouched):** variant `shots/char-rabbit/rabbit_pre.js` (no halo part / shader hooks / new clips) vs the
  new spec: idle, talk, die, sniff, walk, game, turn **0 px differ** (`rabbit_abdiff.py.js tu/pre/raw tu/pack/raw`). The
  old r3 raw differs in talk/die/sniff/walk/game/turn (≤ 2184 px) — that is the shared module fixes (FX/turn), not this spec.
- **Module-fix re-check:** walk/game 3.95 H/s, cycle 0.30 s, 1.19 H, 4/4 drawings (`game.readable` PASS), off_grid 0,
  flicker 0 at dir 1 and dir 2 (`tu/dir2/clip-game.png`): the visible boots are FK and only ever under the hem (the gait
  IKs the ghost hop legs), hem never under the grass. 1x: the hop reads (`tu/s1x-game.png`).

## r3 changes (art-director review 15/24 → fixes)
| issue (critic) | fix | evidence |
|---|---|---|
| boots float through the dress in every hop drawing (chest, back, in front of the bouquet) | the LegGait now IKs **ghost legs** (`hopThigh/hopShin/hopFoot`, no geometry, long + bent); the visible legs stay FK under the hem and are squashed/stretched with the hop (`squash.bones ['head','thighL','thighR']`, amount 0.16, crouch depth `height 0.856` → −0.051 m = the leg shortening) | `r3b/z-game8.png` (dir 1 raw f0–23 ×6), `dir2r3/z-game8.png`, `dir2r3/z-run8.png`: boots only ever under the hem; game.flicker 392/536 → 0, game.off_grid 11 → 0 |
| goggle eye at idle breath keys SE/SW | glint 0.034 → 0.024 m box placed flush with the eye's top-outer corner (cannot rasterise into the middle) | `r3c/z-faces.png` rows idle36/idle56/talk0/talk12 at S/SE/E/SW |
| far eye outside the head, no muzzle in profile | head lathe 8 → 16 sides; eyes moved to the sides (joint [0.13,0.2,0.18] ON the surface, turned 30° = the surface normal, 0.006 m proud; flush = z-fight hollow eyes, `r3a` A/B); real snout 0.085 m proud with a slight drop, pink nose at its tip | `r3a/z-a.png`, `z-b.png` (turnaround ×5), `dir2r3/z-game8.png` (profile) |
| talk jaw = mauve beak | jaw is the lower lip under the snout, opens 15° (dark 2×1 opening); paw beat [20,0,75] ↔ [75,0,30] (≥ 40°) | `r3c/z-faces.png` talk rows; talk.amplitude 24 % |
| vote bouquet stops at ear base | arm straight up and out (`upperArmR [30,0,140]`, forearm [−60,0,60], hand −90), forearm scaled 1.4× (`forearmR.s`), body tilted away: bouquet beside the ears at S/SE/SW, behind the head at E, over it at W | `r3c/z-acts2.png` row vote10; vote.pose_read 27 → 54 % |
| peach in golden sun | fur moved to a cool pink-lilac white (#F8E8FF/#DECCF4/#9E8CBE): golden-sun dH 23 → 34 PASS; dress teal-jade with a lifted shadow | `r3c/scene-golden-crop.png`, report sig_ground |
| hop = rigid block | touchdown drawing: hips pitched forward, hem down ~2 texels, head + ears 16 % squashed; flight: legs + head stretched ~10 %, ears streaming | `r3b/z-game8.png` f14/f17 vs f3/f20 |
| sniff unreadable | each sniff = a DIP (body −0.065 m, head down, ears forward-out) then RISE; leaf 1.4× and held in front of the snout | `clip-sniff.png`, `r3c/z-acts2.png` row sniff12 |
| navy cape patch at S, apron hidden | dress shadow #3C4A62 → #587C84; apron cut 38° → 52° wide | `r3a/z-a.png` S |

## 0. Brief
- Concept: a small, gentle white rabbit in a moss dress and cream apron who hops everywhere holding a bouquet of herbs and
  flowers to her chest. Adjectives: **gentle, attentive, quick** → personality body f 4 ζ 0.6 r 0, head f 4 ζ 0.7 r 0;
  short crisp holds (6 frames), a twitchy nose, ears that answer everything.
- Body plan: **upright chibi skeleton** (`chibi({ height 0.95 (skull top), heads 2.15, legs 0.78, arms 1.25, snout 0.12 })`)
  + 6 ghost hop-leg bones, driven by the **LegGait `hop` plan on the ghost legs** (`locomotion.legs {HL, HR}` =
  `hopThigh/hopShin/hopFoot`). `spec.bodyPlan 'hopper'`, H 1.32 m (v2 33 px, ear tips).
- Game-speed arithmetic: v_game = 3.95·H = 5.21 m/s, run 10.4 m/s. One two-footed hop per cycle, N 4 drawings × 2 grid
  frames; measured 0.30 s / 1.19 H per cycle, 4/4 drawings every cycle (`report.txt game.readable`; v2 0.31 s / 1.2 H).
- Identity (ref facing): (1) blob = two long upright ears over a round white head (S, SE, N); (2) palette white fur + pink
  ear insides + green dress + cream apron; (3) bouquet held at the chest (on the RIGHT paw in 3D); (4) face: big dark eyes
  with a glint, pink nose, pink blush; (5) v2 motion: ears tilt with the walk bob — kept as spring ears.

## Unique to me
1. **Extra animated parts.**
   - Ears = 1-link spring chains `earL`/`earR` (f 5, ζ 0.8, gravity 0.15, limit 35°, `tip: 'axis'`, quant chain 4). In
     the hop they lag the arc and stream back (`clip-game.png`, `game-onion.png`); in actions the ear BONES are keyed (vote
     up; die flat back-out; sniff forward-out on the dips, droop −55/35 on the poison verdict) and `dynamics: 'snap'` snaps
     them per key (hold_redraws 0 in vote/die/sniff). Talk does NOT key the ears: tried in r3, the springs re-settled every
     2 frames inside the 6-frame holds (`r3b/clip-talk.png`, loops ignore clip.dynamics).
   - Hop squash/stretch on head + visible thighs (r3): touchdown = head/ears 16 % flatter + legs 16 % shorter (boots stay
     on the ground while the body drops 2 texels), flight = ~10 % stretch. Visible at 1x now (`r3b/z-game8.png` f14).
   - Nose twitch = `mouth.p` +0.03 m on the snout tip; jaw = lower lip, 15° in talk (dark opening).
   - The **leaf** story prop on its own bone under `handL`, hidden at 1/20 size, shown 1.4× by the emote.
   - Cotton tail, apron tie: rigid on the hips.
   - FX: speech bubble, `vote@handR` sparkles, `emote:skull@crown`, die dust ring + soul wisp, hop dust (ghost-leg steps).
   - (touch-up) `halo` bone in the skull: the ghost halo (×0.001 alive, ×1 ghost) and the shader's ghost/spent signal.
2. **My locomotion: a two-footed HOP** (re-checked after r3). Crouch (touchdown: hem to the ground, head squashed, hips
   forward) → take-off (stretch, ears streaming) → apex → fall; 4 drawings per 0.30 s, hop arc 0.36·H with the shadow
   detached (`game-onion.png`). The boots are drawn only under the hem (FK, never IK'd): **no boot ever crosses the dress**
   at dir 1 or dir 2 (`r3b/z-game8.png`, `dir2r3/z-game8.png`, run `dir2r3/z-run8.png`). Honest limit: there is no
   world-planted foot — the touchdown drawing hides the boots under the hem on the ground, so `foot_slide` is n/a and the
   "60 Hz in-hold 11.0" row is the root's own travel with the rigid boots, not a re-pin. One-word 1x read: **hop**.
3. **Expressions in the new style.** Eyes 0.09 × 0.115 m boxes on the sides of a 16-sided head, turned 30° (3×4 texels at
   S), 1-texel cream glint flush in the top-outer corner (no goggle at any idle/talk key, `r3c/z-faces.png`); own `eye`
   slot. Blink y −0.8, half −0.45, wide +0.15, squint −0.55. Ears carry the moods at 1x.
4. **Game-speed readability (judged on the 1x GIFs frame by frame: `self/z-game1x-sheet.png` = all 48 frames of
   `game-1x.gif` at 1x with their 30/40 ms durations; the Read tool cannot play a GIF).** Walk: hop arc + detached shadow
   + squash. Talk: paw beat + bob, amplitude 24 %. Vote: 3-frame dip → bouquet up beside the ears, held (pose_read 54 %).
   Die: down in 18 frames, held 1.07 s. Sniff: dip/rise ×2 with a big leaf, then droop + skull (pose_read 64 %).

## Proportions (vh 10, 36 px/m)
| | m | texels |
|---|---|---|
| ear tips (H) | 1.32 | 45 at S (`height_px` 42–48) |
| skull (head joint → top), width | 0.405 × 0.48 (16-gon lathe, sz 0.9) | 15 × 17 |
| snout proud of the face | 0.085 (tip z 0.30) | 3 |
| head joint (chin) | 0.55 | — |
| dress hem / waist | 0.15 / ≈ 0.33, hem r 0.28 | — |
| visible leg (hip → sole) | 0.32, FK; hop: 0.27–0.35 (squash 0.16) | 9–12 |
| ghost hop leg | 0.156 + 0.208, bent (IK only) | — |
| arm (upper + fore) | 0.18 + 0.16 (vote: forearm ×1.4) | — |

## Palette ([hi, mid, sh]; 5 slots + gold accent + leaf story accent + eye)
| slot | tones | use |
|---|---|---|
| fur (signature) | #F8E8FF #DECCF4 #9E8CBE | head, ears, paws, legs, cotton tail (r3 cool pink-lilac white: golden sun dH 34) |
| pink (signature part `earIn`) | #F6B8C0 #E48C9C #A65C78 | ear insides, nose, blush, pink flowers |
| dress | #7CBCA4 #3A7A6C #587C84 | teal-jade dress, lifted shadow (no navy cape) |
| cream | #FFF4D8 #EAD8B4 #A8928C | apron, petticoat, white flowers, eye glint |
| dark | #9A6C52 #6A4430 #46323A | boots, mouth floor |
| eye | #5C4A64 #2E2436 #3A3040 | eyes only |
| gold (accent) | #FFE48A #F0B640 #A87638 | yellow flowers, apron tie |
| leaf (story) | #E2F49A #9CC84E #4E6E52 | the sniffed leaf, bouquet stems and leaves |

## Timing charts (30 Hz grid; `interp: 'step'`)
- **idle** (loop 72): f0 rest · f20 nose twitch (4) · f24 · f30 breath 1 texel · f36 breath 2 · f54 blink (2) · f56 · f66.
- **walk / run**: LegGait hop on the ghost legs (4 drawings, holds 2–3), visible legs FK + squash.
- **talk** (loop 24, `speak` f0): f0 jaw 15 + paw out-low [20,0,75] · f6 bob −0.045, half-lid · f12 jaw 14 + paw up
  [75,0,30] · f18 bob, half-lid.
- **vote** (hold, snap): f0 dip 3 → f3 bouquet up and out (upperArmR [30,0,140], forearmR [−60,0,60] ×1.4, handR −90),
  tiptoe +0.04, body rolled away 12°, ears up, eyes wide; repeated f30.
- **die** (hold, snap, legs fk, `die`+`land` f18): f0 sway 8 → f8 knees fold, sits 6 → f14 tips 4 → f18 DEAD; repeated f60.
- **sniff** (emote, snap, skull f30): f0 pluck 6 · f6 leaf up in front of the snout 6 · f12 DIP 6 · f18 RISE 6 · f24 DIP 6
  · f30 POISON: ears droop, leaf at arm's length 14 · f44 toss 6 · f50 "I knew it" 6 · f56 nod 6 · f62 idle.
- **point** (snap, 3.3 s ≈ pipgws EMOTE_POINT_MS 3.5 s): f0 gather (paw drawn in, dip, half-lid) 4 · f4 flick smear
  (forearm ×1.3, 2 frames) · f6 POINT (paw out-forward at chest height, head + ears toward it, jaw open) 12 · f18 jab
  ("her!", dip, nose twitch) 6 · f24 point 28 · f52 jab 6 · f58 point 34 · f92 paw back down 8 · f100 idle.
- **ghost** (loop 72, hold): f0 high 0.30 (roll +3) · f18 mid · f36 low 0.25 (roll −3) · f46 blink 2 · f48 · f54 mid;
  halo on, pale-blue shell, skirt dissolving.
- **ghost-spent** (loop 72, hold): same timing, hover 0.22/0.19, ears drooped, head bowed, half-lids, no halo, dim grey-blue.

## Self-critique (Stage 7) — final pack r3 (`--preset cast --raw`, 68 pass / 15 warn / 0 fail)
| # | criterion | score | evidence (file · facing/frame · number) | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | both ears 8/8 (`turnaround-silhouette.png`), profile now has a snout; vote bouquet adds a bump beside the ears | — |
| 2 | Pixel stability | 2 | game/walk/run off_grid 0, flicker 0 (r2: 392/536 legs only); idle/actions off_grid 0; deterministic; pan 0 | — |
| 3 | Line quality | 1 | silhouette_line 0/1016, inner_lines 330; isolated_px fur max 9 (r2 15); die.key_speckle +14, sniff +10 | fewer facets on the curled die pose |
| 4 | Tonal discipline | 1 | colors/slot eye 11, cream 9 (63 total); fur hi/mid ≥ 0.88 at 8/8; no navy patch | merge eye into dark |
| 5 | Ground separation | 2 | sig_ground all 4 PASS: noon sun dH 174, noon shade +45 %, golden sun dH 34, golden shade +49 % (`r3c/scene-*-crop.png`) | — |
| 6 | Proportion, appeal, expression | 2 | face_lit 96 %; no goggle at idle/talk keys (`r3c/z-faces.png`); snout in profile; small talk mouth | — |
| 7 | Animation timing | 1 | talk amp 24 %, vote up in 3 (pose_read 54 %), sniff dips read in `clip-sniff.png`; no vote smear | a 1-frame raise smear |
| 8 | Weight, contact, game speed | 1 | game.readable 3.95 H/s, 0.30 s, 1.19 H, 4/4; crouch/stretch drawings; boots never cross the dress; but no planted foot (n/a) | a drawn two-boot plant that stays world-fixed |
| 9 | Personality, secondary, uniqueness | 2 | spring ears + hop squash visible at 1x, leaf prop carries the emote | — |
| 10 | Smears and FX | 1 | bubble, sparkles, skull, wisp, hop dust present; no smear | vote smear |
| 11 | Facing and turns | 2 | 8 facings read, turn 2x8 | — |
| 12 | Technical | 2 | page_errors 0, deterministic, night_freeze 0, draw calls 2/1, RTX 4090 | — |
| | **total** | **19** | | |

Three weakest points: (1) contact — the hop has no world-planted foot (the boots hide under the hem at touchdown); (2) at
SE the far eye still shows as a 1-texel sliver at the cheek contour next to the snout (physically correct for a 3/4 view,
no longer proud); (3) in golden light she still reads warm peach-pink (the metric passes at dH 34, margin 4°).
