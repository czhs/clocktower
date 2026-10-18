# v3.3 perf prototype: lighting and shadows (front "light")

Agent `v33-light`, 2026-10-18, branch `v33-light` from `origin/v3-game` (`c67e1ea`). Scope: the sun shadow map, the
constant point-light pool, and whether to bake the sun. Everything is behind one switch, read once per town build:

| `localStorage['ct.debug.v3light']` | What is installed |
|---|---|
| unset (default) | nothing: the game is byte-for-byte the v3-game frame path |
| `stats` | instrumentation only (`__ctCamera.light()`: renderAt ms, shadow draws per frame, static / dynamic renders) |
| `shadow` | item 1: split sun shadows (cached static map + per-frame dynamic map) |
| `pool` | item 2: the night light pool as one deferred low-res pass, 0 forward point lights |
| `shadow,pool` or `all` | both |

A/B helper: `ct.debug.v3lightF32 = 1` makes the pool's normal + aux target 32-bit float (precision test).
Code: `apps/client/src/game3d/vendor/light.ts` (all three.js / vendor workarounds; the vendor tree is untouched),
wired in `game3d/world/stage.ts` (before the warm-up, so programs stay constant), debug-only freeze hook in
`game3d/vendor/engineHost.ts` (`window.__ctV3Freeze = <s>`: every frame at that time, dt 0, for pixel diffs).
Tests: `apps/client/test/game3d/light.test.ts`. A night interiors scenario for stills: `tests/v3/scenarios/light-rooms.json`.

## 1. Method

| What | How |
|---|---|
| Build | the mock-world harness (`apps/client/vite.harness.config.ts`) built in a host sandbox, served with `vite preview` on 127.0.0.1:3490 / 3491, reached through SSH tunnels |
| Desktop | Chromium 1243 headless on the editing machine (discrete desktop GPU, ANGLE / Vulkan), 960×540, harness scenarios held at a still (the town keeps animating). Uncapped (`fps=-1`, `--disable-gpu-vsync --disable-frame-rate-limit`): fps = real per-frame cost. CPU ×4 via CDP `Emulation.setCPUThrottlingRate`. 5 s windows after a 2.5 s settle. |
| Laptop | the user's laptop, Intel Arc integrated GPU, Chrome 143 headless with `--use-angle=gl`, driven over CDP (section 5) |
| Numbers | `__ctCamera.light()`: renderAt ms (wraps `Engine.renderAt`), shadow draws per frame (wraps `WebGLShadowMap.render`), static / dynamic map renders; programs from `renderer.info`; GPU ms = an `EXT_disjoint_timer_query_webgl2` TIME_ELAPSED query around each rAF callback (on the desktop GPU this is far below 1 ms and partly the issue interval: use it relatively) |
| Stills | `window.__ctV3Freeze = 20` (every frame at t = 20 s, dt 0), screenshot, per-pixel diff against the switch-off still of a separate page load. Noise floor = two switch-off loads (characters animate on their own clocks, so the floor is not 0 where they stand) |
| Scenes | `square-day-8` (day), `dusk-transition` shot "bedtime" (dusk, pool partly lit), `night-15` (night, pool lit), `vote-12` (vote camera), `light-rooms` (new: night outdoors, inside house-5 at night, the clock tower room at night) |

Caveats: single 5 s windows on a shared machine are ±5-10 % (low ×4 rows are averaged over 2-3 runs). The dusk and
vote stills are not deterministic across loads (the stage hour and the vote clock follow server time): their diffs are
not usable.

## 2. Item 1: static shadow cache (split sun shadows)

### Design

- `engine.sun` keeps only the town's **static** casters and stops auto-updating (`shadow.autoUpdate = false`). Its map is
  re-rendered only when dirty:
  - `sun`: `uSunDir` changed (time of day re-derives the look when the clock moved ≥ 15 game seconds and steps the sun
    to 0.5°; compared exactly, the vendor writes the same floats for the same step);
  - `pan`: the view left the margin (below);
  - `extent`: the vendor re-sized its map;
  - `caster`: a static caster changed: world matrix, effective visibility (incl. leaving the scene), material
    visibility, `instanceMatrix.version` / count, position attribute version, `castShadow`.
