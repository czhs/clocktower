#!/usr/bin/env bash
# v3 perf(stage): A/B runs of tests/perf/v3-frame.ts on the HOST GPU, one localStorage switch per variant, in ONE
# exclusive heavy-lock window (keep it short: <= 5-8 min). Run on the host from the sandbox root (scripts/remote.sh):
#   CT_AGENT=v3-perf-stage scripts/remote.sh bash scripts/perf/v3-stage-ab.sh <name> <tier> <viewports> <modes> <ls-variant>...
#   e.g. ... v3-stage-ab.sh shadow low 1920x1080,960x540 census,counts,split,synced,cpu ct.debug.v3shadowEvery=1 ct.debug.v3shadowEvery=2
# A variant '-' runs without extra localStorage. Results: test-results/ab-<name>/<viewport>-<k>/v3-frame.json + a summary.
set -euo pipefail
name=$1 tier=$2 vps=$3 modes=$4
shift 4
port=${AB_PORT:-3465}
secs=${AB_SECS:-5}
phase=${AB_PHASE:-waiting}
out=test-results/ab-$name
mkdir -p "$out"
lock=${AB_LOCK:-$HOME/clocktower/v3-heavy.lock}
exec 9>"$lock"
flock -x 9
echo "locked $(date -u +%T) load $(cut -d' ' -f1-3 /proc/loadavg)" >&2
IFS=, read -r -a vpa <<<"$vps"
files=()
for vp in "${vpa[@]}"; do
  k=0
  for v in "$@"; do
    k=$((k + 1))
    ls=()
    [[ $v != - ]] && ls=(--ls "$v")
    d=$out/$vp-$k
    timeout 240 pnpm exec tsx tests/perf/v3-frame.ts --port "$port" --gl gpu --tiers "$tier" --phase "$phase" --viewport "$vp" \
      --modes "$modes" --passes no --secs "$secs" "${ls[@]}" --out "$d" >/dev/null 2>"$d.log" || echo "run $d failed ($?)" >&2
    echo "== $vp variant $k: $v" >&2
    files+=("$d/v3-frame.json")
  done
done
flock -u 9
echo "unlocked $(date -u +%T)" >&2
node scripts/perf/v3-stage-sum.cjs "${files[@]}"
