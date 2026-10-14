# Deployment — dev + prod on hshi-u1

_Owner: qa-deploy. Every command below was run on 2026-10-14 unless marked **(not yet run)**; results are in
`docs/test-results.md`._

## Topology

```
friends' browsers ─HTTPS/WSS─▶ Tailscale Funnel (hshi-u1:443) ─▶ 127.0.0.1:3000  clocktower-prod  (systemd --user)
developer ─ssh -L 3001─────────────────────────────────────────▶ 127.0.0.1:3001  clocktower-dev   (systemd --user)
all browsers ─WebRTC─▶ LiveKit Cloud (never through Funnel)
```

Both services bind **127.0.0.1 only**. Funnel forwards only to :3000. The Mac and `hshi` never run the app.

## Layout on hshi-u1

| Path | Purpose |
|---|---|
| `~/clocktower/env.sh` | puts Node 24 (`~/.local/share/node`) + pnpm on PATH (lead) |
| `~/clocktower/releases/<sha>/` | immutable prod builds (source + node_modules + dist); newest 5 kept, plus current/previous |
| `~/clocktower/prod` → `releases/<sha>` | symlink switched atomically (`ln -sfn` + `mv -T`) |
| `~/clocktower/releases/DEPLOY_LOG` | one line per prod deploy / failed deploy + rollback |
| `~/clocktower/dev/` | dev build (replaced on every dev deploy; previous tree kept until healthy) |
| `~/clocktower/env/{dev,prod}.env` | chmod 600; secrets generated **on hshi-u1** with `openssl rand -hex 32` |
| `~/clocktower/data/{dev,prod}/clocktower.db` | SQLite (WAL), dir 700, files 600 |
| `~/clocktower/backups/prod/` | gzip'd online backups (14 daily + 10 tagged, e.g. `predeploy`) |
| `~/clocktower/logs/{dev,prod}` | `LOG_DIR` (the app logs JSON lines to stdout → journald) |
| `~/clocktower/bin/{backup-db.sh,install-release.sh}` | host-side scripts installed by setup |
| `~/clocktower/work/<agent>/` | agent test sandboxes (`scripts/remote.sh`), unrelated to the services |
| `~/.config/systemd/user/clocktower-{dev,prod}.service`, `clocktower-backup.{service,timer}` | units (source: `deploy/systemd/`) |

## Units

`deploy/systemd/clocktower-{dev,prod}.service` are `systemd --user` units:
`WorkingDirectory=%h/clocktower/{dev,prod}`, `EnvironmentFile=%h/clocktower/env/<env>.env` plus the release's
`.release.env` (`CT_VERSION=<git sha>`), `ExecStart=… node --enable-source-maps apps/server/dist/server.js`,
`Restart=on-failure`, stdout/stderr → journald, `MemoryHigh/MemoryMax` (dev 1G/1.5G, prod 1.5G/2G; the memory
cgroup controller is delegated to the user manager on hshi-u1, verified via `systemctl --user show -p MemoryMax`),
`TasksMax=512`, `NoNewPrivileges=yes`, `UMask=0077`.

**Isolation is pinned in the unit, not only in the env file:** `APP_ENV`, `HOST=127.0.0.1`, `PORT`,
`DATABASE_URL`, `LIVEKIT_ROOM_PREFIX` and `LOG_DIR` are set on the `ExecStart` command line, so a mistake in an env
file cannot make dev use prod's port, DB or voice namespace (or vice versa). Cookie names differ by `APP_ENV`
(`ct_session` vs `ct_session_dev`), which matters because browsers do not isolate cookies by port on `localhost`.

## One-time setup

```bash
scripts/setup-hshi-u1.sh
```

Copies `deploy/` to hshi-u1 and runs `deploy/bin/bootstrap.sh` there. It is safe to re-run: it creates the
directory layout, creates or completes `env/{dev,prod}.env` (it only appends missing keys and never prints or
overwrites values), checks that dev and prod secrets differ, installs and enables the units and the backup timer,
and runs `daemon-reload`. It never restarts the app services.

