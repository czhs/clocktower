export const meta = {
  name: 'pixel3d-ui-convert',
  description: 'Convert every v2 Clocktower visual/UI element (emote palette, pointing finger, location ping/pins, labels, bubbles, portraits/icons, HUD/clock/font, panel kit, game-event FX) into the pixel3d art style as a drop-in asset library + mock HUD scene',
  whenToUse: 'after the cast run; args: { root? }',
  phases: [
    { title: 'Foundation', detail: 'inventory v2 visuals, UI contract docs/UI.md, refs/ui crops, atlas/bake tooling, mock HUD scene' },
    { title: 'Elements', detail: 'one owner per element group: build -> critic -> refine' },
    { title: 'Module fix', detail: 'fix shared ui/tooling bugs the groups hit' },
    { title: 'Integrate', detail: 'mock game screen with everything; whole-screen critic; fixes; UI_GALLERY.md' },
  ],
}

const ROOT = (args && args.root) || '~/Desktop/Projects/pixel3d'
const GAME = '~/Desktop/pipgws'

const CONTEXT = `Project: ${ROOT} — pixel3d, a three.js r170 "3D pixel art" renderer (t3ssel8r / David Holland style) that now has the Clocktower
cast (characters/*), an ambient library (src/ambient/*) and a town rebuild (src/town/**, owned by ANOTHER session: never edit it).
Task family: convert the Clocktower v2 game's visual/UI elements into this new art style as a pixel3d ASSET LIBRARY (not into the live game).
The Clocktower game repo ${GAME} is READ ONLY reference (packages/assets/scripts/{social,fx,cast,...}, packages/assets/generated/*.json|png,
apps/client/src/ui/**, apps/client/src/game/{social,fx}/*). Work ONLY inside ${ROOT} (and your scratchpad).
Nothing executes on the Mac: render via tools/remote.sh / tools/shot.sh / tools/charpack.sh (RTX 4090 host render-host). NEVER run anything on game-host.
NEVER run a raw rm command (use tools/clean.sh or fresh folders) — unattended runs stall on rm prompts. No git commits. Deterministic code only.
LOOK at every PNG/GIF you rely on with the Read tool. Never claim anything you did not render and look at.
Skipped for now (user): the cast member listed in pipeline/skip.txt and anything tied to it (its icon/portrait and the "nick face" emote) — leave them out.
Read first: docs/UI.md (the contract, once it exists), docs/ART_DIRECTION.md (palette + rubric), docs/PIPELINE.md, docs/TECHNIQUES.md, and
docs/CAST_PORTING.md (game speed, cast rules).`

const DONE = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' }, description: 'best 3-6 absolute PNG/GIF paths' },
    commands_run: { type: 'array', items: { type: 'string' } },
    self_score: { type: 'number' },
    module_issues: { type: 'array', items: { type: 'string' } },
    learnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files', 'screenshots', 'commands_run', 'module_issues', 'learnings'],
}
const SCORE = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    ship: { type: 'boolean' },
    per_criterion: { type: 'array', items: { type: 'object', properties: { criterion: { type: 'string' }, score: { type: 'number' }, note: { type: 'string' } }, required: ['criterion', 'score', 'note'] } },
    issues: { type: 'array', items: { type: 'object', properties: { owner: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['owner', 'severity', 'problem', 'fix'] } },
    evidence: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string' },
  },
  required: ['score', 'ship', 'per_criterion', 'issues', 'evidence', 'verdict'],
}

phase('Foundation')
const foundation = await agent(`${CONTEXT}
You are the UI LEAD. Build the foundation every element owner will use:
1. INVENTORY every v2 visual element (read-only in ${GAME}): the social atlas (generated/social.json frames: pins + drop, point_<dir>_<f>
   pointing finger, ping, emote_point, icons per cast id), cast portraits (cast-portraits.*), the radial emote/pie menu + social palette
   (apps/client/src/ui/social/*), speech/talking bubbles + name labels + voice/speaking indicators (apps/client/src/game/social/*,
   apps/client/src/ui/voice, TownScene labels), HUD + hints (ui/hud), clock + Storyteller clock (ui/clock), lobby/notebook/story/storyteller
   panels (ui/*/*.css), the bitmap font (scripts/fx/font.ts), game fx (scripts/fx/*, game/fx/*: particles, overlays, lights) and any other
   visual. For each: name, where it is drawn (world-space sprite vs screen HUD), size/frames, how the game uses it (frame names!), and its
   group owner (below). Write it as docs/UI.md §1 "Inventory" (a table). Exclude what the town session owns (buildings, props, ground,
   foliage, town life) and the skipped cast member's items.
2. Crop/screenshot v2 references into refs/ui/<group>/*.png (upscaled, labelled; render with python/PIL on the render host via tools/remote.sh).
3. Define the NEW-STYLE UI LANGUAGE in docs/UI.md §2: how flat UI sits over the 3D pixel scene (texel scale, integer upscaling, outline and
   palette rules from ART_DIRECTION, which elements are rendered 3D-in-world vs 2D screen-space), a pixel font choice/spec, a panel/frame
   9-slice kit, icon grid, colour tokens (day/night variants), animation rules (stepped 8-12 fps, game speed).
4. Tooling: src/ui/kit.js (shared helpers), tools/uibake.* (bake atlases + JSON that keep the v2 FRAME NAMES so porting is drop-in), a mock
   HUD scene scenes/ui-hud.js (town-like backdrop or char-stage + cast members + slots for every element group), docs/UI.md §3 "Contract"
   (file ownership: src/ui/<group>/** + scenes/ui-<group>.js + shots/ui-<group>/ + out/ui/<group>.{png,json}), §4 groups and briefs.
Render the mock HUD scene and the refs sheets and look at them.`, { label: 'ui-lead', phase: 'Foundation', schema: DONE })
if (!foundation) throw new Error('HALT: ui-lead returned nothing (usage limit / API outage?)')

