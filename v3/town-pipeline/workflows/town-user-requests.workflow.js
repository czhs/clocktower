export const meta = {
  name: 'town-user-requests',
  description: 'Implement and independently verify every user request recorded in docs/TOWN.md §11; fix and re-verify failures (up to 3 rounds); refresh the gallery',
  whenToUse: 'After a town build, whenever the human has asked for changes. Write each request into TOWN.md §11 AND args.requests first.',
  phases: [
    { title: 'Implement', detail: 'lead applies every user request' },
    { title: 'Verify', detail: 'one independent verifier per user request renders and checks it, pass/fail' },
    { title: 'Fix', detail: 'owners/lead fix failed requests, re-verify' },
    { title: 'Gallery', detail: 'refresh docs/TOWN_GALLERY.md + shots/town-gallery' },
  ],
}

// -----------------------------------------------------------------------------------------------------------------
// town-user-requests: the verify loop (v3/town-pipeline/PROCESS.md phase 6).
//
// args (object):
//   root           REQUIRED. Absolute path of v3/pixel3d (computed by the caller).
//   requests       [{id, text}] — one VERIFIABLE sentence each (what a demanding user would check on screen). Default: the
//                  Hollowmere requests of 2026-10-16 below (useful as examples of the right granularity).
//   rounds         max verify rounds (default 3).
//   skipImplement  true to go straight to verification (the requests were already implemented by hand).
//   skipGallery    true to skip the gallery refresh.
//   source         read-only source game path (default root + '/../..'; null = none).
//   renderHost / forbiddenHost   labels as in town-build (defaults 'render-host' / 'game-host').
//
// Owners in verifier problems: 'lead' or a piece id (house-N, clocktower, dais, foliage, ground, props, life).
// Template for the verifier prompt: v3/town-pipeline/templates/user-request-verifier.md.
// -----------------------------------------------------------------------------------------------------------------

if (!args || !args.root) throw new Error('town-user-requests: pass args.root = absolute path of v3/pixel3d')
const ROOT = args.root
const CT = args.source === null ? null : (args.source || `${ROOT}/../..`)
const HOST = args.renderHost || 'render-host'
const FORBID = args.forbiddenHost || 'game-host'
const ROUNDS = args.rounds || 3

const CONTEXT = `Project: ${ROOT} — pixel3d (three.js t3ssel8r-style 3D pixel art). The town was built by an agent swarm: docs/TOWN.md
(contract; §11 = the USER'S REQUESTS, highest priority; §12 = integration notes), src/town/* (layout, kit, api, town composer, cutaway),
src/town/pieces/*.js (one file per piece), src/town/life/* (animation), scenes/town.js, scenes/town-piece.js, tools/townpiece.sh,
tools/townshots.sh, tools/towncrawl.sh, docs/TOWN_GALLERY.md. Read docs/PIPELINE.md and docs/TOWN.md first. This machine only edits files;
render headless on the GPU render host (${HOST}) with tools/shot.sh / tools/townpiece.sh / tools/townshots.sh (never on ${FORBID}) and LOOK
at every PNG/GIF you rely on. Page/shader errors = failure. Deterministic code only. No git commits. No raw rm (tools/clean.sh).
${CT ? `Never edit anything under ${CT} outside ${ROOT}. ` : ''}Never claim anything you did not render and look at.`

const REQUESTS = args.requests || [
  { id: 'circle-visible', text: 'The bottom house (house-9, straight south of the square) must not cover the bottom of the voting circle: at the gameplay camera centred on the dais and on the south seats, all 15 seats and anyone standing on them are fully visible.' },
  { id: 'corners-diagonal', text: 'The top-left (house-14) and top-right (house-4) corner cottages are rotated ~45° so their fronts and doors point diagonally in toward the square centre, with diagonal door lanes, and they look right from the gameplay camera.' },
  { id: 'side-rows-visible', text: 'Side-row cottages no longer hide each other (house-6 hid house-5; house-12 hid house-13): every cottage and its door is recognisable from the gameplay camera when the player stands in front of it (layout may be adjusted: angled toward the square, staggered, re-spaced, and/or camera-aware roof cut-away with clean outlined edges).' },
  { id: 'doors-visible', text: 'Buildings/doorways are visible and the layout is visually appealing; layout changes vs the game are recorded in a "Layout deltas vs the game" table in docs/TOWN.md and src/town/layout.js is the single source (no stats.doorMismatch).' },
  { id: 'spring-trees', text: 'Trees and foliage are SPRING trees, not winter: fresh bright greens with yellow-green new growth, full canopies, white/pink blossom, flowering shrubs, wildflowers; no autumn-gold or bare/dead trees, no near-black/frosty/teal pines; leaf-clump research style (no cones). South-edge vegetation stays low.' },
  { id: 'mossbank-foliage', text: 'Mossbank Cottage (house-4) has REAL foliage on it: sprite grass, moss clumps, ferns, ivy, flowers on the roof and walls.' },
  { id: 'shadows', text: 'Really nice t3ssel8r-style shadows and light: crisp texel-snapped sun shadows from everything solid (no missing/floating shadows, acne or pan shimmer), long readable golden-hour shadows (clock tower shadow as a feature), dappled canopy shadows, drifting cloud shadows at noon, contact darkening, warm light pools at night.' },
  { id: 'perf-tier', text: 'Not intensive for the final game: a ?quality=low|high tier exists, both tiers are benchmarked with --bench 60 on the gameplay camera, programs constant; low tier keeps the town readable and actually cuts GEOMETRY (target <= ~400k frame tris at the gameplay camera), with an honest estimate for an ordinary laptop iGPU.' },
]

