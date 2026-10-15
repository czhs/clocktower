#!/usr/bin/env bash
# Interactively store LiveKit credentials for ONE environment on hshi-u1 (lead-owned helper).
#   ssh -t hshi-u1 '~/clocktower/bin/set-livekit.sh prod'     (or: dev)
# Values are read from the terminal (secret hidden), written to ~/clocktower/env/<env>.env (0600),
# never echoed or logged. Only that environment's service is restarted.
set -euo pipefail
ENV_NAME="${1:-}"
[[ "$ENV_NAME" == dev || "$ENV_NAME" == prod ]] || { echo "usage: $0 dev|prod" >&2; exit 2; }
if [[ -d /srv/clocktower/env ]]; then FILE="/srv/clocktower/env/$ENV_NAME.env"; RESTART=(sudo -n /usr/bin/systemctl restart "clocktower-$ENV_NAME.service"); STATUS=(systemctl is-active "clocktower-$ENV_NAME.service")
else FILE="$HOME/clocktower/env/$ENV_NAME.env"; RESTART=(systemctl --user restart "clocktower-$ENV_NAME"); STATUS=(systemctl --user is-active "clocktower-$ENV_NAME"); fi
[[ -f "$FILE" ]] || { echo "missing $FILE" >&2; exit 1; }

read -r -p "LiveKit WebSocket URL (wss://….livekit.cloud): " URL
read -r -p "LiveKit API key: " KEY
read -r -s -p "LiveKit API secret (hidden): " SECRET; echo
DEFAULT_MIN=$([[ "$ENV_NAME" == prod ]] && echo 4500 || echo 500)
read -r -p "Monthly participant-minute budget for $ENV_NAME [$DEFAULT_MIN]: " MINUTES
MINUTES="${MINUTES:-$DEFAULT_MIN}"

[[ "$URL" =~ ^wss://[A-Za-z0-9.-]+$ ]] || { echo "URL must look like wss://name.livekit.cloud" >&2; exit 1; }
[[ "$KEY" =~ ^[A-Za-z0-9]+$ ]] || { echo "API key looks wrong (letters/digits only)" >&2; exit 1; }
[[ ${#SECRET} -ge 20 ]] || { echo "API secret looks too short" >&2; exit 1; }
[[ "$MINUTES" =~ ^[0-9]+$ ]] || { echo "minutes must be a number" >&2; exit 1; }

umask 077
TMP="$(mktemp "$FILE.XXXX")"
grep -vE '^(LIVEKIT_URL|LIVEKIT_API_KEY|LIVEKIT_API_SECRET|VOICE_MONTHLY_MINUTES)=' "$FILE" > "$TMP" || true
{
  printf 'LIVEKIT_URL=%s\n' "$URL"
  printf 'LIVEKIT_API_KEY=%s\n' "$KEY"
  printf 'LIVEKIT_API_SECRET=%s\n' "$SECRET"
  printf 'VOICE_MONTHLY_MINUTES=%s\n' "$MINUTES"
} >> "$TMP"
chmod 600 "$TMP"; mv "$TMP" "$FILE"
unset SECRET
echo "Saved to $FILE (0600). Restarting clocktower-$ENV_NAME only…"
"${RESTART[@]}"
sleep 2
"${STATUS[@]}"
echo "Done. (Room prefix for $ENV_NAME is pinned in the unit: $ENV_NAME rooms never mix with the other env.)"
