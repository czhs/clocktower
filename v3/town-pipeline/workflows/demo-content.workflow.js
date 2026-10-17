export const meta = {
  name: 'demo-content',
  description: 'Demo content round: layout fixes, one piece redo, interior kit -> 3 interior builders, loading screen + cinematic, full roster, house entering; integrate, perf fleet of 3, playtest, fix, ship a static bundle',
  whenToUse: 'After demo-build: to add enterable interiors, an intro, the full character roster, a performance pass and a publishable bundle.',
  phases: [
    { title: 'Content', detail: 'layout lead, piece redo, interior kit -> 3 interior builders, intro/loading, roster, player (walk-through props + house entering)' },
    { title: 'Integrate', detail: 'demo lead wires everything, scripted playtest' },
    { title: 'Performance', detail: 'fleet of 3: renderer/composition, content geometry, runtime/loading' },
    { title: 'Playtest', detail: 'QA + art director' },
    { title: 'Fix', detail: 'owners fix playtest issues' },
    { title: 'Ship', detail: 'local serve + self-contained bundle for a sub-path (e.g. /v3-art-demo/)' },
  ],
}

// -----------------------------------------------------------------------------------------------------------------
// demo-content (PROCESS.md phase 9; the Hollowmere "demo v3" run).
//
// args (object):
//   root            REQUIRED. Absolute path of v3/pixel3d (computed by the caller).
//   source          read-only source game (default root + '/../..'; null = none). Used for v2 interiors / furnishing references.
//   layoutRequests  [string] — the layout lead's user feedback list. Default: the Hollowmere round-6 list below.
//   redoPiece       {id, own, brief} — one piece to redo in this round (default: the treehouse, house-11). null = skip.
//   rosterHint      string — characters the human wants offered (default: every characters/*.js that loads and walks).
//   houseCount      default 15; interiors are built by 3 builders in groups of houseCount/3.
//   subPath         the bundle's public sub-path (default '/v3-art-demo/').
//   demoBind / demoPort   as in demo-build (default 127.0.0.1 / 8090).
//   renderHost / forbiddenHost   labels as in town-build.
// -----------------------------------------------------------------------------------------------------------------

if (!args || !args.root) throw new Error('demo-content: pass args.root = absolute path of v3/pixel3d')
const ROOT = args.root
const CT = args.source === null ? null : (args.source || `${ROOT}/../..`)
const HOST = args.renderHost || 'render-host'
const FORBID = args.forbiddenHost || 'game-host'
const N = args.houseCount || 15
const SUB = args.subPath || '/v3-art-demo/'
const BIND = args.demoBind || '127.0.0.1'
const PORT = args.demoPort || 8090

