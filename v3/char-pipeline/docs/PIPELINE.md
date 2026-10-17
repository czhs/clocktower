# pixel3d — pipeline contract (every agent reads this first)

> **Unattended-run rule (read first):** these runs go overnight with nobody at the keyboard. NEVER run a raw `rm`
> (any `rm`/`rm -f`/`rm -rf`, especially with a `*` glob): it triggers a permission prompt for the user and your agent stalls
> until someone clicks. To clear old renders use `tools/clean.sh shots/<your-dir> ['*.png']` (local + render host, only
> inside shots/ or out/), or simply write into a fresh versioned folder (`shots/<you>/r2/`). Same for other prompt-prone
> commands: no `sudo`, no deleting outside shots/out, no editing files outside the repo.

Goal: reproduce the "3D pixel art" look of t3ssel8r / David Holland in **three.js r170, WebGL2,
plain ES modules, no build step**. Technique reference: `docs/TECHNIQUES.md` (synthesised from
`research/*.md`). Visual targets: `docs/ART_DIRECTION.md`. Integration example that uses every module:
`scenes/_test-all.js`.

## Where things run
- The Mac only edits files. Rendering happens headless on **the render host** (RTX 4090, Chromium via
  Playwright, ANGLE/Vulkan) in `~/pixel3d` (NOT `~/clocktower`; never touch clocktower).
- `tools/shot.sh <scene> shots/<you>/<name>.png [--t 2.5] [--times 0,0.5,1] [--size 1280x720] [--q debug=normal&scale=2] [--bench N]`
  syncs the tree, renders, copies PNGs back. Then **look at them with the Read tool**. It prints page
  errors / shader compile errors (a render with errors is a failed render) and an `info:` line (below).
  `--bench N` renders N more frames with a GPU sync each and prints mean/median/max ms and whether the
  shader-program count changed (it must not: a growing count = a recompile every frame).
- `tools/remote.sh python3 tools/sheet.py sheet|gif|diff ...` for contact sheets, GIFs and pixel diffs;
  `tools/crawl.py frames... --dx a,b --dy a,b --scale 1` for whole-texel pan (crawl) checks
  (outputs go under `shots/`, pull back with `rsync <host>:pixel3d/shots/<you>/ shots/<you>/`).