### Needs the user (sudo / admin console) — status 2026-10-14

| Action | Why | Status |
|---|---|---|
| `sudo loginctl enable-linger hshi` | user services start at boot and survive logout | **not done** (`Linger=no`). Services currently run because hshi has a GNOME session on seat0. They will not start after a reboot until someone logs in. |
| Allow Funnel for this node: open the link printed by `tailscale funnel --bg 3000` (`https://login.tailscale.com/f/funnel?node=<node-id>`), or add the `funnel` nodeAttr for hshi-u1 to the tailnet policy file | Funnel is enabled for the tailnet but hshi-u1 is not in the allowed node list | **not done** (exact CLI message recorded below) |
| `sudo tailscale set --operator=hshi` | lets `hshi` change serve/funnel config without sudo | **not done** (`tailscale debug prefs` shows no OperatorUser). Not hit yet because the policy check fails first; it will probably be needed after the policy fix. |
| LiveKit Cloud project + API key/secret → `LIVEKIT_URL/KEY/SECRET` in `~/clocktower/env/{dev,prod}.env` | voice | not done; voice reports `voice:unavailable` (not_configured) |

## Deploy

```bash
scripts/deploy-hshi-u1.sh dev            # HEAD → dev  (any tree state; deploys the commit, not the working tree)
scripts/deploy-hshi-u1.sh dev <commit>
scripts/deploy-hshi-u1.sh prod           # HEAD → prod; refused if tracked files have uncommitted changes
scripts/deploy-hshi-u1.sh prod <sha>     # exactly that commit (always allowed)
```

What it does:
1. On the Mac it runs `git archive <sha>` (only committed content) and copies the tarball to `hshi-u1:~/clocktower/incoming/`.
2. It streams `deploy/bin/install-release.sh` over `ssh hshi-u1 bash -s`, which then:
   - **prod:** extracts to `releases/<sha>` (or reuses it if already built), runs `pnpm install --frozen-lockfile` (never falls back) and `pnpm -r --if-present run build`. It backs up the prod DB (`predeploy` tag), runs `pnpm db:migrate` with **prod's** env and DB path, switches the `prod` symlink atomically, runs `reset-failed` + restarts **only** `clocktower-prod`, then polls `/healthz` for up to 40 s until it reports `version == <sha>`. On failure it switches the symlink back, clears the start-rate limit, restarts and health-checks the previous version, and exits 1.
   - **dev:** extracts to `dev.new`, installs (`--frozen-lockfile`, falling back to `--no-frozen-lockfile` for dev only), builds, migrates the dev DB, swaps `dev.new` → `dev` (keeping `dev.old`), restarts **only** `clocktower-dev`, and health-checks. On failure it restores `dev.old`.
3. It prints `systemctl --user is-active` and `/healthz` for that environment.

A prod deploy never touches dev (verified: dev `MainPID` was unchanged across 4 prod deploys, including a failed one), and dev deploys never touch prod.

A full deploy takes about 6 s (pnpm store warm). Redeploying an already-built prod sha takes about 2 s.

### Rollback

```bash
ssh hshi-u1 'cat ~/clocktower/releases/DEPLOY_LOG; ls ~/clocktower/releases'
scripts/deploy-hshi-u1.sh prod <previous-sha>        # reuses releases/<sha>, ~2 s
```
Rollback happens automatically when the health check fails. This was tested with a deliberately broken release
(fake sha `deadbeef…`): it exited 1, prod returned to the previous release and was healthy, and dev was untouched.
Migrations are forward-only. If a release ran a migration that the old code can't read, restore the `predeploy`
backup (see below) after rolling back.

### Manual service control

```bash
ssh hshi-u1 'systemctl --user status clocktower-prod clocktower-dev --no-pager'
ssh hshi-u1 'systemctl --user restart clocktower-dev'          # never restart prod for a dev change
ssh hshi-u1 'journalctl --user -u clocktower-prod -f -o cat'   # logs (JSON lines)
ssh hshi-u1 'journalctl --user -u clocktower-dev --since "10 min ago" -o cat'
scripts/dev.sh --status | --logs
```

