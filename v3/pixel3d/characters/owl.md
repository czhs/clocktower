# Archivist Hoot (cast `owl`) — design sheet

"Has read every ledger twice. Remembers who lied." Spec: `characters/owl.js`. Pack: `shots/char-owl/`, evidence
`shots/char-owl/self/`. Identity source (read only): `pipgws/packages/assets/scripts/cast/owl.ts`, `refs/cast/owl.png`.
Rendered on render-host (RTX 4090).

## r3 touch-up (2026-10-16, Clocktower game clips) — what changed
- **New clips:** `point` (shared emote), `ghost` (dead, ghost vote unspent: pale + halo), `ghost-spent` (dimmer, no halo).
- **Non-violent pass:** die f0 is a sway (no hit pose, no `hurt` flash); the emote snap puffs ledger dust (`puff@book`)
  instead of the weapon slash spark (`hit@book`). Vote/talk/idle/walk/run unchanged.
- **How the ghost is pale without engine support (no per-clip tint exists):** GHOST SHELLS. Each region's parts are
  copied in the ghost palette onto a shell bone at the region centre: Head (skull, cut disc/iris/pupil/glint, beak,
  mandible, tufts; + halo in `gh`), Chest (robe top, mantle, trim, ledger AND both wings, wings on own-centre copies),
  Hips (a new wisp TAIL: robe bell → pale-gold hem band → cone trailing 0.13 m back). At rest the shells are built
  × 0.2 deep inside their region (invisible); the ghost keys scale them × 5 (`gh*.s` / `gs*.s` = 4), so the copy (× 1.045
  head, × 1.05 torso, thin parts × 1.12–1.15 about their own centre) encloses the living body. 2 sets × 3 bones = 6 bones
  (41 total), 8 palette slots (14 total).
- **Leg-reach dip:** a hovering LOOP clip keeps IK legs; `character.js _solveLegs` drops the hips by its 0.1 m cap → the
  ghost `pos` carries +0.1. Feet scaled away (`foot*.s` −0.95).
- **Part-line ids:** with one shell bone per limb (66 (bone, slot) pairs) look.js `partTable` found no unique id multiplier
  and the LIVING idle lost 37 px of sleeve/robe inner lines; wings merged into the chest shell → 54 pairs, unique (m 160),
  `shots/char-owl/owl_pairs.js`.
- **A/B (same tree state):** the pre-r3 spec (`shots/char-owl/owl_r2.js`) vs r3: walk, game, run, talk, vote 0 px differ;
  idle/turnaround/turn/scene-golden 0 px vs the r3-base pack. (walk/run differ from the earlier `r3-base` pack only because
  shared code changed between the two renders — the old spec renders the same as r3 now.)
- Module fixes re-checked: walk at game speed 3.95 H/s, cycle 0.267 s, 1.05 H, 4/4 drawings, talons out under the hem on
  touchdown drawings at dir 1 (`clip-game.png`); hem/boot clearance fine.

## 0. Brief
- Concept: a round brown owl scholar in a navy academic robe, a thick ledger hugged to his chest with both wings; he
  waddles briskly, swivels his head to stare, and never forgets. Adjectives: **deliberate, meticulous, judgmental** →
  critically damped personality (body f 3 ζ 1 r 0, head f 4 ζ 1 r 0 — f 2.5 crawled the idle swivel back in 4 drawings), long holds (6–12 f) in actions, few keys.
- Body plan: **upright chibi, robed** (`chibi({ height 1.15 (head top), heads 2.0, legs 0.45, arms 1.0, shoulders 0.48 })` + keyed
  ear-tuft bones, feet only under the hem). The ref is upright and clothed (CAST §2/§6). `spec.bodyPlan
  'uprightAnimal'`. Locomotion: **LegGait `bird` plan** (walk = alternating WADDLE with body roll + head thrust; run = a
  two-footed HOP), wings = none (the arms hug the ledger in the REST geometry: LegGait carries the arms at rest).
