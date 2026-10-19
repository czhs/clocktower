# Progress

_Last updated: 2026-10-15 (lead)_

## Environment facts (verified 2026-10-14)

- Editing machine: Mac (this Claude Code session). **No code is executed here**; per user
  instruction everything runs on the host; other machines are not used.
- The host: Ubuntu 22.04, x86_64, systemd, Tailscale for private SSH, SSH key auth OK as the admin
  user, no passwordless sudo, user lingering off, ports 3000/3001 free (details in private notes).
- Installed in user space on <host>: Node v24.22.0 (`~/.local/share/node`), pnpm 10.34.7.
- Funnel: not configured; node capabilities list `https` but no funnel attribute yet.

## Task graph (acceptance-driven)

```
M0 contracts+skeleton ─┬─▶ R1 rules engine core ─▶ R2 22 roles ─▶ R3 ST GameController ─┐
                       ├─▶ A1 db+accounts ─▶ A2 directory+SSE ─▶ A3 GameRoom lifecycle ──┼─▶ M1 slice ─▶ M3 round ─▶ M4 full rules
                       ├─▶ W1 layout+assets gen ─▶ W2 WorldModule ─▶ W3 Phaser town ─────┤
                       ├─▶ V1 acoustic graph ─▶ V2 grants/revoke ─▶ V3 client voice ─────┴─▶ M2 voice
                       └─▶ Q1 harness ─▶ Q2 dev service ─▶ Q3 prod+Funnel ─▶ Q4 load/security ─▶ M5
```

| Id | Task | Owner | Status |
|---|---|---|---|
| M0 | Monorepo, protocol, module interfaces, docs, remote exec | lead | ✅ done |
| A1-A4 | SQLite/Drizzle, passphrase accounts, sessions, directory+SSE+tickets, GameRoom lifecycle, lobby/auth/admin/chat UI | lobby-auth | ✅ done (86 tests) |
| R1-R4 | Rules engine (22 roles, setup 5–15, night orders, interactions), GameModule, HUD + Storyteller panel | rules-storyteller | ✅ done (89 tests incl. secrecy) |
| V1-V4 | Acoustic zones + hysteresis, LiveKit grants/revocation/re-join sweep/quota, client voice panel | voice | ✅ code done (55 tests); ⛔ untested against real LiveKit (no credentials) |
| Q1-Q4 | Harness, integration/security/e2e/load tests, dev+prod systemd user services, deploy+rollback | qa-deploy | ✅ done (64 tests + 5 e2e); load numbers pending real world module |
| Q5 | Public ingress: Cloudflare Tunnel https://clocktower.chrisshi.com → <host>:3000 | lead | ✅ live, verified with 2 external Chromium browsers (HTTPS+WSS) |
| W1-W4 | Handcrafted town, PNG generator, WorldModule, Phaser town/cosmetics/ghosts | world-art | ✅ done (18 world tests; 2-browser render check) |
| M3 | Playable ST-guided round end-to-end in browser | lead | ⏳ after world-art |
| M5 | Prod release with Funnel; external + mobile test; load test with real movement + voice | lead/qa | ⏳ |

## Blocked / needs user

1. ~~enable-linger~~ ✅ done by user (Linger=yes). 2. ~~tailscale operator~~ ✅ done (OperatorUser=<admin>).
3. Funnel: `tailscale funnel --bg 3000` reports the host is not in the tailnet policy's funnel nodeAttr — a tailnet admin must approve (link printed by the CLI) or add the node to the policy.
4. LiveKit Cloud free project + API key/secret (to be placed in `~/clocktower/env/*.env` on the host).

## Next

Spawn teammates; integrate M1 vertical slice (auth → two lobbies → movement → voice → night visit).

## Phase: game-night readiness review (started 2026-10-15)

User asked for an adversarial pre-game-night review (rules interactions, town/night leaks, voice
fragility, multiplayer races, prod reliability, usability, visual polish), verified with real
browsers and the public endpoint, distinguishing simulated voice (fake devices) from real-mic tests.

