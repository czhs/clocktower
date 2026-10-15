# Clocktower Town v1.0.0

Public URL: https://clocktower.chrisshi.com (Cloudflare Tunnel → hshi-u1 prod, hardened `clocktower`
system user). Art: the original (pre-overhaul) town; the art/town overhaul ships in a later version.

## What's in v1

- **Accounts & lobbies:** passphrase-only accounts, villager picker (+ advanced customization), live
  lobby finder (search/filter), passwordless lobbies with share links, Ready/Start, rematch, reconnect
  with seat/role/house intact, duplicate-tab handling.
- **Landing & tour:** pixel-art landing screen (gpt-6-sol art), first-visit tour with real gameplay
  footage (re-record: `pnpm capture:tutorial`), How to play.
- **The town:** walk anywhere (WASD/touch joystick), doors and interiors, house compass, door tags
  (who's inside, daytime only), ambient sound + footsteps + cues (CC0, with volume sliders).
- **Voice (LiveKit):** square = everyone, street = proximity falloff, inside = private, night = home
  only, Storyteller visits private; heard-by / muted / on-air indicators; reconnect handling.
- **Trouble Brewing:** all 22 roles, setup 5–15 (Baron), night orders, Storyteller-in-the-loop info,
  poison/drunk, star-pass, Scarlet Woman, Virgin, Slayer, Saint, Mayor, ghost votes, win confirmation.
- **Storyteller assistant:** Now strip (next action), visit checklist with suggested info, grimoire
  badges, seat-circle stage map, every state editable ("props": force phase, votes, block, executions,
  teleport/walk/freeze, door locks, timers, settings), two-click confirms with "who sees this", undo.
- **Social staging:** bedtime bell → everyone walks home (server escort for stragglers) → night;
  mornings walk out; Gather → voting circle with clock hand, early hand-raising, adjustable vote clock.
- **Reliability & safety:** server/client dead-feed watchdogs, rate limits, strict CSP/HSTS, no
  hidden info in any player's stream (tested), prod deploy refuses while a game is running.

## Verified (see docs/test-results.md)

Typecheck/build/534 unit-integration-security tests on the exact release tree; full 1 ST + 5 player
game through the real browser UI (30 steps) and the chaos suite; public endpoint smoke test.

## Not in v1 / known limits

- Art overhaul, 2× remaster, CMU easter eggs (pending re-integration with the new town).
- Not yet tested by humans: real microphones, real Safari/iOS, a 10–15 person game on real machines.
- Slow devices may take a while to load the town after joining (no loading indicator yet).