const GROUPS = [
  { key: 'markers', brief: 'world markers: the POINTING FINGER (8 directions x 3 frames, v2 point_<dir>_<f>), the LOCATION PING (ping_0..3) and MAP PINS (8 colours + drop animation pin_drop_0..3 + shadow) — the in-world pointers players use to point at each other and mark places.' },
  { key: 'emotes', brief: 'the EMOTE PALETTE and RADIAL PIE MENU (social palette UI), emote icons (emote_point etc.; leave out the skipped "nick face"), selection/hover states, open/close animation, and the in-world emote pop above a character.' },
  { key: 'indicators', brief: 'in-world INDICATORS: name labels (player / Storyteller gold / ghost variants), speaking + voice indicators (talking rings/waves, muted), speech/talking bubbles, the location indicator / "you are here", offscreen-player arrows.' },
  { key: 'portraits', brief: 'PORTRAITS and CAST ICONS rendered from the new 3D characters in characters/* (skip the skipped id): a consistent portrait camera/framing/lighting, alive / ghost / ghost-spent / dead variants, small icons (v2 icon_<id>) and portrait sheets (v2 cast-portraits).' },
  { key: 'hud', brief: 'the HUD: hints, role/status widgets, the CLOCK and the STORYTELLER CLOCK, timers, toasts, and the BITMAP PIXEL FONT (v2 scripts/fx/font.ts) used everywhere.' },
  { key: 'panels', brief: 'the PANEL KIT for lobby / notebook / story / storyteller / admin screens: 9-slice frames, buttons (normal/hover/pressed/disabled), tabs, scrolls/parchment, dividers, checkboxes, sliders, cursors — as a skin the existing UI can adopt.' },
  { key: 'events', brief: 'GAME-EVENT FX: night falling / dawn transition overlay, nomination and voting (hand-raise reveal, tally), execution / night death, ghost reveal, Storyteller appear/vanish "poof", game start/end banners. Non-graphic and cozy-gothic; no gore.' },
]
const own = (k) => `You own ONLY src/ui/${k}/**, scenes/ui-${k}.js, shots/ui-${k}/, out/ui/${k}.* (plus append-only notes in docs/UI.md "Learnings").
Shared src/ui/kit.js, tools/uibake.*, scenes/ui-hud.js are read-only for you: report needs in module_issues.`

