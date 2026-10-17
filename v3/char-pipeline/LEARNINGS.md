# charkit learnings — what failed, why, and the rule that fixed it

The distilled lesson log of the pipeline this kit came from: about 30 characters, each built by an author agent and
scored by an independent critic agent (24-point rubric, ship bar 19/24). **Every rule below was paid for by a failed
critic round**, and most were invisible to the automated checks when they first appeared — the rows in
`tools/charcheck.py` exist *because* of these failures.

- Read it once before Stage 0 of `docs/CHARACTER_PLAYBOOK.md`; keep it open while judging renders.
- Format: **symptom → cause → rule/fix**, with the numbers that worked. **(recurring)** = bit several characters
  independently; treat it as a checklist item.
- Append-only in spirit: don't delete a rule because your character didn't need it; if one is wrong for your project,
  correct it in place and say why. Add your own lessons at the end under **"## Your project's lessons"**.

Vocabulary: **dirs** 0 = S (toward the camera), 1 = SE, 2 = E (profile), 3 = NE, 4 = N, 5 = NW, 6 = W, 7 = SW; **dir 1 is
the game facing** (packs, thumbnails). Camera pitch 30°. **Texel** = one low-res screen pixel; at the reference zoom (view
height 10 m on 640×360) 36 px/m, so 1 texel ~0.028 m (~0.032 m vertically). **H** = character height. **Grid frame** =
one 30 Hz key frame (display 60 Hz). **Drawing** = one held pose, usually "on twos" (~15 Hz). **Game speed** in our
example game: v_game ~4·H per second. **Chibi** = 2.2-2.8 heads, legs ≤ 0.25 H.

---

## 1. Process and self-critique

- **(recurring) Self-scores ran 3-7 points above the critic.** The misses were never in `report.txt`: a facing never
  rendered (usually dir 1 or a profile), per-facing tone counts, in-scene crops (golden, pillar shadow), redraws inside
  holds. Rule: the self-critique is an evidence table; every score cites file + facing/frame + a number; a criterion whose
  evidence was not rendered (or is marked "NOT run") is capped at 1. Gaps then shrank to -1…+3, later 0…+1.
- **(recurring) One facing lies.** Every character had a key that read at 3 facings and failed at the 4th. Author and
  judge every key on ONE 8-facing still (`grid=turnaround&clip=<c>&frame=<f>&fx=0`) — it includes dir 1.
- **(recurring) A fix verified in a different render moves the problem.** A plume fixed in the turnaround still read as a
  witch hat in the golden scene crop; a prop clash fixed at S/SE/SW moved to E. Re-verify in the SAME render that showed
  it, plus the 8-facing still.
- **(recurring) Claims your own evidence contradicts**: every "fixed/reads" claim names file, frame and facing at ×8.
- **(recurring) The design sheet goes stale in the fix round** and critics diff sheet vs code. Last step of every round:
  rewrite proportions, palette hex, dynamics, timing charts and the self-critique from the CURRENT code and renders.
- Once self-scoring was honest, points went to checks the author skipped: the 25 % line-up at S, N, SE AND E against
  every finished character, 8-facing stills of EVERY key, scene crops, raw hold diffs, the 1× game-speed GIF.
- **Pick the body plan from your reference images, never from the species word.** Briefs said "quadruped" for animals
  the 2D sprites drew as upright clothed chibis (heads 40-55 % of the height, legs 0.10-0.20 H). References change
  mid-project: re-read on every brief note; keep probe tooling generic from the first hour (a rebuild took a third of a run).
- **Name your closest look-alike.** "Cap over a bell" and "capsule with eyes" are the same 25 % blob. One shape nobody
  else has (a thin neck on an egg, a perfect ball) beat every surface-detail fix.
- **Shared code changes under you** (authors kept hacks for already-merged fixes): read the module-fix notes first; A/B in
  one tree state (A, B, A′); re-run a surprising check before acting.
- **Probe, don't reason.** Pose maths defeated reasoning repeatedly. What settled arguments: a **variant spec**
  (`shots/char-<id>/wv.js` overrides parts/clips of your spec from URL flags; `wv=` alone must be pixel-identical) with
  3-5 candidate poses as keys of a throwaway clip on ONE 8-facing still; a **part-drop variant** (`&drop=<part>`); a
  **headless probe** (Character with a fake engine in node: "does the paw clear the crown?" in 1 s); helpers that COUNT px.

## 2. Silhouette, proportions and body plans

### Silhouette
- **(recurring) An identity part that reads at S drops out of the blob at 1-3 facings** (hammer behind the body at E/W/SW,
  raised board behind the neck at W, shell slivers at S). Cause: any FIXED horizontal offset lines up with the view axis
  at two facings. Fix: lift it to shoulder/crown height (at 30° pitch depth shows as height, so the far side pops above the
  head), twist ~20° on its handle, move raised boards up-and-BACK yawed 25-30°. Render a key-green 8-facing silhouette
  row of idle and every held key; the part breaks the outline at ≥ 7/8.
- **(recurring) At S and N only WIDTH changes the outline.** Forward depth becomes screen-DOWN (a hooked beak 0.1 m
  forward lands on the chest); tails/snouts along the view axis vanish. Put width at S/N: a tail root ≥ 0.15 m out to the
  side curled up beside the hip, wing tips, a scarf end past the body edge.
- **The depth axis at SE is the character's left-back.** At dir 1 a point (x, z) lands at screen x ~0.71·(x + z). A tail
  curling to the character's left hides at SE in rest AND walk; one swept 40° right stays visible. One rigid sideways tail
  can't serve both S and SE: compute the side vector at dir 1 before modelling.
- **(recurring) E/W collapse into a column + spike.** Frontal-plane accessories (tufts, antenna fronds, horn loops)
  became one 1-2 texel spike; two different characters were identical at E. Give identity accessories ≥ 0.1 m depth or a
  back lean; profile heads wider front-to-back than tall; line up E/W at 25 %.
- **(recurring) Cap over a bell, capsules and domes are everyone's default blob.** The identity prop or a side shape
  breaks the bell outline by ≥ 3 texels at S AND N; a hem flares wider than the head mass (radius 0.30 / exponent 1.35
  worked; 0.315 / 1.7 was a saucer).
