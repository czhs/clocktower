#!/usr/bin/env bash
# v2.3 (sec-host) Prove the host-isolation walls on the game host from the INSIDE. Starts short-lived
# transient "twin" units with the same user + sandbox + egress properties as the real services (read
# from systemd, so drop-ins count; the nftables guard matches by user) and checks what they can and
# cannot do. Changes nothing. Needs sudo (systemd-run as another user).
#
#     sudo bash scripts/verify-sandbox.sh        # exit 0 only if every wall holds
#
# Before deploy/secure/v2.3/apply.sh --apply, the HOST-01/02/03/12 checks are EXPECTED to fail (that is
# the proof of the gap); afterwards every line must say PASS.
set -uo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }
ADMIN="${SUDO_USER:-}"
ADMIN_HOME=$(getent passwd "${ADMIN:-nobody}" | cut -d: -f6)
PASS=0; FAIL=0
pass() { printf '  PASS  %s\n' "$*"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL  %s\n' "$*"; FAIL=$((FAIL + 1)); }
R=/srv/clocktower
BUILD_RUN=/usr/local/sbin/ct-build-run

props() { # the real unit's sandbox/egress properties, one systemd-run argument per line
  local unit=$1 p v
  for p in User Group IPAddressDeny ProtectSystem ProtectHome PrivateTmp PrivateDevices ProtectProc NoNewPrivileges RestrictAddressFamilies; do
    v=$(systemctl show -P "$p" "$unit")
    [[ -n $v ]] && printf -- '-p\n%s=%s\n' "$p" "$v"
  done
  for v in $(systemctl show -P InaccessiblePaths "$unit"); do printf -- '-p\nInaccessiblePaths=%s\n' "$v"; done
}
twin() { # twin <unit> <bash snippet> [args...]  -> output of the snippet run inside a twin of <unit>
  local unit=$1 snippet=$2; shift 2
  local P; mapfile -t P < <(props "$unit")
  timeout 40 systemd-run --quiet --wait --pipe --collect "${P[@]}" /bin/bash -c "$snippet" _ "$@" </dev/null 2>&1
}
build_twin() { local snippet=$1; shift; timeout 40 "$BUILD_RUN" verify-sandbox bash -c "$snippet" _ "$@" </dev/null 2>&1; }
cant() { if twin "$1" "$2" >/dev/null; then fail "$3"; else pass "$3"; fi; }
can() { if twin "$1" "$2" >/dev/null; then pass "$3"; else fail "$3"; fi; }
# TCP reachability: a completed connect or "Connection refused" means the packet got there. EPERM
# (IPAddressDeny), "No route to host" / "Permission denied" (nft admin-prohibited) or a timeout = blocked.
TCP='out=$(timeout 4 bash -c "exec 3<>/dev/tcp/$1/$2" 2>&1) && echo CONNECTED || echo "$out"'
reach() { twin "$1" "$TCP" "$2" "$3" | grep -qE 'CONNECTED|refused'; }
blocked() { if reach "$1" "$2" "$3"; then fail "$4"; else pass "$4"; fi; }
open_() { if reach "$1" "$2" "$3"; then pass "$4"; else fail "$4"; fi; }
build_reach() { build_twin "$TCP" "$1" "$2" | grep -qE 'CONNECTED|refused'; }

echo "== identities (HOST-01)"
U_PROD=$(systemctl show -P User clocktower-prod); U_DEV=$(systemctl show -P User clocktower-dev); U_TUN=$(systemctl show -P User clocktower-tunnel)
echo "  prod=$U_PROD dev=$U_DEV tunnel=$U_TUN"
if [[ -n $U_PROD && $U_PROD != "$U_DEV" && $U_PROD != "$U_TUN" && $U_DEV != "$U_TUN" ]]; then pass "three distinct service users"; else fail "services share a user"; fi
for u in $(printf '%s\n' "$U_PROD" "$U_DEV" "$U_TUN" | sort -u); do
  if id -nG "$u" 2>/dev/null | grep -qwE 'sudo|adm|lxd|docker|wheel'; then fail "$u is in an admin group"; else pass "$u has no admin groups"; fi
done
TPID=$(systemctl show -P MainPID clocktower-tunnel); DPID=$(systemctl show -P MainPID clocktower-dev); PPID_=$(systemctl show -P MainPID clocktower-prod)

echo "== filesystem walls (HOST-01)"
[[ -n $ADMIN_HOME ]] && cant clocktower-prod "ls $ADMIN_HOME" "prod cannot read the admin's home ($ADMIN_HOME)"
[[ -n $ADMIN_HOME ]] && cant clocktower-prod "cat $ADMIN_HOME/.ssh/authorized_keys" "prod cannot read the admin's SSH keys"
cant clocktower-prod "ls $R/env/" "prod cannot read the env files (secrets of both envs)"
cant clocktower-prod "ls $R/cloudflared/" "prod cannot list the tunnel credentials"
[[ $TPID != 0 ]] && cant clocktower-prod "ls /proc/$TPID/root$R/cloudflared/" "prod cannot list them via /proc/<cloudflared>/root"
[[ $DPID != 0 ]] && cant clocktower-prod "head -c1 /proc/$DPID/environ" "prod cannot read dev's environment"
[[ $DPID != 0 ]] && cant clocktower-prod "ls /proc/$DPID/root$R/data/dev/" "prod cannot list dev's data via /proc/<dev>/root"
[[ $PPID_ != 0 ]] && cant clocktower-dev "head -c1 /proc/$PPID_/environ" "dev cannot read prod's environment (secrets)"
[[ $PPID_ != 0 ]] && cant clocktower-dev "ls /proc/$PPID_/root$R/data/prod/" "dev cannot list prod's data via /proc/<prod>/root"
[[ $PPID_ != 0 ]] && cant clocktower-tunnel "ls /proc/$PPID_/root$R/data/prod/" "the tunnel cannot list prod's data"
cant clocktower-prod "touch $R/releases/.probe" "prod cannot write the code"
cant clocktower-prod "touch /etc/.probe" "prod cannot write the system"

echo "== network walls (HOST-02)"
GW=$(ip -4 route show default | awk '{print $3; exit}')
[[ -n $GW ]] && blocked clocktower-prod "$GW" 80 "prod cannot reach the router / LAN ($GW)"
TSIP=$(tailscale ip -4 2>/dev/null | head -1)
[[ -n $TSIP ]] && blocked clocktower-prod "$TSIP" 22 "prod cannot reach the tailnet (this host's tailnet address)"
blocked clocktower-prod 127.0.0.1 11434 "prod cannot reach other local services (127.0.0.1:11434)"
blocked clocktower-prod 127.0.0.1 20241 "prod cannot reach cloudflared metrics (127.0.0.1:20241)"
blocked clocktower-prod 127.0.0.1 631 "prod cannot reach the printer service (127.0.0.1:631)"
blocked clocktower-prod 127.0.0.1 3001 "prod cannot reach dev (127.0.0.1:3001)"
blocked clocktower-dev 127.0.0.1 3000 "dev cannot reach prod (127.0.0.1:3000)"
blocked clocktower-tunnel 127.0.0.1 3001 "the tunnel cannot reach dev (127.0.0.1:3001)"
[[ -n $GW ]] && blocked clocktower-tunnel "$GW" 80 "the tunnel cannot reach the router / LAN"
cant clocktower-prod "test -S /run/tailscale/tailscaled.sock" "prod cannot see the tailscaled control socket"
open_ clocktower-tunnel 127.0.0.1 3000 "the tunnel CAN reach prod (127.0.0.1:3000)"
open_ clocktower-tunnel region1.v2.argotunnel.com 7844 "the tunnel CAN reach the Cloudflare edge (:7844)"
can clocktower-prod "getent hosts clocktower.chrisshi.com" "prod CAN resolve DNS"
LKHOST=$(grep -h '^LIVEKIT_URL=' $R/env/prod.env 2>/dev/null | head -1 | cut -d= -f2- | sed -E 's#^wss?://##; s#^https?://##; s#/.*##')
open_ clocktower-prod "${LKHOST:-cloud.livekit.io}" 443 "prod CAN reach LiveKit Cloud (:443)"

echo "== core dumps (HOST-03)"
for u in clocktower-prod clocktower-dev clocktower-tunnel; do
  [[ $(systemctl show -P LimitCORE $u) == 0 ]] && pass "$u LimitCORE=0" || fail "$u LimitCORE=$(systemctl show -P LimitCORE $u)"
done

echo "== build sandbox (HOST-12)"
if [[ -x $BUILD_RUN && $(stat -c %U:%a "$BUILD_RUN") == root:755 ]]; then
  pass "wrapper $BUILD_RUN is root-owned 0755"
  W=$(build_twin 'id -un')
  [[ $W == *ct-build* ]] && pass "builds run as ct-build" || fail "builds run as '${W:-?}'"
  if build_twin "ls ${ADMIN_HOME:-/home}" >/dev/null; then fail "build sandbox can read the admin's home"; else pass "build sandbox cannot read the admin's home"; fi
  if build_twin "sudo -n true" >/dev/null; then fail "build sandbox can sudo"; else pass "build sandbox cannot sudo"; fi
  if build_twin "touch $R/releases/.probe" >/dev/null; then fail "build sandbox can write the releases"; else pass "build sandbox cannot write the releases"; fi
  if build_twin "ls $R/env $R/data" >/dev/null; then fail "build sandbox can see secrets/data"; else pass "build sandbox cannot see env files or game data"; fi
  if build_reach 127.0.0.1 11434; then fail "build sandbox can reach 127.0.0.1:11434"; else pass "build sandbox cannot reach other local services"; fi
  if build_reach 127.0.0.1 3000; then fail "build sandbox can reach prod (127.0.0.1:3000)"; else pass "build sandbox cannot reach prod"; fi
  if [[ -n $GW ]] && build_reach "$GW" 80; then fail "build sandbox can reach the LAN"; else pass "build sandbox cannot reach the LAN"; fi
  if build_twin "$TCP" registry.npmjs.org 443 | grep -q CONNECTED; then pass "build sandbox CAN reach the npm registry"; else fail "build sandbox cannot reach the npm registry"; fi
  if id -nG ct-build | grep -qwE 'sudo|adm|lxd|docker|wheel'; then fail "ct-build is in an admin group"; else pass "ct-build has no admin groups"; fi
else
  fail "build sandbox wrapper not installed (deploy/secure/v2.3/apply.sh --apply)"
fi

echo "== systemd-analyze security (lower is better; 1.5 before v2.3)"
for u in clocktower-prod clocktower-dev clocktower-tunnel; do systemd-analyze security "$u.service" 2>/dev/null | tail -1; done

echo "result: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
