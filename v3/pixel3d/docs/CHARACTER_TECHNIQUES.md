# Character techniques (authoritative decisions)

Synthesised from `research/05-t3ssel8r-characters.md` (**T5**: what t3ssel8r showed/said, measured from
his footage; refs in `refs/chars/`) and `research/06-character-implementations.md` (**I6**: community code,
Dead Cells, Guilty Gear Xrd, Rosen/Overgrowth, Rain World, pixel-art readability rules, IK and gait maths).
Read the cited section when you implement something; this page only records the decisions and numbers.

Tags: **[src]** quoted/measured, **[decision]** our pick where sources are silent or disagree,
**[suggested]** a starting value to tune.

## 0. The one-paragraph summary

t3ssel8r's player is "just a regular low-poly character model" [src T5 §2]. Everything that makes it read as
pixel art is **how it is animated and rendered**: held poses on a 30 Hz grid with no mid-swing in-betweens,
a generated one-frame **smear** carrying the big motion, wide flat swings that read from any yaw, a root
that glides smoothly but is snapped to the texel grid, the same 3-tone toon ramp as the world, **no dark
silhouette outline** around the character, the **far half of the body forced into shadow**, and a
high-value signature shape (his white hair) that reads at gameplay zoom. Secondary motion and procedural
bodies use his **f/ζ/r second-order filter**. We reproduce all of that in code.

## 1. Scale and proportions

- **Height 45–62 texels at 640×360** [src T5 §7]; our target **≈ 50 texels** at the reference zoom
  `viewHeight 10` (36 px/m) → **height ≈ 1.4 m** in world units. Also check at `viewHeight 12.5` (≈ 40 px).
- **≈ 4 heads tall** [src T5 §7] (I6: small sprites use a head of 1/3–1/4 of the height). Head ≈ 13–15 texels.
- Minimum thickness of any visible part: **≥ 2 texels (≥ 0.06 m)**; limbs ≈ 3–4 texels (0.09–0.11 m).
- One **signature high-value shape** (hair, hat, hood, helmet crest, tail tip) that is the lightest or most
  saturated mass on the character, so it reads at 48 px in grass [src T5 §7, white hair].
- Separate shells for cape/hood/hair/boots (each its own palette slot), flat-shaded, no textures.

## 2. Modeling (agent-authored, code)

- **[decision]** Rigid low-poly parts (boxes, 4–8-sided frustums/prisms, wedges, low convex hulls) bound
  **rigidly to one bone each**, merged into **one `SkinnedMesh`** (one draw call per pass) with per-vertex
  `color` (mid) + `toneHi`/`toneSh` attributes for the toon material (validated by `src/chars/spike.js`).
  Optional 2-bone blend only at shoulders/hips/cloth roots. [I6 §skinning: three r170 skinning works with
  onBeforeCompile materials, shadows and depth automatically; set `frustumCulled = false`.]
- Facets ≥ 3 texels; prefer 45° chamfers on the big masses; small busy parts get plain boxes (no chamfer
  speckle) — see CHARACTER_LEARNINGS.
- Optional SDF smooth-min → mesh for organic heads/bellies is allowed only if decimated to flat facets
  (I6 §5). Default: don't.

## 3. Rendering on the character [src T5 §6]

- Same toon ramp as the world (3 tones per slot); **2–3 visible tones per material** in his footage.
- **Outline flag `'char'`** [decision, new]: depth outlines only *inside* the character (where one character
  pixel is in front of another character pixel — cape over tunic, arm over body), **never against the world**
  (T5 §7: no dark silhouette line in any shot), and **no convex-edge highlights** on the character
  (not visible in his footage). Implemented as `FLAG_CHAR` in the outline pass.
