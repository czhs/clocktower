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

### v3 handoff (2026-10-18 evening, after the v3.0 release — RESTART FROM HERE)

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