// User (2026-10-16): at most 4 element groups in parallel.
const PAR = (args && args.parallel) || 4
const runGroups = (list) => pipeline(list,
  (g) => agent(`${CONTEXT}
${own(g.key)}
Convert the v2 element group "${g.key}" into the new style: ${g.brief}
Follow docs/UI.md (inventory rows for your group, the UI language, the contract) and look at refs/ui/${g.key}/ (v2 originals). Keep every v2
frame name so the atlas is a drop-in replacement. Make scenes/ui-${g.key}.js showing every element over the 3D scene (day + night, with cast
members), bake out/ui/${g.key}.{png,json} with tools/uibake, render GIFs of every animation at 1x real time, and put your elements into the
mock HUD scene slot. Self-critique against docs/ART_DIRECTION.md + docs/UI.md with pixel evidence before finishing.`,
    { label: `ui:${g.key}`, phase: 'Elements', schema: DONE }),
  (built, g) => agent(`${CONTEXT}
You are a demanding ART DIRECTOR for game UI in the t3ssel8r 3D-pixel-art style. Do not edit files except shots/critic-ui-${g.key}/.
Critique the UI group "${g.key}" (${g.brief}): src/ui/${g.key}/**, scenes/ui-${g.key}.js, out/ui/${g.key}.*. Render it yourself (1x crops at the
gameplay camera, day/night, over busy and calm backgrounds, all animations at 1x real time, next to the v2 originals in refs/ui/${g.key}/).
Judge: readability at game size, consistency with the 3D pixel world and the other UI groups, palette/outline discipline, animation timing,
completeness vs the docs/UI.md inventory (every v2 frame name present), drop-in compatibility. Score 0-2 per criterion of docs/ART_DIRECTION.md
(+ UI criteria from docs/UI.md), owner 'group' for fixable issues, 'kit'/'tools' for shared ones.`,
    { label: `critic:ui-${g.key}`, phase: 'Elements', schema: SCORE }).then((c1) => ({ built, c1 })),
  (s, g) => agent(`${CONTEXT}
${own(g.key)}
You built UI group "${g.key}". The art director scored it ${s.c1 ? s.c1.score : '?'}/24: ${JSON.stringify(s.c1 || {}, null, 1)}
Fix every issue with owner 'group', re-render and look, re-bake the atlas. List shared problems in module_issues. Add lessons to docs/UI.md.`,
    { label: `refine:ui-${g.key}`, phase: 'Elements', schema: DONE }).then((refined) => ({ key: g.key, ...s, refined })),
)
const groups = []
for (let i = 0; i < GROUPS.length; i += PAR) groups.push(...(await runGroups(GROUPS.slice(i, i + PAR))))
const gdone = groups.filter(Boolean)
if (gdone.length < GROUPS.length) throw new Error('HALT: a UI group was lost (usage limit / API outage?) — relaunch only the missing groups')

phase('Module fix')
await agent(`${CONTEXT}
You are the MODULE FIXER for the UI library. Shared issues reported by the groups: ${JSON.stringify(gdone.flatMap((r) => [...((r.built && r.built.module_issues) || []), ...((r.refined && r.refined.module_issues) || [])]))}
Fix them in src/ui/kit.js, tools/uibake.*, scenes/ui-hud.js (and src/chars / tools only if needed). Develop in an isolated copy (rsync the repo
minus shots/node_modules/.git to your scratchpad, render with PIXEL3D_RDIR=pixel3d-uifix), A/B against the current output of every group,
copy verified files back in one step, then re-bake every group atlas from the real repo. Document changes in docs/UI.md.`,
  { label: 'ui-module-fix', phase: 'Module fix', schema: DONE })

phase('Integrate')
const integ = await agent(`${CONTEXT}
You are the UI INTEGRATION LEAD. You may edit scenes/ui-hud.js, src/ui/kit.js, docs/UI.md and write docs/UI_GALLERY.md + shots/ui-gallery/.
Groups: ${JSON.stringify(gdone.map((r) => ({ key: r.key, score: r.c1 && r.c1.score })))}
Build the full MOCK GAME SCREEN in scenes/ui-hud.js: the town square at the gameplay camera with 6-10 cast members, every UI group live at once
(a player pointing at another, pins + ping, emote palette open, labels + speaking indicators + a bubble, HUD + clock, a panel open, a game-event
FX moment), at day, dusk and night. Render stills + GIFs at 1x real time; check perf and that it reads at game size. Write docs/UI_GALLERY.md
(per group: what was converted, atlas path, v2 frame-name coverage, best images) and a "Porting to Clocktower" section (how each atlas maps
onto the v2 files/frames; as notes only — never edit ${GAME}).`, { label: 'ui-integrate', phase: 'Integrate', schema: DONE })

const whole = await agent(`${CONTEXT}
You are the final ART DIRECTOR. Critique the whole mock game screen (scenes/ui-hud.js, docs/UI_GALLERY.md, shots/ui-gallery/): does the UI feel
like one coherent new style that belongs to this 3D pixel world, is everything readable at game size, is anything missing vs the docs/UI.md
inventory? Do not edit files except shots/critic-ui-whole/. Score with the same rubric.`, { label: 'critic:ui-whole', phase: 'Integrate', schema: SCORE })

await agent(`${CONTEXT}
You are the UI INTEGRATION LEAD again. Final critic: ${JSON.stringify(whole || {}, null, 1)}
Fix every issue you can in shared files (scenes/ui-hud.js, src/ui/kit.js) and, for group-specific ones, make the smallest safe fix in that group's
files (the group agents are finished). Re-render, update docs/UI_GALLERY.md and docs/UI.md "Learnings", return a short summary.`,
  { label: 'ui-final-fix', phase: 'Integrate' })

return { groups: gdone.map((r) => ({ key: r.key, critic: r.c1 && r.c1.score, self: r.refined && r.refined.self_score,
  shots: (r.refined && r.refined.screenshots) || (r.built && r.built.screenshots) })), integration: integ && integ.screenshots,
  whole: whole && { score: whole.score, verdict: whole.verdict } }