- Game-speed arithmetic: H 1.28 m (v2 32 px → castHeight 1.28, top of the ear tufts), v_game = 3.95·H = 5.06 m/s,
  run 2·v = 10.1 m/s. Leg 0.18 m = **0.14 H** (hidden under the robe). Duty bound 2·0.6·0.14/1.15 ≈ 0.15 → stepping
  cannot plant for 2 drawings; CAST §8 hop/waddle-hop table (≤ 0.12). N 4 drawings × 2 grid frames, cycle ≈ 0.27–0.3 s,
  ≈ 1.1 H per cycle. The plant is one touchdown drawing per foot (LegGait β → 1/n), `legIK 'plant'` re-pins it per
  frame; `surge: false` (mushroom: the surge lurched the whole short-legged figure).
- Identity (ref facing): (1) blob = a ROUND head as wide as the robe with two ear tufts leaning OUT (S, SE, N: the
  1× strip reads "cat-ear ball on a bell"); (2) palette brown feathers + cream facial disc + navy robe + burgundy mantle
  + gold trim + amber eyes; (3) prop: thick brown ledger hugged in BOTH wings at the chest (front facings; side facings
  show the page edges); (4) face: huge amber eyes with dark pupils and a glint, inside two overlapping cream circles
  (the disc), a tiny dark beak; (5) v2 motion: almost none (1-px bob) → pixel3d adds the waddle roll, tufts, head
  swivel.

