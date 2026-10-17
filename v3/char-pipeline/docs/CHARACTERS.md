# pixel3d characters — pipeline contract (every character agent reads this first)

> **Unattended-run rule (read first):** these runs go overnight with nobody at the keyboard. NEVER run a raw `rm`
> (any `rm`/`rm -f`/`rm -rf`, especially with a `*` glob): it triggers a permission prompt for the user and your agent stalls
> until someone clicks. To clear old renders use `tools/clean.sh shots/<your-dir> ['*.png']` (local + render host, only
> inside shots/ or out/), or simply write into a fresh versioned folder (`shots/<you>/r2/`). Same for other prompt-prone
> commands: no `sudo`, no deleting outside shots/out, no editing files outside the repo.

> **Clocktower-only rule (user, 2026-10-16):** cast members are used ONLY as player characters in the Clocktower social-deduction
> game. NO attacks, weapons swings, combat smears, hurt/hit reactions or fighting poses — props (sword, shovel, staff) are worn/held
> for identity, never swung at anyone. Clips the game actually uses: **idle**, **walk** (THE game-speed gait; `run` is optional/low
> priority — the game has one movement speed), **talk** (speaking loop), **vote** (raise hand/wing/paw + hold), **point** (the game's
> shared emote: point toward someone), **die** (a gentle, non-violent collapse/fade to a held pose — executions and night deaths
> happen off-screen), **ghost** idle (dead players hover as a pale translucent-looking ghost; also a "ghost-spent" variant = dimmer,
> used after the ghost's one vote), and ONE social signature emote from the blurb (a gesture, not an action against anyone).
> Smears are for quick gestures (a pointing flick, a wave), not strikes. Critics: score these clips, ignore missing combat.

Goal: agents (LLMs writing code, no GUI tools) reliably author **new game characters** — model, rig,
animate, render, bake — that look like t3ssel8r's 3D pixel art, on top of the existing pixel3d renderer.
Read `docs/PIPELINE.md` first (engine, material contract, how to render; render host **the render host only** — never the game server, the live Clocktower game server). Technique notes for
characters: `docs/CHARACTER_TECHNIQUES.md` (synthesised from `research/05-*.md`, `research/06-*.md`).
How to make a new character, step by step: `docs/CHARACTER_PLAYBOOK.md`. Accumulated lessons:
`docs/CHARACTER_LEARNINGS.md` (append-only; read it before you start, add to it before you finish).
**Reference character** (copy it to start): `characters/wanderer.js` + its design sheet `characters/wanderer.md`;
its pack is `shots/char-wanderer/`. The bare base biped is `characters/mannequin.js`.

Everything here is plain ES modules + three r170, deterministic, no build step, no external art.

## 1. Conventions (all modules, all characters)

- **Units / axes.** 1 unit = 1 m. y up. A character is authored at the origin, standing on y = 0,
  **facing +Z**. So **+X is the character's LEFT** and −X its right. Bone/part names use the character's
  own side: `upperArmL` is on +X. A name ending in `L`/`R` (+ optional digits: `earL0`) is sided, else midline.
- **Rest pose** = all bone rotations zero (identity), every bone's local frame = character axes. Biped rest is a
  "soldier" pose: arms hang straight down along the sides, legs straight. Limb bones point down (−Y) at rest.
- **Pose values** are degrees, per bone, as `[fwd, twist, out]` (a "pose triple"), never raw Euler. The axes
  come from each bone's rest direction SNAPPED to its dominant axis (full table: header of `src/chars/rig.js`):

  | rest dir | `fwd` + (tip moves …) | `out` + | `twist` + |
  |---|---|---|---|
  | down (limbs, capes, hair, scarf) | forward (+Z) | away from the midline (L and R alike) | front turns outward |
  | up (spine, neck, head) | forward: bend / nod | midline: tilt to the character's LEFT | midline: turn LEFT |
  | fwd/back (foot, tail, quadruped spine/head) | DOWN (toe points, tail droops) | to the LEFT / outward | roll |
  | sideways (ears, wings) | forward | UP | top turns forward |

  - Knee: a **negative** `fwd` folds the shin back (`shinL [-90,0,0]`); elbow: positive folds the forearm forward.
  - **R bones mirror L bones: the rig flips both `out` and `twist` for R**, so the same triple on `armL`/`armR` is
    the mirror image. `rig.mirrorPose(pose)` swaps L/R names (sided triples unchanged) and, for MIDLINE bones,
    negates `twist` and `out` (a true mirror) and `pos.x`. Always build L/R variants with `mirrorPose`.
  - `pos: [x, y, z]` in a pose = an **offset** in metres (character space) from the root bone's rest position
    (crouch `pos: [0, -0.08, 0]`), or `pose.hips = { rot: [..], pos: [..] }`.
  - At 50 texels a 10° change is invisible; poses use 25–80°, and **consecutive action keys differ by ≥ 25–40° on the
    dominant limb** (a follow-through 11° + 6° past contact was the same drawing as the contact).
- **Scale and pixel budget** (§6). Every visible feature ≥ 2 texels thick at the reference zoom.
- **Flat, low-poly, 45°-friendly geometry** (same as the world): boxes, chamfered boxes, prisms, frustums,
  wedges, lathes, low hulls (`src/chars/kit.js`). No smooth subdivided meshes.
- **Colour.** Each palette slot is `[hi, mid, sh]` sRGB hex: warm highlight, mid, cool desaturated shadow.
  ≤ 5 slots per character + 1 accent. No pure black/white. Shadow tones of different slots differ in hue ≥ 20°.
- **Determinism.** Everything is a pure function of the engine time `t`. Stateful parts (dynamics, gait,
  chains) integrate with a **fixed 1/60 s step** from t = 0 and re-simulate from 0 if `t` goes backwards or
  jumps > 1 s ('reset' event). No `Math.random()` / `Date.now()`; use `rng(seed)` from `src/core/noise.js`.
- **Stepped motion.** The *drawing* (every bone rotation) changes only on the 30 Hz key grid (held poses; cycles
  and dynamics on twos); the *root* moves every frame snapped to whole texels. Facing is quantized (8 directions)
  and turns are stop-motion. Smooth sub-texel limb motion = "reads as 3D game", the #1 failure.

## 2. Files and ownership (one owner per file; ask via `CONTRACT-REQUEST:` lines in your report)

| owner | files |
|---|---|
| lead | `docs/CHARACTERS.md`, `docs/CHARACTER_TECHNIQUES.md`, `docs/CHARACTER_PLAYBOOK.md`, `src/chars/index.js`, `src/chars/spike.js`, `characters/wanderer.{js,md}` (reference), `tools/charexports.mjs`, `pipeline/03-*.js`, `pipeline/04-*.js` |
| rig | `src/chars/kit.js`, `src/chars/rig.js`, `characters/mannequin.js`, `scenes/_test-rig.js` |
| motion | `src/chars/anim.js`, `src/chars/dynamics.js`, `src/chars/ik.js`, `src/chars/locomotion.js`, `src/chars/character.js`, `scenes/_test-motion.js` |
| look | `src/chars/look.js` (character material, far-half shadow, `FLAG_CHAR`), and — additively, for `FLAG_CHAR` only — `src/core/glsl.js`, `src/post/outline.js`, the `OUTLINE` map in `src/materials/toon.js`; `scenes/_test-look.js` |
| fx | `src/chars/smear.js`, `src/chars/fx.js`, `scenes/_test-smear.js` |
| tools | `scenes/char-stage.js`, `scenes/char-bake.js`, `tools/charpack.sh`, `tools/charpack.py`, `tools/charcheck.py`, `tools/bake.py` |
| char-`<name>` | `characters/<name>.js`, `characters/<name>.md` (design sheet), `shots/char-<name>/` |
| everyone | append-only: `docs/CHARACTER_LEARNINGS.md`, `src/core/noise.js` (new exports only) |

World modules (`src/world/*`, `src/post/*`, `src/core/*`, `src/materials/*`) are **read-only** for character agents;
if one must change, write a `CONTRACT-REQUEST:` with the owner from PIPELINE.md.

## 3. Character definition (`characters/<name>.js`)

A character is one ES module whose default export is a **spec** (plain data + small helper calls). Agents write
specs; modules turn specs into meshes and motion. Complete, working example: `characters/wanderer.js`.

```js
import { biped } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';
const S = biped({ height: 1.38, heads: 3.8, shoulders: 0.37,               // skeleton + S.meta (joint heights)
  chains: { scarf: { n: 3, parent: 'chest', at: [0.05, 0.19, -0.125], dir: [0, -1, -0.35], len: 0.5 } } });
export default {
  name: 'wanderer',
  height: 1.53,                         // ground → top (hat apex); stage framing / cell sizes. ≈ 47 texels at vh 10
  palette: { hat: ['#F7EBC4', '#DDC48A', '#A48A86'], /* … ≤ 5 slots + accent */ },
  signature: 'hat',                     // slot of the signature part (charcheck isolated_px / tone samples)
  skeleton: S,                          // biped(opts) | quadruped(opts) | [{ name, parent, pos, axis?, limits? }]
  parts: [                              // rigidly bound to one bone (or `blend`), all merged into ONE SkinnedMesh
    { bone: 'head', shape: K.lathe([[0.33, 0], [0.29, 0.035], [0.25, 0.065]], 8),   // brim band of ONE convex profile;
      at: [0, 0.34, -0.01], color: 'hat', name: 'hat' },                            // band + top = more bands of it
    { bone: 'upperArmL', shape: K.frustum(4, 0.078, 0.072, 0.21), at: [0, -0.1, 0], color: 'coat', mirror: true },
  ],
  sockets: { weapon: { bone: 'handR', at: [0, -0.045, 0.01], rot: [90, 0, 0] } },
  chains: [{ name: 'scarf', f: 4, zeta: 0.55, r: 0.5, gravity: 0.6, falloff: 0.85, noForward: true }],
  personality: { body: { f: 3, zeta: 0.65, r: 1 }, head: { f: 2.8, zeta: 0.85, r: 0 } },
  locomotion: { walkSpeed: 1.3, runSpeed: 3.2, elbows: [40, 50], arms: [34, 45] },
  character: { legIK: 'pose', quant: { yaw: 8, chain: 8 } },   // Character runtime defaults (§5); chain: HIGHER = finer
  clips: { idle: {/* §4 */}, attack: {}, hurt: {} },            // walk/run: procedural gait unless authored
  smears: { weapon: { length: 0.465, inner: 0.12 } },           // attachSmears socket opts (scenes attach them)
  fx: { weapon: { socket: 'weapon', length: 0.465 } },          // attachFx opts
  material: { sides: { scarf0: 'mid', scarf1: 'mid', scarf2: 'mid' } },   // characterMaterial opts: midline chains
};
```

- **Skeleton.** `biped()` bones: `hips, spine, chest, neck, head, upperArmL/R, forearmL/R, handL/R, thighL/R,
  shinL/R, footL/R` (17) + chains. Chains are `<name>0..n-1`, or `<name>L0..`/`<name>R0..` with `mirror: true`
  (`at`/`dir` authored for the L side). Options: `height 1.4, heads 4, shoulders 0.40·k, hips 0.17·k, legs 1, arms 1,
  neck, footLen, chains`. `S.meta` = joint heights / segment lengths (`k, hl, headY, neckY, shoulderY, chestY,
  spineY, hipsY, thighY, kneeY, ankleY, upperArm, forearm, hand, thigh, shin, …`): **place parts from it** so
  `make({ heads, height })` re-proportions without re-authoring. Default sockets: `handL, handR, back, head`
  (quadruped: `head, mouth, back, tailTip`). The legacy biped Gait assumes the biped bone names; non-biped plans use
  `spec.locomotion.plan` (LegGait, §5).
- **Body-plan templates** (rig r6, `src/chars/rig.js`, registry `RIG_PLANS`): `chibi({ px })` (THE cast plan, ≈ 24 of
  32 members: 2.5 heads, leg ≈ 0.25 H, H = `castHeight(v2 px)` = 0.04 m/px, ≥ 1.05 m), `uprightAnimal()`, `quadruped()`,
  `longNeck({ base: 'upright'|'quadruped' })`, `bird()` (+ moth variant `RIG_PLANS.moth`), `hopper()`,
  `limbless({ kind: 'snail'|'blob' })`, `face(S)` (eyes/brows/mouth bones), `squashPose`, `PLAN_POSES['chibi.vote' …]`.
  `planInfo(word)` maps any plan word (CAST_PORTING / charcheck / LegGait spelling) to `{ rig, check, locomotion }`:
  set `spec.bodyPlan = info.check` and `spec.locomotion.plan = info.locomotion`. Every template except `biped()` has
  `head` and `mouth` sockets (bird also `beak`, bird/moth `wingTipL/R`). Try any of them with the real runtime:
  `tools/charpack.sh mannequin --q plan=<p>`. Per-plan numbers: PLAYBOOK §Body plans.
- **Parts.** `{ bone, shape (kit geometry, centred), at: [x,y,z] (from the bone joint, character axes), rot: [x,y,z]°
  (Euler XYZ about the part's own centre, applied before `at`), scale, color: '<slot>' | [hi,mid,sh], mirror: true
  (L bone → R copy), blend: true | { with, span, weight } (2-bone skinning), name }`. Put props (swords) into the
  socket's frame with `K.xf(geo, { rot: socket.rot, at: socket.at })` and `at: [0,0,0]`.
- **Weapon socket convention** (smear.js): socket **+Z = blade (hilt → tip), +X = cutting edge, +Y = swing axis**.
  On `handR` with `rot: [90, 0, 0]` the blade continues the forearm line and +X (edge) faces the character's left:
  forehand slashes (arm swinging right → left) have the edge leading. A chop needs `upperArmR` twist −90 (edge
  forward) or `doubleEdged: true` on the smear socket.
- **Sides** (far-half shadow): look sides bones by NAME — `…L`/`…R` (+digits) are sided, other bones take the nearest
  sided ancestor, else midline (`sides: {bone: 'auto'}` restores the old bind-x test). Midline accessories (scarf tail,
  tail, cape, braid) are named without L/R and rooted at |x| ≤ 0.03 m. **Held props** (look r5, `props: 'mid'` default):
  a part on a bone below a hand bone, or on the hand bone reaching > `propReach` 0.2 m from the hand joint, is no longer
  far-forced — the old `{ handR: 'mid', lantern0: 'mid' }` workaround in `material.sides` is not needed for new
  characters (keeper/duelist still carry it; harmless). Per-slot overrides: `material.slots {slot: {lift, side, hint}}`.
  Caveat: bird/hopper templates name wing tips / front paws `hand…`, so long feathers there count as props — give them
  `material.slots {x: {side: 'sided'}}`.
- **Lift** (look r5): the `spec.signature` slots/parts get `sigLift` 0.3 and the face slot (`spec.faceSlot`, else the
  skin slot on the head bone) `faceLift` 0.3 on faces not pointing down; cast shadows still darken them. Animals with no
  skin slot MUST set `spec.faceSlot`. A second light mass goes in the signature array or `material.slots {belly:{lift}}`.
  Opt-in `material.hints {slot: 'fur'|'feather'|'scale'}` (round bodies only; judge at 1x). Debug `?look=opts`;
  A/B `?lookOpts=sigLift:0,faceLift:0,props:0,shadowSnap:0` = the run-04 look exactly.
- **Signature part** (`spec.signature` = ONE slot; a two-part signature is only half-measured — check the other part by
  eye): one convex outline region, or for concave reads (cocked brim, crown) ≥ 2 parts meeting with a ≥ 0.03 m step;
  colour bands on a convex one are bands of the SAME profile (coincident surfaces, no depth step → no inner line); no facet < 0.03 m (1 texel). Dotted 1-px inner
  lines on it read as grey speckle (`isolated_px` ≤ 2 per facing).
- **Chains** (`spec.chains`): `{ name, bones? (default name0..), f, zeta, r | preset ('cape','scarf','hair','tail',
  'ear',…), gravity 0.5, drag 1, limit 70 (° from the rigid-follow direction), falloff 0.85 (f × per link),
  noForward (capes/scarves never swing in front of the body) }`.
- **personality**: `body` (lean/chest lag) and `head` (head lag) = `{f, zeta, r}` or a preset name.
- **locomotion** (all optional; full list in the `src/chars/locomotion.js` header): `walkSpeed 1.4, runSpeed 3.4,
  stride` = **ONE STEP** length at walkSpeed (one foot plant to the other; cycle = 2·stride; default 0.68·hip
  height), `runStride` (1.8·stride), `duty [0.56, 0.36], lift [0.07, 0.12], bob [0.028, 0.035]` (m), `arms [34, 55],
  elbows [14, 80], lean [4, 12], twist [7, 11]` (°, [walk, run]), `poses [8, 6]` (drawings per cycle), `spacing,
  runFroude [0.4, 0.5], reach 0.45, maxSwing 0.3, bones {legL:[thigh,shin,foot], …}`.
- **character**: defaults for the Character options (§5), e.g. `{ legIK: 'pose', quant: {…} }`.
- **smears / fx**: the character's own smear sockets and FX options. `scenes/char-stage.js` (and game scenes)
  attach them: `attachSmears(engine, ch, { sockets: spec.smears })`, `attachFx(engine, ch, { ground, ...spec.fx })`.

**Cast-member spec fields (run 05; process owner; updated by the lead r6 to match the code).** Every Clocktower cast
member's spec also declares the following; all of them are read by the code today.

```js
  bodyPlan: 'biped' | 'uprightAnimal' | 'quadruped' | 'bird' | 'hopper' | 'limbless' | 'flier' | 'longNeck',  // = planInfo(word).check
  heightPx: [40, 56],                   // charcheck height_px target override (texels at vh 10); plan defaults in §7
  signature: ['hood', { part: 'beard' }],   // slot, part or an array of both (each gets sig.<name> rows, §7)
  faceSlot: 'fur',                      // look faceLift target when the face has no 'skin' slot (animals)
  gameSpeed: {                          // PLAYBOOK §Game speed — the numbers the walk/run are tuned and judged at
    v: 4 * HEIGHT,                      // m/s; charpack's game-speed job uses it (alias of spec.game.speed; default 3.95·H)
    drawings: 4,                        // N drawings per cycle, each held 2 grid frames → cycle = N·2/30 s (sheet number)
    gait: 'scurry',                     // one word: scurry | hop | waddle | glide | flutter | bound | lumber | prance
  },
  locomotion: { plan: 'biped',          // = planInfo(word).locomotion → motion's LegGait (game-speed planting); omit = legacy Gait
    walkSpeed: 4 * HEIGHT, runSpeed: 8 * HEIGHT },   // walk = THE game speed, run = Storyteller fast travel (char-stage
                                        // walk/run clips play at these; without them 1.4 / 3.4 m/s)
  clips: { idle, walk?, run?, talk, vote, die, <emote> },   // standard cast clips (PLAYBOOK §Cast clips)
  emote: '<clip name>',                 // which clip is the signature emote (charpack/bake presets)
```
- `talk` loops; `vote` and `die` are one-shots ending on a held pose: `clip.hold` (default **true** for `vote`/`die`,
  `hold: false` opts out) keeps the last key until another clip plays (`play('idle')` releases it) or, when the drive
  started it, until `drive(t).action` stops returning its name. char-stage keeps returning the name for held clips
  (lead r6 fix), bake marks them `holdLast`. Final holds are audited (`final_hold`, 0 redraws > 8 px).
- A legacy-Gait biped at game speed picks the RUN by Froude and aliases (3 of 6 drawings shown, `game.readable` FAIL on
  all four shipped characters). Cast members use `locomotion.plan` (LegGait: quantised-phase planting tuned for 4 H/s; motion r5c packs show 0.27–0.29 s cycles, holds 2) —
  verify with the game-speed renders (PLAYBOOK Stage 6); the pose ids in the log show what actually played.
- The design sheet (`characters/<name>.md`) has the sections `## Unique to me` and `## Self-critique` (PLAYBOOK Stages 0
  and 7); the spec header comment links them.

## 4. Clips (`src/chars/anim.js`)

```js
attack: {
  fps: 30, loop: false,                 // KEY GRID (t3ssel8r: 30 Hz); the pose only changes on grid frames
  interp: 'step',                       // 'step' (holds, default for one-shots) | 'ease' (eased between keys,
                                        //  sampled every `twos` grid frames — default for loops)
  twos: 2, ease: 'inOutSine',           // ease sampling stride (grid frames) and curve (anim.EASE; per key `ease`)
  length: 24,                           // optional: grid frames (loops: the period)
  keys: [                               // f = grid frame; a key holds until the next key
    { f: 0, pose: { chest: [4, -15, 0], upperArmR: [85, 0, 75] } },                   // anticipation, held 7
    { f: 7, pose: { chest: [6, 14, 0], upperArmR: [90, 0, -25] }, smear: 'weapon' },  // contact: ONE frame + smear
    { f: 8, pose: { /* follow-through, held 8 */ } },
    { f: 16, pose: { /* recovery */ } }, { f: 22, pose: READY },
  ],
  events: { 7: 'hit' },                 // grid frame → name | [names] ('hit', 'hit@<socket>', 'hurt', 'land', 'stepL')
  root: { 7: [0, 0, 0.1] },             // optional smooth root offsets per frame (character space, eased)
  legs: 'fk',                           // optional: raw FK legs (default: keyed legs are grounded + planted per key)
}
```
- Bones missing from a key are at rest (0) for 'step' clips and ease to 0 for 'ease' clips. One-shots hold their
  last key ≥ minHold grid frames, then return to idle/locomotion (`done`) — unless `hold` (default for vote/die, §3).
  `dynamics: 'hold'` (default for one-shots): no dynamics-only redraws while the action plays, chains snap to rest on
  the return drawing ('snap' also snaps them on every key, 'free' = old behaviour). Loop period default = last key f + the
  spacing of the first two keys.
- **Idle** is a loop clip (`interp: 'step'`, extremes held long); with the Character its legs are IK'd onto the
  planted feet, so idle keys only the upper body + `pos`. No `idle` clip → `character.defaultIdle(rig)`.
- **walk / run**: procedural from `spec.locomotion` (stride wheel, planted feet). Authored `clips.walk/run` (loops,
  f 0 = left contact) override the UPPER body only and are phase-driven; give them ≥ 4 keys per cycle. Only the bones the
  clip keys are overridden (the rest stays procedural), and the clip's displayed frame drives the gait's pose clock: use
  `interp: 'step'` with one key per gait drawing (`length` 8 walk / 6 run) to keep the drawings per cycle. The wanderer's
  clips key only the sword arm (the procedural swing windmilled the blade).
  **LegGait (`locomotion.plan`, module fix M1, 2026-10-16):** authored walk/run clips now play there too, evaluated at
  the shown drawing's phase (`length` 4 = one key per drawing at the game speed); non-leg bones only. Default replace
  (a keyed `pos` replaces the plan's bob/hop arc, the reach drop is kept); `clip.blend: 'add'` adds the keys to the
  plan's procedural body. Migration: delete channel-routing workarounds (`locomotion.bones.armL: ['tail0', …]`, sink
  bones) for anything you now key in the clip.
- **Plant modes (LegGait, module fix M2/M3):** `locomotion.plant` 'auto' (default) | 'pin' | 'hold'; `holdDrop` 0.1,
  `maxDrop` 0.5, `contactReach` (fractions of leg length). 'hold' (auto for legs that cannot pin a plant through a held
  drawing: all chibis at 4 H/s) draws the legs as a body-relative sprite cycle with no per-frame re-pin and a body drop
  ≤ holdDrop·leg; 'pin' is the r5c re-pinned plant (drop capped at maxDrop·leg). `surge` defaults to off for legs
  ≤ 0.25 H. Details: header of `src/chars/locomotion.js` (PLANT MODES).
- **`<bone>.s` / `<bone>.p` channels** (module fix r2, documentation): `.s` is a scale OFFSET [x, y, z] added to 1
  (identity = [0, 0, 0]; [−1, −1, −1] hides the bone's parts), `.p` a position offset (m, parent space). Unkeyed bones
  reset to identity on every key, so a prop that only shows in one clip must be hidden (`.s` −1) in every other clip's
  keys — including `clips.walk/run` (LegGait plays them now) and the idle `breath()` helper — or authored tiny and
  scaled up in its own clip. Don't scale bead eyes in x (dark 1-px column, look row open); use y + roll.
- **Round-2 opt-ins** (module fix r2): `spec.lights`, `uCharTime`, `material.merge`, `material.whiteKeep`, chain
  `rigid`, rig `neck` / `jaw: { back }`, `locomotion.crouch`, bird `squash` — see the playbook's "Module fixes" block
  and `docs/CHARACTER_LEARNINGS.md` §Module backlog for numbers.
- **Wave-3 module fixes** (module fixer, after cast wave 3; opt-ins, 0 px for specs that do not use them):
  - **`spec.ghost`** — the shared ghost look (replaces the copied crow/polly `ghostK` bone + `material.tones` shader +
    micro halo + `pos` +0.1 recipe): `ghost: { hover: 0.14 }` is enough. Clips named `ghost` / `ghost-spent` (or any clip
    with `ghost: 1 | 2 | 'spent' | 0.5 | 0`) render on the pale ramp; level 1 shows a gold halo (an octagon on an extra
    `ghostHalo` bone appended after the spec bones, auto-placed `halo.lift` 0.12 m over the figure top; scaled 0
    otherwise, excluded from height / part ids / hull, so living renders are unchanged). Ghost loop clips get FK legs (no
    hip dip) and `hover` m. Options (defaults): `ramp ['#3A5696','#E2EEFA']`, `spent ['#3A4260','#98A2BA']`, `mist
    '#D4E0F2'`, `lo 0.12`, `slope 1.35` (tone = mix(dark, light, (√luma − lo)·slope)), `keepHue 0` (0.25 keeps some
    living hue: dark characters), `glow [0.3, 0.12]` (night self-glow ghost / spent), `fade [0.08, 0.14, 0.2, 0.3]`·H
    (gone / dithered / mist bands in bind height), `mistK [0.55, 0.25]`, `keep ['<slot>']` (slots that keep their living
    tones: lantern, glow eyes), `halo { bone 'head', at, lift, radius 0.15, bar 0.045, tilt, color '#FFE08A' } | false`.
    A dead player walking as a ghost: `ch.ghost = 1` (or 2) overrides the clip; `rig.setGhost(level)` for static rigs.
  - **`'<bone>.l': [k]`** — per-key REACH: lengthens one segment by k (fraction) along its rest axis, thickness and
    children unchanged (the child joint moves out, the child is not stretched). Use it instead of `upperArmR.s`
    1.5–1.95× + a counter-scaled prop: `'upperArmR.l': [0.6], 'forearmR.l': [0.6]` lifts a prop past a big head.
  - **`clip.legs: 'float'`** on any loop clip: FK legs, no leg-IK hip dip (the hover `pos` is what you get).
  - **`material.whiteKeepLift` k** — whiteKeep for pixels a slot / signature LIFT raised into the mid band (a lifted white
    belly stayed peach at golden; also accepts a slightly tinted hi, chroma < 0.25).
- **Wave-4 module fixes** (module fixer, after cast wave 4; opt-ins, 0 px for specs that do not use them; evidence `shots/mfx5/`):
  - **`material.innerLine: 'tone'`** (all parts) or per slot **`material.slots.<x>.line: 'tone' | 'grey'`** — the
    character's inner lines (part over part) take the DARKER of the two adjacent pixels' colours with its hue kept
    (outline `charToneDesat` 0.2 instead of the cool grey-lilac `outlineDesat` 0.55): a seam on a saturated unclothed body
    reads as a darker body tone, not a light grey collar / speck. Use it INSTEAD of `material.merge` when the line itself
    is wanted (arm over body, collar, leg roots, quills); keep `merge` only where no line is wanted at all. Mechanism: tone
    parts write their part id in an outer band (FLAG_CHAR ± 0.076, ids ±79..±156); outline.js `isChar` is ± 0.08.
  - **`material.creamKeep: k | [k, lift]`** (golden grade only; noon / night 0 px) — a CREAM albedo (authored mid linear
    luma > 0.45, r ≥ b, saturation < 0.45, fading out by 0.6) keeps its authored hue in EVERY band under the warm key
    (sun hi/mid AND the shade copy), re-hued at the same luma; `lift` (0.85 recommended) also keeps it at ≥ lift × the
    authored band tone's luma (maxflow golden chest mauve-grey → cream). whiteKeep / whiteKeepLift still handle near-whites.
  - **`locomotion.swingFloor: 'gait'`** (LegGait; default `'fixed'` = old) — the `maxSwing` floor is never shorter than the
    gait's own swing time at the walk/run speed, so a short-duty waddle (duty 0.15, or a reach-clamped duty) keeps its
    authored cycle (0.3 s, not 0.267–0.289) and the start-up cycle no longer skips a drawing; replaces the
    `maxSwing: 0.5` workaround. New members: set it.
- Hold the key that carries a `hurt` flash ≥ flash frames + 2 grid frames (else the pose under it shows for one frame).
- Swing planes: a horizontal slash at brim/hood height hides behind the signature shape from the back; slash diagonally.
- One smear key = ≤ 170° of blade rotation (sum arm + chest + spine + hips about the swing axis); spins = several
  smear keys of 110–125°. No in-between keys during a swing: the smear IS the in-between.
- Action start times must be multiples of 1/30 s (off-grid starts put every later pose change off the grid).

## 5. Runtime API (`src/chars/index.js` re-exports all modules; check with `tools/remote.sh node tools/charexports.mjs`)

**rig.js** (rig)
- `buildCharacter(engine, spec)` → `{ root (Group at the feet), mesh (ONE SkinnedMesh), bones {name: Bone}, boneList,
  boneNames, rootName, skeleton, sockets {name: Object3D}, spec, info, height, stats {bones, tris, parts}, parts,
  warnings, applyPose(pose, { reset = true, clamp, update = true }), setQuaternions(qMap, rootOffset?), restPose(),
  dispose() }`. Material from `look.characterMaterial(engine, spec.material)`; shadows on; `frustumCulled = false`.
  Socket world transforms are valid after `applyPose` + `root.updateMatrixWorld(true)`.
- Templates: `biped(opts)`, `chibi({px})`, `castHeight(px)`, `uprightAnimal`, `quadruped`, `longNeck`, `bird`, `hopper`,
  `limbless`, `face(S)`, `squashPose(S, a, {riders})`, `RIG_PLANS`, `planInfo(word)`, `planGameSpeed(S)`, `GAME_SPEED`,
  `PLAN_POSES` (§3). Helpers: `chain(name, {n, parent, at, dir, len, mirror, limits})`, `mirrorPose(p)`,
  `poseToQuaternions(rig, pose, {clamp})`, `tripleToQuaternion(rig, bone, triple, out?, {clamp})`, `sideOf(name)`,
  `swapSide(name)`, `parsePose(str)` (tests: `'armL_fwd45,head_twist-30'`, presets, `mirror:walk`), `PRESET_POSES`.

**kit.js** (rig) — non-indexed, flat-shaded, centred geometry (front = +Z): `box(w,h,d,{segY})`,
`chamferBox(w,h,d,c=0.25,{top,bottom})`, `frustum(n, rBottom, rTop, h, {sx,sz,shiftTop})` (also
`frustum(rBottom, rTop, h, n)`; r = circumradius, flat face to +Z; n = 4 → width across flats 1.41·r), `prism(n,r,h)`,
`wedge(w,h,d,{top})`, `hull(points)` (not centred), `lathe([[r,y],…], n=6, {sx,sz})` (r = 0 → apex), `loft(rings)`,
`extrude(poly, depth, {axis})`, `mirrorX(g)`, `merge(...g)`, `xf(g, {at, rot, scale})`, `bend(g, {taper, taperZ, bend,
flare, curl, from, to})` (needs bands: `box(…,{segY: 3})`), `flat(g)`.

**look.js** (look)
- `characterMaterial(engine, opts)` → toonMaterial with vertex tones, outline `'char'` (FLAG_CHAR: inner depth lines
  only, no silhouette line against the world, no edge highlights) and the far-half shadow. Opts: `farHalf true,
  farLight 0, sideEps 0.035, dead 0.3, sunTieBreak true, midline 'none'|'pixel', midDead, sides {bone: 'L'|'R'|'mid'},
  cloud 'root'|'pixel'|'off', maxBones 64, debug 'far'|'parts'|'opts', selfShadow 'hull', partLines true, sigLift 0.3, faceLift 0.3,
  props 'mid', propReach 0.2, hints, hintAmp, slots {slot: {lift, side, hint}}, shadowSnap true` (+ any toonMaterial opt;
  §3 Lift). Hooks into toon.js (lightMod, cloudExpr, shadowBias, outlineFlag, outgoing): a missing hook logs console.error. Identical character materials
  share one shader program (content-based cache key).
- `updateLook(engine, rig)` — per-bone far flags; the Character calls it after every displayed pose and the first
  call hooks `mesh.onBeforeRender` (camera turns / root moves are picked up). `farSide(engine, rig, o)` → +1/−1/0.

**character.js** (motion) — `new Character(engine, spec, opts)`, the thing scenes use:
- `ch.root` (add to the scene), `ch.rig`, `ch.bones`, `ch.gait`, `ch.state` → `{clip, frame, keyIndex, facing,
  facingYaw, mode, run, speed, phase, action, poseCount}`, `ch.feet()` → world ankle targets `{L:{pos, planted, yaw}, R}`.
- `ch.drive(fn)`, `fn(t) → { pos: Vector3, face?: radians (else the movement direction), action?: clipName | null
  (a new name starts that one-shot; return null in between to re-trigger), look?: Vector3 }` — a pure function of t.
  The Character derives velocity, picks idle / walk / run (Froude), plants feet, turns in quantized steps.
- `ch.play(name, { restart = true, speed = 1, at })` (recorded with its start time → replayed on re-simulation),
  `ch.update(t)` (registered via `engine.onUpdate` unless `autoUpdate: false`), `ch.on(ev, fn)` → unsubscribe fn,
  `ch.off(ev, fn)`, `ch.dispose()`.
- Events: `'pose'` `{t, clip, frame, key, keyIndex, facing}` on every displayed drawing (after the pose is applied
  and world matrices updated — fx reads socket transforms here; dynamics-only redraws repeat the clip frame);
  `'event'` `{t, clip, name, frame}` for clip events and gait footsteps `{name: 'step', side, pos, clip}`;
  `'clip'` `{t, from, to}`; `'reset'` `{t}` (re-simulation from 0 starts: FX must drop their state).
- Opts (defaults ← `spec.character` ← constructor opts): `ground ({heightAt})`, `facingSteps 8`, `snap true`,
  `dynamicsFps 60`, `gridFps 30`, `legIK 'plant'|'pose'|'frame'`, `turnHold 2`, `hysteresis 8`, `minHold 2`, `dip true`,
  `look`, `lookLimits {yaw 60, pitch 30}`, `face 0`, `position`, `rig` (prebuilt), `gait` (Gait opts), `autoUpdate true`,
  `quant {lean 1.5°, yaw 3°, chain 12}` (dynamics redraw quanta; `chain` = buckets per direction unit, so a HIGHER number
  is FINER and redraws more — small chains use 4), `debug`. (`_resetSim` now resets chain directions: the 13 px first-drawing pop is gone, motion r5.)
  - `legIK 'plant'` (**code default** since motion r5; use it for cast members): the drawing holds, only legs whose
    DISPLAYED foot is planted are re-pinned every frame while in reach (40–90 px redraw on the stance leg; charcheck
    rates it WARN 'legs only'). `'pose'` (the four shipped characters set it in `spec.character`): the whole drawing
    incl. legs holds, feet exact at pose frames and ride the root inside a hold. `'frame'`: legs re-solved every frame.
- `defaultIdle(rig)` — procedural breathing idle for rigs without `clips.idle`.

**anim.js** (motion): `evaluateClip(clip, localTime)` → `{ poseMap, frame, grid, cycle, keyIndex, key, root,
rootStep, done, length, fps, interp }`; `evaluateClipAtPhase(clip, phase)`, `eventsBetween(clip, g0, g1)`,
`clipInfo(clip)`, `clipDuration(clip)`, `gridFrame(t, fps)`, `blendPoses(a, b, w)`, `overlayPose`, `addPoses`,
`crossfadePose`, `EASE`, `deg`.

**dynamics.js** (motion): `new SecondOrder(f, zeta, r, x0)` (number / Vector2 / Vector3; or `(presetObj, x0)`),
`.update(T, x, xd?)`, `.reset(x0)`, `.value`; `SecondOrderQuat`, `SecondOrderAngle`; `presets` (body, turn, head, lean,
weapon, cape, scarf, hair, tail, ear, rope, camera, snappy, heavy, bouncy, anticipating, sluggish); `resolveParams`,
`stableK`, `stepResponse(f, z, r, …)`.

**ik.js** (motion): `solveTwoBone(rig, upper, lower, end, targetWorld, poleWorld, {reach, endQuat, poleLocal})` →
`{knee, reached, dist, stretch}`; `lookAt(rig, bones, targetWorld, {yaw, pitch, weights, forwardLocal, weight})`;
`aimBone(bone, dirWorld, childLocal)`, `worldQuaternion`, `setWorldQuaternion`.

**locomotion.js** (motion): `createGait(rig, spec)` (Character uses it: `spec.locomotion.plan` → `LegGait`, else the
legacy biped `Gait`), `LegGait` plans `BODY_PLANS` = biped, bird, quadruped (trot/bound), hop, glide, fly (one planted
drawing per step, quantised phase, game-speed tuned; squash via `locomotion.squash.amount`; `gait.plantMode` 'pin' |
'hold' per branch, authored walk/run clips for the upper body), `GAME` {heightsPerSec 4,
cycleTime 0.3, drawings 4}, `gameSpeed(H)` = 4·H m/s, `foot(s, S, o, beta, h)` (pure stride wheel), `measureLegs`,
`DEFAULT_BONES`, `locomotionClipInfo`. (rig's own registry is `RIG_PLANS`/`planGameSpeed`: renamed in rig r6 to avoid the
`export *` clash; `tools/remote.sh node tools/charexports.mjs` must print `dups []`.)

**smear.js** (fx): `attachSmears(engine, ch, { sockets: { <socket>: { length 0.6, inner 'auto' (0.1 for blades <
0.8 m, else 0.35), blade [0,0,1], edge [1,0,0], doubleEdged, minAngle 40, segs 20, palette ['#DEE4E6','#F7F9F6'],
kind 'blade'|'limb' (ribbon)|'claw' (3 rakes)|'thrust' (straight streak), tilt 35 (° min off edge-on: readable at every
facing), front 0.12 (m depth bias), stripes, stages, band, tail, fps 30 } }, auto false, normalPass 'none', pool, snap, parent })` →
`{ group, smears, pool, trigger(name, prevXf, curXf, t), reset(), setEnabled(b), dispose() }`; also `smearCurve`,
`socketTransform`, `SMEAR_DEFAULTS`. Listens to 'pose' (keys with `smear: '<socket>'`) and 'reset'.

**fx.js** (fx): `attachFx(engine, ch, { ground, groundY, dust [light, mid, shade], spark [core, tips], flash [..],
weapon { socket, length, blade }, sockets { <name>: { length, tip } }, stepClips ['run'], map })` →
`{ dust, spark, speech, sparkle, wisp, death, feathers, glyph, flash(t), reset(), dispose(), points, flashMesh, scale }`;
`EVENT_MAP`, `FX_KINDS`, `FX_GLYPHS`; more opts: `scale` (default clamp(H/1.5, .45, 1.3)), `stepEvery`, `speech`, `vote`,
`soul`, `feather`. Event names (`<name>@<node>` = at that socket/bone): `step*` (+L/R) / `land` / `poof@` → dust,
`hit` / `hit@<socket>` / `strike` → spark, `hurt` / `damage` → flash (one tone per 2 grid frames), `speak`/`talk` →
speech bubble, `vote@<hand|wing|paw>` → 3 sparkles, `die` → dust ring + soul wisp, `soul`, `flap@<wing>` → feathers,
`emote:<glyph>` (heart note exclaim question zzz anger drop star skull spiral). Every kind steps on twos from its birth
(hold-safe) and runs on the Character clock (`uFxTime`), so a frozen stage frame freezes FX.

## 6. Numbers (defaults; see CHARACTER_TECHNIQUES for sources)

- Reference zoom: `viewHeight = 10` (36 px/m at 640×360) → a **1.4–1.5 m character ≈ 46–52 texels** tall
  (t3ssel8r's player: 45–62 texels, ≈ 4 heads). Also check at `viewHeight 12.5`.
- Every part ≥ 0.06 m thick (≥ 2 texels); limbs 0.09–0.11 m. Head ≈ 1/3–1/4 of the height.
- Key grid 30 fps, held poses; cycles and dynamics on twos (15 Hz); big actions = holds + one smear frame.
- Facing: 8 directions; a turn shows each intermediate facing for 2 grid frames.
- Outline flag `'char'`: inner depth lines only, no silhouette line against the world, no edge highlights.
- Far half of the body (per L/R bone, relative to the camera) forced to the shadow band; midline bones not forced.

## 7. Tooling (tools owner; everything runs on the render host through the scripts — default `the render host`; NEVER
the game server, the live game server; the GPU line is printed in report.txt)

- `tools/charpack.sh <name> [--preset cast | --clips idle,walk,run,…] [--only turnaround|clips|scene] [--dir 1] [--vh 10]
  [--q 'k=v&k2=v'] [--out shots/char-<name>] [--raw] [--jobs 4] [--game-speed <m/s>] [--game 0]` (~30–45 s)
  → `shots/char-<name>/`. A variant spec: `tools/charpack.sh <label> --q 'char=../shots/<dir>/<file>'`.
  - **`--preset cast`** = the Clocktower clip list **idle, walk, run, talk, vote, die, `spec.emote`** (+ `turn`):
    `cast_clips` FAILs when one is missing; `vote`/`die` get `final_hold` (the end is still AND ≥ 10 % off the idle
    pose: a one-shot that springs back to idle FAILs).
  - Default clip list (no `--clips`/`--preset`) = the spec's clips; the stop-motion `turn` pseudo-clip is only in
    `--preset cast` — for a regression of an older pack that had it, add `--clips idle,turn`.
  - Images: `turnaround{,-plain,-vh12,-silhouette,-isolated}.png`, `clip-<c>.png` (one tile per displayed drawing,
    `f<grid> x<hold>`, `~` = changed inside the hold), `clip-<c>-60hz.png` (red tick = changed; even frames only),
    `clip-<c>.gif` (x4) and **`clip-<c>-1x.gif` (1x pixels, real time — how it reads in the game; judge this one)**,
    `scene-{noon,golden,night}.png` + `-crop.png` (sun copy + pillar-shadow copy), `pan.png`.
  - **Game speed** (every pack with a walk): the walk at the v2 travel speed scaled to the body —
    `spec.game.speed` or `spec.gameSpeed.v` (§3), else **3.95 × height m/s** (150 px/s for a 38 px v2 sprite) — rendered as `clip-game.*` and as a
    FIXED-camera crossing over 1 m tiles: `game-1x.gif`, `game-x3.gif` (real time) and `game-onion.png` (every 4th
    grid frame). Row `game.readable`: cycle (from the gait's pose ids `<gait>:<clip>:<frame>:<cycle>`; foot-0
    touchdowns only for clips without them), H travelled per cycle, holds 2–4 grid frames, drawings shown per cycle
    vs authored, **aliasing** (the shown subset changes between cycles, e.g. `024 135`) = FAIL, drawing change ≥ 3 %.
    v2 reference: 0.31 s and 1.2 H per cycle.
  - Body plan: `spec.bodyPlan` picks the `height_px` / `head_frac` / `presence` targets (charcheck `PLANS`:
    biped 45–62 texels at vh 10, uprightAnimal 36–62, quadruped 26–50, bird 30–58, hopper 22–50, limbless 18–44,
    flier 28–60, longNeck 42–72; `spec.heightPx: [lo, hi]` overrides; head_frac is skipped for plans whose top is not
    the head). No bodyPlan + quadruped leg parts (foreleg/hindPaw/…) or `length > height` → `quadruped (inferred)`;
    an unknown name is reported as `<name>? (unknown bodyPlan: biped targets)`. Declare it: an inferred quadruped's
    foot rows only see the 2 `bones.feet`, a declared one all 4 paws (`spec.feet` lists them explicitly).
  - Signature: `spec.signature` may be a slot, a part `{ part: 'earTip' }` or an array of both; each gets a magenta
    mark render and a `sig.<name>` row (visible px, isolated px, hi/mid share per facing; want ≥ 50 % in ≥ 6/8) and
    `sig_ground.*` rows vs the grass round the figure (sun: hue ≥ 30° or |L| ≥ 25 %; shade copy: L ≥ +15 % or ≤ −25 %).
  - Timing rows besides off_grid / flicker: `single_frame` (x1 drawings), `strobe` (≥ 3 consecutive grid frames that
    each change = 30 Hz boil, FX/dynamics included, smears exempt), `hold_redraws` (> 8 px inside one authored key),
    `pose_read` (≥ 10 % silhouette change held ≥ 4), `key_speckle` (isolated px a held action key adds over idle,
    ≤ 6 — the dotted-sash case), `amplitude` (loops like talk, ≥ 3 %), `micro` (1–5 px pops).
  - `foot_slide`: drawn planted feet at DRAWING changes (not inside holds), all `fa` feet (4 paws when declared), at the
    pack facing and at profile dir 2 (`slide-*` jobs); stance from the gait's own planted flag when logged, else
    height; pairs across a clip switch (idle → walk) are skipped; ≤ 1.5 texels = WARN (texel snap jitter), more = FAIL;
    no planted pair (hop/glide) = `n/a` WARN — judge `game-1x.gif`.
  - Determinism: `deterministic` (idle t=1 → 1.5 → 1) and `<action>.deterministic` (mid-action t fresh / after t+0.7 /
    again). Night: `night_freeze` (the character alone at night over 1 s of engine time with t frozen: > 0 px = it reads
    engine `uTime`) and `night_pan` (night meadow, `lantern=0&cover=0`, whole-texel pan inside one window of the world's
    stepped clocks — the old t=1 night shot changed ~200k px per frame through film grain/lantern/wind steps).
  - Rows only for jobs rendered in THIS run (`--only` never leaves stale rows). Then **look at every PNG/GIF with the
    Read tool** and read `report.txt`. `--raw` also pulls `raw/` (every 60 Hz frame `f-<i>.png`: index by the job's
    `times`, never sort names lexically; + the stage debug log).
- `tools/remote.sh python3 tools/charcheck.py shots/char-<name>` re-runs the checks on the remote raw renders.
- `tools/charpack.sh --bake <name> [--preset cast | --clips …] [--dirs 8|4|1] [--game 1] [--cell N] [--ppm 36]
  [--yaw 0|45] [--suffix -iso] [--out out/sprites]` → `<out>/<name>{.png,.json,-shadow.png,-preview.png}`: every clip
  × 8 directions, displayed drawings only (holds in the json), feet anchor. The cell is sized from max(height,
  `spec.length`) and grown ×1.35 automatically while any figure touches its border (quadrupeds, wings, smears); an
  explicit `--cell` is kept (warning). Loops are cut at one gait cycle (gait ids: same frame, next cycle counter, in the
  gait the clip settles in). json: `clips.<c>.holdLast` for die/vote (show the last frame after the clip), `clips.walk.
  speed` with `--game 1` (the walk baked at the game speed). Variant specs bake as `--bake ../shots/<dir>/<file>`.
- `scenes/char-stage.js?char=<name>&clip=<clip|turn|rest>&dir=<0-7>&tod=<preset>&vh=<vh>&bg=meadow|plain|key`
  `&grid=turnaround|clips&frame=<i>&t=<s>&at=<s>&move=0|1&speed=<m/s>&shadow=1&fx=0&legIK=frame|pose&outlineDebug=1`
  `&mark=<part|slot>,…&pan=dx,dy&lantern=0&cover=0`. `char=../shots/<dir>/<module>` loads a variant spec (remote.sh syncs
  `shots/*/*.js`). `grid=turnaround&clip=<c>&frame=<f>` renders one key pose at all 8 facings in one still.
  dir: 0 S (towards the camera) 1 SE 2 E 3 NE 4 N 5 NW 6 W 7 SW = camera yaw + k·45°. The stage logs per-frame pose
  ids (`p`) and drawing ids (`d` = pose id + redraw counter + FX grid frame) in `info().stats.char.log`.
- Single renders: `tools/shot.sh char-stage shots/char-<name>/x.png --size 640x360 --q 'scale=1&char=<name>&…' --t 1`.

## 8. Quality bar

`docs/CHARACTER_PLAYBOOK.md` §Rubric — 12 criteria × 0–2. Ship bar ≥ 19/24, no zero on silhouette,
pixel stability, line quality, animation timing.
