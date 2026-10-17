export const meta = {
  name: 'pixel3d-town-demo',
  description: 'Playable local demo of the pixel3d town: walk around as any completed character, switch characters, control time and town state; served from the 4090',
  phases: [
    { title: 'Design', detail: 'demo lead: contract, skeleton page, module stubs' },
    { title: 'Build', detail: 'player/camera, characters, time-of-day, control panel, serve+smoke — one owner each' },
    { title: 'Integrate', detail: 'lead wires everything, scripted playtest' },
    { title: 'Playtest', detail: 'QA driver + art critic play it headless and report' },
    { title: 'Fix', detail: 'owners fix playtest issues' },
    { title: 'Deploy', detail: 'serve on the 4090 (Tailscale), final smoke, screenshots + walk GIF' },
  ],
}

const ROOT = '~/Desktop/Projects/pixel3d'
const HOST_IP = '<tailnet-ip>'
const PORT = 8090
const CONTEXT = `Project: ${ROOT} — pixel3d, a three.js r170 t3ssel8r-style 3D pixel-art renderer (plain ES modules, no build step; three is
loaded from ./node_modules via the import map in index.html). Two finished tracks you build on (read-only unless you own the file):
(1) the TOWN "Hollowmere": docs/TOWN.md (contract, piece API, cameras, layout deltas, quality tier), docs/TOWN_GALLERY.md, src/town/*
(layout.js = collision/doors single source, api.js = cameras/time-of-day presets/registry, town.js = composer, cutaway.js),
src/town/pieces/*.js, src/town/life/* (doors, smoke, crows, townsfolk, ceremony), scenes/town.js;
(2) the CHARACTER pipeline: docs/CHARACTERS.md (contract + runtime APIs), docs/CHARACTER_STATUS.md (which characters are shipped/complete),
docs/CHARACTER_PLAYBOOK.md, src/chars/* (rig, locomotion, anim, look, character runtime), characters/*.js (one spec per character),
scenes/char-stage.js (worked example of spawning + animating a character). ANOTHER Claude session is still authoring new characters in
characters/* and src/chars/* RIGHT NOW: never edit those files; only read them. Also never edit src/town/* or src/{core,materials,post,world}/*
— if you need a hook there, work around it from your own module and report it in contract_requests.
GOAL: a playable LOCAL DEMO page (demo.html at the repo root + src/demo/*): the user walks around the town as a character, can switch between
all COMPLETED characters, and controls the town's states (time of day incl. a continuous clock, game phase / voting ceremony / seats,
bell, quality tier, life on/off, cut-away, camera). It runs in a normal desktop browser in real time (not only the headless capture mode).
Where things run: the Mac only edits files. Everything executes on the 4090 (ssh alias render-host) via tools/remote.sh / tools/shot.sh
(game-host is forbidden and blocked). Headless browser checks: write Playwright scripts under tools/demo-* and run them with tools/remote.sh;
LOOK at every screenshot you rely on with the Read tool. Console/page/shader errors = failure. No git commits. Never claim anything you
did not run and look at.`

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
  characters: 'src/demo/characters.js, src/demo/roster.js, tools/demo-roster.mjs',
  time: 'src/demo/time.js, src/demo/state.js',
  ui: 'src/demo/ui.js, src/demo/ui.css',
  deploy: 'tools/demo-serve.sh, tools/demo-smoke.mjs, tools/demo-play.mjs, tools/demo-*.py',
}
const own = (k) => `You own ONLY ${OWN[k]} (plus shots/demo-${k}/). Other owners work in parallel: never edit their files.`

phase('Design')
const design = await agent(`${CONTEXT}
${own('lead')} (in this phase you may also create EMPTY stub files for every other owner's path, with the agreed exports, so the page
runs end to end from minute one; the owners then replace them).
You are the DEMO LEAD. Read the town + character contracts and src/main.js (how scenes boot, real-time loop, engine API). Design:
- demo.html (import map like index.html) booting src/demo/main.js: builds the town via the town composer (reuse buildTown / scenes/town.js
  logic by importing, not copying), spawns the player character, runs the real-time loop at the gameplay camera, mounts the UI.
- docs/DEMO.md: module contract (exports, events, the shared state object in src/demo/state.js: timeOfDay hours 0-24, timeSpeed, paused,
  phase day|nomination|vote|execution|night, seats[15] {occupied,dead,ghostVote,nominated,onBlock}, quality, life, cutaway, camera mode,
  character id), how each owner hooks in, controls/keybindings, how to run and serve, and the playtest checklist.
- Stubs for player/characters/time/ui/deploy with the agreed exports.
Get demo.html loading with no console errors on the 4090 (Playwright screenshot after 3 s of real time) and look at it.`,
  { label: 'lead:design', phase: 'Design', schema: DONE })
