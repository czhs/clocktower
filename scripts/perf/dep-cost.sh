#!/usr/bin/env bash
# perf-audit: minified+gzip cost of each heavy client dependency in isolation (esbuild, ESM, browser).
#   CT_AGENT=perf-audit scripts/remote.sh bash scripts/perf/dep-cost.sh
set -euo pipefail
cd "$(dirname "$0")/../../apps/client"
ESB=$(node -e "console.log(require.resolve('esbuild/bin/esbuild', {paths:[require.resolve('vite')]}))")
T=$(mktemp -d); E=$PWD/.perf-entry-$$.js; trap "rm -f $E" EXIT
for spec in "livekit-client:*" "phaser:default" "zod:*" "colyseus.js:*" "preact:*"; do
  pkg=${spec%%:*}; kind=${spec#*:}
  if [[ $kind == default ]]; then echo "import P from '$pkg'; globalThis.x=P;" > $E; else echo "import * as P from '$pkg'; globalThis.x=P;" > $E; fi
  $ESB $E --bundle --minify --format=esm --platform=browser --log-level=error --outfile=$T/o.js --resolve-extensions=.js,.mjs,.ts --main-fields=browser,module,main || { echo "$pkg build failed"; continue; }
  printf '%-16s min %7.1f KiB  gz %6.1f KiB  br %6.1f KiB\n' "$pkg" $(echo "$(stat -c%s $T/o.js)/1024" | bc -l) $(echo "$(gzip -9c $T/o.js | wc -c)/1024" | bc -l) $(echo "$(node -e "process.stdout.write(String(require('zlib').brotliCompressSync(require('fs').readFileSync('$T/o.js')).length))")/1024" | bc -l)
done
rm -rf $T
