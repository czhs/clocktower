#!/usr/bin/env bash
# Run a command ON hshi-u1 against a fresh copy of this working tree.
# All installs/builds/tests execute on hshi-u1 (the 3060 box); the editing machine only syncs.
#
#   scripts/remote.sh <command...>            e.g. scripts/remote.sh pnpm test
#   CT_AGENT=voice scripts/remote.sh pnpm --filter @ct/voice exec vitest run
#   scripts/remote.sh --no-sync <command...>  skip the rsync step
#
# Each agent gets its own sandbox (~/clocktower/work/<CT_AGENT>) so concurrent test runs and
# installs don't trample each other. pnpm's content store is shared, so installs are fast.
# If the run changes pnpm-lock.yaml, it is copied back into the local tree.
set -euo pipefail
HOST="${CT_HOST:-hshi-u1}"
AGENT="${CT_AGENT:-lead}"
RDIR="clocktower/work/${AGENT}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

SYNC=1
if [[ "${1:-}" == "--no-sync" ]]; then SYNC=0; shift; fi
[[ $# -gt 0 ]] || { echo "usage: $0 [--no-sync] <command...>" >&2; exit 2; }

if [[ $SYNC == 1 ]]; then
  ssh -o BatchMode=yes "$HOST" "mkdir -p ~/$RDIR"
  rsync -az --delete --exclude-from="$ROOT/scripts/rsync-excludes.txt" "$ROOT/" "$HOST:$RDIR/"
fi

# Quote the command for the remote shell.
CMD=$(printf '%q ' "$@")
set +e
ssh -o BatchMode=yes "$HOST" "cd ~/$RDIR && . ~/clocktower/env.sh && bash scripts/remote-prepare.sh && $CMD"
STATUS=$?
set -e
# Bring back the lockfile if the remote install changed it.
if ssh -o BatchMode=yes "$HOST" "test -f ~/$RDIR/pnpm-lock.yaml"; then
  rsync -az "$HOST:$RDIR/pnpm-lock.yaml" "$ROOT/pnpm-lock.yaml.remote" && {
    if ! cmp -s "$ROOT/pnpm-lock.yaml.remote" "$ROOT/pnpm-lock.yaml" 2>/dev/null; then mv "$ROOT/pnpm-lock.yaml.remote" "$ROOT/pnpm-lock.yaml"; else rm -f "$ROOT/pnpm-lock.yaml.remote"; fi
  }
fi
exit $STATUS
