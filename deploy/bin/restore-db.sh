#!/usr/bin/env bash
# v2.3 OPS-3 (sec-ops): restore a Clocktower SQLite backup (runbook R1-R7, docs/deployment.md
# "Backups and restore"). Runs ON the host as root (only the service users can read backups/data):
#
#   sudo bash deploy/bin/restore-db.sh <prod|dev> <backup .db.gz | .db>           # dry run: checks only
#   sudo bash deploy/bin/restore-db.sh <prod|dev> <backup .db.gz | .db> --apply   # stop, swap, start, verify
#
# What --apply does:
#   1. verifies the backup (gunzip to a temp file, PRAGMA integrity_check, max migration id, accounts)
#   2. refuses while that environment has a game in progress (games live in memory) unless CT_FORCE=1
#   3. stops the unit
#   4. moves the CURRENT clocktower.db AND its -wal / -shm into data/<env>/pre-restore-<UTC>/
#      (a stale WAL next to a restored file would be replayed onto it: corruption / mixed data)
#   5. installs the backup as clocktower.db (owner = owner of the data dir, mode 0600)
#   6. starts the unit (migrations up to the running release run at start) and checks /healthz
# Undo: stop the unit, move data/<env>/pre-restore-<UTC>/* back, start the unit.
# PREREQUISITE: /srv/clocktower/env/<env>.env must hold the SAME PASSPHRASE_PEPPER as when the backup
# was taken, or nobody can sign in with their passphrase (sessions keep working until they expire).
#
# Test hooks (no systemd, no root): CT_ROOT=<dir> CT_NO_SYSTEMCTL=1 CT_PORT=<port>.
set -euo pipefail
ENVNAME="${1:-}"; SRC="${2:-}"; MODE="${3:-}"
[[ ($ENVNAME == prod || $ENVNAME == dev) && -n $SRC && ( -z $MODE || $MODE == --apply ) ]] || {
  echo "usage: $0 <prod|dev> <backup.db.gz|backup.db> [--apply]" >&2; exit 2; }
CT="${CT_ROOT:-/srv/clocktower}"
D="$CT/data/$ENVNAME"
UNIT="clocktower-$ENVNAME.service"
PORT="${CT_PORT:-$([[ $ENVNAME == prod ]] && echo 3000 || echo 3001)}"
[[ -f $SRC ]] || { echo "no such backup: $SRC" >&2; exit 1; }
[[ -d $D ]] || { echo "no data dir: $D" >&2; exit 1; }
[[ ${CT_NO_SYSTEMCTL:-} == 1 || $EUID -eq 0 ]] || { echo "run with sudo (only the service user can read $D)" >&2; exit 1; }
OWNER=$(stat -c %U "$D"); GROUP=$(stat -c %G "$D")
sc() { [[ ${CT_NO_SYSTEMCTL:-} == 1 ]] && { echo "(skipped) systemctl $*"; return 0; }; systemctl "$@"; }
log() { printf '[restore:%s] %s\n' "$ENVNAME" "$*" >&2; }

# 1. verify a private copy of the backup
umask 077
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
case $SRC in *.gz) gunzip -c "$SRC" >"$TMP/restore.db" ;; *) cp "$SRC" "$TMP/restore.db" ;; esac
CHECK=$(python3 - "$TMP/restore.db" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
ok = c.execute("PRAGMA integrity_check").fetchone()[0]
mig = c.execute("SELECT max(id) FROM _migrations").fetchone()[0]
acc = c.execute("SELECT count(*) FROM accounts").fetchone()[0]
print(f"{ok} migrations<={mig} accounts={acc}")
PY
)
log "backup check: $CHECK"
[[ $CHECK == ok\ * ]] || { log "integrity check FAILED; nothing changed"; exit 1; }
if [[ $MODE != --apply ]]; then log "dry run: add --apply to restore it into $D"; exit 0; fi

# 2. no game in progress
AG=$(curl -fsS --max-time 3 "http://127.0.0.1:$PORT/internal/active-games" 2>/dev/null || true)
if [[ ${CT_FORCE:-} != 1 && $AG =~ \"activeGames\":([1-9][0-9]*) ]]; then log "refusing: $ENVNAME has ${BASH_REMATCH[1]} game(s) in progress (CT_FORCE=1 to override)"; exit 1; fi

# 3-5. stop, move the live files aside (incl. -wal/-shm), install the backup
TS=$(date -u +%Y%m%dT%H%M%SZ)
sc stop "$UNIT"
ASIDE="$D/pre-restore-$TS"
install -d -m 0700 -o "$OWNER" -g "$GROUP" "$ASIDE" 2>/dev/null || mkdir -m 0700 "$ASIDE"
for f in clocktower.db clocktower.db-wal clocktower.db-shm; do [[ -e $D/$f ]] && mv "$D/$f" "$ASIDE/"; done
install -m 0600 -o "$OWNER" -g "$GROUP" "$TMP/restore.db" "$D/clocktower.db" 2>/dev/null || install -m 0600 "$TMP/restore.db" "$D/clocktower.db"
log "live files moved to $ASIDE; backup installed"

# 6. start + verify
sc restart "$UNIT"
if [[ ${CT_NO_SYSTEMCTL:-} == 1 ]]; then log "done (no systemctl: start the server yourself)"; exit 0; fi
for _ in $(seq 1 40); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then log "healthy; restore complete (undo: see header)"; exit 0; fi
  sleep 1
done
log "NOT healthy after 40 s: journalctl -u $UNIT -n 50 (undo: stop, move $ASIDE/* back, restart)"
exit 1
