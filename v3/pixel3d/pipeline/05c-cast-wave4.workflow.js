export const meta = {
  name: 'pixel3d-cast-wave4',
  description: 'Continue run 05 after the usage-limit halt: cast waves 3-4 (author -> critic -> refine, wave lead, module fix), touch-ups (point/ghost clips) for waves 1-2, ambient gallery integration, final learnings',
  whenToUse: 'args: { cast: [{ id, name, blurb, kind, course?, lantern? }], wave?: 4, root? }',
  phases: [
    { title: 'Upgrade', detail: 'module owners fix the run-04 backlog + body plans; cast refs; ambient core API' },
    { title: 'Regression', detail: 're-render wanderer/keeper/hound/duelist with the upgraded modules' },
    { title: 'Cast', detail: 'waves of 4 characters: author -> critic -> refine; learnings merged after each wave' },
    { title: 'Ambient', detail: 'one owner per system: build -> critic -> refine' },
    { title: 'Integrate', detail: 'ambient gallery scene with a walking cast member triggering everything' },
    { title: 'Learnings', detail: 'final consolidation of character + ambient docs' },
  ],
}

const ROOT = (args && args.root) || '~/Desktop/Projects/pixel3d'
const CAST = (args && args.cast) || []
const WAVE = (args && args.wave) || 4
if (!CAST.length) throw new Error('pass args.cast')
const GAME = '~/Desktop/pipgws'

const CONTEXT = `Project: ${ROOT} — pixel3d, a three.js r170 "3D pixel art" renderer (t3ssel8r / David Holland style) with a
character pipeline (src/chars/*). Side project: work ONLY inside ${ROOT} (and your session scratchpad).
Nothing executes on the Mac: every render/command goes through tools/remote.sh, tools/shot.sh, tools/charpack.sh, which sync to
the RTX 4090 render host (ssh alias render-host). NEVER run anything on game-host (it is the live Clocktower game server).
LOOK at every PNG/GIF you rely on with the Read tool. Page/shader errors = failure. Deterministic code only (pure f(t), seeded).
No git commits. Never claim anything you did not render and look at.
Another Claude session is concurrently building the Hollowmere town in this repo (src/town/**, scenes/town*.js, docs/TOWN*.md,
shots/critic-house-*, shots/town*): never edit those. Shared render code (src/core, src/materials, src/post, src/world) may only change
if world scenes (shrine, glade, pond) AND scenes/town.js stay pixel-identical (A/B diff) — otherwise work around it.
The Clocktower game repo ${GAME} is READ ONLY for you (reference only).
NEVER run a raw rm command (use tools/clean.sh or fresh folders). Cast members are Clocktower player characters only: no combat clips (see the
rules at the top of docs/CHARACTER_PLAYBOOK.md and docs/CAST_PORTING.md, incl. the Storyteller and greenting notes and the skip list).
Adopt the opt-in module features from the playbook's "Module fixes" blocks where they fit: spec.lights (+ uCharTime glow) for anything carrying
a lantern/light (the Storyteller!), material.whiteKeep for white/cream-bodied characters, material.merge for ears/hood seams,
locomotion.plant 'hold', and include the game clips point + ghost + ghost-spent (not for the Storyteller).`

const DONE = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' }, description: 'best 3-6 PNG/GIF paths (absolute) that show the result' },
    commands_run: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string', description: 'final charcheck/report numbers or equivalent' },
    self_score: { type: 'number' },
    module_issues: { type: 'array', items: { type: 'string' } },
    learnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files', 'screenshots', 'commands_run', 'checks', 'module_issues', 'learnings'],
}
const SCORE = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    ship: { type: 'boolean' },
    per_criterion: { type: 'array', items: { type: 'object', properties: { criterion: { type: 'string' }, score: { type: 'number' }, note: { type: 'string' } }, required: ['criterion', 'score', 'note'] } },
    issues: { type: 'array', items: { type: 'object', properties: {
      owner: { type: 'string', description: "'character'/'system' (fixable by the author) or a module owner: rig|motion|look|fx|tools|lead|ambient-core" },
      severity: { type: 'string', enum: ['high', 'medium', 'low'] }, problem: { type: 'string' }, fix: { type: 'string' } },
      required: ['owner', 'severity', 'problem', 'fix'] } },
    process_gaps: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'array', items: { type: 'string' }, description: 'absolute paths of your best 2-4 evidence images' },
    verdict: { type: 'string' },
  },
  required: ['score', 'ship', 'per_criterion', 'issues', 'process_gaps', 'evidence', 'verdict'],
}

