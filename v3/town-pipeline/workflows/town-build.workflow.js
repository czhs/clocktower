export const meta = {
  name: 'town-build',
  description: 'Build (or rebuild) a pixel3d town: foundation lead, one owner per piece (author -> critic -> refine), integrate, town critics, routed fixes, gallery',
  whenToUse: 'A new town from scratch, or a full rebuild of every piece of an existing one. For a single piece use AGENTS.md recipe (a) instead.',
  phases: [
    { title: 'Foundation', detail: 'lead: TOWN contract, layout port, building kit, town + piece scenes with stubs' },
    { title: 'Pieces', detail: 'one owner per piece: author -> art-director critic -> refine' },
    { title: 'Integrate', detail: 'lead composes the whole town, fixes seams, tours it' },
    { title: 'Town critique', detail: 'two art directors score the whole town and route issues' },
    { title: 'Fix', detail: 'owners fix routed issues in parallel' },
    { title: 'Gallery', detail: 'final renders, GIFs, contact sheet, docs/TOWN_GALLERY.md' },
  ],
}

// -----------------------------------------------------------------------------------------------------------------
// town-build: the workflow that built Hollowmere (v3/town-pipeline/PROCESS.md phases 1-5 + 7).
//
// args (object):
//   root           REQUIRED. Absolute path of the engine tree (the repo's v3/pixel3d), computed by the caller,
//                  e.g. `realpath v3/pixel3d`.
//   source         Absolute path of the READ-ONLY source game whose layout + 2D art define the town's identity
//                  (default: root + '/../..', the Clocktower repo that contains v3/). Pass null for a town without
//                  a source game (then the lead invents the layout and the briefs carry the identity).
//   houses         Optional [[name, facing, styleHint], ...] to replace the 15 Hollowmere cottages.
//   extraPieces    Optional [{id, files, brief}] appended to the piece list.
//   skipFoundation true when docs/TOWN.md + kit + stubs already exist (reuses them; the lead summary is read from TOWN.md).
//   renderHost     Label of the GPU render host used by tools/remote.sh (default 'render-host'; the real host comes
//                  from PIXEL3D_HOST in the environment).
//   forbiddenHost  Host that must never be used for renders, e.g. the production game server (default 'game-host').
//
// When to use: a whole-town swarm. Expect ~25-30 agents and many hours. If it dies part-way (usage limits), do NOT
// resume it: collect the failed owners' issues and run town-finish.workflow.js with args.byOwner.
// -----------------------------------------------------------------------------------------------------------------

if (!args || !args.root) throw new Error('town-build: pass args.root = absolute path of v3/pixel3d')
const ROOT = args.root
const CT = args.source === null ? null : (args.source || `${ROOT}/../..`)
const HOST = args.renderHost || 'render-host'
const FORBID = args.forbiddenHost || 'game-host'

const SOURCE = CT ? `Source game (READ ONLY, never edit anything under ${CT}): town layout ${CT}/packages/assets/src/layout.ts, the v1 2D
procedural pixel art in ${CT}/packages/assets/scripts/{buildings,houses/*,props,ground,fx}.ts, product vision ${CT}/docs/vision.md and
in-game screenshots in ${CT}/docs/screenshots/ (look at them). Each v1 cottage is visually distinct with its own architecture, ramp shading
lit from the upper-left, gothic but cozy; the 3D version must keep that identity and the layout while gaining the t3ssel8r look.`
  : `There is no source game: the lead designs the layout and the per-piece briefs carry each building's identity.`

