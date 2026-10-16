#!/usr/bin/env bash
# Runs ON the host inside a sandbox: (re)installs deps only when manifests changed, ALWAYS from the
# committed lockfile (--frozen-lockfile): a sandbox never resolves versions nobody reviewed
# (security v2.3, REPO-06). To change dependencies, run the install explicitly, e.g.
#   CT_AGENT=lead scripts/remote.sh pnpm install        (or pnpm add/update/remove …)
# remote.sh then sets CT_EXPLICIT_INSTALL=1, this step is skipped, and the new lockfile is copied
# back to the editing machine (announced on stderr) for review and commit.
set -euo pipefail
stamp() { { cat package.json pnpm-workspace.yaml apps/*/package.json packages/*/package.json pnpm-lock.yaml 2>/dev/null || true; } | sha256sum | cut -c1-16; }
if [[ ${CT_EXPLICIT_INSTALL:-} == 1 ]]; then
  echo "[remote-prepare] explicit dependency command: skipping the frozen install" >&2
  exit 0
fi
STAMP_SRC=$(stamp)
if [[ ! -d node_modules || "$(cat .install-stamp 2>/dev/null)" != "$STAMP_SRC" ]]; then
  echo "[remote-prepare] installing dependencies (frozen lockfile)…" >&2
  # Serialise installs across sandboxes (shared pnpm store).
  if ! flock ~/clocktower/.pnpm-install.lock pnpm install --frozen-lockfile --prefer-offline --reporter=append-only >&2; then
    echo "[remote-prepare] frozen install FAILED: pnpm-lock.yaml does not match the package.json files." >&2
    echo "  Update it deliberately: CT_AGENT=<you> scripts/remote.sh pnpm install   (then review + commit the lockfile)" >&2
    exit 1
  fi
  stamp > .install-stamp
fi
