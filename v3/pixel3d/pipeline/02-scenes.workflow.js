export const meta = {
  name: 'pixel3d-scenes',
  description: 'Compose the art-direction scenes, critique them against refs + rubric, refine, polish modules, render the gallery',
  phases: [
    { title: 'Compose', detail: 'one scene agent per scene → critic → refine → re-score (pipelined per scene)' },
    { title: 'Polish modules', detail: 'module-level issues from all critics, grouped by owner, fixed in parallel' },
    { title: 'Gallery', detail: 'final stills, GIFs, contact sheet, docs/GALLERY.md' },
  ],
}

const ROOT = (args && args.root) || '~/Desktop/Projects/pixel3d'
const SCENES = (args && args.scenes) || ['shrine', 'pond', 'glade']

const CONTEXT = `Project: ${ROOT} — three.js r170 "3D pixel art" renderer (t3ssel8r / David Holland style) built by an agent swarm.
Side project: work only inside ${ROOT} (and the session scratchpad). Read ${ROOT}/docs/PIPELINE.md (contract, ownership,
how to render on render-host (RTX 4090; never render-host, it is the Clocktower server) with tools/shot.sh), ${ROOT}/docs/ART_DIRECTION.md (scene specs + critique rubric),
${ROOT}/docs/TECHNIQUES.md §9 (composition). Reference look (third-party, view only): ${ROOT}/refs/ — small_pass_04.png,
crop_final.png, m1.jpg, m2.jpg, small_water_02.png, thumb_*.jpg. Render with: cd ${ROOT} && tools/shot.sh <scene> shots/<dir>/<name>.png
[--t 2] [--times ...] [--q scale=2&tod=golden]; then LOOK at the PNG with Read. Errors printed = failure. No git commits.
Never claim anything you didn't render and look at.`

const ISSUES = {
  type: 'object',
  properties: {
    score: { type: 'number', description: 'rubric total (ART_DIRECTION rubric, 0-2 per criterion)' },
    per_criterion: { type: 'array', items: { type: 'object', properties: { criterion: { type: 'string' }, score: { type: 'number' }, note: { type: 'string' } }, required: ['criterion', 'score', 'note'] } },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: "'scene' or a module owner: camera|outlines|lighting|terrain|props|grass|trees|water|atmosphere|lead" },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          problem: { type: 'string', description: 'what is visibly wrong, where in the image' },
          fix: { type: 'string', description: 'concrete suggested fix' },
        },
        required: ['owner', 'severity', 'problem', 'fix'],
      },
    },
    verdict: { type: 'string' },
  },
  required: ['score', 'per_criterion', 'issues', 'verdict'],
}

const DONE = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' } },
    commands_run: { type: 'array', items: { type: 'string' } },
    module_issues: { type: 'array', items: { type: 'string' }, description: 'problems you could not fix because they live in module files (owner: problem)' },
  },
  required: ['summary', 'files', 'screenshots', 'commands_run', 'module_issues'],
}

const critique = (scene, round, shots) => agent(`${CONTEXT}
You are a demanding ART DIRECTOR. Critique the "${scene}" scene (scenes/${scene}.js), round ${round}.
Render it yourself at 1280x720 (scale=2) at 2-3 times (and its time-of-day variants if any) plus a 640x360 scale=1 crop for
pixel-level inspection; scene agent's shots for reference: ${JSON.stringify(shots || [])}. Put the PNGs in shots/critic-${scene}-r${round}/.
Also render a 6-frame slow pan (--times with small steps; scenes support &pan=1) and diff consecutive frames with tools/sheet.py diff
to check crawl/shimmer. Compare side by side with the refs (Read them). Score with the ART_DIRECTION rubric honestly — default to
the lower score when unsure; a score above 20/24 must be earned. List concrete issues, each tagged with the owner whose file must
change (scene = scenes/${scene}.js; module owners per PIPELINE.md). Prioritise what most separates this from the refs.`,
  { label: `critic:${scene}:r${round}`, phase: 'Compose', schema: ISSUES })