## Private dev access (SSH forward)

```bash
scripts/dev.sh                 # ssh -N -L 3001:127.0.0.1:3001 hshi-u1 → http://localhost:3001/
LOCAL_PORT=13001 scripts/dev.sh
```
Tested: `scripts/smoke-test.sh http://localhost:13001 --no-lobby` passed through the tunnel from the Mac.

## Smoke test

```bash
ssh hshi-u1 'bash -s http://127.0.0.1:3001' < scripts/smoke-test.sh          # dev, on the host
ssh hshi-u1 'bash -s http://127.0.0.1:3000 --no-lobby' < scripts/smoke-test.sh   # prod, on the host
scripts/smoke-test.sh http://localhost:3001                                  # through scripts/dev.sh
scripts/smoke-test.sh https://hshi-u1.tailf28040.ts.net --no-lobby           # prod via Funnel (not yet run)
```
The smoke test checks: `/healthz` (optionally `--expect-version <sha>`), the SPA index and a deep link, security
headers, that unauthenticated `/api/lobbies` returns 401, account creation (cookie set and HttpOnly), `/api/me`,
creating and listing a lobby, a join ticket, the SSE snapshot, sign-out, and that the session is revoked
afterwards. The passphrase and cookie live only in a temp dir and are never printed. Exit codes: 0 = ok,
1 = failure, 3 = API not implemented yet.

There is no delete API, so each run leaves a `smoke-<ts>` account in the DB. A created lobby is never joined and
is removed by the idle timeout. Use `--no-lobby` on prod so it doesn't take one of the `LOBBY_MAX_COUNT` slots.

## Public endpoint (Tailscale Funnel)

```bash
ssh hshi-u1 'tailscale funnel --bg 3000'      # forwards https://hshi-u1.tailf28040.ts.net:443 → 127.0.0.1:3000
ssh hshi-u1 'tailscale funnel status'
ssh hshi-u1 'tailscale funnel --https=443 off'  # or: tailscale funnel reset
scripts/verify-public-endpoint.sh [--expect-version <sha>]
```

**Current state (2026-10-14): Funnel is NOT active, and no public URL has been obtained.** Running
`tailscale funnel --bg 3000` on hshi-u1 printed:

```
Funnel is enabled, but the list of allowed nodes in the tailnet policy file does not include the one you are using.
To give access to this node you can edit the tailnet policy file, or visit:
         https://login.tailscale.com/f/funnel?node=nQZEZMADc411CNTRL
```

