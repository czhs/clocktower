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
