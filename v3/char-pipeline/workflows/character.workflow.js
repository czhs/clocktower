// Character workflow: author → critic → refine → final critic → learnings, one pipeline per character.
//
// Claude Code (Workflow tool): run this script from the kit root with args, e.g.
//   { "id": "lamplighter", "name": "Lamplighter", "blurb": "Lights the lamps at dusk; a long pole, a sooty coat." }
//   { "characters": [ { "id": "a", "name": "…", "blurb": "…" }, { "id": "b", … } ], "wave": 4 }
// optional per character: refImage (path to a reference image inside the kit, view only), clips (array: overrides
// game-profile.json's list), gameSpeed (body-heights/s: overrides game-profile.json game.heightsPerSecond).
// Any other agent: treat this file as a runbook — every agent(`…`) call below is one prompt for a fresh session, in
// order; give each step the previous step's JSON result where the prompt interpolates it.
// Adapted from the upstream pixel3d run-04/05 workflows (author → critic → refine with a 24-point rubric, plus a
// lead that merges lessons between waves). Nothing here assumes a particular machine: renders run where the kit runs.
export const meta = {
  name: 'charkit-character',
  description: 'Make new 3D-pixel-art characters with the charkit: author (AGENTS.md stages 1-4) -> critic -> refine -> final critic, then merge learnings',
  whenToUse: 'args: { id, name, blurb, refImage?, clips?, gameSpeed? } or { characters: [ … ], wave?: 4 }',
  phases: [
    { title: 'Author', detail: 'design sheet, model, clips, charpack, self-critique' },
    { title: 'Critique', detail: 'independent art director scores the rubric from its own renders' },
    { title: 'Refine', detail: 'author fixes every character-owned issue' },
    { title: 'Final score', detail: 'second independent critic: ship / no-ship' },
    { title: 'Learnings', detail: 'merge lessons into LEARNINGS.md, list module issues' },
  ],
}

const A = args || {}
const CHARS = A.characters || (A.id ? [{ id: A.id, name: A.name, blurb: A.blurb, refImage: A.refImage, clips: A.clips, gameSpeed: A.gameSpeed }] : [])
if (!CHARS.length) throw new Error('pass args { id, name, blurb } or { characters: [...] }')
for (const c of CHARS) if (!/^[a-z][a-z0-9-]*$/.test(c.id || '')) throw new Error(`bad id '${c.id}': use [a-z][a-z0-9-]*`)
const WAVE = A.wave || 4

const CONTEXT = `You work in the charkit: a three.js "3D pixel art" character kit (t3ssel8r / David Holland style). The current
directory is the kit root; work ONLY inside it (and your own scratch dir). Read AGENTS.md first and follow it — it is the
procedure, the rubric, the meaning of every check, and the ground rules. Also read LEARNINGS.md (mistakes others already
made), docs/CHARACTERS.md (spec contract) and one exemplar (characters/duelist.js + .md; keeper and hound for robes/props
and quadrupeds). Renders run on this machine with tools/charpack.sh and tools/shot.sh (see AGENTS.md §1).
LOOK at every PNG/GIF you rely on. Page/shader errors = failure. Deterministic code only. No git commits.
Never a raw rm (use tools/clean.sh or a fresh --out folder), no sudo, nothing outside the kit.
Never claim anything you did not render and look at; record every command you ran.`

const brief = (c) => `"${c.id}" — ${c.name || c.id}: "${c.blurb || '(no blurb: ask nothing, infer a simple appealing design)'}"` +
  (c.refImage ? ` Reference image (identity source, view only): ${c.refImage}.` : '')
const clipsOf = (c) => c.clips ? `Clips for this character: ${c.clips.join(', ')} (use --clips ${c.clips.join(',')},turn instead of --preset profile).`
  : 'Clips: the list in game-profile.json (render with --preset profile).'
const speedOf = (c) => c.gameSpeed ? `Game speed for this character: ${c.gameSpeed} body-heights/s (set spec.gameSpeed.v and locomotion.walkSpeed = ${c.gameSpeed} x height; pass --game-speed <m/s> to charpack).`
  : 'Game speed: game-profile.json game.heightsPerSecond x the character height (AGENTS.md §5).'
