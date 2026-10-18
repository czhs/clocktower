#!/bin/sh
# v3.1 (fixes): build the harness unminified, serve it on 127.0.0.1:${CYCLES_HEAP_PORT:-3487}, run v3-cycles-heap.ts.
# Run on the host under the locks, e.g.
#   CT_AGENT=v31-fixes scripts/remote.sh flock -s <heavy.lock> flock <browser.lock> sh tests/perf/v3-cycles-heap.sh --gl gpu
set -e
cd "$(dirname "$0")/../.."
PORT="${CYCLES_HEAP_PORT:-3487}"
if [ -z "$CYCLES_HEAP_NO_BUILD" ]; then
  (cd apps/client && ./node_modules/.bin/vite build -c vite.harness.config.ts --minify false --logLevel warn)
fi
(cd apps/client && exec ./node_modules/.bin/vite preview -c vite.harness.config.ts --port "$PORT" --strictPort --host 127.0.0.1 >/dev/null 2>&1) &
PREV=$!
trap 'kill $PREV 2>/dev/null || true' EXIT INT TERM
sleep 4
pnpm exec tsx tests/perf/v3-cycles-heap.ts --url "http://127.0.0.1:$PORT" "$@"
