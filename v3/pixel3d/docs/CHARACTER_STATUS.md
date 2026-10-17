# Character pipeline — status / restart notes (updated 2026-10-16, lead integration r6)

## Where things stand
- **Docs:** `docs/CHARACTERS.md` (contract/APIs, updated to the r6 code), `docs/CHARACTER_PLAYBOOK.md` (procedure,
  game speed, body plans with verified numbers, rubric), `docs/CAST_PORTING.md` (32-member cast, refs owner),
  `docs/CHARACTER_TECHNIQUES.md`, `docs/CHARACTER_LEARNINGS.md` (append-only; module backlog at the end), `docs/AMBIENT.md`.
- **Modules (round 5/6 upgrades integrated):** rig body-plan templates (`chibi`, `uprightAnimal`, `quadruped`, `longNeck`,
  `bird`, `hopper`, `limbless`, `planInfo`), motion LegGait plans + `clip.hold` + action holds + `legIK 'plant'`, look
  lift/props/shadowSnap/hints, smear tilt/thrust/claw, fx cast emotes, tools game-speed + cast preset + body-plan targets.
  `tools/remote.sh node tools/charexports.mjs` → `dups []`.
- **Shipped characters:** wanderer, keeper, hound, duelist. Latest packs: `shots/lead-r6/pack2-<name>/` (render host
  render-host). Compared with `shots/char-*` and `shots/critic-*-r2`: run-04 bugs gone (keeper lantern pop at clip start,
  hold-settle redraws: hold_redraws 0 in every action, deterministic + action.deterministic 0 px, wanderer walk/run
  flicker 25/42 → 0). Remaining FAILs: `game.readable` (legacy Gait aliases at game speed) on all four, keeper
  thump.strobe 3, hound game/run foot_slide 3.6/4.4 (no `bodyPlan`/`locomotion.plan` declared).
- **Next:** author the Clocktower cast per `docs/CAST_PORTING.md` with `--preset cast`; open module issues are in the
  backlog table of `CHARACTER_LEARNINGS.md` and the lead r6 report.

## Restarting after an interruption (usage limit, crash)
Workflow agents write everything to disk as they go (`src/chars/*`, `shots/<owner>/…`, their scratchpad folders), so a
stopped run loses nothing already saved. Re-launch the same workflow; each agent is told to look at its own files and
renders first and continue from them rather than start over (rounds 5/6 of rig, motion and tools were resumed this way
after the 2026-10-15 23:36 limit). Nothing in this side project is committed to git.
