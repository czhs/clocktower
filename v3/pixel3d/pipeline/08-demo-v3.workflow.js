export const meta = {
  name: 'pixel3d-demo-v3',
  description: 'Demo v3: layout fixes, treehouse, 15 house interiors + entering, loading screen + cinematic intro, full character roster, performance fleet, playtest, publishable bundle',
  phases: [
    { title: 'Content', detail: 'layout lead, treehouse, interior kit -> 3 interior builders, intro/loading, roster, player (walk-through props + house entering)' },
    { title: 'Integrate', detail: 'demo lead wires everything, scripted playtest' },
    { title: 'Performance', detail: 'fleet of 3: renderer/composition, content geometry, runtime/loading' },
    { title: 'Playtest', detail: 'QA + art director' },
    { title: 'Fix', detail: 'owners fix playtest issues' },
    { title: 'Ship', detail: 'local serve on the 4090 + self-contained bundle for /v3-art-demo/' },
  ],
}

const ROOT = '~/Desktop/Projects/pixel3d'
const CT = '~/Desktop/pipgws'
const CONTEXT = `Project: ${ROOT} — pixel3d (three.js r170 t3ssel8r-style 3D pixel art, plain ES modules, no build step). Read first:
docs/PIPELINE.md, docs/TOWN.md (town contract incl. §11 user requests and §12 layout deltas), docs/DEMO.md (the playable demo: demo.html +
src/demo/*: state store, player, camera, characters, time, ui), docs/CHARACTERS.md + docs/CHARACTER_STATUS.md (character runtime).
The demo works: you walk Hollowmere as a character, switch characters, and control time/phase/seats/quality from a panel.
ANOTHER Claude session is still authoring characters in characters/* and src/chars/*: never edit those, only read them.
Clocktower game repo ${CT} is READ-ONLY reference (v2 interiors: apps/client/src/game/{TownScene.ts,interior.ts}; layout + furniture:
packages/assets/src/layout.ts houseRoom/furnishHouse; v1 interior art: packages/assets/scripts/*).
Where things run: the Mac only edits files; everything executes on the 4090 (render-host) via tools/remote.sh, tools/shot.sh,
tools/townpiece.sh and the tools/demo-*.mjs Playwright scripts (game-host is forbidden and blocked). LOOK at every screenshot you rely on
with the Read tool. Console/page/shader errors = failure. Deterministic code. No git commits. Never claim anything you did not run and see.
Edit ONLY the files you own; others work in parallel. Put cross-owner needs in contract_requests.`

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
{target, viewHeight, yaw} for a cozy cut-away "dollhouse" view (front wall removed), bed + visitPoint (night visits), lights (window/fire,
night glow), update?(t) }. Every interior gets the house's own personality (name, v1 interior palette + furniture list from layout.ts
furnishHouse, the cottage's exterior style) — the Stargazer's Tower has a telescope/star charts, the Apothecary shelves of potions, the
Clockworks gears and clocks, the Boathouse oars and nets, etc. Same toon/outline style as the town.`

const AGENTS = {
  layout: { own: 'src/town/{layout,api,town,cutaway,palette,kit}.js, docs/TOWN.md, src/town/pieces/{props,ground}.js, src/town/pieces/house-14.js (door only)',
    brief: `TOWN LAYOUT LEAD. User feedback to implement (render the gameplay camera before/after for each and look):
1. The low-centre house (house-9 Gloamend Clockworks) must move further SOUTH so it fully clears the centre circle by itself (no cut-away
   needed to see every seat and the plaza kerb), keeping its lane and door working.
2. Side rows: stagger the side cottages a little left/right (in x) so both cottages of each side pair AND their entrances can be seen from
   the gameplay camera without relying on the cut-away (house-5/6 on the east, house-12/13 on the west, and their neighbours); re-route
   lanes/lawns, keep the ring order. Keep the overview pleasant, not crowded (the west row read as one cluster).
3. The fountain and the top-right market stall overlap too much: re-space them (and benches/lamps) so each reads on its own.
4. Fix house-14's door: src/town/layout.js must match the piece's real door (stats.doorMismatch) — layout.js stays the single source.
5. Mark which small props are WALK-THROUGH (crates, stacked boxes, barrels, sacks, pumpkins, flower pots, small benches if they block a path):
   add a 'walkable' flag in layout.js so they stop blocking obvious paths (player owner reads it); keep big things (houses, fountain, well,
   stalls, trees, dais) solid.
