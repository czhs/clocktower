# v3 integration contract: the pixel3d town in the multiplayer game

Status: **binding contract** for the v3 game swarm (branch `v3-game`, based on `v3-dev`). Written 2026-10-17 by the
v3 integration architect, revision 2 (review round 1 resolved, see §12). Paths are repo-relative.
`v3/pixel3d/**` and `v3/assets/**` are **read-only vendor inputs**. `$PIXEL3D_DIR` is the maintainer's local pixel3d
checkout, the default in `scripts/v3/import-assets.sh:6`; anything that exists only there is marked
**[unpublished, Q6]** and is not available to other worktrees.
Do not write machine names, hardware, tailnet names or home paths into this file: the repo is public, and
`scripts/secret-scan.sh` checks for them. Host specifics live only in the gitignored `CLAUDE.local.md` /
`ops.local.env`.

**Vendor baseline.** Checked against the `v3/pixel3d` tree of `v3-dev` `bd4c9ff` (2026-10-18: demo pass A + pass B +
the seal-vote rounds; merged into `v3-game` as `5fb072f` "v3: merge v3-dev pass A+B (vendor)"), with
`find v3/pixel3d/src -name '*.js' | LC_ALL=C sort | xargs cat | shasum -a 256` = `68adf1d4a8012201…` (previous baseline
`8b50668`, `43efbcd05609e2b8…`). Vendor code is
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

