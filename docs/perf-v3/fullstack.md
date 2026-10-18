# v3 perf: full-stack profile and the v3.2 plan (front "fullstack")

Agent `v3-profile`, 2026-10-18. Read-only profiling of the **v3.0 release** (tag `v3.0` = `4be9bb4`; prod runs the same
client build, the chunk hashes match). Laptop first: where the time goes from "open the site" to "walking in the town",
what a steady 15-player frame costs, what goes over the wire, what the server pays, and what an idle town still costs.
Nothing under `apps/`, `packages/`, `tests/`, `scripts/` was changed. Earlier fronts are not repeated here, only cited:
recon-load.md (load path, SwiftShader), recon-frame.md / stage.md (frame per tier), recon-chars.md (characters),
net.md / server.md (wire, server), ui.md (DOM), cpu.md (software GL), learnings.md (literature, 60 fps cap).

## 1. Method

| What | How |
|---|---|
| Tree | `git archive v3.0` in a scratch dir, built in a host sandbox (`CT_AGENT=v3-profile`, `pnpm build`, shared heavy lock). A second client build with `vite build --minify false` (`dist-nomin`) for readable CPU profiles only; all timings are from the minified build. |
| Server + bots | A throwaway driver (scratch only, not in the repo) on the host: `startServer({mode:'dist', port:3485})` from `tests/support/server.ts`, fake LiveKit (voice is not connected), 1 Storyteller bot + 14 player bots (`tests/support/bot.ts`) in a `world:'v3'` lobby; bots wander at 10 Hz. Commands over stdin: lobby idle / lobby walk / start (random setup, first night, day) / still / vote (8 hands) / night. Each session held the heavy lock **exclusive** for < 5 min. |
| Browser | Chromium 1243 on the editing machine (desktop discrete GPU, ANGLE/Vulkan, new headless), reached through an SSH tunnel to 127.0.0.1:3485. Viewport 1440×900, **DPR 2**, tier picked by the app (it picked `high`, pixelScale 3, low-res RT 640×360). The browser joins as the 15th player. |
| Probes | An init script: milestones (canvas, `__ctCamera.v3().ready`), long tasks, WebGL wrappers (programs linked, ms blocked in compile/link/uniform queries, draw calls, frames drawn into the default framebuffer, GPU bytes from `bufferData` / `texStorage2D` / `texImage2D` / renderbuffers). CDP: `Performance.getMetrics` (main-thread task / script / style / layout ms), `Profiler` (V8 CPU profile, 250-500 µs), WebSocket frames (bytes, rates, sizes), `Emulation.setCPUThrottlingRate`, `Network.emulateNetworkConditions`. Server CPU = utime+stime of the server process from `/proc` per window. |
| Profiles | (a) unthrottled, 60 Hz; (b) **CPU ×4** ("weak laptop"); (a/b) **uncapped** (`ct.debug.fps=-1`, `--disable-gpu-vsync --disable-frame-rate-limit`): rendered fps = real per-frame cost at full clock; (c) cold vs warm HTTP cache; (d) prod edge: `curl` of all 139 `/assets` URLs reachable from the entry, twice (headers, `cf-cache-status`, br bytes, TTFB), and guest loads of the prod landing page at no throttle / Fast 4G (9 Mbit/s, 60 ms) / Slow 4G (1.6 Mbit/s, 150 ms). Nothing in the game was loaded from prod; no account was created there. |

Caveats (read before using a number):

- **60 Hz main-thread ms/s on this desktop is inflated by CPU clock-down** (≈ 490 ms/s capped vs 2.2 ms × 60 = 130 ms/s
  of real work uncapped; learnings.md §3 saw the same). Use the **uncapped per-frame ms** for cost, and the ×4 uncapped
  numbers as the weak-laptop estimate. Shares inside a profile are still valid.
- **GPU frame time was not obtainable cleanly.** `EXT_disjoint_timer_query_webgl2` is exposed with the privileged flags,
  but a query around each rAF measured the CPU issue interval on a down-clocked GPU (6-9 ms capped, = frame period
  uncapped). Not reported as GPU time. Real-device `ct.debug.v3perf` numbers are still needed for integrated GPUs.
