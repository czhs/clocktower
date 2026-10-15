# Test results (executed commands only)

All commands run on **hshi-u1** via `scripts/remote.sh` unless stated otherwise.

## 2026-10-14 — M0 (lead)

| Command | Result |
|---|---|
| `ssh hshi-u1 'uname -a; cat /etc/os-release; …'` | ✅ Ubuntu 22.04.5 x86_64, Tailscale 1.102.2, no Node |
| Node v24.22.0 tarball install (sha256 verified) + `npm i -g pnpm@10` | ✅ node v24.22.0, pnpm 10.34.7 |
| `scripts/remote.sh node -e …` (first install incl. better-sqlite3 native build) | ✅ `node v24.22.0 on hshi-u1` |
| `scripts/remote.sh pnpm -r --no-bail run typecheck` | ❌ first run: ` ` literal broke regex in protocol/text.ts; ❌ Emitter generic constraint → fixed; ✅ all 7 packages pass |
| `pnpm --filter @ct/client build` | ✅ vite build 147 kB js |
| `pnpm --filter @ct/server build` | ✅ esbuild bundle |
| `node apps/server/dist/server.js` on :3399 + `curl /healthz`, `curl /lobby/abcdef` | ✅ `{"ok":true,"env":"test"}`, SPA index served for deep link |
| `scripts/remote.sh pnpm vitest run packages/protocol` | ❌ first run: wrong expectation in my collision test (wall row math) → fixed test; ✅ 9/9 passed |

## 2026-10-14 — integration after voice + lobby-auth (lead)

| Command | Result |
|---|---|
| `scripts/remote.sh pnpm -r --no-bail run typecheck` | ✅ 7/7 packages |
| `pnpm vitest run packages apps` | ✅ 14 files, 202 tests passed (rules work-in-progress included) |
| `pnpm --filter @ct/client build` / `@ct/server build` | ✅ (client bundle 898 kB, Phaser included) |
| `node apps/server/dist/server.js` on :3301, `curl /healthz`, `POST /api/auth/create` | ✅ after adding `livekit-server-sdk` to @ct/server deps (bundle previously failed to start — reported by lobby-auth) |

## 2026-10-14 — qa-deploy: services, deploy pipeline, harness, security, E2E, load

Host facts at start: `Linger=no`; `tailscale funnel status` → `No serve config`; no `funnel` node capability;
no Tailscale operator set; memory cgroup delegated to the user manager; `google-chrome` 143 present; no `jq`/`sqlite3` (python3 used).

