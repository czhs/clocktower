# v3.3: cached static layer ("tiles")

Agent `v33-tiles`, 2026-10-18. Branch `v33-tiles` (from `origin/v3-game` `c67e1ea`). Prototype behind
`localStorage['ct.debug.v3tiles']` (`1` = on, `ab` = patched but off, switchable at run time with
`__ctCamera.tilesOn()` / `tilesOff()`; read once per town build). **Default: off** (no material is patched, no layer
moves, the live renderer runs unchanged).

User idea: the outdoor camera's yaw and pitch are fixed (only texel-snapped pans) and the vote camera uses a few fixed
poses, so the static town could be rendered once and reused, like the pre-rendered backgrounds with depth of classic
isometric games.

__RESULTS__

## 1. Design

### 1.1 Why tiles are exact

`PixelCamera` (vendor `core/PixelCamera.js`) is orthographic. Its position along the camera's right / up axes is
always a whole number of texels, on a grid anchored at the world origin. For a fixed yaw, pitch and texel size, an
orthographic camera moved by whole texels rasterises static geometry identically. The image only translates.

So the cache is keyed in **snap space**:

- A *cell* is one texel of that grid.
- A *tile* is 128 × 128 cells.
- A tile is baked by an orthographic camera whose pixel centres sit on the frame's lattice. If the padded frame
  (`lowW + 2·MARGIN`) has an odd size, the pixel centres sit on whole texels instead of half texels, so the frame's
  "parity" is part of the key.
- Depth is orthographic and linear. The vendor camera is **not** snapped along the view direction F. Tiles therefore
  store the depth of a bake camera at a fixed `pos·F = −distance`. The composite re-bases it per frame with one
  constant: `depthShift = (bakeF − camF) / (far − near)`.

The math is in `apps/client/src/game3d/tiles/tileMath.ts`. Unit tests: `apps/client/test/game3d/tiles.math.test.ts`.

### 1.2 What a tile holds, and why lighting is NOT baked as a final colour

The toon material (vendor `materials/toon.js`) computes `L = toonLit · shadow · cloud`. It then picks a band from
three hard band weights, and point lights and emissive are mixed on top. Two of those inputs change while the camera
holds still:

- **Cloud shadows** drift at 6 fps over every lit surface by day.
- **Cast shadows** of avatars fall on the ground, which is static.

Caching the final colour would therefore be stale 6 times a second, and would lose every moving shadow. Instead, each
tile holds the static fragment with its light level **forced into each band**. A bake-mode uniform `uCtBake` is
patched into the static materials before the warm-up, so the program count does not change.

| ring texture (RGBA16F) | content |
|---|---|
| `tSh` | toon colour with L forced into the shadow band |
| `tMid` | the same in the mid band; **alpha = `toonLit`** (the unshadowed light level) |
| `tHi` | the same in the hi band; alpha = the colour pass's emissive mark; its Float32 depth texture = the tile depth |
| `tN` | the normal pass (view normal + outline flag) |

The composite rebuilds the lighting per pixel with the toon material's own formula:

1. Reconstruct the world point from the cell and the re-based depth.
2. Compute `shadow` from the **live** sun shadow map of this frame. Static and dynamic casters are both in it. The
   normal-bias offset and the vendor's 4-tap penumbra step are replicated.
3. Compute `cloud` with the vendor's own `CLOUD_GLSL` (imported).
4. `L = toonLit · shadow · cloud`, then the band weights, then `mix(tSh, tMid, tHi)`.

This is exact for everything that is linear in the band mix:

- Point lights are `mix(outgoing, warm, pq)`.
- Emissive is additive.
- The cut-away circle's discard and rim are baked as they are.

The bake is done with `shadow.intensity = 0`, so the cache holds unshadowed colour.

Cost: 4 renders per tile bake, and one full-screen composite per colour or normal pass. On the cpu tier the composite
compiles the cloud noise out, like the toon shader (`CT_NO_CLOUDS`).

### 1.3 Frame order (no copy of the vendor pipeline)

`installTiles` wraps three things:

- **`pipeline.render`** (outermost). It runs the per-frame `tick`, which decides whether the cache is active, bakes up
  to the budget and sets the composite uniforms.
- **`renderer.render`**, only while the pipeline runs:
  - The colour and normal passes (the main camera into `rtScene` / `rtNormal`) run with the static layer **disabled**.
  - The composite quad (`renderOrder −1e9`, `depthFunc Always`, writes `gl_FragDepth`) is made visible for those
    passes, so it is the first opaque draw.
  - The sun shadow map of the frame is rendered first, inside that same call, so the composite can sample it.
  - Water reflection cameras (`preRender`) still see the static layer.