if (!design) throw new Error('design failed')

const BRIEFS = {
  player: `Player controller + camera + collision. WASD/arrow keys (8 directions) and click/tap-to-move along a simple grid path, Shift to run;
movement speed similar to the game (brisk). Collision against the town layout (src/town/layout.js blocked tiles + building footprints +
props, including all layout deltas — doors and their tiles must be walkable) so you can't walk through houses, trees, the dais or water.
Camera: the town's gameplay preset (yaw 0, ortho, texel-snapped) following the player smoothly but snapped (no sub-texel crawl), mouse
wheel = zoom ladder, Q/E 45° turns (optional), modes follow / free-pan / overview. Feed the player position to the town's cut-away focus so
the cottage you stand in front of stays visible, and to the life door system so doors swing open as you approach. Expose
teleport(x,z) for the UI ("go to house N", "go to dais").`,
  characters: `Character roster + avatar. Build the list of COMPLETED characters dynamically: a character counts as completed if
docs/CHARACTER_STATUS.md lists it as shipped/complete (or its latest critic verdict is ship) AND characters/<name>.js loads without error.
Generate a manifest (tools/demo-roster.mjs -> src/demo/roster.json, re-runnable as the other session finishes more characters; the page
must also tolerate a character failing to load and skip it). Spawn the selected character as the player avatar with the src/chars runtime:
idle / walk / run locomotion driven by the player's velocity and facing (8 directions or smooth turn, per the character contract), correct
scale relative to the town (doors 2 m), toon look and outlines matching the town, shadows. Live switching without reloading (dispose the
old one). Optionally show a few other completed characters as idle NPCs on the square. Report the final roster.`,
  time: `Continuous time of day + town state. A clock 0-24 h that drives the town smoothly: interpolate the town's TOWN_TOD presets (sun
direction/colour/intensity, sky, ambient, grade, fog) between dawn/morning/noon/afternoon/golden/dusk/night instead of jumping; lamps and
window lights turn on at dusk and off at dawn (via the town's existing light/life hooks), the clocktower hands follow the clock, the bell can
ring on the hour (and on demand). Play/pause, speed (x1 = 1 game hour per real minute, up to x60), jump to presets. Apply phase changes
(day/nomination/vote/execution/night) and seat states to the dais/life APIs (ceremony demo, braziers, nominated seat glow, dead seats).
Quality tier and life on/off may need a town rebuild: do it cleanly (keep the player position). Watch frame time: no per-frame allocations,
no shader recompiles while scrubbing time (check programs stay constant).`,
  ui: `Control panel UI over the canvas (plain DOM, no framework; crisp pixel-art-friendly styling that matches the town: dark slate panel,
cream text, small caps; collapsible; usable at 1280x720 and on a laptop). Sections: Character (dropdown/thumbnails of the roster, switch
live), Time (big clock readout, 0-24 h slider, play/pause, speed, preset buttons dawn/noon/golden/dusk/night), Town (phase buttons, start
ceremony, ring bell, 15 seat toggles: occupied/dead/ghost vote/nominated), Render (quality low/high, life on/off, cut-away on/off, camera
follow/free/overview, FPS + tris readout), Travel (go to house 0-14 by name, dais, clock tower). Keyboard shortcuts listed in a help
overlay (H). All controls write the shared state in src/demo/state.js; never reach into other modules directly.`,
  deploy: `Serving + automated checks. tools/demo-serve.sh: sync the tree to the 4090 (tools/remote.sh) and (re)start a static file server
there, bound ONLY to its Tailscale address ${HOST_IP} port ${PORT} (python3 -m http.server --bind ${HOST_IP} ${PORT} from ~/pixel3d, nohup, pid
file, idempotent restart, log file) so the user's Mac can open http://${HOST_IP}:${PORT}/demo.html. Never bind 0.0.0.0, never touch other
services on that machine. tools/demo-smoke.mjs (Playwright, real-time mode): open the page, wait for ready, assert no console errors, report
FPS / frame ms over 5 s at each quality tier, take screenshots. tools/demo-play.mjs: a scripted playtest that walks the player to a few
doors (keyboard events), switches through every roster character, scrubs time noon->night, toggles phases, and records screenshots +
a GIF (tools/sheet.py gif). Make these runnable by everyone else.`,
}