- Placement: the vendor's own centre rule (`Engine._updateSun`: light basis, texel-snapped x / y, 4 m along the light),
  moved to a grid of 2 × MARGIN texels; frustum = the vendor's ± (extent + MARGIN texels); depth range, biases and texel
  size are the vendor's. Static map = vendor size + 2 × MARGIN (low 2048 → 2560, high 4096 → 4352): a static caster
  lands on the same shadow texels as in the vendor's map, and the view pans MARGIN texels (low: 256 × 2 cm = 5 m) before
  a `pan` re-render. The whole town is 45 × 43 m.
- A second `DirectionalLight` (intensity 0: no light, only a shadow) carries the **dynamic** casters with the vendor's
  per-frame camera (copied from the sun after `_updateSun`), so character shadows are exactly the vendor's. It keeps the
  low tier's every-2nd-frame cadence (`world/shadowCadence.ts`, unchanged).
- Dynamic set: skinned meshes; casters whose `customDepthMaterial` animates with `uTime` (detected by running its
  `onBeforeCompile` on a stub); new casters; any static caster seen changing 3 times within 6 s (crows, cats, swinging
  signs and stall lanterns, a swinging door; promotion is for good). A rare change (a dais state, a cottage fade) only
  re-renders the static map. Changes during the warm-up showcase never promote.
- Casters are split per light by flipping `castShadow` inside each light's `LightShadow.updateMatrices` (three calls it
  per light right before walking the scene), restored after the frame. No scene-graph or layer changes.
- Receivers: a macro appended to three's `shadowmap_pars_fragment` turns every `getShadow(...)` into
  `min(static, dynamic)` when two shadowed directional lights exist (toon.js and the grass's extra tap; the penumbra
  taps map through the texel offset). The outline pass's light-aware sun lookup (`sunLitAt`) gets the same min (its
  material is patched in place). Programs compile once with 2 directional shadows before the warm-up: the program
  count equals the switch-off build in every window (41-52 by scene).

### Numbers (desktop, uncapped)

| low, 960×540 | shadow draws / frame off → on | static renders in a 5 s window | renderAt ms ×1 off → on | renderAt ms ×4 off → on |
|---|---|---|---|---|
| day square | 28.0 → 12.1 | 3-5 | 1.07 → 1.13 | 4.84 → 4.89 |
| dusk (pool lit) | 31.1 → 11.3 | 7-8 | 1.01 → 1.00 | 4.43 → 4.51 |
| night (pool lit) | 25.3 → 10.2 | 1-4 | 1.04 → 1.07 | 5.04 → 5.44 (noisy: base runs 4.48 / 5.32) |
| vote | 39.8 → 17.2 | 4 | 1.41 → 1.42 | 6.73 → 6.48 |

| high, 960×540 | shadow draws / frame off → on | GPU ms ×1 off → on | renderAt ms ×1 off → on | renderAt ms ×4 off → on |
|---|---|---|---|---|
| day square | 92.2 → 30.2 | 0.305 → 0.265 (−13 %) | 1.34 → 1.33 | |
| dusk | 105.3 → 31.3 | 0.316 → 0.274 (−13 %) | 1.23 → 1.21 | |
| night | 79.3 → 23.3 | 0.274 → 0.249 (−9 %) | 1.27 → 1.26 | 5.47 → 5.37 |
| vote | 132.5 → 41.5 | 0.420 → 0.377 (−10 %) | 1.73 → 1.72 | 8.16 → 7.37 |
| house-5 at night | 7.0 → 1.0 | 0.182 → 0.192 | | 0.78 → 0.86 |
| tower room at night | 20.0 → 4.0 | 0.221 → 0.172 | | 0.93 → 0.95 |

