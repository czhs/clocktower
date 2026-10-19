export const meta = {
  name: 'pixel3d-character',
  description: 'Make new pixel3d characters from briefs: author (playbook stages 0-5) -> critic -> fix -> final critic, then consolidate learnings',
  whenToUse: 'args: { briefs: [{ name, brief }], root? } — one pipeline per character, in parallel',
  phases: [
    { title: 'Author', detail: 'one agent per brief follows docs/CHARACTER_PLAYBOOK.md stages 0-5' },
    { title: 'Critique', detail: 'art director scores against the rubric + t3ssel8r refs' },
    { title: 'Refine', detail: 'author fixes every issue it owns; module issues are reported, not patched' },
    { title: 'Final score', detail: 'independent second critic, ship / no-ship' },
    { title: 'Learnings', detail: 'consolidate lessons into the playbook / learnings / module requests' },
  ],
}

const ROOT = (args && args.root) || '~/Desktop/Projects/pixel3d'
const BRIEFS = (args && args.briefs) || []
if (!BRIEFS.length) throw new Error('pass args.briefs = [{ name, brief }]')

const CONTEXT = `Project: ${ROOT} — pixel3d, a three.js r170 "3D pixel art" renderer (t3ssel8r / David Holland style) with a
character pipeline (src/chars/*). Side project: work ONLY inside ${ROOT} (and your session scratchpad).
Read first: ${ROOT}/docs/CHARACTER_PLAYBOOK.md (the procedure + rubric — follow it), ${ROOT}/docs/CHARACTERS.md (contract,
spec format, APIs, file ownership), ${ROOT}/docs/CHARACTER_TECHNIQUES.md (numbers), ${ROOT}/docs/CHARACTER_LEARNINGS.md
(mistakes others already made — avoid them), and an existing finished character as a worked example (characters/wanderer.js
+ characters/wanderer.md). Reference look (third-party, view only): ${ROOT}/refs/chars/*.png and ${ROOT}/refs/*.png.
Nothing executes on the Mac: render on render-host (RTX 4090; never render-host, it is the Clocktower server) with tools/shot.sh / tools/charpack.sh (see PIPELINE.md and the playbook);
LOOK at every PNG/GIF frame you rely on with the Read tool. Page/shader errors = failure. Deterministic code only. No git commits.
Never claim anything you did not render and look at.`

const DONE = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' } },
    commands_run: { type: 'array', items: { type: 'string' } },
    charcheck: { type: 'string', description: 'the final charcheck table/JSON' },
    module_issues: { type: 'array', items: { type: 'string' }, description: 'problems in shared src/chars or tools you could not fix in your files (owner: problem)' },
    learnings: { type: 'array', items: { type: 'string' }, description: 'bullets you appended to docs/CHARACTER_LEARNINGS.md' },
  },
  required: ['summary', 'files', 'screenshots', 'commands_run', 'charcheck', 'module_issues', 'learnings'],
}
const SCORE = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    ship: { type: 'boolean', description: 'meets the ship bar in the playbook' },
    per_criterion: { type: 'array', items: { type: 'object', properties: { criterion: { type: 'string' }, score: { type: 'number' }, note: { type: 'string' } }, required: ['criterion', 'score', 'note'] } },
    issues: { type: 'array', items: { type: 'object', properties: {
      owner: { type: 'string', description: "'character' or a module owner: rig|motion|look|fx|tools|lead" },
      severity: { type: 'string', enum: ['high', 'medium', 'low'] }, problem: { type: 'string' }, fix: { type: 'string' } },
      required: ['owner', 'severity', 'problem', 'fix'] } },
    process_gaps: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string' },
  },
  required: ['score', 'ship', 'per_criterion', 'issues', 'process_gaps', 'verdict'],
}

const own = (n) => `You own ONLY characters/${n}.js, characters/${n}.md and shots/char-${n}/ (plus append-only
docs/CHARACTER_LEARNINGS.md). Other character agents work in parallel in the same tree on their own files. Shared code
(src/chars/*, tools/*, src/world/*) is read-only for you: if it blocks you, work around it in your spec and report it in module_issues.`

const critique = (b, round, prev) => agent(`${CONTEXT}
You are a demanding ART DIRECTOR and pixel-art animator (round ${round}). Do not edit files except shots/critic-${b.name}-r${round}/
and an appended critic section in docs/CHARACTER_LEARNINGS.md. Critique the character "${b.name}" (characters/${b.name}.js,
design sheet characters/${b.name}.md) for the brief: "${b.brief}".
Run tools/charpack.sh ${b.name} --clips idle,walk,run,<actions>,hurt,turn --out shots/critic-${b.name}-r${round} and make your own extra renders
(1x crops, 60 Hz strips around actions, in-scene golden/night, idle + whole-texel camera pan). Compare with refs/chars (t3ssel8r).
${prev ? `Previous round: score ${prev.score}, issues ${JSON.stringify(prev.issues)}. Check each was fixed.` : ''}
Score every rubric criterion 0-2 with a concrete note (pixel locations). Issues: owner 'character' for anything fixable in the
spec, a module owner for shared-code problems. process_gaps: where the playbook/tools misled the author.`,
  { label: `critic:${b.name}:r${round}`, phase: round === 1 ? 'Critique' : 'Final score', schema: SCORE })

