export const meta = {
  name: 'pixel3d-town-user-requests',
  description: 'Follow-up to pixel3d-town: implement + independently verify every user request in docs/TOWN.md §11, fix until verified, refresh the gallery',
  whenToUse: 'run after pipeline/05 (pixel3d-town) finishes; no args',
  phases: [
    { title: 'Implement', detail: 'lead applies every §11 user request (layout, occlusion, corners, spring, shadows, quality tier)' },
    { title: 'Verify', detail: 'one independent verifier per user request renders and checks it, pass/fail' },
    { title: 'Fix', detail: 'owners/lead fix failed requests, re-verify (up to 2 rounds)' },
    { title: 'Gallery', detail: 'refresh docs/TOWN_GALLERY.md + shots/town-gallery' },
  ],
}

const ROOT = '~/Desktop/Projects/pixel3d'
const CT = '~/Desktop/pipgws'
const CONTEXT = `Project: ${ROOT} — pixel3d (three.js t3ssel8r-style 3D pixel art). The town "Hollowmere" (rebuild of the Clocktower game's
town) was built by an agent swarm: docs/TOWN.md (contract; §11 = the USER'S REQUESTS, highest priority), src/town/* (layout, kit, api,
town composer), src/town/pieces/*.js (one file per piece), src/town/life/* (animation), scenes/town.js, scenes/town-piece.js,
tools/townpiece.sh, docs/TOWN_GALLERY.md. Read docs/PIPELINE.md and docs/TOWN.md first. The Mac only edits files; render headless on the
4090 with tools/shot.sh / tools/townpiece.sh (default host render-host) and LOOK at every PNG/GIF you rely on with the Read tool.
Page/shader errors = failure. Deterministic code only. No git commits. Never edit anything under ${CT} (read-only reference).
Never claim anything you did not render and look at.`

const REQUESTS = [
  { id: 'circle-visible', text: 'The bottom house (house-9 Gloamend Clockworks, straight south of the square) must not cover the bottom of the voting circle: at the gameplay camera centred on the dais and on the south seats, all 15 seats and anyone standing on them are fully visible.' },
  { id: 'corners-diagonal', text: 'The top-left (house-14 Millrace Mill) and top-right (house-4 Mossbank Cottage) corner cottages are rotated ~45° so their fronts and doors point diagonally in toward the square centre, with diagonal door lanes, and they look right from the gameplay camera.' },
  { id: 'side-rows-visible', text: 'Side-row cottages no longer hide each other (house-6 hid house-5; house-12 hid house-13): every cottage and its door is recognisable from the gameplay camera when the player stands in front of it (layout may be adjusted: angled toward the square, staggered, re-spaced, and/or camera-aware roof dither-fade).' },
  { id: 'doors-visible', text: 'Buildings/doorways are visible and the layout is visually appealing; layout changes vs the game are recorded in a "Layout deltas vs the game" table in docs/TOWN.md and src/town/layout.js is the single source.' },
  { id: 'spring-trees', text: 'Trees and foliage are SPRING trees, not winter: fresh bright greens with yellow-green new growth, full canopies, white/pink blossom, flowering shrubs, wildflowers; no autumn-gold or bare trees, no near-black/frosty pines; leaf-clump research style (no cones). South-edge vegetation stays low.' },
  { id: 'mossbank-foliage', text: 'Mossbank Cottage (house-4) has REAL foliage on it: sprite grass, moss clumps, ferns, ivy, flowers on the roof and walls.' },
  { id: 'shadows', text: 'Really nice t3ssel8r-style shadows and light: crisp texel-snapped sun shadows from everything solid (no missing/floating shadows, acne or pan shimmer), long readable golden-hour shadows (clock tower shadow as a feature), dappled canopy shadows, drifting cloud shadows at noon, contact darkening, warm light pools at night.' },
  { id: 'perf-tier', text: 'Not intensive for the final game: a ?quality=low|high tier exists (low = smaller shadow map, no god rays/fog, fewer cloud octaves, etc.), both tiers are benchmarked with --bench 60 on the gameplay camera, programs constant; low tier keeps the town readable. Report triangles, draw calls, mean/max ms for both and an honest estimate for an ordinary laptop iGPU. The low tier must actually cut GEOMETRY, not just effects (the town critic measured 1.34M tris on both tiers and only ~1 ms saved): foliage LOD / impostor rim trees, lower grass density, fewer leaf sprites off-view — target low tier <= ~400k tris and <= ~4 ms mean on the 4090 at the gameplay camera, with the town still looking like itself.' },
]