// ---------------------------------------------------------------- Phase 1: upgrade the pipeline
const RUN04 = `Input: run 04 (characters keeper/hound/duelist, wanderer reference) just finished: final critic scores hound 18, keeper 17,
duelist 19 (ship bar 19/24), round-1 scores 14-16, and authors self-scored 3-7 points too high. Read docs/CHARACTER_LEARNINGS.md (the
consolidated lessons and the "## Module backlog" at the end), docs/CHARACTER_PLAYBOOK.md, docs/CHARACTERS.md, and the critic evidence in
shots/critic-{keeper,hound,duelist}-r{1,2}/.`
const NEXT = `Next: 32 Clocktower cast members (${CAST.map((c) => c.id).join(', ')}) will be built with this pipeline. Most are ANIMALS or
non-humanoids: frogs/toads (hop), geese/parrot/owl/crow (birds, wings, waddle), moth (flying), snail + greenting (limbless glide/squash),
goat/cow/fox/red panda/otter/hedgehog/rabbit/mole (quadruped or upright animal), giraffe (long neck), shark in a beret (upright fish),
mushroom, skeleton. Required clips for every cast member: idle, walk, run, talk (speaking gesture, loops), vote (raise hand/wing/paw and
hold), die (collapse to a final held pose), plus one signature emote.`
const GAMESPEED = `GAME SPEED (from the live v2 game; match it RELATIVE TO BODY SIZE): v2 sprites are ~38 px tall in a 32x40 frame,
1 tile = 16 px = 1 m; players move at PLAYER_SPEED = 150 px/s (~4 body-heights per second; crossing the 45-tile town takes ~4 s) and the walk
plays 4 drawings at ~13 fps (a full cycle ~0.31 s, ~1.2 body-heights travelled per cycle); idle is a single drawing in v2. So a pixel3d cast member
of height H must look right travelling ~4 H/s with a cycle of ~0.3 s (a brisk scurry, not a stroll): stride length, cadence, bounce and foot
planting are tuned for THAT speed (0 foot slide at that speed), and every clip must read when played back at real time at the gameplay camera
(vh 10, 1x pixels) — judge GIFs at 1x real-time playback, not only contact sheets; drawings held 2-4 frames at 30 Hz.`
const UNIQUE = `WHAT IS UNIQUE TO THIS CHARACTER (answer in the design sheet BEFORE modelling, under "## Unique to me", and act on it):
(1) Extra animated parts: which secondary parts must move (ears, tail, wings, shell, antennae, scarf, beret, apron, phone, spores, lantern,
evidence papers...) and how (spring, keyed, FX)? (2) Locomotion: should it walk differently from everyone else (hop, waddle, glide, slither,
flap-hover, lumber, prance, scurry) and how does that gait stay readable and 0-slide at game speed? (3) Expressions in the new art style: how do
the v1 sprite's face/eyes/mouth translate to 3D pixel art at ~45-60 px tall (a few texels per eye; blinks, brows, beak/snout/mouth shapes,
eye glints, squash on the head; which expressions talk/vote/die/emote need and how they read at 1x)? (4) Game speed: will each clip look good
at the real gameplay speed and size (see GAME SPEED)? Plan timing/spacing for it and verify with 1x real-time GIFs.`


