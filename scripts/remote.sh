#!/usr/bin/env bash
# Run a command ON hshi-u1 against a fresh copy of this working tree.
# All installs/builds/tests execute on hshi-u1 (the 3060 box); the editing machine only syncs.
#
#   scripts/remote.sh <command...>            e.g. scripts/remote.sh pnpm test
#   CT_AGENT=voice scripts/remote.sh pnpm --filter @ct/voice exec vitest run
#   scripts/remote.sh --no-sync <command...>  skip the rsync step
#
# Each agent gets its own sandbox (~/clocktower/work/<CT_AGENT>) so concurrent test runs and
# installs don't trample each other. pnpm's content store is shared, so installs are fast.
# If the run changes pnpm-lock.yaml, it is copied back into the local tree.
set -euo pipefail
HOST="${CT_HOST:-hshi-u1}"
AGENT="${CT_AGENT:-lead}"
RDIR="clocktower/work/${AGENT}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

SYNC=1
if [[ "${1:-}" == "--no-sync" ]]; then SYNC=0; shift; fi
[[ $# -gt 0 ]] || { echo "usage: $0 [--no-sync] <command...>" >&2; exit 2; }

if [[ $SYNC == 1 ]]; then
  ssh -o BatchMode=yes "$HOST" "mkdir -p ~/$RDIR"
  # Exit 24 = "some files vanished" (other agents create/delete files in the shared tree while we
  # copy): harmless for this run, so don't abort (set -e) silently on it.
  rsync -az --delete --exclude-from="$ROOT/scripts/rsync-excludes.txt" "$ROOT/" "$HOST:$RDIR/" || { rc=$?; [[ $rc == 24 ]] || { echo "remote.sh: rsync failed ($rc)" >&2; exit $rc; }; }
fi

# Quote the command for the remote shell.
CMD=$(printf '%q ' "$@")
set +e
# Every command runs in a resource-capped systemd scope so test/browser runs can never starve the
# prod/dev services on the same machine (hshi-u1 is also the production host). Many agents run at
# once, so each scope is also capped lower (300 %) and runs at the lowest CPU/IO priority (nice 19,
# idle IO class, low CPUWeight): prod always wins the CPU when it needs it. All scopes share
# ctwork.slice, which caps the whole agent fleet at 6 cores / 7 GiB (set once, persistent, no sudo:
#   systemctl --user set-property ctwork.slice CPUQuota=600% MemoryMax=7G MemorySwapMax=0 CPUWeight=10 IOWeight=10).
CAP="systemd-run --user --scope --quiet --slice=ctwork.slice -p MemoryMax=${CT_MEM_MAX:-4G} -p MemorySwapMax=0 -p CPUQuota=${CT_CPU_QUOTA:-300%} -p CPUWeight=10 -p IOWeight=10 -- nice -n 19 ionice -c3"
ssh -o BatchMode=yes "$HOST" "export XDG_RUNTIME_DIR=/run/user/\$(id -u); cd ~/$RDIR && . ~/clocktower/env.sh && bash scripts/remote-prepare.sh && $CAP bash -c $(printf %q "$CMD")"
STATUS=$?
set -e
# Bring back the lockfile if the remote install changed it.
if ssh -o BatchMode=yes "$HOST" "test -f ~/$RDIR/pnpm-lock.yaml"; then
  # per-agent temp name: several agents finish at once and must not race on one file
  LOCKTMP="$ROOT/pnpm-lock.yaml.remote.$AGENT.$$"
  rsync -az "$HOST:$RDIR/pnpm-lock.yaml" "$LOCKTMP" && {
    if ! cmp -s "$LOCKTMP" "$ROOT/pnpm-lock.yaml" 2>/dev/null; then mv "$LOCKTMP" "$ROOT/pnpm-lock.yaml"; else rm -f "$LOCKTMP"; fi
  }
fi
exit $STATUS