const DONE = { type: 'object', properties: { summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } },
  screenshots: { type: 'array', items: { type: 'string' } }, commands_run: { type: 'array', items: { type: 'string' } } },
  required: ['summary', 'files', 'screenshots', 'commands_run'] }
const VERDICT = { type: 'object', properties: { pass: { type: 'boolean' }, evidence: { type: 'string', description: 'what you rendered and saw, with paths' },
  screenshots: { type: 'array', items: { type: 'string' } },
  problems: { type: 'array', items: { type: 'object', properties: { owner: { type: 'string', description: 'lead or a piece id (house-N, clocktower, dais, foliage, ground, props, life)' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['owner', 'problem', 'fix'] } } },
  required: ['pass', 'evidence', 'screenshots', 'problems'] }

phase('Implement')
const impl = await agent(`${CONTEXT}
You are the TOWN LEAD (you may edit src/town/{layout,kit,api,town,palette}.js and other non-piece src/town files, scenes/town*.js,
tools/town*, docs/TOWN.md; for piece files make only minimal, surgical changes needed for these requests and note them).
Implement EVERY user request below (they are also in docs/TOWN.md §11 with more detail). Some may already be done by the previous
run: check each by rendering, and finish what is missing. Requests:
${REQUESTS.map((r) => `- [${r.id}] ${r.text}`).join('\n')}
Render scenes/town.js at gameplay (focus dais, south seats, each corner, each side row), overview and iso, noon/golden/night, and look.`,
  { label: 'lead:implement', phase: 'Implement', schema: DONE })

const verify = (r, round) => agent(`${CONTEXT}
You are an independent, skeptical VERIFIER (round ${round}). Do not edit files except shots/verify-${r.id}-r${round}/.
Check exactly this user request and nothing else: "${r.text}"
Render whatever proves or disproves it (gameplay camera at the relevant spots, overview, times of day, --bench, GIF frames as needed) and
look at every image. pass=true only if a demanding user looking at your renders would agree it is fully done. Otherwise list problems
with the owning file/piece and a concrete fix.`, { label: `verify:${r.id}:r${round}`, phase: 'Verify', schema: VERDICT })

let open = REQUESTS
const history = []
for (let round = 1; round <= 3 && open.length; round++) {
  phase('Verify')
  const verdicts = await parallel(open.map((r) => () => verify(r, round).then((v) => ({ r, v }))))
  const failed = verdicts.filter((x) => x && x.v && !x.v.pass)
  history.push(verdicts.filter(Boolean).map((x) => ({ id: x.r.id, round, pass: x.v && x.v.pass, evidence: x.v && x.v.evidence })))
  log(`round ${round}: ${verdicts.filter((x) => x && x.v && x.v.pass).length}/${open.length} verified`)
  if (!failed.length || round === 3) { open = failed.map((x) => x.r); break }
  phase('Fix')
  const byOwner = {}
  for (const f of failed) for (const p of f.v.problems) (byOwner[p.owner] = byOwner[p.owner] || []).push({ request: f.r.id, ...p })
  await parallel(Object.keys(byOwner).map((o) => () => agent(`${CONTEXT}
You own ${o === 'lead' ? 'the lead files (src/town non-piece files, scenes/town*.js, tools/town*, docs/TOWN.md)' : `src/town/pieces/${o}.js (or src/town/life/* if you are 'life') and shots/town-${o}/`}. Other fixers work in parallel on other files: edit only yours.
Independent verifiers found these problems with the user's requests (owner ${o}):
${JSON.stringify(byOwner[o], null, 1)}
Fix every one, re-render in context (scenes/town.js) and look at the result.`, { label: `fix:${o}:r${round}`, phase: 'Fix', schema: DONE })))
  open = failed.map((x) => x.r)
}

phase('Gallery')
const gallery = await agent(`${CONTEXT}
You are the GALLERY agent (own docs/TOWN_GALLERY.md and shots/town-gallery/). Refresh the gallery for the final town: overview noon /
golden / night, iso, gameplay camera at 6 spots around the square (noon + night), the life GIFs (doors, smoke, crows, clock strike,
voting ceremony, dusk->night), both quality tiers with bench numbers, and a contact sheet. Add a "User requests" section with each request's
verified status: ${JSON.stringify(history)} (still failing after 3 rounds: ${JSON.stringify(open.map((r) => r.id))}). Honest known flaws.`,
  { label: 'gallery', phase: 'Gallery', schema: DONE })

return { implement: impl && impl.summary, history, stillFailing: open.map((r) => r.id), gallery: gallery && { summary: gallery.summary, screenshots: gallery.screenshots } }
