#!/usr/bin/env bash
# One-time (idempotent) host setup for the dev + prod services on hshi-u1. Run from the editing
# machine; it only copies deploy files over SSH and runs deploy/bin/bootstrap.sh ON hshi-u1.
#
#   scripts/setup-hshi-u1.sh
#
# Creates the ~/clocktower layout, env/{dev,prod}.env (secrets generated on hshi-u1 with openssl,
# chmod 600, never printed), installs systemd --user units (clocktower-dev, clocktower-prod,
# clocktower-backup.timer) and ~/clocktower/bin/{backup-db.sh,install-release.sh}.
# It never starts or restarts the app services; use scripts/deploy-hshi-u1.sh for that.
set -euo pipefail
HOST="${CT_HOST:-hshi-u1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE=clocktower/.deploy-staging

ssh -o BatchMode=yes "$HOST" "rm -rf ~/$STAGE && mkdir -p ~/$STAGE/bin ~/$STAGE/systemd"
scp -q "$ROOT"/deploy/systemd/* "$HOST:$STAGE/systemd/"
scp -q "$ROOT/deploy/bin/install-release.sh" "$ROOT/deploy/bin/bootstrap.sh" "$ROOT/scripts/backup-db.sh" "$HOST:$STAGE/bin/"
ssh -o BatchMode=yes "$HOST" "bash ~/$STAGE/bin/bootstrap.sh ~/$STAGE"
