#!/usr/bin/env bash
# Run one easter-egg sprite job through the Codex CLI with gpt-6-astra (the only step that runs on
# the Mac: codex is an API client). Prerequisite: eggs/refs/<job>/{ref.png,context.png,prompt.md}
# made on hshi-u1 (`tsx eggs/scripts/build.ts refs <job>`) and pulled back. They are copied into
# eggs/staging/<job>/ (codex's sandboxed workdir, never synced); the result is copied to
# eggs/incoming/<job>.png, which the next remote run syncs for `build.ts ingest <job>`.
#
#   packages/assets/eggs/scripts/codex-job.sh <job>
#
# codex runs with -C eggs/staging/<job> and the workspace-write sandbox, so it can only write there.
# No secrets are passed. The prompt is the part of prompt.md after the first '---' line.
set -euo pipefail
JOB="$1"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$HERE/staging/$JOB"
CODEX="${CODEX:-$HOME/.local/bin/codex}"
MODEL="${AI_MODEL:-gpt-6-astra}"
REFS="$HERE/refs/$JOB"
[[ -f "$REFS/ref.png" && -f "$REFS/prompt.md" ]] || { echo "missing $REFS/ref.png or prompt.md" >&2; exit 2; }
mkdir -p "$DIR" "$HERE/incoming"
cp "$REFS"/ref.png "$REFS"/prompt.md "$DIR"/
[[ -f "$REFS/context.png" ]] && cp "$REFS/context.png" "$DIR"/
rm -f "$DIR/out.png"
ATTACH=(-i "$DIR/ref.png")
[[ -f "$DIR/context.png" ]] && ATTACH+=(-i "$DIR/context.png")
START=$(date +%s)
awk 'f{print} /^---$/{f=1}' "$DIR/prompt.md" | "$CODEX" exec -m "$MODEL" -C "$DIR" -s workspace-write --skip-git-repo-check \
  -c approval_policy=never -c 'notify=[]' "${ATTACH[@]}" - >"$DIR/codex.log" 2>&1 || { echo "codex failed, see $DIR/codex.log" >&2; tail -20 "$DIR/codex.log" >&2; exit 1; }
echo "codex finished in $(( $(date +%s) - START ))s"
[[ -f "$DIR/out.png" ]] || { echo "no out.png in $DIR; log tail:" >&2; tail -30 "$DIR/codex.log" >&2; exit 1; }
cp "$DIR/out.png" "$HERE/incoming/$JOB.png"
file "$HERE/incoming/$JOB.png"
