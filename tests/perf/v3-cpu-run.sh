#!/usr/bin/env sh
# v3 perf (cpu): named measurement profiles for tests/perf/v3-cpu-tier.ts, run ON THE HOST from the sandbox root:
#   CT_AGENT=v3-perf-cpu scripts/remote.sh env PORT=3486 sh tests/perf/v3-cpu-run.sh <profile> <outdir>   (ports 3486-3489)
# The runner takes the heavy lock itself (shared for the mount, exclusive per measurement window).
set -eu
P="${1:-base}"
OUT="${2:-test-results/v3-cpu-$P}"
T="timeout 3000 pnpm exec tsx tests/perf/v3-cpu-tier.ts --port ${PORT:-3486}"
case "$P" in
  # the prototype's lever table on today's tiers, plus two lever sets that approximate a cpu tier
  levers)
    $T --tiers low --levers res180,res135,noShadow,noNormal,noNormalOutline,postOff,waterOff,lights0,unlit,charsLite,charsHidden,noGrass,noFlowers,noCloudPenumbraNoise,cssUpscale \
      --sets 'cpuA=res135+noShadow+noNormalOutline+postOff+lights0+charsLite;cpuB=res135+noShadow+noNormalOutline+postOff+lights0+charsLite+unlit+cssUpscale' --out "$OUT" ;;
  # before / after: today's low tier vs the real cpu tier (no runtime levers)
  tiers)
    $T --tiers "${TIERS:-low,cpu}" --levers none --out "$OUT" ;;
  # the cpu tier + extra levers on top (what is left)
  cpuplus)
    $T --tiers cpu --levers res135,unlit,charsHidden,noGrass,noFlowers,noDetail,noNpc,postOff,cssUpscale \
      --sets 'cpuGrass=noGrass;cpuGrassDetail=noGrass+noDetail;cpuGrassRes=noGrass+res135' --out "$OUT" ;;
  # v3.1: where the cost lives (unlit per material family, dead-code fragment diagnostics) and the kit swap A/B
  shade)
    $T --tiers cpu --levers unlit,unlitGround,unlitKit,unlitChars,shadeToonKit,shadeKitFlat,shadeGroundFlat,shadeToonMid,shadeAllFlat \
      --sets "${SETS:-v30=shadeToonKit}" --out "$OUT" ;;
  # v3.1: the kit swap with / without the vendor patterns, the v3.0 look, and what is left on top
  kit)
    $T --tiers cpu --levers shadeToonKit,shadeKitPat,unlitGround,unlitChars,charsHidden,res135,postOff \
      --sets "${SETS:-v30=shadeToonKit;kitPat=shadeKitPat}" --out "$OUT" ;;
  gpu)
    $T --tiers "${TIERS:-high,low,cpu}" --levers none --gl gpu --out "$OUT" ;;
  *) echo "unknown profile $P" >&2; exit 2 ;;
esac
