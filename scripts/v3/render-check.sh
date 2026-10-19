#!/usr/bin/env bash
# v3 WP7 (v3-qa). Mock-world harness stills + checks (docs/v3/INTEGRATION.md §6.3) ON THE HOST, SwiftShader (CPU)
# only, lowest quality, few frames (Q10 default: the host's GPU is never used; the stills are for the LOOK, never perf):
#   1. build the harness (apps/client/vite.harness.config.ts -> apps/client/dist-harness; never part of `pnpm build`)
#   2. run tests/v3/render-check.spec.ts (tests/v3/harness.config.ts: vite preview on 127.0.0.1:$HARNESS_PORT with the
#      production CSP): every scenario's stills, the §1.5 projection check, the mount/destroy leak cycles
#   3. (editing machine) pull tests/v3/shots/ back (gitignored) for review
# Everything runs under the heavy lock AND the browser lock, at nice 19, with a hard timeout.
#
#   scripts/v3/render-check.sh                                 all scenarios + projection + cycles
#   HARNESS_SCENARIOS=square-day-8,projection scripts/v3/render-check.sh
# Env: HARNESS_PORT (default 3460), HARNESS_SCENARIOS (comma list; 'projection' / 'cycles' select those checks),
#      CT_AGENT (default v3-qa), V3_RENDER_TIMEOUT (s, default 3600).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${HARNESS_PORT:-3460}"
[[ $PORT =~ ^[0-9]+$ ]] && { (( PORT == 3460 )) || (( PORT >= 3485 && PORT <= 3499 )); } || { echo "render-check.sh: HARNESS_PORT must be 3460 or 3485-3499 (v3-qa), got $PORT" >&2; exit 2; }
TIMEOUT="${V3_RENDER_TIMEOUT:-3600}"
AGENT="${CT_AGENT:-v3-qa}"

if [[ "${1:-}" != "--on-host" ]]; then
  set +e
  env CT_AGENT="$AGENT" "$ROOT/scripts/remote.sh" env HARNESS_PORT="$PORT" HARNESS_SCENARIOS="${HARNESS_SCENARIOS:-}" V3_RENDER_TIMEOUT="$TIMEOUT" bash scripts/v3/render-check.sh --on-host "$@"
  rc=$?
  set -e
  CT_AGENT="$AGENT" "$ROOT/scripts/pull.sh" tests/v3/shots || echo "render-check.sh: no shots to pull" >&2
  echo "render-check.sh: stills in tests/v3/shots/ (exit $rc)" >&2
  exit $rc
fi
shift
cd "$ROOT"
mkdir -p "$HOME/clocktower"
echo "[v3-render] port $PORT; load before: $(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || uptime)" >&2
set +e
HARNESS_PORT="$PORT" HARNESS_SCENARIOS="${HARNESS_SCENARIOS:-}" flock "$HOME/clocktower/v3-heavy.lock" flock "$HOME/clocktower/browser.lock" \
  nice -n 19 timeout --kill-after=30 "$TIMEOUT" sh -c 'pnpm --filter @ct/client exec vite build -c vite.harness.config.ts --logLevel warn && pnpm exec playwright test -c tests/v3/harness.config.ts "$@"' sh "$@"
rc=$?
set -e
echo "[v3-render] exit $rc; load after: $(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || uptime)" >&2
exit $rc
