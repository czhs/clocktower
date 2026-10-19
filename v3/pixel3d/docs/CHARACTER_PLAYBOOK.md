# Character playbook — how an agent makes a new character

> **Run 05 close (pipeline lead, 2026-10-17).** 31 cast members, critic 14–18 (mean 15.7), none shipped. Gallery +
> line-up: `docs/CAST_GALLERY.md`; ranked blockers + self-critique evaluation: `docs/CHARACTER_LEARNINGS.md` §Run 05 close.
> - **Stage 7 works for round 1** (self − critic +0.55 mean, |gap| 1.0, vs +5 in run 04) **but not after the fix round**
>   (post-fix self-scores +3.5 above the last critic, unverified). From now on the fix round **reruns Stage 7** and
>   reports a fresh evidence table; a member ships only on a critic r2.
> - **Wave-3 touch-up owed:** clarabelle, requin, preservation, opal, cilantro, mincut need point + ghost + ghost-spent
>   (`spec.ghost`), progress needs ghost + ghost-spent.
> - **Old members:** adopt `whiteKeep` / `creamKeep` / `hueKeep` (golden drift on chonk, rabbit, skeleton-chef, moth,
>   mushroom) and `spec.ghost`; check the 25 % line-up with `tools/remote.sh python3 shots/cast-gallery/lineup.py`
>   (all members in one scene, `scenes/cast-lineup.js`) — not only your own turnaround.

> **Module fixes after cast wave 5 (module fixer, 2026-10-16) — two OPT-INS + a fairer face_visible row.**
> Files: `src/chars/{look,rig}.js`, `scenes/char-stage.js`, `tools/{charpack,charcheck}.py`. A/B of full `--preset cast`
> packs of all 35 finished members (incl. the four NPCs): 0 differing frames in every job; only `face_visible` values
> changed. Details + evidence: `docs/CHARACTER_LEARNINGS.md` §Module backlog (top block), `shots/mfx6/ev-*.png`; API:
> `docs/CHARACTERS.md` "Wave-5 module fixes".
> - **Mid-value neutrals at golden: `material.hueKeep: { <slot>: 1 }`** (or a number for every slot) — grey hair, burlap,
>   charcoal hoods keep their authored hue in sun and shade copies instead of going tan/orange/brown; noon/night untouched.
>   Do not re-colour a faithful v1 palette (porter r2 sack → cream) just to dodge the golden drift any more.
> - **Choosing which way a die lies: `pose.yaw: [deg]`** on the lying keys (half on the tip-over key) — spins the whole
>   lying body about the vertical through the root joint; stop fighting hips fwd/out/twist for the facing pair.
> - **face_visible no longer counts your hair cap / hood rim as occlusion** (`spec.faceCover`, default = hair/hood-named
>   parts on the head; a hat brim still counts). A WARN now means the face really is hidden — fix it, do not argue it.
> - **Wave-5 checklist (with the earlier opt-ins):** lantern/light carrier (the Storyteller) = `spec.lights` + `uCharTime`
>   glow; white/cream bodies = `whiteKeep` (+ `whiteKeepLift`) / `creamKeep`; mid greys/burlap = `hueKeep`; ears/hood
>   seams = `material.merge` or `innerLine 'tone'`; chibi legs = `locomotion.plant: 'hold'` (+ `swingFloor: 'gait'`);
>   game clips point + ghost + ghost-spent (`spec.ghost`), not for the Storyteller.