- **Signatures that must read from every yaw are 8- or 16-sided lathes/frustums, not boxes** (a box hat was a square at
  the frontal and side facings; an 8-sided lathe with a flat face to +Z is a lens at all 8).
- **Convex signature = bands of ONE profile.** A trim shell 0.01 m proud flickered at the depth threshold → dotted 1-px
  staircase (7-12 isolated px per facing). Cut one convex profile into coincident lathe bands, tilted about ONE pivot
  (per-part `rot` turns about each part's centre and opens seams) → isolated_px 0-1. No facet < 0.03 m; trims ≥ 0.05 m
  (0.035 m gave 5-6 isolated px). Spots/glyphs/patches are CUT out of the subdivided surface (facets whose centroid falls
  in the mark go to its slot), never boxes on top.
- **Concave signatures (cocked brims, crowns, horns) are ≥ 2 parts with a ≥ 0.03 m step**; a single convex loft can only
  be a cone (a tricorn became a party hat). Triangle-plan hats: front corner low, back wall tallest (30° pitch shows the
  plan from behind).
- **(recurring) The second half of a two-part signature gets lost** (a plume in the hat-trim slot, a hood narrower than
  the mantle = a boulder from behind). Each half: own slot or ≥ 15 % L / ≥ 30° hue step from what it touches; a hood half
  is the widest head-level mass (≥ 1.1 × mantle) with a peak ≥ 3 texels; an accessory half breaks the outline upward in
  ≥ 6/8 facings. A vertical accessory on a pointed shape leans ≥ 35° off screen-vertical at dir 1 (else: witch hat).
- **Species read lives in the profile head and in S/N.** A dog with a 0.16 m snout and upright ears read as a lamb.
  Snout ≥ 0.20 m with a slight drop when the reference has a nose bump (0.05 m proud of the lathe = an egg with a spike).
  Round top bumps on a tall skull = mouse ears: flatten (h ~0.8 w), move bumps out to the side outline; at S the top of a
  head is its BACK rim (screen-up = y·cos30 - z·sin30), so lower the back rings instead of raising bumps.
- **Design the back.** Ball/snowman backs and dark tail ends facing -Z read as nothing. Add a nape/collar on the head
  bone (same bone + slot: no line), a light-topped tail, a hood peak leaning SIDEWAYS 0.12-0.18 m as well as back.
- **Spiky outlines want FEW, FAT, LONG spikes on a SMOOTH shell** (72 short pyramids = a fuzzy halo; 23 of length
  0.2-0.26 m, sunk 0.05 m = clean 2-3 px teeth, isolated 39 → 14). Offset symmetric L/R pairs (two dark "eyes" at N).

### Proportions and geometry
- Height ~45-62 texels (~50 = 1.4 m); keep a cast's relative sizes (we used 0.04 m per source-sprite px →
  1.05-1.56 m). Pet-sized templates (0.5-0.8 m) failed `height_px`/`presence`; declare `spec.heightPx`/`presence` for outliers.
- Min visible thickness 2 texels (0.06 m), limbs 3-4. Limbs/small parts are plain boxes or 4-6-sided frustums (chamfered
  8-sided limbs lit every crease → stripes).
- Torso depth ≥ 0.72 × width (else a plank in profile); feet ≥ 0.22 m; 8-facing area variation < 40 %. Arms in a slot
  ≥ 15 % value off the torso, shoulders ≥ 0.04 m outside the chest; side locks end at z ≤ 0.01 m so the 3/4 face is
  ≥ 4 texels wide.
- **(recurring) Chibi arms can't clear their own head** (shoulder 0.55 + arm 0.31 m < head centre 0.84 m). Do the reach
  arithmetic in the sheet (fixes in §9).
- **(recurring) Hems.** Bell robes show their hollow interior when lying down and boots float outside a short hem. Add a
  sole disc in the robe-shadow slot; boots inside the hem radius in every gait drawing or joined by a dark shin; hem ~
  0.15 m if boots must show at S.
- Overhangs ≤ torso width + 0.1 m (a wide cowl cost 30-50 walk specks/frame). Bands on a bone twisting against its
  neighbour ≥ 0.07 m tall (a sash became a dotted line).

### Faces and eyes
- **(recurring) Eyes.** Boxes < 0.08 m sunk in an 8-sided lathe → 1-px dots; "proud + turned 15° out" → the FAR eye a dark
  nub outside the contour at 3/4/profile. Now: 16-sided head lathe, eye joint ON the surface, box along the surface
  normal, front ~0.006 m proud (flush z-fights) — or cut eyes into the skull. Eyes above the equator show from NE/NW.
- **(recurring) The face passes at rest and fails at another key**: a 1-texel glint became a 2×2 goggle on breath keys (a
  1-texel body shift re-rasterises a 3×4 eye); glow filled a void face; a squint-at-rest had nowhere to go. Glints
  ≤ 0.024 m flush in the corner; void-face glow ≤ 35 % of the opening at S/SE/SW; express bead eyes by y-squint, roll and
  small `.p` (WIDE +0.5 lifted, SQUINT -0.6 dropped 0.014 m), never x-scale (dark 1-px column); a squinting face expresses
  with a ≥ 30° head cock + a hand. 8-facing still of EVERY idle and talk key.