// ---------------------------------------------------------------- Phase 2: cast waves + ambient, concurrently
const castBrief = (c) => `"${c.id}" — ${c.name}${c.course ? ` (CMU ${c.course} mascot)` : ''}, ${c.kind}: "${c.blurb || '(NPC, no blurb: infer from the sprite)'}"${c.lantern ? ' — carries a light (warm quantized glow at dusk/night)' : ''}`
const own = (n) => `You own ONLY characters/${n}.js, characters/${n}.md, shots/char-${n}/ (plus append-only docs/CHARACTER_LEARNINGS.md).
Other agents build other characters in parallel. Shared code (src/chars/*, tools/*) is read-only for you: work around problems in your spec and
report them in module_issues.`
const CLIPS = 'idle,walk,run,talk,vote,die,<emote>,turn'

const critic = (c) => agent(`${CONTEXT}
You are a demanding ART DIRECTOR and pixel-art animator. Do not edit files except shots/critic-${c.id}/ and an appended critic note in
docs/CHARACTER_LEARNINGS.md. Critique cast member ${castBrief(c)} (characters/${c.id}.js, design sheet characters/${c.id}.md).
Identity source: refs/cast/${c.id}.png (its v1 2D sprite) and ${GAME}/packages/assets/scripts/cast/${c.id}.ts (read only). It must be
recognisably the same character. Run tools/charpack.sh ${c.id} with the standard cast clips (${CLIPS}) --out shots/critic-${c.id} and make your
own renders (1x crops at the pack facing, 60 Hz strips around action keys, all 8 facings of action keys, golden/night/pillar-shadow scene crops,
25 % silhouette vs other finished cast members in characters/, whole-texel pan). Use docs/CHARACTER_PLAYBOOK.md's rubric; score 0-2 per
criterion with pixel-located notes. owner 'character' for spec-fixable issues, a module owner for shared-code issues.
${GAMESPEED}
Also judge the author's "## Unique to me" answers: are the character's special parts animated, is its gait its own and slide-free at game speed,
do the expressions read at 1x in this style, and do the clips read as 1x real-time GIFs at game speed? Missing uniqueness = an issue.`,
  { label: `critic:${c.id}`, phase: 'Cast', schema: SCORE })

