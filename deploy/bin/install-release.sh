#!/usr/bin/env bash
# Runs ON hshi-u1 (streamed by scripts/deploy-hshi-u1.sh via `ssh hshi-u1 bash -s`).
#   install-release.sh <dev|prod> <sha> <tarball>
# prod: extract -> ~/clocktower/releases/<sha> (immutable; reused if already built), install, build,
#       backup DB, atomically switch ~/clocktower/prod symlink, restart ONLY clocktower-prod,
#       health-check /healthz (version must equal <sha>); on failure roll the symlink back.
# dev:  extract -> ~/clocktower/dev.new, install (frozen lockfile, falls back to non-frozen),
#       build, swap into ~/clocktower/dev (old kept until healthy), restart ONLY clocktower-dev.
set -euo pipefail
ENVNAME="$1"; SHA="$2"; TARBALL="$3"
# Two layouts: SYSTEM mode (hardened, after deploy/secure/setup-dedicated-user.sh): runtime in
# /srv/clocktower, services are system units running as the unprivileged 'clocktower' user, and
# this script (running as the admin user) controls them via a narrow NOPASSWD sudoers rule.
# USER mode (legacy): ~/clocktower + systemd --user units.
if [[ -d /srv/clocktower/releases && -w /srv/clocktower/releases ]]; then
  MODE=system CT=/srv/clocktower
  sc() { sudo -n /usr/bin/systemctl "$@"; }
  sc_status() { systemctl status "$@"; }
  # Copy packages out of the admin's pnpm store instead of hard-linking, so nothing the service
  # runs is shared with (or modifiable through) the admin's home directory.
  export npm_config_package_import_method=copy
else
  MODE=user CT="$HOME/clocktower"
  sc() { systemctl --user "$@"; }
  sc_status() { systemctl --user status "$@"; }
fi
LOCKS="$HOME/clocktower"
mkdir -p "$LOCKS"
. "$HOME/clocktower/env.sh"
log() { printf '[deploy:%s %s] %s\n' "$ENVNAME" "$(date +%H:%M:%S)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

case "$ENVNAME" in
  dev) PORT=3001 UNIT=clocktower-dev ;;
  prod) PORT=3000 UNIT=clocktower-prod ;;
  *) die "env must be dev or prod" ;;
esac
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "sha must be a full 40-char commit id"
[[ -f "$CT/env/$ENVNAME.env" ]] || die "missing $CT/env/$ENVNAME.env — run scripts/setup-hshi-u1.sh first"
if [[ $MODE == system ]]; then
  [[ -f "/etc/systemd/system/$UNIT.service" ]] || die "missing system unit $UNIT"
else
  [[ -f "$HOME/.config/systemd/user/$UNIT.service" ]] || die "missing unit $UNIT — run scripts/setup-hshi-u1.sh first"
fi

exec 9>"$LOCKS/.deploy-$ENVNAME.lock"
flock -n 9 || die "another $ENVNAME deploy is running"

build_tree() { # $1 = dir (already extracted)
  local dir="$1"
  cd "$dir"
  log "pnpm install --frozen-lockfile"
  if ! flock "$LOCKS/.pnpm-install.lock" pnpm install --frozen-lockfile --prefer-offline --reporter=append-only >&2; then
    [[ $ENVNAME == dev ]] || die "frozen-lockfile install failed (prod never falls back)"
    log "frozen install failed; dev fallback: pnpm install --no-frozen-lockfile"
    flock "$LOCKS/.pnpm-install.lock" pnpm install --no-frozen-lockfile --prefer-offline --reporter=append-only >&2
  fi
  # Equivalent of the root `pnpm build` (whose unquoted ./packages/* glob is expanded by sh in
  # some trees): build every workspace package that has a build script.
  log "pnpm -r --if-present run build"
  pnpm -r --if-present run build >&2
  [[ -f apps/server/dist/server.js ]] || die "build produced no apps/server/dist/server.js"
  printf 'CT_VERSION=%s\n' "$SHA" >.release.env
  printf '%s\n' "$SHA" >.release-sha
}

migrate() { # $1 = dir. Runs migrations for THIS env only, if the db package provides a CLI.
  local dir="$1"
  if [[ $MODE == system ]]; then
    log "migrations run at server start as the 'clocktower' user (admin has no access to the DB)"
    return 0
  fi
  if [[ -f "$dir/packages/db/src/migrate-cli.ts" ]]; then
    log "running DB migrations for $ENVNAME"
    ( cd "$dir" && set -a && . "$CT/env/$ENVNAME.env" && set +a &&
      export APP_ENV DATABASE_URL="file:$CT/data/$ENVNAME/clocktower.db" &&
      pnpm db:migrate >&2 )
    chmod 600 "$CT/data/$ENVNAME"/clocktower.db* 2>/dev/null || true
  else
    log "no packages/db/src/migrate-cli.ts in this release; migrations (if any) run at server start"
  fi
}

