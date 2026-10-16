#!/usr/bin/env bash
# Fallback secret / private-infra scanner (qa-deploy). Bash + git + grep + awk only, so it runs on
# the editing Mac (bash 3.2, BSD grep) as well as Linux CI. Used by scripts/hooks/pre-push when
# gitleaks is not installed; gitleaks with .gitleaks.toml is the primary scanner.
#
#   scripts/secret-scan.sh                    # tracked files in the working tree (current content)
#   scripts/secret-scan.sh --range A..B       # lines ADDED by the commits in A..B
#   scripts/secret-scan.sh --history          # lines added by every commit on every ref (slow)
#   scripts/secret-scan.sh --staged           # lines added in the index (pre-commit use)
#
# Exit 0 = clean, 1 = findings (printed as  rule  path  line-excerpt, values partially masked),
# 2 = usage error. Keep the rule set in sync with .gitleaks.toml.
set -uo pipefail
export LC_ALL=C

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "secret-scan: not in a git repo" >&2; exit 2; }
cd "$ROOT" || exit 2

MODE=tree RANGE=""
case "${1:-}" in
  "") ;;
  --range) MODE=range RANGE="${2:-}"; [[ -n $RANGE ]] || { echo "usage: $0 --range A..B" >&2; exit 2; } ;;
  --history) MODE=history ;;
  --staged) MODE=staged ;;
  -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
  *) echo "usage: $0 [--range A..B | --history | --staged]" >&2; exit 2 ;;
esac