const own = (id) => `You own ONLY characters/${id}.js, characters/${id}.md and shots/char-${id}*/ (plus appending to LEARNINGS.md
"Your project's lessons"). Other agents may work on other characters in the same tree. Shared code (src/, scenes/, tools/)
is read-only for you: work around problems in your spec and list them in module_issues.`

const DONE = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' }, description: 'best 3-6 PNG/GIF paths that show the result' },
    commands_run: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string', description: 'the final report.txt summary line and every FAIL/WARN row' },
    self_score: { type: 'number' },
    module_issues: { type: 'array', items: { type: 'string' } },
    learnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files', 'screenshots', 'commands_run', 'checks', 'self_score', 'module_issues', 'learnings'],
}
const SCORE = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    ship: { type: 'boolean', description: '>= 19/24 and no zero on criteria 1, 2, 3, 7' },
    per_criterion: { type: 'array', items: { type: 'object', properties: { criterion: { type: 'string' }, score: { type: 'number' }, note: { type: 'string' } }, required: ['criterion', 'score', 'note'] } },
    issues: { type: 'array', items: { type: 'object', properties: {
      owner: { type: 'string', description: "'character' (fixable in the spec) or a module: rig|motion|look|fx|tools" },
      severity: { type: 'string', enum: ['high', 'medium', 'low'] }, problem: { type: 'string' }, fix: { type: 'string' } },
      required: ['owner', 'severity', 'problem', 'fix'] } },
    self_score_gap: { type: 'string', description: 'author self-score vs yours, per criterion where they differ' },
    process_gaps: { type: 'array', items: { type: 'string' }, description: 'where AGENTS.md / the tools misled the author' },
    evidence: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string' },
  },
  required: ['score', 'ship', 'per_criterion', 'issues', 'process_gaps', 'evidence', 'verdict'],
}

const critic = (c, round, prev, selfScore) => agent(`${CONTEXT}
You are a demanding ART DIRECTOR and pixel-art animator (round ${round}). Do not edit any file except your own renders in
shots/critic-${c.id}-r${round}/ . Critique ${brief(c)} — characters/${c.id}.js and its design sheet characters/${c.id}.md.
${clipsOf(c)} ${speedOf(c)}
Render everything yourself (never reuse the author's numbers): tools/charpack.sh ${c.id} --preset profile --raw --out shots/critic-${c.id}-r${round}
plus your own 8-facing stills of every key of every clip, 1x crops at dir 1, golden/night/pillar-shadow scene crops, a 25 % silhouette
line-up against the other characters in characters/, and the 1x GIFs (clip-<c>-1x.gif, game-1x.gif) at real time.
Score the AGENTS.md §3 rubric 0-2 per criterion with pixel-located notes (file + facing/frame + number). Judge the sheet's
"Unique to me" answers against the renders: are the character's own parts animated, is its gait its own and slide-free at game
speed, do expressions read at 1x? Missing uniqueness = an issue. Owner 'character' for spec-fixable issues, a module owner for
shared-code issues. ${selfScore != null ? `The author self-scored ${selfScore}/24: report the gap.` : ''}
${prev ? `Previous round: score ${prev.score}; issues ${JSON.stringify(prev.issues)}. Check each one in the render that showed it.` : ''}`,
  { label: `critic:${c.id}:r${round}`, phase: round === 1 ? 'Critique' : 'Final score', schema: SCORE })

