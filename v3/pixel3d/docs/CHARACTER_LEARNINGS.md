# Character learnings

Every agent that builds or critiques a character adds its lessons here before finishing. One bullet per lesson:
**symptom → cause → rule**, with numbers. Put the bullet in the matching TOPIC section below (not in a per-agent
section). If the lesson is already there, extend that bullet (add your character's numbers and mark it
**(recurring)**) instead of writing a new one. Don't delete others' entries; if one turns out wrong, correct it in place
and say who corrected it and why. Shared-code problems go into **§Module backlog** at the end, not into the topic sections.
Rules marked **(recurring)** have bitten two or more characters and are also enforced in `docs/CHARACTER_PLAYBOOK.md`.

Tags in brackets name who found it and on which character, e.g. `(critic-keeper-r2)`. Evidence folders:
`shots/char-<name>/` (authors), `shots/critic-<name>[-r<n>]/` (critics), `shots/{look,fx,motion,tools,lead-integrator}/`
(module owners).

Contents: Score history · Silhouette and signature shapes · Proportions and geometry · Palette, tones and ground
separation · Look / shading rules · Props and held objects · Poses and actions · Timing and holds · Locomotion and feet ·
Secondary motion (chains, personality) · Smears and FX · Night, lights and emissives · Quadrupeds · Measurement and tools
· Process · Body plans · **Module backlog** (priority list at its top) · Integration · Archives (wave-1, wave-2 and wave-3
per-agent notes, consolidated; do not append there).

## Score history (critic scores; ship bar 19/24)

| character | author self-score | critic r1 | critic r2 | ship | what the critic found that the author missed |
|---|---|---|---|---|---|
| wanderer (reference) | 21 | 16 | — (fixed by lead, not re-scored) | — | dir 4 smear, E/NE scarf siding, x1 holds in the log, face tone samples |
| hound (quadruped) | 20 | 15 | 18 | no | smear at dirs 1/4, face at dir 0, signature vs grass (sun AND shade), tone counts, hold settle redraws |
| keeper (robed + lantern) | 19 → 18 (r2) | 14 | 17 | no | prop on the face at SE (r1) then E (r2), hood unmeasured, beard 76 % shadow, hold settle redraws |
| duelist (fencer) | — | 16 | 19 | yes (at the bar) | hat = cone, plume at the scene facing (witch hat), smear edge-on at dir 6, parry invisible at SE, hold redraws |

Cast wave 1 (8 cast members, run 05, 2026-10-16; latest critic round per member, none shipped):

| cast member | author self (last) | critic (last) | gap | what the critic found that the author missed |
|---|---|---|---|---|
| frog (Sir Croaksworth) | 20 | 18 | +2 | mouse-ear skull at S/N, tall E/W column, 5-stripe torso, sword at boot level in the gait, sheet ≠ code |
| owl (Archivist Hoot) | 18 | 17 | +1 | proud eyelids = goggles, vote sideways not up, E/W tufts = moth antenna, no talon contact |
| moth (Lumen) | 19 | 16 | +3 | lantern 0–3 px in the walk, vote not raised, antennae re-snap 104 px in the vote hold, glide gait |
| skeleton-chef (Bones) | 17 | 16 | +1 | face = moustache at S/SE, toque/skull merge in golden sun, props hidden at dir 1, emote masked by FX |
| fox (Ginger) | 17 | 15 | +2 | talk nod hides the face at dir 1, wink turned away, tail tip = cotton puff, 1-px eyes, glide gait |
| mushroom (Brother Morel) | 15 | 15 | 0 | r2 regression: floating boots in flight drawings, face under the brim at SE, sheet ≠ code |
| crow (Mortimer) | 15 | 15 | 0 | shovel fused into the coat at 8/8, vote shovel crosses the hat at dir 1, value drift (tan hat) |
| goat (Magistrate Billings) | 14 | 15 | −1 | the story prop (evidence sheet) shares the brass slot → invisible at 7/8, staff tipped by the gait lean |

**(recurring, 8/8 cast)** Wave-1 scores 15–18 (bar 19). The gap shrank from 3–7 (run 04) to −1…+3: the Stage 7 table
works. What still cost points on EVERY cast member (all promoted to the playbook as **R** lines): (1) the gait reads as a
glide at 1× — no visible contact on short/robed legs (8/8); (2) the vote does not raise the silhouette (owl, moth, crow,
fox, skeleton-chef, frog); (3) the face is hidden at dir 1/S in talk/emote keys by a head pitch or a paw (fox, owl,
mushroom, moth, skeleton-chef); (4) the identity prop or story prop disappears at some facings or in the walk (moth,
goat, crow, skeleton-chef, frog); (5) the design sheet is stale versus the code after the fix round (frog, mushroom,
moth, owl, skeleton-chef); (6) loop-clip key stills showed the wrong key (`frame=` offset, 7/8).

**(recurring, 4/4 characters)** Self-scores are 1–6 points above the critic's. Every time, the misses were at a facing
the author did not render (usually the pack facing dir 1 or a side facing), in per-facing tone counts, in the scene crops,
or in raw-diff redraw counts — never in `report.txt`. The playbook's Stage 6 evidence list now forces all four.

Cast wave 2 (7 cast members + nicksong skipped by the user, 2026-10-16; critic r1 per member, none shipped):

| cast member | author self | critic | gap | what the critic found that the author missed |
|---|---|---|---|---|
| mole (Old Delve) | 17 | 16 | +1 | hammer gone from the blob at E/W/SW, face unreadable at dir 1, one boot at S (pogo), tap spark on the ground |
| green-hood (Wisp) | 16 | 16 | 0 | glow fills the void at SE/SW, no face at E/W, purple shade = Storyteller, capsule silhouette, vote = 3×3 knob |
| honk (goose) | 16 | 16 | 0 | die reads SITTING (neck up), vote hidden behind the neck at W, chinstrap hidden under the beak, 105 px last-key pop |
| chonk (Chonk) | 16 | 16 | 0 | contact drawings bury the feet, one-sided bob (limp), rear snowman + dark tail hole, dust = eggs |
| rabbit (Clover) | 16 | 15 | +1 | boots through the dress in every hop drawing (own evidence contradicted the sheet), goggle eye at breath keys, far-eye nub |
| snail (Tinker Pell) | 16 | 15 | +1 | tinker wrench hidden behind the gear (4 keys = 1 drawing), walk = 1 distinct drawing of 4, shell slivers at S |
| toad (Toadley) | 14 | 14 | 0 | mushroom-cap head (no eye bumps above the crown), hue moved off v1 olive to pass sig_ground, satchel below the soles |

**(recurring, 7/7 wave 2 — lead merge 2026-10-16)** Wave-2 scores 14–16 (bar 19), below wave 1 (15–18); gaps 0…+1, so
self-scoring is now honest — the misses are now at facings/keys the CRITIC's checklist forced and the author skipped. What
cost points on most members (each promoted to a playbook **R W2** line): (1) **an identity part leaves the silhouette at
1–3 facings** — hammer at E/W/SW, vote prop behind the neck/head at W/E, shell at S, face at E/W (mole, honk, toad,
snail, green-hood, rabbit; 6/7); (2) **eyes/face fail at 3/4 and profile or at non-rest keys** — proud eyes poke out of
the lathe contour, glints become goggles on breath keys, glow fills a void, the jaw is a wedge (rabbit, chonk, green-hood,
mole, honk, toad; 6/7); (3) **consecutive keys render the same** — four wrench turns, a 2-px wink, a 0–2 px squint, walk
drawings that differ by 1–2 texels (snail, toad, mole, chonk talk; 4/7); (4) **contact drawings show no feet or the wrong
feet** — boots through the skirt, feet buried by squash, one boot at S, satchel through the ground (rabbit, chonk, mole,
toad, honk; 5/7); (5) **identity hue/value drift to pass a check** — toad olive → tan, rabbit/chonk white → peach in golden,
green-hood green → purple in shade (4/7); (6) **rear and die facings** — snowman/ball backs, sitting die, face rolled away
(chonk, green-hood, honk, toad). Also: 6/7 wave-2 module notes still called M1/M3/M5 open — they were rendered before or
during the mid-run module fix (merged ≈ 12:37 the same day; M1 verified on fox, `shots/modfix/ev-M1-fox-authored-walk.png`).
Wave 3 starts from the fixed modules: re-verify before working around them.

Cast wave 3 (8 cast members, 2026-10-16; critic r1 per member, none shipped; authors then ran a fix round whose notes
are in the wave-3 archive):

| cast member | author self | critic | gap | what the critic found that the author missed |
|---|---|---|---|---|
| polly (parrot) | 14 | 15 | −1 | no point/ghost clips, beak = round knob (S/N capsule), λ glyph specks, wings = navy baton, die sits at S |
| clarabelle (cow) | 15 | 16 | −1 | vote card edge-on at SE/E (sheet said 8/8), pig in golden, die hops up mid-fall, 2nd hoof gesture hidden at SE |
| requin (shark) | 15 | 16 | −1 | lit "dark" eye = X-eye, grin lost its maroon, shrug hides the face, rigid beret, no point/ghost |
| progress (frog-like) | 15 | 15 | 0 | croc maw at SE / dark band at E/W, grin chatters per step, sleepy eyes, pennant edge-on, step emote hops in place |
| preservation (frog) | 18 | 15 | +3 | vote placard = AXE at 1×, E/W thumb head, rigid hop shows no legs, pupils become letter glyphs |
| opal (otter) | 15 | 16 | −1 | "cyclops" profile (an ear read as the eye), nose = open O mouth, emote punchline = a talk key, tail = 3rd leg at N |
| cilantro (giraffe) | 16 | 15 | +1 | neck vanishes at S in the walk, scarf end trails under the hoodie, mauve shade = llama, seated low drawing |
| mincut (red panda) | 16 | 17 | −1 | ringed tail hidden at S/N, vote arm = 1.95× twig, white mask speckle, die sits at W/SW, snip = T-pose |

**(recurring, 8/8 wave 3 — lead merge 2026-10-16)** Wave-3 scores 15–17 (bar 19), one point above wave 2; gaps −1…+1
except preservation +3 (an E/W profile and the vote at E/W never judged). What cost points on most members (each promoted
to a playbook **R W3** line and, where it is a porting habit, to `docs/CAST_PORTING.md`):
(1) **game clips missing** — point / ghost / ghost-spent were not authored by 7/8 (only polly r2 and a partial progress
point): the playbook's cast-clip table and the charpack `--preset cast` list omitted them, so `cast_clips` PASSed (FIXED by
the lead: table + preset + check now require them; run is optional);
(2) **flat held things edge-on at the game facing** — vote card (clarabelle), pennant (progress), placard (preservation),
wing paddles (polly), fin (requin), stretched arm (mincut): 6/8; two of them (preservation placard = axe, polly wing =
baton) read as a WEAPON at 1×;
(3) **die reads as sitting / standing at 2–3 facings** — polly S, opal S/SW, mincut W/SW, preservation S/N, progress lump
at N/NW/W, clarabelle hops up mid-fall: 6/8 (W2: honk) — a body lying along one axis foreshortens at the facing that looks
down it;
(4) **S/N 25 % blob is generic** — capsule/two-bump box matching other cast (polly, progress, preservation, opal, mincut;
clarabelle at E): 6/8; depth (beaks, snouts, tails straight back) never changes the S outline, only WIDTH does;
(5) **face fails at E/W or in talk** — profile eye mid-skull / ear read as eye (opal), thumb head (preservation), mouth band
(progress), plain ball (clarabelle); mouth 0–2 texels in talk (opal, cilantro, requin), lit-"dark" eyes, sleepy eyes, pupil
glyphs, mask speckle: 8/8;
(6) **emote punchline does not read** — equals a talk key (opal), T-pose (mincut), hop in place (progress), hand invisible
(preservation), second action behind the body at SE (clarabelle), face hidden (requin): 6/8;
(7) **shadow tone lifted with a hue step** — mauve/plum/pink/lilac sh (cilantro, mincut, polly, opal, clarabelle): 5/8;
`sig_ground` passes either way, only the eye check on the scene crops catches it.
Process: 4 agents ran a zsh loop that did not word-split (renders silently became idle:0), 3 ran `python3` on the Mac by
mistake (no-ops). Shared code: 5/8 hit the fx speech-chain first-beat gap, 2/8 the charcheck `isl[0]` crash — both FIXED
by the lead (Module backlog, "lead, between waves 3 and 4").

## Silhouette and signature shapes

- (char-mincut) **A side-swept tail on a big-headed chibi hides at the game facing.** Mincut's ringed tail (root on the
  hips, sweeping to her LEFT) was invisible at SE (dir 1) in three layouts: rising behind the head (the 0.58 m head
  covers everything above y 0.67), sweeping forward round her left side (her left-back projects straight away from
  the SE camera). What showed at 8/8 (`shots/char-mincut/self/t-mark3.png`, `&mark=<tail parts>`): a C that goes BACK
  first (z −0.32) and only then up/out (x ≤ 0.26, top ≤ 0.5 m over the root) — SE gets a ≈ 4-texel strip at
  screen-left, S/N/E/W/SW the full ringed curl. Rule: at dir 1 her left-back is the depth axis; a tail must extend
  along −Z (or above the head) to show there. Use `mark=` on the tail parts at 8 facings before tuning shape.
- (char-mincut) Round ears leaning out ≥ 30° project ONTO the side of the head at E/W/NE/NW (camera pitch 30°): the
  white rim + dark centre read as a goggle/eye patch mid-head. Ears at ≈ 17° lean, base narrow and sunk, face yaw 10°
  → only a white tick on the crown at E. Check E/W at ×5 for any part reading as a second eye.

- (lead, wave-2 merge) **(recurring: mole, honk, toad, snail, green-hood, rabbit; extends the wave-1 prop bullets)** An
  identity part that is fine at S drops out of the 25 % blob at 1–3 facings: mole hammer behind the body at E/W/SW (then
  mole ≈ toad at SW, ≈ skeleton-chef at E), honk vote board behind the neck at W, toad scroll behind the head at E, snail
  shell = 2–3 texel slivers at S, green-hood face 0 eye px at E/W. Cause: any FIXED horizontal offset lines up with the view
  axis at two facings. What worked (mole r2): lift the prop head to shoulder/crown height so at the hiding facing it is on
  the FAR side and pops above the head (30° camera: depth shows as height), and twist the prop 20° on its handle (a T, not
  an end-on square) → 7/8; honk r2: move the raised board up-and-BACK and yaw it 25–30°. Rule: an 8-facing key-green
  silhouette ROW of every held key (`shots/char-mole/mole_g8s.py.js`) and the 25 % line-up at all 8 facings, not only S/SE.
- (lead, wave-2 merge) **(recurring: green-hood, toad, chonk; extends "cap over bell" below)** Capsules and domes are the
  cast default: green-hood hood width = hem width → capsule (mole/toad/owl family), toad low wide dome → mushroom cap, chonk
  N/NE/NW = snowman (head sphere on a ball, no nape). Rules: hem flares wider than the head mass (green-hood r 0.30, exp 1.35
  — r 0.315/1.7 read as a saucer); a species bump (toad eye bumps) stands ≥ 2 texels above the crown at S — and at S the top
  of a head is its BACK rim (screen-up = y·cos30 − z·sin30), so lower the crown's back rings rather than only raising the
  bumps (toad r2); a peak leans SIDEWAYS (0.12–0.18 m) as well as back or it projects onto the hood at N/NE/NW; rear views
  get a nape/collar on the HEAD bone (same bone + slot: no part line) and a light-topped tail, never a dark end cap facing −Z.
- (lead, wave-2 merge) **(recurring: honk, chonk, positive)** One shape nobody else has (honk's thin neck on an egg,
  chonk's ball) is the most distinct blob in the cast at 25 % — it beat every surface-detail fix. Look for it in Stage 0.

- (lead, wave-1 merge) **(recurring: frog, owl, moth, goat, crow)** E/W side facings collapse into a column + spike: owl
  tufts and moth antennae became one 1–2 texel vertical spike (owl ≈ moth at 25 %), the frog skull a tall mint column,
  goat ≈ keeper (robe + staff column). Cause: frontal-plane accessories (paddles, fronds, horn loops) have no depth.
  Rule: every accessory that carries identity has ≥ 0.1 m depth in z or a back lean so E/W shows a triangle/loop; frog
  heads wider front-to-back than tall (snout wedge); line up E/W at 25 % against every finished cast member, not only S.
- (lead, wave-1 merge) **(recurring: crow, mushroom, fox)** A cap/hat over a bell body is the cast's default blob: crow ≈
  mushroom at 25 % (cap over bell, told apart only by the staff), fox S ≈ moth S. Rule: the identity prop or a side
  shape (tail, beak, shovel) must break the bell outline by ≥ 3 texels at S AND N; name the closest look-alike honestly.
- (lead, wave-1 merge) **(recurring: crow, mushroom)** A staff/shovel kept close to the body fuses into the silhouette
  (crow 8/8, hidden at N/NE/NW; mushroom star inside the cap outline at W/NW/SW). Rule: long props stand ≥ 3 texels
  clear of the hem/outline at all 8 facings (rest `out` ≈ 35–40°, or the socket slid outward) and the tip (star, blade)
  clears the cap/hat top by ≥ 3 texels at every facing.
- (critic-frog) Round top bumps on a tall lathe skull read as mouse ears at S/N. Frog: flatten (height ≈ 0.8 × width),
  eye bumps at |x| ≈ 0.24 so they break the side outline.

- (lead, wanderer) A box hat read as a square in the 4 frontal/side facings; an 8-sided lathe (flat face to +Z) reads
  as a lens in all 8. Rule: signature shapes that must read from every yaw are lathes/frustums with n = 8, not boxes.
- (lead, wanderer) Widening the hat crown hid the hat band (band r 0.185 < crown r 0.19 at that height): the hat became
  a featureless dome. Rule: re-render the turnaround after EVERY shape change; a band must not disappear under its neighbour.
- (critic-wanderer, lead) Grey specks on the lit hat were inner lines: crown-over-brim depth steps of one lathe flickered
  around the threshold and drew a dotted 1-px staircase (7–12 isolated px per facing). Fixed by geometry: ONE convex
  profile (r 0.33 → droop to r 0.29 at 0.035 → straight cone to the apex at 0.21) cut into three lathe bands that share it
  exactly (brim / red band / top), all tilted about ONE pivot (pre-transform with `K.xf`; per-part `rot` turns about each
  part's own centre and opens seams). Result: `isolated_px` 0–1, 0 red px inside the hat with `outlineDebug=1`. Rule: colour
  trims on a CONVEX signature are bands of the same surface, never a shell 0.01 m proud of it; no facet < 1 texel (0.03 m).
  Side effect: a shallow cone (31° slope ≈ the 30° camera pitch) shows the back half of the band above the apex, so the band
  reads as a full ring.
- (critic-duelist-r1, duelist r2) The convex-profile rule produced a CONE when the shape's read is concave: the tricorn
  loft (rim scale 1 → crown 0.42 at y 0.15) was a party hat / toadstool and matched the wanderer's kasa at 25 % from S/N/SE.
  What read at all 8 facings: 3 brim WALLS as convex hulls (per half-edge: corner → dipped edge middle, outer + inner shell
  0.035 m apart) rising outward from an inset triangle (scale 0.78) around a LOW crown frustum (0.095 m; corners 0.10 front /
  0.17 back). Front corner LOW, back wall tallest: at 30° pitch a triangle-plan hat shows its plan from behind (the far front
  point projects 0.25 m higher than the back corners). Walls at a 45° slope rendered all-hi; steeper walls (inset 0.6 → 0.78)
  gave a lit top / shaded front split. Rule: CONCAVE signatures (cocked brims, crowns, horns) are ≥ 2 parts meeting with a
  deliberate ≥ 0.03 m step; same-slot hulls on one bone draw no inner line between them (look's part ids = bone × slot).
- (duelist r2) A 1-texel trim band (0.035 m) on the signature gave isolated_px 5–6 (stair-stepped lace); 0.05 m → max 3.
  Rule: trims on a signature ≥ 0.05 m (≈ 2 texels).
- (critic-duelist-r1, duelist r2) **(recurring: duelist plume, keeper hood)** The second half of a two-part signature is
  the half that gets lost. Duelist: the plume shared the cream slot with the hat wall + trim + sleeves and drooped (dir y
  −0.12, gravity 0.3) → invisible at S/N, a flat tag merging with the brim at E/W; same-slot lace + plume merged at the root.
  Keeper r1: hood a mid-brown dome NARROWER (0.48 m) than the mantle (0.56 m), no peak → from E/NE/N/NW a brown boulder; the
  spec's `signature: 'beard'` meant no check measured the hood. Keeper r2 fix that worked: cowl 1.14 × mantle with a peak.
  Rule: each part of a two-part signature has its own slot or a value step ≥ 15 % L / hue ≥ 30° from what it touches; a hood
  half-signature is the widest head-level mass (≥ 1.1 × mantle) with a peak ≥ 3 texels or a dark rim band; an accessory half
  (plume, feather, flag) breaks the silhouette upward in ≥ 6/8 facings at 25 %. Check both halves by eye on the 25 %
  thumbnails at 8 facings (charcheck measures one slot only).
- (critic-duelist-r2) The plume fixed in the turnaround still failed at the GAME facing: at SE (dir 1) it stood vertical
  behind the crown → hat + plume = a pointed witch hat in all six scene copies; upward break at only 4/8 facings. A straight
  chain pointing up reads as a candle/obelisk. Rule: a vertical accessory on a pointed shape leans ≥ 35° off screen-vertical at
  dir 1 (sideways or back) so it never continues the crown's line; judge it in `scene-*-crop.png` at dir 1, not only the turnaround.
- (critic-hound-r2) The hound read lamb/goat rather than hound: 0.16 m snout, box skull, leaf ears standing up; from S/N a
  featureless tall block. Rule: the species read lives in the profile head (snout ≥ 0.20 m with a slight drop, ears lower and
  tilted out); check the 25 % thumbnails at S/N as well as E/W.

- (char-mushroom) Spots on a convex dome signature (amanita cap): separate spot parts proud of the cap ring every spot
  with an inner line. What worked: one 12-sided lathe, in-plane subdivided to 0.04 m (coplanar pieces → toon shading
  unchanged), pieces whose centroid direction falls inside a spot cone moved to a second geometry in the spot slot —
  coincident surfaces, 0 red px inside the cap with `outlineDebug=1`, `sig.cap` hi/mid 0.91–0.95 at 8/8, isolated ≤ 3.
  Rule: patterns on a convex signature are cut out of its own surface, not added on top.

- (char-green-hood) **A face opening on a round hood must sit on a FLAT front, not on a plate.** A flat tan disc in front of a
  lathe/hull hood stuck 2–4 texels out of the outline at SE/SW (a "satellite dish"). Clipping the hood hull points at z = zf
  (`Math.min(z, zf)`: still convex) gives a flat oval front; a 0.012 m proud rim ring + a void disc 0.01 m behind it read as a
  recessed opening at S/SE/SW (`shots/char-green-hood/r2..r4`). Two emissive slots on one eye bone drew an inner line
  through each eye ("‖") — one slot per eye. The rim must be darker than the glow (tan #D8B67A vs #FFF0A0) or the eyes merge
  into the ring at SE.
- (lead, wave-3 merge) **(recurring: polly, progress, preservation, opal, mincut, clarabelle E; extends the wave-2 line-up
  bullet)** S/N 25 % blob matches other cast → depth features (beak hook, snout, a tail straight back) project INTO the
  figure at the 30° camera (forward depth = screen-down: polly's hook 0.1 m forward landed on the chest) → put WIDTH at
  S/N: tail root ≥ 0.15 m out to the side curled up beside the hip under the head (mincut r2: 6/8 facings out of the
  outline), wing tips/crest, a scarf end past the body edge; line up S AND N. A tail swept 40° to the RIGHT stays visible
  at SE (polly r2); one swept LEFT hides behind the head at SE.
- (lead, wave-3 merge) **(recurring: opal, preservation, progress, clarabelle)** The E/W profile is a separate design
  problem: mid-skull eye = cyclops (and opal's "eye" was actually a low side EAR — check with a part-drop variant), two
  eye bumps = a tall thumb (the far bump sits ≈ 7 texels higher at E/W), mouth gap = a dark band round the head, ears
  at 45° back = a plain ball. Rules in playbook Stage 0 **R W3 profile face**.

## Proportions and geometry

- (lead, wave-1 merge) **(recurring: fox, owl, skeleton-chef, frog)** Planned 2×2-texel eyes render as 1-px dots or a
  1-px far sliver at S/SE (fox `turnaround-isolated` flags both eyes; skeleton-chef far socket 1 px at dir 1). Cause: eye
  boxes < 0.08 m sunk into an 8-sided lathe face. Rule: eye box ≥ 0.08 m, proud of the lathe surface and turned ≈ 15°
  out so 2×2 survives at S/SE/SW; check the eyes on the idle S/SE/SW ×6 crop, not the plan.
  **Corrected by the lead (wave-2 merge):** "proud and turned 15° out" on an 8-sided lathe put the FAR eye outside the head
  contour as a 2×3–4 texel dark nub at 3/4 and profile (rabbit at SE/E/NE/SW/W/NW, chonk NE, honk "!" specks at E/N/NE).
  Rule now: 16-sided head lathe, eye joint ON the head surface, box turned to the local surface normal, front face ≈ 0.006 m
  proud (flush z-fights into a hollow ring) — or cut the eye out of the skull surface on eye bones (owl r2, honk). Eyes above
  the head's equator stay visible further round the back at 30° pitch: plan NE/NW at the design stage (chonk). Check the
  8-facing idle still at ×8 for nubs at E/W/NE/NW, not only the S/SE/SW crop.
- (lead, wave-2 merge) **(recurring: rabbit, green-hood, mole, honk, toad)** The face passes at the rest pose and fails at
  another KEY or facing: rabbit's 1-texel glint became a 2×2 cream box ("goggles") at breath keys f36/f56/f108 at SE/SW
  (a 1-texel body shift re-rasterises a 3×4 eye); green-hood's talk "tall" eyes and emote flare filled the void into a pale
  disc (and proud eye boxes did so at SE/SW even in idle); mole's 3×1 squint couldn't squint further (LISTEN/SHUT beats
  0–2 px); honk/toad talk keys pitched the face away at S/SE. Rules: glints ≤ 0.024 m, flush in the eye corner (stays 1
  texel); void faces keep glow ≤ 35 % of the opening at S/SE/SW — convex bead eyes centred ON the void front, express by
  y-squint and eye-bone roll (never scale a bead eye in x: dark 1-px column, look backlog); when the rest face is already a
  squint, put the expression into a ≥ 30° head cock + a hand gesture. Render an 8-facing still of EVERY idle and talk key.
- (lead, wave-2 merge) **(recurring: rabbit, toad, honk)** Hinged jaws/chins on small heads read as wedges: rabbit's fur chin
  at 30° = a mauve beak/cigarette, toad's 28° jaw hidden under the dome at SE, honk's chinstrap hidden under the beak at S
  (a protrusion shades ≈ its length × tan 30° below it). Rule: talk = a ≤ 15° lower-lip opening that shows a 2×1 dark mouth
  floor under a real snout, plus a ≥ 25° hand/ear beat; face marks below a beak/snout wrap ≥ 2 texels below its silhouette.
- (lead, wave-2 merge) **(recurring: rabbit; wave-1 hound)** A muzzle-less profile is a ball with a lump: rabbit snout
  0.12 m. Snout/muzzle ≥ 0.2 m with a slight drop for any animal whose v1 E/W shows a nose bump.
- (lead, wave-1 merge) **(recurring: frog, fox, owl)** Same-slot parts on a parent and a child bone (ear/skull, eye
  bump/skull, tuft root/skull) draw a dotted inner line or 5–11 isolated px at the junction (fox fur 11 at S, owl
  inverted-V on the back of the skull at E/NE/NW). Rule: sink the child's base ≥ 0.02 m into the parent hull and widen it
  so the junction is one region; check isolated_px per facing at ×4. (No same-slot merge exists yet: §Module backlog look.)
- (lead, wave-1 merge) **(recurring: goat, fox, mushroom)** A rigid bell robe/skirt shows its hollow dark hem opening when
  the figure lies down (goat die S/N, fox die dir 1 maroon interior) and its swing boots float as detached squares
  outside a short hem (mushroom r2). Rule: every bell hem gets a sole disc in the robe-shadow slot (`hemSole`); boots
  either stay inside the hem radius in every gait drawing or are joined to it by a dark shin part.
- (rig, chibi) **(recurring: fox, owl, mushroom, skeleton-chef)** On a 2.2–2.5-head chibi a raised paw/wing cannot clear
  the head: shoulder 0.55 m + arm 0.31 m < 0.84 m head centre (fox); owl head 0.6 m wide over 0.49 m shoulders. Rule: the
  vote raises a PROP (mug, ledger, lantern, baguette, shovel) ≥ 0.3 m above the crown, never the bare limb.

- (lead, spike) Chamfered 8-sided limb prisms at 60 px/m lit every crease with a cream edge highlight → striped limbs.
  Rule: limbs and small parts are plain boxes or 4–6-sided frustums; convex-edge chamfers only on big masses.
- (rig, mannequin) Arms in the torso's slot vanished in front/3/4 views (arm only ≈ 3 texels outside the torso edge).
  Rule: arms/forearms in a slot that differs from the torso by hue or ≥ 15 % value; shoulder joints ≥ 0.04 m outside the
  chest half-width.
- (rig, mannequin) Profile looked like a plank: torso depth 0.21 vs width 0.32 → profile area 0.60 of the front. Rule:
  torso depth ≥ 0.72 × width, feet ≥ 0.22 m long; 8-facing silhouette areas min/max ≥ 0.6; height 46–50 texels at 30° pitch.
- (rig, mannequin) Side hair locks reaching forward of the head's centre plane covered the cheek in 3/4 views (1-texel
  face). Rule: side locks / hood sides end at z ≤ 0.01 m of the head; the face shows ≥ 4 texels wide at 3/4.
- (rig, kit) `bend()` only moves vertices: an 8-vertex box shears instead of curving. Rule: bent shapes get bands
  (`K.box(w, h, d, {segY: 3-4})`); each band is one flat facet.
- (hound) Moving the moss cap "down 0.05 m" sank it INTO the body: kit lathes/hulls are bbox-CENTRED, `at` is the middle
  of the dome. Rule: place lathes/hulls from their centre = rim + h/2; re-render after every placement change.
- (critic-keeper-r1, keeper r2) A full-width dark face opening above a beard read as a visor/sunglasses. Fix that worked:
  arch hollow (narrower on top, beard filling the bottom), ≤ 60 % of the hood width, a 1–2 px nose highlight.
- (critic-keeper-r2) A back-sliding cowl put the face hollow ON the silhouette edge at SE/SW (beard poking out sideways
  like a beak); hood ≈ 40 % of the height with a 4×7-texel face at its bottom read as an onion dome. Rule: at 3/4 facings the
  face centre sits ≥ 3 texels inside the hood outline; the face sits in the middle third of the hood, not at its bottom edge.
- (critic-duelist-r2) A twisting chest exposed a thin hips sash as a dotted line (4–5 isolated crimson px at dir 1 in the
  parry). Rule: bands on a bone that twists against its neighbour are ≥ 0.07 m tall, or move with the twisting bone.
- (duelist r2) Chain parts oriented with `K.xf(box, { rot: [pitch, yaw, 0] })` (Euler XYZ: yaw first, then pitch about world
  X) pointed along the chain only for near-horizontal chains; pointing up (66°) the links turned sideways → stair stripes at N.
  Rule: build chain parts as `K.hull` of points along the link's own unit direction u with perpendiculars b = u × X, n = u × b.
- (duelist r2) Curved chains: after `biped()` overwrite each link's `axis` and `pos` (pos of link i = dir(i−1) × link
  length); the chain dynamics read per-link rest directions from the bones, so the curve holds and still swings.
- (keeper r2) A wide cowl over the chest gave 30–50 single-pixel 60 Hz specks in walk/run in the shaded chest (r1's narrower
  hood: 0); mantle, clip, part lines and `selfShadow:0` A/Bs changed nothing. Rule: big overhangs cost walk/run stability; keep
  them ≤ torso width + 0.1 m or accept the WARN (module backlog: look/lighting).
- (lead, wave-3 merge) **(recurring: opal, preservation, progress, polly, requin)** Face details at 44–60 px: eye slot hi
  ≤ #4A4258 (lit lilac = X-eye, requin); pupil 1×1–1×2 on a fixed texel in the darkest tone (2×2 in a 4×4 lens became
  letters, preservation; half-covered disc = sleepy, progress); a 4×2 dark nose reads as an open O mouth (opal: 2×1 nose
  up on the pad); a modelled-open mouth stays on the front face, ≤ 0.12 m deep, sides closed with skin hulls (progress
  croc maw); on a chibi pad a scaled mouth plate (`mouth.s` [0.25, 1.9, 0]) opens 2–3 texels where a 14–26° jaw shows ≤ 1.
- (lead, wave-3 merge) A chest glyph (polly's λ) built from proud boxes re-rasterises into specks every walk drawing and
  makes a dotted line edge-on: CUT the glyph out of the subdivided surface (2-texel strokes, inset 1 texel from the
  edge) — one stable glyph at 1×, nothing at E/W.

- **Spiky bodies as ONE generated surface (char-theo-rem, 2026-10-16).** 37 separate spike hulls on an ellipsoid drew a
  dot-and-dark-line texture (isolated_px 47, `shots/char-theo-rem/r1/z6.png`); a lat/lon grid on the ellipsoid with a
  4-sided pyramid per cell (apex out along the normal + back lean, each face cut at 0.62 into body + tip, coplanar) gives
  a jagged outline at 8/8 with no part lines (isolated 39 → still the cream tips facing the camera at N). Rules: no
  half-cell ring stagger (chord mismatch = cracks) — skew the APEX of odd rows instead (kills the waffle grid at N);
  make the pole cap plain (12 converging tips = a cream disc). Recolour regions by splitting the same surface.

## Palette, tones and ground separation

- (char-preservation) **Blue characters pass the sun copies on hue but the SHADE copy only counts L** (dH 118 is ignored):
  skin sh `#44549A` rendered −9 % vs grass shadow `#3B6D5F` (WARN); lifting sh to `#6474B8` (v1 mid `#5A8CC8` kept) gave
  noon-shade +18 %, golden-shade +21 %. Cost: mid→sh only ≈ 8 L* apart, so the shading is soft. Fewer ellipsoid latitude
  rings (6 → 4) on the body/haunches cut signature isolated px from 12–21 to 5–14 per facing.
- (char-preservation, wide heads) **(recurring: toad, mole)** A talk/vote hand raised beside a 0.69 m chibi head is hidden at
  the SE pack facing: the head's diagonal hides ≈ 0.31 m to the screen-left. Gesture BELOW the jaw (hand forward-out
  at chest height) or with a long prop.

- (lead, wave-2 merge) **(recurring: toad, green-hood, rabbit, chonk; extends the wave-1 value-drift bullet)** Identity
  colour traded for a check: toad re-hued v1 olive → tan to pass `sig_ground` (critic: reads bread-loaf/mushroom; frog then
  owns "green"); green-hood's green slot with a mauve-navy sh (h 144 → 240) turned the whole figure deep PURPLE in pillar
  shadow = the Storyteller's reserved identity. Rules: keep the signature hue within ≈ 15° of v1 (and every tone of a slot,
  incl. sh, in that hue family) unless the user approves; get ground separation from VALUE — toad r2 kept olive and passed
  by L (hi #8E9446 −28 % under lit grass at noon and golden, sh #3E4634 −28/−30 % under grass shadow; leave 3 % margin,
  −25 % WARNs); green-hood r6 sh #3B4739 (L 0.25) passes noon-shade at −28 %. No deep purple on any player.
- (lead, wave-2 merge) **(recurring: rabbit, chonk, skeleton-chef, goat)** Golden sun maps any near-white to apricot
  (≈ #EFBD7D–#F0BE7B vs golden grass #B6AB4F: dH 23–25), so white cast members stop reading white. "Cooler"/greyer hi did
  nothing (chonk #F3F1F5, rabbit #F6F2FF). What passed: push the hi toward MAGENTA (R and B up, G down) — rabbit hi #F8E8FF /
  mid #DECCF4 → #F1B889 = dH 34 PASS. A look-side cap is in the backlog. Measure the lit sun copy (sig_ground golden can
  sample a shade colour, T3).
- (lead, wave-2 merge) Snail: peach/pink-peach skin (h ≈ 18–25°, `#FFDCC4/#EBA88E/#A4707E`) beat cream for separation from
  lit grass AND an orange shell; a DARKER shell sh (#623A48) fixed golden-shade (−9 % WARN → −29 %), a lifted sh did not.

- (lead, wave-1 merge) **(recurring: crow, owl, skeleton-chef, moth)** Identity drift in VALUE from v1: lifting tones for
  the night rule turned the crow's dark undertaker hat tan (#B48456) and coat pale mauve, the owl's navy robe periwinkle
  (#7480B8), the skeleton-chef's navy shirt periwinkle (#6474A8), the moth's near-black eyes purple. Rule: lift only the
  `sh` tone for night; keep `hi`/`mid` at the v1 value (compare the 1× S crop against `refs/cast/<id>.png` side by side).
- (lead, wave-1 merge) **(recurring: goat, owl)** A story prop in an existing slot vanishes into the body: goat's evidence
  sheet in brass (= horns/trim) visible at 1/8 facings; owl's ledger in the mantle slot merges with the mantle at S.
  Rule: the emote's story prop gets its own slot (parchment, v1 brown) with ≥ 15 % L / 30° hue from what it touches —
  this may exceed "5 slots + 1 accent"; a story prop counts as a second accent (lead ruling, goat).
- (critic-skeleton-chef) **(recurring with keeper golden notes)** In golden sun a near-white mass and a cream mass merge
  (toque #F4C381 vs skull #EFBA6E, dL 0.05) and a white mass is only ≈ 17–20° off golden grass: the golden grade caps
  near-white near L 0.75. Rule: two-part signatures need a VALUE step between the halves that survives golden (drop the
  darker half to a cooler grey-cream); measure the lit sun copy yourself (charcheck sig_ground can pass on a shade colour).
- (critic-mushroom) Cap sh ≤ the night floor goes nearly black in shade; lift sh one step and keep noon-shade ≤ −25 % or ≥ +15 %.

- (look) Ground separation needs NO rim or outline (none in any t3ssel8r shot). What carries it: (1) the big slot's SHADOW
  tone is warm/mauve (e.g. #4A3432, #946C72) against the cool teal grass shadow (#3B6B5A noon, ~#2E4F4E golden, ~#1D3340
  night) — same value is fine, the hue difference reads; (2) the signature stays the lightest mass in shade; (3) golden
  back-light makes the figure a dark silhouette on bright olive grass (refs/chars/07). Night is weakest: main slot sh ≥ ~#3A3040.
- (critic-duelist-r1) The navy coat (sh #2A3558) sank into the night pillar shadow; lifting it toward mauve-navy (#3A3A5E)
  fixed it in r2. Confirms the night rule above.
- (tools) charcheck colours/slot is a nearest-tone (Lab) estimate: shadow tones of different slots are near-identical
  desaturated purples (skin sh #9C6E78 vs hair sh #AE9FA8), so 7–9 per slot partly come from neighbours. Rule: shadow tones
  of different slots differ by ≥ 20° hue or ≥ 15 % value. Small dark parts are over-counted too (hound basalt 14, duelist
  dark/plume/steel 9) — trust ×4 crops for tone counts.
- (critic-hound-r1, hound r2) **(recurring: hound cap, duelist brim)** The signature can be camouflaged by the biome, and
  the golden grade is where it happens. Lime moss hi #E6EE80 on lit meadow #BADA81 = 18° of hue; at golden #E0BD4E on grass
  #BEAE4F (same hue). The golden grade multiplies by ≈ (1.0, 0.8, 0.55) (`#B4F4C0` → `#B0C169`): any light colour with high
  red collapses toward the golden grass hue (h 51–54). LOW-red mint `#94FCCE` → `#93C76F` h95 at golden (41° off), h154 at
  noon (68° off). Night (teal ground h184) separates by value only. Duelist r2: the crimson brim walls fell into hat sh
  #6C2A4A at golden, so only the crown read crimson. Rule: the signature differs from LIT grass by ≥ 30° hue or ≥ 25 % L at
  noon AND golden, measured in `scene-*-crop.png` (not the palette); ≥ 50 % of signature px hi/mid at golden.
- (critic-hound-r2) **(recurring: look's ground rule, hound r2)** Fixed in sun, the signature vanished in SHADE: in the
  pillar-shadow copy moss rendered #3F5F7F — darker than the stone sh #595573 it sits on and equal in value to grass
  shadow #3B6D5F (golden: #38486D vs #4B4065) → one navy blob. Rule: the signature's sh tone is at least as light as the
  body's sh and ≥ 15 % L over grass shadow, keeping its hue off the teal grass-shadow hue (163°); measure the shadow copy.
- (critic-hound-r1, hound r2) A top-facing dome signature is ONE tone from above (cap ≈ 90 % hi; SE 83 hi / 0 mid) and
  shrank to 17 px at S. What worked: a skirt band of the same profile coloured `[mid, mid, sh]` (no new tone) → 2–3 tones in all
  8 facings, isolated_px ≤ 2; a moss patch on the skull raised S px 20 → 44. Rule: a top-facing signature needs a facet break
  > 35° from horizontal or a mid/sh band, ≥ 2 tones at 30° pitch, ≥ 40 px in every facing.
- (critic-hound-r1, critic-keeper-r2) **(recurring: hound ears, keeper beard)** An accent or signature can render mostly in
  its SHADOW tone and nobody notices because every check passes. Hound ears: lichen sh #9A4E58 on 55–68 % of the px → dark
  maroon horns. Keeper beard (the signature's "lightest mass"): SE noon 47 sh px (#9F99B2) vs 15 hi/mid = 76 % shadow, E
  27/9, W 26/13 → lavender-grey beard, hood hi lighter than it. Cause: faces turned from the sun (N·L) — plus far-half
  forcing for the sided ears; the midline beard was pure N·L. Fixes: hound ears' leaf face 72° toward up + `sides` 'mid' →
  ≥ 77 % hi/mid in all 8 facings. Rule: count hi/mid vs sh px of the signature AND of colour-identity accents per facing at
  noon; want ≥ 50 % hi/mid in ≥ 6 of 8 facings. Fix by tipping faces up/toward the sun (widen the top, slope sides out) or
  lifting the sh tone (≥ L 0.25), not by retuning light.
- (refs, run 05, cast prep) The camouflage rule above will hit six cast members by default: their v2 main colours
  (`refs/cast/_stats.json`) sit on the meadow hue — frog `#7EB759`, progress `#88B75A`, greenting `#7BAB6F`, toad
  `#989A5F`, green-hood `#617A4A`, rabbit dress `#4C7A44` vs grass mid `#75A558`. Seven more have near-black masses that
  only read in v2 because of its 1-px outline (nicksong hair `#221E2F`, honk neck `#37323C`, polly tee `#282335`, requin
  beret `#1E2130`, crow coat `#4A4A5C`, storyteller void `#07040C`, porter hood `#3A3438`); pixel3d characters have no
  silhouette line. Rule (CAST_PORTING §5): keep the colour family but move greens to low-red jade/mint or high-L
  chartreuse and make the non-green part the signature; lift near-blacks to ≥ `#3A3040` sh with a ≥ 15 % L step to their
  neighbours; measure both in the six scene copies before Stage 3.

- (char-rabbit) **(recurring: skeleton-chef, keeper golden notes)** A white fur signature turns peach in golden sun
  (fur hi #F7EFE2 → #F0BE7B vs golden grass #B6AB4C: dH 23, dL +16 %, `sig_ground golden-sun` WARN) while noon sun (dH
  109) and both shade copies (+49 / +54 %) pass. Lifting the hi does nothing (the grade caps it); only a cooler/greyer mid
  or a darker neighbour (the jade dress) separates it. Also: eyes in the boots' slot rendered BROWN (the slot's hi lit
  them); a tiny `eye` slot (#5C4A64/#2E2436/#3A3040) fixed it — eyes need their own near-black slot or a dark slot
  whose hi is still dark.

- (char-progress) **(recurring: toad, progress)** v1-green cast vs the meadow: a LIGHT chartreuse (#E2F49A hi) rendered only
  +12 % L over lit grass (lime on lime) and went yellow in golden; the v1 VALUE (hi #6A9C34, mid #528630, sh #324A3E,
  hue 89 ≈ v1 95) renders −29 % L under lit grass at noon AND golden and −28 % under shade: sig_ground 4/4 PASS
  (`shots/char-progress/pA,pB,pC` A/B via a palette URL param in `wv.js`). For green cast: go DARK on the v1 value, not light.
- (char-progress) `K.lathe` is bbox-CENTRED: a profile from y 0 to 0.16 placed at `at` spans at±0.08. Wrap it
  (`K.xf(K.lathe(p), { at: [0, (ymin+ymax)/2, 0] })`) to keep profile y bone-relative; a pale belly patch that conforms to
  the 8-gon lathe faces (points at r·cos22.5/cos(θ−k·45°) + 0.006) shows no box outline and can wrap ±80° so green arms
  read against it at S and at E/W.
- (lead, wave-3 merge) **(recurring: cilantro, mincut, polly, opal, clarabelle; extends the W2 identity-hue bullet)** Lifting
  `sh` with a hue step (mauve #A47C70 on tan, plum #7C2A46 on red, pink-drift russet, plum fur, lilac hide hi) passes
  `sig_ground` but reads as another animal in the pillar-shadow copy (giraffe → taupe llama, panda → salmon) → lift VALUE
  along the slot's own v1 hue (cilantro #B27C42, mincut #B86A4C raised noon-shade +15 → +27 %); eye-check the shaded
  copies, the check cannot see it (backlog T27).
- (lead, wave-3 merge) **(recurring: clarabelle, requin; W2: rabbit, chonk)** White hides/bellies go peach at golden →
  `material.whiteKeep` 0.7–0.8 + a neutral hi (clarabelle #F2EEF0 stayed white); whiteKeep does NOT act on px raised by a
  slot `lift` (requin; backlog look) — lower the lift (0.18) and use a cool/magenta mid. A pink snout still goes salmon.

## Look / shading rules

- (look) The outline stub `outline: 'char'` fell back to FLAG_FULL (unknown keys default to FULL) → dark silhouette line
  on grass. Rule: characters use `characterMaterial` (FLAG_CHAR): character pixels test only FLAG_CHAR neighbours (inner
  lines), world pixels treat FLAG_CHAR as depth-only. Verify with `?outlineDebug=1`.
- (look) Far-half shadow per PIXEL split the hair cap and chest into a half-dark wedge. Rule: force only L/R bones, per
  bone; midline bones keep normal lighting. The 2 frontal facings pick the side turned from the sun (|dot| > .25).
- (look) Forcing the far side to L = 0 keeps form because the shadow tone still gets the shadow definition (N·L < −0.45
  one step darker) and hemi; the far limb drops exactly one band. A t3ssel8r near-black far arm (refs/chars/01 #082020)
  comes from a dark sleeve slot, not a darker far band.
- (look) Per-pixel cloud shadows cut a 50-texel figure into lit head / shaded body at cloud edges. Rule: `cloud: 'root'`
  (default) evaluates the cloud once at root + 0.5 m. Shadow-map shadows stay per pixel.
- (look) Test shadow casters: `colorWrite:false, depthWrite:false, castShadow:true` is invisible but casts. Layer tricks
  don't work (r170's shadow pass tests object.layers against the MAIN camera).
- (critic-wanderer, look) The wanderer's face was the skin sh tone #976670 in every facing (brim shadow-map shadow);
  tilting the hat 14° back did NOT help. A fixed 0.4 m bias lit the face but the brim still shaded the chest. Fix (look):
  `selfShadow: 'hull'` biases each pixel to where its sun ray leaves the character's own cylinder → face_lit S 0.67, SE 0.50,
  SW 0.38. Rule: a dark face under an overhang is look's job; don't tilt the hat.
- (look) Walk/run "self-shadow specks" had two causes: the self-shadow (fixed by the hull exemption: walk specks 52 → 15)
  and outline.js's light-aware line strength reading the shadow map bilinearly (one collar px 149 → 153 → 160/255 per frame).
  Rule (in code): FLAG_CHAR line colours take no shadow-map term.
- (lead, wanderer) Even with held drawings a travelling figure shows 4–7 isolated px per frame where its own self-shadow
  edges fall: root snaps to screen texels, the shadow map to its own grid. charcheck counts ≤ 8 upper-body px/frame as specks
  (WARN). A static figure under a whole-texel pan is 0 px (critic-wanderer), so specks appear only while the root travels.
- (critic-wanderer, look) **(recurring: wanderer scarf, keeper staff, duelist rapier, hound ears)** Parts flip value with
  facing because of how look sides bones. Scarf rooted at x 0.05 m was sided L by position → wine in E/NE, orange elsewhere.
  look then changed the rule: the NAME decides (…L/…R(+digits) sided, else the nearest sided ancestor, else midline;
  `sides: {bone: 'auto'}` restores the positional test). Consequence: props under `handR` (rapier, staff, lantern) are R →
  far-forced at N/NW/W/SW (`look=far`: magenta blade/staff). Workaround: `material.sides { handR: 'mid', lantern0: 'mid' }`
  (also un-sides the hand; the forearm stays sided). Rule: render the turnaround once with `look=far`; magenta only on limbs.
- (look) Same-part inner lines: the normal pass writes FLAG_CHAR + a part id (dominant bone × palette slot) and outline
  lines only different ids. A minimum depth step (0.06 / 0.10 m) did NOT remove dots and cost 5–40 % of body lines (rejected).
  `?look=parts` shows the ids.
- (look) A geometry attribute added in `material.onBeforeRender` is never bound (three caches the VAO before it). Rule:
  per-mesh data found at render time goes into uniforms, or the attribute exists before the first render.
- (rig, lead) Every characterMaterial instance compiled its own program; now `customProgramCacheKey` derives from
  GLSL-affecting options (8 wanderers + smear + fx = 5 programs). Never create materials per frame.
- (rig) Test-scene lighting: camera yaw 45° + noon relAz 25° shows face 0's shadow side; `_test-rig` uses yaw −45°.

- (look r05) **Signature light mass / face in the shadow tone** (keeper beard 76 % sh at SE, wanderer face_lit 47 %,
  duelist 59 %) is now look's job, not the author's: `sigLift` (default 0.3 = mid band) keeps every non-down-facing face
  (world N.y > −0.35) of the `spec.signature` slots/parts at L ≥ 0.3 from N·L alone; `faceLift` 0.3 does the same for
  `spec.faceSlot` (else /skin|face/) on the head bone and its children. Cast shadows and cloud still darken them (keeper
  pillar-shadow copy unchanged), undersides keep their sh tone (form). Measured (noon turnaround, hi/mid share S..SW):
  keeper beard 0.66/0.30/0.37/0.56/1.0/0.91/0.42/0.84 → 0.66/0.92/1.0/1.0/1.0/1.0/1.0/0.86; face_lit wanderer 47 → 94 %,
  duelist 59 → 83 %, keeper SW 0.33 → 1.0; hound moss 0.86–0.99 → 1.00. Rule: animals with no skin slot set
  `faceSlot`; a second light mass (keeper hood, a belly) goes in `signature: [..]` or `material.slots {belly: {lift: .3}}`.
  Don't tip geometry toward the sun to fix tone share any more — check `?look=opts` (yellow = lifted).
- (look r05) Held props: a (bone, slot) pair on a bone BELOW a hand bone (lantern chain, prop bone) or on the hand bone
  reaching > 0.2 m from the hand joint (blade, staff) is a prop → lit by N·L, never far-forced (`props: 'mid'`
  default). Wanderer blade at W/SW: dark far-blue → lit steel; the hand and forearm stay sided. The `sides {handR:'mid'}`
  workarounds (keeper, duelist) still work and can be dropped. Caveat: birds/hoppers name their wingtip/front paw `hand…`:
  a paw/feather part on `hand…` longer than 0.2 m would count as a prop — opt out with `material.slots {x: {side:'sided'}}`.
  Check `?look=opts` (cyan = prop).
- (look r05) "Walk/run specks 25–50" on the keeper were NOT self-shadow: raw 60 Hz diffs at equal pose ids show the
  lantern glass flicker (glow tones on engine `uTime`, 7.5 Hz) plus robe/leg redraws. Rule: before blaming shading, diff
  raw frames with equal `p` and look at WHERE (scratch tool: diff aligned by the logged root px, magenta montage).
- (look r05) Shadow snapping. With `selfShadow: 0` a travelling wanderer had 48 speck frames per walk (283 flicker px):
  the figure lands at a new sub-texel phase of the shadow-map grid every whole-screen-texel step. Shifting only the
  LOOKUP did nothing (961 → 979 px): the caster is rasterised at the old phase. Shifting caster (customDepthMaterial,
  `onBeforeShadow`) and lookup together by the same < 1 shadow texel → 0 speck frames. `shadowSnap: true` is default;
  with the hull exemption it is a safety net (characters near casters, mutual shadows, selfShadow 0).
- (look r05) Material hints for animals (`material.hints {slot: 'fur'|'feather'|'scale'}`): a per-cell L offset in BIND
  space (rides the part, so it never crawls while travelling) that turns the band terminator into tufts (fur: 7×12 cm
  columns, ±0.13 L), scallop rows (feather: 8 cm rows, darker lower edge) or fine rows (scale: 5.5 cm). Visible only where
  a facet's L is within ~0.13 of a band threshold, so it needs round (lathe ≥ 8 sides) bodies; on boxy faceted bodies
  (hound) it does almost nothing. Cost in isolated px (owl test body, dir 1/2): none 10/3, fur 12/5, feather 17/12,
  scale 21/15. First cells of 0.05 m / ±0.2 L were noise (1-px flecks all over the hi band). Rule: opt-in, judge at 1×,
  shots/look5/h1-zoom.png is the reference.

## Props and held objects

- (char-preservation) **Glasses on a frog = a RING, not a disc, on the head bone.** A dark disc behind a white disc (frog
  r3's rimmed eye) turns into a black lens when the white is squashed for a blink; a 12-box ring (`K.merge` of boxes round
  the circle, hole in the middle) on the HEAD bone + white/pupil on `eyeL/R` keeps the glasses rigid while the eye blinks /
  shuts inside it. Tilted lenses (26°) need the white disc ≥ 0.06 thick and the eye joint ≥ 0.025 proud of the bump front,
  else the bump covers the upper half of the white (it read as a "U" at S). Rims peeked over the crown at N until the eye
  bumps rose ≥ 0.05 m above the rim tops in the from-behind projection (screen-up = y·cos30 + z·sin30); a skin brow filler
  between the bumps hides the bridge from behind and keeps the notch. Temples: short, hugging the bump side — a long temple
  down to the skull side read as a crack/stick at E/W.
- (char-preservation) **Vote prop with no v1 prop:** a story placard (τ = "my type") authored at 4 % inside the fist and
  shown by `sign.s` 24 only in the vote (toad scroll trick) clears the crown by ≈ 12 texels at S and ≥ 6 at 8/8 with a
  0.64 m stick (`shots/char-preservation/g8-sil-vote.png`); the card is edge-on at E/W (stick only) — yaw the card 30° if
  that matters.
- (char-preservation) **Chibi arms (0.32 m) cannot reach the own face (≈ 0.47 m from the shoulder).** "Push the glasses
  up": tilt the head 20° toward the hand (lowers the side rim ≈ 0.13 m) and stretch the forearm (`forearmR.s` [0, 0.7, 0])
  so the hand ends just OUTSIDE the rim (x −0.47, z 0.26); a hand aimed at the bridge ended inside the skull and was
  invisible at 8/8 (`g8-invariant-f14.png` before/after). Same blue as the head → subtle at 1×.

- (lead, wave-2 merge) **(recurring: rabbit, toad, green-hood, honk; wave 1 6/8)** The vote prop still stops at ear-base /
  2–4 texels over the crown or hides behind a wide head (rabbit bouquet, toad 2-texel scroll "candle", green-hood 3×3 mitt,
  honk board behind the neck at W). Working techniques, pick one: (a) per-clip props — a prop bone kept at scale 0 by a
  `HIDE` spread in every key of every OTHER clip incl. gait keys and `breath()` (green-hood lantern: pose_read 13 → 20 %),
  or authored at 1–4 % scale and keyed `<bone>.s` = 1/k − 1 in its clip with the stowed copy at `.s` −1 (toad, snail);
  (b) reach — `forearmR.s` 1.4× lengthens reach and enlarges the prop (rabbit; bent rest forearms snap to a FWD axis: forearm
  [−60, 0, 60] + hand −90 points up), upperArm out 120–150 + hand out +40 on a 0.67 m head (toad); (c) ride a body-mounted
  prop to the limb tip with a keyed `<bone>.p` instead of re-parenting (honk). The prop must extend along the hand's −Y past
  the fist or a raised arm holds it pointing down. Measure prop-top minus crown-top per facing on the 8-facing still (a
  right-arm prop rose 14 texels at S but 4 at E, toad r2).
- (lead, wave-2 merge) **(recurring: snail, mole)** A prop's motion hidden behind another prop is no motion: snail's wrench
  turned ±45° four times behind the gear (32 frames read as one hold); mole's hammer lost against the apron in the tap key.
  Rule: swing tools in the SCREEN plane on a path that clears the other prop and the body (own bone pivoting on the prop's
  hub, `out` channel of an 'up' bone, snail r6); move a held disc with `<bone>.p`, not by rotating the paw (it went edge-on).
- (lead, wave-2 merge) Mole r2: counter-keying the wrist against the arm swing only keeps a prop plumb for the wrist triple it
  was tuned on; to aim a prop HEAD at a point, grid-search the wrist in node (`shots/char-mole/mole_solve2.js`, err 0.02 m).
- (lead, wave-2 merge) Toad: a 1-link hip satchel (gravity 0.9, limit 35°) swung ≈ 3 texels BELOW the soles at E in the walk
  and flipped into a diamond. Rule: hanging chains get limit ≤ 20°/gravity ≤ 0.5 or a shorter hang; check them at dir 2.

- (lead, wave-1 merge) **(recurring: moth, goat, crow, skeleton-chef, frog, mushroom)** The identity prop vanishes in the
  walk or at a facing: moth lantern 0–3 px in walk drawings (25–27 standing), crow shovel fused 8/8, skeleton-chef baguette
  behind the body at SE in talk, frog sword trailing at boot level like a third leg, goat sheet 1/8. Cause: under LegGait
  the walk can't key the prop arm (§Module backlog motion #1), so the prop rides the rest pose. Rule: until that lands,
  make the REST pose the carry pose (hip height, forward-out, clear of legs at dirs 1/7) and count prop px in a walk still
  at 8 facings (≥ 12 px each) — see the playbook R line.
- (lead, wave-1 merge) **(recurring: goat, mushroom)** A long staff tilts 25–30° under the gait lean and the standing-start
  acceleration lean (≈ 14°, ≈ 0.4 s, not personality-controlled). Workaround (goat r2): route LegGait hips/neck/head
  channels to geometry-less bones and set `lean [0,0]`; costs head lag and the hip-dip safety net. Real fix in backlog.
- (lead, wave-1 merge) **(recurring: owl, moth, crow, fox, goat, skeleton-chef)** Vote props hidden at back/side facings or
  crossing the hat at dir 1 (crow shovel diagonal over the hat at dir 1 and behind the brim at E; fox paw behind the head
  at NE/NW/W; owl wing horizontal at mouth level). Rule: raise up-and-OUT on the carrying side (upperArm out ≈ 55, fwd ≈
  120–125) so the prop tip stands ≥ 6 px outside the head/hat box at 8/8; verify on the 8-facing still of the held key.

- (lead, wanderer) A weapon socket angled 30° forward of the forearm put the blade straight UP through the hat when the
  run swung the arm (elbow 85°). Rule: blade along the forearm (`rot [90,0,0]`), hold it forward with poses (idle forearm
  45°), limit `locomotion.elbows` [40, 50] / `arms` [34, 45]; check every run drawing.
- (lead, wanderer) Carrying a prop through the gait: authored `clips.walk` (8 step keys, length 8) / `clips.run` (6, length
  6) that key ONLY the prop arm (±4° around a carry pose) keep 8/6 drawings per cycle, single_frame 0, foot slide 0.0; other
  bones stay procedural.
- (critic-wanderer, critic-duelist-r1) **(recurring: wanderer sword, duelist rapier)** A 2-texel blade (0.055–0.075 m)
  crossing the legs gets a 1-px inner line on one side and reads as a dashed line; a rapier at forearm 36° hung through the
  walking legs at dir 1. Rule: thin props ≥ 3 texels (0.09 m) near the grip, or carry them ≥ 60° forward of the arm so they
  never overlap the legs at dirs 1/7; check the walk strip, not only the idle.
- (critic-keeper-r1, keeper r2, critic-keeper-r2, critic-duelist-r2) **(recurring: keeper r1, keeper r2, duelist parry)**
  A carried or raised prop covers the face/signature at whichever facing the author did not check. Keeper r1: hook tuned at
  S only → staff down the face and lantern ON the face opening at SE (pack + every scene crop; at night a glowing face).
  Keeper r2: moved outboard right and hook out-and-back (210°) → clear at S/SE/SW, but at E (carrying side to camera) staff
  down the hood and glass on hood/beard in idle, thump, raise, hurt. Duelist parry: blade a 2-px bar over the face at SE for
  the whole 10-frame hold, an antenna out of the hat at NW. Geometry: at SE a character-space point (x, z) lands at screen
  x ≈ 0.71·(x + z) — anything forward-right projects onto the face. Rule: for EVERY key pose (idle included) render one
  `grid=turnaround&clip=<c>&frame=<f>&fx=0` still and check all 8 facings: face uncovered at S/SE/SW, the signature not
  crossed by the prop at any facing, ≥ 6 px of a held blade/staff outside the head box at every facing.
- (keeper) A prop hung from a hand-held prop (lantern on a staff hook) needs the HAND frame world-upright in idle: the
  chain's rest direction is the parent's −Y. Put the carry pitch in `handR fwd`, keep the forearm angle for the drawing.
- (keeper r2) Arms raised sideways (upperArm out ≥ 90°) break the "world pitch = sum of fwd" bookkeeping; wrist corrections
  had the opposite sign to the guess twice. What worked: raw triples (`upperArmR [10,0,140], forearmR [0,0,20], handR
  [22,0,−160]`) tuned on 8-facing grid stills (≈ 20 s each), 4 iterations to a plumb staff. Forearm `out` clamps at ±30.

- (char-mushroom) A prop held beside a cap/hat WIDER than the reach of the arm (cap Ø 0.81 m, arm 0.31 m): a plumb staff
  only clears the brim if the grip sits ≥ 0.4 m out; a forward-leaning staff (24°) read as a spear at E/W. Bent REST
  geometry (move forearm/hand joint `pos` along authored directions, keep `axis: 'down'`) puts the carry into the rest
  pose, so procedural gaits swing about it. At the carrying side (W/SW) the staff still crosses the cap, as in v2.
  Raising a staff held this way: rotate ONLY with `fwd` (upperArm fwd 155, wrist −155 keeps it plumb); mixing `out` rolls
  made the wrist swing the staff backwards (8-facing stills `shots/char-mushroom/k-vote-f4.png`).
- (char-mushroom) On a chibi with a wide cap a raised hand can never clear the head (shoulder 0.57 + arm 0.31 < cap top
  1.26 m): vote = the prop thrust up (star 0.3 m over the cap at 8/8 facings).

- (char-mole) **Solve the wrist, don't guess it.** Keeping a held prop plumb (hammer upright in the carry, overhead in the
  vote, horizontal in a tap) needs the hand triple that cancels upperArm·forearm; with `out` ≥ 30° on the arm the
  axes no longer commute and 6 hand-tuned 8-facing renders (`shots/char-mole/v-a…i`) never got it. A 60-line headless
  solver (`shots/char-mole/mole_solve.js`: Character with a fake engine, grid + refine search over [fwd,twist,out],
  prints prop tip height over the crown and clearance from the skull axis) gave each pose in one call, first try.
- (char-mole) A short-handled prop beside the body at the game facing: at SE a point lands at screen x ≈ 0.71·(x+z),
  so a hammer held FORWARD (z +0.1) of the right hip hid inside the torso silhouette (a grey blob on the shoulder).
  Held 7° back and 17° out (head at x −0.42, z −0.04) it stands clear as a T against the grass at S/SE/N/NW.

- (char-clarabelle, wave 3) A chibi with NO identity prop still needs a vote prop: a vote-only "‖" paddle on its own bone
  under handR, authored at 1/20 size (hidden inside the hoof) and scaled ×20 by `paddle.s` [19,19,19] only in the vote key,
  stick authored along the hand's REST direction (−Y) so it continues the raised arm. upperArmR [150,0,35] + hand twist 35°
  puts the card 8/8 above the horns with its face toward the camera (`shots/char-clarabelle/z-g8c.png` row 1); fwd 125 / out 55
  held it sideways at head height at S/SE (`z-g8a.png` row 2).
- (lead, wave-3 merge) **(recurring: clarabelle, progress, preservation, polly, requin, mincut — 6/8)** Flat held things
  (vote card, pennant, placard, wing paddle, fin) authored facing ±35° off the body go EDGE-ON at SE (the game facing) or
  E/W: a 1–2 texel sliver, or a bare stick through the face. Judge them at SE first. Recipes that worked: arm near
  vertical (fwd ≈ 165, out ≈ 25) then sweep the hand twist with a variant spec (clarabelle −38 face-on at SE); a slab
  ≥ 0.17 m deep is never a blade (preservation); wings 0.085 m thick with a broad 0.05 m primary tip (polly r2).
- (lead, wave-3 merge) **(recurring: preservation, polly — rule break)** A prop that reads as a WEAPON at 1× costs more
  than an unreadable one: card on a 1-px dark stick = axe, navy wing tip poked at the camera = baton, a τ on four cube
  sides = skull eyes. Handle in a signature colour (knit yellow), card face-on and square, the broad light face of a wing.
- (lead, wave-3 merge) **(recurring: mincut, preservation; W2 rig row)** Hidden story props (scissors, chain link) without
  module support: geometry and child offsets at TINY = 0.001 on their own bone, shown with `'<bone>.s': [999,999,999]`
  only on the keys that use them; vote with the IDENTITY prop rather than a conjured one (requin's baguette popped in).

- **Which arm is near at dir 1 (char-theo-rem, 2026-10-16):** at SE the camera sees the character's LEFT side (+X); a
  right-arm finger raise was hidden behind the head at SE only (`shots/char-theo-rem/r3/z-qed-f22.png`), moved to the
  left arm it reads at SE (`r4/stack.png`). Judge on the 8-facing still, and turn the head with twist + toward SE.
  Short chibi arms inside a big body (spine ball) need `.l` 1.1–1.3 to get a paw or card outside the outline.
- **Hidden story props without HIDE spreads:** bake the prop at 1/1000 (`K.xf(g, {scale: 0.001})`, `at` × 0.001) on its own
  bone and show it with `<bone>.s` [999, 999, 999] in the clips that use it; unkeyed = identity = invisible in every
  other clip incl. LegGait walks (theo-rem Q.E.D. card + finger; prop_area rows still see it in the vote).

- (char-storyteller) **Plumb props via cancel triples.** A prop on its own UP bone under a hand (staff) stays plumb with
  staff fwd = upperArm fwd + forearm fwd (− spine − chest). A hanging DOWN bone (lantern) needs lantern fwd = −(upperArm + forearm)
  fwd. I first wrote `+` and the lantern stood out like a torch. Verify on an 8-facing probe (`shots/char-storyteller/pr/a-x2.png`).
  With `out` > 60 the cancel is only approximate (q = qFwd·qOut order), so probe the big raises.
- (char-storyteller) **A flat disc prop yawed toward the game facing.** The clock face on the far-side staff was edge-on at E/W
  (sig_outside.clock 1 px at E). Yawing the face geometry −35° (toward the right-front) makes it face-on at SE/S/E/W/N, edge-on
  only at SW/NE: sig_outside.clock went from 3/8 → 1/8 facings < 3 px. A twist-keyed hand would leave the yawed plane, so the hand
  positions are ×0.001 variant bones scaled ×1000 per key.
- (char-storyteller) **Tall robed host, prop clearance at SW.** A staff held at hand x 0.36 / z 0.27 crossed the void face at SW
  (screen x ∝ x − z there). The hand needs x − z ≥ 0.3: rest arm [out 50, fwd 10] / forearm [30, 30]. The grip then sits at
  x 0.46, z 0.13 (`r1` vs `r2` turnaround).

- **Ground props in an emote: a hidden prop bone on the HIPS + root compensation (char-maxflow).** A crate pushed along
  the ground cannot ride a hand (it would be carried). Bone `crate` on the hips, geometry at 1/1000 scale shown with
  `crate.s` 999; per key `crate.p = [0, worldY − hipsY − pos.y, worldZ − pos.z]` (helper `CP(py, pz, z)`), and keep
  `hips` rotation 0 in those keys (lean with spine/chest). Keep the lunge `pos.z` ≤ 0.14 (the return to idle snaps it
  back) and the prop travel ≤ ≈ 1 m, or the bake cell grows/touches (1.3 m travel touched the cell at S/SE/SW). Same
  bone reused for the vote: the crate overhead in both paws (`.l` 1.6, upper arm out 160) clears the head at 8/8
  (`shots/char-maxflow/r2/s-keys.png` row 3). A thin proud band round a box draws dotted lines (key_speckle +11 → +5
  after removing it): one lid rim only.

## Poses and actions

- (char-mincut) **Prop-less chibi vote by stretching the whole arm along its length.** `upperArmR.s` [0.25, 0.95,
  0.25] with a STRAIGHT arm (bent rest forearm undone: `forearmR` [−38, 0, 0]) stretches upper arm + forearm + paw 1.95×
  without gaps (unlike a `.p` telescope, which opens a gap unless a hidden longer sleeve exists); counter-scale the paw
  (`handR.s` y −0.45). Paw top 1.38 m vs skull 1.15 m on a 1.28 m chibi (headless probe `shots/char-mincut/
  mincut_probe.js`). At SE the straight raised arm crossed the face until the chest twisted −25° (right shoulder back)
  with the head counter-turned +8: then the arm stands beside the head at 8/8 (`self/fin-vote-snip.png` row 1).
- (char-mincut) Two-arm "scissors" (arms forward-out 55° ↔ crossed −22…−26°) is a big silhouette change that reads at
  1× and is clearly a gesture; at fwd 78 the crossing sat on the dark belly (dark on dark), fwd 92 puts it on the
  russet chest under the chin. Dying chibis on their side: fold the UPPER leg/arm down (out −18…−20) or they stand up
  as dark antennae at E/NE/N/NW.

- (lead, wave-2 merge) **(recurring: snail, toad, mole, chonk; extends the 25–40° rule below)** Keys that differ in the spec
  render the same: snail tinker four wrench keys = one drawing; toad excuse wink = 2 px on a 4×3 eye (punchline ≈ shrug);
  mole LISTEN/SHUT 0–2 px; chonk talk changes only a 2-texel beak between the 0.8 s wing beats. No charcheck row catches it
  (pose_read compares to idle, not key to key). Rule: every key of talk/emote changes ≥ 25 % of its silhouette or moves a
  big part ≥ 3 texels vs the PREVIOUS key at dir 1 and S (count on the 8-facing stills); a punchline is a pose change (head
  dip toward the camera, hand to the brow, jaw), never an eye-only change; talk gets a ≥ 25° beat every 12 frames.
- (lead, wave-2 merge) **(recurring: honk, toad; extends the wave-1 die bullet)** Die must read "down" at every facing AND
  show the face: honk's neck counter-rotated against an 80° body roll (net ≈ 0) → stiff upright neck = SITTING at E/N/NW;
  toad's head rolled away at 6/8 facings. Rules: never counter-rotate a child on the same axis as a big parent roll — the
  neck FOLLOWS the roll and droops 15–20° more to the grass; fall BACKWARD (hips −82) with the chin tucked (head +34) to show
  the shut-eyed face at S/SE/SW/W (toad r2); a lying arm with out ≥ 70° points up = antenna, fold it over the body; dead eyes
  on a dark head = a cream X sunk in the skull and pushed out with `<bone>.p` in the die (honk).
- (lead, wave-2 merge) **(recurring: toad, mole, honk)** Wide heads over short arms hide every gesture in front of the face at
  S/SE (30° camera): toad oath/brow hand, mole tap against the apron, honk tap buried in the clipboard. Gestures go UP AND
  OUT past the head width (toad vote out 135, oath hand out 116); a constant 10–12° head twist toward the camera side opens
  the face at dir 1 (mole r2), more (−14…−24°) in talk.
- (lead, wave-2 merge) Contact FX need a contact socket: `hit@hammerTop` fires wherever the prop points (mole: spark on the
  ground at S, 8–10 texels off the claw at dir 1) → put the event on a socket at the contact point (`hit@clawL`).

- (lead, wave-1 merge) **(recurring: fox, owl, mushroom, moth, skeleton-chef)** Talk/emote keys hide the face at the game
  facing: fox talk:6/18 (head fwd +12, chest +4) shows only the skull top at dir 1/S; owl talk:6 shades the eyes; mushroom
  talk nod puts the face under the brim at SE; moth's mouth-open key pitches down under the collar. Rule: on chibis,
  total head WORLD pitch in talk keys ≤ +4° (down); carry the beat with head roll/tilt toward the camera, a `pos.y` bob,
  ears/jaw; mouth-open keys tip UP, shut keys may nod. Check each talk key on the dir-1 and S cells.
- (lead, wave-1 merge) **(recurring: fox, moth, skeleton-chef, goat)** Emote punchlines turn away from or are covered at
  dir 1: fox wink with head yaw −14 and the paw over the muzzle; moth idle glance turns the only visible eye away for 12
  frames; skeleton-chef skull pop masked by FX on the same frame; goat SLAM ≈ idle silhouette. Rule: author the
  punchline on the dir-1 cell first — head turns TOWARD the camera, hands on the far side, the gag ≥ 10 % silhouette
  change, FX delayed 4–6 frames after the pose it decorates.
- (lead, wave-1 merge) **(recurring: owl, moth)** A vote that only spreads wings horizontally changes the silhouette
  sideways, and at E it is edge-on ≈ idle. Rule: vote = upward, by a raised prop (Proportions, chibi rule) or a V-up wing
  (out ≈ 150, fwd −20) that clears the crown at 8/8.
- (lead, wave-1 merge) **(recurring: owl)** Proud eyelid prisms over cut-out irises draw an inner-line ring → "goggles".
  Rule: close eyes by squashing the eye part (eye `s` y ≈ 0.2) or swapping to a 1-texel dark arc, never by a proud cover.
- (lead, wave-1 merge) **(recurring: crow, frog, goat)** Die holds: an edge-on brim renders 1-px arcs that read as
  antennae (crow N/NE/NW), upright boots on a lying body read as horns (frog N), the face upside down (goat). Rule: thicken
  rims ≥ 0.05 m, bend and lower the legs in the hold, roll the body ≈ 30° so the face turns to dir 1; let a hat fall off.

- (rig) Pose triple axes come from each bone's snapped rest direction, so a triple means the same motion on every chain.
  Signs: knee bends with NEGATIVE fwd, elbow positive; foot/tail/quadruped-head (fwd-pointing) fwd + = tip DOWN; sideways
  bones (ears) out + = UP. A 10° change is invisible at 50 texels; presets use 25–80°.
- (rig) `mirrorPose` must flip `twist` for R bones and negate twist/out + pos.x on midline bones. Rule: build L/R variants
  with mirrorPose, never by hand.
- (critic-wanderer, critic-duelist-r2) **(recurring: wanderer follow-through, duelist hurt)** Consecutive keys that differ
  by < 25° are the same drawing. Wanderer: contact → follow-through 11° + 6° = one drawing held 9 frames. Duelist hurt f0 →
  f5: spine −16 → −16, chest −12 → −10, twist 16 → 20 → only the legs changed. Rule: ≥ 25–40° on the dominant chain between
  consecutive keys in EVERY clip (hurt, idle extremes, recoveries included), follow-through ≥ 40° past contact.
- (critic-wanderer, lead) A straight-arm sideways anticipation reads as pointing. Numbers that read at 4 facings:
  anticipation upperArmR [60,0,80] + forearm 70 + 24° coil (blade over the shoulder); contact upperArmR [45,0,−30] (blade at
  hip height; [70,0,−25] stayed a sliver from the back); follow-through upperArmR [18,0,−42], forearm 15, unwind +14°.
  Follow-through visibility is a 3-way trade at 4 facings; one facing lies. Rule: anticipation folds the elbow ≥ 60° and
  coils ≥ 20°; author actions on the key grid from the first iteration.
- (critic-duelist-r1, critic-hound-r1/r2, critic-keeper-r2, duelist) **(recurring: duelist hurt, hound bark/pounce,
  keeper raise)** Head world pitch (body + spine + chest + neck + head fwd) breaks the front view in BOTH directions.
  Duelist: head back 42–58° turned the cream-walled tricorn into a lampshade; the over-corrected recover key (+10 fwd) tipped
  the hat over the face (reads as a bow). Hound r1: nose-down keys showed only the skull top at dir 0; r2: after capping
  nose-down only, head-UP keys (bark f5/f14, leap f8, neck −28…−34) showed a throat box with no eyes. Keeper r2: raise lift at
  −24° turned the beard into a horizontal spike at W/NW. Rule: keys held ≥ 4 frames keep head world pitch within −15°…+5°
  for wide hats/hoods and within ±35° for quadrupeds; put recoil/rearing into spine/chest/pos and counter-nod the head;
  look at EVERY key at dir 0 and dir 1.
- (duelist) A raised parry with the arm out and the elbow folded fwd points the blade at the camera (dir 1) or across the
  face. Upper-arm twist 90° (`[30, 90, 75]`) stood it up — but BEHIND the head at dirs 2/6 (critic r1: a block behind the
  body). Numbers that read at 0/2/4/6: upperArmR [75, 0, 28], forearm 50, handR [15, 0, 0]; the critic's [55, 60, 55] put
  the blade along the view axis. Rule: a block puts the blade between body and threat, forward of the chest plane; aim blades
  with wrist pitch (`handR fwd`), avoid upper-arm twist ≠ 0. Still invisible at SE in r2 — see Props.
- (duelist) A "narrow" thrust is a SMALL swing: anticipation held straight down swept a fat 90° crescent even at inner 0.7.
  Rule: anticipation tip 35–45° below level (hand at the hip, elbow ≥ 90°), contact level → ≈ 40° sweep. The lunge follow-
  through with the tip on the ground read deflated; hold it extended and level, put cockiness in head/plume/back arm.
- (critic-keeper-r1, keeper r2) The playbook's "≥ 30° roll for chops" turned a heavy vertical staff thump into a horizontal
  lance pose at chest height. What read in r2: side hoist (staff near vertical, butt ≥ 0.3 m off the ground, body rising and
  leaning back) → plumb slam → squash + a 2–3 × 16 px vertical streak + stepped dust. Rule: vertical IMPACTS (thump, stomp,
  ground slam) are exempt from the roll rule: their read is lift height, squash, dust and a short vertical streak.
- (critic-keeper-r1, keeper r2) The signature action (raise-lantern) was invisible: anticipation = idle at dir 1, raise =
  staff tilted with the lantern at hood-top height. r2: lantern well above the peak in 8/8 facings. Rule: a signature action's
  key changes the 25 % silhouette (lantern ≥ 0.3 m above the peak, arm up); check the key's thumbnail.
- (critic-hound-r1/r2) A leap that keeps the hind paws planted is a rear-up; with all paws lifted (rel = 1) but the chest
  30° above the rump and hind legs hanging, it still reads as rearing. Rule: a pounce leap's spine is level or nose-down
  (body +5…+10, chest 0, rump −4), hind paws trail back and up (dz ≤ −0.2, dy +0.1), the raised fore goes forward-up; the 25 %
  thumbnail shows a horizontal stretched blob. Front paws land first.
- (hound r2) A raised limb straight up (upper leg fwd 175) hid behind the head and cap at dirs 1/2/6. Up-and-forward-out
  (fwd ≈ 125, out ≈ 55) in front of the chest is visible at all 5. Rule: check the anticipation key itself at 0/2/4/6.
- (hound) Up-ish ears on a head pitching 60–80° down point forward like horns; need fwd ≈ −(neck+head)·0.6 per head-down key.
  Better (hound r2): sideways leaf ears (EAR_DIR x-dominant → left/right snap) only roll when the head pitches; with that snap
  `out` + = UP and `fwd` = fore/aft.

- (char-green-hood) **A prop-less chibi vote: telescope the arm, with the upper sleeve built longer than its bone.** Shoulder
  0.45 + arm 0.29 can never clear a 0.96 m hood. `forearmR.p` = 0.2 m and `handR.p` = 0.08 m along the rest bone axes (parent
  frame), upper arm out 138, body leaning to the other side 14°, mitt ×1.3: the mitt + tan cuff stand above the hood at 8/8
  (`shots/char-green-hood/self/g8-vote-f20-x3.png`); the upper sleeve part is 0.17 m longer than the bone and hides inside the
  bell cuff at rest, so the stretch shows sleeve, not a gap. final_hold needed the other arm out 44° too (9 % → 13 %).

- (char-rabbit) **Chibi arm reach decides the vote before posing**: on `chibi()` heads 2.15 the default arm (0.9) put a
  FULLY raised paw at eye level (headless probe: hand y 0.72 m, skull top 1.0 m), so every vote pose hid the prop in
  front of the face. Arms 1.25 (still tucked at rest) + a long-stemmed prop (blooms 0.11 m above the paw) reach the
  upper head beside the skull. Measure the reach headless first: `shots/char-rabbit/rabbit_probe.js` (Character with a
  fake engine, `rig.applyPose`, bone world positions) answers a pose question in 1 s instead of a 20 s grid still.
- (char-rabbit) **A bent rest forearm is a FWD-axis bone**: forearm rest dir (inward 58°, forward 58°) snaps to the
  forward axis, so its triple means fwd + = tip DOWN, out = yaw, not the 'down'-bone meaning; elbow-straightening keys
  guessed with the down-bone table moved the paw the wrong way three times. Straight raised arm on the rabbit:
  upperArmR [20, 0, 155], forearmR [−85, 0, 10], handR [−90, 0, −40] (prop upright). Check the snapped axis of every
  bone whose rest geometry you bent.

- (char-polly) **Prop-less bird vote: a hidden feather FAN.** A chibi wing (0.42 m from a 0.66 m shoulder) tops out at
  eye height. A `fanR` bone at the wing tip carries three 0.46 m primaries authored at 4 % scale (inside the wing tip,
  invisible in every other clip, no HIDE spreads needed because rest = hidden) and keyed `fanR.s` = 1/0.04 − 1 only in the
  vote; arm [12, −70, 158] + chest lean 8° left → fan top over the skull top S 12 / SE 9 / E 7 / NE 9 / N 9 / NW 13 / W 14 /
  SW 16 texels (`shots/char-polly/g8-vote-f6-x3.png`); fanned in the wing plane it reads as a raised "hand" of feathers.
  Spread wings for an emote need twist −90 on the upper arm so the flat paddle's broad face shows at S (honk rule).
- (char-polly) **Glyph marks (λ, letters) are pixel cells, not strokes.** A λ of two slanted 0.05 m extruded strokes
  rasterised as a lightning bolt at 1× on the tee; the v1 4×4 bitmap rebuilt as 0.056 m boxes (one part, coincident
  front) reads as λ at S/SE/SW (`g8-idle-f62-x3.png`). Character +X is SCREEN RIGHT at S: map bitmap column cx to
  x = (cx − 1.5)·cell (no mirroring).
- (char-mole) **Chibi vote with a short arm: slide the prop through the fist.** Arm out 150° + solved wrist put the
  hammer top only 0.15–0.19 m over the crown (geometry limit, 4 arm variants); a `<prop bone>.p` offset of +0.12 m
  along the handle (the grip slides down the shaft) took it to ≈ 0.30 m, clear at 6/8 facings (`v-j-x4.png`). Leaning
  the chest away (`out` +) or twisting it moved the hammer OVER the head (`v-hi.png`): keep the torso upright.

- (char-chonk) Die "feet up" on a ball wider than its legs are long: the FK legs end inside the rolled ball (an orange
  triangle on the belly at dir 1). A cartoon shin stretch in the held keys (`'shinL.s': [0, 1.3, 0]`, legs straight, out
  22) pushes the feet out of the silhouette at 6/8 facings (`shots/char-chonk/g8-die-f60-x3.png`); dir 1 still shows one
  foot end-on. A ^ ^ chevron eye (ink extrude 0.10 × 0.065 m, proud, turned 20° out) reads as ^ at S/SE/SW, but a blink
  between ^ and a flat line is a 1–5 px change (`idle.micro`): blink by opening the eyes (OPEN = y +0.6) instead.

- (char-opal, **(recurring)** chibi vote, cf. rabbit) On a 2.3-head chibi with a 0.66 m wide head the arm cannot reach
  above the crown (shoulder 0.6 m + arm 0.38 m < crown 1.16 m). A NON-uniform stretch of the upper arm along its length
  (`upperArmR.s` [0.15, 0.95, 0.15], inherited by forearm/hand/prop) plus a counter-squash of the prop (`pebble.s` y
  −0.4) gives a thin raised arm with the pebble ≈ 12 texels above the crown at dir 1, at 8/8 facings once the chest is
  twisted −14° away (the right shoulder moves back, so at E the pebble rises behind the head instead of over the face).
  Search it with an idle-replacing variant spec + 8-facing still (`shots/char-opal/wv.js`, `pose.sh`, `p-v*-x3.png`).
- (char-opal) **Die on the back reads "sitting" when the head is tucked hard.** head fwd 40° on a back-lying chibi
  put the face upright toward the S camera (a sitting otter); head 22° + twist −30° + hips rolled 28° to one side reads
  lying at 8/8 with the shut eyes visible at S/SE/SW (`shots/char-opal/die20-x4.png`). Lower the legs too (thigh 60 →
  30): raised dark feet read as horns at E/NE.
- (lead, wave-3 merge) **(recurring: polly, opal, mincut, preservation, progress, clarabelle — 6/8; W2: honk)** Die reads as
  sitting/standing at 2–3 facings → a body lying straight along one axis foreshortens where the camera looks down that
  axis and the 30° camera stacks head on body. Curl (hips roll −90, spine+chest 60°, knees to chest: a mound at 8/8 —
  mincut) or roll diagonal (hips 75–82° about Z, root recentred — polly; plank topple with roll ±38 — preservation); turn
  the face to SE with head `fwd` after the roll. Each die key lower than the last (clarabelle's "sit back" key rose 5–6
  texels: buckle → hop → flop). Probe 3–4 final poses as keys of a throwaway clip on ONE 8-facing still.
- (lead, wave-3 merge) **(recurring: opal, mincut, progress, preservation, clarabelle, requin — 6/8)** The emote punchline
  must differ from every talk/vote key (opal's = talk f12), happen on the camera-side limb at dir 1 (clarabelle's was
  behind the body), move far enough (progress's "step" 0.1 m = hop in place; ≥ 0.3 m), and show its detail without FX
  (opal's taps: fx=0 stills showed the paw never moved). A small story prop beats a bare-arm T-pose (mincut scissors).
- (lead, wave-3 merge) **(recurring: progress, preservation, honk)** Pose triple q = qFwd·qOut·qTwist: with `out` > 90 a
  positive `fwd` swings the raised limb BACK. Probe with a variant spec (`wv.js` with JSON key overrides) + one
  8-facing still before reasoning about angles. **(recurring: preservation, progress, mincut, requin)** Chibi arms can't
  clear a big head: `upperArm.s` ≤ 1.6× + 1.2× thicker, prop `.s` divided back; a shoulder shrug `upperArm.p` +0.08.

## Timing and holds

- (lead, wave-2 merge) **(recurring: honk; wave-1 moth)** Equal keys are not a still hold: honk die keys f22 and f60 were the
  same `DIE_END` object yet f60 redrew 105 px (the last key of a one-shot is evaluated differently; motion backlog M13).
  `hold_redraws` and `final_hold` both PASSed. Rule: end a one-shot on its last real key with `clip.length` (honk: keys end
  f22, `length: 61`), never a duplicate final key; diff the frame before the end against the end yourself.
- (lead, wave-2 merge) **(recurring: honk, snail, toad; wave-1 frog)** Event timing: an `emote:`/`vote@` event mid-hold fires
  at the next drawing; snail's star (f42) was still growing when the pose returned to idle at f62 (payoff on the idle
  drawing); honk's sparkle 6 frames after the raise FAILed `vote.final_hold`; toad die FX moved from the impact key to the
  settle key took die.strobe 3 → 1. Rules: events ON key frames; hold the key until its FX ends (or fire earlier); the
  glyph pop-in dot is gone (fx fix, lead wave 2) so a glyph is readable on its first drawing.

- (char-polly) **FX events on an odd key spacing make a 30 Hz strobe.** FX step on twos from their birth; squawk keys at
  0/5/13/18/24/30 with the glyph born on f5 and die keys 0/6/12/15/18 with `land` on f15 gave `strobe 3` FAIL (intervals
  `…1x2…`). A/B `shots/char-polly/ab-e` (events off) → strobe 1, so the FX phase was the cause, not chains. Retimed to EVEN
  key spacing from the FX key (squawk 0/6/14/20/26/32, glyph f6; die 0/6/12/16/20) → strobe 1 PASS with the glyph kept.
  Rule: after an FX-bearing key, every later key lands an even number of grid frames from it.
- (lead, wave-1 merge) **(recurring: moth, mushroom, skeleton-chef, frog)** Final holds and FX lifetimes: vote sparkle
  (≈ 0.8 s) and die wisp (1.2 s) outlive the pack window so a correct hold FAILs `final_hold`; the die hurt flash covers ≈ 6–8
  grid frames of the first key (frog: full white silhouette 6 frames; the bake's first die frame is a white silhouette).
  Rule: flinch keys under a flash hold ≥ 10 frames or shorten the flash to 2–3 frames; repeat the final key ≈ 20 frames
  later if FX outlive the window, and say so in the sheet (tools backlog).
- (critic-moth) Antenna/head chains re-snap inside the longest holds (104 px at vote g38, 27 frames into the hold) while
  `hold_redraws` says 0 (it does not cover final_hold). Rule: diff the raw frames over the whole final hold yourself.

- (motion) "Touchdown → show at once" made 1-grid-frame drawings. Rule: every new drawing waits ≥ minHold = 2 grid frames;
  only clip switches and smear contacts cut in. All causes of x1 drawings were fixed in `_gridFrame` (facing steps applied
  only when a drawing may change; optional redraws look ahead minHold−1 frames and skip if a key lands there; an action's
  last key is held ≥ minHold). Rule: any "cuts in immediately" exception besides clip switches/smear contacts makes
  single-frame drawings.
- (motion) Capture times with 4 decimals floor to the previous 60 Hz step. Rule: quantise steps with floor(t·60 + 0.01),
  derive grid frames from the integer step. Stage/flash/dust indices use `floor(dt·fps + 0.01)`.
- (tools) An action triggered at t = 0.25 s (7.5 grid frames) put every pose change half a frame off. Rule: action start
  times are multiples of 1/fps (char-stage snaps `at`).
- (critic-wanderer) Hurt key 0 held 3 grid frames under a 2-frame flash showed the recoil for ONE frame. Rule: hold of the
  flash key ≥ flash frames + 2.
- (critic-hound-r1/r2, critic-keeper-r1/r2, critic-duelist-r2) **(recurring, 3/3 new characters, both rounds)** Action
  holds are not holds: a chain (ears, tail, lantern, plume) redraws inside them, and FX steps on the other phase fill the
  gaps. Hound r1: play-bow drawn 3× (411/79/35 px), follow-through changing every grid frame g20–g26 (pose on twos + dust on
  the other phase). Hound r2 (1-link chains): every key followed 2 frames later by a 41–106 px settle, ears flipping sh → hi.
  Keeper r2: thump gather 3×, hoist 4×, follow-through changing every grid frame for 7 frames (dust and lantern on alternate
  phases). Duelist r2: parry "sharp hold" 4× (key, 84/37/10 px), lunge hold 3× (136/59), 4 settle drawings after every
  return to READY. charcheck passed all of them (intervals `1x7`, `1x8`, `3,2x3,4`). Rule: count raw-diff redraws in every
  hold: holds ≥ 6 frames have 0 redraws > 8 px and any settle step is ≤ 10 px; ≤ 2 consecutive 1-grid-frame changes outside
  smear stages. How: key each chain's pose in each action key AT the chain's settled direction (so the target does not
  jump), keep head world pitch/yaw constant across consecutive action keys when a chain rides on the head, phase FX on the
  pose's twos (or end the chain settle before dust starts), or stiffen the chain only while the action plays (needs motion).
- (critic-hound-r1) Idle keys followed by 3–4 settle redraws of 16/8/6/2 px end in single-pixel pops. Rule: the last settle
  step is ≥ 10 px or none (coarser quantum — LOWER `quant.chain` — or higher ζ).
- (lead, keeper, hound, duelist) **(recurring, 4 characters)** Post-turn redraw tails were never the channel the author
  first tuned. Wanderer: scarf ζ 0.55 → 0.75 changed the turn 38 → 37 drawings (facing steps, idle recovery steps, head lag
  dominate). Keeper r1: lantern/personality/yaw-quant changes left 27 drawings identical (idle recovery steps under the
  robe); keeper r2: the whole upper body still yawing 0.6 s after the turn = personality f 1.5 (f 4/3.6 ended it 0.33 s
  after). Hound: Gait head lag on `neck` (45 → 8 → 2 → 1 px; `quant.yaw` 15 → 25 changed nothing; `bones.head: '-head'` → 2
  settles). Duelist: late turn changes were legs (recovery steps), idle ones the plume. Rule: before tuning, classify each
  changed raw frame by region (upper/lower rows of the figure box) and A/B one source off at a time (chains / personality /
  head lag / recovery steps) with a variant spec. When knobs change nothing, the channel is something else or a feedback loop.
- (critic-keeper-r1, keeper r2) Robed slow walk on twos with near-identical drawings read as a gliding block. Fix that
  worked: authored `clips.walk` with a staff plant (tip forward on the step, planted while the body passes), holds ≥ 3 grid
  frames (length 12), sway as hip rotation.

## Locomotion and feet

- (char-mincut) **Unclothed chibi + LegGait 'biped' + authored walk with `blend: 'add'` is the cheapest clean
  game-speed gait so far** (post module fix M1–M3): 0.33 m legs (0.25 H), duty 0.18, cycleTime 0.3 → game.readable
  PASS 0.289 s / 1.14 H, 4/4 drawings, holds 2–3, off_grid 1 / flicker 50 legs-only; the dark legs alternate visibly on
  every drawing (no skirt to hide them), the keyed walk clip (length 4) sways a 2-bone tail with tail1 one drawing
  behind tail0 (±20°) and flops the ears on contacts on top of the plan's bob (`shots/char-mincut/self/s-game1x.png`).
  No channel routing, no ghost legs. `foot_slide` stays n/a (no plant on two drawings at 4 H/s).

- (char-preservation) **A personality hop on LegGait 'hop' without touching the plan:** an authored `clips.walk` (length 4,
  default replace) that keys `hips/spine/chest/head: [0,0,0]` on every drawing removes the plan's nose-up/nose-down pitch
  (a rigid, upright "never changes type" hop) while the legs, crouch and arc stay on the gait; symmetric arm keys 4° →
  42° → 62° → 36° (touchdown, rise, apex, fall) make the flight drawings read as a wind-up toy. With `hop` 0.28·H on a 1.12 m
  chibi: game.readable 0.289 s / 1.14 H, 4/4 drawings, apex ≈ 11 texels with a detached shadow (`shots/char-preservation/
  game-onion.png`, `gamespeed.png`). Arms at 24–36° were hidden by the 0.55 m pear body at SE; ≥ 40° shows them.
- (lead, wave-2 merge) **(recurring, 5/7 wave 2: rabbit, chonk, mole, toad, honk; extends the 8/8 glide bullet below)**
  The contact drawing shows no feet, or the wrong feet: rabbit's IK'd boots went THROUGH the dress in every hop drawing
  (chest, back, in front of the bouquet; `lift < 0` moved the problem, the author's own `dir2c/clip-game.png` shows it);
  chonk's squash + roll buried both feet on contact and showed them in the airborne pass drawings (inverted read); mole's
  flight drawings put one boot under the apron at S (pogo hop); toad's legs = a flickering dark clump. What worked:
  rabbit r3 — GHOST leg bones (no geometry, long + bent so drop 0) as `locomotion.legs` (keeps the clock and step events),
  visible legs FK, visible thighs in `locomotion.squash.bones`, `locomotion.height` tuned so the −0.06·height crouch equals
  the leg shortening → boots stay on the ground under the hem, game flicker 392/536 → 0 (cost: foot_slide n/a); chonk r2 —
  lift the ball off the hips on contact (`ball.p` +0.11) and take the head drop from a bigger squash (0.22), toe-out webbed
  feet ≈ 35°; mole r2 — `locomotion.spacing` 0.27 (feet 3+ texels apart), lift 0.03, shorter skirt 0.12 → both boots in
  every drawing; toad/honk — lighter leather toe caps so stepping feet read against the shadow. Rule: on the contact
  drawing at dir 0, 1 and 2, count the visible foot px (≥ 2×2 texels per planted foot, none inside the body/skirt); the
  module fix M3 'hold' mode draws boots under the hem but cannot keep IK'd feet OUT of a skirt (backlog M12).
- (lead, wave-2 merge) **(recurring: chonk, honk)** A roll moves a high head sideways, which projects into screen y at
  3/4 facings: chonk's ±10° spine roll gave one contact a 4-px head drop and the other 1 px (a limp). Shift the chest back by
  −0.66·sin(roll) (`chest.p`) and measure the head joint per drawing from the stage log (`s.h`), not the mask top. Honk:
  a long neck amplifies the roll into a ≈ 5-texel head sway that carries the waddle for free — but headBob 14° read as
  pecking; ≈ 8° keeps the head up.
- (lead, wave-2 merge) **(recurring: honk, toad)** Short-legged birds/chibis without seating: hide the thigh and fold the
  leg inside the body (honk: hip 0.42 m inside the egg, thigh forward-down, shank back-down, only the lower 60 % of the
  shank shows → drop ≈ 0 at 4 H/s); LegGait `locomotion.style` is independent of `plan` (plan 'biped' + style 'bird' = an
  alternating waddle on any upright chibi, toad, 4/4 drawings). Set `locomotion.plant: 'hold'` explicitly on short legs
  (honk saw 'auto' pick 'pin' before the module-fix merge: flicker 919 → 49).
- (lead, wave-2 merge) **(recurring: snail; wave-1 moth)** A pulse gait (LegGait 'glide') shows drawings k and n−k identical
  (−cos(2πk/4): 3 distinct, the critic saw 1). Snail r6 workaround: legacy Gait + part-less hidden legs (`hleg/hknee/hank`,
  names charcheck's foot finder ignores) + part-less sink bones for the Gait channels + authored `clips.walk` of length 4 →
  4 distinct drawings at 8/8. Make the gather drawing a real extreme (column rears 8–10°, shell ride ≥ 3 texels).
- (lead, wave-2 merge) Legacy Gait traps (mole, chonk): `cycleLength` clamps to 2·reach·legLen/duty, so raising duty to 0.3
  on 0.28 m legs silently SHORTENED the cycle (use duty 0.18 + step 0.66 H → 10-frame cycle, keys f0/3/5/8 hold contacts 3
  frames); `legIK 'plant'` on the legacy Gait re-solves the legs every frame (off_grid 23, flicker 870) — keep 'pose';
  `_solveLegs` dips the hips for every out-of-reach foot INCLUDING swing feet, so an authored airborne `pos` gets pulled down
  (chonk: lift the swing feet, `locomotion.lift` 0.28, or move the body with a bone offset the dip can't touch).

- (lead, wave-1 merge) **(recurring, 8/8 cast)** Every cast gait read as a glide/bobbing slide at 1×: `game.foot_slide` n/a
  at dirs 1 and 2 for mushroom, fox, owl, crow, moth, goat, skeleton-chef; in-hold ride 3.2–7 texels (walk), 10–13 (run),
  30.65 (skeleton-chef run). Causes: legs ≤ 0.25 H hidden under robes/skirts/coats, so no foot is ever seen planted;
  LegGait can't pin a chibi foot across 2 drawings at 4 H/s. Rule (until motion fixes it): make contact a deliberate
  DRAWING you can see — a boot/talon flick ≥ 3×2 texels out of the hem in a contrasting tone on each contact drawing
  (hide the trailing boot), or a prop plant (staff/shovel tip grounded one drawing per step), or a real hop whose apex is
  ≥ 4–6 texels above stand with the boots tucked (frog: flight drawings at standing height read as a squat-bob).
- (lead, wave-1 merge) **(recurring: skeleton-chef, moth, mushroom)** LegGait 'biped' body drop seats short legs: drop =
  Hh − √(Lg² − half²) with half ≈ 0.28–0.36 m ≥ the 0.29–0.35 m chibi leg → hips −0.2…−0.32 m, coat/hem on or under the
  grass (only visible on `bg=plain` at dir 2). Workarounds used: legacy Gait chibi recipe (CAST_PORTING §8; costs 7
  texels of in-hold glide with `legIK: 'pose'`) or long bent leg bones hidden inside the robe (mushroom). Check dir 2 on
  `bg=plain` for any robed chibi.
- (lead, wave-1 merge) **(recurring: frog, fox, owl, moth, mushroom)** Stance surge (default on) and the per-frame
  `plant` re-pin redraw the whole figure / the legs inside holds: game.flicker 8614–21754 px, off_grid 15–40, while
  `surge: false` trades it for 4.7–8 texels of in-hold slide. Rule: with legs ≤ 0.25 H set `surge: false` (no foot is
  planted for two drawings anyway) and accept the `legs only` WARN; report both numbers.
- (critic-frog, char-frog) The 'hop' plan's default legs include FL/FR = upperArm/forearm/hand: on an upright chibi the
  arms plant. Rule: `locomotion.legs: { HL, HR }` only. At 2·v the hop cannot hold a plant (run off_grid 40): declare it.
- (critic-goat) At 1× the trailing boot flicking out behind a robe reads as a tail. Keep it inside the hem.
- (char-owl) LegGait skips drawing 0 in the first two walk cycles while speed ramps up; the bake then found a 3-drawing
  period. Accept for now (backlog).

- (motion) Root gliding while the drawing holds made planted feet slide 3.4 texels per hold. `legIK: 'frame'` re-solves legs
  every frame (0.00 slide) but redraws 40–60 leg px at 60 Hz plus 1-texel hip dips; `legIK: 'pose'` (lead A/B on the
  wanderer: 5208 → 210 same-pose px) holds the whole drawing, exact at pose frames. Rule: characters use `legIK: 'pose'`.
- (motion) Gait `stride` as a full cycle gave 2.5 cycles/s → frantic shuffle. Rule: `stride` = ONE STEP (cycle = 2·stride);
  stance half-span ≤ 0.45·leg; mannequin walk 0.82 m cycle at 1.3 m/s (8 drawings), run 1.28 m at 3.2 m/s (6).
- (motion) Body curves from the continuous phase at whatever grid frame gave mushy drawings. Rule: evaluate bob/swing/
  twist from floor(φ·N)/N; bob = −cos(4π(φ − 1/8)); feet stay continuous.
- (motion) Straight legs let the IK reach clamp drag a planted ankle 0.1–1.0 texel. Rule: never pose a straight leg (idle
  crouch −0.012 m, hip drop for 0.95·leg, per-frame whole-texel hip dip); lunge root offsets ≤ 0.1 m on a 0.51 m leg.
- (motion) Action clips keying legs played as raw FK (feet floating 1–3 texels). Rule: each new action key drops and
  plants the FK ankles (`clip.legs: 'fk'` opts out).
- (motion) Slowing to a stop left the swing foot hanging 0.2 s. Swing phase advances ≥ (1 − β)/maxSwing per second; idle
  recovery steps (0.27 s, one foot at a time, > 0.07 m or > 35°) square the stance and handle turning on the spot.
- (tools) Procedural gait pose ids are running counters ('walk:17'); the cycle is `gait.p.poses`. A 3.4 m/s run with an
  11-grid-frame cycle skips one of 6 drawings per cycle. For sprite sheets prefer ≥ 12-frame run cycles.
- (keeper r2) `runSpeed` below the Froude threshold silently plays the WALK clip (1.6 m/s on a 0.54 m hip = Fr 0.48 < 0.5;
  editing run keys changed nothing). Rule: check v²/(9.81·hipY) > `runFroude[1]`; if editing a clip changes nothing in its
  strip, suspect it is not the clip being played.
- (keeper r2) A `pos.x` side sway in authored gait keys read as 1.15 texel foot slide (FAIL); the same sway as a pelvis tilt
  (`hips out`) → 0.0. Rule: sway goes into hips rotation, never `pos.x`, in authored gait clips.
- (critic-hound-r1) **(recurring: hound walk, keeper walk)** A bob of 0.014 m (0.5 texel) never shows. Rule: bob ≥ 1
  texel (0.028 m), run vertical swing ≥ 0.05 m; when chains don't visibly move in the gait, key ears/tail in walk/run clips
  (≥ 25° per drawing pair).
- (process, run 05, wanderer) **Game speed was never tested; at game speed the stock gait aliases.** All run-04 walks
  were tuned at 0.4–0.85 body-heights/s (keeper 0.6 m/s, wanderer 1.3 m/s); Clocktower v2 moves at ≈ 4 H/s (150 px/s on
  38 px sprites, 4-drawing cycle in 0.32 s). Wanderer at 6.1 m/s (`--q speed=6.1`, `shots/process/wanderer-gamespeed/`):
  both `walk` and `run` play the run (Froude), its cycle lasts 6 grid frames, so with drawings on twos only 3 of the 6 run
  drawings ever show (pose ids run:0/2/4 one cycle, 1/3/5 the next); a stance lasts ≈ 1 drawing so contact is never seen
  twice, and `foot_slide` 0.0 is meaningless. On the meadow at 1× (`shots/process/gs-meadow/wanderer-game-1x-sheet.png`)
  only a ≈ 6×8 px leg patch changes and the figure reads as sliding with flickering feet. Rule: cycle = N whole drawings
  (N 4–5 × 2 grid frames), one step = v·N·2/60; check distinct pose ids per cycle = N; a big part (whole-figure bob ≥ 1
  texel, ears/tail/wings ≥ 25°, hop apex ≥ 4 texels) must carry the rhythm; judge on a 1× real-time GIF. Feasibility:
  stance span β·C ≤ 0.9·hip → bipeds must scurry with flight (β ≤ 0.34), short legs must hop/bound/glide (PLAYBOOK §Game speed).
- (refs, run 05) **(recurring: wanderer, mannequin, chibi test body)** Confirmed independently and turned into numbers that
  render clean (`shots/refs-cast/`, CAST_PORTING §8). The cycle clamp is `maxC = 2·reach·leg/duty` (locomotion.js
  `cycleLength`): mannequin (leg 0.36 H) at 3.95 H/s with defaults → maxC 0.91 H, pose ids jump 1–2 per hold
  (`run:36,38,39,41`); a chibi body (`make({heads:2.4, legs:0.55})`, leg 0.20 H) → ids +3 per hold = a 2-drawing strobe,
  foot_slide 19.6. What rendered a clean 4-drawing loop (ids +1 per 2–3 grid frames, off_grid 0): mannequin
  `runStride 0.6 H, poses 4, reach 0.55, duty[1] 0.3`; chibi `stride 0.55 H, duty [0.18, 0.1], reach 0.6, poses [4,4],
  runStride 1.05 H, runSpeed 2·v, runFroude [1.5, 2]·Fr_game` (`shots/refs-cast/recipe.js`: `walk:` loop at v_game AND a
  `run:` loop at 2·v_game). A duty of 0.3 on the 0.20 H legs still skipped drawings. Rule: duty ≤ 2·reach·(leg/H)/(C/H);
  leg 0.36 H → ≤ 0.33, 0.20 H → ≤ 0.18 (skip-hop), 0.10–0.15 H → ≤ 0.12 (hop/waddle-hop); `poses` 4 for both branches;
  the 2·v run needs C ≈ 2.1 H (duty ≈ 0.1 on chibi legs) or it skips every other drawing.

- (motion r5c) **0 foot slide at game speed needs the plant shown in ONE drawing, re-pinned per frame.** LegGait r5
  showed each plant in two drawings (touchdown + push-off): 0.0 slide between pose frames, but in the push-off hold the
  root glided on to 3C/2n behind the hip → out of reach → the foot rode the body: quadruped at 4 H/s `foot_slide` 8.2
  (dir 1) / 11.6 (dir 2), 60 Hz in-hold 14.2 (`shots/motion/r5c-quadruped/` first run). Fix: a foot is shown planted
  only in drawings that START inside its stance (β = 1/n → the touchdown drawing, plant C/2n ahead), the hold crosses it
  symmetrically and `legIK: 'plant'` re-pins only that leg every frame; swing drawings show the swing at the middle of
  their interval (first one already lifted). Headless audit (`shots/motion/slide.js <plan> <H/s>`): drift at drawing
  changes 0.00 for all 6 legged plans at 4 and 6.5 H/s; in-hold drift quad 0.58, upright 0.49, biped 0.21, hopper 0,
  bird 0.77, longneck 2.4 (one 3-frame hold). Cost: the stance leg redraws per frame (40–90 px; charcheck
  `off_grid/flicker` WARN "legs only" on upright; FAIL "upper" on the quadruped because its thighs sit in the upper half
  of the box). Rule: at game speed judge `game.foot_slide` n/a + `60 Hz in-hold` ≤ 1, not the old 2-drawing pairs.
- (motion r5c) Short legs (≤ 0.25 H: bird 0.20, longneck 0.22, v2 chibis) cannot hold a pin through a 2–3 frame hold
  (0.33–0.5 m of travel at 4 H/s vs ~0.2 m of reach). LegGait's **stance surge** slows the displayed body to ρ × the
  drive speed while a planted drawing is shown and catches up in flight (offset back to 0 by the next touchdown, average
  speed unchanged). ρ 0.48 removed all slide on the bird but lurched the whole figure 7 texels at 7.5 Hz
  (`shots/motion/r5c-bird/s60-game.png`, first version); default ρ ≥ 0.75 (`surgeMin`, `surgeReach` 0.85·leg) leaves
  0.77 texels and a 1-px translation on some frames. charcheck counts that translation as upper-body flicker (it diffs
  crops without re-aligning by the logged root) — not a redraw. `locomotion.surge: false` turns it off.
- (motion r5c) A game player starts at full speed: with a 2-frame idle hold first, 0.27 m glided under planted idle
  feet. LegGait idle → walk/run now cuts in on the first grid frame (a clip switch, like play()); legacy-Gait characters
  unchanged (A/B vs pre-round: hound walk/game 0 px). A planted foot already out of reach at its pose frame (walk↔run offset
  blend: quadruped 6.95 texels) is shown lifting instead; past reach inside a hold the IK clamps the foot onto the
  hip→plant line (toe trails, drifts by the excess only) instead of riding the body.
- (motion r5c) Glide (snail/blob) squash 0.12 was a ~1.5-texel change at 1x — only the stalks moved. Default for glide
  plans 0.2: the stretch drawing (long, low) reads in `shots/motion/r5c-limbless/clip-game.png`.
- (char-snail) **Glide pulse for a real snail**: the volume-preserving squash `[a, −amt, a]` makes LegGait's "squash"
  drawing long-and-low and its "stretch" drawing tall-and-short. Put the squash bone's JOINT at the tail tip (z −0.42), not
  mid-sole, so the long drawing extends the foot FORWARD from the tail; keep the head column and shell OFF the squash
  bone (riders on `base` with joints on the foot top, y 0.13) so the face is not squashed and the head stays calm
  ("slowly" = personality). amount 0.4 → foot length ±20 % (≈ 8 texels at dir 2) + ≈ 2-texel shell ride; with
  cycleTime 8/30 s the game job shows 4/4 drawings, holds 2×23, 0.267 s / 1.05 H (`shots/char-snail/r5/report.txt`).
- (char-snail) 1-link spring chains on head-mounted stalks (chain `bones: ['stalkL']`) give a nice swept-back lag at
  game speed but double the idle/talk redraws (8 → 16, 18 → 29 changes; loop clips ignore clip.dynamics, M5). Keyed
  stalks + rigid stalks in the walk was the cleaner trade (`shots/char-snail/wv-cs/`).

- (char-mushroom) LegGait at game speed: the stance SURGE moved the whole figure inside holds on a 0.24 H-leg chibi
  (charcheck `game.flicker` upper 8614 px); `locomotion.surge: false` → upper 0, legs-only WARN, cycle unchanged (0.278 s,
  4/4 drawings). With legs ≤ 0.25 H no foot is ever shown planted twice, so the surge buys nothing: turn it off.
- (char-mushroom) Low swing feet under a robe: `lift` 0.025 H keeps the boots under the hem; shin parts poked through the
  robe front in every swing drawing — give robed chibis boots only.
- (char-chonk) **Ball body (goose ball, any blob with feet): squash needs its own LEAF bone.** Squashing the root/body
  bone scales the IK'd legs (rig.js warns). What worked: custom skeleton `hips` (root, legs) → `spine` (roll pivot) →
  `ball` (leaf, the mass, `ball.s`) + `chest/neck/head`, `wingL/R`, `tail` as riders on `spine` moved by `.p` offsets =
  (restY − ballY)·(sy − 1) (and x/z·k for the widening). With the LEGACY Gait (no `locomotion.plan`) the authored
  `clips.walk` plays every channel incl. `ball.s`/`.p` (LegGait plays none, M1, and has no squash in its bird branch):
  a 4-drawing waddle-hop (contact = squash 0.12 + roll 10° onto the planted foot, pass = airborne +0.11 m, wings out 30°)
  gave `game.readable` 0.289 s / 1.14 H, 4/4 drawings, holds 2–3, off_grid/flicker/strobe 0/0/1
  (`shots/char-chonk/report.txt`, `s-game.png`). The whole ball (≈ 8 texels of head travel) carries the rhythm at 1×.
- (char-chonk) Rolling a ball body onto the planted foot at dir 1 when that foot is on the FAR side tips the head away and
  hides the face (contact-L drawings showed the skull top). Fix: no spine twist on contacts, head counter-roll −10 and
  head fwd −8 (tip up). Also `pos` dips on contact drawings bury 0.08 m feet under a 1 m ball: dip with the squash (top
  comes down) and keep the root at ≈ stand height.

- (char-green-hood) Legacy-Gait chibi recipe + authored `clips.walk` keying `pos` y −0.02 (contact) / +0.06 (flight) gives a
  ≈ 3-texel whole-figure bounce at 4 H/s with 4/4 drawings (0.267 s / 1.05 H); a keyed hood-peak bone (+18 / −28°) and ±30°
  sleeves carry the rhythm at 1× (`shots/char-green-hood/p2/gtrack-8-x4.png`). Raising the hem to 0.15 m (v2: 4 px of 27)
  and moving the boot 0.055 m forward put both boots in view at S; at hem 0.12 the 30° camera hid them behind the bell.
  die.foot_slide 3.13 comes only from the topple key (matching the buckle drop to 2L(1 − cos a) changed nothing): tools T11.

- (char-rabbit) **Hop + negative lift hides the boots**: on the LegGait 'hop' plan the flight drawings raise the feet by
  (lift + hop)·sin; with `lift ≥ 0` a dress chibi tucked its boots up in FRONT of the chest prop at dir 1/2 (a brown blob
  beside the bouquet, `shots/char-rabbit/dir2/clip-game.png`); `lift [−0.12, −0.14]` (0.25·hop) hangs them just under
  the hem (`dir2c/`). `surge: true` on the same 0.20 H legs: game.off_grid FAIL 30, flicker 12085 vs WARN 11 / 395 with
  surge off — confirms the short-leg surge rule. Hop arc 0.36·H gives a ≈ 17-texel apex and detached shadows at 1×.

- (char-mole) Legacy-Gait chibi recipe with an authored STOMP (contact drawings pos −0.045, flight +0.06, hips roll
  ±7° onto the stance foot, hammer arm ±22°, lift 0.07): 4/4 drawings, 0.278 s / 1.1 H, off_grid/flicker 0, bob ≈ 2
  texels and a boot visibly planted ahead on contact drawings in 1× root-following crops; in-hold ride still 6.0
  texels (legIK pose). A keyed apron flap of 22° read as a horizontal board at dir 1: ≤ 10° for front skirts.
- (char-mole) Die with `legs: 'fk'` FAILed die.foot_slide 6.36: knees bent with a forward-moving foot. Keep feet under
  the hips in the buckle (thigh a, shin −2a, foot a, pos y = −2·L·(1−cos a)) and move the ROOT back by the thigh length
  when sitting (thigh 90 / shin −90, pos z −thigh) → 0 FAIL.

- (char-clarabelle, wave 3) LegGait `plan: 'biped'` + authored `clips.walk` with `blend: 'add'`, length 4, and
  `locomotion.arms: [0, 0]`: the clip alone drives the arms, so a character can swing BOTH arms together (cow's parallel
  pump) while the plan keeps its legs, bob and plant. 4/4 drawings, 0.289 s / 1.14 H at dirs 0/1/2, ears ±30° per
  drawing carry the rhythm. The FIRST cycle still skips drawing 1 (`raw/clip-game.json`: walk k0 → k2), later cycles +1.
- (char-clarabelle) Sideways ears (cow) vanish at E/W: the near ear projects onto the white skull (same slot). Angle
  them back (dir z ≈ −0.75) so a nub breaks the outline behind the head; still only 2–3 texels — a contrasting ear
  inside or a lower droop would read better.

- (char-progress) **SKIP gait for a short-legged chibi (leg 0.24 H)**: LegGait plan 'biped' + `plant: 'hold'` + an authored
  `clips.walk` of length 4 keying `pos` (contact −0.035, flight +0.11), `spine.s` squash/stretch, arm pump (84° / −52°) and
  a keyed backpack bone (±20°), swing `lift` 0.16 m so the free foot tucks in flight: 4/4 drawings, 0.289 s / 1.14 H,
  head joint 5.8 px up/down per step (stage log `h`), off_grid/flicker legs-only WARN. Contact stays ONE drawing per foot
  (foot_slide n/a). Keyed bones REPLACE the plan's lean: a contact key with spine 6 + chest 4 + head 4 showed the skull
  top at dir 1 — keep the head world pitch ≈ 0 in contact keys (hips 6, spine 2, chest 0, head −6).
- (lead, wave-3 merge) **(recurring: progress, preservation, cilantro)** The face/neck must stay constant across gait
  drawings: body pitch per drawing opened/closed progress's grin (counter-pitch the head so summed pitch is equal on
  contact and flight); sub-texel bob re-rasterised preservation's pupils (key walk `pos` in whole texels: 0.0321 m per
  texel in y); a forward neck pump pointed cilantro's neck at the camera at S (0 texels of neck; measure ≥ 6 at S).
- (lead, wave-3 merge) **(recurring: polly, preservation, cilantro, opal, requin, mincut, progress)** LegGait 'hold' never
  plants a foot for two drawings at 4 H/s, so `foot_slide` is n/a and contact is judged by eye (backlog M18/T16). Make the
  contact drawing visible instead: 3-toe fan ≥ 3 texels + dark shank (polly), negative `lift` −0.07 so hop legs extend
  4–6 texels in flight (preservation), ≥ 3 texels of shin on the low drawing (cilantro), arms ≤ 30° swing (cilantro,
  mincut twig arms).

- **Big round chibi at game speed: a squash-waddle carries the gait (char-maxflow, 2026-10-16).** Legs 0.18 H under a
  0.6 m ball body show 4–10 texels of leg — the legs alone never read at 1×. LegGait `plan 'biped'` + `style 'bird'` (roll
  9°, headBob 6°) + `locomotion.squash { bones: ['ball'], amount 0.22, riders: ['chest'] }` on a LEAF bone `ball` (child of
  spine, joint at the egg bottom) that carries only the body egg: the head/arms ride the `chest.p` rider, nothing IK'd is
  under the scaled bone. Result 4/4 drawings, `head_bob` 7.4 px, `feet_visible` PASS, reads as a waddle at 1×
  (`shots/char-maxflow/clip-game.png`). The same `SQ(a)` pair (`ball.s` + `chest.p` = −(0.505−0.19)·a) keyed in idle /
  talk / vote / push gives the plush squash everywhere at no speckle cost.

- (char-greenting) **Custom biped-named skeleton + LegGait `plan: 'biped', style: 'bird', plant: 'hold'` = a waddle for ANY long body on 0.1 H legs**, first render: 4/4 drawings, 0.267 s / 1.05 H, off_grid/flicker 0. A tall tube amplifies the roll: roll 12 gave a 4-texel one-sided limp (head_bob limp 4.0 WARN) and a forward-dive drawing at SE; roll 8 + headBob 4 → limp 2.6 PASS. The arms/tail rhythm goes in an additive `clips.walk` (`blend: 'add'`, length 4), with `locomotion.arms/elbows [0, 0]` so the plan's swing does not fight it. Feet stay a 2–4 texel shuffle (foot_slide n/a): contact is still the weak point.

## Secondary motion (chains, personality)

- (lead, wave-2 merge) **(status)** The two wave-1 bullets below (LegGait ignores walk poses; loops ignore
  `clip.dynamics`) are FIXED in shared code (module fix M1/M5, merged mid-wave-2). Wave-2 members still reported both
  (rabbit, snail, toad, green-hood, honk, chonk, mole, nicksong) because their renders predate the merge or their loop clips
  never set `dynamics: 'hold'` (M5 is opt-in; the loop default stays 'free'). Rules for wave 3: key ears/tail/prop per gait
  drawing in `clips.walk` under LegGait (`interp: 'step'`, length 4, f0 = left contact; `clip.blend: 'add'` to layer on the
  plan's body); set `dynamics: 'hold'` on idle/talk when chains ride keyed bones; drop the channel-routing/sink-bone hacks.
- (lead, wave-2 merge) **(recurring: rabbit, honk)** Ear chains are the best secondary motion in the cast (rabbit hop: ears
  lag, detached shadow, 4/4 drawings). A 1-link chain pointing UP needs `tip: 'axis'` + `len`, else the default lever is
  'down' and gravity pushes the ear the wrong way (rabbit; undocumented in CHARACTERS.md).

- (lead, wave-1 merge) **(recurring, 6/8: mushroom, frog, fox, crow, owl, goat; moth/skeleton-chef left LegGait for it)**
  LegGait ignores authored `clips.walk/run` poses (`bodyPose` never evaluates them; only `bucket()` reads them for ids),
  so ears, tails, tufts, props and arms cannot be keyed per gait drawing. Workarounds in use — copy one, and say which in
  the sheet: route a channel to a part-less or accessory bone (`locomotion.bones.armL: ['staffSway']` mushroom,
  `['tail0','mugHold']` fox, `['flapL','upperArmL']` crow, `bones.neck → tuftRoot` owl, spine/chest → ears goat) — one
  shared amplitude per channel, 9–15° per step; or the legacy Gait (no plan; plays authored walk/run, moth,
  skeleton-chef) at the cost of the body-drop/glide limits above. Motion backlog #1.
- (lead, wave-1 merge) **(recurring: owl, moth)** Spring chains on head/hand bones re-snap at key changes inside held
  actions, and LOOP clips (idle, talk) ignore `clip.dynamics` (`dynMode = s.action ? … : 'free'`): a 1-link head chain
  adds 21–72 px settle drawings 2 and 4 frames after every key; moth talk 39–100 px. Rule: for head-mounted accessories
  on the cast, key the bones (no chain) and counter-key them so their world direction holds across keys (opposite
  twist sign on R).
- (critic-goat) Post-turn tails (≈ 11 redraws over 0.6 s) on robed chibis come from hidden legs stepping back; no knob
  (stepTol/stepYaw/stepTime/personality) removed them. Report it; backlog.

- (motion) t3ssel8r v3 SecondOrder f 2 / ζ 0.5 / r −2: undershoot −0.254 at 0.067 s, overshoot 1.178 at 0.333 s, within 2 %
  from 0.667 s. Pole matching from f ≈ 9.5·ζ Hz at 60 Hz. r = 1 with a step input overshoots (k3·ẋ spike) — use r = 0 for
  anything driven by steps (quantised facing!).
- (motion) Dynamics shown only on pose frames need a trigger: quantise each channel and allow a dynamics-only redraw on twos
  when the quantised signature changes.
- (motion) A cape chain swung into the legs on stops. Rule: chain option `noForward` clamps each link's forward component.
- (lead, wanderer) A scarf at f 3.2 / ζ 0.4 redrew 1-px wiggles for 1.2 s after a turn; head lag crawled ~1 s. Rule: chains
  settle ≤ 0.5 s (scarf f 4, ζ 0.55) with coarse redraw quanta → 2–4 held drawings per settle.
- (duelist r2) **Correction** of critic-duelist-r1's "keep quant.chain ≥ 8": `quant.chain` is buckets per unit of
  direction (character.js `Math.round(dir * Q.chain)`), so HIGHER = FINER = MORE redraws. Duelist idle raw-diff A/B: chain
  8 → 3 plume redraws of 12–15 px per breath key, 4 → 0, 3 → 0–1. Default 12; wanderer 8; small chains 4. Also, stiffening
  the spring alone (f 10, ζ 1) changed nothing: the idle keys re-aimed the chain (head pitch changed per breath). Rule: keep
  the head's world pitch constant across idle keys (head = −Δ(spine + chest)) and use chain ≤ 4 for small chains.
- (critic-duelist-r1) Dynamics in code ≠ design sheet (sheet body ζ 0.55 / plume f 4 ζ 0.5; code ζ 0.8 / f 5 ζ 0.6): the
  self-score used the sheet. Rule: after tuning, copy the final numbers into the sheet; the critic diffs sheet vs code.
- (hound r2) 2-link chains boiled every hold: each key change → 2–3 dynamics-only redraws, and f 6.5 → 15, ζ → 1, r → 0,
  quant 6 → 3 left the list identical. Cause: `_cacheChains` reads link 1's rest from link 0's already-aimed orientation, so
  the chain converges once per drawing. Rule: until fixed (backlog), 1-link chains for short accessories (1 settle per key).
- (keeper, duelist r2, critic-keeper-r2) **(recurring: keeper, duelist)** `_resetSim` does not clear each chain link's
  `L.dir` → after a re-simulation the first drawing aims with the previous run's direction (keeper deterministic FAIL), and
  in a fresh run the first drawing is un-aimed: 13 px lantern pop at 60 Hz frame 4 (keeper), 6 px plume pop (duelist) on an
  unchanged pose in every clip. Proof: keeper `wv.js?wv=r` monkeypatch (`L.dir = null`) → PASS. Workaround until motion
  fixes it: make the chain's rigid direction equal its settled one in idle (keeper: carry pitch in the wrist, idle parent
  only translates vertically) → deterministic PASS; a mid-swing re-simulation in an action still differs.

- (char-rabbit) **Spring ears on a cast head WITHOUT settle redraws**: 1-link chains (f 5, ζ 0.8, `tip: 'axis'` + len,
  quant chain 4) lag the hop arc visibly, and (a) one-shots key the EAR BONES (the chain target follows the keyed bone)
  with `clip.dynamics: 'snap'` → one change per key (fx=0 vote `3`, die `8,6,4`, sniff `6x5,14,6x3`); (b) in the talk
  LOOP (dynamics ignored, M5) every key keeps the head's WORLD orientation constant (head = const − chest) and carries
  the beat with jaw, paw, bob → fx=0 talk `6x8` (r1 with head roll + ear keys redrew every 2 frames). Note `tip: 'axis'`
  is required on an UP-pointing 1-link chain (the default lever is 'down', so gravity pushed the ear the wrong way).

- (char-opal) **A low tail that sweeps to one side vanishes at the game facing.** Opal's v1 tail runs behind-and-to-her-
  LEFT; at dir 1 (SE) "left-back" is exactly the view axis (l + b = −camera), so the curl hid behind her legs at SE in
  the rest pose AND in the first walk (`shots/char-opal/clip-game.png` r1, sig.tail 3–4 px at S/SE). Fix without new
  geometry: a keyed STAND pose for the tail (tail0 out −70, tail1 +20 → behind-RIGHT) used as the base of every clip
  (`TAIL(a, b)` = offsets from it) → sig.tail [8, 50, 104, 129, 137, 129, 107, 65] px; in walk/run swing the 2-bone
  tail −95 → −45 (50° per contact pair) so it streams out beside the body at SE. Rule: for any one-sided low accessory,
  compute the side vector at dir 1 before modelling; S then shows it only if it sticks out sideways ≥ 0.25 m beyond
  the hips — you cannot have both S and SE with one rigid sideways tail (pose tests `shots/char-opal/p-it*-x3.png`).
- (char-opal) **Keyed 2-bone tails need no spring and never re-settle**: tail0/tail1 as plain bones (axis 'back': `out`
  = swing) keyed in every clip, incl. the authored LegGait walk (M1, length 4) → hold_redraws 0 in vote/optimize and
  upper flicker 0 in walk/run, while the tail carries the 1× rhythm (`shots/char-opal/dir2/clip-game.png`).
- (lead, wave-3 merge) **(recurring: cilantro, requin)** Identity parts carried by dynamics vanish at game speed: a 1-link
  chain lags ≈ 2ζ/(2πf)·v (0.2–0.3 m at 4 H/s) and sits at its limit (cilantro's scarf end under the hoodie at 8/8) →
  key the chain bone forward in the walk clip (scarf0 fwd +22, limit 30 → 16); a rigid beret reads dead → key ±10° roll
  with the hips yaw + `.p` ±0.03 lag per drawing (requin r2, no charcheck cost).

- (char-greenting) **A stubby limb that must vote: stretch it with `.l`, don't swap in a prop.** A 0.17 m stub arm on a 1.12 m tube cannot clear the head; `'upperArmR.l': [3.6]` (×4.6, thickness kept) turns it into a soft noodle arm whose tip clears the crown by ≈ 10 texels at S (`shots/char-greenting/self/z-vote-point.png`) and reads as "rubber creature" for a mascot. Tilt it back (`fwd` −18 on an 'out'-axis arm) so it rises behind a forward-leaning head at E. Cost: the arm on the far side vanishes at one facing (NE for the vote, SW for a left-hand point) — pick the arm by the dir-1 read and say so.

## Smears and FX

- (lead, wave-2 fix) **Emote glyphs now appear at full size on their first drawing.** The old pop-in stage drew a 3×3 rim
  dot for one 15-fps drawing (≈ 4 frames), read as a hollow white speck and delayed the punchline (mole ring f40, honk
  exclaim f14; critics r1). `src/chars/fx.js` glyph branch: pop-in removed. A/B (same tree, render-host): wanderer full pack
  0 px differ in every job; honk honk/die/vote/game 0 px except 4 frames of clip-honk (13 px each: dot → "!"),
  `shots/lead-w2/ab-honk-glyph.png`.
- (lead, wave-2 merge) **(recurring: chonk, honk, snail)** FX that read as another object: chonk plop dust = three beige
  8×4 ovals under the body (eggs) — `poof@<node>` spawns 6 slow motes at the node, use the `land` ring and light
  `spec.fx.dust` tones; honk flap feathers = detached 1-px grey slashes; snail/frog/skeleton-chef die `hurt` flash whitens
  the whole figure ≈ 8 frames, which also breaks the Clocktower no-hurt rule — drop `hurt` from cast die clips.

- (lead, wave-1 merge) **(recurring: skeleton-chef, mushroom, crow)** FX on a face or masking the pose: vote sparkles over
  the skull's face, poof + heart on the same frame as the skull pop, mushroom idle spore = a 3–4 px scratch across the
  face, crow dig dust = a symmetric grid of 1-px '+' motes lingering ≈ 12 frames. Rule: emote/event sockets outboard
  (|x| ≥ 0.35 m or at the prop tip), FX 4–6 frames after the key they decorate; dust motes seeded-random, ≤ 6 frames.
- (char-frog) `emote:<glyph>` events mid-hold fire only at the next drawing: put events on key frames.
- (critic-frog) 8-facing grid stills never show smears (no previous key); verify gesture smears on the 60 Hz strip.
- (critic-crow) The talk speech bubble flips dot ↔ full bubble on every beat (fx backlog).

- (fx) A depth-writing smear with `uPassMode == 1 → discard` drew an outline ring round the crescent. Rule: depth-writing
  FX write `vec4(0.5, 0.5, 1, FLAG_NONE)` in the normal pass (smear.js `normalPass: 'none'`); discard only for non-depth FX.
- (fx) Ground-level point sprites lost their lower rows (one depth per square). Rule: pull them ≥ 0.25 m toward the camera
  (sparks 0.45 m); place motes at terrain height, never root.y.
- (fx) Smear grey #ACB8B8 vs lit meadow #BBD985 < 5 % luminance. Rule: a palette ≥ 15 % lighter for grassy scenes
  (`['#C4CED0', '#DCE2E2']`).
- (fx) A quaternion difference measures ≤ 180°: a 190° key smeared the short way. Rule: ≤ 170° per smear key (sum arm +
  torso rotation about the swing axis); spins = several 110–125° smear keys on the hips twist.
- (fx) Stage timing matching refs/chars/03b: full, eroded, streaks, remnant dashes, each 2 frames at 60 Hz, gone after 4/30 s.
- (fx) Streak rows sized by the widest projected width broke into dots where foreshortened. Rule: rows from the narrowest
  projected width over u ≥ 0.3, dash cells = outer arc / 3 texels, measured once at birth.
- (fx) inner 0.35 on a 0.6 m sword gave a 5–7 texel crescent. Rule: blades < 0.8 m use inner 0–0.12.
- (critic-wanderer, critic-hound-r1/r2, critic-duelist-r1, keeper) **(recurring, 4/4 characters)** The smear is edge-on or
  hidden at some facing, and the pack (dir 1 only) does not show it. Wanderer: brim-height horizontal swing = 2–4 px sliver
  at dir 4 behind the hat. Hound r1: claw = 1–2 px line at dir 1, white wedge at 2/6, sliver at 4; r2: full C at dirs
  0/2/3/5/6/7 but a 2-px stick at dir 1 and a 4×2 blob + detached px at dir 4 (near-sagittal plane; ribbon length − inner
  = 0.06 m < 1 texel edge-on). Duelist spin f6: 41 light px at dir 6 vs 831 at dir 2 (blade steeply down). Keeper: pure-pitch
  slam = 1–2 px sliver at dirs 0/4. Fixes that worked: duelist blade near HORIZONTAL in every spin key AND the anticipation
  (upperArmR out 82, forearm 15; inner 0.32) → 585/500/404/402 px at 0/2/4/6; hound shoulder socket, blade kind, length 0.46,
  inner 0.4, ≥ 110° sweep with an out component (+55 → −26). Rule: an attack arc needs a component across the view at every
  facing (never pure sagittal); wide-hat/hood characters slash diagonally or at waist height; ribbon width (length − inner)
  ≥ 0.10 m; the verdict is ONE `grid=turnaround&clip=<c>&frame=<contact>` still: ≥ 8 texels of connected crescent at every
  facing, no detached px, and each facing's light px ≥ 25 % of the best facing.
- (hound) The `limb` smear kind (inner 0, fan over the leg) was a filled wedge on the body; the blade kind on the shoulder
  socket works. A crescent through the chest plane cannot be seen from the back (backlog: offset ribbon option).
- (critic-duelist-r1/r2, duelist) **(recurring, both duelist rounds)** There is no linear (thrust) smear kind. Workaround:
  two tip sockets (`stabU/stabD`, `blade [0,±1,0]`, `length 0.13, inner 0.5, edge [0,0,1], minAngle 0, doubleEdged`), heading
  change ≤ 20° (38° bowed the streak). Reads at the profile facings (99/73 px), but at SE blade + streaks = a ladder/cleaver,
  at E a trident, at S a cane, at N hidden: 4/8 facings. Rule: tell the brief owner a thrust smear is not available; use one
  short streak socket (length 0.08, tail 0) + 15–20° body yaw at contact, or none.
- (critic-duelist-r1) A parry with a 150° sweep made a crescent taller than the figure. Rule: a parry/block is ≤ 40° from the
  previous key, no crescent, spark only; the hold carries the sharpness.
- (critic-hound-r2) The hit spark at dir 1 read as a dark checker clod (yellow on near-black cells, 6×5, 6 grid frames).
  Rule: spark cells light tones only (≥ 15 % lighter than lit grass), ≤ 3 grid frames. The blade smear's two whites
  (#ECE9F2/#FAF6F4) read as one tone; refs/chars/03b has a visible light/mid band (inner band ≥ 12 % darker).
- (critic-hound-r1) Dust motes 3×2–4×3 texels read as pebbles next to a 0.55 m companion and stepped against the pose's twos.
  Workaround: no step/land dust in the hound's `fx.map`. (Backlog: fx scale + phase.)
- (fx) Determinism: t = 0.8 alone vs `--times 2.0,0.3,0.8` → identical. FX listen to `ch.on('reset')`; all FX state = birth
  times + stepped functions of t.
- (lead) Treadmill (pinned) walk/run copies emitted world footstep dust into neighbour cells. Rule: no FX on pinned copies.
- (lead) Dust/spark Points drawn with no motes cost a draw call. Rule: hide FX objects when nothing is alive.
- (fx-r5) **Smear at every facing, measured** (fx light px per facing = pixels that differ from the `fx=0` render, 8-facing
  contact still, min facing as % of best): wanderer attack f7 4 % → 33 % (E 117 → 342 px, NW 39 → 301), keeper thump f14
  12 → 42 %, hound pounce f12 23 → 42 % (SE 39 → 169, N 54 → 185), duelist lunge (stab sockets) 6 → 32 %; duelist spin f6/f8
  absolute px unchanged (min 361/589 px). Cause: the swing plane edge-on to the view. Fix (smear.js `tilt` 35°): measure the
  ribbon's AREA normal (not the swing axis G: blades twist), and if it is < 35° off edge-on rotate the ribbon about its own
  on-screen line through the hilt midpoint, the leading tip toward the camera; plus `front` 0.12 m depth bias (ortho → no
  screen shift) so a crescent through the chest plane survives at N. Rule: use the module defaults; never `tilt: 0`.
- (fx-r5) **Camera not updated at birth**: the first `tilt` version made the duelist spin WORSE (min 65 → 2 %): poses are
  simulated before the first `camera.update()`, so `cam.getWorldDirection()` was the default horizontal view and a horizontal
  spin looked edge-on (35° tilt into the ground). Rule: FX derive the view basis from `engine.camera.yaw/pitch`
  analytically (smear rows/cells too — they used `cam.project` on the stale camera).
- (fx-r5) Thrust smear exists now: `smear: { socket: 'weapon', kind: 'thrust' }` on the contact key (no tip sockets). A face-on
  tapered streak from the previous tip (−0.15 m) to the current tip + 1-texel speed lines, `front` 0.45 m so it is not hidden
  behind the body at N; a stab straight at/away from the camera becomes a short horizontal glint. Duelist lunge f5: 8/8
  facings show a streak (N 13 px = weakest: author a 15–20° yaw at contact).
- (fx-r5) Hold-safe FX: every fx.js kind steps at 15 fps (2 grid frames per drawing, in phase with its birth) and lives whole
  drawings; the old dust stepped at 10 fps against the pose twos. Vote test (raise + hold 36 frames): 3 sparkles, then 0
  changes (`vote.hold_redraws 0`, `final_hold 0.33 s`). Smears are built only when the displayed KEY changes (a dynamics
  redraw of the same key never builds a second smear, minAngle 0 included).
- (fx-r5) **Hit flash strobed**: tones one per 30 Hz frame + the pose change = 3 consecutive changing grid frames
  (`hurt.strobe 3` FAIL on wanderer/keeper/hound/duelist; `fx=0` → 1). Flash tones now one per drawing (2 grid frames each):
  `hurt.strobe 2` PASS. Rule: hold the hurt key ≥ 4 flash frames + 2 = 6 grid frames.
- (fx-r5, critic-hound-r2 follow-up) Spark drawing 2 = 8 sparse gold dots over the dark paw = checker clod again. Now a
  continuous 1-texel light ring (2 drawings total: solid plus, ring). Dust motes scale with height (`clamp(H/1.5, .45, 1.3)`:
  hound 0.55 m → 1–2 texel motes) and stay light (dark tone only in the last 15 % of life; dark motes read as pebbles).
- (fx-r5) Cast emotes (fx.js, event names on clip frames): `speak` (bubble beside the head, dots type in, 0.4 s — put it on
  frame 0 of the talk loop, one bubble per cycle), `vote@<hand|wing|paw>` (3 staggered 9-texel sparkles, 0.67 s), `die`
  (dust ring + 7×7 soul wisp rising 0.9 m over 1.2 s), `flap@<wing>` (2 tumbling feathers — pass `fx.feather: [vane, quill]`
  in the plumage tones), `poof@<node>` (hop take-off/landing burst), `emote:<heart|note|exclaim|question|zzz|anger|drop|star|
  skull|spiral>` (7×7 glyph with a light rim, 1 s). All read at 1× real time at vh 10 on bright grass
  (shots/fx-r5/seq-{vote,die,emote,flap}.png and `-1x.gif`). Footstep dust at game speed (wanderer 6 m/s = 4 H/s,
  `stepClips ['run','walk']`): a short trail ≈ 1 body length of 1–3 texel light motes, not smoke (seq-run6).
- (fx-r5) **Unique-to-me FX checklist for the design sheet** (per cast member): which extra parts make FX — wings → `flap`
  feathers in its own plumage tones; frogs/toads/rabbits → `poof` on take-off and landing (`land` ring); snail/greenting → no
  footstep dust (limbless: drop `step` from `fx.map`); moth → no ground dust while flying; skeleton → `die` wisp
  (+ `emote:skull`); mushroom → spores via `poof@cap`; singer (nicksong) → `emote:note`; sleepy/slow → `emote:zzz`. Attacks
  of claws/talons: `kind: 'claw'` (3 rakes); tail/leg whips: `kind: 'limb'` with the limb's tones; beaks/horn jabs: `thrust`.
  Small characters: check the 8-facing contact still — a 0.4 m figure's crescent is ~10 texels; use length ≥ 0.25 m.

- (char-clarabelle) A die that rolls onto the back shows the snout from BELOW (pink garble) and legs up = antennae;
  rolling onto the side facing AWAY from the game camera (hips out +84 for a dir-1 pack, head twist +10) keeps the
  snout + shut eyes visible at S/SE/SW and reads "down" at 8/8 (`z-g8c.png` row 2 vs rows 3–4; A/B via a `dead=` JSON
  URL param in a variant spec).
- (lead, wave-3 merge) **(recurring: clarabelle, requin, progress, preservation, opal — FIXED by the lead)** The talk loop's
  first speech bubble died at grid 12 and came back at the 2nd beat; fx now looks ahead to the clip's next speak beat
  (Module backlog). Remove the "first speak at f2" / "two speaks per loop" workarounds. Also (opal, mole) `hit@<socket>`
  on a non-weapon socket spawns 0.51 m forward unless `fx.sockets.<s>.length: 0`; (preservation) glyphs draw ≈ 0.14·H +
  5 texels above their node.

## Night, lights and emissives

- (critic-moth) **(recurring: keeper, moth)** No `spec.lights`: Lumen's warm pool exists only in `shots/char-moth/night.js`,
  so packs/bakes show a 2×3 near-white glass speck. Until look ships it, use the warm mid (#FFC864) for night glass, not
  the near-white hi.

- (keeper, look) Emissive glow without shared-code changes: a characterMaterial `tones` hook keyed on the slot's exact mid
  colour (distance < 0.03) writing emissive; night = `1 − smoothstep(0.35, 0.6, luma(uRampHi))` (night 0.29, golden 0.64).
  The engine has NO time-of-day flag (`engine.style.timeOfDay` undefined: the first light gate kept the light at 0). Stepped
  flicker at 7.5 Hz (toon.js `hash12` via Math.imul) changed px only on even 60 Hz frames.
- (critic-keeper-r1/r2, keeper r2) **(recurring, both keeper rounds)** Judge a character light in the scene, by the ground
  pool AND the signature under it. On teal night grass a warm light adds toward olive: `#FFC46B`@1.6 → pool (103,125,109);
  `#FF5A28`@2.6, distance 2.4 → (104,119,102) amber core. r2: pool khaki-amber but the whole pale cloak turned rust-red (hood
  lost its value step) and the pool (~4 m) was bigger than the figure; glass #F3E9B9 pale cream, not warm. Rule: push the
  light red-orange, keep the signature's value step under it (intensity ≈ 1.4, distance ≈ 1.6 m for a 1.25 m figure), night
  glass hi toward #FFC060.
- (critic-duelist-r1, critic-hound-r1, critic-keeper-r2, critic-duelist-r2) **(recurring, 4 critic passes)** The night
  scene is not frozen by `t=`: the stage lantern flicker, the glow `uTime`, grass wind and cloud shadows run on engine time
  (`t=1`, engine 0.1 vs 0.5: 200k px over the frame, 5941 in the figure box; keeper glass 23 px). Night pans and freezes are
  unusable. Rule until fixed: night pan/freeze tests pass `lantern=0&cover=0`, and an emissive character cannot be
  freeze-tested at night at all — say so in the report.
- (keeper) There is no `spec.lights`: the keeper's PointLight exists only in scene code (`attachLantern`,
  shots/char-keeper/night.js), so no pack or game scene shows it. Rule: render the light with your own scene copy and say in
  the report that the light is not part of the spec.

- (char-storyteller) **First spec.lights user.** A warm `#FF9A48` light on a `lanternGlow` socket with intensity [0, 0.7, 1.5]
  (day / dusk / night), distance 1.7 and flicker { fps 7.5, levels [0.62, 0.78, 0.9, 1], seed 23 }. The glass shader keys the
  same hash on `uCharTime` (`hash12(vec2(floor(uCharTime·fps), seed))`) and only for bind y < 0.8, so the eyes (same glow
  slot) stay steady while the glass flickers. night_freeze 0 px and night_pan 0 px, `shots/char-storyteller/p3/scene-night-crop.png`.
  Rule: use spec.lights + uCharTime; no scene copy is needed any more.

## Quadrupeds

- (hound) The runtime has no quadruped gait: the hound drives the biped Gait through invisible gait legs and FK-solves its
  4 visible legs per key. With `legIK: 'pose'` paws are exact at pose frames (≤ 0.5 texel between drawings) but ride the
  gliding root inside each hold (walk 1.42 / run 4.18 at dir 1; 8.99 / 11.56 at dir 2) and swing round the root on turns
  (13.4–15.8). Invisible gait legs' recovery steps bump drawing ids (13–20 per turn) with no pixels. Rule: audit with raw
  pixel diffs, not id counts; measure foot slide at dir 2 by hand.
- (hound) A second part in the signature slot overlapping it from behind (tail tuft) drew an inner line inside the
  signature (isolated_px 6). Rule: accessories that can overlap the signature use another slot.
- (critic-hound-r1) Hind basalt shin + paw read as a J-hook/hoof; a chamferBox tail tuft got a full inner-line ring at dir 4.
  Rule: paws centred under the hock (q ≈ 0 in stance); small round accessories are hulls/lathes, not boxes.
- (critic-hound-r1, hound r2) 1–2 px eyes in the glow sh tone gave no expression; 2×2 texels (0.07 m) set forward and out
  so they catch light at S/SE/SW read.
- See also Poses (head pitch ±35°, leap), Smears (claw), Locomotion (bob ≥ 1 texel), Measurement (height_px, foot_slide).

- (char-mushroom) `final_hold` FAILed on vote (0.2 s) and die (0.0 s) although both clips hold: the vote sparkle
  (~0.8 s) and the die soul wisp (1.2 s) still changed px at the end of the pack window (clip length + ~24 frames).
  Remedy: repeat the final key ≥ 20 frames later (the game holds it anyway) and use `land` instead of `die` FX when the
  wisp would outlive the window → 0.87 s / 1.0 s PASS.

## Measurement and tools

- (lead, wave-2 merge) **(recurring: honk, chonk, green-hood; wave-1 goat, fox)** `die.foot_slide` FAILed on the collapse
  itself (honk 8.94 legs folded before the fall, chonk 8.33 roll, green-hood 3.13 topple): stance is decided by height.
  **Partly fixed (lead, wave 2, `tools/charcheck.py`):** die foot_slide > 1.5 is now WARN with a note, the number kept —
  judge planted feet before the fall key by eye. honk: `-- 28 pass, 5 warn, 1 fail` → `28 pass, 6 warn, 0 fail`, no
  other row changed (`shots/lead-w2/{A,B}-honk/report.txt`).
- (lead, wave-2 merge) **(recurring: snail, chonk, rabbit, toad, mole)** charcheck rows that PASS what the eye fails, new in
  wave 2 (all in backlog → tools): `game.readable` counts pose IDS, not visibly different drawings (snail 4/4 with 1 distinct);
  `pose_read`/`hold_redraws` never compare key to key (tinker); no contact-drawing foot-visibility row (chonk buried feet,
  rabbit boots in the dress); no per-drawing head-height row (chonk's one-sided bob); no prop-clearance or "identity prop
  leaves the silhouette" row (mole hammer, toad scroll); "60 Hz in-hold" reports root travel for FK feet (rabbit 11–14).
  Rule: those checks are yours — 8-facing stills of every key, per-drawing crops at dirs 0/1/2, and a key-green silhouette row.
- (lead, wave-2 merge) Tool traps (one member each, cheap to avoid): `tools/shot.sh` output basenames containing `-k`
  (e.g. `g8-k-ring0.png`) fail with "unsupported mime type null" — use hyphen-free tags (mole); JSON query params must not
  contain `#` (it starts the URL fragment; omit `#` in palette variants, toad); `tools/remote.sh` quotes every argument with
  `printf %q`, so a zsh `$VAR` list arrives as ONE argument — use arrays (mole); a bone at pos [0,0,0] under another bone
  gives NaN geometry (page_errors 44) without naming the bone (toad).
- (lead, wave-2 merge) **(recurring: mole, green-hood, honk, toad, chonk)** The Read tool shows only the first GIF frame:
  judge 1× motion from `game-onion.png`, `clip-game.png`, raw 60 Hz frames cropped per drawing, or your own 1× frame
  sheets — never claim a GIF "reads" from its first frame.

- (lead, wave-1 merge) **(recurring, 7/8 cast: frog, fox, owl, crow, goat, skeleton-chef, mushroom)** `char-stage frame=`
  on LOOP clips is offset by the action start `at` (default 0.25 s = +8 grid frames): talk frame=0 renders talk:6, idle
  frame=54 renders idle:62. One-shots are correct. Cause: the frozen clock is `(frame+0.5)/fps + at`, and loops start at
  0. Rule: add **`&at=0`** to every key still of a loop clip (idle, talk, ghost) and confirm the `p` field in the shot log.
- (lead, wave-1 merge) **(recurring: fox, goat, mushroom, owl, frog, moth)** `--bake --cell N` "isn't honoured": it is.
  N is the SQUARE render cell; the json/printed cell is that square trimmed to the union bbox (+1 px, symmetric width), so
  `--cell 132 → 62×71` is normal and a printed height = N means a drawing reaches the top. Prefer no `--cell` (auto growth
  ×1.35 up to 3 times). Documented in `tools/bake.py` usage (lead, this merge).
- (lead, wave-1 merge) **(recurring: mushroom, goat, crow)** `refs/cast/_src/gamespeed_gif.py` crops the feet/cap/staff of
  figures ≥ 1.3 m or wide caps; `game-1x.gif` shows a ≈ 16 px figure in a 321×233 frame. Use `clip-game.png` and
  root-following crops from `raw/clip-game` instead (refs/tools backlog).
- (lead, wave-1 merge) **(recurring: mushroom, crow, owl, moth, fox, goat)** charcheck passes things the eye fails:
  foot_slide n/a passed floating boots (no connected-component check); face_lit 96 % with the face under a brim (counts
  only visible face px); sig_ground golden PASS on a shade-side colour; hold_redraws 0 with a 104 px pop in final_hold;
  die.foot_slide counts a roll; turn.foot_slide 3.4–4.3 for everyone. Rule: those rows are hints; the 8-facing stills
  and raw diffs are the evidence.
- (critic-moth) Walk stills: `grid=turnaround&clip=walk` ignores `frame=` (procedural gait, no travel). Take walk
  contact drawings from `raw/clip-game/` frames at dir 1 and a `--dir 2` pack, or a variant spec freezing one drawing.
- (critic-goat) `charpack --clips game` without `--preset cast` drives no travel (game.readable 0 H/s) and overwrites the
  main pack's raw directory: always pass `--preset cast` or a separate `--out`.

- (lead) charcheck reported `inner_lines 0` for every character: outlineDebug paints linear (1, .05, .05) = sRGB (255,63,63)
  and the test wanted G,B < 60. Rule: calibrate every colour-keyed check on a render where the colour exists, and give every
  check a negative test (a `material: { outline: 'full' }` wanderer copy FAILs).
- (lead) Inner lines legitimately touch the silhouette. Rule: world lines = red(plain) ∧ ring ∧ ¬red(key render).
- (lead) A camera following an actor with a continuous target shifted the WHOLE image 1 px every 2–4 frames. Rule: follow
  `camera.snapWorld(pos)`.
- (lead, tools) Drawing ids: the stage logs `d` = pose id + redraw counter + FX state while an FX object is visible
  (`fxSignature`); strips dedup on `d`, flicker uses `d`. Before the tools fix, gait `step` events tagged every grid frame.
  Rule: a drawing id may only change when something drawn changes; when auditing loco flicker by hand, diff on the pose id `p`.
- (tools) Key-colour masks: pure #00FF00 survives the linear → sRGB round trip, so `pixel != key` is exact. Disable clouds on
  key/plain renders (drifting cloud shadow put 2–10 px on a travelling character).
- (tools) 60 Hz cadence checks sample at t = (i + .5)/60. The engine also renders t = 0 at start-up: align logs by t.
- (critic-wanderer) Sorting raw frames with `sorted(listdir())` puts f-100 before f-11 and manufactured 417 px of flicker.
  Rule: index raw frames by the job's `times` list.
- (tools) charcheck rows added after the wanderer critique (each validated on the critic's old pack): `single_frame`,
  `isolated_px` on the signature (largest connected piece of the slot, closed by 1 px), `face_lit`, `pan`. Rule: every critic
  finding measured by hand becomes a row. Lab weights [0.5,1,1] put steel/skin texels in the hat slot: region checks take
  the largest connected component.
- (tools) `pan=dx,dy` is built into char-stage; a wrapper scene that also reads it pans twice. Sub-texel pans give an
  identical figure but disagree with logged root px: pans in tests are whole texels.
- (tools) Any `console.error` in a module is a page error in every job (page_errors FAIL). Debug prints use console.log.
- (tools) Mannequin reference numbers (vh 10): height 46–50 texels, head 0.28, facing-area variation 31 %, 0 outline px,
  0 edge-highlight px, deterministic.
- (critic-hound-r1/r2, critic-keeper-r1/r2, critic-duelist-r2) **(recurring, 5 critic passes)** charcheck blind spots that
  let every new character pass rows it should fail — all still open (Module backlog → tools): (a) FX and dynamics redraws are
  exempt from `single_frame`/intervals, so `1x7`/`1x8` runs and 3–4 drawings per hold pass; (b) `walk.foot_slide` uses every
  60 Hz frame inside held drawings (keeper 1.21 FAIL, true pose-frame slide ≤ 1.02; a 1-texel `pos.x` sway = 1.15) and only
  `bones.feet` at the pack facing (hound hind paws only: 1.42 at dir 1 vs 8.99 at dir 2); (c) no signature-vs-grass row (lit
  or shade); (d) no per-facing hi/mid share of the signature/accents; (e) `height_px` 45–62 FAILs every companion;
  (f) `isolated_px` runs only on the idle turnaround (the parry's dotted sash was invisible to it); (g) one signature slot
  only. Until fixed, the playbook's Stage 6 makes the author measure these by hand.
- (duelist r2) `charpack --only turnaround` rewrites report.txt with clip rows left from the last full run on the remote:
  easy to mistake old clip numbers for fresh ones. Rule: only trust clip rows from a run that rendered those clips.
- (motion) Fastest audit of drawing timing: run Character headless in node (fake engine, `autoUpdate false`,
  `update(n/60)`) and log `pose` events → exact per-drawing grid frames in < 1 s (shots/motion/holdlog.mjs).
- (motion) Determinism check: t = 12.37 alone vs after 3, 9.5, …, 12.2 → 0.00 % changed px; re-simulating 10 s is ~600 steps
  and costs nothing visible.
- (tools r06) **Game-speed aliasing is now measured, not guessed.** The Character's gait ids are
  `<gait>:<clip>:<frame>:<cycle n>`; charcheck counts the cycle from the cycle counter and the drawings SHOWN per cycle.
  At 3.95 H/s all four run-04 characters settle in `run` with a 6-drawing cycle that lasts 6–7 grid frames: only 3/6
  drawings reach the screen and the subset drifts (`024` … `135`), which is visible in `clip-game.png` (the pose pattern
  changes after f38). Old `game.readable` PASSed on foot-0 touchdowns (0.28 s, 1.12 H). Rule: a game-speed gait needs
  cycle ≥ drawings × hold (motion backlog: lock the cycle at game speed); `game.readable` FAILs on aliasing.
- (tools r06) Foot-slide pairs across a clip switch are re-poses, not slide: the hound's `walk.foot_slide 7.3` was the
  idle → walk lead-in; inside the gait its paws hold within 0.005 m (0.92 texels drawn). Its remaining 3.6–4.4 at run/game
  speed sit in the walk → run acceleration and the run itself (real; quadruped gait backlog).
- (tools r06) `final_hold` must also test that the last pose is NOT idle: a test die clip (hound hurt without its
  recovery key) still ended on the idle pose after 0.5 s in char-stage, and the old row (no change at the end) PASSed it.
- (tools r06) Bake loop detection read the cycle counter of 4-field ids as a drawing counter → 60-frame walks / 3-frame
  runs. Rule: repeat = same frame, next cycle counter, searched from the 2nd drawing of the gait the clip settles in.
- (tools r06) bodyPlan names must match the spec vocabulary (CHARACTERS §3: uprightAnimal, limbless, longNeck…); a name the
  tools do not know used to fall back to biped silently. Unknown names are now flagged; undeclared quadrupeds inferred.
- (tools r06) A dark signature in the pillar shadow (duelist hat −27 % L vs shaded grass) reads; only ±15 % is lost.
  `key_speckle` (isolated px a held action key adds) catches the duelist parry's dotted sash (+16) the idle-only row missed.
- (lead, wave-3 merge) **(recurring: polly, requin — FIXED)** `cast_clips` PASSed without point/ghost/ghost-spent because
  the preset omitted them; now required (run optional). **(recurring: requin, opal — FIXED)** charcheck crashed on a clip
  with FX on every frame; steady talk bubbles now measure islands/key_delta on the `nofx-talk` copy.
- (lead, wave-3 merge) **(recurring: critics of mincut, preservation, polly, clarabelle)** Checks the critics did by hand
  and nothing flags: signature outside the body outline per facing, face-detail shimmer, flat-prop area per facing, main
  slot hue in golden/shade, weapon read of a held prop (backlog T25, T27). Until built: 8-facing key-green silhouette
  rows of every held key + a 1× "what would a stranger call this prop" line in the sheet.

- (char-greenting) **Bake cell runaway from a WIDE lying die pose:** a die lying sideways that spans the 62-px render cell's width (figure box x 2..60) made `bake.py` raise the bottom pad on every growth pass (trimmed cell 48 → 54 for idle+die, 154 px for the full cast preset, heads cut at the cell top). Workaround: an explicit `--cell 112` (no border touches, trimmed 58×65); with FX the speech bubbles were cropped at E/NE/N, so the shipped bake is `--q fx=0`. Bisect a bad bake with `--clips idle,<clip>` per clip (≈ 10 s each).

## Process

- (lead, wave-2 merge) **(recurring: rabbit, green-hood, mole; wave 1 duelist/keeper)** A claim in the sheet/learnings that
  the author's OWN evidence contradicts: rabbit wrote "lift < 0 hides the boots" while its `dir2c/clip-game.png` shows boots on
  the chest; green-hood claimed "void + 2 lanterns" without an SE/SW ×8 check; mole claimed a goggle jolt and apron kick that
  are sub-texel at 1×. Rule: every "fixed"/"reads" claim cites the file + frame + facing at ×8 where you LOOKED; anything else
  is written "not verified".
- (lead, wave-2 merge) **(recurring: 6/7 wave 2)** Module notes reported fixed bugs as open (M1/M3/M5) because the fix
  merged mid-round. Before writing a workaround or a backlog row, re-read the playbook's module-fix banner and A/B the
  current tree (A, B, A′); name the tree time in the row.
- (lead, wave-2 merge) **(recurring: chonk, toad critic)** Skipped cast members (pipeline/skip.txt, nicksong) must be left
  out of line-up commands entirely: a hook blocks any Bash command that mentions one, and the whole line-up silently failed.

- (lead, wave-1 merge) **(recurring: mushroom, fox, goat, crow, frog, skeleton-chef — 6/8)** Parallel agents share the
  scratchpad root and the render host tree: generic helpers (`g8.sh`, `zoom.py`, `keys.sh`) were overwritten mid-run,
  one call rendered another character's stills, a critic overwrote another's remote silhouette, and `tools/remote.sh`
  pushed the Mac's stale `out/` over a fresh remote bake. Rules: helpers only in `<scratchpad>/<id>-r<n>/` or
  `shots/char-<id>/` with your id in the file name; never write outside your own `shots/{char,critic}-<id>*/`; bake with
  `--out shots/char-<id>/bake` and copy into `out/sprites/` last; Python helpers go in `shots/char-<id>/*.py.js` (only
  `shots/*/*.js` syncs) and composites come back with `rsync -az 'render-host:pixel3d/shots/char-<id>/…' shots/char-<id>/`.
- (lead, wave-1 merge) **(recurring: frog, mushroom, moth, owl, skeleton-chef, fox)** The design sheet goes stale in the
  fix round (frog cape/WEAPON.rot, mushroom palette/die direction, moth "wings up into a V" vs WINGS(16, 88), owl unused
  EYES(), skeleton-chef header says LegGait + left arm). Rule: the last step of every round is rewriting Unique-to-me,
  proportions, palette, timing charts and the self-critique from the CURRENT code and renders; a stale sheet caps #9 at 1.
- (critic-fox, critic-owl, critic-moth) **(recurring)** Unrun evidence still scored 2 (fox Silhouette/Expression, owl
  Line quality, moth three criteria): the 7.2 cap rule applies to the author's own "NOT run" lines.
- (critic-skeleton-chef) One trivial python3 ran on the Mac by mistake: wrap every helper in `tools/remote.sh`.

- (critic-wanderer, everyone) **(recurring, 4/4)** One facing lies. Rule: author and judge actions on the 8-facing key grid
  (`grid=turnaround&clip=<c>&frame=<f>&fx=0`, one still per key) — cheaper than 4 `--dir` packs and it includes dir 1, the
  game facing that the 0/2/4/6 recipe skipped (duelist parry vanished exactly there).
- (critic-duelist-r2, critic-keeper-r2) **(recurring: duelist plume, keeper prop)** A fix verified in a different render from
  the one that showed the problem moves the problem instead of fixing it: the duelist's witch hat was "fixed" in the
  turnaround but was seen (and stayed) in the golden scene crop; the keeper's face clash was fixed at S/SE/SW and moved to E.
  Rule: re-verify every fix in the SAME render that showed it, plus the 8-facing still.
- (critic-wanderer) Variant specs for A/B without touching the owner's file: `char=../shots/<dir>/wv` importing `make()`/
  `CLIPS` and overriding parts/clips via a URL flag; `wv=` (no flags) must be pixel-identical to the real spec. remote.sh now
  syncs `shots/*/*.js` itself. Numeric variants via URL params (`wv3&cf=…&cz=…`) + a 15-line PIL raw diff answered a chain
  question in 3 renders (hound r2); JSON-pose variants (`wv={"clip":…,"f":…,"pose":{…}}`) did 3 arm variants × 5 facings in
  one batch (duelist).
- (critic-hound-r1, critic-keeper-r1) **(recurring)** `ssh host bash -s < batch.sh` (and xargs/printf variants) is blocked
  by the permission classifier (the keeper critic's next two Bash calls were refused as well), and the xargs variant mangled
  `&` in `--q` so every still silently rendered the mannequin. Rule: only `tools/shot.sh` / `tools/charpack.sh` /
  `tools/remote.sh`, one call at a time; check `stats.char.name` / the image before trusting any batch.
- (keeper, critics) **(recurring, all 6 critic passes + keeper)** Host mismatch: briefs say game-host; the tools default to
  render-host (changed at 21:41 mid-session), so packs landed in different remote trees and rounds rendered on different GPUs.
  Rule: pin `PIXEL3D_HOST` for the whole session to the host the brief names (`PIXEL3D_HOST=game-host tools/charpack.sh …`)
  and check the GPU line in the shot log (RTX 3060 = game-host, RTX 4090 = render-host); re-run the final pack in one go there.
- (keeper r2) zsh does not word-split `set -- $v` in a for loop: renders wrote files named `night-FF6A20 2.0 2.6-.png`.
  Write explicit commands or arrays when looping over parameter sets.
- (look) The scratchpad is shared: keep helper scripts in `scratchpad/<agent>/` with distinctive names.
- (look, lead) Others edit files while you render (face_lit 59 % → 47 % on the same geometry 10 min apart; a stray
  `console.error`). Rule: A/B in the same tree state (A, B, A again; A == A′), and re-run a surprising check once before acting.
- (rig) Axis checks: one row of 8 characters per render (`_test-rig?poses=a;b;…&face=45`), 3–6× nearest crops; put the
  expected screen direction in the shot name.
- (fx) 60 Hz strips around a smear key (`--times c−1/60, c, c+1/60 …`, 4 yaws) compared with refs/chars/03b; 5-decimal times;
  clip-local contact = play time + key f / 30.
- (motion) Root-following crops (log the snapped root px, crop ×4 per frame) are the fastest gait audit; GIFs at the ref zoom
  need vh scaled with the canvas rows (960×540 at scale 3 → vh 5).
- (tools) `tools/charpack.sh` instead of hand-rolled loops (10 parallel loads, ~25 s); render 1× and enlarge with nearest.
- (process, run 05) Self-score inflation (3–7 points in run 04) is now handled by PLAYBOOK Stage 7: an evidence table in
  the design sheet where every score cites a file + facing/frame + number, and any criterion whose evidence item was not
  rendered is capped at 1. Every **(recurring)** bullet in this file is a checklist line (**R**) in the playbook; when you
  mark a new bullet (recurring), add or extend its **R** line there too (process/lead owners).
- (process, run 05) The old playbook told authors to pin `PIXEL3D_HOST=game-host`; game-host is the live game server and is
  now forbidden. All renders go to render-host (the scripts' default); check `RTX 4090` in the shot log.
- (process, run 05) A cheap 1× real-time GIF at the game camera: `tools/shot.sh char-stage … --q 'scale=1&char=<n>&clip=walk&dir=1&bg=meadow&speed=<4H>&fx=0&cover=0' --times <30 times 1/30 s apart>`,
  crop round the followed root (320, 205), save frames at 33 ms with PIL; also paste the 12 frames side by side at 1×
  (the ×3 strip flatters small leg motion; the 1× sheet showed it was invisible).
- (refs, run 05) **Read the identity source before choosing a body plan.** The brief listed fox/goat/cow/red panda/otter/
  hedgehog as "quadruped or upright animal" and frogs as hoppers; the v2 sheets (`refs/cast/_all.png`) draw ALL of them
  upright and clothed, chibi (heads 40–55 % of the height, legs 0.10–0.20 H), with a 1-drawing idle and a 4-drawing walk
  whose only motion is a 1-px bob. Only honk/chonk are horizontal birds and only the snail is limbless. Rule: pick the plan
  from `refs/cast/<id>.png`, never from the species word (CAST_PORTING §2, §6); keep the chibi head (2.2–2.8 heads) and
  accept that short legs force a bounce/hop at game speed (§8).
- (refs, run 05) v2 scale for the port: H ≈ 0.04 m per v2 sprite px (25–39 px → 1.05–1.56 m, 38–56 texels at vh 10),
  which keeps the cast's relative sizes (`refs/cast/_lineup.png`). A real-time comparison GIF (v2 sprite at its in-game
  13 fps next to root-following 1× pixel3d crops at 30 Hz): `refs/cast/_src/gamespeed_gif.py`.

- (char-mole) zsh never word-splits `$A`: `tools/remote.sh python3 x.py $A` passes ONE argument (printf %q). Build
  arrays: `A+=("…")` then `"${A[@]}"`.
- (lead, wave-3 merge) **(recurring: polly critic, preservation critic, opal, honk)** zsh does not word-split `$v` in a loop
  (`for k in 'vote 3'; set -- $k`): stills silently rendered idle:0 under the wrong names → explicit commands or
  `bash -c '…'`, and check the `p` field of every still. **(recurring: clarabelle critic, progress, mincut critic, lead)**
  `python3` typed on the Mac (no-op json reads, empty heredocs) — never; `tools/remote.sh python3 …`, env vars via
  `tools/remote.sh env X=1 …`. Bakes stay in `shots/char-<id>/bake/` (agents do not own `out/sprites/`; progress, opal).
- (lead, wave-3 merge) Self-scores were honest (−1…+1) except where a facing was never judged (preservation +3: E/W profile
  and the vote at E/W). Authors that skipped the 25 % line-up (polly, mincut) missed their weakest S/N read.

- (char-greenting) **The identity reference can change mid-run — re-read `refs/cast/<id>.png` when the lead relays a user note.** Greenting r1–r2 (gumdrop + duck-bill snout, footless hop on LegGait 'glide' with an authored 4-key hop: 4/4 drawings, 0 FAIL on the first pack) was replaced by the user's Joguman reference (long tube body, stubby arms/legs, face toward the snout end). The rebuild took ≈ 1/3 of the run because the probe tooling (a `pp=<JSON pose>` variant + an 8-facing crop/zoom script in `shots/char-<id>/`) was already in place: keep those helpers generic from the first hour.

## Body plans and cast scale (rig r6)

- (rig r6) **Two modules exported the same names** (`BODY_PLANS`, `gameSpeed` from rig.js AND locomotion.js, written in
  parallel): `export *` in src/chars/index.js silently drops ambiguous names, so `import { gameSpeed } from
  'src/chars/index.js'` would throw. Rule: after adding exports run `tools/remote.sh node tools/charexports.mjs` and
  want `dups []`. Rig's are now `RIG_PLANS` / `planGameSpeed`; motion keeps `BODY_PLANS` / `gameSpeed`.
- (rig r6) Three vocabularies for the same plans (CAST_PORTING / charcheck `uprightAnimal, limbless, flier, longNeck`;
  LegGait `biped, bird, quadruped, hop, glide, fly`; rig `chibi, upright, longneck, moth, hopper, limbless, blob`).
  Rule: `planInfo(word)` resolves any of them → `{ rig, check (spec.bodyPlan), locomotion (spec.locomotion.plan) }`;
  template meta carries `meta.locomotion` too.
- (rig r6) The templates' first defaults were sized like the hound (0.5–0.8 m) → snail 21 px, hopper 19 px, blob 20 px,
  all below their charcheck bands and 23–36 % presence. The cast is 25–39 v2 px = 1.05–1.56 m (0.04 m/px). Rule:
  `RIG_PLANS[p].build({})` = cast scale (chibi 1.2, bird 1.24, moth 1.1+hover, hopper 1.0, snail 1.05, longneck 1.52);
  `castHeight(px)` for a member. At cast scale all plans PASS height_px and presence (`shots/rig/r8/cast-*`).
- (char-snail) Scale offsets inherit: stretching a stalk (`stalkR.s` y +0.75 for the vote) stretches the goggle on its
  tip into an oval; counter-scale the child (`eyeR.s` y = 1/1.75 − 1 = −0.43; combine multiplicatively with any blink /
  wide value). Same trick hides stalks in the die (stalk ×0.2, eye counter −0.6). Shell spiral that reads at 8/8 facings:
  a 12-sided wheel lathe about X with flat side caps (r 0.66 R) + an Archimedean spiral ribbon (`K.extrude(poly, 0.016,
  {axis:'x'})`, 1.2 turns, 0.05 m wide, dark slot) on each cap — the ribbon edges cost 5–9 isolated px per facing;
  cutting it coplanar into the cap (mushroom-spot method) is the next step. Paw bones with axis 'down': raising a prop
  forward-up is POSITIVE fwd (a −70 key pushed the gear into the body).
- (char-snail) The `hurt` event on a die key flashes the whole figure white for ≈ 8 frames — Clocktower rule says no
  hurt reactions: drop `hurt` from cast die clips.
- (rig r6) Most of the cast needed a plan the brief did not name: the upright CHIBI (2.5 heads, leg 0.25 H). Built as
  `chibi()` = uprightAnimal(heads 2.5, legs 0.7); with the real Character + LegGait at 3.95 H/s it plays a 4-drawing skip,
  cycle 0.283 s / 1.12 H, holds 2–3 (`shots/rig/r8/plan-chibi/`). Rule: a template's default `meta.gait` must be the
  gait it can actually do at game speed (leg < 0.3 H → 'skip', duty 0.18), not the stroll it was drawn for.
- (rig r6) The fastest way to prove a template against the REAL runtime is a tool path, not a scene: the mannequin's
  default export becomes `makePlan(plan)` when the page has `?plan=` → `tools/charpack.sh mannequin --q plan=<p>` gives
  turnaround, walk/run/game strips, 1× GIFs and charcheck rows for any template in ~25 s. Node imports are unaffected.
- (rig r6) Plain `walk` clips in charpack run at the stage's walk speed, not the game speed: `walk.foot_slide` 0.99 PASS
  while `game.foot_slide` was 8.9–23 FAIL on the same rig (bird, upright, quadruped, longneck). Read the `game.*` rows.
- (rig r6) Rig refactors are proven by a rig-only A/B: two copies of the tree on render-host, B with the old rig.js, the same
  charpack in both, raw frames diffed (scratchpad `abrig.sh`): wanderer/keeper/hound/duelist 0 px differ over ~5000
  frames for the whole r6 template round.

- (char-cilantro r1, long neck) **A custom skeleton with biped bone names is the fastest long-neck build**: world joint
  table → parent-relative pos, 3 keyed neck links (no spring), LegGait `plan: 'biped'` + `plant: 'hold'` +
  `cycleTime 0.267` gave 4/4 drawings, 0.267 s / 1.05 H on the first render (`shots/char-cilantro/final/report.txt`).
  The neck pump lives in an authored `clips.walk` with `blend: 'add'` (length 4): 14° on contact read as pecking, 9°
  (+ head −8 counter) ≈ 3 texels of head travel reads as a giraffe lope. Neck tube = one ringHull per link, extended
  0.07 m below its joint and blend-skinned to the parent (span 0.05): no seams at ±35° bends, and `<link>.p` +0.05 m
  per link telescopes the neck (+0.15 m emote) with the overlap hiding the gap.
- (char-cilantro r1) **Giraffe patches: whole hull facets, not round spots.** Round centroid-cut spots (≈ 0.07 m) on a
  7-texel-wide neck gave isolated_px 9–19 per facing; selecting whole facets of the 8-sided neck hull × 0.09 m rows by a
  seeded hash gives crisp ≈ 3×3-texel blocks (sig.hide iso max 15 → patches no longer the main source; ear tips and
  ossicone roots remain). Keep ≈ 55 % of cells or the neck reads plain at SE.
- (char-cilantro r1, die) Long-neck die (extends the honk note): roll the body onto its side (hips out 84) AND tilt the
  neck links further out (+10…+12 each) so the neck lies on the grass; then turn the head face-up with a single head key
  ([30, −60, 10] here) — three head variants on one 8-facing still decided it in one round (`shots/char-cilantro/p1/z-wv-die*.png`).
  A mid-fall key with the neck pitched forward reads as a lunge; tilt it sideways with the roll instead.
- (char-cilantro r1, vote) A long-neck biped cannot raise a hoof above its head (shoulder 0.75 m + arm 0.43 m < head
  1.31 m); up-and-out (upperArm out 150) + `forearm.s` y +0.35 + the neck leaning away gives a V between neck and arm
  that reads at 7/8 facings (hidden behind the head at W).

## Module backlog

**Module fixes after cast wave 3 (module fixer, 2026-10-16, render-host RTX 4090; evidence `shots/mfx4/`)** — every
high/medium row cast wave 3 hit. Developed in an isolated copy (render dirs `pixel3d-fix` / baseline `pixel3d-base4`),
copied back in one step. Files: `src/chars/{character,rig,look}.js`, `scenes/{char-stage,char-bake}.js`,
`tools/{charpack,charcheck,bake}.py`. **Regression A/B** (full `--preset cast` packs of all 27 finished members incl.
wanderer, raw frames diffed with `shots/mfx4/aball.py`, `shots/mfx4/ab-summary.txt`): 12 members 0 px in every job (chonk, duelist, green-hood, hound, keeper, mole, moth, mushroom, rabbit, skeleton-chef, snail, wanderer — legacy Gait or 'pin' plants); the 15 LegGait 'hold' members differ in exactly ONE frame per walk/run/game/slide job (the 60 Hz frame after the walk start, M18 below; `ev-M18-frog.png`) and nowhere else (idle, talk, vote, point, die, ghost, emotes, turnarounds, scenes, pan, night: 0 px). Report totals: no new FAIL; flicker WARN rows 49 → 13 over the 27 packs
- **Shared ghost (priority 1, recurring 13+) — FIXED (opt-in):** `spec.ghost` + per-clip ghost level (CHARACTERS.md §5
  "Wave-3 module fixes"). Opal variant with only `ghost: { hover: 0.14 }` and two plain clips (`shots/mfx4/wvopal.js`):
  pale ramp + halo / dimmer spent at 8 facings `ev-ghost-opal.png` (same read as polly's copied recipe,
  `ev-ghost-polly-ref.png`), night self-glow `ev-ghost-night.png`, baked sheet `bake-opal-ghost/wvopal-preview.png`.
  Ghost loop clips get FK legs (head 5.8 px over idle for hover 0.14 + 0.03: no 0.1 m dip).
- **M18 — FIXED:** the flicker was the IDLE drawing's planted feet re-pinned on the one 60 Hz frame between the root
  starting to travel and the walk cutting in on the next grid frame (f1 of every walk start, legs only). Hold-mode
  LegGait no longer re-pins there (`Character._holdStart`). Opal: game.flicker 63 → 0 PASS, game.off_grid 1 → 0 PASS,
  walk 65 → 2 px (two 1-px specks), run 74 → 2.
- **rig per-key arm reach (recurring 4) — FIXED:** `'<bone>.l': [k]` stretches one segment along its rest axis, children
  rigid (`ev-reach-opal.png`: the vote arm by `.l` keeps its thickness and an unscaled pebble). The vote-prop PRESET row
  stays not built (per-character keys); `.l` removes the `.s` 1.95× stick + counter-scaled prop workaround.
- **T21 — FIXED:** the cell growth was not FX but (a) a lying die pose / long neck reaching BELOW the feet anchor (only
  the pad was short) and (b) that figure, crossing into the next row, read as the next row's top touch. Bottom-only
  touches now raise the pad by the measured overflow, row touches are given to the owning cell, and FX are sized out of
  the cell (an fx=0 pass sets cell + trim box; FX outside are cropped with a warning; `--fxcell fx` = old). Render cell
  cilantro 234 → 126 (sheet 82x107 → 82x93), polly 136 → 100 (`ev-T21-cilantro-die.png`: die rows complete). Also:
  `scenes/char-bake.js` ignored `fx=0` (the documented FX-free bake baked FX) — fixed.
- **T16 (open part) — FIXED:** `game.feet_visible` row: each foot magenta (`mark=@footL`) on every game-speed gait
  drawing at 8 facings (jobs `feet-<k>-<foot>`). chonk WARN (left foot 0 px at SE in 3/4 drawings, `ev-T16-feet.png`),
  opal / polly / mincut PASS.
- **T25 — (a) FIXED, (c) FIXED, (b) PARTLY:** `sig_outside.<part>` (signature PART px outside the body rendered without it,
  jobs `hide-<i>`; polly beak 0 px at S/N, PASS 2/8), `prop_area.<prop>` (held prop px per facing in the held vote,
  `spec.props` or parts below a hand bone; preservation signTauF edge-on 4/8 WARN, mincut handleB WARN),
  `<clip>.face_shimmer` (eye slot per eye re-aligned; informative below 30 eye px — a 2x3 eye legitimately becomes 3x3
  with any head turn, so a fair shimmer test needs equal head poses: not built).
- **look whiteKeep after lift (requin) — FIXED (opt-in):** `material.whiteKeepLift k`. The cause was double: the keep
  acted on the hi band only AND its near-white gate (linear chroma < 0.18) rejected requin's magenta-pushed hi #F8E8FF.
  Requin variant (belly lift 0.35, whiteKeep 1) at golden: peach → white belly (`ev-whitekeeplift.png`).
- **(note) legs 'fk' on loop clips — FIXED (opt-in):** `clip.legs: 'float'` on any loop clip; ghost clips under
  `spec.ghost` float by default. Plain `'fk'` on loop clips is still ignored (fox/honk ghosts key it; honouring it
  would move their hovers).
- Not attempted (low): fx hit default length, look per-slot line colour, sigLift floor, M19–M22, T18, T26–T31.

**Fixed by the lead between waves 3 and 4 (2026-10-16, render-host RTX 4090; evidence `shots/lead-w3/`):**
- **fx speech look-ahead** (`src/chars/fx.js` `speech()` + `nextBeat()`): a speak event whose clip has another speak beat
  ≤ `speech.chain` (1.2 s) later keeps the bubble FULL until that beat (which cuts it and chains on). The first bubble of
  a talk loop no longer pops out at grid 12 and leaves a 0.4 s gap (seen by clarabelle, requin, progress, preservation,
  opal critics: **recurring 5**). One-off speak events (emotes) unchanged. A/B vs the pre-fix tree (`base-*` vs `fix-*`,
  full raw packs): wanderer 0 px in every job; fox only `clip-talk` changes (28/120 frames, ≤ 62 px = the bubble now shown
  at grid 12–23, `fix-fox/clip-talk.png` vs `base-fox/clip-talk.png`; 60 Hz strip: steady from frame 4, no re-pop at the
  2nd beat). The first bubble still pops in as a small bubble for one drawing (intended). Spec workarounds ("first speak at
  f2", "two speak events per loop") can go.
- **charcheck `check_clip` islands crash** (`tools/charcheck.py`): `isl[0]` IndexError when an FX shows on every captured
  frame (requin, opal: **recurring 2**) — the row is skipped instead; and a steady talk bubble's `talk.islands` /
  `talk.key_delta` now come from a new fx=0 copy (`nofx-talk` job in `tools/charpack.py`). Fox full pack: 103 pass / 27 warn
  / 0 fail, both rows back (`fix2-fox/report.txt`), raw frames identical to `fix-fox`.
- **Cast preset = the game clips** (`tools/charpack.py` CAST, `tools/bake.py --preset cast`, `tools/charcheck.py`
  CAST_CLIPS): point, ghost, ghost-spent added (7/8 wave-3 members never authored them: **recurring 8**); `cast_clips`
  requires idle, walk, talk, vote, point, die, ghost, ghost-spent + emote; run optional; the Storyteller is exempt from
  vote/die/ghost. Fox (has all): `cast_clips PASS`.

**Priority after cast wave 3 (lead, 2026-10-16)** — what blocks the most rubric points now:
1. **FIXED (wave-3 module fixer: `spec.ghost`, `shots/mfx4/ev-ghost-opal.png`)** ~~look/rig shared ghost option~~ (new, recurring 13+: every wave-1/2 touch-up and polly copied crow's ghostK flag bone
   + ≈ 60 lines of `material.tones` shader): `spec.ghost: { tint, gamma, dark, halo: socket }` + a per-clip `ghost: 1 | 0.5`
   flag. Without it every remaining member (7) copies the recipe again.
2. **FIXED (`game.feet_visible`, M18 `_holdStart`; `shots/mfx4/ev-T16-feet.png`)** ~~tools T16 contact-visibility row~~ (recurring 7 now: polly, requin, progress, opal, mincut, cilantro, preservation
   — `foot_slide` n/a for every chibi on LegGait 'hold'; contact judged only by eye) + **motion M18** hold-mode leg-only
   flicker (50–105 px on one same-pose frame per loop: 6/8 wave-3 packs).
3. **FIXED except face shimmer (`sig_outside`, `prop_area`; `face_shimmer` informative)** ~~tools T25 identity rows~~: "signature part outside the body outline per facing" (mincut tail, polly beak, opal
   tail), face-detail stability between drawings (preservation pupils), flat-prop facing area per facing (6/8 edge-on).
4. **arm reach FIXED (`.l` channel, `shots/mfx4/ev-reach-opal.png`); hidden props still open (low)** ~~rig per-key arm reach~~ (recurring 4: preservation, progress, mincut, requin) + hidden/optional props (recurring 5).
5. **FIXED (pad + figure-only cell, `shots/mfx4/ev-T21-cilantro-die.png`)** ~~tools T21 bake cell growth~~ from FX (now recurring 10: every wave-3 bake) — size the cell from an fx=0 pass.
6. **whiteKeep part FIXED (`material.whiteKeepLift`, `shots/mfx4/ev-whitekeeplift.png`); line colour open (low)** ~~look `whiteKeep` ignores~~ `slots.<x>.lift` px (requin) + per-slot inner-line colour (cilantro grey beard).

**Priority after cast wave 2 (lead, 2026-10-16)** — M1/M2/M3/M5/T1 are fixed (module fix, merged mid-wave-2); the wave-2
notes that call them open predate the merge (see Process). What now blocks the most rubric points:
1. **motion M12** dressed/short-leg contact: a 'tuck under hem' mode for LegGait (IK'd boots through skirts, rabbit; feet
   buried by squash, chonk) + **M9** a ball/squash path in the bird branch (chonk) — 5/7 lost #8 on contact drawings.
2. **tools T15–T17** the three missing rows every wave-2 critic measured by hand: key-to-key difference (snail, toad, mole,
   chonk), contact-drawing foot visibility + per-drawing head height (chonk, rabbit, mole), identity-prop silhouette
   presence / prop-over-crown per facing (mole, toad, honk, rabbit; extends T2).
3. **look** golden near-white cap (rabbit, chonk, skeleton-chef, goat: 4) and same-slot part merge (now 6: fox, owl, frog,
   toad jaw, green-hood peak, honk wing seam); `spec.lights` (keeper, moth, green-hood: 3).
4. **motion M13** last-key pop of one-shots (honk 105 px) + **tools T17** final_hold diff before the last key.
5. **motion M10/M11** squash riders, hop crouch knob; **T3** sig_ground golden-sun on lit px only (now 4: skeleton-chef,
   moth, green-hood, rabbit/chonk); **M8** hidden-leg post-turn tails (now 4: goat, hound/duelist, green-hood).

**Priority after cast wave 1 (lead, 2026-10-16)** — what blocks the most rubric points across the 8 cast members:
1. **motion M1** LegGait plays authored walk/run upper-body poses (8/8; unblocks prop carry, staff plants, ear/tail keys).
2. **motion M3 + M2** chibi contact: hold the plant per drawing, surge off for short legs, cap the body drop (8/8 glide reads).
3. **tools T1** loop-clip `frame=` offset (7/8 used the wrong key at least once; workaround `&at=0`).
4. **look** same-slot parent/child merge (speckle at ear/tuft/eye junctions, 3/8) and `spec.lights` (keeper, moth).
5. **motion M4/M5** prop plumb under lean; loop-clip dynamics.
Everything else: rows below. Per-agent "Module backlog additions" in the archive section are folded into these tables.

**Module fixes mid-run (module fixer, 2026-10-16)** — landed in `src/chars/{locomotion,character}.js`,
`scenes/char-stage.js`, `tools/{charpack.py,charcheck.py,remote.sh,pull.sh}`. Developed in an isolated copy (render dir
`pixel3d-fix`, baseline copy `pixel3d-base`), all on render-host. Evidence in `shots/modfix/` (`ev-*.png`: top row = before,
bottom row = after, same raw frames; `report-<c>-{base,fix}.txt`; harness `probe.js`, `plans.js`, `abdiff.py.js`).
- **Regression A/B** (full `--preset cast --raw` packs, raw frames diffed with `shots/modfix/abdiff.py.js`):
  moth, skeleton-chef, wanderer, keeper, hound, duelist **0 px differ in every job**; frog, mushroom, fox, owl, crow, goat
  differ ONLY in walk/run/game/slide jobs (+ the `meta` clips grid that contains them) — idle, talk, vote, die, emote,
  turn, turnarounds, scenes, pan, night 0 px. Report totals: no new FAIL; frog run.off_grid/run.flicker FAIL → WARN.
- Done: M1, M2, M3, M4 (lean cap; plumb constraint not built), M5, M6, M7, T1, T8, T10, T13; T14 not a bug. Rows below.
  The r5 chain-reset (`L.dir`) and action-hold settle rows were already fixed (r5) and stay so (0 px in all action jobs).
  Still OPEN (not attempted): M8, `_cacheChains` multi-link convergence, head-lag quant, recovery-step id bumps, the rig /
  look / fx rows, T2–T7, T9, T11, T12.
- **Module fixes round 2 (module fixer, 2026-10-16, after the wave-2 critics)** — two landings, each A/B'd on full
  `--preset cast --raw` packs of 19 cast members (wave 1 + references + rabbit, mole, snail, toad, green-hood, honk,
  chonk; nicksong excluded): (a) `shots/modfix/r2/` (M8, head lag, M13, M14, fx speech/flash/dust/events, spec.lights,
  uCharTime, material.merge, rig neck/jaw, T2–T7, T9, T20): changes only in turn, talk, die, vote, emotes (and LegGait
  run start phase at some facings, tie-break) — wanderer/keeper/duelist only `clip-turn`, hound 0 px; owl vote's 195 px
  hold pop gone; no new FAIL, die.foot_slide FAILs → WARN (lead rule kept). (b) `shots/modfix/r3/` (M9–M11, M15, whiteKeep,
  poof/land, T15, T16, T20 '#'): changes only in walk/run/game/slide jobs (M15: no reach dip from swing feet, ≈ 1 texel
  higher swing drawings, `ev-M15-{fox,wanderer}.png`) + chonk turn; frog, mushroom, goat, hound, snail, honk 0 px; no new
  FAIL. Remaining open: rig vote-prop preset, look smooth-normal hint, green-hood x-scale bead column, fx hit offset /
  feathers / wisp colour, T2 prop clearance + storyProp contrast, T6 `--cell WxH`, T11 turn root offset, T16 foot
  visibility, T18, T19, T21, T24, M12 hem clamp.
- Wave-1 learnings now superseded: "set `surge: false` for legs ≤ 0.25 H" (default now), "LegGait ignores walk clips →
  channel-route or use the legacy Gait" (M1), "check dir 2 on bg=plain for a seated robed chibi" (M2; still worth a look
  for boot/hem clearance now that bodies stand at full height).

Shared-code issues found while building/critiquing keeper, hound and duelist (plus still-open wanderer items). Fixed by a
later module build round, not by character authors. Severity: **high** = blocks a rubric criterion for some character or a
correctness/determinism bug; **medium** = forces a workaround or hides failures; **low** = cosmetic or convenience. `Seen`
lists who reported it (r1/r2 = critic rounds).

### motion (src/chars/character.js, locomotion.js)
| sev | issue | fix wanted | seen |
|---|---|---|---|
| ~~high~~ fixed r5 | `_resetSim` (character.js ~142–169) clears `c.init/c.cached` but not each link's `L.dir`; `_applyChains` aims with a stale/unset `L.dir` before the first `_stepChains` → deterministic FAIL after re-simulation, 6–13 px chain pop at 60 Hz frame 4 of every clip | in `_resetSim`: `for (const c of this._chains) for (const L of c.links) L.dir = null;` and make the first `_applyChains` after a reset call `_stepChains(0)` (or skip aiming until `c.init`). Proof: shots/char-keeper/wv.js?wv=r | keeper, keeper r1+r2, duelist r2 |
| ~~high~~ fixed r5 | No way to keep action holds still: dynamics-only redraws (chain settle) land inside authored action holds (2–4 drawings per hold in all 3 characters) | option to snap chains to their target on authored action keys, or to suppress/phase-lock dynamics redraws during an action clip (per clip, e.g. `clip.dynamics: 'hold'`) | hound r1+r2, keeper r2, duelist r2 |
| ~~high~~ fixed r5c | No quadruped gait: FK legs ride the gliding root inside holds (foot slide 9.0 walk / 11.6 run at dir 2, 13.4–15.8 on turns) | 4-leg IK gait, or a pose-planted FK mode that counter-moves paws by the root glide within a hold | hound, hound r1+r2 |
| ~~medium~~ **PARTLY FIXED r2** (module fix r2: new chain option `rigid: true` aims every link at the RIGID chain shape so link k stops chasing link k−1: wanderer scarf idle settle redraws 4 → 2 (f 30: 2 → 0); default unchanged (0 px, probe hash). The rest-direction cache itself was already rigid (applyPose resets chain bones); re-solving dirs at each new drawing made it WORSE (tried, reverted). Use `rigid: true` or loop `dynamics: 'hold'` (M5)) — was: medium | `_cacheChains` reads link 1's rest direction from link 0's already-aimed orientation → multi-link chains converge once per drawing (2–3 redraws per key whatever f/ζ/r/quant) | cache rest directions from the rigid (un-aimed) pose | hound r2 |
| ~~medium~~ fixed r5 | `_buildChains`: the LAST link's childLocal falls back to its own position (= previous link's offset), so the tip aims along the parent direction | use the link's own axis × length for the tip | duelist r2 |
| ~~low~~ **FIXED r2** (module fix r2: `quant.lag 'settle'` default: the chest/head yaw lag no longer triggers its own redraws while it creeps back; it shows on drawings that happen anyway + ONE settle drawing; `quant.lag: 'step'` = old. turn redraws: goat 25 → 21, green-hood 25 → 20, honk 29 → 24, duelist 32 → 27, keeper 27 → 24; hound unchanged) — was: low | Gait head lag (`locomotion.bones.head`) creeps 4–6 redraws after a facing step and ignores `quant.yaw` | apply `quant.yaw` to the head lag | hound r2 |
| ~~low~~ **PARTLY FIXED r2** (with M8: a recovery step is now 2 drawings, so 2 id bumps per step instead of one per 2 frames; hidden legs still bump `d`) — was: low | Idle recovery steps of invisible/robed legs bump the drawing id `d` with no pixel change (13–20 ids per turn) and form late post-turn tails | don't bump `d` when nothing visible changed; give recovery steps their own hold rule / exclude from settle counts | hound, duelist r2, keeper r1 |
| ~~low~~ fixed r6 | `chain()` builds only straight chains (duelist overwrote bone axis/pos after `biped()`) | DONE (rig r6): `chain(name, { dirs, curl, curlAxis, lens })`; the upright tail is a curled 3-link chain | duelist r2 |
| ~~high~~ fixed r5 | One-shots hold their last key 1 grid frame then return to idle (anim.js header): the cast's `vote` (raise and HOLD) and `die` (collapse to a final held pose) cannot stay down | `clip.hold: true` (stay on the last key until another clip/action is played), honoured by Character + char-stage + bake | process run 05 |
| ~~high~~ fixed r5c (LegGait plans) | At game speed (4 H/s) the gait picks run by Froude and its cycle (6 grid frames for the wanderer at 6.1 m/s) is shorter than drawings × 2, so half the drawings never show | gait option to lock the cycle to N drawings × hold at a given speed (stride = v·N·hold/60), and per-plan game-speed presets | process run 05 (`shots/process/wanderer-gamespeed/`) |

Motion r5/r5c status (A/B vs the pre-round files, same tree, `shots/motion/ab/{kee,hou,due,wan}-{A,B}/`): `clip.dynamics`
'hold' default (one-shots: no dynamics-only redraws, chains snap on the return drawing) took `hold_redraws` to 0 in every
action of all four characters (keeper raise 15 → 0, thump 7 → 0, hurt 6 → 0; hound bark 4, sniff 5, pounce 3, hurt 2 → 0;
duelist spin 6, lunge 5, hurt 6, parry 1 → 0; wanderer attack 4, hurt 2 → 0); keeper thump strobe 9 → 3; `clip.hold` (vote,
die default); chain `L.dir` reset (13 px pop gone, keeper g2); tip link aims along its own axis (duelist turnaround: plume
tip 6–7 px, re-check the plume lean at dir 1); LegGait body plans (biped, bird, quadruped trot/bound, hop, glide, fly) at
game speed with one-drawing plants + stance surge. Turnarounds identical for wanderer, keeper, hound. Still open:
`_cacheChains` multi-link convergence (medium), head-lag quant (low), recovery-step id bumps (low), per-link chain curl
(rig). Characters that set `legIK: 'pose'` keep it; LegGait plans want the default 'plant'.

Motion — open after cast wave 1 (lead merge 2026-10-16; per-agent rows in the archive below are folded in here):

| # | sev | issue | fix wanted | seen |
|---|---|---|---|---|
| M1 | ~~high~~ **FIXED** (module fix 2026-10-16: `LegGait.bodyPose` evaluates clips.walk/run at the shown drawing phase for every non-leg bone; replace by default, `clip.blend: 'add'`; evidence `shots/modfix/ev-M1-fox-authored-walk.png` — fox variant `shots/modfix/wvfox.js` keys ears/tail/head per drawing: before = ignored, after = ears flick alternately, tail swishes; game.readable PASS 4/4, off_grid 1) — was: high (recurring 8/8) | LegGait ignores authored `clips.walk/run` POSES (only `bucket()` reads them for pose ids; `bodyPose` never evaluates the clip). No cast member can key a prop arm, ears, tail, tufts, cap or staff plant per gait drawing; every wave-1 member used a channel-routing hack or fell back to the legacy Gait | evaluate the authored clip at `phq` in `LegGait.bodyPose` for the upper body (bones the plan does not drive), as the legacy Gait does; ids stay `<gait>:k<n>:<frame>:<cycle>` | mushroom, frog, fox, crow, owl, goat, moth, skeleton-chef + all 8 critics |
| M2 | ~~high~~ **FIXED** (module fix: `locomotion.plant` auto → 'hold' for legs that cannot pin a held drawing, body drop ≤ `holdDrop` 0.1·leg; 'pin' drop capped at `maxDrop` 0.5·leg; hMax epsilon 1e-3. Headless drop at game speed fox 0.281 → 0.028 m, crow 0.278 → 0.028, goat 0.361 → 0.036, owl 0.189 → 0.019, frog 0.355 → 0.036 (`shots/modfix/probe.js`); dir-2 before/after `shots/modfix/ev-fox-m2m3-dir2.png` (before: hem 7 texels below the feet line; after: stand height, boots under the hem). r5c mannequin biped/upright/quadruped/hopper walks stay 'pin' with unchanged drop, in-hold drift 0 (`shots/modfix/plans.js`, motion slide audit)) — was: high (recurring 3) | LegGait 'biped' body drop seats short legs: `drop = Hh − √(Lg² − half²)`, `half = max(C/8 + v/60, v·hMax − C/8)` ≈ 0.28–0.36 m ≥ leg 0.29–0.35 m (hMax always 3 because Cmin adds 1e-4) → hips −0.2…−0.32 m, hem under the ground | cap the reach drop for short legs (≤ 0.1 × leg) and let the IK reach clamp absorb the rest; fix the hMax epsilon | skeleton-chef, moth, mushroom |
| M3 | ~~high~~ **FIXED** (module fix: 'hold' plant mode = body-relative sprite leg cycle, contact drawing exact at its pose frame, no per-frame re-pin (Character skips it), surge default off for legs ≤ 0.25 H. game off_grid/flicker: fox 18/317 → 1/18, crow 13/170 → 1/10, goat 17/339 → 1/28, frog 14/1110 → 1/96, toad 20/373 → 1/63, rabbit 11/415 → 1/15 (`shots/modfix/report-*-{base,fix}.txt`); boots step visibly under the hem: `shots/modfix/ev-{fox,crow,goat,frog,owl,toad,rabbit}-{clip,slide}-game.png`. Trade-off: the planted foot rides the root inside a hold (60 Hz in-hold 9–17 texels, informative row; = what a baked sprite does in game). Not built: forcing the contact drawing onto a 2-frame hold — use `cycleTime 0.267` (all holds 2). Run in-hold slide at 2·v unchanged (inherent)) — was: high (recurring 8/8) | No visible contact on chibi legs (≤ 0.25 H) at 4 H/s: no foot is planted for 2 drawings, `plant` re-pins every 60 Hz frame (off_grid 15–32, flicker 186–1517), the stance surge redraws the whole figure (flicker 8614–21754), run in-hold slide 10–13 texels | quantise the plant re-pin to the drawing holds (hold the planted leg per drawing); default `surge: false` when leg ≤ 0.25 H; a plan option for one deliberate contact drawing per step (hold 2, foot exact) | frog, fox, owl, moth, mushroom, crow, skeleton-chef, goat |
| M4 | ~~medium~~ **PARTLY FIXED** (module fix: `locomotion.accelLean: [back, fwd, side]` deg caps of the acceleration lean, default [10, 14, 10] = unchanged; a number = all three. A per-bone world plumb constraint for prop bones is NOT built — key the prop counter-lean in the now-playing walk clip (M1)) — was: medium (recurring 2) | Long held props tilt 25–30° under the run lean and the standing-start acceleration lean (clamped 14°, ≈ 0.4 s, ignores personality.body) | per-bone lean exclusion / world-space plumb constraint for prop bones, or `locomotion.accelLean` cap in the spec | goat, mushroom |
| M5 | ~~medium~~ **FIXED** (module fix: loop clips honour `clip.dynamics`; 'hold'/'snap' = no dynamics-only redraws + chains snap on every key change; default stays 'free' (0 px change). Wanderer idle with `idle.dynamics: 'hold'` (`shots/modfix/wvwanderer.js`): changes 7 → 6, the 2-frame scarf settle + micro WARN gone. The one-shot clip-boundary re-snap (moth vote 104 px at g38) is not addressed) — was: medium (recurring 2) | LOOP clips ignore `clip.dynamics` (`dynMode = s.action ? … : 'free'`): head/hand chains settle 21–100 px 2 and 4 frames after every idle/talk key; one-shot holds still re-snap chains on clip boundaries (moth vote 104 px at g38) | honour `clip.dynamics` in loops; snap chains on every authored key change | owl, moth |
| M6 | ~~medium~~ **FIXED** (module fix: 'hop' default legs keep FL/FR only when the hand rests on the ground (≤ 0.12 H): frog without `legs` → HL HR (was HL HR FL FR); mannequin sitting hopper keeps all four (`shots/modfix/wvfrog.js`, `plans.js`)) — was: medium | The 'hop' plan's default legs include FL/FR = upperArm/forearm/hand, so an upright chibi plants its arms | default `hop` legs to HL/HR when `bodyPlan` is uprightAnimal/chibi | frog |
| M7 | ~~low~~ **FIXED** (module fix: cycle from max(filtered, actual) speed: owl game ids before `w1:0 w2:0 w3:0 w1:1` (drawing 0 missing in cycle 1), after `w1:0 w2:0 w3:0 w0:1 w1:1 …`; cycle 0 still starts at drawing 1 by design (rear foot lifts first)) — was: low | LegGait skips drawing 0 in the first two walk cycles while speed ramps up (ids walk:1:0,2:0,3:0,1:1…); the bake then detects a 3-drawing period | start the phase at drawing 0 / ramp the phase not the drawing index | owl |
| M8 | ~~low~~ **FIXED r2** (module fix r2: idle recovery / stop steps are TWO drawings (mid-swing at the step start, then the landing; `gait.stepKey()`), both gaits, + quant.lag settle (row above). Post-turn tails shrink (turn changes: goat 25 → 21, green-hood 25 → 20, honk 29 → 24, rabbit 27 → 25); turn.off_grid 0 everywhere; regression `shots/modfix/r2/report-*-{base,fix}.txt`) — was: low (recurring 4) | Post-turn redraw tail ≈ 0.6 s (≈ 11–12 redraws, ≤ 43 px) from hidden robed legs stepping back; turn.foot_slide 3.1–4.6 | quantise recovery steps of hidden legs (or skip them when the legs are masked) | goat, (hound/duelist r2 earlier row), green-hood (clip-turn f16–f40), rabbit (≈ 4-drawing post-turn tail, channel unidentified), honk (turn.foot_slide 4.58) |

Motion — new after cast wave 2 (lead merge 2026-10-16; wave-2 rows that restate M1/M2/M3/M5 are folded into those
rows as "pre-merge" reports — authors: rabbit, snail, toad, green-hood, honk, chonk, mole, nicksong):

| # | sev | issue | fix wanted | seen |
|---|---|---|---|---|
| M9 | ~~high~~ **FIXED r2 (code; spec migration needed)** (module fix r2: the bird walk branch calls `_squash` (touchdown squash / push-off stretch, 0.6·amount) when `locomotion.squash` is set; a ball bird needs its own leaf squash bone + riders in the spec (chonk has `ball`). Chonk variant on LegGait 'bird': `shots/modfix/r2/ev-M9-chonk-bird-squash.png` (bottom row squashes on contacts); no squash = unchanged) — was: high | LegGait 'bird' walk branch never calls `_squash`, and `bird()` has no separate squash bone (squash on 'body' scales the IK'd legs): a ball goose cannot squash/roll on LegGait; chonk fell back to the legacy Gait (feet ride the root ≈ 13 texels in a hold) | a 'ball' plan option: leaf squash bone + rider list; call `_squash` in the bird branch | chonk |
| M10 | ~~medium~~ **FIXED r2** (module fix r2: each rider uses its nearest ancestor in `squash.bones`; riders under none keep the old last-bone reference; single-bone squash unchanged) — was: medium | `LegGait._squash`: riders' `.p` offsets are computed relative to the LAST bone in `squash.bones` only, so squashing several bones (foot + stalks, thighs + head) gives wrong rider offsets | compute each rider against its own squashed parent | snail, rabbit (thighs + head) |
| M11 | ~~medium~~ **FIXED r2** (module fix r2: `locomotion.crouch` (m) sets the hop touchdown crouch; default 0.06·height unchanged. Migration: rabbit can put `height` back to its body height and use `crouch`) — was: medium | Hop crouch depth is hard-coded `−0.06·locomotion.height`, and `height` also feeds the defaults for bob, lift, hover, vStart, stepLift — rabbit repurposed height (0.856) as a crouch knob | separate `locomotion.crouch` (m or fraction of hip height) | rabbit |
| M12 | high (recurring 3) — **PARTLY ADDRESSED, needs spec changes** (module fix r2: in plant 'hold' the feet are body-relative: `contactReach` (fraction of leg) bounds how far a contact/swing foot leaves its anchor, `lift` its height — together they keep boots under a hem without ghost legs; a true hem clamp (radius, y) is not built) | No way to keep IK'd feet under a skirt/robe or out of a squashed body: rabbit's hop boots went through the dress at every touchdown (M3 'hold' draws them, but still IK'd to world plants), chonk contact feet buried, mole one boot at S. Workaround (rabbit r3): ghost leg bones as `locomotion.legs`, visible legs FK + squash → foot_slide n/a | a 'tuck' / `hem: {radius, y}` mode: IK'd feet clamped inside the hem footprint and under its y, one deliberate two-boot plant drawing; honour it in 'hold' mode | rabbit, chonk, mole |
| M13 | ~~medium~~ **FIXED r2** (module fix r2: an authored key whose pose equals the drawing on screen is not a new drawing (Character `samePose`). Owl vote: base pops 195 px at g38 of the hold, fix 0; honk-style duplicate final keys no longer redraw) — was: medium | A one-shot whose last key duplicates the hold pose (same object at f22 and f60) redraws ≈ 105 px ON the last key (neck/head/board 1–2 texels); `hold_redraws` and `final_hold` both miss it | make the last-key evaluation equal the hold (step interp end handling / dynamics settle); tools T17 | honk |
| M14 | ~~low~~ **FIXED r2** (module fix r2: glide adds a sin component (lean into the push on the rising half, trail on the falling half): snail on 'glide' distinct drawings 3 → 5 of 4 ids (tools T15 row); `shots/modfix/r2/ev-glide-snail.png`) — was: low | LegGait 'glide' pulse `c = −cos(2π·k/n)` makes drawings k and n−k identical (n 4 → 3 distinct poses); no per-drawing amplitude/phase table | a pulse table per drawing (or sin + cos components) so all n drawings differ | snail |
| M15 | ~~low~~ **PARTLY FIXED r2** (module fix r2: the reach dip only counts PLANTED feet (both gaits); walk/run drawings with an out-of-reach swing foot sit ≈ 1 texel higher (`shots/modfix/r3/ev-M15-{fox,wanderer}.png`), no row changed status. Not done: tools warning for the cycleLength clamp; legacy plant-per-drawing (use legIK 'pose' or LegGait 'hold')) — was: low | Legacy Gait: `_solveLegs` reach dip applies to SWING feet too (pulls an authored airborne `pos` back down); `cycleLength` clamp 2·reach·legLen/duty silently shortens the cycle when duty rises; `legIK 'plant'` re-solves every frame (off_grid 23, flicker 870) | dip for stance feet only; warn in tools when the clamp changes the cycle; hold the plant per drawing as LegGait 'hold' does | chonk, mole, green-hood (reach ignored: 0.6 vs 0.75 identical 5.98 texels) |
| M16 | ~~low~~ **VERIFIED r2** (honk without `plant` → auto picks 'pin' for walk (folded legs 0.40 H need only 0.026 m of drop) and 'hold' for run: correct by geometry; the 60 Hz re-pin is the pin cost. Keep `plant: 'hold'` for sprite-clean legs) — was: low | `plant: 'auto'` resolved honk's short-legged bird walk to 'pin' (60 Hz re-pin, flicker 919). The M2 note says auto → 'hold' for the bird; honk's render may predate the merge — **verify** with `locomotion.plant` removed from honk | confirm auto picks 'hold' for legs this short; else lower the threshold | honk |
| M17 | ~~low~~ **PARTLY FIXED r2** (quant.lag settle + two-drawing recovery steps: rabbit turn changes 27 → 25) — was: low | Small post-turn redraw tail (≈ 4 drawings) that neither ear-spring stiffness nor chain quantum removed (possibly head personality lag — the open head-lag quant row) | identify the channel (head-lag quant row above) | rabbit |

Motion — new after cast wave 3 (lead merge 2026-10-16):

| # | sev | issue | fix wanted | seen |
|---|---|---|---|---|
| M18 | ~~medium~~ **FIXED (wave-3 module fixer)** (cause: the IDLE drawing's planted feet re-pinned on the one 60 Hz frame between the root starting to travel and the walk cutting in at the next grid frame; hold-mode LegGait skips that re-pin (`Character._holdStart`). Opal game.flicker 63 → 0, game.off_grid 1 → 0, walk 65 → 2 px, run 74 → 2 px; foot_slide stays n/a (T18) — see `game.feet_visible` for contact) — was: medium (recurring 6) | LegGait `plant: 'hold'` redraws the legs on one same-pose frame per loop: walk/game flicker 50–105 px "legs only" WARN (and run 74–86); never a planted foot on two drawings, so `foot_slide` is n/a for every chibi (T18) | find the hold-mode re-pin at the speed change; one leg drawing per gait drawing | requin, opal, cilantro, progress, mincut, polly |
| M19 | low (recurring 3) | Idle recovery still steps once per 45° facing step (stepYaw/stepTol 50 → 90/0.12 cut a 180° turn from 6 to 5 steps); a 3-link keyed neck re-settles each link (cilantro 5 small redraws f45–56); mincut 4 post-turn redraws 10–39 px | one lifted/landed pair after the LAST yaw step; settle a keyed neck as one unit (M8 follow-up) | clarabelle, cilantro, mincut |
| M20 | low | A 1-link spring chain at game speed lags ≈ 2ζ/(2πf)·v and sits at its limit behind the body (cilantro scarf end hidden at 8/8; fix was keying it forward) | velocity-compensated chain target, or a 'follow key' option in locomotion | cilantro |
| M21 | low | LegGait authored walk keys REPLACE the plan's lean/twist on every keyed bone, so a contact key easily pitches a chibi head down; whole-clip `blend: 'add'` is the only alternative | per-bone add (`clip.add: ['head', …]`) | progress |
| M22 | low | First walk cycle after idle shows drawing 1 skipped (walk:k0 → k2 → k3, then +1 per hold) on clarabelle; M7 says cycle 0 starting at drawing 1 is by design — reported as a skip | confirm against M7 and document, or start cycle 0 at drawing 0 | clarabelle |
| (note) | **FIXED opt-in (wave-3 module fixer)**: `clip.legs: 'float'` on any loop clip, and ghost clips under `spec.ghost` float by default (plain `'fk'` on loop clips stays ignored: fox/honk ghosts key it) | Legacy-Gait ghost loop clips still need `pos` +0.1 to cancel the idle leg-IK dip (`legs: 'fk'` ignored on loop clips); on LegGait 'bird' the dip is not there (honk) | honour `legs: 'fk'` on loop clips | polly, honk |

Rig (src/chars/rig.js) — open after cast wave 1:

| sev | issue | fix wanted | seen |
|---|---|---|---|
| ~~medium~~ **FIXED r2** (module fix r2: `uprightAnimal`/`chibi` pass `neck` (m) to `biped()`; default unchanged. `shots/modfix/r2/ev-rig-neck-jaw.png` row 2: neck 0.14 lifts the head off the shoulders) — was: medium | `chibi()` / `uprightAnimal()` do not pass a `neck` option to `biped()`: big chibi heads sit on the shoulders and arms touch the chin at dir 1 | pass `neck` through | mushroom |
| ~~low~~ **FIXED r2** (module fix r2: `jaw: { back: true }` hinges at z −0.10·head, jaw slot + mouth socket shifted forward to keep the mouth in place; `jaw: true` unchanged; ev-rig-neck-jaw.png row 3) — was: low | `uprightAnimal` jaw hinge sits near the front of the head ([0, 0.22 hl, 0.30 hl]), so a wide frog/toad mouth can't open | `jaw: { back: true }` option (hinge at the back of the mouth, z −0.10) | frog |
| medium — **ADDRESSED (wave-3 module fixer)** by the `'<bone>.l'` reach channel (row below); a generic preset stays not built (recurring 10: + clarabelle, preservation, mincut in wave 3 — edge-on cards, a 1.95× stick arm) — **NOT FIXED r2** (a generic `chibi.vote.prop` preset was tried and dropped: cast arms are authored BENT at rest (fox mug, mushroom staff), so one preset put the mug in front of the face and the staff downward (`shots/modfix/r2/ev-rig-vote-prop.png`). Needs per-character keys; the rule stays: raise the PROP up-and-out, longer arms or a `.s` forearm) | A raised limb on a 2.2–2.5-head chibi can't clear the head (vote): `chibi()` default arms 0.9 put the hand at 0.72 m vs skull top 1.0 m (rabbit needed arms 1.25 + `forearmR.s` 1.4) | a `PLAN_POSES['chibi.vote.prop']` start pose that raises a hand-socket prop ≥ 0.3 m above the crown, and a reach note in the template | fox, owl, mushroom, skeleton-chef, rabbit, toad, green-hood |
| low (recurring 5: + mincut wave 3 — TINY-scale prop shown with `.s` 999; wants a part `hidden: true` flag) — DOCUMENTED r2 (CHARACTERS.md §4) | `<bone>.s` is a scale offset defaulting to identity: props hidden in procedural clips must be authored tiny and scaled up in keys, or kept at scale 0 by a HIDE spread in every other clip (incl. gait keys and `breath()`) | document, or a `visible` key / per-clip prop list | goat, toad, snail, green-hood |
| low | A bent rest forearm snaps to a FWD-axis bone, so its pose triple follows the fwd-bone sign table, not the down-bone one — undocumented (cost rabbit three wrong guesses) | document in CHARACTERS.md / the template header | rabbit |
| low | A bone at pos [0,0,0] under another bone makes the parent's axis zero-length → NaN geometry (page_errors 44), no warning naming the bone | rig validation: throw/warn with the bone name | toad |
| low (recurring 2) | An 8-sided `K.lathe` head with face boxes needs per-facet placement (proud eyes leave the contour, flush ones z-fight) | `K.onLathe(profile, u, angle)` → position + normal for placing a part on a lathe surface | rabbit, chonk (honk cut eyes into the skull instead) |
| low | `bird()` wing paddles folded back: the template's 'down' axis makes `out` = roll; a broad raised wing needs `axis: 'back'` + twist −90 | document in the PLAYBOOK Bird section (done, lead wave 2) | honk |
| ~~medium~~ **FIXED (wave-3 module fixer)**: `'<bone>.l': [k]` lengthens a segment along its rest axis, thickness and children unchanged (`shots/mfx4/ev-reach-opal.png`; CHARACTERS.md §5) — was: medium (recurring 4, wave 3) | Chibi arms (0.32–0.45 m) cannot reach their own face or lift a prop past a big head: every member stretched `upperArmR.s` 1.5–1.95× and counter-scaled the prop (a 1.95× arm reads as a twig, mincut) | per-key arm reach target (IK to a socket/point) or a `reach` scale that keeps limb thickness | preservation, progress, mincut, requin |
| low (recurring 3) — DOCUMENT | Pose triple order q = qFwd·qOut·qTwist: once `out` > 90 a positive `fwd` tips the raised arm BACK (progress, preservation; honk's back-pointing wing the same) — not in the rig doc table (playbook R W3 line added) | CHARACTERS.md pose-triple table | progress, preservation, honk |
| low | `kit.paddle(u, …, side)` puts the width along cross(side, u): with side = X and a tail running back/down the width lies in YZ, a 1-px stick at N/S (use side = cross(u, X)) — undocumented | document in kit.js header | polly |
| low | `kit.lathe` is bbox-centred but specs place profiles bone-relative (mis-placed domes/collars) | `{ origin: 'profile' }` option | progress |
| low | Clips cannot key leg bones under LegGait (a touchdown haunch flare can't be authored); a hop's flight leg extension needs a negative `lift` hack | per-drawing leg overrides in clips.walk, or a `flightReach` knob | preservation |

- **(tools/motion, medium — char-maxflow 2026-10-16) bake cuts the walk from the START-UP cycle.** `tools/bake.py` takes
  the loop from the 2nd walk drawing to its repeat one cycle later; maxflow's first LegGait walk cycle shows k0, k1, k3
  (k2 skipped at the start: pose ids `walk:walk:k1:1:0` .117 s → `k3:3:0` .183 s), so the baked walk row has 3
  drawings (k1, k3, k0; json `walk.frames 3, period 6`) while the steady cycles show 4/4 (`game.readable` PASS). Every
  other cast bake has 4. Fix wanted: start the cycle search at the first COMPLETE cycle (cycle counter ≥ 1), or stop the
  start-up phase jump. cycleTime 0.32 did not avoid it. Evidence `shots/bake-raw/maxflow/bake.json` (render host).

### look (src/chars/look.js, toon/outline, lighting)
| sev | issue | fix wanted | seen |
|---|---|---|---|
| ~~medium~~ fixed r05 | Props under a hand bone inherit the hand's side class → far-forced, flip value with facing; workaround `sides {handR:'mid'}` also un-sides the hand | DONE (look r05): `props: 'mid'` default (pairs below a hand bone / reaching > 0.2 m), `material.slots {x: {side}}` | duelist r1+r2, keeper r2 |
| ~~medium~~ **FIXED r2** (module fix r2: `spec.lights: [{ socket or bone, color, intensity (night) or [day, dusk, night], distance, decay, nightOnly, flicker {fps, levels, seed} or false, at }]` → PointLights under the socket created by the Character, night factor from the toon ramp, flicker on the Character clock. Keeper variant `shots/modfix/r2/wvkeeper.js?wv=l`: warm pool on the keeper and the grass at night, `ev-look-lights-keeper.png`. Migration: keeper/moth/green-hood replace their scene-code lights) — was: medium | No `spec.lights` hook: a character light (keeper lantern) exists only in scene code, so no pack or game scene shows it | `spec.lights: [{socket, color, intensity, distance, flicker:{fps, levels}}]` attached by the Character, frozen with the stage clock | keeper r1+r2 |
| ~~medium~~ **FIXED r2** (module fix r2: `uniform float uCharTime` in every character material, set by Character.update to its clock; keeper variant with `tones` using uCharTime: night_freeze 23 px → 0 PASS. Migration: replace `uTime` with `uCharTime` in character `material.tones` glow code) — was: medium | Character glow/flicker reads engine `uTime`, not the stage's frozen `t` (23 px glass change at fixed t) | a `uCharTime` uniform driven by the Character's clock | keeper r2 |
| ~~medium~~ ALREADY FIXED (sky.js `applyTimeOfDay` sets `engine.style.timeOfDay`; found in r2) — was: medium | No time-of-day flag on the engine (`engine.style.timeOfDay` undefined); lights must infer night from `uRampHi` luma | expose `engine.style.timeOfDay` (or a night factor uniform) | keeper |
| ~~low~~ fixed r05 | Travelling figures: 4–8 self-shadow speck px/frame (shadow-map grid vs root texel grid); a wide cowl over the chest raised walk/run specks to 30–50 | DONE (look r05): `shadowSnap` (caster + lookup shifted together). The keeper's remaining 25–47 "specks" are its glow flicker on `uTime` (row above), not shadow | wanderer (lead), keeper r2 |
| ~~medium~~ fixed r05 | Signature/face in the shadow tone from N·L (keeper beard 76 % sh, face_lit 47 %) | DONE (look r05): `sigLift` / `faceLift` 0.3 default | keeper r2, wanderer |
| ~~medium~~ fixed r05 | far-half / cloud / self-shadow / part-id hooks were string patches on toon.js lines | DONE (look r05): toon.js hooks `lightMod/cloudExpr/shadowBias/outlineFlag/outgoing`; flags also set from material.onBeforeRender | status doc |
| low | Material hints only show on round bodies; boxy animals get nothing | a smooth-normal attribute from rig (rig owner) would let the hint follow facet edges | look r05 |
| ~~medium~~ **FIXED r2 (opt-in)** (module fix r2: `material.merge: { <child bone>: <parent bone> }` gives the child bone's parts the parent's part id (no junction line). Fox ears → head: inner_lines 366 → 334, isolated NE 2 → 0 / N 3 → 1, the ear line through the head at E gone (`ev-look-merge-fox.png`); default identical (0 px)) — was: medium (recurring 6) | Same-slot parts on parent/child bones (ear/skull, tuft root/skull, eye bump/skull, jaw/skull, hood peak/hood, wing covert/secondary) always draw an inner line / 5–11 isolated px at the junction; no per-part opt-out of inner lines against the parent part. Workarounds: jaw flush/wider than the skull (toad SE 9 → 2), same bone + slot (toad bumps, chonk nape), one hull on the parent (honk wings) | `part.merge: '<parent part>'` (same part id for the outline pass) or `innerLine: false` per part | fox, owl, frog, toad, green-hood, honk |
| (status) | `spec.lights` row above is now **recurring 3** (keeper, moth: Lumen's pool lives only in `shots/char-moth/night.js`; green-hood's lantern eyes emit surface colour only) | — | keeper, moth, green-hood |
| ~~medium~~ **FIXED r2 (opt-in)** (module fix r2: `material.whiteKeep` k: a near-white HI tone (linear luma > 0.75, chroma < 0.18) is pulled to its own luma by k·warmth(rampHi r−b) in the lit band only; characters only, world untouched, default 0 = identical (rabbit A/B 0 px). Chonk whiteKeep 0.8 at golden: apricot #EFBD7D → #D2C6BA, shadows keep their violet (`ev-look-whitekeep-chonk.png`); sig_ground still WARNs on hue vs olive grass) — was: medium (recurring 4) | The golden key light tints any near-white albedo to apricot (#EFBD7D–#F0BE7B, dH 23–25 vs golden grass): white cast members lose "white". Cooler hi changed nothing (chonk #F3F1F5); only a magenta-pushed hi passed (rabbit #F8E8FF → dH 34) | cap the golden tint on near-white albedo (or a per-slot `goldenKeep` factor); must keep world scenes + town pixel-identical, so it belongs in the character material path | rabbit, chonk, skeleton-chef, goat |
| low | Scaling a convex bead eye part in x (`eyeL.s` x +0.3) draws a dark 1-px vertical column down each eye; y-only scale is clean (`shots/char-green-hood/r6/b/f-dbg2.png` vs `f-dbg3.png`). Cause unknown (mirrored part or skinned normals under non-uniform scale) | find the cause (normals under non-uniform bone scale) | green-hood |
| ~~medium~~ **FIXED opt-in (wave-3 module fixer)**: `material.whiteKeepLift k` keeps lifted mid-band near-whites (gate chroma < 0.25: requin's magenta-pushed hi #F8E8FF failed the old 0.18 gate too); requin variant golden belly peach → white, `shots/mfx4/ev-whitekeeplift.png` — was: medium | `material.whiteKeep` has no effect on pixels raised by `material.slots.<slot>.lift` (a lift-0.35 belly stayed peach #F1B889 at golden with whiteKeep 0.7 and 1; workaround lift 0.18 + a cool mid #E6DCF4) | apply whiteKeep after the slot lift | requin |
| low | outline.js tints FLAG_CHAR inner lines toward blue-grey, so a line on a cream/white part reads as grey specks ("beard" round a muzzle); no per-slot line colour (workaround `material.merge` + flush detail boxes) | per-slot inner-line tone (`material.slots.<x>.line`) or tint toward the part's own sh | cilantro |
| low | `sigLift` keeps the signature at L ≥ 0.3 in the pillar shadow, so the shade copy can't reach −25 % by lowering `sh` (polly noon-shade −7 %) | let `sh` below the lift floor through, or document the floor in the sig_ground note | polly |

### fx (src/chars/smear.js, fx.js)
| sev | issue | fix wanted | seen |
|---|---|---|---|
| ~~high~~ fixed r5 | No linear thrust smear; tip-socket arc workarounds read as ladder/trident/cane, 4/8 facings | DONE: `kind: 'thrust'` (fx-r5; duelist lunge 8/8 facings in shots/fx-r5/x-thrust.png) | duelist r1+r2 |
| ~~medium~~ fixed r5 | Dust motes fixed at 4–5 texels and stepped at 10 fps against the pose's twos | DONE: scaled by height, 15 fps in phase with birth (hound may put dust back in `fx.map`) | hound r1 |
| ~~medium~~ fixed r5 | A crescent through the chest plane is invisible from behind / edge-on sticks | DONE: `tilt` 35° (area normal) + `front` 0.12 m | hound r2 |
| ~~low~~ fixed r5 | Hit spark draws dark cells (checker clod) for 6 grid frames | DONE: 2 drawings, light tones, ring instead of dots | hound r2 |
| ~~low~~ fixed r5 | Smear palette pairs give one visible tone | DONE: default ['#DEE4E6', '#F7F9F6'] (inner band ≥ 12 % darker); characters' own palettes unchanged | hound r2 |
| ~~low~~ fixed r5 | Limb smear kind is a flat fan / wedge on the body | DONE: limb = ribbon over the outer 60 %; new `claw` kind (3 rakes) | hound r1 |
| ~~low~~ ALREADY FIXED (lead r6: char-stage fxSignature uses `a0d.st.clock(t)`; found in r2) — was: low | fxSignature (scenes/char-stage.js, tools) ages FX with engine `uTime`; fx.js now runs on the Character clock (frozen frames freeze FX) | tools: pass `a0d.st.clock(t)` instead of `uTime` as `tE` (identical when the clock is not frozen) | fx-r5 |
| ~~low~~ ALREADY SUPPORTED (fx.js parses `<name>@<node>` for every kind; documented in CHARACTERS.md §5; found in r2) — was: low | Emote anchors guess node names (`head`, `handR`, `wingR`, `pawR`, `chest`…) | name the node in the event (`vote@wingL`, `speak@beak`). Rig r6: every template now has `head` + `mouth` (bird: `beak`) sockets and `wingTipL/R` — fx can read `socket:mouth` | fx-r5 |
| ~~low~~ **FIXED r2** (module fix r2: ring motes jittered over their whole sector (seeded), ring life 3 drawings = 6 grid frames (was 7 = 14); crow dig, chonk plop, dust in die rings changed (`report-*-fix.txt`)) — was: low (wave 1) | Dig/land dust = a symmetric grid of 1-px '+' motes lingering ≈ 12 frames detached from the source | seeded-random placement, end ≤ 6 frames | crow r1+r2 |
| ~~low~~ **FIXED r2; first-beat gap FIXED (lead, wave 3: look-ahead to the clip's next speak beat; recurring 5)** (module fix r2: a speak beat within `speech.chain` 1.2 s of the previous one keeps ONE full bubble (3 dots) on screen until the next beat; only the last bubble pops out; single speak events unchanged. Fox talk: base pop-in / dots / pop-out / gap every 0.8 s, fix one steady bubble from the 2nd beat (`ev-fx-speech-fox.png`)) — was: low (wave 1) | Speech bubble flips between a dot and a full bubble on every talk beat | one size for the whole talk loop | crow |
| ~~low~~ **FIXED r2** (module fix r2: a flash event inside the `die` clip shows ONE drawing (2 grid frames); fox die f20–23 887 px white silhouette gone. Bake skip of flash frames not needed) — was: low (recurring 3) | Die hurt flash covers ≈ 6–8 grid frames (full white silhouette); bake die frame 0 = white silhouette. Clocktower rule: no hurt reactions → cast die clips drop `hurt` (playbook) | flash 2–3 frames for `die`; bake skips flash-only frames | frog, skeleton-chef, snail |
| ~~low~~ **FIXED r2** (module fix r2: Character emits clip events on their own grid frame even when no drawing is shown (footsteps still wait for their drawing)) — was: low (recurring 2) | `emote:<glyph>` events placed mid-hold fire only at the next drawing | fire at the event frame (or document "events on key frames" — documented, playbook) | frog, snail |
| ~~low~~ **FIXED** (lead, wave 2: `src/chars/fx.js` glyph branch draws the full glyph from its first drawing; A/B wanderer 0 px all jobs, honk only 4 clip-honk frames differ, `shots/lead-w2/ab-honk-glyph.png`) — was: low (recurring 2) | Emote glyph pop-in stage drew a 3×3 rim dot (a 1-texel hollow square) for one drawing before the glyph; it read as a stray speck and the glyph only read ≈ 6 frames after its key | — | mole (ring f40), honk (exclaim f14) |
| low (recurring 2: + opal, wave 3 — cause: a non-weapon socket inherits the weapon blade, length 0.6 × tip 0.85 = spark 0.51 m forward; workaround `fx.sockets.<s>.length: 0`; fix: default length 0 for sockets other than `weapon`) | `hit@<socket>` places the spark at the socket even when the prop points away (mole tap: ≈ 6–10 px off the contact) | event point offset (`hit@<socket>:tip/mid` or an offset param); meanwhile use a contact socket | mole |
| low | `emote:<glyph>@<node>` always draws ≈ 0.14·H + 5 screen texels ABOVE the node, so a glyph cannot land on a face part (workaround: a socket 0.30 m under the lens) | offset 0 when a node is given, or an `@node:dy` param | preservation |
| low — NOT REPRODUCED (lead, wave 3) | A chained speech bubble starts at drawing 3 (small) and re-pops at each later beat (requin r2). Fox after the look-ahead fix: one steady full bubble from 60 Hz frame 4 to the end, no re-pop at the 2nd beat (`shots/lead-w3/fix-fox/clip-talk-60hz.png`) | re-check on requin's spec once its workaround (speak at f2, f14) is removed | requin |
| ~~low~~ **FIXED r2 (opt-in)** (module fix r2: `spec.fx.poof` / `spec.fx.land` { n, speed, radius (m) } override the ring; chonk `land: {radius: 0.5}` moved the plop motes outside the ball (31–86 px change)) — was: low | `poof@<node>` spawns 6 slow motes at the node (eggs under a wide body); `land` ring motes still pass under a 1 m body | spawn radius / speed option scaled by body width | chonk |
| low | Flap feathers render as detached 1-px grey slashes | motes ≥ 2×2 texels in plumage tones, short life | honk |
| low — DOCUMENTED r2 (bake an FX-free sheet with `tools/charpack.sh --bake <name> --q fx=0`) | The bake includes FX (speech bubble, sparkles, glyphs) in clip frames: vote/talk sprites carry FX pixels | bake an `fx=0` layer and an FX layer separately (or document) | mole |
| low | No spec-level light; `fx.wisp` colour is per character (the die soul wisp shares the emote flame colour) | per-event colour; see look `spec.lights` | green-hood |
| ~~low~~ **FIXED r2** (via tools T5: final_hold / hold_redraws come from an fx=0 copy) — was: low (wave 1) | Vote sparkle (≈ 0.8 s) and die soul wisp (1.2 s) outlive the pack window, so a correctly held clip FAILs `final_hold` | fx lifetimes ≤ hold, or tools excludes FX from final_hold (tools row T5) | mushroom |

### tools (tools/charcheck.py, charpack.*, char-stage, shot/remote scripts)
| sev | issue | fix wanted | seen |
|---|---|---|---|
| ~~high~~ fixed r06 | FX and dynamics redraws exempt from `single_frame`/intervals: `1x7`, `1x8` runs and 3–4 drawings per hold PASS | rows: (a) ≥ 3 consecutive 1-grid-frame changes = FAIL (exempt only smear stages); (b) "redraws per hold": any redraw ≥ 8 px inside a key hold that is not an FX stage, and settle steps > 10 px | hound r1+r2, keeper r1+r2, duelist r2 |
| ~~high~~ fixed r06 (night_pan lantern=0 cover=0 in one stepped-clock window; night_freeze) | Night is not frozen by `t=`: stage lantern flicker, grass wind, cloud shadows (and the glow) run on engine time → night pan/freeze unusable | drive them from the stage clock when `t=`/`frame=` is set, or have charpack/critic night jobs pass `lantern=0&cover=0` | duelist r1+r2, hound r1, keeper r2 |
| ~~medium~~ fixed r06 | `walk.foot_slide` measures every 60 Hz frame inside held drawings, only `bones.feet`, only at the pack facing | measure ankles at pose-id (`p`) changes, stance decided at both pose frames; at the profile facing (dir 2); over all spec feet (4 for quadrupeds) | keeper, keeper r1+r2, hound r1+r2 |
| ~~medium~~ fixed r06 | No signature-vs-ground row | per scene copy (noon/golden, sun AND pillar shadow): signature hue ≥ 30° or L ≥ 25 % vs lit grass, sh ≥ 15 % L over grass shadow and ≥ body sh | hound r1+r2 |
| ~~medium~~ fixed r06 | No per-facing tone share for the signature / accents | row: hi/mid share of the signature slot (and `spec.accents`) per facing at noon, want ≥ 50 % in ≥ 6/8 | keeper r2, hound r1 |
| ~~medium~~ fixed r06 | `spec.signature` takes one slot; two-part signatures are half-measured | accept an array (`signature: ['hood', 'beard']`) and run isolated_px / tone share / thumbnails per part | keeper r1+r2, duelist |
| ~~medium~~ fixed r06 (bodyPlan PLANS, heightPx, inferred quadruped) | `height_px` 45–62 FAILs every companion | read `spec.heightPx` (target range) | hound r1+r2 |
| ~~medium~~ fixed r06 | Briefs say game-host, tools/docs default to render-host | one documented host (or require `PIXEL3D_HOST`), print the GPU in report.txt | keeper, all critics |
| ~~low~~ fixed r06 (`<clip>.key_speckle`) | `isolated_px` runs only on the idle turnaround | also on each action's key frames | duelist r2 |
| ~~low~~ fixed r06 | `charpack --only turnaround` keeps stale clip rows in report.txt | drop or mark rows not rendered in this run | duelist r2 |
| low (recurring 4) | colours/slot over-counts (neighbour shadow tones, small dark parts; outline/inner-line tones of every part go to the darkest slot: mole 'dark' 12–13 tones after eyes/mouth got their own slot); speckle/isolated_px count outline joins of overlapping parts (snail shell/stalks) | nearest-match within connected regions; exclude line px | hound, duelist, mole, snail |
| ~~low~~ fixed r06 | Sprite bake loop detection keys on procedural gait ids, finds no cycle with authored walk/run clips (67 frames instead of 8) | detect loops from the clip length when authored | lead (wanderer) |
| T1 ~~medium~~ **FIXED** (module fix 2026-10-16: char-stage `clock` drops `at` for loop clips (idle + spec loops, not walk/run) when `frame=` is set. Shot-log `p` before → after: talk frame=0 talk:6 → talk:0, talk 12 → talk:18 → talk:12, idle 54 idle:60 → idle:52 (the key at/before 54), vote 3 vote:3 → vote:3; `&at=0` still gives the same key) — was: medium (recurring 7/8, wave 1) | `char-stage frame=` on LOOP clips is offset by `at` (+8 grid frames at the default 0.25 s): talk frame=0 → talk:6, idle 54 → idle:62; one-shots are right. Workaround `&at=0` (now in the playbook) | ignore `at` for loop clips when `frame=` is set (scenes/char-stage.js `clock`), or print the rendered key on the image | frog, fox, owl, crow, goat, skeleton-chef, mushroom (+ critics) |
| T2 **PARTLY FIXED r2** (module fix r2: `islands` row (turnaround, per facing) and `<clip>.islands` (per distinct drawing, FX frames skipped): 8-connected parts ≥ 3 px vs the first frame — honk walk/game/run 1 → 3 (floating feet), duelist turnaround 2, snail tinker 2, skeleton-chef vote 2. Not built: prop clearance per facing, storyProp contrast) — was: medium (recurring 7: + mole hammer at E/W/SW, toad/honk/rabbit prop-over-crown counted by hand) | No detached-part / connected-component check: floating boots passed as `foot_slide n/a`; no "prop stands clear of the silhouette" row; no prop-vs-neighbour-slot contrast row (goat sheet = brass) | per-frame connected-component count of the figure mask (WARN on new islands); prop-clearance px per facing for `spec.props`; ΔL/ΔH of `spec.storyProp` vs touching slots | mushroom, crow, goat |
| T3 **FIXED r2** (module fix r2: the sun copy measures the LIT half of the part (luma ≥ its median); goat golden-sun PASS dH 49 (#B8907E, shaded mix) → WARN dH 23 (#F1C07E, lit)) — was: medium (recurring 4: + green-hood #463B47 sampled for a sunlit hood #627E45; rabbit/chonk white signatures can never pass golden-sun) | `sig_ground` golden-sun row measures a mean colour that includes the shaded side and PASSes (#856B8D / #786B8D) while the lit copy fails (dH 16–20) | measure the sun copy over lit figure px only (light buffer mask or the brighter half) | skeleton-chef, moth (WARN flip r2→r3 unexplained) |
| T4 **FIXED r2** (module fix r2: job `face-solo` renders the face slot alone (char-stage `mark=<slot>&solo=1`); row `face_visible` = visible / unoccluded face px at S/SE/SW, want ≥ 60 %: crow 48 % WARN (brim), mushroom 44 %, hound 32 %, fox 74 %, goat 73 %) — was: medium | `face_lit` scores only the visible face px: a face mostly under a 0.44 m brim PASSed 96 % | also report visible face px / unoccluded face px per facing | crow |
| T5 **FIXED r2** (module fix r2: charpack renders `nofx-vote` / `nofx-die` (fx=0); `final_hold`, `hold_redraws` come from that copy (note in the row); fox die final_hold 0.87 s → 2.0 s, honk die 2.07 s) — was: low (recurring 2) | `hold_redraws` does not cover `final_hold` (moth vote pop 104 px at g38 reported 0); raw windows end ≈ g38; `final_hold` counts FX changes | extend hold_redraws over final_hold; exclude FX-only changes from final_hold | moth, mushroom |
| T6 **PARTLY FIXED r2** (module fix r2: the border check includes the bottom edge; the bake prints "render cell N -> trimmed cell WxH". Not built: `--cell WxH`) — was: low (recurring 5) | `--bake --cell N` looks unhonoured: N is the square render cell, the json cell is the trimmed bbox. **Documented in `tools/bake.py` usage (lead merge).** Still open: the border check misses the bottom edge, and wide W/SW emotes need a wider-than-tall cell | optional `--cell WxH`; print "render cell N, trimmed WxH" | fox, goat, mushroom, owl, frog, moth |
| T7 **FIXED r2** (module fix r2: `refs/cast/_src/gamespeed_gif.py` crops 1.4·H × 1.6·H around the root (≥ the old 64×72), columns sized to the biggest crop; mushroom staff star + boots inside (`ev-T7-gamespeed-crop.png`); charpack already writes `game-x3.gif`) — was: low (recurring 4: + toad feet cut) | `refs/cast/_src/gamespeed_gif.py` root-following crop cuts feet/cap/staff of figures ≥ 1.3 m or wide caps; `game-1x.gif` figure ≈ 16 px in a 321×233 frame | crop from the figure bbox per clip; a ×3 crop GIF next to `game-1x.gif`; built-in dir-2 x4 per-frame crop | mushroom, crow, goat |
| T8 ~~low~~ **FIXED** (snail's wave-2 report of the out/ push predates the merge) (module fix: `tools/remote.sh` never pushes `out/sprites/` and syncs `shots/*/*.py`; new `tools/pull.sh shots/<dir>` (shots/ or out/ only); verified pulling `shots/fix2/t10/raw`) — was: low (recurring 3) | `tools/remote.sh` pushes the Mac's `out/` on every sync (overwrote a fresh remote bake); syncs only `shots/*/*.js`; has no pull step | exclude `out/sprites` from the push (or push-if-newer), sync `shots/*/*.py`, add `tools/pull.sh shots/<dir>` | skeleton-chef, crow, fox |
| T9 **FIXED r2** (module fix r2: `frame=<k>` on walk/run freezes at the first time after one full cycle that the gait shows drawing k at the given `speed`; + LegGait start tie-break (copies facing N used to start 2 drawings out of phase). Goat 4 drawings × 8 facings: `ev-T9-goat-walk-frames.png`; stats.locoFrame logs the time) — was: low | `grid=turnaround&clip=walk` ignores `frame=` (procedural gait, no travel): no 8-facing walk contact stills | `frame=` on locomotion clips = gait drawing k (bucket) at v_game | moth, skeleton-chef |
| T10 ~~low~~ **FIXED** (module fix: `--clips game` is mapped to the game-speed job (no fake `clip=game` job colliding with `raw/clip-game`); fox `--clips game` → game.readable PASS 3.95 H/s, 4/4 drawings) — was: low | `charpack --clips game` without `--preset cast` drives no travel (0 H/s) and overwrites the main pack's raw dir | imply the cast preset for `game`; refuse to overwrite another job's raw | goat |
| T11 low (recurring 6) — **PARTLY FIXED** (r2: no further change; the lead's die WARN rule kept) (lead, wave 2: `charcheck.py` reports die.foot_slide > 1.5 as WARN with a "collapse counted (T11)" note, number kept; honk 1 FAIL → 0, no other row changed) | `turn.foot_slide` 3.1–4.6 on every pack (the stage's turn drive moves the root ≈ 4 px); `die.foot_slide` counts a collapse/roll/leg fold by height | still open: exclude the stage root offset in turn; real n/a for die after the first fall key (and for `legs: 'fk'` die clips) | goat, fox, honk (8.94), chonk (8.33), green-hood (3.13), mole (6.36 before its root fix) |
| T12 NOT REPRODUCED r2 (smears DO show in 8-facing stills when `fx=0` is dropped: duelist lunge frame=5 grid shows streaks + spark at every facing; the playbook command carries `fx=0`) — was: low | 8-facing grid stills never show smears (no previous key) | `smear=prev:<frame>` param to seed the previous key | frog |
| T13 ~~low~~ **FIXED** (module fix: `spec.presence = [lo, hi]` (share of the mannequin area) overrides the plan range; frog variant presence [0.5, 1.6]: 143 % WARN → PASS) — was: low | Presence check (40–140 %) penalises a deliberately wide v1 head (frog 143 %) | per-spec `presence` range | frog |
| T14 ~~low~~ NOT A BUG (module fix check: every charpack GIF already uses durations [40, 30, 30] ms repeating = 33.3 ms average (`charpack.py` `30 if i % 3 else 40`); reading one frame shows 30) — was: low | `game-1x.gif` plays at 30 ms per frame instead of 33.3 | alternate 3/4 cs | moth |
| T15 **FIXED r2** (module fix r2: `<clip>.key_delta` = smallest px change between consecutive drawings / figure area (authored key changes only, idle/turn skipped, WARN < 1 %; moth lamp 1 %); gaits `<clip>.distinct` = visually distinct drawings (own-bbox crops grouped within 3 %) vs drawing ids: pre-M14 glide snail 3 images / 4 ids WARN → 5 / 4 PASS) — was: medium (recurring 4, wave 2) | No key-to-key difference row: snail's four tinker keys render identically yet `hold_redraws`/`pose_read` PASS (pose_read compares to idle); `game.readable` counts 4/4 pose IDS while 1 drawing is visually distinct (snail walk) | per clip: silhouette/pixel change between consecutive authored keys at dir 1 and S (WARN < 10 %); for gaits, distinct drawings by pixels, not ids | snail, toad, mole, chonk |
| T16 **FIXED (wave-3 module fixer)**: row `game.feet_visible` (each foot `mark=@<foot bone>` on every game-speed gait drawing at 8 facings, jobs `feet-<k>-<foot>`): chonk WARN (left foot 0 px at SE in 3/4 drawings, `shots/mfx4/ev-T16-feet.png`), opal/polly/mincut PASS. Was: **PARTLY FIXED r2; the open part (visible foot px per contact drawing) is recurring 7 after wave 3** (module fix r2: `<gait>.head_bob` = head height above the root per gait drawing + one-sided limp on alternating biped/bird walks (mirror drawings ≥ 3 px apart WARN; skeleton-chef bob 0.3 px WARN, honk limp 3.3): chonk 27.7/31.9/26.7/33.2 limp 1.3, fox 2.7 px bob limp 0.1. Not built: visible foot px per contact drawing) — was: medium (recurring 3, wave 2) | No contact-drawing foot-visibility row and no per-drawing head-height row: chonk's buried contact feet and one-sided bob (161/162/161/165 px), rabbit boots in the dress, mole one boot at S all passed (`foot_slide` n/a) | per gait drawing at dirs 0/1/2: visible foot px per foot (boot/talon slot, outside other slots) + head-joint screen y (`s.h` from the stage log) | chonk, rabbit, mole |
| T17 **FIXED at the source r2** (M13: equal-pose last keys no longer redraw) — was: low | `final_hold` / `hold_redraws` miss a pop ON the last key of a one-shot (honk die f60, 105 px) | diff the frame before the last key against the end | honk |
| T18 low (recurring 7: + polly, requin, progress, opal, mincut, cilantro in wave 3; root cause motion M18) | `game` "60 Hz in-hold" reports root travel (11–14 texels) for a gait whose visible feet are FK (never planted) | n/a when no foot is ever shown planted | rabbit |
| T19 low | `face_lit` uses `spec.faceSlot`; for a void face with emissive eyes it reports 100 % (meaningless); `head_frac`/`height_px` bands for bodyPlan 'biped' don't fit a robed chibi | a face metric for void faces (glow share of the opening per facing, want ≤ 35 % at S/SE/SW); plan bands for chibi robes | green-hood |
| T20 **PARTLY FIXED r2** (module fix r2: `#` in `--q` is sent as %23 (key=#202020 honoured). The `-k` basename failure did not reproduce (g8-k-ring0.png rendered fine)) — was: low (recurring 2) | `tools/shot.sh` fails ("CAPTURE FAILED: unsupported mime type null") when the output basename contains `-k` (g8-k-ring0.png); JSON query params with `#` break (fragment) | fix the extension/mime parse; document `#` | mole, toad |
| T21 **FIXED (wave-3 module fixer)**: bottom-only touches raise the pad by the measured overflow (a lying die / long neck below the feet anchor was the real cause), a figure crossing into the next row is charged to its own cell, FX no longer size the cell (fx=0 pass → cell + trim box; FX outside cropped, warned; `--fxcell fx` = old); char-bake now honours `fx=0`. Render cell cilantro 234 → 126, polly 136 → 100 (`shots/mfx4/ev-T21-cilantro-die.png`). The run-row 3-drawing period was not re-checked. Was: medium (recurring 10: + every wave-3 bake — polly 74→136, clarabelle 98→182, requin 184, opal 88→162, cilantro 92→234, mincut 96, progress 62→84; the FX (bubble, glyph, dust) count in the figure bounds) | Bake: auto-cell starts small and re-bakes (80 → 108 → 146 for toad shrug + glyph; 72 → 98 for rabbit ears) and the `run` row finds 3 drawings for a 4-drawing run clip (snail period 6, chonk `frames run:3`; suspected run weight still ramping in the bake window) | start the cell from the stage bbox of all clips; bake run after a longer lead-in / from the clip period | toad, rabbit, snail, chonk |
| T22 r2: no shared line-up tool exists (critics' own scripts); they must read `pipeline/skip.txt` — documented in the playbook — was: low | Line-up/gallery tools should skip characters listed in `pipeline/skip.txt` (a hook blocks commands that mention them; chonk's line-up failed silently) | read skip.txt and drop those names | chonk |
| T23 DOCUMENTED r2 (charpack: walk/run/game/slide jobs and nofx-* are fx=0; every other clip job (and its strip/GIFs) has FX) — was: low | charpack clip strips are said to render with `fx=0`, so run/vote feather FX cannot be checked from the pack (chonk). Lead A/B: raw `clip-honk` frames DO contain the glyph — verify which outputs drop FX | an fx-on 60 Hz FX strip per clip, or document which outputs are fx=0 | chonk |
| T24 low | `run.off_grid`/`flicker` "legs/specks only" WARNs from in-hold specks traced to hidden-surface geometry poking out (mole mouth box 0.15 m through the chin; chonk nape at z −0.14) — no row points at the part | report changed px by part id (`look=parts`) for in-hold changes | mole, chonk |
| T25 **FIXED (a, c), PARTLY (b) (wave-3 module fixer)**: `sig_outside.<part>` (jobs `hide-<i>`; declared signature PARTS only — declare the tail/beak as `{ part }`), `prop_area.<prop>` (`spec.props`, default named parts below a hand bone; preservation signTauF edge-on 4/8 WARN), `<clip>.face_shimmer` (per-eye re-aligned change; informative under 30 eye px, a fair test needs equal head poses). Was: medium (wave 3, critics' process gaps) | No identity rows: (a) signature part OUTSIDE the body outline per facing (mincut tail hidden at S/N passed `sig.fur`; polly beak, opal tail); (b) face-detail stability: lens/eye interior px change between drawings of the same face (preservation pupils re-rasterised into letters, nothing flagged); (c) flat-prop facing: visible area of a named prop part per facing (6/8 edge-on cards/paddles) | rows `sig_outside.<part>` (px of the part outside the mask without it, per facing), `<clip>.face_shimmer`, `prop_area.<part>` per facing in the vote hold | mincut, preservation, polly, opal, clarabelle, progress critics |
| T26 low | `sig.<part>` counts only parts with exactly that name (a tail split over two bones had to share one name, opal); `sig.<slot>` isolated counts dark eye/nose/glint texels inside a white mask (mincut stays 8–10 at S); a part in a shared slot (ear in 'hide') counts far-half shadow at NE/NW as failing (clarabelle) | part-name prefixes / lists; exclude other-slot px enclosed by the slot; measure only the lit half for sideways parts | opal, mincut, clarabelle |
| T27 low | `sig_ground` judges lightness only for shade copies (a blue member 118° off grass fails until its shadow is lightened, preservation) and samples the most saturated signature part (clarabelle's snout salmon instead of the white hide); no row says whether the MAIN slot keeps its identity hue in golden/shade (the mauve/peach drift 5/8 critics found by eye) | hue OR value in the shade copy; a `main_hue` row: main slot hue/value per scene copy vs noon | preservation, clarabelle, cilantro |
| T28 low | `strobe` does not exclude FX frames: an emote glyph fading over 2 frames + a prop change on the frame between = 3 consecutive changes (FAIL); FX step on twos from their birth, so an event an odd number of frames from the next key strobes | skip FX-flagged frames in `strobe`, or make fx step in phase with the clip grid | mincut, polly |
| T29 low | `charpack.sh --preset cast` does not refresh `dir2/` (critic judged stale r1 output); `tools/remote.sh X=1 cmd` does not pass env vars (use `tools/remote.sh env X=1 cmd`, documented in the playbook); `tools/clean.sh <dir> '<pattern>'` prints "cleared <dir>" (unclear whether only the pattern went) | print the stale-dir warning; echo the matched count in clean.sh | opal, mincut, preservation |
| T30 low | 8-facing grid stills from shot.sh are 1×: every critic/author wrote a remote crop helper (×3–×8) and the zsh-loop mistakes came from batching them | `tools/shot.sh … --x 3` (nearest enlarge + per-cell crop) | cilantro, polly, preservation, opal critics |
| T31 low | Turn audit: idle-loop keys (ear flick, tail, breath) inside the post-turn window look like settle redraws on `clip-turn.png` | label each redraw as key / step / dynamics from the log | clarabelle |
| ~~medium~~ fixed r06 | Hop/skip gaits (duty ≤ 0.2): `foot_slide` reports 17.6–18.7 texels at dir 2 with "0 planted pairs" (no foot is planted on two consecutive drawings, so there is nothing to measure), and `game.readable` says cycle 0.433 s / 1.71 H for a gait whose pose ids show a 4-drawing loop every 8 grid frames (0.27 s / 1.1 H) | report n/a (not a number) when there are 0 planted pairs; derive the game cycle from the gait phase / pose-id period, not from foot-0 touchdowns at drawing changes | refs (`shots/refs-cast/recipe-chibi/report.txt`) |


- (char-storyteller, tools, low) turnaround grid: cells 85 px apart vertically, so a 1.8 m figure in the 2nd row (SW) overlaps the
  1st row. height_px then reports max 96 and the SW tile shows another facing's hem (`shots/char-storyteller/p3/turnaround.png`).
  (fx, low) `land@staffTip` draws its dust ring at the root, not at the socket. (tools, low) `face_visible` counts every part of
  the face slot (gloves, clock hands share `void`): 27 % for a face that is fully visible.

## Integration (lead r6, 2026-10-16)
- **Pose-id format is a cross-module contract.** LegGait emitted a running drawing counter (`walk:<k>`), tools parsed
  `<gait>:<frame>:<cycle>`: every LegGait plan fell back to foot-0 touchdowns and footless plans (snail, blob, moth)
  FAILed `game.readable` with "cycle None". Fixed in locomotion.js: all gait buckets are now `<gait>:<drawing in
  cycle>:<cycle>` (authored-clip LegGait ids `<gait>:k<n>:<frame>:<cycle>`), same change points → 0 px differ over
  5,063 raw frames (4 characters) and 717 frames per plan. limbless 0.300 s / 1.18 H, moth 0.267 s / 1.05 H, 4/4 drawings.
- **A runtime feature needs its drivers updated too.** `clip.hold` (vote/die) worked in Character but char-stage's drive
  returned the action name only for 0.05 s, which is exactly the "release" signal: held clips sprang back to idle.
  char-stage now keeps returning the name for held clips; `shots/lead-r6/hold-die/` final_hold PASS (held 24.5 grid frames).
- **Fair regression = same checker on both packs.** Re-running today's charcheck on the old raw renders
  (`shots/lead-r6/old-critic-*-r2`) turns "new FAIL rows" into real comparisons: keeper thump.strobe 4 → 3,
  hold_redraws 7 → 0, raise/hurt strobe 3 → PASS; hound turn/run slide identical (13.24 / 4.35). New rows without an old
  counterpart are not regressions by themselves.
- Default charpack clip list = the spec's clips (no `turn`); add `--clips idle,turn` when comparing with older packs.
- A fly/glide plan's dangling legs were scored as planted ("stance by height"): foot_slide is now n/a for
  `locomotion.plan` fly/glide (char-stage passes `locoPlan`).

## Archive — cast wave 1 per-agent notes (consolidated 2026-10-16)

Everything below was written per agent during wave 1 (authors and critics). The lead merged it on 2026-10-16: recurring
lessons are now **(recurring)** bullets in the topic sections above and **R** lines in `docs/CHARACTER_PLAYBOOK.md` /
`docs/CAST_PORTING.md`; every "Module backlog additions" row is folded into §Module backlog (M1–M8, T1–T14, rig, look,
fx rows). Kept for character-specific numbers and evidence paths. **Wave 2: do not append here — use the topic sections.**

## Additions (char-frog, run 05)
- (frog, Locomotion) A knight frog on the CHIBI skeleton plays a clean two-footed hop with `locomotion: { plan: 'hop',
  legs: { HL: [thigh/shin/foot L], HR: [...R] } }` — WITHOUT the `legs` override the hop plan also plants FL/FR =
  upperArm/forearm/hand (the arms). Result at 3.95 H/s: 0.289 s / 1.14 H per cycle, 4/4 drawings, 60 Hz in-hold slide
  0.0, hop arc 0.2 H ≈ 8 texels (`shots/char-frog/clip-game.png`, `gamespeed.png`). At 2·v the planted drawing cannot
  hold (0.63 m of travel per 2-frame hold vs 0.2 m reach): in-hold 6.75 texels and run.off_grid/flicker FAIL from the
  stance-surge root translation (surge: false → off_grid WARN 3 but in-hold 8.0). Rule: hop plans = hind legs only;
  accept/declare the run limitation.
- (frog, Secondary) LegGait (any `locomotion.plan`) ignores authored `clips.walk/run` poses: `bodyPose` never overlays
  them (only `bucket()` reads the clip). A held prop is carried in the gait at the REST pose, so author the rest
  geometry as the carry pose (frog: sword socket rot [55, −50, 0] = down-out-forward, shield normal 35° out) and keep
  the idle's arm keys within ≈ 10° of rest so start/stop does not snap the arms.
- (frog, Props) A 1-link cape on the chest re-aims from the chain sim in CHARACTER space, so pitching spine/chest
  forward ≥ 20° moves the cape root forward while the cape stays near world-vertical: the tassets/belt poked through
  the cape at N/NE/NW (die crouch, oath bow; `self/g8-die-f6-x3.png` history). Offsetting the panel 0.04 m back did
  NOT fix it; keeping the upper body upright in the key (pitch in `hips` ≤ 6 + head, crouch via pos/legs) did. Rule:
  render back facings of every crouch/bow key; lean the head, not the chest, under a cape.
- (frog, Faces) A frog mouth needs a BACK hinge: the upright template's jaw joint sits near the front of the head
  ([0, 0.22 hl, 0.30 hl]) so rotating it barely moves the lip. Moving `jaw.pos` to the back of the mouth (z −0.10) and
  putting the dark mouth floor + tongue ON the jaw's top face (hidden while closed, tips toward the camera when open)
  gave ≈ 6 texels of opening at 26–28°.
- (frog, Timing) die.strobe 3 came from post-impact pose keys 3 frames after the `die` event while the death FX step on
  twos from its birth: keys at impact+2 and +6 (same parity as the FX) → strobe 1. Also vote/die `final_hold` needs the
  clip length to outlast the FX tail (wisp 1.2 s, sparkles 0.67 s): repeat the last key later (frog: vote f30, die f60).
- (frog, Palette) **(recurring: hound moss, frog skin)** `#A4F4CC` mint still collapsed toward golden grass (dH 23 WARN);
  lower red / more blue `#92F2D4` → golden dH 31 PASS, noon dH 45.
- (frog, Look) A shield on the LEFT forearm was far-forced at S (dark blue-brown, `look=far` magenta): it is the main
  S/SE prop, so `material.sides { forearmL: 'mid' }` (the shield sits on the forearm, not under a hand bone, so look's
  prop rule does not catch it).
- (frog, Tools) Glyph events (`emote:drop`) placed mid-hold fired only at the next drawing: put emote events on key frames.

### Module backlog additions (char-frog)
| sev | owner | issue | evidence |
|---|---|---|---|
| medium | motion | LegGait.bodyPose ignores authored walk/run clips (arms/props cannot be keyed in the gait for any plan) | characters/frog.js header; locomotion.js LegGait.bodyPose |
| medium | tools | run/game off_grid + flicker count the LegGait stance-surge root translation as upper-body change (best-shift diff 0–13 px on equal pose ids) | shots/char-frog/report.txt run rows |
| low | rig | uprightAnimal jaw hinge near the front of the head: useless for wide frog/toad mouths | frog jaw override |
| low | fx/tools | 8-facing grid stills show no smear (no previous key); the frog oath sweep smear was not visible in the pack strip either — unverified | shots/char-frog/clip-oath.png f23 |

### Critic note — frog (Sir Croaksworth), 2026-10-16 — 17/24, not shipped
Evidence: `shots/critic-frog/` (pack `--preset cast --raw`: 61 pass / 19 warn / 2 fail), `shots/critic-frog/mine/`
(`keysA-x3.png`, `keysB-x3.png` 8-facing keys, `sil-lineup.png`, `prof2-60hz-x3.png` E-profile game-speed walk, `game-1x-frames.png`).
- A rigid one-link cape reads as a flat red board, not cloth, at game speed: in profile (`prof2-60hz-x3.png`) it sticks out
  almost level behind the body, and in die f25–f68 it is a red rectangle. A cape that carries the rhythm needs ≥ 2 links,
  or bend/flare keyed per drawing.
- Blade slot `cream` makes the sword read as a stick or a bone at 1x. Steel weapons belong in the steel slot with a dark edge.
- Eyes as 2×2 pupils plus no mouth line at rest lose the v1 frog face (big outlined eyes, wide mouth). At 1x the head reads as a
  mint hood. In the side views (E/W) the head is a narrow column with no bulge from the eye bumps (`sil-lineup.png`).
- An FX glyph keyed after a pose change lands on the wrong pose: the oath tear shows mainly at f49–f51, after the head is back up.
- Unique gait passes the speed numbers (3.95 H/s, 0.289 s, 4/4) but the legs are a brown lump at 1x, so "hop" is carried
  only by the root bob. A frog hop needs a visible crouch and leg-extension silhouette.

## Critic note (critic-mushroom, 2026-10-16) — Brother Morel, 15/24, not shipped
Evidence `shots/critic-mushroom/` (full `--preset cast --raw` pack, 62 pass / 20 warn / 0 fail, RTX 4090; own renders
`g8-{die-f42,vote-f12,bless-f26,bless-f33,talk-f15}-x4.png`, `game-1x-track-x4.png`, `*-1x-sheet.png`, `sil-stack.png`).
- (critic-mushroom, Die) A robed lathe body lying down shows the robe's open hem/inside as a dark-maroon disc, and boots
  pointing up read as "panda ears" at N/NW (`g8-die-f42-x4.png`); at S/SE the final hold is a jumble. Close the hem
  (cap disc in robe colour) and render the die hold at 8 facings before shipping any robed character.
- (critic-mushroom, FX) Spores recoloured cream = the cap-spot colour vanish against the cap (`clip-bless-1x-sheet.png`,
  `g8-bless-f33-x4.png`): a signature FX must contrast with the part it leaves (gold/green-white motes, larger puff, falling
  below the brim onto the dark robe/ground).
- (critic-mushroom, Identity) A 2-arm extruded star reads as an "F"/key at SE/E (the pack facing) and in the whole walk:
  props whose identity is a flat emblem need a face-on (billboard-ish) or thick 3D form.
- (critic-mushroom, Gait) A held-rigid staff on a 0.24 H-leg robed chibi reads as a glide with a brown boot lump trailing
  the hem (`game-1x-track-x4.png` frames 5-9). A walking-staff character should plant the staff per cycle (the staff IS
  the contact drawing) — motion backlog (LegGait ignores authored walk poses) blocks it.
- (critic-mushroom, Emote) bless f26 is nearly vote f12 at all 8 facings (staff high + free hand): an emote must not reuse
  the vote silhouette.

## Critic note (critic-mushroom r2, 2026-10-16) — Brother Morel, 15/24, not shipped
Evidence `shots/critic-mushroom/` (full `--preset cast --raw` pack, 63 pass / 22 warn / 0 fail, RTX 4090; round-1 pack moved to
`r1/`; own renders `game-30hz-x4.png`, `game-dir2-30hz-x4.png`, `game-boot-x8.png`, `game-1x-sheet.png`, `g8-*-x4.png`,
`se-keys-1x-x4.png`, `sil-stack.png`). Fixed since r1: die hold (closed ivory hem, no panda boots, reads "down" at 8/8),
bless no longer the vote shape (f8 wide staff sweep, f25 bow), spores pale green, deeper amanita red, single thick star.
- (critic-mushroom r2, Gait — regression) Shortening the boots + lowering the hem with NO shin geometry made the skip's
  airborne boots float as detached 3×3–4×4 dark squares 2–5 texels outside the robe, mid-robe high (`game-boot-x8.png` g5/g13
  at dir 1; `game-dir2-30hz-x4.png` e3–e19 on both sides at dir 2). Rule: a hidden-leg character must keep its swing feet
  INSIDE the hem silhouette (clamp foot lift/reach to the hem radius, or give the boot a dark shin stub that always connects
  it to the hem); check dir 2 at game speed after every leg/hem change.
- (critic-mushroom r2, Face) A wide cap + forward lean/nod at game speed hides the face on 2 of 4 walk drawings at dir 1
  (`game-30hz-x4.png` g7–g9, g15–g17) and in the talk nod keys at SE (`se-keys-1x-x4.png` talk-f0): with a brim ≥ 1.8× face
  width, keep head WORLD pitch ≤ 0° in every gait drawing too, not only in held action keys.
- (critic-mushroom r2, Sheet = code) The design sheet still describes r1 (cap hi #EE8A70, "staff arm held in walk",
  cream spores, backward die topple, bless f18 hand sweep); the code now swings the staff with the left arm and topples
  forward. The critic diffs them — update the sheet with every round.
- (critic-mushroom r2, FX) The idle `flap@sporeR` fleck at f60 falls across the face as a 3–4 px yellow-green diagonal
  (`clip-idle.png` f60/f72, also both shade copies in `scene-*-crop.png`): spawn spores outboard of the face silhouette.

### Critic note — frog (Sir Croaksworth) r2, 2026-10-16 — 18/24, not shipped
Evidence: `shots/critic-frog/` (fresh `--preset cast --raw` pack on render-host RTX 4090: 61 pass / 20 warn / 2 fail; r1 critic files
moved to `shots/critic-frog/r1/`), own renders `keysA/B/C-x3.png` (every key at 8 facings), `face-S-SE-x6.png`, `face2-x6.png`,
`game-1x-sheet.png`, `clip-*-1x-sheet.png` (1x GIF frames with durations), `sil-lineup.png`.
- r1 fixes landed: 2-link cape trails and swings with the hop (`clip-game.png`), steel blade, rimmed eyes + blink read at 1x
  (`face2-x6.png` row 2), oath sweep smear visible at ≥ 6/8 facings (`keysC-x3.png` row 4), tear glyph now on the bowed key.
- A lathe skull that is TALLER than wide plus two round top bumps reads as mouse ears at S/N and as a thumb/column at E/W
  (`sil-lineup.png`, `turnaround.png` E/W): a frog head must be wider and flatter than the body with the eyes bulging
  sideways and a snout/mouth wedge in profile, or E/W loses the species.
- A cream jaw the full width of the head, sitting under a mint skull, reads as a collar band; with gorget + belt + tassets the
  torso becomes 5 horizontal stripes (`face-S-SE-x6.png`). Wrap the skin round the cheeks so the cream sits INSIDE the head.
- A short sword whose blade is 1–2 texels of pale steel at foot level reads as a dragged stick in the gait (`clip-game.png`)
  and vanishes in the salute at S (`keysC-x3.png` rows 2–3): a signature prop needs ≥ 3 texels of width or a dark edge.
- A two-footed hop whose flight drawings sit at standing height reads at 1x as a squat-bob (`clip-game-1x-sheet.png`): the
  crouch carries it, the airborne apex does not; raise the apex clearly above the standing silhouette.
- Sheet ≠ code: `frog.md` still documents the r1 1-link cape, rot [55,−50,0] and r1 numbers.

## Additions (char-fox, 2026-10-16)
- (fox, Secondary/Locomotion) **A keyed tail can carry the game-speed rhythm without a chain**: LegGait's biped style
  writes the left-arm swing triple `[lerp(0,12,w) − A·sL, 0, 6+4w]` to `bones.armL[0]` — route it to a tail bone whose
  axis is SIDEWAYS (`axis: 'left'`, so `fwd` = yaw about the vertical) and the elbow channel to a part-less bone
  (`bones: { armL: ['tail0', 'mugHold'] }`): the tail swishes ±A once per cycle in phase with the steps and the prop arm
  keeps its carry rest pose. `arms [40, 50]` → white tail tip moves ≈ 10 texels between drawing pairs at dir 1
  (`shots/char-fox/game-onion.png`, `self-game-1x-sheet.png`); no dynamics redraws, hold_redraws 0 everywhere.
- (fox, Poses) **(recurring: mushroom staff, frog sword)** A 2.2-head chibi cannot raise a paw above its head (shoulder
  0.55 + arm 0.31 < head centre 0.84). What read best: on tiptoe (+0.05), chest tilted 12° away, `upperArmR [40, 0, 125]`
  (up-FORWARD-out; `[-12, 0, 128]` hid the paw behind the head at SE) → paw beside the head at 5/8 facings; a fur paw
  vanished against the orange head — paws in a contrasting slot (dark "socks") made it read.
- (fox, Die) A chibi in an A-line skirt: falling backward shows the skirt underside as a dark disc, falling face-down is
  a blob at S; rolling onto the side (`hips [0, 0, 82]`, knees drawn up, head turned up) reads "down" at S/SE with ears
  + tail + face visible (`g8-die-f45-x3.png`). Cost: the roll moves the planted boots (die.foot_slide 3.44 FAIL).
- (fox, Faces) At dir 1 (SE) the camera sees the character's RIGHT side: head twists toward the viewer are NEGATIVE
  (`head [0, −14, 0]`); my first whisper/talk keys used + and showed the back of the head.
- (fox, Palette) **(recurring: hound moss)** Orange fur passed sun copies (noon dH 86, golden 43) but its sh `#9A4A48`
  sat at dL +0 % vs grass shadow; `#B4605A` → +20 / +24 % (shade PASS).

### Module backlog additions (char-fox)
| sev | owner | issue | evidence |
|---|---|---|---|
| low | rig | ear bones on the head: the ear/skull overlap draws a dotted inner line (isolated_px fur 9 at S); a `blend` or a part-id merge for same-slot parts on parent/child bones would remove it | shots/char-fox/turnaround-isolated.png |
| low | tools | `--bake --cell 132` printed a 62×71 cell (the explicit cell seems not honoured) | bake log, out/sprites/fox.json |

## Additions (char-goat, Magistrate Billings, run 05)
- (goat, Props) **Wrist compensation sign for a plumb staff depends on WHICH bone pitched.** Rotating the upper arm
  `fwd +a` needs `handR fwd −a` (STAFF_UP); pitching the SPINE/CHEST forward by p needs `handR fwd +p` (the staff top
  rides forward with the chest while the hand's "tip" is the staff foot). The first slam key used −18 and tipped the
  staff 45° (`shots/char-goat/clip-verdict.png` history). Rule: up-bone pitch → wrist same sign; arm pitch → opposite.
- (goat, Locomotion) **A long held prop amplifies the LegGait arm swing.** Routing the right-arm swing to the wrist
  (`bones.armR: ['handR', 'staffSway']`) with arms 16 → 9° still tilted a 1.2 m staff 30–40° on screen every other
  drawing at dir 1; arms 0 kept it plumb (A/B `shots/char-goat/ab-a/` vs pack). The Character's acceleration lean
  (clamped 14°, ≈ 0.4 s on a standing start at 4 H/s) also tips a hand-held staff ≈ 30°; personality.body f 2.5 → 4,
  ζ 1 did not change it (the lean target is clamped, not filtered). Rule: staff characters carry with arms ≈ 0 until
  LegGait reads authored walk poses; report the start lunge.
- (goat, Secondary) **(recurring: mushroom cap chain, goat ears)** 1-link sprung ears on a chibi head (f 4 ζ 0.55 and
  f 6 ζ 0.9) redrew 2 settle drawings after every 1-texel idle breath key (`pos` dip moves the head) and showed no
  visible swing in the game-speed walk. Keyed ears (out + = up on the sideways bone) cost 0 redraws (idle intervals
  6,2,10,4×3,6,36) and read better in vote/die. Rule: on chibis, key short accessories per clip; springs only when
  they visibly move in `clip-game.png`.
- (goat, Props) **Show/hide a prop with the scale channel by authoring it tiny**: `'<bone>.s'` is an offset, so a key
  that omits it means scale 1 — a prop meant to be hidden in the procedural walk must be AUTHORED at 5 % inside the
  fist and scaled ×20 (`.s` 19) in the clip keys that show it (the evidence sheet). Also key the prop bone's rotation
  so it faces the viewer in the key pose: the forearm/hand pitch (~105–140° in a raised key) laid the sheet flat and
  it was invisible at all 8 facings until `sheet: [-100, 0, 0]` (`g8-verdict-f0-x4.png`).
- (goat, Silhouette) Ram horns as a tube path: an arc lying in the x–z diagonal is seen EDGE-ON at the far side of
  dir 1/7 (a vertical tan post above the head; at SE screen x ≈ 0.71·(x + z) spanned only 0.13 m). A 3-D spiral
  (up-back → out → down-forward, x + z spanning 0.29 m) reads as a loop at S/SE/SW/N; at E/W it is still two spikes.
- (goat, Faces) White muzzle on a white head: same bone + slot = no inner line, the muzzle vanished at S. A part-less
  child bone (`muzzle`) gives the muzzle its own part id → a 1-px inner line round it (`ta-x3.png`).
- (goat, Poses) Die on the back: thighs 95° (frog numbers) left the boots sticking up like ears at N/NE on a robed
  body; legs along the body line (thigh 12, shin −12) fixed it (`g8-die-f40-x4.png`). A flinch key with `pos.z` and
  un-keyed FK legs slides the feet (die.foot_slide 1.93 FAIL); buckle with thigh a / shin −2a / foot a and pos z 0 →
  0.61 PASS.

### Module backlog additions (char-goat)
| sev | owner | issue | evidence |
|---|---|---|---|
| medium | motion | (recurring: mushroom, frog, goat) LegGait.bodyPose ignores authored walk/run clips: a staff cannot plant per cycle, ears cannot be keyed per gait drawing | characters/goat.js locomotion comment |
| low | motion | acceleration lean on a standing start is clamped to 14° and ignores personality damping; tips long props | shots/char-goat/clip-game.png f3–f13 |
| low | refs/tools | `gamespeed_gif.py` crops the pixel3d figure's feet off (crop window too high for a 1.44 m figure at its scale) | shots/char-goat/gamespeed.png |
| low | tools | `--bake --cell 132` reported cell 86×132 with border warnings, `--cell 180` reported 86×94 with none: the cell number's meaning is unclear | out/sprites/goat.json |

## Additions (char-moth, run 05)
- (moth, Secondary) **Wings that move in the gait without authored walk poses**: LegGait ignores `clips.walk`, but its
  biped arm channels can be re-routed: `locomotion.bones.armL: ['wingL', 'upperArmL']` sends the arm SWING (fwd ±A per
  step) to a keyed wing bone and the ELBOW channel (fwd el + A/2 on one step) to the upper arm. With wing panels built
  trailing back (bottom 0.19 m behind the joint) A = 24 gives a 48° scissor flick between the two step drawings that
  reads at 1× (`shots/char-moth/clip-game.png`). Rule: any part that should carry the rhythm can ride a LegGait channel;
  build its rest geometry so the ±A swing never enters the body.
- (moth, Secondary) **A spring chain riding on the head settles 3–4 drawings after every head key in idle**, whatever
  f/ζ/quant (f 4.5 ζ 0.55 → f 6 ζ 1, quant.chain 4 → 2 changed nothing; A/B `wv=a` without the chain: 0 settles). Fix
  that worked: counter-key the chain bones in the head key so their WORLD direction stays put (head twist 26 + neck 8 →
  `antL0 [-16, -34, 0]`, `antR0 [-16, 34, 0]`: R needs the opposite twist sign because the rig mirrors twist): 4 settles
  (86/71/39/25 px) → 1 (37 px). (recurring with duelist plume / hound ears: keep the chain's world target constant.)
- (moth, Props) A pendulum lantern chain (keeper numbers f 3.4, limit 60°) trailed BEHIND the body at 4 H/s and vanished
  from the walk at dir 1. At game speed a hanging prop needs f ≈ 7, limit ≈ 24° (still plumb in idle, trails ≤ 24°).
- (moth, Palette) A collar in the signature slot touching the head (same slot, different bone) drew a dotted inner line:
  `isolated_px` fluff 21 → 8 by giving the collar the next-lightest slot (wing); a half-facet-turned cheek fluff ring added
  +5 isolated px and no visible fuzz at 1× (removed). Rule: fuzzy edges on a chibi head = the lathe's own facets (10
  sides); neighbours of the signature use another slot.
- (moth, Poses) On a 2.15-head chibi nothing raised from the shoulder (0.54 m) clears the head (top 1.12 m): wings out
  128° hid behind the head (a pale halo), a lantern arm out 160° hid inside the head outline. What reads at 8 facings:
  wings spread HORIZONTAL (out 88, fwd 16 so the near wing clears the head at SE) + the lantern held out sideways (vote),
  and a beat between out 112 and out 46 for flapping (emote) — `shots/char-moth/self/keys-A.png`, `keys-C.png`.
- (moth, Night) A lantern glow that is deterministic and "quantised": the tones hook keyed on the glass mid tone, levels
  from `dot(uRampHi, luma)` thresholds (day > 0.85, dusk 0.45–0.85 = golden 0.64, night < 0.45 = 0.29), no uTime →
  `night_freeze` 0 px. The scene-copy PointLight follows the same level (0 / 1.4 / 3.2).
- (moth, Tools) zsh: `set -- $(echo $k)` inside a for loop over quoted "clip frame" pairs works for batches of
  `tools/shot.sh` 8-facing stills (unlike `set -- $v`); 19 key stills in one call.

### Module backlog additions (char-moth)
| sev | owner | issue | evidence |
|---|---|---|---|
| medium | motion | LegGait in-hold drift at 4 H/s on chibi legs (0.21 H): 60 Hz in-hold 3.87 texels (walk/game), 12.96 (run) — the re-pinned stance leg cannot reach through a 2-frame hold | shots/char-moth/report.txt game.foot_slide |
| medium | motion | Head-riding spring chains settle 3–4 drawings after every idle head key regardless of f/ζ/quant (workaround: counter-key the chain bones) | characters/moth.js idle f54 |
| medium | look | still no `spec.lights`: Lumen's lantern PointLight exists only in shots/char-moth/night.js, packs and bakes show only the glass | characters/moth.js attachLumenLight |
| low | tools | `sig_ground` samples the signature's darkest tone (#AA9099 = fluff sh) for the sun copies | shots/char-moth/report.txt |

## Additions (char-crow, Mortimer, 2026-10-16)
- (crow, Silhouette/Faces) A wide brim on a chibi head hides the face at the 30° camera pitch and no row catches it:
  brim r 0.44 m sitting on a 0.46 m head covered both eyes and most of the beak at S/SE/SW while `face_lit` still read
  96 % (it scores the lit share of the face px that remain, not how many remain). What showed the eyes at 1×: head widened
  to Ø 0.52, brim r 0.41 PRE-TILTED back 12° about its own centre (`K.xf(K.xf(g, {at}), {rot})` = rotation about the
  bone origin), brim raised to the head top (`self/turn-x4.png`). Rule: for wide hats check eye px at S/SE/SW by eye on a ×4
  crop; tilt the brim back 10–12° before shrinking it (a narrow brim loses the signature: the 0.37 m brim made the crow a
  "bell with a hat" next to the wanderer in the 25 % line-up).
- (crow, Props) **Re-grip a long prop with a prop bone + `'<bone>.p'`**: a `shovel` bone under `handR` slid 0.45 m along
  the shaft in the vote lets the short chibi arm (0.23 m) hold the shovel near its end, blade 0.2 m above the hat. On a
  hand-held prop the net shaft tilt = arm fwd + wrist fwd and the blade end follows the bone tip (arm 52 / wrist −62 sent
  the blade BACKWARD — sign error found on the E facing of the 8-facing still). Raised up-forward (fwd 125–160 + out) the
  shaft crossed the brim at SE; raised sideways (`upperArmR [−10, 0, 145]`, wrist out −12) it clears at S/SE/SW/N/W and
  crosses only on the carrying side (E, NW) (`self/g8-vote-f12-x3.png`, variants `_a`…`_h`).
- (crow, Props) Hidden-by-default parts: microscopic rest geometry + a `'<bone>.s'` scale key (×220) shows a dirt clod only
  in one key with no visibility flag. Scale is about the bone JOINT: the first version (bone at the grip, clod 0.13 m away)
  threw the clod 28 m off-screen. Put the bone at the part, the geometry at its origin.
- (crow, Secondary) LegGait still ignores authored walk poses (recurring: mushroom, frog, crow). Routing each arm's
  ELBOW channel to a part-ful coat-tail bone (`locomotion.bones.armL: ['upperArmL', 'flapL']`, `elbows: [−40, −60]`) gives
  tails that trail up behind in walk/run and rest at idle, deterministic, no chain jitter — but the per-step flick is only
  A/2 (9–15°) because it shares the arm-swing amplitude. The arm swing itself rocks a held shovel: 26° swung the blade
  horizontal behind the body at 4 H/s (twist + lean add to it); 18° reads as a planted walking stick (`clip-game.png`).
- (crow, Die) **(recurring: mushroom, crow)** For a wide-hat/cap character the face-down topple is the readable death at
  the game facing: the brim disc faces the camera at S/SE/SW (identity at 25 %), the coat back and tails up; falling onto
  the back showed the open hem as a dark hole and the hat edge-on, falling on the side hid the head behind the coat at SE
  (`self/g8-die-f40_a-x3.png` vs `g8-die-f40-x3.png`).
- (crow, Process) zsh does not word-split a loop over "clip frame" strings (recurring, keeper r2): 9 stills silently
  failed with files named `g8-idle 1-f.png`. Write explicit commands.

### Module backlog additions (char-crow)
| sev | owner | issue | evidence |
|---|---|---|---|
| medium | motion | LegGait ignores authored walk/run clips (recurring: mushroom, frog, crow): props and coat tails can only ride the arm/elbow channels (shared amplitude, ≤ 15° tail flick) | characters/crow.js `locomotion.bones`; shots/char-crow/clip-game.png |
| low | refs/tools | `refs/cast/_src/gamespeed_gif.py` game crop cuts off the lower third of a 1.32 m figure (the root-following crop window sits too high) | shots/char-crow/gamespeed.png |
| low | tools | `face_lit` reports the lit share of the visible face px only: a face 80 % hidden under a brim still PASSes (96 %) | first crow turnaround (brim r 0.44) |

## Additions (char-owl, run 05)
- (owl, Measurement) **The pack turnaround is rendered at t = 1 s = idle grid frame 30.** A blink key at f30 made every
  turnaround/scene shot show shut eyes (amber slits) and cost three geometry iterations on "too small" eyes. Rule: the
  idle drawing at f30 must be the neutral face; put blinks/glances at f54–f64 (frog did by luck).
- (owl, Faces) Proud eye discs at 1× lose their colour to the inner-line ring: an 8-gon amber disc 0.17 m wide + a proud
  0.075 m pupil rendered as a 4-px brown blob with a 1-px amber rim. Cutting iris, pupil and glint OUT of the head
  surface (mushroom spot recipe: subdivide 0.022 m, split by centroid angle) gave clean 6-texel amber eyes with a 2×2
  pupil and 1-px glint, face_lit 98 %. Blink then needs a lid that slides OUT of the skull: a feathered 8-gon on its own
  `lidL/R` bone recessed 0.12 m along the eye normal (0.06 m still poked through at the head's curvature), keyed with
  `lidL.p` (shut = normal × 0.132; squint = shut + 0.075 m up). Brows the same way (recessed, popped by `.p`).
- (owl, Secondary) **(recurring: hound ears, duelist plume)** 1-link chains on the head redraw inside LOOP clips:
  Character only suppresses dynamics redraws for one-shot actions (`clip.dynamics` is read for `s.action` only), so
  idle/talk keys were each followed by 21–72 px settle drawings 2 and 4 frames later. A/B `shots/char-owl/ab-c`
  (`chains: []`) → 0 non-FX redraws. Rule: on short accessories riding a keyed head, key them per clip instead of
  springs, or accept the settles (motion backlog below).
- (owl, Locomotion) Robed short-legged chibi (leg 0.14 H): LegGait `bird` plan on the CHIBI skeleton (default legs
  thigh/shin/foot) gives a readable WADDLE at 3.95 H/s: roll [12, 4], headBob [10, 6], bob 0.03, `wings: []` (else the
  plan swings the arm bones as wings out of the ledger hug) and `surge: false` (A/B `shots/char-owl/ab-s`: surge on →
  game.flicker FAIL 19153 px for 0.5 texel less slide). 0.267 s / 1.05 H, 4/4 drawings; the run branch is a two-footed
  hop for free. Cost: 60 Hz in-hold foot slide 4.7 texels (hidden under the hem).
- (owl, Poses) A raised wing on a big-headed chibi (head 0.6 m wide over shoulders at 0.49 m, wing 0.43 m) cannot clear
  the crown: fwd-up keys put the sleeve across the face at S; the best read was up-and-OUT (upperArmR [30, 0, 140],
  forearm −70 to straighten the bent hug rest, `handR.s` 0.8 to spread the tip feathers) + body tilted to the other side
  (hips/spine/chest out 8/8/10). Still hidden at E. **(recurring: mushroom)** cast chibis with heads ≥ 0.5 m need a prop
  or a feather fan for the vote.
- (owl, Poses) A head swivel's direction must be chosen for the GAME facing: at dir 1 (SE) a +75° (left) swivel shows
  the back of the head; −75° (right) turns the face to the camera. Test idle/emote swivels on `clip-<c>.png` (dir 1),
  not only on S.
- (owl, Timing) die.strobe 6: impact key at f17 (odd) while the hit's feather FX (born f0) stepped on even frames →
  alternating 1-frame changes. Impact at f18 → strobe 1 (frog's parity rule, recurring).

### Module backlog additions (char-owl)
| sev | owner | issue | evidence |
|---|---|---|---|
| medium | motion | Loop clips (idle, talk) ignore `clip.dynamics`: chains always redraw 'free', so head chains settle after every key | character.js `dynMode = s.action ? … : 'free'`; `shots/char-owl/ab-c` |
| medium | tools | Bake loop detection cuts the walk at 3 drawings: LegGait shows only 3 of 4 drawings in the first two cycles while the speed ramps up (pose ids `walk:1:0,2:0,3:0,1:1,…,0:2`), and the repeat search matches `walk:1:1` | `out/sprites/owl.json` walk frames 3 period 6; `raw/clip-game.json` |
| low | motion | LegGait first 2 cycles skip drawing 0 at game speed (acceleration) | `raw/clip-game.json` pose ids |

## Additions (char-skeleton-chef, run 05)
- (skeleton-chef, Locomotion) **LegGait 'biped' sits a short-legged chibi down at game speed.** Its body drop
  `Hh − √(Lg² − half²)` uses half = max(C/8 + v/60, v·hMax − C/8): at 5.53 m/s with a 0.3 s cycle half ≈ 0.34 m ≥
  Lg 0.29 m → the drop is the WHOLE leg; even at the 0.267 s floor half ≈ 0.28 m needs Lg ≳ 0.5 m for a < 3-texel
  crouch. Bones (leg 0.30–0.36 m) ran "seated", legs folded out of sight behind his basket (`shots/char-skeleton-chef/
  dir2/clip-walk.png`). The legacy Gait chibi recipe (CAST_PORTING §8: stride 0.55 H, duty [0.18, 0.1], reach 0.6,
  poses [4, 4], runFroude [1.5, 2]·Fr_game, legIK 'pose') kept the legs straight and alternating, walk flicker 813 → 4–7
  px, game.readable 0.278 s / 1.1 H, 4/4 drawings (`gv2/clip-walk.png`, `clip-game.png`). Cost: planted feet ride the
  root inside holds (60 Hz in-hold 7.0 texels). Rule: render the walk at dir 2 BEFORE choosing LegGait for a leg
  < 0.4 m; if the hips sink > 3 texels, use the legacy recipe (it also plays authored clips.walk/run upper bodies:
  Bones keys his jaw clack and toque wobble per gait drawing there, which LegGait would ignore).
- (skeleton-chef, Props) **(recurring: mushroom, skeleton-chef)** A chibi's raised hand cannot clear its own head:
  shoulder 0.52 m < chin 0.565 m, arm 0.27 m → the hand tops out at mid-skull and hid behind the head at SE in every
  arm-only variant (`shots/char-skeleton-chef/wv-vote-{a..i}-x4.png`). What read at 8/8: a 0.46 m baguette held at its
  end, wrist turned so it stands upright-out (upperArmR [70,0,110], forearmR −40, handR [−70,0,−90]) + the body leaning
  away (spine/chest out +8) to lift the shoulder. Rule: cast chibi votes raise a PROP; tune it on 8-facing stills.
- (skeleton-chef, Faces) Face boxes (eye sockets) placed proud of an 8-sided lathe skull poked out of the silhouette
  edge at SE/SW/E (a dark notch on the outline). Turning each socket 20° outward (K.xf rot) and sinking it 0.012 m fixed
  it. A dark smile bar 1 texel under a nose hole reads as a MOUSTACHE at 1×; keep ≥ 2 texels of bone between them and
  let the jaw (back hinge, 26–30°) carry the mouth.
- (skeleton-chef, Secondary) A 1-link spring toque on the head re-aimed after every talk key (head pitch changed) and
  added off-key drawings (`clip-talk.png` first pack: f5/f7 x2/x3). Keyed toque instead (wobble ±9° per gait drawing,
  knocked back in the emote, tumbling in the die): talk holds then changed only for the speech-bubble FX.
- (skeleton-chef, Timing) **(recurring: frog, skeleton-chef)** The die `hurt` flash covered ≈ 8 grid frames: a 6- or
  8-frame flinch key was never seen (`clip-die.png`: f8 x8 white). Hold the flash key ≥ 10.
- (skeleton-chef, Palette) White signatures at golden: the lit toque #F4C381 (h34, L .73) vs golden grass #BEAE4F (h51,
  L .53) = dH 17° and +0.20 L only, yet `sig_ground.golden-sun` PASSed on a darker mean (#856B8D). Measure the LIT part
  yourself (dominant colours in the sun copy) before citing that row.
- (skeleton-chef, Tools) `char-stage frame=` on LOOP clips is offset from the clip frame: talk frame 0 showed `talk:6`,
  frame 18 → `talk:0`; idle frame 36 → `idle:38`, 28 → `idle:36`. One-shots (vote/die/offer) matched. Rule: read `p` in
  the shot log before trusting a grid still of a loop key. **(recurring)** zsh again: `for c in "talk 0" …; set -- $c`
  does not split — use a shell function with explicit calls.

### Module backlog additions (char-skeleton-chef)
| sev | owner | issue | evidence |
|---|---|---|---|
| high | motion | LegGait body drop crouches the whole leg for legs < ~0.45 m at 4 H/s (half-span ≥ leg) → chibis run seated; needs a cap (e.g. ≤ 0.1·leg) with the IK reach clamp taking the rest, or a smaller plant-ahead | shots/char-skeleton-chef/dir2/clip-walk.png vs gv2/clip-walk.png |
| medium | tools | char-stage `frame=` for loop clips does not map to the clip frame (talk +6, idle +2…+6) | shot logs `"p":["talk:6"]` for frame=0 |
| low | tools | sig_ground golden-sun row measures a mean that includes the shaded side (white parts pass with dH 17° lit) | shots/char-skeleton-chef/report.txt vs scene-golden-crop.png |

## Critic note (critic-fox, 2026-10-16) — Ginger, 15/24, not shipped (author self-score 17)
Evidence `shots/critic-fox/` (fresh `--preset cast --raw` pack on render-host RTX 4090: 60 pass / 25 warn / 1 fail), own renders in
`shots/critic-fox/mine/`: `keysA/B/C-x3.png` (idle, talk, vote, die, whisper keys at 8 facings), `face-S-SE-x6.png`,
`talk-d1-x8.png` (pack facing; shot log `p` confirms frame 0 = `talk:6`), `game1x-sheet-x4.png`, `meadow1x-sheet.png`, `sil-lineup.png`.
- (critic-fox, Expression) A downward talk nod on a chibi under the vh-10 camera hides the face: `talk:6`/`talk:18` (head +12,
  chest +4) show only the skull top + ear insides at dir 1 AND S (`talk-d1-x8.png` rows 2/4, `keysA-x3.png` talk-f0 S), so the
  half-lid keyed there is never seen. Rule: on a 2.2-head chibi, nod keys ≤ +4° total head world pitch; carry the beat with
  head roll/yaw toward the camera side, the jaw and the paw. Same for the emote: `whisper:26` (the wink, the punchline) turns
  and tilts the head away at dir 1 and the paw covers the muzzle — a wink must be authored ON the dir-1 / S 8-facing still.
- (critic-fox, Identity) The v1 fox tail is a large orange brush visible at S/SE/SW; the port's 0.46 m tail with a cream tip as
  wide as the orange part reads as a cotton/bunny puff at SE and is a lone cream dot at S (tailTip px 0 at SW). At 25 % the S
  thumbnail (two prongs on a blob, no tail) is the moth's. Rule: a tail that is half the identity must show orange at S.
- (critic-fox, Eyes) "2×2-texel eyes" render as 1-px dark dots at S (flagged by `turnaround-isolated.png`); the eye box must
  be ≥ 0.08 m and set forward on the lathe so 2×2 survives the 8-sided skull's foreshortening at S.
- (critic-fox, Gait) Boots-only under an A-line skirt at 4 H/s: 4/4 drawings + 3-texel bob, but contact is never shown
  (`game.foot_slide` n/a at dir 1 and 2), and the run (2·v) uses the same poses (in-hold slide 10.3) — at 1× both read as a
  bouncing glide. **(recurring: mushroom)** robed chibis need a visible foot flick ≥ 3×2 texels out of the hem on contact.

## Critic note (critic-goat, 2026-10-16) — Magistrate Billings, 15/24, not shipped (author self-score 14)
Evidence `shots/critic-goat/` (fresh `--preset cast --raw` pack on render-host RTX 4090: 63 pass / 22 warn / 0 fail), own renders:
`g8-{talk-f0(=talk:6),vote-f11(=vote:3),die-f68(=die:60),verdict-f8,-f16(=14, fx on),-f30(=28),-f52(=44)}-x3.png`,
`my-game1x-track-x3.png` (1× game GIF, figure-tracked), `my-clip-{talk,verdict,die}-1x-strip-x2.png`, `sil-lineup-25.png`, `sil-goat-keeper-50.png`.
- (critic-goat, Prop-as-story) The emote's story object (the evidence sheet) is in the brass slot — the same warm yellow as the
  horns, knob and robe trim — so at 1× it reads as a yellow flag at SE only and is invisible at N/NE/E/W (`g8-verdict-f8-x3.png`)
  and while being eaten (`g8-verdict-f30-x3.png`: no sheet visible at 7/8). Rule: a story prop gets its own value (off-white
  parchment + a red seal ≥ 2×2) and must read on the 8-facing still of every key it is in.
- (critic-goat, Gavel read) The SLAM key (staff plumb) has nearly the idle silhouette: hoist→slam is a 6-px vertical shift of a
  plumb staff, the dust carries the whole beat (`clip-verdict.png` f16→f22). A gavel needs a tilted wind-up (staff ≥ 35° off plumb).
- (critic-goat, Long prop vs procedural gait) Wrist-routed arm channel keeps the staff plumb at walk, but the run (arms 8, lean 12)
  and the standing-start lunge still tip it 25–30° (`clip-run.png` f3–f15 every cycle; `clip-game.png` f3–f13). Long props need
  a world-space plumb constraint (motion backlog), not amplitude tuning.
- (critic-goat, Robed gait) **(recurring: mushroom, fox)** 4/4 drawings, bob ≈ 2 texels, but contact is never shown and the rear
  boot flicks out BEHIND the hem as a dark-brown blob (`my-game1x-track-x3.png` cols 5–8, 12–14) — reads as a tail, not a foot.
- (critic-goat, Fallen robe) Rigid bell robe on die shows its hollow, dark hem opening at S and N (`g8-die-f68-x3.png` cells 1, 5):
  reads as a toppled bell/barrel. Cap the hem (sole disc in robe-sh) or key the hem toward the camera-far side.

## Critic note (critic-crow, 2026-10-16) — Mortimer, 15/24, not shipped (author self-score 15, gap 0)
Evidence `shots/critic-crow/` (fresh `--preset cast --raw` pack on render-host RTX 4090: 62 pass / 21 warn / 0 fail), own renders in
`shots/critic-crow/mine/`: `keysA/B/C-x3.png` (idle, talk, vote, die, dig keys at 8 facings; shot-log `p` confirms `frame=0` of
talk = `talk:5`, `frame=15` = `talk:0`), `face-idle-x6.png`, `face-talk0-x6.png`, `vote-E-NE-x6.png`, `die60-x4.png`,
`clipgame1x-sheet.png`, `talk1x-sheet.png`, `game-f3-f11.png`, `sil-lineup.png`.
- (critic-crow, Prop) A walking-stick prop that hugs the hem disappears: the shovel is fused with the coat in all 8 facings of
  `turnaround-silhouette.png` and hidden behind the body at N/NE/NW (`clip-turn.png` f22–f38); v1 shows the shaft as a separate
  vertical stick with a gap at every facing. With the beak also gone at N (sig.beak px 0/2/5 at N/NE/NW), the back views read
  as a generic hat-over-coat. Rule: a planted stick prop stands ≥ 3 texels clear of the silhouette at every facing.
- (critic-crow, Vote) A prop hoisted "blade-up over the hat" crosses the brim at dir 1 (`clip-vote.png` f12/f38: shaft diagonal
  across the hat) and sits entirely behind the brim at E (`vote-E-NE-x6.png`, blade 0 px clear). Raise props up-and-OUT on the
  carrying side, ≥ 6 px outside the hat box at all 8 facings.
- (critic-crow, Identity) Lifting dark identity colours to beat the night rule changed the character: v1 hat `#4E3528` +
  charcoal coat read as an undertaker; the port's tan `#B48456`-dominated hat (hi/mid 0.91–0.99) and pale mauve coat read as a
  cowboy/straw hat on a grey bell. Lift the shadow tone, not the lit tone.
- (critic-crow, Gait) **(recurring: mushroom, fox)** robed chibi + hidden talons at 4 H/s: 4/4 drawings, but foot_slide n/a,
  no contact drawing, and at 1× the only change is the shovel rock + grey tail wedges → reads "glide", not "scurry".
- (critic-crow, Die) A wide hat dominates every tipped pose at S: `die:14` at S is a hat disc over a box, and the edge-on brim
  in `die:60` at NE/N/NW renders as 1-px brown arcs that read as antennae (`die60-x4.png`).

## Critic note (critic-moth, 2026-10-16) — Lumen, 16/24, not shipped (author self-score 19, gap +3)
Evidence `shots/critic-moth/` (fresh `--preset cast --raw` pack on render-host RTX 4090: 63 pass / 20 warn / 0 fail; `dir2/` walk,
vote, lamp at dir 2), own renders: `g8-{vote-f20,talk-f0,talk-f5,die-f11,die-f60,lamp-f6,lamp-f12,walk-f3,walk-f5}.png` (+ `-x3`
stacks), `vote-f20-S-SE-x8.png`, `talk-f{0,5}-S-SE-SW-x6.png`, `idle-dir1-x8.png`, `vote-g37-g38-x8.png`, `game-1x-track-x3.png`,
`sil-lineup.png`, `night-nolight-vs-light-x4.png`.
- (critic-moth, Prop in the gait) **(recurring: crow, goat)** The identity prop vanishes in the procedural walk: lantern-glass px in
  the lower cell are 25–27 at S/SE standing (`g8-talk-f0`) but 1–3 at S, 2–5 at SE, 0–2 at E in walk drawings (`g8-walk-f3/f5`)
  and absent in `dir2/clip-game.png`. Routing the arm channel to the wings left the lantern arm unkeyed; author `clips.walk`
  keying the lantern arm forward-out (playbook "Held props in walk/run") and count glass px at 8 facings.
- (critic-moth, Vote) Wings spread HORIZONTALLY (`WINGS(16, 88)`) + lantern at shoulder height do not raise the silhouette:
  nothing passes the head top at any facing (`g8-vote-f20-x3.png`), at E the spread is edge-on and the pose is ≈ idle
  (`dir2/clip-vote.png`), and at SE the raised sleeve + lantern sit on the face (`vote-f20-S-SE-x8.png`). The code comment says
  "flung UP into a V behind the head" — the numbers don't. Sheet ≠ code.
- (critic-moth, Hold pops at clip end) The antennae re-snap 104 px at vote g38 = 27 frames into the final hold
  (`vote-g37-g38-x8.png`: left frond upright → horizontal); die pops 47 px at g68. `hold_redraws` 0 because the pop lands on the
  clip boundary — the check should cover final_hold too (tools); key the antennae at their settled direction (character).
- (critic-moth, Expression) **(recurring: fox)** The talk mouth-OPEN key pitches the head so the eyes are half-hidden and the
  mouth sits under the collar at S/SE (`talk-f0-S-SE-SW-x6.png`); the shut key shows the face best. The idle glance (g54–66)
  turns the only visible eye away at dir 1: a blank cream ball for 12 frames (`idle-dir1-x8.png` tile 3).
- (critic-moth, Gait) **(recurring: mushroom, fox, crow, goat)** Boots in the coat slot under a 16-texel coat + wing cape: contact
  never seen at dir 1 or 2; at 1× (`game-1x-track-x3.png`) the read is "a bobbing head with a cape tab" (glide), only the FAR wing
  flicks at dir 1, and a dark upper-arm stick pokes forward from the chest at dir 2 (`dir2/clip-game.png` f5–f13).
- (critic-moth, Signature shape) A feathery fan antenna built as a 0.04 m stalk + lobes renders as a 1-texel stair stick at dir 1
  and a "bow" blob on the far side; at E/W the single spike + ovoid matches owl's profile (`sil-lineup.png` col 3/7). The v1 fan
  is ≈ 5 px wide at 38 px: make the frond ≥ 3 texels wide in its own plane facing the camera at S/SE/SW.

## Critic note (critic-owl, 2026-10-16) — Archivist Hoot, 17/24, not shipped (author self-score 18)
Evidence `shots/critic-owl/` (fresh `--preset cast --raw` pack on render-host RTX 4090: 68 pass / 15 warn / 0 fail), own renders in
`shots/critic-owl/mine/`: `keysA-x3.png` (talk:0, talk:6, vote:3, die:12, die:60 at 8 facings), `keysB-x3.png` (idle:38, remember
6/18/28/34/42 fx on), `game-4draw-x8.png` + `game-track-x4.png` (figure-tracked 30 Hz game walk, dir 1), `talk-SE-S-x6.png`,
`skull-ticks-E-NE-NW-x3.png`, `sil-lineup-25-x3.png`, 1x-GIF sheets `*1x-sheet-x*.png`.
- (critic-owl, Eyelids) A proud 8-gon feather lid slid over a cut-out iris draws its own inner-line ring: blink / slow blink / squint
  read as brown GOGGLE / monocle rings at S/SE/SW (`clip-turn.png` f62, `keysB-x3.png` rows 4-5), never as closed eyes. Rule: a
  closed eye at 45-60 px is a 1-texel dark arc or a flattened lid band; squash the eye (`eye*.s` y) or swap the iris cut-out to a
  feather/dark slot per key instead of covering it with a proud part.
- (critic-owl, Accessory at the side facings) **(recurring: moth)** Ear tufts as thin paddles leaning out in the FRONTAL plane become
  one 1-2-texel vertical spike at E/W (and lean only ≈ 15-20° at dir 1): the E/W 25 % thumbnail is the moth's antenna-on-a-bell
  (`sil-lineup-25-x3.png`). v1 tufts are broad cat-ear triangles continuing the skull. Give the tuft depth (≥ 0.1 m along z) and
  lean it back as well as out so the side facing shows a triangle. The tuft root crossing the skull also drew a mauve inverted-V
  inner line on the back of the head at E/NE/NW (`skull-ticks-E-NE-NW-x3.png`).
- (critic-owl, Vote) **(recurring: skeleton-chef, chibis)** The chibi wing reaches only head height; at dir 1 the vote is a
  horizontal wing pointing screen-left at mouth level (`clip-vote-60hz.png` 22-56), hidden at E. Raise the PROP (the ledger) above
  the tufts in the free wing.
- (critic-owl, Robed gait) **(recurring: mushroom, fox, goat)** 4/4 drawings + robe roll read as a rocking "waddle", but no talon is
  ever drawn in the game walk or run at dir 1 (`game-4draw-x8.png`): contact is never shown, the run hop floats. Talons must flick
  ≥ 3×2 texels out of the hem on each contact drawing.
- (critic-owl, What worked) The keyed 75° head swivel (idle:38) turns the face TO the camera at dir 1 — the best character tell in
  the cast so far; keyed (not sprung) tufts fixed the loop-clip settle redraws (talk/idle hold_redraws 0).

## Additions (char-frog r3, Sir Croaksworth, 2026-10-16)
- (frog, Silhouette) **A wide flat head needs a HULL, not a lathe, and cheeks wider than the eye span.** A lathe skull
  (sx/sz on one profile) cannot recede at the crown while jutting at the snout; a `K.hull` of 5 octagon rings whose centres
  move back as they rise (y 0.10 → 0.275, cz +0.08 → −0.03) gives a sloped frog snout at E/W. Eye domes at the skull's
  outer corners read as **mouse ears** in the 25 % silhouette even when flat; moving them in (|x| 0.25 → 0.215) and widening
  the cheeks (rx 0.37 → 0.39) turned the S silhouette into a trapezoid with two domes (`shots/char-frog/self/r3-turnaround-x2.png`).
  At the 30° camera a dome only breaks the top outline if it rises ≥ 0.12 m above the skull BEHIND it (screen-y ≈
  y·cos30 − z·sin30): lower the crown, don't just raise the dome.
- (frog, Faces) A mouth line built from straight bars pokes out of a chamfered (octagon) skull's corners as brown sticks
  and dotted specks; a convex hull of the skull's front-half ring vertices (+0.025 m, 0.035 tall) follows the outline and
  reads as the v1 frog smile at S. A full-width cream jaw reads as a collar: make the jaw the SKIN slot and put the cream
  on a chin patch inside the jaw's flat front face (chamferBox flat face = ±(w/2 − min(w,d)·c/2)).
- (frog, Locomotion) Hop flight drawings are sampled at u = 1/6, 1/2, 5/6 of the arc (n 4, β 0.25: rise/fall show only
  sin = 0.5 of the arc). For a readable leap at 1x the arc must be ≈ 0.38 H (apex 16 texels, rise/fall 8); `lift > 0`
  tucks the boots (feet arc = (lift + hop)·sin), `lift < 0` hangs them below and the flight reads as standing.
- (frog, Props) Changing a carried weapon's socket rot re-aims EVERY action key that wields it. On a hanging arm the
  hand's `out` channel rotates the blade in the frontal plane; with a raised arm (upperArmR out 110–125°) `handR out −72`
  + `fwd 25` puts the blade upright BESIDE a 0.78 m head (clear at 7/8 facings); the old up-forward raise hid it behind the
  head at S. Use a pose-override variant (`shots/char-frog/wv.js?pv=<json>`) to try 2 values per render.
- (frog, Die) Lying on the back, an open jaw shows the mouth floor as a dark checker strip (die.key_speckle +66 → +17 with
  the jaw closed 0–10° from the topple on). Folded, splayed legs (thigh 40 / out 38, shin −112) end the "horns" read.
- (frog, FX) `spec.fx.flash: ['#F4EEE2']` (one tone) = a 2-frame hit flash instead of the default 4.

### Module backlog additions (char-frog r3)
| sev | owner | issue | evidence |
|---|---|---|---|
| medium | motion | (recurring) LegGait ignores authored walk/run clips: arms + sword rigid in the hop; 2v hop run still FAILs off_grid 40 / flicker 21754 | shots/char-frog/report.txt run rows |
| low | tools | grid stills: `frame=` of LOOP clips is offset by at = 0.25 s (+8 frames; talk key f0 = frame 16); die-hold grid shows no cape (chains not settled) | shots/char-frog/w3/r3-talk-f0.png |
| low | tools | bake auto-cell: oath/talk at N/NE/NW still touch the border at 122 px, final trimmed cell is fine but costs 4 re-bakes | out/sprites/frog.json |

## Critic note (critic-skeleton-chef, 2026-10-16) — Bones, 16/24, not shipped (author self-score 17, gap +1 on #9)
Evidence `shots/critic-skeleton-chef/` (fresh `--preset cast --raw` pack on render-host RTX 4090: 61 pass / 23 warn / 0 fail), own
renders in `shots/critic-skeleton-chef/mine/`: `keysA/B/C-x3.png` (idle, talk 0/6/12/18, vote 0/4, die 0/10/14/18, offer 6/20/26 at
8 facings; shot-log `p` confirms `talk frame=18` = `talk:0`, `frame=6` = `talk:12`), `face-a/b-x8.png` (S + SE), `back-N-NW-W-x8.png`,
`game1x-sheet-x4.png`, `meadow1x-track-x4.png` (figure-tracked 1× meadow GIF), `{die,offer,talk,vote}-1x-sheet-x3.png`, `sil-lineup.png`.
- (critic-skeleton-chef, Face) A dark "smile line" bar directly under the nose on a round skull reads as a MOUSTACHE at S/SE at 1×
  (`face-a-x8.png` idle S: sockets → nose → 0.22 m dark bar = a moustached face). v1 draws a LIGHT tooth row with grey gaps. Rule: a
  skull's mouth is a light tooth band ≥ 2 texels tall with 1-px dark gaps, never a dark bar under the nose; at SE (dir 1) keep both
  sockets on the face (the far socket is a 1-px sliver at the skull edge in `game1x-sheet-x4.png`).
- (critic-skeleton-chef, Golden white) **(recurring: charcheck golden row)** White/cream signatures collapse under golden sun:
  toque #F4C381 vs skull #EFBA6E (dL 0.05, dH 1 → the two signature halves merge into one peach blob) and vs golden grass #B6AB4C dH 20°,
  dL +0.22 (both under threshold) — while `sig_ground…golden-sun` PASSes on #856B8D, a shade-copy colour. Measure the sun copy yourself.
  A two-part white-on-cream signature needs a value step between the halves that survives the golden multiply (darker toque band, or
  a cooler/greyer skull mid).
- (critic-skeleton-chef, Raised prop at dir 1) The vote baguette is raised beside the skull, not above the toque: at dir 1 it overlaps
  the skull's far edge and the vote sparkles land on the face (`vote-1x-sheet-x3.png` f4–f11; pose_read 23 %). Same for talk:0 (the
  baguette is hidden behind the body at SE). A chibi arm cannot reach above a 0.4 m toque — raise the prop on the NEAR side and let the
  prop (not the hand) clear the toque top by ≥ 4 texels.
- (critic-skeleton-chef, Gag at 1×) The emote's punchline (skull pop, `head.p` +0.15 m ≈ 4–5 texels) is masked by its own poof dust
  and the heart at dir 1 and reads as a gasp, and the basket "offer" thrust is invisible at dir 1 (`offer-1x-sheet-x3.png` f2–f9). The
  gag object must move ≥ 8 texels with a visible gap (the neck stalk) and the FX must start after the pop, not on it.
- (critic-skeleton-chef, Gait) legIK 'pose' + legacy Gait at 4 H/s: 4/4 drawings, bob 1.4 texels, but contact never shown, planted
  feet glide 7.0 texels in-hold at game speed, 12.0 at the walk clip and 30.7 at run, and the run (2·v) sinks the whole figure ≈ 7
  texels so the legs vanish behind the basket (`clip-run.png` f6/f12/f32/f48) — the same "runs seated" failure the author left LegGait
  to avoid. The motion backlog item (LegGait body drop for legs < 0.45 m) is the real fix.

## Additions (char-mushroom r3, Brother Morel, 2026-10-16)
- (mushroom, Locomotion) **LegGait sinks short-legged chibis into the ground at game speed.** `LegGait.drop()` lowers
  the body until a planted foot is reachable over the longest held drawing: half-span = max(C/2n + v/60, v·hMax − C/2n)
  ≈ 0.36 m at 4 H/s (hMax is always 3 grid frames: `Cmin` adds 1e-4, so 30·hNom is never exactly 2). With 0.32 m
  straight chibi legs (0.95·L < hip height) drop = the whole hip height: Morel's robe hem walked 0.3 m UNDER the ground
  in every walk drawing (dir 2, bg=plain; a key-bg strip hides it). Check any robed/short-legged cast member on
  `bg=plain` at dir 2. Workaround that worked: re-author the leg bones LONG and BENT inside the robe (thigh = shin =
  0.27 m, knee forward, hip and ankle unchanged) → 2·0.95·L covers the half-span → drop 0. Calibrate FK knee keys with
  2·L·cos(φ0 + a) = hip−ankle − d (KNEES_D in characters/mushroom.js).
- (mushroom, Locomotion) **A hop fixes "floating boots" at game speed**: the biped skip at 4 H/s showed the swing
  boots as detached squares 2-5 texels outside the robe at both dirs. `plan: 'hop'` with `legs: {HL, HR}` only (else the
  arms become front legs), `lift: [0, 0]` (feet ride the hop arc), `surge: false` (upper flicker 6721 px → 0),
  `bones: { hips: <part-less bone> }` (the hop's hip pitch tipped a wide cap over the face on the landing drawing),
  `height: 0.5` (crouch 0.03 m so the landed boots still show under the hem), `squash: { bones: ['cap0'], amount 0.08 }`
  (16 % widened the brim over the eyes) → one contact drawing per cycle, the cast shadow separates at the apex, in-hold
  foot ride 3.23 → 0.04 texels. A dark shin part (lower 60 % of the shin) keeps every kicked-out boot connected to the hem.
- (mushroom, Props) **A hand-held plumb prop on a bent arm**: the staff is authored plumb in character axes through the
  rest grip, but raising `ARM.fore` fwd above ~40° visibly tipped it (8-facing still); keep fore fwd ≤ 40 and re-check S.
  A far-side fist hides under the brim at SE only if x + z of the hand is small; to put it BELOW the chin at SE move the
  hand FORWARD-out (depth shrinks, so it projects lower) and shade the far sleeve as midline (`material.sides`), which
  turns the lavender squiggle into a readable ivory sleeve.
- (mushroom, Silhouette) A near-side prop projects LOWER on screen by depth·sin(30°): the staff that cleared the cap
  by 7 texels at S stayed below the cap top at NW/SW, and its 8° out-lean tipped toward the camera there (lower again).
  What got the star over the cap at 7/8: staff +0.32 m and out-lean 8° → 2°. Cost: `height_px` max 63, `head_frac` WARN.
- (mushroom, Poses) Raising a staff SIDEWAYS (`upperArmL [0, 0, 85]`, `handL [0, 0, −95]`; −85 left a 6° lean = a
  stair-step staff and +9 key speckle) keeps it plumb and the star over the cap at 8/8; the r2 forward raise (fwd 155)
  swung the fist behind the face once the carry arm moved forward. A dead character still holding a long staff: roll
  the wrist (`handL [0, 0, −80]`) so it lies flat beside him; plumb in the hand it pointed at the camera like a stem.
- (mushroom, Palette) Shade-copy separation can be kept by darkness AND saturation: cap sh `#7A2638` (purple maroon,
  −25 % WARN, read near-black) → `#8A2232` (−18 % WARN) → `#741C2E` (saturated wine, −29/−32 % PASS, reads red).
- (mushroom, Process) The session scratchpad root is SHARED by the parallel character agents: generic names (zoom.py,
  z.sh, se.sh, keys.sh) were overwritten under me mid-run (and I may have overwritten someone's). Keep helpers in a
  per-character subfolder (`scratchpad/<name>-rN/`).

### Module backlog additions (char-mushroom r3)
| sev | owner | issue | evidence |
|---|---|---|---|
| high | motion | `LegGait.drop()` sinks short-legged chibis up to their whole hip height at 4 H/s (robe hems under the ground); hMax is always 3 frames because `Cmin` adds 1e-4 | characters/mushroom.js skeleton() comment; dir 2 bg=plain walk |
| medium | motion | (recurring) LegGait ignores authored walk/run clips: the staff cannot plant on the landing drawing | characters/mushroom.js locomotion |
| medium | tools | `--bake`: the automatic re-bake only grows the cell HEIGHT (128 × 100 → 136 → 184; `--cell 200` → 128 × 200): wide emotes (bless staff sweep) still touch the border at W/SW | out/sprites/mushroom.json bake log |
| low | tools | charcheck has no "detached part" check (connected components of the figure mask per frame): r2's floating boots passed as foot_slide n/a | shots/critic-mushroom/game-dir2-30hz-x4.png |

## Additions (char-fox r2, 2026-10-16) — Ginger after critic-fox (15/24): pack 60/25/1 → 62/24/0
- (fox r2, Process) **char-stage `frame=` on a LOOP clip is offset by `at` (default 0.25 s → +8 grid frames)**: `frame=0`
  of talk showed the talk:6 key. Add `&at=0` to every 8-facing key still of a loop clip (actions are unaffected). My r1
  "talk f14" evidence was a different key; author/verify loops with `at=0` (`shots/char-fox/g8.sh.js`).
- (fox r2, Faces) **(recurring: fox, frog, owl)** A talk "nod" of head +12 / chest +4 pitched a chibi's face out of view at
  dir 1 and S (only skull + ear insides). Rule: world pitch of chest+head ≤ +4° on beat keys; carry the beat with a pos.y
  bob (−0.045), a head ROLL and yaw toward the camera side, an ear flick (`shots/char-fox/r2/finA-p1.png`).
- (fox r2, Faces) At dir 1 a head roll of −14 combined with yaw −14 turned the face AWAY (wink unreadable); roll +18 with
  the same yaw −14 faces the camera (`r2/face-SE-x6.png`). Yaw sign alone is not enough: check roll on the dir-1 still.
  A wink lid of −0.85 scale is sub-texel (vanishes); −0.7 gives a 1-texel lid next to the open 2×2 eye.
- (fox r2, Faces) 2×2 eyes rendered as 1-px dots on an 8-sided lathe skull: a 0.088 m box turned out 15° and set 0.012 m
  proud of the surface keeps 2×2 + glint at S/SE/SW (`r2/face-S-x6.png`).
- (fox r2, Silhouette) **Tail visibility vs facing**: a tail aimed back-right is hidden behind the body at SW
  (screen x ≈ 0.71·(x − z) = 0 for x = z); aimed purely right it hides at W. What gave tailTip px > 0 at 8/8: a 0.70 m
  brush swept out to the side near the root, then curling BACK and UP at the tip (`TAIL` in fox.js), cream only on the last
  ≈ 17 % tapering to a point (a cream tip as wide as the brush read as a bunny puff). Test sign/direction with a variant
  spec (`char=../shots/char-<name>/v.js`; make sure your helper does not also pass `char=<name>` first — the first wins).
- (fox r2, Locomotion) Dark boots under a dark-red hem are invisible at 1× whatever the lift; the same boots in a mid
  leather brown (wood slot) + lift 0.08 + toe 0.06 m forward read as feet kicking out under the hem
  (`r2/game1x-sheet-x4.png`). LegGait's biped run differs from the walk only by parameters: `bob [0.05, 0.11]`, lean 14,
  arms 60 gave the run its own high flight drawing (tail swung forward) vs low lean drawing (tail streaming back).
- (fox r2, Die) FK die foot slide on a roll: keep the f6 buckle's legs + hips on the next key and carry the topple in
  spine/chest roll; in the final pose no boot touches the ground (stance by height) → die.foot_slide 3.44 → 0.89. A cream
  `hemSole` (petticoat) replaces the dark maroon skirt interior in the held pose.
- (fox r2, Props) Vote by raising the MUG (prop arm `[40, 0, 125]`, hand roll −100) clears a 2.2-head chibi's head at 8/8
  (the paw managed 5/8) — confirms the skeleton-chef rule "cast chibi votes raise a PROP".
- (fox r2, Process) The session scratchpad is SHARED between parallel character agents: another agent overwrote my
  `scratchpad/g8.sh` mid-run and my next call rendered crow stills into `shots/char-crow/`. Keep helpers inside your own
  `shots/char-<name>/` (as `*.js` so remote.sh syncs them) with a unique name.

### Module backlog additions (char-fox r2)
| sev | owner | issue | evidence |
|---|---|---|---|
| medium | tools | `--bake` logs "figure touches the cell border … re-baking at 134" and then writes a 62×72 cell (the re-bake size is not kept) | bake log 2026-10-16, out/sprites/fox.json |
| low | tools | char-stage `frame=` on loop clips is offset by `at` (frame 0 = key 8 by default); document it or make `frame` ignore `at` for loops | shots/char-fox/r2/finA-x3.png vs r1 g8-talk-f14 |
| low | rig | ear-base / inner-ear panel junction still leaves 5–8 isolated fur px at S/E/W after sinking/widening the ear; a same-slot merge for parent/child parts would remove it | shots/char-fox/turnaround-isolated.png |

## Additions (char-goat r2, Magistrate Billings, 2026-10-16) — fixes after critic-goat 15/24
- (goat, Locomotion) **Route LegGait body channels to part-less sinks to keep a long prop plumb.** `locomotion.bones`
  accepts any bone name: `hips: 'gHips', neck: 'gNeck', head: 'gHead'` (part-less children) + `lean: [0, 0]` removed
  every gait lean, hip yaw and the Character's acceleration lean from the figure; the staff that tipped 25–30° every
  run cycle and ~30° on the standing start is plumb in `clip-game.png`, `clip-run.png`, `game-onion.png` (r1 vs r2).
  Cost: no body lean / no head lag (fine for a stiff formal character); `game.readable` unchanged (0.278 s, 1.11 H).
  The hips sink also disables the dip safety net in `_solveLegs`; no foot_slide change was measured on this skip gait.
- (goat, Secondary) **Gait-driven ear flop without keyed walk clips:** map `spine`/`chest` to the ear bones. The
  biped body curve puts `±twist·0.6/0.9·sL` on their yaw, which `_rot` lands on a SIDEWAYS bone's `out` (= up/down):
  twist 22 → ears flop ±13°/±20° once per stride (`shots/char-goat/r2/ws-row.png`). Personality chest lag and idle
  lean also land on the ears (small, quantised).
- (goat, Props) **A story prop must be checked on every key's 8-facing still and needs its own value.** A flat card
  in the accent slot was invisible at 5–7/8 facings. What worked: a V-folded document (two leaves opened 100° about a
  vertical spine, 0.17 × 0.34 m each), a COOL off-white slot (#F2F6EE / #CCD6CC / slate #7C8AA0, distinct from the warm
  wool, horn and brass), ink lines + a red seal, held OUTSIDE the head silhouette (READ: upperArm [150,0,55], forearm 60,
  sheet [60,40,0]; BITE beside the mouth: upperArm [120,0,30], forearm 70, sheet [90,70,0]) → 8/8 in read/hoist/bite.
  Iterate prop poses with a variant spec that replaces a clip's keys from a URL JSON pose
  (`shots/char-goat/vk.js`) — one render per candidate at 8 facings, no source edits.
- (goat, Poses) A gavel beat needs a different silhouette before the hit: a plumb staff raised 6 px read as idle; a
  wind-up tipped 40–60° out over the shoulder with the body leaning back (upperArmR [100,0,30], handR [-60,0,-30],
  spine −10) changes the silhouette at all 8 facings; `verdict.pose_read` 40 % → 56 %.
- (goat, Robes) **Warp the hem instead of fighting the gait:** a skirt hem raised 0.03 m at the front and dropped
  0.10 m at the back (vertex warp on the subdivided skirt/band/sole, fading to the waist) hid the trailing boot that
  read as a tail in the walk; longer hooves (0.17 m) + a short boot cuff make the forward boot flick 3–5 × 2 texels
  out of the hem on contact. At run speed (2× stride) the trailing boot still shows at the back-right.
- (goat, Poses) Die on a rigid bell robe: roll 30° (`hips [-80, 0, -30]`), head pitched to the chest (face up to the
  camera), and hide the boots with `'shinL.s': [-1,-1,-1]` (0.1 scale left 1-px specks) so the closed robe sole shows
  instead of dark boots in an opening.
- (goat, Silhouette) Horn tube: 6 → 4 segments dropped isolated horn px max 16 → 7 with the same loop read (A/B
  `shots/char-goat/r2/ab-h*`); a wider y–z loop (z from +0.06 to −0.245) makes the curl read at E/W.
- (process) **The session scratchpad is shared by parallel character agents**: a generic `scratchpad/g8.sh` was
  overwritten by another agent mid-run (it rendered the crow). Keep helper scripts in a per-character subfolder.

### Module backlog additions (char-goat r2)
| sev | owner | issue | evidence |
|---|---|---|---|
| medium | motion | (recurring) no per-bone lean cap / world-plumb constraint for held long props; workaround = sink hips/neck/head channels, which also kills head lag and the hips dip net | characters/goat.js locomotion comment |
| low | motion | post-turn tail on robed chibis is idle recovery steps of the hidden legs (≤ 43 px changes at the hooves, 60 Hz f84–f124 of the turn clip); stepTol / stepYaw / stepTime / personality had no effect | shots/char-goat/r2/ab-* turn reports |
| low | tools | turn.foot_slide is 3.4–4.3 on every pack (root travel ~4 px in the stage's turn drive), so it does not separate characters | lead-r6 + char-* report.txt |
| low | tools | `charpack --clips game` without `--preset cast` drives no travel (game.readable 0 H/s); and it overwrites the main pack dir's raw | shots/char-goat/r2/pk-d2 |
| low | tools | the `frame=` offset for clips is still undocumented in the 8-facing recipe (verdict frame 16 renders key 14) | critic-goat process gap |

## Additions (char-moth r3, Lumen, 2026-10-16)
- (moth, Gait) **(recurring: skeleton-chef, moth)** The r2 "lantern vanishes in the walk" was NOT the arm: LegGait 'biped'
  sat the 0.29 m-legged chibi down at 4 H/s (hips −0.2 m: coat on the grass, the lantern sunk below the hem, the 1× read a
  "gliding head"; `shots/char-moth/r3a/g8-walk-f3-x3.png` vs the legacy recipe `g8-walkL-f3-x3.png`). Every 8-facing walk
  still must be compared with the idle HEIGHT first. The legacy Gait chibi recipe (CAST_PORTING §8) kept full height,
  game flicker 295/389 → 0, 4/4 drawings, and plays authored `clips.walk/run` (length 4, one key per drawing; the clip's
  `pos` replaces the bob). Cost: 60 Hz in-hold glide 7.0 texels (legIK 'pose').
- (moth, Props) A carried prop that must show in a gait that cannot be keyed: make the arm's REST the carry pose
  (skeleton `ARM.L` up [out 15, fwd 45], fore [5, 85]) and drop the gait's elbow channel (`locomotion.bones.armL:
  ['wingL']`). Glass px at noon (hi only) 17/12/21/0/0/12/19/9 S..SW (NE/N hidden behind the body, as in v1).
- (moth, Stability) Spring chains on a head/hand (antennae, lantern) cause every hold pop the critic found (vote 104 px,
  die 47 px, talk 39-100 px) and loop clips ignore `dynamics`. Keyed bones instead: hold_redraws 0, raw holds show only FX.
- (moth, Raised prop) A chibi paw tops out at chin height (shoulder 0.54 m + 0.27 m arm < head top 1.12 m), so "lamp above
  the head" is impossible by reach. Two tricks that read at 8/8: (a) a moth's VOTE = wings flung up in a V with the folded
  flap UNFOLDED on its own hinge bone (twist 60°: otherwise the forward wrap curls over the face when the wing is raised)
  and unfurled with `wingL.s` y +0.8; (b) the emote TOSSES the prop: `lantern0.p` offsets are in the parent (forearm)
  frame — after a 80° fwd arm key local +z points UP, so solve the offset in that frame (r3a toss tries 1-3 went forward /
  down before it went up).
- (moth, Antennae) A flat fan frond: build the width axis HORIZONTAL (out-and-back, `[cos a, 0, −sin a]`), not
  `cross(normal, stalk)` (that tilts the width along the stalk and reads as a stick); lean the stalk back (z −0.42) so the
  profile is a hook, not owl's vertical spike; slab 0.075 m so the edge-on (far) frond at dir 1 is still 2-3 texels.
  sig.antenna iso 7 → 3.
- (moth, Faces) A 2-texel glint centred in a 4×5 eye pad reads as a cream bar = a closed/sleepy eye; put it in the
  upper-inner corner at 1.5 texels.

### Module backlog additions (char-moth r3)
| sev | owner | issue | evidence |
|---|---|---|---|
| high | motion | (recurring: skeleton-chef, moth) LegGait 'biped' body drop seats chibis (leg < 0.4 m) at game speed (moth hips −0.2 m) | shots/char-moth/r3a/g8-walk-f3-x3.png |
| medium | motion | (recurring) LegGait ignores authored clips.walk/run poses — forced the legacy Gait (7.0 texels in-hold glide) | characters/moth.js locomotion comment |
| low | look | no spec.lights: the lantern's warm pool only exists in the scene copy (shots/char-moth/night.js) | critic-moth night-nolight-vs-light-x4.png |
| low | tools | hold audit: the raw clip windows end ≈ g38 (vote) / g38 (die), so final-hold pops after that (g68) are only seen in clip strips | shots/char-moth/raw/clip-die.json |
| low | tools | grid=turnaround walk stills ignore `frame=` (walk f2 and f3 renders identical) | shots/char-moth/self/r3/g8-walk-{2,3}.png |

## Additions (char-owl r2, Archivist Hoot, 2026-10-16)
- (owl, Eyes) **Close an eye by SCALE + a recessed closed-eye patch, never a proud lid.** Keep the iris/pupil/glint as
  triangles cut from the head surface (coincident, no ring) but put them on `eyeL/R`; behind the hole add a copy of the
  hole region 25 % wider, pushed 0.009 m inward (x,z × 0.97 on a centred lathe), coloured cream with a 1-texel dark ∪ arc
  (`|e − (eC − 0.06 + 0.1u²)| < 0.06`). `eye*.s` −0.97 collapses the iris → the arc shows: reads as a closed eye at
  S/SE/SW/E at 1× (`shots/char-owl/r2/g8-idle-f56-x3.png`); y −0.55 = an amber squint slit. The patch never shows when open.
- (owl, Accessory depth) Cat-ear tufts that read at E/W: a hull whose OUTER edge starts on the skull side where the skull
  outline already leans ≈ 30° (y 0.40 on a 0.535 head) and whose tip sits 0.11 m back. Base points that hover > ~0.05 m
  above the skull (outline depth threshold ≈ 0.02 + 1 texel) draw a mauve tick on the skull at E/NE/NW: pulling the back
  base points in cut them to 2–3 px; pulling the back RIDGE in (z −0.11 → −0.07) turned the E/W tuft back into a 1-px
  spike — keep the ridge back, accept the tick, or move the tuft to the head bone (same part id → no line, but no keys).
  `look=parts` tells which part draws a line (here the NEAR tuft seen on the side of the head, not the skull).
- (owl, Secondary in the gait) **Keyed tufts that flick per walk drawing despite LegGait ignoring clips.walk:** parent
  both tufts to a part-less crown bone and route `locomotion.bones.neck` to it. In the bird waddle the neck channel gets
  ±headBob pitch + ∓0.5·roll per drawing → the tufts flick against the head. Cost: the real neck is no longer driven, so
  the head rocks ±0.8·headBob (still face-visible at dir 1 with headBob 10). The run (hop branch) never uses the neck.
- (owl, Vote) A chibi wing tops out at eye level (shoulder 0.51 + 0.43 arm < crown 1.1). What cleared the tuft tips at 8/8:
  wing up [15,0,160] / forearm −90 / hand +30 (the primaries point UP — forearm fwd −90 straightens the hugging rest
  bend; out alone only swings it sideways), body tilted away 26°, and the LEDGER teleported on the f3 step key with
  `book.p` (chest-local [−0.6, 0.8, −0.15]) onto the fan tip. Sweep arm variants with a `wv.js` pose override (`vp=`):
  6 renders found it; reasoning about the rig axes did not.
- (owl, Robed contact) Long tan talons (0.27 m chamfer box, toes 2 texels out of the hem at rest) show on every LegGait
  touchdown drawing at dir 1 (the plant sits C/2n ≈ 0.17 m ahead of the hip) with no locomotion change.
- (owl, Mouth) A burgundy mouth block on the HEAD under the upper beak, hidden behind the closed mandible, plus a jaw
  drop (`jaw.p` −0.06 + 30°) gives ≈ 2 texels of red at S/SE; a tongue on the jaw itself moves with the jaw and never shows.
  Check the CLOSED key too: the first block (y 0.155–0.225) showed as a red chin patch below the mandible.

### Module backlog additions (char-owl r2)
| sev | owner | issue | evidence |
|---|---|---|---|
| medium | motion | (recurring) LegGait ignores authored clips.walk/run; owl worked around via `bones.neck → tuftRoot` (walk only; the bird hop branch drives no free channel, so run tufts are rigid) | characters/owl.js locomotion.bones; shots/char-owl/clip-run.png |
| low | tools | bake: `--cell 132/150` still warns "remember/N touches the cell border"; only the automatic cell (130 → 176) clears it — the explicit cell seems to bound height, not width | out/sprites/owl.json |
| low | tools | char-stage `frame=` on loop clips is offset (idle frame 56 → idle:62, 58 → idle:66; talk 18 → talk:0) — read `p` in the shot log | shots/char-owl/r2 shot logs |

## Additions (char-crow r2, Mortimer, 2026-10-16) — fixes after critic-crow 15/24
- (crow r2, Gait) **Swap LegGait's arm/elbow channels to decouple a prop arm from secondary flaps.** `locomotion.bones.armL:
  ['flapL', 'upperArmL']` puts the coat tail on the full ±A arm-swing channel (A 30: each tail trails back 30° on its step
  and tucks behind the skirt on the other) and the arm on the elbow channel (el + A/2 on ONE drawing per cycle): a held
  shovel then hitches forward on one drawing and stands planted-back on three — a walking-stick hitch, not a pendulum.
- (crow r2, Contact under a robe) Long toes are the cheap contact read: LegGait shows the planted foot C/2n ahead of the
  hip (0.18 m at 4 H/s, C 1.41 m), so 0.24 m talons poke 3–5 texels out of a 0.27 m hem. Beware the perspective: at dir 2
  the ground line sits at mid-coat height on screen (the near half of the hem projects 5 texels BELOW the root), so ground
  talons look like a mid-height stub — check with `mark=talon` before "fixing" them (`shots/char-crow/r2/mk-sheet.png`).
- (crow r2, Vote) For a 0.82 m brim on a chibi, the reachable raised-prop poses trade facings: sideways-out hides at E,
  forward-out points at the camera at SE, up-back hides behind the crown at E. Near-vertical at the T grip + the body
  leaning INTO the carrying side (spine/chest out 12) put the blade above the hat outline at 8/8. Found with a node FK probe
  that projects blade/shaft/hat to the 30° camera per facing (`shots/char-crow/fkvote2.js`); box-only metrics miss
  foreshortening (a shovel pointing at the camera at E "clears" an edge-on brim while sitting on the face).
- (crow r2, Die) A wide hat in the death hold: knock it OFF — `hat.p` (head-frame offset) + a counter-rotation lay it flat
  on the ground beside the head (`shots/char-crow/fkhat.js` solves the head frame); a level brim disc reads at every
  facing, the edge-on brim arcs ("antennae") vanish, and die:14 tipping it back shows the beak at S.
- (crow r2, Identity) A dark hat-band quill as a back cue made the S thumbnail a witch-hat spike (+7 px height): removed.
  Lift shadow tones only — hat mid `#86603E` → `#64462F` brought back the undertaker read at golden.
- (crow r2, Process) **The session scratchpad is SHARED between parallel character agents**: another agent's `g8.sh`
  overwrote mine mid-run (renders silently went to `shots/char-owl/`). Keep helpers in a per-character subfolder.
  `tools/remote.sh` syncs only `shots/*/*.js`, so author .py helpers must be passed inline (`python3 -c "$(cat f)"`).

### Module backlog additions (char-crow r2)
| sev | owner | issue | evidence |
|---|---|---|---|
| medium | motion | (recurring) LegGait has no multi-drawing plant at 4 H/s on 0.21 H legs: contact can only be faked by long toes; run in-hold 12.09 | shots/char-crow/report.txt game/run.foot_slide |
| low | fx | dig/land dust motes are a regular grid of '+' crosses lingering ≈ 12 frames; speech bubble alternates dot/full bubble per talk beat | shots/char-crow/clip-dig.png f24/f42, clip-talk.png |
| low | tools | remote.sh has no pull step and syncs only shots/*/*.js (author helper scripts and composites need manual rsync) | — |
| low | tools | charcheck has no "prop clear of the silhouette" row; turnaround-silhouette.png must be judged by eye | shots/char-crow/turnaround-silhouette.png |

## Additions (char-skeleton-chef v3, Bones, 2026-10-16) — fixes after critic-skeleton-chef 16/24
- (skeleton-chef v3, Face) **A dark bar right under a nose reads as a MOUSTACHE at 1x.** Draw a skull's mouth as a LIGHT
  tooth band (a lighter slot than the bone, ≥ 2 texels tall) with 1-px dark gaps. Hide the jaw's dark mouth floor UNDER
  the cranium: a floor at the jaw top shows from the 30° camera as a dark line over the teeth. Keep ≥ 1 cream texel
  between nose and teeth (`shots/char-skeleton-chef/v3/face-back.png`).
- (skeleton-chef v3, Face at SE) Sockets turned OUTWARD on a round head make the far one a 1-px sliver at the game
  facing. Turning them 12° INWARD (x 0.088, z 0.222 on a 0.26 m skull) shows both at SE with no S cost.
- (skeleton-chef v3, Golden) **The golden grade caps near-white at about #F8C987 (L .75) on grass at L .53**, so a
  white mass can never pass the 25 % sun-copy bar by value. Getting the two signature halves apart needs the bone
  palette DROPPED: cream #F6EAC8 → grey-cream #D8CCB2 took toque/skull from dL .05 to .15 in golden sun (measure the sun
  copy yourself, charcheck's row samples the shade side).
- (skeleton-chef v3, Vote on a chibi) When the arm cannot lift the prop above the hat, **telescope it**: `forearmR.p` /
  `handR.p` = rest bone direction × 0.2–0.26 m slides the bones out of their joints (in the parent's rest frame), plus
  a chest twist −20 so the shoulder goes back. The loaf clears the toque at 5/8 facings, and the cream gaps read as a
  skeleton gag. Put the vote sparkles on a socket at the prop TIP (`vote@tip`) so they never land on the face.
- (skeleton-chef v3, Talk at SE) A side-arm gesture with the right arm points AT the camera at SE (dir 1) and hides in
  front of the body. A chest twist −25 + head +20 swings it to screen-left (`v3/tk-all3.png`, tk10).
- (skeleton-chef v3, basket.p at 30° pitch) A `.p` offset forward (+z) moves a prop DOWN on screen by z·sin30, so a
  "thrust up and forward" needs y ≈ 1.6 × z to rise at all (0.32 / 0.2 → the basket reaches the chin at dir 1).
- (skeleton-chef v3, Emote FX) Fire the poof on the LANDING key (6 frames after the pop), not on the pop: the dust and
  heart on the pop frame buried the 1x read.
- (skeleton-chef v3, Chibi legs behind a held prop) Lift the carried prop while moving (walk/run keys
  `basket.p` +0.08, forearms −32): the shins and boots show below it in every drawing. Lowering the run (1.5× game speed,
  stride 0.8 H, bob 0.03) removed the 7-texel "seated" sink of the 2× run.
- (skeleton-chef v3, Process) **Bake into your own folder** (`tools/charpack.sh --bake <name> --out
  shots/char-<name>/bake`): `tools/remote.sh` pushes the Mac's `out/` on every sync, so another agent's sync overwrote my
  fresh remote `out/sprites/skeleton-chef.*` with the older Mac copy seconds after the bake. `shots/**` is not pushed.
  zsh: `for` over `G="cmd args"` does not word-split, so use a shell function; `== x` in echo is a zsh error.

### Module backlog additions (char-skeleton-chef v3)
| sev | owner | issue | evidence |
|---|---|---|---|
| medium | motion | (recurring) legacy Gait + legIK 'plant' re-pins legs every 60 Hz frame: walk flicker 1517, off_grid 32 (duty 0.3–0.4 on 0.36 m legs). Duty 0.4 also aliased to 3/4 drawings (readable FAIL), so chibis stay on 'pose' (in-hold 7.03 game / 24.84 run) | shots/char-skeleton-chef/v3/gA.log, gB.log |
| medium | tools | sig_ground golden-sun PASSes on a shade colour (#786B8D); the lit sun copy is toque #F8C987 vs grass #BEAE4F, dH 16, dL +.22 | shots/char-skeleton-chef/scene-golden-crop.png |
| low | tools | remote.sh push includes out/, which clobbers concurrent remote bakes in out/sprites | this session |
| low | tools | bake die row frame 0 is the white hurt-flash silhouette, not the gasp key | shots/char-skeleton-chef/bake/rows-S-x3.png |

## Archive — cast wave 2 per-agent notes (consolidated by the lead 2026-10-16)

Everything from here to the end was written per agent during wave 2 (toad, snail, honk, green-hood, mole, rabbit, chonk
authors and critics). Merged: recurring lessons are **(lead, wave-2 merge)** bullets in the topic sections above and
**R W2** lines in the playbook / CAST_PORTING; every module row is in §Module backlog (M8–M17, rig, look, fx, T2/T3/T7/T11,
T15–T24). Kept for character numbers and evidence paths. **Wave 3: do not append here — use the topic sections.**

## Additions (char-toad r1, Toadley, 2026-10-16)
- (toad, Palette) **(recurring: hound, frog, toad)** v1 olive skin (#989A5F family, even lifted to khaki #CACB84) rendered
  dH 15 / dL −4 % vs lit grass at noon and dH 14 in golden: the whole head vanished in `scene-noon-crop.png`. A/B with a
  palette-override variant (`shots/char-toad/wv.js?pal={"skin":["D0A474",…]}`; note: no `#` in URL params, it starts the
  fragment and breaks JSON.parse): warm tan-brown h ≈ 30° → noon dH 50, golden dH 35; khaki h ≈ 48° → dH 29 / 23 (fail).
  Golden compresses hues toward ≈ 54°, so a "green" or khaki signature must sit ≤ 25° or ≥ 85° rendered hue; the shade
  copy also needs sh ≥ grass-shadow L + 15 % (sh #8A7282 → +21 %). Rule: test 2–3 palettes with `--only scene` (10 s each)
  before modelling details.
- (toad, Locomotion) LegGait `locomotion.style` can be set independently of `plan`: plan 'biped' + style 'bird' = an
  alternating WADDLE (body roll onto the stance foot, head thrust, arm flap) on any upright chibi — 4/4 drawings,
  0.289 s / 1.14 H, upper flicker 0 with `surge: false`. Surge on halved the body drop but FAILed (upper flicker 2959,
  off_grid 34, `shots/char-toad/dir2s/`). The body drop cannot be avoided by `cycleTime` 0.267: hMax = ceil(30·C/(n·v) − 1e-6)
  rounds 2.0002 up to 3 because Cmin adds 1e-4 (backlog M2 epsilon, confirmed).
- (toad, Props) A prop that must appear only in one clip (vote scroll): author it at 4 % scale on its own leaf bone under
  the hand and key `<bone>.s` = 1/k − 1 (24) in that clip; hide the "stowed" copy with `.s` [−1,−1,−1] on its own bone.
  Two traps: a child bone at pos [0,0,0] makes its parent's axis zero-length (NaN geometry, page_errors 44); the prop
  must extend along the hand bone's −Y (past the fist) or a raised arm holds it pointing down along the forearm.
- (toad, Poses) Vote arm on a 0.67 m-wide chibi head: upperArmR out 150 + handR out +40 holds a 0.5 m scroll vertical
  beside the head, clear at 7/8 (crosses the face only at E); handR out −32 laid it horizontal (`vt{A,B,C}-z.png`).
- (toad, Die) Moving the die FX event from the impact key (17) to the settle key (20) made the FX steps coincide with
  the next pose change: die.strobe 3 → 1. A lying figure's arm with `out` ≥ 70° points straight up and reads as an
  antenna at N/NE/NW — fold it over the body.
- (toad, Shrug) Shrug arms at upperArm out 78° pass in front of a wide low jaw at SE; out 52°, forearm fwd 30 keeps the
  hands beside the body and still changes the S/N silhouette (pose_read 16 %).

### Module backlog additions (char-toad)
| sev | owner | issue | evidence |
|---|---|---|---|
| medium | motion | (recurring M2) LegGait body drop lowers a 0.27 H-leg chibi ≈ 3 texels in the walk; the hMax epsilon makes cycleTime 0.267 still use 3-frame holds for the drop | shots/char-toad/dir2/clip-game.png |
| low | tools | bake auto-cell: a shrug emote + glyph touched the border at cells 80 and 108 (NW/W/SW), final 146 render → 64×71 trimmed | shots/char-toad/bake |
| low | rig | a bone at pos [0,0,0] under another bone gives NaN geometry with no warning naming the bone | char-toad r1 |

## Critic note (critic-snail, Tinker Pell, 2026-10-16) — 15/24, not shipped
Evidence: `shots/critic-snail/` (cast pack, render-host) + `shots/critic-snail/mine/` (8-facing key stills `keys{A,B,C}-x3.png`,
`walk-x3.png`, face zooms `face-*-x6.png`, 1x GIF frame sheets `gif1x-*.png`, 25 % line-up `sil-lineup.png`).
- (Emote) **A prop motion hidden behind another prop is no motion.** tinker f8–f40 turns the wrench ±45° four times, but
  the gear in the left paw sits in front of it at S/SE/E/SW, so the four keys render near-identical (`keysC-x3.png` rows
  tink12/tink20; `gif1x-tinker.png` frames 1–5): 32 frames of "fixing" read as a hold. Swing the wrench on a path that
  clears the gear (raise it above the gear, rotate in the screen plane) and move the column/stalks with each turn.
- (Emote FX) The star glint (event f42) grows over ~0.3 s while the pose returns to idle at f62 — the payoff lands on
  the idle drawing (`gif1x-tinker.png` 11–13). Fire FX early enough that it is fully visible inside the held key, or
  hold the key until the FX ends.
- (Walk, limbless) A tail-pivot squash pulse gives ONE distinct drawing (long-low) and three that differ by 1–2 texels
  (`walk-x3.png`): at 1x real time it reads as a tick, not a 4-drawing cycle. The column and stalks are rigid (v2 wobbled
  the stalks every frame). Push the gather drawing (column rears/leans back, stalks sweep) so all 4 drawings differ.
- (Identity at S) A wheel-lathe shell (width 0.47) behind a 0.27 column shows only 2–3 texel brown slivers at S; v2's S
  view had a shell disc ≈ 2× the column. The v2 smile + rosy cheeks are missing, so the S face is a blank tan column.

## Additions (char-honk, Honk the goose, 2026-10-16) — first cast member on the bird plan
- (char-honk) **Hide the thigh, fold the leg → no LegGait body drop on a short-legged bird.** A straight 0.15 m bird leg
  at 4 H/s gets `drop ≈ hip height` (M2: half-span ≈ v·hMax − plant ≈ 0.3 m > leg). Goose fix: hip joint 0.42 m INSIDE the
  egg, thigh 0.23 m forward-down to a knee inside the body, shank 0.27 m back-down; only the lower 60 % of the shank +
  the web show (≈ 4 texels). Rest Hh 0.375 m with 0.50 m of folded leg → drop ≈ 0; `game.readable` 3.95 H/s, 0.289 s,
  1.14 H, 4/4 drawings, holds 2–3, no seated body in the walk. The run (2·v) still seats it (declared).
- (char-honk) LegGait 'bird' walk (alternating waddle) reads at 1× with roll 12°, headBob 14°, bob 0.04 m and the
  orange feet flicking out under the egg (`shots/char-honk/game-onion.png`); a long thin neck amplifies the roll into a
  ≈ 5-texel head sway — a big part carrying the rhythm for free.
- (char-honk) Wing paddles folded BACK along the flank: give them `axis: 'back'`; `fwd −` raises the wing, `out` yaws it
  outward (the LegGait wing flick). A raised plate shows its thin edge from the front — add `twist −90` (upperArmL
  [−100, −90, 30]) to turn the broad face to the camera (A/B stills `shots/char-honk/z-t.png`).
- (char-honk) Proud eye blocks on an 8-sided lathe head poked through the silhouette at E/N/NE ("!" specks above the
  head in every walk drawing). Cutting the eyes out of the skull surface (owl/mushroom technique) on eye bones fixed it;
  put a 0.985-inset dark patch behind for the blink. (recurring with owl r2)
- (char-honk) Vote prop on the FAR side at dir 1: ride a chest-mounted prop to the raised wing tip with `<bone>.p` in the
  key (board.p [0.12, 0.75, −0.05]) instead of re-parenting; verified on the 8-facing still (visible 7/8, hidden at W).
- (char-honk) A sparkle event 6 frames after the raise made `vote.final_hold` FAIL (0.2 s): put `vote@` on the raise
  key itself (→ 0.8 s PASS); `emote:` glyphs still need ≈ 2 drawings to grow, so fire them ON the pose key.
- (char-honk, tools T11 recurring) `die.foot_slide` FAILs (8.94) on any die that folds the legs before the fall: it is
  the collapse, not a slide.

## Critic note (critic-toad, Toadley, 2026-10-16) — 14/24, not shipped
Evidence: `shots/critic-toad/` (cast pack `--preset cast --raw`, render-host RTX 4090, 64 pass / 20 warn / 0 fail), `dir2/`
(walk at E), `ct-turn-*-x8.png`, `ct-game60-x4.png`, `ct-dir2-game60-x5.png`, `g8-{vote-f10,talk-f0,excuse-f8,excuse-f20,die-f40}-x4.png`,
`ct-lineup-S-SE.png` (25 % vs 13 cast members, their own latest turn-key renders).
- (Identity) A low wide skin dome with the eyes sunk INTO its front reads as a **mushroom cap** in golden/noon scene crops
  (`scene-golden-crop.png`), not a toad: the v1 toad's two eye bumps on top of the S silhouette are gone (flat top at S/SE/SW
  in `turnaround-silhouette.png`), so the frog owns the eye-bump silhouette and the toad is "the frog without bumps".
  Proud bumps above the crown line (≥ 2 texels at S) are the species read; carve the eye slot into them.
- (Identity) Re-hueing the signature skin away from the v1 colour (olive → tan) to pass sig_ground trades the identity
  check for a ground check. Fix ground separation with VALUE (lighter olive-khaki hi, darker sh) or a rim/outline, not hue.
  No warts either — "bumpy skin" is in the v1 brief and is what separates a toad from a frog.
- (Chain) A 1-link hip satchel with gravity 0.9 / limit 35° swings BELOW the boots at E in the walk (`ct-dir2-game60-x5.png`
  frames 7–10, ≈ 3 texels under the sole line). Clamp the chain's world-down swing or shorten the hang; check chains at dir 2.
- (Expression) A one-eye wink (eyeR.s −0.8) on a 4×3-texel eye changes ≈ 2 px at 1x (`g8-excuse-f8` vs `-f20`): the excuse's
  punchline key is indistinguishable from the shrug. Punchlines need a pose change too (head drop, hand to the brow, jaw).

## Critic note (critic-green-hood, Wisp, 2026-10-16) — 16/24, not shipped (author self-score 16, gap 0)
Evidence: `shots/critic-green-hood/` (cast pack `--preset cast --raw`, render-host RTX 4090, 66 pass / 18 warn / 1 fail), `dir2/`
(walk at E), `s-{idle,talk,vote,die,glow}.png` (8-facing key stills ×3), `f-faces.png` (S/SE/SW heads ×8), `s-1x-keys.png`,
`sil-lineup.png` (25 % vs 17 cast members).
- (Expression) A void face with glowing eyes only reads while the void is the BIGGER area. Eyes scaled up for an expression
  (talk "tall" y×1.35, emote flare ×1.6) or proud eye boxes seen at 45° fill the opening: at SE/SW the idle face is already a
  pale-yellow oval with dark cracks (`f-faces.png` row 1), and the talk loop flips the whole face pale ↔ dark at 6 Hz
  (`clip-talk.png`). Keep the glow at ≤ 35 % of the opening at S, SE and SW (count the pixels). Change expression by eye SHAPE (squint,
  tilt, a dark lid bar) inside a void that stays dark, and recess the eyes so they don't fill the opening at 45°.
- (Face at E/W) A deep hood with the opening flush to +Z shows 0 eye px and an 11-px rim sliver at E/W (`dir2/clip-game.png`).
  That is the game's left/right walk, so the signature goes missing whenever the player walks sideways. v1 turns the opening
  toward the profile. Bring the rim forward of the hood front (≥ 2 texels proud) or widen the opening so one eye shows at E/W.
- (Identity in shade) A mauve-navy `sh` on a green slot (h 144 → 240) turns the whole figure deep purple in pillar shadow
  (`scene-noon-crop.png`: hood #424263). A deep-purple hooded figure with glowing eyes is the Storyteller's identity. Keep the
  signature slot's sh in the same hue family (dark moss/olive) and clear the night rule with value.
- (Silhouette) Hood width = hem width gives a capsule at 25 % (mole/toad/owl family). v1 flares the hem wider than the hood.
  A peak that leans straight back shrinks to a dark notch at N/NE/NW, so it has to lean to the side too.

## Critic note (critic-honk, Honk the goose, 2026-10-16) — 16/24, not shipped (author self-score 16, gap 0)
Evidence: `shots/critic-honk/` (cast clips idle,walk,run,talk,vote,die,honk,turn `--raw`, render-host RTX 4090, 65 pass / 18 warn /
1 fail), `dir2/` (walk/vote/die at E), `z-{talk-f6,vote-f20,die-f50,honk-f10,honk-f34}.png` (8-facing key stills ×4),
`z-idle-heads.png` (S/SE/E/W/SW heads ×7), `c-keys{1x,5x,5xb}.png` (dir-1 keys), `c-lineup.png` (25 % vs 14 cast members),
`c-diehold.png` (final-hold pop), `c-cgame1x.png` (1× game GIF frames).
- (Silhouette, positive) A thin neck column on an egg is the most distinct blob in the cast at 25 % (`c-lineup.png`). One
  shape that no one else has beats any amount of surface detail. The HONK pose (wings in a V, neck thrust low; `z-honk-f10.png`)
  reads at 8/8 and is the best emote silhouette so far.
- (Die must read "down" at every facing) A long neck held stiff at 30-45° above a body lying on its back reads as SITTING at
  E/N/NW (`dir2/clip-die.png` f68, `z-die-f50.png` N/NW: the neck stands vertical). For long-neck plans the die key has to lay
  the neck ON the ground (head below the body top), or the 25 % thumbnail keeps a standing figure.
- (Wing-held prop, vote) A prop raised on the far side of a neck column vanishes behind the neck at W/NW
  (`z-vote-f20.png` W: 2 orange px). Raise it up AND outward (≥ 0.15 m lateral), or swap the raising wing by facing.
- (Equal keys ≠ still hold) `die` keys f22 and f60 are both `DIE_END`, yet the frame at f60 redraws 105 px (neck, head and
  board move 1-2 texels; `c-diehold.png`, raw f-120 vs f-140). The runtime evaluates the last key of a one-shot differently.
  Diff the final hold yourself: `hold_redraws` and `final_hold` both PASS here.
- (Chinstrap at S) A cut-out chin on the underside of the head hides behind the beak at S, so the face reads as two eye patches
  plus a beak (`z-idle-heads.png` tile 1). v1 S draws the white U below the beak, cheek to cheek. The patch needs to wrap ≥ 2
  texels below the beak's silhouette at S.
- (Folded wing tips at S) Wing primaries kept at rest `out` stand up beside the body as two dark prongs at S
  (`c-turn-a.png` S, `z-idle-heads.png`). They look like raised arms. Fold the primaries back along the flank at rest.

## Critic note (critic-mole, Old Delve, 2026-10-16) — 16/24, not shipped (author self-score 17, gap +1)
Evidence: `shots/critic-mole/` (cast pack `--preset cast --raw`, render-host RTX 4090, 71 pass / 12 warn / 0 fail), `dir0/`, `dir2/`
(walk/talk/vote at S and E), `g8-A-x4.png` (vote f20 / talk f0 / talk f12 / listen idle, 8 facings), `g8-B-x4.png` (ring cock / tap / listen, die f18 / f60),
`c-game-cyc-x6.png`, `c-game-d02-x5.png` (1× game-speed crops, one cycle, dirs 1 / 0 / 2), `c-talk-face-x8.png`, `c-keys-x5.png`, `c-sil-lineup.png`.
- (Silhouette) An identity prop held beside the hip drops out of the blob at the side facings: the hammer is behind the body
  at E, W and SW (`c-sil-lineup.png` row 1; `clip-turn.png` f40–f46 show no hammer at all), so the 25 % mole at SW is the toad and at E is
  skeleton-chef. v1 keeps the hammer head at shoulder height, outside the body line, at all 8 facings. Carry a side prop further out
  (≥ 3 texels clear of the torso at E/W) or high enough that its head breaks the crown/shoulder line.
- (Legs at S) A short-leg scurry whose flight drawings bring both legs under the hips shows ONE boot at S (`c-game-d02-x5.png` row 1
  frames 1, 2, 8, 9): the gait reads as a pogo hop when walking toward the camera. Keep the feet ≥ 1 texel apart in the flight keys (hip roll out, not in).
- (FX) An event socket at the prop's tip (`hit@hammerTop`) lands wherever the prop points: in the tap key the hammer points down/forward
  and the spark draws at ground level at S and ≈ 8–10 texels off the claw at dir 1 (`g8-B-x4.png` row 2). Put contact FX on a socket at the contact point.
- (Expression) Tiny 3×1 squint eyes cannot squint further: the "listens / works by feel" beats (idle LISTEN, ring SHUT) change ≈ 0–2 px at 1×.
  When the design squint is the resting state, put the expression into the head (a ≥ 30° cock toward the ear) and a claw cupped at the ear.

## Critic note (critic-rabbit, Clover, 2026-10-16) — 15/24, not shipped (author self-score 16, gap +1 on #6)
Evidence: `shots/critic-rabbit/` (cast clips idle,walk,run,talk,vote,die,sniff,turn `--raw`, render-host RTX 4090, 61 pass / 22 warn /
0 fail), `dir2/` (walk/vote at E), `g8-{vote-f10,sniff-f12,sniff-f30,sniff-f50,die-f40,talk-f12,idle-f36}.png` + `z-g8-*.png`
(8-facing key stills ×3, `p` confirmed in the shot log), `z-game-keys-x8.png` / `z-game-60-a.png` (dir-1 hop drawings from raw
60 Hz), `z-eyes-x8.png`, `z-talk-x8.png`, `z-idle-x8.png`, `z-sil-lineup.png` (25 % vs 17 cast), `z-game1x-sheet.png`.
- (Read your own evidence) The sheet and learnings line "hop + negative lift hides the boots" are contradicted by the author's
  own `shots/char-rabbit/dir2c/clip-game.png`: f39 boot on the chest, f47 boot behind the back, f37/f43 boots in front of the
  bouquet. Same in dir 1 (`z-game-keys-x8.png`: crouch f33 a brown boot floats behind the SHOULDER, flight f42/f45 a 4×3-texel
  brown block in front of the bouquet) and in run (every touchdown f5…f59). Negative lift moved the problem, it did not remove
  it: with a 0.26 m leg under a hem the IK'd boot has nowhere to go but through the dress. Hide the legs in the crouch (scale
  or tuck under the hem) or give the hop a visible two-boot plant under the hem at the touchdown drawing.
- (Glint at a breath key = goggles again) The r2 fix (glint to the outer corner) only holds at rest: idle f36 (breath 2, held
  18 frames) and f56/f108 render the near eye at SE and SW as a 2×2 cream box in a dark rim (`z-eyes-x8.png` panels 1/3,
  `z-idle-x8.png` panel 3). A 1-texel body shift re-rasterises a 3×4 eye; audit EVERY idle/talk key at SE/SW, not only f0.
- (Eye proud of the lathe) The far eye, pushed out and turned 15° for the S read, sits OUTSIDE the head contour at SE/E/NE/
  SW/W/NW as a 2×3-4 dark nub (`z-turn-E-NE-NW-W.png`, `z-eyes-x8.png` panel 2). At E/W there is no muzzle (snout 0.12),
  so the profile is a ball with a black lump; v1 E draws a nose bump. Snout ≥ 0.2 m (playbook upright-animal line) or sink
  the far eye.
- (Jaw on a muzzle-less face) Talk f12/f36: the opened fur jaw renders as a 4-texel mauve wedge pointing down-forward (a beak /
  cigarette), no dark mouth shows (`z-talk-x8.png` panel 3, `z-eyes-x8.png` panel 4). A tiny dark mouth opening reads better
  than a hinged chin at this size.
- (Positive) The hop rhythm reads at 1× (detached shadow, ears lag, 4/4 drawings, 0.267 s): the ear chains are the best
  secondary motion in the cast so far. The die reads "down" at 8/8 (`z-g8-die-f40.png`). The vote bouquet still stops at the
  ear BASE at every facing (`z-g8-vote-f10.png`), and golden sun turns her into an orange rabbit (dH 23, `scene-golden-crop.png`).

## Critic note (critic-chonk, Chonk, 2026-10-16) — 16/24, not shipped (author self-score 16, gap 0; different weak spots)
Evidence: `shots/critic-chonk/` (cast clips idle,walk,run,talk,vote,die,plop,turn `--raw`, render-host RTX 4090, 66 pass / 15 warn /
1 fail = die.foot_slide, the roll itself), `dir0/` + `dir2/` (walk at game speed at S and E), `g8-{vote-f11,talk-f0,die-f40,plop-f4,
plop-f18}.png` + `c-g8-*.png` (8-facing key stills ×3, `p` confirmed vote:3/talk:0/die:24/plop:4/plop:18), `c-lineup.png` (25 % vs 14
cast), `c-game1x-track.png` (1× meadow crossing, figure-tracked), `c-turn-S-SE.png`, `c-turn-NE-N.png`, `ana.py.js` (bob numbers).
- (Contact drawings hide the feet) The squash + roll of the waddle-hop buries BOTH feet in the contact drawings and shows them
  in the airborne pass drawings: dir 0 `dir0/clip-game.png` f4/f12/f22/f26 (contact: one 2-px brown shadow foot or none) vs f2/f6
  (pass: two orange feet). The contact read is inverted — the bird looks planted while flying and footless while landing. Raise
  the squash pivot or splay the planted foot outward ≥ 2 texels outside the ball in the contact key.
- (One-sided bob) Head top per drawing at dir 1 (raw/clip-game, y px): pass 161, contact R 162, pass 161, contact L 165 — only
  ONE of the two contacts dips (4 px); the other is 1 px. At 1× it reads as a once-per-cycle limp, not two bounces. Key the far-side
  contact so its head drop survives the roll (counter the roll lift with more `pos` drop on that drawing).
- (Rear views) N/NE/NW are a snowman: a featureless head sphere floating on the ball with no neck taper, and the tail tuft
  (wing sh `#776B8A`) seen end-on is a dark 4×5-texel triangle in the middle of the back (`c-turn-NE-N.png`) — it reads as a hole
  on the lightest mass. v1 N draws the tail as a light chevron at the bottom and the head merged into the body. Also a stray
  1-texel dark eye pixel shows through the back of the head at NE (eye proud of the lathe).
- (FX/props reading as something else) Plop dust = three beige 8×4 ovals under the goose (`clip-plop.png` f30/f34): a goose
  that lays eggs. Die: the upturned near foot renders as a flat orange triangle pasted on the belly at SE/E (`c-g8-die-f40.png`).
  Run: the far wing at full flap is a dark oval behind the head (an ear/ponytail, `clip-run.png` f10).
- (Golden) The white goose becomes an apricot ball on yellow-green grass (dH 24, dL +15 %, `scene-golden-crop.png`).
- (Positive) The most distinctive silhouette in the cast (`c-lineup.png`), vote wings-up V reads at 8/8 (`c-g8-vote-f11.png`),
  die reads "down, feet out" at 8/8, plop squash is a strong 1× gag, 4/4 drawings at 0.289 s, pan 0 px, off_grid 0 everywhere.

## Additions (char-snail r6, Tinker Pell, critic fixes, 2026-10-16)
- (snail, Locomotion) **A limbless/legless character can use the LEGACY Gait (authored walk poses) with PART-LESS hidden
  legs.** LegGait 'glide' plays no authored poses (M1) and its pulse `c = −cos(2π·k/4)` gives drawings 1 and 3 the SAME
  pose (only 3 distinct; the critic saw 1). Fix: no `locomotion.plan`; add `hleg/hknee/hank` L/R bones with no parts
  (names that charcheck's foot finder ignores, so no bogus foot_slide), a BENT rest leg longer than the hip height
  (hip 0.31, leg 0.41 → `hipDrop` = only its constant 0.006 walk / 0.03 run, cancelled in the clip's `pos` y), part-less
  sink bones for the Gait's hips/spine/chest/arm channels (`locomotion.bones`), `runFroude` above the game Froude,
  `legIK 'pose'`, and `clips.walk` length 4 / step. Result: 4 different drawings at 8/8 facings, game.readable PASS
  3.95 H/s 0.267 s, walk/game off_grid 0, flicker 0 (`shots/char-snail/r6/p4`, `r6/s3/W.png`).
- (snail, Emote) **A tool that "works on" a held prop: give it its own bone pivoting on the prop's hub** (shown only in
  the emote via the 1/100-scale +99 trick, the carry copy hidden with `.s` −1) and swing it in the screen plane with the
  `out` channel of an 'up' bone (±38°); add a 30° gear click + column roll ±8° so every 8-frame key differs at 8/8.
  A gear held "up" by rotating the paw `fwd 75` turned the disc edge-on across the mouth at S; move it with `<bone>.p`
  instead (disc keeps facing the camera).
- (snail, Silhouette) A 3D drum shell (flat-capped wheel lathe) shows only slivers at S; widening it to 0.6 m made a
  barrel at the 3/4 views. A superellipse "ball" lathe (r = R·(1−|u|^2.3)^(1/2.3) across the width, 16 sides) gives a
  round disc ≈ 1.9× the column at S, a round shell at 3/4, and near-flat side domes that still carry a cut-in spiral.
  Shells further back (z) project HIGHER at pitch 30°: lower the shell centre and splay/lengthen the stalks so the
  goggles clear its outline at S/SW.
- (snail, Lines) Pattern on a convex signature: cutting the spiral coplanar into the subdivided lathe (mushroom-spot
  method; predicate = side dome |x| > 0.8·half-width AND point-in-spiral-polygon in (z, y)) dropped shell isolated px
  from 7–9 to ≤ 4 per facing; the remaining ones are single shell px at outline joins with the stalks/foot.
- (snail, Palette) Peach/pink-peach skin `#FFDCC4/#EBA88E/#A4707E` (h ≈ 18–25°) beat cream-peach (h 30) and light cream
  for separation from BOTH lit grass and an orange shell; shell sh `#7C4A4E → #623A48` turned golden-shade dL −9 % WARN
  into −29 % PASS (darker beats lighter: +12 % with a lifted sh still WARNed).

### Module backlog additions (char-snail r6)
| sev | owner | issue | evidence |
|---|---|---|---|
| high | motion | (recurring M1) LegGait 'glide' pulse `-cos(2π·k/n)` gives drawings k and n−k identical poses (n 4 → 3 distinct); and no authored-pose layer | src/chars/locomotion.js glide branch; critic-snail walk-x3.png |
| low | tools | bake `run` row at 2·v found 3 drawings / period 6 (the pack's run clip looks 4-drawing); suspect the legacy Gait's run weight `w` still ramping inside the bake window (cycle lerp(cw, cr, w)), not verified | shots/char-snail/bake/snail.json |
| low | tools | (recurring) remote.sh pushes out/ on every call, can clobber other agents' remote bakes | this session |

## Additions (char-toad r2, Toadley, 2026-10-16)
- (Silhouette, 30° camera) The TOP of a head at S is the BACK rim of the crown, not the front: screen-up = y·cos30 − z·sin30,
  so a bump at the front (z +0.06) loses 0.03 m against the back rim (z −0.2 gains 0.1 m). To make two eye bumps break the
  S outline, lower and shallow the crown's top rings (back rim projection ≤ bump top − 0.07 m) instead of only raising the
  bumps. Same-bone same-slot bumps (head + skin) share the part id → no junction line.
- (Palette) A v1 olive that shares the grass hue (dH 11-14) can still pass sig_ground by VALUE: hi #8E9446 renders −28 % L
  under lit grass at noon and golden; dark moss sh #3E4634 is −28/−30 % under shaded grass (the "≤ −25 %" branch). A
  −25 % candidate (#969C4A) WARNs, so leave 3 % margin. Keep identity hue; move L.
- (Speckle source) A/B by dropping parts with a variant (`drop=jaw` → skin isolated SE 9 → 2): a jaw box NARROWER than the
  skull's bottom ring leaves a 1-px ledge whose part line breaks into isolated px at 45°. Making the jaw flush/wider than
  the skull (0.70 vs 0.69) cut speckle 43 → 35; tucking it inside a lowered skull ring made it worse.
- (Wide heads hide arms) On a 0.7 m-wide head over 0.27 m arms, any hand gesture in front of the face/brow is hidden under
  the head at S/SE (30° camera). Gestures must go UP AND OUT past the head width (vote out 135, oath hand out 116); torso
  twist that pulls the shoulder back hides them again.
- (Die face) Lying on the side puts the face sideways at 6/8 facings. Falling BACKWARD (hips −82) with the chin tucked
  (head +34) shows the shut-eyed face at S/SE/SW/W — the game's usual facings.
- (Prop clearance) Measure prop-over-crown per facing on the 8-facing still: a vertical prop on the RIGHT arm rises behind
  the head at E (4 texels vs 14 at S).

## Author note (char-green-hood r6, Wisp, after critic 16/24) — 2026-10-16
Evidence: `shots/char-green-hood/self/f-faces.png` (+ glow/void counts from `gh_faces.py.js`), `r6/` iterations, render-host RTX 4090.
- (Face) **Convex bead eyes centred ON the void front** keep a void face dark from every angle: same projected size at S/SE/SW
  (no proud box sides), glow ≤ 0.29 of the opening in idle/talk/die. Proud beads (equator in front of the void) lost their
  edge px to depth lines and read as 2×1 dull dashes (`r6/f-faces.png` vs `r6/b/f-faces.png`).
- (Face) **Never scale a bead eye in x**: `eyeL.s` x +0.3 drew a dark 1-px column down each eye (cause unknown, look/rig);
  y-only scale is clean (`r6/b/f-dbg2.png` vs `f-dbg3.png`). Express by y-squint and eye-bone ROLL (twist ±15).
- (Face at E/W) A **bevelled rim** (front faces slope outward, 0.046 m proud) + beads poking 0.03 past it gives rim 30 px and
  ~4 eye px at E/W (was 11 / 0) while the S face stays v1-like.
- (Props per clip) A prop or FX part can live on its own bone kept at **scale 0 by a `HIDE` spread in every key** of every
  clip except its own (vote lantern, emote light ring): pose_read 13 → 20 %, no extra draw call, deterministic. Remember the
  gait keys and `breath()` too, or it shows in walk/idle.
- (Silhouette) A peak leaning BACK projects onto the hood at N/NE/NW (camera pitch 30): put the joint on the crown and lean
  the tip sideways (0.18 m) and up; then it breaks the outline at 8/8 (`r6/t5/turnaround.png`).
- (Silhouette) Bell hem flare r 0.315 with exponent 1.7 read as a flat saucer from the game pitch (`r6/t1`); r 0.30 / exp 1.35 is the limit.
- (Shade) Green-family sh #3B4739 (L 0.25) still passes noon-shade at dL −28 %; #3E4A3C only scraped −25 %.

## honk round 2 (art director 16/24 → fixes; char-honk)
- **Do not counter-rotate a child on the same axis as a big parent roll.** honk's die rolled the body 80° on z and the
  neck chain −36/−18/−28 on z: net ≈ 0, so the neck stood upright and the goose read as SITTING. Lying down = the
  neck FOLLOWS the roll and droops a further 15–20° to the grass. Check every facing at the final hold (8-facing still).
- **One-shot holds: end on the last key with `clip.length`, never a duplicate final key.** keys f22 + f60 (same pose
  object) redrew 105 px at f60; `length: 61` with keys ending at f22 holds without the pop (intervals end at f22).
- **Short-legged plans (bird, chibi): set `locomotion.plant: 'hold'`.** 'auto' resolved the bird walk to 'pin' and the
  60 Hz legIK re-pin redrew the legs inside every hold (flicker 919 px); 'hold' = sprite-style leg drawings (flicker 49,
  off_grid 1) and the 2·v hop run no longer seats the body on the grass.
- **A raised prop must clear the neck/torso column at the SIDE facings**: lateral offset turns into depth at W/E.
  Move it up-and-BACK (over the back) and tilt/yaw it 25–30° so its face shows from the side too; keep it at the
  limb tip (a board higher than the wing reaches floats).
- **A face mark under a protruding beak is hidden from the 30° camera** (the beak shadows ≈ its length × tan 30° below
  it). Put the chinstrap's bottom on the neck front (throat band, ≥ 2 texels below the beak) and keep ≥ 1 texel of the
  head colour between the cheek patch and the eye.
- **Dead eyes on a dark head**: a cream X (two crossed strokes) SUNK inside the skull at rest and pushed out with a
  `<bone>.p` key in the die; shut eyelids in the head colour are invisible on a black head.
- **Two coplanar-ish wing plates on parent/child bones leave a 1×3 seam line**; merge them into one hull on the parent
  bone when the child's rotation is not needed for that part.

## Additions (char-rabbit r3, Clover, 2026-10-16)
- (Dressed hopper legs) On a short-legged chibi in a skirt, NEVER let the LegGait IK the visible boots: the world plants
  put them on the chest, the back and in front of the bouquet in every hop drawing (r2 critic, `lift < 0` did not help).
  Workaround without touching shared code: add GHOST leg bones (no geometry, long + bent so `drop` is 0) and point
  `locomotion.legs` at them (the gait still gets its clock and step events → hop dust), keep the visible legs FK and
  list the visible thighs in `locomotion.squash.bones` with the head. Then set `locomotion.height` so the touchdown crouch
  (−0.06·height, hard-coded) equals the leg shortening (amount·hip height): boots stay on the ground, hem comes down,
  game.flicker 392/536 → 0, off_grid 11 → 0. The honest cost: foot_slide becomes n/a (no planted foot is drawn).
- (Eyes on a lathe head) An 8-sided lathe leaves the outer half of a 0.09 m eye box 0.04 m off the slanted facet → a dark
  nub outside the contour at 3/4 and profile views. Use 16 sides, put the eye joint ON the ellipse, turn the box to the
  surface normal (here 30°) and keep the front face ~0.006 m proud: flush (0 or recessed) z-fights into a hollow ring
  eye. A 0.034 m glint is 2×2 texels on half the breath keys (goggle); 0.024 m flush with the corner stays 1 texel.
- (Talk jaw) A fur chin swung 30° renders as a mauve wedge/beak in its shadow tone. Make the jaw the lower lip under a
  real snout and open ≤ 15°: the dark mouth floor shows as a 1–2 px opening. Keying spring ears in a LOOP clip makes
  them re-settle every 2 frames inside each hold (loops ignore clip.dynamics) — leave loop ears unkeyed.
- (Golden sun on white fur) Golden light maps any near-white to ≈ #EFC089 (dH ~25 vs olive grass). A cool lilac (#F6F2FF)
  barely moved it; a pink-lilac hi #F8E8FF / mid #DECCF4 turned it #F1B889 = dH 34 PASS. Push the hi tone toward
  magenta (R and B up, G down), not just "cooler".
- (Vote reach on chibi arms) Grid-search the arm in node (`shots/char-rabbit/rabbit_vsearch.js`): a bent rest forearm
  needs forearm [−60, 0, 60] + hand −90 to point up; scaling the forearm 1.4× (`forearmR.s`, inherited by the hand)
  both lengthens reach and enlarges the prop. Tilting the upper arm forward 30° moved the prop off the face at E.

## Additions (char-mole r2, Old Delve, 2026-10-16, after critic 16/24)
- (Prop in the silhouette at 8 facings) Any FIXED horizontal offset of a carried prop vanishes into the body at the two
  facings where it lines up with the view axis. Lift the prop head to shoulder/crown height and pick the offset so the
  facing that hides it is one where the prop is FAR side (it then pops above the head: 30° camera = depth shows as
  height) or in front of a contrasting colour. Mole: hand 70° out, hammer leaning 27° out / 8° back, head turned 20° on
  the handle (`hammer: [0,-20,0]` twist of the prop bone = a T at S/SW/W instead of an end-on square) → T at 7/8 facings
  (E is the in-front facing). Iterate on an 8-facing still + key-green silhouette row (`shots/char-mole/mole_g8s.py.js`).
- (Counter-keyed wrists) Counter-rotating the hand's fwd channel against the arm swing only keeps a prop plumb for the
  wrist triple it was tuned on; with a solved twisted wrist it laid the hammer head flat on the chest at dir 1. Hold the
  solved wrist and let the prop ride the arm.
- (Point a prop at a point, not a direction) `shots/char-mole/mole_solve2.js` grid-searches the wrist so the prop HEAD
  lands on a socket (here 0.075 m above the left claw): err 0.02 m in one run; an emote "hit" should fire at that socket
  (`hit@clawL`), not at the prop's tip, which points wherever the wrist sends it.
- (Hidden-surface flicker) A mouth-cavity box enlarged 0.13→0.15 m poked a few mm through the chin/skull and made the
  game walk flicker (off_grid 2–4, tiny changes 3–6 per run) as the root glided; back to the inside size → 0. When a
  re-pack suddenly shows "legs/specks only" flicker, diff the last geometry change, not just the legs.
- (Legacy Gait cadence + held contact) `cycleLength` clamps to 2·reach·legLen/duty: raising duty to 0.3 on 0.28 m legs
  silently SHORTENED the cycle (0.267 s). With duty 0.18, step 0.66 H gives a 10-grid-frame cycle at 3.95 H/s, so an
  authored walk of length 10 with keys f0/3/5/8 holds each contact 3 frames and each flight 2 (game.readable 0.317 s,
  1.25 H). `legIK 'plant'` on the legacy Gait re-solves the legs every frame (walk off_grid 23, flicker 870) — not usable
  for stop-motion; keep 'pose'.
- (Pogo at S) A short-legged chibi's flight drawing showed one boot because the trailing boot was lifted behind the apron
  skirt: wider `locomotion.spacing` (0.27 = feet 3+ texels apart), lower lift (0.03) and a shorter skirt (0.12) put both
  boots on screen in every drawing.
- (Face at the game facing) A big round skull with the face on its front puts the face on the silhouette edge at SE.
  A constant 12° head twist toward the camera side (a "sideways distrustful glance") opens both goggle lenses, the eye
  and the nose at dir 1; turn the head further (−14…−24°) in talk so the jaw gap shows at SE.
- (Brows under goggles) Brow bars placed between the eyes and big goggle rims are hidden at rest; they only read when a
  SHUT key drops them (`browX.p` −0.03) over the eye — the goggle rim is the real "brow" there. Dark brows made the face
  a bandit mask; keep them in the head colour.

## Author note (char-chonk r2, Chonk, 2026-10-16) — fixes for critic-chonk 16/24 (self 20; render-host RTX 4090)
Evidence: `shots/char-chonk/` (cast pack `--raw`, 67 pass / 15 warn / 1 fail = die.foot_slide T11), `shots/char-chonk/probe/`
(`f-walk-d0/d1/d2.png` one 1x frame per walk drawing + per-drawing head/feet log, `r*-g8-*.png` 8-facing keys, `heads-*.png`).
- (Legacy Gait: the reach DIP eats the hop) `character.js _solveLegs` dips the hips for EVERY shown foot out of reach, swing feet
  included. An authored `pos` +0.11 on the airborne drawing was pulled back down (r1 pass head was LOWER than idle). Either lift the
  swing feet (`locomotion.lift` 0.28 m for a 0.26 m leg) or move the body with a bone offset the dip can't touch (`ball.p` + riders).
- (Squash pivot vs visible feet) A squash bone pivoting at the ball bottom keeps the bottom where it is, so a "drop" on contact
  buries short legs. Lift the ball off the hips on the contact (`ball.p` +0.11) and take the head drop from a bigger squash
  (0.22): head still drops 4-6 texels, feet show. Toe-out webbed feet (~35°) poke past a wide body where splaying the legs can't.
- (Roll swings the head = limp at 3/4 views) A ±10° spine roll pivoting at the hips moves a high head 0.12 m sideways; at SE/E the
  sideways move projects into screen y (±2 texels), so one contact looks 4 px deep and the other 1 px. Shift the chest back by
  −0.66·sin(roll) (`chest.p`), and measure the head joint per drawing from the stage log (`s.h`), not the mask top (tail tips count).
- (Rear snowman) A part on a different bone from the head draws a part line, so a nape collar must sit on the HEAD bone (same
  bone + slot). Keep its front inside the body: at z −0.14 it was fine for tones but made `run.off_grid`/`flicker` fail
  (5 / 14, in-hold specks on the now-visible feet) — bisected by variant spec to the nape alone; z −0.11 passes. Re-run run after
  any geometry change near the body.
- (Upward tail at N) An end cap facing −Z renders in the slot's shadow from behind; a flat blade in the `down` slot, never pitched
  up in vote/plop, reads as a light ridge at N like v1.
- (Eye at the 3/4-back edge) With the camera 30° above, eyes above the head's equator stay visible further round the back; a
  chevron 0.03 proud showed 1 px at NE/NW. Moving it 0.02 m inward / sinking it did not remove it (sinking killed the S read);
  only x ≤ 0.03 did. Plan eye placement for NE/NW at the design stage (eyes low on the face or flush decals).
- (Plop dust) `poof@<node>` puts 6 slow motes at the node — under a wide body they read as eggs; the `land` ring flies out.
  Light `spec.fx.dust` tones help; motes still pass under a 1 m body, a wider-spawn option would help (module issue).

## Author note (char-requin r1, Requin the shark, 2026-10-16) — self 15/24, pack 73 pass / 25 warn / 0 fail (render-host RTX 4090)
Evidence: `shots/char-requin/` (cast pack `--raw`), `dir2/`, `self/z-*.png` (8-facing key stills), `self/sil-lineup.png`.
- (One-egg body) A head+body bullet split over chest/head bones with the neckerchief ON the seam works: no seam at 8/8
  facings with head keys ≤ 8° (big beats go to the chest, which rolls the whole egg). The white belly as the FRONT SECTOR
  of the same 16-gon profile (convex hulls of ≤ 180° wedges incl. the axis points, sharing their cut edges) gives a
  two-tone body with no inner line and no z-fight; widening it 90° → 135° + `material.slots.belly.lift 0.35` turned the
  SE belly from shadow-lilac into the v2 white mass (`gamespeed.png` next to the v2 sprite showed the gap).
- (Prop hand vs the game facing) The far hand at dir 1 is the character's RIGHT: a vote prop raised in the right fin sits
  over the beret at SE unless the chest twists away (−14) with the head counter-twisted (+12). Back-leaning the arm
  (fwd −30) foreshortened it at S/SE; a wrist 'out' past a 150° raise rotates the prop OVER the head (it continues the
  same rotation sense) — use a negative wrist out. Result 6/8 clear; E/NE still cross. Plan the vote hand from the
  dir-1 near side at Stage 0 (here the near hand already holds the identity bomb).
- (v1 profile prop) v2 draws the bomb in FRONT at both E and W (hand swap). With one hand in 3D, carrying the bomb fin
  forward 42° (out 34) shows it in front of the body at the far-side profile; hanging straight out (out 40) hid it at E.
- (FX timing vs strobe) die.strobe 3 and emote.strobe 4 FAILed with FX events one frame after a key (dust/sparkle birth
  + the key change + the FX's first step = 3 consecutive changes). Putting every FX event ON its key frame → strobe 1.
- (Edge-on tail) A vertical crescent tail on the midline is a 1-px stick from behind (N); a constant 32° side sweep in
  every non-gait clip (v1 N sprite also sweeps it) shows the lobes at N/NE/NW.
- (Die face) Lying on the back with head fwd +40 / chest +18 read as SITTING (honk lesson again); head +20–24 plus a
  −28° roll of the hips (twist after the −86° fall) shows the shut-eyed face at S and keeps "down" at 8/8.
- (Process) Never `python3 -` on the Mac even as a no-op guard; write remote helpers as `shots/char-<id>/<id>_*.py`.

## Author note (char-frog t2 touch-up, Sir Croaksworth, 2026-10-16) — point / ghost / ghost-spent, de-combat (render-host RTX 4090)
Evidence: `shots/char-frog/t2/` (ghost-x3, ghost-night-x3, probe*.png, point-c, sheet-*-1x.png, pack/report.txt, ab-idle/ab-talk 0.00 %).
- (Ghost tint with NO shared-code change) A per-clip tint needs a signal the shader can see. Append a geometry-less bone
  (`ghostFlag`, child of the root bone) and key its `.s` in the ghost clips only; in `spec.material.vertex` read
  `length(getBoneMatrix(<idx>)[0].xyz) / length(getBoneMatrix(0.0)[0].xyz) - 1.0` (skinning matrices are available in the
  begin_vertex hook) → `flat varying`; then `spec.material.tones` re-maps toonHi/Mid/Sh. Bones appended LAST with earlier
  parents keep index = array index. Every other clip stays pixel-identical (unkeyed `.s` = 1).
- (Ghost look) Re-map tones by LUMINANCE onto a 3-tone pale ramp (`t = (sqrt(lum) − 0.2)·1.6`, dark→mid→light): eyes,
  mouth band and part steps keep their value order, so the face still reads. "Translucent" with an opaque toon material:
  a 2×2 Bayer `discard` keyed on `vCharBind.y` (bind space, so the fade rides the body) 1/4 → 1/2 → 3/4 below the chest
  reads as the v1 fading tail at 1x and bakes to real alpha holes. Add a small `totalEmissiveRadiance` scaled by the night
  ramp (keeper's kNight) or the ghost goes slate-grey at night; give the halo its own (gold) branch.
- (Hidden prop for one clip) A halo/prop that only one clip shows: park its bone INSIDE the head mass at rest and move it
  out with `<bone>.p` in that clip (clip zero-fill = rest = hidden). No scaling tricks needed.
- (Loop clips IK the legs) A hovering LOOP clip (ghost) cannot use `legs: 'fk'` (only one-shots honour it): the idle path
  re-plants the feet on the ground and dips the hips ≤ 0.1 m. Lift `pos` ≥ leg reach + 0.1 so the dip is always capped
  (constant) — the bob survives and the legs hang straight (fine under a dither fade). Module issue reported.
- (Point with a prop in the pointing hand) With the sword in the only free-ish hand, the wrist decides whether "point"
  reads as a gesture or a threat. Probe 12 wrist triples on the 8-facing still; `handR [−90, 90, 0]` on an arm
  [24, 0, 72] puts the blade BEHIND the fist (fist leads at S and SE). At SE (screen x ≈ 0.71·(x+z)) a forward-right arm
  points at the camera and vanishes; more `out` (72–88) and less `fwd` puts the fist beside the cape. Keep the arm a
  little BELOW the jaw on a wide chibi head or the cheeks hide it at S.
- (De-combat) Swapping a weapon sweep for a "pledge" (hand to heart, blade across the body) and dropping the hurt
  flash/impact bounce from die kept every timing row PASS; a `hit@weapon` glint becomes `sparkle@weapon` (sparkle FX at
  the socket, not an impact spark).

## Additions (char-mushroom touch-up, Brother Morel, 2026-10-16) — point / ghost / ghost-spent without shared code
- (Ghost look per clip, spec-only) There is no per-clip tint in src/chars. Working recipe: a bone whose `.s` is keyed only
  in the ghost clips is a per-clip SIGNAL the shader can read — in `material.vertex`, `length(getBoneMatrix(i)[0].xyz)`
  divided by the same for an unscaled bone (head) → flat varying; `material.tones` then remaps `toonHi/Mid/Sh` (luminance →
  pale-blue ramp) and a 2×2 ordered `discard` on `vCharBind.y` fades the lower body (both passes, so the bake's alpha is
  clean). Bone index = position in the skeleton array (rig.js keeps parent-first order). Living renders unchanged.
- (Part visible only in one clip) Author it at ×0.001 around its own joint, joint buried inside an opaque part (cap dome),
  and key `<bone>.s` = 999 in that clip; every other clip zero-fills the channel → it stays a hidden speck. Use a ring band
  ≥ 0.09 m: a 0.06 m halo band broke into arcs at 1×.
- (Hover in a loop clip) Loop clips cannot be `legs: 'fk'`; the gait IKs the feet to the ground and the reach safety net
  dips the hips. Keep the hover inside leg reach and scale the visible shins/boots away (`shin*.s` −0.98, not −1: no
  singular matrices).
- (Point at the game facing) The game turns the avatar toward the target, so point FORWARD — but a chibi under a wide
  brim foreshortens a forward arm into nothing at S/SE. Twist chest+spine ≈ 40° (right shoulder forward), counter-turn
  the head, so the arm is a screen-horizontal stroke at SE; the game's dotted trail gives the exact target. Hold ≈ 3.5 s
  (pipgws EMOTE_POINT_MS).

## Additions (char-goat touch-up, Magistrate Billings, 2026-10-16)
- (Ghost by copy) mushroom's ghost recipe (buried halo bone whose world scale is the shader's ghost signal + luminance
  remap + bind-height dither) ports to another character with only three numbers changed: halo joint inside the skull,
  ring height above the tallest part (horns), dissolve band in bind y. Append the halo bone LAST in the skeleton: every
  living render stayed pixel-identical (A/B 0 px on turnaround/idle/walk/run/talk/vote/game/turn/scenes).
- (Point with a held prop) The free arm pointing straight ahead is end-on at S/N and swallowed by a bell robe at SE
  with out 18°; out 32° + upper fwd 84 + forearm −24 puts the hand outside the silhouette at 6/8 facings.
- (De-combat an emote without losing the read) A tilted staff wind-up read as a weapon swing; a PLUMB lift (STAFF_UP:
  arm fwd +a, wrist −a) + gavel tap keeps the beat and the pose change (verdict pose_read 44 %) with dust only, no `hit`.
- (Gentle die) Dropping `hurt` + the wide-eyed flinch key removes the white flash; the first key should still differ
  from idle (head droop + hand to chest is subtle at SE — push the head/ear droop further next time).

## Additions (char-fox touch-up, Ginger, 2026-10-16) — point / ghost / ghost-spent, gentle die
- (Ghost tint without shared code) The look module has no per-clip tint, but a spec can build a second, pale copy of every
  part on part-less child bones (`g_<bone>`, parent = the living bone, pos 0) with geometry baked at 1/1000 size, so it is
  invisible everywhere; the ghost clip keys `g_<bone>.s` [999, 999, 999] (scale OFFSET, no clamp). Inflate each copy
  ~0.006 m about its own bbox centre (split surfaces of one solid share one centre) so it covers the living part; set
  `material.merge { g_<bone>: <bone> }` to keep the part lines. Cost: +15 bones and +4 palette slots per look (fox: 54 bones,
  15 slots; caps are 64 / 16). A second set gives "ghost-spent". charcheck: 0 FAIL, off_grid 0, `islands` 1→2 = the halo.
- (Peek-through) Thin panels (an ear's cream inner panel 0.012 m) peek through their shells at the tips; grouping the ear
  pieces about one centre made it worse (orange tips). Fix: shrink the living LEAF bone inside (`earL0.s` −0.15) and key its
  shell ×1000/0.85 so the shell keeps full size. Only works on leaf bones (scale inherits).
- (Hover in a loop clip) `legs: 'fk'` on a loop clip keeps the feet off the ground with a raised `pos` (stage log feet
  y 0.10 at pos +0.14); hide boots with `footL.s` [−1, −1, −1] and add a wisp under the hem.
- (Point at the game facing) Pointing straight ahead aims at the camera at SE/S and vanishes into the bodice. Turn the chest
  toward the pointing side (−16°), arm out ≥ 45° and raised ~110–115° fwd: the paw clears the body at S/SE/E/W/SW.
- (Die without combat) Replace the hurt flash + flinch with a swoon key (paw to brow, head back, half-lid); the rest of the
  collapse and the held pose stay, die.foot_slide 0.56.

## Additions (char-crow touch-up, 2026-10-16): point / ghost / ghost-spent without shared code
- (Per-clip material state from a spec) There is no per-clip material switch, but a clip CAN drive the shader: key the
  scale of a part-less control bone (`ghostK.s`) and read it in `material.vertex` with three's `getBoneMatrix(i)` as
  det(mat3(bone)) / det(mat3(parent)) = (1+s)³. The value ignores rotation and facing, and zero-fill keeps every other clip at 0.
  Bone texture index = rig.js topological order (replicate `visit`), NOT spec order. Then `material.tones` re-tones
  (toonHi/Mid/Sh) and may `discard` (it runs before the normal-pass return, so outlines agree; the shadow depth pass
  does not see it). `vCharBind` (bind-space position) is available in tones for height bands and for spotting a part.
- (Ghost tone mapping) Map hi, mid and sh SEPARATELY by perceptual lightness (√ of linear luma) onto a pale ramp: the
  shading steps and slot separation survive. A lift such as 0.22 + 0.86·v washed everything to one lavender. Use (v − 0.16)·1.6
  with a saturated dark end (#3E5C9E). Under the sigLift the hat still renders mostly in its hi band (pale), which is fine.
  Add a night self-glow via the keeper test (1 − smoothstep(.35, .6, luma(uRampHi))) or the ghost turns navy at night.
- (Halo) Microscopic ring (×0.001) on a bone over the hat, `halo.s` 999 in `ghost` only; flat emissive gold (tones
  zeroed) so it glows in shade and at night. An octagon of 8 boxes (0.045 m bars) reads as a ring at 1×. Put it about 0.2 m over
  the crown: at 0.12 m the crown showed through the ring at the 30° pitch.
- (Hover in a LOOP clip) Loop clips keep the idle leg IK. `_solveLegs` dips the hips by up to 0.1 m when a planted foot is
  out of reach, so a hover of h needs `pos` y = h + 0.1 (measured: 0.16 asked → head 5.4 px up). Hide the stretched legs
  (dissolve band). `clip.legs: 'fk'` only applies to one-shot actions (module issue).
- (Point with a short chibi arm) A forward point at dir 0/1 disappears into the body (foreshortened, dark on dark).
  Aim it about 25° above level and 35° out (depth reads as height at 30° pitch), and stretch the hand along its bone (`hand.s`
  y +1) into a "finger". It reads at S/SE/W/NW/SW and is hidden at E/NE/N (behind the beak).

## Additions (char-moth touch-up, Lumen, 2026-10-16 — point / ghost / ghost-spent / gentle die; render-host RTX 4090)
- (Point on a big-headed chibi) A paw pointing straight ahead is invisible at the game facing SE: forward projects
  toward the camera-right across the body and under a 0.57 m head (4 arm variants, `shots/char-moth/t3/v1-v4`). What
  reads at dir 1 is the PROP thrust out ahead at chest height (the moth's lantern, counter-keyed plumb) plus a second
  pointer the species has (both antennae swung forward along the point) and an `emote:exclaim` on the point key.
- (Ghost on the legacy Gait) A loop clip's root `pos` hover is pulled back by the leg-reach dip (≤ 0.1 m, whole texels):
  key pos +0.26 to get +0.14 m (5 texels). Measure the hover from the stage log `hs` head y, not by eye.
- (Ghost shader alongside an existing `tones` hook) Put the ghost branch first and the old glow code in its `else`; flag
  the prop by skin index (rigid skinning) so the bind-height dither does not eat a lantern carried low, and lift the
  prop in the ghost pose — at bind height it hung below the dissolved coat and read as a third leg.
- (Seeing a 1x GIF) Read shows only a GIF's first frame. `shots/char-moth/gifstrip.py in.gif out.png 3 12` (run via
  tools/remote.sh) tiles EVERY frame with its duration in ms — the honest way to look at a 1x real-time clip.
- (Remote paths) remote.sh syncs only `shots/*/*.py|js`; PNGs in shots/ exist remotely only where the render wrote
  them — crop scripts must read/write dirs that a remote render created (or out/sprites).

### skeleton-chef touch-up (point, ghost, ghost-spent, de-combat die) — 2026-10-16
- (point on a chibi carrying a two-hand prop) A straight pointing arm on a 0.95-arm chibi hides inside the carried basket
  at every facing (`shots/char-skeleton-chef/tu/c-pv.png`), and sliding the segments out of their joints (`.p`
  telescope, which works for a raised vote arm seen against the sky) breaks a horizontal arm into floating 1-2 texel specks
  at SE (`tu/c-p.png`). What reads: **scale the arm bones along their own length** — when the rest frames are character
  axes and the segment runs mostly along +z, `upperArmL.s [0.3, 0.3, 0.6]` + `forearmL.s [0, 0, 0.3]` gives one
  continuous, slightly thicker arm that clears the silhouette at SE/E/NW/W (`tu/c-pv3.png`); point.islands 1, key_speckle +0.
  S (pointing at the camera) stays a short nub — accept it, the game facing is SE.
- (ghost, crow scheme reused) The crow's lightness slope `(v − 0.12) · 1.55` saturates every tone above ≈ 0.75
  perceptual lightness to the ramp's white end: a white hat on a cream skull becomes one blob. For a character whose
  signature is two LIGHT parts stacked, use a gentler slope (`(v − 0.10) · 1.15`) so the cream skull stays one step below
  the toque (`tu/c-gh1.png`). Ghost-spent with head bowed + half-lid sockets lost the face entirely at S: keep the
  sockets nearly open (EYES −0.2) and bow ≤ 4°.
- (die de-combat) Swapping a gasp (wide sockets, jaw 34°) for half-lids + jaw 22° on the skull-lift key raised
  `die.key_speckle` +1 → +8 (half-shut sockets + a partly open tooth row = scattered specks); shut eyes with the jaw fully
  open (34°) came back to −1. Half-lids read on a big face key held 14 f, not on a 4-frame transit key.
- (process) `tools/remote.sh` only syncs `shots/<char>/*.js|*.py` at the top level of your shots folder; a helper script in a
  subfolder (`shots/<char>/tu/x.py`) is not found on the render host. zsh does not word-split `$var` in `set -- $c`
  loops: use `name:frame` pairs and `${c%%:*}`.

## Additions (char-snail t1 touch-up, Tinker Pell, 2026-10-16) — point / ghost / ghost-spent on a LIMBLESS body
Evidence: `shots/char-snail/t1/` (base vs pack2 A/B 0 px on every living render, s1/s2 8-facing sheets, night/, bake/).
- (Point without arms) A limbless snail points with its EYE STALKS: both swing ~66° forward and level, column leans and
  twists 26° to its left → at SE the goggles make a screen-horizontal stroke (pose_read 43 %). A tiny far-side paw jab
  is invisible at SE; don't count on it. The stalks are end-on at S/N/SW — acceptable because the game turns the
  avatar to the target (SE/E/W dominate).
- (Ghost signal = the halo bone) One bone does both jobs: the halo, buried in the head at 1/1000 scale, keyed `.s`
  +999 (ghost) or +1 (spent: still a speck, but its world scale/base = 2 marks "spent" for the shader). Appended LAST →
  index = array index, every living render 0 px different. No hover IK problem on a limbless legacy-Gait body (the
  hidden part-less legs absorb the idle IK), so `pos` y alone hovers.
- (Halo height vs stalk sway) Measure the halo against the highest pose of the clip, not the rest pose: 0.62 m above the
  head joint sat on the goggle tips at SE/E once the stalks swayed; 0.74 clears them at 8/8.
- (Ghost eyes) A wide stalk splay (18° out) turns the near goggle edge-on at SE and the luminance remap then flattens
  brass rim + cream eye into one pale nub; keep ghost stalks near the idle splay.
- (Droop vs face) Drooping stalks forward 30° for ghost-spent covered the face at S; 20° still reads "spent".

## Additions (char-toad t2 touch-up, Toadley, 2026-10-16) — point / ghost / ghost-spent (render-host RTX 4090)
Evidence: `shots/char-toad/t2/` (base-*/after-* A/B 0 px, zz-probe-z.png, zz-ghost8.png, zz-walk8.png, sheet-*-1x.png, bake-*.png, pack/report.txt).
- (Ghost by copy, 3rd port) frog's ghostFlag/halo recipe ported verbatim; only the halo rest/lift (inside a FLAT skull:
  rest y 0.14, lift +0.39 over the eye bumps) and the dither fade heights (≈ 0.48 / 0.36 / 0.23 · H) changed. Appending both
  bones LAST kept idle/talk/vote/die/excuse 8-facing stills at 0 px difference.
- (Point on a very wide chibi head) The head is 1.3× the shoulders: any arm with `out` < 60 hides behind the cheeks at
  S/SE. A 6-pose probe clip in a variant spec (`char=../shots/char-<id>/<id>_probe`, one candidate key every 10 frames,
  `frame=0,10,…`) settles it in one batch; fwd 60 / out 75 + chest −20 won (level stroke past the cheek at S and SE).
- (Bowed ghost-spent) A 14° head bow on a 2.3-head chibi hides the eyes at SE; 7° keeps them and still reads as "bowed"
  next to the live ghost's chin-up.
- (1x read of a held clip) Collapse a 1x GIF into its distinct drawings with on-screen ms (PIL ImageSequence, merge equal
  frames): one PNG shows the timing a single GIF frame cannot (`shots/char-toad/toad_tool.py gifsheet`).

## Additions (char-rabbit touch-up, Clover, 2026-10-16) — point / ghost / ghost-spent (render-host RTX 4090)
Evidence: `shots/char-rabbit/tu/` (z-new2 / z-ghost2 8-facing stills, s1x-* 1x frame sheets, bake-* crops, pre/ vs pack/ A/B).
- (Hover vs the reach dip, hopper with ghost legs) In a LOOP clip the gait re-plants its legs (here the geometry-less
  hop legs) and `_solveLegs` dips the hips by min(0.1 m, excess) — a 0.16 m and a 0.10 m hover rendered at the SAME head
  height. Measure the head y in the stage log (`h`) for two hover keys before trusting `pos`; push `pos` past slack + 0.1
  (here 0.19–0.30) so the dip is the constant cap and the bob survives (ghost 1.6 px, spent 0.9 px).
- (Point with a carried prop in the other paw, big chibi head) Straight-forward pointing hides the paw behind the snout at
  SE and in front of the bouquet at S. Pointing ~40° OUT to the free side (upperArm out 40 + a straightening forearm key
  from a node grid search of the paw tip) makes a screen stroke at 6/8 facings with no chest twist; turn the head toward
  the paw. A bent rest forearm needs the search — guessed triples curl the paw back into the chest.
- (Halo over long ears) Ears splayed outward in the ghost pose still reach into a halo placed 0.08 m over the rest ear
  tips at SE/E (camera pitch lowers it on screen); 0.1 m+ over the tips was clear at 8/8. Check E/W, not just S.
- (A/B without git) An untracked spec has no "before": a variant spec that imports make() and strips the touch-up
  (parts filter, delete material hooks/clips) rendered with `--q 'char=../shots/<you>/<x>_pre'` gives a same-session A/B;
  comparing against an older raw/ folder mixes in shared module fixes (FX/turn diffs up to 2 k px here).

## Additions (char-mole t1 touch-up, Old Delve, 2026-10-16) — point / ghost / ghost-spent, gentler emote (render-host RTX 4090)
Evidence: `shots/char-mole/t1/` (g8-p{A,B,C}-x4, g8-ghost{B,C,N}-x4, ghost-face-x8, f-*-1x strips, bake-ghost-x2), A/B vs `t1/base`.
- (Ghost on a DARK character) goat's luminance ramp (`#4E6C9C → #DCF4FC`, pow 0.42) turned the dark-mauve mole into a
  featureless blue teapot: eyes, goggles and nose all landed within one ramp step. Fix: darker low end (`#3A4C80`), pow 0.5,
  and keep 25 % of the living hue at the ghost value (`mix(g, c * lum(g)/lum(c), 0.25)`): pink nose, brass goggle rings
  and the apron read again at S/SE while the figure stays pale blue. Spent: desaturate 0.6 then ×0.62.
- (Ghost blink) A 2×2-texel blink is invisible under the pale ramp (ghost.key_delta 0 %): drop it or move something bigger.
- (Ghost at night) Without a self-glow the ghost goes slate on the night meadow; frog's `kNight` emissive (0.35 / spent
  0.16, halo 0.6) fixes it with zero effect by day.
- (Point with the free near hand) For a right-hand prop carrier the free LEFT arm is the near side at dir 1. Chest twists
  (±20°) swung the carried prop across the body at SE; NO twist + arm out 60° / fwd 100° gives a screen-horizontal stroke
  at SE with the prop silhouette intact (hidden only at E, the far side).
- (De-combat a tap emote) A hammer cocked over the shoulder reads as a swing even when it lands on the owner's own claw:
  start from the contact pose with the arm only ~20° higher (a lift, not a wind-up) and swap `hit@socket` (impact
  spark) for `sparkle@socket` (a "ting"). All ring rows stayed as before.
- (A/B for spec-only additions) Bone appended last + shader branch gated on its scale: 0 px differ on every living job
  (raw frames compared directly, `shots/char-mole/mole_ab.py.js <packA> <packB> clip-idle …`).

## Additions (char-owl r3 touch-up, Archivist Hoot, 2026-10-16 — point / ghost / ghost-spent)
- (Pale ghost without a tint API) Build GHOST SHELLS: copy each region's parts (same shapes, same cut-out face pieces) in a
  ghost palette onto a new bone at the region centre, built × 0.2 so the copy hides deep inside the body at rest; the ghost
  keys scale that bone × 5 (`<bone>.s` = 4) so the × 1.05 copy encloses the living body. Coincident surface patches (disc,
  iris) scale about the region centre; THIN parts (ear tufts, beak, sleeves) must scale about their OWN bbox centre (× 1.12–
  1.15) — about the head centre a tuft only slid outward and its brown edges showed at N. A second set = a second state
  (spent: dimmer, no halo). Replace the robe by a wisp-tail lathe (bell → hem band → cone curled back) for the ghost read.
- (Hover in a loop clip) Loop clips keep IK legs, and `_solveLegs` dips the hips by up to 0.1 m when the planted feet are out
  of reach — a hovering ghost sinks 0.1 m. Add exactly +0.1 to `pos` (the dip is capped, so it is constant); scale the feet
  away (`foot*.s` −0.95).
- (Hidden parts still change the LIVING look) look.js part-line ids need a unique (bone, slot) → id multiplier mod 156; 66
  pairs found none and the living idle lost 37 px of sleeve/robe inner lines. Keep pairs ≲ 55 (count them headless:
  `shots/char-owl/owl_pairs.js`), e.g. put un-keyed limbs on the torso shell bone. Always A/B the living clips with a
  variant that drops the new parts (`owl_wv.js wv=p`) AND with the previous spec copied into shots (`owl_r2.js`): the walk
  "diff" against an older pack was shared code changing between renders, not my spec.
- (Point at dir 1) A point straight along the facing (or 45° off it) is foreshortened toward the camera at SE and a navy
  sleeve merges with the navy robe. Point OUT to the side and up ([−0.9, 0.4, 0.25], chest yaw −20) → a horizontal line at
  S/SE/SW/N/NE/NW/W; only E hides it. Solve the 3 wing triples headless (`shots/char-owl/owl_point_solve.js`: grid upper arm
  → forearm → hand, then coordinate refinement; ≤ 1.3° per segment).
- (Non-violent die) Swap the hit/flinch key for a sway (heavy lids, head droop + roll, tufts sag) and drop `hurt`; the
  `hit@` event is the weapon slash spark — use `puff@<socket>` (dust) for a social accent like snapping a book shut.

## Additions (char-green-hood touch-up, Wisp, 2026-10-16) — point / ghost / ghost-spent (render-host RTX 4090)
- (Micro-geometry joint IN THE AIR is not invisible) A ×0.001 halo ring whose joint floated over the hood (crow's layout)
  changed 5 px in the vote turnaround and shifted FX by 26-144 px in talk/vote/glow (A/B vs the pre-touch-up spec). After
  burying the JOINT inside the hood and offsetting the ring geometry by +0.44/0.001 before the ×0.001 scale, every living
  clip was **0 px** different (idle, talk, vote, die, glow, walk noon+night, with and without FX). Rule: park micro parts
  inside an opaque mass, then A/B with a variant spec copied to `shots/char-<id>/<file>.js`. remote.sh syncs only one level
  deep, so `shots/<dir>/ab/x.js` 404s, and the imports need `'../../src/chars/…'`.
- (Ghost on top of an existing glow `tones` hook) Put the ghost branch first and splice the old hook string into its
  `else`. The glow slot (found by diffuse colour) becomes an emissive ice colour in the ghost, so the lantern eyes stay
  the brightest pixels in a dark slate void, like the v1 ghost row. A crow ramp light end of #EEF8FF washed a green hood
  near-white; #D6E6F4 keeps the shading steps.
- (Point gather key) A gather twisted toward the pointing side (spine+chest+head yaw +24) turned the face away at dir 1.
  Keep the summed yaw of the gather the same sign as the point's (−10). A hood peak keyed forward along the point works
  as a second pointer for a chibi whose mitt hides behind the hood at E/NE.

## Additions (char-chonk t3 touch-up, 2026-10-16) — point / ghost / ghost-spent on a ball goose (render-host RTX 4090)
- (Point on a ball body with flank wings) The NEAR wing at the game facing SE pointing forward lies across the front of
  the ball and vanishes; a level or low forward wing hides in the ball at SE. What reads: the FAR wing (left at SE)
  swung forward-UP past the beak ([fwd 110, tw 0, out 45], `wingL.s` y +0.5 to make a "finger"), body yawed toward
  the near side (−25°) and the head counter-turned. Sign check: a +Y yaw turns +Z toward +X (the character's left), so
  to lead with the RIGHT flank yaw +, LEFT flank yaw −. Probe 4 variants per batch as keys of a throwaway clip at
  f 0/10/20/30 and render each frame at 8 facings — 3 batches found it.
- (Ghost on a near-white character) honk's ghost recipe (buried halo bone = shader signal) ports unchanged; for an all-light
  body use √luma with a gentle slope `(v − 0.12)·1.2` onto a mid-blue → ice ramp, so the down keeps 3 steps and the grey
  wings stay a step below it. Appending the halo bone + a palette slot + material hooks left every living render
  0 px different (A/B of 7 stills × 8 facings).
- (Hover on the legacy Gait loop clip) Without `legs: 'fk'` the hover key needs +0.1 m for the leg-IK dip; scaling the
  shins −0.98 hides shins + feet (children) cleanly; the dissolve band covers the ball bottom.

## Archive — cast wave 3 per-agent notes (consolidated by the lead 2026-10-16)

Everything below (plus `## Author note (char-requin r1 …)` above, among the wave-2 touch-ups) was written per agent in
wave 3. The lead merged it on 2026-10-16: recurring lessons are the "(lead, wave-3 merge)" bullets in the topic sections
and the **R W3** lines in the playbook; shared-code items are in §Module backlog ("Fixed by the lead between waves 3 and
4", "Motion — new after cast wave 3", new rig/look/fx rows, T25–T31). Do not append here; write into the topic sections.

## Critic note (critic-polly r1, 2026-10-16) — 15/24, not shipped (render-host RTX 4090; evidence `shots/critic-polly/`)
- (Missing game clips) polly has no `point` and no `ghost` / ghost-spent clip — both are game clips (playbook Clocktower-only
  rule). The cast preset does not list them, so `cast_clips PASS` hides the gap; authors must add them from the rule, not the preset.
- (Beak = knob, not hook) a lathed/rounded ivory beak reads as a round nose at S/SE (`c-turn-s-e.png`); the v1 hook is a
  long down-curving wedge. A hooked beak needs a separate down-pointing tip part ≥ 3 texels below the upper mandible line.
- (Shirt glyph at 1×) a 3-D λ on a chest at 44 px breaks into 4-8 white specks on every walk drawing and becomes a dotted
  vertical white line edge-on at E/W (`dir2/clip-game.png`). Flat glyph: one plane, ≥ 2-texel strokes, cap drawn at S/SE only.
- (Wing tips in sh) wing primaries keyed out toward the camera render in the blue `sh` (#2E3874) at dir 1 → a navy stick
  that reads as a baton/club in talk and squawk (`clip-squawk.png` f14/f28). Twist the broad face to the light or lift sh.
- (Die at S) the on-the-back die reads as SITTING at S (`g8-die-f30-x4.png` cell 1): roll the body toward a side.

## Additions (char-honk t1 touch-up, 2026-10-16) — point / ghost / ghost-spent on a bird (render-host RTX 4090)
- (Goose point ≠ goose threat) A long-necked bird "pointing" with a low, level neck thrust IS the hiss/attack posture.
  Keep the neck upright and the head level (beak aimed), and let a WING be the pointer: the primaries straight as a finger.
- (Swinging a back-pointing wing bone forward) For a rest dir 'back' bone, `out` yaws the tip; past out 90 the tip faces
  forward, and then `fwd` + LIFTS the tip (the same rotation that drops a backward tip). [fwd −25, out 140] pointed the
  wing DOWN; [42, 0, 132] = forward-out ≈ 40° up. Reads at 6/8 (behind the neck at E — use the far wing? no: then SW/S lose it).
- (Ghost on a dark-headed character) The luminance ramp (goat's gamma 0.42, dark end #4E6C9C) turns a near-black neck
  navy; v1 ghosts are mid-blue there. Lift it: gamma 0.36 and dark end #5A78AA. Every living render stays 0 px (A/B).
- (LegGait loop clip + `legs: 'fk'`) On the bird LegGait a ghost loop with `legs: 'fk'` lifts the feet with the root
  (pos +0.16 → head +3.8 px, feet +7 px in the stage log); no +0.1 dip compensation needed (unlike the legacy Gait).
- (Detached feet in a short-shank walk) `islands` 1 → 3 in walk/game = the swing foot with no visible shank. Lengthening
  the visible shank from the lower 38 % to the lower 60 % of the knee–ankle segment → islands 1, no stilt look.
- (Process) zsh does not word-split `set -- $c`: wrap such render loops in `bash -c '…'` or every still renders idle:0.

## Critic note (critic-clarabelle, 2026-10-16, render-host RTX 4090) — 16/24, not shipped
Evidence: `shots/critic-clarabelle/` (cast pack 84 pass / 22 warn / 0 fail; `z-{vote,talk,moo,die}-g8.png` 8-facing keys,
`p` confirmed; `cl-game1x-track.png` 1× game GIF tracked; `cl-die1x-sheet.png`; `cl-sil-lineup.png` 25 % vs 19 cast).
- (Sheet claim vs render) The learning above says the vote paddle faces the camera 8/8. It does not: at SE (dir 1, the
  game facing) and E the card is edge-on, a 2-texel cream sliver hugging the horn/ear (`z-vote-g8.png` cols 2–3; the
  author's own `shots/char-clarabelle/z-g8c.png` row 1 shows the same). A card prop must be checked AT dir 1 first; turn
  the card with the hand twist toward the camera at SE (≈ +45–60°) and push it out past the head width.
- (Golden white hide) `sig_ground golden-sun` passes on the pink, but the lit hide goes peach (#F4A06F class) and with the
  pink snout she reads as a PIG in `scene-golden-crop.png`. Use `material.whiteKeep` (0.6–0.8) for white-hide animals.
- (Die monotonic) die:14 ("sits back", hips roll 30°) draws ≈ 5–6 texels TALLER than die:8 (knees buckled) at dir 1/E,
  so the 1× collapse reads buckle → hop up → flop (`clip-die.png` f16 vs f22). Every die key must be lower than the last.
- (Gimmick occluded) "Two things at once" in talk/moo lives in the LEFT hoof, which at SE is behind the body; at the game
  facing only one hoof gesture shows. Put the second action on the camera-side hoof or on the ears/tail at dir 1.
- The parallel-arm skip walk is the best thing here: 4/4 drawings, head bob 4.8 px, ears flap per drawing, nameable at 1×.

## Critic note (critic-cilantro, 2026-10-16, render-host RTX 4090) — 15/24, not shipped
Evidence: `shots/critic-cilantro/` (cast pack 83 pass / 21 warn / 0 fail; `z8-{vote-f12,talk-f0,talk-f6,die-f30,lookout-f30,
walk-d2,walk-d3}.png` 8-facing keys, `p` confirmed; `zw-d2-S.png` / `zw-d3-S.png`; `lineup-25.png` vs 26 cast).
- (Long neck foreshortens away at S in the walk) The ADD walk pump (neck +9 fwd on contact) plus the plan's lean/bob points
  the neck AT the camera at S: in `zw-d2-S.png` the head sits directly on the scarf ring (0 texels of neck; idle shows
  ≈ 10), d3 shows ≈ 3. Top-of-figure at S swings 169 → 161 px between drawings (8 px = 14 % H). A long-neck's pump must
  be checked at S/N, not only at the profile — pitch it in the neck's own side plane or cap it so ≥ 6 texels of neck show.
- (Spring chain vanishes in locomotion) `scarf0` (1 link, f 4, limit 30) trails back under the hoodie at 4 H/s: the
  hanging scarf end (a v1 identity element, ≈ 14 px at idle S) is only a green collar in every walk drawing at 8/8
  (`z8-walk-d2/d3.png`). Key the end in the walk clip (step, ≥ 8 texels down the chest) instead of trusting the chain.
- (Lifted `sh` with a hue step = a different animal in shade) hide sh #A47C70 passes `sig_ground` shade (+30 % L) but is
  mauve: the far leg/hand read as grey-pink trousers in sun (`z-turn-S.png`) and the whole giraffe reads as a taupe llama in
  the pillar shadow (`scene-noon-crop.png`, `scene-golden-crop.png`). Lift VALUE along the tan hue (≈ #B08850 class).
  Same for cream sh #B09A90: grey specks round the muzzle read as a beard at S.
- (Hidden legs on crouch drawings) The low walk drawing (`clip-game.png` f7/f23/f39) drops the hoodie hem onto the hooves:
  at dir 1 the giraffe looks seated every other step. A leggy character must keep ≥ 3 texels of shin visible in every drawing.

## Critic note (critic-progress, 2026-10-16, render-host RTX 4090) — Progress, 15/24, not shipped (author self-score 15, gap 0)
Evidence: `shots/critic-progress/` (cast pack 86 pass / 19 warn / 0 fail; `g8/z-{idle-f0,talk-f12,vote-f11,die-f50,step-f14}.png`
8-facing keys, `p` confirmed vote:3; `dir2/` walk+vote at E; `mine/face-S-SE-x8.png`, `mine/*1x-sheet.png` (1× GIF frames),
`mine/lineup-{S,SE,E}.png` 25 % vs 19 cast).
- (Croc maw at the game facing) The jaw modelled OPEN as a 0.34 m-deep dark box shows at SE as a long diagonal dark gash with
  the pink cheeks/tongue as dots along it = teeth (`face-S-SE-x8.png` right column; `clip-walk.png` every flight drawing). The
  v1 grin is a short front-only smile. At E/W the same gap wraps the whole head side as a dark band (`dir2/clip-game.png`).
  Keep the open mouth on the FRONT face of the head only (mouthIn depth ≤ 0.12 m, jaw sides closed) and check SE + E.
- (Grin chomps per step) The flight/contact head pitch flips how much mouth shows: at 1× the grin opens/closes every drawing
  (`mine/walk1x-sheet.png` 1 vs 2) = a chattering frog. Counter-pitch the head so the mouth area is constant across gait drawings.
- (Sleepy eyes) pupil = `dark` mid #5A2E40 covering ≈ half the 3×2 cream disc reads half-lidded/stoned at S and SE, not the v1
  bright white eye + black pupil. Use `dark` sh for the pupil, 1×1–2×1, and a bigger white (≥ 3×3) on the bump front.
- (Pennant edge-on at SE) the vote flag cloth yawed −35° is a stick + 1-px orange tip at dir 1 (`g8/z-vote-f11.png` SE,
  `mine/vote1x-sheet.png`) and the stick crosses the head/eye; at E the stick runs down through the torso. Yaw the cloth to face
  the camera at dir 1 and stop the stick at the fist.
- (Step emote hops in place) the "always takes a step" signature moves 0.1 m (≈ 3 texels): at 1× it is crouch → jump → land on
  the same spot; arms-V landing is hidden at SE/E/W (`g8/z-step-f14.png`). Make the landing a visible step FORWARD (≥ 0.3 m)
  with the arms V clearing the head width at dir 1.
- (Speech bubble gap) talk's first bubble dies at f12 and returns at f24 (`clip-talk.png`, `mine/talk1x-sheet.png` frames 5–6):
  the fx speech chain doesn't bridge the first beat. Module (fx).
- Good: the skip is game-speed correct (3.95 H/s, 0.289 s, 1.14 H/cycle, 4/4 drawings, head bob 6.6 px), pack bounces 30° per
  drawing pair at E, sig_ground 4/4. 25 % line-up: at S the two-bump rounded block is close to snail and frog (Croaksworth);
  at SE no bumps survive (blob). Die hold is a lump at N/NW/W and the pack reads as a hollow tan frame at SE.

## Critic note (critic-opal r1, 2026-10-16, render-host RTX 4090) — 16/24, not shipped
Evidence: `shots/critic-opal/` (cast pack 88 pass / 17 warn / 0 fail; `g8-{talk-f0,talk-f6,talk-f12,vote-f20,die-f40,optimize-f6,
optimize-f22,optimize-f36,idle-f50}-x3.png` 8-facing keys; `dir2/` walk+die; `c-E-head-x6.png`, `c-S-x6.png`, `face-talk*-x8.png`;
`gs-{talk,die,optimize,game}.png` = 1x GIF frames with durations; `lineup-25.png` vs 23 cast).
- (Profile eye placed mid-skull) A wide lathe head with the eye joint "on the surface, 19° to the normal" puts the E/W eye
  ≈ 6 texels behind the muzzle in the middle of the skull disc, and the far eye leaks as a 1×3 dark column at the muzzle
  root (`c-E-head-x6.png`, `dir2/clip-game.png`): the profile reads as a ball with a one-eyed cyclops face plus a cream plate
  stuck on. For a broad-headed animal, judge the eye at E/W, not only S; move it forward toward the snout (v1 E: eye touches the muzzle).
- (Nose = open mouth at S) A 4×2 dark nose block centred under the eyes reads as a permanently open "O" mouth at S
  (`c-S-x6.png`), while the real jaw (14°) never shows a texel in talk (`face-talk0-x8.png`). Small nose (2×1) up on the pad,
  mouth as a separate line that the jaw visibly opens ≥ 2 texels.
- (Emote punchline = a talk drawing) optimize f22 uses the exact talk f12 arm (upperArmR [40,0,115], forearm −110): the
  signature reads as "talking" at 1x. Taps that return the paw to the rest hug are invisible (f6/f14 ≈ f0 at S); a tap needs
  the paw visibly up (≥ 4 texels above the pebble) on the drawing BEFORE the contact.
- (Thick tail = third leg at N) a tail with leg-width, leg-tone and a downward exit reads as a kicked leg from behind
  (`c-turn2-x3.png` N/NW); taper it hard and keep it low along the ground like v1.

## Critic note (critic-preservation, 2026-10-16, render-host RTX 4090) — Preservation, 15/24, not shipped (author self-score 18)
Evidence: `shots/critic-preservation/` (cast pack 82 pass / 21 warn / 0 fail; `z-turn-{S-SE-E,NE-N-NW}-x5.png`,
`g8-{talk-f0,talk-f6,vote-f20,invariant-f16,invariant-f26,die-f50}.png` + `z-g8-keys-x4.png`, `z-{game1x-sheet,talk1x,vote1x,
die1x,inv1x}.png` = 1x GIF frames with durations, `z-vote-hold-x10.png`, `dir2/` walk/vote/die at E, `z-sil-lineup-{S,SE}.png`).
- (Placard reads as an axe) a 0.30 × 0.25 card on a 1-px dark stick, foreshortened at dir 1 with a diagonal dark τ stroke,
  reads at 1× as a hatchet held over the head (`z-vote1x.png`, `z-vote-hold-x10.png`) — a weapon read in a no-combat game. At
  E/W the card is edge-on: a bare stick poking up through the face (`dir2/clip-vote.png` f11, `z-g8-keys-x4.png` row 3).
  Hand-held signs must face the camera at every facing (billboard yaw or a thick card ≥ 3 texels deep) and show the fist.
- (Profile loses the frog) at E/W the wide head becomes a tall thumb/egg with the glasses as a dark vertical scribble on its
  front edge; no eye bump, no forward mouth (`z-turn-S-SE-E-x5.png` E, `dir2/clip-game.png`) — v1 E has a bump on top and a
  smile reaching the snout. Judge the face at E/W, not only S/SE.
- (Rigid hop = bobbing block) "upright rigid metronome" + legs inside the body: at E no leg ever shows, at SE the touchdown
  drawing is a seated block. Rigid can stay, but the legs must visibly fold and extend (≥ 3 texels of leg in flight).
- (Pupil glyphs) a 2×2 pupil inside a 4×4 lens re-rasterises into letter shapes (0, D, R, C, 8) every drawing and between idle
  keys (`clip-idle.png`, `clip-game.png`): pin the pupil to the lens centre (1×1 or 2×2 on a fixed texel), or no pupil.
- (Emote fine detail invisible) the glasses-push hand never reads at S/SE (`g8-invariant-f16`), and the star pops above the
  head, not at the glasses. The stop-motion 360° spin itself reads well at 1× and is the right joke.
- Good: game speed exact (3.95 H/s, 0.289 s, 1.14 H, 4/4 drawings, apex ≈ 11 texels with a detached shadow), sig_ground 4/4,
  glasses + smile + scarf read at S/SE/SW, talk mouth ≥ 2 texels. 25 %: at S a two-bump box ≈ progress/toad/frog.

## Critic note (critic-requin r1, 2026-10-16, render-host RTX 4090) — Requin, 16/24, not shipped (author self-score 15, gap −1)
Evidence: `shots/critic-requin/` (cast pack 83 pass / 25 warn / 0 fail; `z8-keys.png` = talk f0/f6, vote f20, personal
f12/f24, die f50 at 8 facings; `z8-walk.png` = the 4 game-speed drawings at 8 facings; `z-face-SSESW.png`, `z-face-keys.png`,
`z-action-keys.png`, `z-game1x-track.png` (1× GIF frames tracked), `z-lineup-{S,E,N}.png` (25 % vs 21 cast members)).
- Good: unmistakably the v1 shark (blue egg, flat beret, red neckerchief, white belly, bomb on the left fin); at E/W the dorsal +
  crescent tail give a jagged back nobody else in the cast has. The walk is a readable swaggering skip at 5.37 m/s (0.267 s,
  4/4 drawings, bob 2.5 px): the bomb swinging ≈ 6 texels per drawing + tail S-wave carry the rhythm at 1× (`z-game1x-track.png`).
- (Lit eye reads blank / X) eyes share the `dark` slot whose hi `#7A6E88` is a light lilac: on the lit side the eye turns into
  a pale square with a dark corner and the glint makes a "+" (`z-face-SSESW.png` S, `clip-turn.png` f48–f108 at SW) — reads
  as an X-eye/scar, not a friendly eye. Eyes need their own slot (or a darker hi); never a lit "dark".
- (Grin lost its red) v1 mouth is maroon `#4A1C2C` with a white zigzag; here the mouth interior uses the purple-grey `dark` slot,
  so at SE (the game facing) the grin is a dark smear beside the scarf knot, half-covered by the bomb fin.
- (Speech bubble gap, fx) the first talk bubble dies at grid 11 and the chain only restarts at the 2nd beat: white bubble px
  13, 51…49, 22, then 0 for grid 12–23 (0.4 s), then steady (raw/clip-talk). `fx.speech.chain` should extend the FIRST bubble.
- (Punchline face hidden) personal f12 "shrug": at SE/E/NE the head pitch shows the beret top, not the face (`z8-keys.png` row 4);
  the shrug fins only read at S/SW.
- (Sheet ≠ code) die "bomb clasped on the belly": the held die pose has the bomb raised off the fin tip at S/SE/E (`z8-keys.png` row 6).
- Run (optional): the bomb hides behind the body in 3/4 drawings and the spark floats alone by the snout (`clip-run.png` f9/f13/f21; run.islands 2).
- Golden: belly white goes peach (`scene-golden-crop.png`) — push belly hi toward magenta (W2 rule).

## Critic note (critic-mincut r1, 2026-10-16, render-host RTX 4090) — Mincut, 17/24, not shipped (author self-score 16, gap −1)
Evidence: `shots/critic-mincut/` (cast pack 83 pass / 22 warn / 0 fail; `mc-turn-{S-SE,N-NW}-x6.png`, `mc-g8-keys-x4.png` =
vote f20 / talk f0 / talk f6 / die f50 at 8 facings, `mc-g8-snip-x4.png` = snip f12/22/27/45, `mc-vote-g8-x6.png`,
`mc-face-talk-x8.png`, `mc-game-x4.png`, `mc-game1x-sheet.png`, `mc-sil-lineup.png` (25 % vs 20 cast), `dir2/` walk/vote/die).
- Good: clearly the v1 red panda at S/SE/E/W (white mask, tear stripe, white-rimmed ears, ringed tail, dark limbs). Walk at
  5.06 m/s reads as a scurry at 1× (4/4 drawings, head bob 3.1 px, legs visible, tail bands shift, ears flop). Holds are clean
  (nofx vote/die: 0 px after the last key), die is down by f18 (0.6 s), ground separation PASS in all four sig_ground rows.
- (Tail hidden at S, N, thin at SE) the C-curl goes straight back, so at S and N it is behind the body: the 25 % S/N blob is a
  round head + two ear nubs = preservation/toad (`mc-sil-lineup.png`); at N the tail is a muddy patch of 6+ tones on the rump
  (`mc-turn-N-NW-x6.png`), at SE (game facing) a 4-texel strip. v1 shows the tail beside the body at S and filling the back
  at N: swing the root out to her left (≥ 0.15 m x) so it leaves the body outline at S/N/SE.
- (Vote arm = a stick) the 1.95× stretched arm with a counter-scaled paw reads as a dark twig/antenna, not a raised paw; it is
  level with or below the ear tops at E and NE (−1…−1.5 texels) and ≈ 3.6 texels over the near ear at SE (`mc-vote-g8-x6.png`).
- (White mask speckle) brow spots + cheek patches break into separate 1–2 texel white dots that hop with every walk bob
  (`mc-game-x4.png`, sig.white isolated [10,6,5,1,4,4,5,4]); merge each brow spot into one ≥ 2×2 patch adjoining the eye.
- (Die sits at W/SW) the final pose reads upright at W and SW (head on top, tail on the grass), a leg sticks up at N/NW
  (`mc-g8-keys-x4.png` row 4).
- (Snip emote reads as a T-pose / arm-cross) open = arms straight out sideways at 8/8, shut = arms crossed on the chest;
  nothing says "link" or "scissors" at 1× (`mc-g8-snip-x4.png`). A small chain-link / scissors story prop would carry it.
- (Walk far arm) at SE the swinging right arm sticks out horizontally ≈ 6 texels as a dark twig in 2 of 4 drawings.

## char-clarabelle round 2 (2026-10-16, render-host) — fixes for critic 16/24
- (Card prop facing) To aim a flat vote card at the game camera, raise the arm nearly vertical first (upperArm fwd ≈ 165,
  out ≈ 25) so the stick is the twist axis, THEN sweep the hand twist with a variant spec (`vote=` JSON override, 4–5
  values, one `grid=turnaround` still each). With the arm out 35–58 the stick lies sideways at SE and no twist shows the
  face. Clarabelle: twist −38 → face-on at SE (`shots/char-clarabelle/r2/zsv-t-38.png`).
- (whiteKeep) `material.whiteKeep 0.8` + a neutral hide hi (#F2EEF0) keeps a white cow white at golden; a pink snout
  still goes salmon (#F29C73) there — cooling the pink only moved dH 44 → 48.
- (Die monotonic) Measure the head-top row per facing for every die key (`shots/char-clarabelle/clara_tops.py` on the
  g8 stills); a "sit back" key needs pos y ≈ −0.4 with knees 68 to sit below a −0.14 buckle on a chibi.
- (Turn audit) A `clip-turn.png` redraw after the facing is reached is not always settle: the idle loop keys (ear
  flick f18, tail f30, breath f36) land in the same window. Count leg steps from the raw log `fp` (feet planted) field
  (`clara_log.py`) before blaming the gait. stepYaw 90 / stepTol 0.12 cut recovery steps 6 → 5.
- (Sideways ears) Long (0.40 m), drooping, half-back ears (dir [0.72, −0.35, −0.6]) break the outline at all 8 facings;
  0.30 m at 45° back left only a nub at E/W.

## char-cilantro round 2 (after critic 15/24; render-host RTX 4090; pack `shots/char-cilantro/final3/`, 83/21/0)
- (Long neck at S) Measure the neck at S, don't eyeball it: `shots/char-cilantro/cil_neck.py` counts rows between the
  lowest cream (muzzle) row and the scarf top at the S cell of `grid=turnaround&clip=walk&frame=k`. Forward pitch on
  contact (+9) plus a head counter-nod hid the neck behind the muzzle (0–3 texels). These fixed it (8–10 texels in every
  drawing, head_bob 5.5 → 1.2 px): pitch the neck BACK slightly on contact (−4) with a sideways sway (±4 toward the stance
  side; that reads as a lope at S without shortening the neck), head tipped up 3, an ADD-clip `pos` +0.025 on the
  contact drawings (cancels part of the plan's touchdown dip), `bob` 0.035, `lean` 2, `holdDrop` 0.05.
- (Spring chain at 4 H/s) A 1-link chain lags about 2ζ/(2πf)·v ≈ 0.2–0.3 m at game speed, so it sits at its `limit` behind
  the body: the scarf end was hidden under the hoodie. Key the chain bone forward in the walk ADD clip (`scarf0` fwd +22,
  ±4 swing per contact) and cut `limit` (30 → 16). The chain's target is the KEYED pose, so the trail cancels the key and
  the end hangs down the chest in every drawing at 8/8.
- (Shadow tone hue) Lift `sh` along the slot's own hue (hide #B27C42 hue 31°, not #A47C70 mauve). sig_ground passes either
  way. Only the eye check on scene-noon/golden-crop catches the "grey llama in shade". Patch/cream sh likewise.
- (Grey beard) The ring of grey texels round a cream muzzle is FLAG_CHAR inner lines. outline.js tints them toward
  blue-grey, so they read grey on cream. Two fixes worked: `material.merge` {jaw/eyes/ears → head} (same-slot parts share
  an id, so no line) and sinking proud detail boxes (nostrils) almost flush (0.015 → 0.005 m proud). The line under the
  nostrils then disappeared (`shots/char-cilantro/r10/z-face2.png`).
- (Variant A/B fast path) `char=../shots/char-<me>/<file>` for shot.sh takes the path WITHOUT `.js`; the copy needs its
  kit import rewritten to `../../src/chars/kit.js`. Four die-head variants on one 8-facing still each picked the die face
  in one round. Half lids (eye y −0.55) still read as a 1-texel dash at 1x, but a full BLINK disappears.

## progress (r5–r7, critic fixes)
- A modelled-open mouth must be closed on the SIDES: a dark box spanning the skull width shows as a band at E/W and a
  "crocodile maw" at SE. Close the skull↔jaw gap with mirrored skin side hulls (a convex hull cannot hold the front
  notch) and keep the dark only in the skull's front face, ≤ 0.1 m deep.
- Grin "chatter" at 1× comes from body PITCH changing per gait drawing, not the jaw: counter-pitch the head so the summed
  hips+spine+chest+head pitch is equal on contact and flight.
- Raised arms (pose triple q = qFwd·qOut·qTwist): once `out` > 90 the arm points up, and a positive `fwd` tips it BACK.
  Use negative fwd to bring a raised V toward the camera. Short chibi arms under a 0.78 m head need limb `.s` stretch
  (≈ 0.4 / 0.9) for a ta-da V to clear the head at E/W.
- A frog-shaped die reads better flopped BACK on its pack (face + belly up for every camera above) than on its side.

## Additions (char-polly r2, Polly the Polymorphic Parrot, 2026-10-16) — critic 15/24 fixes (render-host RTX 4090)
Evidence: `shots/char-polly/` (report 98/24/0, lineup25*.png, gs-*-1x.png), `shots/char-polly/r3/` (probe sheets s-*.png, g8a/g8b, ta3, turn).
- (Paddle orientation) `paddle(u, …, side)` puts the WIDTH along cross(side, u). With side = X and a tail running back/down,
  the width lies in the YZ plane, so from N/S the tail is a 1-px stick. For a tail that must be broad from behind use
  side = cross(u, X) (width along X, thickness along the plane normal) — at N it became a 4–5 texel wedge.
- (Decal glyph on a barrel) A shirt mark built from proud boxes (+0.004 m) draws a dotted line on the chest edge at
  profile and re-rasterises as specks on every walk drawing. Cutting the glyph OUT of the subdivided lathe surface
  (centroid-in-stroke predicate, distance to two segments < 0.025 m = 2-texel strokes, |x| ≤ 0.08 on a 0.21 m chest)
  gives one stable glyph at 1× and nothing at E/W. Same trick as the eye patches.
- (Hook beak at S) A forward hook only leaves the HEAD contour at S (it hangs over the tee); the 25 % S silhouette stays a
  capsule. Projection rule at 30° pitch: forward depth reads as screen-down, so a hook tip 0.1 m lower and 0.1 m forward
  lands on the chest, not outside the figure. To change an S silhouette you need width (wing tips, crest), not depth.
- (Tail sweep vs facings) Sweeping a midline tail 22° to the character's LEFT hid it at SE (the game facing); 40° to the
  RIGHT keeps it at SE (trailing off screen-left like v1 SE) and adds it at N/NE/W. At S it still hides behind the wing.
- (Edge-on wings) A thin (0.06 m) wing paddle in the side plane becomes a 1-px navy stick whenever a gesture swings it
  toward the camera; 0.085 m thickness + a broad primary tip (half-width 0.05) + a lifted blue sh made every gesture a
  ≥ 3-texel paddle. For talk, twist −50 with out 62 + forearm 30 shows red/yellow/blue at dir 1 (probe of 4 triples).
- (Squawk V) out 132 (42° above level), fwd 0, twist −90 reads as a V at S/SE/N/NW/SW; r1's out 122 + fwd −22 read as a
  T-pose. The far wing at dir 1 remains a paddle above the head (no fix found without a chest yaw).
- (Die that reads as lying) Rolling the hips 75–82° about Z (`hips [−15, 0, 75]`, root x −0.3 to recentre, head
  [10, −15, −10]) puts the long axis horizontal at S/SE/SW with the shut face toward the camera; a backward fall on a
  chibi reads as sitting at S. Probe 4 final poses as keys of a throwaway clip in a variant spec (`pv.js`).
- (Recessed blink patch) A shut-eye patch recessed 0.009 m and only 1.3× the pupil hole let the background show through
  at SE (one green pixel in the die face); 1.6× closed it.
- (Ghost port) crow's ghostK/halo shader recipe ported with: halo joint INSIDE the skull + ring offset (green-hood rule),
  bind-height bands for a short-legged bird (discard < 0.09, checker < 0.16, mist < 0.22/0.32), and the crest laid flat
  (+34°) in the ghost keys — at −10° the pale crest tip touched the halo and read as a stick holding it.
- (Process) The cast preset does not include point/ghost/ghost-spent: pass `--clips idle,walk,run,talk,vote,point,die,
  <emote>,ghost,ghost-spent` to charpack and bake, or the missing clips are never checked.

## Author note (char-requin r2, 2026-10-16, render-host RTX 4090) — pack 81 pass / 26 warn / 0 fail
Evidence: `shots/char-requin/` (cast pack `--raw`), `dir2/`, `r2/z-face-{a,b,c}.png`, `r2/z-game1x-strip.png`, `r2/scene*/`.
- **Bead eyes need a DARK hi.** An eye slot whose hi is a light lilac (#7A6E88) turns into a pale square with a dark corner on
  the lit side; with a glint it reads as a '+'/X-eye. Cap the hi of the eye slot at about #4A4258 (requin: shared with the bomb).
- **Talk at the game facing: twist the head TOWARD the camera.** Positive twist turned requin's face away at SE (judge on the
  8-facing still, don't guess the sign); −12 head / −8 chest plus the prop fin carried low and out shows the full grin at SE.
- **Vote with the identity prop, not a conjured one**: an authored-at-4 % prop pops in. To lift a short fin above the head,
  add `upperArm.p` +0.08 (shoulder shrug) and bend the wrist out so the fuse/spark faces the camera (wrist in hid the bomb).
- **Golden near-white:** `material.whiteKeep` does nothing on the pixels a `material.slots.<x>.lift` raises (lift 0.35 belly
  stayed #F1B889 with whiteKeep 0.7 and 1). Lower lift (0.18) + a cool/magenta MID (#E6DCF4) → #E3B9B3 (pale rose), noon
  belly still white, sig_ground unchanged. Module issue (below).
- **Key the hat on the walk drawings**: beret roll ±10° with the hips yaw + `beret.p` ±0.03 lag is visible in the onion and
  the 1× strip at no charcheck cost (walk/game WARNs unchanged).
- Module issues found: (1) charcheck `check_clip` crashes (IndexError at `isl[0]`) when an FX is visible on EVERY captured
  frame of a clip (steady talk bubble from f0) — workaround: first `speak` at f2. (2) a chained speech bubble starts at
  drawing 3 (small) instead of full, so each extra beat re-pops the bubble briefly. (3) whiteKeep vs slot lift (above).

## mincut round 2 (critic 17/24 → fixes, 2026-10-16)
- (Side tail visible at the SE game facing) At dir 1 her LEFT points screen-right AND away; a tail running out-and-back
  (any θ ≥ ~15° back of +X) goes straight behind the big chibi head at SE. What works: a LOW, WIDE 3-D C — base out-and-
  back (shows at E/N), upper half curling FORWARD and up only to chin height (y ≤ 0.69 m, under the head), plus a dark
  ring band on the TIP so the part that pokes out right of the face reads as a ringed tail, not a cheek. 6/8 facings out
  of the outline (E hides it). Sway keys must stay on the side that swings the C OUT (here negative `out`); the
  positive half tucked it behind the head at SE in the turnaround still.
- (Hidden story props without module support) Build the prop at TINY = 0.001 scale (geometry AND child-bone offsets
  × TINY) on its own bone and show it with `'<bone>.s': [999,999,999]` (1399 for 1.4×) only on the keys that use it
  (fox ghost-shell trick). Zero-filled keys keep it hidden in idle/walk/talk/die automatically; `.p` offsets on a child
  of a shown bone are also × TINY (they are scaled by the parent). A hand-held prop on a chest bone stays glued to the
  paw only while the arm keys equal the pose it was placed for (keep one `CHAIN_ARM` constant).
- (Scissors that read at 1x) Two 2-texel steel blades + a blade bone at the pivot; open with `twist` (not `out`/`fwd`) when
  the forearm is twisted −75: that plane faced the SE camera (A/B of 3 axes, `r2/z-wv-open.png`). Open 45 / shut −6.
- (Vote over the ears) Measure on the 8-facing still, not a probe: top steel row vs top white ear row per cell
  (`shots/char-mincut/mincut_vclear.py.js`). Chibi arms are ~0.45 m: straight up + 20° out with the upper arm 1.5× long
  and 1.2× thick, a 0.3 m prop, ears tucked −12 → 9–18 texels clear at 8/8. A chest twist toward the arm side PUT the
  arm level with the ears at E/NE — drop it.
- (Die never reads as sitting) A body lying straight along one axis foreshortens at the facing that looks down that
  axis, and the elevated camera then stacks head-on-body = "sitting" (W/SW). A CURLED pose (hips −90 roll, spine+chest
  60° curl, knees to chest) is a low mound at all 8 facings; rotate the face toward the game camera with head `fwd`
  (after the roll the head's fwd axis is world-vertical: fwd −70 turned the face to SE).
- (strobe from FX) `strobe` does not exclude FX: an emote glyph fading on 2 frames + a prop change on the frame between
  = 3 consecutive changes (FAIL). Put the prop change on one of the glyph's frames.
- (Shade hue) A fur sh drifting toward pink turns salmon in the pillar-shadow copy; lifting it at the v1 hue (#B86A4C)
  fixed the read and raised noon-shade from +15 % to +27 %.

## preservation round 2 (critic 15/24 → fixes, 2026-10-16)
- (Pupils that re-rasterise into letter glyphs) A 2×2 pupil in a 4×4 lens changes shape on every sub-texel move. Fixes
  that held: (a) idle breath = a RIGID whole-screen-texel drop (`pos` y in multiples of 0.02778/cos 30° = 0.0321 m) with
  NO chest/head rotation; (b) the walk clip KEYS `pos` (it replaces the hop arc) in whole screen texels (−3/+5/+10/+5);
  (c) a 1×2 centred pupil. Idle keys and all 4 hop drawings now show the identical face (`z-cgame1x.png`).
- (Legs that never show in a hop) In `plant: 'hold'` the swing foot height is `lift + hop`·sin πu, so the feet rise WITH
  the body and the leg stays folded. A NEGATIVE walk `lift` (−0.07) puts the swing feet under the stand height → IK
  straightens the legs in rise/apex (feet hang 4–6 texels below the body). Also raise the body bottom (0.13 → 0.17 m) or
  the pear hides the shins at E/W.
- (Two eye bumps at E/W = a tall thumb) The camera's 30° pitch lifts the FAR eye bump ~0.19 m (7 texels) above the near
  one at E/W. What helped: bumps forward on the crown (z 0.04 → 0.11), lenses toed out 30° (near ring reads as a ring),
  a deeper occiput (extra skull rings back to −0.30) so the head is deep rather than tall, snout overhang on the upper
  skull only (moving the JAW forward hid the scarf at S under the camera pitch).
- (Held sign that reads as an axe / a stick through the face) Chibi arms cannot lift a prop past a big head: scale the
  upper arm on the raise key (`'upperArmR.s'` 0.6 = ×1.6, prop `sign.s` divided by the same factor). Arm [188, 0, 20]
  (just past vertical, slightly out) puts the prop above the occiput at E/W, clear of the glasses. A thick slab (≥ 0.17 m
  deep) is never blade-shaped; a τ on ALL FOUR sides of a cube read as two dark eyes (a skull) at SE in 1× — glyph on
  front/back only, hand roll −22 to stand it upright, twist −30 to face the SE pack facing. A handle in a signature
  colour (knit yellow) reads as a held stick, a 1-px dark one as an axe haft.
- (Glyph FX at a socket) `emote:<glyph>@<socket>` draws ≈ 0.14·H + 5 screen texels ABOVE the node; put the socket that far
  under where you want the glyph (preservation: 0.30 m under the right lens → the star lands on the lens).
- (Rotation order for arms) q = qFwd·qOut·qTwist: `out` is applied first, `fwd` last about the parent X. [fwd, 0, out]
  with fwd > 90 swings an out-raised arm BACK toward the side, not forward; probe with a variant spec + 8-facing still
  (`shots/char-preservation/wv.js` takes `ck/kf/kp` JSON overrides for any clip key) before reasoning about angles.
- (Die that reads as standing at S/N) roll the plank topple (`hips` [−a, 0, ±38], roll applied before the pitch; root
  offset = h·(sin r, cos r cos a, −cos r sin a) − (0, h, 0)) so the lying body is diagonal; pick the roll sign that keeps
  the pack facing (SE) side-on (A/B `r2/die-ab.png`). Hide hanging chain ends in the hold with `'<chain bone>.s'` −1.

## char-opal round 2 (2026-10-16, render-host RTX 4090) — fixes for critic-opal r1 (16/24)
- (char-opal) **A "cyclops eye" mid-skull at E/W can be the EAR, not the eye.** A small dark-slot ear low on the side of a
  wide chibi head is seen face-on at profile and reads exactly like an eye, while the real eye (x inside the whisker
  pad's half-width) is hidden behind the pad. Check with a part-drop variant (`shots/char-opal/opal_pv.js`, `&drop=ear`)
  before moving eyes. Fix: eye joint OUTSIDE the pad's half-width and above it ([±0.18, 0.28, 0.211], yaw 28°), ears on
  their own bones on the crown corners in the FUR slot + `material.merge` (`shots/char-opal/r2/E-head-x6.png`).
- (char-opal) **A wide eye box on a curved head pokes its inner corner out of the skull** and the FAR eye then shows over
  the brow at profile (elevated camera: the far side projects higher). Sink the box (EYEC z −0.017) rather than
  narrowing it — 0.075 wide made the eyes 1-texel slits at S.
- (char-opal) **Drawn-on mouth plate beats a jaw hinge on a chibi pad.** A 14–26° lower-lip jaw shows ≤ 1 texel at S
  (camera looks down onto the pad). A `mouth` bone (dark 'eye'-slot box on the pad front, `sides: 'mid'`) scaled open by
  `'mouth.s': [0.25, 1.9, 0]` gives a 2×1 closed line and a 2–3 texel open mouth at S/SE/SW. Do NOT add a hidden dark
  cavity box behind the lip: it peeks out under the chin as a collar line at S.
- (char-opal) **Tap emotes: judge fx=0 stills.** The r1 taps returned the paw to the rest hug and only the spark changed.
  Up drawing = paw cocked beside the cheek (upperArmL [90,0,30], forearmL [-60,0,0]); contact = paw on the prop + body
  dip 0.05 + head nod. And `hit@<socket>` spawns at socket + weapon blade × 0.6 × 0.85 (0.51 m forward!) unless the spec
  sets `fx.sockets.<socket>.length: 0`.
- (char-opal) **A 1-texel-thick stand tail can't break the S and SE outlines at once** — measured sig.tail S/SE: out
  −10/−35 → 34/6, −22/−40 → 22/13, −40/−30 → 6/28. Pick per the critic's weakest facing; walk keys cover SE.
- (char-opal) **Die on the back reads "seated" at the facings the body axis points at the camera.** Rolling the hips
  (out −80 with fwd −70) puts the body across the screen at S/SW; tail droop +60 lays it past the feet so N/NE are not
  a featureless ball. E/W then foreshorten — a diagonal is the best single compromise.
- (char-opal, tools) `charcheck.py` crashes (`check_clip` islands: `isl[0]` IndexError) when a clip shows FX on frame 0
  AND every changed frame (talk with speak beats every 6 frames from f0). Workaround: first speak event at f2.
- (char-opal) Moving legs to the dark slot (value separation from a same-slot tail) costs tone count (dark 7 → 12);
  dropping a slot lift raises that slot's tone count (pebble 6 → 10).

## critic-theo-rem r1 (art director, 2026-10-16, render-host RTX 4090) — 17/24, not shipped
Evidence: `shots/critic-theo-rem/` (full `--preset cast` pack, report 117 pass / 18 warn / 0 fail; 8-facing key stills
`g8-*.png` + ×3 crops `z-g8-*.png`; tracked 1× game GIF frames `z-game1x-track.png`; 25 % line-up `z-lineup25.png`).
- (critic-theo-rem) **A dense lat/lon spike grid is not a hedgehog outline.** 72 short pyramids raster to 1-px cream
  dots on the rim (fuzzy halo) and to a dark-hooped grid on the back: at N/NE/NW the shadowed row seams form "^ ^ / ‿"
  arcs that read as a sleeping face on a barrel (`z-turn-ne-n-nw.png`); at 25 % the body is a plain disc on a stalk
  (≈ preservation / opal S). v1's identity is a 13–15-tooth SAWTOOTH outline (2–3 px triangles). Fewer (≈ 10–14 per
  silhouette ring), longer (≥ 0.22 m) outline quills and a smooth back with 2–3 painted quill strokes would read better.
- (critic-theo-rem) **Spectacle rims on a profile face can hide the nose.** At E the left rim sits on the snout line and
  the black button nose never shows (W shows it, 2 px): the v1 profile = nose tip past the outline. Check E AND W.
- (critic-theo-rem) A 2×2 eye inside a 5-texel ring rasterises as a "+" crosshair at SE (talk f0, vote f0).
- (critic-theo-rem) Point with the LEFT (camera-side at SE) arm aimed forward vanishes at W (0 texels outside) and SW
  (≈ 2): the far arm goes behind the ball. A ball body needs the pointer out to the SIDE ≥ 45° (or switch arms by facing).
- (critic-theo-rem) whiteKeep 0.8 + whiteKeepLift 0.8 did not keep a cream face (#F8E6C2) cream at golden: it renders
  apricot (`scene-golden-crop.png`) — cream is not caught by the white gate; push the hi toward magenta or treat as a module item.

## critic-storyteller r1 (art director, 2026-10-16, render-host RTX 4090) — Storyteller, 18/24, not shipped (author self-score 17, gap −1)
Pack `shots/critic-storyteller/pack/` (idle,walk,run,talk,vote,point,die,chime,appear,turn; 104 pass / 28 warn / 0 fail,
page_errors 0), 8-facing key stills `shots/critic-storyteller/x3-g8-*.png`, 1× GIF sheets `s-clip-*-1x.png`, line-up `lineup25-color.png`.
- (critic-storyteller) **A tall figure breaks the 7+1 turnaround grid.** The SW cell sits under S, so its crop shows S's gold
  hem + staff at the top: `turnaround.png` SW "94 px", `height_px` max 97, `islands` 3 at SW are a TOOL artefact, not the
  character (author's p3 has it too and missed it). Grid spacing must follow `spec.height` (tools).
- (critic-storyteller) **A plumb staff in the LEFT hand hides behind the hood at W/SW**: silhouette W shows no staff above the
  hood, `sig_outside.clock` SW 0 px, the clock goes edge-on (yaw −35°) to a gold sliver at SW/W/E (turn f12, f40–49). A yaw that
  is face-on at SE always leaves 2–3 facings edge-on; a ball finial or a thicker rim would keep the disc.
- (critic-storyteller) **Point = lantern swung out 55° to the SIDE**, not toward the faced target: at E/NE it is inside the
  outline (`x3-g8-point-f30.png`), at S it aims at camera-left. A host "shining the light on someone" should reach forward.
- (critic-storyteller) **Walk "staff plant" is a swing**: at the left contact the staff TOP leans forward and the tip is behind the
  body (`x3-g8-walk-k0.png` E/NE) — a pole-vault push-off, the opposite of a plant ahead of the step.
- (critic-storyteller) **Glide (run) drawings are near-identical** (`clip-run.png`): only the lantern ±8° and robe ±5° change; no
  trailing hem/hood streamer. 4× travel (the brief) was never rendered; I tried `--q speed=24` but could not confirm that it applied.
- (critic-storyteller) **Die (not needed in game) ends with the staff pointing 35–80° up in the air** at every facing
  (`x3-g8-die-f60.png`), not "laid across": a floating stick reads as broken rig.
- (critic-storyteller) Back facings: the hood is a round dome. The drooping tip barely shows (`c-ta-e-n.png`), whereas the v1 N/NE hood is
  pointed. The back star is 1 px (speckle) and the NE rim edge is a dashed gold arc.
- (critic-storyteller) Night: the spec.lights pool reads (olive disc on the grass, `c-night-nolamp.png`), but the glass renders cream-white
  and the hem barely catches the light. At golden sun the hood turns dusty mauve (`scene-golden-crop.png`); purple identity
  holds only in the shade copy.

## critic-maxflow r1 (art director, 2026-10-16, render-host RTX 4090) — Maxflow, 15/24, not shipped (author self-score 19, gap +4)
Pack `shots/critic-maxflow/` (`--preset cast --raw`, 116 pass / 16 warn / 0 fail, page_errors 0), dir-2 pack `dir2/`, 8-facing key
stills `g8-*.png`, composites `x/s-act.png`, `x/s-talk.png`, `x/face-*.png`, `x/cg1x.png` (1× game GIF frames), `x/lineup.png`, `x/push-poof.png`.
- (critic-maxflow) **A chibi ear rooted on the skull's side reads as an EYE in profile.** Ear joint at head-local [0.17, 0.43, −0.04]
  with dir [0.42, 1, −0.12]: at E/W (and NE/NW, every walk drawing at dir 2, `dir2/clip-game.png`) the near ear's dark lower half
  lies INSIDE the skull silhouette as a 2×6-texel slab mid-head, bigger and darker than the real 2×3 eye at the face edge
  (`x/face-EW.png`, `x/face-W.png`). Root ears at the crown/back (z ≤ −0.1, y ≥ 0.5) so the profile shows them on the outline, as v1 E does.
- (critic-maxflow) **Snout 0.05 m proud of the lathe = no fox in profile.** `snout: 0.25` in chibi() but the cream wedge front sits at
  z 0.355 vs the head surface ≈ 0.31: 2 texels. At E/W the figure reads as an orange egg with a spike (lineup E column ≈ toad/mole).
- (critic-maxflow) **Point aimed out to the character's RIGHT (upperArmR out 45°, fwd 112°) points AWAY from the faced target**: at
  SE it goes screen-left, at E it becomes a dark disc on the belly, at NW/W/SW it is hidden (`x/s-act.png` row 2; `dir2/clip-point.png`).
  Same failure as storyteller r1: aim the point along the facing (forward + up), with the camera-side arm at SE.
- (critic-maxflow) **`poof@<prop bone>` on the key that HIDES the prop fires where the bone went back to**: push f44 returns the crate
  bone to the hips, so the poof motes draw on his belly and the crate vanishes 1 m ahead with no FX (`x/push-poof.png`, clip-push f52).
  Fire the poof one key earlier (while the crate is still shown) or from a socket at the crate's last spot.
- (critic-maxflow) Cream at golden: chest renders #957C7E (mauve-grey, darker than the orange fur #EB843F) with whiteKeep 0.7
  (`scene-golden-crop.png`); same as theo-rem — whiteKeepLift alone may not be enough (look backlog).
- (critic-maxflow) The head↔body and arm↔body inner lines draw LIGHT grey-lilac (#A8A0A8-ish) on orange: a "collar" round the neck at
  every facing and stitched ∩ arm outlines on the body side at E/W, plus a dark X on the tail at N. On an unclothed plush they read as seams.
- (critic-maxflow) Bake (author's `shots/char-maxflow/bake/maxflow.json`): walk `frames 3, period 6, grid_frames [3,5,7]` — the shipped
  game walk loses drawing k2 (tools/bake: cycle cut from the start-up cycle). Live pack shows 4/4.
- (critic-greenting) **A smile stretched by `mouth.s` y on a ring of beads draws a HOLLOW dark ring, not an open mouth.** Talk f0/f12
  at S/SE/SW (`shots/critic-greenting/z-face-s.png`, `z-face-se.png`): the 7 smile beads scaled ×1.7–1.8 in y become a dark U/C outline
  round green (5×4 texels) that merges with the eyes into one crescent; at SE it reads as a dark socket/beak. Use a separate filled
  'open mouth' plate toggled by scale (0 ↔ 1) or a dark hull behind the smile, and keep the open mouth ≤ 3×2 texels on a 12-texel head.
- (critic-greenting) **A face on the snout CAP disappears in profile.** EYE_DIR (0.5, 0.42, 0.76) from the cap centre lands on the cap's
  silhouette edge at E/W: the face is ONE 1–2 px dark notch at the tip (`z-face-e.png`, idle/talk). The Joguman ref puts the eyes on
  the SIDE of the head behind the snout end; for a profile read move the eyes back along the head axis (≈ 0.3–0.5·HEAD_LEN) with x ≥ 0.7.
- (critic-greenting) **Far-arm gestures again (recurring with maxflow/storyteller):** a left-arm point is hidden at E, W and SW (3/8,
  `z-g8-b.png` row 3), the right-arm noodle vote at NE; a stub-limbed character should point with the head/body lean + the
  camera-side arm, or with both stubs.
- (critic-greenting) Ghost with default `keepHue 0` turns a green-identity character lavender-white (`z-g8-c.png` rows 3–4): set
  `ghost.keepHue` 0.25–0.35 when the colour IS the identity.

## char-storyteller r2 (author, 2026-10-16, render-host RTX 4090) — fixes after critic r1 (18/24); pack `shots/char-storyteller/p8/` 102/30/0
- (char-storyteller) **The "plumb cancel" triple does not hold inside LegGait walks.** `ARM_L(22)` with `staff = up + fore` still drew the
  staff top ≈ 17° FORWARD at the L contact (tip behind = push-off). Key the staff by eye on `grid=turnaround&clip=walk&frame=k&speed=V`
  stills: here staff fwd = arm − 36 gave a −15° plant with the tip ahead; flight arm − 20 passes vertical. Always check E/W stills.
- (char-storyteller) **A solid rim prism hides a recessed face**: "gold ring proud of both faces" with a `prism` rim + thinner face prism
  made the ivory face vanish (prisms are solid). Keep the face prism THICKER than the rim; a face only 0.004 m proud of the rim cap
  also caused a 1 px whole-texel `pan` FAIL (ivory edge pixel) — 0.01 m proud fixed it (pan 0).
- (char-storyteller) **Clearing a far-hand prop over the hood at W AND SW needs two tilts**: forward tilt moves the clock off the hood at W
  but onto it at SW; an outward (left) tilt fixes SW. 7° fwd + 14° out → sig_outside.clock ≥ 3 px 8/8. Bake the tilt into the geometry
  (rotate shaft parts + child bone pos about the grip) so every clip inherits it, then re-compensate raised-staff keys (vote) by −fwd/−out.
  Cost: diagonal staff lines add speckle (+3) and die key_speckle.
- (char-storyteller) **Forward point vs outline**: a lantern aimed at the faced target leaves the outline at 6/8 facings with
  `upperArm` [86, 0, 20] (key out, relative to a 50° rest out) + reach `.l` 0.6/0.5; at the 3/4 game facing (SE) it is always in front of the
  chest (the target is the viewer). Out 32 made E hang the lantern down again; out −4/−14 kept it on the body at S.
- (char-storyteller) Glide float bob: a keyed `pos` in a LegGait run clip did not move the head relative to the root (run.head_bob 0.2 px);
  `'hips.p': [0, 0.035, 0]` on alternate drawings gave 1.5 px. 2-drawing hem flutter = `robe` −28/−20 + `robe.s` +10 % on the flare drawing.
- (char-storyteller) Expressions ≥ 2 texels on bead eyes: add `eyeL/R.p` offsets to the y-scale (WIDE +0.5 & lifted, SQUINT −0.6 & dropped
  0.014 m, LOOK = shared x shift toward the head roll). `material.merge { head: 'chest', peak: 'chest' }` joins hood + capelet (same slot).
- (char-storyteller) Ground separation in shade: darkening the robe mid 5 % + sh 15 % moved noon-shade dL −20 % → −52 % (PASS).

## char-theo-rem r2 (after critic r1 17/24; render-host RTX 4090, 2026-10-16) — topic lessons (append-only; lead may file them)
- (Silhouette, spiky bodies) **A sawtooth outline needs FEW, FAT, LONG quills on a SMOOTH shell, not a spike grid.** 72
  short lat/lon pyramids → 1-px cream halo + hooped back; 37 thin 0.055-half-width quills → sea-urchin needles with 1-px
  tips (`r5/zA.png`); 23 pyramids with base half-width 0.085, length 0.2–0.26 m, lean back 0.45 + up 0.2, base sunk 0.05 m
  into a smooth 9×16 flat-faceted ellipsoid → 2–3 px triangular teeth at 8/8 and isolated_px 39 → 14 (`r8`–`r17`).
  Rules: (a) a symmetric L/R pair of quills draws two dark "eyes" (their shaded undersides) on the back at N — offset one
  half (here lat −11°, az +9°); (b) no quill dead-centre on rows the N camera looks along (end-on blob + dark "mouth");
  (c) cream tips only on quills that live on the outline (|az| < 105° + crown): back quills seen end-on are cream specks;
  (d) quills next to the face (|az| < 40° at lat ~45) draw a dark "second eye" on the forehead at SE — keep them ≥ 48° out.
- (Poses, point on a ball body) **One arm cannot point outside the outline at S, SE, SW AND W** when the body is wider than
  the arm is long: the far arm hides at W/SW, a forward arm is end-on at S/SE (`pA`–`pJ` search). A two-paw point (left
  flung forward-out `[60,0,70]`, right thrust forward `[85,0,30]`, both `.l` 1.3) reads at 8/8 (≈ 6–15 texels outside).
  Note: in pose triples `[fwd, twist, out]` on a chibi arm, fwd 90 + out 45 gives an arm raised SIDEWAYS, not a 45°
  forward-out diagonal — calibrate with pure fwd / pure out stills first.
- (Props) A card held out by the FAR paw at the pack facing reads edge-on; a 40° twist on the prop bone toward the SE
  camera (`card [0, 40, −60]`) made the ∎ square-on at SE while S/SW still show the face (`r21a/z2.png`).
- (Palette) whiteKeep's gate (linear luma > 0.75, chroma < 0.18) never catches a CREAM hi (#F8E6C2 chroma 0.40): a cream face
  goes apricot at golden. A cooler, less saturated hi (#F6E4D6 / mid #E4C8AA) stayed pale cream at golden with
  whiteKeep 0.5; a magenta-pushed #F4E2EA went grey-white at golden and white at noon (cream identity lost) — `r10s` vs `r11s`.
- (Faces, profile) Snout tip to z 0.39 and the nose box at z 0.405 put a 2×2 nose past the outline at E and W with brass
  rims r 0.05 / t 0.024 set back to 0.004; a 1×2 pupil box (0.036×0.07) and no glint removed the "+" crosshair at SE.
- (Locomotion) Paws carried over the belly draw a dashed grey inner line across it on every contact drawing: hold the upper
  arms out ~22° (rest + an additive `WALK_ARMS` key in walk/run) and cut the gait arm swing ([30, 40] → [18, 26]).
- (Process) zsh word-split trap hit again (`for c in "qed 17"; set -- $c` → `$3: unbound`): write explicit commands.
