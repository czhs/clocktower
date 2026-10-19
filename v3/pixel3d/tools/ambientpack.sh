#!/usr/bin/env bash
# Ambient pack (owner: ambient-core; docs/AMBIENT.md §Tools): 1x real-time GIF of a system on scenes/ambient-stage.js
# with the scripted walker at game speed, a x3 frame strip of the first reaction, the cadence (holds) check on a still
# stage, determinism, reaction lead time at game speed, GL calls. Syncs to the render host, runs tools/ambientpack.py
# there, pulls <out>/ back (not raw/). Then LOOK at every PNG with the Read tool and read report.txt.
#   tools/ambientpack.sh <system>[,<sys2>] [--tod noon|golden|night] [--dur 18] [--walker wanderer|hound|...]
#                        [--crop x,y,w,h] [--strip t0] [--q 'k=v&k2=v'] [--out shots/ambient-<system>]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ $# -ge 1 ]] || { sed -n '2,7p' "$0"; exit 2; }
SYS=$1; NAME=${SYS%%,*}; OUT="shots/ambient-${NAME#_}"
for ((i=1; i<=$#; i++)); do [[ "${!i}" == "--out" ]] && { j=$((i+1)); OUT=${!j}; }; done
set +e
"$ROOT/tools/remote.sh" python3 tools/ambientpack.py "$@"
CODE=$?
set -e
mkdir -p "$ROOT/$OUT"
rsync -az --exclude 'raw/' "${PIXEL3D_HOST:-render-host}:${PIXEL3D_RDIR:-pixel3d}/$OUT/" "$ROOT/$OUT/"
echo "pulled → $OUT/"
exit $CODE
