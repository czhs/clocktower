#!/usr/bin/env bash
# Run the roster generator (tools/demo-roster.mjs) on the render host AND bring the roster it wrote back to the Mac.
#   tools/demo-roster.sh [--browser] [--shots shots/v3-roster] [--check] [--include a,b] [--exclude c] ...
# The .mjs writes src/demo/roster.json on render-host only; the next tools/remote.sh sync pushes the Mac tree over it, so
# the Mac copy must be updated or the roster change is lost. This wrapper passes --emit shots/demo-roster/emit-<run>.json
# (shots/ JSON is never synced over), pulls that file after the run, checks it (valid JSON, version 3, rows, the
# offered / WIP lists consistent with the rows, NO pipeline/skip.txt id anywhere) and copies it to src/demo/roster.json.
# Exit code = the .mjs's (a failed --browser check is still reported as a failure), or 4 when the pulled roster fails
# its checks (then the Mac copy is left untouched).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST=${PIXEL3D_HOST:-render-host}
RDIR=${PIXEL3D_RDIR:-pixel3d}
RUN="shots/demo-roster/emit-$(date +%Y%m%d-%H%M%S)-$$.json"
LOCAL="$ROOT/shots/demo-roster/last-emit.json"
mkdir -p "$ROOT/shots/demo-roster"
rc=0
"$ROOT/tools/remote.sh" node tools/demo-roster.mjs --emit "$RUN" "$@" || rc=$?
if ! rsync -az "$HOST:$RDIR/$RUN" "$LOCAL" 2>/dev/null; then
  echo "demo-roster.sh: the run emitted no roster ($RUN): src/demo/roster.json unchanged (exit $rc)" >&2
  exit $(( rc == 0 ? 4 : rc ))
fi
python3 - "$LOCAL" "$ROOT/pipeline/skip.txt" <<'PY' || { echo "demo-roster.sh: the pulled roster failed its checks: src/demo/roster.json unchanged" >&2; exit 4; }
import json, os, sys
m = json.load(open(sys.argv[1]))
skip = set()
if os.path.exists(sys.argv[2]):
    skip = {l.strip() for l in open(sys.argv[2]) if l.strip() and not l.strip().startswith('#')}
assert m.get('version') == 3, f"version {m.get('version')}"
rows = m.get('characters') or []
assert rows and all(isinstance(r.get('id'), str) for r in rows), 'no rows'
ids = {r['id'] for r in rows}
for k in ('complete', 'shipped', 'wip'):
    assert isinstance(m.get(k), list), f'{k} missing'
    assert set(m[k]) <= ids, f'{k} lists ids without a row: {sorted(set(m[k]) - ids)}'
bad = skip & (ids | set(m['complete']) | set(m['shipped']) | set(m['wip']))
assert not bad, f'skipped ids in the roster: {sorted(bad)}'
print(f"demo-roster.sh: roster ok: {len(m['complete'])} offered, {len(m['wip'])} WIP, {len(rows)} rows, generated {m.get('generated')}")
PY
cp "$LOCAL" "$ROOT/src/demo/roster.json"
echo "demo-roster.sh: pulled $HOST:$RDIR/$RUN -> src/demo/roster.json"
exit $rc
