#!/usr/bin/env bash
# One-time hardening of the Clocktower Town hosting on hshi-u1 (lead). Run ON hshi-u1:
#     sudo bash setup-dedicated-user.sh            # dry run: prints what it would do
#     sudo bash setup-dedicated-user.sh --apply    # performs it
#
# What it does (nothing else on the system is touched):
#   1. creates a system user 'clocktower' (no login shell, no sudo, no password, not in any admin group)
#   2. creates /srv/clocktower and COPIES the runtime there from ~ADMIN/clocktower:
#        node runtime, cloudflared binary, current prod release + dev tree, env files,
#        prod/dev databases + backups, the tunnel's credentials JSON (NOT the account cert.pem)
#   3. installs hardened system units (deploy/system/*.service) and a narrow sudoers rule
#   4. stops+disables the admin's systemd --user clocktower units, enables the system units
#   5. verifies health
# It never deletes anything: ~ADMIN/clocktower and ~ADMIN/.cloudflared are left intact, so
# deploy/secure/rollback-to-user-units.sh can restore the previous setup.
set -euo pipefail
APPLY=0; [[ "${1:-}" == --apply ]] && APPLY=1
if [[ $APPLY == 1 ]]; then
  [[ $EUID -eq 0 ]] || { echo "--apply must run with sudo" >&2; exit 1; }
  ADMIN="${SUDO_USER:-}"; [[ -n $ADMIN && $ADMIN != root ]] || { echo "run via sudo from the admin account" >&2; exit 1; }
else
  ADMIN="${SUDO_USER:-$USER}"   # dry run works without sudo
fi
AH=$(getent passwd "$ADMIN" | cut -d: -f6)
SRC_DIR="$(cd "$(dirname "$0")/../.." && pwd)"   # repo checkout containing deploy/
OLD="$AH/clocktower"; R=/srv/clocktower; SVC=clocktower
TUNNEL_ID=$(awk '/^tunnel:/{print $2}' "$AH/.cloudflared/clocktower.yml")
PROD_REL=$(readlink "$OLD/prod")   # releases/<sha>
NODE_DIR=$(readlink -f "$AH/.local/share/node")

run() { echo "+ $*"; [[ $APPLY == 1 ]] && "$@" || true; }
say() { echo; echo "== $*"; }

say "plan (admin=$ADMIN, source=$OLD, target=$R, tunnel=$TUNNEL_ID, prod=$PROD_REL)"
[[ -f "$AH/.cloudflared/$TUNNEL_ID.json" && -n $PROD_REL && -d $NODE_DIR ]] || { echo "missing inputs" >&2; exit 1; }
for f in clocktower-prod.service clocktower-dev.service clocktower-tunnel.service clocktower-backup-prod.service clocktower-backup-dev.service clocktower-backup-prod.timer; do
  [[ -f "$SRC_DIR/deploy/system/$f" ]] || { echo "missing deploy/system/$f" >&2; exit 1; }
done

say "1. service user"
id "$SVC" &>/dev/null && echo "user $SVC exists" || run useradd --system --user-group --home-dir "$R" --no-create-home --shell /usr/sbin/nologin "$SVC"
run passwd -l "$SVC"

say "2. directories (admin owns code; '$SVC' owns only its data)"
run install -d -o "$ADMIN" -g "$SVC" -m 2755 "$R"
run install -d -o root -g root -m 0755 "$R/bin"
run install -d -o "$ADMIN" -g "$SVC" -m 2750 "$R/releases"
run install -d -o "$ADMIN" -g "$ADMIN" -m 0700 "$R/env"
run install -d -o "$SVC" -g "$SVC" -m 0700 "$R/data" "$R/data/prod" "$R/data/dev" "$R/backups" "$R/backups/prod" "$R/backups/dev" "$R/cloudflared"