const results = await pipeline(BRIEFS,
  (b) => agent(`${CONTEXT}
${own(b.name)}
Make a new character "${b.name}". Brief: "${b.brief}".
If characters/${b.name}.js / .md already exist, they are YOUR partial, unreviewed work from an interrupted run: read them,
re-render to see where they stand, and continue from them (keep what works) rather than starting over.
Follow docs/CHARACTER_PLAYBOOK.md stages 0-5 in order, rendering and looking at every stage's output before moving on
(design sheet -> blockout turnaround -> model + palette -> poses + clips -> secondary motion -> FX). Clips: idle, walk, run plus
the actions the brief implies (at least one with a smear or a strong anticipation/follow-through), hurt. Run the full
tools/charpack.sh ${b.name} --clips idle,walk,run,<actions>,hurt,turn at the end and include the charcheck numbers (report.txt). Iterate until you believe it scores >= 19/24.
Append your lessons to docs/CHARACTER_LEARNINGS.md before finishing.`, { label: `author:${b.name}`, phase: 'Author', schema: DONE }),
  (built, b) => critique(b, 1).then((c) => ({ built, c1: c })),
  (s, b) => agent(`${CONTEXT}
${own(b.name)}
You authored "${b.name}" (brief: "${b.brief}"). The art director scored it ${s.c1 ? s.c1.score : '?'}/24:
${JSON.stringify(s.c1 || {}, null, 1)}
Fix every issue with owner 'character' (all severities), re-render each fix and look at it, rerun tools/charpack.sh ${b.name} --clips idle,walk,run,<actions>,hurt,turn.
For module issues you cannot fix, find the best workaround in your spec and list the module problem in module_issues.
Append any new lessons to docs/CHARACTER_LEARNINGS.md.`, { label: `refine:${b.name}`, phase: 'Refine', schema: DONE })
    .then((refined) => ({ ...s, refined })),
  (s, b) => critique(b, 2, s.c1).then((c2) => ({ name: b.name, brief: b.brief, ...s, c2 })),
)

const done = results.filter(Boolean)
log(done.map((r) => `${r.name}: ${r.c1 ? r.c1.score : '?'} -> ${r.c2 ? r.c2.score : '?'}/24 ${r.c2 && r.c2.ship ? 'SHIP' : 'no-ship'}`).join(' | '))

phase('Learnings')
const consolidated = await agent(`${CONTEXT}
You are the LEAD for the character pipeline. You may edit docs/CHARACTER_PLAYBOOK.md, docs/CHARACTER_LEARNINGS.md,
docs/CHARACTERS.md, docs/CHARACTER_TECHNIQUES.md (nothing else). ${done.length} characters were just made by separate agents:
${JSON.stringify(done.map((r) => ({ name: r.name, brief: r.brief, first: r.c1 && { score: r.c1.score, issues: r.c1.issues, gaps: r.c1.process_gaps },
  final: r.c2 && { score: r.c2.score, ship: r.c2.ship, verdict: r.c2.verdict, issues: r.c2.issues, gaps: r.c2.process_gaps },
  module_issues: [...((r.built && r.built.module_issues) || []), ...((r.refined && r.refined.module_issues) || [])] })), null, 1)}
1) Consolidate docs/CHARACTER_LEARNINGS.md: merge duplicates, keep it sorted by section, keep every distinct lesson (symptom ->
   cause -> rule, with numbers), mark rules that recurred across characters as **(recurring)**.
2) Promote recurring lessons into docs/CHARACTER_PLAYBOOK.md (the procedure/checklists) so the next agent cannot repeat them;
   fix every process gap the critics found.
3) Write the module backlog: a "## Module backlog" section at the end of CHARACTER_LEARNINGS.md listing shared-code issues per
   owner with severity (these are fixed by a later build round, not by you).
Return a short summary of what changed.`, { label: 'consolidate', phase: 'Learnings' })

return { characters: done.map((r) => ({ name: r.name, first: r.c1 && r.c1.score, final: r.c2 && r.c2.score, ship: r.c2 && r.c2.ship,
  verdict: r.c2 && r.c2.verdict, screenshots: (r.refined && r.refined.screenshots) || (r.built && r.built.screenshots) })), consolidated }
