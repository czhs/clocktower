# v2.3 security hardening — summary

_Published with the v2.3 release, after the fixes were deployed. Detailed per-area audit notes are kept
private by the maintainers; this page is the public summary._ To report a vulnerability, see
`SECURITY.md`.

## Goal and scope

Clocktower Town is a friends' game self-hosted on the maintainer's home machine behind a Cloudflare
Tunnel. The priority, in order:

1. **Keep the host machine and the home network safe** while a public game server runs on it.
2. Protect players' accounts and data.
3. Stop abuse that costs money (LiveKit voice minutes) or takes the server down.
4. Keep game secrets from modified clients — useful, but explicitly a lower priority than player
   experience. Botting / anti-automation is out of scope.

## Threat model (short)

| Who | Can do | Main defences |
|---|---|---|
| Internet scanner | Reach the public hostname through the tunnel only (no inbound ports) | Loopback-only services; `/internal/*` refused for tunnel traffic; strict headers/CSP; HTTP timeouts and connection caps |
| Any signed-up player | Send arbitrary WebSocket/HTTP messages | Zod validation of every client message; per-message rate limits; per-socket frame/byte budget before decoding; violation score → disconnect; per-viewer server projections |
| Abuser with many accounts / addresses | Flood sign-ins, sign-ups, lobbies, voice | Per-IP (IPv6 /64, /56, /48) and global budgets; bounded hashing queue; voice opt-in + caps; sign-up modes; suspend / network block; panic switches |
| Attacker who achieves code execution in the server | Pivot to the machine / network | Dedicated service users, systemd sandboxing, egress firewall to the LAN/tailnet/local services, no core dumps, separate build user (installer in `deploy/secure/v2.3/`, applied by the owner) |
| Malicious dependency / unreviewed branch | Run code during install/build | Frozen lockfile installs, minimum release age, strict dependency build scripts, removed unused prod dependency, build sandbox user, review-before-run rule |

## What changed (by area)

| Area | Highlights | Status |
|---|---|---|
| **Host safety** | Pre-decode frame/byte budget per socket (a flood is cut in ~1 s; legit peak traffic is far below the limits); `/healthz` no longer exposes the deployed commit (version on a loopback-only endpoint); a single uncaught error no longer ends every game; caps on lobby-list streams, sign-ups, record sizes; HTTP timeouts; disk usage in the admin overview. One reviewed installer (dry-run / apply / rollback) for separate service users, egress walls, core dumps off, tighter syscall filters and a sandboxed build user, plus a verifier that proves each wall | Fixed in code; host isolation ready for the owner's sudo run |
| **Repo & supply chain** | Secret scanning (gitleaks config, pre-push hook, CI), private infrastructure details moved out of the tracked tree, frozen installs, `minimumReleaseAge`, strict dependency builds, unused `@pm2/io` removed from production, triaged audit advisories, `.gitignore` coverage, `SECURITY.md`, Dependabot | Fixed (history not rewritten — it contained no credentials) |
| **Accounts & admin** | Sign-out / sign-out-everywhere / passphrase rotation / deletion now close live game connections and reconnect tokens; bounded hashing queue (a sign-in flood no longer blocks real users); IPv6 range limits; 90-day absolute session lifetime; one session per browser, per-account cap; self-service data export and account deletion (records scrubbed); admin idle timeout, re-authentication for dangerous actions, audited record views and refused admin attempts | Fixed |
| **Web client** | Strict CSP (exact LiveKit project + its regional fail-over hosts only), Trusted Types enforced, COOP/CORP, fuller Permissions-Policy, look-alike/invisible name protection, sanitised Storyteller text, combining-mark caps | Fixed |
| **Voice & cost** | Usage measured from LiveKit itself (not client reports); hard stop at the monthly cap; no voice token until "Enable voice"; per-process / per-lobby / per-IP caps; idle limits; usage alerts (log + optional webhook); orphan sweep; kill switch; room rotation on emptying and phase changes; Storyteller town announcements end by themselves (silence, 5-minute cap, nightfall, home visits) with a visible "you are announcing" bar | Fixed (one low-impact residual accepted, see below) |
| **Game secrecy** | Automatic games release night information at a fixed time (no role inference from timing); pending-game-end probe closed; dawn pins cleaned; abusive connections closed; interior coordinates clamped; a hostile-client test harness that generates malformed / oversized / out-of-phase / unauthorised cases for every client message type automatically | Fixed |
| **Ops & incidents** | Account suspension, network blocks, sign-up modes (open / invite code / closed), maintenance mode, close-all-lobbies, sign-everyone-out, voice kill switch — all live from the admin **Panic** tab; backups with 30-day retention and a pre-deploy bucket, failure marker, safe restore script; journald retention files; light in-lobby moderation (kick, mute, report with only the reporter's own chat context, slurs-only chat filter by default) | Fixed in code; host-side files ready for the owner's sudo run |
| **Settings** | One server settings registry: every security/cost knob above is a live, bounded, audited admin setting with safe fallbacks (env values lock a setting). Not switchable by design: per-viewer secrecy projections, admin authentication, CSRF/content-type checks, server-side validation. Player ⚙ Settings reorganised into grouped sections | Fixed |

## Accepted / residual risks

- Git history keeps some infrastructure names from before v2.3 (no credentials). Not rewritten.
- A modified voice client that legitimately joined a private room can keep re-joining it until the
  room empties, the phase changes or its token expires; it is repeatedly removed and logged. Accepted:
  closing it fully would interrupt honest players' conversations.
- The CSP allows LiveKit Cloud regional hosts so voice survives a region fail-over; exploiting that
  would first require script injection, which Trusted Types and the absence of HTML sinks prevent.
- Human-Storyteller pacing (when your own prompt arrives) is inherent to the game.

## Verification

Every change landed with tests (unit, integration, security suites and browser end-to-end tests run on
the host in a resource-capped sandbox). The release gate — typecheck, the full test suite and all
browser suites — is recorded in `docs/test-results.md` under "v2.3 release gate".
