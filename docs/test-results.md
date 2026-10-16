# Test results (executed commands only)

All commands run on **hshi-u1** via `scripts/remote.sh` unless stated otherwise.

## 2026-10-16 — local preview, room chat, walkable cottages, and doorway regression

Run on the editing Mac for the user's explicitly requested local preview. The documented SSH alias
and full hostname for hshi-u1 did not resolve. Native preview: `127.0.0.1:3002`, isolated `data/local`;
browser tests: throwaway server/database on `127.0.0.1:3398`. No shared deployment.

Commands below use Node 24.22.0 and pnpm 10.34.7 via
`npm exec --offline --cache /private/tmp/clocktower-npm-cache --yes --package=node@24 --package=pnpm@10.34.7 -- …`.
Playwright commands set `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/clocktower-browsers CT_E2E_NO_BUILD=1 E2E_VOICE=0`
and use `-c tests/e2e/playwright.config.ts`. Local socket/browser runs required sandbox escalation.

| Executed command | Result |
|---|---|
| `pnpm typecheck` | Passed all workspace packages. |
| `pnpm --filter @ct/client typecheck` | Passed after indoor scaling, bubble stacking, and door changes. |
| `pnpm exec tsc -p tests/tsconfig.json --noEmit` | Initial new-test import of `@ct/assets` failed root resolution; switched to the existing source-relative convention. Subsequent runs passed. |
| `pnpm build` | Passed, including repeated rebuilds to update the local preview. Existing Zod annotation and mixed static/dynamic VoiceClient import warnings remain. |
| `pnpm vitest run apps/server/test/room.test.ts apps/server/test/world.test.ts apps/server/test/world.stage.test.ts packages/assets/test/navigation.test.ts --maxWorkers=2` | 69 tests passed. Room suite could not bind port 3331 inside the sandbox; its 20 tests were skipped in this attempt. |
| `pnpm vitest run apps/server/test/room.test.ts --maxWorkers=1` (escalated) | 20 passed: includes waiting/day/finished chat audience isolation and existing spam limits. Total targeted unit/integration checks: 89 passed. |
| `pnpm exec playwright test … chat-bubbles` | Initial run lacked Chromium; installed into the temporary browser directory. Next run reached phone walking but hit an ambiguous Leave locator; scoped it to the cottage. A later run passed stacking/walking and failed a test assumption: forcing the first night yields `first_night`, not `night`; fixed the expectation. Subsequent runs passed. |
| `pnpm exec playwright test … chat-bubbles.spec.ts doors.spec.ts` | Chat test passed in both combined runs: independent five-second expiry, newest-three cap, escaped text, private waiting/night/finished chat, Storyteller replies, departure cleanup, keyboard and phone floor-tap walking, bubble bounds, no page errors. Door fixture failures described below. |
| `pnpm exec playwright test … doors.spec.ts` (initial iterations) | Reproduced the original trigger failure: feet 12px off-centre against the wall, still outdoors. Test setup then exposed seat-dependent stage-teleport offsets and the fountain blocking a straight approach to Ravenscroft. Switched to leaving onto the doorstep and moving sideways. A 30fps frame overshot the requested 10px offset to 15px; that also exposed the intermediate 16px trigger missing at the wall. Final trigger uses 20px, within the unchanged 22px server range. |
| `pnpm exec playwright test … chat-bubbles.spec.ts doors.spec.ts` (final build) | **2 passed, 52.5s.** Door coverage: Wychwood, Weaver’s House, Ravenscroft, centered and both off-center approaches, immediate leave/re-enter tap during cooldown, no door errors. Chat coverage above passed again, with desktop/phone screenshots inspected. |
| Collision probe via `pnpm exec tsx -e …`, then `node --import tsx --input-type=module -e …` | First attempt blocked by the sandbox's IPC restriction; loader form succeeded. Confirmed the fountain collision south of Ravenscroft, while the immediate doorstep is clear. |
| `/Users/isaacsun/.docker/bin/docker compose config --quiet` | Passed. Docker image/runtime not tested: CLI exists, Docker Desktop/daemon is unavailable on this Mac. Native preview runs successfully. |
| `curl --fail --silent http://127.0.0.1:3002/healthz` | Passed: development / local-preview / ok. |
| `git diff --check` | Passed. |

