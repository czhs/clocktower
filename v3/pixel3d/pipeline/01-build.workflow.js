export const meta = {
  name: 'pixel3d-build',
  description: 'Swarm-build the pixel3d modules (camera, outlines, lighting, terrain, props, grass, trees, water, atmosphere), then integrate',
  phases: [
    { title: 'Build modules', detail: '9 module owners in parallel, each verifying with headless renders on render-host (RTX 4090; never render-host, it is the Clocktower server)' },
    { title: 'Integrate', detail: 'lead integrator: contract requests, all test scenes clean, combined smoke scene' },
  ],
}

const ROOT = (args && args.root) || '~/Desktop/Projects/pixel3d'

const RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    summary: { type: 'string', description: '5-10 lines: what you built and how it looks now' },
    files: { type: 'array', items: { type: 'string' } },
    commands_run: { type: 'array', items: { type: 'string' }, description: 'every render/test command you actually ran, with pass/fail' },
    screenshots: { type: 'array', items: { type: 'string' }, description: 'paths under shots/ of your best final renders' },
    contract_requests: { type: 'array', items: { type: 'string' }, description: 'changes you need in files you do not own (owner: request)' },
    known_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'summary', 'files', 'commands_run', 'screenshots', 'contract_requests', 'known_issues'],
}

const PREAMBLE = (owner) => `You are the "${owner}" agent in a swarm building a three.js r170 "3D pixel art" renderer
(t3ssel8r / David Holland style) in ${ROOT}. This is a side project; do not touch any other directory
except the session scratchpad. Work ONLY inside ${ROOT}.

Read before coding: ${ROOT}/docs/PIPELINE.md (contract, file ownership, how to render), your section
of ${ROOT}/docs/TECHNIQUES.md (## ${owner}, plus anything it references), ${ROOT}/docs/ART_DIRECTION.md,
and the existing code in src/. Reference images (third-party, look only — never copy into the repo
outside refs/): ${ROOT}/refs/ (small_pass_04.png and crop_final.png are the t3ssel8r target look;
m1.jpg/m2.jpg bottom rows show the shrine scene; small_water_*.png show water).

Rules:
- Edit only files you own per PIPELINE.md (plus append-only additions to src/core/noise.js).
  Other agents are editing their own files at the same time in the same tree; if a render breaks
  because of someone else's file, wait a minute and retry, or isolate your test scene — never edit theirs.
  Anything you need from others → contract_requests.
- Rendering: cd ${ROOT} && tools/shot.sh <scene> shots/${owner}/<name>.png [--t 2] [--times a,b,c] [--q debug=normal]
  then LOOK at the PNG with the Read tool. Compare against the refs. Iterate until it looks right —
  at least 4 render→look→fix cycles. Page/shader errors printed by shot.sh mean failure.
  Use --q scale=2 at 1280x720 (=640x360 internal) unless testing other scales. Use zoomed crops
  (tools/remote.sh python3 tools/sheet.py ...) or --size 640x360 --q scale=1 to inspect individual pixels.
- Deterministic: no Math.random/Date.now; animation = f(t).
- Do not git commit (the lead commits between phases).
- Keep the public API in PIPELINE.md stable; add options rather than change signatures.
- Make it beautiful, not just correct: the bar is t3ssel8r's screenshots.
- Never claim something works that you did not render and look at. Report every command in commands_run.
`