- The probe's 20 ms poll of `__ctCamera.v3()` sorted the 600-frame window on every call (`FrameStats.quantile`): ≈ 17 ms/s
  in the profiled run (S2). It is a measurement artifact (the game never calls it per frame); fixed in the probe for
  later runs, subtracted below.
- Local server = uncompressed bytes (no edge), LAN RTT < 1 ms. Network-bound timings use the prod edge numbers in §4.
- Voice was not connected (fake LiveKit), so LiveKit decode cost is not in these frames (see §8 talkerCap).

## 2. Time to first v3 frame

"Ready" = `__ctCamera.v3().ready` = loading overlay gone = first real frame. The town boots at **lobby join** (the
waiting room is the town behind a sheet), so this is paid once per join, not at game start.

| ms from navigation, 1440×900 DPR 2 | desktop cold | desktop warm | **CPU ×4 cold** | CPU ×4 warm |
|---|---|---|---|---|
| entry JS + CSS done | 46 | 29 | — | — |
| LobbyRoute done | 77 | 42 | — | — |
| `TownGame` (Phaser Classic, 1.28 MB) fetched in a v3 join | 92 → 125 | cached | yes | yes |
| `town3d` request → done (waits for `lobby:view`) | 194 → 222 | 157 → 158 | — | — |
| canvas (Engine created) | 232 | 179 | 588 | 402 |
| piece chunks first → last (34 files, parallel) | 287 → 320 | 220 → 236 | — | — |
| **ready** | **2 837** | **2 645** | **9 092** | **8 729** |
| long tasks before ready (sum) | 2 058 | 1 963 | 7 714 | 7 485 |
| largest long tasks | 721, 664, 360 | 708, 651, 233 | **2 721, 2 391**, 714, 607 | 2 728, 2 395, 729 |
| programs linked / ms blocked in GL compile+link+uniform queries | 42 / 286 | 42 / 154 | 42 / 337 | 42 / 89 |
| JS heap at ready (used) | 378 MiB | 379 MiB | 346 MiB | 345 MiB |
| requests / bytes (uncompressed) | 119 / 4.64 MB | 116 / 2 KB | | |

Cold and warm differ by only 0.2-0.4 s: **the join is CPU-bound, not network-bound, on a fast link.** On a weak laptop it is
≈ 9 s, of which two single long tasks of 2.4 and 2.7 s freeze the loading screen.

Where the CPU goes (V8 profile, unminified build, desktop cold, goto → ready + 3 s, inclusive ms):

| Phase | ms (desktop) | ≈ ms at ×4 | What |
|---|---|---|---|
| Piece builds (`buildPiece`, procedural geometry in JS) | **1 877** | ≈ 5 000 | `foliage` **691** (of which tree templates `makeTemplate` / `createTree` 548: `fbm3` / `noise3` / `radius` per vertex), `ground` **619** (`poissonDisk2D` 246, `createGrass` 263), `house-4` 180, `house-11` 75, `house-1` 68, all other houses 6-24 each, props 30, dais 11, clocktower 9 |
| Warm-up renders (`renderNow`: 2 frames, 3 dais states, whole town, one room) | ≈ 1 300 incl. post-ready interior | ≈ 2 700 | `setProgram` 682 inclusive, of which `getUniforms` (first use = waiting for the link) 342 |
| Avatar rigs (`createCharacter` + `buildCharacter`) | 238 for the rigs built in the window (≈ 16 ms per rig) | 50-100 ms per rig | after ready, one per frame: 8-9 long tasks of 51-101 ms in the first 1.2 s at ×4 |
| `TownGame` (Phaser) evaluation | 55 | ≈ 200 | pure waste in a v3 join |
| LobbyRoute + entry evaluation | 70 | ≈ 280 | |
| GC | 76 | | heap peaks at ≈ 380 MiB during the build, 190-230 MiB after |

Network share (prod edge, §4): the critical-path bytes for a v3 join are entry 52 KB + LobbyRoute 81 KB + `town3d` 337 KB
+ pieces ≈ 287 KB + the 15 cast specs ≈ 80 KB (br as served) ≈ **0.84 MB**, plus **360 KB of Phaser that competes for the link**.
Measured from the edge: `town3d` + LobbyRoute take 0.08 s unthrottled, **0.46 s on Fast 4G, 2.46 s on Slow 4G**.
So a weak laptop on Fast 4G is ≈ 9.5-10 s to the first frame, and Slow 4G adds 3-5 s (recon-load measured the serial
version of that path at 42 s on SwiftShader).

