# AGENTS.md — how a coding agent makes a character with this kit

You are an agent (Claude Code, Codex, or anything else that can edit files and run shell commands) asked to make a new
animated character in the **3D pixel-art** style (t3ssel8r / David Holland): a low-poly 3D model drawn through a
texel-snapped orthographic camera at 640×360, banded toon light, 1-pixel inner lines, poses held on a 30 Hz grid. You
write the character as **code** (`characters/<id>.js`, a plain-data spec), render it headless, read the numbers, LOOK
at the pictures, and iterate. There is no GUI and no external art.

Read this file top to bottom once. Then keep these open:
- `characters/_TEMPLATE.md` + `characters/_template.js` — your starting point (`tools/new-character.sh` copies them).
- `docs/CHARACTERS.md` — the spec contract: units, pose triples, parts, clips, every runtime option (§1–§5, §7 tools).
- `LEARNINGS.md` — ~30 characters' worth of failed critic rounds, as rules. Read it before stage 1.
- `docs/CHARACTER_PLAYBOOK.md` — the upstream project's full procedure (detailed checklists per stage and per body
  plan), `docs/CHARACTER_TECHNIQUES.md` — the numbers behind the rules.
- Exemplars: `characters/duelist.{js,md}` (biped, cape, plume, rapier), `characters/keeper.{js,md}` (robed, staff +
  swinging lantern), `characters/hound.{js,md}` (quadruped), `characters/mannequin.js` (bare biped + body-plan demos).