- Shadow-pass draws drop 55-70 %. What is left: the dynamic map (characters + 30-45 promoted small props: crows, cats,
  signs, stall lanterns, the bell, dais vote-lamp states) and the occasional static re-render.
- **CPU (renderAt) does not move** beyond noise: the low tier already renders its map every 2nd frame (≈ 0.3 ms of
  issue), and the split adds per-frame work (copying the vendor camera, the signature check over 50-130 static casters,
  a second directional light in every program's uniforms, the `castShadow` flips). Net ≈ 0 at low, 0…−10 % at high ×4.
- **GPU**: −9…−13 % of the frame's GPU time at high on the desktop GPU (the 4096² raster of ~90 casters becomes ~30).
  Laptop iGPU: section 5.
- **Hitch when the sun steps**: a static re-render is one full vendor shadow pass (what every frame cost before) on one
  frame: no hitch beyond today's frame. During the dusk / dawn easing the sun steps often (≈ 1-2 static renders a
  second; 230 `sun` re-renders over a 40 s dusk run), so the split saves less there; by day 0-1 per second.
- Memory: low 86 MB of shadow targets vs 34 MB (2560² + 2048², RGBA8 + depth); high 285 MB vs 134 MB (4352² + 4096²).
  A ¾-extent dynamic map (same texel size, 3072²) would bring high to ≈ 230 MB but drop character shadows near the edge
  of the shadow box (not done).

### Look (frozen stills, low)

| scene | noise floor (2 switch-off loads), texels | shadow on, texels differing | of which > 16 / 255 |
|---|---|---|---|
| day square | 780 (characters) | 1 663 | 1 400 |
| night outdoors (light-rooms) | 0 | 225 | 172 |
| night-15 | 724 (characters) | 719 | 480 |
| house-5 at night | 88 | 130 | 113 |
| tower room | 0 | 23 | 12 |

The extra differences are single shadow-edge texels (seat stones, dais posts, bushes): the static map rasterises the
same triangles in a bigger viewport, and edges passing exactly through texel centres (axis-aligned pixel-art geometry)
flip either way, as the vendor's own map does when the camera pans. 0.02-0.9 % of texels, one texel from the vendor's
edge in the crops checked; visually identical at 1:1.

### Recommendation (item 1)

A **GPU lever (high tier, iGPUs), not a CPU lever**: −55-70 % shadow draws and ≈ −10 % of the frame's GPU time at high on
a desktop GPU, but its bookkeeping eats the CPU saving at low (where the map already renders every 2nd frame). Before
shipping: (a) cheaper signature check (only casters inside the static frustum; skip it while nothing moved),
(b) decide the memory at high (¾-extent dynamic map), (c) the laptop numbers in section 5. It plugs into v33-tiles: the
static map's dirty reasons (sun step, static caster change) are exactly the events that invalidate cached static
tiles, so a tile cache can share the same dirty signal (`installSplitShadows(...).info().reasons` / `invalidate()`).

## 3. Item 2: deferred night light pool

### Design

- Every Point / SpotLight moves to a camera-invisible layer (three gathers only the lights the camera sees; the cpu
  tier's trick). The pool logic (vendor time.js aiming, borrow / dim, carried lanterns) runs unchanged; every program
  compiles with **0 point lights**: no light arrays to flatten / upload, no per-fragment light loop. Programs +1 (the
  pass), constant.
- The normal pass target gets a second colour attachment (three MRT, `count: 2`, same size / format). Built-in fragment
  programs declare `layout(location = 1) out ctAux` and clear it at the top of `main` (chunks
  `clipping_planes_pars_fragment` / `clipping_planes_fragment`); toon programs (they alone define `FLAG_FULL` and
  `toonMid` before `normal_fragment_maps`) write `vec4(toonMid, 1 + uNormalNoise)` (toonMid after the `tones` hook =
  toon.js `toonMid0`; emissive texels such as lit kit glass write 0, the forward formula leaves them alone too). Custom
  ShaderMaterials in the scene are wrapped to clear the aux (else undefined).
- One low-res pass (order 1: before contact 45, fog 50, outline 100) re-applies toon.js's point-light block per pixel:
  view position from depth, normal from the normal pass (+ the same world-noise perturbation), each light's view
  position, colour × intensity, distance, `uPointShape`, `uPointLevels`; lights in three's order (visible-scene
  traversal); dark ones skipped (they add exactly 0 in the forward formula); up to 16. **Off by day** (none lit).