## 3. Steady frame, 15 players

Capped (what users get; rendered fps 60.6-60.7 in every window, frame p95 16.7-16.8 ms, no dropped frames on the desktop):

| window | draws / frame | tris / frame | programs | main thread ms/s (capped, clock-down inflated) | style recalc ms/s | JS heap used | GPU bytes est. (buffers / textures / renderbuffers) |
|---|---|---|---|---|---|---|---|
| lobby, nobody moving | 311 | 1.18 M | 57 | 487 | 0 | 196 MiB | 101 / 72 / 66 MB |
| lobby, 14 walking | 319 | 1.04 M | 57 | 489 | 4.9 | 189 MiB | 101 / 72 / 66 |
| day square, 14 walking | 354 | 1.19 M | 57 | 489 | 4.2 | 275 MiB | 104 / 72 / 66 |
| day square, still | 348 | 1.19 M | 57 | 489 | 0 | 259 MiB | 104 / 72 / 66 |
| vote (clock, 8 hands) | **466** | **1.59 M** | 57 | 502 | 3.2 | 277 MiB | 105 / 72 / 66 |
| night, inside own house | 46 | 66 k | 46 | 175 | 0.2 | 273 MiB | 78 / 72 / 66 |

Real per-frame cost (uncapped, rendered fps → ms per frame; CPU-bound in every window):

| window | desktop fps / ms | **CPU ×4 fps / ms** | share of a 16.7 ms frame at ×4 |
|---|---|---|---|
| lobby, nobody moving | 541 / 1.8 | 115 / **8.6** | 52 % |
| lobby walk | 486 / 2.1 | 100 / 10.0 | 60 % |
| day walk | 458 / 2.2 | 96 / **10.5** | 63 % |
| day still | 494 / 2.0 | 108 / 9.3 | 56 % |
| vote | 409 / 2.4 | 87 / **11.5** | 69 % |
| night inside | 3 022 / 0.33 | 697 / 1.4 | 9 % |

Main-thread split, day walk (V8 profile, ms per second at 60 fps; the ratio is what matters):

| Bucket | ms/s | share of the frame loop | Notes |
|---|---|---|---|
| frame loop total (`step`) | 438 | 100 % | |
| `renderAt` (vendor `PixelPipeline` + three) | 355 | **81 %** | |
| · draw issue (`renderObjects` → `renderBufferDirect`) | 164 | 37 % | ≈ 350 draws |
| · `setProgram` (uniform `upload` 72, point-light array `flatten` 26) | 116 | 26 % | the 12-light pool at intensity 0 by day (stage.md §4.2) |
| · shadow map pass | 58 | 13 % | 4096² at high |
| · culling (`projectObject`, 4 scene renders) | 49 | 11 % | |
| · water reflection pre-render hook | 44 | 10 % | a full scene render at 30 Hz |
| `updateMatrixWorld` (all callers; `multiplyMatrices` + `compose` self 45) | 79 | 18 % | partly inside `renderAt` |
| avatar layer `update` (15 rigs: `Character.update` 69 → `_step` 48, `_gridFrame` 34, `_showPose` 26, `_placeRoot` 20) | 77 | **17 %** | skinning itself is on the GPU (bone texture); this is pose + bone matrices |
| native GL binding time (`(program)`, `bindVertexArray`, `uniform*`) | 60 | | |
| DOM: style recalc (55/s, overlay label transforms) + layout | 4-5 | 1 % | 0 when nobody moves; v31-fixes is cutting overlay churn |
| net: Colyseus decode + patch apply (`index`, `movement` chunks) | ≈ 4 | 1 % | |
| GC | ≈ 1 | | |

Same picture in every window: the lobby with nobody moving costs **82-90 %** of the walking frame (8.6 vs 10.5 ms at ×4),
the vote adds 110 draws and 0.4 M triangles (+1 ms at ×4), and the inside of a house is 46 draws. **Render issue is ≈ 80 %
of the frame on every laptop CPU; characters are ≈ 17 %; DOM, net and GC together are < 3 %.**

