#!/usr/bin/env bash
# Copy generated files back from an agent sandbox on hshi-u1 into the local tree, e.g.
#   CT_AGENT=world-art scripts/pull.sh packages/assets/generated
set -euo pipefail
HOST="${CT_HOST:-hshi-u1}"; AGENT="${CT_AGENT:-lead}"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for p in "$@"; do
  mkdir -p "$ROOT/$(dirname "$p")"
  rsync -az "$HOST:clocktower/work/$AGENT/$p" "$ROOT/$(dirname "$p")/"
done