| Command | Result |
|---|---|
| `scripts/setup-hshi-u1.sh` | ✅ layout, `env/{dev,prod}.env` (600, secrets generated on host, distinct per env), 4 units installed; dev/prod enabled; backup timer active |
| `scripts/deploy-hshi-u1.sh dev` (ae17ec6) | ❌ root `pnpm build` fails: unquoted `./packages/*` glob expanded by sh → `None of the selected packages has a "./packages/db" script`; deploy switched to `pnpm -r --if-present run build` → ✅ healthy `version=ae17ec6…` in 3 s |
| `scripts/deploy-hshi-u1.sh prod` (HEAD, dirty tracked files) | ✅ refused as designed |
| `scripts/deploy-hshi-u1.sh prod ae17ec6…` | ✅ healthy `env=production version=ae17ec6…` |
| Rollback test: broken release (fake sha `deadbeef…`, server throws on start) via `install-release.sh prod` | ❌ 1st: crash loop hit StartLimitBurst → rollback restart refused, prod down → fixed (`reset-failed` + health-check of previous) and restored prod; ✅ 2nd: exit 1, auto-rollback to ae17ec6, healthy; dev MainPID unchanged |
| `tailscale funnel --bg 3000` (timeout 20) | ❌ `Funnel is enabled, but the list of allowed nodes in the tailnet policy file does not include the one you are using.` + admin link; status still `No serve config` |
| `scripts/verify-public-endpoint.sh` (from Mac) | ❌ public DNS NXDOMAIN (Funnel inactive); ✅ funnel config never targets :3001; ✅ :3001 loopback-only; ✅ tailnet IP :3001 and :3000 refused |
| `curl` WS upgrade to `127.0.0.1:3000/verifyproc/verifyroom` on host | ✅ `HTTP/1.1 101 Switching Protocols` |
| `smoke-test.sh http://127.0.0.1:3001` (ae17ec6, stub API) | ✅ 5 pass, 2 pending (API 404), exit 3 |
| `pnpm exec tsc -p tests/tsconfig.json` | ✅ |
| `pnpm vitest run tests/` (1st, working tree with lobby-auth WIP) | ❌ 61 pass / 2 fail / 1 skip: (a) my XSS fixture was 25 chars (>24 limit) → fixed; (b) harness port race between parallel files (loser's health probe hit the winner's server) → fixed with per-launch version nonce |
| `pnpm vitest run tests/security/leakage.test.ts` | ❌ night-visit step: visit is presence-based (WorldModule stub) → split into its own test gated on world feature; ✅ 2 pass, 1 skip |
| `pnpm exec playwright install chromium` (no sudo) + `ldd` on both binaries | ✅ chromium-1243 + headless shell; all shared libs found (no `install-deps` needed) |
| `pnpm test:e2e` | ❌ 1st: client build failed (`./lobby.css` missing, lobby-auth mid-edit); ❌ 2nd: my selector ambiguous (host name in header) → scoped; ✅ 5/5 passed (accounts, create lobby, finder join w/ XSS-name literal, share-URL rejoin, member list + leave) |
| `pnpm test:load -- --lobbies 1 --players 5 --duration 10 --mode dist` | ❌ dist bundle: `Cannot find package 'livekit-server-sdk'` (not in @ct/server deps at that time; since fixed by lead) → ran `--mode source` ✅ |
| `scripts/backup-db.sh` on scratch HOME (WAL DB, 1000 rows) | ❌ exit 2 after a successful backup (`ls` glob + pipefail in retention) → fixed with `find`; ✅ 16 runs → 14 kept + 1 tagged, mode 600, restore = 1000 rows; `systemctl --user start clocktower-backup.service` → Result=success |
| `scripts/deploy-hshi-u1.sh dev` (f2dcfba) | ✅ migrations applied to `data/dev` only (prod data dir untouched), healthy in 6 s |
| `smoke-test.sh http://127.0.0.1:3001` (f2dcfba) | ✅ 16/16 pass (account, cookie HttpOnly, lobby, list, ticket, SSE, sign-out revocation) |
| `LOCAL_PORT=13001 scripts/dev.sh` + `smoke-test.sh http://localhost:13001 --no-lobby` (Mac, via SSH forward) | ✅ 12/12 pass |
| `scripts/deploy-hshi-u1.sh prod f2dcfba…` then again (reuse) | ✅ prod migrated its own DB; 2nd run reused release, took `predeploy` backup, healthy in 2 s; dev MainPID unchanged |
| `smoke-test.sh http://127.0.0.1:3000 --no-lobby` (on host) | ✅ all pass, `env=production` |
| `pnpm vitest run tests/` (final) | ✅ 11 files, **64 passed, 1 skipped** (night-visit secrecy: WorldModule pending) in ~70 s |
| `pnpm test:load -- --lobbies 2 --players 15 --duration 60` (dist) | ✅ 32 clients, 0 errors: server CPU avg 2.1% / max 4% of one core, RSS 222→252 MB, C2S 289 msg/s, S2C 426 msg/s, RTT p50 0.7 / p99 1.4 ms. ⚠ world snapshots empty (WorldModule stub) |
| `pnpm test:load -- --lobbies 4 --players 15 --duration 60` (dist) | ✅ 64 clients, 0 errors: CPU avg 3% / max 6%, RSS ~243 MB, C2S 573 msg/s, S2C 852 msg/s, 38 KB/s S2C, RTT p50 1.0 / p99 1.7 ms. ⚠ same caveat |

## 2026-10-14 — after qa-deploy (lead)

