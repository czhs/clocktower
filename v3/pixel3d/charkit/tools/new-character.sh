#!/usr/bin/env bash
# Start a new character from the template: characters/<id>.js (spec) + characters/<id>.md (design sheet).
#   tools/new-character.sh <id> "<Display name>" "<one-line brief>"
# <id>: lowercase letters, digits and dashes (it is the file name and the URL parameter char=<id>).
# Refuses to overwrite existing files. Next: fill the design sheet (AGENTS.md stage 1), then render
#   tools/charpack.sh <id> --only turnaround
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ $# -ge 1 ]] || { sed -n '2,6p' "$0"; exit 2; }
ID=$1; NAME=${2:-$1}; BRIEF=${3:-TODO: one-line brief}
[[ "$ID" =~ ^[a-z][a-z0-9-]*$ ]] || { echo "new-character: id must match [a-z][a-z0-9-]*" >&2; exit 2; }
for f in "characters/$ID.js" "characters/$ID.md"; do
  [[ -e "$ROOT/$f" ]] && { echo "new-character: $f exists — refusing to overwrite (it may be your earlier work: continue from it)" >&2; exit 1; }
done
esc() { printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'; }
sed -e "s|__ID__|$(esc "$ID")|g" -e "s|__NAME__|$(esc "$NAME")|g" -e "s|__BRIEF__|$(esc "$BRIEF")|g" "$ROOT/characters/_template.js" > "$ROOT/characters/$ID.js"
sed -e "s|__ID__|$(esc "$ID")|g" -e "s|__NAME__|$(esc "$NAME")|g" -e "s|__BRIEF__|$(esc "$BRIEF")|g" "$ROOT/characters/_TEMPLATE.md" > "$ROOT/characters/$ID.md"
echo "created characters/$ID.js and characters/$ID.md"
echo "next: tools/charpack.sh $ID --only turnaround   (then look at shots/char-$ID/turnaround.png)"