const runOne = (c) => pipeline([c],
  (c) => agent(`${CONTEXT}
${own(c.id)}
Make a new character ${brief(c)}
${clipsOf(c)} ${speedOf(c)}
If characters/${c.id}.js / .md already exist they are YOUR earlier, unreviewed work from an interrupted run: read them,
re-render, continue (keep what works). Otherwise start with: tools/new-character.sh ${c.id} "${(c.name || c.id).replace(/"/g, "'")}" "<the blurb>".
Follow AGENTS.md §2 stages 1-4 in order, rendering and LOOKING at every stage's output before moving on: design sheet
(including "Unique to me" and the game-speed arithmetic) -> blockout turnaround -> model + palette -> poses + clips ->
secondary motion + FX -> game-speed pass -> full charpack -> SELF-CRITIQUE table with pixel evidence in the sheet.
Only report a self_score you can back with evidence; when in doubt score 1. Append lessons to LEARNINGS.md.`,
    { label: `author:${c.id}`, phase: 'Author', schema: DONE }),
  (built, c) => critic(c, 1, null, built && built.self_score).then((c1) => ({ built, c1 })),
  (s, c) => agent(`${CONTEXT}
${own(c.id)}
You authored ${brief(c)}. The art director scored it ${s.c1 ? s.c1.score : '?'}/24:
${JSON.stringify(s.c1 || {}, null, 1)}
Fix every issue with owner 'character' (all severities). Re-verify each fix in the SAME render that showed the problem and on
the 8-facing still, re-run the full charpack (--out shots/char-${c.id}/r2), re-check the 1x GIFs at game speed, and rewrite the
design sheet from the current code (sheet = code), including the self-critique table. For module issues: best workaround in
your spec + list them in module_issues. Append new lessons to LEARNINGS.md.`,
    { label: `refine:${c.id}`, phase: 'Refine', schema: DONE }).then((refined) => ({ ...s, refined })),
  (s, c) => critic(c, 2, s.c1, s.refined && s.refined.self_score).then((c2) => ({ id: c.id, ...s, c2 })),
)

const results = []
for (let i = 0; i < CHARS.length; i += WAVE) {
  const wave = CHARS.slice(i, i + WAVE)
  const done = (await parallel(wave.map((c) => () => runOne(c)))).flat().filter(Boolean)
  results.push(...done)
  log(done.map((r) => `${r.id}: ${r.c1 ? r.c1.score : '?'} -> ${r.c2 ? r.c2.score : '?'}/24 ${r.c2 && r.c2.ship ? 'SHIP' : 'no-ship'}`).join(' | '))
  if (i + WAVE < CHARS.length) {
    // between waves: merge lessons so the next wave avoids them
    await agent(`${CONTEXT}
You are the CHARACTER PIPELINE LEAD between waves. You may edit LEARNINGS.md and AGENTS.md only. Results of this wave:
${JSON.stringify(done.map((r) => ({ id: r.id, self: r.built && r.built.self_score, critic: r.c2 && { score: r.c2.score, issues: r.c2.issues, gaps: r.c2.process_gaps },
  module_issues: [...((r.built && r.built.module_issues) || []), ...((r.refined && r.refined.module_issues) || [])] })), null, 1)}
Merge new lessons into LEARNINGS.md ("Your project's lessons": symptom -> cause -> rule with numbers; mark ones that hit several
characters **(recurring)**), fix every process gap the critics found in AGENTS.md, and keep a "## Module issues" list at the end
of LEARNINGS.md (owner, severity, evidence). Return a 5-line summary.`, { label: `wave-lead:${i / WAVE + 1}`, phase: 'Learnings' })
  }
}

phase('Learnings')
const consolidated = await agent(`${CONTEXT}
You are the LEAD. You may edit LEARNINGS.md and AGENTS.md only. ${results.length} character(s) were made:
${JSON.stringify(results.map((r) => ({ id: r.id, first: r.c1 && { score: r.c1.score, issues: r.c1.issues, gaps: r.c1.process_gaps },
  final: r.c2 && { score: r.c2.score, ship: r.c2.ship, verdict: r.c2.verdict, issues: r.c2.issues, gaps: r.c2.process_gaps },
  module_issues: [...((r.built && r.built.module_issues) || []), ...((r.refined && r.refined.module_issues) || [])] })), null, 1)}
1) Consolidate LEARNINGS.md "Your project's lessons" (dedupe, keep numbers, mark **(recurring)**). 2) Promote recurring lessons
into AGENTS.md checklists so the next author cannot repeat them. 3) Write/refresh "## Module issues" at the end of LEARNINGS.md
(shared-code problems per owner with severity and evidence). Return a short summary.`, { label: 'consolidate', phase: 'Learnings' })

return {
  characters: results.map((r) => ({ id: r.id, self: r.built && r.built.self_score, first: r.c1 && r.c1.score, final: r.c2 && r.c2.score,
    ship: r.c2 && r.c2.ship, verdict: r.c2 && r.c2.verdict, screenshots: (r.refined && r.refined.screenshots) || (r.built && r.built.screenshots) })),
  consolidated,
}