const CONTEXT = `Project: ${ROOT} — pixel3d, a three.js r170 "3D pixel art" renderer (t3ssel8r / David Holland style: 640x360
orthographic texel-snapped camera, 1-texel outlines + cream edge highlights, banded toon light, sprite grass/trees, post water,
god rays, mist). TRACK: build a town (a gothic, cozy village) as a pixel3d scene with complete art control: every building, tree,
prop and animation authored in deterministic code, in the pixel3d style.
Read first: ${ROOT}/docs/PIPELINE.md (frame structure, material contract, module APIs, how to render), ${ROOT}/docs/TECHNIQUES.md,
${ROOT}/docs/ART_DIRECTION.md (palette discipline, rubric), ${ROOT}/docs/TOWN.md (the town contract once the foundation lead has
written it: coordinates, ownership, piece API, TOWN RUBRIC), ${ROOT}/docs/TOWN_LEARNINGS.md (lessons; read your piece's section),
and the research notes in ${ROOT}/research/*.md that matter for your piece. Reference images in ${ROOT}/refs/ if present
(third-party, view only, never copy or redistribute).
${SOURCE}
Where things run: this machine only edits files. Render headless on the GPU render host (${HOST}) through tools/remote.sh,
tools/shot.sh and tools/townpiece.sh (PIPELINE.md, TOWN.md §7) and LOOK at every PNG you rely on with your image-reading tool.
Never render on ${FORBID} (the production game server) and never touch other services on any host. Page/shader errors = failed
render. Deterministic code only (rng(seed) from src/core/noise.js, animation a pure function of t). No git commits. No raw rm
(use tools/clean.sh). Never claim anything you did not render and look at. Other agents work in parallel in the same tree: edit
ONLY files you own. src/{core,materials,post,world}/* and other tracks' files are read-only for every town agent except the
foundation lead, who may make small backward-compatible additions only if truly needed (existing scenes must render identically).`

const DONE = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' }, description: 'paths of the key PNG/GIF renders you looked at' },
    commands_run: { type: 'array', items: { type: 'string' } },
    contract_requests: { type: 'array', items: { type: 'string' }, description: 'changes you need in files you do not own (owner: request)' },
    learnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files', 'screenshots', 'commands_run', 'contract_requests', 'learnings'],
}
const SCORE = {
  type: 'object',
  properties: {
    score: { type: 'number', description: 'total against the TOWN rubric in docs/TOWN.md' },
    max: { type: 'number' },
    per_criterion: { type: 'array', items: { type: 'object', properties: { criterion: { type: 'string' }, score: { type: 'number' }, note: { type: 'string' } }, required: ['criterion', 'score', 'note'] } },
    issues: { type: 'array', items: { type: 'object', properties: {
      owner: { type: 'string', description: 'piece id that must fix it (e.g. house-3, clocktower, dais, foliage, ground, props, life) or lead' },
      severity: { type: 'string', enum: ['high', 'medium', 'low'] }, problem: { type: 'string' }, fix: { type: 'string' } },
      required: ['owner', 'severity', 'problem', 'fix'] } },
    verdict: { type: 'string' },
    screenshots: { type: 'array', items: { type: 'string' } },
  },
  required: ['score', 'max', 'per_criterion', 'issues', 'verdict', 'screenshots'],
}

// ---------------------------------------------------------------- pieces
const HOUSES = args.houses || [
  ['Stargazer’s Tower', 'south', 'slate roof, timber walls, cross gable, chimney right, shutters #6b2f2f, flowers'],
  ['Wychwood Cottage', 'south', 'thatch roof, plaster walls, side ridge, chimney left, shutters #3f5a3a, lantern'],
  ['The Weaver’s House', 'south', 'red roof, brick walls, side ridge, chimney right, shutters #2f3f63, flowers'],
  ['Ravenscroft', 'south', 'plum roof, stone walls, cross gable, chimney left, shutters #7a5a2a, lantern'],
  ['Mossbank Cottage', 'south', 'moss roof, plank walls, side ridge, chimney right, shutters #5b2f4f, flowers'],
  ['Elderhollow Apothecary', 'west', 'blue roof, plaster walls, cross gable, chimney right, shutters #7a3a1e, flowers, lantern'],
  ['The Lantern-maker’s', 'west', 'red roof, timber walls, side ridge, chimney left, shutters #2f4f4f, lantern'],
  ['Toadstool Hollow', 'west', 'slate roof, brick walls, cross gable, no chimney, shutters #6b5a2f, flowers'],
  ['Hearthstone Cabin', 'west', 'thatch roof, timber walls, side ridge, chimney right, shutters #4a2f6b, flowers'],
  ['Gloamend Clockworks', 'south', 'moss roof, stone walls, side ridge, chimney left, shutters #6b2f2f, lantern'],
  ['The Old Boot', 'east', 'plum roof, plaster walls, cross gable, chimney right, shutters #2f5a6b, flowers, lantern'],
  ['Fernlea Oak', 'east', 'blue roof, plank walls, side ridge, chimney right, shutters #7a3a1e, flowers'],
  ['Rookery House', 'east', 'red roof, stone walls, cross gable, chimney left, shutters #3f5a3a, lantern'],
  ['Riverbend Boathouse', 'east', 'slate roof, plank walls, side ridge, chimney left, shutters #5b2f4f, flowers, lantern'],
  ['Millrace Mill', 'south', 'thatch roof, brick walls, cross gable, chimney right, shutters #2f3f63'],
]
const v1 = (i) => CT ? `Read its v1 2D design ${CT}/packages/assets/scripts/houses/house-${i}.ts (and the lib files it uses) and keep its
personality, signature silhouette and details.` : `Invent its architecture from the name and style data; write the identity into your design note.`