const MODULES = [
  { owner: 'camera', brief: `Own src/core/PixelCamera.js and the upscale (final) pass in src/core/PixelPipeline.js (keep the pass/RT API).
1) Implement t3ssel8r's exact AA upscale formula (TECHNIQUES ## camera) incl. non-integer scales; keep integer-scale output crisp.
2) Verify texel snapping + subpixel offset sign: render a slow pan (--times with 6+ steps of ~0.3 texel each) and prove static geometry
   never changes shape in low-res space (only shifts) while the on-screen motion is smooth — write tools/crawl.mjs or a python check
   (tools/sheet.py diff) and record numbers. Also produce shots/camera/pan.gif via tools/sheet.py gif.
3) Rotation: re-anchor the snap grid when yaw changes; add camera.rotateTo(yawMultipleOf45, duration) animation that hides crawl
   during rotation (e.g. temporary pixel-size bump or fast transition), and an optional helper snapObjectToTexel(obj) for things that
   move with the camera (TECHNIQUES). 4) Keep keyboard/mouse controls working for interactive viewing (Q/E should rotate by 45° steps).
Test scene: scenes/_test-camera.js (primitives + a grid of thin posts that reveal crawl).` },
  { owner: 'outlines', brief: `Own src/post/outline.js. Implement the t3ssel8r/Holland outline model from TECHNIQUES ## outlines:
1px depth outlines on the NEARER pixel only (predicted-depth-from-normal rule so slopes/grazing ground don't produce false lines),
convex-only edge highlights (Holland cross-product test with the three.js y-flip), placed on one side only, outline colour derived from
the local colour (darkened, hue-shifted toward cool) not black, highlight = lightened/warm, strengths affected by light (lit vs shadow).
Respect FLAGS (none/depth/edges). Expose tunables as uniforms + an applyOutlineStyle(engine, opts) export for scenes.
Test scene scenes/_test-outline.js: stacked offset blocks (like t3ssel8r pillars), stairs, an octagonal ring, spheres, a sloped
ground with a cliff, and grass-flagged geometry. Verify with --size 640x360 --q scale=1 crops that every line is exactly 1px,
no double lines at any edge, no lines on smooth slopes, concave creases unlit.` },
  { owner: 'lighting', brief: `Own src/materials/toon.js (lighting block + TOON_LIGHT_GLSL; keep the options API and uPassMode contract),
src/world/sky.js, src/post/grade.js. Implement TECHNIQUES ## lighting: 3-colour ramp (highlight/mid/shadow) driven by banded light with
shadow folded in, a soft definition term inside shadow, world-space normal noise to break band popping, cloud shadows (world-space
scrolling noise, sun only) via engine.toonUniforms, hemispheric/ambient sky term. sky.js: applyTimeOfDay(engine, 'morning'|'noon'|
'golden'|'night') setting sun dir/colour, ramp, sky clear colour, shadow colour, outline/grade parameters. grade.js: addGrade(engine,
{palette?, quantize?, vignette, grain, saturation, contrast}) low-res pass(es) at order 200/250 incl. optional OKLab palette snap.
Test scene scenes/_test-lighting.js: spheres, boxes, terrain-ish bumps, a tall object casting a long shadow; render all 4 times of day
into a contact sheet. Watch for shadow acne/peter-panning at 640x360 and fix bias settings.` },
  { owner: 'terrain', brief: `Own src/world/terrain.js (replace the stub, KEEP its API) and src/world/rocks.js. Terrain per TECHNIQUES
## terrain: gentle hills + optional plateaus/cliff steps, flatten zones and paths given in opts (e.g. opts.flatten=[{x,z,r,h}],
opts.paths=[{points:[[x,z],...], width}], opts.water={level}), colour zones (grass light/dark variation, dirt path, cobble/paving
zone, sand/mud at shores, rock on steep slopes) with pixel-art-friendly flat colour patches (no smooth gradients; use noise-thresholded
patches). Cliff faces should read as rock with 1px outlines. rocks.js: createRocks(engine, terrain, {count, seed, area, size}) —
chunky faceted rocks/boulders (flat shading, built on 45°-ish facets, purple-grey palette per ART_DIRECTION), half-buried, plus
small pebbles. Test scene scenes/_test-terrain.js.` },
  { owner: 'props', brief: `Own src/world/props.js. Build the shrine architecture kit from ART_DIRECTION/TECHNIQUES: createPillar (stacked,
slightly offset/rotated stone blocks with chipped corners, like t3ssel8r's ruin pillars; broken/toppled variants), createShrine (octagonal
stepped basin/platform with inner fountain pedestal and optional water slot for the water module), createWall (ruined wall segments),
createSteps, createPaving (scattered flat paving stones/cobbles that follow terrain.heightAt), createLantern, fallen blocks/debris.
All via toonMaterial (flat shading, beige/taupe stone ramp from ART_DIRECTION), deterministic seeds, cast/receive shadows, built on 45°
angles so edges render as clean 2:1 pixel lines. Test scene scenes/_test-props.js laid out like the shrine refs (use terrain stub
or a flat plane). Iterate until the pillars read like the refs at 640x360.` },
  { owner: 'grass', brief: `Own src/world/grass.js and src/world/flowers.js. TECHNIQUES ## grass: instanced camera-facing tuft sprites
(procedurally drawn tuft alpha textures via canvas or generated DataTexture — no external images), hard alpha cut-out, each tuft ONE
flat colour computed at its base from terrain.colorAt + terrain normal + shadow/cloud at the base (Holland LIGHT_VERTEX trick: light at
the base world position — you may need to sample three's shadow map at the base; use toonMaterial hooks: vertex/objectNormal/lightNormal,
or a custom ShaderMaterial obeying the uPassMode contract with FLAG_NONE), stepped wind animation (~3-4 fps, position-offset phase),
density so ground is fully covered in grass zones (terrain.isGrass), tuft size ~2-4 low-res px wide at default zoom. Shadow edges on
grass must break into jagged blade shapes like the refs. flowers.js: small flower sprite clusters (lilac/white/yellow) in patches.
Performance: instancing, frustum-independent (one big InstancedMesh or chunked). Test scene scenes/_test-grass.js on the terrain stub
with a few boxes casting shadows.` },
  { owner: 'trees', brief: `Own src/world/trees.js. TECHNIQUES ## trees: t3ssel8r puffy round deciduous trees — trunk + a few branch
cylinders, crown = cluster of 2-5 jagged icospheres used as shadow casters/normal sources, covered with leaf billboard sprites placed at
the sphere vertices / Poisson-disk surface samples, each leaf lit with the crown sphere normal (so the crown reads as lit top / dark
underside with clean bands), procedural leaf-cluster alpha textures, gentle stepped wind sway, outlines around crown silhouette but not
between leaves. Also bushes (small crown, no trunk) and an optional pine variant. createTree(engine,{position,seed,height,kind}),
scatterTrees(engine, terrain, {count, area, minDist, seed, avoid}). Test scene scenes/_test-trees.js: 5-8 trees + bushes on ground,
compare with m1.jpg/m2.jpg/crop_final.png tree look.` },
  { owner: 'water', brief: `Own src/world/water.js. TECHNIQUES ## water: createWater(engine, terrain, {level, bounds|shape}) — ortho planar
reflection via a pipeline.preRender hook (reflection camera mirrored about the water plane, oblique near-plane clipping per the research,
low-res RT same texel grid), refraction (pixel-exact horizontal wobble of what's under the water: render under-water scene color or sample
tScene copy), depth-based colour (shallow→deep using ortho linear depth difference), 1px shoreline highlight where the ground is within
~1 texel depth, animated foam/wave lines (Voronoi-ish, pixel-crisp), interaction with the normal pass (water must not produce outlines
on the underwater terrain; decide flag/discard). Also small water slots (fountain basin) via shape option. Test scene
scenes/_test-water.js: pond in terrain with rocks, a pillar and a tree near shore so reflections are visible.` },
  { owner: 'atmosphere', brief: `Own src/post/godrays.js and src/world/particles.js. TECHNIQUES ## atmosphere: addGodrays(engine, opts)
— fullscreen low-res raymarch (order 150) through world-anchored planes parallel to the sun, testing against three's directional
shadow map (engine.sun.shadow.map.texture + engine.sun.shadow.matrix; note the map's packing/format in r170) and the scene depth, hard
pixel-art edges, banded intensity, tinted by uSunColor; optional mist/height fog. createParticles(engine, {kind: 'dust'|'fireflies'|
'leaves'|'rain', bounds, count, seed}) — pixel-sized sprites (exactly 1-2 texels, snapped to the texel grid, COLOR_ONLY layer so no
outlines), quantized colours, glow for fireflies (small additive halo at low-res). Test scene scenes/_test-atmos.js: a few tall posts
and a canopy slab with holes over the ground so rays stream through; golden + night variants.` },
]

