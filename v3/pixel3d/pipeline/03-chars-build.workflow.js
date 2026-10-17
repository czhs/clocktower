export const meta = {
  name: 'pixel3d-chars-build',
  description: 'Swarm-build the pixel3d character pipeline (rig, motion, look, fx, tools), integrate with a reference character, critique, fix',
  phases: [
    { title: 'Build modules', detail: 'rig, motion, look, fx, tools owners in parallel; each verifies with headless renders on render-host (RTX 4090; never render-host, it is the Clocktower server)' },
    { title: 'Integrate', detail: 'lead integrator: contract requests, index.js, reference character "wanderer" end to end' },
    { title: 'Critique', detail: 'art director scores the reference character with the rubric' },
    { title: 'Fix', detail: 'owners fix the critic issues in parallel' },
  ],
}

const ROOT = (args && args.root) || '~/Desktop/Projects/pixel3d'

const RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    summary: { type: 'string', description: '5-12 lines: what you built and how it looks/behaves now' },
    files: { type: 'array', items: { type: 'string' } },
    commands_run: { type: 'array', items: { type: 'string' }, description: 'every render/test command you actually ran, with pass/fail' },
    screenshots: { type: 'array', items: { type: 'string' }, description: 'paths under shots/ of your best final renders' },
    contract_requests: { type: 'array', items: { type: 'string' }, description: 'changes you need in files you do not own (owner: request)' },
    learnings: { type: 'array', items: { type: 'string' }, description: 'lessons you appended to docs/CHARACTER_LEARNINGS.md (symptom -> cause -> rule)' },
    known_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'summary', 'files', 'commands_run', 'screenshots', 'contract_requests', 'learnings', 'known_issues'],
}

const PREAMBLE = (owner) => `You are the "${owner}" agent in a swarm building a CHARACTER pipeline for pixel3d, a three.js r170
"3D pixel art" renderer (t3ssel8r / David Holland style) in ${ROOT}. This is a side project: work ONLY inside ${ROOT}
(and your session scratchpad). Never touch ~/Desktop/pipgws or ~/clocktower on any machine.

Goal of the whole effort: a process + code that lets agents reliably make NEW game characters (model, rig, animate,
render, bake) that look like t3ssel8r's 3D pixel-art characters.

Read before coding (in this order): ${ROOT}/docs/CHARACTERS.md (contract, conventions, file ownership, APIs),
${ROOT}/docs/CHARACTER_TECHNIQUES.md (decisions + numbers), ${ROOT}/docs/CHARACTER_PLAYBOOK.md (process + rubric),
${ROOT}/docs/CHARACTER_LEARNINGS.md, ${ROOT}/docs/PIPELINE.md (engine, material contract, rendering on render-host),
then the research sections relevant to you: ${ROOT}/research/05-t3ssel8r-characters.md and
${ROOT}/research/06-character-implementations.md (may still be growing). The working spike that proves skinning +
toon + outlines + snapping works: src/chars/spike.js + scenes/_spike-char.js (shots/lead-chars/spike-01.png).
Reference images of t3ssel8r's character (third-party, look only, never copy into the repo outside refs/):
${ROOT}/refs/chars/*.png (02b = his character at 8x, 03b = smear lifecycle, 01 = far-half shadow, 07/08 = in-game scale).

Rules:
- Edit only files you own per docs/CHARACTERS.md §2 (plus append-only additions to docs/CHARACTER_LEARNINGS.md and new
  exports in src/core/noise.js). Other agents edit their own files in the same tree at the same time; if a render breaks
  because of someone else's file, wait a minute and retry, or isolate your test scene — never edit theirs. Anything you
  need from others → contract_requests. Stubs that exist now: src/chars/look.js (look owner replaces it), src/chars/index.js
  (lead; it re-exports modules that may not exist yet — import the specific module files directly in tests).
- Nothing executes on the Mac. Render on render-host: cd ${ROOT} && tools/shot.sh <scene> shots/${owner}/<name>.png
  [--t 2] [--times a,b,c] [--size 1280x720] [--q scale=2&key=val] [--bench N] ; then LOOK at the PNG with the Read tool.
  Page/shader errors printed by shot.sh mean failure. Pixel-level inspection: --size 640x360 --q scale=1 then enlarge crops
  with python3 + PIL on the Mac (PIL is available locally for image inspection only), or tools/remote.sh python3 tools/sheet.py ...
  Do at least 4 render -> look -> fix cycles on your visible output.
- Deterministic: no Math.random/Date.now; everything a function of engine time t (stateful things re-simulate from 0 with a
  fixed step, see CHARACTERS.md §1).
- Do not git commit. Keep APIs as in CHARACTERS.md §5 (add options rather than change signatures; if you must deviate,
  update nothing outside your files and explain in contract_requests).
- Make it beautiful, not just correct: the bar is t3ssel8r's character in refs/chars.
- Before finishing, append your concrete lessons to docs/CHARACTER_LEARNINGS.md (symptom -> cause -> rule, with numbers).
- Never claim something works that you did not render and look at. Report every command in commands_run.
`

