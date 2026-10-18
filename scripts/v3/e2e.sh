#!/usr/bin/env bash
# v3 WP7 (v3-qa). Runs the `v3` Playwright project (tests/e2e/v3-*.spec.ts, docs/v3/INTEGRATION.md §6.2) ON THE HOST,
# one v3 e2e at a time: under the host-wide heavy lock AND the browser lock, at nice 19, with a hard timeout, on an
# E2E_PORT from the v3-qa range (3485-3499; never 3000/3001). SwiftShader only (the project's launch args).
#
#   scripts/v3/e2e.sh                         every v3 spec (from the editing machine: syncs via scripts/remote.sh)
#   scripts/v3/e2e.sh v3-boot v3-fallback     only these spec files (Playwright filters)
#   E2E_PORT=3487 CT_E2E_NO_BUILD=1 scripts/v3/e2e.sh v3-paths
# Env: E2E_PORT (default 3485), CT_AGENT (default v3-qa), V3_E2E_TIMEOUT (s, default 3600), CT_E2E_NO_BUILD (skip build).
# The host load average is printed before and after (other agents share the machine). It sets E2E_V3=1, which is what
# makes the `v3` project exist in tests/e2e/playwright.config.ts (a plain `pnpm test:e2e` runs only the Classic suite).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${E2E_PORT:-3485}"
[[ $PORT =~ ^[0-9]+$ ]] && (( PORT >= 3485 && PORT <= 3499 )) || { echo "e2e.sh: E2E_PORT must be in 3485-3499 (v3-qa), got $PORT" >&2; exit 2; }
TIMEOUT="${V3_E2E_TIMEOUT:-3600}"

if [[ "${1:-}" != "--on-host" ]]; then
  # editing machine -> host (rsync + run this script there)
  exec env CT_AGENT="${CT_AGENT:-v3-qa}" "$ROOT/scripts/remote.sh" env E2E_PORT="$PORT" V3_E2E_TIMEOUT="$TIMEOUT" CT_E2E_NO_BUILD="${CT_E2E_NO_BUILD:-}" bash scripts/v3/e2e.sh --on-host "$@"
fi
shift
cd "$ROOT"
mkdir -p "$HOME/clocktower"
echo "[v3-e2e] port $PORT; load before: $(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || uptime)" >&2
set +e
E2E_V3=1 E2E_PORT="$PORT" flock "$HOME/clocktower/v3-heavy.lock" flock "$HOME/clocktower/browser.lock" \
  nice -n 19 timeout --kill-after=30 "$TIMEOUT" pnpm test:e2e --project=v3 "$@"
rc=$?
set -e
echo "[v3-e2e] exit $rc; load after: $(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || uptime)" >&2
exit $rc
