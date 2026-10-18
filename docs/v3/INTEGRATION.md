# v3 integration contract: the pixel3d town in the multiplayer game

Status: **binding contract** for the v3 game swarm (branch `v3-game`, based on `v3-dev`). Written 2026-10-17 by the
v3 integration architect, revision 2 (review round 1 resolved, see §12). Paths are repo-relative.
`v3/pixel3d/**` and `v3/assets/**` are **read-only vendor inputs**. `$PIXEL3D_DIR` is the maintainer's local pixel3d
checkout, the default in `scripts/v3/import-assets.sh:6`; anything that exists only there is marked
**[unpublished, Q6]** and is not available to other worktrees.
Do not write machine names, hardware, tailnet names or home paths into this file: the repo is public, and
`scripts/secret-scan.sh` checks for them. Host specifics live only in the gitignored `CLAUDE.local.md` /
`ops.local.env`.

**Vendor baseline.** Checked against the `v3/pixel3d` tree last changed in commit `8b50668` (2026-10-17), with
`find v3/pixel3d/src -name '*.js' | LC_ALL=C sort | xargs cat | shasum -a 256` = `43efbcd05609e2b8…`. Vendor code is
cited as `file` + **symbol** (for example `src/core/Engine.js Engine.constructor`); line numbers are hints only and
shift with every re-publish. Repo code is cited as `file:line`.

Rule for every agent: when a decision here turns out to be wrong, change this document **in the same commit** as the
code, and add a line to §11 "Decision log". Do not leave a silent divergence.

---

## 1. Architecture

### 1.1 Shape

```
GameScreen.tsx ──(chooses)──► import('./TownGame')         Classic 2D (Phaser, unchanged; also renders the v3 world, §2.5)
               └───────────► import('../game3d/TownGame3d') v3 3D (three r170 + pixel3d), lazy chunk "town3d"
both: createTownGame(parent: HTMLElement, bridge: TownBridge): { destroy(): void }
```

- **Mount interface.** The v3 entry point is `createTownGame3d(parent, bridge)` in `apps/client/src/game3d/TownGame3d.ts`.
  - Same `TownBridge` (`apps/client/src/game/TownScene.ts:164-172`) and the same `{destroy}` handle as
    `TownGame.ts:6`.
  - Renderer choice happens in `apps/client/src/game3d/select.ts`, which is pure (no three import) and stays in the
    main bundle.
- **GameScreen effect split** (`apps/client/src/game/GameScreen.tsx:35-59` today is one effect keyed on
  `[props.conn]`):
  - Effect A, keyed on `[props.conn]`: `applyAmbientVolume`, `attachSound`/`detachSound`, the audio-unlock listeners.
    It does **not** re-run on a renderer swap, so ambience never restarts.
  - Effect B, keyed on `[props.conn, renderer]`: the dynamic import + mount + `destroy()`. `renderer` is state
    `'v3' | 'classic'`, initialised from `chooseRenderer()`.
  - Each renderer's `destroy()` must remove every debug hook it installed (`window.__ctCamera`, `__ctSocial`,
    `__town`, and for v3 `__pixel` members it set). `v3-fallback` asserts `__ctCamera.v3 === undefined` after a swap.
- **Phaser stays the fallback.** Nothing in `apps/client/src/game/**` is deleted. Pure helpers that both renderers
  need are extracted in WP0 into `apps/client/src/game/rules/*.ts`, and the Phaser-bound layers are split into a
  renderer-free core plus a Phaser view in WP0s (§8). TownScene imports them back, with no behaviour change.
  - Helpers to extract: `dir8`/`toFacing`/`keyDir`/`isTyping` (`TownScene.ts:114-123, 2091, 2110`), door lock and
    in-use rules (`920-939`), auto-enter thresholds (`981-996`), the door `inward` rule of `setupDoors` (`879`,
    extended with `doorNormal`, §2.5), `tapTarget` (`1053-1060`), `castKey` (`1073-1096`), the `stepLocal` integrator
    (`1756-1838`), the `stepRemotes` interpolator (`1873-1914`), the prompt rules (`1916-1937`).
- **Chunking.**
  - `game3d/**`, `three` and `v3/pixel3d/src/**` land only in dynamic chunks. The chunk named `town3d` holds the
    entry; pieces, interiors and characters become their own chunks (§1.3).
  - The v3 layout data (`@ct/assets/hollowmere`, §2.2) is its own lazy chunk too (§2.4 "Layout loading").
  - Budgets are in **brotli KiB** to match `scripts/perf/budgets.mjs` (`*BrKiB`, e.g. `lobbyChunkBrKiB` max 72,
    v2.4 63.8, `budgets.mjs:30`): main/entry growth ≤ 1 KiB br, lobby chunk growth ≤ 2 KiB br (§7).
- **Prefetch.** `warmTown()` (`ui/lobby/LobbyRoute.tsx`) runs before the `RoomConnection` exists, so it cannot know
  the lobby's world; it keeps prefetching only `TownGame` (Classic). The 3D chunk `town3d` and the v3 layout chunk are
  fetched when the first `lobby:view` says `world: 'v3'` (`useLobbyLayout`, gated on `mayUseV3()` = prefs + boot guard
  + WebGL probe), so a v2 join never downloads three.js (WP0 change, §11).
- **Mount gate (WP0).** `InLobby` waits for the first `lobby:view`, then `ensureLayout(world)` (v2: synchronous), and
  only then mounts `GameScreen`; a v3 lobby whose layout cannot load shows "This town could not be loaded".

### 1.2 Renderer choice and fallback (`game3d/select.ts`, `game3d/perf.ts`, `game3d/bootGuard.ts`)

`chooseRenderer()` evaluates these rows **in order**; the first match wins.

| # | Input | Rule |
|---|---|---|
| 1 | Lobby world (`lobbyView.world`, §2.4) | `'v2'` → Classic always (the 3D town cannot draw v2 geometry). Settings row shows "This lobby uses the classic town". |
| 2 | Debug force `localStorage['ct.debug.v3force']==='1'` | → v3, skipping **every** later row (probe, software GL, phone, boot guard, auto-fallback). The probe still runs **without** `failIfMajorPerformanceCaveat` and only fails if `webgl2` is entirely absent. Used by e2e on the host (SwiftShader). |
| 3 | Pref `ct.graphics` = `'auto' \| 'v3' \| 'classic'` (default `auto`) | Registered in `ui/common/prefs.ts` next to `FX_QUALITY_KEY`; shown in `SettingsDialog.tsx` (around line 437) as "Graphics: Auto / v3 3D / Classic 2D". `classic` → Classic. |
| 4 | Boot guard (crash-loop protection, below) | Unclean previous boot → Classic + toast "v3 graphics stopped last time [Try v3]". Applies to explicit `v3` too. |
| 5 | WebGL2 probe | `canvas.getContext('webgl2', {failIfMajorPerformanceCaveat: true})`. Null → Classic. The probe context is released with `getExtension('WEBGL_lose_context')?.loseContext()` and the canvas dropped. |
| 6 | Software GL | `UNMASKED_RENDERER` matches `/SwiftShader\|llvmpipe\|Software/i` → Classic (only reached without v3force). |
| 7 | Auto fallback memo | `auto` and `ct.graphics.autoFallback` set within 7 days → Classic. Settings shows "Auto (Classic: too slow on this device) [Try v3 again]"; the button clears the memo and swaps in place. |
| 8 | Phone policy | `auto` on a coarse-pointer device whose shorter side is ≤ 500 CSS px → Classic. An explicit `v3` is honoured on any device, at the `low` tier. |
| 9 | Starting tier | Chosen **before** building: `low` when `fx/quality` says low, the device is a tablet (coarse pointer, any size), or `UNMASKED_RENDERER` matches `/Intel\|UHD\|Iris\|Mali\|Adreno\|PowerVR\|Apple GPU/i` (integrated/mobile). Otherwise `high`. `auto` may promote low → high only after a clean sample (below) and only at a safe moment. |

**Boot guard** (`game3d/bootGuard.ts`). Reading the guard (`bootGuardState`, main bundle) lives in `bootGuard.ts`; writing it (`markBooting`, `markStable`,
`BootTracker`) in `bootMark.ts`, which only the lazy 3D chunk imports. Before `new Engine(...)`, write `localStorage['ct.graphics.booting'] =
<ISO time>` and append the time to `ct.graphics.boots` (last 10 min). Clear `booting` after 10 s of stable frames or on
a clean `destroy()`. On mount, a leftover `booting` flag, or ≥ 2 unclean boots in 10 min, picks Classic (row 4). This
covers OOM / GPU-process kills on iOS Safari and low-memory Android, which reload the tab with no JS error.
`Engine.constructor` hard-codes `powerPreference: 'high-performance'` and no `failIfMajorPerformanceCaveat`
(`src/core/Engine.js`, `new THREE.WebGLRenderer`): CONTRACT-REQUEST (§9.2).

**Runtime perf sampler** (`game3d/perf.ts`).

- **Off** when `ct.debug.fps > 0` or `ct.debug.v3force === '1'`, as `TownGame.ts:19` does for Classic
  (`new TierState(..., fpsLimit <= 0 && !forceTimeout)`). The `v3-fallback` spec turns it back on with
  `ct.debug.v3perfFallback=1`.
- Samples **rAF deltas** (not `engine.lastFrameMs`, which is CPU-only, `Engine.renderAt`) only while
  `document.visibilityState === 'visible'`; deltas > 250 ms are dropped. Window: 120 accepted frames after the
  shader warm-up and first show.
- Threshold: median > 45 ms (a 30 fps cap from Chrome Energy Saver gives ≈ 33.3 ms and must not trip it).
- At `high` → schedule a rebuild at `low`. At `low` → schedule `requestFallback('perf')`.
- **Safe moment.** A scheduled rebuild, promotion or renderer swap waits while `game.day.status === 'voting'` or a
  nomination is open, and runs at the next phase change (or after 60 s of no nomination). Crash swaps (below) never
  wait.
- Fallback: toast "Switched to Classic graphics for speed", sets `ct.graphics.autoFallback=<ISO date>`, destroys the
  3D game and mounts Classic **in place** (GameScreen effect B, `renderer` state).

**Crash.** Any of these triggers an immediate in-place swap with reason `'error'`:

- a failed v3 import after one retry (chunk-load errors retry once after 1 s, because deploy skew is the common
  case);
- a throw during build. The town is built with `buildTown(engine, params, {strict: 'all'})`, so `buildPiece`
  (`src/town/api.js buildPiece`) rethrows instead of substituting a placeholder box with a `console.warn`;
- `webglcontextlost`. It is **never** left to three's partial restore (PixelPipeline targets, toon materials and
  shadow state are not fully rebuilt by three). The first loss in a session does a full rebuild (new Engine, §1.3
  "Rebuild") behind the "Rebuilding town…" overlay; a second loss within 10 min swaps to Classic.

`TownBridge.requestFallback?(reason: 'perf'|'error'): void` is an **optional** bridge member; Classic ignores it.

### 1.3 Importing pixel3d without editing it

1. **Dependency.** Add `"three": "0.170.0"` (exact pin, the version in `v3/pixel3d/package.json`) to
   `apps/client/package.json`. Bring the lockfile back via `CT_AGENT=v3-lead scripts/remote.sh pnpm install`.
   - Dependabot (`.github/dependabot.yml`, npm ecosystem over every `package.json`) gets an `ignore` entry for
     `three` (all update types). If it ever picks up `v3/pixel3d/package.json`, exclude that directory.
   - Unit test `apps/client/test/game3d/threePin.test.ts`: the `three` version in `apps/client/package.json` equals
     the one in `v3/pixel3d/package.json`.
2. **Resolution.** `v3/pixel3d` is not a workspace package (`pnpm-workspace.yaml` lists only `apps/*`, `packages/*`)
   and has no `node_modules`. A bare `import 'three'` from `v3/pixel3d/src/**` (131 files) or
   `three/addons/utils/BufferGeometryUtils.js` (9) / `three/addons/geometries/ConvexGeometry.js` (2) walks up from
   the importer's directory and never reaches `apps/client/node_modules`; pnpm does not hoist it to the root. So, in
   `apps/client/vite.config.ts` (`resolve.alias`, next to the existing `@ct/protocol` alias at `:100`):
   ```ts
   const threeDir = path.dirname(createRequire(import.meta.url).resolve('three/package.json'));
   { find: /^three$/,            replacement: path.join(threeDir, 'build/three.module.js') },
   { find: /^three\/addons\/(.*)$/, replacement: path.join(threeDir, 'examples/jsm/$1') },
   { find: /^@pixel3d\//,         replacement: path.join(repoRoot, 'v3/pixel3d/src/') },
   ```
   plus `resolve.dedupe: ['three']` and `server.fs.allow: [repoRoot]`. The demo import map
   (`v3/pixel3d/demo.html`) is not used.
   - **Vitest.** The root `vitest.config.ts` (lead) gets the same three aliases, so unit tests that import a wrapper
     resolve the same single copy.
   - **One-copy assertion.** `pixel3dImports.ts` `generateBundle` fails the build when module ids from more than one
     `three/build/` directory appear in the bundle. C0's acceptance is a real `pnpm build` that bundles
     `@pixel3d/core/Engine.js`.
3. **Build-time import rewrites** (`apps/client/build/pixel3dImports.ts`). Pattern: the `cssOrder()` plugin
   (`vite.config.ts:25-60`), which patches a known snippet and **fails the build** when the snippet is missing, so a
   vendor re-publish that changes it is caught.
   - `src/town/api.js buildPiece`: `await import(PATHS(id))` → `await __ctPieces[PATHS(id)]()` with
     `const __ctPieces = import.meta.glob(['./pieces/*.js', './life/index.js'])` injected **into api.js itself**.
     Globs are relative to the file they are written in; a leading `/` would resolve against the Vite root
     (`apps/client`) and match nothing. The keys (`./pieces/<id>.js`, `./life/index.js`) equal `PATHS(id)`.
   - `src/demo/characters.js createCharacter` calls `optional('../chars/smear.js')` and `optional('../chars/fx.js')`
     (a variable `import(p)` Vite cannot analyse; in a build the relative URL 404s or returns HTML, so smears and fx
     silently vanish in production). Rewrite the `optional` helper so it looks `p` up in a static map
     `{'../chars/smear.js': () => import('../chars/smear.js'), '../chars/fx.js': () => import('../chars/fx.js')}`
     and keeps its try/catch → `null`. Build fails if the snippet or the two call sites are missing.
   - `src/demo/characters.js sourcePrint`: `new URL(`../../characters/${id}.js`, import.meta.url)` makes Vite emit
     every character source as a raw asset. Rewrite the body to `return null` (no roster cache: the game never needs
     it). Bundle-report assertion: no emitted asset matches `characters/.*\.js`.
   - `src/demo/roster.js` `fetch(new URL('./roster.json', import.meta.url))` → a static
     `import roster from './roster.json'`.
   - `src/town/pieces/ground.js` `const ga = viewArea(engine, 3);` → `const ga = engine.__ctGrassArea ??
     viewArea(engine, 3);` (grass area, step 5).
   - `src/town/interiors/index.js`, `roster.js` and `ambient/index.js` template-literal dynamic imports: Vite
     handles these natively. `roster.js` chunks all 37 character modules (32 cast specs + `wanderer`, `keeper`,
     `hound`, `duelist`, `mannequin`); acceptable, they are fetched only on use.
   - CONTRACT-REQUESTs for static imports in all of these (§9.2).
4. **Typing.** `apps/client/src/game3d/pixel3d.d.ts` declares `@pixel3d/*` as `any`-typed modules plus the few
   signatures we call. No `allowJs`, no vendor typecheck. Every vendor call goes through typed wrappers in
   `game3d/vendor/*.ts`; no other file imports `@pixel3d/*` (WP0 boundary test).