> The `docs/` files are copied unchanged from the upstream project, which built a cast for its own game (our example
> game, a top-down social-deduction town). They mention characters, reference images (`refs/…`) and render folders
> (`shots/critic-…`) that are not part of this kit, and a remote-render setup ("the Mac only edits", "the render
> host"). **Where they disagree with this file, this file wins:** here everything runs on your machine by default.

---

## 0. Ground rules (especially for unattended runs)

1. **Work only inside the kit root** (and your own scratch dir). Own only `characters/<id>.{js,md}` and
   `shots/char-<id>*/` unless the user tells you otherwise. Treat `src/`, `scenes/` and `tools/` as read-only shared
   code: work around problems in your spec and report them (see §8 "module issues").
2. **No destructive commands.** Never a raw `rm` / `rm -rf` (a glob `rm` triggers a permission prompt in most agent
   harnesses and stalls an unattended run), no `sudo`, no deleting or editing outside the kit. To clear old renders:
   `tools/clean.sh shots/char-<id>/r1` (files only, only under `shots/` or `out/`) — or simply render into a fresh
   versioned folder (`--out shots/char-<id>/r2`).
3. **One command per call, no clever shell.** zsh does not word-split `$v` in `for` loops (a loop once rendered the
   idle under the wrong names). Write explicit commands or wrap loops in `bash -c '…'`.
4. **Deterministic code only.** Everything is a pure function of time `t`; no `Math.random()` / `Date.now()` (use
   `rng(seed)` from `src/core/noise.js`).
5. **Never claim what you did not render and look at.** Open every PNG/GIF you rely on with your image viewer / Read
   tool. Page or shader errors (`page_errors` row, `ERR` lines) = a failed render. Record every command you ran.
6. **Resumable work.** If `characters/<id>.js` already exists it is your earlier, unreviewed work from an interrupted
   run: read it, re-render, continue from it. `tools/new-character.sh` refuses to overwrite it.
7. Everything you need is in the kit. Do not download other assets; reference images come from the user.

## 1. Setup and commands

```sh
npm install                          # three@0.170.0 + playwright@1.63.0
npx playwright install chromium      # the headless browser (Linux may also need: npx playwright install-deps chromium)
python3 -m pip install -r requirements.txt   # Pillow + numpy (or use a venv)
tools/doctor.sh                      # checks all of it, renders one still, prints the GPU WebGL got
```

Rendering runs **locally** (Node + Playwright Chromium + Python). With a GPU a full pack takes ~40–75 s; without
one Chromium uses SwiftShader (software: nearly identical pixels — a few speckle/shading px differ and `night_pan` may FAIL by a few px; slower, much slower on small CPUs). Compare packs only from the same backend. `PIXEL3D_GL=swiftshader`
forces software; `PIXEL3D_GL=vulkan|gl|metal|d3d11` picks an ANGLE backend. Optional remote render host:
`PIXEL3D_HOST=<ssh alias>` makes `tools/charpack.sh`, `tools/shot.sh` and `tools/remote.sh` rsync the kit to
`<alias>:~/charkit/` (`PIXEL3D_RDIR`), render there and copy results back (`PIXEL3D_ENV=<remote file>` is sourced first).

| what | command | look at |
|---|---|---|
| new character | `tools/new-character.sh <id> "<Name>" "<brief>"` | `characters/<id>.{js,md}` |
| turnaround (~10 s) | `tools/charpack.sh <id> --only turnaround` | `turnaround*.png`, `report.txt` |
| some clips | `tools/charpack.sh <id> --only clips --clips talk,vote` | `clip-<c>.png`, `clip-<c>-60hz.png`, `clip-<c>-1x.gif` |
| full pack (profile clips) | `tools/charpack.sh <id> --preset profile --raw` | everything; `report.txt` |
| a pack into a fresh folder | `tools/charpack.sh <id> --preset profile --out shots/char-<id>/r2` | |
| **one key pose at 8 facings** (main judging tool) | `tools/shot.sh char-stage shots/char-<id>/g8-vote-f4.png --size 640x360 --q 'scale=1&char=<id>&grid=turnaround&clip=vote&frame=4&fx=0&bg=plain' --t 1` | S SE E NE N NW W SW in one still |
| one still | `tools/shot.sh char-stage shots/char-<id>/x.png --size 640x360 --q 'scale=1&char=<id>&clip=vote&frame=7&dir=2&bg=key' --t 1` | |
| an action at another facing | `tools/charpack.sh <id> --only clips --clips die --dir 2 --out shots/char-<id>/dir2` | |
| re-run the checks | `python3 tools/charcheck.py shots/char-<id>` (needs `--raw` renders) | table |
| sprite sheet for a 2D game | `tools/charpack.sh --bake <id> --preset profile --game 1 --out out/sprites` | `<id>-preview.png`, `<id>.json` |
| exports sanity | `node tools/charexports.mjs` | `dups []` |
| clear old renders | `tools/clean.sh shots/char-<id>/r1 ['*.png']` | |

Stage URL parameters (`clip`, `dir`, `frame`, `t`, `bg`, `tod`, `vh`, `grid`, `mark`, `pan`, …) are documented in the
header of `scenes/char-stage.js` and `docs/CHARACTERS.md` §7. Facings: dir 0 S (toward the camera), 1 SE (**the game
facing; packs default to it**), 2 E (profile), 3 NE, 4 N, 5 NW, 6 W, 7 SW. Reference zoom: view height 10 m → 36 px/m,
a 1.4 m biped ≈ 50 texels tall. Variant specs for A/B tests without touching your real file: `docs/CHARACTER_PLAYBOOK.md`
"Variant specs" (`--q 'char=../shots/char-<id>/wv&wv=a'`).

## 2. The process (brief → author → charpack → self-critique → independent critic → refine)

Order matters; **each stage ends with a render you have looked at.** The roles can be one agent doing everything in
sequence, or separate agents (`workflows/character.workflow.js` wires them up; §9).

### Stage 1 — Brief → design sheet (`characters/<id>.md`)
`tools/new-character.sh <id> "<Name>" "<one-line brief>"`, then fill the sheet BEFORE modelling: concept + 3
adjectives, body plan and the **game-speed arithmetic** (§5), silhouette idea (two signature shapes; what reads at
S/N, at E/W, from the back), proportions table in metres and texels, palette (≤ 5 slots `[hi, mid, sh]` + 1 accent),
part/bone list, the **Unique to me** answers (§4), and a timing chart per clip on the 30 Hz grid.
If the user gave a reference image, write down what must stay recognisable (silhouette, palette, signature prop).

### Stage 2 — Author (model, rig, clips) with renders after every step
1. **Blockout**: `parts()` as plain `K.box`es, empty clips → `tools/charpack.sh <id> --only turnaround`. Recognisable
   at all 8 facings in `turnaround-silhouette.png` at 1× and at the 25 % thumbnail; `height_px`, `facing_area_var`,
   `head_frac` in range.
2. **Model + palette**: kit shapes (`K.lathe` hats/domes, `K.frustum(4,…)` limbs, `K.chamferBox` head/torso, `K.hull`
   faceted parts, `K.extrude` capes/wings). Facets ≥ 3 px, nothing thinner than 2 texels (0.06 m), eyes ≥ 2×2 texels.
   Check `turnaround-plain.png`, `turnaround-isolated.png` and the scene crops.
3. **Poses and clips**: author every key on the 8-facing still (`grid=turnaround&clip=<c>&frame=<f>`) — one facing lies.
   Keys differ ≥ 25–40° on the dominant limb; actions = anticipation → one contact key (+ smear) → follow-through →
   recovery; held clips (vote, die) end on a held pose. Then the full pack.
4. **Secondary motion + FX**: chains (`spec.chains`, 1-link for short accessories), `personality`, smears/FX.
5. **Game-speed pass** (§5): `clip-game.png`, `game-onion.png`, `game-1x.gif`, rows `game.readable`, `game.foot_slide`.

### Stage 3 — charpack
`tools/charpack.sh <id> --preset profile --raw`. Read **every row** of `report.txt` (§6 explains each) and open the
images: `turnaround.png`, `turnaround-silhouette.png`, `turnaround-isolated.png`, every `clip-<c>.png`, every
`clip-<c>-1x.gif` (judge at 1× real time — this is how it reads in a game), `game-1x.gif`, `scene-{noon,golden,night}-crop.png`, `pan.png`.

### Stage 4 — Self-critique (mandatory before you report)
Authors in the upstream project scored themselves **3–7 points above the independent critic**, always for the same
reasons: a facing nobody rendered, a key nobody looked at, a scene crop nobody measured. So:
- Collect evidence in `shots/char-<id>/self/`: the full pack; 1× crops at dir 1 of idle and every action key;
  8-facing stills of EVERY key of every clip; a 25 % silhouette line-up against your other characters at S, N, SE and E;
  scene crops (sun copy AND pillar-shadow copy, noon/golden/night); a hold audit (raw 60 Hz diffs inside held keys).
- Write the rubric table (§3) into the sheet. **Every score cites a file + facing/frame + a number.** A criterion
  without evidence, or whose evidence you did not run, scores at most 1. When in doubt, score 1.
- Fix every < 2 that is in your files, re-verify each fix in **the same render that showed the problem**, then rewrite
  the sheet from the current code (sheet = code).

### Stage 5 — Independent critic
A different agent (or you, in a fresh context, told to be harsh) re-renders everything itself — never reusing the
author's numbers — and scores the rubric 0–2 per criterion with pixel-located notes. Each issue gets an owner:
`character` (fixable in the spec) or a module (`rig`, `motion`, `look`, `fx`, `tools`) for shared-code problems. It
also judges the Unique-to-me answers and the 1× game-speed GIFs, and reports the author's self-score gap.

### Stage 6 — Refine
The author fixes every `character` issue (all severities), re-renders each fix and looks at it, re-runs the full pack,
updates the sheet. Module issues: best workaround in the spec + a note. Then a final critic round scores ship / no-ship.
Add new lessons to `LEARNINGS.md` → "Your project's lessons" (symptom → cause → rule, with numbers).

## 3. The rubric and the bar

12 criteria × 0–2 (0 fails, 1 partly, 2 meets). **Ship bar ≥ 19/24 with no zero on 1, 2, 3 or 7.** Full "how to
check / what a 2 is" table: `docs/CHARACTER_PLAYBOOK.md` §Rubric. In short:

| # | criterion | 2 = |
|---|---|---|
| 1 | Silhouette | recognisable from all 8 facings (S/N too) at 1× and 25 %; both signature shapes visible in ≥ 6/8; distinct from every other character |
| 2 | Pixel stability | a static pose changes 0 px; between grid frames only the root glides; nothing flickers or vanishes between facings; deterministic |
| 3 | Line quality | 1-px inner lines where parts overlap, no line against the world, no speckle, no dashed thin props |
| 4 | Tonal discipline | ≤ 3 tones per slot + inner line; ≤ 2 speckle px on the signature; signature ≥ 50 % hi/mid in ≥ 6/8; warm hi, cool sh, no black/white |
| 5 | Ground separation | reads instantly at noon/golden/night, in sun and in a cast shadow; signature ≥ 30° hue or ≥ 25 % L off lit grass |
| 6 | Proportion, appeal, expression | chunky readable shapes; face lit and never covered; expressions change ≥ 2 texels and read at 1× |
| 7 | Animation timing | stepped on the 30 Hz grid; no 1-frame holds; holds ≥ 6 frames have 0 redraws; keys differ ≥ 25–40°; every clip reads as a 1× GIF |
| 8 | Weight, contact, game speed | all walk drawings show every cycle at game speed; contact visible; planted feet ≤ 1 texel slide; bob ≥ 1 texel; the gait is nameable in one word at 1× |
| 9 | Personality, secondary, uniqueness | chains lag/overshoot/settle ≤ 0.5 s; the character's own parts animate as planned; in character with its adjectives |
| 10 | Smears and FX | intended read; smear crescents ≥ 8 texels at every facing, clear of the signature; stepped stages |
| 11 | Facing and turns | all 8 facings read; turns are 45° steps held ≥ 2 grid frames |
| 12 | Technical | no page errors; deterministic; 1 draw call per character per pass; programs stable |

`report.txt` all-PASS is **necessary, not sufficient**: the upstream critics' points were mostly lost on things no
row measures (a face hidden at dir 1, a vote that does not rise above the head, a die that reads as sitting, a prop
edge-on at SE).

## 4. "Unique to me" — answer these in the sheet before modelling (the critic grades them)

1. **Extra animated parts.** Which secondary parts must move (ears, tail, wings, cape, scarf, hat feather, antennae,
   shell, apron, a carried prop, a lantern …) and HOW: a spring chain (`spec.chains`, a preset, 1 link for short parts),
   keyed in clips (≥ 25° per drawing pair), or FX. Which of them carry the walk rhythm at game speed.
2. **Its own gait.** How does it move unlike your other characters — scurry, hop, waddle, glide, slither, flutter,
   lumber, prance, bound — and what arithmetic (§5) keeps it readable and slide-free at game speed?
3. **Expressions in this style.** At ~45–60 texels a face is a few texels: eyes 2×2, a mouth/beak that opens ≥ 2
   texels, brows rotated ≥ 25°, head squash via `pos`/scale, eyelids as a squashed part. Never sub-texel nuance. List
   what talk, vote, die and the emote need and how each reads at 1×.
4. **Readability at game speed.** For each clip: what carries it (a big arm arc, a head bob, a hop apex), timing in grid
   frames, and which 1× GIF you check it on (`clip-<c>-1x.gif`, `game-1x.gif`).

## 5. Calibrate game speed for YOUR game

Characters must read at the speed and size your game plays them, relative to body size. Measure in your game:
sprite height on screen (px), travel speed (px/s), walk drawings per cycle and their playback fps. Then:

```sh
python3 tools/gamespeed.py --sprite-px 38 --speed-px 150 --drawings 4 --fps 12.5 --height-m 1.4
```

prints body-heights per second, cycle time, stride per cycle, the hold per drawing in 30 Hz grid frames, the m/s for a
character of height H, and a `"game"` block to paste into `game-profile.json`.

**Ours, as the worked example** (top-down town, `game-profile.json` as shipped): sprites ≈ 38 px tall moving 150 px/s
= **3.95 body-heights/s**; the walk is **4 drawings at ≈ 12.5 fps** → cycle ≈ 0.32 s, ≈ 1.26 H travelled per cycle,
each drawing held 2–3 grid frames. For a 1.4 m character: v_game = 3.95 × 1.4 = 5.5 m/s — a brisk scurry with a
flight phase, not a stroll (the upstream characters' default 1.3 m/s walk was 4× too slow and aliased at game speed).

What uses it:
- `tools/charkit_pack.py` sets the game-speed walk job (`clip-game.*`, `game-1x.gif`) to `heightsPerSecond × H`
  unless the spec overrides it, and judges `game.readable` against `cycleSeconds`, `heightsPerCycle`, `holdGridFrames`.
- The template spec imports the profile: `gameSpeed: { v }`, `locomotion.walkSpeed = v`, `runSpeed = 2v`.
- The design sheet does the feasibility arithmetic: drawings per cycle N, hold h = 2 grid frames → cycle = N·h/30 s;
  one step = v·N·h/60; a planted foot can cover at most ≈ 0.9 × hip height in stance, so short legs at high speed need
  a hop / waddle / glide whose contact is a deliberate drawing (`docs/CHARACTER_PLAYBOOK.md` §Game speed).
- `locomotion.plan` (LegGait) is tuned for ≈ 4 H/s; for much slower games try the legacy gait (no `plan`) and check
  `game.readable` — whichever you use, the 1× `game-1x.gif` is the judge.

## 6. The clip set is a profile

`game-profile.json` → `"clips"` lists the clips every character must have (`$emote` = the spec's `emote` clip),
`"optionalClips"` the ones rendered when the spec has them. `--preset profile` renders exactly that list (+ `turn`);
the `cast_clips` row FAILs when one is missing. **Ours, as the example:**

| clip | must read as |
|---|---|
| idle | alive but calm; ≤ 4 drawings, extremes held ≥ 30 grid frames, 1 texel of bob |
| walk | THE game locomotion at game speed, the species' own gait |
| talk | a speaking loop: mouth opens ≥ 2 texels + a hand/head beat ≥ 25° every 8–14 grid frames (event `speak` = speech bubble) |
| vote | raise a hand/paw/prop clearly above the head in ≤ 6 grid frames and HOLD (`vote@<socket>` = sparkle) |
| point | aim an arm at someone, hold ≥ 24 grid frames, return |
| die | a gentle collapse to a held pose that reads as "down" at 25 %, every key lower than the last (events `die`, `land`) |
| ghost, ghost-spent | dead player: pale hovering loop; spent = dimmer, head bowed (`spec.ghost: { hover }` draws the look) |
| `<emote>` | one signature social gesture from the brief that changes the 25 % silhouette |
| run (optional) | fast travel at 2× game speed |

Your game will differ (attack / hurt / jump / interact / sit …): edit `clips`, `optionalClips` and `clipNotes`, and
write the "must read as" line for each new clip into your sheets. Clip format: `docs/CHARACTERS.md` §4; FX events
(`speak`, `vote@…`, `poof@…`, `emote:<glyph>@…`, `hit`, `land`, `die`): header of `src/chars/fx.js`.

## 7. What every check in `report.txt` means (and how to fix a failure)

Rows are `check  PASS|WARN|FAIL  value  note`. Rows exist only for jobs rendered in that run. Texel = 1 low-res pixel.

**Shape and colour (turnaround / scene renders)**
| row | measures | fix when it fails |
|---|---|---|
| `height_px` | figure height in texels per facing at vh 10; target by `spec.bodyPlan` (biped 45–62, uprightAnimal 36–62, quadruped 26–50, bird 30–58, hopper 22–50, limbless 18–44, flier 28–60, longNeck 42–72; `spec.heightPx` overrides) | scale the skeleton (`height`), or declare the right `bodyPlan` |
| `head_frac` | head joint → top / height (0.24–0.36 for bipeds) | `heads` option of the template; big hats count |
| `presence` | silhouette area at S vs the mannequin | bulk up / slim down so all characters read at one size; `spec.presence: [lo, hi]` for a deliberate outlier |
| `colors/slot` | distinct tones per palette slot | ≤ 3 tones + line + rim; usually WARN from chamfers/lathes catching extra bands — trust ×4 crops |
| `pure_black_white` | pixels at pure black/white | lift `sh` / lower `hi` |
| `speckle`, `isolated_px` | lone pixels (colour shared with no neighbour) on the figure / on the signature slot | merge tiny facets, sink child parts ≥ 0.02 m into the parent, make bands ≥ 0.05 m, one convex profile per signature |
| `facing_area_var` | silhouette area spread over 8 facings (< 40 %) | flat or edge-on parts; give them depth |
| `silhouette_line`, `edge_highlights`, `inner_lines`, `ring_luma` | no outline against the world, no edge highlight on the character, inner lines exist, rim not too dark | shared look code; report it |
| `face_lit`, `face_visible` | lit share of the face (≥ 50 % at S/SE/SW), face unoccluded by brims/beaks | raise the brim / tip the face up / `spec.faceSlot` + lift |
| `sig.<part>`, `sig_ground.<part>.<tod>-sun/shade`, `sig_outside.<part>` | signature px, isolated px, hi/mid share per facing; contrast vs grass in sun (hue ≥ 30° or L ≥ 25 %) and shade | pick signature colours by rendering golden + shade; lift `sh` along its own hue |
| `islands` | detached parts (a boot or hat floating) | overlap the parts |
| `prop_area.<prop>` | a held prop's area per facing in the held vote pose | thicken flat props (≥ 3 texels deep), face them to dir 1 |
| `determinism` / `deterministic`, `<clip>.deterministic` | the same t renders the same image | no state that depends on render order; no randomness |
| `pan` | whole-texel camera pan on a frozen pose: 0 px change after re-alignment | shared code; report it |
| `night_freeze`, `night_pan` | nothing changes at night with time frozen | use `uCharTime`, not `uTime`, in custom shader code |
| `page_errors`, `draw_calls/char` | no JS/shader errors; 1 draw call per pass | fix the error first — nothing else counts until 0 |

**Timing (60 Hz renders of each clip; a 30 Hz grid boundary falls between odd and even samples)**
| row | measures | fix |
|---|---|---|
| `<clip>.off_grid` | image changes between grid frames (sub-grid motion) | key on whole frames, `interp: 'step'`; leg-only WARNs on a walk = IK re-pin (`locomotion.plant: 'hold'`) |
| `<clip>.flicker` | pixels changing while the pose id is the same | dynamics/chains redrawing inside holds: `dynamics: 'hold'`, `quant.chain` lower, 1-link chains |
| `<clip>.single_frame` | drawings held 1 grid frame (not smears) | hold every key ≥ 2 grid frames |
| `<clip>.strobe` | ≥ 3 consecutive grid frames that each change = 30 Hz boil | longer holds; fewer keys |
| `<clip>.micro` | 1–5 px pops | remove tiny key differences; equalise near-identical keys |
| `<clip>.hold_redraws`, `<clip>.final_hold` | redraws > 8 px inside one authored key; the held end of vote/die is still and ≠ idle | key chains at their settled direction; put FX on the raise key; `clip.length` after the last key |
| `<clip>.pose_read` | max silhouette change vs idle (≥ 10 % held ≥ 4) | bigger poses: 25–80° changes |
| `<clip>.key_delta` | two consecutive authored keys that look the same (< 1 %) | make each key differ ≥ 25 % silhouette or a big part ≥ 3 texels |
| `<clip>.key_speckle` | isolated px a held key adds over idle (≤ 6) | twisted bands/sashes ≥ 0.07 m tall; avoid edge-on thin parts |
| `<clip>.amplitude` | loop clips change ≥ 3 % | bigger talk beats |
| `<clip>.foot_slide` | planted-foot drift in texels at drawing changes, pack facing + profile (≤ 1 PASS, ≤ 1.5 WARN; `n/a` = no foot planted in two drawings: hops, glides, fast gaits — judge `game-1x.gif`) | stride/speed mismatch: tune `locomotion` (stride, duty, plan); declare `bodyPlan`/`feet` so all feet are measured |
| `<gait>.distinct`, `<gait>.head_bob`, `<clip>.feet_visible` | gait drawings that look identical; bob ≥ 1 px and no limp; feet visible in every drawing | bigger bob / leg arcs; keep boots out of hems |
| `<clip>.face_shimmer` | eyes re-rasterising while the head moves (informative) | eyes on whole texels, 2×2 or bigger |
| `game.readable` | the walk at game speed: cycle time, H per cycle, drawings shown per cycle, holds, aliasing (the shown subset changes between cycles) | use `locomotion.plan` (LegGait locks the cycle to the drawings); the legacy gait picks the run by Froude and aliases (the exemplars FAIL this — known) |
| `cast_clips` | every profile clip exists (+ the emote) | author the missing clips; set `spec.emote` |

## 8. Running unattended, reporting, module issues

- Write outputs only under `shots/char-<id>/` (versioned subfolders `r1/`, `r2/`, `self/`). Helpers you write (Python /
  JS) go in your scratch dir or `shots/char-<id>/` with your id in the name — parallel agents share the tree.
- Frames in `raw/clip-<c>/f-<i>.png` are numbered by the job's `times` list; never sort file names lexically.
- When a check surprises you, re-run it before acting (A, B, A′ with A == A′).
- If a shared module blocks you, do not edit it: work around it in your spec and list it as
  `module_issues: ["<rig|motion|look|fx|tools>: problem, evidence path, workaround"]` in your report.
- Final report: files changed, every command run, the final `report.txt` summary line (`-- N pass, N warn, N fail`),
  3–6 evidence image paths, self-score with its weakest three points, module issues, and lessons added.

## 9. The multi-agent workflow

`workflows/character.workflow.js` runs: **author → critic → refine → final critic → learnings**, one pipeline per
character, args `{ id, name, blurb, refImage?, clips?, gameSpeed? }` (or `{ characters: [ … ] }`).
- **Claude Code**: if your Claude Code has the Workflow tool, run the script with those args from the kit root.
- **Manually, with any agent**: the script is readable as a runbook — each `agent(\`…\`)` call is one prompt. Paste
  them in order into fresh sessions, substituting the args, and feed each step the previous step's JSON result.

## 10. Notes on reading the outputs

- `turnaround-isolated.png`: the signature part shown bright with the rest dimmed; **magenta pixels are a debug
  marker for stray (isolated) pixels**, not a colour in your palette.
- `clip-<c>.png` labels `f<grid frame> x<hold>`; `~` = the image changed inside the hold (see `flicker`).
- `clip-<c>-60hz.png`: a red tick = the image changed; ticks must sit only on even frames.
- `clip-<c>.gif` is ×4 for inspection; **judge `clip-<c>-1x.gif` and `game-1x.gif`** (1× pixels, real time).
- `scene-<tod>-crop.png`: two copies — one in sun, one in a pillar's cast shadow.
- `report.txt` header prints the GPU; a SwiftShader line means software rendering (fine, slower).