const castWave = async (wave, wi) => {
  log(`cast wave ${wi + 1}: ${wave.map((c) => c.id).join(', ')}`)
  const res = await pipeline(wave,
    (c) => agent(`${CONTEXT}
${own(c.id)}
Make cast member ${castBrief(c)} as a pixel3d character. Read docs/CAST_PORTING.md, docs/CHARACTER_PLAYBOOK.md (follow every stage including
the SELF-CRITIQUE stage), docs/CHARACTERS.md, docs/CHARACTER_TECHNIQUES.md, docs/CHARACTER_LEARNINGS.md, and look at refs/cast/${c.id}.png +
${GAME}/packages/assets/scripts/cast/${c.id}.ts (identity source of truth, read only). ${GAMESPEED}
${UNIQUE}
Pick the right body plan. Look at already finished cast
members in characters/ so the cast reads as one family (consistent scale, palette discipline) while every silhouette stays distinct.
Clips: ${CLIPS} (choose the emote from the blurb). Finish with tools/charpack.sh ${c.id} (standard cast clips) and a sprite-sheet bake; report the
numbers. Only report a self_score you can back with pixel evidence. Append lessons to docs/CHARACTER_LEARNINGS.md.`,
      { label: `author:${c.id}`, phase: 'Cast', schema: DONE }),
    (built, c) => critic(c).then((c1) => ({ built, c1 })),
    (s, c) => agent(`${CONTEXT}
${own(c.id)}
You authored cast member ${castBrief(c)}. The art director scored it ${s.c1 ? s.c1.score : '?'}/24:
${JSON.stringify(s.c1 || {}, null, 1)}
Fix every issue with owner 'character' (all severities), re-render each fix and look at it, rerun the full charpack + bake.
Re-check your "## Unique to me" answers and the game-speed 1x real-time GIFs after the fixes.
${GAMESPEED} Workaround module
issues in your spec and list them in module_issues. Append new lessons to docs/CHARACTER_LEARNINGS.md.`,
      { label: `refine:${c.id}`, phase: 'Cast', schema: DONE }).then((refined) => ({ id: c.id, ...s, refined })),
  )
  const done = res.filter(Boolean)
  if (done.length < wave.length) throw new Error(`HALT: wave ${wi + 1} lost ${wave.length - done.length} character(s) (usage limit / API outage?) — resume to retry`)
  log(`wave ${wi + 1}: ${done.map((r) => `${r.id} ${r.c1 ? r.c1.score : '?'}/24 (self ${r.built && r.built.self_score})`).join(' | ')}`)
  await agent(`${CONTEXT}
You are the CHARACTER PIPELINE LEAD between cast waves. You may edit docs/CHARACTER_PLAYBOOK.md, docs/CHARACTER_LEARNINGS.md,
docs/CAST_PORTING.md, docs/CHARACTER_TECHNIQUES.md, and — for small, clearly-scoped bugs that several characters hit — src/chars/* and tools/*
(re-render wanderer + one finished cast member to prove no regression). Wave ${wi + 1} results:
${JSON.stringify(done.map((r) => ({ id: r.id, self: r.built && r.built.self_score, critic: r.c1 && { score: r.c1.score, issues: r.c1.issues, gaps: r.c1.process_gaps },
  module_issues: [...((r.built && r.built.module_issues) || []), ...((r.refined && r.refined.module_issues) || [])] })), null, 1)}
Merge the new lessons (dedupe, mark **(recurring)**), promote recurring ones into the playbook / porting guide so the next wave avoids them, and
keep the "## Module backlog" current. Return a 5-line summary.`, { label: `wave-lead:${wi + 1}`, phase: 'Cast' })
  // User rule (2026-10-16): shared-code bugs are fixed as they arise, not left in the backlog for later.
  await agent(`${CONTEXT}
You are the MODULE FIXER after cast wave ${wi + 1}. Fix every high/medium item in the "## Module backlog" of docs/CHARACTER_LEARNINGS.md
that this wave hit (src/chars/*, tools/*). Develop in an isolated copy (rsync the repo minus shots/node_modules/.git to your scratchpad and
render it with PIXEL3D_RDIR=pixel3d-fix) so the live tree never breaks; copy verified files back in one step. Verify with before/after renders
you look at: no regression on finished cast members in characters/ (and wanderer); the fixed behaviour visible. Never edit characters/*.js.
Mark each backlog item FIXED (evidence path) or why not, and add a "Module fixes" note at the top of docs/CHARACTER_PLAYBOOK.md.`,
    { label: `module-fix:${wi + 1}`, phase: 'Cast', schema: DONE })
  return done
}

const runCast = async () => {
  const out = []
  for (let i = 0; i < CAST.length; i += WAVE) out.push(...(await castWave(CAST.slice(i, i + WAVE), i / WAVE + ((args && args.waveOffset) || 0))))
  return out
}

const SYSTEMS = [
  { key: 'birds', brief: 'bird flocks (pigeons/sparrows on the ground, crows on perches): peck/hop idle, ALERT then SCATTER into the air when a walker comes within a radius (boids-lite with stepped flap cycles), circle, then resettle on ground/perches after the walker leaves; dusk crows, no birds at night.' },
  { key: 'fire', brief: 'fire: campfire, wall torch, brazier, forge/hearth glow, candle; stepped flame shapes (not particles only), embers rising, smoke column, quantized flickering warm point light; flare-up when a walker passes close; extinguish/relight hooks.' },
  { key: 'fireflies', brief: 'night insects and glows: fireflies that gather in grass/near water at dusk-night, drift on stepped paths, scatter from walkers and re-gather; moths circling lamps; glow-worms; daytime butterflies/bees around flowers that flutter away when approached.' },
  { key: 'critters', brief: 'small critters: cats (sit/loaf on perches/doorsteps, tail flick, watch a walker, hop away if too close), chickens/ducks pecking and waddling away, frogs that hop into water, mice/rats scurrying between hiding spots, a dog that follows briefly.' },
  { key: 'foliage', brief: 'foliage reacting to walkers: grass tufts parting/bending around feet and springing back (stepped), bushes rustling with a leaf puff, flowers bobbing, falling leaves and petals drifting on wind, reeds swaying; all wind-driven with gusts.' },
  { key: 'air', brief: 'cloth, smoke and air: banners/flags/pennants, laundry lines, hanging cloth awnings on wind (stepped cloth sim or keyed), chimney smoke puffs, dust motes in sunbeams, footstep dust puffs + puddle splash ripples for walkers, wind gust lines.' },
  { key: 'props', brief: 'proximity-reactive props: hanging shop signs that swing when brushed, gates that creak open, lamps that light at dusk (and a lamplighter hook), wind chimes, a well bucket, bells that ring with a stepped swing, fountain splashes, a scarecrow; each with a small reaction when a walker approaches.' },
]
const sysOwn = (k) => `You own ONLY src/ambient/${k}.js (+ src/ambient/${k}/** if needed), scenes/ambient-${k}.js, shots/ambient-${k}/ (plus append-only
docs/AMBIENT.md "Learnings" section). src/ambient/core.js is the shared contract (read-only; report needs in module_issues).`

