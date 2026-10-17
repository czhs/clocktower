#!/usr/bin/env bash
# Check that this machine (or PIXEL3D_HOST) can render: node, npm deps, Playwright Chromium, Python + Pillow + numpy,
# then render one tiny still and print which GPU WebGL got (hardware vs SwiftShader software rendering).
#   tools/doctor.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST=${PIXEL3D_HOST:-local}
ok() { echo "  ok    $*"; }; bad() { echo "  FAIL  $*"; FAIL=1; }
FAIL=0
echo "charkit doctor (mode: $([[ -z "$HOST" || "$HOST" == local ]] && echo local || echo "remote $HOST"))"
R="$ROOT/tools/remote.sh"
V=$("$R" node -e 'console.log(process.versions.node)' 2>/dev/null) && [[ ${V%%.*} -ge 18 ]] && ok "node $V" || bad "node >= 18 not found (install Node.js 18+; 20 or 22 recommended)"
"$R" --no-sync node -e "import('three').then(()=>console.log('three ok'))" >/dev/null 2>&1 && ok "three (npm install done)" || bad "three missing: run npm install in the kit root"
"$R" --no-sync node -e "import('playwright').then(m=>{const p=m.chromium.executablePath();require('fs').accessSync(p);console.log(p)})" >/dev/null 2>&1 \
  && ok "playwright chromium" || bad "playwright chromium missing: run npx playwright install chromium (Linux may also need: npx playwright install-deps chromium)"
"$R" --no-sync python3 -c 'import PIL, numpy; print(PIL.__version__, numpy.__version__)' >/dev/null 2>&1 && ok "python3 + Pillow + numpy" || bad "python3 with Pillow and numpy missing: python3 -m pip install -r requirements.txt"
[[ $FAIL == 0 ]] || { echo "fix the FAIL lines, then run tools/doctor.sh again"; exit 1; }
OUT=shots/doctor/probe.png
T0=$(date +%s)
LOG=$("$ROOT/tools/shot.sh" char-stage "$OUT" --size 320x180 --q 'scale=1&char=mannequin&bg=key' --t 1 --gpu-info 2>&1)
CODE=$?; T1=$(date +%s)
GPU=$(echo "$LOG" | sed -n 's/^GPU: //p' | head -1)
if [[ $CODE != 0 ]]; then
  echo "$LOG" | tail -15
  bad "test render failed (exit $CODE). Try PIXEL3D_GL=swiftshader tools/doctor.sh (software rendering), or see README 'Troubleshooting'"
  exit 1
fi
ok "test render $OUT in $((T1 - T0)) s"
echo "  GPU   ${GPU:-unknown}"
case "$GPU" in
  *SwiftShader*|*swiftshader*|*llvmpipe*|*Software*) echo "  note  software rendering: correct pixels, but a full charpack takes several minutes instead of ~1 (use --jobs 2-4)";;
esac
echo "all good — next: tools/charpack.sh duelist --only turnaround"