health() { # health [expected-sha]: wait up to 40s for /healthz to report that version
  local i body want="${1:-$SHA}"
  for i in $(seq 1 40); do
    body=$(curl -fsS --max-time 2 "http://127.0.0.1:$PORT/healthz" 2>/dev/null || true)
    if [[ -n $body ]] && python3 -c 'import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if d.get("ok") and d.get("version")==sys.argv[2] else 1)' "$body" "$want"; then
      log "healthy: $body"; return 0
    fi
    sleep 1
  done
  log "health check failed; last body: ${body:-<none>}"
  sc_status "$UNIT" --no-pager -n 20 >&2 || true
  return 1
}

if [[ $ENVNAME == prod ]]; then
  REL="$CT/releases/$SHA"
  if [[ -f "$REL/.release-sha" && -f "$REL/apps/server/dist/server.js" ]]; then
    log "release $SHA already built; reusing"
  else
    rm -rf "$REL.tmp" && mkdir -p "$REL.tmp"
    tar -xzf "$TARBALL" -C "$REL.tmp"
    build_tree "$REL.tmp"
    cd "$CT"; rm -rf "$REL"; mv "$REL.tmp" "$REL"
    chmod -R a-w "$REL/apps/server/dist" "$REL/apps/client/dist" 2>/dev/null || true
  fi
  PREV=$(readlink "$CT/prod" 2>/dev/null || true)
  if [[ $MODE == system ]]; then
    log "pre-deploy backup"; sc start clocktower-backup-prod.service >&2 || die "pre-deploy backup failed"
  elif [[ -f "$CT/data/prod/clocktower.db" ]]; then
    log "pre-deploy backup"; "$CT/bin/backup-db.sh" prod predeploy >&2
  fi
  migrate "$REL"
  ln -sfn "releases/$SHA" "$CT/prod.tmp" && mv -T "$CT/prod.tmp" "$CT/prod"
  log "prod -> releases/$SHA (previous: ${PREV:-none})"
  sc reset-failed "$UNIT" 2>/dev/null || true
  sc restart "$UNIT"
  if ! health; then
    if [[ -n $PREV ]]; then
      log "ROLLING BACK to $PREV"
      ln -sfn "$PREV" "$CT/prod.tmp" && mv -T "$CT/prod.tmp" "$CT/prod"
      # A crash-looping release may have hit StartLimitBurst; clear it or the restart is refused.
      sc reset-failed "$UNIT" || true
      sc restart "$UNIT"
      if health "$(cat "$CT/$PREV/.release-sha")"; then log "rollback OK ($PREV)"; else log "ROLLBACK ALSO UNHEALTHY — manual action needed"; fi
      printf '%s FAILED %s rolled-back-to %s\n' "$(date -Is)" "$SHA" "$PREV" >>"$CT/releases/DEPLOY_LOG"
    else
      log "no previous release to roll back to; stopping $UNIT"
      sc stop "$UNIT" || true
    fi
    exit 1
  fi
  printf '%s %s %s\n' "$(date -Is)" "$SHA" "${PREV:-none}" >>"$CT/releases/DEPLOY_LOG"
  # Prune: keep the 5 most recent releases plus current/previous.
  cd "$CT/releases"
  ls -1t | grep -E '^[0-9a-f]{40}$' | tail -n +6 | while read -r old; do
    [[ "releases/$old" == "$(readlink "$CT/prod")" || "releases/$old" == "$PREV" ]] && continue
    log "pruning old release $old"; chmod -R u+w "$old"; rm -rf "$old"
  done
else
  NEW="$CT/dev.new"; OLD="$CT/dev.old"
  rm -rf "$NEW" "$CT"/dev.failed-* && mkdir -p "$NEW"
  tar -xzf "$TARBALL" -C "$NEW"
  build_tree "$NEW"
  migrate "$NEW"
  rm -rf "$OLD"
  [[ -d "$CT/dev" ]] && mv "$CT/dev" "$OLD"
  mv "$NEW" "$CT/dev"
  sc reset-failed "$UNIT" 2>/dev/null || true
  sc restart "$UNIT"
  if ! health; then
    if [[ -d $OLD ]]; then
      log "ROLLING BACK dev to previous tree"
      mv "$CT/dev" "$CT/dev.failed-$SHA"; mv "$OLD" "$CT/dev"
      sc reset-failed "$UNIT" || true
      sc restart "$UNIT"
      health "$(cat "$CT/dev/.release-sha" 2>/dev/null)" || log "ROLLBACK ALSO UNHEALTHY"
    fi
    exit 1
  fi
  rm -rf "$OLD"
fi
rm -f "$TARBALL"
log "done: $UNIT @ $SHA"
