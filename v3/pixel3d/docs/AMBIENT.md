# pixel3d ambient — interactive ambient animation library (contract)

> **Unattended-run rule (read first):** these runs go overnight with nobody at the keyboard. NEVER run a raw `rm`
> (any `rm`/`rm -f`/`rm -rf`, especially with a `*` glob): it triggers a permission prompt for the user and your agent stalls
> until someone clicks. To clear old renders use `tools/clean.sh shots/<your-dir> ['*.png']` (local + render host, only
> inside shots/ or out/), or simply write into a fresh versioned folder (`shots/<you>/r2/`). Same for other prompt-prone
> commands: no `sudo`, no deleting outside shots/out, no editing files outside the repo.

Owner of this file, `src/ambient/core.js`, `src/ambient/index.js`, `src/ambient/_ref-*.js`, `scenes/ambient-stage.js`,
`tools/ambientpack.{sh,py}`: **ambient-core**. Everything else in this library belongs to one system owner each (§9).

Goal: the world moves around the characters and *answers* them — pigeons burst up when someone runs through them,
fireflies scatter, grass parts, a lantern flickers, smoke leans, a sign creaks when brushed. Each of these is a
**system**: a small module dropped into any scene (the ambient stage, a world scene, later the Hollowmere town's
life piece) with 1 draw call per pass, deterministic in `t`, stepped on the ambient grid, snapped to texels.

Read first: `docs/PIPELINE.md` (engine, materials, how to render), `docs/TOWN.md` §4 (anchors) and §8 (time of
day), `docs/CHARACTER_LEARNINGS.md` §Timing and holds (the same rules bite ambient drawings).

---

## 1. Files

| file | what |
|---|---|
| `src/ambient/core.js` | contract + helpers: game-speed numbers, rng/hash, the ambient grid clocks, `Actors` (proximity registry), `Ticker` (fixed-step replay sim), `createReaction` (idle → alert → flee → away → return), `flickerLevel` / `createFlickerLight`, `paint` / `mergePose`, `createPoseBatch`, `createSpriteBatch`, `todInfo`, `BUDGET`, `defineSystem` |
| `src/ambient/index.js` | `createAmbient(engine, opts)`: loads systems by name, owns the `Actors`, routes `update` / `setTimeOfDay`, aggregates `stats()` (+ per-system update ms); re-exports core |
| `src/ambient/_ref-birds.js` | reference system: pecking pigeon flock that alerts, scatters to perches, returns (pose batch + reaction + contagion) |
| `src/ambient/_ref-fireflies.js` | reference system: emissive sprites that blink and scatter from walkers at golden / night (sprite batch) |
| `scenes/ambient-stage.js` | the test stage + scripted walker at game speed (§6) |
| `tools/ambientpack.{sh,py}` | the system pack: 1x real-time GIF, x3 frame strip, cadence / determinism / reaction-lead checks (§7) |

## 2. The system contract

```js
// src/ambient/<system>.js
import { defineSystem, createReaction, createPoseBatch, Ticker, ... } from './core.js';
export default defineSystem({
  name: '<system>', owner: '<owner>', budget: { glCalls: 3 },
  create(ctx, opts) {
    // ctx: { engine, root (Group, world space, identity: add your meshes here), actors (Actors), anchors, heightAt(x,z),
    //        seed (stable per name), rng(salt) (seeded), tod (todInfo), name }
    return {
      update(t, dt, actors) {},   // pure f(t): advance your Ticker to t, then write instances / sprites for time t
      setTimeOfDay(tod) {},       // tod = { name: noon|morning|golden|night, night 0..1, dark (golden/night), sunColor }
      stats() { return { agents, visible, calls, lights, ... }; },   // numbers / short strings only
      dispose() {},
      api: {},                    // optional: system-specific controls (setWind, ignite(t0), ...)
    };
  },
});
```

Loading: `createAmbient(engine, { systems: ['birds', { name: 'fire', opts }], anchors, heightAt, tod, seed, strict })`.
A system that throws is skipped with `console.warn('[ambient] ...')` (never `console.error`: that is a page error in
every capture) unless it is strict (`strict: true` or its name; the stage makes the first listed system strict).

Anchors use the town's shape (`docs/TOWN.md` §4) so the town's life piece can hand its registry over unchanged:
`{ perches: [Vector3], spots: { name: Vector3 }, lights: [{ pos, color, r, kind, flicker }], chimneys, doors, windows,
seats }`. The stage provides `perches` (pillar tops, wall ridge), `spots` (flock, fireflies, lantern, trail[]), `lights`.

## 3. Actors (who the world reacts to)

```js
amb.actors.add({ id: 'walker', at: (t) => pathAt(t), height: 1.38, radius: 0.3, kind: 'walker' }); // sampled, pure f(t)
amb.actors.set('p1', pos, vel, { height });                                                     // live (game feed)
const snap = actors.snapshot(t);           // cached per t; items [{id, kind, x, y, z, vx, vz, speed, height, radius}]
snap.nearest(x, z, r) / snap.near(x, z, r) // -> { item, d, ax, az (unit, FROM the actor TO you = flee dir), speed, approach }
```
`approach` (m/s the actor closes in on the point) is what makes reactions fair at game speed (§5). Sampled actors
make the whole library replayable (captures, scrubbing); live actors make it a forward-only simulation (the game).

## 4. Time: the ambient grid, Ticker, reactions

**The ambient grid is 15 Hz** (the 30 Hz character key grid on twos). Every clock is `k` grid ticks (15/k fps):
k=1 15 fps · 2 → 7.5 · 3 → 5 · 4 → 3.75 · 5 → 3. Helpers: `gridIndex/gridTime(t)`, `clockIndex/clockTime(t, k, phase)`,
`cycleFrame(t, n, k, phase)`; per-agent `phase` is an integer number of grid ticks.
- Inside one system all clocks are multiples of the same grid, so **every change lands on an even 30 Hz frame and
  every drawing is held ≥ 2 frames at 30 Hz** (checked by `ambientpack` `holds`). Do not use 6 / 8 / 10 / 12 fps
  clocks: on the 30 Hz grid they mix 2- and 3-frame holds and, combined with a 15 fps travel clock, make x1 drawings.
- Drawings (wing flaps, flame shapes, pecks) normally k ≥ 2; a startled burst may flap on k = 1 for ≤ 0.5 s.
  TRAVEL (a bird crossing the frame) is evaluated at `gridTime(t)` (k = 1) and snapped to texels.
- Evaluate continuous curves at the stepped time (`clockTime`), never at `t`: nothing glides sub-pixel.

**Ticker** (`new Ticker({ hz: 15, reset, tick })`, `advance(t)`): stateful behaviour (who is fleeing, where to) runs
in fixed ticks from 0; going back in time calls `reset()` and re-simulates (replay mode) — the image at `t` is a pure
function of `t`. 18 s of 9 birds = 270 ticks, 0.03 ms average update. `mode: 'live'` for the game.

