# Clocktower Town — agent guide

Browser-based gothic pixel-art social-deduction town (Trouble Brewing rules, human Storyteller,
multiple passwordless lobbies, LiveKit proximity/private voice). Authoritative spec:
`docs/spec/CLOCKTOWER_TOWN_SPEC.md`. Architecture and contracts: `docs/architecture.md`.
**New here? Start with `docs/HANDOFF.md`** (rules, map, current state). **Product vision: `docs/vision.md`.**
**The GitHub repo is public:** never pull from GitHub, work on a local branch, push only through the secret scan. Status: `docs/progress.md`. Executed tests: `docs/test-results.md`.

## Where things run (non-negotiable)

- **Everything executes on the host** — the single build + production machine (Ubuntu 22.04,
  Node 24 sourced via `~/clocktower/env.sh`). Do **not** run node/pnpm/tests on the editing
  machine; it only edits files and syncs. Host-specific details (SSH alias, user, hardware, other
  machines) live in the gitignored `CLAUDE.local.md` and `ops.local.env` (copy `ops.example.env`);
  never write them into tracked files — the repo is public and `scripts/secret-scan.sh` /
  gitleaks (`.gitleaks.toml`) block tailnet names, Tailscale IPs and home-directory paths.
- Run commands through `scripts/remote.sh` — it rsyncs this tree to
  `<host>:~/clocktower/work/$CT_AGENT/`, installs deps from the frozen lockfile if manifests
  changed, and runs the command:
  ```
  CT_AGENT=rules scripts/remote.sh pnpm vitest run packages/rules
  CT_AGENT=rules scripts/remote.sh --no-sync pnpm -r run typecheck
  CT_AGENT=world-art scripts/pull.sh packages/assets/generated   # copy generated files back
  CT_AGENT=lead scripts/remote.sh pnpm install     # deliberate dependency change; lockfile comes back
  ```
- Ports on the host: **3000 = production (Cloudflare Tunnel), 3001 = dev service** — never bind these in tests.
  Ad-hoc test servers: lead 3300-3309, rules 3310-3319, world-art 3320-3329, lobby-auth 3330-3339,
  voice 3340-3349, qa-deploy 3350-3399; 3400-3449 = random ports picked by `tests/support/server.ts`
  `pickPort()` (never hardcode a port there); **3450-3499 = v3 agents** (v3-lead 3450-3453 ad hoc + 3454 = `lobby.world.test.ts`, v3-core
  3455-3459, v3-qa harness 3460, v3-avatars 3461-3464, v3-stage 3465-3469, v3-overlay 3470-3474,
  v3-world 3475-3479, v3-ui 3480-3484, v3-qa 3485-3499; docs/v3/INTEGRATION.md §8). Always bind 127.0.0.1.
- Runtime (since 2026-10-15): services are SYSTEM units `clocktower-{prod,dev,tunnel}.service` running as the
  unprivileged `clocktower` user from `/srv/clocktower` (sandboxed; see docs/security.md). Deploy only via
  `scripts/deploy-hshi-u1.sh`; the admin may only restart/stop these units via a narrow sudoers rule.
  `~/clocktower/work/*` sandboxes are for builds/tests only. Logs: `journalctl -u clocktower-prod -f`.
- Never touch services on the host that are not ours. No other sudo — ask the user.
- Never run code from an unreviewed branch/PR on the host (it runs as the admin account): review
  manifests, lockfile, scripts and workflows as text first.

## Commands (run via scripts/remote.sh)

`pnpm -r run typecheck` · `pnpm test` (vitest, all unit/integration/security) ·
`pnpm build` · `pnpm serve` · `pnpm dev` · `pnpm assets:generate` · `pnpm test:e2e` · `pnpm test:load`

## File ownership