const PIECES = [
  ...HOUSES.map(([name, facing, style], i) => ({
    id: `house-${i}`,
    files: `src/town/pieces/house-${i}.js`,
    brief: `Cottage ${i} of the ring of ${HOUSES.length} homes: "${name}". Door facing: ${facing} ('south' = 5x4 footprint, door below;
'east'/'west' = 4x5 footprint, gable end toward the camera, door in the side wall facing the square). Style data: ${style}. ${v1(i)}
The NAME is the brief: make it unmistakably "${name}" — a strong, readable signature shape from the gameplay camera, distinct from all
neighbours. Model walls, roof (courses as real geometry or ramp-shaded relief), trim, windows (glow at night), a hinged door the life
agent can swing via the piece API, chimney anchor, doorstep, small personal dressing inside its own lot. Stay inside the footprint plus
the TOWN.md overhang limits; never block the door tile or the lane. Use the brief template ${ROOT}/../town-pipeline/templates/building-piece-brief.md
in your design note.`,
  })),
  { id: 'clocktower', files: 'src/town/pieces/clocktower.js', brief: `The Clocktower landmark at the top of the ring (not enterable, its top may
run off the top of the map). The town's hero silhouette: tall gothic stone tower, slate spire, big clock face readable from the gameplay
camera with working hour/minute hands driven by the piece API (setTime), a bell in an open belfry that can swing (ring(t)), perch anchors,
glowing face at night.${CT ? ` Look at the v1 clocktower art in ${CT}/packages/assets/scripts/buildings.ts.` : ''}` },
  { id: 'dais', files: 'src/town/pieces/dais.js', brief: `The voting circle / Storyteller's dais in the centre of the circular square (CIRCLE
and PLAZA in layout.js; the paving is the ground owner's). A raised round stone dais (steps, carved rim, lectern / grimoire stand,
braziers/candles) and one seat stone per house around the circle (seat i clockwise from the top), each with a small marker. Expose
setSeat(i, {occupied, dead, ghostVote, nominated, onBlock, voteHand}) and setPhase('day'|'nomination'|'vote'|'execution'|'night'):
braziers flare during a vote, the nominated seat glows, a dead seat goes grey with a ghostly wisp, a vote-sweep light travels the ring.
Iconic and ceremonial, but low enough that players standing on seats stay readable.` },
  { id: 'foliage', files: 'src/town/pieces/foliage.js', brief: `All vegetation: the forest band round the map edge, every tree/bush/stump
object in the layout, hedges, flower patches, mushroom/flower decals that stand up, optional helper exports for buildings. Use
src/world/{trees,grass,flowers}.js (read-only) in the look of the pond/glade gallery scenes (leaf-sprite clumped canopies, banded light,
cream rim, stepped wind; pines as tiered leaf clumps, not cones). Keep the SOUTH rim low (TOWN.md §6). Must stay cheap: merge/instance,
report calls and --bench.` },
  { id: 'ground', files: 'src/town/pieces/ground.js', brief: `The ground: terrain from the layout grid, cobbled lanes to every door, the
circular plaza paving with its stone ring, the dirt cart road, grass/forest floor, any water (pixel3d post pass, src/world/water.js),
bridges, kerbs and edge transitions so tiles never read as a grid. The camera must never see a world edge: extend believable terrain past
the map. Town floor flat at y = 0. Publish api.heightAt / api.terrain / api.clear(x,z) for other pieces.` },
  { id: 'props', files: 'src/town/pieces/props.js', brief: `All street furniture and dressing from the layout that is not vegetation or a
building (streetlamps with light anchors, fountain with water, well, market stalls, benches, barrels, crates, cart, signpost,
noticeboard ...). Each reads instantly at the gameplay camera, matches the town palette, and exposes anchors for the life agent.
Merge per material, instance repeats.` },
  { id: 'life', files: 'src/town/life/*.js, scenes/town-life.js', brief: `The animation layer, driven only through the piece APIs/anchors in
docs/TOWN.md: doors that swing (stepped, anticipation + overshoot) as walkers approach, chimney smoke, window glow + lamp flicker at
night, fountain water, awnings and banners in the wind, crows on roofs, cats, fireflies and moths at night, the clock striking (bell
swing + crows scatter), a day -> dusk -> night cycle helper, a voting-ceremony demo on the dais, 2-4 walking villagers on the lanes
(src/chars, read-only). scenes/town-life.js is a deterministic, ?t= scrubbable showcase; render loop GIFs. Stepped poses on the texel
grid (camera.snapObjectToTexel), program count constant.` },
  ...(args.extraPieces || []),
]
const OWNED = PIECES.map((p) => `${p.id}: ${p.files}`).join('\n')