const MODULES = [
  { owner: 'rig', brief: `Own src/chars/kit.js, src/chars/rig.js, characters/mannequin.js, scenes/_test-rig.js.
FIRST (within your first few steps) create characters/mannequin.js and a working buildCharacter so other agents can use it:
a plain ~1.4 m, ~4-heads-tall biped built from boxes (CHARACTERS.md §3 spec format), palette with 3-4 slots.
1) kit.js: low-poly flat-shaded geometry helpers that read well at 36 px/m: box, chamferBox (45-degree vertical chamfers),
   frustum(n sides, rBottom, rTop, h), prism, wedge, hull(points) (three/addons ConvexGeometry), lathe(profile, sides),
   extrude(2D polygon, depth) for capes/blades/ears, mirrorX, plus a 'taper/bend' modifier for capes. All non-indexed
   (flat normals), centred conventions documented in the header.
2) rig.js: skeleton templates biped({height, heads, shoulders, hips, legs, arms, neck, extra chains...}) and
   quadruped({...}) returning [{name,parent,pos}] with the naming in CHARACTERS.md (L = +X), sockets (handL/handR/back/head),
   optional chains (cape0..n, tail0..n, earL0.., hair0..); buildCharacter(engine, spec) per CHARACTERS.md §5 (ONE SkinnedMesh,
   rigid one-bone binding, optional 2-bone blend for parts flagged blend, mirror:true parts emit the R copy, per-vertex
   color/toneHi/toneSh from palette, material from look.characterMaterial (stub exists), castShadow/receiveShadow,
   frustumCulled=false); the pose-triple convention [fwd, twist, out] in degrees -> bone quaternions (with the R-side sign flip
   for 'out' and correct behaviour for knees/elbows as documented), mirrorPose, applyPose(poseMap incl. hips pos), restPose.
   Write a precise convention table in the rig.js header and VERIFY every axis visually: render the mannequin with single-bone
   test poses (?pose=armL_fwd45 etc.) and confirm the motion direction matches the doc for L and R and for midline bones.
3) scenes/_test-rig.js: ?char=<name> (default mannequin) &pose=<preset|rest> &yaw=<deg> &vh=<viewHeight> &grid=1 (8 facings in a
   row for a turnaround), on a flat meadow-green ground, noon sun. Show the mannequin at vh 10 (~50 texels tall) and check
   pixel quality at 1x crops. Make the mannequin look like a clean, appealing pixel-art figure (not just a debug doll): it is
   the base other characters copy.` },
  { owner: 'motion', brief: `Own src/chars/anim.js, src/chars/dynamics.js, src/chars/ik.js, src/chars/locomotion.js,
src/chars/character.js, scenes/_test-motion.js. Use rig.buildCharacter + characters/mannequin.js from the rig agent when they exist
(poll the files; until then prototype against src/chars/spike.js).
1) dynamics.js: SecondOrder (number | THREE.Vector3) and SecondOrderQuat with t3ssel8r's exact parametrisation and his shipped
   v3 update (k2 clamp when w*T < zeta, pole matching otherwise; research/05 §5.3, §8.1), presets table from
   CHARACTER_TECHNIQUES §6. Unit-check numerically (a node one-liner via tools/remote.sh is fine) that a step input with
   f=2, z=0.5, r=-2 undershoots first then overshoots and settles; record the numbers.
2) anim.js: clip evaluation per CHARACTERS.md §4 (30 Hz key grid, 'step' holds, 'ease' sampled on twos, events, root offsets,
   loop/non-loop, blending between clips only at pose-frame boundaries), pure function (clip, localTime) -> {poseMap, frame,
   keyIndex, key}.
3) ik.js: analytic two-bone IK recomputed from the rest pose each frame (research/06 'solveKnee' + basis -> local quaternion),
   pole vectors, reach clamp; lookAt with limits.
4) locomotion.js: distance-phased gait (research/06 foot(s,S,o,beta,h)), planted feet in world space during stance, IK legs,
   hip bob (>= 1 texel, 2 per stride), lean into acceleration via SecondOrder, arm swing opposite to legs, walk/run selection
   by speed (Froude), stopping only at a double-support phase; works with or without authored walk/run clips (authored key
   poses take precedence for the upper body; legs from the gait).
5) character.js: the Character runtime per CHARACTERS.md §5: drive(fn) (pure fn of t), play(), facing quantized to 8 directions
   with hysteresis and stop-motion turns, root snapped via engine.camera.snapObjectToTexel, fixed-step simulation from t=0
   (re-simulate on backwards/jumps) so any capture time is deterministic, pose displayed only on pose frames (hold between),
   secondary chains (spec.chains) and personality (spec.personality) via SecondOrder evaluated at 60 Hz but DISPLAYED at the
   pose rate, events 'pose'/'event'/'clip' via ch.on, calls look.updateLook(engine, rig) after each displayed pose.
6) scenes/_test-motion.js: the mannequin walking a figure-8 / square path (?path=), stopping, turning, running, with ?t
   captures; a strip of frames over 1 s (--times) must show: held poses on the 15/30 Hz grid, root moving every frame, feet not
   sliding (measure foot texel positions across stance frames and report the max slide), facings stepping at 45 degrees.
   Produce a GIF (tools/remote.sh python3 tools/sheet.py gif ...). Tune until the walk reads as appealing hand-made pixel animation.` },
  { owner: 'look', brief: `Own src/chars/look.js (replace the stub, keep exports), scenes/_test-look.js, and — additively, ONLY for the new
character flag — src/core/glsl.js (add FLAG_CHAR, choose a value that does not collide, e.g. 0.625, and keep FLAG_* semantics),
src/post/outline.js (FLAG_CHAR handling) and the OUTLINE map in src/materials/toon.js (add 'char'). Do not change behaviour for
any existing flag (re-render scenes/_test-outline.js and shrine before/after and diff: world pixels must be identical).
1) FLAG_CHAR in the outline pass: depth outline drawn on a character pixel ONLY when the farther neighbour is also a FLAG_CHAR pixel
   (inner lines: cape over tunic, arm over body); never against the world/background; no convex edge highlights on FLAG_CHAR;
   world pixels next to a character behave as if the character were FLAG_NONE-ish depth neighbour?? -> decide carefully: a world
   object behind a character must not get a line, and a world object IN FRONT of a character (e.g. a pillar) should still get its
   normal outline against the character. Verify with crops.
2) characterMaterial(engine, opts): toonMaterial with vertexColors + toneAttributes + outline 'char' + the FAR-HALF SHADOW
   (t3ssel8r: 'always put the far half of the body in shadow' — refs/chars/01): per BONE, using the skinIndex attribute (rigid
   binding) and a small uniform array / DataTexture of per-bone far flags written by updateLook(engine, rig) each displayed pose
   (decide far = bone's lateral offset from the body midline points away from the camera, using the camera forward projected on
   the ground; midline bones not forced). Forced bones render in the shadow band but keep shadow definition so they still have
   form. Must work for the colour pass, the normal pass and shadow casting (skinning!).
3) Make characters separate from grass in light, cast shadow, golden and night (TIME presets via src/world/sky.js applyTimeOfDay):
   investigate whether the character needs any extra term (e.g. slightly reduced cloud-shadow influence, a 1-band rim on the sun
   side) — only add what t3ssel8r's refs justify; document the decision.
4) scenes/_test-look.js: mannequin (or spike until it exists) on meadow + a pillar in front of / behind it, 4 times of day,
   ?debug=flags/outlineDebug views, the far-half shadow at 8 facings. Compare against refs/chars/01 and 02b.` },
  { owner: 'fx', brief: `Own src/chars/smear.js, src/chars/fx.js, scenes/_test-smear.js.
1) smear.js: attachSmears(engine, ch, opts) per CHARACTERS.md §5 and CHARACTER_TECHNIQUES §7 / research/05 §4 + §8.3: ribbon
   between the socket's previous and current world transform using t3ssel8r's 3-lerp/3-slerp curve with arc-fitted handles,
   16-24 segments, inner radius ~0.35 x blade length, trigger only when the swing >= 40 degrees and the edge leads, world-space
   (not parented), 3 stepped stages over ~0.1 s (full crescent -> eroded from the trailing end and inner edge -> streaks along the
   arc -> gone), two flat unlit light tones (default #ACB8B8 / #BCC4C4 or a per-socket palette), no outline (uPassMode==1 ->
   discard), depth tested + depth writing, alpha >= 0.5, obeys the material contract (uPassMode by reference). Also a 'limb'
   smear variant (a stretched, flat-tone copy of a fast limb or a kick arc) if cheap.
   Until the Character runtime exists, drive it in your test scene directly: a sword mesh on a pivot keyed on a 30 Hz grid with
   held poses (anticipation hold, one contact frame, follow-through) and emit the same 'pose' events yourself through a tiny
   stand-in with the ch.on API; switch to the real Character when src/chars/character.js lands.
2) fx.js: footstep dust puffs on run contacts / landings, a hit flash (1-2 frames of a flat light tone on the character), maybe
   a small slash spark — all pixel-sized, quantized colours, low frame rate (8-12 fps), COLOR_ONLY layer or FLAG_NONE, driven
   by ch.on('event').
3) scenes/_test-smear.js: horizontal slash, overhead chop, spin attack, at 4 camera yaws; strips of every 60 Hz frame around
   the swing (--times) compared against refs/chars/03b (smear lifecycle) and 03; verify 1x pixel crops (no outline, hard edges,
   streak stage looks like dry-brush streaks).` },
  { owner: 'tools', brief: `Own scenes/char-stage.js, scenes/char-bake.js, tools/charpack.sh, tools/charpack.py, tools/charcheck.py,
tools/bake.py. These are what every future character agent and critic will use; make them fast, robust and well documented
(usage header in each file). Use characters/mannequin.js once the rig agent creates it (prototype with the spike until then;
the Character runtime from the motion agent may land later — support both a static posed rig and a full Character).
1) scenes/char-stage.js: ?char=<name>&clip=<clip>&frame=<i>|&t=..&dir=<0-7>&tod=noon|golden|night|morning&vh=<viewHeight>
   &bg=meadow|plain|key&grid=turnaround|clips&yaw=<camera yaw deg>: meadow = small terrain patch with grass + a pillar
   + cloud shadows using the world modules (src/world/*), plain = flat ground colour, key = flat magenta-free key colour
   background for baking. grid=turnaround lays the 8 facings out in one frame (one page load = whole turnaround).
2) tools/charpack.sh <name> [--clips a,b] [--only turnaround|clips|scene] -> shots/char-<name>/: turnaround (idle, 8
   facings), per clip a contact strip of every displayed pose frame (and a 60 Hz strip around actions), a GIF per clip,
   1x crops enlarged with nearest-neighbour, in-scene shots at noon/golden/night incl. standing in a cast shadow, and the
   charcheck report. Minimize page loads (use --times), it should run in a few minutes.
3) tools/charcheck.py: automated checks from CHARACTER_TECHNIQUES §8 on the renders: character height in texels (via the
   key-colour background mask), head fraction if measurable, colour count per palette slot cluster, isolated-pixel speckle count,
   silhouette-ring darkness (no dark outline against the world), static-pose flicker (frames with the same displayed pose must be
   identical), pose-change cadence (frames at which the character changed vs the 30 Hz grid), facing silhouette-area variation,
   foot slide during stance if given foot positions (coordinate with motion via the 'pose' event or a debug hook
   window.__pixel.charDebug). Print a compact table + JSON.
4) scenes/char-bake.js + tools/bake.py: sprite-sheet export for 2D games: 8 directions x clips x displayed frames rendered on the
   key background at a configurable pixels-per-metre and camera (default yaw 0 / pitch 30 for classic 3/4 RPG view, also iso
   yaw 45), cropped to a fixed cell with a feet anchor, packed into out/sprites/<name>.png + .json ({cell, anchor, dirs, clips:
   {name: {fps, frames}}}). Keep outlines/shadows decisions consistent with the in-game look (no world shadow; optional
   contact-shadow blob as a separate layer).
Test everything on the mannequin and report the charcheck numbers.` },
]

