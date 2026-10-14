# Progress

_Last updated: 2026-10-14 (lead)_

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
| A1 | SQLite/Drizzle schema, passphrase accounts, sessions, rate limit | lobby-auth | ⏳ |
| A2 | Lobby directory, create/list/SSE, tickets | lobby-auth | ⏳ |
| A3 | GameRoom lifecycle, seats, reconnect, duplicate devices, fan-out | lobby-auth | ⏳ |
| A4 | Auth/home/finder/create/waiting-room/admin UI | lobby-auth | ⏳ |
| R1-R4 | Rules engine, 22 roles, GameController, HUD + ST UI | rules-storyteller | ⏳ |
| W1-W4 | Handcrafted layout, PNG generator, WorldModule, Phaser town/cosmetics/ghosts | world-art | ⏳ |
| V1-V4 | Acoustic graph, LiveKit grants/revocation/quota, client voice + controls | voice | ⏳ |
| Q1-Q5 | Test harness, synthetic players, security/load, dev+prod services, Funnel | qa-deploy | ⏳ |

## Blocked / needs user

1. `sudo loginctl enable-linger hshi` (user services survive logout/reboot) — requested.
2. `sudo tailscale set --operator=hshi` (manage Funnel without sudo) — requested.
3. Funnel may need enabling in the Tailscale admin console (nodeAttr `funnel`) — TBD when tried.
4. LiveKit Cloud free project + API key/secret (to be placed in `~/clocktower/env/*.env` on hshi-u1).

## Next

Spawn teammates; integrate M1 vertical slice (auth → two lobbies → movement → voice → night visit).