// ---------------------------------------------------------------- foundation
let foundation
if (args.skipFoundation) {
  foundation = { summary: `Foundation exists: docs/TOWN.md, src/town/{layout,kit,api,town,palette,cutaway}.js, stubs, tools/town*. Read TOWN.md §7 and §12.` }
} else {
  phase('Foundation')
  foundation = await agent(`${CONTEXT}
You are the TOWN FOUNDATION LEAD. Build the foundation so ${PIECES.length} piece owners can work in parallel without touching each other's
files. You own docs/TOWN.md, src/town/{layout,kit,town,api,palette}.js (and any other src/town/*.js that is not a piece file),
scenes/town.js, scenes/town-piece.js and tools/town*.{sh,mjs,py}. If some of these exist already, extend them; keep their APIs.
1. Layout data in src/town/layout.js: ground grid, all town objects with sizes/collision, the houses (footprint, door, facing, style,
   name) and the landmark, PLAZA, CIRCLE, streetlights, decals.${CT ? ' Port faithfully from the source layout (read it; never run anything in the source repo).' : ''}
   Coordinates: 1 tile = 1 m, world x = tile x, world z = tile y, y up; the 2D map's screen-up is world -z, so "south" faces +z.
2. Cameras: orthographic pitch pi/6; 'gameplay' (yaw 0, viewHeight so the whole circular square fits on 640x360 with a little margin),
   'overview' (whole map), 'iso' (yaw pi/4). Document them.
3. src/town/kit.js: a shared building kit on toonMesh/toonMaterial (Builder -> one merged mesh per material layer; walls with 1-px
   procedural patterns, gable/hip roofs with stepped courses, windows with an emissive night-glow layer obeying the rtScene alpha < 0.1
   emissive rule, hinged doors, chimneys with smoke anchors, steps, flower boxes, lanterns with light anchors). Small, commented.
4. src/town/api.js + the piece API in docs/TOWN.md: build(engine, ctx) -> { group, update?(t, dt), anchors: { doors:[{id, pivot, open(f)}],
   chimneys, windows, lights:[{pos, color, r, kind}], perches, seats, spots }, api, stats }. ctx: layout, heightAt, record, rng, tod,
   params, registry. Write a STUB for every piece so the composed town renders from minute one (owners replace them):
${OWNED}
5. scenes/town.js composes everything (ground -> props -> houses -> landmark -> dais -> foliage -> life; ?tod= ?cam= ?focus=<id|x,z>
   ?pieces= ?life=0 ?strict=<id>; a failing piece becomes a grey box with console.warn) and scenes/town-piece.js renders one piece on a
   pad (?piece=&yaw=&tod=). tools/townpiece.sh <piece> <outdir>: 4 isolated yaws (noon) + gameplay camera focused on it (noon + night)
   + a 1x crop + sheet.png + report.txt (calls, tris, build ms, errors).
6. docs/TOWN.md: coordinates, cameras, a town palette table (ramps per material, roof kinds, ground, foliage, night) reconciled with
   ART_DIRECTION's palette discipline${CT ? ' and sampled from the source art' : ''}, time-of-day presets, scale rules (doors 2 m, character ~1.4 m,
   eaves; the square must stay readable), performance budget per piece, ownership, the piece API, how to render, an empty §11 "Notes from
   the user" section, and the TOWN RUBRIC (12 criteria x 0-2, ship bar 19/24; copy ${ROOT}/../town-pipeline/templates/critic-rubric.md).
Render scenes/town.js at gameplay/overview/iso, noon and night, and scenes/town-piece.js for a couple of stubs; look; fix until zero errors.
Report the exact commands piece owners should run.`, { label: 'lead:foundation', phase: 'Foundation', schema: DONE })
  if (!foundation) throw new Error('foundation failed')
}
log(`foundation: ${foundation.summary.slice(0, 300)}`)