phase('Build modules')
const built = await parallel(MODULES.map((m) => () =>
  agent(`${PREAMBLE(m.owner)}\nYOUR TASK:\n${m.brief}\n\nReturn the structured result.`,
    { label: `build:${m.owner}`, phase: 'Build modules', schema: RESULT })
    .then((r) => r && { owner: m.owner, ...r })))
const ok = built.filter(Boolean)
log(`modules: ${ok.map((r) => `${r.owner}=${r.status}`).join(', ')}`)

phase('Integrate')
const integration = await agent(`${PREAMBLE('lead-integrator')}
You are acting as the LEAD for this phase: you may edit lead-owned files (src/chars/index.js, docs/CHARACTERS.md,
docs/CHARACTER_TECHNIQUES.md, docs/CHARACTER_PLAYBOOK.md) and, ONLY to fix integration bugs or apply contract requests, any
src/chars/*, scenes/char-*, scenes/_test-{rig,motion,look,smear}.js or tools/char* file (keep changes minimal; list each one). The
module agents have finished; nobody else is editing now.

Module reports (JSON):
${JSON.stringify(ok, null, 1)}

Tasks:
1) Apply reasonable contract_requests. Make src/chars/index.js import cleanly (every re-exported module exists, no name clashes).
2) Render every scenes/_test-{rig,motion,look,smear}.js and scenes/char-stage.js; zero page/shader errors; world scenes unchanged
   (tools/shot.sh shrine + _test-outline before/after: no regressions).
3) Build the REFERENCE CHARACTER end to end by following docs/CHARACTER_PLAYBOOK.md exactly (stages 0-6) as if you were a
   future character agent: characters/wanderer.md (design sheet) + characters/wanderer.js — an ORIGINAL t3ssel8r-style
   adventurer (not a copy of his elf): ~1.4 m, ~4 heads, a strong signature shape (e.g. a big pale hood or wide-brimmed hat),
   cape/scarf chain with secondary motion, a short sword on a 'weapon' socket; clips idle, walk, run, attack (one-frame contact +
   smear), hurt. Run tools/charpack.sh wanderer and LOOK at every output; iterate until it would score >= 19/24 on the rubric.
   Where the PROCESS itself was confusing, missing a step or a tool, fix the playbook/contract (that is the main deliverable:
   a process future agents can follow reliably).
4) Update docs/CHARACTERS.md §5 API to match what was actually built (signatures + options), and make sure
   docs/CHARACTER_PLAYBOOK.md references the real commands.
Return the structured result; put remaining problems per module in known_issues prefixed with the owner.`,
  { label: 'integrate', phase: 'Integrate', schema: RESULT })

