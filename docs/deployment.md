# Deployment — dev + prod on the host

_Document owner: qa-deploy. Since 2026-10-14 (evening) the deploy tooling is **lead-owned**:
`deploy/**`, `scripts/deploy-hshi-u1.sh`, `scripts/setup-hshi-u1.sh`, `scripts/backup-db.sh`. Those
parts are described here from the lead's scripts and units. qa-deploy owns and has run everything
marked **(tested)**. Executed commands and results are in `docs/test-results.md`._

## Topology

```
friends' browsers ─HTTPS/WSS─▶ Cloudflare edge ─▶ cloudflared (clocktower-tunnel, outbound only) ─▶ 127.0.0.1:3000  clocktower-prod
developer ─ssh -L 3001──────────────────────────────────────────────────────────────────────────▶ 127.0.0.1:3001  clocktower-dev
all browsers ─WebRTC─▶ LiveKit Cloud (never through the tunnel)
```

- Public URL: **https://clocktower.chrisshi.com**. Cloudflare terminates TLS (Google Trust Services
  certificate for `chrisshi.com`). The tunnel is outbound-only, so the host opens no inbound ports.
- Tailscale Funnel is **not used**. Its `funnel` node attribute was never granted. `verify-public-endpoint.sh`
  checks Funnel only if `tailscale funnel status` is non-empty.
- Both app services bind **127.0.0.1 only**. The tunnel ingress routes only `clocktower.chrisshi.com` →
  `http://127.0.0.1:3000`, and everything else gets `http_status:404` **(tested, live config)**.

## Layout and units (lead, hardened 2026-10-14)

| What | Where |
|---|---|
| Runtime root | `/srv/clocktower` (`releases/<sha>`, `prod` → release symlink, `dev/`, `node/`, `bin/cloudflared`) |
| Data / backups | `/srv/clocktower/data/{dev,prod}`, `/srv/clocktower/backups` (owned by `clocktower`, mode 700; the admin user cannot read them) |
| Env files | `/srv/clocktower/env/{dev,prod}.env` (read by systemd before dropping privileges) |
| Tunnel config | `/srv/clocktower/cloudflared/clocktower.yml` + credentials JSON (owned by `clocktower`) |
| Units | **system** units `clocktower-prod.service`, `clocktower-dev.service`, `clocktower-tunnel.service`, `clocktower-backup-prod.timer` (sources in `deploy/system/`) running as the unprivileged `clocktower` user under a systemd sandbox (`ProtectSystem=strict`, `ProtectHome`, no capabilities, …) |
| Admin control | `sudo -n /usr/bin/systemctl restart\|stop\|reset-failed clocktower-{prod,dev}.service`, `restart\|reset-failed clocktower-tunnel.service`, `start clocktower-backup-{prod,dev}.service` (NOPASSWD rule `deploy/secure/clocktower-deploy.sudoers`) |
| Logs | `journalctl -u clocktower-prod -f -o cat` (the admin user is in group `adm`). After `deploy/secure/v2.3/ops/apply.sh` the units log into their own namespace (14-day retention): add `--namespace=clocktower`. |
| Legacy | `~/clocktower` + `systemd --user` units (`deploy/systemd/`), kept only for `deploy/secure/rollback-to-user-units.sh` |

