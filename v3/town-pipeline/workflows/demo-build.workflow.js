export const meta = {
  name: 'demo-build',
  description: 'First playable local demo of a pixel3d town: walk it as a character, switch characters, control time and town state; contract + stubs, owners, integrate, playtest, fix, deploy',
  whenToUse: 'Once a town exists (scenes/town.js renders) and you want demo.html + src/demo/*. The Hollowmere demo already exists in ../pixel3d: use this for a new town or a ground-up rebuild.',
  phases: [
    { title: 'Design', detail: 'demo lead: contract, skeleton page, module stubs' },
    { title: 'Build', detail: 'player/camera, characters, time-of-day, control panel, serve+smoke — one owner each' },
    { title: 'Integrate', detail: 'lead wires everything, scripted playtest' },
    { title: 'Playtest', detail: 'QA driver + art critic play it headless and report' },
    { title: 'Fix', detail: 'owners fix playtest issues' },
    { title: 'Deploy', detail: 'serve on the render host (private address only), final smoke, screenshots + walk GIF' },
  ],
}

// -----------------------------------------------------------------------------------------------------------------
// demo-build (PROCESS.md phase 8).
//
// args (object):
//   root           REQUIRED. Absolute path of v3/pixel3d (computed by the caller).
//   demoBind       Private address the render host serves the demo on (e.g. its tailnet IP). Default: none — the demo is
//                  served on the host's 127.0.0.1 and opened through an ssh tunnel (ssh -L <port>:127.0.0.1:<port> ...).
//                  NEVER 0.0.0.0.
//   demoPort       default 8090.
//   renderHost / forbiddenHost   labels as in town-build (defaults 'render-host' / 'game-host').
//   charactersBusy true (default) if another session is still authoring characters/* and src/chars/* (then read-only).
// -----------------------------------------------------------------------------------------------------------------

if (!args || !args.root) throw new Error('demo-build: pass args.root = absolute path of v3/pixel3d')
const ROOT = args.root
const HOST = args.renderHost || 'render-host'
const FORBID = args.forbiddenHost || 'game-host'
const BIND = args.demoBind || '127.0.0.1'
const PORT = args.demoPort || 8090
const OPEN = args.demoBind ? `http://${BIND}:${PORT}/demo.html (from machines on that private network)`
  : `http://127.0.0.1:${PORT}/demo.html through an ssh tunnel (ssh -L ${PORT}:127.0.0.1:${PORT} <render host>)`
const CHARS = args.charactersBusy === false ? 'characters/* and src/chars/* are stable; still treat them as read-only.'
  : 'ANOTHER session is still authoring characters in characters/* and src/chars/* RIGHT NOW: never edit those files; only read them.'

const CONTEXT = `Project: ${ROOT} — pixel3d, a three.js r170 t3ssel8r-style 3D pixel-art renderer (plain ES modules, no build step; three is
loaded from ./node_modules via the import map in index.html). Two finished tracks you build on (read-only unless you own the file):
(1) the TOWN: docs/TOWN.md (contract, piece API, cameras, layout deltas, quality tier), docs/TOWN_GALLERY.md, src/town/* (layout.js =
collision/doors single source, api.js = cameras/time-of-day presets/registry, town.js = composer buildTown, cutaway.js),
src/town/pieces/*.js, src/town/life/*, scenes/town.js. Use the PIECE's door anchor for walking/door triggers; report any
stats.doorMismatch. (2) the CHARACTER pipeline: docs/CHARACTERS.md (contract + runtime APIs), docs/CHARACTER_STATUS.md (which characters
are shipped), src/chars/*, characters/*.js, scenes/char-stage.js (worked example of spawning + animating a character). ${CHARS}
Never edit src/town/* or src/{core,materials,post,world}/* — if you need a hook there, work around it from your own module and report it
in contract_requests.
GOAL: a playable LOCAL DEMO (demo.html at the repo root + src/demo/*): walk around the town as a character, switch between all completed
characters, control the town's states (continuous clock / time of day, game phase / voting ceremony / seats, bell, quality tier, life
on/off, cut-away, camera). It runs in a normal desktop browser in real time, not only in headless capture mode.
Where things run: this machine only edits files. Everything executes on the GPU render host (${HOST}) via tools/remote.sh / tools/shot.sh
(never on ${FORBID}, the production game server). Headless browser checks: Playwright scripts under tools/demo-* run with tools/remote.sh;
LOOK at every screenshot you rely on. Console/page/shader errors = failure. No git commits. No raw rm. Never claim anything you did not
run and look at.`

