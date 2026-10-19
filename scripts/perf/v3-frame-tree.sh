#!/usr/bin/env bash
# v3 perf recon, front "frame" (v3-perf-frame): run tests/perf/v3-frame.ts against a CLEAN committed tree, so a swarm's
# half-written files in the working tree never reach the measurement. Runs on the EDITING machine (git archive +
# rsync only); everything executes on the host through scripts/remote.sh, under the heavy + browser locks.
#
#   scripts/perf/v3-frame-tree.sh <rev> [v3-frame.ts args...]
#   e.g. scripts/perf/v3-frame-tree.sh 2ee23bd --tiers high,low --out test-results/v3-frame-c0b
#
# The export goes to $TMPDIR/ct-v3-frame-tree/<rev> and gets this tree's v3-frame tooling + ops.local.env laid over it
# (the tool may be newer than <rev>). Host sandbox: ~/clocktower/work/${CT_AGENT:-v3-perf-frame}-<rev>. Results are
# copied back to <export>/<out>; the script prints the path. Env: V3_FRAME_TIMEOUT (s, default 2400).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REV="${1:?usage: $0 <rev> [v3-frame.ts args...]}"
shift
SHORT="$(git -C "$ROOT" rev-parse --short=7 "$REV")"
EXP="${TMPDIR:-/tmp}/ct-v3-frame-tree/$SHORT"
mkdir -p "$EXP"
git -C "$ROOT" archive "$SHORT" | tar -x -C "$EXP"
for f in tests/perf/v3-frame.ts tests/perf/v3-frame-probe.js scripts/perf/v3-frame-budgets.mjs scripts/perf/v3-frame-tree.sh; do
  [[ -f "$ROOT/$f" ]] && install -m 0644 "$ROOT/$f" "$EXP/$f"
done
[[ -f "$ROOT/ops.local.env" ]] && install -m 0600 "$ROOT/ops.local.env" "$EXP/ops.local.env"
OUTDIR="test-results/v3-frame-$SHORT"
ARGS=("$@")
for ((i = 0; i < ${#ARGS[@]}; i++)); do [[ ${ARGS[$i]} == --out ]] && OUTDIR="${ARGS[$((i + 1))]}"; done
[[ " ${ARGS[*]-} " == *" --out "* ]] || ARGS+=(--out "$OUTDIR")
AGENT="${CT_AGENT:-v3-perf-frame}-$SHORT"
TMO="${V3_FRAME_TIMEOUT:-2400}"
cd "$EXP"
# remote.sh quotes each argument: the lock chain runs inside sh -c with $HOME expanded on the host
CT_AGENT="$AGENT" bash scripts/remote.sh sh -c "V3_FRAME_REV=$SHORT flock \$HOME/clocktower/v3-heavy.lock flock \$HOME/clocktower/browser.lock timeout $TMO nice -n 19 pnpm exec tsx tests/perf/v3-frame.ts $(printf '%q ' "${ARGS[@]}")" || STATUS=$?
CT_AGENT="$AGENT" bash scripts/pull.sh "$OUTDIR" >/dev/null 2>&1 || true
echo "v3-frame-tree: rev $SHORT, results in $EXP/$OUTDIR (exit ${STATUS:-0})"
exit "${STATUS:-0}"