phase('Critique')
const ISSUES = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    per_criterion: { type: 'array', items: { type: 'object', properties: { criterion: { type: 'string' }, score: { type: 'number' }, note: { type: 'string' } }, required: ['criterion', 'score', 'note'] } },
    issues: { type: 'array', items: { type: 'object', properties: {
      owner: { type: 'string', description: "rig|motion|look|fx|tools|lead|char-wanderer" },
      severity: { type: 'string', enum: ['high', 'medium', 'low'] },
      problem: { type: 'string' }, fix: { type: 'string' } }, required: ['owner', 'severity', 'problem', 'fix'] } },
    process_gaps: { type: 'array', items: { type: 'string' }, description: 'where the playbook/tools would mislead or fail a future character agent' },
    verdict: { type: 'string' },
  },
  required: ['score', 'per_criterion', 'issues', 'process_gaps', 'verdict'],
}
const critic = await agent(`${PREAMBLE('critic')}
You are a demanding ART DIRECTOR and pixel-art animator. Do not edit any files except shots/critic-wanderer/ and an appended
section in docs/CHARACTER_LEARNINGS.md. Critique the reference character "wanderer" (characters/wanderer.js, design sheet
characters/wanderer.md) against the rubric in docs/CHARACTER_PLAYBOOK.md and against t3ssel8r's character (refs/chars/*).
Run tools/charpack.sh wanderer yourself into shots/critic-wanderer/ (or point it there) and make your own extra renders
(1x crops, 60 Hz strips around the attack, in-scene at golden/night, a whole-texel camera pan with the character idle).
Integrator summary: ${integration ? integration.summary : 'n/a'}
Score every criterion 0-2 with a concrete note; list issues with the OWNER module that must fix each (a problem in shared
code goes to the module, a design problem to char-wanderer) and a concrete fix; list process_gaps (where the playbook/tools would
mislead a future agent). Be specific about pixel locations.`, { label: 'critic:wanderer', phase: 'Critique', schema: ISSUES })

