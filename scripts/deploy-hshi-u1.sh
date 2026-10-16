#!/usr/bin/env bash
# Deploy an exact git commit to the dev or prod service on hshi-u1.
#
#   scripts/deploy-hshi-u1.sh dev  [<commit>]   # default commit: HEAD
#   scripts/deploy-hshi-u1.sh prod [<commit>]
#
# - Packages the commit with `git archive` on the editing machine (never the working tree), copies
#   it to hshi-u1 and runs deploy/bin/install-release.sh there (install --frozen-lockfile, build,
#   migrations for that env only, switch, restart ONLY that env's unit, /healthz version check,
#   automatic rollback on failure). Nothing is built or executed locally.
# - prod refuses to deploy the implicit HEAD when tracked files have uncommitted changes (so what
#   you tested is what ships). Passing an explicit commit is always exact, regardless of the tree.
# - Rollback: scripts/deploy-hshi-u1.sh prod <previous-sha>  (reuses the already-built release).
# - Keeps the previous live release's content-hashed client assets (apps/client/dist/assets) in the
#   new live tree for one more release, so tabs opened before the deploy can still lazy-load their
#   old chunks (see carry_assets below).
set -euo pipefail
HOST="${CT_HOST:-hshi-u1}"

# carry_assets snapshot|merge|discard <dev|prod> <sha> -- runs ON the host (sent with `declare -f`).
# Vite names every file in apps/client/dist/assets by content hash and the server marks them
# immutable, so an old tab asks for TownGame-<oldhash>.js after a deploy and would get a 404.
#   snapshot: before the deploy, copy the live <env> tree's OWN assets to a staging dir.
#   merge:    after a successful deploy, add the staged files the new live tree does not have
#             (never overwrites; same name = same content), restoring the read-only bit.
#   discard:  failed deploy -- drop the staging dir; the live tree was not changed.
# A tree's own files are listed in dist/.own-assets (written before its first merge; express.static
# never serves dotfiles), so carried files are not carried again: old chunks live one release.
# Idempotent: re-running a phase, or redeploying the same commit, changes nothing more.
# CT_ROOT overrides the layout detection (isolated tests only).
carry_assets() {
  local phase="$1" env="$2" sha="$3" ct dist stage f n=0 ro=0
  if [[ -n ${CT_ROOT:-} ]]; then ct=$CT_ROOT
  elif [[ -d /srv/clocktower/releases && -w /srv/clocktower/releases ]]; then ct=/srv/clocktower
  else ct=$HOME/clocktower; fi
  dist="$ct/$env/apps/client/dist" # prod is the releases/<sha> symlink, dev a plain tree
  stage="$HOME/clocktower/incoming/carry-assets-$env-$sha"
  case $phase in
    snapshot)
      rm -rf "$stage"
      if [[ ! -d $dist/assets ]]; then echo "[carry-assets] no live $env client assets to keep"; return 0; fi
      mkdir -p "$stage"
      if [[ -f $dist/.own-assets ]]; then
        while IFS= read -r f; do
          [[ -n $f && $f != */* && -f $dist/assets/$f ]] || continue
          cp --preserve=mode,timestamps "$dist/assets/$f" "$stage/" && n=$((n + 1))
        done <"$dist/.own-assets"
      else # built before this mechanism: nothing was ever carried into it, all files are its own
        for f in "$dist"/assets/*; do
          [[ -f $f ]] || continue
          cp --preserve=mode,timestamps "$f" "$stage/" && n=$((n + 1))
        done
      fi
      echo "[carry-assets] staged $n asset(s) of the live $env release $(cat "$ct/$env/.release-sha" 2>/dev/null || echo '?')"
      ;;
    merge)
      [[ -d $stage ]] || return 0
      if [[ ! -d $dist/assets || "$(cat "$ct/$env/.release-sha" 2>/dev/null)" != "$sha" ]]; then
        echo "[carry-assets] live $env is not $sha; previous assets not merged"
        rm -rf "$stage"
        return 0
      fi
      [[ -w $dist && -w $dist/assets ]] || ro=1
      chmod u+w "$dist" "$dist/assets"
      if [[ ! -f $dist/.own-assets ]]; then
        { (cd "$dist/assets" && find . -maxdepth 1 -type f -printf '%f\n' | LC_ALL=C sort) >"$dist/.own-assets.tmp" &&
          mv "$dist/.own-assets.tmp" "$dist/.own-assets"; } || echo "[carry-assets] warning: could not record $env's own assets"
      fi
      for f in "$stage"/*; do
        [[ -f $f && ! -e $dist/assets/${f##*/} ]] || continue
        cp --preserve=mode,timestamps "$f" "$dist/assets/" && n=$((n + 1))
      done
      if [[ $ro == 1 ]]; then chmod -R a-w "$dist"; fi
      rm -rf "$stage"
      echo "[carry-assets] kept $n asset(s) of the previous $env release in $dist/assets"
      ;;
    discard) rm -rf "$stage" ;;
    *) echo "carry_assets: unknown phase $phase" >&2; return 2 ;;
  esac
}
# Best effort: a failure here never fails or blocks a deploy (worst case = today's behaviour).
remote_carry_assets() { # <phase>
  ssh -o BatchMode=yes "$HOST" "bash -s" <<<"set -euo pipefail; $(declare -f carry_assets); carry_assets $1 $ENVNAME $SHA" ||
    echo "[deploy] warning: carry_assets $1 failed (old tabs may need a reload after this deploy)" >&2
}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVNAME="${1:-}"
REF="${2:-}"
[[ $ENVNAME == dev || $ENVNAME == prod ]] || { echo "usage: $0 dev|prod [<commit>]" >&2; exit 2; }
cd "$ROOT"

