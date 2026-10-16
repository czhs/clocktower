# Progress

_Last updated: 2026-10-15 (lead)_

## Environment facts (verified 2026-10-14)

- Editing machine: Mac (this Claude Code session). **No code is executed here**; per user
  instruction everything runs on `hshi-u1`; `hshi` (4090) is not used.
- `hshi-u1`: Ubuntu 22.04.5, x86_64, 12 cores, 15 GiB RAM (swap full at time of check), 113 GB
  free disk, systemd 249, Tailscale 1.102.2, DNS name `hshi-u1.tailf28040.ts.net`, SSH key auth OK
  as user `hshi`, no passwordless sudo, user lingering off, ports 3000/3001 free.
- Installed in user space on hshi-u1: Node v24.22.0 (`~/.local/share/node`), pnpm 10.34.7.
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
| Q5 | Public ingress: Cloudflare Tunnel https://clocktower.chrisshi.com → hshi-u1:3000 | lead | ✅ live, verified with 2 external Chromium browsers (HTTPS+WSS) |
| W1-W4 | Handcrafted town, PNG generator, WorldModule, Phaser town/cosmetics/ghosts | world-art | ✅ done (18 world tests; 2-browser render check) |
| M3 | Playable ST-guided round end-to-end in browser | lead | ⏳ after world-art |
| M5 | Prod release with Funnel; external + mobile test; load test with real movement + voice | lead/qa | ⏳ |

## Blocked / needs user

1. ~~enable-linger~~ ✅ done by user (Linger=yes). 2. ~~tailscale operator~~ ✅ done (OperatorUser=hshi).
3. Funnel: `tailscale funnel --bg 3000` reports hshi-u1 is not in the tailnet policy's funnel nodeAttr — a tailnet admin must approve (link printed by the CLI) or add the node to the policy.
4. LiveKit Cloud free project + API key/secret (to be placed in `~/clocktower/env/*.env` on hshi-u1).

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