phase('Fix')
const byOwner = {}
for (const i of ((critic && critic.issues) || [])) {
  if (i.severity === 'low') continue
  const o = (i.owner || 'lead').replace(/^char-.*/, 'lead')
  ;(byOwner[o] = byOwner[o] || []).push(i)
}
if (critic && critic.process_gaps && critic.process_gaps.length) (byOwner.lead = byOwner.lead || []).push(...critic.process_gaps.map((g) => ({ severity: 'medium', problem: g, fix: 'fix the playbook/contract/tools so a future agent cannot fall into this' })))
const owners = Object.keys(byOwner)
log(`fix round: ${owners.map((o) => `${o}(${byOwner[o].length})`).join(', ') || 'nothing to fix'}`)
const fixes = await parallel(owners.map((o) => () => agent(`${PREAMBLE(o === 'lead' ? 'lead-integrator' : o)}
${o === 'lead' ? 'You act as the lead: you own docs/CHARACTERS.md, CHARACTER_TECHNIQUES.md, CHARACTER_PLAYBOOK.md, src/chars/index.js and characters/wanderer.{js,md}.' : ''}
Other owners are fixing their own issues in parallel right now. Fix these critic issues in YOUR files
(critic score ${critic ? critic.score : '?'}/24; verdict: ${critic ? critic.verdict : ''}):
${JSON.stringify(byOwner[o], null, 1)}
Re-render to prove each fix (look at the PNGs). Return the structured result.`, { label: `fix:${o}`, phase: 'Fix', schema: RESULT })
  .then((r) => r && { owner: o, ...r })))

return { modules: ok, integration, critic, fixes: fixes.filter(Boolean) }