Existing chat/point/pin token-bucket limits were deliberately retained at the user's request.
The broader full-game/chaos/phone suites had their changed indoor controls/text expectations updated;
those full suites were not rerun in this session. LiveKit audio was not exercised.

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

## 2026-10-15 — host hardening applied (lead)

User ran `ssh -t hshi-u1 'sudo bash ~/clocktower/hardening/deploy/secure/setup-dedicated-user.sh --apply'` (dry run reviewed first).

| Check | Result |
|---|---|
| prod/dev/tunnel process identity (`/proc/<pid>/status`) | ✅ uid/gid 998 `clocktower`, Groups 998 only (no sudo/adm/lxd), CapEff 0, NoNewPrivs 1, Seccomp 2 |
| `systemd-analyze security` prod/dev/tunnel | ✅ 1.5 OK each (was 9.6 UNSAFE for the user unit) |
| `systemctl show clocktower-prod` | ✅ ProtectHome=yes, ProtectSystem=strict, RW only /srv/clocktower/data/prod, other env data/backups/env/tunnel creds inaccessible, MemoryMax 1.5G, CPU 300%, TasksMax 256 |
| /home/hshi 0750 hshi:hshi, ~/.ssh 0700 | ✅ uid 998 has no access even without the sandbox |
| listening ports | ✅ 3000/3001/20241 on 127.0.0.1 only |
| `sudo -n -l` as admin | ✅ NOPASSWD only for restart/stop/reset-failed of the 3 units + 2 backup units |
| public `https://clocktower.chrisshi.com/healthz` | ✅ |
| `scripts/deploy-hshi-u1.sh dev` (system mode) | ❌ first: sudo rule mismatch (`clocktower-dev` vs `clocktower-dev.service`) → fixed; ✅ 0d72569 healthy |
| `scripts/deploy-hshi-u1.sh prod 0d72569` | ✅ sandboxed pre-deploy backup ran (integrity ok), prod healthy, dev PID unchanged; admin cannot list /srv/clocktower/backups/prod (by design) |

## 2026-10-15 — qa-deploy round 2: M3 browser round, load with real world, public endpoint, resilience, soak, adversity

Everything below ran on hshi-u1 (test instances on 3350-3399 unless stated otherwise).

