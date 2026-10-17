# Ginger (cast `fox`) — design sheet

"Keeps the inn, and every rumour that passes through it." Spec: `characters/fox.js`. Pack: `shots/char-fox/`, evidence
`shots/char-fox/self/`. Identity source (read only): `pipgws/packages/assets/scripts/cast/fox.ts`, `refs/cast/fox.png`.
Render host: render-host (RTX 4090). **r2 (2026-10-16, after critic-fox 15/24):** see §r2 at the end; r2 evidence in
`shots/char-fox/r2/`.

## 0. Brief
- Concept: a slim innkeeper vixen in a red dress and cream apron, foaming mug in her left paw, ears always pricked
  for gossip. Adjectives: **sly, warm, nosy** → personality body f 3 ζ 0.6 r 0 (sly: late small anticipations), head
  f 3.2 ζ 0.65 r 0; actions end on a lingering hold on the punchline (the wink).
- Body plan: **upright chibi** (`chibi({ height 1.04 (skull top), heads 2.15, legs 0.7, snout 0.3 })`, ears and tail
  my own bones), `spec.bodyPlan 'uprightAnimal'`, `locomotion.plan 'biped'` (LegGait). Not a quadruped: v2 draws her
  upright and clothed (CAST_PORTING §2).
- Game-speed arithmetic: v2 33 px → **H 1.32 m** (ear tips). v_game = 3.95·H = **5.21 m/s**, run 2·v = 10.4 m/s. Leg
  (hip 0.321 → ankle 0.056) = 0.265 m = 0.20 H → duty bound 2·0.6·0.20/1.19 ≈ 0.2 → **skip-trot**: duty [0.18, 0.1],
  reach 0.6, N 4 drawings × 2 grid frames, cycleTime 0.3 s → C = 1.56 m = 1.19 H; run 0.267 s → 2.78 m = 2.1 H.
- Identity (ref facings): (1) blob = big round head with two TALL dark-tipped ears + big white-tipped tail out to her
  right-back (S, SE, N); (2) palette orange fur + red dress + cream apron/muzzle/tail tip; (3) foaming wooden mug in the
  LEFT paw (S: screen right); (4) face: 2×2 dark eyes with a glint, white muzzle with a dark nose, tiny smile; (5) v2
  motion: the tail sways with the steps.

## Unique to me
1. **Extra animated parts.**
   - **Tail** (`tail0`, own bone, axis sideways so `fwd` = yaw): NOT a spring. In walk/run the LegGait's left-arm swing
     channel is routed to it (`locomotion.bones.armL: ['tail0', 'mugHold']`): the big tail swishes ±A (arms[0]) about
     the vertical once per cycle in phase with the steps — the big mass that carries the rhythm at game speed; the mug arm
     stays at its carry rest pose (the elbow channel goes to the part-less `mugHold`). Keyed in idle (slow swish),
     talk (flick on the punch beat), vote (up), die (limp on the ground), whisper (flick up on the wink), point (flick up),
     ghost (slow sway), ghost-spent (low).
   - **Ears** (`earL0/earR0`, keyed bones, no spring): flick in talk (one ear back on alternating keys, ≥ 25°), forward
     and up in vote, one ear swivelled out "listening" + both forward in the whisper, flat back in die.
   - **Mug** (rigid in the left paw, foam = cream cap): raised in the whisper's last beat ("on the house").
   - FX: speech bubble (talk f0, whisper lean-in), vote sparkles at the right paw, die dust ring + wisp, step dust every
     2nd footfall.
2. **My locomotion: a skip-trot** (light, bouncy, tail swishing): 4 drawings per 0.3 s, bob ≥ 2 texels (0.05 m),
   boots only under the A-line skirt (legs hidden: shins would poke through a rigid skirt — mushroom lesson), lift
   0.05 m. Slide-free: legIK 'plant' re-pins the one planted drawing per step; check pose ids `walk:` +1 per 2–3 grid
   frames, 4/4 per cycle, 60 Hz in-hold slide ≤ 1 texel. `surge: false` (mushroom: surge lurched the whole figure).
