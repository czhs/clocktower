# Hollowmere playable demo — module contract (every demo owner reads this)

A playable LOCAL demo: walk the town "Hollowmere" (docs/TOWN.md) as one of the completed characters
(docs/CHARACTERS.md, docs/CHARACTER_STATUS.md), switch characters, and drive the town's states live: a continuous
clock / time of day, game phase + voting ceremony + seats, the bell, quality tier, life on/off, cut-away, camera.
Runs in a normal desktop browser in real time (60 fps on the 4090 at 1280x720), and in the headless checks.

Plain ES modules + three r170, no build step (same as the rest of pixel3d). Page: `demo.html` (repo root) → `src/demo/main.js`.

**Read-only for every demo owner:** `src/town/*`, `src/{core,materials,post,world}/*`, `characters/*`, `src/chars/*`
(another session is authoring characters right now). Need a hook there? Work around it from your own module and
list it as a CONTRACT-REQUEST in your report (§8 collects them).

Where things run: the Mac only edits files. Everything executes on **render-host** via `tools/remote.sh` (game-host is
forbidden). Headless checks are Playwright scripts `tools/demo-*.mjs`; look at every screenshot you rely on.
Console errors / page errors / shader errors = failure. No git commits.

---

## 1. Files and owners

| owner | files | job |
|---|---|---|
| **lead** | `demo.html`, `src/demo/main.js`, `src/demo/api.js`, `src/demo/state.js`, `docs/DEMO.md`, `tools/demo-lead*.mjs`, `shots/demo-lead/` | boot, the town build, the loop, the store / events / input, the **camera rig** and the **live cut-away** (api.js) |
| **player** | `src/demo/player.js` | walking (WASD relative to the camera), collision, door triggers, emotes, character swap |
| **characters** | `src/demo/characters.js` | which characters are complete, loading a spec, creating a runtime Character handle |
| **time** (town states) | `src/demo/time.js` | continuous clock → sky / sun / lights / tower hands / hour strikes; phase / nominee / seats → dais + ceremony; bell; life on/off; quality (reload) |
| **ui** | `src/demo/ui.js` | the control panel, status line, help overlay, toasts |
| **deploy** | `src/demo/deploy.js`, `tools/demo-serve.mjs`, `tools/demo-check*.mjs` (+ `shots/demo-deploy/`) | `window.__demo` automation hooks, error overlay, perf watchdog, serving, the playtest automation |
| **player** (houses) | `src/demo/interior.js`, `src/demo/camera.js`, `src/demo/collision.js` | entering / leaving cottages (fade, room collision, the dollhouse camera), the texel-locked follow, collision + walk-through props |
| **intro** | `src/demo/loading.js`, `src/demo/loading.css`, `src/demo/intro.js`, the `#demo-loading` markup in demo.html | the loading screen (real progress), the opening cinematic |
| **roster** | `tools/demo-roster.mjs`, `src/demo/roster.js`, `src/demo/roster.json` (generated) | which characters are offered (shipped / WIP), portraits |
| interiors (town side) | `src/town/interiors/*` (read-only for the demo) | the 15 rooms (`buildInterior`, `aimLights`), docs/INTERIORS.md |

Every non-lead file exists as a **working stub** written by the lead (so the page runs end to end from minute one).
Owners replace their stub; keep the exported names and signatures below (add freely, never rename).

## 2. Boot sequence (`src/demo/main.js`)