Update the "Layout deltas vs the game" table. Verify with overview + gameplay renders (noon), crawl clean.` },
  treehouse: { own: 'src/town/pieces/house-11.js', brief: `Fernlea Oak (house-11, the treehouse) reads "a bit blocky". Make it organic:
a real gnarled oak trunk (tapered, flared roots, bark ridges, a hollow/door in the trunk), branches that actually hold the cabin, a fuller
leaf-clump canopy in the research foliage style (spring greens), a softer cabin silhouette (rounded/irregular boards, hanging lanterns,
rope ladder or winding stair). Keep the footprint and door working. Render tools/townpiece.sh house-11 and the gameplay camera; look.` },
  interiorKit: { own: 'src/town/interiors/index.js, src/town/interiors/kit.js, src/town/interiors/house-*.js (stubs only), scenes/interior.js, docs/INTERIORS.md',
    brief: `INTERIOR KIT. ${INTERIOR_API}
Build the kit (walls with windows, wooden/stone floors, rugs, beds, tables, chairs, shelves, fireplace with fire glow, lamps, chests, plants,
wall decor — reusable furniture pieces in the town style), index.js, a viewer scene scenes/interior.js (?house=3&tod=night), and one complete
reference interior (house-0 Stargazer's Tower) plus working stubs for the other 14 so the demo can enter any house now. docs/INTERIORS.md
documents the contract for the builders.` },
  intro: { own: 'src/demo/intro.js, src/demo/loading.js, src/demo/loading.css, demo.html (loading-screen markup only)',
    brief: `LOADING SCREEN + CINEMATIC. A proper loading screen with animation (styled like the town: dark slate, cream pixel title "Hollowmere",
an animated pixel-art element e.g. the clock tower silhouette with ticking hands or a lantern flicker, real progress from the town/character
build steps, tips). Then a CINEMATIC OVERVIEW of the town before the player spawns: a smooth, texel-snapped camera move (stop-motion 45° turn
or a slow sweep) from a high overview over the forest and river, past the clock tower, settling into the gameplay camera on the spawn point,
with title card + "press any key / click to begin" (skippable with Esc/click; ?intro=0 to disable). Must not stutter (warm shaders during the
loading screen). Hook into src/demo/main.js through events/exports only (lead wires it).` },
  roster: { own: 'src/demo/characters.js, src/demo/roster.js, src/demo/roster.json, tools/demo-roster.mjs',
    brief: `ROSTER: the user wants the characters the other session is making integrated (mushroom, frog/toad, fox, owl, goat, rabbit, snail, mole,
moth, crow, honk, chonk, green-hood, skeleton-chef, nicksong, … plus the shipped wanderer/keeper/hound/duelist). Include EVERY characters/*.js
that loads and animates (idle + walk at least) without errors; label each shipped vs work-in-progress (from CHARACTER_STATUS.md) and order
shipped first; skip broken ones gracefully with a console note. Correct scale for quadrupeds/small creatures, locomotion driven by velocity,
live switching, a thumbnail/portrait per character for the UI (render once at load). Re-runnable roster generation. Also fix: the earlier
"hound selected" render showed a humanoid avatar — make sure switching really swaps the model.` },
  player: { own: 'src/demo/player.js, src/demo/collision.js, src/demo/camera.js, src/demo/interior.js',
    brief: `PLAYER + HOUSE ENTERING. (1) Collision: small props flagged walkable in layout.js (crates, stacked boxes, barrels, sacks…) are
walk-through; never get stuck on obvious paths; doors from layout.js (house-14 fixed by the layout lead). (2) Entering houses like v2
(read ${CT}/apps/client/src/game/{TownScene.ts,interior.ts}): walking into a cottage's door (door swings open) fades to that house's
interior (src/town/interiors API above), you walk around inside with collision, the camera switches to the interior preset; stepping on the
exit (or pressing down at the door spot) fades back out to the doorstep. Works for all 15 houses with the stubs. Expose state.location
('town' | house id) so the UI and time system know.
${INTERIOR_API}` },
}

phase('Content')
const kit = agent(`${CONTEXT}\nYou own ONLY ${AGENTS.interiorKit.own} (+ shots/interiors-kit/).\n${AGENTS.interiorKit.brief}`, { label: 'interior:kit', phase: 'Content', schema: DONE })
const others = Object.keys(AGENTS).filter((k) => k !== 'interiorKit').map((k) => agent(`${CONTEXT}\nYou own ONLY ${AGENTS[k].own} (+ shots/v3-${k}/).\n${AGENTS[k].brief}`,
  { label: `content:${k}`, phase: 'Content', schema: DONE }))
const kitDone = await kit
const groups = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14]]
const interiors = groups.map((g) => agent(`${CONTEXT}
You own ONLY ${g.map((i) => `src/town/interiors/house-${i}.js`).join(', ')} (+ shots/interiors-${g[0]}/). Read docs/INTERIORS.md and the
reference interior src/town/interiors/house-0.js first. Kit notes: ${kitDone ? kitDone.summary : ''}
${INTERIOR_API}
Design and build the interiors of ${g.filter((i) => i !== 0).map((i) => `house-${i}`).join(', ')}${g.includes(0) ? ' (house-0 exists; polish it if needed)' : ''}:
each one unmistakably that house's inside (read its exterior piece file, its v1 house file, and layout furnishHouse), cozy and gothic,
readable at the interior camera, glowing at night. Render scenes/interior.js for each at noon and night and look; iterate.`,
  { label: `interiors:${g[0]}-${g[g.length - 1]}`, phase: 'Content', schema: DONE }))
const content = (await Promise.all([...others, ...interiors])).filter(Boolean)
if (kitDone) content.push(kitDone)

phase('Integrate')
const integ = await agent(`${CONTEXT}
You are the DEMO LEAD: you own demo.html (except the loading markup the intro agent added — keep it), src/demo/{main,api,state,ui,time}.js,
src/demo/ui.css, docs/DEMO.md; small glue edits elsewhere in src/demo/* are OK (note them).
Content reports: ${JSON.stringify(content.map((c) => ({ summary: c.summary, requests: c.contract_requests })))}
Wire everything: loading screen -> cinematic -> spawn; the full roster in the Character panel (shipped first, WIP labelled, portraits);
house entering/exiting with the interiors (Travel panel: "enter house N"; time/lights keep working inside; night visit point); the new
layout. Then run the scripted playtest (tools/demo-play.mjs, extend it: loading, intro skip, walk through crates, enter 3 houses, switch
5 characters, scrub time, ceremony) on the 4090 and fix integration bugs until it passes with no console errors. Update docs/DEMO.md.`,
  { label: 'lead:integrate', phase: 'Integrate', schema: DONE })

phase('Performance')
const PERF = {
  render: { own: 'src/core/*, src/post/*, src/materials/toon.js, src/town/{town,api,cutaway}.js', brief: `renderer + composition: fewer draw
calls (merge static geometry across pieces per material, instancing, frustum + shadow-pass culling, cheaper normal pass, skip passes that do
nothing, light count), keep the look pixel-identical where possible (A/B the shrine scene and the town before/after with tools/sheet.py diff).` },
  content: { own: 'src/town/pieces/*.js, src/town/interiors/*.js', brief: `content geometry: biggest triangle/draw-call offenders from the profile
(foliage leaves/cores, grass, heavy houses like house-8 logs, house-11 canopy, interiors), LOD per quality tier, merge per piece, fewer
shadow casters; no visible change at the gameplay camera on high.` },
  runtime: { own: 'src/demo/*.js (not ui.css), src/town/life/*.js, tools/demo-*.mjs', brief: `runtime + loading: per-frame JS cost (life
updates, characters, cut-away recompute, UI readouts), zero per-frame allocations, update cadence for distant life, faster load (build
time, lazy interiors, parallel/precomputed work, shader warm-up during the loading screen), no hitches on house enter/exit or character switch.` },
}
const perf = (await parallel(Object.keys(PERF).map((k) => () => agent(`${CONTEXT}
PERFORMANCE FLEET (${k}). You own ONLY ${PERF[k].own}. Two other perf agents work in parallel on the other areas.
Goal: the demo must run smoothly for collaborators on ordinary laptops. First measure a baseline on the 4090 at the gameplay camera, both
quality tiers, noon and night, square + a side row + inside a house: fps/frame ms (mean, p95, max), draw calls, triangles, programs, JS ms per
frame, load time — and a laptop proxy (Chrome CPU throttling 4x via CDP + 1280x720). Then optimise: ${PERF[k].brief}
Re-measure after every change, keep a table, don't regress visuals (render before/after stills and diff them). Report before/after metrics.`,
  { label: `perf:${k}`, phase: 'Performance', schema: DONE })))).filter(Boolean)

phase('Playtest')
const tests = (await parallel([
  ['qa', 'a meticulous QA tester: play everything through the real UI with Playwright (loading, intro, walking incl. through crates and along every lane, entering/exiting every house, switching every character, time scrubbing, phases/ceremony, quality toggles, resize), try to break it, measure fps per tier with the CPU-throttled laptop proxy'],
  ['art', 'a demanding art director for t3ssel8r-style pixel art: the loading screen + cinematic, the new layout (house-9 clear of the circle, staggered side rows, fountain/stall spacing), the treehouse, all 15 interiors, every character in town (scale, outlines, animation on the texel grid), time-of-day transitions, UI'],
].map(([k, role]) => () => agent(`${CONTEXT}
Do not edit files except shots/v3-playtest-${k}/. You are ${role}. Integration notes: ${integ ? integ.summary : ''} Perf notes: ${JSON.stringify(perf.map((p) => p.metrics || p.summary.slice(0, 400)))}
Owners: layout (town layout/props/ground), treehouse (house-11), interiors (src/town/interiors/*), intro (loading + cinematic), roster
(characters), player (movement/collision/entering), lead (demo glue, ui, time), perf (performance). Report concrete issues with fixes.`,
  { label: `playtest:${k}`, phase: 'Playtest', schema: ISSUES })))).filter(Boolean)

phase('Fix')
const OWNFIX = { layout: AGENTS.layout.own, treehouse: AGENTS.treehouse.own, interiors: 'src/town/interiors/*', intro: AGENTS.intro.own,
  roster: AGENTS.roster.own, player: AGENTS.player.own, lead: 'demo.html, src/demo/{main,api,state,ui,time}.js, src/demo/ui.css, docs/DEMO.md',
  perf: 'whatever the perf issue needs, coordinating by keeping edits minimal' }
const by = {}
for (const t of tests) for (const i of t.issues) { const o = OWNFIX[i.owner] ? i.owner : 'lead'; (by[o] = by[o] || []).push(i) }
await parallel(Object.keys(by).map((k) => () => agent(`${CONTEXT}
You own ONLY ${OWNFIX[k]} (other fixers work in parallel). Playtesters found these issues for you (${k}): ${JSON.stringify(by[k], null, 1)}
Fix every one, re-test in the running demo on the 4090, look at the screenshots.`, { label: `fix:${k}`, phase: 'Fix', schema: DONE })))

phase('Ship')
const ship = await agent(`${CONTEXT}
You own tools/demo-serve.sh, tools/demo-bundle.sh, tools/demo-smoke.mjs and docs/DEMO.md's "How to open / publish" section.
1) Restart the local demo server on the 4090 (tools/demo-serve.sh: bound ONLY to its Tailscale IP <tailnet-ip>:8090) and run the smoke +
   scripted playtest against it; look at the screenshots.
2) Build a SELF-CONTAINED static bundle with tools/demo-bundle.sh into ${ROOT}/dist/v3-art-demo/ (on the Mac tree, via rsync back): demo.html
   as index.html, only the files the demo imports (src/**, the used three files from node_modules rewritten via the import map), no tools/
   shots/ docs/ research/ refs/ (refs are private third-party images: never ship them), all URLs RELATIVE so it works when served under the
   sub-path /v3-art-demo/ of another site. Verify by serving dist/ on the 4090 under a /v3-art-demo/ prefix and running the smoke test there.
   Report total size and file count. 3) Final stills (loading screen, cinematic frame, noon square, night, an interior, 3 characters) and a
   walk-around GIF in shots/demo-v3-final/.`, { label: 'ship', phase: 'Ship', schema: DONE })

return { content: content.map((c) => c.summary.slice(0, 300)), integrate: integ && integ.summary, perf: perf.map((p) => p.metrics || p.summary),
  playtest: tests.map((t) => t.summary), ship: ship && { summary: ship.summary, screenshots: ship.screenshots } }
