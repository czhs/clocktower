# shellcheck shell=bash
# Load private operator settings (host alias, public URL, …) from the gitignored ops.local.env at
# the repo root (copy ops.example.env). Sourced by scripts/*.sh that run on the editing machine.
# Values already set in the caller's environment win, so `CT_HOST=other scripts/remote.sh …` keeps
# working. Only KEY=VALUE lines with CT_* / E2E_* keys are read; nothing is executed.
ct_load_ops_env() {
  local root="$1" f line key val
  f="${CT_OPS_ENV:-$root/ops.local.env}"
  [[ -f $f ]] || return 0
  while IFS= read -r line || [[ -n $line ]]; do
    line="${line%%#*}"                       # strip comments
    line="${line#"${line%%[![:space:]]*}"}"  # ltrim
    line="${line%"${line##*[![:space:]]}"}"  # rtrim
    [[ $line =~ ^(CT_|E2E_)[A-Z0-9_]*= ]] || continue
    key="${line%%=*}" val="${line#*=}"
    val="${val#\"}" val="${val%\"}" val="${val#\'}" val="${val%\'}"
    [[ -n ${!key+x} ]] && continue           # caller's environment wins
    export "$key=$val"
  done <"$f"
}
# ct_require_host: the SSH alias of the build/prod host (CT_HOST), or a clear error.
ct_require_host() {
  if [[ -z ${CT_HOST:-} ]]; then
    echo "CT_HOST is not set: copy ops.example.env to ops.local.env and fill it in (or export CT_HOST)." >&2
    exit 2
  fi
  printf '%s' "$CT_HOST"
}
