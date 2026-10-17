# Host security for the game host (lead)

Goal: keep the game contained so running it publicly can't harm the owner's personal machine.
No Docker; a dedicated user + systemd sandbox + careful tunnel config.

## What was inspected on the running host (2026-10-15, read-only)

| Check | Finding |
|---|---|
| Process identity | prod, dev and cloudflared ran as **the admin user (uid 1000)** with all of the admin's groups. A compromise of the Node process could read `~/.ssh`, other projects, `~/.cloudflared/cert.pem` (account-wide tunnel/DNS cert). |
| systemd sandbox | `systemd-analyze --user security clocktower-prod` → **9.6 UNSAFE** (only NoNewPrivileges/UMask set). `CapEff=0`, `NoNewPrivs=1`, no seccomp. |
| Listening sockets | game 127.0.0.1:3000/3001, cloudflared metrics on loopback; unrelated services on the host were inventoried privately (operator notes, not in the repo) and are out of scope for the game. |
| Tunnel config | locally managed; ingress `clocktower.chrisshi.com → http://127.0.0.1:3000`, catch-all `http_status:404`; no warp-routing / private-network routing. Verified with `cloudflared tunnel ingress rule`. Dev 3001 not routed and not reachable on the tailnet IP. |
| Firewall | `ufw` service active (rule listing needs root; not changed). |
| Files written by the app | only the SQLite DB (+ -wal/-shm) at `DATABASE_URL`; logs go to journald (stdout); backups are an operator script with fixed paths. No uploads, no user-controlled paths, no `child_process`/`eval` in runtime code. |
| Secrets | env files 0600, `~/.cloudflared/*` 0600; nothing secret tracked in git or present in git history (`git log -p` scan); `.gitignore` covers `.env.*`, `*.db`, data/logs. |
| Disk/logs | journald already 4.0 GB (system default cap); root fs 84% used (108 GB free). |

## Hardening (APPLIED 2026-10-15; verified — see docs/test-results.md)

`deploy/secure/setup-dedicated-user.sh` (dry run works without sudo; `--apply` with sudo):

- **Dedicated user `clocktower`**: system user, no login shell, locked password, no groups beyond its own, no sudo.
- **Layout `/srv/clocktower`**: code (`releases/<sha>`, `dev/`) owned by the admin, group-readable by `clocktower`, **not writable** by it; `data/{prod,dev}` and `backups/` owned by `clocktower` 0700 (admin can't read the DBs directly); `env/*.env` owned by the admin 0600 (read by systemd as root before dropping privileges — the game process cannot read the file); tunnel credentials JSON only (no account `cert.pem`) owned by `clocktower` 0600; Node runtime + cloudflared binary root-owned.
- **System units** (`deploy/system/`) running as `clocktower` with: `ProtectHome=yes` (/home invisible), `ProtectSystem=strict` + `ReadWritePaths` = only its own data dir, `InaccessiblePaths` for the other env's data, backups, env and tunnel creds, `PrivateTmp`, `PrivateDevices`, no capabilities, `NoNewPrivileges`, `RestrictSUIDSGID`, `RestrictNamespaces`, kernel/proc/clock/hostname protections, `SystemCallFilter=@system-service`, address families limited to unix/inet/inet6/netlink. Resources: `MemoryHigh/MemoryMax` (prod 1G/1.5G, dev 768M/1G, tunnel 256M), `MemorySwapMax=0`, `CPUQuota` (prod 300%, dev 200%, tunnel 100%), `TasksMax`, `LimitNOFILE`, per-unit journald rate limit. `Restart=on-failure`; `WantedBy=multi-user.target` (starts at boot without linger). `MemoryDenyWriteExecute` intentionally off (V8 JIT).
  - **Correction (v2.3, HOST-01):** `InaccessiblePaths` alone does **not** separate prod, dev, the tunnel and the backups while they share the one UID `clocktower`. Same-UID processes stay visible under `ProtectProc=invisible`, and `/proc/<pid>/root` / `/proc/<pid>/environ` need only `PTRACE_MODE_READ` (Yama `ptrace_scope=1` blocks attach, not these). So prod could read the tunnel credentials JSON via `/proc/<cloudflared pid>/root/srv/clocktower/cloudflared/…`, and dev could read prod's DB and secrets. The fix is one user per service (`ct-prod`, `ct-dev`, `ct-tunnel`), plus an egress guard. Both are prepared in `deploy/secure/v2.3/` (`apply.sh`, dry run by default) and verified by `scripts/verify-sandbox.sh`. They are **not applied yet (needs sudo)**; see docs/security-v2.3/02-host-safety.md.
- **Narrow sudoers** (`/etc/sudoers.d/clocktower-deploy`, validated by `visudo -cf`): the admin may restart/stop/reset these units and trigger their backups without a password — nothing else.
- Deploy scripts auto-detect the new layout; packages are copied (not hard-linked) out of the admin's pnpm store; DB migrations run at server start as `clocktower`; pre-deploy backup via the sandboxed backup unit.
- Non-destructive: `~/clocktower` and `~/.cloudflared` are left intact; `deploy/secure/rollback-to-user-units.sh` restores the old setup.

## Residual risks (honest)

- A Node/Colyseus/LiveKit-SDK remote-code-execution bug would still give an attacker the `clocktower` user: they could read/modify the game DBs it can access, exfiltrate the game's own secrets from its environment (session secret, passphrase pepper, LiveKit key), and make outbound network connections (not restricted, LiveKit API needs egress). They could not read `/home`, write outside its data dir, gain capabilities or use setuid binaries.
  - **Until `deploy/secure/v2.3/apply.sh` is applied (v2.3 HOST-01/02)**, the same attacker could also read the other services' data and secrets through `/proc/<pid>/root|environ` (same UID). That includes the tunnel credentials, which would let them run their own connector for the hostname from anywhere and receive player traffic until the tunnel secret is rotated. They could also reach the LAN, the tailnet and every other loopback service on the host (including cloudflared's metrics port). After it: one UID per service, no LAN/tailnet/link-local egress (`IPAddressDeny`), and loopback limited to DNS and tunnel→prod (`/etc/clocktower/guard.nft`). The public internet stays reachable (LiveKit Cloud has dynamic IPs).
- The tunnel process can read the tunnel credentials (needed to run); a compromise of it could impersonate this one tunnel hostname, not the Cloudflare account.
- No disk quota: DB growth is bounded only by API rate limits; backups keep 14 daily + 10 pre-deploy copies.
- Kernel/systemd vulnerabilities are out of scope; keep Ubuntu updated.
- Host-level items unrelated to the game (admin group memberships, SSH exposure, other services) are tracked in the operator's private notes, not in this public repo.
- Cloudflare: `~/.cloudflared/cert.pem` (account-wide) stays in the admin's home; delete it if you don't plan to create more tunnels (re-run `cloudflared tunnel login` when needed).