**Reaction** (`createReaction(opts)` → `init(seed)`, `step(rec, t, hit)`, `force(rec, STATE.FLEE, t, ax, az)`):
IDLE → ALERT → FLEE → AWAY → RETURN → IDLE with hysteresis. Effective distance = `d − max(0, approach)·lookahead`
(a standing actor counts `stillScale`× farther). Enter ALERT < `alertR`, leave only > `alertR·exitScale` after
`alertHold`; FLEE < `fleeR` (from IDLE, ALERT or RETURN); FLEE lasts `fleeTime`; AWAY until every actor has stayed
beyond `calmR` for `calmTime` (and ≥ `awayMin`); RETURN lasts `returnTime`. Per-agent radius jitter (±12 %) and
system-level contagion (`force`, 1–3 ticks later) keep a flock from reacting as one block. `rec.u` = 0..1 progress of
FLEE / RETURN, `rec.ax/az` = flee direction latched at the moment of the flee.

## 5. GAME SPEED (Clocktower v2) — tune every reaction for it

The live game moves a 38 px sprite at 150 px/s: **4 body heights per second**, a walk cycle of ~0.31 s.
`gameSpeed(h) = 4·h` (wanderer 1.38–1.45 m → 5.5–5.8 m/s, a hound or frog much less in m/s but the same in heights).
- A critter must visibly react BEFORE the walker is on it: lead time = (trigger distance − 0.6 m) / speed ≥ 0.3 s.
  `triggerRadius(speed, lead, contact)` gives the minimum radius; `lookahead` 0.35 s on `approach` does it
  automatically (the reference birds flee at 3.97 m from a 5.5 m/s runner = 0.58 s lead; a standing or walking person
  has to come to ~2 m). Checked by `ambientpack` `reaction_lead`.
- At that speed the ALERT beat is short (2–3 ticks before the flee): make the alert drawing a different SILHOUETTE
  (pigeon: neck stretched 2 texels taller, tail up), not a small head turn — it is on screen for 0.13–0.2 s.
- Stops are instant in the game (no deceleration): a runner who stops 3 m from a flock has already scared it (the
  lookahead saw it coming). Stage it 5+ m away if the beat you want is "alert, then settle".
- Judge at 1x real time at the gameplay camera (vh 10, 640x360, scale 1): `play-<tod>.gif` (30 fps), then the x3
  `strip-<tod>.png` (20 consecutive 30 Hz frames) to see each drawing.

## 6. The stage (`scenes/ambient-stage.js`)

A meadow clearing at the gameplay camera: dirt trail loop, a bare dirt patch (the flock spot), two pillars + a ruined
wall (perches), a lantern (flicker light on the ambient grid, glow synced), rocks, grass kept off the patch. The
scripted walker (default the wanderer; `walker=hound|keeper|…|ghost|none`) runs the closed loop at game speed:
dwell 1.2 s → bursts through the flock (t ≈ 2.4 s) → around the far side → rests 3 s far away (flock returns) →
comes back and stops 5 m from the flock for 3 s (alert, settle) → passes through the firefly spot → loops (period
16.5 s at 5.8 m/s). Params: `systems`, `walker`, `speed=game|walk|run|<m/s>`, `tod`, `still=1` (no clouds / wind:
checks), `shot=wide|flock|lamp`, `vh`, `follow=1`, `strict`, `grass`, `grade`, `seed`, `sheet=1&sheetYaw=<deg>`
(reference birds: every drawing in a row). `info().stats`: `ambient` (per system + updateMs), `walker`, `path`, `perches`.

```
tools/shot.sh ambient-stage shots/ambient-<system>/x.png --size 640x360 --q 'scale=1&systems=<system>' --times 0.5,2.6
tools/ambientpack.sh <system> [--tod golden] [--dur 18] [--crop x,y,w,h] [--strip t0]
```

## 7. Tools (`tools/ambientpack.sh <system>`; ~25–45 s on render-host)

Five parallel page loads: real playback (walker at game speed), a still stage with a ghost walker (only the
system moves), a single still at the end time, and two 60-frame benches with and without the system. Outputs in
`shots/ambient-<system>/`: `play-<tod>.gif` (1x real time), `strip-<tod>.png`, `frame-<tod>-<t>.png`, `holds.png`,
`report.txt`, `ambientcheck.json`. Rows: `page_errors`, `holds` (x1 drawings = 0, odd-frame changes = 0, hold
histogram), `deterministic` (0 px), `reaction_lead` (≥ 0.3 s for systems that log `firstFlee: 'Ts@Dm/Vmps'`), INFO
calls (+GL calls per frame) and per-system stats. Look at every PNG; the GIF is for the user's eyes / playback.

## 8. Budgets (per system unless stated; `BUDGET` in core.js)

| | per system | all ambient |
|---|---|---|
| GL calls / frame | ≤ 3 (lit pose batch = colour + normal + shadow; sprite batch = 1) | ≤ 24 |
| CPU update (median) | ≤ 0.3 ms at max agents | ≤ 1.5 ms |
| triangles visible | ≤ 8k | — |
| PointLights | ≤ 2 (always in the scene; off = intensity 0 — adding one recompiles every material) | ≤ 4 |
| instances | ≤ 256 | — |

Measured (reference systems, RTX 4090 host): birds 9 agents +3 GL calls, ~1.0k tris, 0.03 ms average update
(0.5–0.8 ms first frame = the replay catch-up); fireflies 28 sprites +1 call, 0.02 ms.

## 9. Ownership and how to add a system

One owner per system: `src/ambient/<system>.js`, `scenes/ambient-<system>.js` (optional own framing; it may import
`makePath` and reuse `ambient-stage`'s build), `shots/ambient-<system>/`. Planned systems: `birds` (crows/pigeons/
sparrows: flocks + perches), `fire` (braziers / campfire: flame drawings + flicker light + embers), `fireflies`,
`critters` (mice, frogs, cats on the ground), `foliage` (grass / bushes parting for walkers), `cloth` (flags, washing,
banners), `smoke` (chimneys, dust puffs under running feet), `props` (signs, lanterns, gates that react to proximity).
Shared helpers go to ambient-core (ask in your report: `CONTRACT-REQUEST: ambient-core …`); never edit core yourself.

Writing a system (copy `_ref-birds.js`):
1. Drawings: build each pose as painted kit geometry (`paint(kit.box(...), [hi, mid, sh])`, `mergePose`), feet at
   y 0, facing +Z, every part ≥ 2 texels at vh 10 (a 0.3 m bird is 11 texels long: its alert / flight silhouettes
   must differ at that size). All poses → one `createPoseBatch`. Particles → `createSpriteBatch`.