3. **Expressions.** Eyes 0.07 m (2×2 texels) dark boxes with a 1-texel cream glint part, on the front of the head above
   the muzzle so they read at S/SE/SW. Blink/half-lid/wink = `eyeL/R.s` y scale (2 → 1 texel = sly half-lid). Glance =
   `eyeL/R.p` x offset (pupils slide 1 texel). Jaw bone with a back hinge under the snout: talk opens 28° (dark mouth
   floor shows ≈ 2 texels). Talk: jaw on alternate keys + head nod/tilt ≥ 25° + right paw gesture + ear flick. Vote:
   eyes wide, ears up, paw high. Die: swoon half-lid, then eyes shut, jaw slack, ears back. Point: narrowed eyes. Ghost: calm, one blink; spent: half-lidded, ears drooped. Whisper: side-glance, half-lid, wink.
4. **Game-speed readability.** Walk: bob + tail swish + free arm swing; judged on `game-1x.gif`, `clip-game-1x.gif`,
   `gamespeed.gif` (next to v2). Talk beat every 6 frames; vote raised by frame 3; die down by ≈ 0.6 s; whisper holds
   6/6/14/10/10. Results in §Game speed below.

## Proportions (vh 10, 36 px/m) — measured height (r2) S 44, min 40, max 48 texels (height_px)
| part | m | texels |
|---|---|---|
| ear tip (H) | 1.32 | 47 |
| skull top | ≈ 1.04 | 37 |
| head (chin 0.556 → skull top), width | 0.48 / 0.56 | 17 / 20 |
| ears | 0.27 tall, 0.17 base | 10 / 6 |
| skirt hem / waist | 0.13 / 0.37, hem r 0.25 | |
| tail (r2) | ≈ 0.70 long, r 0.14, cream tip cone ≈ 0.12 | 25 / 10 |

## Palette (5 slots + accent)
fur `#F4A05E / #DE7038 / #9A4A48` · dress `#C8505A / #9C2F3A / #5E2A44` · cream `#FFF6E4 / #F1E2C8 / #B8A0A4` ·
dark `#7A5048 / #4E3438 / #3E2C36` · wood `#C08A50 / #8A5A32 / #5E4038` · accent bow `#8AA8E8 / #3D5EA6 / #2E3C6E`.

## Timing charts (30 Hz, step; = `CLIPS` in fox.js)
- idle (72): f0 A, tail +8 · f30 B (−0.014 m), tail swish −14 · f36 C (−0.028 m = 1 texel) · f50 blink (2) · f52 C ·
  f60 right ear flicks back (4) · f64 B, tail back.
- talk (24, `speak` f0): f0 jaw 28°, head up-turned −12°, right paw out to the side (out 70), mug lifted 22° · f6 jaw shut,
  bob −0.045, head yaw −16 roll +4 (no nod: r2), right ear back, half-lid · f12 jaw 26°, head turned −20° · f18 shut, bob,
  roll +14, left ear back, half-lid. talk.amplitude 53 %.
- vote (r2): f0 dip −0.05 m (3) · f3 on tiptoe +0.05, body tilted away to her right, the MUG raised (`upperArmL [40, 0, 125]`,
  `handL [0, 0, −100]`) beside/above the head at 8/8, ears up, eyes wide, tail lifted, `vote@handL` · held (repeat f30).
  pose_read 46 % ×34, final_hold 1.1 s.
- die (touch-up: fk, NO hurt flash/flinch, `die`+`land` f14): f0 gentle SWOON — right paw to her brow, head tipped back,
  eyes heavy, ears eased back, sway (6) · f6 knees buckle 60° (4) · f10 sinks sideways in the spine/chest (legs = f6) (4) ·
  f14 DEAD: on her left side, knees drawn up, head turned up, eyes shut, ears flat, tail laid behind → held (repeat f50).
  final_hold 2.0 s, 87 % off idle, die.foot_slide 0.56 PASS. Rejected: backward fall (dark skirt disc), face-down.