phase('Build')
const built = await parallel(Object.keys(BRIEFS).map((k) => () => agent(`${CONTEXT}
${own(k)}
Lead's design notes (read docs/DEMO.md first): ${design.summary}
Your part: ${BRIEFS[k]}
Test your part in the running demo on the 4090 (Playwright, real time), look at the screenshots, iterate until it works and looks right.`,
  { label: `build:${k}`, phase: 'Build', schema: DONE })))

phase('Integrate')
const integ = await agent(`${CONTEXT}
${own('lead')} — integration lead; you may make small glue edits in other src/demo/* files when owners' pieces don't fit together (note them).
Owner reports: ${JSON.stringify(built.filter(Boolean).map((b) => ({ summary: b.summary, requests: b.contract_requests })))}
Wire everything, resolve contract requests that are yours, run tools/demo-serve.sh and tools/demo-play.mjs, look at every screenshot, and
fix integration bugs until a full scripted playtest (walk, doors, switch every character, scrub time, phases, ceremony, quality toggle)
passes with no console errors. Update docs/DEMO.md (how to open it, controls, the roster, known issues).`, { label: 'lead:integrate', phase: 'Integrate', schema: DONE })

phase('Playtest')
const tests = (await parallel([
  ['qa', 'a meticulous QA tester: play every feature through Playwright (keyboard + clicks on the real UI), try to break it (walk into every wall/house/the river, spam switches, scrub time fast, toggle quality during a ceremony, resize the window), measure FPS per tier'],
  ['art', 'a demanding art director for t3ssel8r-style pixel art: judge the player character in the town (scale, outlines, palette fit, animation on the texel grid, no sub-texel jitter while walking or when the camera follows), the time-of-day transitions, the UI styling'],
].map(([k, role]) => () => agent(`${CONTEXT}
Do not edit files except shots/demo-playtest-${k}/. You are ${role}. Integration notes: ${integ ? integ.summary : ''}
Report concrete issues routed to an owner (${Object.keys(OWN).join(', ')}) with fixes.`, { label: `playtest:${k}`, phase: 'Playtest', schema: ISSUES })))).filter(Boolean)

phase('Fix')
const by = {}
for (const t of tests) for (const i of t.issues) (by[i.owner] = by[i.owner] || []).push(i)
await parallel(Object.keys(by).map((k) => () => agent(`${CONTEXT}
${own(k)}
Playtesters found these issues for you: ${JSON.stringify(by[k], null, 1)}
Fix every one, re-test in the running demo on the 4090 and look at the screenshots.`, { label: `fix:${k}`, phase: 'Fix', schema: DONE })))

phase('Deploy')
const deploy = await agent(`${CONTEXT}
${own('deploy')} (and docs/DEMO.md's "How to open" section).
Final deploy: run tools/demo-serve.sh, then tools/demo-smoke.mjs and tools/demo-play.mjs against http://${HOST_IP}:${PORT}/demo.html
(from the 4090 itself), look at every screenshot, and produce shots/demo-final/: 4-6 stills (noon, golden, night, ceremony, two
characters) and a walk-around GIF. Confirm the server is up and reachable on ${HOST_IP}:${PORT} only. Return the URL, the roster, FPS per tier,
and how to stop/restart the server.`, { label: 'deploy:final', phase: 'Deploy', schema: DONE })

return { url: `http://${HOST_IP}:${PORT}/demo.html`, design: design.summary, integrate: integ && integ.summary,
  playtest: tests.map((t) => t.summary), deploy: deploy && { summary: deploy.summary, screenshots: deploy.screenshots } }
