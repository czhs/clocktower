#!/usr/bin/env bash
# v2.3 ops hardening (sec-ops: OPS-4 backups, OPS-7 log retention, OPS-8 sudoers). Run ON the host
# from a checkout of this repo, AFTER deploy/secure/v2.3/apply.sh (sec-host) if you use it:
#
#     bash deploy/secure/v2.3/ops/apply.sh                 # dry run: prints every step, changes nothing
#     sudo bash deploy/secure/v2.3/ops/apply.sh --apply    # performs it (restarts dev only)
#     sudo bash deploy/secure/v2.3/ops/apply.sh --rollback # removes everything it installed
#
# Installs:
#   /srv/clocktower/bin/backup-db.sh                        30-day retention, tagged pre-deploy bucket, status marker
#   /srv/clocktower/data/{prod,dev}/.last-backup            marker file (owner = data dir owner, 0600)
#   /etc/systemd/system/clocktower-backup-prod-predeploy.service (+ copies of clocktower-backup-prod's drop-ins)
#   /etc/systemd/system/clocktower-ops-alert@.service       OnFailure= target (critical journal entry)
#   /etc/systemd/system/clocktower-backup-{prod,dev}.service.d/40-backup-ops.conf
#   /etc/systemd/journald@clocktower.conf + 40-log-namespace.conf on every clocktower unit (14-day logs)
#   /etc/sudoers.d/clocktower-deploy                        (validated with visudo -cf)
# Prod and the tunnel are NOT restarted (games live in memory): the script prints the two commands.
set -euo pipefail
MODE=dry; case "${1:-}" in --apply) MODE=apply ;; --rollback) MODE=rollback ;; "") ;; *) echo "usage: $0 [--apply|--rollback]" >&2; exit 2 ;; esac
[[ $MODE == dry || $EUID -eq 0 ]] || { echo "--apply/--rollback must run with sudo" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
R=/srv/clocktower
S=/etc/systemd/system
ADMIN="${SUDO_USER:-$(id -un)}"
LOGGED=(clocktower-prod clocktower-dev clocktower-tunnel clocktower-backup-prod clocktower-backup-dev clocktower-backup-prod-predeploy)
run() { echo "+ $*"; [[ $MODE == dry ]] || "$@"; }
say() { echo; echo "== $*"; }

if [[ $MODE == rollback ]]; then
  say "rollback"
  for u in "${LOGGED[@]}"; do run rm -f "$S/$u.service.d/40-log-namespace.conf"; done
  run rm -f "$S/clocktower-backup-prod.service.d/40-backup-ops.conf" "$S/clocktower-backup-dev.service.d/40-backup-ops.conf"
  run rm -rf "$S/clocktower-backup-prod-predeploy.service.d"
  run rm -f "$S/clocktower-backup-prod-predeploy.service" "$S/clocktower-ops-alert@.service" /etc/systemd/journald@clocktower.conf
  run systemctl daemon-reload
  echo "sudoers: re-run deploy/secure/setup-dedicated-user.sh from the previous commit to restore the old rule (the new one only adds lines)."
  echo "Restart prod/tunnel between games so they log to the default journal again."
  exit 0
fi

say "1. backup script (30-day retention, pre-deploy bucket, status marker)"
run install -o root -g root -m 0755 "$REPO/scripts/backup-db.sh" "$R/bin/backup-db.sh"

say "2. status markers (written by the backup unit, read by the game for the admin console)"
for e in prod dev; do
  owner=$(stat -c %U "$R/data/$e" 2>/dev/null || echo clocktower)
  [[ -e $R/data/$e/.last-backup ]] || run install -o "$owner" -g clocktower -m 0600 /dev/null "$R/data/$e/.last-backup"
done

say "3. units: alert template, tagged pre-deploy backup, backup drop-ins"
run install -o root -g root -m 0644 "$HERE/clocktower-ops-alert@.service" "$S/clocktower-ops-alert@.service"
run install -o root -g root -m 0644 "$HERE/clocktower-backup-prod-predeploy.service" "$S/clocktower-backup-prod-predeploy.service"
for e in prod dev; do
  run install -d -m 0755 "$S/clocktower-backup-$e.service.d"
  run install -o root -g root -m 0644 "$HERE/40-backup-ops-$e.conf" "$S/clocktower-backup-$e.service.d/40-backup-ops.conf"
done
# The pre-deploy unit gets exactly the drop-ins of clocktower-backup-prod (user, hardening, marker).
run install -d -m 0755 "$S/clocktower-backup-prod-predeploy.service.d"
for f in "$S"/clocktower-backup-prod.service.d/*.conf; do [[ -e $f ]] && run install -o root -g root -m 0644 "$f" "$S/clocktower-backup-prod-predeploy.service.d/"; done
[[ $MODE == dry ]] && echo "+ (dry run: would copy every $S/clocktower-backup-prod.service.d/*.conf incl. 40-backup-ops.conf)"

say "4. journald namespace 'clocktower' (14 days, 512 MB) + LogNamespace on every unit"
run install -o root -g root -m 0644 "$HERE/journald@clocktower.conf" /etc/systemd/journald@clocktower.conf
for u in "${LOGGED[@]}"; do
  run install -d -m 0755 "$S/$u.service.d"
  run install -o root -g root -m 0644 "$HERE/40-log-namespace.conf" "$S/$u.service.d/40-log-namespace.conf"
done

say "5. sudoers (+ tunnel stop/start, pre-deploy backup)"
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
sed "s/ADMIN_USER/$ADMIN/" "$REPO/deploy/secure/clocktower-deploy.sudoers" >"$TMP"
if [[ $MODE == dry ]]; then echo "+ validate (visudo -cf) and install /etc/sudoers.d/clocktower-deploy:"; grep -v '^#' "$TMP"
elif visudo -cf "$TMP" >/dev/null; then run install -o root -g root -m 0440 "$TMP" /etc/sudoers.d/clocktower-deploy
else echo "sudoers rule failed validation; not installed" >&2; exit 1; fi

say "6. reload; restart dev; first backups"
run systemctl daemon-reload
run systemctl restart clocktower-dev.service
run systemctl start clocktower-backup-dev.service clocktower-backup-prod.service
echo
echo "Done. Between games, restart prod and the tunnel so they log into the new namespace:"
echo "  sudo -n /usr/bin/systemctl restart clocktower-prod.service; sudo -n /usr/bin/systemctl restart clocktower-tunnel.service"
echo "Check:  systemctl show clocktower-prod -p LogNamespace;  journalctl --namespace=clocktower -u clocktower-prod -n 5"
echo "        sudo cat $R/data/prod/.last-backup   (or the admin console: Safety -> Last database backup)"