Verified 2026-10-14 **(tested)**:
- `systemctl is-enabled` → enabled for prod, dev, tunnel and backup timer, all `WantedBy=multi-user.target`, so they start at boot without a login. The tunnel unit is `After=clocktower-prod.service`.
- Isolation: separate env files (600), distinct `SESSION_SECRET`/`PASSPHRASE_PEPPER`, separate DB files, `APP_ENV`/`PORT`/`DATABASE_URL`/`LIVEKIT_ROOM_PREFIX` pinned per unit (checked in the running processes' environments). LiveKit is configured on prod only (dev voice is off).
- Cookie names differ: prod is `__Host-ct_session` (Secure, HttpOnly, SameSite=Lax, Path=/, host-only), dev `ct_session_dev`.

## Deploy / rollback (lead-owned scripts)

```bash
scripts/deploy-hshi-u1.sh dev  [<commit>]
scripts/deploy-hshi-u1.sh prod [<commit>]      # HEAD refused if tracked files are dirty; explicit sha always allowed
scripts/deploy-hshi-u1.sh prod <previous-sha>  # rollback (reuses releases/<sha>)
```
In system mode, `install-release.sh` builds into `/srv/clocktower`, restarts only that unit via the sudo rule,
health-checks `/healthz` for the commit's version, and rolls back on failure. qa-deploy validated the
pipeline (including automatic rollback from a deliberately broken release) on the legacy user units
earlier on 2026-10-14. The system-mode path is the lead's.

## HTTP caching and old chunks across deploys (v2.2 WP6)

Origin `Cache-Control` (set in `apps/server/src/app.ts`; Cloudflare keeps an origin TTL that is longer than its own 4 h):

| Path | Cache-Control |
|---|---|
| `/assets/*` (Vite output, content-hashed names) | `public, max-age=31536000, immutable` |
| other files from `public/` (`/landing`, `/audio`, `/tutorial`, `/art`, `/favicon.png`) | `public, max-age=86400, stale-while-revalidate=604800` (ETag revalidation) |
| `*.json` manifests, `/index.html`, SPA navigations (`/`, `/lobby/<id>`, `/admin`) | `no-cache` |
| missing files (any path with an extension, anything under `/assets/`, non-HTML `Accept`) | **404** `text/plain`, `no-store`. The SPA shell is never sent for these. |
| `/api/*`, `/healthz`, `/internal/*`, `/matchmake`, WebSocket upgrades | unchanged: never get a cacheable lifetime (API routes send `no-store`) |

The SPA fallback only answers navigations: `GET`/`HEAD`, no file extension, not under `/assets/`, and an
`Accept` that allows HTML. That includes `*/*`, so curl and link previews still get the shell.

**Old chunks survive one deploy.** A tab opened before a deploy keeps the old `index.html`. It may lazy-load
`TownGame-<oldhash>.js`, `IntroTour-…` or `VoiceEngine-…` later. `scripts/deploy-hshi-u1.sh` therefore
handles the previous release's hashed assets in three steps, all on the host:
1. `carry_assets snapshot`, before the deploy, stages the live tree's **own** `apps/client/dist/assets/*` in
   `~/clocktower/incoming/carry-assets-<env>-<sha>/`.
2. `carry_assets merge`, after a **successful** deploy, copies the staged files into the new live tree's
   `dist/assets/`:
   - it never overwrites a file (a file with the same name has the same content);
   - it temporarily lifts the release's read-only bit and restores it afterwards;
   - before its first merge, it records the tree's own files in `dist/.own-assets`. Dotfiles are never
     served. Because only own files are carried, an old chunk lives exactly one more release.
3. `carry_assets discard`, after a failed or rolled-back deploy, deletes the staging directory. The live tree
   is not touched.

The steps are best effort: a failure only prints a warning and never changes the deploy's exit status.
They are idempotent, so a re-run or a redeploy of the same commit adds nothing. A rollback with
`deploy prod <older-sha>` works the same way: the older release gains the newer release's own files.

The merge runs right after the restart and health check, so there is a window of a few seconds in which an old chunk can 404. The 404 is `no-store`, so the edge does not cache it. The prod guard refuses
deploys while games are running, so few tabs request chunks in that window. Removing the window would need a
pre-restart hook in `deploy/bin/install-release.sh`.

The carry-over was tested in isolation on the host, on temp dirs with no services involved. The function
text was produced by the Mac's bash, exactly as the deploy produces it, and all 21 checks passed. They
cover the first deploy (no manifest), idempotent re-runs, expiry after one release, a failed deploy, the
auto-rollback guard, a rollback deploy, the dev tree and the no-live-tree case. The harness was handed to
the lead/qa-deploy with the WP6 report, for `tests/`.

Check on prod after a deploy:
```bash
IP=$(dig +short @1.1.1.1 clocktower.chrisshi.com A | head -1)
curl -sI --resolve clocktower.chrisshi.com:443:$IP https://clocktower.chrisshi.com/assets/<file> | grep -iE 'cache-control|cf-cache-status'
curl -sI --resolve clocktower.chrisshi.com:443:$IP https://clocktower.chrisshi.com/assets/missing-x.js | head -1   # 404
```

## Private dev access **(tested)**

```bash
scripts/dev.sh                    # ssh -N -L 3001:127.0.0.1:3001 <host> → http://localhost:3001/
LOCAL_PORT=13001 scripts/dev.sh
scripts/dev.sh --status | --logs  # auto-detects system vs --user units (CT_SYSTEMD_SCOPE=system|user|auto)
```

## Verification scripts **(tested)**

```bash
scripts/verify-public-endpoint.sh [url] [--expect-version <sha>] [--resolver 8.8.8.8]
scripts/smoke-test.sh [url] [--no-lobby] [--expect-version <sha>]     # default url: $CT_PUBLIC_URL or https://clocktower.chrisshi.com
ssh <host> 'bash -s http://127.0.0.1:3001' < scripts/smoke-test.sh   # dev, on the host
```
- **Name resolution:** both scripts resolve the public hostname through public DNS (`dig @1.1.1.1`, falling back to 8.8.8.8) and pin it with `curl --resolve`. They print the resolver used. The host's own resolver (MagicDNS) cached a pre-creation NXDOMAIN and AAAA-only answers.
- **`verify-public-endpoint.sh` checks:** public DNS; TLS validity, subject and issuer; `/healthz` (env=production, and the version if given); the SPA shell; security headers surviving the edge (nosniff, X-Frame-Options); a WSS upgrade to 101 on the Colyseus path; and that `https://host:3001` isn't served and the public host never answers `env=development`.
- **It also checks dev isn't exposed:** it reads the **live** tunnel ingress from cloudflared's loopback metrics endpoint (`/config`, address taken from the unit's `--metrics`) and requires that it targets only :3000 and never :3001. If that endpoint is unreachable it reads the unit's own `--config` file if readable, and otherwise SKIPs; it never falls back to a stale file elsewhere. Further checks: `tailscale serve/funnel` never targets :3001; :3000 and :3001 are bound to 127.0.0.1 only; both are refused on the tailnet IP.
- **Unit scope:** `CT_SYSTEMD_SCOPE=system|user|auto` (auto = the system unit if present).
- **`smoke-test.sh` creates an account:** there is no delete API. On prod, run it at most once per deploy and always with `--no-lobby`.

## Public endpoint behaviour (measured 2026-10-14) **(tested)**

- Real Chromium on the host via the public URL (`E2E_PUBLIC=1 … playwright test`, `tests/e2e/public.spec.ts`, 2 accounts):
  - HTTPS and a secure context, so `navigator.mediaDevices.getUserMedia` is available;
  - static assets 200;
  - game socket `wss://clocktower.chrisshi.com/<process>/<room>`;
  - create and share-link join both work.
- **Tunnel restart** (`sudo -n systemctl restart clocktower-tunnel.service`) with two players connected:
  - the restart command itself blocks ~30 s, which looks like cloudflared's shutdown grace period;
  - both players reconnected to the **same seats** ~36 s after the restart began, about 6 s after the tunnel was back;
  - the lobby was intact afterwards and no error was visible to the players.
- **Bandwidth to plan for** (`tests/load`, real world module, WebSocket payload only):
  - about **13.6 KB/s server→client per connected player**;
  - 2 full lobbies (32 clients) ≈ 435 KB/s (3.6 Mbit/s);
  - 4 lobbies ≈ 869 KB/s (7.1 Mbit/s);
  - client→server ≈ 0.45 KB/s per player.

  Voice goes to LiveKit and is not included.

## Crash / restart behaviour (measured 2026-10-14) **(tested)**

| Event | Server | What players see |
|---|---|---|
| `kill -9` of the node process (test instance as a transient unit, Restart=always) | back in ~2.5 s | ~60 s of "Connection lost — reconnecting…" (the server is healthy, but the lobby no longer exists), then **"Connection lost. Your seat is kept for a while. Reconnect"**, which is misleading. Reload: "Lobby not found". Sessions survive, so nobody has to sign in again. In-memory games are lost. |
| `sudo systemctl restart clocktower-dev.service` (graceful; clients get close code 4000) | back in ~1.9 s | **No indication at all**: the dead game stays on screen with live-looking controls (screenshot `tests/e2e/artifacts/crash-dev-4-plus90s.png`). Reload: "Lobby not found". |
| Network drop of every socket (test proxy) | — | All clients reconnect to the same seats in ~330 ms |

Restarting prod during a game ends every running game, and the UI does not explain why. Avoid restarting
during game nights. Reported to the lead as a client bug.

## Backups and restore (v2.3 OPS-3/4, sec-ops)

- **Schedule.** `clocktower-backup-prod.timer` runs the sandboxed `clocktower-backup-prod.service` daily at 04:17 (±10 min, `Persistent=true`). Run it by hand: `sudo -n /usr/bin/systemctl start clocktower-backup-prod.service`. dev has no timer (`… start clocktower-backup-dev.service` by hand).
- **What.** An online SQLite backup API copy (WAL-safe), checked with `integrity_check`, gzip-9, mode 0600 in `/srv/clocktower/backups/<env>/` (0700, readable only by the service user).
- **Retention.** Daily backups are kept 30 days (at least 3). Pre-deploy backups are tagged (`…Z-predeploy.db.gz`) by `clocktower-backup-prod-predeploy.service` and kept separately: newest 10, at most 30 days. Override with `BACKUP_KEEP_DAYS`.
- **Status.** Each run writes `data/<env>/.last-backup` (`ok <file> <bytes>` or `failed …`). The admin console shows it under Safety → "Last database backup". A failed run also logs a CRITICAL entry through `clocktower-ops-alert@.service`; check with `journalctl -p crit -t clocktower-alert`.
- **Not in the backup.** `/srv/clocktower/env/<env>.env`. **Its `PASSPHRASE_PEPPER` is required to restore.** With a different pepper nobody can sign in with their passphrase (measured: existing sessions 200, sign-in 401). Keep a copy of both env files in a password manager.
- **Not off-host.** Backups sit on the same disk as the live DB. An encrypted off-host copy needs the user to pick a destination; see docs/security-v2.3/07-ops-incident.md, "Needs the user".
- **Install the v2.3 pieces** (pre-deploy unit, marker, alert, retention, journald namespace, sudoers). This needs sudo and is not done by the deploy:
  1. Preview: `bash deploy/secure/v2.3/ops/apply.sh`
  2. Apply: `sudo bash deploy/secure/v2.3/ops/apply.sh --apply`

**Restore** (root; only the service user can read backups and data). Check first, then apply:

```bash
sudo ls -lt /srv/clocktower/backups/prod | head                                   # R1 pick a file
sudo bash deploy/bin/restore-db.sh prod /srv/clocktower/backups/prod/<file>.db.gz          # R2 dry run: integrity, schema, accounts
sudo bash deploy/bin/restore-db.sh prod /srv/clocktower/backups/prod/<file>.db.gz --apply  # R3-R7
```

What `--apply` does, in order:
1. Refuses while a game is running.
2. Stops the unit.
3. Moves `clocktower.db` **and its `-wal`/`-shm`** into `data/prod/pre-restore-<UTC>/`. A stale WAL would be replayed onto the restored file.
4. Installs the backup with mode 0600.
5. Starts the unit and waits for `/healthz`. Migrations up to the running release run at start.

To undo, stop the unit, move the files in `pre-restore-<UTC>/` back, and restart it.

**Measured** on a throwaway DB (`tests/security/ops-restore-drill.test.ts`): backup while serving ≈ 40 ms; restore plus boot to healthy ≈ 1-1.5 s. An older-schema backup is upgraded at start.

**Panic runbook** (disable sign-ups, maintenance, close lobbies, suspend, block a network, sign everyone out, voice off, go dark, rotate secrets): docs/security-v2.3/07-ops-incident.md, "Panic runbook".

## Security & limits settings (v2.3, sec-ops)

Every security, abuse and cost knob is in one registry (`apps/server/src/settings/{registry,defs}.ts`). Admin console → **Security & limits**, grouped as:
- Sign-ups & accounts
- Sessions & admin
- Abuse protection
- Voice & cost
- Chat & moderation
- Browser hardening

**Where values live and when they apply**
- Values are stored in the DB (`ops_flags` rows `setting:<id>`), so they survive restarts and are included in backups.
- They apply at once, except keys marked "after restart": rate limits, the scrypt gate, session lifetimes.

**What the admin page enforces**
- Every change is admin-only and rate-limited.
- Every change is audited as `setting.change {id, from, to}`. Sensitive keys (the invite code, the alert webhook) are never shown again or audited.
- Dangerous keys need the admin's passphrase (step-up). These include Trusted Types, socket budgets, voice minutes/caps and session lifetimes.

**Env overrides.** An env var named by a setting wins and shows as "locked by server config". The vars are:
- `OPS_SIGNUP_MODE`, `OPS_SIGNUP_CODE`, `OPS_MAINTENANCE`, `OPS_MAINTENANCE_MESSAGE`
- `SESSION_MAX_DAYS`, `SESSION_TTL_DAYS`
- `VOICE_MONTHLY_MINUTES`, `VOICE_MAX_*`, `VOICE_IDLE_MIN`, `VOICE_WAITING_MAX_MIN`, `VOICE_RECONCILE_SEC`, `VOICE_ALERT_WEBHOOK`
- `VOICE_DISABLED` locks voice off.

To give control back to the console, remove the line from `/srv/clocktower/env/prod.env` and restart.

**Fail closed.** If the DB cannot be read, every key takes its SAFE value: voice off, protections on. The page then shows a red banner.

**Not settable by design:**
- per-player secrecy of game state
- the authentication and admin checks on `/api/admin`
- the CSRF / content-type guard
- server-side validation

**Panic tab** (fast switches, no passphrase): sign-up mode / invite code, maintenance, voice off, close all lobbies, sign everyone out, blocked networks, and the last database backup.

## LiveKit

Prod has `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` set (presence checked only, never printed).
Dev has none. Rooms are namespaced `prod-…` / `dev-…`. The lead's `deploy/bin/set-livekit.sh` sets the credentials.

## Tests and load (run on the host via scripts/remote.sh) **(tested)**

```bash
CT_AGENT=qa scripts/remote.sh pnpm vitest run tests/            # integration + security (one real server per file, ports 3350-3389)
CT_AGENT=qa scripts/remote.sh pnpm exec playwright test -c tests/e2e/playwright.config.ts lobby m3-round
CT_AGENT=qa scripts/remote.sh bash -c 'pnpm --filter @ct/server --filter @ct/client build && pnpm test:load -- --lobbies 2 --players 15 --duration 120'
CT_AGENT=qa-soak scripts/remote.sh pnpm exec tsx tests/load/soak.ts -- --minutes 30
CT_AGENT=qa scripts/remote.sh pnpm exec tsx tests/resilience/crash-restart.ts -- --mode test   # or --mode dev (restarts dev!)
CT_AGENT=qa scripts/pull.sh tests/load/results tests/e2e/artifacts tests/resilience/results     # pull BEFORE the next sync: remote.sh --delete wipes un-pulled results
```
Use a separate `CT_AGENT` sandbox for long runs. A sync into the same sandbox deletes files that exist
only remotely.

## Troubleshooting

| Symptom | Check |
|---|---|
| Public URL fails only from the host | The local resolver has a stale cache. Resolve with `dig @1.1.1.1` and pin it (the scripts do this; Chromium needs `--host-resolver-rules`). |
| Players report "Connection lost — reconnecting…" forever after a deploy | The server restarted, so in-memory lobbies are gone. Players must go back to the lobby list. |
| `lobby_limit` when creating | Since the playtest changes (per the lead; not re-measured by qa on prod): 1 active lobby per account and 2 per IP, and empty lobbies close after 2 min outside a running game. |
| Logs | `journalctl -u clocktower-prod --since "1 hour ago" -o cat`. They are JSON lines with lobbyId/pid on lifecycle events (create, join/leave, game started, match recorded), but there are no lines for phase changes or rejected actions. |