## 4. Network

Per client (the browser as the 15th player; deflate off, the v3.0 default):

| window | down B/s | down msg/s | msg size p50 / p95 / max | up |
|---|---|---|---|---|
| lobby / day, 14 walking | 1 270-1 370 | 10.2-10.8 | 120-132 / 174 / 174 B | 0 while standing; ≈ 12.5 msg/s when walking (server.md) |
| nobody moving | 195 | 2.0 | 174 B | |
| vote | 2 790-3 030 | 3.1 | 174 / **2 580** / 2 586 B | |
| night inside | 57 | 2.0 | 36 B | |

The wire is small: ≈ 1.3 KB/s while walking, 3 KB/s in a vote (the 2.6 KB `game:view` per vote change). Not a lever.

Prod edge (all 139 `/assets` URLs reachable from the entry):

| Finding | Number |
|---|---|
| `Cache-Control` | every `/assets/*` = `public, max-age=31536000, immutable`; `/` = `no-cache` (`DYNAMIC`, TTFB 150-170 ms) |
| Is Cloudflare caching `/assets`? | **Yes** for JS/CSS/images: first pass 128 MISS / 5 HIT, second pass 133 HIT. TTFB from here: HIT ≈ 106 ms, MISS ≈ 134 ms average. Each edge location fills separately on the first visitor's MISS (back to the origin through the tunnel). |
| Not cached | **6 JSON atlas manifests** (`town`, `town-v3`, `events`, `events-night`, `objects-v3`, `square-props-v3`) are `DYNAMIC` on both passes: `.json` is not in Cloudflare's default cached extensions. Small (40 KB br total) but each is an origin round trip. |
| Compression on the wire | The origin sends identity; the edge compresses at ≈ **brotli level 4** (byte-identical to a local q4: entry 51 942 vs 51 963). Build-time q11 is **17-20 % smaller**: `town3d` 336.6 → 278.5 KB, `TownGame` 360.2 → 287.9, LobbyRoute 81.3 → 70.0, entry 51.9 → 45.0. All JS reachable: 1.61 MB as served. |
| Images | PNG and WebP twins are both in the build; a v3 join fetches the WebP ones (ui.md). Not compressed further by the edge (correct). |
| Landing page (guest) | 1.47 MB for the landing (art ≈ 0.8 MB, 4 font files 167 KB); LCP 0.56 s unthrottled, 0.86 s Fast 4G, 3.2 s Slow 4G. |

## 5. Server

One v3 lobby, 1 ST bot + 14 player bots + the browser, profiler off, whole server process (bots run in another process):

| window | server CPU (% of one core) |
|---|---|
| lobby, nobody moving | 1.0-1.3 % |
| lobby / day, 14 walking at 10 Hz | **2.0-2.3 %** |
| vote | 1.4-1.8 % |
| night | 1.0-1.7 % |

This matches server.md (2.8-3.1 % at 15 Hz moves; snapshot fan-out p50 90 µs, ping p50 0.47 ms on loopback). A lobby
costs ≈ 2 % of a core: the server is not on the critical path of any user-visible number. No new server lever.

## 6. Power / thermals: frames rendered while nothing moves

| situation | rendered fps | draws / frame | per-frame CPU at ×4 |
|---|---|---|---|
| waiting room, nobody moving | **60** | 311 | 8.6 ms (52 % of the main thread) |
| day, everybody still | **60** | 348 | 9.3 ms |
| night, alone inside a house | **60** | 46 | 1.4 ms |

v3.0 always renders 60 fps (the cap from learnings.md §3.1 only stops 120-165 Hz panels from doing more). Things that
animate continuously: the toon clouds and grass wind (`uTime`), water (reflection at 30 Hz), fireflies, idle character
breathing. Rendering at 30 fps when no player, camera or HUD-driven state changed would halve the GPU and main-thread
work in the waiting room, during still discussion and at night, with only the ambient motion stepping at 30 Hz.

## 7. Candidate levers, evaluated