// ---------------------------------------------------------------- pieces
const own = (p) => `You own ONLY ${p.files} and shots/town-${p.id}/ (plus append-only docs/TOWN_LEARNINGS.md). Replace the lead's stub.
Everything else is read-only; if the kit/API/layout blocks you, work around it in your own file and list the change in contract_requests.
Foundation notes from the lead: ${foundation.summary}`

const critic = (p, built) => agent(`${CONTEXT}
You are a demanding ART DIRECTOR for the town (t3ssel8r 3D pixel art${CT ? ' + the charm of the source game\'s 2D art' : ''}). Do not edit files
except shots/critic-${p.id}/. Critique piece "${p.id}" (${p.files}). Brief: ${p.brief}
Author's report: ${JSON.stringify({ summary: built && built.summary, screenshots: built && built.screenshots })}
Render it yourself with tools/townpiece.sh ${p.id} shots/critic-${p.id} plus extra renders: a whole-texel pan crawl check
(tools/towncrawl.sh --pieces ${p.id}), 1x crops, night, the gameplay camera in context, and for animated pieces frames / a GIF.
Score each criterion of the TOWN RUBRIC in docs/TOWN.md 0-2 with concrete notes (pixel locations in 1280x720). List every issue with a
concrete fix; owner '${p.id}' for anything in the piece, another piece id or 'lead' for problems elsewhere.`, { label: `critic:${p.id}`, phase: 'Pieces', schema: SCORE })