> **Module fixes after cast wave 4 (module fixer, 2026-10-16) — three OPT-INS; nothing changes until your spec asks.**
> Files: `src/chars/{look,locomotion}.js`, `src/post/outline.js`. A/B of full `--preset cast` packs of all 31 finished
> members: 0 px in every job; shrine/glade/pond/town 0 px. Details + evidence: `docs/CHARACTER_LEARNINGS.md` §Module
> backlog (top block), `shots/mfx5/ev-*.png`; API: `docs/CHARACTERS.md` "Wave-4 module fixes".
> - **Grey seams on unclothed bodies: `material.innerLine: 'tone'`** — inner lines take the darker adjacent tone, hue
>   kept (maxflow collar, greenting leg roots: grey-lilac → darker body tone). Prefer it to `material.merge` when the line
>   is wanted (arm over body, collar, quills); `merge` only where no line should exist. Per slot:
>   `material.slots.<x>.line: 'tone' | 'grey'`.
> - **Cream at golden: `material.creamKeep: [1, 0.85]`** — cream / warm-light albedo (whiteKeep's gate rejects it) keeps
>   its hue in sun AND shade copies under the golden key instead of going mauve-grey; noon/night untouched.
> - **Short-duty / reach-clamped LegGait walks: `locomotion.swingFloor: 'gait'`** — the live cycle stays the authored
>   one (0.3 s, was 0.267–0.289 s on 16 members) and the start-up cycle shows every drawing; drop `maxSwing: 0.5`.
>   Set it on new members (default stays 'fixed' until the lead re-checks the 15 finished walks it would change).
> - **Wave-4 checklist (with the earlier opt-ins):** a lantern/light carrier (the Storyteller) = `spec.lights` + `uCharTime`
>   glow; white/cream bodies = `whiteKeep` (+ `whiteKeepLift`) / `creamKeep`; ears/hood seams = `material.merge` or
>   `innerLine 'tone'`; chibi legs = `locomotion.plant: 'hold'`; game clips point + ghost + ghost-spent (`spec.ghost`),
>   not for the Storyteller.

> **Module fixes after cast wave 3 (module fixer, 2026-10-16) — read before porting point / ghost / ghost-spent.**
> Files: `src/chars/{character,rig,look}.js`, `scenes/{char-stage,char-bake}.js`, `tools/{charpack,charcheck,bake}.py`.
> A/B of full `--preset cast` packs of all 27 finished members: 0 px everywhere except ONE 60 Hz frame per walk/run/game job of the LegGait 'hold' members (the walk-start leg flicker, now gone); no new FAIL. Details + evidence: `docs/CHARACTER_LEARNINGS.md`
> §Module backlog (top block), `shots/mfx4/`; API: `docs/CHARACTERS.md` §5 "Wave-3 module fixes".
> - **Ghosts: do NOT copy the crow/polly ghostK + `material.tones` + micro-halo + `pos` +0.1 recipe any more.** Add
>   `ghost: { hover: 0.14 }` to the spec and author `ghost` / `ghost-spent` as plain loop clips (pose only, no hover
>   compensation, no halo bone): the module draws the pale ramp, the dimmer spent ramp, the bind-height dissolve, the
>   night self-glow and a gold halo (level 1 only), and floats the legs (no IK hip dip). Tune with `ramp`, `spent`,
>   `slope`, `keepHue` (dark characters 0.25), `keep: ['<glow slot>']`, `halo { lift, radius, bone }`. A walking ghost:
>   `ch.ghost = 1`. Any loop clip can float its legs with `legs: 'float'`.
> - **Reach: `'upperArmR.l': [0.6]`** lengthens a segment without thickening it and without scaling the hand/prop under
>   it — use it for votes/points past a big head instead of `.s` 1.5–1.95× + a counter-scaled prop.
> - **Walk starts no longer flicker the legs** (M18, LegGait `plant: 'hold'`): game/walk/run `flicker` 50–105 px WARN →
>   0–2 px. Only the 60 Hz frame right after a walk start changed.
> - **Whites at golden under a lift:** `material.whiteKeepLift: 0.8` (whiteKeep alone never touched lifted mid-band px,
>   and its gate rejected a magenta-pushed hi like #F8E8FF).
> - **Bakes:** the render cell is sized from the figure (fx=0 pass); a pose reaching below the feet raises the pad instead
>   of the whole cell; FX outside the figure box are cropped with a warning (`--fxcell fx` = old). `--q fx=0` now really
>   bakes without FX (char-bake ignored it before).
> - **New charcheck rows:** `game.feet_visible` (each foot's px per game-speed gait drawing, buried/hem feet WARN),
>   `sig_outside.<part>` (signature PART outside the body; declare tails/beaks as `{ part: 'tail' }` to get it),
>   `prop_area.<prop>` (held prop per facing in the held vote; `spec.props` or parts under a hand bone),
>   `<clip>.face_shimmer` (informative). Stage: `mark=@<bone>` marks a bone's parts, `hide=1` drops marked parts.

> **Module fixes (mid-run, 2026-10-16, module fixer) — shared code changed under you; re-render before judging.**
> Live in `src/chars/{locomotion,character}.js` + `scenes/char-stage.js`. Only LegGait (`locomotion.plan`) walk/run/game
> renders change; idle/talk/vote/die/emotes/turnarounds/scenes and every legacy-Gait character are pixel-identical
> (A/B of 12 full cast packs). Evidence + numbers: `docs/CHARACTER_LEARNINGS.md` §Module backlog.
> - **M1 — LegGait now plays authored `clips.walk` / `clips.run`** for the upper body (every non-leg bone the clip keys,
>   evaluated at the shown gait drawing; legs stay on the gait). Key ears/tail/prop arm/staff plant per drawing: use
>   `interp: 'step'`, `length` = drawings per cycle (4), f 0 = left contact. Default = replace (a keyed `pos` replaces the
>   plan's bob/hop, drop kept); `clip.blend: 'add'` layers the keys on top of the procedural body. **Drop the
>   channel-routing hacks** (`locomotion.bones.armL: ['tail0', …]`, part-less sink bones) when you key the clip instead;
>   chibis no longer need the legacy Gait for authored walks.
> - **M2/M3 — no more seated chibis / leg flicker.** New `locomotion.plant: 'auto' | 'pin' | 'hold'`. Legs that cannot
>   pin a plant through a held drawing (every chibi at 4 H/s; auto picks it) are drawn as a clean sprite cycle: contact
>   foot planted ahead, swing arcs, NO per-frame re-pin, body drop ≤ `holdDrop` 0.1·leg (was ≈ the whole hip height:
>   fox/crow/goat hips 0.28–0.36 m down, hems under the grass). Bodies now walk at stand height and the boots show under
>   the hem — **re-check robe/hem/boot clearance and `lift` at dir 1 + dir 2.** charcheck: game/walk `off_grid` 13–29 → 1,
>   `flicker` 170–1446 → 10–96 (legs). The planted foot rides the root inside a hold (= what the baked sprite does in
>   game); judge `foot_slide` n/a + the 1× GIF as before. `surge` now defaults off for legs ≤ 0.25 H (you can delete
>   `surge: false`). Knobs: `holdDrop`, `contactReach` (contact offset / leg), `maxDrop` (pin cap, 0.5·leg).
> - **M7** first walk cycles no longer skip drawing 0. **M6** 'hop' default legs drop the arms on upright bodies.
>   **M4** `locomotion.accelLean: [back, fwd, side]` (deg, default [10, 14, 10]) caps the start/stop lean (tall props).
>   **M5** loop clips (idle/talk/ghost) honour `clip.dynamics: 'hold'` (no settle redraws, chains snap per key).
> - **T1 — `frame=` on loop clips is now the real key** (talk frame=0 → talk:0). Drop the `&at=0` workaround (harmless).
> - **Lead fixes between waves 2 and 3:** emote glyphs (`emote:<glyph>`) draw at full size on their first drawing (the
>   hollow pop-in dot is gone; `src/chars/fx.js`); `die.foot_slide` > 1.5 is WARN, not FAIL (the collapse is counted,
>   T11; `tools/charcheck.py`). A/B: wanderer full pack 0 px differ; honk only the 4 glyph-birth frames differ.
> - **Lead fixes between waves 3 and 4:** (1) `--preset cast` (charpack + bake) and `cast_clips` now include **point,
>   ghost, ghost-spent** (run optional) — a pack without them FAILs; (2) the talk loop's FIRST speech bubble no longer
>   pops out and leaves a 0.4 s gap (fx looks ahead to the clip's next speak beat) — drop the "speak at f2" / "two speaks
>   per loop" workarounds; (3) charcheck no longer crashes when an FX shows on every frame; talk islands/key_delta come
>   from a new `nofx-talk` copy. A/B: wanderer full pack 0 px; fox only `clip-talk` (the bubble now shown at grid 12–23).
> - **Lead fixes between waves 4 and 5:** `tools/bake.py` — an authored LegGait walk whose start-up cycle skipped a
>   drawing (maxflow: k0, k1, k3 → a 3-drawing baked walk) is now cut from the first steady cycle, with a warning; legacy
>   Gait ids untouched. A/B: wanderer, maxflow, fox sheets byte-identical; repro `shots/lead-w4/mfms.js` walk 3 → 4
>   frames. Verified (no change): the camera-side arm is the RIGHT at SE/E and the LEFT at W/SW; `spec.presence` already
>   overrides the presence band. Ghosts: use `spec.ghost` (wave-3 banner), not the old ghostK recipe.
> - **Lead fixes between waves 5 and 6:** `tools/bake.py` auto cell growth no longer runs away (wave 5: 3/4 NPC bakes
>   without `--cell` grew to 122–152 and wrapped/cut the head — elder anchor [29, 24] in a 58×146 cell). The `below` scan
>   followed the figure into the next row's raised prop / hover, so the pad grew 8 → 57; the pad is now capped at 0.3 × the
>   new cell. Elder 146 → 80 (58×64), sweeper 152 → 112 (72×85), vendor 122 → 90 (54×70), every row complete
>   (`shots/lead-w5/fix-*.png`, `npc-*-{idle,vote,die}.png`). A/B: wanderer, cilantro, npc-porter sheets/json/preview
>   byte-identical (`shots/lead-w5/ab.py`). **Drop the `--cell 90/96/100/128` workarounds**; still check the printed anchor.
> - **Module fixes round 2 (module fixer, 2026-10-16) — these change idle-turn, talk, die, vote and emote renders too.**
>   Files: `src/chars/{character,locomotion,rig,look,fx}.js`, `scenes/char-stage.js`, `tools/{charpack,charcheck,bake}.py`,
>   `tools/shot.mjs`, `refs/cast/_src/gamespeed_gif.py`. Full-pack A/B of 19 cast members: no new FAIL.
>   - **Turns are calmer (M8, head lag):** an idle recovery step is two drawings (lifted, landed); the chest/head lag no
>     longer redraws while it settles (`character.quant.lag: 'step'` = old). 2–5 fewer post-turn redraws.
>   - **Walks (M15, both gaits):** only planted feet pull the hips down for reach; walk/run drawings whose swing foot was
>     out of reach now sit ≈ 1 texel higher (legacy-Gait chibis too) — re-check hem/boot clearance in the walk strip.
>   - **Equal keys don't pop (M13):** a key whose pose equals the drawing on screen is not redrawn — no need to avoid
>     duplicate final keys. **Events fire on their own frame** (emote glyphs mid-hold appear on time).
>   - **FX:** one steady speech bubble for a whole talk loop (beats ≤ 1.2 s apart, `fx.speech.chain`); die hurt flash = one
>     drawing; dig/land dust rings scattered and gone in 6 frames; `fx.poof` / `fx.land` { n, speed, radius }.
>   - **New opt-ins (spec changes are yours):** `spec.lights: [{ socket, color, intensity | [day, dusk, night], distance,
>     flicker }]` (character lantern light, keeper/moth/green-hood: move your scene light here); use `uCharTime` instead of
>     `uTime` in `material.tones` glow code (freezes with `t=`); `material.merge: { earL0: 'head' }` (no junction line
>     between same-slot child/parent parts); `material.whiteKeep: 0.6–0.8` (whites stay white at golden); chain
>     `rigid: true` (multi-link chains settle once per key); rig `chibi({ neck: 0.12 })`, `jaw: { back: true }`;
>     `locomotion.crouch` (hop touchdown depth, m); a squashable bird: `locomotion.squash { bones: ['ball'], riders }`.
>   - **New charcheck rows:** `islands` / `<clip>.islands` (detached parts: honk feet), `face_visible` (face under a
>     brim/beak: crow 48 %), `<clip>.key_delta` (two authored keys that look the same, < 1 %), `<gait>.distinct`
>     (identical gait drawings), `<gait>.head_bob` (bob < 1 px, or a one-sided limp ≥ 3 px on alternating walks);
>     `sig_ground.*-sun` now measures the lit half (goat golden flips
>     to WARN); `final_hold`/`hold_redraws` of vote/die come from an fx=0 copy (FX lifetimes no longer FAIL them).
>   - **Stills:** `grid=turnaround&clip=walk&frame=<k>&speed=<v>` shows gait drawing k at 8 facings (T9); a `#` in `--q`
>     works (T20). Bake without FX: `tools/charpack.sh --bake <name> --q fx=0`. Line-up scripts: skip `pipeline/skip.txt`.

> **Unattended-run rule (read first):** these runs go overnight with nobody at the keyboard. NEVER run a raw `rm`
> (any `rm`/`rm -f`/`rm -rf`, especially with a `*` glob): it triggers a permission prompt for the user and your agent stalls
> until someone clicks. To clear old renders use `tools/clean.sh shots/<your-dir> ['*.png']` (local + render host, only
> inside shots/ or out/), or simply write into a fresh versioned folder (`shots/<you>/r2/`). Same for other prompt-prone
> commands: no `sudo`, no deleting outside shots/out, no editing files outside the repo.

> **Clocktower-only rule (user, 2026-10-16):** cast members are used ONLY as player characters in the Clocktower social-deduction
> game. NO attacks, weapons swings, combat smears, hurt/hit reactions or fighting poses — props (sword, shovel, staff) are worn/held
> for identity, never swung at anyone. Clips the game actually uses: **idle**, **walk** (THE game-speed gait; `run` is optional/low
> priority — the game has one movement speed), **talk** (speaking loop), **vote** (raise hand/wing/paw + hold), **point** (the game's
> shared emote: point toward someone), **die** (a gentle, non-violent collapse/fade to a held pose — executions and night deaths
> happen off-screen), **ghost** idle (dead players hover as a pale translucent-looking ghost; also a "ghost-spent" variant = dimmer,
> used after the ghost's one vote), and ONE social signature emote from the blurb (a gesture, not an action against anyone).
> Smears are for quick gestures (a pointing flick, a wave), not strikes. Critics: score these clips, ignore missing combat.

> **Storyteller (user, 2026-10-16):** `storyteller` is a real character (the game's human host, not a player) and must be
> VISUALLY DISTINCT FROM EVERY OTHER CAST MEMBER — the most unmistakable silhouette in the town at 25 %: tallest figure, the
> only deep purple (robe with gold trim + stars), void face with glowing amber eyes, warm lantern + tall clock-topped staff,
> robe hem hides the feet (v1 sprite + packages/assets/scripts/cast/storyteller.ts). Do NOT let it read like the keeper/wanderer
> test characters or any hooded cast member (green-hood, crow): check the 25 % line-up against ALL finished characters.
> Game behaviour to animate: it never votes, dies or becomes a ghost; it can travel up to 4× player speed (a gliding robe
> sway / fast drift that still reads at 4× — no running legs); it "poofs" in when it appears (a short arrival/vanish FX);
> clips: idle, walk (+ fast travel), talk, point, an "appear/vanish" emote and one signature (e.g. lifting the lantern /
> consulting a grimoire / the clock-staff chiming). Lantern = warm quantized light at dusk/night.

> **SKIPPED (user, 2026-10-16): `nicksong`** — do not build, render, critique or refine it for now; its agents should stop and
> return a minimal "skipped by user" result. Exclude it from line-ups/galleries. (List: pipeline/skip.txt.)

> **greenting override (user, 2026-10-16, updated):** identity = the USER reference `refs/cast/greenting.png` — "it should
> basically be like **Joguman**": a simple soft rounded green creature with a long body/neck, stubby arms and legs, a rounded head,
> and a tiny simple face (two dot eyes + small smile) placed **off to the side of the head** (profile-ish, toward the snout), not
> centred. Darker-green outline, no clothes, deadpan-cute and silly (out of place in town is fine). (Magenta in turnaround-isolated.png is only the
> stray-pixel debug marker, not a colour.) The v1 sprite/.ts is NOT the identity. Critics: judge against this reference.

This is the procedure. Contract and APIs: `docs/CHARACTERS.md`. Techniques and numbers: `docs/CHARACTER_TECHNIQUES.md`.
Porting a Clocktower cast member from its v1 2D sprite: `docs/CAST_PORTING.md` (refs owner) + `refs/cast/<id>.png`.
Lessons: `docs/CHARACTER_LEARNINGS.md` — read it first; every **(recurring)** lesson is now a checklist line below (marked
**R**), so a box you cannot tick is a known way to lose rubric points. Shared-code bugs: its §Module backlog.
**Worked examples:** `characters/wanderer.{md,js}` (reference; copy them to start a biped) and
`characters/{duelist,keeper,hound}.{js,md}` with their critiques in `shots/critic-<name>-r{1,2}/`.

The order matters: **brief → design sheet (incl. Unique to me + game-speed plan) → silhouette → proportions → palette →
rig → poses → timing → secondary motion → FX → game-speed pass → SELF-CRITIQUE → bake.** Each stage ends with a render you
have LOOKED at (Read tool on the PNG). Never move on with a stage you have not seen.

### Why this playbook was rewritten (run 04 → run 05)

Run 04: round-1 critic scores 14–16, final hound 18 / keeper 17 / duelist 19 (bar 19), and **every author self-scored
3–7 points above the critic** — always for the same reasons: a facing nobody rendered (usually dir 1, the game facing, or
E/W), per-facing tone counts nobody counted, scene crops (golden / pillar shadow) nobody measured, redraws inside holds
nobody diffed. `report.txt` passed all of them. Hence two hard rules for this round:

1. **Stage 7 SELF-CRITIQUE is mandatory** and produces an evidence table in the design sheet. **Every rubric score cites
   pixel evidence** (file + facing/frame + a number). A criterion without cited evidence scores **at most 1**; a
   criterion with an unrun check in its evidence list scores **at most 1**. Report the table's total as `self_score`.
2. **Game speed is part of the brief.** The cast walks at Clocktower v2's speed relative to body size (§Game speed).
   A gait tuned at a stroll and never rendered at game speed scores ≤ 1 on Weight/contact.

### Cast wave 1 (8 members, critic 15–18, none shipped) — the six ways every one of them lost points

Self-score gaps shrank to −1…+3, so the Stage 7 table works; the points were lost on the same six things (details:
`docs/CHARACTER_LEARNINGS.md` score history; each is an **R** line below, tagged **W1**):
1. **Glide gait** (8/8): legs ≤ 0.25 H under a robe never show a planted foot → make contact a visible DRAWING (Stage 3 gait).
2. **Vote doesn't rise** (6/8): a chibi limb can't clear its own head → raise a PROP ≥ 0.3 m above the crown, up-and-out.
3. **Face hidden at dir 1 / S** in talk and emote keys (5/8): head nod pitch, a paw over the muzzle, a glance away.
4. **Identity/story prop vanishes** in the walk or at some facings (6/8), incl. a story prop sharing a slot with trim.
5. **Sheet ≠ code** after the fix round (6/8) → rewrite the sheet from the current code as the last step of every round.
6. **Wrong key judged** (7/8): loop-clip `frame=` was offset by `at` (FIXED mid-run, T1: `frame=` is now the real key; `&at=0` is harmless). Always confirm the `p` field.

### Cast wave 2 (7 members, critic 14–16, none shipped) — what cost points this time

Self-score gaps were 0…+1 (honest), but scores fell: the points went to facings and keys nobody rendered. Each is an
**R W2** line below (details: `docs/CHARACTER_LEARNINGS.md` score history + "(lead, wave-2 merge)" bullets):
1. **Identity part leaves the silhouette at 1–3 facings** (6/7): hammer at E/W/SW, vote prop behind neck/head at W/E,
   shell slivers at S, no face at E/W → 8-facing key-green silhouette row of EVERY held key + 25 % line-up at 8 facings.
2. **Eyes/face fail away from the rest pose** (6/7): proud eyes poke out of the lathe at profile, a glint turns into
   goggles on a breath key, glow fills a void face, a hinged chin reads as a beak → 8-facing ×8 stills of every idle/talk key.
3. **Consecutive keys render the same** (4/7): four wrench turns = one drawing, a 2-px wink, 0–2 px squints, walk drawings
   1–2 texels apart → every key changes ≥ 25 % silhouette or a big part ≥ 3 texels vs the PREVIOUS key.
4. **Contact drawings show no / wrong feet** (5/7): boots through the skirt, feet buried by squash, one boot at S.
5. **Identity colour traded for a check** (4/7): olive → tan, white → peach in golden, green → purple in shade.
6. **Rear and die facings** (4/7): snowman/ball backs, a die that reads as sitting, the face rolled away.
Also: **module fixes M1/M2/M3/M5 are in** (banner above) — 6/7 wave-2 notes still worked around them. Re-verify first.

### Cast wave 3 (8 members, critic 15–17, none shipped) — what cost points this time

Gaps −1…+1 (preservation +3: E/W never judged). Each is an **R W3** line below (details: `docs/CHARACTER_LEARNINGS.md`
score history + the wave-3 archive):
1. **Game clips missing** (7/8): point / ghost / ghost-spent were never authored because the cast table and
   `--preset cast` left them out. **FIXED (lead):** the table below, `charpack --preset cast`, `bake --preset cast` and
   `cast_clips` now list them (run is optional); `cast_clips` FAILs without them.
2. **Flat held things edge-on at SE (dir 1) or E/W** (6/8): vote card, pennant, placard, wing paddle, fin, stretched arm —
   and two of them read as a WEAPON at 1× (placard = axe, wing = baton).
3. **Die reads as sitting / standing at 2–3 facings** (6/8): a body lying along one axis foreshortens where the camera
   looks down that axis.
4. **S/N 25 % blob matches other cast** (6/8): beaks, snouts and tails pointing at/away from the camera add depth, not
   outline — only WIDTH changes the S/N silhouette.
5. **Face fails at E/W or in talk** (8/8): profile eye mid-skull, an ear read as the eye, mouth band round the head, talk
   mouth 0–2 texels, lit "dark" eyes, pupils that re-rasterise into letters.
6. **Emote punchline does not read** (6/8): it equals a talk key, is a T-pose, a hop in place, or happens on the far limb.
7. **Shadow tone lifted with a hue step** (5/8): mauve / plum / lilac `sh` = a different animal in the pillar shadow.
Also: the fx speech-chain first-beat gap and the charcheck `isl[0]` crash are FIXED (lead) — drop the "first speak at f2"
and "two speak events per loop" workarounds.

### Cast wave 4 (4 members, critic 15–18, none shipped) — what cost points this time

maxflow 15 (self 19, +4), theo-rem 17, greenting 17, storyteller 18 (best cast r1 so far). Each is an **R W4** line below
(details: `docs/CHARACTER_LEARNINGS.md` score history + "(lead, wave-4 merge)" bullets):
1. **Point aimed sideways or with the far arm** (4/4): the camera-side arm is the RIGHT at SE/E and the LEFT at W/SW, so
   one arm never reads at S/SE/SW/W — aim along the facing with both arms or a leading shoulder (Stage 3 **R W4 point**).
2. **Profile face fails at E/W** (3/4; 7 members over waves 3–4): ear root read as the eye, a 2-texel snout, eyes on a
   snout-cap edge, nose behind a rim (Stage 0 **R W4 profile face**). maxflow's +4 gap was mostly unrendered E/W.
3. **Cream identity drifts at golden** (2/4): whiteKeep does not catch cream (Stage 0 **R W4 cream identity**).
4. **Grey inner-line seams on unclothed bodies** (3/4): `material.merge` the same-slot masses (look fix pending).
5. **Die sits / final hold less tipped than the drawing before** (3/4) and **emote = vote** (theo-rem).
6. **Sheet claims the still contradicts** (4/4): staff "plant" = push-off, "waddle" = lurch, poof "at the crate" = on the
   belly. A pose claim cites the 8-facing still of that key; a motion claim cites the 1× GIF frames.
Also FIXED (lead): the sprite bake no longer ships a start-up walk cycle that skipped a drawing (maxflow baked 3 of 4).

### Cast wave 5 (4 NPCs, critic 15–16, none shipped) — what cost points this time

npc-sweeper 16 (self 17), npc-vendor 15 (self 16), npc-elder 15 (self 15), npc-porter 15 (self 16). Gaps 0…+1, but
**every R W4 rule that applied was broken again** — the authors did not render the key the rule names. Each is an
**R W5** line below (details: `docs/CHARACTER_LEARNINGS.md` score history + the wave-5 archive):
1. **Vote prop not in a visible raised hand** (4/4): broom floating 7 texels off the hand (sweeper), arm behind the head at
   E (vendor), cane out of the skull at SE/W (elder), sack ON the hood at E/W (porter) → Stage 3 **R W5 vote prop**.
2. **R W4 point ignored** (2/4 sideways: sweeper, elder) and **R W4 die again** (4/4 sitting / kneeling / levitating prop
   at 1–2 facings) → Stage 3 **R W4 point** (+ wide-robe pointer) and **R W5 die**.
3. **Emote keys or emote vs ghost render the same** (2/4: elder nod = ghost pose, vendor's two calls = one drawing at
   S/E/W) → Stage 3 **R W5 distinct at 8 facings** (key_delta is measured at the pack facing only).
4. **Profile face / face details** (3/4): no face under a bob cap at E/W (sweeper), face box proud of the hood = snout
   (porter), shut eyes = dots, dead mouth = scream "O" (sweeper, elder).
5. **Mid-value identity drifts at golden** (2/4: grey hair → tan, purple hood drift toward the Storyteller) and **NPC
   25 % blobs match each other** (4/4: elder / porter / vendor / sweeper / green-hood plain lozenges) → Stage 0 **R W5**.
6. **Sheet ≠ still, again** (4/4): "broom flat beside him", "pushed ahead", "hobble", "clears the head 7/8", "two deep nods".
Also FIXED (lead): bake auto cell growth runaway (banner above).

---

## Render host and commands

Nothing runs on the Mac: every command syncs the tree to the render host **`render-host`** (RTX 4090; the scripts' default)
and runs there. **Never `game-host`** — it is the live Clocktower game server (older docs told you to pin it; that is void).
Check the GPU line in a shot log (`RTX 4090`) and say in your report where you rendered.

**One call at a time, only `tools/shot.sh`, `tools/charpack.sh`, `tools/remote.sh`.** **R** Raw `ssh host bash -s < x.sh`
and printf/xargs batches are blocked by the permission classifier (and the xargs variant silently rendered the mannequin).
For many poses in one render use the 8-facing still. **R W3 (recurring, 4 agents)** zsh does not word-split `$v` in
loops (`for k in 'vote 3'; set -- $k` silently rendered idle:0 under the wrong names): write explicit commands, one
per call, or wrap the loop in `bash -c '…'`; confirm the `p` field of every still. **R W3 (3 agents) + W4 (2 critics, again)** Never type
`python3` on the Mac, not even a "quick json read" or `python3 -c 1`: `tools/remote.sh python3 …`. Env vars go through `env`:
`tools/remote.sh env X0=12 python3 shots/char-<id>/x.py.js` (`X0=12 tools/remote.sh …` does not reach the host).
**R W5 (3 more: elder critic, vendor author, the lead)** the Mac `python3 -c 1` slip happened again — type `tools/remote.sh`
first, always. `tools/remote.sh` syncs helpers only ONE level deep (`shots/<dir>/*.py|*.js`): keep helpers at
`shots/<you>/x.py.js`, not `shots/<you>/r2/x.py`; it also quotes its arguments, so a pipeline/`&&` chain needs
`tools/remote.sh bash -c '…'`. The PreToolUse hook blocks any Bash command whose TEXT contains the skipped member's name
(even `grep -v <name>`): filter with `pipeline/skip.txt` (`grep -vf pipeline/skip.txt`) instead of typing it.

| what | command | look at |
|---|---|---|
| turnaround (≈ 10 s) | `tools/charpack.sh <name> --only turnaround` | `turnaround.png`, `turnaround-silhouette.png`, `turnaround-isolated.png`, `report.txt` |
| some clips (≈ 15 s) | `tools/charpack.sh <name> --only clips --clips talk,vote` | `clip-<c>.png`, `clip-<c>-60hz.png`, `clip-<c>.gif` |
| full cast pack (≈ 40 s) | `tools/charpack.sh <name> --preset cast --raw` (= idle, walk, run, talk, vote, point, die, ghost, ghost-spent, `spec.emote`, turn; adds cast_clips + final_hold rows; lead wave 3: point/ghost/ghost-spent added, run optional) | everything + `scene-*-crop.png` |
| **locomotion at GAME speed** | automatic in every pack with a walk (`--game-speed <m/s>` overrides `spec.gameSpeed.v` / 3.95·H; `--game 0` skips) | `clip-game.png`, `game-onion.png`, row `game.readable` (cycle, drawings shown per cycle, aliasing), `game.foot_slide` at dir 1 + dir 2 |
| **1× real-time GIF at the game camera** | automatic: `game-1x.gif` / `game-x3.gif` (fixed camera over 1 m tiles) and `clip-<c>-1x.gif` per clip | judge at 1×; Read shows one frame — also read `game-onion.png` and the strip |
| **one key pose at 8 facings** (main judging tool) | `tools/shot.sh char-stage shots/char-<name>/g8-<c>-f<f>.png --size 640x360 --q 'scale=1&char=<name>&grid=turnaround&clip=<c>&frame=<f>&fx=0&bg=plain' --t 1` (drop `fx=0` on a smear/FX contact) | S SE E NE N NW W SW, crop ×3–4. **R W1** loop clips (idle, talk, ghost): `frame=` is the real key since the T1 fix (it used to be offset by +8 without `&at=0`); confirm the `p` field in the shot log for every key still. Walk/run drawings can't be frozen with `frame=`: use `raw/clip-game/` frames + a `--dir 2` pack |
| one still | `tools/shot.sh char-stage shots/char-<name>/x.png --size 640x360 --q 'scale=1&char=<name>&clip=vote&frame=7&dir=2&bg=key' --t 1` | ×4–8 |
| an action at another facing | `tools/charpack.sh <name> --only clips --clips die --dir <d> --out shots/char-<name>/dir<d>` | per-facing strips |
| far-half sides | `… grid=turnaround&clip=idle&bg=plain&look=far` | magenta only on L/R limbs |
| inner lines | `… outlineDebug=1&dir=1` (single still) | no red inside the signature |
| A/B a design change | variant spec `shots/char-<name>/wv.js` (below), `--q 'char=../shots/char-<name>/wv&wv=<flags>'` | A vs B in the same tree state |
| night tests | add `lantern=0&cover=0` (stage lantern, glow, wind, clouds ignore `t=`) | |
| re-run checks | `tools/remote.sh python3 tools/charcheck.py shots/char-<name>` | table |
| sprite bake | `tools/charpack.sh --bake <name> --preset cast --out shots/char-<name>/bake` (= idle, walk, run, talk, vote, point, die, ghost, ghost-spent, emote) (no `--cell`: auto growth), then copy into `out/sprites/` | `<out>/<name>-preview.png`, no "touches the cell border". **R W1** `--cell N` = the square RENDER cell; the printed/json cell is trimmed to the figure (`--cell 132 → 62×71` is normal; printed height = N means a drawing hits the top). Bake into shots/: `tools/remote.sh` pushes the Mac's stale `out/` over remote bakes |
| exports sanity | `tools/remote.sh node tools/charexports.mjs` | "dups []" |

The game-speed preset, 1× real-time GIFs and the readability check shipped in tools r06 (`docs/CHARACTERS.md` §7); the
thresholds below are unchanged.

Judge pixels only from 1× renders (charpack renders 640×360 at scale 1 and enlarges with nearest). Your own crops / GIFs:
PIL with `Image.NEAREST`, inspection only. **R W1 (6/8 collided)** The scratchpad root AND the render-host tree are shared
with up to 8 parallel agents: helpers only in `<scratchpad>/<id>-r<n>/` or `shots/char-<id>/` with your id in the file
name (never `g8.sh`/`zoom.py`); write only under your own `shots/{char,critic}-<id>*/`; Python helpers that must run
remotely are saved as `shots/char-<id>/<x>.py.js` (only `shots/*/*.js` syncs) and run with `tools/remote.sh python3 …`;
pull composites with `rsync -az 'render-host:pixel3d/shots/char-<id>/<files>' shots/char-<id>/`. Never run python on the Mac.
**R** Raw frames `raw/clip-<c>/f-<i>.png` are padded to 2 digits: index by the job's `times` list or the integer after
`f-`, never `sorted(listdir())` (manufactured 417 px of fake flicker once). **R** `report.txt` only has rows for jobs rendered in THAT run (tools r06; older packs kept stale clip rows). **R** Others edit shared code
while you render: A/B in the same tree state (A, B, A′; A == A′) and re-run a surprising check before acting on it.

**Variant specs (A/B without editing the owner's file).** A module in your shots folder imports the character and overrides
parts / clips / material behind a URL flag (`tools/remote.sh` syncs `shots/*/*.js`):
```js
// shots/char-<name>/wv.js — render with --q 'char=../shots/char-<name>/wv&wv=ab'
import { make, CLIPS } from '../../characters/<name>.js';
const flags = new URLSearchParams(globalThis.location?.search || '').get('wv') ?? '';
const spec = make();
if (flags.includes('a')) spec.clips = { ...CLIPS, vote: { ...CLIPS.vote, keys: [/* … */] } };
if (flags.includes('b')) spec.material = { ...spec.material, slots: { hat: { lift: 0.5 } } };
spec.name = '<name>-wv-' + flags;
export default spec;
```
Sanity: `wv=` (no flags) must be pixel-identical to the real spec. Numeric URL params or a JSON pose param let one
variant test many values in one batch.

---

## Game speed (Clocktower v2, matched RELATIVE TO BODY SIZE)

Source (read-only reference): `pipgws/packages/protocol/src/constants.ts` `PLAYER_SPEED = 150` px/s at 16 px/m;
v2 sprites ≈ 38 px tall (32×40 frame); the walk is 4 drawings at 12.5 fps (`walkFps 10 × 1.25`) → **cycle ≈ 0.32 s**;
idle is one drawing; there is ONE player speed (no run). The Storyteller may travel up to 4× faster.

| quantity | v2 sprite | pixel3d cast member of height H (m) |
|---|---|---|
| travel speed | 150 px/s = 3.95 body-heights/s | **v_game = 4·H m/s** (H 1.4 → 5.6 m/s; H 0.6 → 2.4 m/s) |
| on screen at vh 10 | 150 px/s | 36·v px/s (H 1.4 → 200 px/s ≈ 6.7 px per 30 Hz frame) |
| cycle (two steps) | 4 drawings, 0.32 s, 1.25 H travelled | **8–10 grid frames (0.27–0.33 s), 4–5 drawings held 2 grid frames**, cycle length C ≈ 1.1–1.3·H, one step ≈ 0.6·H |
| root glide inside one drawing | ≈ 12 px = 31 % of the body | ≈ 13 px for H 1.4 (26 %): planted feet ride the root between pose frames by design; they must be exact AT pose frames |
| Storyteller fast travel | up to 4× | the `run` clip: plan it for 2·v_game (8 H/s) |

**Clip naming for the cast:** `walk` = THE game locomotion at v_game. `run` = Storyteller fast travel (2·v_game). Both
are tuned and judged at those speeds, not at the runtime defaults (wanderer walkSpeed 1.3 m/s = 0.85 H/s was 4.7× too
slow; keeper 0.6 m/s = 10× too slow).

**The cycle must be a whole number of drawings.** Choose drawings per cycle N (4 or 5) and hold h = 2 grid frames; then
the cycle lasts N·h/30 s and the cycle length is C = v_game·N·h/30, i.e. **one step = v_game·N·h/60** (H 1.53, N 4:
0.81 m). If the gait's own cycle is shorter than N·h grid frames, the 15 Hz drawing rate aliases: evidence
`shots/process/wanderer-gamespeed/clip-walk.png` + `raw/clip-walk.json` — the stock wanderer at 6.1 m/s plays its run
(Froude) with a **6-grid-frame cycle, so only 3 of its 6 drawings ever show** (pose ids run:0/2/4, then 1/3/5), the
stance lasts ≈ 1 drawing so contact is never seen twice, and `foot_slide` reports a meaningless 0.0. At 1× on the meadow
(`shots/process/gs-meadow/wanderer-game-1x-sheet.png`, `-strip.png`, `-1x.gif`) only the legs change (a ≈ 6×8 px patch), hat
and scarf carry no rhythm, and the 3-drawing loop reads as a figure sliding over the grass with flickering feet. Lesson:
at game speed something BIG must carry the rhythm (bob ≥ 1 texel on the whole figure, a chain or ear swing, a hop arc).

**Feasibility per body plan (do this arithmetic in the design sheet before rigging).** A planted foot can cover at most
its reach during stance: stance span S ≈ duty β · C ≤ ~0.9·hip height. With C ≈ 1.2·H:

- biped, hip ≈ 0.45 H → β ≤ ≈ 0.34: the game "walk" **is a run with a flight phase** (a brisk scurry). Chibi legs make
  this worse; give it a run's poses (contact / down / push / flight) and 1–1.5 texels of bob, not a stroll.
- short-legged plans (birds, mole, snail-with-feet, mushroom; hip ≈ 0.2–0.3 H) → β ≤ ≈ 0.2: stepping cannot keep up.
  Use a plan whose contact is rare and clear: hop / bound (frog, toad, rabbit: ONE hop per cycle, C ≈ 1.2 H, airborne
  most of it), waddle-skip with a flap (geese, owl, crow), flutter-hover (moth), squash-glide (snail, greenting: no feet
  → no slide, but the squash cycle is phased to distance travelled).
- quadruped (the hound and any true four-legged NPC; NOT fox, goat, cow, red panda or hedgehog — the identity source
  `refs/cast/_all.png` draws those upright and clothed: `chibi()` / uprightAnimal, CAST_PORTING §6): trot β 0.5 fails for C ≈ 1.2 H when the leg is ≈ 0.4 H; use a
  bound / gallop (β ≈ 0.25) with all four paws exact at their contact drawings.
- the cadence floor: N ≥ 4 drawings × 2 grid frames → cycle ≥ 0.27 s; you cannot "just step faster".

**Game-speed acceptance (Stage 6, cited in Stage 7):**
1. Pose ids at v_game are the clip you meant. Cast members set `locomotion.plan` (LegGait, motion r5 — tuned for
   4 H/s; `planInfo(word).locomotion`). Only a legacy-Gait biped needs `runFroude` raised above the game Froude
   v²/(9.81·hipY) so the walk plays — and then the WALK-branch numbers (duty[0], stride, poses[0], lift[0], arms[0]) are
   the ones that matter; raise the walk arm swing so the upper body carries the rhythm and **every one of the N drawings shows in every
   cycle** (count distinct pose ids per cycle in `raw/clip-walk.json`).
2. **Contact visible**: each stance foot/paw appears planted in ≥ 2 consecutive drawings OR the plan is a hop/glide whose
   contact drawing is a deliberate single key; at those pose frames slide ≤ 1 texel, measured at dir 1 AND dir 2 over every
   foot (charcheck measures the pack dir AND dir 2 over every declared foot — declare `bodyPlan`/`feet` or a quadruped gets only 2).
3. **Read at 1× real time**: watch the 1× GIF (33 ms per 30 Hz frame) on the meadow at dir 1 and dir 2. Write one line:
   which body part carries the rhythm (bob, ears, wings, hop arc), and does it read as the species' gait, not a blur. A
   reviewer squinting at 1× must name the gait in one word (scurry, hop, waddle, glide, flutter, gallop).
4. Bob / hop arc ≥ 1 texel (0.028 m); a hop's apex ≥ 4 texels; nothing smaller than 1 texel carries the gait.
5. Talk / vote / emote / die also played as 1× GIFs: a speaking gesture loops with ≥ 2 drawings ≥ 25° apart every
   ≈ 0.3–0.5 s (it must read while others walk past at 200 px/s); vote raises in ≤ 0.2 s (≤ 6 grid frames) and holds;
   die is readable at 1× in ≤ 1 s and ends on a held pose whose 25 % thumbnail is clearly "down".

---

## Stage 0 — Brief → design sheet (`characters/<name>.md`)

Write before any code (≤ 1.5 pages; template: `characters/wanderer.md`). For a cast member start from
`refs/cast/<id>.png` and `pipgws/packages/assets/scripts/cast/<id>.ts` (identity source; read-only) and
`docs/CAST_PORTING.md`.

1. **One-line concept + 3 adjectives** (they drive dynamics presets and timing).
2. **Body plan** (biped / upright animal / quadruped / bird / hopper / limbless / flier / long-neck — §Body plans) and
   why. Height H, hip height, and the **game-speed numbers**: v_game = 4H, N, step = v_game·N·2/60, duty bound, which
   gait (scurry / hop / waddle / glide / flutter / bound). If the arithmetic says stepping can't keep up, pick a gait
   that can — in the sheet, before rigging.
3. **Silhouette idea**: 1–2 shapes recognisable as a black blob at ~50 px (25 % thumbnail). Compare with EVERY finished
   character's `turnaround-silhouette.png` (cast members in `characters/` included) — two blobs alike = redesign.
   **R** Two-part signature: list both parts; each its own slot or ≥ 15 % L / ≥ 30° hue step from what it touches; both
   checked at all 8 facings by eye (charcheck measures one slot). **R** Concave signature (cocked brim, crown, horns,
   beret rim, shell spiral): ≥ 2 parts meeting with a ≥ 0.03 m step — a single convex loft can only be a cone.
   **R W1** Line up **E/W** at 25 % too: frontal-plane accessories (tufts, antenna fronds, horn loops) collapse to a 1–2
   texel spike at E/W (owl ≈ moth, goat ≈ keeper) — give them ≥ 0.1 m depth or a back lean. **R W1** A cap/hat over a bell
   body is the cast's default blob (crow ≈ mushroom): a side shape or the identity prop must break the bell outline by
   ≥ 3 texels at S AND N.
4. **Proportions table**: metres and texels at vh 10 (36 px/m) and 12.5; head in heads; per-plan targets from §Body plans
   (`spec.heightPx` once tools reads it).
5. **Palette**: ≤ 5 slots `[hi, mid, sh]` + 1 accent, value plan: biggest slot ≥ 15 % L off grass mid `#75A558` or clearly
   off-hue; its sh ≥ `#3A3040` (night); shadow tones of different slots ≥ 20° hue apart; **R** the signature is the
   lightest mass **in sun AND in shade** (its sh ≥ body sh and ≥ 15 % L over grass shadow `#3B6D5F`, hue away from teal
   163°); **R** the signature differs from lit grass by ≥ 30° hue or ≥ 25 % L at noon AND golden (golden multiplies ≈
   (1.0, 0.8, 0.55): high-red light colours collapse onto golden grass — choose by rendering scene-golden). Arms/forelimbs
   in a different slot from the torso. Warm hi, cool sh, no black/white. Keep the v1 sprite's identity colours.
   **R W1** Keep the v1 VALUE too: lift only `sh` for the night rule (crow's dark hat went tan, owl/skeleton-chef navy went
   periwinkle). **R W1** The emote's story prop (evidence sheet, ledger) gets its own slot ≥ 15 % L / 30° hue from what it
   touches — a story prop may be the second accent (goat's brass sheet was invisible at 7/8).
6. **Part list** (bone → shapes), **bone list** (template + chains + sockets). Held props: side and distance so they clear
   the face at all 8 facings. **R W1** Long props (staff, shovel) stand ≥ 3 texels clear of the hem at 8/8 (rest `out` ≈
   35–40°) and their tip clears the hat/cap top ≥ 3 texels. **R W1** Under `locomotion.plan` the walk plays the REST pose
   for every bone the plan doesn't drive (backlog M1): design the rest pose as the walk carry pose (hip height,
   forward-out, clear of the legs at dirs 1/7), or the prop trails at boot level / hides in the coat (frog, moth).
   **R W1 → W2 corrected** Eyes: box ≥ 0.08 m so 2×2 survives at S/SE (fox, skeleton-chef), BUT on a 16-sided head lathe,
   joint ON the surface, box turned to the surface normal, front ≈ 0.006 m proud — "proud + 15° out" on 8 sides put the far
   eye outside the contour as a dark nub at E/W/NE/NW (rabbit, chonk, honk). Or cut eyes into the skull (owl, honk). Glints
   ≤ 0.024 m flush in the corner (0.034 m = goggles on breath keys). Eyes above the head's equator show from NE/NW.
   **R W2** Identity hue: every tone of the signature slot (incl. `sh`) within ≈ 15° of v1; get ground separation by VALUE
   (toad r2 olive passed at −28 % L). Never deep purple (Storyteller). White fur/down: push the hi toward magenta
   (#F8E8FF) for golden, "cooler" does nothing. Snout ≥ 0.2 m when v1's profile has a nose bump.
   **R W2** Design for the back and the side: name what reads at N/NE/NW (nape on the head bone, light tail ridge, a peak
   leaning sideways) and how the face/identity part shows at E/W — the game walks left/right constantly.
   **R W3 S/N outline (6/8 matched another member at 25 %)** At S and N only WIDTH changes the outline: the 30° camera
   turns forward depth into screen-DOWN (a hook beak 0.1 m forward lands on the chest, polly), and tails/snouts pointing
   at or away from the camera hide. Put a width feature at S/N (wing tips, crest, a tail root swung ≥ 0.15 m out to the
   side and curled up beside the hip — mincut, a scarf end hanging past the body edge) and line up S AND N at 25 %.
   **R W3 profile face (4/8)** Plan the E/W face: the near eye touches the snout/muzzle root (opal: mid-skull eye =
   cyclops — and check a low side EAR is not what reads as the eye: `&drop=<part>` variant), one eye bump on the crown,
   the far eye recessed or culled (the camera pitch lifts the far side ≈ 7 texels — preservation, opal), the mouth reaching
   the snout tip. Ears that vanish at E/W: longer, lower, half-back (clarabelle: 0.40 m, dir [0.72, −0.35, −0.6]).
   **R W3 shade along the hue (5/8)** Lift `sh` (and cream/patch `sh`) along the slot's OWN v1 hue — mauve/plum/lilac
   shadow tones read as a different animal in the pillar-shadow copy (giraffe → llama) while `sig_ground` still PASSes.
   Eye-check `scene-{noon,golden}-crop.png` shaded copies; hue of every slot tone within 15° of v1.
   **R W3 eyes (5/8)** Eye slot hi ≤ #4A4258 (a lit lilac "dark" + glint = X-eye, requin); pupil in the darkest tone,
   1×1–1×2 on a FIXED texel (2×2 pupils in a 4×4 lens re-rasterise into letters, preservation); white ≥ 3×3 when v1 has a
   white eye (progress); keep skull patches off the eye area (cilantro); white masks as ≥ 2×2 patches (mincut).
   **R W4 profile face, again (3/4 failed; 7 members over waves 3–4)** Render the idle at E AND W ×4 BEFORE Stage 3 and
   name what is the eye in each: (a) ears rooted on the crown/back (z ≤ −0.1, y ≥ 0.5), never mid-skull side — the dark
   ear root inside the profile reads as a big eye (maxflow, opal); (b) snout ≥ 4 texels (≈ 0.11 m) proud of the lathe with
   the nose on its tip (2 texels = an egg); (c) eyes placed by angle round the head axis + elevation (greenting r9: |x|
   ≈ 0.9 r, φ ±70°), not a world direction from a snout cap; (d) spectacle rims/brims set back so the nose clears them at
   both profiles. At E you see the character's RIGHT side, at W the LEFT.
   **R W5 (2/4 more: sweeper, porter — now 9 members)** (e) hair caps/bobs: cut the side hair rings back (sweeper
   `clampZ` −0.12/−0.1/−0.04) and put the eye boxes ON the front/side bevel (x ≈ 0.65 × half-width, 0.045 deep) — a
   bob hull covered the whole head at E/W; (f) hoods: face front ≤ rim front (porter 0.222 vs 0.23) or the nose pokes
   past the hood outline as a snout; thin set-back side bars keep both eyes at SE. `face_visible` under-reports faces in
   a hair/hood window (T32) — judge the ×4 E/W crop. WIDE eyes on a head tilted ≥ 10° turn into "+" glyphs at S (vendor).
   **R W4 cream identity (2/4 failed)** `whiteKeep`/`whiteKeepLift` only catch near-whites (chroma < 0.18/0.25) and never
   lighten; a cream hi (#F8E6C2) goes apricot or mauve-grey at golden. Use a cooler, less saturated hi (#F6E4D6 / mid
   #E4C8AA — theo-rem) + `slots.<cream>.lift` ≈ 0.35 + `whiteKeepLift` 0.8 (maxflow #957C7E → #D8CCBF), and judge the
   golden sun AND shade copies by eye. A cream that is darker than the fur next to it at golden is a FAIL.
   **R W4 colour-identity ghost** `ghost.keepHue` 0.25–0.35 for any character whose colour IS the identity (greenting went
   lavender-white at 0), not only for dark characters.
   **R W5 mid-value identity at golden (2/4)** No keep option catches a mid grey or a mid tan: `whiteKeep` gates luma >
   0.75, `creamKeep` gates authored-mid luma > 0.45 + warm (sweeper grey hair #66667C → tan #856D59; porter burlap #A19276
   had to be lightened before creamKeep applied). Until look gets a hueKeep (backlog), pick the slot so a keep applies
   (lighter cream → `creamKeep [1, 1]`, vendor apron #DCD6C6 golden-sun +14 → +25 %) or accept and REPORT the golden
   drift. Never let a hood/robe drift toward purple (porter #3A3438 → #524858 = Storyteller-ward).
   **R W5 NPCs are boring, not identical (4/4 matched each other at 25 %)** elder / porter / vendor / sweeper / green-hood
   were the same S/N lozenge. The ONE prop or hair shape must leave the blob at 6/8 facings at 25 % (elder cane 1 px →
   ≥ 2 texels thick, splayed ≥ 12°; vendor bun ≥ 2 texels outside; porter sack low on the back AS v1 DRAWS IT, bulging
   past the outline at SW). Line up the other NPCs too (cut them from `shots/char-*/turnaround-silhouette.png`).
   **R W5 v1 placement first** A back load / held prop goes where the v1 sprite draws it (porter's sack sat shoulder-to-
   crown instead of the lower back → a cream "bun" at SW, a sack-hat in the vote). Compare the 1× S and N crop with v1.
7. **`## Unique to me`** (mandatory; the critic grades it). Answer each with a concrete plan and how you will verify it:
   1. **Extra animated parts**: which secondary parts move (ears, tail, wings, shell, antennae, beret, apron, cape, phone,
      papers, spores, lantern, tongue, gills…) and HOW: spring chain (preset, 1 link for short parts), keyed in clips
      (≥ 25° per drawing pair), or FX. Which of them carry the gait rhythm at game speed.
   2. **Own gait**: how this character moves unlike the others (hop, waddle, glide, slither, flap-hover, lumber, prance,
      scurry) and the game-speed arithmetic that makes it readable and 0-slide at v_game.
   3. **Expressions in the new style**: translate the v1 sprite's face (eyes, mouth, brows, beak/snout) to 3D pixel art
      at ~45–60 px: eyes 2×2 texels (0.07 m) set forward and out so they catch light at S/SE/SW; expressions are geometry
      or slot swaps keyed per drawing (eyelid part, brow part rotated ≥ 25°, mouth/beak hinge open ≥ 2 texels, head squash
      via `pos`/scale), never sub-texel nuance. List what talk (mouth/beak open-close), vote (eyes up/determined), die
      (eyes closed / X), emote need, and how each reads at 1×.
   4. **Game-speed readability**: for each clip, will it read at real speed and size? What carries it (a big arm/wing
      arc, a head bob, a hop apex), timing in grid frames, and the 1× GIF you will check it on.
8. **Motion list** with a **timing chart** per clip on the 30 Hz grid (key frame, hold, what happens, which key carries
   `smear` / events, what must READ). Required cast clips: idle, walk, talk, vote, **point**, die, **ghost**, **ghost-spent**,
   1 signature emote (+ turn check); run is optional. **R W3 (7/8 missed point/ghost)** — `cast_clips` now FAILs without them. Semantics in §Cast clips. Say what the FX module can't draw yet (backlog) rather than faking it.
9. **Secondary motion**: chains with presets, personality (body/head), FX. **R** The numbers in the sheet must equal the
   code at the end (the critic diffs them).
10. **Lights** (lanterns, glowing eyes): `spec.lights: [{ socket, color, intensity | [day, dusk, night], distance,
    flicker }]` + glow code on `uCharTime` (module fix r2; freezes with `t=`). (Corrected by the lead after wave 5: this
    line still said "no spec.lights yet".) Night glass: use the warm mid (#FFC864-ish), not a near-white hi (moth).

## Stage 1 — Blockout (silhouette)

Copy the template closest to your body plan (§Body plans; biped: `characters/wanderer.js`), keep `skeleton()`, replace
`parts()` with plain `K.box`es (signature included), empty `clips`. `tools/charpack.sh <name> --only turnaround`.

- [ ] Recognisable from all 8 facings in `turnaround-silhouette.png` (1× and 25 %), both signature halves visible.
- [ ] **R** 25 % thumbnails at **S and N** read as the species, not only E/W (hound read as lamb/goat from S/N).
- [ ] Distinct from every finished character's 25 % silhouette (put them side by side).
- [ ] `report.txt`: height in the plan's range, `facing_area_var` < 40 %, `head_frac`.
- [ ] **R** Re-render the turnaround after EVERY shape or placement change (kit lathes/hulls are bbox-centred: `at` is the
      middle of the shape, not its rim — the moss cap sank into the hound).

## Stage 2 — Model + palette

- Shapes from `kit.js` (lathe for hats/hoods/domes, frustum(4) for limbs, chamferBox for head/torso, extrude for capes/
  wings, `K.hull` for faceted or chain parts). Facets ≥ 3 px; no part < 2 px; chamfers only on big masses (striped limbs).
- **R** Chain parts: `K.hull` of points along the link's own direction, never Euler `rot` (stair stripes at N).
- **R** Props in the socket frame; thin props ≥ 3 texels (0.09 m) near the grip or they read dashed over the body.
- Characters use outline flag `'char'` automatically: inner lines only, no silhouette line, no edge highlights.

Checklist (turnaround, then the full pack's scene shots):
- [ ] **R** Signature = one clean region: convex → bands of ONE profile (coincident, no shell 0.01 m proud); concave → ≥ 2
      parts with a ≥ 0.03 m step; trims ≥ 0.05 m; no facet < 0.03 m; `isolated_px` ≤ 2 per facing (`signature: '<slot>'`).
- [ ] **R** Accessory half (plume, feather, ear tuft, antenna) breaks the silhouette upward in ≥ 6/8 facings at 25 % and
      leans ≥ 35° off screen-vertical at dir 1 so it never continues another shape's line (witch hat).
- [ ] **R** Hood half-signature: widest head-level mass (≥ 1.1 × mantle) with a peak ≥ 3 texels or a dark rim band.
- [ ] **R** Sides: midline accessories named without L/R, rooted at |x| ≤ 0.03 m; props under `handR`/`handL` (and their
      chains) listed `'mid'` in `material.sides`; `look=far` turnaround shows magenta only on L/R limbs.
- [ ] **R** Face: `face_lit` ≥ 50 % at noon and your own count at S/SE/SW; a face hollow is an arch ≤ 60 % of the hood
      width with a 1–2 px glint, centred ≥ 3 texels inside the outline at SE/SW. Dark mask under an overhang → look's job,
      don't tilt the hat.
- [ ] **R** Tone counts per facing, by hand until charcheck has the row: hi+mid vs sh px of each signature part and each
      colour-identity accent (ears, plume, beard, belly, beak) on the noon plain turnaround: ≥ 50 % hi/mid in ≥ 6/8, ≥ 2 tones
      on a top-facing dome, ≥ 40 signature px every facing. Fix by tipping faces up / toward the sun or lifting sh (≥ L 0.25).
- [ ] Shadow tones of different slots ≥ 20° hue or ≥ 15 % L apart (charcheck colours/slot over-counts; trust ×4 crops).
- [ ] **R** Bands on a bone that twists against its neighbour ≥ 0.07 m tall (dotted sash in a twisted pose).
- [ ] **R** Accessories that can overlap the signature use another slot (tail tuft drew a line inside the moss cap).
- [ ] `silhouette_line` PASS, `inner_lines` > 0, `edge_highlights` 0, `pure_black_white` 0.
- [ ] **R** Scene crops (`scene-{noon,golden,night}-crop.png`): both copies (sun + pillar shadow) read instantly and the
      signature MEASURED vs lit grass and vs grass shadow (Stage 0 numbers); night main slot sh ≥ `#3A3040`, mauve not navy.
- [ ] **R** Overhangs ≤ torso width + 0.1 m or accept walk/run speck WARNs (wide cowl: 30–50 specks).
- [ ] **R W1** Same-slot child parts (ears, tufts, eye bumps) sink ≥ 0.02 m into the parent hull with a wide base: no
      dotted inner line / isolated px at the junction at any facing (fox, owl, frog: 5–11 px).
- [ ] **R W1** Every bell robe/skirt hem has a robe-shadow sole disc (the die hold shows the hollow interior otherwise);
      boots stay inside the hem radius or connect to it with a dark shin part (mushroom's floating boots).
- [ ] **R W1** Golden sun: two-part signatures keep a VALUE step between the halves (white toque ≈ cream skull in golden);
      measure the LIT sun copy yourself — `sig_ground` golden can pass on a shade colour.

## Stage 3 — Poses and clips

**Author every key pose on the 8-facing still** (`grid=turnaround&clip=<c>&frame=<f>&fx=0`). One facing lies (4/4
characters). Strong poses: lines of action, weight over the planted foot, 25–80° changes.

Per key, on that still — write the result into the sheet's timing chart:
- [ ] **R** Face and signature clear: no prop or limb over the face at S/SE/SW; the signature not crossed by a prop at ANY
      facing — **the carrying side faces the camera at E or W** (keeper r2 moved the clash there); a held blade/staff shows
      ≥ 6 px outside the head box at every facing. At SE a point (x, z) lands at screen x ≈ 0.71·(x + z).
- [ ] **R** Head world pitch (body + spine + chest + neck + head fwd) within −15°…+5° for wide hats/hoods/beards, ±35° for
      quadrupeds, in keys held ≥ 4 frames — in BOTH directions. Recoil/rearing go into spine/chest/pos, counter-nod the head.
- [ ] **R** Consecutive keys differ by ≥ 25–40° on the dominant chain in EVERY clip (talk, vote, die, emote, idle
      extremes, recoveries); follow-through ≥ 40° past contact; anticipation folds the elbow ≥ 60° and coils ≥ 20°.
- [ ] The 25 % thumbnail of the key says what the action is (**R** a signature action changes the silhouette: lantern
      ≥ 0.3 m above the hood peak, wing fully up, paw above the head).
- [ ] **R** A raised limb goes up-and-forward-out (fwd ≈ 125, out ≈ 55), not straight up behind the head (hid at 1/2/6).
- [ ] **R W1 vote (6/8 failed)** On a chibi (≤ 2.5 heads) the bare limb can't clear the head: the vote raises a PROP
      (mug, ledger, lantern, baguette, shovel blade, fanned feather) ≥ 0.3 m above the crown, ≥ 6 px outside the head/hat
      box at 8/8, never crossing the hat at dir 1; wings spread horizontally do not count (owl, moth).
- [ ] **R W1 face at dir 1 (5/8 failed)** Talk/emote keys: total head WORLD pitch ≤ +4° down on chibis; carry beats with head
      roll toward the camera, a `pos.y` bob, jaw, ears; mouth-open keys tip UP. Glances ≤ ±15° yaw so one eye stays visible
      at dir 1; hands/paws on the FAR side of the muzzle; author the punchline on the dir-1 cell first.
- [ ] **R W1** Closed eyes = squash the eye part (`s` y ≈ 0.2) or a 1-texel dark arc; a proud eyelid prism over a cut-out
      iris draws a ring = goggles (owl).
- [ ] **R W1** FX decorating a pose fire 4–6 frames AFTER it and from an outboard socket (|x| ≥ 0.35 m or the prop tip),
      never over the face (skeleton-chef pop masked by poof; mushroom spore scratch across the face).
- [ ] **R W1** Die hold: rims ≥ 0.05 m (edge-on 1-px brim arcs read as antennae), legs bent and low (upright boots = horns),
      body rolled ≈ 30° so the face shows at dir 1, no open hem.
- [ ] **R W1** Story/identity prop visible (≥ 12 px) at 8/8 in EVERY key that carries the story (goat's sheet: 1/8).
- [ ] **R W2 silhouette row (6/7 failed)** Render a key-green 8-facing silhouette row of the idle and every held key
      (`shots/char-mole/mole_g8s.py.js`): the identity prop/part breaks the outline at ≥ 7/8 facings. A fixed sideways
      offset hides at two facings — lift the prop head to shoulder/crown height (far side pops above the head at 30°)
      and twist it ≈ 20° on its handle (mole r2: 7/8); a raised board goes up-and-BACK, yawed 25–30° (honk).
- [ ] **R W2 vote clearance (3/7 still low)** Write prop-top minus crown-top in texels per facing for the vote hold (≥ 8
      at 8/8; toad: 14 at S but 4 at E). Techniques: per-clip prop bone kept at scale 0 by a HIDE spread in every other clip
      (incl. gait keys and `breath()`), `forearm.s` 1.4 for reach, a body prop ridden to the limb tip with `<bone>.p`.
- [ ] **R W2 key-to-key (4/7 failed)** Every talk/emote key differs from the PREVIOUS key by ≥ 25 % silhouette or a big
      part moving ≥ 3 texels at dir 1 and S; no charcheck row measures this. A prop moving behind another prop or the body
      is no motion (snail wrench behind the gear) — swing it in the screen plane on a clear path. A punchline is a pose
      change, never an eye-only change (toad wink = 2 px).
- [ ] **R W2 face keys (6/7 failed)** 8-facing ×8 still of EVERY idle and talk key (not only f0): no goggle glint, no eye
      outside the head contour at E/W/NE/NW, void faces glow ≤ 35 % of the opening at S/SE/SW (bead eyes ON the void front,
      express by y-squint + roll; never scale a bead eye in x). Talk mouth = a ≤ 15° lower lip showing a 2×1 dark floor
      under a snout — a hinged fur chin reads as a beak. Squint at rest → expression goes into a ≥ 30° head cock + a hand.
- [ ] **R W2 die (2/7 failed)** Die reads "down" at 8/8 AND shows the shut-eyed face at S/SE/SW: fall backward with the
      chin tucked; a neck/child FOLLOWS a big body roll and droops to the grass (counter-rotating it on the same axis =
      sitting); lying arms fold over the body (out ≥ 70° = antenna). No `hurt` event in cast die clips (no-hurt rule).
- [ ] **R W2** Contact FX fire from a socket AT the contact point (`hit@clawL`), not the prop tip (spark landed on the ground).
      FX/glyph events sit ON key frames and the key holds until the FX ends (snail star landed on the idle drawing).
- [ ] **R W3 flat things face dir 1 (6/8 failed)** Every flat held thing (vote card, pennant, placard, wing paddle, fin) is
      judged FIRST at SE (dir 1), then E/W: face-on at SE with ≥ 3 texels of area, a slab ≥ 3 texels (≈ 0.09 m) deep so it
      is never a blade at E/W, the stick ending at a visible fist, and the card past the head width. To aim a card: raise
      the arm near vertical (fwd ≈ 165, out ≈ 25) so the stick is the twist axis, then sweep the hand twist with a variant
      spec (clarabelle −38). Glyphs on a card: front/back only (a τ on four cube sides read as skull eyes).
- [ ] **R W3 weapon read (2/8 — scored as a rule break)** Watch every held prop's vote/talk/emote key at 1× at dir 1 and
      write what a stranger would call it: a card on a 1-px dark stick = AXE, a navy wing tip = BATON/club, a 1.95×
      stretched dark arm = twig. Fix: thick handle in a signature colour, square card face-on, broad light face of a wing.
- [ ] **R W3 die (6/8 failed; W2 too)** A body lying straight along one axis foreshortens to "sitting/standing" where the
      camera looks down that axis. Use a CURLED mound (hips roll ≈ −90, spine+chest curl 60°, knees to chest — mincut) or
      a diagonal roll (hips roll 30–80° about Z, root recentred — polly, opal, preservation); then turn the face to SE with
      head `fwd`. Every die key draws LOWER than the previous one (head-top row per facing; clarabelle hopped up 5–6
      texels). Probe 3–4 final poses as keys of a throwaway clip in a variant spec on ONE 8-facing still.
- [ ] **R W3 emote punchline (6/8 failed)** Diff each emote key's 8-facing silhouette against every talk and vote key (opal
      f22 = talk f12) and judge taps/gestures on `fx=0` stills (the spark hid a paw that never moved). The CAMERA-side limb
      does the big action at dir 1 (clarabelle's second action was behind the body at SE); a "step" moves ≥ 0.3 m; a
      gesture with a story prop beats a bare-arm T-pose (mincut scissors).
- [ ] **R W3 talk mouth (5/8)** Mouth opens ≥ 2 texels at S/SE/SW on the open keys. On a chibi pad a scaled mouth plate
      (`'mouth.s'` [0.25, 1.9, 0] — opal) beats a jaw hinge (14–26° shows ≤ 1 texel from above). A modelled-open mouth
      stays on the FRONT face (dark ≤ 0.12 m deep, skin side hulls closing the jaw — progress croc maw). Mouth interior in
      the v1 mouth colour (requin's maroon), not the generic dark slot. Twist the head TOWARD the camera on talk beats
      (judge the sign on the still).
- [ ] **R W3 arm maths** Pose triple order q = qFwd·qOut·qTwist: with `out` > 90 a positive `fwd` tips the raised arm
      BACK (progress, preservation, honk). Chibi arms (≈ 0.32–0.45 m) cannot clear a big head: stretch the upper arm on
      the raise key ≤ 1.6× (`'upperArmR.s'`) and thicken it ≈ 1.2×, divide a child prop's `.s` by the same factor; past
      ≈ 1.9× the arm reads as a stick (mincut).
- [ ] **R W4 point (4/4 failed)** Point aims ALONG the facing (forward + up toward whoever the character faces; at SE the
      target is the viewer), never out to the side (maxflow out 45°, storyteller lantern 55° out). **Camera side: at SE
      (dir 1) and E the near arm is the character's RIGHT; at W and SW the LEFT; S shows both** (lead w4 render,
      `shots/lead-w4/side-*.png`). One arm cannot leave the outline at S, SE, SW AND W on a body wider than the arm:
      use both arms (ball body: theo-rem left `[60, 0, 70]` + right `[85, 0, 30]`, both `.l` 1.3), or twist the chest so the
      pointing shoulder leads + the other paw forward-low (maxflow), or a head/neck lunge + both stubs (greenting). Render
      the point hold at 8 facings, ×3, and write texels-outside-the-outline per facing (≥ 4 at S/SE/SW/W) in the sheet.
      Calibrate the triple first: on a chibi arm fwd 90 + out 45 is a SIDEWAYS raise, not a diagonal.
      **R W5 (2/4 again: sweeper, elder — both sideways at S/SE):** on a wide-robed chibi one arm along the facing points
      AT the viewer and leaves 0 px outside the outline at S/SE (elder r2) — point with the long held prop instead (cane
      forward-UP ≈ 35° above level → outside the outline at 6/8), free hand low and open (two hands on a level stick =
      a rifle). Measure with a silhouette diff of the held key vs idle (`shots/char-npc-elder/el_sil.py.js`).
- [ ] **R W4 talk mouth = a filled plate** Never scale a ring of smile beads (hollow dark U/C, greenting). Bury a dark plate
      in the head at rest and push it out with `'<mouth>.p'` on open keys (0.08 × 0.06 m sunk 0.045 → a 3×2 "o"); smile
      ≈ ¼ of the head width. Talk loop 32–40 frames, keys every 8–10 (6-frame beats read twitchy).
- [ ] **R W4 FX on a moving prop** `poof@<bone>` / `land@<socket>` read the bone's pose on the EVENT frame: fire a poof 2
      frames before the key that hides/returns the prop (maxflow push: poof drew on the belly); `land@` still draws at the
      root (fx backlog) — check the dust position on the 8-facing still.
- [ ] **R W4 die, again (3/4)** The final hold is at least as tipped/low as the drawing before it (theo-rem's final was
      MORE upright = sitting); ball bodies squash wider (`ball.s` y −0.1) to ≤ 60 % of standing height; hips `twist` on a
      body lying on its side does NOT change where it lies (it spins about its long axis) — combine fwd + out
      (`[60, 0, 60]`, greenting); show the shut-eyed face at S/SE (maxflow's S/SE final had no face).
- [ ] **R W4 emote ≠ vote** The emote must not reuse the vote's prop or arm pose (theo-rem's Q.E.D. read as a card-less
      vote). Show the identity prop face-on at chest height on the punchline; twist a far-paw card 40° toward SE.
      **R W5:** … and ≠ ghost (elder's nod reused the ghost's hands-on-crook pose: two clips, one drawing).
- [ ] **R W5 vote prop in a visible raised hand (4/4 failed)** The held vote is judged on the 8-facing still of the HELD
      key (`grid=turnaround&clip=vote&frame=<hold>`, ×4 crop) at S, SE, E and W: sleeve + skin hand visible, the prop's
      grip IN that hand, the prop ≥ 3 texels over the crown and not resting on the head. Recipes that worked (wave 5 r2):
      (a) the prop bone sits AT the hand and the shaft passes through the bone origin (sweeper `BROOM_PIV`) — never slide
      a long prop with `<prop>.p` along the arm (7 texels of air at S); (b) height by LENGTH, not `out`: at E an `out`
      component points the arm at the camera and LOWERS the hand on screen (vendor `[164, 0, 22]` + `'upperArmR.l'` 1.7 /
      `'forearmR.l'` 1.45 cleared the bun 8/8); (c) a hoisted prop's position from the arm FK, verified with
      `mark=@handR` (porter r2); (d) a raised arm always runs along the view ray at ONE facing pair — choose the pair where
      the prop lands BESIDE the head and say so; (e) a prop above the bind hull self-shadows the body: `material.hullMargin`
      ≈ its height over the crown (porter 0.4). `prop_area` undercounts props above the crown (tools T38): judge the raw
      magenta still.
- [ ] **R W5 die (4/4 failed, recurring W2–W5)** Yaw a lying body with hips `out` (±40–90), not `twist` (q = qFwd·qOut·qTwist:
      after hips fwd −78, twist only rolls it about its long axis); a pitched hip (hips fwd 30) reads as kneeling — lie it
      flat on its side (hips [0, 0, 88] + spine/chest curl 20–25, vendor r2). One facing pair stays end-on: put it on
      N/NE (least seen) and write which. A held prop lies ON the ground: verify with a `pitch=4` still (at 30° a prop on
      the far side projects up the screen). Shut eyes = widen AND flatten (`eye.s [0.6, −0.7]` → 3×1 dash; y-squash alone
      leaves a dot that reads open); mouth closed (MOUTH 0) — a slack mouth is a scream "O". Every lying claim cites the
      8-facing still of the final key.
- [ ] **R W5 distinct at 8 facings** `key_delta` / `key_speckle` are measured at the pack facing only: two keys that
      differ only in arm elevation (vendor callout 128° → 150°) passed at SE and read as one drawing at S/E/W. Diff
      consecutive emote/talk keys on the 8-facing stills; the second beat changes the SILHOUETTE (other arm, lean, hop).
      `key_speckle (gN)` names a grid frame: key = gN − idle lead-in (8). Transitional keys with an arm across the coat
      add 4–8 dashed px each — hold the arm off the body.

Clip rules:
- **idle**: loop, `interp: 'step'`, 4 keys, extremes held long (0/30/36/66, length 72), 1 texel of bob (`pos` y 0.028).
  Upper body + `pos` only. **R** A chain riding on the head/hand: keep that bone's world direction constant across idle
  keys (head = −Δ(spine + chest)) so the chain is not re-aimed every breath.
- **Actions** (`interp: 'step'`): anticipation 4–8 → **one** contact frame with `smear` + event → follow-through 4–8 →
  recovery 4–8 → final key = idle's first drawing. ≤ 170° per smear key; lunge `pos` z ≤ 0.1 m.
- **R** Hold of a key under a flash ≥ flash frames + 2 (flash 2 → hold ≥ 4).
- **R** Action semantics: slash plane has a component across the view at every facing; spin blade near horizontal in
  every smear key AND the anticipation; thrust anticipation tip 35–45° below level → contact level; block ≤ 40° from the
  previous key, blade forward of the chest plane, aimed with wrist pitch, no crescent; vertical impacts (thump, stomp,
  slam, a die collapse) are lift → slam + squash + dust, exempt from the roll rule; leap = all feet off, spine level or
  nose-down, hind legs trailing back, front paws land first.
- **R** Held props in walk/run: carry long props ≥ 60° forward of the arm so they never cross the legs at dirs 1/7;
  check the walk strip, not the idle. **R W1 → updated W2** Since module fix M1, LegGait PLAYS authored
  `clips.walk`/`clips.run` for every non-leg bone at the shown drawing (`interp: 'step'`, length = drawings per cycle,
  f0 = left contact; `clip.blend: 'add'` layers on the plan's body). Key the prop arm, ears, tail, staff plant per
  drawing there; the old channel-routing / part-less sink-bone hacks are obsolete (wave-2 notes that call M1 open
  predate the merge — verify on your own 60 Hz strip before working around it). Count prop px in walk drawings at 8
  facings (≥ 12 each).
- **R W1** Long props tilt 25–30° under the gait/acceleration lean (goat); until motion M4: route LegGait
  hips/neck/head to geometry-less bones and `lean: [0, 0]` (costs head lag) or accept and report it.
- **R W4 gait claims** (maxflow, greenting, storyteller; **R W5** elder "hobble", sweeper "broom pushed ahead"): (a)
  short-duty waddles (duty ≤ 0.2, bird style) set `locomotion.swingFloor: 'gait'` (wave-4 module fix; replaces the old
  `maxSwing: 0.5` workaround — the default floor ran maxflow's cycle 0.278 s and skipped drawing k2, motion M23);
  (a2) **a limp / hobble is a keyed `pos` per drawing in `clips.walk`**, never `locomotion.bob`: the LegGait biped bob is
  mirror-symmetric (k0 = k2), elder r1 head_bob 3.9 px / limp 0.1 = a bounce; keyed light contact −0.008, flights 0,
  heavy contact −0.044 + chest +10 → head_bob 2.4, limp 1.6 (target limp ≥ 1.5, bob ≤ 2.5 px); a prop "pushed ahead"
  must cross in front of the feet on the SE walk drawings, or the sheet says what renders; (b) a body roll must be MIRRORED per drawing (key chest/head roll k0 −x, k2 +x in `clips.walk`) and
  small (≤ 5): at SE a LegGait roll on a tall body reads as a forward/back lurch (greenting); (c) a staff "plant" is keyed
  by eye on `grid=turnaround&clip=walk&frame=<k>&speed=<v>` E/W stills — tip AHEAD of the body at contact (the
  plumb-cancel convention still leans it ≈ 17° forward inside LegGait drawings, M25); (d) glide/fast travel drawings
  must differ by more than ±8° (hem flare + flutter, hood streamer, `hips.p` float bob — keyed `pos` does nothing there).
- **walk / run**: tuned at **v_game / 2·v_game** (§Game speed), never at the defaults. **R** Bob ≥ 1 texel (0.014 m
  never shows), run vertical swing ≥ 0.05 m; **R** sway = hips rotation, never `pos.x` (reads as 1.15 texel slide);
  **R** check the gait is actually the clip you edited (Froude: keeper's run silently played the walk; at game speed the
  walk silently plays the run). When chains don't visibly move in the gait, key ears/tail/wings in walk/run (≥ 25° per
  drawing pair).
- **R W1 contact (8/8 read as a glide at 1×)** Legs ≤ 0.25 H under a robe/skirt/coat never show a planted foot
  (`game.foot_slide` n/a at dirs 1 and 2 is NOT a pass). Make contact a visible DRAWING: a boot/talon flick ≥ 3×2 texels
  out of the hem in a contrasting tone on each contact drawing with the trailing boot hidden (it reads as a tail), OR a
  prop plant (staff/shovel tip on the ground one drawing per step; needs M1 or the legacy Gait), OR a true hop whose
  apex drawing is ≥ 4–6 texels above STAND with the boots tucked (frog: flight at standing height = a squat-bob). Write
  the one-word 1× read; "glide" scores ≤ 1 on #8.
- **R W1 → updated W2** The short-leg body drop (M2) and the 60 Hz leg re-pin (M3) are fixed: `locomotion.plant` 'auto'
  picks 'hold' for legs that can't pin a held drawing (sprite-style leg drawings, drop ≤ 0.1·leg, surge off for legs ≤
  0.25 H). Still check dir 2 on `bg=plain` for boot/hem clearance, and set `plant: 'hold'` explicitly on very short legs
  (honk saw 'auto' pick 'pin', possibly pre-merge — backlog M16). Hop plans: `locomotion.legs: { HL, HR }` only.
- **R W2 contact drawing (5/7 failed)** On the contact drawing at dirs 0, 1 AND 2 count visible foot px: each planted
  foot ≥ 2×2 texels, outside the body/skirt; flight drawings keep the feet ≥ 1 texel apart at S (one boot = pogo hop).
  LegGait IK'd feet can go THROUGH a skirt or a squashed body (rabbit, chonk; backlog M12): dressed chibis use ghost leg
  bones as `locomotion.legs` + FK visible legs in `locomotion.squash.bones` (rabbit r3), ball bodies lift off the hips on
  contact (`ball.p`) and take the head drop from the squash (chonk r2); wider `spacing` / lower `lift` (mole r2). A spine
  roll moves a high head in screen y at 3/4: counter it (`chest.p` −0.66·sin(roll)) and measure both contacts' head drop
  (≥ 3 texels each) from the stage log `s.h`. Hanging chains (satchels) stay above the sole line at dir 2.
- **R W3 face steady across gait drawings (3/8)** Sum hips+spine+chest+neck+head pitch per drawing and counter-pitch the
  head so it is equal on contact and flight (progress's grin chattered; it is body pitch, not the jaw). Small face
  details (pupils, lenses) only stay put if the walk `pos` keys are whole screen texels (0.0321 m per texel in y at 30°
  pitch — preservation).
- **R W3 identity chains at game speed (2/8)** A 1-link spring chain lags ≈ 2ζ/(2πf)·v ≈ 0.2–0.3 m at 4 H/s and sits at
  its `limit` behind the body (cilantro's scarf end vanished at 8/8). KEY the chain bone forward in the walk clip (the
  chain targets the keyed pose) and lower `limit`. Long necks: measure the neck in texels at S in every walk drawing
  (≥ 6) — a forward pump points it at the camera.
- **R W3 legs visible (3/8)** Leggy bodies keep ≥ 3 texels of shin in every drawing (cilantro's hem fell on the hooves =
  seated). Hops with `plant: 'hold'` fold the legs in flight by default (swing height = lift + hop): a negative walk
  `lift` (−0.07) straightens them so feet hang 4–6 texels below the body (preservation); bird feet need a 3-toe fan ≥ 3
  texels and a visible shank (polly, honk).
- Cast members keep the default `legIK: 'plant'` (LegGait 'hold' mode skips the per-frame re-pin) and copy
  `character: { quant: { yaw: 8, chain: 4 } }`; the four shipped characters set `legIK: 'pose'`. The legacy Gait needs
  `legIK: 'pose'` ('plant' re-solves every frame there: off_grid 23, flicker 870; legacy traps: backlog M15).
  **R** `quant.chain` is buckets per unit: HIGHER = FINER = more redraws (default 12; small chains 4).
- Check `clip-<c>.png` (holds as planned?), `clip-<c>-60hz.png` (red ticks only on even frames), report: `off_grid` 0
  (specks-only WARN acceptable), `flicker` 0, `single_frame` 0 (grep labels for ` x1`), `foot_slide` ≤ 1, `deterministic`.
  Audit walk/run flicker on the POSE id `p`, not the drawing id `d`.

## Cast clips (every cast member)

| clip | must read as | timing (30 Hz grid) | per body plan |
|---|---|---|---|
| idle | alive but calm; v2 idle was ONE drawing, so keep ≤ 4 drawings, extremes held ≥ 30 frames | loop 72 | ear twitch / wing settle / eye blink as keyed drawings, not springs |
| walk | the game locomotion at v_game, the species' own gait | N = 4–5 drawings × 2 frames | §Game speed feasibility |
| run | Storyteller fast travel at 2·v_game | 4–6 drawings × 2 | same gait, longer flight / more stretch |
| talk | a speaking gesture that LOOPS: mouth/beak opens ≥ 2 texels + a hand/wing/head beat ≥ 25° | 2–4 drawings, a beat every 8–14 frames | biped: open hand; bird: wing-hand + beak; limbless: body squash + eye stalks; quadruped: head bob + mouth |
| vote | raise hand / wing / paw and HOLD; silhouette changes upward | up in ≤ 6 frames (one anticipation dip 2–4), hold to the end | the raised part clears the head at all 8 facings (up-and-forward-out) |
| die | collapse to a final held pose, readable at 1× in ≤ 1 s | anticipation (stagger) 4–6 → fall 1–2 keys → impact squash + dust → settle → held final | ends lying/curled, 25 % thumbnail clearly "down"; head pitch rule does not apply to the final pose but the face must not become a box; no chain jitter in the hold. v1 has ghost sprites (`<id>/ghost`): the dead state may later be a ghost look — note it in the sheet |
| point | the game's shared emote: an arm/wing/paw (or the head on a limbless body) aimed at someone, held | out in ≤ 6 frames, hold ≥ 24, return | aimed ALONG the facing, forward + up (never out to the side); reads at S/SE/SW/W at 25 % (the pointer leaves the outline ≥ 4 texels) — near arm = RIGHT at SE/E, LEFT at W/SW, so use both arms or a chest twist (**R W4 point**); never a level weapon thrust (goose neck = hiss) |
| ghost | dead player: the same character pale and hovering (loop) | loop 72, 4 keys, hover bob on whole texels | `spec.ghost: { hover: 0.14 }` + a plain pose-only loop clip (module draws ramp, halo, float legs — banner above); `keepHue` 0.25–0.35 when colour is the identity; the old ghostK recipe is obsolete |
| ghost-spent | ghost after its one vote: dimmer, greyer, no halo, head bowed | loop 72 | same `spec.ghost`, the clip at ghost level 0.5 (CHARACTERS.md §5) |
| emote | the blurb's signature action; changes the 25 % silhouette | like an action | one per character |
| turn | 45° steps held ≥ 2 grid frames, chains settle ≤ 0.5 s | pseudo clip | |

## Stage 4 — Secondary motion and personality

- `personality` presets from the adjectives (snappy f high ζ ≈ 0.5; heavy f low ζ ≈ 1; springy r > 1; anticipating r < 0;
  r = 0 for anything driven by steps). Chains lag, overshoot, **settle within ≈ 0.5 s**.
- **R** Short accessories: **1-link chains** (multi-link chains redraw 2–3× per key whatever the knobs — backlog).
- **R W1 → updated W2** Accessories riding the HEAD (tufts, antennae, ears): loop clips honour `clip.dynamics` since M5
  but the default is still 'free' — set `dynamics: 'hold'` on idle/talk when chains ride keyed bones (else they re-settle
  inside every hold: rabbit ears, snail stalks 8 → 16 redraws), or key the accessory and counter-key its world direction.
  A 1-link chain pointing UP needs `tip: 'axis'` + `len` (default lever 'down' pushes it the wrong way). Audit the vote/die
  final hold with your own raw diff: `hold_redraws`/`final_hold` miss a pop ON the last key — end one-shots with
  `clip.length` after the last real key, never a duplicate final key (honk: 105 px pop; backlog M13).
- **R W1** FX that outlive a held clip (vote sparkle ≈ 0.8 s, die wisp 1.2 s) FAIL `final_hold`: put `vote@` on the raise
  key itself (honk 0.2 → 0.8 s PASS). Cast die clips have no `hurt` event (no-hurt rule; it flashed 6–8 frames white).
- **R Turn audit** (`--clips turn --raw`): 45° steps 2 grid frames apart, chain swings out and settles in a few drawings;
  the last settle step ≥ 10 px or none.
- **R Hold audit (every action incl. talk/vote/die/emote; raw 60 Hz diffs)**: list redraws and px per authored hold. Holds
  ≥ 6 frames → 0 redraws > 8 px; any settle ≤ 10 px; never ≥ 3 consecutive 1-grid-frame changes outside smear stages.
  charcheck PASSes `1x7` runs and 4 drawings per hold: this is your job. Remedies: key each chain AT its settled direction
  in each action key; keep the parent's world direction constant across consecutive keys; phase FX on the pose's twos or
  end the settle before dust starts. The vote and die final holds are the longest holds in the cast — audit them.
- **R Identify the channel before tuning**: classify each changed raw frame by region and A/B one source off at a time with
  a variant spec (chains / personality / Gait head lag `locomotion.bones.head: '-head'` / recovery steps). Four
  characters tuned the wrong knob first.
- **R Chain first-drawing pop** (backlog, motion): until fixed, make the chain's rigid direction equal its settled one in
  idle and check `deterministic`; report the pop.
- Copy the final dynamics numbers into the design sheet.

## Stage 5 — FX

- `spec.smears` / `spec.fx`; palette ≥ 15 % lighter than lit grass (`['#C4CED0', '#DCE2E2']`); ribbon width
  (length − inner) ≥ 0.10 m.
- **R Smear verdict = one 8-facing still of the contact frame** (no `fx=0`): ≥ 8 texels of connected crescent at every
  facing, no detached px, each facing's light px ≥ 25 % of the best, clear of the signature. Then the 60 Hz strip.
- **R** No linear thrust smear unless fx ships `kind: 'thrust'`; say so in the sheet.
- Spark: light tones only, ≤ 3 grid frames. Dust: motes ≤ 2×2 texels on a small character (or drop step dust). Emote FX
  (speech puff, vote sparkle, death wisp) come from the fx module this round — check `docs/CHARACTERS.md` §5 for what exists.

## Stage 6 — Game-speed pass

Run the two game-speed commands (charpack walk/run at v_game and 2·v_game, dirs 1 and 2, `--raw`; the 1× meadow GIF) and
the 1× GIFs of talk/vote/die/emote. Tick §Game speed acceptance 1–5 and write the numbers (drawings per cycle, contact
drawings, slide at pose frames per foot at dirs 1/2, bob/apex texels, the one-word gait read) into the sheet.

## Stage 7 — SELF-CRITIQUE (mandatory, before you report)

You will be re-scored by a critic who renders everything below independently. Run-04 authors were 3–7 points high every
time. Score like the critic: **when in doubt, score 1**.

**7.1 Collect the evidence** (all of it; put the files in `shots/char-<name>/self/`):
1. Full cast pack with `--raw`; every row of `report.txt` (incl. `face_lit`, `isolated_px`, `single_frame`, `pan`).
2. **1× crops at the pack facing (dir 1)** of the idle and of every action key (no enlargement before you look at the 1×
   version; then ×4 to count px).
3. **8-facing stills of EVERY key of every clip** (talk, vote, die, emote, idle extremes, walk/run contact drawings) and
   of every smear/FX contact frame (Stage 3 + Stage 5 checklists on each).
4. **25 % silhouette line-up vs every other finished character** (theirs from `shots/char-*/turnaround-silhouette.png`):
   name the closest look-alike and the shape that separates you. **R W3** Line up at S, N, SE AND E (polly, mincut never
   ran it; the S/N blob was the failure); skip the members in `pipeline/skip.txt`. Judge the face and every held prop at
   E/W too (preservation scored S/SE only: +3 over the critic).
5. **In-scene crops**: `scene-{noon,golden,night}-crop.png`, sun copy AND pillar-shadow copy, signature colour measured
   vs lit grass (noon + golden) and vs grass shadow; accessory not continuing another shape's line at dir 1.
6. **Per-facing tone counts** of each signature part and colour-identity accent (noon, 8 facings).
7. `look=far` turnaround; `outlineDebug=1` still at dir 1; action keys at ×4 for speckle.
8. **Hold audit, turn audit** from raw diffs; foot slide at pose-id changes at dirs 1 AND 2, all feet.
9. **Game-speed pass** (Stage 6) numbers and the 1× GIFs.
10. **Sheet = code**: dynamics, timing charts, proportions, Unique-to-me answers match the spec. **R W1 (6/8 stale)** After
    EVERY fix round, rewrite Unique-to-me, proportions, palette hex, timing charts, js header comments and the
    self-critique table from the CURRENT code and renders; stale evidence from the previous round cannot support a 2.
    An evidence line you marked "NOT run" caps that criterion at 1 — critics check it (fox, owl, moth were capped).
    **R W5 (4/4 wave 5, 4/4 wave 4)** Every POSE claim in the sheet/self-critique ("flat beside him", "clears the head
    at 7/8", "points forward-up", "two deep nods") cites the 8-facing still of THAT key (`grid=turnaround&clip=<c>&frame=<k>`)
    and every MOTION claim ("hobble", "pushed ahead") cites the 1× GIF frames + a number (`head_bob` limp, prop px per
    walk drawing). A WARN row that names your key (prop_area 0 at E, head_bob limp 0.1) is acted on or explained.
11. **R** Every fix re-verified in the **same render that showed the problem** + the 8-facing still (a fix checked
    elsewhere moves the problem: duelist plume, keeper staff).

**7.2 Write the table** into `characters/<name>.md` §Self-critique:

| # | criterion | score | evidence (file · facing/frame · number) | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | `self/sil-lineup.png`: closest = hound (ears); 8/8 facings both halves; dir-1 scene crops no line continuation | — |

Rules: each score cites ≥ 1 file and a number or a facing-specific observation; "looks fine" is not evidence. A criterion
whose evidence-list item (7.1) you did not run scores ≤ 1. Any facing or frame you did not render cannot support a 2. Fix
every < 2 that is in your files, then re-collect the affected evidence (11). Report the total as `self_score`, and list
your three weakest points honestly in the report (the critic checks whether you knew).

## Stage 8 — Bake, learnings

- Sprite bake: `tools/charpack.sh --bake <name> --preset cast --out shots/char-<name>/bake`
  (no `--cell`: it grows ×1.35 up to 3 times until nothing touches the border); leave it in `shots/char-<name>/bake/` and say so in the report — cast agents do not own `out/sprites/`, the lead copies it (progress, opal);
  look at `<name>-preview.png`. `--cell N` is the square render cell, the printed cell is trimmed (tools/bake.py usage).
  **R W4** Check `bake/<name>.json` `clips.walk.frames` == `spec.gameSpeed.drawings` and read the bake's warnings: since
  the lead's wave-4 fix a short start-up cycle is re-cut from a steady cycle (warning "start-up cycle showed 3/4
  drawings"), but the live game still plays that start — fix the spec (M23 `swingFloor: 'gait'`), don't just accept the warning.
  **R W5 (3/4 bakes were garbage before the lead fix)** Read the printed `render cell N -> trimmed cell WxH anchor [x, y]`:
  the anchor y must sit in the lower part of the cell (y ≥ 0.6·H) and H must be < N; then LOOK at the idle, vote and die
  rows of the preview (the elder/sweeper sheets had the head at the cell bottom and the feet at the top). The runaway is
  fixed (pad cap, lead wave 5); if it recurs, pass `--cell` and file it.
- Add to `docs/CHARACTER_LEARNINGS.md` in the matching TOPIC section (never a per-agent "Additions" section — the
  wave-1 ones were merged by the lead and are archived) (extend an existing bullet and mark it
  **(recurring)** if it is already there): symptom → cause → rule, numbers. Shared-code problems → §Module backlog with
  severity and evidence. Report every command you ran and the render host.

**Critics** follow 7.1 independently (do not reuse the author's numbers), render on render-host, judge the Unique-to-me
answers and the 1× game-speed GIFs, and check that the previous round's issues are fixed in the render that showed them.
A critic also reports the author's self-score gap per criterion.

---

## Body plans (module owners fill these in; authors read the one they use)

Rig r6: every template = `src/chars/rig.js`; `RIG_PLANS[name].build({})` gives it at CAST scale and `planInfo(word)`
maps any plan word (CAST_PORTING / charcheck / LegGait spelling) to `{ rig, check (= spec.bodyPlan), locomotion
(= spec.locomotion.plan) }`. See any template with the real runtime at game speed:
`tools/charpack.sh mannequin --q 'plan=<chibi|upright|longneck|bird|moth|hopper|limbless|blob|quadruped>' --clips idle,walk,run`
(blockout + face; `&popts={...}` passes template options), turnarounds: `_test-rig?char=_plan&plan=<p>&grid=1&face=1`.
Each section: template + where it lives, proportions/targets, gait at game speed (numbers that give 0 slide at v_game),
how talk / vote / die / emote are expressed, known pitfalls. **Owners: replace the `TODO(owner)` lines with verified
numbers and a demo render path; keep the game-speed line.** Until a section is filled, use the stated fallback.

### Biped (humanoid: skeleton-chef, green-hood, storyteller, NPCs, wanderer/duelist/keeper)
- Template: `biped()` + `characters/wanderer.js`. Height 46–52 texels; ≈ 4 heads.
- Game speed: H ≈ 1.4–1.5 → v_game 5.6–6 m/s; scurry with flight (β ≤ 0.34), N 4, step ≈ 0.8 m. Evidence of the
  failure mode: `shots/process/wanderer-gamespeed/` (3 of 6 run drawings shown).
- Game-speed gait (lead r6): set `locomotion.plan: 'biped'` (LegGait, 4 drawings at 4 H/s, legIK 'plant'). The legacy
  Gait (no plan; the four shipped characters) picks the run by Froude and aliases at game speed: `game.readable` FAILs on
  wanderer/keeper/duelist (3 of 6 run drawings, `shots/lead-r6/pack2-*/report.txt`). Upright LegGait at cast scale:
  0.292 s / 1.15 H per cycle (`shots/motion/r5c-upright/`).
- Rig (r6): `biped()`; heightPx 45–62 (charcheck `biped`). The cast's small people (nicksong, NPCs, skeleton-chef) use
  `chibi()` below unless the ref is a 3+-head townsperson. Demo: `char=_plan&plan=biped` in `_test-rig`.

### Upright animal (fox, goat, rabbit-upright, mole, otter, red panda, shark-in-beret, cow)
- Biped skeleton + snout/ears/tail chains. **R** Species read lives in the profile head (snout ≥ 0.20 m on a 1.4 m body,
  slight drop, ears tilted out); check S/N thumbnails.
- Rig (r6): **`chibi({ px })`** = the CAST plan (≈ 24 of 32 members, CAST_PORTING §6): `uprightAnimal` at heads 2.5,
  legs 0.7 (leg 0.25 H), H = `castHeight(v2 px)` (0.04 m/px, ≥ 1.05). `uprightAnimal()` (3.2 heads) for taller animals.
  Bones = biped names (+ `jaw`, `earL0/R0`, `tail0..2` curled chain, `eyeL/R`, `browL/R`, `mouth`); sockets `snout`,
  `mouth`, `hat`, `tailTip` + the biped's. `snout: 0` for flat faces (frog, owl, mushroom, people), `ears/tail: false`.
  meta.gait = 'skip' (duty 0.18) when leg < 0.3 H. spec: `bodyPlan: 'uprightAnimal'`, `locomotion: { plan: 'biped' }`
  (or `planInfo('chibi')`). Starting poses `PLAN_POSES['chibi.vote' | 'chibi.talk' | 'chibi.die' | 'chibi.blink']`.
  No digitigrade leg option (v2 draws none). Verified at game speed with the real Character + LegGait
  (`tools/charpack.sh mannequin --q plan=chibi`): 44 px, head_frac 0.46, game cycle 0.283 s / 1.12 H, holds 2–3
  (`shots/rig/r8/``plan-chibi/`). Game speed (lead r6, current tools): 0.289 s / 1.14 H per cycle, 4/4 drawings shown every
  cycle, holds 2–3, foot_slide n/a (skip gait, stance < 1 drawing) (`shots/lead-r6/plan2-chibi/`). Known: `pan` 1 px on
  13/23 frames and game off_grid/flicker FAIL from the per-frame stance re-pin (tools backlog: mask planted legs).

- **Cast wave 1 on `chibi()` (lead merge, 8 members):** what each used at game speed and what it cost —
  frog `plan: 'hop'` + `legs {HL, HR}` (4/4 drawings, in-hold 0.0; run FAILs off_grid 40); fox/goat/crow/owl/mushroom
  `plan: 'biped'|'bird'` + channel routing (glide read, foot_slide n/a); moth/skeleton-chef legacy Gait chibi recipe
  (authored walk/run play; 7 texels in-hold glide with `legIK: 'pose'`; LegGait would seat them, M2). Every critic
  flagged the 1× gait as a glide or squat-bob: until M1–M3 land, the lever a robed/short-legged cast member has on #8 is
  the visible flick/plant/hop-apex drawing (Stage 3 W1 contact line).
- **Cast wave 2 on `chibi()` (lead merge):** M1–M3 are now fixed (authored walk keys play, 'hold' leg drawings, no seat).
  What still lost points: the default arms (0.9) put the hand at 0.72 m vs a 1.0 m skull top — vote props need `arms`
  ≈ 1.25 / `forearm.s` 1.4 (rabbit); a big round skull puts the face on the silhouette edge at SE — a constant 10–12°
  head twist toward the camera opens it (mole); wide heads (0.67–0.7 m) hide every gesture in front of the face at S/SE —
  go up AND out past the head width (toad); flight drawings must keep both boots visible at S (mole: `spacing` 0.27,
  `lift` 0.03). LegGait `locomotion.style: 'bird'` with `plan: 'biped'` = a waddle on any chibi (toad, 4/4).

### Quadruped (hound; fox/goat/cow if built on all fours)
- Template (rig r6): `quadruped()` — root `body` mid-torso, `rump`/`chest`, neck chain, hind thigh/shin/foot, fore
  upperArm/forearm/hand (motion LegGait 'quadruped' keys), `tail0..`, ears, face. NOT for the cast animals (v2 draws them
  upright). With LegGait at game speed the charcheck still reports 11.6 texels slide (`shots/rig/r8/``plan-quadruped/`): motion/tools.
- Game speed: H ≈ 0.6–0.9 → v_game 2.4–3.6 m/s; bound/gallop β ≈ 0.25; all 4 paws exact at contact drawings at dir 2.
- Head pitch ±35°; leap rules (Stage 3). Game speed (lead r6, `locomotion.plan: 'quadruped'`): 0.292 s / 1.15 H per cycle,
  4/4 drawings, foot_slide over 4 paws n/a (one planted drawing per step); game off_grid/flicker/strobe FAIL because the
  re-pinned thighs sit in the upper half of the box (tools backlog) (`shots/lead-r6/plan2-quadruped/`). The hound (no
  plan, legacy Gait) still slides 3.6–4.4 texels at run/game speed: declare `bodyPlan` + `locomotion.plan`.

### Bird (owl, crow, honk/geese, polly/parrot)
- Wings = sideways chains or keyed parts (`out` + = UP); beak hinge for talk; wing-hand for vote.
- Game speed: short legs cannot step at C ≈ 1.2 H → waddle-skip with a wing flap or short hops; flap drawings carry the
  rhythm. Template (rig r6): `bird()` (honk/chonk; owl/crow/polly are chibis): egg `body`, `chest`, neck chain, head + `jaw`
  (lower beak), WING paddles named upperArm/forearm/hand (`out` 85 = spread, 150–165 = vote), thigh/shin/foot 0.2 H,
  `tail0`, crest; sockets head/beak/wingTipL/R/back/tail/hat. Cast scale H 1.24: game cycle 0.267 s / 1.05 H
  (`shots/rig/r8/``cast-bird/`). LegGait 'bird': 0.267 s / 1.05 H, body slows while a foot is down (`shots/motion/r5c-bird/`).
  FX: `flap@<wing>` (feathers, `fx.feather` = plumage) and `poof@<node>` exist (fx r5).
- **W2 (honk, chonk):** fold the leg INSIDE the egg (hip 0.42 m in the body, thigh forward-down, shank back-down, only the
  lower 60 % of the shank + web visible) → no LegGait seat at 4 H/s; set `locomotion.plant: 'hold'`. Wing paddles folded
  back: `axis: 'back'`, `fwd −` raises, `out` yaws; add twist −90 to show the broad face of a raised wing; fold the
  primaries back along the flank at rest (two prongs at S read as raised arms). A long neck amplifies the roll into a
  head sway (good) — keep headBob ≈ 8° (14° read as pecking). Long-neck die: the neck LIES on the grass. Ball bodies
  (chonk) have no squash path on LegGait 'bird' yet (backlog M9): legacy Gait + `ball.p` offsets.

### Hopper (frog, toad, rabbit)
- ONE hop per cycle (C ≈ 1.2 H, apex ≥ 4 texels): crouch (hold) → launch (1 key) → airborne stretch → land squash. The
  contact is a deliberate key, the slide check is "lands where the hop says".
- Template (rig r6): `hopper()` — sitting body, Z-folded hind thigh/shin/foot + fore legs (LegGait 'hop': all feet
  together), jaw, optional ears (rabbit) / tail. Cast scale H 1.0: game cycle 0.292 s / 1.15 H, hop visible
  (`shots/rig/r8/``cast-hopper/`). LegGait 'hop': 0.292 s / 1.15 H, all feet together (`shots/motion/r5c-hopper/`).
- **W2 (rabbit, toad):** a dressed hopper's IK'd boots go THROUGH the skirt in every hop drawing (`lift < 0` only moves
  them; backlog M12). Rabbit r3: ghost leg bones as `locomotion.legs`, visible legs FK, thighs in `squash.bones`,
  `locomotion.height` tuned so the −0.06·height crouch equals the leg shortening (crouch knob missing: M11). Also key a
  visible crouch (hem down 1–2 texels, torso pitched forward) and a take-off stretch drawing — a rigid bobbing block is
  not a hop. Toad-type heads: two eye bumps ≥ 2 texels above the crown at S, else "mushroom cap".

### Limbless (snail, greenting, mushroom if footless)
- No feet → no slide, but a squash-stretch cycle phased to distance (one squash per C); shell/cap as the signature.
  Talk = body squash + eye stalks/cap tilt; vote = an eye stalk / cap / tendril up; die = melt/curl to a held blob.
- Template (rig r6): `limbless()` — `base` root anchor, `body` = the SQUASH bone (`squashPose(S, a, { riders: ['shell'] })`
  keeps the shell rigid), sole links `front/back`, `neck`/`head` column, `stalkL0/R0..`, `shell`; `kind: 'blob'` = body +
  wobble `top` with the face + `nub*`. Cast scale H 1.05 (`shots/rig/r8/``cast-limbless/`): the LegGait squash pulse is only
  1–2 texels at the default 0.12 — raise `locomotion.squash.amount` to ≥ 0.2. LegGait 'glide' (lead r6, current tools): 0.300 s / 1.18 H, 4/4 drawings
  (`shots/lead-r6/plan2-limbless/`).
- **W2 (snail):** 4/4 pose ids ≠ 4 drawings: the glide pulse makes drawings 1 and 3 identical (backlog M14; the critic saw
  1 distinct of 4). Now that LegGait plays authored walks (M1), key the column/stalks per drawing in `clips.walk`; snail r6
  used the legacy Gait + part-less hidden legs instead. Shell: a superellipse "ball" lathe ≈ 1.9× the column width at S
  (a wheel lathe shows slivers; 0.6 m wide = barrel at 3/4). Squashing several bones at once gives wrong rider offsets (M10).

### Flier (moth)
- Hover bob ≥ 1 texel, wing flaps 2–3 drawings per 0.27–0.33 s; travel at v_game with a lean; shadow on the ground marks
  the position. Template (rig r6): `RIG_PLANS.moth` = `bird({ hover, insectWings, antennae })` (wingL0/R0 + wingL1/R1, `out`
  + = UP). The v2 moth WALKS: build it as `chibi()` + folded wing parts and keep hover for an emote. LegGait 'fly' (lead r6): 0.267 s / 1.05 H, 4/4 flap drawings,
  foot_slide n/a (`shots/lead-r6/plan3-moth/`).

### Long-neck (giraffe)
- Neck chain keyed per drawing (not sprung) at game speed; head stays in frame of the cell (`--cell`). Template (rig r6):
  `longNeck({ base: 'upright', neckN: 3 })` (cilantro is upright; `base: 'quadruped'` exists): neck, neck1, neck2 between
  chest and head, `PLAN_POSES['neck.tall' | 'neck.graze']`; cast scale H 1.52 → 52 px, game cycle 0.267 s / 1.05 H
  (`shots/rig/r8/``cast-longneck/`). LegGait at cast scale: 0.267 s / 1.05 H (`shots/motion/r5c-longneck/`); charcheck
  flags the stance surge as upper flicker until it aligns crops by the logged root (tools backlog).

---

## Rubric (0 = fails, 1 = partly, 2 = meets). Ship bar ≥ 19/24, no zeros on 1–3 or 7.

| # | criterion | how to check | 2 = |
|---|---|---|---|
| 1 | **Silhouette** | `turnaround-silhouette.png` (1× and 25 %), 25 % line-up vs every finished character, scene crops at dir 1 | recognisable as the brief/v1 sprite from all 8 facings (S/N too), BOTH halves of a two-part signature in ≥ 6/8; no accessory continuing another shape's line at dir 1; distinct from every other character |
| 2 | **Pixel stability** | `idle` off_grid/flicker 0; walk/run 60 Hz strips; `deterministic`; first-frame chain pop | static pose = 0 changed px; between grid frames only the root glides (≤ 8 px self-shadow specks); nothing flickers/vanishes between facings |
| 3 | **Line quality** | 1× crops, `silhouette_line`, `inner_lines`, `edge_highlights` | 1-px inner lines where parts overlap; no line against the world; no speckle; no dashed thin props |
| 4 | **Tonal discipline** | ×4 crops, `isolated_px` (idle + action keys), `look=far`, per-facing tone counts | ≤ 3 tones per slot + inner line; ≤ 2 speckle px on the signature; nothing flips value with facing; signature ≥ 50 % hi/mid in ≥ 6/8 at noon; warm hi / cool sh; no black/white |
| 5 | **Ground separation** | `scene-{noon,golden,night}-crop.png`, sun + pillar shadow, signature measured | reads instantly in all six; signature ≥ 30° hue or ≥ 25 % L off lit grass (noon + golden), still the lightest mass in shade |
| 6 | **Proportion, appeal, expression** | turnaround + sheet + `face_lit` + talk/vote/die keys at 1× | chunky readable shapes; face lit (≥ 50 % skin hi/mid at S/SE/SW) and never covered; reads as the species at S/N; expressions (mouth/beak/eyes) change visibly (≥ 2 texels) and read at 1× |
| 7 | **Animation timing** | `clip-*.png` holds, 60 Hz strips, `single_frame`, 8-facing key stills, hold audit | stepped on the 30 Hz grid; no x1 holds; ≤ 2 consecutive 1-frame changes outside smears; holds ≥ 6 frames have 0 redraws > 8 px; keys differ ≥ 25–40° in every clip; each key readable at all 8 facings; talk/vote/die/emote read in 1× real-time GIFs |
| 8 | **Weight, contact, game speed** | walk/run at v_game and 2·v_game, dirs 1 and 2, pose-frame slide over all feet, 1× meadow GIF | all N drawings show every cycle; contact visible (≥ 2 drawings or a deliberate hop/glide key); stance ≤ 1 texel at pose frames at dirs 1 and 2; bob ≥ 1 texel; the gait is nameable in one word at 1× and is the species' own |
| 9 | **Personality, secondary, uniqueness** | `clip-turn.png`, turn audit, sheet = code, Unique-to-me answers vs renders | chains lag/overshoot/settle ≤ 0.5 s, last step ≥ 10 px or none; the character's extra parts animate as planned and carry rhythm; in character with the adjectives; no jelly |
| 10 | **Smears and FX** | 8-facing still of each contact frame, 60 Hz strips, `clip-hurt/die.png` | intended read; ≥ 8 texels of connected crescent at every facing, clear of the signature, ≥ 15 % lighter than lit grass; stepped stages; light sparks; emote FX quantized |
| 11 | **Facing and turns** | turnaround, `clip-turn.png` | all 8 facings read; turns are 45° steps held ≥ 2 grid frames |
| 12 | **Technical** | `report.txt`, shot log GPU line | no page errors; deterministic; 1 draw call per character per pass (+ shadow); programs stable; rendered on render-host |
