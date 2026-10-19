#!/usr/bin/env sh
# v3 perf (cpu): the gate of this front, ON THE HOST (shared heavy lock): client typecheck + the touched unit tests.
#   CT_AGENT=v3-perf-cpu-t scripts/remote.sh sh tests/perf/v3-cpu-check.sh [full]
set -u
L="$HOME/clocktower/v3-heavy.lock"
if [ "${1:-}" = full ]; then
  flock -s "$L" pnpm -r run typecheck; echo "typecheck=$?"
else
  flock -s "$L" pnpm --filter @ct/client exec tsc --noEmit -p .; echo "client-tsc=$?"
fi
flock -s "$L" pnpm vitest run apps/client/test/game3d apps/client/test/ui.graphicsStatus.test.ts; echo "vitest=$?"
