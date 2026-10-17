export const meta = {
  name: 'demo-finish',
  description: 'Before publishing: interior lore/distinctness pass (3 builders + critic + fix), finished-only roster, optional layout task, CSP-safe bundle verified under the production CSP',
  whenToUse: 'When the demo works but the interiors look alike and the bundle must pass a strict Content-Security-Policy under a sub-path.',
  phases: [
    { title: 'Polish', detail: '3 interior lore builders, roster (finished only), optional layout task' },
    { title: 'Critique', detail: 'interior distinctness critic (25% thumbnails) + demo smoke' },
    { title: 'Fix', detail: 'owners fix critic issues' },
    { title: 'Bundle', detail: 'CSP-safe bundle, verified with the production CSP header under the sub-path' },
  ],
}

// -----------------------------------------------------------------------------------------------------------------
// demo-finish (PROCESS.md phase 10, "finish").
//
// args (object):
//   root         REQUIRED. Absolute path of v3/pixel3d (computed by the caller).
//   lore         path of the lore doc, relative to root (default 'docs/LORE.md'; write it first from
//                ../town-pipeline/templates/lore-skeleton.md).
//   houseCount   default 15 (3 builders, groups of houseCount/3).
//   layoutTask   string: one layout change for the layout owner this round (default: none).
//   rosterRule   string: what "finished" means for the public roster (default below).
//   publicUrl    where the bundle will be served, e.g. 'https://<public-host>/v3-art-demo/' (only used in prompts).
//   csp          the exact Content-Security-Policy the host sends (default: the strict policy below).
//   renderHost / forbiddenHost   labels as in town-build.
// -----------------------------------------------------------------------------------------------------------------

if (!args || !args.root) throw new Error('demo-finish: pass args.root = absolute path of v3/pixel3d')
const ROOT = args.root
const HOST = args.renderHost || 'render-host'
const FORBID = args.forbiddenHost || 'game-host'
const LORE = args.lore || 'docs/LORE.md'
const N = args.houseCount || 15
const URL_ = args.publicUrl || 'https://<public-host>/v3-art-demo/'
const CSP = args.csp || "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"

const CONTEXT = `Project: ${ROOT} — pixel3d (three.js t3ssel8r-style 3D pixel art, plain ES modules). The playable town demo (demo.html + src/demo/*,
docs/DEMO.md) is built: walk the town, enter every cottage (src/town/interiors/*, docs/INTERIORS.md, viewer scenes/interior.js), switch
characters, control time. Read docs/DEMO.md, docs/INTERIORS.md and ${LORE} first. characters/* and src/chars/* may be under active authoring
by another session: never edit those. This machine only edits files; everything runs on the GPU render host (${HOST}) via tools/remote.sh,
tools/shot.sh and tools/demo-*.mjs (never on ${FORBID}). LOOK at every screenshot you rely on. Console/page/shader errors = failure. No git
commits. No raw rm. No publishing. Edit ONLY the files you own; others work in parallel.`
const DONE = { type: 'object', properties: { summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } },
  screenshots: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'files', 'screenshots'] }

