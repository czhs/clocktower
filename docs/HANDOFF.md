# Agent handoff — start here

_Last updated: 2026-10-15 (lead, v2.2 release; v2.3 security audit done, fixes pending)._ If you are a new agent (or a human) picking this repo up,
read this page first, then `CLAUDE.md` (binding rules), `docs/vision.md` (product principles) and
`docs/architecture.md` (contracts + secrecy model).

## What this is

Clocktower Town: a browser, gothic pixel-art town where up to 15 friends + a Storyteller play Blood on
the Clocktower (Trouble Brewing) with proximity / private voice (LiveKit). One-screen town square
ringed by 15 houses (homes at night, private voice rooms by day). Human-Storyteller games and
(v2.1) automatic games. Live at https://clocktower.chrisshi.com (Cloudflare Tunnel → hshi-u1:3000).

## Ground rules you must not break

1. **Nothing runs on the Mac.** Edit files locally; run everything on `hshi-u1` with
   `CT_AGENT=<your-name> scripts/remote.sh <cmd>` (rsyncs the tree into
   `~/clocktower/work/<your-name>/`, installs deps, runs in a resource-capped scope). Never use `hshi`
   (the 4090 box).
2. **Ports:** 3000 = prod, 3001 = dev — never bind them. Use your range from `CLAUDE.md`; always
   `127.0.0.1`.
3. **One browser at a time on the host.** Any Playwright / headless-Chromium run must hold the host
   lock: `flock ~/clocktower/browser.lock <cmd>`. Do **not** put the words `playwright test` in a
   *waiting* command's own command line together with a `pgrep -f "playwright test"` loop — that
   deadlocked the queue once (the waiter matched itself).
4. **Secrecy is the core invariant.** The server never broadcasts game state; every client gets only
   its projection (`viewFor(pid)`, `snapshotFor(pid)` → `world:snap2` per viewer, per-pid voice grants,
   zone-scoped chat). Client-side features may only use data the client already legitimately received.
   Before merging anything that touches what a client receives, run `apps/server/test/world.leaks.test.ts`,
   the `playtest*` tests (secrecy scanner decodes `world:snap2`) and `tests/security/**`.
5. **Storyteller-first.** The rules engine is advisory; the ST can override anything; players walk (no
   auto-teleports except the documented ones).
6. **File ownership** is in `CLAUDE.md`. Several agents usually work in the same tree at once: keep edits
   surgical, put new logic in new modules, re-read a file right before editing it, never revert or
   reformat other people's changes, and never run tree-modifying git commands unless you are the lead.
7. **The GitHub repo is PUBLIC.** Never pull/fetch/merge from GitHub into the local tree; work on a
   local branch; every push goes through the secret scan (`scripts/install-hooks.sh` installs the
   pre-push hook; `scripts/secret-scan.sh` / gitleaks with `.gitleaks.toml`). Never commit real hosts,
   IPs, usernames, home paths, account ids or secrets. Security fixes are **deployed before they are
   pushed** (`/healthz` reveals the deployed commit), and vulnerability write-ups stay local
   (`.git/info/exclude`) until fixed.
8. **hshi-u1 is also production.** `scripts/remote.sh` runs everything in a capped low-priority
   slice; don't bypass it with plain `ssh … node/pnpm/playwright`. Prod deploys are done by the user
   or with their explicit go-ahead.
9. **Record every test command you actually ran** (and failures) in your report; the lead copies them
   into `docs/test-results.md`. Never claim a test passed that you did not run.

## Everyday commands (on hshi-u1 via scripts/remote.sh)