Gain numbers use the measurements above; "×4" = the weak-laptop profile. Conflicts are with the v3.1 branches in flight:
v31-fixes (avatars isReady, remount memory, overlay/DOM churn: `game3d/avatars/**`, `game3d/overlay/**`, HUD countdowns),
v31-stage (static-mesh merge: `game3d/world/{stage,merge}.ts`, `game3d/vendor/town.ts`), v31-cpu (cpu-tier cheap materials:
`game3d/vendor/cpuTier.ts`).

| Lever | Expected gain | Risk | Files / owner | Vendor session? | v3.1 conflict |
|---|---|---|---|---|---|
| **Cache or bake the procedural town geometry** (IndexedDB keyed by vendor hash + tier + time-of-day bucket + build camera, or baked by the exporter) | −1.3…−1.9 s desktop, **−4…−5 s at ×4** on every join after the first (foliage 691 + ground 619 + houses ≈ 300 ms desktop); removes both 2.4-2.7 s long tasks | high: materials, updaters, water passes and the registry must be re-attached; foliage depends on the build camera, ground on the time of day | `game3d/vendor/town.ts` + a new cache module; exporter `scripts/v3/export-hollowmere.mjs` (v3-world) | no for an IndexedDB attribute cache done game-side; **yes** for the cleaner fix (pure `buildGeometry()` / cached tree templates in the vendor) | **v31-stage** owns `vendor/town.ts` / `stage.ts` now: do after it lands |
| Cheaper tree templates (CONTRACT-REQUEST): `makeTemplate` / `createTree` evaluate `fbm3` noise per vertex for each tree kind on every boot | −0.5 s desktop, −2 s at ×4 (548 ms of foliage) | low inside the vendor (pure function, memoize / precompute a table / ship templates as data) | `v3/pixel3d/src/town/pieces/foliage.js`, `trees.js` | **yes** | none |
| Geometry generation in a Web Worker | keeps the loading screen alive (no 2.7 s freeze); total CPU unchanged | medium-high: pieces need an engine stub; only pure template/noise code moves easily | vendor pieces or a game-side worker running vendor template code | partly | v31-stage |
| **Idle / on-demand rendering** (30 fps, or 20, when nothing changed; full 60 on input, movement in view, camera moves, vote clock) | −50 % frames in the waiting room, still talk and at night: ≈ −4.3 ms per 33 ms at ×4 in the lobby; battery and fan noise on every laptop | low-medium (the frame gate already exists; a stale HUD-driven 3D state must wake it) | `game3d/perf.ts` (`createFrameGate`/`runFrameLoop` with a runtime fps), `TownGame3d.ts` (wake signals), `vendor/engineHost.ts` | no | none (v31-fixes touches avatars/overlay, not the loop) |
| **Do not download Phaser in a v3 join** + **prefetch `town3d` + LobbyRoute from the home page** | −360 KB br and −55 ms (×4: −200 ms) eval per join; the 337 KB `town3d` (0.46 s on Fast 4G, 2.5 s on Slow 4G) moves off the join path into the landing dwell time; also start `town3d` with the ticket instead of after `lobby:view` | low | `ui/lobby/LobbyRoute.tsx` (`warmTown`), `main.tsx` / landing (lead) | no | none |
| **Precompressed brotli q11 at the origin** (+ verify the edge passes it through) | −17-20 % of all JS bytes: −58 KB `town3d`, −72 KB `TownGame`, ≈ −300 KB of 1.61 MB; ≈ −0.25 s of the cold join on Fast 4G, ≈ −1 s on Slow 4G | low (a build step writing `.br` + static serving with `Content-Encoding: br` and `Vary`); must confirm with one header check after deploy that the edge forwards origin br instead of recompressing | `apps/server` static serving (lead), client build (lead) | no | none |
| Cloudflare cache rule for `/assets/*` (cache everything, incl. `.json`) + Tiered Cache | 6 manifests stop going to the origin; first visitor per edge location stops filling from the tunnel | low | owner dashboard action | no | none |
| **Warm-up**: `compileAsync` for the town, drop or shrink the 3 dais showcase frames, warm the room after ready | −0.4…−0.8 s desktop (renderNow ≈ 1.3 s, link waits 342 ms), more on Windows/D3D and macOS where links are slower; ready earlier | medium (program keys must match the pipeline targets: learnings.md §3.3 saw no `readyMs` gain on Linux) | `game3d/world/stage.ts`, `vendor/town.ts` `warmViews` | no | **v31-stage** (`stage.ts`) |
| Start the engine + warm-up + town build in the waiting room before the game starts | already true: the town boots at lobby join (`InLobbyTown`) | — | — | — | — |
| **Animation LOD** (far / off-screen rigs update at 15-30 Hz, skip bone updates off-screen, honor the frustum) | avatar layer 77 of 438 ms/s → ≈ −40 ms/s; ≈ −0.8 ms per frame at ×4 with 15 players; more with ghosts at the edge of view | medium (pose pops, ghost slide; vendor `frustumCulled = false` on rigs) | `game3d/avatars/layer.ts` | no (a CONTRACT-REQUEST for a bounding sphere would help) | **v31-fixes** owns `avatars/**` now |
| **Progressive avatar building** (billboard stand-in first, rig swapped in; budgeted builds) | removes 8-9 frames of 50-100 ms at ×4 right after ready (≈ 0.6 s of hitches), and the first view shows everyone at once | medium | `game3d/avatars/{layer,queue}.ts` | no | **v31-fixes** |
| Point lights off by day / light-array upload | `setProgram` 116 ms/s, `flatten` 26 → ≈ −15-20 % of `renderAt` | medium (both light-count programs warmed) | stage / vendor (stage.md §4.2) | partly | v31-stage |
| Single-pass colour + normal (MRT), merged post passes, RGBA8 targets, compiled-out toon variant | ≈ −100 draws/frame (−30 % issue), GPU bandwidth on iGPUs (all RTs are RGBA16F) | high | `v3/pixel3d/src/core/PixelPipeline.js` + `uPassMode` shaders | **yes** (learnings.md §4 items 1, 4, 6) | none |
| Instanced grass / foliage | build CPU (`createGrass` 263 ms) and draws | medium | vendor `world/grass.js`, `foliage.js` | **yes** | none |
| Static-mesh merge | ≈ −100 draws (stage.md §4.1) | high | — | — | **is v31-stage** |
| Labels in the overlay canvas instead of DOM transforms | ≤ 5 ms/s of style recalc while walking (≈ 1 % of the frame) | medium (z-order vs bubbles, text outline) | `game3d/overlay/**` | no | v31-fixes (overlay churn) — **not worth it** |
| Dynamic resolution by frame time | unknown on iGPUs (no GPU timing here); on CPU-bound laptops it gains nothing, the cost is draw issue, not fill. DPR 2 already costs nothing (canvas at CSS px, 640×360 RT) | medium (look) | `vendor/engineHost.ts` | no | — **defer until a real iGPU trace** |
| three.js tree-shaking of the vendor `import * as THREE` | ≤ 5-15 KB br: `town3d` still carries the full ShaderLib (physical: clearcoat / iridescence / sheen strings) and WebXRManager, i.e. `WebGLRenderer`'s fixed closure (recon-load §three) | medium (custom three build) | build | no | — **not worth it** |
| Voice decode cap (talkerCap) | not measurable with a fake LiveKit; design in net.md, needs the human LiveKit test | | `apps/client/src/voice/**` | no | none |
| Landing page weight (1.47 MB) | LCP 3.2 s on Slow 4G; the landing art could load after the first paint | low | landing (lead) | no | none |

