#!/usr/bin/env bash
# Deploy an exact git commit to the dev or prod service on hshi-u1.
#
#   scripts/deploy-hshi-u1.sh dev  [<commit>]   # default commit: HEAD
#   scripts/deploy-hshi-u1.sh prod [<commit>]
#
# - Packages the commit with `git archive` on the editing machine (never the working tree), copies
#   it to hshi-u1 and runs deploy/bin/install-release.sh there (install --frozen-lockfile, build,
#   migrations for that env only, switch, restart ONLY that env's unit, /healthz version check,
#   automatic rollback on failure). Nothing is built or executed locally.
# - prod refuses to deploy the implicit HEAD when tracked files have uncommitted changes (so what
#   you tested is what ships). Passing an explicit commit is always exact, regardless of the tree.
# - Rollback: scripts/deploy-hshi-u1.sh prod <previous-sha>  (reuses the already-built release).
set -euo pipefail
HOST="${CT_HOST:-hshi-u1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVNAME="${1:-}"
REF="${2:-}"
[[ $ENVNAME == dev || $ENVNAME == prod ]] || { echo "usage: $0 dev|prod [<commit>]" >&2; exit 2; }
cd "$ROOT"

if [[ -z $REF ]]; then
  REF=HEAD
  if [[ $ENVNAME == prod ]] && ! git diff --quiet HEAD --; then
    echo "refusing prod deploy of HEAD: tracked files have uncommitted changes." >&2
    echo "commit first, or pass an explicit commit id to deploy exactly that commit." >&2
    git status --short --untracked-files=no >&2
    exit 1
  fi
fi
SHA=$(git rev-parse --verify --quiet "${REF}^{commit}") || { echo "unknown commit: $REF" >&2; exit 1; }
SUBJECT=$(git log -1 --format=%s "$SHA")
echo "[deploy] $ENVNAME <- $SHA ($SUBJECT)"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/ct-deploy.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
TARBALL="$TMP/clocktower-$SHA.tar.gz"
git archive --format=tar.gz -o "$TARBALL" "$SHA"
echo "[deploy] archive $(du -h "$TARBALL" | cut -f1)"

ssh -o BatchMode=yes "$HOST" "mkdir -p ~/clocktower/incoming"
scp -q "$TARBALL" "$HOST:clocktower/incoming/"
START=$(date +%s)
set +e
ssh -o BatchMode=yes "$HOST" "bash -s -- $ENVNAME $SHA \$HOME/clocktower/incoming/clocktower-$SHA.tar.gz" <"$ROOT/deploy/bin/install-release.sh"
STATUS=$?
set -e
echo "[deploy] $ENVNAME exit=$STATUS in $(( $(date +%s) - START ))s"
if [[ $STATUS -eq 0 ]]; then
  PORT=$([[ $ENVNAME == prod ]] && echo 3000 || echo 3001)
  ssh -o BatchMode=yes "$HOST" "systemctl --user is-active clocktower-$ENVNAME; curl -fsS http://127.0.0.1:$PORT/healthz; echo"
fi
exit $STATUS
