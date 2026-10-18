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
| **ui** (game UI) | `src/demo/gameui.js`, `src/demo/actionbar.js`, `src/demo/notebook.js`, `src/demo/ui-assets.json`, `src/ui/runtime/layer.js` + `src/ui/runtime/book3d.js` (new, additive to the UI library) | the pixel3d UI library in the demo (§4.7): labels, talk + bubbles, emote pops, point / pie / pins, the pixel HUD (clock + phase chips, toolbar + the tip's lightbulb, toasts, prompts, the controls tip, social dock), the ACTION BAR (every key as a button), the events group (captions, night veil / dawn, vote clock, execution, ghost reveal, poof), off-screen arrows, the notebook + the reading book, the panel skin |
| **ui** (ambient) | `src/demo/ambient.js` | the ambient library (`src/ambient/**`, read only) in the demo (§4.8): pigeons, fireflies / moths / butterflies, the cauldron fire, props, reacting to the player |
| **deploy** | `src/demo/deploy.js`, `tools/demo-serve.mjs`, `tools/demo-check*.mjs` (+ `shots/demo-deploy/`) | `window.__demo` automation hooks, error overlay, perf watchdog, serving, the playtest automation |
| **player** (houses) | `src/demo/interior.js`, `src/demo/camera.js`, `src/demo/collision.js` | entering / leaving cottages (fade, room collision, the dollhouse camera), the texel-locked follow, collision + walk-through props |
| **intro** | `src/demo/loading.js`, `src/demo/loading.css`, `src/demo/intro.js`, the `#demo-loading` markup in demo.html | the loading screen (real progress), the opening cinematic |
| **roster** | `tools/demo-roster.sh` (run this) → `tools/demo-roster.mjs`, `src/demo/roster.js`, `src/demo/roster.json` (generated) | which characters are offered (shipped / WIP), portraits; the wrapper brings the host's roster.json back to the Mac (a sync would overwrite it otherwise) |
| interiors (town side) | `src/town/interiors/*` (read-only for the demo) | the 15 rooms (`buildInterior`, `aimLights`), docs/INTERIORS.md |
| **pass B** (voting circle + tower) | `src/demo/passb.js` (loader), `src/demo/votecam.js`, `src/demo/towertimer.js`, `src/demo/timer-ui.js`, `src/demo/seatcast.js`, `src/demo/tower-interior.js`, `tools/demo-play-passb.mjs`, `shots/demo-passB/` | the vote camera, the Storyteller's tower timer (dials, hour-board, HUD chip, ST control, panel section), the cast on the seats, the walkable tower interior (§4.9) |

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
   → `createAmbientLayer(demo)` (ambient.js, §4.8; `?ambient=0` off) → `createGameUI(demo)` (gameui.js, §4.7; `?gameui=0` off) → `mountUI(demo)` → `installDeploy(demo)` →
   `installViewInset(demo)` (main.js: wraps the rig's update, §5 "Framing beside the panel").
6. ONE per-frame updater, registered after every town piece's: `player → camera → intro → cut → time → ambient → gameui → ui → deploy`
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
| `character` | id string | `'frog'` (critic P1-2: all six game emotes; the Wanderer stays the fallback) | the player's character · ui, keys · **player** swaps (restores the old id on failure, source 'player') |
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
| `bookStyle` | `held` `big` | `held` | the reading notebook other players see (§4.7): `held` = the small book at the reader's hands, `big` = a REAL 3D book unfolding in front of the reader · ui (panel toggle "Notebook: held / big"), `?book=` · gameui (live, no reload) |
| `pointerScale` | `new` `v2` | `new` | the pointing finger: `new` = the library's finger, `v2` = the finger at the v2 size relative to the character (24 px frames) · ui (panel toggle "Pointer: new / v2 size"), `?pointer=` · gameui (live) |

Runtime-only data lives on the module objects, not in the store: `demo.player.position` (Vector3, logical ground point),
`demo.player.facing`, `demo.player.handle`, `demo.player.nearDoor`, `demo.player.location`, `demo.player.interior` (the room
record: id, name, camera, floor, spawn, exit, bed, visitPoint, lights, spots), `demo.player.transition`, `demo.time.hours`,
`demo.time.preset`, `demo.time.info.room` (`{id, lights, of}` while the pool is aimed at a room), `demo.cut.info`
(`{on, circle, house, boxes, inside}`), `demo.intro.phase` (`warm` `fly` `title` `done`), `demo.npcs.list`.

**The `demo` object** every factory receives: `{ engine, params (URLSearchParams), store, layout (src/town/layout.js),
town ({registry, tod, preset, root, lights, cutaway, quality} = buildTown's result), events, input, characters (the
listCharacters() array), player, camera, cut, time, ambient, gameui, ui, deploy, reload(patch) }`. Modules created later are filled in as
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
| `player:emote` | `{clip ('talk' … 'signature'), name (the spec clip) \| null, fallback?}` | player, when an emote plays (or the game UI's fallback: the point pop) |
| `ceremony` | `{start: true, t0}` | time, when the scripted voting ceremony starts (P) |
| `gameui:tip` | `{open, auto?, reason?}` / `{never, saved}` | gameui: the controls tip opened / dismissed (`close` `bulb` `esc` `timeout` `dismiss` `never`), "never show again" |

**Input** (`demo.input`, api.js `createInput`): `held(code)` / `any(...codes)` for continuous keys (movement),
`bind(code, fn, {desc, group, repeat})` → unbind for presses, `press(code)` runs every press binding of a code once (the
action bar's buttons: the same code path as the key), `has(code)`. `KeyboardEvent.code` names (`'KeyW'`, `'ArrowUp'`,
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
- **Carried lights (P1.3, the Storyteller's lantern):** a Character builds a PointLight for each `spec.lights` entry on
  its first update; one more light in the scene = every lit material recompiles (+23 programs, a ~200 ms frame on the
  swap: audit 2026-10-17). characters.js builds the Character (and the portrait exercise) from `lightless(spec)` (a
  shallow copy with `lights: []`); `handle.spec` stays the original and `handle.lights = [{L, node}]` carries each entry
  with an empty Object3D at its socket / bone (+ `at`). The time module lights it (§4.3).

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
- **Carried light (P1.3):** while the player's character carries a light (`handle.lights`, the Storyteller's lantern)
  the LAST light of the pool is pinned to its socket every frame (world position, the spec's colour / reach / decay;
  intensity `[day, dusk, night]` by the toon ramp's daylight level x the spec's stepped flicker on the character's own
  clock: the formula of `src/chars/character.js`); the town / room aim uses one slot less meanwhile and gets it back on
  the swap away. `demo.time.info.carried = {id, socket, intensity}`. Measured: swap to the Storyteller at 23:00, programs
  56 → 58 (its own materials; was 48 → 71), worst frame 17-54 ms (was 217 ms), no `char-light:*` PointLight in the scene.
- `demo.time.sweep` = the dais' vote sweep `{from, t0, per}` (the events' vote clock follows it, §4.7).
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

### 4.7 ui (game UI) — `createGameUI(demo) → gameui | null`, `src/demo/gameui.js` + `src/demo/notebook.js`
The pixel3d UI asset library (docs/UI.md, `src/ui/<group>/**`) in the demo, driven by the demo's REAL interactions (the
player, the NPCs, the store, the clock), not by the mock-HUD scripts (`scenes/ui-hud.js` shows the same groups with canned
moments; the demo never imports `scenes/`). `?gameui=0` turns it off (the A/B baseline; the panel then keeps its plain look).
- **Density D=2 (the user: "the icons are not clear in the pins", "most of the text … even notebook … basically all of the
  UI could benefit from higher quality"; docs/UI.md §2.10 / §2.10.1 / §2.10.3)**: the whole game UI draws at 2 UI px per
  scene texel, same on-screen size, still integer device scales. `createUILayers(engine, { density: 2 })` + `L.hd.useDepth()`;
  **`?uidensity=1` = the 1x UI of pass A (the A/B)**; `?uipolicy=round|floor|ceil|<n>` (default `round`: 1080p = HD px of
  2 device px, the HD art 4/3 of the 1x size). A pixelScale-1 window (a short landscape phone) gets `L.hd.d = 1` and the
  module runs its 1x path unchanged (`hdOn()`); the 390 x 844 portrait phone is pixelScale 2 = D=2.
  - ONE logical coordinate system for the screen tier (`SV()` = `L.hd.screenView`, logical px = HD px / d: 640 x 360 at
    720p, 480 x 270 at 1080p round): every hit rect `R.*`, `cover`, the pie, the popovers, `info()` (`unit` = CSS px per
    logical px, `unitDev`, `density`, `hd {d, scale, k, policy, stats}`), member / pin `screen` points (`atS`: HD screen px / d).
  - Screen pieces are drawn ONCE through a density view (`mkImg` = kit `hdPiece`: D=2 text + frames, HD sprites where they
    exist, 2x2 blocks elsewhere) and byte-blitted into `L.hd.screen` (`putS`); cache keys carry the density.
  - HD now: the clock chip (hud `drawClockChip` through the view = the wave-2 chip: HD dial, paused dashes, urgent glow),
    the phase chip (own wording, D=2 frame / LABEL face, HD icons), the toolbar (`toolButtonHD`, 16-px glyphs incl. the
    lightbulb), toasts (HD frame, rule and glyphs), the door prompt, the tip (+ its × and checkbox; its fly shrinks the HD
    plate and moves in HD px), the social dock (HD swatch pins with the clear centre dot, the HD pin glyph, glove and kbd
    caps), the dock button (HD ring + colour dot over your 48-px HD avatar in its gold frame), the armed pill, the pie
    (`drawPie` through the view = `drawPieHD`), the ACTION BAR + palette + tray (`AB.buttonInto` drawn into the view: the
    D=2 frame, the 30 glyphs redrawn on a 14x14 HD grid in `src/demo/actionbar-hd.js`, the key plates in tiny@2 with HD
    `[ ] \` =`, space bar and mouse), the tooltips, the caption ribbon + the vote clock (through `LS`, a layer whose
    `.screen` is the view), labels (`labelHD`, clamped top), person pins (`drawPersonPinsHD`: YOUR 24-px HD icon in the
    socket, the HD sparkle + remove badge), place pins (`drawPlacePinHD` on the HD depth tier; the 1x `pinPass` stays
    compiled but idle), the notebook page (`.ctn-pixelfont-hd`, lines = 20 HD px at `--hdpx`) and its own text (status,
    names, marks, notes, foot: `.dnb-hd`, the runtime `CT Pixel Body HD` face at 16 px), the DOM panel skin at D=2
    (`installPanelsHD` + `.ctp-hd` on `#demo-ui`; only at an exact density, `L.hd.k === 2`), the wave-1 art (UI.md §2.10.3:
    portraits loaded `{hd}` from the same module-relative base (`out/ui/portraits-hd.*`), the "you are here" ring
    (`putGroundHD`), the talk glyph, the chevron, speech bubbles (`bubbleHD`, tail-anchored), the point emote
    (`drawPointHD`: HD finger + bead trail + ping decal), the off-screen discs (`edgeDiscHD` / `edgeDiscPointerHD`)) and the
    wave-2 art (docs/UI-HD-WAVE2.md: `prepareWave2HD` at z −1; the emote pops (`popFrame(...).hd`), the execution bell /
    wisp / reveal (`drawExecutionFxHD`), your ghost reveal and the Storyteller poof (`worldLayerHD`)).
  - **Still 1x / blocks**: the bulb's glow halo (2x2 blocks), the ghost wisp beside a ghost LABEL (`IA.ghostWisp` x2), the
    execution tolls (1x ground) and, by design, the night veil / dawn wash / execution dim (they write `.data`), the
    talk outline pass and the held reading book (scene-side passes); the notebook rows' / panel tiles' avatars stay the
    24-px 1x portraits (their CSS boxes are 24 px at 720p: a 48-px image would be halved, not sharper); at 1080p 'round'
    the DOM keeps the 1x panel skin (the HD 9-slices are 4/3 of it there and the panel's buttons truncated).
  - Pass B's HUD pieces are HUD CLIENTS (`gameui.hudHost.add({draw(G), click(k)})`, timer-ui.js): the tower-timer chip
    (right of the chips; under them when the row is full) and the Storyteller's town clock (above the status line / the
    bar) draw on this tier in these coordinates, hit-tested by gameui (mouse + touch); `?gameui=0` = their DOM canvases.
    The tray's timer row and the "Walk in: The Clocktower" prompt are ordinary HUD pieces.
  - Evidence (render-host, looked at): `shots/demo-hd/` (`before/` = pass A, `after/` = D=2, `pairs/` = before over after,
    x3 zoom; `tools/demo-hd.mjs` + `tools/demo-hd.py`), perf in §10.
- **Critic pass-A fixes (playtest critic 18/24)**: P1-1 module-relative portraits URL + the bundle verify serves the
  published `v/<hash>/` layout and fails on any 404; P1-2 Space opens the emote palette (signature = 6 / the palette's
  star; player.js no longer binds Space), the default spawn character is the Frog (all six game emotes;
  `tools/demo-emotes.mjs` lists who has them); P2-3 tooltips name keys in words (`AB.keyWord`: "backtick key"); P2-4 the
  ceremony's night scrubs the clock to 21:30 under the veil (time.js, fenced); P2-5 the palette / tray / dock close each
  other, the dock and the armed pill stand above the bar when they would cover it; P2-6 a tapped palette / tray button
  shows its name 1.6 s (`info().tapTip`); P2-7 night fireflies = a 2x2 core + a 4x4 halo, moths keep a lit wing tip
  (`src/ambient/fireflies.js opts.night`, additive; `?ffboost=0`); P3-8 key actions, right-presses and pin drops close the
  popovers, a click on your own pin goes through; P3-9 a greyed emote's tooltip / toast says why ("<Name> has no <x>
  emote", "The Storyteller never becomes a ghost"); P3-10 the HD plates, the tip's × in cream with a 17 x 15 hit area;
  P3-11 the chips follow the hour in plain words (Morning / Midday / Afternoon / Evening / Night; "NIGHT 1" + the moon
  after 20:00; "EXECUTION" instead of "BEDTIME 1"; short words / a second row on a narrow screen); P3-12 a pin dropped
  behind a roof says so (toast) and shows a dotted x-ray outline (HD).
- **Layers**: ONE `src/ui/runtime/layer.js createUILayers` (the library's `src/ui/layer.js` contract and shaders, pass
  `ui-world` 300 + the screen overlay; new and additive: every layer write is tracked per band of 8 rows, so only what
  last frame drew is cleared and only the changed band runs are uploaded with one raw `texSubImage2D` each). Tokens follow
  the town preset (`tod` event: night / golden / noon sets). Hidden during the loading screen and the cinematic.
- **World tier (A / Ag)**: name labels for you (gold "You" chevron + the "you are here" ring) and the NPCs (indicators art,
  skipped when the character is above the view, clamped at the top edge); while a character plays `talk` / `whisper`:
  the 3-bar talk glyph + the talk outline pass (indicators `talkOutline.js`, `self` rose for you); NPCs also get a short
  speech bubble (fixed lines, deterministic per NPC slot); other NPC emotes pop an emote bubble (`!` / `?`, emotes art);
  the stack above a name is label < bubble < person pins < pop.
- **Point** (markers `drawPoint`): right-click (press + release within `RIGHT_HOLD_MS` 250 ms, < 6 px) on a townsperson =
  finger + marching trail at them + the ping at their feet; on the ground = a place point (ping + mark). The player turns
  to the target (`player.faceTo`) and plays its `point` clip when the character has one. 3.5 s (`EMOTE_POINT_MS`).
  `pointerScale` `v2` swaps the frame set (`markerFramesV2size`) live.
- **Pie** (emotes `drawPie`): right-hold (250 ms) or right-drag (> 6 px) opens it at the press point: Point, 8 pin
  colours, "Remove my pin" when pressed on your own pin; release on a wedge commits; release in the dead zone = sticky
  (8 s, click a wedge; Esc / click elsewhere cancels). Pin wedges grey out at the cap (6 pins per player).
- **Touch** (a coarse pointer, or `?touch=1`; `?touch=0` forces the mouse wording): a finger held still on the town for
  `LONG_PRESS_MS` (450 ms, emotes art TIMING) opens the TOUCH pie (bigger wedges, `PIE.touch`) under it; slide to a
  wedge and lift = commit, lift in the dead zone = sticky (tap a wedge). A finger that moves > 10 px first is a pan, a
  quick tap still walks there (player.js); the lift that ends a long press is eaten (no tap-to-walk). The canvas sets
  `touch-action: none`. The dock, the armed pill and the first-run tip use touch wording ("Hold the town, slide to
  choose"; "Tip: tap to walk · hold a finger on the town to point or pin"), the panel note too.
- **Pins** (markers): place pins on the ground through the depth-tested pass (`pinPass.js`, order 301: whoever stands in
  front hides them), person pins over a name; the drop animation (fall, dig-in, sparkle at 15 fps), your icon in the
  socket (portraits atlas `icon_<id>`; for the shipped four, which have none, the roster thumb (the dock button's portrait)
  fitted into 12 px: the figure's bounding square box-filtered, alpha cut at 40 %; the initial only before the thumb loads), a pin pop over you in the pin's colour. F = a pin of the current
  colour at the cursor; left-click your own pin = remove (remove badge + tooltip on hover); the dock's Clear my pins.
  **Person pins (pass A, the user's bug: five of their pins stacked in a fan over the Hound, no way to remove them):**
  ONE pin of yours per townsperson: F / the Pin button / a pie swatch on someone who already carries your pin REPLACES
  it (the same colour removes it: a toggle; another colour recolours it, dropped again). A click / tap on your person pin
  removes it (its drawn body + 3 px all round as the hit area, last frame's rects: `info().personPins`), hovering it
  shows the hand cursor, the remove badge and "Your pin on <name> · click to remove"; a press on a townsperson who
  carries your pin (or on the pin) offers the pie's "Remove my pin"; Clear my pins clears person pins too. The tip and
  the Pin button's tooltip say so ("click a pin to remove it", "their pin again: remove").
- **Social dock** (emotes `drawDock`, bottom right of the view; G or a click on your portrait in the gold ring = the dock
  button): Point / Pin (arm, then click the town; the armed pill has Cancel), the 8 swatches (current colour), Clear my
  pins, the key hints.
- **HUD (S)** (hud art): the town clock chip (stage of the day / the ceremony, the time, the dial = what is left of the
  day or night period; paused / clock stands = the paused dial) + the phase chip (day ☼, nomination / vote ◯, execution
  bell, night ☾) top left; the toolbar top right (notebook, ⚙ = the control panel, ? = the keys overlay); the toast column
  under it (`events 'toast'` and `ui.toast()` land here; the DOM toast stack stays empty); the door prompt ("Walk in:
  <house>", "The clock tower is locked", inside: "<room> · walk out the door to leave") and the first-run key tip (9 s)
  bottom centre (kept above the dock button row). Everything avoids the control panel / the notebook (the visible area
  is measured every 0.25 s: `cover` = {left, right, top}): the panel on the canvas' right half is a right band; a panel
  spanning the left half too but shorter than 40 % of the height (the auto-folded panel header on a phone) is a TOP band:
  the chips, the toolbar and the toasts drop below it, so they stay visible and a tap on them reaches the canvas.
- **Notebook** (J, the toolbar's book, the panel's "notebook" button): a DOM panel top left in the library's skin
  (`out/ui/panels.css` ctp-panel + `out/ui/notebook.css`), tabs Seats / Notes (`role="tablist"`, `.ctn-tab-*`). Seats = the
  townsfolk in sight (you + the NPCs) with their 24 px portrait (portraits atlas `avatar_<id>`, else the roster thumb),
  marks ★ / ? / ✗ and a one-line note; Notes = a native `<textarea class="ctn-text">` (the lined page, height snapped to
  whole rule rows, the pixel body face `.ctn-pixelfont`). Saved per page in `localStorage` (`hollowmere-notebook:notes`,
  `hollowmere-notebook:seats`, `:page`), debounced 900 ms ("Saving…" → "✓ Saved"), every access in try/catch (no storage
  = "not saved (storage off)", the panel still works). Esc closes. Keys typed into it never reach the game. No open / close
  toasts (the panel is the feedback; the toasts covered name labels). On a phone (`innerWidth < 700`) it spans the top,
  at most 40 % of the height (the Notes page sized to it), so the reader and the book in their hands stay in view below;
  opening it folds the unfolded control panel away (unsaved; ui.js).
  The page skin is pinned as inline style read from a hidden twin: panels.css's generic `textarea:hover / :focus-visible`
  field skin out-ranks notebook.css's `.ctn-text` page otherwise (the page turned into an ink input while focused).
- **The reading book** (notebook `notebookContext` / `book3d.js`): while the notebook is open the player's character shows
  the book to the town (open → hold with page turns → close, the quill while typing in the last 1.5 s); `bookStyle` `held`
  = the small book at the hands (depth-tested pass 302), `big` = the 3D book in front of the reader (scene meshes, lit,
  outlined, never hidden by its reader; the "you are here" ring is hidden meanwhile) at 1.3x the library's model scale
  (`BIG_SCALE`: about the reader's width). The 3D books come from `src/ui/runtime/book3d.js installMergedBooks` (put on
  `hud._book3d` before `notebookContext`): the same model, poses, placement and bias as `book3d.js`, but each drawing is
  merged once (in the warm-up) into ONE mesh per material (<= 8 instead of ~25 meshes x color + normal + shadow passes):
  measured on render-host, 1 open book 278 -> 236 calls, 2 books 409 -> 323; pixel-identical at night, same book at noon
  (`?bookmerge=0` = the library's per-part books, the A/B). NPC slot k reads for 7 s every 31 s
  from 6 + 11 k s (demo time), so visitors see others reading from outside. The 3D books are built and their program
  compiled in the boot warm-up frames.
- **Panel skin**: the control panel and the keys overlay wear the library skin (`ctp-panel ctp-skin`: 9-slice frame,
  buttons, selects, sliders, kbd, cursors) at `--px` = the render's pixel scale; seat cells and roster tiles keep a compact
  look (ui.css "the pixel3d UI library skin"); the character switcher shows the portraits-atlas avatars.
- **Toggles** (panel section "Game UI", URL `?book=` `?pointer=`, store keys §3): "Notebook: held / big" and "Pointer: new /
  v2 size", live, no reload; a quality reload keeps them (`stateToParams` writes `book` / `pointer`).
- **Perf**: the pin / book / talk passes run only while they have something to draw (all on in the warm-up frames, so
  their programs compile behind the loading screen); HUD pieces, labels, toasts and the dock are drawn once per state and
  copied with a byte blit. Programs 43 → 48 at boot, constant afterwards.
- **Action bar** (the user's request: "a clickable-UI way to do emote / notebook, not just pressing the letter";
  `src/demo/actionbar.js` art + tables, gameui.js layout / hit tests): EVERY key action of the demo is a pixel button in
  the library's look (kit `drawBox` frames raised / hover / pressed / disabled, hud / emotes / indicators glyphs + a few
  7x7 glyphs of its own), its key as a small hint plate in the corner (the tiny face; `[` `]` `` ` `` `=` drawn there,
  Space as a 5 px space-bar sign and the right button as a 4 px mouse with its right half lit: the 'SPC' / 'RMB' words
  covered half the glyphs; no hints on a touch screen). The bar (6 x 18 px buttons): **emotes** (Space: opens the emote palette: talk 1, vote 2,
  point 3, die 4, ghost 5, signature 6; greyed, with the reason in its tooltip / a toast, when your character has no such clip, except point: the P2.8 pop),
  **point** (right-click: arms a point, then click), **pin** (F: arms a pin of the current colour, then click),
  **palette** (G: the social dock), **notebook** (J), **more** (the tray, two rows: camera Q E − = C, clock T , . N, town
  B V P L, characters [ ], panel `, keys H, Esc). A button runs `demo.input.press(code)` (the key's own code path) or the
  dock's arm. Placement: the bottom row between the status line (bottom left, DOM: measured into `cover.status`) and the
  dock button, centred on the visible area; on a narrow screen (a phone: the status line spans the bottom) it stands on
  top of the status line. It respects the panel's right band and the folded panel's top band (`cover`), and does NOT
  move for the open notebook (a left band only down to its own bottom: `cover.leftBottom`). The popovers open above the
  bar (over the tip / prompt); a click / tap elsewhere or Esc closes them; a mouse hover shows a tooltip ("Notebook
  (J)"). The door prompt and the tip stay above the bar. Covered by the playtest: every `input.bindings()` code is
  reachable from a button (29 bindings, 0 missing).
- **The controls tip + the lightbulb** (the user's request): the tip (hud `drawKeyHint` plate + a "Never show again"
  row, mouse or touch wording, naming the buttons) shows ONCE per visit (ui.js: 1.2 s after the player gets control, 9 s
  of rendered time), then stays hidden. The toolbar's first button is an always-there LIGHTBULB: a click / tap reopens
  the tip (until closed). Dismissing it (its ×, the bulb, Esc, the 9 s, "never show again") plays the tip SHRINKING and
  FLYING into the bulb (8 drawings at 15 fps, eased, the last two dissolving), then the bulb glows 1.8 s (gold frame
  and lit glass with rays throughout, a 2-ring halo pulsing on 2 drawings of 3) so players learn where it went (`rm=1`: no fly,
  the glow only). "Never show again" is saved in localStorage `hollowmere-tip:never` (every access in try / catch; no
  storage = this visit only) and stops the automatic tip on later visits (`ui.emoteTip.skipped = 'never'`); the bulb
  stays.
- **Events** (the events group, `src/ui/events/draw.js`; adapter `evHud`: `cast` / `bySeat` from the dais seats and
  `store.seats`, `place`, `terrain`): a caption ribbon under the chips on every phase change (nominations; "Seat N is
  nominated. Raise a hand to vote." → "Seat N is on the block (n votes)." / "Not enough votes."; "The bell tolls for Seat
  N."; "Night falls. You are alone in your home…"; "Dawn breaks over Hollowmere."; ui.js's "Phase: x" toast is off with
  the game UI); the toasts drop below a showing caption. The NIGHT VEIL when the phase turns to night or the running
  clock crosses 20:00, DAWN on night → day or 06:00 (natural crossings only: a running clock ≤ 120 game min / s, no
  jumps, ≤ 1 per 20 s); the VOTE clock + tally (HUD, left under the chips) in the vote phase, its hand in step with the
  dais' brass hand (`time.sweep`: each voter's 1.2 s slot mapped onto the dais' reach times); the EXECUTION on the
  nominee's seat (dim, tolls, bell, wisp, reveal); your GHOST reveal (wisp + burst) on the ghost emote and the ghost
  label variant while a character plays `ghost`; the Storyteller POOF when you swap to / from the Storyteller. The veil /
  dawn / dim write the layer bytes directly, so the layer is marked dirty (else stale bands stayed on screen).
- **Off-screen arrows (P2.7)**: your point target, the townsfolk you pinned and your place pins outside the visible area
  (the canvas minus `cover`, below the chips, above the bottom row) get an indicators edge disc (`edgeDisc` +
  `edgeDiscPointer`: the person's portrait, or your pin / the glove in it) on that area's edge, its tail pointing the way
  (≤ 6).
- **The ghost STATE (pass A, the user's bug: "after ghost-emoting, walking turns me back")**: in Clocktower a ghost is
  a dead player who keeps walking, so the ghost emote (5, the palette's ghost button) is a TOGGLE (player.js
  `setGhost(on)`, `player.ghost`, `player.ghostLevel` = the rig's displayed level): on = the character's idle loop is its
  `ghost` clip and `ch.ghost = 1` (the character library's walking-ghost override, `src/chars/character.js
  _ghostLevel`), so walking, standing and the other emotes (talk / point / vote / signature play, then the ghost loop
  comes back) all stay ghost-shaded; 5 again = `ch.ghost = null` + the normal idle. The ghost reveal (wisp + burst)
  plays when you BECOME a ghost; your label is the ghost variant for the whole state (walking too); the bar's emote
  button and the palette's ghost button are lit (gold) while you are a ghost. The Storyteller never ghosts (the button
  is greyed: no ghost clip; 5 = a toast). A character swap / teleport KEEPS the state when the new character has a
  ghost clip and CLEARS it (with a toast) when it has none. Only specs with `spec.ghost` (the wave-3 shared ghost:
  clarabelle, cilantro, mincut, opal, preservation, progress, requin, ...) stay ghost-shaded while walking; the older
  baked-ghost clips (owl, fox, frog, toad, crow, polly) have no `spec.ghost`, so their walk looks alive (the ghost loop
  comes back when they stop): a character-session item (§8).
- **Point fallback (P2.8)**: a character without a `point` clip (the shipped four) shows the emotes group's point pop
  over its head (right-click point, the bar, the 3 key: `gameui.emoteFallback`, no "has no 'point' emote" toast).
- **Labels (P3.9)**: a name label the DOM covers (the panel's band, the folded panel's top band, the open notebook) or
  under the HUD's top row (the chips, the toolbar) is not drawn, nor its stack.
- **The held book's quill** (`src/ui/notebook/art.js bookMats` `w`, a small art fix): the feather was the page's own
  cream with the page's line, so on the open spread it read as a crack / a torn V at 1x; now a cool white goose feather
  (the ghost ramp) with a violet-ink line.
- **Automation**: `demo.gameui.info()` → {members (+ talking, bubble, screen px, shown, ghostLabel), hover, bar, palette, tray,
  tipState {shown, auto, rect (+ close / never), flying, glowing, never, neverSaved, shownCount, dismissed}, events
  {captions, caption, veil, dawn, vote, exec, ghost, poof, counts}, offscreen, point, pie, pins, pops, dock (+ hit
  rects), toolbar, toasts, tip, notebook, readers, books3d, mergedBooks, youIcon (atlas | thumb | initial), options,
  cover {left, right, top}, touch, pressing (touch | right | null), pie.input}; `doPoint / dropPin / removePin / clearPins /
  targetAt / openPieAt` (the same code paths as the pointer / keys). Events: `gameui:point`, `gameui:pie`, `gameui:pin`,
  `gameui:unpin`, `gameui:click`, `notebook` `{open, page}`. Player additions: `player.pickAt(x, y)`, `player.faceTo(x, z)`;
  NPCs: `demo.npcs.members` (the live records).
- **Assets**: the baked files the demo fetches (`out/ui/portraits.*`, `out/ui/cast-portraits.*`, `out/ui/panels.css`,
  `out/ui/notebook.css`) are listed in `src/demo/ui-assets.json`; the bundle ships exactly those (§6 Publish).

### 4.8 ui (ambient) — `createAmbientLayer(demo) → layer | null`, `src/demo/ambient.js`
The ambient library (docs/AMBIENT.md, `src/ambient/**`, read only: no library change) wired to the demo's REAL actors:
`createAmbient(engine, {autoUpdate: false, ticker: {mode: 'live', window: 5}, tod})`, every frame
`amb.actors.set('you', pos, velocity)` (+ the NPCs, standing) and `amb.update(t, dt)` (after time); `setTimeOfDay` on
`tod`; hidden + not updated while `store.life` is off or inside a cottage. Nothing the town's own life piece draws is
doubled:
- **birds**: 7 pigeons on the west cobble lane south of the square (17, 30.5) + 5 sparrows on the south dirt road
  (28.5, 35), only on paved tiles; they alert and SCATTER when you walk at them, resettle when you leave (day only). No
  crows (`crowsDay / crowsDusk / groundCrows 0`): life owns the crows.
- **fireflies**: night fireflies over the greens life used for its own (5 swarms), moths at the street lamps + stall
  lanterns, butterflies + bees on the system's own blooms in 3 garden corners by day; homes only on grass tiles. Life's
  own (non-reactive) moths + fireflies are switched off at the build with life's documented switch: main.js adds
  `lifeOff=bugs` to the town params while the layer is on (ONE set of bugs, the reactive one).
- **fire**: the fire under house-1's cauldron (a torch-sized flame: the campfire drawing covered the pot), sprites only:
  `fixtures: false`, `lights: []`. The dais braziers are the dais piece's own flames: not doubled.
- **props**: a hanging shop sign by the red stall (12.1, 15.9), wind chimes by the boathouse bench (10.9, 23.9), a
  scarecrow in the pumpkin patch (34.8, 23.1): things the town does not have; `lights: []`. (Walk-through: not in the
  collision.)
- **Budget** (measured, render-host, 1280 x 720): declared 15 calls (birds 3, fireflies 2, fire 2, props 8); the props'
  emissive GLOW batch only draws lamp flames and the demo's props have no lamp, so ambient.js hides it (one call less,
  no light inside). Measured on the bundle, `ambient=1` vs `ambient=0` (which keeps life's own bugs) at the same views
  (`tools/demo-perf.mjs --page dist/v3-art-demo/index.html`, pass A): spawn noon 278 → 298, the west green at night
  (9.5, 18.5) 374 → 390, the pigeons' lane at noon 338 → 355, i.e. **+15 to +20 calls** depending on the view (the
  birds / props / fixtures meshes cast shadows and are outlined: 3 passes each); 0 lights; +8 programs, all compiled
  behind the loading screen (the warm-up frames show the night and the day drawings), none in play (pigeons scatter,
  props react, night fireflies, the day cycle: the playtest's programs stay 56 → 56); CPU 0.14-0.4 ms per frame for the
  set (`info().updateMs`). Over the ~14 target by a few calls in busy views: dropping a prop (3 calls with its shadow
  and outline) or the birds' shadows would buy it back (not done: the gap list (P2.5) asks for both).
- `demo.ambient.info()` → {on, tod, systems, calls, lights, over, updateMs, actors, per (each system's stats: flees,
  ff, moth, bfly ...)}; `?ambient=0` off (A/B; life keeps its own bugs).

### 4.9 pass B — the voting circle + the clock tower (`src/demo/passb.js` → `createPassB(demo)`)
Loaded by main.js after the view inset and BEFORE the shader warm-up (one `load` + one `step('passB')` line, fenced
`// (B)`), so the vote camera wraps the rig's final update and every program the pass adds compiles behind the loading
screen. `demo.passB = { votecam, timer, seats, interior, ui, update, info() }`; each part can be switched off with
`?passB.<part>=0` (`?passB=0` = none: the A/B baseline), a failing part is reported in `__demo.errors` and skipped.
- **The vote camera** (`votecam.js installVoteCam`; the user: "focus on the players + the clock, as closely cropped as
  possible"). The frame is COMPUTED, not a preset: every seat with its occupant (feet .. a raised hand: the seated cast's
  own heights) + the tower dial facing the camera, projected into the snap space, fitted to the VISIBLE area (the
  panel's right band left out) with the HUD's corners as keep-out boxes (chips + vote clock top left, toolbar top right,
  the timer chip in the top row, the action bar bottom centre, the dock button bottom right), the smallest viewHeight wins
  (a placement search slides the content inside the slack). Pitch stays 30 deg (every preset's), yaw is a 45 deg stop:
  the tower stands 11 m NORTH of the ring, so at yaw 0 the dial sits ~10 m above the ring on screen (content 13.7 x
  15.3 m: viewHeight 15.9); at yaw +-45 the tower stands beside the ring (16.0 x 13.7 m: viewHeight 14.3, the default
  pick: a later candidate wins when > 4 % tighter); +-90 would be tighter still (21 x 9 m: ~12) but the side dial is half
  hidden behind the roofs east / west of the tower (the cut-away keeps the ring clear, not the dial), so it is only
  reachable with Q / E in the vote mode (every 45 deg stop gets its own tight frame) or `?voteYaw=`. Measured (1280 x
  720 / 1920 x 1080, a 1.3 m figure on its stone, screen px): old preset 42.7 / 64 px with the dial cut by the top edge
  -> **56.8 / 85.2 px** (panel hidden, yaw 45, vh 14.27), **54 / 81 px** (panel open, vh 15.0); all 15 seats + the dial
  inside the visible area and clear of the HUD (`votecam.check().inFrame`). Transitions in / out of the vote mode (and a
  reframe: panel opened / folded, resize, Q / E) step through 4 fully snapped key poses in 0.75 s (target, viewHeight and
  yaw eased together on the inOutSine spacing, a pure function of engine.time: the PixelCamera's stop-motion turn rule
  applied to the whole pose). The ceremony (P) switches follow -> vote itself; the vote camera returns to follow 3 s
  after the night it reached. `votecam.info` / `check()`: yaw, viewHeight, target, fit, cover, candidates, px, inFrame.
- **The Storyteller's timer** (`towertimer.js createTowerTimer`): idle | set | running | paused | done, a pure function of
  engine.time (`remaining = rem0 - (t - t0)`; the zero is detected at its exact crossing time). Minutes 1..30, stages
  discussion / nominations / bedtime (the v2 clock's gold / red / blue; idle follows the game phase). Keys **K** start /
  pause, **Y** reset, **U / I** -/+ 1 minute (also a third row of the action bar's tray, added at runtime from
  timer-ui.js); `?timer=<s>&timerRun=1&timerStage=`. Events `timer` {action, state}. While not idle the tower's own
  hands are hidden (`api.hands`, the town hook) and ALL FOUR dials show the countdown the v2 way (library
  `src/ui/hud/tower.js`, the HUD chip's mini dial): a stage-coloured enamel wedge = the time left, clockwise from XII,
  one iron hand at its end sweeping back to XII, pause bars when paused; at zero the dials + the board flash (4 Hz,
  6 s) and the bell strikes 3 times (`time.ringBell`: the belfry bell swings; there is no audio path in the demo). Kit
  glass (wedge: lit by day, glowing at night like the dial) + kit solid: no new program; rebuilt when the rim moves 2 deg.
- **The hour-board** (the in-universe readout): a split-flap board hung from the base cornice over the great door
  (2.3 m, dark timber, brass frame, a pointed crest, iron hooks): four dark enamel cards with LIT cream numerals (3 x 5
  cells, 0.39 x 0.45 m: ~10 px tall at the vote camera, glowing lamp-warm at night), brass colon studs blinking while it
  runs, a 2-drawing flip on each changing digit, dim unlit numerals (the armed length) while idle. (Dark numerals on
  cream cards were mush at the 45 deg vote camera: shots/demo-passB/r4/zoom-board.png.)
- **The HUD chip + the ST control** (`timer-ui.js createTimerUI`, the library's `hud/art.js` drawClockChip / drawStClock
  in DOM canvases at the pixel scale): the chip (mini dial, "NOMINATIONS CLOSE IN 2:51", urgent pulse in the last 30 s,
  PAUSED, due) in the top row right of the game UI's clock / phase chips (x 156 texels; centred on a phone) while the timer is not idle; the Storyteller's control ("Town clock:" x /
  +1m / Pause-Resume, Set [-] N min [+] for, the stage buttons = start that stage) bottom left above the status line,
  shown while the player IS the Storyteller character (`storyteller`, ?wip=1) or with `?stControls=1` / the panel's
  "ST controls on screen"; real pointer events with hover. The panel section "Tower timer" (injected after "Time"):
  readout, -1m / minutes / +1m, start-pause / reset, the stage segment. Key presses make no toasts (the toast column
  covered the dial in the vote frame); zero toasts "The tower strikes: time is up".
- **The cast on the seats** (`seatcast.js createSeatCast`): 15 CAST characters (the offered roster ids with talk + vote
  clips: never the skipped one, the player's own, an idle NPC's or the Storyteller) stand on the seat stones (feet at
  0.235 m, facing the dais) instead of time.js's townsfolk mannequins (`demo-time-folk`: hidden). Built at boot (all
  visible in the warm-up frames: +12 programs, all compiled behind the loading screen; ready +0.6 s), then only occupied
  seats show; hidden ones are not updated. Clips follow the store + the time module: idle; dead = `ghost` / `ghost-spent`
  (`die` first when the seat dies in view); the vote = `vote` (held) when the dais' brass hand reaches a voter
  (`time.sweep` / `time.votes`: the folk's timing); nomination: the nominator (the nearest living seat before the
  nominee) turns to the nominee and plays `point`; day / nomination chatter: one seat `talk`s every 2.7 s, a signature
  emote every 9.5 s (deterministic per time slot). A held clip (vote / die) is released with `play('idle')` before the
  next (Character clip.hold). Picking a seated character as yours puts your previous one on that seat. The game UI sees
  them as townsfolk (`demo.npcs.members` extended, slot 1000 + seat: name labels, talk bubbles, point / pin targets, the
  notebook's Seats; `?seatLabels=0` keeps them out). `?seatCast=0` = the old mannequins.
- **The tower interior** (`tower-interior.js`; interior.js `register` + player.js `enterable` hooks, store location
  `'clocktower'`): walk into the great door like a cottage ("Walk in: The Clocktower", the fade, the dollhouse camera,
  the room's own collision, walk out on the exit spot back onto the doorstep); `?in=clocktower` starts inside. An 8 x
  5.5 m stone room at x 650 (past the cottages' rooms) with a cut-away front: a raised CLOCK LANDING (1.1 m, plank deck,
  iron rail) reached by a timber stair up the east wall (walkable: `raw.heightAt` + a dynamic `room.floorY` so the feet,
  the ring and the label stand on the steps), the BACK OF THE NORTH DIAL in the back wall (lit glass, reversed marks,
  glazing bars, the hands seen from behind = mirrored: the countdown while the timer runs, the time of day otherwise),
  the MOVEMENT (an iron cage: the great wheel one turn per game hour, the second wheel, the brass escape wheel ticking
  once a second with its anchor rocking on the pendulum's beat, the TIMER TRAIN = a brass drum wheel with a crimson boss
  making one turn per countdown + its pinion: they stop when paused, rewind on reset; the FLY spinning while the bell
  strikes), a 2.75 m seconds PENDULUM (period 2 s, 12 fps poses) from an iron gallows, the bell rope (jerks with every
  bell), three lanterns + the dial as a 'window' (the time module's constant pool aimed at them; `nightAmbient` warm
  brass), a workbench with a spare wheel, the ladder to the belfry hatch. Walls facing the camera hide on Q / E. Kit
  geometry only: **entering compiles no program** (measured 68 -> 68; a first visit of ANY interior used to link a
  second `char-depth-snap` shadow variant: the room module renders one bare colour pass at boot so it is built behind the
  loading screen, which removes it for the cottages too: house-8's first visit 3 -> 2 programs, its own two).
- **Perf** (render-host, 1280 x 720, `tools/demo-perf.mjs --secs 5-6`, noisy run to run): spawn noon 296 -> 297 calls,
  programs 56 -> 68 (the seat cast, at boot), CPU/frame ~3.0 both; the vote scene with 15 seats: calls 566-572 -> 513-516,
  tris 1.45M -> 1.96M (15 cast characters vs instanced mannequins), CPU 6.85 -> 7.05-7.9 ms (passB.update 0.5 ms: the 15
  Characters; the camera's texel snap of 15 roots +0.15 ms), GPU-synced 4.1 -> 7.1-7.3 ms, 60 fps; inside the tower 134
  calls. No program is compiled after the boot by anything in the pass (playtest step 8).
- **Known issues / open**: (1) yaw +-90 would give ~+20 % more figure size but its side dial is half hidden by the
  cottage roofs beside the tower (a cut box on the dial's line of sight in the lead's cut controller would open it);
  (2) the idle NPCs (keeper / hound / duelist, r 7.6 on the square's south arc) stand just outside the ring and read as
  part of it in the vote frame; (3) the seated cast STANDS on the stones (no cast spec has a sit clip); (4) the cost of 15
  real Characters (tris +0.5M, GPU-synced +3 ms on the 4090, ready +0.6 s, +12 programs at boot); a swap that takes a
  seated character rebuilds that seat (a 50-140 ms frame); (5) the timer is not in the store / URL: a quality reload
  resets it; (6) inside, the gold 'discussion' wedge on the glowing dial back is low-contrast at night; (7) with
  `?passB=0` the rig's old preset (town/api.js CAMERAS.vote) comes back.

## 5. URL parameters (`demo.html?...`)

State: `char=<id>` `tod=<hours>|night|morning|noon|afternoon|golden` `speed=<min/s>` `paused=1` `phase=<phase>`
`seats=<n occupied>` `quality=high|low` `life=0` `cut=auto|on|off|0|1` `cam=<mode>` `zoom=<vh>` `yaw=<deg>` `ui=0`;
`at=<x>,<z>` player start; `in=house-N` start inside a cottage (state.location; written by `demo.reload` instead of
`at` while inside); `intro=0|1` the cinematic (default on in a browser, off under automation / capture); `npcs=<n>` idle
townsfolk characters (0 = off); `roster=shipped|all|a,b`, `thumbs=0`, `exercise=0` (characters.js);
`interiorKit=stub`; `demoGrass=wide4` (review: the old grass area); pass B (§4.9): `passB=0`, `passB.<votecam|timer|seats|interior|ui>=0`, `voteYaw=<deg>`, `timer=<s>`, `timerRun=1`, `timerStage=<discussion|nominations|bedtime>`, `stControls=1`, `seatCast=0`, `seatLabels=0`, `in=clocktower`; game UI (§4.7): `book=held|big` (state.bookStyle),
`pointer=new|v2` (state.pointerScale), `gameui=0` (no game UI: the A/B baseline), `ambient=0` (no ambient layer, §4.8), `touch=1|0` (force the touch /
  mouse wording; default: the coarse-pointer media query), `bookmerge=0` (the library's per-part 3D books, A/B), `rm=1` (reduced motion: no pops / bobs /
marching / page turns). Engine: `scale=<n>|fit`, `capture=1` (headless: renders t = 0 only, no loop). Town params pass
through to buildTown (`lights=`, `vignette=`, `contact=0`, `shadowCull=0`, `relAz=`/`elev=` ...), except
`cut cam yaw focus pieces pan book pointer gameui` (the demo owns those). `demo.reload(patch)` writes the whole state back into the URL.
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
ends. A click overrides the automatic fold until the condition changes. On a phone the notebook folds the panel when it opens
(an unfolded panel + the notebook filled the screen). Checked by `shots/lead-fix7/check.js`.

## 6. Controls and how to run

| key | action | owner |
|---|---|---|
| W A S D / arrows | walk (relative to the camera) | player |
| Q / E | rotate the camera 45° | lead |
| wheel, − / = | zoom (ladder stops) | lead |
| C | cycle camera mode (follow → vote → overview → iso → free; free: drag with the LEFT button to pan, the right button is the game UI's) | lead |
| T | pause / run the clock | time |
| , / . | clock slower / faster (×½ / ×2) | time |
| B | ring the bell | time |
| V | next phase | time |
| L | life on / off | time |
| H | the keys overlay (Esc closes) | ui |
| ` (backquote) | show / hide the panel | ui |
| [ / ], 1-6, Space | previous / next character; emotes 1-6 (talk, vote, point, die, ghost, signature); Space opens / closes the emote palette (game UI); 5 = the GHOST toggle (on: you stay a ghost, walking too; 5 again: alive) | player |
| N | jump to the next time of day | time |
| right-click | point at a townsperson (finger + trail + ping) or a spot; the character turns and plays `point` | ui (game UI) |
| right-drag / right-hold | the pie: Point, 8 pin colours, Remove my pin; release on a wedge (dead zone = sticky, click a wedge) | ui (game UI) |
| F | drop a pin of the current colour at the cursor (a townsperson: on their name; one pin of yours per townsperson: F on them again = the same colour removes it, another colour recolours it) | ui (game UI) |
| click / tap your own pin | remove it (a place pin, or your pin over a townsperson's name; hand cursor + remove badge + tooltip on hover) | ui (game UI) |
| G / click your portrait (bottom right) | the social dock: Point / Pin (arm, then click), colours, Clear my pins | ui (game UI) |
| J / the toolbar's book | the notebook (Seats / Notes); Esc closes it (and the pie / an armed dock) | ui (game UI) |
| P | play / stop the voting ceremony | time |
| K / Y / U / I | (B) the tower timer: start / pause, reset, one minute less / more (also the tray's third row, the ST control, the panel's "Tower timer") | pass B |
| Q / E in the vote camera | (B) step the vote camera to the next 45 deg stop (each with its own tight frame) | pass B |
| walk into the tower door | (B) the clockwork interior; the exit spot leads back out | pass B |
| the action bar (bottom) | emotes palette (Space / 1-6), point, pin (F), pin palette (G), notebook (J), more = the tray with every other key (Q E − = C T , . N B V P L [ ] ` H Esc): click / tap; the key in each button's corner | ui (game UI) |
| the lightbulb (toolbar, top right) | reopen the controls tip; × / Esc / the bulb close it (it flies into the bulb); "Never show again" | ui (game UI) |
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
`index.html` (= demo.html **without the import map**), the runtime `src/**` (.js/.css/.json; not `src/main.js`; of the UI
library `src/ui/**` only the modules the demo's import graph reaches: 19 on 2026-10-17, listed by the build), exactly the
baked UI files in `src/demo/ui-assets.json` (`out/ui/portraits.{json,png}`, `out/ui/cast-portraits.{json,png}`,
`out/ui/panels.css`, `out/ui/notebook.css`: the only .png in the bundle and the only files under `out/`),
`characters/<id>.js` for EVERY id in `src/demo/roster.json` (shipped + WIP, so `?wip=1` works; the public page offers the
finished ones only) plus character modules other shipped code imports (life's `mannequin.js`), and only the three r170
files actually reached (three.module.js, BufferGeometryUtils, ConvexGeometry, ConvexHull) + three's LICENSE. Never
shipped: tools/ shots/ docs/ research/ **refs/** (private third-party images) out/ (except the ui-assets.json list)
scenes/ node_modules/; the build also refuses any .png (except that list) /.jpg/.md/.py/.sh, any other file under out/,
and any bundled module that imports scenes/. It fails on any relative import that is not in the bundle, a bare import
the map does not cover, or an absolute URL. All URLs are relative, so copy the folder under any sub-path of another site
(`https://host/v3-art-demo/` — the trailing slash matters; static hosts redirect to it). No server-side code, no build
step; any static file host with `text/javascript` for .js works.

**CSP.** The live host (https://<public-host>/v3-art-demo/) sends, on every demo response:
`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'`.
`script-src 'self'` blocks the inline import map, so the build's LAST step is `tools/demo-bundle-csp.py`: every bare
`three` / `three/addons/...` import in the bundle's .js (src, characters, the vendored addons) becomes a relative path into
`./vendor/three/` and the map is removed (it exits 1 if an inline `<script>` or a bare three import is left). Then the
build greps the bundle for anything else that would need `'unsafe-eval'` / inline script (eval, `new Function`, string
timers, `javascript:` URLs, data: workers, inline `on*=` handlers): none. The inline `<style>` and the data: portraits are
allowed (`style-src 'unsafe-inline'`, `img-src data:`), and so are the game UI's skins: `out/ui/panels.css` /
`notebook.css` are `<link>`ed from 'self' and carry their frames as data: PNGs and the pixel face as a data: TTF
(`font-src data:`); the portrait avatars become data: URLs (`toDataURL`). So the dev tree keeps its import map; only the
bundle is rewritten.

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
- **characters (pass A, the ghost state)**: the walking ghost needs `spec.ghost` (the wave-3 shared ghost: `ch.ghost = 1`
  shades the walk). owl, fox, frog, toad, crow and polly carry the older baked ghost clip only, so as a ghost they walk
  "alive" (the ghost loop returns when they stop). Port them to `spec.ghost` (CHARACTER_PLAYBOOK wave-3 banner).
- **ui (pass A, person pins)**: `markers/draw.js drawPersonPins` could return each pin's drawn rect (the demo
  re-derives the fan's dx / dy to hit-test person pins); `emotes drawDock`'s help lines could mention "click a pin to
  remove it" for person pins too (today: "Click your pin: remove").
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
· controls · **gameui** (real mouse / keys: right-click point at a townsperson + a spot, the pie by right-hold + hover +
release = a teal pin with its drop + pop, right-drag + dead zone = sticky + click = a crimson pin, G + the violet swatch
+ F at the cursor, click your own pin = remove; PERSON pins on a townsperson: F = one pin, F again (same colour) =
removed, another colour = recoloured (still one), hover = the hand cursor + remove badge, a click on it = removed, the
right-hold pie on them offers "Remove my pin" and it removes it; Clear my pins (a person pin among them); J = the notebook (Seats rows, the held book on the player),
the Notes tab + typing = the quill, keys never reach the game, saved to localStorage, Esc closes and the book goes; the
panel's "big" toggle + J = the 3D big book, "v2 size" + right-click = the 24 px finger, both back, no reload, programs
constant) · **touch** (a phone page, 390 x 844 @2x, isMobile + hasTouch: the HUD below the folded panel
(`cover.top`), the toolbar's notebook on the canvas and a tap opens it, the notebook above the reader, the panel's
notebook button folds the panel, a CDP long press = the touch pie (not before 450 ms), lift = sticky, tap the teal wedge
= a teal pin without walking, a short tap still walks, the portrait opens the dock, the action bar on the canvas, the
tray by a tap and its L by a tap, a tap on the town closes it; no errors, no CSP violations) · **gameui2** (the action
bar: every key binding has a button, hover tooltip, the emote palette + the point pop fallback, the tray's Q E = - T B L
] [ Esc by real clicks, pin / point armed from the bar, the dock and the notebook from the bar; an off-screen arrow for a
far place pin; no label drawn under the panel; the tip: shown at the first run and gone by itself, the bulb reopens it,
its × flies it into the bulb + the glow, "never show again" closes + saves it; the ambient layer: 4 systems, 0 lights,
≤ 16 calls, butterflies by day, pigeons scatter when you walk at them, fireflies + moths at night; the events: captions,
vote clock, execution, night veil, dawn; the GHOST STATE with a `spec.ghost` character (clarabelle): 5 = on (reveal,
ghost label, rig level 1), walking (D held) stays ghost (level 1, `ch.ghost` 1, ghost label), stopped + a talk emote
still level 1, 5 = off (level 0, `ch.ghost` null, normal label), on again + a swap to a character without a ghost clip
clears it; programs constant but for a swapped-in character's own) · **storyteller** (a `?wip=1&tod=23` page: the swap compiles ≤ 3 programs, no
`char-light` PointLight, the carried lantern lit, the poof, no frame > 150 ms) · **critic pass-A checks** (ceremony: after
the night fall the clock is in the night hours and the chips read NIGHT / "NIGHT 1" + moon (P2-4); gameui2: Space opens
and closes the emote palette, the default character greys none of the six, 6 plays the signature (P1-2), G closes the
palette and opens the dock, the tray closes the dock (P2-5); touch: the open dock covers no bar button (P2-5), a tapped
tray button shows its name (P2-6); the bundle verify serves the published `v/<hash>/` layout and fails on any 404
(P1-1)). Every gameui rect / point is in the game UI's LOGICAL px: client = `info().unit` x logical (`unitDev` on the
phone page) · **passb** (`tools/demo-play-passb.mjs`: the vote camera's stepped transition (<= 7 distinct poses, settled < 1.5 s), every seat + the dial inside the visible area with the panel open AND hidden and the frame tighter than the old preset, 15 cast seats (no player / Storyteller id, the mannequins hidden), dead seats in ghost clips, >= 4 voters raise 'vote', the timer by K / Y / U / I + a real click on the ST control's Resume, the dial wedge / hour-board digits / HUD chip agreeing with the state, the tower's hands hidden while it runs and back after reset, zero = done + a bell, walking INTO the tower door (held W) with no program compiled, the timer wheel turning while running and still while paused, the stair raising the feet onto the landing, walking out onto the doorstep) · quality reload (state + position kept;
no automatic tip after "never show again", the bulb still there) + a reload inside a house (`?in=` brings the player back in).

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
- **Game UI round (2026-10-17: the pixel3d UI library in the demo, §4.7)**, all on render-host (RTX 4090, headless
  Chromium, 1280 x 720):
  - Baseline before any change: `tools/remote.sh node tools/demo-perf.mjs --q "tod=noon&intro=0" --secs 5 --frames 60`
    → 60 fps, frame p95 16.7 ms, CPU 7.22 ms / frame (pipeline 5.33), synced 8.49 ms, 278 calls, 43 programs.
  - After (same command, 2 runs each, `gameui=0` = the A/B in the same tree): **on** CPU 7.40 / 7.58 ms (pipeline 5.52 /
    5.66), frame p95 16.7 / 16.8, **281 calls, 48 programs** (constant through the day cycle, the playtest's 'time' step);
    **off** CPU 7.24 / 7.33 (pipeline 5.34 / 5.45), 278 calls, 43 programs. GPU time per frame (timer queries, RAF stopped,
    scratch `shots/demo-ui/gputime.mjs`): ~1.44-1.48 ms with the game UI vs ~1.24-1.35 ms with `gameui=0`. The synced
    metric (renderAt + readPixels while the RAF loop keeps running) reads 10.5 / 11.4 vs 7.3 / 8.0 ms; with the loop
    stopped the bursts are within noise of each other, so that gap is contention, not GPU work (the timer queries).
    First cut with the library's `src/ui/layer.js` (full clears + 3 full uploads per frame, every pass always on): CPU
    8.0, synced 12.3. `renderer.copyTextureToTexture` for sub-uploads made it worse (CPU 8.3-8.6: its 5 `gl.getParameter`
    reads are synchronous round trips) → raw `texSubImage2D` per band run + byte blits of cached pieces + idle passes off.
  - `tools/remote.sh node shots/demo-ui/check.mjs shots/demo-ui/r6` (scratch: real mouse / keys) → point (person, place),
    pie hot wedge + teal pin, dock + violet F pin, notebook seats / notes typing (write), big book, v2 point: OK.
    `check2.mjs` (night, talk outline + glyph, phases, inside house-8 + notebook + big book, the keys overlay) and
    `check3.mjs` (`npcs=6`: owl / skeleton-chef / mushroom talking with bubbles) → OK; all shots looked at
    (`shots/demo-ui/r3..r8`).
  - `tools/remote.sh node tools/demo-play.mjs --out shots/demo-ui/play1 --skip loading,crates,houses,doors,roster,time,phases,ceremony,reload`
    → PLAYTEST OK (43 s), 6b game UI all green, programs 48 → 48.
  - `tools/remote.sh node tools/demo-roster.mjs --browser --shots shots/demo-ui/roster` → **browser check OK** (27 offered,
    every swap programs 49-50, `?wip=1` 36 with 9 WIP), no ERRORS.
  - `tools/demo-bundle.sh build` (final code) → 194 files, 6,762,652 bytes (src/ui 377,721 B in 19 reached modules, out/ui 376,267 B in
    the 6 listed files), CSP pass rewrote 140 / 181 .js, 0 inline scripts, 0 bare three imports, CSP-safe.
  - `VERIFY_PLAY=1 tools/demo-bundle.sh verify` → header check exact, **SMOKE OK 5/5, csp violations 0** (high / low x
    noon / night + the tour), **PLAYTEST OK (179 s)** against the bundle under the exact CSP incl. 6b game UI (point at
    owl, pie → teal pin + pop, notebook held → write → saved, big book + an NPC reading, v2 finger, programs 48 → 48),
    1546 requests, 1 non-200 (the /v3-art-demo → / redirect). Smoke runs: 60 fps, frame p95 16.7-16.8 ms, high noon 48
    programs / 287 calls. Shots: `shots/bundle-final/{smoke,play}/` (looked at: play 48-56 `ui-*`, smoke tour).
  - `tools/remote.sh node tools/demo-roster.mjs --browser --shots shots/demo-ui/roster2` (final code) → browser check OK.

- **Demo completion pass A (2026-10-17 evening; P1.3 lantern, P1.4 touch, P2.5 ambient, P2.6 events, P2.7 arrows,
  P2.8 point fallback, P3.9 labels, the action bar, the lightbulb tip, + the user's ghost-state and person-pin bugs)**,
  render-host, all on the BUNDLE unless noted:
  - `tools/demo-roster.sh --browser` → `browser check OK`, `demo-roster.sh: roster ok: 27 offered, 8 WIP, 35 rows`,
    `pulled render-host:pixel3d/shots/demo-roster/emit-…json -> src/demo/roster.json` (exit 0; no skipped id).
  - `VERIFY_PLAY=1 tools/demo-bundle.sh all` → built 198 files, 6,912,983 bytes, CSP-safe; `CSP header check: exact`;
    `SMOKE OK: 5/5`, `csp violations: 0 … over 5 runs`; `PLAYTEST OK (247 s)` (every step incl. 6b person pins, 6d
    action bar / tip / ambient / events / ghost state, 6e Storyteller, 6c touch, 7 reload); 2048 requests, 1 non-200
    (the /v3-art-demo → / redirect).
  - Perf, before = the published 5ad84e13ab bundle (`dist/v3-art-demo-baseline` on the host), after = this bundle,
    `tools/demo-perf.mjs --page <bundle>/index.html`, two alternating runs: spawn noon 281 → 296 calls, 48 → 56
    programs, 60 fps, frame p95 16.7 ms, CPU 2.2 → 2.1-2.6 ms, synced 7.5-7.6 → 7.4-8.0 ms; west green at night
    374 → 392 calls, 46 → 54 programs, CPU 2.0 → 2.2-2.4 ms, synced 6.7-6.9 → 7.1-7.2 ms. The +8 programs are the
    ambient layer's (compiled in the warm-up; constant in play). Storyteller swap at 23:00 (`--hitch char:storyteller`):
    worst frame 233 → 17 ms, programs +23 (48 → 71) → +2 (56 → 58).
  - `tools/remote.sh node tools/demo-evidence.mjs --out shots/demo-passA/final` (new: real mouse / keys / touch on the
    bundle) → `EVIDENCE OK`, 0 errors; the tip-into-bulb frames → `tip-to-bulb.gif` (PIL on the host). All looked at.
- **Pass B (2026-10-17: the voting circle + the clock tower, §4.9)**, all on render-host (RTX 4090, headless Chromium), in the
  private copy `~/pixel3d-b` (`PIXEL3D_RDIR=pixel3d-b`):
  - The old vote camera, measured (`?passB=0`, `shots/demo-passB/steps-before.mjs`): viewHeight 19 / yaw 0 / target z 19.5
    (the inset's fit stays 1 beside the panel, the target moves 4.7 m east), a 1.3 m seated figure **42.7 px at 1280 x 720,
    64 px at 1920 x 1080**, the dial cut by the top edge (`shots/demo-passB/votecam-before-*.png`).
  - The new frame (`votecam.check()`): candidates yaw 0 / 45 / -45 = vh 15.88 / 14.27 / 15.0 (panel hidden), 17.54 / 15.0 /
    15.15 (panel open); picked yaw 45: **56.8 px / 85.2 px** (panel hidden), **54 / 81 px** (panel open), the dial 98 / 147
    px tall, every seat + the dial inside the visible area (15 / 15, dial true) at both sizes, day and night
    (`votecam-day-1280{,-panel}.png`, `votecam-day-1920{,-panel}.png`, `votecam-night-1280.png`).
  - `tools/demo-roster.sh --browser --shots shots/demo-passB/roster` → **browser check OK**, roster ok (27 offered, 8 WIP).
    (A first run failed: the seat cast's roots were named `character:<id>` and the check wants 1 player + 3 NPCs: the
    seat cast's roots / FX holders now carry `seat-cast` names.)
  - `tools/remote.sh node tools/demo-play.mjs --out shots/demo-passB/play2` (before the fixes) → 6 failures, all pass B
    side effects, fixed: the roster's model / FX-holder count (as above) and gameui2's "pin from the bar" (its click
    beside the player at the south seats pinned a seated CAST member: the gameui steps now empty the seats first).
  - `VERIFY_PLAY=1 BUNDLE_PORT=8093 tools/demo-bundle.sh all` (final code) → bundle 204 files, 7,006,703 bytes, CSP-safe;
    header check exact; **SMOKE OK 5/5, csp violations 0** (high / low x noon / night: 60 fps, p95 16.7-16.8 ms, programs
    68 / 66, high noon 303 calls; the tour); **PLAYTEST OK (277 s)** incl. step 8 passb: transition 6 poses / 788 ms,
    vote frame panel vh 15.0 (54 px) / no panel 14.27 (56.8 px), cast owl..opal (15), voters 0 1 7 9 10 12 raised 'vote',
    timer running: dial 175/180, board ' 059', chip "Nominations close in 0:59", tower hands hidden; walked into the
    tower (programs 71 -> 71), the timer drum turned and stopped when paused, landing y 1.11, walked out onto the
    doorstep; zero = done + bell; programs 71 -> 71 over the step; gameui2: 33 bindings, 0 missing (the timer keys are the
    tray's third row). 2114 requests, 1 non-200 (the redirect).
  - Programs on entering (`shots/demo-passB/steps-progs*.mjs`): tower first visit 68 -> 68 (was +1: the unnamed
    `depth ... char-depth-snap` lit variant, also on any first cottage visit: house-8 now +2 instead of +3).
  - Perf (`tools/demo-perf.mjs`, 1280 x 720, before = `?passB=0`): see §4.9 "Perf".
- **Density D=2 across the game UI + the critic's pass-A fixes (2026-10-17, ui; §4.7 "Density", "Critic pass-A fixes")**,
  render-host (RTX 4090, headless Chromium), all looked at:
  - `tools/remote.sh node tools/demo-hd.mjs --out shots/demo-hd/before ...` (pass A code, before any change) and
    `--out shots/demo-hd/after` (final; 1280x720, 1920x1080, 390x844 phone; noon + night) → `DEMO-HD OK`; before over
    after x3: `shots/demo-hd/pairs/` (palette, tray, emotes, tip, toolbar, chips, label-personpin, pinhover, placepin,
    notebook, notebook-seats; phone-*; 1280x720-night-fireflies).
  - Perf (`tools/demo-hd.mjs --parts perf`, 4 s windows; UI = the layer's redraw = its pass update; uploads per frame):
    every case 60 fps, RAF frame p95 16.7-16.8 ms. 1280x720 UI redraw mean: pass A (before) busy 0.31-0.45 ms / 67 k px,
    idle 0.14-0.23 ms / 23 k px; this tree at `?uidensity=1` busy 0.47-0.53 / 64 k, idle 0.30-0.32 / 23 k, point
    0.36-0.41 / 34 k; **D=2 busy 1.22-1.41 ms / 260 k HD px, idle 0.58-0.65 / 108 k, point (finger + trail + ping, HD)
    0.67-0.78 / 153 k**. 1920x1080 D=2: busy 1.24-1.44 / 266 k, idle 0.54-0.63 / 92 k, point 0.66-0.77 / 157 k (1x A/B:
    0.44-0.53 / 65 k, 0.27-0.31 / 25 k, 0.34-0.40 / 36 k). Phone D=2: busy 1.20-1.43 / 204 k, idle 0.53-0.68 / 86 k.
    renderAt CPU means 7.4-8.1 ms in both modes (noise larger than the difference).
  - `tools/demo-roster.sh --browser` → `browser check OK`, `roster ok: 27 offered, 8 WIP, 35 rows`.
  - `VERIFY_PLAY=1 BUNDLE_PORT=8094 tools/demo-bundle.sh all` (final code) → built 221 files, 7,584,787 bytes, CSP-safe;
    `staged layout: index.html + v/9825a03779/ (as tools/demo-publish.sh)`; `CSP header check: exact`; `SMOKE OK: 5/5`,
    `csp violations: 0 … over 5 runs`; `PLAYTEST OK (297 s)` (ceremony → 21.50 h, chips NIGHT / "Night 1" + moon; Space
    palette open / closed, frog greys none, 6 = 'oath', G closes the palette, the tray closes the dock; 33 bindings, 0
    missing; touch dock over no bar button, tapped tray name; passb programs constant); 2300 requests, 1 non-200 (the
    redirect), `404s in the staged layout: 0`. Earlier verify runs found: the playtest's own `import(new URL('src/demo/…',
    location.href))` 404'd in the staged layout (now resolved against main.js's URL), and a mid-step compile in passb
    from the gameui2 ghost test swapping a SEATED character in and out (the test now uses requin + duelist; seatcast.js
    also seats your last castable character when a non-castable one leaves you on a seat).
