#!/usr/bin/env bash
# Copy generated files back from an agent sandbox on the host (CT_HOST) into the local tree, e.g.
#   CT_AGENT=world-art scripts/pull.sh packages/assets/generated
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
. "$ROOT/scripts/lib/ops-env.sh"; ct_load_ops_env "$ROOT"
HOST="$(ct_require_host)"; AGENT="${CT_AGENT:-lead}"
for p in "$@"; do
  mkdir -p "$ROOT/$(dirname "$p")"
  rsync -az "$HOST:clocktower/work/$AGENT/$p" "$ROOT/$(dirname "$p")/"
done