# rule-id <TAB> extended regex (POSIX ERE: no \b, no lazy quantifiers).
IFS= read -r -d '' RULES <<'EOF' || true
private-key	-----BEGIN ([A-Z]+ )?PRIVATE KEY-----
cloudflared-cert	-----BEGIN ARGO TUNNEL TOKEN-----
aws-access-key	(A3T[A-Z0-9]|AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[A-Z0-9]{16}
github-token	(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,}
npm-token	npm_[A-Za-z0-9]{36}
slack-token	xox[abposr]-[A-Za-z0-9-]{10,}
google-api-key	AIza[0-9A-Za-z_-]{35}
stripe-key	(sk|rk)_live_[0-9A-Za-z]{20,}
cloudflare-api-token	(CF_API_TOKEN|CLOUDFLARE_API_TOKEN|CF_API_KEY)["']?[[:space:]]*[:=][[:space:]]*["']?[A-Za-z0-9_-]{30,}
cloudflared-tunnel-token	eyJhIjoi[A-Za-z0-9+/_-]{60,}
cloudflared-credentials	"TunnelSecret"[[:space:]]*:[[:space:]]*"[A-Za-z0-9+/=]{30,}"
ct-session-secret	(SESSION_SECRET|TICKET_SECRET|PASSPHRASE_PEPPER)["']?[[:space:]]*[:=][[:space:]]*["'`]?[A-Za-z0-9+/_=-]{16,}
ct-livekit-secret	LIVEKIT_API_SECRET["']?[[:space:]]*[:=][[:space:]]*["'`]?[A-Za-z0-9+/_=-]{20,}
ct-livekit-key	LIVEKIT_API_KEY["']?[[:space:]]*[:=][[:space:]]*["'`]?API[A-Za-z0-9]{8,}
ct-admin-ids	ADMIN_ACCOUNT_IDS["']?[[:space:]]*(=[[:space:]]*["']?|:[[:space:]]*["'`])[A-Za-z0-9_-]{6,}
ct-tailnet-name	[a-z0-9][a-z0-9-]*\.tail[0-9a-f]{4,}\.ts\.net
ct-cgnat-ip	(^|[^0-9.])100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]{1,3}\.[0-9]{1,3}([^0-9]|$)
ct-home-path	/(home|Users)/[a-z_][a-z0-9_-]{1,31}(/|[^a-z0-9_-]|$)
EOF

# Exact fake / placeholder values that are allowed (ERE, matched against the whole line).
ALLOW='APIe2efakekey|APIqafakekey|APIperffake|perfkey|playtestkey|worldauditkey|perf-secret-0123456789abcdef0123456789abcdef|playtest-secret-0123456789abcdef0123456789|world-audit-secret-0123456789abcdef0123|leak-secret-leak-secret-0123456789|voice-test-secret-voice-test-secret-0123456789|fake-secret-fake-secret-fake-secret-0123456789|other-secret-other-secret-other-secret-xx|qa-fake-livekit-secret-0123456789abcdef0123456789|change-me-64-hex-chars|/(home|Users)/(<[^>]*>|user|USER|username|runner|node|ubuntu|clocktower|admin|you|me|example)([^a-z0-9_-]|$)|example\.ts\.net|AKIAIOSFODNN7EXAMPLE'
# Paths never scanned (lockfile hashes, binary art, this scanner and the gitleaks config).
SKIP_PATHS='(^|/)pnpm-lock\.yaml$|(^|/)\.gitleaks\.toml$|(^|/)scripts/secret-scan\.sh$|\.(png|webp|jpe?g|gif|ico|woff2?|ttf|otf|mp3|ogg|wav|pdf|zip|gz)$'

TMP=$(mktemp -d "${TMPDIR:-/tmp}/secret-scan.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT
LINES="$TMP/lines" # format: <where>\t<text>

# Turn `git diff/log -p` output into "<commit>:<path>\t<added line>" records.
added_lines() {
  awk -v skip="$SKIP_PATHS" '
    /^commit [0-9a-f]{40}/ { c = substr($2, 1, 12); next }
    /^\+\+\+ / { p = substr($0, 5); sub(/^b\//, "", p); s = (p ~ skip); next }
    /^\+/ && !s { print (c != "" ? c ":" : "") p "\t" substr($0, 2) }
  '
}

case $MODE in
  tree)
    git ls-files -z | while IFS= read -r -d '' f; do
      [[ -f $f ]] || continue
      [[ $f =~ $SKIP_PATHS ]] && continue
      grep -Iq . "$f" 2>/dev/null || continue # skip binary / empty
      awk -v f="$f" '{ print f ":" NR "\t" $0 }' "$f"
    done >"$LINES"
    ;;
  range)
    git rev-parse --verify --quiet "${RANGE##*..}^{commit}" >/dev/null || { echo "secret-scan: bad range $RANGE" >&2; exit 2; }
    git log -p --no-color --no-ext-diff --format='commit %H' "$RANGE" -- | added_lines >"$LINES"
    ;;
  history)
    git log -p --no-color --no-ext-diff --all --format='commit %H' -- | added_lines >"$LINES"
    ;;
  staged)
    git diff --cached -p --no-color --no-ext-diff | added_lines >"$LINES"
    ;;
esac

FOUND=0
while IFS=$'\t' read -r id re; do
  [[ -n $id ]] || continue
  # Search the text column only, then drop allowlisted lines.
  hits=$(awk -F'\t' '{ print }' "$LINES" | cut -f2- | grep -n -E -e "$re" 2>/dev/null | grep -v -E -e "$ALLOW" || true)
  [[ -n $hits ]] || continue
  while IFS= read -r h; do
    n=${h%%:*}
    where=$(sed -n "${n}p" "$LINES" | cut -f1)
    text=${h#*:}
    # Mask the middle of long tokens so the report itself does not re-leak a value.
    masked=$(printf '%s' "$text" | cut -c1-160 | sed -E 's/([A-Za-z0-9+\/=-]{4})[A-Za-z0-9+\/=-]{14,}([A-Za-z0-9+\/=-]{2})/\1…\2/g')
    printf '%-26s %s  %s\n' "$id" "$where" "$masked"
    FOUND=$((FOUND + 1))
  done <<<"$hits"
done <<<"$RULES"

if [[ $FOUND -gt 0 ]]; then
  echo "secret-scan: $FOUND finding(s) ($MODE${RANGE:+ $RANGE}). Remove the value, or extend the allowlist in" >&2
  echo "  scripts/secret-scan.sh and .gitleaks.toml if it is a deliberate fake test value." >&2
  exit 1
fi
echo "secret-scan: clean ($MODE${RANGE:+ $RANGE}, $(wc -l <"$LINES" | tr -d ' ') lines)" >&2
exit 0