1. `window.__pixel` (the engine's capture contract) and `window.__demo = { ready, errors[] }`; global error hooks.
2. `store.set(stateFromParams(URL), 'url')`.
3. `new Engine({ params })` (same URL params as index.html: `?scale=`, `?capture=` ...).
4. **The town** through the composer — `buildTown(engine, q)` from `src/town/town.js` (the code path of `scenes/town.js`),
   with `q.tod = presetForHour(state.timeOfDay)`, `q.quality = state.quality`, `q.life = 1`. It is built ONCE per page at
   the gameplay camera (yaw 0, viewHeight 12) on the square. **Grass area:** the ground piece scatters grass only over
   the build camera's view (`world/grass.js viewArea`), but the player walks the whole town incl. the south bay round
   house-9 (TOWN_H 42). main.js `buildWide` shows a wider view ONLY to the ground piece's `viewArea()` call (a
   `viewHeight` / `target` getter on the camera that answers the grass area while the call stack is in
   `src/town/pieces/ground.js` and `engine.stats.ground` is not yet set; `engine.lowW` sets the width): grass covers
   **x −2..47, z 3..41.5** (≈ 11.5k tufts high, 615 of them in the bay; the old 4 × lowH build: 10.4k, z ≤ 34.5, none in
   the bay; `?demoGrass=wide4` rebuilds it that way for review). Every other piece sees the plain gameplay camera
   (foliage's leafy set, shadows, lights). Build ≈ 2.3-2.8 s on the 4090.
   The loading screen (`src/demo/loading.js`, loaded before main.js) counts the pieces as they import and reads the
   `#demo-boot` phase text; it stays up until the cinematic has warmed its poses.
5. Modules, in order (each import / factory failure is reported in `__demo.errors` and skipped, the page keeps going):
   `listCharacters()` → `createPlayer(demo)` → `createCameraRig(demo)` (camera.js: the lead's rig + the texel-locked
   follow + the interior dollhouse camera) + `createCutController(demo)` (lead) → `createNPCs(demo)` (idle townsfolk
   characters, `?npcs=0` off; `demo.npcs` is a placeholder until then so listCharacters does not start them before the
   player exists) → `createIntro(demo)` (only when `loading.js introEnabled(params)` and not capture) → `createTime(demo)`
   → `mountUI(demo)` → `installDeploy(demo)` → `installViewInset(demo)` (main.js: wraps the rig's update, §5 "Framing
   beside the panel").
6. ONE per-frame updater, registered after every town piece's: `player → camera → intro → cut → time → ui → deploy`
   (the intro reads the rig's pose of the frame as its end pose, so it runs right after the camera). A module whose
   `update` throws is reported once and switched off.
7. **Shader warm-up** behind the boot screen: `Engine.start()` in capture mode (installs `__pixel.renderAt/info`, renders
   t = 0) + one more frame (≈ 0.3-0.7 s). Without it the first night frames stalled at ~1 fps for 5 s. The characters'
   'char-fx' program is compiled here too and held for the page's life (`keepFxProgram`, §8 characters).
8. **The demo's own real-time loop** (not `Engine.start()`'s: that one has debug WASD/drag camera controls and can pass
   a NEGATIVE t on its first frame, which crashes house-1, §8): `t` = seconds since the warm-up, monotonic, a frame
   gap is capped at 0.25 s (hidden tabs resume, they do not jump).
9. `__demo.ready = true`, event `'ready'`, boot screen fades. With the intro: its key poses render one frame each behind
   the loading screen (every program compiles there), then the loading screen fades and the flight starts (≈ 10.4 s;
   Esc / click / any key skips; the key that starts play does not move the player). The panel is hidden while it runs
   (`body.ct-intro`). Without it (`?intro=0`, automation, capture) the loading screen fades on ready.

## 3. The shared state (`src/demo/state.js` → `store`; implementation `api.js createStore`)

```js
import { store } from './state.js';
store.state                       // frozen snapshot, replaced on every change (compare by reference)
store.set({ phase: 'vote', nominee: 6 }, 'ui')   // shallow merge, validated; returns true if anything changed
store.setSeat(3, { dead: true }, 'ui')
store.on('phase', ({ value, prev, state, source }) => ...)   // per key; 'change' → ({ keys, state, prev, source })
```
`source` tags the writer ('ui', 'time', 'player', 'key', 'url', 'test', 'reload') so a module can ignore its own echo.

| key | type / values | default | meaning · who writes · who reacts |
|---|---|---|---|
| `character` | id string | `'wanderer'` | the player's character · ui, keys · **player** swaps (restores the old id on failure, source 'player') |
| `timeOfDay` | hours 0..24 (float, wraps) | 12.5 | the town clock · **time** (source 'time', at least once per game minute while it runs), ui slider (jumps) · time |
| `timeSpeed` | game minutes per real second, 0..3600 | 1 | 0 = the clock stands, 60 = an hour per second · ui, keys · time |
| `paused` | bool | false | freezes the clock only (walking / life / rendering go on) · ui, keys · time |
| `phase` | `day` `nomination` `vote` `execution` `night` | `day` | game phase · ui, keys · **time** → dais `setPhase` / ceremony |
| `nominee` | seat index 0..14 or null | null | the seat being nominated / voted on / executed · ui · time |
| `seats` | 15 × `{occupied, dead, ghostVote, nominated, onBlock}` | all empty | the voting circle · ui · time → dais `setSeat` |
| `quality` | `high` `low` | `high` | render tier; a change **reloads** the page (`demo.reload`) — the town is built per tier |
| `life` | bool | true | the life layer (walkers, crows, smoke, cats ...) shown + updated · ui, keys · time |
| `cutaway` | `auto` `on` `off` | `auto` | camera-aware cut-away; auto = on at viewHeight ≤ 20.5 · ui, keys · **lead** (cut controller) |
| `camera` | `follow` `vote` `overview` `iso` `free` | `follow` | camera mode · ui, keys · **lead** (camera rig) |
| `zoom` | viewHeight (a `ZOOM_LADDER` stop, 5..45) | 12 | follow / free zoom; 12 = the game's camera · wheel, keys, ui · lead |
| `yaw` | degrees, multiple of 45 | 0 | follow / free camera yaw (0 = the game's view, looking north) · keys, ui · lead |
| `ui` | bool | true | control panel visible · keys (H), ui |
| `location` | `'town'` \| `'house-0'..'house-14'` | `'town'` | where the player is · **player** writes it (source 'player') on every enter / leave; any other writer (ui Travel 'enter' / 'leave', tests, `?in=`) makes the player go in / out (fade) · player, ui, time (room lights), lead (cut-away off inside) |

Runtime-only data lives on the module objects, not in the store: `demo.player.position` (Vector3, logical ground point),
`demo.player.facing`, `demo.player.handle`, `demo.player.nearDoor`, `demo.player.location`, `demo.player.interior` (the room
record: id, name, camera, floor, spawn, exit, bed, visitPoint, lights, spots), `demo.player.transition`, `demo.time.hours`,
`demo.time.preset`, `demo.time.info.room` (`{id, lights, of}` while the pool is aimed at a room), `demo.cut.info`
(`{on, circle, house, boxes, inside}`), `demo.intro.phase` (`warm` `fly` `title` `done`), `demo.npcs.list`.

**The `demo` object** every factory receives: `{ engine, params (URLSearchParams), store, layout (src/town/layout.js),
town ({registry, tod, preset, root, lights, cutaway, quality} = buildTown's result), events, input, characters (the
listCharacters() array), player, camera, cut, time, ui, deploy, reload(patch) }`. Modules created later are filled in as
the boot proceeds (the ui sees everything; the player sees no time / ui yet).

**Events** (`demo.events.on(name, fn)` → unsubscribe; `emit(name, payload)`; `'*'` gets `(name, payload)`):

| event | payload | emitted by |
|---|---|---|
| `ready` | `{buildMs, compileMs}` | main |
| `player:character` | `{id, handle}` | player, after a swap |
| `player:door` | `{id, near}` | player, entering / leaving a door trigger |
| `bell` | `{t}` | time (any module may call `demo.time.ringBell()`) |
| `tod` | `{preset}` (+ whatever time adds: `{hours, sunAz, sunElev}`) | time, when the sky changes |
| `toast` | `{text}` | anyone; ui shows it |
| `player:location` | `{location, prev, room: {id, name} \| null}` | player, after entering / leaving a cottage |
| `player:teleport` | `{x, z}` | player |
| `intro:start` / `intro:title` / `intro:end` | `{}` / `{}` / `{skipped}` | intro (flight start, title card, hand-over to play) |

**Input** (`demo.input`, api.js `createInput`): `held(code)` / `any(...codes)` for continuous keys (movement),
`bind(code, fn, {desc, group, repeat})` → unbind for presses. `KeyboardEvent.code` names (`'KeyW'`, `'ArrowUp'`,
`'BracketRight'` ...), so keyboard layouts do not matter; keys typed into form fields are ignored; `bindings()` lists
everything for the help overlay (`keyLabel(code)` → printable). **Bind your keys through it, never raw listeners.**

## 4. Owner contracts

### 4.1 player — `createPlayer(demo) → Promise<player>`
`player = { position: Vector3, facing, handle, nearDoor, update(t, dt), setCharacter(id) → Promise, teleport(x, z, face?),
emote(clip), dispose() }`.
- Movement: WASD / arrows relative to the camera (`api.js cameraAxes(engine.camera.targetYaw)`: W = screen up), ONE
  game speed (CHARACTERS.md: there is no run in the game; use the character's walk speed / `locomotion.js gameSpeed`).
- Collision: `layout.blocked(tx, ty)` (rebuilt from the PLACED rotated outlines) + whatever finer test you need
  (`layout.insideHouse`, props `objects[].rect`); slide along walls, never tunnel.
- The Character: created by characters.js with `autoUpdate: false` — **the player calls `handle.update(t)` every frame**
  (a disposed Character's engine updater cannot be removed, so autoUpdate would keep swapped-out characters running).
  `ch.drive(t => {pos})` must be a function of t: interpolate your recorded frame positions (the runtime sub-steps at
  60 Hz and re-simulates from 0 if t jumps by more than 1 s).
- Doors: use the PIECE's door anchor (`api.js doorOf(registry, id)`: anchor `point`/pivot first, layout record second).
  **Known town issue:** house-14's real door (front wall, local z ≈ 1.1) differs from layout.js by 0.9 m
  (`engine.stats.doorMismatch = [["house-14", 0.9, 1]]`, seen in every demo run) — trigger on the anchor, and report.
  Open the door anchor (`open(f)`, stepped, not gliding) while the player is in front of it; emit `player:door`.
- Emotes: the game's clips — `talk`, `vote`, `point`, `die`, `ghost`, the signature emote (CHARACTERS.md clocktower rule;
  no combat). Spawn: `api.js SPAWN` (or `?at=x,z`).
- **Houses** (interior.js, the kit `src/town/interiors/index.js buildInterior`): walking INTO a cottage's door (pushing
  toward it on the doorstep) fades to its room (far from the town, x = 200 + 30 i); inside, stepping on the exit spot or
  pushing out on it fades back to the doorstep, facing out. `player.enter(id, {instant})`, `player.leave({instant})`,
  `player.location`, `player.interior`, `player.transition`, event `player:location`, `?in=house-N` (start inside),
  `?interiorKit=stub` (fallback rooms). The room's `update(t, dt)` (the kit's wall cut-away by yaw, the house
  animations: house-9's pendulum / hands / gears, house-14's mill wheel ...) is called by the player every frame.
  Walk-through props: layout.js `walkable` (crates, barrels, pumpkins, flower barrels) never block.

### 4.2 characters — `listCharacters()`, `createCharacter(engine, id, {position, face})`
- `listCharacters() → Promise<[{id, name, complete, bodyPlan?, height?, blurb?}]>`: every character the demo may offer;
  only `complete: true` appear in the switcher. Source of truth: docs/CHARACTER_STATUS.md "Shipped characters"
  (stub: wanderer, keeper, hound, duelist) + cast members the character session marks finished. The list must be
  robust while that session is mid-edit: a spec that fails to import is `complete: false` (probe lazily or on demand).
- `createCharacter → Promise<handle>`, `handle = { id, spec, ch, root, height, walkSpeed, clips, update(t), dispose() }`;
  `new Character(engine, spec, { autoUpdate: false, snap: true, facingSteps: 8, position, face })`; attach the spec's
  smears / FX like `scenes/char-stage.js createActor` does. Reject with an Error on failure (never throw at import time).
  The caller adds `handle.root` to the scene; `dispose()` removes it. Characters are never cut away (not under the town root).

### 4.3 time (town states) — `createTime(demo) → { update(t, dt), hours, preset, ringBell(), dispose() }`
- **Continuous** time of day: the stub only snaps to the nearest `TOWN_TOD` preset (`api.js presetForHour`). Target:
  sun azimuth / elevation, ramps, sky, window glow, cloud strength interpolated across the day (sky.js / `applyTownTime`
  read-only: compose from their exports), dawn / dusk lamp lighting via life's `setTimeOfDay` cycle.
- **Point lights**: the town's PointLights are installed ONCE at build (`installLights`, max 12 / 8 low) **only if the build
  tod has lights** (noon builds none). Changing the NUMBER of lights recompiles every material (a visible hitch): keep
  the count constant (e.g. install the max at boot and drive intensity 0 by day), re-aim them at the anchors nearest the
  player as the player walks. `engine.renderer.info.programs.length` must stay constant across a full day cycle.
- Tower: `clocktower.api.setTime(h, m)` (12 h dial; reaching the hour rings the bell itself), `ring(t0)`; life's own clock
  also calls setTime once per life-minute and strikes on its hours — CONTRACT-REQUEST life: an external-clock mode (§8).
- Dais: `setPhase(phase, {from: nominee, t0, perSeat})`, `setSeat(i, state)`, `setNight`, `setHand`; the scripted
  ceremony is `life/ceremony.js createCeremony` (read it for timings; drive the dais from the store, not a fixed script).
- Life on/off: the stub hides `registry.get('life').group` (its update still runs: cost, see §8). Quality: `demo.reload({quality})`.
- Writes `store.timeOfDay` with source 'time' (at least every game minute); reacts to ui jumps (source ≠ 'time').
- **Inside a cottage** (`demo.player.interior`): the SAME constant pool (12 high / 8 low, minus the pinned dais brazier)
  is aimed at the room's `lights` (fire first, then lanterns / candles, then windows); the hearth always burns,
  lanterns / candles at 0.45 by day → 1 at night, windows follow the daylight; the point-light reach is capped at 3 m
  (night reach 4 m paints flat pools across a 9 × 6 m room). Leaving re-applies the clock and re-aims at the player.
  The count never changes (programs constant). The window panes show the sky through `room.setTimeOfDay` (the player
  calls it on `tod`).
- **Room night looks** (r6, the critic's "every room falls to the same blue-grey wash"): while inside, `applyHours` pulls
  the night look toward the room's own palette × the darkness (`ROOM_NIGHT` in time.js, from LORE.md's ambiance column:
  candle-warm 3, gold 6, orange 8, leather 10, newsprint cream 12, teal river 13, warm wood 14 ...): `sh` tints the
  hemisphere fill (the shadow band of every lit surface, with a luminance `gain` so caps / beams separate from the void),
  `lit` tints the lit ramps + moon by `litK` (default 0.3: a full tint turned the moon patches into tan blobs), the
  night desaturation eases, and the night mist inside is scaled by `mist`. `rampSh` is untouched, so the void
  (`interior-void`, unlit 'sh') keeps the night-sky tone. A kit room's own `nightAmbient` (`{lit, sh, k, litK, gain,
  mist}` or `{color, strength}` on the build result / its `room`) wins over the table (CONTRACT-REQUEST interior-kit, §8).
- **Room pools**: a light within 0.5 m of a back / side wall reaches at most 1.3 m (fire 2.2 m) at 0.7 × intensity, and
  `uPointLevels` is 6 inside (3 in town, restored on leaving): the cut-away's dithered pool bands are half as tall, so
  pools fade instead of ending in a hard coloured disc. `?roomLook=0` turns all three off (A/B review).
  `demo.time.info.room = {id, lights, of, nearWall, look: {k, own}}`.

### 4.4 ui — `mountUI(demo) → ui | Promise<ui>`, `ui = { el, update(t, dt), toast(text), dispose() }`
Mount into `#demo-ui` (pointer-events only on your children; the canvas keeps the rest). Read / write ONLY through the
store (source 'ui') and events. Character switcher from `demo.characters` (complete only), clock (continuous slider +
speed + pause), phase / nominee / seat editor (15 seats: occupied, dead, ghost vote, nominated, on block), bell, quality,
life, cut-away, camera (mode, zoom, rotate), help overlay from `input.bindings()`, a status line (clock, preset, phase,
fps, player position, door; "inside <house>" in a room).
- **Character**: every offered character (`complete: true`; shipped first, then work in progress) with its 24 px
  portrait (`c.thumb`), group headers "Shipped · n" / "Work in progress · n", a `WIP` prefix in the sub line.
- **Travel**: the 15 cottages (select → `go` to the door, `enter` → `store.set({location})`, the player fades in),
  `leave` (back to the doorstep), `bed` (inside: walks to the room's night-visit point by the bed), dais / tower / well /
  fountain / spawn, jump / walk. `ui.enterHouse(id)`, `ui.leaveHouse()`, `ui.visitBed()` for tests. Text through `textContent` / DOM nodes (no innerHTML with data). Gothic-cozy styling to
match the town (no external fonts / CDNs).

### 4.5 deploy — `installDeploy(demo) → { update(t, dt), dispose() }`, `tools/demo-serve.mjs`, `tools/demo-check*.mjs`
`window.__demo = { ready, errors[], frames, state(), set(patch) (source 'test'), info() → {state, fps, player: [x, z, facing],
character, nearDoor, cut, tod, hours, engine: __pixel.info()} }` — the automation surface Playwright scripts use.
Also: an on-page error overlay, a frame-time watchdog (suggest `quality=low` when the median frame > 20 ms), the serve
script, and the playtest automation (§9 as a script). **Note** `Object.assign` copies getter VALUES: define live fields with
`Object.defineProperty` (the stub's `frames` was 0 for that reason).

### 4.6 lead (api.js) — camera rig + live cut-away (owners: request changes from the lead)
- `createCameraRig(demo)`: `follow` (critically damped ~0.25 s, hard catch-up beyond 4 m; the PixelCamera snaps to
  texels itself), `vote` / `overview` / `iso` (`town/api.js CAMERAS`), `free` (drag to pan). Q / E rotate 45° (stepped
  `rotateTo`), wheel / − / = walk the zoom ladder, C cycles modes. `rig.snapTo(p)` for teleports.
- `createCutController(demo)`: every frame (rebuilt only when the 5 cm-quantised player cell / house / yaw changes):
  the voting circle while the camera centre is on the square, a 0.9 × 1.8 m box at the player, and the cottage whose
  door-approach zone (`town.js doorZone`) the player stands in (`houseBox` cut box + keep box, as buildTown does for
  `?focus=x,z`). `info = {on, circle, house, boxes, inside}`. Not yet live: roof-off **lifts** (§7).
- Inside a cottage the controller switches the town cut-away off itself (boxes, keep, circle cleared) and rebuilds on
  the first town frame after `player:location` (the doorstep cell on the way out equals the one on the way in).

## 5. URL parameters (`demo.html?...`)

State: `char=<id>` `tod=<hours>|night|morning|noon|afternoon|golden` `speed=<min/s>` `paused=1` `phase=<phase>`
`seats=<n occupied>` `quality=high|low` `life=0` `cut=auto|on|off|0|1` `cam=<mode>` `zoom=<vh>` `yaw=<deg>` `ui=0`;
`at=<x>,<z>` player start; `in=house-N` start inside a cottage (state.location; written by `demo.reload` instead of
`at` while inside); `intro=0|1` the cinematic (default on in a browser, off under automation / capture); `npcs=<n>` idle
townsfolk characters (0 = off); `roster=shipped|all|a,b`, `thumbs=0`, `exercise=0` (characters.js);
`interiorKit=stub`; `demoGrass=wide4` (review: the old grass area). Engine: `scale=<n>|fit`, `capture=1` (headless: renders t = 0 only, no loop). Town params pass
through to buildTown (`lights=`, `vignette=`, `contact=0`, `shadowCull=0`, `relAz=`/`elev=` ...), except
`cut cam yaw focus pieces pan` (the demo owns those). `demo.reload(patch)` writes the whole state back into the URL.
It always writes `intro=0`: a reload (quality change) is a rebuild, not a new visit, so the loading screen shows but
the opening cinematic never replays (even when the page was opened with `?intro=1`).

**Framing beside the panel (main.js `installViewInset`, r6):** the framed views — the cottage dollhouse camera and
the vote / overview / iso presets — are centred on the part of the canvas the panel leaves visible: the camera target
moves right by half the covered width (whole low-res texels, eased ~0.2 s), and inside a cottage the view widens
(viewHeight × ≤ 1.35) until the room's projected width + 0.5 m margins fits beside the panel (house-8 at 1280 × 720:
vh 5.62 → 7.55). Follow / free stay centred on the canvas (the player stays mid-screen). The covered width is measured
from the panel's box (ResizeObserver + class changes + the store's `ui`): 0 when hidden, folded, during the intro or not
on the canvas' right half. `demo.camera.inset = {px, shift, fit}`.

**Panel folding (ui.js):** the fold button's choice is saved (`prefs.collapsed`) on wide screens. The panel also folds
by itself, unsaved, when `innerWidth < 700` (phones: it would cover ~80% of the view; re-checked on resize) and inside
a cottage when `innerWidth < 1100` (the dollhouse room would sit partly under it); it unfolds again when the condition
ends. A click overrides the automatic fold until the condition changes. Checked by `shots/lead-fix7/check.js`.

## 6. Controls and how to run

| key | action | owner |
|---|---|---|
| W A S D / arrows | walk (relative to the camera) | player |
| Q / E | rotate the camera 45° | lead |
| wheel, − / = | zoom (ladder stops) | lead |
| C | cycle camera mode (follow → vote → overview → iso → free) | lead |
| T | pause / run the clock | time |
| , / . | clock slower / faster (×½ / ×2) | time |
| B | ring the bell | time |
| V | next phase | time |
| L | life on / off | time |
| H | the keys overlay (Esc closes) | ui |
| ` (backquote) | show / hide the panel | ui |
| [ / ], 1-6, Space | previous / next character; emotes (talk, vote, point, die, ghost, signature) | player |
| P | play / stop the voting ceremony | time |
| walk into a door | go into the cottage; on the exit spot (or pushing out on it): back out | player |
| click | walk there (a cottage: to its door and in) | player |
| Esc / any key / click (cinematic) | skip the flight; on the title card: begin | intro |

**Run it (desktop browser).** The repo needs `node_modules/three` (it lives on render-host, not on the Mac). Serve from the
4090 and tunnel the port:
```
tools/remote.sh true                                    # sync the tree to render-host:~/pixel3d
ssh -L 8770:127.0.0.1:8770 render-host 'cd pixel3d && source ~/clocktower/env.sh; node tools/demo-serve.mjs --port 8770'
# then open http://127.0.0.1:8770/demo.html in Chrome / Firefox / Safari (WebGL2)
```
**Headless check** (what every owner runs; exit 1 on any console / page / shader error):
```
tools/remote.sh node tools/demo-lead.mjs shots/<you>/x.png --wait 3000 [--q "tod=night&char=keeper"] \
    [--set '{"character":"hound","yaw":45}' --after 2000] [--keys "KeyW:1500,KeyA:800"] [--shots 3]
rsync -az render-host:pixel3d/shots/<you>/ shots/<you>/ --include '*.png' --exclude '*'     # then Read the PNG
tools/remote.sh node tools/demo-lead-prof.mjs --q "tod=night"    # per-updater CPU ms + frame ms (GPU-synced)
```

### How to open / publish (owner: deploy)
**Open (tailnet).** `tools/demo-serve.sh` syncs the tree and (re)starts `tools/demo-serve.py` on render-host, bound ONLY to
its Tailscale IP: open **http://<tailnet-ip>:8090/demo.html** from any tailnet machine (`status` / `stop` / `log`).
Check it: `tools/remote.sh --no-sync node tools/demo-smoke.mjs --base http://<tailnet-ip>:8090` and
`tools/remote.sh --no-sync node tools/demo-play.mjs --base http://<tailnet-ip>:8090`.

**Publish (static bundle).** `tools/demo-bundle.sh` builds `dist/v3-art-demo/` on render-host and rsyncs it back to the Mac:
`index.html` (= demo.html **without the import map**), the runtime `src/**` (.js/.css/.json; not `src/main.js`),
`characters/<id>.js` for EVERY id in `src/demo/roster.json` (shipped + WIP, so `?wip=1` works; the public page offers the
finished ones only) plus character modules other shipped code imports (life's `mannequin.js`), and only the three r170
files actually reached (three.module.js, BufferGeometryUtils, ConvexGeometry, ConvexHull) + three's LICENSE. Never
shipped: tools/ shots/ docs/ research/ **refs/** (private third-party images) out/ scenes/ node_modules/; the build also
refuses any .png/.jpg/.md/.py/.sh. It fails on any relative import that is not in the bundle, a bare import the map does
not cover, or an absolute URL. All URLs are relative, so copy the folder under any sub-path of another site
(`https://host/v3-art-demo/` — the trailing slash matters; static hosts redirect to it). No server-side code, no build
step; any static file host with `text/javascript` for .js works.

**CSP.** The live host (https://<public-host>/v3-art-demo/) sends, on every demo response:
`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'`.
`script-src 'self'` blocks the inline import map, so the build's LAST step is `tools/demo-bundle-csp.py`: every bare
`three` / `three/addons/...` import in the bundle's .js (src, characters, the vendored addons) becomes a relative path into
`./vendor/three/` and the map is removed (it exits 1 if an inline `<script>` or a bare three import is left). Then the
build greps the bundle for anything else that would need `'unsafe-eval'` / inline script (eval, `new Function`, string
timers, `javascript:` URLs, data: workers, inline `on*=` handlers): none. The inline `<style>` and the data: portraits are
allowed (`style-src 'unsafe-inline'`, `img-src data:`). So the dev tree keeps its import map; only the bundle is rewritten.

**Verify.** `VERIFY_PLAY=1 tools/demo-bundle.sh verify` serves the bundle under `/v3-art-demo/` on 127.0.0.1:8091 (render-host)
with a tiny Python server that sends EXACTLY that CSP header (checked with curl first), then runs `tools/demo-smoke.mjs
--expect-csp "<policy>" --tour` (4 tier x tod runs + the guided tour: loading screen, cinematic, Esc, square noon, walking,
2 characters, 3 interiors, night, then a `?wip=1` load of a WIP character) and `tools/demo-play.mjs` (§9). Every smoke page
logs `securitypolicyviolation` events from before any page script and fails on any, on a console "Refused to ..." line, a
missing / different CSP header on a document, or a request outside the prefix. Output: `shots/bundle-final/{smoke,play}/`.
2026-10-16 (CSP bundle): **162 files, 5,494,988 bytes (5.24 MiB)** (src/town 1.63 MB, vendor/three 1.37 MB, characters
0.90 MB, src/ambient 0.48 MB, src/demo 0.39 MB, src/chars 0.38 MB, src/world 0.23 MB, rest 0.12 MB); the CSP pass rewrote
131 of 156 .js files. 32 roster characters shipped as files + mannequin.js; the public page offers the 27 finished ones
(wanderer, keeper, hound, duelist, owl, skeleton-chef, mushroom, chonk, cilantro, clarabelle, rabbit, fox, honk, moth,
goat, mincut, crow, mole, opal, polly, preservation, progress, requin, frog, snail, toad, green-hood) and no WIP;
`?wip=1` adds the 5 WIP characters (greenting loaded and walked in the tour).
Under the exact CSP: smoke 5/5 (high/low x noon/night at 60 fps + the tour), **0 CSP violations**, header exact on every
document; playtest all green except the known house-7 grid artefact (§8, not a gameplay or CSP issue). Negative control:
the same bundle with one inline `<script>` added fails the smoke (script-src-elem + the expected style / data: blocks
under a stricter policy), so the detector works. Stills + GIF: `shots/bundle-final/` (`smoke/tour-*.png`, `play/`).

## 7. Lead backlog / known issues (2026-10-16)
- **Roof-off lifts** are not live in the demo (only the window cut + circle + player box + door-zone house). buildTown
  decides lifts once (sampling every cottage against the focus boxes) and builds BackSide section twins for the lifted
  cottages; doing that per door zone needs twins built lazily per cottage + the `groundHides` test (not exported from
  town.js). Next lead round.
- Life's PointLight-free moth / smoke effects are chosen around the build camera target (`engine.camera.target` is read
  live for moths, fine), but `installLights` picks its 12 lights near the BUILD target (the square): §4.3.
- The grass area is x −2..47, z 3..41.5 (§2.4, a scoped camera getter for the ground piece's viewArea): the per-m²
  tuft density is ~18 % lower than the old z ≤ 34.5 area (the 80k cap spreads over more ground). A real `grassArea`
  option in the ground piece would remove the hack and keep the density (CONTRACT-REQUEST ground, §8).
- Spawn is the game's PLAYER_SPAWN tile (22, 27) at z 27.1. House-9 (Gloamend Clockworks, the low-centre house) now sits
  5 m south of the game position (layout lead, LAYOUT_DELTAS dz 5.0, the user's request): at the gameplay camera with
  the cut-away OFF the whole voting circle, all 15 seats and the kerb are in view with a strip of lawn above its roof
  (`shots/demo-lead/r5/h9-circle-cutoff.png`).
- The vote camera (`town/api.js CAMERAS.vote`, target z 7.4, viewHeight 20) frames the tower dial and the circle with
  the south seats on the bottom edge of a 720 px frame (`shots/demo-lead/play6/28-phase-vote.png`).
- At night a cottage room's floor is half in the moon shadow of its own side wall (no ceiling: the town's sun / moon
  light the room); the hearth / candle pools read, the far side is dark (`play6/07-in-house-8-night-bed.png`).

## 8. Contract requests raised by the demo (for the owners of read-only code)
- **core (Engine.start)**: the RAF loop computes `t = (now − t0) / 1000` with `t0 = performance.now()` taken before the
  first RAF, whose timestamp can be EARLIER → the first frame runs at a negative t. Clamp `t ≥ 0` (or take t0 from the
  first RAF timestamp). The demo runs its own loop meanwhile.
- **house-1**: `update(t) { setFrame(Math.floor(t * 4) % 3) }` indexes `frames[-1]` for t < 0 and throws
  (`undefined is not iterable`, house-1.js:453) — use `((Math.floor(t * 4) % 3) + 3) % 3`.
- **ground**: a documented grass-area option (`ctx.params` / build opts, e.g. `grassArea=town`) instead of the build
  camera's view area; the demo widens `engine.lowW` during the build as a workaround.
- **life**: an external-clock mode (`api.setClock(fn)` / `?lifeClock=external`): the demo's continuous clock should drive
  the tower hands, strikes, lamp cycle and walkers' schedules; today life sets the tower time on its own scripted clock.
  Also `api.setEnabled(bool)` so life off skips its update cost.
- **town.js**: export `groundHides` (and ideally a `computeLifts(registry, cutaway, focusRec)` helper) so the demo can run
  the roof-off decision live; `installLights` → a re-aimable light set (`retarget(pos)` without changing the count).
- **layout / house-14**: resolved (layout.js now carries the real recessed door; no `stats.doorMismatch`).
- **ground**: still wanted — a `grassArea` build option (the demo's scoped viewArea getter, §2.4, is a workaround).
- **foliage**: the south hedge row and the wildflower strip run across the new south bay (layout rows 36..41,
  x 15..29), over the cart-road arms and in front of house-9's door (visible in `shots/demo-lead/r5/bay.png`).
- **town/api.js CAMERAS.vote**: the south seats sit on the frame's bottom edge; a target ~1.5 m further south (or
  viewHeight 22.5) would show the whole circle with the dial.
- **camera turns (town)**: each 45° pose costs a 25-40 ms frame, the first visit of a new angle ~200 ms (intro report):
  something is rebuilt per yaw (billboard re-orientation caches keyed by yaw in foliage / trees / grass / house-1 / -4 /
  -11); cache per 45° stop.
- **characters (src/chars)**: the 'char-fx' ShaderMaterial compiles on its first effect (the intro reveals it for one
  frame behind the loading screen; compiling at creation would fix it everywhere). r6: main.js `keepFxProgram` now
  draws a never-disposed 1-mote twin in the warm-up frames, so the program compiles behind the loading screen and is
  never released by a character swap (it was: demo-play's day cycle re-linked it at 19:40, programs 42 → 43).
- **interior-kit**: `Room.light` drops `hug` (index.js reads `l.hug === false`); extras cannot attach to a wall for the
  cut-away (house-14 hides its back-wall cog itself).
- **interior-kit (r6 critic, night line-up)**: (1) a per-room `nightAmbient` in the ROOM export, passed through on the
  build result (`it.nightAmbient` or `it.room.nightAmbient`; shape in §4.3). The demo reads it today and falls back to
  its own `ROOM_NIGHT` table, so builders can override per room without a demo change. (2) `aimLights` (the viewer's
  path, scenes/interior.js) still paints hard discs: do what the demo does — cap `distance` of wall-hugging lights
  (≤ 1.3 m, fire 2.2 m, × 0.7 intensity) and raise `uPointLevels` while a room is shown — so the 25 % line-up matches the
  demo. Then the house owners set `nightAmbient` and re-render their night shots.
- **house-3 (seen 2026-10-16 19:15, WIP?)**: a large flat brown plane at ~2.4-3.6 m covers the top-left of the
  dollhouse view (the back wall, the arches) — present with `?roomLook=0` too (`shots/demo-lead/r6/ab.png`).
- **deploy (tools/demo-play.mjs, doors step)**: "no walkable path to house-7 door (40.02, 32.24)" is a playtest-grid
  artefact, not a gameplay bug: the layout's 1 m `blocked` grid closes the whole x = 39 column in front of the door
  (house-7's footprint), so the nearest free tile (38, 32) is 1.02 m from the door and the goal test (< 0.95 m) never
  matches. The real player walks in fine (`--q "at=37.6,32.8" --keys KeyD:2500` → location house-7,
  `shots/demo-lead/r6/h7-door.png`). Fix: goal radius 1.1 m (the trigger is 1.4 m), or sample `collision.js`'s finer
  free test for the last tile. (Or layout: rasterise house-7's placed outline so x = 39 stays walkable at the door.)

## 9. Playtest checklist (every owner before reporting; `tools/demo-play.mjs` automates it)

```
tools/remote.sh node tools/demo-play.mjs --out shots/<you>/play       # ~160 s, exit 1 on any error / failed check
rsync -az --exclude frames/ render-host:pixel3d/shots/<you>/play/ shots/<you>/play/    # then LOOK at sheet.png + the shots
```
Steps (skip with `--skip a,b`): loading (bar rises, labels change; `?intro=1` forced) + intro (flies, Esc skips: camera
on the player at yaw 0 / viewHeight 12, panel back, player unmoved) · crates (walks straight through a crate stack and
a barrel) · houses (walks INTO the door nearest the spawn, house-9 by the Travel panel's 'enter', house-12 by the store's
`location`; inside: not the stub room, the time pool aimed at the room, the town cut-away off; at 23:00 the 'bed' button
walks to the night-visit point with lights lit; leaves by walking out / 'leave'; back on the doorstep with the cut-away
on; a re-visit compiles nothing) · doors (4 doors incl. house-14, steps back off each doorstep) · roster (`--chars 5`:
shipped + WIP, the panel's groups / portraits, one model per character, programs) · time (scrub, 24 h at 120 min/s:
programs constant, no frame > 50 ms) · phases (V) + bell · ceremony (P: day → nomination → vote → execution → night)
· controls · quality reload (state + position kept) + a reload inside a house (`?in=` brings the player back in).

1. `demo.html` boots to the town in < 6 s on the 4090, no console / page / shader errors (`tools/demo-lead.mjs` exit 0),
   boot screen gone, 60 fps reported.
2. Walk all four lanes and round the square: no tunnelling into cottages / props, camera follows smoothly, the character
   is never hidden behind a cottage (player cut box) and every cottage you face is protected (door zone).
3. Stand in front of each of the 15 doors (house-14 by its anchor): the door opens, `nearDoor` is right.
4. Switch through every complete character while standing still and while walking: no error, no leftover model,
   `programs` grows at most once per new character, never per frame.
5. Run the clock through 24 h at speed 600: the sky / sun / glow change continuously, lamps light at dusk, the tower hands
   follow and strike on the hour, `programs` stays constant, no hitch > 50 ms.
6. Phases day → nomination → vote → execution → night with a nominee and 5-15 seats (dead + ghost votes): the dais follows.
7. Bell (B) swings the bell; life off / on; cut-away auto / on / off; every camera mode; Q / E; zoom ladder.
8. `quality=low` reload keeps the state (character, time, phase, position) and is faster (`tools/demo-lead-prof.mjs`).
9. Resize the window / `scale=fit`: no stretched pixels, the UI stays usable.

## 10. Lead verification log (commands actually run, render-host, RTX 4090, headless Chromium, 1280x720)
- `tools/remote.sh node tools/demo-lead.mjs shots/demo-lead/boot-noon.png --wait 3000` → exit 0, ready ≈ 2.6-3.7 s
  (build 2.2-2.8 s, warm-up 0.3-0.7 s), 60 fps, 37 programs, 391-415 calls, ~1.05M tris; `boot-night.png` (`--q tod=night`)
  60 fps, 38 programs. Both run 3× without errors after the loop fix.
- `--keys "KeyW:1500,KeyA:1200"` → the player walked (22.5, 27.1) → (20.94, 25.15) (`walk.png`).
- `--set '{"character":"hound","yaw":45}' --keys KeyD:1200` → swap + rotated camera, 59.6 fps, 40 programs (`swap.png`).
- `--q "at=7.9,13.4" --keys KeyW:400` → door zone of house-14 protected (`cut.house = house-14`, `h14.png`).
- `--q "cam=vote&seats=12&phase=vote&tod=golden" --set '{"nominee":4}'` → vote camera, golden, 59.7 fps (`vote.png`).
- Before the fixes: the Engine.start loop crashed house-1 at negative t on ~3/4 night loads; without the warm-up the first
  ~5 s of night ran at ~1 fps (`tools/demo-lead-prof.mjs`: steady-state frame 3.3 ms, all updaters < 0.1 ms).
- **Round 5 (integration: loading → cinematic → spawn, roster, houses, the new layout)**, all on render-host:
  - `tools/remote.sh node tools/demo-play.mjs --out shots/demo-lead/play6` → **PLAYTEST OK (159 s)**, no console / page /
    shader errors. Loading 9 samples, bar 0.04 → 0.94, 8 labels; intro flew (programs [45, 45], max gap 18 ms), Esc →
    yaw 0, vh 12, camera on the player. Crates at (36, 22.5) and a barrel walked through. house-8 walked in (3.5 s incl.
    the room build), house-9 by the panel (1.5 s), house-12 by the store (0.9 s); time lights 5 / 6 / 4 aimed, cut off
    inside, 6 lit at 23:00, bedside 0.11 m from the visit point; all three left onto their doorsteps with the cut back
    on; programs 46 → 48 (3 rooms) → 48 (re-visit). Roster: 28 offered (4 shipped + 24 WIP, 28 portraits), owl / keeper /
    chonk / hound / wanderer swapped in 1-187 ms, programs 48-49. Day cycle: programs 48 throughout, max frame 16.8 ms.
    Ceremony: all 5 phases, 15 seats. Reloads: low keeps character / phase / clock / position; inside house-3 → `in=house-3`
    → back in house-3. Earlier runs (play1-play5) found and drove the fixes: the doors step walked into houses (the
    playtest now stops 0.75 m in front and steps back), the cut-away stayed off after leaving (fixed in the controller),
    the roster's scene-children count (the shipped four add FX holders; now counted per model).
  - `tools/remote.sh node tools/demo-lead.mjs shots/demo-lead/r5/{base,boot}.png --wait 3000` → errors [], 60 fps,
    39 programs, ready ≈ 4.0 s. `--q "intro=1"` → intro 'fly', errors []. `--q "at=20,38.6&ui=0"` (bay.png, the south bay
    with grass) and `--q "cut=off&ui=0&at=22.5,24.6&npcs=0"` (h9-circle-cutoff.png) → errors [].
  - `node shots/demo-lead/grass.js` (scratch): grass 11 504 tufts, x −2..47, z 3..41.5, 615 in the bay; `demoGrass=wide4`:
    10 369, z 4.5..34.5, 0 in the bay.
- **Round 6 (critic r6: room night looks + pools, the playtest, framing beside the panel)**, all on render-host:
  - `node shots/demo-lead/rooms6.js shots/demo-lead/r6/night{0,3}` (scratch: one boot, the 15 rooms via the store at
    23:00, ui off) → errors none, programs 45 → 46 (+1: the fx keeper) constant across all 15 rooms; contact sheets
    `night0/sheet.png` (before: 3, 12, 13, 14 in one blue-grey wash) → `night3/sheet.png` (3 mauve candle-dark, 6 gold,
    8 orange, 10 leather, 12 cream, 13 teal, 14 warm wood; 12-14's caps separate from the void). A/B with `?roomLook=0`:
    `r6/ab.png`, `r6/ab2.png` (4 / 5 / 11: softer pools, palettes kept). The first full tint made moon patches tan blobs
    (`ab1/house-10.png`) → `litK` 0.3.
  - Framing: `rooms6.js shots/demo-lead/r6/ui --ui 1 --houses 8,3,6` → house-8 vh 5.62 → 7.55, target +1.72 m: the whole
    cabin (bed, firewood, visit point) left of the panel (`ui/house-8.png`); `--houses none --q "cam=vote..."` → the
    circle's east seats clear of the panel (`ui/vote.png`). Phone (`--size 390x844 --q in=house-8`): panel folded, no
    shift (`phone.png`).
  - `tools/remote.sh node tools/demo-lead-programs.mjs --q "tod=noon&intro=0" --secs 30 --set '{"timeSpeed":120}'`
    (before) → one program added mid-cycle: `char-fx < Scene [ShaderMaterial]` (42 → 43).
  - `tools/remote.sh node tools/demo-play.mjs --out shots/demo-lead/r6play` → 1 failure left (was 2): **time passes**
    (programs 43 throughout the 24 h, max frame 16.8 ms); the remaining one is the house-7 doors grid artefact (§8
    deploy). Before: `r6base` (2 failures). `07-in-house-8-night-bed.png`, `38-cam-vote.png`, `39-cam-overview.png`
    framed beside the panel.
  - `tools/remote.sh node tools/demo-lead.mjs shots/demo-lead/r6/boot-night.png --wait 3000 --q tod=night` → errors [],
    60 fps, 43 programs; `--q intro=1` → errors []; `--q "at=37.6,32.8" --keys KeyD:2500` → walked into house-7.
