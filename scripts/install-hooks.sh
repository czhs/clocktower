#!/usr/bin/env bash
# Install this repo's git hooks (qa-deploy). Idempotent; bash + git only (runs on the editing Mac).
#   scripts/install-hooks.sh
# Points core.hooksPath at scripts/hooks so the hooks stay versioned with the repo. An existing
# custom hooksPath is reported and left alone unless --force is given.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
chmod +x scripts/hooks/* scripts/secret-scan.sh
cur=$(git config --local --get core.hooksPath || true)
if [[ -n $cur && $cur != scripts/hooks && ${1:-} != --force ]]; then
  echo "core.hooksPath is already '$cur'; rerun with --force to replace it with scripts/hooks" >&2
  exit 1
fi
git config --local core.hooksPath scripts/hooks
echo "hooks installed: core.hooksPath=scripts/hooks ($(ls scripts/hooks | tr '\n' ' '))"
if command -v gitleaks >/dev/null 2>&1; then
  echo "pre-push will use $(command -v gitleaks) ($(gitleaks version 2>/dev/null))"
else
  echo "gitleaks not found: pre-push will use scripts/secret-scan.sh (install gitleaks for full coverage)"
fi