### Numbers (desktop, uncapped)

| | renderAt ms off → on | notes |
|---|---|---|
| low ×1, night | 1.04 → 1.05 | 7 of 8 lights lit |
| low ×4, night (3 runs) | 5.04 → 4.74 (−6 %) | |
| low ×4, dusk | 4.43 → 4.24 (−4 %) | 5 lit |
| low ×4, day (pass off) | 4.84 → 4.81 | 8 dark lights: no measurable upload cost |
| low ×4, vote (day) | 6.73 → 6.32 (noisy) | |
| high ×1, night | 1.27 → 1.22 (−4 %) | 11 of 12 lit |
| high ×4, night / vote | 5.47 → 5.25 / 8.16 → 7.76 | |
| interiors (house-5, tower) ×4 | 0.78 → 0.77 / 0.93 → 0.95 | rooms are 40-80 draws |

fullstack.md estimated the 12-light pool at 15-20 % of render time by day (from the profile's `flatten` and uniform
`upload` shares). Measured end to end, removing 8-12 point lights from every program saves **0-6 % of renderAt** on this
CPU at ×4. The per-fragment loop moves from every lit fragment of the colour pass to one low-res pass over the visible
texels: a GPU saving that only matters on an iGPU (section 5).

### Look (frozen stills, low, against switch-off)

| scene | texels differing | of which > 16 / 255 | mean diff (of 255) |
|---|---|---|---|
| night outdoors (light-rooms) | 5 096 (3.9 %) | 492 | 8 |
| night-15 | 6 800 (5.2 %) | 870 | 9 |
| house-5 at night | 1 515 (1.2 %) | 320 | 10 |
| tower room | 4 031 (3.1 %) | 148 | 6 |
| day (pass off) | 584 | 460 | = the noise floor (characters) |

Lantern pools, their quantised rings, the tower room's candle light and the hearths are reproduced; side by side at 1:1
the stills look the same except on trees / grass next to a lantern. Sources: (1) foliage, trees and grass light at
their **root** (`lightPos: aBase`) in the forward shader, the pass uses the pixel's position (tree crowns next to a
lantern change band: the only > 16 / 255 blobs); (2) `lightNormal` overrides (terrain lips, house-7) are not
reproduced; (3) small numeric differences that the grade pass's ordered dither turns into speckle in the pool rings (a
32-bit target, `ct.debug.v3lightF32=1`, gives the same diff: not precision); (4) water reflections show no pools.
(1) and (2) need a third MRT attachment (lighting normal + root offset).

### Recommendation (item 2)

**Do not ship as is.** It works (constant programs, the exact formula, pools look right), but on a desktop CPU it buys
0-6 % of renderAt at night and nothing by day, against a dependency on toon internals (`toonMid`, `FLAG_FULL`, chunk
injections, MRT on the normal pass) and a visible difference on trees at lanterns. Revisit if the laptop iGPU (section
5) shows a real GPU saving at night, or together with the vendor's MRT colour + normal pass (learnings.md §4.1), which
would make the aux attachment free and the root / light-normal channels cheap. The day frame needs nothing: dark
lights cost nothing measurable.

## 4. Item 3: baked sun / static lighting vs the cached shadow map