| What | Command |
|---|---|
| Typecheck all | `pnpm -r run typecheck` |
| All unit / integration / security tests (~800, ~3 min) | `pnpm test` |
| Build client + server | `pnpm -r --if-present run build` |
| One e2e spec (hold the lock!) | `flock ~/clocktower/browser.lock pnpm exec playwright test -c tests/e2e/playwright.config.ts <spec>` (`CT_E2E_NO_BUILD=1` to reuse a build; `GAME_RUN=<tag>` names game-full/chaos step logs) |
| Regenerate art | `pnpm assets:generate` then `CT_AGENT=<you> scripts/pull.sh packages/assets/generated` |
| Perf budgets (release candidates) | see `docs/perf-v2.2-results.md` → WP7 (`scripts/perf/budgets.mjs`) |
| Deploy | `scripts/deploy-hshi-u1.sh dev [<sha>]`, then `scripts/deploy-hshi-u1.sh prod <sha>` (prod refuses an uncommitted HEAD and an active game; rollback = deploy the previous sha) |
| Prod logs | `ssh hshi-u1 journalctl -u clocktower-prod -f` |

E2E suites and rough durations: `lobby` (≈3 min), `v21-clock` (≈3), `v2-social`, `v2-phone` (≈4),
`v2-look`, `v2-st-ui`, `ux-ready` (≈2), `ux-walkthrough` (≈7), `game-full` (≈11–15), `game-chaos`
(≈6–14). `voice-live` skips without real LiveKit credentials.

## Map of the code

| Area | Where |
|---|---|
| Shared contract (zod schemas, message maps, snapshot codec) | `packages/protocol/src/**` (client imports `@ct/protocol/client`, zod-free) |
| Rules engine (22 TB characters) | `packages/rules/**` |
| Server: rooms, directory, auth, admin | `apps/server/src/{rooms,directory,auth,admin}` |
| Server: game module / automatic Storyteller | `apps/server/src/game/**`, `apps/server/src/auto/**` (docs/auto-storyteller.md) |
| Server: world (movement, doors, escorts, visibility) | `apps/server/src/world/**` |
| Server: voice grants / zones | `apps/server/src/voice/**`, `packages/voice/**` |
| Client shell + routing + lazy chunks | `apps/client/src/main.tsx`, `ui/common/{route,lazy}.ts(x)`, `ui/lobby/LobbyRoute.tsx` |
| Client town (Phaser) | `apps/client/src/game/**` (`TownScene.ts`, `fx/tier.ts` render tier, `social/**` pins/emotes) |
| Client UI | `apps/client/src/ui/{auth,lobby,hud,clock,storyteller,voice,chat,notebook,story,social,admin}` |
| Client voice | `apps/client/src/voice/VoiceClient.ts` (static, tiny) + `VoiceEngine.ts` (lazy, LiveKit) |
| Art (procedural pixel art, generated atlases) | `packages/assets/scripts/**` → `packages/assets/generated/*` (WebP + PNG); URLs via `@ct/assets/runtime` |
| Tests | package-local `*/test/*.test.ts`; `tests/{integration,security,e2e,perf,load}` |
| Deploy | `scripts/deploy-hshi-u1.sh`, `deploy/**`, docs/deployment.md, docs/security.md |

## Docs index

- `docs/vision.md` — product principles (read before changing behaviour).
- `docs/architecture.md` — topology, identity, lobby lifecycle, secrecy, voice privacy, **contract change log** (append to it when you change a contract).
- `docs/progress.md` — status board and next steps.
- `docs/RELEASE-v2.md` — v2.0 / v2.1 / v2.2 release notes.
- `docs/test-results.md` — every executed test command with results, by date.
- `docs/perf-plan-v2.2.md` / `docs/perf-v2.2-results.md` — perf audit, work packages, measured before/after, budgets.
- `docs/deployment.md`, `docs/security.md`, `docs/security-review.md` — ops.
- `docs/auto-storyteller.md`, `docs/game-records.md`, `docs/audio.md`, `docs/tutorial.md`, `docs/rules-audit.md`, `docs/world-audit.md` — subsystem notes.

## Current state and open work

See `docs/progress.md` → "v2.2" for what shipped in this release, what was verified, and the ranked
list of open items (with owners) for the next agent.