- **Far half in shadow**: the limbs/body half on the far side from the camera are forced to the shadow band
  (keeps the LoN definition). **Per bone**, not per pixel (a limb never splits): the CPU decides each frame
  which side is far from the camera and passes a per-bone flag (side from the bone's bind x, |x| > 0.035 m).
  **Midline bones are not forced** (a per-pixel split cut the hair cap / chest into wedges, shots/look/c10.png;
  per-pixel is available as `characterMaterial({ midline: 'pixel' })`). At the two frontal facings the side turned
  away from the sun counts as far.
- **Root snapped** to the texel grid in camera space (`engine.camera.snapObjectToTexel(root)`); the root
  itself moves smoothly (option B, T5 §3.3) — stepped travel only for slow actions if the clip asks for it.
- Smears/FX: **unlit**, 2 flat light tones, **no outline**, depth-tested and depth-writing, opaque [src T5 §4.3].
  Normal pass: **depth-writing FX write `vec4(0.5, 0.5, 1, FLAG_NONE)` in `uPassMode == 1`** (a discard leaves the
  FX depth under the flag/normal of the surface behind → the outline pass rings the crescent, shots/fx/np-ab.png);
  only FX that do NOT write depth (points, overlays) discard or live on `LAYERS.COLOR_ONLY`.
- Cloud shadows on a character are evaluated once per character (root + 0.5 m), so a cloud edge never cuts the
  figure in two; cast shadows stay per pixel. Ground separation comes from palette hue/value, the signature
  shape and the far-half shadow — no rim light, no outline (none in any of his shots).
- Optional later: rotate+skew "cheat perspective" (T5 §8.5), dithered see-through occluders, height decal shadow.

## 4. Animation timing [src T5 §3, I6 §Dead Cells/Rosen/Saint11]

- **Key grid 30 fps** (clip `fps: 30`); poses are **held** (stepped). Small motions "on twos" (a new pose
  every 2 grid frames ≈ 15 Hz). Big actions: anticipation hold → **one** contact frame (+ smear) →
  follow-through hold → recovery. Extra frames go *before or after* a key, never in-between (Dead Cells).
- Cycles: authored as 4–6 key poses (contact / down / passing / up, mirrored) eased between keys but
  **sampled on twos** (15 Hz); idle 2–4 poses with the extremes held longer (I6 Slynyrd/Saint11). Bob 1 texel, never
  sub-texel. **[decision, process run 05] For the Clocktower cast the cycle is set by GAME SPEED (§5a), not by a stroll:
  4–5 drawings per cycle, each held 2 grid frames (cycle 0.27–0.33 s), like v2's 4 drawings at 12.5 fps.**
- Wide, flat swings that read from every yaw (no per-direction animation). **[decision, lead + critic]** "flat" means a
  wide arc, not a horizontal one at head height: on a character with a wide hat/hood, a horizontal slash at brim height is
  a 2–4 px sliver behind the hat from the back (wanderer dir 4); diagonal high → low slashes clear it from all 8 facings
  and give the diagonal C crescent of refs/chars/03b.
- **[decision]** Key-to-key differences on the dominant limb ≥ 25–40° (the 10°-is-invisible rule applied to
  differences): anticipation with the elbow folded ≥ 60° and ≥ 20° torso coil; follow-through ≥ 40° past contact.
- Clip switches only on frame boundaries (I6 aarthificial: mid-frame switching stutters).
- Facing: quantized to **8 directions (45°)** with hysteresis; a turn shows the intermediate facing for
  ≥ 1 pose frame (I6 DOGWALK uses 16 angles; we start at 8 for clean 2:1 lines).

## 5. Locomotion [I6 §2-3]

- **Distance-phased gait** (Rosen's stride wheel): phase = arclength / stride; no foot sliding at any
  speed. Feet planted in world space during stance (duty β ≈ 0.6 walk, 0.4 run); swing with a smoothstep
  forward + sine lift. Pure function of the path arclength s(t) (I6 gives `foot(s, S, o, beta, h)`).
- Two-bone **analytic IK** (I6 `solveKnee` + basis → local quaternion), recomputed from the rest pose every
  frame (no accumulation); pole = knee forward. Ground height from `opts.ground.heightAt`.
- Body: bob twice per stride (≥ 1 texel), lean into acceleration via SecondOrder, pelvis yaw ±4–8°.
- Walk/run speeds from Froude: walk Fr ≈ 0.2–0.3, run beyond 0.5 (chibi legs → higher cadence).
- Stops: end a move at a phase where both feet are planted; idle never freezes a foot mid-air.
- **Leg IK mode** [decision, lead, reference character]: `legIK: 'pose'` — the whole drawing (legs included) is held
  between pose frames and only the root glides; a stance foot is exact at every pose frame. A/B on the wanderer:
  `'frame'` (legs re-solved every display frame onto world-fixed feet) redrew 40–60 leg pixels at 60 Hz and made the
  hips dip 1 texel on off-grid frames; `'pose'` changes nothing between grid frames but the root's whole-texel
  glide (and 1–8 px of self-shadow specks, a lighting issue). New characters copy `character: { legIK: 'pose' }`.
- **Foot slide is measured at pose frames only** [decision, I6 §11]. The root glides every display frame
  while the pose is held, so between two pose frames a planted foot rides along with the root (≈ speed / pose
  rate ≈ 3 texels at 1.4 m/s and 15 Hz) — exactly like a hand-drawn sprite moved per pixel. What must hold:
  sampled at consecutive **pose frames**, a stance foot's world position is unchanged (≤ 1 texel). So the gait
  phase, IK targets and dynamics outputs are **evaluated at the pose-frame time** (quantise the arclength /
  phase, not just the displayed time), and the whole leg pose is held between pose frames.

## 5a. Game speed (Clocktower cast) [src: pipgws `PLAYER_SPEED = 150` px/s at 16 px/m, ≈ 38 px sprites, walk 4 drawings at `walkFps 10 × 1.25`; decision: process run 05]

- **Speed relative to size**: v_game = 4·H m/s (H = character height; v2 = 3.95 body-heights/s). One player speed;
  `walk` = v_game, `run` = Storyteller fast travel, planned at 2·v_game (the game allows up to 4×).
- **Cycle = whole drawings**: N = 4–5 drawings × 2 grid frames → one step = v_game·N·2/60 m (H 1.53, N 4 → 0.81 m;
  cycle length ≈ 1.1–1.3 H). A gait cycle shorter than N·2 grid frames aliases against the 15 Hz drawing rate: the stock
  wanderer at 6.1 m/s ran a 6-grid-frame cycle and showed only 3 of its 6 drawings (`shots/process/wanderer-gamespeed/`).
- **Feasibility**: stance span = β·C ≤ ≈ 0.9·hip → biped (hip ≈ 0.45 H) β ≤ 0.34 = a run with flight ("scurry");
  short legs (hip ≤ 0.3 H) cannot step at this speed → hop / bound / waddle-skip / glide / flutter; quadrupeds bound
  (β ≈ 0.25). Cadence floor: 4 drawings × 2 frames = 0.27 s per cycle.
- **What carries the read at 1×** (vh 10, H 1.4 → 200 px/s, ≈ 13 px of root glide per drawing): a whole-figure bob
  ≥ 1 texel, a hop apex ≥ 4 texels, ears/tail/wings swinging ≥ 25° per drawing pair. Legs alone are a ≈ 6×8 px patch and
  read as flicker (wanderer meadow test, `shots/process/gs-meadow/`).
- Judged on 1× real-time GIFs (33 ms per 30 Hz frame) at the gameplay camera, dirs 1 and 2, plus pose-frame foot slide
  over all feet. Body-plan gait numbers: PLAYBOOK §Body plans (motion/rig fill them).
- **Contact must be a visible drawing** [decision, lead, cast wave 1: all 8 chibis read as a glide at 1×]: on legs
  ≤ 0.25 H hidden by a robe/skirt/coat, "slide ≤ 1 texel" is unmeasurable (`foot_slide` n/a) and not enough. Each step
  shows one deliberate contact drawing: a foot/talon flick ≥ 3×2 texels out of the hem in a contrasting tone, a prop
  tip planted on the ground, or a hop landing after an apex ≥ 4–6 texels above stand. Shared-code support: LegGait
  authored poses, 'hold' leg drawings and the short-leg drop cap are in (module fix M1–M3).
- **The contact drawing shows the feet** [decision, lead, cast wave 2: 5/7 failed it]: on the contact drawing at dirs 0,
  1 and 2 every planted foot shows ≥ 2×2 texels outside the body/skirt, and both contacts of a cycle drop the head ≥ 3
  texels (a roll can cancel one: chonk's limp). Squash, roll and hems must not bury or pierce the feet (rabbit's boots
  through the dress, chonk's buried feet; LegGait hem/tuck mode pending: backlog M12).
- **Every key is a different drawing** [decision, lead, cast wave 2]: consecutive authored keys of talk/emote/walk differ by
  ≥ 25 % silhouette or a big part ≥ 3 texels at dir 1 and S; pose-id counts (`game.readable`) are not drawings.

## 6. Second-order dynamics [src T5 §5, §8.1]

`y + k1·ẏ + k2·ÿ = x + k3·ẋ`, `k1 = ζ/(πf)`, `k2 = 1/(2πf)²`, `k3 = rζ/(2πf)`. Use his shipped v3
update (k2 clamp when `ωT < ζ`, pole matching otherwise) at a **fixed 60 Hz step**; quaternions: flip x if
`dot(x, y) < 0`, normalise after. Displayed results are sampled at the pose rate (stepped). Quaternion port gotcha [I6 §3]: flip the
*input* to the target's hemisphere before the update, and start ẏ at zero (not at the position value).

| use | f | ζ | r | src |
|---|---|---|---|---|
| body/root follow with anticipation (robot) | 2 | 0.5 | −2 | [src T5 §5.2] |
| body turn (robot) | 3 | 1 | 0 | [src ζ, r; f suggested] |
| head lag after body | 1.5–2 | 1 | 0 | [src: "smaller f"] |
| cape / scarf / hair / ears / tail bones | 3–5 | 0.4–0.6 | 0–1 | [suggested T5] |
| lean toward velocity / weapon follow | 2–3 | 0.7 | 0 | [suggested T5] |
| rope/strap mid-point (quadratic Bézier) | 2–4 | 0.3–0.5 | 0 | [src T5 §8.6] |

Display [decision, motion + lead]: dynamics are integrated at 60 Hz but only SHOWN as new drawings (on twos) when a
quantised channel changes: Character `quant` = lean 1.5°, body/head yaw 3°, chain directions 1/12 by default. Coarser
quanta (wanderer: yaw 8°, chain 1/8; `quant.chain` is buckets per unit, so a LOWER number is coarser — small chains
use 4: duelist idle A/B chain 8 → 3 plume redraws per key, 4 → 0) turn a slow catch-up into 2–4 held drawings instead of
a 15 Hz crawl of tiny steps (which reads as smooth 3D motion). Every chain must settle within ≈ 0.5 s (scarf f 4, ζ 0.55),
and inside authored action holds it should not redraw at all (hold ≥ 6 frames → 0 redraws > 8 px; PLAYBOOK Stage 4).
Short accessories use 1-link chains (multi-link chains converge once per drawing — motion backlog).

Personality mapping [suggested]: snappy = f 4–6, ζ 0.5; heavy = f 1–1.5, ζ 1; bouncy = ζ 0.3, r 1.5;
anticipating = r < 0; sluggish = r 0, f low.

## 7. Smears [src T5 §4, §8.3]

- Generated at runtime per weapon/limb socket from the previous and current pose (positions + orientations,
  his 3-lerp/3-slerp curve with handles fitted to a circular arc), **only** if the swing angle ≥ 40° and the
  edge leads. Fan ribbon, 16–24 segments, inner radius 0.35 × blade for long weapons (spear, greatsword) but
  **0.05–0.12 for blades < 0.8 m** (0.35 gave a thin 5–7 texel crescent on a 0.6 m sword; his are 8–12 texels and
  reach the hand). **≤ 170° of blade rotation per smear key** (a quaternion difference measures ≤ 180°: a 190° key
  smears the short way); spins = several smear keys of 110–125° on the hips twist.
- Lifetime 4/30 s in **4 stepped stages on the 30 Hz grid** (refs/chars/03b, 2 frames each at 60 fps): full →
  eroded (inner 30 % eaten, trailing end in bristles) → 1-texel streaks along the outer arc → a few dashes → gone.
  Kept in world space, not parented, texel-snapped.
- Two flat light tones (default `#ACB8B8` body / `#BCC4C4` outer band, or the weapon/limb's own hi tone),
  unlit, no outline. On lit meadow (#BBD985) the default is < 5 % different in luminance: characters for grassy scenes
  use a ≥ 15 % lighter pair (wanderer `['#C4CED0', '#DCE2E2']`).
- The clip has **no in-between keys** during the swing: the smear *is* the in-between.

## 8. Verification numbers (feed `tools/charcheck.py` and the critic)

- height 45–62 texels at vh 10; head 1/3–1/4 of height.
- static pose + whole-texel pan → 0 changed pixels inside the character (shifted diff).
- pose changes only on the 30 Hz grid; cycles change ≤ 15 Hz; root moves every frame.
- foot slide ≤ 1 texel during stance, measured between consecutive POSE frames (in-between display frames
  ride along with the gliding root by design), at the profile facing (dir 2), over every foot/paw. (charcheck still
  measures 60 Hz frames at dir 1 on `bones.feet` only — tools backlog.)
- holds: ≤ 2 consecutive 1-grid-frame changes outside smear stages; holds ≥ 6 frames have 0 redraws > 8 px; settle steps
  ≤ 10 px (not yet a charcheck row).
- signature: ≥ 50 % hi/mid px in ≥ 6/8 facings at noon; vs lit grass ≥ 30° hue or ≥ 25 % L at noon and golden; in the
  pillar shadow at least as light as the body's sh and ≥ 15 % L over grass shadow (not yet charcheck rows).
- smear contact frame at all 8 facings: ≥ 8 texels of connected crescent, light px ≥ 25 % of the best facing.
- every key pose at all 8 facings: face uncovered at S/SE/SW, head world pitch −15…+5° (hats/hoods) or ±35° (quadrupeds).
- no dark silhouette outline pixels against the ground (sample the ring of pixels just inside the silhouette:
  ≤ 10 % darker than the adjacent interior).
- far-side limb one band darker than the near-side one.
- smear: present only on the 3 stages after a swing key, no outline pixels.
- turnaround: the same pose at 8 yaws is recognisable as the same character (critic) and the silhouette area
  varies < 40 % between facings.
- face lit: ≥ 50 % of the face pixels in skin hi/mid at noon in S/SE/SW (`face_lit`); an overhang's shadow-map shadow
  must not turn the face into a mask (look owns the self-shadow exemption).
- signature part: ≤ 2 isolated px per facing (`isolated_px`; dotted inner lines and sub-texel facets show up here).
- no drawing held for one grid frame except smear contacts and clip switches (`single_frame` 0).
- no part changes value band with facing except L/R limbs (the `look=far` turnaround shows magenta only on sided parts).
- game speed (§5a): at v_game every one of the N cycle drawings shows in every cycle (distinct pose ids per cycle = N);
  the runtime plays the intended clip (`walk:` pose ids at v_game); contact visible in ≥ 2 drawings (or a deliberate
  hop/glide key) with ≤ 1 texel slide at pose frames at dirs 1 and 2; bob ≥ 1 texel; the gait nameable in one word at 1×.
- cast clips: talk loops with a ≥ 25° beat every 8–14 grid frames and a mouth/beak change ≥ 2 texels; vote reaches its
  raised pose in ≤ 6 grid frames and holds with 0 redraws > 8 px; die ends on a held "down" pose readable at 25 %.
- self-critique: every rubric score cites a file + facing/frame + a number; an unrun check caps that criterion at 1.
- cast clips (lead, wave 3): point (held, pointer leaves the 25 % outline ≥ 4 texels at S/SE/SW/W), ghost and ghost-spent
  loops are required (`cast_clips`); run is optional.

## 9. Probing techniques that settled arguments (wave 3)
- **Variant-spec probe on ONE 8-facing still**: copy the spec to `shots/char-<id>/wv.js` (kit import rewritten to
  `../../src/chars/kit.js`), take JSON overrides for any clip key from the query (`ck/kf/kp`), and render 3–5 candidate
  poses (die finals, card twists, arm triples) as keys of a throwaway clip. Cheaper and more reliable than reasoning about
  q = qFwd·qOut·qTwist (preservation, polly, clarabelle, cilantro).
- **Part-drop variant** (`&drop=<part>`): find which part reads as what (opal's "eye" at E/W was the ear).
- **Measure, don't eyeball**: a remote helper (`shots/char-<id>/<x>.py.js`) counting rows on the 8-facing still — neck
  texels at S (cilantro), prop top vs ear top (mincut), head-top row per die key (clarabelle).
- **Surface cut-outs** for marks that must stay one glyph at 1× (polly's λ, eye patches): triangles of a subdivided
  lathe whose centroid lies in the stroke get the mark's slot — no proud boxes, nothing at profile.
- **TINY-scale hidden props**: geometry and child offsets × 0.001 on their own bone, shown with `'<bone>.s'` 999 on the
  keys that use them (mincut scissors, fox ghost shell).

## 10. Held props and asymmetric gaits (wave 5, NPCs)

- **Prop bone AT the hand, shaft through the bone origin** (sweeper `BROOM_PIV`): every `fwd`/`out` on the prop bone then
  pivots the stick in the fist; no `<prop>.p` slide (a slide along a raised arm left 7 texels of air at S). Grip ≈ 1/3
  down a long prop lets a 20–35° lean put the fan/tip on the grass.
- **Hoisted prop from the arm FK** (porter r2): y' = −cos(fwd), dir = (−y'·sin(out), y'·cos(out), sin(fwd)) for the right
  arm, hand = shoulder + (upper·(1 + .l) + forearm + ½ hand)·dir, prop centre = hand + half its height up; verify with
  `mark=@handR` (≈ 1 texel). Raise height with `.l` reach: at E an `out` component points at the camera and lowers the
  hand on screen (screen-up ≈ up·cos 30° − toward-camera·sin 30°).
- **Limp = keyed `pos` per walk drawing** (elder r2): the LegGait biped bob is mirror-symmetric; in `clips.walk` (replace
  mode) key light contact −0.008, flights 0, heavy contact −0.044 + chest +10 → `game.head_bob` limp 1.6 px.
- **Lying direction = hips `out`** after hips `fwd` (q = qFwd·qOut·qTwist; `twist` only rolls the body about its long
  axis); verify ground contact on a `pitch=4` still.
- **Held-key silhouette diff** (elder `shots/char-npc-elder/el_sil.py.js base.png key.png out.png`): new px outside the
  idle outline per facing on bg=key 8-facing stills — the one number for "does the point/vote leave the body".