say "3. runtime copies"
run rsync -a --delete "$NODE_DIR/" "$R/node/"
run chown -R root:root "$R/node"
run install -o root -g root -m 0755 "$AH/.local/bin/cloudflared" "$R/bin/cloudflared"
run install -o root -g root -m 0755 "$SRC_DIR/scripts/backup-db.sh" "$R/bin/backup-db.sh"
for e in prod dev; do run install -o "$ADMIN" -g "$ADMIN" -m 0600 "$OLD/env/$e.env" "$R/env/$e.env"; done
run install -o "$SVC" -g "$SVC" -m 0600 "$AH/.cloudflared/$TUNNEL_ID.json" "$R/cloudflared/$TUNNEL_ID.json"
if [[ $APPLY == 1 ]]; then
  umask 077
  printf 'tunnel: %s\ncredentials-file: %s/cloudflared/%s.json\nno-autoupdate: true\ningress:\n  - hostname: clocktower.chrisshi.com\n    service: http://127.0.0.1:3000\n  - service: http_status:404\n' "$TUNNEL_ID" "$R" "$TUNNEL_ID" >"$R/cloudflared/clocktower.yml"
  chown "$SVC:$SVC" "$R/cloudflared/clocktower.yml"
else echo "+ write $R/cloudflared/clocktower.yml (only clocktower.chrisshi.com -> 127.0.0.1:3000; everything else 404)"; fi

say "4. stop the admin's user units (brief downtime starts here)"
UCTL=(sudo -u "$ADMIN" XDG_RUNTIME_DIR="/run/user/$(id -u "$ADMIN")" systemctl --user)
run "${UCTL[@]}" stop clocktower-tunnel.service clocktower-prod.service clocktower-dev.service clocktower-backup.timer
run "${UCTL[@]}" disable clocktower-tunnel.service clocktower-prod.service clocktower-dev.service clocktower-backup.timer

say "5. code + data copies (services stopped, so the SQLite files are consistent)"
run rsync -a "$OLD/$PROD_REL/" "$R/$PROD_REL/"
run rsync -a "$OLD/dev/" "$R/dev/"
run chown -R "$ADMIN:$SVC" "$R/releases" "$R/dev"
run chmod 2750 "$R/$PROD_REL" "$R/dev"
run ln -sfn "$PROD_REL" "$R/prod"
run chown -h "$ADMIN:$SVC" "$R/prod"
for e in prod dev; do
  for f in "$OLD/data/$e"/clocktower.db*; do [[ -e $f ]] && run install -o "$SVC" -g "$SVC" -m 0600 "$f" "$R/data/$e/"; done
  run rsync -a "$OLD/backups/$e/" "$R/backups/$e/"
  run chown -R "$SVC:$SVC" "$R/backups/$e"
done

say "6. system units + sudoers"
for f in "$SRC_DIR"/deploy/system/*; do run install -o root -g root -m 0644 "$f" "/etc/systemd/system/$(basename "$f")"; done
TMP=$(mktemp); sed "s/ADMIN_USER/$ADMIN/" "$SRC_DIR/deploy/secure/clocktower-deploy.sudoers" >"$TMP"
if [[ $APPLY == 0 ]]; then echo "+ validate (visudo -cf) and install /etc/sudoers.d/clocktower-deploy:"; grep -v '^#' "$TMP"
elif visudo -cf "$TMP" >/dev/null; then run install -o root -g root -m 0440 "$TMP" /etc/sudoers.d/clocktower-deploy; else echo "sudoers rule failed validation; not installed" >&2; exit 1; fi
rm -f "$TMP"
run systemctl daemon-reload
run systemctl enable --now clocktower-prod.service clocktower-dev.service
run systemctl enable --now clocktower-tunnel.service clocktower-backup-prod.timer

say "7. verify"
if [[ $APPLY == 1 ]]; then
  sleep 4
  for p in 3000 3001; do curl -fsS "http://127.0.0.1:$p/healthz" && echo; done
  systemctl is-active clocktower-prod clocktower-dev clocktower-tunnel
  ps -o user=,cmd= -C node,cloudflared | cut -c1-120
  systemd-analyze security clocktower-prod.service | tail -1
fi
echo; echo "done ($([[ $APPLY == 1 ]] && echo applied || echo DRY RUN — re-run with --apply))"