if [[ -z $REF ]]; then
  REF=HEAD
  if [[ $ENVNAME == prod ]] && ! git diff --quiet HEAD --; then
    echo "refusing prod deploy of HEAD: tracked files have uncommitted changes." >&2
    echo "commit first, or pass an explicit commit id to deploy exactly that commit." >&2
    git status --short --untracked-files=no >&2
    exit 1
  fi
fi
# Games live in memory: restarting prod mid-game ends them for everyone. Refuse unless forced.
if [[ $ENVNAME == prod && "${CT_FORCE_DEPLOY:-}" != 1 ]]; then
  ACTIVE=$(ssh -o BatchMode=yes "$HOST" "curl -fsS --max-time 3 http://127.0.0.1:3000/internal/active-games" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("activeGames",0))' 2>/dev/null || echo 0)
  if [[ ${ACTIVE:-0} -gt 0 ]]; then
    echo "refusing prod deploy: $ACTIVE game(s) in progress would be lost. Wait, or set CT_FORCE_DEPLOY=1." >&2
    exit 1
  fi
fi
SHA=$(git rev-parse --verify --quiet "${REF}^{commit}") || { echo "unknown commit: $REF" >&2; exit 1; }
SUBJECT=$(git log -1 --format=%s "$SHA")
echo "[deploy] $ENVNAME <- $SHA ($SUBJECT)"

remote_carry_assets snapshot

TMP=$(mktemp -d "${TMPDIR:-/tmp}/ct-deploy.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
TARBALL="$TMP/clocktower-$SHA.tar.gz"
git archive --format=tar.gz -o "$TARBALL" "$SHA"
echo "[deploy] archive $(du -h "$TARBALL" | cut -f1)"

ssh -o BatchMode=yes "$HOST" "mkdir -p ~/clocktower/incoming"
scp -q "$TARBALL" "$HOST:clocktower/incoming/"
START=$(date +%s)
set +e
ssh -o BatchMode=yes "$HOST" "bash -s -- $ENVNAME $SHA \$HOME/clocktower/incoming/clocktower-$SHA.tar.gz" <"$ROOT/deploy/bin/install-release.sh"
STATUS=$?
set -e
echo "[deploy] $ENVNAME exit=$STATUS in $(( $(date +%s) - START ))s"
if [[ $STATUS -eq 0 ]]; then remote_carry_assets merge; else remote_carry_assets discard; fi
if [[ $STATUS -eq 0 ]]; then
  PORT=$([[ $ENVNAME == prod ]] && echo 3000 || echo 3001)
  ssh -o BatchMode=yes "$HOST" "(systemctl is-active clocktower-$ENVNAME 2>/dev/null | grep -qx active && echo 'active (system unit)') || systemctl --user is-active clocktower-$ENVNAME; curl -fsS http://127.0.0.1:$PORT/healthz; echo"
fi
exit $STATUS