- **`shadowMap.render`**: every caster (the static layer + the main camera's layers) stays in the shadow map.

Static meshes move to their own three layer (10). The main camera and every visible light enable that layer, so with
the cache off the frame is the same set of draws as before.

### 1.4 Static vs dynamic

Classified once at install, under the ground / props / clocktower / house-0..14 pieces.

A mesh is **static** when it:

- is a single-material toon `Mesh`;
- is not instanced or skinned;
- is not on the canopy-fade list;
- is not transparent;
- has no custom depth material (no wind);
- is on layer 0 only;
- receives shadows;
- has no `onBeforeRender`;
- is visible.

Kit glass is included: tiles are off while pool lights are lit, see below.

Always **live**:

| live thing | why |
|---|---|
| avatars, NPC / life, critters, ambient FX | move |
| foliage piece, cottage crowns / clumps, the kit `soft` layer (thatch, ivy, planters) | canopy fade (D1: a dithered hole in front of every avatar) and wind sprites at 3 fps |
| grass / reed / flower tufts (instanced sprites) | wind at 3.5 fps |
| dais (seat stones, hands, banners, vote lamps) | game state + 3 fps banners |
| door pivots, door boards, tower dial face / hands | game state |
| water (preRender + post passes), fountain streams | animated |
| anything added after install (section twins, tower timer meshes) | not classified |

**Auto-demotion.** Each frame the cache compares every static mesh's world matrix, geometry, position / index
attribute versions, draw range and effective visibility with a snapshot. The snapshot is taken on the first enabled
frame. A mesh that changed goes back to layer 0 (live) for good, and its old + new footprint is invalidated.

On the first run this caught 15 animated parts inside the cottages without any hand-written list:

- mill wheel;
- shop signs (houses 5, 9, 13);
- weather vanes (houses 11 and 12, the tower);
- rooks (house 12);
- the crow (house 3);
- the bubbling draw range of house 1;
- the swinging bale (house 2);
- the telescope (house 0);
- the rowboat;
- the fountain water glass.

That left 56 static meshes of 72 candidates (3 materials patched: kit solid, kit glass, ground).

### 1.5 Invalidation rules

| event | rule |
|---|---|
| yaw / pitch / texel size (zoom, vote pose) / frame parity / ring size / the cut-away circle (on, centre, radius, top) | **flush**: every tile missing |
| lighting step: any value of the static materials' uniforms changed (sun direction, ramps, band thresholds, tone, ground night flag, kit glow …), sun colour / intensity, sky colour | **relight**: tiles stay shown but stale, re-baked under a budget (1 tile / frame). Checked every 8 frames. Cloud, penumbra, cut, canopy and time uniforms are evaluated live and are excluded. |
| a static mesh changed | demote + invalidate its cells |
| a visible tile is missing | bake it now; if more than 6 are missing (first frame, zoom, vote cut), render this frame live and bake 6 |
| the camera pans | tiles that enter the view (+ a 1-tile prefetch ring, 1 tile / frame) are baked; the ring (toroidal, `tile i → slot i mod NI`) evicts tiles that left |
| a pool light is lit (golden / night), a room is shown, a non-Basic shadow map | cache **off** (live frame) |

### 1.6 Exceptions

- **Cut-away boxes** (player box, door cottage; vendor `town/cutaway.js`). These follow the player. Their screen
  windows (`uCutBoxS`, padded by 2 px for the section rim) are **live rects**:
  - the composite discards inside them;
  - every static mesh whose cell bounds touch a rect is drawn **in the main render**, with a twin of its material
    that clips to the rects (`RECT_TEST`; same program key, so no new program);
  - transparent dynamic things (grass, flowers) blend over them in the normal order.
  - Bakes keep the circle and drop the boxes (`uCutBoxN = 0`).
- **Canopy fade**: the canopy materials are never cached (see 1.4).
- **Doors**: live (pivot subtrees excluded).
- **`setLit` windows**: glass is cached by day. A `setLit` change rewrites the glass glow attribute, so the attribute
  version changes and the mesh is demoted. At night the cache is off anyway.
- **Vote camera**: its fixed poses are a geometry-key change. The transition frames render live (more than 6 tiles
  missing), and the steady pose bakes over 3-4 frames.
- **Interiors**: the town is parked, so the cache is off.

__NUMBERS__

## 4. Interface for v33-light (and what tiles leave to it)

- The tiles **do not cache shadows**. They sample the live sun shadow map in the composite (`uShadowM`, `tShadow`,
  bias / normal bias / intensity, read from `engine.sun.shadow` in the quad's `onBeforeRender`).
- A cached static shadow map from v33-light plugs in without changes, as long as `engine.sun.shadow.map` /
  `.matrix` still hold the merged (static + dynamic) map when the colour pass runs.
- If v33-light keeps two maps (static + dynamic-only), the composite needs one more sampler and
  `min(staticShadow, dynamicShadow)`. That is a 5-line change in `vendor/tiles.ts` (`ctShadow`).
- Tiles are **off while a pool light is lit** (golden / night). Their 8 fps flicker and the re-aim at the player
  (vendor `demo/time.js`) would re-bake every frame. With a deferred pool from v33-light, the cache could stay on at
  night:
  - store the authored mid tone `toonMid0` in one more ring texture (bake mode 4);
  - apply the pool in the composite with the vendor's quantised formula: `pq` steps, warmth, reach;
  - apply the cut-away's Bayer pool edge (vendor `town/cutaway.js` `patchCutMaterial`, lines ~219-229).

  This needs that edge as a reusable GLSL export (a pixel3d CONTRACT-REQUEST, see §6).
- Lighting steps (sun direction, ramps) trigger a relight: tiles are re-baked at 1 tile / frame, about 40 frames for a
  full view. A deferred sun (normal + albedo per band) would remove those re-bakes. The band-forced colours above
  already make the cloud and the cast shadow deferred.

## 5. Dirty rectangles / scroll reuse (coordinator stretch goal): assessment

Not implemented. What the code shows:

- **"Nothing moved, re-present the previous frame" never happens in v3.** Several things animate continuously
  (fullstack.md §6, learnings.md §2):
  - cloud shadows at 6 fps;
  - grass / leaves / foliage sprites at 3-3.5 fps;
  - water every frame (30 Hz reflection);
  - film grain (`grade.js`, `uTime·12`, world-anchored, over the whole screen);
  - flicker;
  - idle breathing of 15 rigs.

  An exact re-present is possible only on frames where none of the stepped clocks ticked. That is at most every other
  60 Hz frame (the 6 / 12 fps clocks). The cheaper and safer lever is the already-proposed **30 fps idle cadence**
  (fullstack.md §7, plan item 2): it halves the frames with the same look.
- **Scroll reuse of the final image**: the post chain (outline, contact, fog, grade grain, vignette) reads neighbours
  and screen position. A shifted previous frame is only valid away from every animated thing and its 6-texel kernel
  margin, and it still needs the whole frame's post passes. With the tile cache, the static part of a pan is already a
  single texture fetch per pixel; what remains live is exactly the dynamic set. So scroll reuse would save only the
  composite (one quad), not draws.
- **Dirty rects around moving dynamic things**: the dynamic set (15 walking avatars, grass, water, foliage) is spread
  over the whole square. Rects would cover most of the frame in every measured scene, while the bookkeeping costs
  CPU on the very thread that is the bottleneck.
- Verdict: not worth it on top of tiles. Ship the 30 fps idle cadence instead (power), and measure on the iGPU first.

## 6. Risks and what needs the pixel3d vendor session

Risks:

- **Shared kit materials.** The static set shares materials with live meshes (doors, dais, boards, tower face). Every
  per-draw state is either per object (layers) or a material twin with the same program key. A vendor change that
  moves state into a shared material uniform could leak.
- **Vendor GLSL anchors.** The patch needs `vec3 toonW = bandWeights(toonL, vToonCut);` and
  `#include <dithering_fragment>` in the toon fragment. When they are missing, the material is not patched and its
  mesh simply stays live, because the bake writes nothing for it. A vendor guard test should pin the anchors before
  this ships.
- **Composite fidelity.**
  - Shadow and penumbra use the cached (un-noised) normal, where the toon uses `toonUpY` from the noised normal.
  - The normal bias uses the shading normal, where the toon uses the vertex normal.
  - Measured: 0.01-0.07 % of pixels differ.
- **Raycasts.** Vendor code that raycasts the town with default layers (layer 0) would miss the static set while the
  cache is on. None was found in the game paths, but life / perches use `isCut` / CPU twins, not raycasts. Re-check
  after a vendor publish.
- **Memory.** The ring is 44 MB at high (1920×1080 → 9×6 tiles of 128²: 4 RGBA16F targets + depth texture + 4 depth
  renderbuffers) and about 25 MB at low / cpu. A smaller tile (64) and no depth renderbuffer on the three colour-only
  bakes would roughly halve it.

Vendor asks (CONTRACT-REQUEST, pixel3d session):

1. A bake hook in `toonMaterial`: `uBakeBand` / `uBakeLit` as first-class uniforms, instead of a string patch of
   `bandWeights(toonL, …)`.
2. The cut-away pool-edge dither (`patchCutMaterial`) and the point-light loop as exported GLSL functions, so a
   deferred pool can share them.
3. MRT colour + normal (learnings.md §4.1). It would halve the bake (4 → 2 renders per tile) and the live normal pass
   of the dynamic set.
4. A static / dynamic flag on piece meshes. Today the cache finds animated parts by watching them move. A flag would
   remove the first-frame stale parts (the still diff's few pixels on signs / vanes).