| | Cached static shadow map (item 1) | Baked sun + static shadows (vertex colours / lightmap keyframes) |
|---|---|---|
| Resolution | the vendor's shadow texel, exactly (low 2 cm, high 1.2 cm) | vertex colours: one value per vertex, and the town is large flat-shaded quads: a shadow edge across a quad cannot be represented. Lightmap at the shadow texel: the 45 × 43 m ground alone is 2 250 × 2 150 (low) / 3 840 × 3 670 (high) texels, plus walls and roofs, which have no lightmap UVs (procedural vendor geometry) |
| Memory | +52 MB (low) / +150 MB (high), one map | ground only at high: 14 M texels × 4 B = 56 MB per keyframe; walls / roofs ≈ ×2; 8 keyframes ≈ 0.9 GB |
| Time of day | one shadow pass per 0.5° sun step (25-130 draws, one frame) | keyframes blended: hard pixel-art shadows cross-fade into double shadows between keyframes; finer keyframes = more memory |
| Dynamic casters, clouds, penumbra, toon bands | unchanged | characters still need a dynamic map; the bands are a function of L = N·L × shadow × cloud per fragment, so a bake replaces only the shadow tap (1 + 4 penumbra taps on a 480 × 270 target) |
| Work | done (this branch) | an exporter (UV atlas per piece, bake per keyframe, a new texture path in every toon program): vendor-scale |

The per-fragment taps are cheap at the low-res target; the cost a bake would remove is the shadow *pass*, which the
cached map removes too, exactly. **Pick the cached static map.** A bake only makes sense for a fixed time of day.

## 5. Laptop iGPU (Intel Arc integrated, Chrome 143, ANGLE GL)

LAPTOP_GO_HERE

## 6. Risks

- Item 1 patches three's `shadowmap_pars_fragment` chunk globally while a split engine lives (restored on dispose) and
  overrides `LightShadow.updateMatrices` on two lights: a three upgrade must keep `getShadow`'s signature and the
  per-light `updateMatrices` call inside `WebGLShadowMap.render` (r170 does).
- Item 1: a static caster animated only in its shader (not matrices / attributes) without `uTime` in its depth material
  would freeze in the static map. None found.
- Item 1: shadow-target memory at high (+150 MB).
- Item 2 depends on toon internals (`toonMid`, `FLAG_FULL`, `uNormalNoise`, the normal-pass branch) and on three's
  WebGL2 fragment output layout; custom ShaderMaterials added after the build are wrapped within 60 frames (until then
  their aux is undefined).
- e2e with both switches on: `v3-vote` failed once on SwiftShader and passed on the re-run (the first failure's log was
  not kept); with the switches off all three passed.

## 7. Commands run

| Command | Result |
|---|---|
| `CT_AGENT=v33-light scripts/remote.sh sh .v33light/bserve.sh 3490 …`, `CT_AGENT=v33-light-b … 3491` (harness build under the shared heavy lock, then `vite preview`) | ok |
| `CT_AGENT=v33-light-t scripts/remote.sh sh .v33light/check.sh apps/client/test/game3d/light.test.ts` | 1st: 1 fail (`-0` vs `+0` in a modulo assertion; test fixed); then client `tsc` clean, 12 / 12 |
| `CT_AGENT=v33-light-t scripts/remote.sh sh .v33light/check.sh apps/client/test/game3d` | client `tsc --noEmit` clean; 32 files / 428 tests pass |
| `CT_AGENT=v33-light-e E2E_PORT=3492 scripts/v3/e2e.sh v3-boot v3-life v3-vote` (switches off) | 3 / 3 pass |
| same from a scratch copy with the switch defaulting to `all`, E2E_PORT 3493 | v3-boot, v3-life pass; v3-vote failed, then passed on a re-run |
| local drivers (Playwright-core 1.63 + Chromium 1243; scratch only): `drive.mjs`, `perf.sh`, `stills.sh`, `diff.mjs`, `crop.mjs`, `lap.sh` (laptop over CDP) | the numbers above |

The `.v33light/` helper scripts and the drivers are local and untracked.