const DONE = { type: 'object', properties: { summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } },
  screenshots: { type: 'array', items: { type: 'string' } }, commands_run: { type: 'array', items: { type: 'string' } } },
  required: ['summary', 'files', 'screenshots', 'commands_run'] }
const VERDICT = { type: 'object', properties: { pass: { type: 'boolean' }, evidence: { type: 'string', description: 'what you rendered and saw, with paths' },
  screenshots: { type: 'array', items: { type: 'string' } },
  problems: { type: 'array', items: { type: 'object', properties: { owner: { type: 'string', description: 'lead or a piece id (house-N, clocktower, dais, foliage, ground, props, life)' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['owner', 'problem', 'fix'] } } },
  required: ['pass', 'evidence', 'screenshots', 'problems'] }

let impl = null
if (!args.skipImplement) {
  phase('Implement')
  impl = await agent(`${CONTEXT}
You are the TOWN LEAD (you may edit src/town/{layout,kit,api,town,palette,cutaway,contact}.js and other non-piece src/town files,
scenes/town*.js, tools/town*, docs/TOWN.md; for piece files make only minimal, surgical changes needed for these requests and note them).
Make sure every request below is also written in docs/TOWN.md §11. Implement EVERY one; some may already be done: check each by rendering,
and finish what is missing. Measure instead of guessing (?occl=1, ?vis=1, ?ldx= A/B, ?tris=1, --bench). Requests:
${REQUESTS.map((r) => `- [${r.id}] ${r.text}`).join('\n')}
Render scenes/town.js at the gameplay camera at every spot the requests mention, overview and iso, noon/golden/night, and look.`,
    { label: 'lead:implement', phase: 'Implement', schema: DONE })
}

const verify = (r, round) => agent(`${CONTEXT}
You are an independent, skeptical VERIFIER (round ${round}). Do not edit files except shots/verify-${r.id}-r${round}/.
Check exactly this user request and nothing else: "${r.text}"
Render whatever proves or disproves it (gameplay camera at the relevant spots incl. ?focus= on door tiles, overview, times of day, the
low tier, --bench, GIF frames, cut=0 controls as needed) and open every image. pass=true only if a demanding user looking at your renders
would agree it is fully done. Data claims count (e.g. a stats.doorMismatch entry is a failure even if the doors look fine). Otherwise list
problems with the owning file/piece and a concrete fix.`, { label: `verify:${r.id}:r${round}`, phase: 'Verify', schema: VERDICT })

const ownerFiles = (o) => o === 'lead' ? 'the lead files (src/town non-piece files, scenes/town*.js, tools/town*, docs/TOWN.md)'
  : o === 'life' ? 'src/town/life/*, scenes/town-life.js and shots/town-life/' : `src/town/pieces/${o}.js (+ src/town/pieces/${o}/*.js) and shots/town-${o}/`

let open = REQUESTS
const history = []
for (let round = 1; round <= ROUNDS && open.length; round++) {
  phase('Verify')
  const verdicts = await parallel(open.map((r) => () => verify(r, round).then((v) => ({ r, v }))))
  const lost = open.filter((r, i) => !verdicts[i] || !verdicts[i].v)
  if (lost.length) log(`round ${round}: no verdict for ${lost.map((r) => r.id).join(', ')} (counted as failed)`)
  const failed = open.filter((r, i) => !(verdicts[i] && verdicts[i].v && verdicts[i].v.pass))
  history.push(verdicts.filter((x) => x && x.v).map((x) => ({ id: x.r.id, round, pass: x.v.pass, evidence: x.v.evidence })))
  log(`round ${round}: ${open.length - failed.length}/${open.length} verified`)
  open = failed
  if (!failed.length || round === ROUNDS) break
  phase('Fix')
  const byOwner = {}
  for (const x of verdicts) if (x && x.v && !x.v.pass) for (const p of x.v.problems) (byOwner[p.owner] = byOwner[p.owner] || []).push({ request: x.r.id, ...p })
  await parallel(Object.keys(byOwner).map((o) => () => agent(`${CONTEXT}
You own ${ownerFiles(o)}. Other fixers work in parallel on other files: edit only yours.
Independent verifiers found these problems with the user's requests (owner ${o}):
${JSON.stringify(byOwner[o], null, 1)}
Fix every one, re-render in context (scenes/town.js) and look at the result.`, { label: `fix:${o}:r${round}`, phase: 'Fix', schema: DONE })))
}

let gallery = null
if (!args.skipGallery) {
  phase('Gallery')
  gallery = await agent(`${CONTEXT}
You are the GALLERY agent (own docs/TOWN_GALLERY.md and shots/town-gallery/). Refresh the gallery: overview noon / golden / night, iso,
the gameplay camera at 6 spots around the square (noon + night), the life GIFs, both quality tiers with bench numbers, and a contact sheet.
Add a "User requests" section with each request's verified status per round: ${JSON.stringify(history)} (still failing after the last
round: ${JSON.stringify(open.map((r) => r.id))}). Honest known flaws.`, { label: 'gallery', phase: 'Gallery', schema: DONE })
}

return { implement: impl && impl.summary, history, stillFailing: open.map((r) => r.id), gallery: gallery && { summary: gallery.summary, screenshots: gallery.screenshots } }