| Command | Result |
|---|---|
| `playwright test … m3-round` (6 Chromium contexts, built client, :3398) | ❌ 1st: per-IP sign-up limit (“Too many attempts”) — six browsers share 127.0.0.1 → each context now sends its own X-Forwarded-For; ❌ 2nd: 5th player’s first Ready click not acknowledged; ❌ 3rd: a “Raise hand” click arrived after the 1.5 s clock hand passed (button gone) → bounded clicks; ✅ 4th/5th: **all 15 steps pass, all UI-driven** (accounts, lobby, ready, start, random setup, first night, night isolation via frame decode, Visit, visited-only ST entity/“The Storyteller is in your home”, day, nominate, vote, execute→ghost with ghost vote, Good wins, reveal on all 6 clients, no ST-only fields). Ready diagnostic: `lobby:ready frames sent: 0` on the unacknowledged click (client-side) |
| `pnpm test:e2e` (lobby + m3) | ✅ 5/5 + 1/1 (run then stopped while it continued into teammates’ voice-live/ux specs) |
| `tests/load/inspect-snapshots.ts` (real WorldModule) | ✅ moves accepted, 0 corrections, 4 entities/snapshot |
| `pnpm test:load -- --lobbies 2 --players 15 --duration 120` (bots path-find + leave homes) | ✅ 32 clients, 0 errors/disconnects, 32/32 outdoors, 16 entities/snapshot, 0 corrections; server CPU avg 3.1% / max 11% of 1 core; RSS ~244-248 MB; C2S 320 msg/s, S2C 421 msg/s; **S2C 435 KB/s (3.56 Mbit/s), 13.6 KB/s per client**, p95 448 KB/s; RTT p50 0.5 / p99 3.1 ms |
| `pnpm test:load -- --lobbies 4 --players 15 --duration 120` | ✅ 64 clients, 0 errors; CPU avg 4.9% / max 13%; RSS ~248 MB; C2S 629 / S2C 842 msg/s; **S2C 869 KB/s (7.12 Mbit/s)**, p95 878; RTT p50 0.6 / p99 3.1 ms |
| `scripts/verify-public-endpoint.sh` (→ https://clocktower.chrisshi.com) | ✅ 0 failed / 1 skipped (Funnel) — DNS via 1.1.1.1, TLS (GTS WE1), healthz prod, SPA, headers at edge, WSS 101, dev not exposed. Re-run after host hardening (system units, live tunnel ingress from cloudflared /config) ✅ |
| `scripts/smoke-test.sh --no-lobby --expect-version c60ba22…` (public URL) | ✅ 12/12 (1 prod account) |
| ⚠ my cookie-name probe `curl -X POST 127.0.0.1:{3001,3000}/api/auth/create` | **mistake: created one stray account "x" on dev and one on PROD** (reported to lead for cleanup) |
| isolation re-check (env files, process environ, DB files, LiveKit presence) | ✅ separate; prod LiveKit set, dev not; all units enabled |
| `tests/integration/adversity.test.ts` (netem proxy: 150±50 ms, 3% stalls; races) | ❌ initial: flaky (WS 1006 / canStart timeouts). Root cause **in the harness**: proxy reordered TCP chunks (per-chunk setTimeout ties across timer buckets) — server logged “member joined” while the client socket errored. Fixed (FIFO queue); standalone repro 3/8 → 0/20 failures; latency test ✅ 10/10, network-drop ✅ 8/8, last-slot ✅ 5/5 (now judged from server state). Measured: RTT p50 ~335 ms, **~2.8% of valid moves corrected (rubber-banding) under loss stalls**, full drop → all reconnect to same seats in ~330 ms |
| `tests/integration/directory.test.ts` | ✅ 3/3 ×3: SSE latency 30-62 ms for leave/rejoin/start/night/day/finished/rematch/empty; stale-tab resync snapshot == list; heartbeat every 20 s; empty lobby removed after idle timeout (10.9 s at 10 s setting) |
| `tests/security/adversarial.test.ts` | ❌ initial: my bots auto-voted randomly; my ghost/nominee choice hit Imp/Virgin rules → fixed role selection + `confirm_result` handling; ✅ 7/7 ×5 (forged st:command, votes for other seats/double/after lock, one ghost vote, teleports + night exit, move flood, forged prompts, 9-player full game scan: no foreign character/alignment/poison/visit) |
| `tests/security/logs.test.ts` (fake LiveKit creds, full game) | ✅ no passphrases/session tokens/tickets/LiveKit tokens/secrets or player↔character ties in logs; 58 JSON lines, lobbyId on 46, pid on 39, **0 phase/nomination/ST-command lines** |
| `tests/load/soak.ts -- --minutes 30 --workers 3` | ✅ 531 cycles (389 games, 172 rematches, 141 switches, 142 drops), 1 failed cycle (5 s “finished” wait; pending-result handling added since); heap 38-91 MB oscillating, idle 64 → 36 MB; RSS idle 231 → 144 MB; fds 27 → 27; lobbies → 0. **No leak** |
| `tests/resilience/crash-restart.ts --mode test` (transient unit, SIGKILL) ×2 | ✅ ran: restart 2.5-2.8 s; browser “Connection lost — reconnecting…” ~60 s then “Your seat is kept … Reconnect” (lobby gone); bots 1006, reconnect “room disposed”, ticket 404, sessions valid; reload → “Lobby not found” |
| `… --mode dev` (`sudo -n systemctl restart clocktower-dev.service`) | ✅ ran: healthy in 1.9 s; close 4000; **browser shows no indication for 90 s** (dead game with live controls); reload → “Lobby not found” |
| `E2E_PUBLIC=1 E2E_TUNNEL_RESTART=1 playwright test` (public.spec, 2 prod accounts) | ✅ 4/4: secure context + getUserMedia, assets 200, `__Host-ct_session` Secure/HttpOnly/Lax/30 d, wss://clocktower.chrisshi.com, share-link join; tunnel restart (command blocked ~30 s) → both reconnected to the same seats ~36 s after start; both left, lobby 0/10 |
| final regression, current tree (after playtest 6e46820 / prod 7639655): `pnpm vitest run tests/` | ✅ 16 files passed + 1 skipped (not qa-owned); **100 passed, 1 skipped** |
| final regression: `playwright test lobby m3-round` | lobby ✅ 5/5. M3 ❌ ×2 under host load avg 28-35 (other agents’ headless Chromium runs): run 1 hit the 10-min test timeout (Ready alone 455 s); run 2 (20-min budget, smaller player viewports) passed accounts→lobby→ready→start→setup→first night→night isolation→Visit→visited-only secrecy→day→nomination, then failed at the vote tally (Raise-hand clicks slower than the 1.5 s/seat clock hand). M3 is **verified at c60ba22 (2 full passes), not re-verified at current HEAD**. Ready-click diagnostic recurred (3 players: 0 `lobby:ready` frames sent on first click) |

## 2026-10-15 — voice2 live LiveKit results (SIMULATED microphones; summary by lead)

All against a private test server (prefix `voicetest`), never dev/prod. Fake mic = speech-like WAV (Chromium) / built-in tone (Firefox). ✅ square, street falloff, square-boundary hysteresis (0 switches parked/jittering), building isolation, adjacent houses at night, ST visit privacy (third player never sees ST), 0 ms residual audio on room exit, revoked-token replay swept, cross-lobby token 401, quota counter, 10 simultaneous talkers (LiveKit "excellent"), device switch/refresh/permission-denied/no-mic recovery, Firefox. ❌/not run: WebKit (missing system libs), 15 talkers (budget), real network drop (Playwright offline only cuts signalling), any REAL microphone. Quota: 328 participant-minutes used (budget was 250).

## 2026-10-15 — core gameplay finalized (lead)

Commit **16042fe** (prod + dev). Verified on hshi-u1 against that exact commit (clean `git archive` tree):

| Check | Result |
|---|---|
| `pnpm -r run typecheck`, `pnpm -r --if-present run build` | ✅ |
| `pnpm vitest run` (all suites) | ✅ 533 passed, 4 skipped (art-dependent ambient/egg tests skip until the art overhaul lands) |
| e2e `game-full.spec.ts` (1 ST + 5 players, real UI: join → setup → walk home → night visits → walk out → gather/circle → early hands + vote clock → execution → ghost vote → overrides → pending result → Confirm → reveal → Play again) | ✅ all 30 steps, runs g2 + g3 (g1 failed on the test's keyboard walker; fixed) |
| e2e `game-chaos.spec.ts` (Ready mashing, duplicate tab, refreshes at bedtime/mid-prompt/mid-vote, tab closed during escort, ST refresh mid-visit, simultaneous nominations, out-of-order ST, wrong house, walking out at night) | ✅ all cases, runs h1 + h2 (h3: one test timeout on a CPU-starved page; check aligned to 60 s) |
| Night secrecy in decoded frames (no ST entity / visit cue / visiting flag for unvisited players) | ✅ |
| B1 (refresh mid-vote) | Root cause on this host: a CPU-starved software-rendered page stops reading its socket ~45 s; server watchdog never fired (0 warns/errors in all logs); client watchdog recovers. Single-browser: no freeze. |
| prod deploy 16042fe (active-game guard), public `/healthz`, SPA, `/internal/active-games` 404 via tunnel, `smoke-test.sh` public | ✅ |

## 2026-10-15 — v2 e2e (one-screen town, automatic doors, tap-a-cottage, roster, st-ui script panel) — e2e agent

All on hshi-u1 via `CT_AGENT=e2e scripts/remote.sh …`, throwaway server on 127.0.0.1:3398 (playwright webServer), ≤ 6 browser contexts per suite, one suite at a time. Client/server built from the working tree at HEAD **b83afac** (+ uncommitted test changes) at 15:10; earlier runs (marked †) used the 13:00 build of the pre-`7c4ec91` tree. The e2e server now gets **fake LiveKit credentials** (`tests/e2e/playwright.config.ts`, opt-out `E2E_VOICE=0`) so the real voice coordinator mints zone grants that specs decode (nobody connects).

What changed in the suites: `helpers.ts` (v2 sign-up picker "Choose your character"; camera-model tap helpers `tapCottage` / `tapLockedCottage` / `planCottageTap` mirroring TownScene's camera, every tap verified by its effect; `leaveByButton` / `leaveByKey`; `walkIntoDoor` (keyboard + automatic door, no E); frame-precise fine positioning `holdFrames` for 150 px/s; `voiceZone` / `zonesGranted`; `storytellerToolsMode` / `stPanelMode` for the st-ui panel), `game-full`, `game-chaos`, `lobby`, `ux-walkthrough` updated, new `v2-phone.spec.ts`.

| Command | Result |
|---|---|
| `playwright test … v2-phone` † (×3) | ❌ 1: strict-mode locator (portrait canvas also has `data-cast`) — test bug, fixed; ❌ 2: `tap()` on an `aria-disabled` taken tile waits forever (no actionTimeout) — fixed (force tap + `actionTimeout`); ✅ 3 (3.5 min) |
| `playwright test … game-full` † GAME_RUN=v2a | ❌ keyboard walker oscillated ±37 px around the door (Playwright key press lasts several frames on the starved page at 150 px/s) — harness fixed (`holdFrames`) |
| `playwright test … game-full` † GAME_RUN=v2b | ✅ all 31 steps (14.5 min) |
| `playwright test … game-chaos` † GAME_RUN=v2c | ✅ all 13 cases (13.6 min) |
| `playwright test … lobby ux-ready` † | lobby ❌ new roster test (bug B1 below); ux-ready ✅ (4.0 min) |
| `playwright test … ux-walkthrough` † | ❌ hung 30 min at the signed-out deep link: landing now shows "You've been invited / Join the game" (no "Create account") and the config has no actionTimeout — test fixed; run killed (also starved by a concurrent social-client suite) |
| `pnpm -r --if-present run build` (15:10, b83afac) | ✅ |
| `playwright test … v2-phone` | ✅ (3.6 min): portrait + landscape sign-up/pick, lobby re-pick, duplicate pick reassigned (picked `mole` → given `snail`), taken tile "taken by Pia", tap own cottage → in (5.2 s), **side cottage off-screen in portrait → 2 ground taps → cottage tap → in**, Leave button fits + not covered (portrait 140×40 at y 783; landscape at y 319), rotation while inside, two phones inside one cottage = `bld:house-1` zone, filler outdoors = `square` and never granted `bld:house-1` |
| `playwright test … game-full` GAME_RUN=v2d | ✅ 31 steps + soft notebook/story smoke (11.2 min). Random deal had no first-night info step → info via Grimoire fallback |
| `playwright test … game-chaos` GAME_RUN=v2e | ✅ 13/13 (5.2 min); N1: Leave disabled "You stay home until morning", arrow key sends nothing, injected `world:useDoor` → "You must stay home until morning." |
| `playwright test … lobby ux-ready` | lobby 5/6 ✅, ❌ `v2 roster … Storyteller's pick blocks nobody` (**bug B1**: "Greenting, UCT mascot, taken by Carol o8fkj"); ux-ready ✅ (2.1 min) |
| `playwright test … ux-walkthrough` (ux3) | ❌ "Begin first night" no longer exists → phases now via the script cues; ❌ (ux3) "Good wins" now asks to confirm → handled |
| `playwright test … game-full` GAME_RUN=v2f | ✅ (10.3 min) incl. **script panel night**: re-deal ("↻ Deal again") until the first night has Tell + Ask; ST clicks a cottage on the map (teleport_self, 1.1 s) → row "you are here" → **Tell them**; Leave button; **Go** + **Ask:** for the Fortune Teller; answer shown in the row; notebook (N) autosave/reopen, note never in another client's frames; ST Story panel; players have no pamphlets button |
| `playwright test … ux-walkthrough` (ux4, ux5) | ux4 ❌ "Joining lobby…" > 10 s for a player moving to a second lobby on the loaded host (timeout raised to 60 s, as elsewhere); ux5 ✅ (7.4 min): v2 home picker, inside panel + Leave (desktop + phone), joystick after leaving (6 move frames, +60 px), reconnect banner, script cues for night/dawn/day, endgame confirm; **0 overlay overlaps, 0 console/CSP errors**; ≤ 6 contexts (decoy/ST/phone/late closed when done). Screenshots `test-results/ux/v2/` |

Game-full v2 coverage (decoded frames + UI): tap own cottage at bedtime (walk + `world:useDoor`, only door/correction teleports); keyboard walk INTO the doorway (no E); escorts; ST click-to-teleport visit with `storyteller` teleport reason; unvisited players see no ST entity / cue / flag; Leave button and arrow-key leave at dawn; **private talk**: guest taps host's cottage, both granted `bld:<house>` zone, outsider stays `square`, never granted it, sees neither entity, and the door board (doorTags) lists both; votes/ghost vote/undo; ST teleport into a cottage; door lock → Leave disabled "… is locked by the Storyteller", arrow key sends nothing, injected door request refused with toast; an outdoors player tapping the locked cottage walks to it and gets the message, stays out; freeze; force night; endgame; rematch; no ST-only keys in any player frame.

Bugs found (details in the e2e report): B1 roster picker greys out the Storyteller's character (client `takenBy` ≠ server rule); B2 script panel says "✓ Every visit is done." while a visit is still open (1/2 done); B3 phone landscape: joystick overlaps the Chat button, lobby chat covers the movement hint, waiting-room picker clipped; B4 inside panel covers the occupants on short screens (720×450, 844×390) and the bedtime "You are home" compass; occupants' name labels overlap; B5 engine "Game end detected … Confirm" alert still shown after the result was confirmed; B6 Story labels the pre-first-night bedtime "Day 0". Screenshots: `docs/screenshots/v2-e2e-*.png`; step logs `tests/e2e/artifacts/game-full-steps-v2{b,d,f}.json`, `game-chaos-v2{c,e}.json`.

### 2026-10-15 (later) — e2e helpers on the camera hook; runs on e5d31ef (e2e agent)

`tests/e2e/helpers.ts` now taps through the client's opt-in camera hook (`localStorage ct.debug.camera = '1'` set by `installSocketTap` → `window.__ctCamera.worldToScreen / view`); `outdoorCamera` remains only as a fallback (updated to the v2.1 SQUARE_VIEW maths); `settle` waits for `view()` to stop moving. `v2-social.spec.ts` `toScreen` switched to the hook too. `pnpm exec tsc -p tests/tsconfig.json --noEmit` ✅ (0 errors).

Clean `git archive e5d31ef` + the new helpers.ts (sandbox `e2e-head`), build ✅:

| Suite | Result |
|---|---|
| `v2-phone` | ❌ landscape: the open lobby chat (`.ct-chat-list` / chat input) intercepted the tap on "Change character…" in the waiting-room sheet (real bug; lead fixed in 9fd63ec — not re-run here at the lead's request) |
| `game-full` GAME_RUN=h1 | ✅ (12.3 min); every tap resolved through the hook (0 "no camera hook" fallbacks in `game-full-steps-h1.json`) |
| `lobby` | ✅ 6/6 — the roster test now passes (B1 fixed: the Storyteller's character is no longer shown as taken) |