It then waited for approval (killed by `timeout 20`). `tailscale funnel status` still says `No serve config`, and
public DNS (1.1.1.1) returns NXDOMAIN for `hshi-u1.tailf28040.ts.net`. **User action:** open that link while
logged in as a tailnet admin, or add hshi-u1 to the `funnel` nodeAttr in the policy file. Then run
`sudo tailscale set --operator=hshi` if the next attempt says access is denied. After that, run
`ssh hshi-u1 'tailscale funnel --bg 3000'` and `scripts/verify-public-endpoint.sh`.
`APP_PUBLIC_ORIGIN` in prod.env is already `https://hshi-u1.tailf28040.ts.net` (the node's MagicDNS name). Confirm
the URL that `tailscale funnel status` prints once it works.

`--bg` keeps the config across reboots and `tailscale down/up`, per the Tailscale CLI docs
(https://tailscale.com/docs/reference/tailscale-cli/funnel). The app also needs linger so that it starts at boot.

`verify-public-endpoint.sh` runs from outside the host and checks:
1. public DNS via 1.1.1.1 / 8.8.8.8;
2. a valid TLS certificate for the name;
3. `/healthz` over the public IP returns `env=production`;
4. a WebSocket upgrade on the Colyseus path (`/<processId>/<roomId>`) gets HTTP 101 through Funnel (locally, `:3000` answers 101 for this request);
5. dev is private: public `:3001` gets no answer over http or https; Funnel ports 8443 and 10000 never serve `env=development`; `tailscale funnel status --json` never mentions 3001; `:3001` is bound to 127.0.0.1 only; and the tailnet IP `100.116.187.72` refuses both :3001 and :3000.

Today, every step 5 check passes and step 1 fails (Funnel is not active).

### Funnel bandwidth and behaviour notes

From https://tailscale.com/docs/features/tailscale-funnel:
- Tailscale says Funnel traffic is "subject to non-configurable bandwidth limits" but publishes no numbers. Measure before relying on it: the load test below shows about 0.6 KB/s of server-to-client payload per client with the current stub world, which will grow once real world snapshots land. Re-measure through Funnel once it's enabled.
- Funnel listens only on ports 443, 8443 and 10000. Traffic is TLS only, relayed by Funnel relay servers over a TCP proxy, and TLS is terminated on hshi-u1 by tailscaled (the relays don't decrypt it). The app sees plain HTTP from loopback, and `trust proxy = loopback` uses `X-Forwarded-For`.
- No UDP: WebRTC media must go to LiveKit Cloud directly.
- Public DNS records can take up to 10 minutes to appear after Funnel is first enabled. Certificates come from Let's Encrypt, so avoid repeated cert churn because of rate limits.
- Funnel is a beta feature.

## How to confirm dev is private

```bash
scripts/verify-public-endpoint.sh             # step 5 checks (work even while Funnel is off)
ssh hshi-u1 "ss -Hltn 'sport = :3001'"        # must show 127.0.0.1:3001 only
ssh hshi-u1 'tailscale funnel status --json'  # must never reference :3001
curl -m 3 http://100.116.187.72:3001/healthz  # from any tailnet device: must fail (connection refused)
CT_AGENT=qa scripts/remote.sh pnpm vitest run tests/security/host-exposure.test.ts   # same checks as a test
```

## Environment variables

Defined by `apps/server/src/config.ts` (lead); template in `.env.example`. Generated on hshi-u1 by bootstrap:

| Var | dev | prod |
|---|---|---|
| `APP_ENV` (pinned in unit) | development | production |
| `HOST` / `PORT` (pinned) | 127.0.0.1 / 3001 | 127.0.0.1 / 3000 |
| `APP_PUBLIC_ORIGIN` | http://localhost:3001 | https://hshi-u1.tailf28040.ts.net |
| `DATABASE_URL` (pinned) | file:~/clocktower/data/dev/clocktower.db | file:~/clocktower/data/prod/clocktower.db |
| `SESSION_SECRET`, `PASSPHRASE_PEPPER` | random 32-byte hex (distinct per env) | random 32-byte hex (distinct per env) |
| `COOKIE_SECURE` | auto (http → not Secure) | auto (https origin → Secure) |
| `LIVEKIT_ROOM_PREFIX` (pinned) | dev | prod |
| `LIVEKIT_URL/API_KEY/API_SECRET` | empty → voice disabled | empty → voice disabled |
| `LOBBY_MAX_COUNT`, `PLAYER_MAX_PER_LOBBY`, `LOBBY_IDLE_TIMEOUT_SEC`, `RECONNECT_GRACE_SEC`, `SESSION_TTL_DAYS`, `VOICE_MONTHLY_MINUTES`, `ADMIN_ACCOUNT_IDS`, `LOG_DIR` | 4, 15, 600, 300, 30, 5000, empty, logs/dev | same, logs/prod |
| `CT_VERSION` | from `.release.env` (git sha) | from `.release.env` (git sha) |

To edit: `ssh hshi-u1 'nano ~/clocktower/env/prod.env'`, then `systemctl --user restart clocktower-prod`.
Never paste secrets into chat or commit them. Rotating `PASSPHRASE_PEPPER` invalidates every login.

### Admin account

Create an account in the UI, get its id from `/api/me` in that browser, add it to `ADMIN_ACCOUNT_IDS` in the env
file, and restart that environment's unit.

## LiveKit setup **(not yet run — needs the user's LiveKit account)**

1. At https://cloud.livekit.io create a project (free Build tier). Ideally create one per environment; otherwise share one project and rely on the `dev`/`prod` room prefixes, noting that the quota is shared.
2. Under Settings → Keys, create an API key and secret. Note the WebSocket URL (`wss://<project>.livekit.cloud`).
3. On hshi-u1, edit `~/clocktower/env/prod.env` (and `dev.env`) to set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Keep the files chmod 600 and don't echo the values.
4. Run `systemctl --user restart clocktower-prod` (or `-dev`). Clients then receive `voice:grant` instead of `voice:unavailable`.

## Backups and restore

- `clocktower-backup.timer` runs daily at 04:17 plus up to 10 minutes of random delay (`Persistent=true`). It runs `~/clocktower/bin/backup-db.sh prod`, which takes an online copy with SQLite's backup API (python3, WAL-safe), runs `PRAGMA integrity_check` on the copy, gzips it with mode 600, and keeps the newest 14 scheduled and 10 tagged backups.
- Every prod deploy takes a `predeploy` backup first, if the DB exists.
- Manual backup: `scripts/backup-db.sh prod [tag]` from the Mac (it runs on hshi-u1).
- Restore (tested on a scratch copy: 1000/1000 rows restored):
  ```bash
  ssh hshi-u1 'systemctl --user stop clocktower-prod &&
    cd ~/clocktower/data/prod && mkdir -p ../prod-before-restore && mv clocktower.db* ../prod-before-restore/ &&
    gunzip -c ~/clocktower/backups/prod/<file>.db.gz > clocktower.db && chmod 600 clocktower.db &&
    systemctl --user start clocktower-prod'
  ```
- Off-host copies are not automated. To pull one: `scp hshi-u1:clocktower/backups/prod/<file> .`.

## Tests and load

```bash
CT_AGENT=qa scripts/remote.sh pnpm vitest run tests/            # integration + security (real server per file, ports 3350-3389)
CT_AGENT=qa scripts/remote.sh pnpm test:e2e                     # Playwright Chromium; builds, serves on 127.0.0.1:3398
CT_AGENT=qa scripts/remote.sh bash -c 'pnpm --filter @ct/server --filter @ct/client build && pnpm test:load -- --lobbies 2 --players 15 --duration 60'
CT_AGENT=qa scripts/pull.sh tests/load/results                  # copy load results back
```
Test servers bind 127.0.0.1 on 3350-3399 with temp DBs and random secrets. Their logs are kept in
`test-results/server-logs/`. The load test refuses `:3000` and `*.ts.net` targets.

## Troubleshooting

| Symptom | Check / fix |
|---|---|
| Deploy says the unit or env file is missing | Run `scripts/setup-hshi-u1.sh`. |
| `refusing prod deploy of HEAD` | Commit, or pass an explicit sha. |
| Health check fails | Run `journalctl --user -u clocktower-<env> -n 50 -o cat`. Typical causes are a missing runtime dependency in `apps/server/package.json` (externals in `apps/server/build.mjs` must be declared there; pnpm is strict) or an invalid env key (the server prints `Invalid configuration for: <keys>` without values). |
| `Start request repeated too quickly` | Run `systemctl --user reset-failed clocktower-<env>`, then restart. The deploy script does this automatically. |
| `pnpm build` fails with `None of the selected packages has a "./packages/db" script` | The root `build` script's unquoted `./packages/*` glob is expanded by sh. Deploys use `pnpm -r --if-present run build` instead (reported to lead). |
| Services gone after a reboot | Linger isn't enabled: `sudo loginctl enable-linger hshi`. |
| Funnel URL doesn't resolve | Funnel isn't enabled for the node (see above), or wait up to 10 minutes for DNS. |
| `journalctl --user` is empty | User journals work on hshi-u1, and hshi is in group `adm`. You can also use `journalctl _SYSTEMD_USER_UNIT=clocktower-prod.service`. |