5. **Engine host** (`game3d/vendor/engineHost.ts`). Order of operations in `createEngineHost(parent, opts)`:
   1. `window.__pixel ??= {ready:false, errors:[], renderAt:null, info:null, gpu:null}` (`Engine.constructor` writes
      `window.__pixel.gpu` and throws without it).
   2. `new Engine({params})` with our own `URLSearchParams` (quality etc.), never `location.search`.
      `layout.js` (`?ldx`), `roster.js` and `characters.js` still read `location.search`; the game URL has none of
      those keys. The constructor sizes once from `window.inner*` (`Engine._pickScale`, `Engine.resize`); that is a
      wasted allocation, not a bug, because step 4 resizes immediately.
   3. **Runtime assertions** so a vendor re-publish fails loudly: `engine.renderer.domElement.parentElement ===
      document.body`, `typeof engine.resize === 'function'`, `engine.pipeline && engine.camera`, `__pixel.gpu` set.
      A failure throws (→ Classic via the crash rule).
   4. **Canvas.** Move `engine.renderer.domElement` into `parent`, style `position:absolute; inset:0; width:100%;
      height:100%; image-rendering:pixelated` (CSSOM only; `style-src 'self'` allows it). The renderer runs at
      `setPixelRatio(1)`, so canvas px = CSS px.
   5. **Size.** Shadow `engine.resize = () => hostResize(engine, parent)`: it returns at once if `engine.__ctDisposed`,
      else reimplements `Engine.resize` from `parent.clientWidth/Height`, with `pixelScale = max(1, round(h/360))`
      (`low` tier: `round(h/300)`). Driven by a `ResizeObserver` on `parent`. The constructor's window `resize`
      listener cannot be removed; it calls the shadowed method, which no-ops after dispose.
   6. **Runtime opts.** Port the demo's `installRuntimeOpts` (`src/demo/main.js`): after `buildTown`, add an empty
      `THREE.Group` named `town-lights` **only if** `scene.getObjectByName('town-lights')` is null, and wrap
      `engine.pipeline.render` with the single `scene.updateMatrixWorld()` + `matrixWorldAutoUpdate=false` pattern
      (a measured CPU saving). Never add the group **before** `buildTown`: `installLights` (`src/town/api.js`) adds
      its own `town-lights` group on golden/night builds, and `props.js`/`life/cycle.js` look the group up by name and
      would bind to the empty one.
   7. **Loop.** Own RAF loop modelled on `src/demo/main.js` (the `loop` near the end of `main`), keeping the RAF id for
      cancel on destroy. Do not use `Engine.start()` (debug controls, negative first `t`).
   - **Grass area.** `buildTown` scatters grass only over the build camera's view (`src/world/grass.js viewArea`,
     called by `ground.js`). The demo's `buildWide` (`src/demo/main.js`) fakes a wide view via a stack-sniffing
     getter (`/\/town\/pieces\/ground\.js/` on `new Error().stack`), which breaks once chunks are hashed and
     minified. We use the step-3 rewrite instead: `vendor/town.ts` sets `engine.__ctGrassArea = {x0:-2, x1:47, z0:3,
     z1:41.5}` (the demo's `GA`) before `buildTown` and deletes it after. Harness shot `south-bay` catches bald
     ground.
   - **Ground handle.** `createCharacter(engine, id, {ground, position, face, fx, smears})` with an explicit `ground`.
     Never call `listCharacters()` (`src/demo/characters.js`): it spawns NPCs through `window.__demo`.
   - **Dispose** (`disposeEngine(engine)`): set `engine.__ctDisposed = true`; cancel the RAF; `engine.updaters.length
     = 0` (`Engine.onUpdate` has no unsubscribe; `buildTown`, `installLights`, `createTime` and pieces register
     updaters for good); traverse `engine.scene` and dispose geometries, materials, textures; dispose the pipeline
     render targets, `renderer.dispose()`, `renderer.forceContextLoss()`; remove the canvas; then null the heavy
     fields (`scene`, `pipeline`, `renderer`, `camera`, `uniforms`, `toonUniforms`) so the leaked window listener
     only holds a shell.
   - **Rebuild.** A tier change or a context-loss rebuild **always creates a new Engine** (dispose the old one first,
     then the full §1.3 step-5 sequence). Never rebuild the town inside an existing Engine.
   - **Leak test** (WP7, harness): 5 mount/destroy cycles and 2 tier rebuilds; assert `renderer.info.memory` of the
     live engine is at baseline **and** JS heap (`performance.memory.usedJSHeapSize` after a forced GC via
     `--js-flags=--expose-gc`, or a CDP heap snapshot) grows < 10 MB across the cycles.
6. **CSP and vendor review.**
   - Today the runtime vendor files have no `eval`, `new Function`, `innerHTML`, workers or style/script element
     creation, and the CSP (`apps/server/src/securityHeaders.ts:51-63`) and Trusted Types need no change.
   - Because the vendor is re-published by another session (rsync `--delete`) straight into the production bundle,
     WP0 adds a vitest guard `apps/client/test/game3d/vendorGuard.test.ts` over `v3/pixel3d/{src,characters,charkit}`
     `**/*.js` (excluding `tools/`, `*.mjs`, `pipeline/`): fails on `eval(`, `Function(`, `innerHTML`, `outerHTML`,
     `insertAdjacentHTML`, `document.write`, `new Worker`, `setAttribute('style'`, string-argument `setTimeout(`/
     `setInterval(`, and any absolute `http(s)://` in `fetch(`/`new URL(`/`import(`.
   - §10 adds a vendor-diff review before each `v3-dev` → `v3-game` merge (the CLAUDE.md "never run unreviewed code
     on the host" rule applies to vendor drops).
   - `v3-boot` e2e runs with the console CSP-violation listener.
7. **Needed pixel3d changes.** First choice: a wrapper in `game3d/vendor/`. If impossible, add a
   `CONTRACT-REQUEST(pixel3d):` entry to §9.2 and a matching `// CONTRACT-REQUEST(pixel3d):` comment at the
   workaround. Never edit `v3/pixel3d/**`.

### 1.4 Module layout (`apps/client/src/game3d/`)

```
TownGame3d.ts      createTownGame3d(parent, bridge) — composition root, loop, destroy order
select.ts          chooseRenderer(), probe, prefs (static import; no three)
bootGuard.ts       crash-loop guard, read side (static; no three)
bootMark.ts        crash-loop guard, write side (boot marks, BootTracker; lazy chunk only)
perf.ts            rAF sampler, safe-moment scheduler
contract.ts        shared interfaces below (no three types leak out of game3d)
coords.ts          px <-> metres, interior affine maps (§2.3), projection maths (§1.5) — pure, no three import
vendor/            engineHost.ts, town.ts, characters.ts, interiors.ts, time.ts  (only importers of @pixel3d;
                   WP0 ships minimal town.ts / characters.ts stubs that WP3 / WP2 then own)
world/             town build, doors, boarded houses, interiors switching, time-of-day, dais, clock tower  (WP3)
avatars/           local + remote characters, cast map, ghosts, deaths, talk, carried lanterns, NPCs   (WP2)
overlay/           world-anchored UI: labels, bubbles, pins, emotes, boards, house names, markers, hints (WP4)
input/             keys, pointer → pick → v2 px, tap rules, routes, camera                             (WP1)
net/               state adapter: lobbyView/gameView/snapshots → Scene3dState; move/door sends; sound cues (WP1)
debug/             window.__ctCamera / __ctSocial v3 implementations                                  (WP1, members from all)
harness/           mock-world page + scenario player (§6.3)                                           (WP7)
```

`contract.ts`, created by WP0, makes the packages parallel:

```ts
export interface Px { x: number; y: number }                         // v2 world px, y-down, FEET
export interface Pose { pid: string; x: number; y: number; location: LocationId; facing: Facing; moving: boolean }
export interface Scene3dState {                                       // written by net/, read by everyone, once per frame
  me: Pose | null; myPid: string | null; amStoryteller: boolean;
  remotes: ReadonlyMap<string, Pose>;                                 // already interpolated (110 ms)
  members: ReadonlyMap<string, { name: string; castId: string; seat: number | null; role: 'player'|'storyteller' }>;
  game: PlayerGameView | StorytellerGameView | null; phase: GamePhase | 'waiting' | 'finished';
  layout: TownLayout; world: 'v2' | 'v3'; tier: 'low' | 'high'; reducedMotion: boolean; hour: number;
}
export interface Layer3d {
  update(state: Scene3dState, t: number, dt: number): void;
  destroy(): void;
  debug?(): Record<string, () => unknown>;                           // merged into __ctCamera by debug/
}
export interface View3d {                                             // implemented by input/camera over coords.ts
  worldToScreen(p: Px, location: LocationId, heightM?: number): { x: number; y: number } | null; // page CSS px (§1.5)
  screenToWorld(cssX: number, cssY: number): (Px & { location: LocationId; houseId?: string }) | null; // §3 "ST taps"
  cssPerPx(): number;                                                 // CSS px per v2 px at the focus (≈ zoom)
}
export interface Anchor3d { feet: Px; displayFeet: Px; headTopCss: { x: number; y: number }; heightM: number }
export interface AvatarRegistry { anchorOf(pid: string): Anchor3d | null; pidAt(cssX: number, cssY: number): string | null; debug(pid: string): AvatarDebug | null }
```

**Coordinate rule.** Every value that crosses a package boundary is in **v2 px plus a `LocationId`**. Metres exist
only inside `world/`, `avatars/` and `overlay/` drawing code, and only through `coords.ts`.

### 1.5 Projection (`coords.ts`, WP0; the only implementation)

The pixel camera renders a frustum `MARGIN = 2` low-res texels wider on each side (`src/core/PixelCamera.js` `MARGIN`,
`PixelCamera.update`: `halfW = (lowW/2 + MARGIN)·texelWorld`). It snaps the camera to the texel grid and stores the
sub-texel remainder in `camera.offset` (texels, y-up). The final pass (`src/core/PixelPipeline.js`, `finalMat`
fragment shader + `render()` step 5) samples padded texel `p = s + MARGIN + off`, where `s = gl_FragCoord.xy /
pixelScale` and `off = snapScreen ? floor(offset·scale + 0.5)/scale : offset` (`snapScreen` is `'auto'` = on at
integer scales). A naive `vector.project(cam)` mapped to the canvas rect is therefore off by `MARGIN·pixelScale` CSS
px (6 px at ×3) and jitters by up to one texel. The contract:

```
// world point W (metres) -> page CSS px.  cam = engine.camera.cam, after this frame's camera.update().
ndc   = W.project(cam)                                         // x, y in [-1, 1]
pad   = ((ndc.x+1)/2 · (lowW + 2·MARGIN), (ndc.y+1)/2 · (lowH + 2·MARGIN))   // padded low-res texels, y-up
off   = snapScreen ? round(offset·scale)/scale : offset         // exactly as the shader
s     = pad − MARGIN − off                                     // visible low-res texels, y-up
css.x = rect.left + s.x · scale
css.y = rect.top  + engine.height − s.y · scale                // engine.height = canvas px = CSS px (pixel ratio 1)
```

- `screenToWorld` inverts the same formula (`s = ((cssX − rect.left)/scale, (engine.height − (cssY − rect.top))
  /scale)`, `pad = s + MARGIN + off`, `ndc`, unproject a ray) before the §3 pick.
- `coords.ts` takes plain numbers (`{lowW, lowH, scale, offset, snapScreen, height, rect, viewProj}`), so it is unit
  tested without WebGL. The harness has a `projection` scenario that renders a 1-texel marker at known world points
  and asserts `worldToScreen` within 0.5 CSS px of the marker's drawn pixel at scales 2, 3 and 4.
- Overlays read the projection **after** `camera.update()` of the same frame (the overlay layer runs after
  `renderAt`).

---

## 2. World geometry source of truth

### 2.1 Decision: (b) export Hollowmere into the server's world data, as a per-room selectable layout

The 3D town is the truth. Its geometry is exported into a second `TownLayout`, **`townLayoutV3`**, which the server
uses for rooms whose world is `v3`. The current `townLayout` (v2) is not touched, so v2 lobbies and Classic keep
working byte-for-byte.

Why not (a), keeping the v2 layout and mapping it into Hollowmere:

- **House 9 moves 7 m** into a south bay whose door tile (22,41) lies outside the 37-row map
  (`v3/pixel3d/src/town/layout.js` house 9 placement, `TOWN_H = 43`).
- Six houses are rotated (between −45° and +45°), and seven doors have moved (`layout.js` `houses`).
- Under (a), server doors and collision would disagree with what players see. The dais is also a solid r 2.4 m disc
  (`src/demo/collision.js` `DAIS_R`, `tag: 'dais'`) that the v2 grid lets you walk through.

Why per-room, and not replacing v2:

- Replacing v2 would break every v2 test that pins 45×37 and door-by-facing (`packages/assets/test/layout.test.ts:60-124`).
- It would also break the deployed Classic look, which cannot draw rotated houses.
- A per-room world lets v3 ship behind a lobby option and later become the default by flipping one value (C3, §8).

### 2.2 The export (owner WP5a, `v3-world`, phase 0b)

- **Tool.** `scripts/v3/export-hollowmere.mjs`, plain Node 24, run on the host via `scripts/remote.sh`.
  - Imports `v3/pixel3d/src/town/layout.js` directly (no imports, pure).
  - Interiors: imports `town/interiors/house-<i>.js` + `kit.js` (needs `three`; resolved with
    `--import` of a tiny loader that maps `three` → `apps/client/node_modules/three`, same rule as §1.3 step 2).
  - Outdoor walk shapes: `src/demo/collision.js createCollision` needs a `demo`-like object (registry, layout). If it
    cannot run headless in Node, run the same extraction in a headless chromium page on the host (logic only;
    SwiftShader is fine).
  - **As built (WP5a):** everything runs headless in plain Node. An in-process `module.registerHooks` resolve hook maps
    `three` / `three/addons/*` onto `apps/client/node_modules/three` (no `--import` flag needed). `createCollision(null)`
    runs as is (no registry: doors = the layout's placed real doors, which `town.js` checks against the piece anchors);
    `buildInterior` and the house / tower pieces (`api.js buildPiece`, `strict`, placed with `town.js placementMatrix`)
    build against a stub engine (geometry only; no WebGL, no chromium). Any vendor `console.warn` fails the export.
    `--check` exits 1 when the committed JSON is stale; `--dump=x0,y0,x1,y1` prints a tile map with block reasons.
- **Output.** `packages/assets/src/hollowmere/hollowmere.generated.json` (committed, deterministic, sorted keys),
  with `vendorHash` (sha256 over `vendorFiles`, every vendor module the exporter loaded, path + content). The assets
  test recomputes it and fails with "re-run export-hollowmere" when the vendor copy changed. `collision` is stored as
  43 strings of `0`/`1` (`layoutV3.ts` expands it to the row-major `number[]`); the JSON also carries `map` (objects,
  styles, decals, lights, the vendor `propDefs`), `npcHomes` and the review data under `meta`.
- **Schema** (tiles or v2 px, y-down; metres never stored):

| Field | Value / source | Rule |
|---|---|---|
| `version` | `3` | |
| `tileSize` | `16` | 1 tile = 1 m (§2.3). |
| `widthTiles` | **`112`** = 45 + 2 + 5·13 | Full map width (town + gap + 5 interior bands of stride 13, §2.3). Collision is row-major over `widthTiles·heightTiles` (`packages/protocol/src/world.ts:53,69`, `apps/client/src/game/path.ts:27-32`). |
| `heightTiles` | **`43`** | `max(TOWN_H = 43, 1 + 2·14 + 12 = 41)`. |
| `townBounds` | **`{x:0, y:0, w:45, h:43}`** | Read by `apps/server/src/world/index.ts:837`, `apps/server/src/social/index.ts:157`, `apps/client/src/game/sound/areas.ts:76`, `TownScene.ts:58`. |
| `ground[]` (43 strings of 112) | `layout.ground` | Same char codes as v2 (`BLOCKING_GROUND` identical). |
| `collision` (town part) | rasterised walk shapes | Tile blocked if its **feet point** (tx+0.5, ty+0.875) m lies inside any shape of `src/demo/collision.js createCollision`: house outlines (rotated), the clocktower box, the **`backlane`** boxes behind the north row and the 1 m slots between those buildings (players there are hidden by eaves), prop circles/boxes, and the **dais** circle (r = `DAIS_R` 2.4 m at `layout.CIRCLE`). Walk-through props do not block. |
| `buildings[i]` (`house-0..14`) | `layout.houses[i]` | `footprint` = tile-quantised AABB of the placed outline. `door` = `houses[i].door` (tile in front of the real door). `doorNormal` = `houses[i].doorNormal` (new optional field, §2.4). `name`, `houseIndex` unchanged. |
| `clocktower` | `layout.clocktower` | Landmark collision only, as in v2. |
| `circle` | `layout.CIRCLE` | `{cx:360, cy:316, rx:100, ry:100, startDeg:0, sweepDeg:360, stones:15}` (new optional `stones`). |
| `square` | `layout.SQUARE` | `{cx:360, cy:364, r:144}`. |
| `playerSpawn` | `(22,27)` | Unchanged. |
| `storytellerSpawn` | **moved** to `(22,23)` | Feet at y = 23.875 m, 4.1 m from the centre: outside the dais, inside the seat ring. v2 `(22,20)` is inside the dais. Q8 may change this (walkable stage). |
| `streetlights` | `layout.streetlights` | Unchanged meaning. |
| `interiors[i]` | §2.3 | `interior` rect, `interiorDoor`, `bed`, `visitPoint`, blocked tiles. |
| `npcHomes` | the game's list (`TownScene.ts:1421-1451`) re-checked against the new collision | Moved to the nearest free outdoor tile if blocked. |
| `meta.wallError` | per house `{x, z}` m | The §2.3 quantisation error, for review. |
| `meta.*` (WP5a) | `occl` (vendor `?occl=1` stat), `hidden` / `hiddenKept` / `hiddenSoft`, `pockets`, `openedDoors`, `interiorPockets`, `outlines` (placed corners), `doorPoints`, `rooms`, `interiorFreeTiles` | Review data and the inputs of the assets tests. |

**Collision rules as built (WP5a, §11).** Beyond "feet point inside a walk shape" the exporter applies, in order:
(a) a solid prop whose shape covers no feet point at all (lamp posts r 0.17, signposts, stumps) blocks the tile its
centre is in; (d) a door tile blocked only by blocking ground / the map border is opened (house-12's SE chamfer door
opens onto the west border column, inside the vendor's carved door corridor); (b) a tile where a character is hidden
from the gameplay camera (yaw 0, pitch 30°) is blocked: rays from the feet (5 cm) **and** the head (1.2 m) toward the
camera both hit the hard geometry of a cottage or the tower (walls, roofs, glass, signs; tree canopies and `-soft`
dressing such as house-11's oak crown do not count and are listed in `meta.hiddenSoft`), except a door's only approach
(`meta.hiddenKept`, empty at the baseline); blocking ground always stays solid even where a door corridor carved its
box (house-9's doorstep row 42); (c) walkable outdoor pockets the spawn cannot reach, and interior floor the interior
door cannot reach, are blocked. Interiors: a tile is free iff its feet point maps strictly inside the 3D floor and
outside every non-wall collider; `bed` / `visitPoint` are the nearest reachable free tiles to the 3D points (never the
interior door tile, never each other). At the vendor baseline: 137 hidden tiles blocked, 70 under canopies, 29 pockets,
13 centre tiles; interior free tiles 26-44 per room.

`packages/assets/src/hollowmere/layoutV3.ts` turns the JSON into a `TownLayout` and a v2-shaped `townMapV3`
(§2.5). It is exported **only** from the subpath `@ct/assets/hollowmere` (`townLayoutV3`, `townMapV3`), never from the
package index, so it never lands in a static chunk. `@ct/assets` index exports a pure `layoutFor(world, v3?)` helper.

**Assets tests** (`packages/assets/test/hollowmere.test.ts`):

- `collision.length === widthTiles·heightTiles`, `ground.length === heightTiles`, every row `widthTiles` long.
- Every interior rect lies outside `townBounds` and inside the map; interior rects are pairwise disjoint with ≥ 1
  free column between bands.
- No walkable outdoor tile is hidden at the gameplay camera. As built (WP5a): the exporter ray-casts the real geometry
  (rule (b) above) and blocks hidden tiles; the test checks every `meta.hidden` tile is blocked, every `meta.hiddenKept`
  tile is a door approach, the back lane stays solid, and the exported `meta.occl` (`town.js` `?occl=1` statistic)
  lies behind each cottage. (The literal "south of the occluding ground line" wording was dropped: `occl` is the
  *northern* limit of what a cottage hides, so every walkable tile north of it would have failed.)
- vendorHash fresh; every v3 door reachable from spawn; door ranges disjoint; seats walkable for n = 5..15; spawns
  not blocked and not on the dais; interior bed/visit reachable; house-3 room fits its band (below).

### 2.3 Transforms (`apps/client/src/game3d/coords.ts`, the single implementation)

**Outdoors** (location `'outdoors'`):

```
metres:  X = x_px / 16        Z = y_px / 16        Y = ground.heightAt(X, Z)
px:      x_px = X * 16        y_px = Z * 16
```

- The y-down px axis is +Z (south). pixel3d "south" faces +Z (`layout.js` header), so there are no flips.
- A tile's feet point is (tx+0.5, ty+0.875) m.
- Facing: `down` = +Z, `up` = −Z, `right` = +X, `left` = −X. Visual facing comes from the velocity (8 directions, as
  v2 `dir8`), applied automatically by `ch.drive` (§4).

**Interiors** (`bld:house-i`):

- **Server side.** Band room `R_i = {x: 47 + (i%5)·13, y: 1 + floor(i/5)·14, w: 12, h: 12}` tiles. Stride 13 keeps one
  free column between bands (v2 uses w 11 / stride 12, `packages/assets/src/layout.ts:336`). Rows 1..41 ≤ 43.
- **3D side.** Room `i` has origin `O_i = originOf(i) = (200 + 30i, 0, 20) + INTERIOR_TIE`
  (`src/town/interiors/index.js originOf`) and a per-house `ROOM.w × ROOM.d` (`house-*.js` `export const ROOM`, wall
  thickness `T = 0.3`, `doorW = 1.1`, `src/town/interiors/kit.js Room`):

  | house | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | w × d (m) | 6.6×6.6 | 8.6×6.2 | 9×6.4 | **10×6.0** | 8.6×6.0 | 9×6 | 9×6 | 7.6×5.6 | 8.4×5.6 | 9.4×6 | 8×5.4 | 8×6 | 6.4×5.0 | 9×6.2 | 9×6 |
  | x wall error (m) | 0.2 | 0.2 | 0 | 0.5 | 0.2 | 0 | 0 | 0.3 | 0.3 | 0.2 | 0.5 | 0.5 | 0.3 | 0 | 0 |

- The mapping is a pure **translation**, 1 m = 16 px (walking speed and radii as outdoors):

  ```
  X = O_i.x + (x_px - A_i.x) / 16        Z = O_i.z + (y_px - A_i.y) / 16
  ```

- **Anchor.** The doorway is centred at room-local x = 0 (`kit.js` front-wall opening), its gap centre at z =
  `RD/2 + RT/2`. The doorway tile is `D_i = (R_i.x + 6, R_i.y + 11)` (bottom row, as v2 `paintRoom`,
  `layout.ts:394-398`). `A_i` is chosen so the doorway centre maps onto `D_i`'s tile centre:
  `A_i = ((D_i.x + 0.5)·16, (D_i.y + 0.5)·16 − (RD/2 + RT/2)·16)`. Floor edges then fall where they fall; the error is
  `|frac(0.5 + RW/2)|` to the nearest tile edge (table above, ≤ 0.5 m) and is stored in `meta.wallError`.
  House-3 (10 m) uses floor tiles x 2..10 of its band and walls at tiles 1 and 11 (partially floor, blocked): it
  fits with no slack; a test pins it.
- **Collision for `R_i`:** all tiles blocked except those whose feet point maps inside the 3D floor and outside every
  furniture collider (`buildInterior(...).collision` / `built.colliders`, `src/town/interiors/index.js`).
- **`interiorDoor`** = the tile containing the 3D `spawn` (`collision.nearestFree(origin.x, origin.z + RD/2 − 0.65)`),
  which is `D_i.y − 1`, the tile **above** the doorway, matching v2 (`layout.ts` "Spawn = interiorDoor (just above the
  doorway)", `apps/client/src/game/interior.ts:23-31` `doorwayPx = interiorDoor.y + 1.5`). The 3D `exit` point lies
  in the doorway gap itself (`W(0, RD/2 + RT·0.5)`) and maps to `D_i`, which is blocked with code `D`, so
  `pushesOut`/`ExitGate` work unchanged.
- `bed` / `visitPoint` = the tiles of the 3D `bed` / `visit` points, moved to the nearest free tile if blocked.
- **No display clamp.** The 3D avatar is drawn exactly at its px position for every viewer (own and remote); the
  quantised collision is the truth (error ≤ 0.5 m, Q5). A clamp applied only to one's own avatar would desync
  overlays and other viewers.

### 2.4 Server / protocol changes (all additive; v2 rooms unchanged)

| Change | Where | Owner |
|---|---|---|
| `BuildingDef.doorNormal?: [number, number]` and `TownLayout.circle.stones?: number` | `packages/protocol/src/world.ts:10-63` | lead (WP0) |
| `circleSpots`: when `stones` is set, seat `s` (sorted index `k` of `n`) uses stone `round(k·stones/n) % stones` at `θ = 2π·stone/stones` instead of `2π·k/n`. Spiral search unchanged. | `world.ts:230-270` | lead (WP0) |
| `CreateLobbyRequest.world?: 'v2' \| 'v3'` (default `'v2'` until C3), carried through the directory `init` into `GameRoom.settings.world`, and `LobbyRoomView.world`. **Immutable after creation**: `lobby:settings` (`GameRoom.ts:724-760`) has no `world` field. | `packages/protocol/src/lobby.ts:61-70`, `apps/server/src/directory/**`, `GameRoom.ts:225-240` | lead (protocol) + lobby-auth (WP0) |
| `RoomHost.layout(): TownLayout` (= `layoutFor(settings.world, townLayoutV3)`). Modules read `host.layout()` at creation; **factory signatures stay `(host)`** (`services.ts:57` `moduleFactories`, `rooms/testkit.ts fakeModules`). `createWorldModule(host, {layout: host.layout()})` etc. | `GameRoom.ts:1020-1027` `createModules` (runs at `:261` and on rematch `:926`), `world/index.ts:141-148`, `social/index.ts`, `voice/index.ts`, `game/index.ts` | lobby-auth (WP0), module owners sign off |
| Client: modules that import `townLayout` statically switch to `currentLayout()` from `apps/client/src/net/layout.ts` | list below | WP0 (v3-lead acts for each owner, §8) |
| `tests/support/bot.ts` and `tests/e2e/helpers.ts` take the layout from the room's world | tests | qa (WP7) |

**Why immutable.** Players walk the town in `waiting`, and world/voice/social modules are built once per match
(`createModules`). A mid-lobby world switch would need all modules rebuilt and every entity respawned. Choosing the
world at creation avoids that. (Q9 asks whether the host needs to change it later; then the option is "allowed only
while WAITING, rebuild modules, teleport everyone with reason `'spawn'`, clients remount".)

**Server (WP0).** `apps/server/src/rooms/worldLayout.ts` (`worldAvailable`, `layoutForWorld`) is the single place that maps
a world to its layout. While its `V3_LAYOUT` is null, `worldAvailable('v3')` is false: the directory answers
`POST /api/lobbies {world:'v3'}` with 409 `conflict` ("The v3 town is not available on this server yet") and no room is
created. Since WP5a, `V3_LAYOUT = townLayoutV3` (static server import) and v3 lobbies are created (201). `GameRoom` resolves `this.layout` once in `onCreate`, `host.layout()` returns it, and `createModules`
passes it to the default game/world/voice/social factories (injected test factories keep `(host)`). The lobby summary and
every `lobby:view` carry `world`.

**Layout loading (client).** `net/layout.ts`:

```ts
export async function ensureLayout(world: 'v2' | 'v3'): Promise<void>   // v3: await import('@ct/assets/hollowmere')
export function currentLayout(): TownLayout                              // synchronous; townLayout until ensureLayout('v3') resolved
```

`LobbyRoute` awaits `ensureLayout(lobbyView.world)` before mounting `GameScreen`. Every consumer stays synchronous.
Consumers that switch to `currentLayout()`: `GameScreen.tsx`, `gameplay/index.ts`, `gameplay/doorTags.ts`,
`sound/areas.ts` (its module-level `const tb = townLayout.townBounds` at `:76` becomes a function), `sound/world.ts`,
`ui/chat/index.tsx`, `ui/hud/hints.tsx`, `ui/storyteller/{script,stage}.tsx`, and `TownScene.ts` (WP5b).

**Movement, doors, visibility, voice zones.** Data-driven; no other server change.

- `DOOR_RANGE_PX = 22` (server) and the client trigger of 20 px stay.
- WP5a's tests show every v3 door tile is reachable and door ranges do not overlap
  (`packages/assets/test/navigation.test.ts`, parameterised by layout).

**Speed** is open question Q1 (§4 "Speed"). The server keeps `PLAYER_SPEED = 150 px/s` until the user decides.

### 2.5 Classic 2D in a v3 world (WP5b, phase 1)

`TownScene` is far from layout-agnostic today. WP5b (v3-world acting for world-art) delivers:

- **Generated Classic data.** An `assets:generate` pass (`packages/assets` generator) that emits
  `generated/town-v3.json` (Tiled map, 112×43, ground + door object layers from `townMapV3`) and
  `generated/square-props-v3.json` `meta.houses` (boarded/unlit overlays, door glow, board and smoke anchors in v3
  world px). Today `TownScene.ts:454` loads `townJsonUrl` (v2 `generated/town.json`), `setupDoors` (`:870-885`) reads
  the map's object layers, and the overlay anchors are absolute v2 px (`TownScene.ts:131-145`).
- **Per-instance layout state.** `L`, `TS`, `TOWN` (`:56-58`), `SQUARE_VIEW` (`:72`, from `PLAZA`), the NPC homes
  (`:1421-1451`) and every other module-level layout-derived constant become fields set in `init()` from
  `currentLayout()`. A page can leave a v2 lobby and join a v3 lobby without reloading.
- **Door inward** = `−doorNormal` when present, else the v2 footprint rule (`:879`). This rule lives in
  `game/rules/doors.ts` (WP0 extraction) and is shared with the 3D auto-enter.
- Rotated houses drawn axis-aligned at their placed AABB with their v2 sprite; door mat and door tile at the real
  door tile.
- It must stay **correct** (collision, doors, seats are the server's data); the look is reviewed before C3 (Q7).

**As built (WP5b).**

- **Generator.** `pnpm assets:generate` ends with a v3 pass, `packages/assets/scripts/v3/classic.ts`, run in its own
  process (`scripts/ground.ts` derives its tables at import time from `scripts/lib/world.ts`, which picks the v3 world
  when `CT_ASSETS_WORLD=v3`). It writes `generated/terrain-v3.{png,webp}` (the v3 ground painted by the v2 ground
  painter, 4097 unique tiles), `generated/town-v3.json` (112 × 43; ground / decor / collision layers, the collision
  layer = `townLayoutV3.collision` exactly; objects; map properties `world`, `townBounds`, `square`, `plaza`,
  `npcHomes`), `generated/square-props-v3.json` (`meta.houses` in v3 world px; frames = the v2 `square-props.*` atlas)
  and `generated/objects-v3.{png,webp,json}` (the few v3-only sprites). The v2 outputs are byte-identical (checked:
  sha256 of every `generated/*` file before/after a full run). `--review` also writes `.review/town-v3.png` and
  `.review/interiors-v3.png`.
- **Placement** (`scripts/v3/placement.ts`, pure). Each cottage is drawn with **its own v2 sprite** (same id, same
  facing), shifted by `v3 door − v2 door` (tiles), so the sprite's door is the real v3 door tile; door swing, boarded
  planks, unlit windows, door glow, board and chimney anchors move with it. Exception `GENERIC_SOUTH = {house-12}`:
  its v3 door opens onto the west map edge (normal (0.34, 0.94)), where the east-facing v2 sprite would sit entirely at
  x < 0, so it is drawn as a generic south-facing cottage in its own v2 style (frames `*_house-12@v3` in
  `objects-v3.*`, overlays carry `atlas: 'objects-v3'`). The clock tower keeps its sprite at the v3 footprint.
  Outdoor props are the v3 map objects with v2 sprites (`flowerbarrel` → `barrel`). The v3 rooms have no furniture
  objects, so every floor tile the v3 collision blocks inside a room gets a piece of v2 furniture (the bed next to
  the bed spot first; decoration only, never collision): no invisible walls.
- **TownScene.** `init()` reads `currentWorld()` / `currentLayout()`; `L`, `TS`, `TOWN`, `PLAZA`, `SQUARE_VIEW`,
  `FX_HOUSES` and the NPC homes are instance fields; `preload` picks the v3 files in a v3 lobby
  (`@ct/assets/runtime-v3`, imported only by the lazy Classic chunk); `create` checks the map's `world` and size
  against the layout (a mismatch throws). Door spots keep the server building but carry the **drawn** footprint
  (taps, boards, planks follow the sprite); `doorInward` = `−doorNormal` (rules/doors.ts). Pigeons / cat read the
  fountain / benches from the map's object layer (same values in v2). `createBoardTokenLayer` takes the world's
  `houses` (board slots per world). New Classic-only debug member `__ctCamera.town()` →
  `{world, widthTiles, heightTiles, mapWidth}`.
- **Tests.** `packages/assets/test/classicV3.test.ts` (15: map = layout, atlases WebP == PNG, sprite doors on v3
  doors, overlays shifted, furniture covers every blocked floor tile and never a free one, freshness of the furniture
  list), `apps/client/test/boards.houses.v3.test.ts` (board slots per world), e2e `tests/e2e/classic-in-v3.spec.ts`
  (all 15 cottages entered by tapping, v2 → v3 lobby in one page without reload, Q7 screenshots in
  `test-results/classic-v3/`).

---

## 3. Per-feature mapping (v2 → v3)

Owners: **WP0s** core splits, **WP1** core (net/input/camera/debug), **WP2** avatars, **WP3** town stage, **WP4**
overlay, **WP5** world data, **WP6** DOM UI.

| v2 feature (where) | v3 approach | Owner |
|---|---|---|
| Own avatar + prediction (`stepLocal` `TownScene.ts:1756-1838`, `sendMove` `1840-1847`, `onTeleport` `1149-1166`) | Extracted `rules/stepLocal.ts`: px, tile collision, 15 Hz moves, seq fencing, snap on correction. A teleport with reason ≠ `correction` cross-fades a 120 ms "poof". | WP1 (logic), WP2 (avatar) |
| `localPlayer` / `remoteEntities` writers (`publishLocal` `1855-1871`, `stepRemotes` `1907-1912`) | Written by `net/` in v2 px, same throttle (`LOCAL_PUBLISH_MS` 100). | WP1 |
| Remote avatars (`stepRemotes`) | Extracted interpolator (110 ms delay, 600 ms stale, ST jump > 48 px → poof). Visible only on the same `location`. | WP1 (logic), WP2 (draw) |
| Server-driven walk/freeze, door overrides, door-tag publish (`gameplay/index.ts createGameplayLayer(scene: Phaser.Scene, ctx)` `:109`; `doorOverride` `:466-469`, `publishDoorTags` `:127`) | WP0s splits `gameplay/index.ts` into `gameplay/core.ts` (renderer-free: `SelfDriver`, `doorOverride`/`doorOverrideVersion`, `publishDoorTags`, the `gameplayState` writer) and `gameplay/phaserView.ts` (markers, vote clock, hands, hints). v3 uses the core directly. | WP0s, then WP1 |
| Tap-to-walk routes (`goTo` `TownScene.ts:1062`, `interiorTapTarget`/`interiorRoute` `1036-1043`, `game/path.ts`) | Same functions on px from `screenToWorld`. | WP1 |
| Escape leaves an interior (`TownScene.ts:573`) | Same rule in `input/keys.ts` (not while `stagePick` is active). | WP1 |
| Server `sound` events + door cue (`conn.events.on('sound', playCue)` `:554`, `playCue('door')` `:1160`) | `net/` subscribes and calls `game/audio.ts playCue`; these live in TownScene, not `sound/**`. | WP1 |
| Doors enter/leave (`enter` `941-954`, `leave` `956-967`, auto-enter `981-996`, `ExitGate`) | Extracted rules (inward from `doorNormal`). Visual: `registry.get('house-N').api.setDoor(f)` opens over 300 ms on a `door` teleport and when a remote enters. | WP1 (rules), WP3 (door art) |
| Boarded-up empty cottages, unlit windows (`houseInUse` `920-924`, overlays `1312-1376`, door glow `1503`) | Unused house (public seat count): its `api.setLit(false)` + a door-plank prop (built once per house at town build, toggled `visible`, no new programs). | WP3 |
| Interiors (`interior.ts`, `InsidePanel`) | On `location` → `bld:house-i`: lazily `buildInterior(engine,'house-i',{tod})` (25-50 ms, vendor INTERIORS.md), park the town graph (hide + skip updaters, reimplementing the demo's private `createTownPark`, `src/demo/main.js`), camera `interior` preset. Lights: the time facade's `player.interior` (§3.1) re-aims the constant pool via the same path as `aimLights` (interiors never create PointLights, `interiors/index.js` header). Cache ≤ 2 interiors, dispose the rest. `setInside` unchanged. | WP3 |
| Camera (`fitCamera`/`updateCamera` `1620-1654, 1726-1754`) | `applyCamera(engine,'gameplay',{focus})` (`src/town/api.js applyCamera`). Outdoors: rest on the square; outside it, lean 0.85 toward the player, smoothed `1−e^(−5dt)`, focus snapped via `PixelCamera.snapWorld`. `viewHeight` from the zoom ladder, default 12. No yaw rotation in v1 (Q2). | WP1 |
| Day/night/time from game state (`TownScene.ts:1955-1957`) | §3.1. | WP3 |
| Clock (tower dial `1678-1723`, `ClockChip`) | Tower driven only by the §3.1 hour through the gated api (§3.1). Bell at phase changes only. `ClockChip` DOM unchanged. | WP3 |
| Phases, dais, nominee, votes, seats | §3.2. Raised hands = avatar `vote` emote held / released. No demo folk figures, no scripted `CEREMONY`. | WP3 (dais), WP2 (vote clip) |
| Seat markers (own spot pulsing), vote hand, raised-hand outlines, bedtime/gathering hint arrows (`gameplay/index.ts` header `:5-11`) | DOM/overlay views over `gameplay/core.ts` state: seat markers on the ground at `circleSpots`, own spot pulsing; hint arrows anchored at screen edge toward the door/seat. | WP4 |
| Ghosts, deaths | §4 "Ghosts". | WP2 |
| Carried lanterns (lantern cast + ST at night, `TownScene.ts:276-278, 2015`) | A lantern prop on the hand bone + one light **taken from the constant pool** (re-aimed, not added), so the light count and programs never change. | WP2 (prop) + WP3 (pool) |
| ST visits / teleports (`handleTap` `1027-1033`) | Same command sends; taps resolve via §3 "ST taps". | WP1 |
| Talking outline (`fx/talking.ts`) | pixel3d `createTalkOutline` once published [unpublished, Q6]. Interim: additive emissive rim on talking handles + the DOM wave glyph over `anchorOf(pid).headTopCss`. Respect `readTalkOutlineMode()`. | WP4 |
| Name labels | Interim DOM labels (Preact, escaped) at `headTopCss`, tokens from `kit.json meta.tokens`. Later `L.world` labels [unpublished, Q6]. | WP4 |
| Chat bubbles (`social/bubbles.ts`, `speech.ts`) | Reuse `SpeechBook`, `wrapLines`, `stackBubbles`, `bubbleDurationMs` with a DOM renderer; `bubble_nine`/`bubble_tail` from `v3/assets/ui/indicators.png` as a 9-slice. | WP4 |
| Pins / points / emotes / pie (`social/index.ts createSocialLayer(scene: Phaser.Scene, ctx)` `:151`) | WP0s splits `social/index.ts` into `social/controller.ts` (gesture input, rate buckets, optimistic pins model, emote/point sends) and `social/phaserView.ts`. v3 adds `overlay/socialView.ts` over the controller, with a `SocialCtx` built from `View3d` + `AvatarRegistry`. Pins/fingers are DOM sprites from `markers.png`. | WP0s, then WP4 |
| Board tokens / door tags (`gameplay/boardTokens.ts`, `doorTags.ts`) | Pure exports (`tokenGrid`, `fitBoard`, `boardSize`, `hitToken`…; Phaser is a type-only import) reused; DOM boards at door point + `doorNormal`·0.6 m, height 1.6 m. `createBoardTokenLayer` (`:450`) stays Phaser-only. | WP4 |
| House names (`gameplay/houseNames.ts`) | Reuse `houseOwners`/`fitName`; DOM callouts at the placed centre, roof height. | WP4 |
| ST pick (`gameplay/pick.ts`, `stagePick`) | DOM crosshair following the pointer. Click → `screenToWorld` → `onPick(x,y)` px; Escape cancels. | WP1 |
| NPCs (`npcRoaming.ts`, homes) | `createNpcRoamer` on `npcHomes` (§2.2), **including its Brianbi avoidance** (`hd-cast.spec.ts:100-110`). Drawn with `npc-*` specs. `__ctCamera.npcs()` unchanged shape. | WP2 |
| Ambience (fireflies, pigeons, smoke `1411-1590`) | pixel3d `life` piece restricted to non-misleading systems (§3.1 "Life"). Client-only. Off at `low` if over budget. | WP3 |
| Sound areas (`sound/**`) | Unchanged logic over px stores; `currentLayout()`. | WP0 |
| Render tier (`fx/tier.ts`, `fx/quality.ts`) | `ct.fxQuality` `low` → town `quality=low`; else `high` (subject to §1.2 row 9). A tier change = new Engine (§1.3 "Rebuild", ≈ 3 s, "Rebuilding town…" overlay, safe moment only), never a reload. | WP1 + WP3 |
| Letterbox / area mask | Not needed (only the current area is drawn). | — |
| Touch joystick (`GameScreen.tsx:406-410`) | Unchanged: `input/keys.ts` reads window `keydown/keyup` by `e.code`. | WP1 |

**ST taps / `screenToWorld`** (WP1). A ground-plane ray cannot hit buildings: at pitch 30° a click on a cottage roof
(ridge ≈ 4.7 m) lands ≈ 8 m north, behind the house. Two-stage pick:

1. Ray (§1.5 inverse) against per-house proxy boxes (`src/town/town.js houseBox(rec, top)` / `rayHitsBox`). Nearest
   hit → `{x, y} = the house's door tile centre px, location 'outdoors', houseId}`.
2. Else intersect the ground plane (`Y = ground.heightAt` refined by 2 iterations) → px.

Unit cases: a roof click returns that house's door; a click on the lane in front returns the lane tile.

### 3.1 Time of day, clock tower and life (client only; no server change)

**Phase → hour.** `p` is the stage progress from `game.clock` (`DayClockView`, `packages/protocol/src/clock.ts:32-43`):

```
p = clock == null            ? 0
  : clock.paused             ? clamp01(1 − clock.remainingMs / clock.totalMs)
  : clock.endsAt != null     ? clamp01(1 − (clock.endsAt − serverNow()) / clock.totalMs)   // net/serverTime.ts:14
  : 0
```

With no clock (human-Storyteller games often run without one), the hour holds the stage's start hour.

| Phase / stage | Hour |
|---|---|
| waiting, setup | 10:00 |
| day: discussion | 11:00 + 4·p (→ 15:00) |
| day: nominations | 15:00 + 3·p (→ 18:00) |
| bedtime | 18:30 + 1.25·p (→ 19:45 dusk) |
| first_night, night | 23:00 fixed |
| dawn (no clock stage) | 06:15 → 08:00 by a fixed client-side 20 s ease from phase entry |
| finished | 12:30 |

Hour changes > 1 h in one frame use a 1.5 s ease; `reducedMotion` makes them instant. Unit test cases: paused,
running (`endsAt`), no clock, dawn ease, finished.

**Time facade** (`game3d/vendor/time.ts`). We reuse `src/demo/time.js createTime(demo)` (the look interpolator:
sun, ramps, fog, lights on in order, constant light pool) through a facade `demo` object, because reimplementing it is
≈ 700 lines. Facade contents:

- `engine`, `town` (the `buildTown` result), `layout` (vendor `layout.js`), `params = new URLSearchParams('folk=0')`
  (no seated folk).
- `store`: `state = {timeOfDay, timeSpeed: 0, paused: true, phase: 'day', nominee: null, seats: 15 × {occupied:false},
  life: true, quality, camera: 'follow'}`; `on(key, fn) → unsubscribe`; `set(patch, source)` that notifies listeners;
  `setSeat` no-op. **`phase`, `nominee` and `seats` never change**, so `createTime` never writes the dais after its
  initial apply; §3.2 drives the dais directly. We advance the clock by `store.set({timeOfDay: hour}, 'game')` when
  the §3.1 hour moves by ≥ 1 game minute (each write is a `jumpTo`-style jump: no auto-bell; the look re-derives).
- `input = { bind: () => () => {} }` (no global B/T/./,/N/V/P/L keys).
- `events = { emit() {}, on(name, fn) { … } }`: we emit `'ready'` after the warm-up (enables the fog pass).
- `player = { get position() /* own avatar metres */, get interior() /* current built interior or null */ }`: drives
  the light-pool aim outdoors and the interior re-aim.
- `reload` = request a tier rebuild (§1.3), never a page reload.
- `createTime` gates the tower api (`tower.setTime`/`ring` only pass its own calls, `time.js` TOWER header), so
  `life`'s scripted clock is muted. `ringBell()` is called by WP3 at phase changes only.
- If a re-publish breaks the facade: CONTRACT-REQUEST "export the look interpolator (`applyHours`) with an external
  clock" (§9.2), and drive the hour directly.

**Order of construction** (WP3, `world/stage.ts`): `vendor/town.ts buildTown` (grass area, `strict: 'all'`, life
params below) → `installRuntimeOpts` port → `createTime(facade)` (tops the light pool up to 12 high / 8 low **before**
the warm-up, `time.js` LIGHTS header) → avatars' first builds → shader warm-up over the whole town (the demo's
`warmWholeTown` sequence) → `events.emit('ready')` → first show.

**Life.** The `life` piece (`src/town/life/index.js build`) runs its own demo simulation every frame: a scripted clock
from 11:58 that sets the tower time and rings (`clockApi.setTime`/`ring`; muted by `createTime`'s gate), house doors
swinging for scripted walkers (`doorDrivers`), its own light cycle (`createCycle`), walkers, ambient townsfolk and bench
folk. In a social-deduction game a door opening by itself or a bell from fake data misleads players and fights our
`setDoor`/`setTime`. `vendor/town.ts` builds with:

```
demo=day   lifeOff=walkers,doors,folk,cycle,ambient
```

Kept: smoke, crows, cats, bugs (fireflies/moths), fountain, leaves, wind. The harness asserts after 60 s that
`life` stats report `walkers: 0, doors: 0, folk: false, ambient: false, benchFolk: false` and that no house door
pivot moved without a game `setDoor`.

### 3.2 Dais and vote (WP3)

- `dais.setSeat(stone, {occupied, dead, ghostVote, nominated, onBlock, voteHand})` from `players[]` +
  `day.nominations[last]` (`packages/protocol/src/game.ts:72-97`). Stone index = the server's
  `round(k·15/n) % 15` rule (§2.4).
- Units: the dais `setPhase('vote', {from, t0, perSeat})` takes `t0` in **engine seconds** and `perSeat` in
  **seconds** (`src/demo/time.js applyPhase` uses 0.55), and its sweep visits all 15 stones
  (`src/town/pieces/dais.js voteProgress`, `k` up to `N = 15`), while `NominationView.stepMs` is **ms per occupied
  voter** (`game.ts:87`). We do not use the auto-sweep:
  - `setPhase('vote', {from: nomineeStone, t0: -1e9, perSeat: 1})`: `t0` in the past makes `voteProgress` return
    `k = 15`, so every stone whose `voteHand` we set lights (a future `t0` would hide all vote lamps, `dais.js` level
    loop `voted && off <= vp.k`).
  - `setHand(stoneOf(currentVoterSeat))` each change (`game.ts:80`); `setHand(null)` when not voting.
  - `voteHand` is set per seat only once that voter's vote is resolved in the game view.
- `setNight(hour is dark)` follows the §3.1 hour.
- Unit test (`world/dais.test.ts`): fixture `PlayerGameView`s for n = 5, 9, 15 → expected `setSeat`/`setHand` calls.

---

## 4. Characters

**Mapping.** The v2 cast id (`packages/assets/src/cast.ts:26-60`, **33 entries**) maps 1:1 to the pixel3d spec id
(`v3/pixel3d/characters/<id>.js`; that directory has 37 modules: the 32 cast specs other than brianbi plus
`wanderer`, `keeper`, `hound`, `duelist`, `mannequin`). Resolver: `game3d/avatars/castMap.ts`, built from a
**per-spec capability probe** after `loadSpec`:

```ts
castMap(id): { spec: string | null; fallback: 'billboard' | 'standin' | null; ghost: 'shared' | 'clips' | 'tint' }
```

| v2 ids | 3D status (`demo/roster.json`) | Game behaviour |
|---|---|---|
| frog, mushroom, fox, owl, crow, moth, goat, skeleton-chef, rabbit, mole, snail, toad, green-hood, honk, chonk, polly, clarabelle, requin, progress, preservation, opal, cilantro, mincut (23) | shipped | 3D spec |
| maxflow, theo-rem, greenting, storyteller, npc-sweeper, npc-vendor, npc-elder, npc-porter (8) | wip (load, idle, walk) | 3D spec; WP2 smoke-tests load/idle/walk/vote, on failure → stand-in |
| nicksong | wip, user-skipped | **billboard** from v2 `cast.png` frames (no `v3/assets/sprites/nicksong` bake). Q3. |
| brianbi | no 3D (v2 HD import) | **billboard** from v2 `cast-hd` frames |
| unknown / load error | — | **stand-in** = `wanderer`, tinted with the member's pin colour |

**Ghosts.** `ch.ghost = 1|2` only has an effect when the spec has the shared `spec.ghost` block
(`src/chars/character.js` `const gLv = this.spec.ghost ? this._ghostLevel(...) : 0`; vendor CHARACTERS.md). Probe
result (vendor baseline):

| ghost mode | specs (**measured** at the vendor baseline by `avatars.castMap.test.ts`, WP2) | v3 behaviour while dead |
|---|---|---|
| `shared` (`spec.ghost` present) | cilantro, clarabelle, greenting, maxflow, mincut, opal, preservation, progress, requin, theo-rem, npc-sweeper, npc-vendor, npc-elder, npc-porter | `ch.ghost = ghostVoteAvailable ? 1 : 2`; works walking and idle. |
| `clips` (own `ghost`/`ghost-spent` loop clips, no `spec.ghost`) | chonk, crow, fox, frog, goat, green-hood, honk, mole, moth, mushroom, owl, polly, rabbit, skeleton-chef, snail, toad | Loop clips replace idle only, so a walking ghost would look alive. While dead: hold the loop clip (`ghost`, or `ghost-spent` once the ghost vote is used) and **slide**: the vendor Character stays where the slide began (its gait never leaves idle) and the avatar's holder group carries the motion (`vendor/characters.ts createDriver().setSlide`), plus the `tint` wrapper below at 50 % (dither alpha 0.8). A revival rebuilds the body. |
| `tint` (neither) | storyteller, wanderer (stand-in), nicksong + brianbi (billboards) | `avatars/ghostTint.ts`: a material wrapper on every avatar material (pale ramp + an ordered-dither alpha 0.6 + 0.15 m hover), added via `onBeforeCompile` **at build time for every handle** (uniforms toggled, so no recompiles on death). Billboards use the v2 ghost frames when they exist (`brianbi/ghost*` in cast-hd, `nicksong/ghost*` in cast-ghosts) with a light tint. |

The table replaces revision 2's (written before the vendor's wave-3 ghost work moved 10 specs to `shared` and 8 to
`clips`). `castMap` always prefers the live probe (`specCapsOf` after `loadSpec`); `GHOST_BASELINE` is only the
pre-load guess and the test's expectation.

CONTRACT-REQUEST (§9.2): add `spec.ghost: {hover}` to the 16 `clips` specs and to storyteller / wanderer, the cheap
shared opt-in (the slide and tint workarounds then disappear for them).

**Deaths.** Alive→dead seen while in view: `play('die')` if `handle.emotes.die` (held 1.5 s) → ghost mode above.
Otherwise straight to the ghost mode.

**Emotes and clips.** `avatars/clips.ts` plays only `handle.emotes[name]` / `handle.emoteClips`
(`src/demo/characters.js createCharacter`: `emotes` maps `talk|vote|point|die|ghost` → clip or null, `emoteClips`
excludes `BANNED` combat clips and locomotion). Fallback chain: `point` → `talk` → `idle`.

**Speed.** There is no "play walk at speed" API: locomotion comes from the velocity of `ch.drive(t => ({pos, face}))`
(`src/chars/character.js drive`), and `LegGait` scales the cycle with `v / walkSpeed` and switches to run at `runAt`
(`src/chars/locomotion.js`). `avatars/` feeds positions through `drive()` and leaves the gait alone. The vendor defines
the game speed: `handle.gameSpeed` ("cast members: THE game speed (4 H/s)"), e.g. frog `V_GAME = 3.95·1.2 = 4.74 m/s`,
commented "v2 150 px/s on a 38 px sprite" (`characters/frog.js`). The character scale assumes ≈ 32 sprite-px per
metre, while the tile mapping is 16 px per metre: 150 px/s = 9.375 m/s ≈ 2× `gameSpeed` (frog 1.98×). Q1 options:

- (a) v3 worlds only: `PLAYER_SPEED_V3 = 80 px/s` (5 m/s; frog ratio 1.05; most specs 1.0-1.2).
- (b) keep 150 px/s and scale every character ×1.56 to v2's on-tile proportions (changes door, label and pick sizes;
  decide before WP2/WP4 start).
- (c) keep 150 px/s, accept a near-constant run cycle.

**Billboards** (`avatars/billboard.ts`): a camera-facing `THREE.Mesh` quad, height 1.3 m for the full 40 px v2 cell,
anchored at the v2 feet anchor, **8** facings from the v2 frames (walk 1..4 while moving, 0 idle / reduced motion),
one shared texture per sheet (`cast` nearest, `cast-hd` smoothed + mipmaps, `cast-ghosts`), a vendor toon material lit
as up-facing ground (`lightNormal: viewMatrix[1]`) so it takes the time-of-day ramp, on the `COLOR_ONLY` layer (no
outline pass, no shadow; the vendor toon normal pass would otherwise write the quad's normal). All billboards share one
program (`ct-avatar-billboard|ct-tint1`). `v3/assets/sprites/<id>.json` bakes (8 directions, `cell [72,84]`,
`anchor [36,61]`, `ppm 36`) would be preferred, but none exist for nicksong or brianbi today. Frame names keep the
v2 format `<key>|<dir8>|<n>` for `__ctCamera.avatar().frame`. Fallback chain for any cast id: its spec rig → the
`wanderer` stand-in tinted with a pid-hashed pin colour (the member's own pin colour is a device-local preference
that never reaches other clients) → its v2 billboard. Every one of the 33 cast ids has v2 sprite art (tested).

**Costs.** Rig build 55-90 ms + 25-40 ms first update (`src/demo/characters.js` header). One character per frame
through a queue, **at most one build in flight** (`avatars/queue.ts`: own player first, then avatars in the viewer's
location by distance, then other players, then townsfolk). Spec modules are preloaded when a member first appears
(`vendor/characters.ts preloadSpecs`; a lobby-time preload needs a dynamic import from the lobby, §8 WP2 notes). At
the `low` tier, characters farther than 12 m from the camera target are moved to the `COLOR_ONLY` layer (skips the
normal pass; the sun's shadow camera only sees layer 0, so no shadow either) — a layer-mask toggle, no program change
— and every rig is built with `fx: false, smears: false`. Spec `lights` (the storyteller's lantern PointLight) are
suppressed before the first update (`suppressSpecLights`): the light count never changes; lanterns borrow a pool light.

**Updates.** `handle.update(t)` every frame, only for handles in the current location.

**As built (WP2).** `avatars/index.ts`: `createAvatarLayer({engine, tier, heightAt?, view?, lights?, self?, npcs?})`
→ a `Layer3d` plus `registry` (`AvatarRegistry`: `anchorOf`, `pidAt`, `debug`), `playEmote(pid, name)` (clips.ts
chain), `setTalking(pid, on)` (holds the `talk` loop), `selfReady()`, `settled()`. Debug members merged into
`__ctCamera`: `avatar(pid)` (§6.1 shape), `npcs()` (v2 shape), `avatars3d()` (per-entry texture / kind / ghost / look,
for smoke tests). Without `view` the layer projects with its own `project.ts fallbackView` (§1.5 maths, canvas rect read
at most once per frame). The own avatar is drawn from `state.me` (the WP0 stub's `wanderer` must then go). Raised
hands come from `NominationView.votes`/`handsRaised` (same rule as `gameplay/core.ts`). NPCs: v3 homes from
`npcHomesV3` (lazy `@ct/assets/hollowmere`), the v2 roamer with its Brianbi avoidance, and in v3 worlds never inside
`inSquare` (the voting circle, user request 2026-10-17). DEV smoke (WP7 may adopt it):
`apps/client/src/game3d/avatars/dev/{smokePage.ts, avatarSmoke.mjs}` (Hollowmere + all 33 cast ids on SwiftShader:
build, walk, vote, every player dead and walking as a ghost, night lanterns, destroy; screenshots to
`test-results/v3-avatars-smoke/`).

---

## 5. HUD / UI

**Adopt now (WP6, DOM only):**

1. **`cast-portraits` strip.** `v3/assets/ui/cast-portraits.{png,json}` is a drop-in for
   `ui/common/castPortrait.ts:20,126` (same `{dir, sheets}` shape). Gate on `world === 'v3'` or renderer v3; keep v2
   for skipped ids (nicksong, brianbi). Walk cadence from `meta.walkStepMs` (67), not the hard-coded 140 ms
   (`:374,419`). Add `<id>/dead` to `castSheetKey` (`:154`).
2. **`portraits` icons and avatars.** `ui/common/v3atlas.ts`: `frame(name) → {url, x, y, w, h, sheetW, sheetH}` over
   `emotes`, `portraits`, `markers` — and their **`-night`** variants (`indicators-night`, `markers-night`,
   `portraits-night`), picked with the same hour rule as the tokens (night ≥ 19:45 or < 06:15).
   `SocialPalette.tsx:51-69` and `PieMenu.tsx:13-31` use it when v3 is active.
3. **`kit.json meta.tokens`** (day/golden/night) mapped onto `theme.css:8-27` variables under
   `[data-graphics="v3"]` in `ui/common/theme-v3.css`, switching with the §3.1 hour (day < 16:00, golden < 19:45,
   else night).
4. **`indicators` `bubble_nine`/`label_*`** for the WP4 bubbles and labels (9-slice via `border-image`, insets from
   `kit.json meta.nineSlice` 3/3/3/4), at `--px = engine.pixelScale`, `image-rendering: pixelated`.

**Loading.** Alias `@v3assets/` → `v3/assets/ui/` (WP0 adds it). PNG and JSON both via `?url` + `fetch` inside a
dynamic `import('./v3atlas')` gated on v3, so `emotes.json` (23 KB), `portraits.json` (38 KB), `kit.json` (35 KB) and
`cast-portraits.json` (11 KB) never inline into `SocialPalette`/`PieMenu`/`castPortrait` chunks. No WebP copies yet.
**CSS.** Every new stylesheet (`overlay/*.css`, `theme-v3.css`) gets a `CSS_ORDER` entry in
`apps/client/build/cssOrder.ts:21`, or `checkCssChunks` fails the build (`:75-83`).

**Wait for the UI-conversion session:** hud/panels/events groups, in-canvas `createUILayers` [unpublished, Q6], the
`social` composite. Until then every v2 DOM component stays and is only re-tokened.

**As built (WP6, `v3-ui`, 2026-10-17).** Files: `ui/common/{v3skin.ts, v3skinLobby.ts, v3atlas.ts, v3portrait.ts,
graphicsStatus.ts}`, v3 branches in `castPortrait.ts`, `ui/social/{SocialPalette,PieMenu}.tsx`, the Graphics row in
`SettingsDialog.tsx`, the Town choice + badges in `ui/lobby/{LobbyFinder,ModeSettings,WaitingRoom}.tsx` + `lobby.css`.
- **Gate = the lobby's world.** `useV3Skin(conn)` (`v3skinLobby.ts`, ref-counted; mounted by `WaitingRoom` and
  `SocialPalette`) turns the skin on for `world: 'v3'` whatever renderer draws the town (Classic in a v3 world gets the
  v3 skin too); v2 lobbies are untouched. While on: `<html data-graphics="v3" data-tod="day|golden|night">` (other
  packages may key CSS on it), and the lazy `v3atlas` chunk is loaded (one retry after 1 s).
- **Hour.** `skinHour()` = the §3.1 table (incl. the 20 s dawn ease, no 1.5 s smoothing: the skin switches whole
  looks); `lookOf()`: day < 16:00, golden < 19:45, else night; `isNightHour()`: ≥ 19:45 or < 06:15 picks the
  `-night` atlases. The store only changes on a look change. WP3's §3.1 implementation may reuse these pure functions.
- **Tokens (item 3) — changed from a stylesheet to CSSOM.** `v3atlas.skin(look)` writes `themeVars(kit tokens)` onto
  `<html>` (`--bg`←shadow, `--panel`←ink+`f5`, `--panel-solid/raised/sunk`←ink/inkRaised/inkSunk, `--border(-strong)`
  ←ironSh/iron, `--text`, `--muted`←textDim, `--ink`←textInk, `--parchment`, `--accent`←gold, `--accent-deep`←goldLine,
  `--good/--evil/--danger/--ok`, plus every token as `--v3-<token>`), so there is **no `theme-v3.css`** and no
  `CSS_ORDER` entry; the values always follow a re-published `kit.json`. `unskin()` removes them on leaving.
- **Panel skin.** The vendor `panels.css` (data: images only; a unit test enforces no `@import`/remote `url()`) is
  linked as-is (`new URL(…)` raw asset, `link[data-ct-css="v3-panels"]`, after the theme) while the skin is on, with
  `--px` = 2 (< 1000 CSS px tall) or 3. Opt-out for debugging: `localStorage['ct.debug.v3panels']='0'`. It is not run
  through Vite's CSS pipeline because the published file has a stray `}` (§9.2); under the `vite` dev server the link
  therefore 404s/500s and the panel skin is missing in dev only. `notebook.css`, `hud`, `events` are **not** wired yet
  (they need markup changes in `ui/notebook/**`, `ui/hud/**` owned by others).
- **Atlases (item 2).** `v3atlas.frame(name, night)` over emotes → portraits → markers → indicators (`-night` for the
  last three; emotes has no night bake, its day sheet serves both). Documented skips that keep v2 art in a v3 lobby:
  `nick_face`, `icon_nicksong`, `icon_brianbi` (and the nicksong / brianbi portraits); every other social frame is v3
  or, while the atlas loads, the emoji/dot fallback (never v2). `PieMenu.tsx useSocialArt()` is the shared lookup.
- **Portraits (item 1).** `castPortrait.ts` takes a pluggable `PortraitAlt` (`setPortraitAlt`); `v3portrait.ts` (in the
  lazy atlas chunk) installs the v3 strip: 'down' frames, `meta.walkStepMs` (67 ms) cadence, `<id>/dead` via
  `castSheetKey(id, ghost, dead)` / `CastPortrait dead`, other directions hold the v3 'down' frame (no v2 mixing).
  Before the chunk lands, portraits in a v3 lobby show the silhouette.
- **9-slices (item 4).** `v3atlas.nineSlice('bubble_nine', px, night)` → CSSOM `border-image` properties (frame cropped
  to a `data:` PNG, insets from `kit.json meta.nineSlice.frame_bubble` 3/3/3/4); `v3atlas.inset(name)` for others.
  WP4 consumes it via `loadV3Atlas()` (`ui/common/v3skin.ts`).
- **Graphics setting.** Settings → Graphics → "Town graphics" `Auto / v3 3D / Classic 2D` (`ct.graphics`); every change
  and "Reset to defaults" call `notifyGraphicsChange()` (GameScreen swaps in place). The status line is
  `graphicsStatus(world, chooseRendererHere(world))`: "This lobby uses the classic town" (v2), "Auto (Classic: too slow
  on this device) [Try v3 again]" (memo: clears it), "v3 graphics stopped last time … [Try v3]" (boot guard: resets it),
  and one line per other row.
- **Town choice (§9.1 user decision).** Create dialog "Town": Classic (v2) / Hollowmere (v3), pre-selected
  `DEFAULT_WORLD = 'v2'` (`ModeSettings.tsx`; C3/Q7 flips it), last pick remembered in `ct.create.world`; sent as
  `CreateLobbyRequest.world`. `WorldBadge` in the finder rows and the waiting-room title. There is no join-by-id preview
  screen in the client today (the share link joins directly), so no badge there.
- **Budgets (measured on the host vs the same tree without WP6, brotli):** entry +0.49 KiB, `LobbyRoute` +1.08 KiB,
  `SettingsDialog` +0.57 KiB, `townParts` +0.16 KiB; new lazy `v3atlas` chunk 3.05 KiB (JSON/PNG/CSS fetched on use).

---


> **Update 2026-10-17 (lead): more UI groups are finished and now in the tree** — wire them into the game (WP6 for
> DOM/Preact chrome, WP4 for in-world overlays, WP3 for the tower clock where relevant):
> `v3/assets/ui/` now has `hud` (+`-night`), `hud-font`, `panels` (+`panels.css`), `events` (+`-night`: game-event
> effects), `notebook` (+`-night`, `notebook.css`), `social` (combined social bake), besides kit/markers/indicators/
> portraits/cast-portraits/emotes. Sources and the contract for each group: `v3/pixel3d/src/ui/{hud,panels,events,notebook}/`,
> `v3/pixel3d/docs/UI.md` (frame names, 9-slices, colour tokens, night variants, CSS classes). These are drop-in
> replacements for the v2 HUD/panels/notebook/event visuals; apply them in v3 lobbies (and as the "v3 skin"), keep v2
> lobbies on the v2 look. Some groups may still change (the UI session is running); re-run `scripts/v3/import-assets.sh`
> and merge `v3-dev` to refresh.

> **Update 2026-10-17 (lead, v3-dev e72038d):** the art demo now runs on the finished UI library — pointer, pins, pie
> menu, labels, HUD, panels, notebook + free-text Notes page, in-world reading book, held/big toggles, phone/touch fixes.
> Reuse its runtime (`v3/pixel3d/src/ui/runtime/*`, how `src/demo/*` mounts it) as the reference for WP4 overlays and
> WP6 chrome instead of re-deriving it; see `v3/pixel3d/docs/UI.md` + UI_GALLERY.md porting notes.

## 6. Hooks, tests, hosting

### 6.1 Debug hooks (keep compatible)

`window.__ctCamera` exists only when `localStorage['ct.debug.camera']==='1'` (contract `TownScene.ts:667-708`).
`game3d/debug/camera.ts` implements it, merging each `Layer3d.debug?()`:

| Member | v3 semantics |
|---|---|
| `worldToScreen(x, y, heightM = 0)` | §1.5 at `Y = ground + heightM`, page CSS px. The optional 3rd argument is new; v2 ignores it. |
| `view()` | `{x, y, width, height}` = px AABB of the ground footprint of the viewport; `zoom` = `cssPerPx()` |
| `me()` | `{x, y, facing, moving, location}` (px) |
| `avatar(pid)` | `{texture: 'v3:<specId>' \| 'v3-billboard:<id>', frame, width, height, x, y, screen: {x, y, w, h}}`. **x/y stay world px (feet)** as in v2 (`sprite.x/y`); width/height = the box in world px; `screen` = the CSS box. `frame` = `<id>\|<dir8>\|<n>` for billboards, `<clip>\|<dir8>\|<n>` for rigs. |
| `bubbles()` | Same shape as v2; box from the DOM bubble rect |
| `doorBoards()` | Same as v2 (`boardTokens.inspect`-shaped per building id) |
| `npcs()` | Same shape (`{id, x, y, home, avoiding}`) |
| **new** `v3()` | `{ready, tier, pixelScale, calls, tris, programs, frameMs: {p50, p95}, gpu, building: string[], life: {walkers, doors, folk}}` |
| **new** `dais()` | `{phase, hand, seats: [{stone, occupied, dead, voteHand}]}` |

- `window.__ctSocial` (opt-in `ct.debug.social`): same members over the v3 social controller.
- `window.__town`: DEV only, `{gview}`.
- **Tap target.** The `<canvas>` lives under `.ct-game-canvas`. DOM overlays use `pointer-events:none`, except
  interactive boards and pins, which forward events to the canvas handler.
- **Specs that need a v3 branch.**
  - `hd-cast.spec.ts:58` expects `texture:'cast-hd', 32×40`; `:63-66` clicks `worldToScreen(p.x, p.y − 18)` for the
    torso; `:76-87` checks frames `brianbi|right|[1-4]`. v3 branch: `texture` starts with `v3-billboard:`, torso via
    `worldToScreen(p.x, p.y, 0.7)`, frame regex unchanged.
  - `helpers.ts` `outdoorCamera`/`tapTargetAt` (v2 fallbacks): under v3 the hook is mandatory and the fallbacks throw.

### 6.2 Tests

- **Unit** (`apps/client/test/game3d/*.test.ts`, vitest, no WebGL): `coords` round-trips (px→m→px exact to 1e-9;
  interior maps for all 15 houses); projection formula vs hand-computed cases at scales 2/3/4 with snapScreen on/off;
  `castMap` covers all 33 `CAST` ids and the ghost-mode table; `select` decision table (all 9 rows, v3force skipping
  rows 3-9); boot guard; perf sampler (hidden-tab and > 250 ms drops, 33.3 ms does not trip); phase→hour; dais
  mapping; stone mapping vs server `circleSpots` for n = 5..15; clip fallback chain; ST roof pick; `@pixel3d` import
  boundary; vendor guard (§1.3 step 6); three pin.
- **Assets / server:** §2.2 tests; `apps/server/test/world.v3.test.ts` (door enter/exit with `townLayoutV3`, night
  send-home, `circleSpots` stones, ST spawn off the dais, `host.layout()` per world, `world` not changeable via
  `lobby:settings`).
- **e2e** (`tests/e2e/v3-*.spec.ts`, project `v3`):
  - Playwright project `v3` in `tests/e2e/playwright.config.ts` with `launchOptions.args: ['--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']` (the base of `v3/pixel3d/charkit/tools/shot.mjs
    glArgs`), viewport 960×540, and init script `ct.debug.v3force=1`, `ct.debug.fps=15`, `ct.fxQuality=low`,
    `ct.debug.camera=1`.
  - Every v3 spec asserts `__pixel.gpu` matches `/SwiftShader/` when run on the game host, so a host GPU is never used
    by accident.
  - **Port.** `playwright.config.ts:17` hard-codes `PORT = 3398`; WP7 makes it `Number(process.env.E2E_PORT ?? 3398)`,
    and each agent sets `E2E_PORT` inside its §8 range.
  - **One at a time.** v3 e2e runs on the host only through `scripts/v3/e2e.sh`, which wraps
    `flock ~/clocktower/locks/v3-e2e nice -n 19 pnpm test:e2e --project v3`: only one v3 e2e runs on the host at a
    time (SwiftShader is multi-core CPU work on the production machine).
  - Specs: `v3-boot` (canvas, `__ctCamera.v3().ready`, no console errors, no CSP violations, and **fails on any
    `console.warn` matching `/\[town\] piece .* failed/`**); `v3-doors` (house-5 rotated door in and out);
    `v3-social` (point + pin + bubble within 6 CSS px of `worldToScreen`); `v3-vote` (5-player nomination → `dais()`);
    `v3-fallback` (forced build error → Classic in place, `__ctCamera.v3` undefined; `WEBGL_lose_context.loseContext()`
    → rebuild, twice → Classic; boot flag preset → Classic; `ct.debug.v3perfFallback=1` → perf fallback);
    `v3-mixed` (one Classic, one v3 client in one v3 lobby see each other at the same px); `v3-life` (no door moves
    without a game `setDoor` over 60 s).
  - Classic-in-v3: `v2-phone.spec.ts` and `v2-look.spec.ts` also run against a v3 lobby, with screenshots for the
    user (Q7, gate for C3).
  - The existing suite stays green on v2 lobbies (default world).

### 6.3 Visual and perf checks

**Game host.** It runs SwiftShader for **logic** only (§6.2), never for visual or perf numbers; its GPU is not ours to
use (other services).

**Real devices (default perf path, needs no extra machine).** `ct.debug.v3perf=1` (production-safe, opt-in like
`ct.debug.camera`) shows a small DOM overlay reading `__ctCamera.v3()`: tier, scale, p50/p95 over the last 600
visible frames, calls, programs, GPU string, with a "copy" button. The user opens a v3 lobby on the **dev service**
(port 3001) on a real laptop iGPU and a phone and pastes the numbers into `docs/test-results.md`. A CPU proxy is the
vendor's `tools/demo-perf.mjs --throttle 4` (`v3/pixel3d/tools/demo-perf.mjs`).

**Render host (only if the user authorises it, Q10).** A GPU machine named only by `CT_RENDER_HOST` in
`ops.local.env` (WP7 adds the key to `ops.example.env`). Until the user says so, no agent uses any other machine;
`CLAUDE.local.md` currently restricts this, and that file is updated by the user's decision, not by agents. If
authorised:

- Per-run directories `~/ct-v3-check/<agent>-<UTC timestamp>/` and a `flock` lock shared with the pixel3d session's
  render tools (agree the lock path with that session; it also renders there, so runs must not overlap).
- Before perf numbers, record GPU utilisation (the vendor tool output or the driver's own CLI) next to every number;
  discard runs above 10 % idle utilisation.
- Reuse the vendor tools rather than new scripts: `v3/pixel3d/tools/demo-perf-matrix.mjs` for matrices,
  `tools/demo-bundle.sh verify` (static server with the **exact production CSP**) as the serving model.

**Harness** (`apps/client/v3-harness.html` → `src/game3d/harness/main.ts`, WP7):

- Built by a **separate** `apps/client/vite.harness.config.ts` (own `outDir: dist-harness/`), invoked only by
  `scripts/v3/render-check.sh`. Never part of `pnpm build`. A build check in `scripts/perf/bundle-report.mjs` (and
  `scripts/deploy-*.sh`) fails if `dist/` contains `v3-harness*` or `harness/`.
- Mounts the real `createTownGame3d` on a fake `RoomConnection` (modelled on `game/dev/sandbox.tsx:1-25`), no server:
  it replays a scenario. Served with the production CSP header.
- **Scenario** (`tests/v3/scenarios/*.json`): `{lobbyView, steps: [{at: ms, gameView?, snapshot?, teleport?, chat?,
  emote?, voice?: {pid: talking}}], shots: [{at, name, camera?: {focus:[x,y], viewHeight}}]}`. Snapshots at 12 Hz,
  linear px interpolation. Scenarios: `square-day-8`, `night-15`, `vote-12`, `interior-house-5`, `dusk-transition`,
  `phone-390x844`, `south-bay` (grass), `projection` (§1.5).
- Hooks: `window.__harness = {done, shots: [{name, t}], perf: {frames: number[]}}`; `?scenario=&tier=&fps=0`;
  deterministic `t` from the scenario clock.
- `scripts/v3/render-check.sh`: build harness on the host (`CT_AGENT=v3-qa scripts/remote.sh env … pnpm --filter
  @ct/client exec vite build -c vite.harness.config.ts`), pull `dist-harness`, then either run SwiftShader shots on
  the game host (look only, under the e2e lock) or, if Q10 allows, GPU shots + perf on the render host. Results to
  `v3/shots/<date>/` (gitignored); numbers to `docs/test-results.md`.
- `scripts/perf/budgets.mjs` gets a `v3` section (§7) reading `frames.json` and the bundle report.

---

## 7. Performance budget and quality tiers

| Metric | Budget | Measured where |
|---|---|---|
| Entry JS growth | ≤ 1 KiB br (`entryJsBrKiB` max 45) | `scripts/perf/bundle-report.mjs` |
| Lobby chunk | stays ≤ 72 KiB br (`lobbyChunkBrKiB`, today 63.8); growth ≤ 2 KiB br | bundle report |
| `town3dChunkBrKiB` (game3d + three + engine/pipeline) | ≤ 230 KiB br | bundle report (new key) |
| `v3LayoutBrKiB` (`@ct/assets/hollowmere` chunk) | ≤ 25 KiB br | bundle report (new key) |
| Town pieces + interiors + life (lazy) | ≤ 800 KiB br total; first paint loads only `BUILD_ORDER` pieces | bundle report |
| Per character spec chunk | ≤ 22 KiB br | bundle report |
| No raw `characters/*.js` assets, one `three` copy, no harness files in `dist/` | 0 / 1 / 0 | build plugin + bundle report |
| Time to first 3D frame after mount | ≤ 6 s on a mid laptop (vendor DEMO.md reports 2.6-4.0 s demo-ready on its reference machine) | real device overlay; harness |
| Shader warm-up | mandatory before first show; light count constant (12 high / 8 low) | harness |
| Laptop iGPU, `low`, 15 players | p50 ≤ 33 ms, p95 ≤ 50 ms | **real device** (user, `ct.debug.v3perf`) |
| Discrete desktop GPU, `high`, 1080p, 15 players | p50 ≤ 12 ms, p95 ≤ 20 ms | real device; render host if Q10 |
| Phone, explicit `v3`, `low` | measured and reported; no budget until Q4 | real device |
| Draw calls / programs | **re-baselined** in WP7 from the measured town (vendor TOWN.md §12.6 already reports ≈ 300-470 calls for the town alone) + N characters (each rig draws in shadow, colour and normal passes); the budget is "baseline + ≤ 12 calls per visible character at `high`, ≤ 6 at `low` (LOD)"; programs constant across day→night and across interior switches | `__ctCamera.v3()` |
| Interior switch | ≤ 120 ms hitch | harness `interior-house-5` |
| JS heap | ≤ 350 MB after 10 min; < 10 MB growth across 5 mount/destroy + 2 rebuilds | harness leak test |
| Overlay DOM | `v3WalkDomMutPerSec` ≤ 40 /s with 15 labels (transform writes only; no layout reads); `desktopWalkMainPct` unchanged rule | `scripts/perf/budgets.mjs` (new key) |

**Overlay update rule** (WP4): positions are written as `el.style.transform = translate3d(x, y, 0)` (CSSOM, allowed by
`style-src 'self'`), in one batch after `renderAt`, skipped when the projected position moved < 0.5 px, culled
off-screen with `visibility`, and **no layout reads** in the per-frame path (sizes measured once on content change).

**Tiers** (`fx/quality.ts` values → town):

- `low`: `quality=low`, 2048 shadow map, no clouds or mist, 8 lights, `life` reduced, pixelScale `round(h/300)`,
  character LOD (§4).
- `high`: `quality=high`, 4096 shadow map, 12 lights, `life` as §3.1.
- No third tier in v1. Phones get Classic under `auto` (§1.2).

---

## 8. Work packages

Every agent runs code only via `CT_AGENT=v3-<name> scripts/remote.sh …`. Ad-hoc ports below (the lead adds them to
`CLAUDE.md` in WP0); `E2E_PORT` comes from the same range. Record every command you ran, and every failure.

| Agent | Ports |
|---|---|
| v3-lead | 3450-3453 ad hoc; 3454 reserved for `apps/server/test/lobby.world.test.ts` (part of `pnpm test`) |
| v3-core | 3455-3459 |
| v3-qa harness server | 3460 |
| v3-avatars | 3461-3464 |
| v3-stage | 3465-3469 |
| v3-overlay | 3470-3474 |
| v3-world | 3475-3479 |
| v3-ui | 3480-3484 |
| v3-qa | 3485-3499 |

**Ownership.** CLAUDE.md gives `apps/client/src/game/**` and `packages/assets/**` to world-art, `ui/chat/**` and
`rooms/*`/`directory` to lobby-auth, `ui/hud/**` and `ui/storyteller/**` to rules-storyteller. WP0 updates the CLAUDE.md
table: `apps/client/src/game3d/**` (split per WP below), `v3/**` = read-only vendor, `scripts/v3/**` and `tests/v3/**`
= v3-qa (except `export-hollowmere.mjs`: v3-world). Where a v3 agent edits another owner's file it is named below, the
edit is the minimum, and the owner's sign-off is recorded in the commit message and §11.

**Order.** WP0 → (WP0s ∥ WP5a) → C0b → (WP1 ∥ WP2 ∥ WP3 ∥ WP4 ∥ WP5b ∥ WP6) → C1 → WP7 → C2 → C3. On `TownScene.ts`
the order is WP0 (extraction) → WP0s (layer splits) → WP5b (layout injection); no two packages edit it at once.

### Status

| WP | Owner | Checkpoint | Last commit | Blocking |
|---|---|---|---|---|
| WP0 | v3-lead | C0 | **C0 passed, committed** as "v3 C0: …" on `v3-game` (gate `v3-gate`, 2026-10-17): `pnpm -r run typecheck`, `pnpm build`, `pnpm test` (126 files / 1393 tests pass, 1 file / 3 tests skipped), C0 smoke `scripts/v3/smoke-mount.mjs` (5 mount/destroy + 1 injected crash, exit 0, Vite dev + SwiftShader); lead also ran e2e `doors` + `chat-bubbles` (2 passed). Known gaps: stub draws no interiors/remote avatars; context loss falls back to Classic (WP1 adds rebuild); the 5x cycle used `smoke-mount.mjs`, not the WP7 harness | — |
| WP0s | v3-core | C0b | **C0b passed, committed** as "v3 C0b: …" on `v3-game` (gate `v3-gate`, 2026-10-17; gate ran typecheck, `pnpm build`, full `pnpm test` = 131 files / 1506 tests pass, 1 file / 3 tests skipped). Author's notes: `gameplay/{core,phaserView}.ts`, `social/{controller,phaserView}.ts`, `index.ts` barrels, unit `gameplay.core.test.ts` (10) + `social.controller.test.ts` (18). Ran: client typecheck, `pnpm -r run typecheck` + `pnpm build` + `pnpm test` (1417 pass; the only 4 failures are WP5a's in-flight "v3 refused" flips in `lobby.world.test.ts`/`layoutRules.test.ts`), e2e `doors`, `door-boards`, `door-reconnect`, `chat-bubbles`, `v2-social` quick (pass); `v2-social` "desktop and phone" fails on the phone step **also on the unmodified C0 tree** (pie centre clamped near the screen edge commits a wedge on lift; see §9.3) | — |
| WP5a | v3-world | C0b | **C0b passed, committed** in the same "v3 C0b: …" commit (gate as in the WP0s row): `scripts/v3/export-hollowmere.mjs` + `hollowmere.generated.json`, `@ct/assets/hollowmere` (`townLayoutV3`, `townMapV3`, `npcHomesV3`, `PROP_DEFS_V3`), `layoutFor`; server `V3_LAYOUT` and client `importV3Layout()` wired (v3 lobbies are created: 201, `host.layout()` = `townLayoutV3`); per-world `sound/areas.ts`; tests `hollowmere.test.ts`, `layout`/`navigation` parameterised by world, `world.v3.test.ts`, `sound.areas.v3.test.ts`, flipped `lobby.world` / `layoutRules`. Verified on the host: typecheck, `pnpm build`, full `pnpm test` (131 files / 1499 tests pass, 1 file / 3 tests skipped), `export-hollowmere --check` (deterministic). Entry +0.28 KiB br, lobby +0.07 KiB br vs HEAD; `layoutV3` chunk 5.65 KiB br, dynamic-only | — |
| WP5b | v3-world | C1 | **Done, not committed** (2026-10-17; no commit by role). Classic 2D in a v3 world as built in §2.5: generator v3 pass (`scripts/v3/{classic,placement}.ts`, `scripts/lib/world.ts`; outputs `terrain-v3.*`, `town-v3.json`, `square-props-v3.json`, `objects-v3.*`; v2 outputs byte-identical), `@ct/assets/runtime-v3`, per-instance layout state in `TownScene.ts`, per-world board slots in `boardTokens.ts`. Ran on the host: `pnpm build` + full `pnpm test` (151 files / 1742 tests pass, 1 file / 3 skipped, worktree snapshot incl. other phase-1 work), full `pnpm assets:generate` (sha256 of every generated file unchanged), unit `classicV3.test.ts` (15) + `boards.houses.v3.test.ts` (3); e2e on an own server (port 3475) `classic-in-v3.spec.ts` (3: all 15 cottages entered by tapping; v2 → v3 → v2 lobby in one page; Q7 screenshots) + v2 `doors`, `door-boards`, `door-reconnect`, `chat-bubbles`, `hd-cast` (8/8 pass). Not run: `v2-phone`/`v2-look` against a v3 lobby (need WP7's world-aware helpers; `classic-in-v3` covers the same screens) | — |
| WP1 | v3-core | C1 | **Code + unit tests done, not committed, NOT yet wired into `TownGame3d.ts`** (lead-owned composition root; integration steps in the WP1 "API (as built)" bullet). `game3d/net/{core,local,remotes,lifecycle}.ts`, `game3d/input/{camera,pick,tap,keys,pointer,crosshair}.ts`, `game3d/debug/{hooks,frameStats,perfOverlay}.ts`; unit `core.pick.test.ts` (21: pick roof/lane at 5 real-PixelCamera states, interiors, tap rules, camera goal), `core.net.test.ts` (20: interpolation, ST poofs, prediction / moves / fencing, doors, routes, prompts, keys, pointer order, core state + `__ctCamera`, import closure), `core.lifecycle.test.ts` (16: sampler, safe moment, promotion, context loss, crash, boot marks, debug helpers). Ran on the host: client typecheck (clean), `vitest run apps/client/test` (54 files / 681 tests pass). Not run: e2e `v3-boot`/`v3-doors`/`v3-fallback` and `doors`/`door-reconnect` on a v3 lobby (need the TownGame3d wiring and WP7's `v3` project) | wiring |
| WP3 | v3-stage | C1 | **Code + unit tests done, not committed; wired into `TownGame3d.ts`** (minimal WP3 edit in the lead-owned root: `createStage` replaces `buildHollowmere`, `stage.layer` registered first, `stage.warmUp` replaces the two warm-up frames, `Layer3dServices.stage`, `state.hour = stage.hour()`). `game3d/world/{stage,hour,dais,doors,interiors,lights,park,store}.ts`, `game3d/vendor/{town,time,interiors}.ts`; unit `world.{hour,dais,store,doors}.test.ts` (38). Ran on the host: client typecheck (WP3 files clean), `vitest run apps/client/test/game3d/world` (4 files / 38 pass), an ad-hoc SwiftShader smoke of the real `createTownGame3d` on `townLayoutV3` (ready, dais vote/night, 10 boarded houses, house-5 in/out, door swing, bells only at phase changes, no door move / bell while idle, programs 41 constant across day → vote → night → interior → dawn, interior switch 106 ms, no console errors). Not run: e2e `v3-vote` / `v3-life` and the harness shots (WP7's `v3` project / harness) | — |
| WP2 | v3-avatars | C1 | **Code + unit tests done, not committed, NOT yet wired into `TownGame3d.ts`** (integration steps in §4 "As built (WP2)" and `avatars/index.ts`). `game3d/avatars/{castMap,clips,queue,billboardFrames,body,rigBody,billboard,ghostTint,lanterns,npcs,project,layer,index}.ts`, `vendor/characters.ts` (spec probe, driver with slide mode, light suppression, sockets, billboard toon material); unit `avatars.castMap.test.ts` (33 ids, ghost-mode table = live probe of every vendor spec), `avatars.clips.test.ts` (fallback chain, play diffs, deaths, raised hands), `avatars.parts.test.ts` (queue, billboard frames, NPC square rule, tint wrapper, lanterns), `avatars.layer.test.ts` (orchestration with fake bodies). DEV smoke `avatars/dev/avatarSmoke.mjs` on SwiftShader (results in the WP2 report / `docs/test-results.md` via qa). Not run: e2e `hd-cast.spec.ts` v3 branch, harness `square-day-8`/`night-15` (need the wiring + WP7's `v3` project / harness) | wiring |
| WP4, WP6 | see below | C1 | — (may start: C0b passed) | — |
| WP7 | v3-qa | C2 | — (harness may start now; take over `scripts/v3/smoke-mount.mjs`) | C1 |

### Phase 0: WP0 Foundation (`v3-lead`), checkpoint **C0**

- **Owns:** `apps/client/src/game3d/{TownGame3d.ts, select.ts, bootGuard.ts, perf.ts, contract.ts, coords.ts,
  pixel3d.d.ts, vendor/engineHost.ts}`; `apps/client/build/pixel3dImports.ts`; `apps/client/vite.config.ts`, root
  `vitest.config.ts`, `apps/client/package.json`, the lockfile, `.github/dependabot.yml` (the `three` ignore, with
  qa-deploy sign-off); `apps/client/src/game/rules/**` + import-only edits in `TownScene.ts` (world-art sign-off);
  `apps/client/src/net/layout.ts`; the `GameScreen.tsx` effect split and renderer switch (world-art sign-off);
  `packages/protocol/src/{world,lobby}.ts` (additive); `circleSpots` stones; the `currentLayout()` edits in
  `gameplay/index.ts`, `gameplay/doorTags.ts`, `sound/{areas,world}.ts` (world-art), `ui/chat/index.tsx`
  (lobby-auth), `ui/hud/hints.tsx`, `ui/storyteller/{script,stage}.tsx` (rules-storyteller); the `prefs.ts`
  `ct.graphics` entry; `build/cssOrder.ts` entries for WP4/WP6 sheets (on request); `CLAUDE.md` ports + ownership;
  this document.
- **With lobby-auth:** `CreateLobbyRequest.world`, directory init, `GameRoom.settings.world`, `RoomHost.layout()`.
- **Deliverables:** a stub v3 renderer (engine host + `buildTown` at the square at noon via a minimal
  `vendor/town.ts` stub that WP3 then owns, own avatar = `wanderer` with prediction, `__ctCamera` with
  `me/view/worldToScreen` per §1.5); empty `Layer3d` registrations; `currentLayout()` returning v2 for v2 lobbies and
  throwing "v3 layout not built" for v3 lobbies until WP5a lands (no placeholder that would draw Hollowmere over v2
  doors).
- **Tests:** unit `coords` (incl. projection), `select`, boot guard, stones, import boundary, vendor guard, three pin;
  `pnpm test`, `pnpm -r run typecheck`, `pnpm build` (bundles `@pixel3d/core/Engine.js`, one three copy, no
  `characters/*.js` assets); v2 e2e smoke (`doors.spec.ts`, `chat-bubbles.spec.ts`).
- **Accept:** v2 default unchanged; stub mount/destroy 5× in the harness on a v2-layout fixture without errors
  (SwiftShader, forced); entry +≤ 1 KiB br, lobby +≤ 2 KiB br.

### Phase 0b (parallel, checkpoint **C0b**)

**WP0s Core splits (`v3-core`, acting for world-art)**

- **Owns (edits):** `apps/client/src/game/gameplay/index.ts` → `gameplay/core.ts` + `gameplay/phaserView.ts`;
  `apps/client/src/game/social/index.ts` → `social/controller.ts` + `social/phaserView.ts`; matching call-site edits
  in `TownScene.ts`.
- **Tests:** existing unit + e2e for gameplay and social stay green unchanged (`doors.spec.ts`,
  `door-boards.spec.ts`, `chat-bubbles.spec.ts`, social specs); new unit tests for `core.ts`/`controller.ts` without
  Phaser.
- **Accept:** no behaviour change in Classic; `core.ts`/`controller.ts` import no `phaser` (grep test).
- **API (as built).** `gameplay/core.ts createGameplayCore(ctx)` → `frame()` (publishes `gameplayState`, returns a
  `GameplayFrame` in v2 px: `picking`, `hands` of visible voters, seat `markers`, vote `clock` targets, personal
  `hint`), `drive()`, `wantsLocalInput()`, `doorOverride(id)`/`doorOverrideVersion()`, `isPicking()`,
  `pickAt(x, y)` / `releasePointer()` (Escape is handled inside). `social/controller.ts
  createSocialController(ctx, surface)`: the renderer passes a `SocialSurface` (`worldAt`, `clientOf`, `cssZoom`,
  `pinAt` over its drawn pins, `isSurface`, optional `emoteAdded`/`emoteRemoved`/`nickFace`/`placeChanged`) and
  forwards `pointerDown/Move/Up/Over/Out` + `onTap(wx, wy, pointer)` as `SocialPointer`s in its own screen
  coordinates; it draws from `displayPins(t, known)` (+ `adopted` re-keying), `emotes()`/`emoteAge`, `tick(t)`
  (long-press ring), `hoverText`, `here()`, `placeSince()`, and merges `debug()` into `__ctSocial`. The Phaser
  views keep `createGameplayLayer(scene, ctx)` / `createSocialLayer(scene, ctx)`; `TownScene.ts` needed no edit.

**WP5a World export (`v3-world`)**

- **Owns:** `scripts/v3/export-hollowmere.mjs`, `packages/assets/src/hollowmere/**` (world-art sign-off),
  `packages/assets/test/hollowmere*.test.ts`, parameterising `layout.test.ts`/`navigation.test.ts` by layout, the
  `@ct/assets/hollowmere` subpath export in `packages/assets/package.json`, `apps/server/test/world.v3.test.ts`.
- **Deliverables:** generated JSON, `townLayoutV3`, `townMapV3`, `layoutFor`. Wire the two WP0 hooks (marked
  `CONTRACT-REQUEST(WP5a)`): `V3_LAYOUT` in `apps/server/src/rooms/worldLayout.ts` and `importV3Layout()` in
  `apps/client/src/net/layout.ts`; then flip the "v3 refused" assertions in `apps/server/test/lobby.world.test.ts` and
  `apps/client/test/game3d/layoutRules.test.ts`.
- **Also (review round 2):** `apps/client/src/game/sound/areas.ts` (world-art sign-off) still builds its `water`,
  `forest` and `square` fields, `fountains` and `ground` at module load from the v2 `townMap` (WP0 only moved
  `townBounds` and the tavern door to `currentLayout()`). Once `townMapV3` exists, derive them from the current
  world's map lazily, cached per `WorldId`, so v3 ambience and footstep surfaces follow Hollowmere. Test: one
  assertion per field that a v3 point (e.g. the Hollowmere fountain) reads the v3 surface.
- **Tests:** §2.2 assets tests, server test.
- **Accept:** every door reachable; band/collision invariants; v2 layout byte-identical (hash of
  `JSON.stringify(townLayout)`).

### Phase 1: parallel (C1 = all merged; each commits once its tests pass)

v3-lobby e2e acceptance in phase 1 runs against the real `townLayoutV3` (available since C0b).

**WP1 Core: net, input, camera, debug (`v3-core`)**

- **Owns:** `game3d/{net,input,debug}/**`.
- **Relies on:** `contract.ts`, `coords.ts`, `game/rules/**`, `gameplay/core.ts`, `social/controller.ts`.
- **Deliverables:** `Scene3dState` adapter; prediction, moves, doors, teleports, sound cues + door cue; Escape;
  tap-to-walk routes (outdoor `goTo`, interior `interiorRoute`); `localPlayer`/`remoteEntities` writers; keys and
  joystick; two-stage pick (§3); tap rules and ST `teleport_self`; `stagePick` crosshair; camera; `__ctCamera`/
  `__ctSocial` (merging `Layer3d.debug`); `ct.debug.v3perf` overlay; perf sampler + safe-moment scheduler; boot-guard
  clear; tier rebuild + context-loss orchestration (new Engine each time).
- **Tests:** unit interpolation, pick (roof, lane) at 5 camera states, sampler, scheduler; e2e `v3-boot`, `v3-doors`,
  `v3-fallback`.
- **Accept:** `doors.spec.ts` and `door-reconnect.spec.ts` pass against a v3 lobby (project `v3`).
- **API (as built, WP1).** One object per mount, surviving tier / context-loss rebuilds:
  `net/core.ts createCore3d({bridge, layout, world, tier, parent, plaza?, hour?})` → `Core3d` with `state`
  (the live `Scene3dState`), `view` (`input/camera.ts CameraRig`, the `View3d`), `gameplay` (the ONE
  `GameplayCore` of the mount: WP4 draws `core.gameplayFrame()`, never creates its own), `local`, `remotes`,
  `pointer` (`setSocial(controller)` = WP4's social controller gets presses / moves / releases and may claim
  primary taps; `tapAt` = `SocialControllerCtx.passTap`), `keys`, events `on('poof'|'door'|'placed')`,
  `attachScene({host, heightAt, proxies?, interiorCamera?, stats?})` after each (re)build / `detachScene()`
  before teardown, `setLayers(layers)` (merges `Layer3d.debug` into `__ctCamera`; core members `worldToScreen /
  view / me / v3` always win), `frame(t, dtMs)` (before the layers; returns the state), `afterRender(dtMs)`,
  `stats()`, `safeInput()`, `destroy()`. `net/lifecycle.ts Lifecycle({startTier, build(tier), teardown(),
  fallback, safe: core.safeInput, flags: readPerfFlags(localStorage), allowPromote?, overlay:
  createBusyOverlay(parent)})`: `start()` (first build; boot mark + BootTracker), `frame(dtMs)` (after the
  render: tracker, PerfSampler, SafeMoment), `contextLost()` (wire with `watchContextLoss(canvas, …)`; first loss
  per page within 10 min = rebuild at once, second = Classic), `crash(e)` (frame-loop throw), `requestTier(t)`,
  `destroy()`. Pick proxies default to the layout footprints (`input/pick.ts layoutProxies`); WP3 may pass the
  vendor `houseBox(rec, top, 'full')` boxes (same `{center, half, y, ry}` shape). Hooks: `debug/hooks.ts`
  `installSocialHook(members)` for WP4's `__ctSocial`; `ct.debug.v3perf` overlay in `debug/perfOverlay.ts`.
  Camera: fixed yaw, `ZOOM_LADDER` stops (12 m at 16:9, the next stop up on narrow screens so the 18 m square
  stays in view, max 45), vote framing (19 m on the plaza) during an open / voting nomination on the square,
  interiors from WP3's `interiorCamera(loc)` else a room shot from §2.3 dims.

**WP2 Avatars (`v3-avatars`)**

- **Owns:** `game3d/avatars/**`, `game3d/vendor/characters.ts`.
- **Deliverables:** `castMap` with the capability probe; build queue; handles driven via `drive()`; facing; clip
  fallback over `handle.emotes`/`emoteClips`; ghost modes (`shared`/`clips`/`tint`) and deaths; vote hands; carried
  lanterns (prop; light from WP3's pool API); low-tier character LOD; NPC roamers with Brianbi avoidance; billboards
  (brianbi, nicksong; `<id>|<dir8>|<n>` frames); wanderer stand-in; `AvatarRegistry`.
- **Tests:** unit `castMap` (33 ids, ghost modes), clip fallback; e2e `hd-cast.spec.ts` v3 branch; harness
  `square-day-8`, `night-15`.
- **Accept:** all 33 cast ids render (3D, billboard or stand-in); every dead cast id shows a ghost look while walking.

**WP3 Town stage (`v3-stage`)**

- **Owns:** `game3d/world/**`, `game3d/vendor/{town,interiors,time}.ts`.
- **Deliverables:** town build per tier (grass area, `strict: 'all'`, life params, runtime opts); the §3.1
  construction order; doors `setDoor`/`setLit`; boarded houses; interior switching/caching/parking (reimplemented
  park); time facade + phase→hour; clock tower + bell at phase change; dais (§3.2); light pool incl. an API
  `borrowLight(anchorFn)` for carried lanterns; shader warm-up.
- **Tests:** unit phase→hour, dais mapping, facade store; e2e `v3-vote`, `v3-life`; harness `vote-12`,
  `interior-house-5`, `dusk-transition`, `south-bay`.
- **Accept:** programs constant across day→night and interior switches; interior switch ≤ 120 ms; no unscripted door
  or bell.
- **API (as built, WP3).** `world/stage.ts createStage(host, {layout, tier, initial: {phase, game}, driveInteriorCamera?,
  onError?}) → Promise<Stage>` runs §3.1 steps 1-3 (town at the preset of the starting stage hour, the tier's light
  budget; runtime opts; boarded-light gate, door boards, carried-light reserve; time facade). `Stage`:
  `layer` (Layer3d: hour, dais, boards, doors, interiors; register it first), `warmUp(renderNow)` (two frames, every
  dais state, the whole town, one room, then the facade's `ready`), `hour()` (→ `Scene3dState.hour`),
  `heightAt`, `borrowLight(anchorFn, {color, intensity, distance, always}) → {release()} | null` (anchor = world
  **metres** `{x, y, z}` or null; intensity × the hour's darkness unless `always`), `drawnLocation()`,
  `interiorCamera(loc) → {X, Y, Z, viewHeight} | null` (input/camera `RigScene.interiorCamera`), `houseProxies()`
  (input/pick `HouseProxy` shape, vendor `houseBox(rec, top, 'full')`), `debug()` → `dais()` (§6.1) and `stage()`
  (`hour, targetHour, preset, bells, phase, drawn, interiors {cached, lastSwitchMs, parked}, doors {open, writes,
  angles}, boarded, life {walkers, doors, folk, ambient, benchFolk}, lights {pool, reserve, lent}, warm, time`).
  Pure modules (unit tested): `world/hour.ts` (`stageHour`, `clockProgress`, `createHourClock`, `darkness`),
  `world/dais.ts` (`daisPlan`, `stoneMap`, `createDaisDriver`, `showcasePlan`, `daisDebug`), `world/doors.ts`
  (`createDoorDriver`, `boardedHouses`, `createBoardDriver`), `world/store.ts` (facade store / events / input).
- **As built, notes (WP3).**
  - Light budget 12 high / 8 low = town pool (time facade + composer, `lights` param) + a reserve of 2 PointLights
    (`world/lights.ts RESERVE`) for carried lanterns (lantern cast member + Storyteller). The count never changes.
  - Doors: a swing (0.3 s open, 0.9 s hold, 0.3 s close) whenever any pose's location changes outdoors ↔
    `bld:house-i`; nothing else writes `setDoor`. Bell: `ringBell()` on every observed phase change (not on the
    first look at a game). The tower hands follow the §3.1 hour through `createTime`'s gate (no vendor timer readout
    published yet, §9.1 in-flight request 2).
  - Boarded: `vendor/town.ts gateHouseLights` wraps each cottage api's `setLit` before `createTime`, so a boarded
    house stays dark whatever the hour; the plank prop is kit-Builder geometry (shared kit material). Known limit:
    the time facade may still aim a pool PointLight at a boarded cottage's lantern anchor at night.
  - Interiors: `world/interiors.ts` builds on demand (prefetch: own home, any door within 3 tiles), caches 2 (LRU),
    parks the town (`world/park.ts`) only after the warm-up; the stage frames the vendor dollhouse camera itself
    while inside (`driveInteriorCamera`, default on; harmless when input/camera uses `interiorCamera()` too).
  - SwiftShader: the first `vote` frame stalls the GPU process once (≈ 17-22 s at 960×540, CPU profile idle; not
    the dais fx, which the warm-up now draws in every state). Under investigation / see §9.3; e2e specs must allow
    for it.

**WP4 Overlay (`v3-overlay`)**

- **Owns:** `game3d/overlay/**` (DOM + `overlay/*.css`; `CSS_ORDER` entries requested from WP0).
- **Relies on:** `View3d`, `AvatarRegistry`, `social/controller.ts`, `gameplay/core.ts`, pure `speech`/`boardTokens`/
  `houseNames` exports, `v3atlas.ts` (WP6; stubbed until it lands).
- **Deliverables:** labels, bubbles, talking indicator, pins/points/emotes/pie (`overlay/socialView.ts`), door
  boards, house names, seat markers (own spot pulsing), vote-hand and raised-hand indicators, hint arrows, poof,
  `bubbles()`/`doorBoards()` debug members; the §7 overlay update rule.
- **Tests:** unit anchor stacking, transform batching (no writes under 0.5 px); e2e `v3-social`, `chat-bubbles.spec.ts`
  and `door-boards.spec.ts` on v3.
- **Accept:** overlays within 2 CSS px of `worldToScreen` while the camera pans (harness `projection` +
  `square-day-8`); no `innerHTML`; `v3WalkDomMutPerSec` budget.
- **Status (WP4, 2026-10-17, not committed; waits for the C1 integration):** code + unit tests done in
  `game3d/overlay/{index,types,place,anchors,atlas,surface,labels,bubbles,socialView,boards,gameplayView}.ts`. Ran on
  the host: overlay unit tests (4 files / 28 tests pass), client `tsc --noEmit` (no overlay errors), and a scratch
  Chromium smoke (2D canvas only, no GPU flags) of the layer over a fake View3d / AvatarRegistry / connection: atlases
  load, bubbles / boards / labels / pins / point emote drawn, no console errors, no `<img>` from chat text. **Not run:**
  the e2e `v3-social`, `chat-bubbles.spec.ts` and `door-boards.spec.ts` on v3, and the harness accuracy shots: they
  need the layer registered in `TownGame3d` together with WP1's View3d / pointer input and WP2's AvatarRegistry (C1).
- **API (as built).** `overlay/index.ts createOverlayLayer(deps): OverlayLayer` (a `Layer3d`). `deps`: `parent`
  (`.ct-game-canvas`), `surface?` (pointer element, default `parent`), `conn`, `view: View3d`, `avatars:
  AvatarRegistry`, `gameplay?: () => GameplayFrame | null` (WP1's core frame of this tick), `pixelScale?` (default
  `max(1, round(innerHeight/360))`; pass `engine.pixelScale`), `faceToward?`, `passTap?` (= WP1 `PointerInput.tapAt`),
  `ownPointerInput?` (harness only), `socialHook?` (default true: installs `__ctSocial` when `ct.debug.social=1`;
  false = the host installs `layer.social.debugMembers()` via WP1 `installSocialHook`), `social?`. The layer exposes
  `socialSink` for WP1 `pointerInput.setSocial(...)` (it records each claim's screen point, so pin / person hit tests
  run in screen space even when a 3D pick mapped a roof click to a door tile), `tapFirst(ev)` (the same claim for a DOM
  event), `flush()`, and `debug()` = `bubbles()` (v2 shape, page-px boxes), `doorBoards()` (v2 `inspect` shape +
  `screen` page-px box; `rect` is a world-px box derived from the screen box at the anchor's zoom, `visible` = built and
  the viewer outdoors), `overlay()` (DOM write counters + per-second rates). Every avatar-anchored overlay is shown only
  while `AvatarRegistry.anchorOf(pid) !== null` in the viewer's location.
- **Drawing (as built).** One root (`position:absolute; inset:0; pointer-events:none`) appended to `parent`, holding
  a 2D **FX canvas** at the 3D image's texel resolution (CSS size = texels × `pixelScale`, `image-rendering:
  pixelated`, redrawn only on frames that draw something) for every atlas sprite (pins, hands, pings, trails, seat
  markers, guides, off-screen markers, board tokens, bubble 9-slice + tail, poofs, talk glyph / ripple), and DOM text
  (labels, bubble text, house names, tooltips, "+N") set with `textContent` and styled through the CSSOM only. There is
  no stylesheet, so no `CSS_ORDER` entry is needed (the planned `overlay/*.css` was dropped). Atlases (`indicators`,
  `markers`, `events`, `portraits`, each with `-night`, plus `kit.json` tokens) are loaded by `overlay/atlas.ts` via
  `?url` + `fetch` (WP6's `v3atlas.ts` can replace it later).

**WP5b Classic in a v3 world (`v3-world`, acting for world-art)**

- **Owns (edits):** the `packages/assets` generator pass (`town-v3.json`, `square-props-v3.json`), `TownScene.ts`
  per-instance layout state and v3 asset selection, the `doorNormal` inward rule wiring.
- **Tests:** `v2-phone.spec.ts`, `v2-look.spec.ts` and `doors.spec.ts` against a v3 lobby with the Classic renderer;
  screenshots for Q7.
- **Accept:** a Classic client in a v3 lobby enters all 15 houses; leaving a v2 lobby and joining a v3 lobby in one
  page renders the right town.

**WP6 DOM UI skin (`v3-ui`)**

- **Owns:** `apps/client/src/ui/common/{v3atlas.ts, castPortrait.ts (v3 gating), theme-v3.css}`, the
  `SettingsDialog.tsx` Graphics row (incl. "Try v3 again"), the v3 branches in `ui/social/{SocialPalette,PieMenu}.tsx`.
- **Deliverables:** §5 items 1-4 (incl. `-night` atlases), the Graphics setting UI.
- **Tests:** unit `v3atlas` lookup for every frame `SocialPalette`/`PieMenu` request (day and night); e2e
  `v23-settings.spec.ts` extended.
- **Accept:** no v2/v3 art mixing except documented skips; settings persist and swap in place; lobby chunk budget.

### Phase 2: WP7 Integration / QA (`v3-qa`), checkpoint **C2**, then C3

- **Owns:** `tests/e2e/v3-*.spec.ts`, the `v3` project + `E2E_PORT` in `tests/e2e/playwright.config.ts`, v3 branches
  in `tests/e2e/helpers.ts` and `tests/support/bot.ts`, `tests/v3/**`, `scripts/v3/{render-check,e2e}.sh`,
  `apps/client/{v3-harness.html, vite.harness.config.ts}`, `apps/client/src/game3d/harness/**`, the
  `scripts/perf/budgets.mjs` v3 keys and bundle-report checks, `ops.example.env` (`CT_RENDER_HOST`),
  `docs/test-results.md`.
- **Deliverables:** harness (may start after C0); full e2e on both worlds; real-device numbers collected from the user;
  render-host runs only if Q10 allows; leak test; `v3-mixed`; release note for `docs/progress.md` (to the lead).
- **Accept:** every §7 budget met or explicitly waived by the user.
- **C3** (user decision, conditional on Q7's Classic-in-v3 review): flip the `CreateLobbyRequest.world` default to
  `'v3'`, or let the host choose per lobby with `'v3'` preselected.

**Integration rule.** After each phase there is a module-fix step: shared bugs found by any WP are fixed then.

---

## 9. Open questions and risks

### 9.1 Questions for the user

1. **Q1 Speed / scale.** The vendor's cast walks at `gameSpeed` ≈ 4 body-heights/s (frog 4.74 m/s); 150 px/s at
   16 px/m is 9.4 m/s ≈ 2× that. (a) `PLAYER_SPEED` 80 px/s in v3 worlds; (b) keep 150 px/s and scale characters
   ×1.56; (c) keep 150 px/s and accept a run cycle. Needed before WP2/WP4.
2. **Q2 Camera.** Fixed yaw, or 45° rotations (25-40 ms hitch each)?
3. **Q3 nicksong / brianbi** in v3: v2-sprite billboards, or hide them from the v3 picker?
4. **Q4 Phones.** Is "Classic on phones under Auto" acceptable for the v3 launch?
5. **Q5 Interiors.** Tile-quantised walls/furniture with ≤ 0.5 m error (table §2.3) and no display clamp: OK?
6. **Q6** Republish pixel3d with `src/ui/**` (labels/bubbles/pins in-canvas, `talkOutline`), and re-run
   `scripts/v3/import-assets.sh` once the markers re-bake settles.
7. **Q7 Classic in a v3 world.** After WP5b you get screenshots of phone/Classic in Hollowmere. Is it good enough to
   make v3 the default world (C3), or should phones default to v2 lobbies?
8. **Q8 Dais.** Solid disc (players and ST walk around it), or a walkable stage for the Storyteller?
9. **Q9 World switch.** The world is fixed at lobby creation. Do hosts need to change it in a waiting lobby?
10. **Q10 Render host.** May agents use a separate GPU machine (`CT_RENDER_HOST`) for visual/perf checks? Your
    private notes currently say not to use the other machine. If yes, please update `CLAUDE.local.md` yourself and
    confirm the lock/directory rules in §6.3. Without it, perf comes from your real devices via `ct.debug.v3perf`.



**User decisions (2026-10-17, binding):**
- **Players choose v2 or v3 per lobby.** The create-lobby form (`apps/client/src/ui/lobby/LobbyFinder.tsx` and friends)
  gets a visible "Town" choice — *Classic (v2)* / *Hollowmere (v3)* — sent as `CreateLobbyRequest.world`. The lobby list
  rows, the join-by-id preview and the waiting room show the lobby's world (small badge). Both stay first-class: v2 lobbies
  keep working exactly as today, and the per-player Graphics setting still applies inside v3 lobbies (Classic 2D draws the
  v3 map). The directory listing (`LobbyListing`) carries `world`. **Owner: WP6** (acting for lobby-auth on `ui/lobby/**`),
  protocol/server plumbing stays WP0. e2e (WP7): create one lobby of each world from the UI and verify the choice sticks.
  Q7 now only decides which choice is *pre-selected*.
- **After the full v3 build is tested end to end (C2), run a dedicated performance swarm** (separate run, lead-launched)
  over the v3 renderer and the v3 server world: load time / lazy chunk size, frame time per tier, character/overlay cost,
  memory + disposal across lobby switches, server CPU for v3 lobbies; budgets go into `scripts/perf/budgets.mjs`.

**Lead defaults (2026-10-17) — in force until the user overrides them.** Work proceeds with these; each is
isolated behind one constant/setting so a later answer is a small change.

| Q | Default chosen | Why |
|---|---|---|
| Q1 speed | (c) keep 150 px/s in every world; play the vendor clip that fits the speed (the cast clips were already judged at v2 game speed, docs/CAST_GALLERY.md); `V3_SPEED_PX` in one place | fast movement is a v2 design rule ("voice-room picker") |
| Q2 camera | fixed yaw | no rebuild hitch; simplest; matches the demo's default |
| Q3 nicksong / brianbi | flat v2-sprite billboards, still pickable | nicksong is a user-requested character; hiding it would remove a feature |
| Q4 phones | Classic under Auto at launch; "v3" forced in Settings still works | perf unknown on phones |
| Q5 interiors | accept ≤ 0.5 m tile snap | invisible-wall risk is small; revisit with screenshots |
| Q6 pixel3d republish | use what is published on v3-dev; merge v3-dev + re-run `scripts/v3/import-assets.sh` when the UI session publishes | another session owns it |
| Q7 v3 default world | decide at C3 with screenshots (user) | product call |
| Q8 dais | solid disc (demo collision) | matches the art |
| Q9 world switch | fixed at lobby creation | simplest |
| Q10 render host | NOT used until the user allows it (CLAUDE.local.md forbids the other machine for this project). Visual stills: SwiftShader on the host inside the capped slice (CPU only, never the host GPU), lowest quality, few frames. Real perf: `ct.debug.v3perf` on the dev service from the user's own devices | respects both host rules |


**User requests in flight on the pixel3d side (2026-10-17) — wire them on the game side as they land in `v3-dev`:**
1. **Voting-circle camera** reframed to show more of the players and the clock tower's clock. Game side (WP3/WP1 camera):
   use the vendor's new vote framing whenever the player is on the dais/circle during nominations and votes.
2. **The clock tower's clock is the Storyteller's timer** and gets a tasteful in-universe **digital readout**. Game side:
   drive the tower clock face + readout from the game's existing stage timer (`game:view` clock / `endsAt` / `serverNow`;
   the Storyteller already sets it from the ST panel; v2.1 clock). No new server feature unless the timer data is missing
   (then protocol change by WP0/rules owner). Falls back to the time-of-day hands when no timer runs. (WP3, UI parts WP6)
3. **No NPCs in the voting circle** (there are enough characters now). Game side (WP2 NPC roamer + WP5a export): NPC
   homes/paths must never enter the square/circle area in v3 worlds; v2 unchanged.
4. **The clock tower can be entered.** Game side (WP5a export + server world): when the vendor adds the clock tower
   interior, export it as an enterable building (door, interior band, collision) and wire it like the cottages (WP3
   interiors). It is not a player's home: decide visitability like other non-home rooms (open to all by day).
Until a change is published, keep the current behaviour; the lead merges `v3-dev` + re-runs `scripts/v3/import-assets.sh`
when it lands and notes it here.

### 9.2 CONTRACT-REQUESTs for the pixel3d session (collected; append, never edit vendor)

- `Engine({parent, size, rendererOptions: {powerPreference, failIfMajorPerformanceCaveat}})` + `dispose()` +
  `offUpdate(fn)`. Today shimmed in `engineHost.ts`.
- Town `dispose()` (`town.js` has none).
- `town/api.js buildPiece`: a static piece map (`import.meta.glob`) instead of `import(PATHS(id))`.
- `demo/characters.js`: static optional imports for `smear.js`/`fx.js`; `sourcePrint` behind an option.
- `demo/roster.js`: static `roster.json` import.
- `ground.js`: an explicit grass-area option (replaces `buildWide`'s stack sniffing).
- `demo/time.js`: an external-clock mode, or an exported look interpolator, not tied to the demo store.
- `life`: an external-clock mode (already noted in `time.js`), and a "game mode" preset equal to
  `lifeOff=walkers,doors,folk,cycle,ambient`.
- `dais`: confirm the 15-stone mapping (§2.4) is intended, or add a seat-count-aware `seatAngle`.
- `src/ui/**` icon fetch path configurable (`markers/draw.js`, `indicators/hud.js` hard-code `out/ui/portraits.json`)
  [unpublished].
- `spec.ghost: {hover}` for the 16 measured `clips` specs (chonk, crow, fox, frog, goat, green-hood, honk, mole, moth,
  mushroom, owl, polly, rabbit, skeleton-chef, snail, toad) and storyteller, wanderer (WP2 re-measured, §4); a `point`
  clip for nicksong (every other cast spec has one now).
- (WP2) `createCharacter(engine, id, {lights: false})` (today `vendor/characters.ts suppressSpecLights` pre-fills the
  private `ch._lights`), and a public `handle.sockets` / `handle.ghost` (today read via `ch.rig.sockets`, `ch.ghost`).
- (WP6) `v3/assets/ui/panels.css` (bake output of `tools/uibake.sh panels`): the last line has one `}` too many after
  the `@media (prefers-reduced-motion: reduce)` block; postcss (Vite) rejects the file, so the game links it raw.
- (WP6) Optional: a `nick_face` emote frame and `icon_nicksong` / `icon_brianbi` in the v3 bakes (today documented
  skips that keep the v2 art in v3 lobbies).
- Delete the stray temp files `v3/assets/sprites/.skeleton-chef-preview.png.wgV9lp` and
  `.frog-preview.png.7amzXJ` upstream, so the next import drops them.

### 9.3 Risks

| Risk | Mitigation |
|---|---|
| A vendor re-publish breaks rewrites, facade or wrappers | Plugin fails the build; runtime assertions in `engineHost`; vendorHash test; vendor guard; vendor-diff review (§10) |
| Quantised collision vs 3D visuals | Doorway-centred anchors, error table, WP5a tests, Q5 |
| Mixed renderers in one lobby | One layout per room; `v3-mixed` e2e |
| A 15-player rig build stalls joins | One-per-frame queue; preload specs in the lobby |
| OOM / context loss / weak GPUs | Boot guard; full rebuild then Classic; low starting tier on iGPU/tablets; sampler at safe moments |
| v3 e2e load on the production host | Single host-wide flock, `nice -n 19`, fps 15, 960×540, low tier |
| Draw calls with 15 characters + overlays | Re-baselined budget, character LOD, transform-only overlays |
| Misleading ambient life | `lifeOff` set + gated tower + `v3-life` e2e |
| The UI conversion keeps moving | Adopt only the baked atlases now |
| (found in WP0s, pre-existing v2) A touch long-press within ~136 px of the viewport edge: `radial.ts show` clamps the pie centre away from the finger, so lifting in place lands on a wedge and commits it (`v2-social.spec.ts` "desktop and phone" fails whenever the target sits there; reproduced on the C0 tree) | world-art / qa-deploy: release relative to the press point, or start the touch gesture `left`-aware; then the spec is stable |

---

## 10. How to continue (for future agents)

- **Current state (2026-10-17, after C0b):** WP0, WP0s and WP5a are committed on `v3-game`. v3 lobbies can be
  created (`world: 'v3'` → `townLayoutV3`, Hollowmere); the gameplay/social logic is Phaser-free in
  `game/gameplay/core.ts` and `game/social/controller.ts` (import those directly from `game3d/**`, not the
  `index.ts` barrels, so `phaserView` stays out of the `town3d` chunk). Next: phase 1 (WP1 ∥ WP2 ∥ WP3 ∥ WP4 ∥ WP5b ∥
  WP6), then C1; WP7 harness may proceed. Known open items: `v2-social.spec.ts` "desktop and phone" is flaky on the
  pre-existing pie-edge bug (§9.3, world-art/qa-deploy); WP0s review lows (widen the import-closure scan to
  `export … from`/side-effect/dynamic imports; expose `GameplayFrame.picking` as `{ label }` only). Summary for
  humans: `docs/progress.md` "v3 status".
- **Running things on the host from a v3 worktree:** `remote.sh` quotes each argument, so wrap lock/pipe chains in
  `sh -c '…'` and use `$HOME` (not `~`) inside it, e.g.
  `CT_AGENT=v3-<name> scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock pnpm test'`.
  `tests/security/web-client.test.ts` reads the built `apps/client/dist`: run `pnpm build` before `pnpm test`.
- **Where state lives:** this file (contract; §8 Status table), `docs/progress.md` (lead), `docs/test-results.md`
  (qa), §11 decision log, `grep -rn "CONTRACT-REQUEST" apps/client/src/game3d`.
- **Refreshing the vendor copies.**
  - `v3/pixel3d/` arrives on `v3-dev` from the pixel3d session's publish script. Before merging `v3-dev` into
    `v3-game`, review the vendor diff as text (`git diff <last merged v3-dev>..v3-dev -- v3/pixel3d`), looking for
    new network access, `eval`-like code, new dynamic imports, and changes to the patched snippets. Never edit
    `v3/pixel3d` here.
  - `v3/assets/` is refreshed by `PIXEL3D_DIR=… scripts/v3/import-assets.sh` (rsync `--delete` + private-path and
    5 MB checks, `scripts/v3/import-assets.sh:8-11`).
- **After a refresh:**
  1. Update the "Vendor baseline" line at the top (commit + hash).
  2. `CT_AGENT=v3-world scripts/remote.sh node scripts/v3/export-hollowmere.mjs`; commit the JSON if it changed.
  3. `CT_AGENT=v3-qa scripts/remote.sh pnpm build` (plugin patterns, one three copy).
  4. `pnpm test` (vendor guard, vendorHash, castMap ghost probe).
  5. `scripts/v3/render-check.sh` for visuals.
- **After every commit:** update the §8 Status row, §9 (resolved questions), §11; record test commands for
  `docs/test-results.md`; run `scripts/secret-scan.sh` before any push (no hostnames, hardware or home paths in
  tracked files).
- **Never:** visual/perf-check on the game host's GPU; use another machine without Q10; edit `v3/pixel3d/**` or
  `v3/assets/**`; import `@pixel3d/*` outside `game3d/vendor/`; break v2 lobbies (the default world); run more than one
  v3 e2e on the host at a time.

## 11. Decision log

- 2026-10-17: Per-room world (`v2` | `v3`). The v3 world = Hollowmere exported into `townLayoutV3`; v2 untouched.
- 2026-10-17: 1 m = 16 px, X = x/16, Z = y/16 outdoors. Interiors are translation-only into 12×12 band rooms.
- 2026-10-17: Seats map to the 15 fixed dais stones by `round(k·15/n)`, on server and client alike.
- 2026-10-17: World-anchored UI is DOM-over-canvas until pixel3d `src/ui` is published. Screen UI stays Preact.
- 2026-10-17 (rev 2): Interior bands stride 13 (w 12), `widthTiles` 112, `heightTiles` 43; doorway-centred anchors;
  `interiorDoor` = spawn tile above the doorway; no display clamp.
- 2026-10-17 (rev 2): World fixed at lobby creation (`CreateLobbyRequest.world`); modules read `host.layout()`.
- 2026-10-17 (rev 2): three resolved by explicit aliases from `apps/client`; vendor globs written inside the patched
  vendor file; optional/sourcePrint/roster/grass rewrites.
- 2026-10-17 (rev 2): `createTime` reused through a facade with frozen phase/seats; dais driven directly with
  `setHand` and `t0 = −1e9`; life built with `lifeOff=walkers,doors,folk,cycle,ambient`.
- 2026-10-17 (rev 2): Ghost look by capability probe (`shared` / `clips` / `tint`).
- 2026-10-17 (rev 2): Tier changes and context-loss rebuilds always create a new Engine.
- 2026-10-17 (rev 2): v3 layout loaded lazily (`@ct/assets/hollowmere`) before GameScreen mounts; budgets in br.
- 2026-10-17 (rev 2): Perf comes from real devices via `ct.debug.v3perf`; a separate render host only after Q10.
- 2026-10-17 (rev 2): Server speed stays 150 px/s pending Q1 (options re-framed on the vendor's `gameSpeed`).
- 2026-10-17 (WP0): `warmTown` no longer prefetches the 3D chunk before the world is known; it is fetched on the first
  `lobby:view` with `world: 'v3'` (a v2 join must not download three.js). LobbyRoute waits for that first view and
  `ensureLayout` before mounting GameScreen.
- 2026-10-17 (WP0): the server refuses `world: 'v3'` lobbies (409) until WP5a's layout exists, instead of creating a room
  that cannot build its modules; client `currentLayout()` throws "v3 layout not built" meanwhile.
- 2026-10-17 (WP0): boot guard split into `bootGuard.ts` (read, main bundle) and `bootMark.ts` (write, lazy chunk), to keep
  the lobby chunk inside its +2 KiB br budget (measured +1.9).
- 2026-10-17 (WP0): `GameScreen` deletes `window.__ctCamera` / `__ctSocial` after every renderer's `destroy()` (Classic's
  TownScene never removed its hook); the DEV-only `__town` is left to TownScene (its name must not appear in production
  bundles, `tests/security/web-client.test.ts`).
- 2026-10-17 (WP0): the 3D entry chunk is named `town3d` by module id in `chunkFileNames` (rollup leaves its
  `facadeModuleId` null). Measured: `town3d` 222 KiB br (budget 230), entry +0.2 KiB br, lobby +1.9 KiB br.
- 2026-10-17 (C0): gate passed (typecheck, build, full `pnpm test`, smoke-mount); WP0 committed by `v3-gate`. Owner
  sign-offs for WP0's minimal edits in other owners' files (qa-deploy: `tests/security/leakage.test.ts` `world` key,
  `.github/dependabot.yml` three ignore; lobby-auth: GameRoom/directory/fakeHost; world-art: TownScene, GameScreen,
  gameplay/sound; rules-storyteller: hints/script/stage) are recorded in the C0 commit message.
- 2026-10-17 (WP0): the extracted rules live in `apps/client/src/game/rules/{input,doors,movement,cast}.ts`; `castKey`
  is split into the renderer-free `castIdentity` (rules/cast.ts) and TownScene's sheet-key lookup.
- 2026-10-17 (WP5a): Hollowmere collision = vendor walk shapes at the feet point plus four derived rules (§2.2 "Collision
  rules as built"): thin-prop centre tiles, door tiles opened through border ground, camera-hidden tiles blocked (feet
  and head behind hard cottage / tower geometry; canopies excluded, door approaches kept), unreachable pockets blocked.
  Hidden-tile check is a ray cast on the real geometry, not the `occl` line (the contract wording was inverted).
- 2026-10-17 (WP5a): everything is exported headless in Node (stub engine), no chromium step; `collision` is stored as
  row strings; the exporter fails on any vendor `console.warn` and checks every interior's doorway/exit anchor.
- 2026-10-17 (WP5a): `layoutFor(world, v3?)` lives in `packages/assets/src/hollowmere/layoutFor.ts` (re-exported from the
  index; imports no v3 data). `sound/areas.ts` fetches `townMapV3` through the same lazy `@ct/assets/hollowmere` chunk
  and caches its derived fields per world; outdoor ambience is silent for the few ms before that chunk resolves.
- 2026-10-17 (WP5a): `navigation.test.ts` v3 doorsteps: the tile in front of a door may be map-border forest when the
  door opens onto the road along the map edge (house-9's bay door, house-12's west-edge door).
- 2026-10-17 (WP0s): `gameplay/index.ts` and `social/index.ts` stay as barrels over core/controller + phaserView, so
  `TownScene.ts` and every other importer are unchanged. The vote-clock smoothing and all bob/pulse animation stay
  in the views (render-only state); the core hands out targets. The controller owns the emote models and the
  `__ctSocial` members `seen/hold/radial/pie`; each view adds its own `emotes/pins/zoom`.
- 2026-10-17 (C0b, `v3-gate`): WP0s and WP5a committed together as one "v3 C0b: …" commit after typecheck, build and
  full `pnpm test` (131 files / 1506 tests pass, 3 skipped) on the host. The known `v2-social` phone-edge flake is
  pre-existing v2 (reproduced on the C0 tree) and does not block C0b; it is tracked in §9.3.
- 2026-10-17 (WP5b): Classic draws each v3 cottage with its own v2 sprite, axis-aligned and shifted so the sprite's door
  is the v3 door tile (not centred in the placed AABB, which would put the drawn door off the real one); house-12 is the
  one exception (generic south-facing cottage, `objects-v3.*`), because its v2 sprite would be entirely off the map.
  Blocked floor tiles of the v3 rooms get decorative v2 furniture. The v3 art is generated in a second process
  (`scripts/v3/classic.ts`) so `scripts/ground.ts` needed only an import change; v2 outputs stay byte-identical.
- 2026-10-17 (WP5b): the v3 Classic URLs live in `@ct/assets/runtime-v3` (not `runtime`), so the entry chunk does not
  grow; `square-props-v3.json` carries only `meta.houses` (frames come from the v2 sheet).
- 2026-10-17 (WP5b): `hollowmere.test.ts` lets any `game3d/**` module `import()` `@ct/assets/hollowmere` (that tree is
  dynamic-only); WP2's `game3d/avatars/npcs.ts` does.
- 2026-10-17 (WP4): world-anchored sprites are blitted on one texel-resolution 2D canvas over the 3D canvas; only
  text is DOM. Animation frames therefore cost a `drawImage`, not a DOM mutation, and the overlay needs no stylesheet
  (no `CSS_ORDER` entry). Positions are rounded to the texel grid (≤ `pixelScale`/2 CSS px from `worldToScreen`).
- 2026-10-17 (WP4): `Layer3d.update` runs before `renderAt`, so the overlay records the state and does its DOM batch in
  a microtask, which runs after the RAF callback (after `renderAt` / `camera.update()`) and before paint (§1.5 / §7
  "after renderAt" without a contract change).
- 2026-10-17 (WP4): `v3WalkDomMutPerSec` = DOM writes per second **excluding** transform writes (nodes, text, style
  other than `transform`, visibility), from `__ctCamera.overlay().mutationsPerSec`; transform writes are reported
  separately (`transformsPerSec`) since every label moves while the camera pans. Measured in the scratch smoke while a
  remote walks: 0 / s non-transform, ≈ 60 / s transforms (3 labels + 2 bubbles, 60 fps).
- 2026-10-17 (WP4): the talking indicator is the indicators atlas' `talk_*` glyph + `talk_ring_*` ground ripple (the
  atlas' renderer-without-outline-pass variant); an emissive rim needs an `AvatarRegistry` hook from WP2 (requested).
  A speaker's chat bubble climbs over the person pins on that speaker.

- 2026-10-17 (WP6): the kit tokens are applied by CSSOM on `<html>` from `kit.json` (no `theme-v3.css`, so no `CSS_ORDER`
  entry and no hand-copied colours); the vendor `panels.css` is linked raw in v3 lobbies (Vite rejects its stray `}`).
- 2026-10-17 (WP6): the v3 skin is gated on the lobby's world (not the renderer), so Classic-in-v3 clients see the v3
  UI too; the hour is computed client-side from the game view (`skinHour`, §3.1 table).
- 2026-10-17 (WP6): `castPortrait.ts` takes a pluggable `PortraitAlt`; the v3 strip implementation ships in the lazy
  atlas chunk to keep the entry chunk inside its +1 KiB br budget.

- 2026-10-17 (WP1): the 3D core is one `createCore3d` object per mount that survives rebuilds (scene attach /
  detach), and the mount owns exactly ONE `GameplayCore` (exposed to WP4) so `gameplayState` / Escape / pick have one
  writer. Rebuild / fallback decisions live in `net/lifecycle.ts`, building stays in the composition root.
- 2026-10-17 (WP1): pick proxies default to the layout footprints + 0.35 m, 5 m high; a house counts only when the ray
  meets it before the ground. The camera's ladder / preset numbers are copied from the vendor (only `vendor/` may
  import it) and pinned by `core.pick.test.ts`. `__ctCamera` is installed at core creation (`v3().ready` false
  until a scene is attached).
- 2026-10-17 (WP1): own poofs stay Storyteller-only as in v2; every placement emits `placed` (WP2's cross-fade).

- 2026-10-17 (WP3): the constant light pool is split: town pool = tier budget − 2 (time facade `lights`, and the same
  `lights` for the composer's golden / night builds), plus a 2-light reserve that `borrowLight` lends to carried
  lanterns; total stays 12 high / 8 low.
- 2026-10-17 (WP3): the town is built at the vendor preset of the starting stage hour (`presetForHour`, as the demo
  does) and the facade interpolates from there; the hour is the §3.1 table smoothed by `createHourClock` (jumps > 1 h
  ease 1.5 s, forward unless that is > 14 h).
- 2026-10-17 (WP3): door art moves only on location changes outdoors ↔ `bld:house-i` seen in `Scene3dState` (own +
  remotes); the bell rings on every observed game-phase change (never on the first look); the facade store drops
  writes to `phase` / `nominee` / `seats` so `createTime` never touches the dais after its first apply.
- 2026-10-17 (WP3): boarded cottages = `!houseInUse` (public seats); dark via a `setLit` gate installed before
  `createTime`, plus a hidden-by-default kit-Builder plank prop per door (no new program).
- 2026-10-17 (WP3): interiors cache 2 rooms (LRU) and park the town only after the warm-up; the warm-up builds house-0
  and renders it once, and draws every dais state (`showcasePlan`) before the whole-town frame.
- 2026-10-17 (WP3): `TownGame3d.ts` (lead) got the minimal stage wiring (createStage, layer, warm-up, services,
  `state.hour`) so the stage runs before C1; the lead may restructure it with WP1's core.
- 2026-10-17 (WP2): the §4 ghost table is the MEASURED probe (10 cast + 4 npc `shared`, 16 `clips`, storyteller /
  wanderer / billboards `tint`); `castMap` prefers the live probe, `GHOST_BASELINE` is the test's expectation.
- 2026-10-17 (WP2): 'clips' ghosts slide by moving a holder group around the vendor Character (which stays at the slide
  anchor, so its gait never leaves the held ghost loop) instead of an `action: 'ghost'` drive (a loop clip given as a
  drive action only replaces idle). Revival of a 'clips' ghost rebuilds the body.
- 2026-10-17 (WP2): ghost translucency (alpha 0.6 / 0.8) and the 120 ms teleport cross-fade are a 4x4 ordered dither in
  the colour pass (`ghostTint.ts`, uniforms only), not `transparent` (three's OPAQUE define would recompile and sort).
- 2026-10-17 (WP2): the stand-in's "pin colour" is a pid hash over the pin palette (a member's pin colour is a
  device-local preference that never reaches other clients). Fallback chain: rig -> tinted `wanderer` -> v2 billboard.
- 2026-10-17 (WP2): billboards (brianbi, nicksong) use the v2 sheets with 8 directions and their v2 ghost frames, a toon
  material lit as up-facing ground, on the COLOR_ONLY layer; spec `lights` are suppressed (constant light count) and
  lanterns borrow WP3's reserve via `borrowLight(anchor)` (`lanterns.ts` matches `world/lights.ts`).
- 2026-10-17 (WP2): NPCs in v3 worlds never enter `inSquare` (user request "no NPCs in the voting circle"); v2 unchanged.

## 12. Review log (round 1)

All 48 review items were checked against the code at the vendor baseline. Accepted items are folded into the
sections named; corrections and rejections:

- **Accepted as stated:** three resolution (two duplicate items, §1.3.2) and glob root; projection margin/offset
  (§1.5); life/time facade (§3.1); schema fields (§2.2); interior door and sizes (§2.3); Classic-in-v3 work (§2.5);
  Phaser-bound layers (WP0s); hidden C0 dependency (phase 0b); render host wording (§6.3, Q10); lobby world (§2.4);
  `town-lights` order (§1.3 step 5.6); grass area (§1.3); dispose/updaters (§1.3); clock formula (§3.1); dais units
  (§3.2); speed (§4); roof picks (§3); back lane (§2.2); missing feature rows (§3); ownership gaps (§8); debug hook
  semantics (§6.1); warmTown (§1.1); light-pool order and park reimplementation (§3, §3.1); counts and night atlases
  (§4, §5); display clamp (§2.3); probe/v3force/SwiftShader args (§1.2, §6.2); sampler under fps cap (§1.2);
  optional/sourcePrint (§1.3 step 3); `strict` builds (§1.2); real-device perf (§6.3, §7); tier start and safe
  moments (§1.2); crash-loop guard (§1.2); e2e port and host load (§6.2); bundle budgets in br and lazy layout/atlases
  (§2.4, §5, §7); C3 gating (Q7); overlay DOM cost (§7); vendor guard (§1.3 step 6, §10); GameScreen effect split
  (§1.1); context loss (§1.2); dependabot pin (§1.3 step 1); continuity (top, §8 Status, §10); harness build (§6.3).
- **Corrected:** "18 of the 33 cast specs have no `spec.ghost`": the probe finds 17 cast specs (8 with own ghost clips,
  9 with nothing) plus `wanderer`; brianbi has no spec at all (billboard). The `buildWide` port is replaced by a
  build-time `ground.js` patch, because the stack-sniffing regex cannot survive hashed chunk names. Interior bands:
  chose stride 13 with w 12 (MAP_W 112) rather than w 13, which house-3 does not need. The suggestion to put the
  harness on the dev service conflicts with "never deploy the harness"; the dev-service path is instead the
  production-safe `ct.debug.v3perf` overlay in the real game. Interior lights: we do not call `aimLights` directly;
  `createTime` re-aims the constant pool when the facade's `player.interior` changes (`time.js` update), which is the
  same mechanism.
- **Alternative not taken:** the dais auto-sweep unit conversion (`perSeat = stepMs·n/15/1000`). We drive the hand
  with `setHand` only (§3.2); a server-to-engine time map would add drift.
- **Rejected:** "the constructor's first `resize()`/`_pickScale()` read `window.inner*` before the shim exists" as a
  defect. It costs one throw-away allocation of pipeline targets at window size, immediately replaced by
  `hostResize`; noted in §1.3 step 5.2, no further work. Also rejected: "leave the sweep params unset" as a way to
  disable the sweep. `setPhase('vote')` merges into the default `{t0: 0, perSeat: 1.2}`, and the level loop lights a
  seat's vote lamp only once the sweep has reached it (`dais.js voteProgress`), so §3.2 sets `t0 = −1e9` instead.
- **Render host decision (Q10) is the user's;** this document does not authorise using any other machine.