const all = Array.from({ length: N }, (_, i) => i)
const size = Math.ceil(N / 3)
const groups = [all.slice(0, size), all.slice(size, 2 * size), all.slice(2 * size)].filter((g) => g.length)
const gid = (g) => `interiors-${g[0]}-${g[g.length - 1]}`
const ISSUES = { type: 'object', properties: { summary: { type: 'string' }, screenshots: { type: 'array', items: { type: 'string' } },
  issues: { type: 'array', items: { type: 'object', properties: { owner: { type: 'string', description: `${groups.map(gid).join(' | ')} | roster | layout | lead` },
    severity: { type: 'string', enum: ['high', 'medium', 'low'] }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['owner', 'severity', 'problem', 'fix'] } } },
  required: ['summary', 'screenshots', 'issues'] }

const LORE_BRIEF = (g) => `INTERIOR LORE PASS for ${g.map((i) => 'house-' + i).join(', ')}. USER REQUEST: every interior must be VERY visually distinct,
with its own style and AMBIANCE, and each room should almost tell a story hinting at the town's lore. If rooms share the kit's standard shell
(same rectangle, back wall, centre fireplace), that must change. Follow ${LORE} exactly for your houses (inhabitant, story props, shared
motifs, ambiance) and its distinctness rules: vary the ROOM ITSELF (shape: L-shape / round tower room / loft or mezzanine / low cabin /
workshop / boat hull; fireplace position or none; window placement; floor + wall materials; ceiling beams; clutter density), give each room
its OWN lighting recipe (key light colour/temperature, night glow sources) and at least one cheap animated ambiance element (motes, steam,
sparks, firefly specks, water ripples on the walls, ticking pendulum, swinging lantern, drifting flour). 2-4 story props per room that read at
the interior camera (640x360: bigger and simpler than you think), plus small details for close lookers; shared motifs placed exactly as the
lore doc says. Keep the interior contract (spawn, exit, collision, camera, bed, visitPoint, lights) working and the per-room budget (~10k
tris, ~16 meshes). Render scenes/interior.js for each house at noon and night and a 25% thumbnail line-up of your houses next to the others;
iterate until each is unmistakable. Template: ${ROOT}/../town-pipeline/templates/interior-brief.md.`

const ROSTER_RULE = args.rosterRule || `"finished" = listed as shipped in docs/CHARACTER_STATUS.md, OR its characters/<id>.md records a FINAL
independent critic verdict that ships (score >= the playbook's ship bar, no blocking zeros), OR it is in an allow-list file
src/demo/roster-allow.json if present (create it as an empty list with a comment field explaining its use)`

phase('Polish')
const tasks = [
  ...groups.map((g) => () => agent(`${CONTEXT}\nYou own ONLY ${g.map((i) => `src/town/interiors/house-${i}.js`).join(', ')} (+ shots/lore-${g[0]}/). The kit (src/town/interiors/kit.js, index.js) is read-only; build custom geometry in your own files.\n${LORE_BRIEF(g)}`,
    { label: `lore:${g[0]}-${g[g.length - 1]}`, phase: 'Polish', schema: DONE })),
  () => agent(`${CONTEXT}\nYou own ONLY src/demo/roster.js, src/demo/roster.json, tools/demo-roster.mjs, src/demo/characters.js (+ shots/roster-finish/).
The public demo must offer ONLY FINISHED characters. Define ${ROSTER_RULE}. Add a ?wip=1 URL option that still shows the WIP ones for internal
testing. Regenerate the manifest, check every finished character loads, idles and walks in the demo, and report the exact finished list with
the evidence per character.`, { label: 'roster:finished', phase: 'Polish', schema: DONE }),
  ...(args.layoutTask ? [() => agent(`${CONTEXT}\nYou own ONLY src/town/layout.js, src/town/api.js (camera presets), docs/TOWN.md (+ shots/layout-finish/).
${args.layoutTask}
Measure with ?occl=1 / ?vis=1 / ?ldx= A/B, re-check walking and doors (tools/demo-player.mjs doors + fuzz, tools/demo-play.mjs), update the
"Layout deltas" table, render the affected cameras before/after and look.`, { label: 'layout:finish', phase: 'Polish', schema: DONE })] : []),
]
const polish = (await parallel(tasks)).filter(Boolean)

phase('Critique')
const crit = await agent(`${CONTEXT}\nDo not edit files except shots/lore-critic/. You are a demanding art director. Polish reports: ${JSON.stringify(polish.map((p) => p.summary.slice(0, 600)))}
Render all ${N} interiors (scenes/interior.js, noon AND night) and make 25% thumbnail line-ups of all of them (one noon, one night). Judge
against ${LORE}: can each room be told apart at 25% by layout + palette + light alone, by day and by night? Does each have its own ambiance and
readable story props, and are the shared motifs placed as the lore doc says? Look for hard-edged light discs ("stains") on walls. Also check:
the roster offers only finished characters (and ?wip=1 shows the rest)${args.layoutTask ? ', the layout task is done' : ''}, and the demo
still passes tools/demo-play.mjs. Route issues to owners.`, { label: 'critic:lore', phase: 'Critique', schema: ISSUES })

phase('Fix')
const OWN = Object.fromEntries(groups.map((g) => [gid(g), g]))
const by = {}
for (const i of (crit ? crit.issues : [])) { const o = OWN[i.owner] || ['roster', 'layout'].includes(i.owner) ? i.owner : 'lead'; (by[o] = by[o] || []).push(i) }
const ownFiles = (o) => OWN[o] ? OWN[o].map((i) => `src/town/interiors/house-${i}.js`).join(', ')
  : o === 'roster' ? 'src/demo/roster*.js(on), tools/demo-roster.mjs, src/demo/characters.js'
  : o === 'layout' ? 'src/town/layout.js, src/town/api.js, docs/TOWN.md' : 'src/demo/{main,api,state,ui,time}.js, demo.html, docs/DEMO.md'
await parallel(Object.keys(by).map((o) => () => agent(`${CONTEXT}
You own ONLY ${ownFiles(o)}.
Fix these critic issues: ${JSON.stringify(by[o], null, 1)}
Re-render and look at each fix.`, { label: `fix:${o}`, phase: 'Fix', schema: DONE })))

phase('Bundle')
const bundle = await agent(`${CONTEXT}\nYou own tools/demo-bundle.sh, tools/demo-bundle-csp.py, tools/demo-smoke.mjs, docs/DEMO.md §6 (+ shots/bundle-final/).
The demo will be served at ${URL_} by a server that sends this CSP on every demo response:
"${CSP}".
So the bundle must have NO inline scripts (the import map is inline): tools/demo-bundle-csp.py rewrites bare three imports to relative paths
and removes the import map; tools/demo-bundle.sh must run it as its LAST step, then grep for eval / new Function / string timers /
javascript: URLs / data: workers / inline on*= handlers. If the policy above differs from the one hard-coded in tools/demo-bundle.sh verify,
update the script to send exactly this one. Rebuild dist/v3-art-demo/ (finished-only roster by default; include the WIP files so ?wip=1 still
works), then verify (VERIFY_PLAY=1 tools/demo-bundle.sh verify): served on the render host's 127.0.0.1 under the sub-path with EXACTLY that
header, tools/demo-smoke.mjs --expect-csp --tour and tools/demo-play.mjs against it: zero CSP violations (securitypolicyviolation events +
console "Refused to" lines), header exact on every document, no request outside the prefix; loading screen, intro, walking, entering a house,
switching characters. Run a negative control (one inline <script> added must FAIL the smoke). Report size, file count, the finished roster,
and fresh stills (loading, cinematic, square noon, night, 3 different interiors, 2 characters) + a GIF. Do NOT publish.`,
  { label: 'bundle', phase: 'Bundle', schema: DONE })

return { polish: polish.map((p) => p.summary.slice(0, 500)), critic: crit && crit.summary, bundle: bundle && { summary: bundle.summary, screenshots: bundle.screenshots } }
