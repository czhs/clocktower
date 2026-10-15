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
