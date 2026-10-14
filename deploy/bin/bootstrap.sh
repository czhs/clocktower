#!/usr/bin/env bash
# Runs ON hshi-u1 (invoked by scripts/setup-hshi-u1.sh). Idempotent.
#  - creates ~/clocktower/{dev,releases,env,data/{dev,prod},logs/{dev,prod},backups/prod,bin}
#  - creates env/{dev,prod}.env (chmod 600) with secrets generated HERE via openssl; existing
#    files are never overwritten — only missing keys are appended. Secret values are never printed.
#  - installs the systemd --user units + backup script from the staging dir and daemon-reloads.
#  It does NOT start/restart the app services (deploy-hshi-u1.sh does that per environment).
set -euo pipefail
CT="$HOME/clocktower"
STAGE="${1:-$CT/.deploy-staging}"
PUBLIC_HOST="${CT_PUBLIC_HOST:-hshi-u1.tailf28040.ts.net}"

umask 077
mkdir -p "$CT"/{releases,env,bin,incoming} "$CT"/data/{dev,prod} "$CT"/logs/{dev,prod} "$CT"/backups/prod
chmod 700 "$CT/env" "$CT/data" "$CT/data/dev" "$CT/data/prod" "$CT/backups" "$CT/backups/prod"

# --- env files -------------------------------------------------------------------------------
# add_key FILE KEY VALUE  -> append KEY=VALUE only if KEY is absent.
add_key() {
  local f="$1" k="$2" v="$3"
  if ! grep -qE "^${k}=" "$f" 2>/dev/null; then printf '%s=%s\n' "$k" "$v" >>"$f"; echo "  + $k" >&2; fi
}
secret() { openssl rand -hex 32; }

for envname in dev prod; do
  f="$CT/env/$envname.env"
  [[ -f $f ]] || { : >"$f"; echo "[bootstrap] creating $f" >&2; }
  chmod 600 "$f"
  if [[ $envname == dev ]]; then
    port=3001 appenv=development origin="http://localhost:3001"
  else
    port=3000 appenv=production origin="https://${PUBLIC_HOST}"
  fi
  echo "[bootstrap] checking keys in env/$envname.env" >&2
  add_key "$f" APP_ENV "$appenv"
  add_key "$f" HOST 127.0.0.1
  add_key "$f" PORT "$port"
  add_key "$f" APP_PUBLIC_ORIGIN "$origin"
  add_key "$f" DATABASE_URL "file:$CT/data/$envname/clocktower.db"
  add_key "$f" SESSION_SECRET "$(secret)"
  add_key "$f" PASSPHRASE_PEPPER "$(secret)"
  add_key "$f" COOKIE_SECURE auto
  add_key "$f" SESSION_TTL_DAYS 30
  add_key "$f" LOBBY_MAX_COUNT 4
  add_key "$f" PLAYER_MAX_PER_LOBBY 15
  add_key "$f" LOBBY_IDLE_TIMEOUT_SEC 600
  add_key "$f" RECONNECT_GRACE_SEC 300
  add_key "$f" ADMIN_ACCOUNT_IDS ""
  add_key "$f" LIVEKIT_URL ""
  add_key "$f" LIVEKIT_API_KEY ""
  add_key "$f" LIVEKIT_API_SECRET ""
  add_key "$f" LIVEKIT_ROOM_PREFIX "$envname"
  add_key "$f" VOICE_MONTHLY_MINUTES 5000
  add_key "$f" LOG_DIR "$CT/logs/$envname"
done

# Sanity: dev and prod must never share secrets (compare hashes, never print values).
h() { grep -E "^$2=" "$CT/env/$1.env" | cut -d= -f2- | sha256sum | cut -c1-16; }
for k in SESSION_SECRET PASSPHRASE_PEPPER; do
  if [[ "$(h dev $k)" == "$(h prod $k)" ]]; then echo "[bootstrap] ERROR: $k identical in dev and prod" >&2; exit 1; fi
done

# --- units + scripts -------------------------------------------------------------------------
if [[ -d $STAGE ]]; then
  mkdir -p "$HOME/.config/systemd/user"
  install -m 644 "$STAGE"/systemd/*.service "$STAGE"/systemd/*.timer "$HOME/.config/systemd/user/"
  install -m 755 "$STAGE"/bin/backup-db.sh "$CT/bin/backup-db.sh"
  install -m 755 "$STAGE"/bin/install-release.sh "$CT/bin/install-release.sh"
  systemctl --user daemon-reload
  systemctl --user enable clocktower-dev.service clocktower-prod.service clocktower-backup.timer >/dev/null 2>&1 || true
  systemctl --user start clocktower-backup.timer
  echo "[bootstrap] units installed: $(ls "$HOME/.config/systemd/user" | grep clocktower | tr '\n' ' ')" >&2
fi
echo "[bootstrap] linger: $(loginctl show-user "$USER" -p Linger --value 2>/dev/null || echo unknown)" >&2
echo "[bootstrap] ok" >&2