| Teammate | Focus | Ownership this phase |
|---|---|---|
| playtest | full scripted games 5/7/10/15 via real server; voting/refresh/duplicate-tab/ST-recovery/rematch/malicious-client; fixes | packages/rules src, apps/server/src/{game,rooms (not modules.ts),auth,directory,admin}, ui/hud, ui/storyteller |
| rules-audit | adversarial TB interaction tests + docs/rules-audit.md (bugs routed to playtest) | packages/rules/test/audit-*.test.ts, docs/rules-audit.md |
| world-audit | walkability, houses, night edge cases, night-information leak channels | apps/server/src/world, layout.ts, packages/assets/test, docs/world-audit.md |
| voice2 | real LiveKit in browsers: speaking bug, 10–15 talkers, boundary flicker, walls, transitions, reconnects, cross-browser, modified-client access | voice packages/dirs, tests/e2e/voice-*.spec.ts |
| ux | first-run onboarding, help, house finding, errors, restart flows, mobile, polish | ui/{auth,lobby,admin,chat,common}, GameScreen.tsx, game.css, CosmeticPreview, index.html, tests/e2e/ux-*.spec.ts |
| assets | Codex `gpt-6-astra` remaster of existing art as drop-in replacements; RoleIcon; name plates; no ST light leaks | packages/assets (not layout.ts/test), TownScene/sprites/TownGame/audio, public/, ui/common/RoleIcon.tsx |
| qa-deploy | 6-browser M3 round, load, soak/leaks, crash/restart, network adversity, adversarial WS, finder accuracy, logs, isolation, public endpoint | tests/**, scripts/**, deploy/** (not tunnel/set-livekit), docs/deployment.md, docs/test-results.md |

Public ingress is the Cloudflare Tunnel (https://clocktower.chrisshi.com), not Funnel.

## 2026-10-15 — core gameplay finalized (commit 16042fe, live on prod)

Complete games run end to end through the real browser UI (1 ST + 5 players, twice) and survive the
chaos suite. Art/town overhaul is proceeding in a separate session (see docs/art-integration-notes.md
for the hooks it must carry over). Open (low): slow first load / no loading indicator on weak
machines; rematch waiting room list below the fold at 720×450; dead-Imp HUD chip noise in reveal;
real-microphone, real-Safari/iOS and 10–15-person tests need humans.

## v2 (2026-10-15)
One-screen Town-of-Salem-style town in the v1 procedural pixel style (Opus art fleet: 26-character
8-direction roster + ghosts, 15 hand-designed houses, terrain/interiors, ambient FX), automatic doors,
tap-to-go, house interiors as private voice rooms, square = one voice room, camera framing the square,
Storyteller stage-script panel + click-to-teleport, pointing + character pins, private notebooks,
full game records with play-by-play, Story/pamphlets, admin console. Release notes: docs/RELEASE-v2.md.
The pre-pivot art-overhaul WIP is preserved on branch `wip/art-overhaul`.

## Roadmap (user, 2026-10-15)

1. **v2.2** — perf WP1–WP7 + features (chat bubbles, talking outline, audio devices, mouse push-to-talk,
   nicksong, right-drag pie menu, walkable interiors, account stats, word lobby ids, door-board tokens +
   house name callouts, preset storylines + Storyteller prep in the waiting room, link previews, QoL).
   Release: commit on branch `work/v2.2-v2.3` → dev → e2e gate → prod (no game running).
2. **v2.3** — security hardening (audits in `docs/security-v2.3/`, fixes, `docs/security-v2.3.md`).
   Fixes are **deployed before they are pushed** (the repo is public and `/healthz` shows the commit).
3. **v2.4** — a fresh performance sweep after v2.3: re-run the WP7 budgets (`scripts/perf/budgets.mjs`)
   and the full measurement set in `docs/perf-plan-v2.2.md` §5 against the v2.2 baseline
   (`tests/perf/results/2026-10-15-v2.2.json`), profile the new v2.2/v2.3 features (bubbles, talking
   outline, interiors, pie menu, board tokens, voice reconciler, connection budgets), and pick up the
   v2.2 leftovers: HUD DOM churn while walking (12–18 mutations/s vs target ≤ 5), entry CSS (22 KiB br vs
   ≤ 15), cast-sheet GPU memory (16.4 MiB vs ≤ 8), LiveKit downlink cap for big rooms ("N loudest").

## v2.2 status (2026-10-15, lead) — current state for the next agent

- **Branch:** all work is on the LOCAL branch `work/v2.2-v2.3` (GitHub `main` has moved and has an
  open external PR; never pull/fetch/merge from GitHub). Pushed as a branch, not to `main`.
- **Prod:** hotfix `8fbad32` (= 766a8bd v2.1-pre + own-avatar fix, branch `hotfix/v2.0.1`).
  v2.2 goes to dev first, then prod when no game is running.
- **Shipped in v2.2:** see docs/RELEASE-v2.md "v2.2.0" (perf WP1–WP7 in docs/perf-v2.2-results.md).
- **v2.2.1 (2026-10-16, merge staged):** GitHub `main` (Isaac's PR #2 + #3) merged into this branch
  for one unified history: brianbi + HD cast pipeline, NPC avoidance, chat private in every phase,
  movement-seq/door fixes, Docker/local preview. Duplicates kept from v2.2 (bubbles, walkable
  interiors, door-board tokens). See docs/RELEASE-v2.md "v2.2.1" and the architecture change log.
- **v2.3 security audit (done, fixes NOT started):** findings live only in the local, git-excluded
  `docs/security-v2.3/` (+ 9 local `tests/security/*` files, `.github/`, `SECURITY.md`, see
  `.git/info/exclude`). They describe unfixed vulnerabilities: do not commit or push them until the
  v2.3 fixes are deployed. Next step = phase B: resume each area's fixes (ids REPO-/HOST-/AUTH-/SEC-/
  WEB-/VOICE-/OPS-), deploy, then publish `docs/security-v2.3.md`.
- **Known open items:** `tests/security/ops-restore-drill.test.ts` fails in the merged tree (server
  restart sequence in the test harness; the server itself starts fine) — v2.3/ops; the docked
  Storyteller panel can cover the leftmost cottage at 1200×760 (ST must move the panel); the restored
  lobby-finder doesn't show an automatic game's storyline yet; real-hardware checks pending (AirPods,
  mouse side buttons, LiveKit talking outline).
- **Waiting on the user** (do not do these yourself): GitHub settings (`isaac9000` = Isaac, the user's friend and a trusted co-developer with write
  access — keep him; still security-review his PRs before merging/running them; no branch protection, secret scanning / push protection / private vuln reporting /
  Dependabot off; PR #1 unreviewed); copy `/srv/clocktower/env/prod.env` into a password manager
  (the passphrase pepper is not backed up); LiveKit billing / spend cap; Cloudflare dashboard rules
  (WAF, auth rate limit, cache rules, Browser Cache TTL); sudo items (separate service users, egress
  firewall, LimitCORE=0, journald limits, build user, admin group review, prod `CPUWeight`);
  history rewrite (recommended: no).
- **Host etiquette:** The host is also prod. All agent commands go through `scripts/remote.sh`
  (capped `ctwork.slice`: 6 cores / 7 GiB, nice 19); browsers only under `~/clocktower/browser.lock`.

## v2.3 status (2026-10-16, lead) — current state for the next agent

- **Live:** prod and dev run v2.3 (`689b3f6` = v2.3 `fd73c81` + the `/v3-art-demo/` DEMOS_DIR route
  ported from another session's `deploy/v3-art-demo`). Branch `work/v2.2-v2.3`; GitHub `main` is
  unified with Isaac's work (merge `54e2581`).
- **What shipped:** docs/RELEASE-v2.md "v2.3.0"; public security summary docs/security-v2.3.md; gate in
  docs/test-results.md. Per-area audit notes (with host specifics and the admin run-books) are kept
  LOCAL on the maintainer's machine in `docs/security-v2.3/` (git-excluded) — ask the maintainer.
- **Owner actions still open (sudo / dashboards — never do these yourself):** run the host isolation
  installer (`deploy/secure/v2.3/apply.sh`, dry run first, then `--apply`, then
  `scripts/verify-sandbox.sh`) and the ops installer (`deploy/secure/v2.3/ops/apply.sh`); GitHub
  settings (secret scanning, push protection, private vulnerability reporting, Dependabot, a ruleset
  on main that still lets the owner and Isaac push); Cloudflare (WAF, auth rate limit, cache rules,
  Browser Cache TTL "Respect existing headers"); LiveKit spend cap if a card is on file; env-file
  escrow (done by the owner 2026-10-16) and an optional off-host backup.
- **Known flake:** game-full once timed out clicking the ST "Grimoire" tab on the visit-from-Grimoire
  path (not reproduced on re-run).
- **Several Claude sessions deploy to this host.** Always base prod deploys on the newest release
  branch (`work/v2.2-v2.3` or later) and check `git log` / the releases dir before deploying.
- **Next:** v2.4 = performance sweep — done, see "v2.4 status" below.

## v2.4 status (2026-10-16, lead) — current state for the next agent

- **What shipped:** docs/RELEASE-v2.md "v2.4.0" (performance only). Plan: docs/perf-plan-v2.4.md;
  measurements and before/after tables: docs/perf-v2.2-results.md "v2.4 — P1 / P2 / P3"; budgets
  tightened in `scripts/perf/budgets.mjs` (server CPU now measured with `--cpuprof no`; entry CSS sums
  `index-base-*` + `index-*`). Gate: docs/test-results.md "v2.4 release gate".
- **How the perf tests work now:** `tests/perf/client-perf.ts` teleports the browser player to an
  open outdoor spot before each walk window and fails if the path is < 100 px or ends indoors (the v2.3
  windows had walked into a cottage). Never compare `serverCpuPct` from a first run in a fresh sandbox
  (cold tsx cache) or with the profiler on.
- **Open items (owner):**
  - voice: wire `apps/client/src/voice/talkerCap.ts` (decode only the N loudest talkers) into the
    engine after a human test with real LiveKit (does `isSpeaking` keep updating while unsubscribed?
    how much of the first words is lost on resubscribe? phone CPU with 10 talkers).
  - world-art: `TownScene.drawTownClock` still earcuts one 100-point wedge per frame while a timer
    runs (small); check the low render tier's automatic 30 fps drop on GPU-less desktops (39–49 fps).
  - qa-deploy: hd-cast e2e flakes when a bot is randomly dealt brianbi (~4/28); the `fps` probe counts
    browser frames, not Phaser renders.
  - The Vite preload-helper patch (`apps/client/build/cssOrder.ts`) is tied to Vite 7.3; on a Vite
    upgrade the build fails loudly until it is updated.

## v3 status (2026-10-18, branch `v3-game`) — the pixel3d / three.js town in the real game

Contract: `docs/v3/INTEGRATION.md` (§8 Status table, §10 "How to continue", §11 decision log). v3 is opt-in per lobby
(`world: 'v2' | 'v3'`, fixed at creation); v2 "Classic" stays the default and is unchanged. Nothing v3 is deployed. (Superseded: since WP8 `/` = v3 and `/v2/` =
v2; v3.0 is on the dev service, see "v3 handoff" below.)

- **Works (C0, WP0 Foundation):** three@0.170.0 pinned to the vendor; Vite/vitest resolve `three`, `@pixel3d/`,
  `@v3assets/` and patch the vendor imports at build time (`apps/client/build/pixel3dImports.ts`, fails loudly on
  drift); lazy `town3d` chunk (222 KiB br, budget 230; entry +0.2, lobby +1.9 KiB br). `apps/client/src/game3d/`
  has the renderer selector, boot guard, perf sampler, coords/projection and a stub 3D town (Hollowmere at noon,
  own `wanderer` avatar with prediction, doors, `__ctCamera`), with in-place fallback to Classic on error.
  Movement/door/input rules extracted to `apps/client/src/game/rules/`; `currentLayout()` (`net/layout.ts`) replaces
  direct `townLayout` imports; protocol has `world`, `doorNormal`, dais stones. Server refuses `world: 'v3'` (409)
  until the v3 layout exists.
- **Gate C0:** typecheck, build, full `pnpm test` (126 files / 1393 tests pass, 3 skipped), C0 mount/destroy smoke
  (`scripts/v3/smoke-mount.mjs`, SwiftShader) all pass.
- **Works (C0b, committed 2026-10-17):** WP0s split the gameplay and social layers into Phaser-free logic
  (`game/gameplay/core.ts`, `game/social/controller.ts`, unit-tested with Phaser/three mocked to throw) plus thin
  Phaser views; Classic behaviour unchanged, `TownScene.ts` untouched. WP5a exported Hollowmere into
  `@ct/assets/hollowmere` (`townLayoutV3`, `townMapV3`, `npcHomesV3`, `PROP_DEFS_V3`, `layoutFor`; deterministic
  `scripts/v3/export-hollowmere.mjs --check`); the server now creates `world: 'v3'` lobbies with the Hollowmere
  layout and the client loads it lazily (`layoutV3` chunk 5.65 KiB br); `sound/areas.ts` surfaces follow the world.
- **Gate C0b:** typecheck, build, full `pnpm test` (131 files / 1506 tests pass, 1 file / 3 tests skipped) on the host.
- **Works (C1a checkpoint, committed 2026-10-18):** every phase-1 package is authored, reviewed, fixed and tested
  in its own files: WP1 3D core (net / input / camera / lifecycle / debug), WP2 avatars (rigs, billboards, ghosts,
  talking rim, lanterns, townsfolk), WP3 stage (town, interiors, time of day, dais, doors, canopy fade, tower-clock
  hook), WP4 overlay (labels, DOM chat bubbles, pins / emotes / pie, boards), WP5b Classic 2D in a v3 world (all 15
  cottages enterable, phone shots for Q7), WP6 UI (v3 skin, Graphics setting, Town choice + world badges, Classic
  pre-selected). Plus lead decisions D1-D4 (canopy fade, DOM bubbles, touch pie-edge fix, `E2E_PORT`), the WP7a
  mock-world harness + v3 e2e specs (`E2E_V3=1`, `scripts/v3/e2e.sh`) and the v3 perf recon tooling (`docs/perf-v3/`).
- **Gate C1a:** typecheck, build, full `pnpm test` on the host (numbers in `docs/test-results.md`). The user's
  acceptance "town choice from the UI" + "each lobby renders the right town" passes (`v3-lobby-choice`).
- **C1 (2026-10-18, integrator, not yet committed):** WP1 / WP2 / WP4 are wired into `game3d/TownGame3d.ts` (one
  net/input/camera core per mount + the lifecycle: context-loss rebuild then Classic; avatars with prediction, remote
  players, ghosts, lanterns, talking rims; overlay labels / DOM bubbles / pins / boards / house names / seat markers /
  hints; `__ctCamera` / `__ctSocial`), and the four pixel3d user requests are wired on the game side: the
  voting-circle camera (computed frame, ±45° yaw, 23° pitch, stepped in and out), the clock tower dials as the
  Storyteller timer (readout = the HUD clock chip), no NPCs in the circle, the enterable clock tower room. Also: join
  preview + one v3 skin per connection (LobbyRoute), `publishRender` + a fresh-URL chunk retry (GameScreen), the tower
  is never "Nobody lives here", and a dispose leak (~135 MB of town per mount kept by the vendor Engine's window
  listener) is fixed. Details and test results: INTEGRATION.md §8 Status, §9.1, §11 "C1".
- **Open issues:** `v3-fallback` "chunk fails": the one chunk retry in `GameScreen.importTown3d` never re-requests the
  chunk (INTEGRATION.md §9.3, lead); WP6's Graphics status line and join preview wait on lead / world-art wiring
  (`publishRender`, `useV3Skin` in `InLobby`, `JoiningLobby`); art checks pending (billboard talking rim washed out,
  WP3 soft-layer fade behind thatched cottages, WP4 bubble details); pixel3d-side requests are collected in
  INTEGRATION.md §9.2.

### v3 handoff (2026-10-18 night, after the v3.5 release — PROJECT PAUSED BY THE USER; RESUME FROM HERE ALONE)

The user paused the project after v3.5. This entry is written so a fresh session can resume from it without any
other context. Read, in order: CLAUDE.md (rules, ownership, where things run), the gitignored CLAUDE.local.md (host /
laptop access), docs/HANDOFF.md, this entry, docs/RELEASE-v3.md (top = v3.5), docs/v3/INTEGRATION.md (§8 status, §9.2
vendor asks, §10 how to continue, §11 decisions).

**What is live**
- **PROD = v3.5 (`a722b44`, tag `v3.5`) since 2026-10-18 21:28 PDT** (dev + 6-bot host-GPU smoke with sprites forced on, 0 page / console errors; no prod game in the 30 min before; manual backup; public `/`, `/v2/`, `/v3-art-demo/` 200; journals clean; docs/test-results.md "v3.5 deploy"); GitHub `main` = `v3-game` = that commit (+ the deploy-record
  commit). `/` = the v3 3D town (pixel3d / three.js), `/v2/` = v2 Classic, `/v3-art-demo/` = the pixel3d Hollowmere demo
  (prod keeps commit `deploy/v3-art-demo` f1bad49's demo files in every deploy). Dev service (port 3001) = the same build.
  Rollback: `scripts/deploy-hshi-u1.sh prod 7f54da0` (v3.4). Release notes v3.0-v3.5: docs/RELEASE-v3.md; gates and
  deploys: docs/test-results.md.
- v3.5 contents: `v35-shaders` merged (parallel shader issue `ct.debug.v3par`, cut-away GLSL rewrite
  `ct.debug.v3cutloop` (default ON: look proven), shader-source record + prewarm `ct.debug.v3shcache` (town programs only: avatar
  rig programs are skipped since this release), early issue `ct.debug.v3parEarly`; look-check hook `ct.debug.freeze` +
  `window.__ctFreezeT`). Look check: frozen-time look check on the real laptop iGPU (Intel Arc, Mesa, ANGLE GL-EGL): **0 differing pixels** rewrite on vs off on the square (`low`), the own-player cut-away at a cottage (`low` and `high`) and the vote (`low`), except 36 px of the fox avatar's feet that differ between two loads with the SAME flag too (pose noise, not the shader). Laptop cold first visit: v3.4 12.83 s to the first frame with an 8.48 s freeze → v3.5 9.14 s, longest task 0.72 s (one sample each, Intel iGPU, `low`).

**Where everything is**
- Code: branch `v3-game` (= `main`). The v3 game lives in `apps/client/src/game3d/**` (TownGame3d.ts = the mount; world/,
  avatars/ (+ avatars/sprites/ = v3.4 baked sprites at `low`), overlay/, input/, net/, vendor/ = the only code that
  touches the read-only `v3/pixel3d/**` vendor tree), build-time vendor patches in `apps/client/build/pixel3dImports.ts`.
- Parked branches on GitHub (not merged, each with its own doc): `v33-tiles` (docs/perf-v3/tiles.md on the branch),
  `v33-light` (docs/perf-v3/light.md on the branch); `v3-perf-classic` is out of scope (Classic perf). `v35-shaders`,
  `v33-sprites-ship`, `v33-gpu`, `v33-bake` are merged. `v3-dev` = the pixel3d session's vendor publishes (last merged:
  `bd4c9ff` in `5fb072f`; `origin/v3-dev` already has newer demo commits `620ec38`, `f978c46` — unreviewed).
- Perf write-ups: docs/perf-v3/*.md (laptop.md = the real-laptop method + numbers, shaders.md = v3.5, sprites.md = v3.4,
  gpu.md / bake.md = v3.3, cpu.md = the cpu tier).

**How to run / measure**
- Everything runs on the host through `scripts/remote.sh` (CLAUDE.md): `CT_AGENT=<name> scripts/remote.sh sh -c 'flock
  -s $HOME/clocktower/v3-heavy.lock pnpm build'`; e2e add `flock $HOME/clocktower/browser.lock`, `E2E_V3=1 CT_GL=gpu
  CT_E2E_NO_BUILD=1 E2E_PORT=3450` (v3-lead ports 3450-3453), one spec at a time (`pnpm test:e2e --project=v3
  tests/e2e/v3-<x>.spec.ts`). Release gate recipe = docs/test-results.md "v3.5 release gate". Deploy:
  `scripts/deploy-hshi-u1.sh dev|prod <sha>` (prod: check the journal for a running game, run the backup unit first).
- The real laptop (Intel Arc iGPU + RTX 4070 dGPU; access rules in CLAUDE.local.md: files only under ~/ct-perf, on AC,
  `gpu.lock`): method in docs/perf-v3/laptop.md §1 and §9 (the driver scripts once lived in a /tmp how-to that may be
  gone; §9 says how to rebuild them).

**Open known issues**
- Vote camera sprite re-bake: worst frame 67 ms at `low` on the laptop (rigs 33-50 ms).
- cpu tier (software GL) ≈ 8 fps against the 20 fps goal (needs the vendor's cheap cut-away, §9.2).
- After a FIRST visit, the background sprite bake costs 5-10 long tasks ≤ 245 ms (vendor rig builds + sheet programs).
- First visit on an Intel iGPU still pays ≈ 5-8 s of serial driver compile (no freeze since v3.5); see the follow-up below.
- QA deferrals (C2): market-stall black disc at bedtime; own avatar spawns behind the banister in house-0 (Stargazer's
  Tower); house-5 porch gable stays half-faded after leaving; weak block marker without the pennant; the ST panel's
  "Open nominations" + clocks state after an execution.
- Owner actions still open: the Cloudflare `/assets/*` cache rule + Smart Tiered Cache.
- town3d chunk at 295.8 / 300 KiB br: the next feature needs a lazy chunk or a budget decision.

**v4 list (from the user, 2026-10-18)**
1. **Follow camera like the art demo** instead of the snapping camera (today: recentring jumps, and the vote camera's
   4-step stop-motion transitions in `game3d/input/camera.ts` `steppedPose`): continuous eased follow, the pixel look
   kept by snapping only the final render offset to the texel grid; smooth vote in / out, door / room transitions and ST
   teleports; reduced motion keeps a snap. Verify side by side with https://clocktower.chrisshi.com/v3-art-demo/.
2. **Waiting-room panel without scrolling** (`ui/lobby/WaitingRoom.tsx` + `lobby.css`): today it scrolls vertically and
   the Discussion / Nominations / Bedtime / Night timer grid overflows horizontally. Must fit at 1280×720 and 1440×900
   with no scroll: compact header with the lobby code + Copy link inline, How-to-play as a small link, a compact
   non-overflowing timer grid, a shorter mode description, collapsible sections if needed.
3. **Port all the newest art-demo improvements**: first the emote palette (the demo replaced 8 pin colours with 7
   pixel-art emoji emotes that pop above the head + ONE pin slot with an automatic per-player colour), then the D=2 HD
   UI density (finer fonts, clearer pin icons, notebook text), the action bar with a clickable button for every keybind
   action + the lightbulb tip, notebook / pointer size options, ghost-state toggle, ambient events, wax-seal vote marks +
   Butler pacing (verify what the game already has). Method: `git fetch origin`, diff `origin/v3-dev` against the last
   merged vendor (`bd4c9ff`, merged in `5fb072f`), review the vendor diff as text (INTEGRATION.md §10), merge
   (`git merge -X theirs v3-dev`), re-run `scripts/v3/import-assets.sh` / `export-hollowmere.mjs --check`, wire each
   feature; record the unpublished ones as CONTRACT-REQUESTs (§9.2).
4. **Character-change lag**: picking a new character freezes briefly (new rig build + that character's shader compiles,
   plus the v3.4 sprite re-bake at `low`). Keep the old character until the new one's programs are compiled in parallel
   and its rig is built, then swap with the poof; pre-warm characters while the picker is open; measure the hitch on the
   laptop iGPU before / after.
- Also: the vendor asks in INTEGRATION.md §9.2 (tree template hook, cheaper ground piece, foliage static / animated
  split, cheap cut-away for the cpu tier, single-pass colour + normal (MRT), merged toon variants, adopting the cut-away
  rewrite), and **ship a per-build shader-source file** (`v3-shaders/<tier>.json` captured after `pnpm build`) so
  first-time visitors through the home page also get the ≈ 2.5 s join (shaders.md §6.1).

### v3 handoff (2026-10-18 night, after the v3.4 release — superseded by the v3.5 entry above)

- **v3.4 = the commit "v3.4: release gate + docs" on `v3-game`, tag `v3.4`; GitHub `main` = that commit.
  PROD runs v3.4 (`7f54da0`) since 2026-10-18 20:30 PDT** (pre-approved beta deploy: dev + 6-bot host-GPU smoke with sprites forced on, 0 page / console errors; no prod game in the 30 min before; manual backup; public `/`, `/v2/`, `/v3-art-demo/` 200; journals clean; docs/test-results.md "v3.4 deploy"). Rollback: `scripts/deploy-hshi-u1.sh prod 72aba16` (v3.3). Release note: docs/RELEASE-v3.md "v3.4".
  Gate: docs/test-results.md "v3.4 release gate" / "v3.4 deploy".
- Contents: `v33-sprites-ship` merged — **characters are baked sprites at the `low` tier** (every integrated GPU since
  v3.3), rigs at `high` / `cpu`; `ct.debug.v3sprites=1|0` (or a `VITE_V3SPRITES=1|0` build) forces either path. v3.4
  changes on top (docs/perf-v3/sprites.md §8): sprites wait for the tier decision (`Lifecycle.mayPromote`, `TownGame3d`
  `spriteGate`, ≤ 20 s); rig first + background bake + swap (`avatars/layer.ts pumpUpgrades`); GPU memory ≈ 33 MiB for
  17 avatars (depth-less planes, bake-rig buffers freed, one camera key kept); the persistent sheet cache key fixed (it
  missed on every reload); kits warmed in the background after a cached join; re-bake hold 1.2 s; cache store held during
  votes; the sprite code is a lazy chunk. Laptop (Intel iGPU, 1440×900 DPR 2, 14 bots): GPU ms per frame 8.1-9.5 → 4.7-7.0
  at 60 fps, first join to every avatar drawn 15.4 → 14.6-15.3 s (sprites follow in the background), repeat join 3.0-3.4
  → 3.2-3.5 s; dGPU unchanged (`high`, rigs).
- Known v3.4 issues (RELEASE-v3.md): vote camera re-bake worst frame 67 ms on the laptop (rigs 33-50); 5-10 long tasks
  (≤ 245 ms) while the sheets bake after a FIRST visit (vendor rig builds + sheet program compiles); JS heap +60-110 MiB
  while the bake kits are kept; sprite look differences (no secondary motion, no characters in water reflections at low,
  previous sheet for ≈ 1-4 s after a camera change).
- **Next = v3.5 from branch `v35-shaders`** (pushed at `8741a84` by another agent): parallel shader compile + cheaper
  cut-away GLSL + home-page shader warm, aimed at the Intel first-visit shader compile (≈ 14 s to the first frame).
  **Before releasing it: a frozen-time iGPU still** (the laptop, same moment rig/town before vs after) to prove the look
  is unchanged; then the usual laptop before/after + gate. Then the vendor asks in INTEGRATION.md §9.2 ("v3.3 fronts":
  tree template hook, cheaper ground piece, foliage static/animated split, cheap cpu cut-away, single-pass MRT; v3.4 adds:
  a supported G-buffer output mode in look.js + `Character.sampleDrawings()`, a shared bake / sprite program instead of
  one per look option set, a cheaper synchronous `createCharacter`). Parked: `v33-tiles`, `v33-light`.
- How the v3.4 laptop numbers were taken (re-usable): scratch drivers in the release agent's scratchpad = a copy of the
  laptop-perf HOWTO drivers with `measure.mjs` extended (time to every avatar / every sprite, `preWaitMs`, store stats),
  `probe.js` (`avatarsAt` / `spritesAt` via `__ctCamera.avatars3d()` / `spritesNow()`), `session.sh` (one tp64 browser:
  v3.3 cold → v3.4 → v3.3 warm, then `tests/perf/v3-sprites.mjs --cdp`), host sandboxes `v34-lp33` / `v34-lp34`, game
  server port 3452, Vite 3451. Laptop access + rules: the gitignored CLAUDE.local.md; method: docs/perf-v3/laptop.md.
- Carried over: the owner's Cloudflare `/assets/*` cache rule + Smart Tiered Cache; deferred C2 QA findings; runtime
  budget keys (`v3IdleLobbyFps`, `v3WalkFps`, …); `v3-doors` keyboard walker flaked once in this gate (stuck at the door
  under host load; passed on re-run).

### v3 handoff (2026-10-18 night, after the v3.3 release — superseded by the v3.4 entry above)

- **v3.3 = the commit "v3.3: release gate + docs" on `v3-game`, tag `v3.3`; GitHub `main` = that commit.
  PROD runs v3.3 (`72aba16`) since 2026-10-18 18:26 PDT** (pre-approved beta deploy: dev + 6-bot GPU smoke with 0 page errors, no prod lobby in the 30 min before, manual backup, public `/`, `/v2/`, `/v3-art-demo/` 200, journals clean; docs/test-results.md "v3.3 deploy"). Rollback: `scripts/deploy-hshi-u1.sh prod ceab1ce` (v3.2). Release note: docs/RELEASE-v3.md "v3.3".
  Gate: docs/test-results.md "v3.3 release gate".
- Contents: `v33-gpu` merged (three r170 BatchedMesh fix + material twins in `world/merge.ts`, smart river reflection,
  off-screen water passes skipped); **static merge default OFF** on every tier (`ct.debug.v3merge=1` = on);
  **tier promotion needs measured GPU headroom** (`game3d/promote.ts`, `vendor/gpuTimer.ts`: low's GPU median ≤ 6 ms,
  ≤ 4.5 ms on an integrated GPU; integrated + no timer = never); `v33-bake` merged and **the IndexedDB tree cache is
  default ON** (LRU 2 records per vendor build). Laptop before / after: RELEASE-v3.md "v3.3".
- **Next = v3.4: characters as baked sprites at `low`** from branch `v33-sprites-ship` (docs/perf-v3/sprites.md there:
  fps ×2.5 at low on the laptop iGPU; review the branch, merge onto v3.3, re-measure on the laptop; the cpu tier keeps
  rigs per that branch). Then the vendor asks collected in INTEGRATION.md §9.2 "(v3.3 fronts)": tree template data hook,
  a cheaper ground piece, foliage static / animated split, cheap cut-away for the cpu tier, single-pass colour + normal
  (MRT). And the **Intel first-visit shader compile** (≈ 14 s to the first frame, one 8-9.7 s link task:
  laptop.md §5): fewer programs / `KHR_parallel_shader_compile` with a compile order that yields. Parked: `v33-tiles`,
  `v33-light` (prototypes, docs on their branches). The laptop (access in the gitignored CLAUDE.local.md; method
  docs/perf-v3/laptop.md) is the reference device for every iGPU claim.
- Carried over from v3.2: the owner's Cloudflare `/assets/*` cache rule + Smart Tiered Cache; deferred C2 QA findings;
  runtime budget keys (`v3IdleLobbyFps`, `v3WalkFps`, …).

### v3 handoff (2026-10-18 night, after the v3.2 release — superseded by the v3.3 entry above)

- **v3.2 = the commit "v3.2: release gate + docs" on `v3-game` (`ceab1ce`), tag `v3.2`. PROD runs v3.2 since
  2026-10-18 16:32 PDT** (pre-approved by the user: "the whole game is in beta"): dev deploy + 6-bot GPU smoke (0 page
  errors, no Phaser chunk in a v3 join, `/assets` served br), no prod lobby open in the 30 min before, manual
  `clocktower-backup-prod` + the script's pre-deploy backup, `scripts/deploy-hshi-u1.sh prod ceab1ce` exit 0, public `/`,
  `/v2/`, `/v3-art-demo/` 200, journals clean. Edge: `town3d` arrives as the origin's q11 br (290 358 B, was ≈ 336 600 at
  Cloudflare's q4), MISS → HIT; the JSON atlases are still `DYNAMIC` (owner cache rule). docs/test-results.md "v3.2 deploy". Rollback: `scripts/deploy-hshi-u1.sh prod b7803fa`
  (v3.1). Release note: docs/RELEASE-v3.md "v3.2". Gate: docs/test-results.md "v3.2 release gate" (typecheck, build with
  the .br / .gz siblings, budgets all ok incl. the new `v3JoinPhaserChunk` + `town3dShippedBrKiB`, full `pnpm test`
  178 files / 2063 tests, all 9 v3 e2e specs on the host GPU with 0 page errors, Classic doors + chat-bubbles).
- Contents: `v32-early` merged (idle rendering 30 fps: −41-44 % main-thread work in still windows; Phaser-free v3 join:
  −360 KB br; `town3d` prefetch on the v3 home / landing page; build-time brotli: `town3d` 336.6 KB at Cloudflare's
  q4 → ~290 KB br from the origin) + one release fix (select.ts out of the entry chunk).
- Owner actions still open (docs/perf-v3/fullstack.md §10.3): the Cloudflare `/assets/*` cache rule (the hashed JSON
  atlases are `DYNAMIC` at the edge) and Smart Tiered Cache. Brotli pass-through already works (no Compression Rule
  change needed).
- **Next = v3.3:** the prototypes on branches `v33-tiles`, `v33-bake`, `v33-sprites`, `v33-light`, `v33-gpu` are still
  running (agent worktrees in `.claude/worktrees/`); merge what wins. A real laptop with an Intel Arc iGPU is reachable for
  measurements since 16:10 (access details in the gitignored CLAUDE.local.md; method in docs/perf-v3/laptop.md once its
  baseline lands). GitHub: every v3 work branch (`v3-perf-*`, `v31-*`, `v32-early`, `v33-*`) and the release tags are
  pushed, and `main` = the released v3-game commit (user 2026-10-18: "make sure all this v3 stuff is on the github so
  others can work on it"). Everything under "Next = v3.2" in the v3.1 entry below that v3.2 did not do (town-batch laptop A/B,
  cheap cpu-tier cut-away, deferred C2 QA findings, KHR_parallel_shader_compile run, render-check CT_GL, runtime budget
  keys incl. `v3IdleLobbyFps` / `v3IdleNightFps` ≤ 32 and `v3WalkFps` ≥ 58) carries over.

### v3 handoff (2026-10-18 night, after the v3.1 release — superseded by the v3.2 entry above)

- **v3.1 = the commit "v3.1: release gate + docs" on `v3-game`, tag `v3.1`, deployed to DEV** (`clocktower-dev`,
  127.0.0.1:3001; `scripts/deploy-hshi-u1.sh dev b7803fa` exit 0, `/internal/version` = b7803fa, journal clean, a 6-bot
  GPU smoke with 0 page errors; docs/test-results.md "v3.1 dev deploy"). **PROD runs v3.1 since 2026-10-18 16:04 PDT**
  (lead: no prod joins in the 30 min before, manual `clocktower-backup-prod` + the script's pre-deploy backup,
  `scripts/deploy-hshi-u1.sh prod b7803fa` exit 0, `/internal/version` = b7803fa, public `/`, `/v2/`, `/v3-art-demo/`
  200 ("Hollowmere demo"), journal clean; rollback `scripts/deploy-hshi-u1.sh prod 4be9bb4`).
  Release note: docs/RELEASE-v3.md "v3.1". Gate: docs/test-results.md "v3.1 release gate" (typecheck, build, budgets
  incl. the new `town3dChunkBrKiB`, full `pnpm test` 175 files / 2016 tests, all 9 v3 e2e specs on the host GPU with 0
  page errors, Classic doors + chat-bubbles).
- Contents: `v31-fixes` (the `isReady` page error, the remount leak of one destroyed town, bedtime / walk DOM churn),
  `v31-stage` (the static town kit batched into 7 `BatchedMesh`es: −17 to −19 % draw calls, +0.3-0.7 ms render JS),
  `v31-cpu` (cpu tier profiled: the cost is the vendor cut-away; opt-in toon twins; no speed change), docs/perf-v3/client.md,
  and the C2 QA fix round (the vote camera clears the real HUD and keeps the circle in frame; no house-name pills in
  the vote view; a softer talking rim).
- **Deferred C2 QA findings** (from the read-only QA on d9cc841; stills in `tests/v3/shots/v3.1-qa/`, gitignored):
  - MEDIUM: a black disc with a grey rim over the market stall west of the square, at bedtime only (harness
    `dusk-transition` still "bedtime", playtest `30-pl-bedtime.png`); suspect a sun / moon / lamp sprite at the bedtime
    hour (`world/stage.ts`, `world/hour.ts`, `vendor/time.ts`).
  - MEDIUM: the own avatar spawns behind the staircase banister in Stargazer's Tower (house-0) at night / after a
    reload, and that side of the room is under the Storyteller panel on a laptop (interior spawn point; vendor
    interiors or the layout's spawn).
  - MEDIUM: after leaving house 5 the porch gable stays half-faded over the avatar (soft-layer fade, D1; harness
    `interior-house-5` still "out").
  - MEDIUM (re-check): the vote frame vs the Storyteller panel was fixed by measuring the HUD (unit test with the
    panel; the e2e probe ran on a player page) — look at a real Storyteller vote on a laptop once; also look at the
    softer talking rim in the harness `square-day-8` a/b stills.
  - LOW: the block marker is weak without the pennant (`world/dais.ts`); a navy slab outside the clock tower room's
    right wall; the finder has no "rejoin your game" for a seated player mid-game (default filter "Waiting"); the clock
    chip / tower dial still count "Nominations close in" after an execution closed nominations; harness `south-bay`
    spawns inside the clockmaker house (stale spawn, or occluded avatars need a silhouette); braziers lit by day and
    dark at night; bedtime light flattens avatars to one pink; the gold pin outlives the day; labels hide under the
    "Your home" chip / toasts; a bot's red pin not shown on the player page (maybe by design); high tier p50 33 ms at
    1440×900 DPR 2 in the harness (night-15, ~943k triangles).
- **Next = v3.2:** (1) laptop iGPU A/B of the town batch at 1440×900 DPR 2 (`ct.debug.v3merge=0` vs default); default it
  off if the main thread loses; then remove the batched / plain program switches (stage.md §6 follow-ups). (2) cpu tier:
  a cheap cut-away (compile out `townCutRim`, size the loops; §9.2 CONTRACT-REQUEST), re-measure the twins, character
  LOD. (3) the deferred QA findings above. (4) run `v3-pageerrors` on a browser with KHR_parallel_shader_compile
  (Windows / macOS laptop). (5) `scripts/v3/render-check.sh` does not forward `CT_GL` to the host (CT_GL=gpu from the
  editing machine silently runs SwiftShader; owner v3-qa). (6) runtime budget keys proposed by the fronts, once
  measured twice: `v3WalkDomMutPerSec` ≤ 5, `v3UiBedtimeDomMutPerSec` ≤ 10, `v3UiWalkDomMutPerSec` ≤ 4,
  `v3MountHeapGrowthMiB` ≤ 10, `v3GpuCallsMeanLow/High` 215/310, `v3GpuShadowCallsMeanHigh` 75, `v3ProgramsHigh/Low`
  62/56, `v3CpuSyncedP50Ms` ≤ 250, `v3CpuShaderErrors` = 0 (need input plumbing in `scripts/perf/budgets.mjs`).

### v3 handoff (2026-10-18 evening, after the v3.0 release — superseded by the v3.1 entry above)

- **v3.0 = the commit "v3.0: release gate + docs" on `v3-game`, tag `v3.0`, deployed to dev, then to PROD (below)**
  (`clocktower-dev`, 127.0.0.1:3001, reached through `scripts/dev.sh`; the tunnel serves only prod). Contents: C1 + WP8
  (`/` = v3, `/v2/` = v2, the v3 loading screen, no voting-circle candles, laptop-first note) + the merged perf branches
  stage (low-tier shadow cadence), ui, learn (60 fps cap), server (Storyteller view throttle, path planning, LiveKit
  calls; deflate opt-in), cpu (`cpu` tier on software GL) + the cherry-picked client commit (smaller `town3d`, parallel
  fetches). Gate: docs/test-results.md "v3.0 release gate". Release note: docs/RELEASE-v3.md.
- **PROD runs v3.0 since 2026-10-18 13:45 PDT** (user: "I want 3.0 published to whatever is live in
  clocktower.chrisshi.com"): `scripts/deploy-hshi-u1.sh prod 4be9bb4` exit 0 (pre-deploy backup by the script + a manual
  `clocktower-backup-prod` run first; prod had no joins in the 3 h before). Verified: `/internal/version` = 4be9bb4;
  public `/`, `/v2/`, `/lobby/x`, `/v2/lobby/x` serve the app; `/v3-art-demo/` still serves "Hollowmere demo" (prod.env
  `DEMOS_DIR`); `scripts/verify-public-endpoint.sh` all pass except its two loopback checks, which fail only because it
  ssh-es the `ct-u1` alias from the host itself (`ss -tln`: 3000 and 3001 listen on 127.0.0.1 only). Rollback:
  `scripts/deploy-hshi-u1.sh prod 4ca13aa` (v2.4, release kept). Dev also runs 4be9bb4. **User 2026-10-18 ~15:00: prod deploys
  no longer need approval ("the whole game is in beta")**: ship each v3.x to prod after a green gate + a dev smoke,
  avoid restarting prod during a running game (check the journal / active games first), then tell the user.
- **Next = v3.1:** (1) the remaining work on the perf branches `v3-perf-cpu`, `v3-perf-client` and `v3-perf-server`
  (their agents were still running at the release; review each as text and re-gate); (2) C2 QA on the host GPU plus a
  small `CT_GL=swiftshader` set, the art checks, and one combined fix round; (3) the plan in
  `docs/perf-v3/learnings.md` (with the budget keys it proposes); (4) the known issues in docs/RELEASE-v3.md.

### v3 handoff (2026-10-18 ~08:20 PDT, swarms stopped for a user break — superseded by the v3.0 entry above)

Pushed checkpoints on `v3-game`: `f838b6a` **v3 C1a** (phase-1 packages WP1-WP6 finished, not wired; D1-D4; WP7a harness
+ v3 e2e; perf recon tooling) → `5fb072f` merge of `v3-dev` pass A+B (vendor reviewed as text, nothing unsafe; up to
`bd4c9ff`) → `182d220` **vendor B** (assets imported; the clock tower exported as an enterable 16th building, no server
change needed; NPC homes off the circle). On top: **"v3 WIP: …" (this handoff commit) = UNTESTED work in progress** of
three streams that were stopped mid-work:

| Stream | State in the WIP commit | Restart with |
|---|---|---|
| **C1 integrate** (`game3d/TownGame3d.ts` wiring WP1 net/input/debug + WP2 avatars + WP4 overlay + pass-B: vote camera, tower timer/readout, tower interior) | **DONE, gate passed, committed "v3 C1: …" (2026-10-18)**: v3 e2e on the host GPU pass (`v3-doors`, `v3-social` pin/point/bubble, `v3-boot`, `v3-vote`, `v3-mixed`, `v3-life`, `v3-fallback` 4/4); `v3-lobby-choice` 3/3 fail by design (superseded by WP8 `v3-paths`); context-loss race fixed, chunk retry dropped; review → fix round (room-build camera hold, `paths.v2` port, reconciler); gate: typecheck 7/7, build 0, full `pnpm test` 167 files / 1944 pass (5 skipped), budgets ok (INTEGRATION.md §11 "C1 gate") | — (4 deferred low review findings in INTEGRATION.md §11 "C1 review fix round", incl. the voice audit back-off owner sign-off) |
| **WP8 paths + loading screen** (user 2026-10-18: `/` = v3, `/v2/` = v2, world from the URL path, no Town choice; a new v3 loading screen; INTEGRATION.md §11) + **candles removed** + **laptop-first note** | **DONE, committed "v3 WP8: …" (2026-10-18)**: `LobbyRoute` authoritative path move (`syncWorldPath` on the first lobby:view), the v3 loading scene wired as GameScreen's town-loading state in v3 lobbies (v2 keeps "Lighting the lamps…"), the dais' per-seat candle stakes / flames / wisps / halos / pennants removed for good (`vendor/town.ts removeDaisCandles`, index-only, before the warm-up), the phone note (coarse pointer + shorter side < 600 px) on the v3 loading scene and the `/` finder, `v3-lobby-choice.spec.ts` deleted; gate in docs/test-results.md "v3 WP8 gate" | merge the perf branches, then the v3.0 dev deploy |
| **v3 perf (server, network)** — user: only v3 perf matters now | partial optimisations in `apps/server/src/**`, notes `docs/perf-v3/net.md`; recon in `docs/perf-v3/recon-*.md` | re-measure before/after, keep tests green, propose `budgets.mjs` keys |
| **CPU-only tier prototype** — user goal: v3 playable with software GL (SwiftShader), target ≥ 20 fps at 960×540 with 8-15 players | lives only in the host scratch sandbox `~/clocktower/work/v3-perf-cpu-proto` (not in git); levers: low internal resolution, no shadows/post, fewer lights, cheaper materials, character LOD, software-renderer auto-detect → `cpu` tier | read its diff vs `182d220`, write `docs/perf-v3/cpu-tier.md` + patch plan, apply in the v3 perf swarm |

**Next, in order** (target: dev deploy the same day):
1. ~~C1 finish → review → fix → gate C1~~ **done** (commit "v3 C1: …", pushed).
2. ~~**WP8 paths + loading screen + candle removal**~~ **done** (commit "v3 WP8: …", pushed). **Next: merge the v3 perf
   branches (review each as text, re-gate), then the v3.0 dev deploy.**
3. **C2 QA on the host GPU** (`CT_GL=gpu`, default) + a small `CT_GL=swiftshader` set: every `v3-*` e2e, `hd-cast` v3 branch,
   harness stills to `tests/v3/shots/` (send them to the user), one playtest + one art critic (read-only) **in parallel with**
   the v3 perf swarm (load, frame, characters/memory, CPU tier, server, network; time-box ~3 h); then ONE combined fix round.
4. Final gate (full suite + budgets in `scripts/perf/budgets.mjs`) + **deploy `v3-game` to the dev service** and tell the user.
   **Never prod without asking.**

**Rules in force since 2026-10-18** (INTEGRATION.md §11): the host GPU and the render host are allowed (prod idle; heavy
host load OK); host lock: builds/tests take `flock -s` (shared), perf measurements take it exclusive; e2e `E2E_PORT` per
agent (3450-3499); `CT_GL=gpu|swiftshader`. Usage: one 5-hour window of the full swarm used ~15 % of the weekly limit;
keep a check-in that resumes work after a limit reset and never blind-resume a parallel workflow (continue from the files).
Stopped agents leave host commands queued on the lock: after stopping a swarm, kill the leftover `clocktower/work/v3-*`
processes by PID (not `pkill -f` from a shell whose own command line matches).
