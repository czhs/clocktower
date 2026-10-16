#!/usr/bin/env bash
# v2.3 host isolation for Clocktower Town (sec-host). ONE reviewed installer. Run ON the host, from a
# checkout of this repo, as the admin account:
#
#     bash deploy/secure/v2.3/apply.sh                  # = --dry-run: prints every step, changes nothing
#     sudo bash deploy/secure/v2.3/apply.sh --apply     # performs it (~1 min downtime: units restart)
#     sudo bash deploy/secure/v2.3/apply.sh --rollback  # back to the v2.2 setup (single 'clocktower' user)
#     sudo bash scripts/verify-sandbox.sh               # proves every wall (run before and after)
#
# What --apply does (and nothing else on the system):
#   HOST-01  one system user per trust domain: ct-prod, ct-dev, ct-tunnel (group clocktower = read the
#            code only). Each owns only its own data; parents become traverse-only.
#   HOST-02  egress walls: per-unit IPAddressDeny (LAN, router, tailnet, link-local, multicast) +
#            nftables per-UID guard (loopback: DNS only; the tunnel may reach prod's port; nothing may
#            reach ollama / Minecraft / CUPS / cloudflared metrics / the other env). Public internet
#            stays open (LiveKit Cloud, the Cloudflare edge). SocketBindAllow: prod/dev may listen only
#            on their own port. tailscaled / D-Bus sockets made invisible.
#   HOST-03  LimitCORE=0 (no core dumps with secrets).   HOST-06  tighter syscall filter, PrivateIPC.
#   HOST-12  build user ct-build + root-owned wrapper /usr/local/sbin/ct-build-run + sudoers rule, so
#            dependency installs, builds and tests run sandboxed as ct-build, never as the admin
#            (install-release.sh uses it automatically; scripts/remote.sh with CT_BUILD_SANDBOX=1).
# Refuses while prod has a game in progress (games live in memory).
set -euo pipefail
MODE=dry
case "${1:-}" in --apply) MODE=apply ;; --rollback) MODE=rollback ;; ""|--dry-run) MODE=dry ;; *) echo "usage: $0 [--dry-run|--apply|--rollback]" >&2; exit 2 ;; esac
[[ $MODE == dry || $EUID -eq 0 ]] || { echo "--apply/--rollback must run with sudo" >&2; exit 1; }
ADMIN="${SUDO_USER:-$USER}"
[[ $MODE == dry || ( -n $ADMIN && $ADMIN != root ) ]] || { echo "run via sudo from the admin account" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
R=/srv/clocktower
B=/srv/ct-build
UNITS=(clocktower-prod clocktower-dev clocktower-tunnel clocktower-backup-prod clocktower-backup-dev)
run() { echo "+ $*"; [[ $MODE == dry ]] || "$@"; }
say() { echo; echo "== $*"; }

say "0. preflight (admin=$ADMIN, mode=$MODE)"
for f in clocktower-guard.nft clocktower-guard.service ctbuild.slice ct-build-run clocktower-build.sudoers; do [[ -f $HERE/$f ]] || { echo "missing $HERE/$f" >&2; exit 1; }; done
[[ -d $R/data && -d $R/cloudflared ]] || { echo "$R layout not found (run deploy/secure/setup-dedicated-user.sh first)" >&2; [[ $MODE == dry ]] || exit 1; }
AG=$(curl -fsS --max-time 3 http://127.0.0.1:3000/internal/active-games 2>/dev/null || true)
echo "prod active games: ${AG:-unknown (not running)}"
if [[ $MODE != dry && $AG =~ \"activeGames\":([1-9][0-9]*) ]]; then echo "refusing: prod has a game in progress; try again later" >&2; exit 1; fi

if [[ $MODE == rollback ]]; then
  say "rollback"
  run systemctl stop clocktower-tunnel.service clocktower-prod.service clocktower-dev.service
  for u in "${UNITS[@]}"; do run rm -f "/etc/systemd/system/$u.service.d/10-user.conf" "/etc/systemd/system/$u.service.d/20-egress.conf" "/etc/systemd/system/$u.service.d/30-hardening.conf"; done
  run systemctl disable --now clocktower-guard.service || true
  run rm -f /etc/systemd/system/clocktower-guard.service /etc/clocktower/guard.nft /etc/sudoers.d/clocktower-build /usr/local/sbin/ct-build-run /etc/systemd/system/ctbuild.slice
  run chown -R clocktower:clocktower "$R/data" "$R/backups" "$R/cloudflared"
  run chmod 0700 "$R/data" "$R/backups"
  run systemctl daemon-reload
  run systemctl start clocktower-prod.service clocktower-dev.service clocktower-tunnel.service
  echo "rolled back. Left in place (harmless): users ct-prod ct-dev ct-tunnel ct-build and $B."
  echo "remove with: sudo userdel ct-prod; sudo userdel ct-dev; sudo userdel ct-tunnel; sudo userdel ct-build; sudo rm -rf $B"
  exit 0
fi

say "1. users (HOST-01, HOST-12): no login shell, no password, no sudo, no admin groups"
for u in ct-prod ct-dev ct-tunnel; do
  if id "$u" &>/dev/null; then echo "user $u exists"
  else run useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid clocktower "$u"; fi
done
if id ct-build &>/dev/null; then echo "user ct-build exists"
else run useradd --system --user-group --home-dir "$B" --no-create-home --shell /usr/sbin/nologin ct-build; fi
# The admin may READ build outputs (to copy a built release); ct-build gets nothing of the admin's.
run usermod -aG ct-build "$ADMIN"

say "2. build sandbox home (HOST-12)"
run install -d -o ct-build -g ct-build -m 2750 "$B" "$B/work" "$B/clocktower" "$B/.cache" "$B/.local" "$B/.local/bin"
run install -o root -g root -m 0755 "$HERE/ct-build-run" /usr/local/sbin/ct-build-run
run install -o root -g root -m 0644 "$HERE/ctbuild.slice" /etc/systemd/system/ctbuild.slice
SUDOERS_TMP=$(mktemp)
sed "s/__ADMIN__/$ADMIN/" "$HERE/clocktower-build.sudoers" >"$SUDOERS_TMP"
echo "+ visudo -cf (sudoers rule: $ADMIN ALL=(root) NOPASSWD: /usr/local/sbin/ct-build-run)"
if [[ $MODE == apply ]]; then
  visudo -cf "$SUDOERS_TMP" >/dev/null || { echo "sudoers rule failed validation; nothing installed" >&2; rm -f "$SUDOERS_TMP"; exit 1; }
  install -o root -g root -m 0440 "$SUDOERS_TMP" /etc/sudoers.d/clocktower-build
fi
rm -f "$SUDOERS_TMP"

say "3. stop the services (brief downtime)"
run systemctl stop clocktower-tunnel.service clocktower-prod.service clocktower-dev.service

say "4. data ownership: each service owns only its own data; parents are traverse-only"
run chown root:clocktower "$R/data" "$R/backups"
run chmod 0710 "$R/data" "$R/backups"
run chown -R ct-prod:clocktower "$R/data/prod" "$R/backups/prod"
run chown -R ct-dev:clocktower "$R/data/dev" "$R/backups/dev"
run chown -R ct-tunnel:clocktower "$R/cloudflared"
run chmod 0700 "$R/data/prod" "$R/data/dev" "$R/backups/prod" "$R/backups/dev" "$R/cloudflared"

say "5. drop-ins (HOST-01 user, HOST-02 egress, HOST-03/06 hardening)"
for u in "${UNITS[@]}"; do
  run install -d -m 0755 "/etc/systemd/system/$u.service.d"
  for f in "$HERE/$u.service.d/"*.conf; do run install -m 0644 "$f" "/etc/systemd/system/$u.service.d/$(basename "$f")"; done
done

say "6. nftables egress guard (HOST-02, HOST-12)"
run install -d -m 0755 /etc/clocktower
run install -m 0644 "$HERE/clocktower-guard.nft" /etc/clocktower/guard.nft
run install -m 0644 "$HERE/clocktower-guard.service" /etc/systemd/system/clocktower-guard.service
run systemctl daemon-reload
run systemctl enable --now clocktower-guard.service

say "7. start and check"
run systemctl start clocktower-prod.service clocktower-dev.service clocktower-tunnel.service
if [[ $MODE == apply ]]; then
  sleep 5
  for u in clocktower-prod clocktower-dev clocktower-tunnel; do printf '%-20s %-8s User=%s\n' "$u" "$(systemctl is-active $u)" "$(systemctl show -P User $u)"; done
  for p in 3000 3001; do curl -fsS --max-time 5 "http://127.0.0.1:$p/internal/version" || curl -fsS --max-time 5 "http://127.0.0.1:$p/healthz"; echo; done
  echo
  echo "next: sudo bash scripts/verify-sandbox.sh   (expect: result: N passed, 0 failed)"
  echo "      then join voice once on the public site (LiveKit egress) and log out/in once so the"
  echo "      admin's new 'ct-build' group membership applies (needed to copy sandbox-built releases)."
fi