## 8. Ranked v3.2 plan

Order = user-visible win on a laptop (time to play, then steady fps on an integrated GPU, then battery) × confidence ÷ risk.

1. **Town build cost** (time to play). First the vendor CONTRACT-REQUEST for cheap tree templates and a pure,
   cacheable `buildGeometry` path; then a game-side IndexedDB cache of the generated attributes keyed by the vendor hash
   (+ tier, time-of-day bucket, build camera). Target: join ≤ 4 s at ×4 on a repeat visit (9.1 s today), no main-thread
   task > 500 ms on the loading screen. Owner: v3-stage (`vendor/town.ts`) + the pixel3d session. Risk high. **After
   v31-stage merges** (same files).
2. **Idle rendering at 30 fps** (battery, heat; also headroom for HUD and voice). Waiting room, still discussion, night
   inside: −50 % frames. Owner: v3-core (`perf.ts`, `TownGame3d.ts`). Risk low-medium. No v3.1 conflict: can start now.
3. **No Phaser in a v3 join + prefetch `town3d` from the home page + start it with the ticket.** −360 KB br, −0.2 s CPU at ×4,
   −0.5 s (Fast 4G) to −2.5 s (Slow 4G) of download moved off the join. Owner: lead (`LobbyRoute.tsx`, landing). Risk low.
   No conflict: can start now.