const runAmbient = () => pipeline(SYSTEMS,
  (s) => agent(`${CONTEXT}
${sysOwn(s.key)}
Build the ambient system "${s.key}": ${s.brief}
Read docs/AMBIENT.md (contract), docs/PIPELINE.md, docs/TECHNIQUES.md, docs/ART_DIRECTION.md (palette + rubric) and research/02-t3ssel8r.md +
05-t3ssel8r-characters.md (t3ssel8r's ambient animation: birds, grass, fire, butterflies are signature parts of his look). Everything stepped
(3-12 fps), deterministic, snapped to the texel grid, palette-disciplined, 1 draw call per system where possible, reacts to actors from the core
proximity registry. Make scenes/ambient-${s.key}.js (drop into the ambient stage with its scripted walker) and render frame strips + GIFs of
idle, reaction and recovery, day + night. Self-critique against the ART_DIRECTION rubric with pixel evidence before finishing.`,
    { label: `ambient:${s.key}`, phase: 'Ambient', schema: DONE }),
  (built, s) => agent(`${CONTEXT}
You are a demanding ART DIRECTOR for ambient animation (t3ssel8r reference: refs/*, research/02 + 05). Do not edit files except
shots/critic-ambient-${s.key}/. Critique the ambient system "${s.key}" (${s.brief}) — src/ambient/${s.key}.js, scenes/ambient-${s.key}.js.
Render it yourself (frame strips at 60 Hz, GIFs, day/night, whole-texel pan, with and without the walker). Score docs/ART_DIRECTION.md's
rubric 0-2 per criterion with pixel-located notes; also judge: does it read at gameplay zoom, is the reaction legible and charming, does it
stay calm (no sub-pixel glide, no flicker), perf/draw calls. owner 'system' for fixable-in-file issues, 'ambient-core' for contract issues.`,
    { label: `critic:ambient-${s.key}`, phase: 'Ambient', schema: SCORE }).then((c1) => ({ built, c1 })),
  (st, s) => agent(`${CONTEXT}
${sysOwn(s.key)}
You built ambient system "${s.key}". The art director scored it ${st.c1 ? st.c1.score : '?'}/24: ${JSON.stringify(st.c1 || {}, null, 1)}
Fix every issue with owner 'system', re-render and look, re-make the GIFs. List contract problems in module_issues. Add lessons to docs/AMBIENT.md.`,
    { label: `refine:ambient-${s.key}`, phase: 'Ambient', schema: DONE }).then((refined) => ({ key: s.key, ...st, refined })),
)


const TOUCH = (args && args.touchup) || []
const runTouchups = () => pipeline(TOUCH, (id) => agent(`${CONTEXT}
${own(id)}
TOUCH-UP for the finished cast member "${id}" (already authored, critiqued and refined — keep everything that works). Read the rules at the top of
docs/CHARACTER_PLAYBOOK.md and docs/CAST_PORTING.md (Clocktower-only clips, module fixes) and the "Module fixes" notes (shared code changed:
re-check boot/hem clearance and that walk still reads at game speed). Then: (1) ADD the game clips it lacks: **point** (point toward someone,
the game's shared emote), **ghost** idle (dead player hovering, pale) and **ghost-spent** (dimmer). Skip these for the storyteller. (2) If any
clip is combat-flavoured (weapon swing/flourish, strike smear, hurt reaction), turn it into a non-violent social gesture. (3) Re-render the
full cast pack + bake, LOOK at every new clip at 1x real time, and update characters/${id}.md. Append lessons to docs/CHARACTER_LEARNINGS.md.`,
  { label: `touchup:${id}`, phase: 'Cast', schema: DONE }))
