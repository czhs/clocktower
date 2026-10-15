#!/usr/bin/env bash
# Undo setup-dedicated-user.sh: stop/disable the system units and re-enable the admin's
# systemd --user units from ~/clocktower (left intact). Does not delete /srv/clocktower or the
# 'clocktower' user (remove manually if wanted). NOTE: data written while on the system units
# lives in /srv/clocktower/data — copy it back first if you want to keep it.
#     sudo bash rollback-to-user-units.sh
set -euo pipefail
[[ $EUID -eq 0 && -n ${SUDO_USER:-} ]] || { echo "run with sudo from the admin account" >&2; exit 1; }
systemctl disable --now clocktower-tunnel.service clocktower-prod.service clocktower-dev.service clocktower-backup-prod.timer || true
rm -f /etc/sudoers.d/clocktower-deploy
UCTL=(sudo -u "$SUDO_USER" XDG_RUNTIME_DIR="/run/user/$(id -u "$SUDO_USER")" systemctl --user)
"${UCTL[@]}" enable --now clocktower-prod.service clocktower-dev.service clocktower-tunnel.service clocktower-backup.timer
"${UCTL[@]}" is-active clocktower-prod clocktower-dev clocktower-tunnel