## Unique to me
(r2, after critic-owl 17/24 — re-checked on fresh renders in `shots/char-owl/r2/` and the r2 pack)
1. **Extra animated parts.**
   - Ear tufts (`earL0/earR0`): broad cat-ear PYRAMIDS (hull; outer edge starts on the skull side at y 0.40 and continues
     the head outline, inner edge from the crown, tip 38° out and 0.11 m back) → a triangle at E/W too, not an antenna
     (`r2/ta-a.png`, `r2/sil-owl-vs-moth-25-x2.png`). KEYED, not sprung (talk −15°, die −30…−45°, emote +10°). Both hang
     off a part-less crown bone `tuftRoot` that LegGait drives as its `neck` channel (`locomotion.bones.neck`), so in the
     WALK the tufts flick per drawing (pitch ±headBob, counter-roll ±6°) against the rocking head (`clip-game.png`).
     Rigid in the run (the bird hop branch drives only hips/spine/head — module issue).
   - Head swivel (owl tell): neck −30 + head −45 = 75° to his RIGHT in idle (f38, held 16) — face TO the camera at dir 1.
   - Ledger: `book` bone on the chest + `bookLid` hinge; own brown slot (`dark`, v1 #7a4326) so it separates from the
     burgundy mantle. Emote: lifted, opened 150°, twisted −60° so the pages read at S/SE/E (`r2/g8-remember-f18-x3.png`;
     N/NE/NW still edge-on/hidden), snapped shut with a spark. VOTE: hoisted ABOVE the tufts on the right wing's fanned
     primaries (see 4).
   - Eyes close by SCALE: iris/pupil/glint (cut from the head surface, coincident) ride `eyeL/eyeR`; a recessed closed-eye
     patch (cream + 1-texel dark ∪ lash arc, 0.009 m inside, 25 % wider than the hole) shows when the eye collapses
     (`eye*.s` −0.97). Blink idle f62–66 (4 frames), slow blink emote f28, squint = `eye*.s` y −0.55 (amber slits),
     shut in die. No proud lids → no goggle ring (`r2/g8-idle-f56-x3.png`, `r2/blink28-x6.png`, `r2/sq34-x6.png`).
   - Brows `browL/R`: hidden in the skull at rest, popped out by `.p` (vote raised; emote stern).
   - Beak: lower mandible (hull 0.09 × 0.045 × 0.075) drops 0.06 m + 30° on the open keys and uncovers a burgundy mouth
     block under the upper beak → ≈ 2 texels of red at S/SE (`r2/talk-open-vs-shut-x6.png`).
   - Talons: long tan feet (0.27 m) whose toes peek out of the hem at rest (v1) and stick out on every touchdown drawing.
   - FX: speech bubble, 3 vote sparkles at `bookTop` (the raised ledger), die feather + wisp + dust ring, ledger-dust
     puff on the emote snap (r3: no hurt flash, no slash spark — Clocktower-only rule).
2. **My locomotion: a waddle (walk) and a hop (run).** LegGait `bird`: walk = alternating steps, robe roll ±12°, head
   rocking (the neck channel now drives the tufts, so the head rocks ±0.8·headBob), bob 0.03 m; run = two-footed hop
   0.2·H, lean 14°. Measured (r2 `report.txt`): 3.95 H/s, cycle 0.267 s / 1.05 H, 4/4 drawings, holds 2×23. Talon
   visible on each touchdown drawing at dir 1 (`clip-game.png` f3/f5/f11/f13…, `r2/cgame1x-sheet.png`). `foot_slide`
   still n/a (one plant drawing per step), 60 Hz in-hold 4.71 (walk) / 12.14 (run). One-word read at 1×: "waddle".
3. **Expressions in the new style.** Amber irises ≈ 6.5 texels with 2×2 pupils + glint cut out of the head surface.
   Closed = dark ∪ lash arc on cream (reads at S/SE/SW/E at 1×), squint = narrow amber slit, vote = brows up + chin up,
   talk = beak drop with a burgundy flash + head roll/yaw (nod ≤ +2° chest, 0° head), die = shut + tufts back.
4. **Game-speed readability.** Walk: robe + head rocking + tuft flick + talon flick per drawing. Talk: beat every 6
   frames (amplitude 38 %), right wing out to [40–55, 0, 85–105] (visible screen-left at dir 1 and at S). Vote: dip 3
   frames → ledger hoisted above the tufts at f3 (clear of the tuft tips at 8/8, `r2/g8-vote-f3-x3.png`), held 0.8 s.
   Die: down at f18, held 1.07 s. Emote holds 6–12 frames.

## Proportions (vh 10, 36 px/m) — measured
| | m | texels |
|---|---|---|
| total (tuft tips) | 1.28 | 41 (N) – 47 (E), S 43 (`height_px`) |
| head (chin 0.54 → crown ≈ 1.1), width | 0.54 × 0.60 | 19 × 22 (head_frac 0.505) |
| tufts | 0.26 | ≈ 6 above the crown |
| robe (hem 0.05 → shoulders 0.56), width | 0.51 × 0.57 | 18 × 20 |
| ledger | 0.25 × 0.26 × 0.11 | 9 × 9 |
| iris / pupil / glint | ≈ 0.18 / 0.08 / 0.04 | 6.5 / 2–3 / 1 |
| leg (hidden) | 0.18 = 0.14 H | — |

## Palette (5 slots + accent) — as in code
feather `#C69568 / #A2744E / #8E6E74` · disc `#FFF0D2 / #EED8B0 / #B49C98` · robe `#5C68A4 / #434D86 / #3C3A62` (r2:
toward v1 navy) · mantle `#C45C6C / #943A4C / #64304A` (mantle, mouth flash) · dark `#9A6040 / #74432A / #4C3042` (r2: v1
ledger brown — ledger cover/spine, beak, mandible, pupils, closed-eye lash) · accent amber `#FFD77A / #F0A22C / #A8643A` (irises, hem, robe edges, mantle trim, cuffs, ledger emblem).
r3 ghost shells: ghost `#EEF4FF / #C2D4F2 / #9AA2D2` (head + robe + wings) · ghostDisc `#F4F7FC / #E4ECF8 / #BAC2E0` ·
ghostRose `#F2D8EE / #D6B6DC / #A890C0` (mantle, ledger) · ghostGold `#FFF0BC / #F0D488 / #BCA67A` (eyes, trim, halo); spent
(dimmer): spent `#AEB8D6 / #8C98BE / #6A729C` · spentDisc `#C8D0E4 / #AEB6D2 / #868EB0` · spentRose `#BCA8C8 / #9E8CB0 /
#766A8C` · spentGold `#D6CC9E / #B8AA7E / #8C8268`. Ghost pupils + beak use the navy `robe` slot.
Signature `['disc', 'feather']`, faceSlot `disc`. Measured sig_ground (r2): noon-sun dH 94, noon-shade dL +19 %, golden-sun
dH 48, golden-shade dL +22 % (all PASS; feather sh lifted #7E6064 → #8E6E74 after golden-shade read +7 %).

## Dynamics (= code)
personality body f 3 ζ 1 r 0, head f 4 ζ 1 r 0; chains none; character quant yaw 8 / chain 4; legIK default 'plant'.
locomotion: plan bird, walk 5.06 / run 10.11 m/s, cycleTime [0.3, 0.267], poses [4, 4], lift [0.026, 0.051], bob
[0.03, 0.035], roll [12, 4], headBob [10, 6], lean [6, 14], hop [0.154, 0.256], wings [], surge false, bones { neck: 'tuftRoot' }
(r2 workaround: LegGait ignores clips.walk, so the tufts ride its neck channel).

## Timing charts (30 Hz grid; step interp) — as in code (r2)
- idle (loop 72): f0 A · f20 breathe (held 18) · f38 swivel 75° right (held 16) · f54 A · f62 blink (`eye*.s` −0.97, 4) · f66 A.
- talk (loop 24): f0 beak OPEN (jaw 30° + drop 0.06), chin up −10, head yaw −12 roll −8, right wing out [40,0,85], tufts −15
  (`speak`) · f6 shut, head roll +8 (no nod) · f12 OPEN, wing [55,0,105], head yaw −16 · f18 shut, roll −6.
- vote: f0 dip (3) · f3 VOTE_UP: body tilted left 8+8+10°, right wing up [15,0,160] / fore −90 / hand +30 (fanned primaries
  pointing up), ledger hoisted (`book.p` [−0.6, 0.8, −0.15], twisted −15° so the cover faces S/SE), brows up
  (`vote@bookTop`) · held (repeat f30).
- die (legs fk, r3 non-violent): f0 SWAY — lids heavy (`eye*.s` y −0.55), head droops 14° fwd / 12° roll, tufts sag −25,
  wings slacken, one feather drifts (`flap@wingTipR`; no `hurt` flash) · f6 buckle, eyes shut · f12 topple · f18 down
  (`die`, `land`) · f20 bounce · f24 settle → held to f60.
- remember: f0 look down · f6 ledger lifted + opened (book −45°/−60° twist) · f18 60° swivel stare · f28 slow blink (eye scale)
  · f34 squint (eye y −0.55) + stern brows · f42 SNAP shut (`puff@book`: ledger dust, r3 — was the weapon slash spark) · f50 idle.
- point (r3, one-shot): f0 cock — dip, right wing pulled back, squint + stern brows (4) · f4 POINT — right wing straight out
  along [−0.9, 0.4, 0.25] (out to his right and up; chest yaw −20, solved by `shots/char-owl/owl_point_solve.js`, segment
  errors ≤ 1.3°), head turned −32 along it, beak OPEN, brows stern, tufts back −12 (4) · f8 beak shut + squint, held 24 (0.8 s)
  · f32 idle. Reads at S/SE/NE/N/NW/W/SW; at E the wing is behind the body (`r3/g8-point-x3.png`).
- ghost (r3, loop 80, dynamics hold): pale shell set `gh` + halo; hover pos +0.38/+0.44 (= 0.28/0.34 m after the 0.1 m
  leg-reach dip) on 20-frame holds: f0 low, tail swings right (hips roll +6, spine −6) · f20 high, head roll 8 · f40 low, tail
  left, head swivel 60° (neck −25, head −35) · f60 high, swivel held, roll −6. Feet scaled away (`foot*.s` −0.95).
- ghost-spent (r3, loop 96): dimmer set `gs`, no halo, hover 0.22/0.28 m, chest +4 and head hung +12…14, 24-frame holds,
  swivel 45° at f48/f72.
- turn: 45° steps held 2 grid frames.

## Lights
None.

## Self-critique (r2, after critic-owl 17/24)
Evidence: full pack `--preset cast --raw` on render-host RTX 4090 (65 pass / 19 warn / 0 fail), `shots/char-owl/r2/`:
8-facing stills `g8-vote-f3-x3.png`, `g8-idle-f56-x3.png` (blink), `g8-remember-f{18,28,34,42}-x3.png`, `g8-talk-f{0,6,18}-x3.png`,
zooms `blink28-x6.png`, `sq34-x6.png`, `talk-open-vs-shut-x6.png`, `back-x6.png` (E/NE/N/NW skull), `ta-a/b.png`, `parts-x6.png`
(look=parts), `cgame1x-sheet.png` (1× game GIF frames ×2), `sil-owl-vs-moth-25-x2.png`; bake `out/sprites/owl-preview.png`.

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | cat-ear tufts as wide-based triangles at S/N and a wedge at E/W (`ta-a.png`, `sil-owl-vs-moth-25-x2.png` vs the moth's curled stalk) | — |
| 2 | Pixel stability | 2 | idle/talk/vote/die/remember off_grid 0, flicker 0; walk/game flicker WARN 11 (1 same-pose frame), run specks 1; pan 0, night 0 | — |
| 3 | Line quality | 1 | silhouette_line 0, no lid rings; the near tuft's base still draws a 2–3 px mauve tick where it sits proud of the skull side at E/NE/NW (`back-x6.png`; `parts-x6.png` shows it is the near tuft, not the skull) | tuft on the head bone (loses keyed tufts) |
| 4 | Tonal discipline | 1 | isolated_px disc max 5 (SE), feather iso ≤ 14; robe now navy (#5C68A4 hi); ledger brown separates from the mantle at S | fewer subdivided cut-out pieces at the disc edge |
| 5 | Ground separation | 2 | sig_ground noon dH 94 / +19 %, golden dH 48 / +22 % | — |
| 6 | Proportion / expression | 2 | closed eyes = ∪ lash arcs at S/SE/SW/E (`g8-idle-f56`, `blink28-x6`), squint slits, beak opens ≈ 2 texels with red at S/SE | — |
| 7 | Animation timing | 2 | vote raises the LEDGER above the tuft tips at 8/8 (`g8-vote-f3-x3.png`), single_frame 0, final_hold 0.8 / 1.07 s | — |
| 8 | Weight / contact / game speed | 1 | 3.95 H/s, 0.267 s, 1.05 H, 4/4; talon drawn on touchdown drawings (`clip-game.png`); foot_slide still n/a, in-hold 4.71 / 12.14 | plantable feet (module) |
| 9 | Personality / secondary | 2 | tufts flick per walk drawing (neck channel), swivel, ledger pages at S/SE/E, expressions read | tufts in the run (module) |
| 10 | Smears and FX | 2 | vote sparkles on the raised ledger, snap spark, bubble, die FX | — |
| 11 | Facing and turns | 2 | `clip-turn.png` 45° steps × 2 frames | — |
| 12 | Technical | 2 | page_errors 0, draw calls 2/1, deterministic, RTX 4090 | — |

**Total 21 / 24 (self).** Weakest: (1) tuft-root ticks at E/NE/NW; (2) disc speckle; (3) contact still only one drawing per
step (foot_slide n/a), run tufts rigid. The vote ledger floats a few texels above the fan tip at N/NE (no hand grip).

### r3 addendum (game clips) — evidence
Full pack `--preset cast --raw --clips idle,walk,run,talk,vote,die,remember,point,ghost,ghost-spent,turn` on render-host
RTX 4090: **108 pass / 18 warn / 0 fail** (warns = the r2 set: disc speckle, walk/run foot_slide n/a, micro; plus
`colors/slot` listing spentRose:1 = the tone classifier assigning one living px to the new nearest slot — the idle
turnaround is 0 px different from the pre-r3 spec). New rows: point off_grid 0 / flicker 0 / pose_read 22 % ×4 /
key_speckle +0; ghost off_grid 0, amplitude 23 %, key_delta 81 %; ghost-spent off_grid 0, amplitude 25 %, key_delta 71 %.
Looked at: `r3/g8-point-x3.png` (f0/f4/f8 × 8 facings), `r3/g8-ghosts-x3.png` (ghost + spent × 8 facings: wisp tails,
halo only on `gh`, no brown poking through), `r3/point-1x-sheet.png`, `r3/ghost-1x-sheet.png`, `r3/gs-1x-sheet.png`,
`r3/die-1x-sheet.png` (1× GIF frames + durations: point held 800 ms; ghost 6 × 0.67 s; spent 5 × 0.8 s; die no flash),
bake `out/sprites/owl-preview.png` (10 clips × 8 dirs, cell 176 → 84×81, no border warnings at the final cell).
Known limits: the ghost is a CLIP, so a ghost that walks/talks/votes plays the living clips (module issue: per-state
costume/tint); point is hidden behind the body at E; ghost eyes don't blink (the shell has no eye bones).