- **Details at 44-60 px:** eye hi ≤ about #4A4258 (a lit "dark" eye + glint = X-eye); pupils 1×1-1×2 on a FIXED texel in
  the darkest tone (2×2 in a 4×4 lens became letters); 2×2 eye in a 5-texel ring = crosshair; a 4×2 dark nose = an open O
  mouth (use 2×1); glyphs are pixel cells cut into the surface (slanted strokes made a λ a lightning bolt). +X is screen
  RIGHT at S (don't mirror bitmaps).
- **(recurring) The profile face is its own design.** Mid-skull eye = cyclops; an ear on the skull's side reads as a big
  eye at E/W (find it with a part-drop); two eye bumps = a tall thumb (far bump ~7 texels higher); a mouth gap = a band
  round the head; a face on a snout cap = one notch. Near eye touches the snout root; ears at crown/back (z ≤ -0.1);
  place profile eyes by angle round the head axis (|x| ~0.9 R); nose past the outline at E AND W.
- **Faces on round hoods sit on a FLAT front** (clip the hull at z = zf; a disc in front stuck out as a "dish"). A
  full-width dark hollow = sunglasses: arch it, ≤ 60 % of the hood width, ≥ 3 texels inside the outline at SE/SW.
- **Mouths:** hinged chins on small heads read as beaks (a 14-26° jaw shows ≤ 1 texel). Use a ≤ 15° lower lip over a 2×1
  dark floor under a real snout, a dark plate buried in the head and pushed out with `.p` (unkeyed = hidden), or a scaled
  plate (`'mouth.s': [0.25, 1.9, 0]`). A y-stretched ring of smile beads = hollow ring. Opens ≥ 2 texels at S/SE/SW;
  interior in the reference's mouth colour.
- Glasses = a RING of boxes on the HEAD bone, white/pupil on eye bones. Closed eyes = squash (`s` y ~0.2) or a 1-texel arc, never a proud lid prism (draws goggles).

## 3. Palette, shading and lighting

- **No rim, no silhouette outline.** Ground separation = warm/mauve big-slot shadow vs the cool teal grass shadow (same
  value is fine), the signature lightest in shade, golden back-light. Characters use the character material (inner lines
  only); verify with `?outlineDebug=1`.
- ≤ 5 slots `[hi, mid, sh]` + 1 accent (a story prop may be a second); warm hi, cool sh, no pure black/white; shadow tones
  of different slots ≥ 20° hue or ≥ 15 % L apart.
- **(recurring) Signature camouflaged by the biome, usually at golden.** Golden multiplies ~(1.0, 0.8, 0.55): high-red
  light colours collapse onto golden grass (lime moss 18° off at noon, same hue at golden; low-red mint stayed 41° off).
  Rule: ≥ 30° hue or ≥ 25 % L from LIT grass at noon AND golden, measured in `scene-*-crop.png`.
- **(recurring) …then in SHADE**: a fixed signature went darker than its stone and equal to grass shadow (one navy blob).
  Its sh ≥ body sh and ≥ 15 % L over grass shadow, hue off teal; a clearly dark one (≤ -25 %) also reads; ±15 % is lost.
- **(recurring) Greens on grass: go DARK on the reference value.** Light chartreuse was +12 % L (lime on lime) and went
  yellow; the reference green rendered -28/-29 % under lit grass and shade: 4/4 PASS.
- **(recurring) Identity traded for a check** (olive → tan to pass = bread; a mauve-navy sh turned a green figure purple in
  shade). Every tone of a slot within ~15° of the reference hue; separate by VALUE; reserve colours your game assigns.
- **(recurring) Lifting `sh` with a hue step reads as another animal** (mauve/plum/lilac shadows turned a tan long-neck
  into a llama in the shade copy) while the check PASSes. Lift value along the slot's own hue.
- **(recurring) Value drift for night**: lifting every tone turned a dark hat tan and navy robes periwinkle. Lift only `sh`
  (main slot sh ≥ about #3A3040, mauve not navy); compare the 1× S crop with the reference side by side.
- **(recurring) Whites go apricot at golden** (~#EFBD7D). Lifting or "cooling" the hi did nothing. Push the hi toward
  MAGENTA (#F8E8FF passed), or `material.whiteKeep` 0.6-0.8 (+ `whiteKeepLift` on lifted slots). Cream escapes the white
  gate: a cooler, less saturated cream (#F6E4D6 / #E4C8AA) + whiteKeep 0.5 stayed cream. Two-part signatures keep a value
  step that survives golden (white toque vs cream skull merged at dL 0.05).
- **(recurring) Signature/accent mostly in its SHADOW tone while every check passes** (ears 55-68 % sh = maroon horns, a
  beard 76 % sh). The look module now lifts `spec.signature` and `spec.faceSlot` (`sigLift`/`faceLift` 0.3): animals
  without a skin slot must set `faceSlot`; a second light mass goes in `signature: [...]` or `slots {x: {lift}}`. Still
  count hi/mid vs sh per facing at noon: ≥ 50 % in ≥ 6/8 (`?look=opts` shows the lift).
- A top-facing dome is ONE tone from above: add a same-profile skirt band `[mid, mid, sh]` or a facet break > 35° →
  ≥ 2 tones, ≥ 40 px per facing.
- **Face in brim shadow**: tilting the hat didn't help; a fixed bias lit the face but shaded the chest. The look module's
  `selfShadow: 'hull'` (shadow ray from where it leaves the character's own cylinder) took face_lit 47 → 94 %. Don't tilt
  hats. `face_lit` counts only VISIBLE face px — check `face_visible`.
- Eyes in a light slot render that slot's hi (brown eyes in the boot slot): give eyes their own near-black slot.
- Far-half shadow is per BONE by NAME (`…L`/`…R`); props under a hand are lit normally. Render one `look=far` turnaround:
  magenta only on limbs. Wing tips/paws named `hand…` with > 0.2 m parts may need `side: 'sided'`.
- Speckle sources: same-slot child parts, proud trims/bands/glyphs, too many ellipsoid rings (6 → 4 cut 12-21 → 5-14 px),
  spike grids, material hints (opt-in, 2-12 px), grey inner lines on cream parts (seams). Fix by geometry first.
- **Lights** go in `spec.lights` with glow shaders on `uCharTime` (engine time broke night freeze tests). Judge the pool
  AND the signature under it: warm light on teal night grass goes olive, so push red-orange; ~1.4 intensity, 1.6 m
  distance for a 1.25 m figure (a 4 m pool turned a pale cloak rust). Night glass a warm mid (~#FFC060), never near-white.

## 4. Rig and parts

- **Kit lathes/hulls are bbox-CENTRED** (`at` = middle, not rim): a cap moved "down 0.05 m" sank into the body. Wrap:
  `K.xf(K.lathe(p), { at: [0, (ymin+ymax)/2, 0] })`. Re-render the turnaround after EVERY shape/placement change.
- `bend()` moves vertices only: bent boxes need bands (`segY` 3-4). Chain links: `K.hull` of points along the link's own
  direction, never Euler `rot` (links twisted sideways when pointing up → stair stripes).
- **(recurring) Same-slot child on a parent bone** (ear, eye bump, tuft, jaw, hood peak) draws a dotted line / 5-11
  isolated px at the junction. `material.merge: { <child>: <parent> }`, or sink the child ≥ 0.02 m with a wide base, or
  same bone + slot. Accessories that can overlap the signature use another slot.
- **Squash needs its own LEAF bone** (squashing root/body scales the IK'd legs): hips (legs) → spine (roll pivot) → `ball`
  (leaf mass) with head/arms as riders moved by `.p` = (restY - ballY)·(sy - 1).
- **Scale offsets inherit**: counter-scale children (stalk ×1.75 → eye y -0.43); hide with -0.98, not -1 (singular).
- **Reach without thickening**: `'<bone>.l': [k]` lengthens one segment, children rigid (replaced `.s` 1.5-1.95× +
  counter-scaled props; past ~1.9× an arm reads as a twig).
- **Hidden props for one clip**: geometry at 1/1000 on its own bone, `'<bone>.s': [999, 999, 999]` only on the keys that
  use it (unkeyed = invisible everywhere, incl. procedural gaits); or park the bone inside an opaque mass and move it out
  with `.p`. HIDE spreads in other clips also work but must cover gait keys and `breath()`.
- **Pose triples `[fwd, twist, out]`** follow each bone's snapped rest direction: knee bends with NEGATIVE fwd, elbow
  positive; forward-pointing bones fwd + = tip down; sideways bones out + = up. Order q = qFwd·qOut·qTwist: with out > 90 a
  positive fwd swings a raised limb BACK; fwd 90 + out 45 on a chibi arm is a SIDEWAYS raise. **A bent rest forearm snaps
  to a FWD-axis bone** — check the snapped axis of every bone you bent. L/R via `mirrorPose`. 10° is invisible; use 25-80°.
- A bone at pos [0,0,0] under another → NaN geometry. After adding exports run `tools/charexports.mjs`: `dups []`.

## 5. Clips and timing

- **30 Hz key grid, held poses, on twos.** Actions: anticipation hold → ONE contact frame (+ smear) → follow-through hold →
  recovery. Extra frames go before/after a key, never between (the smear is the in-between). Action starts on multiples
  of 1/30 s (t = 0.25 s put every change half a frame off); quantise with floor(t·60 + 0.01).
- **(recurring) Consecutive keys < 25° apart are one drawing** (11° + 6° follow-through = one drawing held 9 frames; a 2-px
  wink; four wrench turns behind another prop). ≥ 25-40° on the dominant chain, or ≥ 25 % silhouette / a big part ≥ 3
  texels vs the PREVIOUS key at dir 1 and S, in EVERY clip; anticipation folds the elbow ≥ 60° and coils ≥ 20°;
  follow-through ≥ 40° past contact. `key_delta` only WARNs below 1 %.
- Every drawing holds ≥ 2 grid frames; only clip switches and smear contacts cut in (`single_frame` 0).
- **(recurring) Action holds are not holds**: chains redrew 41-106 px 2 frames after every key, FX stepped on the other
  phase, a "sharp" hold was drawn 4× — and the checker passed it. One-shots now default to `clip.dynamics: 'hold'`. Rule:
  holds ≥ 6 frames have 0 redraws > 8 px, settle steps ≤ 10 px, never ≥ 3 consecutive 1-frame changes outside smears; key
  chains AT their settled direction; keep a chain parent's world direction constant across keys.
- **Idle**: loop, `interp: 'step'`, ~4 keys with long extremes (0/30/36/66, length 72), 1 texel bob (`pos` y 0.028);
  head world pitch constant across keys when a chain rides on it (head = -Δ(spine + chest)).
- **(recurring) Talk/emote keys hide the face at dir 1** (a nod shows the skull top, a paw over the muzzle). Head WORLD
  pitch in talk ≤ +4° down on chibis; carry beats with roll/tilt toward the camera, `pos.y` bob, jaw, ears, a hand;
  mouth-open keys tip UP; glances ≤ ±15° yaw; a constant 10-24° head twist toward the camera opens dir 1. Talk loops a
  ≥ 25° beat every 8-14 grid frames.
- **(recurring) Head pitch breaks the front view both ways** (head back 42-58° = lampshade hat; head up = throat box).
  Keys held ≥ 4 frames: -15…+5° for hats/hoods, ±35° quadrupeds; recoil goes into spine/chest/pos.
- **(recurring) The vote doesn't rise** (spread wings change the outline sideways; bare chibi arms stop at eye level). The
  raised part clears the crown by ≥ 0.3 m / ≥ 6-8 texels at 8/8; up in ≤ 6 frames and HOLD (`clip.hold`). Write
  prop-top minus crown-top per facing (14 at S but 4 at E failed). Techniques in §9.
- **(recurring) Emote punchlines don't read**: equals a talk key, a T-pose, a 0.1 m "step", eye-only, far limb, masked by
  FX. Author it on the dir-1 cell first; camera-side limb; head toward the camera; ≥ 10 % silhouette change; a step
  ≥ 0.3 m; FX 4-6 frames after; diff against every talk/vote key; judge on `fx=0` (a spark hid a paw that never moved).
- **(recurring) Die reads as sitting/standing at 2-3 facings**: a body lying along one axis foreshortens where the camera
  looks down it; a neck counter-rotated against the body roll stays upright; a hard chin tuck sat the face up. Use a
  CURLED mound (hips roll ~-90, spine+chest 60°, knees in) or a DIAGONAL roll (30-82° about Z, or fwd + out combined —
  hips twist alone spins it about its long axis), root recentred; children FOLLOW the roll and droop 15-20° more; roll
  away from the game camera so the shut-eyed face shows at S/SE/SW; fold arms over the body (out ≥ 70° = antenna); lower
  legs (raised feet = horns); rims ≥ 0.05 m; props lie down. Each die key draws LOWER than the last (one hopped up 5-6
  texels). Readable at 1× in ≤ 1 s, held "down" at 25 %.
- **Point**: aim along the FACING (forward + up; the game turns the avatar); side-aimed pointers point away at SE and hide
  at W/SW. A forward arm foreshortens to nothing at S/SE on a wide chibi: twist chest+spine ~40° so it is a horizontal
  stroke at SE. A ball body wider than its arm needs both arms. Pointer ≥ 4 texels outside the outline at S/SE/SW/W.
- **Ghosts**: shared `spec.ghost` + plain loop clips; `keepHue` 0.25-0.35 when colour IS the identity.
- **One-shot endings**: end on the last real key with `clip.length`; diff the frame before the end against the end. A key
  under a flash holds ≥ flash frames + 2.
- **(recurring) FX on an odd key spacing strobe at 30 Hz** (FX step on twos from birth: keys 0/5/13/18 with FX on f5 →
  `strobe 3`). After an FX key every later key lands an even number of frames from it (0/6/14/20). Events ON key frames;
  hold the key until its FX ends.
- If your game bans violence (ours did), drop `hurt` from die (it whitened the figure 6-8 frames), turn sweeps into
  gestures (`sparkle@weapon`, not `hit@weapon`).
- Action semantics (exemplar duelist): slash planes cross the view at every facing; blocks ≤ 40° from the previous key,
  no crescent; slams = lift → slam + squash + dust; a pounce has all feet off, spine level, front paws land first.

## 6. Locomotion and game speed

- **At game speed the stock gait aliased.** Walks had been tuned at 0.4-0.85 H/s (one exemplar 10× too slow). At ~4 H/s
  the biped played its run, a 6-grid-frame cycle showed 3 of 6 drawings on twos, contact never showed twice, `foot_slide`
  0.0 was meaningless, and at 1× a 6×8 px leg patch "slid with flickering feet". Rules:
  - cycle = N drawings × 2 frames, N 4-5 → 0.27-0.33 s; step = v·N·2/60 m; cycle length ~1.1-1.3 H; cadence floor
    0.27 s. Distinct pose ids per cycle = N (`game.readable`).
  - feasibility: stance span β·C ≤ ~0.9·hip. Bipeds (hip ~0.45 H) β ≤ 0.34 = a scurry with flight; short legs (hip
    ≤ 0.3 H) hop / bound / waddle-skip / glide / flutter; quadrupeds bound (β ~0.25). duty ≤ 2·reach·(leg/H)/(C/H):
    leg 0.36 H → ≤ 0.33, 0.20 H → ≤ 0.18, 0.10-0.15 H → ≤ 0.12. Do it in the sheet before rigging.
  - something BIG carries the rhythm: whole-figure bob ≥ 1 texel (0.014 m never shows), hop apex ≥ 4-6 texels,
    ears/tail/wings ≥ 25° per drawing pair. Judge a 1× real-time GIF at dirs 1 and 2; name the gait in one word.
  - check the clip that plays is the one you edited (Froude thresholds silently swapped walk and run). Read `game.*`
    rows; plain `walk.*` jobs run at stage speed.
- **(recurring, every chibi of the first wave) The gait read as a glide**: legs ≤ 0.25 H under robes never showed a planted
  foot, and `foot_slide` n/a is not a pass. Make contact a DRAWING: a boot flick ≥ 3×2 texels out of the hem in a
  contrasting tone (hide the trailing boot — behind a robe it reads as a tail), a prop tip planted ahead (tip behind = a
  pole-vault push-off), or a hop apex ≥ 4-6 texels above STAND with boots tucked (flight at standing height = squat-bob).
- **(recurring) Contact drawings show no or wrong feet** (boots through the dress, feet buried by squash, one boot = pogo,
  a satchel below the soles). Each planted foot ≥ 2×2 texels outside body/skirt at dirs 0/1/2; flight feet ≥ 1 texel apart
  at S; both contacts drop the head ≥ 3 texels (`game.feet_visible`, `<gait>.head_bob`). Fixes: ghost leg bones as the gait
  legs + FK visible legs (dressed hopper), a ball lifted off the hips on contact with the drop from the squash, wider
  `spacing` + lower `lift`, light toe caps, `contactReach`/`lift` in 'hold' mode under hems.
- **Plant modes**: `legIK: 'frame'` = 0 slide but 40-60 leg px redrawn at 60 Hz; `'pose'` holds the whole drawing
  (exemplars); LegGait `plant: 'hold'` = clean sprite leg cycle for short legs (contact exact at its pose frame, drop
  ≤ 0.1·leg; the planted foot rides the root inside a hold, as a baked sprite does); `'pin'` re-pins only the touchdown
  drawing's stance leg. Set `plant: 'hold'` explicitly on very short legs. The legacy Gait wants `legIK: 'pose'`.
- **Recipes that rendered a clean 4-drawing game gait (~0.27-0.29 s / 1.05-1.14 H):** unclothed chibi — LegGait
  'biped' + an additive `clips.walk`, duty 0.18, a keyed 2-bone tail + ear flops; short-leg skip — 'biped' + 'hold', walk
  `pos` -0.035 contact / +0.11 flight, spine squash, arm pump 84°/-52°; hop — 'hop' + arms 4→42→62→36°, hop 0.28·H ~
  11-texel apex; waddle for any very-short-legged body (ball, tube, bird) — biped bone names + `style: 'bird'` + 'hold',
  roll 8-9°, headBob 4-8° (roll 12 = limp, headBob 14 = pecking), squash a leaf `ball` 0.22; long neck — neck pump 9° with
  head -8°, ≥ 6 neck texels at S per drawing; limbless glide — squash on a bone jointed at the TAIL tip, head/shell as
  riders, amount 0.4, all N pulse drawings different.
- **Face steady across gait drawings**: counter-pitch the head so summed pitch is equal on contact and flight (a grin
  chattered); walk `pos` keys in whole texels (~0.032 m in y) or pupils re-rasterise. Keyed walk bones REPLACE the
  plan's lean: keep head world pitch ~0 in contact keys or use `blend: 'add'`.
- A roll moves a high head in screen y at 3/4 (4 px vs 1 px = limp): counter with `chest.p` -0.66·sin(roll).
- Sway = hips rotation, never `pos.x` (1-texel x sway = 1.15 texels of slide). Never pose a straight leg. Hanging
  satchels: limit ≤ 20°, gravity ≤ 0.5. Front skirt flaps ≤ 10°.

## 7. Secondary motion and dynamics

- Second-order (f, ζ, r) at fixed 60 Hz, SHOWN only as new drawings on twos when a quantised channel changes. r = 0 for
  anything driven by steps (quantised facing). Start: cape/ears/tail f 3-5, ζ 0.4-0.6; head lag f 1.5-2, ζ 1; snappy f 4-6
  ζ 0.5; heavy f 1-1.5 ζ 1; bouncy ζ 0.3 r 1.5.
- Settle ≤ 0.5 s (a scarf at f 3.2 / ζ 0.4 wiggled 1.2 s; f 4 / ζ 0.55 fixed it) in 2-4 held drawings, never a crawl.
- **`quant.chain` = buckets per unit: HIGHER = FINER = MORE redraws** (a critic once advised the opposite). Default 12,
  small chains 4 (8 → 3 redraws/key, 4 → 0). Copy `quant: { yaw: 8, chain: 4 }`.
- **Short accessories: 1-link chains** (multi-link converged once per drawing → 2-3 redraws/key; `rigid: true` helps). An
  UP-pointing 1-link chain needs `tip: 'axis'` + `len` or gravity pushes it the wrong way.
- **(recurring) Head-mounted chains re-snap inside loops**: set `dynamics: 'hold'` on idle/talk (8 → 16 redraws without),
  or key the accessory and counter-key its world direction. Lagging ears without settles: 1-link, f 5, ζ 0.8, quant 4;
  one-shots key ear bones with `dynamics: 'snap'`.
- **Keyed bones beat springs for identity parts**: a keyed 2-bone tail in every clip (walk included) gave 0 hold redraws
  and carried the 1× rhythm. A spring lags ~2ζ/(2πf)·v (0.2-0.3 m at 4 H/s) and sits at its limit behind the body (a
  scarf end hid at 8/8): key it forward in the walk, lower the limit. A rigid hat reads dead: key ±10° roll + `.p` ±0.03 lag.
- `noForward` stops capes swinging into the legs on stops.

## 8. FX and smears

- Unlit, 2 flat light tones, no outline; depth-writing FX write a neutral normal in the normal pass (a discard ringed the
  crescent with an outline).
- Palette ≥ 15 % lighter than lit grass, inner band ≥ 12 % darker. ≤ 170° per smear key (quaternion difference ≤ 180°:
  190° smeared the short way); spins = several 110-125° keys. Blades < 0.8 m: inner 0-0.12 (0.35 = 5-7 texel crescent).
  Ribbon width ≥ 0.10 m. Stages full → eroded → streaks → dashes, gone after 4/30 s.
- **(recurring, all exemplars) The smear was edge-on at some facing** (41 vs 831 px between facings). The module now tilts
  the ribbon 35° when its AREA normal is near edge-on and pushes it 0.12 m toward the camera, with the view basis from
  camera yaw/pitch (the camera object was stale at birth); never `tilt: 0`. Verdict = ONE 8-facing still of the contact
  frame (no `fx=0`): ≥ 8 texels of connected crescent everywhere, each facing ≥ 25 % of the best.
- `kind: 'thrust'` exists (tip-socket arc hacks read as ladder/trident/cane); add 15-20° body yaw at contact. `claw` = 3
  rakes; `limb` covers the outer 60 %. Blocks get no crescent (150° made one taller than the figure).
- Sparks light-only, ≤ 3 grid frames, plus then ring (dark cells = checker clod). Dust: scaled by height (1-2 texels on
  a 0.55 m figure; bigger reads as pebbles), light, seeded, ≤ 6 frames, in phase with birth; spawn rings with a radius under
  wide bodies (else "eggs"). No FX on treadmill copies.
- **FX that mask the pose or read as objects** (sparkles over the face, a poof on the same frame as the pop, slashes for
  feathers): sockets outboard (|x| ≥ 0.35 m or the prop tip), 4-6 frames after the key; contact FX from a socket AT the
  contact (a non-weapon `hit@` socket inherited a blade length: set length 0); an FX on the key that hides a prop fires
  where the bone went back to — fire it a key earlier.
- One steady speech bubble per talk loop (`speak` on frame 0); glyphs full size on the first drawing, ~0.14·H + 5 texels
  above their node. Vote sparkle ~0.7-0.8 s and die wisp 1.2 s outlive short windows.
- Sheet FX list: wings → `flap` feathers in plumage tones; hoppers → `poof`; limbless/fliers → no step dust.

## 9. Props

- **(recurring) The identity prop vanishes in the walk or at a facing** (a lantern 0-3 px in walk drawings, a sword
  trailing like a third leg, a shovel fused into the coat). Make the REST pose the carry pose (hip height, forward-out,
  clear of the legs at dirs 1/7) or key the prop arm in `clips.walk` (±4° keeps all drawings); ≥ 12 prop px per walk
  drawing at 8 facings.
- **(recurring) A prop covers the face at the facing you didn't check** — often the carrying side toward the camera at E/W.
  For EVERY key incl. idle: face clear at S/SE/SW, signature uncrossed at 8/8, ≥ 6 px of staff/blade outside the head box.
  At SE screen x ~0.71·(x + z) (forward-right lands on the face); at SW ∝ x - z (a staff needs hand x - z ≥ 0.3 m).
- **(recurring) Long props fuse into the silhouette**: ≥ 3 texels clear of hem/outline (rest `out` ~35-40°), tip ≥ 3
  texels over the hat. Beside a cap wider than the reach the grip sits ≥ 0.4 m out; put the carry into BENT REST geometry
  so gaits swing about it. A far-hand staff over a hood needs two tilts (7° fwd + 14° out), baked into the geometry.
- Thin props ≥ 0.09 m near the grip or carried ≥ 60° forward of the arm (a 2-texel blade over the legs = a dashed line).
- **Solve the wrist, don't guess it.** With `out` ≥ 30° six hand-tuned renders never got a plumb prop; a 60-line headless
  grid search over the hand triple (printing tip height over the crown) did, first try. Rules of thumb: a prop on an UP bone
  stays plumb with prop fwd = upperArm + forearm fwd (- spine - chest); a hanging DOWN bone needs -(upperArm + forearm);
  approximate when out > 60; raise a plumb staff with fwd only (155 / wrist -155). Inside procedural walks key it by eye.
- Long props tilt 25-30° under gait/start lean: cap `locomotion.accelLean`, counter-key in the walk clip.
- **(recurring) Votes on chibis raise a PROP** ≥ 0.3 m over the crown, up-and-OUT on the carrying side (upperArm out ~55,
  fwd ~120-125), never straight up behind the head. Worked: `.l` reach; a vote-only prop hidden at tiny scale (a feather
  fan at 4 %, a paddle at 1/20); sliding the prop through the fist with `.p` (+0.12 m: 0.17 → 0.30 m over the crown); a
  body prop ridden to the limb tip; leaning the body 8-14° away. Keep the chest upright (leaning it moved the prop over
  the head). On very wide heads gesture BELOW the jaw.
- **At SE the camera sees the character's LEFT (+X) side.** A right-arm raise hid behind the head at SE only; the left
  arm read. Pick the arm by the dir-1 read and say which facing loses it.
- **(recurring) Flat held things go edge-on at SE or E/W** (card, pennant, placard, wing, fin). Judge at SE first: face-on
  ≥ 3 texels of area, a slab ≥ 0.09-0.17 m deep (never a blade at E/W), stick ending in a visible fist. Aim: arm near
  vertical (fwd ~165, out ~25) then sweep the hand twist in a variant spec, or yaw a disc -35° toward right-front. Any
  yaw face-on at SE leaves 2-3 facings edge-on: a thick rim or ball finial keeps them. Glyphs front/back only. Motion behind
  another prop is no motion: move in the screen plane; move discs with `.p`.
- **(recurring) A prop that reads as a WEAPON at 1× costs more than an unreadable one** (card on a dark stick = axe, a dark
  wing tip = baton, a symbol on four cube sides = skull). Write what a stranger would call each prop at 1× at dir 1; fix
  with a thick signature-colour handle, a square face-on card, the broad light face of a wing (≥ 0.085 m thick).
- A story prop in an existing slot vanishes (in the trim slot: visible 1/8): own slot ≥ 15 % L / 30° hue, ≥ 12 px at 8/8
  in every story key. Prefer voting with the identity prop over a conjured one.
- Ground props in an emote: a hidden bone on the HIPS, per-key `.p` = world target - hips, travel ≤ ~1 m.

## 10. Turns and facings

- 8 quantised facings with hysteresis; 45° steps ≥ 2 grid frames apart; chains settle in a few drawings; the last settle
  step ≥ 10 px or none (16/8/6/2 px settles end in pops — coarser quantum or higher ζ).
- **(recurring) Post-turn redraw tails were never the channel tuned first** (scarf ζ changed 38 → 37 drawings; the causes
  were facing steps, hidden-leg recovery steps, head lag, personality f 1.5 still yawing 0.6 s later — f 3.6-4 ended it at
  0.33 s). Classify changed raw frames by region and A/B one source off at a time with a variant spec. If knobs change
  nothing, it is another channel or a feedback loop. Idle-loop keys inside the turn window look like settles.
- Design for E/W as much as S: the game walks left/right constantly.

## 11. Tools and checks

- **(recurring) charcheck rows are hints; 8-facing stills and raw diffs are the evidence.** Former false PASSes (most now
  have rows — know the blind spot): `foot_slide` n/a passed floating boots; `face_lit` 96 % under a brim (`face_visible`);
  `sig_ground` golden passed on a shade colour (now lit half); `1x7` runs and 4 drawings per hold passed; `game.readable`
  counted pose ids, not distinct drawings (`<gait>.distinct`); no key-to-key compare (`key_delta`, weak); no foot
  visibility (`game.feet_visible`); no signature-outside-body (`sig_outside.<part>` — declare tails/beaks as `{ part }`);
  no flat-prop area (`prop_area.<prop>`); speckle only on idle (`key_speckle`). Still eye-only: hue drift in golden/shade,
  face shimmer, weapon read, whether a gesture reads.
- Known false FAILs/WARNs: `die.foot_slide` counts the collapse; `turn.foot_slide` (stage); "60 Hz in-hold" for
  never-planted FK feet; "legs only" flicker on 'hold'/'pin' gaits; colours-per-slot over-counts (trust ×4 crops);
  `face_lit` 100 % on a void face; a tall figure overlapping the next turnaround row (fake `height_px`/`islands` at SW).
  Compare old and new packs with the SAME checker.
- Only trust rows from a run that rendered those jobs. Calibrate colour-keyed checks with a negative test (an inner-line
  row read 0 for everyone: linear → sRGB moved the debug red).
- Raw frames: index by the job's `times` or the integer after `f-`, never `sorted(listdir())` (f-100 before f-11 = 417 px
  of fake flicker). Audit gait flicker on the pose id `p`, not the drawing id `d`; gait ids `<gait>:<drawing>:<cycle>` are a
  cross-module contract. Confirm the `p` field of every still; `grid=turnaround&clip=walk&frame=<k>&speed=<v>` freezes
  gait drawing k at 8 facings.
- The Read tool shows only a GIF's first frame: judge from `game-onion.png`, `clip-game.png`, per-drawing raw crops or a
  1× frame sheet (a ×3 strip flatters small leg motion).
- Judge from 1× renders, enlarge nearest-neighbour only; pans in tests are whole texels.
- Bakes: no `--cell` (auto growth); `--cell N` is the square RENDER cell, printed cell trimmed (`132 → 62×71` is normal);
  `--q fx=0` for FX-free sheets; bisect bad bakes per clip; check the baked walk has N drawings (a start-up skip once baked
  3 of 4); bake into `shots/char-<id>/bake/`, copy to `out/sprites/` last. Use `--preset cast` or a separate `--out`.
- `console.error` in any module = a page error in every job; env vars reach the host only via `tools/remote.sh env X=1`.
  Night freeze/pan tests pass `lantern=0&cover=0`. Prove refactors with full-pack A/Bs, raw frames diffed.

## 12. Unattended runs

- **Never run a raw `rm`** (`rm -f`, `rm -rf`, worst with a glob): it triggers a permission prompt and the agent stalls
  until a human clicks — a whole night was lost. Use `tools/clean.sh shots/<your-dir> ['*.png']` (local + render host,
  refuses anything outside shots/ or out/) or write into a fresh versioned folder. No `sudo`, no edits outside the repo.
- **One call at a time through the wrappers** (`tools/shot.sh`, `tools/charpack.sh`, `tools/remote.sh`): raw ssh/xargs
  batches were blocked by the permission classifier, and one mangled `&` so every still rendered the mannequin.
- **(recurring) zsh doesn't word-split `$v`** (`for k in 'vote 3'; set -- $k`): stills silently rendered idle:0 under wrong
  names. Explicit commands, arrays, or `bash -c '…'`.
- **(recurring) Nothing runs on the editing machine** when there is a render host: a local `python3` was a silent no-op.
  `tools/remote.sh python3 …`; remote helpers saved as `shots/char-<id>/<x>.py.js` so they sync; pull with
  `tools/pull.sh shots/<dir>`.
- **(recurring) Parallel agents collide** in shared scratch and render trees (generic `g8.sh`/`zoom.py` overwritten, one
  agent rendering another's stills, a stale `out/` pushed over a fresh bake). Helpers carry your id; write only under
  `shots/{char,critic}-<id>*/`; bake into your folder.
- **Pin one render host per session**; record the GPU line from the shot log.
- **Resume**: a workflow resume reuses only the unchanged PREFIX of agent calls in identical order; parallel waves never
  replay in order, so a blind resume re-ran finished agents. After a halt (usage limit, crash), inventory what finished
  and launch a fresh continuation with only the rest. Put rules like "no raw rm" in agent prompts BEFORE launch (editing
  them later forces a restart). Keep concurrency moderate (~4 agents) so usage lasts the night.
- Don't write shared outputs (`out/sprites/`, modules): report them; shared-code bugs go to the module backlog.

## 13. Shared-module fixes already applied (why the code looks the way it does)

Fixed in `src/chars/*.js`, `scenes/char-stage.js` and `tools/*` after characters hit them, each with a full-pack A/B (0 px
changed outside the intended jobs). If a note or instinct suggests a workaround for one of these, verify on the current
tree first. T-/M-numbers are the old backlog ids.

**Look:** inner lines only, no silhouette line or edge highlights; far-half shadow per bone by NAME, props lit normally;
`selfShadow: 'hull'`; `shadowSnap` shifts shadow caster and lookup by the same sub-texel phase (travelling self-shadow
specks 48 frames → 0); cloud shadow once per character; `sigLift`/`faceLift` 0.3.
Opt-ins: `material.merge` (no junction lines), `whiteKeep`/`whiteKeepLift` (whites at golden), `spec.lights` +
`uCharTime` (lights in the spec, frozen with the stage clock), `spec.ghost` (shared pale/spent ghost with dissolve,
night glow, halo, floating legs — replacing a 60-line shader recipe that 13+ characters had copied).

**Motion:** `clip.hold` (votes/dies stay down) and `clip.dynamics: 'hold'` for one-shots (action hold redraws → 0); loops
honour `clip.dynamics` (M5); chain resets clear link state (no first-drawing pop, deterministic); tip links aim along their
own axis; curled and `rigid` chains. LegGait body plans tuned for game speed (biped, bird, quadruped, hop, glide, fly).
**M1** LegGait plays authored `clips.walk/run` for non-leg bones (`interp: 'step'`, length = drawings, f0 = left contact,
`blend: 'add'`) — channel-routing hacks are obsolete. **M2/M3** `plant: 'hold'`: sprite-style leg drawings, body drop
≤ 0.1·leg (no seated chibis), no per-frame re-pin (off_grid 13-29 → 1), surge off for legs ≤ 0.25 H. **M4** `accelLean`
caps. **M6** hops don't plant upright arms. **M7** first cycles don't skip drawing 0. **M8** recovery steps are two
drawings, head lag settles once (calmer turns). **M9–M11** bird squash on a leaf bone, per-ancestor riders,
`locomotion.crouch`. **M13** a key equal to the drawing on screen isn't redrawn. **M14** glide pulses give N distinct
drawings. **M15** only planted feet cause the reach dip. **M18** no leg flicker on the walk-start frame. Events fire on
their own frame. Rig: `chibi({ neck })`, `jaw: { back: true }`, `'<bone>.l'` reach, templates at cast scale,
`planInfo(word)` for the three plan vocabularies.
Still open (work around, report): no skirt clamp for IK'd feet, spring lag at game speed, no per-bone additive walk keys.

**FX:** everything in §8 marked "now" — smear tilt/front, `thrust`/`claw`, hold-safe 15 fps stepping in phase with
birth, smears only on displayed KEY changes, one-drawing flashes, light sparks and dust, steady speech bubbles.

**Tools:** every row listed in §11 was born from a hand-measured critic finding (plus `single_frame`, `pan`, strobe,
`final_hold` — which also fails if the last pose is idle — and per-spec `heightPx`/`presence`). Vote/die holds and talk
islands come from fx=0 copies; foot slide is measured at pose-id changes, at dir 2, over every declared foot, n/a when
nothing is planted. **T1** `frame=` on loop clips is the real key (it was +8 frames off). Every pack has the game-speed
job, 1× GIFs and onion skins. Bake cells are sized from an fx=0 pass. `remote.sh` never pushes `out/sprites/`; `pull.sh`
brings results back; `clean.sh` replaces raw `rm`.

---

## Your project's lessons

<!-- Append below. One bullet per lesson: symptom -> cause -> rule, with numbers and the file/facing where you saw it.
     If a rule above already covers it, extend that bullet and mark it (recurring) instead of adding a duplicate. -->