const CONTEXT = `Project: ${ROOT} — pixel3d (three.js r170 t3ssel8r-style 3D pixel art, plain ES modules, no build step). Read first:
docs/PIPELINE.md, docs/TOWN.md (town contract incl. §11 user requests and §12 layout deltas), docs/DEMO.md (the playable demo: demo.html +
src/demo/*: state store, player, camera, characters, time, ui), docs/CHARACTERS.md + docs/CHARACTER_STATUS.md (character runtime).
The demo works: you walk the town as a character, switch characters, and control time/phase/seats/quality from a panel.
characters/* and src/chars/* may be under active authoring by another session: never edit those, only read them.
${CT ? `The source game ${CT} is READ-ONLY reference (v2 interiors: apps/client/src/game/{TownScene.ts,interior.ts}; layout + furniture:
packages/assets/src/layout.ts houseRoom/furnishHouse; v1 interior art: packages/assets/scripts/*).` : ''}
Where things run: this machine only edits files; everything executes on the GPU render host (${HOST}) via tools/remote.sh, tools/shot.sh,
tools/townpiece.sh and the tools/demo-*.mjs Playwright scripts (never on ${FORBID}, the production game server). LOOK at every screenshot
you rely on. Console/page/shader errors = failure. Deterministic code. No git commits. No raw rm. Never claim anything you did not run and
see. Edit ONLY the files you own; others work in parallel. Put cross-owner needs in contract_requests.`

const DONE = { type: 'object', properties: { summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } },
  screenshots: { type: 'array', items: { type: 'string' } }, contract_requests: { type: 'array', items: { type: 'string' } },
  metrics: { type: 'string', description: 'before/after numbers if relevant' } },
  required: ['summary', 'files', 'screenshots', 'contract_requests'] }
const ISSUES = { type: 'object', properties: { summary: { type: 'string' }, screenshots: { type: 'array', items: { type: 'string' } },
  issues: { type: 'array', items: { type: 'object', properties: { owner: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] },
    problem: { type: 'string' }, fix: { type: 'string' } }, required: ['owner', 'severity', 'problem', 'fix'] } } },
  required: ['summary', 'screenshots', 'issues'] }

const INTERIOR_API = `Interior contract (src/town/interiors/index.js, owned by the interior-kit agent): buildInterior(engine, houseId, ctx) ->
{ group (placed at its own far-away origin, e.g. x = 200 + 30*i, so it never overlaps the town), floor rect + collision rects (furniture),
spawn {x,z,facing} just inside the door, exit {x,z,r} (stepping on it walks you back out to the house's town door), camera preset
{target, viewHeight, yaw} for a cozy cut-away "dollhouse" view (front wall removed), bed + visitPoint (night visits), lights (anchors only:
an interior never creates PointLights; the demo re-aims its constant pool), update?(t) }. Every interior gets the house's own personality
(name, exterior style, the furniture list of the source layout if any) — same toon/outline style as the town. Distinctness rules and lore:
docs/LORE.md if present (template: ${ROOT}/../town-pipeline/templates/lore-skeleton.md).`

const LAYOUT = args.layoutRequests || [
  'The low-centre house (house-9) must move further SOUTH so it fully clears the centre circle by itself (no cut-away needed to see every seat and the plaza kerb), keeping its lane and door working.',
  'Side rows: stagger the side cottages a little in x so both cottages of each side pair AND their entrances can be seen from the gameplay camera without relying on the cut-away; re-route lanes/lawns, keep the ring order; keep the overview uncrowded.',
  'The fountain and the top-right market stall overlap too much: re-space them (and benches/lamps) so each reads on its own.',
  'src/town/layout.js must match every piece\'s real door (no stats.doorMismatch) — layout.js stays the single source.',
  'Mark small props WALK-THROUGH (crates, barrels, sacks, pumpkins, flower pots): a walkable flag in layout.js so they stop blocking obvious paths; big things stay solid.',
]
const REDO = args.redoPiece === null ? null : (args.redoPiece || { id: 'treehouse', own: 'src/town/pieces/house-11.js', brief: `Fernlea Oak (house-11,
the treehouse) reads "a bit blocky". Make it organic: a real gnarled oak trunk (tapered, flared roots, bark ridges, a door in the trunk),
branches that actually hold the cabin, a fuller leaf-clump canopy in the research foliage style (spring greens), a softer cabin silhouette.
Keep the footprint and door working. Render tools/townpiece.sh house-11 and the gameplay camera; look.` })

const AGENTS = {
  layout: { own: 'src/town/{layout,api,town,cutaway,palette,kit}.js, docs/TOWN.md, src/town/pieces/{props,ground}.js (+ minimal door-only edits in piece files, noted)',
    brief: `TOWN LAYOUT LEAD. User feedback to implement (render the gameplay camera before/after for each and look; measure with ?occl=1,
?vis=1 and ?ldx= A/B):
${LAYOUT.map((l, i) => `${i + 1}. ${l}`).join('\n')}
Update the "Layout deltas vs the game" table. Verify with overview + gameplay renders (noon), crawl clean, tools/demo-player.mjs doors + fuzz.` },
  ...(REDO ? { [REDO.id]: { own: REDO.own, brief: REDO.brief } } : {}),
  interiorKit: { own: 'src/town/interiors/index.js, src/town/interiors/kit.js, src/town/interiors/house-*.js (stubs only), scenes/interior.js, docs/INTERIORS.md',
    brief: `INTERIOR KIT. ${INTERIOR_API}
Build (or extend) the kit (walls with windows, floors, rugs, beds, tables, chairs, shelves, fireplace with fire glow, lamps, chests,
plants, wall decor in the town style), index.js, a viewer scene scenes/interior.js (?house=3&tod=night), one complete reference interior
(house-0) and working stubs for the others so the demo can enter any house now. docs/INTERIORS.md documents the contract for the builders.` },
  intro: { own: 'src/demo/intro.js, src/demo/loading.js, src/demo/loading.css, demo.html (loading-screen markup only)',
    brief: `LOADING SCREEN + CINEMATIC. A loading screen styled like the town (dark slate, cream pixel title, an animated pixel-art element),
REAL progress from the town/character build steps, tips. Then a cinematic overview before the player spawns: a texel-snapped camera move
settling into the gameplay camera on the spawn, a title card + "press any key / click to begin" (Esc/click skips; ?intro=0 disables). No
stutter: warm every shader during the loading screen. Hook into src/demo/main.js through events/exports only (the lead wires it).` },
  roster: { own: 'src/demo/characters.js, src/demo/roster.js, src/demo/roster.json, tools/demo-roster.mjs',
    brief: `ROSTER. ${args.rosterHint || 'Offer every characters/*.js that loads and animates (idle + walk at least) without errors.'} Label each
shipped vs work-in-progress (docs/CHARACTER_STATUS.md), shipped first; skip broken ones gracefully with a console note (not an error).
Correct scale for quadrupeds/small creatures, locomotion driven by velocity, live switching that really swaps the model, a portrait per
character for the UI (rendered once at load). Re-runnable roster generation.` },
  player: { own: 'src/demo/player.js, src/demo/collision.js, src/demo/camera.js, src/demo/interior.js',
    brief: `PLAYER + HOUSE ENTERING. (1) Collision: props flagged walkable in layout.js are walk-through; never get stuck on obvious paths;
doors from layout.js. (2) Entering houses${CT ? ` like the source game's v2 (read ${CT}/apps/client/src/game/{TownScene.ts,interior.ts})` : ''}:
walking into a cottage's door (door swings open) fades to its interior; walk inside with collision; the camera switches to the interior
preset; stepping on the exit fades back to the doorstep, facing out. Works for all houses with the stubs. Expose store.location ('town' |
house id) so the UI and time system know.
${INTERIOR_API}` },
}

phase('Content')
const kit = agent(`${CONTEXT}\nYou own ONLY ${AGENTS.interiorKit.own} (+ shots/interiors-kit/).\n${AGENTS.interiorKit.brief}`, { label: 'interior:kit', phase: 'Content', schema: DONE })
const others = Object.keys(AGENTS).filter((k) => k !== 'interiorKit').map((k) => agent(`${CONTEXT}\nYou own ONLY ${AGENTS[k].own} (+ shots/content-${k}/).\n${AGENTS[k].brief}`,
  { label: `content:${k}`, phase: 'Content', schema: DONE }))
const kitDone = await kit
const all = Array.from({ length: N }, (_, i) => i)
const size = Math.ceil(N / 3)
const groups = [all.slice(0, size), all.slice(size, 2 * size), all.slice(2 * size)].filter((g) => g.length)
const interiors = groups.map((g) => agent(`${CONTEXT}
You own ONLY ${g.map((i) => `src/town/interiors/house-${i}.js`).join(', ')} (+ shots/interiors-${g[0]}/). Read docs/INTERIORS.md, docs/LORE.md
(if present) and the reference interior src/town/interiors/house-0.js first. Kit notes: ${kitDone ? kitDone.summary : ''}
${INTERIOR_API}
Design and build the interiors of ${g.filter((i) => i !== 0).map((i) => `house-${i}`).join(', ')}${g.includes(0) ? ' (house-0 is the reference; polish it if needed)' : ''}:
each one unmistakably that house's inside (read its exterior piece file${CT ? ', its v1 house file and the source furnishing list' : ''}), with its OWN room
shape, floor, walls, fireplace position (or none), lighting recipe and one animated ambiance element (do not repeat the kit's standard room),
cozy and gothic, readable at the interior camera, glowing at night. Render scenes/interior.js for each at noon and night plus a 25% line-up
of your rooms next to the others, and look; iterate.`, { label: `interiors:${g[0]}-${g[g.length - 1]}`, phase: 'Content', schema: DONE }))
const content = (await Promise.all([...others, ...interiors])).filter(Boolean)
if (kitDone) content.push(kitDone)

phase('Integrate')
const integ = await agent(`${CONTEXT}
You are the DEMO LEAD: you own demo.html (except the loading markup the intro agent added — keep it), src/demo/{main,api,state,ui,time}.js,
src/demo/ui.css, docs/DEMO.md; small glue edits elsewhere in src/demo/* are OK (note them).
Content reports: ${JSON.stringify(content.map((c) => ({ summary: c.summary, requests: c.contract_requests })))}
Wire everything: loading screen -> cinematic -> spawn; the full roster in the Character panel (shipped first, WIP labelled, portraits);
house entering/exiting with the interiors (Travel panel "enter house N"; time/lights keep working inside with the SAME constant light pool;
night visit point); the new layout. Then extend and run the scripted playtest (tools/demo-play.mjs: loading, intro skip, walk through
walk-through props, enter 3 houses, switch 5 characters, scrub time, ceremony) and fix integration bugs until it passes with no console
errors. Update docs/DEMO.md.`, { label: 'lead:integrate', phase: 'Integrate', schema: DONE })

phase('Performance')
const PERF = {
  render: { own: 'src/core/*, src/post/*, src/materials/toon.js, src/town/{town,api,cutaway}.js', brief: `renderer + composition: fewer draw
calls (merge static geometry across pieces per material, instancing, frustum + shadow-pass culling, cheaper normal pass, skip passes that do
nothing, light count), keep the look pixel-identical where possible (A/B the shrine scene and the town before/after with tools/sheet.py diff).` },
  content: { own: 'src/town/pieces/*.js, src/town/interiors/*.js', brief: `content geometry: biggest triangle/draw-call offenders from the profile
(foliage leaves/cores, grass, heavy houses, interiors), LOD per quality tier (low must CUT geometry), merge per piece, fewer shadow casters;
no visible change at the gameplay camera on high.` },
  runtime: { own: 'src/demo/*.js (not ui.css), src/town/life/*.js, tools/demo-perf*.mjs', brief: `runtime + loading: per-frame JS cost (life
updates, characters, cut-away recompute, UI readouts), zero per-frame allocations, update cadence for distant life, faster load (build
time, lazy interiors, precomputed work, shader warm-up during the loading screen), no hitches on house enter/exit or character switch.` },
}
const perf = (await parallel(Object.keys(PERF).map((k) => () => agent(`${CONTEXT}
PERFORMANCE FLEET (${k}). You own ONLY ${PERF[k].own}. Two other perf agents work in parallel on the other areas.
Goal: the demo must run smoothly on ordinary laptops. First measure a baseline on the render host at the gameplay camera, both quality
tiers, noon and night, square + a side row + inside a house: fps/frame ms (mean, p95, max), draw calls, triangles, programs, JS ms per
frame, load time — plus a laptop proxy (Chrome CPU throttling 4x, 1280x720: tools/demo-perf.mjs --throttle 4, tools/demo-perf-matrix.mjs).
Then optimise: ${PERF[k].brief}
Re-measure after every change, keep a table, don't regress visuals (render before/after stills and diff them). Report before/after metrics.
Benches on a shared host are noisy: run interleaved repeats.`, { label: `perf:${k}`, phase: 'Performance', schema: DONE })))).filter(Boolean)

phase('Playtest')
const OWNERS_LIST = `layout (town layout/props/ground), ${REDO ? `${REDO.id} (${REDO.own}), ` : ''}interiors (src/town/interiors/*), intro (loading + cinematic),
roster (characters), player (movement/collision/entering), lead (demo glue, ui, time), perf (performance)`
const tests = (await parallel([
  ['qa', 'a meticulous QA tester: play everything through the real UI with Playwright (loading, intro, walking incl. through walk-through props and along every lane, entering/exiting every house, switching every character, time scrubbing, phases/ceremony, quality toggles, resize), try to break it, measure fps per tier with the CPU-throttled laptop proxy'],
  ['art', 'a demanding art director for t3ssel8r-style pixel art: the loading screen + cinematic, the new layout, the redone piece, all interiors (25% line-up at noon AND night: can each be told apart?), every character in town (scale, outlines, animation on the texel grid), time-of-day transitions, UI'],
].map(([k, role]) => () => agent(`${CONTEXT}
Do not edit files except shots/content-playtest-${k}/. You are ${role}. Integration notes: ${integ ? integ.summary : ''} Perf notes: ${JSON.stringify(perf.map((p) => p.metrics || p.summary.slice(0, 400)))}
Owners: ${OWNERS_LIST}. Report concrete issues with fixes.`, { label: `playtest:${k}`, phase: 'Playtest', schema: ISSUES })))).filter(Boolean)

phase('Fix')
const OWNFIX = { layout: AGENTS.layout.own, interiors: 'src/town/interiors/*', intro: AGENTS.intro.own,
  roster: AGENTS.roster.own, player: AGENTS.player.own, lead: 'demo.html, src/demo/{main,api,state,ui,time}.js, src/demo/ui.css, docs/DEMO.md',
  perf: 'whatever the perf issue needs, keeping edits minimal and noting every file', ...(REDO ? { [REDO.id]: REDO.own } : {}) }
const by = {}
for (const t of tests) for (const i of t.issues) { const o = OWNFIX[i.owner] ? i.owner : 'lead'; (by[o] = by[o] || []).push(i) }
await parallel(Object.keys(by).map((k) => () => agent(`${CONTEXT}
You own ONLY ${OWNFIX[k]} (other fixers work in parallel). Playtesters found these issues for you (${k}): ${JSON.stringify(by[k], null, 1)}
Fix every one, re-test in the running demo on the render host, look at the screenshots.`, { label: `fix:${k}`, phase: 'Fix', schema: DONE })))

phase('Ship')
const ship = await agent(`${CONTEXT}
You own tools/demo-serve.sh, tools/demo-bundle.sh, tools/demo-bundle-csp.py, tools/demo-smoke.mjs and docs/DEMO.md's "How to open / publish" section.
1) Restart the local demo server on the render host (bound ONLY to ${BIND}:${PORT}, never 0.0.0.0) and run the smoke + scripted playtest
   against it; look at the screenshots.
2) Build the SELF-CONTAINED static bundle with tools/demo-bundle.sh into ${ROOT}/dist/v3-art-demo/ (rsynced back): demo.html as index.html,
   only the files the demo imports (src/**, the used three files), no tools/ shots/ docs/ research/ refs/ (refs are private third-party
   images: never ship them), all URLs RELATIVE so it works under the sub-path ${SUB} of another site. Verify by serving it on the render
   host under ${SUB} (tools/demo-bundle.sh verify) and running the smoke test there. Report total size and file count.
3) Final stills (loading screen, cinematic frame, noon square, night, an interior, 3 characters) and a walk-around GIF in shots/demo-content-final/.
Do NOT publish anywhere public: the human decides that.`, { label: 'ship', phase: 'Ship', schema: DONE })

return { content: content.map((c) => c.summary.slice(0, 300)), integrate: integ && integ.summary, perf: perf.map((p) => p.metrics || p.summary),
  playtest: tests.map((t) => t.summary), ship: ship && { summary: ship.summary, screenshots: ship.screenshots } }