const [cast, touched] = await parallel([runCast, runTouchups])
if (!cast || cast.filter(Boolean).length < CAST.length || !touched || touched.filter(Boolean).length < TOUCH.length)
  throw new Error('HALT: cast or ambient incomplete (usage limit / API outage?) — resume this run; finished agents replay from cache')

// ---------------------------------------------------------------- Phase 3: integrate + learnings
phase('Integrate')
const ambientDone = (args && args.priorAmbient) || []
const integration = await agent(`${CONTEXT}
You are the AMBIENT INTEGRATION LEAD. You may edit src/ambient/core.js, src/ambient/index.js, docs/AMBIENT.md, and create
scenes/ambient-gallery.js + shots/ambient-gallery/. Systems built: ${JSON.stringify(ambientDone.map((a) => ({ key: a.key, score: a.c1 && a.c1.score, issues: a.refined && a.refined.module_issues })))}
(1) Fix contract issues the owners reported. (2) Build scenes/ambient-gallery.js: a small cozy plaza (reuse src/world terrain/props/trees/water)
with every ambient system placed, and 2-3 finished cast members from characters/ walking scripted paths that trigger the reactions (birds
scatter, fireflies part, cat hops off, signs swing, grass parts), at noon, golden hour and night. (3) Render frame strips and GIFs of the whole
thing and of each reaction; check perf (draw calls, frame ms) and that all systems together stay deterministic and pan-stable. (4) Write a
"## Using the library" section in docs/AMBIENT.md, including how the town's life piece (src/town/life, owned by another session) can consume it via
TOWN.md anchors — as a CONTRACT-REQUEST note, never editing src/town.`, { label: 'ambient-integrate', phase: 'Integrate', schema: DONE })

phase('Learnings')
const castDone = [...((args && args.priorCast) || []), ...(cast || []).filter(Boolean)]
const final = await agent(`${CONTEXT}
You are the LEAD for the character pipeline. You may edit docs/CHARACTER_PLAYBOOK.md, docs/CHARACTER_LEARNINGS.md, docs/CHARACTERS.md,
docs/CHARACTER_TECHNIQUES.md, docs/CAST_PORTING.md, docs/AMBIENT.md, and write docs/CAST_GALLERY.md. All ${castDone.length} cast members are done:
${JSON.stringify(castDone.map((r) => ({ id: r.id, self: r.built && r.built.self_score, critic: r.c1 && r.c1.score, ship: r.c1 && r.c1.ship })))}
(1) Final consolidation of the learnings and module backlog (what still blocks shipping, per owner, ranked). (2) docs/CAST_GALLERY.md: a table of
every cast member (critic score, body plan, clips, best GIF path) and a cast line-up render: run a render of all finished characters side by side
(make a small scene or use char-stage options; look at it) at the pack facing + a 25 % silhouette line-up. (3) Evaluate how the self-critique
stage changed the self vs critic gap compared to run 04 (3-7 points) and write it down. Return a short summary.`, { label: 'final-lead', phase: 'Learnings' })

return {
  cast: castDone.map((r) => ({ id: r.id, self: r.built && r.built.self_score, critic: r.c1 && r.c1.score, ship: r.c1 && r.c1.ship,
    shots: (r.refined && r.refined.screenshots) || (r.built && r.built.screenshots) })),
  ambient: ambientDone.map((a) => ({ key: a.key, critic: a.c1 && a.c1.score, shots: (a.refined && a.refined.screenshots) || (a.built && a.built.screenshots) })),
  integration: integration && { summary: integration.summary, shots: integration.screenshots },
  final,
}