phase('Compose')
const results = await pipeline(SCENES,
  (scene) => agent(`${CONTEXT}
You are the "scene-${scene}" agent. You own ONLY scenes/${scene}.js. Build the "${scene}" scene exactly per ART_DIRECTION.md using
the module APIs (src/world/*, src/post/*, applyTimeOfDay, addGrade, ...). Requirements: deterministic seeds; export default
async function build(engine, params); honour URL params &tod=<morning|noon|golden|night> (default per ART_DIRECTION) and &pan=1
(slow deterministic camera drift as a function of t, ~1 texel per 0.1 s, for GIFs/crawl checks); camera per ART_DIRECTION
(pitch 30°, yaw multiple of 45°). Iterate render→look→fix at least 6 times; compare with refs every time. Composition, density and
palette matter as much as correctness. Module bugs you can't work around → module_issues (owner: problem).`,
    { label: `compose:${scene}`, phase: 'Compose', schema: DONE }),
  (built, scene) => critique(scene, 1, built && built.screenshots).then((c) => ({ built, c1: c })),
  (st, scene) => agent(`${CONTEXT}
You are the "scene-${scene}" agent again (you own ONLY scenes/${scene}.js). The art director scored round 1 at ${st.c1 && st.c1.score}/24:
${JSON.stringify(st.c1, null, 1)}
Fix every issue with owner "scene" (and work around module issues in your scene where reasonable). Re-render and look after each
change. Report what you changed and what remains (module_issues).`,
    { label: `refine:${scene}`, phase: 'Compose', schema: DONE }).then((r) => ({ ...st, refined: r })),
  (st, scene) => critique(scene, 2, st.refined && st.refined.screenshots).then((c) => ({ scene, ...st, c2: c })),
)

const done = results.filter(Boolean)
log('scores: ' + done.map((r) => `${r.scene} r1=${r.c1 && r.c1.score} r2=${r.c2 && r.c2.score}`).join(', '))

// Group module-level issues from the final critique (+ unresolved module_issues) by owner — needs all scenes.
const byOwner = {}
for (const r of done) {
  for (const i of (r.c2 && r.c2.issues) || []) {
    if (i.owner === 'scene') continue
    ;(byOwner[i.owner] ||= []).push(`[${r.scene}/${i.severity}] ${i.problem} → ${i.fix}`)
  }
  for (const m of [...((r.refined && r.refined.module_issues) || []), ...((r.built && r.built.module_issues) || [])]) {
    const owner = (m.split(':')[0] || '').trim().toLowerCase()
    ;(byOwner[owner] ||= []).push(`[${r.scene}/scene-agent] ${m}`)
  }
}
const owners = Object.keys(byOwner).filter((o) => /^(camera|outlines|lighting|terrain|props|grass|trees|water|atmosphere|lead)$/.test(o))
const dropped = Object.keys(byOwner).filter((o) => !owners.includes(o))
if (dropped.length) log(`unroutable issue owners dropped: ${dropped.join(', ')}`)

phase('Polish modules')
const polished = await parallel(owners.map((owner) => () => agent(`${CONTEXT}
You are the "${owner}" module owner (files per PIPELINE.md ownership table${owner === 'lead' ? '; lead = core files' : ''}). Edit only
your files. Other owners are fixing theirs in parallel. The art directors raised these issues across scenes ${SCENES.join(', ')}:
${byOwner[owner].map((s) => '- ' + s).join('\n')}
Fix them in your module (keep the public API stable), then re-render EVERY scene (${SCENES.join(', ')}) and your _test scene to make sure
nothing regressed. Put renders in shots/polish-${owner}/.`,
  { label: `polish:${owner}`, phase: 'Polish modules', schema: DONE }).then((r) => r && { owner, ...r })))

phase('Gallery')
const gallery = await agent(`${CONTEXT}
You are the gallery agent. Everything is built. For each scene in ${JSON.stringify(SCENES)}:
1) render final stills at 1920x1080 (scale=3 → 640x360) for each time-of-day variant ART_DIRECTION lists, into shots/gallery/;
2) render a ~3 s loop (90 frames, --times 0,0.0333,...) with &pan=1 and assemble shots/gallery/<scene>.gif at 640x360
   (tools/sheet.py gif --scale 0.3333 --fps 30) — check the GIF frames for crawl and fix nothing yourself, just report;
3) a contact sheet shots/gallery/sheet.png of all stills.
Then write docs/GALLERY.md (what each image shows, which technique is visible where, known flaws, honest status) and update
README.md at the repo root: what this is, how to view interactively (open index.html?scene=<name> through any static server;
controls), how the agent pipeline works (research → TECHNIQUES/ART_DIRECTION → pipeline/01-build → pipeline/02-scenes), how to
re-run it. Final scores for context: ${JSON.stringify(done.map((r) => ({ scene: r.scene, r1: r.c1 && r.c1.score, r2: r.c2 && r.c2.score })))}.`,
  { label: 'gallery', phase: 'Gallery', schema: DONE })

return {
  scenes: done.map((r) => ({ scene: r.scene, r1: r.c1 && r.c1.score, r2: r.c2 && r.c2.score, verdict: r.c2 && r.c2.verdict, files: r.refined && r.refined.files })),
  polished: polished.filter(Boolean).map((p) => ({ owner: p.owner, summary: p.summary })),
  gallery,
}
