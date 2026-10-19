# v3.3: characters as baked sprites (default at the `low` tier)

Agents `v33-sprites` (prototype, branch `v33-sprites` 5e41e37) and the v3.3 sprites finisher (branch
`v33-sprites-ship`, from the prototype merged with `origin/v3-game` 1ecbed3/de3a754), 2026-10-18.

**Default:** sprites at the `low` tier, rigs at `high` and at `cpu` (software GL, §2.2) (`layer.ts spritesDefault`).
`localStorage['ct.debug.v3sprites'] = '1' | '0'` forces sprites on / off at any tier; a build can force it for every
client with `VITE_V3SPRITES=1 | 0` (the e2e runs of both paths). Any failure of a sprite (bake, a vendor shader anchor
not found, ...) falls back to the rig of the same spec (layer.ts attempt chain: sprite → rig → billboard → stand-in
sprite → stand-in rig).

Code: `apps/client/src/game3d/avatars/sprites/` — `atlas.ts` (pure math: cells, facings, timelines, encodings, tight
cells + shelf packing, feet on steps, cache keys), `bake.ts` (kits, the sliced bake, the store, the persistent cache
glue), `runner.ts` (frame-budget job runner), `proxy.ts` (shadow proxy clustering), `cache.ts` (IndexedDB cache),
`cacheClient.ts` (the store's cache), `material.ts` (the sprite + proxy materials),
`spriteBody.ts` (the AvatarBody); `game3d/vendor/spriteLook.ts`; `avatars/layer.ts` (default, pump, attempts).
Bench: `tests/perf/v3-sprites{-page.ts,.mjs}`. Unit tests: `apps/client/test/game3d/avatars.sprites{,.cache}.test.ts`.

## 1. Design

### 1.1 What is baked (unchanged from the prototype)

A G-buffer of the lighting INPUTS, not a lit colour. Per cast spec, at runtime, ONE vendor rig (a "kit") is built,
driven through its clips, and every displayed drawing is rendered in the 8 facings at the exact low-res texel size
and camera pitch / yaw of the moment through the rig's **own look material** with two extra output modes into two
RGBA8 atlases:

| plane | channels |
|---|---|
| A | view-space normal x, y (8 bit each) · depth offset toward the camera from the feet plane (**12 bit**, 1.2 mm steps over −2…+3 m) · **4 bits of spec varyings** (below) |
| B | palette slot (≤ 16) + bone side (L / R / midline) + ghost-halo bit · look.js part id · lift % · bind height / ghost height |

In game each character is one camera-facing quad whose material is the vendor `characterMaterial` itself, its shader
patched to read every per-vertex input per texel (`material.ts`): day / golden / night ramps, the light pool, clouds,
building shadows, the shared ghost tones + halo, `ghostTint` (talking rim, fade-in dither, 'tint' ghosts) and the
outline pass run the same GLSL as the rig; `gl_FragDepth` = quad depth − baked offset (the town and the cut-away
occlude per texel).

### 1.2 What the ship version adds

1. **Every clip the game shows** (`bake.ts clipSetOf`, per spec): `idle`, one locomotion cycle at the game speed,
   held `vote`, the `talk` loop, the `die` collapse (held, 1.5 s timeline), the 'clips' ghosts' `ghost` /
   `ghost-spent` loops (shown standing AND moving, like the rig's slide), and the shared ghost's standing idle
   (`ghostIdle`: FK legs + the vendor hover). The game plays no one-shot emotes on avatars (`playEmote` has no caller;
   `point` / `sit` are not used), so none are baked. A clip is a timeline (`atlas.ts Timeline`: key start times +
   cells; loops wrap, the collapse holds). `spriteDebug.fallbacks` counts frames that would show a stand-in pose: 0
   in every run below.
2. **Spec GLSL varyings** (the 'clips' ghost specs compute `vGhost` / `vGhostHalo` / `vMothLamp` ... from bone matrices
   in their own vertex code, which a quad has no skinning for): up to 3 varyings are baked into plane A's 4 spare
   bits (`encodeCustom4`: varying 0 on the levels {0, 0.5, 1, 2}, varyings 1-2 as flags — every vendor ghost spec's
   values), and the sprite shader turns those varyings into globals set per texel. The pale-blue ghost tones, the
   dissolve dither and the halo of chonk / goat / honk / mole / moth / mushroom / rabbit / snail / green-hood /
   skeleton-chef match the rig (stills §3).
3. **Shadow proxy** (`proxy.ts`): the rig's bind mesh vertex-clustered per dominant bone (grid = height / 36,
   2.5-6 cm): 680-4 200 triangles per spec (rig: ~14 k), rigidly skinned in a depth-only shader from the baked bone
   matrices of the displayed drawing (3 RGBA32F texels per bone, one row per drawing) and turned to the displayed
   facing. It is drawn only into the sun's shadow map: its colour material is `visible = false` except inside
   `renderer.shadowMap.render` (wrapped once; three tests shadow casters against the MAIN camera's layers, so a layer
   cannot do it). The shadow follows the real sun direction and elevation at every hour; the self-shadow hull
   exemption (look.js) keeps it off the figure itself. The prototype's plane caster stays as the fallback.
4. **Tight cells**: each (drawing, facing) gets its own cell from the posed bounds points (all vertices clustered at
   4 cm, the shared ghost's halo included) + 2 texels + the clustering margin, shelf-packed (`packShelves`). With the
   extra clips (24-31 drawings per spec instead of 8-14) an atlas is 2.7-4.4 MB per spec at low (was 2.2-5.1 MB with
   fewer clips and fixed cells; 6.7-12.2 MB with all clips in fixed cells + a third plane).
5. **Sliced bakes** (`runner.ts`): a bake is a generator yielding after each simulation step / cell / proxy chunk, or
   on a Promise (spec import, the parallel shader compile of the bake program, a readback); `layer.update` pumps
   `BAKE_BUDGET_MS = 4` ms of work per frame before the render (a 50 ms watchdog pumps when the layer is not updated).
   The renderer state is restored after every cell (the game renders between units). The only unsliced pieces are
   the vendor's synchronous rig build (`createCharacter`, 5-120 ms, once per spec per session, like a rig join) and
   three's program link on first use (parallel where KHR_parallel_shader_compile exists).
6. **Kits are kept** (≤ 24 per engine, with their GPU buffers and compiled programs: releasing the buffers made the first cell of a re-bake a 12-16 ms re-upload on the laptop): a new camera key
   (vote camera, resize, a room) only re-renders cells — no rig build, no simulation, no compile. The previous key's
   sheet stays (`keepOld = 1`) so vote camera ↔ follow camera switches back instantly.
7. **Persistent cache** (`cache.ts`): once no bake is pending, a finished sheet is read back asynchronously
   (`readRenderTargetPixelsAsync`), packed, gzipped in 64 KB pieces with a macrotask between them and stored in IndexedDB
   under `v<BAKE_FORMAT>|<fnv(vendor sources + spec)>|<spec>|<texel>|<pitch>|<yaw>|<clip set>`; bounded at 48 MiB
   stored (LRU), quota errors evict half and retry once, open failures / private mode disable the cache for
   the session (bakes go on). A join whose key is cached builds **no rig at all** (1 upload unit per plane). Storing
   right after each bake with one-shot gzip cost the vote re-bake frames p95 8 → 34 ms (host GPU); a module Worker
   fixed that but is blocked by the site's Trusted Types policy (`trusted-types 'none'`, a console error in every e2e),
   so the store waits for the bakes and chunks the (de)flate instead (re-bake p95 8 ms, 15 sheets stored ≈ 1 s later).
8. **Feet on steps** (`atlas.ts stepOffset`): the ground under both feet (± the foot spread across the displayed
   facing) is sampled per frame (cached per position / facing); the figure sinks toward a lower foot by at most
   0.1 m (the rig's hip-dip limit) or rises onto the lower foot when both are above the root's ground. Interiors use
   `floorAt` (the tower stair / landing).
9. **Reflections**: the quad discards in any render whose camera is not the game camera (`uSprHide`), so a mirrored
   water-reflection camera never shows a quad facing the wrong way (rigs at `high` keep their reflections).
10. **Lantern prop**: a lantern carrier whose spec has no lantern socket gets the rig body's small box lantern at the
    baked hand position; the pool light anchors at the baked socket of the displayed drawing.

Kept from the rig path: labels / bubbles (registry positions), talking rim, ghost tint / halo, fade-in poof, lantern
light, depth-correct occlusion with the town and the cut-away. Every vendor-internal patch `must()`-checks its anchor
and throws → the layer falls back to the rig.

## 2. Numbers

Bench: the real engine + Hollowmere + avatar layer on a scripted state (no server), 15 distinct cast specs on a ring
around the square, camera viewHeight 12 (vote: 12.887 / 23° / 45°), canvas 1400×800, DPR 1. "JS frame" =
layer.update + renderNow; "GPU-incl." = the same + a 1-pixel `readPixels` (waits for the GPU), uncapped.

### 2.1 Real laptop, Intel Arc iGPU (`ANGLE (Intel, Mesa Intel(R) Arc(tm) Graphics (MTL), OpenGL ES 3.2)`, Chrome 143 headless, ANGLE GL-EGL)

| 15 characters | low: rigs | low: **sprites** | cpu tier*: rigs | cpu tier*: sprites |
|---|---|---|---|---|
| GPU-incl. frame, walking (p95) | 12.95 (14.7) ms | **8.01 (9.2) ms** (−38 %) | 7.37 (8.8) ms | **2.95 (3.9) ms** (−60 %) |
| GPU-incl. frame, idle | 13.02 ms | **7.83 ms** | 6.49 ms | 3.02 ms |
| JS frame, walking | 3.18 ms | 3.06 ms | 2.69 ms | 1.98 ms |
| avatar update, walking | 0.65 ms | **0.16 ms** | 0.87 ms | 0.17 ms |
| CPU ×4, walking: JS / GPU-incl. | 9.14 / 17.6 ms | **7.71 / 12.0 ms** | 6.03 / 10.1 ms | 4.74 / 5.58 ms |
| triangles / draw calls | 744 k / 266 | **349 k / 265** | 238 k / 101 | 94 k / 100 |
| night (light pool), walking / idle | 15.0 / 14.4 ms | **8.37 / 8.34 ms** | 7.99 / 7.91 ms | 3.25 / 3.12 ms |
| night + ghosts, walking / idle | 13.5 / 13.0 ms | **8.58 / 8.63 ms** | 7.72 / 7.59 ms | 3.09 / 3.03 ms |
| presented fps (vsync-capped headless) | 60 | 60 | 60 | 60 |
| JS heap after GC | 332 MiB | 259 MiB | 328 MiB | 241 MiB |
| join, 15 bodies: wall / max frame / long tasks | 1.89 s / 220 ms / 2 | cold 5.01 s / 135 ms / 3 (max 90) | 1.46 s / 126 ms / 3 | cold 4.53 s / 114 ms / 3 |
| repeat join (IndexedDB, 15 hits, no rig built) | | **1.30 s / 68 ms / 3** | | 1.27 s / 74 ms / 3 |
| vote camera: re-bake 15 sheets | (camera only) max 25-34 ms | 3.36 s in the background, p95 frame 17 ms (= rigs), max 56 ms (rigs: 34) / 2nd 37 ms, 1 frame > 50 ms, 0 long tasks, worst bake unit 9.2 ms (v1 with released kit buffers: max 63 ms) | max 17 ms | 3.83 s, max frame 35 ms, p95 17 |
| vote camera cost ×1 / ×4 (JS frame) | 3.43 / 10.1 ms | **2.84 / 8.84 ms** (v2 run) | 2.03 / 6.40 ms | 2.66 / 6.23 ms |

\* "cpu tier" here = the cpu tier's settings (320×180) on the laptop GPU, as in the prototype; the real cpu tier is
software GL (§2.2), where sprites are NOT the default.

### 2.2 SwiftShader (build host CPU), cpu tier

| | rigs | sprites (forced: `ct.debug.v3sprites=1`) |
|---|---|---|
| idle / walk fps (20 s) | 14.2 / 5.1 (walk p95 1.2 s) | 13.1 / **8.1** (walk p95 184 ms) |
| cold join (15 bodies) wall / max frame / long tasks | 11.4 s / 8.6 s / 9 (sum 10.8 s) | **118.6 s / 12.4 s / 64 (sum 115 s)** |

On software GL every spec's bake program and sprite program compile for seconds each (a bake unit of 9.6 s: the
first cell of a kit; rigs compile one program per look option set), so the first join is unusable; the stored sheets
would make later joins cheap, but the readback is slow there too. **Hence the default: sprites at `low` only.**

### 2.3 Build host GPU (RTX 3060, ANGLE Vulkan, headless), low tier, 15 characters

| | rigs | sprites |
|---|---|---|
| cold join (15 bodies) wall / max frame / long tasks | 785-859 ms / 86-91 / 2 (max 90) | 2.1-2.8 s / 98-100 / 5-6 (max 97) |
| sheets stored in IndexedDB after the cold join | — | ≈ 1.0 s (15 sheets, 7.0 MB gzipped) |
| repeat join (IndexedDB hits, no kits) | — | **1.04 s**, 15 hits, no rig built, max bake unit 0.2 ms (the 5 long tasks left are the sprite programs' compiles, like a rig join) |
| vote camera switch: frames until every sheet re-baked | (camera only) max frame 20 ms | **625 ms**, max frame 17 ms (the switch frame itself), p95 8 ms, 2nd-worst 8 ms, max bake unit 0.9 ms, 0 long tasks |
| walking, JS frame / GPU-incl. frame | 3.15 / 6.38 ms, 744 k tris, 267 draws | 1.91 / 4.18 ms, 350 k tris, 266 draws |
| vote camera cost (×1 / ×4 JS frame) | 2.99 / 12.6 ms, 920 k tris | 2.79 / 11.0 ms, 525 k tris |
| night (light pool), walking / idle, GPU-incl. frame | 6.99 / 6.58 ms, 735 k tris | 6.39 / 4.96 ms, 341 k tris |
| night + ghosts, walking / idle | 6.62 / 6.52 ms | 4.58 / 4.61 ms |
| avatar update, walking | 0.69 ms | 0.11 ms |
| bake store over the cold join | | 3 558 units, 8 over 4 ms (first cell of a fresh kit: geometry upload), max 14 ms |

## 3. Look: pixel diffs vs live rigs

Same engine, same moment, same positions; rigs first, then sprites pinned to each rig's displayed drawing
(`spriteDebug.force`; a shared ghost's idle maps to `ghostIdle`). Host GPU, low tier, 6 characters (frog, chonk,
moth, cilantro, goat, storyteller: shared, 'clips' and 'tint' ghost modes), full 1280×720 frame, tolerance 6/255.

| scene | differing px (prototype) | what differs |
|---|---|---|
| day, idle | **0.29 %** (0.48-0.83 %) | shadow edges by a texel (clustered proxy); a texel at feet on the dais steps |
| day, walk | 1.62 % (0.77-1.36 %) | positions / lean: the rig's stance surge, acceleration lean and planted-foot glide move the figure by 1-3 texels; the steady drawings match |
| day, talking (3 of 6) | **0.11 %** (0.85-1.38 %) | the `talk` loop and the rim match |
| day, ghosts | **0.40 %** (1.19-2.01 %) | shared ghost idle (FK legs + hover), 'clips' ghost loops with their own tones, 'tint' ghost: match; dither of translucent ghosts is screen-anchored |
| dying (0.67 s into the collapse) | **0.08 %** (not baked) | — |
| vote (vote camera after the re-bake, hands up) | **0.04 %** | — |
| golden | 0.32 % (0.82-1.14 %) | shadow edges |
| night (light pool) | 0.33 % (0.46-0.84 %) | shadow edges |
| night, ghosts | 0.40 % | as day ghosts |

Stills: `docs/perf-v3/sprites/stills-rig-sprite-diff.png` (per scene: rig | sprite | diff, cropped to the figures, ×2).

**Visible differences left (documented):**
1. Secondary motion: acceleration lean, chest / head lag, chain swing (scarves, tails), planted feet while the root
   glides (feet slide 1-2 texels inside a drawing), turn-in-place stepping detail; the locomotion drawing follows a
   stride wheel, so a turn or a start/stop lands on different frames than the rig.
2. Feet on uneven ground: no per-foot IK; the figure sinks ≤ 0.1 m toward the lower foot (the other foot can dip into
   a step, partly hidden by it).
3. Shadow shape: the proxy is a 2-4 cm clustered copy, so its shadow edge differs by a texel here and there.
4. Fur / feather / scale terminator hints (look.js `charHintL` needs bind xyz).
5. During a camera-key change (vote camera, resize) the previous sheet shows until the re-bake lands (≤ ~1 s on the
   host GPU, sliced) — same world size, the old pitch / texel.
6. Water reflections at low / cpu show no characters (rigs did); the high tier keeps rigs.

## 4. Risks

- The bake leans on vendor internals (`ch.rig.mesh`, `ch.gait`, `ch.state`, look.js uniform names, the toon hook
  strings, `Character.ghost`); every patch checks its anchor and falls back to the rig. A vendor refresh changes the
  cache key (sources hashed), so no stale sheet is used. CONTRACT-REQUEST(pixel3d): a supported G-buffer output mode
  in look.js and a public pose-sampling API (`Character.sampleDrawings()`).
- Memory: kits keep ~4 MB of JS heap and the rig's GPU buffers (≈ 3.5 MB) per spec for the session; atlases are
  2.7-4.4 MB per spec and camera key at low (two keys kept). JS heap after GC with 15 specs: laptop 259 MiB sprites
  vs 332 MiB rigs, host 362 vs 315 MB (measured right after the bakes). So GPU memory is ~2-3× the rigs' at low
  (≈ 150 MB vs 50 MB for 15 specs; shared system RAM on an iGPU). `bakeConfig.keepKits = false` / `keepOld = 0`
  trade memory for a rig build per spec / a re-bake on each camera-key change.
- A spec whose own vertex GLSL computes more than 3 varyings, or values outside {0, 0.5, 1, 2} / flags, would need
  `encodeCustom4` widened (none today).
- Sprites need the camera pitch / texel to be one of a few values; any free camera re-bakes (sliced, no hitch).

## 5. Recommendation

1. **Ship sprites as the default at the `low` tier: yes.** On the laptop iGPU the GPU-inclusive frame drops 38 %
   walking / 40 % idle / 44 % at night, CPU ×4 −32 %, triangles −53 %; the look differs only in the documented details
   (§3: 0.04-0.40 % of the frame outside walking); no stand-in pose shows in normal play (`fallbacks` = 0); a vote
   camera switch re-bakes in the background without a long task; a repeat join builds no rig (IndexedDB).
2. **`cpu` tier (software GL): keep rigs** (§2.2: a 2-minute first join with multi-second frozen frames). Sprites still
   help its frame rate (+57 % walking fps) once baked; worth revisiting with fewer bake programs (one shared G-buffer
   program instead of one per look option set) or shipping the sheets' bake for the default window sizes.
3. `high` keeps rigs (reflections, full motion).
4. Follow-ups: a public G-buffer mode / pose sampling in the vendor (CONTRACT-REQUEST above); bake on the first idle
   frames after the join instead of during it; the cold join is ~2.6× the rig join on the laptop (bakes are sliced, so
   it is time-to-final-look, not frame time: bodies appear as their sheet lands).

## 6. Commands run

| Command (host via `CT_AGENT=v33-sprites scripts/remote.sh …`, locks `../../v3-heavy.lock` / `../../browser.lock`) | Result |
|---|---|
| `pnpm --filter @ct/client exec tsc --noEmit -p .` (several times) | ✅ |
| `pnpm -r run typecheck` | ✅ |
| `pnpm vitest run apps/client/test/game3d` | ✅ 37 files / 511 tests (sprites: 28 new ship tests + 15 cache tests) |
| `pnpm vitest run apps/client/test/game3d/avatars.sprites.cache.test.ts` (cache subagent) | ✅ 15/15 |
| `pnpm build` (default) | ✅ |
| `env E2E_V3=1 E2E_PORT=3487 CT_GL=gpu pnpm exec playwright test -c tests/e2e/playwright.config.ts --project=v3 v3-boot v3-social v3-vote v3-life v3-pageerrors --workers=1` (default: sprites at low) | first run ❌ 4/5: a module Worker for the cache tripped Trusted Types (`trusted-types 'none'`) → worker removed; re-run ✅ 5/5 (boot 11.9 s, life 1.1 m, pageerrors 2.0 m, social 14.0 s, vote 27.0 s) |
| same with `VITE_V3SPRITES=0` (rigs everywhere) | ✅ 5/5 (boot 10.6 s, life 1.1 m, pageerrors 2.0 m, social 8.0 s, vote 26.0 s) |
| `pnpm --filter @ct/client exec vite --port 3486 --strictPort --host 127.0.0.1` | dev server for the bench |
| `node tests/perf/v3-sprites.mjs --base http://127.0.0.1:3486 --root <sandbox> --tiers low --only build,vote,night,cost,stills …` (host RTX 3060, ANGLE Vulkan) | §2.3, §3 |
| laptop: `~/ct-perf/chrome.sh 9488 intel glegl` + tunnels; `node tests/perf/v3-sprites.mjs --cdp http://127.0.0.1:9488 --tiers low` / `--tiers cpu` `--only build,cost,throttle,fps,vote,night --fpsS 10` | §2.1 |
| `node tests/perf/v3-sprites.mjs --gl swiftshader --tiers cpu --only build,fps --fpsS 20` (host) | §2.2 |
| `scripts/secret-scan.sh --staged` | ✅ clean |

## 7. Prototype (v33-sprites, 5e41e37) for reference

Laptop iGPU (ANGLE GL-EGL, Chrome 143), 15 characters walking: low tier presented fps 143 → 360, GPU-inclusive frame
11.1 → 5.2 ms, CPU ×4 15.8 → 9.2 ms; cpu tier 334 → 1 139 fps; vote re-bake 744 ms over 46 frames, max frame 37 ms;
pixel diffs 0.46-2.01 % (shadow caster, no clips baked). Full tables: `git show 5e41e37:docs/perf-v3/sprites.md`.

## 8. v3.4 release changes (the `v34-release` agent, 2026-10-18)

Merged onto v3.3 (`72aba16`); numbers on the real laptop in docs/RELEASE-v3.md "v3.4".

- **Tier**: sprites only when the scene's tier is `low` (rebuilt per tier, so a promotion to `high` builds rigs); the
  sheets (bakes AND cached ones) wait for `Lifecycle.mayPromote` to turn false (`TownGame3d` `spriteGate`, at most 20 s):
  the GPU probe times rigs (with sprites an iGPU measured 4.5 ms, at the 4.5 ms integrated bar) and a promoted town
  would discard the bakes.
- **Rig first, then swap** (`layer.ts` `pumpUpgrades`): a new avatar takes a sheet only if one is at hand (`peekSheet`:
  finished or in IndexedDB), else its rig; after every first build, the sheets are requested (own avatar first), and one
  body at a time is created, pre-compiled beside the shown rig and swapped (not mid-collapse / mid-fade).
- **Memory** (`bakeConfig`): `depthless` (finished planes copied into targets without a depth buffer, one unit per
  allocation / copy, the copy program pre-compiled), `releaseKitGpu` (kit geometry freed after each bake, re-uploaded one
  attribute per unit through an invisible mesh), `keepOld: 0` (a fresh unreferenced sheet is protected 10 s). 17 avatars
  ≈ 33 MiB at the follow camera on the laptop (was ≈ 150 MB estimated with kits + two keys + depth).
- **Cache key fix**: `specSource` hashed each part's `BufferGeometry.toJSON()`, whose random `uuid` changed the key on
  every page load (the persistent cache never hit after a reload) and cost megabytes of JSON per spec; geometries are now
  a compact digest.
- **Vote**: re-bake hold 0.5 → 1.2 s (the vote frame re-fits ~0.7 s after entry: the interim key was baked too), kits
  warmed in the background after a cached join (one per 1.5 s, programs compiled), the IndexedDB store waits while a
  nomination / vote is open. Laptop vote window worst frame 67 ms (was 83-117 ms in the first v3.4 builds).
- **Chunk**: `avatars/sprites/index.ts` is a lazy chunk (18.5 KiB br); `high` / `cpu` never download it.
- Sprite bodies report `texture: 'v3:<spec>'` (§6.1) and `sprite: true`; `__ctCamera.spritesNow()` (upgrades, gate,
  GPU estimate, peek stats) and `__ctCamera.sprites()` (store: units > 8 ms by phase, `spawn` = vendor rig build ms).