const DONE = { type: 'object', properties: { summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } },
  screenshots: { type: 'array', items: { type: 'string' } }, commands_run: { type: 'array', items: { type: 'string' } },
  contract_requests: { type: 'array', items: { type: 'string' } } },
  required: ['summary', 'files', 'screenshots', 'commands_run', 'contract_requests'] }
const ISSUES = { type: 'object', properties: { summary: { type: 'string' }, screenshots: { type: 'array', items: { type: 'string' } },
  issues: { type: 'array', items: { type: 'object', properties: {
    owner: { type: 'string', enum: ['lead', 'player', 'characters', 'time', 'ui', 'deploy'] },
    severity: { type: 'string', enum: ['high', 'medium', 'low'] }, problem: { type: 'string' }, fix: { type: 'string' } },
    required: ['owner', 'severity', 'problem', 'fix'] } } },
  required: ['summary', 'screenshots', 'issues'] }

const OWN = {
  lead: 'demo.html, src/demo/main.js, src/demo/api.js, docs/DEMO.md',
  player: 'src/demo/player.js, src/demo/camera.js, src/demo/collision.js',
  characters: 'src/demo/characters.js, src/demo/roster.js, src/demo/roster.json, tools/demo-roster.mjs',
  time: 'src/demo/time.js, src/demo/state.js',
  ui: 'src/demo/ui.js, src/demo/ui.css',
  deploy: 'tools/demo-serve.sh, tools/demo-serve.mjs, tools/demo-serve.py, tools/demo-smoke.mjs, tools/demo-play.mjs, src/demo/deploy.js',
}
const own = (k) => `You own ONLY ${OWN[k]} (plus shots/demo-${k}/). Other owners work in parallel: never edit their files.`

phase('Design')
const design = await agent(`${CONTEXT}
${own('lead')} (in this phase you may also create stub files for every other owner's path, with the agreed exports, so the page runs end
to end from minute one; the owners then replace them).
You are the DEMO LEAD. Read the town + character contracts and src/main.js (how scenes boot, the engine API). Design:
- demo.html (import map like index.html) booting src/demo/main.js: builds the town via buildTown (import it, do not copy), spawns the
  player character, runs its OWN real-time loop (monotonic t >= 0, frame gap capped) at the gameplay camera, warms shaders behind a boot
  screen, mounts the UI.
- docs/DEMO.md: module contract (exports, events, input bindings, the shared store in src/demo/state.js: timeOfDay hours 0-24, timeSpeed,
  paused, phase day|nomination|vote|execution|night, seats[] {occupied,dead,ghostVote,nominated,onBlock}, quality, life, cutaway, camera
  mode, character id), how each owner hooks in, controls, how to run and serve, and the playtest checklist.
- Stubs for player/characters/time/ui/deploy with the agreed exports.
Get demo.html loading with no console errors on the render host (tools/demo-lead.mjs-style Playwright screenshot after 3 s of real time)
and look at it.`, { label: 'lead:design', phase: 'Design', schema: DONE })
if (!design) throw new Error('design failed')

const BRIEFS = {
  player: `Player controller + camera + collision. WASD/arrow keys relative to the camera and click-to-move; one game walking speed.
Collision against the town layout (layout.js blocked tiles + placed building outlines + props, incl. all layout deltas; doors and door
tiles walkable) so you can't walk through houses, trees, the dais or water. Camera: the town's gameplay preset (yaw 0, ortho,
texel-snapped) following the player smoothly but snapped (no sub-texel crawl), wheel = zoom ladder, Q/E 45° turns, modes follow / free /
overview. Feed the player position to the town's cut-away (focus = player; door-approach zones) and to the life door system so doors
swing as you approach. Expose teleport(x,z).`,
  characters: `Character roster + avatar. Build the list of completed characters dynamically (docs/CHARACTER_STATUS.md shipped list AND the
spec loads without error), generated into src/demo/roster.json by tools/demo-roster.mjs (re-runnable); the page must tolerate a character
failing to load and skip it. Spawn the selected character with the src/chars runtime (autoUpdate false; the player drives it): idle / walk
driven by velocity and facing, correct scale (doors 2 m), toon look and outlines matching the town, shadows. Live switching without
reloading (dispose the old one; program count grows at most once per new character). Report the final roster.`,
  time: `Continuous time of day + town state. A 0-24 h clock that interpolates the town's TOWN_TOD presets (sun direction/colour, sky,
ramps, grade, fog) instead of jumping; lamps and windows on at dusk, off at dawn; tower hands follow the clock; bell on the hour and on
demand. Play/pause, speed, jump to presets. Apply phase changes and seat states to the dais/life APIs (ceremony). Quality tier reload keeps
the player position. PointLights: install a CONSTANT count once and drive intensity (a changing light count recompiles every material);
renderer.info.programs must stay constant across a 24 h cycle. No per-frame allocations.`,
  ui: `Control panel over the canvas (plain DOM, no framework, no external fonts/CDNs; dark slate panel, cream text, collapsible, usable at
1280x720). Sections: Character, Time (clock, slider, play/pause, speed, presets), Town (phase, ceremony, bell, per-seat toggles), Render
(quality, life, cut-away, camera, fps + tris), Travel (go to each house, dais, landmark). Help overlay (H) listing input bindings. All
controls write the shared store; text via textContent (never innerHTML with data).`,
  deploy: `Serving + automated checks. A static server for the repo root (incl. node_modules/three) on the render host bound ONLY to
${BIND}:${PORT} (never 0.0.0.0; check the port is free first; pid file, idempotent restart, log file; never touch other processes).
Open: ${OPEN}. tools/demo-smoke.mjs (Playwright, real time): wait for window.__demo.ready, fail on any console/page/shader error, report
fps / frame ms per quality tier, screenshots. tools/demo-play.mjs: scripted playtest that walks to a few doors with real key events,
switches every roster character, scrubs time noon->night, toggles phases, records screenshots + a GIF (tools/sheet.py gif). window.__demo
automation hooks in src/demo/deploy.js (define live fields with Object.defineProperty).`,
}