phase('Build modules')
const built = await parallel(MODULES.map((m) => () =>
  agent(`${PREAMBLE(m.owner)}\nYOUR TASK:\n${m.brief}\n\nReturn the structured result.`,
    { label: `build:${m.owner}`, phase: 'Build modules', schema: RESULT })
    .then((r) => r && { owner: m.owner, ...r })))

const ok = built.filter(Boolean)
log(`modules: ${ok.map((r) => `${r.owner}=${r.status}`).join(', ')}`)

phase('Integrate')
const integration = await agent(`${PREAMBLE('lead-integrator')}
You are acting as the LEAD for this phase: you may edit lead-owned files (src/core/Engine.js, src/core/glsl.js, src/main.js,
index.html, docs/PIPELINE.md) and, ONLY to fix integration bugs or apply contract requests, any module file (keep changes minimal and
note each one). The module agents have finished; nobody else is editing now.

Module reports (JSON):
${JSON.stringify(ok, null, 1)}

Tasks:
1) Apply reasonable contract_requests.
2) Render every scenes/_test-*.js and make sure there are zero page/shader errors.
3) Write scenes/_test-all.js that uses EVERY module together (terrain + rocks + props + grass + flowers + trees + water + particles +
   godrays + grade + time of day) and fix whatever breaks when they are combined (e.g. outline flags, normal-pass interactions,
   preRender ordering, uniform collisions, shader recompiles every frame, performance). Report draw calls / triangles from the info line.
4) Update docs/PIPELINE.md API section to match what was actually built (signatures + options).
Return the structured result; put remaining problems per module in known_issues prefixed with the owner.`,
  { label: 'integrate', phase: 'Integrate', schema: RESULT })

return { modules: ok, integration }
