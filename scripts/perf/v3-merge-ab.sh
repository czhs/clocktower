#!/usr/bin/env bash
# v3.1 stage: pixel + draw-call A/B of the static kit merge (tests/perf/v3-merge-ab.ts) on the harness, ON THE HOST GPU.
# Builds the harness once, then one run per merge cell size. Heavy lock shared + browser lock, nice 19.
#   CT_AGENT=v31-stage scripts/remote.sh bash scripts/perf/v3-merge-ab.sh <tiers> <scenarios> <cells> [dpr]
#   e.g. ... v3-merge-ab.sh low,high square-day-8,night-15,vote-12 12,24 1
# Results: test-results/merge-ab-c<cell>[-dpr<d>]/ (PNG stills: off / on / diff) + one summary line per shot.
set -euo pipefail
tiers=$1 scenarios=$2 cells=$3 dpr=${4:-1}
port=${AB_PORT:-3467}
heavy=${AB_LOCK:-$HOME/clocktower/v3-heavy.lock}
browser=$HOME/clocktower/browser.lock
exec 8>"$heavy"
flock -s 8
exec 9>"$browser"
flock -x 9
HARNESS_PORT=$port nice -n 19 pnpm --filter @ct/client exec vite build -c vite.harness.config.ts --logLevel warn >&2
IFS=, read -r -a ca <<<"$cells"
for c in "${ca[@]}"; do
  out=test-results/merge-ab-c$c$([[ $dpr != 1 ]] && echo "-dpr$dpr" || true)
  HARNESS_PORT=$port timeout 600 nice -n 19 pnpm exec tsx tests/perf/v3-merge-ab.ts --port "$port" --gl gpu --tiers "$tiers" \
    --scenarios "$scenarios" --cell "$c" --dpr "$dpr" --out "$out" 2>"$out.log" >/dev/null || echo "run c$c failed ($?)" >&2
  echo "== cell $c (dpr $dpr)"
  grep -v '^\s*at ' "$out.log" | sed 's/^\[merge-ab [0-9:]*\] //' || true
  node -e 'const d=require(process.argv[1]);for(const r of d)console.log(r.scenario,r.tier,JSON.stringify(r.info),r.error??"",(r.errors||[]).join(";"))' "$PWD/$out/merge-ab.json" || true
done
