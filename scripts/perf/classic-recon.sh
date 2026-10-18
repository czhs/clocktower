#!/usr/bin/env bash
# v3 perf recon (front "classic"): one measurement session of tests/perf/classic-perf.ts over several trees, run
# ON THE HOST inside ONE hold of the heavy + browser locks (other agents' builds must not distort the numbers).
# Each tree is a sandbox directory under ~/clocktower/work/ (a `git archive <rev>` export, or the synced working
# tree) with its deps installed (remote.sh --no-sync does that) and a client build whose path is given per run.
#
#   CT_AGENT=v3-perf-classic scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock flock $HOME/clocktower/browser.lock \
#     bash scripts/perf/classic-recon.sh $HOME/clocktower/work/v3-perf-classic-out \
#       "v24|v3-perf-classic-v24|/tmp/ct-bundle-XXXX|v2|desktop-idle,desktop-walk,mobile-walk,night-home,load|" \
#       "head-v3|v3-perf-classic-head|/tmp/ct-bundle-YYYY|v3|desktop-idle,desktop-walk|--profile yes"'
# PORTS=a-b overrides the port range (default 3494-3495). Run spec: label|sandbox dir name|client dist|world|windows|extra classic-perf args. Ports 3494-3495 (v3-perf-classic).
# Output: <out>/<label>/classic-perf-<world>.json + <label>.log; host load average before/after every run.
set -u
OUT="$1"; shift
mkdir -p "$OUT"
echo "[recon] start $(date -u +%FT%TZ) load $(cut -d' ' -f1-3 /proc/loadavg)" | tee -a "$OUT/recon.log"
for spec in "$@"; do
  IFS='|' read -r label tree dist world only extra <<<"$spec"
  dir="$HOME/clocktower/work/$tree"
  mkdir -p "$OUT/$label"
  echo "[recon] $label tree=$tree world=$world only=$only extra=$extra load-before $(cut -d' ' -f1-3 /proc/loadavg)" | tee -a "$OUT/recon.log"
  # shellcheck disable=SC2086
  (cd "$dir" && pnpm exec tsx tests/perf/classic-perf.ts --ports "${PORTS:-3494-3495}" --dist "$dist" --world "$world" --only "$only" --win "${WIN:-15}" --out "$OUT/$label" $extra) >"$OUT/$label.log" 2>&1
  rc=$?
  echo "[recon] $label exit=$rc load-after $(cut -d' ' -f1-3 /proc/loadavg)" | tee -a "$OUT/recon.log"
done
echo "[recon] end $(date -u +%FT%TZ) load $(cut -d' ' -f1-3 /proc/loadavg)" | tee -a "$OUT/recon.log"