| Owner | Exclusive paths |
|---|---|
| lead | `packages/protocol/**` (shared contract), root configs, `CLAUDE.md`, `docs/architecture.md`, `docs/progress.md`, `apps/server/src/{index,config,log}.ts`, `apps/server/src/rooms/modules.ts`, `apps/client/src/main.tsx`, `apps/client/src/net/**`, `apps/client/src/ui/common/**` |
| rules-storyteller | `packages/rules/**`, `apps/server/src/game/**`, `apps/client/src/ui/hud/**`, `apps/client/src/ui/storyteller/**`; may extend `packages/protocol/src/{game,storyteller}.ts` additively |
| world-art | `packages/assets/**`, `apps/server/src/world/**`, `apps/client/src/game/**` |
| lobby-auth | `packages/db/**`, `apps/server/src/{services.ts,auth,directory,rooms/GameRoom.ts,rooms/*.ts except modules.ts,admin}/**`, `apps/client/src/ui/{auth,lobby,admin}/**`, `apps/client/src/ui/chat/**` |
| voice | `packages/voice/**`, `apps/server/src/voice/**`, `apps/client/src/voice/**`, `apps/client/src/ui/voice/**`; may extend `packages/protocol/src/voice.ts` additively |
| qa-deploy | `tests/**`, `scripts/**` (except remote.sh/remote-prepare.sh/pull.sh: lead), `docs/deployment.md`, `docs/test-results.md`, `deploy/**` |
| v3-lead (WP0) | `apps/client/src/game3d/{TownGame3d,select,bootGuard,bootMark,perf,contract,coords}.ts`, `game3d/pixel3d.d.ts`, `game3d/vendor/engineHost.ts`, `apps/client/build/pixel3dImports.ts`, `apps/client/src/game/rules/**`, `apps/client/src/net/layout.ts`, `docs/v3/INTEGRATION.md` |
| v3-core (WP0s, WP1) | `apps/client/src/game3d/{net,input,debug}/**`; `game/gameplay/{core,phaserView}.ts`, `game/social/{controller,phaserView}.ts` (splits, acting for world-art) |
| v3-avatars (WP2) | `apps/client/src/game3d/avatars/**`, `game3d/vendor/characters.ts` |
| v3-stage (WP3) | `apps/client/src/game3d/world/**`, `game3d/vendor/{town,interiors,time}.ts` |
| v3-overlay (WP4) | `apps/client/src/game3d/overlay/**` |
| v3-world (WP5a/b) | `scripts/v3/export-hollowmere.mjs`, `packages/assets/src/hollowmere/**`, `packages/assets/test/hollowmere*.test.ts` (acting for world-art) |
| v3-ui (WP6) | `apps/client/src/ui/common/{v3atlas.ts,theme-v3.css}` + the v3 branches named in INTEGRATION.md §8 |
| v3-qa (WP7) | `scripts/v3/**` (except export-hollowmere.mjs), `tests/v3/**`, `tests/e2e/v3-*.spec.ts`, `apps/client/src/game3d/harness/**`, `apps/client/{v3-harness.html,vite.harness.config.ts}` |
| nobody (vendor) | `v3/**` is READ-ONLY: `v3/pixel3d/**` and `v3/assets/**` are re-published by the pixel3d session; work around in `game3d/vendor/` or add a CONTRACT-REQUEST to INTEGRATION.md §9.2 |

Package-local unit tests live in `<package>/test/*.test.ts` and are owned by the package owner.
Need a change in someone else's file? Describe it in your final report (or a `// CONTRACT-REQUEST:`
note in your own code) — the lead integrates. Adding a dependency to a package you own is fine.

## Conventions

- TypeScript strict, ESM, pnpm workspace; workspace packages are consumed as TS source.
- All C2S messages validated with the Zod schemas in `@ct/protocol` (`C2S` map). Authorisation
  (host / storyteller / seat / phase) is checked server-side, never trusted from payloads.
- **Secrecy:** the server never broadcasts game state. Every client receives only its own
  projection (`viewFor(pid)`, `snapshotFor(pid)`, per-pid voice grants, zone-scoped chat).
  Account ids, passphrases, tokens and Grimoire data never reach other clients or logs.
- Escape user text: render via Preact (auto-escaped) or `textContent`; never `innerHTML` with user data.
- Client URLs derive from `window.location` (https → wss). Never hardcode localhost in client code.
- Record every test command you actually ran (and failures) in your report; the lead/qa-deploy
  copy them into `docs/test-results.md`. Never claim a test passed that you did not run.