- point (touch-up, the game's shared emote, 31 f): f0 paw drawn in, chest +10, head −8, half-lid, ears forward (4) · f4 the
  free RIGHT paw thrown out ahead-and-right (`upperArmR [112, 0, 46]`, forearm stretched `.s` y +0.4), chest/head turned
  −16/−18 along it, eyes narrowed, jaw 12°, tail flicks up (20) · f24 paw half down (6) · f30 idle. pose_read 33 % ×20.
- ghost (touch-up, loop 48, `dynamics 'hold'`, legs fk): pale-blue shell + gold halo, boots hidden, wisp under the hem;
  hover pos y 0.22 / 0.26 / 0.30 / 0.30(blink f30-32) / 0.26 at f0/12/24/30/36, free paw floating forward (fwd 30→52),
  tail sway 12° → −18°, ear flick on f12/f36. amplitude 42 %.
- ghost-spent (touch-up, loop 60): the dimmer grey-blue shell, NO halo, hover 0.12 / 0.17 / 0.14 (f0/20/40, blink f40-42),
  slumped (spine 8–12°), ears drooped back 40°, eyes half-lidded, paws hanging, tail low. amplitude 38 %.
- whisper (emote, r2): f0 glance +15 + pupils slide (6) · f6 glance −15 (6) · f12 lean in, face up, paw beside the muzzle,
  half-lid, ears forward, `speak` (14) · f26 WINK toward the camera side (head [−14, −14, 18], right eye lid −0.7), paw
  dropped, tail flicks up (10) · f36 mug raised "on the house", jaw open (10) · f46 idle. pose_read 41 % ×8.
- turn: 45° steps held 2 grid frames (`turn.off_grid` intervals 2x7,4,2x3…), no chains to settle.

## Final numbers (sheet = code)
- Skeleton: `chibi({ height 1.10, heads 2.2, legs 0.7, arms 1.0, snout 0.3, tail false })`, ears 1-link bones
  (at [0.145, 0.40, −0.02], len 0.33, faces turned out 22°), `tail0` (hips, axis 'left'), `mugHold` (part-less),
  jaw hinge [0, 0.105, 0.17]. Paws in the dark slot (fox "socks"; a fur paw vanished against the head in the vote).
- personality body f 3 ζ 0.6 r 0, head f 3.2 ζ 0.65 r 0; chains: none (deliberate: every secondary part is keyed or
  gait-driven, so holds have 0 dynamics redraws).
- locomotion: plan 'biped', walk 5.21 / run 10.43 m/s, cycleTime [0.3, 0.267], poses [4, 4], duty [0.18, 0.1],
  reach 0.6, arms [40, 60] (= right-arm swing AND tail swish), elbows [20, 40], bob [0.05, 0.11], lean [6, 14],
  lift [0.08, 0.11], twist [6, 9], surge false, bones.armL ['tail0', 'mugHold'] (r2 values).
- Boots in the wood slot (r2: leather brown reads against the red hem; dark boots were invisible). Petticoat (`hemSole`) cream.
- Palette as above except fur sh lifted `#9A4A48 → #B4605A` (shade copies were dL +0/+3 % vs grass shadow → +20/+24 %).

## Game speed (Stage 6)
- `game.readable` PASS: 3.95 H/s (5.214 m/s = 187.7 px/s), cycle 0.278 s = 1.1 H, 4/4 drawings every cycle, holds
  2×17, 3, 2×4. `game.foot_slide` n/a (skip: one planted drawing per step), 60 Hz in-hold slide 1.27 texels (dir 1).
- 1× read (`clip-game-1x.gif`, `self-game-1x-sheet.png`, `game-onion.png`, `gamespeed.png/.gif` next to v2): the whole
  figure bobs ≈ 3 texels on contact drawings and the white tail tip swings ≈ 10 texels between drawing pairs; one word:
  **skip** (a bouncy trot). Boots are only a 2–3 px dark flick under the hem at 1×: the gait is carried by bob + tail.
- Run (2·v): 4/4 drawings, but 60 Hz in-hold slide 10.3 texels (a 0.265 m leg cannot hold a plant over 0.7 m of travel
  per hold; same limit as frog/mushroom).

## r2 — critic-fox fixes (2026-10-16)
Every `owner: character` issue from `shots/critic-fox/` was fixed in `fox.js` and re-checked on 8-facing stills
(`shots/char-fox/g8.sh.js` renders with `at=0`, so a loop's `frame=f` IS key f — the r1 `g8-talk-f14` still was not the key
I thought) plus the full pack (`tools/charpack.sh fox --preset cast --raw`: **62 pass / 24 warn / 0 fail**, was 60/25/1).

| critic issue | fix in fox.js | evidence |
|---|---|---|
| talk:6/18 nod hides the face at dir 1/S | beat keys: chest+head pitch ≤ +2°, pos.y −0.045 bob, head ROLL ±4…14° toward the camera side, yaw −6…−16 (toward dir 1), ear flick, half-lid | `r2/finA-p1.png` (talk 6/12/18 ×8), `r2/finE-x3.png`, `r2/face-talk6-x6.png`, `r2/face-S-x6.png` (half-lid reads at S and SE) |
| whisper wink turns away, paw covers muzzle; glance ±28 shows the back of the head | glance ±15 (no neck twist); lean-in spine 8 / chest 4 / head −12 (face up), paw beside the muzzle; WINK = head [−14, −14, +18] (roll +, yaw −: toward the camera at dir 1), near (right) eye lid −0.7, paw dropped out to the side | `r2/finB-p1.png` (whisper 8/16/30 ×8), `r2/face-SE-x6.png` panel 4, `r2/whisper-1x-sheet-x4.png` f9 |
| tail = bunny puff, 0 px at SW, S thumbnail = moth | 0.70 m brush swept out to her right then curling back-up (centreline in `TAIL`), root 0.02 m further in; cream only on the last cone (≈ 17 %), tapering to r 0.035 | `sig.tailTip` px [31, 40, 46, 45, 37, 32, 8, 12] → **PASS 8/8** (was 0 at SW); `turnaround.png` S shows the orange brush beside the skirt; `turnaround-silhouette.png` S 25 % now has the big tail to the left (moth has none) |
| eyes 1-px dots at S | eye box 0.088 × 0.09, turned out 15°, 0.012 m proud of the lathe; EYE joint +0.03 m up | `r2/face-S-x6.png`: 2×2 dark eyes + glint at S; face_lit 90 % |
| gait contact invisible, run = walk | boots taller (top at the hem), toe 0.06 m forward, **leather-brown (wood slot)** so they read against the red hem; lift [0.08, 0.11]; run bob 0.11 (flight apex ≈ 4 texels above the walk's), lean 14, arms (tail swish) 60 | `r2/game1x-sheet-x4.png` (tan boots kick out under the hem on the swing drawings), `clip-run.png` / `r2/run-1x-sheet-x4.png` (high flight drawing with the tail swung forward vs low lean drawing with the tail streaming back) |
| die.foot_slide 3.44 FAIL, dark hem interior | f10 = the f6 buckle legs + hips (boots pinned), topple carried by spine/chest roll; DEAD has no boot on the ground; `hemSole` in cream (petticoat) | `die.foot_slide` **0.89 PASS**; `r2/dieA/clip-die.png` f22/f58 cream petticoat instead of the maroon disc |
| vote paw hidden at NE/NW/W | the MUG goes up (left arm `[40, 0, 125]`, hand rolled −100), `vote@handL`, body tilted away | `r2/finB-p0.png` vote:20 — mug beside/above the head at **8/8** facings; `r2/vote-1x-sheet-x4.png` sparkle at the mug |
| ear/skull speckle | ear base sunk (at y 0.38) and widened (w 0.12); inner-ear panel widened and joined to the dark tip | `isolated_px` fur S 9 → 5, max 9 → 8 (W); still WARN (see below) |

Unchanged / not fixable in my files: walk/run off_grid + flicker "legs only" (motion: plant re-pin per frame), turn.foot_slide
3.41 WARN (Character pivots planted feet), bake cell (tools prints "re-baking at 134" then writes 62×72).

## Unique to me — re-check after r2
1. Extra parts: tail swish routed from the gait still carries the rhythm (`r2/game1x-sheet-x4.png`: tip swings ≈ 12 texels
   between drawings at 1×, bigger than r1 because the brush is longer); ears keyed in every action (visible at dir 1 now that
   the face is no longer pitched away); mug raised in vote (new) and in the whisper finale.
2. Own gait: the boots now show (tan, under the hem) and the run has its own flight drawing; at 1× the walk reads as a
   bouncy skip with the tail swinging, the run as a bound with the tail streaming. Still no visible two-drawing plant
   (game.foot_slide n/a: legs ≤ 0.25 H, same as every robed chibi).
3. Expressions: 2×2 eyes at S/SE/SW; half-lid visible at dir 1 and S in talk; the wink reads at S and SE (near eye a
   1-texel lid, far eye open with glint); jaw open shows the dark mouth on talk 0/12.
4. Game-speed readability: game.readable PASS 3.95 H/s, cycle 0.278 s = 1.1 H, 4/4 drawings; talk beat every 6 frames
   (amplitude 53 %); vote up by f3 and held 1.1 s; die down by f14 (0.47 s), held 0.87 s; whisper glance/glance/lean/wink/mug
   6/6/14/10/10.

## Self-critique (r2)
| # | criterion | score | evidence |
|---|---|---|---|
| 1 | Silhouette | 2 | `turnaround-silhouette.png`: ears 8/8, big tail breaks the S/SE/NE/N/NW silhouette, tailTip 8/8 |
| 2 | Pixel stability | 1 | idle/talk/vote/die off_grid 0, deterministic; walk/run legs-only flicker (motion module) |
| 3 | Line quality | 1 | speckle 32, ear-junction specks remain at S/E/W (`turnaround-isolated.png`) |
| 4 | Tonal discipline | 1 | sig.fur hi/mid ≥ 0.88 8/8 but isolated fur max 8 (> 2) |
| 5 | Ground separation | 2 | all four sig_ground rows PASS (noon dH 84, golden dH 43, shade +20/+23 %) |
| 6 | Proportion / expression | 2 | 2×2 eyes, half-lid + wink read at S and dir 1 (`r2/face-*-x6.png`); head_frac 0.52 WARN |
| 7 | Animation timing | 2 | every key read on 8-facing stills (`r2/fin*-p*.png`), vote mug 8/8, single_frame 0, strobe ≤ 1, hold_redraws 0 |
| 8 | Weight / contact / game speed | 1 | game.readable PASS, die slide 0.89 PASS, boots visible; foot_slide n/a, run in-hold 10.4 |
| 9 | Personality / secondary | 1 | tail swish + run streaming, ears, mug toast; tail still rigid on turns (no chain) |
| 10 | Smears / FX | 1 | bubble, sparkle at the mug, die flash/dust in strips only; no 8-facing FX still |
| 11 | Facing / turns | 2 | turnaround 8/8, turn.off_grid 0 (45° steps × 2) |
| 12 | Technical | 2 | page_errors 0, draw_calls 2/1, deterministic, night_freeze/pan 0, RTX 4090 |

**Total 18 / 24** (unrun: 8-facing FX stills → 10 capped at 1).

## Touch-up (2026-10-16): Clocktower clips point / ghost / ghost-spent, gentle die
Evidence: `shots/char-fox/` (full pack `--preset cast --clips idle,walk,run,talk,vote,die,whisper,point,ghost,ghost-spent,turn
--raw`: **91 pass / 26 warn / 0 fail**, render-host RTX 4090), 8-facing stills `shots/char-fox/t2/{a,b,f,g,h}-x3.png`,
1× GIF frame sheets `shots/char-fox/t2/s-{point,ghost,spent,die,game}.png`, bake `shots/char-fox/bake/` (10 clips × 8 dirs,
cell 62×77, no border warning at 134).
- **Combat audit:** the only combat-flavoured item was the die's `hurt` flash + wide-eyed open-jaw flinch on f0 → replaced by
  a swoon (paw to brow). Talk / vote / whisper / walk are social; nothing is swung.
- **Ghost look (no shared code):** there is no per-clip tint in the look module, so every part on 15 part-bearing bones gets
  two pale copies built in `parts()` (`shells()`): on part-less child bones `g_<bone>` (ghost) and `s_<bone>` (spent),
  geometry baked at 1/1000 size (invisible in every other clip) and inflated by 0.006 m about its own centre (split
  surfaces skull/muzzle, skirt/apron, bodice/bib share their group centre). `GHOST(k, pose)` keys `<k>_<bone>.s` 999 (×1000),
  hides the boots (`footL/R.s` −1) and shrinks the living ears to 0.85 inside their shells (the thin cream ear panel peeked
  through at the tips; the ear shells compensate with ×1000/0.85). Shell bones keep the living part lines via
  `material.merge`. Palette +9 slots (gFur/gCream/gDress/gDark, halo, sFur/sCream/sDress/sDark) = 15 ≤ 16; bones 24 → 54 ≤ 64.
  Halo = flat gold disc 0.9 m above the head joint (ghost only, `ghost.islands` WARN 1→2 is the halo, intended); wisp =
  tapering hull under the hem trailing back (both sets).
- **Point at dir 1:** pointing straight ahead hides the arm at SE/S (it points at the camera, red sleeve on red bodice);
  turning the chest toward the target side (−16) + out 46° + arm raised to 112° puts the paw clear of the body on screen-left
  at SE/S and in profile at E/W/SW (`t2/f-x3.png`). N/NE remain partial (arm behind the head) — acceptable for a back view.
- **Module fixes re-check:** walk at game speed `game.readable` PASS 3.95 H/s, cycle 0.278 s, 1.1 H; boots show under the hem
  on the contact drawings, body at stand height (`clip-game.png`); the old `locomotion.bones.armL → tail0/mugHold` routing
  still works (tail swish carries the rhythm) and was kept.
