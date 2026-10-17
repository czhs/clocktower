#!/usr/bin/env bash
# Online backup of a Clocktower SQLite DB (safe while the server runs: uses SQLite's backup API
# via python3, which handles WAL correctly), gzip-compressed, with retention.
#
#   scripts/backup-db.sh [prod|dev] [tag]      # from the editing machine: runs on the host (CT_HOST) over SSH
#   ~/clocktower/bin/backup-db.sh prod         # on the host (legacy user-mode timer)
#
# Output: ~/clocktower/backups/<env>/clocktower-<env>-<UTC timestamp>[-tag].db.gz (chmod 600)
# Retention (v2.3 OPS-4): scheduled backups 30 days (always >= 3 kept); tagged (e.g. 'predeploy')
# backups: newest 10, none older than 30 days. BACKUP_KEEP_DAYS overrides the 30.
# Status marker (v2.3 OPS-4): "$CT/data/<env>/.last-backup" ("ok <file> <bytes>" / "failed <reason>"),
# shown in the admin console. The sandboxed unit may write ONLY that file (ReadWritePaths); it is
# skipped silently when not writable.
# Restore: deploy/bin/restore-db.sh (runbook R1-R7 in docs/deployment.md, "Backups and restore").
set -euo pipefail
ENVNAME="${1:-prod}"
TAG="${2:-}"
[[ $ENVNAME == prod || $ENVNAME == dev ]] || { echo "usage: $0 [prod|dev] [tag]" >&2; exit 2; }
[[ -z $TAG || $TAG =~ ^[a-z0-9-]{1,32}$ ]] || { echo "tag must match [a-z0-9-]{1,32}" >&2; exit 2; }

# Runtime root: CT_ROOT (set by the hardened system unit to /srv/clocktower), else legacy ~/clocktower.
CT="${CT_ROOT:-$HOME/clocktower}"
# Not on the host? Delegate to CT_HOST (system mode: run the sandboxed backup unit).
if [[ ! -d "$CT/data" && ! -d /srv/clocktower || "$(uname -s)" != Linux ]]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  . "$ROOT/scripts/lib/ops-env.sh"; ct_load_ops_env "$ROOT"
  exec ssh -o BatchMode=yes "$(ct_require_host)" "if [ -d /srv/clocktower ]; then sudo -n /usr/bin/systemctl start clocktower-backup-$ENVNAME.service && echo backup ok; else ~/clocktower/bin/backup-db.sh $ENVNAME $TAG; fi"
fi
SRC="$CT/data/$ENVNAME/clocktower.db"
DEST_DIR="$CT/backups/$ENVNAME"
MARKER="$CT/data/$ENVNAME/.last-backup"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
[[ $KEEP_DAYS =~ ^[0-9]{1,4}$ ]] || KEEP_DAYS=30
umask 077
# Overwrite in place (the unit bind-mounts just this one file read-write; no rename across it).
mark() { { [[ -w $MARKER ]] || { [[ ! -e $MARKER && -w ${MARKER%/*} ]]; }; } && printf '%s %s\n' "$*" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$MARKER" 2>/dev/null || true; }
trap 'mark "failed exit=$? line=$LINENO"' ERR
mkdir -p "$DEST_DIR"
if [[ ! -f $SRC ]]; then
  echo "[backup] no database at $SRC (nothing to back up yet)" >&2
  exit 0
fi
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$DEST_DIR/clocktower-$ENVNAME-$STAMP${TAG:+-$TAG}.db"
python3 - "$SRC" "$OUT" <<'PY'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True, timeout=30)
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst, pages=1024)
ok = dst.execute("PRAGMA integrity_check").fetchone()[0]
dst.close(); src.close()
if ok != "ok":
    print(f"[backup] integrity_check failed: {ok}", file=sys.stderr); sys.exit(1)
PY
gzip -9 "$OUT"
SIZE=$(stat -c %s "$OUT.gz")
echo "[backup] $OUT.gz ($SIZE bytes, integrity ok)" >&2
mark "ok ${OUT##*/}.gz $SIZE${TAG:+ tag=$TAG}"

# Retention.
prune() { # prune <glob> <keep>
  find "$DEST_DIR" -maxdepth 1 -type f -name "$1" -printf '%T@ %p\n' | sort -rn | tail -n +"$(($2 + 1))" | cut -d' ' -f2- | xargs -r rm -f
}
expire() { # expire <glob> <min-keep>: delete files older than KEEP_DAYS, never the newest <min-keep>
  find "$DEST_DIR" -maxdepth 1 -type f -name "$1" -printf '%T@ %p\n' | sort -rn | tail -n +"$(($2 + 1))" | cut -d' ' -f2- |
    while IFS= read -r f; do if [[ -n $(find "$f" -maxdepth 0 -mtime +"$KEEP_DAYS" 2>/dev/null) ]]; then rm -f "$f"; fi; done
  return 0
}
expire "clocktower-$ENVNAME-*Z.db.gz" 3
prune "clocktower-$ENVNAME-*Z-*.db.gz" 10
expire "clocktower-$ENVNAME-*Z-*.db.gz" 0