phase('Build')
const built = await parallel(Object.keys(BRIEFS).map((k) => () => agent(`${CONTEXT}
${own(k)}
Lead's design notes (read docs/DEMO.md first): ${design.summary}
Your part: ${BRIEFS[k]}
Test your part in the running demo on the render host (Playwright, real time), look at the screenshots, iterate until it works and looks right.`,
  { label: `build:${k}`, phase: 'Build', schema: DONE })))

phase('Integrate')
const integ = await agent(`${CONTEXT}
${own('lead')} — integration lead; you may make small glue edits in other src/demo/* files when owners' pieces don't fit together (note them).
Owner reports: ${JSON.stringify(built.filter(Boolean).map((b) => ({ summary: b.summary, requests: b.contract_requests })))}
Wire everything, resolve contract requests that are yours, run the server and tools/demo-play.mjs, look at every screenshot, and fix
integration bugs until a full scripted playtest (walk, doors, switch every character, scrub time, phases, ceremony, quality toggle) passes
with no console errors. Update docs/DEMO.md (how to open it, controls, the roster, known issues).`, { label: 'lead:integrate', phase: 'Integrate', schema: DONE })

phase('Playtest')
const tests = (await parallel([
  ['qa', 'a meticulous QA tester: play every feature through Playwright (keyboard + clicks on the real UI), try to break it (walk into every wall/house/the water, spam switches, scrub time fast, toggle quality during a ceremony, resize the window), measure fps per tier'],
  ['art', 'a demanding art director for t3ssel8r-style pixel art: the player character in the town (scale, outlines, palette fit, animation on the texel grid, no sub-texel jitter while walking or when the camera follows), the time-of-day transitions, the UI styling'],
].map(([k, role]) => () => agent(`${CONTEXT}
Do not edit files except shots/demo-playtest-${k}/. You are ${role}. Integration notes: ${integ ? integ.summary : ''}
Report concrete issues routed to an owner (${Object.keys(OWN).join(', ')}) with fixes.`, { label: `playtest:${k}`, phase: 'Playtest', schema: ISSUES })))).filter(Boolean)

phase('Fix')
const by = {}
for (const t of tests) for (const i of t.issues) (by[i.owner] = by[i.owner] || []).push(i)
await parallel(Object.keys(by).map((k) => () => agent(`${CONTEXT}
${own(k)}
Playtesters found these issues for you: ${JSON.stringify(by[k], null, 1)}
Fix every one, re-test in the running demo on the render host and look at the screenshots.`, { label: `fix:${k}`, phase: 'Fix', schema: DONE })))

phase('Deploy')
const deploy = await agent(`${CONTEXT}
${own('deploy')} (and docs/DEMO.md's "How to open" section).
Final deploy: (re)start the demo server on ${BIND}:${PORT}, then run tools/demo-smoke.mjs and tools/demo-play.mjs against it (from the render
host itself), look at every screenshot, and produce shots/demo-final/: 4-6 stills (noon, golden, night, ceremony, two characters) and a
walk-around GIF. Confirm the server is bound to ${BIND}:${PORT} only. Return how to open it (${OPEN}), the roster, fps per tier, and how to
stop/restart the server.`, { label: 'deploy:final', phase: 'Deploy', schema: DONE })

return { open: OPEN, design: design.summary, integrate: integ && integ.summary,
  playtest: tests.map((t) => t.summary), deploy: deploy && { summary: deploy.summary, screenshots: deploy.screenshots } }