phase('Pieces')
const pieces = await pipeline(PIECES,
  (p) => agent(`${CONTEXT}
${own(p)}
Your piece: "${p.id}". Brief: ${p.brief}
Process: (1) study the source/brief and the TOWN_LEARNINGS.md lessons for similar pieces; render tools/townpiece.sh ${p.id} shots/town-${p.id}/r0
and LOOK at ctx-noon.png first (who stands between your front and the camera at yaw 0?); write a short design note at the top of your file
(signature shape, palette rows from docs/TOWN.md, key details, what it must read as at 640x360, a height plan per local z). (2) Blockout ->
render in isolation and in context -> look. (3) Model, materials, details; iterate render -> look -> fix at least 4 times, checking the
gameplay camera, a 1x crop, night, doors=1&tod=night close up, and a whole-texel pan. (4) Fill the piece API/anchors exactly as
docs/TOWN.md specifies. (5) --bench and stay inside the budget. Finish with tools/townpiece.sh ${p.id} shots/town-${p.id} and look at the
sheet. Append lessons to docs/TOWN_LEARNINGS.md. Iterate until you believe it scores >= 19/24 on the TOWN rubric.`, { label: `author:${p.id}`, phase: 'Pieces', schema: DONE }),
  (built, p) => critic(p, built).then((c) => ({ built, c })),
  (s, p) => agent(`${CONTEXT}
${own(p)}
You authored "${p.id}" (brief: ${p.brief}). The art director scored it ${s.c ? s.c.score + '/' + s.c.max : '?'}:
${JSON.stringify(s.c || {}, null, 1)}
Fix every issue with owner '${p.id}' (all severities), re-render each fix and look at it, rerun tools/townpiece.sh ${p.id} shots/town-${p.id}.
Issues owned by others: list them in contract_requests. Append new lessons to docs/TOWN_LEARNINGS.md.`, { label: `refine:${p.id}`, phase: 'Pieces', schema: DONE })
    .then((refined) => ({ id: p.id, ...s, refined })),
)
const done = pieces.filter(Boolean)
log(done.map((r) => `${r.id}: ${r.c ? r.c.score : '?'}`).join(' | '))
const dropped = PIECES.filter((p) => !done.find((r) => r.id === p.id)).map((p) => p.id)
if (dropped.length) log(`pieces that did not finish (re-run them with town-finish or by hand): ${dropped.join(', ')}`)

// ---------------------------------------------------------------- integrate
phase('Integrate')
const requests = done.flatMap((r) => [
  ...((r.built && r.built.contract_requests) || []), ...((r.refined && r.refined.contract_requests) || []),
  ...((r.c && r.c.issues) || []).filter((i) => i.owner !== r.id).map((i) => `${i.owner} (${i.severity}): ${i.problem} -> ${i.fix}`),
].map((x) => `[from ${r.id}] ${x}`))
const integ = await agent(`${CONTEXT}
You are the TOWN LEAD again (you own docs/TOWN.md, src/town/ non-piece files, scenes/town.js, scenes/town-piece.js, tools/town*).
${done.length} pieces are authored and individually critiqued. Compose the whole town and make it work as one place. Resolve these
contract requests / cross-owner issues that are yours (kit, API, layout, composition, camera, time of day, shared light, performance):
${JSON.stringify(requests, null, 1)}
Occlusion is the usual integration problem at a 30° camera (things south of a building hide it; side rows stack): you may move/turn whole
piece groups (record every change in a "Layout deltas vs the game" table in TOWN.md and keep layout.js the single source), and/or add a
camera-aware cut-away with clean outlined edges (see the existing src/town/cutaway.js if present). Then render the integration set
(tools/townshots.sh shots/lead-integrate --set integration), a whole-texel pan crawl (tools/towncrawl.sh) and --bench for the full town.
Look at every frame. Fix seams between pieces where they are yours; for the rest write precise issues. Write what changed into TOWN.md §12.
Return in summary the issues per owner you could not fix.`, { label: 'lead:integrate', phase: 'Integrate', schema: DONE })

// ---------------------------------------------------------------- town critique
phase('Town critique')
const lenses = [
  ['architecture', 'the cottages + landmark + dais as a set: identity, distinctness, cohesion, scale, silhouettes and doors from the gameplay camera, occlusion between pieces, faithfulness to the layout'],
  ['environment-life', 'ground, foliage, props, lighting, time of day, night, atmosphere, animation/interaction quality (GIFs of scenes/town-life.js and the town with life on), crawl/shimmer, performance and quality tiers'],
]
const townCrit = (await parallel(lenses.map(([k, lens]) => () => agent(`${CONTEXT}
You are a demanding ART DIRECTOR reviewing the WHOLE town, lens: ${lens}. Do not edit files except shots/town-critic-${k}/.
Lead's integration report: ${JSON.stringify(integ ? { summary: integ.summary, screenshots: integ.screenshots } : {})}
Render scenes/town.js and scenes/town-life.js yourself (all camera presets, noon/golden/night, the gameplay camera focused on every
cottage, GIFs for motion) and look at everything. Score the TOWN RUBRIC for the town as a whole; also score docs/TOWN.md §11 (user notes).
Route issues to the owning piece id (${PIECES.map((p) => p.id).join(', ')}) or 'lead', with concrete fixes. Prioritise what most improves
the town for a player walking around the square.`, { label: `town-critic:${k}`, phase: 'Town critique', schema: SCORE })))).filter(Boolean)
log(townCrit.map((c) => `${c.score}/${c.max}`).join(' , '))

