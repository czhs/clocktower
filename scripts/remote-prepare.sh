#!/usr/bin/env bash
# Runs ON hshi-u1 inside a sandbox: (re)installs deps only when manifests changed.
set -euo pipefail
stamp() { { cat package.json pnpm-workspace.yaml apps/*/package.json packages/*/package.json pnpm-lock.yaml 2>/dev/null || true; } | sha256sum | cut -c1-16; }
STAMP_SRC=$(stamp)
if [[ ! -d node_modules || "$(cat .install-stamp 2>/dev/null)" != "$STAMP_SRC" ]]; then
  echo "[remote-prepare] installing dependencies…" >&2
  # Serialise installs across sandboxes (shared pnpm store).
  flock ~/clocktower/.pnpm-install.lock pnpm install --prefer-offline --reporter=append-only >&2
  stamp > .install-stamp
fi