- No servers, no ports. Never use Math.random()/Date.now() in scene code — use `src/core/noise.js` `rng(seed)`.
- URL params: `scale=<int>|fit` (default `round(innerHeight/360)`; `fit` = non-integer `innerHeight/360`,
  upscaled with t3ssel8r's AA filter), `debug=raw|normal|depth|flags` (raw = scene colour before post),
  `snapScreen=0|1`, `outlineDebug=1` (red = outline, green = edge highlight), `raysDebug=1|2|3+`,
  `waterDebug=reflect|bands`, `shadowOnce=0` (A/B only).
- `info:` line (`window.__pixel.info()`): `low` (internal size), `scale`, `calls`/`tris` for the whole frame,
  `stages` (draw calls per stage: preRender, color, normal, post — the sun shadow map is counted in the
  first stage that renders the scene), `programs`, `geometries`, `textures`, enabled `passes`, `frameMs` (CPU),
  `stats` (free-form numbers a scene puts in `engine.stats`, e.g. build timings).

## Frame structure (src/core)
`engine.renderAt(t)`: scene updaters `fn(t, dt, engine)` → `camera.update()` (texel snap, tracked objects
snapped) → `_updateSun()` (shadow box follows the target, snapped to shadow texels in the light basis and
in 4 m steps along the light) → `pipeline.render()`:
1. `pipeline.preRender[]` hooks (water reflection cameras). The sun's shadow map is rendered **once per
   frame** by the first `renderer.render()` of the frame and reused by every later render (reflection,
   colour, normal). Do not force `shadowMap.needsUpdate` yourself.
2. **Color pass** → `rtScene` (HalfFloat linear colour + float DepthTexture), `uPassMode = 0`. `rtScene.a`:
   ≥ 0.5 for normal surfaces; **< 0.1 = emissive** (additive fireflies write 0): fog (50) and god rays (150)
   leave emissive texels untouched. Every other material must keep writing alpha ≥ 0.5.
3. **Normal pass** → `rtNormal`: `rgb = viewNormal*.5+.5`, `a = outline flag`, `uPassMode = 1`
   (objects on layer `LAYERS.COLOR_ONLY` are skipped — particles, sky, UI-ish things)
4. **Low-res post chain**: `pipeline.addPass({name, order, material, update?(engine), enabled})`, material from
   `pipeline.makeLowresMaterial({fragment, uniforms, defines})` (gets `LOWRES_COMMON` helpers: `linDepth`,
   `viewNormal`, `flagAt`, `worldPos`, `isBackground`, `texel()`, `luma`...). `pipeline.getPass(name)`.
   Orders in use: **fog 50**, **outline 100**, **water 120** (`water-2`… for more bodies), **godrays 150**,
   **grade 200**, **vignette/grain 250**.
5. **Upscale** to the canvas: `pixelScale` default `round(innerHeight/360)` → **640×360 internal** (2 at
   1280×720); render targets are 644×364 (`MARGIN = 2`). Integer scale: the camera's sub-texel offset is
   rounded to whole screen pixels and the lookup is nearest (bit-exact, palette-pure). Non-integer scale:
   t3ssel8r's exact AA formula. `pipeline.upscale.snapScreen = 'auto'|true|false`. After the final pass the
   pipeline calls `camera.afterRender()` (restores objects snapped with `snapObjectToTexel`).

Depth for sprites: grass/flowers/leaves don't write depth (§ material contract), so `tDepth` holds the ground
behind them. Atmosphere passes use sprite-aware depth (`ATMOS_DEPTH_GLSL` / `atmosLinDepth` / `atmosWorldPos`
from `src/post/godrays.js`: a FLAG_NONE texel takes the depth of a clearly nearer FLAG_NONE texel within 24 px,
i.e. the canopy core) — reuse it in any other low-res pass that needs depth on canopies.

## Camera (`src/core/PixelCamera.js`, `engine.camera`)
Orthographic, snapped to the texel grid in camera space (grid anchored at the world origin, rebuilt only
when yaw/pitch change, so a view always rasterises identically).
- `camera.set({target, yaw, pitch, viewHeight, snap})`; `texelWorld` (= `uTexelWorld` = viewHeight/360);
  `offset` (sub-texel remainder); `right`, `up`, `forward`, `targetYaw`, `rotating`, `blockSize`.
- `snapWorld(p)` → copy of p snapped to the texel grid along right/up.
- `snapObjectToTexel(obj, {once=false, enabled=true})` — moving accents (bobbing cube, characters): register
  once; positions may then be set from t or integrated freely; snapped before render, restored after.
- `rotateTo(yaw, duration=0.3, {steps=3, ease='inOutSine', mosaic=0, at, exact=false})`, `rotateBy(n45, duration, opts)`:
  deterministic in `engine.time`, default = 3-pose stop-motion turn ending on an exact 45° stop. Never animate
  yaw by hand. Controls (non-capture): WASD/drag pan, wheel = `ZOOM_LADDER` stops, Q/E = 45° turns, keys 1-5 debug views.
- Grass and trees re-sort their instances when yaw/pitch change (CPU, a few ms per changed frame).

## Engine (`src/core/Engine.js`)
`engine.scene`, `renderer`, `camera`, `pipeline`, `sun` (DirectionalLight, BasicShadowMap, default mapSize
**4096**, bias −0.00002, normalBias 1.5 shadow texels), `shadowExtent`, `uniforms`, `toonUniforms`, `style`,
`stats`, `params`, `time`. `engine.onUpdate(fn(t, dt, engine))`; `engine.setSun({dir, color, intensity, shadowExtent})`.
`engine.style` (written by `applyTimeOfDay`, read every frame by the post passes): `sky` (clear colour,
linear), `sunColor`, `timeOfDay`, `outline {line, rim, rimStrength}`, `grade {...}`, `fog {color}`.

## Material contract (MANDATORY for anything in the scene)
- Use `toonMaterial(engine, opts)` / `toonMesh(engine, geometry, opts, {castShadow, receiveShadow})` from
  `src/materials/toon.js` whenever possible (instancing + three's shadow maps + hooks). Hooks (see the header
  of toon.js): `lightPos, viewVertex, vertex, objectNormal, cutMod, ramp, toneAttributes, tones, albedo,
  normalOverride, lightNormal, normalNoise, unlit, uniforms, vertexHead, fragmentHead`; `outline:
  'full'|'depth'|'edges'|'none'`. Tones: `rampFromTones(hi, mid, sh)` → `{color, ramp}` (sRGB hex in).
  Also exported: `ensureToonUniforms(engine)`, `depthMaterial`, `NOISE_GLSL`, `CLOUD_GLSL`
  (`cloudAtten(wp)`, `cloudDensity(wp)`; needs NOISE_GLSL + uSunDir, uTime, uCloud, uCloudWind), `TOON_LIGHT_GLSL`.
- Any custom ShaderMaterial must declare `uniform int uPassMode;` bound to `engine.uniforms.uPassMode`
  **by reference** and, when `uPassMode == 1`, output `vec4(viewNormal*.5+.5, FLAG)` (or `discard`
  if it must not affect outlines). Import `FLAGS_GLSL` from `src/core/glsl.js`.
- Outline flags: `FLAG_FULL` (default), `FLAG_DEPTH_ONLY`, `FLAG_EDGES_ONLY`, `FLAG_NONE`
  (never draws or receives outlines; acts as a depth-only neighbour), background = 0.
- **Sprite policy** (TECHNIQUES §0.4, adopted): grass, flowers, leaves, reeds are `transparent:true`,
  `depthWrite:false`, **`blending: NoBlending`**, alphaTest 0.5, `outline:'none'` (FLAG_NONE). Canopy cores:
  opaque, FLAG_NONE. Particles: layer `COLOR_ONLY`. Water: a post pass, never a mesh.
- renderOrder of sprite meshes: grass **−10** (one global instanced mesh), bushes 0, tree canopies 1,
  particles 10. Keep new sprite meshes ≥ 0 so they overdraw the grass.
- Shared uniforms live in `engine.uniforms` (uPassMode, uTime, uSunDir, uSunColor, uShadowColor, uAmbient,
  uBands, uCameraPos, uCameraDir, uTexelWorld) and `engine.toonUniforms` (uRampHi/Mid/Sh, uBandThr, uBandSoft,
  uAmbShading, uHemiSky/Ground, uPointLevels, uNoiseScale, uCloud, uCloudWind). Never copy `.value`; attach the object.
- Deterministic: all animation is a pure function of `uTime` / `t` in `engine.onUpdate((t, dt) => …)`.

## Build order in a scene
1. `engine.camera.set({target, yaw, pitch: π/6, viewHeight})` **first** (grass `area:'view'`, tree leaf
   density, the sun direction and the shadow extent all read it).
2. `applyTimeOfDay(engine, tod, {relAz, elev, shadowExtent})`, then `setClouds(...)` if needed.
3. Terrain → props (`scene.add` them; props builders do not add themselves) → rocks → trees → grass (mask
   off props/rocks/trees) → water → particles → `addFog` / `addGodrays` / `addGrade` (any order among those).

## World module APIs (signatures stable; extend with optional opts only)
All option lists are in the header comment of each file; the most used ones are listed here.

**Terrain** (`src/world/terrain.js`)
- `createTerrain(engine, opts)` → `{ mesh, heightAt(x,z), normalAt(x,z), colorAt(x,z), tonesAt(x,z)→{hi,mid,sh},
  zoneAt(x,z), isGrass(x,z), analyticHeightAt(x,z), size, waterLevel, ZONES, zoneTexture, palette }` (mesh already added).
  opts: `size 64, segments, seed, height 4, frequency, center, water {level, shoreBand, wetBand, shore:'sand'|'mud', bounds}
  | waterLevel, terrace, plateaus [{x,z,r,levels,gap,noise}], cliffHeight, flatten [{x,z,r,h,falloff}],
  basins [{x,z,rx,rz,rot,depth,edge}], paths [{points,width,kind:'dirt'|'cobble',noise}], zones [{type:'dirt'|'cobble'|'sand',x,z,r,noise}],
  palette, grassVariation, rockSlope, normalNoise 0.15, zoneRes, cobbleCell, grout, lip`. `ZONES`, `TERRAIN_PALETTE` exported.
- `createRocks(engine, terrain, opts)` → `{ group, items:[{x,z,y,r,kind}], avoid:[{x,z,r}] }` (added).
  opts: `kind 'boulder'|'outcrop', count 12, seed, area {x,z,r}|{x,z,w,h}, size [0.35,1.1], cluster 0.55, pebbles,
  pebbleArea, pebbleSize, palette, pebblePalette, moss 0.45, mossPalette, avoid [{x,z,r}], minSpacing, submerged,
  bury [0.2,0.35], maxSlope 0.8, outline 'full'|'depth'`. Also `rockGeometry`, `ROCK_PALETTE`, `PEBBLE_PALETTE`, `MOSS_PALETTE`.

**Props** (`src/world/props.js`) — each returns a `THREE.Group` (NOT added to the scene) with
`userData.covers(x, z, margin)` (stone footprint mask for grass/scatter). `position` = footprint centre;
with `terrain` the prop is dropped onto the lowest ground under its footprint.
- `createPillar(engine, {height, seed, broken, toppled, width 0.68, position, yaw 0, terrain, plinth, cap, debris, material})` (`userData.height`)
- `createShrine(engine, {radius 3.6, seed, position, terrain, fountain, water, cracks 2, plinthTop, wallTop, floorY -0.3, waterLevel -0.08, wallOuter, wallThickness, footing, bench})`
  (= `createOctagonBasin`); `userData.water = {level, floorY, center, apothem, polygon:[[x,z]..], shape:{kind:'polygon',points}, bounds}`.
  The terrain must be carved below floorY: `basins:[{x,z,rx:2.55,depth:0.7,edge:0.1}]` + `flatten:[{x,z,r:7,h:0}]`.
- `createWall(engine, {length, height, thickness, seed, ruin, position, yaw, terrain, rubble, footing})`,
  `createSteps(engine, {width, count, rise, run, seed, position, yaw, terrain, cheeks, worn})`,
  `createPaving(engine, terrain, {center, radius, seed, kind:'flag'|'cobble', stone, gap, density, falloff, thickness, yaw, lift, tones, patches, exclude(x,z)})`,
  `createLantern(engine, {height, seed, position, yaw, terrain, lit, flicker, light, glowColor})` (`light:true` adds a
  stepped-flicker PointLight: quantized additive toon lighting, no shadows),
  `createSlab(engine, {seed, position, yaw, terrain})`, `createDebris(engine, terrain, {center, radius, count, seed, min, max, around:[{x,z,r}], avoid(x,z)})`,
  `createFallenArch(engine, {from, to, blocks, seed, terrain, size, sweep, side})`, `createGoblet(...)`,
  `stoneMaterial(engine, {tones, patches, outline})`, `STONE`.

**Grass & flowers** (`src/world/grass.js`, `src/world/flowers.js`)
- `createGrass(engine, terrain, opts)` → `{ mesh, meshes, count, material, uniforms, atlas, update(), radius }` (added;
  ONE global InstancedBufferGeometry, 2 draw calls, sorted far→near, re-sorted on yaw/pitch change).
  opts: `area 'view'|{view, margin}|{x0,z0,x1,z1}` (default whole terrain — prefer 'view' or a rect from
  `viewArea(engine, margin)`), `r 0.15, maxCount 80000, seed, mask(x,z), avoid [{x,z,r}], accent 0.03, heights, scale,
  wind {fps 3.5, dir, wave, speed, strength}, flowers true|false|{fraction 0.04, tints, patchScale, patchThreshold, mix, bump, seed},
  only 'flowers', tones(x,z), renderOrder -10, depthBias`.
- `createFlowers(engine, terrain, opts)` (flowers-only field, sorted separately); `FLOWER_TINTS.shrine|pond|glade`.

**Trees** (`src/world/trees.js`) — create AFTER `camera.set` (leaf spacing is in screen texels).
- `createTree(engine, {position, seed, height, kind:'round'|'tall'|'bush'|'pine', radius, palette, outline, add true,
  leafTexels 3.5, leafSpacing, leafJitter, raiseThreshold, maxLeaves 4000, renderOrder})` → `THREE.Group`
  (`userData.tree = {kind, seed, crowns, leaves, height}`); ≤ 4 draw calls per tree. A round tree has ~1.8-2.8k
  leaves at viewHeight 10 (sprites are a fixed pixel size); pass `leafTexels: 4.5` for ~40 % fewer.
- `scatterTrees(engine, terrain, {count, area:{x0,z0,w,h}, minDist, seed, avoid, kind|kinds, heightRange, radiusRange, maxSlopeDeg, treeOpts})` → `Group[]`.
- `treeUniforms(engine)`, `TREE_PALETTES`, `leafAtlas()`.

**Water** (`src/world/water.js`) — a preRender reflection hook + low-res post pass (order 120), never a mesh,
writes nothing to rtNormal.
- `createWater(engine, terrain, {level, bounds | shape:{kind:'rect'|'circle'|'ellipse'|'polygon', ...} | seed:[x,z],
  name, order 120, reflect 0.35, reflection, shallow/mid/deep, opacity, transmit, depthMax 0.9, shoreColor, waveColor,
  sparkleColor, cloudColor, skyColor, wobble, wobbleFps, wave*/waves, sparkle*/sparkles, cloudReflect, cloudShade,
  underOutline, foam, spriteShore 'below'|'all'|'none', debug, shoreWidth, light})`
  → `{ pass, uniforms, material, level, setLevel(y), isWater(x,z), reflectTarget, dispose() }`.
  Shrine basin: `createWater(engine, terrain, {level: w.level, shape:{kind:'polygon', points: w.polygon}, depthMax: 0.3})`.
  Pond: `createWater(engine, terrain, {level, seed:[cx, cz]})`. Each water body costs one extra scene render.

**Particles** (`src/world/particles.js`)
- `createParticles(engine, {kind:'dust'|'fireflies'|'leaves'|'rain', bounds, count, seed, colors, fps, speed, alpha, slant, halo 0|1|2, haloGain, shaftOnly, size, add})`
  → `{ points, material, uniforms, kind, setBounds(b), dispose() }`. Layer COLOR_ONLY, renderOrder 10.
  bounds: `Box3 | {min:[x,y,z],max} | {x0,x1,y0,y1,z0,z1}`. Dust is only visible inside sun shafts (use with god
  rays); fireflies are emissive. Keep particles off water (they get refracted).

**Lighting / sky** (`src/world/sky.js`) — call after `camera.set`.
- `applyTimeOfDay(engine, 'morning'|'noon'|'golden'|'night', {relAz, elev, yaw, shadowExtent, clouds})` → `{dir, preset}`:
  sun (relative to camera yaw), ramp tints, band thresholds, shadow definition, sky colour, shadow-map config,
  and `engine.style.{outline, grade, fog, sunColor, timeOfDay}`.
- `sunDirFor(camYaw, relAzDeg, elevDeg)` (relAz 0 = sun screen-right, +90 = behind the camera, −90 = behind the scene),
  `setClouds(engine, {scale 0.045 (0 = off), cover 0.52 (lower = more cloud), soft, height, wind:[x,z]})`,
  `configureShadows(engine, {extent, mapSize 4096})`, `TIME_PRESETS`.

**Post passes** (`src/post/*.js`). Options left undefined follow `engine.style` every frame; each returns
`set(opts)` to change options later.
- Outline (built in, `src/post/outline.js`, order 100): `applyOutlineStyle(engine, {depthThr, depthThrTexels, slopeTol,
  obliqueBoost, convexThr, tieEps, outlineDark, outlineDesat, outlineTint, outlineShadow, edgeMul, edgeCream, edgeLift,
  edgeShadow, litSoft, useShadowMap, depth, edges, debug, enabled, followStyle})`, `OUTLINE_DEFAULTS`. Silhouette rule:
  two-sided depth prediction, `fwd > thr && rev < -thr/2` (line on the nearer pixel only); convex highlight on the more
  oblique face. Tint/rim follow `engine.style.outline` relative to the noon preset (golden rims orange, night dim blue).
- `addFog(engine, {color, mistTop, mistDepth, mistAmount, mistScale, mistDrift, mistCover, mistShade, mistFps, fogAmount,
  fogNear, fogFar, fogNoise, steps, spriteReach})` → `{pass, uniforms, set}` (order 50; also re-exported from godrays.js).
  Distance fog is measured behind the camera target (subject stays clean).
- `addGodrays(engine, {strength, gap, planes, top, topFade, fade, density|perPlane, levels, maxLevel, falloff, base,
  color|(desat, tint), phase, mistTop, mistDepth, mistBoost, spriteReach, enabled})` → `{pass, uniforms, set}` (order 150).
  Shafts need occluders between the sun and the air; in an open meadow keep strength ≈ 0.2, density ≈ 0.1, falloff ≈ 1.6
  or the air becomes an even haze. Also exports `SUN_LIT_GLSL`, `ATMOS_DEPTH_GLSL`, `shadowUniforms`, `bindShadow`.
- `addGrade(engine, {saturation, contrast, lift, gain, palette:[hex…≤32], paletteStrength, quantize, vignette, grain})`
  → `{grade, vignette, set}` (orders 200, 250). Vignette is banded (4 steps) and screen-anchored; grain is anchored to
  the world texel grid (moves with whole-texel pans).

## File ownership (one owner per file; ask the lead via your final report for anything else)
| owner | files |
|---|---|
| lead | `src/core/Engine.js`, `src/core/glsl.js`, `src/main.js`, `index.html`, `docs/PIPELINE.md`, `tools/remote.sh`, `tools/shot.*`, `scenes/_test-all.js` |
| camera | `src/core/PixelCamera.js`, `src/core/PixelPipeline.js` (final/upscale pass only; keep pass API), `tools/crawl.*`, `scenes/_test-camera.js` |
| outlines | `src/post/outline.js`, `scenes/_test-outline.js` |
| lighting | `src/materials/toon.js` (TOON_LIGHT_GLSL & lighting block; keep options API), `src/world/sky.js`, `src/post/grade.js`, `scenes/_test-lighting.js` |
| terrain | `src/world/terrain.js`, `src/world/rocks.js`, `scenes/_test-terrain.js` |
| props | `src/world/props.js` (ruins, pillars, octagonal basin, walls, steps, paving, lanterns), `scenes/_test-props.js` |
| grass | `src/world/grass.js`, `src/world/flowers.js`, `scenes/_test-grass.js` |
| trees | `src/world/trees.js`, `scenes/_test-trees.js` |
| water | `src/world/water.js`, `scenes/_test-water.js` |
| atmosphere | `src/post/godrays.js`, `src/post/fog.js` (addFog), `src/world/particles.js`, `scenes/_test-atmos.js` |
| scene-* | `scenes/<scene>.js` only |

Shared utilities (`src/core/noise.js`: `rng, noise2, fbm2, poissonDisk2D`) may be extended additively by anyone
(append-only, new exports). If another module is broken mid-run, don't fix it — wait and re-render, or work
around it in your test scene. Shots go to `shots/<owner>/`. Final report: what you built, commands you ran,
honest status, and `CONTRACT-REQUEST:` lines for anything you need from another owner.
