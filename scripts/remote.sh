#!/usr/bin/env bash
# Run a command ON the build/prod host against a fresh copy of this working tree.
# All installs/builds/tests execute on the host; the editing machine only syncs.
# The host is CT_HOST (an SSH alias), read from the gitignored ops.local.env (see ops.example.env).
#
#   scripts/remote.sh <command...>            e.g. scripts/remote.sh pnpm test
#   CT_AGENT=voice scripts/remote.sh pnpm --filter @ct/voice exec vitest run
#   scripts/remote.sh --no-sync <command...>  skip the rsync step
#
# Each agent gets its own sandbox (~/clocktower/work/<CT_AGENT>) so concurrent test runs and
# installs don't trample each other. pnpm's content store is shared, so installs are fast.
# Sandbox installs always use the frozen lockfile (scripts/remote-prepare.sh). Only an explicit
# dependency command (pnpm install|add|update|remove|dedupe …) may change pnpm-lock.yaml; its new
# lockfile is copied back into the local tree and announced. Any other run that leaves a different
# lockfile behind is NOT copied over yours: it is saved as pnpm-lock.yaml.remote.<agent> + warning.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
. "$ROOT/scripts/lib/ops-env.sh"; ct_load_ops_env "$ROOT"
HOST="$(ct_require_host)"
AGENT="${CT_AGENT:-lead}"
RDIR="clocktower/work/${AGENT}"
# v2.3 HOST-12 (sec-host), opt-in until the lead flips the default: CT_BUILD_SANDBOX=1 runs everything
# (rsync target, installs, builds, tests) as the unprivileged 'ct-build' user inside its systemd sandbox
# via the root-owned wrapper /usr/local/sbin/ct-build-run (deploy/secure/v2.3/apply.sh installs it),
# so dependency/repo code never runs as the admin account. Workspace: /srv/ct-build/work/<agent>.
# Browser lock inside the sandbox: ~/clocktower/browser.lock (= /srv/ct-build/clocktower/browser.lock).
SANDBOX="${CT_BUILD_SANDBOX:-0}"
[[ $AGENT =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]] || { echo "remote.sh: bad CT_AGENT" >&2; exit 2; }
RUNP="sudo -n /usr/local/sbin/ct-build-run $AGENT"

SYNC=1
if [[ "${1:-}" == "--no-sync" ]]; then SYNC=0; shift; fi
[[ $# -gt 0 ]] || { echo "usage: $0 [--no-sync] <command...>" >&2; exit 2; }

if [[ $SYNC == 1 && $SANDBOX == 1 ]]; then
  rsync -az --delete --exclude-from="$ROOT/scripts/rsync-excludes.txt" --rsync-path="$RUNP rsync" "$ROOT/" "$HOST:./" || { rc=$?; [[ $rc == 24 ]] || { echo "remote.sh: rsync (build sandbox) failed ($rc)" >&2; exit $rc; }; }
elif [[ $SYNC == 1 ]]; then
  ssh -o BatchMode=yes "$HOST" "mkdir -p ~/$RDIR"
  # Exit 24 = "some files vanished" (other agents create/delete files in the shared tree while we
  # copy): harmless for this run, so don't abort (set -e) silently on it.
  rsync -az --delete --exclude-from="$ROOT/scripts/rsync-excludes.txt" "$ROOT/" "$HOST:$RDIR/" || { rc=$?; [[ $rc == 24 ]] || { echo "remote.sh: rsync failed ($rc)" >&2; exit $rc; }; }
fi

# Quote the command for the remote shell.
CMD=$(printf '%q ' "$@")
# An explicit dependency-changing pnpm command (it does its own install; see remote-prepare.sh).
EXPLICIT=0
if [[ ${1:-} == pnpm ]]; then
  for a in "${@:2}"; do
    case "$a" in -*) continue ;; install|i|add|update|up|upgrade|remove|rm|uninstall|un|dedupe|import) EXPLICIT=1 ;; esac
    break
  done
fi
set +e
# Every command runs in a resource-capped systemd scope so test/browser runs can never starve the
# prod/dev services on the same machine (the build host is also the production host). Many agents run at
# once, so each scope is also capped lower (300 %) and runs at the lowest CPU/IO priority (nice 19,
# idle IO class, low CPUWeight): prod always wins the CPU when it needs it. All scopes share
# ctwork.slice, which caps the whole agent fleet at 6 cores / 7 GiB (set once, persistent, no sudo:
#   systemctl --user set-property ctwork.slice CPUQuota=600% MemoryMax=7G MemorySwapMax=0 CPUWeight=10 IOWeight=10).
CAP="systemd-run --user --scope --quiet --slice=ctwork.slice -p MemoryMax=${CT_MEM_MAX:-4G} -p MemorySwapMax=0 -p CPUQuota=${CT_CPU_QUOTA:-300%} -p CPUWeight=10 -p IOWeight=10 -- nice -n 19 ionice -c3"
if [[ $SANDBOX == 1 ]]; then
  # The wrapper applies the resource caps (per run + the whole ctbuild.slice) and the sandbox.
  ssh -o BatchMode=yes "$HOST" "$RUNP bash -c $(printf %q "CT_EXPLICIT_INSTALL=$EXPLICIT bash scripts/remote-prepare.sh && $CMD")"
else
  ssh -o BatchMode=yes "$HOST" "export XDG_RUNTIME_DIR=/run/user/\$(id -u); cd ~/$RDIR && . ~/clocktower/env.sh && CT_EXPLICIT_INSTALL=$EXPLICIT bash scripts/remote-prepare.sh && $CAP bash -c $(printf %q "$CMD")"
fi
STATUS=$?
set -e
# Lockfile: bring it back only for an explicit dependency command; otherwise never overwrite.
# (With --no-sync the sandbox may simply be older than your tree, so only explicit commands count.)
if [[ $SANDBOX == 1 ]]; then HAVE_LOCK="$RUNP test -f pnpm-lock.yaml"; LOCKSRC="$HOST:pnpm-lock.yaml"; LOCKOPT=(--rsync-path="$RUNP rsync"); else HAVE_LOCK="test -f ~/$RDIR/pnpm-lock.yaml"; LOCKSRC="$HOST:$RDIR/pnpm-lock.yaml"; LOCKOPT=(); fi
if [[ $SYNC == 1 || $EXPLICIT == 1 ]] && ssh -o BatchMode=yes "$HOST" "$HAVE_LOCK"; then
  # per-agent temp name: several agents finish at once and must not race on one file
  LOCKTMP="$ROOT/pnpm-lock.yaml.remote.$AGENT.$$"
  rsync -az ${LOCKOPT[@]+"${LOCKOPT[@]}"} "$LOCKSRC" "$LOCKTMP" && {
    if cmp -s "$LOCKTMP" "$ROOT/pnpm-lock.yaml" 2>/dev/null; then
      rm -f "$LOCKTMP"
    elif [[ $EXPLICIT == 1 ]]; then
      mv "$LOCKTMP" "$ROOT/pnpm-lock.yaml"
      echo "remote.sh: pnpm-lock.yaml UPDATED by '$*' — review the diff and commit it." >&2
    else
      mv "$LOCKTMP" "$ROOT/pnpm-lock.yaml.remote.$AGENT"
      echo "remote.sh: WARNING the sandbox lockfile differs from yours; NOT copied. Saved as pnpm-lock.yaml.remote.$AGENT" >&2
    fi
  }
fi
exit $STATUS