// ---------------------------------------------------------------- fix
phase('Fix')
const byOwner = {}
for (const c of townCrit) for (const i of c.issues) (byOwner[i.owner] = byOwner[i.owner] || []).push(i)
const unknown = Object.keys(byOwner).filter((o) => o !== 'lead' && !PIECES.find((p) => p.id === o))
if (unknown.length) { log(`issues for unknown owners routed to lead: ${unknown.join(', ')}`); for (const o of unknown) { byOwner.lead = [...(byOwner.lead || []), ...byOwner[o]]; delete byOwner[o] } }
const fixOwners = Object.keys(byOwner).filter((o) => o !== 'lead')
const fixes = await parallel([
  ...fixOwners.map((o) => () => {
    const p = PIECES.find((x) => x.id === o)
    return agent(`${CONTEXT}
${own(p)}
Town-level critique routed these issues to you ("${p.id}"):
${JSON.stringify(byOwner[o], null, 1)}
Lead's integration notes (may mention you): ${integ ? integ.summary : ''}
Fix every one, re-render in context (scenes/town.js with ?focus=${p.id}) and isolation, look at each, rerun tools/townpiece.sh ${p.id} shots/town-${p.id}.`, { label: `fix:${p.id}`, phase: 'Fix', schema: DONE })
  }),
  () => agent(`${CONTEXT}
You are the TOWN LEAD (your files only). Town critique issues routed to 'lead': ${JSON.stringify(byOwner.lead || [], null, 1)}
Fix them, re-render the town and look. Owners are fixing their own issues in parallel; do not edit piece files.`, { label: 'fix:lead', phase: 'Fix', schema: DONE }),
])
const failedFix = [...fixOwners.filter((o, i) => !fixes[i]), ...(fixes[fixOwners.length] ? [] : ['lead'])].filter((o) => byOwner[o] && byOwner[o].length)
if (failedFix.length) log(`fixers that returned nothing (rerun with town-finish args.byOwner): ${failedFix.join(', ')}`)

// ---------------------------------------------------------------- gallery
phase('Gallery')
const gallery = await agent(`${CONTEXT}
You are the GALLERY agent (you own docs/TOWN_GALLERY.md and shots/town-gallery/). Render the final town: overview noon / golden / night,
iso, gameplay camera at 6 spots around the square (noon and night), each building's turntable sheet (tools/townpiece.sh), loop GIFs of
scenes/town-life.js (doors, smoke, crows, clock strike, voting ceremony, dusk->night), both quality tiers with --bench 60, and a contact
sheet. Look at everything. Write docs/TOWN_GALLERY.md: what was built (piece table, score history ${JSON.stringify(done.map((r) => ({ id: r.id, piece: r.c && r.c.score })))},
town scores ${JSON.stringify(townCrit.map((c) => c.score + '/' + c.max))}), how to view it, the commands you ran, performance numbers, and
honest known flaws.`, { label: 'gallery', phase: 'Gallery', schema: DONE })

return {
  foundation: foundation.summary,
  pieces: done.map((r) => ({ id: r.id, score: r.c && r.c.score, max: r.c && r.c.max, verdict: r.c && r.c.verdict })),
  dropped,
  integrate: integ && integ.summary,
  town: townCrit.map((c) => ({ score: c.score, max: c.max, verdict: c.verdict })),
  unfinishedFixers: Object.fromEntries(failedFix.map((o) => [o, byOwner[o]])),
  gallery: gallery && { summary: gallery.summary, screenshots: gallery.screenshots },
}
