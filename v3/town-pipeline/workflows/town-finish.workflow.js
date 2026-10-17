export const meta = {
  name: 'town-finish',
  description: 'Finish a town run that died part-way (usage limit / crash): re-run only the unfinished fixers, then chain the user-requests verify loop',
  whenToUse: 'Instead of resuming a big parallel workflow (a resume re-runs everything): pass the unfinished owners and their issues.',
  phases: [
    { title: 'Fix', detail: 'owners whose fix agent died before finishing' },
    { title: 'User requests', detail: 'town-user-requests.workflow.js: implement + independently verify, fix, gallery' },
  ],
}

// -----------------------------------------------------------------------------------------------------------------
// town-finish: the recovery pattern from PROCESS.md ("usage limits").
//
// args (object):
//   root          REQUIRED. Absolute path of v3/pixel3d (computed by the caller).
//   byOwner       REQUIRED. { "<owner>": [ {severity, problem, fix}, ... ], ... } — the issues of every fixer that did not
//                 finish. Take them from the dead run's return value (town-build returns `unfinishedFixers`) or its journal.
//                 Owners: 'lead', 'life', or a piece id (house-N, clocktower, dais, foliage, ground, props). 'water' is folded
//                 into 'ground' (the ground piece owns the river).
//   followUp      Path of the next workflow to chain (default: root + '/../town-pipeline/workflows/town-user-requests.workflow.js');
//                 pass null to stop after the fixes.
//   followArgs    args for the follow-up (default { root }; add `requests` there).
//   renderHost / forbiddenHost   labels as in town-build.
// -----------------------------------------------------------------------------------------------------------------

if (!args || !args.root || !args.byOwner) throw new Error('town-finish: pass args.root and args.byOwner')
const ROOT = args.root
const HOST = args.renderHost || 'render-host'
const FORBID = args.forbiddenHost || 'game-host'
const CONTEXT = `Project: ${ROOT} — pixel3d (three.js t3ssel8r-style 3D pixel art). The town was built by an agent swarm: docs/TOWN.md
(contract; §11 = the USER'S REQUESTS, highest priority), src/town/* (layout, kit, api, town composer, cutaway), src/town/pieces/*.js
(one file per piece), src/town/life/* (animation), scenes/town.js, scenes/town-piece.js, tools/townpiece.sh. Read docs/PIPELINE.md and
docs/TOWN.md first. This machine only edits files; render headless on the GPU render host (${HOST}) with tools/shot.sh /
tools/townpiece.sh (never on ${FORBID}) and LOOK at every PNG/GIF you rely on. Page/shader errors = failure. Deterministic code only.
No git commits. No raw rm. Never claim anything you did not render and look at. Other fixers work in parallel: edit ONLY your files.`
const DONE = { type: 'object', properties: { summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } },
  screenshots: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'files', 'screenshots'] }

const by = { ...args.byOwner }
if (by.water) { by.ground = [...(by.ground || []), ...by.water]; delete by.water }
const ownerFiles = (o) => o === 'lead' ? 'the lead files: src/town non-piece files (layout, kit, api, town, palette, cutaway, contact), scenes/town*.js, tools/town*, docs/TOWN.md'
  : o === 'life' ? 'src/town/life/*, scenes/town-life.js and shots/town-life/' : `src/town/pieces/${o}.js (+ src/town/pieces/${o}/*.js) and shots/town-${o}/`

phase('Fix')
const owners = Object.keys(by).filter((o) => by[o] && by[o].length)
const fixes = await parallel(owners.map((o) => () => agent(`${CONTEXT}
You own ONLY ${ownerFiles(o)}. A town-wide critique routed these issues to you ("${o}"). A previous fix attempt was cut off, so your
file may contain partial work: read it, render it, and finish:
${JSON.stringify(by[o], null, 1)}
Also honour docs/TOWN.md §11 (user requests) wherever it touches your files. Fix every issue, re-render in context (scenes/town.js with a
suitable ?focus=) and in isolation (tools/townpiece.sh where it applies), and look at each result.`, { label: `fix2:${o}`, phase: 'Fix', schema: DONE })))
const stillDead = owners.filter((o, i) => !fixes[i])
log(`fixes: ${owners.length - stillDead.length}/${owners.length} done${stillDead.length ? `; still unfinished: ${stillDead.join(', ')}` : ''}`)

let follow = null
const next = args.followUp === null ? null : (args.followUp || `${ROOT}/../town-pipeline/workflows/town-user-requests.workflow.js`)
if (next) {
  phase('User requests')
  follow = await workflow({ scriptPath: next }, args.followArgs || { root: ROOT })
}
return { fixes: fixes.filter(Boolean).map((f) => f.summary.slice(0, 300)), stillUnfinished: Object.fromEntries(stillDead.map((o) => [o, by[o]])), followUp: follow }