| Command | Result |
|---|---|
| `scripts/remote.sh pnpm build` | ✅ after fixing root build script (unquoted glob → `pnpm -r --if-present run build`) |
| `scripts/remote.sh pnpm vitest run` (all suites) | ✅ 27 files, 294 tests passed |

## 2026-10-15 — world-art integrated (lead)

| Command | Result |
|---|---|
| `scripts/remote.sh pnpm -r run typecheck` | ✅ all packages |
| `scripts/remote.sh pnpm vitest run` | ✅ 27 files, 294 tests (night-visit secrecy test now active with real WorldModule) |
| `scripts/remote.sh pnpm build` | ✅ client + server |
| world-art: Playwright 2-browser check vs test server :3320 (reported by teammate) | ✅ town renders, remote movement visible |

## 2026-10-15 — public ingress via Cloudflare Tunnel (lead)

Public URL: **https://clocktower.chrisshi.com** (Cloudflare Tunnel `clocktower`, id 42b1c7f4…, from
hshi-u1 → 127.0.0.1:3000 only). Funnel not used (tailnet policy approval not granted).

| Command | Result |
|---|---|
| cloudflared 2026.10.0 binary install on hshi-u1 (sha256 matched GitHub digest) | ✅ |
| `cloudflared tunnel create clocktower`; `tunnel route dns clocktower clocktower.chrisshi.com` | ✅ CNAME added |
| `cloudflared tunnel --config … ingress validate` / `ingress rule` | ✅ only clocktower.chrisshi.com → 127.0.0.1:3000; other hosts → 404 |
| `scripts/deploy-hshi-u1.sh prod c60ba22…` (after setting prod APP_PUBLIC_ORIGIN) | ✅ healthy; dev MainPID unchanged (3740957) |
| `systemctl --user enable --now clocktower-tunnel` | ✅ active, 4 QUIC connections (sjc) |
| From the Mac via Cloudflare edge (IPv4 pinned): `/healthz`, `/lobby/<id>` SPA, `/favicon.png`, unauthenticated `/api/lobbies` & `/api/admin/status` | ✅ 200 prod c60ba22 / 200 html / 200 png / 401 / 401; headers nosniff + DENY |
| First attempt from the Mac with system DNS | ❌ local Tailscale MagicDNS cached the pre-creation NXDOMAIN (only AAAA returned; no IPv6 route) — environment, not server |
| `nc -z 100.116.187.72 3001`; `ss -ltn` on hshi-u1 | ✅ dev not reachable on tailnet IP; 3000/3001 bound to 127.0.0.1 only |
| lobby.spec.ts against public URL | ❌ Node-side API helper hit the same stale-DNS IPv6-only answer (ENETUNREACH); browser steps passed |
| Throwaway public-check spec (2 Chromium contexts, IPv4 pinned via host-resolver-rules, real TLS/hostname) | ✅ accounts created; cookie Secure+HttpOnly+SameSite=Lax; lobby created; share URL `https://clocktower.chrisshi.com/lobby/…`; both browsers saw both members over WSS; movement; leave. Screenshot: docs/screenshots/public-waiting-room.png. Left 2 `verify-*` accounts in prod DB. |

## 2026-10-15 — real LiveKit Cloud (lead)

User stored prod credentials via `ssh -t hshi-u1 '~/clocktower/bin/set-livekit.sh prod'` (env file 0600; secret never printed). Dev not yet configured.

| Command | Result |
|---|---|
| `LIVEKIT_ROOM_PREFIX=livecheck tsx packages/voice/scripts/livekit-live-check.ts` (prod creds, isolated prefix) | ❌ 7/8: "token for room A is accepted" — script bug: `/rtc/v1/validate` answers a VALID token with 400 `join_request is required` and the script only fell back on 404 (probe: `/rtc/validate` → 200 success) |
| same after fixing endpoint order | ✅ 8/8: valid token accepted; token edited to room B → 401; wrong-secret token → 401; signalling join OK; participant listed in A only; `removeParticipant` disconnects (ws 1006) |
