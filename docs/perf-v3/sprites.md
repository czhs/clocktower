# v3.3: characters as baked sprites (default at the `low` and `cpu` tiers)

Agents `v33-sprites` (prototype, branch `v33-sprites` 5e41e37) and the v3.3 sprites finisher (branch
`v33-sprites-ship`, from the prototype merged with `origin/v3-game` 1ecbed3/de3a754), 2026-10-18.

**Default:** sprites at the `low` and `cpu` tiers, rigs at `high` (`layer.ts spritesDefault`).
`localStorage['ct.debug.v3sprites'] = '1' | '0'` forces sprites on / off at any tier; a build can force it for every
client with `VITE_V3SPRITES=1 | 0` (the e2e runs of both paths). Any failure of a sprite (bake, a vendor shader anchor
not found, ...) falls back to the rig of the same spec (layer.ts attempt chain: sprite → rig → billboard → stand-in
sprite → stand-in rig).

Code: `apps/client/src/game3d/avatars/sprites/` — `atlas.ts` (pure math: cells, facings, timelines, encodings, tight
cells + shelf packing, feet on steps, cache keys), `bake.ts` (kits, the sliced bake, the store, the persistent cache
glue), `runner.ts` (frame-budget job runner), `proxy.ts` (shadow proxy clustering), `cache.ts` (IndexedDB cache),
`cacheClient.ts` + `cacheWorker.ts` (the cache in a module Worker), `material.ts` (the sprite + proxy materials),
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
6. **Kits are kept** (≤ 24 per engine, GPU buffers released after each bake, programs stay compiled): a new camera key
   (vote camera, resize, a room) only re-renders cells — no rig build, no simulation, no compile. The previous key's
   sheet stays (`keepOld = 1`) so vote camera ↔ follow camera switches back instantly.
7. **Persistent cache** (`cache.ts`, in a module Worker: `cacheWorker.ts`): a finished sheet is read back
   asynchronously (`readRenderTargetPixelsAsync`), transferred to the worker, packed, gzipped and stored in IndexedDB
   under `v<BAKE_FORMAT>|<fnv(vendor sources + spec)>|<spec>|<texel>|<pitch>|<yaw>|<clip set>`; bounded at 48 MiB
   stored (LRU), quota errors evict half and retry once, open failures / private mode / no Worker disable writes for
   the session (bakes go on). A join whose key is cached builds **no rig at all** (1 upload unit per plane). On the
   main thread the gzip + clones cost the vote re-bake frames p95 8 → 34 ms (host GPU), hence the worker.
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

LAPTOP_NUMBERS

### 2.3 Build host GPU (RTX 3060, ANGLE Vulkan, headless), low tier, 15 characters

| | rigs | sprites |
|---|---|---|
| cold join (15 bodies) wall / max frame / long tasks | 785-859 ms / 86-91 / 2 (max 90) | 2.1-2.8 s / 98-100 / 5-6 (max 97) |
| repeat join (IndexedDB hits, no kits) | — | **845 ms**, 15 hits, max bake unit 0.5 ms (the long tasks left are program compiles) |
| vote camera switch: frames until every sheet re-baked | (camera only) max frame 20 ms | **622 ms**, max frame 16 ms, p95 9 ms, max bake unit 0.9 ms, 0 long tasks |
| vote camera cost (×1 / ×4 JS frame) | 2.99 / 12.6 ms, 920 k tris | 2.79 / 11.0 ms, 525 k tris |
| night (light pool), walking / idle, GPU-incl. frame | 6.99 / 6.58 ms, 735 k tris | 6.39 / 4.96 ms, 341 k tris |
| night + ghosts, walking / idle | 6.62 / 6.52 ms | 4.58 / 4.61 ms |
| avatar update, walking | 0.69 ms | 0.11 ms |
| bake store over the cold join | | 3 558 units, 8 over 4 ms (first cell of a fresh kit: geometry upload), max 14 ms |

## 3. Look: pixel diffs vs live rigs

Same engine, same moment, same positions; rigs first, then sprites pinned to each rig's displayed drawing
(`spriteDebug.force`; a shared ghost's idle maps to `ghostIdle`). Host GPU, low tier, 6 characters (frog, chonk,
moth, cilantro, goat, storyteller: shared, 'clips' and 'tint' ghost modes), full 1280×720 frame, tolerance 6/255.

STILLS_TABLE

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
- Kits keep ~4 MB of JS heap per spec for the session (heap after GC with 15 specs: 362 MB sprites vs 315 MB rigs on
  the host); `bakeConfig.keepKits = false` trades that for a rig build per spec on each new camera key.
- A spec whose own vertex GLSL computes more than 3 varyings, or values outside {0, 0.5, 1, 2} / flags, would need
  `encodeCustom4` widened (none today).
- Sprites need the camera pitch / texel to be one of a few values; any free camera re-bakes (sliced, no hitch).

## 5. Recommendation

RECOMMENDATION

## 6. Commands run

COMMANDS

## 7. Prototype (v33-sprites, 5e41e37) for reference

Laptop iGPU (ANGLE GL-EGL, Chrome 143), 15 characters walking: low tier presented fps 143 → 360, GPU-inclusive frame
11.1 → 5.2 ms, CPU ×4 15.8 → 9.2 ms; cpu tier 334 → 1 139 fps; vote re-bake 744 ms over 46 frames, max frame 37 ms;
pixel diffs 0.46-2.01 % (shadow caster, no clips baked). Full tables: `git show 5e41e37:docs/perf-v3/sprites.md`.