4. **Render issue on laptop CPUs** (steady fps): the frame is 80 % three draw issue. In order of risk: point lights off by
   day (−15-20 % of `renderAt`), then the vendor asks (MRT colour + normal, merged water / grade passes, RGBA8 targets).
   The static merge is already v31-stage. Owner: v3-stage + pixel3d session. Measure each on the vote frame (466 draws,
   11.5 ms at ×4: the worst steady window).
5. **Brotli q11 at the origin + a cache rule for `/assets` (incl. `.json`) + Tiered Cache.** −17-20 % JS bytes on every
   cold visit. Owner: lead (build + static serving) and the owner (dashboard). Risk low. No conflict.
6. **Avatars: progressive builds + animation LOD.** −0.6 s of post-ready hitches at ×4, −0.8 ms per frame with 15 rigs.
   Owner: v3-avatars. Risk medium. **After v31-fixes merges** (same files).
7. **Warm-up via `compileAsync` and fewer showcase frames.** −0.4…−0.8 s of ready on this machine, likely more on
   Windows / macOS. Owner: v3-stage. Risk medium. After v31-stage.
8. **Memory.** The JS heap peaks at ≈ 380 MiB during the build and stays 190-320 MiB; GPU ≈ 240-270 MB estimated (buffers
   75-112, textures 72-88, renderbuffers 66). Free build-time garbage, and RGBA8 targets (vendor ask, item 4). Matters for
   8 GB laptops with a browser full of tabs. Owner: v3-stage / pixel3d session. Risk low-medium.

Not planned: labels in canvas, three tree-shaking, dynamic resolution (until a real iGPU trace shows fill-bound frames),
server work (≈ 2 % of a core per lobby), wire size (≈ 1.3 KB/s per client).

Before starting item 4 or a dynamic-resolution decision, get one real integrated-GPU laptop trace with
`ct.debug.v3perf=1` at 1440×900 DPR 2 (frame ms in the lobby, the day square and the vote): this profile could not measure
GPU time.

## 9. Commands run

All builds and servers on the host via `scripts/remote.sh` from a `git archive v3.0` copy (with `ops.local.env`),
`CT_AGENT=v3-profile`, port 3485 only. Driver scripts lived in the scratch dir (not committed).

| Command | Result |
|---|---|
| `scripts/remote.sh sh -c 'flock -s $HOME/clocktower/v3-heavy.lock pnpm build'` | ok; chunk hashes identical to prod (`town3d-CZEFn22I.js`, `index-CfOt9Woz.js`) |
| `scripts/remote.sh --no-sync sh -c 'flock -s … vite build --minify false --outDir dist-nomin'` | ok (profiles only) |
| `ssh -N -L 3485:127.0.0.1:3485 <host>` | tunnel |
| session S1: host `timeout 300 flock -x …/v3-heavy.lock pnpm exec tsx <driver>` + local `node drive.mjs --warm yes --steady yes` | ok, 0 page errors (the first attempt measured the day inside the player's house and failed the night step; fixed by a Storyteller teleport to the square and bedtime → night) |
| S2: same on `dist-nomin` with `--prof both` | ok, 0 page errors |
| S3: `--cpu 4 --warm yes --steady yes` | ok, 0 page errors |
| S5: `--uncapped yes --cpus 1,4 --win 8 --steady yes` | ok, 0 page errors |
| S6: `--net fast4g --cpu 4` (cold, local) | **not run**: another agent held the heavy lock exclusively; replaced by the prod-edge measurements below |
| `curl` × 2 passes over 139 `/assets` URLs from prod (headers only + br bytes) | table §4 |
| local `zlib.brotliCompressSync` q4 / q5 / q11 of the prod chunks | table §4 |
| `node prodhome.mjs` (prod landing as a guest, 3 networks × CPU ×1/×4) | §2, §4 |
