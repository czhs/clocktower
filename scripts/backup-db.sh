#!/usr/bin/env bash
# Online backup of a Clocktower SQLite DB (safe while the server runs: uses SQLite's backup API
# via python3, which handles WAL correctly), gzip-compressed, with retention.
#
#   scripts/backup-db.sh [prod|dev] [tag]      # from the Mac: runs on hshi-u1 over SSH
#   ~/clocktower/bin/backup-db.sh prod         # on hshi-u1 (used by clocktower-backup.timer)
#
# Output: ~/clocktower/backups/<env>/clocktower-<env>-<UTC timestamp>[-tag].db.gz (chmod 600)
# Retention: newest 14 scheduled backups + newest 10 tagged (e.g. 'predeploy') backups.
# Restore: see docs/deployment.md ("Backups and restore").
set -euo pipefail
ENVNAME="${1:-prod}"
TAG="${2:-}"
[[ $ENVNAME == prod || $ENVNAME == dev ]] || { echo "usage: $0 [prod|dev] [tag]" >&2; exit 2; }
[[ -z $TAG || $TAG =~ ^[a-z0-9-]{1,32}$ ]] || { echo "tag must match [a-z0-9-]{1,32}" >&2; exit 2; }

# Not on the host? Delegate to the installed copy on hshi-u1.
if [[ ! -d "$HOME/clocktower/data" || "$(uname -s)" != Linux ]]; then
  exec ssh -o BatchMode=yes "${CT_HOST:-hshi-u1}" "~/clocktower/bin/backup-db.sh $ENVNAME $TAG"
fi

CT="$HOME/clocktower"
SRC="$CT/data/$ENVNAME/clocktower.db"
DEST_DIR="$CT/backups/$ENVNAME"
umask 077
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

# Retention.
ls -1t "$DEST_DIR"/clocktower-"$ENVNAME"-*Z.db.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$DEST_DIR"/clocktower-"$ENVNAME"-*Z-*.db.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