2. Idle: a pure f(t) schedule from `hash(i, period, seed)` on k ≥ 2 clocks (pecks, hops, turns).
3. Reactions: one `rec` per agent, a 15 Hz replay `Ticker`, `actors.snapshot(tickT).nearest(...)`; latch the start
   position / target at the transition (save each agent's drawn position BEFORE stepping the reaction).
4. Time of day from `setTimeOfDay(tod)` (`tod.dark` for lights / fireflies), never from `engine.style` directly.
5. `stats()` with `calls`, `visible`, states; reacting systems log `firstFlee` for the lead check.
6. Run `tools/ambientpack.sh <system>` at noon and golden/night; look at the strip and frames; fix; repeat.

### Unique-to-me sheet (put it at the top of your system file)
Every system answers, before code: **extra animated parts** (wings, flame tongues, tails, the dust a foot kicks up),
**own gait / motion** (pigeons waddle-hop and burst up steeply; crows hop sideways; moths spiral; a cat slinks),
**expressions in this style** (an alert is a silhouette change, a fright is a 2–3 texel jump, a flicker is a 4-level
step — no smooth fades), **readability at game speed** (does the reaction start ≥ 0.3 s before a 4-heights-per-second
walker arrives; is each drawing ≥ 2 texels different from the last; does it read in the 1x GIF).

## 10. Consuming the library from the town (later)

The town's life piece can call `createAmbient(engine, { anchors: registry anchors, heightAt: ctx.heightAt, tod:
ctx.tod })` in its `build`, feed its walkers as sampled actors (`at(t)` = their route), and call `amb.update` from its
own `update` with `autoUpdate: false`. Town time of day names (`TOWN_TOD`: noon / morning / golden / night) are the
names `todInfo` expects. Ambient-core never edits `src/town/**`.

## 11. Lessons (append: symptom → cause → rule)

- (ambient-core) Two clocks of 15 fps (travel) and 10 fps (wings) in one system made 3 changes in 3 consecutive 30 Hz
  frames (x1 drawings). Rule: every clock is k ticks of the 15 Hz ambient grid (15, 7.5, 5, 3.75, 3 fps).
- (ambient-core) Reading the flee start position from `posAt(t)` AFTER stepping the reaction gave the new state's
  (stale) path. Rule: cache each agent's drawn position before `R.step`, latch it on the transition.
- (ambient-core) Long thin wing plates (0.3 m span, 0.06 m chord) read as an aeroplane / a cross at 10 texels.
  Rule: bird wings are broad tapered paddles (root chord ≈ body length / 2, span ≈ 0.7 × body length).
- (ambient-core) A game-speed runner (5.8 m/s) stopping 3 m from the flock still made it flee: the lookahead saw
  the approach. Rule: an "alert but stay" beat needs the stop ≥ 5 m away or a walking speed.
- (ambient-core) `createRocks` returns `{group, items, avoid}`, not an Object3D (two THREE.Object3D.add errors and a
  mask crash). Rule: read the module's return shape; feed `avoid` to the grass instead of footprints.
- (ambient-core) Cloud shadows (6 fps cloud clock) and grass wind (3.5 fps) change pixels off the ambient grid: the
  cadence check must run on `still=1` with a ghost walker, the system alone.

### Learnings (birds)

- (birds) Contagion `pending` ticks set on a bird that then fled BY ITSELF stayed armed and fired after it had
  landed: the flock re-scattered at t≈6.2 s with no walker near (`d = -1` in the flee log; `_ref-birds` has the
  same pattern). Rule: clear an agent's pending contagion whenever it enters FLEE on its own.
- (birds) Per-tick terrain queries (a raycast `heightAt` for every airborne bird's floor + every idle offset) cost
  11.8 ms/update. Rule: cache ground height per home / per flock centre at create time; flight floors and orbit
  centres use that cached height (0.06 ms/update for 16 birds).
- (birds) Orbits right above perch anchors leave the gameplay frame (perches are on the top edge of the stage).
  Rule: centre a perch flock's orbit in front of (screen-below) its perches, ~2.6 m toward the camera.
- (birds) The stage at `tod=night` fails the holds check with NO system drawing anything: the grade pass's night
  grain refreshes at 12 fps (`src/post/grade.js`, `floor(uTime * 12.0)`), off the 15 Hz grid. Run night cadence
  checks with `--q grade=0`.
- (birds) Small birds on grass vanish (sparrows in cloud shade among flowers read as noise). Rule: put a small
  ground flock on dirt / the trail where its value contrast holds, and let it be the walker's first trigger.
- (ambient-air) Vertical cloth under a high sun (N·L small) rendered in the shadow band: white linen read as grey-lilac.
  Rule: thin hanging cloth gets one band up (`cutMod` from a per-vertex `aCut` attribute: cloth 1, wooden rig 0).
- (ambient-air) Smoke whose drift grew linearly from birth read as a horizontal string of pearls. Rule: the column
  rises first and bends later (lean ~ age²), per-puff lateral + rise jitter, puffs overlap (emit every 4 ticks), and
  a final shrink drawing so the last puff does not pop.
- (ambient-air) Hanging-cloth kicks clamped at 1.25 rad flipped sheets edge-on (read as a blast, not a brush).
  Rule: kick ≤ 0.95 rad, 1-tick kick then a damped 2-swing recovery; let each laundry item test the walker itself
  (a wave runs down the line) instead of one push for the whole line.
- (ambient-air) Dust puffs from footfalls just outside a puddle sat on the water. Rule: no dry dust within 1.5 r of
  a puddle; splash test at 1.1 r.
- (ambient-air) `holds` fails at night on the stage itself (`_ref-fireflies` too: 46 x1 drawings in 4 s) because the
  night grade grain changes every frame. Rule: run the night cadence check with `--q grade=0` (separate --out).
- (ambient-air) Motes (1-texel cream) vanish on the light meadow band. Rule: put sunbeam motes over dark ground / shade.
- (critters) A contagion `pending` tick that arrived while the agent was already fleeing on its own stayed set, and
  the hen "fled from nobody" 6 s later when it got back to IDLE. Rule: clear a pending force whenever its tick
  passes and the agent is not in IDLE / ALERT.
- (critters) A drifting AWAY position (ducks on the pond) evaluated from absolute t popped 0.3 m at the FLEE -> AWAY
  hand-over. Rule: wander offsets in AWAY count clock beats from `rec.t0`, so they start at the flee end point.
- (critters) The night grade's grain refreshes at 12 fps (`src/post/grade.js`), so `ambientpack --tod night` FAILS
  holds for every system (212 x1 frames with no system loaded the same). Check night cadence with `--q grade=0`
  (separate `--out`), judge the look on the graded GIF.
- (critters) Frogs (0.17 m) and mice (0.13 m) at real size are 3-5 texels at vh 10 and vanish on the dark meadow
  band. Rule: tiny critters draw at instance scale 1.5-1.6 (8-10 texels); readability beats zoology at game scale.
- (critters) Per-part flags ride an `aFx` vec2 attribute through `createPoseBatch` via `opts.material` (re-state its
  vertexHead / vertex collapse lines): x = eyeshine (outgoing override at night), y = no outline (water splash).
  mergePose drops unknown attributes: the critter drawings merge with their own keep-list.
- (fireflies) The stage at `tod=night` fails `holds` for every system, including `_ref-fireflies` (x1 drawings 34 in
  3 s): the night grade grain changes every 30 Hz frame. Rule: run the night cadence check with `--q grade=0`
  (fireflies: x1 0, odd 0, holds {2: 269}); keep grain for the play GIF only.
- (fireflies) Lamp moths orbiting at r 0.22–0.5 m were hidden behind the lantern housing (a point sprite is depth
  tested at its centre). Rule: orbit radius ≥ the prop half-width + 0.2 m (0.5–0.85 m around the stage lantern), and
  spread the orbit heights (−0.05..+0.4 m) so some moths are always in front of the light.
- (fireflies) Tiny critters (2–5 texels) need their own drawings, not a merged-geometry pose batch: a palette-indexed
  8×8 atlas point batch (1 call, colour pass only, centre snapped to a texel corner) keeps exact pixel drawings
  (butterfly 5 px open → 1 px closed = the alert silhouette) and swaps the palette per time of day by uniform.
- (fireflies) Firefly flee at fleeR 1.25 / lookahead 0.3 gave a 0.30 s lead at golden (on the bar, because of the
  ±12 % jitter and the 15 Hz tick). Rule: size the radius for the jitter: fleeR·0.88 + 5.8·lookahead − 0.6 ≥ 1.75 m
  (fireflies now 1.5 / 0.35 → leads 0.42–0.45 s).
- (fireflies) Unlit atlas sprites ignore cloud and cast shadows: a bloom or butterfly in cloud shadow keeps its sunlit
  tones. Acceptable at 2–5 texels; for larger day critters use a lit pose batch.
- (foliage) Grass tufts take the ground's colour at the root, so in a flat lighting band they are invisible, and
  bending them showed nothing except at band and path edges. Rule: give a reactive plant per-pixel band shifts
  (`lightMod`): base rows one band down (self-shadow), tips one band up (in full sun, a pale tint). Then a push
  reads because the dark base gets squashed into a knot.
- (foliage) Per-tuft reactions need no CPU state. Write each actor's position at the last 20 grid ticks into a
  float DataTexture; the vertex shader takes the most recent tick that touched the sprite (its "age") and picks a
  push -> spring-back drawing from it. That is a pure f(t), costs 0 CPU per tuft, and 15k tufts stay in 2 GL calls.
- (foliage) `crossVectors(camera.up, camera.right)` is the look direction (forward). Negating it gave back-facing
  bush leaves and a near-to-far sort (far tufts overdrew near ones). Rule: farther = larger dot with up x right.
- (foliage) The night preset's film grain refreshes at 12 fps and failed `holds` (216 x1 drawings). Rule: a scene's
  still=1 cadence check sets `addGrade({grain: 0})`, cloud drift to 7.5 fps and tree wind to 3.75 fps (all on the grid).
- (fire) Night ambientpack `holds` FAILS for any system (216 x1 drawings) although the system is on the grid: the
  stage's night grain (`src/post/grade.js`, refreshed at 12 fps) changes ~217k px on off-grid frames (stage alone,
  `systems=`, still=1: diffs [0, 0, 216855, 0]). Rule: run the cadence check at noon / golden; judge night by eye.
- (fire) `engine.camera.right` / `forward` are built lazily in `camera.update()`: read at system create() they are
  stale, and a stage layout from them put the forge on the walker's trail. Rule: derive the ground basis from
  `camera.yaw` (R = (cos y, 0, -sin y), screen-up F = (-sin y, 0, -cos y)).
- (fire) A flame sheared by `lean * H * 0.5 * u^2` at the 1.5x flare size read as a comet streak at game speed.
  Rule: lean the tip <= 0.26 H; the silhouette jump (1.0 -> 1.25 -> 1.5 sizes) carries the flare, not the shear.
- (fire) Smoke puffs one every 0.4 s at 0.55 m/s made a string of beads; every 0.2 s with radius 2 -> 6 made a
  solid tube. Rule: overlap puffs (spacing < radius), jitter radius -1 on ~30 %, sway amplitude grows with age.
- (fire) Snuffed fires emitting from the flame-tip anchor left smoke floating above an empty bowl. Rule: smoke
  origin follows the state (lit: above the tip; snuffed: off the coals / wick; forge: the chimney mouth).
- (fire) A daytime point light (0.3 x) under a campfire drew a brown disc and band on the dirt at noon. Rule: fire
  lights only when `tod.dark`; by day the flame drawing alone carries it. Golden keeps the PALE day smoke
  (`tod.night > 0.8` switches to the night smoke ramp), otherwise blue-grey smoke sits on golden grass.
- (fire) shot.mjs names frames `f-00.png` .. `f-479.png` (2-digit pad): a lexicographic sort scrambles a 480-frame
  sequence (f-100 sorts after f-10). Rule: sort frame files numerically.
- (fire) An emissive sprite drawn over a geometry edge still gets the outline pass's line / rim (it only reads the
  normal RT). Rule: draw FX sprites in the normal pass too with FLAG_NONE (vec4(0.5, 0.5, 1, FLAG_NONE)); +1 call.
- (birds) Flat GLIDE wings on a bird descending toward the camera read as a plan-view cross / aeroplane lying on the
  dirt (5 "+" shapes on the flock patch in the recovery strip). Rule: the RETURN descent holds the wings-up V drawing
  (UP), then the LAND flare; keep flat glides for the circling phase only.
- (birds) Crow "fingered primaries" as separate box slats picked up a cream rim + dark outline each and read as
  planks / a hand at 17 texels. Rule: a broad tapered paddle with a 1-texel tip droop carries "crow" better; the
  crow at scale 1.15 (15 texels) still out-reads the pigeon.
- (fire, r2) Puffs emitted every 3 ticks with one shared life made a solid grey sausage; every 6 ticks made beads.
  Rule: emit ~1 radius apart near the source AND give each puff its own life (60-100 % of the column life) with a
  1-tick shrink + dither as its last drawing: the low column stays continuous, the top breaks into clumps.
- (fire, r2) Pushing every puff born before a flare by the same offset detached the whole column from a chimney (a
  gap above the mouth). Rule: the wake push weights each puff by its age at the flare (young / low puffs most, 0
  after ~1.4 s) and is never applied to chimney smoke.
- (fire, r2) Smoke radii are texels: at a close-up (vh 5) the same puffs became pebbles. Rule: author smoke radii at
  vh 10 and scale by tpm / 36 (atlas radii 1-12).
- (fire, r2) A smoke origin at 0.8 x flame height sat inside the flame; drawn behind it, only its rim showed as a
  brown cap on the tip (night warm-lit puffs). Rule: smoke starts above the tallest normal drawing (1.1 H), starts only
  once a relit fire has settled, and no warm-tinted puffs (they read as dirt blobs, not as lit smoke).
- (fire, r2) Burst embers with a constant sideways speed streamed out as a dotted horizontal line. Rule: throw speed
  decays (x = v (1 - e^{-3a}) / 3), so a burst fans out ≤ 0.6 m and then rises.
- (props) Scheduled lamp times (`api.dusk(0.5, 0.6)` -> 1.1 s = grid tick 16.5) used as `litAt` directly put the
  ignition drawings (spark -> small -> flare) on odd 30 Hz frames: golden `holds` 6 x1 drawings. Rule: any time a
  system takes from outside (api schedules, douse / light calls) snaps UP to the next grid tick before it drives an
  age-based drawing; times born inside the Ticker are already on the grid.
- (props) A 0.21 m bell under its gallows roof was 12 texels and sat in the roof's cast shadow at noon: it read as a
  brown blob and the swing stops were hard to tell apart. Rule: a swinging part under a roof must be big enough to
  poke out of the roof's shadow on its extremes (bell x1.2 = 0.26 m radius: the sunlit rim flashes on the strike
  drawings, which is the beat you want).
- (props) Pendulum props (sign, bucket, bell, lamp) read best as a damped swing quantised to whole drawing stops
  (11-16 degrees apart) evaluated at `clockTime` (k = 2, heavy bell k = 3): the amplitude decays by whole stops
  (3 -> 2 -> 1 -> rest). Kick on the walker's bow wave (d - approach*0.35 s), the big swing only on the close pass.
- (fireflies) A 5 px butterfly read as a speck at the gameplay camera, and nothing said it was airborne. Rule: day
  fliers draw 7 px open (fore + hind wing rows, 3 px raised, 1 px closed) and drop a 1-2 px sun-projected ground
  shadow (shadow index in the same atlas, alpha 0.42 over the ground, drawn first in the batch; floor height cached
  per garden, never a per-frame `heightAt`). In cloud shade the shadow is subtle by design; in sun it carries height.
- (fireflies) Glow-worm sites sit next to the trail, so the walker arrives tangentially (low `approach`) and the
  lookahead does not help: the first dimming came at 2.05 m (lead 0.25 s, FAIL). Rule: for agents beside a path size
  `fleeR` for a near-zero approach: fleeR·0.88 − 0.6 ≥ 1.75 m (glow 2.2 / lookahead 0.4 → leads 0.37–0.63 s).
- (fireflies) Bees that fled 1.6–2.2 m hovered in AWAY right behind the head of a walker who stopped in their garden
  (read as a cartoon halo of bees). Rule: AWAY targets ≥ calmR + 0.3 m from the flee point (bees 2.5–3.3 m).
- (fireflies) A synced swarm ripple lit for 5 of 12 beats left the meadow empty for ~1.5 s at a time. Rule: lit
  ≥ ~55 % of the period (dim, flash ×2, bright ×3, dim) so a swarm never goes fully dark between ripples.
- (fireflies) The scratchpad (and the render host tree) is shared by parallel agents: generic log names
  (`night.log`, `golden.log`) collide. Rule: prefix every scratch log / remote helper with the system name.
- (foliage, r2) Tall grass at 0.17 m spacing read as a sticker grid of separate "v" glyphs (in cloud shade only the
  1-px tips showed: confetti). Rule: tall grass is a MASS: 0.11 m spacing, wider clumps (7-10 blades), a base ~45 % of
  the blade (dark mass in sun) and 3-px tips (light strokes in shade), short edge variants on the patch rim.
- (foliage, r2) Leaf puffs of 3-px flakes in bush tones were invisible (found only with `?fdebug=kinds`: the flakes
  were there, already lying). Rule: a reaction particle must contrast with what it leaves: 4-7 px leaf drawings,
  yellow-green / turned palette, one band up in `lightMod`, thrown ≥ bush radius + 0.25 m so it lands clear.
- (foliage, r2) Changing one sprite generator's rng use reshuffled every later sprite in the atlas (flowers, reeds,
  leaves). Rule: give a reworked sprite family its own rng stream (or burn the old calls) so others keep their drawings.
- (foliage, r2) Crawl test (whole-texel pan, frozen t): foliage adds 0 px; the 1.1k shifted px left with the grade on
  are the screen-fixed vignette. Run pan tests with `grade=0` (4-6 px remain, same without foliage).
- (ambient-air, r2) Lit icosahedron puffs in a pose batch (3D toon balls) read as grey-purple beads in cloud shade and
  at golden / night, whatever the spacing. Rule: smoke and dust are PIXEL drawings (palette-index atlas point batch,
  `src/ambient/air/fx.js`): lumpy disc lit upper-left + a shadow crescent, dither-thinned last 2 drawings; the palette
  swaps day / gold / night by uniform. Same column maths, now reads as smoke in every light.
- (ambient-air, r2) A laundry / bunting rope running ACROSS the screen hides the cloth's main swing (about the rope:
  pure foreshortening, 1-2 texels). Rule: add an in-plane shear (hem trails along the cloth's width by wind·aU and by
  the runner's motion·aU, ≤ 0.5 × length at the hem, v^1.35 profile) — the parallelogram silhouette is what reads; a
  runner along the line makes a visible wave of leaning sheets.
- (ambient-air, r2) Dust puffs of 2-4 texels on the trail read as pebbles. Rule: footfall puffs grow 3 -> 6 texels
  (flat cloud, base on the ground: sprite `offY` = 0.8 ry, bias 0.12 m) and dissolve by dither, never a solid shrink.
- (ambient-air, r2) Splash rings centred on the foot spilled over the puddle rim onto dirt. Rule: pull each ring's
  centre in so centre + ring radius ≤ 0.92 r of the puddle.
- (critters) A ground cat leaving a raised doorstep used `y = heightAt(x, z)` from the first flee tick: for 3 ticks it
  was drawn inside the stair (vanished). Rule: a critter leaving a raised spot keeps its lift for the alert drawing,
  then drops with a small hop; never snap y to the terrain under a prop.
- (critters) A cat leaping onto a pillar on a straight lerp + sine arc passed THROUGH the drums (take-off 0.42 m from
  the centre, inside the plinth). Rule: take off outside the plinth (0.9 m), rise first (y = sin(pi/2 s/0.8)) and only
  move inward after s = 0.35, so the leap runs up the face and over the lip.
- (critters) The black cat's flat CROUCH -> stretched RUN1 hop along a grey wall ridge read as a dark plank sliding.
  Rule: a hop is gathered (arched, tail up) -> stretched -> gathered, with a 0.26 m arc: silhouette + height, no flat poses.
- (critters) A frog's single 0.87 s hop back out of the pond read as floating. Rule: small critters travel in short
  hops (0.27 s) with a held crouch (0.2 s) between, never one long slow hop.
- (critters) Fawn mice / brighter frogs (one ramp step up) separate from the dark meadow band by hue AND value; grey
  mice disappeared against the grey slabs they hide under. Rule: a hiding critter's coat must contrast with its hide.
- (critters) A cloud-shaded dog with a dark brown ramp fell to one purple blob (mid ~ shadow). Rule: medium animals get
  a light coat ramp (mid >= 0.5 value) so the shadow band still shows the form.
- (critters) The session scratchpad can be shared with other agents: a generic `run.sh` there was overwritten and my call
  ran another system's capture script. Rule: keep helper scripts under your own `shots/ambient-<system>/tools/`.
- (fire, r4) A 50 % checker stipple as the smoke "fade" drawing read as a golf-ball waffle at the gameplay zoom, in
  every frame. Rule: fade by SILHOUETTE, never by dither: one texel smaller with a ragged bite out of the shadow side,
  then a mid / shadow-only drawing with two bites, then gone.
- (fire, r4) Fires without a PointLight read as stickers at night next to the lantern's pool. An extra light breaks
  the 2-light budget; an opaque ring sprite would paint over the stone. Rule: put an ADDITIVE glow in the SAME point
  batch: at night switch the colour pass's blend to `dst x src.a` (a = 0 replaces: flames, smoke; a = 0.8-0.9 adds
  the glow and dims the cool stone a little, so warm x blue-grey lands on a brown, not a mauve) via
  `points.onBeforeRender` (read `uPassMode`; the normal pass stays pure replace, because its alpha is the outline flag,
  and glow texels discard there). No extra call. Cost: night smoke writes a = 0 (emissive: fog skips it), which is
  invisible on the stage. Scale the glow drawing with the flame's size index so it flares and dies with the flame.
- (fire, r4) Toon point lights ignore `decay`: `toon.js` uses a hard reach `min(uPointShape.y = 1.8 m, distance)` and
  steps the surface towards its MID tone x the light colour. On teal grass the mid tone is yellow-green, so the outer
  band of any warm pool turned olive. Rule: keep a fire pool on its dirt / stone with `distance` < 1.8 m (campfire
  1.55, forge 1.25). Lowering the intensity or raising the decay does nothing to that outer band.
- (fire, r4) The first puff after a relight was born at 1.1 x the NORMAL tip height while the catch / flare tongue was
  taller: the tip skewered it. Rule: a puff is born above the tip of the drawing on screen AT ITS BIRTH (flare log ->
  size index) plus its own radius + 3 texels. A relit fire smokes again only 0.33 s after the catch settles, and the
  leftover snuff wisps are cut on the relight.
- (fire, r4) A flare that leaned at trigger time (the bow wave is ~2 m ahead of the body) leaned before anyone was on
  screen, and the gutter leaned against travel ("the wake blows backwards"). Rule: step 1 is a pure size jump. Record
  `tLean` = the first tick with the true distance < flareR, lean only from then on, keep the gutter lean in the
  direction of travel, then spring back to 0. Throw the ember burst sideways only if `tLean <= born` (otherwise a
  later tLean would bend embers that are already in flight).
- (fire, r4) A wall torch flared for a walker on the far side of the wall. Rule: wall-mounted reactors gate on
  `dot(walker - mount, facing) > 0`. A 13-texel flame needs `flareGain` (torch 2.2: 1.5x -> 2.1x height) to read.
- (birds, r3) Sparrows circled at waist height around a walker who stopped beside their orbit (read as mobbing): the
  orbit centre was latched once at the flee. Rule: re-centre a flock's orbit every tick so its near edge stays
  `rad + keep` (~2 m) from the nearest actor (slewed <= 4 m/s), add an out-and-up repulsion within 3 m below head +
  1.6 m, keep small birds' orbit altitude >= 1.9 m, and judge AWAY -> RETURN calm at the HOME, not at the bird in the
  air. Trace metric (scene `?trace=1`, stats `minAir`): airborne bird to actor capsule >= 1.5 m (now 1.62-1.93 m).
- (birds, r3) The stage's 3 s stop was 2.0 m from the sparrow spot: no lookahead can save that, they flushed every
  loop. Rule: measure the spot-to-stop distance first (sparrows now 3.9 m away); then use a small lookahead (0.1 s)
  and a high stillScale (1.8) for the "alert, then settle while he stands" beat; the run-through lead stays 0.40 s.
- (birds, r3) Forcing every flush orbit screen-down flipped half the birds across the runner's face. Rule: keep the
  bird's own side of the threat's path, only flatten a steep screen-up offset, and clamp the orbit into the
  gameplay frame (`opts.frame`) instead.
- (birds, r3) The cream rim + dark crease on 2-3 texel wing plates turned wings into stripes, and the sparrow cap /
  cheek boxes made a bright 'eye' speck. Rule: per-part outline flag (aFx -> `outlineFlag: FLAG_DEPTH_ONLY`) on wings,
  folded sparrow wings, cap and cheek: silhouette line only. A custom merge must keep the extra attribute.
- (birds, r3) An airborne crow's shadow smeared 40x40 texels over the wall face. Workaround with 0 extra calls: own
  instanced `iNoShadow` attribute + a replacement customDepthMaterial (core's collapse + `iNoShadow > 0.5`), set for
  birds > 1.2 m above their ground; landing shadows still converge in the last metre.
- (birds, r3) Perched crows facing the camera read as dark boxes. Rule: perch idles face profile (screen-left/right)
  +-45 deg, front only ~6 % of looks, face the hop direction after a sideways hop. Snap perch anchors onto the real
  stone top (raycast the wall) and only allow hop slots that stay on stone at the same height.
- (birds, r3) Crows circled 5.5 s because the walker rests by their wall. Rule: once away >= 1 s with the home
  still occupied, settle on the nearest free calm perch; if none, the group leaves the frame (orbit centre 14 m
  screen-up) and the Hermite descent brings it back when calm.
- (props, r3) Street lamps lit at night threw no pool at all: the toon point light has a HARD reach of `uPointShape.y`
  (1.8 m at night, a shared uniform), and a light hung at the lamp head (2 m up) never reached the ground. Rule: hang a
  fixture's PointLight low (≈ 1.0 m above the ground under the head, `distance: 0` = the shared reach, intensity ≈ 4 x
  flicker level): a 2–3 band stepped pool of ~1.3 m radius. Never raise the shared reach from a system.
- (props, r3) Lit lantern glass went dull brown under the night ramps (a toon surface cannot glow). Rule: lit glass =
  the toon glow tone + an ADDITIVE emissive fill sprite over the pane (two 5-texel squares, gain 0.42 x flicker,
  less at golden) + a 1-texel pale core; flares are a 5-texel diamond for 2 ticks.
- (props, r3) A fountain of waterDeep under a rim read as a navy hole, and 1-texel stream / jet / splash dots read as
  sparkle noise; stream ripples phased per stream on k=3 + streams on k=2 changed the area on EVERY 15 Hz tick. Rule:
  basin water uses the light palette water ramp raised to just under the rim with a pale shore line; water is drawn
  in 2-texel sprites (columns, arcs, drops); all water parts share ONE k=2 phase (changes ≤ 7.5 fps).
- (props, r3) The lookahead (d − approach·0.35 s) let a 5.8 m/s runner trigger props from 4–6 m (the next street in
  a town), and props 2.7–3.5 m off the trail reacted with no visible cause. Rule: every first beat also needs a REAL
  distance cap (`maxD` ≈ 2.8–3.2 m, alert-only head turns ≤ 3.4 m); the big beat (splash, startle) needs real
  closeness (< 2.0–2.3 m, or the closest pass); place reactive props within ~1.7 m of the route. Exception: a gate
  needs its rattle + 4 opening drawings (0.8 s) before the walker arrives, so it keeps the far bow-wave trigger.
- (props, r3) Thin tubes ROTATED into splay drawings broke into dashed 1-px diagonals (hair / a tassel). Rule: thin
  hanging parts stay vertical; sway / splay are whole-part sideways offsets in whole texels (1–3), pale metal tone.
- (props, r3) Iron (`#2A2834` shade) posts and lamp heads were the same value as their outline: a black silhouette, and
  a dark glass box with two rim slits read as a robot face. Rule: fixtures a player looks at get a ramp whose shade
  tone stays ≥ 2 steps above the outline (verdigris copper, weathered dial-ring wood); day glass a mid slate with ONE
  painted highlight.
- (props, r3) A gate leaf turning towards edge-on showed its shaded back face + a diagonal brace behind the pickets:
  doubled outlines merged into a black cross. Rule: a separate mid-swing drawing without the brace, lifted one band
  with `cutMod` on its pose index (`material: { cutMod: 'abs(aPose - N.0) < 0.5 ? 1.0 : 0.0' }` on the pose batch),
  and start the opening at 25°.
- (props, r3) Strike ticks held in one fixed column over consecutive drawings read as a stuck dotted line. Rule: an
  impact mark shows on the strike drawing + one more only, stepping outward (≥ 2 texels per drawing), shaped ')'.
- (props, r3) `tools/ambientpack.py` runs `--scene ambient-stage` by default: scene-only params (`lamplighter=1`)
  are ignored unless you pass `--scene ambient-props` (the r3 golden run silently stayed in auto mode at first).
- (fireflies, r4) Glow-worms drawn as the same 1-px dot / 3x3 plus as fireflies, at a site overlapping the wall swarm,
  read as "more fireflies". Rule: a ground glow needs a ground SHAPE (steady core + a 3-4 px horizontal pool at alpha
  ~0.4 on the row below, never a plus), a band hugging the prop foot, and every firefly home >= 0.6 m from it.
- (fireflies, r4) Golden-hour fireflies in the night tones (#E8F27A / dim #8FB04A) vanished on ochre grass: same hue
  family and value. Rule: at golden, switch to value contrast: a paler, cooler core (#FBFFE6 / #F4FFC0) with a dark 1-px
  under-shadow (#3E4A2E, alpha 0.8), and drop the dim 1-px look entirely (bright or plus only).
- (fireflies, r4) A swarm disc around a spot next to the trail put a third of the "grass" fireflies over the path.
  Rule: reject homes (and blooms, glow-worms) by distance to the `spots.trail` polyline (0.95 m covers the 0.9 m path
  + its 0.6 noise) and the dirt patch radius; take an `opts.avoid(x, z)` for zones the scene knows.
- (fireflies, r4) Bees / butterflies came back next to a walker standing in their garden: AWAY's calm test measures
  from where the insect HIDES (2.5-3.3 m off), not from the bloom it returns to. Rule: pass the reaction a hit taken at
  the return target (schedule position at t + returnTime) while AWAY, and force a fresh FLEE if someone stops within
  1.3 m of the hiding spot (the walker ran on in the flee direction and stopped there).
- (fireflies, r4) 8x8 bloom clumps with a stem fan read as stickers next to the stage's 1-px flower drifts. Rule:
  accent flowers copy the field's own style: a 5-px plus head on a 1-px stem; insects land 1 texel above the head.
- (fireflies, r4) The ambient stage has no water anchor, so a system's "near water" half never renders there.
  Use `scenes/ambient-critters.js` (it passes `spots.pond`): `ambient-fireflies?stage=critters`. A water swarm's floor
  is the lowest bank height around the pond, not `heightAt` (the basin floor is under the water level).
- (fireflies, r4) Whole-texel pan crawl test: `ambient-fireflies?pan=dx,dy` shifts the camera target by whole texels
  after the build (camera.update() first so right / up are current); compare against pan=0,0 with grade=0.
- (foliage, r4) A tall-grass blade "a band up" on the tips (and a boosted straw tint) lit the patch in cloud shade and
  turned it frost-pale at night. Rule: a reacting plant takes the ground's band at its root: tips go a band up only
  when the root is NOT in the shade band, use the ground's own hi tone (no boost), and at night cap at mid; the mass
  (BASE) in shade drops one step below the shade tone. In sun, blade bodies go one band down so the stand still reads.
- (foliage, r4) Overlapping 1-px blade sprites at 0.11 m showed three tones as single-pixel speckle. Rule: tall grass is
  CLUMPS of 3-5 sprites on one depth row (shared tip row, shared wind phase) whose lower half is a FILLED mass (filled
  per frame after bending, so bent drawings stay solid); the trodden (FLAT) drawing has no mass so the lane shows.
  Patch outline = union of 3 offset lobes with 0.8 edge noise, never one noisy disc.
- (foliage, r4) `strokes.fill = true` as a flag on an array is always truthy (Array.prototype.fill): every sprite took
  the fill path. Never use built-in method names as ad-hoc flags on arrays.
- (foliage, r4) Short tufts take the ground colour exactly, so bending them is invisible: a gust that only swapped
  drawings was illegible. Rule: a gust FRONT is a 1.3 m band on the exact 15 Hz tick (no per-sprite phase; 0.4 m per
  tick at 6 m/s = ~3-tick hold) where tufts take the laid-over drawing AND flip a band (hi -> mid, else +1). It then
  reads as a streak crossing the screen; tall patches lean front to back by themselves.
- (foliage, r4) Flowers with ground-tone stems read as floating confetti. Rule: stems + a 9-px leaf rosette in the
  BASE class (one band below the ground) and a 1-texel whole-blossom nod (dedicated atlas rows with the attached
  blossom 1 px lower), 2 of 4 beats, offset per clump. Every flora scatter must call isGrass (flowers grew on the trail).
- (foliage, r4) A 0.3 m view-space bias on airborne flakes painted a leaf on a plinth face. Rule: flakes only clear the
  ground (0.08 m) and landed flakes whose spot fails the scene mask (prop footprint) are dropped.
- (foliage, r4) Harness times k/15 (or t0 + i/60) floor onto the previous tick for some k: a per-tick diff showed d=0
  every third tick and double jumps. Sample at (k + 0.5)/15 for per-tick checks.
- (critters, r3) A box-section body (flat top, vertical sides) gets the cream rim on BOTH long top edges at an oblique
  yaw: the dog read as striped (spine + flank line). Rule: body segments are "ridge" hulls: a 0.07 m spine top with
  60-degree bevels (n.y 0.5 < topY), so only the spine owns a rim; the bevel-to-side crease is never top-facing.
- (critters, r3) A perch hop chosen as "the perch farthest from the walker NOW" had the cat hop along WITH a runner
  moving along the wall (read as running alongside / chasing). Rule: score escape spots from the actor's position
  0.5 s ahead, reject spots ahead of its direction of travel (dot(p - actor, v) >= 0) and require a 0.5 m gain.
- (critters, r3) Even 2 ticks of a long flat stretched drawing (0.48 m RUN1, tail straight) read as a dark plank on
  the ridge. Rule: an airborne hop uses its own SHORT arched drawing with the tail curved up, on a 0.35 m arc, framed by
  2 gathered ticks before and after (8 ticks total).
- (critters, r3) Resting animals facing straight toward / away from the camera are 2-3 texel sticks at vh 10 (cat SIT,
  drake swimming, dog noticing). Rule: every RESTING yaw goes through `obl()`: a quantised stop within 17 deg of the
  camera axis is turned 45 deg (toward its raw side); travel yaws keep their true heading. Sitting cats on a perch or
  doorstep get a profile yaw (camera yaw + 90 deg) from the scene.
- (critters, r3) A cream chest under the night ramp became a pale blue block, and one glowing eye texel above it read as
  a candle on a pillar. Rule: per-part flag aFx.x = 0.5 multiplies cream parts by 0.7 at night (eyes stay x = 1), and
  the two eyes sit side by side (2 texels), never one isolated bright texel.
- (critters, r3) The dark meadow band on the stage at noon is CLOUD SHADE (cover 0.45), not terrain: mice pausing there
  (or in tall blades on the light band) vanished; the flock patch's lower rim lies in it too. Rule: put a tiny critter's
  readable beat (the sniff / sit-up pause) on sunlit open ground and mask grass in a 0.3 m worn spot under it; mice at
  instance scale 2.0 with cream ears read as mice (10-12 texels) there.
- (critters, r3) createSteps splits each step into 2-3 outlined stones: a 1-2 step doorstep read as three crates at x1
  (a wall stub behind it read as a crate stack too). Rule: a critter's doorstep is one wide createSlab.
- (critters, r3) ambientpack's +4 GL calls for critters was the pond: the water's planar reflection re-renders every
  batch (measured +3 with reflect=0, +4 with it). Rule: a lit pose batch costs 3 calls, +1 per reflective water in
  the scene; declare the worst case in `budget.glCalls`.
- (critters, r3) A scene `pan=dx,dy` must offset only the camera target (the scene's `target` also centres the terrain
  flatten), and grass placed from `viewArea(engine)` re-samples when the camera moves: 12k px "crawl" in the no-system
  baseline. Rule: run pan tests with grass=0 (critters add 0-2 px over the 7 px stage baseline).
- (ambient-air, r3) A sunbeam drawn only as a lit ground pose disappeared under the grass blades, and its motes read
  as stray sparkles. Rule: draw the SHAFT itself (a colour-only premultiplied point batch on LAYERS.COLOR_ONLY: 3 hard
  slanted bands with stepped alpha, Bayer-eroded top) plus the lit patch as a sprite with a depth bias so it lies OVER
  the blades; place motes inside the drawn shaft; give each tod its own beam spot over shade (`beams[].tods`).
- (ambient-air, r3) Uniform 50 % checker fades made dust and smoke read as '88' / waffle stamps. Rule: erode from the
  rim inward (distance-to-edge + 4x4 Bayer, per-fade thresholds); dust erodes in 2x2-texel mask cells so it breaks into
  clumps, not 1-texel fur. A dark base row under a dust puff reads as a mound: no shadow row at its base.
- (ambient-air, r3) Cream footfall dust on brown dirt read as a glyph. Rule: dust is lifted dirt (one step above the lit
  trail), a 3-clump cluster lit upper-left, 3 drawings (0.4 s), rising ~2 texels per drawing and drifting back.
- (ambient-air, r3) Two splash rings with separately clamped centres overlapped into figure-8s. Rule: one centre per
  splash (clamped for the biggest ring), ring B 2 ticks behind ring A, only the newest splash per puddle draws rings,
  the last drawing a broken 5-arc ring.
- (ambient-air, r3) Flat ground drawings lifted 1 cm over the water vanished: camera.snapWorld moves a drawing up to
  half a texel along screen-up (≈ ±1.2 cm in y), so the snapped ring sank under the snapped puddle. Rule: stack flat
  ground layers >= 3 cm apart (or render them in one pose).
- (ambient-air, r3) Cloth with outline 'full' got only a pale line from the shared outline pass (its colour derives
  from the light cloth) and no folds (vertical cloth sits in one band). Rule (no shared-code change): bake a 1-texel
  border from per-vertex cloth (u, v) + fwidth in the `tones` hook (own shadow tone x 0.82), and drop a facet one band
  (`aFold`) when its camera-side normal is >= 0.07 less sun-facing than its panel's mean. Skip folds on big facets
  (awning canopy: they read as a checkerboard).
- (ambient-air, r3) A plain `tools/ambientpack.sh air` runs on ambient-stage and passes an EMPTY air system. Rule:
  always pass `--scene ambient-air` for air (until ambient-core reads a scene from the system).
- (ambient-air, r3) Gust lines as single 1-texel dashes read as specks / birds. Rule: groups of 2-3 parallel lines
  (4 texels apart, staggered 5 texels and 1 tick) with a 2-texel curl at the head, born 1 tick before the front
  reaches a spot placed upwind of the cloth, so the lines arrive just before the flag snaps.
