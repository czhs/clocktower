export const meta = {
  name: 'demo-polish',
  description: 'Post-release polish against the live demo: per-room night moods and light-disc stains (3 builders) + one demo/town fixer for a list of concrete bugs, then one checking critic',
  whenToUse: 'After a release, for a batch of small concrete issues found on the live page. The main session keeps publishing; agents never publish.',
  phases: [
    { title: 'Polish', detail: '3 interior night-light builders + 1 demo/town fixer' },
    { title: 'Check', detail: 'critic: night line-up + playtest' },
  ],
}

// -----------------------------------------------------------------------------------------------------------------
// demo-polish (PROCESS.md phase 10, "polish" + continuous release).
//
// args (object):
//   root         REQUIRED. Absolute path of v3/pixel3d (computed by the caller).
//   nightNotes   string: what the critic found wrong with the rooms at night (default: the Hollowmere notes below).
//                null = skip the 3 interior builders.
//   fixes        [string]: concrete bugs for the demo/town fixer, each with how to verify it (default: none -> fixer skipped).
//   fixerOwns    files the fixer owns (default below).
//   houseCount   default 15.
//   renderHost / forbiddenHost   labels as in town-build.
// -----------------------------------------------------------------------------------------------------------------

if (!args || !args.root) throw new Error('demo-polish: pass args.root = absolute path of v3/pixel3d')
const ROOT = args.root
const HOST = args.renderHost || 'render-host'
const FORBID = args.forbiddenHost || 'game-host'
const N = args.houseCount || 15
const CONTEXT = `Project: ${ROOT} — pixel3d. The town demo is LIVE (re-published from this tree by the main session). Read docs/DEMO.md,
docs/INTERIORS.md, docs/LORE.md. characters/* and src/chars/* may be under active authoring by another session: never edit those. This
machine only edits files; everything runs on the GPU render host (${HOST}) via tools/remote.sh, tools/shot.sh, tools/demo-*.mjs (never on
${FORBID}). LOOK at every screenshot you rely on. Console/page/shader errors = failure. No git commits, no publishing (the main session
publishes). No raw rm. Edit ONLY your own files; others work in parallel.`
const DONE = { type: 'object', properties: { summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, screenshots: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'files', 'screenshots'] }

const NOTES = args.nightNotes === null ? null : (args.nightNotes || `The critic found the night half weak: several rooms flatten into the same
blue-grey and lose their lore-doc mood (candlelit, warm gold, roaring orange, mist), and many show hard-edged coloured light discs ("stains",
INTERIORS.md warns about them).`)
const NIGHT = (g) => `NIGHT AMBIANCE for ${g.map((i) => 'house-' + i).join(', ')} (you own ONLY ${g.map((i) => `src/town/interiors/house-${i}.js`).join(', ')}).
${NOTES}
For your rooms: give each its own night lighting recipe matching its LORE.md ambiance (warm fire/candle/lantern/bioluminescent/moon key light,
emissive props that glow, soft falloff — replace hard discs with dithered / multi-band soft pools or emissive glow decals; a per-room
nightAmbient if the contract supports it), keep the night readable (props legible at the interior camera), and keep within ~16 meshes / ~10k
tris. Render scenes/interior.js for each at night and noon and a night 25% line-up with all rooms; iterate until each room's night mood is
unmistakable.`

const all = Array.from({ length: N }, (_, i) => i)
const size = Math.ceil(N / 3)
const groups = [all.slice(0, size), all.slice(size, 2 * size), all.slice(2 * size)].filter((g) => g.length)
const FIXER_OWNS = args.fixerOwns || 'src/demo/{main,api,state,ui,time}.js, src/demo/ui.css, demo.html, src/demo/player.js, src/demo/collision.js, tools/demo-play.mjs (and a minimal, noted fix in a src/town file only when a bug lives there)'
const FIXES = args.fixes || []

phase('Polish')
const res = (await parallel([
  ...(NOTES ? groups.map((g) => () => agent(`${CONTEXT}\n${NIGHT(g)}`, { label: `night:${g[0]}-${g[g.length - 1]}`, phase: 'Polish', schema: DONE })) : []),
  ...(FIXES.length ? [() => agent(`${CONTEXT}\nYou own ${FIXER_OWNS}. Fix and verify each on the render host:
${FIXES.map((f, i) => `${i + 1}) ${f}`).join('\n')}
For each: find the real cause (the owning file/line), fix it there if you own it or report it exactly if you do not. Run tools/demo-play.mjs
until it passes with no errors.`, { label: 'fix:demo', phase: 'Polish', schema: DONE })] : []),
])).filter(Boolean)
if (!NOTES && !FIXES.length) log('nothing to polish: pass args.nightNotes and/or args.fixes')

phase('Check')
const crit = await agent(`${CONTEXT}\nDo not edit files except shots/polish-critic/. Reports: ${JSON.stringify(res.map((r) => r.summary.slice(0, 500)))}
${NOTES ? `Render all ${N} interiors at night (scenes/interior.js) and make the 25% night line-up; judge each room's night mood against docs/LORE.md and look for hard light-disc stains.` : ''}
${FIXES.length ? `Re-check each of these on a fresh load: ${JSON.stringify(FIXES)}.` : ''}
Run tools/demo-play.mjs. Report what is fixed and what is still wrong (with file + concrete fix).`, { label: 'critic:polish', phase: 'Check' })
return { polish: res.map((r) => r.summary.slice(0, 500)), critic: crit }