- a failed v3 import (no in-page retry since C1, §9.3: Chromium keeps the failed module fetch, and a fresh-URL copy
  of `town3d` cannot link because its sub-chunks import it by its plain URL; a reload picks the chunk up again);
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
      listener calls the shadowed method; (C1) the host records the window listeners the constructor adds (a
      synchronous `window.addEventListener` wrapper for the constructor's duration only) and removes them on dispose.
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
     render targets, `renderer.dispose()`, `renderer.forceContextLoss()`; remove the canvas; remove the constructor's
     window listeners; then null EVERY own field of the engine (C1: a leak check found ~135 MB of town retained per
     mount through the engine shell: pieces park state on it (`townLights`, `townCutaway`, `_treeSorters`, …) and the
     vendor's engine-keyed material caches (`kit.js KIT`, `interiors/kit.js VOID_MATS`, `house-7 CAP_MATS`,
     `props.js MATS`) keep three's renderer `dispose` listeners, i.e. the renderer and its scene).
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
TownGame3d.ts      createTownGame3d(parent, bridge) — composition root (C1): ONE net/core per mount + net/lifecycle
                   (re)builds; per Engine: stage -> avatars -> warm-up -> attachScene -> overlay; loop; destroy order
select.ts          chooseRenderer(), probe, prefs (static import; no three)
bootGuard.ts       crash-loop guard, read side (static; no three)
bootMark.ts        crash-loop guard, write side (boot marks, BootTracker; lazy chunk only)
perf.ts            rAF sampler, safe-moment scheduler
contract.ts        shared interfaces below (no three types leak out of game3d)
coords.ts          px <-> metres, interior affine maps (§2.3), projection maths (§1.5) — pure, no three import
vendor/            engineHost.ts, town.ts, characters.ts, interiors.ts, time.ts  (only importers of @pixel3d;
                   WP0 ships minimal town.ts / characters.ts stubs that WP3 / WP2 then own)
world/             town build, doors, boarded houses, interiors switching (+ the clock tower room), time-of-day,
                   dais, clock tower timer face (towerClock.ts), the voting-circle frame (voteFrame.ts)     (WP3)
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
| `widthTiles` | **`125`** = 45 + 2 + 6·13 (was `112` = 45 + 2 + 5·13 until the enterable clock tower, 2026-10-18) | Full map width (town + gap + 5 cottage band columns of stride 13 + a 6th column for the clock tower's room, §2.3). Collision is row-major over `widthTiles·heightTiles` (`packages/protocol/src/world.ts:53,69`, `apps/client/src/game/path.ts:27-32`). |
| `heightTiles` | **`43`** | `max(TOWN_H = 43, 1 + 2·14 + 12 = 41)`. |
| `townBounds` | **`{x:0, y:0, w:45, h:43}`** | Read by `apps/server/src/world/index.ts:837`, `apps/server/src/social/index.ts:157`, `apps/client/src/game/sound/areas.ts:76`, `TownScene.ts:58`. |
| `ground[]` (43 strings of 125) | `layout.ground` | Same char codes as v2 (`BLOCKING_GROUND` identical). |
| `collision` (town part) | rasterised walk shapes | Tile blocked if its **feet point** (tx+0.5, ty+0.875) m lies inside any shape of `src/demo/collision.js createCollision`: house outlines (rotated), the clocktower box, the **`backlane`** boxes behind the north row and the 1 m slots between those buildings (players there are hidden by eaves), prop circles/boxes, and the **dais** circle (r = `DAIS_R` 2.4 m at `layout.CIRCLE`). Walk-through props do not block. |
| `buildings[i]` (`house-0..14`) | `layout.houses[i]` | `footprint` = tile-quantised AABB of the placed outline. `door` = `houses[i].door` (tile in front of the real door). `doorNormal` = `houses[i].doorNormal` (new optional field, §2.4). `name`, `houseIndex` unchanged. |
| `buildings[15]` = the clock tower | `layout.clocktower` + `src/demo/tower-interior.js buildTowerRoom` (vendor pass B) | **Enterable** since the 2026-10-18 vendor refresh (user request, §9.1 item 4): id / kind `clocktower`, `houseIndex: null` (nobody's home: no `bed`), `door` (22,9), `doorNormal` (0,1), `interior` = the 6th band column `{112, 1, 12, 12}`, `interiorDoor`, `visitPoint` (the vendor's, on the landing; the server places a Storyteller visit at `interiorDoor`, as for every non-cottage). The top-level `clocktower` field and `townMapV3.landmarks` are gone (`landmarks: []`); v2 keeps its non-enterable landmark. |
| `towerRoom` | the tower room's 3D anchor | `{anchorPx, anchorM}`: px = `anchorPx + (m − anchorM)·16` (bld:clocktower; `anchorM` = the vendor room's exit spot (650, 22.5) m, `anchorPx` = its doorway tile's centre). Exported as `towerRoomV3` from `@ct/assets/hollowmere`. |
| `circle` | `layout.CIRCLE` | `{cx:360, cy:316, rx:100, ry:100, startDeg:0, sweepDeg:360, stones:15}` (new optional `stones`). |
| `square` | `layout.SQUARE` | `{cx:360, cy:364, r:144}`. |
| `playerSpawn` | `(22,27)` | Unchanged. |
| `storytellerSpawn` | **moved** to `(22,23)` | Feet at y = 23.875 m, 4.1 m from the centre: outside the dais, inside the seat ring. v2 `(22,20)` is inside the dais. Q8 may change this (walkable stage). |
| `streetlights` | `layout.streetlights` | Unchanged meaning. |
| `interiors[i]` | §2.3 | `interior` rect, `interiorDoor`, `bed`, `visitPoint`, blocked tiles. |
| `npcHomes` | the game's list (`TownScene.ts:1421-1451`) re-checked against the new collision | Moved to the nearest free, reachable outdoor tile if blocked **or inside the plaza ellipse × 1.1 / the square** (user request "no NPCs in the voting circle"; since 2026-10-18 the sweeper's home moved (16,12) → (16,10)). |
| `meta.wallError` | per house `{x, z}` m | The §2.3 quantisation error, for review. |
| `meta.*` (WP5a) | `occl` (vendor `?occl=1` stat), `hidden` / `hiddenKept` / `hiddenSoft`, `pockets`, `openedDoors`, `interiorPockets`, `outlines` (placed corners), `doorPoints` (+ the tower), `rooms` (+ `clocktower` 8 × 5.5 m), `interiorFreeTiles` (+ `clocktower` 22), `towerHeights` (tile → floor height m), `towerCliffs` | Review data and the inputs of the assets tests. |

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

**The clock tower room (as built 2026-10-18, v3-world, vendor pass B).** The exporter builds the vendor's walkable
clockwork room (`src/demo/tower-interior.js buildTowerRoom(engine, demo)` against the stub engine and a stub `demo`)
and maps it like a cottage, translation only, into the 6th band column `R = {112, 1, 12, 12}`, anchored on the room's
3D **exit** spot (in the doorway: its tile is the doorway `D = (R.x+6, R.y+11)`, blocked `D`; the 3D spawn maps to
`interiorDoor` = the tile above). A tile is free iff its feet point lies strictly inside the 3D floor (8 × 5.5 m) and
outside every collider (rects, circles and centre boxes: landing rail, balustrade, the movement's cage, gallows,
pendulum, bell rope, workbench, ladder). The room has height (`raw.heightAt`: floor 0, an 8-step stair up the east wall,
a 1.1 m landing along the back) and its rail / balustrade are thinner than a tile, so one more rule: **a free tile with
a free 4-neighbour more than 0.5 m higher is blocked** (`meta.towerCliffs`, 4 tiles under the landing's front); the
stair's own steps are 0.41 m, so the landing is reached by the one-tile stair column only. Result: 22 free tiles (12
floor, 3 stair, 7 + 2 landing), `visitPoint` (119,8) on the landing, no bed. Known gap: a side step from the floor onto
the stair's second step (0.41 m) passes the balustrade line on the grid (the 3D draw is still on the step).

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
- **Clock tower** (`bld:clocktower`, since 2026-10-18): the same translation with the room's 3D exit spot on the doorway
  tile centre: `X = 650 + (x_px − 1896)/16`, `Z = 22.5 + (y_px − 200)/16` (`towerRoomV3`), floor height from the vendor
  room's `heightAt(X, Z)` (stair / landing). As built (C1): `coords.ts TOWER_ROOM` (= `towerRoomV3`, pinned by
  `coords.test.ts`), `roomMapOf(loc)` (cottages and the tower) and `locToM` cover it; the floor height comes from the
  built room (`Stage.floorAt`, used by the camera projection, the pick and the avatars' feet).
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
  `generated/town-v3.json` (Tiled map, 125×43 since the enterable tower (112×43 before), ground + door object layers from `townMapV3`) and
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
  painter, 4097 unique tiles), `generated/town-v3.json` (125 × 43; ground / decor / collision layers, the collision
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
- **Outdoors, no invisible walls either** (`placement.ts` `daisObject` / `outdoorFiller`, review fix 2026-10-17). The
  v3 collision blocks outdoor tiles that would otherwise look like open ground: tiles the 3D camera cannot see behind
  a house (meta `hidden`), the rim the 3D forest fills, the dais, and AABB edges of rotated houses that the upright v2
  sprite does not cover. (1) The blocked tiles around the plaza centre (21 tiles, 5 × 5 without the corners) get a
  raised round stone plinth, frame `dais@v3` in `objects-v3.*` (type `prop`, depth = its bottom edge); the v2 compass
  rose is under it. (2) Every other blocked town tile next to walkable ground (4-neighbours) that no building / dais
  sprite (≥ 50 % opaque pixels on the tile), prop blocked rect or `BLOCKING_GROUND` code covers gets a decorative
  blocking v2 piece, together with the rest of its uncovered blocked patch: horizontal pairs become pines (never with
  a crown over a house, the dais or a door tile), single tiles bushes / stumps / rocks (247 pieces today; the rim
  reads as forest, the patches behind houses as groves). Decoration only: the collision stays the server's. Pocket
  tiles nobody can reach stay as painted (no ground code change: `terrain-v3.*` is unchanged by this pass).
- **TownScene.** `init()` reads `currentWorld()` / `currentLayout()`; `L`, `TS`, `TOWN`, `PLAZA`, `SQUARE_VIEW`,
  `FX_HOUSES` and the NPC homes are instance fields; `preload` picks the v3 files in a v3 lobby
  (`@ct/assets/runtime-v3`, imported only by the lazy Classic chunk); `create` checks the map's `world` and size
  against the layout (a mismatch throws). Door spots keep the server building but carry the **drawn** footprint
  (taps, boards, planks follow the sprite); `doorInward` = `−doorNormal` (rules/doors.ts). Townsfolk in a v3 world
  never stand inside the plaza ellipse × `NPC_PLAZA_CLEAR` (1.1) (user request "no NPCs in the voting circle"; v2
  unchanged): `npcSpot` gates both the spawn (`nearestFree`) and every roam step. Pigeons / cat read the
  fountain / benches from the map's object layer (same values in v2). `createBoardTokenLayer` takes the world's
  `houses` (board slots per world). New Classic-only debug member `__ctCamera.town()` →
  `{world, widthTiles, heightTiles, mapWidth}`.
- **Tests.** `packages/assets/test/classicV3.test.ts` (18: freshness `sourceHash` (below) and v3 plaza = v2 `PLAZA`
  (TownGame sizes the canvas with the v2 square view before a scene exists), map = layout, decor layer = the v3
  decals tile for tile, atlases WebP == PNG, sprite doors on v3 doors, overlays shifted, furniture covers every
  blocked floor tile and never a free one, beds next to every bed spot that has a blocked floor pair beside it and in
  no other room, outdoor objects = `outdoorProps()` + dais + `outdoorFiller()` anchor for anchor (recomputed from the
  atlas pixels), no invisible walls outdoors, the dais sprite covers exactly its tiles),
  `apps/client/test/boards.houses.v3.test.ts` (board slots per world), e2e `tests/e2e/classic-in-v3.spec.ts` (all 15
  cottages entered by tapping, v2 → v3 lobby in one page without reload, page errors collected in all three tests,
  Q7 screenshots in `test-results/classic-v3/` incl. phone portrait / landscape in the town, townsfolk off the
  voting circle, a phone entering a cottage by a touch tap on its door). That spec stands in for the §8 list "`v2-phone` / `v2-look` / `doors` against a v3
  lobby": those three pin v2 geometry through `tests/e2e/helpers.ts` and need WP7's world-aware helpers; until then
  they run against v2 lobbies as Classic regression checks. Run it on a v3-world port (3475-3479, D4).
- **Known look gaps (Q7, not correctness).** Three v3 rooms (house-4, house-6, house-11) draw no bed: their 3D bed
  sits in the wall quantisation band (§2.3 wall error), so no blocked *floor* tile is next to the bed spot and
  furniture never covers a free or wall tile. House-12 (generic cottage) is drawn partly off the west map edge (≥ 50 % inside, tested), as its
  door is. Rotated houses stand upright inside or next to their placed AABB. **Sprite over walkable tiles** (players
  walk through these parts of a drawn house; ≥ 50 % opaque sprite pixels on a walkable tile, 37 tiles): house-14 11,
  house-4 8, house-12 5, house-7 4, house-10 4, house-11 3, house-13 2; all others 0. The reverse (blocked tiles no
  sprite covers) is filled outdoors (above), so it is no longer a gap.
- **The enterable clock tower in Classic (2026-10-18).** `drawnBuildings` takes the tower from `townLayoutV3.buildings`
  (same sprite and spot as before, `placement.ts towerAt`); its door is a plain door spot (no swing art, no chimney),
  the v2 ground painter adds a door spur, the room (band column 6) is painted like a cottage room and its blocked floor
  tiles (rail line, cage, workbench) get v2 furniture (no bed). `square-props-v3.json` has no entry for it (no boards,
  no boarded overlay). Open (lead / world-art, CONTRACT-REQUEST in the §8 WP5a row): `rules/doors.ts houseInUse`
  returns false for a building with `houseIndex: null` during a game, so Classic shows "Nobody lives here" at the tower
  door and generic planks on it; it must return true for non-cottages (v2 has none, so v2 is unchanged).
- **Refresh after a vendor re-publish.** When `export-hollowmere --check` reports a stale export, re-run it, then
  `pnpm assets:generate` (the v3 Classic pass follows `townLayoutV3`); `classicV3.test.ts` fails on any stale
  `town-v3.json`: its map property `sourceHash` = sha256 over `townLayoutV3` + `townMapV3` (ground, paths, objects,
  decals) + `npcHomesV3` + `placement.ts`, `classic.ts`, `scripts/ground.ts`, `scripts/lib/world.ts` (like
  `hollowmere.test.ts`'s `generatorHash`), plus collision, doors, decor, furniture, outdoor anchors and overlays. A new building id (e.g. an enterable clock tower)
  also needs a v2 sprite or a `GENERIC_SOUTH` entry in `scripts/v3/placement.ts` (`v2Def` throws otherwise).

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
| `shared` (`spec.ghost` present) | cilantro, clarabelle, greenting, maxflow, mincut, opal, preservation, progress, requin, theo-rem, npc-sweeper, npc-vendor, npc-elder, npc-porter; since the 2026-10-18 vendor refresh also crow, fox, frog, owl, polly, toad | `ch.ghost = ghostVoteAvailable ? 1 : 2`; works walking and idle. |
| `clips` (own `ghost`/`ghost-spent` loop clips, no `spec.ghost`) | chonk, goat, green-hood, honk, mole, moth, mushroom, rabbit, skeleton-chef, snail (crow, fox, frog, owl, polly, toad moved to `shared` on 2026-10-18) | Loop clips replace idle only, so a walking ghost would look alive. While dead: hold the loop clip (`ghost`, or `ghost-spent` once the ghost vote is used) and **slide**: the vendor Character stays where the slide began (its gait never leaves idle) and the avatar's holder group carries the motion (`vendor/characters.ts createDriver().setSlide`), plus the `tint` wrapper below at 50 % (dither alpha 0.8). A revival leaves the slide **in place** (the Character is reset at rest at the feet, `resetMotion`; no rebuild, the avatar and its label never vanish). |
| `tint` (neither) | storyteller, wanderer (stand-in), nicksong + brianbi (billboards) | `avatars/ghostTint.ts`: a material wrapper on every avatar material (pale ramp + an ordered-dither alpha 0.6 + 0.15 m hover), added via `onBeforeCompile` **at build time for every handle** (uniforms toggled, so no recompiles on death). Billboards use the v2 ghost frames when they exist (`brianbi/ghost*` in cast-hd, `nicksong/ghost*` in cast-ghosts) with a light tint. |

The table replaces revision 2's (written before the vendor's wave-3 ghost work moved 10 specs to `shared` and 8 to
`clips`). `castMap` always prefers the live probe (`specCapsOf` after `loadSpec`); `GHOST_BASELINE` is only the
pre-load guess and the test's expectation.

CONTRACT-REQUEST (§9.2): add `spec.ghost: {hover}` to the 10 remaining `clips` specs and to storyteller / wanderer, the cheap
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

**Billboards** (`avatars/billboard.ts`): a **cylindrical** `THREE.Mesh` quad (turned about Y to face the camera,
stretched by 1 / cos(pitch), so on screen it is v2's 1.3 m for the full 40 px v2 cell while it stands upright at the
feet: a fully camera-facing quad leaned back ≈ 0.7 m at pitch 30° and was clipped by walls just north of it, e.g. at
doors; `heightM` is the matching vertical height, `billboardFrames.ts cylinderFacing / billboardHeadM`), anchored at
the v2 feet anchor, **8** facings from the v2 frames (walk 1..4 while moving, 0 idle / reduced motion),
one shared texture per sheet (`cast` nearest, `cast-hd` smoothed + mipmaps, `cast-ghosts`), a vendor toon material lit
as up-facing ground (`lightNormal: viewMatrix[1]`) so it takes the time-of-day ramp, on the `COLOR_ONLY` layer (no
outline pass, no shadow; the vendor toon normal pass would otherwise write the quad's normal). All billboards share one
program (`ct-avatar-billboard|ct-tint2`). `v3/assets/sprites/<id>.json` bakes (8 directions, `cell [72,84]`,
`anchor [36,61]`, `ppm 36`) would be preferred, but none exist for nicksong or brianbi today. Frame names keep the
v2 format `<key>|<dir8>|<n>` for `__ctCamera.avatar().frame`. Fallback chain for any cast id: its spec rig → the
`wanderer` stand-in tinted with a pid-hashed pin colour (the member's own pin colour is a device-local preference
that never reaches other clients) → its v2 billboard. Every one of the 33 cast ids has v2 sprite art (tested).

**Costs.** Rig build 55-90 ms + 25-40 ms first update (`src/demo/characters.js` header). One character per frame
through a queue, **at most one build in flight** (a build discarded by a cast change keeps the slot until it settles) (`avatars/queue.ts`: own player first, then avatars in the viewer's
location by distance, then other players, then townsfolk). Spec modules are preloaded when a member first appears
(`vendor/characters.ts preloadSpecs`; a lobby-time preload needs a dynamic import from the lobby, §8 WP2 notes). At
the `low` tier, characters farther than 12 m from the camera target are moved to the `COLOR_ONLY` layer (skips the
normal pass; the sun's shadow camera only sees layer 0, so no shadow either) — a layer-mask toggle, no program change
— and every rig is built with `fx: false, smears: false`. Spec `lights` (the storyteller's lantern PointLight) are
suppressed before the first update (`suppressSpecLights`): the light count never changes; lanterns borrow a pool light.

**Updates.** `handle.update(t)` every frame, only for handles in the current location.

**Shader pre-warm (WP2, review round).** A landed body (the holder + the FX motes / smear groups the vendor put into
`engine.scene` for it) is compiled with `renderer.compileAsync` **into a scratch 1×1 render target** before its first
draw and stays hidden until that resolves (≤ `PREWARM_MAX_MS` 3 s). The render target matters: the pipeline draws the
scene into render targets (linear output, no tone mapping); compiling against the canvas gives other variants (the
vendor's own note in `src/demo/main.js`: "+25 extra program variants"). `__ctCamera.avatarsWarm()` counts pre-warms,
time-outs, "misses" (a first drawn frame that still compiled) and "unchecked" (another pre-warm ran in between, so the
count says nothing). The smoke's high pass proves it on two late joiners (`owl` rig with FX, `nicksong` billboard:
the billboard program is compiled while hidden, the first drawn frame compiles none). So a player who joins after the warm-up, or a cast
change, no longer compiles synchronously on its first frame (parallel where the browser has
`KHR_parallel_shader_compile`; SwiftShader compiles synchronously inside the call, behind the hidden body).

**Teleports (WP2, review round).** A jump (first placement, location change, > `ST_JUMP_PX`) resets the drive track
**and** the vendor Character's motion (`vendor/characters.ts resetMotion`: prevPos, velocity, filtered velocity,
lean, gait feet, chains): no one-step velocity kick (a door step was ≈ 10 000 m/s for one 60 Hz step: lean, run,
heading). CONTRACT-REQUEST §9.2 for a public `Character.teleport`.

**As built (WP2).** `avatars/index.ts`: `createAvatarLayer({engine, tier, heightAt?, view?, lights?, self?, npcs?})`
→ a `Layer3d` plus `registry` (`AvatarRegistry3d` = `AvatarRegistry` (`anchorOf`, `pidAt`, `debug`) + `isShown(pid)`,
WP4's request: drawn in the viewer's location, on screen or not), `playEmote(pid, name)` (clips.ts chain),
`setTalking(pid, on, rim?)` (holds the `talk` loop for living rigs **and** lights the emissive talking rim, WP4's
request: `rim` = CSS hex, `undefined` = `RIM_DEFAULT` `#ffe2a0`, `null` = clip only; the composition root drives it
from `voicePresence` + `readTalkOutlineMode()`), `fadeIn(pid)` (the 120 ms teleport cross-fade; wire to WP1
`core.on('placed')` for the own pid and to Storyteller poofs for remotes), `selfReady(timeoutMs?)` (C1: race ≈ 5 s so a
stalled spec import never blocks the mount), `settled()`.
`anchorOf(pid).headTopCss` is `HEAD_PAD_M` = 0.1 m above the drawn head (feet + height + ghost hover + crown: a
'shared' ghost's `spec.ghost.hover` and, at level 1, its halo lift, `specCapsOf ghostHover / ghostHalo`), the point
WP4's label stack starts from (`overlay/anchors.ts`); `heightM` = height + hover + crown (no pad). The returned
`Anchor3d` is reused per avatar (copy what you keep). The rim is a uniform (`ghostTint.ts uCtRim`, program key
`|ct-tint2`, `RIM_K` 1): rigs get a wide silhouette band (view-space |n.z| < 0.65; the pixel camera is orthographic)
plus a flat `RIM_FLAT` 0.15 lift of the whole figure (the thin band alone sat under the outline pass), billboards
(no silhouette normals) a flat 0.3 lift; the smoke measures each talker's box luminance rim off vs on. Ghosts carry
no lantern light (v2 `hasLantern = lantern && !ghost`); the Storyteller always does. Debug members merged into
`__ctCamera`: `avatar(pid)` (§6.1 shape), `npcs()` (v2 shape), `avatars3d()` (per-entry texture / kind / ghost / look,
for smoke tests), `avatarsWarm()` (shader pre-warm counters). Without `view` the layer projects with its own `project.ts fallbackView` (§1.5 maths, canvas rect read
at most once per frame). The own avatar is drawn from `state.me` (the WP0 stub's `wanderer` must then go). Raised
hands come from `NominationView.votes`/`handsRaised` (same rule as `gameplay/core.ts`). NPCs: v3 homes from
`npcHomesV3` (lazy `@ct/assets/hollowmere`), the v2 roamer with its Brianbi avoidance, and in v3 worlds never inside
`inSquare` (the voting circle, user request 2026-10-17). DEV smoke (WP7 may adopt it):
`apps/client/src/game3d/avatars/dev/{smokePage.ts, avatarSmoke.mjs}` (`SMOKE_PORT`, default 3462; refuses a busy
port). Two passes on SwiftShader (checked): **low** = Hollowmere + all 33 cast ids + an unknown id + townsfolk;
**high** = 6 ids with FX / smears + a late joiner (`owl`: its first drawn frame compiles no program). Each pass:
build, walk (non-idle rig frames, billboard frames 1-4), vote, talking (rim uniform + a pixel check: each talker
alone on a clear spot, box luminance rim off vs on ≥ 3), a door step + a Storyteller poof (rig at rest: no run,
lean < 1°, velocity < 0.5 m/s), every player dead and walking as a ghost, revival in place (same bodies, no anchor
gap), night lanterns, destroy; programs constant from 'alive' to 'revived' (new program names are listed), no
stand-in for a shipped id. Screenshots, rim crops and JSON to `test-results/v3-avatars-smoke/`.

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
`SettingsDialog.tsx`, the Town choice + badges in `ui/lobby/{LobbyFinder,CreateLobbyModal,ModeSettings,WaitingRoom,
JoinPreview}.tsx` + `finder.ts` + `lobby.css`.
- **Gate = the lobby's world.** `useV3Skin(conn)` (`v3skinLobby.ts`, ref-counted; see "Skin lifetime" for its mounts)
  turns the skin on for `world: 'v3'` whatever renderer draws the town (Classic in a v3 world gets the
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
  through Vite's CSS pipeline because the published file has a stray `}` (§9.2 request); until that is fixed upstream
  the link 404s/500s under the `vite` dev server, so the panel skin is missing in dev only (builds are fine). `notebook.css`, `hud`, `events` are **not** wired yet
  (they need markup changes in `ui/notebook/**`, `ui/hud/**` owned by others).
- **Atlases (item 2).** `v3atlas.frame(name, night)` over emotes → portraits → markers → indicators (`-night` for the
  last three; emotes has no night bake, its day sheet serves both). Documented skips that keep v2 art in a v3 lobby:
  `nick_face`, `icon_nicksong`, `icon_brianbi` (and the nicksong / brianbi portraits); every other social frame is v3
  or, while the atlas loads, the emoji/dot fallback (never v2). `PieMenu.tsx useSocialArt()` is the shared lookup
  (its pure body `socialArtFor(skin, atlas)` is unit-tested).
- **Portraits (item 1).** `castPortrait.ts` takes a pluggable `PortraitAlt` (`setPortraitAlt`); `v3portrait.ts` (in the
  lazy atlas chunk) installs the v3 strip: 'down' frames, `meta.walkStepMs` (67 ms) cadence, `<id>/dead` via
  `castSheetKey(id, ghost, dead)` / `CastPortrait dead`, other directions hold the v3 'down' frame (no v2 mixing).
  Before the chunk lands, portraits in a v3 lobby show the silhouette (`v3skinLobby.ts PENDING_PORTRAITS`).
- **9-slices (item 4) — owned by WP4.** The in-world bubbles / labels are WP4's DOM/canvas overlay: `game3d/overlay/
  atlas.ts` keeps its own loader (it needs decoded images for the FX canvas and the `events` sheet, which this DOM
  module does not load) and crops `bubble_nine` to a `data:` URL itself (D2). WP6's unused `nineSlice()` helper was
  removed (fix round 2026-10-17); `v3atlas.inset(name)` (kit `meta.nineSlice`) stays for DOM consumers. A v3 lobby
  therefore requests `indicators(-night).json` from both modules; the second request is a cache hit for the same
  hashed URL. If C1 wants one loader, WP4 may build on `loadV3Atlas()` + `frame()` and add its images.
- **Graphics setting.** Settings → Graphics → "Town graphics" `Auto / v3 3D / Classic 2D` (`ct.graphics`); every change
  and "Reset to defaults" call `notifyGraphicsChange()` (GameScreen swaps in place). The status line is
  `graphicsStatus(world, chooseRendererHere(world), currentRender)`: "This lobby uses the classic town" (v2), "Auto
  (Classic: too slow on this device) [Try v3 again]" (memo: clears it), "v3 graphics stopped last time … [Try v3]"
  (boot guard: resets it), and one line per other row. **What actually draws** comes from `currentRender`
  (`ui/common/graphicsStatus.ts`, a three-free store, `publishRender()`): when the mounted town fell back at runtime
  in this session (3D mount / chunk failure, lost context, or a perf fallback under an explicit `'v3'` pref, where
  row 7 does not apply) while the fresh choice still says v3, the line reads "The 3D town stopped (error), so Classic
  2D draws it now." / "Switched to Classic 2D for speed in this session." with **[Try v3 again]** (`notifyGraphicsChange()`
  only: GameScreen re-evaluates and remounts v3). The ok line shows the mounted town's tier. CONTRACT-REQUEST(world-art
  / C1): GameScreen calls `publishRender` (listed in the §8 WP6 Status row).
- **Town choice (§9.1 user decision).** Create dialog "Town": Classic (v2) / Hollowmere (v3), pre-selected
  `DEFAULT_WORLD = 'v2'` — the ONLY source of the pre-selection (no remembered pick since the fix round, so the C3
  decision reaches everyone; `CreateLobbyModal.tsx`; C3/Q7 flips it); sent as `CreateLobbyRequest.world`. The create
  dialog is its own lazy chunk (`ui/lobby/CreateLobbyModal.tsx`: the dialog, `WorldChoice`, `WORLD_COPY`; fetched on
  idle by `LobbyFinder`), so the word-list name generator and the long copy are not in the entry chunk; the entry
  keeps `WorldBadge` + the short `WORLD_BADGE` strings (`ModeSettings.tsx`). `WorldBadge` shows in the finder rows
  and leads the waiting-room meta line (under the title, so a 16-character lobby name is not ellipsised). The pure
  parts live in `ui/lobby/finder.ts` (`createLobbyBody` (always sends `world`), `worldOfLobby` = `view.world ??
  view.lobby.world ?? 'v2'`, the one client copy of that rule, used by WP6's call sites). The server side
  (schema, directory `world` in `LobbySummary` = the listing, room init, `lobby:view.world`) was already WP0's and is
  covered by `apps/server/test/lobby.world.test.ts`; no protocol/directory edit was needed. There is no separate
  join-by-id screen (a share link `/lobby/:id` joins directly); the preview is the "Joining …" screen:
  `ui/lobby/JoinPreview.tsx` `JoiningLobby` shows "Joining <name>… [badge]" from `GET /api/lobbies/:id` (best effort,
  falls back to "Joining lobby…"; `fetchJoinPreview` + `JoinPreviewView` unit-tested). Wiring it is two lines in the
  lead-owned `LobbyRoute.tsx` (CONTRACT-REQUEST, §8 WP6 Status row: the `!conn` screen and the InLobby `layout !== 'ready'` screen,
  which also shows while the v3 layout loads); until then the badge first appears in the waiting room.
- **Skin lifetime (CONTRACT-REQUEST(lead), §8 WP6 Status row).** Today `useV3Skin(conn)` is mounted by `WaitingRoom` (waiting
  phase) and `SocialPalette`, which GameScreen renders only while `status === 'ready'`. After game start the
  ref-count therefore drops to 0 whenever GameScreen leaves 'ready' — an in-place renderer swap from Settings, a perf
  / error fallback, a mid-game reload or rejoin before the town is ready — and the UI flashes back to the v2 look
  (tokens, `panels.css`, `data-graphics`, portrait source) until the dock remounts. (The earlier rationale, "between
  the waiting room closing and the dock mounting", was wrong: the dock is already mounted while waiting.) Fix: the
  lead calls `useV3Skin(conn)` once in `LobbyRoute` `InLobby` (lives exactly as long as the connection, and also
  covers the "Joining lobby…" layout load); the other two mounts then become harmless extra refs. WP7 may assert
  that `html[data-graphics]` stays `'v3'` across a Graphics change in a started v3 game.
- **Budgets (measured on the host vs the same tree without WP6, brotli):** entry +0.49 KiB, `LobbyRoute` +1.08 KiB,
  `SettingsDialog` +0.57 KiB, `townParts` +0.16 KiB; new lazy `v3atlas` chunk 3.05 KiB (JSON/PNG/CSS fetched on use).
- **Not wired (out of WP6's files):** the newer vendor groups `notebook.css` (`.ctn-*` classes), `hud`, `events`,
  `hud-font` need markup changes in `ui/notebook/**` / `ui/hud/**` (rules-storyteller) and are left to a later
  package; `markers-v2size` is an in-world (WP4) variant. The DOM chrome in v3 lobbies is the v2 markup re-tokened
  plus `panels.css`.
- **Tests.** Unit `ui.v3atlas.test.ts` (every SocialPalette / PieMenu frame day + night over the real bakes, skip
  list, tokens, strip, panels.css safety), `ui.v3skin.test.ts` (hour, looks, attach), `ui.graphicsStatus.test.ts`
  (every `chooseRenderer` reason, runtime fallbacks via `currentRender`), `ui.worldChoice.test.ts` (Town radios, the
  one pre-selection constant and no stored pick, the lazy create chunk, request body accepted by the server schema
  (imported from `packages/protocol/src/lobby`, so it runs under the root or the client vitest config), badges, join
  preview), `ui.v3art.test.ts` (castPortrait under the pending / v3 / skin-off sources incl. the skips, and
  `socialArtFor`). e2e `tests/e2e/v23-settings.spec.ts`: the v2 Graphics row, and a second test that creates a
  Hollowmere lobby from the UI (16-character name: not ellipsised) and checks the badge, the skin on / off, the
  Graphics status line and that the next create dialog pre-selects Classic again.

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
| **new** `setCamera({focus: [x, y], viewHeight} \| null)` | (C1) harness stills: hold the camera on a world px focus + viewHeight (m); `null` = the game camera again (snapped) |
| **new** `camera3d()` | (C1) `{mode: 'follow' \| 'vote' \| 'room', X, Z, viewHeight, yaw, pitch (deg), transitioning}` |

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
    `E2E_V3=1 flock ~/clocktower/v3-heavy.lock flock ~/clocktower/browser.lock nice -n 19 pnpm test:e2e --project=v3`
    (as built, WP7a: the host-wide heavy + browser locks replace the planned `locks/v3-e2e`): only one v3 e2e runs on
    the host at a time (SwiftShader is multi-core CPU work on the production machine). The `v3` project exists only
    when `E2E_V3=1`, so a plain `pnpm test:e2e` (the Classic suite) never starts the 3D specs; write `--project=v3`
    (Playwright 1.63 reads `--project v3 a b` as three project names).
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
| Interior switch | ≤ 120 ms hitch for a **prefetched** entry (own home, or a door within 3 tiles: walking in); a Storyteller teleport into a room that was not prefetched pays the full room build and is reported separately (`coldInteriorSwitchMs`, 142-157 ms on SwiftShader; lead decision C1, WP3 request) | harness `interior-house-5` (walk up to the door first), `scripts/v3/stage-smoke.mjs` |
| JS heap | ≤ 350 MB after 10 min; < 10 MB growth across 5 mount/destroy + 2 rebuilds | harness leak test |
| Overlay DOM | (D2 wording, C1) `v3WalkDomMutPerSec` = non-transform DOM writes ≤ 5 /s while walking with 15 labels (+ bubbles); transform writes reported separately (`transformsPerSec`: ≤ 1 per element per frame, none under 0.5 px); no layout reads in the per-frame path; `desktopWalkMainPct` unchanged rule | `scripts/perf/budgets.mjs` (new key; source `__ctCamera.overlay().mutationsPerSec` / `transformsPerSec`) |

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
| v3-avatars | 3462-3464 (3461 is held by an orphaned Vite server: never use or kill it) |
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
| WP5a | v3-world | C0b | **C0b passed, committed** in the same "v3 C0b: …" commit (gate as in the WP0s row): `scripts/v3/export-hollowmere.mjs` + `hollowmere.generated.json`, `@ct/assets/hollowmere` (`townLayoutV3`, `townMapV3`, `npcHomesV3`, `PROP_DEFS_V3`), `layoutFor`; server `V3_LAYOUT` and client `importV3Layout()` wired (v3 lobbies are created: 201, `host.layout()` = `townLayoutV3`); per-world `sound/areas.ts`; tests `hollowmere.test.ts`, `layout`/`navigation` parameterised by world, `world.v3.test.ts`, `sound.areas.v3.test.ts`, flipped `lobby.world` / `layoutRules`. Verified on the host: typecheck, `pnpm build`, full `pnpm test` (131 files / 1499 tests pass, 1 file / 3 tests skipped), `export-hollowmere --check` (deterministic). Entry +0.28 KiB br, lobby +0.07 KiB br vs HEAD; `layoutV3` chunk 5.65 KiB br, dynamic-only  **Vendor refresh B (2026-10-18, v3-world):** `v3-dev` `bd4c9ff` merged (`5fb072f`), assets re-imported, the clock tower exported as an enterable building (16th building, band column 6, `widthTiles` 125, `towerRoomV3`, height-cliff rule; §2.2), NPC homes off the plaza / square, tests updated (`hollowmere`, `layout`, `navigation`, `classicV3`, `boards.houses.v3`, `layoutRules`, server `world.v3` incl. the tower's day / bedtime / night rules), the Classic v3 pass regenerated (`terrain-v3.*`, `town-v3.json`; v2 outputs byte-identical). Gate (host, one `v3-heavy.lock` run, `CT_AGENT=v3-world`): `export-hollowmere --check` up to date, `pnpm -r run typecheck` 0, `pnpm build` 0, full `pnpm test` 159 files / 1873 tests pass (1 file / 5 tests skipped). Not run: e2e (`classic-in-v3` would now also tap into the tower), smokes. **CONTRACT-REQUESTs:** (lead / world-art) `game/rules/doors.ts houseInUse` → `true` when `b.houseIndex == null` (Classic otherwise says "Nobody lives here" at the tower door during a game and boards it; v2 has no such building); (lead) `coords.ts` interior map for `bld:clocktower` from `towerRoomV3` + the room's `heightAt`; (WP3) build / show the tower room (`buildTowerRoom`) and the tower timer face (§9.1 item 2); (WP2) the NPC guard (§9.1 item 3) and avatar feet on the tower room's `heightAt` | — |
| WP5b | v3-world | C1 | **Committed in "v3 C1a: …"** on `v3-game` (gate `v3-gate`, 2026-10-18: `pnpm -r run typecheck`, `pnpm build`, full `pnpm test` = 159 files / 1870 tests pass, 1 file / 3 tests skipped). Done; review fix round done 2026-10-17. Classic 2D in a v3 world as built in §2.5: generator v3 pass (`scripts/v3/{classic,placement}.ts`, `scripts/lib/world.ts`; outputs `terrain-v3.*`, `town-v3.json`, `square-props-v3.json`, `objects-v3.*`), `@ct/assets/runtime-v3`, per-instance layout state in `TownScene.ts`, per-world board slots in `boardTokens.ts`. Fix round: no invisible walls outdoors (dais plinth `dais@v3` + `outdoorFiller`, 247 pieces), `sourceHash` freshness + decor / outdoor-anchor checks, bed test per room, v3 plaza = v2 `PLAZA` assertion (TownGame canvas sizing), townsfolk kept off the v3 voting circle (`npcSpot`), e2e page-error collection in all three tests, phone shots in the town + a touch tap into a cottage; §2.5 lists the 37 sprite-over-walkable tiles. Host runs (`CT_AGENT=v3-world` / `v3-world-gen`): `pnpm -r run typecheck` clean; `tsc -p tests/tsconfig.json` clean; v3 pass `tsx scripts/v3/classic.ts --review` (only `town-v3.json` + `objects-v3.*` change; `terrain-v3.*` and every v2 output untouched); `classicV3.test.ts` 18/18; `boards.houses{,.v3}.test.ts` 22 + 3 pass; `packages/assets` 173 pass, 3 skipped, **1 fail = hollowmere.test.ts:109 caused by WP3's `apps/client/src/game3d/world/dev/stageSmoke.mjs` reading the meta file (WP3 fix, not WP5b)**; `apps/client/test` 60 files / 790 pass. E2E after the fix round **pass** (2026-10-18, `CT_AGENT=v3-world`, `E2E_PORT=3475`, both locks, build via the webServer, `--project=chromium classic-in-v3 doors.spec`): **4/4 passed (2.2 min)**: `classic-in-v3` 3/3 (all 15 cottages entered through their v3 doors 54.7 s; v2 then v3 lobby in one page 2.8 s; Q7 shots incl. phone teleport-to-square + phone touch-tap into house-2 + townsfolk-off-circle check 35.7 s) + `doors` 1/1 (29.4 s). Same 4/4 in the detached queued run (log `~/clocktower/work/v3-world/test-results/wp5b-e2e.log`, exit 0). Stills 00-16 (incl. `14-phone-portrait`, `15-phone-landscape`, `16-phone-inside`) on the host in `~/clocktower/work/v3-world/test-results/classic-v3/`. Last passing run (before the fix round): `classic-in-v3` 3/3 on 3475, v2 Classic regression `doors`, `door-boards`, `door-reconnect`, `chat-bubbles`, `v2-look`, `v2-phone` on 3476. `playwright.config.ts` reads `E2E_PORT` (D4 done in the tree). Full `pnpm test`: run by the C1a gate (pass) | — |
| WP1 | v3-core | C1 | **C1 gate passed, committed as "v3 C1: ..." on `v3-game` (2026-10-18, `CT_AGENT=v3-integrate`): `pnpm -r run typecheck` 7/7, `pnpm build` 0, full `pnpm test` 167 files / 1944 tests pass (1 file / 5 skipped), `budgets.mjs --bundle` all measured ok; v3 e2e on the host GPU per §11 "C1 continuation".** **Wired into `TownGame3d.ts` (C1, integrator, 2026-10-18).** Was: committed in "v3 C1a" (code + unit tests). Now the ONE core of every mount (`createCore3d`) + `Lifecycle` (context-loss rebuild, crash / perf fallback, boot marks), see §11 "C1". C1 changes in WP1 files: vote framing from the stage + stepped transitions + screen-relative keys + room-build camera hold + `floorAt` + `setOverride` (`input/camera.ts`), `voteCameraWanted` (`net/core.ts`), room maps for the tower (`input/pick.ts`). **Review fix round (2026-10-18):** the room-build camera hold now asks `stage.interiorPending(loc)` (new, `world/interiors.ts pending()`), so a FAILED room build (e.g. the tower room's coords guard) falls back to `interiorShot` instead of freezing on the outdoor pose; unit test in `voteCam.test.ts`. Verified: see the C1 gate line in the WP2 row | — |
| WP3 | v3-stage | C1 | **Committed in "v3 C1a: …"** on `v3-game` (gate `v3-gate`, 2026-10-18: `pnpm -r run typecheck`, `pnpm build`, full `pnpm test` = 159 files / 1870 tests pass, 1 file / 3 tests skipped). Code + unit tests + DEV smoke pass after the review fix round (2026-10-18); **wired into `TownGame3d.ts`** (the minimal WP3 edit in the lead-owned root, unchanged: `createStage` replaces `buildHollowmere`, `stage.layer` registered first, `stage.warmUp`, `Layer3dServices.stage`, `state.hour = stage.hour()`). Fix round: (high) DEV smoke moved to `scripts/v3/stage-smoke.mjs` (it reads `hollowmere.meta.json`; `packages/assets/test/hollowmere.test.ts` passes again); (medium) doors also infer door use from a remote vanishing at / appearing at a cottage door for outdoor non-Storyteller viewers (the server's per-location snapshots), with a 1.5 s own-view settle (§8 "As built"); smoke step E now deletes the remote at the door; (medium) a dead nominee keeps the nomination halo; (low) per-frame work allocation-free (hour input, canopy pool / slot list / numeric yaw-pitch compare, tower plan only on clock / second change via `timerTick`, door entries mutated in place, reused interior camera arg, `interiors.drawn()` cached); (low) interior budget: the smoke walks up to house-5 (prefetch) and asserts `lastSwitchMs ≤ 120`, and reports a cold Storyteller teleport separately (lead to record the qualified budget in §7 / §11); (low) `dimNearAnchors` extracted to `world/lights.ts`; new `world.stage.test.ts` (dimNearAnchors, canopyMaterials over a fake registry, createCutDriver null cases + facade); (low, open) soft-layer fade artefact behind thatched cottages waits for a WP7 still (§8 "As built"). Files: `game3d/world/{stage,hour,dais,doors,interiors,lights,park,store,canopy,towerClock}.ts`, `game3d/vendor/{town,time,interiors}.ts`, `scripts/v3/stage-smoke.mjs`; unit `world.{hour,dais,store,doors,canopy,towerClock,lights,stage}.test.ts` (70). Ran on the host (`CT_AGENT=v3-stage`): client `tsc --noEmit` (exit 0); `vitest run apps/client/test/game3d/world packages/assets/test/hollowmere.test.ts` (9 files / 104 pass); `vitest run packages/assets apps/client/test` (70 files pass, 1 skipped / 967 pass, 3 skipped); `stage-smoke.mjs` under both locks, SwiftShader, low tier, canopy on: **27/27 checks pass** (ready 8.1 s, programs 41 constant through ready → day → canopy → vote → night → prefetched interior → back → cold interior → back → dawn → idle; remote vanishing at house-3 swings it open + shut; canopy hole 252 px vs baseline 102; prefetched house-5 switch 1 ms; cold Storyteller teleport into house-1 144 ms; 6 s idle without door / bell; clean destroy). After that run only the smoke's hitch sampler got a `d.length < 3` guard (it returned no samples on SwiftShader's slow frames; not re-run). Known: a Storyteller teleport in / out of a cottage swings its door (the own location change; the teleport reason is not in `Scene3dState`). Full `pnpm test`: C1a gate (pass). Not run: e2e `v3-vote` / `v3-life`, harness shots (WP7) | — |
| WP2 | v3-avatars | C1 | **C1 gate passed, committed as "v3 C1: ..." on `v3-game` (2026-10-18, `CT_AGENT=v3-integrate`): `pnpm -r run typecheck` 7/7, `pnpm build` 0, full `pnpm test` 167 files / 1944 tests pass (1 file / 5 skipped), `budgets.mjs --bundle` all measured ok; v3 e2e on the host GPU per §11 "C1 continuation".** **Wired into `TownGame3d.ts` (C1, 2026-10-18).** `createAvatarLayer` after net/ and before overlay/, the stub `wanderer` removed, `selfReady(5000)` (build-only pump) before `stage.warmUp`, `registry` → overlay, `core.on('placed')` + remote ST poofs → `fadeIn`, `voicePresence` → `setTalking(pid, on, rim)`, `floorAt` (tower stair / landing), NPC guard plaza × 1.1. **Earlier C1 pre-gate run (host, `CT_AGENT=v3-integrate`, before the continuation):** client `tsc` 0; `tsc -p tests` 0; `vitest run apps/client/test/game3d` 28 files / 389 pass; `pnpm build` 0; full `pnpm test` 160 files / 1892 tests pass (1 file / 5 skipped); Classic e2e (E2E_PORT 3451) `doors`, `door-boards`, `chat-bubbles`, `v2-social` ×2: 5/5 pass; v3 e2e (E2E_PORT 3450, `CT_GL=swiftshader`): see §8 Phase 2 "C1 run"; harness `cycles` (smoke-mount): see the same paragraph | — |
| WP4 | v3-overlay | C1 | **C1 gate passed, committed as "v3 C1: ..." on `v3-game` (2026-10-18, `CT_AGENT=v3-integrate`): `pnpm -r run typecheck` 7/7, `pnpm build` 0, full `pnpm test` 167 files / 1944 tests pass (1 file / 5 skipped), `budgets.mjs --bundle` all measured ok; v3 e2e on the host GPU per §11 "C1 continuation".** **Wired into `TownGame3d.ts` (C1, 2026-10-18).** `createOverlayLayer({parent, conn, view: core.view, avatars: registry, gameplay: core.gameplayFrame, pixelScale, faceToward, passTap})`, `socialSink` → `core.pointer.setSocial`, `__ctCamera.bubbles / doorBoards / overlay` and `__ctSocial` (its own hook). e2e `v3-social` pin + point + bubble **pass** (host GPU, 2026-10-18 C1 continuation, 2 runs) | — |
| WP6 | v3-ui | C1 | **Committed in "v3 C1a: …"** on `v3-game` (gate `v3-gate`, 2026-10-18: `pnpm -r run typecheck`, `pnpm build`, full `pnpm test` = 159 files / 1870 tests pass, 1 file / 3 tests skipped). Done, reviewed + fixed (2026-10-17 fix round, finished 2026-10-18). As built in §5 "As built (WP6)": `ui/common/{v3skin,v3skinLobby,v3atlas,v3portrait,graphicsStatus}.ts`, v3 gating in `castPortrait.ts`, Graphics row in `SettingsDialog.tsx`, v3 branches in `ui/social/{SocialPalette,PieMenu}.tsx`, Town choice + `WorldBadge` (`ui/lobby/{LobbyFinder,CreateLobbyModal (new, lazy),ModeSettings,WaitingRoom,JoinPreview,finder}`, `lobby.css`). Fix round: the Graphics status line now reports runtime fallbacks of this session (`currentRender` store + `publishRender`, "[Try v3 again]" remounts); the create dialog is a lazy chunk (entry keeps only `WorldBadge` + short strings); no remembered town pick (`DEFAULT_WORLD` is the only pre-selection; `ct.create.world` dropped); the waiting-room badge leads the meta line (16-char names fit); `nineSlice`/`cropToDataUrl` removed (WP4 keeps its own loader); `socialArtFor`, `fetchJoinPreview`/`JoinPreviewView`, `PENDING_PORTRAITS` factored out + tested; `worldOfLobby` (view or summary shape) used at WP6 call sites; worldChoice test imports the zod schema from `packages/protocol/src/lobby` (runs under either vitest config). **Open CONTRACT-REQUESTs for C1:** (1) world-art/GameScreen: `publishRender({kind, tier, fallback})` whenever `render` changes (add `fallback?: FallbackReason` to `Render`, set it in `fallback()`), `publishRender(null)` on unmount; (2) lead/LobbyRoute: `useV3Skin(conn)` once in `InLobby`; (3) lead/LobbyRoute: `<JoiningLobby id={id} />` for the `!conn` screen and the InLobby `layout !== 'ready'` screen; (4) WP7: `v3-lobby-choice.spec.ts` lines 47/52 expect `ct.create.world` to be set: it is now always null (assert the next dialog pre-selects Classic instead), and assert `.ct-join-preview .ct-world-badge` once (3) lands. Verified (fix round): client typecheck 0 errors; `pnpm vitest run apps/client` 61 files / 805 tests pass (incl. `ui.v3art` 8 new, `ui.worldChoice` 8, `ui.graphicsStatus` 7, `ui.v3atlas` 20, `ui.v3skin` 10); `ui.worldChoice` + `ui.graphicsStatus` also pass from `apps/client` (client vite config). 2026-10-18 (continuation after the usage-limit stop): client typecheck 0 errors; WP6 unit set + `apps/server/test/lobby.world.test.ts` 10 files / 139 tests pass (root config), `ui.worldChoice` + `ui.graphicsStatus` + `ui.v3art` 23/23 from `apps/client`; e2e (own server, `E2E_PORT=3480`, chromium) `v23-settings.spec.ts` (2, incl. the v3 lobby test) + `lobby.spec.ts` (6): 8/8 pass (the v3 test's last step now closes the second create dialog with Cancel: an Escape sent right after the radio check raced the dialog's post-paint key listener and failed once); after `pnpm build`: `tests/security/web-client.test.ts` 31/31 pass (it fails 2 if run against the dist the e2e webServer builds under `NODE_ENV=test`, so always rebuild first); `budgets.mjs`: entry JS 42.7/45, entry CSS 11.5/15, `LobbyRoute` 67/72, `TownGame` 295.9/300 KiB br, all ok (lazy `CreateLobbyModal` 1.46, `v3atlas` 2.70). Not run: an in-place Classic↔3D swap e2e (needs hardware GL or `v3force`; WP7) | — |
| WP7 | v3-qa | C2 | **Committed in "v3 C1a: …"** on `v3-game` (gate `v3-gate`, 2026-10-18: `pnpm -r run typecheck`, `pnpm build`, full `pnpm test` = 159 files / 1870 tests pass, 1 file / 3 tests skipped). **WP7a (harness + v3 e2e) done for what runs before C1** (2026-10-18, see §8 Phase 2 "As built (WP7a)"). Ran on the host (`CT_AGENT=v3-qa`): client `tsc --noEmit`, `tsc -p tests/tsconfig.json`, `tsc -p tests/v3/tsconfig.json` (all clean); `vitest run apps/client/test/game3d/harness.scenario.test.ts` 11/11; harness (`vite build -c vite.harness.config.ts` + `tests/v3/harness.config.ts`, SwiftShader, port 3460): `projection` pass (15 samples at scales 2/3/4 inside the drawn texel) and `cycles` pass (5 mounts + 2 tier rebuilds + 1 crash on the current WP0/WP3 town: every check true; the heap numbers were bucketed, `--enable-precise-memory-info` added afterwards, not re-run); the earlier WP7a run had `square-day-8` stills pass. e2e project `v3` (E2E_PORT 3485): **pass** `v3-boot`, `v3-lobby-choice` "town choice from the UI" + "each lobby renders the right town" (the user's acceptance), `v3-fallback` "leftover boot mark"; **fail** `v3-fallback` "chunk fails" (finding: the one retry never re-requests the chunk, §9.3); **pending C1** `v3-fallback` context-loss rebuild + perf sampler, `v3-lobby-choice` join preview (lead `JoiningLobby` wiring); not run: `v3-doors`, `v3-social`, `v3-vote`, `v3-life`, `v3-mixed`. Classic regression after the helper / bot edits (chromium, E2E_PORT 3486): `doors`, `chat-bubbles`, `door-boards` (15 bots) 3/3 pass. Not run: other scenario stills (full `pnpm test`: C1a gate, pass) | C1 |
| WP8 | v3-wp8 (acting as lead) | v3.0 | **Done, committed as "v3 WP8: …" on `v3-game` (2026-10-18; gate in docs/test-results.md "v3 WP8 gate").** URL paths (§11 user decision 2026-10-18): `ui/common/appWorld.ts` (path → world, `/v2` prefix kept on every push), server `/v2` SPA route, per-world finder list, no Town choice (`CreateLobbyRequest.world` from the path); a join link for the other world moves the address bar in place (`syncWorldPath`: `JoiningLobby` from the public summary, `LobbyRoute.useLobbyLayout` on the first lobby:view = authoritative; no reload). v3 loading scene (`ui/common/{v3loading,townLoading,townLoad}`) at boot, joining and now the town build (`GameScreen` loading state in v3 lobbies → `<TownLoading renderer>`; v2 keeps "Lighting the lamps…"). **Candles removed (user 2026-10-18):** `vendor/town.ts removeDaisCandles(town)` (called once in `world/stage.ts` before the warm-up) re-indexes the dais' `dais-solid` / `dais-fx` / `dais-states-solid` meshes without the per-seat candle stakes, flames, ghost wisps + pools, night candle halos and block pennants (the vendor's own `daisdress.js` picking rules, made permanent); stones, warm night tops, cracks, nominee / vote seals, hands, sweep, braziers stay; no light / program change; `__ctCamera.stage().candlesRemoved` reports the counts (v3-vote asserts > 0). **Laptop-first (user 2026-10-18):** `isPhoneLike()` (coarse pointer AND shorter side < 600 px) shows a non-blocking note on the v3 loading scene and the `/` finder; nothing blocked, no phone work. `v3-lobby-choice.spec.ts` deleted (superseded by `v3-paths`). | — |

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
  **C1 (integrator) changes:** the vote framing is the stage's computed frame (`RigScene.voteCamera(lowW, lowH,
  pixelScale)`, §9.1 item 1) at its own yaw / pitch while `voteCameraWanted(game)` (day: nominations open or a pending /
  voting nomination) and `cameraMode(...) === 'vote'` (on the square); into / out of it `steppedPose` (4 key poses,
  0.75 s); `CameraRig.yaw()` + `turnKeys` keep keys screen-relative; a room still being built holds the camera (no
  void frames); `RigScene.floorAt` (tower stair / landing) feeds `project` and the pick; `setOverride(shot | null)`
  backs `__ctCamera.setCamera`. `CameraShot` gained optional `yaw` / `pitch`; with no stage vote frame the old fixed
  19 m shot stays (unit tests unchanged).

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
  (input/pick `HouseProxy` shape, vendor `houseBox(rec, top, 'full')`), `voteCamera(lowW, lowH, pixelScale) → {X, Y,
  Z, viewHeight, yaw, pitch} | null` (C1: the computed voting-circle frame, `world/voteFrame.ts`, cached per canvas
  size; `RigScene.voteCamera`), `floorAt(X, Z)` (C1: town ground / flat cottage floor / the tower room's stair and
  landing), `debug()` → `dais()`
  (§6.1) and `stage()` (`hour, targetHour, preset, bells, phase, drawn, interiors {cached, lastSwitchMs, parked},
  doors {open, writes, angles}, boarded, life {walkers, doors, folk, ambient, benchFolk}, lights {pool, poolFound,
  reserve, lent, boardedAnchors}, cut {on, circle, house, boxes, inside} (vendor cut controller info), canopy
  {patched, active, slots: [{key, X, Z, w}]}, timer {available, readout}, vote, warm, time`).
  Pure modules (unit tested): `world/hour.ts` (`stageHour`, `clockProgress`, `createHourClock`, `darkness`),
  `world/dais.ts` (`daisPlan`, `stoneMap`, `createDaisDriver`, `showcasePlan`, `daisDebug`), `world/doors.ts`
  (`createDoorDriver(setDoor, doorTiles(layout))`, `doorTiles`, `doorNear`, `boardedHouses`, `createBoardDriver`),
  `world/store.ts` (facade store / events / input), `world/towerClock.ts` (`towerTimer`, `timerReadout`, `timerKey`,
  `timerTick`); with three but no WebGL: `world/canopy.ts` (`patchCanopyMaterial`, `createCanopyFade`,
  `canopyFadeAt` = the CPU twin of the shader test, `cameraBasis`), `world/lights.ts` (`createLightReserve`,
  `dimNearAnchors` = the boarded pool-light rule), `world/park.ts`. Vendor wrappers added in `vendor/town.ts`:
  `canopyMaterials`, `createCutDriver`, `houseLightAnchors`, `poolLights`, `voteCameraPreset` (now the debug fallback
  only) (unit: `world.stage.test.ts`, three-only fixtures); C1 replaced `towerTimerApi` (it probed a `setTimer` the
  vendor never published) with `createTowerFace`, and added `towerDials`, `seatStones`, `towerDoorApi` (vendor/town.ts)
  and `buildTowerInterior` (vendor/interiors.ts).
  DEV smoke (hand-over to WP7): `scripts/v3/stage-smoke.mjs` (moved out of `apps/client/src`: it reads the review-only
  `hollowmere.meta.json`, which no client source may name; real `createTownGame3d` on `townLayoutV3`, SwiftShader;
  `SMOKE_CANOPY=0` = A/B without the canopy fade; results in `test-results/v3-stage-smoke/`). Run on the host:
  `CT_AGENT=v3-stage scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock flock $HOME/clocktower/browser.lock
  timeout 1500 nice -n 19 node scripts/v3/stage-smoke.mjs'` (`SMOKE_PORT` default 3465).
- **As built, notes (WP3).**
  - Light budget 12 high / 8 low = town pool (time facade + composer, `lights` param) + a reserve of 2 PointLights
    (`world/lights.ts RESERVE`) for carried lanterns (lantern cast member + Storyteller). The count never changes.
  - Doors: a swing (0.3 s open, 0.9 s hold, 0.3 s close) whenever somebody goes through a cottage door; nothing
    else writes `setDoor`. Two signals: (1) a pose's location changes outdoors ↔ `bld:house-i` (the own player;
    every remote in the Storyteller's view); (2) for an outdoor non-Storyteller viewer, who is sent only outdoor
    entities (server `snapshotFor`), a remote last seen outdoors within `DOOR_NEAR_PX` (24 px) of a cottage door
    tile centre that VANISHES went in, and one that first APPEARS there came out. (2) is read only while the own
    view (own location + phase) has been unchanged for `VIEW_SETTLE_S` (1.5 s), so the first snapshot, leaving a
    room and the night / dawn visibility switch swing nothing. Known limit: a remote disconnecting while standing
    at a door swings it once. Bell: `ringBell()` on every observed phase change (not on the
    first look at a game). The tower hands follow the §3.1 hour through `createTime`'s gate. Tower timer hook (§9.1
    in-flight request 2): every frame the stage derives `towerTimer(game.clock, serverNow())` (running = `endsAt −
    serverNow`, paused = `remainingMs`, none = null → time-of-day hands) and, once the vendor publishes
    `clocktower api.setTimer` (§9.2), writes it there at most once per readout second; until then it only reports
    `stage().timer = {available: false, readout}`. No readout is faked.
  - Boarded: `vendor/town.ts gateHouseLights` wraps each cottage api's `setLit` before `createTime`, so a boarded
    house stays dark whatever the hour; the plank prop is kit-Builder geometry (shared kit material). The pool
    PointLights the time facade aims at a boarded cottage's light anchors (within 0.5 m) are zeroed after every
    `time.update` (§9.2 asks for a vendor-side skip).
  - Live cut-away: the vendor's `createCutController` (`demo/api.js`, what the demo runs every frame) is driven from
    an engine updater through a facade (`vendor/town.ts createCutDriver`): own-player box, the cottage whose door
    approach the player stands in (or whose door is within 24 px), the voting circle while the camera is on the
    square, all off inside a room. Before, the cut stayed frozen at the build camera (circle on, no player box).
  - Canopy fade (lead decision D1): `world/canopy.ts`, see §11. Patched before the warm-up into the foliage piece's
    toon materials (except grass), the cottages' crown / clump meshes (house-11 `api.fadeTargets()`) and the shared
    kit `soft` layer (thatch, ivy: the exporter's `-soft` occluders) — 11 materials at the vendor baseline; never kit
    `solid` / `glass`. Every outdoor avatar of `Scene3dState` (own first, then remotes; ≤ 16 slots, eased 220 ms)
    opens a dithered hole in those materials in front of it; none while a room is drawn. Off switch for A/B perf runs:
    `localStorage['ct.debug.v3canopy'] = '0'` (read per build). The own player additionally gets the vendor's hard
    cut-away box (above), so it reads as a window rather than a dither.
    Open (review round, low): the shared kit `soft` layer fades for EVERY outdoor avatar, so remotes just north of a
    thatched cottage open a dither in its roof with no visibility gain (the hard walls still hide them; the export
    lists only 3 soft-hidden tiles outside house-11: house-10 ×2, house-7 ×1). WP7 / art critics: take a still with
    remotes walking behind 2-3 thatched cottages; if the artefact shows, WP3 restricts the soft layer only (a
    separate `uCtCanN` / per-slot flag for soft materials fed by a tiny runtime set of soft-hidden tiles or crown
    AABBs shipped by the exporter; the meta file itself may not be imported), foliage keeps the unconditional fade.
  - Interiors: `world/interiors.ts` builds on demand (prefetch: own home, any door within 3 tiles), caches 2 (LRU),
    parks the town (`world/park.ts`) only after the warm-up; the stage frames the vendor dollhouse camera itself
    while inside (`driveInteriorCamera`, default on; harmless when input/camera uses `interiorCamera()` too).
    The ≤ 120 ms switch budget is met for a PREFETCHED entry (walk up to the door, then go in: the smoke asserts
    `lastSwitchMs ≤ 120` and reports the rAF hitch); a teleport into a room that is neither the home nor near a door
    (Storyteller `reason: 'storyteller'`) pays the full room build (measured 142 / 157 ms on SwiftShader; the smoke
    reports it as `coldInteriorSwitchMs`, not asserted). Lead: record the qualified budget in §7 / §11.
  - Per-frame work is allocation-free once every avatar was seen (reused hour input, canopy point pool and slot
    list, tower plan rebuilt only when `game.clock` or its shown second changes, door driver entries mutated in
    place, a reused interior camera `set` argument).
  - SwiftShader on the game host (12 cores, 960×540, `low`): a frame of the town costs ≈ 0.6-1.5 s once the page
    renders continuously (measured with rAF deltas by `stage-smoke.mjs`, with and without the canopy fade: no
    difference within that noise), and `destroy()` takes ≈ 25-30 s of GPU-process teardown. The earlier note of a one-off
    17-22 s "first vote frame" stall was not reproduced in the stage smoke (vote frames ≈ 0.3-1.7 s). e2e specs on the
    host must poll for state (door swings, eases) instead of waiting fixed wall-clock times (door swings and the
    1.5 s view-settle are engine time, which advances slowly on SwiftShader). A remote that vanishes at a door (went
    in) or appears at one (came out) swings it; one that vanishes in the open, or (re)appears right after the own
    view changed (own location, phase), does not.

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
- **Status (WP4, 2026-10-17; committed in "v3 C1a" 2026-10-18; waits for the C1 integration):** code + unit tests done in
  `game3d/overlay/{index,types,place,anchors,atlas,surface,labels,bubbles,socialView,boards,gameplayView}.ts`. Ran on
  the host: overlay unit tests (4 files / 28 tests pass), client `tsc --noEmit` (no overlay errors), and a scratch
  Chromium smoke (2D canvas only, no GPU flags) of the layer over a fake View3d / AvatarRegistry / connection: atlases
  load, bubbles / boards / labels / pins / point emote drawn, no console errors, no `<img>` from chat text. **Not run:**
  the e2e `v3-social`, `chat-bubbles.spec.ts` and `door-boards.spec.ts` on v3, and the harness accuracy shots: they
  need the layer registered in `TownGame3d` together with WP1's View3d / pointer input and WP2's AvatarRegistry (C1).
  **D2 (2026-10-17, DOM bubbles):** done in `overlay/{bubbles,surface,atlas}.ts` + `overlay.layer.test.ts`. Ran on the
  host: overlay unit tests (4 files / 46 tests pass, incl. the new "a bubble element paints above every label, also a
  label created after it that it covers", the D2 walking budget with 15 labels + 5 bubbles, the lifted-tail and fade
  tests), client `tsc --noEmit -p apps/client` (clean). The e2e `chat-bubbles.spec.ts` on v3 is still C1/C2 (the
  layer is not registered in `TownGame3d` yet). **D2 review fix round (2026-10-17; committed in "v3 C1a"):**
  labels live while their avatar is in `OverlayFrame.drawn` (hidden with one `visibility` write while the head is off
  the canvas; a drawn-but-never-on-screen avatar gets its label made hidden up front), so crossing the view edge no
  longer destroys / rebuilds a label; bubble slots are keyed by speaker pid (+ free list) instead of SpeechBook index,
  so another bubble expiring / leaving / being replaced writes nothing to this one, and a re-posted bubble is
  re-appended once so the newest paints on top; new `Z_ORDER.badge` (z 2, under bubbles) for the door-board "+N" and
  the nick face (`tip` z 4 is only hover / press tooltips now); the pre-decode bubble panel draws its 1-texel edge
  with `outline` + `outline-offset: -px` (on the outer edge); labels, bubbles and house-name callouts measure with
  `ceil(getBoundingClientRect())` (`surface.measureEl`), retry a 0 × 0 measure (hidden town) on the next frame, and
  re-measure once when `document.fonts` fires `loadingdone` (`surface.fontEpoch()`). Ran on the host:
  `pnpm vitest run apps/client/test/game3d/overlay` (5 files / 53 tests pass: the D2 walking budget now has 3
  walkers crossing the canvas edge and asserts exactly 3 visibility writes, 0 content writes and ≤ 1 transform per
  element per frame from a per-element style-write log; exact fade step sequence; 5-bubble expiry / re-post touch only
  their own slot; tail offset at px 2; badge under bubble; null-URL fallback; ceil / 0 × 0 retry / fonts re-measure;
  new `overlay.atlas.test.ts` runs the real `atlas.url()` crop / cache / re-crop over a fake Image + canvas; any
  swallowed view error now fails the layer tests), `pnpm vitest run apps/client/test/game3d` (25 files / 335 pass),
  `pnpm exec tsc --noEmit -p apps/client` (clean). **Known gaps vs `indicators.json meta.bubble` (for the C2 art
  critics):** (1) a lifted bubble drops its tail; r2 wants the tail kept over the speaker + a 1-px dotted connector
  down to the label (follow-up); (2) no `bubble_pop` appear frame (follow-up); (3) the fade is quarter-step
  `opacity`, not the 3-step Bayer dissolve, so a name under a fading bubble shows through at 25-75 % for the last
  600 ms (and the 140 ms fade-in). A `mask-image` dither was not done: with `mask-clip: border-box` a mask clips the
  tail child that hangs below the box, so it needs a wrapper element (box + tail rows) first. **C2 still owes** a real-
  browser paint-order check (`elementFromPoint` over a label covered by a bubble returns the `.ct-v3-bubble`) in the
  v3 `chat-bubbles` run or the harness. `overlay/index.ts createOverlayLayer(deps): OverlayLayer` (a `Layer3d`). `deps`: `parent`
  (`.ct-game-canvas`), `surface?` (pointer element, default `parent`), `conn`, `view: View3d`, `avatars:
  AvatarRegistry`, `gameplay?: () => GameplayFrame | null` (WP1's core frame of this tick), `pixelScale?` (default
  `max(1, round(innerHeight/360))`; pass `engine.pixelScale`), `faceToward?`, `passTap?` (= WP1 `PointerInput.tapAt`),
  `ownPointerInput?` (harness only), `socialHook?` (default true: installs `__ctSocial` when `ct.debug.social=1`;
  false = the host installs `layer.social.debugMembers()` via WP1 `installSocialHook`), `social?`. The layer exposes
  `socialSink` for WP1 `pointerInput.setSocial(...)` (it records each claim's screen point, so pin / person hit tests
  run in screen space even when a 3D pick mapped a roof click to a door tile), `tapFirst(ev)` (the same claim for a DOM
  event), `flush()`, and `debug()` = `bubbles()` (v2 shape, page-px boxes), `doorBoards()` (v2 `inspect` shape +
  `screen` page-px box; `rect` is a world-px box derived from the screen box at the anchor's zoom, `visible` = built and
  the viewer outdoors), `overlay()` (DOM write counters + per-second rates). Every avatar-anchored overlay is *drawn*
  only while `AvatarRegistry.anchorOf(pid) !== null` in the viewer's location; its DOM element and state live while
  the avatar is drawn there at all (`OverlayFrame.drawn`, on screen or not).
- **Drawing (as built).** One root (`position:absolute; inset:0; pointer-events:none; isolation:isolate`) appended to
  `parent`, holding a 2D **FX canvas** at CSS-px resolution (every sprite scaled by the integer UI scale `px`,
  `image-rendering: pixelated`, smoothing off, redrawn only on frames that draw something) for every atlas sprite
  except the chat bubbles (pins, hands, pings, trails, seat markers, guides, off-screen markers, board tokens, poofs,
  talk glyph / ripple), DOM text (labels, house names, tooltips, "+N", nick face) set with `textContent`, and (lead decision D2)
  **one DOM element per chat bubble**: `surface.bubble()` = a `div.ct-v3-bubble` whose 9-slice box is a CSS
  `border-image` of the indicators atlas' `bubble_nine` (the frame cropped once into a `data:` URL by `atlas.url()`;
  CSP `img-src 'self' data: blob:`; slice `3 3 4 3 fill`, border widths = insets × `px`, explicit width / height in
  whole texels), whose text is its own Text node (`textContent`, measured once per message on one shared invisible
  probe span, rounded up; again when web fonts arrive), bound to its speaker (one slot per pid, freed slots reused), and whose `bubble_tail` is an `aria-hidden` child (it must be a child: it paints over the box's bottom
  edge, which no background layer of the same element can; shown / hidden with `display` so a hidden box never leaks
  a `visible` child; tail rows corrected to 2 below the box, as `bubble_sample_1`). Paint order (fixed z-index per
  kind, set once at creation, `surface.Z_ORDER`): FX canvas 0 < labels / house names 1 < badges ("+N", nick face) 2 <
  bubbles 3 < hover / press tooltips 4, so a bubble covers every name label and badge regardless of creation order;
  among bubbles the newest message paints on top. Until the atlas decodes, a bubble is a plain token-colour panel
  (fill + a 1-texel edge drawn as an inset `outline` on the outer edge, no tail). All styles go through the CSSOM; there is no stylesheet, so no
  `CSS_ORDER` entry is needed (the planned `overlay/*.css` was dropped). **D2 write budget (as built):** the box moves
  by `transform` only (≤ 1 write per element per frame, none under 0.5 px; the tail child's transform is written only
  when its offset in the box changes, i.e. edge clamping); text, size and skin are written on change only; opacity is
  quantised to quarter steps (≤ 4 writes per fade in or out). Unit-tested: 15 walking labels + 5 bubbles for 1 s at
  60 fps with 3 walkers crossing the canvas edge = 3 non-transform writes (one `visibility` per crossing; target
  ≤ 5 / s). Atlases (`indicators`,
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

- **Owns:** `apps/client/src/ui/common/{v3atlas, v3skin, v3skinLobby, v3portrait, graphicsStatus}.ts`, the v3
  gating in `castPortrait.ts`, the `SettingsDialog.tsx` Graphics row (incl. "Try v3 again"), the v3 branches in
  `ui/social/{SocialPalette,PieMenu}.tsx`, and (acting for lobby-auth) the Town choice / badges in `ui/lobby/
  {LobbyFinder, CreateLobbyModal, ModeSettings, WaitingRoom, JoinPreview}.tsx`, `finder.ts`, `lobby.css`. (No
  `theme-v3.css`: the tokens are applied through CSSOM, §5 "As built".)
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
- **As built (WP7a, harness + v3 e2e, 2026-10-18; committed in "v3 C1a").**
  - Harness: `apps/client/v3-harness.html` → `src/game3d/harness/{main,scenario,fakeConn,projection}.ts`, built only by
    `apps/client/vite.harness.config.ts` into `apps/client/dist-harness/` (gitignored by `apps/client/.gitignore`),
    served by `vite preview` on 127.0.0.1:3460 with the production CSP. Modes: `?scenario=<name>` (replay + stills,
    the clock pauses on each shot until the driver acks), `?scenario=projection` (§1.5 marker check at scales 2/3/4),
    `?mode=cycles` (5 mount/destroy + 2 tier rebuilds + 1 injected frame-loop crash: hooks / canvases / boot mark gone,
    exactly one `fallback('error')`, heap growth < 10 MB). Scenarios: `tests/v3/scenarios/*.json` (all 8 of §6.3).
    Driver: `tests/v3/{harness.config,render-check.spec}.ts`, run by `scripts/v3/render-check.sh` (both locks; stills +
    `summary.json` to `tests/v3/shots/<date>/`, gitignored). `scripts/v3/smoke-mount.mjs` now runs the `cycles` check.
    Typecheck: `tsc -p tests/v3/tsconfig.json`; unit: `apps/client/test/game3d/harness.scenario.test.ts`.
  - e2e: project `v3` (only with `E2E_V3=1`, §6.2) for `tests/e2e/v3-*.spec.ts`; `scripts/v3/e2e.sh` (E2E_PORT
    3485-3499). Helpers (`tests/e2e/helpers.ts`): `setE2eWorld`/`geo(world)` (layout + plaza per world from
    `tests/v3/worlds.ts`), `v3Context`/`v3InitScript` (§6.2 flags), `waitV3Ready` (fails at once when Classic mounted,
    asserts SwiftShader), `townRenderer`/`v3Info`/`classicTown`, `createLobbyViaUI`/`waitingRoomWorld`,
    `requireV3Hooks` (a spec whose package is not wired fails at once with `PENDING C1: …`), `v3Shot` (SwiftShader
    screenshots can exceed 30 s), `walkIntoDoor` pushes along `-doorNormal` for rotated doors. `tests/support/bot.ts`:
    `createLobby(…, {world})`, `bot.world` from `lobby:view`, path planning on the lobby's layout. Classic specs
    unchanged in behaviour (defaults stay v2).
  - Pending on C1 (fail fast with `PENDING C1`): `v3-doors`, `v3-social`, `v3-vote`, `v3-life`, `v3-mixed`, the
    context-loss rebuild and the perf-fallback cases of `v3-fallback`, and the join-preview test of `v3-lobby-choice`
    (lead's `JoiningLobby` wiring). Open: the harness still camera override needs a `__ctCamera.setCamera` member
    (CONTRACT-REQUEST, recorded as `cameraApplied: false` until then).

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



**User decisions (2026-10-17, binding; the per-lobby choice below is SUPERSEDED 2026-10-18 by URL paths: `/` = v3, `/v2/` = v2, see §11):**
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
| Q10 render host | ANSWERED 2026-10-18: host GPU and the render host allowed (§11); before that: NOT used until the user allows it (CLAUDE.local.md forbids the other machine for this project). Visual stills: SwiftShader on the host inside the capped slice (CPU only, never the host GPU), lowest quality, few frames. Real perf: `ct.debug.v3perf` on the dev service from the user's own devices | respects both host rules |


**User requests in flight on the pixel3d side (2026-10-17) — wire them on the game side as they land in `v3-dev`.**
Status after the 2026-10-18 vendor refresh (`v3-dev` `bd4c9ff` merged as `5fb072f`, assets re-imported; v3-world):
all four are **delivered by the vendor in the demo layer** (`src/demo/passb.js` parts; the town piece only got an
additive clocktower hook, vendor `docs/TOWN.md` §13). Game-side wiring per item:
1. **Voting-circle camera** reframed to show more of the players and the clock tower's clock. **Vendor: delivered**
   as a COMPUTED frame, not a preset: `src/demo/votecam.js voteFrame({yaw, lowW, lowH, right, hud, heights, dials,
   stage, ui}) -> {target (ground Vector3), viewHeight, yaw, pitch, tw, box, dial, shift, staged}` (every seat with its
   occupant + the dial facing the camera, fitted inside the visible area minus HUD keep-out boxes), `towerDials(demo)`
   (needs `demo.town.registry`), `facingDial(dials, yaw, pitch)`, `CANDIDATES = [0, 45, -45]`; default staging = stage
   A of `votestage.js` (`STAGES.A`: cast on the 15 stones, yaw auto (45 at 16:9), **pitch 23°** (30° portrait)); the
   demo's `installVoteCam(demo)` wraps the demo camera rig (not usable as is). `town/api.js CAMERAS.vote` is
   **unchanged** (yaw 0, viewHeight 19), so WP3's `Stage.voteCamera()` still returns the old shot. **Game side to do
   (WP3 + WP1 camera):** call `voteFrame` (through `vendor/`) with the game's HUD keep-outs, the seat heights and
   `api.dials` (use `dials[i].local` × the piece group's current `matrixWorld`: `center` / `normal` are captured at
   build time) while the player is on the circle during nominations / votes; the pitch ≠ 30° must flow into the
   projection (`coords.ts` reads the camera live) and the pick.
   **Game side: wired (C1).** `world/voteFrame.ts` is a pure port of the vendor's fit (`contentPoints`, `facingDial`,
   `voteFrame`, the candidate choice with `PREFER`; staging A: the 15 stones, pitch 23° / 30° portrait), because
   `votecam.js` imports `votemarks.js` and with it the demo's whole HD UI / events chain (§9.2 request); the keep-outs
   are the GAME HUD's corners (`VOTE_KEEP_CSS`, converted per canvas by `keepOuts`). The stage computes it from
   `vendor/town.ts seatStones()` + `towerDials(town)` (`dials[i].local` × the piece group's current matrixWorld),
   cached per canvas size (`Stage.voteCamera(lowW, lowH, pixelScale)`); `input/camera.ts` shows it while
   `net/core.ts voteCameraWanted(game)` (day: nominations open, or a pending / voting nomination) and the viewer is on
   the square (`cameraMode`), stepping in and out through 4 whole key poses over 0.75 s (`steppedPose`, the vendor's
   stop-motion rule; reduced motion jumps). The yaw (0 / ±45°) and pitch flow into the projection, the pick, the canopy
   fade and the billboards (all read the camera live); keys stay screen-relative (`turnKeys`). Unit:
   `test/game3d/voteCam.test.ts` (switch rule, the fit through the REAL PixelCamera at 960×540 / 1920×1080 / phone
   portrait: every seat + the facing dial on the canvas and clear of the keep-outs, candidate choice, stepped
   transitions, keys).
2. **The clock tower's clock is the Storyteller's timer** with an in-universe readout. **Vendor: delivered differently
   from the §9.2 `setTimer` request**: (a) additive clocktower hook `api.dials` (the 4 dials: `{matrix, local, center,
   normal, k, dial, bezel, surround}`), `api.hands` (the live hands group: hide it while a countdown shows) and
   `api.body` (door / stage / belfry dimensions); (b) `src/demo/towertimer.js drawDialFace(builder, {frac, mode
   ('set'|'running'|'paused'|'done'), stage ('discussion'|'nominations'|'bedtime'), flashOn, k, mirror, night})`
   draws the v2-style countdown (a stage-coloured wedge = time left, one iron hand, pause bars) into a kit `Builder`
   pushed on a dial's `local` frame (kit solid + glass: no new program); the demo's `createTowerTimer(demo)` is a
   self-clocked ST countdown with keys K / Y / U / I (not usable as is). (c) **The in-world digital readout was dropped
   by the user on the pixel3d side** ("instead of the digital clock on the clocktower, have the counter just be part of
   the HUD"): the split-flap board is off (`?board=1` only); the readout is the HUD timer chip (`src/ui/hud/art.js
   drawClockChip` / `drawStClock`, demo `timer-ui.js`). The `createTime` tower gate does not matter (the face is drawn
   beside the hands, never through `setTime`). **Game side to do:** WP3 `vendor/town.ts towerTimerApi` probes
   `api.setTimer` (never published): replace it by a game-side face (hide `api.hands`; one Builder over the 4
   `dials[i].local` with `drawDialFace` from the §3.1 / `towerClock.ts` plan, rebuilt only when the 2° wedge step,
   mode, stage, flash or night changes; `null` plan = show the hands again); the readout = the existing `ClockChip`
   (v2.1) in the v3 skin (WP6), optionally drawn with `drawClockChip`. No server change (the stage timer data exists).
   **Game side: wired (C1).** `world/towerClock.ts dialFace(clock, serverNow, hour)` (running = the wedge of the time
   LEFT in 180 steps, paused = dimmed + pause bars, done = a 4 Hz flash for 6 s after zero, held until 30 s, then the
   hands; night 19:30-06:00 draws the wedge solid) → `vendor/town.ts createTowerFace(engine, town)` (`drawDialFace` on
   every `api.dials[i].local` frame, `api.hands` hidden while it shows; one persistent mesh per kit layer whose
   geometry is swapped only when `dialFaceKey` changes; kit solid / glass = no new program; warmed once in
   `stage.warmUp`). The readout is the existing HUD `ClockChip`. The tower room's own dial back, timer train and bell
   rope follow the same state (item 4). Unit: `world.towerClock.test.ts` (`dialFace` cases).
3. **No NPCs in the voting circle.** **Vendor: delivered for the demo** (`seatcast.js` puts cast on the seats instead of
   mannequins, idle NPCs walk out to r 11-16 m during a vote, `ringclear.js`). **Game side:** WP5a export (done
   2026-10-18): NPC homes are outside the plaza ellipse × 1.1 and the square (the sweeper's home moved (16,12) →
   (16,10)); Classic `npcSpot` (plaza × 1.1) keeps every roam step out; the life piece runs with `folk` / `ambient`
   off (§3.1). **Open (WP2, CONTRACT-REQUEST):** the 3D roamer (`avatars/npcs.ts`) guards with protocol `inSquare`
   only, whose circle (centre y 364, r 144) does not contain the voting circle's north arc: 23 walkable tiles within
   the seat ring + 24 px lie outside it ((19-25,12), (17-20,13), (24-27,13), (16-17,14), (27-28,14), (16,15), (28,15),
   (15,16), (29,16)); also exclude the plaza ellipse × 1.1 (Classic's rule) or `circleCentre` distance ≤ `rx` + 32 px.
   **Game side: done (C1).** `avatars/npcs.ts inVotingArea` = `inSquare` OR the plaza ellipse × `NPC_PLAZA_CLEAR` (1.1),
   for the spawn spot and every roam step (v3 worlds only).
4. **The clock tower can be entered.** **Vendor: delivered** (`src/demo/tower-interior.js`: an 8 × 5.5 m clockwork
   room at x 650 with a stair and a 1.1 m landing; the town piece unchanged, entered through its `clocktower-door`
   anchor). **WP5a export: done** (2026-10-18, §2.2 "The clock tower room"): the 16th building `clocktower`, nobody's
   home, open to all by day / bedtime and locked for players at night by the existing server rules (no server change;
   `world.v3.test.ts`). **Game side to do:** WP3 interiors (`bld:clocktower` → `buildTowerRoom(engine, demo)` with a
   facade `demo = {engine, events: {on}, passB: {timer: {state}}, time: {hours}}`, its `update(t)` per frame, the
   room's `lights` for the constant pool, park the town as for cottages), `coords.ts` (the `towerRoomV3` translation +
   `heightAt` for the floor Y), WP2 (avatar feet on `heightAt`), WP1 (door / pick / auto-enter for the tower: rules
   already data-driven), the tower door art (`world/doors.ts` filters `/^house-\d+$/`), Classic `houseInUse` (§2.5).
   **Game side: wired (C1).** `vendor/interiors.ts buildTowerInterior(engine, facade)` wraps `buildTowerRoom` as a
   `BuiltInterior` (`index -1`, its lanterns / dial window as the constant pool's `lights`, `heightAt`; the vendor
   ORIGIN and exit spot are checked against `coords.ts TOWER_ROOM`); `world/interiors.ts` caches / parks / shows it like
   a cottage under `TOWER_KEY` (prefetched near its door); the facade's timer / bell / hours come from the stage
   (`dialFace`, the time facade's 'bell', the shown hour). `coords.ts roomMapOf` + `Stage.floorAt` (stair / landing)
   for the projection, the pick (`PickCtx.floorAt`) and the avatars' feet (`AvatarServices.floorAt`); the tower door
   swings (`world/doors.ts SWING_DOOR`, `vendor/town.ts towerDoorApi`); `rules/doors.ts houseInUse` is true for a
   building with `houseIndex: null` (no "Nobody lives here" / boards at the tower in Classic or 3D; v2 has none).

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
- `spec.ghost: {hover}` for the 10 remaining `clips` specs (chonk, goat, green-hood, honk, mole, moth, mushroom, rabbit,
  skeleton-chef, snail; crow / fox / frog / owl / polly / toad got it in the 2026-10-18 refresh) and storyteller,
  wanderer (WP2 re-measured, §4); a `point` clip for nicksong (every other cast spec has one now).
- (WP2) a public `handle.sockets` / `handle.ghost` (today read via `ch.rig.sockets`, `ch.ghost`). (The `{lights: false}`
  part is satisfied since the 2026-10-18 refresh: `createCharacter` always builds the Character from `lightless(spec)`
  and exposes the spec lights as socket nodes, `handle.lights = [{L, node}]`; `vendor/characters.ts suppressSpecLights`
  is now redundant and harmless.)
- (WP2) a public `Character.teleport(pos, face?)` (or `handle.teleport`): put the fixed-step sim at rest at a new
  spot (prevPos = pos, vel / velF / prevVelF / lean zeroed, `gait.reset(pos, facingYaw, ground)`, chains re-seeded).
  `_step` derives the velocity from the drive's position difference, so a door step (outdoors → interior origin,
  X ≥ 200 m) or a Storyteller poof otherwise kicks lean / run / heading for a few steps. Today
  `vendor/characters.ts resetMotion` writes the private `ch._s`, `ch.gait`, `ch._chains`. Also: expose the FX /
  smear objects a handle adds to `engine.scene` (`handle.extras`), so the game can pre-compile them (today a scene
  child diff around the build).
- (WP4) `indicators.json meta.anchors.bubble_tail.note` says the tip's "rows 0..1 overlap the box edge + line rows";
  `bubble_sample_1` (box 15 rows incl. the shadow row + 2 tail rows = 17) shows rows 0..2 overlap. Please fix the
  note to "rows 0..2" (the game follows the sample: `overlay/bubbles.ts TAIL_ROWS = 2`).
- (WP6) `v3/assets/ui/panels.css` (bake output of `tools/uibake.sh panels`): the last line has one `}` too many after
  the `@media (prefers-reduced-motion: reduce)` block; postcss (Vite) rejects the file, so the game links it raw.
- (WP6) Optional: a `nick_face` emote frame and `icon_nicksong` / `icon_brianbi` in the v3 bakes (today documented
  skips that keep the v2 art in v3 lobbies).
- Delete the stray temp files `v3/assets/sprites/.skeleton-chef-preview.png.wgV9lp` and
  `.frog-preview.png.7amzXJ` upstream, so the next import drops them.
- (WP3) `demo/time.js createTime`: honour a gated / boarded house in its lit-in-order map (e.g. read
  `api.setLit`'s effective state, or a `params`/facade `skipLights(pieceId)` predicate), so the pool never aims a
  PointLight at a dark cottage's lantern. Today `world/stage.ts` zeroes those pool lights after every `time.update`.
- (C1) `demo/votecam.js`: export the PURE fit (`contentPoints` / `voteFrame` / `facingDial` / `towerDials`) from a module
  that does not import `votemarks.js` (whose `ui/hd` / `ui/events` / fonts chain the game must not bundle), with a
  keep-out box list parameter instead of the demo HUD's `KEEP`; the game then wraps it in `vendor/` and drops its port
  `world/voteFrame.ts`.
- (WP3) `demo/api.js createCutController`: optional extra protected points (remote avatars), or more than 3 boxes;
  today only the own player gets the hard cut-away box and every other avatar relies on the game's canopy dither
  (`world/canopy.ts`, D1), which covers crowns / soft dressing only.
- (v3.1 fixes, remount leak) `town/life/index.js build()`: define the `stats.at` accessor with a MODULE-LEVEL getter
  (per-build data in a WeakMap keyed by `stats`, or a plain method) instead of `get: () => walkers.map(…)`. V8 shares
  one DescriptorArray along a map transition chain and the AllocationSite boilerplate of the `stats` literal keeps
  that chain alive with the module, so the getter closure held build()'s whole scope (engine, registry, door anchors,
  render pipeline): one full town (≈ 80-95 MB JS heap) survived every later destroy. The game patches it at build
  time (`apps/client/build/pixel3dImports.ts`, `town/life/index.js`). Same pattern to avoid anywhere a build
  function adds an accessor whose closure captures the build scope: `town/life/cycle.js` `Object.defineProperty(pl,
  'intensity', { get, set })` on pool lights (not in the game's path today: the game never calls `setTimeOfDay`).
- (v3.1 stage) Mark the town's animated kit meshes so a cross-piece merge can leave them out up front: e.g.
  `mesh.userData.dynamic = true` (or a piece api list) on the house-3 crow, the house-11 weather vane, the props garlic
  string and the stall lanterns (their swing groups are not named `*-pivot`), the fountain-water glass, the ground boat,
  `house-14-water` (geometry swapped) and `house-1-bubbles` (draw range). Today `world/merge.ts` detects them on the first
  frame they change (transform / visibility / geometry compare) and EJECTS them from the batch, which is correct but
  keeps a dead instance per mesh. Optional, larger: the kit Builder / composer could emit the static town as one
  `BatchedMesh` per kit layer itself (the game's `game3d/world/merge.ts` shows the bake rules: positions, normals and
  the `aTownPart` centroid / bottom go to root space, `aTownPiece` 0-padded).
- (v3.1 cpu) `town/cutaway.js`: a cheap cut-away variant for software GL (or a build flag the game can set at its
  `cpu` tier): no section rim (`townCutRim` = 4 extra `townCut` evaluations per pixel), and `townCut` / `townDiscard`
  with the lift / box loops sized to the live counts at compile time (e.g. `#define`d `CUT_MAX_BOXES` /
  `CUT_MAX_LIFTS` the patch reads, so the game can compile 1 box / 1 lift). Measured on SwiftShader
  (docs/perf-v3/cpu.md §7): the toon arithmetic itself is cheap (the ground and kit patterns plus the whole lighting
  block dead-code-eliminated: −9 %); a MeshBasic host WITHOUT the cut-away hooks is −48 % of a cpu frame, the same
  host WITH them is −5 %, so the cut-away code is most of what is left of the colour pass. SwiftShader runs every
  side of every branch, so a uniform that disables the rim / loops saves nothing; it has to be compiled out.
- (v3.1 cpu) `materials/toon.js`: optionally a supported MeshBasic-hosted toon variant (same hooks, the band from
  `bandWeights(N·L)` per pixel, no shadow / cloud / penumbra / point-light / pass-mode code). The game does this from
  outside today (`vendor/cpuTier.ts` "toon twin", opt-in: it captures each material's hook text by running its
  `onBeforeCompile` on a marker shader), which is brittle and cannot serve `lightMod` / `outgoing` materials
  (characters). Also: a `flight: false` build flag for `town/pieces/ground.js` (the `uCamFlight` branches; the game
  compiles them out with a program-text rewrite).

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
| (found in WP0s, pre-existing v2) A touch long-press within ~136 px of the viewport edge: `radial.ts show` clamps the pie centre away from the finger, so lifting in place lands on a wedge and commits it (`v2-social.spec.ts` "desktop and phone" fails whenever the target sits there; reproduced on the C0 tree) | **Fixed (D3, §11):** on touch the dead zone (and "left") is measured from the press point (`radialLogic.touchGate`), so a lift in place stays sticky and never commits; outside it the drawn wedge under the finger is picked (`pieWedgeAt`), so a slide toward a wedge picks it wherever the pie had to be drawn; mouse unchanged |
| (found in WP7a, 2026-10-18) The §1.2 "one retry after 1 s" of a failed `town3d` chunk never reaches the network: `v3-fallback` "chunk fails" sees ONE request for both attempts (Chromium appears to keep the failed fetch in its module map, so `import()` of the same URL rejects again at once). Classic still mounts in place, so players are not stuck, but deploy skew is never retried | **Resolved (C1, 2026-10-18): retry dropped.** A fresh-URL retry (`?retry=<ms>`) was tried and cannot work: the built `town3d` chunk is imported by its plain URL from dozens of 3D sub-chunks (houses, characters, foliage, dais, …), so a `?retry` copy is a second module instance whose sub-chunks still link to the failed URL (and a same-URL `import()` rejects again without a request). `GameScreen.importTown3d` is now the plain import: a chunk failure = Classic in place at once (the `'error'` notice); a reload (or "[Try v3 again]" after one) retries. Deploy skew needs a server-side answer (keep old hashed assets for a while) if it ever matters. `v3-fallback` "chunk fails" (assertion changed to "requested once, Classic in place") passes on the host GPU |

---

## 10. How to continue (for future agents)

- **Newest state (2026-10-18 ~08:20 PDT): read `docs/progress.md` "v3 handoff" first** — C1a + vendor B are committed; C1 integration, WP8 (URL paths + v3 loading screen), v3 server/network perf and the CPU-tier prototype were stopped mid-work and saved as the "v3 WIP" commit (untested). Paragraphs below may lag behind it.

- **Current state (2026-10-18, after checkpoint C1a):** WP0, WP0s, WP5a (C0 / C0b) and now every phase-1 package
  (WP1, WP2, WP3, WP4, WP5b, WP6; each authored, reviewed and fixed), the lead decisions D1-D4 (§11), the WP7a harness
  + v3 e2e specs and the perf recon tooling are committed on `v3-game` ("v3 C1a: …"). v3 lobbies can be created from
  the UI (Town choice, badges); Classic 2D draws the v3 map (WP5b); the 3D client draws WP0's stub + WP3's stage
  (town, interiors, time, dais, doors, canopy). **Not yet wired into `TownGame3d.ts`** (lead-owned composition root):
  WP1 core / input / lifecycle / PerfSampler, WP2 avatars, WP4 overlay + social view. So the 3D client still draws
  only the own stub avatar and no labels / bubbles / pins. Import the gameplay/social logic from
  `game/gameplay/core.ts` and `game/social/controller.ts` directly (not the `index.ts` barrels), so `phaserView`
  stays out of the `town3d` chunk.
- **Vendor refresh B (2026-10-18):** `v3-dev` `bd4c9ff` (pass A + B + seal vote) is merged and the clock tower is an
  enterable v3 building (WP5a). What the vendor delivered for the four user requests and what the game still has to
  wire is in §9.1 (vote camera, tower timer face, NPC guard, tower room in 3D, Classic `houseInUse`).
- **C1 proper: done in the working tree (2026-10-18, integrator `v3-integrate`; §11 "C1", §8 Status).** Items 1-4 below
  are wired (incl. `__ctCamera.setCamera`, `publishRender`, the fresh-URL chunk retry, `useV3Skin` + `JoiningLobby`
  in `LobbyRoute`, the qualified interior budget in §7) plus the four §9.1 user requests; still to do: a gate commit,
  then item 5 (WP7b). Original list, for reference:
- **Next = C1 proper (lead), then WP7 part B (C2):**
  1. `TownGame3d.ts`: wire WP1 (§8 WP1 "API (as built)"), WP2 (register `createAvatarLayer` after `net/` and before
     `overlay/`, `await avatars.selfReady(5000)` before `stage.warmUp`, pass `avatars.registry` to the overlay,
     `core.on('placed') → avatars.fadeIn`, voice presence → `setTalking(pid, on, rim | null)`), WP4 (overlay +
     `socialView`, `__ctCamera.bubbles` / `__ctSocial.pins/emotes`); add `__ctCamera.setCamera({focus, viewHeight})`
     for the harness (CONTRACT-REQUEST in `game3d/harness/main.ts`).
  2. `GameScreen.tsx` (world-art / lead): `publishRender({kind, tier, fallback})` + `publishRender(null)` on unmount
     (WP6 Graphics status line); `importTown3d`'s one retry must use a fresh URL or be dropped (§9.3, `v3-fallback`
     "chunk fails" is red on it).
  3. `LobbyRoute.tsx` (lead): `useV3Skin(conn)` once in `InLobby`; `<JoiningLobby id=…/>` on the `!conn` and
     `layout !== 'ready'` screens (`v3-lobby-choice` join-preview test waits on it).
  4. Record WP3's qualified interior budget in §7 (prefetched switch ≤ 120 ms; cold Storyteller teleport reported
     separately, 144 ms on SwiftShader).
  5. Then WP7b: `E2E_V3=1` specs `v3-doors`, `v3-social`, `v3-vote`, `v3-life`, `v3-mixed`, the `v3-fallback`
     context-loss / perf-sampler cases, `hd-cast.spec.ts` v3 branch, harness stills (`night-15`, `vote-12`,
     `interior-house-5`, `dusk-transition`, `phone-390x844`, `south-bay`; ~3.5 min each on SwiftShader), the harness
     `cycles` heap check re-run with `--enable-precise-memory-info`, art critics (billboard talking rim looks washed
     out at 0.3; WP3 soft-layer fade behind thatched cottages; WP4 bubble gaps vs `indicators.json meta.bubble`), and
     a §6.3 build check that `dist/` has no harness files. The user's Q7 review gets the WP5b stills (37
     sprite-over-walkable tiles, §2.5).
  (The WP0s review lows are done since C0b: `test/support/importClosure.ts` follows re-exports / side-effect /
  dynamic imports; `GameplayFrame.picking` is `{ label }`.) Summary for humans: `docs/progress.md` "v3 status" /
  "v3 handoff".
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
- 2026-10-17 (WP5b, continued after the handoff): the §8 WP5b test line "`v2-phone` / `v2-look` / `doors` against a v3
  lobby" is met by `classic-in-v3.spec.ts` (all 15 doors by tapping, v2 → v3 → v2 in one page, Q7 phone and desktop
  shots); the three v2 specs keep pinning v2 geometry and run against v2 lobbies as the Classic regression check until
  WP7 makes `tests/e2e/helpers.ts` world-aware. Rooms whose bed spot has no blocked floor tile beside it draw no bed
  (furniture stays decoration on blocked floor only); the Q7 review decides whether that needs art.
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
- 2026-10-17 (WP4, D2): chat bubbles left the FX canvas (which paints under every DOM label) for one DOM element each
  (border-image box from a `data:` crop of `bubble_nine`, text node, tail child) at a fixed z-index above the labels;
  the "sprites cost a drawImage" rule above now covers every overlay sprite except the bubble box and tail. The tail is
  a child element rather than a background layer because it must paint over the box's bottom edge; the box size is
  measured on a shared probe span so its explicit texel size never feeds back into the measurement; opacity steps in
  quarters (`ALPHA_STEPS`), matching the atlas' 3-step dissolve, so a fade is ≤ 4 writes instead of one per frame.

- 2026-10-17 (WP6): the kit tokens are applied by CSSOM on `<html>` from `kit.json` (no `theme-v3.css`, so no `CSS_ORDER`
  entry and no hand-copied colours); the vendor `panels.css` is linked raw in v3 lobbies (Vite rejects its stray `}`).
- 2026-10-17 (WP6): the v3 skin is gated on the lobby's world (not the renderer), so Classic-in-v3 clients see the v3
  UI too; the hour is computed client-side from the game view (`skinHour`, §3.1 table).
- 2026-10-17 (WP6): `castPortrait.ts` takes a pluggable `PortraitAlt`; the v3 strip implementation ships in the lazy
  atlas chunk to keep the entry chunk inside its +1 KiB br budget.
- 2026-10-17 (WP6): the "join-by-id preview" of the §9.1 user decision is the share-link "Joining …" screen
  (`ui/lobby/JoinPreview.tsx`, best-effort `GET /api/lobbies/:id`), because the client has no separate preview page;
  the lead wires it in `LobbyRoute.tsx`. The create dialog pre-selects `DEFAULT_WORLD` (one constant, `'v2'` until
  C3). (Fix round, same day: the remembered last pick `ct.create.world` was dropped, so a C3 flip of the constant
  reaches every browser and nobody keeps Hollowmere pre-selected after one try.)

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
- 2026-10-17 (WP3, D1 canopy rule A): **per-tree fade works; WP2 does not need the silhouette fallback.** The crowns are
  merged (one leaf mesh per 16 m chunk, cores per material / 32 m chunk, house-11's crown = 2 meshes), so the fade is
  per FRAGMENT rather than per object: `world/canopy.ts` chains a test into the canopy materials' fragment shader before
  the warm-up (a fragment in front of an avatar along the ortho view ray and inside a 0.75 m screen capsule from its feet
  to 1.6 m is discarded by a world-anchored 4×4 ordered dither down to 22 % coverage); only uniforms change per frame
  (≤ 16 avatar slots + the camera basis), so the program count is constant (smoke: 41 throughout). Shadows keep the full
  crown (depth materials untouched); the normal pass is cut the same way (foliage is FLAG_NONE: no outline noise). The
  crown's back half behind an avatar stays, so the avatar shows through a dithered front. Remaining gap: an avatar
  hidden by HARD geometry is impossible by the export (rule (b) blocks those tiles).
- 2026-10-17 (WP3): the game drives the vendor's own live cut-away controller (`demo/api.js createCutController`) every
  frame instead of leaving the build-time cut frozen; only the own player gets its hard box (3 vendor box slots), remotes
  rely on the canopy dither (§9.2 asks for more protected points).
- 2026-10-17 (WP3): boarded cottages also lose their lantern POOLS: after each `time.update` the stage zeroes the pool
  PointLights within 0.5 m of a boarded cottage's light anchors (the light count is unchanged).
- 2026-10-17 (WP3): in-flight user requests are prepared as hooks, not faked: the tower timer plan (`towerClock.ts`)
  goes to `clocktower api.setTimer` only once the vendor publishes it (time-of-day hands until then); `Stage.voteCamera()`
  returns the vendor's live `CAMERAS.vote`. Both vendor APIs are specified in §9.2.
- 2026-10-17 (WP2): the §4 ghost table is the MEASURED probe (10 cast + 4 npc `shared`, 16 `clips`, storyteller /
  wanderer / billboards `tint`); `castMap` prefers the live probe, `GHOST_BASELINE` is the test's expectation.
- 2026-10-17 (WP2): 'clips' ghosts slide by moving a holder group around the vendor Character (which stays at the slide
  anchor, so its gait never leaves the held ghost loop) instead of an `action: 'ghost'` drive (a loop clip given as a
  drive action only replaces idle). Revival of a 'clips' ghost rebuilds the body (superseded by the review round below: revive in place).
- 2026-10-17 (WP2): ghost translucency (alpha 0.6 / 0.8) and the 120 ms teleport cross-fade are a 4x4 ordered dither in
  the colour pass (`ghostTint.ts`, uniforms only), not `transparent` (three's OPAQUE define would recompile and sort).
- 2026-10-17 (WP2): the stand-in's "pin colour" is a pid hash over the pin palette (a member's pin colour is a
  device-local preference that never reaches other clients). Fallback chain: rig -> tinted `wanderer` -> v2 billboard.
- 2026-10-17 (WP2): billboards (brianbi, nicksong) use the v2 sheets with 8 directions and their v2 ghost frames, a toon
  material lit as up-facing ground, on the COLOR_ONLY layer; spec `lights` are suppressed (constant light count) and
  lanterns borrow WP3's reserve via `borrowLight(anchor)` (`lanterns.ts` matches `world/lights.ts`).
- 2026-10-17 (WP2): NPCs in v3 worlds never enter `inSquare` (user request "no NPCs in the voting circle"); v2 unchanged.
- 2026-10-17 (WP2, phase-1 continuation): the talking rim (WP4's request) extends `setTalking(pid, on, rim?)` instead of a
  second API; it is a fourth uniform of the build-time tint wrapper (program key bumped to `|ct-tint2`), so talking
  never recompiles. `AvatarLayer.registry` is typed `AvatarRegistry3d` (adds `isShown`). `anchorOf().headTopCss` gets
  a 0.1 m pad above the head, matching WP4's label anchor. 'clips' ghosts face their slide direction (the vendor
  Character stands still while sliding, so its own facing would freeze); idle townsfolk keep their last heading.
- 2026-10-18 (WP2, review round: 13 issues; 12 fixed in WP2, 1 for the lead): jumps (door steps, poofs, first
  placement) also reset the vendor Character's sim (`vendor/characters.ts resetMotion`; §9.2 asks for a public
  `Character.teleport`); billboards are cylindrical (turned about Y, height × 1 / cos(pitch), `heightM` vertical); the
  talking rim is a wide band + flat 0.15 lift (`RIM_K` 1; billboards 0.3) and the smoke measures it in pixels; a
  revived 'clips' ghost leaves its slide in place (no rebuild, no vanishing label); a landed body is pre-compiled with
  `renderer.compileAsync` into a scratch render target and stays hidden until then (≤ 3 s); ghosts carry no lantern
  light (v2), the Storyteller always does; anchors include a 'shared' ghost's hover and halo crown; the per-frame path
  reuses its containers; a discarded build keeps the one build slot until it settles; preloads load the mapped spec
  (billboards none, unknown ids the stand-in). The smoke gained a high-tier pass (6 ids with FX / smears), a
  SwiftShader check, `programsConstantOnRevive`, strict walking frames, and fails on a stand-in for any shipped id.
  Lead item (C1): race `selfReady(5000)` in TownGame3d (`selfReady(timeoutMs?)` exists now).
- 2026-10-17 (D3, `v3-radial` for world-art, lead sign-off): D3 done: the touch pie's dead zone (and the "left" state)
  is measured from the PRESS point, not the drawn centre (`radialLogic.touchGate` + `pieWedgeAt`, used by `radial.ts`
  setHot / move / release), so a long-press near the viewport edge (the pie drawn clamped up to ~136 px away) lifted in
  place stays sticky and never commits; slid out and back to the press point it cancels. Outside that dead zone the
  DRAWN wedge under the finger is picked (same angles as the pie on screen), so a slide from the press point toward a
  wedge picks it wherever the pie had to be drawn. A pure "direction from the press point" rule was tried first and
  rejected: with a clamped pie it picks a different wedge than the one drawn under the finger (it made
  `v2-social.spec.ts` slide-to-pin commit Point). Mouse / desktop unchanged; `controller.ts` unchanged. Tests:
  `social.radial.test.ts` +30 (15 -> 45; all four edges + four corners on a 390x844 phone: lift in place / within the dead zone,
  out-and-back cancel, every wedge reachable by a slide; mouse-at-edge unchanged); `v2-social.spec.ts` 3/3 green (§9.3).
- 2026-10-18 (WP7a, v3-qa): v3 e2e locking is the host-wide `v3-heavy.lock` + `browser.lock` (not the planned `locks/v3-e2e`), and the Playwright `v3` project exists only with `E2E_V3=1` (set by `scripts/v3/e2e.sh`), so a plain `pnpm test:e2e` never runs the SwiftShader specs; `--project=v3` must be written with `=` (Playwright 1.63). The harness build goes to the gitignored `apps/client/dist-harness/` (`apps/client/.gitignore`).
- 2026-10-17 (lead decisions D1-D4, the four items left open at the "v3 C1 WIP" handoff; all four are done in the
  tree and committed in C1a):
  - **D1 canopy = rule A** (fade, not block): the ~96 walkable tiles under tree crowns stay walkable; the 3D client
    dithers the crown fragments in front of any avatar (`world/canopy.ts`, entry "WP3, D1 canopy rule A" above). WP2
    needs no silhouette fallback; WP5a's export is unchanged.
  - **D2 DOM bubbles**: chat bubbles are DOM elements above the name labels (a name never shows through a bubble);
    the redefined walking budget is signed off: 15 walking labels with bubbles write ≤ 5 non-transform DOM changes / s,
    ≤ 1 transform per element per frame, none under 0.5 px (`v3WalkDomMutPerSec`, entries "WP4" / "WP4, D2" above).
  - **D3 touch pie**: the v2 pie-edge bug (§9.3) is fixed in Classic code by `v3-radial` acting for world-art
    (entry "D3" above); it also removes the `v2-social` "desktop and phone" flake.
  - **D4 e2e port**: `tests/e2e/playwright.config.ts` reads `E2E_PORT` (default 3398 unchanged for v2 runs); every v3
    run passes a port from its own §8 range.
- 2026-10-18 (C1a, `v3-gate`): the finished phase-1 packages (WP1-WP6, still NOT wired into `TownGame3d.ts` except
  WP3's minimal stage wiring), D1-D4, the WP7a harness / v3 e2e specs and the perf recon tooling (`docs/perf-v3/`,
  `tests/perf/*`, `scripts/perf/*`, measurement only) are committed as one "v3 C1a: …" checkpoint after typecheck,
  build and the full `pnpm test` on the host (§8 Status, `docs/test-results.md`). C1 proper (the lead's wiring of
  WP1/WP2/WP4 into `TownGame3d.ts` and the open contract requests listed in §10) is still to do. Owner sign-offs for
  cross-owner edits are recorded in the commit message: world-art (`game/social/radial{,Logic}.ts`, `TownScene.ts`
  `npcSpot`, `packages/assets` v3 Classic pass), lobby-auth (`ui/lobby/**` by WP6), qa-deploy (`tests/e2e/**`,
  `tests/support/bot.ts`, `scripts/v3/**`, `scripts/perf/**`, `ops.example.env` by WP5b / WP6 / WP7a / perf recon).
- 2026-10-18 (C1a): the v3-avatars port range is 3462-3464 (3461 is held by an orphaned Vite server on the host;
  never use or kill it). The avatar smoke defaults to `SMOKE_PORT=3462`.
- 2026-10-18 (vendor refresh B, v3-world): `v3-dev` up to `bd4c9ff` (demo pass A, pass B, the seal-vote rounds)
  reviewed as text (§10: no eval / Function / workers / absolute URLs in the runtime tree; new dynamic imports only in
  demo-layer modules the game never imports: `passb.js` over a static list of local parts, `timer-ui.js`
  `import('./actionbar.js')`; style / link element creation only in `src/ui/hd/*` and `scenes/`, which the game does
  not import; none of the patched snippets of `build/pixel3dImports.ts` changed) and merged with `-X theirs`
  (`5fb072f`); `scripts/v3/import-assets.sh` added the HD portrait atlases (`v3/assets/ui/portraits-hd{,-night}.*`).
  Game-side expectation updated: `castMap.ts GHOST_BASELINE` (crow, fox, frog, owl, polly, toad: `clips` → `shared`).
- 2026-10-18 (WP5a, v3-world; no code change in world-art's `apps/server/src/world/**`): **the clock tower is
  enterable in the v3 world** (user request, §9.1 item 4): the 16th building of `townLayoutV3` (`clocktower`,
  `houseIndex: null`), its room in a 6th band column (`widthTiles` 112 → 125), anchored on the vendor room's exit spot,
  plus the height-cliff rule for its stair / landing (§2.2). It is nobody's home and follows the existing rules for
  rooms that are not your home (`apps/server/src/world/index.ts canEnter / canExit`: any player by day and at bedtime,
  locked for players at night, a player inside at nightfall is sent home to bed, the Storyteller always): **no server
  code change**. `townMapV3.landmarks` is empty; v2 keeps its non-enterable landmark tower (v2 layout hash unchanged).
  Classic in a v3 world draws it as before (`placement.ts towerAt`), with a door spot, a door spur and room furniture.
- 2026-10-18 (WP5a): NPC homes are exported outside the plaza ellipse × 1.1 and the square (user request "no NPCs in the
  voting circle"); the sweeper's home moved (16,12) → (16,10). The 3D roamer's `inSquare`-only guard misses the circle's
  north arc: CONTRACT-REQUEST to WP2 (§9.1 item 3).
- 2026-10-18 (vendor refresh B): §9.2's `clocktower api.setTimer` and `CAMERAS.vote` requests are withdrawn: the vendor
  delivered the tower dial hook (`api.dials` / `api.hands` / `api.body` + `towertimer.js drawDialFace`) and a computed
  vote frame (`votecam.js voteFrame`) instead, and the user moved the timer readout into the HUD (§9.1 items 1-2 say
  what the game wires). The `{lights: false}` part of WP2's character request is satisfied (`lightless(spec)`).
- 2026-10-18 (user): the host GPU MAY be used for v3 e2e / stills / perf (prod idle; Q10 answered: the separate render host is allowed too, ask before first use). `tests/e2e/playwright.config.ts` v3 project: `CT_GL=gpu` (default, ANGLE/Vulkan on the host GPU) or `CT_GL=swiftshader` (CPU raster); `helpers.ts waitV3Ready` asserts the matching renderer. User goal: **v3 playable on CPU only** (software GL, e.g. SwiftShader-class): the perf swarm adds a CPU tier and SwiftShader budgets (§7).
- 2026-10-18 (C1, integrator `v3-integrate`, acting as lead; owner sign-offs recorded here): **WP1, WP2 and WP4 are
  wired into `TownGame3d.ts`.** One `net/core.ts createCore3d` per mount (own avatar prediction, remotes, doors, taps /
  keys / pointer, the camera rig, the ONE `GameplayCore`, `__ctCamera`) survives every rebuild; `net/lifecycle.ts
  Lifecycle` owns build / rebuild / fallback (boot marks, PerfSampler + safe moments, first context loss = a new Engine
  behind "Rebuilding town…", the second = Classic, a build or frame-loop throw = Classic). Per Engine: stage → avatars
  (`createAvatarLayer({engine, tier, heightAt, floorAt, view: core.view, lights: stage})`; a build-only pump feeds the
  own avatar's first build, `selfReady(5000)`) → `stage.warmUp` → `core.attachScene` (pick proxies = the drawn cottages +
  layout boxes for the rest, e.g. the tower) → `createOverlayLayer` (`overlay.socialSink` → `core.pointer.setSocial`,
  `passTap` = `pointer.tapAt`, `faceToward` = `local.faceToward`) → layers `[stage, avatars, overlay]`. The WP0 stub's own
  `wanderer`, its camera and its net code are gone. `core.on('placed')` (not 'correction') and remote Storyteller poofs
  ('in') → `avatars.fadeIn`; `voicePresence` → `avatars.setTalking(pid, on, rim)` (rose `#ff8f8a` for yourself on air,
  pale gold `#ffe7a3` for others: v2 fx/talking colours; `readTalkOutlineMode` has no "off", so the rim is always on,
  and 'behind' / 'top' have no 3D meaning: the rim is on the figure). New debug members `setCamera` (harness stills,
  WP7a's request) and `camera3d`. Teardown order: core detach + social sink off, overlay, avatars, stage, context-loss
  listener, Engine.
- 2026-10-18 (C1): the four user requests of vendor pass B are wired on the game side (§9.1 items 1-4): the
  voting-circle frame (a pure port of the vendor's votecam fit in `world/voteFrame.ts`, NOT an import: `votecam.js`
  drags in the demo HUD / events / fonts chain; §9.2 request; game HUD keep-outs), the tower dials as the Storyteller
  timer (`towerClock.ts dialFace` + `vendor/town.ts createTowerFace`; readout = the HUD clock chip, as the user decided
  on the pixel3d side; the vendor's split-flap board stays off), the 3D NPC guard (plaza × 1.1), the enterable clock
  tower's room (`vendor/interiors.ts buildTowerInterior` in the cottage cache). Q2 "fixed yaw" now has one exception the
  user asked for: the vote frame's yaw (0 / ±45°); keys stay screen-relative under it.
- 2026-10-18 (C1): the vote camera applies while `voteCameraWanted(game)` (phase day AND nominations open or a nomination
  pending / voting) and the viewer is on the square (the WP1 plaza rule); transitions are 4 whole key poses over 0.75 s.
- 2026-10-18 (C1): a room that is still being built holds the camera on the old place (the stage keeps the town drawn
  until the room exists), instead of flying to the empty room origin for those frames.
- 2026-10-18 (C1): `GameScreen.importTown3d` retries a failed chunk under a fresh same-origin URL (§9.3); GameScreen
  publishes `currentRender` (`publishRender({kind, tier, fallback})`, null on unmount; WP6 request 1); `LobbyRoute`
  mounts `useV3Skin(conn)` once in `InLobby` and shows `<JoiningLobby id/>` on the connecting and layout-loading
  screens (WP6 requests 2-3). `rules/doors.ts houseInUse` returns true for `houseIndex: null` (VendorB request; v2 has
  no such building). Sign-offs: world-art (`GameScreen.tsx`, `game/rules/doors.ts`), lead (`LobbyRoute.tsx`, `coords.ts`,
  `TownGame3d.ts`, this file), WP1 v3-core (`net/core.ts`, `input/camera.ts`, `input/pick.ts`), WP2 v3-avatars
  (`avatars/layer.ts` `floorAt`, `avatars/npcs.ts`), WP3 v3-stage (`world/{stage,interiors,doors,towerClock,voteFrame}.ts`,
  `vendor/{town,interiors}.ts`), WP7 v3-qa (new unit tests `voteCam.test.ts` + additions to `coords.test.ts` /
  `world.towerClock.test.ts`); all edits by the integrator under the C1 role.
- 2026-10-18 (user, supersedes the per-lobby Town choice and settles C3/Q7): **the world comes from the URL path.** `/` (the default link) = v3: every lobby created there is `world: 'v3'` (Hollowmere; the per-player Graphics setting still picks 3D or Classic-in-v3, phones Classic under Auto). `/v2/` = v2 exactly as today (Classic town, Phaser). Same server, accounts and admin; each path's lobby list shows only its world; a join link for the other world redirects to the right path (old v2 share links keep working); the create form loses the Town choice (`CreateLobbyRequest.world` stays, set from the path). `/v3-art-demo/` keeps its route.

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
- 2026-10-18 (C1 continuation, integrator `v3-integrate`, acting as lead): **the v3 e2e set is green on the host GPU**
  (`CT_GL=gpu`, `E2E_PORT=3450`, one spec file at a time): `v3-doors`, `v3-social` (pin, point AND bubble), `v3-boot`,
  `v3-vote`, `v3-mixed`, `v3-life`, `v3-fallback` 4/4 (chunk fails, context-loss rebuild then Classic, boot mark, perf
  sampler: the two "PENDING C1" cases run now). The earlier `v3-doors` / `v3-social` failures did not reproduce on the
  GPU with the WIP tree (no code change needed for them). Two fixes: (1) **context-loss race** (`TownGame3d.ts`):
  `loseContext()` / a driver reset takes effect at once but `webglcontextlost` is a later task; a frame in between
  that compiles a program threw in three's shader check (`getProgramInfoLog()` = null → `.trim()`), which the frame
  loop reported as a crash, so the FIRST loss went to Classic (flaky: 1 of 2 runs). Now a throw (frame loop or build)
  while `gl.isContextLost()` is that Engine's context loss, and each Engine reports at most ONE loss (event or throw),
  so the event that follows is not counted as the second. (2) **chunk retry dropped** (`GameScreen.tsx`, world-art
  file under the C1 sign-off; §9.3, §1.2): `retryUrl` removed. Spec change for v3-qa: `v3-fallback` "chunk fails"
  now asserts one request + Classic in place (was ">= 2 requests"). **`v3-lobby-choice` 3/3 fail by design**: the
  WP8 WIP (user decision "the world comes from the URL path") removed the create form's Town radiogroup and shows the
  v3 loading scene (`V3LoadingStep`) instead of `.ct-join-preview` on `/`; the spec is superseded by `v3-paths`
  (delete it with WP8, as the handoff says). Not run here: `v3-paths` (WP8), full `pnpm test`, `pnpm build` (the gate).
- 2026-10-18 (C1 review fix round, `v3-integrate`): 7 review findings. **Fixed:** (medium) the room-build camera hold
  (`input/camera.ts`) waited forever when a room failed to build (the tower room's guard throws on purpose): the hold
  now needs `RigScene.interiorPending(loc)` = `stage.interiorPending` = the wanted room is still in
  `world/interiors.ts`'s build map (`InteriorManager.pending()`); a settled failure falls through to `cameraGoal`'s
  `interiorShot` and `shown` switches to the room (taps pick inside). (medium) `apps/server/test/paths.v2.test.ts`
  bound the fixed port 3452 (inside the v3 e2e range 3450-3453) during `pnpm test`: it now takes an OS-assigned
  loopback port (`listen(0)`). (low) `voice/reconciler.ts`: after a listing failure no worker takes another room and
  the run rethrows only after the in-flight workers finish, so `res` never changes after it is returned.
  **Deferred (low):** (1) `Lifecycle.requestTier` is not wired: a Settings → Graphics quality change does not rebuild a
  mounted v3 town until the next mount (needs a notify in the lead-owned `SettingsDialog.tsx` for `fxQuality`, like
  `notifyGraphicsChange`, and a subscriber in `TownGame3d.ts` calling `lifecycle.requestTier`). (2) The voice
  revocation audit back-off (15 → 30 → 60 s, rooms skipped when LiveKit count <= grant count) weakens the private-voice
  backstop from about 15 s to about 60 s; active eviction on revocation is unchanged: **needs the owner's explicit
  sign-off** (or revert to a fixed 15 s for private / night rooms). (3) WS permessage-deflate: add a line to
  docs/security.md about the theoretical compression-length oracle (projection + attacker text in one context;
  `WS_DEFLATE=off` is the kill switch), and check `concurrencyLimit: 4` (ws's process-wide zlib limiter) and about
  300 KiB zlib state per socket with the multi-lobby `v3-server-load` run. (4) Per-frame string keys
  (`dialFaceKey`, `voteFrameKey` + `heights.map().join()`): pack into numeric keys in a perf pass.
- 2026-10-18 (**C1 gate**, `v3-integrate`, acting as lead + qa-deploy): **C1 passed and is committed** ("v3 C1: ..." on
  `v3-game`). On the host, under `flock -s v3-heavy.lock`: `pnpm -r run typecheck` 7/7 clean; `pnpm build` exit 0
  (`town3d` chunk 1176 kB / 380 kB gzip); full `pnpm test` exit 0 = 167 files / 1944 tests pass, 1 file / 5 tests
  skipped (132.7 s); `scripts/perf/bundle-report.mjs --json` + `scripts/perf/budgets.mjs --bundle`: entry JS 43.8/45,
  entry CSS 12.3/15, LobbyRoute 68.4/72, TownGame 281.2/300 KiB br, town atlases 578.5/700 KiB, all measured ok (runtime
  keys SKIP: no perf inputs in this gate). The v3 e2e results are the continuation's (§11 "C1 continuation"); the gate
  did not re-run e2e. Open for C2 / WP8: `v3-lobby-choice` superseded by `v3-paths` (delete with WP8), the four deferred
  review findings above (requestTier, voice audit back-off sign-off, WS deflate note + multi-lobby load check, numeric
  per-frame keys), the camera fix's e2e coverage (`v3-doors` into the tower room).
- 2026-10-18 (**WP8 done**, `v3-wp8`, acting as lead): `/` = v3, `/v2/` = v2 finished (the `LobbyRoute` path move,
  the GameScreen loading scene), the voting-circle candle stakes removed for good (`removeDaisCandles`, index-only,
  the vendor's vote framing unchanged), the laptop-first phone note, `v3-lobby-choice` + `createLobbyViaUI` deleted,
  `.claude/worktrees/` excluded from `remote.sh` syncs (an orchestrator checkout's agent worktrees otherwise fail
  REPO-03 in the sandbox). Gate: docs/test-results.md "v3 WP8 gate". Known after WP8 (deferred): the block pennant went
  with the stakes (the nominee / execution pulse on the stone, the short hand and the overlay still mark the block);
  the Classic UI-driven specs that create lobbies from `/` (e.g. `lobby.spec`, `v23-settings`) now create v3 lobbies
  unless routed through `tests/e2e/appPath.ts appUrl` / `CT_E2E_BASE_PATH=/v2` (not run in this gate; doors +
  chat-bubbles use bot lobbies = v2 and pass). Next: merge the perf branches, then the v3.0 dev deploy.
- 2026-10-18 (**v3.0 release**, `v3-release`, acting as lead + qa-deploy): the merged tree `116024f` (WP8 + perf stage /
  ui / learn / server / cpu + the cherry-picked client commit) passed the release gate with no fixes: typecheck 7/7 +
  tests tsconfig, build, budgets all ok (TownGame 281.1/300 KiB br; `town3d` 336 kB gzip, was 381), full `pnpm test`
  172 files / 1978 tests pass, every v3 e2e on the host GPU on the first run (`v3-paths` 4, `v3-boot`, `v3-vote`,
  `v3-doors`, `v3-social`, `v3-mixed`, `v3-life`, `v3-fallback` 4) + Classic `doors` / `chat-bubbles`
  (docs/test-results.md "v3.0 release gate"). Committed as "v3.0: release gate + docs", tagged `v3.0`, deployed to the
  DEV service only (prod stays v2.4 until the user says so). Release note: docs/RELEASE-v3.md. Next = v3.1: the remaining
  perf branches (cpu / client / server), C2 QA, the learnings plan (docs/perf-v3/learnings.md).
